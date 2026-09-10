# Set upon map (archived 2026-09-10, issue #70)

## What it was

A way to deploy the Summary > District Courts cartogram directly onto the national map: a
"▼ Set upon map ▼" button in Summary > District's caption row deployed a draggable, resizable
copy of the district cartogram as a floating overlay on top of the map (with a "pull out of one
interface into another" flyover animation on deploy). Once deployed, a fixed D/×/−/+ control
cluster in the map viewport's top-right corner let you redeploy, remove, or resize it without
returning to Summary. The deployed assembly could be dragged to any position (clamped so at most
80% of its own width/height could go off any one edge) and its zoom (width) persisted across page
reloads via `localStorage` (position never did — every fresh deploy reset to a default bottom-right
placement).

Removed at the operator's explicit request (issue #70), replaced by zoom in/out controls on the
Summary > District Courts inline cartogram itself (see the live `renderSummaryDistrict` /
`positionAndClampDistrictZoom`-family code for what replaced this).

## What it depended on / interacted with

- **`highlightDistrictOnMap`, `wireDistrictCartogramHover`, `buildDistrictCartogramSVG`,
  `NO_DISTRICT_SUBASSEMBLY`, `renderDistrictSubassembly`, `updateDistrictSubassemblyVisibility` —
  NONE of these were removed.** They're shared with (or entirely belong to) the circuit-drill-in
  fixed sub-assembly, a separate, unrelated feature (the small non-draggable cartogram that always
  shows for a drilled-into circuit's own districts). The removed code was interleaved with these in
  the original source — `court-tracker.js.excerpt` here is a hand-assembled excerpt of ONLY the
  removed pieces, not a contiguous copy-paste; see its own leading comment for exactly what stayed
  around it.
- `NOMINAL_MAP_PX` (a shared viewport-size fallback constant) — not removed, used elsewhere too.
- The docked corner-controls DOM elements (`districtOverlay`, `districtCornerControls`) were
  created in `buildShell()` and referenced from `S.ui`, the resize handler, `togglePane()`,
  `drillIn()`/`drillOut()`, and the initial national-SVG-render path, and the per-mount reset — all
  small one-line-ish touch points, listed at the end of `court-tracker.js.excerpt` rather than
  reproduced verbatim (see the removal commit/PR's diff for exact context/line numbers).

## Files in this archive

- `court-tracker.js.excerpt` — the removed JS (constants, state helpers, the deploy/resize/drag/
  flyover/corner-controls functions), hand-assembled since the real removal was interleaved with
  kept sub-assembly code.
- `court-tracker.css.excerpt` — the removed CSS (`.ctt-district-overlay`, `.ctt-district-flyover`,
  `.ctt-district-corner-controls`, `.ctt-district-overlay-btn`, and the old `.ctt-district-deploy-
  btn` rule it replaced with the new zoom controls).
- `smoke.mjs.excerpt` — the removed jsdom regression block, plus a note on two individual lines
  removed from a KEPT test (the circuit drill-in / sub-assembly test, which referenced the deleted
  `overlay` variable in two spots).
- `browser-checks.mjs.excerpt` — the removed real-browser regression blocks. Two of these tests'
  underlying CONCERNS were preserved by adapting equivalent coverage onto the kept sub-assembly
  instead of dropping them silently — see the excerpt's own inline notes for which.

## Reintroducing this

1. Restore the excerpts above into their original files — the removal commit/PR's diff shows
   exactly where each one-line touch point (buildShell, resize handler, togglePane, drillIn/
   drillOut, the per-mount reset, `_dev` exports) went.
2. This will conflict conceptually with the zoom-in/out feature that replaced it in the same
   caption-row slot (`.ctt-district-deploy-btn` vs. the new zoom buttons) — decide whether both
   coexist or the zoom feature is removed first.
3. Re-run `npm run build` and the full test suite; re-verify the flyover animation and edge-
   clipping drag behavior visually in a real browser (jsdom/headless-Chrome geometry checks alone
   didn't fully cover the animation feel).
