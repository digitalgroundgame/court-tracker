# SCHEMA_CHANGELOG — history of `manifest.schema_version`

Every change to the **shape** of the published data lands here, in the same PR as the code and
the `SCHEMA_VERSION` bump in `scripts/build_assets.py`. Policy (what counts as MAJOR/MINOR/PATCH,
the deprecation path, how to request a change): `docs/DATA_CONTRACT.md`.

This file tracks **shape only**. Data movement — new appointments, corrected dates, re-exported
geometry, recached photos — is tracked by `manifest.version`'s content hash and does not appear
here. Session-level history of everything else lives in `PROGRESS.md`.

Format: [Keep a Changelog](https://keepachangelog.com/en/1.1.0/)-ish, newest first.

---

## 2.0.0 — 2026-09-08

The three MAJOR candidates named in 1.0.0's Proposed section, batched and landed together as one
migration (issue #28, under the Pragmatic Papers integration epic #13) — the batch the section
existed to accumulate toward, per `DATA_CONTRACT.md` §6 point 4.

### Changed (breaking)
- **`appointments.json` is now typed**, not a raw string passthrough of `appointments.csv`.
  Dates and free-text fields are `string | null` (an empty CSV cell now round-trips to real
  `null`, not `""`); `sitting` is a plain `boolean` (not `"true"`/`"false"`); `fjc_jid` is
  `int | null`. **`fedsoc_reported`/`acs_reported` are `boolean | null`** — genuinely three-state,
  not a straight `"true"`/`"false"` → `true`/`false` mapping: `null` means the question was never
  asked (a departed judge, or a sitting one the `judges.csv` join missed), `false` means it was
  asked and reported unaffiliated. A consumer that string-compared `"true"` or `""` needs to
  switch to real equality/typeof checks. Promoted from `provisional` to `stable` as a result — see
  `DATA_CONTRACT.md` §2 and §7.
- **`circuit_justices.json` no longer emits `full_name`.** It was a duplicate of `justice_name`
  that existed only because the widget's shared judge-icon renderer reads `full_name` uniformly
  across judge and justice records. A consumer that needs the renderer field name synthesizes it
  itself (`full_name = justice_name`) — `embed/court-tracker.js` now does exactly that,
  client-side, at load time.
- **`seat_blocks.level` now uses `specialized`, not `feeder`, for CIT/CFC** — unified with
  `courts.court_level`'s vocabulary for the same concept. A consumer branching on `level` needs
  to update that one enum value.

### Baseline
Files in the contract at 2.0.0: unchanged from 1.0.0's list (`manifest.json`, `courts.json`,
`judges/<circuit>.json`, `circuit_justices.json`, `judges_search.json`, `president_photos.json`,
`appointments.json`, `seat_blocks.json`, `district_arrangement.json`,
`district_arrangement_alt.json`, `assets/geo/**`, `assets/photos/**`) — this release changes shape
within existing files, not the file set.

---

## 1.0.0 — 2026-09-06

First versioned release of the schema. **Nothing about the data changed** — this is the existing
shape, as published since the derive step stabilized, given a version number and a stability tier
so an external renderer can build against it (issue #10, under the Pragmatic Papers integration
epic #13).

### Added
- `manifest.schema_version` — semver over the published shape, independent of `manifest.version`'s
  content hash. Folded into that hash, so a shape-only bump still cuts a release and busts caches.
- `manifest.stability` — per-file tier (`stable` / `provisional` / `reference-renderer`) for the
  files this build emitted, so a consumer can assert its dependencies in its own CI.
- `docs/DATA_CONTRACT.md` — the normative consumer-facing contract.
- `.github/ISSUE_TEMPLATE/schema-change-request.md` — the request path in `DATA_CONTRACT.md` §6.

### Documented (previously true but unwritten)
- `courts.court_level` includes `scotus`; `docs/CODEBOOK.md` Table B listed only
  `circuit | district | specialized`.
- The derived JSON's deltas from the source CSVs: `photo_thumb` added to judge, circuit-justice
  and appointment records; `full_name` duplicated onto circuit-justice records; judges bundled
  per circuit with `cit`/`uscfc` under `cafc` and `scotus` alone.
- `seat_blocks.level` uses `feeder` where `courts.json` uses `specialized`.
- `appointments.json` is a string-typed passthrough (`""` for null, `"true"`/`"false"` for
  booleans) — hence its `provisional` tier.

### Baseline
Files in the contract at 1.0.0: `manifest.json`, `courts.json`, `judges/<circuit>.json`,
`circuit_justices.json`, `judges_search.json`, `president_photos.json`, `appointments.json`,
`seat_blocks.json`, `district_arrangement.json`, `district_arrangement_alt.json`,
`assets/geo/**`, `assets/photos/**`.

---

## Proposed — not scheduled, no version assigned

Recorded so a consumer sees them coming, per `DATA_CONTRACT.md` §5. None is committed to; a MAJOR
gets cut only when the batch justifies the migration.

The 2.0.0 batch above (typed `appointments.json`, collapsed `circuit_justices.full_name`, unified
`seat_blocks.level`) was this section's entire MAJOR list as of 1.0.0 — nothing MAJOR is queued
here right now.

**Would be MINOR, if asked for (`DATA_CONTRACT.md` §6):**
- Additional fields in `judges_search.json` beyond the current five.
- A precomputed per-circuit rollup alongside `manifest.national_totals` (issue #13 names it as
  correctness-sensitive logic a headless consumer shouldn't reimplement; the national half landed
  as Table H).
