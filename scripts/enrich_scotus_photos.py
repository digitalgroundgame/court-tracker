#!/usr/bin/env python3
"""enrich_scotus_photos.py — licensed photos for FORMER Supreme Court justices in
data/appointments.csv (the beeswarm draws SCOTUS appointments with pictures; the sitting
nine are already filled from judges.csv by collect_appointments.py).

Same systematic path and licensing rules as enrich_wikipedia.py, whose helpers this
imports: FJC jid == Wikidata P12000 -> item -> P18 image -> Commons imageinfo, written
ONLY when the license is machine-readably free (pd/cc0/cc-by[-sa], with the required
credit folded into photo_license for CC-BY). Unclear terms -> no photo (CLAUDE.md §2).

Run order: collect_appointments.py -> THIS -> build_assets.py.
Usage: python3 scripts/enrich_scotus_photos.py [--no-net]
"""
from __future__ import annotations
import argparse
import csv
import sys
import urllib.parse
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "scripts"))
import enrich_wikipedia as ew  # noqa: E402

APPTS = ROOT / "data" / "appointments.csv"


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--no-net", action="store_true")
    args = ap.parse_args()
    allow_net = not args.no_net

    rows = list(csv.DictReader(APPTS.open(encoding="utf-8")))
    cols = list(csv.reader(APPTS.open(encoding="utf-8")))[0]
    todo = [r for r in rows if r["court_id"] == "scotus" and not r["photo_url"]]
    # A justice can appear twice (Rehnquist assoc + chief) — resolve each person once.
    by_jid: dict[str, list[dict]] = {}
    for r in todo:
        by_jid.setdefault(r["fjc_jid"], []).append(r)
    print(f"[scotus-photos] {len(todo)} rows / {len(by_jid)} former justices need a photo")

    # appointments.csv carries FJC jid; the Wikidata bridge is keyed by FJC nid (P12000).
    jid_to_nid = {}
    with (ROOT / "data" / "cache" / "fjc_judges.csv").open(encoding="utf-8", errors="replace") as f:
        for r in csv.DictReader(f):
            jid_to_nid[r["jid"]] = r["nid"]
    wd = ew.wikidata_index(allow_net)
    hits = {jid: wd.get(jid_to_nid.get(jid, "")) for jid in by_jid}
    files = sorted({h["file"] for h in hits.values() if h and h.get("file")})
    info = ew.fetch_imageinfo(files, allow_net, prefix="img")

    n = 0
    for jid, rs in by_jid.items():
        h = hits.get(jid)
        ii = info.get(h["file"]) if h and h.get("file") else None
        if not (ii and ii["thumb"]):
            print(f"  - {rs[0]['full_name']}: no Wikidata image ({'no item' if not h else 'no P18/imageinfo'})")
            continue
        if not ii["free"]:
            print(f"  - {rs[0]['full_name']}: license not machine-readably free ({ii['license']}) — skipped")
            continue
        lic = ii["license"] or "unknown"
        if ii["attribution"] and ii["artist"]:
            lic += f" — credit: {ii['artist'][:120]}"
        src = ii["page"] or f"https://commons.wikimedia.org/wiki/{urllib.parse.quote(h['file'])}"
        for r in rs:
            r["photo_url"], r["photo_source"], r["photo_license"] = ii["thumb"], src, lic
            n += 1
        print(f"  + {rs[0]['full_name']}: {lic.split(' — ')[0]}")

    with APPTS.open("w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=cols)
        w.writeheader()
        w.writerows(rows)
    print(f"[write] {n} rows updated → {APPTS.relative_to(ROOT)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
