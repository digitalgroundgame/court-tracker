#!/usr/bin/env python3
"""collect_president_photos.py — sourced (never fabricated) portrait photo for each president
in embed/presidencies.js, for the beeswarm's presidency-band label icon (the map widget's
"Change" streamgraph, an earlier consumer of this same data, was removed in issue #67 — see
archive/change-view/).

Same sourcing discipline as enrich_wikipedia.py: looks up each president's Wikipedia lead
image via the MediaWiki `pageimages` API, resolves it on Commons for a machine-readable
license via `imageinfo`, and writes NOTHING for a president whose lead image isn't clearly
freely licensed (CLAUDE.md §2 — no photo_url without a photo_license, ever). Official
presidential portraits are near-universally US-government works (public domain), so this is
expected to succeed for all of them, but the check is real, not assumed.

Every network response is cached under data/cache/wiki/ (shared with enrich_wikipedia.py's
cache), so `--no-net` re-runs offline.

Usage:
    python3 scripts/collect_president_photos.py
    python3 scripts/collect_president_photos.py --no-net
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
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DATA = ROOT / "data"
CACHE = DATA / "cache" / "wiki"
OUT_CSV = DATA / "president_photos.csv"

WIKI_API = "https://en.wikipedia.org/w/api.php"
COMMONS_API = "https://commons.wikimedia.org/w/api.php"
sys.path.insert(0, str(ROOT / "scripts"))
from _useragent import user_agent  # noqa: E402

UA = user_agent()
SLEEP = 0.2

FREE_LICENSE = re.compile(r"^(pd|cc0|cc-by)", re.I)
NONFREE_HINT = re.compile(r"fair\s*use|non[- ]?free|all rights reserved|copyright", re.I)

# embed/presidencies.js's exact `name` string -> the Wikipedia article to pull a lead image
# from. Distinct people only (Trump's two terms share one photo/article).
PRESIDENT_WIKI_TITLE = {
    "Richard M. Nixon": "Richard Nixon",
    "Gerald Ford": "Gerald Ford",
    "Jimmy Carter": "Jimmy Carter",
    "Ronald Reagan": "Ronald Reagan",
    "George H.W. Bush": "George H. W. Bush",
    "William J. Clinton": "Bill Clinton",
    "George W. Bush": "George W. Bush",
    "Barack Obama": "Barack Obama",
    "Donald J. Trump": "Donald Trump",
    "Joseph R. Biden": "Joe Biden",
}


def _fetch(url: str) -> bytes:
    last = None
    for attempt in range(5):
        try:
            req = urllib.request.Request(url, headers={"User-Agent": UA, "Accept": "application/json"})
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
    cf = CACHE / f"{cache_key}.json"
    if cf.exists():
        return json.loads(cf.read_text(encoding="utf-8"))
    if not allow_net:
        return {}
    params.update(format="json", formatversion="2")
    url = f"{base}?{urllib.parse.urlencode(params)}"
    data = json.loads(_fetch(url))
    CACHE.mkdir(parents=True, exist_ok=True)
    cf.write_text(json.dumps(data), encoding="utf-8")
    return data


def _strip_html(s: str) -> str:
    return re.sub(r"\s+", " ", html.unescape(re.sub(r"<[^>]+>", "", s or ""))).strip()


def lead_image_title(page_title: str, allow_net: bool) -> str | None:
    key = "presphoto_name_" + hashlib.sha1(page_title.encode()).hexdigest()[:12]
    d = api(WIKI_API, key, allow_net, action="query", titles=page_title,
            prop="pageimages", piprop="name")
    pages = d.get("query", {}).get("pages", [])
    if not pages or "pageimage" not in pages[0]:
        return None
    return f"File:{pages[0]['pageimage']}"


def imageinfo(file_title: str, allow_net: bool) -> dict | None:
    key = "presphoto_info_" + hashlib.sha1(file_title.encode()).hexdigest()[:12]
    d = api(COMMONS_API, key, allow_net, action="query", titles=file_title, prop="imageinfo",
            iiprop="extmetadata|url", iiurlwidth="320",
            iiextmetadatafilter="LicenseShortName|License|UsageTerms|Artist|AttributionRequired")
    pages = d.get("query", {}).get("pages", [])
    if not pages or "imageinfo" not in pages[0]:
        return None
    ii = pages[0]["imageinfo"][0]
    em = ii.get("extmetadata", {})
    code = (em.get("License", {}).get("value") or "").strip()
    short = _strip_html(em.get("LicenseShortName", {}).get("value") or "")
    terms = _strip_html(em.get("UsageTerms", {}).get("value") or "")
    free = bool(FREE_LICENSE.match(code)) or (
        not code and bool(re.match(r"^(public domain|cc0|cc by)", short, re.I))
    )
    if free and NONFREE_HINT.search(terms) and not re.match(r"^(public domain|cc)", short, re.I):
        free = False
    if not free:
        return None
    lic = short or terms or "unknown"
    attribution = (em.get("AttributionRequired", {}).get("value") or "").lower() == "true"
    artist = _strip_html(em.get("Artist", {}).get("value") or "")
    if attribution and artist:
        lic += f" — credit: {artist[:120]}"
    return {"thumb": ii.get("thumburl") or ii.get("url"), "page": ii.get("descriptionurl"), "license": lic}


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--no-net", action="store_true")
    args = ap.parse_args()
    allow_net = not args.no_net

    rows = []
    for name, title in PRESIDENT_WIKI_TITLE.items():
        file_title = lead_image_title(title, allow_net)
        info = imageinfo(file_title, allow_net) if file_title else None
        if info:
            rows.append({
                "president_name": name, "wikipedia_title": title,
                "photo_url": info["thumb"], "photo_source": info["page"] or "",
                "photo_license": info["license"],
            })
            print(f"  {name}: OK ({info['license'][:40]})")
        else:
            print(f"  {name}: no freely-licensed lead image found — left out (never fabricated)",
                  file=sys.stderr)

    with OUT_CSV.open("w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=["president_name", "wikipedia_title", "photo_url",
                                          "photo_source", "photo_license"])
        w.writeheader()
        w.writerows(rows)
    print(f"[collect_president_photos] {len(rows)}/{len(PRESIDENT_WIKI_TITLE)} presidents -> {OUT_CSV.relative_to(ROOT)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
