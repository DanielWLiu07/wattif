"""Tick simulation orchestrator. 1 tick = 1 simulated month.

Deterministic and fast: each tick advances rule-based demand growth + rooftop-solar
adoption, computes renewable supply from placed infrastructure, and recomputes global
SimMetrics (coverage, grid load, emissions vs a gas baseline, cumulative cost, and an
equity score weighted toward serving high energy-burden zones).
"""

from __future__ import annotations

import numpy as np

from .. import config
from ..models import (
    Infra,
    SimMetrics,
    SimTick,
    Zone,
    ZoneDelta,
)
from .agents import (
    AgentArrays,
    adoption_pct_by_zone,
    adoption_step,
    rooftop_supply_kwh,
)

HOURS_PER_MONTH = 730.0

# Capacity factors by infra kind (fraction of nameplate realized as average output).
CAPACITY_FACTOR: dict[str, float] = {
    "solar": 0.15,
    "wind": 0.30,
    "battery": 0.0,  # storage: no net generation; provides peak shaving
    "microgrid": 0.20,
}

# MARGINAL displacement factor (tonnes CO2 / kWh). Ontario's *average* grid is ~38 gCO2/kWh
# (89% non-emitting per generation_mix.json), but renewables/storage displace GAS PEAKERS at the
# margin — so we credit ~450 gCO2/kWh, the honest "what does adding this actually avoid" figure.
# Using the 38 g average would make savings look trivial. The avg/mix is kept for display only.
GAS_EMISSION_FACTOR_T_PER_KWH = 0.00045  # 450 gCO2/kWh marginal (gas peaker)

# Monthly demand growth (electrification trend).
DEMAND_GROWTH_PER_TICK = 0.004  # ~0.4%/month

# Peaking assumptions for grid-load calc.
PEAK_TO_AVG = 1.6
GRID_HEADROOM = 1.25  # capacity = initial peak * headroom


class SimEngine:
    """Holds world state and advances it tick by tick."""

    def __init__(self, zones: list[Zone], agents, *, seed: int | None = None):
        self.zones = zones
        self.num_zones = len(zones)
        self.seed = config.RANDOM_SEED if seed is None else seed

        # Static per-zone arrays.
        self.zone_base_demand = np.array(
            [z.demand_kwh_monthly for z in zones], dtype=np.float64
        )
        self.zone_burden = np.array(
            [z.demographics.energy_burden_index for z in zones], dtype=np.float64
        )
        self.zone_centroids = np.array([z.centroid for z in zones], dtype=np.float64)

        self.agent_arrays = AgentArrays.build(agents, zones)

        # Agents are a representative SAMPLE of each neighbourhood, but zone demand reflects
        # the full population. Scale sampled rooftop supply up so adoption moves coverage
        # at a realistic neighbourhood scale: representation = zone_demand / sampled_demand.
        sampled_demand = np.zeros(self.num_zones)
        np.add.at(
            sampled_demand, self.agent_arrays.zone_idx, self.agent_arrays.demand_kwh
        )
        self.zone_representation = np.divide(
            self.zone_base_demand,
            sampled_demand,
            out=np.ones(self.num_zones),
            where=sampled_demand > 0,
        )

        # Placed infrastructure.
        self.infra: dict[str, Infra] = {}

        # Grid capacity baseline (peak kW) frozen at first reset.
        initial_peak_kw = (self.zone_base_demand.sum() / HOURS_PER_MONTH) * PEAK_TO_AVG
        self.grid_capacity_kw = initial_peak_kw * GRID_HEADROOM

        # Per-zone siting constraints (constraints.json, defensive). sitingPenalty 0..1 down-weights
        # the optimizer; noBuild excludes the zone from siting entirely. Defaults: no constraint.
        self.zone_siting_penalty = np.zeros(self.num_zones)
        self.zone_no_build = np.zeros(self.num_zones, dtype=bool)
        try:
            from ..data.loader import load_constraints

            cons = load_constraints()
            if cons:
                for i, z in enumerate(zones):
                    c = cons.get(z.id)
                    if c:
                        self.zone_siting_penalty[i] = float(c.get("sitingPenalty", 0.0))
                        self.zone_no_build[i] = bool(c.get("noBuild", False))
        except Exception:  # noqa: BLE001 — constraints are optional
            pass

        # Per-zone flood risk (flood.json) + heat-vulnerability index (heat_vulnerability.json),
        # defensive. Used by the flood/heatwave scenarios and (HVI) the equity weight.
        self.zone_flood_risk = np.zeros(self.num_zones)
        self.zone_hvi = np.zeros(self.num_zones)
        try:
            from ..data.loader import load_flood, load_heat_vulnerability

            flood = load_flood() or {}
            hv = load_heat_vulnerability() or {}
            for i, z in enumerate(zones):
                if z.id in flood:
                    self.zone_flood_risk[i] = float(
                        flood[z.id].get("floodRiskScore", 0.0)
                    )
                if z.id in hv:
                    self.zone_hvi[i] = float(
                        hv[z.id].get("heatVulnerabilityIndex", hv[z.id].get("hvi", 0.0))
                    )
        except Exception:  # noqa: BLE001 — flood/heat layers are optional
            pass

        # Equity weight (environment.json + heat vulnerability, defensive). Blends energy burden
        # with pollution burden, low-green, AND heat vulnerability, so the equity score rewards
        # serving high-pollution / low-green / heat-vulnerable zones. Defaults to raw burden.
        self.zone_equity_weight = self.zone_burden.copy()
        try:
            from ..data.loader import load_environment

            env = load_environment() or {}
            if env or self.zone_hvi.any():
                for i, z in enumerate(zones):
                    burden = float(self.zone_burden[i])
                    e = env.get(z.id) or {}
                    pollution = float(e.get("pollutionBurden", burden))
                    low_green = 1.0 - float(e.get("greenScore", 0.5))
                    hvi = float(self.zone_hvi[i]) if self.zone_hvi[i] > 0 else burden
                    self.zone_equity_weight[i] = float(
                        np.clip(
                            0.45 * burden
                            + 0.20 * pollution
                            + 0.12 * low_green
                            + 0.23 * hvi,
                            0.0,
                            1.0,
                        )
                    )
        except Exception:  # noqa: BLE001 — environment layer is optional
            pass

        # Existing real installations per zone (existing_infra.json, defensive) — used to avoid
        # double-placing where the city already has renewables.
        self.zone_existing_renewables = np.zeros(self.num_zones)
        try:
            from ..data.loader import load_existing_infra

            existing = load_existing_infra()
            if existing:
                zone_index = {z.id: i for i, z in enumerate(zones)}
                for item in existing:
                    if (
                        item.get("kind") == "renewable_install"
                        and item.get("zoneId") in zone_index
                    ):
                        self.zone_existing_renewables[zone_index[item["zoneId"]]] += 1
        except Exception:  # noqa: BLE001 — existing-infra layer is optional
            pass

        # v2: public-opinion model (drift toward scenario/placement targets).
        from .sentiment import SentimentModel

        self.sentiment = SentimentModel(agents, zones, seed=self.seed)

        self.reset()

    # ------------------------------------------------------------------
    # v2: scenario state (session-scoped levers; cleared on reset)
    # ------------------------------------------------------------------
    def _reset_scenario_state(self) -> None:
        self.zone_demand_mult = np.ones(self.num_zones)  # scenario demand multiplier
        self.zone_outage = np.zeros(self.num_zones, dtype=bool)  # darkened zones
        self.grid_capacity_mult = 1.0  # grid damage
        self.adoption_incentive = 0.0  # policy/gas-spike boost 0..1

    # ------------------------------------------------------------------
    # Lifecycle
    # ------------------------------------------------------------------
    def reset(self) -> SimMetrics:
        self.tick = 0
        self.cost_cumulative = 0.0
        self.agent_arrays.reset()
        self.sentiment.reset()
        self._reset_scenario_state()
        self._rng = np.random.default_rng(self.seed)
        # Cumulative cost reflects whatever infra is currently placed.
        self.cost_cumulative = sum(i.cost_cad for i in self.infra.values())

        # Activity-log state (human-readable per-tick changes for the UI).
        self.activity_log: list[dict] = []
        self._recent_placements: list[dict] = []
        metrics, deltas = self._compute()
        # Prime previous-tick trackers from the tick-0 snapshot.
        self._prev_adopted = np.array(
            [d.adoption_count for d in deltas], dtype=np.float64
        )
        self._prev_approval = np.array([d.approval for d in deltas], dtype=np.float64)
        self._prev_coverage = np.array(
            [d.coverage_pct for d in deltas], dtype=np.float64
        )
        self._prev_city_coverage = metrics.coverage_pct
        return metrics

    # ------------------------------------------------------------------
    # Infra management
    # ------------------------------------------------------------------
    def add_infra(self, infra: Infra) -> None:
        self.infra[infra.id] = infra
        self.cost_cumulative += infra.cost_cad
        zi = self._nearest_zone(infra.position)
        # A new installation nudges local public opinion toward that technology.
        self.sentiment.on_placement(infra.kind, zi)
        # Record for the next tick's activity log ("X came online in <zone>").
        if hasattr(self, "_recent_placements"):
            self._recent_placements.append(
                {"kind": infra.kind, "zone": self.zones[zi].name}
            )

    def remove_infra(self, infra_id: str) -> bool:
        infra = self.infra.pop(infra_id, None)
        if infra is None:
            return False
        self.cost_cumulative = max(0.0, self.cost_cumulative - infra.cost_cad)
        return True

    def list_infra(self) -> list[Infra]:
        return list(self.infra.values())

    # ------------------------------------------------------------------
    # Helpers
    # ------------------------------------------------------------------
    def _nearest_zone(self, position: tuple[float, float]) -> int:
        d = self.zone_centroids - np.array(position)
        return int(np.argmin((d * d).sum(axis=1)))

    def _infra_supply_by_zone(self):
        """Returns (supply, total_battery_kw, supportive_count, microgrid_supply) per zone.

        Damaged infra (scenario effects) contributes nothing. microgrid_supply is tracked
        separately so a blackout can leave microgrid-served zones lit (resilience moment)."""
        supply = np.zeros(self.num_zones)
        microgrid_supply = np.zeros(self.num_zones)
        battery_kw = 0.0
        supportive = np.zeros(
            self.num_zones
        )  # solar+microgrid count (drives local adoption)
        for infra in self.infra.values():
            if infra.status == "damaged":
                continue
            zi = self._nearest_zone(infra.position)
            cf = CAPACITY_FACTOR.get(infra.kind, 0.0)
            gen = infra.capacity_kw * cf * HOURS_PER_MONTH
            supply[zi] += gen
            if infra.kind == "microgrid":
                microgrid_supply[zi] += gen
            if infra.kind == "battery":
                battery_kw += infra.capacity_kw
            if infra.kind in ("solar", "microgrid"):
                supportive[zi] += 1
        return supply, battery_kw, supportive, microgrid_supply

    def _current_zone_demand(self) -> np.ndarray:
        growth = (1.0 + DEMAND_GROWTH_PER_TICK) ** self.tick
        return self.zone_base_demand * growth * self.zone_demand_mult

    def _compute(self) -> tuple[SimMetrics, list[ZoneDelta]]:
        """Compute metrics + per-zone deltas for the CURRENT state (no advancement)."""
        zone_demand = self._current_zone_demand()

        infra_supply, battery_kw, _, microgrid_supply = self._infra_supply_by_zone()

        # Rooftop adoption supply aggregated per zone.
        rooftop = rooftop_supply_kwh(self.agent_arrays)
        rooftop_by_zone = np.zeros(self.num_zones)
        np.add.at(rooftop_by_zone, self.agent_arrays.zone_idx, rooftop)
        rooftop_by_zone *= (
            self.zone_representation
        )  # scale sample -> full neighbourhood

        zone_supply = infra_supply + rooftop_by_zone

        # Blackout/earthquake outage: grid + distributed PV (anti-islanding) go dark; only an
        # islanded microgrid keeps a zone lit — the "microgrid stays on" resilience moment.
        if self.zone_outage.any():
            zone_supply = np.where(self.zone_outage, microgrid_supply, zone_supply)

        total_demand = float(zone_demand.sum())
        total_supply = float(zone_supply.sum())
        # Renewable can't usefully exceed demand for "served" accounting.
        served_renewable = float(np.minimum(zone_supply, zone_demand).sum())

        coverage_pct = total_supply / total_demand if total_demand else 0.0

        # Emissions: gas baseline for the unmet (grid-served) demand.
        unmet = max(total_demand - served_renewable, 0.0)
        emissions_tonnes = unmet * GAS_EMISSION_FACTOR_T_PER_KWH

        # Grid load: net peak power vs capacity (reduced by battery shaving; scenario grid
        # damage shrinks effective capacity, pushing load % up).
        net_energy = max(total_demand - total_supply, 0.0)
        net_peak_kw = (net_energy / HOURS_PER_MONTH) * PEAK_TO_AVG
        net_peak_kw = max(net_peak_kw - battery_kw, 0.0)
        effective_capacity = self.grid_capacity_kw * self.grid_capacity_mult
        grid_load_pct = net_peak_kw / effective_capacity if effective_capacity else 0.0

        # Equity: coverage weighted by energy burden (serving high-burden zones scores high).
        zone_cov = np.divide(
            zone_supply,
            zone_demand,
            out=np.zeros_like(zone_supply),
            where=zone_demand > 0,
        )
        zone_cov = np.clip(zone_cov, 0.0, 1.0)
        # Equity = coverage weighted by the blended equity weight (energy burden + pollution +
        # low-green from environment.json). Rewards serving the most overburdened neighbourhoods.
        weight_sum = self.zone_equity_weight.sum()
        equity_score = (
            float((self.zone_equity_weight * zone_cov).sum() / weight_sum)
            if weight_sum
            else 0.0
        )

        # v2: public opinion + day/night clock. approval is 0..1 ("approval rate"), the SAME
        # units as SimMetrics.approvalPct so the map tint and HUD agree.
        approval_by_zone = self.sentiment.mean_opinion_by_zone()
        sim_hour = self.tick % 24
        max_demand = float(zone_demand.max()) if self.num_zones else 1.0
        demand_intensity = (
            zone_demand / max_demand if max_demand else np.zeros(self.num_zones)
        )

        metrics = SimMetrics(
            tick=self.tick,
            year=config.START_YEAR + self.tick // 12,
            total_demand_kwh=round(total_demand, 1),
            renewable_supply_kwh=round(total_supply, 1),
            coverage_pct=round(coverage_pct, 4),
            grid_load_pct=round(grid_load_pct, 4),
            emissions_tonnes=round(emissions_tonnes, 2),
            cost_cumulative_cad=round(self.cost_cumulative, 2),
            equity_score=round(equity_score, 4),
            approval_pct=round(self.sentiment.city_approval_pct(), 4),
            sim_hour=sim_hour,
        )

        adoption_pct = adoption_pct_by_zone(self.agent_arrays, self.num_zones)
        adopted_counts = np.zeros(self.num_zones)
        np.add.at(
            adopted_counts,
            self.agent_arrays.zone_idx,
            (self.agent_arrays.has_rooftop & self.agent_arrays.adopted).astype(
                np.float64
            ),
        )
        deltas = [
            ZoneDelta(
                zone_id=self.zones[i].id,
                demand_kwh=round(float(zone_demand[i]), 1),
                renewable_supply_kwh=round(float(zone_supply[i]), 1),
                coverage_pct=round(float(zone_cov[i]), 4),
                adoption_pct=round(float(adoption_pct[i]), 4),
                approval=round(float(approval_by_zone[i]), 3),
                demand_intensity=round(float(demand_intensity[i]), 3),
                adoption_count=int(adopted_counts[i]),
                outage=bool(self.zone_outage[i]),
            )
            for i in range(self.num_zones)
        ]
        return metrics, deltas

    # ------------------------------------------------------------------
    # Advancement
    # ------------------------------------------------------------------
    def step(self) -> SimTick:
        """Advance one tick (one month) and return metrics + per-zone deltas."""
        self.tick += 1

        # Local infra (+ scenario adoption incentive) raises adoption appetite in a zone.
        _, _, supportive, _ = self._infra_supply_by_zone()
        zone_infra_boost = np.clip(supportive / 3.0 + self.adoption_incentive, 0.0, 1.0)

        adoption_step(self.agent_arrays, self.tick, zone_infra_boost, self._rng)
        self.sentiment.step()  # drift public opinion toward current targets

        metrics, deltas = self._compute()
        activity = self._build_activity(metrics, deltas)
        self.activity_log.append(
            {"tick": metrics.tick, "year": metrics.year, "activity": activity}
        )
        if len(self.activity_log) > 240:
            self.activity_log = self.activity_log[-240:]
        return SimTick(metrics=metrics, zone_deltas=deltas, activity=activity)

    def _build_activity(self, metrics, deltas) -> list[str]:
        """Derive the ~3-5 most significant human-readable changes vs the previous tick."""
        cands: list[tuple[float, str]] = []  # (significance, message)

        # Newly-online infrastructure (placed since the last tick).
        for p in self._recent_placements:
            label = {
                "solar": "Solar array",
                "wind": "Wind installation",
                "battery": "Battery storage",
                "microgrid": "Microgrid",
            }.get(p["kind"], p["kind"].title())
            cands.append((120.0, f"{label} online in {p['zone']}"))
        self._recent_placements = []

        # Active outages (scenario-driven). High priority — the resilience moment.
        n_out = int(self.zone_outage.sum())
        if n_out > 0:
            mg_lit = sum(
                1
                for inf in self.infra.values()
                if inf.kind == "microgrid" and inf.status != "damaged"
            )
            tail = (
                f", {mg_lit} microgrid{'s' if mg_lit != 1 else ''} holding"
                if mg_lit
                else ""
            )
            cands.append(
                (110.0, f"Outage: {n_out} zone{'s' if n_out != 1 else ''} dark{tail}")
            )

        # Per-zone changes.
        for i, d in enumerate(deltas):
            name = self.zones[i].name
            adopt_gain = d.adoption_count - self._prev_adopted[i]
            if adopt_gain >= 3:
                cands.append(
                    (
                        float(adopt_gain),
                        f"{name}: +{int(adopt_gain)} rooftop solar adopted",
                    )
                )
            cov_gain = d.coverage_pct - self._prev_coverage[i]
            if cov_gain >= 0.05:
                cands.append(
                    (
                        cov_gain * 120,
                        f"{name}: renewable coverage up to {d.coverage_pct * 100:.0f}%",
                    )
                )
            appr_delta = d.approval - self._prev_approval[i]
            if abs(appr_delta) >= 0.02:
                pct = int(d.approval * 100)  # approval is 0..1
                verb = "rose" if appr_delta > 0 else "dipped"
                cands.append(
                    (abs(appr_delta) * 200, f"Approval in {name} {verb} to {pct}%")
                )

        # City-wide coverage milestone.
        city_cov_gain = metrics.coverage_pct - self._prev_city_coverage
        if city_cov_gain >= 0.003:
            cands.append(
                (
                    city_cov_gain * 300,
                    f"City renewable coverage now {metrics.coverage_pct * 100:.1f}% (+{city_cov_gain * 100:.1f})",
                )
            )

        # Update trackers.
        self._prev_adopted = np.array(
            [d.adoption_count for d in deltas], dtype=np.float64
        )
        self._prev_approval = np.array([d.approval for d in deltas], dtype=np.float64)
        self._prev_coverage = np.array(
            [d.coverage_pct for d in deltas], dtype=np.float64
        )
        self._prev_city_coverage = metrics.coverage_pct

        cands.sort(key=lambda c: c[0], reverse=True)
        msgs = [m for _, m in cands[:5]]
        if not msgs:
            msgs = [
                f"Year {metrics.year}: steady — coverage {metrics.coverage_pct * 100:.1f}%, approval {metrics.approval_pct * 100:.0f}%"
            ]
        return msgs

    def step_many(self, ticks: int) -> SimMetrics:
        """Advance several ticks; return final metrics."""
        last: SimTick | None = None
        for _ in range(max(1, ticks)):
            last = self.step()
        return last.metrics if last else self.current_metrics()

    def current_metrics(self) -> SimMetrics:
        metrics, _ = self._compute()
        return metrics

    def current_tick(self) -> SimTick:
        metrics, deltas = self._compute()
        return SimTick(metrics=metrics, zone_deltas=deltas)

    # ------------------------------------------------------------------
    # v2: living-scene energy flows (source -> zone power, for particle streams)
    # ------------------------------------------------------------------
    def flows(self):
        """[{fromInfraId, toZoneId, powerKwh}] — each active install powers its host zone."""
        from ..models import Flow

        out: list[Flow] = []
        for infra in self.infra.values():
            if infra.status == "damaged":
                continue
            cf = CAPACITY_FACTOR.get(infra.kind, 0.0)
            power = infra.capacity_kw * cf * HOURS_PER_MONTH
            if power <= 0:
                continue
            zi = self._nearest_zone(infra.position)
            out.append(
                Flow(
                    from_infra_id=infra.id,
                    to_zone_id=self.zones[zi].id,
                    power_kwh=round(power, 1),
                )
            )
        return out
