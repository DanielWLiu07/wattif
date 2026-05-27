"""Planner intent gate and tool permission guard (Phase 15)."""

from __future__ import annotations

import asyncio

import pytest

from app.planner import PlannerChat, PlannerTools
from app.planner_dispatch import BLOCKED_MUTATION_ANSWER, dispatch_planner_turn
from app.planner_intent import classify_planner_intent
from app.state import World


@pytest.fixture
def demo_llm(monkeypatch):
    import app.config as config

    monkeypatch.setattr(config, "ANTHROPIC_API_KEY", None)
    monkeypatch.setattr(config, "FEATHER_API_KEY", None)
    monkeypatch.setattr(config, "FEATHER_BASE_URL", None)
    monkeypatch.setattr(config, "DEMO_LLM", True)


def _collect(chat: PlannerChat, message: str, intent: str | None = None) -> list[dict]:
    async def run():
        out = []
        async for ev in dispatch_planner_turn(chat, message, intent=intent):
            out.append(ev)
        return out

    return asyncio.run(run())


def _all_text(events: list[dict]) -> str:
    parts = []
    for e in events:
        if e.get("type") == "thought":
            parts.append(e.get("text", ""))
        elif e.get("type") == "answer":
            parts.append(e.get("text", ""))
        elif e.get("type") == "done" and e.get("summary"):
            parts.append(e.get("summary", ""))
    return "\n".join(parts)


def _tool_names(events: list[dict]) -> list[str]:
    return [e["name"] for e in events if e.get("type") == "tool_call"]


def test_heatwave_exact_browser_case(demo_llm, monkeypatch):
    monkeypatch.setattr("app.cohort_context.fetch_concern_summaries", lambda **_: [])
    w = World()
    w.session_reset()
    chat = PlannerChat(w, 80_000_000, project_id="p1", proposal_id="prop1")
    msg = "Prepare the grid for a heatwave"
    assert classify_planner_intent(msg) == "resilience_scenario"
    events = _collect(chat, msg)
    blob = _all_text(events)
    assert "Understood:" not in blob
    assert "find the best sites" not in blob.lower()
    assert "optimize" not in _tool_names(events)
    assert "place_infrastructure" not in _tool_names(events)
    answers = [e for e in events if e["type"] == "answer"]
    dones = [e for e in events if e["type"] == "done"]
    assert len(answers) == 1
    assert len(dones) == 1
    assert "summary" not in dones[0]
    assert events[0].get("intent") == "resilience_scenario"


def test_tool_guard_blocks_placement_on_resilience_intent(demo_llm):
    w = World()
    w.session_reset()
    n_before = len(w.engine.infra)
    tools = PlannerTools(w, 80_000_000)
    tools.guard_intent = "resilience_scenario"
    res = tools.execute(
        "place_infrastructure", {"kind": "solar", "zoneId": w.zones[0].id}
    )
    assert res.get("blocked") is True
    assert BLOCKED_MUTATION_ANSWER in res.get("userMessage", "")
    assert len(w.engine.infra) == n_before


def test_tool_guard_blocks_optimize_on_resilience_intent(demo_llm):
    w = World()
    w.session_reset()
    tools = PlannerTools(w, 80_000_000)
    tools.guard_intent = "resilience_scenario"
    res = tools.execute("optimize", {"kind": "solar", "n": 5})
    assert res.get("blocked") is True


def test_recommendation_ev_no_place(demo_llm, monkeypatch):
    monkeypatch.setattr(
        "app.existing_infra_context.fetch_uploaded_infrastructure",
        lambda **_: [{"asset_kind": "ev_charger", "name": "A"}],
    )
    monkeypatch.setattr(
        "app.dataset_context.fetch_dataset_summaries",
        lambda **_: [{"name": "ev.csv", "rowCount": 1}],
    )
    monkeypatch.setattr(
        "app.concern_recommendations.build_concern_recommendations",
        lambda **kw: {
            "summary": "Add chargers near gaps.",
            "key_concerns_considered": [],
            "recommended_actions": [],
            "tradeoffs": [],
            "suggested_next_step": "Review",
            "optional_tool_actions": [
                {
                    "name": "place_infrastructure",
                    "args": {"kind": "ev_charger", "zoneId": "z1"},
                }
            ],
        },
    )
    monkeypatch.setattr(
        "app.cohort_context.fetch_concern_summaries",
        lambda **_: [{"topic": "ev_charger_access", "severity": "high"}],
    )
    monkeypatch.setattr("app.cohort_context.fetch_proposal_infra_summary", lambda **_: [])
    w = World()
    w.session_reset()
    chat = PlannerChat(w, 80_000_000, project_id="p1", proposal_id="prop1")
    events = _collect(
        chat,
        "where should we add more EV charging capacity based on uploaded chargers?",
    )
    assert "place_infrastructure" not in _tool_names(events)
    assert len(w.engine.infra) == 0


def test_explicit_placement_allows_optimize(demo_llm):
    w = World()
    w.session_reset()
    chat = PlannerChat(w, 80_000_000)
    events = _collect(chat, "Add solar to the highest-burden neighbourhoods")
    assert classify_planner_intent("Add solar to the highest-burden neighbourhoods") == (
        "explicit_placement"
    )
    assert "optimize" in _tool_names(events)
    assert "place_infrastructure" in _tool_names(events)
    blob = _all_text(events)
    assert "<|tool_call>" not in blob


def test_feather_503_emits_terminal(demo_llm, monkeypatch):
    import app.config as config

    monkeypatch.setattr(config, "FEATHER_API_KEY", "test-key")
    monkeypatch.setattr(config, "FEATHER_BASE_URL", "https://example.test/v1")
    monkeypatch.setattr(config, "DEMO_LLM", False)

    class FakeClient:
        class chat:
            class completions:
                @staticmethod
                def create(**_kwargs):
                    raise RuntimeError("Error code: 503 - Service Unavailable")

    monkeypatch.setattr("openai.OpenAI", lambda **_kw: FakeClient())

    w = World()
    w.session_reset()
    chat = PlannerChat(w, 80_000_000)
    events = _collect(chat, "Add solar to the highest-burden neighbourhoods")
    assert any(e["type"] == "error" for e in events)
    assert any(e["type"] == "done" for e in events)
    assert len(w.engine.infra) == 0
