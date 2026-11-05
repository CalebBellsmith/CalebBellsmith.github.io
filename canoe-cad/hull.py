"""Nomad 17 hull lines, reconstructed from published dimensions.

Coordinates (mm): x along the boat (0 = midships, +x = bow), y to starboard,
z up, z = 0 at the bottom of the keel line amidships. The surface defined
here is the OUTSIDE of the wood (cedar strips), before fibreglass.

The hull is described by:
  * a keel + stem profile z_k(x) (rocker, then an elliptical forefoot that
    turns vertical at the stem),
  * a sheer height z_s(x),
  * per-station superellipse sections between keel and max-beam height,
    with tumblehome between max beam and the sheer.
Section shape parameters vary smoothly from midships to the ends.
"""
import json
import os
import numpy as np
from scipy.interpolate import RegularGridInterpolator

OUTER_STEM = 38.1   # moulded depth of the cherry outer stem (3 x 12.7 mm)
LOA = 5182.0        # 17'0" over the outer stems
L = LOA - 2 * OUTER_STEM   # length of the strip-planked hull itself
H = L / 2

# Published Nomad 17 numbers (Bear Mountain / Fyne Boat Kits)
NOMAD = dict(L=5182, beam_max=890, beam_gunwale=865, beam_wl=830,
             depth_centre=370, bow_height=635, draft=115,
             displacement_kg=189, wetted_m2=2.66, cp=0.532)

# Shape parameters (tuned in calibrate.py against NOMAD hydrostatics)
P = dict(
    Bm=445.0,      # half max beam
    T0=12.5,       # tumblehome per side amidships ((890-865)/2)
    ps=3.2,        # sheer sweep exponent
    R=20.0,        # rocker at the start of the forefoot
    a=620.0,       # forefoot ellipse, horizontal semi-axis
    b=560.0,       # forefoot ellipse, vertical semi-axis
    q=2.4,         # plan-view fullness exponent
    r=1.6,         # plan-view taper exponent at the ends
    n0=2.6,        # section superellipse exponent amidships
    n1=1.3,        # reduction toward the ends (n = n0 - n1*xi^2)
    D0=230.0,      # height of max beam above keel amidships
    D1=100.0,      # rise of max-beam height toward the ends
)


PARAMS_FILE = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'hull_params.json')
if os.path.exists(PARAMS_FILE):            # written by calibrate.py
    with open(PARAMS_FILE) as _fh:
        P.update(json.load(_fh))


def set_params(**kw):
    P.update(kw)
    _cache.clear()


def xi(x):
    return np.clip(np.abs(x) / H, 0, 1)


def z_sheer(x):
    return NOMAD['depth_centre'] + (NOMAD['bow_height'] - NOMAD['depth_centre']) * xi(x) ** P['ps']


def z_keel(x):
    """Keel + stem profile (outside of wood) as a function of x."""
    ax = np.abs(np.asarray(x, float))
    xf = H - P['a']
    z0 = P['R']
    z = P['R'] * (np.minimum(ax, xf) / xf) ** 2
    u = np.clip((ax - xf) / P['a'], 0, 1)
    fore = z0 + P['b'] - P['b'] * np.sqrt(np.clip(1 - u ** 2, 0, 1))
    return np.where(ax > xf, fore, z)


def half_beam_max(x):
    return P['Bm'] * np.clip(1 - xi(x) ** P['q'], 0, 1) ** P['r']


def section_yz(x, n=400):
    """Outside-of-wood half section at x, ordered sheer -> keel.

    Returns (y, z) arrays of length n (y >= 0)."""
    zk = float(z_keel(x))
    zs = float(z_sheer(x))
    if abs(x) >= H - 1e-6 or zs - zk < 1e-6:
        z = np.linspace(zs, max(zk, P['R'] + P['b']), n)
        return np.zeros(n), z
    B = float(half_beam_max(x))
    e = float(xi(x))
    ne = max(1.05, P['n0'] - P['n1'] * e ** 2)
    D = min(P['D0'] + P['D1'] * e ** 2, zs - zk)
    zmb = zk + D
    T = P['T0'] * (1 - e ** 2)
    # superellipse keel -> max beam
    m = int(n * 0.75)
    phi = np.linspace(0, np.pi / 2, m)
    yl = B * np.sin(phi) ** (2 / ne)
    zl = zmb - D * np.cos(phi) ** (2 / ne)
    # tumblehome max beam -> sheer
    if zs - zmb > 1e-6:
        t = np.linspace(0, 1, n - m + 1)[1:]
        yu = B - T * t ** 2
        zu = zmb + (zs - zmb) * t
    else:
        yu = np.array([]); zu = np.array([])
    y = np.concatenate([yl, yu])[::-1]
    z = np.concatenate([zl, zu])[::-1]
    return y, z


_cache = {}


def _grid():
    """Precompute sections resampled by normalised girth sigma in [0,1]."""
    if 'grid' in _cache:
        return _cache['grid']
    # cluster stations toward the ends where curvature changes fastest
    t = np.linspace(-1, 1, 801)
    xs = H * np.sign(t) * (1 - (1 - np.abs(t)) ** 1.6)
    sig = np.linspace(0, 1, 301)
    Y = np.zeros((len(xs), len(sig)))
    Z = np.zeros_like(Y)
    G = np.zeros(len(xs))
    for i, x in enumerate(xs):
        y, z = section_yz(x, 1200)
        d = np.r_[0, np.cumsum(np.hypot(np.diff(y), np.diff(z)))]
        G[i] = d[-1]
        if d[-1] < 1e-9:
            Y[i] = 0; Z[i] = z[0]; continue
        Y[i] = np.interp(sig * d[-1], d, y)
        Z[i] = np.interp(sig * d[-1], d, z)
    g = dict(xs=xs, sig=sig, G=G,
             fy=RegularGridInterpolator((xs, sig), Y, method='cubic'),
             fz=RegularGridInterpolator((xs, sig), Z, method='cubic'))
    _cache['grid'] = g
    return g


def girth(x):
    g = _grid()
    return np.interp(x, g['xs'], g['G'])


def girth_extent(s):
    """Largest |x| at which the half-girth (sheer -> keel) is still >= s."""
    g = _grid()
    xs, G = g['xs'], g['G']
    half = xs >= 0
    xp, Gp = xs[half], G[half]          # G decreases with x on this half
    s = np.asarray(s, float)
    out = np.interp(s, Gp[::-1], xp[::-1])
    return np.where(s <= Gp[-1], H, out)


def surface(x, s, side=1):
    """Outside-of-wood point at station x, girth s from the sheer."""
    g = _grid()
    x, s = np.broadcast_arrays(np.asarray(x, float), np.asarray(s, float))
    Gx = np.maximum(girth(x), 1e-9)
    sg = np.clip(s / Gx, 0, 1)
    pts = np.stack([x.ravel(), sg.ravel()], -1)
    y = g['fy'](pts).reshape(x.shape) * side
    z = g['fz'](pts).reshape(x.shape)
    return np.stack([x, y, z], -1)


def normal(x, s, side=1, h=0.5):
    """Outward unit normal of the hull surface at (x, s)."""
    x = np.asarray(x, float); s = np.asarray(s, float)
    xa = np.clip(x - h, -H, H); xb = np.clip(x + h, -H, H)
    dx = surface(xb, s, side) - surface(xa, s, side)
    dsv = surface(x, s + h, side) - surface(x, np.maximum(s - h, 0), side)
    # (x, s) is a consistently oriented parameterisation, so one sign fixes
    # every point: on the starboard side, d/dx x d/ds points outboard.
    n = np.cross(dx, dsv) * side
    nn = np.linalg.norm(n, axis=-1, keepdims=True)
    return n / np.maximum(nn, 1e-12)
