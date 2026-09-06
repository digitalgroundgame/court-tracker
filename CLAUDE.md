# CLAUDE.md — Federal Court Appointment Tracker

**Read this file and `PROGRESS.md` at the start of every session before doing anything else.**
This project is built in phases across multiple sessions with a token budget. `PROGRESS.md`
is the source of truth for *where you are*; this file is the source of truth for *what and how*.

---

## 1. What we are building

An embeddable, interactive dashboard that shows, for every federal Article III court (plus two
Federal-Circuit feeders), the composition of its sitting bench: who appointed each judge, when,
their party, tenure, education, affiliations, and vacancies — on a map and in a detail pane.

It ships as a **modular widget** that drops into an existing article-hosting website inside a
single `<div>` with minimal interference, and must also work as a **static download** and when
archived (e.g. archive.org). No build step at runtime; plain ES modules + fetch.

## 2. Hard boundaries (do not cross these)

- **You own the web app and the data collection.** You do **not** create geographic geometry.
  All map shapes (`assets/geo/**`) are produced externally in QGIS and handed to you. If a
  geometry file is missing, build against the documented placeholder in `docs/GEOMETRY_CONTRACT.md`
  and record the gap in `PROGRESS.md`. **Never hand-draw, fabricate, or approximate a court's
  boundary.**
- **Never fabricate judge data.** Every value comes from a cited source. If you cannot source a
  field, leave it null and note it. `data_verified` is always `false` on write — a human verifies.
- **Affiliation fields (`fedsoc_*`, `acs_*`) are `true` only with a `*_source` URL** and a `*_basis`.
  Display them with hedged, attributed wording ("reported to be…"), never as asserted fact.
- **Respect image licensing.** Capture `photo_source` and `photo_license`. Prefer Wikimedia /
  public-domain / CourtListener images. If reuse terms are unclear, leave `photo_url` null and let
  the initials-avatar fallback handle it — do not embed an image you cannot license.
- **No secrets in the repo.** API tokens come from environment variables (`COURTLISTENER_TOKEN`).
- Do not edit files under a real user's read-only mounts; work only inside this repo.

## 3. Scope (authoritative)

- **The Supreme Court** (added 2026-07-18): its own selector entry + pane; the sitting nine
  only (a retired justice remains an Article III judge under 28 U.S.C. §371 but does not sit,
  so "senior" is never shown); no majority/senior explainer note.
- **13 courts of appeals**: 1st–11th, D.C. Circuit, Federal Circuit.
- **94 district courts**, including the three territorial district courts (Guam, N. Mariana
  Islands, Virgin Islands) and D.C. (which has exactly one district).
- **2 Federal-Circuit feeders**, reachable only by drilling into the Federal Circuit:
  U.S. Court of International Trade (USCIT, Article III, life tenure) and U.S. Court of Federal
  Claims (CFC, Article I, 15-year terms).
- **Judges included**: everyone who casts a binding vote on the merits — i.e. **active + senior**
  judges (life-tenured courts) and sitting fixed-term judges (territorial + CFC). Seniors are
  supernumerary and rendered distinctly (see §5). Not included: magistrate, bankruptcy, or purely
  historical judges.

### Tenure model
- `life_tenured` courts (Article III): active judges fill authorized seats; senior status vacates
  an authorized seat (→ a vacancy) while the judge keeps hearing panel cases.
- `fixed_term` courts (territorial Art. IV): 10-year terms, **no senior status**; the vacancy clock
  is `term_expiration_date`. Show *time served in current term* and *years remaining* instead of
  senior status.
- `fixed_term_senior` — **CFC only** (Art. I, 15-year terms). Not a blanket "CFC is Art. I so no
  senior status" case: it's a genuine hybrid, confirmed against the statute (discovered
  2026-07-15; see `docs/CODEBOOK.md`'s CFC carve-out note and `docs/DATA_SOURCES.md` for the full
  writeup). Active judges still serve a real fixed term exactly like the territorial courts
  (`term_expiration_date` drives their vacancy clock, "time served / years remaining" display) —
  **but** the court also has statutory senior status (28 U.S.C. §178): a senior judge stops
  counting against the 16 authorized seats and keeps hearing cases, same effect as a
  life-tenured court's senior status. Render seniors the life-tenured way (gray tint, outer band,
  "on the bench" not "current term"), actives the fixed-term way. Two more things worth knowing
  if the UI ever explains court mechanics: the Chief Judge is **designated by the President**
  (28 U.S.C. §171), not chosen by seniority as on Article III courts; and CFC decides every case
  through a **single judge, no panels, no en banc** (28 U.S.C. §174) — the majority toggle's
  generic "seniors generally don't vote en banc" explainer is already just as much a
  simplification for ordinary district courts, so it needs no CFC-specific carve-out.

## 4. Data (see `docs/CODEBOOK.md` for the full schema)

- **Primary source: CourtListener / Free Law Project.** Consult the current REST API docs
  (courtlistener.com/help/api/rest/) at collection time — do **not** assume an API version from
  memory. Use it for judges, positions/seats, appointing president, dates, education, ABA rating,
  and the profile URL (`cl_profile_url`).
- **Enrichment: Wikipedia / Wikimedia and web search** for `photo_url`, and for `fedsoc_*` / `acs_*`
  reported affiliation (with a source per claim).
- **Authorized judgeships** per court are statutory (28 U.S.C. §44 for circuits, §133 for districts);
  capture the current number in `courts.csv` and verify counts against CourtListener.
- Three CSVs are the human-verifiable source of truth: `data/judges.csv`, `data/courts.csv`,
  `data/circuit_justices.csv`. `scripts/build_assets.py` derives the runtime JSON + `manifest.json`.
- `president_party` is stored inline (no lookup table). Cache all API/web responses to disk so
  collection is resumable and re-runs are cheap.

## 5. UX contract

- **Two views.** *National*: circuit shapes are the primary layer, uniformly shaded, with district
  borders cutting them up; circuit names take label priority. *Circuit-local* (after drill-in):
  the circuit's districts, district names take priority.
- **Selector bar** (left) lists circuits (national view) or the circuit's districts (circuit view),
  and always lists non-geographic courts reachable in the current context. Selecting in the bar
  highlights the matching map shape and vice-versa.
- **Labels & hover.** Each shape shows its name when geometrically feasible, plus a cursor-following
  tooltip showing the name on hover (reuse the reference widget's overlay-path + `position:fixed`
  tooltip technique).
- **Info pane.** Single-click a shape → a pane **slides down over the map, covering it fully**
  (operator call 2026-07-17; it was "partially covering" until the docked judge-detail panel
  needed the room), with a **stow arrow** on its edge to hide/show it — stowing is how the map
  is consulted while a court is selected. It does **not** push host page content (fixed outer
  widget height, so the host article never reflows). On mobile it becomes a full-width sheet.
- **Judge icons** in the pane: face image (or initials fallback), ringed **red/blue by appointing
  president's party**, ordered oldest→newest by `commission_date`. Seniors get a **gray tint** over
  icon + ring and are labeled senior. **Vacancies** show as empty gray-outline seats; in the
  date-ordered view they park off to the side (no appointment date to order by).
- **Circuit view extras**: the applicable **Circuit Justice** (from `circuit_justices.csv`) renders
  elevated slightly above the arc's center and is excluded from majority math; the **chief judge**
  is marked.
- **Hover on an icon**: highlights the other judges appointed by the same president; shows a detail
  box for that one judge only — confirmation date + current term length, appointing president +
  party, name, JD school, CourtListener link, and any reported FedSoc/ACS affiliation (hedged).
- **Majority (seating-chart) toggle**: authorized bench as a **semicircle** (one seat per authorized
  judgeship; vacancies = empty seats in the arc); **seniors in a grayed concentric outer band**;
  ordered oldest→newest within an appointing-party sort; a **dotted majority line** and an **x/y
  count** computed over **active judgeships by default**, with a toggle to fold seniors in and a
  short explainer note (seniors generally don't vote en banc). Sorting is animated (icons track
  from their line positions onto arc positions).
- **Drill-in**: when a circuit is selected, a **"View districts"** control appears in the pane.
  Activating it focuses to the district layer, **morphing** national-projection outlines into the
  circuit-local projection; a **back** button reverses it. The pane reopens only when a district is
  picked (districts have no Circuit Justice).
  - **Federal Circuit special case**: it has no districts. "View districts"/back do nothing to the
    map; instead the selector bar repopulates with its feeders (USCIT, CFC), each clickable into the
    pane. USCIT/CFC are reached only this way (not top-level selector entries).
- **Insets**: AK, HI, PR render as composite insets (their own local projection), placed freely; no
  morphing for insets.

## 6. Architecture (option B: external, lazy-loaded assets)

- `embed/court-tracker.js` (ES module) + `embed/court-tracker.css` (all selectors prefixed `ctt-`)
  + a host `<div id="court-tracker-root">`. `index.html` is the standalone demo host (centered,
  ~1000–1100px cap, fluid below; keep this flexible — expect to tune it).
- All data and geometry are **fetched at runtime** and **lazy-loaded**: the national view loads only
  `courts.json` + `national.svg`; a circuit's judges and local geometry load on drill-in. Read
  `data/manifest.json` first for the file list + version (cache-busting).
- Must run from `file://` (static download) and when archived. Use **relative asset paths**, no
  absolute origins, no server-only APIs. Remote images may fail offline → the initials fallback must
  always work.
- Updating boundaries or judge data must be a **data-only** operation: drop in new CSV/SVG, re-run
  `build_assets.py`, bump the manifest version. No code changes. Treat this as a first-class
  requirement.
- Reuse the reference patterns from `docs/REFERENCE_NOTES.md`: scoped prefix, `viewBox` in projected
  units with a `scale(1,-1) translate(...)` Y-flip, `vector-effect: non-scaling-stroke`,
  top-of-paint-order overlay path for hover outline, cursor-following fixed tooltip.

## 7. Working protocol (start / pause / resume)

1. **Session start**: read `CLAUDE.md` + `PROGRESS.md`. Identify the current phase and the next
   unchecked task. Restate them in one line before starting.
2. Work in small, committable increments. Prefer finishing a task fully over starting several.
3. **When approaching the token budget or a natural stopping point**: update `PROGRESS.md` — check
   off completed items, write a dated session-log entry (what changed, what's next, any blockers),
   and leave the repo in a runnable state. Never stop mid-file-write.
4. Do not advance a phase until its Definition of Done in `docs/BUILD_SEQUENCE.md` is met.
5. If blocked by a missing external input (geometry SVGs, an API token), record the blocker, build
   against the documented placeholder/stub, and continue with unblocked work.
6. **Branch → PR → merge, never commit straight to `main`** (updated 2026-09-06, session (cp);
   supersedes the old "commit and push to main" rule from session (br)). This repo is linked to
   `origin` = `github.com/digitalgroundgame/court-tracker` (private) and now runs on GitHub Issues
   + PRs, not a bare push log:
   - **Session start**: in addition to `CLAUDE.md` + `PROGRESS.md`, check `gh issue list` and
     `gh pr list` (open state) for standing work and review feedback before assuming the next task
     is whatever `PROGRESS.md` says next — an open issue or a review comment on your own PR can
     supersede it.
   - **Per unit of work**: branch off `main` as `claude/<slug>` (matches the naming already in use
     in this repo's history). Commit CODE/DATA there only — **not** the `PROGRESS.md` ledger entry
     (see below for why and where that goes instead). `git add -A` (check `git status` first —
     verify nothing under `data/cache/`, `traces/`, or `node_modules/` snuck past `.gitignore`, and
     that no unexpected file is staged).
   - **Open a PR** (`gh pr create`) once the unit of work is done; reference the issue it addresses
     (`Fixes #N`) when there is one. Write the full session-log write-up (what changed, verification,
     what's next, blockers) into the **PR description** — this is where it lives while the branch is
     open, and it's the source text for the ledger commit below. The PR title should echo the
     write-up's heading (e.g. `(br) — GitHub linking + auto-commit protocol`) so GitHub's PR history
     reads as the same log as `PROGRESS.md`'s session log, browsable either place.
   - **Merge authority is case-by-case** (operator decision, 2026-09-06): merge routine/low-risk PRs
     yourself once clean (no CLAUDE.md boundary violations, tests pass). Leave anything touching
     data correctness, scope, or the UX contract — and any PR from a prior/different session you
     didn't just write — for the operator's explicit go-ahead; when in doubt, summarize the diff and
     ask rather than merge.
   - **The `PROGRESS.md` ledger entry is its own tiny branch → PR → merge, cut fresh at merge time**
     (added 2026-09-06, session (cp), after (cn)/(co)/(cp) all independently prepended an entry at
     the same top-of-log line and collided in a real 3-way merge conflict on `main`). Every session
     writes to the identical insertion point (right after `**Last updated:**`), so bundling that edit
     into a feature branch that might sit open for a while is what causes the collision — two
     branches cut around the same time will always fight over that line. The fix is **not** an
     exception that allows a direct commit to `main` (that would defeat the whole point of this
     section) — it's doing the ledger update through the *same* branch → PR → merge discipline, just
     on a branch with a lifespan of seconds instead of a whole session: immediately after merging the
     code PR, branch off the now-current `main`, add only the `PROGRESS.md` entry (adapted from that
     PR's description), push, open a PR, merge it. A branch that's created and merged in one breath
     essentially never overlaps with another one doing the same thing.
   - **Backstop**: `.gitattributes` sets `PROGRESS.md merge=union`, so even a genuine same-instant
     collision (or a hand-edit while a session is mid-flight) auto-resolves by keeping both sides'
     text instead of blocking on conflict markers — chronological ordering between two such entries
     may need a quick manual nudge afterward, but no merge should ever get stuck on this file again.
   - Skip opening a PR only if there is truly nothing to commit (pure investigation, no file
     changes) — but still check issues/PRs at session start regardless.

## Repo map
```
court-tracker/
├── CLAUDE.md              ← this file
├── PROGRESS.md            ← resumable ledger (update every session)
├── README.md             ← human-facing overview + embedding guide
├── INITIAL_PROMPT.md     ← the kickoff message (for the operator, not you)
├── index.html            ← standalone demo host (you build this)
├── embed/                ← the shippable widget: court-tracker.{js,css} + embed snippet
├── data/                 ← judges/courts/circuit_justices .csv (truth) + derived .json + manifest
│   └── cache/            ← GITIGNORED — raw API/web response + pre-crop photo cache, not in GitHub.
│                            Rebuilds itself (slowly, hitting live APIs) as collect_*.py/enrich_*.py
│                            re-run; absence after a fresh clone is expected, not a bug.
├── assets/geo/           ← EXTERNAL geometry: national.svg, circuits/<id>.svg, insets/ (you consume)
├── assets/photos/        ← cached judge images (tracked in git — this is what the widget serves)
├── scripts/              ← collect_courtlistener.py, enrich_wikipedia.py, build_assets.py, qgis_export_template.py
└── docs/                 ← CODEBOOK, DATA_SOURCES, GEOMETRY_CONTRACT, BUILD_SEQUENCE, REFERENCE_NOTES
```
Also gitignored (see `.gitignore`): `node_modules/` (restore via `npm install`), `traces/`
(DevTools performance captures), `data/out/` (a `qgis_export.py` staging copy that duplicates
`assets/geo/`), `.claude/scheduled_tasks.lock` (ephemeral runtime state).
