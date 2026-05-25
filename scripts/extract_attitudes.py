#!/usr/bin/env python3
"""Extract REAL resident climate attitudes from the City of Toronto Climate Perceptions Study 2021.

Source: data/raw/toronto-open-data/climate-perceptions-2021-v1.xlsx (official crosstab tables).
We pull Top2Box percentages (Total + the 4 Region banner columns) for a few high-signal items and
cache them to data/raw/toronto-open-data/attitudes_extract.json. build.py (stdlib-only) then joins
these to our 44 zones by region to produce data/processed/attitudes.json.

Region banner columns (former municipalities): Etobicoke / Metro Toronto (old City core) /
North York / Scarborough — which we map to zones by centroid in build.py.

Requires openpyxl. Run:  python3 scripts/extract_attitudes.py
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

import openpyxl

REPO_ROOT = Path(__file__).resolve().parents[1]
XLSX = REPO_ROOT / "data" / "raw" / "toronto-open-data" / "climate-perceptions-2021-v1.xlsx"
OUT = REPO_ROOT / "data" / "raw" / "toronto-open-data" / "attitudes_extract.json"

# Banner column index (0-based within each row tuple): A=Total .. region cols.
BANNER = {"Total": 1, "Etobicoke": 7, "Metro Toronto": 8, "North York": 9, "Scarborough": 10}

# metric key -> (sheet name, item-label substring to match, Top2Box meaning)
ITEMS = {
    "climateConcern":           ("29", "as it affects toronto",              "concerned (top-2)"),
    "importanceFightingClimate":("13", "fighting climate change",            "important (top-2)"),
    "agreeEveryoneReduce":      ("47", "everyone needs to reduce their emissions", "agree (top-2)"),
    "likelyAddSolar":           ("67", "add solar panels to my home",        "likely (top-2)"),
    "likelyBuyEV":              ("67", "electric or hybrid vehicle",         "likely (top-2)"),
    "likelyRetrofit":           ("67", "major home renovations for energy",  "likely (top-2)"),
}


def extract_item(ws, label_sub: str) -> dict | None:
    rows = list(ws.iter_rows(values_only=True))
    for i, r in enumerate(rows):
        lab = str(r[0]).strip().lower() if r[0] else ""
        if lab and label_sub in lab:
            # The percentage row immediately follows the count (label) row.
            pct = rows[i + 1] if i + 1 < len(rows) else None
            if not pct:
                return None
            out = {}
            for region, col in BANNER.items():
                try:
                    v = float(pct[col])
                    out[region] = round(v, 3)
                except (TypeError, ValueError):
                    pass
            return out or None
    return None


def main() -> int:
    if not XLSX.exists():
        print(f"missing {XLSX} — download it first", file=sys.stderr)
        return 1
    wb = openpyxl.load_workbook(XLSX, read_only=True, data_only=True)
    items: dict = {}
    for key, (sheet, sub, meaning) in ITEMS.items():
        rec = extract_item(wb[sheet], sub)
        if rec:
            rec["_meaning"] = meaning
            items[key] = rec
            print(f"  {key:26} {rec.get('Total')}  (Etob {rec.get('Etobicoke')} / "
                  f"MetroTO {rec.get('Metro Toronto')} / NY {rec.get('North York')} / "
                  f"Scar {rec.get('Scarborough')})", file=sys.stderr)
        else:
            print(f"  {key}: NOT FOUND (sheet {sheet})", file=sys.stderr)
    payload = {
        "source": "City of Toronto Climate Perceptions Study 2021 (v1 crosstab tables)",
        "banner": "Top2Box %; Total + Region (Etobicoke / Metro Toronto / North York / Scarborough)",
        "items": items,
    }
    OUT.write_text(json.dumps(payload, indent=2))
    print(f"wrote {len(items)} attitude metrics -> {OUT.name}", file=sys.stderr)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
