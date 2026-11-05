"""Tune hull shape parameters so hydrostatics match the published Nomad 17."""
import json
import numpy as np
from scipy.optimize import minimize
import hull, hydro

T = hull.NOMAD
QUARTER_BEAM = 0.82  # typical of Prospector-family lines
KEYS = ['q', 'r', 'n0', 'n1', 'D0', 'D1', 'R', 'a', 'b']
BOUNDS = dict(q=(1.2, 4.0), r=(0.8, 3.0), n0=(2.0, 3.5), n1=(0.3, 2.2), D0=(150, 300), D1=(0, 250), R=(10, 70),
              a=(450, 900), b=(450, 600))


def loss(v):
    hull.set_params(**dict(zip(KEYS, v)))
    h = hydro.hydrostatics(T['draft'])
    terms = [
        (h['displacement_kg'] / T['displacement_kg'] - 1),
        (h['Cp'] / T['cp'] - 1),
        (h['wetted_m2'] / T['wetted_m2'] - 1),
        (h['Bwl'] / T['beam_wl'] - 1),
        # keep a canoe-like plan: half-beam at the quarter points ~82% of max
        2.0 * (float(hull.half_beam_max(hull.H / 2)) / hull.P['Bm'] - QUARTER_BEAM),
    ]
    pen = sum(max(0, lo - x) + max(0, x - hi) for x, (lo, hi) in
              ((x, BOUNDS[k]) for k, x in zip(KEYS, v)))
    return float(sum(t * t for t in terms) + pen)


if __name__ == '__main__':
    x0 = [hull.P[k] for k in KEYS]
    hull.set_params(R=50.0)          # start with real rocker; see README
    x0 = [hull.P[k] for k in KEYS]
    res = minimize(loss, x0, method='Powell', bounds=[BOUNDS[k] for k in KEYS],
                   options=dict(maxfev=500, xtol=1e-3, ftol=1e-7))
    hull.set_params(**dict(zip(KEYS, res.x)))
    out = {k: round(float(v), 4) for k, v in zip(KEYS, res.x)}
    print(json.dumps(out))
    with open(hull.PARAMS_FILE, 'w') as fh:
        json.dump(out, fh, indent=1)
    print(json.dumps(hydro.hydrostatics(T['draft']), indent=1))
