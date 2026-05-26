"""Phase 10 proposal impact report / decision memo tests."""

from __future__ import annotations

import app.config as config
import app.db.supabase_client as sc
import app.state as state
from app.db.repositories.base import PersistenceDisabledError
from app.main import app
from app.report_generator import (
    build_report_sections,
    collect_report_data,
    generate_proposal_report,
    markdown_to_html,
    sections_to_markdown,
)
from fastapi.testclient import TestClient
import pytest


def _disable_supabase(monkeypatch):
    monkeypatch.setattr(config, "SUPABASE_URL", None)
    monkeypatch.setattr(config, "SUPABASE_SERVICE_ROLE_KEY", None)
    sc._client = None
    sc._init_attempted = False


def _sample_data(*, with_recommendation: bool = True) -> dict:
    recommendation = {
        "summary": "Add EV chargers in parking lots to address parking concerns.",
        "key_concerns_considered": [
            {
                "topic": "parking_and_congestion",
                "cohortName": "EV owners",
                "severity": "high",
                "summary": "Curb parking competition.",
            }
        ],
        "recommended_actions": [
            {
                "action": "Place EV chargers in off-street lots.",
                "kinds": ["ev_charger"],
                "priority": "high",
            }
        ],
        "tradeoffs": ["Lot-based chargers may see lower walk-up use."],
        "suggested_next_step": "Run heatwave scenario and save a snapshot.",
    }
    return {
        "project": {"id": "proj-1", "name": "Islington Pilot", "city": "Toronto"},
        "proposal": {
            "id": "prop-1",
            "project_id": "proj-1",
            "name": "EV Access Expansion",
            "status": "draft",
        },
        "infrastructure": [
            {
                "kind": "ev_charger",
                "capacity_kw": 50,
                "zone_id": "zone-a",
            },
            {
                "kind": "battery",
                "capacity_kw": 500,
                "zone_id": "zone-b",
            },
        ],
        "snapshot": {
            "tick": 12,
            "created_at": "2026-05-26T12:00:00Z",
            "metrics": {
                "coverage": 68.5,
                "approval": 0.72,
                "equity": 0.61,
                "costCad": 1_250_000,
            },
            "scenarios": [
                {"type": "heatwave", "label": "Heatwave", "active": True, "startedTick": 8}
            ],
        },
        "datasets": [
            {
                "id": "ds-1",
                "name": "ev_chargers_islington.csv",
                "datasetType": "ev_chargers",
                "rowCount": 42,
                "columns": ["id", "lat", "lng"],
            },
            {
                "id": "ds-2",
                "name": "ev_owner_feedback.csv",
                "datasetType": "public_feedback",
                "rowCount": 18,
                "columns": ["comment", "sentiment"],
            },
        ],
        "cohorts": [
            {
                "name": "EV owners",
                "cohort_type": "ev_owners",
                "description": "Drivers seeking charger access.",
            }
        ],
        "concerns": [
            {
                "cohortName": "EV owners",
                "topic": "parking_and_congestion",
                "stance": "oppose",
                "severity": "high",
                "summary": "Curb chargers compete with parking.",
            }
        ],
        "recommendation": recommendation if with_recommendation else None,
    }


def test_build_report_includes_infrastructure():
    sections = build_report_sections(_sample_data())
    infra = "\n".join(sections["proposal_infrastructure"])
    assert "ev_charger" in infra
    assert "battery" in infra


def test_build_report_includes_datasets():
    sections = build_report_sections(_sample_data())
    body = "\n".join(sections["uploaded_data_sources"])
    assert "ev_chargers_islington.csv" in body
    assert "ev_owner_feedback.csv" in body


def test_build_report_includes_concerns():
    sections = build_report_sections(_sample_data())
    body = "\n".join(sections["synthetic_concerns"])
    assert "parking_and_congestion" in body
    assert "EV owners" in body


def test_build_report_missing_recommendation():
    sections = build_report_sections(_sample_data(with_recommendation=False))
    body = "\n".join(sections["operator_recommendations"])
    assert "No operator recommendation has been generated yet" in body
    assert "planning operator" in body.lower()


def test_build_report_includes_operator_recommendation():
    sections = build_report_sections(_sample_data(with_recommendation=True))
    body = "\n".join(sections["operator_recommendations"])
    assert "EV chargers in parking lots" in body
    assert "Place EV chargers" in body


def test_caveats_section_required_disclaimers():
    sections = build_report_sections(_sample_data())
    body = "\n".join(sections["caveats"]).lower()
    assert "simplified simulation" in body
    assert "metadata" in body or "context only" in body
    assert "synthetic" in body
    assert "not engineering" in body or "engineering-grade" in body
    assert "municipal approval" in body or "public consultation" in body


def test_full_markdown_document():
    data = _sample_data()
    sections = build_report_sections(data)
    md = sections_to_markdown(
        sections,
        project_name=data["project"]["name"],
        proposal_name=data["proposal"]["name"],
        generated_at="2026-05-26T12:00:00Z",
    )
    assert "Executive Summary" in md
    assert "Caveats" in md
    assert "Islington Pilot" in md
    assert "draft decision-support" in md.lower()


def test_markdown_to_html_wraps_sections():
    md = "## Test\n\n- item one\n"
    html = markdown_to_html(md)
    assert "<h2>Test</h2>" in html
    assert "<li>item one</li>" in html


def test_report_endpoint_503_when_unconfigured(monkeypatch):
    _disable_supabase(monkeypatch)
    state.reset_world()
    client = TestClient(app)
    r = client.get("/api/proposals/00000000-0000-0000-0000-000000000002/report")
    assert r.status_code == 503
    assert r.json()["detail"]["available"] is False


def test_generate_proposal_report_raises_when_disabled(monkeypatch):
    _disable_supabase(monkeypatch)
    with pytest.raises(PersistenceDisabledError):
        generate_proposal_report("00000000-0000-0000-0000-000000000002")


def test_collect_report_data_monkeypatched(monkeypatch):
    sample = _sample_data()

    monkeypatch.setattr(
        "app.report_generator.proposals.get_proposal",
        lambda pid: sample["proposal"] if pid == "prop-1" else None,
    )
    monkeypatch.setattr(
        "app.report_generator.projects.get_project",
        lambda pid: sample["project"],
    )
    monkeypatch.setattr(
        "app.report_generator.proposal_infrastructure.list_by_proposal",
        lambda pid: sample["infrastructure"],
    )
    monkeypatch.setattr(
        "app.report_generator.simulation_snapshots.get_latest",
        lambda pid: sample["snapshot"],
    )
    monkeypatch.setattr(
        "app.report_generator.fetch_dataset_summaries",
        lambda **kw: sample["datasets"],
    )
    monkeypatch.setattr(
        "app.report_generator.fetch_concern_summaries",
        lambda **kw: sample["concerns"],
    )
    monkeypatch.setattr(
        "app.report_generator.agents_repo.list_profiles",
        lambda **kw: sample["cohorts"],
    )
    monkeypatch.setattr(
        "app.report_generator.planner_runs.list_runs",
        lambda **kw: [
            {
                "mode": "concern_recommendation",
                "output": {"recommendation": sample["recommendation"]},
            }
        ],
    )

    data = collect_report_data("prop-1")
    assert data["recommendation"] is not None
    report = generate_proposal_report("prop-1")
    assert report["hasOperatorRecommendation"] is True
    assert "ev_charger" in report["markdown"]
    assert len(report["sections"]) == 10
