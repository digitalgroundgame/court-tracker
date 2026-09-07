# PROGRESS.md — resumable work ledger

> **Instance protocol.** At session start, read `CLAUDE.md` then this file. Find `CURRENT PHASE`
> and the first unchecked `[ ]` task. Restate them in one line, then work. Before stopping (or when
> near the token budget), check off what you finished, add a dated **Session log** entry, and leave
> the repo runnable. Do not advance a phase until its Definition of Done (`docs/BUILD_SEQUENCE.md`)
> is met. `[x]` done · `[~]` in progress · `[ ]` not started · `[!]` blocked (note why).

**CURRENT PHASE:** Phase 4 — Polish, mobile, resilience — now spanning TWO widgets: the
tracker (Phase-4 tail items open, PLUS a brand-new third pane view — "Change", built session
(aw), operator review round addressed session (ax)) and the appointments beeswarm
(feature-complete first version, operator refinement rounds ongoing; see sessions ai→at, aw).
**Last updated:** 2026-09-07

> **SESSION (cp) cont'd (4), 2026-09-07 — Repo confirmed public (operator: for Pages + a
> branch-protection ruleset); filed the git-history PII scrub as issue #36; fixed issue #3
> (irreplaceable manual data files, PR #37, merged).**
> - **Public-repo discovery**: while reviewing PR #27, `gh api` showed `"private": false` —
> contradicted `CLAUDE.md` §7.6 and every session log entry describing the repo as private, with no
> record of the change. Flagged it rather than assuming; operator confirmed it was intentional
> (2026-09-06/07, for GitHub Pages + implementing a no-direct-commit ruleset on `main`). No CLAUDE.md
> correction needed — §7.6 doesn't actually assert privacy as a load-bearing fact, just names it in
> passing; worth a light correction if it comes up again.
> - **This reopened a question PR #15 had closed**: the personal email left in git history was
> "fine as-is" specifically because the repo was private. Filed **#36** to track a future
> `git filter-repo` pass — deliberately NOT scheduled now (operator: make more progress first). Key
> technical points captured there: a history rewrite can leave `main`'s current tip content
> untouched (the address is already redacted from every tracked file), but changes every commit
> hash from the root forward, requiring a force-push of `main` and recreating every existing
> release tag — and it's not a guarantee of full removal, since GitHub's caches/any pre-rewrite
> fork or clone could still retain the old history.
> - **Issue #3 fixed (PR #37)**: moved `territorial_judges_manual.csv`, `manual_photos.json`, and
> `photo_thumbs.json` from gitignored `data/cache/` into tracked `data/manual/` (`fjc_manual_overrides.csv`
> left as documented/normally-absent — already handled gracefully). These are hand-curated inputs
> with no automated source; losing them silently regresses the dataset — `manual_photos.json`'s
> absence already caused a real incident (2026-08-27, ~27 curated photos wiped). This environment
> still had the real cache files, so the fix was verified for real: rebuilt via `build_assets.py`,
> confirmed judges/courts/photo_thumbs counts unchanged (1490/110/2391) and no derived JSON differs
> except `manifest.json`'s version hash — which legitimately changed, since every prior committed
> version had been manually preserved/copied forward rather than freshly computed against a
> complete photo cache (the exact trap PR #26 documented). This is the first genuinely complete
> rebuild since `photo_thumbs.json` became tracked.
> - **CLAUDE.md's repo map updated** (the issue's own suggested fix) — flagged explicitly for
> operator review before merging, per the core-protocol-file-change rule, rather than folded in
> silently. Operator approved directly.
> - **Standing-issue backlog order proposed and accepted**: #3 (done) → #4 → #8 → #2 → #7 → #6,
> risk/dependency-driven (proven incident first, then hygiene, then forward-looking integration
> prep, UX-facing work last). #28 (schema 2.0 batch) and #36 stay deliberately parked.
> - **Operator wants every substantive PR in this batch reviewed before merge** (2026-09-07),
> stricter than the general case-by-case authority — not just the core-protocol-file category.
> Ledger-only PRs continue in the routine/self-merge lane (this one included).
> - Blockers: none.

> **SESSION (cs), 2026-09-07 — Issue #5: CI, an `npm test` that does something, and a minified
> `dist/` build (PR #27, merged).**
> - **The gap**: `package.json` declared one dependency and no scripts, so `npm test` did nothing;
> every suite (`smoke`, `browser-checks`, ...) was run by hand, on demand, by whoever was in the
> session; there was no `.github/workflows/` CI at all; and the only thing a publisher could embed
> was the 212KB heavily-commented source.
> - **Tests are now a command, not a habit.** Real scripts: `test` (jsdom smoke), `test:browser`
> (the CDP layout checks), `test:dist` / `test:browser:dist` (both suites against the minified
> build), `build`. `jsdom` moved to devDependencies (the widget ships zero runtime deps) and
> `"type": "module"` is now explicit — every `.js` here is already ESM, and the suites were
> quietly relying on Node 22's module-syntax detection to load them. New
> `scripts/serve_and_run.mjs` serves the repo on :8777 from Node, so CI needs no
> `python3 -m http.server` and the server is provably up before the test and gone after it.
> `tests/browser-checks.mjs` now takes `CHROME_BIN` instead of hardcoding `google-chrome-stable`
> — that one hook is what makes it CI-runnable.
> - **Minified build** (`scripts/build_embed.mjs`, esbuild): court-tracker 211.5KB → **71.1KB**,
> its CSS 51.0 → 21.0KB, appointments-chart 43.9 → 22.4KB, its CSS 10.2 → 7.5KB. `dist/` sits
> exactly one directory below the repo root ON PURPOSE — both it and `embed/` resolve assets as
> `new URL("../", import.meta.url)`, so either copy finds `data/`, `assets/geo/` and
> `assets/photos/` unchanged. **No app code changed to make the minified build work**, and the
> data-only-update requirement (`CLAUDE.md` §6) is untouched: a data drop still needs no rebuild.
> `dist/` is committed (like the repo's other derived artifacts) and ships in
> `data-package.tar.gz` — deliberately not in `data-json.tar.gz`, which stays code-free.
> - **CI** (`.github/workflows/ci.yml`, push to `main` + every PR): job 1 runs smoke → rebuild →
> `git diff --exit-code dist` → smoke against the minified build; that diff step is the
> anti-staleness guard, failing loudly instead of shipping a `dist/` that no longer matches
> `embed/`. Job 2 resolves a headless Chrome and runs the CDP suite against both `embed/` and
> `dist/`. First run passed both jobs, resolving Google Chrome 152 on `ubuntu-latest`.
> - **Verified, not asserted**: all four suite runs pass (smoke and browser-checks, each against
> `embed/` and `dist/`), `npm ci` restores from the lockfile, and two consecutive builds are
> byte-identical — so the sync check is deterministic, not flaky. Also bumped undici
> 7.28.0 → 7.29.1 (lockfile only): the new CI surfaced a high-severity advisory on it via jsdom.
> Dev-only, but a permanently red audit line in every CI log trains people to ignore it.
> - **Two collisions while the PR sat open**, both worth noting for the workflow's sake: PR #24's
> two-asset release conflicted on `release-data.yml` + `README.md` (resolved in favor of main's
> structure with `dist` folded into the full tarball only), and later PR #26's `schema_version`
> work conflicted with it again *inside the same release-notes printf* — merged by another
> session and independently re-verified here (7 format specifiers vs 7 arguments, in order).
> Operator asked for the three commits squashed; done as a reset onto `main`, so the branch
> became one commit rebased on `main` rather than carrying a merge. It picked up a second commit
> afterwards from that other session's merge, which was deliberately NOT re-squashed — rewriting
> another author's commit is off-limits, and squash-merge handles it at merge time anyway.
> - **Follow-up left open**: the diagnostic suites (`stress`, `soak`, `flicker-check`,
> `freeze-hunt`, `gpu-ratchet`, `shoot`) are deliberately not in CI — they're investigation tools,
> not regression gates — and still hardcode `google-chrome-stable`. Extending the `CHROME_BIN`
> hook to them is a small, unclaimed follow-up.
> - Blockers: none. (Session label is `(cs)`: `(cq)` and `(cr)` were both taken by concurrent
> sessions while this was in flight.)

> **SESSION (cp) cont'd (3), 2026-09-06 — PR #26 review, schema-2.0 tracking issue (#28), and an
> onboarding-doc accuracy audit (PR #30).**
> - **PR #26 (issue #10 — data schema as a versioned public API) reviewed and merged.** Verified
> the one factual correctness claim directly (`courts.court_level`'s `scotus` value really is
> branched on at `build_assets.py:310`, and CODEBOOK's enum really did omit it). Walked the operator
> through why `appointments.json` is tiered `provisional` rather than `stable` — confirmed directly
> against live data (`"sitting": "false"` as a string vs. real `null` on `photo_thumb` in the same
> record) that it's a genuine shape defect, not caution, and that `stable`/`provisional` share the
> *same* MAJOR-gated enforcement — the tier is an honesty signal about a change already anticipated,
> not a different technical promise. Operator confirmed the call; the 90-day deprecation default
> stood unchallenged. Logged its own ledger entry as session (cr), via the fresh-branch convention.
> - **The changelog-vs-issue gap, caught by the operator's question.** `SCHEMA_CHANGELOG.md`'s
> Proposed section (3 known 2.0-breaking items) would never have resurfaced at a future session
> start — the protocol only checks `gh issue list`/`gh pr list`, not changelog prose. Filed **#28**
> as ONE combined issue rather than three: `DATA_CONTRACT.md` §6 already states breaking changes are
> batched into one migration, so one issue tracking the batch matches how the work will actually
> ship.
> - **Onboarding-doc accuracy audit (PR #30), prompted by the operator asking whether new sessions
> get essential info they wouldn't otherwise.** Found and fixed a real, verified staleness bug
> spanning FOUR files: `CLAUDE.md`, `README.md`, `START_HERE.md`, and `docs/DATA_SOURCES.md`'s own
> top summary all still described CourtListener's live REST API as primary and told a new operator
> to get a `COURTLISTENER_TOKEN` — true through Phase 2, false since 2026-07-16 (FJC bulk export
> became primary; confirmed via `grep -rn COURTLISTENER_TOKEN scripts/` finding no script that reads
> it). Also corrected a parallel photo-sourcing claim (no script pulls images from CourtListener,
> only Wikidata/Wikimedia Commons — confirmed against `enrich_wikipedia.py`'s actual API constants).
> Added the `SCHEMA_VERSION`/`DATA_CONTRACT.md` bump requirement to `CLAUDE.md` §4. Added a caution
> to §7.6 from this session's own earlier incident (a merge resolution silently lost content across
> a careless branch switch before committing — see the (cp) cont'd entries below). Rewrote
> `INITIAL_PROMPT.md`'s Resume block to include the git-workflow session-start check; marked the
> First-session block historical.
> - **Verified**: `tests/smoke.mjs` ALL PASS after each merge (documentation/schema-only changes,
> no widget code touched by #26 or #30).
> - Blockers: none. Two open PRs remain from this refresh: #27 (Issue #5 — CI/tests/dist build) is
> next; will very likely conflict with #26's changes to `release-data.yml`/`README.md` the same way
> #14/#15 did, given both already independently rebased around #24 while open.

> **SESSION (cr), 2026-09-06 — Data schema as a versioned public API (issue #10, PR #26).**
> - **Origin**: sub-issue of the Pragmatic Papers epic (#13) — `docs/CODEBOOK.md` documents field
> meaning but says nothing about what a consumer outside this repo may rely on, what can change
> without warning, or how to request a field once PP builds a renderer against these shapes.
> - **What landed**: `manifest.schema_version` (semver over the published *shape*, deliberately
> separate from `manifest.version`'s content hash — folded into that hash so a shape-only bump
> still cuts a release) and `manifest.stability` (per-file tier: `stable` / `provisional` /
> `reference-renderer`). New normative `docs/DATA_CONTRACT.md` (three-tier policy, MAJOR/MINOR/PATCH
> rules incl. which enums are closed, a deprecation path, the request process) and
> `docs/SCHEMA_CHANGELOG.md` (1.0.0 baseline — documentation only, no data changed — plus a
> *Proposed* section for known 1.0 warts). `.github/ISSUE_TEMPLATE/schema-change-request.md` routes
> new requests.
> - **`appointments.json` tiered `provisional`, not `stable`**, and it's a real defect, not caution:
> confirmed directly against the live data (`"sitting": "false"` as a string, `""` for null on one
> field vs. real `null` on `photo_thumb` in the same record) — a raw passthrough of the CSV rather
> than a typed build, unlike every other derived file. `provisional` lets the eventual retype ship
> as fulfilling a stated expectation instead of breaking a `stable` promise.
> - **One correctness fix found along the way**: `courts.court_level`'s enum in CODEBOOK Table B
> read `circuit | district | specialized`; the data has carried a `scotus` row since the 2026-07-18
> SCOTUS scope addition and `build_assets.py:310` has branched on it ever since — confirmed directly
> in the code before accepting the claim. Corrected.
> - **Resolved its own conflict with PR #24** before opening (both touched
> `release-data.yml`/`README.md`) — verified: rebuild produced byte-identical derived JSON: no data
> changed, only the two new manifest keys.
> - **Not self-merged**, per `CLAUDE.md` §7's case-by-case authority — a public compatibility
> commitment, not routine code. Operator reviewed live in conversation: confirmed the
> `appointments.json provisional` call after walking through what's gained (honesty now, no future
> broken promise) vs. lost (weaker guarantee for a consumer that doesn't exist yet); the 90-day
> deprecation window stood unchallenged.
> - **Follow-up**: the operator asked whether the changelog's Proposed section (three known-breaking
> 2.0 candidates: `appointments.json` typing, `circuit_justices.full_name` dedup,
> `seat_blocks.level`/`courts.court_level` vocabulary unification) would actually resurface later —
> it would not have (a changelog is prose, not a tracked task, and the session-start protocol only
> checks `gh issue list`/`gh pr list`). Filed **#28** as one combined issue (not three — matches
> `DATA_CONTRACT.md` §6's own "breaking changes are batched" policy) so the batch is guaranteed to
> surface at every future session start.
> - **Verified**: `tests/smoke.mjs` ALL PASS after merge. `manifest.json`'s `national_totals`/other
> fields confirmed untouched (only `schema_version` + `stability` added).
> - Blockers: none.

> **SESSION (cq), 2026-09-06 — JSON-only release asset (issue #23, PR #24).**
> - **Origin**: operator flagged the "possible follow-on" paragraph in the as-built comment on
> epic #13 (PP-side sync notes, 2026-09-06) as worth its own issue. Filed #23, then built it.
> - **Problem**: `release-data.yml` cut exactly one asset, `data-package.tar.gz` (~21MB
> compressed), of which ~98% is `assets/photos/` + `assets/geo/`. A consumer rendering its own
> map with its own images — the Phase B end state — could only download 21MB and discard nearly
> all of it each cycle, or skip archives entirely and pin to the tag. No small *archive* existed
> for anyone wanting one immutable file to store, checksum, mirror, or feed an offline process.
> - **Change**: every release now also carries `data-json.tar.gz` — the runtime `data/*.json`
> only (`manifest.json` included), same `data/`-prefixed paths so the two extract compatibly.
> Both are cut from the same run and commit, so they are always the same `manifest.version` by
> construction. The path list lives once in a `RUNTIME_JSON` bash array feeding both tarballs, so
> the JSON-only asset cannot drift as new derived JSON is added. Release notes gained an assets
> table with measured sizes; `README.md`'s sync section now documents three consumer shapes in
> preference order (pin to tag → JSON archive → full archive) instead of two.
> - **Deliberately unchanged**: full-package contents, tag naming, and the standing
> recommendation to poll the releases API and pin to the tag. This adds an option, it does not
> replace pinning — nothing changes for PP as built.
> - **Verified locally** against current data: both tarballs build from the shared array (21M /
> 364K, matching the figures measured in #13); the JSON tarball extracts to the same `data/`
> layout with `manifest.json` present; workflow parses as YAML; release-notes `printf` renders
> correctly with real manifest values substituted for the step outputs.
> - **Next**: workflow only fires on a `data/manifest.json` change on `main`, so the next data
> refresh is its first real exercise (`workflow_dispatch` can force one sooner). Epic #13's open
> items are unchanged: #2, #3, #4, #5, #10, plus the Phase-4 tail. No blockers.

> **SESSION (cp) cont'd, 2026-09-06 — PR #14 exposed a real merge-conflict source in this
> session's own new workflow; fixed it and tested the fix (PR #19).**
> - **What happened**: reviewing PR #14 for merge surfaced a genuine 3-way conflict in
> `PROGRESS.md` — (cn), (co), and this session's own (cp) entry (below) had all independently
> prepended a session-log entry at the identical top-of-log anchor (right after
> `**Last updated:**`) on branches that sat open concurrently. Resolved it manually for #14
> (reordered the three same-day entries chronologically, fixed a `(co)`/`(c0)` typo picked up
> along the way) — but operator correctly flagged that bundling the ledger edit into every
> feature branch is what causes this, and would keep recurring under the new workflow.
> - **Fix (PR #19, merged)**: kept the "never commit straight to main" rule intact rather than
> carving an exception into it. `CLAUDE.md` §7 point 6 now says the `PROGRESS.md` ledger entry
> gets its OWN branch → PR → merge, cut fresh off `main` right when the code PR merges — a
> lifespan of seconds instead of a whole session, so it essentially never overlaps another
> branch doing the same thing. Added `.gitattributes` (`PROGRESS.md merge=union`) as a backstop
> for a genuine same-instant collision or a hand-edit.
> - **Actually tested, not just asserted**: simulated the exact collision with three throwaway
> local branches (never pushed to origin, deleted after) — two branches cut from the same base,
> each independently inserting a different dummy entry at the identical anchor, merged in
> sequence. Result: auto-merged, zero conflict markers, both entries' distinct content survived
> (one identical boilerplate line across the two dedup'd to a single copy — expected `union`
> behavior, not a concern for real prose). Full method + result in PR #19's description.
> - **This very entry is the first live (non-simulated) use of the new convention**: written on
> a branch cut fresh from `main` after #19 merged, going up as its own PR rather than riding on
> a feature branch.
> - Blockers: none. Operator separately asked how to flag PR #19 as a standing/critical
> reference — addressed live in conversation (cross-referenced from PR #14 and a pinned tracking
> issue), not repeated here since it's process, not code.

> **SESSION (cp), 2026-09-06 — Formalized branch → PR → merge as the standing git workflow
> (operator ask), instead of committing straight to `main`.**
> - Operator wants issues/PRs actually worked and visible, not blithe direct-to-main commits.
> `gh` was already authenticated with `repo` scope against `digitalgroundgame/court-tracker`.
> Found the repo already has **12 open issues** (#2–#12 concrete gaps, #13 an epic tracking an
> eventual "Pragmatic Papers" rendering-ownership handoff) and **2 open PRs** from prior sessions
> — (cn)'s #14 (publishing prerequisites) and (co)'s #15 (Issue #9 PII/machine-path cleanup) —
> that had already independently adopted a branch+PR pattern ahead of this being formalized.
> - Updated `CLAUDE.md` §7 point 6: superseded the (br) "commit and push to main every time" rule
> with branch(`claude/<slug>`)→PR→merge, a session-start check of `gh issue list`/`gh pr list`
> (an open issue or review comment can supersede whatever `PROGRESS.md` says is next), and
> case-by-case merge authority per operator decision — merge routine/low-risk PRs directly; leave
> anything touching data correctness, scope, the UX contract, or a PR from a different/prior
> session for the operator's explicit go-ahead.
> - Fast-forwarded local `main` to `origin/main` (picked up already-merged PR #16, `LICENSE`).
> - **Next**: review PR #15 (Issue #9) with the operator first — one existing PR at a time, per
> operator instruction — before merging anything.
> - Blockers: none.

> **SESSION (co), 2026-09-06 — Issue #9: personal contact info and one machine's absolute paths
> out of `scripts/`.**
> - **The PII.** Four collection scripts hardcoded a personal university email in their
> User-Agent (`collect_courtlistener.py` `FJC_HTML_UA`, `enrich_wikipedia.py`, `cache_photos.py`,
> `collect_president_photos.py`), alongside a placeholder `https://github.com/` with no repo path.
> New `scripts/_useragent.py` builds the UA from two constants (project + the real repo URL) and
> appends `$COURT_TRACKER_CONTACT` **only if the operator exports it** — so the contact lives in a
> shell, never in the tree, and doesn't go stale when the contact person changes. Both forms are
> valid descriptive UAs; setting it is what Wikimedia's UA policy actually asks for. Documented in
> `README.md` and `START_HERE.md` next to `COURTLISTENER_TOKEN`.
> - **The machine paths.** `qgis_export.py`'s five path constants pointed into one operator's home
> directory (`/home/…/MAD_project/…`); every other script in `scripts/` already derives `ROOT` from
> `Path(__file__)`. They now derive from a `_find_repo_root()` that resolves in three steps:
> `$COURT_TRACKER_ROOT` → this file's `__file__` → a walk up from the CWD looking for
> `data/courts.csv` + `scripts/`, with a loud, instructive `RuntimeError` if all three miss. The
> three-step dance exists because this script is `exec()`'d in the QGIS console, where **there is
> no `__file__` at all** — the docstring's invocation line now uses
> `exec(compile(src, p, 'exec'), {..., '__file__': p})` to supply one, and names the env var as the
> fallback for anyone who runs the old plain-`exec` form. All five paths resolved to in-repo
> locations anyway (`data/census/`, `data/county_to_district.csv`, `data/courts.csv`,
> `data/out/assets/geo`, `data/nps/`), so this is a pure relocation, no behaviour change.
> - Also redacted the one other personal email in a tracked file (a `(br)` session-log line naming
> the operator's git identity); `git grep` for email addresses and for `/home/*` paths across all
> tracked files now returns nothing.
> - **Verified**: all four patched scripts import cleanly and print the new UA (`cache_photos`
> compiles; its import needs PIL, absent in this container — pre-existing, unrelated).
> `_find_repo_root()` exercised standalone through all five branches (env var, `__file__`, CWD
> walk, bad env var, nothing-found). `python3 scripts/check_geometry.py` → PASS, 0 warnings.
> `tests/smoke.mjs` can't run here (no `node_modules`, gitignored) and fails identically on
> unmodified `main` — this change touches no widget code.
> - **NOT done, needs an operator decision**: the email is still in **git history** (introduced in
> the root commit `9d9746d`, so all 23 commits would be rewritten). Removing it means a
> `git filter-repo` + force-push of `main`, which invalidates every existing clone. Flagged, not
> performed.

> **SESSION (cn), 2026-09-06 — Publishing prerequisites: national totals precomputed into the
> build, and every manifest bump now cuts a tagged, atomic data release.**
> - **Context.** An operator-requested repo review (what this app owns vs. what a downstream
> publisher should own) produced a backlog of integration gaps. This session works the two that
> specifically block an EXTERNAL consumer syncing this repo's data on a schedule — the goal being
> that the consuming side is a dumb "check version → pull → swap" job, never something that has to
> reimplement our logic or race a moving branch.
> - **(1) The national-totals reconciliation moved from the widget into the build step.** Session
> (cm)'s `districtNationalTotals()` math — authorized/active/vacant plus the `overAuthorized`
> adjustment that explains why they don't sum at face value — was computed at RENDER time, so any
> consumer of the raw data package other than our own widget would have had to reverse-engineer
> it to get the same right numbers. `build_national_totals()` in `build_assets.py` now computes it
> once from the same `seat_blocks` data and ships it as `manifest.national_totals` (**CODEBOOK
> Table H**, including the `authorized + over_authorized == active + vacancies` invariant);
> `districtNationalTotals()` just reads it. Same return shape, so the caption and every existing
> assertion are untouched. Rebuilt against real data and confirmed the documented 673 / 654 / 27 / 8.
> - **(2) `.github/workflows/release-data.yml` — the repo's first CI.** `manifest.version` was
> already a content hash that moves exactly when the data does, but nothing tagged or released at
> that moment, so a scheduled puller reading `main` could catch a commit mid-push, or catch `data/`
> and `assets/geo/` briefly disagreeing across two commits. The workflow fires on any push to
> `main` touching `data/manifest.json`, SKIPS if a `data-v<version>` tag already exists (idempotent
> against re-runs and reverts), else tags and publishes a Release carrying exactly `embed/` + the
> runtime `data/*.json` + `assets/geo/` + `assets/photos/` — deliberately NOT `data/cache/`,
> `data/census/`, `data/nps/`, or anything else pipeline-only.
> - **The documented consumer contract was corrected mid-session, from the first real consumer's
> feedback.** `README.md` originally said to poll `data/manifest.json`'s `version` and pull the
> matching tag. That has a race we missed: the manifest lands on `main` BEFORE the workflow cuts
> the release, so a manifest-poller can observe a version whose release does not exist yet — and
> never will, if that run fails. The contract now says to **poll the releases/tags API instead**:
> a version is only ever observed once its artifact exists, and it's one request since the version
> is in the tag name. Second correction: **pinning to the tag is documented as a first-class
> alternative to downloading the tarball** — the atomicity comes from the tag being immutable, not
> from the archive, and the package is ~21MB compressed almost entirely because of
> `assets/photos/` + `assets/geo/` (the runtime JSON alone is ~364KB), so a consumer that renders
> its own map and images should pin and skip ~98% of the bytes. Measured both, numbers are in the
> README. Possible follow-on: publish a JSON-only asset alongside the full package for consumers
> who want an archive rather than a tag-pin.
> - **A real landmine surfaced while doing this, and it is NOT fixed yet.** Rebuilding in a clean
> clone silently nulled `photo_thumb` on all 1,490 judges (plus appointments/justices/presidents):
> `data/cache/` is gitignored, and `photo_thumbs.json` is the url→local-path lookup
> `build_assets.py` reads — absent, every photo reverts to hotlinking Wikimedia even though all
> 2,391 licensed JPEGs are committed in `assets/photos/`. Nothing errors; the manifest hash just
> changes. Reconstructed the lookup from already-committed output before rebuilding, and verified
> the final diff touches only the intended files — but the underlying trap stands for anyone
> rebuilding from a fresh checkout. `territorial_judges_manual.csv`, `manual_photos.json` and
> `fjc_manual_overrides.csv` are in the same position: hand-authored, irreplaceable, untracked.
> Worth promoting all four into tracked `data/` before the refresh pipeline is handed to anyone.
> - **Verified**: `tests/smoke.mjs` **482/482**, `tests/browser-checks.mjs` **55/55**, both ALL
> PASS; `scripts/check_geometry.py` PASS with 0 warnings; `actionlint` on the new workflow, 0
> findings. Dry-ran every shell step of the workflow locally against the real repo — version/tag
> derivation, the tarball build (2,437 files, ~21MB), and the release-notes generation.
> - **Next**: this work sits on a branch with a PR open against `main`, not yet merged. The
> workflow triggers on `main` only, so it stays untested live until that merge — which itself
> touches `data/manifest.json` and should therefore cut the first `data-v05d95d9fcf1b` release,
> making the merge its own first real test. Remaining backlog from the review (the cache-tracking
> trap above, a base-URL override for the asset root, `destroy()`/unmount, touch affordances,
> trimming the committed geometry-source shapefiles) is filed and unstarted.

> **SESSION (cm), 2026-09-11 — Explained, not fixed: Summary > District's national totals don't
> arithmetically add up, and that's correct (operator report: "654+27=681 > 673").**
> - **Root-caused, not assumed.** Computed the real numbers directly from `seat_blocks.json`:
> authorized 673, active 654, vacant 27 — active+vacant (681) exceeds authorized by EXACTLY 8,
> and that 8 is EXACTLY the sum of overage at 6 specific courts (kyed +1, kywd +1, ilnd +1,
> moed +2, mowd +2, okwd +1) that already appear in `DATA_SOURCES.md`'s "roving judgeships"
> discrepancy log — 5 of the 6 are the same-state shared-seat districts (cj)'s search-merge
> feature already knows about, plus `ilnd`'s documented minor FJC status lag. Confirmed the
> mechanism: `build_seat_blocks()` floors an over-full court's `vacancies` at 0 rather than
> inventing a negative one (a real judge is never dropped from the block, a deliberate design
> choice already documented there) — correct PER COURT, but it means the three NATIONAL sums
> can't reconcile by simple arithmetic when any court is over its base authorized count.
> - **Not a data bug — a display-clarity gap.** All three numbers were already individually
> correct; nothing in the underlying data or per-court math changed. Added `overAuthorized` to
> `districtNationalTotals()` (sum of each court's `max(0, active-authorized)`) and a single-
> character marker (" *", its own `.ctt-district-overage-note` span with a native `title`
> tooltip naming the actual count and explaining why) appended to the caption meta line ONLY
> when `overAuthorized > 0` — self-effacing if a future data refresh ever resolves every such
> court. Deliberately ONE character, not a longer inline clause: this caption has a hard-won
> pixel-parity requirement against Summary > SCOTUS's own meta line (broken and fixed twice
> before — sessions cb/cc), and a native tooltip carries the full explanation with zero risk of
> the line wrapping to a second row.
> - **Scope note for later**: individual over-full courts' OWN panes (e.g. `moed`'s "7
> authorized · 9 active · ... · 0 vacant") show the identical apparent mismatch for the same
> reason — not addressed this session (the operator's report was specifically about the Summary
> aggregate), flagging here in case it's wanted next.
> - **Verified**: `tests/smoke.mjs` asserts `authorized + overAuthorized === active + vacancies`
> (the gap is FULLY and exactly explained, no unaccounted residue) and that the tooltip names
> the real count. `tests/browser-checks.mjs` confirms the marker doesn't grow the caption past
> one line (17px) and that the SCOTUS/District pixel-parity checks alongside it still pass
> unchanged. Screenshot-confirmed: "673 authorized · 654 active · 27 vacant *", single line.
> - `smoke.mjs`/`browser-checks.mjs` both ALL PASS; no regressions.

> **SESSION (cl), 2026-09-11 — Roving-judgeship UI: the "· " joiner hides itself once the meta
> line wraps (operator report).**
> - **Report**: when (ck)'s wrap landed the president chip above the court label, the leading
> "· " that reads fine as an inline joiner ("Trump (R) · E.D. Okla. / ...") became an orphaned
> bullet at the start of its own line once wrapped ("· E.D. Okla. / ...").
> - **Fix**: the "· " is now its own `.ctt-search-sep` span (was a bare text node — text nodes
> can't be individually shown/hidden) inside `.ctt-search-court`. A small measurement pass at
> the end of `renderSearchResults` — AFTER `.ctt-is-open` is added, since `display:none` reads
> `offsetTop` as 0 for everything and the wrap can't be detected before that — compares
> `.ctt-search-court`'s `offsetTop` against `.ctt-search-president`'s and hides the separator
> only when they actually differ (a real wrap). This is real-layout-dependent (same as the wrap
> itself), so it can only be verified in a real browser, not jsdom.
> - **Verified**: `tests/browser-checks.mjs` — Heil's (3-court, wraps) row hides the separator
> (`getComputedStyle(...).display === 'none'`); Sotomayor's (short, doesn't wrap) row keeps it
> visible. Screenshot-confirmed live: the second line now reads "E.D. Okla. / **N.D. Okla.** /
> W.D. Okla. (10th Cir.)" with no leading bullet.
> - `smoke.mjs`/`browser-checks.mjs` both ALL PASS; no regressions.

> **SESSION (ck), 2026-09-11 — Roving-judgeship UI refinement: click also sets (and PERSISTS)
> the carousel mark; the president/court meta line splits onto two lines, but only on overflow.**
> - **(1) Click now also sets the mark, and persists it "over the page session."** Clicking a
> court button already jumped there; it now also records that choice (`setRovingSelection` calls
> `S.searchRovingPref.set(fullName, idx)` — the SAME call ArrowLeft/Right already made, so both
> paths persist identically, "in addition to" rather than instead of arrow keys). Re-searching
> that judge later in the same session (session = current mount; reset on a fresh `mount()`,
> same convention as the search index cache) now opens ALREADY marked on the last-picked court,
> not reset to the first one — `renderSearchResults` reads `S.searchRovingPref` via
> `rovingSelectedIdx()` when building each roving row's initial `_selectedIdx`, clamped
> defensively against a stale/out-of-range value.
> - **(2) The meta line's president/party chip and court label are now SEPARATE flex children**
> (`.ctt-search-president`, `.ctt-search-court`) instead of one run of text — a flex item wraps
> as a whole unit, never mid-phrase, so `.ctt-search-meta { flex-wrap: wrap }` puts the court
> half on its own line BELOW the president chip exactly when (and only when) it doesn't fit on
> one line; nothing about this needed JS overflow measurement, CSS handles the "only when it
> overflows" part for free. Directly fixes the reported roving-judge wrapping problem (up to 3
> district buttons could previously wrap mid-list) without touching the common single-court case
> at all — verified in a REAL browser (jsdom can't measure this): a 3-district roving judge's
> court label sits 16px lower than its president chip (a real wrap), while an ordinary short row
> stays on exactly one line (0px difference).
> - **Verified**: `tests/smoke.mjs` — clicking a court button now also asserts
> `S.searchRovingPref.get(fullName) === clickedIndex`; a FRESH re-search of the same judge starts
> already marked on the persisted court (not the first one), and Enter with NO prior arrow-key
> press still respects it; the arrow-key carousel test explicitly clears the preference map
> first (`S.searchRovingPref.clear()`) to isolate the arrow-key mechanism itself from the
> persistence just proven above — otherwise it would inherit state from the earlier click and
> its "starts at index 0" assumptions would silently be testing the wrong thing; a structural
> check confirms `.ctt-search-president` precedes `.ctt-search-court` as separate DOM children.
> `tests/browser-checks.mjs` — real-layout geometry: Heil's (3-court) row genuinely wraps
> (court top 204 vs president top 188), Sotomayor's (short) row genuinely doesn't (188 vs 188).
> - `smoke.mjs`/`browser-checks.mjs` both ALL PASS; no regressions.

> **SESSION (cj), 2026-09-11 — Search-bar fix: roving judgeships merge into ONE result, with
> per-court jump buttons and a keyboard-driven carousel + row navigation.**
> - **Operator report**: roving judgeships (28 U.S.C. §133 shares one seat across same-state
> districts — E.D./W.D. Missouri, E.D./W.D. Kentucky, N/E/W.D. Oklahoma; see `DATA_SOURCES.md`'s
> discrepancy log) give the SAME judge one `judges.csv` row per district they simultaneously sit
> on, so search showed them as 2-3 separate, near-identical results instead of one.
> - **Merge is data-driven, not a hardcoded district list.** `build_assets.py` groups
> `judges.csv` rows by `(full_name, commission_date)` — the same identity key the collector
> already uses to join a person across sources — when building `judges_search.json`; a group of
> >1 becomes ONE entry with plural `court_ids` (sorted, deterministic) instead of singular
> `court_id` (CODEBOOK Table G updated). This is generic: any judge who ends up on more than one
> court merges the same way, not just the three statutory cases known today. 1490 raw judge rows
> → 1483 search entries (6 roving judges, 13 rows collapsed to 6).
> - **UX, refined through the conversation.** Operator's own diagnosis + explicit design ask,
> not something guessed at: (1) per-court buttons on the right of the result (in the meta line)
> for direct "jump to this specific court" clicks; (2) the row's OWN background is NOT a click
> target for a roving row — only its buttons are (a genuinely different interaction rule for
> this one row type, by design); (3) ArrowLeft/Right cycle a "currently marked" court with
> wraparound, shown via a visible text-formatting change (bold + underline + accent color) that
> IS the selection state, not just decoration; (4) Enter/Space (keyboard row-activation)
> navigates to WHICHEVER court is currently marked, never a fixed default; (5) ArrowUp/Down move
> focus between result rows generally (not roving-specific) — ArrowDown from the input enters
> the list at the first row, ArrowUp from the first row returns to the input, matching a
> standard combobox pattern.
> - **Rows are no longer `<button>` elements** — a `<button>` cannot validly contain other
> interactive elements (the per-court buttons), so every row is now a `role="option"` `div`
> with `tabindex="-1"`, focused/activated entirely via the new arrow-key JS rather than native
> Tab order (matching the existing typeahead-combobox interaction, not a plain tab-through
> list). Verified this was a safe, invisible-to-existing-behavior change for ordinary
> (non-roving) rows: every pre-existing search test (click-to-navigate, click-away, etc.)
> passed UNCHANGED, since `click` listeners work identically on a div.
> - **Verified**: `tests/smoke.mjs` — a roving judge (Claria Horn Boom, kyed/kywd) produces
> exactly one row with two ordered court buttons and a single circuit suffix; clicking the row's
> background does nothing; clicking a SPECIFIC button (not the initially-marked one) jumps
> straight there; ArrowRight/Left move the mark with wraparound on a 2-court judge; Enter jumps
> to whichever is marked; a 3-court judge (John Frederick Heil III, oked/oknd/okwd) gets 3
> buttons and the same behavior; ArrowDown/Up move focus between rows and back to the input
> (`document.activeElement` assertions — confirmed jsdom tracks this correctly). **Confirmed the
> tests fail against the pre-fix code+data** (temporarily reverted every changed file including
> the regenerated `judges_search.json`: "got 2" rows for Claria Horn Boom, exactly the reported
> bug — restored after). Also eyeballed a real-browser screenshot: John Frederick Heil III's row
> shows all three Oklahoma districts, with N.D. Okla. bold/underlined/blue after an ArrowRight,
> the other two plain.
> - `smoke.mjs`/`browser-checks.mjs` both ALL PASS; no regressions.

> **SESSION (ci), 2026-09-11 — Search-bar fix: a hidden senior pinned via search is now
> temporarily revealed in Majority view.**
> - **Operator ask**: if the searched judge is a senior AND the pane is currently in Majority
> mode AND Seniors is set to Hide, that setting needs to flip to Show — temporarily, until the
> pane is refreshed — otherwise the auto-pin (session cg) docks a detail panel for an icon the
> reader literally cannot see (`layoutArc` parks a Hide-mode senior at dead centre with
> `opacity:0; pointer-events:none` — no outer band, not folded into the arc either).
> - **Fix**: `revealSeniorForSearch(judge)`, called from `pinSearchedJudge()` before pinning —
> fires only when `S.paneMode === "majority" && judge.status === "senior" && S.seniorMode ===
> "hide"`, flips `S.seniorMode` to `"show"`, updates the Seniors toggle's own active-button
> class (so the visible control agrees with what happened), and re-runs `layoutJudges()` so the
> judge actually lands in the outer band before `onIconClick` pins them.
> - **"Temporarily, until the pane is refreshed" — `S.seniorMode` normally PERSISTS across court
> selections** (same convention as `S.paneMode`/`S.summaryView`), so simply setting it to "show"
> would have silently become the new session-wide default the next time ANY court's Majority
> view opened — not what was asked. New state `S._seniorModeForced` records the value to revert
> TO (i.e. "hide"); `renderPane` reverts it at its own top, before building the new pane, on
> ANY subsequent render — a different court, the same court reopened, doesn't matter, since
> "refreshed" means the next render, not a specific court. A genuine manual click on the
> Hide|Show|Include switch clears `_seniorModeForced` itself, so a deliberate choice the reader
> makes AFTER the auto-reveal can never be silently overwritten by a stale pending revert.
> - **Verified**: `tests/smoke.mjs` — forced the exact reported precondition (Majority, Seniors:
> Hide) on a real senior judge (Susan Webber Wright, 'are'), confirmed her icon's `opacity` is
> actually `"0"` beforehand; searched her again (hits the (ch) "already open" fast path — still
> the reported scenario), confirmed `seniorMode` flips to `"show"`, her icon's `opacity` becomes
> `"1"`, the toggle control's active class updates, and `_seniorModeForced === "hide"` is
> recorded; selected a DIFFERENT court and confirmed the revert actually fires there (not
> scoped to the same court); confirmed a manual "Include" click after an auto-reveal clears the
> pending revert and survives a further re-render. **Confirmed the tests fail without the fix**
> (temporarily reverted `court-tracker.js`, 7 assertions failed as expected, restored). Also
> eyeballed a real-browser before/after screenshot pair: before, Wright is pinned but her icon
> is nowhere on the arc; after a second search, "Seniors: Show" is active and her icon (gray
> senior tint, cohort-highlighted) appears in the outer band, still pinned.
> - `smoke.mjs`/`browser-checks.mjs` both ALL PASS; no regressions.

> **SESSION (ch), 2026-09-11 — Search-bar bugfix: a second search on the SAME open court closed
> the pane instead of switching the pin.**
> - **Operator report**: clicking a search result for a DIFFERENT judge on a court whose pane was
> ALREADY open closed the pane instead of switching the pin to the new judge; searching the SAME
> judge again should reinstate the pin, not close anything either. Operator's own diagnosis was
> right: `selectCourt`'s "re-select the already-open court" guard (a deliberate CLOSE toggle for
> a manual re-click of the same selector item — there's "nowhere to go") fired for `courtId ===
> S.selectedCourt`, which is exactly what a second search hit on the SAME court produces —
> `selectSummary("scotus")` had the identical footgun for a second SCOTUS search (same root cause
> as (cg)'s Summary-toggle fix, just not yet applied to the "already there" case specifically).
> - **Fix**: `navigateToSearchResult` now checks whether the target court's pane is ALREADY open
> (court-level-aware: `S.selectedCourt === courtId` for an ordinary court, or `S.selectedCourt ===
> SUMMARY_ID && S.summaryView === "scotus"` for SCOTUS) BEFORE doing any navigation. If so, it
> skips `selectCourt`/`selectSummary`/drilling entirely — nothing about the court needs to change
> — and goes straight to `pinSearchedJudge()`, which finds the new judge in the STILL-rendered
> stage and re-runs the same `onIconClick()` pin path. This is a strict ADDITION in front of the
> existing navigation, not a change to `selectCourt`/`selectSummary` themselves — their own
> manual-re-click-closes behavior (the correct default for the selector bar / Summary button) is
> untouched.
> - **Verified the bug reproduces without the fix, not just that the fix passes**: temporarily
> reverted `court-tracker.js` (kept the new tests), confirmed the new assertion actually FAILS
> (`selectedCourt=null` — the pane really does close), then restored the fix and confirmed it
> passes — the standard this project holds itself to for "did I actually catch the bug" rather
> than trusting a passing assertion on faith. `tests/smoke.mjs` gained 3 new scenarios: two
> different ca9 circuit judges searched back-to-back (pane stays open, pin switches), the SAME
> judge searched twice in a row after manually unpinning (pin reinstates), and the same two
> checks for Summary > Supreme Court (Kavanaugh then Gorsuch). `smoke.mjs`/`browser-checks.mjs`
> both ALL PASS.

> **SESSION (cg), 2026-09-11 — Search-bar bugfix round: SCOTUS results routed to an orphaned
> pane instead of Summary, and search should auto-pin the clicked judge.**
> - **Bug 1 — a SCOTUS search result opened a pane UNREACHABLE from anywhere else in the real
>   UI.** `renderPane` still has a `court_level === "scotus"` branch left over from before the
>   "Summary" button replaced the old lone SCOTUS selector entry (session earlier this project) —
>   confirmed by grep that NOTHING calls `selectCourt("scotus")` except (cf)'s own new search
>   code. Fixed by routing SCOTUS results through `selectSummary("scotus")` instead of
>   `selectCourt("scotus")` — CLAUDE.md's "its own selector entry + pane" requirement for SCOTUS
>   is satisfied by the Summary button's SCOTUS sub-tab, which is the actually-reachable pane.
>   Left the orphaned `renderPane` branch itself untouched (out of scope for a bugfix; not
>   something search should route to, but not this session's call to delete either).
> - **`selectSummary` gained an optional `view` param** so a caller can force landing on a
>   specific sub-tab (search always wants SCOTUS specifically — `S.summaryView` otherwise
>   "persists across re-opens" by design, so a plain re-navigate could land on whatever sub-tab
>   was last viewed). Had to handle the existing "re-click the Summary button toggles the pane
>   closed" guard carefully: a FORCED view is a jump request, not a toggle, so that path now
>   switches sub-tab in place instead of closing when already open on Summary. Caught a real
>   landmine while doing this: `btn.addEventListener("click", selectSummary)` passed the button's
>   own click `Event` as `selectSummary`'s first argument — harmless before (no params), but
>   would have silently corrupted `S.summaryView` to a `MouseEvent` object the moment a `view`
>   param was added. Fixed to `() => selectSummary()`.
> - **Bug 2 (feature completion, not a regression) — auto-pin the searched judge.** Operator ask:
>   landing on the court isn't the finish line — the reader searched for a SPECIFIC judge, so the
>   docked detail panel should show and pin THAT judge, same as if they'd clicked the icon
>   themselves. `pinSearchedJudge()` looks the judge up by `full_name` within the just-loaded
>   court's judges (`judgesForCourt`), finds their icon node via the judge-stage model's
>   `_nodeByJudge` map, and calls the SAME `onIconClick()` a real click uses — not a new pin
>   mechanism. Confirmed (not assumed) that this is correctly a ONE-TIME effect per pane-opening,
>   as the operator suspected it already would be: every render path that reaches here
>   (`renderPane`/`renderSummaryPane`) already calls `unpinDetail()` at its own top, so the pin
>   never survives closing and reopening the pane — verified directly rather than left as an
>   assumption (a test closes the pane and asserts `S.detailPinned` is false again).
> - **Verified**: `tests/smoke.mjs` rewrote the (cf) SCOTUS-navigation assertion to check the
>   NOW-correct target (`S.selectedCourt === "summary"`, `S.summaryView === "scotus"`) instead of
>   asserting the bug, added pin assertions for both the SCOTUS and the District search-navigation
>   paths, added a pin-doesn't-survive-reopening check, and added a regression check that a plain
>   re-click of the Summary button still toggles the pane closed (the forced-view code path didn't
>   break the un-forced one). One test-authoring trap found and fixed along the way: `.ctt-pane-
>   close` matches TWO buttons (the real × and the stow-only top button, which shares the class
>   for styling and sits first in DOM order) — a bare class query silently grabbed the wrong one
>   and the pin-survives assertion falsely failed; scoped to `[aria-label="Close panel"]`.
>   Also eyeballed live in a real browser: searching "kavanaugh" and clicking the result lands on
>   Summary > Supreme Court (tab correctly highlighted) with Kavanaugh's docked panel pinned
>   (accent border + ×) and his same-president cohort (Gorsuch, Barrett) correctly ring-
>   highlighted — confirms the pin reuses the real click path, not a lookalike.
> - `smoke.mjs`/`browser-checks.mjs` both ALL PASS; no regressions.

> **SESSION (cf), 2026-09-11 — New feature: header search bar (judges searchable by name).**
> - **Operator ask**: a search bar, right-aligned in the title band (next to "Federal Court
>   Appointment Tracker / National view · data v..."), searching sitting judges by name —
>   misspelling-tolerant, word-order-independent, live-filtering per keystroke, matched text
>   bolded in the results, results grouped by match quality then Supreme > Appellate (by circuit
>   number) > District (by circuit order, then alphabetically within a circuit), clicking a
>   result opens that judge's own court pane, click-away hides the list (query text persists —
>   only the new × button or deleting the text clears it).
> - **Clarified three design questions with the operator before building** (their spec left them
>   genuinely open): (1) president shorthand = surname, with initials only for the ambiguous
>   Bush/Roosevelt/Johnson/Adams/Harrison families (none of which currently occur in the sitting-
>   judge data, which only goes back to Nixon — `PRESIDENT_SHORTHAND` exists for when it does),
>   shown with the SAME colored-dot + party-letter convention the docked judge-detail panel
>   already uses (`showDetail`'s `.ctt-dot`/`ctt-rep`/`ctt-dem` classes, reused verbatim). (2)
>   District sort = group by the DISTRICT'S OWN CIRCUIT's order (same numbering `byCircuitOrder`
>   already uses for Appellate), alphabetical within that circuit — confirmed against how the
>   existing selector bar already groups districts under a circuit. (3) Data source: checked the
>   pipeline is intact (`build_assets.py` is the single script that derives ALL runtime JSON from
>   the 3 source CSVs, already the established "data-only update" mechanism CLAUDE.md §6
>   requires) and where in it a new derived asset belongs, before proposing one — a small
>   dedicated derived asset **is** the right call, following the SAME pattern as `seat_blocks.json`/
>   `circuit_justices.json` — CODEBOOK Table G documents it.
> - **New derived asset: `data/judges_search.json`** (`build_assets.py`, ~250KB for 1,490 judges:
>   `full_name`/`court_id`/`status`/`appointing_president`/`president_party` only — no photos/
>   education/affiliations/dates). Deliberately SEPARATE from the 14 per-circuit judge bundles
>   (~1.9MB combined, built for a different purpose): the search bar needs every sitting judge
>   available client-side to filter on every keystroke, and pulling all 14 bundles just for name/
>   court/party/president would defeat the national view's lazy-load contract (CLAUDE.md §6) —
>   so it's registered in the manifest and fetched ONCE, lazily, on the search box's first use
>   (confirmed via a jsdom assertion: `S.searchIndex === null` until the first keystroke).
> - **Matching**: each query word is scored independently against every word in a judge's
>   `full_name` (exact=100 > prefix=88 > substring=74 (word length ≥3) > Levenshtein-fuzzy
>   ≤tolerance=45-60, tolerance scaling 1/2/3 by query-word length) — matching every query word
>   against ALL name words independently, not positionally, is what makes word order not matter.
>   EVERY query word must find some match or the whole judge is disqualified (so a query word
>   that matches nothing can't be "outvoted" by a strong match on another word). Overall score =
>   average of each word's best match; tiers ≥85/≥65/≥45 ("groups of quality match" per operator
>   spec), <45 excluded. Matched spans are tracked back to the original string for the bolding
>   (`<span class="ctt-search-match">`, merged if overlapping).
> - **Navigation reuses existing map primitives rather than reinventing pane/view state**: a
>   result click calls the SAME `drillOut`/`drillIn`/`selectCourt` the "View districts"/back UI
>   already uses (a district result drills into its circuit first if not already there; a
>   circuit/SCOTUS result drills out first if the map is currently in a DIFFERENT circuit's local
>   view) — this was a deliberate choice after finding that selecting a district while the map
>   stays on the national view (skipping drillIn) is a state combination nothing else in the app
>   produces, and would have left the selector bar showing the wrong (national) list while the
>   pane showed a district. USCIT/CFC results (real sitting judges the app already tracks, court_
>   level `specialized`) navigate via the same `selectCourt`/`drillIn("cafc")` path the Federal
>   Circuit's own feeder selector already uses — not named in the operator's District/Appellate/
>   Supreme spec, so placed as a 4th group after District, sorted alphabetically by short label.
> - **Verified**: `tests/smoke.mjs` +26 assertions — scoring unit tests (exact/prefix/fuzzy/
>   reorder/threshold-reject/word-disqualification), a synthetic-index sort-order test (isolates
>   hierarchy/circuit/alpha ordering from the scoring rules by giving every synthetic record an
>   identical score), and a full DOM flow (lazy index load, live filtering, highlight markup,
>   click-to-navigate for both a SCOTUS result and a cross-view District result, click-away,
>   clear button) — **1490/1490 real judges load, all pass**. `tests/browser-checks.mjs` +4 real-
>   layout assertions: right-alignment to the header's own padding, the dropdown opens below the
>   input and actually paints ON TOP of the map (`elementFromPoint` confirms a result row, not the
>   map, is hit-tested at its own screen position), and **no horizontal overflow at 380px width**
>   (the still-open mobile checklist item just got one real data point). Also eyeballed via
>   `tests/shoot.mjs`-style real-Chrome screenshots: a misspelled "sotomayer" query correctly
>   bolds **Sotomayor** with the Obama/(D) dot; a "wright" query returns 8 real judges spanning a
>   sitting CIRCUIT judge (Dorothy Wright Nelson, ca9 — correctly ranked ABOVE the district
>   judges despite an identical exact-match score, confirming the courtRank tie-break), several
>   district judges correctly grouped/ordered by circuit, and two lower-tier substring matches
>   (Court**wright**, Cart**wright**) correctly sorted after every exact match.
> - `smoke.mjs`/`browser-checks.mjs` both ALL PASS; no regressions in either existing suite.

> **SESSION (ce), 2026-09-11 — Territorial-court note bottom-alignment in Timeline mode, and
> Summary > Supreme Court's FedSoc default + legend key.**
> - **Territorial-court note, root-caused as a missing stretch, not a missing height formula.**
>   VI/GU/NMI's always-visible note ("The territorial district courts do not sit en banc...") sat
>   flush at the docked panel's bottom in Majority mode but floated mid-panel with a gap below it
>   in Timeline mode. `.ctt-pane-body > .ctt-stage-row { flex: 1 0 auto; }` already forces the
>   STAGE ROW itself to fill all leftover pane height in BOTH modes — that was never the gap. The
>   actual cause: `.ctt-stage-main` (the column holding the judge stage + the note) had no
>   `align-self: stretch`, so — unlike `.ctt-detail`, which does — it sat at `align-items:
>   flex-start`'s default, taking only its own natural content height within the already-tall
>   row and leaving the rest of the row empty below it. Majority mode's `majorityStageHeight()`
>   masked this by explicitly inflating the STAGE to nearly fill the row, landing the note close
>   to the bottom by construction; Timeline's `timelineStageHeight()` sizes purely from row count,
>   with no such compensation, so the gap was only ever visible there. Fixed properly:
>   `align-self: stretch` + `display: flex; flex-direction: column` on `.ctt-stage-main` (now it
>   actually fills the row, matching `.ctt-detail`), and `margin-top: auto` on `.ctt-note` (pushes
>   whichever note is present to the bottom of that now-stretched column) — a normal "sticky
>   footer" flex pattern, reverted to a fixed 6px in the mobile media query where `.ctt-stage-row`
>   stops being a flex row at all. Verified in a real browser: VI/GU/NMI's note now sits flush at
>   the panel's bottom in BOTH Timeline and Majority mode; Majority mode's own already-correct
>   positioning (both territorial and ordinary courts) is unaffected; a regular court's stage
>   still doesn't overflow.
> - **Summary > Supreme Court: FedSoc defaults ON, with a legend key.** SCOTUS's own Summary
>   pane has no None|FedSoc|ACS switch of its own to toggle this from (unlike every ordinary
>   court pane) — operator ask: since SCOTUS has few enough justices to make the affiliation
>   iconography genuinely legible, default it on rather than leaving it undiscoverable there.
>   Implemented as a ONE-TIME session default (`S._affilMarkTouched`, mirroring how other
>   one-time app defaults already work): `renderSummaryScotus` sets `S.affilMark = "fedsoc"` only
>   if no REAL choice (a manual toggle click on any ordinary court pane, or this default itself)
>   has happened yet — so it never overrides a choice the operator has already made, wherever
>   they made it. Added a right-aligned legend key (`.ctt-scotus-affil-key`) in the SAME
>   horizontal band as the "Supreme Court of the United States / 9 authorized · 9 active · 0
>   vacant" title+meta text, via `position: absolute` on the now-`position: relative`
>   `.ctt-summary-content` (same technique `.ctt-district-deploy-btn` already uses for its own
>   analogous right-side placement) — a small dashed-ring swatch (the SAME visual convention
>   `.ctt-affil-marked .ctt-avatar` itself already uses) followed by "= *reported* **FedSoc**
>   *affiliation*".
> - **Tested**: extended `tests/smoke.mjs` (the FedSoc default firing condition — reset to an
>   untouched state first, since an earlier ordinary-court test in the same run already makes a
>   real choice — the legend key's presence/text, and that a real prior choice is never
>   overridden by revisiting SCOTUS) and `tests/browser-checks.mjs` (the territorial-note
>   bottom-alignment regression in both modes plus a no-regression check for ordinary courts, and
>   the legend key's same-band/right-aligned geometry — all real-browser checks, since jsdom
>   reports 0 for every box). `smoke.mjs`/`browser-checks.mjs`/`stress.mjs` (12 cycles) all pass.

> **SESSION (cd), 2026-09-10 — Deploy-button arrow direction, click-to-pin from the circuit
> table, an alternate ca1/ca3 drill-in sub-assembly layout, and an empty-hint alignment fix.**
> - **Deploy button arrows now flip with the label**: "▼ Set upon map ▼" (pointing down, toward
>   the map) / "▲ Remove from map ▲" (pointing up, bringing it back) — `districtDeployBtnLabel()`
>   picks the arrow from the same `S.districtOnMap` check that picks the label text, so they can
>   never disagree.
> - **New feature: clicking a row in the circuit table pins that district.** Refactored the
>   existing cartogram-block click-to-pin logic (setHover + `S.districtDetailPinnedId` +
>   `.ctt-pinned` + re-render + applyGrowth) out into a named `pinDistrictCourt(did)` closure so
>   the SVG block-click handler and a new per-row click handler in `renderDistrictCircuitTable`
>   (threaded through `showDistrictDetail`'s new `onRowClick` parameter) share one implementation
>   rather than risking two pinning paths drifting apart. The Total row is a different class
>   entirely (`ctt-district-row-total`, not `ctt-district-row`) so it never gets this wiring.
> - **Alternate ca1/ca3 drill-in sub-assembly layout.** The 1st/3rd Circuits' district-block
>   cartogram was originally built with PR and VI positioned relative to EACH OTHER (a deliberate
>   cross-circuit layout for the deployed/Summary-preview presentation), which reads wrong for a
>   single circuit's own sub-assembly. Operator supplied `temp_alt_ca1_ca3.txt` — a raw
>   `district-block/circuit-linked@2` round-trip export from `tools/district-block-builder.html`
>   (ownership + click-order per cell; colors never stored in that format, always re-derived).
>   Wrote `scripts/build_district_arrangement_alt.py`, porting that same tool's own
>   `resolvedCellColors()`/`colorForCell()`/`rankOf()`/`colorSequence()` algorithm line-for-line
>   (read directly from `tools/district-block-builder.html`, not reinvented) so a re-run always
>   agrees with what the tool itself would produce — resolves colors against the CURRENT
>   `data/seat_blocks.json` (every district's cell count matched its seat_blocks total exactly,
>   zero mismatches) and writes `data/district_arrangement_alt.json` in the same frozen
>   `district-block/arrangement@1` shape `district_arrangement.json` itself uses. Registered in
>   the manifest (`build_assets.py`, same drift-check treatment as the main file) and consumed
>   ONLY by `renderDistrictSubassembly` for `DISTRICT_SUBASSEMBLY_ALT_CIRCUITS = {ca1, ca3}` — the
>   deployed national overlay and the Summary preview keep using the original file unchanged
>   (verified: prd's cell count matches in both, but ca1's own sub-assembly view now shows it
>   repositioned). The raw operator-supplied file itself is left untouched and gitignored (a
>   one-time handoff, not a consumed asset — the script's output is).
> - **Empty-hint text alignment, root-caused.** Summary > District's hint sat 2px lower than
>   Summary > SCOTUS's own — `.ctt-detail-content > div`'s generic 2px top margin collapses with
>   `.ctt-detail-content`'s own 2px margin-top in the shared (plain block) judge-detail panel,
>   landing the hint flush at the content box's own top edge; `.ctt-district-detail`'s own
>   `.ctt-detail-content` is `display:flex` (needed for the table/name/button layout elsewhere in
>   the SAME panel, from session bx), and flex containers never collapse margins with their
>   children, so the identical hint sat 2px lower there instead. Cancelling the hint's own
>   margin-top in that one scoped context reproduces the collapsed position exactly.
> - **Tested**: extended `tests/smoke.mjs` (arrow-direction assertions, row-click-pins-district
>   including the Total-row exclusion) and `tests/browser-checks.mjs` (arrow flip, ca1/ca3 alt
>   arrangement vs. unaffected Summary preview, the empty-hint parity regression — all real-
>   browser geometry checks). `smoke.mjs`/`browser-checks.mjs`/`stress.mjs` (12 cycles) all pass.

> **SESSION (cc), 2026-09-09 — Two operator reports, both self-corrections: (cb)'s caption
> promotion broke Summary height/text parity between SCOTUS and District, and an earlier
> session's title-stability fix (2026-09-07) had been scoped to the wrong element entirely.**
> - **Bug 1 — Summary height/text parity, root-caused precisely.** (cb) promoted the District
>   caption to a title+meta pair but nested it inside `.ctt-pane-controls`, whose own scoped
>   `margin: 6px 0 5px` (from session bz) pushed the text down 6px from where SCOTUS's own
>   `renderSummaryScotus` starts its identical-looking subtitle+meta chain — breaking BOTH the
>   text's own y-position (operator: "SCOTUS text is higher... copy that") and, compounded by the
>   caption/button flex row's own height being taller than SCOTUS's plain 2-line chain, the whole
>   panel's cumulative height. Fixed by literally mirroring `renderSummaryScotus`'s structure:
>   `captionTitle`/`captionMeta` are now DIRECT children of `.ctt-summary-content`, in a
>   `display:flex; flex-direction:column` wrapper (`.ctt-district-caption-row`) — flex-column,
>   not plain block flow, matters here too: `.ctt-summary-content` is itself a flex column, so
>   SCOTUS's subtitle/meta margins DON'T collapse (2px+2px=4px gap); a plain block wrapper would
>   have collapsed them to 2px, a subtler SECOND mismatch. The deploy button moved from a flex
>   sibling to `position:absolute` (anchored to `.ctt-district-caption-row`, which is
>   `position:relative`) so it can still sit right-aligned/vertically-centered against the
>   caption without adding one byte of its own height to that flow — verified pixel-identical
>   (not just "close") top, left, content-row-top, AND content-row-bottom between the two
>   sub-tabs via `getBoundingClientRect()`, added as a permanent regression test given this is
>   the second time this exact parity has broken.
> - **Bug 2 — the 2026-09-07 title-stability fix was scoped to the wrong element from the start.**
>   Re-reading the operator's original ask: "the 'U.S. District Court for the...' label text" in
>   the request meant the Summary > District docked tooltip's own name line
>   (`.ctt-district-detail .ctt-detail-name`, shown when hovering/pinning a cartogram block) —
>   NOT `.ctt-pane-title`, the ordinary per-court pane's own title reached by actually drilling
>   into a circuit and selecting a district. That misreading was already worked around once
>   (rescoping the reservation from ALL courts to district-level courts only, after it regressed
>   CFC's pane into a scrollbar) without questioning whether it belonged on `.ctt-pane-title` at
>   all. Fully reverted `.ctt-pane-title--district` (JS class-adding logic and both CSS rules) —
>   ordinary drill-in panes (moed, gud, nmid, everything) now behave exactly as they did before
>   2026-09-07, sized to their own actual content with no reservation. Re-applied the SAME
>   min-height concept (3 lines desktop / 2 mobile) to `.ctt-district-detail .ctt-detail-name`
>   instead, this time also setting `line-height: 1.25` explicitly on it — `min-height: 3.75em`
>   without an explicit line-height silently used `.ctt-detail`'s own inherited 1.45, computing a
>   FLOOR (52.5px) shorter than what a genuine 3-line name actually needs (60.9px), so shorter
>   names sat at the wrong (too-short) floor while longer ones still grew past it — caught by
>   measuring the tooltip's name-box height across many different districts in a real browser and
>   finding it WASN'T actually constant, not by assuming the CSS was correct because it compiled.
> - **Verified**: rewrote the now-stale browser-checks.mjs assertions from the 2026-09-07 session
>   (gud/nmid title-height parity, the CFC-scrollbar guard) to check the CORRECT element instead,
>   confirmed ordinary panes carry no reservation CSS at all (`min-height: 0px`, checked directly
>   rather than relying on incidental wrapping at one window width), and added a new check
>   hovering many different districts in the Summary tooltip to confirm the name-box height is
>   now GENUINELY constant end-to-end. `smoke.mjs`/`browser-checks.mjs`/`stress.mjs` (12 cycles)
>   all pass.

> **SESSION (cb), 2026-09-08 — Four more operator reports: sticky-hover-while-pinned refined,
> the District caption promoted to a real title+meta, all-four-edge partial clipping for the
> deployed assembly, and the drill-in sub-assembly wired to the map's own block-growth + click.**
> - **Sticky-while-pinned refined, not reverted.** (bz)'s sticky-hover contract was correct for
>   the unpinned case, but once a district WAS pinned, hovering a DIFFERENT district still used
>   the same sticky rule — it grew and then stayed grown after the cursor left, reading as a
>   second, equally-"locked" district next to the real pin. Fixed by making stickiness
>   conditional: `wireDistrictCartogramHover` now takes an `anyPinned()` callback alongside
>   `isPinned()`, and re-evaluates on every pointermove/pointerleave (`sticky && !anyPinned()`)
>   instead of capturing a fixed value at wire time — while nothing is pinned, hover is sticky as
>   before; once something IS pinned, every OTHER district's hover-growth reverts to transient
>   (grows while actively hovered, un-grows on leave), while the actual pin's own growth (via
>   `isPinned`) is untouched either way. Added a permanent jsdom regression test.
> - **District caption promoted to a real title + summary line.** "Party of District Court
>   Appointments, Arranged by Circuit" now renders via the same `.ctt-summary-subtitle` (bold)
>   class every other pane's own title uses, with a `.ctt-pane-meta` line underneath summarizing
>   nation-wide district totals — `${authorized} authorized · ${active} active · ${vacant}
>   vacant` — via a new `districtNationalTotals()` helper that sums straight from `seatBlocks`
>   (active = r+d+o = authorized−vacancies) so it can never drift from what the table/blocks
>   themselves show.
> - **Partial-clip dragging generalized from the bottom edge to all four.** The bottom-only
>   `vh - 40` fixed-pixel clamp became a symmetric `DISTRICT_OVERLAY_MAX_HIDDEN_FRAC = 0.8`
>   applied to left/right/top/bottom alike — at most 80% of the assembly's own width or height
>   may be dragged past any one edge, so it can be tucked mostly out of the way on any side
>   without ever being lost entirely. This needed `aspect` to start riding along inside
>   `S.districtMapState` itself (previously computed once and discarded) since `sizeDistrictOverlay`
>   had no other way to re-derive the assembly's current HEIGHT (only left/top/width persist) to
>   clamp top/bottom the same principled way width already clamps left/right.
> - **Drill-in sub-assembly wired to the map's existing block-growth + click-to-open patterns.**
>   Hovering a sub-assembly cartogram block now also grows the REAL on-map seat-block grid for
>   that same district (`highlightBlock(currentSVG(), did, "ctt-block-hover")` — the exact
>   mechanism a direct map-shape hover already uses, reused rather than reinvented) alongside the
>   blue shape tint (ca) already added; clicking a block now opens that district's own info pane
>   (`jumpToDistrictCourt` — its internal `drillIn` call is a harmless no-op since we're already
>   in this circuit).
> - **Tested**: extended `tests/smoke.mjs` (sticky-while-pinned regression, caption
>   title+meta text, sub-assembly block-growth + click-opens-pane) and `tests/browser-checks.mjs`
>   (caption bold/position, all-four-edge clip percentages in a real browser — jsdom can't measure
>   any of this). `smoke.mjs`/`browser-checks.mjs`/`stress.mjs` (12 cycles) all pass.

> **SESSION (ca), 2026-09-07 — Six more operator reports: pane-title stability, an Appellate
> rename, deploy-button layout, a hover-growth scale reduction, a circuit Total row, and a
> severe hidden bug (hover was growing EVERY district in the deployed assembly at once).**
> Bug 13's core issue was the significant one — see its own writeup below.
> - **Pane-title stability, scoped correctly on the SECOND attempt.** "U.S. District Court for
>   the ..." wraps to 2 or 3 lines depending on the specific district, and since `.ctt-pane-title`
>   had no reserved height, everything below it (controls, judge stage) shifted position between
>   selections. Fixed with `min-height: 3.75em` (3 line-heights) — but the FIRST attempt applied
>   this to the bare `.ctt-pane-title` class shared by every court level, which pushed CFC's own
>   pane (a short, single-line title that never needed the extra room) into a NEW vertical
>   scrollbar — caught by `browser-checks.mjs`, not eyeballed. Rescoped to a `.ctt-pane-title--
>   district` modifier class, added by JS only when `court.court_level === "district"`, leaving
>   every other court level's title untouched. Mobile gets its own 2.5em (1-2 lines) reservation.
> - **Renamed Summary > "Courts of Appeals" to "Appellate Courts"**, matching "District Courts"'s
>   own naming convention (operator ask).
> - **District controls row restyled**: the "Set upon map" button moved to the right, sized to
>   match the docked detail panel's own 232px width (`margin-left:auto` + `flex:0 0 232px`,
>   scoped to `.ctt-district-deploy-btn` so the shared `.ctt-pane-controls` class elsewhere is
>   untouched), its label flanked by down arrows (`▼ Set upon map ▼` / `▼ Remove from map ▼`,
>   via a small `districtDeployBtnLabel()` helper so both the initial render and every later
>   `setDistrictOnMap` re-render agree); the vacated left space now reads "Party of District
>   Court Appointments, Arranged by Circuit".
> - **Hover-growth scale reduced (1.35 → 1.15)**: now that (bz)'s non-scaling-stroke fix closes
>   the cartogram's gutter by a fixed SCREEN-pixel amount regardless of zoom, the scale no longer
>   needs to be large enough to close the gap geometrically — its only job now is the visual
>   "grow" feel, so it came back down close to the map's own 1.17x after the operator inspected
>   it closely across the Summary preview, the on-map overlay, and the (much smaller) sub-assembly.
> - **Circuit Total row**: `renderDistrictCircuitTable()` now inserts a bolded `Total` row summing
>   R/D/vacant across every district in the circuit, directly below the pinned/hovered row,
>   flanked by heavier (2px, not the ordinary 1px) separator lines (`border-collapse` merges each
>   with its neighbor's own border into one line, so styling the Total row alone is enough).
> - **Bug 13, the real one: hovering ONE district grew every district in the assembly at once.**
>   Root cause, found by adding temporary instrumentation rather than guessing: `grow = (hoveredId
>   && sqDid === hoveredId) || (isPinned && isPinned(sqDid))` evaluates to `undefined`, not
>   `false`, whenever `isPinned` isn't a function (the plain on-map/sub-assembly wiring, which
>   passes no 4th `opts` arg) — `&&`/`||` return operand VALUES, not coerced booleans.
>   `classList.toggle(name, undefined)` is spec'd to behave as a NORMAL toggle (flip current
>   state) rather than force-remove when its second argument is `undefined`, so on the very first
>   hover, every non-hovered square's ABSENT class flipped to PRESENT. `animateDistrictSquare`'s
>   own ternary never had this problem (real values, 1 or the scale constant) — only the
>   *separate* grown-class bookkeeping (added session bz, for the seam-closing stroke) was wrong,
>   which is why the SCALE itself stayed correctly isolated to one district even while the CLASS
>   (and thus the seam-closing stroke) spread to all of them. Fixed with `!!(...)`. Added a
>   permanent regression test in BOTH `smoke.mjs` and `browser-checks.mjs` given the severity.
>   Bundled with this fix (from the same bug report): the drill-in sub-assembly moved from
>   top-left to bottom-left, and its hover now also ties to the real district shape's standard
>   blue highlight (previously only the deployed national assembly had this — fixed by making
>   `highlightDistrictOnMap` use `currentSVG()` instead of a hardcoded `S.ui.nationalSVG`, since
>   the sub-assembly's real shapes live on the LOCAL circuit SVG, not the hidden national one);
>   the fixed corner controls moved from bottom-left to top-right, with × reordered to be the
>   right-most of the three.
> - **Tested**: extended `tests/smoke.mjs` (Total row sums, arrow-flanked label, scale-constant
>   bounds, the growth-isolation regression, corner-button order) and `tests/browser-checks.mjs`
>   (pane-title height parity + the CFC-scrollbar guard, deploy-button alignment, corner/sub-
>   assembly position, the growth-isolation regression again in a real browser) — several of this
>   session's own claims are CSS-VALUE assertions jsdom structurally can't check (this harness
>   never loads court-tracker.css at all), so those live in browser-checks.mjs only, per this
>   project's existing jsdom/real-browser split. `smoke.mjs`/`browser-checks.mjs`/`stress.mjs`
>   (12 cycles) all pass.

> **SESSION (bz), 2026-09-06 — Five more operator reports against the District feature: pane
> stacking, hover-growth seam artifacting, a 1px Summary height mismatch, fixed-frame map
> controls with a persisted zoom + a "D" redeploy button, and docked-panel element order.**
> Operator used the (by)-fixed feature further and found five more issues, none overlapping (by).
> - **Assembly/sub-assembly must actually GO AWAY under an open pane, not just be covered by
>   it.** Root cause: `.ctt-district-overlay` (and the drill-in `.ctt-district-subassembly`)
>   carry their own `z-index` (for the drag/resize chrome), which put them ABOVE `.ctt-pane`'s
>   default (`auto`) stacking regardless of DOM order — the buildShell comment claiming "both are
>   position:absolute with no z-index, so DOM order IS stacking order" was simply wrong. Rather
>   than fight z-index layering, `togglePane()` now explicitly hides both (`display:none`)
>   whenever the pane opens, via two small helpers (`updateDistrictOverlayVisibility()`,
>   `updateDistrictSubassemblyVisibility()`) that recompute on every pane toggle, drill-in, and
>   drill-out. The deploy "pull out" flyover is untouched — it's a separate, short-lived element
>   this rule never applies to, and by the time the real overlay reappears the pane it flew out
>   of is already closed.
> - **Hover-growth "faint light traces" — a real, measured sub-pixel seam, not eyeballing.**
>   Measured actual `getBoundingClientRect` overlap between adjacent same-district cells at
>   `DISTRICT_SQ_SCALE_HOVER`: a comfortable −0.325px in the roomy Summary preview, but only
>   −0.15px in the on-map deployed overlay (280px wide for the whole country's cartogram) — a
>   fixed VIEWBOX-unit margin that shrinks right along with the cartogram's own render scale, so
>   it stops reliably covering the seam once the container gets small enough. Fixed by giving
>   grown cells a `stroke` matching their own fill, `vector-effect: non-scaling-stroke` (the same
>   "must stay constant on screen regardless of zoom" pattern CLAUDE.md already documents) — pads
>   the shape by a fixed SCREEN pixel amount instead of a fixed viewBox-unit one, closing the
>   seam regardless of how small the cartogram renders.
> - **1px Summary height mismatch, root-caused, not eyeballed either.** SCOTUS's header
>   (subtitle + meta) and District's (`.ctt-pane-controls`, for "Set upon map") measured 41px vs.
>   42px of cumulative margin+height before both correctly hit the SAME fixed bottom edge —
>   `.ctt-stage-row` and `.ctt-district-layout` started 1px apart as a result. Shaved 1px off
>   `.ctt-pane-controls`' bottom margin, scoped to `.ctt-summary-content > .ctt-pane-controls`
>   only (it's also the ordinary-court majority-toggle row elsewhere, an unrelated layout chain).
>   Verified both panels now measure IDENTICAL top AND bottom in real Chrome.
> - **Fixed-frame map controls, a "D" redeploy button, and a remembered zoom.** The ×/−/+
>   controls moved out of `.ctt-district-overlay` (where they dragged/resized WITH the assembly,
>   hard to hit reliably) into a new always-present `.ctt-district-corner-controls` div anchored
>   to the viewport's own bottom-LEFT corner (deliberately not the assembly's own bottom-right
>   default, nor the seat blocks' northeast clustering — see `defaultDistrictMapState`'s own
>   comment). This box now renders from the very first national-view load, not just after a
>   deploy: when the assembly isn't currently shown (never deployed, or removed via ×) it shows
>   a single "D" button instead, which redeploys in place (if `S.districtMapState` survived a
>   plain removal) or loads the arrangement and deploys fresh (if Summary > District was never
>   opened this session) — no more requiring a trip back to Summary just to get the assembly back
>   on screen. The assembly's own partial-bottom-clip dragging (`sizeDistrictOverlay`'s existing
>   `vh - 40` clamp — drag it mostly off-screen, keep some of it visible, never lose it entirely)
>   needed no change; decoupling the controls is what makes that clipping actually usable, since
>   the controls no longer clip along with whatever portion of the assembly is dragged off-frame.
>   Zoom (width only, never position — "Set upon map" already always resets position fresh)
>   persists across page reloads via a try/catch-guarded `localStorage` read/write, the first use
>   of localStorage in this codebase; `defaultDistrictMapState` reads it back as the base width
>   instead of a hardcoded 280, still subject to the same viewport-fit clamps.
> - **Docked-panel element order (table on top, name + Jump button anchored at the bottom).**
>   Pure DOM-order change in `showDistrictDetail()` — table first, name and button after — which
>   falls out of the SAME flex-column mechanics (by)'s bug-1 fix already put in place
>   (`.ctt-district-detail > .ctt-detail-content`, table wrap `flex:1 1 auto`/`min-height:0`,
>   everything else `flex:0 0 auto`) purely because the table is now the FIRST (and only
>   flexible) child. Verified directly: forcing an artificially long, multi-line court name grows
>   the name's own height and correspondingly SHRINKS the table wrap's height to match — the
>   "cutoff flexes with the name's line count" requirement, confirmed by measurement, not assumed
>   from the CSS.
> - **Tested**: extended `tests/smoke.mjs` for the corner-controls/D-button/zoom-persistence
>   flow (added `globalThis.localStorage` to the jsdom harness — the first test in this suite to
>   need it) and the pane-covers-the-assembly rule; `smoke.mjs`/`browser-checks.mjs`/`stress.mjs`
>   (12 cycles) all pass. All five fixes additionally confirmed with real `getBoundingClientRect`/
>   computed-style measurements in headless Chrome (throwaway scripts, not checked in) — the
>   seam-closing and height-alignment fixes in particular were root-caused from ACTUAL measured
>   numbers, not visual guesses, matching this project's own established discipline for exactly
>   this class of bug.

> **SESSION (by), 2026-09-06 — Two (bx) bug reports fixed: table growth was pushing the whole
> pane into an outer scrollbar instead of clipping internally; hover stickiness/row-highlighting
> didn't actually match the judge-detail panel's documented contract.** Operator used the
> District feature from (bx) and reported both live.
> - **Bug 1 — table overflow root-caused two levels deep, not just the flex-shrink pass (bx)
>   already did.** (bx) correctly changed `.ctt-pane-body > .ctt-summary-content` /
>   `.ctt-summary-content > .ctt-stage-row`/`.ctt-district-layout` from `flex: 1 0 auto` to
>   `flex: 1 1 auto` so the row COULD shrink, but that alone didn't fix the 9th Circuit's
>   15-row table (operator repro). Two more gaps, found by measuring real `getBoundingClientRect`
>   geometry in headless Chrome rather than guessing from the CSS: (1) `.ctt-district-detail`
>   itself had no `align-self: stretch` — `.ctt-district-layout`'s `align-items: flex-start`
>   means a row flex child otherwise just hugs its own content height, so the detail box grew to
>   fit ALL 15 rows instead of being capped to the row's actual available height (its sibling,
>   `.ctt-district-cartogram-wrap`, already had this from (bx)'s centering fix — the detail box
>   never got the same treatment). (2) even after bounding the box, `.ctt-district-table-wrap`'s
>   own `flex: 1 1 auto; min-height: 0; overflow-y: auto` did nothing, because its actual parent
>   in the DOM is `.ctt-detail-content` — a plain (non-flex) block div shared with the judge-detail
>   panel — and flex properties on a child are inert unless the parent is itself `display: flex`.
>   Fixed by scoping a flex-column declaration to `.ctt-district-detail > .ctt-detail-content`
>   specifically (leaving the bare `.ctt-detail-content` rule, and the judge-detail panel that
>   uses it, untouched), with a `> *` default of `flex: 0 0 auto` for the name/jump-button rows
>   and a higher-specificity override (`.ctt-district-detail > .ctt-detail-content >
>   .ctt-district-table-wrap`, mirroring the existing `.ctt-pane-body > .ctt-stage-row` vs.
>   `.ctt-pane-body > *` specificity trick) so the table wrap alone gets `flex: 1 1 auto`.
>   Verified directly in headless Chrome (not jsdom, which reports 0 for every box): 9th Circuit's
>   `.ctt-pane-body` now measures `scrollHeight === clientHeight` (no outer scrollbar) while
>   `.ctt-district-table-wrap` itself measures `scrollHeight (366) > clientHeight (306)` — the
>   scroll genuinely moved inside the table, as asked.
> - **Bug 2 — (bx)'s hover/pin split was actually the wrong reading of "sticky."** (bx) had
>   read the operator's original ask as "reorder+bold only when PINNED, hover-in-place only
>   otherwise" and built two separate row classes (`ctt-district-row-hover` /
>   `-row-pinned`) plus an `onHover` callback that reset the panel to the empty hint on every
>   `pointerleave`. The operator corrected both halves: hovering alone (no click) must be
>   STICKY — content and the block's grown state persist after the cursor leaves, exactly like
>   the pre-existing judge-detail panel's own `hideDetail()`/`unpinDetail()` contract, which
>   never resets on hover-out — and the reorder-to-top/bold/highlight row treatment must apply
>   on mere hover too, identically to a pin, not gated behind clicking. Fixed by collapsing the
>   two row classes into one (`ctt-district-row-active`, applied unconditionally to whichever
>   district is "current" — hovered or pinned, no distinction) and rewriting
>   `wireDistrictCartogramHover` to take a `{ sticky, isPinned }` options object: in sticky mode,
>   a genuine hover over a NEW district still replaces the current one, but a gap/leave event
>   never clears it — only a different real hover does. Pinning now layers a LOCK on top of the
>   same sticky-hover state (via `setHover(did)` synced at click time) rather than being a
>   parallel, differently-behaved mechanism; unpinning (`unpinDistrictDetail()`, both via the
>   close button and the shared document-`mousedown` click-elsewhere listener) now matches
>   `unpinDetail()`'s own precedent exactly — it only drops the lock class, it does NOT reset
>   content, leaving whatever's currently sticky-hovered on screen until a real new hover
>   replaces it. `applyGrowth`/`setHover` are stashed on `S.ui.districtSummaryHover` so the
>   module-level `unpinDistrictDetail()` (no closure access to the render) can still trigger a
>   correct re-evaluation.
> - **Tested**: rewrote the stale (bx) assertions in `tests/smoke.mjs` for the new unified
>   `.ctt-district-row-active` class and the corrected no-reset-on-unpin/hover-take-over
>   behavior (mere hover reorders+bolds+persists; pin adds a lock; click-elsewhere/close both
>   leave content in place). `smoke.mjs` (jsdom), `browser-checks.mjs`, and `stress.mjs` (12
>   drill-in cycles) all pass unmodified otherwise. Wrote a throwaway CDP script (not checked
>   in) to directly confirm both bugs in real Chrome per the geometry numbers above — this is
>   the same "measure `getBoundingClientRect`, don't eyeball or trust jsdom's zeroed layout"
>   discipline `browser-checks.mjs`'s own header comment already documents.

> **SESSION (bx), 2026-09-05 — Summary > District docked panel: circuit-wide table replaces
> plain R/D/vacant text; sticky pin + click-elsewhere standardized to match the judge-detail
> panel; dock-height/vertical-centering fix.** Operator feedback after using the finished
> District feature from (bw).
> - **New table, styled after `tools/district-block-builder.html`'s own District linker
>   table.** The old `X Republican-appointed / Y Democratic-appointed / Z Vacant` text lines
>   are gone. The "Jump to this court →" button moved up to sit right below the court name
>   (was at the bottom). Below that: a bold `"Nth Cir. Districts"` label (just `court.short_name`
>   from `courts.json` — no hand-rolled ordinal-suffix logic needed, `courts.csv` already has
>   "1st Cir."/"D.C. Cir." etc.), then a **header-less** table (District | R | D | Vacant) for
>   every district IN THAT DISTRICT'S OWN CIRCUIT, standard (alphabetical, matching the
>   block-builder tool's own convention) order — new `districtsForCircuit()` /
>   `renderDistrictCircuitTable()`. Swatches are the block-builder tool's SQUARE style (not this
>   file's own circular `.ctt-dot`, which the operator explicitly didn't want here), but with
>   the **count before the swatch** — the operator's one deliberate reversal from the source
>   tool's own count-after-swatch convention. A large circuit's table (the 9th's 15 districts)
>   scrolls locally inside its own `overflow-y:auto` wrapper rather than pushing the rest of the
>   panel around, though empirically it fully fits without scrolling at normal desktop widths.
>   The pinned district's row is REORDERED to the top and bolded/highlighted
>   (`.ctt-district-row-pinned`); a merely-HOVERED (not pinned) row is highlighted in place with
>   NO reorder and no bold (`.ctt-district-row-hover`) — a deliberate reading of the operator's
>   spec, which only described the reorder+bold behavior for the pinned case: reordering rows
>   under the cursor while just hovering across many blocks would be visually jarring in a way
>   pinning (a deliberate, sticky action) is not.
> - **Two real standardization gaps closed, matching the judge-detail panel exactly** (operator:
>   "this tooltip dock has nonstandard behavior... those standards exist and should be copied"):
>   (1) **sticky visual growth** — a pinned district's blocks now STAY enlarged after the cursor
>   leaves, until explicitly unpinned; previously only the PANEL CONTENT survived hover-out (via
>   the existing `pinned` check gating `onHover`), but the block's own scale reset back to 1
>   unconditionally on `pointerleave`, since that lived in `wireDistrictCartogramHover` entirely
>   outside the content-pinning logic. Fixed by making `wireDistrictCartogramHover` accept an
>   `isPinned(did)` predicate and folding it into the SAME grow/shrink decision every square
>   already makes on every hover change — "is this the hovered one OR the pinned one" — and
>   exposing an `applyGrowth()` escape hatch so an EXTERNAL state change (clicking a NEW block
>   while a DIFFERENT one is pinned) can force a full re-evaluation without needing setHover's
>   own unchanged-hoveredId short-circuit to cooperate. (2) **click-elsewhere-to-close** — the
>   district panel had no equivalent of the single global `document.addEventListener("mousedown",
>   ...)` the judge-detail panel already relies on; extended that SAME listener (not a second
>   one) to also check a new `S.districtDetailPinnedId` and call a new `unpinDistrictDetail()`.
>   **This required promoting pin state from a local closure variable to module-level `S`
>   state** — the existing local `let pinned` had no way for a document-wide listener to reach
>   it. A useful side effect: since state now lives on `S` rather than being torn down and
>   recreated every render, a pin now correctly SURVIVES switching Summary sub-tabs and back
>   (screenshot- and test-verified) rather than silently resetting — arguably a THIRD fixed gap,
>   not explicitly requested but a natural consequence of doing the promotion correctly.
> - **Dock height + vertical centering, root-caused precisely, not patched superficially.**
>   SCOTUS's and a regular court's own docked panel already "extend to the bottom" because their
>   stage gets an explicit JS-computed height (`majorityStageHeight()`) filling available room,
>   and `.ctt-detail`'s `align-self:stretch` matches it; the enabling CSS rule
>   (`.ctt-pane-body > .ctt-stage-row { flex: 1 0 auto; }`) is a **direct-child selector**, and
>   Summary's own content sits ONE level deeper (`.ctt-pane-body > .ctt-summary-content >
>   .ctt-stage-row` for SCOTUS, `> .ctt-district-layout` for District) — so that rule silently
>   never reached either Summary sub-tab's row, not just District's. Propagated the same
>   "absorb leftover height" flex treatment down through BOTH levels
>   (`.ctt-pane-body > .ctt-summary-content` AND `.ctt-summary-content > .ctt-stage-row` /
>   `.ctt-district-layout`) rather than special-casing District alone — this is why SCOTUS's own
>   dock height came out UNCHANGED (443px) when measured before/after, exactly as intended,
>   while District's (previously short) now measures the same ballpark (442px) instead of
>   whatever the cartogram's own natural aspect-ratio height happened to be. Vertical centering
>   itself needed one more step beyond the height fix: `.ctt-district-cartogram-wrap` also
>   needed `align-self: stretch` (to actually RECEIVE the row's now-larger height — without it,
>   the wrap stays exactly as tall as the SVG, leaving nothing to center within) plus its own
>   `flex-direction: column; justify-content: center`. Measured directly in a real browser
>   (`getBoundingClientRect`, not eyeballed): 51.98px above the cartogram vs. 52px below —
>   effectively pixel-perfect, though a first screenshot READ as top-heavy at a glance until the
>   actual gap measurements settled it (a wide full-page screenshot at normal viewing scale is
>   an unreliable way to judge a ~50px symmetric gap; the precise rect measurement is what
>   actually confirmed the fix, and is the more trustworthy check to reach for next time a
>   "is this really centered" question comes up).
> - **Tested**: `tests/smoke.mjs` extended substantially — table structure (label text, full
>   row count, no header, count-before-swatch markup order), pin reorder-to-top-and-bold vs.
>   hover-highlight-in-place, sticky growth surviving `pointerleave`, click-elsewhere unpinning
>   (via the same `mousedown`-on-`document.body` technique the existing judge-detail test
>   already used — reused rather than reinvented), and pin-survives-sub-tab-switch. One test
>   assertion needed a `sleep()` fix after initially failing for a a-real-reason-but-not-a-bug:
>   checking `_sqScale` immediately after triggering an EASED shrink animation (matching the
>   map's own 90ms block-scale feel) caught the animation mid-flight, not its settled value —
>   same class of timing subtlety this test file has hit before with other eased properties.
>   Real-browser CDP screenshots confirm the table, pin, and centering all render correctly;
>   `browser-checks.mjs`/`stress.mjs` pass unmodified.
> - Next: nothing outstanding from this round of feedback. The Summary-tab feature (from (bs)
>   through (bx)) is feature-complete and polished per every operator round so far.

> **SESSION (bw), 2026-09-04 — District phase, Milestone 3: the deploy-only "pull out"
> animation. This closes out the Summary-tab initiative from (bs) — everything in the original
> operator spec is now built.** The last explicitly-deferred piece from (bv): "the summary pane
> flips up but allows the whole of the district court block... assembly to stay, then the
> blocks move and shrink into a default position on the map," and — critically — this effect
> exists ONLY for deploying, never for returning (hide/redeploy elsewhere stay instant, per (bv)).
> - **Technique**: measure the cartogram `<svg>`'s live `getBoundingClientRect()` INSIDE the
>   Summary pane before anything moves, close the pane (`deselect()` — same path as the ×
>   button, giving "the summary pane flips up" for free), then animate an independent
>   `position:fixed` floating clone (`.ctt-district-flyover`, freshly built via the same
>   `buildDistrictCartogramSVG`) from that captured start rect to the computed on-map target
>   rect via a CSS `left/top/width/height` transition. On `transitionend` (with a timeout safety
>   net in case that never fires), the clone is removed and the real persistent
>   `deployDistrictOverlay()` takes over — this is why the assembly reads as one continuous
>   object migrating, rather than vanishing with the pane and reappearing elsewhere.
>   `prefers-reduced-motion` skips straight to the instant deploy, same convention as every
>   other animation in this codebase.
> - **Real bug caught by screenshot, not by the code**: the flyover initially rendered every
>   square solid BLACK instead of its real red/blue/other/vacant color. Root cause: `.ctt-sq-
>   rep`/`-dem`/`-other` read `var(--ctt-rep)` etc., and those custom properties are defined on
>   `.ctt-root` — but the flyover is deliberately appended to `document.body` (same reason
>   `S.ui.tooltip` already is: it must paint above the ENTIRE widget including the pane, which
>   `.ctt-root`'s own DOM-order-based stacking can't guarantee from outside it), so the
>   properties don't cascade to it and `fill` silently fell back to its initial value (black).
>   Fixed by copying the 3 needed custom properties onto the flyover's own inline style at
>   creation time (`.ctt-sq-vacant`'s colors are hardcoded, not `var()`-based, so it was never
>   affected) — a small, self-contained fix that avoids re-parenting into `.ctt-root` and
>   re-litigating whether its `overflow:hidden` would clip a `position:fixed` descendant.
> - **Tested where jsdom structurally cannot**: added a new `tests/browser-checks.mjs` block
>   (not `smoke.mjs` — jsdom's `getBoundingClientRect()` is always zero, which already made the
>   animation path self-skip in every existing jsdom test via its own zero-rect guard, so jsdom
>   can't exercise this code path OR catch a computed-color regression in it) asserting: the
>   flyover exists and is genuinely still animating while the pane has ALREADY closed; its
>   squares' *computed* `fill` is a real color, explicitly not `rgb(0, 0, 0)` (this is the
>   exact assertion shape that would have caught the black-square bug before it shipped); and
>   the clone is cleanly removed with the real overlay visible in its place once settled.
>   Screenshot-verified the mid-flight moment showing correctly-colored squares partway between
>   the Summary pane's position and the final on-map corner. Separately verified
>   `prefers-reduced-motion: reduce` skips the whole flyover and deploys instantly. All prior
>   suites (`smoke.mjs`, `stress.mjs`) pass unmodified.
> - **This closes the loop on the entire Summary-tab feature** first proposed in (bs): SCOTUS
>   ring-split view, Appellate placeholder, and the full District cartogram (static preview +
>   docked detail/pin + on-map deployment with drag/resize/hover-highlight/drill-in
>   sub-assembly + this deploy animation) are all built and tested. Nothing from the original
>   spec is still outstanding.

> **SESSION (bv), 2026-09-04 — District phase, Milestone 2: "Set upon map" deployment — the
> full mechanic, in one session.** Everything from the original (bs) spec that (bu) explicitly
> deferred: the on-map overlay layer, the 3 control buttons, show/hide, resize, drag, real-shape
> hover-highlight, the circuit-drill-in fixed sub-assembly, and the mobile-responsive sizing
> item 4 punted from (bt). This is the single largest piece of the whole Summary-tab initiative;
> it's DONE and tested end-to-end, not a partial slice — the only thing still explicitly out of
> scope is the "pull out of one interface into another" deploy ANIMATION (operator spec: exists
> for deploying, not for returning) — everything currently deploys/hides instantly, no motion.
> - **State**: `S.districtOnMap` (visible right now) and `S.districtMapState` (`{left, top,
>   width}`, CSS px within `.ctt-map-viewport`) — kept deliberately separate, since hiding via
>   the on-map toggle must NOT discard position/size (operator spec: button [2] "bring back...
>   without navigating," i.e. exactly where it was), while a FRESH "Set upon map" from Summary
>   always resets both (operator confirmed: "always replaces," no blocked-redeploy state).
> - **DOM placement, chosen deliberately**: `S.ui.districtOverlay` is inserted into
>   `.ctt-map-viewport` BETWEEN the SVG stack and the info pane in DOM order — both are
>   `position:absolute` with no z-index anywhere in this app, so DOM order alone is stacking
>   order. This gets "the pane covers it by default, same as the rest of the map" for free,
>   with no z-index bookkeeping of its own to get wrong.
> - **Default placement bug caught by screenshot, not guessed right the first time**: an
>   initial top-right default landed the deployed cartogram directly on top of the map's OWN
>   already-dense 1st/2nd/3rd/DC seat-block cluster in the northeast — genuinely unreadable,
>   only visible by actually looking at a screenshot, not from the code. Moved to bottom-right
>   (open Atlantic/Gulf water at every zoom level this app supports), and made the default
>   HEIGHT correct on the first placement by reading the cartogram's own real bbox aspect ratio
>   out of `buildDistrictCartogramSVG`'s return value, rather than guessing a height and
>   fixing it up after the fact.
> - **Buttons styled exactly per spec** ("fill color-transparent but dark circle and button
>   label colors") — a NEW distinct button class from the pane's own solid-fill `.ctt-pane-close`
>   family, since the spec asked for a visually different chrome for overlay controls specifically.
>   The single toggle button literally re-renders itself between two states/icons on click
>   (button [1] "×" ↔ button [2] "▦") rather than being two different buttons — matches the
>   spec's own framing of one control that "turns into" the other. The +/- resize buttons are
>   omitted entirely from the DOM (not just hidden) whenever the assembly itself is hidden, per
>   spec ("these hide when button 1 is clicked").
> - **Resize** resizes around the assembly's own CENTRE (not its top-left corner) so growing/
>   shrinking doesn't visually walk the assembly sideways. **Drag** is 1:1 pointer-delta,
>   guarded so starting a drag on a control button doesn't also move the whole overlay (same
>   guard shape as `tools/tune-seat-blocks.html`'s existing drag code). Both funnel through one
>   `sizeDistrictOverlay()` that reclamps position/width against the CURRENT viewport size on
>   every call (not just at deploy time) — this is also what makes the assembly correctly
>   re-clamp itself on a browser window resize (wired into the existing `window.resize` handler)
>   and is the mechanism behind the mobile-responsive sizing operator item 4 explicitly deferred
>   from (bt): screenshot-verified at 380px width, the deployed assembly scales down
>   proportionally and stays fully inside the viewport with its 3 controls still legible.
> - **Hover-highlight of the real map shape** ("standard blue," operator spec): a NEW dedicated
>   CSS class `.ctt-shape-district-hover` (same fill color as `.ctt-shape-selected`, but
>   independent of it — this fires from a different mouse position than the shape itself, and
>   must not collide with whatever court happens to actually be selected). Cleared centrally
>   inside `updateDistrictOverlayVisibility()` whenever the overlay becomes hidden for ANY
>   reason (toggle, drill-in, redeploy) — one place, not scattered across every hide call site,
>   deliberately mirroring the lesson from (bt)'s docked-detail bug (drift between multiple
>   partial-update call sites is exactly how that one happened).
> - **Circuit-drill-in fixed sub-assembly**: reuses `buildDistrictCartogramSVG`'s
>   `filterCircuitId` parameter added in (bu) specifically so this would need no further
>   refactor — renders ONLY the drilled-in circuit's own cluster, fixed top-left, NOT
>   draggable/resizable (a reference view tied to the circuit being viewed, not a customized
>   object like the deployed national one). Independent of `S.districtOnMap` entirely — shows
>   regardless of whether the national assembly is deployed, hidden, or never touched.
>   `NO_DISTRICT_SUBASSEMBLY = new Set(["cafc"])` excludes the Federal Circuit (no districts of
>   its own, feeders only) per spec. Wired into both `drillIn` exit paths and `drillOut`, with
>   its own staleness guard (mirrors `renderSummaryDistrict`'s async-load pattern) so a fast
>   drill-in/back-out cycle can't paint a stale circuit's blocks after the view has moved on.
> - **Tested**: 25 new `tests/smoke.mjs` assertions covering deploy/hide/show/resize/drag/
>   redeploy-resets/hover-highlight/drill-in-subassembly/cafc-exclusion, all exercised through
>   real DOM events (not calling internal functions directly) so they'd catch wiring mistakes,
>   not just logic bugs. Plus real-browser CDP screenshots at desktop AND 380px mobile widths,
>   including a zoomed crop proving the actual `<path>` fill change on hover (not just the class
>   existing in the DOM). All prior suites (`browser-checks.mjs`, `stress.mjs`) pass unmodified.
> - Next: the deploy-only "pull out of one interface into another" animation (explicitly not
>   built this session — everything else is otherwise feature-complete). After that, the whole
>   original Summary-tab initiative from (bs) is essentially done.

> **SESSION (bu), 2026-09-04 — District phase, Milestone 1: docked per-district detail viewer +
> click-to-pin (Summary > District).** Operator confirmed 2 design questions before this
> started: (1) "Set upon map" always REPLACES whatever's currently deployed (no blocking), and
> (2) the on-map default position/size is the agent's own reasonable call. Operator also
> revisited (bt)'s hover-scale fix after testing it live: the bigger 1.35x growth (which (bt)
> had matched down to the map's 1.17x) actually reads BETTER for this cartogram specifically,
> since same-district blocks often sit with real gaps between them (the block-builder tool's
> trimmed layout doesn't guarantee adjacency) and the bigger scale visually fuses them into one
> shape — reverted to a dedicated `DISTRICT_SQ_SCALE_HOVER = 1.35` constant (kept separate from
> the map's own `BLOCK_SCALE_HOVER`, not reusing it, so the two contexts can keep tuning apart).
> This is the first slice of the large "District lift-onto-map" feature from the original
> Summary-tab spec; see the (bs) entry for the full original ask and today's scope note.
> - **Refactored the cartogram SVG builder out of `renderSummaryDistrict`** into a standalone
>   `buildDistrictCartogramSVG(circuits, filterCircuitId)` — pure, reusable, and (with
>   `filterCircuitId`) already able to render just ONE circuit's cluster, which the later
>   drill-in fixed-sub-assembly milestone will need directly with no further refactor. Kept the
>   Summary/on-map/drill-in presentations from being able to visually drift apart from each other.
> - **Docked detail viewer** (`.ctt-district-detail`): same visual family as the judge-detail
>   panel (shares its `.ctt-detail`/`.ctt-detail-content`/`.ctt-detail-hint`/`.ctt-detail-name`
>   CSS rather than duplicating them), sits to the right of the cartogram in a new
>   `.ctt-district-layout` flex row (mirrors `.ctt-stage-row`, including the same mobile
>   stacking media-query rule). Hover fills it with the district's name + LIVE `seat_blocks`
>   composition (never the frozen export data, same principle as the tooltip already followed);
>   click PINS it (survives mouse-out, has a close × ) — this and the click-to-pin mechanic are
>   exactly the two things the operator's spec says must NOT exist once deployed onto the map,
>   so keeping them cleanly separable in the render path (this function is only ever called for
>   the Summary pane) matters for the next milestone, not just this one.
> - **Jump-to-court button**: on the pinned panel, drills into the district's own parent circuit
>   and opens ITS info pane — `jumpToDistrictCourt()` is just `deselect()` + `drillIn(parent)` +
>   `selectCourt(did)`, composed from existing, already-tested machinery rather than a new
>   navigation path. Screenshot-verified end-to-end: pin a district, click Jump, land on that
>   exact district's own Majority-view pane with the right selector-bar item highlighted.
> - **Found and fixed a real test-fragility issue while adding this**, not a runtime bug: giving
>   the district panel the shared `.ctt-detail` class (for free CSS reuse) made every EARLIER
>   `root.querySelector(".ctt-detail")` in `tests/smoke.mjs` that runs AFTER visiting Summary >
>   District ambiguous — document order now returns whichever detail panel happens to come
>   first, not necessarily the judge one the assertion meant. Fixed by disambiguating those two
>   assertions with `.ctt-detail:not(.ctt-district-detail)` rather than renaming the shared
>   class (which would have meant duplicating a dozen CSS rules) — worth remembering if a THIRD
>   `.ctt-detail`-styled panel ever gets added: bare `.ctt-detail` queries in tests need a
>   second look at that point, not just at this one.
> - **Tested**: `tests/smoke.mjs` extended (docked panel exists/starts with hint, hover fills it,
>   click pins + shows the Jump button, close unpins + resets); real-browser CDP verification of
>   the full pin → jump → land-on-that-court's-own-pane flow, screenshotted at each step. All
>   prior suites (`browser-checks.mjs`) pass unmodified.
> - Next: Milestone 2 — the "Set upon map" deployment mechanic itself (new on-map overlay
>   layer, the 3 map-viewport control buttons, drag/resize, hover-highlight of the real district
>   shape, the circuit-drill-in fixed sub-assembly, the pull-out animation). Continuing in this
>   same session; watch for further dated entries below as each piece lands.

> **SESSION (bt), 2026-09-04 — Summary-tab operator feedback: 4 fixes, then on to the District
> phase.** Operator used the (bs) Summary tab and returned 4 items.
> 1. **Tab labels absorb the removed heading.** `[Supreme Court | Courts of Appeals | District
>    Courts]` replace the old short `[SCOTUS | Appellate | District]` labels, and now double as
>    the pane's own heading — the separate bold "Summary" title + "Supreme Court · Courts of
>    Appeals · District Courts" subtitle line above the switch are both removed as redundant.
>    The "Summary" entry in the left selector BAR is unchanged (only the pane-internal heading
>    went away). The switch itself is enlarged further: 17px/650-weight labels, 14px vertical
>    padding, and `flex:1 1 0` on each option so the three fill the full pane width evenly.
> 2. **Ring geometry retuned.** `SCOTUS_RAISE_DEG` 15°→20°. Ring separation increased via a
>    cleaner formula: the inner ring now sits at exactly **half** the outer ring's radius (was a
>    0.56 ratio balanced against a `desiredR0` width-based formula) — 0.5 is both a rounder
>    number and lands the actual gap ~13.5% wider (104px→118px at the jsdom-deterministic
>    desktop fallback), inside the requested 10-15% window. Re-derived the inner ring's own
>    non-overlap floor for the new 70° angular gap (20° raise instead of 15° narrows it from
>    75°) so tight mobile viewports still can't force the two inner-most seats to touch.
> 3. **Real bug, not just a display glitch: reopening Summary straight into a non-SCOTUS
>    sub-view was DESTROYING the shared docked-detail DOM node, not just mis-positioning it.**
>    `S.ui.detail` is one node reused across every court's pane. `renderSummaryScotus` correctly
>    re-parents it into its own stage row; Appellate/District never touch it. The actual failure
>    mode: `renderSummaryContent()`'s `container.innerHTML = ""` wipe, if `S.ui.detail` happened
>    to be nested inside `container` from a PRIOR SCOTUS render, doesn't just hide it — it
>    detaches it from the document entirely (a `.style.display` write on an already-detached
>    node is a silent no-op, which is why "going to SCOTUS and back" looked like a fix: the
>    round trip re-attaches the node, it just doesn't explain why it broke in the FIRST case,
>    which is reopening the pane straight into a persisted non-SCOTUS `S.summaryView` with no
>    SCOTUS visit in between). Fixed by rescuing `S.ui.detail` out to `S.ui.pane` BEFORE every
>    wipe (the same pattern `renderSummaryPane`/`renderPane` already use at their own outer
>    level, now also applied at this inner per-sub-view level) and hiding it by default
>    immediately after. Added a real regression test: close the pane while on District, reopen
>    (persisted sub-view), assert the panel is hidden and — the part that actually catches the
>    detach bug — that `querySelector(".ctt-detail")` still finds it at all.
> 4. **District cartogram hover: two real defects fixed now, two more explicitly deferred to
>    the District phase itself (operator's own suggested ordering).** Fixed:
>    (a) growth was `scale(1.35)`, visibly more aggressive than the map's own seat-block hover
>    (`BLOCK_SCALE_HOVER = 1.17`) — now uses that exact constant instead of an independently
>    invented value. (b) the "squares blur slightly and briefly" on hover was a CSS `transition:
>    transform` on an SVG `<rect>` — this exact failure mode is **already documented and
>    root-caused elsewhere in this very file** (`.ctt-sq`'s own comment: a transform transition
>    on an SVG rect can't composite and re-rasterizes every frame; the map's own blocks moved to
>    a JS `requestAnimationFrame`-driven scale specifically to kill this). Ported the identical
>    technique (`animateDistrictSquare`, same 90ms ease-out, same `reducedMotion()` short-
>    circuit) instead of re-deriving a fix from scratch. Verified in a real browser: the
>    computed `transition-duration` is `0s`, and the transform value is visibly mid-ease at
>    ~20ms in (not snapping straight to the end state). **Deferred to the District phase**
>    (genuinely entangled with layout decisions that feature hasn't made yet, not just
>    procrastination): shrinking the cartogram's overall on-screen size to leave room for a
>    tooltip/future docked panel, and true responsive scaling for mobile width — both are
>    "how much space does the assembly get" questions that only have real answers once the
>    District pane's actual layout (docked viewer, canvas region) exists.
> - **Tested:** jsdom (`tests/smoke.mjs`, updated: tab-label assertions, the new exact ring-gap
>   value, the docked-detail regression), plus real-browser CDP verification for the hover scale
>   value/timing/transition-absence and screenshots of the retuned tab switch, ring spacing, and
>   hover-grow. All prior suites (`browser-checks.mjs`) pass unmodified.
> - Next: the District "lift onto the map" feature itself — this session's remaining fixes
>   directly feed its layout decisions (item 4's deferred half). See below for progress once
>   that work starts.

> **SESSION (bs), 2026-09-03 — Summary tab (SCOTUS ring-split + Appellate stub + District
> cartogram preview); a NEW GitHub push-every-session protocol also lands this session.**
> Two things happened, unrelated in substance: (1) the operator updated `CLAUDE.md` §7 with a
> new step 6 (session (br), which this session's read of the files picked up) — commit + push
> to `origin/main` is now part of finishing every session, same footing as updating this file,
> done without being asked. This entry is the first one written under that protocol; the
> commit/push happens right after this file is saved, per the new rule. (2) The bulk of the
> session: the operator's own earlier feature proposal (embedding the district-block assembly
> directly on the main map view) turned out too large for a fixed on-map position once the real
> scale of the cartogram became clear (see the 2026-09-01 sessions (bi)-(bq) building the
> standalone tool that produces it) — so the operator redesigned it as a new **Summary** tab:
> the old lone "Supreme Court" selector entry is replaced by one "Summary" destination with its
> own SCOTUS | Appellate | District sub-tab (default SCOTUS).
> - **Data relocated + wired into the pipeline first**, per the operator's own instruction
>   ("move the file into a location consistent with the data categorization standards"):
>   `district_arrangement_US_shape.json` (repo root, the finished 12-circuit cartogram export
>   from the district-block-builder tool) → `data/district_arrangement.json`. Documented as
>   **Table F** in `docs/CODEBOOK.md`. `scripts/build_assets.py` now passes it through into the
>   manifest (`files.district_arrangement`, folded into the version hash like every other
>   asset) and runs a **drift check** (`check_district_arrangement_drift`) comparing the
>   export's frozen `cell_colors` composition per district against LIVE `seat_blocks.json`
>   counts — WARNS (doesn't fail the build) when they no longer match, rather than either
>   silently going stale or guessing at a "fix": the export genuinely lacks the per-cell
>   click-order/reading-order state that determined which SPECIFIC block got which color (only
>   `circuit-linked@2`, the tool's intermediate per-circuit format, has that), so recomputing
>   colors here without it would just reshuffle them within a district, not actually refresh
>   them. Verified the check fires correctly on a synthetic mismatch and stays silent on the
>   current (accurate) data.
> - **Selector bar**: `addSummaryButton()` replaces the old `addSelectorGroup(sel, "Supreme
>   Court", ...)` call — one larger, bolder button (`.ctt-summary-btn`), same
>   `.ctt-selector-item` mechanics (`highlightSelector`/`deselect` needed zero special-casing,
>   since they already operate generically on `data-court-id`). New `selectSummary()` mirrors
>   `selectCourt()` for the `"summary"` sentinel (not a real `courts.csv` row).
> - **SCOTUS sub-view**: reuses the EXACT same bench-building/hover/pin machinery every other
>   court's Majority view already has (`buildBenchModel`, `renderJudgeIcons`, the docked
>   `S.ui.detail` panel, `onIconHover`/`onIconClick`) — no SCOTUS-specific reimplementation of
>   any of that. What's genuinely new: (a) Timeline/Change are gone entirely for this view (no
>   mode switch renders at all — operator: "eliminating Timeline and Change"), permanently
>   pinned to majority mode; (b) a fixed **6 outer + 3 inner** two-ring split (`layoutScotusRing`)
>   instead of the general `planRings` N-seat algorithm every other court's Majority view uses —
>   deliberately a separate function, since SCOTUS is always exactly 9 authorized seats, never a
>   computed ring count; (c) the inner ring's first/last seats are raised 15° off the horizontal
>   (165°/15° instead of 180°/0°) while the middle stays at 90°, per the operator's exact spec;
>   fill order is the SAME algorithm as every other court (`innerArcSeats`: R | vacancies | D,
>   oldest→newest within party, then protractor/angle order across all rings, ties inner-first);
>   (d) icons render bigger ("since it is SCOTUS").
>   - **Icon-doubling implementation detail worth knowing**: `place(node, cx, cy, show, scale)`
>     gained a 4th param appending `scale(${scale})` to the existing translate transform — and
>     needed NO change to the existing `cx - ICON` centering math, because CSS composes
>     `translate(...) scale(...)` around the box's own default transform-origin (its center),
>     unaffected by the translate itself. Verified this analytically before relying on it, then
>     confirmed visually.
>   - **Responsive scale, not a fixed 2x — a real bug caught and fixed via mobile
>     screenshot, not just desktop review.** A first pass hard-coded `scale=2` with the ring
>     radii clamped only by the stage's available width/height — this fixed an EARLIER bug
>     (icons overflowing past the mobile viewport edge, radii previously had a `Math.max(100,
>     ...)` floor that ignored how narrow the stage was) but traded it for a second, equally
>     broken failure mode: at ~380px mobile width, 6 full-size doubled icons spanning 180°
>     physically overlapped each other, since capping the RADIUS alone does nothing to stop
>     fixed-size icons from touching once they're packed closer together. Fixed properly by
>     solving for the largest scale (≤2x, ≥1x) at which the outer ring's own minimum
>     non-overlap radius (6 icons at 36° apart need chord ≥ ~1.05×diameter) still fits the
>     stage's clearance — desktop (plenty of room) still resolves to exactly scale=2 with the
>     original generous radii (screenshot-diffed as pixel-identical to the pre-fix desktop
>     render); mobile now shrinks smoothly instead of either clipping or overlapping.
> - **Appellate sub-view**: an explicit "Coming soon." placeholder — operator: "leave it blank
>   and come back to it later." Nothing else built for it.
> - **District sub-view — SCOPE NOTE, read before touching this again.** The operator's full
>   spec for this sub-view is a large, self-contained feature: a "liftable" cartogram that can
>   be deployed onto the actual map (shrinking into a fixed on-map position via a "Set upon
>   map" button that flips the summary pane up while the assembly visually migrates), a
>   dedicated docked per-district detail viewer + click-to-pin (distinct from the judge-detail
>   panel), +/- resize controls, free drag-repositioning on the map, a circuit-scoped fixed
>   sub-assembly that stays present through a district drill-in (excluding cadc/cafc), and a
>   hover-triggered blue tint on the corresponding district's actual map SHAPE (not just the
>   cartogram block). **None of that is built this session** — it is comparable in scope to the
>   ENTIRE district-block-builder tool (sessions (bi)-(bq), ~9 sessions to reach its current
>   four-stage state), and building it well needs its own dedicated, tested pass rather than a
>   bolt-on here. What IS built: `renderSummaryDistrict()` — a **static preview** of the
>   assembled cartogram inside the Summary pane, lazy-loaded once (`loadDistrictArrangement()`,
>   cached in `S.districtArrangement`), rendered as one shared SVG with each circuit's matrix
>   placed at its saved `offset` (screenshot-confirmed: renders the full recognizable US-shaped
>   outline). Colors reuse the map's own established `.ctt-sq-rep`/`.ctt-sq-dem`/`.ctt-sq-other`/
>   `.ctt-sq-vacant` classes directly (not a second palette). **Hover-grow IS implemented and
>   matches CLAUDE.md's "district court-square synced block growing on-hover" requirement
>   literally**: `wireDistrictCartogramHover()` grows every block sharing a `data-district-id`
>   together (CSS `transform: scale(1.35)`, `transform-box: fill-box` so it scales around each
>   square's own center in SVG space) and shows a tooltip with the district's name AND its LIVE
>   `seat_blocks.json` composition (never the frozen export data — screenshot-verified: C.D.
>   Cal.'s 28-block cluster grows as one cohesive shape, tooltip reads "9 R · 19 D" matching
>   current data, not whatever the export happened to freeze). This static-preview pane is
>   exactly the content the future "Set upon map" feature will need to lift FROM — building it
>   now was not wasted groundwork.
> - **Tested**: extended `tests/smoke.mjs` in place of the now-removed direct-SCOTUS-selector
>   assertions (that selector item no longer exists) — new coverage includes exact ring-split
>   geometry (3 inner/6 outer by radius, confirmed via jsdom's fully-deterministic fallback
>   layout constants: w=600→cx=300, H=360→cy=292, so radii/angles are exact, not approximate),
>   the 15° raise (no inner-ring seat sits exactly on the horizontal; the outer ring's two true
>   180°/0° endpoints do), the 2x scale transform, the Appellate placeholder, and the District
>   cartogram (12 circuit clusters, R/D squares present). All prior suites
>   (`tests/browser-checks.mjs`, `tests/stress.mjs`) still pass unmodified. Screenshot-verified
>   desktop (SCOTUS/Appellate/District all three) and mobile 380px (SCOTUS, before AND after
>   the responsive-scale fix — the mobile screenshot is what caught the overlap bug in the
>   first place; caught, fixed, and re-verified in the same session rather than shipped and
>   left for a later mobile pass, unlike most of this project's other mobile-layout work).
> - Next: the District "lift onto the map" deployment mechanic (see the scope note above) is
>   the natural next large piece — the static preview built this session is its starting point,
>   not a detour from it. Also unchanged from earlier sessions: nothing about the
>   district-block-builder TOOL itself needs further work right now.

> **SESSION (bq), 2026-09-01 — root-caused + fixed the float-noise bug in snapped offsets.**
> Operator report: exported arrangement data had ugly near-integer values like
> `-16.900000000000002`, suspected it was the (bp) snap-to-grid feature, and asked for a
> **copy-only** repair of the arrangement data in their own working file
> (`temp_district_layout_data.txt`, lines 3747-end — the file's earlier lines are an unrelated
> linker export, out of scope and untouched) plus root-cause investigation.
> - **Confirmed the exact mechanism.** `PITCH = 6.5 * 1.3 = 8.45` is not exactly representable
>   in IEEE-754 binary floating point, so `Math.round(v/PITCH)*PITCH` — the snap function
>   introduced in (bp) — lands a few ULPs off the true value. Verified all 12 circuits' offsets
>   in the operator's data: every single x/y is an exact integer multiple of 8.45 to within
>   ~1e-14–1e-16 (residual sizes are the floating-point-epsilon signature, not real
>   positioning drift), and a regex sweep for any other long-decimal numeric token in the file
>   turned up nothing beyond those same 19 offset values — `matrix`/`cell_colors`/
>   `cell_district` were never affected, confirming the bug is isolated to `offset`.
> - **Repaired copy:** `district_layout_arrangement_repaired.json` (repo root) — same JSON
>   parsed from the operator's file, each `offset` recomputed as `round(x/PITCH)` (asserted
>   genuinely within 1e-9 of an integer multiple first, so a real, not-actually-grid-aligned
>   value could never be silently coerced) then rounded to 2 decimals (exact for any true
>   PITCH multiple: `8.45 = 845/100`, so `n * 8.45` always terminates at 2 decimals). Verified
>   programmatically that `matrix`/`cell_colors`/`cell_district`/`circuit_id`/`schema` are
>   byte-identical between original and repaired, offsets differ only within float epsilon, and
>   the SOURCE file's md5sum is unchanged (copy-only, as asked).
> - **Root-cause fix in the tool** (`tools/district-block-builder.html`): new `cleanCoord(v)` —
>   round to 3 decimal places — wraps `snapToPitch`'s result AND the previously-unguarded
>   unsnapped drag path (a non-integer zoom, e.g. 1.5x, divides just as unevenly as PITCH does,
>   so the same class of noise could appear there too over repeated drags). Also applied on
>   **import**, so pasting an old noisy export self-repairs going forward rather than
>   perpetuating the noise through further edits.
> - **Tested:** 8 repeated snapped drags in one session stayed exactly clean (2 decimals,
>   confirmed still an exact PITCH multiple) where the old code would have accumulated noise;
>   separately, importing the operator's own exact noisy values
>   (`-16.900000000000002`/`76.05000000000001`) and re-exporting produced exactly
>   `-16.9`/`76.05`, proving the self-repair-on-import path. `tests/smoke.mjs` and all prior
>   fix-verification suites still green, zero console errors.
> - Next: unchanged — map-widget integration. Operator still needs to manually swap their
>   working file's tail for the repaired copy (or re-import + re-export through the now-fixed
>   tool) when ready; neither was done automatically per the copy-only instruction.

> **SESSION (bp), 2026-09-01 — Arrangement: import + snap-to-grid with "stutter" drag.**
> Two operator requests. **(1) Import arrangement JSON** — Export existed but there was no way
> back in, so a saved arrangement could never be resumed. Added an Import button reading the
> same `arrangeIo` textarea; treats the pasted export as a **complete replacement** of the
> canvas (not a merge) — an arrangement export is a full snapshot, and resuming one shouldn't
> leave stray leftover circuits from whatever was on screen before. **(2) Snap-to-grid with a
> "stutter" drag** — a checkbox toggle; grid unit = `PITCH` (the squares' own centre-to-centre
> spacing), applied to the **absolute** offset coordinate the same way with or without zoom/pan,
> so snapped clusters' internal block grids land on one shared lattice regardless of how the
> canvas auto-fits around whatever's currently placed.
> - **The "stutter" fell out for free from the right implementation shape, not a separate
>   effect layered on top.** The operator's spec was unusually precise about the desired feel:
>   position shouldn't track the cursor continuously, it should hold still and then jump once
>   the raw cursor position becomes closer to a different grid vertex, and the FINAL committed
>   offset (on release) must equal exactly whatever was last shown, not some independently
>   recomputed "true" position. All three of those are simultaneously satisfied by one design
>   choice: round-to-nearest-`PITCH` is computed fresh from the live cursor position in a single
>   `pointerOffset(e)` helper, and BOTH `onMove` (sets the live `transform`) and `onUp` (commits
>   `arrangement[cid].offset`) call that exact same function — there is no separate "raw" offset
>   ever computed or stored while snap is on. Rounding to nearest only changes its answer when
>   the input crosses a halfway boundary, which is the stutter; and because commit and preview
>   share one code path, "snaps to its last apparent visible position" is true by construction,
>   not by keeping a `lastVisual` field in sync with it (an earlier draft did that and the field
>   was redundant — removed).
>   Snap reads live off the checkbox on every move (not captured at drag-start), so toggling it
>   mid-drag takes effect immediately; with it off, dragging behaves exactly as before (raw,
>   continuous, unsnapped) — this was a pre-existing zero-cost path, not a new special case.
> - **Tested:** full-page-reload export/import round-trip (2 circuits, colors and offsets both
>   restored, confirmed NOT just black placeholders); a snapped drag sampled at 8 intermediate
>   cursor positions showed only 7 distinct visual positions (proving at least one hold/repeat,
>   i.e. the stutter) and a final committed offset an exact multiple of `PITCH` to floating-point
>   precision; a second, unsnapped drag on a different circuit in the same session confirmed its
>   offset was NOT forced onto the grid, proving the toggle actually gates the behavior rather
>   than being always-on. `tests/smoke.mjs` and all prior fix-verification suites still green,
>   zero console errors.
> - Next: unchanged — map-widget integration.

> **SESSION (bo), 2026-09-01 — Sampler: circuit-local projection option, default ON.** Operator
> asked to sample against each circuit's own dedicated projection
> (`assets/geo/circuits/<cid>.svg` — the same file the live widget drills into, separately
> projected from `national.svg` for less distortion in that one region, hence its own morph
> animation on drill-in) rather than always using the shared national projection, defaulting to
> circuit-local. Added a **Projection** selector (Circuit-local [default] / National) next to
> the circuit dropdown.
> - **Geometry loading is now mode-aware and still lazy:** national.svg was already loaded at
>   page init; a circuit-local file is fetched on first use per circuit
>   (`getLocalSvgDoc`/`localSvgCache`) rather than all 12 upfront (`ca9.svg` alone is ~190KB).
>   `getShape`/`shapeFor` gained a `mode` parameter and the shape cache is now keyed
>   `` `${mode}:${cid}` ``; `runSearch` shows a "loading circuit-local geometry…" status and
>   disables Run immediately (not after the fetch) to close a small double-invocation window
>   the async load newly opened.
> - **Verified the two projections are genuinely different geometry, not a relabeled duplicate:**
>   compared `ca1`'s national vs. local path data directly — same vertex count (1151, as
>   expected: the morph invariant `check_geometry.py` already enforces vertex parity between the
>   two), but completely different coordinate ranges and a different bounding-box aspect ratio
>   (national 0.577 vs. local 0.755 — the local one is measurably less horizontally compressed,
>   the whole point of a per-circuit projection), while total shoelace area matches to within
>   0.001% — consistent with both being separate equal-area (Albers-family) projections of the
>   same real shape. This explains why the Sampler's L0 estimate came out nearly identical
>   between modes for the same circuit despite using entirely different underlying data — a
>   result that looked suspicious at first glance until traced to its (correct) cause.
> - **Fixed a related pre-existing latent bug while touching this code**, made more likely to
>   bite now that there's a second switchable dimension (circuit AND projection): the sample
>   viewer's shape-outline overlay, and "Send to Editor"'s circuit tag, read the LIVE `circuit`
>   dropdown directly rather than the circuit/mode that actually produced the samples on screen
>   — flipping either dropdown after a search without re-running would silently overlay the
>   wrong shape or mistag the sent matrix. Introduced `activeCircuit`/`activeMode`, set once at
>   the start of `runSearch()`, and pointed the viewer, `collectMore()`, and the Editor hand-off
>   at those instead of the live dropdowns.
> - **Tested:** confirmed the default, confirmed a local-mode search actually issues a network
>   fetch for `assets/geo/circuits/ca1.svg` and produces an unclipped, well-formed shape outline
>   in the viewer; confirmed a national-mode search does NOT fetch any circuit-local file;
>   confirmed the two modes produce different (non-identical) sampled L values for the same
>   circuit, proving they're really using different geometry. `tests/smoke.mjs` and all prior
>   fix-verification suites still green, zero console errors.
> - Next: unchanged — map-widget integration.

> **SESSION (bn), 2026-08-31 — Arrangement zoom slider (parity with Sampler/Linker).** Operator
> asked for the same zoom control the (bk) fix added to the Sampler viewer and District linker
> grid, on the Arrangement canvas too. Added identically (1x-5x range, default 2x, same
> display-only mechanism: the `<svg>`'s `width`/`height` scale, `viewBox` stays in true units).
> **One thing this one needed that the other two didn't:** Arrangement is draggable, and its
> drag math converted raw `clientX`/`clientY` screen-px deltas directly into true offset units
> 1:1 — correct only because the svg previously rendered at exactly 1x. With zoom now able to
> differ from 1x, a screen-px mouse delta had to be divided by the current zoom factor to get
> the correct true-unit delta, in both `onMove` (live drag preview) and `onUp` (committed
> offset) — read live from the zoom slider each time rather than captured at drag-start, in
> case a future change lets zoom shift mid-drag.
> - **Tested:** confirmed the 2x default and svg-width scaling as usual, then specifically
>   verified the drag fix at a NON-default zoom: at 4x zoom, a 200-screen-px drag produced
>   exactly a 50-true-unit offset change (200/4) in the exported JSON — this is the case that
>   would have silently broken (dragged 4x too far) without the fix. `tests/smoke.mjs` and the
>   prior fix-verification suites still green, zero console errors.
> - Next: unchanged — map-widget integration.

> **SESSION (bm), 2026-08-31 — Sampler target undercounted 4 circuits (roving judgeships).**
> Operator asked to verify the Sampler's target block count represents authorized CAPACITY
> (including vacant seats), not active-judge count. The capacity-vs-active framing was already
> right — `courts.json`'s `authorized_judgeships` is the static statutory number, unaffected by
> how many seats are currently filled, so ordinary vacancies were never the issue. But checking
> it surfaced a real, separate undercount: the Sampler summed raw `authorized_judgeships` per
> district, while the District linker's actual per-district cap (and the live widget's own
> per-court blocks) use `seat_blocks.json`'s `total = max(authorized, active)` — the two differ
> for any district where active judges exceed the base §133 count, for EITHER of the two
> reasons `docs/DATA_SOURCES.md`'s 2026-07-13 count-reconciliation entry already documents:
> genuine roving judgeships (Kentucky E&W, Missouri E&W, Oklahoma N/E/W) or, separately, `ilnd`'s
> "minor FJC status lag" (a data-freshness artifact, not a statutory feature — but
> `build_seat_blocks()` deliberately doesn't distinguish the two: any court seating more actives
> than its authorized count grows its block rather than dropping a judge, for whatever reason).
> Confirmed by diffing every district: **kyed 5→6, kywd 4→5, ilnd 22→23, moed 7→9, mowd 5→7,
> okwd 6→7**, which undercounts the
> circuit-level Sampler target for **ca6 (61→63), ca7 (47→48), ca8 (40→44), ca10 (38→39)** — a
> circuit built at the OLD default target would generate a matrix with too few total blocks for
> those circuits' districts to ever be fully assigned in the Linker (which correctly demands the
> higher `total` per district). The other 8 circuits were already correct (no roving-judgeship
> districts, so `authorized_judgeships` and `total` already agreed).
> - **Fix:** `CIRCUITS` in `tools/district-block-builder.html` now sums `seat_blocks[cid].total`
>   per district (falling back to `authorized_judgeships` only if a district is somehow missing
>   from `seat_blocks.json`, which shouldn't happen), matching the exact number the District
>   linker's `capFor()` already uses — one source of truth for "how many blocks does this
>   district need" instead of two independently-computed sums that could drift, the same lesson
>   as the (bl) fix.
> - **Tested:** re-verified the Sampler's prefilled target for all 12 geographic circuits against
>   hand-computed expected sums (the 4 affected circuits now show 63/48/44/39; the other 8
>   unchanged) — all pass, including the dropdown label text. Re-ran the (bl) round-trip
>   regression (byte-identical export/reload, old-format warning) against a fresh inline fixture
>   since the operator's `temp.txt` sample was since emptied — still passes. `tests/smoke.mjs`
>   and the (bk) fix-verification suite still green, zero console errors.
> - Next: unchanged — map-widget integration.

> **SESSION (bl), 2026-08-31 — real data-loss bug in the Linker's export/import, fixed.**
> Operator report: exporting a linked circuit and reloading it lost all district assignments,
> and diagnosed the root cause correctly themselves (saved a sample export to `temp.txt`,
> still in the repo root as of this writing — an old-format file now, safe to delete or keep as
> a reference). The `district-block/circuit-linked@1` format stored `cell_colors` (fully
> derived, resolvable from other data) and `cell_district`, but **never the actual assignment
> state** — which district owns a cell is present, but the click-order number that determines
> that cell's rank (and therefore its color, for any district not using a reading-order
> override) was nowhere in the file. There was also, separately, **no import handler for this
> schema at all** — "Load pasted JSON" only ever understood a bare `{matrix}` export from the
> Sampler/Editor, so pasting a linked export silently reloaded the matrix and dropped every
> assignment with no warning. Operator's own diagnosis was exactly right: "each block
> coordinate would need a district court code and number to be uniquely identified."
> - **Fix, `district-block/circuit-linked@2`:** replaced `cell_colors` with `cell_order`
>   (the click-order badge number per assigned cell — the one truly irreducible piece of
>   state) and trimmed `districts` down to just `{order1, order2}` (dropped the redundant
>   `assigned`/`cap`, both already derivable from `cell_district` counts and the live
>   `seat_blocks.json`, which is the actual source of truth for judge counts and could drift
>   from a stale export anyway). `cell_district` stays. A new `loadLinkedIntoLinker()`
>   reconstructs `entry.districts[...].cells` (owner + order) and `.o1`/`.o2` from exactly
>   these three fields, and colors are recomputed on load via the same `colorForCell()` the
>   live app already uses — never re-read from a stored color, so a reload can't diverge from
>   what's actually assigned. Added a general `ownedCells(entry)` helper so the export function,
>   color resolution, and the Arrangement hand-off all walk the matrix exactly once, the same
>   way, rather than three separately-maintained loops that could drift apart from each other
>   (which is how the original bug-shaped design happened in the first place).
> - **Arrangement is the one deliberate exception, not an oversight:** `sendCircuitToArrangement`
>   still bakes in resolved `cellColors` at send-time, because Arrangement has no district/order
>   state of its own to derive colors FROM — it's positioning-only, colors are baked in exactly
>   once, on the way in. This is intentionally NOT round-trip state; nothing reads it back into
>   the Linker.
> - **Old-format imports fail honestly instead of silently:** pasting a `circuit-linked@1`
>   export (detected via a `cell_colors`-but-no-`cell_order` shape) still loads the bare matrix,
>   but now pops an explicit `alert()` explaining the old format can't reconstruct assignments,
>   rather than the previous silent, total data loss.
> - **Tested:** built a specific round-trip regression — assigned two districts (one plain
>   click-order, one with a `{down,right}` override), exported, did a full page reload (not just
>   a re-render — actually cleared all in-memory state), pasted the export back in, and
>   confirmed the overview coloring was **byte-identical** before vs. after, badge numbers
>   survived, and the override setting survived. Also fed the operator's own `temp.txt`
>   (real old-format ca9 export) through the new import path and confirmed it now loads the
>   matrix with one clear warning dialog instead of quietly discarding the assignment data.
>   `tests/smoke.mjs` and the (bk) fix-verification suite both still green, zero console errors.
> - Next: unchanged — the map-widget integration is still the next real step. Worth carrying
>   forward: the `ownedCells()`-single-walk pattern this fix introduced is the right shape for
>   whatever the eventual `court-tracker.js` consumption code does too — don't let it grow a
>   second, separately-maintained cell-ownership loop.

> **SESSION (bk), 2026-08-31 — first operator-usage feedback on `district-block-builder.html`,
> 3 fixes applied.** Operator started actually using the tool built in (bi)/(bj) and reported
> it "working extremely well" for a first iteration, with three concrete fixes:
>   1. **Sampler viewer clipping + too small.** The shape-outline overlay was flush against the
>      viewBox's left/top edge (0 margin) while the right/bottom had a full `PITCH` of slack
>      (an artifact of how `w`/`h` were computed) — coastline detail beyond the outermost
>      included grid cell got clipped on those two sides. Fixed by adding `VIEWER_MARGIN =
>      PITCH` on **all four sides** (both the shape path and the squares now draw offset by the
>      margin, viewBox grown accordingly) — verified by paging through and bbox-checking all 25
>      matching samples' shape outlines, 0 clipped. Also added a **Zoom slider** (1x-5x, default
>      **2x**) to the Sampler viewer — pure display scaling via the `<svg>` `width`/`height`
>      attributes while `viewBox` stays in true units, so it doesn't touch the exported
>      matrix/geometry math at all. Same slider added to the **District linker's** circuit grid
>      (same default 2x) since its blocks were too small to click comfortably — no outline-
>      clipping concern there (no shape overlay in that view), just the size fix.
>   2. **District linker circuits table redesigned per operator clarification of the original
>      spec's "switchable between via another table."** It's now a real multi-row table (click
>      a row to select/open it, exactly like the district rows below it) rather than a
>      single-slot "Edit" affordance — this eliminates the destructive overwrite-confirm dialog
>      entirely (the operator's point: the table itself is now the safety net), for BOTH the
>      Editor hand-off and pasted-JSON import. "Send to Arrangement" moved from a single button
>      in the (now-optional) edit area to a **per-row button in the circuits table** (next to
>      Remove), so a circuit can be sent to Arrangement without needing to have it open for
>      editing. Export JSON stays scoped to whichever circuit is currently selected/open.
>      **Also fixed a real bug**, not just a UX gap: the circuits table's "Assigned" column
>      (`x/y`) was rendered once on load/select and never refreshed again, so it silently stuck
>      at its initial value (usually `0/y`) through every subsequent block assignment — the
>      render call was simply missing from the assignment/clear/override code paths. Fixed by
>      centralizing every mutation's re-render through one `refreshLinker()` (circuits table +
>      district table + grid, always together) instead of the previous ad hoc pairs, so this
>      class of staleness can't recur when a 5th render target gets added later.
>   3. **Arrangement now has a removal table** (Circuit | Blocks | Offset | Remove), mirroring
>      the Linker's circuits table — there was previously no way to take a circuit back off the
>      canvas short of reloading the page.
> - **Tested:** rebuilt the scratch CDP harness (session context was lost to the operator-
>   reported crash, along with the previous scratch test files — recreated from scratch, not
>   from a saved copy) — confirmed the zoom defaults, 0/25 clipped outlines across every ca1
>   sample, no `confirm()` call on a same-circuit re-send, live "Assigned" column updates
>   (0/29 -> 3/29 after 3 clicks, visible in the TOP table without reopening anything), the
>   per-row Send-to-Arrangement path, and the Arrangement removal table dropping the canvas
>   group count to 0. Screenshot-verified the fixed Sampler viewer (ca1, margin + 2x zoom).
>   `tests/smoke.mjs` still green, zero console errors.
> - Next: unchanged from (bj) below — the map-widget integration is still the next real step;
>   today was a pure bug-fix/usability pass on the existing four stages, prompted by the
>   operator's first hands-on session with the tool.

> **SESSION (bj), 2026-08-31 — district-block-builder STAGES 3+4 DONE: all four tool stages
> now exist.** Continuing directly from session (bi) below (same day): built the remaining
> two chained stages in `tools/district-block-builder.html` — **District linker** (assign a
> circuit's matrix blocks to specific district courts, with real red/blue/vacant composition
> read from `data/seat_blocks.json`, click-to-assign with a seat cap, and the two-field
> reading-order override) and **Arrangement** (drag every linked circuit's cluster freely on
> one shared canvas, export). All four stages are now wired end-to-end: Sampler -> Editor ->
> Linker -> Arrangement -> JSON export. **Not done: the map-widget integration itself**
> (`court-tracker.js`/`build_assets.py` consuming an Arrangement export) — that's still the
> next session's job; this tool's output is not yet read by anything live.
>
> **Design decisions made this session, not explicitly spelled out in the operator's spec:**
>   - **Real judge composition, not fabricated:** the district table's R/D/vacant counts and
>     the per-block seat cap come straight from `data/seat_blocks.json` (`build_seat_blocks()`
>     in `build_assets.py` — the same file the live per-court blocks already use), not from any
>     new computation. Cap = `seat_blocks[district].total` (authorized, or the actual active
>     count for the handful of roving-judgeship districts that exceed §133 — same rule the live
>     widget already applies, not reinvented). Color **sequence order matches the widget's own
>     `seatSquares()`** exactly: rep, other, dem, vacant (not just "red-blue-vacant" as the
>     operator's shorthand put it — `other` is real, currently zero for every district, but
>     included for fidelity rather than silently dropped).
>   - **Two independent numbers per assigned block**, exactly as specified: the on-block badge
>     is ALWAYS literal click order (`smallest unused number` on reassignment, per spec) and
>     never changes; the *color* rank is click order UNLESS both reading-order fields are set,
>     in which case color rank is recomputed from the geometric reading-order sort instead —
>     the badge itself still shows click order either way. This reading matches the spec's
>     "either determined by number or reading order override" phrasing most literally.
>   - **Reading-order semantics, generalized from the one example given ({down,right} =
>     column-major top-to-bottom, left-to-right):** field 1 = primary sweep direction (defines
>     the sweep axis); field 2 = secondary/line-order direction, ordering "lines" along the
>     axis ORTHOGONAL to field 1 — this makes {down,right} give column-major (matches spec
>     exactly) and {right,down} give row-major, generalizing cleanly to all 4 non-degenerate
>     combinations. Verified all four combinations against hand-computed expected orderings in
>     a standalone Node unit test (not just through the browser) before trusting it. The two
>     dropdowns mutually filter out whichever non-blank value the other already holds, which is
>     how "must skip the one the other has selected" was implemented (a filtered `<select>`
>     rather than a literal cycle-through control — functionally equivalent, more accessible).
>   - **Overview vs. focused-district view, implemented literally per spec:** with no district
>     row active, ALL assigned blocks (from every district) show their real colors and
>     unassigned blocks are black, no badges. With a district row active, every block NOT owned
>     by that district — including ones already claimed by a DIFFERENT district — renders
>     black, indistinguishable from a truly unassigned block, exactly as the operator described.
>     Added one non-spec safety rail: clicking a block already owned by another district while
>     it's visually black still no-ops rather than silently stealing it — prevents a block
>     belonging to two districts at once, which the spec never addresses but the data model
>     can't represent anyway (one owner per cell).
>   - **Linker holds multiple circuits at once** ("switchable between via another table"): a
>     small circuits table at the top of the Linker tab lists every circuit sent in so far
>     (Edit/Remove), matching the operator's description of a workspace you build up circuit by
>     circuit rather than a single ephemeral slot.
>   - **Arrangement canvas** auto-fits its `viewBox` to the union of all placed circuits' boxes
>     (with fixed padding) and recenters on every drag-drop — confirmed via the drag test that
>     the underlying stored `offset` (the real data, exported verbatim) updates correctly even
>     though the on-screen `transform` string can coincidentally look unchanged for a single
>     lone circuit (recentering absorbs the shift) — worth knowing if a future visual check on a
>     single-circuit arrangement looks suspiciously static; check the exported `offset`, not a
>     transform snapshot. All circuits render at the same fixed `BLOCK_PX`/`PITCH` scale, no
>     per-circuit zoom, matching "no requirement to snap different #4 to the same grid."
> - **Export formats added:** `district-block/circuit-linked@1` (`circuit_id`, `matrix`,
>   `cell_colors`, `cell_district`, per-district `{assigned, cap, order1, order2}`) and
>   `district-block/arrangement@1` (array of `{circuit_id, offset, matrix, cell_colors,
>   cell_district}`) — the latter is the format the next session's map integration should read.
> - **Tested:** extended the scratch CDP harness (still not committed) through the full
>   Sampler->Editor->Linker->Arrangement pipeline on `ca1` (5 districts, real mixed R/D/vacant
>   composition) — verified cap enforcement (4th click on a full district no-ops with the
>   correct message), smallest-unused-number reassignment after unassigning a middle badge,
>   exact color-sequence correctness against `seat_blocks.json`'s real counts for `med` (1R/1D/
>   1 vacant), overview-vs-focused rendering rules, both export schemas, and a real drag
>   changing the exported offset by exactly the drag delta. Screenshot-verified the Linker
>   (composite overview coloring across two districts) and a 2-circuit Arrangement canvas
>   (1st Cir. + D.C. Cir., correct relative colors, correct labels). `tests/smoke.mjs` (280
>   assertions, untouched app) still green; zero console errors throughout.
> - **Next session:** the map-widget integration — read an Arrangement export into
>   `court-tracker.js`, rendering the new district-composition cluster only in the national/
>   drilled-out view (a new render path alongside `renderSeatBlocks`, since this isn't a
>   uniform grid — it needs to place a saved matrix bitmap at a saved offset per circuit), plus
>   the district-level hover blue-tint behavior the operator specified (hovering a linked block
>   highlights its OWN district's map shape, not the whole circuit — needs `cell_district` from
>   the export). This needs a new `build_assets.py` step to fold an operator-authored arrangement
>   JSON into a shipped data file (analogous to `seat_blocks.json`), and a `CODEBOOK.md` Table
>   entry once that schema is finalized. Also still open from (bi): a seat-block-tuner-style
>   *repositioning* tool for the assembled clusters as a whole once they're live on the map
>   (geographic circuits only, not `cafc` — it has no districts feeding it).

> **SESSION (bi), 2026-08-31 — NEW INITIATIVE STARTED: district-seat block clusters (national
> view only).** Operator spec, at length: a new cluster of red/blue/vacant squares per circuit,
> nationwide-view-only, representing ALL of that circuit's authorized DISTRICT judgeships
> (distinct from the existing per-court seat blocks, which show one court's own judges around
> its own anchor). Hand-arranged via a new multi-stage web tool to roughly resemble the circuit's
> (and cumulatively, the country's) real shape. Four chained tool stages were specified:
> **(1) Sampler** — fits a square grid to a circuit's real boundary via randomized-jitter search
> until the vertex count lands on the circuit's district-judgeship total; **(2) Editor** —
> freehand tailoring of the resulting matrix (extend/trim in any direction); **(3) District
> linker** — assign matrix blocks to specific district courts + red/blue/vacant colors +
> reading-order; **(4) Arrangement** — compose all 12 circuits' linked matrices on one canvas,
> export for the map. Only **(1) and (2) are built this session**, in
> **`tools/district-block-builder.html`** (self-contained, no dependency on
> `embed/court-tracker.js` — it only needs `data/courts.json` + `assets/geo/national.svg`).
> **(3), (4), and the map-widget integration itself are NOT built — that's the next session's
> starting point**, plus a modification to `tools/tune-seat-blocks.html` (or a new tool) to let
> the operator reposition the new district-block clusters (geographic courts only, not `cafc`).
>
> **Design decisions made this session (not asked, per standing auto-mode guidance — spec was
> otherwise exhaustive) — worth knowing if anything looks off:**
>   - **"Certain shape" = the circuit's own path in `national.svg`** (`path[data-court-id=cid]`,
>     the same one `shapeAnchor()` reads for the existing per-court blocks), used directly in its
>     native projected map units — no separate "absolute size" normalization step. This means a
>     circuit's true relative geographic size does NOT carry through to its block-cluster's final
>     on-screen footprint (that depends on the chosen L, which is driven purely by hitting the
>     judge-count target) — this matches the operator's own Arrangement-stage spec ("no
>     requirement to snap different #4 to the same grid," arbitrary manual translation), so it's
>     a non-issue, just worth naming: cross-circuit relative scale in the final US-shaped picture
>     is entirely a human eyeballing job in stage (4), not something the algorithm preserves.
>   - **Point-in-polygon = even-odd rule** over ALL of a circuit's path subpaths concatenated
>     (correctly handles the ~1-38 subpaths per circuit — coastal islands, bays — as one ring
>     set). Circuit vertex counts are small (9-2022; `ca5` is the largest), so naive O(candidates
>     × vertices) ray-casting per grid point is plenty fast — measured **ca9 (target 112, 1518
>     vertices, 31 subpaths) at ~1.5s for the full coarse+bisection search**; no scanline
>     optimization was needed.
>   - **Trimming is automatic, not a separate pass:** the exported matrix's bounds are defined as
>     the tight bbox of the actually-included grid points, so the first/last row/col always has a
>     ≥1 entry by construction. (The Editor's "Trim to content" button re-applies the same logic
>     after freehand edits, which can reintroduce zero edges.)
>   - **Sample standard deviation (n−1)**, not population std, for the "within 2σ" viability
>     check — no artificial floor on std even when it's 0 (an L with zero jitter-sensitivity
>     genuinely requires an exact mean match, which is correct, not a bug to paper over).
>   - **Bisection uses the geometric mean** of the bracket (`sqrt(a*b)`), not the arithmetic mean
>     — L's relationship to vertex count is multiplicative (area/L²), so geometric bisection
>     converges evenly in log-space; confirmed converges to <5% in every test run (2-8 iterations).
>   - Matches found incidentally during the L-search/bisection phase (before the user clicks
>     "Collect") are harvested for free into the match list — e.g. cadc's search alone already
>     turned up 25-33 exact matches out of ~9-15 L values × 30 samples, before any dedicated
>     collection pass ran.
>   - Sample viewer renders in **matrix-index space** (col×pitch, row×pitch — `BLOCK_PX=6.5px`,
>     `BLOCK_GAP=0.30`, same constants as the live widget's seat blocks), not map-unit space, so
>     it's a literal preview of final on-screen square size/spacing per the spec ("at the current
>     standard size and separation"). The optional shape-outline overlay (checkbox, on by
>     default) is a bonus beyond spec — a translucent blue fill+stroke (evenodd, matching the
>     point-in-polygon rule) computed via a continuous version of the same matrix-index transform,
>     so it lines up exactly with the squares. **First attempt used a thin light-gray stroke and
>     was invisible** (mostly hidden under the opaque squares at this resolution) — switched to
>     a semi-transparent fill so the shape reads clearly around/between the squares. Screenshot-
>     verified on ca1 (New England — recognizable elongated coastal shape with PR excluded, since
>     PR is a separate `data-inset` path not part of `ca1`'s own path).
>   - Export/import format (interchange between Sampler→Editor and, later, Editor→Linker):
>     `{schema: "district-block/circuit-matrix@1", circuit_id, matrix: [[0,1,...],...],
>     block_count}`. Textarea + clipboard-copy, matching the existing `tools/tune-*.html`
>     convention.
> - **Tested:** a raw-CDP interaction harness (same pattern as `tests/browser-checks.mjs`,
>   scratch-only, not committed) drove the full Sampler→Editor→export flow headlessly for `cadc`
>   (target 15, tiny 9-vertex shape) and separately timed `ca9` (target 112, largest shape) —
>   all assertions passed, zero console errors, search+collect completed in ~1.5s even for ca9.
>   Also screenshot-verified `ca1`'s block cluster visually resembles coastal New England with
>   the shape overlay on.
> - **Next session:** build stage (3) District linker (per-circuit table: district courts × judge
>   count × R/B/vacant assignment via clicking blocks, with the two toggleable reading-order
>   columns described in the operator's spec) and stage (4) Arrangement (drag each circuit's
>   linked matrix freely on one canvas; export). Then wire the export into
>   `embed/court-tracker.js`: render the new cluster only in the national/drilled-out view, and
>   make hovering a block that's linked to a specific district also blue-tint that district's own
>   map shape (not the whole circuit) — this needs a new data file (analogous to
>   `seat_blocks.json`) and a new `build_assets.py` step; document its schema in `CODEBOOK.md`
>   when built. Also still needed: the tune-seat-blocks.html-style repositioning tool for the new
>   clusters as a whole (operator called this out explicitly), scoped to circuits with geography
>   only (not `cafc`).

> **LIVE TABLE — photo-research coverage ledger. UPDATE THIS before you stop, every session,
> even if you only finish part of a batch.** Kept HERE (not buried in one dated session-log
> entry) because this work is designed to span MANY separate sessions: WebSearch is capped at
> 200 calls per session (shared across the whole session, including every subagent it spawns),
> so one session can only make a dent before it needs a fresh budget. If you don't update this
> table before ending your turn, the next session has no reliable way to know what's actually
> done vs. merely attempted vs. hung/killed - it'll either redo finished work or silently skip a
> court that was never really finished (this exact failure mode already happened once: a hung
> subagent had to be explicitly marked UNATTEMPTED so it wouldn't be mistaken for "done, found
> nothing").
>
> | Court(s) | Judges researched | WebSearch available? | Result | Session |
> |---|---|---|---|---|
> | ca1-ca11, cadc (all 46 circuit judges) | yes, full | Yes | 16 found | (bb) 2026-08-25 |
> | flsd, paed, txsd, cacd, gand | yes, full | Yes | 11 found | (bb) 2026-08-25 |
> | alnd, flmd, cit, ilnd, njd, nynd, lawd, nyed | yes, full | **No - session-wide 200-call quota already exhausted before this batch started; WebFetch-only** | 15 found; 2 negatives (Brinkema/vaed, Bumb/njd) independently re-confirmed by hand afterward | (bf) 2026-08-27 |
> | vaed | yes, full, WebFetch-only | No (see above) | 0 found - thorough effort, real negative | (bf) 2026-08-27 |
> | **nysd** | yes, full — **clean redo, no hang this time** | Yes | 1 found (Vargas) + 1 borderline (Buchwald: real PD Commons file exists, dated 1999 hearing, but only 150×164px — left `photo_url` null rather than ship a too-low-res image; flagged for a future session if a higher-res source ever surfaces) + 11 confirmed negatives | (bg) 2026-08-27 |
> | txnd | yes, full | Yes | 0 found - clean negative, all 6 checked identically (Wikipedia/Wikidata/Commons/court site/FJC/web), zero candidates even to reject | (bg) 2026-08-27 |
> | ksd | yes, full | Yes | 3 found (Kuhlman, Mattivi, Powell); 2 negatives (Belot, Melgren - both pre-2020s, predate Senate Judiciary Commons-upload practice) | (bg) 2026-08-27 |
> | msnd | yes, full | Yes | 2 found (Chamberlin, Maxwell); 3 negatives (Davidson, Mills, Aycock) | (bg) 2026-08-27 |
> | ncmd | yes, full | Yes | 2 found (Bragdon, Freeman); 3 negatives (Tilley, Osteen, Schroeder) | (bg) 2026-08-27 |
> | ncwd | yes, full (agent went idle without reporting once, followed up and got full results) | Yes | 2 found (Rodriguez, Orso); 3 negatives (Voorhees, Mullen, Reidinger) | (bg) 2026-08-27 |
> | arw | yes, full | Yes | 2 found (Fowlkes, Shepherd); 2 negatives (Hendren, Dawson) | (bg) 2026-08-27 |
> | cod | yes, full | Yes | 1 found (Crews); 3 negatives (Blackburn, Martinez, Jackson) | (bg) 2026-08-27 |
> | innd | yes, full (agent went idle without reporting once, followed up and got full results) | Yes | 2 found (Simon, Lund); 2 negatives (Moody, Miller) | (bg) 2026-08-27 |
> | mied | yes, full | Yes | 1 found (White); 3 negatives (Edmunds, Steeh, Ludington) | (bg) 2026-08-27 |
> | akd | yes, full | Yes | 1 found (Peterson) | (bh) 2026-08-27 |
> | almd | yes, full | Yes | 1 found (Lewis) | (bh) 2026-08-27 |
> | alsd | yes, full | Yes | 0 found - clean negative (2 checked; one candidate found for Granade but explicitly rights-reserved, correctly rejected) | (bh) 2026-08-27 |
> | are | yes, full | Yes | 0 found - clean negative (Wright, senior since 1990s, predates Commons-hearing-photo era) | (bh) 2026-08-27 |
> | azd | yes, full | Yes | 3 found (Lanham, Martinez, Desai) | (bh) 2026-08-27 |
> | cand | yes, full | Yes | 1 found (Wise) | (bh) 2026-08-27 |
> | ctd | yes, full | Yes | 1 found (Russell); 2 negatives (Thompson, Underhill - both pre-Commons era) | (bh) 2026-08-27 |
> | dcd | yes, full | Yes | 2 found (Ali, Sooknanan) | (bh) 2026-08-27 |
> | ded | yes, full | Yes | 0 found - clean negative (Longobardi, Reagan-era, predates Commons-hearing-photo era) | (bh) 2026-08-27 |
> | flnd | yes, full | Yes | 0 found - clean negative (Collier, Hinkle; CourtListener API confirms `has_photo: false` for both) | (bh) 2026-08-27 |
> | gamd | yes, full | Yes | 0 found - clean negative, all 3 checked (Sands, Land, Royal); one unlicensed lead (Mercer University news photo of Sands) found and correctly rejected, not used | (bh) 2026-08-27 |
> | gasd | yes, full | Yes | 0 found - clean negative (Hall; CourtListener API confirms `has_photo: false`) | (bh) 2026-08-27 |
> | iasd | yes, full | Yes | 0 found - clean negative (Longstaff, Gritzner; CourtListener API confirms `has_photo: false` for both, both senior/off the court's current site listing) | (bh) 2026-08-27 |
> | ilcd | yes, full | Yes | 0 found - clean negative (Mihm, Reagan-era, predates Commons-hearing-photo era) | (bh) 2026-08-27 |
> | ilsd | yes, full | Yes | 0 found - clean negative (Gilbert; CourtListener API confirms `has_photo: false`) | (bh) 2026-08-27 |
> | insd | yes, full | Yes | 1 found (Olson); 1 negative (Young) | (bh) 2026-08-27 |
> | kyed | yes, full | Yes | 1 found (Meredith) | (bh) 2026-08-27 |
> | kywd | yes, full | Yes | 0 found - clean negative (Simpson III, Reagan-era, predates Commons-hearing-photo era) | (bh) 2026-08-27 |
> | laed | yes, full | Yes | 2 found (Crain, St. John) | (bh) 2026-08-27 |
> | mad | yes, full | Yes | 1 found (Murphy) | (bh) 2026-08-27 |
> | med | yes, full | Yes | 1 found (Neumann) | (bh) 2026-08-27 |
> | miwd | yes, full | Yes | 0 found - clean negative, all 3 checked (Quist, Jonker, Neff) | (bh) 2026-08-27 |
> | mnd | yes, full | Yes | 0 found - clean negative (Magnuson; only non-free wire/press photos exist) | (bh) 2026-08-27 |
> | moed | yes, full | Yes | 2 found (Bluestone, Lanahan); 1 negative (Filippine - only Commons GROUP photos exist, no solo portrait) | (bh) 2026-08-27 |
> | mssd | yes, full | Yes | 0 found - clean negative, both checked (Lee, Wingate); real photos exist for both (Magnolia Tribune, Grinnell College alumni) but neither is freely licensed, correctly rejected; Mississippi Encyclopedia flagged as an unverified lead (fetch tool truncated the page twice) for a future manual look | (bh) 2026-08-27 |
> | mtd | yes, full | Yes | 2 found (Mercer, Lane) | (bh) 2026-08-27 |
> | nced | yes, full | Yes | 0 found - clean negative (Flanagan; a real Getty editorial photo exists, correctly rejected as non-free) | (bh) 2026-08-27 |
> | ndd | yes, full | Yes | 0 found - clean negative, both checked (Conmy, Hovland) | (bh) 2026-08-27 |
> | nhd | yes, full | Yes | 0 found - clean negative, all 3 checked (Barbadoro, McAuliffe, Laplante); one non-free UNH faculty-page photo found for Laplante, correctly rejected | (bh) 2026-08-27 |
> | nmd | yes, full | Yes | 1 found (Davenport); 2 negatives (Brack, Herrera) | (bh) 2026-08-27 |
> | nywd | yes, full | Yes | 3 found (Larimer, Skretny, Siragusa) - **operator manual-review decision 2026-08-28**: use all 3 as PD-USGov by inference (2nd Circuit Library's own official WDNY-125 history site, federal-judiciary work product, no page-level license statement — see that session's log entry). Originally left null (bh, 2026-08-27); flipped to found after the operator reviewed the actual images and made the call | (bh/2026-08-28 review) |
> | oked | yes, full | Yes | 0 found - clean negative (White) | (bh) 2026-08-27 |
> | oknd | yes, full | Yes | 2 found (Hill, Russell); 2 negatives (Kern, Frizzell) | (bh) 2026-08-27 |
> | okwd | yes, full | Yes | 0 found - clean negative, all 3 checked (Russell, Heaton, DeGiusti) | (bh) 2026-08-27 |
> | pamd | yes, full | Yes | 2 found (Saporito, Neary); 1 negative (Kane) | (bh) 2026-08-27 |
> | scd | yes, full | Yes | 1 found (Clarke); 3 negatives (Norton, Herlong, Harwell) | (bh) 2026-08-27 |
> | sdd | yes, full | Yes | 0 found - clean negative (Kornmann) | (bh) 2026-08-27 |
> | tned | yes, full | Yes | 0 found - clean negative, both checked (Varlan, Greer); correctly rejected a PDF hearing-transcript scan and a painted courtroom portrait (Greer) as unusable | (bh) 2026-08-27 |
> | tnmd | yes, full | Yes | 0 found - clean negative (Trauger) | (bh) 2026-08-27 |
> | tnwd | yes, full | Yes | 1 found (Lea); 1 negative (Mays; CourtListener API confirms `has_photo: false`) | (bh) 2026-08-27 |
> | txed | yes, full | Yes | 0 found - clean negative, all 3 checked (Schell, Clark, Crone) | (bh) 2026-08-27 |
> | txwd | yes, full | Yes | 2 found (Gonzalez, Davis); 2 negatives (Briones, Moses) | (bh) 2026-08-27 |
> | uscfc | yes, full | Yes | 2 found (Tapp - CC BY-SA 4.0; Dietz - PD, cropped from a Judicial Conference group photo but visually confirmed a clean solo crop, no other faces in frame) | (bh) 2026-08-27 |
> | utd | yes, full | Yes | 0 found - clean negative, all 4 checked (Sam, Campbell, Stewart/"Ted Stewart", Waddoups) | (bh) 2026-08-27 |
> | vawd | yes, full | Yes | 1 found (Yoon); 1 negative (Moon) | (bh) 2026-08-27 |
> | vid | yes, full | Yes | 1 found (Rikhye) - confirms VI territorial judgeships DO go through Senate confirmation (a Senate Judiciary Committee hearing photo exists) | (bh) 2026-08-27 |
> | waed | yes, full | Yes | 1 found (Pennell); 1 negative (Nielsen) | (bh) 2026-08-27 |
> | wawd | yes, full | Yes | 0 found - clean negative (Zilly); Coughenour had a real CC-BY-SA Commons photo but it's a 3-person group meeting photo, not a solo portrait - correctly not used | (bh) 2026-08-27 |
> | wied | yes, full | Yes | 1 found (Conway); 2 negatives (Stadtmueller, Griesbach - correctly avoided a namesake mismatch, a different "William Griesbach") | (bh) 2026-08-27 |
> | wiwd | yes, full | Yes | 0 found - clean negative (Crabb); correctly caught a false Commons lead (a literal photo of a crab mismatched to her name via a cross-wiki filename/link error) | (bh) 2026-08-27 |
> | wvnd | yes, full | Yes | 0 found - clean negative (Stamp); real copyrighted local-news photos exist (2022 courthouse-renaming coverage) but none freely licensed | (bh) 2026-08-27 |
> | wvsd | yes, full | Yes | 0 found - clean negative, all 3 checked (Faber, Goodwin, Johnston); one unconfirmed WV-Supreme-Court-ceremony photo lead for Faber flagged, not verified | (bh) 2026-08-27 |
> | wyd | yes, full | Yes | 1 found (Rankin); 1 negative (Johnson - only a paywalled magazine photo exists) | (bh) 2026-08-27 |
> | **— ALL 53 originally-confirmed courts now attempted this session, PLUS a manual review pass (2026-08-28) on every set-aside lead. This pass of the photo-completion push is DONE. —** | | | | |
> | *(if picked up again, a fresh scope conversation with the operator is needed first: re-check for any newly-appeared photo gaps. All prior leads are now resolved, either used or deliberately left null by operator decision — see the 2026-08-28 session log entry — except mssd's Wingate lead and wawd's Coughenour lead, both confirmed dead ends: no photo exists on the Mississippi Encyclopedia page, and the Commons "Coughenour" crop is mislabeled and actually shows Vathana)* | - | - | - | - |
>
> **When you pick this up:** confirm scope/court list with the operator, launch ≤10 subagents
> per the operator's standing instruction (never more without asking), watch for WebSearch
> exhaustion partway through the batch (each agent can burn 15-30+ calls if it searches
> liberally, so a 10-agent parallel batch can exhaust 200 total by the 3rd or 4th agent - note in
> the table which agents ran with vs. without it), and ADD OR CORRECT A ROW in this table before
> you stop, however many courts you actually got through. Full narrative detail for each pass
> lives in its own dated session-log entry below (search "(bb)" / "(bf)" etc.) if you need the
> per-judge specifics; this table is the one place that must always reflect current, accurate
> status at a glance.

> **SESSION (ay), 2026-08-25 — data hole-patching pass + "Last tracked appointment" header
> feature. Read this before the older "NEXT SESSION" block below (still accurate for its own
> items).** Operator returned after ~4 weeks and asked for a specific sequence: (1) patch
> existing data holes WITHOUT running a fresh CourtListener sweep (deliberately not pulling the
> last month's new appointments yet), (2) then a standard refresh run, (3) an LLM pass to catch
> errors/omissions the refresh introduces, (4) verify the data reaches the widget correctly, and
> separately (5) add a "Last tracked appointment" header line. **Steps (2)-(4) are NOT done yet
> - that's the next session's starting point.** Step (1) and (5) are done this session:
>   - Audited `data/judges.csv` (1,490 rows) for real gaps vs. correct-by-design nulls. Found
>     and fixed a genuine **code bug**, not just a data gap: `fjc_law_degree()` in
>     `collect_courtlistener.py` only matched "J.D"/"LL.B" substrings, so Buckwalter's (paed)
>     real law degree - "B.C.L." (Bachelor of Civil Law, William & Mary's historical name for
>     the same first-professional degree) - was silently dropped, leaving `jd_school`/`jd_year`
>     blank. Fixed via a token-exact match (`_JD_DEGREE_TOKENS = {JD, LLB, BCL, BL}`) rather than
>     substring `in`, specifically because a substring check on "B.L" would have also matched
>     "B.L.S." (Bachelor of *Library* Science) - checked the full FJC degree vocabulary first to
>     confirm no such false positive exists in the actual data before shipping the fix.
>   - Investigated the 250/1490 `cl_person_id` gaps: NOT a bug - already documented in
>     `docs/DATA_SOURCES.md` as a known limit of CL's bulk people export (only 3,711/16,191 rows
>     carry `fjc_id`; name-only fallback is deliberately restricted to unambiguous matches).
>     Tested a looser first-initial fallback heuristic and it produced **wrong** matches (e.g.
>     linked "Cindy Kyounga Chung" to "Charles Chung") - confirmed unsafe, did not ship it. This
>     gap only closes via a live CL call or fresher bulk export, i.e. the pending refresh (step 2).
>   - Investigated the 39 missing `aba_rating`s: 25 were already the documented uscfc/territorial
>     dead-end (session (v), 2026-07-16 - no fallback source exists, left as-is). Of the remaining
>     14, found a real, checkable pattern: FJC records a rating for a judge's *original* district
>     seat but not for a later circuit-court seat reached by **statutory reassignment** (e.g.
>     Tjoflat/Anderson III's 1981 Fifth->Eleventh Circuit split, 94 Stat. 1994) or a fresh circuit
>     confirmation FJC simply didn't record a rating for. Web-search-verified Tjoflat's and
>     Anderson III's reassignment dates independently (FJC bio pages + Wikipedia) - confirms their
>     blank `nomination_date`/`confirmation_date` are correct-by-design (no such event exists for
>     that seat), not a hole. Added `notes` annotations (not fabricated `aba_rating` values - the
>     rating belongs to a different seat, so filling the field itself would misattribute it) for
>     all 10 old-judge cases: 6 have a real earlier-seat rating on file (cited with court + year),
>     4 (Wollman ca8, Young mad, Rodriguez njd, Bryan wawd) have no rating anywhere in FJC's data,
>     confirmed rather than assumed. The 4 remaining 2025-26-appointee gaps are FJC data lag,
>     left for the refresh.
>   - Re-ran `enrich_wikipedia.py` (Wikipedia/Wikimedia only, not an appointments pull) after
>     `collect_courtlistener.py` to close the loop - **important gotcha rediscovered and worth
>     remembering**: `collect_courtlistener.py` rewrites the entire `judges.csv` from FJC/CL data
>     alone and blanks `photo_url`/`photo_source`/`photo_license`/`fedsoc_*`/`acs_*` for every row
>     as a side effect (it doesn't own those fields) - running it standalone without immediately
>     following with `enrich_wikipedia.py` would ship a `judges.csv` missing 1,125 photos and 122
>     affiliation flags. Verified round-trip: `photo_url` missing count was 365 before AND after
>     the full 3-script sequence - no regression, no new coverage (Wikipedia had nothing new since
>     the last enrichment run 2026-07-30).
>   - Diff-verified against a pre-session copy: only the Buckwalter fix + the 10 notes actually
>     changed; nothing else moved. `tests/smoke.mjs` clean, `check_geometry.py` PASS/0.
>   - **"Last tracked appointment" header** (new, distinct from `manifest.generated` which is
>     just "when this build ran"): `build_assets.py` now computes
>     `max(commission_date over all judges)` into `manifest.last_appointment` (currently
>     `2026-06-18`) - this is data-content-driven, so it only advances when a real collection
>     sweep lands a new appointment, exactly as asked. Rendered in `court-tracker.js` as a new
>     `.ctt-tracked` line ("Last tracked appointment 06/18/2026", mm/dd/yyyy) sitting above the
>     existing title/subtitle row (`.ctt-title-row`, wrapped so the two-line header still reads
>     as one header block). Screenshot-verified at 1100x700.
> - **Next session should start with step (2):** run the standard `collect_courtlistener.py`
>   (net) -> `enrich_wikipedia.py` (net) -> `cache_photos.py` -> `build_assets.py` refresh to
>   pull the ~4 weeks of new appointments/status changes since 2026-07-30, watching specifically
>   for whether it closes any of the `cl_person_id`/`aba_rating` gaps documented above. Then step
>   (3): an LLM read-through of the diff for errors/oddities the refresh introduces (new-judge
>   rows with implausible fields, status flips that look wrong, count reconciliation vs. §44/§133
>   like the 2026-07-13 pass did). Then step (4): confirm the new data actually reaches the
>   widget (manifest version bump, spot-check a court in a real browser).

> **NEXT SESSION (older, pre-2026-08-25) — start here.** The repo now ships TWO widgets on one demo page
> (index.html): the **tracker** (embed/court-tracker.{js,css}, div #court-tracker-root, now
> with a THIRD pane view — Timeline | Majority | **Change**, a party-split streamgraph, see
> session (aw)) and the **appointments beeswarm** (embed/appointments-chart.{js,css}, prefix
> `cta-`, div #appointments-chart-root). Both: zero dependencies, relative fetches, manifest
> ?v= cache-busting, jsdom-covered in ONE `tests/smoke.mjs` run (**280 assertions**),
> real-browser checks in `tests/browser-checks.mjs` (**12**). Data: 110 courts (incl.
> `scotus`), 1,490 sitting judges, `appointments.csv/json` (2,792 events since Nixon, 21/21
> SCOTUS photo rows, recess dates, all-sitting photos), `president_photos.csv/json` (new,
> 10 presidents, all sourced/PD), 1,140 locally-cached anti-aliased photo thumbnails under
> `assets/photos/` (new, session aw — see item 0 below). Build idempotent, geometry PASS/0.
> Serve repo root: `python3 -m http.server 8777` (one may still be running).
>
> **Open threads, in the order I'd take them:**
>   0. **NEW this session (aw, 2026-07-30): the "Change" streamgraph + 3 smaller fixes — all
>      shipped, all tested, none blocking.** Full detail in that session's log entry; the
>      short version: (a) Change view is feature-complete (drag bar, president icons/counts,
>      hover-linked highlight, two color schemes, reveal animation) but its first-pass visual
>      CONSTANTS (icon size, reveal stagger, arrowhead proportions, icon-overlap spacing) have
>      had zero operator eyes on them — this is exactly what `tools/tune-*.html` exist for in
>      this repo, and none exists yet for Change; build one if the defaults need tuning.
>      (b) judge-photo moiré/aliasing is fixed for good (root-caused to real halftone texture
>      in old scans, not a rendering bug — see the log entry before reaching for a different
>      fix) via build-time thumbnail caching (`scripts/cache_photos.py`), which also means the
>      widgets no longer hotlink Wikimedia for photos at all — re-run it + `build_assets.py`
>      any time new judges/photos are added. (c) Seniors on Majority is now Hide|Show|Include
>      (Hide is the new default — a behavior change from before, worth knowing if screenshots
>      from earlier sessions look different). (d) beeswarm band labels carry a president icon
>      now. **Caught and fixed a real data-interpretation bug along the way**: SCOTUS's Change
>      view initially showed 11 justices instead of 9 because two FJC rows (Kennedy, Breyer)
>      have `senior_date` but no `termination_date` — locked in with an exact-value regression
>      test; read the log entry if you touch `buildStreamModel()`.
>   1. **Explainer config + responsive scaling: DONE (sessions au/av, 2026-07-21).** The
>      operator's `tune-explainer.html` export (7 boxes, 6 arrows, mostly pinned via
>      `targetPerson`/`targetDate`) is baked into `EXPLAINER_DEFAULT` in
>      `embed/appointments-chart.js` (au); boxes now also reposition continuously and scale
>      text/width with the chart's actual rendered size via `%` position + `cqw`-based
>      `clamp()` font-size, matching how the arrow SVG already scaled natively (av) —
>      screenshot-verified over CDP at three widths with no toggle in between. One nit left for
>      the operator, not auto-fixed: two arrows' fallback `target` category reads `"appellate"`
>      when one of them (Schroeder, a district judge) should fall back to `"district"` —
>      harmless while the pinned dot stays in view, see session (au) for detail.
>      Still open: `tools/tune-dot-sizes.html` (formula knobs incl. the `fit` overflow knob) if
>      the shipped `SIZE_FORMULA {cap:30, mult:120, rCircuit:2, rScotus:7, fit:1.2}` gets revised
>      further (`fit` was 1 -> 1.2 in session (ar); tool's reset value tracks it).
>   2. **Beeswarm mobile pass** — the ≤640px layout (panel below chart, span default 4) has
>      never been eyeballed; same self-serve as the tracker was:
>      `node tests/shoot.mjs --url "http://localhost:8777/index.html" --size 380x900 --at 4000 --out x.png`.
>   3. **Tracker's remaining Phase-4 items**, unchanged:
>   1. **Mobile ~380px** - outstanding since Phase 1, still never eyeballed. Self-serve now —
>      **serve the repo root first** (`python3 -m http.server 8777`), then:
>      `node tests/shoot.mjs --url "http://localhost:8777/tests/visual.html?c=ca8" --size 380x760 --out x.png`
>      **`--size` (viewport), not `?w=380` (container):** the mobile layout switches on a
>      viewport media query (max-width: 640px), so `w=` alone renders a squeezed DESKTOP
>      layout — verified: `--size 380x760` shows the real thing (selector becomes a top bar,
>      pane a full-width sheet). Also: without the server the old command screenshotted
>      Chrome's net-error page, which renders near-BLACK on a dark system — shoot.mjs now
>      refuses and names the cause. Watch the seat
>      blocks: they are a constant 6.5 CSS px, so they will look relatively LARGER on a small map.
>      Also worth checking on this pass: the info-pane note work from session (v)/(w) was only
>      visually verified at desktop widths (700-1180px) - the always-visible territorial note and
>      the dynamic timeline-stage-height fix haven't been eyeballed at the ~380px mobile layout,
>      which has its own CSS (`.ctt-pane-body { padding-bottom: 150px }` etc.) that could interact
>      with either differently.
>   2. **Accessibility** - keyboard nav, alt text, contrast. The morph already honours
>      `prefers-reduced-motion`.
>   3. **Offline/archive** - relative paths hold, but the 1,116 judge photos are remote Wikimedia
>      URLs and fall back to initials offline. Decide whether to cache into `assets/photos/`.
>   4. **Final QA** vs the UX contract (`CLAUDE.md` section 5).
>   5. Optional: `gud`/`nmid` seat blocks are still on shape-centre defaults (operator's call -
>      each does land on its own island). Two rows in `seat_blocks.csv` if ever wanted.
>   6. **Territorial data follow-ups, lower priority than the above:** Evan Rikhye's
>      commission/term dates in `data/cache/territorial_judges_manual.csv` are an unverified
>      placeholder (his Senate confirmation date, since no oath date has been reported) - re-check
>      via `docs/TERRITORIAL_EXTRACTION_PROMPT.md`. `vid`'s "0 senior currently featured" call
>      rests on thinner evidence (an absent nav-menu entry) than CFC's clean official split - worth
>      re-confirming the same way. `aba_rating`/`seat_id` remain unsourced for all 25
>      uscfc/territorial rows (no fallback exists yet); `cl_person_id` is populated for only 14/25.
>
> **Open cosmetic knob:** `VACANCY_INSET_PX` (court-tracker.js) = 0.55. There is no exact value -
> a party square's white stroke is 85% opaque so its colour FADES rather than ends. Measured at 8x:
> inset 0.4 -> outline +0.60px vs the solid colour ("too big"), 0.7 -> -0.35px ("too small"),
> 0.55 -> +0.25px. Raise toward 0.62 for +0.10 if it still reads large.
>
> **Test/verification tooling - use these, they make browser checks self-serve:**
> - `node tests/smoke.mjs` - jsdom regression, 168 assertions. Needs `npm i jsdom` (runtime widget
>   stays zero-dependency). **Check the exit code, not the tail** - a module that dies at import
>   prints nothing and `| tail` reports tail's status, which reads as success.
> - `node tests/browser-checks.mjs` - **real-browser** assertions jsdom structurally cannot make.
>   **Any size/scale/visibility assertion belongs HERE**: in jsdom every box measures 0, so such a
>   test passes while the browser is broken. That has bitten twice.
> - `node tests/stress.mjs [--cycles N]` - drill-in/back stress; catches morph layers stranded by
>   interrupted transitions. It deliberately does NOT settle between cycles: that interleaving IS
>   the bug. Do not "fix" it by adding a wait.
> - `node tests/soak.mjs [--cycles N] [--fuzz]` - long soak; idle rAF/sec, DOM counters, heap,
>   main-thread latency.
> - `node tests/freeze-hunt.mjs [--cycles N] [--mousehz N] [--winsize max|WxH] [--inject CSS]
>   [--patch JS] [--mode full|nonav|nodrill] [--headless] [--emulate WxH] [--resize LOWxHIGH:MS]`
>   - freeze reproducer: spams drill/back under a synthetic mouse-move storm, probes
>   responsiveness, and on freeze names the spinning thread via `/proc/*/task/*/stat` deltas.
>   **Prefer `--headless` (GPU stays ON)**: reproduces the compositor spin AND is immune to the
>   occluded-window/vsync-starvation trap that voids headed runs while the operator is using
>   the machine (a headed run whose `raf=` stops advancing measured an idle page — discard it).
>   `--emulate` drives media queries (mobile layout); watch BOTH eval latency and rAF: the
>   compositor can spin while the main thread stays responsive (rAF stalls, screenshots hang).
> - `node tests/freeze-trace.mjs [--cycles N] [--out f.json]` - captures a CDP trace with
>   cc/input/scheduler categories across a (recoverable) freeze so the stuck compositor task
>   completes inside the capture and its wrappers name the cc code path. Note: a frozen thread
>   emits its trace event only at task COMPLETION — a hard freeze looks like total silence.
> - `node tests/flicker-check.mjs [--page URL] [--court id] [--inject CSS]` - HEADED screencast
>   of hover on/off cycles + saved frames for pixel-diff analysis; how the map-wide hover
>   flicker was measured (localize changed pixels, compare with/without a suspect CSS rule).
> - `node tests/gpu-ratchet.mjs` - HEADED memory-infra dump protocol (baseline / cycles / idle /
>   tab-hidden) + nvidia-smi, for GPU-memory questions. Chrome-side allocators vs driver-side
>   fb tell leak-vs-deferred-reclaim apart. Keep dump count low: detailed dumps are ~50MB each
>   in the trace buffer.
> - `tests/visual.html` - dev harness: `c=<court>` (`none` = nothing selected), `drill=1`, `back=1`,
>   `t=<0..1>` (**freezes the morph** by stubbing `performance.now`), `hover=<judge label>`,
>   `hovershape=<court_id>` (hovers a shape/block and LEAVES it hovered - needed for hover
>   screenshots, since `shoot.mjs` shoots BEFORE it probes), `majority=1`, `affil=`, `stow=1`,
>   `w=<px>`, `perf=1`. Serve the repo root: `python3 -m http.server 8777`.
> - `node tests/shoot.mjs --url ... --out x.png [--at ms]... [--dpr N] [--reduced] [--probe 'expr']`
>   - screenshots over CDP on the **real clock**. `--dpr 8` for sub-pixel measurement.
>   **Never use `--virtual-time-budget` for animations**: it fires requestAnimationFrame exactly
>   ONCE (measured), so a "settled" screenshot is a lie.
> - `tools/tune-seat-blocks.html` - operator tool for seat-block placement. **Serve the REPO ROOT**
>   and open `http://localhost:8777/tools/tune-seat-blocks.html`. `file://` cannot work (Chrome
>   blocks module imports); the page says so if you try.
>
> To re-run data offline: `python3 scripts/collect_courtlistener.py --no-net`,
> `python3 scripts/enrich_wikipedia.py --no-net`, then `python3 scripts/build_assets.py`.
> (CL live API is hard rate-limited; Wikimedia is polite-rate-limited - both are fully cached.)

**Known blockers:** None. **REAL GEOMETRY IS LIVE in `assets/geo/`** (shipped 2026-07-13):
`national.svg` (projected Albers, viewBox in projected units, Y-flip group) + `circuits/ca1–ca11,cadc.svg`
(no `cafc`, correct). Validated by `scripts/check_geometry.py` — **PASS, 0 warnings**: all 94 districts
+ 13 circuit outlines present, ids==court codes, absolute M/L only, `data-parent-circuit` correct,
6 insets (akd/hid/prd/gud/nmid/vid) + dcd callout flagged `data-inset`, and the **morph invariant holds
for every mainland district** (national vs circuit-local vertex parity matches; only the insets differ,
correctly exempt). `build_assets.py` version hash now folds in geometry bytes so boundary-only updates
bust caches. The placeholder is superseded; the app builds against real geometry (Stage E capstone
reachable within Phase 1). Operator-owned — do not edit/redraw geometry.
**Roving-judgeship note (RESOLVED/documented):** §133 gives 4 shared seats beyond per-district counts
— Kentucky E&W (+1), Missouri E&W (+2), Oklahoma N/E/W (+1). `courts.csv` keeps the base per-district
counts; the Phase-2 reconciliation (see `docs/DATA_SOURCES.md`) explains these as the reason those
courts show `active > authorized`. Allocation of shared seats left to the human-verification step.

---

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
      panel goes static). NOT yet visually verified at ~380px in a real browser (jsdom does no layout).
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
- [ ] **Mobile refinement + accessibility pass** (keyboard nav, alt text, contrast). The ~380px
      layout has never been eyeballed — carried since Phase 1, now self-serve via `tests/shoot.mjs`.
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

### 2026-09-11 (ce) — Territorial-court note bottom-alignment in Timeline mode, Summary > Supreme Court FedSoc default + legend key
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

### 2026-09-10 (cd) — Deploy-button arrow direction, click-to-pin from the circuit table, alternate ca1/ca3 sub-assembly layout, empty-hint alignment fix
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

### 2026-09-09 (cc) — Two self-corrections: Summary height/text parity broken by (cb)'s caption promotion, and the 2026-09-07 title-stability fix scoped to the wrong element
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

### 2026-09-08 (cb) — Sticky-while-pinned refinement, District caption title+meta, all-four-edge partial clipping, sub-assembly block-growth + click-to-open
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

### 2026-09-07 (ca) — Pane-title stability, Appellate rename, deploy-button layout, growth-scale reduction, circuit Total row, and a severe hidden bug (hover grew every district at once)
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

### 2026-09-06 (bz) — Five more District bug reports: pane stacking, hover-seam artifacting, 1px Summary height mismatch, fixed-frame controls + D button + persisted zoom, docked-panel order
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

### 2026-09-06 (by) — Two (bx) bug reports fixed: table-overflow scrollbar + hover stickiness/row-highlighting
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

### 2026-09-05 (bx) — Summary > District docked panel: table, sticky pin standardization, dock height
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

### 2026-09-04 (bw) — District phase, Milestone 3: deploy-only "pull out" animation — DONE
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

### 2026-09-04 (bv) — District phase, Milestone 2: full "Set upon map" deployment mechanic
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

### 2026-09-04 (bu) — District phase, Milestone 1: docked detail viewer + click-to-pin
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

### 2026-09-04 (bt) — Summary-tab feedback: 4 fixes (labels/sizing, ring tuning, real detach bug, hover scale+blur)
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
