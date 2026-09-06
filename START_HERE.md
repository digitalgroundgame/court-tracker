# START_HERE — operator runbook (part one)

Picks up **after** you've placed the package files in the working folder. Takes you through setup,
freezing the court-code contract, and running the two tracks in parallel up to the 8th-Circuit slice.
Work top to bottom; don't skip the ✅ checkpoints — they're where you catch problems cheaply.

Two tracks run **concurrently** after Stage B:
- **App track** — the Claude Code instance builds the web app + data tooling.
- **Geometry track** — you + a separate web-Claude session + QGIS produce the map SVGs.
They only converge later, at Phase 3. Nothing before Phase 3 needs real geometry.

---

## Stage A — Sync files & prerequisites

1. **Refresh to the latest package files.** Several files were added/updated after your first
   placement — overwrite your copies with the newest versions:
   - new: `.claude/settings.json`, `docs/GEOMETRY_PRODUCTION_PROMPT.md`, `README.md`
   - updated: `CLAUDE.md`, `PROGRESS.md`, `docs/GEOMETRY_CONTRACT.md`, `scripts/qgis_export_template.py`
2. **Confirm the tree** matches `CLAUDE.md` → Repo map. You should have `CLAUDE.md`, `PROGRESS.md`,
   `INITIAL_PROMPT.md`, `README.md`, `START_HERE.md` at root; `.claude/settings.json`; `docs/` with
   the six docs; `scripts/qgis_export_template.py`; and empty `assets/geo/` and `data/`. (The instance
   will create any other folders it needs.)
3. **CourtListener token.** Register for a free Free Law Project / CourtListener API token, then in the
   terminal you'll launch Claude Code from:
   `export COURTLISTENER_TOKEN=...` (add it to your shell profile so it persists). Needed for Phase 2,
   but set it now. While you're there, optionally `export COURT_TRACKER_CONTACT=...` — an email or
   URL the collection scripts append to their User-Agent so Wikimedia et al. can reach whoever is
   crawling. It stays in your shell, never in the repo.
4. **Install Claude Code** if you haven't (`npm install -g @anthropic-ai/claude-code`; requires Node.js
   — check the Claude Code docs for the current minimum). You'll need a Claude subscription or API key
   for auth.
5. **Install QGIS** (qgis.org) for the geometry track. Can wait until Stage C.

✅ Before moving on: tree matches the repo map; token is exported in your shell; `claude` runs.

---

## Stage B — Launch the app track and freeze the court skeleton

The court-code list is the one contract both tracks share, so lock it first.

1. **Open a terminal in the repo root** (so `CLAUDE.md` auto-loads and `.claude/settings.json`
   applies) and run `claude`.
2. **Paste the "First session" block** from `INITIAL_PROMPT.md`. Let it run **Phase 0**, which now:
   scaffolds the repo, **authors `data/courts.csv` skeleton** (identity/hierarchy/geometry columns) by
   pulling codes from `courts-db`, stubs `build_assets.py`, adds a placeholder `national.svg`, and
   confirms an empty shell loads.
3. **Review `data/courts.csv` before anything depends on it** — this is the freeze point:
   - 13 circuits present: `ca1`–`ca11`, `cadc`, `cafc`.
   - 94 districts present (incl. territorial `gud`, `nmid`, `vid`; and `dcd`).
   - `cit` (USCIT) and `uscfc` (CFC) present as `specialized`, `parent_id = cafc`.
   - `has_geography = false` for `cafc`, `cit`, `uscfc`.
   - `is_inset = true` for exactly the six insets: `akd`, `hid`, `prd`, `gud`, `nmid`, `vid`.
   - `tenure_type = fixed_term` for the territorial districts + `uscfc`; `life_tenured` otherwise.
   Fix any errors now. **After this, treat the `court_id` values as immutable** — changing a code later
   breaks the geometry↔data join.
4. **Open `index.html` from disk** (double-click / `file://`) to confirm the empty shell renders.
5. **Back up:** compress the folder to a dated archive (your chosen backup method). This is your first
   clean checkpoint.

✅ Before moving on: `courts.csv` skeleton is reviewed and correct; codes are frozen; empty shell loads.

---

## Stage C — Start the geometry track (in parallel)

Do this as soon as the skeleton is frozen; it runs alongside Stage D.

1. **Open a fresh web-Claude session** (not the Claude Code instance, not this planning chat).
2. **Paste the PROMPT block** from `docs/GEOMETRY_PRODUCTION_PROMPT.md`, and **attach**
   `docs/GEOMETRY_CONTRACT.md` and your frozen `data/courts.csv`.
3. Work its deliverables in order, pausing to review each:
   - **D1 `county_to_district.csv`** — start from the openICPSR crosswalk (project 100069), verify
     against 28 U.S.C. §§ 81–131. Spot-check a multi-district state (e.g. NY or TX), Virginia
     independent cities, and the territories.
   - **D2 `qgis_export.py`** — the finished export script (dissolve → topology-preserving simplify →
     reproject → write SVGs). Confirm it encodes *merge-first, simplify-once, export-twice* and bakes
     insets as `data-inset`.
   - **D3 `GEOMETRY_STEPS.md`** — your QGIS runbook.
4. **Do the QGIS work** per D3: download TIGER/Line county-equivalents, load the crosswalk, run the
   scripted dissolve, run the topology-preserving simplify (GRASS `v.generalize` or mapshaper), run
   `qgis_export.py`. Iterate tolerance + inset placement until it looks right and the vertex-parity
   check passes.
5. **Tip — build the 8th Circuit first.** Producing `ca8` (and its districts) before the rest lets you
   test real geometry in the slice (Stage E) and shakes out the pipeline on one circuit.
6. Drop finished files into `assets/geo/national.svg` and `assets/geo/circuits/<id>.svg`.

✅ Before moving on: `qgis_export.py` runs clean; vertex-parity passes for the districts you've built;
at least `ca8` geometry exists.

> Optional hard-lock: once real geometry is in `assets/geo/`, add
> `"deny": ["Write(assets/geo/**)", "Edit(assets/geo/**)"]` to `.claude/settings.json` so the app
> instance can't touch your operator-owned geometry. (Don't add it earlier — Phase 0 writes the
> placeholder there.)

---

## Stage D — Let the app track finish the 8th-Circuit slice (Phase 1)

Back in the Claude Code instance (same session, or relaunch and paste the **Resume** block from
`INITIAL_PROMPT.md`):

1. Let it work Phase 1 — the 8th Circuit end-to-end with hand-authored **sample** data (a senior
   judge, a vacancy, a same-surname pair, a Circuit Justice). It builds against the placeholder
   geometry until yours arrives.
2. **Review the slice** against `CLAUDE.md` §5, on desktop and at ~380px mobile, from `file://`:
   select the circuit; read the slide-down pane (stow arrow works; page doesn't reflow); hover judges
   (same-president highlight + single detail box with hedged affiliation); toggle the majority
   semicircle (vacancies in-arc, seniors banded, majority line + x/y, animated sort); drill into
   districts and back. No console errors.
3. When it hits the Phase 1 Definition of Done, confirm `PROGRESS.md` got a dated session-log entry.
4. **Back up** the folder again.

✅ Before moving on: the 8th-Circuit slice passes the §5 walkthrough on desktop and mobile.

---

## Stage E — Capstone: real geometry into the slice

When `ca8` geometry from Stage C is ready:

1. Ensure `assets/geo/national.svg` + `assets/geo/circuits/ca8.svg` are in place (replacing the
   placeholder for the 8th Circuit).
2. Reload `index.html`; confirm the 8th Circuit now shows real shapes and the drill-in **morphs**
   (or cleanly falls back to zoom, with the reason logged).
3. **Back up.**

✅ Part one is done when the slice runs on real 8th-Circuit geometry, desktop + mobile, from disk.

---

## What comes next (not part one)
- **Phase 2** — the instance runs the CourtListener sweep + Wikipedia enrichment to populate all
  three CSVs (this is where the token matters), then you spot-verify and flip `data_verified` to true.
- **Geometry** — finish the remaining circuits + insets on the geometry track.
- **Phase 3** — integrate all geometry; **Phase 4** — polish, mobile, offline/archive resilience.

**Resume protocol reminder:** any time you return to the app track, relaunch `claude` in the repo root
and paste the Resume block; it reads `PROGRESS.md` and continues. Back up after each phase.
