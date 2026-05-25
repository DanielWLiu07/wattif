#!/usr/bin/env python3
"""Fetch REAL solar PV yield per zone from PVGIS (EU JRC) — free, no API key.

For each zone centroid we call PVGIS v5.2 PVcalc (1 kWp, 14% loss, optimal tilt) to get:
  - pvYieldKwhPerKwp   : real annual PV energy per installed kWp (kWh/kWp/yr)
  - irradiationKwhM2Yr : real in-plane annual irradiation (kWh/m²/yr)
  - optimalSlope       : optimal panel tilt (degrees)
  - monthlyEm          : real monthly PV energy shape (12 × kWh/kWp)

Cached to data/raw/toronto-open-data/pvgis_solar.json (keyed by zoneId) — RESUMABLE and makes the
main build reproducible/offline. Non-interactive, short timeout, per-zone fallback.

Run:  python3 scripts/fetch_pvgis.py     (reads data/processed/zones.json)
"""
from __future__ import annotations

import json
import sys
import time
import urllib.request
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[1]
ZONES = REPO_ROOT / "data" / "processed" / "zones.json"
CACHE = REPO_ROOT / "data" / "raw" / "toronto-open-data" / "pvgis_solar.json"
API = "https://re.jrc.ec.europa.eu/api/v5_2/PVcalc"


def fetch(lat: float, lon: float, timeout: float = 25.0) -> dict | None:
    url = (f"{API}?lat={lat:.5f}&lon={lon:.5f}&peakpower=1&loss=14"
           f"&optimalangles=1&outputformat=json")
    try:
        req = urllib.request.Request(url, headers={"User-Agent": "wattif-data/1.0"})
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            r = json.loads(resp.read())
        tot = r["outputs"]["totals"]["fixed"]
        monthly = [round(m["E_m"], 2) for m in r["outputs"]["monthly"]["fixed"]]
        slope = r["inputs"]["mounting_system"]["fixed"]["slope"]["value"]
        return {
            "pvYieldKwhPerKwp": round(tot["E_y"], 1),
            "irradiationKwhM2Yr": round(tot["H(i)_y"], 1),
            "optimalSlope": slope,
            "monthlyEm": monthly,
        }
    except Exception as exc:  # noqa: BLE001 — any error -> per-zone fallback
        print(f"    PVGIS failed: {exc}", file=sys.stderr)
        return None


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
    print(f"PVGIS solar: {len(cache)} cached, {len(todo)} to fetch", file=sys.stderr)
    for i, z in enumerate(todo, 1):
        lon, lat = z["centroid"]
        rec = fetch(lat, lon)
        if rec:
            cache[z["id"]] = rec
            print(f"  [{i}/{len(todo)}] {z['name'][:30]:30} E_y={rec['pvYieldKwhPerKwp']} "
                  f"kWh/kWp slope={rec['optimalSlope']}°", file=sys.stderr)
            CACHE.write_text(json.dumps(cache, indent=2))
        else:
            print(f"  [{i}/{len(todo)}] {z['name'][:30]:30} FAILED (fallback)", file=sys.stderr)
        time.sleep(0.7)
    print(f"done: {len(cache)}/{len(zones)} zones have PVGIS solar -> {CACHE.name}", file=sys.stderr)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
