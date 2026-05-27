"""Planner turn event lifecycle — one final answer per turn (Phase 15)."""

from __future__ import annotations

import asyncio

import pytest

from app.planner import PlannerChat
from app.planner_events import terminal_done
from app.state import World


@pytest.fixture
def demo_llm(monkeypatch):
    import app.config as config

    monkeypatch.setattr(config, "ANTHROPIC_API_KEY", None)
    monkeypatch.setattr(config, "FEATHER_API_KEY", None)
    monkeypatch.setattr(config, "FEATHER_BASE_URL", None)
    monkeypatch.setattr(config, "DEMO_LLM", True)


def _collect(chat: PlannerChat, message: str) -> list[dict]:
    async def run():
        out = []
        async for ev in chat.turn(message):
            out.append(ev)
        return out

    return asyncio.run(run())


def _final_answer_events(events: list[dict]) -> list[dict]:
    out = []
    for e in events:
        if e.get("type") == "answer":
            out.append(e)
        elif e.get("type") == "recommendation":
            out.append(e)
        elif e.get("type") == "done" and e.get("summary"):
            out.append(e)
    return out


@pytest.fixture
def mock_context(monkeypatch):
    monkeypatch.setattr(
        "app.existing_infra_context.fetch_uploaded_infrastructure",
        lambda **_: [
            {
                "id": "a1",
                "asset_kind": "ev_charger",
                "name": "Islington Charger A",
                "address": "100 City Centre Dr",
                "latitude": 43.6452,
                "longitude": -79.5281,
                "status": "active",
            }
        ],
    )
    monkeypatch.setattr(
        "app.dataset_context.fetch_dataset_summaries",
        lambda **_: [{"name": "ev.csv", "datasetType": "ev_chargers", "rowCount": 1}],
    )
    monkeypatch.setattr("app.cohort_context.fetch_concern_summaries", lambda **_: [])
    monkeypatch.setattr("app.cohort_context.fetch_proposal_infra_summary", lambda **_: [])


def test_read_uploaded_infra_one_final_answer_and_done(demo_llm, mock_context):
    w = World()
    w.session_reset()
    chat = PlannerChat(w, 80_000_000, project_id="p1", proposal_id="prop1")
    events = _collect(chat, "where are the infra points in the uploaded dataset")
    answers = [e for e in events if e["type"] == "answer"]
    dones = [e for e in events if e["type"] == "done"]
    assert len(answers) == 1
    assert len(dones) == 1
    assert "summary" not in dones[0]
    assert len(_final_answer_events(events)) == 1
    assert "Islington Charger A" in answers[0]["text"]


def test_heatwave_one_final_answer_and_done(demo_llm, mock_context):
    w = World()
    w.session_reset()
    chat = PlannerChat(w, 80_000_000, project_id="p1", proposal_id="prop1")
    events = _collect(chat, "Prepare the grid for a heatwave")
    answers = [e for e in events if e["type"] == "answer"]
    dones = [e for e in events if e["type"] == "done"]
    assert len(answers) == 1
    assert len(dones) == 1
    assert "summary" not in dones[0]
    assert len(_final_answer_events(events)) == 1
    assert "heatwave" in answers[0]["text"].lower() or "resilience" in answers[0]["text"].lower()


def test_terminal_done_omits_summary_when_final_sent():
    w = World()
    w.session_reset()
    chat = PlannerChat(w, 80_000_000)
    done = terminal_done(chat, summary="should not appear", final_message_sent=True)
    assert done["type"] == "done"
    assert "summary" not in done


def test_exception_path_error_and_terminal_done(demo_llm, monkeypatch):
    w = World()
    w.session_reset()
    chat = PlannerChat(w, 80_000_000)

    async def boom(*_a, **_k):
        raise RuntimeError("simulated failure")
        yield  # pragma: no cover

    monkeypatch.setattr(
        "app.planner_copilot.run_copilot_turn",
        boom,
    )

    events = _collect(chat, "summarize my datasets")
    assert any(e["type"] == "error" for e in events)
    assert any(e["type"] == "done" for e in events)
    done = next(e for e in events if e["type"] == "done")
    assert "summary" not in done
