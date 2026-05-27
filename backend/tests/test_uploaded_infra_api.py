"""Phase 15 existing infrastructure API and planner context tests."""

from __future__ import annotations

import app.state as state
from app.cohort_context import build_planner_context
from app.existing_infra_context import (
    format_uploaded_existing_infra_for_prompt,
    summarize_uploaded_existing_infra,
)
from app.main import app
from fastapi.testclient import TestClient


def test_list_project_existing_infrastructure(monkeypatch):
    sample = [
        {
            "id": "a1",
            "project_id": "p1",
            "proposal_id": None,
            "dataset_id": "d1",
            "asset_kind": "ev_charger",
            "source_type": "upload",
            "name": "Station A",
            "latitude": 43.65,
            "longitude": -79.4,
            "status": "active",
            "power_kw": 75,
            "metadata": {},
        }
    ]
    monkeypatch.setattr(
        "app.routes.datasets.fetch_uploaded_infrastructure",
        lambda **kw: sample if kw.get("project_id") == "p1" else [],
    )
    state.reset_world()
    client = TestClient(app)
    r = client.get("/api/projects/p1/existing-infrastructure")
    assert r.status_code == 200
    body = r.json()
    assert len(body) == 1
    assert body[0]["assetKind"] == "ev_charger"
    assert body[0]["name"] == "Station A"


def test_delete_dataset_removes_uploaded_assets(monkeypatch):
    deleted: list[str] = []

    monkeypatch.setattr(
        "app.routes.datasets.uploaded_infra_repo.delete_by_dataset",
        lambda did: deleted.append(did) or 2,
    )
    monkeypatch.setattr(
        "app.routes.datasets.datasets_repo.delete_dataset",
        lambda did: did == "d1",
    )
    state.reset_world()
    client = TestClient(app)
    r = client.delete("/api/datasets/d1")
    assert r.status_code == 200
    assert deleted == ["d1"]


def test_planner_context_includes_uploaded_ev_summary(monkeypatch):
    assets = [
        {
            "asset_kind": "ev_charger",
            "status": "active",
            "power_kw": 50,
        },
        {
            "asset_kind": "ev_charger",
            "status": "unavailable",
            "power_kw": 100,
        },
    ]
    monkeypatch.setattr(
        "app.existing_infra_context.fetch_uploaded_infrastructure",
        lambda **kw: assets,
    )
    monkeypatch.setattr(
        "app.cohort_context.fetch_concern_summaries",
        lambda **kw: [],
    )
    monkeypatch.setattr(
        "app.cohort_context.fetch_proposal_infra_summary",
        lambda **kw: [],
    )
    monkeypatch.setattr(
        "app.dataset_context.fetch_dataset_summaries",
        lambda **kw: [],
    )
    ctx = build_planner_context(project_id="p1", proposal_id="prop1")
    assert ctx is not None
    assert "Uploaded existing EV chargers: 2 total" in ctx
    assert "1 active" in ctx
    assert "1 unavailable" in ctx
    assert "average power 75 kW" in ctx


def test_planner_context_includes_synthetic_reactions(monkeypatch):
    monkeypatch.setattr(
        "app.cohort_context.fetch_concern_summaries",
        lambda **kw: [],
    )
    monkeypatch.setattr(
        "app.cohort_context.fetch_proposal_infra_summary",
        lambda **kw: [],
    )
    monkeypatch.setattr(
        "app.dataset_context.fetch_dataset_summaries",
        lambda **kw: [],
    )
    monkeypatch.setattr(
        "app.existing_infra_context.fetch_uploaded_infrastructure",
        lambda **kw: [],
    )
    monkeypatch.setattr(
        "app.synthetic_resident_reactions.fetch_reaction_summaries",
        lambda **kw: [
            {
                "stance": "mixed",
                "summary": "Worried about peak load.",
                "suggestedChange": "Add storage before new EV load.",
            },
            {
                "stance": "support",
                "summary": "Likes transit-adjacent chargers.",
                "suggestedChange": "Expand off-street charger pilot.",
            },
        ],
    )
    ctx = build_planner_context(project_id="p1", proposal_id="prop1")
    assert ctx is not None
    assert "Synthetic resident reactions: 2 generated" in ctx
    assert "Add storage before new EV load" in ctx


def test_summarize_empty_returns_empty():
    assert summarize_uploaded_existing_infra([]) == ""
    assert format_uploaded_existing_infra_for_prompt(project_id="p1") == ""
