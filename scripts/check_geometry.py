#!/usr/bin/env python3
"""check_geometry.py — validate shipped assets/geo against docs/GEOMETRY_CONTRACT.md.

Read-only. Checks:
  - national.svg is well-formed; viewBox present; Y-flip group present.
  - path conventions: id==data-court-id, data-layer in {district,circuit}, districts have
    data-parent-circuit, path data is absolute M/L only (no curves/relative/Z).
  - coverage: every geographic court in courts.csv has a path; circuits present; no cafc geometry.
  - insets: the six inset districts (+ dcd callout) carry data-inset="true".
  - MORPH INVARIANT: for each non-inset district, national vs circuit-local SUBPATH STRUCTURE
    matches (subpath count + per-subpath vertex counts) — equal totals are not enough, since
    the app interpolates subpath-by-subpath and point-by-point.
  - per-circuit files exist for ca1-ca11, cadc (not cafc).
"""
from __future__ import annotations
import csv
import re
import sys
import xml.etree.ElementTree as ET
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
GEO = ROOT / "assets" / "geo"
NS = "{http://www.w3.org/2000/svg}"

INSET_DISTRICTS = {"akd", "hid", "prd", "gud", "nmid", "vid"}
GEOM_CIRCUITS = ["ca1", "ca2", "ca3", "ca4", "ca5", "ca6", "ca7", "ca8", "ca9", "ca10", "ca11", "cadc"]

errors: list[str] = []
warns: list[str] = []


def load_courts() -> dict:
    with (ROOT / "data" / "courts.csv").open(encoding="utf-8") as fh:
        return {r["court_id"]: r for r in csv.DictReader(fh)}


def subpath_structure(d: str):
    """[vertex count per subpath] — what the app's morph actually pairs up. Multipolygons
    (islands/exclaves) must keep the same subpath order AND the same points in each, so a
    matching grand total is not sufficient."""
    subs, n = [], 0
    for cmd in re.findall(r"[MLZz]", d):
        if cmd == "M":
            subs.append(n); n = 1
        elif cmd == "L":
            n += 1
    subs.append(n)
    return subs[1:]  # drop the leading 0 before the first M


def parse_paths(svg_path: Path):
    """Return {id: {'layer','parent','inset','d','nverts','court_id'}} for all <path>."""
    tree = ET.parse(svg_path)
    root = tree.getroot()
    if not root.get("viewBox"):
        errors.append(f"{svg_path.name}: missing viewBox")
    g = root.find(f"{NS}g")
    if g is None or not (g.get("transform") or "").startswith("scale(1,-1)"):
        errors.append(f"{svg_path.name}: missing Y-flip <g transform='scale(1,-1) …'>")
    out = {}
    for p in root.iter(f"{NS}path"):
        pid = p.get("id")
        d = p.get("d") or ""
        rec = {
            "layer": p.get("data-layer"),
            "parent": p.get("data-parent-circuit"),
            "inset": (p.get("data-inset") == "true"),
            "court_id": p.get("data-court-id"),
            "nverts": len(re.findall(r"[ML]", d)),
            "structure": subpath_structure(d),
            "d": d,
        }
        if pid is None:
            errors.append(f"{svg_path.name}: <path> without id")
            continue
        if rec["court_id"] != pid:
            errors.append(f"{svg_path.name}#{pid}: data-court-id != id ({rec['court_id']})")
        if rec["layer"] not in ("district", "circuit"):
            errors.append(f"{svg_path.name}#{pid}: bad data-layer {rec['layer']!r}")
        if re.search(r"[CcSsQqTtAaHhVvZz]|[ml]", d):
            errors.append(f"{svg_path.name}#{pid}: path data must be absolute M/L only")
        out[pid] = rec
    return out


def main() -> int:
    courts = load_courts()
    if not (GEO / "national.svg").exists():
        errors.append("assets/geo/national.svg missing")
        return report()

    nat = parse_paths(GEO / "national.svg")
    nat_districts = {k: v for k, v in nat.items() if v["layer"] == "district"}
    nat_circuits = {k: v for k, v in nat.items() if v["layer"] == "circuit"}

    # Coverage: every has_geography court present; no cafc; circuits all present.
    geo_courts = {cid: c for cid, c in courts.items() if c["has_geography"] == "true"}
    for cid, c in geo_courts.items():
        if c["court_level"] == "circuit":
            if cid not in nat_circuits:
                errors.append(f"national.svg: missing circuit path {cid}")
        elif c["court_level"] == "district":
            if cid not in nat_districts:
                errors.append(f"national.svg: missing district path {cid}")
    if "cafc" in nat:
        errors.append("national.svg: cafc must have NO geometry")

    # Inset flags
    for cid in INSET_DISTRICTS:
        if cid in nat and not nat[cid]["inset"]:
            errors.append(f"national.svg#{cid}: inset district missing data-inset='true'")
    if "dcd" in nat and not nat["dcd"]["inset"]:
        warns.append("national.svg#dcd: expected data-inset='true' (magnified callout)")

    # parent-circuit correctness on districts
    for cid, v in nat_districts.items():
        want = courts.get(cid, {}).get("parent_id")
        if v["parent"] != want:
            errors.append(f"national.svg#{cid}: data-parent-circuit {v['parent']!r} != {want!r}")

    # Per-circuit files + MORPH INVARIANT (vertex parity, non-inset districts)
    print("Per-circuit vertex-parity (national vs circuit-local):")
    for circ in GEOM_CIRCUITS:
        f = GEO / "circuits" / f"{circ}.svg"
        if not f.exists():
            errors.append(f"missing circuits/{circ}.svg")
            continue
        loc = parse_paths(f)
        loc_d = {k: v for k, v in loc.items() if v["layer"] == "district"}
        mism, ok = [], 0
        for cid, lv in loc_d.items():
            if lv["inset"]:
                continue
            nv = nat_districts.get(cid)
            if nv is None:
                errors.append(f"circuits/{circ}.svg: district {cid} absent from national.svg")
                continue
            if nv["structure"] != lv["structure"]:
                if nv["nverts"] == lv["nverts"]:
                    # equal totals but different subpath split: exactly the case a
                    # count-only check would wave through and the morph would then reject
                    mism.append(f"{cid}(same total {nv['nverts']}, subpaths "
                                f"{nv['structure']} vs {lv['structure']})")
                else:
                    mism.append(f"{cid}(nat {nv['nverts']} vs loc {lv['nverts']} verts)")
            else:
                ok += 1
        tag = "OK" if not mism else "MORPH-FALLBACK"
        print(f"  {circ:5} {len(loc_d):3} districts  parity-ok={ok:3}  {tag}"
              + (("  mismatches: " + ", ".join(mism[:6]) + (" …" if len(mism) > 6 else "")) if mism else ""))
        if mism:
            warns.append(f"{circ}: {len(mism)} district(s) fail vertex parity -> morph falls back to zoom")
    if (GEO / "circuits" / "cafc.svg").exists():
        errors.append("circuits/cafc.svg must NOT exist (Federal Circuit has no geography)")

    return report()


def report() -> int:
    print()
    for w in warns:
        print(f"WARN: {w}")
    if errors:
        print(f"\nFAIL — {len(errors)} error(s):")
        for e in errors:
            print(f"  - {e}")
        return 1
    print(f"\nPASS — geometry conforms to contract ({len(warns)} warning(s)).")
    return 0


if __name__ == "__main__":
    sys.exit(main())
