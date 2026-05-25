#!/usr/bin/env python3
"""WattIf data generator — single reproducible source of truth for data/processed/*.json.

Produces contract-shaped fixtures (see docs/PLAN.md):
  - zones.json   Zone[]   Toronto neighbourhoods (geo + demographics + demand + potentials)
  - demand.json           per-zone baseline + Ontario seasonal monthly demand curve
  - agents.json  Agent[]  a few thousand agents distributed by zone population
  - solar.json            per-zone solar potential layer

Data strategy (see data/README.md):
  1. REAL boundaries + demographics from Toronto Open Data (140-neighbourhood model):
       - Neighbourhoods (historical 140) WGS84 GeoJSON  -> real polygons + centroids
       - Neighbourhood Profiles 2016 (140-model)        -> Census population, owner/renter
         tenure, and household income groups (-> grouped-median household income)
     Prefers a local cache in data/raw/toronto-open-data/, else fetches non-interactively.
  2. Per field, falls back to a curated synthetic value if a source/zone is unmatched.
  3. demand / solarPotential / windPotential are MODELLED (fed by the real inputs).

Deterministic: seeded RNG so reruns are identical. Stdlib only (no third-party deps).

Usage:  python3 scripts/build.py
"""
from __future__ import annotations

import bisect
import csv
import json
import math
import random
import sys
import urllib.request
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[1]
OUT_DIR = REPO_ROOT / "data" / "processed"
SEED = 1729
N_AGENTS = 4000

# Lake Ontario shoreline reference latitude near downtown Toronto.
# Wind potential rises as a zone sits closer to (lower latitude than) the lake / waterfront.
LAKE_LAT = 43.628
# Downtown core reference point [lng, lat]. Dense-core zones near here have POOR utility-wind
# potential (turbulence, no siting room, low hub-height wind) and are suppressed accordingly.
CORE_LNG, CORE_LAT = -79.380, 43.650

# --------------------------------------------------------------------------------------
# Curated table of real Toronto neighbourhoods.
# centroid = [lng, lat] (real, approximate neighbourhood centres).
# pop / income / renterPct are plausible figures derived from City of Toronto
# neighbourhood profiles (rounded/approximate — synthetic for the demo, not official).
# --------------------------------------------------------------------------------------
NEIGHBOURHOODS = [
    # name, lng, lat, population, medianIncome, renterPct
    ("Waterfront Communities–The Island", -79.382, 43.640, 65913, 92000, 0.62),
    ("Bay Street Corridor",               -79.385, 43.659, 25797, 88000, 0.66),
    ("Church-Yonge Corridor",             -79.378, 43.661, 31340, 61000, 0.74),
    ("Kensington-Chinatown",              -79.400, 43.653, 17945, 48000, 0.71),
    ("University",                        -79.397, 43.664, 7607,  55000, 0.69),
    ("Moss Park",                         -79.369, 43.654, 20506, 47000, 0.72),
    ("Regent Park",                       -79.360, 43.660, 10803, 39000, 0.78),
    ("Cabbagetown-South St.James Town",   -79.366, 43.667, 11669, 72000, 0.58),
    ("North St.James Town",               -79.372, 43.671, 18615, 38000, 0.83),
    ("Annex",                             -79.404, 43.671, 30526, 76000, 0.64),
    ("Yonge-St.Clair",                    -79.396, 43.687, 12528, 98000, 0.55),
    ("Rosedale-Moore Park",               -79.383, 43.682, 20923, 134000, 0.39),
    ("Casa Loma",                         -79.410, 43.681, 10968, 89000, 0.52),
    ("Wychwood",                          -79.423, 43.679, 14349, 66000, 0.56),
    ("Dovercourt-Wallace Emerson-Junction", -79.439, 43.668, 36625, 58000, 0.55),
    ("Little Portugal",                   -79.435, 43.648, 15559, 62000, 0.57),
    ("Trinity-Bellwoods",                 -79.413, 43.647, 14377, 71000, 0.55),
    ("Niagara",                           -79.412, 43.640, 31180, 79000, 0.61),
    ("South Parkdale",                    -79.435, 43.638, 21849, 41000, 0.74),
    ("High Park-Swansea",                 -79.465, 43.645, 24227, 84000, 0.49),
    ("Roncesvalles",                      -79.450, 43.646, 14470, 73000, 0.52),
    ("The Beaches",                       -79.297, 43.671, 21567, 96000, 0.40),
    ("Danforth",                          -79.323, 43.682, 9626,  67000, 0.49),
    ("Greektown (Playter Estates-Danforth)", -79.351, 43.677, 7656, 71000, 0.46),
    ("East York (Broadview North)",       -79.358, 43.692, 11929, 56000, 0.47),
    ("Leaside-Bennington",                -79.366, 43.704, 16828, 118000, 0.33),
    ("Don Valley Village",                -79.349, 43.785, 27051, 52000, 0.44),
    ("Willowdale East",                   -79.405, 43.770, 50434, 49000, 0.55),
    ("Willowdale West",                   -79.428, 43.768, 16936, 53000, 0.51),
    ("Bayview Village",                   -79.382, 43.770, 21396, 60000, 0.43),
    ("York University Heights",           -79.490, 43.766, 27593, 44000, 0.49),
    ("Black Creek",                       -79.518, 43.756, 21737, 35000, 0.58),
    ("Glenfield-Jane Heights",            -79.519, 43.745, 31894, 38000, 0.52),
    ("Mount Olive-Silverstone-Jamestown", -79.587, 43.746, 32954, 37000, 0.55),
    ("Rexdale-Kipling",                   -79.566, 43.722, 10529, 46000, 0.41),
    ("Etobicoke West Mall",               -79.566, 43.643, 11848, 51000, 0.46),
    ("Islington-City Centre West",        -79.545, 43.635, 43965, 64000, 0.45),
    ("Mimico (Lakeshore)",                -79.499, 43.616, 33964, 70000, 0.53),
    ("Scarborough Village",               -79.213, 43.737, 16724, 41000, 0.45),
    ("Agincourt South-Malvern West",      -79.281, 43.785, 22913, 47000, 0.36),
    ("Malvern",                           -79.222, 43.806, 43794, 49000, 0.30),
    ("Woburn",                            -79.225, 43.766, 53485, 50000, 0.34),
    ("Rouge",                             -79.176, 43.812, 46496, 58000, 0.20),
    ("Birchcliffe-Cliffside",             -79.260, 43.692, 22291, 64000, 0.39),
]


# --------------------------------------------------------------------------------------
# Toronto Open Data — REAL datasets (City of Toronto, 140-neighbourhood model)
#
# We self-serve real free data, preferring any local copy in data/raw/toronto-open-data/
# (so the build is reproducible offline once fetched), else fetching non-interactively with a
# short timeout. Both sources use Toronto's *historical 140-neighbourhood* model, which matches
# our zone names; the 2021 profiles use the newer 158-model and are intentionally NOT used here.
#
#   - Boundaries:  Neighbourhoods (historical 140) — WGS84 GeoJSON  (real polygons + centroids)
#   - Demographics: Neighbourhood Profiles 2016 (140-model) — Census 2016 population, household
#                   tenure (owner/renter), and household total-income groups (→ median income)
#
# If a source is unreachable/unparseable, we fall back to the curated synthetic value for that
# field and report it — the contract is never broken.
# --------------------------------------------------------------------------------------
RAW_DIR = REPO_ROOT / "data" / "raw" / "toronto-open-data"
_CKAN_DL = "https://ckan0.cf.opendata.inter.prod-toronto.ca/dataset/fc443770-ef0a-4025-9c2c-2cb558bfab00/resource"
_PROF_DL = "https://ckan0.cf.opendata.inter.prod-toronto.ca/dataset/6e19a90f-971c-46b3-852c-0c48c436d1fc/resource"
BOUNDARIES_URL = f"{_CKAN_DL}/9994da8e-5d35-438b-bfc4-eef14d09e035/download/neighbourhoods-historical-140-4326.geojson"
PROFILES_URL = f"{_PROF_DL}/fe8f49c5-b629-49b9-9453-7f41f0f3fdea/download/neighbourhood-profiles-2016-140-model.json"
BOUNDARIES_FILE = "neighbourhoods-140-4326.geojson"
PROFILES_FILE = "profiles-2016-140.json"
# OSM building stats per zone (produced by scripts/fetch_osm.py). Optional enrichment.
OSM_FILE = "osm_buildings.json"
# PVGIS real solar PV yield per zone (produced by scripts/fetch_pvgis.py). Optional enrichment.
PVGIS_FILE = "pvgis_solar.json"
# Resident climate attitudes crosstab (produced by scripts/extract_attitudes.py). Optional.
ATTITUDES_FILE = "attitudes_extract.json"
# Wellbeing Toronto environment indicators (produced by scripts/extract_wellbeing.py). Optional.
WELLBEING_FILE = "wellbeing_environment.json"
# Land/water mask (produced by scripts/fetch_water_mask.py). Optional — clips zones to land.
WATER_MASK_FILE = "water_mask.geojson"
TYPICAL_FOOTPRINT_M2 = 160.0   # ~typical Toronto building ground footprint
METRES_PER_LEVEL = 3.1         # storey height for 3D extrusion / height estimates

# Our zone label -> the canonical 140-model name used by both sources (only where they differ
# beyond what parenthetical/area-code stripping handles).
ALIASES = {
    "East York (Broadview North)": "Broadview North",
    "Greektown (Playter Estates-Danforth)": "Playter Estates-Danforth",
}

# 2016 Census household total-income-group rows (City of Toronto profile _id -> [lo, hi)).
# Non-overlapping top-level brackets (the City's file omits the $15–20k row; $200k+ is a child
# of $100k+, so we split $100k+ into 100–200k and 200k+ for a finer grouped median).
_INCOME_BRACKETS = [
    (0, 5000, 1039), (5000, 10000, 1040), (10000, 15000, 1041),
    (20000, 25000, 1042), (25000, 30000, 1043), (30000, 35000, 1044),
    (35000, 40000, 1045), (40000, 45000, 1046), (45000, 50000, 1047),
    (50000, 60000, 1048), (60000, 70000, 1049), (70000, 80000, 1050),
    (80000, 90000, 1051), (90000, 100000, 1052),
]
_INCOME_100K_ID = 1053   # "$100,000 and over"
_INCOME_200K_ID = 1054   # "$200,000 and over" (subset of 100k+)
_POP_ID = 3              # "Population, 2016"
_OWNER_ID = 1629         # tenure: owner households
_RENTER_ID = 1630        # tenure: renter households

import re  # noqa: E402 — used by the real-data matchers below


def normkey(s: str) -> str:
    """Normalize a neighbourhood name for matching: drop parentheticals/area-codes & punctuation."""
    return re.sub(r"[^a-z0-9]", "", re.sub(r"\([^)]*\)", "", s).lower())


def _fetch_bytes(url: str, timeout: float = 30.0) -> bytes | None:
    try:
        req = urllib.request.Request(url, headers={"User-Agent": "wattif-data/1.0"})
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            return resp.read()
    except Exception as exc:  # noqa: BLE001 — any network error -> fallback
        print(f"  fetch failed ({url.split('/')[-1][:42]}…): {exc}", file=sys.stderr)
        return None


def load_json_source(local_name: str, url: str) -> object | None:
    """Prefer a local copy in data/raw/toronto-open-data/, else fetch & cache it there."""
    local = RAW_DIR / local_name
    if local.exists():
        try:
            print(f"  using local {local.relative_to(REPO_ROOT)}", file=sys.stderr)
            return json.loads(local.read_text())
        except Exception as exc:  # noqa: BLE001
            print(f"  local {local_name} unreadable ({exc}); refetching", file=sys.stderr)
    raw = _fetch_bytes(url)
    if raw is None:
        return None
    try:
        data = json.loads(raw.decode("utf-8"))
    except Exception as exc:  # noqa: BLE001
        print(f"  parse failed for {local_name}: {exc}", file=sys.stderr)
        return None
    try:  # cache for reproducible offline rebuilds
        RAW_DIR.mkdir(parents=True, exist_ok=True)
        local.write_bytes(raw)
    except OSError:
        pass
    return data


def _ring_centroid(ring: list[list[float]]) -> tuple[float, float]:
    """Polygon centroid (shoelace) for a [lng,lat] ring."""
    a = cx = cy = 0.0
    n = len(ring)
    for i in range(n - 1):
        x0, y0 = ring[i][0], ring[i][1]
        x1, y1 = ring[i + 1][0], ring[i + 1][1]
        cross = x0 * y1 - x1 * y0
        a += cross
        cx += (x0 + x1) * cross
        cy += (y0 + y1) * cross
    if abs(a) < 1e-12:
        xs = [p[0] for p in ring]
        ys = [p[1] for p in ring]
        return sum(xs) / len(xs), sum(ys) / len(ys)
    a *= 0.5
    return cx / (6 * a), cy / (6 * a)


def _decimate(ring: list[list[float]], target: int = 140) -> list[list[float]]:
    """Down-sample a dense ring to ~target vertices (stride), preserving closure."""
    if len(ring) <= target:
        return ring
    stride = max(1, len(ring) // target)
    out = ring[::stride]
    if out[0] != ring[0]:
        out.insert(0, ring[0])
    if out[-1] != ring[0]:
        out.append(ring[0])  # close
    return out


def load_real_boundaries() -> dict[str, dict]:
    """normkey -> {polygon: [ring], centroid: [lng,lat]} from the real 140-model GeoJSON."""
    gj = load_json_source(BOUNDARIES_FILE, BOUNDARIES_URL)
    out: dict[str, dict] = {}
    if not isinstance(gj, dict) or "features" not in gj:
        print("  ! boundaries unavailable — will use synthetic hexagons", file=sys.stderr)
        return out
    for feat in gj["features"]:
        geom = feat.get("geometry") or {}
        name = (feat.get("properties") or {}).get("AREA_NAME")
        coords = geom.get("coordinates")
        if not name or not coords:
            continue
        # Largest outer ring of a (Multi)Polygon.
        if geom.get("type") == "MultiPolygon":
            ring = max((poly[0] for poly in coords), key=len)
        elif geom.get("type") == "Polygon":
            ring = coords[0]
        else:
            continue
        ring = [[round(float(p[0]), 6), round(float(p[1]), 6)] for p in ring]
        cx, cy = _ring_centroid(ring)
        out[normkey(name)] = {
            "polygon": [_decimate(ring)],
            "centroid": [round(cx, 6), round(cy, 6)],
        }
    print(f"  ✓ {len(out)} real neighbourhood boundaries (140-model)", file=sys.stderr)
    return out


def _num(s) -> float:
    s = str(s or "").replace(",", "").strip()
    try:
        return float(s)
    except ValueError:
        return 0.0


def load_real_profiles() -> dict[str, dict]:
    """normkey -> {population, renterPct, medianIncome} from the 2016 Census 140-model profile."""
    rows = load_json_source(PROFILES_FILE, PROFILES_URL)
    out: dict[str, dict] = {}
    if not isinstance(rows, list) or not rows:
        print("  ! profiles unavailable — will use synthetic demographics", file=sys.stderr)
        return out
    by_id = {r.get("_id"): r for r in rows}
    meta = {"_id", "Category", "Topic", "Data Source", "Characteristic", "City of Toronto"}
    cols = [c for c in rows[0].keys() if c not in meta]

    def grouped_median(col: str) -> int | None:
        brackets = [(lo, hi, _num(by_id[i].get(col))) for lo, hi, i in _INCOME_BRACKETS]
        c100 = _num(by_id[_INCOME_100K_ID].get(col))
        c200 = _num(by_id[_INCOME_200K_ID].get(col))
        brackets.append((100000, 200000, max(0.0, c100 - c200)))
        brackets.append((200000, 350000, c200))  # open top capped for interpolation
        total = sum(c for *_, c in brackets)
        if total <= 0:
            return None
        half, cum = total / 2, 0.0
        for lo, hi, c in brackets:
            if c > 0 and cum + c >= half:
                return int(lo + ((half - cum) / c) * (hi - lo))
            cum += c
        return None

    for col in cols:
        pop = int(_num(by_id.get(_POP_ID, {}).get(col)))
        owner = _num(by_id.get(_OWNER_ID, {}).get(col))
        renter = _num(by_id.get(_RENTER_ID, {}).get(col))
        rec: dict = {}
        if pop > 0:
            rec["population"] = pop
        if owner + renter > 0:
            rec["renterPct"] = round(renter / (owner + renter), 3)
        mi = grouped_median(col)
        if mi:
            rec["medianIncome"] = mi
        if rec:
            out[normkey(col)] = rec
    print(f"  ✓ {len(out)} real neighbourhood profiles (2016 Census, 140-model)", file=sys.stderr)
    return out


def _match(key: str, index: dict[str, dict]) -> dict | None:
    """Exact normalized match, else a high-cutoff fuzzy match."""
    if key in index:
        return index[key]
    import difflib

    cand = difflib.get_close_matches(key, list(index), n=1, cutoff=0.9)
    return index[cand[0]] if cand else None


def load_osm_buildings() -> dict[str, dict]:
    """zoneId -> {buildingCount, avgLevels, levelsSample} from scripts/fetch_osm.py cache.

    Local-only (no fetch here): run scripts/fetch_osm.py to populate. Missing -> {} (modelled).
    """
    path = RAW_DIR / OSM_FILE
    if not path.exists():
        print("  (no OSM building cache — run scripts/fetch_osm.py; using modelled roof avail)",
              file=sys.stderr)
        return {}
    try:
        data = json.loads(path.read_text())
        n = sum(1 for v in data.values() if v.get("buildingCount"))
        print(f"  ✓ OSM building stats for {n} zones (real footprints/heights)", file=sys.stderr)
        return data
    except Exception as exc:  # noqa: BLE001
        print(f"  OSM cache unreadable ({exc}); using modelled roof avail", file=sys.stderr)
        return {}


def load_pvgis_solar() -> dict[str, dict]:
    """zoneId -> {pvYieldKwhPerKwp, irradiationKwhM2Yr, optimalSlope, monthlyEm} from PVGIS cache.

    Local-only: run scripts/fetch_pvgis.py to populate. Missing -> {} (assumed yield used).
    """
    path = RAW_DIR / PVGIS_FILE
    if not path.exists():
        print("  (no PVGIS cache — run scripts/fetch_pvgis.py; using assumed PV yield)",
              file=sys.stderr)
        return {}
    try:
        data = json.loads(path.read_text())
        n = sum(1 for v in data.values() if v.get("pvYieldKwhPerKwp"))
        print(f"  ✓ PVGIS real solar yield for {n} zones", file=sys.stderr)
        return data
    except Exception as exc:  # noqa: BLE001
        print(f"  PVGIS cache unreadable ({exc}); using assumed PV yield", file=sys.stderr)
        return {}


def load_water_mask():
    """Load the Toronto water mask as a shapely geometry (or None if absent/shapely missing)."""
    path = RAW_DIR / WATER_MASK_FILE
    if not path.exists():
        print("  (no water mask — run scripts/fetch_water_mask.py; zones NOT clipped to land)",
              file=sys.stderr)
        return None
    try:
        from shapely.geometry import shape
        g = shape(json.loads(path.read_text())["geometry"])
        if not g.is_valid:
            g = g.buffer(0)
        print("  ✓ water mask loaded (clipping zone polygons to land)", file=sys.stderr)
        return g
    except Exception as exc:  # noqa: BLE001 — shapely missing or bad geom -> skip clipping
        print(f"  water mask unavailable ({exc}); zones NOT clipped", file=sys.stderr)
        return None


def _poly_rings(poly, tol: float) -> list[list[list[float]]] | None:
    """Simplify a shapely Polygon (keeping holes) -> [exterior, *interiors] of [lng,lat] coords.

    Returns None for degenerate/unrepairable parts (e.g. thin creek slivers) so they're skipped.
    """
    s = poly.simplify(tol, preserve_topology=True)
    if s.is_empty or not s.is_valid:
        s = s.buffer(0)          # repair self-intersections
    if s.is_empty or s.area <= 0:
        return None
    if s.geom_type == "MultiPolygon":
        s = max(s.geoms, key=lambda p: p.area)
    if s.geom_type != "Polygon" or not s.is_valid:
        return None
    out = [[[round(x, 6), round(y, 6)] for x, y in s.exterior.coords]]
    for interior in s.interiors:
        hole = [[round(x, 6), round(y, 6)] for x, y in interior.coords]
        if len(hole) >= 4:
            out.append(hole)
    return out if len(out[0]) >= 4 else None


def clean_geom(geom: dict) -> tuple[dict, list[float]]:
    """Repair a (Multi)Polygon geom dict to be OGC-valid (make_valid), keeping holes/parts.

    Returns (clean geom dict, centroid-of-largest-part [lng,lat])."""
    from shapely.geometry import shape
    from shapely.validation import make_valid
    g = shape(geom)
    if not g.is_valid:
        g = make_valid(g)
    polys = []
    for p in (g.geoms if g.geom_type in ("MultiPolygon", "GeometryCollection") else [g]):
        if getattr(p, "geom_type", "") == "Polygon" and p.area > 0:
            polys.append(p)
    if not polys:
        ring = geom["coordinates"][0] if geom["type"] == "Polygon" else geom["coordinates"][0][0]
        cx, cy = _ring_centroid(ring)
        return geom, [round(cx, 6), round(cy, 6)]
    polys.sort(key=lambda p: p.area, reverse=True)

    def rings(p):
        out = [[[round(x, 6), round(y, 6)] for x, y in p.exterior.coords]]
        out += [[[round(x, 6), round(y, 6)] for x, y in i.coords] for i in p.interiors]
        return out

    cx, cy = polys[0].representative_point().x, polys[0].representative_point().y
    centroid = [round(cx, 6), round(cy, 6)]
    if len(polys) == 1:
        return {"type": "Polygon", "coordinates": rings(polys[0])}, centroid
    return {"type": "MultiPolygon", "coordinates": [rings(p) for p in polys]}, centroid


def clip_ring_to_land(ring: list[list[float]], water, min_area_frac: float = 0.02):
    """Subtract water from a zone ring. Returns (list-of-polygons, changed?).

    Each polygon is [exterior_ring, *hole_rings] so inter-island LAGOONS/channels survive as holes.
    Keeps every land part >= min_area_frac of the largest (drops slivers), so "Waterfront
    Communities–The Island" keeps both the mainland AND the Toronto Islands archipelago. Small
    parts (islands) get finer simplification so they read as the real island chain, not a blob.
    changed=False => fully inland (unchanged).
    """
    from shapely.geometry import Polygon
    poly = Polygon(ring)
    if not poly.is_valid:
        poly = poly.buffer(0)
    if not poly.intersects(water):
        return [[ring]], False  # fully inland — unchanged
    land = poly.difference(water)
    if land.is_empty:
        return [[ring]], False
    geoms = list(land.geoms) if land.geom_type == "MultiPolygon" else [land]
    geoms = sorted((g for g in geoms if g.area > 0), key=lambda g: g.area, reverse=True)
    if not geoms:
        return [[ring]], False
    largest = geoms[0].area
    cutoff = largest * min_area_frac
    polys = []
    for g in geoms:
        if g.area < cutoff:
            break
        # Finer simplification for small (island) parts — they're visually prominent.
        tol = 0.0002 if g.area >= 0.25 * largest else 0.00004
        rings = _poly_rings(g, tol)
        if rings:
            polys.append(rings)
    return (polys or [[ring]]), bool(polys)


# Former-municipality overrides where a simple centroid rule is wrong (north zones east of the
# Humber are North York, not Etobicoke). Keyed by our zone name.
REGION_OVERRIDES = {
    "York University Heights": "North York",
    "Black Creek": "North York",
    "Glenfield-Jane Heights": "North York",
}


def former_municipality(name: str, lng: float, lat: float) -> str:
    """Map a zone to its former-municipality 'Region' (the survey's banner groups)."""
    if name in REGION_OVERRIDES:
        return REGION_OVERRIDES[name]
    if lng < -79.48:
        return "Etobicoke"
    if lng > -79.295 and lat > 43.69:
        return "Scarborough"
    if lat > 43.71 and -79.48 <= lng <= -79.295:
        return "North York"
    return "Metro Toronto"  # old City of Toronto core (downtown / old Toronto / East York)


def load_attitudes_extract() -> dict:
    """Climate-attitudes crosstab from scripts/extract_attitudes.py (local cache), or {}."""
    path = RAW_DIR / ATTITUDES_FILE
    if not path.exists():
        print("  (no attitudes cache — run scripts/extract_attitudes.py; skipping attitudes.json)",
              file=sys.stderr)
        return {}
    try:
        data = json.loads(path.read_text())
        print(f"  ✓ resident attitudes ({len(data.get('items', {}))} metrics)", file=sys.stderr)
        return data
    except Exception as exc:  # noqa: BLE001
        print(f"  attitudes cache unreadable ({exc}); skipping", file=sys.stderr)
        return {}


def point_in_ring(lng: float, lat: float, ring: list[list[float]]) -> bool:
    """Ray-casting point-in-polygon for a [lng,lat] ring."""
    inside = False
    n = len(ring)
    j = n - 1
    for i in range(n):
        xi, yi = ring[i][0], ring[i][1]
        xj, yj = ring[j][0], ring[j][1]
        if ((yi > lat) != (yj > lat)) and (lng < (xj - xi) * (lat - yi) / (yj - yi + 1e-15) + xi):
            inside = not inside
        j = i
    return inside


def outer_rings(zone: dict) -> list[list[list[float]]]:
    """Outer ring(s) of a zone — handles both Polygon and MultiPolygon geometries."""
    geom = zone["polygon"]
    coords = geom["coordinates"]
    if geom.get("type") == "MultiPolygon":
        return [poly[0] for poly in coords]
    return [coords[0]]


def assign_zone(lng: float, lat: float, zones: list[dict]) -> str | None:
    """Return the id of the zone whose polygon (any part) contains the point, else None."""
    for z in zones:
        if any(point_in_ring(lng, lat, ring) for ring in outer_rings(z)):
            return z["id"]
    return None


# Heat-relief location type -> facility category.
_COOL_CATEGORY = {
    "Cooling Centre": "cooling_centre",
    "Cooling Location": "cooling_location",
    "Indoor Pool": "pool",
}


def build_facilities(zones: list[dict]) -> dict | None:
    """data/processed/facilities.json — REAL gathering/relief facilities joined to zones (PIP).

    Sources: Toronto Heat Relief Network (cooling centres/locations/pools) + TPL library branches
    (community gathering / informal warming spaces). Each facility gets a zoneId via point-in-polygon
    over our 44 zones (null if outside them). Replaces synthetic event gathering-zone coordinates:
    heatwave -> nearest cooling_centre/location; blackout/cold -> library/community space.
    """
    facilities: list[dict] = []

    # --- Heat Relief Network (cooling) ---
    cs_path = RAW_DIR / "cool-spaces-4326.geojson"
    if cs_path.exists():
        try:
            gj = json.loads(cs_path.read_text())
            for f in gj.get("features", []):
                geom = f.get("geometry") or {}
                coords = geom.get("coordinates")
                if not coords:
                    continue
                pt = coords[0] if geom.get("type") == "MultiPoint" else coords
                lng, lat = float(pt[0]), float(pt[1])
                p = f.get("properties", {})
                raw = p.get("locationTypeDesc") or p.get("locationDesc") or "Cooling Location"
                facilities.append({
                    "id": f"fc{len(facilities):04d}",
                    "name": p.get("locationName") or raw,
                    "category": _COOL_CATEGORY.get(raw, "cooling_location"),
                    "rawType": raw,
                    "position": [round(lng, 6), round(lat, 6)],
                    "address": p.get("address"),
                    "zoneId": assign_zone(lng, lat, zones),
                    "source": "Toronto Heat Relief Network",
                })
        except Exception as exc:  # noqa: BLE001
            print(f"  cool-spaces unreadable ({exc})", file=sys.stderr)

    # --- TPL library branches (community / warming gathering) ---
    lib_path = RAW_DIR / "tpl-branches.csv"
    if lib_path.exists():
        try:
            for row in csv.DictReader(lib_path.read_text(encoding="utf-8-sig").splitlines()):
                try:
                    lng, lat = float(row["Long"]), float(row["Lat"])
                except (KeyError, ValueError):
                    continue
                facilities.append({
                    "id": f"fc{len(facilities):04d}",
                    "name": (row.get("BranchName") or "Library") + " Library",
                    "category": "library",
                    "rawType": "Public Library Branch",
                    "position": [round(lng, 6), round(lat, 6)],
                    "address": row.get("Address"),
                    "zoneId": assign_zone(lng, lat, zones),
                    "source": "Toronto Public Library",
                })
        except Exception as exc:  # noqa: BLE001
            print(f"  tpl-branches unreadable ({exc})", file=sys.stderr)

    if not facilities:
        print("  (no facility sources found — skipping facilities.json)", file=sys.stderr)
        return None

    from collections import Counter
    by_cat = dict(Counter(f["category"] for f in facilities))
    matched = sum(1 for f in facilities if f["zoneId"])
    print(f"  ✓ facilities: {len(facilities)} ({matched} inside our zones) {by_cat}", file=sys.stderr)
    return {
        "note": "Real gathering/relief facilities. zoneId via point-in-polygon over the 44 zones "
                "(null if outside them). Use for event gathering points: heatwave->cooling_*, "
                "blackout/cold->library.",
        "sources": ["Toronto Heat Relief Network (Open Data)", "Toronto Public Library branches"],
        "countByCategory": by_cat,
        "matchedToZone": matched,
        "facilities": facilities,
    }


def build_existing_infra(zones: list[dict]) -> dict | None:
    """data/processed/existing_infra.json — REAL renewable installs + city EV chargers, joined to zones."""
    infra: list[dict] = []

    rei = RAW_DIR / "renewable-energy-installations-4326.geojson"
    if rei.exists():
        try:
            gj = json.loads(rei.read_text())
            for f in gj.get("features", []):
                p = f.get("properties", {})
                lng = p.get("LONGITUDE")
                lat = p.get("LATITUDE")
                if lng is None or lat is None:
                    coords = (f.get("geometry") or {}).get("coordinates")
                    if not coords:
                        continue
                    pt = coords[0] if (f["geometry"]["type"] == "MultiPoint") else coords
                    lng, lat = pt[0], pt[1]
                lng, lat = float(lng), float(lat)
                infra.append({
                    "id": f"ei{len(infra):04d}",
                    "kind": "renewable_install",
                    "subtype": p.get("TYPE_INSTALL") or "renewable",
                    "name": p.get("BUILDING_NAME") or p.get("ADDRESS_FULL") or "Installation",
                    "position": [round(lng, 6), round(lat, 6)],
                    "sizeInstall": p.get("SIZE_INSTALL"),
                    "energyOutput": p.get("ENERGY_OUTPUT"),
                    "yearInstall": p.get("YEAR_INSTALL"),
                    "zoneId": assign_zone(lng, lat, zones),
                    "source": "Toronto Renewable Energy Installations",
                })
        except Exception as exc:  # noqa: BLE001
            print(f"  renewable installs unreadable ({exc})", file=sys.stderr)

    ev = RAW_DIR / "ev-charging-4326.geojson"
    if ev.exists():
        try:
            gj = json.loads(ev.read_text())
            for f in gj.get("features", []):
                coords = (f.get("geometry") or {}).get("coordinates")
                if not coords:
                    continue
                pt = coords[0] if (f["geometry"]["type"] == "MultiPoint") else coords
                lng, lat = float(pt[0]), float(pt[1])
                p = f.get("properties", {})
                infra.append({
                    "id": f"ei{len(infra):04d}",
                    "kind": "ev_charger",
                    "subtype": p.get("Type") or "EV",
                    "name": p.get("Location") or "EV Charging Station",
                    "position": [round(lng, 6), round(lat, 6)],
                    "level2Ports": p.get("Level2_Charging_Ports"),
                    "level3Ports": p.get("Level3_Charging_Ports"),
                    "zoneId": assign_zone(lng, lat, zones),
                    "source": "City of Toronto EV Charging (Green P)",
                })
        except Exception as exc:  # noqa: BLE001
            print(f"  ev charging unreadable ({exc})", file=sys.stderr)

    if not infra:
        return None
    from collections import Counter
    by_kind = dict(Counter(i["kind"] for i in infra))
    matched = sum(1 for i in infra if i["zoneId"])
    print(f"  ✓ existing infra: {len(infra)} ({matched} in-zone) {by_kind}", file=sys.stderr)
    return {
        "note": "Existing real installations: city renewable-energy systems + city-operated EV "
                "chargers. zoneId via point-in-polygon. Show 'what's already there'.",
        "sources": ["Toronto Renewable Energy Installations", "City-Operated EV Charging Stations"],
        "countByKind": by_kind,
        "matchedToZone": matched,
        "infra": infra,
    }


def _load_overlap_polygons(filename: str, name_prop: str | None = None) -> list[dict] | None:
    """Load a (Multi)Polygon GeoJSON as [{name, centroid, areaKm2}] (largest ring each)."""
    path = RAW_DIR / filename
    if not path.exists():
        return None
    try:
        gj = json.loads(path.read_text())
    except Exception as exc:  # noqa: BLE001
        print(f"  {filename} unreadable ({exc})", file=sys.stderr)
        return None
    polys = []
    for f in gj.get("features", []):
        geom = f.get("geometry") or {}
        coords = geom.get("coordinates")
        if not coords:
            continue
        if geom.get("type") == "MultiPolygon":
            ring = max((poly[0] for poly in coords), key=len)
        elif geom.get("type") == "Polygon":
            ring = coords[0]
        else:
            continue
        ring = [[float(p[0]), float(p[1])] for p in ring]
        cx, cy = _ring_centroid(ring)
        nm = (f.get("properties") or {}).get(name_prop) if name_prop else None
        polys.append({"name": nm, "centroid": [cx, cy], "areaKm2": zone_area_km2(ring)})
    return polys


def zone_total_area_km2(zone: dict) -> float:
    """Total land area (km²) across all parts of a zone polygon."""
    return sum(zone_area_km2(r) for r in outer_rings(zone))


def zone_protected_fraction(zone: dict, polys: list[dict]) -> tuple[float, list]:
    """Sum area of polygons whose centroid falls in any zone part; return (fraction, names)."""
    rings = outer_rings(zone)
    zarea = sum(zone_area_km2(r) for r in rings)
    area = 0.0
    names = []
    for p in polys:
        if any(point_in_ring(p["centroid"][0], p["centroid"][1], r) for r in rings):
            area += p["areaKm2"]
            if p.get("name"):
                names.append(p["name"])
    frac = round(min(1.0, area / zarea), 3) if zarea else 0.0
    return frac, names


def build_flood(zones: list[dict]) -> tuple[dict | None, dict]:
    """data/processed/flood.json — per-zone flood-risk from chronic basement-flooding study areas.

    Returns (flood_layer, floodRiskByZoneId). Real Toronto Open Data; zoneId via centroid overlap.
    """
    polys = _load_overlap_polygons("basement-flooding-4326.geojson", "Asset Identification")
    if polys is None:
        return None, {}
    per_zone = []
    risk_map: dict[str, float] = {}
    flagged = 0
    for z in zones:
        frac, names = zone_protected_fraction(z, polys)
        # Flood-risk score: chronic-flooding study-area coverage, mildly amplified.
        risk = round(min(1.0, frac * 1.3), 3)
        risk_map[z["id"]] = risk
        if risk > 0:
            flagged += 1
        per_zone.append({
            "zoneId": z["id"],
            "name": z["name"],
            "floodStudyAreas": len(names),
            "studyAreaFraction": frac,
            "floodRiskScore": risk,
            "floodRisk": "high" if risk >= 0.4 else "moderate" if risk >= 0.1 else "low",
        })
    print(f"  ✓ flood: {flagged}/{len(zones)} zones intersect a chronic-flooding study area",
          file=sys.stderr)
    layer = {
        "note": "Per-zone flood risk from Toronto chronic basement-flooding study areas (centroid "
                "overlap with our zones). floodRiskScore 0..1. Enables flood scenario + siting penalty.",
        "source": "Toronto Basement Flooding Study Areas (Open Data)",
        "flaggedZones": flagged,
        "zones": per_zone,
    }
    return layer, risk_map


def build_heat_vulnerability(zones: list[dict], buildings: dict, environment: dict | None) -> dict:
    """data/processed/heat_vulnerability.json — per-zone Heat Vulnerability Index (HVI).

    No single official HVI dataset is on Toronto Open Data, so we compute the standard HVI
    composite from REAL indicators we already derive (documented as modeled-from-real):
      exposure   = urban heat island proxy: building density (OSM) + LOW green space (Wellbeing)
      sensitivity= social vulnerability: energyBurdenIndex (real income + renter share)
    HVI = 0.40·exposureDensity + 0.30·(1−greenScore) + 0.30·energyBurden  (each 0..1), normalized.
    """
    dens = {b["zoneId"]: b.get("buildingDensityPerKm2") or 0 for b in buildings["zones"]}
    d_lo, d_hi = min(dens.values()), max(dens.values())
    green = {}
    if environment:
        green = {z["zoneId"]: z.get("greenScore") for z in environment["zones"] if z.get("matched")}

    out = []
    for z in zones:
        d = dens.get(z["id"], 0)
        dens_norm = (d - d_lo) / (d_hi - d_lo) if d_hi > d_lo else 0.0
        g = green.get(z["id"])
        low_green = (1.0 - g) if g is not None else 0.5
        burden = z["demographics"]["energyBurdenIndex"]
        hvi = clamp01(0.40 * dens_norm + 0.30 * low_green + 0.30 * burden)
        out.append({
            "zoneId": z["id"],
            "name": z["name"],
            "heatVulnerabilityIndex": round(hvi, 3),
            "level": "high" if hvi >= 0.6 else "moderate" if hvi >= 0.4 else "low",
            "buildingDensityPerKm2": d,
            "greenScore": g,
            "energyBurdenIndex": burden,
        })
    out.sort(key=lambda x: -x["heatVulnerabilityIndex"])
    print(f"  ✓ heat vulnerability: HVI computed for {len(out)} zones "
          f"(top: {out[0]['name'][:24]} {out[0]['heatVulnerabilityIndex']})", file=sys.stderr)
    return {
        "note": "Heat Vulnerability Index per zone — modeled composite of REAL indicators (standard "
                "HVI method): exposure = building density (OSM) + low green space (Wellbeing TO); "
                "sensitivity = energyBurdenIndex (Census income+renter). HVI = 0.40·densityNorm + "
                "0.30·(1-greenScore) + 0.30·energyBurden, 0..1. Enables equity-driven heatwave "
                "targeting. No single official HVI dataset on Open Data — hence modeled-from-real.",
        "method": "modeled composite of real indicators",
        "zones": out,
    }


def build_constraints(zones: list[dict], flood_risk: dict | None = None) -> dict | None:
    """data/processed/constraints.json — per-zone siting constraints from Environmentally
    Significant Areas (ESAs). A zone's protected fraction → optimizer no-build/penalty flag."""
    esas = _load_overlap_polygons("esa-4326.geojson", "ESA_NAME")
    if esas is None:
        return None
    flood_risk = flood_risk or {}

    per_zone = []
    flagged = 0
    for z in zones:
        protected, names = zone_protected_fraction(z, esas)
        # ESA siting penalty (0..1) plus flood-risk contribution.
        esa_pen = min(0.9, protected * 1.5)
        froisk = flood_risk.get(z["id"], 0.0)
        penalty = round(min(0.95, esa_pen + 0.6 * froisk), 3)
        no_build = protected >= 0.5
        if names or froisk > 0:
            flagged += 1
        per_zone.append({
            "zoneId": z["id"],
            "name": z["name"],
            "esaCount": len(names),
            "esaNames": names[:6],
            "protectedAreaFraction": protected,
            "floodRisk": round(froisk, 3),
            "sitingPenalty": penalty,
            "noBuild": no_build,
        })
    print(f"  ✓ constraints: {flagged}/{len(zones)} zones have an ESA and/or flood constraint",
          file=sys.stderr)
    return {
        "note": "Per-zone siting constraints. protectedAreaFraction from Environmentally Significant "
                "Areas; floodRisk from chronic basement-flooding study areas. sitingPenalty 0..1 "
                "(= ESA penalty + 0.6·floodRisk; optimizer should down-weight); noBuild=True when "
                ">=50% of the zone is ESA-protected.",
        "source": "Toronto Environmentally Significant Areas + Basement Flooding Study Areas",
        "flaggedZones": flagged,
        "zones": per_zone,
    }


def load_wellbeing_env() -> dict:
    """Wellbeing Toronto environment indicators (local cache from extract_wellbeing.py), or {}."""
    path = RAW_DIR / WELLBEING_FILE
    if not path.exists():
        print("  (no wellbeing cache — run scripts/extract_wellbeing.py; skipping environment.json)",
              file=sys.stderr)
        return {}
    try:
        return json.loads(path.read_text())
    except Exception as exc:  # noqa: BLE001
        print(f"  wellbeing cache unreadable ({exc}); skipping", file=sys.stderr)
        return {}


def build_environment(zones: list[dict], wb: dict) -> dict | None:
    """data/processed/environment.json — per-zone real environment indicators (Wellbeing Toronto),
    joined by name, plus normalized greenScore / pollutionBurden (0..1) for the equity/enviro overlay."""
    by_nbhd = (wb or {}).get("byNeighbourhood")
    if not by_nbhd:
        return None
    index = {k: v for k, v in by_nbhd.items()}

    matched = []
    for z in zones:
        rec = _match(normkey(ALIASES.get(z["name"], z["name"])), index)
        matched.append((z, rec))

    greens = sorted(r["greenSpaces"] for _, r in matched
                    if r and r.get("greenSpaces") is not None)
    polls = [r["pollutantsToAir"] for _, r in matched if r and r.get("pollutantsToAir") is not None]
    # Pollution is highly skewed -> rank via log scale + min-max.
    import math as _m
    pl = [_m.log1p(p) for p in polls] if polls else []
    p_lo, p_hi = (min(pl), max(pl)) if pl else (0, 0)

    def pct_rank(v: float, sorted_vals: list[float]) -> float:
        """Percentile rank in 0..1 (handles the heavy skew of green-space area)."""
        n = len(sorted_vals)
        if n == 0:
            return 0.0
        less = bisect.bisect_left(sorted_vals, v)
        equal = bisect.bisect_right(sorted_vals, v) - less
        return round((less + 0.5 * equal) / n, 3)

    out = []
    real = 0
    for z, rec in matched:
        if not rec:
            out.append({"zoneId": z["id"], "name": z["name"], "matched": False})
            continue
        real += 1
        green = rec.get("greenSpaces")
        poll = rec.get("pollutantsToAir")
        # greenScore: percentile rank across the 44 zones (even 0..1 spread; ravine/park-rich high).
        green_score = pct_rank(green, greens) if green is not None else None
        poll_burden = (round((_m.log1p(poll) - p_lo) / (p_hi - p_lo), 3)
                       if poll is not None and p_hi > p_lo else None)
        out.append({
            "zoneId": z["id"],
            "name": z["name"],
            "matched": True,
            "greenSpaces": green,
            "treeCover": rec.get("treeCover"),
            "pollutantsToAir": poll,
            "greenScore": green_score,
            "pollutionBurden": poll_burden,
        })
    print(f"  ✓ environment: {real}/{len(zones)} zones matched (Wellbeing Toronto)", file=sys.stderr)
    return {
        "source": wb.get("source"),
        "note": "Per-zone environment indicators joined by name. greenScore/pollutionBurden are "
                "0..1 normalized across matched zones (pollution log-scaled). Augments equity overlay.",
        "matchedZones": real,
        "zones": out,
    }


# Existing district-energy service (downtown). No open dataset exists, so this is approximated
# from public information (Enwave Deep Lake Water Cooling + downtown district energy; Regent Park
# Community Energy System). servedFraction 0..1 by neighbourhood. FLAGGED modeled-from-public-info.
_DISTRICT_ENERGY_SERVED = {
    "Bay Street Corridor": (0.85, "Enwave (Deep Lake Water Cooling / downtown district energy)"),
    "University": (0.70, "Enwave (University Ave health district / Discovery District)"),
    "Church-Yonge Corridor": (0.55, "Enwave downtown district energy"),
    "Waterfront Communities–The Island": (0.45, "Enwave (Deep Lake Water Cooling, waterfront)"),
    "Moss Park": (0.30, "Enwave downtown district energy (edge)"),
    "Kensington-Chinatown": (0.25, "Enwave downtown district energy (edge)"),
    "Regent Park": (0.80, "Regent Park Community Energy System"),
}
# Rough downtown service-area polygon (display only); [lng,lat] closed ring.
_DISTRICT_ENERGY_POLYGON = [
    [-79.399, 43.639], [-79.355, 43.643], [-79.366, 43.667],
    [-79.390, 43.667], [-79.402, 43.656], [-79.399, 43.639],
]


def build_district_energy(zones: list[dict]) -> dict:
    """data/processed/district_energy.json — existing low-carbon district energy (downtown).

    Modeled from public information (no open dataset): Enwave Deep Lake Water Cooling + downtown
    district-energy network, plus the Regent Park Community Energy System. Per-zone servedFraction
    lets the planner credit zones already served by low-carbon thermal energy.
    """
    served = 0
    out = []
    for z in zones:
        frac, system = _DISTRICT_ENERGY_SERVED.get(z["name"], (0.0, None))
        if frac > 0:
            served += 1
        out.append({
            "zoneId": z["id"],
            "name": z["name"],
            "districtEnergy": frac > 0,
            "servedFraction": frac,
            "system": system,
        })
    return {
        "note": "Existing district-energy service area (downtown). MODELED FROM PUBLIC INFORMATION "
                "— no precise open dataset exists. servedFraction 0..1 per zone; the planner can "
                "credit served zones as already having low-carbon thermal energy.",
        "source": "Modeled from public info: Enwave Deep Lake Water Cooling / downtown district "
                  "energy + Regent Park Community Energy System",
        "modeled": True,
        "servedZones": served,
        "servicePolygon": {"type": "Polygon", "coordinates": [_DISTRICT_ENERGY_POLYGON]},
        "zones": out,
    }


def build_sbei() -> dict:
    """data/processed/sbei.json — Toronto Sector-Based Emissions Inventory headline (city-wide).

    Transcribed from the City's published SBEI / TransformTO figures (aggregate dashboard, not
    per-zone). Context/display + sanity-check for our emissions baseline: buildings dominate
    (mostly natural-gas heating), so electrification + district energy is the big lever (Ontario's
    grid electricity is already low-carbon, ~38 gCO2/kWh — see generation_mix.json).
    """
    return {
        "source": "City of Toronto Sector-Based GHG Emissions Inventory / TransformTO "
                  "(public headline figures, 2019 community-wide baseline)",
        "note": "City-wide aggregate (not per-zone). Buildings ≈ half of emissions and are mostly "
                "fossil-gas heating — the main decarbonization lever, complementing the clean grid.",
        "modeled": True,
        "baselineYear": 2019,
        "communityWideMtCO2e": 16.0,
        "sectorSharePct": {
            "buildings": 57,
            "transportation": 36,
            "waste": 7,
        },
        "sectorMtCO2e": {
            "buildings": 9.1,
            "transportation": 5.8,
            "waste": 1.1,
        },
        "targets": {
            "netZeroBy": 2040,
            "reductionVs1990Pct_2030": 65,
        },
        "context": "Ontario grid electricity is ~38 gCO2/kWh (see generation_mix.json), so building "
                   "emissions are dominated by on-site natural gas — electrification + district "
                   "energy + efficiency are the highest-impact actions.",
    }


def _profile_pct(s) -> float | None:
    s = str(s or "").replace(",", "").replace("%", "").strip()
    try:
        return float(s)
    except ValueError:
        return None


def build_archetypes(zones: list[dict], buildings: dict) -> dict | None:
    """data/processed/archetypes.json — per-zone agent archetype mix from REAL Toronto data.

    Real inputs: tenure (renterPct) + median income (Census), dwelling structural type, one-person
    households, seniors 65+, young-adults 20-29 (Census 2016 profile), building density (OSM), and
    Business Improvement Area overlap (commercial density). The mapping of these to archetype
    proportions is modeled (documented). Lets the backend seed the 4,000 agents to mirror real
    per-neighbourhood composition (high-renter dense downtown vs owner-detached suburbs, etc.).
    """
    prof_path = RAW_DIR / PROFILES_FILE
    if not prof_path.exists():
        return None
    rows = json.loads(prof_path.read_text())
    by_id = {r.get("_id"): r for r in rows}
    meta = {"_id", "Category", "Topic", "Data Source", "Characteristic", "City of Toronto"}
    colmap = {normkey(c): c for c in rows[0].keys() if c not in meta}

    bias = _load_overlap_polygons("bia-4326.geojson", "AREA_NAME") or []
    dens = {b["zoneId"]: (b.get("buildingDensityPerKm2") or 0) for b in buildings["zones"]}
    d_hi = max(dens.values()) or 1.0

    def col_for(name: str) -> str | None:
        k = normkey(ALIASES.get(name, name))
        if k in colmap:
            return colmap[k]
        import difflib
        m = difflib.get_close_matches(k, list(colmap), n=1, cutoff=0.9)
        return colmap[m[0]] if m else None

    def val(rid: int, col: str) -> float:
        return _num(by_id.get(rid, {}).get(col))

    out = []
    real_profile = 0
    for z in zones:
        col = col_for(z["name"])
        renter = z["demographics"]["renterPct"]
        income = z["demographics"]["medianIncome"]
        pop = z["demographics"]["population"] or 1

        # Dwelling structural type (real): detached-ish vs apartment-ish fractions.
        det_frac = apt_frac = None
        one_person = senior = young = None
        if col:
            real_profile += 1
            total_dw = val(58, col) or 0
            detached = val(59, col) + val(62, col) + val(63, col)   # detached + semi + row
            apartment = val(60, col) + val(64, col) + val(65, col)  # 5+, duplex, <5 storeys
            if total_dw > 0:
                det_frac = detached / total_dw
                apt_frac = apartment / total_dw
            one_person = _profile_pct(by_id.get(118, {}).get(col))
            one_person = one_person / 100 if one_person is not None else None
            senior = (val(1125, col) / pop) if val(1125, col) else None
            young = (val(20, col) + val(21, col) + val(41, col) + val(42, col)) / pop

        # Fallbacks (modeled) where the profile is missing for a zone.
        if det_frac is None or (det_frac + apt_frac) <= 0:
            apt_frac = clamp01(0.2 + 0.7 * renter)
            det_frac = 1 - apt_frac
        dn = det_frac / (det_frac + apt_frac)            # owner detached vs condo split
        senior = senior if senior is not None else 0.15
        young = young if young is not None else 0.14

        # BIA commercial overlap (real) -> small-business intensity.
        bia_frac, bia_names = zone_protected_fraction(z, bias)
        dens_norm = dens.get(z["id"], 0) / d_hi

        # --- compose the mix (modeled mapping of real signals) ---
        senior_share = min(0.22, senior * 0.7)
        student_share = min(0.20, young * 0.55)
        small_biz = min(0.16, 0.03 + 0.45 * bia_frac + 0.05 * dens_norm)
        resid = max(0.35, 1 - senior_share - student_share - small_biz)
        owner_r, renter_r = (1 - renter) * resid, renter * resid
        if income < 50000:
            rl, rm = 0.70, 0.30
        elif income < 90000:
            rl, rm = 0.50, 0.50
        else:
            rl, rm = 0.32, 0.68
        mix = {
            "owner-detached": owner_r * dn,
            "condo-owner": owner_r * (1 - dn),
            "renter-low": renter_r * rl,
            "renter-mid": renter_r * rm,
            "senior": senior_share,
            "student": student_share,
            "small-business": small_biz,
        }
        tot = sum(mix.values()) or 1.0
        mix = {k: round(v / tot, 4) for k, v in mix.items()}
        out.append({
            "zoneId": z["id"],
            "name": z["name"],
            "mix": mix,
            "drivers": {
                "renterPct": renter,
                "medianIncome": income,
                "detachedDwellingFrac": round(det_frac, 3),
                "apartmentDwellingFrac": round(apt_frac, 3),
                "seniorPct65plus": round(senior, 3),
                "youngAdultPct": round(young, 3),
                "biaCount": len(bia_names),
            },
        })
    print(f"  ✓ archetypes: per-zone mix for {len(out)} zones "
          f"({real_profile}/{len(zones)} with full Census dwelling/age profile)", file=sys.stderr)
    return {
        "source": "Derived: Census 2016 profile (tenure, income, dwelling type, one-person "
                  "households, seniors 65+, young adults 20-29) + OSM building density + Business "
                  "Improvement Areas (commercial density).",
        "method": "REAL drivers (tenure/income/dwelling/age/BIA/density) → MODELED archetype mapping: "
                  "tenure splits owner/renter; dwelling type splits owner-detached vs condo-owner; "
                  "income splits renter-low vs renter-mid; senior65+ and young-adult shares carve out "
                  "senior/student; small-business from BIA overlap + density. Proportions sum to 1.",
        "archetypes": ["owner-detached", "condo-owner", "renter-low", "renter-mid",
                       "senior", "student", "small-business"],
        "zones": out,
    }


def build_generation_mix() -> dict:
    """data/processed/generation_mix.json — Ontario grid generation mix + emission intensity.

    Small static summary from IESO public figures (2023 Year in Review) — context for the sim's
    emissions/clean-baseline. Ontario's grid is very low-carbon (nuclear + hydro dominant)."""
    return {
        "source": "IESO (Independent Electricity System Operator) — Ontario, 2023 Year in Review "
                  "(public summary). Transmission-connected generation by fuel.",
        "year": 2023,
        "note": "Ontario provincial generation mix (% of TWh) + grid emission intensity. Use as the "
                "clean-grid baseline for emissions: displacing grid power saves ~the gridIntensity "
                "below; on-site renewables in dense fossil-reliant pockets save more at peak.",
        "mixPct": {
            "nuclear": 51.0,
            "hydro": 24.5,
            "naturalGas": 10.5,
            "wind": 9.0,
            "biofuel": 0.3,
            "solar": 0.6,
            "other": 4.1,
        },
        "gridEmissionIntensityGco2PerKwh": 38,
        "renewableSharePct": 34.4,
        "nonEmittingSharePct": 89.4,
    }


def build_attitudes(zones: list[dict], extract: dict) -> dict | None:
    """data/processed/attitudes.json — per-zone support-leaning priors from the 2021 survey.

    Method: the survey reports Top2Box % by former-municipality Region. We map each zone to its
    region, read the regional % (fallback to Total), and derive:
      - proRenewablePrior  : composite support for climate/renewables (mean of concern,
                             importance-of-fighting-climate, agree-everyone-reduce, likely-add-solar)
      - solarPropensity / evPropensity / retrofitPropensity : real "likely to…" Top2Box shares
      - concernPrior       : real climate-concern Top2Box
    The backend seeds each agent's `opinion` from its zone prior (then may nudge by archetype).
    """
    items = (extract or {}).get("items")
    if not items:
        return None

    def regional(metric: str, region: str) -> float | None:
        rec = items.get(metric) or {}
        return rec.get(region, rec.get("Total"))

    region_priors: dict[str, dict] = {}
    zone_priors = []
    for z in zones:
        lng, lat = z["centroid"]
        region = former_municipality(z["name"], lng, lat)
        concern = regional("climateConcern", region) or 0.0
        importance = regional("importanceFightingClimate", region) or 0.0
        agree = regional("agreeEveryoneReduce", region) or 0.0
        solar = regional("likelyAddSolar", region) or 0.0
        ev = regional("likelyBuyEV", region) or 0.0
        retrofit = regional("likelyRetrofit", region) or 0.0
        pro = round((concern + importance + agree + solar) / 4.0, 3)
        zp = {
            "zoneId": z["id"],
            "name": z["name"],
            "region": region,
            "proRenewablePrior": pro,
            "concernPrior": round(concern, 3),
            "solarPropensity": round(solar, 3),
            "evPropensity": round(ev, 3),
            "retrofitPropensity": round(retrofit, 3),
        }
        zone_priors.append(zp)
        if region not in region_priors:
            region_priors[region] = {k: zp[k] for k in
                                     ("proRenewablePrior", "concernPrior", "solarPropensity",
                                      "evPropensity", "retrofitPropensity")}

    overall = {k: items[k].get("Total") for k in items}
    return {
        "source": extract.get("source"),
        "method": "Top2Box % by former-municipality Region joined to zones by centroid; "
                  "proRenewablePrior = mean(concern, importanceFightingClimate, agreeEveryoneReduce, "
                  "likelyAddSolar). Values are 0..1 (share of residents). Seed agent.opinion from "
                  "the zone's region prior; nudge by archetype on the backend.",
        "overallTop2Box": overall,
        "byRegion": region_priors,
        "zonePriors": zone_priors,
    }


# --------------------------------------------------------------------------------------
# Geometry helpers (synthetic polygons when real boundaries unavailable)
# --------------------------------------------------------------------------------------
def hex_polygon(lng: float, lat: float, radius_km: float, rng: random.Random) -> list[list[list[float]]]:
    """Irregular hexagon around a centroid, sized in km, returned as [ring] ([lng,lat])."""
    # deg per km: lat ~1/111; lng ~1/(111*cos(lat))
    dlat = radius_km / 111.0
    dlng = radius_km / (111.0 * math.cos(math.radians(lat)))
    ring: list[list[float]] = []
    for i in range(6):
        ang = math.radians(60 * i + rng.uniform(-8, 8))
        jitter = rng.uniform(0.82, 1.18)
        ring.append(
            [
                round(lng + math.cos(ang) * dlng * jitter, 6),
                round(lat + math.sin(ang) * dlat * jitter, 6),
            ]
        )
    ring.append(ring[0])  # close ring
    return [ring]


def point_in_ring_bbox(ring: list[list[float]], rng: random.Random) -> list[float]:
    """Sample a point near a polygon: jittered around its centroid, within bbox."""
    xs = [p[0] for p in ring]
    ys = [p[1] for p in ring]
    cx, cy = sum(xs) / len(xs), sum(ys) / len(ys)
    # Pull toward centroid so points stay roughly inside the neighbourhood.
    x = cx + (rng.uniform(min(xs), max(xs)) - cx) * 0.6
    y = cy + (rng.uniform(min(ys), max(ys)) - cy) * 0.6
    return [round(x, 6), round(y, 6)]


def clamp01(x: float) -> float:
    return max(0.0, min(1.0, x))


def km_between(lng1: float, lat1: float, lng2: float, lat2: float) -> float:
    """Approximate distance in km (equirectangular — fine at city scale)."""
    mean_lat = math.radians((lat1 + lat2) / 2)
    dx = (lng2 - lng1) * 111.0 * math.cos(mean_lat)
    dy = (lat2 - lat1) * 111.0
    return math.hypot(dx, dy)


# --------------------------------------------------------------------------------------
# Demand model — Ontario seasonal curve (winter heating + summer AC peaks)
# --------------------------------------------------------------------------------------
# Normalized monthly multipliers (Jan..Dec). Winter (Jan/Feb) heating peak + a strong
# summer (Jul/Aug) AC peak — characteristic of Ontario/IESO residential load shape.
SEASONAL_CURVE = [
    1.18, 1.14, 1.02, 0.92, 0.88, 0.97,
    1.16, 1.20, 1.00, 0.90, 0.96, 1.12,
]
MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun",
          "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]
# Avg residential kWh/person/month baseline (Ontario ~ 250-350 kWh/household; ~2.4 ppl/hh).
KWH_PER_CAPITA_MONTH = 320.0


def income_bracket(median_income: int) -> str:
    if median_income < 50000:
        return "low"
    if median_income < 90000:
        return "mid"
    return "high"


# --------------------------------------------------------------------------------------
# Build zones
# --------------------------------------------------------------------------------------
def build_zones(rng: random.Random, osm: dict, pvgis: dict) -> tuple[list[dict], dict]:
    print("Loading REAL Toronto Open Data (boundaries + 2016 Census profiles)…", file=sys.stderr)
    boundaries = load_real_boundaries()
    profiles = load_real_profiles()

    water = load_water_mask()  # optional shapely geometry; clips zone polygons to land
    clipped_count = 0

    # Provenance counters (real vs synthetic-fallback per field).
    prov = {k: {"real": 0, "synthetic": 0} for k in
            ("polygon", "population", "medianIncome", "renterPct", "roofAvailability", "irradiance")}

    # Normalize real PVGIS irradiation across zones into a small [0.76, 0.86] band so it feeds
    # solarPotential without overwhelming the (dominant) roof-availability term.
    irr_vals = [v["irradiationKwhM2Yr"] for v in pvgis.values() if v.get("irradiationKwhM2Yr")]
    irr_lo, irr_hi = (min(irr_vals), max(irr_vals)) if irr_vals else (0.0, 0.0)

    # Income normalization range comes from the *final* incomes (computed in a first pass).
    resolved: list[dict] = []
    for name, lng, lat, syn_pop, syn_income, syn_renter in NEIGHBOURHOODS:
        canon = ALIASES.get(name, name)
        key = normkey(canon)
        bnd = _match(key, boundaries)
        prof = _match(key, profiles) or {}

        if bnd:
            polygon_coords, centroid = bnd["polygon"], bnd["centroid"]
            prov["polygon"]["real"] += 1
        else:
            centroid = [lng, lat]
            polygon_coords = hex_polygon(lng, lat, radius_km=rng.uniform(0.9, 1.8), rng=rng)
            prov["polygon"]["synthetic"] += 1

        # Clip the polygon to land (subtract Lake Ontario / harbour); recompute centroid from land.
        # Multi-part land (mainland + Toronto Islands) is emitted as a GeoJSON MultiPolygon.
        geom = {"type": "Polygon", "coordinates": polygon_coords}
        if water is not None:
            polys, changed = clip_ring_to_land(polygon_coords[0], water)
            if changed:
                if len(polys) == 1:
                    geom = {"type": "Polygon", "coordinates": polys[0]}
                else:
                    geom = {"type": "MultiPolygon", "coordinates": polys}
                geom, centroid = clean_geom(geom)  # OGC-valid + centroid on largest part
                clipped_count += 1

        pop = prof.get("population", syn_pop)
        prov["population"]["real" if "population" in prof else "synthetic"] += 1
        income = prof.get("medianIncome", syn_income)
        prov["medianIncome"]["real" if "medianIncome" in prof else "synthetic"] += 1
        renter = prof.get("renterPct", syn_renter)
        prov["renterPct"]["real" if "renterPct" in prof else "synthetic"] += 1

        resolved.append({"name": name, "centroid": centroid, "geom": geom,
                         "pop": pop, "income": income, "renter": renter})

    incomes = [r["income"] for r in resolved]
    min_inc, max_inc = min(incomes), max(incomes)

    zones: list[dict] = []
    for idx, r in enumerate(resolved):
        name = r["name"]
        centroid, geom = r["centroid"], r["geom"]
        pop, income, renter = r["pop"], r["income"], r["renter"]

        # Energy burden index: higher for low income + high renter share (from REAL inputs).
        income_norm = (income - min_inc) / (max_inc - min_inc)  # 0 (poor) .. 1 (rich)
        burden = clamp01(0.62 * (1 - income_norm) + 0.38 * renter)

        # Solar potential: irradiance (≈uniform in southern Ontario) × usable roof availability.
        # Roof availability is HIGH for low-rise (lots of roof per occupant) and LOW for high-rise.
        # Prefer REAL OSM building heights (avg storeys); fall back to the renter/high-rise proxy.
        osm_rec = osm.get(f"z{idx:03d}")
        avg_levels = (osm_rec or {}).get("avgLevels")
        if avg_levels:
            # ~0.88 for detached (1–2 storeys) → ~0.06 floor for towers (12+ storeys).
            roof_avail = clamp01(max(0.06, 0.95 - 0.075 * avg_levels))
            prov["roofAvailability"]["real"] += 1
        else:
            roof_avail = clamp01(0.85 - 0.45 * renter + rng.uniform(-0.05, 0.05))
            prov["roofAvailability"]["synthetic"] += 1
        # Irradiance term: REAL PVGIS in-plane irradiation, normalized to a tight band (southern
        # Ontario is fairly uniform); falls back to ~0.80 when PVGIS is missing.
        pv_rec = pvgis.get(f"z{idx:03d}") or {}
        irr = pv_rec.get("irradiationKwhM2Yr")
        if irr and irr_hi > irr_lo:
            irradiance = 0.76 + 0.10 * (irr - irr_lo) / (irr_hi - irr_lo)
            prov["irradiance"]["real"] += 1
        else:
            irradiance = 0.80 + rng.uniform(-0.04, 0.04)
            prov["irradiance"]["synthetic"] += 1
        solar_potential = clamp01(irradiance * roof_avail)

        # Wind potential: a *natural resource* term (lakefront + open suburban edge) that is
        # then SUPPRESSED in dense urban cores. Real downtown Toronto has poor utility-wind
        # potential (turbulence, no siting room, low hub-height wind), so a waterfront-but-dense
        # zone scores LOW while open lakeshore / outer-suburban edges score HIGH.
        clng, clat = centroid[0], centroid[1]
        # Shoreline proximity (south / low latitude == on or near the lake): 1.0 at/below the
        # shore, fading to 0 ~10 km inland (north).
        shore = clamp01(1.0 - (clat - LAKE_LAT) / 0.10)
        # Open-edge factor: farther from the core == more open land for siting. 0 at core, 1 by ~18 km.
        dist_core = km_between(clng, clat, CORE_LNG, CORE_LAT)
        open_edge = clamp01(dist_core / 18.0)
        # Natural resource available before urban siting constraints.
        natural_wind = min(0.85, 0.30 + 0.40 * shore + 0.45 * open_edge)
        # Urban-density suppression: close to core (turbulence/no siting) + high-rise (renter proxy).
        core_closeness = math.exp(-dist_core / 3.5)          # ~1 downtown, ~0 in the suburbs
        urbanness = clamp01(0.6 * core_closeness + 0.5 * renter)
        wind_potential = clamp01(
            natural_wind * (1.0 - 0.80 * urbanness) + rng.uniform(-0.03, 0.03)
        )

        # Baseline monthly demand (annual-average month): population-scaled, mild income lift.
        demand_monthly = pop * KWH_PER_CAPITA_MONTH * (0.9 + 0.25 * income_norm)

        zones.append(
            {
                "id": f"z{idx:03d}",
                "name": name,
                "polygon": geom,
                "centroid": [round(centroid[0], 6), round(centroid[1], 6)],
                "demographics": {
                    "population": int(pop),
                    "medianIncome": int(income),
                    "renterPct": round(renter, 3),
                    "energyBurdenIndex": round(burden, 3),
                },
                "demandKwhMonthly": round(demand_monthly, 1),
                "solarPotential": round(solar_potential, 3),
                "windPotential": round(wind_potential, 3),
            }
        )
    if water is not None:
        print(f"  ✓ clipped {clipped_count}/{len(zones)} zone polygons to land", file=sys.stderr)
    return zones, prov


# --------------------------------------------------------------------------------------
# Build demand layer (monthly curve per zone) + fold annual-average into zones
# --------------------------------------------------------------------------------------
def build_demand(zones: list[dict]) -> dict:
    per_zone = []
    for z in zones:
        base = z["demandKwhMonthly"]
        monthly = [round(base * m, 1) for m in SEASONAL_CURVE]
        per_zone.append(
            {
                "zoneId": z["id"],
                "name": z["name"],
                "baselineKwhMonthly": base,
                "annualKwh": round(sum(monthly), 1),
                "monthly": monthly,
                "peakMonth": MONTHS[max(range(12), key=lambda i: monthly[i])],
            }
        )
    return {
        "months": MONTHS,
        "seasonalCurve": SEASONAL_CURVE,
        "kwhPerCapitaMonth": KWH_PER_CAPITA_MONTH,
        "note": "Ontario residential seasonal shape: winter heating + summer AC peaks (IESO-style).",
        "zones": per_zone,
    }


# --------------------------------------------------------------------------------------
# Build agents (distributed by zone population)
# --------------------------------------------------------------------------------------
ARCHETYPES = {
    "low": ["renter-lowincome", "renter-lowincome", "social-housing", "small-business"],
    "mid": ["owner-urban", "renter-midincome", "condo-owner", "small-business"],
    "high": ["owner-suburban", "owner-urban", "condo-owner", "ev-enthusiast"],
}


def build_agents(zones: list[dict], rng: random.Random) -> list[dict]:
    total_pop = sum(z["demographics"]["population"] for z in zones)
    agents: list[dict] = []
    counter = 0
    for z in zones:
        demo = z["demographics"]
        share = demo["population"] / total_pop
        n = max(8, round(N_AGENTS * share))
        bracket = income_bracket(demo["medianIncome"])
        renter = demo["renterPct"]
        ring = outer_rings(z)[0]  # largest land part (handles MultiPolygon zones)
        for _ in range(n):
            arch = rng.choice(ARCHETYPES[bracket])
            is_renter = "renter" in arch or "social-housing" in arch or rng.random() < renter * 0.4
            # Rooftop access: owners + low-rise; renters/high-rise rarely control roofs.
            has_rooftop = (not is_renter) and rng.random() < (0.75 - 0.4 * renter + 0.2 * z["solarPotential"])
            # EV ownership scales with income; rare for low bracket.
            ev_prob = {"low": 0.04, "mid": 0.12, "high": 0.30}[bracket]
            ev_owner = rng.random() < ev_prob
            # Solar adoption only if rooftop access; scales with income + solar potential.
            solar_prob = {"low": 0.05, "mid": 0.15, "high": 0.28}[bracket] * (0.5 + z["solarPotential"])
            solar_adopted = has_rooftop and rng.random() < solar_prob
            # Per-agent demand: per-capita-ish with income + EV uplift.
            base = rng.uniform(550, 950)
            base *= {"low": 0.85, "mid": 1.0, "high": 1.35}[bracket]
            if ev_owner:
                base += rng.uniform(250, 400)
            agents.append(
                {
                    "id": f"a{counter:05d}",
                    "zoneId": z["id"],
                    "position": point_in_ring_bbox(ring, rng),
                    "archetype": arch,
                    "demandKwh": round(base, 1),
                    "incomeBracket": bracket,
                    "hasRooftop": bool(has_rooftop),
                    "evOwner": bool(ev_owner),
                    "solarAdopted": bool(solar_adopted),
                }
            )
            counter += 1
    return agents


# --------------------------------------------------------------------------------------
# Build buildings layer (REAL OSM footprints/heights per zone) — feeds 3D + solar
# --------------------------------------------------------------------------------------
def zone_area_km2(ring: list[list[float]]) -> float:
    """Planar polygon area in km² (local equirectangular projection at the ring's mean lat)."""
    lat0 = sum(p[1] for p in ring) / len(ring)
    mlng = 111.320 * math.cos(math.radians(lat0))  # km per deg lng
    mlat = 110.574                                  # km per deg lat
    a = 0.0
    for i in range(len(ring) - 1):
        x0, y0 = ring[i][0] * mlng, ring[i][1] * mlat
        x1, y1 = ring[i + 1][0] * mlng, ring[i + 1][1] * mlat
        a += x0 * y1 - x1 * y0
    return abs(a) / 2.0


def build_buildings(zones: list[dict], osm: dict) -> dict:
    """Per-zone building layer. Real OSM counts/heights where available, else modelled."""
    layer = []
    real = 0
    for z in zones:
        rec = osm.get(z["id"]) or {}
        area = zone_total_area_km2(z)
        count = rec.get("buildingCount")
        levels = rec.get("avgLevels")
        source = "osm"
        if not count:
            # Fallback: estimate from population (rough Toronto-wide ratio) when OSM missing.
            count = max(1, int(z["demographics"]["population"] / 12))
            source = "modelled"
        if not levels:
            # Estimate storeys from renter share (high-rise proxy) when OSM missing.
            levels = round(1.5 + 9.0 * z["demographics"]["renterPct"], 1)
            if source == "osm":
                source = "osm-count-only"
        else:
            real += 1
        roof_area = round(count * TYPICAL_FOOTPRINT_M2, 0)
        layer.append({
            "zoneId": z["id"],
            "name": z["name"],
            "buildingCount": int(count),
            "areaKm2": round(area, 3),
            "buildingDensityPerKm2": round(count / area, 1) if area else None,
            "avgLevels": levels,
            "avgHeightM": round(levels * METRES_PER_LEVEL, 1),
            "estFootprintAreaM2": roof_area,
            "source": source,
        })
    return {
        "note": "Per-zone building stats from OpenStreetMap (Overpass): real building counts and "
                "mean storeys (building:levels). Footprint area = count × ~160 m². Heights "
                "(levels × 3.1 m) feed 3D extrusion; roof area feeds the solar layer.",
        "source": "OpenStreetMap / Overpass API (ODbL)",
        "typicalFootprintM2": TYPICAL_FOOTPRINT_M2,
        "metresPerLevel": METRES_PER_LEVEL,
        "realZones": real,
        "zones": layer,
    }


# --------------------------------------------------------------------------------------
# Build solar layer (per-zone)
# --------------------------------------------------------------------------------------
def build_solar(zones: list[dict], agents: list[dict], buildings: dict, pvgis: dict) -> dict:
    # Pre-aggregate rooftop counts per zone.
    roof_by_zone: dict[str, int] = {}
    adopted_by_zone: dict[str, int] = {}
    for a in agents:
        if a["hasRooftop"]:
            roof_by_zone[a["zoneId"]] = roof_by_zone.get(a["zoneId"], 0) + 1
        if a["solarAdopted"]:
            adopted_by_zone[a["zoneId"]] = adopted_by_zone.get(a["zoneId"], 0) + 1

    footprint_by_zone = {b["zoneId"]: b for b in buildings["zones"]}
    real_yield = 0

    layer = []
    for z in zones:
        sp = z["solarPotential"]
        rooftops = roof_by_zone.get(z["id"], 0)
        adopted = adopted_by_zone.get(z["id"], 0)
        bz = footprint_by_zone.get(z["id"], {})
        roof_m2 = bz.get("estFootprintAreaM2", 0.0)
        # Usable rooftop area = footprint × solarPotential (avoids shading/obstructions/orientation).
        usable_m2 = roof_m2 * sp
        # PV capacity at ~0.16 kW per usable m² (≈6 m²/kW modern panels).
        est_capacity_kw = round(usable_m2 * 0.16, 1)
        # REAL PVGIS PV yield (kWh/kWp/yr) where available, else conservative 1150 assumption.
        pv = pvgis.get(z["id"]) or {}
        pv_yield = pv.get("pvYieldKwhPerKwp")
        yield_src = "pvgis"
        if not pv_yield:
            pv_yield, yield_src = 1150.0, "assumed"
        else:
            real_yield += 1
        est_annual_kwh = round(est_capacity_kw * pv_yield, 0)
        monthly = pv.get("monthlyEm")  # real per-kWp monthly shape
        monthly_gen = ([round(est_capacity_kw * m, 0) for m in monthly] if monthly else None)
        layer.append(
            {
                "zoneId": z["id"],
                "name": z["name"],
                "centroid": z["centroid"],
                "solarPotential": sp,
                "pvYieldKwhPerKwp": pv_yield,
                "irradiationKwhM2Yr": pv.get("irradiationKwhM2Yr"),
                "optimalSlopeDeg": pv.get("optimalSlope"),
                "buildingCount": bz.get("buildingCount"),
                "rooftopFootprintM2": roof_m2,
                "usableRoofM2": round(usable_m2, 0),
                "rooftopAgents": rooftops,
                "solarAdoptedAgents": adopted,
                "estRooftopCapacityKw": est_capacity_kw,
                "estAnnualGenerationKwh": est_annual_kwh,
                "monthlyGenerationKwh": monthly_gen,
                "yieldSource": yield_src,
                "footprintSource": bz.get("source", "modelled"),
            }
        )
    return {
        "note": "Per-zone rooftop solar layer. PV yield + irradiation + monthly shape from PVGIS "
        "(EU JRC, real); usable roof area = real OSM building footprint × solarPotential; "
        "capacity ≈0.16 kW/m². Annual gen = capacity × real PVGIS yield.",
        "source": "PVGIS v5.2 (EC JRC) + OpenStreetMap footprints",
        "kwPerUsableM2": 0.16,
        "realYieldZones": real_yield,
        "zones": layer,
    }


def main() -> int:
    rng = random.Random(SEED)
    OUT_DIR.mkdir(parents=True, exist_ok=True)

    osm = load_osm_buildings()
    pvgis = load_pvgis_solar()
    attitudes_extract = load_attitudes_extract()
    zones, prov = build_zones(rng, osm, pvgis)
    demand = build_demand(zones)
    agents = build_agents(zones, rng)
    buildings = build_buildings(zones, osm)
    solar = build_solar(zones, agents, buildings, pvgis)
    attitudes = build_attitudes(zones, attitudes_extract)
    facilities = build_facilities(zones)
    existing_infra = build_existing_infra(zones)
    flood, flood_risk = build_flood(zones)
    constraints = build_constraints(zones, flood_risk)
    environment = build_environment(zones, load_wellbeing_env())
    heat_vulnerability = build_heat_vulnerability(zones, buildings, environment)
    archetypes = build_archetypes(zones, buildings)
    district_energy = build_district_energy(zones)
    sbei = build_sbei()
    generation_mix = build_generation_mix()

    (OUT_DIR / "zones.json").write_text(json.dumps(zones, indent=2))
    (OUT_DIR / "demand.json").write_text(json.dumps(demand, indent=2))
    (OUT_DIR / "agents.json").write_text(json.dumps(agents, indent=2))
    (OUT_DIR / "buildings.json").write_text(json.dumps(buildings, indent=2))
    (OUT_DIR / "solar.json").write_text(json.dumps(solar, indent=2))
    if attitudes:
        (OUT_DIR / "attitudes.json").write_text(json.dumps(attitudes, indent=2))
    if facilities:
        (OUT_DIR / "facilities.json").write_text(json.dumps(facilities, indent=2))
    if existing_infra:
        (OUT_DIR / "existing_infra.json").write_text(json.dumps(existing_infra, indent=2))
    if constraints:
        (OUT_DIR / "constraints.json").write_text(json.dumps(constraints, indent=2))
    if environment:
        (OUT_DIR / "environment.json").write_text(json.dumps(environment, indent=2))
    if flood:
        (OUT_DIR / "flood.json").write_text(json.dumps(flood, indent=2))
    (OUT_DIR / "heat_vulnerability.json").write_text(json.dumps(heat_vulnerability, indent=2))
    if archetypes:
        (OUT_DIR / "archetypes.json").write_text(json.dumps(archetypes, indent=2))
    (OUT_DIR / "district_energy.json").write_text(json.dumps(district_energy, indent=2))
    (OUT_DIR / "sbei.json").write_text(json.dumps(sbei, indent=2))
    (OUT_DIR / "generation_mix.json").write_text(json.dumps(generation_mix, indent=2))

    n = len(zones)
    print(f"\nProvenance (real / synthetic-fallback of {n} zones):")
    for field, c in prov.items():
        print(f"  {field:16} real={c['real']:2}  synthetic={c['synthetic']:2}")
    print(f"  buildings(OSM)   real={buildings['realZones']:2}  "
          f"synthetic={n - buildings['realZones']:2}")
    print(f"  solarYield(PVGIS) real={solar['realYieldZones']:2}  "
          f"synthetic={n - solar['realYieldZones']:2}")
    print(f"\nWrote {n} zones, {len(agents)} agents, {len(buildings['zones'])} building recs -> {OUT_DIR}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
