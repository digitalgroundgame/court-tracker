#!/usr/bin/env python3
"""Enrich data/judges.csv with judge photos and reported FedSoc/ACS affiliation.

Sources (see docs/DATA_SOURCES.md):
  * Wikidata (SPARQL) — joined to our judges by the FJC identifier, NOT by name:
    P12000 "Biographical Directory of Federal Judges numeric ID" == FJC `nid`
    (recovered from data/cache/fjc_judges.csv via the same (full_name, commission_date)
    key the collector used). P18 gives the depicted image; the enwiki sitelink gives
    the article.
  * Wikimedia Commons — imageinfo/extmetadata for the license. A photo is only written
    when the license is machine-readably free (public domain / CC0 / CC BY / CC BY-SA).
    Anything else (or unknown) leaves photo_url null → the widget's initials avatar.
  * English Wikipedia — article wikitext, scanned for "Federalist Society" /
    "American Constitution Society". A claim is only recorded when the context both
    (a) matches a basis pattern that ties *this person* to the org, and (b) is free of
    negation/criticism cues. Otherwise it is skipped and logged for a human.

Nothing here asserts an affiliation as fact: the widget renders these hedged and
attributed ("Reported to have…"), every claim carries a source URL and a basis, and
every row stays data_verified=false until a human checks it.

Every network response is cached under data/cache/wiki/, so `--no-net` re-runs offline
and interrupted runs resume. Re-running is idempotent: enrichment columns are recomputed
from cache, not appended to.

Usage:
    python3 scripts/enrich_wikipedia.py              # fetch (cached) + write judges.csv
    python3 scripts/enrich_wikipedia.py --no-net     # rebuild from cache only
    python3 scripts/enrich_wikipedia.py --photos-only
    python3 scripts/enrich_wikipedia.py --dry-run    # report, don't write
"""
from __future__ import annotations

import argparse
import csv
import hashlib
import html
import json
import re
import sys
import time
import unicodedata
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "data"
CACHE = DATA / "cache" / "wiki"
FJC_CSV = DATA / "cache" / "fjc_judges.csv"
JUDGES_CSV = DATA / "judges.csv"

# Registry of judges whose photo fields were hand-curated by a research pass this script cannot
# reproduce (e.g. a Senate Judiciary Committee hearing still found via subagent search) - never
# overwritten by this script, regardless of Wikidata-link status. A sidecar file rather than a
# marker baked into `photo_license`/`photo_source` deliberately: both of those fields are
# rendered raw to end users (court-tracker.js splits photo_license on " — credit: " and shows it
# verbatim; photo_source is used as a literal <a href>), so a marker prefix there would either
# show as garbage text or break the link - see the writer loop in main() for the full incident
# writeup (2026-08-25/27).
#
# Each entry: {"full_name", "court_id" (informational only - NOT the match key, see below),
# "nid" (FJC's stable per-PERSON id, or null), "date_added"}. Matched primarily by `nid`, not
# (full_name, court_id): a judge's court_id changes the moment they're reappointed/elevated (a
# district judge moving to a circuit seat, say), which would silently stop protecting their photo
# if court_id were part of the match key - found 2026-08-27 when the operator asked whether this
# registry (added earlier that day) could survive a reappointment. `nid` is FJC's own per-person
# id and is stable across a judge's whole recorded career (one FJC bulk-CSV row can list multiple
# court appointments under the same nid) - see fjc_nid_index(). Falls back to (full_name,
# court_id) only for the rare judge with no resolvable nid (outside the FJC bulk directory
# entirely, e.g. uscfc/territorial - not reappointment-proof for those, but nothing better exists
# without a bigger schema change, and none of the current entries are in that situation anyway.
MANUAL_PHOTOS_FILE = DATA / "cache" / "manual_photos.json"


def load_manual_photo_registry() -> tuple[set[str], set[tuple[str, str]]]:
    """Returns (nids, pairs): nids is every registered entry's `nid` (excluding null); pairs is
    the (full_name, court_id) fallback for entries with no nid."""
    if not MANUAL_PHOTOS_FILE.exists():
        return set(), set()
    entries = json.loads(MANUAL_PHOTOS_FILE.read_text(encoding="utf-8"))
    nids = {e["nid"] for e in entries if e.get("nid")}
    pairs = {(e["full_name"], e["court_id"]) for e in entries if not e.get("nid")}
    return nids, pairs

WD_SPARQL = "https://query.wikidata.org/sparql"
COMMONS_API = "https://commons.wikimedia.org/w/api.php"
ENWIKI_API = "https://en.wikipedia.org/w/api.php"
UA = "FederalCourtTracker/0.1 (https://github.com/; 47438924+EmilyCapper@users.noreply.github.com)"

THUMB_WIDTH = 320
SLEEP = 0.2  # polite delay between API calls

# ---- affiliation model --------------------------------------------------------
ORGS = {
    "fedsoc": {
        "terms": ["Federalist Society"],
        "hosts": ("fedsoc.org", "fed-soc.org"),
    },
    "acs": {
        "terms": ["American Constitution Society"],
        "hosts": ("acslaw.org", "americanconstitutionsociety.org"),
    },
}

# Ordered: first match wins. Applied to the SENTENCE CONTAINING THE ORG NAME — never to a
# loose context window, or an unrelated "advisory board" nearby silently retags a plain
# membership. Each pattern names an actual relationship; bare nouns like "conference" are
# deliberately absent, since "spoke at a Federalist Society conference" must be attributable
# to *this* judge (see _subject_is_judge) rather than to anyone the article happens to mention.
BASIS_PATTERNS = [
    ("chapter_leader", r"\bchapter\b[^.]{0,60}\b(?:president|chair(?:man|woman)?|leader|founder|head)\b"
                       r"|\b(?:president|chair(?:man|woman)?|founder|head)\b[^.]{0,60}\bchapter\b"),
    ("advisor",        r"\bboards? of (?:directors|advisors|advisers)\b|\badvisory (?:board|council)s?\b"
                       r"|\b(?:advisor|adviser|board member|serves? on the board|chair of the board)\b"),
    ("member",         r"\b(?:member(?:ship)?\s+(?:of|in)\b|\bis a member\b|\bwas a member\b|"
                       r"\bbeen a member\b|\blong[- ]time member\b|\bjoined\b|\bbelongs to\b)"),
    ("speaker",        r"\b(?:spoke at|speaker|delivered a (?:speech|keynote|address|remarks)|"
                       r"gave a (?:speech|talk|keynote)|panelist|invited guest|keynote|"
                       r"addressed a|appeared at|participated in|debated)\b"),
    ("contributor",    r"\b(?:contributor|contributed|authored|wrote for|listed as an expert|expert for)\b"),
]

# If any of these sit in the sentence, refuse to record a claim and log it for a human.
NEGATION_CUES = [
    r"\bnot a member\b", r"\bnever\s+(?:a\s+)?member\b", r"\bdenied\b", r"\bdeclined\b",
    r"\bdisput(?:ed|es)\b", r"\bcritic(?:al|ized|ised|ism)\b", r"\bopposed\b", r"\boppos(?:ition|ing)\b",
    r"\battacked\b", r"\bresigned from\b", r"\bunlike\b", r"\brather than\b", r"\bdespite\b",
    r"\bwas not\b", r"\bis not\b", r"\bno (?:known )?(?:ties|affiliation|connection)\b",
]

# A judge's article routinely discusses relatives who share the surname — Guido Calabresi's
# article calls his SON a co-founder of the Federalist Society. A surname match is therefore
# not enough; if the sentence is in the orbit of a relative, we skip and let a human read it.
RELATIVE_CUES = re.compile(
    r"\b(?:son|daughter|father|mother|brother|sister|husband|wife|spouse|parents?|"
    r"nephew|niece|cousin|uncle|aunt|grandfather|grandmother|sibling)\b", re.I)

# Paths on an org's own site that identify a *person*. A link to /commentary/… is a
# citation the article happens to use, and says nothing about the judge.
ORG_PROFILE_PATH = re.compile(r"/(?:contributor|contributors|experts?|bio|people|staff|author)s?/")

WINDOW = 320  # chars of wikitext context on each side of a term hit

FREE_LICENSE = re.compile(r"^(pd|cc0|cc-by)", re.I)
NONFREE_HINT = re.compile(r"fair\s*use|non[- ]?free|all rights reserved|copyright", re.I)


# ---- http ---------------------------------------------------------------------
def _fetch(url: str, accept: str = "application/json") -> bytes:
    last = None
    for attempt in range(5):
        try:
            req = urllib.request.Request(url, headers={"User-Agent": UA, "Accept": accept})
            with urllib.request.urlopen(req, timeout=120) as r:
                time.sleep(SLEEP)
                return r.read()
        except urllib.error.HTTPError as e:
            last = e
            if e.code in (429, 503, 502, 504):
                wait = int(e.headers.get("Retry-After") or (2 ** attempt) * 5)
                print(f"    [{e.code}] backing off {wait}s", file=sys.stderr)
                time.sleep(min(wait, 120))
                continue
            raise
        except (urllib.error.URLError, TimeoutError) as e:
            last = e
            time.sleep((2 ** attempt) * 2)
    raise RuntimeError(f"giving up on {url[:120]}: {last}")


def api(base: str, cache_key: str, allow_net: bool, **params) -> dict:
    """Cached MediaWiki API GET. cache_key must be unique per request."""
    cf = CACHE / f"{cache_key}.json"
    if cf.exists():
        return json.loads(cf.read_text(encoding="utf-8"))
    if not allow_net:
        return {}
    params.update(format="json", formatversion="2")
    url = base + "?" + urllib.parse.urlencode(params)
    d = json.loads(_fetch(url))
    cf.write_text(json.dumps(d), encoding="utf-8")
    return d


# ---- step 1: Wikidata spine ---------------------------------------------------
SPARQL = """
SELECT ?item ?fjcNid ?fjcAlpha ?image ?article WHERE {
  { ?item wdt:P12000 ?fjcNid . } UNION { ?item wdt:P2736 ?fjcAlpha . }
  OPTIONAL { ?item wdt:P12000 ?fjcNid . }
  OPTIONAL { ?item wdt:P2736 ?fjcAlpha . }
  OPTIONAL { ?item wdt:P18 ?image . }
  OPTIONAL { ?article schema:about ?item ; schema:isPartOf <https://en.wikipedia.org/> . }
}
"""


def wikidata_index(allow_net: bool) -> dict:
    """FJC nid -> {qid, commons_file, article_title}."""
    cf = CACHE / "wd_fjc.json"
    if cf.exists():
        rows = json.loads(cf.read_text(encoding="utf-8"))
    elif not allow_net:
        print("!! no cached Wikidata result and --no-net given", file=sys.stderr)
        return {}
    else:
        url = WD_SPARQL + "?" + urllib.parse.urlencode({"query": SPARQL, "format": "json"})
        rows = json.loads(_fetch(url, "application/sparql-results+json"))["results"]["bindings"]
        cf.write_text(json.dumps(rows), encoding="utf-8")
        print(f"  Wikidata: {len(rows)} FJC-linked items cached")

    idx = {}
    for r in rows:
        nid = r.get("fjcNid", {}).get("value")
        if not nid:
            continue
        img = r.get("image", {}).get("value")
        art = r.get("article", {}).get("value")
        idx[nid] = {
            "qid": r["item"]["value"].rsplit("/", 1)[-1],
            # Special:FilePath/<urlencoded name> -> the Commons file title
            "file": ("File:" + urllib.parse.unquote(img.rsplit("/", 1)[-1]).replace("_", " ")) if img else None,
            "title": urllib.parse.unquote(art.rsplit("/", 1)[-1]).replace("_", " ") if art else None,
        }
    return idx


BRIDGE_COURTS = {"uscfc", "gud", "nmid", "vid"}  # outside the FJC bulk directory - see
                                                  # scripts/collect_courtlistener.py's docstring


def _wd_api_get(url: str, cache_key: str, allow_net: bool):
    """Cached GET against Wikidata's own API (search + entity fetch), separate from the
    query.wikidata.org SPARQL endpoint wikidata_index() uses. Rate-limit-aware: plain
    wbsearchentities calls hit 429s at low volume (observed 2026-07-16), unlike the single
    bulk SPARQL query."""
    cf = CACHE / f"{cache_key}.json"
    if cf.exists():
        return json.loads(cf.read_text(encoding="utf-8"))
    if not allow_net:
        return None
    for attempt in range(6):
        try:
            d = json.loads(_fetch(url))
            cf.write_text(json.dumps(d), encoding="utf-8")
            return d
        except urllib.error.HTTPError as e:
            if e.code == 429:
                time.sleep(3 * (attempt + 1))
                continue
            raise
    return None


def wikidata_bridge(full_name: str, allow_net: bool, strict_p12000: bool) -> dict | None:
    """Resolve a judge's Wikidata item by NAME instead of FJC nid, for the 4 courts outside the
    FJC bulk directory (uscfc/gud/nmid/vid - BRIDGE_COURTS). Tried against all 21 current uscfc
    judges + the 3 territorial judges checked 2026-07-16: a bare "First Last" search sometimes
    finds an item "First M. Last" misses and vice versa, so both forms are tried.

    Accepts a hit only if unambiguous (exactly one label match) AND either the item carries
    P12000 (uscfc - proof it's linked to a real FJC biographical record, confirmed present for
    21/21 current CFC judges despite FJC's bulk export excluding this court) or, when P12000 can
    never apply (the territorial courts, which FJC doesn't cover at all - 0/3 tested had it),
    the search result's own description contains "judge" as a corroborating signal. Returns the
    same {qid, file, title} shape wikidata_index() produces, so callers use it identically."""
    parts = full_name.split()
    variants = [full_name]
    if len(parts) > 2:
        variants.append(f"{parts[0]} {parts[-1]}")   # "First Last", dropping middle name(s)
    tried = set()
    for variant in variants:
        if variant in tried:
            continue
        tried.add(variant)
        url = "https://www.wikidata.org/w/api.php?" + urllib.parse.urlencode({
            "action": "wbsearchentities", "search": variant, "language": "en",
            "format": "json", "type": "item", "limit": 5})
        key = "wdsearch_" + re.sub(r"[^a-z0-9]+", "-", variant.lower()).strip("-")
        d = _wd_api_get(url, key, allow_net)
        hits = (d or {}).get("search", [])
        if len(hits) != 1:
            continue
        qid = hits[0]["id"]
        ent_d = _wd_api_get(f"https://www.wikidata.org/wiki/Special:EntityData/{qid}.json",
                             f"wdentity_{qid}", allow_net)
        ent = (ent_d or {}).get("entities", {}).get(qid)
        if not ent:
            continue
        has_p12000 = bool(ent.get("claims", {}).get("P12000"))
        desc_ok = "judge" in (hits[0].get("description") or "").lower()
        if not (has_p12000 or (not strict_p12000 and desc_ok)):
            continue
        p18 = ent.get("claims", {}).get("P18")
        img = p18[0]["mainsnak"]["datavalue"]["value"] if p18 else None
        return {
            "qid": qid,
            "file": f"File:{img}" if img else None,
            "title": ent.get("sitelinks", {}).get("enwiki", {}).get("title"),
        }
    return None


def fjc_nid_index() -> dict:
    """(full_name, commission_date) -> {nid, first, last}, built exactly as
    collect_courtlistener.py builds full_name, so the join is reproducible, not fuzzy."""
    idx = {}
    if not FJC_CSV.exists():
        print(f"!! missing {FJC_CSV} — run collect_courtlistener.py first", file=sys.stderr)
        return idx
    with FJC_CSV.open(encoding="utf-8", errors="replace") as f:
        for r in csv.DictReader(f):
            full = " ".join(x for x in [r["First Name"], r["Middle Name"], r["Last Name"],
                                        r["Suffix"]] if x.strip())
            for n in range(1, 7):
                cd = r.get(f"Commission Date ({n})", "").strip()
                if cd:
                    idx[(full, cd)] = {"nid": r["nid"], "first": r["First Name"].strip(),
                                       "last": r["Last Name"].strip()}
    return idx


SUFFIXES = re.compile(r"[,\s]+(?:Jr\.?|Sr\.?|I{2,3}|IV)\s*$", re.I)


def scotus_nid_index() -> dict:
    """(first, last) -> nid for the CURRENTLY SERVING justices only.

    The court-name filter is what makes this unambiguous: the FJC directory holds three
    Jacksons and two Robertses, and only the sitting one has no Termination Date.
    """
    idx = {}
    if not FJC_CSV.exists():
        return idx
    with FJC_CSV.open(encoding="utf-8", errors="replace") as f:
        for r in csv.DictReader(f):
            for n in range(1, 7):
                if r.get(f"Court Name ({n})") != "Supreme Court of the United States":
                    continue
                if r.get(f"Termination Date ({n})", "").strip():
                    continue
                idx[(_fold(r["First Name"]).strip().lower(),
                     _fold(r["Last Name"]).strip().lower())] = r["nid"]
    return idx


def justice_key(name: str) -> tuple:
    """"John G. Roberts, Jr." -> ("john", "roberts")  (FJC stores "John Glover Roberts Jr.",
    so the middle name is never comparable; first + last + sitting-only is enough)."""
    parts = _fold(SUFFIXES.sub("", name).replace(",", "")).split()
    return (parts[0].lower(), parts[-1].lower()) if len(parts) >= 2 else ("", "")


def enrich_justices(wd: dict, allow_net: bool, dry_run: bool) -> int:
    """Circuit Justices render as an icon in the circuit pane too, so they need the same
    licensed-photo treatment. Their CSV gains the same photo_* columns as judges.csv."""
    path = DATA / "circuit_justices.csv"
    rows = list(csv.DictReader(path.open(encoding="utf-8")))
    fields = list(csv.reader(path.open(encoding="utf-8")))[0]
    for c in ("photo_url", "photo_source", "photo_license"):
        if c not in fields:
            fields.insert(fields.index("source_url"), c)

    sc = scotus_nid_index()
    files, per_row = {}, {}
    for r in rows:
        nid = sc.get(justice_key(r["justice_name"]))
        hit = wd.get(nid) if nid else None
        if hit and hit["file"]:
            per_row[id(r)] = hit["file"]
            files[hit["file"]] = True
    info = fetch_imageinfo(list(files), allow_net, prefix="img_justice") if files else {}

    n = 0
    for r in rows:
        for c in ("photo_url", "photo_source", "photo_license"):
            r[c] = ""
        ii = info.get(per_row.get(id(r)))
        if ii and ii["thumb"] and ii["free"]:
            lic = ii["license"] or "unknown"
            if ii["attribution"] and ii["artist"]:
                lic += f" — credit: {ii['artist'][:120]}"
            r["photo_url"], r["photo_source"], r["photo_license"] = ii["thumb"], ii["page"] or "", lic
            n += 1
    if not dry_run:
        with path.open("w", newline="", encoding="utf-8") as f:
            w = csv.DictWriter(f, fieldnames=fields)
            w.writeheader()
            w.writerows(rows)
    print(f"  circuit justices with a licensed photo: {n}/{len(rows)}")
    return n


# ---- step 2: photos -----------------------------------------------------------
def _strip_html(s: str) -> str:
    return re.sub(r"\s+", " ", html.unescape(re.sub(r"<[^>]+>", "", s or ""))).strip()


def _batch_key(prefix: str, batch: list[str]) -> str:
    """Cache key for a batched API call. MUST be content-derived, not positional
    (f"{prefix}_{i//50:04d}") - a purely positional key silently serves a STALE cached response
    for the wrong file/title set whenever the input list's composition changes (adding/removing
    items shifts every later batch's window). Caught 2026-07-16: adding 22 bridged judges'
    Commons files shifted alphabetical batch boundaries, and the positional cache returned an
    old batch's data at the same index - most bridged judges silently got no photo, not because
    Commons lacked one, but because the cache never even asked Commons about their file."""
    h = hashlib.sha1("|".join(batch).encode("utf-8")).hexdigest()[:12]
    return f"{prefix}_{h}"


def fetch_imageinfo(files: list[str], allow_net: bool, prefix: str = "img") -> dict:
    """Commons file title -> {thumb, page, license, artist, free}."""
    out = {}
    files = sorted(set(files))
    for i in range(0, len(files), 50):
        batch = files[i:i + 50]
        d = api(COMMONS_API, _batch_key(prefix, batch), allow_net,
                action="query", titles="|".join(batch), prop="imageinfo",
                iiprop="extmetadata|url", iiurlwidth=str(THUMB_WIDTH),
                iiextmetadatafilter="LicenseShortName|License|UsageTerms|Artist|AttributionRequired")
        for p in d.get("query", {}).get("pages", []):
            ii = (p.get("imageinfo") or [{}])[0]
            em = ii.get("extmetadata", {})
            code = (em.get("License", {}).get("value") or "").strip()
            short = _strip_html(em.get("LicenseShortName", {}).get("value") or "")
            terms = _strip_html(em.get("UsageTerms", {}).get("value") or "")
            free = bool(FREE_LICENSE.match(code)) or (
                not code and bool(re.match(r"^(public domain|cc0|cc by)", short, re.I))
            )
            if free and NONFREE_HINT.search(terms) and not re.match(r"^(public domain|cc)", short, re.I):
                free = False
            out[p["title"]] = {
                "thumb": ii.get("thumburl") or ii.get("url"),
                "page": ii.get("descriptionurl"),
                "license": short or terms or None,
                "artist": _strip_html(em.get("Artist", {}).get("value") or "") or None,
                "attribution": (em.get("AttributionRequired", {}).get("value") or "").lower() == "true",
                "free": free,
                "code": code or None,
            }
        print(f"  photos: license metadata {min(i + 50, len(files))}/{len(files)}", end="\r")
    print()
    return out


def wikipedia_pageimage_fallback(titles: list[str], allow_net: bool) -> dict[str, str]:
    """For judges whose Wikidata item has an enwiki article but no P18 image: ask Wikipedia's
    own `pageimages` API for the article's lead/infobox image directly. Wikidata's P18 isn't
    always kept in sync with what's actually in the infobox - checked empirically (2026-08-25):
    of 263 judges with a matched article but no P18, 21 (~8%) turned out to have a real lead
    image this way. Restricted to Commons-hosted originals only (source URL under
    /wikipedia/commons/) - a `/wikipedia/en/` original is a local enwiki upload, which is
    almost always non-free fair-use and must never be treated as licensed (CLAUDE.md §2); such
    files are simply skipped here; the same imageinfo/license check downstream applies to
    whatever this returns, so nothing here decides a photo is free - it only decides what to
    check."""
    out: dict[str, str] = {}
    titles = sorted(set(titles))
    for i in range(0, len(titles), 50):
        batch = titles[i:i + 50]
        d = api(ENWIKI_API, _batch_key("pageimg", batch), allow_net,
                action="query", prop="pageimages", piprop="original|name", titles="|".join(batch))
        for p in d.get("query", {}).get("pages", []):
            src = (p.get("original") or {}).get("source") or ""
            name = p.get("pageimage")
            if name and "/wikipedia/commons/" in src:
                out[p["title"]] = "File:" + name.replace("_", " ")
        print(f"  pageimage fallback {min(i + 50, len(titles))}/{len(titles)}", end="\r")
    if titles:
        print()
    return out


# ---- step 3: affiliations -----------------------------------------------------
def _classify(sentence: str) -> str | None:
    low = sentence.lower()
    for cue in NEGATION_CUES:
        if re.search(cue, low):
            return None
    for basis, pat in BASIS_PATTERNS:
        if re.search(pat, low):
            return basis
    return None


def _fold(s: str) -> str:
    """Accent-fold so FJC's "Martinez-Olguin" matches Wikipedia's "Martínez-Olguín"."""
    return "".join(c for c in unicodedata.normalize("NFKD", s) if not unicodedata.combining(c))


def _subject_is_judge(sentence: str, first: str, last: str, term_at: int) -> bool:
    """Is this sentence about the judge, or about someone else the article mentions?

    Accept a surname mention, or a pronoun standing in for the judge. The pronoun must
    appear BEFORE the org name: "Since 2010, he has been a member of the Federalist
    Society" is about him, while "…Ho delivered a speech at a Federalist Society
    conference and said he would…" is not. Reject when the surname belongs to a different
    first name — Guido Calabresi's article calls Steven Calabresi a FedSoc co-founder.
    """
    s = _fold(sentence)
    if RELATIVE_CUES.search(s):
        return False
    lastf = _fold(last)
    if lastf and re.search(rf"\b{re.escape(lastf)}\b", s):
        for m in re.finditer(rf"\b([A-Z][a-z]+)\.?\s+(?:[A-Z]\.?\s+)?{re.escape(lastf)}\b", s):
            other = m.group(1)
            if first and other.lower() != _fold(first).lower() and other not in ("Judge", "Justice", "The"):
                return False
        return True
    m = re.search(r"\b(?:He|She|They|His|Her|Their)\b", s)
    return bool(m and m.start() < term_at)


def _nearest_url(window: str, hit_end: int, hosts: tuple) -> str | None:
    """A citation follows the claim it supports, so prefer the org's own URL in the
    window, else the first URL after the mention."""
    urls = [(m.start(), m.group(0).rstrip(".,;|}]")) for m in re.finditer(r"https?://[^\s\|\}\]<]+", window)]
    for _, u in urls:
        if any(h in u.lower() for h in hosts):
            return u
    for pos, u in urls:
        if pos >= hit_end:
            return u
    return None


def _plain(wikitext: str) -> str:
    """Wikitext → readable prose, keeping link labels and dropping refs/templates."""
    # self-closing <ref name=x/> MUST be stripped first: matched by the paired alternative,
    # its `.*?</ref>` runs on to the next real </ref> and eats the prose in between.
    t = re.sub(r"<ref[^>]*/>|<ref[^>]*>.*?</ref>", "", wikitext, flags=re.S)
    for _ in range(3):  # templates nest
        t = re.sub(r"\{\{[^{}]*\}\}", "", t)
    t = re.sub(r"\[\[(?:[^\]|]*\|)?([^\]]*)\]\]", r"\1", t)
    t = re.sub(r"\[https?://\S+\s+([^\]]*)\]", r"\1", t)
    t = re.sub(r"'{2,}|<[^>]+>", "", t)
    return re.sub(r"[ \t]+", " ", t)


def _sentence_with(text: str, term: str, at: int) -> str | None:
    """The sentence containing the mention at `at`, or None. Sentence boundary = a period
    followed by whitespace + a capital, so "U.S. Court of Appeals" doesn't split."""
    starts = [0] + [m.end() for m in re.finditer(r"(?<=[.!?])\s+(?=[A-Z])|\n{2,}|==+[^=]+==+", text)]
    ends = [m.start() for m in re.finditer(r"(?<=[.!?])\s+(?=[A-Z])|\n{2,}|==+[^=]+==+", text)] + [len(text)]
    for s, e in zip(starts, ends):
        if s <= at < e:
            sent = re.sub(r"\s+", " ", text[s:e]).strip()
            return sent if term in sent else None
    return None


def scan_articles(titles: list[str], allow_net: bool) -> dict:
    """article title -> {revid, permalink, hits: {org: [hit, …]}}

    Raw hits only — classification needs the judge's name, so it happens per judge in
    classify_hits(). Wikitext batches stay cached, so the rules can be re-tuned offline.
    """
    out = {}
    titles = sorted(set(t for t in titles if t))
    for i in range(0, len(titles), 50):
        batch = titles[i:i + 50]
        d = api(ENWIKI_API, _batch_key("wt", batch), allow_net,
                action="query", titles="|".join(batch), prop="revisions",
                rvprop="ids|content", rvslots="main")
        for p in d.get("query", {}).get("pages", []):
            rv = (p.get("revisions") or [{}])[0]
            wt = rv.get("slots", {}).get("main", {}).get("content")
            if not wt:
                continue
            revid = rv.get("revid")
            rec = {
                "revid": revid,
                "permalink": "https://en.wikipedia.org/w/index.php?" + urllib.parse.urlencode(
                    {"title": p["title"].replace(" ", "_"), "oldid": revid}),
                "hits": {},
            }
            plain = _plain(wt)
            for org, cfg in ORGS.items():
                hits = []
                for term in cfg["terms"]:
                    # prose mentions, judged on their own sentence
                    for m in re.finditer(re.escape(term), plain):
                        sent = _sentence_with(plain, term, m.start())
                        if sent and not any(h["sentence"] == sent for h in hits):
                            hits.append({"kind": "prose", "sentence": sent,
                                         "term_at": sent.find(term),
                                         "url": _nearest_url(plain[max(0, m.start() - WINDOW): m.end() + WINDOW],
                                                             min(m.start(), WINDOW) + len(term), cfg["hosts"])})
                    # the org's own site listing the judge (external links / refs). Only a
                    # person-profile path counts: a citation to some fedsoc.org commentary
                    # page is evidence about an article, not about this judge.
                    for m in re.finditer(r"https?://[^\s\|\}\]<]+", wt):
                        u = m.group(0).rstrip(".,;|}]")
                        low = u.lower()
                        if any(h in low for h in cfg["hosts"]) and ORG_PROFILE_PATH.search(low):
                            hits.append({"kind": "org_link", "sentence": None, "url": u})
                rec["hits"][org] = hits
            out[p["title"]] = rec
        print(f"  affiliations: articles {min(i + 50, len(titles))}/{len(titles)}", end="\r")
    print()
    return out


def classify_hits(hits: list[dict], first: str, last: str, permalink: str):
    """→ (claim|None, [rejected evidence, …]). Prose the judge is the subject of wins;
    an org-hosted profile is a listing, which is weaker but still attributable."""
    rejected = []
    for h in (x for x in hits if x["kind"] == "prose"):
        sent = h["sentence"]
        if not _subject_is_judge(sent, first, last, h.get("term_at", 0)):
            rejected.append(sent[:300])
            continue
        basis = _classify(sent)
        if not basis:
            rejected.append(sent[:300])
            continue
        return {"basis": basis, "source": h["url"] or permalink, "evidence": sent[:300]}, rejected
    for h in (x for x in hits if x["kind"] == "org_link"):
        u = h["url"]
        basis = "contributor" if "/contributor" in u.lower() else "listed"
        return {"basis": basis, "source": u,
                "evidence": f"listed on the organization's own site: {u}"}, rejected
    return None, rejected


# ---- main ---------------------------------------------------------------------
def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--no-net", action="store_true", help="rebuild from cache only")
    ap.add_argument("--photos-only", action="store_true")
    ap.add_argument("--dry-run", action="store_true")
    args = ap.parse_args()
    allow_net = not args.no_net
    CACHE.mkdir(parents=True, exist_ok=True)

    judges = list(csv.DictReader(JUDGES_CSV.open(encoding="utf-8")))
    fieldnames = list(csv.reader(JUDGES_CSV.open(encoding="utf-8")))[0]
    print(f"judges.csv: {len(judges)} rows")

    print("1/4 Wikidata spine (join on FJC id)…")
    wd = wikidata_index(allow_net)
    nid_of = fjc_nid_index()
    linked = {}
    for j in judges:
        fjc = nid_of.get((j["full_name"], j["commission_date"]))
        hit = wd.get(fjc["nid"]) if fjc else None
        if hit:
            linked[id(j)] = dict(hit, first=fjc["first"], last=fjc["last"])
    print(f"  matched {len(linked)}/{len(judges)} judges to a Wikidata item")

    print("1b/4 Wikidata bridge (name search) for courts outside the FJC directory…")
    bridged = 0
    for j in judges:
        if id(j) in linked or j["court_id"] not in BRIDGE_COURTS:
            continue
        hit = wikidata_bridge(j["full_name"], allow_net, strict_p12000=(j["court_id"] == "uscfc"))
        if hit:
            parts = j["full_name"].split()
            linked[id(j)] = dict(hit, first=parts[0], last=parts[-1])
            bridged += 1
    print(f"  bridged {bridged} more judges by name (uscfc/gud/nmid/vid)")

    print("1c/4 Wikidata bridge (name search) for judges with no FJC-nid Wikidata link…")
    # Same mechanism as 1b, generalized: a real, sourced gap (not staleness) found 2026-08-27 -
    # many 2023-2026 appointees have a normal Wikidata item + enwiki article, just no P12000
    # (FJC ID) property set yet (that linkage lags well behind the article/infobox itself), so
    # they never enter `linked` via the nid join and are invisible to every step above. Confirmed
    # via subagent research finding real Commons/Wikidata photos for several such judges that a
    # full cache refresh (re-running step 1 from scratch) could NOT recover, precisely because
    # the join key these judges are missing has nothing to do with what's cached. Uses
    # strict_p12000=False like the territorial bridge above (P12000 is exactly what's missing
    # here too) - safety instead comes from wikidata_bridge()'s own bar: exactly one unambiguous
    # name-search hit AND "judge" in that hit's own Wikidata description.
    name_bridged = 0
    for j in judges:
        if id(j) in linked:
            continue
        hit = wikidata_bridge(j["full_name"], allow_net, strict_p12000=False)
        if hit:
            parts = j["full_name"].split()
            linked[id(j)] = dict(hit, first=parts[0], last=parts[-1])
            name_bridged += 1
    print(f"  bridged {name_bridged} more judges by name (no-P12000 fallback)")

    print("1d/4 Wikipedia pageimage fallback (Wikidata P18 missing, but an article exists)…")
    no_file_titles = [h["title"] for h in linked.values() if not h["file"] and h["title"]]
    pageimg = wikipedia_pageimage_fallback(no_file_titles, allow_net) if no_file_titles else {}
    filled = 0
    for h in linked.values():
        if not h["file"] and h["title"] in pageimg:
            h["file"] = pageimg[h["title"]]
            filled += 1
    print(f"  filled {filled}/{len(no_file_titles)} via the article's own lead image")

    print("2/4 Commons license metadata…")
    files = [h["file"] for h in linked.values() if h["file"]]
    info = fetch_imageinfo(files, allow_net) if files else {}

    aff = {}
    if not args.photos_only:
        print("3/4 English Wikipedia article scan…")
        aff = scan_articles([h["title"] for h in linked.values()], allow_net)
    else:
        print("3/4 skipped (--photos-only)")

    print("4/4 writing enrichment…")
    manual_nids, manual_pairs = load_manual_photo_registry()
    audit = []
    n_photo = n_unfree = n_fs = n_acs = n_rej = 0
    n_manual_skipped = 0
    for j in judges:
        hit = linked.get(id(j))
        # A judge in the manual registry was hand-curated by a research
        # pass this script cannot reproduce (e.g. a Senate Judiciary Committee hearing still, a
        # direct Commons search hit, or a different judge's own re-crop) - never touch their
        # photo fields, full stop, regardless of Wikidata-link status. This is INDEPENDENT of
        # fedsoc/acs recompute, which still runs normally off `hit` when one exists - a manually
        # curated photo says nothing about whether this judge's affiliation data is current.
        # Discovered the hard way (2026-08-27, two separate near-misses in one afternoon): first,
        # blanking unconditionally erased 27 manually-added photos for judges with no Wikidata
        # linkage at all (no FJC-nid match, so `hit` was falsy - safe to leave alone on its own).
        # But 3 of those 27 DO have a Wikidata item matched via FJC-nid, just one whose own P18/
        # pageimages lookup can't find the specific photo a human/subagent search located - for
        # those, `hit` is truthy, so a falsy-hit-only guard still wiped them. The marker is the
        # only reliable signal, since it doesn't depend on guessing why the automated path missed
        # a given photo.
        fjc = nid_of.get((j["full_name"], j["commission_date"]))
        manual_photo = (bool(fjc) and fjc["nid"] in manual_nids) or \
            ((j["full_name"], j["court_id"]) in manual_pairs)
        if manual_photo:
            n_manual_skipped += 1
        if hit:
            # Recompute from cache every run -> idempotent, for judges this script actually has
            # a Wikidata-based opinion about.
            if not manual_photo:
                for k in ("photo_url", "photo_source", "photo_license"):
                    j[k] = ""
            if not args.photos_only:
                for org in ("fedsoc", "acs"):
                    j[f"{org}_reported"] = "false"
                    j[f"{org}_basis"] = ""
                    j[f"{org}_source"] = ""
        if not hit:
            continue

        ii = info.get(hit["file"]) if hit["file"] else None
        if ii and ii["thumb"] and not manual_photo:
            if ii["free"]:
                lic = ii["license"] or "unknown"
                if ii["attribution"] and ii["artist"]:
                    lic += f" — credit: {ii['artist'][:120]}"
                j["photo_url"] = ii["thumb"]
                j["photo_source"] = ii["page"] or f"https://commons.wikimedia.org/wiki/{urllib.parse.quote(hit['file'])}"
                j["photo_license"] = lic
                n_photo += 1
            else:
                # unclear/non-free terms → no image, initials fallback (CLAUDE.md §2)
                n_unfree += 1
                audit.append({"judge": j["full_name"], "court": j["court_id"], "kind": "photo_rejected",
                              "basis": ii["code"] or "", "source": ii["page"] or "",
                              "evidence": f"license not machine-readably free: {ii['license']}"})

        rec = aff.get(hit["title"]) if hit["title"] else None
        if not rec:
            continue
        for org in ("fedsoc", "acs"):
            claim, rejected = classify_hits(rec["hits"].get(org, []), hit["first"], hit["last"],
                                            rec["permalink"])
            if claim:
                j[f"{org}_reported"] = "true"
                j[f"{org}_basis"] = claim["basis"]
                j[f"{org}_source"] = claim["source"]
                n_fs += org == "fedsoc"
                n_acs += org == "acs"
                audit.append({"judge": j["full_name"], "court": j["court_id"], "kind": f"{org}_reported",
                              "basis": claim["basis"], "source": claim["source"],
                              "evidence": claim["evidence"]})
            for ev in rejected:
                n_rej += 1
                audit.append({"judge": j["full_name"], "court": j["court_id"],
                              "kind": f"{org}_mention_not_claimed", "basis": "",
                              "source": rec["permalink"], "evidence": ev})

    print(f"  photos written      : {n_photo}")
    print(f"  manual photos kept  : {n_manual_skipped} (in {MANUAL_PHOTOS_FILE.name}, never overwritten)")
    print(f"  photos rejected     : {n_unfree} (license unclear/non-free → initials fallback)")
    print(f"  fedsoc_reported     : {n_fs}")
    print(f"  acs_reported        : {n_acs}")
    print(f"  mentions skipped    : {n_rej} (no basis pattern / negation cue → logged, not claimed)")

    if args.dry_run:
        print("(--dry-run: nothing written)")
        return 0

    with JUDGES_CSV.open("w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=fieldnames)
        w.writeheader()
        w.writerows(judges)
    print(f"  wrote {JUDGES_CSV}")

    print("5/5 circuit justices…")
    enrich_justices(wd, allow_net, args.dry_run)

    audit_path = CACHE / "affiliation_audit.csv"
    with audit_path.open("w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=["judge", "court", "kind", "basis", "source", "evidence"])
        w.writeheader()
        w.writerows(audit)
    print(f"  wrote {audit_path} ({len(audit)} rows for human verification)")
    print("\nNext: python3 scripts/build_assets.py")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
