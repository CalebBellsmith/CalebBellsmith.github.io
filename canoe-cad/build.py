"""Build the Nomad 17 cedar-strip canoe and its building jig as B-rep solids.

Outputs (in ./out):
  canoe_hull_shell.step / .stl   strips + cherry inner/outer stems
  canoe_full.step / .stl         hull shell + gunwales, decks, seats, yoke, thwart
  canoe_on_molds.step / .stl     hull shell + inner stems on station molds,
                                 stem forms and strongback, upside down as built
  *.glb                          coloured meshes for the browser preview
  build_report.json              part list and key numbers for the write-up
"""
import json
import os
import shutil
import numpy as np
import trimesh
from build123d import (Solid, Wire, Face, Compound, Color, Vector, Location,
                       Plane, export_step, export_stl)
import hull

OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'out')
PREVIEW = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'preview')
# the funky side of the website serves these to its canoe tab
SITE_MODELS = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'funky', 'canoe', 'models')

# ---------------------------------------------------------------- materials
STRIP_W = 19.05        # 3/4" bead-and-cove strip
STRIP_T = 6.35         # 1/4"
LAM_T = 12.7           # cherry stem lamination
LAMS = 3
STEM_SIDED = 19.05     # stem width across the boat
MOLD_T = 19.05         # 3/4" plywood station molds and stem forms
STATION_SPACING = 304.8
N_STATIONS = 15        # stations -7 .. +7
STEM_AFT = 7 * STATION_SPACING + MOLD_T / 2 + 10   # stems/forms start aft of last mold
BASELINE = 700.0       # strongback top, measured up from the keel (upright frame)
SB_W, SB_H, SB_HALF_L = 190.0, 290.0, 2440.0
LEG_X, FLOOR_GAP = 1650.0, 380.0

# Strip colour order from the sheer up to the keel line, same on both sides.
# L = light cedar, D = dark (red) cedar. Light along the sheer, fading to dark
# toward the keel: strips 1-24 read off the build photos, 25-38 (still open
# in the photos) all dark.
STRIP_PATTERN = ('LLLLLLL'                 # 1-7   sheer band, all light
                 'DLDLLDLDLDLLDDLDD'       # 8-24  mixed, dark taking over
                 'DDDDDDDDDDDDDD')         # 25-38 keel area, all dark

COL = dict(
    L=(0.89, 0.76, 0.55),        # light cedar
    D=(0.47, 0.26, 0.15),        # dark red cedar
    cherry_a=(0.55, 0.25, 0.15), cherry_b=(0.63, 0.31, 0.19),
    ash=(0.89, 0.82, 0.69), cane=(0.84, 0.71, 0.47),
    ply=(0.76, 0.58, 0.36), spruce=(0.91, 0.84, 0.67),
)


def color(name):
    return Color(*COL[name])


# ---------------------------------------------------------------- helpers
def inner_points(x, s, side):
    """Inside of the strip planking (outside minus thickness along normal)."""
    p = hull.surface(x, s, side) - STRIP_T * hull.normal(x, s, side)
    y = p[..., 1]
    p[..., 1] = np.maximum(y, 0) if side > 0 else np.minimum(y, 0)
    p[..., 0] = np.clip(p[..., 0], -hull.H, hull.H)
    return p


def planarise(q):
    """Project the 4th corner of a quad onto the plane of the first three."""
    q = np.array(q, float)
    n = np.cross(q[1] - q[0], q[2] - q[0])
    nn = np.linalg.norm(n)
    if nn < 1e-9:
        return q
    n /= nn
    q[3] -= np.dot(q[3] - q[0], n) * n
    return q


def loft(sections):
    wires = [Wire.make_polygon([Vector(*map(float, p)) for p in sec], close=True)
             for sec in sections]
    return Solid.make_loft(wires, ruled=False)


def tag(shape, label, col):
    shape.label = label
    shape.color = color(col)
    shape.mat = col
    return shape


def u_samples(n):
    t = np.linspace(-1, 1, n)
    return np.sign(t) * (1 - (1 - np.abs(t)) ** 1.5)


# ---------------------------------------------------------------- strips
def strips():
    G0 = float(hull.girth(0.0))
    n = int(np.ceil(G0 / STRIP_W))
    if G0 - (n - 1) * STRIP_W < 4:            # avoid a hairline last strip
        n -= 1
    parts, info = [], []
    for side, sname in ((1, 'S'), (-1, 'P')):
        for j in range(n):
            s0 = j * STRIP_W
            s1 = (j + 1) * STRIP_W
            lens = j == n - 1                  # last strip closes on the keel line
            X0 = float(hull.girth_extent(s0))
            if lens:
                u = u_samples(45) * 0.995
                x = u * X0
                st = hull.girth(x) - 0.01
                sb = np.full_like(x, s0)
            else:
                u = u_samples(45)
                X1 = float(hull.girth_extent(s1))
                x0, x1 = u * X0, u * X1
            secs = []
            for i in range(len(u)):
                if lens:
                    xa = xb = x[i]; sa, sb_ = sb[i], st[i]
                else:
                    xa, xb, sa, sb_ = x0[i], x1[i], s0, s1
                oa = hull.surface(xa, sa, side); ob = hull.surface(xb, sb_, side)
                ia = inner_points(xa, sa, side); ib = inner_points(xb, sb_, side)
                q = np.array([oa, ob, ib, ia])
                if i in (0, len(u) - 1):
                    q = planarise(q)
                secs.append(q)
            c = STRIP_PATTERN[j % len(STRIP_PATTERN)]
            label = f'strip_{sname}{j + 1:02d}_{"light" if c == "L" else "dark"}'
            parts.append(tag(loft(secs), label, c))
            info.append(dict(label=label, side=sname, index=j + 1, cedar=c,
                             length_mm=round(2 * X0, 1)))
    return parts, dict(strips_per_side=n, midship_half_girth=round(G0, 1),
                       strips=info)


# ---------------------------------------------------------------- inner mesh
def inner_mesh(side=1, nx=401, ns=121):
    t = np.linspace(-1, 1, nx)
    xs = hull.H * np.sign(t) * (1 - (1 - np.abs(t)) ** 1.6)
    sig = np.linspace(0, 1, ns)
    X, Sg = np.meshgrid(xs, sig, indexing='ij')
    S = Sg * hull.girth(X)
    p = inner_points(X, S, side).reshape(-1, 3)
    f = []
    for i in range(nx - 1):
        for j in range(ns - 1):
            a = i * ns + j; b = a + ns
            f += [[a, b, b + 1], [a, b + 1, a + 1]]
    return trimesh.Trimesh(p, np.array(f), process=False)


def inner_section(x, ns=161):
    """Inside-of-planking half section at exactly station x (sheer -> keel)."""
    s = np.linspace(0, float(hull.girth(x)), ns)
    xx = np.full_like(s, x)
    for _ in range(3):                         # correct for normal's x-component
        p = inner_points(xx, s, 1)
        xx = xx - (p[:, 0] - x)
    p = inner_points(xx, s, 1)
    return p[:, 1], p[:, 2]


# ---------------------------------------------------------------- stems
def profile(end=1, n=90):
    """Outside-of-wood centreline profile at one end, from STEM_AFT to the
    stem head. Returns points (x, z), unit tangents and inward normals."""
    H = hull.H
    xs = np.linspace(STEM_AFT, H, n)
    pts = [(x, float(hull.z_keel(x))) for x in xs]
    ztop = float(hull.z_sheer(H))
    zH = pts[-1][1]
    for z in np.linspace(zH, ztop, 8)[1:]:
        pts.append((H, z))
    pts = np.array(pts)
    # resample evenly by arc length
    d = np.r_[0, np.cumsum(np.linalg.norm(np.diff(pts, axis=0), axis=1))]
    keep = np.r_[True, np.diff(d) > 1e-6]
    pts, d = pts[keep], d[keep]
    ds = np.linspace(0, d[-1], n)
    pts = np.stack([np.interp(ds, d, pts[:, 0]), np.interp(ds, d, pts[:, 1])], -1)
    tan = np.gradient(pts, axis=0)
    tan /= np.linalg.norm(tan, axis=1, keepdims=True)
    nin = np.stack([-tan[:, 1], tan[:, 0]], -1)   # rotate +90: points into hull
    if end < 0:
        pts[:, 0] *= -1; tan[:, 0] *= -1; nin[:, 0] *= -1
    return pts, tan, nin


def to3(p2, y=0.0):
    return np.array([p2[0], y, p2[1]])


def stem_halfwidth_fn(mesh, p, t, nin):
    """Half-width of the inside of the planking vs depth behind the profile,
    measured in the plane normal to the profile at p."""
    o = to3(p); nrm = np.array([t[0], 0, t[1]]); di = np.array([nin[0], 0, nin[1]])
    sec = mesh.section(plane_origin=o, plane_normal=nrm)
    if sec is None:
        return None
    q = sec.vertices
    rel = q - o
    q = q[(np.linalg.norm(rel, axis=1) < 150)]
    if len(q) < 3:
        return None
    dep = (q - o) @ di
    y = q[:, 1]
    m = y > 0.3
    if m.sum() < 2:
        return None
    order = np.argsort(dep[m])
    dd, yy = dep[m][order], y[m][order]
    yy = np.maximum.accumulate(yy)
    return lambda d: np.interp(d, dd, yy, left=0.0, right=yy[-1])


def stems(end, mesh):
    pts, tan, nin = profile(end)
    half = STEM_SIDED / 2
    inner = [[] for _ in range(LAMS)]
    outer = [[] for _ in range(LAMS)]
    back = []
    last = None
    # the outer stem fades out along the keel over the first third of its run
    arc = np.r_[0, np.cumsum(np.linalg.norm(np.diff(pts, axis=0), axis=1))]
    fade = np.clip(arc / (0.35 * arc[-1]), 0.03, 1.0)
    fade = 0.5 - 0.5 * np.cos(np.pi * fade)
    fade = np.maximum(fade, 0.03)
    for p, t, ni, fo in zip(pts, tan, nin, fade):
        f = stem_halfwidth_fn(mesh, p, t, ni) or last
        last = f
        dgrid = np.linspace(0, 120, 1201)
        w = f(dgrid)
        d0 = float(dgrid[np.argmax(w >= 0.5)])
        o = to3(p); di = np.array([ni[0], 0, ni[1]])
        for k in range(LAMS):
            da, db = d0 + k * LAM_T, d0 + (k + 1) * LAM_T
            wa = max(0.5, min(half, float(f(da))))
            wb = max(0.5, min(half, float(f(db))))
            inner[k].append([o + da * di + [0, -wa, 0], o + da * di + [0, wa, 0],
                             o + db * di + [0, wb, 0], o + db * di + [0, -wb, 0]])
            ea, eb = -k * LAM_T * fo, -(k + 1) * LAM_T * fo
            outer[k].append([o + ea * di + [0, -half, 0], o + ea * di + [0, half, 0],
                             o + eb * di + [0, half, 0], o + eb * di + [0, -half, 0]])
        back.append(o + (d0 + LAMS * LAM_T) * di)
    tagname = 'bow' if end > 0 else 'stern'
    ins = [tag(loft(inner[k]), f'inner_stem_{tagname}_lam{k + 1}',
               'cherry_a' if k % 2 == 0 else 'cherry_b') for k in range(LAMS)]
    outs = [tag(loft(outer[k]), f'outer_stem_{tagname}_lam{k + 1}',
                'cherry_a' if k % 2 == 0 else 'cherry_b') for k in range(LAMS)]
    return ins, outs, np.array(back)


# ---------------------------------------------------------------- jig
def extrude_profile(pts2, plane_axis, thickness):
    """Extrude a closed polygon. plane_axis 'x': pts are (y, z), extruded in x
    (centred); 'y': pts are (x, z), extruded in y (centred)."""
    if plane_axis == 'x':
        v = [Vector(-thickness / 2, a, b) for a, b in pts2]
        d = (thickness, 0, 0)
    else:
        v = [Vector(a, -thickness / 2, b) for a, b in pts2]
        d = (0, thickness, 0)
    face = Face(Wire.make_polygon(v, close=True))
    return Solid.extrude(face, d)


def station_molds():
    parts = []
    for i in range(-(N_STATIONS // 2), N_STATIONS // 2 + 1):
        x = i * STATION_SPACING
        y, z = inner_section(x)
        # starboard sheer -> keel, then port keel -> sheer, then up to baseline
        right = list(zip(y, z))
        left = [(-a, b) for a, b in right[::-1]][1:]
        poly = [(y[0], BASELINE)] + right + left + [(-y[0], BASELINE)]
        m = extrude_profile(poly, 'x', MOLD_T).moved(Location((x, 0, 0)))
        parts.append(tag(m, f'station_mold_{i:+d}', 'ply'))
    return parts


def stem_form(end, back):
    # back: inner stem back edge from aft (low) to stem head (high)
    xz = [(p[0], p[2]) for p in back]
    head = xz[-1]
    poly = xz + [(head[0], BASELINE), (xz[0][0], BASELINE)]
    f = extrude_profile(poly, 'y', MOLD_T)
    return tag(f, f'stem_form_{"bow" if end > 0 else "stern"}', 'ply')


def strongback():
    sb = Solid.make_box(2 * SB_HALF_L, SB_W, SB_H).moved(
        Location((-SB_HALF_L, -SB_W / 2, BASELINE)))
    parts = [tag(sb, 'strongback_box_beam', 'spruce')]
    top = BASELINE + SB_H
    for x in (-LEG_X, LEG_X):
        post = Solid.make_box(89, 89, FLOOR_GAP).moved(Location((x - 44.5, -44.5, top)))
        foot = Solid.make_box(89, 600, 38).moved(Location((x - 44.5, -300, top + FLOOR_GAP - 38)))
        parts += [tag(post, f'strongback_leg_{x:+.0f}', 'spruce'),
                  tag(foot, f'strongback_foot_{x:+.0f}', 'spruce')]
    return parts


# ---------------------------------------------------------------- outfitting
INWALE = (19.05, 22.2)   # width, depth
OUTWALE = (19.05, 22.2)


def sheer_plan(x):
    o = hull.surface(x, np.zeros_like(x), 1)
    i = inner_points(x, np.zeros_like(x), 1)
    return o, i


def gunwales():
    parts = []
    xs = hull.H * u_samples(61) * 0.985
    o, i = sheer_plan(xs)
    dy = np.gradient(o[:, 1], xs)
    nh = np.stack([-dy, np.ones_like(dy)], -1)
    nh /= np.linalg.norm(nh, axis=1, keepdims=True)    # outward, in plan (x, y)
    for side, sname in ((1, 'S'), (-1, 'P')):
        outw, inw = [], []
        for k in range(len(xs)):
            n2 = np.array([nh[k, 0], nh[k, 1] * side, 0.0])
            po = o[k] * [1, side, 1]; pi = i[k] * [1, side, 1]
            zt = po[2]
            a = po; b = po + OUTWALE[0] * n2
            outw.append([[a[0], a[1], zt], [b[0], b[1], zt],
                         [b[0], b[1], zt - OUTWALE[1]], [a[0], a[1], zt - OUTWALE[1]]])
            a = pi; b = pi - INWALE[0] * n2
            inw.append([[a[0], a[1], zt], [a[0], a[1], zt - INWALE[1]],
                        [b[0], b[1], zt - INWALE[1]], [b[0], b[1], zt]])
        parts.append(tag(loft(outw), f'outwale_{sname}', 'ash'))
        parts.append(tag(loft(inw), f'inwale_{sname}', 'ash'))
    return parts


def inner_halfwidth_at(x, z):
    y, zz = inner_section(x)
    o = np.argsort(zz)
    return float(np.interp(z, zz[o], y[o]))


def decks():
    parts = []
    for end in (1, -1):
        xs = np.linspace(hull.H - 400, hull.H - 20, 25)
        secs = []
        for x in xs:
            _, pi = sheer_plan(np.array([x]))
            w = float(pi[0, 1]) - INWALE[0]
            if w < 4:
                break
            zt = float(hull.z_sheer(x))
            secs.append([[end * x, -w, zt], [end * x, w, zt], [end * x, w, zt - 19.05],
                         [end * x, -w, zt - 19.05]])
        parts.append(tag(loft(secs), f'deck_{"bow" if end > 0 else "stern"}', 'ash'))
    return parts


def box(x0, x1, y0, y1, z0, z1):
    return Solid.make_box(x1 - x0, y1 - y0, z1 - z0).moved(Location((x0, y0, z0)))


def seat(xc, depth, drop, name):
    """Ash-framed cane seat hung on dowels from the inwales."""
    parts = []
    zs = float(hull.z_sheer(xc))
    ztop = zs - INWALE[1] - drop
    rail_w, rail_t = 44.5, 22.2
    for xr in (xc - depth / 2 + rail_w / 2, xc + depth / 2 - rail_w / 2):
        _, pi = sheer_plan(np.array([xr]))
        hw = min(float(pi[0, 1]) - INWALE[0] / 2 + 12,
                 inner_halfwidth_at(xr, ztop - rail_t) - 3)
        parts.append(tag(box(xr - rail_w / 2, xr + rail_w / 2, -hw, hw, ztop - rail_t, ztop),
                         f'{name}_rail_{"fwd" if xr > xc else "aft"}', 'ash'))
        for s in (1, -1):
            yh = s * (float(pi[0, 1]) - INWALE[0] / 2)
            cyl = Solid.make_cylinder(9.5, zs - INWALE[1] - ztop).moved(Location((xr, yh, ztop)))
            parts.append(tag(cyl, f'{name}_hanger_{"fwd" if xr > xc else "aft"}_{"S" if s > 0 else "P"}', 'ash'))
    _, pi = sheer_plan(np.array([xc]))
    hw = float(pi[0, 1]) - INWALE[0] / 2 - 60
    x0, x1 = xc - depth / 2 + rail_w, xc + depth / 2 - rail_w
    for s in (1, -1):
        parts.append(tag(box(x0, x1, s * hw - 22, s * hw + 22, ztop - rail_t, ztop),
                         f'{name}_side_{"S" if s > 0 else "P"}', 'ash'))
    parts.append(tag(box(x0, x1, -hw + 22, hw - 22, ztop - 6, ztop - 3), f'{name}_cane', 'cane'))
    return parts


def yoke_and_thwart():
    parts = []
    # contoured yoke at midships, under the inwales
    _, pi = sheer_plan(np.array([0.0]))
    hw = float(pi[0, 1]) - 3
    zs = float(hull.z_sheer(0.0))
    z0, z1 = zs - INWALE[1] - 19.05, zs - INWALE[1]
    ys = np.linspace(-hw, hw, 41)
    halfw = 37.5 - 12 * np.exp(-((np.abs(ys) - 110) / 45) ** 2) - 8 * np.exp(-(ys / 60) ** 2)
    outline = [(h, y) for y, h in zip(ys, halfw)] + [(-h, y) for y, h in zip(ys[::-1], halfw[::-1])]
    face = Face(Wire.make_polygon([Vector(a, b, z0) for a, b in outline], close=True))
    parts.append(tag(Solid.extrude(face, (0, 0, z1 - z0)), 'yoke', 'ash'))
    # thwart aft of the yoke
    xt = -760.0
    _, pi = sheer_plan(np.array([xt]))
    hw = float(pi[0, 1]) - 3
    zs = float(hull.z_sheer(xt))
    parts.append(tag(box(xt - 19, xt + 19, -hw, hw, zs - INWALE[1] - 22, zs - INWALE[1]),
                     'thwart', 'ash'))
    return parts


# ---------------------------------------------------------------- export
def flip_as_built(shapes):
    """Upside down on the strongback, floor at z = 0."""
    floor = BASELINE + SB_H + FLOOR_GAP
    out = []
    for s in shapes:
        m = s.rotate(hull_axis_x(), 180).moved(Location((0, 0, floor)))
        m.label, m.color, m.mat = s.label, s.color, s.mat
        out.append(m)
    return out


def hull_axis_x():
    from build123d import Axis
    return Axis.X


def to_trimesh(shapes, tol=0.4):
    meshes = []
    for s in shapes:
        v, f = s.tessellate(tol, 0.2)
        m = trimesh.Trimesh(np.array([[p.X, p.Y, p.Z] for p in v]), np.array(f), process=False)
        # glTF base colours are linear; COL holds sRGB
        srgb = np.array(COL[s.mat])
        lin = np.where(srgb <= 0.04045, srgb / 12.92, ((srgb + 0.055) / 1.055) ** 2.4)
        c = (lin * 255).round().astype(np.uint8)
        m.visual = trimesh.visual.TextureVisuals(material=trimesh.visual.material.PBRMaterial(
            baseColorFactor=list(c) + [255], roughnessFactor=0.7, metallicFactor=0.0))
        meshes.append((s.label, m))
    return meshes


def export(name, shapes):
    comp = Compound(children=shapes, label=name)
    export_step(comp, os.path.join(OUT, f'{name}.step'))
    tm = to_trimesh(shapes)
    allm = trimesh.util.concatenate([m for _, m in tm])
    allm.export(os.path.join(OUT, f'{name}.stl'))
    scene = trimesh.Scene()
    for label, m in tm:
        scene.add_geometry(m, node_name=label, geom_name=label)
    # glTF is y-up: rotate z-up -> y-up
    scene.apply_transform(trimesh.transformations.rotation_matrix(-np.pi / 2, [1, 0, 0]))
    scene.export(os.path.join(PREVIEW, f'{name}.glb'))
    shutil.copy(os.path.join(PREVIEW, f'{name}.glb'), SITE_MODELS)
    # same scene as self-contained glTF JSON (served where .glb is not)
    files = trimesh.exchange.gltf.export_gltf(scene, embed_buffers=True)
    with open(os.path.join(PREVIEW, f'{name}.gltf.json'), 'wb') as fh:
        fh.write(files['model.gltf'])
    return dict(parts=len(shapes), triangles=int(len(allm.faces)),
                bbox_mm=[[round(float(a), 1) for a in r] for r in allm.bounds])


def hexcol(name):
    return '#' + ''.join(f'{int(round(c * 255)):02x}' for c in COL[name])


def count(shapes):
    groups = {}
    for s in shapes:
        lab = s.label
        key = ('Cedar strips' if lab.startswith('strip_') else
               'Inner stem laminations' if lab.startswith('inner_stem') else
               'Outer stem laminations' if lab.startswith('outer_stem') else
               'Station molds' if lab.startswith('station_mold') else
               'Stem forms' if lab.startswith('stem_form') else
               'Strongback parts' if lab.startswith('strongback') else
               'Gunwales' if 'wale' in lab else
               'Decks' if lab.startswith('deck') else
               'Seat parts' if 'seat' in lab else
               'Yoke and thwart')
        groups[key] = groups.get(key, 0) + 1
    return groups


def write_spec(report, h, sinfo, shell, outfit, jig):
    N = hull.NOMAD
    n = sinfo['strips_per_side']
    sp = [s for s in shell if s.label.startswith('strip_')]
    sb = [s for s in shell if s.label.startswith(('inner_stem', 'outer_stem'))]
    spec = dict(
        hydro=[
            ['Length over stems', f"{N['L']:.0f}", f"{hull.LOA:.0f}"],
            ['Beam, max', f"{N['beam_max']}", f"{2 * hull.P['Bm']:.0f}"],
            ['Beam, waterline', f"{N['beam_wl']}", f"{h['Bwl']:.0f}"],
            ['Depth, centre', f"{N['depth_centre']}", f"{float(hull.z_sheer(0)):.0f}"],
            ['Bow height', f"{N['bow_height']}", f"{float(hull.z_sheer(hull.H)):.0f}"],
            ['Displacement, kg', f"{N['displacement_kg']}", f"{h['displacement_kg']:.1f}"],
            ['Prismatic coeff.', f"{N['cp']:.3f}", f"{h['Cp']:.3f}"],
            ['Wetted surface, m²', f"{N['wetted_m2']:.2f}", f"{h['wetted_m2']:.2f}"],
            ['Waterline length', '–', f"{h['Lwl']:.0f}"],
        ],
        pattern=STRIP_PATTERN[:n],
        strip=f'{STRIP_T} × {STRIP_W} mm bead and cove',
        colors=dict(L=hexcol('L'), D=hexcol('D')),
        legend=[['Light cedar strips', hexcol('L')], ['Dark red cedar strips', hexcol('D')],
                ['Cherry stems, 3 + 3 laminations', hexcol('cherry_b')],
                ['Ash gunwales, decks, seats, yoke, thwart', hexcol('ash')],
                ['Cane seat panels', hexcol('cane')], ['Plywood molds and stem forms', hexcol('ply')],
                ['Spruce strongback', hexcol('spruce')]],
        views=dict(canoe_hull_shell=count(shell), canoe_full=count(shell + outfit),
                   canoe_on_molds=count([s for s in shell if not s.label.startswith('outer_stem')] + jig)),
        masses_kg=dict(cedar=round(sum(s.volume for s in sp) * 1e-9 * 370, 1),
                       cherry=round(sum(s.volume for s in sb) * 1e-9 * 560, 1)),
    )
    for d in (PREVIEW, SITE_MODELS):
        with open(os.path.join(d, 'spec.json'), 'w') as fh:
            json.dump(spec, fh, indent=1)


def main():
    os.makedirs(OUT, exist_ok=True)
    os.makedirs(PREVIEW, exist_ok=True)
    os.makedirs(SITE_MODELS, exist_ok=True)
    report = dict(hull_params={k: round(float(v), 4) for k, v in hull.P.items()})
    print('strips...', flush=True)
    sp, sinfo = strips()
    report['strips'] = sinfo
    print('stems...', flush=True)
    mesh = inner_mesh()
    ib, ob, back_b = stems(1, mesh)
    is_, os_, back_s = stems(-1, mesh)
    shell = sp + ib + ob + is_ + os_
    print('outfitting...', flush=True)
    outfit = gunwales() + decks() + seat(hull.H - 1000, 280, 70, 'bow_seat') + \
        seat(-(hull.H - 780), 250, 60, 'stern_seat') + yoke_and_thwart()
    print('jig...', flush=True)
    jig = station_molds() + [stem_form(1, back_b), stem_form(-1, back_s)] + strongback()
    print('export...', flush=True)
    report['hull_shell'] = export('canoe_hull_shell', shell)
    report['full'] = export('canoe_full', shell + outfit)
    report['on_molds'] = export('canoe_on_molds',
                                flip_as_built(sp + ib + is_ + jig))
    import hydro
    h = hydro.hydrostatics(hull.NOMAD['draft'])
    report['hydrostatics'] = h
    write_spec(report, h, sinfo, shell, outfit, jig)
    with open(os.path.join(OUT, 'build_report.json'), 'w') as fh:
        json.dump(report, fh, indent=1)
    print(json.dumps({k: v for k, v in report.items() if k != 'strips'}, indent=1))


if __name__ == '__main__':
    main()
