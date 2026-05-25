#!/usr/bin/env python3
"""Fetch REAL OpenStreetMap building stats per zone via the Overpass API.

For each zone polygon we ask Overpass for:
  - total building count (server-side aggregate — cheap, no geometry transfer)
  - a sample of `building:levels` tags -> mean storeys (height proxy for 3D + rooftop estimates)

Results are cached to data/raw/toronto-open-data/osm_buildings.json keyed by zoneId, so the run is
RESUMABLE (re-running only fetches missing zones) and the main build is reproducible/offline after.

Non-interactive, polite (short timeouts + small delay), per-zone fallback on any error.
Run:  python3 scripts/fetch_osm.py        (reads data/processed/zones.json)
"""
from __future__ import annotations

import json
import sys
import time
import urllib.parse
import urllib.request
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[1]
ZONES = REPO_ROOT / "data" / "processed" / "zones.json"
CACHE = REPO_ROOT / "data" / "raw" / "toronto-open-data" / "osm_buildings.json"
ENDPOINTS = [
    "https://overpass-api.de/api/interpreter",
    "https://overpass.kumi.systems/api/interpreter",
]


def overpass(query: str, timeout: float = 45.0) -> dict | None:
    data = urllib.parse.urlencode({"data": query}).encode()
    for url in ENDPOINTS:
        try:
            req = urllib.request.Request(url, data=data, headers={"User-Agent": "wattif-data/1.0"})
            with urllib.request.urlopen(req, timeout=timeout) as resp:
                return json.loads(resp.read())
        except Exception as exc:  # noqa: BLE001 — try next mirror, else give up
            print(f"    overpass {url.split('//')[1][:18]} failed: {exc}", file=sys.stderr)
    return None


def poly_str(ring: list[list[float]]) -> str:
    return " ".join(f"{lat} {lng}" for lng, lat in ring)


def fetch_zone(ring: list[list[float]]) -> dict | None:
    ps = poly_str(ring)
    qc = (f'[out:json][timeout:40];(way["building"](poly:"{ps}");'
          f'relation["building"](poly:"{ps}"););out count;')
    rc = overpass(qc)
    if not rc or not rc.get("elements"):
        return None
    total = int(rc["elements"][0]["tags"]["total"])
    # Height sample (tags only, capped) — building:levels is the most populated height tag in TO.
    qh = f'[out:json][timeout:40];(way["building"]["building:levels"](poly:"{ps}"););out tags 500;'
    rh = overpass(qh) or {"elements": []}
    levels = []
    for e in rh["elements"]:
        v = str(e.get("tags", {}).get("building:levels", "")).split(";")[0].strip()
        try:
            lv = float(v)
            if 0 < lv < 120:
                levels.append(lv)
        except ValueError:
            pass
    avg = round(sum(levels) / len(levels), 2) if levels else None
    return {"buildingCount": total, "avgLevels": avg, "levelsSample": len(levels)}


def main() -> int:
    zones = json.loads(ZONES.read_text())
    cache: dict = {}
    if CACHE.exists():
        try:
            cache = json.loads(CACHE.read_text())
        except Exception:  # noqa: BLE001
            cache = {}
    CACHE.parent.mkdir(parents=True, exist_ok=True)

    todo = [z for z in zones if z["id"] not in cache]
    print(f"OSM building stats: {len(cache)} cached, {len(todo)} to fetch", file=sys.stderr)
    for i, z in enumerate(todo, 1):
        ring = z["polygon"]["coordinates"][0]
        try:
            rec = fetch_zone(ring)
        except Exception as exc:  # noqa: BLE001
            rec = None
            print(f"  [{i}/{len(todo)}] {z['name']}: error {exc}", file=sys.stderr)
        if rec:
            cache[z["id"]] = rec
            print(f"  [{i}/{len(todo)}] {z['name'][:30]:30} buildings={rec['buildingCount']:5} "
                  f"avgLevels={rec['avgLevels']}", file=sys.stderr)
            CACHE.write_text(json.dumps(cache, indent=2))  # checkpoint each zone
        else:
            print(f"  [{i}/{len(todo)}] {z['name'][:30]:30} FAILED (will fallback)", file=sys.stderr)
        time.sleep(1.0)  # polite to the public Overpass endpoint
    print(f"done: {len(cache)}/{len(zones)} zones have OSM stats -> {CACHE.name}", file=sys.stderr)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
