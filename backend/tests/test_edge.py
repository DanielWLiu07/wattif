"""Edge-case / robustness tests — the demo must never 500 or crash."""

from __future__ import annotations

import asyncio
import math

import pytest
from fastapi.testclient import TestClient

import app.state as state
from app.main import app
from app.models import InfraCreate
from app.planner import PlannerChat
from app.state import World


@pytest.fixture
def client():
    state.reset_world()
    return TestClient(app)


# --- empty session ---------------------------------------------------------
def test_empty_session_endpoints_dont_crash(client):
    client.post("/api/session/reset")
    assert client.get("/api/flows").json() == []
    assert client.post("/api/optimize", json={"n": 5}).status_code == 200
    assert client.post("/api/sim/step", json={"ticks": 3}).status_code == 200
    s = client.get("/api/sentiment").json()
    assert 0.0 <= s["cityApprovalPct"] <= 1.0
    # planner on an empty world still runs to a 'done'
    pr = client.post("/api/planner/run", json={"budgetCad": 20_000_000}).json()
    assert any(e["type"] == "done" for e in pr["events"])


# --- rapid repeated placements + scenarios ---------------------------------
def test_rapid_placements_and_scenarios_stay_bounded():
    w = World()
    w.session_reset()
    for i in range(30):
        w.place_infra(
            InfraCreate(kind="solar", position=w.zones[i % w.engine.num_zones].centroid)
        )
    for _ in range(25):
        w.apply_scenario("heatwave", 1.0)
        w.apply_scenario("blackout", 1.0)
    w.engine.step_many(10)
    m = w.engine.current_metrics()
    # No NaN/inf; scenario levers are clamped.
    assert math.isfinite(m.total_demand_kwh) and m.total_demand_kwh > 0
    assert math.isfinite(m.grid_load_pct)
    assert float(w.engine.zone_demand_mult.max()) <= 6.0 + 1e-9
    assert float(w.engine.grid_capacity_mult) >= 0.2 - 1e-9
    assert 0.0 <= m.approval_pct <= 1.0


# --- malformed / boundary requests -----------------------------------------
def test_malformed_requests_return_4xx_not_500(client):
    assert (
        client.post(
            "/api/infra", json={"kind": "nuclear", "position": [-79.4, 43.7]}
        ).status_code
        == 422
    )
    assert (
        client.post("/api/scenario", json={"type": "not_a_real_scenario"}).status_code
        == 422
    )
    assert client.delete("/api/infra/does-not-exist").status_code == 404
    assert client.get("/api/forecast?zoneId=zzz").status_code == 404
    assert client.get("/api/activity?since=abc").status_code == 422
    # benign boundaries that should be clamped, not error:
    assert client.post("/api/optimize", json={"n": 0}).status_code == 200
    assert client.post("/api/sim/step", json={"ticks": -5}).status_code == 200
    assert client.get("/api/agents?zoneId=nonexistent").json() == []


# --- planner: impossible / gibberish instruction ---------------------------
def test_planner_handles_gibberish_instruction():
    w = World()
    w.session_reset()
    chat = PlannerChat(w, budget_cad=40_000_000)

    async def go():
        return [ev async for ev in chat.turn("asdf qwer zxcv 🙃 ???")]

    events = asyncio.run(go())
    assert events[-1]["type"] == "done"  # completes gracefully, no crash


def test_planner_tool_errors_are_surfaced_not_raised():
    from app.planner import PlannerTools

    w = World()
    w.session_reset()
    tools = PlannerTools(w, 60_000_000)
    assert "error" in tools.execute("place_infrastructure", {})  # missing kind
    assert "error" in tools.execute("remove_infrastructure", {"id": "nope"})
    assert "error" in tools.execute("totally_unknown_tool", {})


# --- session reset mid-conversation ----------------------------------------
def test_session_reset_mid_chat_is_safe():
    w = World()
    w.session_reset()
    chat = PlannerChat(w, budget_cad=60_000_000)

    async def turn(msg):
        return [ev async for ev in chat.turn(msg)]

    asyncio.run(turn("add solar"))
    w.session_reset()  # wipe the world out from under the chat
    events = asyncio.run(turn("now add batteries"))  # must still complete
    assert events[-1]["type"] == "done"


# --- WS robustness ---------------------------------------------------------
def test_ws_sim_reset_and_step_rapidly(client):
    with client.websocket_connect("/ws/sim") as ws:
        ws.receive_json()  # initial state
        for _ in range(3):
            ws.send_json({"action": "step", "ticks": 1})
            ws.send_json({"action": "reset"})
        # drain a bunch of frames without error
        for _ in range(10):
            ws.receive_json()


def test_ws_sim_ignores_bad_message(client):
    with client.websocket_connect("/ws/sim") as ws:
        ws.receive_json()
        ws.send_json({"action": "bogus"})  # unknown action -> ignored
        ws.send_json({"garbage": True})  # no action -> ignored
        ws.send_json({"action": "step", "ticks": 1})  # still works after
        # should still get a tick frame
        got_tick = any(ws.receive_json().get("type") == "tick" for _ in range(6))
        assert got_tick


def test_ws_planner_stop_and_disconnect(client):
    with client.websocket_connect("/ws/planner") as ws:
        ws.send_json(
            {
                "type": "user_message",
                "text": "add solar",
                "mode": "auto",
                "budgetCad": 20_000_000,
            }
        )
        # let it stream a few events, then stop
        for _ in range(5):
            ws.receive_json()
        ws.send_json({"action": "stop"})
    # context exit (disconnect) must not raise out of the handler
