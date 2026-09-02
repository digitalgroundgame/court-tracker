# GEOMETRY_PRODUCTION_PROMPT

Paste the block below to a **separate web-Claude session** (one with web access), and attach
`docs/GEOMETRY_CONTRACT.md` alongside it. That session's job is to produce the three geometry
deliverables; it does **not** touch the web app. This file is both the prompt and the spec it works
from — everything it needs is here.

---

## PROMPT (paste this)

```
You are helping produce the map geometry for a federal-court dashboard. Read the attached
GEOMETRY_CONTRACT.md first — it defines the SVG the downstream web app consumes (path ids = court
codes, absolute M/L only, Y-flip group, data-inset markers, the morph invariant). Then produce three
deliverables, in order, following the spec below. Use web access to verify statutory county lists and
CRS/EPSG codes; do not guess court codes or county assignments. Ask me before assuming anything
ambiguous.

Deliverable 1 — county_to_district.csv (the crosswalk).
Deliverable 2 — qgis_export.py (a QGIS Python-console script that dissolves, simplifies, reprojects,
                and writes the SVGs to the contract).
Deliverable 3 — GEOMETRY_STEPS.md (a runbook I follow in QGIS, start to finish).

Work through the spec section by section. After each deliverable, stop and let me review before
continuing.
```

---

## Spec (the pasted prompt refers to this)

### The pipeline (canonical order — do not reorder)
1. **Load** TIGER/Line county-equivalents (all 50 states + DC + PR + GU + MP + VI). Reproject the
   CONUS set to the common CRS **EPSG:5070** (NAD83 / Conus Albers). Keep AK/HI/territories in their
   own local CRSs (they don't morph — see §Insets).
2. **Merge first (dissolve #1):** join each county to its `court_id` via `county_to_district.csv`,
   then dissolve counties → **district** polygons. (Federal districts are whole-county unions with two statutory exceptions. Durham Co., NC (§113) is split — a prison enclave sits in E.D.N.C. — and is resolved to whole-county (`ncmd`), as published maps do. Yellowstone NP (§§92, 106, 131) is split and is honoured: the Idaho and Montana portions are cut into `wyd` in `qgis_export.py` step 3b, which also moves the `ca9`/`ca10` circuit border.)
3. **Simplify once, topology-preserving:** simplify the CONUS district layer a single time (see
   §Simplification). This is the vertex set every morphing shape inherits. Do **not** simplify again
   later or per-projection.
4. **Dissolve #2:** dissolve the *already-simplified* CONUS districts → **circuit outlines**, so
   circuit borders share vertices with their districts.
5. **Export national.svg:** reproject the simplified CONUS districts + circuit outlines from 5070 into
   the national display CRS (5070 itself for CONUS), write district and circuit layers. Then bake in
   the insets (§Insets) as `data-inset="true"` paths transformed into their boxes. Add D.C. as a
   magnified `data-inset` callout.
6. **Export circuits/<id>.svg** (one per geographic circuit): reproject that circuit's simplified
   districts from 5070 into the **circuit-local CRS** (§Projections), preserving feature and vertex
   order so each district's path matches its national counterpart 1:1. Bake that circuit's own insets.
7. **Validate** (§Validation) and report vertex-parity + file sizes.

**Why merge-before-simplify:** dissolving counties first means simplification acts on the district
boundary as one coherent line; simplifying counties first can leave slivers where two counties in
different districts share an edge.

### Court / geometry inventory
- **Geographic circuits** (get a national outline + a `circuits/<id>.svg`): `ca1`–`ca11`, `cadc`.
  - `cadc` is geographically just D.C. → render as a **magnified callout**, not a full local file’s
    worth of mainland; still emit `circuits/cadc.svg` containing the single `dcd` district enlarged.
- **`cafc` (Federal Circuit): no geometry.** No outline, no local file. Selector-only downstream.
- **Circuits with insets** (baked into national.svg and into that circuit's local file):
  - `ca1` → PR (`prd`); `ca3` → VI (`vid`); `ca9` → AK (`akd`), HI (`hid`), Guam (`gud`), N. Mariana
    (`nmid`). All other circuits are fully contiguous-US.
- **Specialized** (`cit`, `uscfc`): no geometry.
- Confirm every court code against Free Law Project **`courts-db`** / the CourtListener jurisdictions
  list before writing it. `geometry_key` == `court_id` == `<path id>`.

### SVG groups — full parameters

**Group A — `national.svg`**
| parameter | value |
|---|---|
| CRS (CONUS body) | EPSG:5070 (NAD83 Conus Albers Equal Area) |
| Contents | all 94 districts + all geographic circuit outlines (`ca1`–`ca11`, `cadc`) |
| Insets baked | AK, HI, PR, GU, MP, VI as `data-inset="true"`, each pre-transformed into a box |
| D.C. | `dcd`/`cadc` as a magnified `data-inset` callout (scale-up + translate into a box) |
| Layers | `data-layer="district"` and `data-layer="circuit"` |
| Morph role | mainland districts are the **national** end of the morph; insets never morph |
| viewBox | computed from CONUS 5070 bounds ∪ inset/callout boxes |

**Group B — `circuits/<id>.svg`** (one per `ca1`–`ca11`, `cadc`)
| parameter | value |
|---|---|
| CRS | **circuit-local** custom Albers (see §Projections); fallback dominant UTM zone or 5070 |
| Contents | that circuit's mainland districts only (same ids + vertex order as in national.svg) |
| Insets baked | that circuit's insets (`ca1`:PR, `ca3`:VI, `ca9`:AK/HI/GU/MP) as `data-inset` |
| Morph role | mainland districts are the **local** end of the morph (1:1 with national) |
| viewBox | computed from the circuit's local-CRS bounds ∪ its inset boxes |

**Insets / callouts (baked into A and the relevant B files — no separate files)**
| region | code(s) | local CRS (preferred → fallback) | box placement (national) |
|---|---|---|---|
| Alaska | `akd` | EPSG:3338 (Alaska Albers) → NAD83(2011) AK | lower-left |
| Hawaii | `hid` | ESRI:102007 Hawaii Albers → NAD83(2011) HI zones | lower-left, right of AK |
| Puerto Rico | `prd` | EPSG:32161 (PR & USVI) → NAD83(2011) | lower-right |
| U.S. Virgin Islands | `vid` | EPSG:32161 | lower-right, near PR |
| Guam | `gud` | EPSG:8693 (NAD83(MA11) UTM 55N) → EPSG:32655 | lower-right cluster |
| N. Mariana Is. | `nmid` | EPSG:8693 → EPSG:32655 | lower-right cluster |
| D.C. | `dcd` | keep in 5070, scale up | callout near the mid-Atlantic |

Inset placement is a per-inset **scale + translate** applied after projection; expose these as tunable
constants at the top of `qgis_export.py` so I can nudge boxes without touching logic. Verify each EPSG
exists in my QGIS build; if an ESRI code is unavailable, emit an equivalent custom Albers proj string.

### Projections — circuit-local custom Albers
For each geographic circuit, define a custom Albers Equal Area so the circuit "looks best":
```
+proj=aea +lat_1={lat1} +lat_2={lat2} +lat_0={lat0} +lon_0={lon0}
+x_0=0 +y_0=0 +datum=NAD83 +units=m +no_defs
```
Rule of thumb: `lon_0` = circuit centroid longitude; `lat_0` = centroid latitude; `lat_1`/`lat_2` at
roughly the ⅙ and ⅚ points of the circuit's latitude span (standard parallels bracketing its extent).
Compute these from the dissolved circuit geometry and write them into the script as per-circuit
constants. Contiguous circuits only; insets keep their own CRS from the table above.

### Data sourcing — pick a path, tell me which
Verify currency of any external dataset before relying on it (district boundaries are very stable, but
confirm recent division changes against the statute).
- **Path A (recommended): cartographic boundary counties + a county→district crosswalk, dissolve up.** Most control,
  cleanest morph. Don't transcribe the crosswalk from scratch — **start from the openICPSR "US
  District Court Boundary Shapefiles (1900–2000)" package (project 100069), which ships the
  county↔district crosswalk it was built from**, then verify/update it against current 28 U.S.C.
  §§ 81–131. Dissolve cartographic boundary counties → districts → circuits yourself so vertices are under your control. Note that catographic boundary counties are used because TIGER counties don't clip shorelines properly.
- **Path B (shortcut): HIFLD "US District Court Jurisdictions" polygons.** Downloadable as
  shapefile/GeoJSON from the HIFLD ArcGIS Hub. Faster, but first confirm it includes the sub-state
  divisions *and* the territorial districts and is current; then simplify-once / export-twice and
  dissolve up to circuits as normal.
Either path feeds the same pipeline, invariant, and SVG contract.

### The crosswalk — `data/county_to_district.csv`
Columns: `geoid` (5-digit state+county FIPS, TIGER GEOID), `county_name`, `state_fips`, `court_id`.
Ground truth is the statutory county lists in **28 U.S.C. §§ 81–131** (each section enumerates a
district's counties); the openICPSR crosswalk (Path A) is a strong starting point to verify against
rather than transcribing from zero. Cover every county-equivalent so the join is
total. Gotchas to handle explicitly:
- **Multi-district states** (e.g. NY, CA, TX, PA, FL, IL, OH, MO, …): assign each county to the right
  district per the statute; don't approximate by geography.
- **Single-district states**: every county → the one district (e.g. `azd`, `ord`, `mnd`).
- **Virginia independent cities**: separate GEOIDs from their surrounding counties and must be listed;
  don't fold them into a county.
- **Louisiana** parishes and **Alaska** boroughs/census areas are the county-equivalents (AK is one
  district, `akd` → all AK equivalents).
- **Territories**: all PR municipios → `prd`; `gud`←Guam; `nmid`←N. Mariana; `vid`←USVI; DC (GEOID
  11001) → `dcd`.
Emit a validation summary: total county-equivalents matched vs. TIGER count (~3,143), and any
unmatched rows. Prefer FIPS as the join key throughout (names collide across states).

### Simplification — keep adjacency, hit a budget
Use a **topology-preserving** simplifier so shared district borders stay coincident (no slivers):
- **In QGIS:** GRASS `v.generalize` (method Douglas–Peucker, `type=area`) via Processing — it
  simplifies shared boundaries as single arcs. QGIS's native `Simplify` is per-feature and will
  crack adjacencies; avoid it for this step.
- **Alternative:** export to GeoJSON, simplify in **mapshaper** (`-simplify` is topology-aware,
  `visvalingam`), reimport. Note this in the runbook as the fallback if GRASS misbehaves.
Target a vertex budget that keeps `national.svg` path data to a few hundred KB (the app lazy-loads,
but smaller is better). Start around a 500 m tolerance in 5070 and tune. Report resulting total
vertex count and file size.

### Validation (bake into the script's output)
- **Vertex parity:** for every mainland district, assert identical vertex count between its
  national and its circuit-local path; list any mismatches (these break morphing).
- **Coverage:** every `court_id` in the inventory with geometry produced exactly one district path;
  every geographic circuit produced one outline.
- **Geometry health:** no self-intersections/empty geometries after simplify; report areas so a
  dissolve error (e.g. a county in the wrong district) shows up as a wrong-sized shape.
- **Contract conformance:** paths are absolute M/L only; ids == court codes; `data-*` present; a
  single Y-flip group per file; no inline styling.

### Deliverable 3 — `GEOMETRY_STEPS.md` (operator runbook)
A start-to-finish checklist I can follow: where to download cartographic boundary counties + territories, how to load
them, how to load the crosswalk and run the dissolve, how to run the topology-preserving simplify, how
to run `qgis_export.py`, how to eyeball the outputs, how to tune inset boxes and the simplify
tolerance, and how to drop the finished files into `assets/geo/` (and `circuits/`). Keep it concrete
and QGIS-version-agnostic where possible.

### Working method (how the session should run)
1. Confirm my QGIS version, installed CRSs, and chosen data path; list the exact layers/files to load.
2. Give the dissolve-#1 + single topology-preserving simplify steps, with a starting tolerance and how
   to tune toward the vertex budget.
3. Emit the export code that dissolves-#2, reprojects the one simplified layer into national + each
   circuit-local CRS, bakes insets, and writes conforming SVGs (extend `qgis_export_template.py`).
4. Provide the vertex-parity verification snippet; any mismatch is fixed in simplification, not export.
5. Iterate tolerance/appearance and inset placement until I approve, then finalize names/locations.
Proceed in small steps and pause for me to run each and report back.

### Acceptance checklist (before shipping the SVGs)
- [ ] Every id is an exact `courts-db` code; `national.svg` covers all geographic circuits + all
      districts; `cafc` absent from the map.
- [ ] For every geographic circuit, `circuits/<id>.svg` exists and each mainland district's vertex
      count/order matches `national.svg` exactly.
- [ ] Insets (AK/HI/PR/Guam/N. Mariana/V.I.) and the D.C. callout are baked as `data-inset="true"`,
      not morph-linked.
- [ ] Absolute M/L only; single Y-flip group `scale(1,-1) translate(0, -(minY+maxY))`; viewBox in
      projected units; no inline styling.
- [ ] Crosswalk coverage total vs. TIGER (~3,143) reported; per-file vertex counts and sizes reported.

---

## Dependencies & sequencing (so you can start now)
- **Only prerequisite:** a frozen list of court codes + hierarchy — i.e. the `courts.csv` *skeleton*
  (`court_id`, `court_name`, `court_level`, `parent_id`, `tenure_type`, `has_geography`, `is_inset`).
  Pull codes from `courts-db`; a human sets the handful of special flags (cafc no-geometry;
  cit/uscfc specialized; the six insets; dcd callout). The judgeship/tenure/judge columns are filled
  later and are **not** needed for geometry.
- With the skeleton + this spec, geometry production can run **fully in parallel** with the Claude
  Code build. Nothing in Phases 0–2 depends on real geometry (they use the placeholder). Only
  **Phase 3 (geometry integration)** consumes these files.
- Suggested order: freeze the courts skeleton → (geometry work ∥ Claude Code Phases 0–2) → drop
  geometry in → Phase 3.
