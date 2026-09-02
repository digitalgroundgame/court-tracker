# TERRITORIAL_EXTRACTION_PROMPT

Paste the block below to a Claude session with web access whenever `data/cache/
territorial_judges_manual.csv` needs re-verifying — there is no legal or FJC-mandated update
cadence to schedule this against (checked 2026-07-16: no statute, Judicial Conference policy, or
FJC documentation specifies how often court websites or the FJC's own directory must be updated;
the practical rule is "re-check whenever you're about to trust this file for something that
matters," and immediately after any of the three courts' names are mentioned in the news). This
file exists because none of Guam, the Northern Mariana Islands, or the Virgin Islands district
courts has a systematic, bulk-parseable roster source — see `docs/DATA_SOURCES.md`'s 2026-07-16
entry for why a bespoke regex scraper isn't worth building for a combined 4 judgeships, and why
this is a documented judgment-call extraction, not a mechanical one.

---

## PROMPT (paste this)

```
You are refreshing data/cache/territorial_judges_manual.csv for a federal court tracker. This
CSV is the roster + biographical source for the U.S. District Courts of Guam (gud), the Northern
Mariana Islands (nmid), and the Virgin Islands (vid) — three Article IV territorial courts with
NO systematic FJC or CourtListener coverage (both were checked and found unreliable/absent for
these courts; do not fall back to either as ground truth). Read the CSV's current contents first
so you know what's already recorded and can report what actually changed, not just re-derive
everything from scratch.

Authorized judgeships (do not exceed these without flagging it clearly): Guam 1, N. Mariana
Islands 1, Virgin Islands 2. Each court also has magistrate judges — DO NOT include them; only
the Article IV District Judge(s) count. If you can't tell whether someone is a district judge or
a magistrate judge, say so explicitly rather than guessing from title-adjacent context (their own
official bio page states it plainly — verify there, not from a listing page's grouping).

For EACH of the three courts, in order:

1. Find the court's own current roster. Try, in this order, and note which worked:
   - The court's own official site (gud.uscourts.gov / nmid.uscourts.gov / vid.uscourts.gov) —
     but their page LAYOUTS differ and are NOT reliable for an active/senior split the way
     uscfc.uscourts.gov/judges is (checked 2026-07-16: Virgin Islands' nav menu omits senior
     judges' pages entirely without saying why, which could mean "no longer active" OR "page
     not yet updated" - don't assume either without corroboration).
   - Wikipedia's article for the court (cross-check, don't rely on it alone - it can lag or
     include judges the court's own site no longer treats as current).
   - A recent news search for the court's name + "judge" + the current year, which is often the
     fastest way to catch a very recent confirmation/appointment/senior-status change (this
     caught a Virgin Islands appointment in May 2026 that the court's own nav menu didn't
     surface distinctly).

2. For each CURRENT judge (active or senior AND still receiving case assignments - apply the
   same "does the court's own site currently feature this person" test already used for the
   Court of Federal Claims: a person can hold senior status without still being on the court's
   current roster; only include ones who are), record:
   - full_name, last, first
   - status (active/senior), is_chief (true only for the CURRENT chief judge)
   - appointing_president, president_party (Democratic/Republican)
   - nomination_date, confirmation_date, commission_date (ISO YYYY-MM-DD; if a precise date
     genuinely isn't published anywhere, say so and propose the least-wrong dated proxy rather
     than leaving a required field silently blank - explain the substitution)
   - term_expiration_date (commission + 10 years for these courts)
   - jd_school, jd_year
   - source_url (the SPECIFIC page you pulled the load-bearing facts from, not just the court's
     homepage), verified_date (today), notes (anything a future reader needs: holdover status,
     recent reappointment, an unresolved gap, a discrepancy between sources)

3. Flag explicitly, in your reply (not just the CSV), anything that reads as a HOLDOVER: a judge
   still serving past their 10-year term_expiration_date because no successor has been
   confirmed (real and current for Guam as of 2026-07-16 - Tydingco-Gatewood's term expired
   2016-10-30 under 48 U.S.C. §1424b's "until a successor is chosen and qualified" clause, and
   she is still the only Article IV judge on that court). This is a real, legally significant
   status, not a data error - don't quietly paper over it by inventing a term_expiration_date
   that isn't true, and don't drop the judge from the roster because their date looks "expired."

4. Never fabricate a field. If you cannot source something, leave it blank in the CSV and say so
   in your reply and in the row's notes column. Every row must carry a real source_url - a row
   without one should not be added.

Output: the full updated CSV (same columns, same file), plus a short summary of what changed
since the version you started from and what, if anything, remains unresolved.
```

---

## Why this is a prompt and not a script

Checked directly (2026-07-16): none of the three courts' sites share a layout, and none of them
cleanly separates active/senior/magistrate the way `uscfc.uscourts.gov/judges` does (see
`docs/DATA_SOURCES.md` and `scripts/collect_courtlistener.py`'s `territorial_manual_rows()`
docstring for the specifics — Guam's page uses `<h5><strong>` blocks, the Virgin Islands' current
roster lives only in an unlabeled nav menu that silently omits inactive seniors, and the
Northern Mariana Islands has no equivalent roster page found at all). A combined 4 authorized
judgeships doesn't justify three bespoke per-court scrapers, and the judgment calls involved
(is this senior judge still "current"? is this a holdover or a data error? is this named person
a district judge or a magistrate?) are exactly the kind of thing worth a person or an LLM reading
the actual pages, not a regex guessing from HTML structure. `scripts/collect_courtlistener.py`'s
`territorial_manual_rows()` also runs a cheap **drift check** on every collection run — it
substring-matches each CSV row's surname against the court's own current page and prints a loud
warning if a name goes missing (or would flag one appearing that isn't in the CSV, if extended to
check the reverse) — so silent staleness between extraction passes is caught, even though the
extraction itself stays a documented, cited, human/LLM judgment call rather than a mechanical one.

## After running it

1. Save the returned CSV over `data/cache/territorial_judges_manual.csv`.
2. `python3 scripts/collect_courtlistener.py --no-net` (rebuilds judges.csv from the refreshed
   CSV plus the still-cached FJC/CFC/bulk-people data — no network needed for the courts that
   didn't change).
3. `python3 scripts/enrich_wikipedia.py` (net needed if any judge is new — the Wikidata bridge
   resolves photos/FedSoc/ACS by name for these courts; see its `wikidata_bridge()` docstring).
4. `python3 scripts/build_assets.py`, then `node tests/smoke.mjs` to confirm nothing regressed.
