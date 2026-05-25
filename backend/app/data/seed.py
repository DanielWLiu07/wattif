"""Deterministic synthetic data generation for Toronto zones + agents.

Produces contract-shaped Zone[] and Agent[] so the backend runs fully standalone.
Everything is seeded (config.RANDOM_SEED) so the world is reproducible across restarts.
"""

from __future__ import annotations

import numpy as np

from .. import config
from ..models import Agent, Demographics, Polygon, Zone
from .toronto import NEIGHBOURHOODS

# Archetypes keyed loosely to income + density.
ARCHETYPES = [
    "renter-lowincome",
    "renter-midincome",
    "owner-suburban",
    "owner-urban",
    "small-business",
    "highrise-tenant",
]


def _square_polygon(lng: float, lat: float, density: float) -> Polygon:
    """A small square boundary around the centroid. Denser zones are smaller."""
    # ~0.004 deg (~300m) for dense, up to ~0.012 deg (~1km) for sparse.
    half = 0.012 - 0.008 * density
    ring: list[tuple[float, float]] = [
        (lng - half, lat - half),
        (lng + half, lat - half),
        (lng + half, lat + half),
        (lng - half, lat + half),
        (lng - half, lat - half),
    ]
    return Polygon(coordinates=[ring])


def _zone_id(idx: int) -> str:
    return f"z{idx:03d}"


def generate_zones(rng: np.random.Generator) -> list[Zone]:
    zones: list[Zone] = []
    for idx, (name, lng, lat, income_tier, density) in enumerate(NEIGHBOURHOODS):
        # Population scales with density; jitter for realism.
        population = int(np.clip(rng.normal(3000 + 22000 * density, 2500), 800, 40000))

        # Median income (CAD) keyed to income_tier.
        median_income = int(
            np.clip(rng.normal(42000 + 95000 * income_tier, 9000), 26000, 220000)
        )

        # Renters higher where income low / density high.
        renter_pct = float(
            np.clip(
                0.25 + 0.5 * density - 0.35 * income_tier + rng.normal(0, 0.06),
                0.05,
                0.95,
            )
        )

        # Energy burden: higher when low income + high renter share.
        energy_burden = float(
            np.clip(
                0.65 * (1 - income_tier) + 0.30 * renter_pct + rng.normal(0, 0.05),
                0.02,
                0.98,
            )
        )

        # Monthly demand (kWh): driven by population + a per-capita that rises with income
        # (bigger homes, more appliances/EVs) but with diminishing high-rise efficiency.
        per_capita = 250 + 180 * income_tier - 60 * density
        demand_kwh_monthly = float(max(population * per_capita, 50_000))

        # Solar potential: more roof availability in low-density areas; latitude-ish jitter.
        solar_potential = float(
            np.clip(0.78 - 0.45 * density + rng.normal(0, 0.06), 0.12, 0.95)
        )

        # Wind potential: low in the dense urban core, higher toward the open lakeshore/edges.
        edge = abs(lat - 43.70) * 6 + abs(lng + 79.38) * 2
        wind_potential = float(
            np.clip(
                0.15 + 0.25 * edge - 0.20 * density + rng.normal(0, 0.05), 0.02, 0.85
            )
        )

        zones.append(
            Zone(
                id=_zone_id(idx),
                name=name,
                polygon=_square_polygon(lng, lat, density),
                centroid=(lng, lat),
                demographics=Demographics(
                    population=population,
                    median_income=median_income,
                    renter_pct=round(renter_pct, 3),
                    energy_burden_index=round(energy_burden, 3),
                ),
                demand_kwh_monthly=round(demand_kwh_monthly, 1),
                solar_potential=round(solar_potential, 3),
                wind_potential=round(wind_potential, 3),
            )
        )
    return zones


def _pick_archetype(
    rng: np.random.Generator, income_bracket: str, density: float
) -> str:
    if income_bracket == "low":
        pool = [
            "renter-lowincome",
            "highrise-tenant",
            "renter-midincome",
            "small-business",
        ]
        weights = [0.45, 0.30, 0.15, 0.10]
    elif income_bracket == "mid":
        pool = [
            "renter-midincome",
            "owner-urban",
            "owner-suburban",
            "small-business",
            "highrise-tenant",
        ]
        weights = [0.30, 0.25, 0.20, 0.10, 0.15]
    else:  # high
        pool = ["owner-suburban", "owner-urban", "small-business", "renter-midincome"]
        weights = [0.45, 0.30, 0.15, 0.10]
    return str(rng.choice(pool, p=weights))


def generate_agents(
    zones: list[Zone], rng: np.random.Generator, total: int
) -> list[Agent]:
    """Distribute `total` agents across zones proportional to population."""
    pops = np.array([z.demographics.population for z in zones], dtype=float)
    shares = pops / pops.sum()
    counts = np.maximum((shares * total).round().astype(int), 1)

    agents: list[Agent] = []
    counter = 0
    for zone, n in zip(zones, counts):
        lng, lat = zone.centroid
        half = 0.011 - 0.007 * (1 - zone.solar_potential)  # rough spread
        renter_pct = zone.demographics.renter_pct
        income = zone.demographics.median_income

        for _ in range(int(n)):
            # Income bracket from zone median + noise.
            agent_income = max(rng.normal(income, income * 0.30), 18000)
            if agent_income < 45000:
                bracket = "low"
            elif agent_income < 95000:
                bracket = "mid"
            else:
                bracket = "high"

            is_renter = rng.random() < renter_pct
            has_rooftop = (not is_renter) and rng.random() < (
                0.6 + 0.3 * zone.solar_potential
            )
            ev_owner = rng.random() < (
                0.05 + 0.20 * (bracket == "high") + 0.08 * (bracket == "mid")
            )
            # Baseline pre-existing solar adoption is small.
            solar_adopted = has_rooftop and rng.random() < 0.06

            base_demand = {"low": 280, "mid": 520, "high": 880}[bracket]
            demand_kwh = float(max(rng.normal(base_demand, base_demand * 0.25), 60))
            if ev_owner:
                demand_kwh += rng.normal(250, 60)

            pos = (
                float(lng + rng.uniform(-half, half)),
                float(lat + rng.uniform(-half, half)),
            )

            agents.append(
                Agent(
                    id=f"a{counter:05d}",
                    zone_id=zone.id,
                    position=pos,
                    archetype=_pick_archetype(rng, bracket, 1 - zone.solar_potential),
                    demand_kwh=round(demand_kwh, 1),
                    income_bracket=bracket,
                    has_rooftop=bool(has_rooftop),
                    ev_owner=bool(ev_owner),
                    solar_adopted=bool(solar_adopted),
                )
            )
            counter += 1
    return agents


def build_world(
    seed: int | None = None, num_agents: int | None = None
) -> tuple[list[Zone], list[Agent]]:
    rng = np.random.default_rng(config.RANDOM_SEED if seed is None else seed)
    zones = generate_zones(rng)
    agents = generate_agents(
        zones, rng, config.NUM_AGENTS if num_agents is None else num_agents
    )
    return zones, agents
