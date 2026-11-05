"""Collect the OpenFOAM double-body runs and calibrate the form factor.

For every finished case cfd/U*/ this reads the hull force (half model, x2),
compares it with ITTC-57 friction on the same wetted surface and water, and
writes the result into ../funky/canoe/models/sim.json under "cfd":
  formFactor  mean effective 1 + k from CFD (used by the Flow panel)
  holtrop     the textbook Holtrop-Mennen 1 + k at the same draft
  runs        U, total viscous drag, mass for each run
"""
import glob
import json
import os
import sys
import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.dirname(HERE))
import sim_tables  # noqa: E402

SIM = os.path.join(HERE, '..', '..', 'funky', 'canoe', 'models', 'sim.json')


def cell_count(case):
    log = os.path.join(case, 'log.checkMesh')
    if not os.path.exists(log):
        return None
    for line in open(log):
        if line.strip().startswith('cells:'):
            return int(line.split()[1])
    return None


def main():
    runs = []
    for case in sorted(glob.glob(os.path.join(HERE, 'U*'))):
        fd = os.path.join(case, 'postProcessing', 'forces', '0', 'force.dat')
        meta = os.path.join(case, 'case.json')
        if not (os.path.exists(fd) and os.path.exists(meta)):
            continue
        m = json.load(open(meta))
        rows = [l.split() for l in open(fd) if l.strip() and not l.startswith('#')]
        last = np.array(rows[-1], float)
        # convergence: spread of the last 200 iterations
        tail = np.array([float(r[1]) for r in rows[-200:]])
        R = 2 * last[1]
        Rp, Rv = 2 * last[4], 2 * last[7]
        h = sim_tables.hydro_at(m['draft_mm'])
        S = h['S'] / 1e6
        Lwl = h['Lwl'] / 1000
        Re = m['U'] * Lwl / m['nu']
        Cf = 0.075 / (np.log10(Re) - 2) ** 2
        q = 0.5 * m['rho'] * m['U'] ** 2
        k1 = R / (q * S * Cf)
        mass = h['vol'] / 1e9 * 1000.0         # same convention as the sim tables
        runs.append(dict(U=m['U'], R=round(R, 3), R_pressure=round(Rp, 3), R_viscous=round(Rv, 3),
                         formFactor=round(k1, 4), Re=Re, Cf=Cf, S_m2=S, mass=round(mass, 1),
                         iterations=len(rows), spread_pct=round(100 * np.ptp(tail) / abs(tail.mean()), 4),
                         cells=cell_count(case)))
        print(f"U {m['U']:.1f} m/s  R {R:.3f} N (pressure {Rp:.3f}, viscous {Rv:.3f})  "
              f"ITTC {q * S * Cf:.3f} N  1+k {k1:.4f}  Re {Re:.3g}")
    if not runs:
        print('no finished runs')
        return
    h = sim_tables.hydro_at(json.load(open(os.path.join(HERE, 'U1.5', 'case.json')))['draft_mm'])
    sim = json.load(open(SIM))
    sim['cfd'] = dict(
        formFactor=round(float(np.mean([r['formFactor'] for r in runs])), 4),
        holtrop=round(sim_tables.form_factor(h), 4),
        cells=f"{max(r['cells'] or 0 for r in runs) / 1e6:.2f} M",
        rho=998.2, nu=1.004e-6, runs=runs,
        method='simpleFoam, k-omega SST, Spalding wall functions, double body at 115 mm draft, quarter model',
    )
    with open(SIM, 'w') as fh:
        json.dump(sim, fh)
    print('form factor', sim['cfd']['formFactor'], 'holtrop', sim['cfd']['holtrop'])


if __name__ == '__main__':
    main()
