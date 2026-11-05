"""Hydrostatics of the reconstructed hull, for checking against Nomad specs."""
import numpy as np
import trimesh
import hull

RHO_FRESH = 1000.0  # kg/m^3


def hull_mesh(nx=241, ns=81):
    """Closed-free outer surface mesh (both sides) of the outside of wood."""
    t = np.linspace(-1, 1, nx)
    xs = hull.H * np.sign(t) * (1 - (1 - np.abs(t)) ** 1.6)
    verts, faces = [], []
    off = 0
    for side in (1, -1):
        sig = np.linspace(0, 1, ns)
        X, S = np.meshgrid(xs, sig, indexing='ij')
        Sg = S * hull.girth(X)
        p = hull.surface(X, Sg, side).reshape(-1, 3)
        verts.append(p)
        for i in range(nx - 1):
            for j in range(ns - 1):
                a = off + i * ns + j; b = a + ns
                f = [[a, b, b + 1], [a, b + 1, a + 1]]
                if side < 0:
                    f = [ff[::-1] for ff in f]
                faces += f
        off += nx * ns
    return trimesh.Trimesh(np.vstack(verts), np.array(faces), process=True)


def hydrostatics(T=115.0, nx=601):
    t = np.linspace(-1, 1, nx)
    xs = hull.H * t
    A = np.zeros(nx); Bw = np.zeros(nx)
    for i, x in enumerate(xs):
        y, z = hull.section_yz(x, 1500)
        y, z = y[::-1], z[::-1]          # keel -> sheer
        m = z <= T
        if m.sum() < 2:
            continue
        zz = np.r_[z[m], T]; yy = np.r_[y[m], np.interp(T, z, y)]
        A[i] = 2 * np.trapezoid(yy, zz)
        Bw[i] = 2 * yy[-1]
    V = np.trapezoid(A, xs) * 1e-9                 # m^3
    wet = xs[A > 0]
    Lwl = (wet.max() - wet.min()) if len(wet) else 0
    Am = A.max()
    Cp = V * 1e9 / (Am * Lwl) if Lwl else 0
    m = hull_mesh()
    sub = m.slice_plane([0, 0, T], [0, 0, -1])
    WS = sub.area * 1e-6
    return dict(draft=T, volume_m3=V, displacement_kg=V * RHO_FRESH,
                Lwl=Lwl, Bwl=Bw.max(), Am_m2=Am * 1e-6, Cp=Cp, wetted_m2=WS)


if __name__ == '__main__':
    import json
    print(json.dumps(hydrostatics(), indent=1))
