"""Tests for the seeded data + tick simulation engine."""

from __future__ import annotations

from app.data.seed import build_world
from app.models import Infra, SimMetrics
from app.sim.engine import SimEngine


def make_engine(num_agents: int = 500) -> SimEngine:
    zones, agents = build_world(seed=7, num_agents=num_agents)
    return SimEngine(zones, agents, seed=7)


def test_seed_world_shapes():
    zones, agents = build_world(seed=1, num_agents=400)
    assert 20 <= len(zones) <= 60
    assert len(agents) >= 400 * 0.5  # at least roughly the requested count
    z = zones[0]
    assert 0.0 <= z.demographics.renter_pct <= 1.0
    assert 0.0 <= z.demographics.energy_burden_index <= 1.0
    assert 0.0 <= z.solar_potential <= 1.0
    assert z.demand_kwh_monthly > 0
    # coords are [lng, lat] in Toronto-ish bounds
    lng, lat = z.centroid
    assert -80 < lng < -78 and 43 < lat < 44


def test_seed_determinism():
    z1, a1 = build_world(seed=99, num_agents=300)
    z2, a2 = build_world(seed=99, num_agents=300)
    assert [z.demand_kwh_monthly for z in z1] == [z.demand_kwh_monthly for z in z2]
    assert [a.id for a in a1] == [a.id for a in a2]


def test_reset_returns_tick0():
    eng = make_engine()
    m = eng.reset()
    assert isinstance(m, SimMetrics)
    assert m.tick == 0
    assert m.year >= 2025
    assert m.total_demand_kwh > 0


def test_step_advances_tick_and_year():
    eng = make_engine()
    eng.reset()
    tick = eng.step()
    assert tick.metrics.tick == 1
    assert len(tick.zone_deltas) == eng.num_zones
    # 12 more ticks -> year increments
    eng.step_many(12)
    assert eng.current_metrics().year >= 2026


def test_metrics_are_in_valid_ranges():
    eng = make_engine()
    eng.reset()
    eng.step_many(24)
    m = eng.current_metrics()
    assert m.coverage_pct >= 0
    assert 0.0 <= m.equity_score <= 1.0
    assert m.grid_load_pct >= 0
    assert m.emissions_tonnes >= 0


def test_adoption_increases_coverage_over_time():
    eng = make_engine(num_agents=800)
    eng.reset()
    cov0 = eng.current_metrics().coverage_pct
    eng.step_many(36)
    cov1 = eng.current_metrics().coverage_pct
    # Rooftop adoption should grow renewable coverage without any infra placed.
    assert cov1 >= cov0


def test_placing_infra_raises_coverage_and_cost():
    eng = make_engine()
    eng.reset()
    before = eng.current_metrics()
    zone = eng.zones[0]
    eng.add_infra(
        Infra(
            id="t-solar",
            kind="solar",
            position=zone.centroid,
            capacity_kw=5000,
            cost_cad=7_500_000,
            model_url="/models/solar_array.glb",
            status="active",
        )
    )
    after = eng.current_metrics()
    assert after.renewable_supply_kwh > before.renewable_supply_kwh
    assert after.cost_cumulative_cad > before.cost_cumulative_cad
    assert eng.remove_infra("t-solar") is True
    assert eng.remove_infra("does-not-exist") is False


def test_emissions_drop_when_renewables_added():
    eng = make_engine()
    eng.reset()
    e_before = eng.current_metrics().emissions_tonnes
    # Add a large wind farm.
    eng.add_infra(
        Infra(
            id="t-wind",
            kind="wind",
            position=eng.zones[0].centroid,
            capacity_kw=50_000,
            cost_cad=100_000_000,
            model_url="/models/wind_turbine.glb",
            status="active",
        )
    )
    e_after = eng.current_metrics().emissions_tonnes
    assert e_after < e_before
