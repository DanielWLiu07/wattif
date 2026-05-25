"""Vectorized rule-based agent adoption model.

Agents with a rooftop progressively adopt rooftop solar each tick. Adoption
probability rises with income, the zone's solar potential, a global learning-curve
trend, and local encouragement from placed infrastructure (microgrids/solar nearby
make a zone more "solar-active"). Deterministic given the engine's RNG.
"""

from __future__ import annotations

from dataclasses import dataclass, field

import numpy as np

from ..models import Agent, Zone

# Assumed rooftop PV system size once an agent adopts.
ROOFTOP_KW = 5.0
SOLAR_CAPACITY_FACTOR = 0.15  # Toronto annual avg
HOURS_PER_MONTH = 730.0

_INCOME_WEIGHT = {"low": 0.5, "mid": 1.0, "high": 1.6}


@dataclass
class AgentArrays:
    """Struct-of-arrays view of agents for fast per-tick math."""

    n: int
    zone_idx: np.ndarray  # int, index into zones list
    demand_kwh: np.ndarray  # float, baseline monthly demand
    has_rooftop: np.ndarray  # bool
    income_weight: np.ndarray  # float
    zone_solar: np.ndarray  # float, host zone solar potential
    adopted: np.ndarray = field(default_factory=lambda: np.array([]))
    adopted_baseline: np.ndarray = field(default_factory=lambda: np.array([]))

    @classmethod
    def build(cls, agents: list[Agent], zones: list[Zone]) -> "AgentArrays":
        zone_index = {z.id: i for i, z in enumerate(zones)}
        n = len(agents)
        zone_idx = np.array([zone_index[a.zone_id] for a in agents], dtype=np.int32)
        demand = np.array([a.demand_kwh for a in agents], dtype=np.float64)
        rooftop = np.array([a.has_rooftop for a in agents], dtype=bool)
        income_w = np.array(
            [_INCOME_WEIGHT[a.income_bracket] for a in agents], dtype=np.float64
        )
        zone_solar = np.array(
            [zones[i].solar_potential for i in zone_idx], dtype=np.float64
        )
        adopted0 = np.array([a.solar_adopted for a in agents], dtype=bool)
        arr = cls(
            n=n,
            zone_idx=zone_idx,
            demand_kwh=demand,
            has_rooftop=rooftop,
            income_weight=income_w,
            zone_solar=zone_solar,
        )
        arr.adopted_baseline = adopted0.copy()
        arr.adopted = adopted0.copy()
        return arr

    def reset(self) -> None:
        self.adopted = self.adopted_baseline.copy()


def adoption_step(
    arr: AgentArrays,
    tick: int,
    zone_infra_boost: np.ndarray,
    rng: np.random.Generator,
) -> None:
    """Advance rooftop-solar adoption by one tick (mutates arr.adopted).

    zone_infra_boost: per-zone [0..~1] signal that placed infra raises local adoption.
    """
    eligible = arr.has_rooftop & ~arr.adopted
    if not eligible.any():
        return

    # Global learning-curve trend: adoption gets easier over time (cheaper panels).
    trend = 1.0 + min(tick, 60) * 0.02

    boost = zone_infra_boost[arr.zone_idx]
    # Base monthly hazard ~1.5%, scaled by income, solar potential, trend, local infra.
    p = 0.015 * arr.income_weight * (0.4 + arr.zone_solar) * trend * (1.0 + 0.8 * boost)
    p = np.clip(p, 0.0, 0.25)

    draws = rng.random(arr.n)
    newly = eligible & (draws < p)
    arr.adopted |= newly


def rooftop_supply_kwh(arr: AgentArrays) -> np.ndarray:
    """Per-agent monthly kWh produced by adopted rooftop systems."""
    gen = (
        arr.adopted.astype(np.float64)
        * ROOFTOP_KW
        * arr.zone_solar
        * SOLAR_CAPACITY_FACTOR
        * HOURS_PER_MONTH
    )
    return gen


def adoption_pct_by_zone(arr: AgentArrays, num_zones: int) -> np.ndarray:
    """Fraction of rooftop-capable agents that have adopted, per zone."""
    capable = np.zeros(num_zones)
    adopted = np.zeros(num_zones)
    np.add.at(capable, arr.zone_idx, arr.has_rooftop.astype(np.float64))
    np.add.at(adopted, arr.zone_idx, (arr.has_rooftop & arr.adopted).astype(np.float64))
    with np.errstate(divide="ignore", invalid="ignore"):
        pct = np.where(capable > 0, adopted / capable, 0.0)
    return pct
