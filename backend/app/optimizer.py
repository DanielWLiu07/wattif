"""Renewable siting optimizer.

Ranks candidate sites (a grid of one best-fit candidate per zone) by expected
coverage gain + equity gain - cost. Default strategy is a transparent greedy
marginal-gain selection (the standard, provably near-optimal approach for
max-coverage/facility-location); an OR-Tools CP-SAT 0/1-knapsack variant is also
available (budget-constrained selection).
"""

from __future__ import annotations

import logging

import numpy as np

from .models import InfraKind, Recommendation, Zone
from .sim.engine import CAPACITY_FACTOR, HOURS_PER_MONTH, SimEngine

log = logging.getLogger("wattif.optimizer")

# Default nameplate capacity (kW) per candidate by kind. Community/distributed scale — a
# single sited installation makes a visible dent in a neighbourhood's monthly demand.
# Wind is intentionally modeled at a *distributed* scale (~3 MW = a few community turbines),
# NOT a 12 MW+ utility farm: utility wind isn't deployable inside Toronto neighbourhoods, so
# its per-site yield shouldn't dwarf solar/microgrid/battery in the siting ranking.
DEFAULT_CAPACITY_KW: dict[str, float] = {
    "solar": 4000.0,
    "wind": 3000.0,
    "battery": 6000.0,
    "microgrid": 4000.0,
    "ev_charger": 350.0,
}

# Installed cost (CAD per kW).
COST_PER_KW: dict[str, float] = {
    "solar": 1500.0,
    "wind": 2000.0,
    "battery": 700.0,
    "microgrid": 2500.0,
    "ev_charger": 1200.0,
}

# Score weights.
W_COVERAGE = 1.0
W_EQUITY = 1.2  # equity is the project differentiator — weight it slightly higher
W_COST = 0.5
W_CONSTRAINT = 0.8  # down-weight environmentally-constrained zones (constraints.json)
W_EXISTING = 0.3  # mild penalty to avoid double-placing where renewables already exist
W_EXISTING_EV = 0.35  # down-weight zones that already have many EV chargers
# EV chargers earn a small service credit (not generation) for ranking.
EV_CHARGER_RANKING_CF = 0.04
W_DISTRICT = 0.5  # down-weight NEW microgrid in district-energy-served zones (don't double-serve)
# Portfolio diversity: each additional pick of the same kind is penalized, so a plan doesn't
# over-concentrate on one technology (resilience). Surfaces the next-best *different* kind.
W_DIVERSITY = 0.18

# Battery stores rather than generates: it earns only a small coverage-ENABLING credit
# (shifting existing renewable into peak), well below true generation options. Its real
# value is peak shaving (grid load) and reliability/equity in high-burden zones.
BATTERY_COVERAGE_CF = 0.05


def candidate_capacity(kind: str) -> float:
    return DEFAULT_CAPACITY_KW[kind]


def candidate_cost(kind: str, capacity_kw: float) -> float:
    return COST_PER_KW[kind] * capacity_kw


def _ring_area(ring) -> float:
    a = 0.0
    for (x1, y1), (x2, y2) in zip(ring, ring[1:]):
        a += x1 * y2 - x2 * y1
    return abs(a) / 2.0


def _poly_area_deg2(zone: Zone) -> float:
    """Shoelace area of the zone boundary in deg² (relative measure for density ranking).

    Handles Polygon (exterior = coordinates[0]) and MultiPolygon (sum of each part's exterior).
    """
    geom = zone.polygon
    if getattr(geom, "type", "Polygon") == "MultiPolygon":
        return sum(_ring_area(poly[0]) for poly in geom.coordinates if poly)
    return _ring_area(geom.coordinates[0])


def _suitable_kinds(zone: Zone, is_dense: bool) -> list[InfraKind]:
    """Kinds physically/operationally sensible for a zone (used when caller passes no kind).

    - WIND (modeled at distributed ~3 MW scale) requires both a real wind resource AND room:
      it's excluded from dense urban zones (turbine land/setbacks), so even community turbines
      aren't proposed downtown when the dataset reports high wind potential there.
    - SOLAR where irradiance/roof availability is reasonable.
    - MICROGRID is always a candidate (community/equity/reliability option).
    - BATTERY where energy burden is high (peak relief).
    This gives the optimizer a genuine mix instead of defaulting to one kind everywhere.
    """
    burden = zone.demographics.energy_burden_index
    kinds: list[InfraKind] = []
    if zone.solar_potential >= 0.35:
        kinds.append("solar")
    if zone.wind_potential >= 0.45 and not is_dense:
        kinds.append("wind")
    # Microgrid is a targeted intervention for high-burden / dense (critical-reliability)
    # zones — NOT a universal option, or it would shut solar out everywhere (higher CF).
    if burden >= 0.45 or is_dense:
        kinds.append("microgrid")
    if burden >= 0.55:
        kinds.append("battery")
    ev_prop = getattr(zone, "_ev_propensity", None)
    if ev_prop is None:
        ev_prop = 0.25
    existing_ev = getattr(zone, "_existing_ev", 0.0)
    if (ev_prop >= 0.30 or is_dense) and existing_ev < 4:
        kinds.append("ev_charger")
    if not kinds:  # guarantee every zone has at least one option
        kinds.append("microgrid")
    return kinds


def _rationale(
    zone: Zone,
    kind: str,
    global_cov_gain: float,
    local_frac: float,
    eq_gain: float,
    district_system: str | None = None,
) -> str:
    """Human rationale. The compelling neighbourhood-scale % lives here (clearly labeled);
    the machine-readable expectedCoverageGain stays city-wide for HUD consistency."""
    burden = zone.demographics.energy_burden_index
    kind_phrase = {
        "solar": "a solar array",
        "wind": "a wind installation",
        "battery": "battery storage",
        "microgrid": "a community microgrid",
        "ev_charger": "an EV charging hub",
    }[kind]
    eq_note = ""
    if burden >= 0.6:
        eq_note = (
            f" {zone.name} is a high energy-burden area, so this also advances equity."
        )
    elif burden >= 0.4:
        eq_note = f" {zone.name} has moderate energy burden."
    # Why this kind won the ranking (answers "why wind dominates").
    why = {
        "wind": " Wind leads here on yield — ~30% capacity factor (vs ~15% solar), the most coverage per site.",
        "solar": " Solar fits this zone's irradiance and rooftop availability.",
        "microgrid": " A microgrid suits this zone — local reliability plus equity benefit.",
        "battery": " Battery shaves peak load and firms supply where energy burden is high.",
        "ev_charger": " EV charging access is low here but EV ownership and daily trips are high.",
    }.get(kind, "")
    de_note = ""
    if district_system and kind == "microgrid":
        de_note = f" Note: {zone.name} is already served by {district_system} district energy."
    return (
        f"Site {kind_phrase} in {zone.name}: could supply ~{local_frac * 100:.0f}% of "
        f"{zone.name}'s demand (+{global_cov_gain * 100:.2f}% city-wide coverage).{eq_note}{why}{de_note}"
    ).strip()


def _build_candidates(engine: SimEngine, kind: InfraKind | None):
    """Candidate sites with precomputed supply/cost. When `kind` is None, each zone yields
    one candidate per *suitable* kind (see _suitable_kinds); otherwise one per zone of the
    requested kind. Returns (candidates, zone_demand, total_demand)."""
    zone_demand = engine._current_zone_demand()
    total_demand = float(zone_demand.sum())
    infra_supply, _, _, _ = engine._infra_supply_by_zone()

    from .sim.agents import rooftop_supply_kwh

    rooftop = rooftop_supply_kwh(engine.agent_arrays)
    rooftop_by_zone = np.zeros(engine.num_zones)
    np.add.at(rooftop_by_zone, engine.agent_arrays.zone_idx, rooftop)
    rooftop_by_zone *= engine.zone_representation  # scale sample -> full neighbourhood
    current_supply = infra_supply + rooftop_by_zone

    # Population density proxy (people per deg²) for the urban wind gate. A zone is "dense"
    # if it's in the top third — utility wind is excluded there.
    densities = [
        zone.demographics.population / max(_poly_area_deg2(zone), 1e-9)
        for zone in engine.zones
    ]
    dense_threshold = float(np.quantile(densities, 0.66)) if densities else float("inf")

    candidates = []
    for i, zone in enumerate(engine.zones):
        # Skip protected no-build zones entirely (constraints.json).
        if bool(engine.zone_no_build[i]):
            continue
        is_dense = densities[i] >= dense_threshold
        zone._ev_propensity = float(engine.zone_ev_propensity[i])  # type: ignore[attr-defined]
        placed_ev = sum(
            1
            for inf in engine.infra.values()
            if inf.kind == "ev_charger"
            and inf.status != "damaged"
            and engine._nearest_zone(inf.position) == i
        )
        zone._existing_ev = float(engine.zone_existing_ev[i] + placed_ev)  # type: ignore[attr-defined]
        kinds = [kind] if kind else _suitable_kinds(zone, is_dense)
        for k in kinds:
            cap = candidate_capacity(k)
            if k == "ev_charger":
                cf = EV_CHARGER_RANKING_CF
                ev_need = float(engine.zone_ev_propensity[i]) * (
                    1.0 / (1.0 + zone._existing_ev)  # type: ignore[attr-defined]
                )
                quality = 0.4 + ev_need + (0.2 if is_dense else 0.0)
            elif k == "battery":
                cf = BATTERY_COVERAGE_CF
                quality = 1.0
            else:
                cf = CAPACITY_FACTOR.get(k, 0.0)
                quality = 1.0
                if k == "solar":
                    quality = 0.5 + zone.solar_potential
                elif k == "wind":
                    quality = 0.5 + zone.wind_potential
            added_supply = cap * cf * HOURS_PER_MONTH * quality
            candidates.append(
                {
                    "zone_idx": i,
                    "zone": zone,
                    "kind": k,
                    "capacity_kw": cap,
                    "cost": candidate_cost(k, cap),
                    "added_supply": added_supply,
                    "demand": float(zone_demand[i]),
                    "current_supply": float(current_supply[i]),
                }
            )
    return candidates, zone_demand, total_demand


def _raw_gains(
    cand: dict, served: float, burden: float, burden_sum: float, total_demand: float
):
    """Raw (un-normalized) gains for a candidate given the zone's current served energy.

    Returns (global_cov_gain, local_frac, equity_gain, served_gain):
      - global_cov_gain: CITY-WIDE coverage delta (served_gain / total city demand) — the same
                         denominator as SimMetrics.coveragePct, so it's honest + additive.
      - local_frac:      fraction of THIS zone's demand newly covered (for the rationale text).
      - equity_gain:     burden-weighted system coverage improvement (0..1).
      - served_gain:     kWh/month newly served (drives diminishing returns).
    """
    demand = cand["demand"]
    remaining = max(demand - served, 0.0)
    # added_supply already encodes battery's small enabling credit (BATTERY_COVERAGE_CF).
    served_gain = min(cand["added_supply"], remaining)

    global_cov_gain = served_gain / total_demand if total_demand else 0.0
    local_frac = served_gain / demand if demand else 0.0
    cov_z_before = min(served / demand, 1.0) if demand else 0.0
    cov_z_after = min((served + served_gain) / demand, 1.0) if demand else 0.0
    equity_gain = (
        burden * (cov_z_after - cov_z_before) / burden_sum if burden_sum else 0.0
    )
    return global_cov_gain, local_frac, equity_gain, served_gain


def optimize_greedy(
    engine: SimEngine, kind: InfraKind | None, n: int
) -> list[Recommendation]:
    candidates, _, total_demand = _build_candidates(engine, kind)
    if not candidates:
        return []
    burden_sum = float(engine.zone_equity_weight.sum())
    cost_scale = max(c["cost"] for c in candidates)

    # Served energy per zone. Each recommendation is a DISTINCT neighbourhood (a planner
    # wants geographic spread, not a stack of installs in one zone), so a chosen zone is
    # removed from the pool. The greedy still adapts: each pick re-normalizes against the
    # remaining candidates and updates the burden-weighted system coverage. With kind=None
    # multiple kinds compete per zone, and the best kind for the chosen zone is selected.
    served = {c["zone_idx"]: c["current_supply"] for c in candidates}
    chosen: set[int] = set()
    kind_count: dict[str, int] = {}

    recs: list[Recommendation] = []

    for _ in range(max(1, n)):
        evals = []
        for cand in candidates:
            zi = cand["zone_idx"]
            if zi in chosen:
                continue
            burden = float(engine.zone_equity_weight[zi])
            gcov, local, eq, gain = _raw_gains(
                cand, served[zi], burden, burden_sum, total_demand
            )
            evals.append((cand, gcov, local, eq, gain))

        if not evals:
            break

        cov_scale = max((e[1] for e in evals), default=0.0) or 1.0
        eq_scale = max((e[3] for e in evals), default=0.0) or 1.0

        best = None
        for cand, gcov, local, eq, gain in evals:
            score = (
                W_COVERAGE * (gcov / cov_scale)
                + W_EQUITY * (eq / eq_scale)
                - W_COST * (cand["cost"] / cost_scale)
                - W_DIVERSITY * kind_count.get(cand["kind"], 0)  # portfolio diversity
                - W_CONSTRAINT
                * float(engine.zone_siting_penalty[cand["zone_idx"]])  # env constraint
                - W_EXISTING
                * min(float(engine.zone_existing_renewables[cand["zone_idx"]]), 3)
                / 3  # avoid double-placing renewables
                - (
                    W_EXISTING_EV
                    * min(
                        float(
                            engine.zone_existing_ev[cand["zone_idx"]]
                            + sum(
                                1
                                for inf in engine.infra.values()
                                if inf.kind == "ev_charger"
                                and inf.status != "damaged"
                                and engine._nearest_zone(inf.position)
                                == cand["zone_idx"]
                            )
                        ),
                        5,
                    )
                    / 5
                    if cand["kind"] == "ev_charger"
                    else 0.0
                )
                - (
                    W_DISTRICT * float(engine.zone_district_energy[cand["zone_idx"]])
                    if cand["kind"] == "microgrid"
                    else 0.0
                )  # don't double-serve district-energy zones with a new microgrid
            )
            if best is None or score > best[0]:
                best = (score, cand, gcov, local, eq, gain)

        if best is None or best[5] <= 0:  # no remaining useful coverage
            break

        score, cand, gcov, local, eq, gain = best
        zi = cand["zone_idx"]
        zone = cand["zone"]
        served[zi] += gain
        chosen.add(zi)
        kind_count[cand["kind"]] = kind_count.get(cand["kind"], 0) + 1

        recs.append(
            Recommendation(
                position=tuple(zone.centroid),
                kind=cand["kind"],
                score=round(float(score), 5),
                expected_coverage_gain=round(
                    float(gcov), 6
                ),  # city-wide delta (HUD-consistent)
                equity_gain=round(float(eq), 5),
                rationale=_rationale(
                    zone,
                    cand["kind"],
                    gcov,
                    local,
                    eq,
                    district_system=engine.zone_de_system.get(zone.id),
                ),
            )
        )
    return recs


def optimize_ortools(
    engine: SimEngine, kind: InfraKind | None, n: int
) -> list[Recommendation]:
    """OR-Tools CP-SAT 0/1 knapsack: pick the highest-value candidates within a budget.

    Budget is derived as n * median candidate cost. Falls back to greedy on any issue.
    """
    try:
        from ortools.sat.python import cp_model
    except ImportError:
        log.warning("ortools unavailable; falling back to greedy")
        return optimize_greedy(engine, kind, n)

    candidates, _, total_demand = _build_candidates(engine, kind)
    if not candidates:
        return []
    burden_sum = float(engine.zone_equity_weight.sum())
    cost_scale = max(c["cost"] for c in candidates)

    # Static (non-marginal) gains per candidate at the current state.
    raw = []
    for cand in candidates:
        zi = cand["zone_idx"]
        burden = float(engine.zone_equity_weight[zi])
        raw.append(
            _raw_gains(cand, cand["current_supply"], burden, burden_sum, total_demand)
        )
    cov_scale = max((r[0] for r in raw), default=0.0) or 1.0
    eq_scale = max((r[2] for r in raw), default=0.0) or 1.0

    values, costs, evals = [], [], []
    for cand, (gcov, local, eq, _gain) in zip(candidates, raw):
        score = (
            W_COVERAGE * (gcov / cov_scale)
            + W_EQUITY * (eq / eq_scale)
            - W_COST * (cand["cost"] / cost_scale)
            - W_CONSTRAINT * float(engine.zone_siting_penalty[cand["zone_idx"]])
            - W_EXISTING
            * min(float(engine.zone_existing_renewables[cand["zone_idx"]]), 3)
            / 3
            - (
                W_EXISTING_EV
                * min(
                    float(
                        engine.zone_existing_ev[cand["zone_idx"]]
                        + sum(
                            1
                            for inf in engine.infra.values()
                            if inf.kind == "ev_charger"
                            and inf.status != "damaged"
                            and engine._nearest_zone(inf.position) == cand["zone_idx"]
                        )
                    ),
                    5,
                )
                / 5
                if cand["kind"] == "ev_charger"
                else 0.0
            )
            - (
                W_DISTRICT * float(engine.zone_district_energy[cand["zone_idx"]])
                if cand["kind"] == "microgrid"
                else 0.0
            )
        )
        evals.append((score, gcov, local, eq))
        values.append(int(max(score, 0.0) * 1_000_000))
        costs.append(int(cand["cost"]))

    budget = int(np.median(costs) * n)

    model = cp_model.CpModel()
    x = [model.NewBoolVar(f"x{i}") for i in range(len(candidates))]
    model.Add(sum(x) <= n)
    model.Add(sum(costs[i] * x[i] for i in range(len(candidates))) <= budget)
    # At most one installation per zone (distinct neighbourhoods, like the greedy path).
    by_zone: dict[int, list[int]] = {}
    for i, cand in enumerate(candidates):
        by_zone.setdefault(cand["zone_idx"], []).append(i)
    for idxs in by_zone.values():
        if len(idxs) > 1:
            model.Add(sum(x[i] for i in idxs) <= 1)
    # Portfolio diversity: cap any single kind so the plan isn't one technology (mirrors the
    # greedy diversity term). For n=6 this allows at most 3 of a kind -> >= 2 kinds.
    kind_cap = max(2, (n + 1) // 2)
    by_kind: dict[str, list[int]] = {}
    for i, cand in enumerate(candidates):
        by_kind.setdefault(cand["kind"], []).append(i)
    for idxs in by_kind.values():
        model.Add(sum(x[i] for i in idxs) <= kind_cap)
    model.Maximize(sum(values[i] * x[i] for i in range(len(candidates))))

    solver = cp_model.CpSolver()
    solver.parameters.max_time_in_seconds = 2.0
    status = solver.Solve(model)
    if status not in (cp_model.OPTIMAL, cp_model.FEASIBLE):
        log.warning(
            "CP-SAT found no solution (status=%s); falling back to greedy", status
        )
        return optimize_greedy(engine, kind, n)

    chosen = [i for i in range(len(candidates)) if solver.Value(x[i]) == 1]
    chosen.sort(key=lambda i: values[i], reverse=True)

    recs: list[Recommendation] = []
    for i in chosen:
        cand = candidates[i]
        zone = cand["zone"]
        score, gcov, local, eq = evals[i]
        recs.append(
            Recommendation(
                position=tuple(zone.centroid),
                kind=cand["kind"],
                score=round(float(score), 5),
                expected_coverage_gain=round(
                    float(gcov), 6
                ),  # city-wide delta (HUD-consistent)
                equity_gain=round(float(eq), 5),
                rationale=_rationale(
                    zone,
                    cand["kind"],
                    gcov,
                    local,
                    eq,
                    district_system=engine.zone_de_system.get(zone.id),
                ),
            )
        )
    return recs


def optimize(
    engine: SimEngine,
    kind: InfraKind | None = None,
    n: int = 5,
    strategy: str = "greedy",
) -> list[Recommendation]:
    n = max(1, min(n, 25))
    if strategy == "ortools":
        return optimize_ortools(engine, kind, n)
    return optimize_greedy(engine, kind, n)
