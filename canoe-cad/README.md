# Nomad 17 cedar-strip canoe: CAD reconstruction

A parametric B-rep model of the 17 ft cedar-strip canoe from the portfolio
(`data/projects.js`, id `canoe`). The design follows the Ted Moores **Nomad 17**
from *Canoecraft* and Bear Mountain Boats, the plan Nick Offerman's *Huckleberry* is based on.
No original offsets or mold files existed, so the hull lines were
**reconstructed** from the published principal dimensions and then tuned until
the model's hydrostatics matched the published figures.

All units are millimetres. Model frame: x along the boat (0 = midships, +x = bow),
y to starboard, z up, z = 0 at the bottom of the keel line amidships.

## Files

| File | Contents |
|---|---|
| `out/canoe_hull_shell.step` / `.stl` | Cedar strips + cherry inner and outer stems |
| `out/canoe_full.step` / `.stl` | Hull shell + gunwales, decks, seats, yoke, thwart |
| `out/canoe_on_molds.step` / `.stl` | Strips + inner stems on station molds, stem forms and strongback, upside down as built, floor at z = 0 |
| `out/build_report.json` | Every part, strip lengths, hull parameters, hydrostatics |
| `../funky/canoe/` | The website's 3D viewer (funky side, Canoe tab). `models/` holds the coloured GLBs and `spec.json` the build writes |
| `preview/` | Standalone viewer used for the claude.ai artifact (loads `*.gltf.json`, which the build writes and git ignores) |
| `hull.py` | Hull lines (keel/stem profile, sheer, sections) |
| `hydro.py` | Hydrostatics: displacement, Cp, wetted surface |
| `calibrate.py` | Tunes the shape parameters against the Nomad figures |
| `build.py` | Builds every solid and exports STEP / STL / GLB |
| `sim_tables.py` | Flow-mode tables per load: draft, wetted area, waterline, Michell wave resistance → `funky/canoe/models/sim.json` |
| `fe_mesh.py` | Shell FE mesh and layups for the impact solver → `funky/canoe/models/fe_mesh.json` |
| `cfd/setup_case.py`, `cfd/collect.py` | OpenFOAM double-body cases and the form-factor calibration written into `sim.json` |

The STEP and STL files are not in git (`.gitignore`). Run `build.py` to regenerate them.
The OpenFOAM run folders (`cfd/U*/`, ~1 GB each) are not in git either.

The STEP files hold one named, coloured solid per part (e.g. `strip_S07_dark`,
`inner_stem_bow_lam2`, `station_mold_+3`). They open in SolidWorks as an assembly-style
multibody part with colours. They have no feature tree.

Rebuild:

```bash
uv venv cadenv && uv pip install -p cadenv/bin/python build123d trimesh numpy scipy shapely rtree networkx
cadenv/bin/python calibrate.py   # optional: re-tune, writes hull_params.json
cadenv/bin/python build.py
```

## Result vs. published Nomad 17

Fresh water, 115 mm draft, outside of wood.

| | Nomad 17 (published) | Model |
|---|---|---|
| Length over stems | 5182 (17′) | 5182 |
| Hull length, wood only | – | 5106 |
| Beam, max | 890 | 890 |
| Beam, gunwale | 865 | 865 |
| Beam, waterline | 830 | 851 |
| Depth, centre | 370 | 370 |
| Bow height | 635 | 635 |
| Displacement | 189 kg | 185.2 kg |
| Prismatic coefficient | 0.532 | 0.536 |
| Wetted surface | 2.66 m² | 2.71 m² |
| Waterline length | – | 4629 |
| Rocker (keel rise to start of stem curve) | – | 44 |
| Weight | 25–30 kg | 13.9 kg cedar + 0.8 kg cherry, before glass, epoxy and trim |

Every hydrostatic figure is within 2.5% of the published value. The plan view keeps
82% of max beam at the quarter points, typical of Prospector-family lines.
The fitted shape parameters are in `hull_params.json`.

**Parts:** 38 strips per side (76 total). Each stem has 3 inner + 3 outer cherry
laminations (12 in all). 15 station molds, 2 stem forms, 5 strongback parts.
Full canoe adds 4 gunwales, 2 decks, 2 seats (18 parts), a yoke and a thwart.

## Construction modelled

### Planking
- Western red cedar strips, **6.35 × 19.05 mm** (¼″ × ¾″) bead and cove, the
  *Canoecraft* standard. Two tones: light and dark red cedar.
- Strips run parallel to the sheer and are laid at constant girth width from the sheer.
  Near the ends they run out onto the stem profile. The last strip on each side closes on
  the keel line. That gives the bottom closure the same football shape as on the real boat.
- Colour order is `STRIP_PATTERN` in `build.py`, written from the sheer to the keel and
  mirrored port/starboard. The design goes from light at the sheer to dark at the keel:
  - strips 1–7 all light
  - strips 8–24 mixed, read off the build photos, with dark taking over toward the keel
  - strips 25–38 all dark. These are the section still open in the photos.

  Edit the string and rebuild to change it.

### Stems (cherry)
- **Inner stem**: 3 laminations × 12.7 mm = 38.1 mm moulded, 19.05 mm sided. It sits
  behind the strips, and the front lamination is bevelled to the strip V so it does not
  overlap the planking.
- **Outer stem**: 3 laminations × 12.7 mm = 38.1 mm moulded, 19.05 mm sided, on the
  outside of the profile. It fades into the keel line over the first third of its run.
- Inner and outer stems together are about 76 mm deep.

### Jig (canoe_on_molds)
- **15 station molds** at **304.8 mm (12″)** spacing, stations −7…+7, cut from 19.05 mm
  plywood. Their edges are the *inside* of the planking. This is the *Canoecraft* layout for a 17 ft
  hull and matches the roughly 15 bays visible in the build photos.
- **2 stem forms** (19.05 mm ply) behind the inner stems.
- **Box-beam strongback** 190 × 290 mm, 4880 mm long, on two T-legs. The hull sits
  upside down as built and the floor is at z = 0.

### Outfitting (canoe_full)
| Part | Material | Size / position |
|---|---|---|
| Inwales, outwales | ash | 19.05 × 22.2 mm, top flush with the sheer |
| Decks | ash | 19.05 mm thick, last ~380 mm of each end, between the inwales |
| Bow seat | ash frame, cane | 280 mm deep, centred 1000 mm aft of the bow wood end, hung 70 mm below the inwales |
| Stern seat | ash frame, cane | 250 mm deep, centred 780 mm forward of the stern wood end, hung 60 mm |
| Yoke | ash | 19.05 mm, contoured, at midships under the inwales |
| Thwart | ash | 19.05 × 38 mm, 760 mm aft of midships |

### Laminate (recorded for FEA, not modelled as solids)
Standard *Canoecraft* / Bear Mountain schedule:

| Layer | Spec | Approx. cured thickness |
|---|---|---|
| Outside | 1 × 6 oz/yd² (200 g/m²) E-glass plain weave, full hull | 0.25 mm |
| Outside, bottom | +1 × 6 oz "football" patch, ~2.4 m long, keel to just below the bilge | 0.25 mm |
| Outside fill | 2 fill coats of epoxy | ~0.25 mm |
| Wood | cedar strip | 6.35 mm |
| Inside | 1 × 6 oz/yd² E-glass, full hull | 0.25 mm + fill |
| Resin | West System 105 resin / 207 hardener, about 2 US gal per canoe | |
| Finish | marine spar varnish (UV protection) | |

Suggested material properties for a first FEA pass (check against your own data):

| Material | E₁ (GPa) | E₂ (GPa) | ν | ρ (kg/m³) |
|---|---|---|---|---|
| Western red cedar (along grain / across) | 7.7 | 0.6 | 0.38 | 370 |
| Cherry | 10.3 | 0.9 | 0.39 | 560 |
| Ash | 12.0 | 1.0 | 0.37 | 670 |
| 6 oz E-glass / epoxy (≈40% Vf) | 17 | 17 | 0.15 | 1700 |

For FEA, model the hull as a layered shell from the outside-of-wood surface, with the
laminate stack above. The strip solids in the STEP are mostly useful for checking
geometry and appearance, and for picking the grain direction along each strip.

## Assumptions and limits
- The Nomad offsets were not available, so hull **shape** is a fitted reconstruction. The
  published dimensions are hit exactly by construction. The hydrostatics come within
  2.5% by tuning (table above). Rocker (44 mm) and the stem curve (an elliptical forefoot
  of ~500 × 485 mm) are fitted, not published. They look consistent with the rounded
  bow in the photos.
- Fibreglass and epoxy are not modelled as solids (they add < 1 mm).
- Strips are modelled at constant girth width per section, so they narrow slightly where
  they run diagonally toward the ends. Real strips keep a constant width and get
  trimmed instead.
- The inner stem's bevel is approximated lamination by lamination with straight sides,
  which can leave a sliver gap (< 1 mm) against the strips.
- Seat, thwart and yoke positions are typical tandem values, not measured from your boat.

## Simulations (website: funky side → Canoe → Flow / Impact)

### Flow
**Moving picture.**
- A D2Q9 lattice-Boltzmann solver (BGK + Smagorinsky) runs on the GPU in WebGL2.
- Grid: 384 × 168 over a 16 × 7 m patch of water, about 42 mm per cell.
- The hull is the waterline outline at the chosen load, as a bounce-back obstacle.
- The flow angle turns the hull inside the lattice.
- 12,288 tracer particles ride the velocity field. The view can switch to speed, pressure coefficient or vorticity.
- It runs at a lattice Reynolds number of ~500–1,800 (full scale is ~10⁶–10⁷). It shows the character of the flow: stagnation at the bow, speed-up along the sides, the wake, separation when the boat is crabbing. Its boundary layers are thicker than full scale, so it is not a source of numbers.
- The time scale is real time: lattice cells per second match the chosen speed.

**Numbers (panel).** All from the real hull, per load (`sim_tables.py`):

| Quantity | Method |
|---|---|
| Draft, wetted area, waterline length/beam, ∫T² dx | Integrated on the hull surface at the floating draft for that load |
| Friction | ITTC-57 line, `Cf = 0.075 / (log10 Re − 2)²`, on the wetted area |
| Form drag | Friction × (1 + k − 1), with **1 + k fitted to the OpenFOAM runs below** |
| Wave drag | Michell's thin-ship integral over the actual hull offsets, deep water. Checked on the Wigley hull: the hump at Fn 0.30, hollow at 0.35 and main hump near 0.5 match the published Michell curve |
| Off-axis | Slender-body lift (π q T² β) + crossflow drag (Cd 0.8) for side force; induced drag; Munk yaw moment from added masses |
| Water | ν(T) and ρ(T) for fresh water, salt water at +25 kg/m³ and ×1.07 viscosity |
| Power | R·V. Per-paddler figure assumes 2 paddlers at ~60% propulsive efficiency |
| Wave pattern | Bow and stern Kelvin systems (19.47° wedge) at k₀ = g/V², amplitude scaled from the Michell wave drag, exaggerated by the slider |

### OpenFOAM check
- Full scale, fresh water at 20 °C, at the design draft (115 mm).
- Double body: the waterline is a symmetry plane, so no free surface and no wave drag.
- Quarter model.
- Solver: simpleFoam, k-ω SST, Spalding wall functions.
- Mesh: snappyHexMesh, about 4 mm cells on the hull and 5 boundary layers.

| Speed | Re | CFD drag (full hull) | of which pressure | ITTC-57 friction | Effective 1 + k |
|---|---|---|---|---|---|
| 1.0 m/s | 4.6 × 10⁶ | 5.01 N | 0.20 N | 4.67 N | 1.072 |
| 1.5 m/s | 6.9 × 10⁶ | 10.40 N | 0.40 N | 9.76 N | 1.066 |
| 2.0 m/s | 9.2 × 10⁶ | 17.50 N | 0.68 N | 16.48 N | 1.062 |

Each run used 1.67 M cells and 1,500 iterations, converged to residuals of about 1e-8, with average y+ ≈ 23. The mean 1 + k = 1.066 is what the Flow panel uses.

The textbook Holtrop–Mennen form factor for this hull is 1.18, which would overstate viscous drag by about 10%. The Flow panel therefore uses the CFD-fitted value. Re-run with
`cfd/setup_case.py <U>`, `./Allrun` in the case folder, then `cfd/collect.py`.
A free-surface (interFoam) run would check the Michell wave drag directly. It is the obvious next step, but it takes hours, not minutes.

### Impact
**Solver.** Explicit dynamic shell FE in the browser (Web Worker), 1,039 nodes and 1,948 triangles, at about 80 mm.

| Part | How it is modelled |
|---|---|
| Membrane | Co-rotational constant-strain triangles. Orthotropic laminate from classical lamination theory, with the strip direction taken as the projected boat axis |
| Bending | Discrete-shell hinges with the laminate D across each edge. Gradients checked against finite differences. Stiffness and curvature constants calibrated on an irregular plate bent to a known radius: energy within 0.3%, curvature within 1% |
| Gunwales and stems | Ash gunwales (2 × 19 × 22 mm) and cherry stems (19 × 76 mm) smeared into their elements as along-strip EA, EI and mass |
| Payload | Paddlers and gear are separate masses on spring-dampers (6 Hz, 30% damping) to patches of bottom near the seats. People are soft, so they load the hull over tens of ms |
| Water | ~30% of displacement as added mass on the wetted nodes |
| Damping | Damping on vibration relative to the centre of mass, plus light stiffness-proportional damping |
| Contact | Penalty contact against a rigid rock (sphere), a wall (plane) or a floating log (cylinder, 550 kg/m³, free to be shoved) |
| Time step | 4 µs (selective mass scaling is available but not triggered on this mesh); a run takes ~6–15 s |

**Failure index.**
- Max-stress criterion per ply, at the top and bottom of every ply, from membrane strain + z·κ, in the ply's material axes.
- **Structure** covers the glass in every mode, cedar along the grain and in shear, and the gunwale and stem members.
- **Core cracks** is cedar across the grain (Yt 1.6 MPa) inside the glass. It is the usual first sign of a hard knock, and it is cosmetic until the glass goes.
- The damage map is an unrolled hull showing the peak index over the whole hit.

**Results for the default load (2 × 80 kg + 20 kg gear):**

| Hit | Peak force | Peak index (structure) | Outcome |
|---|---|---|---|
| Rock (r 400 mm), bow stem, 2 m/s | 12.3 kN | 1.6, gunwale compression near the bow | local damage at the bow |
| Rock, midships beam-on, 1.5 m/s | 4.4 kN | 2.3, cedar crushing at the contact | dented side, small patch |
| Floating log (300 mm), bow, 2 m/s | 11.8 kN | 0.93 | close call, no failure |
| Wall, bow, 3 m/s | 13.5 kN | 4.0 | stems and gunwales fail, widespread core cracking |
| Rock, running aground, 2 m/s | 2.1 kN | 0.1 | rides up and over |

**Limits.**
- Linear-elastic up to the failure index. Nothing actually breaks, so the run continues as if undamaged.
- Coarse mesh: contact patches are a few nodes, which concentrates load. Peak indices near the contact are on the high side.
- Material strengths are characteristic handbook values. The glass is modelled as quasi-isotropic woven E-glass.
