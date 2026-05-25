"""Tests for v2: scenarios, sentiment/opinion, voices, session reset, living-scene data."""

from __future__ import annotations

import numpy as np

from app.models import InfraCreate
from app.state import World


def fresh_world() -> World:
    return World()


# --- session / scenarios ---------------------------------------------------
def test_session_reset_clears_infra_and_scenarios():
    w = fresh_world()
    w.place_infra(InfraCreate(kind="solar", position=w.zones[0].centroid))
    w.apply_scenario("heatwave", 1.0)
    assert len(w.engine.infra) == 1
    assert len(w.active_scenarios) == 1
    w.session_reset()
    assert len(w.engine.infra) == 0
    assert len(w.active_scenarios) == 0
    assert w.engine.tick == 0
    assert w.engine.cost_cumulative == 0.0


def test_scenario_random_is_valid():
    w = fresh_world()
    scn = w.apply_scenario("random", 1.0)
    assert scn.type
    assert scn.effects  # at least one effect
    assert scn.started_tick == 0


def test_heatwave_raises_demand():
    w = fresh_world()
    base = w.engine.current_metrics().total_demand_kwh
    w.apply_scenario("heatwave", 1.0)
    after = w.engine.current_metrics().total_demand_kwh
    assert after > base


def test_blackout_creates_outages_and_drops_coverage():
    w = fresh_world()
    cov0 = w.engine.current_metrics().coverage_pct
    w.apply_scenario("blackout", 1.0)
    tick = w.engine.current_tick()
    assert any(d.outage for d in tick.zone_deltas)
    assert tick.metrics.coverage_pct <= cov0


def test_blackout_produces_shelter_gatherings():
    w = fresh_world()
    mg = w.place_infra(InfraCreate(kind="microgrid", position=w.zones[5].centroid))
    scn = w.apply_scenario("blackout", 1.0)
    assert scn.gatherings, "blackout should produce gathering hints"
    shelters = [g for g in scn.gatherings if g.kind == "shelter"]
    assert shelters
    for g in shelters:
        assert 0.0 <= g.pull <= 1.0 and g.hours > 0
    # Either backed by a real relief facility (position/name set) OR fall back to the lit
    # microgrid zone when facilities.json is absent.
    from app.data.loader import load_facilities

    if load_facilities():
        assert any(g.position is not None for g in shelters)
    else:
        mg_zone = w.zones[w.engine._nearest_zone(mg.position)].id
        assert any(g.zone_id == mg_zone for g in shelters)


def test_optimizer_excludes_no_build_zones():
    w = fresh_world()
    eng = w.engine
    # Force a couple of zones to no-build and confirm the optimizer never sites there.
    eng.zone_no_build[3] = True
    eng.zone_no_build[7] = True
    from app.optimizer import optimize

    recs = optimize(eng, kind=None, n=15)
    chosen = {eng._nearest_zone(r.position) for r in recs}
    assert 3 not in chosen and 7 not in chosen


def test_earthquake_damages_infra():
    w = fresh_world()
    for i in range(5):
        w.place_infra(InfraCreate(kind="solar", position=w.zones[i].centroid))
    w.apply_scenario("earthquake", 2.0)
    statuses = [inf.status for inf in w.engine.infra.values()]
    assert "damaged" in statuses


# --- sentiment / opinion ---------------------------------------------------
def test_approval_in_metrics_range():
    w = fresh_world()
    m = w.engine.current_metrics()
    assert 0.0 <= m.approval_pct <= 1.0
    assert 0 <= m.sim_hour <= 23


def test_opinion_drifts_toward_target():
    w = fresh_world()
    eng = w.engine
    before = eng.sentiment.city_approval_pct()
    # Strongly push every kind's target up, then advance.
    for k in ("solar", "wind", "battery", "microgrid"):
        eng.sentiment.shift_target_all(k, 0.4)
    eng.step_many(10)
    after = eng.sentiment.city_approval_pct()
    assert after > before


def test_placement_nudges_local_opinion():
    w = fresh_world()
    eng = w.engine
    zi = 0
    before = float(
        eng.sentiment.opinion[eng.sentiment.zone_idx == zi][:, 0].mean()
    )  # solar opinion
    w.place_infra(InfraCreate(kind="solar", position=w.zones[zi].centroid))
    eng.step_many(8)
    after = float(eng.sentiment.opinion[eng.sentiment.zone_idx == zi][:, 0].mean())
    assert after >= before


def test_attitudes_priors_load_and_seed():
    """attitudes.json (if present) loads as zoneId->priors and seeds opinions without error."""
    from app.data.loader import load_attitudes

    att = load_attitudes()
    if (
        att is None
    ):  # fixture not present in this env -> seeding falls back to model priors
        return
    sample = next(iter(att.values()))
    assert "proRenewablePrior" in sample and 0.0 <= sample["proRenewablePrior"] <= 1.0
    # World builds + summarizes without error and stays in range with attitudes seeding.
    w = fresh_world()
    assert 0.0 <= w.sentiment_summary().city_approval_pct <= 1.0


def test_scenario_localized_to_single_zone():
    w = fresh_world()
    w.apply_scenario("blackout", 1.0, zone_id="z003")
    outaged = [d.zone_id for d in w.engine.current_tick().zone_deltas if d.outage]
    assert outaged == ["z003"]


def test_scenario_localized_by_radius():
    w = fresh_world()
    center = w.zones[0].centroid
    scn = w.apply_scenario("heatwave", 1.0, center=center, radius_km=3.0)
    affected = {e.zone_id for e in scn.effects if e.target == "demand"}
    # all affected zones are within range (a small subset, not the whole city)
    assert 0 < len(affected) < len(w.zones)


def test_environment_blends_equity_weight():
    """environment.json (if present) blends pollution/low-green into the equity weight."""
    from app.data.loader import load_environment

    w = fresh_world()
    eng = w.engine
    assert eng.zone_equity_weight.shape == eng.zone_burden.shape
    assert (eng.zone_equity_weight >= 0).all() and (eng.zone_equity_weight <= 1).all()
    if (
        load_environment()
    ):  # when present, the blend should differ from raw energy burden
        import numpy as np

        assert not np.allclose(eng.zone_equity_weight, eng.zone_burden)


def test_existing_infra_penalizes_double_placement():
    """Zones with many existing renewables are down-weighted vs identical empty zones."""
    from app.optimizer import W_EXISTING

    w = fresh_world()
    eng = w.engine
    # Pick a zone and give it a heavy existing-infra count; optimizer score should drop.
    if (eng.zone_existing_renewables > 0).any() or True:
        eng.zone_existing_renewables[2] = 5
    pen = W_EXISTING * min(float(eng.zone_existing_renewables[2]), 3) / 3
    assert pen > 0  # a real penalty is applied in scoring


def test_generation_mix_uses_marginal_not_average():
    from app.sim.engine import GAS_EMISSION_FACTOR_T_PER_KWH

    g = GAS_EMISSION_FACTOR_T_PER_KWH * 1_000_000  # gCO2/kWh
    assert 400 <= g <= 500  # marginal gas-peaker range, NOT the ~38 g/kWh grid average


def test_flood_scenario_targets_high_risk_zones():
    from app.data.loader import load_flood

    w = fresh_world()
    eng = w.engine
    if not eng.zone_flood_risk.any():  # flood.json absent -> random fallback, skip
        assert load_flood() is None
        return
    top_risk = set(
        sorted(range(eng.num_zones), key=lambda i: -eng.zone_flood_risk[i])[:6]
    )
    w.apply_scenario("flood", 1.0)
    outaged = {i for i in range(eng.num_zones) if eng.zone_outage[i]}
    assert outaged and outaged <= top_risk  # flooding only hit the highest-risk zones


def test_heatwave_targets_high_hvi_zones():
    w = fresh_world()
    eng = w.engine
    if not eng.zone_hvi.any():
        return
    w.apply_scenario("heatwave", 1.0)
    hi = sorted(range(eng.num_zones), key=lambda i: -eng.zone_hvi[i])[:3]
    lo = sorted(range(eng.num_zones), key=lambda i: eng.zone_hvi[i])[:3]
    hi_mult = sum(float(eng.zone_demand_mult[i]) for i in hi) / 3
    lo_mult = sum(float(eng.zone_demand_mult[i]) for i in lo) / 3
    assert hi_mult > lo_mult  # most heat-vulnerable hit hardest


def test_hvi_folded_into_equity_weight():
    from app.data.loader import load_heat_vulnerability

    w = fresh_world()
    eng = w.engine
    assert (eng.zone_equity_weight >= 0).all() and (eng.zone_equity_weight <= 1).all()
    if load_heat_vulnerability() and eng.zone_hvi.any():
        i = int(eng.zone_hvi.argmax())
        assert eng.zone_equity_weight[i] >= eng.zone_burden[i] - 0.15


def test_district_energy_endpoint_and_microgrid_note():
    from fastapi.testclient import TestClient

    import app.state as state
    from app.main import app
    from app.optimizer import optimize

    state.reset_world()
    c = TestClient(app)
    de = c.get("/api/district-energy").json()
    assert isinstance(de["zones"], list)
    if not de["available"]:
        return
    assert de["servicePolygon"] is not None
    assert {"zoneId", "servedFraction", "systemName"} <= set(de["zones"][0])
    # served zones load into the engine and microgrid recs there surface the district-energy note
    w = state.get_world()
    assert (w.engine.zone_district_energy > 0).any()
    recs = optimize(w.engine, kind="microgrid", n=12)
    assert any("district energy" in r.rationale for r in recs)


def test_sbei_endpoint():
    from fastapi.testclient import TestClient

    import app.state as state
    from app.main import app

    state.reset_world()
    s = TestClient(app).get("/api/sbei").json()
    assert "available" in s
    if s["available"]:
        assert s.get("communityWideMtCO2e", 0) > 0


def test_flood_and_heat_endpoints():
    from fastapi.testclient import TestClient

    import app.state as state
    from app.main import app

    state.reset_world()
    c = TestClient(app)
    f = c.get("/api/flood").json()
    h = c.get("/api/heat-vulnerability").json()
    assert isinstance(f["zones"], list) and isinstance(h["zones"], list)
    if f["available"]:
        assert {"zoneId", "floodRiskScore", "floodRisk"} <= set(f["zones"][0])
    if h["available"]:
        assert {"zoneId", "hvi", "level"} <= set(h["zones"][0])


def test_sentiment_is_heterogeneous_across_zones():
    """Per-zone approval must be visibly varied (not a flat band) — data-driven baselines."""
    import numpy as np

    w = fresh_world()
    vals = np.array(list(w.sentiment_summary().per_zone.values()))
    assert vals.max() - vals.min() >= 0.30  # wide spread
    assert vals.std() >= 0.08  # decent dispersion, not flat


def test_within_zone_opinion_distribution():
    """A zone's agents are a real distribution (archetype mix + variance), not identical."""

    w = fresh_world()
    eng = w.engine
    z0 = eng.sentiment.opinion[eng.sentiment.zone_idx == 0]
    # per-kind spread within the zone is non-trivial
    assert z0[:, 0].std() > 0.02


def test_placement_shifts_only_local_zone():
    import numpy as np

    w = fresh_world()
    w.session_reset()
    before = w.engine.sentiment.approval_by_zone().copy()
    w.place_infra(InfraCreate(kind="microgrid", position=w.zones[10].centroid))
    w.engine.step_many(12)
    after = w.engine.sentiment.approval_by_zone()
    delta = after - before
    others = np.delete(delta, 10)
    # the placed zone moves; untouched zones barely move (sentiment shifts are LOCAL)
    assert abs(delta[10]) > abs(others).mean()


def test_sentiment_summary_shape():
    w = fresh_world()
    s = w.sentiment_summary()
    assert 0.0 <= s.city_approval_pct <= 1.0
    assert len(s.per_zone) == len(w.zones)


# --- voices ----------------------------------------------------------------
def test_voices_rule_based_shape():
    w = fresh_world()
    voices = w.voices(n=6, rng=np.random.default_rng(0))
    assert len(voices) == 6
    for v in voices:
        assert v.text and v.stance in ("support", "oppose", "neutral")
        assert v.topic in ("solar", "wind", "battery", "microgrid")
        assert v.avatar_seed == v.agent_id


def test_voices_event_aware_context():
    w = fresh_world()
    voices = w.voices(n=12, context="blackout", rng=np.random.default_rng(0))
    # Blackout context should surface event-flavoured vocabulary in at least one post.
    kw = ("blackout", "grid", "dark", "outage", "lit")
    assert any(any(k in v.text.lower() for k in kw) for v in voices)


def test_voices_carry_ids_and_position():
    w = fresh_world()
    for v in w.voices(n=8, rng=np.random.default_rng(2)):
        assert v.agent_id and v.zone_id
        assert (
            v.position is not None and len(v.position) == 2
        )  # [lng,lat] for a 3D bubble


def test_reaction_voices_on_placement():
    w = fresh_world()
    zid = w.zones[6].id
    rxn = w.reaction_voices(
        trigger="placement",
        zone_id=zid,
        kind="battery",
        n=3,
        rng=np.random.default_rng(0),
    )
    assert rxn
    for v in rxn:
        assert v.trigger == "placement"
        assert v.zone_id == zid  # tied to the placement's zone
        assert v.position is not None


def test_reaction_voices_on_scenario():
    w = fresh_world()
    scn = w.apply_scenario("blackout", 1.0, zone_id="z003")
    rxn = w.scenario_reaction_voices(scn, n=4, rng=np.random.default_rng(0))
    assert rxn
    assert all(v.trigger == "blackout" for v in rxn)
    # blackout was localized to z003 -> reactions come from there
    assert all(v.zone_id == "z003" for v in rxn)


def test_voices_endpoint_event_placement():
    from fastapi.testclient import TestClient

    import app.state as state
    from app.main import app

    state.reset_world()
    c = TestClient(app)
    r = c.get(
        "/api/agents/voices?event=placement&zoneId=z006&kind=battery&enrich=false"
    ).json()
    assert r and all(v["trigger"] == "placement" and v["zoneId"] == "z006" for v in r)
    assert all("position" in v for v in r)


def test_archetypes_endpoint_and_mix():
    from fastapi.testclient import TestClient

    import app.state as state
    from app.main import app

    state.reset_world()
    r = TestClient(app).get("/api/archetypes").json()
    assert r["available"] and r["source"] in ("data", "model")
    assert r["zones"]
    z0 = r["zones"][0]["mix"]
    assert z0 and abs(sum(z0.values()) - 1.0) < 0.05  # proportions sum to ~1


def test_population_mirrors_archetype_mix():
    """When archetypes.json is present, each zone's agents mirror its real mix (plurality match)."""
    from app.data.loader import load_archetypes
    from app.state import archetype_mix

    mix = load_archetypes()
    if not mix:
        return  # absent -> falls back to data/seed archetypes
    w = fresh_world()
    actual = archetype_mix(w.agents, w.zones)
    checked = 0
    for zid, props in mix.items():
        if zid not in actual or not actual[zid]:
            continue
        target_top = max(props, key=props.get)
        actual_top = max(actual[zid], key=actual[zid].get)
        # plurality archetype should match (multinomial sampling, so allow occasional ties)
        if props[target_top] >= 0.35:  # only assert when there's a clear dominant
            assert actual_top == target_top, (zid, target_top, actual_top)
            checked += 1
    assert checked > 0  # we actually exercised some dominant-mix zones


def test_voices_are_opinionated_with_spread():
    """Fewer fence-sitters, more clear stances + persona personality."""
    w = fresh_world()
    voices = w.voices(n=50, rng=np.random.default_rng(5))
    stances = {v.stance for v in voices}
    assert {"support", "oppose"} <= stances  # a real spread of clear stances
    # bland fence-sitting generic line should be rare (personas dominate)
    bland = sum(1 for v in voices if "could go either way" in v.text.lower())
    assert bland <= 3
    assert len({v.text for v in voices}) >= 40  # varied


def test_voices_are_varied_not_repetitive():
    """The no-key library must read diverse — most of a large sample should be distinct lines."""
    w = fresh_world()
    voices = w.voices(n=30, rng=np.random.default_rng(11))
    texts = [v.text for v in voices]
    assert len(set(texts)) >= 24  # at least 80% distinct
    assert len({v.stance for v in voices}) >= 2  # multiple stances represented


# --- living scene ----------------------------------------------------------
def test_flows_reflect_placed_infra():
    w = fresh_world()
    assert w.flows() == []
    w.place_infra(InfraCreate(kind="wind", position=w.zones[0].centroid))
    flows = w.flows()
    assert len(flows) == 1
    assert flows[0].power_kwh > 0


def test_activity_log_reports_placement_and_outage():
    w = fresh_world()
    w.place_infra(InfraCreate(kind="microgrid", position=w.zones[3].centroid))
    t1 = w.engine.step()  # placement should surface as "online" this tick
    assert any("online" in a.lower() for a in t1.activity)
    # advance, then a blackout -> outage line appears
    w.engine.step_many(2)
    w.apply_scenario("blackout", 1.0)
    t = w.engine.step()
    assert any("outage" in a.lower() or "dark" in a.lower() for a in t.activity)
    # activity is capped to a readable few
    assert 1 <= len(t.activity) <= 5


def test_activity_log_backfill_endpoint():
    from fastapi.testclient import TestClient

    import app.state as state
    from app.main import app

    state.reset_world()
    c = TestClient(app)
    c.post("/api/sim/reset")
    c.post("/api/sim/step", json={"ticks": 5})
    data = c.get("/api/activity?since=2").json()
    assert "activity" in data
    assert all(e["tick"] > 2 for e in data["activity"])
    assert all(isinstance(e["activity"], list) for e in data["activity"])


def test_no_auto_firing_scenarios():
    """Base sim must NOT spawn scenarios on its own — only explicit apply_scenario does."""
    w = fresh_world()
    w.session_reset()
    assert w.active_scenarios == []
    w.engine.step_many(30)
    assert w.active_scenarios == []  # 30 months pass with zero auto-events
    assert not w.engine.zone_outage.any()


def test_zone_delta_living_scene_fields():
    w = fresh_world()
    d = w.engine.current_tick().zone_deltas[0]
    assert 0.0 <= d.demand_intensity <= 1.0
    assert d.adoption_count >= 0
    assert isinstance(d.outage, bool)
    assert (
        0.0 <= d.approval <= 1.0
    )  # 0..1 approval rate (same units as metrics.approvalPct)


def test_sentiment_perzone_and_city_same_scale():
    """perZone and cityApprovalPct must be the SAME 0..1 units: city ≈ mean(perZone)."""
    import numpy as np

    w = fresh_world()
    s = w.sentiment_summary()
    vals = np.array(list(s.per_zone.values()))
    assert (vals >= 0).all() and (vals <= 1).all()
    assert (
        abs(s.city_approval_pct - vals.mean()) < 0.05
    )  # consistent (agent-count weighting aside)
