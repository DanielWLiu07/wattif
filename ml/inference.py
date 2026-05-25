"""Inference surface for the WattIf backend.

Clean import surface:
    from ml.inference import predict_demand, adoption_prob, zone_cluster

Every function has a deterministic HEURISTIC FALLBACK used when the trained
artifacts in ml/models/ are missing or fail to load — so importing/using this
module NEVER raises and never blocks the demo. The backend can import this
unconditionally; if ml/ has not been trained it still gets sane numbers.

Inputs are tolerant: pass a Pydantic Zone/Agent, a camelCase dict (contract wire
shape), or a snake_case dict. See ml/features.py for the accessors.
"""

from __future__ import annotations

import math
from functools import lru_cache
from pathlib import Path
from typing import Any

import numpy as np
import pandas as pd

from . import features as F

MODELS_DIR = Path(__file__).resolve().parent / "models"


# ---------------------------------------------------------------------------
# Lazy, cached artifact loading (returns None on any problem -> fallback path)
# ---------------------------------------------------------------------------
@lru_cache(maxsize=None)
def _load(name: str):
    try:
        import joblib  # local import so the module imports even without joblib

        path = MODELS_DIR / f"{name}.joblib"
        if not path.exists():
            return None
        return joblib.load(path)
    except Exception:  # noqa: BLE001 — any load issue -> heuristic fallback
        return None


def models_available() -> dict[str, bool]:
    """Diagnostic: which trained artifacts are present and loadable."""
    return {n: _load(n) is not None for n in ("demand_zone", "demand_agent", "adoption", "cluster")}


def _looks_like_agent(obj: Any) -> bool:
    return (
        F._field(obj, "income_bracket", "incomeBracket") is not None
        or F._field(obj, "demand_kwh", "demandKwh") is not None
        or F._field(obj, "has_rooftop", "hasRooftop") is not None
    ) and F._field(obj, "demographics") is None and F._field(obj, "population") is None


# ===========================================================================
# 1. Demand forecast
# ===========================================================================
def predict_demand(entity: Any, month: int = 1, context: dict | None = None) -> float:
    """Predict monthly electricity demand (kWh).

    Dispatches on shape: a Zone-like object -> zone monthly demand; an Agent-like
    object -> that household's monthly demand. `month` (1..12) drives seasonality.
    `context` may carry {"zone_solar": float} for agents.
    """
    if _looks_like_agent(entity):
        return _predict_agent_demand(entity, month, context or {})
    return _predict_zone_demand(entity, month)


def _predict_zone_demand(zone: Any, month: int) -> float:
    z = F.normalize_zone(zone)
    bundle = _load("demand_zone")
    if bundle is not None:
        try:
            row = F.demand_zone_row(z, month)
            X = pd.DataFrame([row])[bundle["columns"]]
            return float(max(bundle["pipeline"].predict(X)[0], 0.0))
        except Exception:  # noqa: BLE001
            pass
    return _zone_demand_fallback(z, month)


def _zone_demand_fallback(z: dict, month: int) -> float:
    """Heuristic: use the contract baseline if present, else reconstruct it, then
    apply Toronto seasonality."""
    base = z.get("demand_kwh_monthly")
    if base is None or base <= 0:
        per_capita = 250 + 0.0009 * z["median_income"] - 80 * z["renter_pct"]
        base = max(z["population"] * per_capita, 50_000)
    return float(base * F.seasonal_multiplier(month))


def _predict_agent_demand(agent: Any, month: int, context: dict) -> float:
    a = F.normalize_agent(agent)
    zone_solar = float(context.get("zone_solar", 0.5))
    bundle = _load("demand_agent")
    if bundle is not None:
        try:
            row = F.demand_agent_row(a, zone_solar, month)
            X = pd.DataFrame([row])[bundle["columns"]]
            return float(max(bundle["pipeline"].predict(X)[0], 0.0))
        except Exception:  # noqa: BLE001
            pass
    return _agent_demand_fallback(a, month)


def _agent_demand_fallback(a: dict, month: int) -> float:
    base = a.get("demand_kwh")
    if base is None or base <= 0:
        base = {"low": 280.0, "mid": 520.0, "high": 880.0}[a["income_bracket"]]
        if a["ev_owner"]:
            base += 250.0
    return float(base * F.seasonal_multiplier(month))


# ===========================================================================
# 2. Adoption propensity
# ===========================================================================
def adoption_prob(agent: Any, context: dict | None = None) -> float:
    """P(household adopts rooftop solar / EV) this planning window, in [0,1].

    context keys (all optional):
        neighbourhood_adoption: float 0..1  existing local adoption share
        incentive_level:        float 0..1  policy/subsidy strength
        solar_potential:        float 0..1  host zone solar potential
        tick:                   int          sim tick (learning-curve trend)
    """
    a = F.normalize_agent(agent)
    ctx = dict(context or {})
    bundle = _load("adoption")
    if bundle is not None:
        try:
            row = F.adoption_row(a, ctx)
            X = pd.DataFrame([row])[bundle["columns"]]
            return float(np.clip(bundle["pipeline"].predict_proba(X)[0, 1], 0.0, 1.0))
        except Exception:  # noqa: BLE001
            pass
    return _adoption_fallback(a, ctx)


def _adoption_fallback(a: dict, ctx: dict, horizon: int = 24) -> float:
    """Heuristic mirroring backend/app/sim/agents.py hazard, integrated over a window."""
    income_weight = a["income_weight"]
    solar = float(ctx.get("solar_potential", 0.5))
    neigh = float(ctx.get("neighbourhood_adoption", 0.1))
    incentive = float(ctx.get("incentive_level", 0.3))
    tick = float(ctx.get("tick", 12))
    trend = 1.0 + min(tick, 60.0) * 0.02
    boost = 0.5 * neigh + 0.5 * incentive

    p_solar = min(0.015 * income_weight * (0.4 + solar) * trend * (1 + 0.8 * boost), 0.25)
    p_ev = min(0.010 * income_weight * trend * (1 + 0.6 * incentive), 0.20)
    cum_solar = 1 - (1 - p_solar) ** horizon if a["has_rooftop"] else 0.0
    cum_ev = 1 - (1 - p_ev) ** horizon
    return float(np.clip(1 - (1 - cum_solar) * (1 - cum_ev), 0.0, 1.0))


# ===========================================================================
# 2b. Scenario-conditioned propensity (per-technology)
# ===========================================================================
# Multipliers applied to baseline per-technology propensity under a scenario.
# Scenario KEYS match the contract's Scenario["type"] (docs/PLAN.md) so the backend
# can pass `scenario.type` straight through. Tech keys align with Infra["kind"]
# (solar|wind|battery|microgrid); "ev" is an agent behaviour reported alongside.
# Unknown / "custom" / None -> "baseline" (no shift). Safe by construction.
SCENARIO_MULTIPLIERS: dict[str, dict[str, float]] = {
    "baseline": {},
    "custom": {},
    # blackout: microgrid-served zones stay lit -> resilience tech surges
    "blackout": {"battery": 2.2, "microgrid": 2.0, "solar": 1.3, "ev": 0.9},
    # earthquake: infra damaged, grid drops -> distributed/backup resilience valued
    "earthquake": {"battery": 1.9, "microgrid": 1.9, "solar": 1.2, "ev": 0.85},
    # heatwave: cooling demand spikes -> solar + battery sentiment up
    "heatwave": {"solar": 1.4, "battery": 1.5, "ev": 1.0},
    # ice_storm: cold + outage risk -> heating-backup resilience
    "ice_storm": {"battery": 1.6, "microgrid": 1.5, "solar": 1.1, "ev": 0.9},
    # gas_spike: fossil cost up -> electrify (solar/battery/EV) more attractive
    "gas_spike": {"solar": 1.5, "battery": 1.4, "microgrid": 1.2, "ev": 1.2},
    # population_boom: demand up -> mild broad uplift
    "population_boom": {"solar": 1.15, "battery": 1.15, "microgrid": 1.1},
    # policy_incentive: subsidies push everything up
    "policy_incentive": {"solar": 1.5, "battery": 1.4, "microgrid": 1.4, "wind": 1.3, "ev": 1.3},
}
SCENARIO_TECHS = ("solar", "battery", "microgrid", "wind", "ev")
# Back-compat aliases for earlier naming.
_SCENARIO_ALIASES = {"post_blackout": "blackout", "price_spike": "gas_spike",
                     "policy_push": "policy_incentive", "cold_snap": "ice_storm", "none": "baseline"}


def scenario_adoption(agent: Any, context: dict | None = None) -> dict[str, float]:
    """Per-technology adoption propensity in [0,1], conditioned on `context["scenario"]`.

    Returns a dict keyed by {solar, battery, microgrid, wind, ev}. A scenario shifts
    propensity toward resilience tech (e.g. blackout -> battery/microgrid rise). Scenario
    names match the contract's Scenario["type"]; `context["intensity"]` (0..1, default 1.0)
    scales the shift so a mild event nudges and a severe one swings hard.

    Pure heuristic + safe fallback (unknown/custom scenario -> no shift); never raises and
    needs no trained artifact. The overall solar/EV base is anchored to adoption_prob so it
    stays consistent with the trained classifier when artifacts are present.

    context keys (all optional): scenario (str), intensity (0..1), incentive_level,
    neighbourhood_adoption, solar_potential, tick.
    """
    a = F.normalize_agent(agent)
    ctx = dict(context or {})
    scenario = str(ctx.get("scenario") or "baseline")
    scenario = _SCENARIO_ALIASES.get(scenario, scenario)
    raw_mult = SCENARIO_MULTIPLIERS.get(scenario, {})
    intensity = float(np.clip(ctx.get("intensity", 1.0), 0.0, 1.0))
    # Interpolate each multiplier from 1.0 (no effect) toward its full value by intensity.
    mult = {k: 1.0 + (v - 1.0) * intensity for k, v in raw_mult.items()}

    iw = a["income_weight"]
    incentive = float(ctx.get("incentive_level", 0.3))
    neigh = float(ctx.get("neighbourhood_adoption", 0.1))
    solar_pot = float(ctx.get("solar_potential", 0.5))
    has_roof = a["has_rooftop"]

    # General receptiveness to adopting *something* (income + policy + social proof).
    recept = float(np.clip(0.15 + 0.25 * iw + 0.30 * incentive + 0.20 * neigh, 0.0, 1.0))
    # Anchor solar/EV to the (possibly model-backed) overall propensity for consistency.
    overall = adoption_prob(agent, ctx)

    base = {
        "solar": overall * (0.5 + 0.5 * solar_pot) * (1.0 if has_roof else 0.25),
        "battery": recept * (0.35 + 0.30 * has_roof),
        "microgrid": recept * (0.30 + 0.30 * neigh),  # community-scale resilience
        "wind": recept * 0.15,
        "ev": float(np.clip(0.10 + 0.30 * iw + 0.20 * incentive, 0.0, 1.0)),
    }
    return {
        tech: float(np.clip(base[tech] * mult.get(tech, 1.0), 0.0, 1.0))
        for tech in SCENARIO_TECHS
    }


# ===========================================================================
# 2c. Siting priority (demand-matching + equity) — the challenge's core ask
# ===========================================================================
def siting_priority(zone: Any, context: dict | None = None) -> dict[str, Any]:
    """Per-zone siting priority fusing UNMET clean-energy demand with energy burden.

    Higher score = better place to build next: more unserved demand AND higher
    equity burden. This is the renewable-siting + demand-matching + equity ask, as a
    single rankable index the optimizer/UI can sort zones by.

    context (all optional):
        renewable_supply_kwh: clean supply already serving the zone (kWh/month)
        coverage_pct:         fraction of demand already met by clean supply (0..1)
                              (used if renewable_supply_kwh absent)
        equity_weight:        0..1 blend toward equity vs raw demand-matching (default 0.4)
        month:                seasonality for the demand estimate (default 1)

    Returns {score, unmet_demand_kwh, unmet_ratio, energy_burden, equity_weight,
    demand_signal, rationale}. Deterministic heuristic, data-calibrated; never raises
    and needs no trained artifact (purely additive — existing signatures unchanged).
    """
    z = F.normalize_zone(zone)
    ctx = dict(context or {})
    month = int(ctx.get("month", 1))

    # Monthly demand: prefer the zone's own baseline, else the demand model/fallback.
    demand = z.get("demand_kwh_monthly")
    if not demand or demand <= 0:
        demand = _predict_zone_demand(zone, month)
    demand = float(max(demand, 1.0))

    # Clean supply already serving the zone -> unmet demand.
    if "renewable_supply_kwh" in ctx and ctx["renewable_supply_kwh"] is not None:
        clean = float(ctx["renewable_supply_kwh"])
    elif "coverage_pct" in ctx and ctx["coverage_pct"] is not None:
        clean = demand * float(np.clip(ctx["coverage_pct"], 0.0, 1.0))
    else:
        clean = 0.0  # greenfield baseline: nothing clean yet
    unmet = float(max(demand - clean, 0.0))
    unmet_ratio = float(np.clip(unmet / demand, 0.0, 1.0))

    # Demand-matching signal blends absolute magnitude (saturating against the city
    # scale) with the share unserved, so both "big" and "badly-served" zones rank up.
    scale = F.zone_demand_scale()
    unmet_mag = unmet / (unmet + scale)  # 0..1, magnitude
    demand_signal = float(np.clip(0.5 * unmet_mag + 0.5 * unmet_ratio, 0.0, 1.0))

    burden = float(np.clip(z["energy_burden_index"], 0.0, 1.0))
    ew = float(np.clip(ctx.get("equity_weight", 0.4), 0.0, 1.0))
    score = float(np.clip((1.0 - ew) * demand_signal + ew * burden, 0.0, 1.0))

    pct = round(unmet_ratio * 100)
    gwh = unmet / 1e6
    burden_word = "high" if burden >= 0.6 else "moderate" if burden >= 0.4 else "low"
    rationale = (
        f"{pct}% of demand unserved (~{gwh:.1f} GWh/mo) in a {burden_word}-burden zone "
        f"({burden:.2f}) → {'strong' if score >= 0.6 else 'moderate' if score >= 0.4 else 'low'} "
        f"demand+equity siting candidate"
    )
    return {
        "score": score,
        "unmet_demand_kwh": unmet,
        "unmet_ratio": unmet_ratio,
        "energy_burden": burden,
        "equity_weight": ew,
        "demand_signal": demand_signal,
        "rationale": rationale,
    }


# ===========================================================================
# 3. Equity clustering
# ===========================================================================
def zone_cluster(zone: Any) -> dict[str, Any]:
    """Return {"cluster": int, "label": str} — the neighbourhood archetype used
    for the equity overlay and agent archetype assignment."""
    z = F.normalize_zone(zone)
    bundle = _load("cluster")
    if bundle is not None:
        try:
            row = F.cluster_row(z)
            X = pd.DataFrame([row])[bundle["columns"]]
            Xs = bundle["scaler"].transform(X)
            cid = int(bundle["kmeans"].predict(Xs)[0])
            labels = bundle.get("labels", {})
            label = labels.get(cid, labels.get(str(cid), f"cluster-{cid}"))
            return {"cluster": cid, "label": label}
        except Exception:  # noqa: BLE001
            pass
    return _cluster_fallback(z)


def _cluster_fallback(z: dict) -> dict[str, Any]:
    """Heuristic archetype by income / burden / tenure quadrants."""
    hi_income = z["median_income"] >= 90000
    hi_burden = z["energy_burden_index"] >= 0.5
    hi_renter = z["renter_pct"] >= 0.5
    if hi_income and not hi_burden:
        label, cid = "affluent-owner", 0
    elif not hi_income and hi_burden and hi_renter:
        label, cid = "burdened-renter", 1
    elif not hi_income and hi_burden:
        label, cid = "burdened-owner", 2
    elif hi_renter:
        label, cid = "urban-renter", 3
    else:
        label, cid = "stable-mixed", 4
    return {"cluster": cid, "label": label}


# ===========================================================================
# Self-test
# ===========================================================================
def _self_test() -> None:
    print("WattIf ml.inference self-test")
    print("artifacts available:", models_available(), "\n")

    zone = {
        "id": "z000",
        "name": "Regent Park",
        "demographics": {
            "population": 18000,
            "medianIncome": 38000,
            "renterPct": 0.82,
            "energyBurdenIndex": 0.71,
        },
        "demandKwhMonthly": 5_400_000.0,
        "solarPotential": 0.46,
        "windPotential": 0.22,
    }
    rich = {
        "id": "z014",
        "name": "Rosedale",
        "demographics": {
            "population": 9000,
            "medianIncome": 185000,
            "renterPct": 0.18,
            "energyBurdenIndex": 0.12,
        },
        "demandKwhMonthly": 4_100_000.0,
        "solarPotential": 0.70,
        "windPotential": 0.30,
    }
    agent_lo = {"id": "a1", "zoneId": "z000", "incomeBracket": "low", "hasRooftop": False,
                "evOwner": False, "demandKwh": 290.0, "solarAdopted": False}
    agent_hi = {"id": "a2", "zoneId": "z014", "incomeBracket": "high", "hasRooftop": True,
                "evOwner": True, "demandKwh": 950.0, "solarAdopted": False}

    print("predict_demand (zone, by month) — winter vs summer should differ:")
    for m in (1, 7):
        print(f"  Regent Park  m={m}: {predict_demand(zone, m):,.0f} kWh   "
              f"Rosedale m={m}: {predict_demand(rich, m):,.0f} kWh")

    print("\npredict_demand (agent):")
    print(f"  low-income, no EV (Jan): {predict_demand(agent_lo, 1, {'zone_solar': 0.46}):,.0f} kWh")
    print(f"  high-income, EV   (Jul): {predict_demand(agent_hi, 7, {'zone_solar': 0.70}):,.0f} kWh")

    print("\nadoption_prob (effect of incentive + neighbourhood adoption):")
    for inc in (0.0, 0.5, 1.0):
        ctx = {"incentive_level": inc, "neighbourhood_adoption": 0.2, "solar_potential": 0.7, "tick": 24}
        print(f"  high-income rooftop, incentive={inc}: {adoption_prob(agent_hi, ctx):.3f}")
    print(f"  low-income renter, incentive=1.0:   "
          f"{adoption_prob(agent_lo, {'incentive_level': 1.0, 'solar_potential': 0.46, 'tick': 24}):.3f}")

    print("\nscenario_adoption (per-tech propensity shifts under events):")
    for scen in ("baseline", "blackout", "heatwave", "policy_incentive"):
        sig = scenario_adoption(agent_hi, {"scenario": scen, "incentive_level": 0.4,
                                           "neighbourhood_adoption": 0.2, "solar_potential": 0.7, "tick": 24})
        compact = {k: round(v, 2) for k, v in sig.items()}
        print(f"  {scen:>14}: {compact}")

    print("\nsiting_priority (demand-matching + equity; greenfield = no clean supply yet):")
    for z in (zone, rich):
        sp = siting_priority(z, {"equity_weight": 0.4})
        print(f"  {z['name']:>14}: score={sp['score']:.2f}  unmet={sp['unmet_ratio']*100:.0f}%  burden={sp['energy_burden']:.2f}")
        print(f"                  {sp['rationale']}")
    # effect of partial existing coverage on the high-burden zone
    covered = siting_priority(zone, {"coverage_pct": 0.8})
    print(f"  Regent Park @80% covered: score={covered['score']:.2f} (unmet {covered['unmet_ratio']*100:.0f}%) — drops as it gets served")

    print("\nzone_cluster (equity archetype):")
    for z in (zone, rich):
        print(f"  {z['name']:>14}: {zone_cluster(z)}")

    # sanity assertions (hold for both trained models and fallbacks)
    assert predict_demand(zone, 1) > 0 and predict_demand(rich, 7) > 0
    assert 0.0 <= adoption_prob(agent_hi, {"incentive_level": 1.0}) <= 1.0
    assert adoption_prob(agent_hi, {"incentive_level": 1.0, "tick": 24}) >= adoption_prob(
        agent_hi, {"incentive_level": 0.0, "tick": 24}
    ), "higher incentive should not lower adoption"
    assert isinstance(zone_cluster(zone)["label"], str)
    # scenario: post-blackout must not lower battery/microgrid vs baseline
    base_sig = scenario_adoption(agent_hi, {"scenario": "baseline"})
    blackout_sig = scenario_adoption(agent_hi, {"scenario": "blackout"})
    assert blackout_sig["battery"] >= base_sig["battery"]
    assert blackout_sig["microgrid"] >= base_sig["microgrid"]
    # intensity scales the shift: half-intensity blackout sits between baseline and full
    mild = scenario_adoption(agent_hi, {"scenario": "blackout", "intensity": 0.5})
    assert base_sig["microgrid"] <= mild["microgrid"] <= blackout_sig["microgrid"] + 1e-9
    assert set(scenario_adoption(agent_lo, {"scenario": "nonexistent"})) == set(
        ("solar", "battery", "microgrid", "wind", "ev")
    ), "unknown scenario must still return full tech dict (safe fallback)"
    # siting_priority: in [0,1]; serving a zone (higher coverage) must not raise priority
    sp_full = siting_priority(zone, {"coverage_pct": 0.0})
    sp_served = siting_priority(zone, {"coverage_pct": 0.9})
    assert 0.0 <= sp_full["score"] <= 1.0
    assert sp_served["score"] <= sp_full["score"], "more coverage should not increase siting priority"
    # higher equity weight must lift a high-burden zone's score (use a small high-burden
    # zone so burden clearly dominates the demand signal)
    hb = {"demographics": {"population": 2000, "medianIncome": 30000, "renterPct": 0.9,
                           "energyBurdenIndex": 0.95}, "demandKwhMonthly": 200000.0,
          "solarPotential": 0.3}
    assert (
        siting_priority(hb, {"equity_weight": 0.8})["score"]
        > siting_priority(hb, {"equity_weight": 0.0})["score"]
    ), "higher equity weight should raise a high-burden zone's priority"
    print("\nAll self-test assertions passed.")


if __name__ == "__main__":
    _self_test()
