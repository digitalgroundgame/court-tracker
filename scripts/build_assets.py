#!/usr/bin/env python3
"""build_assets.py — derive runtime JSON + manifest from the source-of-truth CSVs.

Phase 0 stub: this must always emit a *valid* `data/manifest.json` even when the
CSVs are empty or absent, so the app shell can boot. As later phases add data it
grows to: read the three CSVs, validate against docs/CODEBOOK.md, and emit the
per-view runtime JSON the widget lazy-loads.

Design rules (see CLAUDE.md):
  - Data-only updates: re-running this after dropping in new CSV/SVG is the *only*
    step needed to publish new data. No app code changes.
  - `data_verified` is never written true here (human-only flag).
  - Every asset the app fetches is listed in manifest.json with a version stamp
    for cache-busting.

Usage: python3 scripts/build_assets.py
"""
from __future__ import annotations

import csv
import hashlib
import json
import sys
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DATA = ROOT / "data"
GEO = ROOT / "assets" / "geo"

# CSV filenames (source of truth).
COURTS_CSV = DATA / "courts.csv"
JUDGES_CSV = DATA / "judges.csv"
CIRCUIT_JUSTICES_CSV = DATA / "circuit_justices.csv"
SEAT_BLOCKS_CSV = DATA / "seat_blocks.csv"   # operator-tuned map placement (see docs/CODEBOOK.md)
PRESIDENT_PHOTOS_CSV = DATA / "president_photos.csv"  # scripts/collect_president_photos.py
PHOTO_THUMBS_FILE = DATA / "cache" / "photo_thumbs.json"  # scripts/cache_photos.py output


def _load_photo_thumbs() -> dict[str, str]:
    """url -> local `assets/photos/<hash>.jpg` path, built by scripts/cache_photos.py.
    Missing/empty is fine (pre-caching run, or a fresh checkout): widgets fall back to
    hotlinking `photo_url` directly, same as before this existed."""
    if not PHOTO_THUMBS_FILE.exists():
        return {}
    return json.loads(PHOTO_THUMBS_FILE.read_text(encoding="utf-8"))

# Expected column contract (frozen in docs/CODEBOOK.md). Used for light validation;
# a missing/empty CSV is tolerated in Phase 0 so the shell still boots.
COURTS_COLUMNS = [
    "court_id", "court_name", "short_name", "court_level", "parent_id",
    "tenure_type", "authorized_judgeships", "has_geography", "is_inset",
    "geometry_key",
]


def _read_csv(path: Path) -> list[dict]:
    if not path.exists():
        return []
    with path.open(newline="", encoding="utf-8") as fh:
        return [row for row in csv.DictReader(fh) if any(v.strip() for v in row.values())]


def _coerce_bool(value: str | None) -> bool:
    return str(value).strip().lower() in {"1", "true", "t", "yes", "y"}


def _coerce_int(value: str | None):
    v = (value or "").strip()
    if v == "":
        return None
    try:
        return int(v)
    except ValueError:
        return None


def _nullable(value: str | None):
    v = (value or "").strip()
    return v if v != "" else None


def build_courts(rows: list[dict]) -> list[dict]:
    """Shape courts.csv rows into the runtime courts.json record list."""
    out = []
    for r in rows:
        out.append({
            "court_id": r.get("court_id", "").strip(),
            "court_name": r.get("court_name", "").strip(),
            "short_name": r.get("short_name", "").strip(),
            "court_level": r.get("court_level", "").strip(),
            "parent_id": _nullable(r.get("parent_id")),
            "tenure_type": r.get("tenure_type", "").strip(),
            "authorized_judgeships": _coerce_int(r.get("authorized_judgeships")),
            "has_geography": _coerce_bool(r.get("has_geography")),
            "is_inset": _coerce_bool(r.get("is_inset")),
            "geometry_key": _nullable(r.get("geometry_key")),
        })
    return out


# Fields carried into the runtime judge record (subset of the codebook; render-time
# derivations like time-in-service are computed in the app, not stored).
JUDGE_FIELDS = [
    "cl_person_id", "full_name", "display_name", "court_id", "seat_id", "status",
    "appointing_president", "president_party", "nomination_date", "confirmation_date",
    "commission_date", "senior_date", "term_expiration_date", "jd_school", "jd_year",
    "aba_rating", "cl_profile_url", "photo_url", "photo_source", "photo_license",
    "fedsoc_basis", "fedsoc_source", "acs_basis", "acs_source", "notes",
]


def build_judges(rows: list[dict], photo_thumbs: dict[str, str]) -> list[dict]:
    out = []
    for r in rows:
        rec = {k: _nullable(r.get(k)) for k in JUDGE_FIELDS}
        rec["cl_person_id"] = _coerce_int(r.get("cl_person_id"))
        rec["jd_year"] = _coerce_int(r.get("jd_year"))
        rec["is_chief"] = _coerce_bool(r.get("is_chief"))
        rec["fedsoc_reported"] = _coerce_bool(r.get("fedsoc_reported"))
        rec["acs_reported"] = _coerce_bool(r.get("acs_reported"))
        rec["data_verified"] = _coerce_bool(r.get("data_verified"))
        # Locally-cached, anti-aliased thumbnail (scripts/cache_photos.py) — preferred over
        # hotlinking `photo_url` at runtime; null until that script has run for this URL, in
        # which case the widget falls back to `photo_url` unchanged.
        rec["photo_thumb"] = photo_thumbs.get(rec["photo_url"]) if rec["photo_url"] else None
        out.append(rec)
    return out


def build_seat_blocks(courts: list[dict], judges: list[dict], anchor_rows: list[dict]) -> dict:
    """Per-court seat-block composition + operator-tuned placement.

    Blocks cover the courts that appear on a map: the 13 circuits (national view) and the 94
    districts (circuit-local view). The Federal Circuit has no geometry but IS shown, parked in
    open water off the 11th — so it can only ever be placed by an explicit anchor.

    Seniors, the Circuit Justice and chief markings are deliberately excluded: a block is the
    *authorized bench*, one square per judgeship, vacancies last.
    """
    anchors = {r["court_id"]: r for r in anchor_rows if r.get("court_id")}
    active: dict[str, list[dict]] = {}
    for j in judges:
        if j.get("status") == "active":
            active.setdefault(j["court_id"], []).append(j)

    out: dict[str, dict] = {}
    for c in courts:
        cid = c["court_id"]
        if c["court_level"] not in ("circuit", "district", "specialized"):
            continue
        # cit/uscfc (court_level "specialized") ARE on the map now, but only while the Federal
        # Circuit's feeder view is active: level "feeder" blocks, rendered beside/below cafc's.
        level = "feeder" if c["court_level"] == "specialized" else c["court_level"]
        seats = active.get(cid, [])
        counts = {"r": 0, "d": 0, "o": 0}
        for j in seats:
            p = j.get("president_party")
            counts["r" if p == "Republican" else "d" if p == "Democratic" else "o"] += 1
        authorized = c["authorized_judgeships"] or 0
        # Seven courts sit MORE active judges than §133 authorizes (roving judgeships; CFC
        # over-inclusion — see DATA_SOURCES). Size to the larger number so a real judge is
        # never dropped from the block; those courts simply show no vacancy square.
        total = max(authorized, len(seats))
        a = anchors.get(cid, {})
        out[cid] = {
            "level": level,
            "parent_id": c.get("parent_id"),
            "authorized": authorized,
            "total": total,
            **counts,
            "vacancies": max(0, authorized - len(seats)),
            # projected units in the SVG this block renders in (national for a circuit, that
            # circuit's local file for a district); null => app falls back to the shape centre
            "anchor": ([float(a["anchor_x"]), float(a["anchor_y"])]
                       if a.get("anchor_x") and a.get("anchor_y") else None),
            # square edge in CSS px (constant on screen across views), not map units
            "size": float(a["size"]) if a.get("size") else None,
        }
    return out


def validate(courts: list[dict], judges: list[dict], justices: list[dict],
             blocks: dict | None = None) -> list[str]:
    """Codebook validation rules (docs/CODEBOOK.md §Validation rules). Returns errors."""
    errors: list[str] = []
    by_id = {c["court_id"]: c for c in courts}
    for j in judges:
        cid = j["court_id"]
        who = j.get("full_name") or j.get("cl_person_id") or "?"
        court = by_id.get(cid)
        if court is None:
            errors.append(f"judge {who}: court_id {cid!r} not in courts.csv")
            continue
        if not j.get("commission_date"):
            errors.append(f"judge {who}: commission_date is required (ordering key)")
        if j["fedsoc_reported"] and not j.get("fedsoc_source"):
            errors.append(f"judge {who}: fedsoc_reported true but fedsoc_source empty")
        if j["acs_reported"] and not j.get("acs_source"):
            errors.append(f"judge {who}: acs_reported true but acs_source empty")
        if j.get("photo_url") and not j.get("photo_license"):
            errors.append(f"judge {who}: photo_url set but photo_license empty "
                          f"(never ship an image we cannot license)")
        if j["status"] == "senior":
            if court["tenure_type"] not in ("life_tenured", "fixed_term_senior"):
                errors.append(f"judge {who}: senior on a court that allows no senior status ({cid})")
            if not j.get("senior_date"):
                errors.append(f"judge {who}: senior status requires senior_date")
        if court["tenure_type"] == "fixed_term":
            if j["status"] != "active":
                errors.append(f"judge {who}: fixed_term court requires status=active")
            if not j.get("term_expiration_date"):
                errors.append(f"judge {who}: fixed_term court requires term_expiration_date")
            if j.get("senior_date"):
                errors.append(f"judge {who}: fixed_term court must have null senior_date")
        if court["tenure_type"] == "fixed_term_senior":
            # CFC (28 U.S.C. §171/§178): active judges serve a real fixed term like a plain
            # fixed_term court, but the court also has statutory senior status - see CODEBOOK.
            if not j.get("term_expiration_date"):
                errors.append(f"judge {who}: fixed_term_senior court requires term_expiration_date")
        if j["data_verified"]:
            errors.append(f"judge {who}: data_verified must be false on machine-written rows")
    for jz in justices:
        if jz["circuit_id"] not in by_id:
            errors.append(f"circuit_justice {jz.get('justice_name')}: circuit_id "
                          f"{jz['circuit_id']!r} not in courts.csv")
        if jz.get("photo_url") and not jz.get("photo_license"):
            errors.append(f"circuit_justice {jz.get('justice_name')}: photo_url set but "
                          f"photo_license empty")
    # cafc has no geometry, so it is the one court that cannot fall back to a shape centre.
    if blocks and blocks.get("cafc") and not blocks["cafc"].get("anchor"):
        errors.append("seat_blocks: cafc needs an explicit anchor (has_geography=false, so there "
                      "is no shape to centre its block on) — tune it in tools/tune-seat-blocks.html")
    return errors


def circuit_of(court: dict, by_id: dict) -> str | None:
    """The circuit a court's judges bundle under (circuit=self; else parent).
    SCOTUS bundles under itself — its own lazy-loaded judges/scotus.json."""
    if court["court_level"] in ("circuit", "scotus"):
        return court["court_id"]
    return court.get("parent_id")


def _version_stamp(payloads: list[bytes]) -> str:
    """Short content hash so the manifest version changes only when data changes."""
    h = hashlib.sha256()
    for p in payloads:
        h.update(p)
    return h.hexdigest()[:12]


def _list_geo_assets() -> dict:
    national = GEO / "national.svg"
    circuits = {}
    circ_dir = GEO / "circuits"
    if circ_dir.exists():
        for svg in sorted(circ_dir.glob("*.svg")):
            circuits[svg.stem] = f"assets/geo/circuits/{svg.name}"
    geo = {}
    if national.exists():
        geo["national"] = "assets/geo/national.svg"
    if circuits:
        geo["circuits"] = circuits
    return geo


def main() -> int:
    DATA.mkdir(parents=True, exist_ok=True)

    photo_thumbs = _load_photo_thumbs()
    courts = build_courts(_read_csv(COURTS_CSV))
    judges = build_judges(_read_csv(JUDGES_CSV), photo_thumbs)
    justices = [
        {
            "circuit_id": r.get("circuit_id", "").strip(),
            "justice_cl_person_id": _coerce_int(r.get("justice_cl_person_id")),
            "justice_name": r.get("justice_name", "").strip(),
            # the pane renders a justice with the judge icon, which reads full_name for the
            # image alt text and the initials fallback
            "full_name": r.get("justice_name", "").strip(),
            "assignment_start_date": _nullable(r.get("assignment_start_date")),
            "photo_url": _nullable(r.get("photo_url")),
            "photo_thumb": photo_thumbs.get(r.get("photo_url", "").strip()),
            "photo_source": _nullable(r.get("photo_source")),
            "photo_license": _nullable(r.get("photo_license")),
            "source_url": _nullable(r.get("source_url")),
            "notes": _nullable(r.get("notes")),
        }
        for r in _read_csv(CIRCUIT_JUSTICES_CSV)
    ]

    # (validation runs further down, once the seat blocks are derived — it checks those too)

    payloads: list[bytes] = []

    # courts.json — national view loads only this (+ national.svg).
    courts_json = json.dumps(courts, indent=2).encode("utf-8")
    (DATA / "courts.json").write_bytes(courts_json)
    payloads.append(courts_json)

    # Per-circuit judge bundles — lazy-loaded on drill-in (a circuit + its districts).
    by_id = {c["court_id"]: c for c in courts}
    judge_files: dict[str, str] = {}
    if judges:
        bundles: dict[str, list[dict]] = {}
        for j in judges:
            circ = circuit_of(by_id[j["court_id"]], by_id)
            bundles.setdefault(circ, []).append(j)
        (DATA / "judges").mkdir(exist_ok=True)
        for circ, recs in sorted(bundles.items()):
            recs.sort(key=lambda r: (r.get("commission_date") or ""))  # oldest->newest
            data = json.dumps(recs, indent=2).encode("utf-8")
            (DATA / "judges" / f"{circ}.json").write_bytes(data)
            judge_files[circ] = f"data/judges/{circ}.json"
            payloads.append(data)

    # seat_blocks.json — the little square-block map annotation (one square per authorized
    # judgeship). Derived HERE rather than read from the judge bundles at runtime because the
    # national view must stay lazy (courts.json + national.svg only, CLAUDE.md §6): it shows a
    # block for all 13 circuits, and loading 13 judge bundles to colour them would defeat that.
    # Squares are grouped by colour, so per-court COUNTS are all the runtime needs.
    blocks_file = None
    blocks = build_seat_blocks(courts, judges, _read_csv(SEAT_BLOCKS_CSV))
    errors = validate(courts, judges, justices, blocks)
    if errors:
        print("[build_assets] VALIDATION FAILED:", file=sys.stderr)
        for e in errors:
            print(f"  - {e}", file=sys.stderr)
        return 1
    if blocks:
        data = json.dumps(blocks, indent=2).encode("utf-8")
        (DATA / "seat_blocks.json").write_bytes(data)
        blocks_file = "data/seat_blocks.json"
        payloads.append(data)

    # appointments.json — historical appointment events since Nixon (collect_appointments.py),
    # for the future beeswarm feature. Lazy-loaded; nothing in the current widget reads it.
    appts_file = None
    appts_csv = DATA / "appointments.csv"
    if appts_csv.exists():
        appts = _read_csv(appts_csv)
        for a in appts:
            a["photo_thumb"] = photo_thumbs.get(a.get("photo_url", "").strip())
        bad = [a for a in appts
               if a.get("appointing_president")
               and not a["appointing_president"].startswith("None")
               and a.get("president_party") not in ("Republican", "Democratic")]
        if bad:
            print(f"[build_assets] WARNING: {len(bad)} appointment rows with a president but no "
                  f"R/D party (first: {bad[0]['full_name']})", file=sys.stderr)
        data = json.dumps(appts, indent=1).encode("utf-8")
        (DATA / "appointments.json").write_bytes(data)
        appts_file = "data/appointments.json"
        payloads.append(data)

    # circuit_justices.json — small, separately loaded.
    justices_file = None
    if justices:
        data = json.dumps(justices, indent=2).encode("utf-8")
        (DATA / "circuit_justices.json").write_bytes(data)
        justices_file = "data/circuit_justices.json"
        payloads.append(data)

    # president_photos.json — keyed by the exact `name` string in embed/presidencies.js, for
    # the Change-view drag-bar icons and the beeswarm's presidency-band label icon.
    pres_photos_file = None
    if PRESIDENT_PHOTOS_CSV.exists():
        pres_photos = {
            r["president_name"]: {
                "photo_url": _nullable(r.get("photo_url")),
                "photo_thumb": photo_thumbs.get(r.get("photo_url", "").strip()),
                "photo_source": _nullable(r.get("photo_source")),
                "photo_license": _nullable(r.get("photo_license")),
            }
            for r in _read_csv(PRESIDENT_PHOTOS_CSV)
        }
        data = json.dumps(pres_photos, indent=2).encode("utf-8")
        (DATA / "president_photos.json").write_bytes(data)
        pres_photos_file = "data/president_photos.json"
        payloads.append(data)

    files: dict = {"courts": "data/courts.json"}
    if judge_files:
        files["judges"] = judge_files
    if justices_file:
        files["circuit_justices"] = justices_file
    if blocks_file:
        files["seat_blocks"] = blocks_file
    if appts_file:
        files["appointments"] = appts_file
    if pres_photos_file:
        files["president_photos"] = pres_photos_file
    if _list_geo_assets():
        files["geo"] = _list_geo_assets()

    # Fold geometry bytes into the version so a boundary-only update busts caches too
    # (data-only updates must be publishable by re-running this alone — CLAUDE.md §6).
    for svg in sorted(GEO.rglob("*.svg")):
        payloads.append(svg.read_bytes())

    # Same for cached photo thumbnails — fold in (name, size) rather than full bytes (these
    # can number in the thousands; reading every JPEG just to version-stamp is wasteful, and
    # a re-run of scripts/cache_photos.py that changes the resize formula always changes size).
    photos_dir = ROOT / "assets" / "photos"
    if photos_dir.exists():
        for jpg in sorted(photos_dir.glob("*.jpg")):
            payloads.append(f"{jpg.name}:{jpg.stat().st_size}".encode("utf-8"))

    version = _version_stamp(payloads)
    # The most recent judgeship START date in the data (commission_date is this project's
    # established "start of judgeship" field - CLAUDE.md §5 already sorts icons by it). Distinct
    # from `generated` (when this build ran): this tracks the data's own content, so it only
    # advances when a collection sweep actually lands a new appointment.
    last_appointment = max((j.get("commission_date") for j in judges if j.get("commission_date")),
                           default=None)
    manifest = {
        "schema": "court-tracker/manifest@1",
        "version": version,
        "generated": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "last_appointment": last_appointment,
        "counts": {
            "courts": len(courts),
            "circuits": sum(1 for c in courts if c["court_level"] == "circuit"),
            "districts": sum(1 for c in courts if c["court_level"] == "district"),
            "specialized": sum(1 for c in courts if c["court_level"] == "specialized"),
            "judges": len(judges),
            "photo_thumbs": len(photo_thumbs),
        },
        "files": files,
        "sources": {
            "courts_csv": COURTS_CSV.exists(),
            "judges_csv": JUDGES_CSV.exists(),
            "circuit_justices_csv": CIRCUIT_JUSTICES_CSV.exists(),
        },
    }
    (DATA / "manifest.json").write_bytes(json.dumps(manifest, indent=2).encode("utf-8"))

    print(f"[build_assets] wrote manifest.json (version {version}); "
          f"{len(courts)} courts, {len(judges)} judges in {len(judge_files)} bundle(s), "
          f"geo={'yes' if _list_geo_assets() else 'placeholder/none'}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
