"""Shared feature engineering for WattIf ML models.

Both `train.py` and `inference.py` import from here so the exact same feature
construction is used at fit time and at predict time (no train/serve skew).

Inputs are tolerant: every accessor accepts a Pydantic model (snake_case attrs),
a camelCase dict (the wire/contract shape), a snake_case dict, or a flat dict where
``demographics`` fields are hoisted to the top level. See `_field` / `normalize_*`.
"""

from __future__ import annotations

import json
import math
from functools import lru_cache
from pathlib import Path
from typing import Any

# ---------------------------------------------------------------------------
# Domain constants
# ---------------------------------------------------------------------------
# Toronto monthly mean temperature (degrees C), Jan..Dec. Drives the heating/
# cooling seasonality of electricity demand.
TORONTO_TEMP_C: list[float] = [-5.5, -4.5, 0.0, 7.0, 13.5, 19.0, 22.0, 21.0, 17.0, 10.0, 3.5, -2.5]

_COMFORT_C = 18.0          # below this -> heating load; baseline comfort
_COOLING_THRESHOLD_C = 20.0  # above this -> A/C cooling load

# Income bracket encodings (mirrors backend/app/sim/agents.py _INCOME_WEIGHT).
INCOME_WEIGHT = {"low": 0.5, "mid": 1.0, "high": 1.6}
INCOME_ORDINAL = {"low": 0, "mid": 1, "high": 2}
# Representative annual household income per bracket (CAD), for the agent demand model.
INCOME_VALUE = {"low": 32000.0, "mid": 70000.0, "high": 130000.0}

LANDUSE_CATEGORIES = [
    "residential_low",
    "residential_mid",
    "residential_high",
    "mixed_use",
    "commercial",
]

# Feature column order (kept explicit so saved models document their schema).
DEMAND_ZONE_NUMERIC = [
    "population",
    "median_income",
    "renter_pct",
    "energy_burden_index",
    "solar_potential",
    "wind_potential",
    "month_sin",
    "month_cos",
    "temp_c",
    "hdd",
    "cdd",
]
DEMAND_ZONE_CATEGORICAL = ["landuse"]

DEMAND_AGENT_NUMERIC = [
    "income_value",
    "has_rooftop",
    "ev_owner",
    "zone_solar",
    "month_sin",
    "month_cos",
    "temp_c",
    "hdd",
    "cdd",
]
DEMAND_AGENT_CATEGORICAL = ["income_bracket"]

ADOPTION_NUMERIC = [
    "income_weight",
    "has_rooftop",
    "ev_owner",
    "neighbourhood_adoption",
    "incentive_level",
    "solar_potential",
    "trend",
]
ADOPTION_CATEGORICAL = ["income_bracket"]

CLUSTER_FEATURES = [
    "median_income",
    "renter_pct",
    "energy_burden_index",
    "log_demand",
    "solar_potential",
]


# ---------------------------------------------------------------------------
# Tolerant field access
# ---------------------------------------------------------------------------
def _field(obj: Any, *names: str, default: Any = None) -> Any:
    """Return the first present attribute/key among ``names`` (snake or camel)."""
    for name in names:
        if isinstance(obj, dict):
            if name in obj and obj[name] is not None:
                return obj[name]
        elif hasattr(obj, name):
            val = getattr(obj, name)
            if val is not None:
                return val
    return default


def _demographics(zone: Any) -> Any:
    """Return the demographics sub-object, or the zone itself if fields are flat."""
    demo = _field(zone, "demographics")
    return demo if demo is not None else zone


# ---------------------------------------------------------------------------
# Seasonality helpers
# ---------------------------------------------------------------------------
def month_temp(month: int) -> float:
    return TORONTO_TEMP_C[(int(month) - 1) % 12]


def heating_degrees(month: int) -> float:
    return max(_COMFORT_C - month_temp(month), 0.0)


def cooling_degrees(month: int) -> float:
    return max(month_temp(month) - _COOLING_THRESHOLD_C, 0.0)


def seasonal_multiplier(month: int) -> float:
    """Monthly demand multiplier (~1.0 = annual baseline). Bimodal: winter heating
    + summer cooling. Calibrated so the annual mean is ~1.0."""
    return 1.0 + 0.013 * heating_degrees(month) + 0.020 * cooling_degrees(month)


def season_features(month: int) -> dict[str, float]:
    angle = 2.0 * math.pi * ((int(month) - 1) % 12) / 12.0
    return {
        "month_sin": math.sin(angle),
        "month_cos": math.cos(angle),
        "temp_c": month_temp(month),
        "hdd": heating_degrees(month),
        "cdd": cooling_degrees(month),
    }


# ---------------------------------------------------------------------------
# Derived attributes
# ---------------------------------------------------------------------------
def derive_landuse(
    population: float, renter_pct: float, median_income: float, avg_levels: float | None = None
) -> str:
    """Infer a coarse land-use / building archetype. When real OSM building height
    (`avg_levels`) is available it dominates (true high-rise vs low-rise); otherwise
    falls back to a demographic proxy."""
    if avg_levels is not None:
        if avg_levels >= 8.0:
            return "residential_high"   # high-rise
        if avg_levels >= 4.5:
            return "mixed_use"          # mid-rise / mixed
        if median_income >= 120000 and renter_pct < 0.35:
            return "residential_low"    # low-rise affluent
        return "commercial" if renter_pct >= 0.6 else "residential_low"
    # --- demographic fallback (no building data) ---
    if population >= 18000 and renter_pct >= 0.6:
        return "residential_high"
    if renter_pct >= 0.7:
        return "mixed_use"
    if median_income >= 120000 and renter_pct < 0.35:
        return "residential_low"
    if population >= 9000:
        return "residential_mid"
    return "commercial" if renter_pct >= 0.55 else "residential_mid"


def bracket_from_income(income: float) -> str:
    if income < 45000:
        return "low"
    if income < 95000:
        return "mid"
    return "high"


# ---------------------------------------------------------------------------
# Building stats (real OSM) — loaded inside the ml layer and joined by zone id,
# so the backend keeps passing a plain Zone; we enrich internally. Cached.
# ---------------------------------------------------------------------------
_BUILDINGS_PATH = Path(__file__).resolve().parent.parent / "data" / "processed" / "buildings.json"


@lru_cache(maxsize=1)
def _load_buildings() -> dict[str, dict[str, float]]:
    """zoneId -> {avg_levels, building_density}. Empty dict if file absent/bad."""
    try:
        raw = json.loads(_BUILDINGS_PATH.read_text())
        zones = raw.get("zones", raw) if isinstance(raw, dict) else raw
        out: dict[str, dict[str, float]] = {}
        for z in zones:
            zid = z.get("zoneId") or z.get("id")
            if zid is None:
                continue
            out[str(zid)] = {
                "avg_levels": float(z.get("avgLevels", z.get("avg_levels", 0)) or 0) or None,
                "building_density": float(
                    z.get("buildingDensityPerKm2", z.get("building_density", 0)) or 0
                ) or None,
            }
        return out
    except (OSError, json.JSONDecodeError, AttributeError, TypeError):
        return {}


@lru_cache(maxsize=1)
def zone_demand_scale() -> float:
    """A city-scale reference for monthly zone demand (75th percentile from real
    zones.json) used to normalize unmet-demand into 0..1. Falls back to a constant
    if no fixtures are present, so it never blocks the heuristic."""
    try:
        zones = json.loads((_BUILDINGS_PATH.parent / "zones.json").read_text())
        vals = sorted(
            float(z.get("demandKwhMonthly", 0) or 0)
            for z in (zones if isinstance(zones, list) else [])
        )
        vals = [v for v in vals if v > 0]
        if vals:
            return vals[int(0.75 * (len(vals) - 1))]
    except (OSError, json.JSONDecodeError, AttributeError, TypeError, ValueError):
        pass
    return 5_000_000.0


def derive_avg_levels(population: float, renter_pct: float) -> float:
    """Fallback storeys estimate when no real building data — denser/more-rental
    neighbourhoods skew taller. Calibrated to the real OSM range (~1.7..13.3)."""
    return float(min(max(1.7 + 9.0 * renter_pct + population / 18000.0, 1.5), 14.0))


def derive_building_density(population: float, renter_pct: float) -> float:
    """Fallback buildings/km^2 when no real data. Real OSM range ~108..2425."""
    return float(min(max(120.0 + 1600.0 * renter_pct + population / 60.0, 108.0), 2450.0))


# ---------------------------------------------------------------------------
# Normalizers -> canonical scalar dicts
# ---------------------------------------------------------------------------
def normalize_zone(zone: Any) -> dict[str, float | str]:
    demo = _demographics(zone)
    population = float(_field(demo, "population", default=8000) or 8000)
    median_income = float(_field(demo, "median_income", "medianIncome", default=65000) or 65000)
    renter_pct = float(_field(demo, "renter_pct", "renterPct", default=0.45) or 0.45)
    energy_burden = float(
        _field(demo, "energy_burden_index", "energyBurdenIndex", default=0.4) or 0.4
    )
    solar = float(_field(zone, "solar_potential", "solarPotential", default=0.5) or 0.5)
    wind = float(_field(zone, "wind_potential", "windPotential", default=0.3) or 0.3)
    demand_monthly = _field(zone, "demand_kwh_monthly", "demandKwhMonthly")

    # Building stats: explicit on the zone -> buildings.json lookup by id -> derived.
    # Resolved before land-use so real OSM storeys can inform the building archetype.
    zid = _field(zone, "id")
    avg_levels = _field(zone, "avg_levels", "avgLevels")
    building_density = _field(zone, "building_density", "buildingDensityPerKm2")
    have_real_levels = avg_levels is not None
    if (avg_levels is None or building_density is None) and zid is not None:
        bs = _load_buildings().get(str(zid))
        if bs:
            if avg_levels is None and bs.get("avg_levels") is not None:
                avg_levels = bs["avg_levels"]
                have_real_levels = True
            if building_density is None:
                building_density = bs.get("building_density")
    if avg_levels is None:
        avg_levels = derive_avg_levels(population, renter_pct)
    if building_density is None:
        building_density = derive_building_density(population, renter_pct)

    landuse = _field(zone, "land_use", "landUse", "landuse")
    if landuse not in LANDUSE_CATEGORIES:
        # Pass real storeys to the classifier only when we actually have them.
        landuse = derive_landuse(
            population, renter_pct, median_income, avg_levels if have_real_levels else None
        )

    return {
        "population": population,
        "median_income": median_income,
        "renter_pct": renter_pct,
        "energy_burden_index": energy_burden,
        "solar_potential": solar,
        "wind_potential": wind,
        "avg_levels": float(avg_levels),
        "building_density": float(building_density),
        "demand_kwh_monthly": float(demand_monthly) if demand_monthly is not None else None,
        "landuse": landuse,
    }


def normalize_agent(agent: Any) -> dict[str, Any]:
    bracket = _field(agent, "income_bracket", "incomeBracket")
    if bracket not in INCOME_WEIGHT:
        income = _field(agent, "median_income", "medianIncome", "income")
        bracket = bracket_from_income(float(income)) if income is not None else "mid"
    return {
        "income_bracket": bracket,
        "income_value": INCOME_VALUE[bracket],
        "income_weight": INCOME_WEIGHT[bracket],
        "has_rooftop": 1.0 if _field(agent, "has_rooftop", "hasRooftop", default=False) else 0.0,
        "ev_owner": 1.0 if _field(agent, "ev_owner", "evOwner", default=False) else 0.0,
        "solar_adopted": bool(_field(agent, "solar_adopted", "solarAdopted", default=False)),
        "demand_kwh": _field(agent, "demand_kwh", "demandKwh"),
        "zone_id": _field(agent, "zone_id", "zoneId"),
    }


# ---------------------------------------------------------------------------
# Feature-row builders (return dicts; callers assemble into a DataFrame)
# ---------------------------------------------------------------------------
def demand_zone_row(zone_norm: dict, month: int) -> dict[str, Any]:
    s = season_features(month)
    return {
        "population": zone_norm["population"],
        "median_income": zone_norm["median_income"],
        "renter_pct": zone_norm["renter_pct"],
        "energy_burden_index": zone_norm["energy_burden_index"],
        "solar_potential": zone_norm["solar_potential"],
        "wind_potential": zone_norm["wind_potential"],
        "landuse": zone_norm["landuse"],
        **s,
    }


def demand_agent_row(agent_norm: dict, zone_solar: float, month: int) -> dict[str, Any]:
    s = season_features(month)
    return {
        "income_bracket": agent_norm["income_bracket"],
        "income_value": agent_norm["income_value"],
        "has_rooftop": agent_norm["has_rooftop"],
        "ev_owner": agent_norm["ev_owner"],
        "zone_solar": float(zone_solar),
        **s,
    }


def adoption_row(agent_norm: dict, context: dict) -> dict[str, Any]:
    tick = float(context.get("tick", 12) if context else 12)
    trend = 1.0 + min(tick, 60.0) * 0.02
    return {
        "income_bracket": agent_norm["income_bracket"],
        "income_weight": agent_norm["income_weight"],
        "has_rooftop": agent_norm["has_rooftop"],
        "ev_owner": agent_norm["ev_owner"],
        "neighbourhood_adoption": float((context or {}).get("neighbourhood_adoption", 0.1)),
        "incentive_level": float((context or {}).get("incentive_level", 0.3)),
        "solar_potential": float((context or {}).get("solar_potential", 0.5)),
        "trend": trend,
    }


def cluster_row(zone_norm: dict) -> dict[str, Any]:
    demand = zone_norm.get("demand_kwh_monthly")
    if demand is None or demand <= 0:
        # reconstruct a baseline from demographics if no explicit demand
        per_capita = 250 + 0.0009 * zone_norm["median_income"] - 80 * zone_norm["renter_pct"]
        demand = max(zone_norm["population"] * per_capita, 50_000)
    return {
        "median_income": zone_norm["median_income"],
        "renter_pct": zone_norm["renter_pct"],
        "energy_burden_index": zone_norm["energy_burden_index"],
        "log_demand": math.log(max(demand, 1.0)),
        "solar_potential": zone_norm["solar_potential"],
    }
