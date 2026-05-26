"""Phase 9 concern-aware operator recommendation tests."""

from __future__ import annotations

import asyncio

import pytest

from app.concern_recommendations import (
    _collapse_deferred_actions,
    _placement_rationale,
    build_concern_recommendations,
    deduplicate_concerns,
    extract_location_hints,
    is_concern_improvement_intent,
    rank_zones_by_hints,
)
from app.planner import PlannerChat, PlannerTools
from app.state import World


def test_deduplicate_concerns_merges_parking_duplicates():
    concerns = [
        {
            "id": "a",
            "cohortName": "EV owners",
            "topic": "parking_and_congestion",
            "stance": "oppose",
            "severity": "high",
            "summary": "Parking congestion.",
            "evidence": ["Dataset: ev_feedback.csv"],
            "relatedDatasetIds": ["ds1"],
        },
        {
            "id": "b",
            "cohortName": "EV owners",
            "topic": "parking_and_congestion",
            "stance": "oppose",
            "severity": "medium",
            "summary": "Curb parking issues.",
            "evidence": ["Dataset: chargers.csv"],
            "relatedDatasetIds": ["ds2"],
        },
    ]
    merged = deduplicate_concerns(concerns)
    assert len(merged) == 1
    assert merged[0]["severity"] == "high"
    assert "combined signal" in merged[0]["summary"].lower()
    assert len(merged[0]["relatedDatasetIds"]) == 2


def test_extract_location_hints_from_islington_datasets():
    hints = extract_location_hints(
        [{"name": "ev_owner_feedback_islington_city_centre_west.csv"}],
        [],
    )
    assert "islington" in hints


def test_rank_zones_by_hints_finds_islington():
    w = World()
    w.session_reset()
    zids, note, _pid, pname = rank_zones_by_hints(w.engine, ["islington"])
    assert zids
    names = {z.name for z in w.engine.zones if z.id in zids}
    assert any("islington" in n.lower() for n in names)
    assert note and "islington" in note.lower()
    assert pname and "islington" in pname.lower()


def test_rank_zones_excludes_rexdale_when_islington_primary():
    w = World()
    w.session_reset()
    zids, _, _, pname = rank_zones_by_hints(w.engine, ["islington"])
    names = {z.name.lower() for z in w.engine.zones if z.id in zids}
    assert all("islington" in n for n in names)
    assert not any("rexdale" in n for n in names)


def test_collapse_deferred_groups_microgrid_lines():
    raw = [
        {"kinds": ["microgrid"], "zoneName": "A", "estimatedCostCad": 10_000_000},
        {"kinds": ["microgrid"], "zoneName": "B", "estimatedCostCad": 10_000_000},
        {"kinds": ["microgrid"], "zoneName": "C", "estimatedCostCad": 10_000_000},
        {"kinds": ["battery"], "zoneName": "D", "estimatedCostCad": 4_000_000},
    ]
    collapsed = _collapse_deferred_actions(raw, max_items=2, remaining_budget=500_000)
    assert len(collapsed) <= 2
    assert any("3 candidate" in c["action"] or "microgrid placements" in c["action"] for c in collapsed)


def test_placement_rationale_uses_concern_labels():
    ev = _placement_rationale(
        "ev_charger",
        "Rexdale-Kipling",
        geo_aligned=False,
        primary_zone_name="Islington-City Centre West",
        concern_topics=["parking_and_congestion"],
    )
    assert "Parking-aware" in ev
    assert "Fallback" in ev
    assert "Islington" in ev

    bat = _placement_rationale(
        "battery",
        "Islington-City Centre West",
        geo_aligned=True,
        primary_zone_name="Islington-City Centre West",
        concern_topics=["peak_demand_pressure"],
    )
    assert "peak-demand" in bat.lower() or "Peak-demand" in bat
    assert "matches uploaded dataset geography" in bat


def test_budget_filters_expensive_optional_actions():
    w = World()
    w.session_reset()
    tools = PlannerTools(w, 500_000.0)  # tight — microgrid/battery too expensive
    concerns = [
        {
            "id": "c1",
            "topic": "peak_demand_pressure",
            "severity": "high",
            "summary": "Peak stress.",
        }
    ]
    rec = build_concern_recommendations(
        concerns=concerns,
        dataset_summaries=[{"name": "energy_demand_islington.csv"}],
        tools=tools,
    )
    assert not rec["optional_tool_actions"] or all(
        a.get("estimatedCostCad", 0) <= 500_000 for a in rec["optional_tool_actions"]
    )
    assert rec.get("deferred_actions") or any(
        a.get("deferred") for a in rec.get("recommended_actions", [])
    )
    if rec.get("deferred_actions"):
        assert len(rec["deferred_actions"]) <= 2


def test_islington_hints_prioritize_matching_zone():
    w = World()
    w.session_reset()
    tools = PlannerTools(w, 80_000_000)
    concerns = [
        {
            "id": "c1",
            "topic": "ev_charger_access",
            "severity": "high",
            "summary": "Charger access gap.",
        }
    ]
    rec = build_concern_recommendations(
        concerns=concerns,
        dataset_summaries=[{"name": "ev_chargers_islington_city_centre_west.csv"}],
        tools=tools,
    )
    assert "islington" in rec["summary"].lower()
    if rec["optional_tool_actions"]:
        zid = rec["optional_tool_actions"][0]["args"]["zoneId"]
        zone = next(z for z in w.engine.zones if z.id == zid)
        assert "islington" in zone.name.lower()
        assert "Parking-aware" in rec["optional_tool_actions"][0]["rationale"] or "EV charger access" in rec["optional_tool_actions"][0]["rationale"]
        assert rec["optional_tool_actions"][0].get("geoAligned") is True


def test_refresh_recommendation_after_actions_updates_infra():
    from app.concern_recommendations import refresh_recommendation_after_actions

    rec = {
        "summary": "old",
        "key_concerns_considered": [{"topic": "peak_demand_pressure"}],
        "context": {"datasetCount": 1},
        "_datasets": [{"name": "demand.csv"}],
    }
    updated = refresh_recommendation_after_actions(
        rec,
        proposal_infra=[],
        session_placements=[{"kind": "battery"}, {"kind": "ev_charger"}],
        placed_count=2,
        remaining_budget=70_000_000,
    )
    assert "battery" in updated["summary"]
    assert "none" not in updated["summary"].lower() or "infra now:" in updated["summary"]
    assert updated["context"]["placedThisTurn"] == 2


def test_concern_improvement_intent_explicit():
    from app.concern_recommendations import is_concern_improvement_intent

    assert is_concern_improvement_intent("", intent="concern_recommendation")
    assert is_concern_improvement_intent("anything", intent="address_concerns")


def test_build_concern_recommendations_maps_parking_and_peak():
    concerns = [
        {
            "id": "c1",
            "topic": "parking_and_congestion",
            "severity": "high",
            "summary": "Parking congestion around chargers.",
        },
        {
            "id": "c2",
            "topic": "peak_demand_pressure",
            "severity": "high",
            "summary": "Summer peak stress.",
        },
        {
            "id": "c3",
            "topic": "affordability_and_peaks",
            "severity": "medium",
            "summary": "Heatwave peak exposure for burdened households.",
        },
    ]
    rec = build_concern_recommendations(
        concerns=concerns,
        dataset_summaries=[{"name": "ev_feedback_islington.csv"}],
    )
    actions = " ".join(a["action"] for a in rec["recommended_actions"])
    assert "parking" in actions.lower() or "lot" in actions.lower()
    assert "battery" in actions.lower() or "microgrid" in actions.lower()
    assert any(a.get("scenarioType") == "heatwave" for a in rec["recommended_actions"])
    assert "ev_feedback_islington.csv" in rec["summary"]


def test_fetch_concerns_includes_project_scoped_when_proposal_set(monkeypatch):
    from app.cohort_context import fetch_concern_summaries

    rows = [
        {"id": "1", "project_id": "p1", "proposal_id": None, "topic": "ev_charger_access", "summary": "a"},
        {"id": "2", "project_id": "p1", "proposal_id": "prop1", "topic": "parking_and_congestion", "summary": "b"},
        {"id": "3", "project_id": "p1", "proposal_id": "other", "topic": "x", "summary": "c"},
    ]

    monkeypatch.setattr(
        "app.cohort_context.agents_repo.list_profiles",
        lambda **_: [{"id": "prof1", "name": "EV owners"}],
    )
    monkeypatch.setattr(
        "app.cohort_context.agents_repo.list_concerns",
        lambda **_: rows,
    )
    out = fetch_concern_summaries(project_id="p1", proposal_id="prop1")
    topics = {c.get("topic") for c in out}
    assert "ev_charger_access" in topics
    assert "parking_and_congestion" in topics
    assert "x" not in topics


def test_ws_planner_concern_mode_with_project_context(demo_llm, monkeypatch):
    """WS must sync project/proposal on user_message and route concern intent."""
    from fastapi.testclient import TestClient

    import app.state as state
    from app.main import app

    monkeypatch.setattr(
        "app.cohort_context.fetch_concern_summaries",
        lambda **_: [
            {
                "id": "c1",
                "cohortName": "EV owners",
                "topic": "parking_and_congestion",
                "severity": "high",
                "summary": "Parking impacts.",
            }
        ],
    )
    monkeypatch.setattr(
        "app.dataset_context.fetch_dataset_summaries",
        lambda **_: [{"name": "islington_feedback.csv"}],
    )
    monkeypatch.setattr(
        "app.cohort_context.fetch_proposal_infra_summary",
        lambda **_: [],
    )

    state.reset_world()
    client = TestClient(app)

    def drain(ws):
        evs = []
        for _ in range(200):
            e = ws.receive_json()
            evs.append(e)
            if e["type"] == "done":
                break
        return evs

    with client.websocket_connect("/ws/planner") as ws:
        ws.send_json({"mode": "auto", "budgetCad": 80_000_000})
        ws.send_json(
            {
                "type": "user_message",
                "text": "Improve this proposal based on resident concerns",
                "intent": "concern_recommendation",
                "projectId": "proj-1",
                "proposalId": "prop-1",
            }
        )
        events = drain(ws)
        assert any(e["type"] == "recommendation" for e in events)
        rec = next(e for e in events if e["type"] == "recommendation")["recommendation"]
        assert any("parking" in (c.get("topic") or "") for c in rec["key_concerns_considered"])
        assert not any(e["name"] == "get_city_state" for e in events if e.get("type") == "tool_call")
        ws.send_json({"action": "stop"})


def test_generic_chat_still_uses_demo_turn(demo_llm):
    from app.planner import PlannerChat

    w = World()
    w.session_reset()
    chat = PlannerChat(w, budget_cad=80_000_000)
    events = _collect_turn(chat, "add battery storage near high-burden areas")
    assert not any(e["type"] == "recommendation" for e in events)
    assert any(e["type"] == "tool_call" and e["name"] == "optimize" for e in events)


def test_concern_improvement_intent_detection():
    assert is_concern_improvement_intent(
        "Improve this proposal based on resident concerns."
    )
    assert is_concern_improvement_intent("How do we reduce opposition to this EV charger plan?")
    assert is_concern_improvement_intent("What should I add for heatwave resilience?")
    assert not is_concern_improvement_intent("Add solar to downtown")


def test_build_concern_recommendations_maps_ev_access():
    concerns = [
        {
            "id": "c1",
            "cohortName": "EV owners",
            "topic": "ev_charger_access",
            "severity": "high",
            "stance": "mixed",
            "summary": "Limited fast-charging near transit.",
            "evidence": ["Dataset: chargers.csv"],
        }
    ]
    rec = build_concern_recommendations(
        concerns=concerns,
        dataset_summaries=[{"name": "chargers.csv", "datasetType": "ev_chargers"}],
        proposal_infra=[{"kind": "ev_charger"}],
    )
    assert rec["key_concerns_considered"]
    assert any("ev_charger" in (a.get("kinds") or []) for a in rec["recommended_actions"])
    assert rec["tradeoffs"]
    assert "decision-support" in rec["summary"].lower() or "Reviewed" in rec["summary"]


def test_build_concern_recommendations_empty_concerns():
    rec = build_concern_recommendations(concerns=[], dataset_summaries=[])
    assert rec["recommended_actions"]
    assert "No synthetic cohort concerns" in rec["summary"]


def test_build_concern_recommendations_heatwave_prompt():
    concerns = [
        {
            "id": "c2",
            "topic": "peak_demand_pressure",
            "severity": "high",
            "summary": "Summer peak stress.",
        }
    ]
    rec = build_concern_recommendations(
        concerns=concerns,
        user_message="What should I add for heatwave resilience?",
    )
    topics = [a.get("sourceTopics", []) for a in rec["recommended_actions"]]
    flat = [t for group in topics for t in group]
    assert "heat_vulnerability" in flat or "peak_demand_pressure" in flat


def test_build_concern_recommendations_optional_tool_actions():
    w = World()
    w.session_reset()
    tools = PlannerTools(w, 60_000_000)
    concerns = [
        {
            "id": "c3",
            "topic": "grid_capacity",
            "severity": "high",
            "summary": "Check feeder headroom.",
        }
    ]
    rec = build_concern_recommendations(concerns=concerns, tools=tools)
    assert rec["optional_tool_actions"]
    assert rec["optional_tool_actions"][0]["name"] == "place_infrastructure"


def test_build_planner_context_includes_concerns_and_infra(monkeypatch):
    from app.cohort_context import build_planner_context

    monkeypatch.setattr(
        "app.dataset_context.fetch_dataset_summaries",
        lambda **_: [{"name": "demand.csv", "datasetType": "energy_demand", "columns": ["peak"]}],
    )
    monkeypatch.setattr(
        "app.cohort_context.fetch_concern_summaries",
        lambda **_: [
            {
                "cohortName": "Grid advocates",
                "topic": "peak_demand_pressure",
                "severity": "high",
                "stance": "mixed",
                "summary": "Peak stress",
            }
        ],
    )
    monkeypatch.setattr(
        "app.cohort_context.fetch_proposal_infra_summary",
        lambda **_: [{"kind": "ev_charger", "zoneId": "z1"}],
    )
    ctx = build_planner_context(project_id="p1", proposal_id="prop1")
    assert ctx
    assert "Uploaded project datasets" in ctx
    assert "synthetic cohort concerns" in ctx.lower()
    assert "proposal infrastructure" in ctx.lower()


@pytest.fixture
def demo_llm(monkeypatch):
    import app.config as config

    monkeypatch.setattr(config, "ANTHROPIC_API_KEY", None)
    monkeypatch.setattr(config, "FEATHER_API_KEY", None)
    monkeypatch.setattr(config, "FEATHER_BASE_URL", None)
    monkeypatch.setattr(config, "DEMO_LLM", True)


def _collect_turn(chat, msg, confirm=None):
    async def go():
        return [ev async for ev in chat.turn(msg, confirm)]

    return asyncio.run(go())


def test_planner_chat_concern_recommendation_demo(demo_llm, monkeypatch):
    monkeypatch.setattr(
        "app.cohort_context.fetch_concern_summaries",
        lambda **_: [
            {
                "id": "x1",
                "cohortName": "EV owners",
                "topic": "parking_and_congestion",
                "severity": "high",
                "stance": "oppose",
                "summary": "Parking congestion around chargers.",
                "evidence": ["feedback row"],
            }
        ],
    )
    monkeypatch.setattr(
        "app.dataset_context.fetch_dataset_summaries",
        lambda **_: [{"name": "feedback.csv", "datasetType": "ev_sentiment"}],
    )
    monkeypatch.setattr(
        "app.cohort_context.fetch_proposal_infra_summary",
        lambda **_: [],
    )

    w = World()
    w.session_reset()
    chat = PlannerChat(
        w,
        budget_cad=80_000_000,
        project_id="proj-1",
        proposal_id="prop-1",
    )
    events = _collect_turn(chat, "Improve this proposal based on resident concerns.")
    assert any(e["type"] == "recommendation" for e in events)
    rec_ev = next(e for e in events if e["type"] == "recommendation")
    rec = rec_ev["recommendation"]
    assert any("parking" in (c.get("topic") or "") for c in rec["key_concerns_considered"])
    assert any(e["type"] == "done" for e in events)


def test_run_planner_concern_mode(demo_llm, monkeypatch):
    from app.planner import run_planner

    monkeypatch.setattr(
        "app.cohort_context.fetch_concern_summaries",
        lambda **_: [
            {
                "id": "y1",
                "topic": "ev_charger_access",
                "severity": "medium",
                "summary": "Access gap.",
            }
        ],
    )
    monkeypatch.setattr(
        "app.dataset_context.fetch_dataset_summaries",
        lambda **_: [],
    )
    monkeypatch.setattr(
        "app.cohort_context.fetch_proposal_infra_summary",
        lambda **_: [],
    )

    w = World()
    w.session_reset()

    async def collect():
        return [
            ev
            async for ev in run_planner(
                w,
                goal="Use resident concerns to recommend infrastructure changes.",
                project_id="p1",
                proposal_id="prop1",
            )
        ]

    events = asyncio.run(collect())
    assert any(e["type"] == "recommendation" for e in events)


def test_concern_recommendation_persist_skips_when_disabled(monkeypatch, demo_llm):
    from app.db.repositories.base import PersistenceDisabledError

    def _raise(*_a, **_k):
        raise PersistenceDisabledError("off")

    monkeypatch.setattr("app.db.repositories.planner_runs.create_run", _raise)
    monkeypatch.setattr("app.cohort_context.fetch_concern_summaries", lambda **_: [])
    monkeypatch.setattr("app.dataset_context.fetch_dataset_summaries", lambda **_: [])
    monkeypatch.setattr("app.cohort_context.fetch_proposal_infra_summary", lambda **_: [])

    w = World()
    w.session_reset()
    chat = PlannerChat(w, 80_000_000, proposal_id="prop-x")
    events = _collect_turn(chat, "Address uploaded feedback for this proposal.")
    assert any(e["type"] == "recommendation" for e in events)
