# CODEBOOK — data schema

**Consuming this data from outside the repo? Read `docs/DATA_CONTRACT.md` first.** This file is
the field-by-field reference — what each column *means*. The contract covers what a consumer
needs on top of that: which files are stable public API vs. this widget's private furniture,
what `manifest.schema_version` promises, how a field gets deprecated, and how to request one
(`docs/SCHEMA_CHANGELOG.md` is the history). Each table below is tagged with its stability tier;
the derived JSON differs from these CSVs in a few documented ways, listed in the contract's §7.

Authoritative schema for the three source-of-truth CSVs. Variable names are final. Every judge
value must be sourced; `data_verified` stays `false` until a human confirms the row. Dates are
ISO `YYYY-MM-DD`. `president_party` is stored inline (no lookup table).

---

## Table A — `judges.csv`
*Stability: **stable** (derived to `data/judges/<circuit>.json`).*
One row per **sitting** judge (active or senior on a life-tenured court; in-term on a fixed-term court).

| variable | type | description |
|---|---|---|
| `cl_person_id` | integer | CourtListener's stable person id; join key to the source of truth and profile link. |
| `full_name` | string | Judge's full name as shown in the detail pane. |
| `display_name` | string | Compact label for icon/tooltip (surname, or initial+surname to disambiguate same-surname judges on one court). |
| `court_id` | string | FK → `courts.court_id` (CourtListener court code, e.g. `ca9`, `cand`, `cit`, `uscfc`). |
| `seat_id` | string \| null | CourtListener seat/position id for the specific judgeship (succession + verification). Null if CL lacks it. |
| `status` | enum `active` \| `senior` | Active seat-holder vs. supernumerary senior. Drives gray tint + concentric-band placement. Always `active` on `fixed_term` courts; may be `senior` on `fixed_term_senior` (CFC — see Table B). |
| `is_chief` | boolean | True if chief judge of the court/circuit at collection time. |
| `appointing_president` | string | President who appointed the judge. |
| `president_party` | enum `Republican` \| `Democratic` \| `Other` | Party of the appointing president; drives the red/blue ring. `Other` for rare pre-modern cases. |
| `nomination_date` | date \| null | Date nominated. |
| `confirmation_date` | date \| null | Date confirmed by the Senate. |
| `commission_date` | date | Date commissioned / took office. Basis for oldest→newest ordering and time-in-service. |
| `senior_date` | date \| null | Date senior status taken; orders seniors in the outer band; marks when the active seat was vacated. Null for active judges and for judges on a plain `fixed_term` court (territorial). |
| `term_expiration_date` | date \| null | End of the judge's current fixed term (the vacancy clock for `fixed_term`/`fixed_term_senior` courts). Null for `life_tenured`. On `fixed_term_senior` (CFC), populated for senior judges too — it marks when their *active* term ended, not an ongoing deadline (28 U.S.C. §178: once senior they no longer count against the authorized-seat cap and serve without a further term clock). |
| `jd_school` | string \| null | Institution granting the judge's JD. |
| `jd_year` | integer \| null | Year the JD was conferred. |
| `aba_rating` | string \| null | ABA Standing Committee rating at nomination (e.g. `Well Qualified`) if present in CL. Display-only. |
| `cl_profile_url` | url | Link to the CourtListener profile. |
| `photo_url` | url \| null | Face image URL (lazy-loaded; initials fallback when null). |
| `photo_source` | url \| null | Where the image came from, as a citable page: for Wikimedia this is the Commons file-description page (the link an attribution must point at). |
| `photo_license` | string \| null | License for reuse, as `<license>` or `<license> — credit: <author>` when the license requires attribution (CC BY / CC BY-SA). The widget renders a credit line only for the latter. Leave `photo_url` null if terms are unclear. |
| `fedsoc_reported` | boolean | A source reports Federalist Society affiliation. Displayed as an attributed claim, never asserted fact. |
| `fedsoc_basis` | enum `member` \| `speaker` \| `contributor` \| `advisor` \| `chapter_leader` \| `listed` \| `other` \| null | Nature of the reported tie, so the UI can be precise. |
| `fedsoc_source` | url \| null | Source URL. **Required whenever `fedsoc_reported` is true.** |
| `acs_reported` | boolean | American Constitution Society equivalent of `fedsoc_reported`. |
| `acs_basis` | same enum as `fedsoc_basis` \| null | ACS equivalent of `fedsoc_basis`. |
| `acs_source` | url \| null | ACS source URL. Required whenever `acs_reported` is true. |
| `data_verified` | boolean | Human-verification flag. Always written `false`; set `true` only by a human reviewer. |
| `notes` | string \| null | Free text: ambiguities, other orgs a source mentions, verifier guidance. |

*Derived at render time (not stored): time-in-service (from `commission_date`), and for fixed-term
judges, time served in current term + years remaining (from `commission_date`/`term_expiration_date`).*

---

## Table B — `courts.csv`
*Stability: **stable** (derived to `data/courts.json`).*
Reference table: hierarchy, seats, tenure, geometry.

| variable | type | description |
|---|---|---|
| `court_id` | string | Primary key; CourtListener court code. |
| `court_name` | string | Full official name. |
| `short_name` | string | Compact label for selector/map. |
| `court_level` | enum `scotus` \| `circuit` \| `district` \| `specialized` | View placement + draw rule. `specialized` = USCIT, CFC; `scotus` is the single Supreme Court row (added with SCOTUS scope, 2026-07-18 — the enum here had not been updated to say so). `seat_blocks.json`'s `level` uses this same value (`specialized`), unified at schema 2.0 — see `DATA_CONTRACT.md` §7 (was `feeder`, a second vocabulary for the same concept, through 1.x). |
| `parent_id` | string \| null | District → its circuit. Specialized → the circuit that hears its appeals (`cafc`). Null for circuits. |
| `tenure_type` | enum `life_tenured` \| `fixed_term` \| `fixed_term_senior` | Governs senior-status applicability and how term length is shown. `fixed_term_senior` is a CFC-only carve-out (see below): active judges still serve a real 15-yr term like plain `fixed_term`, but the court also has statutory senior status (28 U.S.C. §178) that behaves like `life_tenured`'s — supernumerary, doesn't count against `authorized_judgeships`. |
| `authorized_judgeships` | integer | Statutory active-seat count (28 U.S.C. §44 / §133). Vacancies = `authorized_judgeships − active judges`. |
| `has_geography` | boolean | Whether the court has a mappable shape (false for USCIT/CFC → selector-only). |
| `is_inset` | boolean | Whether geography renders as a composite inset (AK/HI/PR). |
| `geometry_key` | string \| null | Links to the path id(s) in the national and circuit-local SVG assets. |

**CFC (`uscfc`) tenure carve-out.** `tenure_type = fixed_term_senior`, not `fixed_term`, and not
`life_tenured` either — it is genuinely a hybrid, confirmed against the statute (see
`docs/DATA_SOURCES.md` for the full note; discovered 2026-07-15 during a data-collection pass):
- **28 U.S.C. §171**: 16 authorized judgeships, 15-year terms — active judges are real fixed-term
  appointees, same as the territorial courts. This is why `fixed_term_senior` keeps the
  `fixed_term` half of the behavior (term_expiration_date drives the vacancy clock for active
  judges) rather than being folded into `life_tenured`.
- **28 U.S.C. §178**: judges may retire to *senior status* and continue hearing cases; a senior
  judge "shall not be counted as a judge of the Court of Federal Claims for purposes of the
  number of judgeships authorized by section 171" — i.e. senior status vacates the active seat
  exactly like a life-tenured court's, unlike the territorial `fixed_term` courts (gud/nmid/vid),
  which have no senior-status provision at all and where `authorized_judgeships` simply equals
  the active headcount.
- **28 U.S.C. §171**: the Chief Judge is *designated by the President* (any judge under 70), not
  by seniority as on Article III courts — worth knowing if the UI ever explains how a chief judge
  got the title.
- **28 U.S.C. §174**: CFC is a single-judge trial court — "the judicial power ... shall be
  exercised by a single judge" — it has no panels and no en banc mechanism. The majority-toggle's
  generic "seniors generally do not vote en banc" explainer (`court-tracker.js`) already reads
  fine here (it's equally a simplification for the 94 district courts, which also decide nothing
  en banc); no CFC-specific UI change was made for this.

---

## Table C — `circuit_justices.csv`
*Stability: **stable** (derived to `data/circuit_justices.json`).*
Small, separately loaded. Maps each circuit to its assigned SCOTUS Circuit Justice.

| variable | type | description |
|---|---|---|
| `circuit_id` | string | FK → `courts.court_id` for the circuit (e.g. `ca9`). |
| `justice_cl_person_id` | integer \| null | CourtListener id of the assigned Justice, if available. |
| `justice_name` | string | Name of the assigned Circuit Justice (shown elevated above the arc). |
| `assignment_start_date` | date \| null | When the current assignment took effect (assignments change over time). |
| `photo_url` | url \| null | Face image URL; same rules as Table B (the Justice renders as a judge icon, so it needs the same licensed image). |
| `photo_source` | url \| null | As Table B. |
| `photo_license` | string \| null | As Table B. |
| `source_url` | url | Source substantiating the assignment. |
| `notes` | string \| null | Free text. |

`data/circuit_justices.json` (the derived file) no longer duplicates this as `full_name`
(collapsed at schema 2.0, issue #28 — it existed only because the widget's shared judge-icon
renderer reads `full_name`). A consumer wanting the icon-renderer field name should synthesize it
itself (`full_name = justice_name`), the same way `embed/court-tracker.js` now does client-side at
load time rather than publishing the duplicate.

---

## Table D — `seat_blocks.csv`  (operator-tuned map placement)
*Stability: **reference-renderer** — placement is tuned for this widget's map; composition is portable.*
Optional and **sparse**: one row only for a court whose seat-block you have actually placed.
Anything absent falls back to the centre of the largest part of that court's shape, so a geometry
re-export doesn't invalidate rows you never tuned.

Tune it with **`tools/tune-seat-blocks.html`** (drag a block, adjust size, Export CSV). Placement is
a **data-only** change: drop the CSV in, re-run `build_assets.py`, bump nothing else.

| variable | type | description |
|---|---|---|
| `court_id` | string | FK → `courts.court_id`. Circuits and districts only (the feeders `cit`/`uscfc` never appear on a map). |
| `anchor_x` | number \| null | Block **centre**, in the projected units of the SVG the block renders in — `national.svg` for a circuit, `assets/geo/circuits/<parent>.svg` for a district. **Pre-Y-flip** (geographic Y up), i.e. the same space as the path data and QGIS. |
| `anchor_y` | number \| null | As `anchor_x`. |
| `size` | number \| null | Square edge in **CSS px**. Null → the app default (6.5). Deliberately *not* map units: the national and circuit-local projections differ ~4x in scale, so a map-unit size would render the same block far larger after a drill-in and swamp the districts. Position is in map units; size is not. |
| `notes` | string \| null | Free text. |

- **`cafc` must always have a row.** The Federal Circuit has `has_geography = false`, so there is no
  shape to centre on; it is placed by hand in open water off the 11th Circuit.
- The block is the **authorized bench**: one square per authorized judgeship, grouped by appointing
  party with vacancies last. Seniors, the Circuit Justice and chief markings are excluded by design.
  Where a court seats more active judges than §133 authorizes (roving judgeships, CFC — see
  `DATA_SOURCES`), the block grows to fit them rather than dropping a judge.

---

## Table E — `appointments.csv`  (historical; feeds the appointments beeswarm widget)
*Stability: **stable**, promoted from `provisional` at schema 2.0 (issue #28) — `data/appointments.json`
is now a typed build, not a string-typed passthrough; see `DATA_CONTRACT.md` §7.*

Written by `scripts/collect_appointments.py`; derived to `data/appointments.json` by
`build_assets.py` (manifest key `files.appointments`, via `build_appointments()`). One row per
APPOINTMENT since 1969-01-20 (Nixon) — a judge elevated district→circuit is two rows. Consumed by
`embed/appointments-chart.js`.

The columns below describe the **source CSV**, where every cell is text by construction. The
derived JSON types them: dates and free-text fields are `string | null` (an empty cell → real
`null`); `sitting` is a plain `boolean`; `fjc_jid` is `int | null`.

| column | notes |
|---|---|
| `full_name` | FJC name form (First Middle Last Suffix) |
| `court_id` / `court_level` | as in `courts.csv` (`scotus`/`circuit`/`district`/`specialized`) |
| `appointing_president`, `president_party` | verbatim from FJC; reorganizations appear as `None (reassignment)` in BOTH columns (not an empty party, despite how that reads) |
| `nomination_date`, `confirmation_date`, `commission_date` | ISO dates |
| `senior_date` | set when the judge (later) took senior status in THIS appointment |
| `termination_date`, `termination_reason` | empty while the appointment is held. Departed CFC judges carry year precision only (see `date_precision = termination:year`) |
| `sitting` | true iff currently held. A RETIRED justice is `sitting=false` with an empty `termination_date` — their departure date is `senior_date` (28 U.S.C. §371) |
| `fjc_jid` | FJC judge id (empty for CFC/territorial rows) |
| `fedsoc_reported`, `acs_reported` | joined from `judges.csv`; populated for sitting judges only. **Genuinely three-state** in the derived JSON (`null`/`false`/`true`), not just true/false: `null` means "never asked" (a departed judge, or a sitting one the join missed — real in the data, not hypothetical); `false` means "asked, reported unaffiliated". Collapsing both to `false` would fabricate a checked-and-negative signal from data that was simply never checked (`CLAUDE.md` §2). |
| `photo_url`, `photo_source`, `photo_license` | SCOTUS rows only (the beeswarm draws justices with photos). Sitting nine from judges.csv at collect time; former justices via `scripts/enrich_scotus_photos.py` (same license gate as all photos). |
| `source`, `notes` | `fjc_bulk` / `fjc_html` (CFC) / `territorial_manual` (current-only, documented gap) |

---

## Table F — `district_arrangement.json`  (operator-authored; national district-block cartogram)
*Stability: **reference-renderer** — a hand-built cartogram for one specific view.*

Hand-built via the standalone `tools/district-block-builder.html` (Sampler → Editor → District
linker → Arrangement stages; see `PROGRESS.md` sessions (bi)-(bq) for the tool's own build
history). One entry per geographic circuit (12 — the 11 numbered circuits + D.C.; the Federal
Circuit has no districts and never appears here), each a square-grid matrix hand-shaped to
resemble that circuit's real boundary, positioned on a shared canvas so the 12 together roughly
resemble the outline of the continental US. **Not yet consumed by `build_assets.py` or the live
widget** — this is the raw tool export, checked in as source while the map-integration work
(rendering it as a new national-view-only cartogram layer, per `CLAUDE.md`'s planned "Summary >
District" feature) is still pending.

| key | type | description |
|---|---|---|
| `schema` | string | `district-block/arrangement@1` — the tool's own export format tag. |
| `circuits[].circuit_id` | string | FK → `courts.court_id`, always a circuit. |
| `circuits[].offset` | `[x, y]` | This circuit's block cluster's position on the shared arrangement canvas, in the same fixed square-grid units the matrix itself uses (`PITCH` in the tool — centre-to-centre block spacing). Arbitrary, human-placed; no relation to real map projection units. |
| `circuits[].matrix` | `number[][]` | 0/1 grid; 1 = a block exists at that row/col. Trimmed (no all-zero edge row/col). |
| `circuits[].cell_colors` | `{"row,col": "r"\|"d"\|"o"\|"vacant"}` | **Frozen at export time** from that session's `seat_blocks.json` — do NOT treat as live truth. A future ingestion step must recompute colors from current judge data (same principle as `seat_blocks.json` itself: composition is always derived fresh, position/shape is the only durable human input) rather than trust this field going stale as appointments change. |
| `circuits[].cell_district` | `{"row,col": court_id}` | Which district court owns each block — durable (doesn't change with judge composition), needed for the map's per-district hover-highlight behavior. |

- **Re-tuning is data-only**, same as `seat_blocks.csv`: re-export from the tool, drop the file
  in, no code changes — once a `build_assets.py` step exists to consume it.
- If a circuit's real judge composition changes before that build step exists, `cell_colors`
  here will silently be stale; there is no automatic refresh path yet.

## Table G — `judges_search.json`  (derived; header search-bar index)
*Stability: **stable**. Deliberately narrow — request additions per `DATA_CONTRACT.md` §6.*

Built by `build_assets.py` straight from the already-derived `judges` list (Table A), keeping
only the fields the header search bar needs — no photos, education, affiliations, ABA rating,
or dates. Deliberately a SEPARATE asset from the 14 per-circuit judge bundles (`data/judges/*.json`,
~1.9MB combined): the search bar needs every sitting judge available client-side to filter on
every keystroke, and fetching all 14 bundles just for name/court/party/president would defeat the
national view's lazy-load contract (`CLAUDE.md` §6). The widget fetches this file once, lazily, on
first interaction with the search box — never on initial mount.

| key | type | description |
|---|---|---|
| `full_name` | string | As Table A — the string searched and displayed (with the matched portion bolded). |
| `court_id` | string | FK → `courts.court_id`. Present when the judge holds exactly one court seat (the vast majority). Drives the result's court label and where a click navigates. |
| `court_ids` | string[] | FK → `courts.court_id`, one per seat. Present INSTEAD of `court_id` for a **roving judgeship** (28 U.S.C. §133 shares one seat across same-state districts — e.g. E.D./W.D. Missouri, E.D./W.D. Kentucky, N/E/W.D. Oklahoma — see `DATA_SOURCES.md`'s discrepancy log), where the SAME judge has one `judges.csv` row per district. Sorted alphabetically at build time; `court_ids[0]` is the deterministic "primary" court used for sort order and as the click target, but the label lists every court (e.g. "E.D. Mo. / W.D. Mo. (8th Cir.)"). |
| `status` | enum `active` \| `senior` | As Table A. |
| `appointing_president` | string \| null | As Table A. |
| `president_party` | enum `Republican` \| `Democratic` \| `Other` \| null | As Table A. |

- **Data-only, like every other derived asset here**: re-running `build_assets.py` after a
  `judges.csv` change regenerates this file automatically — no separate step, no code change.
- **Roving-judgeship merge is generic, not a hardcoded district list**: `build_assets.py` groups
  `judges.csv` rows by `(full_name, commission_date)` — the same identity key the collector
  itself already uses to join a person across sources — so any judge who ends up holding more
  than one court seat merges automatically, not just the three statutory pairs/triples known
  today.

## Table H — `manifest.json`'s `national_totals`  (derived; nation-wide reconciliation)
*Stability: **stable**.*

Computed by `build_national_totals()` in `build_assets.py` and written into `data/manifest.json`
directly (no separate file) — small enough to ride along with the version/counts already there.
Ported out of the reference widget (`embed/court-tracker.js` used to compute this at render time)
so any consumer of the raw data package, not just this repo's own widget, gets the correct
nation-wide authorized/active/vacant numbers without reimplementing the reconciliation below.

| key | type | description |
|---|---|---|
| `authorized` | integer | Sum of `authorized_judgeships` across every `court_level = district` court. |
| `active` | integer | Sum of active R+D+other judges across the same courts, from `seat_blocks.json`. |
| `vacancies` | integer | Sum of each court's `authorized - active`, floored at 0 per court (see below). |
| `over_authorized` | integer | Sum of each court's `max(0, active - authorized)` — the amount by which a court seats MORE active judges than it is authorized (roving judgeships — 28 U.S.C. §133 shared seats across same-state districts — plus rare FJC status lag; see `docs/DATA_SOURCES.md`'s discrepancy log). |

`authorized + over_authorized` always equals `active + vacancies` exactly — `over_authorized` is
what makes the three headline numbers reconcile instead of silently not summing (a handful of
courts are over their base authorized count, and `build_seat_blocks()` deliberately floors THEIR
`vacancies` at 0 rather than inventing a negative one, since a real judge is never dropped from
the block).

- **Data-only, like every other derived asset here**: re-running `build_assets.py` regenerates
  this automatically whenever `seat_blocks.json`'s underlying counts change — no separate step.
- Present only when `seat_blocks.json` is (i.e. `null` in a build with no courts/judges at all).

## Validation rules (enforced in `build_assets.py`)
- Every `judges.court_id` and `circuit_justices.circuit_id` exists in `courts.csv`.
- `fedsoc_reported`/`acs_reported` true ⇒ corresponding `*_source` non-null.
- `status = senior` ⇒ `tenure_type` is `life_tenured` or `fixed_term_senior` for that court, and `senior_date` non-null.
- `tenure_type = fixed_term` ⇒ `status = active` and `term_expiration_date` non-null; `senior_date` null.
- `tenure_type = fixed_term_senior` ⇒ `term_expiration_date` non-null for every judge (active or senior); `status = senior` requires `senior_date` non-null (covered by the rule above).
- `has_geography = false` ⇒ `geometry_key` null and `is_inset` false.
- `commission_date` present for every judge; used as the ordering key.
- `data_verified` is `false` on every machine-written row.
- `photo_url` non-null ⇒ `photo_license` non-null (never ship an image we cannot license).
- `seat_blocks.court_id` exists in `courts.csv` and is a circuit or district; `anchor_x`/`anchor_y`
  are set together or not at all; `cafc` has an anchor (it has no shape to fall back to).
