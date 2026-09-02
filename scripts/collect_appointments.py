#!/usr/bin/env python3
"""collect_appointments.py — historical appointment events since Nixon, for the future
"appointments through presidential terms" beeswarm (operator ask, 2026-07-18).

One row per APPOINTMENT (a judge elevated district→circuit is two rows, which is what an
appointments chart wants). Coverage = every court the tracker covers:
  * FJC bulk CSV (the same authoritative spine judges.csv uses): SCOTUS, 13 circuits,
    94 districts (life-tenured incl. DC/PR), USCIT — every appointment block whose
    commission date is on/after CUTOFF, whether or not the judge still serves. Termination
    date + reason come from the same block, senior date likewise.
  * CFC (uscfc, Art. I — structurally absent from the bulk export): FJC's per-judge
    "History of the Federal Judiciary" pages, the same source/parse the current-roster
    path uses (collect_courtlistener.fjc_cfc_bio), extended to the FULL listing including
    departed judges. Termination dates for departed CFC judges come from the listing's
    service-year ranges (year precision only — flagged in `date_precision`).
  * gud/nmid/vid (territorial, Art. IV): the documented manual CSV covers CURRENT judges
    only; no systematic historical source exists (same finding as DATA_SOURCES 2026-07-16).
    Historical territorial appointments are a DOCUMENTED GAP (~a dozen judgeships).

`fedsoc_reported`/`acs_reported` are joined from data/judges.csv (court_id + full name), so
they exist only for sitting judges — the Wikipedia enrichment never ran for departed ones.
Read false as "unreported", never "no affiliation" (same rule as judges.csv).

Cutoff: 1969-01-20 (Nixon's inauguration) — the earliest presidency with sitting appointees.

Usage: python3 scripts/collect_appointments.py [--no-net]
Writes data/appointments.csv; build_assets.py derives data/appointments.json + manifest.
"""
from __future__ import annotations
import argparse
import csv
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DATA = ROOT / "data"
sys.path.insert(0, str(ROOT / "scripts"))
import collect_courtlistener as cc  # noqa: E402  (FJC parsers, president party map, caches)

CUTOFF = "1969-01-20"
OUT = DATA / "appointments.csv"

COLS = [
    "full_name", "court_id", "court_level", "appointing_president", "president_party",
    "nomination_date", "confirmation_date", "commission_date", "recess_appointment_date",
    "senior_date",
    "termination_date", "termination_reason", "date_precision", "sitting",
    "fjc_jid", "fedsoc_reported", "acs_reported",
    # photos: every court, though only SCOTUS dots draw them inline in the swarm itself - other
    # courts' photos only ever surface in the docked detail panel. Sitting judges filled here
    # (name-keyed against judges.csv, so already reappointment-safe); a judge who has since
    # fully departed keeps whatever was already on disk (carried forward by fjc_jid, see the
    # `old_photos_by_jid` comment in main() - 2026-08-27, generalized from a SCOTUS-only fix).
    # FORMER SCOTUS justices specifically get a dedicated first-time Wikidata/Commons lookup from
    # scripts/enrich_scotus_photos.py, which must run after this script and before
    # build_assets.py - no equivalent first-time lookup exists for other departed judges, so
    # their photo only persists here if they already had one before departing.
    "photo_url", "photo_source", "photo_license",
    "source", "notes",
]

# Departed CFC judges: the listing's "(1987-2005)" service years are the only systematic
# termination signal (their bios end at appointment/senior facts).
CFC_LISTING_YEARS_RE = re.compile(
    r'href="/history/(?:courts|judge)/(?:u\.s\.-|us-)?court-federal-claims-([a-z0-9.-]+)">'
    r'([^<]*)</a>\s*\(([^)]*)\)'
)


def load_courts():
    levels, names = {}, {}
    for r in csv.DictReader(open(DATA / "courts.csv")):
        levels[r["court_id"]] = r["court_level"]
        names[r["court_name"]] = r["court_id"]
    names["U.S. Court of Appeals for the District of Columbia Circuit"] = "cadc"
    return levels, names


def load_affiliations():
    aff, photos = {}, {}
    for r in csv.DictReader(open(DATA / "judges.csv")):
        aff[(r["court_id"], r["full_name"])] = (r["fedsoc_reported"], r["acs_reported"])
        # licensed photo for EVERY sitting judge (the beeswarm's docked panel shows them;
        # only SCOTUS dots draw photos in the swarm itself). Keyed by name alone so a
        # sitting judge's photo also reaches their EARLIER appointment rows (e.g. the
        # district dot of a since-elevated circuit judge).
        if r.get("photo_url"):
            photos[r["full_name"]] = (r["photo_url"], r["photo_source"], r["photo_license"])
    return aff, photos


def fjc_bulk_rows(names: dict) -> list[dict]:
    rows = []
    with cc.FJC_CSV.open(encoding="utf-8", errors="replace") as f:
        for r in csv.DictReader(f):
            for n in range(1, 7):
                cid = names.get(r.get(f"Court Name ({n})", ""))
                if not cid:
                    continue
                s = f" ({n})"
                comm = (r.get(f"Commission Date{s}") or "").strip()
                if not comm or comm < CUTOFF:
                    continue
                term = (r.get(f"Termination Date{s}") or "").strip()
                senior = (r.get(f"Senior Status Date{s}") or "").strip()
                # SCOTUS: a senior-dated, untermed justice is RETIRED from the Court
                # (28 U.S.C. §371) — for the chart that is a departure, not a sitting judge.
                sitting = not term and not (cid == "scotus" and senior)
                full = " ".join(x for x in [r["First Name"], r["Middle Name"],
                                            r["Last Name"], r["Suffix"]] if x.strip())
                rows.append({
                    "full_name": full, "court_id": cid,
                    "appointing_president": (r.get(f"Appointing President{s}") or "").strip(),
                    "president_party": (r.get(f"Party of Appointing President{s}") or "").strip(),
                    "nomination_date": (r.get(f"Nomination Date{s}") or "").strip(),
                    "confirmation_date": (r.get(f"Confirmation Date{s}") or "").strip(),
                    "commission_date": comm,
                    "recess_appointment_date": (r.get(f"Recess Appointment Date{s}") or "").strip(),
                    "senior_date": senior,
                    "termination_date": term,
                    "termination_reason": (r.get(f"Termination{s}") or "").strip(),
                    "date_precision": "day", "sitting": sitting,
                    "fjc_jid": r["jid"], "source": "fjc_bulk", "notes": "",
                })
    return rows


def cfc_rows(allow_net: bool) -> list[dict]:
    html = cc.fjc_html_get(cc.CFC_LISTING_URL, "cfc_listing", allow_net) or ""
    rows = []
    for m in CFC_LISTING_YEARS_RE.finditer(html):
        slug, name, years = m.group(1), re.sub(r"\s+", " ", m.group(2)).strip(), m.group(3)
        ym = re.match(r"(\d{4})\s*-\s*(\d{4}|present)", years.strip())
        if not ym:
            continue
        y0, y1 = ym.group(1), ym.group(2)
        if y1 != "present" and y1 < "1969":
            continue                        # service ended before the cutoff era
        bio = cc.fjc_cfc_bio(slug, allow_net)
        if not bio or not bio.get("commission_date"):
            continue
        if bio["commission_date"] < CUTOFF:
            continue
        pres = bio.get("appointing_president") or ""
        current = y1 == "present"
        rows.append({
            "full_name": name, "court_id": "uscfc",
            "appointing_president": pres,
            "president_party": cc.PRESIDENT_PARTY.get(pres, ""),
            "nomination_date": bio.get("nomination_date") or "",
            "confirmation_date": bio.get("confirmation_date") or "",
            "commission_date": bio["commission_date"], "recess_appointment_date": "",
            "senior_date": bio.get("senior_date") or "",
            # Departed judges: year precision only (from the listing range).
            "termination_date": "" if current else f"{y1}-12-31",
            "termination_reason": "" if current else "left court (year per FJC listing)",
            "date_precision": "day" if current else "termination:year",
            "sitting": current, "fjc_jid": "",
            "source": "fjc_html", "notes": "" if current else
                "Termination year from FJC listing service range; exact date not published there.",
        })
    return rows


def territorial_rows(allow_net: bool) -> list[dict]:
    rows = []
    for cid in cc.FIXED_TERM_YEARS:
        for r in cc.territorial_manual_rows(cid, allow_net):
            if (r.get("commission_date") or "") < CUTOFF:
                continue
            rows.append({
                "full_name": r["full_name"], "court_id": cid,
                "appointing_president": r.get("appointing_president") or "",
                "president_party": r.get("president_party") or "",
                "nomination_date": r.get("nomination_date") or "",
                "confirmation_date": r.get("confirmation_date") or "",
                "commission_date": r.get("commission_date") or "", "recess_appointment_date": "",
                "senior_date": "", "termination_date": "", "termination_reason": "",
                "date_precision": "day", "sitting": True, "fjc_jid": "",
                "source": "territorial_manual",
                "notes": "Current judges only; no systematic historical source for this court.",
            })
    return rows


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--no-net", action="store_true")
    args = ap.parse_args()
    allow_net = not args.no_net

    levels, names = load_courts()
    aff, scotus_photos = load_affiliations()

    # This script regenerates the whole file every run, but it can only source photos for
    # CURRENTLY SITTING judges (via judges.csv, name-keyed - see load_affiliations()). A judge
    # who has since fully departed (died, resigned, not just reappointed elsewhere - a
    # reappointment/elevation is already covered by the name-keyed lookup above, since the
    # person is still in judges.csv) drops out of that lookup entirely, so a bare rewrite would
    # silently blank a departed judge's photo the moment they leave - originally only fixed for
    # SCOTUS (scripts/enrich_scotus_photos.py's separate Wikidata/Commons lookup for former
    # justices), but the operator asked (2026-08-27) for every departed judge's photo to keep
    # showing in the timeline's docked detail panel, not just SCOTUS's - "not visible by default"
    # (regular dots don't inline a photo, only SCOTUS's do) isn't a good enough reason to let it
    # silently rot for every other court. Generalized: carry forward whatever's already on disk
    # for ANY departed judge, keyed by fjc_jid (a person can hold 2+ rows across their career -
    # e.g. a district then circuit seat - sharing one jid and photo).
    old_photos_by_jid: dict[str, tuple[str, str, str]] = {}
    if OUT.exists():
        with OUT.open(encoding="utf-8") as f:
            for er in csv.DictReader(f):
                if er.get("photo_url") and er.get("fjc_jid"):
                    old_photos_by_jid[er["fjc_jid"]] = (
                        er["photo_url"], er["photo_source"], er["photo_license"])

    rows = fjc_bulk_rows(names)
    print(f"[bulk] {len(rows)} appointments since {CUTOFF} (Art III incl. SCOTUS + USCIT)")
    c = cfc_rows(allow_net)
    print(f"[cfc]  {len(c)} CFC appointments (incl. departed; year-precision terminations)")
    rows += c
    t = territorial_rows(allow_net)
    print(f"[terr] {len(t)} territorial (current only — documented historical gap)")
    rows += t

    for r in rows:
        r["court_level"] = levels.get(r["court_id"], "")
        fs, ac = aff.get((r["court_id"], r["full_name"]), ("", ""))
        r["fedsoc_reported"], r["acs_reported"] = fs, ac
        r["sitting"] = str(r["sitting"]).lower()
        p = scotus_photos.get(r["full_name"]) or old_photos_by_jid.get(r.get("fjc_jid"))
        r["photo_url"], r["photo_source"], r["photo_license"] = p or ("", "", "")

    rows.sort(key=lambda r: (r["commission_date"], r["court_id"], r["full_name"]))
    with OUT.open("w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=COLS)
        w.writeheader()
        w.writerows(rows)
    print(f"[write] {len(rows)} appointment rows → {OUT.relative_to(ROOT)}")

    by_pres: dict[str, int] = {}
    for r in rows:
        by_pres[r["appointing_president"]] = by_pres.get(r["appointing_president"], 0) + 1
    for p, n in sorted(by_pres.items(), key=lambda kv: -kv[1]):
        print(f"    {n:>4}  {p}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
