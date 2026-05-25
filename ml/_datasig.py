"""Print an md5 signature of ONLY the fixture fields the ML models train on.

Used by the standby watcher so it wakes on a real training-data change, not on
cosmetic churn (agent positions, polygon coordinates, re-emitted timestamps) that
data-2 touches without affecting any model. Prints `no-data` if fixtures are absent.

    python -m ml._datasig    # -> e.g. 3f9c... (or "no-data")
"""

from __future__ import annotations

import hashlib
import json
from pathlib import Path

PROCESSED = Path(__file__).resolve().parent.parent / "data" / "processed"


def signature() -> str:
    zpath, apath = PROCESSED / "zones.json", PROCESSED / "agents.json"
    if not zpath.exists() or not apath.exists():
        return "no-data"
    try:
        zones = json.loads(zpath.read_text())
        agents = json.loads(apath.read_text())
    except (OSError, json.JSONDecodeError):
        return "no-data"

    # Zone fields the models use: demographics + solar + demand (NOT polygon/centroid).
    zsig = sorted(
        (
            z.get("id"),
            d.get("population"),
            d.get("medianIncome"),
            round(float(d.get("renterPct", 0)), 4),
            round(float(d.get("energyBurdenIndex", 0)), 4),
            round(float(z.get("solarPotential", 0)), 4),
            round(float(z.get("demandKwhMonthly", 0)), 1),
        )
        for z in zones
        for d in [z.get("demographics", {})]
    )
    # Agent fields the models use (NOT position).
    asig = sorted(
        (
            a.get("zoneId"),
            a.get("incomeBracket"),
            bool(a.get("hasRooftop")),
            bool(a.get("evOwner")),
            round(float(a.get("demandKwh", 0)), 1),
        )
        for a in agents
    )
    # buildings.json avgLevels feeds the landuse category, so include it if present.
    bpath = PROCESSED / "buildings.json"
    bsig: list = []
    if bpath.exists():
        try:
            braw = json.loads(bpath.read_text())
            bzones = braw.get("zones", []) if isinstance(braw, dict) else braw
            bsig = sorted(
                (b.get("zoneId"), round(float(b.get("avgLevels", 0)), 2)) for b in bzones
            )
        except (OSError, json.JSONDecodeError, AttributeError):
            bsig = []

    blob = json.dumps([zsig, asig, bsig], sort_keys=True, default=str).encode()
    return hashlib.md5(blob).hexdigest()


if __name__ == "__main__":
    print(signature())
