# DATA_SOURCES — provenance & verification

## Sources (in priority order)
1. **CourtListener / Free Law Project REST API** — primary spine for judges, seats/positions,
   appointing president, nomination/confirmation/commission dates, education, ABA rating, and the
   profile URL. **Check the current API docs at collection time** (courtlistener.com/help/api/rest/);
   do not hardcode an API version from memory. Use an API token from `COURTLISTENER_TOKEN` (env var).
2. **Wikipedia / Wikimedia Commons** — `photo_url` (+ `photo_source`, `photo_license`) and context
   for reported FedSoc/ACS affiliation.
3. **Web search** — to substantiate affiliation claims with a citable `*_source`, and to fill gaps.
4. **Statute (28 U.S.C. §44, §133)** — `authorized_judgeships` per court.

## Collection rules
- Cache every API/web response to disk (e.g. `scripts/.cache/`) keyed by request, so runs are
  resumable and cheap to re-run. Respect rate limits; back off on 429.
- Machine-written rows always have `data_verified = false`.
- Unsourced field → leave null + explain in `notes`. Never invent a value to fill a column.
- Affiliation: set `*_reported = true` only with a real `*_source` URL and a `*_basis`. "Spoke at a
  chapter event" is `basis = speaker`, not `member`. Keep the distinction honest.
- Photos: only set `photo_url` when `photo_license` is known and permits reuse; else null (fallback
  avatar). Prefer public-domain / Wikimedia / CourtListener.
- Scope reminder: active + senior on life-tenured courts; in-term judges on fixed-term courts
  (territorial districts, CFC). Exclude magistrate, bankruptcy, purely historical judges.

## Verification checklist (human step, later)
For a sampled court per circuit, confirm against CourtListener + one cross-source:
- [ ] Active judge count + vacancy count = `authorized_judgeships`.
- [ ] Each senior judge has a `senior_date`; each active seat is filled or shown vacant.
- [ ] Appointing president + party correct; ring color follows party.
- [ ] Chief judge flag correct and singular per court.
- [ ] Circuit Justice assignment current and sourced.
- [ ] Any affiliation flag has a working source and an accurate basis.
- [ ] Photos load and are licensed; fallbacks render where null.
Set `data_verified = true` only after a row passes.

## Collection methodology as run (Phase 2 — `scripts/collect_courtlistener.py`)
Probing CourtListener (v4) at collection time surfaced data-quality limits that shaped the approach:
- **CL's active/senior/chief flags are unreliable.** `date_termination` is frequently null even for
  judges who have died or left (e.g. ca8 listed 21 "current" `jud` positions incl. Myron Bright,
  d. 2016); `date_retirement` is null for known seniors (Wollman); `c-jud`/`ret-senior-jud` came back
  empty for ca8. So CL cannot be trusted for who currently sits, senior status, or chief.
- **Decision — FJC directory is the authoritative spine** for all life-tenured courts (13 circuits,
  91 districts incl. Puerto Rico + D.C., and USCIT). Source: FJC Biographical Directory export
  (`data/cache/fjc_judges.csv`, from fjc.gov). Per **appointment block** matched by court *name*:
  current ⇔ Termination Date empty; senior ⇔ Senior Status Date set; chief ⇔ an open
  "Service as Chief Judge" span. Commission/nomination/confirmation dates, appointing president +
  **party**, ABA rating, and JD school/year all come from FJC.
- **CourtListener supplies `cl_person_id` + `cl_profile_url`**, joined by FJC `jid` == CL `fjc_id`
  (verified: Colloton jid 3024 == CL fjc_id 3024). Built from per-court `positions?court=…&
  position_type=jud` embeds; per-judge `people?fjc_id=…` fallback for misses. Very recent appointees
  (e.g. 2026) may not yet be in CL → `cl_person_id` left blank, noted.
- **Fixed-term courts (Guam `gud`, N. Mariana `nmid`, Virgin Islands `vid`, CFC `uscfc`) are NOT in
  the FJC bulk CSV export this project caches** (`data/cache/fjc_judges.csv` is Article-III-only)
  → the original collector took the roster from CL instead, and CL turned out unreliable for
  this purpose (confirmed against its live API, not just a stale cache) — over-inclusive for
  `uscfc` (departed judges with no recorded termination) and missing a 2026 appointment for
  `vid`. **RESOLVED 2026-07-16 for all four**, as systematic pipeline code, not a one-off pull —
  see that dated entry below. `uscfc` now comes from FJC's own (non-bulk) per-judge pages;
  `gud`/`nmid`/`vid` from a documented, cited, drift-checked CSV (no systematic source exists
  for these three — checked directly). None of the four is `data_verified=true` yet; that
  remains a human step.

## Enrichment methodology as run (Phase 2 — `scripts/enrich_wikipedia.py`)
Photos and reported affiliation, run 2026-07-14. Re-runnable offline: `--no-net` rebuilds from
`data/cache/wiki/` (Wikidata SPARQL result, Commons imageinfo batches, enwiki wikitext batches).

- **Join is by identifier, never by name.** Wikidata property **P12000** ("Biographical Directory
  of Federal Judges numeric ID") == FJC `nid`, recovered from `data/cache/fjc_judges.csv` with the
  same `(full_name, commission_date)` key the collector built. Result: **1,359 / 1,483 judges**
  linked to a Wikidata item. The 124 misses are the fixed-term courts (gud/nmid/vid/uscfc, absent
  from the FJC directory) plus judges with no Wikidata item — they simply get no photo.
- **Photos: 1,094 / 1,483 judges (74%)** + **13 / 13 Circuit Justices**. Image = Wikidata P18 →
  Commons `imageinfo` at width 320. `photo_url` is written **only** when the license is
  machine-readably free (`extmetadata.License` ∈ pd/cc0/cc-by*); 2 candidates were rejected on
  unclear terms and fall back to the initials avatar. Distribution: 1,029 public domain (mostly
  official federal portraits), 71 CC BY / CC BY-SA, 6 CC0. The 71 that **require attribution**
  carry `— credit: <author>` in `photo_license`, and the widget renders a credit line linking to
  the Commons file page; public-domain images render no credit line.
- **Circuit Justices** join on `(first, last)` restricted to FJC rows *currently serving* on the
  Supreme Court — necessary because the directory holds three Jacksons and two Robertses, and
  because `justice_name` ("John G. Roberts, Jr.") never matches FJC's middle name ("John Glover
  Roberts Jr.").
- **Affiliation: 111 `fedsoc_reported`, 3 `acs_reported`** (bases: 90 member, 11 contributor,
  5 advisor, 4 speaker, 3 chapter_leader, 1 listed). Method: scan enwiki wikitext for the org name,
  then record a claim **only** when all of these hold — otherwise the mention is logged, not claimed:
  1. the **sentence containing the org name** matches a basis pattern (classifying on a loose
     context window instead mislabeled plain members as `advisor` from an unrelated nearby board);
  2. the judge is the **subject** of that sentence — surname present, or a pronoun *before* the org
     name. This is what rejects "…**Ho** delivered a speech at a Federalist Society conference…"
     appearing in Elizabeth Branch's article;
  3. the sentence carries no **negation/criticism** cue, and no **relative** cue — Guido Calabresi's
     article calls his *son* Steven a FedSoc co-founder, which a surname check alone would accept;
  4. for an org-hosted link, the URL must be a **person-profile path** (`/contributors/`, `/bio/`,
     …). A citation to some fedsoc.org commentary page is evidence about an article, not a judge.
  `*_source` prefers the org's own URL, else the citation nearest the claim, else a Wikipedia
  **permalink** (`?oldid=`) so the quoted revision stays verifiable.
- **Every claim is logged for the human verifier** in `data/cache/wiki/affiliation_audit.csv`
  (judge, court, kind, basis, source, quoted evidence) — including the 19 mentions deliberately
  *not* claimed, so a reviewer can see the near-misses rather than only the accepted ones.
- **Known limits.** Wikipedia is the effective ceiling on affiliation coverage: a judge with a real
  FedSoc tie that their article never states gets `false`, so **`fedsoc_reported = false` means
  "unreported here", NOT "no affiliation"** — do not read the flag as evidence of absence. Bases are
  keyword-derived and approximate (a "member" who is also a frequent speaker is recorded once, by
  the first pattern that matches). All rows remain `data_verified = false`.

## Discrepancy log
- **Arkansas court codes.** Our frozen `court_id`s (== geometry ids) use `are`/`arw` for E.D./W.D.
  Arkansas, but CourtListener's API uses `ared`/`arwd` (the pattern-correct `<state><div>d` codes).
  This is a Phase-0 freeze error, but `courts.csv` and the geometry SVGs are internally consistent
  on `are`/`arw`, so the collector maps `are→ared`, `arw→arwd` for **API calls only** and stores our
  code. **To reconcile fully, the operator would regenerate `ca8` geometry with `ared`/`arwd`**; until
  then `are`/`arw` is an internal alias. Any other code mismatch is auto-detected (CL 400) and the
  affected judges' `cl_id`s fall back to `people?fjc_id`; mismatches are logged by the collector.
- **Count reconciliation vs statute (sweep of 2026-07-13).** 1,483 sitting judges (863 active /
  620 senior). Total authorized (all courts) 877 vs 863 active → 14 net vacancies. Seven courts show
  `active > authorized`, each explained:
  - `uscfc` (+8): **RESOLVED 2026-07-15** — was the flagged CFC (Art. I) over-inclusion (CL lacked
    reliable terminations); see the dated entry below. `uscfc` no longer over-counts (16 active ==
    16 authorized, exactly, plus 5 senior correctly excluded from the authorized count).
  - `moed` (+2), `mowd` (+2), `kyed` (+1), `kywd` (+1), `okwd` (+1): **roving judgeships**. §133 gives
    Missouri E&W 2 shared, Kentucky E&W 1, Oklahoma N/E/W 1 seats beyond the per-district counts stored
    in `courts.csv` (the Phase-0 flagged item). Residual over-count on MO reflects FJC senior/termination
    lag (a judge or two carried as active). Left as-is (allocation of shared seats is ambiguous); the
    per-court `authorized_judgeships` remains the base §133 count — reconciled here, resolve on verify.
  - `ilnd` (+1): minor FJC status lag.
  `cl_person_id` is blank for 239/1483 (16%) where CL's bulk people table has no `fjc_id` and no unique
  name match; those judges simply get no CourtListener link. All rows `data_verified=false`.

### 2026-07-16 — systematic pipelines for uscfc + gud/nmid/vid (supersedes yesterday's manual pull); Wikidata enrichment bridge; UI fixes
**Trigger:** operator asked for the 2026-07-15 `uscfc` fix to be redone as reusable pipeline code
(not another one-off manual pull), extended to the three territorial courts, plus the earlier
proposed enrichment-join folded in.

**Empirical re-check, not assumption.** Before building anything, tested whether CL's roster
problem was really CL, or just a stale local cache: hit CourtListener's **live** unauthenticated
API directly (no token needed) for all four courts.
- `uscfc`: live data is the SAME incomplete 33-position set the cache had — confirms CL's own
  database is missing 10 sitting judges and lacks terminations for 13 departed ones. Not a
  caching artifact.
- `gud`/`nmid`/`vid`: live data matched what we had for `gud`/`nmid`, **but missed `vid` entirely
  changing** — CL had no record of Evan Rikhye's May 2026 confirmation, and Wilma Lewis (shown
  active in our data) had already transitioned to senior status in Feb 2025. CL is unreliable
  here too, just less obviously so until checked against a fresher source.

**`uscfc`: real systematic scraper, not a manual pull.** FJC maintains CFC judges via a *separate*
product from its Article-III-only bulk CSV: `fjc.gov/history/courts/us-court-federal-claims-judges`
(full historical roster with `(YYYY-present)` service spans + succession chart) plus one page per
judge. Verified this session to be plain, regex-parseable HTML (no HTML-parsing library needed —
matches this project's zero-dependency scripts). Built in `scripts/collect_courtlistener.py`:
`fjc_cfc_listing()` (the roster page), `fjc_cfc_bio(slug)` (nomination/confirmation/commission/
appointer/education, from the page's single `field-content` prose block), `fjc_cfc_active_senior()`
(scrapes `uscfc.uscourts.gov/judges`'s "Judges"/"Senior Judges" lists — this, not FJC's fuller
"-present" list, is the authoritative filter: FJC's "-present" means "still commissioned," and
turned up 7 more senior judges — Baskir, Bush, Hodges, Sweeney, Turner, Wiese, Yock — who are
alive and hold the title but aren't on the court's own current-roster page; resolved with the
operator to exclude them, matching the "count only active senior judges" principle). Regex
gotchas hit and fixed along the way, recorded so they aren't re-discovered: a "vacated by Edward
J. Damich" clause's own middle-initial period broke a `[^.]+` sentence-end match (needed a lazy
`.+?` up to the literal `. Confirmed` instead); consecutive `<br>`-joined education entries have
no comma between them, so a single flattened-text regex swallowed a prior entry's year as a
prefix of the next school name (fixed by isolating the `Education:` block and splitting on `<br>`
*before* stripping tags, parsing each degree line independently); Marian Blank Horn's page has
TWO appointment blocks (1986 original, 2003 reappointment) — `finditer` + take the LAST match, so
a reappointed judge's current term wins (same convention as the `fixed_term_senior` carve-out).
`PRESIDENT_PARTY` needed the full-middle-initial forms FJC uses ("Donald J. Trump", "Joseph R.
Biden", "William J. Clinton") added alongside the existing short forms. Verified: all 21 current
judges (16 active + 5 senior) parse cleanly with zero manual overrides needed — matches the
2026-07-15 manually-researched roster exactly, including Solomson's corrected spelling and Tapp's
corrected JD school.

**`gud`/`nmid`/`vid`: documented CSV, not a scraper — checked directly that no better option
exists.** No FJC equivalent for these three (no listing/succession page found, no bulk product).
Each court's own site has a genuinely different, small, inconsistent layout (Guam: `<h5><strong>`
blocks; Virgin Islands: an unlabeled nav menu that quietly omits inactive seniors' pages; N.
Mariana Islands: no roster page found at all) — not worth three bespoke parsers for a combined 4
judgeships. `data/cache/territorial_judges_manual.csv` (columns mirror `judges.csv` plus
mandatory `source_url`/`verified_date`) is the documented fallback, read by
`territorial_manual_rows()` in `scripts/collect_courtlistener.py`, which also runs a **drift
check** every run: substring-matches each row's surname against the court's own live page and
warns loudly if one goes missing. Real, current data as of 2026-07-16 (major corrections from
what was in `judges.csv` before):
- `gud`: Tydingco-Gatewood — roster unchanged, but now dated/cited, and flagged as a **genuine
  ongoing holdover** (10-yr term expired 2016-10-30 under 48 U.S.C. §1424b's "until a successor
  is chosen and qualified"; no successor confirmed since — a 2016 renomination died at sine die
  adjournment, a 2024 "intent to nominate" was never formally transmitted).
  `term_expiration_date` is real and already in the past — see the UI fix below for why that's
  not a bug.
- `nmid`: Manglona — was showing her *original* 2011 term; corrected to her 2024-04-22
  reappointment (a fresh 10-yr term, itself preceded by a now-resolved 2021–2024 holdover of the
  same kind Guam is in today).
- `vid`: was showing only Wilma Lewis as sole active judge. Corrected to 2 active (Molloy — chief
  since 2021; Rikhye — confirmed May 2026, succeeding Lewis's active seat) + 0 senior currently
  featured. Gómez's and Lewis's individual bio pages still resolve (HTTP 200/403 respectively)
  but neither appears in the court's current judges navigation — treated the same as CFC's
  excluded inactive seniors, on the same "official current-roster page wins" principle, though
  this determination is thinner evidence than CFC's clean Active/Senior split and is exactly the
  kind of judgment call `docs/TERRITORIAL_EXTRACTION_PROMPT.md` exists to re-check periodically.
  Evan Rikhye's `commission_date`/`term_expiration_date` are an **unverified placeholder** (his
  Senate confirmation date, since no oath/commission date has been reported as of 2026-07-16) —
  flagged in the CSV's notes, needs a follow-up check.
- **`docs/TERRITORIAL_EXTRACTION_PROMPT.md`** is the reusable prompt for the next refresh —
  written because there's no scraper to re-run and no legal update cadence to schedule against
  (checked: no statute, Judicial Conference policy, or FJC documentation specifies how often
  court websites must be updated; the practical rule is "re-check before trusting this file for
  something that matters," reinforced by the drift check above).

**Enrichment (photos/FedSoc/ACS) extended to reach all four courts.** `enrich_wikipedia.py`'s
existing join is keyed on FJC `nid` (from the bulk CSV these four courts are excluded from), so it
structurally could never reach them — confirmed by testing all 24 affected judges directly against
Wikidata: **21/21 CFC judges have a Wikidata item, and 21/21 carry `P12000`** (Wikidata's "FJC
numeric ID" property — present despite CFC being excluded from FJC's *bulk* product, evidently
because FJC's underlying id numbering is shared across its whole "History of the Federal
Judiciary" site, not just the Article-III bulk export; found via Solomson's item already being in
the existing cached SPARQL dump, `data/cache/wiki/wd_fjc.json`). The 3 territorial judges tested
have Wikidata items with photos but **0/3 carry `P12000`** (consistent with FJC not covering these
courts at all). Added `wikidata_bridge()`: resolves a judge's Wikidata item by NAME (trying the
full name and a bare "First Last" form — one form sometimes finds an item the other misses, both
observed) instead of by nid, accepting a hit only if unambiguous (exactly one search result) and
either `P12000`-verified (uscfc) or description-corroborated as "judge" (the territorial courts,
where `P12000` can never apply). Produces the same `{qid, file, title}` shape the existing nid
join does, so every downstream step (Commons license-gating, the four-rule hedged FedSoc/ACS
wikitext scan) runs completely unchanged. Result: **+22 photos, +4 FedSoc** (Meyers, Roumel,
Holte, Wolski — each with a source + basis, same as any other judge).

**A real (pre-existing, not self-inflicted-but-self-discovered) caching bug, found and fixed along
the way.** `fetch_imageinfo`/`scan_articles` batch their Commons/Wikipedia API calls 50-at-a-time
and cache each batch under a key like `img_0015` — **purely positional** (`f"{prefix}_{i//50:04d}"`).
Adding the 22 bridged judges' files shifted every later batch's alphabetically-sorted window, so
the positional cache silently served an OLD batch's content at the same index — most bridged
judges got no photo not because Commons lacked one, but because the cache never even asked
Commons about their file. Confirmed directly: `img_0015.json`, which should have contained
Solomson's file after the bridge ran, still held a completely different judge's batch from before.
Fixed by hashing the batch's actual content into the cache key (`_batch_key()`) instead of its
position — content changes now naturally produce a new key rather than silently colliding with a
stale one. Re-ran after clearing the now-orphaned old `img_*`/`wt_*` cache files: **photos
1094→1116 (+22, exactly the bridge additions), FedSoc 111→115 (+4)** — the original 1459 judges'
counts were unchanged, confirming the fix was surgical.

**UI/UX corrections** (`embed/court-tracker.js`, `embed/court-tracker.css`,
`tests/smoke.mjs` +12 assertions across two passes, 180/180 total):
- **Holdover status is now shown, not hidden.** Added `isHoldover()`: true only for
  `tenure_type === "fixed_term"` (the territorial courts) with `status === "active"` and a
  past `term_expiration_date`. Deliberately excludes `fixed_term_senior` (CFC) — checked
  28 U.S.C. §172 directly: CFC's term statute has **no** holdover clause, unlike the territorial
  courts' organic acts, so a CFC judge whose term lapsed would be a real vacancy, not a holdover,
  and must not get the same treatment. A holdover judge gets a "Holdover" tag next to their
  Chief/Senior tags and reworded detail text ("Term expired Y · holding over pending a
  successor") instead of what used to look like a stale/broken past date.
- **"Years remaining" was documented (`CLAUDE.md` §3) but never actually shown** for fixed-term
  active judges — the detail panel only had "expires Y". Added alongside the holdover fix (both
  touch the same code path): non-holdover fixed-term judges now show "X served · Y remaining
  (expires Z)".
- **The pane note was reworked a second time (2026-07-16, later same day) into 5 distinct
  court-type variants, not a circuit/non-circuit binary.** The operator asked for each court type
  to get its own accurate wording rather than a shared "non-circuit" fallback:
  - **Circuit**: unchanged — "generally do not vote en banc" (a real, formal mechanism,
    28 U.S.C. §46).
  - **Plain district** (`life_tenured`, not territorial): simplified to "the district courts do
    not usually vote en banc" — the operator asked to check this against Aaron-Andrew Bruhl,
    *District Courts En Banc*, 90 Fordham L. Rev. 1469 (2022), which documents ~140 historical
    examples of district courts voluntarily convening as a body (Prohibition-era cases through
    the Sentencing Guidelines) — real but rare, with no formal en banc *rule*. "Usually not"
    reads accurately either way without the earlier draft's longer hedge.
  - **Art IV territorial** (`fixed_term` — gud/nmid/vid): the toggle-gated majority note is
    **dropped entirely** — no senior status exists on these courts and 1-2 judgeships make
    "majority computed over active judgeships" meaningless. Its content is folded into the
    **standing note** instead (not toggle-gated — relevant on first open): 10-year term length,
    the holdover rule, and the simplified en-banc line, as separate lines matching the pane's
    fact-per-line convention.
  - **CFC (`uscfc`, `fixed_term_senior`)**: keeps its majority note, reworded to state plainly
    that this court **never** sits en banc at all (28 U.S.C. §174, single-judge only — stronger
    than "usually not"). Gained its own standing note: active judges' 15-year term length, and
    an explicit statement that the senior judges shown are only the ones currently hearing
    cases (the court's full statutory senior roster is larger — see the 2026-07-15/16
    active-vs-full-senior-list resolution above).
  - **USCIT (`cit`)**: checked directly (28 U.S.C. §255) rather than assumed, per the operator's
    "though do check this" — confirmed USCIT has no en banc mechanism, but a genuinely different
    one: the chief judge may designate a three-judge panel for cases raising constitutional
    questions or "broad or significant implications," rather than the whole court convening.
    Gets its own wording naming that mechanism, since neither the circuit nor plain-district
    phrasing fits.
  - Implementation note: the toggle-gated note and the always-visible standing note used to
    share the `.ctt-majority-note` CSS class, which the JS toggle (`setMode`) also used as its
    DOM selector — for a territorial court (no toggle-gated note at all) that selector matched
    the standing note instead and incorrectly hid it in timeline view. Fixed by splitting the
    shared styling onto a new `.ctt-note` class and reserving `.ctt-majority-note` exclusively
    for the element `setMode` actually toggles; renamed the standing-note class from
    `.ctt-fixedterm-note` to `.ctt-standing-note` since CFC now uses it too, not just the
    territorial courts.

Full pipeline re-run and verified clean: `collect_courtlistener.py` → `enrich_wikipedia.py` →
`build_assets.py`, `node tests/smoke.mjs` (180/180), `python3 scripts/check_geometry.py`
(PASS/0 warnings, untouched).

### 2026-07-16 (same day, third pass) — pane note consolidated further; a real icon-overlap bug found
The operator gave exact replacement text for two of the five note variants and asked for the
architecture to simplify: uscfc/cit/gud/nmid/vid all become **one always-visible italicized
note** (no separate toggle-gated note + non-italic standing note); circuits and plain districts
keep the toggle-gated note, unchanged. Verified `28 U.S.C. §797(b)` (the citation given for CFC's
"only active senior judges are shown" claim) directly: "The chief judge of the Court of Federal
Claims may, whenever he deems it advisable, recall any senior judge... to perform such duties as
a judge" — an accurate, better citation than the previously-used §178 for this specific claim.
Fixed a grammar slip in the Art IV text as given ("their judges," not "its judges," to agree with
the plural "district courts"). `.ctt-standing-note` (yesterday's non-italic multi-line class) is
now unused and removed; `.ctt-majority-note` reserved exclusively for the element `setMode`
actually toggles (circuit/district only), with a new `.ctt-always-note` for the always-visible
one — same class-collision hazard as before, avoided the same way.

**A real, previously-latent bug surfaced by making these notes always-visible**, caught by the
operator's request to visually verify rather than assumed fixed by the text change alone:
`layoutJudges()` set `.ctt-judge-stage`'s height to a flat `220px` (timeline) / `320px`
(majority) regardless of how many rows of icons the court actually needed. `layoutTimeline()`
positions icons `position: absolute` inside that box and never consults its declared height, so
a court needing more rows than fit in 220px (CFC's 21 judges → 4 rows at typical widths) simply
drew its overflow row past the box's bottom edge, uncontained (no `overflow: hidden` on the
stage) — invisible as long as nothing rendered directly below, which is exactly what changed
when the toggle-gated note (hidden by default) became an always-visible one. Screenshotted at
700px width to confirm: the 4th row of icons visibly overlapped the note text. Root-caused via
`tests/browser-checks.mjs`-style real-Chrome measurement (jsdom reports 0 for every box, so this
class of bug is structurally invisible to `smoke.mjs` — the project's own documented rule).
Fixed properly, not papered over: `timelineStageHeight()` mirrors `layoutTimeline()`'s own row
math (60px cells, `Math.ceil(total / cols)` rows) and sizes the stage to fit every row *before*
any icon is placed, floored at the original 220px so small/medium courts are unchanged.

Majority mode's arc layout (`layoutArc`/`majorityDims`) still bakes a fixed 320px canvas into its
own geometry (ring radii, outer senior band) — reshaping that touches the extensively-tuned
majority-arc visuals for every circuit, out of scope here. Instead, for the specific drill-in
**contexts** that contain a note-bearing court (`cafc`'s feeder view: cit/uscfc; `ca9`: gud/nmid;
`ca3`: vid), `.ctt-pane` gets a `ctt-pane--tall` modifier (+50px) — set once when `drillIn()`
enters that context, not per individual court selection, so switching between a note-bearing and
a plain court within the same drilled-in view never itself changes the pane's height (the
flicker scenario the operator was specifically guarding against). Verified via real-Chrome
screenshots at 700-900px widths: CFC in both timeline and majority mode, a large plain district
(`cand`, 26 judges - benefits from the same extra room) in the same tall context, and a
single-judge court (`gud`) so the extra height doesn't look emptily oversized there. New
`tests/browser-checks.mjs` assertions (measured, not jsdom): note never starts above the last
icon row's bottom edge; no vertical scrollbar in either mode; `ctt-pane--tall` present for
`cafc`'s context and absent for a plain circuit's (`ca1`). `tests/smoke.mjs` **188/188**
(context-level pane-tallness + consolidated-note assertions added),
`tests/browser-checks.mjs` **8/8**.

**Housekeeping:** with both `uscfc` and the territorial courts off CourtListener as a roster
source, NOTHING in `collect_courtlistener.py` calls CL's live API anymore (only the bulk,
not-rate-limited people table for `cl_person_id` linking). Removed the now-fully-dead code this
left behind: `cl_get`, `cl_positions`, `resolve_president`, `cl_pick_aba`, `cl_jd`,
`fixed_term_rows()` (the old CL-based path), `COURT_CODE_CL`, `CL_UNQUERYABLE`, `ABA_CODE`, and
the `COURTLISTENER_TOKEN` requirement/gate in `main()` — none of it reachable after this session's
changes. `COURTLISTENER_TOKEN` remains a documented env var per `CLAUDE.md` §2 generally; this
script just no longer happens to need it.

### 2026-07-16 (same day, fourth pass) — operator corrections after seeing the third pass live
The operator reviewed the third pass and sent four corrections, all implemented:
1. **`gud`/`nmid`/`vid` never needed the taller pane** — their always-visible note wraps to a
   single line at desktop widths (unlike cit/uscfc's longer text), so `TALL_PANE_CONTEXTS`
   shrank from `{cafc, ca9, ca3}` to just `{cafc}`. Confirms the earlier "at least for those
   contexts" framing was read a little too broadly the first time — only the context that
   actually needs it should carry the cost.
2. **cit/uscfc's note shouldn't show on the timeline view at all** — moved back from the
   always-visible `.ctt-always-note` slot into the toggle-gated `.ctt-majority-note` one
   (majority-mode only), same mechanism circuits/plain districts already use. Only the
   territorial courts' note stays always-visible now — it's short enough (one line) that gating
   it would just hide useful context for no layout benefit, per point 1.
3. **`+50px` was too much** once cit/uscfc stopped showing their note in timeline mode (the
   original layout risk that motivated the number). Trimmed to `+17px` (~1/3, as the operator
   guessed) and reverified: still zero scrollbar at 900-1180px widths; a technical ~13px
   overflow reappears at 750px width narrower than typically tested, but visually the note
   renders fully and nothing clips — judged acceptable rather than over-correcting on a rough
   estimate that was explicitly given as an approximation. **2026-07-17: trimmed further to
   `+15px`** on the operator's follow-up request, after further consideration on their end.
4. **USCIT's note gained a line**: "Senior judges are supernumerary." appended, since USCIT
   (unlike CFC) has ordinary senior status worth naming explicitly.

Test fallout from moving cit/uscfc's note back to toggle-gated: `S.majorityMode` is global
widget state that persists across court switches (correct real behavior - the widget remembers
your view mode as you navigate) - `tests/smoke.mjs` reaches the CFC/USCIT block with
`majorityMode` already `true` from an earlier, unrelated test far up the file, so a same-file
regression test asserting "hidden in timeline view" needs to click "Timeline" first to actually
test that claim rather than inherit stale state. Not a widget bug, a test-ordering fix.
`tests/browser-checks.mjs`'s CFC checks were reworked the same way: the timeline-mode
overlap/scrollbar check now verifies the *stage* sizes correctly on its own merits (no note to
compare against anymore), and the note-overlap check moved to majority mode, where the note
(and the risk) now actually live. `tests/smoke.mjs` **190/190**, `tests/browser-checks.mjs`
**8/8**, `check_geometry.py` PASS/0 (untouched), full pipeline re-run clean.

### 2026-07-15 — `uscfc` re-collected: CL's roster was stale; FJC has this court after all
**(Superseded by the 2026-07-16 entry above — that manual pull is now a re-runnable pipeline.
Kept for the original diagnosis narrative and the discovery trail.)**
**Trigger:** operator noticed only 3 of the ~24 CFC rows had appointment/senior/JD data. Diagnosis:
`fixed_term_rows()` (the CL-based fallback for courts FJC's bulk export omits) uses "no recorded
`date_termination`" as its is-current test. For CFC that heuristic failed badly — CL's position
records for this court are thin and stale:
- **13 rows were judges who had actually left the court** (Yock, Wiese, Hodges, Bush, Firestone,
  Braden, Williams, Lettow, Miller, Wheeler, Sweeney, Campbell-Smith, Griggsby): CL never recorded
  their `date_termination`, so they read as still-active. (Wikipedia's judges list independently
  confirms at least one, Wiese, as "inactive.") Their thin `person` sub-objects (no `appointer`
  link, empty `educations`/`aba_ratings`) is exactly the "name but nothing else" symptom reported.
- **10 real sitting judges were absent from CL's cached positions data entirely**: Bonilla, Davis,
  Dietz, Hadji, Lerner, Meriweather, Meyers, Schwartz, Silfen, Somers.
- 5 judges were miscategorized `active` when the court's own site lists them `senior`: Smith,
  Bruggink, Damich, Horn, Wolski (see the `fixed_term_senior` tenure carve-out, `CLAUDE.md` /
  `docs/CODEBOOK.md`).

**Real root cause, and the actual fix.** FJC **does** maintain CFC judges — just not in the bulk
CSV this project caches. Individual biographical pages exist at
`fjc.gov/history/courts/us-court-federal-claims-<name>` with the same structured
nomination/confirmation/commission/appointer/education fields as the Article-III directory. The
entire `uscfc` slice of `data/judges.csv` (21 rows: 16 active + 5 senior) was rebuilt from those
pages, cross-checked against the live roster at `uscfc.uscourts.gov/judges` (fetched 2026-07-15).
Every row's `notes` field carries its specific FJC source URL. `cl_person_id`/`cl_profile_url` kept
where CL's bulk people table has a matching row (11/21); left blank for the other 10 (not present
in the cached bulk table — consistent with how this project already treats CL misses elsewhere).

**Two more corrections surfaced by going to FJC directly:**
- **Name**: "Matthew Hillel Solomonson" → **"Matthew H. Solomson"**. CourtListener's own person
  slug misspells the surname; FJC, congress.gov, Wikipedia, Ballotpedia and the judge's own court
  bio all agree on "Solomson".
- **JD school**: David Tapp's `jd_school` was truncated to "Brandeis University" (he has no
  connection to Brandeis) — the actual school is the University of Louisville's *Louis D. Brandeis*
  School of Law; FJC gives the full name.

**Tenure-model correction (not just a data fix).** `build_assets.py`'s validator rejected the
corrected senior rows outright: it enforced "fixed_term ⇒ never senior" as a blanket rule. That
rule is right for the territorial courts but wrong for CFC — confirmed against the statute:
28 U.S.C. §178 gives CFC judges real senior status that (like a life-tenured court's) stops
counting against the 16 authorized seats, while active judges still serve a genuine 15-year term
(§171) unlike a life-tenured judge. Modeled as a new `tenure_type = fixed_term_senior`, applied
only to `uscfc` — see `docs/CODEBOOK.md`'s carve-out note (which also records the §171 chief-judge-
by-presidential-designation and §174 single-judge/no-en-banc facts checked at the same time) and
the `CLAUDE.md` tenure-model section, both amended the same session. `court-tracker.js` needed one
line changed (the detail panel's "current term" vs "on the bench" branch now also checks
`j.status !== "senior"`, so a senior CFC judge doesn't get a stale-looking "expires" date); the
bench-count meta text and majority-toggle math needed no change — both were already generic over
`status`, not hardcoded to `tenure_type`. Verified: `build_assets.py` passes, `tests/smoke.mjs`
168/168, and a targeted jsdom probe confirms the CFC pane reads "16 authorized · 16 active · 5
senior · 0 vacant" and shows the right phrasing for both an active (Bonilla: "Current term: ...
served · expires ...") and a senior (Smith: "On the bench: 41 yr") judge.

**Still open:** `gud`/`nmid`/`vid` (the three territorial fixed-term courts) have not been
re-collected this way and likely have the same CL-staleness risk as `uscfc` did — they're just
smaller (1-2 judges each) so a wrong roster is less visually obvious. Worth the same FJC-direct
treatment in a future session if their `data_verified` pass ever surfaces similar gaps. Note FJC's
own site *may or may not* separately cover these Art. IV courts the way it turned out to cover CFC
(Art. I) — unconfirmed, would need the same kind of check done here before assuming it.
<!-- Record further source conflicts and how they were resolved. -->



## 2026-07-18 — SCOTUS added to the collection; historical appointments dataset

* **SCOTUS (court_id `scotus`)** rides the existing FJC-bulk spine unchanged: the bulk CSV
  covers the Supreme Court with the same per-appointment blocks as the lower courts. Two
  carve-outs, both verified against the data directly: (1) a RETIRED justice (Breyer,
  Kennedy) is recorded senior-dated with NO termination — 28 U.S.C. §371, they remain
  Article III judges but do not sit, so the sitting bench = rows with no Senior Status Date
  (exactly nine); (2) the Chief Justice is a distinct APPOINTMENT (detected via
  `Appointment Title`, not the chief-judge service spans lower courts use). Photos/affiliation
  via the normal Wikipedia enrichment (9/9 licensed photos; 4 hedged FedSoc reports).
* **`appointments.csv`** (see CODEBOOK Table E): 2,792 appointment events 1969-02-27 →
  present. FJC bulk for Art III incl. SCOTUS + USCIT (2,749); CFC from the same FJC history
  pages the current roster uses, extended to departed judges (39; termination at YEAR
  precision from the listing's service ranges — their bios don't publish exact dates);
  territorial = current judges only (4; no systematic historical source, same finding as
  2026-07-16). 51 rows are court REORGANIZATIONS (`None (reassignment)`, empty party) —
  kept, flagged, for the chart to skip or style separately. FJC writes Trump's name two ways
  ("Donald J. Trump" 291, "Donald Trump" 2) — left verbatim; consumers should key on party
  + date, not name strings.
