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

The STEP and STL files are not in git (`.gitignore`). Run `build.py` to regenerate them.
| `hull.py` | Hull lines (keel/stem profile, sheer, sections) |
| `hydro.py` | Hydrostatics: displacement, Cp, wetted surface |
| `calibrate.py` | Tunes the shape parameters against the Nomad figures |
| `build.py` | Builds every solid and exports STEP / STL / GLB |

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
