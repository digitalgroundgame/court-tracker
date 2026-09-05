# v0.1.0 — first public snapshot

Pre-1.0. The widget is feature-complete against the UX contract in `CLAUDE.md` §5 and runs
end to end on real data, but the data is machine-collected and not yet human-verified, and
the mobile/accessibility pass is still open (see **Known gaps** below).

An embeddable, interactive dashboard of the federal Article III judiciary: for every court,
who appointed each sitting judge, when, their party, tenure, education, reported
affiliations, and vacancies — on a map and in a detail pane.

## Data snapshot

| | |
|---|---|
| Manifest version | `05d95d9fcf1b` |
| Generated | 2026-09-05 |
| Last tracked appointment | 2026-06-18 |
| Coverage | 110 courts — 13 circuits, 94 districts, SCOTUS, and the two Federal-Circuit feeders (USCIT, CFC) |
| Judges | 1,490 sitting judges (active + senior on life-tenured courts, in-term on fixed-term courts) |
| Photos | 1,255 judges with a licensed, locally cached portrait; the remaining 235 render the initials avatar |

Judge data comes from the FJC Biographical Directory and CourtListener / Free Law Project;
authorized judgeship counts are statutory (28 U.S.C. §44, §133). **Every row carries
`data_verified=false`** — sourced and machine-checked, but not yet verified row by row by a
human. Reported Federalist Society / American Constitution Society affiliations are shown
as hedged, attributed claims with a per-claim source, never as asserted fact.

## What's in this release

- **`court-tracker-v0.1.0.zip`** — the static download: `index.html`, the widget, and exactly
  the data, geometry and photo assets the app fetches at runtime (1,321 files, 13 MB zipped /
  18 MB unpacked). Unzip anywhere and open `index.html`; no server, no build step, no network.
- **Source (auto-attached)** — the full repo, including the source-of-truth CSVs, the
  collection scripts, and `docs/`.

## Highlights

- **National map → circuit drill-in** with a true per-vertex morph on all 12 geographic
  circuits (D.C. Circuit takes the documented zoom+crossfade fallback), AK/HI/PR and the
  territorial courts as composite insets, and seat-block annotations that make even the
  Federal Circuit — which has no geometry at all — a first-class map target.
- **Bench pane** — judge icons ringed red/blue by appointing president's party, ordered
  oldest→newest, seniors gray-tinted, vacancies as empty seats, chief judge marked, the
  applicable Circuit Justice elevated and excluded from majority math.
- **Majority (seating-chart) view** — the authorized bench as an arc, one seat per
  judgeship, seniors in a grayed outer band, dotted majority line, and an x/y count over
  active judgeships with a fold-seniors toggle.
- **Docked judge-detail panel** — hover to preview, click to pin: appointing president and
  party, confirmation date, time in service, JD school, ABA rating, CourtListener link, and
  any hedged affiliation.
- **Summary tab** — SCOTUS ring-split, appellate view, and a district cartogram with a
  "set upon map" deployment mechanic.
- **Appointments beeswarm** — a second, independently embeddable widget over 2,792
  appointment events since 1969.
- **Header search** — judges searchable by name, with roving judgeships merged into one
  result and per-court jump buttons.

## Verification

`tests/smoke.mjs` — 482 assertions — passes against the **unpacked bundle** (not just the
repo), so every asset the app actually fetches is proven present in the download.

## Known gaps

- Mobile refinement and the accessibility pass (keyboard nav, alt text, contrast) are not
  done; the ~380px layout has never been eyeballed in a real browser.
- `file://` and archive.org behavior is verified structurally and headlessly, not yet by
  hand in a browser.
- Lazy-load/perf tuning ("only the needed assets load per view") is not yet re-verified.
- Final QA against the UX contract is pending.

## Embedding

```html
<div id="court-tracker-root"></div>
<link rel="stylesheet" href="embed/court-tracker.css">
<script type="module" src="embed/court-tracker.js"></script>
```

All selectors are `ctt-`-prefixed and all asset paths are relative, so the widget does not
disturb the host page and keeps working when the page is archived. Updating data or
boundaries stays a data-only operation: drop in new CSV/SVG, re-run
`scripts/build_assets.py`, re-tag — no code changes.
