"""Shell finite-element mesh of the hull for the browser impact solver.

Nodes are laid on the outside-of-wood surface with ~60 mm spacing in the
(x, girth-from-sheer) parameter plane, triangulated there (Delaunay) and
mapped to 3D, then mirrored to port and merged on the keel/stem line.
Each triangle gets a laminate class from where it sits on the boat.

Writes ../funky/canoe/models/fe_mesh.json (SI units: metres).
"""
import json
import os
import numpy as np
from scipy.spatial import Delaunay
import hull

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, '..', 'funky', 'canoe', 'models', 'fe_mesh.json')
H_TARGET = 80.0          # mm (sized so a run takes seconds in a browser)
DESIGN_DRAFT = 115.0     # mm, for the wetted (added-mass) flag

# Laminates, outside -> inside: (material, thickness mm)
LAYUPS = {
    'hull':     [('glass', 0.25), ('cedar', 6.35), ('glass', 0.25)],
    'bottom':   [('glass', 0.25), ('glass', 0.25), ('cedar', 6.35), ('glass', 0.25)],
    'gunwale':  [('glass', 0.25), ('cedar', 6.35), ('glass', 0.25)],
    'stem':     [('glass', 0.25), ('cedar', 6.35), ('glass', 0.25)],
}
# Extra beam-like members smeared into their band of elements: ash gunwales
# (inwale + outwale, 2 x 19 x 22 mm) and the cherry inner + outer stems
# (19 mm sided x 76 mm moulded). Added along-strip EA, EI and mass per metre.
MEMBERS = {
    'gunwale': dict(material='ash', area_mm2=2 * 19.05 * 22.2, I_mm4=2 * 19.05 * 22.2 ** 3 / 12),
    'stem': dict(material='cherry', area_mm2=19.05 * 76.2, I_mm4=19.05 * 76.2 ** 3 / 12),
}
# Engineering properties used by the page (MPa, kg/m3). Strengths are
# characteristic values; cedar is Western red cedar, L = along the strip.
MATERIALS = {
    'cedar': dict(E1=7700, E2=600, G12=650, nu12=0.38, rho=370,
                  Xt=45, Xc=31, Yt=1.6, Yc=3.4, S=6.0, name='Western red cedar'),
    'glass': dict(E1=17000, E2=17000, G12=3200, nu12=0.15, rho=1700,
                  Xt=250, Xc=200, Yt=250, Yc=200, S=50, name='6 oz E-glass / epoxy'),
    'ash':   dict(E1=12000, E2=1000, G12=900, nu12=0.37, rho=670,
                  Xt=100, Xc=50, Yt=6, Yc=8, S=13, name='White ash'),
    'cherry': dict(E1=10300, E2=900, G12=800, nu12=0.39, rho=560,
                   Xt=85, Xc=49, Yt=4, Yc=5, S=12, name='Black cherry'),
}


def build_half():
    G = hull.girth
    H = hull.H
    pts = []
    # rows of constant girth from the sheer, like the strips
    G0 = float(G(0.0))
    srows = np.arange(0, G0, H_TARGET)
    for s in srows:
        X = float(hull.girth_extent(s))
        n = max(2, int(np.ceil(2 * X / H_TARGET)))
        for x in np.linspace(-X, X, n + 1)[1:-1] if s > 0 else np.linspace(-X, X, n + 1):
            pts.append((x, s))
    # centreline (keel + stem) boundary: s = G(x)
    t = np.linspace(-1, 1, 2001)
    xs = H * np.sign(t) * (1 - (1 - np.abs(t)) ** 1.3)
    cl = np.stack([xs, G(xs)], -1)
    d = np.r_[0, np.cumsum(np.hypot(*np.diff(cl, axis=0).T))]
    m = int(d[-1] / (H_TARGET * 0.8))
    dq = np.linspace(0, d[-1], m)
    clq = np.stack([np.interp(dq, d, cl[:, 0]), np.interp(dq, d, cl[:, 1])], -1)
    keep = [p for p in pts if p[1] < float(G(p[0])) - 0.45 * H_TARGET]
    P = np.vstack([np.array(keep), clq])
    tri = Delaunay(P)
    T = tri.simplices
    c = P[T].mean(1)
    ok = c[:, 1] < G(c[:, 0]) + 1e-6
    # drop slivers along the boundary
    u, v = P[T[:, 1]] - P[T[:, 0]], P[T[:, 2]] - P[T[:, 0]]
    A = 0.5 * np.abs(u[:, 0] * v[:, 1] - u[:, 1] * v[:, 0])
    ok &= A > 0.05 * H_TARGET ** 2
    T = T[ok]
    used = np.unique(T)
    remap = -np.ones(len(P), int); remap[used] = np.arange(len(used))
    return P[used], remap[T]


def main():
    P, T = build_half()
    X3 = hull.surface(P[:, 0], P[:, 1], 1)
    # mirror to port, merging nodes on the centreline
    on_cl = np.abs(X3[:, 1]) < 0.5
    n = len(X3)
    port_idx = np.where(on_cl, np.arange(n), n + np.cumsum(~on_cl) - 1)
    Xp = X3[~on_cl] * [1, -1, 1]
    nodes = np.vstack([X3, Xp])
    Tp = port_idx[T][:, ::-1]
    tris = np.vstack([T, Tp])
    param = np.vstack([P, P[~on_cl]])
    side = np.r_[np.ones(n), -np.ones((~on_cl).sum())]
    side[np.r_[on_cl, np.zeros((~on_cl).sum(), bool)]] = 0

    G = hull.girth(param[:, 0])
    frac = param[:, 1] / np.maximum(G, 1e-6)
    # element classes
    cen = nodes[tris].mean(1)
    pc = param[tris].mean(1)
    fc = pc[:, 1] / np.maximum(hull.girth(pc[:, 0]), 1e-6)
    cls = np.array(['hull'] * len(tris), dtype=object)
    cls[(np.abs(cen[:, 0]) < 1300) & (fc > 0.55)] = 'bottom'
    cls[pc[:, 1] < 45] = 'gunwale'
    near_cl = (hull.girth(pc[:, 0]) - pc[:, 1]) < 70
    cls[near_cl & (np.abs(cen[:, 0]) > hull.H - 500)] = 'stem'
    wet = nodes[:, 2] < DESIGN_DRAFT

    edges = np.sort(np.vstack([tris[:, [0, 1]], tris[:, [1, 2]], tris[:, [2, 0]]]), 1)
    el = np.linalg.norm(nodes[edges[:, 0]] - nodes[edges[:, 1]], axis=1)
    out = dict(
        units='m', nodes=np.round(nodes / 1000, 5).tolist(), tris=tris.tolist(),
        elemClass=cls.tolist(), wet=wet.astype(int).tolist(),
        # unrolled coordinates for the damage map: x along the boat (m) and
        # +/-(1 - girth fraction), so the keel line is 0 and the sheers +/-1
        unroll=np.round(np.stack([nodes[:, 0] / 1000, side * (1 - frac)], -1), 4).tolist(),
        layups=LAYUPS, members=MEMBERS, materials=MATERIALS,
        seats=dict(bow=(hull.H - 1000) / 1000, stern=-(hull.H - 780) / 1000, yoke=0.0),
        hull=dict(L=hull.L / 1000, LOA=hull.LOA / 1000, sheer_mid=float(hull.z_sheer(0)) / 1000,
                  draft=DESIGN_DRAFT / 1000))
    with open(OUT, 'w') as fh:
        json.dump(out, fh, separators=(',', ':'))
    print(f'nodes {len(nodes)}  tris {len(tris)}  edge min {el.min():.1f} mean {el.mean():.1f} max {el.max():.1f} mm')
    print({c: int((cls == c).sum()) for c in LAYUPS})


if __name__ == '__main__':
    main()
