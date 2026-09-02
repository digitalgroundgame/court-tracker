# INITIAL_PROMPT — paste this to start the Claude Code instance

Copy the block below as your first message to Claude Code, run from the repo root. It's deliberately
short: the durable spec lives in `CLAUDE.md` and the phase gates in `docs/BUILD_SEQUENCE.md`, so you
never have to re-paste requirements. For later sessions, use the "Resume" block instead.

---

## First session

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
Resume work. Read CLAUDE.md and PROGRESS.md. Identify CURRENT PHASE and the first unchecked task,
restate them in one line, and continue from there. Honor all boundaries in CLAUDE.md. When you near
the token budget or finish a phase, update PROGRESS.md (checkmarks + a dated session-log entry) and
leave the repo runnable.
```

---

## Recommended Claude Code settings / parameters

- **Model:** the strongest available coding model; this is a large multi-session build.
- **Working directory:** the repo root (so `CLAUDE.md` is auto-loaded as project context).
- **Web access: ENABLED and required** — CourtListener API, Wikipedia/Wikimedia, and web search for
  data collection (Phase 2). Without it, Phase 2 cannot proceed.
- **Environment:** set `COURTLISTENER_TOKEN` (free API token) as an env var; never commit it.
- **File writes:** allow within the repo; the instance authors app code, scripts, and the CSV/JSON
  data. It must **not** write geometry — `assets/geo/**` is provided externally.
- **Local preview:** allow running a static file server (or opening `file://`) to self-test each phase.
- **Commits:** if using git, commit per completed task with a message naming the phase; this pairs
  with `PROGRESS.md` for clean resume points.
- **Guardrails to restate if the instance drifts:** no fabricated data (null + note instead);
  `data_verified` always false on write; affiliation flags require a source + basis; images require a
  known license; relative asset paths only (must work offline / archived); data/geometry updates must
  never require code edits.

## Operator to-dos in parallel (outside the instance)
- Produce the QGIS geometry per `docs/GEOMETRY_CONTRACT.md` (a separate web-Claude session can adapt
  `scripts/qgis_export_template.py` and supply county lists to dissolve). Drop results into
  `assets/geo/**` when ready — the app is built to accept them with no code change.
- Obtain a CourtListener API token.
- After Phase 2, spot-verify data and flip `data_verified` to true on reviewed rows.
