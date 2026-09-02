# BUILD_SEQUENCE — phases & Definitions of Done

Slice-first: prove the whole app on one circuit, then scale by *producing more assets*, not by
rewriting the app. Track live status in `PROGRESS.md`; this file defines the gates.

## Why slice-first (given option B)
Because data and geometry are external, lazy-loaded assets, "add the 9th Circuit" is a data drop,
not a code change. So the risk lives entirely in the app shell + asset schema. Phase 1 de-risks
both on a single circuit before any large data collection is attempted.

---

### Phase 0 — Scaffold & contracts
Build the empty runnable shell and the asset-build stub.
**Done when:** `index.html` opens from `file://` and renders an empty widget shell; `build_assets.py`
produces a valid empty `manifest.json`; a placeholder `national.svg` loads without error.

### Phase 1 — Vertical slice: 8th Circuit end-to-end
Everything in `CLAUDE.md` §5 (UX contract) working for the 8th Circuit only, with hand-authored
sample data covering the tricky cases (a senior judge, a vacancy, a same-surname pair, a court with
a Circuit Justice). If real 8th-Circuit geometry isn't available, use the placeholder and note it.
**Done when:** a reviewer can, for the 8th Circuit, on desktop and at ~380px mobile, from `file://`:
select it, read the pane, hover judges, toggle the majority semicircle (with animation, vacancies
in-arc, seniors banded, majority line + x/y), drill into districts (morph or documented fallback),
and return. No console errors.

### Phase 2 — Data collection sweep (all courts)
Resumable CourtListener pull + Wikipedia enrichment into the three CSVs, then JSON build.
**Done when:** all three CSVs are populated and pass `build_assets.py` validation; JSON + versioned
manifest build; per-circuit spot-checks recorded; `data_verified` uniformly `false`; authorized-seat
counts reconcile with statute.

### Phase 3 — Geometry integration (all circuits)
Wire the externally-provided national + per-circuit SVGs; enable morphing everywhere it's feasible;
insets; Federal-Circuit feeder behavior.
**Done when:** all 13 circuits + 94 districts are navigable on the map; AK/HI/PR insets work;
selecting the Federal Circuit repopulates the selector with USCIT + CFC (no map zoom); every
geographic circuit either morphs cleanly or falls back to zoom with the reason logged.

### Phase 4 — Polish, mobile, resilience
Accessibility, performance/lazy-load verification, offline/archive behavior, morph fallback, final QA.
**Done when:** the widget embeds via a single `<div>` + module/style includes without disturbing a
host page; works as a static download and when archived; passes the full §5 UX contract on desktop
and mobile-vertical.

---

## Definition-of-done checklist template (per task)
- Runs from `file://` with no console errors.
- Only the assets needed for the current view are fetched.
- New data/geometry can replace old with no code edit (data-only update).
- Matches the relevant clause of `CLAUDE.md` §5.
- `PROGRESS.md` updated with a dated session-log entry.
