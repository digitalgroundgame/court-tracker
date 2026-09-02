# GEOMETRY_CONTRACT — externally-produced map assets

Geometry is created in QGIS by the operator (with a separate Claude session writing the export
script). The web app **consumes** these files and must not generate or alter shapes. This contract
is the interface both sides build to. The morph feature depends on it exactly.

## The morph invariant (read this first)
Morphing interpolates each **mainland** district's path, point-by-point, from its **national**
coordinates to its **circuit-local** coordinates. That only works if the two versions of a shape have
**identical vertex count and order** — same points, same sequence. To guarantee that:

> **Simplify once, export twice.** Simplify each morphing district's geometry a single time in one
> common CRS, then reproject the *already-simplified* geometry into (a) the national projection and
> (b) the circuit-local projection. **Never** simplify separately per projection — Douglas–Peucker
> drops different vertices under different CRSs and the counts diverge, breaking the morph.

**Insets do not morph**, so they are exempt from the invariant and may be simplified independently in
their own local projections (AK, HI, PR, Guam, N. Mariana, V.I.).

Two dissolves, in this order: **(1)** dissolve counties → districts *before* simplifying (merge
first); **(2)** after simplifying the districts, dissolve the *already-simplified* districts →
circuit outlines, so shared borders share vertices. Use a **topology-preserving** simplification
(so adjacent districts don't split into slivers) — see `GEOMETRY_PRODUCTION_PROMPT.md`.

**`geometry_key` equals `court_id`.** The `<path id>` is the court's CourtListener code; no separate
mapping layer.

**Insets are baked in, not separate files.** An inset shape lives inside whatever SVG shows it
(`national.svg`, and the relevant circuit file), pre-transformed into its box and marked
`data-inset="true"` so the app excludes it from morphing and can style/label it. There is no separate
`insets/` requirement.

## File set the app expects
- `assets/geo/national.svg` — all circuit outlines **and** all districts in the national composite
  projection (CONUS in Albers Equal Area; AK, HI, PR, GU, MP, VI baked in as `data-inset` boxes; D.C.
  as a magnified `data-inset` callout). Two layers: district paths and circuit paths.
- `assets/geo/circuits/<court_id>.svg` — one per **geographic** circuit (`ca1`–`ca11`, `cadc`): that
  circuit's mainland districts in the circuit-local projection, **same path ids and vertex order** as
  in `national.svg`, plus that circuit's own insets baked in. **No file for `cafc`** (Federal Circuit
  has no geography).

## Path conventions (every SVG)
- Root `<svg>` has a `viewBox` in projected units and **no** `width`/`height` (the app sets them).
- One `<g transform="scale(1,-1) translate(0, -(minY+maxY))">` flips geographic-Y (up) to screen-Y
  (down), where `minY`/`maxY` are the viewBox y-bounds. (In the reference, `minY+maxY = 552650.6`.)
- Each geographic shape is one `<path>` with:
  - `id="<court_id>"` (the CourtListener code; `geometry_key` == `court_id`),
  - `data-court-id="<court_id>"`,
  - `data-parent-circuit="<circuit court_id>"` (districts only),
  - `data-layer="district"` or `data-layer="circuit"`,
  - `data-inset="true"` on any inset/callout shape (excluded from morph; positioned in its box).
- **Path data must be absolute `M`/`L` only** — no curves, no relative commands, no `Z` shorthand
  substituting for repeated points. Uniform command structure is what makes point-by-point morphing
  trivial and robust. Multipolygons (islands, exclaves) use multiple `M...L...` subpaths; keep
  subpath order stable across both projections.
- `vector-effect: non-scaling-stroke` is applied in CSS, not inline.
- No inline fills/colors — the app colors shapes. Keep files free of styling and metadata cruft.

## Naming — the single source of truth for court ids
Every `id`, `geometry_key`, `court_id`, and `data-parent-circuit` value **must be the exact
CourtListener / `courts-db` court code**. This is non-negotiable: it's what makes geometry join to
judge data with zero mapping layer. Do **not** invent or guess codes.

- Authoritative machine-readable list: the Free Law Project **`courts-db`** repository
  (github.com/freelawproject/courtlistener → `courts-db`), and the human list at
  courtlistener.com/help/api/jurisdictions/. Pull the exact string from there for each court.
- **Circuits** (stable, safe to use directly): `ca1`…`ca11`, `cadc` (D.C. Circuit),
  `cafc` (Federal Circuit).
- **Districts** follow `<2-letter state><division><d>` — e.g. `cand` (N.D. Cal.), `txsd` (S.D. Tex.),
  `nysd` (S.D.N.Y.); single-district states drop the direction (e.g. `azd`, `ord`). **Confirm each
  exact code against `courts-db`** rather than deriving it — a few don't follow the pattern.
- **Specialized / territorial**: use the exact `courts-db` codes (e.g. `cit` for USCIT, `uscfc` for
  the Court of Federal Claims; Guam / N. Mariana / V.I. / P.R. district codes likewise from the list).

Ids are unique within each SVG file. A district and its circuit outline are linked only by the
district path's `data-parent-circuit`. Whatever `courts.csv.geometry_key` says for a court is exactly
the `id` its path must carry.

## Placeholder (use until real geometry arrives)
So Phase 0–1 can proceed, generate a trivial stand-in `national.svg` with a few labeled rectangles
acting as "circuits," each containing 2–3 smaller rectangles as "districts," following **all**
conventions above (ids, `data-*`, absolute `M/L`, Y-flip group, no inline color). Give the 8th
Circuit placeholder its real district `court_id`s so sample data wires up. Record in `PROGRESS.md`
that geometry is placeholder. When real files land, they drop in with no code change.

## Morph fallback
If a national/local pair ever fails the vertex-correspondence check (unequal counts/order), the app
must detect it at load, skip the morph for that circuit, and fall back to an animated
`viewBox`/transform **zoom** (optionally crossfading to the local SVG). Log which circuits fell back.
