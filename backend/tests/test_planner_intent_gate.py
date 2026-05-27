"""Planner intent gate and tool permission guard (Phase 15)."""

from __future__ import annotations

import asyncio
import logging

import pytest

from app.planner import PlannerChat, PlannerTools
from app.planner_dispatch import BLOCKED_MUTATION_ANSWER, dispatch_planner_turn
from app.planner_intent import classify_planner_intent
from app.planner_simple_placement import parse_simple_explicit_placement
from app.state import World

log = logging.getLogger("wattif.planner")


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
    msg = "Add solar to the highest-burden neighbourhoods"
    assert classify_planner_intent(msg) == "explicit_placement"
    assert parse_simple_explicit_placement(msg) is not None
    events = _collect(chat, msg)
    assert "optimize" in _tool_names(events)
    assert "place_infrastructure" in _tool_names(events)
    blob = _all_text(events)
    assert "<|tool_call>" not in blob
    assert any(e["type"] == "answer" for e in events)
    assert any(e["type"] == "done" for e in events)
    assert len(w.engine.infra) > 0


def test_simple_placement_top_three_burdened_zones(demo_llm):
    w = World()
    w.session_reset()
    chat = PlannerChat(w, 80_000_000)
    msg = "Place solar in the top 3 burdened zones"
    spec = parse_simple_explicit_placement(msg)
    assert spec is not None
    assert spec["n"] == 3
    assert spec["kind"] == "solar"
    events = _collect(chat, msg)
    placements = [e for e in events if e.get("type") == "placement"]
    assert len(placements) == 3
    assert "optimize" in _tool_names(events)


def test_simple_ev_charger_low_coverage_deterministic(demo_llm):
    w = World()
    w.session_reset()
    chat = PlannerChat(w, 80_000_000)
    msg = "Add EV chargers where coverage is missing"
    assert parse_simple_explicit_placement(msg) is not None
    events = _collect(chat, msg)
    assert "optimize" in _tool_names(events)
    assert "place_infrastructure" in _tool_names(events)
    assert any(e["type"] == "answer" for e in events)


def test_simple_placement_skips_featherless(demo_llm, monkeypatch, caplog):
    import app.config as config

    monkeypatch.setattr(config, "FEATHER_API_KEY", "test-key")
    monkeypatch.setattr(config, "FEATHER_BASE_URL", "https://example.test/v1")
    monkeypatch.setattr(config, "DEMO_LLM", False)

    called = {"n": 0}

    class FakeClient:
        class chat:
            class completions:
                @staticmethod
                def create(**_kwargs):
                    called["n"] += 1
                    raise RuntimeError("should not call feather for simple placement")

    monkeypatch.setattr("openai.OpenAI", lambda **_kw: FakeClient())

    w = World()
    w.session_reset()
    chat = PlannerChat(w, 80_000_000)
    msg = "Add solar to the highest-burden neighbourhoods"
    with caplog.at_level(logging.INFO, logger="wattif.planner"):
        events = _collect(chat, msg)
    assert called["n"] == 0
    assert any(
        "deterministic=True provider=backend" in r.message for r in caplog.records
    )
    assert len(w.engine.infra) > 0
    assert any(e["type"] == "answer" for e in events)


def test_ambiguous_explicit_placement_feather_503(demo_llm, monkeypatch):
    import app.config as config

    monkeypatch.setattr(config, "FEATHER_API_KEY", "test-key")
    monkeypatch.setattr(config, "FEATHER_BASE_URL", "https://example.test/v1")
    monkeypatch.setattr(config, "DEMO_LLM", False)

    ambiguous = (
        "Place renewable infrastructure optimally across the city "
        "considering budget and equity tradeoffs"
    )
    assert parse_simple_explicit_placement(ambiguous) is None

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
    events = _collect(chat, ambiguous)
    answers = [e for e in events if e["type"] == "answer"]
    assert len(answers) == 1
    assert "LLM provider is temporarily unavailable" in answers[0]["text"]
    assert any(e["type"] == "done" for e in events)
    assert len(w.engine.infra) == 0


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
    # Simple commands bypass Featherless; use ambiguous prompt for 503 path.
    ambiguous = (
        "Place renewable infrastructure optimally across the city "
        "considering budget and equity tradeoffs"
    )
    events = _collect(chat, ambiguous)
    answers = [e for e in events if e["type"] == "answer"]
    assert len(answers) == 1
    assert "LLM provider is temporarily unavailable" in answers[0]["text"]
    assert any(e["type"] == "done" for e in events)
    assert len(w.engine.infra) == 0
