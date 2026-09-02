#!/usr/bin/env python3
"""collect_courtlistener.py — Phase 2: build data/judges.csv for every sitting judge.

Sourcing strategy (see docs/DATA_SOURCES.md):
  * The Federal Judicial Center Biographical Directory (data/cache/fjc_judges.csv) is the
    AUTHORITATIVE spine for all life-tenured courts (13 circuits, 91 districts incl. PR + DC,
    and USCIT). CourtListener's own active/senior/chief flags proved unreliable (terminations
    missing — deceased judges still show date_termination=null; c-jud/ret-senior-jud empty), so
    status/dates/party/ABA/JD come from FJC's per-court appointment block. A judge is CURRENT at
    a court iff that block's Termination Date is empty; SENIOR iff Senior Status Date is set;
    CHIEF iff a "Service as Chief Judge" span is open (Begin set, End empty).
  * CourtListener's bulk people table (data/cache/cl_people.csv, not rate-limited — a static
    download, unlike its live API) supplies `cl_person_id` + `cl_profile_url`, joined by FJC
    `jid` == CL `fjc_id` (name fallback for misses).
  * uscfc (CFC, Art. I) and gud/nmid/vid (territorial, Art. IV) are NOT in the bulk FJC
    directory. CourtListener's LIVE API was tried as a roster source for all four and found
    unreliable for two of them (uscfc: missing 10 sitting judges, stale terminations for 13
    departed ones; vid: missed a May 2026 appointment entirely) — confirmed against the live
    API directly, not just a stale cache. uscfc now comes from `fjc_cfc_rows()` (FJC's separate,
    non-bulk "History of the Federal Judiciary" pages — see that function's docstring);
    gud/nmid/vid come from `territorial_manual_rows()` (a documented, cited CSV — no systematic
    source exists for these three). Neither path needs COURTLISTENER_TOKEN or hits CL's live
    API at all; as of 2026-07-16 nothing in this script does.

Resumable + cache-to-disk: every fetch is cached (data/cache/fjc_html/ for the new sources,
data/cache/cl/ historically). `data_verified` is always written false.

Usage:  python3 scripts/collect_courtlistener.py [--only ca8,moed,gud,uscfc] [--no-net]

WARNING: --only doesn't just LIMIT collection, it REPLACES judges.csv with ONLY the matching
courts' rows, discarding every other court's data (hit this directly 2026-07-16 testing the
territorial drift check). Use it for cache-population dry runs and inspect the diff before
trusting the result; always follow with a full (no --only) run before treating judges.csv as
current.
"""
from __future__ import annotations
import argparse
import csv
import json
import re
import sys
import time
import urllib.error
import urllib.request
from datetime import datetime
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DATA = ROOT / "data"
CACHE = DATA / "cache"
FJC_CSV = CACHE / "fjc_judges.csv"
CL_PEOPLE_CSV = CACHE / "cl_people.csv"   # CourtListener bulk people table (not rate-limited)
FJC_HTML_CACHE = CACHE / "fjc_html"
FJC_MANUAL_OVERRIDES = CACHE / "fjc_manual_overrides.csv"
CFC_PARSE_GAPS = FJC_HTML_CACHE / "cfc_parse_gaps.csv"
TERRITORIAL_MANUAL_CSV = CACHE / "territorial_judges_manual.csv"
# Roster page checked for the drift warning in territorial_manual_rows() - NOT parsed for
# data (each court's page layout differs too much to be worth a bespoke scraper for a combined
# 4 judgeships; see DATA_SOURCES.md 2026-07-16), just substring-checked so a name quietly
# disappearing (or a new one appearing) from the live page gets flagged instead of missed.
TERRITORIAL_DRIFT_URL = {
    "gud": "https://www.gud.uscourts.gov/judicial-officers",
    "nmid": "https://www.nmid.uscourts.gov/about-us",
    "vid": "https://www.vid.uscourts.gov/judges-info",
}
OUT = DATA / "judges.csv"
FJC_HTML_UA = "FederalCourtTracker/0.1 (data collection; https://github.com/; scapper@u.rochester.edu)"

FIXED_TERM_YEARS = {"gud": 10, "nmid": 10, "vid": 10}   # uscfc moved to fjc_cfc_rows() (§DATA_SOURCES 2026-07-16)

# Party of the appointing president — used only for CL-sourced fixed-term judges (FJC carries
# party directly for everyone else). Keyed by "First Last" as CL stores the president person.
PRESIDENT_PARTY = {
    "Harry Truman": "Democratic", "Dwight Eisenhower": "Republican",
    "John Kennedy": "Democratic", "Lyndon Johnson": "Democratic",
    "Richard Nixon": "Republican", "Gerald Ford": "Republican",
    "Jimmy Carter": "Democratic", "Ronald Reagan": "Republican",
    "George H.W. Bush": "Republican", "George Bush": "Republican",
    "Bill Clinton": "Democratic", "William Clinton": "Democratic",
    "William J. Clinton": "Democratic",
    "George W. Bush": "Republican", "Barack Obama": "Democratic",
    "Donald Trump": "Republican", "Donald J. Trump": "Republican",
    "Joe Biden": "Democratic", "Joseph Biden": "Democratic", "Joseph R. Biden": "Democratic",
}

JUDGE_COLS = [
    "cl_person_id", "full_name", "display_name", "court_id", "seat_id", "status",
    "is_chief", "appointing_president", "president_party", "nomination_date",
    "confirmation_date", "commission_date", "senior_date", "term_expiration_date",
    "jd_school", "jd_year", "aba_rating", "cl_profile_url", "photo_url", "photo_source",
    "photo_license", "fedsoc_reported", "fedsoc_basis", "fedsoc_source",
    "acs_reported", "acs_basis", "acs_source", "data_verified", "notes",
]


# ---- CFC (uscfc) roster + fields from FJC's non-bulk "History of the Federal Judiciary" ------
# FJC's bulk export (FJC_CSV, parsed below) is the "Biographical Directory of Article III
# Federal Judges" and structurally omits the Court of Federal Claims (Article I). But FJC
# separately maintains individual per-judge pages plus one roster-with-succession page for CFC
# under a different product (fjc.gov/history/courts/us-court-federal-claims-*) - verified
# 2026-07-16 to be plain-HTML, regex-parseable, and to carry the same nomination/confirmation/
# commission/education fields the bulk export has for Article III judges. This supersedes the
# CL-based fixed_term_rows() path for uscfc, whose live position data was found to be missing
# 10 sitting judges and stale for 13 departed ones (see DATA_SOURCES.md 2026-07-15/16).
#
# FJC's own "-present" marking means "still commissioned," not "currently hearing cases" (it
# includes senior judges no longer receiving case assignments). The court's OWN roster page
# (uscfc.uscourts.gov/judges) is the authoritative filter for which senior judges are current;
# resolved with the operator 2026-07-16. See CFC_ACTIVE_SENIOR_URL below.
CFC_LISTING_URL = "https://www.fjc.gov/history/courts/us-court-federal-claims-judges"
CFC_ACTIVE_SENIOR_URL = "https://www.uscfc.uscourts.gov/judges"
CFC_LISTING_RE = re.compile(
    # FJC's own slugs are inconsistently prefixed ("us-court-federal-claims-x" for newer
    # judges, "u.s.-court-federal-claims-x" for older ones) - verified against the live page.
    r'href="/history/(?:courts|judge)/(?:u\.s\.-|us-)?court-federal-claims-([a-z0-9.-]+)">'
    r'([^<]*)</a>\s*\(([^)]*)\)'
)
CFC_ROSTER_LINK_RE = re.compile(r'<a href="/([a-z0-9-]+)">([^<]*)</a>')
CFC_NOM_RE = re.compile(
    # The "vacated by X" clause can itself contain a period (a middle initial, e.g. "Edward J.
    # Damich"), so it's matched lazily up to ". Confirmed" as a whole - a [^.]+ class stops at
    # the FIRST period, landing mid-name instead of at the true end of the sentence.
    # "(?: for reappointment)?" handles a judge reappointed to a fresh term (e.g. Horn: 1986,
    # then "Nominated for reappointment ... 2003"); finditer + take the LAST match below, so a
    # reappointed judge's CURRENT term wins (same convention as this project's
    # fixed_term_senior carve-out for reappointments elsewhere).
    r"Nominated(?: for reappointment)? by (?P<pres>[^,]+?) on (?P<nom>[A-Z][a-z]+ \d{1,2}, \d{4})"
    r"(?:, to a seat vacated by .+?)?\.\s*"
    r"Confirmed by the Senate on (?P<conf>[A-Z][a-z]+ \d{1,2}, \d{4}),"
    r"\s*and commission issued on (?P<comm>[A-Z][a-z]+ \d{1,2}, \d{4})"
)
CFC_SENIOR_RE = re.compile(r"[Aa]ssumed senior status(?: again)? on ([A-Z][a-z]+ \d{1,2}, \d{4})")
CFC_CHIEF_RE = re.compile(r"[Ss]erved as chief judge,\s*(\d{4})-(\d{4}|present)")
CFC_EDU_LINE_RE = re.compile(r"^(.*?),\s*(?:J\.D\.|LL\.B\.),\s*(\d{4})")


def fjc_html_get(url: str, cache_key: str, allow_net: bool) -> str | None:
    """GET raw HTML with on-disk caching (mirrors cl_get's caching/backoff, but for fjc.gov /
    uscfc.uscourts.gov pages, which need no token)."""
    cache_file = FJC_HTML_CACHE / f"{cache_key}.html"
    if cache_file.exists():
        return cache_file.read_text(encoding="utf-8", errors="replace")
    if not allow_net:
        return None
    req = urllib.request.Request(url, headers={"User-Agent": FJC_HTML_UA})
    for attempt in range(5):
        try:
            with urllib.request.urlopen(req, timeout=30) as resp:
                html = resp.read().decode("utf-8", errors="replace")
            FJC_HTML_CACHE.mkdir(parents=True, exist_ok=True)
            cache_file.write_text(html, encoding="utf-8")
            time.sleep(0.3)
            return html
        except urllib.error.HTTPError as e:
            if e.code in (429, 503):
                time.sleep(min(30, 2 ** attempt * 3))
                continue
            raise
    raise RuntimeError(f"exhausted retries: {url}")


def _strip_tags(html: str) -> str:
    return re.sub(r"<[^>]+>", " ", html)


def _parse_month_date(s: str) -> str | None:
    try:
        return datetime.strptime(s.strip(), "%B %d, %Y").strftime("%Y-%m-%d")
    except ValueError:
        return None


def fjc_cfc_listing(allow_net: bool) -> list[dict]:
    """Every judge FJC has ever recorded for CFC (historical + current; '(YYYY-present)'
    marks still-commissioned, not necessarily still-hearing-cases - see fjc_cfc_active_senior)."""
    html = fjc_html_get(CFC_LISTING_URL, "cfc_listing", allow_net)
    if html is None:
        return []
    out = []
    for m in CFC_LISTING_RE.finditer(html):
        slug, label, years = m.groups()
        if not label.strip():
            continue
        parts = label.split(",", 1)
        out.append({
            "slug": slug, "last": parts[0].strip(),
            "first_mid": parts[1].strip() if len(parts) > 1 else "",
        })
    return out


def fjc_cfc_active_senior(allow_net: bool) -> tuple[dict, dict]:
    """(active, senior): {display_name: slug-hint-unused} for the two short lists on the
    court's own current-roster page. The heading and its <a> list sit in SEPARATE <p> tags
    (<p><strong>Senior Judges</strong></p><p class="rteindent1">...</p>), so a naive
    "heading ... next </p>" match finds nothing - the first </p> closes the heading's own
    empty paragraph. Split on the headings, then take each fragment's first rteindent1 block."""
    html = fjc_html_get(CFC_ACTIVE_SENIOR_URL, "cfc_current_roster", allow_net)
    if not html:
        return {}, {}
    parts = re.split(r"<strong>(Judges|Senior Judges)</strong>", html)
    sections = {}
    for i in range(1, len(parts), 2):
        label, following = parts[i], parts[i + 1] if i + 1 < len(parts) else ""
        m = re.search(r'<p class="rteindent1">(.*?)</p>', following, re.S)
        sections[label] = m.group(1) if m else ""
    active = {re.sub(r",.*", "", n).strip(): slug
              for slug, n in CFC_ROSTER_LINK_RE.findall(sections.get("Judges", ""))}
    senior = {re.sub(r",.*", "", n).strip(): slug
              for slug, n in CFC_ROSTER_LINK_RE.findall(sections.get("Senior Judges", ""))}
    return active, senior


def _jd_from_education_block(raw_html: str) -> tuple[str | None, str | None]:
    """Isolate <strong>Education:</strong>'s block and split on <br> BEFORE stripping tags, so
    each degree line is parsed independently. A single [^,]+ regex over the whole flattened
    prose is unsafe: consecutive entries are only <br>-separated, not comma-separated, so a
    lazy match can swallow the PRIOR entry's trailing year as a prefix of the next school name
    (caught by inspection: "1996 University of Maryland..." instead of just the school)."""
    m = re.search(r"<strong>Education:?\s*</strong>(.*?)(?:<strong>|</p>\s*<p><strong>|\Z)",
                   raw_html, re.S)
    if not m:
        return None, None
    for line in re.split(r"<br\s*/?>", m.group(1)):
        text = re.sub(r"\s+", " ", _strip_tags(line)).strip()
        lm = CFC_EDU_LINE_RE.match(text)
        if lm:
            return lm.group(1).strip(), lm.group(2)
    return None, None


def fjc_manual_overrides() -> dict:
    """Human/AI-verified per-field overrides for judges the automated parse can't resolve
    (CLAUDE.md: leave a field null and note it rather than guess - but before that, an
    interactive session should just fetch the missing piece by hand and record it here, so a
    later --no-net rebuild doesn't regress). Empty/absent file is normal - only populated when
    the regex parse actually leaves a gap. Keyed by FJC slug; any JUDGE_COLS-shaped field name
    is accepted and wins over the parsed value."""
    if not FJC_MANUAL_OVERRIDES.exists():
        return {}
    return {r["slug"]: r for r in csv.DictReader(FJC_MANUAL_OVERRIDES.open(encoding="utf-8"))}


def fjc_cfc_bio(slug: str, allow_net: bool) -> dict:
    """Parse one FJC judge page's single `field-content` prose block."""
    html, used_url = None, None
    for prefix in ("us-", "u.s.-"):
        url = f"https://www.fjc.gov/history/courts/{prefix}court-federal-claims-{slug}"
        html = fjc_html_get(url, f"cfc_bio_{prefix}{slug}", allow_net)
        if html:
            used_url = url
            break
    if not html:
        return {"_url": used_url}
    m = re.search(r'views-field-body[^"]*"[^>]*>\s*<div class="field-content">(.*?)</div>\s*</div>\s*</div>',
                  html, re.S)
    if not m:
        return {"_url": used_url}
    raw = m.group(1)
    text = re.sub(r"\s+", " ", _strip_tags(raw)).strip()
    out = {"_url": used_url}
    noms = list(CFC_NOM_RE.finditer(text))
    if noms:
        bm = noms[-1]                          # most recent appointment/reappointment = current term
        out["appointing_president"] = bm.group("pres").strip()
        out["nomination_date"] = _parse_month_date(bm.group("nom"))
        out["confirmation_date"] = _parse_month_date(bm.group("conf"))
        out["commission_date"] = _parse_month_date(bm.group("comm"))
    seniors = CFC_SENIOR_RE.findall(text)
    if seniors:
        out["senior_date"] = _parse_month_date(seniors[-1])
    out["is_chief"] = any(end == "present" for _, end in CFC_CHIEF_RE.findall(text))
    jd_school, jd_year = _jd_from_education_block(raw)
    if jd_school:
        out["jd_school"], out["jd_year"] = jd_school, jd_year
    return out


def fjc_cfc_rows(allow_net: bool) -> list[dict]:
    """Current CFC roster (active + active-senior only), fully sourced from FJC + the court's
    own site - see the module docstring above this section."""
    listing = fjc_cfc_listing(allow_net)
    if not listing:
        print("  [cfc] WARNING: no FJC listing data (net disabled and nothing cached?)",
              file=sys.stderr)
        return []
    listing_by_last: dict[str, list[dict]] = {}
    for e in listing:
        listing_by_last.setdefault(e["last"].lower(), []).append(e)
    active, senior = fjc_cfc_active_senior(allow_net)
    if not active and not senior:
        print("  [cfc] WARNING: could not read the active/senior roster from "
              f"{CFC_ACTIVE_SENIOR_URL} - falling back would silently mis-scope who's current; "
              "fix the page/regex or fetch this list by hand", file=sys.stderr)
        return []
    overrides = fjc_manual_overrides()
    gaps: list[dict] = []
    rows = []
    for name_map, status in ((active, "active"), (senior, "senior")):
        for full_name in sorted(name_map):
            last, first = full_name.split()[-1].lower(), full_name.split()[0].lower()
            cands = listing_by_last.get(last, [])
            if len(cands) > 1:
                cands = [c for c in cands if c["first_mid"].lower().startswith(first)] or cands
            if not cands:
                gaps.append({"judge": full_name, "field": "slug", "reason": "no FJC listing match"})
                print(f"  [cfc] WARNING: {full_name!r} is on the official roster but not found "
                      f"in the FJC listing by name - MANUAL LOOKUP NEEDED", file=sys.stderr)
                continue
            slug = cands[0]["slug"]
            bio = dict(fjc_cfc_bio(slug, allow_net))
            ov = overrides.get(slug, {})
            for k, v in ov.items():
                if v:
                    bio[k] = v
            for field in ("appointing_president", "commission_date", "jd_school"):
                if not bio.get(field):
                    gaps.append({"judge": full_name, "field": field, "reason": "regex parse miss"})
                    print(f"  [cfc] WARNING: {field} missing for {full_name!r} ({slug}) after "
                          f"parse + overrides - MANUAL LOOKUP NEEDED", file=sys.stderr)
            clean_name = re.sub(r",\s*Chief Judge\s*$", "", full_name).strip()
            pres = bio.get("appointing_president")
            comm = bio.get("commission_date")
            rows.append({
                "jid": None, "court_id": "uscfc", "cl_id": None, "slug": None,
                "full_name": clean_name, "last": clean_name.split()[-1], "first": clean_name.split()[0],
                "status": status, "is_chief": bool(bio.get("is_chief")),
                "appointing_president": pres, "president_party": PRESIDENT_PARTY.get(pres),
                "nomination_date": bio.get("nomination_date"),
                "confirmation_date": bio.get("confirmation_date"),
                "commission_date": comm,
                "senior_date": bio.get("senior_date") if status == "senior" else None,
                "term_expiration_date": f"{int(comm[:4]) + 15}{comm[4:]}" if comm else None,
                "jd_school": bio.get("jd_school"), "jd_year": bio.get("jd_year"),
                "aba_rating": None, "seat_id": None, "source": "fjc_html",
                "notes_extra": f"FJC: {bio.get('_url') or slug}.",
            })
    if gaps:
        CFC_PARSE_GAPS.parent.mkdir(parents=True, exist_ok=True)
        with CFC_PARSE_GAPS.open("w", newline="", encoding="utf-8") as f:
            w = csv.DictWriter(f, fieldnames=["judge", "field", "reason"])
            w.writeheader()
            w.writerows(gaps)
        print(f"  [cfc] {len(gaps)} unresolved field(s) logged to {CFC_PARSE_GAPS.relative_to(ROOT)}",
              file=sys.stderr)
    return rows


# ---- Territorial courts (gud/nmid/vid): documented manual CSV, not a scraper -----------------
# No FJC equivalent exists for these three courts (checked directly 2026-07-16 - no
# listing/succession page, no bulk product), and each court's own site has a different,
# inconsistent small-page layout not worth a bespoke parser for a combined 4 judgeships. This is
# the documented "necessary fallback": data/cache/territorial_judges_manual.csv, every row cited
# and dated, read here instead of CL (whose roster also turned out unreliable for vid - it
# entirely missed a May 2026 appointment). Their own CL positions ARE still queried, just only to
# feed the drift check below, not as the source of truth.
def territorial_manual_rows(court_id: str, allow_net: bool) -> list[dict]:
    if not TERRITORIAL_MANUAL_CSV.exists():
        print(f"  [territorial] WARNING: {TERRITORIAL_MANUAL_CSV.relative_to(ROOT)} missing - "
              f"{court_id} will have NO judges. See DATA_SOURCES.md for how to populate it.",
              file=sys.stderr)
        return []
    rows = []
    for r in csv.DictReader(TERRITORIAL_MANUAL_CSV.open(encoding="utf-8")):
        if r["court_id"] != court_id:
            continue
        if not r.get("source_url") or not r.get("verified_date"):
            print(f"  [territorial] WARNING: {r['full_name']!r} ({court_id}) has no "
                  f"source_url/verified_date - refusing to use an uncited row", file=sys.stderr)
            continue
        rows.append({
            "jid": None, "court_id": court_id, "cl_id": None, "slug": None,
            "full_name": r["full_name"], "last": r["last"], "first": r["first"],
            "status": r["status"], "is_chief": r["is_chief"].strip().lower() == "true",
            "appointing_president": r["appointing_president"] or None,
            "president_party": r["president_party"] or None,
            "nomination_date": r["nomination_date"] or None,
            "confirmation_date": r["confirmation_date"] or None,
            "commission_date": r["commission_date"] or None,
            "senior_date": r["senior_date"] or None,
            "term_expiration_date": r["term_expiration_date"] or None,
            "jd_school": r["jd_school"] or None, "jd_year": r["jd_year"] or None,
            "aba_rating": None, "seat_id": None, "source": "territorial_manual",
            "notes_extra": f"Verified {r['verified_date']} against {r['source_url']}. {r['notes']}",
        })
    _territorial_drift_check(court_id, [r["full_name"] for r in rows], allow_net)
    return rows


def _territorial_drift_check(court_id: str, known_names: list[str], allow_net: bool):
    """Cheap insurance, not a parser: confirm every manually-recorded name still appears
    (as a bare substring) on the court's own current-roster page, and flag it loudly if not -
    the exact situation that would have caught Rikhye's confirmation faster."""
    url = TERRITORIAL_DRIFT_URL.get(court_id)
    if not url:
        return
    html = fjc_html_get(url, f"drift_{court_id}", allow_net)
    if html is None:
        print(f"  [territorial] drift check skipped for {court_id} (no net/cache for {url})",
              file=sys.stderr)
        return
    for name in known_names:
        last = name.split()[-1]
        if last not in html:
            print(f"  [territorial] DRIFT WARNING: {name!r} not found on {url} - "
                  f"{TERRITORIAL_MANUAL_CSV.name} may be stale, re-verify", file=sys.stderr)


# ---- FJC parsing --------------------------------------------------------------
# First-professional law degrees only, matched as whole comma-separated tokens (not substrings)
# so e.g. "B.L.S." (Bachelor of Library Science) never matches "B.L." (an older name for LL.B.
# used at some schools, e.g. UVA) - a naive "in" substring check would conflate the two.
# "B.C.L." (Bachelor of Civil Law) is William & Mary's historical name for the same first
# professional degree (caught via Buckwalter, paed, whose jd_school/jd_year were wrongly blank).
_JD_DEGREE_TOKENS = {"JD", "LLB", "BCL", "BL"}


def fjc_law_degree(row: dict):
    for d in range(1, 6):
        deg = row.get(f"Degree ({d})", "") or ""
        tokens = {re.sub(r"[^A-Za-z]", "", t).upper() for t in deg.split(",")}
        if tokens & _JD_DEGREE_TOKENS:
            return row.get(f"School ({d})", "") or None, row.get(f"Degree Year ({d})", "") or None
    return None, None


def load_cl_people_map():
    """From the CL bulk people table, return (by_fjc, by_name):
       by_fjc:  fjc_id(str) -> (cl_id, slug, has_photo)
       by_name: (last.lower, first.lower) -> (cl_id, slug, has_photo)  [unique names only]
    Many CL people have a null fjc_id, so the name index is a fallback join for FJC judges
    whose jid isn't present under fjc_id."""
    by_fjc, name_hits = {}, {}
    if not CL_PEOPLE_CSV.exists():
        return by_fjc, {}
    with CL_PEOPLE_CSV.open(encoding="utf-8", errors="replace") as f:
        for r in csv.DictReader(f):
            if (r.get("is_alias_of_id") or "").strip():
                continue
            rec = (r["id"], r.get("slug") or None,
                   str(r.get("has_photo", "")).lower() in ("t", "true", "1"))
            fjc = (r.get("fjc_id") or "").strip()
            if fjc:
                by_fjc[fjc] = rec
            key = ((r.get("name_last") or "").strip().lower(), (r.get("name_first") or "").strip().lower())
            if key != ("", ""):
                name_hits.setdefault(key, []).append(rec)
    by_name = {k: v[0] for k, v in name_hits.items() if len(v) == 1}  # unambiguous only
    return by_fjc, by_name


def fjc_jid_index() -> dict:
    """(full_name, commission_date) -> jid, across EVERY commission block in the FJC bulk CSV
    (a person keeps one `jid` for their whole career - a district judge elevated to a circuit
    seat gets a new "Court Name (2)" block in the SAME row, same jid). This is the stable,
    reappointment-proof person key the write loop below needs: matching carried-forward fields
    on (full_name, court_id) alone breaks the moment a judge's court_id changes, since that's
    exactly what an elevation does. Mirrors enrich_wikipedia.py's fjc_nid_index() (same idea,
    different FJC id column - that one join key is for Wikidata's P12000, this one is FJC's own)."""
    idx = {}
    with FJC_CSV.open(encoding="utf-8", errors="replace") as f:
        for r in csv.DictReader(f):
            full = " ".join(x for x in [r["First Name"], r["Middle Name"], r["Last Name"],
                                        r["Suffix"]] if x.strip())
            for n in range(1, 7):
                cd = r.get(f"Commission Date ({n})", "").strip()
                if cd:
                    idx[(full, cd)] = r["jid"]
    return idx


def fjc_current_rows(courts: dict) -> list[dict]:
    """One record per (FJC judge, current appointment block) matching a life-tenured court."""
    rows = []
    with FJC_CSV.open(encoding="utf-8", errors="replace") as f:
        for r in csv.DictReader(f):
            for n in range(1, 7):
                cn = r.get(f"Court Name ({n})", "")
                if cn not in courts:
                    continue
                if r.get(f"Termination Date ({n})", "").strip():
                    continue  # left this court
                s = f" ({n})"
                if not r.get(f"Commission Date{s}", "").strip():
                    continue  # confirmed but not yet commissioned → not a sitting judge
                jd_school, jd_year = fjc_law_degree(r)
                chief = False
                for k in ("Service as Chief Judge, Begin", "2nd Service as Chief Judge, Begin"):
                    kb = r.get(f"{k}{s}", "").strip()
                    ke = r.get(f"{k.replace('Begin','End')}{s}", "").strip()
                    if kb and not ke:
                        chief = True
                # SCOTUS: the Chief Justice is a distinct APPOINTMENT (title), not a chief-judge
                # service span like the lower courts record.
                if "Chief Justice" in (r.get(f"Appointment Title{s}", "") or ""):
                    chief = True
                full = " ".join(x for x in [r["First Name"], r["Middle Name"], r["Last Name"],
                                            r["Suffix"]] if x.strip())
                rows.append({
                    "jid": r["jid"], "court_id": courts[cn][0],
                    "full_name": full, "last": r["Last Name"], "first": r["First Name"],
                    "status": "senior" if r.get(f"Senior Status Date{s}", "").strip() else "active",
                    "is_chief": chief,
                    "appointing_president": r.get(f"Appointing President{s}", "").strip() or None,
                    "president_party": r.get(f"Party of Appointing President{s}", "").strip() or None,
                    "nomination_date": r.get(f"Nomination Date{s}", "").strip() or None,
                    "confirmation_date": r.get(f"Confirmation Date{s}", "").strip() or None,
                    "commission_date": r.get(f"Commission Date{s}", "").strip() or None,
                    "senior_date": r.get(f"Senior Status Date{s}", "").strip() or None,
                    "term_expiration_date": None,
                    "jd_school": jd_school, "jd_year": jd_year,
                    "aba_rating": r.get(f"ABA Rating{s}", "").strip() or None,
                    "seat_id": r.get(f"Seat ID{s}", "").strip() or None,
                    "source": "fjc",
                })
    return rows


# ---- assembly -----------------------------------------------------------------
def disambiguate(rows: list[dict]):
    from collections import defaultdict
    by_court = defaultdict(list)
    for r in rows:
        by_court[r["court_id"]].append(r)
    for group in by_court.values():
        dup = {}
        for r in group:
            dup.setdefault(r["last"], []).append(r)
        for last, rs in dup.items():
            for r in rs:
                r["display_name"] = f"{(r['first'] or ' ')[0]}. {last}" if len(rs) > 1 else last


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--only", default="", help="comma-separated court_ids to limit collection")
    ap.add_argument("--no-net", action="store_true", help="use cache only; no API calls")
    args = ap.parse_args()
    only = set(x.strip() for x in args.only.split(",") if x.strip())
    allow_net = not args.no_net

    courts_by_name, court_meta = {}, {}
    for r in csv.DictReader(open(DATA / "courts.csv")):
        court_meta[r["court_id"]] = r
        courts_by_name[r["court_name"]] = (r["court_id"], r["tenure_type"])
    # FJC uses a longer name for the D.C. Circuit than our short courts.csv name.
    courts_by_name["U.S. Court of Appeals for the District of Columbia Circuit"] = ("cadc", "life_tenured")
    keep = lambda cid: (not only) or (cid in only)

    # 1) FJC spine (life-tenured courts, incl. SCOTUS since 2026-07-18).
    # SCOTUS carve-out: FJC records a RETIRED justice (Breyer, Kennedy) as senior-dated with
    # no termination — s/he remains an Article III judge under 28 U.S.C. §371 but does not sit
    # on the Court. The sitting bench is exactly the rows with no Senior Status Date.
    fjc_rows = [r for r in fjc_current_rows(courts_by_name)
                if keep(r["court_id"]) and not (r["court_id"] == "scotus" and r["status"] == "senior")]
    print(f"[fjc] {len(fjc_rows)} current judges across life-tenured courts")

    # 2) Territorial fixed-term courts: documented manual CSV (CL's own roster proved
    # unreliable here too - see territorial_manual_rows() docstring / DATA_SOURCES.md).
    ft_rows = []
    for cid in FIXED_TERM_YEARS:
        if keep(cid):
            r = territorial_manual_rows(cid, allow_net)
            print(f"[territorial] {cid}: {len(r)} current (fixed-term)")
            ft_rows += r

    # 2b) uscfc: FJC's own "History of the Federal Judiciary" pages, not CL (see the
    # fjc_cfc_rows() docstring - CL's roster for this court is missing 10 sitting judges).
    if keep("uscfc"):
        cfc_rows = fjc_cfc_rows(allow_net)
        print(f"[fjc-html] uscfc: {len(cfc_rows)} current (active + active-senior)")
        ft_rows += cfc_rows

    # 3) Attach cl_person_id + slug via the CL bulk PEOPLE table (join by jid == CL fjc_id for
    #    the FJC spine; ft_rows - uscfc + territorial - have no jid, so they join by name only,
    #    same fallback the FJC spine already uses for its own misses). Bulk data is not
    #    rate-limited, unlike the live API. Covering ft_rows here was missed when uscfc/gud/nmid/
    #    vid moved off fixed_term_rows() (2026-07-16) - that function used to do its own
    #    per-judge people?fjc_id lookup inline; the replacement rosters need the same bulk join
    #    applied explicitly, or cl_person_id/cl_profile_url silently go blank for all of them.
    by_fjc, by_name = load_cl_people_map()
    print(f"[bulk] {len(by_fjc)} CL people by fjc_id, {len(by_name)} by unique name")
    misses = 0
    for r in fjc_rows + ft_rows:
        hit = by_fjc.get(str(r["jid"])) or by_name.get((r["last"].strip().lower(), r["first"].strip().lower()))
        if not hit:
            misses += 1
        r["cl_id"], r["slug"], r["has_photo"] = (hit or (None, None, None))
    print(f"[join] cl_person_id attached; {misses}/{len(fjc_rows) + len(ft_rows)} judges without a CL match")

    rows = fjc_rows + ft_rows
    disambiguate(rows)

    # This script owns only the FJC/CL-sourced fields below. photo_url/photo_source/
    # photo_license/fedsoc_*/acs_*/data_verified belong to enrich_wikipedia.py and a human
    # verification pass, respectively - NOT this script, which never even attempts to collect
    # them. A bare rewrite used to hardcode those to blank/false every run, silently destroying
    # enrichment + verification work unless enrich_wikipedia.py happened to run again
    # immediately after (a real incident, caught 2026-08-25 - see PROGRESS.md session (ay)).
    # Fix: load whatever's already on disk and carry those fields forward for judges that
    # already existed; only a genuinely NEW row gets fresh (blank/false) defaults.
    #
    # Matched by FJC jid FIRST, falling back to (full_name, court_id) only when no jid is
    # resolvable (uscfc/territorial rows, which sit outside the FJC bulk directory and have no
    # jid at all). A (full_name, court_id)-only match breaks the moment a judge's court_id
    # changes - exactly what a reappointment/elevation does - so it would silently stop carrying
    # forward a judge's photo/notes/etc. the first time they moved courts (caught 2026-08-27,
    # prompted by the operator asking whether the parallel manual_photos.json registry in
    # enrich_wikipedia.py had the same gap - it did, fixed there too).
    existing: dict[tuple[str, str], dict] = {}
    existing_by_jid: dict[str, dict] = {}
    if OUT.exists():
        jid_idx = fjc_jid_index()
        with OUT.open(encoding="utf-8") as f:
            for er in csv.DictReader(f):
                existing[(er["full_name"], er["court_id"])] = er
                jid = jid_idx.get((er["full_name"], er["commission_date"]))
                if jid:
                    existing_by_jid[jid] = er

    # `notes` is trickier: its auto-generated source-description prefix SHOULD stay fresh (it
    # reflects live source data - e.g. a territorial judge's holdover facts), but a person or an
    # LLM session may have appended free-text findings onto it (as happened 2026-08-25) that no
    # other file can regenerate. Split those apart with an explicit marker so the auto part can
    # be regenerated while the human part rides along unchanged.
    MANUAL_NOTE_MARK = " [[note]] "

    def w(v):
        return "" if v is None else v

    n = 0
    with OUT.open("w", newline="", encoding="utf-8") as f:
        wr = csv.DictWriter(f, fieldnames=JUDGE_COLS)
        wr.writeheader()
        for r in sorted(rows, key=lambda x: (x["court_id"], x.get("commission_date") or "")):
            slug = r.get("slug")
            cid = r.get("cl_id")
            profile = f"https://www.courtlistener.com/person/{cid}/{slug}/" if cid and slug else ""
            note = {
                "fjc": "Phase-2 sweep; FJC + CourtListener.",
                "fjc_html": "Systematic FJC scrape (2026-07-16+; see DATA_SOURCES.md) - "
                            "fjc.gov's per-judge 'History of the Federal Judiciary' pages, "
                            "not the Article-III-only bulk export.",
                "territorial_manual": "Documented manual pull (2026-07-16+; see "
                                       "DATA_SOURCES.md and territorial_judges_manual.csv) - "
                                       "no systematic FJC/CL source exists for this court.",
            }.get(r["source"], "Phase-2 sweep; CourtListener (FJC omits this court).")
            if r.get("notes_extra"):
                note += " " + r["notes_extra"]

            old = (existing_by_jid.get(str(r["jid"])) if r.get("jid") else None) \
                or existing.get((r["full_name"], r["court_id"]))
            if old:
                old_notes = old.get("notes") or ""
                if MANUAL_NOTE_MARK in old_notes:
                    note += old_notes[old_notes.index(MANUAL_NOTE_MARK):]
                photo_url, photo_source, photo_license = (
                    old.get("photo_url", ""), old.get("photo_source", ""), old.get("photo_license", ""))
                fedsoc_reported = old.get("fedsoc_reported") or "false"
                fedsoc_basis, fedsoc_source = old.get("fedsoc_basis", ""), old.get("fedsoc_source", "")
                acs_reported = old.get("acs_reported") or "false"
                acs_basis, acs_source = old.get("acs_basis", ""), old.get("acs_source", "")
                data_verified = old.get("data_verified") or "false"
            else:
                photo_url = photo_source = photo_license = ""
                fedsoc_reported = acs_reported = "false"
                fedsoc_basis = fedsoc_source = acs_basis = acs_source = ""
                data_verified = "false"

            wr.writerow({
                "cl_person_id": w(cid), "full_name": r["full_name"], "display_name": r["display_name"],
                "court_id": r["court_id"], "seat_id": w(r.get("seat_id")), "status": r["status"],
                "is_chief": str(r["is_chief"]).lower(), "appointing_president": w(r["appointing_president"]),
                "president_party": w(r["president_party"]), "nomination_date": w(r["nomination_date"]),
                "confirmation_date": w(r["confirmation_date"]), "commission_date": w(r["commission_date"]),
                "senior_date": w(r["senior_date"]), "term_expiration_date": w(r["term_expiration_date"]),
                "jd_school": w(r["jd_school"]), "jd_year": w(r["jd_year"]), "aba_rating": w(r["aba_rating"]),
                "cl_profile_url": profile,
                "photo_url": photo_url, "photo_source": photo_source, "photo_license": photo_license,
                "fedsoc_reported": fedsoc_reported, "fedsoc_basis": fedsoc_basis, "fedsoc_source": fedsoc_source,
                "acs_reported": acs_reported, "acs_basis": acs_basis, "acs_source": acs_source,
                "data_verified": data_verified, "notes": note,
            })
            n += 1
    print(f"[write] {n} judges → {OUT.relative_to(ROOT)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
