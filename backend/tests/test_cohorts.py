"""Phase 8 cohort/concern generator and API tests."""

from __future__ import annotations

import app.config as config
import app.db.supabase_client as sc
import app.state as state
from app.data.concern_generator import generate_cohorts_and_concerns
from app.main import app
from fastapi.testclient import TestClient


def _disable_supabase(monkeypatch):
    monkeypatch.setattr(config, "SUPABASE_URL", None)
    monkeypatch.setattr(config, "SUPABASE_SERVICE_ROLE_KEY", None)
    sc._client = None
    sc._init_attempted = False


def test_generate_ev_charger_concerns():
    datasets = [
        {
            "id": "ds-1",
            "name": "chargers.csv",
            "dataset_type": "ev_chargers",
            "columns": ["latitude", "longitude", "station_id"],
            "preview": [{"station_id": "A1", "plug": "DCFC"}],
            "row_count": 3,
        }
    ]
    cohorts, concerns = generate_cohorts_and_concerns(
        project_id="proj-1",
        proposal_id=None,
        datasets=datasets,
        proposal_infrastructure=[],
    )
    types = {c["cohort_type"] for c in cohorts}
    assert "ev_owners" in types
    assert any(c["topic"] == "ev_charger_access" for c in concerns)
    assert concerns[0]["related_dataset_ids"] == ["ds-1"]


def test_generate_feedback_parking_concern():
    datasets = [
        {
            "id": "ds-2",
            "name": "ev_feedback.csv",
            "dataset_type": "public_feedback",
            "columns": ["comment", "rating", "parking"],
            "preview": [{"comment": "Too much curb parking congestion", "rating": 2}],
            "row_count": 10,
        }
    ]
    _, concerns = generate_cohorts_and_concerns(
        project_id="proj-1",
        proposal_id="prop-1",
        datasets=datasets,
    )
    assert any(c["stance"] == "oppose" and "parking" in c["topic"] for c in concerns)


def test_generate_demand_peak_concern():
    datasets = [
        {
            "id": "ds-3",
            "name": "demand_july.csv",
            "dataset_type": "energy_demand",
            "columns": ["zone", "peak_kwh", "july_load"],
            "preview": [{"zone": "z1", "peak_kwh": 9000}],
            "row_count": 20,
        }
    ]
    _, concerns = generate_cohorts_and_concerns(
        project_id="proj-1",
        proposal_id=None,
        datasets=datasets,
        proposal_infrastructure=[{"id": "i1", "kind": "ev_charger"}],
    )
    assert any("peak" in c["topic"] for c in concerns)


def test_cohort_endpoints_503_when_unconfigured(monkeypatch):
    _disable_supabase(monkeypatch)
    state.reset_world()
    client = TestClient(app)
    pid = "00000000-0000-0000-0000-000000000001"
    for method, path in (
        ("post", f"/api/projects/{pid}/cohorts/generate"),
        ("get", f"/api/projects/{pid}/cohorts"),
        ("get", f"/api/projects/{pid}/concerns"),
        ("delete", "/api/concerns/00000000-0000-0000-0000-000000000002"),
    ):
        if method == "post":
            r = client.post(path)
        elif method == "get":
            r = client.get(path)
        else:
            r = client.delete(path)
        assert r.status_code == 503
        assert r.json()["detail"]["available"] is False

    ctx = client.get(f"/api/projects/{pid}/concerns/context")
    assert ctx.status_code == 200
    assert ctx.json() == []
