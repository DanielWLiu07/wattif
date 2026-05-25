#!/usr/bin/env python3
"""Fetch the REAL Toronto Islands LAND polygons from OSM (place=island/islet), not by subtraction.

The Lake Ontario relation's inner ring traces the island GROUP's outer perimeter (lagoons filled),
so water-subtraction yields a blob. Instead we pull the actual island land features and assemble
them — a thin, correctly-shaped archipelago (~3 km²). Cached to islands.geojson; build.py uses these
as the island parts of the Waterfront MultiPolygon (replacing the subtraction blob).

Non-interactive. Requires shapely. Run:  python3 scripts/fetch_islands.py
"""
from __future__ import annotations

import json
import sys
import urllib.parse
import urllib.request
from pathlib import Path

from shapely.geometry import LineString, Polygon, mapping
from shapely.ops import polygonize, unary_union

REPO_ROOT = Path(__file__).resolve().parents[1]
OUT = REPO_ROOT / "data" / "raw" / "toronto-open-data" / "islands.geojson"
BBOX = "43.600,-79.420,43.635,-79.330"   # Toronto Islands / harbour
ENDPOINTS = [
    "https://overpass.kumi.systems/api/interpreter",
    "https://overpass-api.de/api/interpreter",
]


def overpass(query: str, timeout: float = 90.0) -> dict | None:
    data = urllib.parse.urlencode({"data": query}).encode()
    for url in ENDPOINTS:
        try:
            req = urllib.request.Request(url, data=data, headers={"User-Agent": "wattif-data/1.0"})
            with urllib.request.urlopen(req, timeout=timeout) as resp:
                return json.loads(resp.read())
        except Exception as exc:  # noqa: BLE001
            print(f"  overpass {url.split('//')[1][:18]} failed: {exc}", file=sys.stderr)
    return None


def main() -> int:
    q = (f'[out:json][timeout:80];('
         f'relation["place"~"island|islet"]({BBOX});'
         f'way["place"~"island|islet"]({BBOX}););out geom;')
    res = overpass(q)
    els = (res or {}).get("elements", [])
    if not els:
        print("no island features returned; aborting (build.py falls back to mainland-only)",
              file=sys.stderr)
        return 1

    polys = []
    for e in els:
        name = (e.get("tags") or {}).get("name")
        if e["type"] == "way":
            pts = [(p["lon"], p["lat"]) for p in e.get("geometry", [])]
            if len(pts) >= 4:
                pg = Polygon(pts)
                if not pg.is_valid:
                    pg = pg.buffer(0)
                if not pg.is_empty:
                    polys.append(pg)
        else:  # relation: assemble outer rings minus inner rings
            outer = [LineString([(p["lon"], p["lat"]) for p in m["geometry"]])
                     for m in e.get("members", []) if m.get("role") == "outer"
                     and len(m.get("geometry", [])) >= 2]
            inner = [LineString([(p["lon"], p["lat"]) for p in m["geometry"]])
                     for m in e.get("members", []) if m.get("role") == "inner"
                     and len(m.get("geometry", [])) >= 2]
            op = list(polygonize(unary_union(outer))) if outer else []
            ip = list(polygonize(unary_union(inner))) if inner else []
            if op:
                g = unary_union(op)
                if ip:
                    g = g.difference(unary_union(ip))
                if not g.is_empty:
                    polys.append(g)
        if name:
            print(f"  island feature: {name}", file=sys.stderr)

    if not polys:
        print("island features had no usable geometry; aborting", file=sys.stderr)
        return 1
    land = unary_union(polys)
    if not land.is_valid:
        land = land.buffer(0)
    km2 = land.area * (111.0 * 111.0 * 0.723)
    n = len(land.geoms) if land.geom_type == "MultiPolygon" else 1
    print(f"  assembled island land: {km2:.2f} km^2 in {n} piece(s)", file=sys.stderr)

    OUT.write_text(json.dumps({
        "type": "Feature",
        "properties": {"name": "Toronto Islands land", "source": "OpenStreetMap place=island (ODbL)",
                       "areaKm2": round(km2, 2)},
        "geometry": mapping(land),
    }))
    print(f"wrote island land -> {OUT.name}", file=sys.stderr)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
