#!/usr/bin/env python3
"""Converts an operator-authored "district-block/circuit-linked@2" round-trip export (the raw
format tools/district-block-builder.html's linker exports/imports while editing — ownership +
click-order per cell, colors never stored) into the same frozen "district-block/arrangement@1"
per-circuit shape data/district_arrangement.json itself uses (cell_colors baked in against the
CURRENT data/seat_blocks.json, per that file's own "colors are frozen at export time" contract —
see build_assets.py's check_district_arrangement_drift()).

Ports tools/district-block-builder.html's own resolvedCellColors()/colorForCell()/rankOf()/
colorSequence() algorithm exactly (same file, same functions, read 2026-09-10) rather than
inventing a new one, so a re-run here always agrees with what the tool itself would produce.

Background (operator, 2026-09-10): the 1st and 3rd Circuit district-block sub-assemblies used in
the circuit-drill-in view were built with PR/VI positioned relative to EACH OTHER (a cross-circuit
layout choice, for the deployed/Summary-preview cartogram), which doesn't read sensibly for a
single circuit's OWN sub-assembly. This alternate arrangement repositions PR/VI closer to the rest
of their own circuit; data/district_arrangement_alt.json is consumed ONLY by the drill-in
sub-assembly (see renderDistrictSubassembly in embed/court-tracker.js) — the deployed national
overlay and the Summary preview keep using the original data/district_arrangement.json.

Usage: python3 scripts/build_district_arrangement_alt.py [source.txt] [-o output.json]
Source defaults to temp_alt_ca1_ca3.txt at the repo root (left untouched — this only reads it).
"""
import argparse
import json
import re
import sys
from pathlib import Path

REPO = Path(__file__).resolve().parent.parent


def color_sequence(seat_blocks, district_id):
    b = seat_blocks.get(district_id, {})
    seq = []
    seq += ["r"] * (b.get("r") or 0)
    seq += ["o"] * (b.get("o") or 0)
    seq += ["d"] * (b.get("d") or 0)
    seq += ["vacant"] * (b.get("vacancies") or 0)
    return seq


def axis_of(direction):
    return "v" if direction in ("up", "down") else "h"


def sort_by_reading_order(cells, primary, secondary):
    p_axis = axis_of(primary)
    line_axis = "h" if p_axis == "v" else "v"
    primary_sign = 1 if primary in ("down", "right") else -1
    secondary_sign = 1
    if secondary and axis_of(secondary) == line_axis:
        secondary_sign = 1 if secondary in ("down", "right") else -1
    line_key = (lambda c: c[0]) if line_axis == "v" else (lambda c: c[1])
    sweep_key = (lambda c: c[0]) if p_axis == "v" else (lambda c: c[1])
    return sorted(cells, key=lambda c: (line_key(c) * secondary_sign, sweep_key(c) * primary_sign))


def parse_key(key):
    r, c = key.split(",")
    return int(r), int(c)


def resolve_circuit_colors(entry, seat_blocks):
    """entry: the raw circuit-linked@2 object (schema, circuit_id, matrix, cell_district,
    cell_order, districts). Returns {cell_key: color} exactly as the tool's own
    resolvedCellColors() would, for every owned cell."""
    cell_district = entry["cell_district"]
    cell_order = entry.get("cell_order", {})
    districts_meta = entry.get("districts", {})

    # Group owned cell keys by their district.
    by_district = {}
    for key, did in cell_district.items():
        by_district.setdefault(did, []).append(key)

    ranks = {}  # cell_key -> 1-based rank within its district
    for did, keys in by_district.items():
        meta = districts_meta.get(did, {})
        o1, o2 = meta.get("order1") or "", meta.get("order2") or ""
        if o1 and o2:
            cells = [parse_key(k) for k in keys]
            sorted_cells = sort_by_reading_order(cells, o1, o2)
            key_by_cell = {c: k for c, k in zip((parse_key(k) for k in keys), keys)}
            for i, c in enumerate(sorted_cells):
                ranks[key_by_cell[c]] = i + 1
        else:
            for k in keys:
                order = cell_order.get(k)
                if order is None:
                    raise ValueError(f"{entry['circuit_id']}: cell {k} (district {did}) has no "
                                      f"cell_order and no order1/order2 override — can't rank it")
                ranks[k] = order

    colors = {}
    seq_cache = {}
    for key, did in cell_district.items():
        seq = seq_cache.setdefault(did, color_sequence(seat_blocks, did))
        rank = ranks[key]
        colors[key] = seq[rank - 1] if 0 < rank <= len(seq) else "o"
    return colors


def load_concatenated_json_objects(text):
    """temp_alt_ca1_ca3.txt is two top-level JSON objects back-to-back, not an array — not
    valid JSON on its own. json.JSONDecoder.raw_decode walks the string and stops at the end of
    each object, so this splits them out without needing to touch the source file's own format."""
    decoder = json.JSONDecoder()
    objs = []
    idx = 0
    text_stripped = text
    while True:
        m = re.compile(r"\S").search(text_stripped, idx)
        if not m:
            break
        obj, end = decoder.raw_decode(text_stripped, m.start())
        objs.append(obj)
        idx = end
    return objs


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("source", nargs="?", default=str(REPO / "temp_alt_ca1_ca3.txt"))
    ap.add_argument("-o", "--output", default=str(REPO / "data" / "district_arrangement_alt.json"))
    ap.add_argument("--seat-blocks", default=str(REPO / "data" / "seat_blocks.json"))
    args = ap.parse_args()

    source_text = Path(args.source).read_text(encoding="utf-8")
    seat_blocks = json.loads(Path(args.seat_blocks).read_text(encoding="utf-8"))
    raw_entries = load_concatenated_json_objects(source_text)
    if not raw_entries:
        sys.exit(f"no JSON objects found in {args.source}")

    circuits_out = []
    for entry in raw_entries:
        if entry.get("schema") != "district-block/circuit-linked@2":
            sys.exit(f"{entry.get('circuit_id')}: unexpected schema {entry.get('schema')!r}")
        colors = resolve_circuit_colors(entry, seat_blocks)
        # offset is only ever used to normalize MULTIPLE circuits into one shared coordinate
        # space (buildDistrictCartogramSVG); the drill-in sub-assembly always renders exactly one
        # circuit at a time (filterCircuitId), which self-normalizes regardless of offset's
        # value — [0, 0] is correct, not a placeholder.
        circuits_out.append({
            "circuit_id": entry["circuit_id"],
            "offset": [0, 0],
            "matrix": entry["matrix"],
            "cell_colors": colors,
            "cell_district": entry["cell_district"],
        })

    out = {"schema": "district-block/arrangement@1", "circuits": circuits_out}
    Path(args.output).write_text(json.dumps(out, indent=2) + "\n", encoding="utf-8")

    for entry, circuit_out in zip(raw_entries, circuits_out):
        cid = entry["circuit_id"]
        by_district = {}
        for key, did in entry["cell_district"].items():
            by_district.setdefault(did, 0)
            by_district[did] += 1
        for did, cell_count in sorted(by_district.items()):
            total = seat_blocks.get(did, {}).get("total")
            flag = "" if total == cell_count else f"  <-- MISMATCH (seat_blocks total {total})"
            print(f"{cid} {did}: {cell_count} cells{flag}")

    print(f"wrote {args.output}")


if __name__ == "__main__":
    main()
