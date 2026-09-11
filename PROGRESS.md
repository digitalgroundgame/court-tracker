# PROGRESS.md — resumable work ledger

> **Instance protocol.** At session start, read `CLAUDE.md` then this file. Find `CURRENT PHASE`
> and the first unchecked `[ ]` task. Restate them in one line, then work. Before stopping (or when
> near the token budget), check off what you finished, add a dated **Session log** entry, and leave
> the repo runnable. Do not advance a phase until its Definition of Done (`docs/BUILD_SEQUENCE.md`)
> is met. `[x]` done · `[~]` in progress · `[ ]` not started · `[!]` blocked (note why).

**CURRENT PHASE:** Phase 4 — Polish, mobile, resilience — now spanning TWO widgets: the
tracker (Phase-4 tail items open; the third pane view — "Change" — was removed 2026-09-10, issue
#67, archived in `archive/change-view/`; the map-deployed "Set upon map" district overlay was
removed the same day, issue #70, archived in `archive/set-upon-map/`) and the appointments
beeswarm (feature-complete first version, operator refinement rounds ongoing; see sessions ai→at,
aw, dx, dy, dz).
**Last updated:** 2026-09-11 (dz)

## Resume briefing
<!-- Replaced wholesale at the end of each session — this is not an appended log, it's a
briefing for the next session only. Session narrative belongs in ## Session log below;
this section should say only what's needed to pick the work back up cleanly. -->

**Where things stand**: a non-backlog, operator-reported bug — the edge stow tab ("▼ Show") stayed
visible but inert after fully deselecting a court (nothing left to reveal) — was fixed this session
on branch `claude/stow-arrow-hidden-when-inert`, PR open awaiting operator review (see Session log
below). **Issue #71 (dark mode + typography theming) remains deferred and not started**, but its
scope is fully resolved: see the comment posted on issue #71 (2026-09-11) rather than re-reading
old open questions here — six backlog issues' (#65-#70) impact on #71's view inventory, the font
property scope expansion (runtime-switchable, same mechanism as color), the beeswarm widget
confirmed IN SCOPE, every originally-open question answered, and a proposed 3-PR phased breakdown
(1. token audit, no visual change; 2. runtime mechanism + initial dark theme + demo switch + docs;
3. `tools/theme-editor.html` authoring tool). **No further design questions should be needed
before starting PR 1 of #71 whenever it's next prioritized — this is the natural next task once
the current small PR is reviewed.**

**Working rhythm (still in force, operator ask 2026-09-10): pause after finishing each unit of
work for review — don't self-merge, don't start the next thing without explicit go-ahead.** See
[[operator-wants-pr-review-before-merge]].

**`/tmp` environment gotcha (recurring, not yet fixed at the root — see prior sessions' notes)**:
`tests/browser-checks.mjs:11` (`MARK = \`/tmp/ctbc-${process.pid}\``) creates a fresh Chrome
profile dir on every `npm run test:browser` run and never cleans it up — hardcoded to `/tmp`,
doesn't honor `TMPDIR`/`os.tmpdir()`. Has twice filled `/tmp` to 100% across recent sessions,
including blocking the harness's own output capture entirely. **Was healthy this session** (4%
used at last check) — the operator's manual cleanup at the end of the previous session held. Still
worth fixing the test runner itself before it recurs.

**Housekeeping still not acted on**: issues #50, #60, #62 all have MERGED PRs (#56, #61, #63) but
were never closed on GitHub — still just tidiness, not urgent.

## Phase 0 — Scaffold & contracts  ✅ DONE (2026-07-10)
- [x] Create repo skeleton per `CLAUDE.md` §Repo map; confirm `index.html` loads an empty shell.
      → `index.html` (demo host) + `embed/court-tracker.{js,css}` (prefix `ctt-`). Shell chrome
      (header, selector bar, map viewport, stowed info pane, tooltip) builds synchronously before
      any fetch, so the frame renders even where `file://` fetch is restricted.
- [x] **Author the `courts.csv` skeleton** (identity/hierarchy/geometry columns) — 109 courts:
      13 circuits (`ca1`–`ca11`,`cadc`,`cafc`), 94 districts, 2 specialized (`cit`,`uscfc`).
      Codes are CourtListener/`courts-db` codes; `geometry_key == court_id`. All START_HERE Stage-B
      freeze checks pass (insets = akd/hid/prd/gud/nmid/vid; fixed_term = gud/nmid/vid/uscfc;
      no-geo = cafc/cit/uscfc). `authorized_judgeships` from 28 U.S.C. §44/§133 + territorial titles.
      Reproducible via `scripts/gen_courts_skeleton.py`. **Court codes are now FROZEN.**
- [x] Stub `scripts/build_assets.py` (CSV→JSON + `manifest.json`) — emits valid manifest even when
      CSVs are absent (verified empty-case first); now builds `courts.json` + versioned manifest.
- [x] Add placeholder `assets/geo/national.svg` per `docs/GEOMETRY_CONTRACT.md` — rectangles honoring
      all conventions (viewBox in projected units, Y-flip group, absolute M/L, id==court_id, data-*,
      no inline color). 8th Circuit carries its REAL district ids for the Phase-1 slice.
- [x] Confirm the shell runs from `file://` — all assets serve 200; SVG well-formed; JS parses.
      NOTE: Chromium blocks `file://` fetch; shell still renders + shows a graceful note pointing to
      Firefox or `python3 -m http.server`. Full data load verified over http.server.

## Phase 1 — Vertical slice: 8th Circuit, end-to-end
Prove the whole app shell and asset schema on one circuit with hand-authored sample data.
- [x] Hand-author sample rows for the 8th Circuit + a district (2026-07-11). REAL, SOURCED judges
      from the FJC Biographical Directory (`scripts/gen_sample_8th.py`): 9 ca8 circuit judges
      (7 active / 2 senior → 4 vacancies of 11 authorized) + 9 E.D. Mo. (`moed`) judges (7 active /
      2 senior). Covers every tricky case: seniors (Melloy, Wollman; Sippel, Fleissig), vacancy,
      same-surname pair (Lavenski + Justin **Smith** → `L. Smith`/`J. Smith`), chief (Colloton, Clark),
      Circuit Justice (`circuit_justices.csv`: Kavanaugh, sourced to supremecourt.gov), R/D + ABA mix
      (incl. real "Not Qualified": Grasz, Pitlyk). `cl_person_id`/`seat_id` null (CourtListener join in
      Phase 2); `cl_profile_url` = FJC bio node; `data_verified=false`. `build_assets.py` extended:
      codebook validation + lazy-loadable per-circuit judge bundles (`data/judges/<circuit>.json`,
      commission-ordered, circuit + its districts) + `circuit_justices.json`. All validation passes.
- [x] National view: selector bar (13 circuits) + real `national.svg` + hover overlay + cursor
      tooltip (court name). Shape click ⇄ selector highlight both ways.
- [x] Single-click → slide-down info pane with stow arrow (▲/▼); shape auto-scrolls into view.
- [x] Judge icons: initials avatar (photo when present), red/blue ring by `president_party`, senior
      gray tint, vacancy dashed-outline seats, oldest→newest by `commission_date`; chief ★-badged;
      Circuit Justice elevated + excluded from majority math.
- [x] Icon hover: same-appointing-president highlight + single pinned detail panel (name, president+
      party, confirmed date, time-in-service, JD, ABA, CourtListener link, hedged FedSoc/ACS w/ source).
- [x] Majority toggle: semicircle (one seat/authorized judgeship), vacancies in-arc, seniors in grayed
      outer band, dotted majority line, x/y over **active** judgeships by default + fold-seniors toggle
      + en-banc explainer; animated (CSS-transitioned transforms track icons between timeline↔arc).
- [x] "View districts" drill-in via **zoom+crossfade** (documented fallback per contract §Morph
      fallback; true vertex-morph deferred to Phase 3/4 for visual tuning) + back button. Federal
      Circuit special case: selects, then "View feeders →" repopulates selector with USCIT/CFC, no map.
- [~] Mobile vertical layout: CSS written (selector stacks/wraps; pane = full-width sheet; detail
      panel goes static). **Partially visually verified at ~380px in a real browser, finally**
      (issue #7, session (cp), 2026-09-07/08) — national view, Timeline, Majority, and a drilled
      district pane are genuinely clean (real screenshots + permanent `tests/browser-checks.mjs`
      coverage). **Not exhaustive**: a real-device operator review of the same work found two
      genuine text-overlap bugs in states this pass never checked (Summary tab; the tri-selector/
      pane-button area) — tracked in issue #50 along with a larger collision-avoidance algorithm
      spec. Leave at `[~]` until #50 is closed.
- **Verification:** headless jsdom regression test `tests/smoke.mjs` — **28/28 assertions pass** end
      to end (mount→select ca8→counts 11/7active/2senior/4vacant→hover→majority "R 6 of 7 · majority 4",
      fold→"of 9"→drill to 10 districts→moed pane (no Justice)→back). Robust to the malformed exported
      Y-flip transforms: the app **recomputes the Y-flip from each SVG's viewBox** at inject time.
- **DoD:** substantially met on desktop (headless-verified). REMAINING before closing Phase 1:
  operator visual pass in a real browser (Firefox for `file://`, or http.server) confirming map render,
  animation feel, and the ~380px mobile layout. Then flip [~] → [x].

## Phase 2 — Data collection sweep (all courts)
- [x] `collect_courtlistener.py`: resumable, cached sweep → `data/judges.csv` (**1,483 sitting judges**,
      863 active / 620 senior, all 109 courts, `data_verified=false`). Sourcing (see DATA_SOURCES):
      FJC Biographical Directory is the authoritative spine (CL's active/senior/chief flags are
      unreliable — missing terminations, null retirement dates); CourtListener **bulk people** table
      (`people-db-people-2026-06-30`) supplies `cl_person_id`+profile URL joined by `jid`==`fjc_id`
      (+ unique-name fallback; 239 unmatched → no CL link). Fixed-term courts (gud/nmid/vid/uscfc) from
      CL positions, over-inclusive + flagged. NOTE: CL live API is hard-rate-limited (hit a 2102s
      Retry-After) → switched the join to bulk data, so the sweep now runs fully offline from cache.
- [x] `enrich_wikipedia.py`: **DONE (2026-07-14)** — photos + reported `fedsoc_*`/`acs_*`, live in the
      demo. Joined by **identifier, not name**: Wikidata **P12000** == FJC `nid` → 1,359/1,483 judges
      linked. **Photos: 1,094 judges (74%) + 13/13 Circuit Justices**, license-gated (only pd/cc0/cc-by
      written; 2 rejected on unclear terms → initials fallback). 71 CC-BY(-SA) images carry
      `— credit: <author>` and render a required attribution line; 1,029 PD render none.
      **Affiliation: 111 fedsoc / 3 acs**, all with a source URL + basis, displayed hedged. Claims are
      sentence-scoped + subject-guarded + relative/negation-guarded (see DATA_SOURCES for the four
      rules and the false positives each one kills). Every claim AND all 19 deliberately-unclaimed
      mentions are logged to `data/cache/wiki/affiliation_audit.csv` for the human verifier.
      Fully re-runnable offline: `python3 scripts/enrich_wikipedia.py --no-net`.
      **Read `fedsoc_reported=false` as "unreported on Wikipedia", never as "no affiliation."**
- [x] Populate `circuit_justices.csv` — all 13 circuits, sourced to supremecourt.gov allotment
      (2022-09-28); Roberts→4th/DC/Fed, Alito→3rd/5th, Kavanaugh→6th/8th, etc.
- [x] `build_assets.py`: emits `courts.json` + 13 per-circuit judge bundles + `circuit_justices.json`
      + versioned manifest; **codebook validation passes**. Smoke test `tests/smoke.mjs` updated to
      assert structure/arithmetic (not fixed sample counts) — **56/56 pass** on real data.
- [x] Spot-check + reconciliation recorded in `docs/DATA_SOURCES.md`: totals vs §44/§133 reconcile;
      7 over-full courts each explained (CFC over-inclusion; KY/MO/OK roving judgeships; minor FJC lag).
      Verified e.g. ca9 = 29 active (== authorized) / 22 senior / chief Murguia.
- **DoD:** three CSVs populated + schema-valid, JSON builds, counts reconcile with statute — **MET**,
  now including the photo/affiliation enrichment. `data_verified` uniformly false (human step pending).
  **PHASE 2 COMPLETE.**
- [x] **`uscfc` (CFC) re-collected 2026-07-15, made systematic + extended to `gud`/`nmid`/`vid`
      2026-07-16.** The original CL-sourced roster was stale for `uscfc` (13 departed judges
      wrongly carried as active, 10 sitting judges missing, 5 mislabeled) and, checked directly
      2026-07-16, also for `vid` (missed a May 2026 appointment). `uscfc` now has a real,
      re-runnable scraper against FJC's non-bulk per-judge pages
      (`fjc_cfc_rows()`/`collect_courtlistener.py`); `gud`/`nmid`/`vid` have a documented, cited,
      drift-checked manual CSV (`data/cache/territorial_judges_manual.csv` +
      `territorial_manual_rows()` — no systematic source exists for these three, checked
      directly) with `docs/TERRITORIAL_EXTRACTION_PROMPT.md` as the reusable refresh procedure.
      Also surfaced/fixed: the `fixed_term_senior` tenure_type (CFC has statutory senior status
      the territorial courts lack); a holdover-status UI gap (Guam's Tydingco-Gatewood is
      genuinely serving past her expired term under 48 U.S.C. §1424b); a "years remaining"
      display gap; an inaccurate "district courts never sit en banc" claim (corrected against
      Bruhl, *District Courts En Banc*, 90 Fordham L. Rev. 1469 (2022) — rare, not impossible);
      the enrichment (photo/FedSoc/ACS) pipeline extended to reach all four courts via a
      Wikidata name-search bridge; and, incidentally, a real pre-existing cache-key bug in
      `enrich_wikipedia.py`'s Commons/Wikipedia batch caching (positional keys silently served
      stale batches when the input file list's composition changed — fixed with content-hashed
      keys). Full writeup: `docs/DATA_SOURCES.md`'s 2026-07-16 entry (supersedes the
      2026-07-15 one). Verified: `tests/smoke.mjs` 180/180, `check_geometry.py` PASS/0.

## Phase 3 — Geometry integration (all circuits)  ✅ DONE (2026-07-14)
- [x] Consume provided `national.svg` + `assets/geo/circuits/<id>.svg`; wire `geometry_key`.
      → `check_geometry.py` **PASS, 0 warnings**; real-browser screenshots render the national map
      and every circuit-local view. The app recomputes the Y-flip from each viewBox, so the
      malformed exported transforms are moot. Geometry files untouched (operator-owned).
- [x] **Enable morphing national→local for every geographic circuit.** True per-vertex morph, built
      2026-07-14. **Verified on all 12 geographic circuits**: ca1–ca11 morph; `cadc` correctly
      declines (its only district is an inset callout → nothing to interpolate) and takes the
      documented zoom+crossfade fallback, logged per the contract.
      **How it works** (see the block comment above `parsePathAbs` in `court-tracker.js`): both SVGs
      carry their own `scale(1,-1)` Y-flip, which would fight a shared interpolation, so the morph
      layer **bakes each file's flip into the coordinates** and runs with no group transform. Then
      u=0 reproduces the national layer and u=1 the circuit-local layer exactly, while the viewBox
      **and the element's aspect-ratio** (which drives the letterbox — without it the handoff jumps)
      interpolate alongside. Non-target shapes fade; insets **crossfade** national-box → local-box.
      **Measured**: handoff delta (morph at t=0.995 vs the settled local layer) ≤ 0.05% of map pixels
      on every circuit (8 of 12 are ≤ 0.01%); a full drill in+out returns the national view
      **pixel-identical (0 px)** to a never-drilled one; **60fps** (median 16.7ms/frame, worst 17ms,
      zero frames >32ms) on the heaviest benches (ca5 5,810 verts/frame, ca9 5,459).
      `prefers-reduced-motion: reduce` skips the animation (verified: 0px from settled at 2100ms,
      vs 4.83% still animating normally).
- [x] AK/HI/PR composite insets placed and interactive.
      → All **7** insets (akd, hid, prd, gud, nmid, vid + the dcd callout) asserted present in
      `national.svg` and routing to the right parent circuit; AK asserted interactive + selecting ca9.
- [x] Federal Circuit selector-repopulation (USCIT/CFC) behavior; USCIT/CFC selector-only.
      → Now covered: offers "View feeders" (not "View districts"), adds **no** map layer, repopulates
      with cit+uscfc, CFC opens its pane, and USCIT/CFC are asserted **absent** from the top-level
      selector (reachable only via the Federal Circuit).
- **DoD:** all 13 circuits + 94 districts navigable; insets work; Federal Circuit feeders reachable
  — **MET**. `tests/smoke.mjs` **107/107**.

## Phase 4 — Polish, mobile, resilience
- [x] **Header search bar** (session cf, 2026-09-05; feature added this session, beyond the
      original plan): judges searchable by name, right-aligned in the title band. See session
      log for the full design.
- [x] **"Last tracked appointment" header line** (session ay, 2026-08-25): `manifest.json` gains
      `last_appointment` (= max `commission_date` across all judges, data-driven so it only moves
      when a real sweep lands a new appointment); rendered above the title as `.ctt-tracked`.
- [x] **Data hole-patching pass** (session ay, 2026-08-25): fixed a real degree-matching bug
      (`fjc_law_degree()` missed "B.C.L."); confirmed the remaining `cl_person_id`/`aba_rating`
      gaps are genuine (not bugs) and annotated 10 rows' `notes` accordingly. See session log.
- [x] **Pipeline data-loss audit** (session az, 2026-08-25): fixed `collect_courtlistener.py`
      and `collect_appointments.py` so they preserve fields they don't own across re-runs
      instead of depending on strict script-ordering discipline to avoid destroying them.
- [x] **Photo pipeline: over-blur fixed (3 rounds), false-positive fixed, missing-photo count
      365 -> 316** (sessions ba/bb, 2026-08-25): `cache_photos.py`'s adaptive blur was capped
      too high and applied even to already-small sources; both fixed and verified live. Added a
      Wikipedia-pageimage fallback + ran 15 individual-research subagents (all circuit judges +
      a 5-district sample) to close 27 more photo gaps, all personally visually verified.
      **Data refresh (new appointments since 2026-07-30) is still pending** - next session.
- [x] **Seat-block map annotation** (feature added this session, beyond the original plan): one
      square per authorized judgeship per court, grouped by appointing party with vacancies last;
      circuits on the national view (labelled), districts on their circuit-local view. Derived to
      `data/seat_blocks.json` by `build_assets.py` (counts only) so the national view stays lazy.
      Position in map units, size a constant 6.5 CSS px. Blocks are first-class map targets (hover/
      select/tooltip like their shape) — which is how `cafc`, with no geometry at all, is now
      reachable on the map. **Operator-tuned: 105/107 courts placed** via `tools/tune-seat-blocks.html`;
      placement stays a data-only change (CSV -> build -> done).
- [x] **Drill-in freeze — REOPENED 2026-07-15, re-diagnosed and FIXED (session t).** The (j)
      memory-rate fixes were real but were never the freeze. True cause, proven with the
      operator's DevTools traces + a headed real-GPU reproducer (`tests/freeze-hunt.mjs`): the
      renderer's **Compositor thread spins at 100% in pure userspace inside ONE
      `LayerTreeHostImpl::CalculateRenderPasses`** (3.65s captured; unbounded when maximized)
      while the main thread blocks in `WaitForCommitCompletion` — needs the **morph's
      per-vsync full-map commits** (144/s on the operator's 144Hz display) **plus a high-rate
      mouse stream** (operator's mouse is ~1000Hz). Page hover handlers irrelevant (freezes
      with `pointer-events:none` on everything). Fix: `MORPH_MIN_COMMIT_MS = 16` — the morph
      loop skips vsync ticks (no DOM writes) until 16ms since the last committed frame; the
      final frame always commits. No-op on 60Hz; ~48fps on 144Hz. Verified: worst case
      (maximized + 500Hz synthetic storm) went from hard-freeze-at-cycle-0 every run to clean
      40-cycle runs; under a brutal 1000Hz storm a rare ~4s **recoverable** stall remains
      (~1 per 80 cycles, reproducible even with the morph animation fully disabled —
      Chrome-internal, see session log (t)).
      Earlier (j) fixes kept (they cut memory, which was a real but separate problem): stale
      morph layers swept; morph transparency layers ~95 -> 4; idle layers `display:none` not
      `opacity:0` (painted layers 13 -> 1); fade opacity off CSS custom properties
      (RecalcStyle -8.6x, main-thread Task -29%).
- [x] Morph fallback logic finalized (zoom+crossfade when a pair fails vertex correspondence).
- [x] **"Mobile" freeze — TRUE ROOT CAUSE of the freeze family found and FIXED (session y,
      2026-07-17).** Operator hit a new freeze testing the mobile layout (devtools device
      toolbar / narrow windows); desktop full-width stayed fine. Hunted down to something far
      sharper than (t)'s convoy story: **seat-block LABELS (`<text>` in a scaled `<g>`) inside
      the morph layer lock up Chrome's compositor text rasterization while the morph's viewBox
      interpolation sweeps their device scale** — the Compositor thread spins at 100% inside
      one `CalculateRenderPasses`, exactly the (t) signature. Proven DETERMINISTIC: a single
      drill, zero input, at 680-700px viewport widths (band shifts per circuit) spins every
      time; capture-screenshot hangs while the main thread stays responsive (a half-frozen
      state that eval-based probes misread as "clean" — several earlier verdicts were revised).
      Bisected at the deterministic width: hide morph-layer block labels → cured; squares,
      hit-rects, district paths, `vector-effect`, aspect-ratio writes, `d` writes all
      exonerated (viewBox-write removal helped — it is what sweeps the label scale).
      **Fix: one CSS rule, `.ctt-morph-layer .ctt-block-label { display: none }`** (labels
      vanish only for the ~620ms morph; static layers keep them). Verified: 690px single-drill
      fixed; mobile 380px + 500Hz storm 30 cycles clean; desktop maximized + 500Hz clean;
      660/680/700/720 sweep clean; smoke **192/192** (adds a guard assertion on the rule),
      browser-checks pass. Reframing of (t): the commit cap remains useful (it cut exposure —
      fewer viewBox writes per second = fewer chances to land in the bad scale band) but the
      label bomb was the underlying cause all along; with labels out of the morph layer no
      freeze config remains reproducible at any tested width, rate, or layout.
- [x] **Hover border flicker FIXED (session x, 2026-07-17).** Operator: hovering any shape made
      the white district + gray circuit hairlines "flicker/tremble" map-wide for a moment.
      Cause: the seat squares' `transition: transform 90ms` — a CSS transform transition on an
      SVG rect can't composite, and Chrome's promotion attempt at animation start/end
      re-rendered hairline AA across the WHOLE map for the 90ms window (measured with
      `tests/flicker-check.mjs`: ~14,000 changed px map-wide per hover toggle; without the
      transition ~3,600 px confined to the hovered court). Fix: scale values moved to JS
      (`BLOCK_SCALE_*`), eased by `animateBlockScale()` with per-frame inline transforms (no
      Animation object → local repaints only). Verified both views; smoke asserts no CSS
      transition returns to `.ctt-sq`.
- [x] **GPU memory "ratchet" investigated and CLOSED as benign (session x).** The ~10-20MB/cycle
      VRAM growth is NOT a leak and NOT Chrome-held: memory-infra dumps show Chrome's GPU
      allocators small and flat (Skia cache ~20MB, shared images ~23MB, transfer cache ~9MB)
      while the driver's per-process fb climbs — it is the NVIDIA driver's DEFERRED reclamation
      of objects Chrome already freed (the drill churn creates+destroys whole-map textures).
      Measured (`tests/gpu-ratchet.mjs` + nvidia-smi pmon): bounded ~390-550MB band under 50
      rapid cycles (a big mid-activity reclaim fired at 552MB); ~10s of true idle settles to a
      ~317MB warm-cache plateau (budgeted Skia + decoded-photo caches); tab-backgrounding drops
      near baseline. Release triggers are idle/pressure-driven, so they never fire DURING
      interaction — that is the whole "ratchet". No app-side reference held; no action needed.
- [x] **Docked judge-detail panel (session z, 2026-07-17; operator-specified redesign).** The
      floating judge tooltip corner-snapped whenever the cursor crossed the pane's midlines and
      always covered something (judges, names, the yellow same-president outlines). Replaced
      with a dedicated, uninterrupted panel: desktop = the stage area splits into a flex row
      (`.ctt-stage-row`: stage + its notes left, `.ctt-detail` fixed 232px right, stretch
      height), mobile = the row stacks so the panel sits BELOW the stage and notes (DOM order
      is the stacking order; the old bottom-sheet overlay + its 150px reserved padding are
      gone — the panel is in flow and can never cover the bench). Hover updates it in place;
      content is STICKY on hover-out (links reachable without pinning); click pins (frozen
      against hovers, accent border + close button); clicking elsewhere unpins so hover drives
      it again (operator-confirmed semantics). New: large 84px avatar with party ring / senior
      tint / initials fallback. Fit adjustments: note margin 18->6, body padding 16->12,
      stage-row margin 0 (majority view had 19px of pane overflow in the narrower column);
      arc `cy` H-26 -> H-32 (the baseline icons overhung the stage box and cleared the note by
      only ~0.5px — the margin trim exposed it; browser-checks caught the 0.5px overlap on
      CFC). The detail node must be RESCUED to `pane` before `paneBody.innerHTML=""` wipes
      (it now lives inside the body). smoke **195/195** (sticky/docked/avatar assertions
      replace hide-on-unpin), browser-checks **8/8**. Known cosmetic: the majority arc is
      slightly tighter in the narrower column (R0 derives from stage width) — flagged to the
      operator.
- [x] **Full-height pane + adaptive majority arc + small-bench arc buffers (session z cont.,
      operator asks).** (1) `.ctt-pane` 82% -> **100%** of the map (it mostly covered it anyway
      and the docked detail needed room; `--tall` variant now inert; CLAUDE.md §5 updated —
      stowing is how the map is consulted while selected). (2) Majority stage height is now
      **adaptive** (`majorityStageHeight()`: pane-body room minus everything above the stage
      and EVERY visible note below it — the territorial always-note counts too, vid's was
      clipped when only the majority-note did; clamp 320-520). More height = larger Rmax; ring
      cap raised 3 -> 4 for the biggest folded benches. Measured: ca8 majority stage 424px,
      zero pane overflow on ca8/ca9/vid/med in both modes — even ca9's 51-judge timeline now
      fits unscrolled. (3) **2-3 seat benches get arc-buffered angles** (single ring, ≤3 seats:
      k·π/(x+1) -> 2 seats at 120°/60°, 3 at 135°/90°/45°) instead of stretching to the 180°/0°
      endpoints (operator: two judges facing off looked weird). Multi-ring benches keep shared
      endpoints. (4) **Fixed a real double-mount bug found via the new `visual.html?c2=` param**:
      `autoMount()` fires on import AND visual.html calls `mount()` explicitly — two CONCURRENT
      mounts interleaved their clear-then-fill of `districtsByCircuit`, so every drilled
      selector listed its districts TWICE in a real browser (invisible in jsdom's timing, and
      the national list survived because `S.courts` is a Map). Mount now carries a sequence
      token and yields at each await if superseded; sequential re-mounts stay supported.
      smoke **195/195**, browser-checks **8/8**. Known cosmetic: ca9's 22-senior outer band is
      dense (single band by design) — multi-band seniors would be a separate ask.
- [x] **Operator batch, 2026-07-18 (session aa) — six asks + the beeswarm dataset.**
      (1) Timeline|Majority is now a segmented control (shared CSS with None|FedSoc|ACS).
      (2) Majority arc: bottom-half "bowl" tried, then **superseded 2026-07-19 (session ab)
      by the operator's alternate fix** — the TOP-half dome is back, hugging the stage
      bottom, with the R/D-appointed count text moved BELOW the arc baseline (y = cy+54,
      fixed relative to the arc centre; `majorityDims` cy = H-68). The variable whitespace
      sits above the dome where it labels nothing. Floor stays 360. (3) **Docked detail panel is pixel-identical across modes**
      (probe: top 161/height 481 in both): pane-body is a flex column, the stage row absorbs
      leftover height, and the fold-seniors row moved INSIDE the left column (it was pushing
      the row down in majority mode). Fold row also hides when a bench has no seniors.
      (4) **SCOTUS data collected systematically** — the FJC bulk spine already covers it:
      court `scotus` (level `scotus`, 9 seats) in courts.csv/skeleton; sitting bench = rows
      with NO senior date (a retired justice is senior-dated + untermed, 28 U.S.C. §371 —
      Breyer/Kennedy correctly excluded); Chief via `Appointment Title`; own lazy bundle
      `judges/scotus.json`; enrichment 9/9 licensed photos + 4 hedged FedSoc.
      (5) **CIT/CFC seat-block arrays on the map in the feeder view** ("CIT"/"CFC" labels,
      parked below Fed, side by side; default anchors = offsets from cafc's anchor, operator
      can tune via seat_blocks.csv rows cit/uscfc; swept on Back; smoke-asserted both ways).
      seat_blocks.json now carries level:"feeder" entries; renderSeatBlocks sweeps PER LEVEL.
      (6) **SCOTUS selector entry (own "Supreme Court" group, first) + pane**: meta without
      a senior figure, ordinary party rings (no purple Circuit-Justice styling), no
      majority/senior note in either mode. smoke **207/207**, browser-checks **8/8**.
      (7) **`data/appointments.csv` + .json** (manifest `files.appointments`): 2,792
      appointment events since Nixon (1969-01-20) for the future beeswarm — CODEBOOK Table E
      + DATA_SOURCES 2026-07-18 for schema/caveats (retired-justice departure = senior_date;
      CFC departed = year-precision terminations; territorial historical = documented gap;
      51 reorganization rows flagged). Widget does not read it yet.
- [~] **~380px mobile layout, partially eyeballed for real (issue #7, session (cp), 2026-09-07/08)**
      — carried unchecked since Phase 1. Screenshotted via `tests/shoot.mjs` across national view,
      Timeline, Majority, and a drilled-in district pane; those render cleanly, text wraps sensibly,
      no overflow. Investigated two states that LOOKED broken in manual screenshots and root-caused
      both as testing artifacts, not app bugs: the Majority arc's apparent "cut off" is
      `.ctt-pane-body`'s intentional `overflow-y:auto` internal scroll (CLAUDE.md §6's fixed outer
      widget height), confirmed genuinely reachable by scrolling, not just cosmetically scrollable;
      Timeline's "missing" icons were an under-settled screenshot capture, not app state. Both are
      now permanent CI assertions in `tests/browser-checks.mjs`, not just one-off screenshots — a
      resized CDP session (not a second Chrome launch) re-evaluates the `max-width: 640px` layout
      query, then asserts the pane's overflow is real AND that scrolling it actually clears the
      last icon's position, not merely that a scrollbar exists.
      **NOT exhaustive, corrected 2026-09-08 after operator review**: a real DevTools device-toolbar
      pass (once `tests/visual.html` got the viewport meta tag it was missing — see below) found two
      genuine text-overlap bugs in states this pass never checked at all — the Summary tab, and the
      pane's tri-selector/stow-close-button area. Filed as **issue #50** along with a much larger
      judge-icon-label collision-avoidance algorithm spec. Left at `[~]`, not `[x]`, until #50 closes.
- [x] **Hover-only-interaction audit (issue #7)**: every hover affordance (map shapes, seat
      blocks, judge icons) already had a full `click` equivalent doing real work, not just
      cosmetic feedback — `onIconClick` already calls the same `highlightCohort()`/`showDetail()`
      a hover would, plus pins the panel. Verified live, not just read: a new
      `tests/browser-checks.mjs` assertion clicks a judge icon with ZERO hover ever dispatched
      (this whole test file already never simulates hover anywhere) and confirms the cohort
      highlight + detail box populate. The one already-Pointer-Events-based drag interaction
      (district-overlay resize) checked out too — `setPointerCapture` + `touch-action: none`.
      **Not done** (separate from this issue's own scope): keyboard nav, alt text, contrast —
      a real accessibility audit, still open below.
- [ ] **Accessibility pass** (keyboard nav, alt text, contrast) — split out from the old combined
      mobile+a11y line above now that the mobile half is genuinely done; this half never was.
      Note seat blocks are constant-px, so they read relatively larger on a small map.
- [ ] Lazy-load/perf tuning; verify only-needed assets load per view.
- [ ] Verify static-download + archive.org behavior (relative paths, offline image fallback).
      NOTE: 1,094 judge photos are **remote** Wikimedia URLs -> initials fallback offline (allowed
      by contract). Consider caching to `assets/photos/` if the download story needs better.
- [ ] Final QA against the UX contract in `CLAUDE.md` §5.
- **DoD:** ships as an embeddable div, works offline as a download, holds up mobile-vertical.

---

## Session log
<!-- Newest first. Format:
### YYYY-MM-DD
- Phase: N
- Did: ...
- Next: ...
- Blockers: ...
-->

### 2026-09-11 (dz) — Fixed: edge stow tab ("▼ Show") stayed visible-but-inert after fully deselecting a court
- Phase: 4. Operator-reported bug, no GitHub issue filed (worked directly on branch
  `claude/stow-arrow-hidden-when-inert`). Not part of the #65-71 backlog; issue #71 remains
  deferred (see Resume briefing).
- Root cause: `.ctt-pane-stow` (the small tab poking out at the top of the map viewport,
  `embed/court-tracker.js`'s `stow` button) is a single toggle serving two different situations
  that look identical from the DOM's perspective — "a court is selected but its pane is stowed"
  (▼, clicking correctly re-opens it) and "nothing is selected at all" (initial page load, or
  right after the × close button / re-clicking an open selection / drilling out of a circuit all
  call `deselect()`/clear `S.selectedCourt`). The button was rendered unconditionally by CSS in
  both cases, so after a full deselect the tab stayed visible showing "▼" with genuinely nothing
  for it to reveal — clicking silently did nothing.
- Fix: `stow` now starts with the existing `ctt-hidden-hard` utility class (hidden by default,
  since nothing is selected at mount) and `togglePane()` toggles that class on `!S.selectedCourt`
  on every call — every state-changing path (`selectCourt`, `selectSummary`, `deselect`,
  `drillOut`) already sets `S.selectedCourt` before calling `togglePane`, so this one line covers
  all of them without touching each call site.
- Added smoke-test coverage: initial mount (nothing selected) starts with the tab hidden; the tab
  stays visible while a court is selected even with its pane stowed (existing edge-tab-reshow
  coverage, now also asserting non-hidden); deselecting fully hides it again.
- Verified: `npm test` (smoke) + `npm run test:browser` (real browser, `/tmp` was healthy this
  session — 4% used) — ALL PASS. `npm run build` — `dist/` rebuilt, committed in the same branch.
- Next: operator review of this PR, then issue #71 (dark mode + typography theming) is next up —
  scope fully resolved, ready for PR 1 whenever prioritized.
- Blockers: none.

### 2026-09-11 (dy) — PR #80 MERGED (operator approved, "this looks excellent, you can go ahead and squash it")
- Phase: 4. Squash-merged as `3b75e43`. Ledger-only entry, no new code — logging the merge per this
  repo's usual pattern (see (dv) for precedent) since (dx) below already carries the full write-up.
- Next: issue #71 (dark mode + typography theming) — scope is fully resolved (comment on the
  issue), ready to start PR 1 (token audit) whenever prioritized. No other open work right now.
- Blockers: none.

### 2026-09-11 (dx) — Fixed two appointments-timeline president-label spacing bugs; issue #71 scope fully resolved (deferred, not started)
- Phase: 4. Operator asked to discuss/revise issue #71 first (six of seven recently-merged backlog
  issues affected its scope), then pause #71 entirely to fix a more pressing bug in the appointments
  beeswarm's timeline. Both handled this session.
- **Issue #71**: resolved every open question with the operator (font/typography now in scope —
  runtime-switchable, full property set, same mechanism as color; host API is both an attribute AND
  a JS method; `tools/theme-editor.html` tracked in git; theme JSON at `data/themes/*.json` under
  full `SCHEMA_VERSION`/`DATA_CONTRACT` policy; the separate beeswarm widget, `.cta-` prefix, IS in
  scope too) and confirmed the six merged backlog issues' impact on its view inventory (one addition:
  Summary > District Courts' new zoom/pan/Reset controls from #70; nothing to drop — no CSS custom
  properties exclusive to the removed Change view remain, verified via grep). Posted the complete
  write-up, plus a proposed 3-PR phased breakdown, as a comment on issue #71 rather than starting
  implementation:
  https://github.com/digitalgroundgame/court-tracker/issues/71#issuecomment-5637027353
  **Status: still deferred, not started** — scope is ready, no more design questions needed before
  PR 1 whenever it's next prioritized.
- **Appointments-timeline bug fixes** (`embed/appointments-chart.js`'s presidency-band labels, no
  GitHub issue filed — direct operator report): (1) the president-icon-to-name gap used a
  per-character width estimate (`surname.length * 6.2`) that didn't match real glyph widths, making
  the gap look inconsistent across presidents; replaced with `nameText.getComputedTextLength()` on
  the live DOM (moved `bands`'/`pan`'s append earlier so the text element is measurable), which also
  now drives the wrap-vs-single-line `fits` width check that used the same flawed estimate. jsdom
  (smoke.mjs) doesn't implement `getComputedTextLength` on SVG text — added a feature-detected
  fallback to the old estimate there only. (2) When the 4-category appointment-count summary wraps
  onto multiple lines in a narrow band, its first line clashed with the president icon. First pass
  buffered only that first line horizontally, past the icon; operator follow-up flagged this made
  whichever category happened to lead (SCOTUS when present, Appellate otherwise) look "pushed right"
  and out of line with the rest — reworked so ALL wrapped lines stay flush-left under the name, and
  the clash is resolved by starting the wrapped block lower instead (y=32, was 28), clearing the
  icon's ~22px bottom edge vertically. Also removed a now-redundant duplicate `pan.append(bands)`
  left over from the DOM-attachment reordering.
- Verified: `npm test` (smoke/jsdom) ALL PASS. `npm run build` — `dist/` rebuilt, committed in the
  same branch. **`npm run test:browser` (real-browser visual verification) could NOT be run** — see
  the Resume briefing's new `/tmp` gotcha above. Treat the visual fix as unverified until someone
  looks at it rendered.
- **Follow-up same session**: `/tmp` was blocking the harness's own output capture entirely (not
  just browser tests) partway through — the operator manually cleared some of the `ctbc-*` dirs
  from their own shell (outside this session's sandbox) and confirmed it was enough (100% -> 45%
  used, 8.7GB free). Once unblocked: ran `npm run test:browser` for real this time — ALL PASS,
  including existing coverage of this exact wrap/no-wrap label logic (the `· ` joiner hide/show
  test, the "should NOT wrap" single-line-row test). Operator then reviewed the rendered PR and
  asked for the wrapped count-label block to sit ~2-4px lower — bumped `WRAP_Y0` 32 → 35, pushed as
  a follow-up commit on the same branch/PR (not a new PR). `npm test` + `npm run build` re-run
  clean after the nudge. **Real-browser visual verification is now actually done**, superseding the
  "unverified" note above.
- Next: operator review of PR on `claude/appointments-timeline-buffering`. Issue #71 picks up
  whenever next prioritized (see Resume briefing).
- Blockers: none remaining — the `/tmp` blocker from earlier in this session is resolved.

### 2026-09-10 (dw) — Session paused at operator's request, ahead of starting issue #71
- Phase: 4. No code work this entry — the operator asked to pause the session here (context
  budget) and have the Resume briefing (above) prepared specifically for the next session to pick
  up issue #71 cleanly, rather than continuing into it now.
- Rewrote the Resume briefing wholesale: full issue #71 scope summary, the open design questions
  that need resolving before writing any code (host-facing API shape, where the palette-authoring
  tool and palette JSON files live, whether the separate beeswarm widget is in scope), and a
  concrete summary of the existing CSS custom-property groundwork (~12 tokens, ~96 usages, ~29
  remaining hardcoded hex colors still needing an audit) so the next session doesn't have to
  re-derive it from scratch.
- No branch, no PR, nothing mid-flight — a clean stopping point, not a blocker.
- Next: read issue #71 in full, then resolve its open questions with the operator (ask, don't
  assume) before starting any implementation.
- Blockers: none — this is a deliberate pause, not a stall.

### 2026-09-10 (dv) — PR #77 (issue #70) MERGED (operator approved) after two follow-up rounds — 6 of 7 backlog issues done
- Phase: 4. Operator approved PR #77 ("all of those new features appear to have correct behavior.
  you can squash #77") — squash-merged as `11a9760`; issue #70 auto-closed.
- Before approving, the operator asked for a live sanity check (confirmed the circuit-drill-in
  sub-assembly's size is unaffected by the removal — byte-identical CSS, 130px, verified with a
  screenshot) and requested three follow-up changes, all delivered and pushed as two more commits
  on the same PR before this merge:
  1. A "Reset" button (zoom back to 1x) to the left of "Zoom Out."
  2. A real bug fix: the caption row's zoom controls were a fixed-width absolute overlay that
     squeezed the title into a cramped multi-line column as the pane narrowed, instead of dropping
     to their own line — rebuilt as a genuine flex row with `flex-wrap`.
  3. A second, unrelated real bug in the ordinary court pane: "View districts →" always landed on
     the BOTTOM wrapped line as the pane narrowed, instead of floating to the top as the more
     important navigational control — fixed with `flex-wrap-reverse` on `.ctt-pane-controls`
     (zero effect on the normal unwrapped desktop row).
- Added regression tests for both wrap fixes (real pixel geometry in `browser-checks.mjs`, since
  jsdom can't meaningfully test flex-wrap) and for the Reset button (`smoke.mjs`). Verified all
  three fixes visually across five widths (1180 down to 660px) plus the ordinary-pane case at
  700px. Full `npm test` + `npm run test:browser` — ALL PASS on every round.
- **6 of the 7 backlog issues (#65-#70) are now done and merged.** Only #71 (dark mode + palette
  tool) remains — by far the largest, most novel item in the whole backlog.
- Next: scope and start issue #71. Given its size (a runtime palette-switching mechanism, a
  separate palette-authoring tool, a JSON export/import format, AND an initial dark-palette
  design), consider a scoping conversation with the operator before committing to an implementation
  plan, rather than assuming the shape of the work.
- Blockers: none.

### 2026-09-10 (dt) — PR #76 (issue #67) MERGED (operator approved); removed 'Set upon map', added District Courts zoom (issue #70)
- Phase: 4. Operator approved PR #76 ("excellent, this worked well and i approve squashing. we can
  move onto #70") — squash-merged as `bc21936`; issue #67 auto-closed.
- Also received a mid-task clarification from the operator while starting #70: confirmed the
  circuit-drill-in district sub-assembly must be KEPT, and the removal scope is only the
  national-map-deployed "Set upon map" overlay — matches what the plan already was, no course
  correction needed, but worth noting the operator proactively flagged it given how interleaved
  the two features were in the source.
- Removed the "Set upon map" deployed-cartogram feature (draggable/resizable overlay, fixed
  D/×/−/+ corner controls, deploy "pull out" flyover) — archived to `archive/set-upon-map/`, the
  SECOND real use of the archive convention. Required a careful per-function audit rather than a
  contiguous delete, since the circuit-drill-in sub-assembly (a separate, unrelated, KEPT feature)
  was interleaved with it in the original source; confirmed via grep before touching anything that
  `highlightDistrictOnMap`/`wireDistrictCartogramHover`/`buildDistrictCartogramSVG`/
  `renderDistrictSubassembly`/`updateDistrictSubassemblyVisibility`/`NO_DISTRICT_SUBASSEMBLY`/
  `NOMINAL_MAP_PX` were all still needed and left untouched.
- Added zoom in/out to the Summary > District Courts inline cartogram in the vacated caption-row
  slot: `S.districtZoom` (1x-3x, persisted to localStorage per operator confirmation), a
  "hit-the-limit" button style that's a live reflection of current zoom, and drag-to-pan clamped
  to the cartogram's own real measured overflow (not a fixed fraction) — a resize re-clamps pan
  but never touches the zoom level.
- Asked the operator one clarifying question mid-task (zoom persistence across reloads, matching
  the removed feature's own convention) rather than guessing — confirmed yes.
- Found and fixed a real bug via live browser testing: `<svg>` root elements have no
  `offsetWidth`/`offsetHeight`, so the zoom transform's "natural size" math silently produced NaN,
  which the browser silently refused to apply — the cartogram was stuck unscaled despite every
  other piece of state (button styles, localStorage) updating correctly. Fixed with
  `getBoundingClientRect()` + a temporarily-cleared transform. Caught only because a
  browser-checks.mjs assertion specifically checked for a real SIZE INCREASE, not just absence of
  a crash — jsdom alone could not have caught this (it measures every box at 0 regardless).
- Verified: `npm test` + `npm run test:browser` — ALL PASS (including adapted regression coverage
  for a hover/grow bug originally caught via the now-removed overlay, re-homed onto the
  sub-assembly in both test files since both call sites share the same code path). `npm run build`
  confirmed byte-for-byte reproducible against the committed `dist/`. Verified visually with
  before/after screenshots (1x and ~1.7x zoom).
- Next: open the PR for #70 (not yet opened as of this entry), then move to issue #71 (dark mode +
  palette tool — the largest remaining item) once #70 is reviewed.
- Blockers: none.

### 2026-09-10 (ds) — PR #75 (issue #66) MERGED (operator approved); removed the Change view (issue #67)
- Phase: 4. Operator approved PR #75 ("this works perfectly too, you can merge it and we'll move
  to #67") — squash-merged as `e978dd3`; issue #66 auto-closed.
- Removed the Change view (the `[ Timeline | Majority | Change ]` switch's third mode, a
  party-stacked appointing-president streamgraph) per issue #67 and CLAUDE.md §7's large-removals
  rule from issue #65 — the FIRST real use of the `archive/` convention. Mapped the full footprint
  before touching anything: the ~410-line JS block, its CSS block, its two now-vestigial custom
  properties, its state fields, and its `_dev` test exports were all confirmed EXCLUSIVE to this
  feature via grep (not assumed) before removal; `data/appointments.json`,
  `data/president_photos.json`, and `embed/presidencies.js` were confirmed SHARED with the separate
  `embed/appointments-chart.js` beeswarm widget and left untouched.
- Archived the removed source to `archive/change-view/` (`NOTES.md` + `.excerpt` files for the JS,
  CSS, and smoke-test blocks) rather than deleting outright.
- Replaced `tests/smoke.mjs`'s Change-view test block with a new check confirming the removal
  itself (no control, no leftover DOM, exactly 2 pane-view modes) — a removal PR should prove the
  thing is gone, not just delete the coverage that used to test it.
- Verified: `npm test` + `npm run test:browser` — ALL PASS; `npm run build` confirmed byte-for-byte
  reproducible against the committed `dist/` (no drift, per CI's own check); a real-browser
  screenshot of an ordinary court's pane confirms a clean `[Timeline | Majority]` control with no
  gap or leftover artifact from the removed third button.
- Next: open the PR for #67 (not yet opened as of this entry), then move to issue #70 (remove
  Set-upon-map, add District-Courts zoom — the SECOND real use of the archive convention) once #67
  is reviewed.
- Blockers: none.

### 2026-09-10 (dr) — PR #74 (issue #69) MERGED (operator approved); completed issue #66 (Appellate Courts button)
- Phase: 4. Operator approved PR #74 ("i like the look of this change, squash #74") — squash-merged
  as `5886a82`; issue #69 auto-closed.
- Implemented issue #66: the Appellate Courts sub-tab in Summary (`renderSummaryPane`'s tabs loop)
  no longer calls `setView("appellate")` — it gets the ordinary active/blue click-feedback class
  and calls `deselect()` instead, closing the pane and returning to the map without ever setting
  `S.summaryView` or touching whatever content was previously showing. Removed
  `renderSummaryAppellate` (the old "Coming soon." placeholder) and its now-dead dispatch branch
  outright — not archived, since it was never real functionality (noted in the PR description per
  CLAUDE.md §7's carve-out for exactly this case).
- Added regression coverage in `tests/smoke.mjs` (checks `S.summaryView`/`S.selectedCourt` after
  clicking Appellate Courts from both Supreme Court and District Courts as the prior real
  sub-view) and `tests/browser-checks.mjs` (real click-feedback class + pane-close, in an actual
  headless-Chrome browser). Full `npm test` + `npm run test:browser` — ALL PASS. Verified visually
  with a screenshot (pane closes, map returns, Summary selector un-highlights).
- Cut this branch (`claude/issue-66-appellate-button`) from `main` only AFTER PR #74 had already
  merged, avoiding the stale-branch/rebase gotcha from earlier this session.
- Next: open the PR for #66 (not yet opened as of this entry), then move to issue #67 (remove the
  Change view) once #66 is reviewed — per the operator's pause-per-issue rhythm.
- Blockers: none.

### 2026-09-10 (dq) — PR #73 (issue #68) MERGED (operator approved); completed issue #69 (FedSoc key reposition)
- Phase: 4. Operator approved PR #73 ("73 is good and can be merged") — squash-merged as
  `904e75a`; issue #68 auto-closed.
- Resumed issue #69 (stashed at end of the prior session-log entry): rebased
  `claude/issue-69-fedsoc-key-position` onto the now-updated `main`, reapplied the stash, resolved
  a real conflict in `renderSummaryScotus` (both #68's and #69's own changes touched the same
  lines) by keeping #68's unconditional fedsoc assignment and folding in #69's own comment about
  the key's new placement — committed the resolution immediately per CLAUDE.md §7. `dist/`'s
  conflicted minified file was resolved by rebuilding from scratch rather than hand-merging.
- Debugged and fixed the 1 browser-test failure left over from the previous session: the
  positioning function and its own test were both measuring `.ctt-summary-subtitle`/
  `.ctt-pane-meta`'s full block width instead of the actual rendered text (fixed with a `Range`
  over each element's contents). Also fixed a jsdom-only crash (`getComputedStyle is not defined`)
  by adding the same "no real layout" early-return guard `majorityStageHeight` already uses.
- Verified with the full `npm test` + `npm run test:browser` suite (ALL PASS) AND a real headless-
  Chrome screenshot of Summary > Supreme Court, confirming the key visually sits centered with a
  clear buffer from both the title/meta text and the panel's own edge.
- Next: open the PR for #69 (not yet opened as of this entry), then move to issue #66 once #69 is
  reviewed — per the operator's new pause-per-issue rhythm (see Resume briefing above).
- Blockers: none.

### 2026-09-10 (dp) — PR #73 (issue #68) corrected after operator caught a real bug live; adopted a new pause-per-issue workflow
- Phase: 4. Operator tested PR #73 directly and reported: "it doesn't seem like the fix applied
  for pr 73 works. when i set the mark from FedSoc to None, it now shows Supreme Court as though
  None was selected." Root cause: the first version kept the pre-existing `_affilMarkTouched` gate
  on SCOTUS's FedSoc default, which was backwards — issue #68 needed SCOTUS's marking to be
  UNCONDITIONAL (its own fixed convention), not "only before any real choice exists elsewhere."
- Fixed: `renderSummaryScotus` now always sets `S.affilMark = "fedsoc"`, no gate. Removed
  `_affilMarkTouched` entirely (fully vestigial once the gate was gone). Updated the two issue #68
  checks in `tests/browser-checks.mjs` and the SCOTUS block in `tests/smoke.mjs` to cover the
  operator's exact reported scenario. Full `npm test` + `npm run test:browser` — ALL PASS. Pushed
  as commit `a96f623` on the same `claude/issue-68-fedsoc-global-leak` branch/PR #73, with a PR
  comment explaining the correction.
- Operator also asked to change how this session paces backlog work: "let's start pausing after
  we finish work on an issue, so i can review it and we can continue on the same topic in a
  contiguous train of thought." Saved as a standing preference
  ([[operator-wants-pr-review-before-merge]] memory, generalized beyond its original 2026-09-07
  scope). Applying it now: stopping here rather than resuming the in-progress #69 work
  automatically.
- Issue #69 (FedSoc key reposition) is left mid-flight, stashed on branch
  `claude/issue-69-fedsoc-key-position` — see Resume briefing above for exact state (1 unexplained
  browser-test failure on the last run, not yet debugged).
- Next: get operator sign-off on PR #73's correction, then resume #69 (debug the stashed test
  failure first).
- Blockers: none.

### 2026-09-10 (do) — PR #72 (issue #65) MERGED (operator approved); fixed issue #68 (FedSoc global-leak bug)
- Phase: 4. Operator reviewed PR #72 (the CLAUDE.md archive-convention amendment) and approved it
  ("pr #72 looks good to me and i give approval") — squash-merged as `c80b8c9`; issue #65
  auto-closed.
- Fixed issue #68: `renderSummaryScotus`'s one-time FedSoc default used to set
  `S._affilMarkTouched` itself, so the first-ever SCOTUS visit permanently overwrote the ordinary
  per-court `None|FedSoc|ACS` switch's global state. Split "currently applied"
  (`S.affilMark`) from "last real user choice" (new `S._affilMarkUserChoice`, written only by the
  real switch); `renderPane` restores `affilMark` from the user's choice at the top of every
  non-SCOTUS render, so SCOTUS's temporary override can no longer leak or persist. Added two
  regression checks to `tests/browser-checks.mjs`; ran the full `npm test` + `npm run test:browser`
  suites, both ALL PASS. Rebuilt `dist/` (`npm run build`).
- Hit a real gotcha mid-session: the `claude/issue-68-fedsoc-global-leak` branch was cut from
  local `main` before PR #72 merged, so it initially carried the PRE-amendment CLAUDE.md/
  PROGRESS.md even after #72 merged on GitHub. Fixed with `git fetch origin main && git rebase
  origin/main` (after committing the in-progress fix first) — noted in the Resume briefing above
  so it isn't rediscovered the hard way again.
- Next: push `claude/issue-68-fedsoc-global-leak`, open its PR, then move to issue #69 (SCOTUS
  FedSoc key reposition — small CSS, same function as #68).
- Blockers: none.

### 2026-09-10 (dn) — Filed issues #65–#71 from operator's laundry list; started #65 (archive convention)
- Phase: 4. Operator handed a 7-item laundry list of bugs/features (verbatim text kept locally in
  the untracked `prompt_09_10_2026.txt`). Wrote up and filed each as its own GitHub issue: #65
  (archive convention for removed features + a CLAUDE.md amendment), #66 (Summary > Appellate
  Courts button should close the pane instead of showing "Coming soon."), #67 (remove the Change
  view), #68 (SCOTUS FedSoc-mark global-state leak — a real bug), #69 (SCOTUS FedSoc key
  reposition), #70 (remove the Set-upon-map district overlay, replace with zoom in/out inside
  Summary > District Courts), #71 (dark mode palette + switch + a palette-authoring tool). Each
  issue includes the operator's exact original wording at the bottom, per their request.
- Proposed a priority order (small/safe fixes first, then the two archive-dependent removals,
  dark mode last since it's the largest and benefits from landing after the cleanup); operator
  approved it as given — see Resume briefing above for the ordered list.
- Started #65 on branch `claude/archive-convention`: added `archive/README.md` (the archive
  layout/convention) and a new CLAUDE.md §7 item 7, "Large removals default to archive, not
  delete," plus an `archive/` row in the repo map.
- Next: get explicit operator sign-off on the CLAUDE.md change (flagged in the PR description,
  per CLAUDE.md's own hard-stop rule on protocol-file edits) and merge #65, then move to #68.
- Blockers: none. Noticed but not acted on: issues #50/#60/#62 have merged PRs but were never
  closed on GitHub.

### 2026-09-10 (dm) — PR #61 and PR #63 MERGED: operator reviewed both and gave explicit go-ahead
- Phase: 4. Operator reviewed PR #61 (issue #60) and PR #63 (issue #62) together and said "they
  look good, you can go ahead and merge both."
- **Merge order mattered**: #63's branch (`claude/issue-62-rmax-priority-tiers`) was stacked on
  #61's branch (`claude/issue-60-band-gap-floor`), not on `main`, since #62's fix builds directly on
  #60's code. Squash-merged #61 first (`84b37ec`). Retargeting #63 to `main` via `gh pr edit --base
  main` then showed a real conflict — expected: `main` now has the *squashed* #61 commit, with
  different ancestry than the unsquashed commits #63's branch was built from, even though the
  actual file content is identical. Fixed by rebasing `claude/issue-62-rmax-priority-tiers` onto
  `origin/main`: git recognized the #60 commit's changes were already present (via patch-id
  matching against the squash) and automatically skipped it, cleanly replaying only the #62 commit
  on top — no manual conflict resolution needed, confirmed by `git diff origin/main --stat` showing
  exactly the #62 commit's own file changes and nothing else. Force-pushed the rebased branch,
  waited for CI to re-run clean, then squash-merged #63 (`b797ea7`).
- Verified after both merges: full test suite (`npm test`, `npm run test:browser`) passes against
  the actual state now on `main`, matching what was verified pre-merge on the feature branches.
- Updated `PROGRESS.md`'s Resume briefing: the "PR open, awaiting operator review" framing for both
  issues is now stale and corrected; the #60/#62 technical reference paragraphs are otherwise left
  as-is (still accurate documentation of the current, now-merged mechanism) with their headers
  re-labeled from "if you're picking this back up" to "reference, as merged," matching the existing
  pattern used for the PR #56 reference block.
- Next: no obvious open follow-up on issues #50/#60/#62 as of this writing — re-check `gh issue
  list`/`gh pr list` fresh at the next session start rather than assuming.

### 2026-09-10 (dl) — Issue #62 filed and fixed: senior band could clip above the pane's own top edge, 602-637px wide, Seniors:Show
- Phase: 4. Operator, testing #61's fix locally, found a new bug: on ca9 (and a couple of large
  district courts), at window widths ~602-637px specifically, the top of the arrangement clipped
  above the pane's own visible top edge in `Seniors: Show`. Narrowed to exactly this width range
  because it's where `embed/court-tracker.css`'s one layout breakpoint (`max-width:640px`) switches
  the widget from its desktop side-by-side layout to a stacked mobile one — genuinely less vertical
  room there, tightening `Rmax` while `Wmax` stays comparatively loose.
- **Diagnosis was iterative and self-correcting, worth recording so it isn't repeated**: an early
  theory ("the senior band structurally needs multiple rings, like the active bench gets via
  `planRings`, and never gets them") was investigated and found to be a real, general inefficiency
  (`bandIntra` stays unresolved at literally every width tested, even 1600px) but NOT the proximal
  cause — it doesn't discriminate clip-vs-no-clip widths, since it's present everywhere. The
  operator explicitly pushed back on reaching for the deepest-sounding cause and asked for the MOST
  PROXIMAL one instead; that reframing found the real mechanism: `resolveAt`'s old flat `remaining`
  count couldn't distinguish "still violates the unrecoverable `Rmax` budget" from "still violates
  the scroll-recoverable `Wmax`/pane-edge budget," and its tie-break (strict-less-than only) could
  leave the search stuck on a scale with a large `Rmax` overshoot when a same-tallying, much-better
  scale was reachable later in the same search range. Confirmed by temporarily instrumenting
  `resolveAt` to trace every candidate scale live (not just the final result) — this is what
  actually revealed the tie-break mechanism; reasoning about it from the final result alone wasn't
  enough. A follow-up operator question ("did the tiers correctly handle the case where even the
  floor scale still doesn't fit, and hands off to scroll?") led to a full sweep of the floor scale
  against every court/width combination, which found — contrary to an earlier back-of-envelope
  claim in this same investigation — that the floor scale ALWAYS satisfies `Rmax` once measured
  against `Rmax` directly instead of the conflated `effectiveMax`; the "genuinely stuck, fall back
  to scroll" path is correctly supported but was never actually reachable by real data.
- **Fix**: `resolveAt` returns a 3-tier priority tuple (`rmaxViolation` > `collisionCount` >
  `paneViolation`, each ranked by how recoverable the failure type actually is — vertical overflow
  has no fallback at all and ranks highest; horizontal overflow is fully scroll-recoverable and
  ranks lowest) compared lexicographically via a new `betterCandidate` comparator, replacing the old
  flat `remaining` sum and the `effectiveMax`-conflated `bandExceedsBudget` flag entirely.
- **A real regression found and fixed during implementation, caught by the operator testing
  locally, not by any automated check**: `bandR` is always computed (`outermostActiveR + ROW_GAP`)
  even when no band is rendered at all (Hide/Include mode) — the first version of `rmaxViolation`
  included that phantom value unconditionally, forcing real, unnecessary icon shrinking in Hide
  mode (cacd/Hide/desktop dropped to scale 0.80 with room to spare). Fixed by gating the `bandR`
  term behind `hasSeniorsBand`, restoring the same guard the pre-fix `bandExceedsBudget` already had
  and that got dropped in the rewrite.
- **Verification, in increasing scope**: (1) a fine 2px-resolution sweep of ca9 across the whole
  602-637px window — `bandR` at the floor scale stays a constant 256, always under `Rmax`=262;
  (2) a multi-court sweep, redone once after finding a real navigation bug in the first pass
  (district courts need real drill-in via `.ctt-drill`; a bare selector click for one silently
  no-ops and re-measures whichever court was previously selected — the first pass's "nysd"/"cacd"
  rows were actually just "cafc" three times) — zero `Rmax` violations across 13 courts × 13 widths
  once navigation was corrected; (3) a full before/after sweep of all 109 non-SCOTUS courts × 4
  widths × 3 Seniors modes (1,308 combinations) against the pre-fix build, run twice — the first
  pass used a settle time shorter than `.ctt-judge`'s own 480ms CSS transition and produced 82
  spurious `scrollWidth`-only diffs; re-run with a properly long settle eliminated all 82, leaving
  exactly 12 genuine geometry differences, every one either a direct fix of the clipping bug or a
  welcome "less unnecessary shrinking" side effect of the same tie-break fix — zero unexpected
  differences anywhere in the real dataset.
- Filed as issue #62 (`gh issue create`) with the full diagnosis, fix, regression, and verification
  evidence recorded, matching the operator's established preference for capturing this level of
  detail before implementing (same as issue #60).
- **Branch note**: PR #61 (issue #60) is still open/unmerged as of this writing. This fix builds
  directly on top of it (same function, same area), so its branch
  (`claude/issue-62-rmax-priority-tiers`) is stacked ON `claude/issue-60-band-gap-floor`, not on
  `main` — #61 needs to merge before #62 can. Both are still awaiting operator review; neither was
  self-merged, consistent with how #56/#60 were handled (algorithm-sensitive work, hold for
  explicit go-ahead).
- All four suites (`npm test`, `test:dist`, `test:browser`, `test:browser:dist`) pass. New
  regression tests added to `tests/browser-checks.mjs`: no icon renders above the stage's own top
  edge at ca9/cacd/620px/Show, and cacd/Hide/desktop doesn't shrink unnecessarily (guards the
  phantom-`bandR` regression specifically). `dist/` rebuilt and committed alongside `embed/`.
- Next: PR open (branch `claude/issue-62-rmax-priority-tiers`, stacked on #61), awaiting operator
  review — do not self-merge either #61 or #62.

### 2026-09-09 (dk) — Issue #60 filed and fixed: senior band compressed against the outer active ring below a ROW_GAP floor
- Phase: 4. Right after PR #56 merged, operator reported a new bug testing the live GitHub Pages
  site on mobile: in `Seniors: Show`, the senior band could render visibly overlapping the outer
  active ring, specifically when `Seniors: Hide` already fit the pane with no scrollbar but adding
  the band needed slightly more room than the pane's width allowed.
- **Diagnosed and confirmed with a live sweep** across all circuit courts with a senior band, at
  common real device widths (375/390/412/428px): at 412px and 428px, nearly every court (ca2, ca3,
  ca4, ca6, ca7, ca8, ca10, ca11, cadc, cafc) showed the band-to-bench gap collapsed from a healthy
  ~50px down to 3-7px, with real icon-icon overlap of 18-49px — and no scrollbar appeared at all,
  since `findRingCollisions` only ever checked label-vs-icon, never icon-vs-icon. Confirmed the
  operator's own pattern description exactly: the "Hide already scrolls" case (ca9 at 320-340px)
  stayed at a full healthy 50px gap despite the bench itself already overflowing by ~200px.
- **Root cause**: `resolveAt(s)`'s `let bandR = outermostActiveR + ROW_GAP; if (outermostActiveR <=
  effectiveMax) bandR = Math.min(bandR, effectiveMax);` — the clamp only skipped when
  `outermostActiveR` was ALREADY past budget; when it was within budget by less than `ROW_GAP`, the
  clamp compressed the gap to whatever thin sliver remained instead of falling back to scroll.
- **Discussion with the operator before filing**: presented the diagnosis plus two candidate fix
  framings (a minimal one reusing the existing Step-3 `remaining`-condition pattern vs. a
  fuller/more literal restructure) — operator picked the minimal one (initially mislabeled "B" in
  an early draft, corrected once the operator clarified their fuller narrative language actually
  described the SAME minimal approach, not a separate design). Operator also asked directly whether
  the algorithm's collision math correctly treats icons as circles (center + radius) rather than
  rectangles — confirmed `labelHitsIcon` already does real circle-vs-rectangle distance math for
  label-vs-icon, but there is NO icon-vs-icon check anywhere by original design (commit 48f212a's
  "some overlap is acceptable, only text-touching is the bug" precedent) — this fix's overlap
  guarantee rests on `ROW_GAP`(50px) vs. icon diameter(44px) leaving a real but modest 6px margin,
  now directly verified (not just assumed) by a new circular-hitbox regression test.
- Filed as issue #60 (`gh issue create`) with the full diagnosis, decision, and hitbox-correctness
  answer recorded, per the operator's explicit ask to capture the discussion in detail before
  implementing.
- **Fix**: `bandR` is never clamped down below `outermostActiveR + ROW_GAP` any more. Instead,
  "the band's target exceeds `effectiveMax`" becomes one more `remaining` condition inside
  `resolveAt`'s existing Step-3 search (same pattern `PANE_EDGE_TOLERANCE_PX` uses) — but
  deliberately NOT magnitude-bounded like that one, since icon-on-icon overlap is a correctness
  problem at any width. If the shrink floor still can't bring it in budget, `bandR` stays
  uncompressed, relying on the same horizontal-scroll fallback already used elsewhere.
- Verified: the live sweep re-run post-fix shows a consistent 50px gap at every previously-broken
  width/court, real scroll now correctly engages where it silently didn't before, and both
  regression invariants ("Hide already scrolls" stays healthy; desktop zero-overflow guarantees
  from PR #56) hold unchanged. All four suites (`npm test`, `test:dist`, `test:browser`,
  `test:browser:dist`) pass. New regression tests added to `tests/browser-checks.mjs`, including a
  real circular hitbox check (actual `.ctt-avatar` center-to-center distance vs. sum of real radii,
  not a bounding-box approximation) at the three confirmed-compressed court/width combinations, plus
  a guard for the "Hide already scrolls" case staying unaffected.
- Next: PR open on branch `claude/issue-60-band-gap-floor`, awaiting operator review before merge —
  this touches the same collision-avoidance algorithm PR #56 just landed, so not self-merging it.

### 2026-09-09 (dj) — PR #56 MERGED: rewrote the PR description into a clean algorithm explanation (operator ask), squash-merged onto main
- Phase: 4. Once (di)'s CI run came back green, the operator's original ask ("clean up the written
  description of PR #56 and update it with an explanation of how your version of the algorithm
  works, then we can squash it") was ready to finish. Rewrote the PR body from an accumulated,
  session-by-session changelog into a single coherent "How the algorithm works" narrative (Step
  0 → Steps 1/2 → the senior band's `[fixedActiveR, movableBandR]` reuse trick for
  `adjustInterRingGaps` (explained conversationally to the operator earlier this session, then
  folded into the PR text) → Step 3's whole-bench shrink → the pane-width-fit mechanism → the
  horizontal-scroll fallback), plus a condensed "real bugs found along the way" section instead of
  a blow-by-blow. Confirmed CI still green and the PR still cleanly mergeable right before merging.
- **Merged with `--squash`** (operator had already explicitly authorized "we can squash it") —
  landed on `main` as a single commit, `a0d189c`, title `(cx) — Issue #50: judge-icon ring/arc
  collision-avoidance algorithm` (kept the PR's original title per convention: title = squash
  commit message = what's browsable on `main`).
- **This entry itself is a small separate follow-up PR** (not bundled into #56, since #56 was
  already merged by the time this ledger update was written) — updates the stale "Next task" pointer
  (previously said "PR #56 open awaiting review") and re-labels the detailed `layoutArc` reference
  block above from "current state, read before touching" (implying open work) to "reference, as
  merged" (implying it's done, kept for whoever touches this code next).
- Next: no obvious open follow-up on issue #50 — re-check `gh issue list`/`gh pr list` fresh at the
  next session start rather than assuming.

### 2026-09-09 (di) — PR #56: (dh)'s margin bump was PROVEN ineffective by CI itself (byte-identical 606-vs-600 before and after); the real fix checks measured pane-edge overflow inside Step 3
- Phase: 4, same PR (#56, issue #50). Pushed (dh)'s `Wmax` margin bump (`-30` → `-40`), waited for
  CI, and got the EXACT SAME failure with IDENTICAL numbers: `scrollWidth 606 vs clientWidth 600`.
  A margin change that actually mattered would have shifted those numbers by SOME amount — getting
  byte-identical output is decisive proof `Wmax`'s margin was never the operative constraint for
  this specific overflow. Reverted the margin bump back to `-30` (see `majorityDims`'s own comment,
  now updated to say so directly and point here).
- **Why it had zero effect, actually understood this time**: `Wmax`/`effectiveMax` only bounds RING
  RADIUS growth (Steps 1/2) — it has no direct relationship to whether an individual seat's LABEL
  pokes past the pane's edge. That's measured entirely separately, at the very end of `layoutArc`,
  by `seatHalfWidth`/`leftBleedShift` using each label's REAL measured width. Critically, the Step-3
  shrink search (`resolveAt`'s `remaining` count) NEVER looked at that measurement at all — it only
  counted `findRingCollisions` (label-vs-NEIGHBORING-icon) hits. A label overflowing into empty
  space past the pane's edge, with no neighboring icon anywhere near it, was never flagged as
  anything Step 3 needed to fix — so the scale Step 3 converged on was entirely UNRELATED to
  whether the final result fit the pane width. Widening `Wmax`'s margin couldn't touch this because
  it doesn't participate in that decision at all.
- **(dh)'s stated reason for rejecting this exact fix doesn't hold up**: (dh) considered "make Step
  3 also treat real pane-edge overflow as an unacceptable-collision type" and rejected it as risking
  mobile-scroll regression, reasoning "no width-breakpoint variable exists to scope it to desktop
  only." Re-examined: the operator's mobile statement ("the horizontal viewable area should be
  arbitrary... because we want that side to side scroll behavior specifically for mobile") was
  answering a question about STEPS 1/2's ring-radius growth ceiling (`Wmax` should not force rings
  to shrink-fit on mobile) — a different mechanism from Step 3's shrink search. Rather than assume
  this generalizes to Step 3 too, actually implemented it and tested against the exact regression
  tests that would catch it (`ca9/Include` and `ca9/Show` "genuinely overflows at 380px").
- **Fix implemented**: `resolveAt(s)` now also computes the real extent (same `seatHalfWidth`-based
  points `leftBleedShift` needs anyway) and treats a SMALL residual overflow — under a new
  `PANE_EDGE_TOLERANCE_PX` (40) — as another `remaining` collision type Step 3 tries to shrink away.
  Deliberately bounded: mobile's real overflow for a large bench is routinely 150px+ (verified:
  186-190px for ca9 at 380px), an order of magnitude past the tolerance, so this never engages
  there — confirmed empirically, not assumed: `ca9/Include` and `ca9/Show` at 380px still show
  genuine overflow (504/500 vs clientWidth 314) after this change, identical to before. At desktop
  width, where the CI gap was only 6px, the tolerance lets Step 3 close it. `result.points` (the
  extent `resolveAt` already computed at the winning scale) is now reused directly for
  `leftBleedShift` at the end of `layoutArc`, instead of recomputing the same thing a second time.
- Verified: all four suites pass locally; the (dg) band-gap sweep and 380px mobile-overflow
  diagnostics both re-checked and hold unchanged. Pushed; CI re-run is what actually confirms this
  (the failure was CI-environment-specific and can't be fully verified from a local run alone).
- Next: once CI confirms green, finish the PR #56 description (fold in an explanation of how the
  whole algorithm works, per the operator's ask) and squash-merge.

### 2026-09-09 (dh) — PR #56: CI-only failure — ca9/Include's "zero overflow at desktop" check failed by 6px in GitHub Actions (never locally); Wmax's margin widened — SUPERSEDED by (di), see above (the margin bump was empirically proven to have zero effect)
- Phase: 4, same PR (#56, issue #50), still `claude/issue-50-collision-avoidance`. Right after (dg),
  the operator asked to clean up the PR description and squash-merge — pulled CI status first
  (routine before any merge) and found `real-browser checks` failing on a check that passes
  locally: `ca9/include at desktop width has no horizontal overflow (scrollWidth 606 vs
  clientWidth 600)`, a 6px miss against the test's own `+1px` tolerance.
- **Confirmed NOT caused by (dg)**: `gh run view` on the PRIOR commit (df, before this session's
  band fix) showed the exact same failure, byte-identical numbers (606 vs 600). Pre-existing,
  latent since (df) — this session's own (dg) work didn't introduce or worsen it.
- **Root cause**: reproduced locally — scrollWidth/clientWidth come out EXACTLY equal (600/600),
  zero slack either way. `Wmax`'s `-30` margin (the fixed heuristic reserving room for a label to
  extend past its own icon at the arc's horizontal extremes) is a GUESS, not an exact per-label
  measurement — real label width depends on the ACTUAL rendered glyphs (`measureLabelNatural`'s
  `Range`-based `textWidth`, computed live per node), which varies with the font stack the
  rendering environment actually has installed. CI's headless Chrome resolves the CSS font-family
  fallback chain to different actual glyphs than the local dev machine's Chrome — same names, same
  code, same test, different real-world width by a few px. This is fundamentally unavoidable with
  any FIXED margin constant: no single number can be provably sufficient for arbitrary text in an
  unknown font environment, only "sufficient in practice, tuned against what's actually been seen."
- **Considered and rejected**: extending Step 3's own search to treat any measured pane-edge
  overflow as another "unacceptable collision" type (reusing `seatHalfWidth`'s real per-label
  measurement instead of `Wmax`'s fixed guess). Technically more principled, but risks a real
  regression: it would make Step 3 shrink icons on ANY width whenever natural content exceeds the
  pane, including MOBILE — which directly contradicts the operator's earlier explicit instruction
  this same PR that mobile's viewable width should stay "arbitrary," with scroll (not extra
  shrinking) as the intended fallback there. There's no width-breakpoint variable in this codebase
  to safely scope such a check to "desktop only" (geometry-driven by design, no fixed breakpoints)
  — implementing this properly would need real design discussion, not a quick CI fix. Reverted
  before it ever left this session's working tree.
- **Fix actually applied**: widened `Wmax`'s own margin from `-30` to `-40` (`Rmax`'s margin is
  UNCHANGED — the failure is specifically a label-WIDTH phenomenon, and `Rmax` bounds the
  HEIGHT axis, a much less font-sensitive dimension). This is honestly a heuristic bump, not a
  structural fix — **if this exact class of CI-only failure recurs for a different court/name,
  widen this margin further; do NOT loosen the test's own tolerance instead** — the test's
  tolerance is what verifies the ACTUAL user-visible behavior (a real scrollbar would still show
  in that font environment even if the test were made to ignore it).
- Verified: all four suites pass locally (`npm test`, `test:dist`, `test:browser`,
  `test:browser:dist`); the (dg) band-gap diagnostic sweep and the mobile-380px overflow diagnostic
  both re-checked and still hold (gap stays a consistent positive value, never negative; mobile
  still genuinely overflows, scroll fallback intact). Pushed and awaiting the actual CI re-run
  before merging — this fix cannot be fully verified from a local run, since the failure is
  specifically about CI's own font environment.
- Next: once CI confirms green, finish cleaning up the PR #56 description (operator ask: fold in
  an explanation of how the whole algorithm works, not just a changelog) and squash-merge.

### 2026-09-09 (dg) — PR #56: the senior band was rendering INSIDE the outer active ring below ~1000px wide (not "locked to the perimeter"); bandR's own effectiveMax clamp was the cause
- Phase: 4, same PR (#56, issue #50), still `claude/issue-50-collision-avoidance`. Operator report:
  on ca9/Show below ~1000px width, "the senior ring appears to be treated as one, free to slide
  apart from the other rings, when it should be locked on the outer perimeter." Also asked to
  re-check the collision-measurement standard against commit 48f212a's "some overlap is
  acceptable, only text-touching is the bug" precedent, and raised (as a possible, not confirmed,
  issue) whether `COLLISION_BUFFER_PX`/the Step-3 trigger needed to fire more readily.
- **Root cause, confirmed via a live-geometry diagnostic sweep** (`model._arcRender` read across a
  width range): `planRings` deliberately plans ring COUNT/base radii off plain `Rmax` (not
  `Wmax`/`effectiveMax` — see (df)'s regression note above, still correct). On a pane where
  `cx < cy` (roughly <1000px wide for a tall multi-ring bench — `cy` is height-derived and stays
  near-constant as width shrinks, so `Wmax` becomes the binding constraint before `Rmax` does),
  the resulting active-ring radii can legitimately sit ABOVE `effectiveMax` even before any
  collision-driven growth runs — `growRingsForIntra`/`adjustInterRingGaps` only ever cap FURTHER
  growth, never an oversized STARTING radius (the same bug class fixed once already for `bandR`
  itself in (de)/(df), just never generalized). Meanwhile `bandR = Math.min(effectiveMax,
  outermostActiveR + ROW_GAP)` clamped independently — so once `outermostActiveR` legitimately
  exceeded `effectiveMax`, `bandR` got pulled back BELOW it. Verified numerically: at one width the
  gap (`bandR - outermostActiveR`) went from +48px (fine) to -18px, then to -134px as width
  narrowed further — the band rendering measurably INSIDE the bench, exactly the reported symptom.
- **First fix attempt (reverted, wrong approach)**: force-compressing active-ring radii to fit
  under `effectiveMax` (a proportional "squeeze" helper) plus reserving `ROW_GAP` of headroom for
  the band. This DID fix the negative gap, but broke something else: it made the algorithm always
  geometrically fit everything under `Wmax` no matter how narrow the pane got, which quietly
  eliminated the intentional mobile horizontal-scroll fallback (2 of the existing regression tests
  failed: `ca9/Include` and `ca9/Show` no longer genuinely overflowed at 380px, which is NOT the
  design — the operator was explicit earlier this PR that mobile's viewable width should stay
  "arbitrary," with scroll as the fallback once Steps 1-3 hit their own floor). Reverted before
  landing.
- **Actual fix, much smaller**: leave `growRingsForIntra`/`adjustInterRingGaps` untouched (an
  oversized starting active-ring radius is fine — it's exactly the case the scroll fallback exists
  for). Fix only the DECOUPLING: `bandR` is now always `outermostActiveR + ROW_GAP` — full stop —
  and the `effectiveMax` clamp only applies when `outermostActiveR` is ITSELF already within
  bounds (the ordinary case this clamp was originally written for in (de): the band's OWN crowding
  alone pushes its natural start past the ceiling while the active rings are fine). When the active
  rings already exceed `effectiveMax` (the width-constrained case above), the band now stays
  consistently `ROW_GAP` beyond them and relies on the same scroll fallback the active rings
  already do, instead of snapping back inside. Verified via the same diagnostic sweep: gap is now
  a consistent +50px (`ROW_GAP`) at every width tested, never negative, and mobile 380px still
  genuinely overflows both Include and Show (confirmed both by diagnostic and by the two
  previously-broken tests passing again).
- **Collision-measurement standard**: checked commit 48f212a's own precedent (a DOM `Range` around
  actual rendered text, not a padded box, only glyph-touching counts) — this already matches
  `measureLabelNatural`'s existing Range-based `textWidth` and `labelHitsIcon`'s label-rect-vs-
  icon-circle check exactly, no change needed. On the "should Step 3 trigger more" question: a
  post-fix screenshot (ca9/Show, 950px) shows the band cleanly separated from the active rings with
  no visible label-touching-icon overlap — the crowded appearance the operator noticed was very
  likely this same bug (the band visually overlapping the bench), not an under-tuned
  `COLLISION_BUFFER_PX`. Left `COLLISION_BUFFER_PX`/`OVERFLOW_WIDTH_FACTOR` unchanged; flagged back
  to the operator to confirm once they can see the fixed version, rather than guessing at a retune.
- **On the architectural question** (operator: "if this design spec isn't represented in the
  structure of the code already, rewriting it to match is actually preferred," re: a literal
  single-array-of-all-rings implementation of Steps 1/2): concluded a full rewrite is NOT needed —
  the actual defect was this one narrow decoupling bug, not a structural mismatch. The existing
  two-entry `[fixedActiveR, movableBandR]` trick already implements "centermost/reference ring
  stays fixed, others adjust their distance from it" for the band's own relationship to the bench,
  which is the concrete mechanism the spec text describes; a full unification was considered and
  explicitly rejected earlier in this PR (see (de)'s note) because it grows active rings that have
  no collision of their own whenever the band alone is crowded. Reported this reasoning back to the
  operator rather than unilaterally rewriting; open to revisiting if they still want it after seeing
  the fix.
- All four suites (`npm test`, `test:dist`, `test:browser`, `test:browser:dist`) pass. `dist/`
  rebuilt and committed alongside.
- Next: awaiting operator review of this fix (and the architecture question above) before any
  further issue #50 work.

### 2026-09-08 (df) — PR #56: real gap — growth was never width-aware, only height (Rmax); added Wmax, with a real regression found and fixed along the way
- Phase: 4, same PR (#56, issue #50), still `claude/issue-50-collision-avoidance`. Operator report
  right after (de): ca9 still shows a horizontal scrollbar at MAX/default width, asking whether
  icon-shrinking was supposed to trigger to make it fit, and whether "the display area needs to be
  tightened up very slightly." Both exactly right. Confirmed by grep: `Rmax` (used to bound
  `growRingsForIntra`/`adjustInterRingGaps` everywhere) is derived purely from pane HEIGHT
  (`cy - 30`) — nothing anywhere in this algorithm's history has ever checked whether growth
  pushed seats past the pane's own WIDTH. So Steps 1/2 could fully resolve every label/icon
  collision while still leaving the arc wider than the pane — and since that never registered as
  "steps 1/2 failed," Step 3 never triggered for it either. This is a real gap against issue #50's
  own "must stay within the... actual user-viewable area" text, present since the very first
  version of this algorithm — not something (de) introduced, just something ca9 (the dataset's
  largest bench) was finally big enough to expose even at desktop width.
- **Fix**: `majorityDims` now also returns `Wmax = Math.max(60, cx - 30)` (same `-30` margin
  convention as `Rmax`, since `cx === w/2` and a ring's radius must stay under `cx` to keep
  `cx ± radius` inside `[0, w]`). `layoutArc` computes `effectiveMax = Math.min(Rmax, Wmax)` and
  uses it everywhere growth is bounded (both active-ring and the band's own scoped growth from
  (de), plus the `bandR` starting-value clamp) — genuinely capping growth by whichever axis is
  tighter, not height alone.
- **Real regression found and fixed in the SAME session, before it ever landed**: initially also
  passed `effectiveMax` into `planRings`' own ring-COUNT decision — on mobile (narrow `Wmax`) this
  collapsed a genuinely multi-ring bench (ca9's 51 combined judges under Include) down to A
  SINGLE ring outright, and no amount of Step-3 icon-shrinking could ever undo that, since ring
  COUNT is decided once, before any scale search runs, and doesn't change with icon size.
  Confirmed by screenshot: the arc effectively stopped rendering anything readable. **Fixed by
  keeping `planRings`'s own ceiling argument as plain `Rmax`** (ring count is fundamentally about
  how many rings fit VERTICALLY, unrelated to width) — `effectiveMax` only bounds the GROWTH
  steps that add radius on top of whatever multi-ring plan `planRings` already chose, where
  Step-3 shrinking can genuinely help (smaller icons need less spacing on the SAME ring count).
  **If you're about to pass anything into `planRings`'s 3rd argument: it must be `Rmax`, never
  `effectiveMax`/`Wmax` — this is exactly the mistake that caused the regression.**
- Net behavior, verified directly: desktop — ca9 across all three Seniors modes now has ZERO
  horizontal overflow (`scrollWidth === clientWidth`), matching the "ideal fit at default/largest
  width" the operator asked for, achieved via real icon-shrinking (0.75-0.85 scale) rather than
  scroll. Mobile — multi-ring layout preserved (back to 3-4 rings, not collapsed), genuine
  shrinking still applies, and residual scroll is still available/used for whatever a narrow
  viewport genuinely can't fit even at the shrink floor — exactly the "arbitrary via scroll on
  mobile, tight fit on desktop" split the operator described a few turns earlier, now emerging
  naturally from ONE mechanism (grow/shrink bounded by both axes, scroll as the final fallback)
  rather than needing a mobile-specific carve-out.
- Verification: two new permanent tests — ca9 (not just an ordinary court) has zero horizontal
  overflow at desktop width across all three Seniors modes (the exact case originally reported),
  and a regression guard asserting ca9/Include at 380px still plans ≥3 rings (catches the
  ring-count-collapse bug specifically, so it can't silently come back). Full jsdom suite
  (`embed/` + `--dist`) and real-Chrome CDP checks (`embed/` + `dist/`) all pass, including every
  earlier issue #50 assertion. Manually re-screenshotted ca9 at both mobile (multi-ring, readable)
  and desktop (Include/Show both fit with no scrollbar) to confirm before finalizing. `dist/`
  rebuilt and committed alongside `embed/`.
- Next: PR #56 still open, awaiting operator review.
- Blockers: none.

### 2026-09-08 (de) — PR #56: rebuilt the senior-band handling from first principles, grounded in issue #50's actual text — scoped radius growth, shared whole-bench scale, horizontal scroll
- Phase: 4, same PR (#56, issue #50), still `claude/issue-50-collision-avoidance`. Picked back up
  after (dd)'s reset to (cz)+points-1-2 immediately re-exposed the original `bandR`-exceeds-`Rmax`
  bug (never fixed in (cz)/(cx), only ever fixed in the later, since-reverted (dc)) — the operator
  asked "did you read issue #50?" and it turned out to matter a lot: the issue's own text already
  specifies "Constraint on steps 1 & 2: both must stay within the size of the actual user-viewable
  area... an expansion that would overflow that area is not a valid application," AND that Step
  3's tie-break language ("don't shrink more than necessary just because a larger reduction also
  worked") is a GENERAL principle, not Step-3-only — confirmed by the operator directly. That
  reframed the whole senior-band question: growing every ring in one shared array (cz's original
  approach) satisfies the viewable-area bound but still grows rings that have no collision of
  their own whenever the band alone is crowded, which is MORE expansion than the situation needs —
  a real violation of the general principle, even though it's a spec-compliant application of
  Step 1's literal "expand all rings together" text. Working through several fork points with the
  operator (a full transcript is more useful than a paraphrase — see the conversation, not
  reconstructed detail here) landed on the actual design implemented:
  - **Steps 1/2 (radius growth) are scoped separately per ring-group**: the senior "show" band
    gets its OWN growth (resolving its own icons' intra-band crowding) and its OWN inter-ring push
    against the outermost ACTIVE ring (only the band moves; the active ring is never the one with
    the problem) — reusing `growRingsForIntra`/`adjustInterRingGaps` completely unmodified, just
    with band-only or `[fixedActiveR, movableBandR]` scoped inputs (a 2-entry array makes index 0
    `adjustInterRingGaps`' own `centerIdx` for k=2, so it's structurally guaranteed to never move).
    "Include" mode needed nothing here — `innerArcSeats()` already folds included seniors into the
    ordinary active seat list, so it was always covered by the plain active-ring pipeline.
  - **Step 3 (icon shrink) is NOT scoped the same way — a real, separate bug found mid-session**:
    an initial band-scoped shrink (mirroring the radius scoping) produced senior icons shrinking
    to a DIFFERENT size than active icons when only the band needed it — operator caught this
    directly ("the senior judge icons are getting shrunk when none of the others are. this
    behavior is wrong") before it shipped. Fixed by unifying: one `resolveAt(scale)` closure now
    re-runs BOTH the active AND band scoped radius steps at a single candidate scale, and Step 3's
    search picks ONE scale used for the whole bench — never an active-only or band-only one. The
    asymmetry (scope radius per-group, but scale whole-bench) is deliberate: growing an
    uninvolved ring's RADIUS wastes space for no reason (the thing the operator's original
    complaint was about), but if shrinking is genuinely needed at all, two different icon sizes in
    the same view is a different, new kind of wrong (visual inconsistency) that scoping doesn't
    avoid, it just creates.
  - **The `bandR`-starting-value bug** (same root cause as the old (dc) fix, rediscovered):
    `growRingsForIntra`/`adjustInterRingGaps` only ever CAP further growth at `Rmax` — neither
    clamps an already-oversized STARTING value, and the band's natural start
    (`outermostActiveR + ROW_GAP`) can already exceed `Rmax` before any growth loop runs on a
    crowded bench. Fixed with an explicit `Math.min(Rmax, ...)` on the starting radius, not just
    the growth ceiling.
  - **Horizontal scroll**: reinstated (`.ctt-judge-stage.ctt-majority-scroll`, `leftBleedShift()`,
    `seatHalfWidth()` — same mechanism `(da)` originally built, same Chrome-transform-counts-
    toward-scrollWidth and overflow-x/y-coupling gotchas, both reconfirmed still true), covering
    BOTH Include's own crowding and the band's — unconditional in Majority mode (no fixed
    breakpoint), so it's purely geometry-driven: an ordinary court shows no scrollbar at all at
    desktop width (verified, new test), and the scrollbar only appears once content genuinely
    doesn't fit as the viewport narrows — exactly the operator's ask ("ideal fit" at the default
    width, "arbitrary" horizontal room on mobile via scroll).
- Verification: three new permanent test sections in `tests/browser-checks.mjs` — (1) `bandR`
  stays within `Rmax` and no senior icon renders above the stage's own top edge (ca9, 22 seniors,
  the original repro), PLUS a same-scale assertion reading each icon's live `transform` directly
  (not internal state) to guard the "two different sizes" bug from ever regressing silently; (2)
  horizontal scroll reaches both edges for Include AND Show (band) at 380px; (3) an ordinary court
  has zero horizontal overflow at desktop width. Full jsdom suite (`embed/` + `--dist`) and
  real-Chrome CDP checks (`embed/` + `dist/`) all pass. Manually re-screenshotted ca9/Show at
  desktop: toggle row now fully clear, active and senior icons visibly the same (shrunk) size
  together, not mismatched. `dist/` rebuilt and committed alongside `embed/`.
- Next: PR #56 still open, awaiting operator review. This PR's `layoutArc` has now been rewritten
  three times in one day (cz→da→db/dc→dd→de) — genuinely worth a full, careful read of the CURRENT
  diff against `main` rather than trying to reason about it from the commit-by-commit history.
- Blockers: none.

### 2026-09-08 (dd) — PR #56: operator asked to stop iterating and reset to (cz), keeping only points 1-2, dropping point 3 and everything built after it
- Phase: 4, same PR (#56, issue #50), still `claude/issue-50-collision-avoidance`. Context: after
  (cz) landed (label-centering fix, majority-line opacity, senior-band-into-collision-pipeline),
  three more same-day commits followed it — (da) rolled back the ENTIRE Steps 1-3 system by
  mistake (over-correcting a narrower ask), (db) caught and fixed that, (dc) then found and fixed a
  real bug (`bandR` could exceed `Rmax`) in the corrected version. The operator's own read on all
  of that: *"i'm not convinced re-tweaking it repeatedly is a good idea"* — asked to go back to
  `730133f` ((cz)) directly and take out only its narrowly-scoped point 3, keeping points 1-2,
  rather than keep patching forward.
- **Mechanics** (worth recording since this is a different git shape than usual): `git reset --hard`
  to the named commit was tried first and DENIED by the permission layer — pivoted to three
  `git revert --no-edit` calls (dc, then db, then da, in that order — newest-first, since they're a
  strictly linear chain with nothing else interleaved) instead. Non-destructive, no force-push
  needed. Confirmed the result matched `730133f` exactly with `git diff 730133f HEAD` (empty).
  Then, for the point-3-only removal: captured `git diff fc3985d 730133f -- embed/court-tracker.js
  tests/browser-checks.mjs` (the two files (cz)'s point 3 touched — confirmed CSS was untouched by
  point 3, points 1-2 are 100% of the CSS diff) into a patch file, `git apply --check -R` to confirm
  it reversed cleanly, then applied for real, then confirmed the RESULT matched `fc3985d` (the
  original (cx) commit, before (cz) existed) exactly for those two files (`git diff fc3985d --
  embed/court-tracker.js tests/browser-checks.mjs`, empty). This "diff-two-commits, isolate the one
  hunk that matters, apply its reverse" technique is the right tool any time a future ask is "keep
  most of commit X, but undo just this one specific piece of it" — cleaner and more verifiable than
  hand-editing back to a remembered state.
- **Net result — see the Resume briefing above for what this actually leaves in the tree.** Kept:
  (cz) points 1-2 (label centering, majority-line opacity). Reverted: (cz) point 3 (band folded into
  the collision-avoidance pipeline) — back to its original (cx) fixed-offset form. Gone entirely:
  the (da)/(db)/(dc) horizontal-scroll feature and the `Rmax` bug it surfaced — none of that ever
  existed in this state; it's not "fixed then reverted," it's simply not there.
- Verification: `npm test` (jsdom, `embed/`) and `npm run test:browser` (real Chrome CDP, `embed/`)
  both pass — this is functionally the same test suite (cz) itself passed, since the code is
  byte-identical to (cz) minus point 3's own diff. `dist/` rebuilt (`court-tracker.min.js` changed;
  `.css` didn't, confirmed identical to `730133f`'s own dist CSS).
- Next: PR #56 still open. The commits `cffd9bf`/`7d111dc`/`ed19958` (da/db/dc) remain in this
  branch's `git log`, reverted rather than removed — don't be confused by seeing them there, they
  are NOT part of the current tree state (three revert commits on top undo them completely).
- Blockers: none.

### 2026-09-08 (cx) — Issue #50: judge-icon ring/arc collision-avoidance algorithm
- Phase: 4. The last piece of issue #50 — the operator's own multi-step ring/arc
  collision-avoidance spec (both prerequisite pieces, the two mobile-380px bugs and the global
  no-photo-initials generalization, were already merged — see the (cv)/(cw) entries below).
  Surveyed real data BEFORE writing any algorithm code: a real bench (ca9, 29 active judges) at
  desktop width already had 16 real label-vs-neighbor-icon overlaps under the EXISTING
  `planRings()`/`S_MIN` icon-spacing system, which only ever guaranteed icon-CENTER spacing, never
  accounted for LABEL extent — this confirmed the operator's concern was real, pervasive (not a
  narrow mobile edge case), and worth building for.
- Implemented, following the spec's own step structure: **Step 0** (a label that wraps to 2 lines,
  or substantially overflows its icon's width on one line, switches to the full-distinct-initials
  fallback issue #50's earlier `initials()` generalization already provides) runs in BOTH Timeline
  and Majority views, always re-derived from `display_name` fresh (never sticky) so it re-evaluates
  correctly across repeated layout calls. **Steps 1/2** (uniform ring-radius growth for intra-ring
  collisions, then non-uniform inter-ring gap adjustment anchored at the centermost ring) apply to
  the general N-seat arc (`layoutArc`, every court except SCOTUS). **Step 3** (icon-shrink to a
  2/3-of-base floor, re-running 0/1/2 at each size, keeping the best result) applies to both
  `layoutArc` and Summary > SCOTUS's own hand-tuned ring formula (`layoutScotusRing`) — Steps 1/2
  deliberately don't touch SCOTUS's ring, to avoid fighting its existing icon-to-icon non-overlap
  clamps. Nothing here is gated behind a viewport-width media query — confirmed working identically
  at 380/480/desktop widths, per the operator's mid-session clarification that the algorithm should
  apply at both mobile and non-mobile from the start.
- Several specifics were genuinely left open by the spec (buffer-tolerance size, the "substantially
  overflows" width factor, the 2/3-floor rounding convention, which ring is "centermost" for an
  even ring count, and how to treat the hover-driven "highlighted icon" exception given this is a
  static layout-time algorithm) — made reasonable documented choices for each rather than blocking;
  full reasoning lives in the code comments directly above `COLLISION_BUFFER_PX` in
  `embed/court-tracker.js`, not duplicated here.
- **Two real, confirmed measurement bugs found and fixed while verifying against real courts in a
  real browser** (a fresh-mount-only test plan never would have caught either — see the
  Conventions entry above for the technical detail): (1) `.ctt-judge`'s own CSS transition made a
  same-tick "clear the transform, measure, restore" trick read stale (still-scaled) geometry,
  which on a resize-after-mount left SCOTUS's entire ring wrongly stuck showing bare initials at
  widths where every surname genuinely fit fine; (2) `.ctt-judge-label`'s box width is a
  near-constant ~52px regardless of text length (a plain block takes its parent's full width), so
  measuring the label's own rect instead of its actual text content made the "substantially
  overflows" check fire on icon SCALE alone, unrelated to the judge's actual name length. Both
  fixed by one new shared helper, `measureLabelNatural()`.
- Verification: `tests/browser-checks.mjs` gained a permanent section — Step 0 on the real
  longest-name judge in the dataset (paed's Nitza Ileana Quiñones Alejandro, confirmed swapped to
  "NIQA"), a bounded-residual-overlap check on a large real bench (paed, desktop — worst overlap
  stays under a generous ceiling, not required to hit exactly zero per the spec's own "buffer
  tolerance" and Step-3 best-effort framing), and a dedicated resize-after-mount regression test
  locking in bug (1) above. Full jsdom suite (`embed/` and `--dist`) and real-Chrome CDP checks
  (`embed/` and `dist/`) all pass — no regressions in any pre-existing geometry assertion.
- Next: no obvious follow-up task on issue #50 itself — see Resume briefing. Re-check
  `gh issue list` fresh next session.
### 2026-09-08/09 (cy) — Issue #49 resolved: repo public again, GitHub Pages live
- Phase: infra, not a Phase-4 task. Issue #49's original diagnosis (an org-level Pages-creation
  policy) turned out to be based on a stale premise — the repo had reverted to private at some
  point (cause not tracked; see CLAUDE.md §7.6 for the corrected timeline), and a private repo on
  a Free-plan org can't use Pages at all, full stop, independent of any org policy. Once a
  separate git-history matter (issue #36) was handled, made the repo public again
  (`gh repo edit --visibility public`) and Pages enabled cleanly on the first attempt — the direct
  API call that previously 422'd now succeeds immediately.
- Went with the legacy branch-deploy option (`source.branch=main`, `source.path=/`) rather than an
  Actions-based workflow — no build step needed at all, matching this project's own "no build step
  at runtime" architecture; GitHub just serves the checked-out tree directly. Added `.nojekyll`
  (standard practice for a non-Jekyll static site on Pages, even though nothing in the current tree
  actually triggered Jekyll processing — verified the site rendered correctly before AND after
  adding it).
- **Live demo:** https://digitalgroundgame.github.io/court-tracker/ — verified in a real headless
  Chrome session (not just an HTTP 200 check): widget mounts, national view renders, clicking a
  circuit opens its pane with real judge photos/data. Documented in `README.md`.
- Closed issue #49 (resolved) — the abandoned old `pages.yml`/`build_release.py --dir` approach
  from closed PR #1 was correctly never resurrected, per that issue's own explicit note.
- Next: no open follow-up on issue #49 itself. PR #56 (issue #50's collision-avoidance algorithm)
  is still open awaiting review — that's the next item.
- Blockers: none.

### 2026-09-08 (cz) — PR #56 review-round fixes: label centering, majority-line opacity, senior-band collision coverage
- Phase: 4, same PR (#56, issue #50) as session (cx) — resumed a session the operator had stopped
  mid-work (an uncommitted `.ctt-majority-line` opacity change was already sitting in the working
  tree; kept it, it's exactly what's described below). Three fixes, all still on
  `claude/issue-50-collision-avoidance`, not a new branch.
- **Label centering** (root-caused, not just patched around): the operator reported labels
  visibly off-centre, overflowing right — measured directly (real Chrome, ca8/ca9 Majority arcs)
  and confirmed it's a real CSS behavior, not a measurement artifact: `.ctt-judge-label` was a
  plain block that always fills its 52px parent, so a single unbreakable word wider than that
  (e.g. a long surname, or the bespoke "Circ. Justice <surname>" label) can't get a negative
  left-offset from `text-align:center` inside a box narrower than its own content — Chrome anchors
  the line flush at the box's left edge and lets it overflow ONLY rightward (confirmed: a 56px
  line in the 52px box rendered 0px left / ~4px right, not the ~2px/~2px true centering needs).
  This wasn't just cosmetic: `measureLabelNatural()`'s Range-based width feeds `labelHitsIcon()`'s
  collision math, which assumes the rendered label is symmetric around the icon's x — a real,
  if modest (~2px), mismatch, consistent with the operator's suspicion that it was nudging the
  algorithm into abbreviations/spacing it didn't actually need. Fix: `width: fit-content` (+
  `-webkit-` fallback) on `.ctt-judge-label`, so it shrink-wraps for anything that fits and only
  grows past the container for genuine unbreakable overflow — where `margin:auto` then centers
  the wider box normally, restoring true symmetric overflow. Verified directly: the paed
  worst-overlap regression check's own measured value dropped from ~12px (the test's prior
  ceiling) to 4.8px after this fix, with no ceiling change needed.
- **Majority-line opacity**: `.ctt-majority-line`'s opacity 1 -> 0.5 (operator ask: half as
  prominent, already a round number, no further rounding needed) — one shared class, so this one
  change covers every Majority view (general arcs + Summary > SCOTUS's ring) already, no
  additional call sites.
- **Senior "show" band now goes through the same collision-avoidance pipeline as the active
  rings** (issue #50 follow-up — the operator flagged the algorithm needed extending to the
  senior show/include cases): audited both. "Include" needed no change — `innerArcSeats()`
  already folds included seniors into the ordinary seat list, so they were always part of the
  same pipeline as everyone else. "Show"'s grayed outer band was the real gap: it sat at a fixed
  `outermost-active-ring + ROW_GAP` offset with NO collision check at all (band-vs-band or
  band-vs-outermost-ring could clash freely) and no `Rmax` ceiling either. `layoutArc()` now
  treats the band as one more ring — one past the last active ring — in the exact same
  `growRingsForIntra`/`adjustInterRingGaps`/`shrinkForCollisions` calls (band members keep their
  fixed centred-spacing ANGLE; only the shared band radius is solved for). Note this shifts which
  ring counts as "centermost" for Step 2's anchor when a band is present (it's now picked over
  the full ring set, band included) — a deliberate, spec-consistent read, documented in the code
  comment above `layoutArc`.
- Verification: `tests/browser-checks.mjs` gained a new permanent section using ca9 (22 seniors —
  the largest real senior cohort in the dataset, and the band's own worst case) — asserts bounded
  residual overlap (same "generous ceiling, not zero" framing the existing paed check uses) and
  that every senior-band icon still lands inside the stage's own viewable area post-fix. Full
  jsdom suite (`embed/` + `--dist`) and real-Chrome CDP checks (`embed/` + `dist/`) all pass, incl.
  every pre-existing issue #50 assertion; `dist/` rebuilt and committed alongside `embed/`.
- Next: PR #56 still awaiting operator review/merge — nothing else outstanding on issue #50 that
  this session is aware of. Re-check `gh issue list`/`gh pr list` fresh next session regardless.
- Blockers: none.

### 2026-09-08 (cw) — Issue #50: no-photo icon fallback generalized to full distinct-name-initials
- Phase: 4. Second of two prerequisite pieces for issue #50's larger collision-avoidance feature
  (the other, bugs 1+2, is session (cv) — a separate, independent branch/PR; check `gh pr list`,
  don't assume either has merged). The spec's "Step 0" fix (switch an overflowing label to full
  initials) came with an aside — *"the icon lettering in profile picture-less judges will also
  have to be changed to match this rule generally"* — flagged by the operator's own issue text as
  a global behavior change needing confirmation before implementing, since it's broader than the
  collision fix itself. Asked via `AskUserQuestion`; operator confirmed "yes, global change."
- `initials()` in both `embed/court-tracker.js` and `embed/appointments-chart.js` (previously
  two DIFFERENT first+last implementations, appointments-chart.js's missing the generational-
  suffix fix court-tracker.js already had) now compute the initial of EVERY distinct name part in
  given-name-first order — "John Quincy Adams" -> "JQA", not "JA" — dropping generational suffixes
  (Jr/Sr/II/III/IV/V), which qualify a name rather than being a part of it (same convention
  `surname()` already used). This is the app's ENTIRE no-photo fallback, not scoped to crowded
  arcs — every call site (icon avatars, the docked detail panel's large photo box, the Change
  view's president avatars, appointments-chart.js's own detail panel) picks it up automatically
  since they all route through the one shared function per file.
- Checked the real-world visual impact before shipping: 35/1490 judges (2.3%) have 4+ distinct
  name parts. Screenshotted the worst realistic case with a real no-photo judge (Virginia Maria
  Hernandez Covington, flmd — "VMHC", 4 letters) in a real browser at the actual 44px avatar size —
  renders cleanly, no visual mitigation needed. (The FULL collision-avoidance algorithm's own
  Step-3 icon-shrink mechanism is the eventual answer for anything that doesn't fit — not
  duplicated here ahead of that work.)
- Verification: `tests/smoke.mjs`'s existing `initials()` unit assertions updated for the new
  behavior (`"Paul Joseph Kelly Jr."` -> `"PJK"`, not `"PK"`) plus a new 3-part-name assertion;
  `appointments-chart.js`'s `initials()` gained its own first-ever unit coverage (now exported via
  `_dev`). Full jsdom suite (`embed/` and `--dist`) and real-Chrome CDP checks (`embed/` and
  `dist/`) all pass. `npm run build` run; `dist/` committed.
- Next: the ring/arc collision-avoidance algorithm itself (intra-/inter-ring resolution, buffer
  tolerance, icon-shrink floor) — see Resume briefing. The operator also clarified mid-session
  that algorithm is intended to eventually apply at both mobile AND non-mobile widths, not just
  crowded mobile arcs (nothing about that part is built yet).
- Blockers: none.
### 2026-09-08 (cv) — Issue #21 refreshed; issue #50's two mobile-380px bugs fixed (feature spec still open)
- Phase: 4. Refreshed the pinned issue #21 (GitHub) — it still described the fresh-ledger-branch
  convention PR #46 reversed the day before (2026-09-08), among other drift. Rebuilt it from
  `CLAUDE.md` §7.6 (the authoritative text) plus `PROGRESS.md`'s own session-log history,
  cross-referenced against real PR numbers: #17 (original formalization), #19/#20 (the 3-way
  ledger-conflict fix, since superseded), #26 (the "implied core-file change" example the hard-stop
  rule cites), #30 (the commit-immediately-on-conflict caution), #32/#33 (the core-protocol-file
  hard stop + its implied-change clarification), #43 (the squash-title `gh pr edit --title`
  gotcha), #44/#45 (adopted `--squash`, a suggestion from contributor @tadjh), #46 (reversed #19).
  No repo file changed — a GitHub issue body isn't tracked in git, so nothing to commit/PR for it.
- Issue #50: fixed the two concrete, reproducible bugs (NOT the larger judge-icon
  collision-avoidance feature spec in the same issue — see Resume briefing; that part is still
  open and has its own explicit "confirm before implementing" gate from the operator).
  - **Bug 1** (Summary > SCOTUS FedSoc key overlapping the title at ~380px): the key's desktop
    `position:absolute; top:8px; right:0` placement (deliberately sharing the title's header band)
    runs into the title once the panel is narrow enough that the title's own text reaches that
    far right. Mobile-only override drops it to `position:static`, flowing onto its own line right
    after the title/meta instead.
  - **Bug 2** (the Supreme Court/Appellate/District tri-selector overlapping the pane's stow/close
    buttons — **every width**, per an operator mid-session correction: the original fix went into
    the mobile media query only, but the ask was for all orientations): harder than the issue's
    own literal numbers suggested. The operator's "align the selector's top with the button's
    vertical center" gave the right DIRECTION (+8px) but not enough MARGIN once measured for real:
    a wrapped 2-line tab centers its text within its own taller box, so an 8px shift of the box's
    top doesn't move the (centered) text down by the same 8px. Real-browser measurement (a DOM
    `Range` around the tab's actual text — not its full padded button box, since the operator's own
    spec explicitly tolerates padding/background overlap and only glyph-touching is the real bug)
    showed the naive calculation left ~1px of genuine text-vs-button overlap at 380/480px; tuned to
    +14px empirically in `.ctt-summary-switch`'s BASE rule (not the mobile media query), verified
    with a several-px safety margin across both the mobile breakpoint's full range (380/480/600px)
    and two ordinary desktop widths (900/1180px). Confirmed visually too (manual CDP screenshots
    at both a mobile and a desktop width), not just by the geometry assertions.
    `.ctt-pane-body > .ctt-summary-content`'s existing `flex:1 1 auto` already absorbs the extra
    height (no manual margin-redistribution needed), and since the tri-selector is shared across
    all three Summary sub-tabs, the SCOTUS/District pixel-parity invariant (sessions (cb)/(cc)/(cl))
    is unaffected regardless of how tall it ends up being. Bug 1 stays mobile-only by design — the
    FedSoc key deliberately shares the desktop title's header band, and an existing
    `browser-checks.mjs` assertion already covers that desktop behavior on purpose.
  - Verification: `tests/browser-checks.mjs` gained a permanent regression section (bug 1 checked
    at 380/480/600px, bug 2 at 380/480/600/900/1180px). Full jsdom suite (`embed/` and `--dist`)
    and real-Chrome CDP checks (`embed/` and `dist/`) all pass.
- The feature spec's confirm-before-implementing gate was resolved mid-session: the operator
  confirmed (2026-09-08) the no-photo icon fallback SHOULD become a global "full distinct-name-
  initials" change (e.g. "John Quincy Adams" -> "JQA", not "JA"), and clarified the collision-
  avoidance algorithm itself is intended to eventually apply at both mobile and non-mobile widths
  too (worth remembering when that part is actually built — nothing about it has been implemented
  yet beyond this initials groundwork). See the next session-log entry for the initials() change
  itself (separate branch/PR from this one).
- Next: the full ring/arc collision-avoidance algorithm (intra-/inter-ring resolution, the
  buffer-tolerance region, icon-shrink floor) — see Resume briefing.
- Blockers: none remaining on issue #50 that need operator input; the algorithm's own open
  implementation choices (exact buffer size, 2/3-base-size rounding convention, what counts as a
  "distinct name part" for a suffix) are flagged in the issue as choices to document, not gates.

### 2026-09-08 (cu) — Issue #28: Schema 2.0 batch (appointments typing, circuit_justices dedup, seat_blocks vocabulary unification)
- Phase: 4 (data-contract work, not a Phase-4 checklist item). Landed the three MAJOR candidates
  `docs/SCHEMA_CHANGELOG.md` had carried in its Proposed section since 1.0.0 (2026-09-06), batched
  into one 2.0.0 bump per `DATA_CONTRACT.md` §6 point 4 and issue #28's own framing:
  - `appointments.json` is now a typed build (`build_appointments()` in `scripts/build_assets.py`)
    instead of a raw string passthrough of `appointments.csv`: dates/free-text are `string | null`
    (`""` → real `null`), `sitting` is a plain `boolean`, `fjc_jid` is `int | null`.
    `fedsoc_reported`/`acs_reported` are `boolean | null` — genuinely **three**-state in the real
    data (confirmed: 25 sitting-judge rows have neither `"true"` nor `"false"`), not a blind
    `_coerce_bool`; a new `_coerce_bool_nullable()` helper keeps "never asked" (`null`) distinct
    from "asked, unaffiliated" (`false`) rather than fabricating a checked-and-negative signal
    from unchecked data. Promoted `appointments` from `provisional` to `stable` in
    `manifest.stability` as a direct consequence. `embed/appointments-chart.js` updated at every
    `"true"`/`"false"` string-comparison call site (`statusOf`, the two affiliation-mark checks).
  - `circuit_justices.json` no longer publishes the `full_name` duplicate of `justice_name`. The
    widget's own judge-icon renderer (`makeIcon`/`initials`/`showDetail`) still reads `full_name`
    uniformly across judges and justices, so `loadJustices()` in `embed/court-tracker.js` now
    synthesizes it client-side (`j.full_name = j.justice_name`) once at load time — every render
    call site keeps working unchanged, verified by hovering the Circuit Justice icon in the smoke
    suite and checking the docked detail shows a real name, not `undefined`.
  - `seat_blocks.level` now says `specialized` for CIT/CFC, matching `courts.court_level`'s own
    vocabulary, instead of a second word (`feeder`) for the same concept. Updated every literal
    `"feeder"` level comparison in `embed/court-tracker.js` (`renderSeatBlocks` and its three call
    sites) and the dev tool `tools/tune-seat-blocks.html`; left the *prose* "feeder"/"View
    feeders" UI language alone (that's user-facing wording, not the schema vocabulary).
  - `SCHEMA_VERSION` bumped to `2.0.0` in `build_assets.py`; `docs/SCHEMA_CHANGELOG.md` gained a
    `## 2.0.0` entry and the Proposed section's now-landed MAJOR list was cleared (the MINOR
    proposals — `judges_search` fields, a per-circuit rollup — are untouched); `docs/CODEBOOK.md`
    Tables C/E and `docs/DATA_CONTRACT.md` §2/§7/§8 updated to match (also fixed two doc bugs
    found in passing: Table E's stale "empty party" claim for reorganization rows — it's actually
    `"None (reassignment)"` in both columns, verified against the real CSV — and its stale "not
    consumed by the current widget" line, which `appointments-chart.js` has read since session aj).
- Verification: `tests/smoke.mjs` gained a dedicated Schema 2.0 section (raw-JSON assertions on
  `circuit_justices.json`/`seat_blocks.json`/`manifest.json`, a live hover check that the
  Circuit-Justice full_name synthesis actually renders, and typed-field assertions on the loaded
  `appointments.json` rows including a check that all three `fedsoc_reported` states are really
  present in the data, not just theoretically possible). Full jsdom suite (`embed/` and `--dist`)
  and real-Chrome CDP checks (`embed/` and `dist/`) all pass; `data/*.json` and `dist/` rebuilt and
  the diffs spot-checked (pure shape changes, no accidental data movement).
- Next: no unparked, actionable open issue left as of this session — see Resume briefing.
- Blockers: none.

### 2026-09-08 (ct) — Issue #6: destroy()/unmount() for SPA embedding, both widgets
- Phase: 4. Both `court-tracker.js` and `appointments-chart.js` now export `destroy(root)` (also
  reachable as the resolved `mount()` handle's own `.destroy()` method, matching the issue's
  suggested API). It removes the window `resize` listener, the document `mousedown` (tracker) /
  `keydown` (beeswarm) listener, and — court-tracker only — the body-level `.ctt-tooltip` node the
  mount registered; empties the root; clears the `cttMounted`/`ctaMounted` auto-mount guard so the
  root can be re-adopted by a later `mount()`; and bumps a mount-token so a fetch still in flight
  from a torn-down mount can't write into a UI that's already gone (court-tracker already had this
  guard, `_mountSeq`/`superseded()`, for concurrent mounts — appointments-chart gained the same
  pattern here, since it previously had none).
- Also fixed the leak for repeated `mount()` calls WITHOUT an intervening `destroy()` — the
  issue's own title, not just the SPA-teardown case: each `buildShell()` now tears down its own
  previous mount's globals (via a shared `teardownGlobals()`) before wiring up new ones, so two
  consecutive `mount()` calls net exactly one resize/mousedown/keydown listener and one tooltip
  node, not two.
- Verification: `tests/smoke.mjs` gained a listener-count-tracking harness (wraps
  `window`/`document` `add`/`removeEventListener` before any module import, so it sees every
  listener either widget registers) plus a dedicated destroy()-teardown section per widget,
  asserting listeners are ACTUALLY unregistered — not just that an internal handle went null.
  Full suite passes against `embed/` and `--dist`; `npm run test:browser[:dist]` (real Chrome via
  CDP) also passes, confirming no regression. `npm run build` run; `dist/` committed alongside
  `embed/` per CLAUDE.md §6. README gained a short "Unmounting in a single-page app?" section next
  to the existing programmatic-`mount()` example.
- Next: issue #6 wasn't a Phase-4 checklist item, so nothing there changed. See Resume briefing
  for the next likely task (issue #28) — re-check `gh issue list`/`gh pr list` at session start,
  since it can be superseded.
- Blockers: none.

### 2026-09-08 (cp) — Issue #7 hover/mobile audit, real overlap bugs found on review, CI flakiness root-caused and fixed twice, PROGRESS.md logging convention cleaned up
- Phase: 4. Issue #7: audited every hover-only affordance — all already had a working `click`
  equivalent (verified live, zero hover ever dispatched in the test); used `tests/shoot.mjs` to
  actually eyeball the ~380px mobile layout for the first time since Phase 1.
- **Self-corrected before merge**: operator's own real-DevTools review (once `tests/visual.html`'s
  missing viewport meta tag was fixed) found two genuine text-overlap bugs the automated pass never
  checked (Summary tab; the tri-selector/pane-button area) — filed as issue #50 with the operator's
  full collision-avoidance algorithm spec; both PROGRESS.md mobile checkboxes walked back from
  `[x]` to `[~]`.
- **CI flakiness, confirmed systemic and fixed twice**: `real-browser checks` had been failing on a
  first try and passing clean on re-run, repeatedly — root cause was a fixed timeout (Chrome's
  CDP-port wait, then a fixed page-render sleep) too short for a cold/shared Actions runner; both
  replaced with real polling.
- GitHub Pages found blocked by an org-level policy (not a repo-plan issue) — filed as issue #49,
  deliberately parked; working from a locally-hosted server in the meantime.
- **This entry itself**: cleaned up `PROGRESS.md`'s logging convention — the ~2,400-line top
  blockquote buffer (47 entries, accumulated over many sessions) is gone: ~23 entries (`(ay)`,
  `(bi)`-`(ce)`) were already duplicated in this Session log in condensed form and were simply
  removed; the remaining ~14 (`(cf)`-`(cp)`) are condensed into the entries below. Also corrected a
  real, confirmed writing error: sessions `(bt)`-`(ce)` had drifted up to +7 days ahead of their
  actual git-commit dates (some earlier session estimated/incremented "today" instead of checking
  it) — corrected using git history as ground truth; inline prose/code-comment references to the
  old wrong dates were NOT hunted down and fixed (flagged as a known exception instead, not
  silently treated as resolved). `CLAUDE.md` also gained a rule requiring the real current date be
  checked (never estimated) before writing any dated entry.
- Verified: `tests/smoke.mjs`/`tests/browser-checks.mjs` still ALL PASS after the fixes above (this
  cleanup itself touches no app code).
- Blockers: none. **Next**: issue #6 (destroy()/unmount() for SPA-style embedding); issue #50
  (mobile overlap bugs + collision-avoidance algorithm) whenever picked up.

### 2026-09-07 (cp)/(cs) — Issues #3/#4/#8/#2 fixed, squash-merge adopted, CI/dist/test-server hardened
- Phase: 4. Continuing (cp): fixed issue #3 (irreplaceable manual data files moved from gitignored
  `data/cache/` into tracked `data/manual/`, after a real incident had already wiped curated photos
  once); issue #4 (recorded the real, verified download URLs for the two bulk data inputs); issue
  #8 (untracked 59MB of one-time geometry-source shapefiles + a stray temp file, forward-only, not
  a history rewrite); issue #2 (optional `assetRoot` override for both widgets, a relative override
  resolves against the host page, not the script's own URL).
- Adopted `--squash` merging repo-wide (a contributor suggestion — collapses conflict-resolution
  noise instead of leaving it as permanent `main` history) — then reversed the fresh-ledger-branch
  convention from the day before back to riding the `PROGRESS.md` entry in the same branch, since
  squash-merge removed the reason for the extra branch.
- (cs) (two unrelated sessions reused this letter): issue #5 — CI, a real `npm test`, and a
  minified `dist/` build; separately, ten follow-up hardening fixes from reviewing that PR (issue
  #42) — a build that could delete `dist/` on failure, two server crash bugs, CI catching untracked
  bundle drift, `CT_PORT` not propagating, etc.
- Also: confirmed the repo is public (operator, for GitHub Pages + a branch ruleset) — reopened the
  git-history PII question PR #15 had closed under a private-repo assumption (issue #36,
  deliberately not scheduled).
- Verified: each landed with CI green; issue #8's temp-file handling verified byte-for-byte against
  the file it superseded before choosing not to delete it.
- Blockers: none.

### 2026-09-06 (cn)/(co)/(cp)/(cq)/(cr) — Publishing prerequisites, PII cleanup, git-workflow formalized, JSON-only release asset, data schema as a public API
- Phase: 4. (cn): national-totals reconciliation moved from render-time JS into `build_assets.py`
  (ships in `manifest.national_totals`), and `.github/workflows/release-data.yml` added (the repo's
  first CI) — tags + publishes a GitHub Release whenever `data/manifest.json` changes, so a
  scheduled puller never races a moving `main`.
- (co): scrubbed a personal email + machine-specific paths from `scripts/` (issue #9) — new
  `scripts/_useragent.py` builds the User-Agent from an optional `$COURT_TRACKER_CONTACT` env var
  instead of a hardcoded address; `qgis_export.py`'s absolute paths now resolve from the repo root.
- (cp): formalized branch → PR → merge as the standing git workflow (operator ask, the repo already
  had 2 open PRs independently using the pattern) — later that same day, resolved a real 3-way
  `PROGRESS.md` merge conflict from 3 concurrent branches all writing the same top-of-log line, and
  added the `.gitattributes` `merge=union` backstop.
- (cq): a JSON-only release asset (`data-json.tar.gz`) published alongside the full data package,
  for a consumer that renders its own map/images and wants to skip the ~98% of bytes that are
  photos+geometry.
- (cr): `manifest.schema_version` + `manifest.stability` added — a versioned public-API contract
  for the published data (`docs/DATA_CONTRACT.md`, `docs/SCHEMA_CHANGELOG.md`), separate from
  `manifest.version`'s content hash.
- Verified: each landed with its own PR, CI green, `tests/smoke.mjs` passing.
- Blockers: none.

### 2026-09-05 (cf)-(cm) — Header search bar (feature) + 6 bugfix/refinement rounds + national-totals display-clarity note
- Phase: 4. (cf) added the header search bar: judges searchable by name (fuzzy/prefix/exact
  scoring), right-aligned in the title band, new `data/judges_search.json` (~250KB, 1,490 judges),
  results navigate via existing map/pane primitives.
- (cg)-(ck) were bugfix/refinement rounds against it: SCOTUS results routing to an unreachable pane
  + auto-pin (cg); a second search on the same open court incorrectly closing the pane (ch); a
  hidden senior judge pinned via search not revealing correctly in Majority mode (ci); roving
  judgeships (shared seats, 28 U.S.C. §133) merging into one result with per-court jump buttons
  (cj); click persisting the FedSoc/ACS mark across the page session + splitting the meta line into
  separate flex children (ck).
- (cl) fixed a follow-on: the "· " joiner between president-chip and court-label read as an
  orphaned bullet once (ck)'s wrap landed the chip above the label — made it its own hideable span.
- (cm): root-caused (not just observed) Summary > District's totals not summing at face value
  (654+27=681>673) — a handful of courts exceed their base authorized seat count (roving
  judgeships), `over_authorized` in the manifest now explains the gap instead of hiding it.
- Verified: `tests/smoke.mjs`/`tests/browser-checks.mjs` extended for each fix; all passed at the
  time.
- Blockers: none.

### 2026-09-04 (ce) — Territorial-court note bottom-alignment in Timeline mode, Summary > Supreme Court FedSoc default + legend key
- Phase: 4, continuing (cd). Territorial note (VI/GU/NMI): root cause was .ctt-stage-main lacking
  align-self:stretch, unlike .ctt-detail — it sat at align-items:flex-start's natural content
  height within the already-tall stage row (forced tall by .ctt-pane-body > .ctt-stage-row's own
  flex:1 0 auto, in BOTH modes), leaving a gap below in Timeline mode. Majority mode masked this
  by explicitly inflating the stage via majorityStageHeight() to nearly fill the row; Timeline's
  timelineStageHeight() sizes purely from row count with no such compensation. Fixed with
  align-self:stretch + flex-column on .ctt-stage-main and margin-top:auto on .ctt-note (a sticky-
  footer flex pattern), reverted to a fixed 6px on mobile where the row stops being flex at all.
- Summary > Supreme Court: FedSoc now defaults ON (SCOTUS's own Summary pane has no None|FedSoc|
  ACS switch of its own to toggle it from) as a ONE-TIME session default (S._affilMarkTouched)
  that never overrides a real choice made anywhere, plus a right-aligned legend key
  (.ctt-scotus-affil-key) in the same horizontal band as the title/meta text, using the same
  position:absolute technique the District deploy button already uses.
- Verified: extended tests/smoke.mjs and tests/browser-checks.mjs for both fixes (note alignment
  in both modes across territorial/ordinary courts, FedSoc default firing/non-override, legend key
  geometry). smoke.mjs/browser-checks.mjs/stress.mjs (12 cycles) all pass.
- Next: no open item from this bug report. Resume the Phase-4 tail list above as the next task.
  (Operator also dropped prompt_09_04_2026.txt in the repo root — a search-bar feature request —
  not yet actioned; it wasn't raised in conversation this session.)
- Blockers: none.

### 2026-09-04 (cd) — Deploy-button arrow direction, click-to-pin from the circuit table, alternate ca1/ca3 sub-assembly layout, empty-hint alignment fix
- Phase: 4, continuing (cc). Deploy button arrows now flip with the label (down for "Set upon
  map", up for "Remove from map") — districtDeployBtnLabel() picks both from the same
  S.districtOnMap check.
- New feature: clicking a circuit-table row pins that district, same as clicking its cartogram
  block. Refactored the pin logic into a shared pinDistrictCourt(did) closure used by both the
  SVG click handler and a new per-row click handler (threaded through showDistrictDetail's new
  onRowClick param); the Total row is excluded (different class entirely).
- Alternate ca1/ca3 drill-in sub-assembly layout: PR/VI were positioned relative to each other
  (a cross-circuit layout for the deployed/Summary presentation), which read wrong for a single
  circuit's own sub-assembly. Wrote scripts/build_district_arrangement_alt.py, porting
  tools/district-block-builder.html's own color-resolution algorithm line-for-line against the
  operator-supplied raw round-trip export (temp_alt_ca1_ca3.txt, left untouched/gitignored) and
  the current data/seat_blocks.json (zero cell-count mismatches) to produce
  data/district_arrangement_alt.json in the same schema as the main file. Registered in the
  manifest; consumed ONLY by renderDistrictSubassembly for ca1/ca3 — the deployed overlay and
  Summary preview keep using the original file.
- Empty-hint text: Summary > District's hint sat 2px lower than SCOTUS's own because
  .ctt-district-detail's own .ctt-detail-content is display:flex (needed elsewhere in the same
  panel) and flex containers don't collapse margins with children the way SCOTUS's plain-block
  panel does. Cancelled the hint's own margin-top in that scoped context to match exactly.
- Verified: extended tests/smoke.mjs and tests/browser-checks.mjs for all four fixes (arrow
  direction, row-click-pins + Total-row exclusion, alt arrangement vs. unaffected presentations,
  empty-hint parity). smoke.mjs/browser-checks.mjs/stress.mjs (12 cycles) all pass.
- Next: no open item from this bug report. Resume the Phase-4 tail list above as the next task.
- Blockers: none.

### 2026-09-04 (cc) — Two self-corrections: Summary height/text parity broken by (cb)'s caption promotion, and the 2026-09-07 title-stability fix scoped to the wrong element
- Phase: 4, continuing (cb). Summary parity: District's caption+meta was nested inside
  .ctt-pane-controls (own scoped margin pushed it down 6px from SCOTUS's own subtitle/meta
  start). Fixed by mirroring renderSummaryScotus's structure exactly — captionTitle/captionMeta
  as direct children of .ctt-summary-content in a flex-column wrapper (.ctt-district-caption-row,
  needed so their margins don't collapse the way plain block flow would), deploy button moved to
  position:absolute so it adds zero height to that flow. Verified pixel-identical top/left/
  content-row-top/content-row-bottom between the two sub-tabs.
- Title-stability fix rescoped (again): the 2026-09-07 ask was about the Summary > District
  docked tooltip's own name line (.ctt-district-detail .ctt-detail-name), not .ctt-pane-title
  (ordinary drill-in court panes). Fully reverted .ctt-pane-title--district; re-applied the same
  min-height concept to .ctt-detail-name inside .ctt-district-detail instead — this time with an
  explicit line-height:1.25 too, since min-height:3.75em without it silently used the inherited
  1.45 line-height, computing a floor shorter than a genuine 3-line name actually needs.
- Verified: rewrote the stale 2026-09-07 browser-checks.mjs assertions to check the correct
  element; confirmed ordinary panes carry zero reservation CSS; confirmed the tooltip's name-box
  height is genuinely constant across many different districts hovered in a real browser.
  smoke.mjs/browser-checks.mjs/stress.mjs (12 cycles) all pass.
- Next: no open item from this bug report. Resume the Phase-4 tail list above as the next task.
- Blockers: none.

### 2026-09-04 (cb) — Sticky-while-pinned refinement, District caption title+meta, all-four-edge partial clipping, sub-assembly block-growth + click-to-open
- Phase: 4, continuing (ca). Sticky-hover now pauses itself while something is pinned:
  wireDistrictCartogramHover takes an anyPinned() callback and re-evaluates `sticky &&
  !anyPinned()` on every pointermove/pointerleave instead of a value fixed at wire time — a
  different (non-pinned) district still grows on hover but no longer stays stuck grown once
  something else is pinned; the actual pin's own growth is unaffected either way.
- District caption promoted to a real title (.ctt-summary-subtitle, bold) + meta line
  (.ctt-pane-meta) below it summarizing nation-wide totals via a new districtNationalTotals()
  helper, summed straight from seatBlocks so it can't drift from the table/blocks themselves.
- Partial-clip dragging generalized from bottom-only (fixed vh-40px) to all four edges
  symmetrically via DISTRICT_OVERLAY_MAX_HIDDEN_FRAC = 0.8 — at most 80% of the assembly's own
  width/height may go past any one edge. Needed `aspect` to persist in S.districtMapState itself
  (previously computed once and discarded) so sizeDistrictOverlay can re-derive current height.
- Drill-in sub-assembly: hovering a block now also grows the real on-map seat-block grid for that
  district (highlightBlock(currentSVG(), did, "ctt-block-hover"), the same mechanism a direct
  map-shape hover already uses) alongside the blue shape tint from (ca); clicking a block now
  opens that district's own info pane via jumpToDistrictCourt.
- Verified: extended tests/smoke.mjs (sticky-while-pinned regression, caption text, sub-assembly
  growth+click) and tests/browser-checks.mjs (caption styling, all-four-edge clip percentages in
  a real browser). smoke.mjs/browser-checks.mjs/stress.mjs (12 cycles) all pass.
- Next: no open item from this bug report. Resume the Phase-4 tail list above as the next task.
- Blockers: none.

### 2026-09-03 (ca) — Pane-title stability, Appellate rename, deploy-button layout, growth-scale reduction, circuit Total row, and a severe hidden bug (hover grew every district at once)
- Phase: 4, continuing (bz). Pane-title min-height fix scoped to `.ctt-pane-title--district`
  (JS adds it only for `court_level === "district"`) after an unscoped first attempt regressed
  CFC's pane into a scrollbar — caught by browser-checks.mjs, fixed by rescoping.
- Renamed Summary > "Courts of Appeals" to "Appellate Courts" (matches "District Courts").
- District controls row: deploy button moved right, width-matched to the docked panel (232px),
  label flanked by down arrows; left space now reads "Party of District Court Appointments,
  Arranged by Circuit".
- DISTRICT_SQ_SCALE_HOVER reduced 1.35 -> 1.15 now that (bz)'s non-scaling stroke (not the scale)
  closes the cartogram's seam regardless of zoom.
- Circuit Total row added to renderDistrictCircuitTable(): bolded, sums R/D/vacant across the
  circuit, flanked by heavier 2px separator lines, sits directly below the pinned/hovered row.
- Bug 13, the real one: hovering ONE district grew every district in the deployed assembly at
  once. Root cause: `grow = (hoveredId && ...) || (isPinned && isPinned(sqDid))` evaluates to
  `undefined`, not `false`, when isPinned isn't a function — classList.toggle(name, undefined)
  behaves as a plain toggle (flip current state) rather than force-remove, so every non-hovered
  square's absent class flipped to present on the first hover. Fixed with `!!(...)`; added
  permanent regression tests in both smoke.mjs and browser-checks.mjs given the severity. Also
  from this report: drill-in sub-assembly moved top-left -> bottom-left and its hover now ties to
  the real district shape's blue highlight too (highlightDistrictOnMap now uses currentSVG(),
  not a hardcoded S.ui.nationalSVG); fixed corner controls moved bottom-left -> top-right with ×
  reordered to be right-most.
- Verified: extended tests/smoke.mjs and tests/browser-checks.mjs (several claims are CSS-value
  assertions jsdom can't check at all, since this harness never loads court-tracker.css — those
  live in browser-checks.mjs only). smoke.mjs/browser-checks.mjs/stress.mjs (12 cycles) all pass.
- Next: no open item from this bug report. Resume the Phase-4 tail list above as the next task.
- Blockers: none.

### 2026-09-03 (bz) — Five more District bug reports: pane stacking, hover-seam artifacting, 1px Summary height mismatch, fixed-frame controls + D button + persisted zoom, docked-panel order
- Phase: 4, continuing (by). Pane-covers-the-map: `.ctt-district-overlay`/`.ctt-district-subassembly`
  carry their own z-index (drag/resize chrome) which put them ABOVE `.ctt-pane`'s default stacking
  regardless of DOM order — fixed by explicitly hiding both whenever the pane opens
  (updateDistrictOverlayVisibility/updateDistrictSubassemblyVisibility, called from togglePane).
- Hover-growth "faint light traces": measured real overlap between grown same-district cells —
  a comfortable margin in the roomy Summary preview but only ~0.15px in the smaller on-map
  overlay, since the closure margin is a fixed VIEWBOX-unit amount that shrinks with the
  cartogram's own render scale. Fixed with a non-scaling stroke matching each cell's fill, which
  pads by a fixed SCREEN-pixel amount instead, robust regardless of zoom.
- 1px Summary height mismatch: SCOTUS's header (subtitle+meta) and District's (.ctt-pane-controls)
  measured 41 vs 42px of cumulative margin before hitting the same fixed bottom edge. Shaved 1px
  off .ctt-pane-controls' margin, scoped to Summary only. Both panels now measure identical top
  AND bottom.
- Fixed-frame map controls: ×/−/+ moved out of the draggable assembly into a new
  .ctt-district-corner-controls div anchored to the viewport's own bottom-left corner, present
  from national view's first load. Shows a "D" button when the assembly isn't currently shown,
  which redeploys in place or loads+deploys fresh — no more requiring a trip back to Summary.
  Zoom (width only, never position) now persists across page reloads via localStorage (first use
  in this codebase), read back by defaultDistrictMapState as the base width.
- Docked-panel order: table first (flexes/clips), name + Jump button anchored at the bottom —
  pure DOM-order change in showDistrictDetail(), riding the same flex-column mechanics (by)
  already put in place. Verified an artificially long multi-line name correspondingly shrinks the
  table's own height.
- Verified: extended tests/smoke.mjs (added localStorage to the jsdom harness); smoke.mjs/
  browser-checks.mjs/stress.mjs (12 cycles) all pass. All five fixes additionally confirmed via
  real getBoundingClientRect/computed-style measurement in headless Chrome.
- Next: no open item from this bug report. Resume the Phase-4 tail list above as the next task.
- Blockers: none.

### 2026-09-03 (by) — Two (bx) bug reports fixed: table-overflow scrollbar + hover stickiness/row-highlighting
- Phase: 4, continuing (bx). Bug 1 (table growth pushed a whole-pane scrollbar instead of
  clipping internally): (bx)'s flex-shrink pass was necessary but not sufficient. Fixed two more
  gaps found via real getBoundingClientRect measurement — `.ctt-district-detail` needed
  `align-self: stretch` (its row-flex parent's `align-items: flex-start` let it hug its own
  15-row content height instead of the row's bounded height), and `.ctt-district-table-wrap`'s
  own `flex: 1 1 auto`/`overflow-y: auto` were inert because its actual DOM parent
  (`.ctt-detail-content`, shared with the judge-detail panel) isn't itself `display: flex` —
  scoped a flex-column override to `.ctt-district-detail > .ctt-detail-content` specifically so
  the shared class/judge panel are untouched. Verified in headless Chrome: `.ctt-pane-body`
  scrollHeight now equals clientHeight (no outer scrollbar) while `.ctt-district-table-wrap`
  itself overflows internally as intended.
- Bug 2 ((bx)'s hover/pin split was the wrong reading of "sticky"): collapsed the two row
  classes (`-row-hover`/`-row-pinned`) into one `ctt-district-row-active`, applied identically
  whether a district is merely hovered or pinned. Rewrote `wireDistrictCartogramHover` to take
  `{ sticky, isPinned }`: sticky mode means a leave/gap event never clears the current district,
  only a genuinely different real hover does — matching the pre-existing judge-detail panel's
  own `hideDetail()`/`unpinDetail()` contract exactly. Pinning now layers a lock on top of the
  same sticky-hover state instead of being a separate mechanism; unpinning (`unpinDistrictDetail()`)
  no longer resets content, matching `unpinDetail()`'s precedent.
- Verified: rewrote the stale (bx) assertions in tests/smoke.mjs for the unified active-row class
  and no-reset-on-unpin behavior; smoke.mjs/browser-checks.mjs/stress.mjs (12 cycles) all pass.
  Confirmed both bugs fixed directly in headless Chrome via a throwaway CDP script (not checked in).
- Next: no open item from this bug report. Resume the Phase-4 tail list above as the next task.
- Blockers: none.

### 2026-09-03 (bx) — Summary > District docked panel: table, sticky pin standardization, dock height
- Phase: 4, continuing (bs)-(bw). Replaced the docked panel's plain R/D/vacant text with a
  circuit-wide table (District | R | D | Vacant, no header, block-builder-tool square swatches
  but count-before-swatch per operator preference, standard alphabetical order with the pinned
  row reordered to top + bolded and a merely-hovered row highlighted in place without
  reordering) and moved the Jump-to-court button up under the name.
- Standardized two behaviors to match the judge-detail panel exactly: pinned blocks now stay
  visually enlarged after the cursor leaves (was only true of the panel content, not the block
  scale — wireDistrictCartogramHover now takes an isPinned predicate folded into its existing
  grow/shrink decision), and clicking elsewhere now unpins (extended the SAME document-level
  mousedown listener the judge panel already used, requiring pin state to move from a local
  closure variable to module-level S.districtDetailPinnedId — which also means a pin now
  survives switching Summary sub-tabs and back, a natural side effect of the promotion).
- Root-caused the dock-height/vertical-centering gap: the CSS rule that lets SCOTUS's/a regular
  court's dock reach the bottom is a direct-child selector that never reached either Summary
  sub-tab's row, since Summary's content sits one level deeper. Propagated the same flex
  treatment down through both levels rather than special-casing District, then added
  align-self:stretch + justify-content:center on the cartogram wrap for the actual centering.
  Verified via real getBoundingClientRect measurement (51.98px vs 52px gap) after a wide
  screenshot initially read as off at a glance — the precise measurement, not the screenshot,
  is what actually confirmed it.
- Verified via substantially extended tests/smoke.mjs plus real-browser screenshots. Prior
  suites (browser-checks.mjs, stress.mjs) pass unmodified.
- Next: nothing outstanding from this round. Full detail above CURRENT PHASE (search "(bx)").
- Blockers: none.

### 2026-09-03 (bw) — District phase, Milestone 3: deploy-only "pull out" animation — DONE
- Phase: 4, closing out the Summary-tab initiative from (bs). Built the last deferred piece:
  clicking "Set upon map" measures the cartogram's live on-screen rect in the Summary pane,
  closes the pane, then flies an independent floating clone to the on-map target rect before
  the real persistent overlay takes over — reads as one continuous object migrating, not
  vanishing and reappearing. Never animates on the way back (hide/redeploy stay instant, per
  (bv)); respects prefers-reduced-motion.
- Caught a real bug via screenshot: the flyover rendered solid black instead of real colors,
  because it's appended to document.body (same reason S.ui.tooltip already is) and the
  `.ctt-sq-rep`/-dem/-other CSS var(--ctt-rep) etc. custom properties, defined on .ctt-root,
  don't cascade there. Fixed by copying the 3 needed properties onto the flyover's own inline
  style rather than re-parenting.
- Added a new tests/browser-checks.mjs block (jsdom structurally can't exercise this — its
  zero-rect layout already makes the animation self-skip) asserting the flyover's genuine
  mid-animation computed color is not rgb(0,0,0) — exactly the shape that would have caught
  this bug before shipping. All prior suites pass unmodified.
- This closes the entire Summary-tab feature from (bs): SCOTUS, Appellate, and District
  (preview + deployment + this animation) are all built and tested. Nothing from the original
  spec remains. Full detail above CURRENT PHASE (search "(bw)").
- Blockers: none.

### 2026-09-03 (bv) — District phase, Milestone 2: full "Set upon map" deployment mechanic
- Phase: 4, continuing (bs)/(bu) — the largest single piece of the Summary-tab initiative,
  built and tested end-to-end in one session (not a partial slice): the on-map overlay layer,
  its 3 control buttons (show/hide toggle + resize +/-), drag-to-reposition, hover-highlight of
  the real district shape ("standard blue"), and the circuit-drill-in fixed sub-assembly (that
  circuit's own districts only, independent of national deployment state, excluding cafc). Only
  the deploy-only "pull out" animation is still explicitly deferred.
- Caught a real placement bug via screenshot before it shipped: the initial top-right default
  position landed directly on top of the map's own dense 1st/2nd/3rd/DC seat-block cluster.
  Moved to bottom-right (open water at every zoom level), sized correctly on first placement
  using the cartogram's own real bbox aspect ratio rather than a guessed height.
- Resize/drag/window-resize all funnel through one `sizeDistrictOverlay()` that reclamps
  against the current viewport — this is also what makes the assembly correctly scale down on
  mobile (380px screenshot-verified), closing the responsive-sizing item explicitly deferred
  from (bt). Hover-highlight clears centrally in one place (`updateDistrictOverlayVisibility`)
  rather than at every hide call site, deliberately avoiding (bt)'s docked-detail drift bug
  pattern. The circuit-drill-in sub-assembly reuses (bu)'s `filterCircuitId` refactor with zero
  further changes needed.
- Verified via 25 new `tests/smoke.mjs` assertions (real DOM events throughout) plus real-
  browser CDP screenshots at desktop and mobile widths, including a zoomed crop proving the
  actual map-shape fill change. Prior suites pass unmodified.
- Next: the deploy-only pull-out animation; otherwise the Summary-tab initiative from (bs) is
  essentially feature-complete. Full detail above CURRENT PHASE (search "(bv)").
- Blockers: none.

### 2026-09-03 (bu) — District phase, Milestone 1: docked detail viewer + click-to-pin
- Phase: 4, continuing (bs)/(bt) — first slice of the large District "lift onto map" feature.
  Refactored the cartogram SVG into a standalone `buildDistrictCartogramSVG()` (reusable for the
  later on-map/drill-in presentations). Added a docked per-district detail panel to Summary >
  District (hover fills it with live composition, click pins it, same visual family as the
  judge-detail panel) plus a Jump-to-court button that drills into the district's own circuit
  and opens its pane — composed from existing `drillIn`/`selectCourt`, not a new nav path. Also
  reverted the district cartogram's hover-grow scale back to 1.35x (its own dedicated constant,
  not the map's 1.17x) per operator feedback after testing it live: bigger growth reads better
  here since same-district blocks often have real gaps between them.
- Fixed a test-fragility issue this surfaced: reusing the `.ctt-detail` class for the new panel
  made bare `.ctt-detail` queries in `tests/smoke.mjs` ambiguous after visiting District;
  disambiguated with `:not(.ctt-district-detail)` rather than renaming the shared class.
- Verified via extended `tests/smoke.mjs` and real-browser CDP screenshots of the full
  pin -> jump -> land-on-court's-own-pane flow. Prior suites unmodified.
- Next: Milestone 2 — the actual "Set upon map" deployment (on-map overlay, 3 control buttons,
  drag/resize, hover-highlight of the real district shape, drill-in fixed sub-assembly, pull-out
  animation). Full detail above CURRENT PHASE (search "(bu)").
- Blockers: none.

### 2026-09-03 (bt) — Summary-tab feedback: 4 fixes (labels/sizing, ring tuning, real detach bug, hover scale+blur)
- Phase: 4, continuing (bs). Operator feedback on the Summary tab: (1) tab labels now double
  as the pane heading (Supreme Court | Courts of Appeals | District Courts), removed the
  separate title/subtitle, enlarged the switch further; (2) SCOTUS ring raise 15°→20°, ring
  gap widened ~13.5% via a cleaner 0.5 inner/outer radius ratio; (3) found and fixed a REAL bug
  (not cosmetic) — reopening Summary straight into a persisted non-SCOTUS sub-view was
  detaching the shared docked-detail DOM node from the document, not just mis-positioning it,
  because a wipe inside `renderSummaryContent` didn't rescue it first; (4) district cartogram
  hover now matches the map's own BLOCK_SCALE_HOVER (was a bigger, independently-invented
  1.35x) and the "blur" was the exact CSS-transform-transition-on-SVG-rect bug this codebase
  already root-caused and fixed once for the map's own blocks — ported that same JS-rAF
  technique instead of re-deriving it. Two more sizing/mobile items from operator feedback #4
  are deferred to the District phase itself, per the operator's own suggested ordering.
- Verified via updated `tests/smoke.mjs` (new exact-value ring-gap assertion, a real detach-bug
  regression test) plus real-browser CDP checks (hover scale value/timing, zero CSS transition
  duration) and screenshots. All prior suites pass unmodified.
- Next: the District "lift onto the map" feature itself. Full detail above CURRENT PHASE
  (search "(bt)").
- Blockers: none.

### 2026-09-03 (bs) — Summary tab (SCOTUS ring-split, Appellate stub, District cartogram preview)
- Phase: 4. First session under the new (br) commit/push-every-session protocol. Replaced the
  old lone "Supreme Court" selector entry with a "Summary" destination (SCOTUS | Appellate |
  District sub-tabs, default SCOTUS) — the operator's own redesign after concluding the
  district-block cartogram (built across sessions (bi)-(bq)) was too large to embed directly on
  the main map view as first proposed.
- Moved `district_arrangement_US_shape.json` → `data/district_arrangement.json` (CODEBOOK Table
  F), wired into `build_assets.py`'s manifest with a live-composition drift check (warns, never
  silently recomputes or fails).
- SCOTUS sub-view: reuses the existing Majority-view bench/hover/pin machinery entirely, adds a
  fixed 6-outer/3-inner double-ring layout (`layoutScotusRing`) with the inner ring's endpoints
  raised 15° off horizontal, and 2x icons — Timeline/Change removed entirely for this view. The
  icon scale is RESPONSIVE (targets 2x, shrinks only as far as the stage forces) after a mobile
  screenshot caught 6 outer-ring icons physically overlapping at a naive fixed 2x; desktop is
  screenshot-confirmed pixel-identical to the pre-fix render.
- Appellate: explicit "Coming soon." placeholder per the operator's own instruction.
- District: a static cartogram preview (not the full "lift onto the map" deployment feature,
  which is out of scope this session — see the dated writeup above for why) with working
  hover-grow-together and a tooltip showing LIVE seat_blocks composition, not the frozen export.
- Extended `tests/smoke.mjs` with exact ring-geometry assertions (jsdom's deterministic layout
  fallbacks make this precise, not approximate) plus Appellate/District coverage; all prior
  suites (`browser-checks.mjs`, `stress.mjs`) pass unmodified. Desktop + mobile screenshot-
  verified, including the mobile overlap bug caught and fixed in the same session.
- Next: the District "lift onto the map" mechanic is the natural next large piece. Full detail
  above CURRENT PHASE (search "(bs)").
- Blockers: none.

### 2026-09-01 (br) — linked the repo to GitHub (`digitalgroundgame/court-tracker`, private) +
### auto-commit/push protocol
- Infra, not a Phase-4 task. Operator asked to (1) link this project to a GitHub org repo,
  (2) do the first upload, (3) update the core docs so future sessions push progress to GitHub
  as a matter of course, with progress notes visible there too.
- **`git init`d the repo** (it had never been version-controlled) and pushed the initial commit
  to `origin/main` = `https://github.com/digitalgroundgame/court-tracker` (operator-created,
  private, empty before this session). `gh` wasn't installed and the sandbox has no sudo — installed
  it as a **user-local binary** (`~/.local/bin/gh`, no package manager / root needed); operator ran
  `gh auth login` themselves (device-code browser flow, out of agent reach) as `EmilyCapper`,
  matching the pre-existing global git identity (same account as the commit author) — no
  identity mismatch to reconcile. Push needed `gh auth setup-git` first (no HTTPS credential
  helper was registered yet even though `gh auth status` showed logged-in).
- **What's tracked vs. gitignored** — of ~821MB working-tree size, 87.3MB is tracked. Excluded via
  new `.gitignore`: `data/cache/` (665MB — raw CourtListener/Wikipedia API+HTML cache AND
  `photos_orig/` pre-crop full-res photo downloads; this is pipeline resumability state per
  CLAUDE.md's caching directive, not the served asset — **`assets/photos/` (27MB, the actual
  cropped files the widget fetches) is tracked**, this distinction was double-checked with the
  operator before excluding anything, since their first instinct was that photos = most of the
  size and shouldn't be dropped), `traces/` (32MB DevTools freeze-hunt captures), `node_modules/`
  (26MB, `npm install`-restorable), `data/out/` (1.4MB `qgis_export.py` staging dir, byte-identical
  duplicate of `assets/geo/`), `scripts/__pycache__/`, and `.claude/scheduled_tasks.lock` (ephemeral
  runtime lock, caught only because `git add -A` staged it — `.claude/settings.json`, the actual
  project permission config, IS tracked; `settings.local.json` was already excluded by the
  operator's pre-existing global gitignore). Largest tracked files are legitimate external source
  data, not an oversight: `data/nps/nps_boundary.shp` (40MB) and `data/census/cb_2024_us_county_500k.shp`
  (16MB) — both well under GitHub's 50MB warn / 100MB hard-block thresholds.
- **Fixed a mojibake bug in my own first commit message** before it ever left the machine: a
  heredoc-embedded em dash round-tripped through UTF-8 twice (`—` → `Ã¢â‚¬â€`), caught by hexdumping
  the committed message rather than trusting the terminal's rendering. Amended in place (safe —
  nothing had been pushed yet) using `git commit -F` from a `Write`-created file instead of an
  inline heredoc, which sidesteps shell re-encoding entirely.
- **`CLAUDE.md` updated**: §7 (Working protocol) gained step 6 — commit + push is now part of
  finishing a session, same footing as updating `PROGRESS.md` itself, done without being asked;
  commit summary lines should echo the session-log heading so GitHub's commit history and
  `PROGRESS.md`'s session log read as the same log in two places. The repo map gained inline
  notes on which directories are gitignored (so a fresh clone's missing `data/cache/` doesn't
  read as data loss) and confirmed `assets/photos/` is tracked, not "optional."
- **Interpretation flagged for the operator**: "progress notes also logged on github" is being
  satisfied by GitHub's own commit history (each session's commit message mirrors its
  `PROGRESS.md` entry) rather than a separate GitHub Issues/Discussions log — simpler, and
  avoids a second place these two logs could drift apart. Revisit if the operator wants an
  Issues-based log instead (e.g. for @-mentions, labels, or a per-bug thread GitHub search can
  find independent of `PROGRESS.md`'s prose).
- Next: unchanged substantively — Phase 4's first open checklist item is still the mobile
  ~380px + accessibility pass (line ~1041). One live thing to verify next session: that step 6's
  push-every-session habit is actually being followed (check `git log` vs. session-log entries
  for drift) rather than just documented and then forgotten under token pressure.

### 2026-09-01 (bq) — root-caused the snap float-noise bug, repaired data + fixed the tool
- Phase: 4, same thread. Operator reported ugly near-integer offset values
  (`-16.900000000000002`) in their exported arrangement data and asked for a copy-only repair
  of `temp_district_layout_data.txt` (lines 3747-end) plus investigation. Confirmed the cause:
  `PITCH=8.45` isn't exactly representable in binary floating point, so the (bp) snap
  function's `Math.round(v/PITCH)*PITCH` lands a few ULPs off — verified every offset in the
  operator's file really is an exact PITCH multiple (residuals ~1e-14, the float-epsilon
  signature) and that no other field is affected. Wrote a repaired copy
  (`district_layout_arrangement_repaired.json`) with offsets recomputed and rounded to 2 clean
  decimals, verified byte-identical elsewhere, source file untouched (md5 confirmed). Fixed the
  root cause in the tool: a `cleanCoord()` wrapper on both the snap path and the previously-
  unguarded unsnapped-drag path, plus on import so old noisy exports self-repair.
- Verified: 8 repeated snapped drags stayed exactly clean where the old code would have
  accumulated noise; importing the operator's actual noisy values and re-exporting produced
  exactly the clean equivalents. `tests/smoke.mjs` and all prior suites still green.
- Next: unchanged — map-widget integration; operator still needs to manually adopt the repaired
  file when ready (not done automatically, per the copy-only instruction). Full detail above
  CURRENT PHASE (search "(bq)").
- Blockers: none.

### 2026-09-01 (bp) — Arrangement: import + snap-to-grid with "stutter" drag
- Phase: 4, same thread. Two operator requests: (1) a working Import for arrangement JSON
  (Export existed, but there was no way back in) — treats the pasted export as a full
  replacement of the canvas, not a merge. (2) a toggleable snap-to-grid (unit = `PITCH`, the
  squares' own spacing, applied to absolute offsets so it's pan/zoom-independent) with the
  specific "stutter" drag feel the operator described in detail: position holds still and then
  jumps to the next grid vertex as the cursor crosses its halfway point, and the committed
  offset on release exactly matches whatever was last shown. Implemented as one
  `pointerOffset(e)` helper shared by both the live-drag preview and the final commit — the
  stutter and the "snaps to what it last showed" guarantee both fall out of that single shared
  code path rather than needing separate logic.
- Verified with a full-page-reload export/import round-trip (colors + offsets both restored),
  a snapped drag showing repeated/held transform values across move events plus an exact-
  multiple-of-PITCH final offset, and a second unsnapped drag confirming the toggle actually
  gates the behavior. `tests/smoke.mjs` and all prior suites still green.
- Next: unchanged — map-widget integration. Full detail above CURRENT PHASE (search "(bp)").
- Blockers: none.

### 2026-09-01 (bo) — Sampler: circuit-local projection option, default on
- Phase: 4, same thread. Added a Projection selector (Circuit-local [default] / National) to
  the Sampler, per operator request — circuit-local geometry (`assets/geo/circuits/<cid>.svg`)
  is lazy-fetched per circuit on first use, `getShape`/`shapeFor` gained a `mode` param, shape
  cache keyed by mode+circuit. Verified the two projections are genuinely different geometry
  (same vertex count per the existing morph-invariant guarantee, but different coordinate
  ranges and bbox aspect ratio — 0.577 national vs 0.755 local for ca1 — while area matches to
  within 0.001%, consistent with both being equal-area Albers-family projections). Also fixed a
  related latent bug while in this code: the viewer's shape overlay and "Send to Editor" read
  the live circuit dropdown instead of what actually produced the current samples — introduced
  tracked `activeCircuit`/`activeMode` so flipping a dropdown mid-review can't mismatch anymore.
- Verified via network-request inspection (local mode fetches the circuit file, national mode
  doesn't) plus unclipped-outline and differing-L checks. `tests/smoke.mjs` and all prior
  fix-verification suites still green.
- Next: unchanged — map-widget integration. Full detail above CURRENT PHASE (search "(bo)").
- Blockers: none.

### 2026-08-31 (bn) — Arrangement zoom slider
- Phase: 4, same thread. Added the same zoom slider (1x-5x, default 2x, display-only via svg
  width/height while viewBox stays in true units) to the Arrangement canvas, matching the
  Sampler/Linker sliders from (bk). Had to also fix the drag math: screen-px mouse deltas were
  being applied 1:1 as true-unit offset deltas, which was only correct at the old fixed 1x —
  now divided by the live zoom factor in both the live-drag preview and the committed offset.
- Verified with a specific non-default-zoom drag test: 200 screen-px at 4x zoom produces exactly
  a 50-unit offset change in the exported JSON (the case that would have silently broken
  without the fix). `tests/smoke.mjs` and prior suites still green.
- Next: unchanged — map-widget integration.
- Blockers: none.

### 2026-08-31 (bm) — Sampler target undercounted 4 circuits (roving/lag districts)
- Phase: 4, same thread. Operator asked to verify the Sampler's target represents authorized
  capacity (incl. vacancies), not active-judge count — that framing was already correct
  (`authorized_judgeships` is static), but checking surfaced a real separate bug: the Sampler
  summed raw `authorized_judgeships` while the Linker's real per-district cap uses
  `seat_blocks.json`'s `total = max(authorized, active)`. They diverge for districts where
  actives exceed the base count — both the documented roving judgeships (kyed/kywd/moed/mowd/
  okwd) and `ilnd`'s documented FJC-lag case (`docs/DATA_SOURCES.md`, both already-known, not
  new findings) — undercounting the Sampler's default target for ca6 (61->63), ca7 (47->48),
  ca8 (40->44), ca10 (38->39). Fixed `CIRCUITS`' target calc to sum `seat_blocks[cid].total`,
  matching the Linker's own `capFor()` — one source of truth instead of two sums that could
  drift, same lesson as (bl).
- Verified all 12 circuits' targets against hand-computed sums (4 fixed, 8 unchanged); re-ran
  the (bl) round-trip regression against a fresh inline fixture (operator's temp.txt sample was
  emptied since). `tests/smoke.mjs` still green.
- Next: unchanged — map-widget integration. Full detail above CURRENT PHASE (search "(bm)").
- Blockers: none.

### 2026-08-31 (bl) — district-block-builder: fixed real data loss in export/import
- Phase: 4, same thread. Operator correctly diagnosed a data-loss bug: exporting a linked
  circuit and reloading it lost all district assignments, because the export
  (`circuit-linked@1`) stored derived `cell_colors` but never the actual assignment state
  (click-order number per cell), and no import handler for this schema existed at all — pasting
  one back silently dropped every assignment. Fixed with a new `circuit-linked@2` format
  (`cell_district` + `cell_order`, the only truly irreducible state, plus per-district
  `order1`/`order2`) and a real `loadLinkedIntoLinker()` that reconstructs everything and
  recomputes colors via the same `colorForCell()` the app already uses — never stores a
  resolved color as round-trip input. Old-format pastes now load the matrix with an explicit
  warning instead of silently losing data.
- Verified with a full round-trip test: assign two districts (one plain, one with a reading-
  order override) -> export -> full page reload -> paste import -> overview coloring
  byte-identical, badges and override preserved. Also replayed the operator's actual `temp.txt`
  export through the fixed path. `tests/smoke.mjs` and prior fix-verification suite still green.
- Next: unchanged — map-widget integration. Full detail in the dated block above CURRENT PHASE
  (search "(bl)").
- Blockers: none.

### 2026-08-31 (bk) — district-block-builder: first-usage fixes (clipping, scale, table redesign)
- Phase: 4, same thread as (bi)/(bj), same day — operator started using the tool and reported
  it working extremely well, with 3 concrete fixes. (1) Sampler viewer's shape outline was
  clipped on the left/top (0 margin vs. a full PITCH on right/bottom) — fixed with symmetric
  `VIEWER_MARGIN` on all sides, verified 0/25 samples clipped; added a Zoom slider (default 2x,
  display-only) to both the Sampler viewer and the District linker's grid (blocks were too
  small to click comfortably). (2) Per operator clarification, the Linker's "circuits loaded"
  section is now a real multi-select table (click a row to open it, like district rows) instead
  of a single-slot Edit affordance — removes the overwrite-confirm dialog entirely, moves "Send
  to Arrangement" to a per-row button. Also fixed a real bug: the circuits table's Assigned
  column never re-rendered after the initial load, so it stuck at its starting value through
  every subsequent assignment — centralized all Linker mutations through one `refreshLinker()`
  to close this class of bug. (3) Arrangement gained a removal table (was previously no way to
  take a circuit off the canvas without reloading).
- Verified via a rebuilt scratch CDP harness (the operator-reported crash wiped the previous
  session's scratch files, recreated fresh): zoom defaults, 0 clipped outlines across all ca1
  samples, no confirm() on re-send, live Assigned-column updates, per-row arrangement send, and
  the removal table all pass. `tests/smoke.mjs` still green.
- Next: unchanged — the map-widget integration (reading an Arrangement export into
  `court-tracker.js`) is still the next real step; full detail in the dated block above CURRENT
  PHASE (search "(bk)").
- Blockers: none.

### 2026-08-31 (bj) — district-seat block clusters, stages 3-4 (district linker + arrangement)
- Phase: 4, same new thread as (bi) below, same day. Finished the remaining two stages of
  `tools/district-block-builder.html`: **District linker** (click-to-assign matrix blocks to
  specific district courts, real R/D/vacant composition from `data/seat_blocks.json`, seat-cap
  enforcement, smallest-unused click-order badges, optional two-field reading-order override for
  color sequencing, overview-vs-focused-district rendering rules) and **Arrangement** (drag every
  linked circuit's cluster on one shared canvas, export). All four stages now chain end-to-end.
- Verified via an extended scratch CDP harness (ca1, 5 real districts) — cap enforcement,
  renumbering, exact color-sequence correctness against real seat_blocks.json counts, both
  overview/focused rendering modes, both export schemas, and a real drag updating the exported
  offset all confirmed; the reading-order sort was also unit-tested standalone in plain Node
  against 4 hand-computed orderings. Screenshot-verified the Linker and a 2-circuit Arrangement
  canvas. `tests/smoke.mjs` still green, zero console errors.
- Next: the actual `court-tracker.js`/`build_assets.py` map integration (this tool's export isn't
  consumed by anything live yet) — full detail in the dated block above CURRENT PHASE (search
  "(bj)").
- Blockers: none.

### 2026-08-31 (bi) — new initiative: district-seat block clusters, stages 1-2 (sampler + editor)
- Phase: 4, new thread (not on the existing Phase-4 checklist — this is a new, considerable
  feature, spec'd at length by the operator; see the dated block at the top of this file for full
  design detail, decisions, and next steps). Summary: built `tools/district-block-builder.html`,
  a self-contained tool (no widget dependency) implementing the grid-fitting sampler (randomized-
  jitter search for a square-grid unit length L whose vertex count matches a circuit's district-
  judgeship total, with adaptive coarse-to-bisection L-range refinement per spec) and a freehand
  matrix editor, chained via an in-page "Send to Editor" handoff plus a JSON export/import format
  (`district-block/circuit-matrix@1`) for future stages to consume.
- Verified via a scratch CDP test harness (not committed): full sampler->editor->export flow
  passes for `cadc` (smallest shape) and `ca9` (largest, 112 target, 1518-vertex path, ~1.5s
  full search) with zero console errors; screenshot-verified `ca1`'s resulting block cluster
  visually reads as coastal New England.
- Next: stages 3 (district linker) and 4 (arrangement) plus the `court-tracker.js`/
  `build_assets.py` integration and a seat-block-style repositioning tool for the assembled
  clusters. Full detail + all design-decision rationale in the dated operator-facing block above
  CURRENT PHASE (search "(bi)").
- Blockers: none.

### 2026-08-25 (ba) — photo work: a real Wikipedia-fallback source, blur over-correction fixed twice, initials bug
- Phase: 4. Continuing the operator's data-maintenance sequence (session ay/az): before step 2
  (the appointments refresh), finish photo collection and fix the thumbnail blur, which the
  operator flagged as still too strong even after session (ax)'s adaptive-blur fix.
- **New systematic photo source, `enrich_wikipedia.py`:** of the 365 judges missing `photo_url`,
  diagnosed the breakdown precisely rather than treating it as one blob: 97 have no Wikidata
  item at all (100% are 2023-2026 appointees - a genuine Wikipedia/Wikidata coverage lag, not a
  bug), 263 have a Wikidata item + enwiki article but no `P18` image property, 2 found-but-
  license-rejected, 3 no-FJC-match edge cases. For the 263, checked whether Wikidata's P18 is
  simply unsynced with what the actual Wikipedia article displays (P18 isn't always kept current
  by editors) - confirmed via Wikipedia's own `pageimages` API: 22/263 (~8%) have a real lead
  image Wikidata missed entirely. Added `wikipedia_pageimage_fallback()`, restricted to
  Commons-hosted originals only (a `/wikipedia/en/` local upload is almost always non-free
  fair-use and must never be treated as licensed, CLAUDE.md §2) - the same downstream
  imageinfo/license check applies regardless of source, so this only decides what to check, not
  what's free. All 22 spot-checked visually (Carl E. Stewart, Stephanos Bibas, Cynthia Rufe, …)
  - genuine face photos, not a seal/logo the pageimages heuristic mismatched. Missing-photo count:
  **365 -> 343**.
- **Blur over-correction, round 2 (the operator caught what round 1, session ax, missed):**
  operator reported Eric G. Bruggink's (uscfc) photo as still visibly over-blurred. Investigated
  empirically rather than guessing: a radius sweep on the actual worst real case in the 1,140-
  photo batch (Bruggink, aliasing energy 27, `BLUR_CAP=20.0` -> blur_px=15.65 under the existing
  formula) at the ACTUAL on-screen sizes (34/44/84px, read off `.ctt-avatar`/`.ctt-detail-photo`
  in court-tracker.css, not guessed) showed 14-16px blur destroys facial detail at every size
  while barely suppressing the halftone pattern any further than ~8px already does - the
  original calibration note ("halftone scan energy ~19 wants ~8px") was correct, but
  `BLUR_CAP=20.0` let worse-than-calibration outliers extrapolate straight past it, unchecked.
  Also fixed a real false-positive: Don Willett's (ca5) photo scored high "aliasing energy"
  (25.99, close to Bruggink's real halftone at 27.39) purely from a busy press-badge background
  ("PARTY PASS" text) - restricted `_aliasing_energy()` to the CENTRAL 60% crop (what a viewer
  actually looks at) instead of the full frame; Willett's energy dropped to 18.61 and his photo
  is sharp now. `BLUR_CAP` 20.0 -> 8.0 (the value the original calibration actually verified).
  Added `--force` to `cache_photos.py` (no way to regenerate already-cached thumbnails after a
  formula change existed before this). Re-verified in the REAL widget, not just simulated
  resizes (`tests/shoot.mjs` against `ca5&hover=Willett`): both the 44px timeline icon and the
  84px docked-panel photo are sharp with fully legible background text.
- **Blur over-correction, round 3 (operator caught what round 2 missed, same session):**
  Gregory A. Phillips (ca10) and Paul J. Kelly Jr. (ca10) still looked over-blurred despite
  neither being anywhere near the new 8.0 cap (4.01px and 1.88px respectively) - a DIFFERENT
  root cause: both source images are tiny (255x340 and 144x144px - Kelly's is smaller than the
  200px master, i.e. it was being UPSCALED, not downscaled at all). The entire premise of this
  blur - "a high-res scan's dot-screen will alias when shrunk a lot" - doesn't hold when there's
  no meaningful shrink happening; a small/already-compressed web photo's "energy" reading is
  just inherent softness, and blurring it only subtracts real detail for zero benefit. Fixed by
  gating blur on actual downscale amount: `downscale_factor = clamp((s - MASTER_PX) / MASTER_PX,
  0, 1)`, tapering blur to 0 at or below the master size and full strength at 2x+ the master
  size. Bruggink (712px source, factor=1) unaffected; Phillips/Kelly (factor 0.275 / 0)
  correctly get little-to-none. Visually re-verified all of Bruggink/Willett/Phillips/Kelly
  together after this change - all four look right now.
- **Initials-avatar bug (operator report):** the two-letter fallback avatar took the first
  letter of the LAST whitespace-split token, which for "Paul Joseph Kelly Jr." is "Jr." itself -
  rendered "PJ" instead of "PK". A `surname()` helper already existed nearby for the exact same
  class of bug in a different feature (`"Circ. Justice Jr."` label, fixed earlier) but `initials()`
  never used it. Fixed by routing through `surname()`; confirmed **130 judges** in the current
  data have a generational suffix, so this wasn't a one-off. Verified live (`ca2&hover=Parker`,
  a photo-less judge): renders "BP" (Barrington Parker), not "BJ".
- Verified: `tests/smoke.mjs` all pass throughout every change, `check_geometry.py` PASS/0,
  `build_assets.py` clean. All fixes screenshot/pixel-verified, not just reasoned about.
- Next: individual photo fetching for the remaining ~338 judges with no systematic source
  (operator's ask) - ALL circuit-court judges among them, plus a sample of district-court judges
  to scope that harder case, via subagents scoped one court-level-and-court at a time (never
  mixing circuit and district in one subagent; district subagents stay within a single district).
  Test each subagent TYPE on exactly one judge before batching, per the operator's explicit
  instruction. See the top-of-file dated block once that's underway.
- Blockers: none.

### 2026-08-27 (bh) — batches 4-9 of district subagents (six waves, 35 free photos); FULL 53-COURT SESSION SCOPE NOW COMPLETE; tracked WebSearch usage per-agent, no hangs
- Phase: 4, continuing the photo-completion push (sessions ay→bg). Confirmed scope with the
  operator first per the LIVE TABLE's own protocol: operator picked "first 10 alphabetically"
  from the ~53 remaining courts (akd, almd, alsd, are, azd, cand, ctd, dcd, ded, flnd — 17 judge
  gaps total) and additionally asked that each subagent report its own WebSearch call count so a
  running session total could be tracked against the 200/session cap, to size future batches.
  10 subagents launched via plain Agent-tool spawns (per session bb/bf/bg's "avoid Task tool"
  finding), one court each, research-only (report candidates back, no file writes from them).
- **All 10 finished cleanly this time — no idle-without-reporting hangs** (unlike session bg,
  which hit that failure mode twice). Total session WebSearch usage: **23/200** (per-court: akd 1,
  almd 0, alsd 6, are 3, azd 3, cand 0, ctd 4, dcd 0, ded 2, flnd 4) — leaves ample room (~177)
  for at least one more 10-court wave this session or a future one, confirming the operator's
  estimate-before-launching approach is workable.
- **9 found, 8 confirmed negatives** across the 17 judges: akd (Peterson), almd (Lewis), azd
  (Lanham/Martinez/Desai, all 3), cand (Wise), ctd (Russell), dcd (Ali/Sooknanan, both) were
  found; alsd (Granade, Steele), are (Wright), ctd (Thompson, Underhill), ded (Longobardi), flnd
  (Collier, Hinkle) came back genuine negatives — several cross-checked additionally: flnd's
  agent confirmed via CourtListener's own REST API (`has_photo: false` for both IDs) rather than
  just absence-of-evidence; alsd's agent found one real photo for Granade (Encyclopedia of
  Alabama/Mobile Press-Register, "all rights reserved") and correctly rejected it as non-free
  rather than reporting a false positive.
- **Visual verification (personal, not delegated), same protocol as sessions bb/bg:** downloaded
  all 9 candidate images via curl (one clean pass, no Wikimedia 429s this time), resolved two
  agents' bare filenames (dcd's Ali/Sooknanan) to exact Commons URLs via the Commons API directly
  rather than trusting a reconstructed guess. Tiled into a labeled 3x3 contact sheet and inspected
  directly — all 9 read as clean, correctly-identified, solo portraits (5 confirmed by a visible
  Senate Judiciary Committee hearing nameplate in-frame: Lanham, Desai, Russell, plus Peterson/
  Lewis are unambiguous solo hearing screengrabs). No borderline/rejected cases this batch — Lanham
  had two PD candidates (a 206x222 court-annual-report thumbnail and a sharper 736x661 Senate
  hearing photo); took the higher-resolution one per the agent's own recommendation.
- **Wrote all 9 into `data/judges.csv`** (`photo_url`/`photo_source`/`photo_license`, matched by
  exact `full_name`+`court_id`, asserted no pre-existing `photo_url` before writing). License text
  follows the existing convention exactly (`Public domain (PD-USGov...) — credit: ...` /
  `CC0 1.0 — credit: ...` — Desai's CC0 Senate-hearing photo reused the identical existing phrase
  "CC0 1.0 — credit: U.S. Senate Judiciary Committee" found elsewhere in the CSV rather than
  inventing new wording).
- **Added all 9 to `data/cache/manual_photos.json`** (looked up each judge's stable FJC `nid` from
  `data/cache/fjc_judges.csv` by name — all 9 resolved to an unambiguous single match; registry now
  64 entries) so the next `enrich_wikipedia.py` run won't blank them.
- **Full pipeline re-run, all clean:** `cache_photos.py` → 9 new thumbnails, 0 fetch failures, 0
  thumbnail errors; `build_assets.py` → manifest version bumped (`0396842bc517`), 1490 judges, no
  validation errors; `tests/smoke.mjs` → ALL PASS; `check_geometry.py` → PASS/0 warnings.
- **Result: missing `photo_url` count 273 → 264** (9 added, confirmed by direct count).
- **Wave 2, same session:** WebSearch usage (23/200) left ample room, so per the operator's
  "estimate from the previous round, launch 10 if safely under budget" instruction, continued
  immediately with the next 10 courts alphabetically (gamd, gasd, iasd, ilcd, ilsd, insd, kyed,
  kywd, laed, mad — 15 judge gaps). All 10 subagents finished cleanly, no hangs. **5 found**
  (Olson/insd, Meredith/kyed, Crain/laed, St. John/laed, Murphy/mad — all PD Senate Judiciary
  Committee hearing photos), **10 confirmed negatives** (gamd's Sands/Land/Royal, gasd's Hall,
  iasd's Longstaff/Gritzner, ilcd's Mihm, ilsd's Gilbert, insd's Young, kywd's Simpson III).
  gamd's agent found one candidate (a Mercer University news-site photo of Sands) with no
  explicit license and correctly declined to use it rather than reporting a false positive -
  same discipline as alsd's Granade case in wave 1. Several negatives cross-confirmed via
  CourtListener's own REST API (`has_photo: false`), not just absence of evidence. Wave-2
  WebSearch usage: 22 (gamd 6, gasd 4, iasd 2, ilcd 1, ilsd 2, insd 4, kyed 0, kywd 2, laed 1,
  mad 0) — **session total 45/200**.
  One judge (Brian Edward Murphy) needed a disambiguation check: a loose name-matching pass
  against `fjc_judges.csv` surfaced a second, wrong "Murphy" (Edward Preston Murphy, N.D. Cal.,
  a different person whose middle name "Edward" coincidentally substring-matched) alongside the
  correct nid - resolved by checking each candidate row's actual court against the target
  (D. Mass.) before writing, rather than trusting the first fuzzy hit.
  Same personal-verification discipline as wave 1 and prior sessions: downloaded all 5 candidates
  via curl, tiled into a labeled contact sheet, visually confirmed all 5 as clean, correctly-
  identified solo hearing portraits (Crain's has a visible "Hon. William J. Crain" nameplate;
  Olson's Commons `ObjectName`/`ImageDescription` metadata independently confirmed as "Justin
  Olson" before writing, resolving the researching agent's own borderline flag on that one).
  Wrote all 5 to `judges.csv` (matched by exact `full_name`+`court_id`, asserted no pre-existing
  `photo_url`) and to `manual_photos.json` (now 69 entries). Full pipeline re-run clean:
  `cache_photos.py` (5 new thumbnails, 0 failures), `build_assets.py` (manifest `1f4654425152`,
  1490 judges, no validation errors), `tests/smoke.mjs` ALL PASS, `check_geometry.py` PASS/0.
  **Result: missing `photo_url` count 264 → 259** (5 added).
- **Wave 3, same session:** 45/200 used left ample room, so continued with the next 10 courts
  alphabetically (med, miwd, mnd, moed, mssd, mtd, nced, ndd, nhd, nmd — 21 judge gaps). All 10
  finished cleanly, no hangs. **6 found** (Neumann/med - CC BY-SA 4.0 credited to Brian
  Fitzgerald, VRT-verified permission on Commons; Bluestone/moed, Lanahan/moed, Mercer/mtd,
  Lane/mtd, Davenport/nmd - all PD Senate Judiciary Committee hearing photos), **15 confirmed
  negatives** (miwd's Quist/Jonker/Neff, mnd's Magnuson, moed's Filippine, mssd's Lee/Wingate,
  nced's Flanagan, ndd's Conmy/Hovland, nhd's Barbadoro/McAuliffe/Laplante, nmd's Brack/Herrera).
  Several negatives had a real photo that existed but wasn't freely licensed, and every agent
  correctly declined rather than reporting a false positive: Filippine (moed) has only Commons
  GROUP photos (court en banc photos, an investiture, a reception) with no solo portrait; Lee
  and Wingate (mssd) have real news/alumni photos (Magnolia Tribune, Grinnell College) with no
  license; Flanagan (nced) has a Getty editorial photo; Laplante (nhd) has a UNH law-faculty
  photo marked all-rights-reserved. mssd's agent also flagged the Mississippi Encyclopedia entry
  for Wingate as an unverified lead (its fetch tool truncated the page twice) worth a manual
  look in a future session. Wave-3 WebSearch usage: 34 (med 0, miwd 6, mnd 2, moed 1, mssd 2,
  mtd 2, nced 5, ndd 4, nhd 6, nmd 6) — **session total 79/200**.
  One flagged item investigated and resolved as a false alarm: nhd's agent noted search results
  describing Laplante as chief judge only 2011-2018, with McCafferty as his successor -
  checked `judges.csv` directly and confirmed the data is already correct (Samantha Dowd Elliott
  is nhd's chief judge, `is_chief=true`; Laplante's row correctly reads `is_chief=false`) - the
  inaccuracy was in this session's own subagent prompt text ("chief judge of this court" was
  wrongly asserted for Laplante when briefing the agent), not in the dataset. No data fix needed.
  Same personal-verification discipline as waves 1-2: downloaded all 6 candidates via curl,
  tiled into a labeled contact sheet, visually confirmed all 6 as clean, correctly-identified
  solo portraits (Davenport's crop shows a visible "Sarah Morgan" nameplate). Wrote all 6 to
  `judges.csv` and `manual_photos.json` (now 75 entries). Full pipeline re-run clean:
  `cache_photos.py` (6 new thumbnails, 0 failures), `build_assets.py` (manifest `b9d7aca26698`,
  1490 judges, no validation errors), `tests/smoke.mjs` ALL PASS, `check_geometry.py` PASS/0.
  **Result: missing `photo_url` count 259 → 253** (6 added).
- **Session total across first three waves: 20 found, 33 confirmed negatives, 30 courts cleared,
  missing-photo count 273 → 253.**
- **Wave 4, same session:** 79/200 used left ample room, so continued with the next 10 courts
  alphabetically (nywd, oked, oknd, okwd, pamd, scd, sdd, tned, tnmd, tnwd — 24 judge gaps). All
  10 finished cleanly, no hangs. **6 found** (Hill/oknd, Russell/oknd, Saporito/pamd — CC0,
  Neary/pamd, Clarke/scd, Lea/tnwd — all PD Senate Judiciary Committee hearing photos), **18
  confirmed negatives** (oked's White, oknd's Kern/Frizzell, okwd's Russell/Heaton/DeGiusti,
  pamd's Kane, scd's Norton/Herlong/Harwell, sdd's Kornmann, tned's Varlan/Greer, tnmd's Trauger,
  tnwd's Mays). Same correct-rejection discipline as prior waves: tned's agent found a real PD-
  tagged Commons file for Greer but it's a multi-page confirmation-hearing PDF scan, not a
  portrait, and separately found news of a painted courtroom portrait unveiling for the same
  judge — painted portraits aren't government work-for-hire and aren't photos anyway, so neither
  was reported as found.
  **One court's results deliberately NOT accepted despite real candidates: nywd.** Its agent found
  genuine photos of all 3 judges (Larimer, Skretny, Siragusa) hosted on the Second Circuit
  Library's own "WDNY 125th Anniversary" history site (library.ca2.uscourts.gov) — plausibly PD as
  federal-judiciary work product, but the site carries no explicit license/rights statement
  anywhere, and Siragusa's copy is only 229×229px regardless. Per CLAUDE.md §2 ("if reuse terms
  are unclear, leave photo_url null"), left all 3 null rather than inferring a license — flagged
  as a lead for a future session to chase down explicit confirmation (e.g. contacting the 2nd
  Circuit Library or WDNY clerk's office) before ever using these.
  One flagged item checked and resolved as fine: pamd's agent flagged Neary's Commons file page
  as showing a slight own-work/USGov tag ambiguity — fetched the raw extmetadata directly and
  confirmed `LicenseShortName: Public domain`, category `PD US Congress` — clean, no issue.
  Wave-4 WebSearch usage: 47 (nywd 8, oked 3, oknd 4, okwd 6, pamd 6, scd 5, sdd 3, tned 4, tnmd 4,
  tnwd 4) — **session total 126/200**.
  Same personal-verification discipline as prior waves: downloaded all 6 accepted candidates via
  curl, tiled into a labeled contact sheet, visually confirmed all 6 as clean, correctly-
  identified solo hearing portraits (Hill, Russell, Saporito, Neary all show visible name
  placards). Wrote all 6 to `judges.csv` and `manual_photos.json` (now 81 entries) — caught a
  loose-match false lead the same way as the Murphy case earlier this session: a fuzzy first/
  last-name scan against `fjc_judges.csv` for "John David Russell" also surfaced an unrelated
  okwd judge (David Lynn Russell, already a confirmed negative earlier this same wave) because
  "David" and "Russell" both substring-matched — resolved by checking each candidate's first
  name against the full target name before writing, same discipline as before. Full pipeline
  re-run clean: `cache_photos.py` (6 new thumbnails, 0 failures), `build_assets.py` (manifest
  `742bc627caab`, 1490 judges, no validation errors), `tests/smoke.mjs` ALL PASS,
  `check_geometry.py` PASS/0.
  **Result: missing `photo_url` count 253 → 247** (6 added).
- **Session total across first four waves: 26 found, 51 confirmed negatives (incl. nywd's 3
  deliberately-unaccepted real candidates), 40 courts cleared, missing-photo count 273 → 247.**
- **Wave 5, scheduled for a specific later time at the operator's request.** After wave 4 the
  operator asked to be able to name a specific clock time for wave 5 rather than launching
  immediately. The `schedule` skill's cloud-routine mechanism was the wrong tool for this — this
  repo isn't a git repo, and a cloud routine runs in total isolation with no access to local
  files (this session's `data/judges.csv`, `manual_photos.json`, etc. all live only on disk here)
  — so used `CronCreate` instead, a session-only one-shot timer that re-enters THIS conversation
  at a wall-clock time (`30 22 27 8 *`, one-shot, fired 2026-08-27 22:30 PDT) with a self-contained
  prompt naming the exact 10 courts and the full verify-then-write protocol. Confirmed to the
  operator this only works if the session/window stays open until fire time (session-only, not
  persisted). It fired correctly and wave 5 ran exactly as scripted.
  Courts: txed, txwd, uscfc, utd, vawd, vid, waed, wawd, wied, wiwd (24 judge gaps — the next 10
  of the ~13 remaining after wave 4). All 10 finished cleanly, no hangs. **8 found** (Gonzalez/
  txwd, Davis/txwd, Tapp/uscfc — CC BY-SA 4.0, Dietz/uscfc, Yoon/vawd, Rikhye/vid, Pennell/waed —
  CC0, Conway/wied — all PD Senate Judiciary Committee hearing photos except as noted), **16
  confirmed negatives** (txed's Schell/Clark/Crone, txwd's Briones/Moses, utd's Sam/Campbell/
  Stewart/Waddoups, vawd's Moon, waed's Nielsen, wawd's Zilly, wied's Stadtmueller/Griesbach,
  wiwd's Crabb), plus wawd's Coughenour — a real CC-BY-SA Commons photo, but of a 3-person meeting
  (Pickett, Coughenour, Vathana), not a solo portrait, correctly not accepted.
  **vid's find is notable**: confirms Virgin Islands territorial judgeships DO go through Senate
  confirmation (a Judiciary Committee hearing photo exists for Rikhye), useful context for any
  future territorial-court UX work.
  Two candidates got extra personal scrutiny before being accepted, both resolved fine: uscfc's
  Dietz photo is a face crop from a Judicial Conference GROUP photo (flagged by its researching
  agent) — read the actual file directly (not just the contact-sheet thumbnail) and confirmed a
  clean, sharp, single-subject crop with no other face in frame, comparable in quality to other
  accepted photos in this dataset despite modest native resolution (184×224). wied's Conway photo
  is a hearing screengrab with blurred bystanders in the background — confirmed he's the sole
  in-focus, centered, nameplate-labeled subject (a normal hearing-room shot, not a multi-subject
  group photo), same as every other accepted Senate-hearing photo this session.
  Two of the 8 found judges (Tapp, Dietz — uscfc) and one (Rikhye — vid) have no FJC `nid`: CFC
  and territorial judges are a known, already-documented gap in the FJC bulk directory (see the
  2026-07-16 DATA_SOURCES entry). `manual_photos.json`'s registry already has a documented
  fallback for exactly this case — matched by `(full_name, court_id)` instead of `nid` — so all
  three were added using that fallback rather than skipped or forced through a wrong nid.
  Also re-confirmed a loose-name-match trap the same way as sessions earlier this pass: a fuzzy
  `fjc_judges.csv` scan for "Andrew Bray Davis" also surfaced an unrelated "Andre Maurice Davis"
  because "Andre" is a literal prefix of "Andrew" — resolved by checking the full name string
  before writing, not the first loose hit.
  Wave-5 WebSearch usage: 40 (txed 4, txwd 4, uscfc 2, utd 6, vawd 1, vid 0, waed 6, wawd 6,
  wied 5, wiwd 6) — **session total 166/200**.
  Same personal-verification discipline as all prior waves: downloaded all 8 candidates via curl,
  tiled into a labeled contact sheet, visually confirmed all 8. Wrote all 8 to `judges.csv` and
  `manual_photos.json` (now 89 entries). Full pipeline re-run clean: `cache_photos.py` (8 new
  thumbnails, 0 failures), `build_assets.py` (manifest `14beb651fb68`, 1490 judges, no validation
  errors), `tests/smoke.mjs` ALL PASS, `check_geometry.py` PASS/0.
  **Result: missing `photo_url` count 247 → 239** (8 added).
- **Session total across first five waves: 34 found, 67 confirmed negatives (incl. nywd's 3 and
  wawd's Coughenour, all deliberately-unaccepted real candidates), 50 courts cleared,
  missing-photo count 273 → 239.**
- **Wave 6 (final wave), same session — closes out the full 53-court scope.** Only 3 courts
  remained: wvnd, wvsd, wyd (6 judge gaps). All 3 finished cleanly, no hangs. **1 found**
  (Rankin/wyd — PD Senate Judiciary Committee hearing photo, clean solo shot with a visible
  "Hon. Kelly Harrison Rankin" nameplate), **5 confirmed negatives** (wvnd's Stamp — real
  copyrighted 2022 courthouse-renaming news photos exist but none freely licensed; wvsd's
  Faber/Goodwin/Johnston — court's own site has no judge photos sitewide, only the seal graphic,
  confirmed via raw-HTML checks; wyd's Johnson — only a paywalled magazine profile photo exists).
  wvsd's agent flagged one unconfirmed lead (a WV Supreme Court ceremony photo of Faber credited
  to "J. Alex Wilson / WV Supreme Court") it could not locate a direct URL for — noted as an
  unresolved lead, not used.
  Same false-alarm chief-judge pattern as nhd earlier this session: this wave's own briefing text
  called Johnston "chief judge" of wvsd (stale), but `judges.csv` already correctly lists Frank
  William Volk as chief (`is_chief=true`) — checked directly, no data fix needed, error was only
  in this session's own subagent prompts, not the dataset.
  Wave-6 WebSearch usage: 12 (wvnd 5, wvsd 5, wyd 2) — **session total 178/200**.
  Personally verified Rankin's photo (downloaded, inspected directly — clean, sharp, nameplate-
  confirmed), wrote it to `judges.csv` and `manual_photos.json` (now 90 entries). Full pipeline
  re-run clean: `cache_photos.py` (1 new thumbnail, 0 failures), `build_assets.py` (manifest
  `94958e7143d9`, 1490 judges, no validation errors), `tests/smoke.mjs` ALL PASS,
  `check_geometry.py` PASS/0.
  **Result: missing `photo_url` count 239 → 238** (1 added).
- **FULL SESSION TOTALS, all six waves: 35 found, 72 confirmed negatives (incl. nywd's 3 and
  wawd's Coughenour, deliberately-unaccepted real candidates), all 53 originally-confirmed
  courts (from the (bb)-session count) now attempted, missing-photo count 273 → 238.** Total
  session WebSearch usage: 178/200 (main session made 0 direct WebSearch calls itself — all
  usage came from the 53 research subagents).
  **This closes out this pass of the photo-completion push.** If picked up again in a future
  session, start with a fresh scope conversation with the operator rather than assuming more
  courts remain — re-check for any newly-appeared gaps (a fresh `collect_courtlistener.py`/
  `enrich_wikipedia.py` sweep could surface new judges or close some existing gaps on its own),
  and/or revisit the flagged unresolved leads noted across this session's log entries: nysd's
  Buchwald (real PD photo, too low-res), mssd's Mississippi Encyclopedia lead for Wingate (fetch
  tool truncated the page), nywd's WDNY-125 court-history-site photos for Larimer/Skretny/
  Siragusa (plausibly PD, no explicit license statement), wvsd's Faber WV-Supreme-Court lead (URL
  not located).
  **Update 2026-08-28: all five of these were manually reviewed the very next session — see that
  day's log entry immediately below. Only two remain genuinely open (Buchwald, Faber), both by
  explicit operator decision, not because they're unresolved.**

### 2026-08-28 — manual review of every set-aside photo lead from session (bh); operator made the call on each
- Phase: 4. Operator asked to walk through every photo that got set aside (found-but-not-used)
  during the previous session's six-wave push, to decide case by case whether to use it. This is
  a genuine judgment-call review, not more automated research — the operator wanted to see the
  actual images before deciding.
- **Ran down all five flagged leads personally** (curl + direct visual inspection, not delegated
  to a subagent, since there were only 5 items and each needed a specific judgment call):
  1. **mssd's Mississippi Encyclopedia lead for Wingate — DEAD END, not a real lead.** Fetched
     the actual page directly (the previous session's fetch tool had truncated it twice and never
     confirmed either way): the page has exactly 5 `<img>` tags, all site/sponsor logos, zero
     photos of Wingate or anyone else. The "lead" was an unconfirmed guess that didn't pan out.
  2. **wawd's Coughenour lead — DEAD END, worse than previously known.** The prior session
     already knew this was a crop from a 3-person Commons photo (Pickett, Coughenour, Vathana)
     and set it aside as a group-photo problem. Pulling the actual "(cropped)" derivative file
     and comparing it against the full original revealed something worse: **the crop shows the
     WRONG person** — it's Ang Vong Vathana (the Cambodian Minister of Justice, centered in the
     original), not Coughenour (leftmost, cream suit) at all. Not a borderline call; this file is
     simply mislabeled on Commons and was never usable regardless of the group-photo question.
  3. **nysd's Buchwald** (150×164px, real PD Commons photo) — downloaded and displayed to the
     operator alongside the others. **Operator decision: leave null**, consistent with this
     project's established practice on marginal resolution (matches the session-bg precedent for
     the exact same photo).
  4. **nywd's Larimer/Skretny/Siragusa** (2nd Circuit Library's official "WDNY-125" history site,
     no page-level license statement) — downloaded all 3 and displayed them; resolutions turned
     out to vary widely (Larimer 1134×1134, Skretny 2700×2700, both excellent; Siragusa only
     229×229 but still a clear, usable portrait). **Operator decision: use all 3, treating the
     site as PD-USGov by reasonable inference** (it's the federal judiciary's own official
     history project, not a third party) rather than requiring a page-level license tag. Written
     to `judges.csv` with `photo_license` reading "Public domain (PD-USGov) — credit: 2nd Circuit
     Library, WDNY 125th Anniversary project" and the inference basis recorded in each row's
     `notes` field (rather than hedging the raw license string itself, since `photo_license` is
     rendered directly to end users) so a future verifier can see exactly why this doesn't carry
     an automated Commons-style PD tag. All 3 resolved unambiguous FJC `nid`s and were added to
     `manual_photos.json` (now 93 entries).
  5. **wvsd's Faber** (real press photo, swearing-in ceremony, clearly identifiable, but licensed
     CC BY-ND 4.0 via Mountain State Spotlight's republishing terms — confirmed by fetching the
     site's own republishing-policy text directly) — downloaded and displayed. **Operator
     decision: leave null**, consistent with this same session's precedent of excluding NC/ND
     licenses (the Coughenour case, before it was found to be mislabeled anyway) since the
     pipeline's thumbnail-resizing step is arguably exactly what "No Derivatives" forbids.
- **Sent all 6 review images directly to the operator** (the 5 candidates plus the full 3-person
  Coughenour original, so the misidentification was visible, not just asserted) before asking for
  decisions, since the operator couldn't make an informed call from text descriptions alone.
- Implemented only the one decision that changed anything (nywd's 3 photos); Buchwald and Faber
  needed no file changes since "leave null" is the pre-existing state. Full pipeline re-run
  clean: `cache_photos.py` (3 new thumbnails, 0 failures), `build_assets.py` (manifest
  `a74234fe0362`, 1490 judges, no validation errors), `tests/smoke.mjs` ALL PASS,
  `check_geometry.py` PASS/0.
- **Result: missing `photo_url` count 238 → 235** (3 added). **Grand total across sessions
  ay→this one: 273 → 235.**
- No blockers. This fully closes out every lead flagged during the six-wave push — nothing left
  dangling for a future session to re-check, apart from ordinary new-appointee gaps that will
  naturally appear over time.

### 2026-08-27 (bg) — batch 3 of district subagents (nysd redo + 9 more courts, 16 free photos); confirmed the idle-without-reporting failure mode is recurring, not a one-off
- Phase: 4, continuing the photo-completion push (sessions ay→bf). Confirmed scope with the
  operator first per the LIVE TABLE's own protocol: nysd (redo — the prior session's agent hung
  44+ min with zero output) plus the 9 largest remaining photo-gap courts by judge count (txnd,
  ksd, msnd, ncmd, ncwd, arw, cod, innd, mied) — 10 subagents total, one court each, never mixed,
  research-only (report candidates back, no file writes from them — same as sessions bb/bd/bf).
- **nysd redo was clean this time** — no hang, full report, 13/13 judges checked. Result: 1 found
  (Jeannette Anne Vargas) + 11 confirmed negatives + 1 genuine borderline: Naomi Reice Buchwald
  has a real PD-licensed Commons file (1999 Senate Judiciary hearing photo) but at only 150×164px
  — visually confirmed it reads as blurry/illegible once tiled into the verification contact
  sheet at normal size, so left `photo_url` null rather than ship a photo too low-res to be
  useful, consistent with this project's past pattern of not forcing in marginal cases (session
  bb's 3 PDF-sourced cases). Documented as a known future-source gap, not silently dropped.
- **Recurring failure mode confirmed, not a one-off:** TWO of the 10 subagents this session
  (ncwd, innd) went idle without ever sending a findings report — the exact same pattern session
  (bb) hit once and flagged as "prefer plain Agent-tool spawns... noted for future sessions."
  Followed up directly via SendMessage asking each to report what it had; both responded
  immediately with complete, high-quality results on the follow-up — so the work wasn't lost,
  but relying on the first "idle" signal as "done, nothing found" would have silently dropped 4
  real candidate photos (Rodriguez, Orso, Simon, Lund) and misreported 2 courts' negatives as
  more thorough than they were. **Take-away for future sessions: an idle notification with no
  preceding findings message is NOT evidence the agent finished cleanly — always send one
  follow-up prompt before accepting a court as done.**
- **Visual verification (personal, not delegated), same protocol as session bb:** downloaded all
  17 candidate images (16 clean + the Buchwald borderline) via curl. Hit Wikimedia's actual rate
  limit mid-batch (HTTP 429, "Your bot is making too many requests") on 6 of the 17 — diagnosed
  directly by inspecting the corrupted files' contents (they were Wikimedia's HTML error page,
  not a bad URL), not assumed; fixed by retrying just those 6 with an 8s delay between requests
  and a descriptive User-Agent. Tiled all 17 into a labeled contact sheet, inspected directly —
  16 read as clean, correctly-identified, single-person photos (7 confirmed by a visible Senate
  Judiciary Committee hearing nameplate in-frame: Vargas, Bragdon, Freeman, Rodriguez, Orso,
  Lund, White); Buchwald visibly low-res/blurry at this size, confirming the borderline call.
- **Wrote all 16 into `data/judges.csv`** (`photo_url`/`photo_source`/`photo_license`, matched by
  exact `full_name`+`court_id`, asserted no pre-existing `photo_url` before overwriting). License
  text follows the existing `<license> — credit: <author>` convention found in the CSV (e.g.
  reused the exact existing phrase "CC BY-SA 4.0 — credit: U.S. Senate Judiciary Committee" for
  Lund's non-PD case rather than inventing new wording).
- **Added all 16 to `data/cache/manual_photos.json`** (looked up each judge's stable FJC `nid`
  from `data/cache/fjc_judges.csv` by name — all 16 resolved to an unambiguous single match)
  so the next `enrich_wikipedia.py` run won't blank them per the session (be)/(bd) fix.
- **Full pipeline re-run, all clean:** `cache_photos.py` → 16 new thumbnails made, 0 fetch
  failures, 0 thumbnail errors; `build_assets.py` → manifest version bumped, 1490 judges, no
  validation errors; `tests/smoke.mjs` → ALL PASS; `check_geometry.py` → PASS/0 warnings.
- **Result: missing `photo_url` count 289 → 273** (16 added, confirmed by direct count, not
  estimated).
- Next: ~54 district courts with photo gaps remain unresearched (see LIVE TABLE above for the
  exact list — everything not yet in a table row). No blockers.

### 2026-08-27 (bf) — departed-judge photo preservation generalized past SCOTUS; batch 2 of district subagents (10 courts); a hard session-wide WebSearch cap found
- Phase: 4. Operator clarified two things after reviewing session (be): (1) they DO want a
  departed judge's photo preserved for the timeline's docked detail panel, for every court, not
  just SCOTUS - "not visible by default" isn't a good enough reason to accept the gap. (2) before
  re-running any failed subagent searches, see what plain WebFetch (no new subagents) can still
  find, since a future re-run will need to happen as fresh, separate sessions anyway.
- **Generalized `collect_appointments.py`'s departed-photo preservation.** Renamed
  `old_scotus_photos_by_jid` -> `old_photos_by_jid` and dropped its `court_id == "scotus"` guard
  - it now carries forward ANY departed judge's existing photo by `fjc_jid`, not just former
  justices. Verified with a direct simulated-departure test (removed a real judge with a known
  photo entirely from `judges.csv`, re-ran `collect_courtlistener.py`, confirmed the photo
  survived in `appointments.csv` via the jid fallback where it would previously have been
  blanked), then restored the test files. Former SCOTUS justices keep their own dedicated
  first-time lookup (`enrich_scotus_photos.py`) since no equivalent "find a photo for someone
  who just left" script exists for other courts - this fix only PRESERVES a photo a departed
  judge already had, it doesn't go looking for a new one after they're gone.
- **Real, hard constraint found: WebSearch is capped at 200 calls per SESSION, shared across the
  main session and every subagent spawned within it, not per-agent.** Confirmed directly (a
  WebSearch call from the main session itself returned "budget used: 200 of 200"). This explains
  a pattern across the whole 10-agent batch launched this session: agents at the front of the
  queue (alnd first) still had headroom; by partway through nearly every remaining agent reported
  the quota already at zero and fell back to WebFetch-only. Despite that, results stayed
  meaningfully positive throughout (WebFetch alone finds real photos via Wikipedia body scans,
  Commons MediaSearch, and known agency/committee URL patterns) - the quota mainly cost
  *thoroughness* on genuine dead ends (fewer alternate search strategies tried), not the ability
  to find real hits agents did stumble onto. Operator's plan (separate fresh sessions per future
  batch, each restarting from CLAUDE.md/PROGRESS.md) is the right fix, since each new session
  gets its own 200-call allowance. Checked whether the MAIN session has any workaround the
  subagents lacked: Wayback Machine is blocked by the environment itself, not per-agent
  (confirmed via a direct fetch attempt from the main session, same "unable to fetch from
  web.archive.org" error every subagent hit) - not a path around the constraint either way.
- **Batch 2: 10 more district courts researched** (nysd, flmd, cit, ilnd, njd, alnd, nynd, vaed,
  lawd, nyed - the next 10 highest-count remaining courts). **11 clean, verified photos added**
  (Mooty + LaCour/alnd, Sneed/flmd, Wang + Laroski/cit, Guzman + Perry/ilnd, Kiel/njd, Brindisi +
  Coombe/nynd, Van Hook/lawd) - all downloaded and visually tiled/inspected before writing,
  same discipline as batch 1. Caught and fixed two agent-reported URL problems before trusting
  them: Brindisi's Commons filename ("Brindski" in one encoded URL vs "Brindisi" on the actual
  page) was re-verified against the Commons API directly rather than the agent's string (API
  confirms "Brindisi" is correct - the agent's own URL had a typo, not Commons). All 11 written
  to `judges.csv` AND added to `manual_photos.json` (all 11 resolved a stable `nid` on the first
  try). 3 more real, licensed candidates were found but set aside as before (Restani/cit, an
  8-person Judicial Conference group photo; Seybert/nyed, a 2-person photo with another chief
  judge; Kovachevich/flmd, a 1971 crowd/protest photo where she isn't identifiably visible at
  all - correctly flagged by the agent as not a usable portrait despite carrying a real PD
  license). vaed (Brinkema and 6 others) came back a clean 0-for-7 despite real effort - spot-
  checked two of the highest-profile "not found" names myself afterward (Brinkema directly;
  Bumb, njd's current Chief Judge) via targeted WebFetch and independently reproduced the same
  negative result, confirming these are genuine dead ends under current tool access, not just
  quota-starved guesses.
- Verified: `cache_photos.py` (11 new thumbnails, 0 failures), `collect_appointments.py` ->
  `enrich_scotus_photos.py` (0 needed) -> `build_assets.py` clean, `tests/smoke.mjs` all pass,
  `check_geometry.py` PASS/0.
- **Missing-photo count: 300 -> 289/1490.**
- **nysd (S.D.N.Y., 13-judge batch) subagent hung and was killed, incomplete.** Every other
  agent in this batch finished in 2-7 minutes; nysd ran 44+ minutes with no result and showed no
  sign of progressing - operator confirmed it looked frozen and approved killing it. No partial
  report was recoverable (`local_agent` tasks don't expose partial output before their own final
  message). **nysd's 13 judges are therefore fully UNRESEARCHED, not "researched and found
  nothing"** - treat it as never attempted, not as a batch-2 court, when picking the next batch.
- **Full per-court status now tracked in the LIVE coverage ledger near the top of this file**
  (search "LIVE TABLE"), not duplicated here - operator asked for this to be a single
  always-current table rather than scattered across dated entries, specifically because the
  200-call/session WebSearch cap means this work spans many separate future sessions and each
  one needs to update the SAME table before stopping, not just narrate its own session. See that
  table for exact per-court WebSearch-availability and result status, and the "when you pick
  this up" instructions immediately below it.
- `manual_photos.json` now has 39 entries.
- Blockers: none for the finished work; nysd needs a clean re-run (see live ledger).

### 2026-08-27 (be) — manual_photos.json wasn't reappointment-proof; neither was collect_courtlistener.py's own carry-forward fix; both keyed on stable FJC ids now
- Phase: 4. Operator, reviewing session (bd)'s `manual_photos.json` registry, asked three
  pointed questions before accepting it: (1) does it survive a judge's court_id changing on
  reappointment/elevation, and if not, might the SAME gap exist in "other parallel subsystems"?
  (2) any special handling needed for the appointments-timeline widget once a judge leaves a
  court, given we now keep photos across that? (3) track when a manual photo was added, at
  least. Also asked for a canonical order-of-operations for a truly full data refresh, and (mid-
  turn) to confirm the nid/jid choices below aren't a new, inconsistent identifier scheme.
- **(1) Real gap, confirmed by direct testing, and yes - it existed in `collect_courtlistener.py`
  too.** `manual_photos.json` matched on `(full_name, court_id)`; a reappointment changes
  court_id, so the match (and the protection) would silently break the moment any of the 28
  registered judges got reassigned. Checked `collect_courtlistener.py`'s session-(az)
  photo-preservation fix on the same question - same design, same gap: it also matched
  `existing` rows by `(full_name, court_id)`. **Fix used FJC's own stable per-person identifiers,
  not a new invention:** `jid` in `collect_courtlistener.py` (added `fjc_jid_index()`, an
  analogue of `enrich_wikipedia.py`'s `fjc_nid_index()` - both walk every "Commission Date (N)"
  block in the FJC bulk CSV, which is how FJC's OWN data already tracks a person's full career -
  district-to-circuit elevation and all - under one row/one id) so `old = existing_by_jid.get(...)
  or existing.get((full_name, court_id))` tries the stable id first; `nid` in
  `enrich_wikipedia.py`'s registry (each `manual_photos.json` entry now stores `nid`, matched via
  the already-loaded `nid_of` index, falling back to `(full_name, court_id)` only when no nid
  resolves - none of the current 28 need the fallback). **Verified by actually simulating a
  reappointment**, not just reasoning about it: forced a real judge's `court_id` to a wrong value
  in one script's "before" state and confirmed the OTHER script's fresh computation still
  correctly reunited the photo via jid/nid despite the mismatch, for both scripts independently;
  reverted both test edits afterward.
- **Confirmed nid/jid usage is NOT a new convention** (operator asked mid-fix): grepped the
  existing codebase and PROGRESS.md and found the same split already established - `jid` is used
  wherever CourtListener/appointments-side linking already lives (`collect_courtlistener.py`'s
  own module docstring: "joined by FJC `jid` == CL `fjc_id`"; `appointments.csv` already
  persists a `fjc_jid` column; `appointments-chart.js` already documents "Person key for
  group-hover: `fjc_jid` when present, else normalized full_name"), `nid` wherever Wikidata
  linking already lives (`enrich_wikipedia.py`'s docstring: "P12000 ... == FJC `nid`").
  `enrich_scotus_photos.py` already bridges the two (`jid_to_nid[r["jid"]] = r["nid"]`) for
  exactly the same reason - two different FJC-internal id columns on the same bulk-CSV row,
  used in whichever namespace a given script already operates in. This fix extends that
  existing, documented pattern rather than adding a third concept.
- **(2) Timeline/beeswarm photo delivery across a reappointment was ALREADY correct - no fix
  needed, verified rather than assumed.** `collect_appointments.py`'s `load_affiliations()` keys
  its photo lookup by full_name ALONE (not court_id) specifically so "a sitting judge's photo
  also reaches their EARLIER appointment rows" (its own existing comment, predating this
  session) - already reappointment-proof for a still-sitting judge, confirmed empirically in
  session (az) when 6 already-sitting justices' EARLIER circuit rows picked up their photo this
  exact way. **Separate, real, and NOT fixed (operator's "fine to leave it" case applies):** once
  a judge fully departs the judiciary (dies/resigns, drops out of `judges.csv` entirely, as
  opposed to being reappointed within it), only SCOTUS has a dedicated departed-justice photo
  preservation path (`enrich_scotus_photos.py`'s `old_scotus_photos_by_jid`, scoped explicitly
  to `court_id == "scotus"`). A circuit/district judge's photo will disappear from their
  historical `appointments.csv` row on the next `collect_appointments.py` regen after they fully
  leave - but since "only SCOTUS dots draw photos in the swarm itself" is already the widget's
  by-design behavior, this only affects that one judge's docked detail panel, never the swarm's
  visible dots. Left as-is per the operator's own framing; would need a general (non-SCOTUS)
  version of the SCOTUS mechanism if ever wanted.
- **(3) `date_added` added to every `manual_photos.json` entry** (all 28 backdated to
  2026-08-25, when they were actually curated).
- **Canonical full-refresh order of operations** (compiled from every fix/finding this project
  has made about run order - see also the top-of-file "NEXT SESSION" block, now the reference
  copy):
  1. `collect_courtlistener.py` [net] - judges.csv from FJC bulk CSV + CL bulk people table +
     uscfc/territorial sources. For a TRULY fresh pull, re-download FJC's bulk CSV and CL's bulk
     people export first (`data/cache/fjc_judges.csv`, `data/cache/cl_people.csv`) - this script
     reads those as local cache, so re-running it alone just re-derives from the same snapshot.
  2. `enrich_wikipedia.py` [net] - photo/fedsoc/acs for judges.csv. Delete
     `data/cache/wiki/wd_fjc.json` first for a genuinely fresh Wikidata pull (it's read
     unconditionally from cache if present, regardless of `--no-net` - the exact staleness gap
     found session (bb)/(bd)). Preserves `manual_photos.json` entries automatically.
  3. `collect_appointments.py` [net or `--no-net`] - appointments.csv, sourced from FJC bulk +
     judges.csv's current photos (name-keyed, reappointment-safe already).
  4. `enrich_scotus_photos.py` [net] - former-SCOTUS-justice photos in appointments.csv.
  5. `collect_president_photos.py` [net] - president_photos.csv; rarely needed (only a new
     administration changes this).
  6. `cache_photos.py` [net for new URLs only; `--force` ONLY when the blur/crop formula itself
     changed, never for a routine data refresh] - bakes local thumbnails for every photo_url
     across all 4 CSVs.
  7. `build_assets.py` [no net] - derives every runtime JSON bundle + manifest.json version hash.
  8. `tests/smoke.mjs` + `check_geometry.py` [no net] - verification gate.
     `circuit_justices.csv` is hand-maintained (its judge/date content, not auto-derived); step
     2's own "5/5 circuit justices" sub-step refreshes its photos automatically, no separate
     collection script exists for it.
- Verified: re-ran the full `build_assets.py` + `tests/smoke.mjs` + `check_geometry.py` gate
  after all of the above - manifest hash unchanged from before this session's edits (true
  no-op), all pass.
- Next: operator has approved proceeding with subagent district-court batches (<=10 per batch,
  confirm between batches). Missing-photo count stands at 300/1490.
- Blockers: none.

### 2026-08-27 (bd) — enrich_wikipedia.py was silently erasing manually-curated photos; name-based Wikidata bridge generalized (+16 free photos)
- Phase: 4. Operator wanted to know, before authorizing more subagent photo batches: does a
  Wikidata cache refresh actually account for what the subagents are finding (i.e. is the manual
  work redundant with a cheap automated pass)? And separately asked for the name-based search
  fallback (flagged as future work in session bb) to be built now, before more subagents run.
- **Re-verified the cache-refresh question with a clean, current test - and caught a real
  incident doing it.** Deleted `data/cache/wiki/wd_fjc.json` and re-ran `enrich_wikipedia.py`
  live. This confirmed the answer (0 of the 27 session-bb photos would ever be found by a
  refresh - same conclusion as before, now double-verified) but ALSO revealed that
  `enrich_wikipedia.py`'s "recompute photo fields from scratch every run" behavior - previously
  audited and declared safe (session az) because it only owns fields it computes - is NOT safe
  now that manual/subagent research has started adding photos through OTHER channels. The run
  silently wiped all 27 photos (316 -> 343 missing). Restored from a pre-run backup immediately.
- **Root cause was actually two distinct gaps, found one at a time by testing, not assumed:**
  (1) A judge with NO Wikidata linkage at all (`hit` falsy - e.g. Berner, Hermandorfer, no
  P12000 match) is invisible to the whole script, so blanking their photo fields unconditionally
  before checking `hit` was pure carelessness - first fix gated the blank+recompute block on
  `hit`. (2) Re-tested and found 3 MORE casualties this fix didn't catch (Anderson, Rendell,
  Rovner) - these DO have a Wikidata item matched via FJC-nid (`hit` truthy), just one whose own
  P18/pageimages lookup can't surface the specific photo a subagent found via direct Commons
  search or a different source - so a falsy-hit-only guard still wiped them. **Real fix:** an
  explicit registry, not a guess based on `hit` status. Considered marking `photo_license`/
  `photo_source` directly (like the `[[note]]` convention used for `collect_courtlistener.py`'s
  `notes` field) but both are rendered RAW to end users in the widgets (court-tracker.js splits
  `photo_license` on `" — credit: "` and displays it verbatim; `photo_source` is used as a
  literal `<a href>`) - a text marker there would show as garbage or break the link. Built a
  clean sidecar instead: `data/cache/manual_photos.json`, a `[full_name, court_id]` registry
  `enrich_wikipedia.py` checks before ever touching a row's photo fields - protects the photo
  block only, fedsoc/acs recompute still runs normally off the same `hit`. Registered all 28
  hand-curated rows (27 from session bb + Edith Jones's re-crop from session bc). Verified: two
  consecutive re-runs are now a true no-op (316 -> 316, identical manifest hash), and the 3
  previously-lost judges (plus Berner/Hermandorfer/Smith/Becerra as spot checks) all survive.
  **Any future manual photo curation MUST add its `[full_name, court_id]` to
  `manual_photos.json`, or the next `enrich_wikipedia.py` run will erase it.**
- **Generalized the name-based Wikidata bridge (the operator's actual ask) - a real, free win.**
  `wikidata_bridge()` already existed (session v/2026-07-16) for the 4 BRIDGE_COURTS outside the
  FJC bulk directory, with a deliberately conservative bar: exactly one unambiguous Wikidata
  name-search hit, accepted only if it carries P12000 OR (when P12000 could never apply) its own
  description contains "judge". Added a new step 1c that runs this SAME function
  (`strict_p12000=False`, since P12000 is exactly what's missing for this population) against
  every judge still unlinked after the FJC-nid join, not just the 4 bridge courts - reusing
  proven matching logic rather than inventing a new title-guess heuristic. **Result: bridged 23
  more judges, which (combined with the cascading pageimage-fallback effect on newly-linked
  items) translated to 16 genuinely new, free photos - missing-photo count 316 -> 300.** All 16
  are 2023-2025 district-court appointees; visually verified all 16 (downloaded + tiled grid) -
  clean, correctly-identified Senate Judiciary Committee hearing photos, several with a visible
  nameplate confirming identity (e.g. "Hon. Sunil R. Harjani," "Hon. Cristal C. Brisco"). This
  answers the operator's efficiency question directly: **the systematic/automated side still had
  real, meaningful, zero-marginal-cost gains left (16 photos, 0 subagent calls) that a cache
  refresh alone could never reach** - worth exhausting before spending more subagent budget,
  which the operator's question anticipated correctly.
- Re-synced `appointments.csv`/beeswarm the same way as session (bc) after this landed
  (`collect_appointments.py` -> `enrich_scotus_photos.py` -> `cache_photos.py` ->
  `build_assets.py`); `enrich_scotus_photos.py` correctly found 0 former justices needing repair
  (the fjc_jid-preservation fix from session az continues to hold on every regen).
- Verified: `cache_photos.py` (66 new thumbnails, 0 failures), `build_assets.py` clean,
  `tests/smoke.mjs` all pass, `check_geometry.py` PASS/0.
- **Current missing-photo count: 300/1490** (was 316 at the top of this session, 365 at the
  start of the photo-completion push). Next: operator has approved continuing the subagent
  process (the automated pass having proven it wasn't cannibalizing the same finds) - capped at
  <=10 district-court subagents per batch, waiting for operator confirmation between batches, to
  respect token budget. Then step 2 (the appointments refresh) as before.
- Blockers: none.

### 2026-08-25 (bc) — two more real photo bugs (crop bias + energy baseline), Edith Jones's wrong photo, appointments.csv sync
- Phase: 4. Operator reported 10 specific still-bad photos after session (bb)'s fixes, plus that
  the beeswarm/appointments-timeline widget wasn't reflecting the new photo data. Investigated
  each concretely rather than guessing.
- **Real bug #1 - vertical crop was blind to source composition.** 4 of the 10 reports (Ann L.
  Aiken, Richard A. Paez, Sidney Runyan Thomas, James Andrew Wynn Jr.) weren't a blur problem at
  all: `make_thumbnail()`'s plain vertically-centered square crop grabs the TORSO/HANDS instead
  of the face on a "seated, hands-in-lap formal portrait" source (a common official court-photo
  genre) where the face sits in the top ~15-20% of a tall frame - confirmed by viewing the raw
  uncropped sources directly (Aiken 58x139px, Paez 108x187px, Thomas 117x195px, Wynn 387x883px -
  all h/w 1.6-2.4). Wynn's crop was grabbing his clasped hands, not his face at all. Fixed with
  `_vertical_crop_frac()`: centered for ordinary (h/w <= 1.3) sources, tapering to a small
  top margin by h/w 2.0, calibrated against all 4 reported cases. 288/2238 photos have h/w > 1.4
  and were affected to some degree; re-verified a random 16-photo sample afterward to confirm no
  regression on already-fine near-square headshots.
- **Real bug #2 - `ENERGY_BASELINE=10.0` sat at the population MEDIAN, not above the "clean
  photo" band.** The other 5 reports (Nguyen, Aframe, Hsu, Burrell, Davila) were genuinely
  over-blurred, but nowhere near the 8.0 cap (raw blur 2.8-4.6px) - the baseline itself was
  miscalibrated. Measured the full 2,238-photo population's energy distribution directly (not
  just the small calibration sample): p50 = 9.90, p90 = 12.90, p99 = 16.48, max = 22.49 - meaning
  a baseline of 10.0 gave roughly HALF of all ordinary, non-aliased photos some blur they didn't
  need. All 5 reported photos scored 13.2-16.2 (p90-p99 territory) - real photos with normal fine
  detail, not print halftone. Raised `ENERGY_BASELINE` to 13.0 (just above p90) so only the
  highest-energy tail gets corrected; the dataset's one confirmed genuine halftone case
  (Bruggink, energy 22.49, still the max) is comfortably above this and still gets full
  correction. Re-verified all 10 originally-reported photos after both fixes - all now show
  clear, recognizable, appropriately-sharp faces.
- **Edith Hollan Jones (ca5) - the operator was right that this wasn't fixable by better
  cropping/blur.** Her Wikidata-linked photo, "Edith Jones in Iraq.jpg," is a genuine full-body
  outdoor shot where she's a tiny distant figure - no crop heuristic salvages that. Checked her
  Commons category directly (only 2 files exist total) and found a second file, "Edith Jones in
  Iraq (cropped).jpg" - a Commons editor's own 2021 tighter crop (134x148px, same "PD US Courts"
  license/provenance, just cropped) that actually shows her face (wearing sunglasses; still not
  an ideal studio portrait, but genuinely identifiable, a real improvement over the original).
  Swapped `photo_url`/`photo_source` to the cropped file; license unchanged (still PD).
- **Appointments.csv / beeswarm widget was stale relative to today's `judges.csv` photo work.**
  The operator correctly flagged this: `appointments.csv` bakes in judges.csv's photo values at
  generation time rather than reading them live, and it hadn't been regenerated since well
  before this session's 27 new photos + crop/blur reprocessing landed. Re-ran
  `collect_appointments.py --no-net` -> `enrich_scotus_photos.py --no-net` -> `cache_photos.py`
  -> `build_assets.py` (the documented run order); appointments.csv's photo-bearing row count
  1198 -> 1250. `enrich_scotus_photos.py` correctly found 0 former justices needing a photo
  (session (az)'s fjc_jid-preservation fix already protects that set on every regen). Verified
  directly that today's new judges (Berner, Hermandorfer, Justin D. Smith, ...) now carry
  `photo_url` in `appointments.csv`, and confirmed live via the existing (already data-robust)
  `tests/smoke.mjs` assertion "a sitting district judge's docked detail shows their licensed
  photo," which passed against the freshly-rebuilt data.
- Verified: `cache_photos.py --force` full re-run (2,238/2,238, 0 failures), `build_assets.py`
  clean, `tests/smoke.mjs` all pass, `check_geometry.py` PASS/0. Screenshot-verified the
  appointments/beeswarm widget renders against the same manifest version as the map widget.
- Next: same as session (bb) - ready for step 2 (the appointments refresh) whenever the operator
  wants to proceed. The `_vertical_crop_frac`/`ENERGY_BASELINE` recalibration was verified
  against a random sample but not exhaustively against all 2,238 photos - if more over-blur or
  bad-crop reports surface, the same investigate-with-real-pixels approach (not more guessing)
  is the pattern to repeat.
- Blockers: none.

### 2026-08-25 (bb) — individual photo fetch via subagents (46 circuit + 61 district sample judges); a real Wikidata-linkage gap found; test fixture fix
- Phase: 4, continuing the operator's photo-completion push (sessions ay/az/ba). Per the
  operator's explicit process: test each subagent TYPE (circuit/district) on exactly one judge
  before batching; batch circuit judges in full (ALL 46 remaining); sample district judges
  court-by-court (never mixing a subagent across courts or across circuit/district); subagents
  research only, report candidates back — I do the actual `judges.csv` writes after personally
  visually verifying every image (not just trusting a text description).
- **Calibration (2 test agents, run first):** circuit test (Karen L. Henderson, cadc) came back
  a thorough, clean negative after ~31 tool calls (Wikipedia body -> Commons -> Wikidata ->
  court site -> Wayback-archived court site -> FJC -> general search) - confirms the method is
  viable but budget for a real null rate, especially pre-2000s appointees. District test (Kevin
  M. Moore, flsd) found ONE usable image, but it's a PD group/event photo (him swearing in
  Members of Congress) embedded in Wikipedia *article prose*, not the infobox - a source class
  the systematic Wikidata/pageimages pass structurally cannot reach. First circuit-test agent
  (a "teammate" pane) went idle 3x without ever delivering its report despite explicit
  follow-ups - abandoned and relaunched as a plain one-shot background agent, which worked
  immediately; noted for future sessions (prefer plain Agent-tool spawns over persistent
  teammate panes for this kind of one-shot research task).
- **Full batch: 10 circuit-judge agents (all 46 remaining circuit judges, grouped by circuit)
  + 5 district-court agents (flsd/paed/txsd/cacd/gand, the operator's chosen size/region-
  diverse sample, one subagent per court per the "never cross a district" rule).** Findings:
  27 clean, verifiable, single-portrait candidates (mostly official government photos: Senate
  Judiciary Committee confirmation-hearing stills, a DOJ U.S. Attorney portrait, Ninth Circuit
  Annual Report portraits, one Fourth Circuit court-photographer portrait, one CC BY 2.0 Flickr
  photo, one Free Art License photo, one self-uploaded CC0 photo) plus 3 harder non-standard
  cases set aside (see below). Rejected candidates were reported as NOT FOUND rather than
  guessed at throughout - agents correctly declined university faculty photos, Getty/AP/wire
  photos, and a "courtesy of" court-website photo (ambiguous rights) even when they were the
  only lead. One agent caught and flagged a real namesake trap (Commons' "Stephanie Seymour"
  category is the fashion model, not 10th Cir. Judge Stephanie Kulp Seymour) before it could
  become a data error.
- **Root cause found for why the systematic pass missed all 27 (not a stale-cache issue,
  despite what it looked like at first):** deleted and refreshed the Wikidata SPARQL cache
  (`data/cache/wiki/wd_fjc.json`, dated 2026-07-14 - six weeks stale) expecting it to recover
  these automatically. It didn't - missing-photo count was 343 before AND after. Diagnosed
  directly: these judges (mostly 2024-2026 appointees) DO have an FJC-nid match in the bulk CSV,
  but their WIKIDATA ITEM has no `P12000` (FJC ID) property set at all, so they never enter this
  script's `linked` dict in the first place - `wikidata_index()`/`wikipedia_pageimage_fallback()`
  never even attempt a lookup for them, regardless of cache freshness. Real Wikipedia
  infobox photos exist for many of them (confirmed via a live, uncached `pageimages` API call);
  the gap is specifically the `P12000` Wikidata-linkage lag for brand-new appointees, not a
  photo-availability gap. **Flagged as a future systematic improvement, not built this
  session** (time budget): extend `wikidata_bridge()` (currently only tried for the 4
  BRIDGE_COURTS) to also attempt a name-based Wikidata search as a fallback for ANY judge whose
  FJC-nid join fails, reusing its existing (already-careful) matching logic rather than a new
  naive title-guess mechanism.
- **Visual verification (personal, not delegated):** downloaded all 27 candidate images,
  tiled into a labeled grid, inspected directly - all read as clean, legitimate, correctly-
  identified single-person photos (a few have a visible confirmation-hearing nameplate/water
  bottle in frame, harmless once cropped to a circular avatar). Wrote all 27 into `judges.csv`
  (photo_url/photo_source/photo_license, matched by exact full_name+court_id, verified against
  the CSV before writing). Flagged two license types to the operator as slightly outside the
  dominant PD-USGov pattern (both legitimate, just worth knowing): Stephen H. Anderson's photo
  is Free Art License (a real Wikimedia-accepted copyleft license, not explicitly named in
  CLAUDE.md's list but not "unclear" either); Nicholas J. Ganjei's is CC0 self-uploaded by a
  private Commons user (not a named government photographer) rather than an institutional PD
  credit.
- **3 harder cases identified but deliberately NOT added this session** (documented instead of
  forced in): (1) Kevin M. Moore (flsd) - the PD group/event photo from the district test;
  cropping one face out of 5 cleanly is judgment-heavy and lower value than the 27 clean hits.
  (2) C. Darnell Jones II (paed) - a genuine solo PD official court portrait, but embedded in a
  PDF (`paed.uscourts.gov`'s bio document) rather than hosted as a standalone image file;
  extracted it successfully with `pdfimages` and visually confirmed it's a clean usable portrait
  (chambers photo, judicial robe), but wiring a PDF-sourced photo into `photo_url` doesn't fit
  this pipeline's assumption that `photo_url` is always a fetchable, `cache_photos.py`-
  processable image URL (a future full `--force` regen with no real image behind that URL would
  silently drop it) - left null rather than build a fragile one-off special case. (3) Virginia
  A. Phillips (cacd) - a PD group "Judicial Council" photo (5 seated + 9 standing) from a Ninth
  Circuit Annual Report PDF; same PDF-sourcing problem as Jones plus a much larger crop-
  identification task. All three are real, usable PD sources if a future session wants to
  invest in either (a) properly re-hosting an extracted PDF image as a standalone Commons/
  project-owned file, or (b) building crop tooling for group photos.
- **Test fixture fix (a real regression, not a data bug):** `tests/smoke.mjs`'s "initials
  fallback still renders" assertion started failing after this session's photo work, because
  ca8 (its fixture circuit) hit 100% photo coverage (Justin Daniel Smith, 8th Cir., was the last
  ca8 judge without one, found in this batch) - the DOM-based check had no photo-less judge left
  to exercise the fallback on. Root-caused as test-fixture staleness, not a widget bug. Fixed by
  adding `initials`/`surname` to the existing `_dev` test-hook pattern (already used for
  `buildStreamModel` etc.) and replacing the DOM assertion with a direct unit check - which also
  newly locks in the Jr./Sr.-suffix fix from session (ba) with a permanent regression test
  (`initials({full_name: "Paul Joseph Kelly Jr."}) === "PK"`), something that had none before.
  This version is strictly better: it no longer depends on which real judges happen to lack
  photos on any given day.
- Verified: full pipeline re-run (`cache_photos.py` -> `build_assets.py`) clean, `tests/
  smoke.mjs` all pass, `check_geometry.py` PASS/0. Screenshot-verified Nicole G. Berner's photo
  live in the widget (44px timeline icon + 84px detail panel, correct attribution line
  rendered: "Photo: Public domain (PD-USGov-Judiciary) — Lisa McFarland, Fourth Circuit court
  photographer").
- **Result: missing `photo_url` count 343 -> 316** (27 added; the earlier sessions' work took
  it from 365 -> 343). Remaining 316 = 289 genuinely checked-and-absent (mostly pre-2000s
  appointees with no digitized free-licensed photo anywhere) + the 3 harder cases above + judges
  outside this session's scope (only 46 circuit + 5 district courts were individually
  researched; ~75 other district courts with photo gaps remain unresearched).
- Next: still pending before step 2 (the appointments refresh) per the operator's original
  sequence - nothing else identified as blocking; ready for step 2 whenever the operator wants
  to proceed. If a future session wants to push the photo count further: (a) the `P12000`
  Wikidata-linkage fallback described above would likely recover a meaningful chunk
  automatically with no per-judge research needed; (b) more district courts could be sampled or
  swept in full using the same subagent pattern validated this session.
- Blockers: none.

### 2026-08-25 (az) — pipeline data-loss audit: two real bugs fixed, not just papered over
- Phase: 4. Operator pushed back on session (ay)'s "must run the full 3-script sequence to
  avoid data loss" framing - correctly: a process depending on strict script ordering to avoid
  silently destroying data is itself the bug, not a constraint to document and work around.
  Asked for (1) a fix so `collect_courtlistener.py` doesn't write fields it was never collecting
  in the first place, and (2) an audit of the rest of the pipeline for the same class of issue.
- Did: audited every script that writes `judges.csv`/`appointments.csv`/`circuit_justices.csv`/
  `president_photos.csv` for split field-ownership across scripts. Found TWO real instances (both
  fixed), confirmed the rest safe:
  1. **`collect_courtlistener.py`** rewrote `judges.csv` from scratch every run, hardcoding
     `photo_url`/`photo_source`/`photo_license`/`fedsoc_*`/`acs_*`/`data_verified` to
     blank/false and regenerating `notes` from a template - destroying `enrich_wikipedia.py`'s
     enrichment, any human verification, and (discovered mid-audit) my own session-(ay) `notes`
     annotations, none of which this script collects or even knows about. Fixed: it now loads
     the existing `judges.csv` (keyed by full_name+court_id) and carries those fields forward
     for judges that already existed; only a genuinely new row gets fresh blank/false defaults.
     `notes` needed a finer cut, since its auto-generated source-description prefix SHOULD stay
     fresh (e.g. a territorial judge's holdover facts, sourced from `territorial_judges_manual.csv`
     each run) while a human/LLM-appended suffix should not regenerate away - added a
     `[[note]] ` marker so the auto prefix regenerates and everything from the marker onward
     rides along untouched. Retroactively marked the 10 rows annotated in session (ay) so they
     survive going forward.
  2. **`collect_appointments.py`** has the identical shape, one file over: it rewrites
     `appointments.csv` from scratch, and can only source SCOTUS photos for the sitting nine
     (via `judges.csv`) - FORMER justices' photos are a separate Wikidata lookup done by
     `enrich_scotus_photos.py`, which the file's own COLS comment already flagged as needing to
     "run after this script." Fixed the same way: carry forward existing photo fields for
     scotus rows the fresh sitting-justice lookup doesn't cover, matched on `fjc_jid` (shared
     across a justice's rows, e.g. associate + later chief commission).
  3. **Confirmed safe, no fix needed:** `enrich_wikipedia.py` and `enrich_scotus_photos.py`
     already follow the correct pattern - they load the existing CSV and mutate ONLY the fields
     they own in place, never touching `notes`/`data_verified`/dates/etc. `circuit_justices.csv`
     and `president_photos.csv` have no split-ownership risk in the live pipeline (each has
     exactly one writer; `gen_sample_8th.py` also writes `circuit_justices.csv` but is dead
     Phase-0/1 sample-authoring code, not part of any documented run order - flagged here as a
     landmine if ever accidentally re-run, not otherwise touched). `cache_photos.py` only reads
     the CSVs (to know what to fetch) and writes exclusively to `photo_thumbs.json`/
     `assets/photos/` - no CSV-field risk.
- Verified: ran `collect_courtlistener.py --no-net` and `collect_appointments.py --no-net`
  **standalone** (no follow-up enrichment script) and diffed against pre-run copies -
  `photo_url` missing count 365->365, `fedsoc_reported=true` 119->119, `acs_reported=true`
  3->3, all 10 `[[note]]`-marked rows intact, SCOTUS photos 21/21->21/21 (plus 6 EXTRA rows
  gained a photo they didn't have before: former justices' pre-SCOTUS circuit-court rows now
  also carry their photo via the same fjc_jid, consistent with this project's existing "a
  sitting judge's photo also reaches their earlier appointment rows" design intent for the
  sitting-nine case - a positive side effect, not a regression, confirmed by inspecting all 6
  changed names). Synthetically set `data_verified=true` on one row, re-ran, confirmed it
  survived, then reverted. `build_assets.py` clean (manifest unchanged after revert, confirming
  a true no-op round trip), `tests/smoke.mjs` all pass, `check_geometry.py` PASS/0.
- Next: photo collection (additional sources for the 365 `photo_url` gaps, then individual
  fetches for stragglers) and the photo-thumbnail over-blur fix, both requested before step 2
  (the appointments refresh). See the top-of-file dated block for status once that work lands.
- Blockers: none.

### 2026-08-25 (ay) — data hole-patching pass + "Last tracked appointment" header feature
- Phase: 4. Operator returned after ~4 weeks with a specific sequence (see the dated block at
  the top of this file for the full write-up): patch existing holes first, WITHOUT a fresh
  appointments pull; run the standard refresh next session; then an LLM error-check pass; then
  verify the data reaches the widget; separately, add a "Last tracked appointment" header line.
- Did: audited `judges.csv` for real gaps (no boundary violations found - every
  `fedsoc_reported`/`acs_reported=true` row already has both `*_source`/`*_basis`). Fixed a real
  code bug in `fjc_law_degree()` (missed "B.C.L." as a first-professional law degree token,
  costing Buckwalter/paed his `jd_school`/`jd_year`) via exact-token matching instead of
  substring `in` (substring would have false-matched "B.L.S." = library science). Investigated
  and confirmed (not fixed - no safe fix exists) the 250 `cl_person_id` gaps are a documented CL
  bulk-data limit; tested and REJECTED a looser name-matching heuristic after it produced a wrong
  match (Chung != Chung). Investigated the 39 `aba_rating` gaps: 25 already documented
  unsourceable (uscfc/territorial, session v); of the other 14, found FJC drops the rating on a
  judge's *later* seat when it was reached by statutory reassignment rather than a fresh
  confirmation (verified Tjoflat/Anderson III's 1981 5th->11th Circuit reassignment via FJC +
  Wikipedia) - annotated 10 judges' `notes` with the real earlier-seat rating (where one exists)
  or a confirmed-no-rating-exists note, rather than fabricating a value for the wrong seat.
  Re-ran the full `collect_courtlistener.py --no-net` -> `enrich_wikipedia.py` -> `cache_photos.py`
  -> `build_assets.py` sequence (rediscovered/documented the gotcha: step 1 alone blanks
  photo/affiliation fields since it doesn't own them - must always be followed by step 2).
  Diff-verified only the intended Buckwalter fix + 10 notes changed. Added
  `manifest.last_appointment` (max `commission_date`, currently 2026-06-18) to `build_assets.py`
  and a new `.ctt-tracked` header line in `court-tracker.js`/`.css` reading "Last tracked
  appointment 06/18/2026", above the existing title/subtitle row. Screenshot-verified at
  1100x700.
- Verified: `tests/smoke.mjs` all pass, `check_geometry.py` PASS/0 warnings, `build_assets.py`
  clean (manifest version `a2c1b9f1adbe`).
- Next: the standard CourtListener/FJC + Wikipedia refresh (steps 2-4 of the operator's
  sequence) - pull ~4 weeks of new appointments, then an LLM read-through of what changed for
  errors, then confirm the widget actually picks up the new data in a real browser.
- Blockers: none.

### 2026-07-30 (ax) — Change view: operator's 10-item review, all addressed + one real bug caught in verification
- Phase 4. Operator reviewed the first Change-view cut (session aw) and came back with 10
  concrete items. Implemented all 10 directly (no further clarifying questions needed — each
  was a specific bug/ask, not an open design question), then ran an independent Explore-agent
  read-through against all 10 before screenshotting, which caught one real bug the direct
  implementation missed.
- **1&7 — Change mode now hides the docked judge-detail panel AND the Mark: None|FedSoc|ACS
  switch** (`setMode()`), since neither means anything without judge icons to hover.
- **2 — photo blur made adaptive, not uniform.** Operator was right: blanket ratio-based blur
  (session aw) softened every photo, including the ~90% that never had an aliasing problem.
  Replaced with a per-photo diagnostic (`scripts/cache_photos.py`'s new `_aliasing_energy()`):
  downscale unblurred to the smallest display size, high-pass the result against its own
  1px-blurred copy, and use THAT residual (not the resize ratio) to decide how much blur, if
  any, this specific photo needs. Calibrated against a real halftone scan (energy ~19, wants
  ~8px) and several clean modern photos (energy 7-12, want ~0-2px) — full sample in the
  session's tool output. Re-ran the full batch from cached originals (`--no-net`, no network
  needed): 1,140/1,140, 0 errors, ~38s.
- **3 — bar hitbox widened (17px each side, symmetric) + click-anywhere-in-the-streamgraph
  now snaps the bar there** (a `click` listener on the whole `<svg>`, skipping the hit rect
  itself since dragging already handled that click).
- **4 — icons/numbers enlarged and moved**: avatar 26px->38px, number 12px->14px, the whole
  icon group now right-anchored (`translate(-100%,-50%)`) so it sits clearly LEFT of the bar
  regardless of content width, not centered on it; DOM order swapped so the count renders
  before (left of) the avatar. Same ask for "the timeline interactive" (the beeswarm) — its
  new president-icon-in-band-label (session aw) went 13px -> 20px.
- **5 — stacking order flipped**: `rTerms`/`dTerms` now sort ascending (oldest term innermost/
  at the zero line, most recent outermost/peripheral) — the opposite of session aw's
  "current-at-center" — a one-line sort-direction change (`buildStreamModel`), operator's own
  call to try the reverse and see.
- **6 — icon bumping is now ONE pass across both parties**, not two independent per-side
  passes: sort ALL visible icons by centerY, single separation loop. Verified the
  icon-centering math (`updateIcons`'s `collect()`) already mirrored `buildHalf()`'s
  lower/upper accumulation exactly (both walk the same `rTerms`/`dTerms` arrays the same way),
  so the "not properly aligned" complaint was fully explained by the per-party bumping
  pushing icons unnecessarily far from their true stream center — the unified pass fixes it.
- **8 — stream polygons split into one piece per contiguous non-zero run** (a zero-thickness
  stretch is no longer part of any polygon's geometry at all, not just invisible — it was
  still in the outline path, which is what made hover strokes look inconsistent where two
  streams' invisible zero stretches shared the same zero-line pixels). Also fixed a SEPARATE,
  real cause of "disrupted" outlines: SVG paint order is DOM order, and a stroke draws
  centered on its path (half into the neighbor) — a hovered polygon drawn earlier than its
  neighbor could have its highlight stroke partially painted over. Fixed by moving the
  hovered piece(s) to just before the bar group (front of the other polygons, still under the
  bar) in `setStreamHover`.
- **9 — x-axis trimmed to the first/last date any stream is nonzero** (`viewDayMin`/
  `viewDayMax` on the model, separate from the true `dayMin`/`dayMax` used for `valueAt()`
  correctness) — a court whose real history starts after 1969 (Federal Circuit, CIT, CFC,
  territorial courts) no longer shows a flat, empty lead-in.
- **10 — presidency background bands added**: pastel R/D fill, dashed transition lines,
  plain surname labels — same visual language as the beeswarm's bands, deliberately without
  counts or year ticks (operator: not needed yet). Drawn behind the zero line/streams/bar.
- **Bug caught by an independent verification pass before it reached a screenshot:**
  spawned an Explore agent to read the diff against all 10 items with instructions to be
  skeptical, specifically checking whether item 9's axis trim was threaded through
  consistently everywhere the untrimmed range used to be used. It found one real bug: a
  stream's polygon can legitimately reference a taper vertex from BEFORE `viewDayMin` (the
  one zero-value vertex kept just outside a non-zero run, per item 8, for a clean taper) —
  for any court whose data starts after 1969, that vertex was 1969 itself, which `xOf()`
  mapped to a large NEGATIVE x. Mostly clipped by the SVG's overflow, but not always — a
  stray colored shard could paint in the left margin, undermining the trim item 9 was for.
  Fixed by clamping `xOf()`'s output to `[x0, x1]` (semantically always safe: the axis should
  never draw outside the plot box regardless of caller). Verified on Federal Circuit
  (data starts under Reagan, 1982) — clean edge, no shard, confirmed via screenshot.
- Verified: `tests/smoke.mjs` 280/280, `tests/browser-checks.mjs` 12/12 (structure unchanged
  by any of the 10 fixes — same polygon/vertex/mode-toggle assertions still hold). Screenshot-
  verified over CDP: ca8 initial + dragged + hovered, Federal Circuit dragged (the trim/clamp
  case), beeswarm's enlarged band icons.
- Next: same open items as session aw (no `tools/tune-*.html` for Change yet if further visual
  iteration is wanted; beeswarm mobile pass; tracker's ~380px pass; a11y).
- Blockers: none.

### 2026-07-30 (aw) — NEW "Change" streamgraph pane view + photo aliasing fix + Seniors 3-way + president icons
- Phase 4. Operator asked for a big new map-widget feature (a third `Timeline | Majority |
  Change` pane view: a party-split streamgraph of appointing-president headcounts with a
  draggable time bar) plus three smaller items. Given the size and real ambiguity in the
  streamgraph spec, asked 4 clarifying questions via AskUserQuestion before writing any code
  (data source/history depth, stream unit definition, senior-status encoding, count
  semantics) — the operator's answers reframed "stream" entirely (not per-judge, but
  per-president/term aggregate headcount), which shaped everything below.
- **1. "Change" streamgraph — new, shipped:**
  - Data: the map widget had ZERO access to historical/departed judges (its `judges.csv` is
    present-roster-only, per CODEBOOK). Operator approved reusing the beeswarm's
    `data/appointments.json` (full history since 1969, already keyed by the same `court_id`
    codes) rather than a new collection effort. Extracted the beeswarm's inline `PRESIDENCIES`
    array into a new shared `embed/presidencies.js` (both widgets import it now — one date
    list, no drift risk).
  - Model (`buildStreamModel()`, `embed/court-tracker.js`): a "stream" = one
    president/TERM's currently-serving (active+senior) appointee count to the SELECTED court,
    swept from the raw appointment/departure events into a step-function vertex list (no
    smoothing — genuinely flat-topped polygons, matching the "polygon" language). Two-party
    halves (R above / D below a zero line), each stacked innermost (most-recently-commissioned
    term) → outermost (oldest) — a FIXED stacking order for the whole timeline, which is what
    makes "traces the timeline backward" a real, static geometric property rather than a
    live re-sort. Y-scale is shared across both halves (one pixels-per-judge ratio, from the
    global max concurrent count), so relative party dominance reads correctly.
  - Reveal animation: each stream's polygon starts translated further from the zero line +
    opacity 0, staggered by rank (`transition-delay`) so it fades/slides in innermost-first,
    tracing the same fixed order backward in time.
  - Draggable bar: thick vertical rect + flat triangular arrowheads (top points down, bottom
    points up — both toward the zero line), pointer-drag constrained to the plot area,
    starts at the graph's literal left edge (1969). Repositions on every drag: samples each
    stream's value at that day, centers a president icon+count there, applies a simple
    greedy vertical-separation pass per half so overlapping icons push apart. Hover an icon
    (or its stream polygon) → yellow ring + bold count on the icon, matching highlight on the
    polygon; only one active at a time, both directions wired.
  - Color schemes: BOTH of the operator's requested variants shipped behind a live toggle
    ("Alternating" vibrant/light per stream vs. "Fading" toward gray with distance from the
    zero line) — a `<select>`-free segmented control right in the view, so the operator can
    A/B them without touching code. Caught + fixed a real bug here: the scheme switch
    originally APPENDED a second full view on top of the first instead of replacing it
    (`buildStreamSVG` didn't clear its container on re-entry) — now a regression-tested fix.
  - President photos: none existed. Wrote `scripts/collect_president_photos.py` (same
    sourcing discipline as `enrich_wikipedia.py` — Wikipedia lead image → Commons
    `imageinfo` license check, writes NOTHING un-free) → `data/president_photos.csv`, 10/10
    presidents resolved (all official portraits, all "Public domain"). `build_assets.py` now
    also emits `data/president_photos.json` keyed by the exact `presidencies.js` name string.
  - **Real bug caught by the model's own sanity-checking, not by eyeballing a screenshot:**
    SCOTUS's Change view initially showed 11 justices instead of 9. Root cause: two FJC rows
    (Kennedy, Breyer) carry `senior_date` but a BLANK `termination_date` — a genuine data gap,
    since SCOTUS retirees never sit again (CLAUDE.md §3's documented quirk) so nothing else in
    the pipeline needed `termination_date` for them before now. Fixed in
    `buildStreamModel()`: for `court_id==="scotus"` rows specifically, fall back to
    `senior_date` as the effective departure when `termination_date` is empty (ordinary
    courts must NOT do this — there, senior_date means "still hearing cases," not "left").
    Verified only 2 rows total in all of `appointments.csv` have this gap, both scotus.
    Locked in with an exact-value regression test (`SCOTUS currently-serving total is exactly
    9`) — the ca8 test only asserted ">0", which would NOT have caught this class of bug.
  - Verified: `tests/smoke.mjs` new "Change" section (18 assertions: mode switching, stage
    show/hide, polygon/bar presence, scheme-switch non-duplication, model invariants, the
    SCOTUS=9 regression) + full suite still 279+/279+ pass. Screenshot-verified over CDP at
    ca8 (drag, hover, both color schemes) and scotus (exact-count check).
  - Not done / flagged for the operator: the "several quick stages" reveal timing, the
    bar/arrowhead exact proportions, and the icon-overlap separation constants are all
    first-pass values (26px icon, 90ms per-rank stagger, 22×8 arrowheads) — this is
    exactly the kind of thing this repo builds `tools/tune-*.html` for; none exists yet for
    Change. Also: switching color scheme resets the bar to the left edge (simplest correct
    redraw) rather than preserving the dragged position — minor, easy to fix if it's annoying
    in practice.
- **2. Judge-photo aliasing — root-caused and fixed, not guessed at:** many source photos
  (old FJC bar-composite scans) carry a real halftone/dot-screen texture at FULL resolution —
  proved this by testing `image-rendering: high-quality`, canvas high-quality resize, and a
  multi-step "mipmap" halving resize, none of which helped, then confirming the texture is
  present in the ORIGINAL (non-thumbnail) 676px source itself. Validated fix: blur
  proportional to the eventual downscale ratio (~0.6 × ratio, calibrated against the smallest
  on-screen size, 34px) applied BEFORE a LANCZOS resize, done ONCE at build time. New
  `scripts/cache_photos.py`: fetches each licensed photo's ORIGINAL (not the pre-degraded
  Wikimedia thumb), writes a 200px anti-aliased master to `assets/photos/<hash>.jpg`
  (content-addressed by source URL), and a `data/cache/photo_thumbs.json` lookup that
  `build_assets.py` folds into every judge/justice/appointment record as `photo_thumb`.
  Both widgets now try `photo_thumb` before falling back to hotlinking `photo_url` (graceful
  degradation preserved for un-cached photos). Ran the full batch: **1,140/1,140 photos
  cached, 0 errors** (incremental lookup-file writes added mid-run so a kill/resume doesn't
  lose progress — this took two backgrounded runs due to an earlier interruption). This also
  closes the long-open Phase-4 "cache photos for offline/archive" item: photos are now local
  assets, not remote Wikimedia hotlinks (still license-gated exactly as before — never
  fetches/caches a photo that doesn't already have `photo_license` set).
  Tradeoff flagged, not fixed: the beeswarm's zoomed-in SCOTUS photo dots (can reach ~400px+
  diameter at extreme zoom) now upscale from the same 200px master instead of the old live
  330px hotlink — softer at that rare extreme, in exchange for zero moiré at every normal
  size. Easy follow-up (a second, less-blurred master for that one use) if it's ever raised.
- **3. Seniors on the Majority view: checkbox → `Hide | Show | Include`** (map widget,
  `embed/court-tracker.js`): replaced the single "count seniors in the majority" checkbox
  with a 3-way segmented control (same pattern as Timeline|Majority|Change).
  `S.foldSeniors` boolean → `S.seniorMode` string. Hide (new default) conceals seniors
  entirely (`place(node,...,false)`); Show places them in the outer band, excluded from the
  x/y count (the OLD default behavior); Include folds them into the arc + count (the OLD
  "checked" behavior). Screenshot-verified all three states on ca8.
- **4. Beeswarm presidency-band label gets a president icon**, between the name and the
  counts, using the same photo system built for #1. Restructured each band's label from one
  `<text>` (name+counts as a single string) into a `<g class="cta-band-label-group">` holding
  a name `<text>`, a clipped-circle icon (party-ring colored, reusing `--cta-rep`/`--cta-dem`)
  vertically centered on the text's visual middle (baseline − ~35% of font-size, not the
  baseline itself), and a counts `<text>` — sized/positioned by the same character-width
  heuristic the existing narrow-band wrap logic already used. Simplified `applyPan()`'s
  sticky-label clamping from per-tspan `x` repositioning to a single group `transform`
  (works uniformly for both the one-line and wrapped layouts, and is less code). One
  intentional behavior change in the narrow-wrapped case: previously the FIRST count segment
  rode the same line as the name; now the icon takes that space, so ALL count segments wrap
  below the name+icon line instead — reasonable given the icon needs the room, flagged in
  case the operator prefers the old density.
- Data/build changes this session: `embed/presidencies.js` (new, shared), `scripts/cache_photos.py`
  (new), `scripts/collect_president_photos.py` (new), `data/president_photos.csv` (new, 10 rows),
  `data/president_photos.json` (new, derived), `data/cache/photo_thumbs.json` (new cache, 1,140
  entries), `assets/photos/*.jpg` (new, 1,140 files, ~8.8MB), `build_assets.py` (photo_thumb
  injection + president_photos.json emission + photo assets folded into the version hash).
  `build_assets.py` rerun clean; manifest version bumped.
- Next: build `tools/tune-change-view.html` if the first-pass constants (icon size/stagger/
  arrowhead proportions) need operator iteration, same as the beeswarm's explainer/dot-size
  tools. Otherwise the remaining Phase-4 items are unchanged (tracker's ~380px mobile pass,
  a11y, final UX-contract QA).
- Blockers: none.

### 2026-07-21 (av) — explainer boxes now track window resize CONTINUOUSLY, text scales with chart size
- Phase 4 (appointments beeswarm). Operator report: after (au), resizing to mobile/vertical left
  the explainer boxes frozen at their old pixel position (arrows tracked fine); toggling the
  button off/on fixed position but never font size.
- Root cause: arrows already "just worked" because `.cta-explainer-svg` is `width:100%;
  height:100%` with a fixed-at-build viewBox, so the browser natively rescales the whole SVG
  (paths, stroke widths, everything) as `.cta-chart-wrap` resizes — zero JS involved. The boxes
  are plain HTML `<div>`s, and `buildExplainerOverlay()` was setting `left`/`top`/`max-width`/
  `font-size` as literal PIXELS computed once from `chartSize()` at build time — frozen until
  the next full rebuild (only the explain-toggle did that, and even then font-size was a bare
  `${b.size}px`, never a function of chart size at all).
  - Fix, `embed/appointments-chart.js` `buildExplainerOverlay()`: `left`/`top` are now `%` of
    the chart box (matches `xf`/`yf`'s existing "fraction of the chart box" semantics) — CSS
    positions these continuously on every reflow, no listener needed, same mechanism as the
    arrows. `max-width`/`font-size` now `clamp(floor, Ncqw, ceiling)`: `cqw` = 1% of the nearest
    container-query ancestor's inline size, so text/box-width scale proportionally with
    `.cta-chart-wrap`'s actual rendered width, continuously, no JS. New `EXPLAINER_REF_W = 900`
    constant is the reference width at which `cfg.size`/`cfg.w` render literally as authored
    (close to the ~866px chart-wrap width measured in `tools/tune-explainer.html` at a normal
    window size — near enough that the calibration is imperceptible). Floor/ceiling clamps
    (0.55x/1.6x of the authored value, font floor 8px) keep text legible at phone widths and
    keep it from ballooning on very wide embeds.
  - `embed/appointments-chart.css`: `.cta-chart-wrap` gained `container-type: inline-size;
    container-name: cta-chart;` so `cqw` has something to resolve against. Graceful fallback
    by construction: a browser that doesn't understand `cqw` treats the whole `clamp(...)`
    value as invalid and drops just that inline-style declaration, falling back to the
    stylesheet's plain `font-size: 11px; max-width: 210px;` — no broken layout, just no scaling.
  - Deliberately did NOT touch the arrows' precision-on-resize (they're a uniform CSS stretch of
    a build-time snapshot, not a live recompute against the main chart's freshly re-laid-out
    dots after a big aspect-ratio change) — out of scope for this ask, which was specifically
    about the boxes, and the operator confirmed the arrows already look right.
- Verified: `tests/smoke.mjs` 255/255, `tests/browser-checks.mjs` 8/8 (no logic changed, only
  style-string values — jsdom doesn't lay out anyway). Screenshot-verified over CDP at
  1180×900 / 700×900 / 420×820 with NO explainer toggle between shots: boxes + arrows stayed
  aligned with their target dots at every size, text visibly shrank at the two narrower widths
  and hit its 9px floor by 700px-wide (from a 12px-authored box) without going illegible.
- Next: nothing further requested on the explainer thread. Same remaining Phase-4 items as
  before (beeswarm mobile pass, tracker's ~380px pass, a11y, offline photo caching).
- Blockers: none.

### 2026-07-21 (au) — operator's tuned explainer config baked into EXPLAINER_DEFAULT
- Phase 4 (appointments beeswarm refinement thread, closes the loop open since session (as)/(at)).
- Did: operator handed back a `tools/tune-explainer.html` export (7 boxes, 6 arrows, `end`
  moved 2024-07-01 → 2023-01-01, all boxes switched `bg:false`/italic, arrow tails/curvature
  freely dragged, 5 of 6 arrows pinned to exact dots via `targetPerson`/`targetDate` rather
  than the nearest-in-category pick). Replaced `EXPLAINER_DEFAULT` in
  `embed/appointments-chart.js` verbatim (field order/style kept consistent with the existing
  object). Verified every pinned `targetPerson`/`targetDate` pair resolves against
  `data/appointments.csv` (Thapar, Floyd, Jackson, Schroeder, Shwartz — all found, exact date
  match). `tests/smoke.mjs` **255/255** (the explainer assertion is count-driven, so it now
  reads "7 callouts" automatically). Screenshot-verified over CDP (clicked the live
  "Explain this graphic" button on `index.html`, not just jsdom): all 7 boxes + 6 arrows render,
  arrows land on sensible real dots (district/appellate examples, the marked-yellow cluster,
  a senior example, Jackson's departed-black dot, a SCOTUS icon).
- **Nit for the operator, not fixed (didn't want to override the tool's own output):** the two
  district/appellate arrows (`boxmrvhayf7`→Schroeder, `boxmrvhegzf`→Shwartz) both carry
  `"target": "appellate"` as their category fallback, even though the Schroeder one is
  illustrating a *district*-court dot. Harmless today (the `targetPerson` pin always resolves
  in the shipped 12yr/2023 preset view), but if that dot ever falls out of view the fallback
  would grab another appellate dot instead of a district one. Worth a one-field fix in the tool
  or a manual edit (`target: "district"`) next time this config is touched.
- Next: no other open explainer work that I can see — this was the last item in the "operator
  feedback loops in flight" thread. Remaining Phase-4 items are the mobile passes listed below
  (beeswarm mobile eyeball still outstanding; tracker's ~380px pass also still outstanding).
- Blockers: none.

### 2026-07-21 (at) — tune-explainer.html: preset span/end controls + district/appellate target categories
- **Explainer preset "span and zoom" is now directly settable, not just baked into
  `EXPLAINER_DEFAULT`.** New bar: `span (yr)` number input + `end date` date input, initialized
  from `cfg.span`/`cfg.end`. Typing either calls `_dev.setSpan(cfg.span, _dev.days(cfg.end))`
  immediately — moves the LIVE chart to match, whether or not edit mode happens to be open —
  then `rerender()` (a no-op if the explainer isn't open yet). New `isoOfDay(day)` in
  `embed/appointments-chart.js` (the exact inverse of the existing `days(iso)`, both now
  exported via `_dev`) makes the round trip exact.
  - Also added a **"Use current chart view" button**, for operators who'd rather eyeball it:
    drag/pan and use the chart's own native Years-shown control directly, then hit the button
    to snapshot wherever `A.spanYears`/`A.viewStart` ended up into `cfg.span`/`cfg.end`. Note
    (documented in the tool): dragging the chart DISMISSES the explainer boxes — that's the
    pre-existing, deliberate "any pan/zoom hides the explainer" production behavior (unchanged
    by this session) — but the view itself isn't lost, so capture-then-reopen still works.
  - Verified over CDP: typing span/end moved the actual live widget state (checked by
    re-importing the already-loaded module and reading `_dev.A.spanYears`/`viewStart`
    directly, not just the config echo); the drag-then-capture flow correctly picked up a
    panned-to end date the operator never typed.
- **New target categories: `district` and `appellate`**, alongside the existing
  scotus/marked/senior/departed, for pinning an arrowhead to "the nearest in-view district (or
  appellate) court appointment" generally — not just the specific-dot 🎯 pick from last
  session, which remains for exact targeting. `pickCat()`'s predicate map
  (`embed/appointments-chart.js`) gained `district: court_level==="district"` and
  `appellate: court_level==="circuit"` (the data's own term for appellate-court rows, matching
  the sizing formula's existing `rCircuit` usage). Both new options appear in the "add arrow"
  dropdown; existing arrows also gained an in-place category `<select>` (previously the
  target was fixed at creation, only visible as static text) so any arrow's category is
  editable, not just new ones. Verified over CDP: switched the "senior" box's arrow to
  `district`, watched a real arrow render pointing at an actual district-court dot.
- `embed/appointments-chart.js`'s only production-facing change is the two new predicate
  branches + the `isoOfDay`/`ivDays`/`days` exports — inert for every shipped arrow (none use
  `district`/`appellate` today). smoke **255/255**, browser-checks 8/8.
- **Next:** same as (as) — operator to actually use the tool and report back a revised
  `EXPLAINER_DEFAULT`, if any.

### 2026-07-21 (as) — tune-explainer.html: fixed the box-drag "snapping" bug + free arrow tail/head/curvature
- **Root-caused the operator's "boxes feel sticky/snapping" report:** `wireBoxes()`'s
  pointerdown handler called `select(id)`, and `select()` unconditionally ended by calling
  `rerender()` — which removes and REBUILDS the entire explainer overlay DOM (including the
  box `<div>` the drag closure had just captured as `n`). So every drag started by yanking
  the live node out from under itself: the pointermove handler kept patching `n.style.left/
  top`, but `n` was now a detached, invisible clone; nothing moved on screen until pointerup
  called `rerender()` again, which read the (correctly-updated) `xf`/`yf` off the model and
  redrew the box in its final spot — reading as a single jump/snap rather than a drag.
  **Fix:** `select()` no longer rebuilds anything — it only updates the side panel and
  toggles the `.sel` outline on the box(es) already on screen (new `markSelected()`).
  `rerender()` (the real DOM rebuild) now runs ONLY at drag-end and on actual config edits
  (text/style/add/delete/target changes) — never mid-drag. Verified over CDP with real
  `Input.dispatchMouseEvent` sequences: the box's inline `left`/`top` now updates on every
  intermediate `mousemove`, not just at release.
- **New capability, the operator's actual ask: arrows are no longer locked to the box's
  top/bottom-center.** Two new optional per-arrow config fields, both backward-compatible
  (absent = old behavior, so the shipped `EXPLAINER_DEFAULT` didn't need touching):
  - `tailXf`/`tailYf` (chart-fraction, like box positions) override the box-edge tail
    computation in `buildExplainerOverlay()` (`embed/appointments-chart.js`). The tool draws
    a draggable **blue tail handle** at the tail's current point (parsed straight off the
    rendered `<path d="M x0 y0 Q cx cy x1 y1">` via `data-arrow-i` — no duplicated geometry
    math) that free-drags it anywhere, live, with a "reset tail" button to drop back to the
    edge default.
  - `targetPerson`/`targetDate` (the judge's `full_name` + `commission_date` — stable across
    pan/zoom/relayout within a mount, unlike a raw dot index) pin the arrowhead to an EXACT
    dot instead of the "nearest in-view dot of this category" auto-pick
    (`pickTarget()`/`pickCat()`, still the fallback if the pinned dot ever isn't resolvable
    in view). New 🎯 pick flow in the tool: click pick, then click any dot in the chart
    (capture-phase listener on `root`, `stopPropagation`'d so it doesn't also trigger the
    widget's own click-to-pin — verified: panel stayed unpinned after a pick click).
  - **Curvature (`bend`) is now also a draggable yellow handle** (in addition to the existing
    number input) — dragging it projects the pointer onto the perpendicular of the tail→head
    line to recover `bend` (inverts the same formula the renderer uses to place the curve's
    control point from `bend`).
  - All three handles live-patch the SVG `path`/handle-circle attributes directly during the
    drag (same "don't rebuild mid-drag" fix as the box) and commit via one real `rerender()`
    on release.
- Verified over CDP end-to-end: continuous box drag, tail drag (`tailXf`/`tailYf` land in the
  exported config), bend drag (`bend` 20 → -10), and a target pick (`targetPerson: "Stephanie
  Marie Rose", targetDate: "2012-09-17"`) — all with the exported JSON textarea inspected
  after each step. `embed/appointments-chart.js`'s `buildExplainerOverlay()` refactor (arrow
  loop now `forEach` with a stable index, `data-arrow-i` on the path, new `pickTarget()`)
  keeps smoke **255/255**, browser-checks 8/8 (production render is unaffected when the new
  fields are absent, which is every shipped arrow today).
- **Next:** operator to actually use the fixed tool and report back a revised
  `EXPLAINER_DEFAULT`, if any; otherwise proceed down the header block's other open threads.

### 2026-07-21 (ar) — beeswarm: fit knob 1 -> 1.2 (operator's tuned value shipped)
- Operator tuned `tools/tune-dot-sizes.html`'s `fit` slider and settled on **1.2** (was 1).
  Shipped in `SIZE_FORMULA` (`embed/appointments-chart.js`); tool's default/reset value moved
  to match (was tracking the old 1). Larger `fit` lets the auto-shrink allow the swarm to run
  up to 1.2× the chart half-height before clipping, so dots land a bit bigger/denser overall.
  smoke **255/255** (one assertion's absolute numbers shifted with the bigger radii — the
  relative comparison it checks still holds), browser-checks 8/8.

### 2026-07-21 (aq) — beeswarm: mark color reverted to yellow + black border ring, beeswarm vertical-overflow safety net
- **Mark color reverted green -> yellow** (operator call — the lime green from session (ao)
  didn't land): `.cta-aff-fedsoc`/`.cta-aff-acs` fill back to `#e8b400` active / `#ad9440`
  senior / `#e8b400` SCOTUS ring (the pre-(an) yellow, session (al)'s original choice).
  Explainer copy's "green" reverted to "yellow" too.
- **New problem this reintroduces (operator caught it in advance): the hover ring is ALSO
  yellow (`#ffcf33`), so a marked dot's own hover ring can blur into its fill with no visible
  edge.** Fix: while a mark mode is active, `highlightPerson()` now inserts an extra thin
  BLACK ring (`.cta-dot-hl-border`, r+1.3) between the dot and the yellow hover ring (which
  itself moves out slightly, r+2 -> r+2.8, to leave room) — not gated to marked dots
  specifically, just to markMode being on, since that's when the collision *can* happen.
  When no mark is active, geometry is byte-for-byte what it was before (r+2, no border).
  Verified over CDP: screenshot of a pinned marked dot shows dot -> black ring -> yellow ring
  as three distinct rings, not a blur.
- **Beeswarm vertical-overflow safety net (operator's `tools/tune-dot-sizes.html` concern):**
  the existing radius-shrink loop in `layoutDots()` had no fallback once radii hit the floor
  (1.8px) — a dense same/near-date pileup (e.g. a wholesale court reorganization, or an
  aggressive `fit`/`cap`/`mult` knob combo) could still push dots' `|y|+r` above/below the
  visible chart, since the packer (`packSwarm`) only ever varied y, never x. New
  `relievePileups()` hands off from the shrink loop exactly when `base` bottoms out and the
  pack still doesn't fit: it clusters dots by rendered-pixel proximity (gap <= 2×maxR, so it
  also catches wide-zoom multi-day pileups, not just literal same-day ones), then increases a
  symmetric per-dot x-offset within each cluster and repacks, keeping the best (lowest-worst)
  result, stopping as soon as it fits. Dots outside a crowded pileup are untouched (still
  exactly on their true date); x-order (chronology) is never inverted. Verified synthetically
  (not reachable with real data at any shipped span): a 200-dot same-day pileup that
  overflowed 431.8px of a 180px allowance packs to 23.4px after relief (spreading only 89.5px
  total); pushed to an absurd 1000-dot pileup, still fits (24.2px) using ~450px of spread —
  graceful, bounded, no runaway. Confirmed via the REAL 2740-dot dataset at max 58yr span that
  normal operation is untouched (already fit before this change; still does, down to an
  artificially squeezed 150px-tall chart).
- smoke **255/255** (2 new: no border ring when unmarked, black border ring appears + count
  matches the highlight count once marking is active), browser-checks 8/8.
- **Next:** see the header block above — explainer config bake-in still pending from the
  operator, then the beeswarm mobile pass, then the tracker's Phase-4 tail.

### 2026-07-20 (ap) — SESSION CLOSE
- **State:** everything green — smoke 253/253 (both widgets in one run), browser-checks 8/8,
  build idempotent (0dbab831c5c8), geometry PASS/0, data pipeline reproducible offline
  end-to-end (collect_courtlistener → enrich_wikipedia → collect_appointments →
  enrich_scotus_photos → build_assets). No known blockers. A `python3 -m http.server 8777`
  may still be running in the repo root (deliberate — the browser suites and tools use it).
- **This conversation's arc** (sessions t → ao, multiple days): root-caused and killed the
  entire freeze family (compositor text-raster lockup via morph-layer labels; commit-rate
  cap kept as exposure reduction); fixed hover border flicker (CSS transform transitions on
  SVG rects); closed the GPU-"ratchet" question (driver-deferred reclaim, benign);
  full-height pane + docked judge detail + adaptive bottom-anchored majority arc + small-
  bench arc buffers; SCOTUS as a first-class court (data + selector + pane + Circuit-Justice
  record merge); CIT/CFC feeder blocks on the map (tunable); the manifest cache-busting that
  was documented-but-never-implemented; and the ENTIRE appointments-beeswarm widget
  (spec'd via Q&A, data collected incl. recess dates + former-justice photos, built,
  and five review rounds deep: sizing formula, marks (hatch→yellow→magenta→green),
  president bands + wrapped per-term counts, pin lifecycle, chief-justice merge, SCOTUS
  retirement wording, span control with non-linear stops, config-driven "Explain this
  graphic" overlay + its editor tool).
- **Operator-facing tools now in `tools/`:** tune-seat-blocks.html (map blocks incl.
  CIT/CFC feeders), tune-dot-sizes.html (beeswarm formula knobs), tune-explainer.html
  (explainer designer, exports JSON).
- **Next:** see the header block — bake in the operator's explainer config when it arrives,
  then the beeswarm mobile pass, then the tracker's long-standing Phase-4 tail (mobile ~380,
  accessibility, offline/archive QA, final UX-contract QA).

### 2026-07-20 (ao) — beeswarm round 5: green marks, wrapped counts, shipped formula, explainer editor
- **Marks now NEON GREEN** (#2ce618; senior-marked #6fae52) — magenta retired. Senior party
  colors adjusted again per operator (less dark, more gray): #c28b92 / #8CA3C9. Explainer
  text updated to say "green".
- **Band counts WRAP in narrow bands** (operator layout): line 1 = the surname, count lines
  below indented past it ("Trump / · 3 SCOTUS / · 53 Appellate / · 172 District / · 13
  Other"); single line when it fits (estimated 6.2px/char); wrapped tspans pan with the
  sticky clamp via per-tspan base-x. Verified Trump-I's 172 against the data + the
  reappointed-exclusion rule directly.
- **Operator's settled size formula SHIPPED**: `SIZE_FORMULA = {cap:30, mult:120,
  rCircuit:2, rScotus:7, fit:1}`. Tool ranges widened (cap→80, mult→400, scotus×→12) and a
  new `fit` knob scales the allowed swarm height (>1 = deliberate overflow, clipped) — the
  auto-shrink was the real ceiling they were hitting, not cap/mult.
- **Explainer is now CONFIG-DRIVEN** (`EXPLAINER_DEFAULT`: preset span/end/mark, boxes as
  chart-fraction positions + per-box bg/color/size/bold/italic/underline/width, arrows as
  from-box/edge/target-category/bend/dx/dy/color/width; targets still picked live near the
  owning box). **New `tools/tune-explainer.html`**: opens the explainer in edit mode — drag
  boxes, click to select, edit text/style, per-arrow editors (edge/bend/dx/dy/color/width/
  delete), add/delete boxes and arrows, live JSON export to paste back. Verified over CDP:
  5 boxes render, selection panel binds, add-box lands in the export.
- smoke **253/253**, browser-checks 8/8.

### 2026-07-20 (an) — beeswarm round 4: recess mystery, band counts, explainer overlay
- **"Clinton appointee commissioned 2001-07-25" — solved, real data:** Roger Gregory (ca4),
  the era's ONE cross-term recess appointment: Clinton recess-appointed him 2000-12-27, Bush
  renominated, commission 2001-07-25 — FJC credits Clinton in the single block. Now handled
  first-class: `recess_appointment_date` column (FJC bulk carries it; also catches Pickering
  + Pryor, Bush 2004 intra-term), the dot plots at the RECESS date (inside the crediting
  president's term), and the panel explains the recess -> confirmation -> commission chain.
- **Colors:** mark magenta brightened #cf2fa6 -> #f31bce (was too close to --cta-rep);
  senior party colors darkened (#c4747e / #7495cd — the old pastels sank into the band
  background); senior-marked #b23a9c.
- **Dot-size tool reworked to FORMULA knobs** (operator intent): cap/mult/appellate×/SCOTUS×
  override the live sizing law (`A.formulaOverride`, fit-shrink still runs); report line
  shows knobs + resulting radii per view. Shipped constants centralized in `SIZE_FORMULA`.
- **(×) unpin now prominent** (tracker-style 28px round button).
- **Per-president band counts:** "Trump · 3 SCOTUS · 53 Appellate · 174 District [· N Other]"
  per CONSECUTIVE term span — counts that president's dots inside the band, excluding roles
  later reappointed out of (operator rule); shown only when the band is ≥250px wide.
- **"Explain this graphic ⓘ"** (right-aligned in the controls): jumps to a 12-yr preset
  ending 2024-07 (has photos/seniors/departed/marks), turns FedSoc marking on, and overlays
  an intro box + four curved-arrow callouts targeting REAL on-screen examples (nearest-to-
  box picking keeps arrows short — the first cut criss-crossed). Dismissal: any pan/zoom
  hides it, reverts the mark, and RESPECTS the user's new view; the button itself fully
  restores the pre-explainer state. Three screenshot rounds tuned it (missing senior example
  -> preset widened to 12yr; spaghetti arrows -> per-box anchor picking).
- smoke **253/253** (recess dot date + panel text, Nixon "4 SCOTUS" band count, explainer
  lifecycle incl. two more test-state-leak fixes), browser-checks 8/8.

### 2026-07-20 (am) — beeswarm round 3 + tracker naming consistency
- **Marks recolored magenta** (#cf2fa6 active / #a2588f senior / magenta SCOTUS ring) —
  yellow clashed with the yellow hover ring.
- **Slider ticks**: thumb-width constant 14 -> 16px (Chrome's actual default; the 14px guess
  drifted ticks left-to-right across travel). Stops now 2,4,8,12,16,20,30,40,max.
- **NEW TOOL `tools/tune-dot-sizes.html`**: absolute per-level radius sliders (district/
  appellate/SCOTUS) applied literally via `A.sizeOverride` (widget hook skips the fit loop);
  live report line (`span=8yr chart=866px desktop -> district=10 ...`) to copy back for
  implementation; "Formula sizing" button restores the automatic sizing. Serve repo root.
  OPERATOR TO DO: pick sizes at the spans/orientations they care about and report.
- **Departure tags split**: "Reappointed" (termination = Appointment to Another Judicial
  Position) and "Reassigned" (statutory reassignment) vs "No longer serving" (actually gone).
- **Docked panel at-a-glance court**: short name (S.D.N.Y. / 4th Cir. / SCOTUS) bold-italic
  13px on its own line, full court name on the next; **sitting judges' photos now show in
  the panel** for every court level (collect_appointments joins photos for ALL sitting
  judges — keyed by NAME so an elevated judge's earlier district row gets their photo too;
  1,192 of 2,792 rows carry one; swarm dots remain photo-less except SCOTUS by design).
- **USCIT -> CIT** (courts.csv + skeleton): the selector's "USCIT" was a Phase-0 skeleton
  choice, not sourced; the court's own domain (cit.uscourts.gov) and Fed. Cir. usage say
  "CIT", which the map's feeder blocks already used. "USCIT" survives mainly in rules
  citations (USCIT R.). CFC was already consistent. One-line CSV flip if reversed.
- smoke **247/247** (one more self-inflicted test-order fix: hover assertions ran while the
  panel was still pinned from the lifecycle block), browser-checks 8/8.

### 2026-07-20 (al) — beeswarm refinement round 2 (operator review)
- **Sizing again:** base cap 11 -> 15px, multiplier 34 -> 46 (small-span views much more
  space-filling; full-span arithmetic unchanged — it was already floor-limited), fit margin
  h/2-24 -> h/2-10; SCOTUS ratio 2.9 -> 3.6.
- **Affiliation marking: yellow recolor replaces hatching** (too subtle, operator call):
  active-marked = #e8b400, senior-marked = grayed #ad9440, SCOTUS = yellow ring around the
  photo. Classes on the dot/ring (`cta-aff-fedsoc`/`cta-aff-acs`) — which also fixes the
  dual-affiliation judge the old fedsoc-ELSE-acs overlay silently dropped from ACS mode.
- **Caveat line moved into the docked panel bottom** (CSS-gated by data-mark) — selecting a
  mark no longer reflows/shrinks the chart.
- **Span control:** [−][+] now adjacent (right of the slider); tick BARS cross the slider
  track with the year numbers centre-aligned under each bar, positioned at the true thumb
  fractions (calc(T/2 + i/(n-1) * (100% − T)), T≈14px thumb) — plain space-between drifted.
- **Timeline background:** dashed separator line at every presidential transition (the
  same-party neighbours Nixon|Ford, Reagan|Bush, Biden|Trump-II now read as distinct);
  year labels CENTERED mid-year between their boundary lines; label visibility follows the
  operator's powers-of-two rule (%1/%2/%4/%8, finest mod giving ~40px per label) so kept
  labels stay kept while zooming.
- smoke **244/244** (dual-affiliation, president-line count, caveat placement, per-stop
  tick assertions), browser-checks 8/8.

### 2026-07-20 (ak) — beeswarm refinement batch (operator review of the first build)
- **Sizing:** base radius up (cap 8.5 -> 11px, multiplier 26 -> 34), district/appellate gap
  widened (ratio 1.45 -> 1.8), SCOTUS 2.4 -> 2.9 (photos already distinguish them further).
- **FedSoc/ACS marking was invisible — real bug:** the hatch overlay circle was appended
  BEFORE its dot, and SVG paints in document order, so every dot covered its own hatching.
  Overlays now append after; smoke asserts the sibling order.
- **Pin lifecycle redefined (operator spec):** clicks NEVER unpin — not the chart drag, not
  the span/mark controls, not the page (the old document-mousedown unpin was why changing
  controls unstuck the panel). Unpin = the new (×) in the panel (visible only while pinned)
  or any keypress whose target is not a form control (so slider arrow-keys don't self-unpin).
- **SCOTUS corrections (operator caught both):**
  * Rehnquist's associate->chief pair now merges into ONE dot (continued seat): original
    1971 commission + "Became Chief Justice 1986-09-25 (named by Ronald Reagan)" + the final
    departure (2005, death) — no second dot, no "left the bench + also appointed" nonsense.
    Merge is widget-side (appointments.csv stays faithful to FJC); `A.chiefMerges` = 1.
  * SCOTUS never shows "Senior status": FJC's senior date for a justice records RETIREMENT,
    so the panel reads "Left the bench <date> (retired)"; death-in-office keeps the
    termination wording. (Colors were already right — retirees render departed/black.)
- **Years-shown control rebuilt:** [−]/[+] arrows step ±1 year; the slider is now DISCRETE
  over labeled tick stops (2 3 4 5 6 8 10 12 16 20 30 40 max — non-linear, fine near the
  detailed end), thumb snaps to the nearest stop at-or-below the current span.
- smoke **241/241** (chart section grown to ~24 assertions incl. a test-ordering fix of my
  own: hover assertions ran before the starts-with-hint check and overwrote the hint),
  browser-checks 8/8. Screenshots verified: hatched dots (incl. over SCOTUS photos), new
  control, 2,740 dots.

### 2026-07-19 (aj) — BEESWARM WIDGET BUILT: embed/appointments-chart.{js,css} live
- **The widget exists and works** — second self-contained module (`cta-` prefix, automounts
  on `#appointments-chart-root`, added to index.html below the tracker; zero dependencies,
  relative fetches + the manifest ?v= cache-busting). 2,741 dots (2,792 rows − 51 statutory
  reorganizations, which render as italic "Reassigned by statute to X on D (Act name)" lines
  in the affected judge's detail instead — operator call; act names only for the three
  verified statutes ca11/cafc/cit, generic wording elsewhere).
- **Implements the locked spec:** one central swarm (greedy min-|y| packing, repacked per
  span change with radii auto-shrunk until the fixed height fits — pan is a pure transform);
  presidency bands (11, Nixon->present) with STICKY president labels (clamped into view on
  pan) and adaptive year-label density (1/2/5-yr steps); month minor ticks at spans <= 4yr;
  drag-to-scroll via window pointer listeners (no capture); integer span slider 2..58yr
  anchoring the right edge, default 8 (4 mobile); None|FedSoc|ACS mark switch gating hatch
  overlays (party-shaded 45° patterns) + the sitting-only caveat line; colors active=party /
  senior=grayed / departed=black / former-SCOTUS=black ring + grayscale photo; 21 SCOTUS
  photo dots (clip-circled <image>); docked right panel (below on mobile), hover-sticky,
  click-pin, click-elsewhere-unpin; same-person dots group-highlight on hover and the panel
  lists "Also appointed: …".
- **Verified:** real-browser probes (hover/pin/unpin/reorg-line/zoom-fit at 58yr: radii
  1.76-4.22px, swarm fits) + screenshots at 8yr and 58yr; **smoke 230/230** (12-assertion
  chart section: dot arithmetic, 21 photo dots, 11 bands, hover/group/reorg/pin/mark/
  radius-scaling), browser-checks 8/8.
- **Open polish, operator's call:** hatch overlay legibility at small radii; a legend;
  wheel-zoom (deliberately not hijacked); keyboard access for dots; the ~0.4yr white slack
  right of "now" at max span.

### 2026-07-19 (ai) — BEESWARM WIDGET: spec locked + data prep COMPLETE (paused before build)
- **Operator paused the session here deliberately (token budget); the widget itself is NOT
  started.** Everything below is ready so the next session can go straight to implementation.
- **Locked spec (operator answered 4 questions):**
  1. ONE central swarm, all levels around one axis; size encodes level (district small,
     appellate medium, SCOTUS large WITH photo). **Same-person appointments hover as a
     GROUP** (elevations etc. — hovering one dot highlights that person's other dots).
  2. Dot radius SCALES with the visible span so the fixed-height widget always fits.
  3. Colors: active = party color; now-senior = grayed party; departed = SOLID BLACK;
     former SCOTUS = black outline + grayscale photo; reorganization rows = neutral gray
     (formatting still the operator's open decision — see taxonomy below).
  4. Docked detail panel RIGHT of the chart (below on mobile), hover-sticky + click-pin like
     the tracker's; initial view = most recent 8 years (4 on mobile), scrolled fully right.
  Plus, from the original ask: separate widget in its own div BELOW the tracker on the same
  page; own module/CSS prefix; drag-to-scroll; span slider (2..max years, integers) next to a
  None|FedSoc|ACS mark selector; hatching in a party-color shade for reported affiliations
  (sitting judges only — surface that caveat in the UI); pastel red/blue background bands per
  president with labeled year ticks + minor month ticks; commission date = time anchor.
- **Reassignment/elevation taxonomy (operator asked; feeds their formatting decision):**
  * 51 rows have NO president ("None (reassignment)") — statutory REORGANIZATIONS:
    1980 Customs Court -> CIT (10), 1981 Fifth Circuit split -> ca11 (18), 1982 Court of
    Claims + CCPA merge -> cafc (15), 1979 E.D. Ill. abolition -> ilcd/ilsd (6), 1972 lamd
    (1), 1983 wvnd (1).
  * 197 persons have >1 appointment; consecutive-pair kinds: district->circuit elevation
    (152), district->district transfer (28), circuit->SCOTUS (14), reassignment-no-president
    (13), SCOTUS assoc->chief (1: Rehnquist), specialized->circuit (1).
  * Person key for group-hover: `fjc_jid` when present, else normalized full_name.
- **Data prep DONE:** appointments.csv gained `photo_url/photo_source/photo_license`
  (SCOTUS rows only): sitting nine from judges.csv at collect time; **11 former justices via
  new `scripts/enrich_scotus_photos.py`** (FJC jid -> nid -> Wikidata P12000 -> P18 ->
  license gate; all 11 public domain, 21/21 SCOTUS rows have photos). Gotcha recorded: the
  Wikidata index keys on FJC *nid*, appointments carry *jid* — the script maps via the bulk
  CSV. Run order: collect_appointments -> enrich_scotus_photos -> build_assets (offline
  re-run verified idempotent). CODEBOOK Table E should gain the photo columns next session.
- **NEXT SESSION — implementation plan:** `embed/appointments-chart.js` + `.css` (prefix
  `cta-`), automount on `#appointments-chart-root`, add the div to index.html below the
  tracker; fetch manifest (no-cache) -> appointments.json (?v= cache-busting already in the
  main widget, replicate it); hardcoded presidency table for the bands; beeswarm packing:
  greedy sort-by-x place-nearest-|y| — repack ONCE per span change (pan = pure translate);
  drag via window pointer listeners (no capture — see (l)); jsdom smoke section + real-browser
  screenshots via index.html; keep zero runtime dependencies and file:// compatibility.

### 2026-07-19 (ah) — chief star: black outline + scoped to the displayed court
- Star outline (operator ask, two rounds): yellow ★ -> thin BLACK outline
  (`-webkit-text-stroke: 0.6px` + 4-direction 1px black shadows) -> WHITE outline wrapping
  the black (8-direction 1.5-2px white shadows, listed after the black so they paint
  underneath/outside). Reads on any background, incl. over the red party ring.
- Scope fix: Roberts's merged SCOTUS record carries `is_chief`, which put a chief star on
  his CIRCUIT-JUSTICE icon over the 4th/DC/Fed benches — but the star means "chief of the
  displayed court". The justice icon is built with `noStar: true`; his docked detail keeps
  the Chief tag (his title), and the SCOTUS pane still stars him (he is that bench's chief).
  Asserted both ways. smoke 218/218.

### 2026-07-19 (ag2) — "Circ. Justice Jr." on Alito/Roberts circuits (operator report)
- Pre-existing since the justices CSV got full names: the label took
  `justice_name.split(" ").pop()`, and "Samuel A. Alito, Jr." ends in "Jr." — hence 2nd/3rd/
  4th/5th/DC/Fed (the Alito + Roberts allotments). New `surname()` helper strips
  generational suffixes; regression asserts ca3 renders "Circ. Justice Alito". 216/216.

### 2026-07-19 (ag) — Circuit Justice hover detail was mostly empty (operator report)
- The justice icon was built from a `circuit_justices.csv` row — name/circuit/photo only —
  so the docked panel had nothing to show. Now that full SCOTUS records exist (session aa),
  `buildBenchModel` merges the matching `judges/scotus.json` record into the justice
  (joined by last name — unique across the nine — with a first-initial guard, since the two
  files write names differently: "John G. Roberts, Jr." vs "John Glover Roberts Jr.").
  Justice-row fields win where both exist, so the label/photo look is unchanged; the bundle
  is fetched on circuit selection (small, cached) and an unavailable bundle degrades to the
  old thin row. Verified live: hovering Kavanaugh on ca8 shows appointed-by/confirmed/
  tenure/JD/ABA/hedged-FedSoc/photo.
- Behavior consequence, kept deliberately: the justice icon now participates in the
  FedSoc/ACS marker (it carries the affiliation fields) — consistent with the bench;
  smoke's mark-count assertions updated to include it. smoke 215/215.

### 2026-07-19 (af) — top stow button + more prominent pane controls (operator ask)
- Since the pane went full-height, the bottom edge tab is invisible unless you know it's
  there. New `.ctt-pane-stowtop` (▲) next to the × — STOW-ONLY (asserted: clicking it twice
  doesn't reopen); the edge tab remains the way back up (its toggle still stows too).
  Both round buttons enlarged 26 -> 32px with a shadow + accent hover; pane-head padding
  widened so the Justice chip clears them. smoke 215/215.

### 2026-07-19 (ae) — feeder view killed block clicks (double-wired listeners)
- **Operator flow:** open Fed via its block -> View feeders -> Fed's block dead (selector bar
  still works; CIT/CFC fine) -> Back -> every circuit block dead (DC/2nd/Fed noticed).
- **Cause:** `wireBlockEvents(svg)` wired EVERY `.ctt-block` in the svg. Rendering the feeder
  level into the national svg re-wired the untouched circuit blocks — a doubled click
  listener runs `selectCourt` twice, and the deselect-toggle means open-then-instantly-close,
  which reads as "not clickable". Fresh CIT/CFC nodes had one listener, hence they worked;
  the doubling survived the return to national because the circuit group is never rebuilt
  on drillOut.
- **Fix:** wiring scoped to the group just built (`wireBlockEvents(svg, g)`). Regression test
  reproduces the operator's exact click path and was PROVEN to fail against the old wiring
  (1 ✗) before passing with the fix. smoke 211/211, browser-checks 8/8.

### 2026-07-19 (ad) — "CIT/CFC stick to Fed" -> the manifest cache-busting was never implemented
- **Operator report:** editing cit/uscfc anchors in seat_blocks.csv/.json didn't move the
  blocks; they seemed glued to their Fed-relative defaults.
- **The data path was fine** (verified: a test anchor flowed CSV -> build -> json -> render).
  The real bug: **CLAUDE.md §6's "manifest version = cache-busting" was documented since
  Phase 0 but never implemented** — `fetchJSON/fetchText` fetched plain relative URLs, and
  Chrome's heuristic cache (10% of file age; python -m http.server sends Last-Modified)
  served a STALE seat_blocks.json after the rebuild. Every session's own tests dodged it
  because constant rebuilds kept files young; the operator's edit-after-idle hit it.
- **Fix:** `resolve()` appends `?v=<manifest.version>` to every asset fetch (http/https
  only — file:// and odd archive setups keep plain URLs), and the manifest itself — the
  version SOURCE — always revalidates (`cache: "no-cache"`, a cheap 304). A rebuild changes
  the version and busts everything; unchanged data stays cached. Verified: seat_blocks
  fetched as `?v=a077787cfa93`, operator's cit/uscfc anchors render at their CSV positions,
  smoke 207/207, browser-checks 8/8.

### 2026-07-19 (ac) — tuner: CIT/CFC feeder blocks are now tunable (operator report)
- **Why the drag silently no-opped:** the tuner starts a drag from `b.anchor ||
  shapeAnchor(...)` — CIT/CFC have no stored anchor (their default position is COMPUTED
  offsets from the Fed block inside renderSeatBlocks) and no geometry, so `cur` was null and
  `onDown` bailed before any listener attached. Fix: `renderSeatBlocks` stashes each block's
  EFFECTIVE anchor on its node (`blk._anchor`), and the tuner falls back to it; per-block
  level (`b.level`) replaces the view-level for the shapeAnchor call.
- Tuner also learned the feeder view: dropdown option "Federal Circuit feeders (CIT/CFC)"
  (drives `drillIn("cafc")`; the state-sync loop maps the widget-driven route to the same
  option), rerender draws BOTH levels there (circuit + feeder, matching the widget), size
  slider/reset/export scope to the feeder level, and cit/uscfc export with the
  "No geography; placed by hand." note like cafc. Reset is allowed for them (null falls back
  to the computed offsets).
- Verified over CDP end-to-end: dropdown -> 2 feeder blocks; synthetic window-listener drag
  commits `cit` anchor null -> [2111826, 693646]; export line
  `cit,2111826,693646,,No geography; placed by hand.`. (Synthetic pointers are fine HERE:
  the tuner deliberately uses window listeners, no pointer capture — the (l) caveat doesn't
  apply, and the bug under test was the null-anchor bail, pure logic.) smoke 207/207.

### 2026-07-19 (ab) — arc: bottom-half bowl reverted; count label docked below the dome
- Operator's alternate fix for the whitespace complaint: top-half dome reinstated exactly as
  before (placement/guides/majority-line/justice all un-flipped; smoke's line assertion
  restored), and `ctt-majority-count` moved from a hardcoded y=18 at the stage top to
  y = cy + 54 — below the baseline icons' name labels (~cy+40), centred between the endpoint
  seats, position fixed relative to the arc centre. Verified ca8/ca9/SCOTUS: zero pane
  overflow, text clear of endpoint labels, note still below everything. smoke 207/207,
  browser-checks 8/8.

### 2026-07-18 (aa) — operator batch: segmented toggle, bottom-half arc, stable detail,
### SCOTUS (data + UI), feeder map blocks, appointments dataset
- Details in the Phase-4 checklist item above. Notes beyond it:
  * The bottom-half arc's count text stays at y=18; endpoint seats (180°/0°) are the TOPMOST
    icons at y=cy, so cy=56 sets the text buffer. Rmax now grows DOWNWARD with stage height.
  * The FJC bulk export was verified to carry SCOTUS before writing any code (116 rows with
    a SCOTUS position; Breyer/Kennedy senior-dated-not-terminated was the key find that set
    the sitting-bench filter, and Souter's death-terminated row confirmed the schema).
  * `collect_appointments.py` deliberately REUSES collect_courtlistener's parsers (import,
    not copy): the CFC bio regexes and caches serve both current-roster and historical paths.
  * FJC name inconsistency left verbatim in appointments.csv ("Donald J. Trump" 291 rows,
    "Donald Trump" 2): chart consumers should key on party + date, never name strings.
  * `visual.html?c=scotus` works (SCOTUS is a top-level selector entry).
  * Data re-run order when refreshing: collect_courtlistener -> enrich_wikipedia ->
    collect_appointments (joins affiliations FROM judges.csv) -> build_assets.

### 2026-07-17 (z) — docked judge-detail panel (operator redesign of the hover tooltip)
- Operator spec: kill the corner-snapping floating tooltip; give judge details a dedicated
  static area — right column on desktop, below the stage (and below the majority note) on
  mobile; hover still updates it live; click still pins; larger photo. Delivered as the Phase-4
  checklist item above describes. Implementation notes worth keeping:
  * DOM order = mobile stacking order (stage, notes, detail inside one flex row that becomes
    block under the 640px media query) — no CSS `order` tricks needed.
  * The panel lives inside `paneBody` now, so `renderPane` rescues it (`pane.append(detail)`)
    BEFORE wiping the body, or the wipe destroys the node and its listeners.
  * Sticky-unpinned semantics (operator-confirmed mid-session): hover-out keeps the last
    judge's content; clicking elsewhere unpins WITHOUT clearing, so hover immediately drives
    the panel again. Pin only freezes content while it lasts.
  * Two layout regressions caught by the suites, both from the panel column narrowing the
    stage: majority-view pane overflow (19px — fixed by margin/padding trims) and a 0.5px
    note-vs-senior-band overlap on CFC (the arc's baseline icons overhang the 320px stage
    box; clearance was always ~0.5px and the trims exposed it — fixed by lifting the arc,
    `majorityDims` cy H-26 -> H-32, not by re-padding).
  * `visual.html?hover=` + `shoot.mjs` default `--at 1500` races the scripted hover (~2000ms
    after load) — screenshot BEFORE the hover applies. Use `--at 2800+` for hover shots.
- **Continuation (same day): full-height pane, adaptive arc, small-bench buffers** — see the
  Phase-4 checklist item above. Notable: the new `visual.html?c2=<district>` param (select a
  district after drill, `--at 6000`) exposed a real long-standing **concurrent double-mount**
  bug the moment a drilled selector was screenshotted in a real browser — jsdom's timing
  never interleaved the two mounts, so smoke could not see it. Checklist item has the fix.

### 2026-07-17 (y) — "mobile" freeze -> the freeze family's true root cause (morph-layer labels)
- **Operator report:** freezes while testing the mobile layout (devtools device toolbar +
  manual window resizing); desktop unaffected. Three new traces in `traces/` — same signature
  as (t): total silence + mouse still streaming; no completed task >300ms anywhere.
- **Environment lesson first (cost ~an hour):** headed freeze-hunt runs are INVALID while the
  operator uses the machine — the test window gets occluded and Wayland stops its vsync, so
  rAF sits at 1 and the run silently measures an idle page. Chrome flags don't override
  Wayland frame callbacks; `--ozone-platform=x11` helped only partially. **Resolution:
  `--headless=new` with the GPU left ON reproduces the compositor spin perfectly** (the (t)
  belief that headed was required was wrong — the old headless runs failed because of
  `--disable-gpu` and no mouse storm, not headlessness). freeze-hunt now supports
  `--headless`, `--emulate WxH` (viewport/media queries) and `--resize LOWxHIGH:MS`.
- **Second measurement lesson:** the compositor can spin while the MAIN thread stays
  responsive — eval-based probes report "clean" in that half-frozen state (rAF stalls, no
  frames, screenshots hang). Several early "mobile vs desktop" verdicts were revised once
  rAF-progression + screenshot-completion became the freeze criterion. Match the probe to
  the thread you suspect.
- **The chase, compressed:** area-matched runs said "mobile layout freezes, desktop doesn't"
  (380 hard vs 700 clean) — then 660px DESKTOP layout froze too, breaking the layout theory;
  a width sweep found rAF flatlining at 660/700 with NO storm; shoot.mjs (which surfaces page
  errors) revealed the screenshot HANGS there: **a single drill, zero input, spins the
  compositor deterministically at 680-700px** (band moves per circuit). That determinism made
  bisection trivial (visual.html gained a `css=` inject param): morph-layer seat-block clones
  -> the LABELS specifically. A minimal synthetic page (huge viewBox + aspect interpolation,
  one path — `tests/minimal-spin.html`) does NOT reproduce: the text-in-scaled-group content
  is required, consistent with a text-raster/glyph pathology, not geometry volume.
- **Fix + verification:** `.ctt-morph-layer .ctt-block-label { display: none }` (+ smoke
  guard, 192/192). 690px single-drill fixed; 660-720 sweep clean; mobile 380 + 500Hz storm
  clean; desktop maximized + 500Hz clean; browser-checks pass. Labels are absent only during
  the morph itself — if the operator notices the pop, alternatives (fading them out first
  frame, or baking labels at fixed scale) can be explored, but plain hiding is the smallest
  correct change.
- **(t) reframed, for the record:** the commit cap stays (it reduced how often the morph's
  viewBox writes could land the label scale in the pathological band, which is why it helped
  so much at 144Hz) — but the label bomb was the root cause of the whole freeze family. This
  is also a genuinely reportable Chromium bug: deterministic single-interaction repro,
  `tests/freeze-hunt.mjs --headless --emulate 690x760` + `visual.html?c=ca8&drill=1`.

### 2026-07-17 (x) — hover border flicker fixed; GPU "ratchet" root-caused and closed
- **Operator confirmed the (t) freeze fix held through extended use.** Two asks this session:
  the new map-wide border flicker on hover, and a real answer on the GPU memory ratchet.
- **Flicker.** Reproduced with a new screencast harness (`tests/flicker-check.mjs`) before
  touching code: every hover on/off produced a DOUBLE pulse of map-wide pixel changes (~1.5%
  of all pixels, including regions nowhere near the hovered shape) at exactly the start and
  end of the seat squares' 90ms `transition: transform` — and between the pulses the map sat
  in a shifted-AA state, which is what the eye reads as tremble. With the transition disabled,
  changes collapsed to the hovered court only. Mechanism: SVG rects can't run transform
  animations on the compositor (`compositeFailed: 1024`, known from (t)); Chrome's promotion
  attempt at CSS-animation boundaries re-renders hairline strokes map-wide — the same AA-shift
  family session (i) hit with `will-change`. **Fix:** dropped the CSS transition and the CSS
  scale rules; `animateBlockScale()` now eases the operator-tuned 1.17/1.24 scales with
  per-frame inline transforms (plain style writes create no Animation object → repaints stay
  local). Verified in national AND drilled views: changed pixels confined to the hovered
  court's ~150px box, ease intact. `smoke.mjs` **191/191** (scale-cap assertion now reads the
  JS constants; new guard: no transition may return to `.ctt-sq`), browser-checks **8/8**.
  (One false alarm: browser-checks "failed" mid-session only because flicker-check's exit had
  killed the shared :8777 server — it spawns/kills its own when none is running.)
- **GPU ratchet — answered, no fix needed.** Instrumented with memory-infra dumps
  (`tests/gpu-ratchet.mjs`) + per-process `nvidia-smi pmon` fb:
  * **Chrome's own accounting never sees the growth** — its GPU allocators stay small and flat
    (Skia cache ~20MB, shared images ~23MB, transfer cache ~9MB) while the GPU process's fb
    climbs 68 → ~450MB over 20 cycles. The accumulation is VRAM behind objects Chrome already
    FREED (whole-map textures churned per drill), sitting in the NVIDIA driver's deferred-
    reclamation pools. Nothing app-side or Chrome-side holds it.
  * **It is released, three ways, all observed:** partial reclaims during activity (sawtooth;
    at 552MB a large one fired mid-spam and dropped it to 434MB — the band is bounded
    ~390-550MB even under 50 rapid cycles); ~10s of true idle settles to a warm-cache plateau
    (~280-320MB = budgeted Skia + decoded judge photos; matches the operator's old "resets
    after ~10s idle, in portions" observation); tab-backgrounding purges to near baseline.
  * **Why it looks like a ratchet:** every release trigger is idle- or pressure-driven, and
    during continuous interaction the GPU is never idle and an 8GB card feels no pressure —
    so within a spam session it only climbs. It was a co-symptom of the (t) freeze's churn,
    never the mechanism.
- New tools kept: `tests/flicker-check.mjs`, `tests/gpu-ratchet.mjs` (documented in the
  tooling list above). Large capture artifacts live in /tmp (`gpu-ratchet-trace.json` 640MB)
  and the session scratchpad; nothing checked into the repo.
- **"Black PNG" from shoot.mjs — diagnosed, tool fixed (same day).** Operator ran the mobile
  screenshot command with nothing serving :8777; shoot.mjs happily screenshotted Chrome's
  `ERR_CONNECTION_REFUSED` page, which renders NEAR-BLACK on a dark-themed system — reading
  as "visual.html is broken" when the page was fine. Per the (k) precedent, the tool now
  fails loudly instead: explicit `Page.navigate` + errorText check (refuses to shoot, names
  the missing server), and a widget-mount poll (`.ctt-header` — an element the widget
  CREATES; the static host div fooled the first version, and a single check raced the
  dynamic-import mount, so it polls). Verified all three modes: happy exit 0, no-server
  exit 1 no file, file:// exit 1 + WARNING with the evidence shot still written. The mobile
  command in the header block now includes the serve-first prerequisite.
- **Second operator follow-up, same tool: `?w=380` is NOT the mobile layout.** The widget's
  mobile switch is a VIEWPORT media query (`max-width: 640px`); `w=` only narrows the
  container, so the shot showed a squeezed desktop layout (no top-bar selector). Correct
  command is `--size 380x760` (shoot.mjs feeds it to Emulation.setDeviceMetricsOverride, so
  media queries fire) — verified: top-bar selector chips + full-width pane sheet render.
  `visual.html`'s `w=` doc corrected (it remains useful for the narrow-column-embed case,
  which is a different thing from mobile).

### 2026-07-17 (w) — SESSION CLOSE
- **State:** repo fully reproducible offline end to end —
  `collect_courtlistener.py --no-net` → `enrich_wikipedia.py --no-net` → `build_assets.py` →
  `check_geometry.py` (PASS/0) → `tests/smoke.mjs` (**190/190**) → `tests/browser-checks.mjs`
  (**8/8**, needs a local `http.server 8777` + headed-capable Chrome) all ran clean as the last
  action of this session. 1,481 judges, 1,116 licensed photos, 115 fedsoc / 3 acs hedged. No
  known blockers. `data_verified` still uniformly `false` everywhere (by design — human step).
- **What this session actually was, in order:** what started as "the CFC roster looks thin,
  let's collect it" (session (u)) turned into (1) a full audit of why, which uncovered
  CourtListener being unreliable as a roster source for *four* courts, not one; (2) session (v):
  replacing (u)'s one-off manual pull with real, re-runnable pipeline code for all four, plus a
  Wikidata-based enrichment bridge for the same four, plus (along the way) a genuine caching bug
  in `enrich_wikipedia.py` unrelated to anything asked for but blocking the bridge from working;
  (3) a UX correction thread once the operator started actually looking at the rendered panes —
  a factually wrong "district courts never sit en banc" claim, a missing "years remaining"
  display, an unhandled holdover status, then court-type-specific note wording (5 variants,
  each independently statute-checked), which in turn surfaced a real icon-overflow layout bug
  once the notes became visible enough to collide with things; (4) two rounds of the operator
  looking at the live result and sending back precise corrections (which courts actually needed
  the taller pane, which shouldn't show their note in timeline view, exact replacement text,
  a pane-height trim from +50px to +17px to +15px). **Every phase surfaced something the
  previous phase hadn't anticipated — this is the shape a "let's collect it" request took once
  actually followed to the bottom, not scope creep for its own sake.** Full technical detail
  lives in (u) and (v) below and in `docs/DATA_SOURCES.md`'s dated entries; this entry is the
  index, not a replacement for them.
- **Lessons worth carrying into the next session, stated plainly rather than left implicit:**
  - **A "collect the missing data" request is worth root-causing before patching.** The original
    ask could have been satisfied by hand-typing 21 rows (which is what (u) did) — but the
    operator explicitly asked for that to be redone as reusable code, which is what actually
    surfaced that CourtListener's live API (not just our cache) was wrong for a second court
    (`vid`) that looked fine until checked directly.
  - **Empirical checks beat assumption every time this session tried it.** Hitting CL's live API
    directly (not trusting the cache), verifying every statute citation against Cornell LII
    before writing UI copy (28 U.S.C. §172, §174, §178, §255, §797(b), 48 U.S.C. §1424b/§1614),
    and checking the Fordham Law Review article the operator pointed to rather than defending
    the original "never" claim — every one of these changed the output, not just confirmed it.
  - **A real bug (the icon/note overlap) was found only because the operator asked for visual
    verification, not because it was anticipated.** jsdom-based `smoke.mjs` structurally cannot
    catch layout bugs (every box measures 0 there) — this is the same lesson the project
    recorded before (browser-checks.mjs's own header comment), re-learned the same way.
  - **Global widget state (`S.majorityMode`) persisting across test-file sections caused two
    false starts** when re-testing the toggle-gated note behavior — a same-file regression test
    inherits whatever state an earlier, unrelated block left behind unless it resets explicitly.
  - **When an estimate is explicitly given as a guess ("probably X should do it"), verify it,
    but don't feel obligated to "improve" it further once it visually checks out** — the +17px
    guess left a small (~13px) technical overflow at an unusually narrow width with no visible
    defect, and that was reported rather than silently padded upward "to be safe."

### 2026-07-16 (v) — systematic pipelines for uscfc + gud/nmid/vid; enrichment bridge; UI fixes
- **Operator ask:** turn last session's (u) one-off manual `uscfc` pull into reusable pipeline
  code, extend it to `gud`/`nmid`/`vid`, and fold in the previously-proposed enrichment-join —
  "start on this data repair first."
- **Verified empirically before building anything:** hit CourtListener's live API directly (no
  token needed) for all four courts. `uscfc`'s live data matched the same stale/incomplete cache
  (confirms it's CL's actual database, not our cache). `vid`'s live data was ALSO wrong — missed
  Evan Rikhye's May 2026 confirmation entirely, and Wilma Lewis (shown active in our data) had
  already gone senior in Feb 2025. `gud`/`nmid` rosters matched.
- **`uscfc`: real scraper, not manual research.** FJC's separate "History of the Federal
  Judiciary" product (not its Article-III-only bulk CSV) covers CFC with a roster+succession
  page and one page per judge, verified plain-HTML/regex-parseable. Built
  `fjc_cfc_listing()`/`fjc_cfc_bio()`/`fjc_cfc_active_senior()` in `collect_courtlistener.py`.
  Regex traps hit and fixed: a middle-initial period ("Edward J. Damich") broke naive
  sentence-end matching; `<br>`-joined (not comma-joined) education entries let a flattened-text
  regex swallow a prior entry's year as part of the next school name; Horn's page has two
  appointment blocks (1986 + 2003 reappointment) — needed `finditer` + last-match, not `search`.
  Verified: all 21 current judges parse cleanly, zero manual overrides needed, exact match to
  (u)'s hand-researched roster.
- **`gud`/`nmid`/`vid`: no systematic source exists (checked directly)** — three different,
  inconsistent small page layouts, not worth bespoke scrapers for 4 judgeships total. Built the
  "necessary fallback" the operator pre-approved: `data/cache/territorial_judges_manual.csv`
  (cited, dated, drift-checked against each court's live page every run) +
  `docs/TERRITORIAL_EXTRACTION_PROMPT.md` (a reusable prompt for the next refresh, since there's
  no scraper to re-run and — checked — no legal/FJC-mandated update cadence to schedule against).
  Corrected real, live data: `vid` now 2 active (Molloy chief, Rikhye new) + 0 senior currently
  featured (was showing only Lewis, now senior and off the court's own roster page); `nmid`'s
  Manglona updated to her 2024 reappointment term; `gud`'s Tydingco-Gatewood confirmed as a
  **genuine ongoing holdover** (48 U.S.C. §1424b, term expired 2016, no successor since).
- **UI fixes** (`embed/court-tracker.js`): holdover is now derived + displayed (`isHoldover()`,
  scoped to plain `fixed_term` only — checked 28 U.S.C. §172, CFC's term statute has NO holdover
  clause, so `fixed_term_senior` must not get this treatment); "years remaining" was documented
  in `CLAUDE.md` but never actually rendered — added; a standing (non-toggle-gated) holdover
  explainer now shows on territorial court panes, as separate lines per the operator's formatting
  ask, not one paragraph; the majority-note's "district courts never sit en banc" framing was
  corrected (operator caught this) against Bruhl, *District Courts En Banc*, 90 Fordham L. Rev.
  1469 (2022) — rare (~140 historical instances) but real, reworded rather than overstating
  impossibility. `tests/smoke.mjs` **168 → 175**, all passing.
- **Enrichment bridge**, `enrich_wikipedia.py`: tested all 24 affected judges directly against
  Wikidata before building anything — 21/21 CFC judges have an item AND carry `P12000` (gateable,
  reuses the existing pipeline almost as-is); the 3 territorial judges tested have items with
  photos but no `P12000` (consistent with FJC not covering those courts). Added
  `wikidata_bridge()`: resolves by name (2 name-form variants tried) instead of by FJC nid,
  gated on `P12000` where it can apply and on a "judge" description match where it can't.
  Produces the same shape the existing nid-join does, so every downstream step (license-gating,
  the four-rule hedged FedSoc/ACS scan) runs unchanged. Result: +22 photos, +4 FedSoc.
- **Found and fixed a real, pre-existing caching bug along the way** (not self-inflicted, just
  self-discovered): `fetch_imageinfo`/`scan_articles` cached their batched API calls under a
  **positional** key (`img_0015`, `wt_0003`, …). Adding 22 new files shifted every later batch's
  alphabetical window, so the positional cache silently served an OLD batch's content at the same
  index — confirmed directly (`img_0015.json` held a completely different judge's data after the
  bridge ran). Fixed by hashing each batch's actual content into its cache key. Cleared the
  now-orphaned old cache files and re-ran clean: 1094→1116 photos, 111→115 fedsoc, with the
  original 1459 judges' counts unchanged (confirms the fix was surgical, not a regression).
- **Housekeeping:** with CL's live API no longer used anywhere in `collect_courtlistener.py`,
  removed ~90 lines of now-fully-dead code (`cl_get`, `cl_positions`, `resolve_president`,
  `cl_pick_aba`, `cl_jd`, the old CL-based `fixed_term_rows()`, plus the now-unused
  `COURTLISTENER_TOKEN` requirement in `main()`).
- **Caught + fixed a real regression of my own the same day**, before it shipped: the CL
  bulk-people join for `cl_person_id`/`cl_profile_url` only ever looped over `fjc_rows`
  (life-tenured), never `ft_rows` (now uscfc + territorial) — so all 25 judges on the new
  pipelines silently lost their CourtListener profile link, even the 13 that used to have one
  under the 2026-07-15 manual fix. Fixed by extending the join loop to `fjc_rows + ft_rows`;
  verified 13/25 now correctly re-link (the rest are name-mismatches against CL's bulk table —
  e.g. Solomson vs CL's own "Solomonson" typo — or genuinely absent, not a bug).
- **Later the same day, the operator asked for the pane's text label to be reworked further**
  once they'd seen it live: (1) simplify the plain-district en-banc wording to "the district
  courts do not usually vote en banc"; (2) give Art IV territorial courts (gud/nmid/vid) their
  own label — term length + holdover rule, with the senior-judges and majority-computation
  language removed since neither applies; (3) give CFC (uscfc) its own label — clarify the
  senior judges shown are the active subset, mention the 15-yr active term; (4) check whether
  USCIT (`cit`) really never sits en banc, since the operator wasn't sure, and give it its own
  wording if so. Checked 28 U.S.C. §255 directly: confirmed USCIT has no en banc mechanism but a
  *different* one — the chief judge may designate a three-judge panel for constitutional/
  significant-implications cases — so it needed genuinely distinct wording, not a reuse of
  either the circuit or district text. Reworked `renderPane`'s note logic from a circuit/
  non-circuit binary into 5 court-type-specific branches (circuit / plain district / Art IV
  territorial / CFC / USCIT), moving the territorial courts' content into the always-visible
  standing note (the toggle-gated majority note is dropped there entirely - nothing left to say)
  and giving CFC its own standing note too. Caught a real bug while wiring this up: the standing
  note and the toggle-gated note shared the `.ctt-majority-note` CSS class, which the JS toggle
  also used as its selector - for a territorial court (no toggle-gated note) that selector
  matched the standing note instead and wrongly hid it in timeline view. Fixed by splitting
  shared styling onto a new `.ctt-note` class and renaming the standing-note class to
  `.ctt-standing-note` (no longer just for fixed-term courts). `tests/smoke.mjs` **180/180**
  (was 175, +5 net after rewriting the territorial/CFC assertions and adding a USCIT one).
- **Verified end to end:** full `collect_courtlistener.py` → `enrich_wikipedia.py` →
  `build_assets.py` re-run clean; `tests/smoke.mjs` **188/188**; `check_geometry.py` PASS/0
  (untouched); jsdom probes confirm `uscfc` (16/5), `vid` (2/0), holdover tag + wording on
  Guam, and "years remaining" all render correctly together.
- **Next:** Rikhye's commission/term dates in the territorial CSV are an unverified placeholder
  (his Senate confirmation date, since no oath date has been reported) — needs a follow-up check.
  `vid`'s "0 senior currently featured" call rests on thinner evidence than CFC's clean
  Active/Senior split (an absent nav-menu entry, not an explicit list) — worth re-confirming via
  `docs/TERRITORIAL_EXTRACTION_PROMPT.md` sooner rather than later. **Known remaining data gaps
  on the 25 uscfc/territorial rows** (asked about directly by the operator 2026-07-16, answered
  from the data rather than left implicit): `aba_rating` and `seat_id` were never sourced for any
  of the 25 — neither FJC's CFC pages nor the territorial sources carry them, and no fallback was
  built this session; `cl_person_id`/`cl_profile_url` are populated for only 13/25 (name-matched
  against CL's bulk table — misses are either genuine name mismatches, e.g. CL's own
  "Solomonson" typo vs the corrected "Solomson," or judges CL's bulk table doesn't have at all,
  not a bug); 3 judges (Tapp, Dietz, Rikhye) have no Wikidata photo available at all, not a
  license rejection. Phase 4's original remaining items (mobile pass, accessibility,
  offline/archive, final QA) are otherwise unchanged.
- **Third pass, same day: operator gave exact replacement text and consolidated the note
  architecture further** — uscfc/cit/gud/nmid/vid all collapse to ONE always-visible italicized
  note (no more separate toggle-gated note + non-italic standing note); circuits/plain districts
  unchanged. Verified the operator's `28 U.S.C. §797(b)` citation directly (real, and a better
  fit than §178 for the specific "only active senior judges shown" claim). This exposed a real,
  previously-invisible bug: `.ctt-judge-stage`'s height was a flat 220/320px regardless of judge
  count, and `layoutTimeline()` places icons `position: absolute` without ever checking that
  height — CFC's 21 judges (4 rows at typical widths) silently overflowed the box uncontained,
  which only became visible once an always-shown note started rendering directly below and the
  4th row drew on top of it. Confirmed by screenshot at 700px width before touching any code —
  the operator explicitly asked for this to be visually tested, not just reasoned about. Fixed
  properly (`timelineStageHeight()` mirrors the real row math, sizes the stage before any icon is
  placed) rather than papered over with more padding. Also added a `ctt-pane--tall` modifier,
  applied once per drill-in **context** (not per court) for the three contexts that contain a
  note-bearing court (`cafc` feeders, `ca9`, `ca3`), so switching between a note-bearing and
  plain court within the same drilled-in view never itself resizes the pane. New
  `tests/browser-checks.mjs` assertions (real Chrome, since jsdom measures every box as 0):
  note never overlaps the last icon row, no scrollbar in either mode, tallness set per context.
  `tests/smoke.mjs` **188/188**, `tests/browser-checks.mjs` **8/8** (both were previously missing
  layout-measurement coverage entirely). Full detail: `docs/DATA_SOURCES.md`'s "third pass" entry.
- **Fourth pass, same day: operator corrections after seeing the third pass live.** (1)
  `gud`/`nmid`/`vid` never needed the taller pane (their note fits one line at desktop widths) -
  `TALL_PANE_CONTEXTS` shrank to just `{cafc}`. (2) cit/uscfc's note shouldn't show in timeline
  view at all - moved back to the toggle-gated slot (majority-mode only), same as circuit/plain
  district; only the territorial courts stay always-visible now. (3) `+50px` was too much once
  cit/uscfc stopped needing timeline-mode room for it - trimmed to `+17px`, then `+15px` after
  further review (~1/3, as guessed),
  reverified at 900-1180px (clean) and 750px (a technical ~13px overflow remains but nothing
  visibly clips). (4) USCIT's note gained "Senior judges are supernumerary." Moving cit/uscfc's
  note back to toggle-gated surfaced a test-ordering issue, not a widget bug:
  `S.majorityMode` is global state that persisted `true` from an unrelated earlier test, so
  "hidden in timeline view" assertions needed an explicit Timeline click first to test what they
  claimed. `tests/smoke.mjs` **190/190**, `tests/browser-checks.mjs` **8/8** (reworked to check
  the timeline-mode stage sizing on its own merits, and the note-overlap risk in majority mode
  where it now actually lives). Full detail: `docs/DATA_SOURCES.md`'s "fourth pass" entry.

### 2026-07-15 (u) — CFC (`uscfc`) roster was stale; re-collected + new `fixed_term_senior` tenure type
- **Operator report:** only 3 of ~24 CFC rows in `data/judges.csv` had appointment/senior/JD data;
  asked what went wrong in collection and to fix it.
- **Diagnosis:** `collect_courtlistener.py`'s CL-based fallback for FJC-omitted courts uses "no
  recorded `date_termination`" as its is-current test. For CFC, CL's position data is stale: 13
  rows were judges who had actually left the court (never got a termination date recorded, so read
  as active) — hence "names but no other fields," since CL's `person` sub-objects for these
  older/departed entries are also thin (no appointer link, empty educations/aba_ratings). Separately,
  10 real sitting judges were missing entirely (not in CL's cached data), and 5 more were
  mislabeled active when the court's own site lists them senior.
- **Real fix:** FJC does cover CFC — just via individual bio pages
  (`fjc.gov/history/courts/us-court-federal-claims-<name>`), not the bulk Article-III-only CSV this
  project caches. Rebuilt all 21 current `uscfc` rows (16 active + 5 senior) from those pages,
  cross-checked against `uscfc.uscourts.gov/judges`. Also fixed two latent errors surfaced along
  the way: "Solomonson" → "Solomson" (CourtListener's own spelling was wrong) and a truncated JD
  school for Tapp ("Brandeis University" → University of Louisville *Brandeis* School of Law).
  Full detail + every citation: `docs/DATA_SOURCES.md`'s 2026-07-15 entry.
- **Schema fix, not just data:** the corrected senior rows tripped `build_assets.py`'s validator,
  which assumed every fixed-term court has no senior status. True for the territorial courts, false
  for CFC (28 U.S.C. §178: CFC senior status is real and — like a life-tenured court's — frees the
  active seat, while active judges still serve a genuine 15-yr term unlike a life-tenured judge).
  Added `tenure_type = fixed_term_senior`, used only by `uscfc`; updated the validator, `courts.csv`,
  `docs/CODEBOOK.md` (which also now documents the presidentially-designated chief judge, §171, and
  the no-panels/no-en-banc single-judge structure, §174 — both checked per the operator's ask), and
  `CLAUDE.md`'s tenure-model section (its old "fixed_term courts... no senior status" line was
  simply wrong for CFC). One line changed in `court-tracker.js` (detail panel: a senior CFC judge
  now shows "On the bench: X" instead of a stale-looking "expires" date); the bench-count meta text
  and majority-toggle math needed no change (already generic over `status`).
- **Verified:** `build_assets.py` clean, `tests/smoke.mjs` **168/168**, `check_geometry.py` PASS/0
  warnings (untouched), and a targeted jsdom probe confirms the CFC pane reads "16 authorized · 16
  active · 5 senior · 0 vacant" with correct per-status detail-panel phrasing for both an active and
  a senior judge.
- **Next:** `gud`/`nmid`/`vid` (the territorial fixed-term courts) were not re-collected this way and
  may have the same CL-staleness risk, just less visible (1-2 judges each). Worth the same
  FJC-direct check in a future session — first confirm whether FJC separately covers those Art. IV
  courts the way it turned out to cover CFC (Art. I); unconfirmed either way.

### 2026-07-15 (t) — FREEZE REOPENED by operator; true root cause found and fixed
- **Operator report:** the freeze is back (was never actually fixed); CPU thread pinned at 100%,
  page halts indefinitely; memory correlation now unclear. They supplied three DevTools traces in
  `traces/` captured around freezes (by stopping the recording just after onset).
- **What the traces showed (analysis scripts were session-scratch; method matters more):**
  * A freeze appears in a trace as **SILENCE** — a stuck task only emits its `X` event at
    completion, so during the freeze every Chrome thread looks idle while the browser process
    still logs `InputLatency::MouseMove` at 400-700 per half-second (operator's ~1000Hz mouse).
    That signature (mouse flowing, zero frames presented, zero renderer events) bounded each
    freeze precisely. NOTHING in any trace exceeded 300ms — so no traced thread was mid-task.
  * Pre-freeze, every burst showed: GPU-process main ~100% busy, ~3,000 RasterTasks/s,
    ~4,500 UpdateLayers/s, ~729 distinct compositor layer ids churned in 8s (born in batches
    per drill, dying next cycle), ~60/s CSS transform-transitions on `.ctt-sq` all failing to
    composite (`compositeFailed: 1024` — SVG rects can't), GPU `used_bytes` ratcheting
    monotonically 12.9 -> 60.9MB in 8s.
- **Live reproduction nailed the thread** (`tests/freeze-hunt.mjs`, headed + real GPU + mouse
  storm — the two ingredients every previous headless repro lacked): renderer **Compositor
  thread at 96-100%, pure usermode** (`utime` climbing at exactly 100 jiffies/s, `stime` frozen,
  voluntary context switches frozen ⇒ one never-yielding task), indefinitely (2+ min observed).
  Operator confirmed mid-session that these reproduced freezes look identical to the real bug.
- **Bisection (each a full run in the worst-known config, maximized + 500Hz):** square
  transitions off → froze; hover transforms off → froze; ALL `pointer-events` off → froze;
  overlay/tooltip off → froze; `display:none`→`visibility:hidden`/`opacity:0` idle layers →
  froze; every per-frame morph write disabled individually (d/viewBox/aspect-ratio/fades) →
  froze; ALL HTML transitions off → froze; **mouse storm off → NEVER froze**; storm-only w/o
  navigation → never froze; pick-without-drill → never froze; `prefers-reduced-motion` (no morph
  animation, layer swaps kept) → only brief recoverable stalls. ⇒ necessary pair = **drill morph
  commits + high-rate input**; severity scales with window area and input rate.
- **cc-instrumented capture across a recoverable freeze** (`tests/freeze-trace.mjs`, small
  window): the stall is ONE task — `ScheduleBeginImplFrameDeadline` -> `ProxyImpl::
  ScheduledActionDraw` -> `LayerTreeHostImpl::PrepareToDraw` -> **`CalculateRenderPasses`,
  3.65s** (render_surface_list_size 2, missing tiles 0 — healthy-looking args), with 1,528
  queued mouse EventLatency records inside it and 13 impl-side KeyframeModels starting mid-draw.
  The onset is a CLIFF: draws are ~0ms at 144Hz right up to one 925ms draw, preceded within
  400ms by 1,479 new `cc::Tile`s + 1,072 raster tasks + 723 `PictureLayer::PushPropertiesTo`,
  then the main thread blocks 1.85s in `LayerTreeHost::WaitForCommitCompletion`. A
  commit->draw convoy that never drains at full window size.
- **FIX: `MORPH_MIN_COMMIT_MS = 16`** in `runMorph` — skip vsync ticks (zero DOM writes) until
  16ms since the last committed frame; final frame always commits (end state exact); frozen-clock
  harness (`visual.html?t=`) still renders its one frame. On the operator's 144Hz display this
  halves-to-thirds the morph's commit rate; on 60Hz it is a no-op. **Verified:** maximized+500Hz
  went from hard-freeze-at-cycle-0 (5/5 runs) to 0 freezes in 40 cycles; smoke 168/168,
  browser-checks pass, stress clean. Residual: under a 1000Hz synthetic full-map sweep, ~1 brief
  (~4s) recoverable stall per ~80 cycles remains, cap-value-independent (16/24/32ms all within
  noise) and reproducible with the morph animation entirely disabled — i.e. Chrome's input/commit
  pipeline itself; candidate for a Chromium bug report with `freeze-hunt.mjs` as reproducer.
- **Things learned the hard way, recorded so they stay learned:**
  * A DevTools trace **cannot show a stuck task** — events flush at completion. Silence + input
    still arriving IS the freeze signature. (This is why six prior hunts saw nothing.)
  * `/proc/<pid>/task/<tid>/stat` utime/stime + ctx-switch deltas classify a spin (user vs
    kernel vs waiting) with no debugger and no root.
  * Headless + `--disable-gpu` + no-mouse repros were structurally incapable of this bug class.
    Reproduce with the input the human actually generates (1000Hz mouse, 144Hz display).
  * My CDP harness had a bug that silently broke freeze detection: the send-timeout closure
    captured the shared `id` counter (incremented 500x/s by the storm) instead of its own id.
  * `pkill -f <pattern>` kills the shell whose command line contains the pattern — use a
    `[c]haracter-class` pattern to self-exclude.
- **Not addressed (candidates for later):** GPU `used_bytes`/VRAM ratchet (~10MiB per drill
  cycle observed via nvidia-smi, never released within a session; the commit cap likely slows it
  but this was not re-measured); the failed-composite `.ctt-sq` transform transitions still
  main-thread-animate on every block hover/selection (cosmetic-cost only, not the freeze).
- Leftover: ~37 dead `freeze-*-profile-*` Chrome profile dirs in `/tmp` (rm was denied by the
  session sandbox; they clear on reboot). Captured traces: `/tmp/freeze-cc-trace.json` (126MB,
  contains the completed 3.65s stuck draw), `/tmp/freeze-cc-debug-trace.json` (537MB, cc.debug,
  hard-freeze run). Operator's original traces untouched in `traces/`.

### 2026-07-15 (s) — SESSION CLOSE
- **State:** Phases 0-3 done; Phase 4 well advanced. smoke **168/168**, browser-checks pass, stress
  clean, geometry PASS/0 warnings, build idempotent (`372b759666c8`), `assets/geo/` md5 unchanged.
  Repo runnable; no known blockers.
- **This session:** Phase 2 closed (photo + affiliation enrichment); Phase 3 closed (true vertex
  morph on all 12 geographic circuits + verification of the standing `[~]` items); Phase 4 opened
  with the seat-block feature, its tuner, the operator's tuning pass, and the freeze hunt.
- **What cost the most time, and why** (worth internalising, not repeating):
  * **Measuring the wrong thing.** The freeze took six rounds mostly because I watched
    `performance.memory` (JS heap, 5-33MB) while the renderer held ~1GB of native memory. I also
    "tested" opacity:0 layers by frame time (flat) when the cost was memory; and checked seat-block
    sizing with `getBoundingClientRect` (geometry) when the operator was seeing painted pixels.
    **Match the metric to the symptom.**
  * **Tests that cannot fail.** A jsdom assertion on anything measured passes while the browser is
    broken (every box is 0). A synthetic PointerEvent never exercises pointer capture. A stress test
    that settles between cycles stops reproducing an interleaving bug. Each of these gave a green
    tick over a real defect. **Prove a regression test fails against the old code.**
  * **`cmd | tail` reports tail's exit status**, and `2>/dev/null | tail` hid a module dying at
    import. Check exit codes.
- **Operator observations that cracked problems I could not:** "memory resets after ~10s idle, in
  portions" (=> GC, so an allocation-RATE problem, not a leak — redirected the whole hunt); "the
  dotted line covers the black outline" (=> one stroke per rect); "1-leading labels look shifted"
  (=> glyph mass vs ink, which no metrics API reports).

### 2026-07-15 (r) — label optical alignment SOLVED + vacancy dash edge
- **Label alignment — chased down and fixed. It was never a side-bearing problem**, which is why
  two attempts failed. Rasterised each label at 10px and measured ink-left vs the first column of
  substantial ink (the "stem" the eye aligns to):
      8th ink 0.3 / stem 0.8 · DC 0.8 / 0.8 · Fed 0.9 / 0.9   <- ink IS the mass, look fine
      1st 0.6 / stem 2.6 · 10th, 11th same                     <- 2px apart
  "1" puts a thin flag tip at 0.6 and its stem at 2.6, so it READS indented while its box is
  exactly left-aligned. Note Fed (0.9) and DC (0.8) have the LARGEST ink bearings and look correct
  — so aligning by ink (my plan) would have shifted the good ones left and broken them.
  Fix: nudge only `/^1/` labels left by `ONE_NUDGE_EM = 1.4` (~0.14em). An optical judgement — the
  constant is the knob if it wants tuning.
- **Why the two earlier attempts failed, recorded so nobody repeats them:**
  * `getBBox()` on SVG text returns the LAYOUT box, which starts at the advance origin → reports a
    0 bearing for every string, does nothing. It also made the verification lie, since
    `getBoundingClientRect()` measures that same box.
  * canvas `TextMetrics.actualBoundingBoxLeft` **clamps at 0** when the ink starts at or right of
    the alignment point — measured 0 for "1st" AND "8th". It cannot report a positive left bearing.
  * Only rasterising and scanning columns answers this.
- **Vacancy dash edge:** a stroke straddles the box edge, so a filled square's COLOUR stops half a
  stroke inside its box while the vacancy's dash reaches half a stroke outside — the empty seat read
  wider than its neighbours. The vacancy rect is now inset by `VACANCY_INSET_PX = 0.3 + 0.4` (half
  the party stroke + half its own), so the dash's outer edge lands on the colour's outer edge;
  dash thickened 0.6 -> 0.8. Exact at rest, within ~0.2px when hovered (the inset scales with the
  squares' transform while the non-scaling stroke does not). Asserted against both stroke widths.

### 2026-07-15 (q) — block highlight: enlarge the squares (silhouette scrapped)
- Operator scrapped the white-fill/black-outline silhouette and called it: **enlarge the squares
  slightly on hover, edges must not touch**. Implemented with `transform: scale()` +
  `transform-box: fill-box` (origin = each rect's own centre), 90ms ease: **1.17x hover, 1.24x
  selected**; measured 6.5px -> 7.6px -> 8.06px. Cap is **1.30x** (= pitch/edge) where neighbours'
  edges touch — asserted so a future BLOCK_GAP change cannot silently break it.
- **Why this finally works where every colour did not:** it recolours NOTHING. Every previous
  attempt competed for the squares' stroke, which the vacancy owns for its dash — hence the
  clashes. And size reads on any background, including the near-white water under Fed/DC/1st/2nd
  where white had no contrast. Verified on cafc (no geometry, on water).
- **Vacancy footprint:** its stroke was 1px vs the party squares' 0.6px. Strokes are CENTRED on the
  edge, so the heavier one bulged 0.5px out vs 0.3px and the seat read as a bigger box. Matched to
  0.6px (dash tightened to 1.5/1.1) — measured identical 7.6px boxes. Darkness, not thickness,
  distinguishes it. Asserted.
- **(superseded — see (r), solved)** label optical alignment: 1-leading labels ("1st"/"10th"/"11th") sit visually
  right of the others: `text-anchor: start` aligns the ADVANCE ORIGIN and "1" has a large left side
  bearing. Two attempts failed: `getBBox()` returns the LAYOUT box for SVG text (starts at the
  origin -> reports 0 bearing for every string, does nothing) — and it also made my verification
  lie, since `getBoundingClientRect()` measures the same box. Switched to canvas
  `TextMetrics.actualBoundingBoxLeft` (the only API here that reports ink) but it still yields
  x=0.00 for all labels — unresolved, cause not yet found. `alignLabels()` + `LABEL_BEARING` are
  in place but inert.

### 2026-07-14 (p) — block highlight: silhouette under the squares (operator's design)
- Iterating on colour was a dead end and the operator called it: blue -> grey -> black -> white all
  failed somewhere, because **the highlight was competing for the squares' own stroke** — and the
  vacancy square OWNS that stroke for its dash. Any highlight using it either lost (dashed outline)
  or clashed (white squares + black vacancy). White also died on the near-white water where Fed, DC,
  1st and 2nd sit.
- **Operator's design, implemented:** a shape UNDER the squares that fills the gaps between them,
  stops at their outer border, and carries a black square-cornered outline. The squares are no
  longer restyled at all, so red/blue and the vacancy dash are untouched in every state.
  `blockSilhouette()` traces the true histogram/staircase (columns of <=5, non-increasing), never a
  bounding rect. Fill white 0.8 (hover) / solid (selected); stroke black 1.8 / 2.8.
- **Why it reads everywhere:** on the grey map the white fill is the highlight; on near-white water
  the fill blends and the BLACK OUTLINE still defines the block. Verified on cafc (no geometry at
  all, sits on water) — unambiguous with zero fill contrast.
- **Alignment:** every edge sits half a gap outside the squares — the same distance that separates
  two squares — so each square has an identical white margin whether its neighbour is a square or
  the border. Hugging the exact edge (first attempt) made the centred stroke straddle the squares'
  own white stroke: biting into some, leaving slivers at others. Locked with an assertion comparing
  the silhouette's extremes against the squares' extremes ± half-gap.
- `tests/visual.html?hovershape=` now falls back to the seat block, since cafc has no path to hover.

### 2026-07-14 (o) — block highlight reworked: outline not plate, + blocks are hoverable
- **Plate scrapped** (operator: its outline cut through the label). Highlight is now an outline on
  the squares AND the label — the label's white halo turns black, so the text pops instead of being
  crossed. Iterated on the operator's calls: accent blue -> dark grey -> **black** (`#12161c` hover,
  `#000` selected; selection stays heavier, 1.6 vs 1.1).
- **Vacancy squares** keep a DARK outline (`#12161c`/`#000`) — they are nearly white already, so a
  white one would vanish. Their rules must sit AFTER the white ones (same specificity, source order
  decides). Two things had hidden this: (a) their own stroke is already near-black, so the earlier
  black hover changed nothing visibly, and (b) **a rect has ONE stroke, so their `stroke-dasharray`
  chopped the outline into dots** instead of drawing it — the dash is cleared while hovered/selected
  and returns at rest, where the vacancy cue actually matters.
- **Blocks are now first-class map targets** (`.ctt-block-hit`): one invisible buffered rect per
  block covering the squares, the gaps between them AND the label. Without it the pointer fell
  through the gaps onto the map and the hover flickered. Verified with a 100-point grid across
  5 blocks: **500/500 samples hit the block, 0 fell through**.
  They hover/select exactly like their court's shape (same tooltip, same shape outline). This
  matters where the operator flagged it — Fed/2nd/DC/1st sit partly off their own geometry, and
  **cafc has none at all, so its block is now its only map presence** (hover + click -> selects it).
- Tuner: blocks became clickable, which would fire `selectCourt` on every drag, so the tuner now
  swallows block clicks in the capture phase. Verified drag still lands 45/-30, pane stays closed.

### 2026-07-14 (n) — operator tuning landed + two block tweaks
- **Operator tuned 105/107 courts** (13 circuits + 92 districts) and ran `build_assets.py`; anchors
  are live (manifest `5d930c5631df`). Verified: all court_ids valid, all 13 circuit blocks inside
  the viewport, geometry/build/tests green. `gud` + `nmid` deliberately left on shape-centre
  defaults (tiny ca9 insets; each block does land on its own island — checked).
- **Vacancy square** darkened `#6b7480` -> `#39414d` + stroke-width 1 with a tighter dash, so an
  empty seat reads at 6.5px instead of washing out.
- **Blocks now highlight with their court.** Each block carries a `.ctt-block-plate` behind its
  squares: subtle on hover, stronger + accent-outlined on selection. Driven off the SAME targetId
  the map hover/selection already uses, so an inset lights its parent circuit's block (Alaska ->
  9th) by construction. Works for circuits (national) and districts (circuit view).
- The plate is a `<rect>`, which broke every test counting `.ctt-block rect` as a seat — tests now
  count `.ctt-sq`. (They caught it immediately, which is the point.)
- Operator asked for more distinction: plate fill hover **0.16 -> 0.30** and selected
  **0.26 -> 0.45**, and the hover state gained the accent outline the selected state already had
  (selected stroke 1.2 -> 2, so selection still outranks hover).
- **Screenshot trap:** `tests/shoot.mjs` takes its shots BEFORE running `--probe`, so a probe that
  applies hover never appears in the image — my first "hover" screenshot showed no hover at all.
  Added `tests/visual.html?hovershape=<court_id>`, which hovers a shape from inside the page and
  leaves it hovered. Use that for any hover screenshot; do not hover from --probe.

### 2026-07-14 (m) — tuner: district blocks undraggable — the tuner was following the wrong state
- **Actual cause (reproduced):** the tuner derived the current view from ITS OWN dropdown, but the
  widget's selector bar and "View districts" button sit right there and are the natural way to
  navigate — and they never touch that dropdown. Drill in with the widget and the tuner still
  believed "National", so `activeSVG()` handed back the national layer (`display:none` while
  drilled in) and drags computed against the wrong map: **moved 0/0 px**.
  Probe evidence: `tunerDropdownValue: ""` while `widgetView: "circuit", widgetCircuit: "ca8"`.
- **Fix:** the WIDGET is the source of truth (`S.view` / `S.activeCircuit`); the dropdown is just a
  shortcut that drives it, and re-syncs (with the size slider) whenever the view changes by any
  route. Verified all four routes drag exactly 45/-30: national, circuit-via-widget-button,
  back-then-national, circuit-via-tuner-dropdown.
- **Why (l) missed it:** my drag probe only ever drove the tuner's dropdown, so the tuner's view
  and the widget's view never disagreed. The pointer-capture problem fixed in (l) was real, but it
  was not what the operator was hitting. **Lesson: reproduce via the UI the human actually uses,
  not the hook that is easiest to script.**

### 2026-07-14 (l) — tuner drag broke in circuit view (pointer capture vs re-render)
- Operator: in circuit view, pressing a block and moving updates "X tuned" but the block **does not
  move**; national view drags fine.
- **Cause:** `pointerdown` called `blk.setPointerCapture(...)`, and the first `pointermove` called
  `rerender()` — which rebuilds the `.ctt-blocks` group and therefore **destroys the very node
  holding the capture**. A real pointer loses capture mid-drag and the block stops tracking.
- **Why every test said it was fine:** synthetic `PointerEvent`s never exercise capture at all —
  `setPointerCapture` throws on an inactive pointerId — so the headless drag probe passed
  (exactly 60/-40 px) while a human's mouse failed. **Lesson: a synthetic-pointer test cannot
  validate pointer capture.**
- **Fix:** dropped capture entirely. Drag now uses **window** pointermove/pointerup listeners and
  moves the single group with a live `transform`, committing `b.anchor` + one `rerender()` on
  pointerup. Also ~85x less work per mousemove than rebuilding every block.
- Verified end-to-end in both views: drag lands exactly (60/40 national, 60/-40 circuit-local),
  size slider applies (9px), CSV exports `moed,601986,-384081,9.00`.

### 2026-07-14 (k) — tuner failed silently (empty View dropdown)
- Operator: "the view dropdown has no options". The tuner **works** (headless: 13 options, 13
  blocks) — it was failing on HOW it was opened, and dying quietly.
- Reproduced both realistic causes, each giving exactly `viewOptions: 0`:
  **(a) opened via `file://`** — Chrome blocks ES-module imports there, so the script never runs;
  **(b) `python3 -m http.server` started inside `tools/`** — `../embed/court-tracker.js` 404s.
- Fixed the tool, not the symptom: it now **fails loudly** with the specific cause (file:// vs
  wrong server root vs no data vs missing seat_blocks.json). First message wins, so the specific
  diagnosis beats the generic "Failed to fetch module". Verified all three paths.
- **Correct usage: serve the REPO ROOT** — `python3 -m http.server 8777` in the repo root, then
  `http://localhost:8777/tools/tune-seat-blocks.html`.

### 2026-07-14 (j) — FREEZE RESOLVED (operator: memory now stays <200MB); block-size regression fixed
- **Operator confirms the freeze is solved:** footprint now stays **below ~200,000K** while spamming
  (was climbing to ~1,000,000K then freezing). The cause was never a leak — it was allocation
  outrunning reclamation. Three stacked rate cuts did it: (g) morph transparency layers ~95 -> 4,
  (h) idle layers `display:none` instead of `opacity:0` (painted layers 13 -> 1), (i) fade opacity
  off CSS custom properties (RecalcStyle -8.6x, main-thread Task -29%).
- **FIXED — my own regression from (h): circuit-view squares rendered ~2x too small.**
  `renderSeatBlocks` sized squares from `svg.getBoundingClientRect().width`, which returns **0** on
  a `display:none` layer, so it silently fell back to `NOMINAL_MAP_PX` (900) and mis-scaled every
  circuit-local block. Now derived from the CONTAINER (`renderedMapWidth`), reproducing the
  `max-width/max-height` + aspect-ratio letterbox without needing the layer visible. Verified
  **6.5px in both views**.
- **NEW: `tests/browser-checks.mjs`** — assertions that REQUIRE real layout. jsdom reports 0 for
  every box, so anything measured falls back to a nominal value there and a jsdom assertion on it
  **passes while the browser is broken**. That is exactly why the existing "square edge is the same
  fraction of each viewBox" assertion sailed through this bug: both views fell back to the same
  nominal width, so the ratio was trivially 1. Proven both ways: with the bug reintroduced,
  browser-checks FAILS (3.01px vs 6.50px) and smoke still passes.
  **Rule: any assertion about measured size/scale/visibility belongs in browser-checks, not smoke.**

### 2026-07-14 (i) — freeze hunt #6: the morph was repainting the whole map every frame
- Operator: memory **still** accumulates while spamming (though slower), and — importantly —
  "sometimes after cleanup, spamming doesn't accumulate much, then later it can again" (Chrome's
  tile heuristics varying). They asked: **can we trigger the memory cleaner on returning to
  national?** Answer recorded for the next session: **no.** There is no GC API from JS
  (`window.gc()` needs a launch flag) and this is **native renderer memory**, not the JS heap, so
  GC is not what reclaims it. The lever is to stop *producing* the churn. Operator declined the
  `d`-throttle, so that stays off the table.
- **FOUND + FIXED: the fade opacity was driven by a CSS custom property.** `runMorph` set
  `--ctt-morph-t` on the morph layer every frame, with
  `.ctt-morph-fade { opacity: calc(1 - var(--ctt-morph-t)) }`. A custom property **invalidates
  style for the entire subtree**, and a var-driven opacity **cannot be handed to the compositor**
  — so Chrome restyled and REPAINTED all ~106 paths + every seat block, 60 times a second, for the
  whole morph. Opacity is now written straight onto the 4 fade groups from JS.
  **Measured over 10 drill/back cycles: RecalcStyle 0.997s -> 0.116s (8.6x), main-thread Task
  3.057s -> 2.161s (-29%).** Endpoints unchanged: **0/12/40 px** on ca8/ca9/ca1.
- **`will-change: opacity` was tried and REVERTED.** Promoting each fade group to its own
  compositor texture changed stroke antialiasing enough to break the pixel-identical handoff
  (~9–11k px of hairline colour shift on every circuit). The recalc win comes from dropping the
  CSS variable, not from will-change — direct opacity restyles 4 nodes instead of ~106 either way.
- Verified: `tests/smoke.mjs` **153/153** (adds: no CSS-var-driven opacity); stress clean; build +
  geometry PASS; 60fps; md5 unchanged.

### 2026-07-14 (h) — freeze hunt #5: it is NOT a leak, it is an ALLOCATION RATE problem
- **Operator's decisive detail:** after spamming, letting the page **sit ~10s "resets" the memory
  footprint, and it lowers in portions**. That is garbage collection catching up. So **nothing is
  leaking** — allocation simply outruns reclamation while you spam, memory climbs to ~1GB, Chrome
  hits memory pressure, and *that* is the freeze. Growth was also "slower now", consistent with the
  (g) transparency-layer fix cutting the rate.
- **Measured where it allocates.** CDP `HeapProfiler` sampling across 50 spam cycles:
  **0.5 MB total JS allocation** (top site: Float64Array 43%, serialize 12%). The JS heap is
  exonerated outright — the ~1GB is **native renderer memory** (path geometry + raster tiles),
  which is why every JS-side number I watched for three rounds showed nothing.
- **FIX: idle circuit-local layers are now `display:none`, not `opacity:0`.**
  `.ctt-local-layer { opacity: 0 }` still **lays out, paints and RASTERISES**. So every circuit ever
  visited kept a full-map layer's worth of raster tiles alive in native memory, and each morph
  repainted them. **Measured: after visiting 6 circuits, painted layers 7 -> 1** (it scales: 13 -> 1
  once all circuits are visited). I had actually flagged `opacity:0` earlier and *dismissed it on
  the wrong evidence* — I measured FRAME TIME (flat 16.7ms) when the cost is MEMORY.
- Verified no visual regression: morph endpoints **0/12/40 px** on ca8/ca9/ca1; a full drill in+out
  still lands **0 px** vs a pristine national view; 60fps unchanged.
- The crossfade fallback needs the layer displayed before opacity can transition, hence the
  transient `ctt-fading` class.
- **Lesson for the ledger:** for a memory question, measure the *process*, and never with
  `--disable-gpu` (it disables the raster path the memory lives in). `performance.memory` is the
  JS heap only and will happily read 8MB while the renderer holds 1GB.

### 2026-07-14 (g) — freeze hunt #4: operator says it is MEMORY. Two fixes; still unconfirmed.
- **Operator's decisive observation:** each national->circuit->national round trip "adds a little
  bit to the memory footprint", and the page freezes at **~1,000,000K (~1GB)**. They suspect the
  seat blocks (the freeze first appeared right after that feature landed).
- **That reframes everything.** ~1GB + CPU pinned + unresponsive + needs many cycles + a trace too
  big to load = a **GC/allocation death spiral**, not a logic loop. And it explains why I never saw
  it: I was measuring `performance.memory.usedJSHeapSize`, which is **the JS heap only** (5–33MB
  here). SVG/DOM/raster/compositing memory is invisible to it. Lesson: measure the process, not
  the JS heap.
- **FIX (principled, effect UNCONFIRMED): collapsed the morph's transparency layers, ~95 -> 4.**
  Every non-target path carried `opacity: calc(1 - var(--ctt-morph-t))` individually. Opacity < 1
  forces the renderer to composite that element through **its own transparency layer** — an
  offscreen buffer the size of its bounds — so one morph created ~95 of them, several a third of
  the map wide, and the seat-block clones added more. Fading elements now share grouped
  `<g>`s (shapesOut / shapesIn / blocksOut / blocksIn) with the opacity on the group.
  This is strictly less renderer work either way; whether it is THE leak is **not proven**.
- **Paint order turned out to be load-bearing** and the first attempt regressed the handoff
  (2709/6202/12254 px on ca8/ca9/ca1) because the local seat blocks ended up painting UNDER the
  opaque circuit fill. Correct order: outgoing shapes, morphing shapes, incoming shapes, then
  blocks on top. After: handoff back to **0/10/40 px**; **60fps** unchanged (median 16.7ms).
  Residual: t=0 vs the pristine national view went 19px -> **924px (0.18%)** — a **1px hairline on
  shared circuit borders** for the first frame only (grouping changes which of two identical dark
  strokes wins). Verified by eye; judged an acceptable trade.
- **Could NOT reproduce the growth headlessly**, even measuring renderer-process RSS directly and
  with rasterization enabled (`--enable-unsafe-swiftshader` instead of `--disable-gpu`): the Chrome
  tree sat flat at ~1.35–1.4GB across 60 cycles (RSS across 12–14 processes is shared-memory-heavy
  and too noisy to see a per-cycle delta). **Do not trust `--disable-gpu` runs for memory questions.**
- **NEXT: the operator can A/B the seat-block hypothesis in one edit** — comment out the two
  `renderSeatBlocks(...)` call sites (in `mount` and in `ensureLocalLayer`) and see whether the
  per-cycle growth stops. That answers their question directly and costs nothing.
- Verified: `tests/smoke.mjs` **150/150** (adds: fades use GROUPS, no path carries its own opacity);
  stress clean; build + geometry PASS; md5 unchanged.

### 2026-07-14 (f) — freeze hunt #3: fixed the re-drill replay; freeze STILL not reproduced
- Operator reproduces the freeze **quickly by spamming "View districts" -> "Back to national"**, and
  separately reported: re-selecting the circuit while already drilled in and clicking "View
  districts" **replayed the whole morph over the district map already on screen**.
- **FIXED — re-drill replay.** `drillIn` now no-ops (just closes the pane) when
  `S.view === "circuit" && S.activeCircuit === circuitId`. There is nowhere to travel to.
  Regression-tested. This is a real UX bug and was very likely part of the operator's spam recipe.
- **Still could not reproduce the freeze**, now including in-page spam (no CDP round-trip) at gaps
  of 0/5/15/40/80ms x 60 cycles: settles clean every time (layers=2, morph=0), and idle rAF decays
  **[38,0,0,0]** per second afterwards — i.e. one morph finishing, no leaked loop.
- **Operator's DevTools trace stalls on "Loading trace…"** — the trace is enormous, which is itself
  a hint (something emitting a huge volume of events, not one quiet blocked task). Suggested
  lighter captures: the **JavaScript Profiler** panel (small .cpuprofile), a 2–3s Performance
  recording with Screenshots/Memory off, and **Chrome Task Manager (Shift+Esc)** to see whether the
  pinned process is the *Renderer* or the *GPU* process — that one fact halves the search space.
- Verified: `tests/smoke.mjs` **148/148**; stress clean; build + geometry PASS; md5 unchanged.

### 2026-07-14 (e) — freeze hunt #2: found a real race; ROOT CAUSE STILL OPEN
- Phase: 4. Operator reports the drill-in freeze **still happens** after (d) — same symptom (CPU
  pinned, page unresponsive, near the end of the drill-in animation) but needs **many more**
  drill in/outs to trigger. So (d) fixed *a* leak, not *the* cause.
- **FOUND + FIXED — `drillIn` cache race.** `drillIn` is async and the `localSVGCache` check sat on
  the far side of `await fetchText(...)`, so concurrent drills raced the gap and **each injected its
  own full SVG layer**, listeners and all, orphaned but attached. Measured: one triple-click on
  "View districts" left **3 ca8 layers** (nodes 706 vs 564). Now deduped on the in-flight promise
  (`ensureLocalLayer` + `S.localPending`). Regression-tested and **proven to fail on the old code**
  (3 layers vs 1). It is bounded per circuit, so it is probably NOT the freeze on its own — but it
  is real, and it was a confound.
- **Also added:** a watchdog in the morph loop (force-settle past 5x MORPH_MS) so no unforeseen
  state can keep it alive forever. Cheap insurance, not a diagnosis.
- **RULED OUT by measurement, not by argument** (recording these so the next session doesn't
  re-chase them):
  * *Leaked rAF loops* — instrumented every rAF callback: **0/sec when idle** across 200+ fuzz
    cycles. Not multiplying.
  * *Accumulating painted layers* — `.ctt-local-layer` is `opacity:0`, which still paints, so I
    expected cost to grow with circuits visited. Measured frame time with 1→12 layers: flat
    **16.7ms median** throughout. Not it.
  * *Layout thrash from setting `style.aspectRatio` every frame* — Chrome metrics during a morph:
    42 layouts / 0.05s, **0 layouts when idle**. Not thrashing.
  * *DOM/listener leak* — census by category over 40 settled cycles: **flat at 564 nodes**; over 60
    multi-circuit interrupted cycles: flat once the circuit set closes (blocksG 9, block 85, sq 697,
    paths 215). No leak.
  * *A sync infinite loop in the widget* — audited every loop; all bounded (`ringCounts` is guarded,
    `parsePathAbs`' regex always consumes ≥1 char).
- **A measurement mistake I made:** I briefly reported a "genuine node leak" (4854→5966). Wrong —
  the fuzz read `Memory.getDOMCounters.nodes`, which **counts detached nodes awaiting GC**, and I
  compared it against a live-DOM count. That was garbage, not growth.
- **STILL NOT REPRODUCED.** ~300 cycles of scripted + randomised fuzzing (incl. rapid multi-clicks,
  mid-morph interrupts, pane/majority/hover) in headless Chrome: main thread never exceeded **1ms**
  evaluate latency. The trigger involves something my harness does not do.
- **⇒ NEXT SESSION: get a CPU profile before writing more code.** Symptom analysis says the main
  thread is *blocked* (Chrome only calls a page unresponsive when it cannot process input — a busy
  rAF loop would not do that), and there is no unbounded sync loop in the widget, so the block is
  likely below JS (Chrome layout/paint/GC) or in a code path I have not modelled. Ask the operator
  for: DevTools → Performance → Record → reproduce the freeze → stop → export the `.json` profile.
  The sampled main-thread stack names the culprit in one shot. Guessing has now cost two rounds.
- Verified: `tests/smoke.mjs` **145/145**; stress clean; build + geometry PASS; geometry md5 unchanged.
- New tooling: `tests/soak.mjs` (long soak + `--fuzz`; samples idle rAF/sec, DOM counters, heap,
  evaluate latency).

### 2026-07-14 (d) — operator review #2: block sizing revision + the drill-in freeze
- Phase: 4. Four operator reports, all fixed and verified in a real browser.
- **(1) THE FREEZE (100% CPU, page unresponsive near the end of the drill-in animation).**
  Reproduced with a new real-browser stress driver (`tests/stress.mjs`) that mashes drill-in/back
  with three interleavings. **Root cause:** each circuit caches one morph-layer node. When a
  drill-OUT morph is interrupted by a drill-IN of a *different* circuit, the first circuit's layer
  — a whole **~43k-vertex map** — is left attached with nothing to remove it (the cancelled caller
  returns early by design; the new caller only removes its own). They pile up until every later
  morph repaints several dead maps per frame. Baseline measurement: **3 layers stranded, peak 11
  SVG layers, 154 block nodes**. Fixed by sweeping stale layers in `attachMorphLayer`; after:
  **0 stranded, 7 layers, 67 blocks**. Also settle the cancelled morph's promise (it otherwise
  suspends its async caller forever) and bound `ringCounts`' reconcile loop, which *can* spin if
  `diff < 0` with every ring at its 1-seat minimum (unreachable today since `kMax <= N`).
- **(2) Square size is now a constant SCREEN size (`BLOCK_PX = 6.5`), not map units.** The national
  and circuit-local projections differ ~4x in scale, so a map-unit edge rendered ~4x larger after a
  drill-in and swamped the districts. Position stays in map units (glued to the court); size is
  converted from px through the SVG's live scale, so a resize re-renders (`refreshSeatBlocks`).
  Measured **6.5px in both views**. `seat_blocks.csv`'s `size` column is now px (CODEBOOK updated);
  the tuner's slider is px (2–16).
- **(3) Circuit labels left-aligned** to the block's left edge (`text-anchor: start`); measured
  delta 0 against the leftmost square.
- **(4) Affiliation ridge no longer shrinks the photo.** The avatar is `border-box`, so bumping the
  band 3px→4px ate the content box. Style-only now; measured marked vs unmarked identical
  (avatar 44 / photo 38 both).
- **Two testing mistakes I made and corrected — worth not repeating:**
  * I "improved" the stress test with a quiescence wait between cycles, which **removed the very
    interleaving that causes the bug** and made it report clean. A test that no longer reproduces
    is worse than no test. It now deliberately does not settle between cycles and judges only at
    the end.
  * My first jsdom regression test drilled the same circuit every time, so it could never strand
    (same cached node just gets re-appended) — it passed against the known-bad code. It now
    alternates ca8/ca9 and **fails against the pre-fix code** (verified both directions).
  * Also: `cmd | tail` reports *tail's* exit status, and `2>/dev/null | tail -1` hides a crash
    entirely (the module died at import, printed nothing, and looked fine). Check exit codes.
- **Which fix is load-bearing** (measured by isolating each): the stale-layer **sweep** fixes it;
  the promise-settle change alone does **not** (still 3 stranded). Both kept, comments corrected to
  say so rather than claiming credit for the wrong one.
- Verified: `tests/smoke.mjs` **144/144** (adds the freeze regression, proven to fail on the old
  code); `tests/stress.mjs` clean; build + geometry PASS; geometry md5 unchanged.
- Next: unchanged — the operator's seat-block tuning pass is still the blocking item.

### 2026-07-14 (c) — operator review: 3 fixes + seat-block map annotation & tuner
- Phase: 4 (feature work on operator feedback). Operator confirmed the site looks/behaves well.
- **(1) Inset selection tint.** Selecting a circuit left its insets untinted — the dissolved circuit
  outline is mainland-only, so AK/HI/GU/NMI/PR/VI are separate paths. `highlightShape` now covers
  `data-inset` children via `data-parent-circuit`, the same rule the hover overlay already used (#1).
- **(2) Affiliation marker.** New segmented `Mark: None | FedSoc | ACS` in the pane, live in BOTH
  timeline and majority views. Implemented as the operator suggested: the party band goes **ridged**
  (dashed, thickened to 4px so it reads at 44px) while the yellow same-president highlight still
  shows underneath (it's a sibling, not a child). Toggling only re-classes nodes — no relayout.
- **(3)** Semicircle guide arcs darkened `#d8dde4` → `#a9b2bd`: a step up, still clearly subordinate
  to the `#444` majority line.
- **(4) SEAT BLOCKS** — one square per authorized judgeship, per court, on the map.
  * Layout verified to reproduce the operator's ASCII sketch **exactly** for n=1..11: seat i sits at
    `(col = floor(i/5), row = i%5)` — columns of 5, top→bottom then left→right.
  * Grouped by colour (R, other, D) with **vacancies last**; dashed vacancy square echoing the pane.
    Excludes seniors / Circuit Justice / chief, per the operator.
  * Circuits render on the national view (labelled `1st`…`11th`, `DC`, `Fed`), districts on their
    circuit-local view (no labels — names too long). `cafc` has no geometry but IS shown, parked
    offshore of the 11th; it is the one court that *must* carry an explicit anchor.
  * **Kept the lazy-load contract**: the national view shows all 13 circuit blocks, so colouring them
    from judge bundles would have forced 13 fetches. Blocks are grouped by colour ⇒ only per-court
    COUNTS are needed ⇒ `build_assets.py` derives `data/seat_blocks.json` (107 courts, counts only).
  * Blocks live in **map units** in a `<g>` outside the Y-flip group (squares survive a mirror; the
    "1st"/"DC" labels would not), so they scale and stay glued to the geometry on any viewport.
  * They crossfade during the morph (national→local), like insets — handoff still **0px**.
  * Over-full courts (moed etc.) grow the block instead of dropping a judge.
- **Tuner: `tools/tune-seat-blocks.html`** — drag to place, size slider, Export CSV. Renders through
  the widget's own `renderSeatBlocks` (via a documented dev-only `_dev` export) so it is WYSIWYG
  rather than a second implementation that could drift. Verified: a 60px/-40px drag moves the block
  exactly 60/-40 (1:1, no drift), and the exported row round-trips CSV → `build_assets.py` → rendered
  position. Untouched courts are omitted on purpose (they default to the largest shape part's centre,
  so a geometry re-export doesn't invalidate them).
- **Non-obvious bug found by measuring**: circuit labels rendered as a ~2px smudge. Not CSS
  inheritance (my first guess, checked and wrong) — browsers **clamp `font-size` at 10000px**, and
  these viewBoxes are millions of units across, so the map-unit font-size was silently clamped.
  Labels now ride a scaled `<g>` with a small font. Worth remembering for any future map text.
- Docs: `CODEBOOK.md` Table D (`seat_blocks.csv`) + a validation rule that `cafc` must have an anchor
  (proved it fires). `data/seat_blocks.csv` currently holds only the `cafc` row — **everything else
  is awaiting the operator's tuning pass**.
- Verified: `tests/smoke.mjs` **136/136**; geometry PASS/0 warnings; morph handoff unchanged at 0px;
  geometry files untouched (md5 unchanged).
- Next: operator tunes block placement + global size in the tuner and hands back `seat_blocks.csv`.
  Then Phase 4 proper (mobile ~380px — note block labels shrink with the map and should be checked
  there; a11y; offline/archive).

### 2026-07-14 (b) — Phase 3 CLOSED: true vertex morph + Phase-3 verification
- Phase: 3 → done; entering Phase 4.
- **Verified the standing `[~]` items first** (they were ticked on thin evidence): all **7** insets
  (akd/hid/prd/gud/nmid/vid + dcd callout) are present and route to the right parent circuit, and the
  **Federal-Circuit feeders** — which had *no* coverage — behave per contract: "View feeders" not
  "View districts", **no** map layer added, selector repopulates with cit+uscfc, CFC opens its pane,
  and USCIT/CFC are absent from the top-level selector. All now asserted.
- **Built the true vertex morph.** Approach + the one non-obvious bit: both SVGs carry their own
  `scale(1,-1)` Y-flip, which fights a shared interpolation, so the morph layer **bakes each file's
  flip into the point data** and runs with no group transform — then u=0 *is* the national layer and
  u=1 *is* the local layer, with the viewBox and the element's **aspect-ratio** interpolating too
  (aspect-ratio drives the letterbox; omitting it jumps at the handoff). Fallback preserved and
  logged. Confirmed structural parity (subpath count + per-subpath vertex counts, not just totals)
  holds for every mainland district *and* every circuit outline before building.
- **Four real bugs found by verifying rather than assuming:**
  1. **Mixed time bases** — `t0` from `performance.now()` but the frame fell back to `Date.now()`
     when rAF passed no timestamp → `t` hit 1 on frame one and the morph silently never animated.
     A browser hides this (both are performance-based); only the test env exposed it. Now one clock.
  2. **Handoff blink** — the morph layer was removed while the local layer was still `opacity:0`
     behind a 420ms fade, blanking the map at the end of *every* drill-in. Measured the counterfactual
     to prove it was real: ink collapsed to 4,725px at the handoff vs ~112,348 steady with the fix.
  3. **Stale selection highlight** (pre-existing, not mine) — `drillOut` nulled `S.selectedCourt` but
     never cleared `.ctt-shape-selected`, so the drilled circuit stayed blue back on the national map.
     `highlightShape`/`deselect` only ever cleared `currentSVG()`, which is the *other* layer by then.
     Fixed with a stack-wide `clearShapeHighlight()`; a full drill in+out is now 0px vs pristine.
  4. **Inset pop** — insets are morph-exempt, but merely fading them out popped the local copies in at
     the handoff (**measured 25,013px / 4.93% of the map on ca9** = AK+HI). Now the national copy
     fades out while the local copy fades in → ca9 handoff delta 25,013px → **10px**.
- Also strengthened `check_geometry.py`: the morph invariant now compares **subpath structure**, not
  just total vertex count — a same-total/different-split export would have passed the old check and
  silently dropped the morph to the fallback. Verified the new rule catches exactly that case
  (in-process; `assets/geo/` is operator-owned and was not touched — md5s unchanged).
- **Tooling** (this is the reusable part): `tests/visual.html` (dev harness; `t=` freezes the morph by
  stubbing `performance.now`) + `tests/shoot.mjs` (CDP screenshot driver on the real clock, no new
  deps — Node's built-in WebSocket). Chrome's `--virtual-time-budget` fires **rAF exactly once**
  (measured), so it cannot observe an animation and quietly reports a mid-flight state as "settled" —
  that's what the CDP driver is for. Don't lose this.
- Verified: `tests/smoke.mjs` **107/107** (stable over repeated runs); geometry PASS/0 warnings; morph
  live on **all 12 geographic circuits** with handoff delta ≤0.05% (cadc correctly declines + logs);
  **60fps** worst-case; reduced-motion skips the animation.
- Next: Phase 4 — mobile ~380px (finally self-serve via the tooling above), a11y, offline/archive
  (judge photos are remote → initials fallback offline), final UX-contract QA.
- Blockers: none. Cosmetic nit still open: majority-arc outer-ring labels sit partly behind icons.

### 2026-07-14 (a) — Phase 2 CLOSED: photo + affiliation enrichment, displayed and verified
- Phase: 2 → done; entering Phase 3. Operator directive: enrich photos **and** affiliations, get them
  displayed and working in the demo (the open photos-only-vs-both question is now answered: **both**).
- Did: Wrote `scripts/enrich_wikipedia.py`. Key decision — **join on an identifier, never on a name**:
  Wikidata **P12000** ("Biographical Directory of Federal Judges numeric ID") == FJC `nid`, recovered
  from the FJC cache with the collector's own `(full_name, commission_date)` key → **1,359/1,483**
  judges linked, and the 124 misses are explainable (fixed-term courts aren't in the FJC directory).
  One SPARQL query pulls all 8,136 FJC-linked items (5,466 with images) and is cached.
  * **Photos: 1,094 judges (74%) + 13/13 Circuit Justices.** License-gated at write time: only
    machine-readably free terms (pd/cc0/cc-by*) get a `photo_url`; 2 unclear ones were rejected to the
    initials fallback. Spot-checked that URLs 200 and are small (2–33 KB "originals" are originals
    only because they're already <320px). Added a **required-attribution credit line** for the 71
    CC-BY(-SA) images (PD images render none) — CLAUDE.md §2 says respect licensing, and displaying
    nothing would have quietly violated CC BY.
  * **Affiliations: 111 fedsoc / 3 acs**, every one with a source URL + basis, rendered hedged.
  * **Circuit Justices** now have photos (they render as judge icons and were showing "?"); required
    3 photo_* columns on `circuit_justices.csv` + build pass-through + a derived `full_name`.
- Auditing the classifier caught **four real false positives**, each fixed by a rule now documented in
  DATA_SOURCES: (1) Guido Calabresi tagged a FedSoc **co-founder** — that's his *son* Steven (relative
  guard); (2) Elizabeth Branch tagged a speaker from a sentence about **James Ho** (subject guard);
  (3) Ralph Erickson tagged from "spoke about his personal struggle with alcoholism" (require the org
  name **in the classified sentence**); (4) plain members mislabeled `advisor` by an unrelated board
  in a ±320-char window (classify the **sentence**, not the window). Also found a **wikitext-parsing
  bug**: `<ref name=x/>` matched the paired-ref alternative, so `.*?</ref>` ate whole paragraphs —
  fixing it recovered ~18 real claims.
- Fixed two **pre-existing bugs** found en route: `circuit_justices.csv` had an unquoted `notes`
  ("…covers 4th, D.C., and Federal.") whose commas spilled into phantom columns and silently truncated
  3 rows' notes — repaired + now properly quoted; and a cache-key collision (`img_*`) that made the
  justice photo lookup return the judges' batch.
- Verified: `tests/smoke.mjs` **68/68** (adds 12 enrichment assertions — photos carry license+source,
  initials fallback survives, affiliation is hedged/sourced/basis'd, CC credit shown, PD credit absent).
  `build_assets.py` now **enforces** `photo_url ⇒ photo_license` (proved it fires by breaking a row).
  **Visually confirmed in a real browser** via headless Chrome: national map, ca8 pane (photos, party
  rings, seniors grayed, chief ★, JS initials fallback), ca9's 51-judge bench, hover detail showing
  "Reported to have a Federalist Society affiliation (member) — source", and the majority arc.
- Next: Phase 3 — verify the `[~]` items (esp. **Federal-Circuit feeders, which have no test coverage**,
  and HI/PR/GU/NMI/VI insets), then build the **true vertex-morph** (parity is proven), then DoD.
- Blockers: none. Nit for the operator's eye: in the majority arc, outer-ring labels (e.g. Hansen/
  Arnold on ca8) sit partly behind the icons in front — pre-existing, cosmetic.
- **Caveat to carry forward:** Wikipedia is the ceiling on affiliation coverage. `fedsoc_reported=false`
  means *unreported*, not *unaffiliated* — the field must never be read as evidence of absence.

### 2026-07-13 (f) — Phase 2 data collection sweep
- Phase: 2. Collected the full sitting-judge dataset. Probed CourtListener v4 (courts/people/positions):
  found its active/senior/chief flags unreliable, so built `scripts/collect_courtlistener.py` around the
  **FJC Biographical Directory** as the authoritative spine (per-court appointment block: current ⇔ no
  Termination Date, senior ⇔ Senior Status Date, chief ⇔ open chief span) + CourtListener for
  `cl_person_id`/profile URL. Hit CL's hard API rate limit (2102s Retry-After) → pivoted the join to
  CL **bulk data** (`people-db-people-2026-06-30`, cached at `data/cache/cl_people.csv`), so the sweep
  runs offline. Fixed the Arkansas code mismatch (our `are`/`arw` == geometry; CL uses `ared`/`arwd` →
  API-only map) and the D.C. Circuit court-name alias. Result: **1,483 judges** (863 active/620 senior),
  all 109 courts, `data_verified=false`. Populated `circuit_justices.csv` (13 circuits, sourced).
  `build_assets.py` validates + builds 13 bundles. Reconciliation recorded in DATA_SOURCES (7 over-full
  courts all explained). Updated `tests/smoke.mjs` to be data-robust — **56/56 pass** on real data.
- Next: (a) OPTIONAL Phase-2 enrichment `enrich_wikipedia.py` (photos + FedSoc/ACS with per-claim
  sources) — large, deferred; tracker works without it. (b) Human verification pass to flip
  `data_verified` and prune fixed-term/over-full courts. (c) Phase 4 mobile/browser QA still open from
  Phase 1. Geometry (Phase 3) already integrated early.
- Blockers: none. CL live API is rate-limited; use the cached bulk data / re-run `--no-net`.

### 2026-07-13 (e) — fourth review pass (#21–#23)
- Phase: 1. #21 majority dotted line re-centred: midpoint now lands on the mean active-ring radius
  (on the semicircle itself for a single ring), with symmetric margins reaching just past the outer/
  inner top icons — shifted up vs. before. #22 "Back to national" moved to the TOP of the selector bar.
  #23 mobile map/pane viewport min-height 380→475px (~25% taller). Verified: `tests/smoke.mjs` **53/53**
  (adds line-midpoint-on-mean-radius and back-button-at-top). #23 is CSS-only (needs the browser pass).

### 2026-07-13 (d) — third review pass (#17–#20)
- Phase: 1. Root-caused #17/#18 to one regression from pass (c): the circuit-outline clones kept
  `data-layer="circuit"`, so the higher-specificity `[data-layer=circuit]` rule beat `.ctt-circuit-outline`
  → clones rendered FILLED with no stroke (hid district borders = #18) while district paths had
  `fill:none` so their interiors didn't catch the cursor (only borders = #17). Fixes: strip `data-layer`
  from the clone so `.ctt-circuit-outline` (fill:none, 2px stroke) applies; give districts `fill:transparent`
  (hittable interior + circuit shading shows through). Normalised inset stroke weight to 2px.
  #19a lowered the majority explainer note; #19b senior ring uses centred spacing (no 180°/0° snap);
  #19c confirmed fold-in recomputes both count and arrangement (seniors join the active rings);
  #19d majority dotted line extent now keyed to the active rings (below inner top-icon → above outer
  top-icon), excluding seniors. #20 clicking a judge PINS the detail panel (pointer-events:auto, close
  ×, survives mouse-out; text-selectable, link clickable) until the × or an off-click dismisses it.
- Verified: `tests/smoke.mjs` **51/51 pass** (adds click-to-pin lifecycle). Operator visual/mobile
  pass still the remaining Phase-1 close-out.

### 2026-07-13 (c) — second review pass (#11–#16)
- Phase: 1. Fixed (Phase 1, all in `court-tracker.js`/`.css`): #11 insets (PR/VI/HI/AK/GU/NMI) are now
  selectable in national view — clicking one selects its parent circuit (via `data-parent-circuit`) —
  and they take the circuit outline colour/fill; #12 circuit boundaries redrawn as stroke-only clones
  ON TOP of district lines so they stay visible; #13 in district (circuit-local) view the circuit
  shape is no longer map-selectable (districts only; circuit still available in the selector bar);
  #14 viewBox padded 3% each side so edge strokes aren't clipped; #15 majority dotted line moved
  BEHIND the icons and lengthened, senior band pushed further out (R2 = R+64) to stop label clipping.
  #16 multi-ring "parliament" layout for large benches: algorithm confirmed with the operator —
  (1) fewest rings so no clipping, (2) seats-per-ring ∝ ring radius so intra-ring spacing is ~equal
  (⇒ outer ≥ inner), (3) order every slot across all rings by ANGLE ("protractor order", ties
  inner-first), (4) fill judges in that order. Seniors stay an outermost band; Justice at centre; up
  to 3 rings as radial room allows. E.g. ca8's 11 seats → 2 rings [5,6]; a 29-seat bench → 2 rings
  [12,17]. Guide arcs drawn per ring.
  Verified: `tests/smoke.mjs` now **47/47 pass** (adds inset-select, outline-clones, non-interactive
  mainland, viewBox pad, local circuit non-selectable, overlay-behind-icons, 2-ring spread + guides).
- Still needs the operator VISUAL/mobile pass for geometry-dependent items (stroke weights, arc
  spacing/spread, corner-flip, ~380px layout) — jsdom does no layout.

### 2026-07-13 (b) — bug-fix pass on reviewer feedback
- Phase: 1. Worked a 10-item review. Fixed (app-side, all Phase 1): #1 circuit hover now outlines
  its insets too (overlay = mainland path + inset districts via `data-parent-circuit`, since the
  dissolved circuit outline is mainland-only); #2 paint order fixed so district borders show
  (districts moved on top of circuit fill), thick circuit / thin district strokes, insets get circuit
  fill behind district borders, national-view districts made pointer-transparent (hover/click fall
  through to circuits; districts remain selectable in circuit-local view); #3 circuit repeated as a
  selectable item in circuit view; #4 stow arrow now re-shows the pane; #5 whole same-president cohort
  highlighted incl. the hovered judge, yellow ring moved to an un-filtered sibling so it isn't grayed,
  seniors only partially desaturated (party still readable); #6 justice lowered to arc centre, majority
  line shortened, senior band pushed out, fold-in now actually moves seniors into the inner arc, faint
  semicircle guide traces added; #7 justice shown as a header chip in timeline / arc centre in majority
  (reparented); #8 detail panel is pointer-events:none (kills flicker; links stay clickable) and flips
  to the corner away from the hovered icon; #9 re-clicking a selected item deselects + hides pane;
  #10a mobile selector expands (no inner scrollbar); #10b always-visible × close button; #10c mobile
  reserves a bottom buffer for the detail panel. Morphing left for Phase 3 (noted; zoom+crossfade
  stands as the documented fallback).
- Verified: `tests/smoke.mjs` expanded to **37/37 assertions pass** (adds inset-hover, deselect-toggle,
  stow re-show, cohort-incl-self, justice placement, circuit-repeat). Build + geometry check + serve OK.
  Still needs the operator VISUAL/mobile pass in a real browser for the geometry-dependent items
  (#6 spacing, #8 corner flip, #2 stroke weights, ~380px layout) — jsdom does no layout.

### 2026-07-13 (a)
- Phase: 1 — app interactivity built against REAL geometry; desktop end-to-end verified.
- Did: (1) Real geometry shipped to `assets/geo/`; wrote `scripts/check_geometry.py` — validates the
  contract incl. the morph vertex-parity invariant: **PASS, 0 warnings** (94 districts + 12 circuit
  outlines, no cafc, insets exempt, all mainland districts parity-matched). `build_assets.py` version
  hash now folds geometry bytes (boundary-only updates bust caches). (2) Found + flagged an export bug:
  8 circuit SVGs (ca1,2,3,4,5,9,10,11) have a malformed Y-flip `translate(0, --N)` (double negative from
  `-{minY+maxY}` when the sum is negative); ca6/ca7/cadc/national fine. Operator fixed ca8; 8 remain.
  Non-blocking — the app **recomputes the Y-flip from each viewBox**, so it renders regardless; still,
  operator should fix the 8 files + the formatting in `qgis_export.py`. (3) Rewrote `court-tracker.js`
  into the full Phase-1 widget: national/circuit views, lazy per-circuit judge+geometry loading, info
  pane, judge-icon layer (rings/seniors/vacancies/chief/Justice), pinned hover detail + same-president
  highlight, animated timeline↔majority-arc, majority math (active default + fold seniors + explainer),
  drill-in (zoom+crossfade) / back, Federal-Circuit feeder repopulation; expanded CSS; mobile CSS.
  (4) Fixed an idempotency bug (re-mount no longer duplicates districts). (5) Added jsdom regression
  test `tests/smoke.mjs` — **28/28 pass**.
- Next: Phase 1 close-out is an operator VISUAL pass in a real browser (Firefox for file://, or
  http.server): confirm the map renders (all circuits + ca8 districts), pane/animation feel, and the
  ~380px mobile layout; then flip the mobile task [~]→[x]. Optional polish: true vertex-morph on
  drill-in (parity is proven, so it's feasible — deferred to Phase 3/4 for visual tuning); wire
  name labels onto shapes where geometrically feasible (currently hover-tooltip only). Then Phase 2
  (CourtListener sweep) to populate all courts; `data/judges/ca8.json` + `moed` stay as the sample
  until replaced.
- Blockers: none. Dev test needs jsdom (`npm i jsdom`); runtime widget stays zero-dependency.

### 2026-07-11
- Phase: 1 (in progress) — sample-data foundation complete.
- Did: Authored REAL, FJC-sourced 8th-Circuit slice data (`scripts/gen_sample_8th.py` → `judges.csv`
  18 rows + `circuit_justices.csv`), covering all Phase-1 tricky cases (senior/vacancy/same-surname
  Smith pair/chief/Circuit Justice/party+ABA mix). Extended `build_assets.py` with codebook validation
  and lazy-loadable per-circuit judge bundles + `circuit_justices.json`. Verified: build validates and
  emits `data/judges/ca8.json` (commission-ordered; ca8 = 7 active/2 senior/4 vacancies of 11; bundles
  moed's 9 judges for drill-in), all assets serve 200. NOTED: geometry-track output has landed staged
  under `data/out/` (real national + ca1–ca11/cadc SVGs, crosswalk, TIGER inputs, qgis_export.py) —
  left untouched (operator-owned); flagged for Phase 3.
- Next (Phase 1 app interactivity — the bulk of the phase, build against placeholder geometry):
  (1) On circuit select, load `manifest.files.judges[ca8]` + `circuit_justices.json`; slide-down info
  pane with stow arrow (already stubbed) + auto-scroll shape into visible sliver.
  (2) Judge-icon layer: face/initials avatar, red/blue ring by `president_party`, senior gray tint,
  vacancy gray-outline seats parked aside, oldest→newest by `commission_date`.
  (3) Icon hover: same-president highlight + single detail box (all fields, hedged affiliation wording).
  (4) Majority semicircle toggle: one seat/authorized judgeship, vacancies in-arc, seniors outer band,
  dotted majority line + x/y (active default + fold-in toggle + explainer), animated sort.
  (5) "View districts" drill-in (morph vs documented zoom fallback) + back; district pane (no Justice).
  (6) Mobile: pane as full-width sheet; usable at ~380px.
  DoD: 8th Circuit fully interactive on desktop + mobile from file://, no console errors.
- Blockers: none. Reminder: Chromium blocks file:// fetch → test in Firefox or via http.server.

### 2026-07-10
- Phase: 0 → complete; entering Phase 1.
- Did: Built the runnable widget scaffold — `index.html` demo host, `embed/court-tracker.js`
  (ES module: builds shell DOM, resolves assets relative to `import.meta.url`, lazy-loads
  manifest→courts.json→national.svg, wires reference-pattern hover overlay + fixed tooltip, graceful
  asset-failure fallback), `embed/court-tracker.css` (all `ctt-` prefixed, fixed 640px height so host
  never reflows, slide-down pane + stow arrow, mobile stacking). Stubbed `scripts/build_assets.py`
  (valid manifest even when CSVs empty; derives `courts.json` + versioned manifest). Added placeholder
  `assets/geo/national.svg` per the geometry contract (8th Circuit has real district ids). Authored
  and FROZE `data/courts.csv` (109 courts) via `scripts/gen_courts_skeleton.py`, with §44/§133
  statutory judgeship counts fetched from Cornell LII; all START_HERE Stage-B freeze checks pass.
  Verified: build runs, manifest/SVG/courts.json valid, all assets serve 200 over http.server.
- Next (Phase 1, first task): hand-author sample rows in `data/judges.csv` + `data/circuit_justices.csv`
  for the 8th Circuit + a couple of its districts, covering the tricky cases (≥1 senior, ≥1 vacancy,
  a same-surname pair for `display_name` disambiguation, and the ca8 Circuit Justice). DECISION NEEDED:
  real sourced 8th-Circuit judges (honors "never fabricate"; needs CourtListener/Wikipedia lookups —
  token cost) vs. clearly-labeled synthetic sample rows (data_verified=false, notes marking them as
  Phase-1 placeholders replaced by the Phase-2 sweep). Recommend real+sourced for a small set. Then
  extend `build_assets.py` to emit per-circuit judges JSON and build the Phase-1 interactivity
  (info-pane content, judge icons, majority arc, drill-in) against the placeholder geometry.
- Blockers: none new. Geometry still placeholder (external QGIS track); expected until Phase 3.
  Could not visually open a browser here (no Node/browser); verified via well-formedness + http.server
  200s + synchronous shell construction. Operator should eyeball `index.html` in Firefox.
