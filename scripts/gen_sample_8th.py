#!/usr/bin/env python3
"""gen_sample_8th.py — Phase 1 hand-authored SAMPLE data for the 8th-Circuit slice.

REAL, SOURCED judges (not synthetic): values come from the Federal Judicial Center
Biographical Directory export (fjc.gov/history/judges) — exact commission/senior dates,
appointing president + party, ABA rating, and JD school. `cl_profile_url` points to the
FJC bio node as the source; `cl_person_id`/`seat_id` (CourtListener ids) are left null and
joined in the Phase 2 CourtListener sweep. `data_verified` is always false (human-only).

Coverage of the Phase-1 tricky cases (per PROGRESS.md / BUILD_SEQUENCE Phase 1):
  - senior judges:      Melloy, Wollman (ca8); Sippel, Fleissig (moed)
  - vacancy:            ca8 has 7 active of 11 authorized -> 4 vacancies rendered
  - same-surname pair:  Lavenski R. Smith + Justin D. Smith on ca8 -> display_name "L. Smith"/"J. Smith"
  - chief judge:        Colloton (ca8), Clark (moed)
  - Circuit Justice:    Kavanaugh (ca8), in circuit_justices.csv
  - party + ABA mix:    R/D rings; incl. real ABA "Not Qualified" (Grasz, Pitlyk)

moed (E.D. Mo.) is a partial-but-plausible district sample: 7 active = 7 authorized (0
vacancies) + 2 seniors, to exercise district-level panes on drill-in. Reconciled/expanded
by the Phase 2 sweep.
"""
from __future__ import annotations
import csv
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
JUDGES_OUT = ROOT / "data" / "judges.csv"
JUSTICES_OUT = ROOT / "data" / "circuit_justices.csv"

FJC = "https://www.fjc.gov/node/{nid}"

JUDGE_COLS = [
    "cl_person_id", "full_name", "display_name", "court_id", "seat_id", "status",
    "is_chief", "appointing_president", "president_party", "nomination_date",
    "confirmation_date", "commission_date", "senior_date", "term_expiration_date",
    "jd_school", "jd_year", "aba_rating", "cl_profile_url", "photo_url", "photo_source",
    "photo_license", "fedsoc_reported", "fedsoc_basis", "fedsoc_source",
    "acs_reported", "acs_basis", "acs_source", "data_verified", "notes",
]

# (nid, full_name, display_name, court_id, status, is_chief, president, party,
#  nom, conf, commission, senior_date, jd_school, jd_year, aba)
JUDGES = [
    # --- 8th Circuit Court of Appeals (ca8), authorized 11 ---
    (1383986, "James B. Loken",        "Loken",    "ca8", "active", False, "George H.W. Bush", "Republican",
     "1990-09-10", "1990-10-12", "1990-10-17", "", "Harvard Law School", 1965, "Well Qualified"),
    (1391576, "Lavenski R. Smith",     "L. Smith", "ca8", "active", False, "George W. Bush", "Republican",
     "2001-09-04", "2002-07-15", "2002-07-19", "", "University of Arkansas School of Law", 1987, "Qualified"),
    (1384996, "Michael J. Melloy",     "Melloy",   "ca8", "senior", False, "George W. Bush", "Republican",
     "2001-09-04", "2002-02-11", "2002-02-14", "2013-02-01", "University of Iowa College of Law", 1974, "Well Qualified"),
    (1391956, "Steven M. Colloton",    "Colloton", "ca8", "active", True,  "George W. Bush", "Republican",
     "2003-02-12", "2003-09-04", "2003-09-10", "", "Yale Law School", 1988, "Qualified"),
    (1394186, "Jane L. Kelly",         "Kelly",    "ca8", "active", False, "Barack Obama", "Democratic",
     "2013-01-31", "2013-04-24", "2013-04-25", "", "Harvard Law School", 1991, "Qualified"),
    (4025236, "L. Steven Grasz",       "Grasz",    "ca8", "active", False, "Donald J. Trump", "Republican",
     "2017-08-03", "2017-12-12", "2018-01-03", "", "University of Nebraska College of Law", 1989, "Not Qualified"),
    (4097796, "David R. Stras",        "Stras",    "ca8", "active", False, "Donald J. Trump", "Republican",
     "2018-01-08", "2018-01-30", "2018-01-31", "", "University of Kansas School of Law", 1999, "Well Qualified"),
    (1390021, "Roger L. Wollman",      "Wollman",  "ca8", "senior", False, "Ronald Reagan", "Republican",
     "1985-06-25", "1985-07-19", "1985-07-22", "2018-12-14", "University of South Dakota School of Law", 1962, ""),
    (13762133, "Justin D. Smith",      "J. Smith", "ca8", "active", False, "Donald J. Trump", "Republican",
     "2026-03-02", "2026-06-15", "2026-06-18", "", "University of Missouri School of Law", 2010, "Qualified"),

    # --- Eastern District of Missouri (moed), authorized 7 ---
    (1391581, "Henry E. Autrey",       "Autrey",   "moed", "active", False, "George W. Bush", "Republican",
     "", "", "2002-08-02", "", "Saint Louis University School of Law", 1977, "Qualified"),
    (1393956, "Brian C. Wimes",        "Wimes",    "moed", "active", False, "Barack Obama", "Democratic",
     "", "", "2012-04-30", "", "Texas Southern University, Thurgood Marshall School of Law", 1994, "Qualified"),
    (6489106, "Stephen R. Clark",      "Clark",    "moed", "active", True,  "Donald J. Trump", "Republican",
     "", "", "2019-06-12", "", "Saint Louis University School of Law", 1991, "Well Qualified"),
    (7465646, "Sarah E. Pitlyk",       "Pitlyk",   "moed", "active", False, "Donald J. Trump", "Republican",
     "", "", "2019-12-05", "", "Yale Law School", 2008, "Not Qualified"),
    (7815631, "Matthew T. Schelp",     "Schelp",   "moed", "active", False, "Donald J. Trump", "Republican",
     "", "", "2020-08-04", "", "University of Missouri School of Law", 1996, "Well Qualified"),
    (13762034, "Cristian M. Stevens",  "Stevens",  "moed", "active", False, "Donald J. Trump", "Republican",
     "", "", "2025-07-23", "", "University of Missouri School of Law", 1998, "Well Qualified"),
    (13762033, "Joshua M. Divine",     "Divine",   "moed", "active", False, "Donald J. Trump", "Republican",
     "", "", "2025-07-24", "", "Yale Law School", 2016, "Well Qualified"),
    (1390561, "Rodney W. Sippel",      "Sippel",   "moed", "senior", False, "William J. Clinton", "Democratic",
     "", "", "1997-11-12", "2023-01-28", "Washington University School of Law", 1981, "Qualified"),
    (1393236, "Audrey G. Fleissig",    "Fleissig", "moed", "senior", False, "Barack Obama", "Democratic",
     "", "", "2010-06-09", "2023-04-14", "Washington University School of Law", 1980, "Well Qualified"),
]

# (circuit_id, justice_cl_person_id, justice_name, assignment_start, source_url, notes)
JUSTICES = [
    ("ca8", "", "Brett M. Kavanaugh", "2022-09-28",
     "https://www.supremecourt.gov/about/circuitassignments.aspx",
     "Circuit allotment effective 2022-09-28 (28 U.S.C. 42)."),
]

SAMPLE_NOTE = ("Phase-1 SAMPLE; sourced from FJC Biographical Directory "
               "(cl_profile_url = FJC bio node). cl_person_id/seat_id joined from "
               "CourtListener in Phase 2. data_verified=false.")


def main() -> int:
    with JUDGES_OUT.open("w", newline="", encoding="utf-8") as fh:
        w = csv.DictWriter(fh, fieldnames=JUDGE_COLS)
        w.writeheader()
        for (nid, full, disp, court, status, chief, pres, party, nom, conf, comm,
             senior, jd_school, jd_year, aba) in JUDGES:
            w.writerow({
                "cl_person_id": "",                       # joined in Phase 2
                "full_name": full,
                "display_name": disp,
                "court_id": court,
                "seat_id": "",                            # CourtListener seat id, Phase 2
                "status": status,
                "is_chief": str(chief).lower(),
                "appointing_president": pres,
                "president_party": party,
                "nomination_date": nom,
                "confirmation_date": conf,
                "commission_date": comm,
                "senior_date": senior,
                "term_expiration_date": "",               # life_tenured
                "jd_school": jd_school,
                "jd_year": jd_year,
                "aba_rating": aba,
                "cl_profile_url": FJC.format(nid=nid),
                "photo_url": "",
                "photo_source": "",
                "photo_license": "",
                "fedsoc_reported": "false",
                "fedsoc_basis": "",
                "fedsoc_source": "",
                "acs_reported": "false",
                "acs_basis": "",
                "acs_source": "",
                "data_verified": "false",
                "notes": SAMPLE_NOTE,
            })

    with JUSTICES_OUT.open("w", newline="", encoding="utf-8") as fh:
        w = csv.writer(fh)
        w.writerow(["circuit_id", "justice_cl_person_id", "justice_name",
                    "assignment_start_date", "source_url", "notes"])
        for cid, jid, name, start, url, note in JUSTICES:
            w.writerow([cid, jid, name, start, url, note])

    print(f"wrote {JUDGES_OUT.name} ({len(JUDGES)} judges) and "
          f"{JUSTICES_OUT.name} ({len(JUSTICES)} circuit justice)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
