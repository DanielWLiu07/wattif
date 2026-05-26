"""Tests for the siting optimizer (greedy + OR-Tools paths)."""

from __future__ import annotations

from app.data.seed import build_world
from app.models import Recommendation
from app.optimizer import optimize, optimize_greedy, optimize_ortools
from app.sim.engine import SimEngine


def make_engine() -> SimEngine:
    zones, agents = build_world(seed=3, num_agents=600)
    return SimEngine(zones, agents, seed=3)


def test_greedy_returns_n_recommendations():
    eng = make_engine()
    eng.reset()
    recs = optimize_greedy(eng, kind=None, n=5)
    assert 1 <= len(recs) <= 5
    assert all(isinstance(r, Recommendation) for r in recs)


def test_recommendations_are_contract_valid():
    eng = make_engine()
    eng.reset()
    recs = optimize(eng, kind="solar", n=4)
    for r in recs:
        assert r.kind == "solar"
        assert r.expected_coverage_gain >= 0
        assert r.rationale and isinstance(r.rationale, str)
        lng, lat = r.position
        assert -80 < lng < -78 and 43 < lat < 44


def test_greedy_recommends_distinct_zones():
    eng = make_engine()
    eng.reset()
    recs = optimize_greedy(eng, kind=None, n=6)
    # Each recommendation should be a distinct neighbourhood (geographic spread).
    zone_idxs = [eng._nearest_zone(r.position) for r in recs]
    assert len(set(zone_idxs)) == len(zone_idxs)
    # Scores are positive and coverage gains are meaningful (> 0).
    assert all(r.score > 0 for r in recs)
    assert all(r.expected_coverage_gain > 0 for r in recs)


def test_equity_weighting_prefers_high_burden_zones():
    eng = make_engine()
    eng.reset()
    recs = optimize_greedy(eng, kind="microgrid", n=8)
    # At least one recommendation should land in an above-median energy-burden zone.
    burdens = sorted(z.demographics.energy_burden_index for z in eng.zones)
    median = burdens[len(burdens) // 2]
    chosen_burdens = []
    for r in recs:
        # nearest zone to the recommendation
        zi = eng._nearest_zone(r.position)
        chosen_burdens.append(eng.zones[zi].demographics.energy_burden_index)
    assert max(chosen_burdens) >= median


def test_ortools_path_runs_and_returns_recs():
    eng = make_engine()
    eng.reset()
    recs = optimize_ortools(eng, kind=None, n=5)
    assert len(recs) >= 1
    assert all(isinstance(r, Recommendation) for r in recs)


def test_optimize_clamps_n():
    eng = make_engine()
    eng.reset()
    recs = optimize(eng, kind="solar", n=999)
    assert len(recs) <= 25


def test_ev_charger_can_be_recommended():
    eng = make_engine()
    eng.reset()
    # Boost EV propensity in dense zones so EV chargers enter the candidate pool.
    eng.zone_ev_propensity[:] = 0.45
    recs = optimize_greedy(eng, kind="ev_charger", n=4)
    assert len(recs) >= 1
    assert all(r.kind == "ev_charger" for r in recs)
    assert all("EV" in r.rationale or "charging" in r.rationale.lower() for r in recs)
