"""
QGIS Python-console export template — federal court geometry.

NOTE: docs/GEOMETRY_PRODUCTION_PROMPT.md is authoritative and more complete than this stub — a
separate web-Claude session turns this into the finished qgis_export.py. Key points that stub misses:
use a TOPOLOGY-PRESERVING simplify (GRASS v.generalize / mapshaper) so adjacent districts don't split
into slivers; the simplify-once rule applies only to the morphing CONUS mainland (insets simplify
independently in their own CRS); insets are baked in as data-inset paths, not separate files.

Run inside QGIS (Plugins > Python Console). This is a STARTER the operator adapts; its job is to
encode the one invariant that makes morphing work:

    SIMPLIFY ONCE, EXPORT TWICE.
    Simplify each district a single time in a common CRS, then reproject the ALREADY-SIMPLIFIED
    geometry into (a) the national projection and (b) each circuit-local projection. Never simplify
    per-projection. See docs/GEOMETRY_CONTRACT.md.

Output SVGs must follow the path conventions in GEOMETRY_CONTRACT.md:
- absolute M/L commands only (no curves, no relative), one <path> per shape,
- id = geometry_key, plus data-court-id / data-parent-circuit / data-layer,
- viewBox in projected units, a scale(1,-1) translate(...) Y-flip group,
- no inline styling.

Pseudocode-level template — fill in layer names, CRS EPSG codes, county→district crosswalk,
per-circuit local CRS, and tune SIMPLIFY_TOLERANCE for your target vertex budget.
"""

from qgis.core import (
    QgsVectorLayer, QgsCoordinateReferenceSystem, QgsCoordinateTransform,
    QgsProject, QgsFeature, QgsGeometry,
)

# --- Config -------------------------------------------------------------------
COUNTY_LAYER   = "us_counties"          # TIGER counties, loaded in the project
CROSSWALK      = "county_to_district"   # table: county FIPS -> district court_id
COMMON_CRS     = "EPSG:5070"            # US Albers Equal Area — simplify in this CRS ONCE
NATIONAL_CRS   = "EPSG:5070"            # national display projection (compose AK/HI/PR as insets separately)
LOCAL_CRS      = {                      # circuit court_id -> circuit-local EPSG (best-looking local proj)
    # "ca8": "EPSG:26915",  # example: UTM 15N-ish region; choose per circuit
}
SIMPLIFY_TOLERANCE = 500.0              # metres in COMMON_CRS; raise to shed vertices, lower for detail
OUT_DIR = "/path/to/court-tracker/assets/geo"

# --- Step 1: dissolve counties into districts (in COMMON_CRS) ------------------
# 1a. Join counties to district court_id via CROSSWALK.
# 1b. Dissolve by court_id  -> district polygons.
# 1c. Dissolve districts by parent circuit -> circuit outlines (SAME vertices).
# (Use processing.run("native:dissolve", ...) with FIELD set appropriately.)

# --- Step 2: SIMPLIFY ONCE (in COMMON_CRS) ------------------------------------
# processing.run("native:simplifygeometries", {
#     "INPUT": districts, "METHOD": 0, "TOLERANCE": SIMPLIFY_TOLERANCE, "OUTPUT": "memory:"
# })
# Keep the simplified layer as the single source of truth for BOTH exports below.
# Re-dissolve circuit outlines from the SIMPLIFIED districts so borders share vertices.

# --- Step 3: reproject + emit SVG (twice) -------------------------------------
def geom_to_svg_path(geom: QgsGeometry) -> str:
    """Emit absolute M/L path data for a (multi)polygon. One subpath per ring/part."""
    parts = geom.asMultiPolygon() if geom.isMultipart() else [geom.asPolygon()]
    out = []
    for poly in parts:
        for ring in poly:
            pts = list(ring)
            if not pts:
                continue
            d = "M {:.1f},{:.1f} ".format(pts[0].x(), pts[0].y())
            d += " ".join("L {:.1f},{:.1f}".format(p.x(), p.y()) for p in pts[1:])
            out.append(d)
    return " ".join(out)

def reproject(geom, src_crs, dst_crs):
    tr = QgsCoordinateTransform(
        QgsCoordinateReferenceSystem(src_crs),
        QgsCoordinateReferenceSystem(dst_crs),
        QgsProject.instance(),
    )
    g = QgsGeometry(geom)
    g.transform(tr)
    return g

def write_svg(path, shapes, crs):
    """shapes: list of dicts {id, court_id, parent_circuit, layer, geom(already in `crs`)}.
    Computes a shared viewBox and writes the Y-flip group."""
    # 1) compute bounds across shapes -> minx,miny,w,h  (viewBox in projected units)
    # 2) yflip offset = 2*maxy  (so scale(1,-1) translate(0,-2*maxy) maps geo-up to screen-down)
    # 3) write <svg viewBox="minx miny w h"><g transform="scale(1,-1) translate(0,-{2*maxy})">
    #        <path id=".." data-court-id=".." data-parent-circuit=".." data-layer=".." d=".."/>...
    #    </g></svg>
    raise NotImplementedError("fill in per GEOMETRY_CONTRACT.md")

# National: all districts + all circuit outlines, reprojected COMMON_CRS -> NATIONAL_CRS
# write_svg(f"{OUT_DIR}/national.svg", national_shapes, NATIONAL_CRS)

# Per circuit: that circuit's districts, reprojected COMMON_CRS -> LOCAL_CRS[circuit],
# SAME feature order as in national so vertex correspondence holds:
# for circuit_id, crs in LOCAL_CRS.items():
#     write_svg(f"{OUT_DIR}/circuits/{circuit_id}.svg", districts_of(circuit_id), crs)

# Insets (AK/HI/PR): export from their own local CRS into assets/geo/insets/<id>.svg.
# These do NOT need vertex correspondence (no morph).
