"""Scenario / event engine. ~15 deterministic, rule-based presets + a random generator.

Each scenario mutates the SESSION engine via its levers (per-zone demand multiplier, zone
outages, grid-capacity multiplier, adoption incentive, infra damage) and shifts public-opinion
targets, then returns a contract Scenario (effects recorded for the UI). Effects are seeded/
deterministic given the supplied RNG. Session reset clears everything.
"""

from __future__ import annotations

import uuid

import numpy as np

from .models import GatheringHint, Scenario, ScenarioEffect, ScenarioType
from .sim.engine import SimEngine

# Map a gathering "kind" to real facility categories (facilities.json). Heat -> cooling sites;
# blackout/cold -> libraries (relief/warming). Cached after first defensive load.
_GATHER_FACILITY_CATEGORIES = {
    "cooling_center": ["cooling_centre", "cooling_location", "pool"],
    "warming_center": ["library", "cooling_centre"],
    "shelter": ["library", "cooling_centre"],
    "charging_hub": ["library"],
}
_facilities_cache: list | None = None
_facilities_loaded = False


def _facilities() -> list:
    global _facilities_cache, _facilities_loaded
    if not _facilities_loaded:
        _facilities_loaded = True
        try:
            from .data.loader import load_facilities

            _facilities_cache = load_facilities()
        except Exception:  # noqa: BLE001
            _facilities_cache = None
    return _facilities_cache or []


# Human labels/descriptions (description may later be replaced by an LLM blurb).
_META: dict[str, tuple[str, str]] = {
    "earthquake": (
        "Earthquake",
        "A seismic event damages infrastructure and knocks out power in several zones.",
    ),
    "heatwave": (
        "Heatwave",
        "A prolonged heatwave spikes cooling demand and warms residents to solar + storage.",
    ),
    "ice_storm": (
        "Ice Storm",
        "An ice storm drives up heating demand and damages exposed equipment.",
    ),
    "blackout": (
        "City Blackout",
        "A grid failure darkens much of the city — only islanded microgrids stay lit.",
    ),
    "gas_spike": (
        "Gas Price Spike",
        "Natural-gas prices surge, raising costs and appetite for renewables.",
    ),
    "population_boom": (
        "Population Boom",
        "Rapid growth pushes electricity demand up across many zones.",
    ),
    "policy_incentive": (
        "Green Incentive",
        "A new rebate program boosts rooftop adoption propensity citywide.",
    ),
    "turbine_noise_complaint": (
        "Turbine Noise Complaints",
        "Residents near turbines push back on wind over noise.",
    ),
    "solar_approved": (
        "Solar Bylaw Passed",
        "A streamlined permitting bylaw warms the city to solar.",
    ),
    "cold_snap": ("Cold Snap", "A deep freeze drives a heating-demand surge."),
    "drought": (
        "Drought",
        "A dry spell stresses hydro supply and nudges interest toward solar.",
    ),
    "wind_lull": (
        "Wind Lull",
        "A stagnant-air spell cuts wind output and stresses the grid.",
    ),
    "grid_upgrade": (
        "Grid Upgrade",
        "A transmission upgrade raises grid capacity and confidence.",
    ),
    "ev_surge": (
        "EV Adoption Surge",
        "A wave of EV purchases lifts demand and interest in storage.",
    ),
    "factory_opening": (
        "Factory Opening",
        "A new industrial facility concentrates new demand in one area.",
    ),
    "flood": (
        "Flood",
        "Flooding hits the highest flood-risk zones — outages and damaged infrastructure.",
    ),
}

_ALL_TYPES: list[ScenarioType] = [t for t in _META.keys()]  # type: ignore[misc]


def _rand_zones(engine: SimEngine, rng: np.random.Generator, k: int) -> list[int]:
    k = min(max(1, k), engine.num_zones)
    return list(rng.choice(engine.num_zones, size=k, replace=False))


def _zones_in_radius(
    engine: SimEngine, center: tuple[float, float], radius_km: float
) -> list[int]:
    """Zone indices whose centroid is within radius_km of center ([lng,lat])."""
    import numpy as _np

    clng, clat = float(center[0]), float(center[1])
    # deg -> km: lat ~111 km/deg; lng scaled by cos(lat).
    dlat = (engine.zone_centroids[:, 1] - clat) * 111.0
    dlng = (engine.zone_centroids[:, 0] - clng) * 111.0 * _np.cos(_np.radians(clat))
    dist = _np.sqrt(dlat**2 + dlng**2)
    return [int(i) for i in _np.where(dist <= radius_km)[0]]


def apply_scenario(
    engine: SimEngine,
    scenario_type: ScenarioType | str = "random",
    intensity: float = 1.0,
    rng: np.random.Generator | None = None,
    target_idxs: list[int] | None = None,
) -> Scenario:
    """Apply a scenario to the session engine and return the contract Scenario.

    target_idxs localizes physical effects, gatherings, and sentiment shifts to those zones
    (city-wide when None).
    """
    rng = rng or np.random.default_rng()
    if scenario_type == "random" or scenario_type is None:
        scenario_type = str(rng.choice(_ALL_TYPES))
    if scenario_type not in _META:
        scenario_type = "custom"
        label, desc = ("Custom Event", "A custom event affects the city.")
    else:
        label, desc = _META[scenario_type]

    imult = float(max(0.1, intensity))  # intensity multiplier
    effects: list[ScenarioEffect] = []
    gatherings: list[GatheringHint] = []
    # Pool of zones the scenario may touch (localized or city-wide).
    pool: list[int] = (
        list(target_idxs) if target_idxs else list(range(engine.num_zones))
    )
    localized = target_idxs is not None

    def pick(k: int) -> list[int]:
        """Sample up to k zones from the scenario's pool (localized or city-wide)."""
        k = min(max(1, k), len(pool))
        return [int(i) for i in rng.choice(pool, size=k, replace=False)]

    def top_by(metric: np.ndarray, k: int) -> list[int]:
        """Top-k pool zones by `metric` (descending) — e.g. hit highest flood-risk / HVI first."""
        k = min(max(1, k), len(pool))
        return sorted(pool, key=lambda zi: float(metric[zi]), reverse=True)[:k]

    def damage_in_zones(zone_idxs: list[int], note: str) -> None:
        """Damage all (undamaged) infra whose nearest zone is in zone_idxs."""
        zset = set(zone_idxs)
        for iid, inf in engine.infra.items():
            if inf.status != "damaged" and engine._nearest_zone(inf.position) in zset:
                inf.status = "damaged"
                effects.append(
                    ScenarioEffect(
                        target="infra", infra_id=str(iid), delta=-1.0, note=note
                    )
                )

    def _microgrid_zone_idxs() -> list[int]:
        idxs = []
        for inf in engine.infra.values():
            if inf.kind == "microgrid" and inf.status != "damaged":
                zi = engine._nearest_zone(inf.position)
                if not localized or zi in pool:
                    idxs.append(zi)
        return sorted(set(idxs))

    pool_zone_ids = {engine.zones[zi].id for zi in pool}

    def gather(
        kind: str, pull: float, hours: int, zone_idxs: list[int] | None = None
    ) -> None:
        p = round(min(pull, 1.0), 2)
        # 1) Prefer REAL relief facilities (facilities.json) matching this gathering kind, in-pool.
        cats = _GATHER_FACILITY_CATEGORIES.get(kind)
        if zone_idxs is None and cats:
            matched = [
                f
                for f in _facilities()
                if f.get("category") in cats
                and f.get("zoneId") in pool_zone_ids
                and f.get("position")
            ]
            if matched:
                for f in matched[:4]:
                    gatherings.append(
                        GatheringHint(
                            zone_id=f["zoneId"],
                            kind=kind,
                            pull=p,
                            hours=hours,
                            position=tuple(f["position"]),
                            name=f.get("name"),
                        )
                    )
                return
        # 2) Fallback: microgrid-served (resilient) zones in-pool; else a couple from pool.
        if zone_idxs is None:
            zone_idxs = _microgrid_zone_idxs() or pick(2)
        for zi in zone_idxs[:4]:
            gatherings.append(
                GatheringHint(
                    zone_id=engine.zones[zi].id, kind=kind, pull=p, hours=hours
                )
            )

    def demand(zones: list[int], mult: float, note: str) -> None:
        for zi in zones:
            # Clamp cumulative multiplier so rapid repeated scenarios can't blow demand up absurdly.
            engine.zone_demand_mult[zi] = float(
                np.clip(engine.zone_demand_mult[zi] * mult, 0.2, 6.0)
            )
            effects.append(
                ScenarioEffect(
                    target="demand",
                    zone_id=engine.zones[zi].id,
                    delta=mult - 1.0,
                    note=note,
                )
            )

    def outage(zones: list[int], note: str) -> None:
        for zi in zones:
            engine.zone_outage[zi] = True
            effects.append(
                ScenarioEffect(
                    target="grid", zone_id=engine.zones[zi].id, delta=-1.0, note=note
                )
            )

    def grid(mult: float, note: str) -> None:
        # Floor/cap so repeated grid damage can't drive capacity to ~0 (huge gridLoadPct).
        engine.grid_capacity_mult = float(
            np.clip(engine.grid_capacity_mult * mult, 0.2, 3.0)
        )
        effects.append(ScenarioEffect(target="grid", delta=mult - 1.0, note=note))

    def adopt(boost: float, note: str) -> None:
        engine.adoption_incentive = float(
            np.clip(engine.adoption_incentive + boost, 0.0, 1.0)
        )
        effects.append(ScenarioEffect(target="adoption", delta=boost, note=note))

    def sentiment(kind: str, delta: float, note: str) -> None:
        engine.sentiment.shift_target(kind, delta, target_idxs if localized else None)
        effects.append(
            ScenarioEffect(target="sentiment", delta=delta, note=f"{note} ({kind})")
        )

    def damage(k: int, note: str) -> None:
        ids = [i.id for i in engine.infra.values() if i.status != "damaged"]
        if not ids:
            return
        chosen = rng.choice(ids, size=min(k, len(ids)), replace=False)
        for iid in chosen:
            engine.infra[iid].status = "damaged"
            effects.append(
                ScenarioEffect(target="infra", infra_id=str(iid), delta=-1.0, note=note)
            )

    # --- per-type rule-based effects ---
    if scenario_type == "earthquake":
        damage(max(1, int(2 * imult)), "damaged by earthquake")
        outage(pick(int(3 * imult)), "earthquake outage")
        grid(1 - 0.3 * imult, "grid weakened by earthquake")
        gather("shelter", 0.8 * imult, 24)
        sentiment("microgrid", 0.2 * imult, "resilience desire")
        sentiment("battery", 0.15 * imult, "resilience desire")
    elif scenario_type == "heatwave":
        # Target the most heat-vulnerable zones (HVI) and scale each zone's cooling spike by
        # its HVI, so the heat-vulnerable get hit hardest. Falls back to a random spread.
        if engine.zone_hvi.any():
            hot = top_by(engine.zone_hvi, int(engine.num_zones * 0.6))
            for zi in hot:
                hvi = float(engine.zone_hvi[zi])
                demand(
                    [zi],
                    1 + 0.3 * imult * (0.6 + hvi),
                    "cooling demand (heat-vulnerable)",
                )
        else:
            demand(pick(int(engine.num_zones * 0.6)), 1 + 0.3 * imult, "cooling demand")
        gather("cooling_center", 0.6 * imult, 8)
        sentiment("solar", 0.15 * imult, "sunny-day enthusiasm")
        sentiment("battery", 0.1 * imult, "peak relief interest")
    elif scenario_type == "ice_storm":
        demand(pick(int(engine.num_zones * 0.5)), 1 + 0.25 * imult, "heating demand")
        damage(max(1, int(1.5 * imult)), "downed by ice storm")
        outage(pick(int(2 * imult)), "ice-storm outage")
        sentiment("battery", 0.15 * imult, "backup-power interest")
        gather("warming_center", 0.7 * imult, 12)
    elif scenario_type == "blackout":
        outage(pick(int(engine.num_zones * 0.5 * imult)), "blackout")
        grid(1 - 0.4 * imult, "grid failure")
        sentiment("microgrid", 0.3 * imult, "microgrid resilience")
        sentiment("battery", 0.2 * imult, "backup desire")
        gather("shelter", 0.85 * imult, 16)
    elif scenario_type == "gas_spike":
        adopt(0.25 * imult, "gas costs spur renewables")
        sentiment("solar", 0.15 * imult, "fuel-cost frustration")
    elif scenario_type == "population_boom":
        demand(pick(int(engine.num_zones * 0.4)), 1 + 0.2 * imult, "population growth")
        gather("crowd", 0.4 * imult, 8)
    elif scenario_type == "policy_incentive":
        adopt(0.3 * imult, "rebate program")
        for k in ("solar", "battery"):
            sentiment(k, 0.1 * imult, "incentive optimism")
    elif scenario_type == "turbine_noise_complaint":
        engine.sentiment.shift_target(
            "wind", -0.25 * imult, target_idxs if localized else None
        )
        effects.append(
            ScenarioEffect(
                target="sentiment", delta=-0.25 * imult, note="noise backlash (wind)"
            )
        )
    elif scenario_type == "solar_approved":
        sentiment("solar", 0.25 * imult, "permitting bylaw")
        adopt(0.15 * imult, "easier solar permits")
    elif scenario_type == "cold_snap":
        demand(pick(int(engine.num_zones * 0.6)), 1 + 0.3 * imult, "heating surge")
        gather("warming_center", 0.6 * imult, 10)
    elif scenario_type == "drought":
        sentiment("solar", 0.1 * imult, "hydro stress -> solar interest")
        grid(1 - 0.1 * imult, "hydro derate")
    elif scenario_type == "wind_lull":
        grid(1 - 0.15 * imult, "low wind output")
        sentiment("battery", 0.1 * imult, "firming interest")
    elif scenario_type == "grid_upgrade":
        grid(1 + 0.25 * imult, "transmission upgrade")
        for k in ("solar", "wind"):
            sentiment(k, 0.08 * imult, "grid confidence")
    elif scenario_type == "ev_surge":
        demand(pick(int(engine.num_zones * 0.5)), 1 + 0.15 * imult, "EV charging load")
        sentiment("ev_charger", 0.18 * imult, "charging access interest")
        sentiment("battery", 0.15 * imult, "storage interest")
        gather("charging_hub", 0.5 * imult, 6)
    elif scenario_type == "factory_opening":
        demand(pick(1), 1 + 0.6 * imult, "industrial load")
        gather("crowd", 0.5 * imult, 6)
    elif scenario_type == "flood":
        # Hit the highest flood-risk zones (flood.json): outage + damage infra there.
        if engine.zone_flood_risk.any():
            hit = top_by(engine.zone_flood_risk, max(2, int(2 + 2 * imult)))
        else:
            hit = pick(max(2, int(2 + 2 * imult)))
        outage(hit, "flood outage")
        damage_in_zones(hit, "damaged by flooding")
        grid(1 - 0.2 * imult, "flood damage to grid")
        gather("shelter", 0.8 * imult, 24)
        sentiment("battery", 0.15 * imult, "flood resilience")
        sentiment("microgrid", 0.2 * imult, "flood resilience")
    else:  # custom / fallback
        demand(pick(1), 1 + 0.1 * imult, "custom effect")

    # ml-informed adaptation: shift per-archetype opinion targets toward the technologies the
    # ml model says this scenario favours (e.g. blackout -> battery/microgrid surge). Layered on
    # top of the rule-based shifts above; bounded by clamping. Degrades to no-op without ml.
    _apply_ml_adaptation(engine, scenario_type, imult, effects)

    return Scenario(
        id=f"scn-{uuid.uuid4().hex[:8]}",
        type=scenario_type,  # type: ignore[arg-type]
        label=label,
        description=desc,
        effects=effects,
        started_tick=engine.tick,
        gatherings=gatherings,
    )


def _apply_ml_adaptation(
    engine: SimEngine, scenario_type: str, intensity: float, effects: list
) -> None:
    """Use ml.scenario_adoption (per-archetype) to nudge opinion targets toward favoured tech.

    Cheap: one ml call per distinct archetype (not per agent). No-op if ml unavailable.
    """
    from . import ml_bridge

    if not ml_bridge.ml_available():
        return

    # One representative agent per archetype from the sentiment model's agent list.
    reps: dict[str, object] = {}
    for a in engine.sentiment.agents:
        if a.archetype not in reps:
            reps[a.archetype] = a
    ctx = {"scenario": scenario_type, "intensity": float(intensity)}
    for archetype, agent in reps.items():
        sig = ml_bridge.scenario_adoption(agent, ctx)
        if not sig:
            continue
        for kind in ("solar", "wind", "battery", "microgrid"):
            if kind in sig:
                # Blend opinion target toward the ml propensity (moderate weight).
                engine.sentiment.nudge_target(
                    kind, float(sig[kind]), archetypes={archetype}, weight=0.35
                )
    effects.append(
        ScenarioEffect(
            target="sentiment", delta=0.0, note="ml-informed per-archetype adaptation"
        )
    )


def list_scenario_types() -> list[str]:
    return list(_META.keys())
