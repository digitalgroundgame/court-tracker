# DATA_CONTRACT — the published data as a versioned public API

**Status: `schema_version` 1.0.0, frozen 2026-09-06.** This document is normative for anyone
building a renderer against this repo's published data — including a future Pragmatic Papers
front end (issue #13, Phase B), and including this repo's own `embed/` widgets, which are just
the first consumer, not a privileged one.

`docs/CODEBOOK.md` remains the field-by-field reference. It answers *what a column means*. This
file answers the questions a **consumer outside this repo** has and the codebook never did:

- Which files am I allowed to depend on, and which are this widget's private furniture?
- What can change under me without warning, and what gets a version bump and a notice?
- How do I ask for a field I need without breaking whoever else is already pulling this?

Everything below applies to a **published release** (`.github/workflows/release-data.yml`,
tag `data-v<manifest.version>`) — not to whatever is on `main` mid-push. Consumers pull releases;
see `README.md` § "Syncing the data package".

---

## 1. Three version numbers, three different jobs

The single most common way to get this wrong is to treat `manifest.version` as the schema version.
It is not, and never was — it is a content hash. All three of these move independently:

| Number | Where | Changes when | What a consumer does with it |
|---|---|---|---|
| `schema_version` | `manifest.json` (semver, e.g. `1.0.0`) | The **shape** moves — a field is added, renamed, retyped, an enum gains a value, a file appears or leaves. | **Compatibility gate.** Refuse (or warn loudly on) a MAJOR you were not built for; ignore MINOR/PATCH. |
| `version` | `manifest.json` (12-hex content hash) | The **data** moves — a judge takes senior status, a photo is recached, geometry is re-exported. Also on a `schema_version` bump (it is folded into the hash on purpose). | **Change detection + cache busting.** Differs ⇒ pull; identical ⇒ you are current. |
| `data-v<version>` | git tag / GitHub Release | Once per distinct `version` that lands on `main`. | **The atomic artifact to pull.** Immutable; poll this, not the manifest on a branch. |

A year of ordinary data collection produces hundreds of new `version` values and zero
`schema_version` changes. That is the intended ratio: "same contract, newer data" is the normal
case, and a consumer must be able to tell it apart from "the contract moved" without diffing files.

## 2. Stability tiers

Every file in `manifest.files` carries a tier, published machine-readably in
`manifest.stability` so a consumer can assert in its own CI that it depends on nothing it
shouldn't. The tiers, in decreasing order of promise:

| Tier | Promise | Applies to |
|---|---|---|
| `stable` | Covered by §3 in full. Breaks only at a MAJOR bump, only after the deprecation path in §5. | `manifest`, `courts`, `judges`, `circuit_justices`, `judges_search`, `president_photos`, `geo` |
| `provisional` | Public, versioned, and announced the same way — but the shape is *known* to be imperfect and a MAJOR change to it is already anticipated (see §7). Depend on it; just expect the announced change to come. | `appointments` |
| `reference-renderer` | Published and versioned, but **not portable data**: these encode layout decisions specific to this repo's widget's visual design. Another renderer should expect to reimplement, not consume, them. Consuming one is allowed and it still gets version-gated — you are simply inheriting our design, not our data. | `seat_blocks`, `district_arrangement`, `district_arrangement_alt` |

The `reference-renderer` tier is the formalization of the epic's "portable data vs.
reference-renderer-specific artifacts" split (issue #13). Concretely: `seat_blocks.json`'s
per-court **counts** are portable arithmetic, but its `anchor`/`size` are hand-tuned pixel
placements for one specific map; `district_arrangement*.json` is a hand-built cartogram grid for
one specific "Set upon map" feature. A renderer with a different visual language wants the counts
and its own layout.

Photo binaries (`assets/photos/**`) and geometry (`assets/geo/**`) are `stable` in the sense that
matters here — the *path scheme* and the SVG interface are contract (the latter specified in
`docs/GEOMETRY_CONTRACT.md`). The individual files churn with every re-export; that is data
movement, tracked by `version`. Note that a release's `data-json.tar.gz` asset deliberately
contains neither: a consumer that takes the JSON-only asset is choosing to render its own map and
supply its own images, and `photo_thumb` paths in it will not resolve. Pin to the tag, or take
`data-package.tar.gz`, if you need them.

## 3. Versioning policy

`schema_version` is semver over the published shape.

**MAJOR** — anything that can break a consumer that was correct before:
- removing or renaming a file, a manifest key, or a record field;
- changing a field's type or its null-ability (`string` → `string | null` included: a consumer
  that never null-checked is now wrong);
- removing a value from an enum, or changing what an existing value means;
- changing a key's identity or a documented sort order (e.g. judge bundles are sorted by
  `commission_date`; a consumer may rely on that);
- changing how records are grouped into files (e.g. re-bundling judges by something other than
  circuit).

**MINOR** — additive only, safe for a consumer that ignores what it doesn't know:
- adding a new field to a record, a new key to the manifest, or a new file;
- adding a value to an enum **only where the codebook documents the enum as open** — today that
  is `fedsoc_basis`/`acs_basis` (which already carries `other`) and `aba_rating` (free text from
  the source). `status`, `court_level`, `tenure_type`, `president_party` and `seat_blocks.level`
  are **closed**: a new value there is MAJOR, because a consumer's switch statement will fall
  through.
- populating a field that was previously always null for some rows.

**PATCH** — no shape change at all: documentation corrections, a tier reclassification that
loosens nothing, a fix to a value that was simply wrong.

Data corrections are never a schema change. A judge whose `commission_date` was wrong and got
fixed is a new `version`, not a new `schema_version`.

## 4. What a consumer may rely on, and what it must tolerate

**You may rely on:**
- `manifest.json` at the release root being the entry point, and every published file being
  reachable from `manifest.files` by a repo-relative path. Read paths from the manifest; never
  hardcode them — the judge bundles are keyed by circuit today and that key set is data, not code.
- Dates being ISO `YYYY-MM-DD` strings, or null. Partial precision is flagged, never silently
  padded (`appointments.date_precision`).
- `court_id` being the join key across every file, and existing in `courts.json`.
- The validation rules at the bottom of `docs/CODEBOOK.md` holding for every published release —
  the build fails rather than publishing a release that violates them.
- Judge bundles being sorted oldest→newest by `commission_date`; `judges_search.json` sorted by
  `full_name`; `court_ids` sorted alphabetically.

**You must tolerate:**
- **Unknown fields and unknown manifest keys.** Ignore what you don't recognize; a MINOR bump can
  add either. Do not validate with a closed/strict schema that rejects extra properties.
- **`null` and absent meaning the same thing.** Some optional fields are emitted as `null`, others
  are omitted entirely (`judges_search` emits `court_id` XOR `court_ids`; `manifest.files` omits
  a key for a file this build had no input for). Treat both as "not present."
- **Key order.** JSON objects are not ordered data here.
- **A field being null for any given row.** Every nullable field in the codebook really is null
  somewhere in the current data.
- **`data_verified` being `false` everywhere.** It is machine-written false by construction; the
  human verification pass has not run. It is not a quality signal you can filter on yet.
- **Counts that do not naively sum.** A handful of courts seat more active judges than §133
  authorizes; `manifest.national_totals.over_authorized` is what makes `authorized +
  over_authorized == active + vacancies` reconcile. Don't reinvent this arithmetic — see
  `docs/CODEBOOK.md` Table H and `docs/DATA_SOURCES.md`'s discrepancy log.

**Compute at your end, don't expect it published:** anything that is a function of *now* —
time in service, years remaining in a term — goes stale the moment it is baked into a static file.
Same for layout math (arc placement, morph interpolation): that is renderer territory.

## 5. Deprecation path

No `stable` or `provisional` field disappears without going through this:

1. **Announce.** The field is marked `DEPRECATED` in `docs/CODEBOOK.md` with the reason and the
   replacement, and an entry lands in `docs/SCHEMA_CHANGELOG.md` under the next MINOR. This is a
   MINOR bump — nothing has moved yet.
2. **Overlap.** The deprecated field keeps being emitted, with its documented meaning intact,
   alongside its replacement, for **at least one MINOR release and at least 90 days**. If a known
   consumer is mid-migration, longer.
3. **Remove.** Only at the next MAJOR, and only listed explicitly in that MAJOR's changelog entry.

A field that has to change *meaning* is not deprecated — it gets a new name and the old one is
deprecated, so a consumer that never noticed keeps reading something still true.

Emergency exception, deliberately narrow: data that must be withdrawn for legal or licensing
reasons (an image whose reuse terms turn out to be wrong — see `CLAUDE.md` §2) can be nulled
immediately, without a MAJOR. Nulling a nullable field is a data change, not a shape change; the
changelog records it anyway.

## 6. Requesting a schema change

**Additive requests are cheap and expected — asking is the supported path, not an imposition.**
The narrowing in `judges_search.json` (Table G) is the canonical example: it keeps five fields
because that is what one search bar needed. If your renderer needs a sixth, that is a MINOR bump,
not a negotiation.

1. **Open an issue** using the *Schema change request* template
   (`.github/ISSUE_TEMPLATE/schema-change-request.md`), which asks for: the file and field, what
   you're rendering with it, whether the underlying value already exists in the source CSVs, and
   what you'd do without it.
2. **Triage** classifies it against §3 — additive (MINOR), breaking (MAJOR), or "already there
   under a different name."
3. **Additive requests are granted by default** where the value is already collected. Where it is
   not collected, the request becomes a data-collection question (`docs/DATA_SOURCES.md`), which is
   a bigger ask than a schema one — the answer may be "sourceable, not yet sourced."
4. **Breaking requests are batched.** A MAJOR is not cut for one consumer's convenience; it
   accumulates until the batch justifies the migration, then goes through §5.
5. The change lands with its `docs/SCHEMA_CHANGELOG.md` entry and the `SCHEMA_VERSION` bump in
   `scripts/build_assets.py` **in the same PR** as the code — that is the enforcement mechanism:
   the version constant lives next to the derive step it describes.

What will *not* be granted: a field that would require asserting an unsourced value (`CLAUDE.md`
§2 — no fabricated judge data, no unsourced affiliation claim), or an image whose reuse terms are
unclear. Those boundaries are upstream of this contract.

## 7. The published surface (v1.0.0)

Record-level field meanings live in `docs/CODEBOOK.md`; this is the file-level map, the
CSV→JSON deltas a consumer can't see from the codebook, and the shape quirks worth knowing.

| File (manifest key) | Shape | Tier | Notes vs. the codebook |
|---|---|---|---|
| `manifest.json` | object | stable | Entry point. Table H documents `national_totals`. |
| `courts.json` (`courts`) | array of 110 records | stable | Table B's ten columns, typed: `authorized_judgeships` int, `has_geography`/`is_inset` bool, `parent_id`/`geometry_key` nullable. **`court_level` is `scotus \| circuit \| district \| specialized`** — `scotus` is real and Table B's enum omits it. |
| `judges/<circuit>.json` (`judges`) | array, sorted by `commission_date` | stable | Table A's columns, typed, **plus `photo_thumb`** (local cached image path, null until `cache_photos.py` has run for that URL — fall back to `photo_url`). Bundled by circuit: a circuit's own judges + its districts'; `scotus` bundles alone; `cit`/`uscfc` bundle under `cafc`. Bundle keys come from `manifest.files.judges` — do not assume 14. |
| `circuit_justices.json` (`circuit_justices`) | array | stable | Table C, **plus `photo_thumb`** and **plus `full_name`**, a duplicate of `justice_name` (the widget's judge-icon renderer reads `full_name`). Both are emitted; they are always equal. |
| `judges_search.json` (`judges_search`) | array, sorted by `full_name` | stable | Table G. Deliberately narrow — see §6 before working around it. `court_id` XOR `court_ids` (plural only for roving judgeships). |
| `president_photos.json` (`president_photos`) | object keyed by president name | stable | The key is the exact `name` string used in `embed/presidencies.js`; matching on it is string equality, not an id join. Values: `photo_url`, `photo_thumb`, `photo_source`, `photo_license`. |
| `appointments.json` (`appointments`) | array of ~2,800 records | **provisional** | Table E. **Every value is a string** — `""` for null, `"true"`/`"false"` for booleans — because this file is a passthrough of `appointments.csv` rather than a typed build. The one exception is the added `photo_thumb`, which is a real `string \| null`. Coerce on read. Typed coercion is proposed for 2.0 (see the changelog). |
| `seat_blocks.json` (`seat_blocks`) | object keyed by `court_id` | reference-renderer | Composition (`authorized`, `total`, `r`/`d`/`o`, `vacancies`) is portable arithmetic; `anchor`/`size` are hand-tuned placement for this map. Note `level` is `circuit \| district \| feeder` — **`feeder` where `courts.json` says `specialized`**. Table D documents the CSV that feeds the placement half. |
| `district_arrangement.json`, `district_arrangement_alt.json` | object | reference-renderer | Table F. Hand-built cartogram; `cell_colors` is frozen at export time and **goes stale** — recompute from `seat_blocks.json` if you render it. |
| `assets/geo/**.svg` (`geo`) | SVG | stable | Interface specified in `docs/GEOMETRY_CONTRACT.md` (projected units, morph invariant). |
| `assets/photos/**.jpg` | JPEG | stable | Content-addressed; reached via `photo_thumb`, never by constructing a filename. Licensing per row (`photo_license`); render the credit line where the license requires attribution. |

**Not part of the contract at any tier**: `data/*.csv` (source of truth, but shaped for human
editing and the collectors, not for consumption), `data/cache/**` (gitignored, machine-local),
`tools/*.html`, `scripts/**`, and `embed/**`'s internals — including `_dev` exports and any
internal state shape (issue #13 Phase A calls this out explicitly).

## 8. Known 1.0 warts

Documented rather than quietly fixed, because fixing them is exactly what the version policy is
for. Each is either a MAJOR candidate (§3) or a data question, and each is in the changelog's
Proposed section:

- **`appointments.json` is string-typed** (above). The fix is a typed build; it is breaking.
- **`circuit_justices.json` emits `justice_name` and `full_name` as duplicates.** Renderer
  convenience that leaked into the published shape. Collapsing them is breaking.
- **`seat_blocks.level` renames `specialized` to `feeder`.** Two vocabularies for one concept.
- **`data_verified` is `false` on all 1,490 rows.** Not a shape problem — the human pass has never
  run. Do not build a "verified only" filter on it yet.
- **`judges_search.json`'s five fields** are a reference-renderer-shaped narrowing of a stable
  file. It stays as-is until someone asks (§6).
