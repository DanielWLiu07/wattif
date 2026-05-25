#!/usr/bin/env python3
"""Build a Toronto WATER mask (Lake Ontario + Inner Harbour + local water bodies) from OSM.

Fetches the Lake Ontario multipolygon relation (outer rings = lake, inner rings = islands such as
the Toronto Islands -> preserved as LAND holes) plus local natural=water ways (harbour basins,
slips, lagoons, ponds) within the Toronto bbox via Overpass. Assembles them with shapely, clips to
the working bbox, and caches the result to data/raw/toronto-open-data/water_mask.geojson.

build.py subtracts this mask from each zone polygon so neighbourhood fills follow the real
shoreline instead of bleeding over the lake/harbour.

Non-interactive. Requires shapely. Run:  python3 scripts/fetch_water_mask.py
"""
from __future__ import annotations

import json
import sys
import urllib.parse
import urllib.request
from pathlib import Path

from shapely.geometry import LineString, Polygon, box, mapping
from shapely.ops import polygonize, unary_union

REPO_ROOT = Path(__file__).resolve().parents[1]
OUT = REPO_ROOT / "data" / "raw" / "toronto-open-data" / "water_mask.geojson"

S, W, N, E = 43.58, -79.56, 43.71, -79.12          # working bbox (whole Toronto shoreline + Islands)
LAKE_ONTARIO_REL = 1206310
ENDPOINTS = [
    "https://overpass-api.de/api/interpreter",
    "https://overpass.kumi.systems/api/interpreter",
]


def overpass(query: str, timeout: float = 150.0) -> dict | None:
    data = urllib.parse.urlencode({"data": query}).encode()
    for url in ENDPOINTS:
        try:
            req = urllib.request.Request(url, data=data, headers={"User-Agent": "wattif-data/1.0"})
            with urllib.request.urlopen(req, timeout=timeout) as resp:
                return json.loads(resp.read())
        except Exception as exc:  # noqa: BLE001
            print(f"  overpass {url.split('//')[1][:18]} failed: {exc}", file=sys.stderr)
    return None


def _polys_from_lines(lines: list[LineString]):
    if not lines:
        return []
    return list(polygonize(unary_union(lines)))


def main() -> int:
    bbox = box(W, S, E, N)

    # 1) Lake Ontario multipolygon: outer rings = water, inner rings = islands (land holes).
    rel = overpass(f"[out:json][timeout:140];rel({LAKE_ONTARIO_REL});out geom;")
    lake = None
    if rel and rel.get("elements"):
        members = rel["elements"][0].get("members", [])
        outer = [LineString([(p["lon"], p["lat"]) for p in m["geometry"]])
                 for m in members if m.get("role") == "outer" and len(m.get("geometry", [])) >= 2]
        inner = [LineString([(p["lon"], p["lat"]) for p in m["geometry"]])
                 for m in members if m.get("role") == "inner" and len(m.get("geometry", [])) >= 2]
        outer_polys = _polys_from_lines(outer)
        inner_polys = _polys_from_lines(inner)
        if outer_polys:
            lake = unary_union(outer_polys)
            if inner_polys:                      # carve out islands (Toronto Islands etc.)
                lake = lake.difference(unary_union(inner_polys))
            print(f"  Lake Ontario: {len(outer_polys)} outer / {len(inner_polys)} inner rings",
                  file=sys.stderr)
    if lake is not None:
        lake = lake.intersection(bbox)

    # 2) Local water bodies (harbour basins, slips, lagoons, ponds) within the bbox.
    ways = overpass(f'[out:json][timeout:90];way["natural"="water"]({S},{W},{N},{E});out geom;')
    local = []
    for el in (ways or {}).get("elements", []):
        pts = [(p["lon"], p["lat"]) for p in el.get("geometry", [])]
        if len(pts) >= 4 and pts[0] == pts[-1]:
            try:
                poly = Polygon(pts)
                if not poly.is_valid:
                    poly = poly.buffer(0)
                local.append(poly)
            except Exception:  # noqa: BLE001
                pass
    print(f"  local water polygons: {len(local)}", file=sys.stderr)

    parts = [g for g in ([lake] + local) if g is not None and not g.is_empty]
    if not parts:
        print("no water assembled; aborting (build.py keeps unclipped polygons)", file=sys.stderr)
        return 1
    water = unary_union(parts).intersection(bbox)
    if not water.is_valid:
        water = water.buffer(0)
    print(f"  water area (deg^2): {water.area:.4f}  (bbox is {bbox.area:.4f})", file=sys.stderr)

    OUT.write_text(json.dumps({
        "type": "Feature",
        "properties": {"name": "Toronto water mask (Lake Ontario + Inner Harbour + water bodies)",
                       "source": "OpenStreetMap natural=water via Overpass (ODbL)"},
        "geometry": mapping(water),
    }))
    print(f"wrote water mask -> {OUT.name}", file=sys.stderr)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
