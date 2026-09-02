# REFERENCE_NOTES — techniques to reuse from the prior widget

The prior self-contained `mo_districts_demo.html` (Missouri congressional districts) established a
clean, dependency-free pattern. Reuse these mechanics; ignore the congressional-margin specifics.

## Scoping & embedding
- All CSS selectors prefixed (there: `.mo-districts-*`; here use `ctt-`) so nothing bleeds into or
  from the host page. The whole thing lives inside one container the host drops in.
- Centered container via `max-width` + `margin: auto`. (Here: fluid up to ~1000–1100px, tunable.)

## SVG injection & sizing
- Inject SVG markup, then `removeAttribute('width'/'height')` and set
  `svg.style.aspectRatio = vb.width / vb.height` from the `viewBox.baseVal` so it has non-zero height
  inside a flex/responsive container.
- `viewBox` carries projected coordinates directly; a `<g transform="scale(1,-1) translate(...)">`
  flips geographic-Y (up) to screen-Y (down).

## Hover outline (do this, don't use filters)
- Append one overlay `<path>` as the **last child** of `<g>` (top of paint order),
  `pointer-events: none`, `visibility: hidden`.
- On `mouseenter` of a shape, copy its `d` onto the overlay and show it — a crisp outline with no
  z-fighting and no per-shape duplication.
- `vector-effect: non-scaling-stroke` keeps borders a constant screen width at any zoom.

## Tooltip
- A single `position: fixed` tooltip element, moved to follow the cursor on `mousemove`, with
  edge-detection that flips it to the other side of the cursor near the viewport edge. Reuse for the
  on-hover name box.

## What's new here (not in the reference)
- Two projections per shape + morphing (see `GEOMETRY_CONTRACT.md`).
- External lazy-loaded assets instead of inlined SVG strings.
- The info pane, judge-icon layer, majority semicircle, selector-bar two-way highlighting, drill-in,
  insets, and mobile sheet — all net-new.
