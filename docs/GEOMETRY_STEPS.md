# GEOMETRY_STEPS — operator runbook

Start-to-finish for producing `national.svg` and `circuits/*.svg` in QGIS. Follow it in
order; the pipeline has one hard rule (**simplify once, export twice**) and the ordering
below is what protects it.

Written against **QGIS 4.2**. The simplifier is **mapshaper**, not GRASS — see §7 for why
that matters and what happens if you switch back.

Budget about **half a day** the first time, most of it spent tuning the inset boxes.
Reruns take minutes.

---

## 0. What you need on disk

```
project/
  data/
    county_to_district.csv          <- shipped with this runbook
    courts.csv                      <- the frozen courts skeleton
    census/
      cb_2024_us_county_500k.shp    <- download, step 1a
    nps/
      nps_boundary.shp              <- download, step 1b
  scripts/
    qgis_export.py
  out/                              <- the script creates this
```

Everything tunable lives in the CONFIG block at the top of `qgis_export.py`. You should not
need to touch anything below it.

---

## 1. Downloads

### 1a. County polygons — the **cartographic boundary** file

> **Do not download `tl_2024_us_county.shp`.** TIGER/Line county polygons carry each
> county's *legal* extent, which includes its share of the territorial sea and of the Great
> Lakes. Michigan comes out with its two peninsulas fused across Lake Michigan. The
> cartographic boundary (CB) file is the same geography clipped to the shoreline, with
> **identical GEOIDs**, so the crosswalk joins unchanged.

Census → *Geographies → Mapping Files → Cartographic Boundary Files - Shapefile*. Take the
**county** file at **500k** resolution:

```
cb_2024_us_county_500k.zip
```

Any vintage **2022 or later**. Earlier ones fail the join: the crosswalk assumes
Connecticut's nine planning regions (`09110`–`09190`), Alaska's Chugach/Copper River split,
and the retirement of Bedford city (`51515`) and Shannon Co. (`46113`).

Unzip to `data/census/`.

### 1b. Yellowstone boundary

28 U.S.C. §§ 92, 106 and 131 put the **Idaho and Montana portions of Yellowstone National
Park** into the **District of Wyoming**. `wyd` is 10th Circuit and `mtd`/`idd` are 9th, so
this moves a *circuit* border, not just a district one.

Download **"Administrative Boundaries of National Park System Units"** (the NGDA layer from
the NPS Land Resources Division) — a zipped shapefile from the data.gov catalog entry or the
ArcGIS Hub item. Unzip to `data/nps/`.

> Don't substitute Natural Earth's parks layer. It was pre-generalized with
> Visvalingam-Whyatt, which injects a foreign, already-thinned vertex set into the one place
> the pipeline is most sensitive.

The script filters `UNIT_CODE = 'YELL'`. Set `YELLOWSTONE = False` to skip it entirely.

### 1c. mapshaper

```
npm install -g mapshaper
```

This is the simplifier. It is not optional unless you set `SIMPLIFIER = "grass"`, which you
should not do — see §7.

---

## 2. Prepare QGIS

**Confirm the CRSs exist in your build.** Check via the CRS selector:

| code | used for |
|---|---|
| `EPSG:5070` | NAD83 / Conus Albers — the common CRS, where the one simplify happens |
| `EPSG:3338` | Alaska Albers |
| `ESRI:102007` | Hawaii Albers |
| `EPSG:32161` | Puerto Rico & U.S. Virgin Islands |
| `EPSG:8693` | NAD83(MA11) UTM 55N — Guam, N. Marianas |

If any is missing, `INSET_CRS` takes a fallback list per inset — add an equivalent proj
string and it will be used instead.

GRASS is **not** required. If you want to run the comparison in §7, enable the provider at
*Settings → Options → Processing → Providers → GRASS*.

---

## 3. Point the script at your files

```python
COUNTY_SHAPEFILE = "/…/data/census/cb_2024_us_county_500k.shp"
CROSSWALK_CSV    = "/…/data/county_to_district.csv"
COURTS_CSV       = "/…/data/courts.csv"
OUT_DIR          = "/…/out/assets/geo"
YNP_BOUNDARY     = "/…/data/nps/nps_boundary.shp"
```

Leave everything else at its default for the first run. The point of run #1 is to read the
validation output, not to get a pretty map.

---

## 4. Run it

QGIS → *Plugins → Python Console*:

```python
exec(open('/…/scripts/qgis_export.py').read())
```

No need to load layers first; the script opens them itself and writes nothing back to your
project.

---

## 5. Read the validation output — six gates, in order

A failure at gate *n* makes everything below it meaningless. Work top to bottom.

### Gate 1 — the join

```
[geo] crosswalk: 3230 county-equivalents
[geo] TIGER: 3230 counties joined, 5 skipped (no Art. III district), 0 UNMATCHED
```

`0 UNMATCHED` is the pass condition. The skipped ones are American Samoa (FIPS 60) and the
U.S. Minor Outlying Islands (74), neither of which has an Article III district.

**Any unmatched GEOIDs → wrong CB vintage.** Re-download at 2022+.

### Gate 2 — the shoreline check

```
[geo] shoreline check:
[geo]   OK — all 5 Great Lakes probes fall outside every district
```

Five points in the open Great Lakes. Under TIGER they land *inside* a county; under a
shoreline-clipped CB file they land outside every district. If any is inside, the script
raises — you cannot ship a fused-Michigan map by accident.

The `inland water (polygon area vs ALAND)` table underneath is **advisory only**. `ALAND`
excludes *all* water, but CB only clips *coastal* water, so districts holding a big lake or
bay legitimately exceed their land area: `laed` 1.29× (Lake Pontchartrain), `nyed` 1.21×
(the Long Island lagoons), `flsd` 1.13× (Biscayne Bay), `mnd` (…Minnesota). Expected. Only
above 1.5× is it worth a look.

### Gate 3 — Yellowstone

```
[geo]   mtd -> wyd: 642.6 km^2
[geo]   idd -> wyd: 149.0 km^2
[geo]   wyd now 254,116 km^2 (Wyoming alone is ~253,000)
```

`wyd` must land in **253,000–254,500 km²**; validation re-asserts it at the end. "No overlap
above the noise floor" means the wrong shapefile or the wrong `UNIT_CODE`.

### Gate 4 — the simplify

```
[geo] simplify: mapshaper visvalingam, interval=1000.0 m, keep-shapes
[geo]   mapshaper: [simplify] Repaired 8 intersections
[geo] simplify: 225433 -> 17357 vertices (7.7% kept)
```

The **only** simplify in the run for the mainland; everything downstream inherits this vertex
set. A handful of repaired intersections is routine mapshaper cleanup.

Watch for the drift warning:

```
[geo]   CONUS: 2 shape(s) drifted >2% in area — normal for small, crinkly districts
```

Drift up to ~2–3% is a normal Visvalingam artifact. Above **10%** the script raises — that's
a collapse, not a simplification.

### Gate 5 — vertex parity

```
[geo]   vertex parity: OK — every mainland district matches 1:1
```

This is the morph. It passes **by construction**: every mainland shape in a circuit file is
the same geometry as its national counterpart, passed through a different
`QgsCoordinateTransform`, and a transform maps vertices 1:1 without densifying.

If it ever fails, **fix it in the simplification, never in the export.**

### Gate 6 — coverage, health, budget

```
[geo]   coverage: districts 94/94
[geo]   coverage: circuits  12/12
[geo]   cafc on the map? no (correct)
[geo]   vertex budget: national.svg 519 KB
[geo]     mainland districts   17357
[geo]     circuit outlines      9420
[geo]     insets                5866
[geo]     TOTAL                32643
```

Scan the **areas table** — it's the dissolve-error detector. A county in the wrong district
shows up as a wrong-sized shape long before you'd catch it by eye. `mtd`, `nmd`, `azd`,
`nvd`, `cod` on top; `rid`, `dcd` at the bottom.

---

## 6. Tune — three loops, in this order

### 6a. `MAPSHAPER_INTERVAL` → the vertex budget

Metres of EPSG:5070, and **monotonic**: raise it, vertices go down, every time. (This is the
whole reason we're not on GRASS.)

| interval | national.svg |
|---|---|
| 750 m | ~690 KB |
| **1000 m** | **~519 KB** ← known-good landing zone |
| 1250 m | trips the 2% drift warning on small districts |

**Stop when the small eastern districts still look like themselves.** `rid` (2,818 km²),
`ded`, `nhd`, `mad` go polygonal long before Montana does. `SIZE_BUDGET_KB` is a soft target,
not a requirement — 519 KB is ~150 KB gzipped, and shape fidelity is what people see.

`MAPSHAPER_METHOD` is `visvalingam` deliberately: it removes vertices by triangle area,
which holds the character of crinkly coastlines far better than `dp` at aggressive settings —
and your heaviest districts (`wawd`, `miwd`, `txsd`, `med`, `nced`) are all coastline.

### 6b. Inset tolerances and boxes

`INSET_TOLERANCE_M` is **per inset**, because tolerance is really about how big a thing is
*drawn*, not how big it is on the ground. Alaska is 1.5M km² rendered ~400 px wide at
`scale=0.35`; the USVI renders near life-size.

| inset | tolerance | vertices |
|---|---|---|
| `akd` | 5000 m | ~3,500 — still the biggest single shape in the file |
| `hid` | 500 m | ~470 |
| `prd` | 250 m | ~550 |
| `vid` / `gud` / `nmid` | 100 m | ~190–700 |

Retune these if you change an inset's `scale` much.

`INSET_BOXES_NATIONAL` is `(scale, dx, dy)`: the shape is projected in its own CRS,
translated so its bbox corner sits at the origin, scaled, then translated by `(dx, dy)` **in
metres relative to the CONUS bbox corner**. CONUS in 5070 is roughly 4,600 km × 3,000 km, so
`dx = 3_500_000` is 3,500 km right of the CONUS left edge. **A negative `dy` puts the inset
below CONUS.**

Contract layout: **AK and HI lower-left; PR, VI, Guam, N. Marianas lower-right; D.C. a
magnified callout near the mid-Atlantic.** `INSET_BOXES_LOCAL` does the same inside each
circuit's own file, keyed by `(circuit, district)` — `ca1`:PR, `ca3`:VI, `ca9`:AK/HI/GU/MP.

`DC_CALLOUT` starts at 12×; D.C. is 176 km² and would otherwise be a pixel.

> **Check `nmid`.** The Northern Marianas' "Northern Islands Municipality" is a chain of tiny
> volcanic islands and CB generalization drops small discontiguous parts. A sparse inset is
> expected. The alternative (TIGER) renders every island district as a water-blob with a
> 3-mile halo.

### 6c. Freeze the circuit projections — **last**

Every run prints the Albers it derived per circuit:

```
[geo]   ca1: derived +proj=aea +lat_1=42.1991 … +lon_0=-70.0905 …
```

While `CIRCUIT_PROJ[circ]` is `None`, that projection is **recomputed from the geometry every
run** — so every interval change nudges the centroid and shifts the circuit slightly. (You can
watch `ca1`'s `lat_0` wander: 44.5163 → 44.5154 → 44.5177 → 44.5180.) Harmless while
iterating; not something you want in a shipped asset.

Once 6a and 6b are settled, **paste the twelve printed proj strings into `CIRCUIT_PROJ`** and
re-run. The log will say `pinned`, and the geometry stops moving.

---

## 7. About the simplifier — read before switching to GRASS

The contract calls for a **topology-preserving** simplifier so shared district borders stay
coincident and don't crack into slivers. Two tools qualify. They are not equivalent.

**mapshaper (`SIMPLIFIER = "mapshaper"`, the default).** Converts the polygons to a shared-arc
topology first, so a border between two districts is simplified **once, as one arc**, and both
districts inherit an identical result. The interval is monotonic and the tool is deterministic.

**GRASS `v.generalize` (`SIMPLIFIER = "grass"`).** On this dataset it fragments the district
boundaries into tens of thousands of arcs whose endpoints Douglas-Peucker cannot remove. The
consequences, measured:

- the vertex count **floors around 52,000** no matter the threshold — 250 m and 1250 m gave
  57k and 51k;
- individual districts **grow** when you simplify harder (`wawd`: 2.6k → 4.9k vertices going
  from 750 m to 1250 m);
- the circuit outlines carry **3× the vertices they need** (39,696 vs 12,751 for the same 12
  shapes at the same interval).

Same interval, same everything else, GRASS vs mapshaper: **1,609 KB vs 690 KB.** The knob
simply does not work. It is kept in the script for reference, not for use.

**What you must never do** is substitute QGIS's native *Simplify*. It is per-feature: it will
simplify Ohio's border with Indiana twice, once from each side, and the two results will not
agree. You get a hairline of slivers along every shared district border.

---

## 8. Eyeball the output

`national.svg` has no `width`/`height` and no fills — per the contract, the app supplies both.
To see anything, drop it in a scratch HTML file with:

```css
svg  { width: 100%; height: auto; }
path { fill: #ddd; stroke: #333; vector-effect: non-scaling-stroke; }
path[data-layer="circuit"] { fill: none; stroke-width: 2; }
path[data-inset="true"]    { fill: #cce; }
```

- [ ] Michigan's peninsulas are **separate**.
- [ ] Yellowstone is a visible notch out of Montana's and Idaho's southern edges, and the
      `ca9`/`ca10` circuit outline bends around it.
- [ ] All six insets and the D.C. callout are inside the viewBox and not overlapping CONUS.
- [ ] Circuit outlines sit exactly on their districts' outer edges — **no hairline gaps**.
      Gaps mean the two dissolves ran in the wrong order.
- [ ] `rid`, `ded`, `nhd`, `mad` still look like themselves. This is the interval test.
- [ ] `cafc` appears nowhere.

Then spot-check `circuits/ca9.svg` — the heaviest file, four insets and the Yellowstone bite.

---

## 9. Ship it

```
out/assets/geo/national.svg     ->  assets/geo/national.svg
out/assets/geo/circuits/*.svg   ->  assets/geo/circuits/
```

Twelve circuit files: `ca1`–`ca11` and `cadc`. **No `cafc.svg`** — the Federal Circuit has no
geography and is selector-only downstream.

Update `PROGRESS.md`: geometry is no longer placeholder. No app code should need to change —
that's the point of the contract.

---

## Troubleshooting

| symptom | cause | fix |
|---|---|---|
| `N UNMATCHED` GEOIDs | CB vintage older than 2022 | re-download 2022+ |
| `county source is not shoreline-clipped` | loaded `tl_*` instead of `cb_*` | fix `COUNTY_SHAPEFILE` |
| `'mapshaper' not on PATH` | not installed | `npm install -g mapshaper` |
| `no features with UNIT_CODE=YELL` | wrong NPS file or field name | check `YNP_UNIT_FIELD` |
| `wyd` area SUSPECT | park boundary didn't intersect MT/ID | wrong shapefile |
| `simplify COLLAPSED` (>10% area) | interval far too high | lower `MAPSHAPER_INTERVAL` |
| `drifted >2% in area` | normal Visvalingam artifact on small districts | eyeball them; only act if they look wrong |
| vertex counts *rise* when you simplify harder | you're on `SIMPLIFIER = "grass"` | §7 |
| vertex parity mismatch | something got simplified twice | **fix in simplification, never in export** |
| slivers between adjacent districts | native Simplify used instead of a topology-aware one | §7 |
| gaps between a circuit outline and its districts | dissolve #2 ran on *unsimplified* districts | check pipeline order |
| insets overlapping CONUS | `dy` not negative enough — insets live *below* the box | §6b |
| circuits drift between runs | `CIRCUIT_PROJ` still `None` | §6c |
