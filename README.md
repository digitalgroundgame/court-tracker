# Federal Court Appointment Tracker

An embeddable, interactive dashboard of the federal Article III judiciary: for each circuit and
district court, who appointed each sitting judge, when, their party, tenure, education, reported
affiliations, and vacancies — on a map and in a detail pane. Built to drop into an article-hosting
site as a single `<div>`, and to keep working as a static download or web archive.

## This package
This repo is the **specification + working scaffold** handed to a Claude Code instance, which builds
the app across phases. It is not the finished app yet.

| File | Purpose |
|---|---|
| `CLAUDE.md` | Project brief the instance reads every session (scope, UX contract, boundaries). |
| `PROGRESS.md` | Resumable ledger — phase status + session log. The instance updates it. |
| `INITIAL_PROMPT.md` | The message to paste into Claude Code, plus recommended settings. |
| `docs/CODEBOOK.md` | Authoritative schema for the three data CSVs. |
| `docs/BUILD_SEQUENCE.md` | Phases 0–4 with Definitions of Done. |
| `docs/GEOMETRY_CONTRACT.md` | Interface for the externally-produced QGIS map SVGs (morph invariant). |
| `docs/GEOMETRY_PROMPT.md` | Paste-ready prompt for the separate web-Claude session that guides QGIS SVG creation. |
| `.claude/settings.json` | Claude Code tool permissions (web access on, build commands pre-approved). |
| `docs/DATA_SOURCES.md` | Provenance, collection rules, verification checklist. |
| `docs/REFERENCE_NOTES.md` | Reusable techniques distilled from the prior widget. |
| `scripts/qgis_export_template.py` | Starter QGIS export enforcing "simplify once, export twice". |

## How the work is split
- **Claude Code instance** owns the web app (`embed/`, `index.html`) and data collection
  (`scripts/`, `data/`) via the CourtListener API + Wikipedia.
- **Operator (you)** owns the QGIS geometry (`assets/geo/**`) and final human verification of data.
- The two are decoupled: geometry and data are external, lazy-loaded assets, so either can be
  updated later by dropping in new files — **no code changes**.

## Getting started
1. Set a CourtListener API token: `export COURTLISTENER_TOKEN=...`
   Optional, but polite when running the collection scripts: `export COURT_TRACKER_CONTACT=...`
   (an email or URL a site operator could reach you at — it is appended to the scripts'
   User-Agent at run time, so no personal address is stored in the repo).
2. Open `INITIAL_PROMPT.md`, paste the "First session" block into Claude Code at the repo root.
3. Let it run Phase 0 → Phase 1 (an 8th-Circuit vertical slice). Review, then continue phases.
4. In parallel, produce geometry per `docs/GEOMETRY_CONTRACT.md` and drop it into `assets/geo/`.

## Embedding (once built)
The widget is a scoped ES module + stylesheet plus a root div:
```html
<div id="court-tracker-root"></div>
<link rel="stylesheet" href="embed/court-tracker.css">
<script type="module" src="embed/court-tracker.js"></script>
```
All selectors are `ctt-`-prefixed and asset paths are relative, so it won't disturb the host page and
keeps working offline / when archived. Update data or boundaries by replacing files in `data/` /
`assets/geo/` and bumping the manifest version — no code edits.

**In production, point at `dist/` instead.** `embed/` is the readable, heavily-commented source;
`dist/` is the same code minified (`court-tracker.js` 212KB → 71KB, its stylesheet 51KB → 21KB):
```html
<link rel="stylesheet" href="dist/court-tracker.min.css">
<script type="module" src="dist/court-tracker.min.js"></script>
```
`dist/` is committed, so a clone, a static download, and the data release all carry it without a
build step — and CI fails if it drifts from `embed/`. It must stay exactly one directory below the
repo root: both copies resolve their assets as `new URL("../", import.meta.url)`, which is what lets
either one find `data/`, `assets/geo/` and `assets/photos/`. The second widget embeds identically
(`appointments-chart[.min].{js,css}` into `<div id="appointments-chart-root">`).

## Development (tests and build)
```
npm install            # dev-only deps: jsdom (headless smoke) + esbuild (minifier)
npm test               # jsdom smoke suite against embed/
npm run build          # regenerate dist/ from embed/  — commit the result
npm run test:dist      # the same smoke suite against the minified build
npm run test:browser   # real-browser (CDP) checks jsdom structurally cannot make
```
`npm run test:browser` serves the repo on `localhost:8777` itself and drives headless Chrome; set
`CHROME_BIN` if your Chrome is not on `PATH` as `google-chrome-stable`. `npm run test:browser:dist`
runs those same checks against `dist/`. `.github/workflows/ci.yml` runs all of it on every push to
`main` and every pull request. The widgets themselves have **zero runtime dependencies** — nothing
in `node_modules/` ships to a reader.

## Syncing the data package (for external consumers)
Every push to `main` that changes `data/manifest.json` triggers `.github/workflows/release-data.yml`,
which tags the commit `data-v<manifest.version>` and cuts a GitHub Release. Nothing from
`data/cache/` or the geometry-source inputs is ever published. The release carries two assets, cut
from the same run and the same commit, so they are always the same `manifest.version`:

| asset | size | contains |
| --- | --- | --- |
| `data-package.tar.gz` | ~21MB | `embed/` (readable source) + `dist/` (minified build) + the runtime `data/*.json` + `assets/geo/` + `assets/photos/` |
| `data-json.tar.gz` | ~364KB | the runtime `data/*.json` only, same `data/` paths |

**Poll the releases (or tags) API, not the manifest on a branch.** The manifest lands on `main`
*before* the workflow cuts the release, so a consumer watching the manifest can see a version whose
release does not exist yet — and never will, if that run fails. Watching releases means you only
learn about a version once its artifact actually exists. It is also one request: the version is in
the tag name, so nothing needs fetching to detect a change.

**Then pick whichever of three shapes fits, in this order:**

1. **Pin to the tag** and fetch the files you need at that ref — the recommended default, and what
   the first consumer (Pragmatic Papers) does. The atomicity comes from the tag being immutable, not
   from an archive, so this is exactly as safe as downloading one, and you transfer only what you
   actually read.
2. **`data-json.tar.gz`** if you want a single immutable file to store, checksum, mirror, or hand to
   an offline process, and you render your own map and supply your own images. Photos and geometry
   are ~98% of the full package's bytes.
3. **`data-package.tar.gz`** if you need the photos and geometry too, or you are running the
   reference widget in `embed/` as shipped.

Whichever you pull, apply it atomically on your side — land it somewhere new and swap a pointer, so
a reader never sees a half-updated set.

## Scope at a glance
13 courts of appeals + 94 district courts (incl. territorial) + USCIT & CFC as Federal-Circuit
feeders. Judges = active + senior (life-tenured) and in-term (fixed-term). Article III focus, with
the two named Federal-Circuit feeders. Non-geographic courts live in the selector bar only.
