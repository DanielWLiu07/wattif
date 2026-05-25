"""Tests for the agentic planner — exercises the no-key planner-lite path + tool guardrails."""

from __future__ import annotations

import asyncio

import pytest

from app.planner import PlannerTools, run_planner
from app.state import World


@pytest.fixture
def no_llm(monkeypatch):
    """No provider at all (demo disabled) -> exercises the bare planner-lite path."""
    import app.config as config

    monkeypatch.setattr(config, "ANTHROPIC_API_KEY", None)
    monkeypatch.setattr(config, "FEATHER_API_KEY", None)
    monkeypatch.setattr(config, "FEATHER_BASE_URL", None)
    monkeypatch.setattr(config, "DEMO_LLM", False)


@pytest.fixture
def demo_llm(monkeypatch):
    """Scripted demo provider active (no real key)."""
    import app.config as config

    monkeypatch.setattr(config, "ANTHROPIC_API_KEY", None)
    monkeypatch.setattr(config, "FEATHER_API_KEY", None)
    monkeypatch.setattr(config, "FEATHER_BASE_URL", None)
    monkeypatch.setattr(config, "DEMO_LLM", True)


def _run(world, **kw):
    async def collect():
        return [ev async for ev in run_planner(world, **kw)]

    return asyncio.run(collect())


def test_planner_lite_runs_without_key(no_llm):
    w = World()
    w.session_reset()
    events = _run(w, mode="auto", budget_cad=30_000_000)
    types = {e["type"] for e in events}
    assert "thought" in types and "tool_call" in types and "done" in types
    assert any(e["type"] == "placement" for e in events)
    assert len(w.engine.infra) >= 1


def test_planner_respects_budget(no_llm):
    w = World()
    w.session_reset()
    events = _run(w, mode="auto", budget_cad=7_000_000)  # tight budget
    done = next(e for e in events if e["type"] == "done")
    assert done["spentCad"] <= 7_000_000


def test_demo_planner_exercises_full_tool_loop(demo_llm):
    w = World()
    w.session_reset()
    events = _run(w, mode="auto", budget_cad=40_000_000)
    tool_calls = {e["name"] for e in events if e["type"] == "tool_call"}
    # The scripted demo agent should touch the richer tool surface, not just optimize+place.
    assert {
        "get_city_state",
        "get_metrics",
        "optimize",
        "place_infrastructure",
        "run_simulation",
    } <= tool_calls
    assert any(e["type"] == "placement" for e in events)
    done = next(e for e in events if e["type"] == "done")
    assert done["spentCad"] <= 40_000_000


def test_demo_planner_step_mode_rejects(demo_llm):
    w = World()
    w.session_reset()

    async def confirm(_call):
        return False  # reject everything

    async def collect():
        from app.planner import run_planner

        return [
            ev
            async for ev in run_planner(
                w, mode="step", budget_cad=40_000_000, confirm=confirm
            )
        ]

    events = asyncio.run(collect())
    assert not any(e["type"] == "placement" for e in events)  # all rejected
    assert len(w.engine.infra) == 0


def test_tool_place_validates_kind():
    w = World()
    w.session_reset()
    tools = PlannerTools(w, 60_000_000)
    assert "error" in tools.execute("place_infrastructure", {"kind": "nuclear"})


def test_tool_place_rejects_out_of_bounds():
    w = World()
    w.session_reset()
    tools = PlannerTools(w, 60_000_000)
    res = tools.execute(
        "place_infrastructure", {"kind": "solar", "position": [0.0, 0.0]}
    )
    assert "error" in res


def test_tool_place_rejects_over_budget():
    w = World()
    w.session_reset()
    tools = PlannerTools(w, 1000.0)  # can't afford anything
    res = tools.execute(
        "place_infrastructure", {"kind": "wind", "zoneId": w.zones[0].id}
    )
    assert "error" in res and "budget" in res["error"].lower()


def test_tool_place_and_budget_tracking():
    w = World()
    w.session_reset()
    tools = PlannerTools(w, 60_000_000)
    before = tools.remaining
    res = tools.execute(
        "place_infrastructure", {"kind": "solar", "zoneId": w.zones[0].id}
    )
    assert "placed" in res
    assert tools.remaining < before
    # budget tool reflects spend
    b = tools.execute("get_budget", {})
    assert b["remainingCad"] == round(tools.remaining, 2)


def _collect_turn(chat, msg, confirm=None):
    async def go():
        return [ev async for ev in chat.turn(msg, confirm)]

    return asyncio.run(go())


def test_parse_intent_detects_kind_and_count():
    from app.planner import parse_intent

    assert parse_intent("add battery storage near hospitals")["kind"] == "battery"
    assert parse_intent("put up solar panels")["kind"] == "solar"
    assert parse_intent("build 4 microgrids")["kind"] == "microgrid"
    assert parse_intent("build 4 microgrids")["n"] == 4
    assert parse_intent("add storage near hospitals")["zone_query"] == "hospital"


def test_chat_multi_turn_preserves_world(demo_llm):
    from app.planner import PlannerChat

    w = World()
    w.session_reset()
    chat = PlannerChat(w, budget_cad=120_000_000)
    t1 = _collect_turn(chat, "maximize coverage and equity")
    assert any(e["type"] == "placement" for e in t1)
    n1 = len(w.engine.infra)
    # Follow-up turn with a specific intent — world (infra) persists and grows.
    t2 = _collect_turn(chat, "now add battery storage near high-burden areas")
    kinds = [e["infra"]["kind"] for e in t2 if e["type"] == "placement"]
    assert kinds and all(k == "battery" for k in kinds)
    assert len(w.engine.infra) > n1


def test_chat_reacts_to_injected_scenario(demo_llm):
    from app.planner import PlannerChat

    w = World()
    w.session_reset()
    chat = PlannerChat(w, budget_cad=120_000_000)
    # Inject a blackout before the turn; the agent must observe + pivot to resilient tech.
    scn = w.apply_scenario("blackout", 1.0)
    chat.inject_scenario(scn)
    events = _collect_turn(chat, "build out renewables")
    assert any(e["type"] == "scenario" for e in events)
    assert any(
        e["type"] == "thought" and "pivot" in e.get("text", "").lower() for e in events
    )
    # placements after the reaction should favour microgrid/battery
    scn_idx = next(i for i, e in enumerate(events) if e["type"] == "scenario")
    kinds_after = [
        e["infra"]["kind"] for e in events[scn_idx:] if e["type"] == "placement"
    ]
    assert kinds_after and all(k in ("microgrid", "battery") for k in kinds_after)


def test_ws_planner_honors_typed_user_message(demo_llm):
    """Regression: /ws/planner must use the frontend's {type:'user_message', text} as the goal
    and run it through the intent parser (not ignore text and run generic auto)."""
    from fastapi.testclient import TestClient

    import app.state as state
    from app.main import app

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
        ws.send_json(
            {
                "type": "user_message",
                "text": "add battery storage near high-burden areas",
                "mode": "auto",
                "budgetCad": 80_000_000,
            }
        )
        kinds = [e["infra"]["kind"] for e in drain(ws) if e["type"] == "placement"]
        assert kinds and all(k == "battery" for k in kinds)
        # continue-turn with the same shape, different instruction
        ws.send_json({"type": "user_message", "text": "now add solar panels"})
        kinds2 = [e["infra"]["kind"] for e in drain(ws) if e["type"] == "placement"]
        assert kinds2 and all(k == "solar" for k in kinds2)
        ws.send_json({"action": "stop"})


def test_tool_optimize_returns_zone_ids():
    w = World()
    w.session_reset()
    tools = PlannerTools(w, 60_000_000)
    res = tools.execute("optimize", {"n": 3})
    assert res["recommendations"]
    assert all("zoneId" in r for r in res["recommendations"])
