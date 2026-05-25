#!/usr/bin/env python3
"""Extract REAL per-neighbourhood environment indicators from Wellbeing Toronto (Environment).

Source: data/raw/toronto-open-data/wellbeing-environment.xlsx (140-neighbourhood model, 2011 ref).
Indicators: Green Spaces, Tree Cover, Pollutants Released to Air, Green Rebate Programs.
Cached (keyed by normalized neighbourhood name) to wellbeing_environment.json; build.py joins to
our zones by name (stdlib-only).

Requires openpyxl. Run:  python3 scripts/extract_wellbeing.py
"""
from __future__ import annotations

import json
import re
import sys
from pathlib import Path

import openpyxl

REPO_ROOT = Path(__file__).resolve().parents[1]
XLSX = REPO_ROOT / "data" / "raw" / "toronto-open-data" / "wellbeing-environment.xlsx"
OUT = REPO_ROOT / "data" / "raw" / "toronto-open-data" / "wellbeing_environment.json"
SHEET = "RawData-Ref Period 2011"


def normkey(s: str) -> str:
    return re.sub(r"[^a-z0-9]", "", re.sub(r"\([^)]*\)", "", str(s)).lower())


def num(v):
    try:
        return round(float(v), 2)
    except (TypeError, ValueError):
        return None


def main() -> int:
    if not XLSX.exists():
        print(f"missing {XLSX}", file=sys.stderr)
        return 1
    wb = openpyxl.load_workbook(XLSX, read_only=True, data_only=True)
    rows = list(wb[SHEET].iter_rows(values_only=True))
    header = [str(c) if c is not None else "" for c in rows[0]]
    idx = {h: i for i, h in enumerate(header)}

    def col(row, name):
        return row[idx[name]] if name in idx else None

    out = {}
    for r in rows[1:]:
        name = col(r, "Neighbourhood")
        if not name:
            continue
        out[normkey(name)] = {
            "neighbourhood": name,
            "greenSpaces": num(col(r, "Green Spaces")),
            "treeCover": num(col(r, "Tree Cover")),
            "pollutantsToAir": num(col(r, "Pollutants Released to Air")),
            "greenRebatePrograms": num(col(r, "Green Rebate Programs")),
        }
    payload = {
        "source": "Wellbeing Toronto — Environment (City of Toronto, 2011 reference period)",
        "indicators": ["greenSpaces", "treeCover", "pollutantsToAir", "greenRebatePrograms"],
        "byNeighbourhood": out,
    }
    OUT.write_text(json.dumps(payload, indent=2))
    print(f"wrote {len(out)} neighbourhood environment records -> {OUT.name}", file=sys.stderr)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
