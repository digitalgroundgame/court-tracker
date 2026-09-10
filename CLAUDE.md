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
- **Respect image licensing.** Capture `photo_source` and `photo_license`. Prefer Wikidata /
  Wikimedia Commons / public-domain images (no collection script pulls photos from CourtListener —
  corrected 2026-09-06, see §4). If reuse terms are unclear, leave `photo_url` null and let the
  initials-avatar fallback handle it — do not embed an image you cannot license.
- **No secrets in the repo.** API tokens/contact info come from environment variables — currently
  `COURT_TRACKER_CONTACT` (optional, User-Agent contact for the collection scripts; see
  `docs/DATA_SOURCES.md`). `COURTLISTENER_TOKEN` is a documented-but-presently-unused env var (see
  §4) — the pattern holds for it too, should it ever be needed live again.
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

## 4. Data (see `docs/CODEBOOK.md` for the full schema, `docs/DATA_CONTRACT.md` for the versioned
public-API policy, and `docs/DATA_SOURCES.md` for full collection methodology + provenance)

- **Primary source: the FJC Biographical Directory bulk export** (updated 2026-09-06 — corrects a
  stale claim this section carried since Phase 2). Judges/positions, commission/nomination/
  confirmation dates, appointing president + party, ABA rating, and JD school/year all come from
  the FJC directory, matched per appointment block. **CourtListener's live REST API is no longer
  called at all** (dropped 2026-07-16 — its active/senior/chief flags proved unreliable at
  collection time; see `docs/DATA_SOURCES.md`'s "Collection methodology as run"); it now supplies
  only `cl_person_id`/`cl_profile_url` via a bulk, unauthenticated people table, joined by FJC
  `jid` == CL `fjc_id`. `COURTLISTENER_TOKEN` is consequently unused by every collection script —
  do not assume a live authenticated CourtListener call is available or needed without checking
  `docs/DATA_SOURCES.md` first, since this has changed once already.
- **Enrichment: Wikipedia / Wikimedia and web search** for `photo_url`, and for `fedsoc_*` / `acs_*`
  reported affiliation (with a source per claim).
- **Authorized judgeships** per court are statutory (28 U.S.C. §44 for circuits, §133 for districts);
  capture the current number in `courts.csv`, verified against the FJC directory + statute (not
  CourtListener — see above).
- Three CSVs are the human-verifiable source of truth: `data/judges.csv`, `data/courts.csv`,
  `data/circuit_justices.csv`. `scripts/build_assets.py` derives the runtime JSON + `manifest.json`.
- **Changing the published JSON shape is a schema change, not just a code change** (added
  2026-09-06, session (cr)/issue #10): a field/file added, renamed, retyped, or an enum value
  added/removed in derived output requires bumping `SCHEMA_VERSION` in `build_assets.py` and adding
  an entry to `docs/SCHEMA_CHANGELOG.md`, **in the same PR as the code** — the version constant lives
  next to the derive step it describes on purpose. Whether it's MAJOR/MINOR/PATCH, what a consumer
  may assume, and the deprecation path are all in `docs/DATA_CONTRACT.md`. A pure data correction
  (fixing a wrong value) is not a schema change and needs none of this.
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
- **`embed/` is the readable source; `dist/` is its committed minified build** (added 2026-09-06,
  session (cp)/issue #5 — flagged as an implied `CLAUDE.md` gap, not silently added). Editing
  `embed/court-tracker.js`/`.css` or `embed/appointments-chart.js`/`.css` means running
  `npm run build` (`scripts/build_embed.mjs`, esbuild) and committing the resulting `dist/` in the
  **same** PR — `.github/workflows/ci.yml` hard-fails a PR where `dist/` has drifted from `embed/`
  (`git diff --exit-code -- dist`). `dist/` sits exactly one directory below the repo root, same as
  `embed/` — both resolve assets as `new URL("../", import.meta.url)`, so moving either breaks asset
  resolution. A pure data/geometry drop still needs no rebuild of `dist/` (nothing in it is
  data-derived) — this requirement is scoped to `embed/` source edits only.

## 7. Working protocol (start / pause / resume)

1. **Session start**: read `CLAUDE.md` + `PROGRESS.md`. Identify the current phase and the next
   unchecked task. Restate them in one line before starting. `PROGRESS.md`'s own
   `## Resume briefing` section (top of file) is the primary handoff artifact — read it before
   the phase checklists.
2. Work in small, committable increments. Prefer finishing a task fully over starting several.
3. **When approaching the token budget or a natural stopping point**: update `PROGRESS.md` — check
   off completed items, write a dated session-log entry (what changed, what's next, any blockers),
   and leave the repo in a runnable state. Never stop mid-file-write.
   - **`PROGRESS.md` logging convention** (added 2026-09-08, session (cp), after the top of the
     file had accumulated a ~2,400-line, 47-entry blockquote buffer over many sessions with no
     retirement mechanism): the file has exactly two places narrative goes, and they serve
     different purposes — do not let a third accumulation point regrow.
     - **`## Session log`**: the permanent, append-only history. Every session's write here is a
       *condensed* dated entry (a paragraph or few bullets, not a blow-by-blow) — write it
       condensed the first time; don't plan to compress it later.
     - **`## Resume briefing`** (top of file, right after `**Last updated:**`): a handoff note for
       the *next* session only. **Replace this section's content wholesale at session end — never
       append to it.** It should say: the immediate next task, any standing/parked issues worth
       knowing about, and conventions/gotchas established this session that aren't obvious from
       the code. If something in it is still relevant next time, it survives because the next
       session folds it into its own replacement — not because it was left in place.
   - **Verify the real current date before writing any dated entry** (added 2026-09-08, session
     (cp) — a real, confirmed incident: sessions `(bt)` through `(ce)` drifted up to +7 days ahead
     of their actual git-commit dates because an earlier session estimated or incremented "today"
     instead of checking it, and every session after silently copied the drift forward). Check the
     `currentDate` system reminder, or run `date +%Y-%m-%d`, immediately before writing a date into
     `PROGRESS.md` (session-log headers, the `Last updated` line) or any other dated record.
     **Never** infer today's date from the last logged entry, a session letter sequence, or
     elapsed conversation turns — those all compound the same drift. If you ever find a date that
     looks wrong, cross-check it against `git log --format=%ad` (actual commit timestamps are
     ground truth) before trusting or correcting it.
4. Do not advance a phase until its Definition of Done in `docs/BUILD_SEQUENCE.md` is met.
5. If blocked by a missing external input (geometry SVGs, an API token), record the blocker, build
   against the documented placeholder/stub, and continue with unblocked work.
6. **Branch → PR → merge, never commit straight to `main`** (updated 2026-09-06, session (cp);
   supersedes the old "commit and push to main" rule from session (br)). This repo is linked to
   `origin` = `github.com/digitalgroundgame/court-tracker` (public — was private through session
   (co), made public 2026-09-06 for GitHub Pages + a branch ruleset, reverted to private at some
   point before 2026-09-08 for reasons not tracked here, made public again 2026-09-08/09 session
   (cy) once issue #36's git-history scrub was complete) and now runs on GitHub Issues + PRs, not
   a bare push log. This section is the authoritative version of that policy — pinned
   issue #21 on GitHub is a human-facing pointer to it, not a second copy; if the two ever disagree,
   this file wins:
   - **Session start**: in addition to `CLAUDE.md` + `PROGRESS.md`, check `gh issue list` and
     `gh pr list` (open state) for standing work and review feedback before assuming the next task
     is whatever `PROGRESS.md` says next — an open issue or a review comment on your own PR can
     supersede it.
   - **Per unit of work**: branch off `main` as `claude/<slug>` (matches the naming already in use
     in this repo's history). Commit CODE/DATA **and** that unit of work's `PROGRESS.md` ledger
     entry together, in the same branch (reversed 2026-09-07, session (cp) — see below). `git add -A`
     (check `git status` first — verify nothing under `data/cache/`, `traces/`, or `node_modules/`
     snuck past `.gitignore`, and that no unexpected file is staged).
   - **Open a PR** (`gh pr create`) once the unit of work is done; reference the issue it addresses
     (`Fixes #N`) when there is one. Write the full session-log write-up (what changed, verification,
     what's next, blockers) both into the **PR description** and into the `PROGRESS.md` entry itself
     — the two should read as the same text. **Title the PR `(letter) — Heading`, matching the
     `PROGRESS.md` entry's heading exactly** — with `--squash` (below), that title becomes the
     commit message that actually lands on `main` (GitHub appends `(#N)`), so the PR title, the
     landed commit, and the `PROGRESS.md` heading all stay in sync and are browsable interchangeably.
   - **Merge authority is case-by-case** (operator decision, 2026-09-06): merge routine/low-risk PRs
     yourself once clean (no CLAUDE.md boundary violations, tests pass). Leave anything touching
     data correctness, scope, or the UX contract — and any PR from a prior/different session you
     didn't just write — for the operator's explicit go-ahead; when in doubt, summarize the diff and
     ask rather than merge.
   - **Merge with `--squash`, not `--merge`** (operator decision, 2026-09-07, adopting a contributor
     suggestion — see `PROGRESS.md` for the full discussion). **Now server-enforced, not just
     documented practice**: the repo's merge-method setting has `allow_merge_commit: false`, so
     GitHub refuses a plain `--merge` outright. With multiple sessions merging into `main`
     concurrently, a branch that falls behind needs `main` merged back into it to resolve, which
     creates a "merge main in" commit on that branch — squashing collapses that (and every other
     intermediate commit) into the one commit that actually lands on `main`, so conflict-resolution
     noise never becomes permanent history. This changes nothing else about how a conflict gets
     resolved (still commit the resolution immediately, verify content directly, never switch
     branches mid-resolution) — only the final `gh pr merge` flag. **Prospective only**: this does
     not mean rewriting the merge commits already on `main` to look squashed — that would be a
     history rewrite, the
     same risk category as issue #36, not implied by adopting this going forward. Check that the
     `Co-Authored-By` trailer survives into the squash commit rather than assuming it does.
   - **Hard stop, stricter than the above: any change to `CLAUDE.md`, `PROGRESS.md`'s
     instance-protocol block, `INITIAL_PROMPT.md`, or any other file a session reads before doing
     work, always needs explicit operator discussion before merging** (operator decision, 2026-09-06
     — prompted by the risk that a PR from a different contributor could bundle a change to one of
     these files alongside unrelated work, altering how *future* sessions behave without the
     operator ever weighing in). This applies even when the rest of the PR is otherwise routine —
     check a PR's file list for these specifically, call out that part on its own, and get an
     explicit go-ahead on it before merging any of it. Session behavior is something the operator
     consciously signs off on, not a side effect of merging a feature PR.
     **This has two distinct triggers, not one** (clarified same day): a PR's own diff touching one
     of these files is the obvious case, but a PR can also *imply* a needed change without ever
     touching them — it establishes a new standard, policy, or invariant that a core file now
     describes incompletely or incorrectly unless updated. (Concrete example: PR #26 added the
     `SCHEMA_VERSION`/`docs/DATA_CONTRACT.md` policy without touching `CLAUDE.md` at all, but a
     future session changing the published JSON shape now needs to know to bump it — so this file
     needed a new paragraph regardless.) Recognizing the implied case takes reading a PR for what
     it's establishing, not just diffing its file list — flag it and get the operator's go-ahead the
     same way as the direct case, as its own explicit step, before implementing or merging it.
   - **The `PROGRESS.md` ledger entry rides in the same branch/PR as the code it describes**
     (reversed 2026-09-07, session (cp), adopting a second contributor suggestion — supersedes the
     "cut a fresh branch for it" rule from the day before). That rule existed because (cn)/(co)/(cp)
     had all independently prepended an entry at the same top-of-log line and collided in a real
     3-way conflict — but the actual fix for that collision is the `.gitattributes` union-merge
     driver below, not the separate-branch dance, and paying two PRs per unit of work for it stopped
     being worth it once `--squash` meant the ledger-only PR was landing as its own extra commit on
     `main` anyway. Write the entry as part of the normal commit; if a real collision happens, the
     union driver auto-resolves it (below) rather than blocking the merge.
   - **`.gitattributes` sets `PROGRESS.md merge=union`** — the actual mitigation for the shared
     top-of-log insertion point every session writes to. A same-spot collision (two branches open
     concurrently, or a hand-edit while a session is mid-flight) auto-resolves by keeping both
     sides' text instead of blocking on conflict markers; chronological ordering between two such
     entries may need a quick manual nudge afterward, but no merge should ever get stuck on this
     file. This is what makes bundling the ledger entry back into feature branches (above) safe.
   - Skip opening a PR only if there is truly nothing to commit (pure investigation, no file
     changes) — but still check issues/PRs at session start regardless.
   - **When resolving a merge conflict on someone else's PR branch, commit it before doing
     anything else** (added 2026-09-06, session (cp) — a real incident, not a hypothetical): a
     fully-resolved-but-uncommitted merge was silently corrupted when a branch switch (to go handle
     a different PR) intervened before the commit — git carried some uncommitted file changes across
     and dropped others with no error, and the loss wasn't caught until a later explicit content diff
     (a passing test run had not caught it). If a conflict resolution can't be committed immediately
     for some reason, stash it explicitly (`git stash push -u`) rather than leaving it bare in the
     working tree, and verify the committed tree's actual content — not just a green test run —
     before pushing, especially for a conflict that touched files beyond the obvious one.
7. **Large removals default to archive, not delete** (added 2026-09-10, prompted by the operator's
   issue #65 review of a standing feature-removal backlog): when removing a feature at the
   operator's explicit request, move its own code into `archive/<feature-slug>/` (see
   `archive/README.md` for the layout) with a `NOTES.md` — what it was, why it was removed, what
   it depended on, and what reintroducing it would take — in the **same PR** as the removal,
   unless the operator says otherwise for that specific removal.
   - **Archive the feature's own code; delete everything the removal makes vestigial.** Anything
     that only existed to support the removed feature — dead state fields, now-unused helper
     functions, orphaned CSS selectors, now-dead data/manifest entries — gets deleted outright, not
     archived. A removal that leaves any of this half-wired in (a flag nothing reads any more, a
     button that silently does nothing) is not complete.
   - **State both categories explicitly in the PR description**, under a "Removed / made
     vestigial" heading: the feature's own archived code, and everything else deleted as a side
     effect.
   - **Verify in a running browser before merging, not just from the diff**: click through the
     surrounding UI (not only the removed feature's own surface) to confirm nothing adjacent
     regressed or silently disappeared. A removal PR's diff alone is not sufficient verification.
   - A pure data/geometry correction, or removing something that was never real functionality (an
     inert placeholder, dead code that already did nothing), needs none of this — say so in the PR
     description instead of archiving it.

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
│   ├── manual/           ← TRACKED (updated 2026-09-07, issue #3 — this used to live gitignored
│   │                        under cache/ and silently regressed on every fresh clone, incl. a real
│   │                        2026-08-27 incident that wiped curated photos). Hand-authored/curated
│   │                        inputs with NO automated source: territorial_judges_manual.csv (the
│   │                        only source for gud/nmid/vid judges), manual_photos.json (curated-photo
│   │                        registry enrich_wikipedia.py must never overwrite), photo_thumbs.json
│   │                        (url→thumbnail lookup — missing it doesn't error, it silently reverts
│   │                        every photo to hotlinking), fjc_manual_overrides.csv (CFC per-field
│   │                        patches, usually absent/empty — that's normal).
│   └── cache/            ← GITIGNORED — genuinely regenerable raw API/web response + pre-crop photo
│                            cache only, not in GitHub. Rebuilds itself (slowly, hitting live APIs)
│                            as collect_*.py/enrich_*.py re-run; absence after a fresh clone is
│                            expected, not a bug — unlike data/manual/ above, which is not optional.
├── assets/geo/           ← EXTERNAL geometry: national.svg, circuits/<id>.svg, insets/ (you consume)
├── assets/photos/        ← cached judge images (tracked in git — this is what the widget serves)
├── scripts/              ← collect_courtlistener.py, enrich_wikipedia.py, build_assets.py, qgis_export_template.py
├── archive/              ← removed-but-reintroducible feature code, see §7's "Large removals" rule
└── docs/                 ← CODEBOOK, DATA_SOURCES, GEOMETRY_CONTRACT, BUILD_SEQUENCE, REFERENCE_NOTES
```
Also gitignored (see `.gitignore`): `node_modules/` (restore via `npm install`), `traces/`
(DevTools performance captures), `data/out/` (a `qgis_export.py` staging copy that duplicates
`assets/geo/`), `.claude/scheduled_tasks.lock` (ephemeral runtime state).
