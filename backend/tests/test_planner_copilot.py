"""Planner copilot intent routing and read-only operator behavior (Phase 15)."""

from __future__ import annotations

import asyncio

import pytest

from app.planner import PlannerChat
from app.planner_intent import classify_planner_intent, normalize_planner_input
from app.planner_tool_parse import parse_raw_tool_calls, strip_raw_tool_calls
from app.state import World


@pytest.fixture
def demo_llm(monkeypatch):
    import app.config as config

    monkeypatch.setattr(config, "ANTHROPIC_API_KEY", None)
    monkeypatch.setattr(config, "FEATHER_API_KEY", None)
    monkeypatch.setattr(config, "FEATHER_BASE_URL", None)
    monkeypatch.setattr(config, "DEMO_LLM", True)


def _collect_turn(chat: PlannerChat, message: str, intent: str | None = None) -> list[dict]:
    async def run():
        out = []
        async for ev in chat.turn(message, intent=intent):
            out.append(ev)
        return out

    return asyncio.run(run())


def _tool_names(events: list[dict]) -> list[str]:
    return [e["name"] for e in events if e.get("type") == "tool_call"]


def _all_text(events: list[dict]) -> str:
    parts: list[str] = []
    for e in events:
        if e.get("type") == "thought":
            parts.append(e.get("text", ""))
        elif e.get("type") == "answer":
            parts.append(e.get("text", ""))
        elif e.get("type") == "done":
            parts.append(e.get("summary", ""))
        elif e.get("type") == "error":
            parts.append(e.get("message", ""))
    return "\n".join(parts)


def _assert_no_raw_tool_leak(events: list[dict]) -> None:
    blob = _all_text(events)
    assert "<|tool_call>" not in blob
    assert "<tool_call|>" not in blob


def _assert_terminal(events: list[dict]) -> None:
    assert any(e["type"] == "done" for e in events)


@pytest.fixture
def uploaded_assets():
    return [
        {
            "id": "a1",
            "asset_kind": "ev_charger",
            "name": "Islington Charger A",
            "address": "100 City Centre Dr",
            "latitude": 43.6452,
            "longitude": -79.5281,
            "charger_type": "Level 3",
            "power_kw": 150,
            "status": "active",
            "operator": "City",
        },
        {
            "id": "a2",
            "asset_kind": "ev_charger",
            "name": "Bloor Hub",
            "address": "200 Bloor St",
            "latitude": 43.6615,
            "longitude": -79.3870,
            "power_kw": 75,
            "status": "unavailable",
        },
    ]


@pytest.fixture
def mock_context(monkeypatch, uploaded_assets):
    monkeypatch.setattr(
        "app.existing_infra_context.fetch_uploaded_infrastructure",
        lambda **_: uploaded_assets,
    )
    monkeypatch.setattr(
        "app.dataset_context.fetch_dataset_summaries",
        lambda **_: [
            {
                "name": "ev_chargers.csv",
                "datasetType": "ev_chargers",
                "rowCount": 5,
                "columns": ["name", "latitude", "longitude", "power_kw"],
            }
        ],
    )
    monkeypatch.setattr(
        "app.cohort_context.fetch_concern_summaries",
        lambda **_: [
            {
                "id": "c1",
                "cohortName": "EV owners",
                "topic": "parking_and_congestion",
                "severity": "high",
                "summary": "Curbside chargers block parking.",
                "evidence": ["row 3"],
            }
        ],
    )
    monkeypatch.setattr(
        "app.cohort_context.fetch_proposal_infra_summary",
        lambda **_: [{"kind": "solar", "zoneId": "z1"}],
    )


def test_normalize_quoted_and_typo():
    assert normalize_planner_input('"where are the infra points"') == (
        "where are the infra points"
    )
    assert normalize_planner_input("Where are the infra points in the uploaded datase?") == (
        "where are the infra points in the uploaded dataset"
    )


def test_classify_read_uploaded_infrastructure():
    assert (
        classify_planner_intent("where are the infra points in the uploaded dataset")
        == "read_uploaded_infrastructure"
    )
    assert (
        classify_planner_intent('"where are the infra points in the uploaded dataset"')
        == "read_uploaded_infrastructure"
    )
    assert (
        classify_planner_intent("Where are the infra points in the uploaded datase?")
        == "read_uploaded_infrastructure"
    )
    assert classify_planner_intent("what chargers did I upload?") == "read_uploaded_infrastructure"


def test_classify_resilience_heatwave():
    assert classify_planner_intent("Prepare the grid for a heatwave") == "resilience_scenario"


def test_classify_explicit_placement_solar():
    assert (
        classify_planner_intent("Add solar to the highest-burden neighbourhoods")
        == "explicit_placement"
    )


def test_read_uploaded_infra_no_mutation(demo_llm, mock_context):
    w = World()
    w.session_reset()
    chat = PlannerChat(w, 80_000_000, project_id="p1", proposal_id="prop1")
    events = _collect_turn(chat, "where are the infra points in the uploaded dataset")
    tools = _tool_names(events)
    assert "optimize" not in tools
    assert "place_infrastructure" not in tools
    done = next(e for e in events if e["type"] == "done")
    assert "Islington Charger A" in done["summary"]
    assert "43.6452" in done["summary"]
    assert len(w.engine.infra) == 0
    _assert_terminal(events)
    _assert_no_raw_tool_leak(events)


def test_read_uploaded_infra_quoted(demo_llm, mock_context):
    w = World()
    w.session_reset()
    chat = PlannerChat(w, 80_000_000, project_id="p1", proposal_id="prop1")
    events = _collect_turn(
        chat, '"where are the infra points in the uploaded dataset"'
    )
    assert classify_planner_intent('"where are the infra points in the uploaded dataset"') == (
        "read_uploaded_infrastructure"
    )
    assert "place_infrastructure" not in _tool_names(events)
    done = next(e for e in events if e["type"] == "done")
    assert "Islington Charger A" in done["summary"]
    _assert_terminal(events)


def test_read_uploaded_infra_typo(demo_llm, mock_context):
    w = World()
    w.session_reset()
    chat = PlannerChat(w, 80_000_000, project_id="p1", proposal_id="prop1")
    events = _collect_turn(chat, "Where are the infra points in the uploaded datase?")
    done = next(e for e in events if e["type"] == "done")
    assert "Islington Charger A" in done["summary"]
    _assert_terminal(events)


def test_uploaded_chargers_question(demo_llm, mock_context):
    w = World()
    w.session_reset()
    chat = PlannerChat(w, 80_000_000, project_id="p1", proposal_id="prop1")
    events = _collect_turn(chat, "what chargers did I upload?")
    assert "place_infrastructure" not in _tool_names(events)
    done = next(e for e in events if e["type"] == "done")
    assert "Bloor Hub" in done["summary"]


def test_summarize_datasets_no_mutation(demo_llm, mock_context):
    w = World()
    w.session_reset()
    chat = PlannerChat(w, 80_000_000, project_id="p1", proposal_id="prop1")
    events = _collect_turn(chat, "summarize my datasets")
    tools = _tool_names(events)
    assert "optimize" not in tools
    assert "place_infrastructure" not in tools
    done = next(e for e in events if e["type"] == "done")
    assert "ev_chargers.csv" in done["summary"]
    _assert_terminal(events)


def test_explain_concerns_no_mutation(demo_llm, mock_context):
    w = World()
    w.session_reset()
    chat = PlannerChat(w, 80_000_000, project_id="p1", proposal_id="prop1")
    events = _collect_turn(chat, "why are agents concerned?")
    tools = _tool_names(events)
    assert "optimize" not in tools
    assert "place_infrastructure" not in tools
    done = next(e for e in events if e["type"] == "done")
    assert "synthetic" in done["summary"].lower()
    assert "parking" in done["summary"].lower()
    _assert_terminal(events)


def test_critique_design_no_mutation(demo_llm, mock_context):
    w = World()
    w.session_reset()
    n_before = 0
    chat = PlannerChat(w, 80_000_000, project_id="p1", proposal_id="prop1")
    events = _collect_turn(chat, "what is wrong with my design?")
    assert "place_infrastructure" not in _tool_names(events)
    assert "optimize" not in _tool_names(events)
    done = next(e for e in events if e["type"] == "done")
    assert "critique" in done["summary"].lower() or "Proposal critique" in done["summary"]
    assert len(w.engine.infra) == n_before
    _assert_terminal(events)


def test_heatwave_resilience_no_concern_block(demo_llm, monkeypatch):
    monkeypatch.setattr(
        "app.cohort_context.fetch_concern_summaries",
        lambda **_: [],
    )
    w = World()
    w.session_reset()
    chat = PlannerChat(w, 80_000_000, project_id="p1", proposal_id="prop1")
    events = _collect_turn(chat, "Prepare the grid for a heatwave")
    assert classify_planner_intent("Prepare the grid for a heatwave") == "resilience_scenario"
    assert "place_infrastructure" not in _tool_names(events)
    done = next(e for e in events if e["type"] == "done")
    assert "heatwave" in done["summary"].lower() or "resilience" in done["summary"].lower()
    assert "generate concerns" not in done["summary"].lower()
    assert "not concern-grounded" in done["summary"].lower()
    _assert_terminal(events)


def test_recommendation_ev_capacity_no_auto_place(demo_llm, mock_context, monkeypatch):
    monkeypatch.setattr(
        "app.concern_recommendations.build_concern_recommendations",
        lambda **kw: {
            "summary": "Gap near uploaded chargers.",
            "key_concerns_considered": [],
            "optional_tool_actions": [
                {
                    "name": "place_infrastructure",
                    "args": {"kind": "ev_charger", "zoneId": "z-test"},
                    "rationale": "Would place here",
                }
            ],
        },
    )
    w = World()
    w.session_reset()
    chat = PlannerChat(w, 80_000_000, project_id="p1", proposal_id="prop1")
    events = _collect_turn(
        chat,
        "where should we add more EV charging capacity based on uploaded chargers?",
    )
    assert "place_infrastructure" not in _tool_names(events)
    assert len(w.engine.infra) == 0
    _assert_terminal(events)


def test_explicit_placement_allows_tools(demo_llm):
    w = World()
    w.session_reset()
    chat = PlannerChat(w, 80_000_000)
    events = _collect_turn(chat, "Add solar to the highest-burden neighbourhoods")
    assert classify_planner_intent("Add solar to the highest-burden neighbourhoods") == (
        "explicit_placement"
    )
    tools = _tool_names(events)
    assert "optimize" in tools
    assert "place_infrastructure" in tools
    assert any(e["type"] == "placement" for e in events)
    _assert_no_raw_tool_leak(events)
    _assert_terminal(events)


def test_malformed_raw_tool_call_suppressed():
    raw = "<|tool_call>call:optimize{kind:solar,n:5}<tool_call|>"
    assert strip_raw_tool_calls(raw) == ""
    calls = parse_raw_tool_calls(raw)
    assert calls[0]["name"] == "optimize"
    assert "<|tool_call>" not in strip_raw_tool_calls(raw)


def test_duplicate_raw_tool_call_deduped():
    raw = (
        "<|tool_call>call:optimize{kind:solar,n:5}<tool_call|>"
        "<|tool_call>call:optimize{kind:solar,n:5}<tool_call|>"
    )
    assert len(parse_raw_tool_calls(raw)) == 1


def test_feather_raw_tool_call_executes_without_leak(demo_llm, monkeypatch):
    """Simulate Feather returning raw tool syntax; parser executes optimize without leaking."""
    import app.config as config

    monkeypatch.setattr(config, "FEATHER_API_KEY", "test-key")
    monkeypatch.setattr(config, "FEATHER_BASE_URL", "https://example.test/v1")
    monkeypatch.setattr(config, "DEMO_LLM", False)

    class FakeFn:
        def __init__(self, name, arguments):
            self.name = name
            self.arguments = arguments

    class FakeMessage:
        def __init__(self, content, tool_calls=None):
            self.content = content
            self.tool_calls = tool_calls

        def model_dump(self):
            return {
                "role": "assistant",
                "content": self.content,
                "tool_calls": self.tool_calls,
            }

    class FakeChoice:
        def __init__(self, message):
            self.message = message

    class FakeResponse:
        def __init__(self, message):
            self.choices = [FakeChoice(message)]

    class FakeCompletions:
        def __init__(self, responses):
            self._responses = list(responses)
            self._idx = 0

        def create(self, **_kwargs):
            if self._idx >= len(self._responses):
                return FakeResponse(FakeMessage("Placed solar in high-burden zones.", []))
            msg = self._responses[self._idx]
            self._idx += 1
            return FakeResponse(msg)

    class FakeChat:
        def __init__(self, responses):
            self.completions = FakeCompletions(responses)

    class FakeClient:
        def __init__(self, responses):
            self.chat = FakeChat(responses)

    raw = "<|tool_call>call:optimize{kind:solar,n:5}<tool_call|>"
    responses = [
        FakeMessage(raw, []),
        FakeMessage("Done placing solar.", []),
    ]

    monkeypatch.setattr(
        "openai.OpenAI",
        lambda **_kw: FakeClient(responses),
    )

    w = World()
    w.session_reset()
    chat = PlannerChat(w, 80_000_000)
    events = _collect_turn(chat, "Add solar to the highest-burden neighbourhoods")
    _assert_no_raw_tool_leak(events)
    assert any(e.get("type") == "tool_call" and e.get("name") == "optimize" for e in events)
    _assert_terminal(events)


def test_mutation_guard_blocks_place_on_read_intent(demo_llm):
    w = World()
    w.session_reset()
    tools = PlannerChat(w, 80_000_000).tools
    tools.guard_intent = "read_uploaded_infrastructure"
    res = tools.execute("place_infrastructure", {"kind": "solar", "zoneId": w.zones[0].id})
    assert res.get("blocked") is True
