"""
qgis_export.py — federal-court map geometry, per docs/GEOMETRY_CONTRACT.md

Run in the QGIS Python console (QGIS 4.x / GRASS 8):

    exec(open('/path/to/qgis_export.py').read())

Pipeline (canonical order — do not reorder):
    1. load TIGER county-equivalents, drop FIPS 60/74 (no Art. III district)
    2. join county -> court_id via county_to_district.csv (key = GEOID)
    3. dissolve #1: counties -> districts          [CONUS reprojected to EPSG:5070]
    4. simplify ONCE, topology-preserving          [GRASS v.generalize, type=area]
    5. dissolve #2: simplified districts -> circuit outlines
    6. export national.svg (5070 + baked insets + D.C. callout)
    7. export circuits/<id>.svg (circuit-local Albers; SAME vertex set, reprojected)
    8. validate: vertex parity, coverage, geometry health, contract conformance

THE MORPH INVARIANT: steps 3-4 happen exactly once, in one CRS. Every mainland shape
that appears in both national.svg and a circuits/*.svg is the SAME QgsGeometry object,
merely passed through a different QgsCoordinateTransform. A transform maps vertices
1:1 and never densifies, so vertex count and order are identical by construction.
Insets are exempt (they never morph) and are simplified in their own CRS.
"""

import os, csv, json, math, shutil, subprocess, tempfile
from collections import defaultdict, OrderedDict

from qgis.core import (
    QgsApplication, QgsVectorLayer, QgsProject, QgsFeature, QgsGeometry, QgsField,
    QgsCoordinateReferenceSystem, QgsCoordinateTransform, QgsPointXY,
)
from qgis.PyQt.QtCore import QVariant
from qgis.PyQt.QtGui import QTransform
import processing

# =============================================================================
# CONFIG — everything you are meant to tune lives in this block
# =============================================================================

# USE THE CARTOGRAPHIC BOUNDARY FILE, NOT tl_*_us_county.shp.
# TIGER/Line county polygons carry each county's LEGAL extent, which includes its share
# of the territorial sea and of the Great Lakes -- Michigan's Upper and Lower Peninsulas
# come out joined across Lake Michigan. The CB file is the same geography clipped to the
# shoreline, with identical GEOIDs, so county_to_district.csv joins unchanged.
# The shoreline check in validate_shoreline() will fail loudly if you point this at TIGER.
COUNTY_SHAPEFILE = "/home/stardog/claude-code/scratch/MAD_project/federal_courts/data/census/cb_2024_us_county_500k.shp"   # 2022+ vintage required
CROSSWALK_CSV  = "/home/stardog/claude-code/scratch/MAD_project/federal_courts/data/county_to_district.csv"
COURTS_CSV     = "/home/stardog/claude-code/scratch/MAD_project/federal_courts/data/courts.csv"
OUT_DIR        = "/home/stardog/claude-code/scratch/MAD_project/federal_courts/data/out/assets/geo"                # national.svg + circuits/

# --- Yellowstone (28 U.S.C. 92, 106, 131) ------------------------------------
# The ONLY sub-county carve-out we honour. Sections 92 and 106 exclude Yellowstone
# from the districts of Idaho and Montana; section 131 puts those portions into the
# District of Wyoming. wyd is 10th Circuit, mtd/idd are 9th, so this moves a circuit
# border too. ~400 km^2 of MT + ID land changes district.
#
# Boundary source: NPS "Administrative Boundaries of National Park System Units"
# (NGDA / NPS Land Resources Division). Filter to UNIT_CODE = 'YELL'.
YELLOWSTONE = True
YNP_BOUNDARY   = "/home/stardog/claude-code/scratch/MAD_project/federal_courts/data/nps/nps_boundary.shp"
YNP_UNIT_FIELD = "UNIT_CODE"
YNP_UNIT_VALUE = "YELL"
YNP_MIN_PIECE_M2 = 1_000_000.0     # discard <1 km^2 fragments (digitising noise)

# --- simplification -----------------------------------------------------------
# Douglas-Peucker threshold, in metres of EPSG:5070. The CB source is already thinned,
# so start lower than you would for raw TIGER. Tune toward the vertex budget
# (target: national.svg path data a few hundred KB).
# Which topology-preserving simplifier to use for the CONUS district layer.
#   "mapshaper" — builds an explicit arc topology, deterministic and MONOTONIC in the
#                 interval. Needs: npm install -g mapshaper
#   "grass"     — GRASS v.generalize. Kept for reference. On this dataset it fragments
#                 the district boundaries into tens of thousands of arcs, which floors the
#                 vertex count around 52k no matter the threshold and makes individual
#                 districts GROW when the tolerance is raised (wawd: 2.6k -> 4.9k going
#                 from 750 m to 1250 m). Do not trust its knob.
SIMPLIFIER = "mapshaper"

SIMPLIFY_TOLERANCE_M = 750.0     # GRASS threshold, metres (only used when SIMPLIFIER="grass")

# mapshaper settings (only used when SIMPLIFIER="mapshaper")
MAPSHAPER_BIN      = "mapshaper"
MAPSHAPER_METHOD   = "visvalingam"   # or "dp"
MAPSHAPER_INTERVAL = 750.0           # metres of EPSG:5070; monotonic — raise it to shrink
MAPSHAPER_KEEP_SHAPES = True         # stop small districts/islands collapsing to nothing

# Soft target for national.svg. The contract's "a few hundred KB" was written before anyone
# had seen a real vertex count; ~550 KB (≈150 KB gzipped) is a sane landing zone, and shape
# fidelity beats bytes. Raise the interval past the point where rid/ded/nhd/mad still look
# like themselves and you are trading a worse map for a smaller file.
SIZE_BUDGET_KB = 550

# Insets are simplified separately, with plain per-feature Douglas-Peucker rather than
# GRASS. They are standalone island districts with no neighbours, so there is no shared
# border to preserve, and the contract exempts them explicitly.
#
# Tolerance is PER INSET, because tolerance is really about how big the thing is DRAWN,
# not how big it is on the ground. Alaska is 1.5M km^2 rendered at scale=0.35 in the
# corner of the map -- roughly 400 px wide -- so metres of coastline detail are invisible
# and merely expensive. The USVI renders near life-size and wants the detail.
#
# Rule of thumb: tolerance ~= (ground width of the inset) / (its drawn width in px) x 2.
# Retune alongside the `scale` in INSET_LAYOUT_* if you change an inset's drawn size.
INSET_TOLERANCE_M = {
    "akd":  2500.0,   # ~46k vertices at 100 m -- by far the biggest thing in the file
    "hid":   250.0,
    "prd":   250.0,
    "vid":   100.0,
    "gud":   100.0,
    "nmid":  100.0,
}

# Simplify guards. Visvalingam removes vertices by triangle area, so a few percent of
# area drift on a small crinkly district is a normal artifact, not a failure. A collapse
# is a different animal -- GRASS once turned cacd into 194 km^2 of Channel Islands.
# So: warn on drift, fail on destruction.
WARN_AREA_LOSS = 0.02     #  2% — report it, keep going
MAX_AREA_LOSS  = 0.10     # 10% — this is a collapse; stop

# Open-water probe points, lon/lat in NAD83. Under TIGER/Line these fall INSIDE a county
# (counties extend to the international median line in the lakes). Under a shoreline-clipped
# CB file they fall outside every district. Each is >25 km offshore and on the U.S. side.
#
# Why probes and not an area ratio: ALAND excludes ALL water, inland included, but CB only
# clips COASTAL water. So polygon area legitimately exceeds ALAND wherever a district holds
# a lake or a bay -- Lake Pontchartrain (laed, 1.29x), Biscayne Bay (flsd), the Long Island
# lagoons (nyed), the whole of Minnesota. An area ratio cannot tell that apart from unclipped
# ocean. Point-in-polygon in the middle of Lake Michigan can.
#
# No ocean probe: the territorial sea is only 3 nmi (~5.5 km) wide, so an offshore probe
# would sit within the coastline's own digitising error. The Great Lakes are unambiguous.
WATER_PROBES = [
    ("Lake Michigan", -87.00, 43.30),
    ("Lake Superior", -87.50, 47.40),
    ("Lake Huron",    -82.90, 44.40),
    ("Lake Erie",     -81.20, 41.90),
    ("Lake Ontario",  -77.30, 43.40),
]

# Purely advisory. Inland water pushes healthy districts to ~1.3x; a district that has
# swallowed a Great Lake or a dissolve error goes far past this.
GROSS_WATER_RATIO = 1.5

# --- coordinate output --------------------------------------------------------
COORD_DECIMALS = 0        # projected metres; 0 => integer metres (~1 m precision)

# --- CRS ----------------------------------------------------------------------
CRS_CONUS = "EPSG:5070"   # NAD83 / Conus Albers Equal Area — the common CRS

# Inset CRSs. Preferred first; fallback used if the code is missing from your build.
INSET_CRS = {
    "akd":  ["EPSG:3338"],                    # Alaska Albers
    "hid":  ["ESRI:102007"],                  # Hawaii Albers  (you confirmed present)
    "prd":  ["EPSG:32161"],                   # PR & USVI
    "vid":  ["EPSG:32161"],
    "gud":  ["EPSG:8693", "EPSG:32655"],      # NAD83(MA11) UTM 55N -> WGS84 UTM 55N
    "nmid": ["EPSG:8693", "EPSG:32655"],
}

# Circuit-local Albers. Leave a circuit as None to auto-derive from its own geometry
# (lon_0/lat_0 = centroid; lat_1/lat_2 at the 1/6 and 5/6 points of the latitude span).
# The script PRINTS every derived proj string — paste them back in here to freeze them
# once you are happy, so the geometry stops moving between runs.
CIRCUIT_PROJ = {
    "ca1": "+proj=aea +lat_1=42.1991 +lat_2=46.4076 +lat_0=44.5177 +lon_0=-70.0901 +x_0=0 +y_0=0 +datum=NAD83 +units=m +no_defs",
    "ca2": "+proj=aea +lat_1=41.2495 +lat_2=44.2632 +lat_0=43.0139 +lon_0=-74.8536 +x_0=0 +y_0=0 +datum=NAD83 +units=m +no_defs",
    "ca3": "+proj=aea +lat_1=39.0877 +lat_2=41.6334 +lat_0=40.7100 +lon_0=-77.2789 +x_0=0 +y_0=0 +datum=NAD83 +units=m +no_defs",
    "ca4": "+proj=aea +lat_1=33.4716 +lat_2=39.2054 +lat_0=36.4797 +lon_0=-79.5417 +x_0=0 +y_0=0 +datum=NAD83 +units=m +no_defs",
    "ca5": "+proj=aea +lat_1=27.6168 +lat_2=34.7237 +lat_0=31.5992 +lon_0=-97.0971 +x_0=0 +y_0=0 +datum=NAD83 +units=m +no_defs",
    "ca6": "+proj=aea +lat_1=37.1843 +lat_2=45.9896 +lat_0=40.1161 +lon_0=-85.0035 +x_0=0 +y_0=0 +datum=NAD83 +units=m +no_defs",
    "ca7": "+proj=aea +lat_1=38.6547 +lat_2=45.3925 +lat_0=41.8324 +lon_0=-88.8286 +x_0=0 +y_0=0 +datum=NAD83 +units=m +no_defs",
    "ca8": "+proj=aea +lat_1=35.7343 +lat_2=46.6543 +lat_0=42.7951 +lon_0=-96.5636 +x_0=0 +y_0=0 +datum=NAD83 +units=m +no_defs",
    "ca9": "+proj=aea +lat_1=34.2773 +lat_2=46.0573 +lat_0=41.7802 +lon_0=-115.7583 +x_0=0 +y_0=0 +datum=NAD83 +units=m +no_defs",
    "ca10": "+proj=aea +lat_1=33.6285 +lat_2=42.8129 +lat_0=38.3697 +lon_0=-104.9624 +x_0=0 +y_0=0 +datum=NAD83 +units=m +no_defs",
    "ca11": "+proj=aea +lat_1=26.2892 +lat_2=33.2643 +lat_0=31.3443 +lon_0=-84.1793 +x_0=0 +y_0=0 +datum=NAD83 +units=m +no_defs",
    "cadc": "+proj=aea +lat_1=38.8256 +lat_2=38.9612 +lat_0=38.9045 +lon_0=-77.0160 +x_0=0 +y_0=0 +datum=NAD83 +units=m +no_defs",   # D.C. is handled as a magnified callout; see INSET_LAYOUT_NATIONAL
}

# --- inset placement ---------------------------------------------------------
# Insets are laid out AUTOMATICALLY in a tray below the map body, because the right
# offset for an inset depends on its own scaled height -- which is arithmetic, not a
# thing you should be hand-tuning. You give a scale and an order; the script computes
# the offsets so nothing can land on the mainland or on a neighbour.
#
# SIZE AND POSITION ARE BOTH YOURS.
#
# Every inset -- in national.svg and in each circuit file -- is placed explicitly: you give
# a magnification and an offset in km from the centre of a named reference shape. Nothing
# is auto-fitted, auto-shrunk or auto-nudged. The script only measures the result and
# reports each unit's rendered size and its clearance to the nearest land, using
# QgsGeometry.distance() on the real polygons rather than bounding boxes.
#
# (An earlier version shrank insets to make them fit. It silently ground Alaska down to
# ~9% of its intended size, while Guam -- too small to ever collide -- came out fine.
# Placement is a cartographic judgement; the script's job is to measure, not to decide.)

# GROUPS. prd/vid share EPSG:32161 and gud/nmid share EPSG:8693, so within a pair the true
# relative geography is already intact. A group applies ONE scale and ONE offset to both
# members, so they move and resize as a unit and keep their real spacing -- while staying
# separate paths with their own court_ids, so districts remain distinguishable.
#
# A group engages only when EVERY member is present in the file being written. That gives
# the right behaviour for free: national.svg gets both groups; ca9.svg gets the Marianas
# (gud+nmid are both 9th Circuit); ca1.svg and ca3.svg fall back to placing prd and vid
# individually, because those two live in different circuits.
INSET_GROUPS = {
    "caribbean": ["prd", "vid"],
    "mariana":   ["gud", "nmid"],
}
# Circuit-local groups get their scale from INSET_LAYOUT_LOCAL (keyed by group name).

# ---------------------------------------------------------------------------
# CIRCUIT-LOCAL inset layout — explicit 2D placement.
#
# Each entry positions the CENTRE of a unit (one inset, or a whole group) relative to the
# CENTRE of a named reference district's bounding box, in kilometres. +dx is east, +dy is
# north. This is the vocabulary you actually think in: "off the coast of njd", "at nhd's
# coastal latitude". The downward-scan used for national.svg cannot express it.
#
# `scale` is a magnification against the circuit's own local Albers, which is in metres --
# so scale = 1.0 means the inset is drawn at the SAME real-world scale as the mainland.
#
# Nothing is auto-moved here. The script reports each unit's clearance to the mainland and
# leaves the decision to you.
INSET_LAYOUT_LOCAL = {
    "ca1": {
        # PR at true scale — it is only a little smaller than Massachusetts, so 1.0 reads
        # honestly. Parked in the Gulf of Maine, at the latitude of the NH coast.
        "prd": dict(scale=1.00, ref="nhd", dx_km=320, dy_km=-150),
    },
    "ca3": {
        # VI off the New Jersey coast. Costs some squareness; worth it.
        "vid": dict(scale=2.00, ref="njd", dx_km=150, dy_km=90),
    },
    "ca9": {
        # Alaska offshore of OR/WA — the upper half of the Pacific coastline.
        "akd":     dict(scale=0.50, ref="ord",  dx_km=-1400, dy_km=100),
        # Hawaii nearer California, the Marianas further west: their real arrangement.
        "hid":     dict(scale=1.00, ref="cacd", dx_km=-900,  dy_km=200),
        "mariana": dict(scale=3.00, ref="cacd", dx_km=-1700, dy_km=200),
    },
}

# ---------------------------------------------------------------------------
# NATIONAL inset layout — same vocabulary, and `ref` may name a CIRCUIT as well as a
# district, since at national scale a circuit is the landmark you actually steer by.
#
# THE dx_km/dy_km BELOW ARE ESTIMATES. I have not seen your rendered map. Every run logs
# each reference's bbox centre and extent in km (see "reference frames" in the output), so
# you can read off the offsets you want rather than hunting for them.
INSET_LAYOUT_NATIONAL = {
    "akd":       dict(scale=0.55, ref="ca5", dx_km=-1350,  dy_km=-550),
    "hid":       dict(scale=1.00, ref="ca11", dx_km=-200,   dy_km=-600),
    "mariana":   dict(scale=3.00, ref="ca5", dx_km=400,  dy_km=-700),
    "caribbean": dict(scale=1.50, ref="ca3", dx_km=650,   dy_km=-100),
    "dcd":       dict(scale=10.0, ref="ca4", dx_km=700,   dy_km=50),
}

INSET_SCALE_LOCAL = {      # fallback for any inset with no INSET_LAYOUT_LOCAL entry
    "akd":  0.50, "hid": 1.30, "prd": 1.20, "vid": 6.00, "gud": 4.00, "nmid": 4.00,
}




# Drop tiny outlying parts before placing. Two districts have bounding boxes made almost
# entirely of empty ocean, so scaling them "to fit" scales the emptiness and the land you
# actually want to see stays sub-pixel:
#
#   hid  — the District of Hawaii includes the NORTHWESTERN Hawaiian Islands (Nihoa,
#          Necker, French Frigate Shoals, Laysan, Lisianski, Kure), which are part of
#          Honolulu County. That stretches hid's bbox to ~2,400 km with the eight main
#          islands crammed at its eastern end -- which is why Hawaii kept landing off
#          Florida: the script anchors by the LEFT edge, and the left edge was an atoll
#          2,000 km away. Keep the 8 main islands.
#   nmid — the Marianas chain spans ~750 km; its islands are 3-20 km across. Keep the 3
#          populated ones (Saipan, Tinian, Rota) and drop the uninhabited volcanic islets.
#
# Both are what published maps do. Set a value to None to keep everything.
INSET_KEEP_PARTS = {"hid": 8, "nmid": 3}

INSET_SCALE_LOCAL = {          # inside each circuit's own (much smaller) canvas
    "akd":  0.30,
    "hid":  0.80,
    "prd":  1.00,
    "vid":  1.00,
    "gud":  2.00,
    "nmid": 2.00,
}
# D.C. callout: magnify dcd (kept in 5070) and park it OFFSHORE, in the Atlantic east of
# the Delmarva. Given as fractions of the CONUS bbox so it survives a change of interval
# (absolute metres drift when the bbox does). x_frac/y_frac position its bottom-left
# corner. Its clearance is measured and reported like every other inset.
# circuits/cadc.svg is just D.C., magnified to fill its own canvas.
CADC_LOCAL_SCALE = 12.0

# --- inventory ---------------------------------------------------------------
GEOGRAPHIC_CIRCUITS = ["ca1","ca2","ca3","ca4","ca5","ca6","ca7","ca8","ca9","ca10","ca11","cadc"]
NO_GEOMETRY = {"cafc", "cit", "uscfc"}          # never appear on the map
INSET_DISTRICTS = {"akd","hid","prd","gud","nmid","vid"}   # exempt from the morph
CALLOUT_DISTRICTS = {"dcd"}                     # in national.svg only
NO_DISTRICT_STATEFP = {"60", "74"}              # American Samoa, U.S. Minor Outlying Is.


# =============================================================================
# helpers
# =============================================================================

def log(msg):
    print(f"[geo] {msg}")


def resolve_crs(codes):
    """First CRS in `codes` that exists in this QGIS build."""
    for code in codes:
        crs = QgsCoordinateReferenceSystem(code)
        if crs.isValid():
            return crs
    raise RuntimeError(f"none of {codes} are available in this QGIS build")


def transform(src_crs, dst_crs):
    return QgsCoordinateTransform(src_crs, dst_crs, QgsProject.instance())


def grass_generalize_alg():
    """QGIS 4 ships GRASS 8 as 'grass:'; QGIS 3 used 'grass7:'. Accept either."""
    ids = [a.id() for a in QgsApplication.processingRegistry().algorithms()]
    for candidate in ("grass:v.generalize", "grass7:v.generalize"):
        if candidate in ids:
            return candidate
    raise RuntimeError(
        "GRASS v.generalize not found in the Processing registry. QGIS's native "
        "Simplify is per-feature and WILL crack shared district borders — do not "
        "substitute it. See GEOMETRY_STEPS.md for the mapshaper fallback."
    )


def mem_layer(name, crs, fields, features):
    """Build an in-memory polygon layer. Custom Albers CRSs have no authid, so fall
    back to the proj string."""
    uri = f"MultiPolygon?crs={crs.authid() or crs.toProj()}"
    lyr = QgsVectorLayer(uri, name, "memory")
    dp = lyr.dataProvider()
    dp.addAttributes(fields)
    lyr.updateFields()
    dp.addFeatures(features)
    lyr.updateExtents()
    return lyr


def field_defs(names):
    return [QgsField(n, QVariant.String) for n in names]


# =============================================================================
# 1-2. load + join
# =============================================================================

def load_crosswalk():
    xw = {}
    with open(CROSSWALK_CSV, newline="", encoding="utf-8") as f:
        for r in csv.DictReader(f):
            xw[r["geoid"].strip().zfill(5)] = r["court_id"].strip()
    log(f"crosswalk: {len(xw)} county-equivalents")
    return xw


def load_courts():
    """district court_id -> parent circuit court_id."""
    parent = {}
    with open(COURTS_CSV, newline="", encoding="utf-8-sig") as f:
        for r in csv.DictReader(f):
            if r["court_level"].strip() == "district":
                parent[r["court_id"].strip()] = r["parent_id"].strip()
    log(f"courts: {len(parent)} districts")
    return parent


def load_counties(xw):
    """Read TIGER, drop no-district territories, attach court_id. Returns
    {court_id: [QgsGeometry in EPSG:4269 source CRS]} plus a coverage report."""
    lyr = QgsVectorLayer(COUNTY_SHAPEFILE, "counties", "ogr")
    if not lyr.isValid():
        raise RuntimeError(f"cannot open {COUNTY_SHAPEFILE}")

    groups = defaultdict(list)
    aland = defaultdict(float)     # court_id -> summed ALAND (m^2), for the shoreline check
    unmatched, skipped = [], 0
    for f in lyr.getFeatures():
        statefp = str(f["STATEFP"])
        if statefp in NO_DISTRICT_STATEFP:
            skipped += 1
            continue
        geoid = str(f["GEOID"]).zfill(5)
        court = xw.get(geoid)
        if not court:
            unmatched.append((geoid, str(f["NAME"])))
            continue
        groups[court].append(QgsGeometry(f.geometry()))
        aland[court] += float(f["ALAND"] or 0)

    total = sum(len(v) for v in groups.values())
    log(f"TIGER: {total} counties joined, {skipped} skipped (no Art. III district), "
        f"{len(unmatched)} UNMATCHED")
    if unmatched:
        log("  !! unmatched GEOIDs — your TIGER vintage does not match the crosswalk:")
        for g, n in unmatched[:20]:
            log(f"     {g}  {n}")
        log("     (crosswalk is built for a 2022+ vintage: CT planning regions, "
            "AK Chugach/Copper River, no Bedford city, no Shannon Co.)")
    return groups, lyr.crs(), unmatched, aland


# =============================================================================
# 3a. shoreline check — did you actually load the clipped file?
# =============================================================================

def validate_shoreline(districts, aland):
    """Confirm the county source is shoreline-clipped.

    Test: does any district polygon contain a point in the open Great Lakes? TIGER/Line
    counties reach the international median line, so they do. CB counties stop at the
    shore, so they don't.

    The area-vs-ALAND ratio is reported alongside, but only as a diagnostic -- ALAND
    excludes inland water that CB legitimately keeps, so a high ratio is normal for
    laed (Lake Pontchartrain), flsd (Biscayne Bay), mnd (Minnesota) and friends.
    """
    log("shoreline check:")
    xf = transform(QgsCoordinateReferenceSystem("EPSG:4269"),
                   QgsCoordinateReferenceSystem(CRS_CONUS))

    wet = []
    for name, lon, lat in WATER_PROBES:
        pt = QgsGeometry.fromPointXY(QgsPointXY(lon, lat))
        if pt.transform(xf) != 0:
            raise RuntimeError(f"could not project the {name} probe")
        for court, geom in districts.items():
            if geom.contains(pt):
                wet.append((name, court))
                break

    if wet:
        log("  !! open water is inside a district polygon — the county source is NOT")
        log("     shoreline-clipped. Use cb_*_us_county_500k.shp, not tl_*_us_county.shp.")
        for name, court in wet:
            log(f"     {name} falls inside {court}")
        raise RuntimeError(
            "county source is not shoreline-clipped; fix COUNTY_SHAPEFILE and re-run")

    log(f"  OK — all {len(WATER_PROBES)} Great Lakes probes fall outside every district")

    # advisory only
    ratios = []
    for court, geom in districts.items():
        land = aland.get(court, 0.0)
        if land > 0:
            ratios.append((geom.area() / land, court, geom.area() / 1e6, land / 1e6))
    ratios.sort(reverse=True)

    log("  inland water (polygon area vs ALAND) — high is expected for lake/bay districts:")
    for ratio, court, poly_km2, land_km2 in ratios[:5]:
        flag = "  <-- CHECK" if ratio > GROSS_WATER_RATIO else ""
        log(f"     {court:<6} {poly_km2:>10,.0f} km^2 vs land {land_km2:>10,.0f} km^2"
            f"  (x{ratio:.2f}){flag}")
    gross = [r for r in ratios if r[0] > GROSS_WATER_RATIO]
    if gross:
        log(f"  !! {len(gross)} district(s) above x{GROSS_WATER_RATIO} — too much even for")
        log("     inland water. Suspect a dissolve error; check the areas table at the end.")


# =============================================================================
# 3. dissolve #1 — counties -> districts
# =============================================================================

def dissolve_districts(groups, src_crs, dst_crs, quiet=False):
    """Union each district's counties, reprojecting to dst_crs first."""
    xf = transform(src_crs, dst_crs)
    out = OrderedDict()
    for court, geoms in groups.items():
        parts = []
        for g in geoms:
            g = QgsGeometry(g)
            if g.transform(xf) != 0:
                raise RuntimeError(f"transform failed for a county in {court}")
            parts.append(g)
        merged = QgsGeometry.unaryUnion(parts)
        merged = merged.makeValid()
        out[court] = merged
    if not quiet:
        log(f"dissolve #1: {len(out)} districts")
    return out


# =============================================================================
# 3b. Yellowstone — the one sub-county carve-out
# =============================================================================

def apply_yellowstone(districts, crs_conus):
    """Move the Idaho and Montana portions of Yellowstone NP into wyd.

    Runs AFTER dissolve #1 and BEFORE the simplify, so the redrawn mtd/idd/wyd
    borders are coherent lines by the time v.generalize sees them — and so the new
    shared arc gets simplified once, as a shared arc, like every other border.

    Sliver control: we do NOT cut wyd with the NPS polygon. We intersect the NPS
    polygon with the *TIGER-derived* mtd and idd geometries and hand those pieces to
    wyd. Every edge of the transferred piece is therefore either an NPS park edge
    (interior to MT/ID, no neighbour to disagree with) or the TIGER state line that
    mtd/idd and wyd already share exactly. No mixed-source edges, no slivers.
    """
    lyr = QgsVectorLayer(YNP_BOUNDARY, "ynp", "ogr")
    if not lyr.isValid():
        raise RuntimeError(f"cannot open {YNP_BOUNDARY}")

    parts = [QgsGeometry(f.geometry()) for f in lyr.getFeatures()
             if str(f[YNP_UNIT_FIELD]).strip().upper() == YNP_UNIT_VALUE]
    if not parts:
        raise RuntimeError(
            f"no features with {YNP_UNIT_FIELD}={YNP_UNIT_VALUE} in {YNP_BOUNDARY}")

    ynp = QgsGeometry.unaryUnion(parts).makeValid()
    xf = transform(lyr.crs(), crs_conus)
    if ynp.transform(xf) != 0:
        raise RuntimeError("could not reproject the Yellowstone boundary")
    log(f"yellowstone: NPS boundary, {ynp.area()/1e6:,.0f} km^2 total")

    transferred = []
    for court in ("mtd", "idd"):
        if court not in districts:
            continue
        piece = ynp.intersection(districts[court]).makeValid()
        if piece.isEmpty() or piece.area() < YNP_MIN_PIECE_M2:
            log(f"  {court}: no Yellowstone overlap above the noise floor — check "
                f"that {YNP_BOUNDARY} really is the park boundary")
            continue
        log(f"  {court} -> wyd: {piece.area()/1e6:,.1f} km^2")
        districts[court] = districts[court].difference(piece).makeValid()
        transferred.append(piece)

    if transferred:
        districts["wyd"] = QgsGeometry.unaryUnion(
            [districts["wyd"]] + transferred).makeValid()
        log(f"  wyd now {districts['wyd'].area()/1e6:,.0f} km^2 "
            f"(Wyoming alone is ~253,000)")
    return districts


# =============================================================================
# 4. simplify ONCE — topology-preserving
# =============================================================================

def check_no_collapse(before, after, label):
    """A simplify may shave vertices; it may not eat the shape. Compare areas."""
    fatal, drift = [], []
    for court, g0 in before.items():
        g1 = after.get(court)
        if g1 is None or g1.isEmpty():
            fatal.append((court, "VANISHED", 0.0, 0.0))
            continue
        a0, a1 = g0.area(), g1.area()
        if a0 <= 0:
            continue
        d = abs(a1 - a0) / a0
        row = (court, f"{100*(a1-a0)/a0:+.1f}%", a0 / 1e6, a1 / 1e6)
        if d > MAX_AREA_LOSS:
            fatal.append(row)
        elif d > WARN_AREA_LOSS:
            drift.append(row)

    if drift:
        log(f"  {label}: {len(drift)} shape(s) drifted >{WARN_AREA_LOSS:.0%} in area —")
        log("    normal for small, crinkly districts at an aggressive interval. Eyeball them:")
        for court, delta, a0, a1 in sorted(drift, key=lambda r: r[2])[:6]:
            log(f"     {court:<6} {a0:>10,.0f} km^2 -> {a1:>10,.0f} km^2  ({delta})")

    if fatal:
        log(f"  !! {label}: simplify COLLAPSED {len(fatal)} shape(s) —")
        for court, delta, a0, a1 in fatal:
            log(f"     {court:<6} {a0:>10,.0f} km^2 -> {a1:>10,.0f} km^2  ({delta})")
        raise RuntimeError(
            f"{label}: simplification destroyed geometry (>{MAX_AREA_LOSS:.0%} area change). "
            f"Lower the interval.")


def simplify_standalone(districts, tolerance):
    """Per-feature Douglas-Peucker, for the insets ONLY.

    No GRASS. These are island districts with no adjacent district to stay coincident
    with, so there is no topology to preserve.
    """
    out = OrderedDict()
    for court, geom in districts.items():
        g = geom.simplify(tolerance)
        out[court] = g.makeValid() if g and not g.isEmpty() else QgsGeometry(geom)
    check_no_collapse(districts, out, "insets")
    return out


def simplify_mapshaper(districts, crs):
    """Topology-preserving simplify via mapshaper.

    mapshaper converts the polygons to a shared-arc topology first, so a border between
    two districts is simplified ONCE, as one arc, and both districts inherit the identical
    result -- the same guarantee we wanted from GRASS, but with a knob that actually
    behaves: the interval is monotonic, so raising it always removes vertices.

    Coordinates stay in EPSG:5070 throughout. The intermediate GeoJSON declares no CRS
    and mapshaper treats the numbers as planar, which is exactly right for metres.
    """
    exe = shutil.which(MAPSHAPER_BIN)
    if not exe:
        raise RuntimeError(
            f"'{MAPSHAPER_BIN}' not on PATH. Install with:  npm install -g mapshaper\n"
            f"(or set SIMPLIFIER = 'grass', but read the note in the CONFIG block first)")

    tmp = tempfile.mkdtemp(prefix="geo_simplify_")
    src = os.path.join(tmp, "districts.geojson")
    dst = os.path.join(tmp, "simplified.geojson")

    fc = {"type": "FeatureCollection", "features": [
        {"type": "Feature",
         "properties": {"court_id": court},
         "geometry": json.loads(geom.asJson(1))}
        for court, geom in districts.items()
    ]}
    with open(src, "w") as f:
        json.dump(fc, f)

    cmd = [exe, src, "-simplify", f"interval={MAPSHAPER_INTERVAL}", MAPSHAPER_METHOD]
    if MAPSHAPER_KEEP_SHAPES:
        cmd.append("keep-shapes")
    cmd += ["-o", dst]

    log(f"simplify: mapshaper {MAPSHAPER_METHOD}, interval={MAPSHAPER_INTERVAL} m"
        + (", keep-shapes" if MAPSHAPER_KEEP_SHAPES else ""))
    proc = subprocess.run(cmd, capture_output=True, text=True)
    if proc.returncode != 0 or not os.path.exists(dst):
        raise RuntimeError(f"mapshaper failed:\n{proc.stderr or proc.stdout}")
    for line in (proc.stderr or "").splitlines():
        if line.strip():
            log(f"  mapshaper: {line.strip()}")

    lyr = QgsVectorLayer(dst, "simplified", "ogr")
    if not lyr.isValid():
        raise RuntimeError("could not read mapshaper output")

    out = OrderedDict()
    for f in lyr.getFeatures():
        out[str(f["court_id"])] = QgsGeometry(f.geometry())

    missing = set(districts) - set(out)
    if missing:
        raise RuntimeError(f"mapshaper dropped districts: {sorted(missing)}")

    check_no_collapse(districts, out, "CONUS")
    before = sum(count_vertices(g) for g in districts.values())
    after = sum(count_vertices(g) for g in out.values())
    log(f"simplify: {before} -> {after} vertices ({100*after/before:.1f}% kept)")
    shutil.rmtree(tmp, ignore_errors=True)
    return out


def simplify_conus(districts, crs):
    """Dispatch to the configured simplifier."""
    if SIMPLIFIER == "mapshaper":
        return simplify_mapshaper(districts, crs)
    if SIMPLIFIER == "grass":
        return simplify_topology(districts, crs, SIMPLIFY_TOLERANCE_M)
    raise RuntimeError(f"unknown SIMPLIFIER: {SIMPLIFIER!r}")


def simplify_topology(districts, crs, tolerance):
    """GRASS v.generalize (Douglas-Peucker, type=area) over the whole district layer
    at once, so shared borders are simplified as single arcs and stay coincident."""
    feats = []
    for court, geom in districts.items():
        f = QgsFeature()
        f.setGeometry(geom)
        f.setAttributes([court])
        feats.append(f)
    lyr = mem_layer("districts", crs, field_defs(["court_id"]), feats)

    alg_id = grass_generalize_alg()
    alg = QgsApplication.processingRegistry().algorithmById(alg_id)

    # What we WANT to set. GRASS parameter names drift between versions, and QGIS rejects
    # the call outright if any destination parameter is unset -- v.generalize has two
    # (`output`, plus `error` for features it could not generalize). So rather than
    # hard-coding a dict and hoping, ask the algorithm what it actually accepts.
    wanted = {
        "input": lyr,
        "type": [1],            # area
        "method": 0,            # douglas
        "threshold": tolerance,
        "look_ahead": 7,
        "reduction": 50,
        "slide": 0.5,
        "angle_thresh": 3,
        "degree_thresh": 0,
        "closeness_thresh": 0,
        "betweeness_thresh": 0,
        "alpha": 1,
        "beta": 1,
        "iterations": 1,
    }
    accepted = {p.name() for p in alg.parameterDefinitions()}
    params = {k: v for k, v in wanted.items() if k in accepted}
    dropped = sorted(set(wanted) - accepted)

    # every destination parameter must be set, whether or not we care about it
    for p in alg.destinationParameterDefinitions():
        params.setdefault(p.name(), "TEMPORARY_OUTPUT")

    log(f"simplify: {alg_id}, Douglas-Peucker, type=area, threshold={tolerance} m")
    if dropped:
        log(f"  (this GRASS build does not take: {', '.join(dropped)} — using its defaults)")
    outputs = sorted(p.name() for p in alg.destinationParameterDefinitions())
    log(f"  outputs: {', '.join(outputs)}")

    res = processing.run(alg_id, params)

    simp = res.get("output")
    if simp is None:
        raise RuntimeError(f"v.generalize returned no 'output'; got keys {sorted(res)}")
    if isinstance(simp, str):
        simp = QgsVectorLayer(simp, "simplified", "ogr")
    if not simp.isValid():
        raise RuntimeError("v.generalize produced an unreadable output layer")

    err = res.get("error")
    if isinstance(err, str):
        err = QgsVectorLayer(err, "generalize_errors", "ogr")
    if err is not None and getattr(err, "isValid", lambda: False)() and err.featureCount():
        log(f"  !! v.generalize flagged {err.featureCount()} feature(s) it could not "
            f"generalize — inspect before trusting the result")

    # GRASS has no multipart features. On import it explodes each district into separate
    # topological areas -- mainland, Santa Catalina, San Clemente -- all carrying the same
    # court_id category, and exports one feature PER PART. Reassemble them, or every
    # multipart district silently becomes whichever island came out last.
    parts = defaultdict(list)
    for f in simp.getFeatures():
        parts[str(f["court_id"])].append(QgsGeometry(f.geometry()))

    out = OrderedDict()
    repaired = []      # districts where makeValid() had to change the geometry
    for court in districts:                       # preserve the input order
        ps = parts.get(court, [])
        if not ps:
            continue
        g = ps[0] if len(ps) == 1 else QgsGeometry.unaryUnion(ps)

        # Douglas-Peucker can push a boundary across itself at high thresholds. makeValid()
        # then "repairs" it by splitting into extra rings -- which ADDS vertices. That shows
        # up as files getting BIGGER when you raise the tolerance. Catch it here rather than
        # shipping repaired geometry we think is simplified geometry.
        v_pre = count_vertices(g)
        was_invalid = not g.isGeosValid()
        g = g.makeValid()
        v_post = count_vertices(g)
        if was_invalid or v_post != v_pre:
            repaired.append((court, v_pre, v_post, v_post - v_pre))
        out[court] = g

    exploded = sum(1 for c, ps in parts.items() if len(ps) > 1)
    log(f"  reassembled {len(out)} districts from {sum(len(p) for p in parts.values())} "
        f"GRASS parts ({exploded} were multipart)")

    if repaired:
        added = sum(r[3] for r in repaired)
        log(f"  !! {len(repaired)} district(s) were INVALID after simplify and needed "
            f"makeValid(); net {added:+d} vertices")
        log("     This means Douglas-Peucker self-intersected the boundary. The geometry is")
        log("     repaired, not simplified — LOWER the tolerance rather than raise it.")
        for court, v0, v1, d in sorted(repaired, key=lambda r: -abs(r[3]))[:8]:
            log(f"     {court:<6} {v0:>6} -> {v1:>6} vertices ({d:+d})")
    else:
        log("  all districts valid straight out of v.generalize (no repair needed)")

    missing = set(districts) - set(out)
    if missing:
        raise RuntimeError(f"v.generalize dropped districts: {sorted(missing)}")

    check_no_collapse(districts, out, "CONUS")

    before = sum(count_vertices(g) for g in districts.values())
    after = sum(count_vertices(g) for g in out.values())
    log(f"simplify: {before} -> {after} vertices ({100*after/before:.1f}% kept)")
    return out


def count_vertices(geom):
    return sum(1 for _ in geom.vertices())


# =============================================================================
# 5. dissolve #2 — simplified districts -> circuit outlines
# =============================================================================

def dissolve_circuits(districts, parent):
    """Union the ALREADY-SIMPLIFIED districts, so circuit borders share vertices
    with the district borders that produced them."""
    by_circuit = defaultdict(list)
    for court, geom in districts.items():
        circ = parent.get(court)
        if circ:
            by_circuit[circ].append(geom)
    out = OrderedDict()
    for circ, geoms in by_circuit.items():
        out[circ] = QgsGeometry.unaryUnion(geoms).makeValid()
    log(f"dissolve #2: {len(out)} circuit outlines")
    return out


# =============================================================================
# projections
# =============================================================================

def derive_circuit_proj(geom, crs_from):
    """Custom Albers for a circuit: lon_0/lat_0 = centroid; standard parallels at the
    1/6 and 5/6 points of the latitude span."""
    to_geo = transform(crs_from, QgsCoordinateReferenceSystem("EPSG:4269"))
    g = QgsGeometry(geom)
    g.transform(to_geo)
    bb = g.boundingBox()
    c = g.centroid().asPoint()
    lat_min, lat_max = bb.yMinimum(), bb.yMaximum()
    span = lat_max - lat_min
    lat1 = lat_min + span / 6.0
    lat2 = lat_min + span * 5.0 / 6.0
    return (f"+proj=aea +lat_1={lat1:.4f} +lat_2={lat2:.4f} "
            f"+lat_0={c.y():.4f} +lon_0={c.x():.4f} "
            f"+x_0=0 +y_0=0 +datum=NAD83 +units=m +no_defs")


def circuit_crs(circ, circuit_geom, crs_conus):
    proj = CIRCUIT_PROJ.get(circ)
    derived = False
    if not proj:
        proj = derive_circuit_proj(circuit_geom, crs_conus)
        derived = True
    crs = QgsCoordinateReferenceSystem.fromProj(proj)
    if not crs.isValid():
        raise RuntimeError(f"invalid proj string for {circ}: {proj}")
    log(f"  {circ}: {'derived' if derived else 'pinned '} {proj}")
    return crs


# =============================================================================
# SVG emission
# =============================================================================

def geom_to_path(geom, decimals=COORD_DECIMALS):
    """Absolute M/L only. Multipolygons and holes become extra M...L... subpaths.
    Subpart order follows the geometry's own part/ring order, which is stable across
    reprojection — this is what keeps the morph 1:1."""
    parts = []
    for poly in geom.asMultiPolygon() if geom.isMultipart() else [geom.asPolygon()]:
        for ring in poly:
            if len(ring) < 3:
                continue
            # CLOSE THE RING WITH A REPEATED POINT. The contract's "no Z shorthand
            # substituting for repeated points" means exactly this: end where you started,
            # explicitly, with an L.
            #
            # A filled path is closed implicitly by SVG, so districts look fine either way.
            # A STROKED, UNFILLED path is not -- and a circuit outline is precisely that.
            # Leaving the ring open drops the final segment, giving every shape one gap at
            # wherever its start point happens to sit: the 8th Circuit's on the Missouri-
            # Oklahoma strip, and a big visible bite out of dcd, rid and mad.
            pts = list(ring)
            if pts[0] != pts[-1]:
                pts.append(pts[0])
            cmds = []
            for i, p in enumerate(pts):
                x = round(p.x(), decimals) if decimals else round(p.x())
                y = round(p.y(), decimals) if decimals else round(p.y())
                cmds.append(f"{'M' if i == 0 else 'L'}{x} {y}")
            parts.append(" ".join(cmds))
    return " ".join(parts)


def place_at(geom, scale, x, y):
    """Scale about the shape's own bbox corner, then put that corner at (x, y).

    (x, y) is the BOTTOM-LEFT of the placed shape, in the base CRS.
    """
    g = QgsGeometry(geom)
    bb = g.boundingBox()
    g.translate(-bb.xMinimum(), -bb.yMinimum())
    g.transform(QTransform.fromScale(scale, scale))   # affine; moveVertex won't take a QgsPointXY
    g.translate(x, y)
    return g


def clearance_to_land(g, districts):
    """Exact metre distance from a placed inset to the nearest mainland district.
    0.0 means it is ON land. This is the geometric test -- no bounding boxes."""
    gb = g.boundingBox()
    best, culprit = float("inf"), None
    for court, d in districts.items():
        if d.isEmpty():
            continue
        db = d.boundingBox()
        # cheap reject: if the bboxes are already further apart than our current best,
        # the polygons cannot be closer
        dx = max(0.0, max(db.xMinimum() - gb.xMaximum(), gb.xMinimum() - db.xMaximum()))
        dy = max(0.0, max(db.yMinimum() - gb.yMaximum(), gb.yMinimum() - db.yMaximum()))
        if math.hypot(dx, dy) > best:
            continue
        dist = g.distance(d)
        if dist < best:
            best, culprit = dist, court
        if best == 0.0:
            break
    return best, culprit


def keep_largest_parts(geom, n):
    """Keep only the n largest polygon parts. See INSET_KEEP_PARTS."""
    if not geom.isMultipart():
        return geom
    parts = geom.asMultiPolygon()
    scored = sorted(parts, key=lambda p: QgsGeometry.fromPolygonXY(p).area(), reverse=True)
    return QgsGeometry.fromMultiPolygonXY(scored[:n])


def place_ref(geom, ref_bb, scale, x_left, y_bottom):
    """Scale/translate `geom` using ANOTHER shape's bbox as the reference frame.

    This is what locks a group together: every member of a group is transformed against the
    group's shared bounding box, so their true relative positions and sizes survive.
    """
    g = QgsGeometry(geom)
    g.translate(-ref_bb.xMinimum(), -ref_bb.yMinimum())
    g.transform(QTransform.fromScale(scale, scale))
    g.translate(x_left, y_bottom)
    return g


def place_centred(geom, ref_bb, scale, cx, cy):
    """Scale `geom` against a shared reference bbox, then centre that bbox on (cx, cy).
    Group members all pass the same ref_bb, so their relative geography survives intact."""
    w, h = ref_bb.width() * scale, ref_bb.height() * scale
    g = QgsGeometry(geom)
    g.translate(-ref_bb.xMinimum(), -ref_bb.yMinimum())
    g.transform(QTransform.fromScale(scale, scale))
    g.translate(cx - w / 2.0, cy - h / 2.0)
    return g


def place_insets_explicit(insets, layout, districts, refs, label):
    """Explicit placement: you say where, relative to a named reference shape. Nothing moves
    on its own; the script only measures and reports.

    `refs` may hold districts AND circuit outlines — at national scale a circuit is the
    landmark you actually steer by. `districts` is what clearance is measured against
    (an inset must clear LAND; a circuit outline is not a separate thing to avoid).
    """
    trimmed = {c: (keep_largest_parts(g, INSET_KEEP_PARTS[c]) if c in INSET_KEEP_PARTS else g)
               for c, g in insets.items()}

    units, grouped = [], set()
    for gname, members in INSET_GROUPS.items():
        if gname in layout and all(m in trimmed for m in members):
            units.append((gname, {m: trimmed[m] for m in members}, layout[gname]))
            grouped.update(members)
    for c, g in trimmed.items():
        if c in grouped:
            continue
        spec = layout.get(c)
        if spec is None:   # no explicit entry: fall back to a scale and sit it below the body
            spec = dict(scale=INSET_SCALE_LOCAL[c], ref=None, dx_km=0, dy_km=0)
        units.append((c, {c: g}, spec))

    used = {u[2].get("ref") for u in units if u[2].get("ref")}
    if used:
        log(f"  reference frames ({label}) — centre and extent, km:")
        for r in sorted(used):
            g = refs.get(r)
            if g is None:
                log(f"    {r:<6} MISSING — check the `ref` name")
                continue
            b = g.boundingBox()
            log(f"    {r:<6} centre ({b.center().x()/1000:>8,.0f}, {b.center().y()/1000:>8,.0f})"
                f"   {b.width()/1000:>5,.0f} x {b.height()/1000:>5,.0f}")

    log(f"inset placement ({label}) — explicit, relative to a reference shape:")
    boxes = OrderedDict()
    for name, members, spec in units:
        body = QgsGeometry.unaryUnion(list(members.values()))
        rb = body.boundingBox()
        sc = spec["scale"]

        ref = refs.get(spec.get("ref")) if spec.get("ref") else None
        if ref is None:
            base = bbox_union(list(districts.values()))
            cx, cy = (base[0] + base[2]) / 2, base[1] - rb.height() * sc
        else:
            rbb = ref.boundingBox()
            cx = rbb.center().x() + spec.get("dx_km", 0) * 1000.0
            cy = rbb.center().y() + spec.get("dy_km", 0) * 1000.0

        probe = place_centred(body, rb, sc, cx, cy)
        dist, culprit = clearance_to_land(probe, districts)
        pb = probe.boundingBox()
        log(f"    {name:<10} x{sc:<5.2f} {pb.width()/1000:>5,.0f} x {pb.height()/1000:>5,.0f} km"
            f"  ref {str(spec.get('ref')):<5}"
            + (f"  clearance {dist/1000:>5,.0f} km from {culprit}" if dist
               else "  ON LAND — adjust dx_km/dy_km"))

        for c, g in members.items():
            boxes[c] = place_centred(g, rb, sc, cx, cy)
            if len(members) > 1:
                mb = boxes[c].boundingBox()
                log(f"      {c:<6} {mb.width()/1000:>5,.0f} x {mb.height()/1000:>5,.0f} km"
                    f"  [{name}]")
    return boxes


class Svg:
    """Collects paths, then writes a contract-conforming file."""

    def __init__(self):
        self.paths = []   # (id, layer, parent_circuit, is_inset, d)

    def add(self, court_id, layer, d, parent_circuit=None, inset=False):
        self.paths.append((court_id, layer, parent_circuit, inset, d))

    def write(self, path, min_x, min_y, max_x, max_y):
        # Round the viewBox FIRST, then derive the flip from the rounded numbers, so the
        # transform and the viewBox in the written file agree exactly. The app reads both;
        # if they disagree by a unit, every shape sits a metre off its own frame.
        vx, vy = round(min_x), round(min_y)
        w, h = round(max_x - min_x), round(max_y - min_y)

        # Y-flip per the contract: scale(1,-1) translate(0, -(minY+maxY)).
        # Emit the VALUE and let it carry its own sign. Do NOT write a "-" in front of it:
        # the circuit-local Albers projections have y_0=0 centred on the circuit, so
        # minY+maxY is routinely NEGATIVE, and "-{-10755}" emits "--10755" — which browsers
        # reject as an unparseable transform, silently dropping the flip and rendering the
        # entire circuit upside down.
        flip = -(vy + (vy + h))

        lines = [
            '<?xml version="1.0" encoding="UTF-8"?>',
            f'<svg xmlns="http://www.w3.org/2000/svg" '
            f'viewBox="{vx} {vy} {w} {h}">',
            f'  <g transform="scale(1,-1) translate(0, {flip})">',
        ]
        for layer in ("district", "circuit"):
            for cid, lyr, parent, inset, d in self.paths:
                if lyr != layer:
                    continue
                attrs = [f'id="{cid}"', f'data-court-id="{cid}"']
                if parent:
                    attrs.append(f'data-parent-circuit="{parent}"')
                attrs.append(f'data-layer="{lyr}"')
                if inset:
                    attrs.append('data-inset="true"')
                lines.append(f'    <path {" ".join(attrs)} d="{d}"/>')
        lines += ["  </g>", "</svg>", ""]
        blob = "\n".join(lines)

        # A malformed transform is invisible in the file and catastrophic in the browser:
        # the flip is dropped and the map renders upside down. Refuse to write one.
        bad = [l.strip() for l in lines if l.lstrip().startswith("<g ") and "--" in l]
        if bad:
            raise RuntimeError(f"malformed transform in {path}: {bad[0]}")

        os.makedirs(os.path.dirname(path), exist_ok=True)
        with open(path, "w", encoding="utf-8") as f:
            f.write(blob)
        size = os.path.getsize(path)
        log(f"wrote {path}  ({size/1024:.0f} KB, {len(self.paths)} paths)")
        return size


def bbox_union(geoms):
    xs0 = min(g.boundingBox().xMinimum() for g in geoms)
    ys0 = min(g.boundingBox().yMinimum() for g in geoms)
    xs1 = max(g.boundingBox().xMaximum() for g in geoms)
    ys1 = max(g.boundingBox().yMaximum() for g in geoms)
    return xs0, ys0, xs1, ys1


# =============================================================================
# main
# =============================================================================

def main():
    crs_conus = QgsCoordinateReferenceSystem(CRS_CONUS)
    xw = load_crosswalk()
    parent = load_courts()
    groups, src_crs, unmatched, aland = load_counties(xw)

    conus_groups = {c: g for c, g in groups.items()
                    if c not in INSET_DISTRICTS}
    inset_groups = {c: g for c, g in groups.items() if c in INSET_DISTRICTS}

    # --- 3, 3b, 4, 5 : the one and only simplify --------------------------------
    districts_5070 = dissolve_districts(conus_groups, src_crs, crs_conus)
    validate_shoreline(districts_5070, aland)
    if YELLOWSTONE:
        districts_5070 = apply_yellowstone(districts_5070, crs_conus)
    districts_5070 = simplify_conus(districts_5070, crs_conus)
    circuits_5070 = dissolve_circuits(districts_5070, parent)

    # --- insets: simplified independently, in their own CRS (exempt) ------------
    insets = {}
    log("insets (simplified independently, in their own CRS — they never morph):")
    for court, geoms in sorted(inset_groups.items()):
        crs = resolve_crs(INSET_CRS[court])
        tol = INSET_TOLERANCE_M[court]
        d = dissolve_districts({court: geoms}, src_crs, crs, quiet=True)
        raw = count_vertices(d[court])
        d = simplify_standalone(d, tol)
        insets[court] = d[court]
        log(f"  {court:<5} {crs.authid() or 'custom':<12} @{tol:>7,.0f} m  "
            f"{raw:>6} -> {count_vertices(insets[court]):>5} vertices, "
            f"{insets[court].area()/1e6:>9,.0f} km^2")
    log(f"  inset vertex total: {sum(count_vertices(g) for g in insets.values())}")

    # -------------------------------------------------------------------------
    # 6. national.svg
    # -------------------------------------------------------------------------
    base = bbox_union(list(districts_5070.values()))
    bx0, by0 = base[0], base[1]

    svg = Svg()
    placed = list(districts_5070.values()) + list(circuits_5070.values())

    for court, geom in districts_5070.items():
        svg.add(court, "district", geom_to_path(geom), parent.get(court))
    for circ, geom in circuits_5070.items():
        if circ == "cadc":
            continue   # emitted inside the callout, below
        svg.add(circ, "circuit", geom_to_path(geom))

    bx1, by1 = base[2], base[3]
    log(f"CONUS bbox (5070): {(bx1-bx0)/1000:,.0f} km wide x {(by1-by0)/1000:,.0f} km tall")

    # dcd rides along as a unit: it is a magnified callout, not an in-place district.
    units = dict(insets)
    if "dcd" in districts_5070:
        units["dcd"] = districts_5070["dcd"]

    refs = dict(districts_5070)
    refs.update(circuits_5070)          # circuits are usable as `ref` at national scale

    boxes = place_insets_explicit(units, INSET_LAYOUT_NATIONAL,
                                  districts_5070, refs, "national")

    for court, g in boxes.items():
        if court == "dcd":
            continue
        placed.append(g)
        svg.add(court, "district", geom_to_path(g), parent.get(court), inset=True)

    if "dcd" in boxes:
        g = boxes["dcd"]
        placed.append(g)
        # replace the in-place dcd path with the callout version
        svg.paths = [p for p in svg.paths if p[0] != "dcd"]
        svg.add("dcd", "district", geom_to_path(g), "cadc", inset=True)
        svg.add("cadc", "circuit", geom_to_path(g), inset=True)

    nx0, ny0, nx1, ny1 = bbox_union(placed)
    national_size = svg.write(os.path.join(OUT_DIR, "national.svg"), nx0, ny0, nx1, ny1)

    # keep the national paths for the parity check
    national_paths = {p[0]: p[4] for p in svg.paths}

    # -------------------------------------------------------------------------
    # 7. circuits/<id>.svg
    # -------------------------------------------------------------------------
    log("circuit-local projections:")
    circuit_files = {}
    for circ in GEOGRAPHIC_CIRCUITS:
        members = [c for c, p in parent.items() if p == circ]
        mainland = [c for c in members if c in districts_5070]
        if not mainland:
            log(f"  {circ}: no mainland districts, skipped")
            continue

        crs = circuit_crs(circ, circuits_5070[circ], crs_conus)
        xf = transform(crs_conus, crs)

        local_d, local_c = OrderedDict(), None
        for c in sorted(mainland):
            g = QgsGeometry(districts_5070[c])
            g.transform(xf)
            local_d[c] = g
        gc = QgsGeometry(circuits_5070[circ])
        gc.transform(xf)
        local_c = gc

        placed = list(local_d.values()) + [local_c]
        lb = bbox_union(placed)
        lx0, ly0 = lb[0], lb[1]

        s = Svg()
        if circ == "cadc":
            # cadc is geographically just D.C. -> emit dcd enlarged, plus its outline
            g = place_at(local_d["dcd"], CADC_LOCAL_SCALE, lx0, ly0)
            placed = [g]
            s.add("dcd", "district", geom_to_path(g), "cadc")
            s.add("cadc", "circuit", geom_to_path(g))
        else:
            for c, g in local_d.items():
                s.add(c, "district", geom_to_path(g), circ)
            s.add(circ, "circuit", geom_to_path(local_c))

            mine = {c: insets[c] for c in members if c in insets}
            if mine:
                lrefs = dict(local_d)
                lrefs[circ] = local_c
                lboxes = place_insets_explicit(
                    mine, INSET_LAYOUT_LOCAL.get(circ, {}), local_d, lrefs, circ)
                for c, g in lboxes.items():
                    placed.append(g)
                    s.add(c, "district", geom_to_path(g), circ, inset=True)

        cx0, cy0, cx1, cy1 = bbox_union(placed)
        size = s.write(os.path.join(OUT_DIR, "circuits", f"{circ}.svg"),
                       cx0, cy0, cx1, cy1)
        circuit_files[circ] = ({p[0]: p[4] for p in s.paths if not p[3]}, size)

    # -------------------------------------------------------------------------
    # 8. validation
    # -------------------------------------------------------------------------
    log("=" * 68)
    log("VALIDATION")

    # vertex parity — the one that breaks morphing
    mismatches = []
    for circ, (paths, _) in circuit_files.items():
        for cid, d in paths.items():
            if cid in NO_GEOMETRY or cid == circ:
                continue
            nat = national_paths.get(cid)
            if nat is None:
                mismatches.append((cid, "missing from national.svg", "", ""))
                continue
            a, b = d.count("L") + d.count("M"), nat.count("L") + nat.count("M")
            if a != b:
                mismatches.append((cid, circ, b, a))
    if mismatches:
        log(f"  vertex parity: {len(mismatches)} MISMATCH(ES) — these circuits will")
        log("    fail the app's correspondence check and fall back to a zoom:")
        for m in mismatches:
            log(f"    {m}")
        log("    fix this in SIMPLIFICATION, never in export.")
    else:
        log("  vertex parity: OK — every mainland district matches 1:1")

    # coverage
    expect_d = set(parent) - NO_GEOMETRY
    got_d = set(districts_5070) | set(insets)
    log(f"  coverage: districts {len(got_d)}/{len(expect_d)}"
        + (f"  MISSING {sorted(expect_d - got_d)}" if expect_d - got_d else ""))
    log(f"  coverage: circuits  {len(circuit_files)}/{len(GEOGRAPHIC_CIRCUITS)}")
    log(f"  cafc on the map? {'YES — BUG' if 'cafc' in got_d else 'no (correct)'}")

    # geometry health + areas (a wrong-sized shape means a bad dissolve)
    log("  geometry health:")
    for court, g in sorted(districts_5070.items()):
        flags = []
        if g.isEmpty():
            flags.append("EMPTY")
        if not g.isGeosValid():
            flags.append("INVALID")
        if flags:
            log(f"    {court}: {','.join(flags)}")
    log(f"  areas (km^2), 5 largest / 5 smallest mainland districts:")
    areas = sorted(((g.area() / 1e6, c) for c, g in districts_5070.items()), reverse=True)
    for a, c in areas[:5]:
        log(f"    {c:<6} {a:>12,.0f}")
    for a, c in areas[-5:]:
        log(f"    {c:<6} {a:>12,.0f}")

    # budget — broken down, so it is obvious WHERE the vertices are
    total_v = sum(count_vertices(g) for g in districts_5070.values())
    inset_v = sum(count_vertices(g) for g in insets.values())
    circ_v = sum(count_vertices(g) for g in circuits_5070.values())
    log(f"  vertex budget: national.svg {national_size/1024:.0f} KB")
    log(f"    mainland districts {total_v:>7}")
    log(f"    circuit outlines   {circ_v:>7}   (these retrace their districts' outer edges)")
    log(f"    insets             {inset_v:>7}")
    log(f"    TOTAL              {total_v + circ_v + inset_v:>7}")

    log("  heaviest districts:")
    heavy = sorted(((count_vertices(g), c) for c, g in districts_5070.items()), reverse=True)
    for v, c in heavy[:8]:
        log(f"    {c:<6} {v:>6}")

    log("  per-circuit file (mainland vertices / KB):")
    for circ, (paths, size) in sorted(circuit_files.items()):
        v = sum(d.count("L") + d.count("M") for cid, d in paths.items() if cid != circ)
        log(f"    {circ:<6} {v:>6} v   {size/1024:>6.0f} KB")

    if national_size > SIZE_BUDGET_KB * 1024:
        log(f"    over the {SIZE_BUDGET_KB} KB budget — raise MAPSHAPER_INTERVAL "
            f"(monotonic: bigger interval, fewer vertices), or coarsen an inset.")

    if YELLOWSTONE:
        wy = districts_5070["wyd"].area() / 1e6
        log(f"  yellowstone: wyd = {wy:,.0f} km^2 "
            f"({'OK' if 253_000 < wy < 254_500 else 'SUSPECT — expect ~253,400'})")

    if unmatched:
        log(f"  !! {len(unmatched)} counties had no crosswalk row — geometry is INCOMPLETE")

    log("=" * 68)
    log("done")


main()
