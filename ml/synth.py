"""Synthetic, principled training data for WattIf ML models.

We do NOT depend on the backend or data lanes (separate workers, no cross-imports).
Instead we generate a training set whose data-generating process is intentionally
consistent with the WattIf contract (docs/PLAN.md) and the rule-based relationships
the backend already encodes (seed.py demand formula, agents.py adoption hazard).

If `data/processed/zones.json` lands later, train.py prefers those real zones for
clustering and as anchors; the synthetic generator below is the fallback and the
source of the per-month / per-agent rows the regressors and classifier need.

Generating process (documented so it can be audited / replaced with real data):
  income_tier, density ~ U(0,1)
  population      = clip(N(3000 + 22000*density, 2500), 800, 40000)
  median_income   = clip(N(42000 + 95000*income_tier, 9000), 26000, 220000)
  renter_pct      = clip(0.25 + 0.5*density - 0.35*income_tier + N(0,0.06), .05, .95)
  energy_burden   = clip(0.65*(1-income_tier) + 0.30*renter_pct + N(0,0.05), .02, .98)
  solar_potential = clip(0.78 - 0.45*density + N(0,0.06), .12, .95)
  base demand     = population * (250 + 180*income_tier - 60*density)  [monthly, annual-avg]
  monthly demand  = base * seasonal_multiplier(month) * (1 + N(0,0.04))
  agent demand    = base_bracket(+EV) * seasonal_multiplier(month) * (1 + N(0,0.05))
  adoption label  = Bernoulli(cumulative hazard over a horizon), hazard mirrors
                    agents.py: p = 0.015*income_weight*(0.4+solar)*trend*(1+0.8*boost)
"""

from __future__ import annotations

import numpy as np
import pandas as pd

from . import features as F


def _make_zones(rng: np.random.Generator, n_zones: int) -> pd.DataFrame:
    income_tier = rng.uniform(0, 1, n_zones)
    density = rng.uniform(0, 1, n_zones)
    population = np.clip(rng.normal(3000 + 22000 * density, 2500), 800, 40000)
    median_income = np.clip(rng.normal(42000 + 95000 * income_tier, 9000), 26000, 220000)
    renter_pct = np.clip(0.25 + 0.5 * density - 0.35 * income_tier + rng.normal(0, 0.06, n_zones), 0.05, 0.95)
    energy_burden = np.clip(
        0.65 * (1 - income_tier) + 0.30 * renter_pct + rng.normal(0, 0.05, n_zones), 0.02, 0.98
    )
    # Height-driven solar: taller/denser built form -> less per-capita roof availability
    # (matches the real OSM-derived solarPotential, now ~0.05..0.69).
    solar = np.clip(0.72 - 0.50 * density + rng.normal(0, 0.06, n_zones), 0.05, 0.70)
    wind = np.clip(rng.normal(0.30, 0.12, n_zones), 0.02, 0.85)
    # Built form (calibrated to real OSM ranges: avgLevels ~1.7..13.3, density ~108..2425/km^2)
    avg_levels = np.clip(rng.normal(1.7 + 12.0 * density, 1.5), 1.5, 14.0)
    building_density = np.clip(rng.normal(150 + 2300 * density, 220), 108, 2425)
    per_capita = 250 + 180 * income_tier - 60 * density
    base_monthly = np.maximum(population * per_capita, 50_000)

    df = pd.DataFrame(
        {
            "income_tier": income_tier,
            "density": density,
            "population": population,
            "median_income": median_income,
            "renter_pct": renter_pct,
            "energy_burden_index": energy_burden,
            "solar_potential": solar,
            "wind_potential": wind,
            "avg_levels": avg_levels,
            "building_density": building_density,
            "base_monthly": base_monthly,
        }
    )
    df["landuse"] = [
        F.derive_landuse(p, r, m, lv)
        for p, r, m, lv in zip(
            df["population"], df["renter_pct"], df["median_income"], df["avg_levels"]
        )
    ]
    # annual-average baseline (seasonal multiplier averages ~1 over the year)
    annual_avg_mult = float(np.mean([F.seasonal_multiplier(m) for m in range(1, 13)]))
    df["demand_kwh_monthly"] = df["base_monthly"] * annual_avg_mult
    return df


def demand_zone_dataset(rng: np.random.Generator, n_zones: int = 500) -> pd.DataFrame:
    """One row per (zone, month). Target = monthly demand kWh."""
    zones = _make_zones(rng, n_zones)
    rows = []
    targets = []
    for _, z in zones.iterrows():
        for month in range(1, 13):
            row = F.demand_zone_row(z.to_dict(), month)
            demand = z["base_monthly"] * F.seasonal_multiplier(month) * (1 + rng.normal(0, 0.04))
            rows.append(row)
            targets.append(max(demand, 1000.0))
    X = pd.DataFrame(rows)
    y = pd.Series(targets, name="demand_kwh_monthly")
    return X.assign(__target=y)


def demand_agent_dataset(rng: np.random.Generator, n_agents: int = 9000) -> pd.DataFrame:
    """One row per agent (single representative month sampled). Target = monthly kWh."""
    brackets = rng.choice(["low", "mid", "high"], size=n_agents, p=[0.4, 0.42, 0.18])
    base_map = {"low": 280.0, "mid": 520.0, "high": 880.0}
    rows = []
    targets = []
    for bracket in brackets:
        zone_solar = float(rng.uniform(0.12, 0.95))
        ev = rng.random() < (0.05 + 0.20 * (bracket == "high") + 0.08 * (bracket == "mid"))
        has_rooftop = (bracket != "low") and (rng.random() < 0.5)
        month = int(rng.integers(1, 13))
        base = max(rng.normal(base_map[bracket], base_map[bracket] * 0.25), 60)
        if ev:
            base += rng.normal(250, 60)
        demand = base * F.seasonal_multiplier(month) * (1 + rng.normal(0, 0.05))
        agent_norm = {
            "income_bracket": bracket,
            "income_value": F.INCOME_VALUE[bracket],
            "has_rooftop": 1.0 if has_rooftop else 0.0,
            "ev_owner": 1.0 if ev else 0.0,
        }
        rows.append(F.demand_agent_row(agent_norm, zone_solar, month))
        targets.append(max(demand, 30.0))
    X = pd.DataFrame(rows)
    return X.assign(__target=pd.Series(targets, name="demand_kwh"))


def adoption_dataset(rng: np.random.Generator, n_agents: int = 12000, horizon: int = 24) -> pd.DataFrame:
    """One row per agent. Target = adopts solar (if rooftop) or EV over `horizon` months.

    Hazard mirrors backend/app/sim/agents.py; boost combines existing neighbourhood
    adoption + policy incentive (the two levers the optimizer / policy slider expose).
    """
    brackets = rng.choice(["low", "mid", "high"], size=n_agents, p=[0.4, 0.42, 0.18])
    rows = []
    labels = []
    for bracket in brackets:
        income_weight = F.INCOME_WEIGHT[bracket]
        solar = float(rng.uniform(0.12, 0.95))
        has_rooftop = (bracket != "low" or rng.random() < 0.2) and rng.random() < 0.6
        ev = rng.random() < (0.05 + 0.20 * (bracket == "high") + 0.08 * (bracket == "mid"))
        neigh = float(rng.uniform(0.0, 0.6))
        incentive = float(rng.uniform(0.0, 1.0))
        tick = float(rng.integers(0, 60))
        trend = 1.0 + min(tick, 60.0) * 0.02
        boost = 0.5 * neigh + 0.5 * incentive

        # per-tick rooftop-solar hazard (agents.py) and a parallel EV hazard
        p_solar = 0.015 * income_weight * (0.4 + solar) * trend * (1 + 0.8 * boost)
        p_solar = min(p_solar, 0.25)
        p_ev = 0.010 * income_weight * trend * (1 + 0.6 * incentive)
        p_ev = min(p_ev, 0.20)

        cum_solar = 1 - (1 - p_solar) ** horizon if has_rooftop else 0.0
        cum_ev = 1 - (1 - p_ev) ** horizon
        cum = 1 - (1 - cum_solar) * (1 - cum_ev)
        adopted = 1 if rng.random() < cum else 0

        rows.append(
            {
                "income_bracket": bracket,
                "income_weight": income_weight,
                "has_rooftop": 1.0 if has_rooftop else 0.0,
                "ev_owner": 1.0 if ev else 0.0,
                "neighbourhood_adoption": neigh,
                "incentive_level": incentive,
                "solar_potential": solar,
                "trend": trend,
            }
        )
        labels.append(adopted)
    X = pd.DataFrame(rows)
    return X.assign(__target=pd.Series(labels, name="adopted"))


def cluster_dataset(rng: np.random.Generator, n_zones: int = 500) -> pd.DataFrame:
    """Zone-level rows for KMeans (one row per zone)."""
    zones = _make_zones(rng, n_zones)
    rows = [F.cluster_row(z.to_dict()) for _, z in zones.iterrows()]
    return pd.DataFrame(rows)
