# INITIAL_PROMPT — paste this to start the Claude Code instance

Copy the block below as your first message to Claude Code, run from the repo root. It's deliberately
short: the durable spec lives in `CLAUDE.md` and the phase gates in `docs/BUILD_SEQUENCE.md`, so you
never have to re-paste requirements. For later sessions, use the "Resume" block instead.

---

## First session

**Historical — Phase 0 completed 2026-07-10.** Retained for reference (e.g. bootstrapping a similar
project); an actual resuming session should use the **Resume** block below instead.

```
You are building an embeddable federal-court appointment tracker. Before doing anything, read
CLAUDE.md and PROGRESS.md in full, then docs/BUILD_SEQUENCE.md, docs/CODEBOOK.md, and
docs/GEOMETRY_CONTRACT.md. These define the scope, data schema, UX contract, architecture, and the
hard boundaries — follow them exactly and do not re-derive decisions already recorded there.

Then execute Phase 0 (Scaffold & contracts): create the repo skeleton per CLAUDE.md's Repo map,
stub scripts/build_assets.py to emit a valid empty data/manifest.json, add a placeholder
assets/geo/national.svg per docs/GEOMETRY_CONTRACT.md, and confirm index.html renders an empty
widget shell when opened from file://.

Work in small increments. When Phase 0's Definition of Done is met, update PROGRESS.md (check off
tasks, add a dated session-log entry) and begin Phase 1. If you approach your token budget, stop at a
clean point, update PROGRESS.md with what's done / what's next / any blockers, and leave the repo
runnable. Do not fabricate judge data or geometry; do not advance a phase until its DoD is met.

State the current phase and your immediate next step in one line, then start.
```

## Resume (every later session)

```
Resume work. Read CLAUDE.md and PROGRESS.md. Identify CURRENT PHASE and the first unchecked task.
Also check `gh issue list` and `gh pr list` (open state, per CLAUDE.md section 7 point 6) — an open
issue or a review comment on your own PR can supersede whatever PROGRESS.md says is next; say so if
it does. Restate the current phase and your actual next step (from whichever source wins) in one
line, then continue.

Honor all boundaries in CLAUDE.md, including the git workflow: branch -> PR -> merge, never a direct
commit to main; the PROGRESS.md ledger entry is its own fresh branch -> PR -> merge, cut right after
the code PR merges, not bundled into the feature branch. Merge authority is case-by-case — merge
routine/low-risk PRs yourself once clean, but leave anything touching data correctness, scope, the
UX contract, or a PR from a different/prior session for the operator's go-ahead.
```

---

## Recommended Claude Code settings / parameters

- **Model:** the strongest available coding model; this is a large multi-session build.
- **Working directory:** the repo root (so `CLAUDE.md` is auto-loaded as project context).
- **Web access: ENABLED and required** — the FJC bulk directory (no auth), Wikipedia/Wikimedia, and
  web search for data collection (Phase 2). Without it, Phase 2 cannot proceed. (Updated 2026-09-06:
  CourtListener's live API was dropped 2026-07-16 in favor of the FJC bulk export — see
  `docs/DATA_SOURCES.md` — so no API token is actually required; `COURTLISTENER_TOKEN` is a
  documented-but-unused env var, kept in case a live call is ever reintroduced.)
- **File writes:** allow within the repo; the instance authors app code, scripts, and the CSV/JSON
  data. It must **not** write geometry — `assets/geo/**` is provided externally.
- **Local preview:** allow running a static file server (or opening `file://`) to self-test each phase.
- **Commits:** branch -> PR -> merge per `CLAUDE.md` section 7 point 6 (not a direct commit to
  `main`); `gh` needs to be authenticated against the repo for this to work.
- **Guardrails to restate if the instance drifts:** no fabricated data (null + note instead);
  `data_verified` always false on write; affiliation flags require a source + basis; images require a
  known license; relative asset paths only (must work offline / archived); data/geometry updates must
  never require code edits.

## Operator to-dos in parallel (outside the instance)
- Produce the QGIS geometry per `docs/GEOMETRY_CONTRACT.md` (a separate web-Claude session can adapt
  `scripts/qgis_export_template.py` and supply county lists to dissolve). Drop results into
  `assets/geo/**` when ready — the app is built to accept them with no code change.
- After Phase 2, spot-verify data and flip `data_verified` to true on reviewed rows.
