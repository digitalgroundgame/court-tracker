#!/usr/bin/env python3
"""gen_courts_skeleton.py — one-shot authoring aid for data/courts.csv (Phase 0 freeze).

Emits the identity/hierarchy/geometry skeleton for all 13 circuits, 94 district
courts (incl. 3 territorial + D.C.), and the 2 Federal-Circuit feeders (USCIT, CFC).

Court codes are the CourtListener / courts-db codes (docs/GEOMETRY_CONTRACT.md §Naming);
`geometry_key == court_id`. `authorized_judgeships` come from statute:
  - circuits: 28 U.S.C. §44
  - districts: 28 U.S.C. §133 (as fetched from Cornell LII)
  - territorial: 48 U.S.C. (Guam §1424b=1, V.I. §1614=2, N. Mariana §1821=1; 10-yr terms)
  - USCIT: 28 U.S.C. §251 = 9 (Art. III, life tenure)
  - CFC:   28 U.S.C. §171 = 16 (Art. I, 15-yr terms)

ROVING JUDGESHIPS (flagged for Phase-2 CourtListener reconciliation): §133 lists shared
seats — Kentucky E&W (+1), Missouri E&W (+2), Oklahoma N/E/W (+1) — beyond the per-district
counts below. Those 4 shared seats are NOT folded into any single district here; the base
per-district statutory counts are used, to be reconciled against CourtListener in Phase 2.
"""
from __future__ import annotations
import csv
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "data" / "courts.csv"

INSETS = {"akd", "hid", "prd", "gud", "nmid", "vid"}
FIXED_TERM = {"gud", "nmid", "vid", "uscfc"}

# --- Circuits: court_id -> (full name, short, §44 judges) ----------------------
CIRCUITS = [
    ("ca1",  "U.S. Court of Appeals for the First Circuit",   "1st Cir.",   6,  True),
    ("ca2",  "U.S. Court of Appeals for the Second Circuit",  "2nd Cir.",   13, True),
    ("ca3",  "U.S. Court of Appeals for the Third Circuit",   "3rd Cir.",   14, True),
    ("ca4",  "U.S. Court of Appeals for the Fourth Circuit",  "4th Cir.",   15, True),
    ("ca5",  "U.S. Court of Appeals for the Fifth Circuit",   "5th Cir.",   17, True),
    ("ca6",  "U.S. Court of Appeals for the Sixth Circuit",   "6th Cir.",   16, True),
    ("ca7",  "U.S. Court of Appeals for the Seventh Circuit", "7th Cir.",   11, True),
    ("ca8",  "U.S. Court of Appeals for the Eighth Circuit",  "8th Cir.",   11, True),
    ("ca9",  "U.S. Court of Appeals for the Ninth Circuit",   "9th Cir.",   29, True),
    ("ca10", "U.S. Court of Appeals for the Tenth Circuit",   "10th Cir.",  12, True),
    ("ca11", "U.S. Court of Appeals for the Eleventh Circuit","11th Cir.",  12, True),
    ("cadc", "U.S. Court of Appeals for the D.C. Circuit",    "D.C. Cir.",  11, True),
    ("cafc", "U.S. Court of Appeals for the Federal Circuit", "Fed. Cir.",  12, False),
]

# --- Districts: (court_id, full district phrase, short, §133 judges, parent) ----
# full name is built as "U.S. District Court for the <phrase>".
D = [
    # 1st Circuit
    ("med",  "District of Maine",                 "D. Me.",     3,  "ca1"),
    ("mad",  "District of Massachusetts",         "D. Mass.",   13, "ca1"),
    ("nhd",  "District of New Hampshire",         "D.N.H.",     3,  "ca1"),
    ("rid",  "District of Rhode Island",          "D.R.I.",     3,  "ca1"),
    ("prd",  "District of Puerto Rico",           "D.P.R.",     7,  "ca1"),
    # 2nd Circuit
    ("ctd",  "District of Connecticut",           "D. Conn.",   8,  "ca2"),
    ("nynd", "Northern District of New York",     "N.D.N.Y.",   5,  "ca2"),
    ("nyed", "Eastern District of New York",      "E.D.N.Y.",   15, "ca2"),
    ("nysd", "Southern District of New York",     "S.D.N.Y.",   28, "ca2"),
    ("nywd", "Western District of New York",      "W.D.N.Y.",   4,  "ca2"),
    ("vtd",  "District of Vermont",               "D. Vt.",     2,  "ca2"),
    # 3rd Circuit
    ("ded",  "District of Delaware",              "D. Del.",    4,  "ca3"),
    ("njd",  "District of New Jersey",            "D.N.J.",     17, "ca3"),
    ("paed", "Eastern District of Pennsylvania",  "E.D. Pa.",   22, "ca3"),
    ("pamd", "Middle District of Pennsylvania",   "M.D. Pa.",   6,  "ca3"),
    ("pawd", "Western District of Pennsylvania",  "W.D. Pa.",   10, "ca3"),
    ("vid",  "District of the Virgin Islands",    "D.V.I.",     2,  "ca3"),
    # 4th Circuit
    ("mdd",  "District of Maryland",              "D. Md.",     10, "ca4"),
    ("nced", "Eastern District of North Carolina","E.D.N.C.",   4,  "ca4"),
    ("ncmd", "Middle District of North Carolina", "M.D.N.C.",   4,  "ca4"),
    ("ncwd", "Western District of North Carolina","W.D.N.C.",   5,  "ca4"),
    ("scd",  "District of South Carolina",        "D.S.C.",     10, "ca4"),
    ("vaed", "Eastern District of Virginia",      "E.D. Va.",   11, "ca4"),
    ("vawd", "Western District of Virginia",      "W.D. Va.",   4,  "ca4"),
    ("wvnd", "Northern District of West Virginia","N.D.W. Va.", 3,  "ca4"),
    ("wvsd", "Southern District of West Virginia","S.D.W. Va.", 5,  "ca4"),
    # 5th Circuit
    ("laed", "Eastern District of Louisiana",     "E.D. La.",   12, "ca5"),
    ("lamd", "Middle District of Louisiana",      "M.D. La.",   3,  "ca5"),
    ("lawd", "Western District of Louisiana",     "W.D. La.",   7,  "ca5"),
    ("msnd", "Northern District of Mississippi",  "N.D. Miss.", 3,  "ca5"),
    ("mssd", "Southern District of Mississippi",  "S.D. Miss.", 6,  "ca5"),
    ("txnd", "Northern District of Texas",        "N.D. Tex.",  12, "ca5"),
    ("txed", "Eastern District of Texas",         "E.D. Tex.",  8,  "ca5"),
    ("txsd", "Southern District of Texas",        "S.D. Tex.",  19, "ca5"),
    ("txwd", "Western District of Texas",         "W.D. Tex.",  13, "ca5"),
    # 6th Circuit
    ("kyed", "Eastern District of Kentucky",      "E.D. Ky.",   5,  "ca6"),
    ("kywd", "Western District of Kentucky",      "W.D. Ky.",   4,  "ca6"),
    ("mied", "Eastern District of Michigan",      "E.D. Mich.", 15, "ca6"),
    ("miwd", "Western District of Michigan",      "W.D. Mich.", 4,  "ca6"),
    ("ohnd", "Northern District of Ohio",         "N.D. Ohio",  11, "ca6"),
    ("ohsd", "Southern District of Ohio",         "S.D. Ohio",  8,  "ca6"),
    ("tned", "Eastern District of Tennessee",     "E.D. Tenn.", 5,  "ca6"),
    ("tnmd", "Middle District of Tennessee",      "M.D. Tenn.", 4,  "ca6"),
    ("tnwd", "Western District of Tennessee",     "W.D. Tenn.", 5,  "ca6"),
    # 7th Circuit
    ("ilnd", "Northern District of Illinois",     "N.D. Ill.",  22, "ca7"),
    ("ilcd", "Central District of Illinois",      "C.D. Ill.",  4,  "ca7"),
    ("ilsd", "Southern District of Illinois",     "S.D. Ill.",  4,  "ca7"),
    ("innd", "Northern District of Indiana",      "N.D. Ind.",  5,  "ca7"),
    ("insd", "Southern District of Indiana",      "S.D. Ind.",  5,  "ca7"),
    ("wied", "Eastern District of Wisconsin",     "E.D. Wis.",  5,  "ca7"),
    ("wiwd", "Western District of Wisconsin",     "W.D. Wis.",  2,  "ca7"),
    # 8th Circuit
    ("are",  "Eastern District of Arkansas",      "E.D. Ark.",  5,  "ca8"),
    ("arw",  "Western District of Arkansas",      "W.D. Ark.",  3,  "ca8"),
    ("iand", "Northern District of Iowa",         "N.D. Iowa",  2,  "ca8"),
    ("iasd", "Southern District of Iowa",         "S.D. Iowa",  3,  "ca8"),
    ("mnd",  "District of Minnesota",             "D. Minn.",   7,  "ca8"),
    ("moed", "Eastern District of Missouri",      "E.D. Mo.",   7,  "ca8"),
    ("mowd", "Western District of Missouri",      "W.D. Mo.",   5,  "ca8"),
    ("ned",  "District of Nebraska",              "D. Neb.",    3,  "ca8"),
    ("ndd",  "District of North Dakota",          "D.N.D.",     2,  "ca8"),
    ("sdd",  "District of South Dakota",          "D.S.D.",     3,  "ca8"),
    # 9th Circuit
    ("akd",  "District of Alaska",                "D. Alaska",  3,  "ca9"),
    ("azd",  "District of Arizona",               "D. Ariz.",   13, "ca9"),
    ("cand", "Northern District of California",   "N.D. Cal.",  14, "ca9"),
    ("caed", "Eastern District of California",    "E.D. Cal.",  6,  "ca9"),
    ("cacd", "Central District of California",    "C.D. Cal.",  28, "ca9"),
    ("casd", "Southern District of California",   "S.D. Cal.",  13, "ca9"),
    ("hid",  "District of Hawaii",                "D. Haw.",    4,  "ca9"),
    ("idd",  "District of Idaho",                 "D. Idaho",   2,  "ca9"),
    ("mtd",  "District of Montana",               "D. Mont.",   3,  "ca9"),
    ("nvd",  "District of Nevada",                "D. Nev.",    7,  "ca9"),
    ("ord",  "District of Oregon",                "D. Or.",     6,  "ca9"),
    ("waed", "Eastern District of Washington",    "E.D. Wash.", 4,  "ca9"),
    ("wawd", "Western District of Washington",    "W.D. Wash.", 7,  "ca9"),
    ("gud",  "District of Guam",                  "D. Guam",    1,  "ca9"),
    ("nmid", "District of the Northern Mariana Islands", "D.N. Mar. I.", 1, "ca9"),
    # 10th Circuit
    ("cod",  "District of Colorado",              "D. Colo.",   7,  "ca10"),
    ("ksd",  "District of Kansas",                "D. Kan.",    6,  "ca10"),
    ("nmd",  "District of New Mexico",            "D.N.M.",     7,  "ca10"),
    ("oknd", "Northern District of Oklahoma",     "N.D. Okla.", 3,  "ca10"),
    ("oked", "Eastern District of Oklahoma",      "E.D. Okla.", 1,  "ca10"),
    ("okwd", "Western District of Oklahoma",      "W.D. Okla.", 6,  "ca10"),
    ("utd",  "District of Utah",                  "D. Utah",    5,  "ca10"),
    ("wyd",  "District of Wyoming",               "D. Wyo.",    3,  "ca10"),
    # 11th Circuit
    ("alnd", "Northern District of Alabama",      "N.D. Ala.",  8,  "ca11"),
    ("almd", "Middle District of Alabama",        "M.D. Ala.",  3,  "ca11"),
    ("alsd", "Southern District of Alabama",      "S.D. Ala.",  3,  "ca11"),
    ("flnd", "Northern District of Florida",      "N.D. Fla.",  4,  "ca11"),
    ("flmd", "Middle District of Florida",        "M.D. Fla.",  15, "ca11"),
    ("flsd", "Southern District of Florida",      "S.D. Fla.",  18, "ca11"),
    ("gand", "Northern District of Georgia",      "N.D. Ga.",   11, "ca11"),
    ("gamd", "Middle District of Georgia",        "M.D. Ga.",   4,  "ca11"),
    ("gasd", "Southern District of Georgia",      "S.D. Ga.",   3,  "ca11"),
    # D.C. Circuit
    ("dcd",  "District of Columbia",              "D.D.C.",     15, "cadc"),
]

# --- Specialized (Federal-Circuit feeders) -------------------------------------
SPECIAL = [
    ("cit",   "U.S. Court of International Trade", "CIT", 9,  "cafc", "life_tenured"),
    ("uscfc", "U.S. Court of Federal Claims",      "CFC",   16, "cafc", "fixed_term"),
]

COLUMNS = ["court_id", "court_name", "short_name", "court_level", "parent_id",
           "tenure_type", "authorized_judgeships", "has_geography", "is_inset",
           "geometry_key"]


def row(court_id, court_name, short_name, level, parent, tenure, seats, has_geo):
    is_inset = court_id in INSETS
    geometry_key = court_id if has_geo else ""
    return {
        "court_id": court_id,
        "court_name": court_name,
        "short_name": short_name,
        "court_level": level,
        "parent_id": parent or "",
        "tenure_type": tenure,
        "authorized_judgeships": seats,
        "has_geography": str(has_geo).lower(),
        "is_inset": str(is_inset).lower(),
        "geometry_key": geometry_key,
    }


def main() -> int:
    rows = []
    # SCOTUS (added 2026-07-18, operator ask): its own court_level so nothing circuit- or
    # district-shaped accidentally applies. 9 seats (28 U.S.C. §1). No geography, no parent.
    rows.append(row("scotus", "Supreme Court of the United States", "SCOTUS",
                    "scotus", None, "life_tenured", 9, False))
    for cid, name, short, seats, has_geo in CIRCUITS:
        rows.append(row(cid, name, short, "circuit", None, "life_tenured", seats, has_geo))
    for cid, phrase, short, seats, parent in D:
        name = f"U.S. District Court for the {phrase}"
        tenure = "fixed_term" if cid in FIXED_TERM else "life_tenured"
        rows.append(row(cid, name, short, "district", parent, tenure, seats, True))
    for cid, name, short, seats, parent, tenure in SPECIAL:
        rows.append(row(cid, name, short, "specialized", parent, tenure, seats, False))

    with OUT.open("w", newline="", encoding="utf-8") as fh:
        w = csv.DictWriter(fh, fieldnames=COLUMNS)
        w.writeheader()
        w.writerows(rows)

    n_circ = sum(1 for r in rows if r["court_level"] == "circuit")
    n_dist = sum(1 for r in rows if r["court_level"] == "district")
    n_spec = sum(1 for r in rows if r["court_level"] == "specialized")
    n_inset = sum(1 for r in rows if r["is_inset"] == "true")
    n_fixed = sum(1 for r in rows if r["tenure_type"] == "fixed_term")
    print(f"wrote {OUT} — {len(rows)} courts: {n_circ} circuits, {n_dist} districts, "
          f"{n_spec} specialized; {n_inset} insets; {n_fixed} fixed-term")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
