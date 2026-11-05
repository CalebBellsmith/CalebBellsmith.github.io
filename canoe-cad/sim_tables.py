"""Physics tables for the live Flow mode of the website viewer.

For a range of total loads (canoe + paddlers + gear) this computes the
floating draft and the hydrostatics at that draft from the real hull surface,
then wave resistance over a range of speeds with Michell's thin-ship integral
(deep water). The browser interpolates these tables live; friction (ITTC-57),
form factor (Holtrop), side force and yaw moment (slender-body theory) are
cheap enough to evaluate in the page from the numbers stored here.

Writes ../funky/canoe/models/sim.json
"""
import json
import os
import numpy as np
import hull
import hydro

_MESH = hydro.hull_mesh()

G = 9.81
RHO_FRESH = 1000.0
CANOE_MASS = 27.0          # finished hull + outfitting, kg (README estimate)
SPEEDS = np.round(np.arange(0.2, 5.01, 0.1), 2)
LOADS = np.array([30, 60, 100, 140, 180, 220, 260, 300, 350, 400], float)  # total kg

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, '..', 'funky', 'canoe', 'models', 'sim.json')


def offsets(nx=601, nz=48, T=115.0):
    """Half-breadth y(x, z) below the waterline z = T (outside of wood).
    Returns x (mm), depth below waterline zeta <= 0 (mm), Y (mm)."""
    xs = np.linspace(-hull.H, hull.H, nx)
    zeta = -np.linspace(0, T, nz)[::-1]          # from -T to 0
    Y = np.zeros((nx, nz))
    for i, x in enumerate(xs):
        y, z = hull.section_yz(x, 800)
        o = np.argsort(z)
        zz, yy = z[o], y[o]
        zq = T + zeta
        Y[i] = np.where(zq >= zz[0], np.interp(zq, zz, yy), 0.0)
    return xs, zeta, Y


def hydro_at(T):
    xs, zeta, Y = offsets(T=T)
    dx = xs[1] - xs[0]
    area = 2 * np.trapezoid(Y, zeta, axis=1)              # section areas, mm^2
    vol = np.trapezoid(area, xs)                          # mm^3
    wet = area > 1e-6
    Lwl = xs[wet].max() - xs[wet].min()
    bwl = 2 * Y[:, -1]
    Bwl = bwl.max()
    Am = area.max()
    Cp = vol / (Am * Lwl)
    Awp = np.trapezoid(bwl, xs)
    lcb = np.trapezoid(area * xs, xs) / vol
    # local draft T(x) for slender-body side force / Munk moment
    Tx = np.array([(-(zeta[Y[i] > 0.5][0]) if (Y[i] > 0.5).any() else 0.0) for i in range(len(xs))])
    # wetted surface: area of the hull surface mesh below the waterline
    S = _MESH.slice_plane([0, 0, T], [0, 0, -1]).area
    return dict(T=T, vol=vol, Lwl=Lwl, Bwl=Bwl, Am=Am, Cp=Cp, Awp=Awp, lcb=lcb,
                S=S, lateral=np.trapezoid(Tx, xs), intT2=np.trapezoid(Tx ** 2, xs),
                xs=xs, zeta=zeta, Y=Y, bwl=bwl)


def draft_for(mass):
    target = mass / RHO_FRESH * 1e9
    lo, hi = 5.0, 300.0
    for _ in range(40):
        mid = 0.5 * (lo + hi)
        if hydro_at_vol(mid) < target:
            lo = mid
        else:
            hi = mid
    return 0.5 * (lo + hi)


def hydro_at_vol(T):
    xs, zeta, Y = offsets(nx=241, nz=24, T=T)
    return np.trapezoid(2 * np.trapezoid(Y, zeta, axis=1), xs)


def _filon(xs, g, k):
    """Integral of piecewise-linear g(x) * exp(i k x) over xs, exact per
    segment. g: (n_k, n_x), k: (n_k,). Returns complex (n_k,)."""
    h = np.diff(xs)[None, :]
    kk = k[:, None]
    x0 = xs[None, :-1]
    g0, g1 = g[:, :-1], g[:, 1:]
    kh = kk * h
    small = np.abs(kh) < 1e-3
    khs = np.where(small, 1.0, kh)
    e = np.exp(1j * khs)
    # int_0^1 exp(i kh s) ds and int_0^1 s exp(i kh s) ds
    I0 = np.where(small, 1 + 0.5j * kh, (e - 1) / (1j * khs))
    I1 = np.where(small, 0.5 + 1j * kh / 3, e / (1j * khs) + (e - 1) / khs ** 2)
    seg = h * np.exp(1j * kk * x0) * (g0 * (I0 - I1) + g1 * I1)
    return seg.sum(1)


def michell(xs, zeta, Y, U, nth=1500):
    """Michell's thin-ship integral, deep water. xs, zeta, Y in m; returns N.

    R = 4 rho g^2 / (pi U^2) * int_0^{pi/2} |P + iQ|^2 sec^3(th) d th,
    P + iQ = int int dY/dx exp(k0 sec^2 z) exp(i k0 sec x) dx dz.
    Integrating by parts in x (Y = 0 at the stems) gives |P+iQ| = k |F| with
    F = int int Y exp(a z) exp(i k x); the z-integral is done exactly per
    segment and the x-integral with Filon quadrature, so short waves at high
    th are handled properly."""
    if U <= 0:
        return 0.0
    k0 = G / U ** 2
    t = np.linspace(0, 1, nth)
    th = (np.pi / 2) * (1 - (1 - t) ** 2) * 0.9999
    sec = 1 / np.cos(th)
    k = k0 * sec
    a = k0 * sec ** 2
    # exact z weights for piecewise-constant Y on each depth segment
    z0, z1 = zeta[:-1], zeta[1:]
    Wz = (np.exp(np.outer(a, z1)) - np.exp(np.outer(a, z0))) / a[:, None]   # (nth, nseg)
    Ymid = 0.5 * (Y[:, :-1] + Y[:, 1:])                                      # (nx, nseg)
    Gx = Wz @ Ymid.T                                                         # (nth, nx)
    F = _filon(xs, Gx, k)
    f = (k ** 2) * np.abs(F) ** 2 * sec ** 3
    return 4 * RHO_FRESH * G ** 2 / (np.pi * U ** 2) * np.trapezoid(f, th)


def wigley_check():
    """Wigley parabolic hull L=1, B=0.1, T=0.0625: compare Cw with literature."""
    L, B, T = 1.0, 0.1, 0.0625
    xs = np.linspace(-L / 2, L / 2, 401)
    zeta = np.linspace(-T, 0, 60)
    X, Zt = np.meshgrid(xs, zeta, indexing='ij')
    Y = B / 2 * (1 - (2 * X / L) ** 2) * (1 - (Zt / T) ** 2)
    S = 0.661 * L * (2 * T + B) * 1.0  # approx wetted area of the Wigley hull ~0.1487
    S = 0.1487
    out = []
    for Fn in (0.2, 0.25, 0.3, 0.35, 0.4, 0.5):
        U = Fn * np.sqrt(G * L)
        R = michell(xs, zeta, Y, U, nth=2000)
        out.append((Fn, R / (0.5 * RHO_FRESH * U ** 2 * S)))
    return out


def form_factor(h):
    """Holtrop & Mennen (1982) 1+k1, with c14 = 1 (normal stern)."""
    L, B, T = h['Lwl'] / 1e3, h['Bwl'] / 1e3, h['T'] / 1e3
    vol = h['vol'] / 1e9
    Cp = h['Cp']
    lcb_pct = 100 * h['lcb'] / h['Lwl']
    LR = L * (1 - Cp + 0.06 * Cp * lcb_pct / (4 * Cp - 1))
    return 0.93 + 0.487118 * (B / L) ** 1.06806 * (T / L) ** 0.46106 * \
        (L / LR) ** 0.121563 * (L ** 3 / vol) ** 0.36486 * (1 - Cp) ** -0.604247


def main():
    loads = []
    for m in LOADS:
        T = draft_for(m)
        h = hydro_at(T)
        xs, zeta, Y = h['xs'] / 1e3, h['zeta'] / 1e3, h['Y'] / 1e3
        Rw = [michell(xs, zeta, Y, float(U)) for U in SPEEDS]
        # waterline outline (half-breadth at the surface) for the flow solver
        wl = [[round(float(x), 1), round(float(b) / 2, 1)] for x, b in
              zip(h['xs'][::5], h['bwl'][::5])]
        loads.append(dict(
            mass=float(m), draft=round(T, 2), volume_m3=h['vol'] / 1e9,
            Lwl=round(h['Lwl'], 1), Bwl=round(h['Bwl'], 1), Cp=round(h['Cp'], 4),
            Am_m2=h['Am'] / 1e6, S_m2=round(h['S'] / 1e6, 4), Awp_m2=h['Awp'] / 1e6,
            lcb=round(h['lcb'], 1), formFactor=round(form_factor(h), 4),
            lateral_m2=h['lateral'] / 1e6, intT2_m3=h['intT2'] / 1e9,
            Rw=[round(float(r), 4) for r in Rw], waterline=wl))
        print(f"mass {m:5.0f} kg  draft {T:6.1f} mm  S {h['S']/1e6:.3f} m2  Lwl {h['Lwl']:.0f}  "
              f"1+k {form_factor(h):.3f}  Rw@1.5 {Rw[13]:.2f} N  Rw@2.5 {Rw[23]:.2f} N")
    out = dict(
        note='Deep-water Michell wave resistance (N) per load; friction etc. computed in the page.',
        canoe_mass=CANOE_MASS, speeds=[float(s) for s in SPEEDS], loads=loads,
        hull=dict(L=hull.L, LOA=hull.LOA, Bmax=2 * hull.P['Bm']))
    with open(OUT, 'w') as fh:
        json.dump(out, fh)
    print('wrote', os.path.relpath(OUT, HERE))


if __name__ == '__main__':
    import sys
    if '--wigley' in sys.argv:
        for fn, cw in wigley_check():
            print(f'Fn {fn:.2f}  Cw {cw * 1e3:.3f} e-3')
    else:
        main()
