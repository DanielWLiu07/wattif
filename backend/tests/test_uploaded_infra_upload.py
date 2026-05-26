"""Phase 15 dataset upload -> uploaded infrastructure asset persistence."""

from __future__ import annotations

import app.config as config
import app.db.supabase_client as sc
import app.state as state
from app.main import app
from fastapi.testclient import TestClient


def test_upload_extracts_and_persists_assets(monkeypatch):
    stored_assets: list[dict] = []

    def fake_create_dataset(**kwargs):
        return {
            "id": "ds-uuid-1",
            "name": kwargs["name"],
            "dataset_type": kwargs["dataset_type"],
            "project_id": kwargs.get("project_id"),
            "proposal_id": kwargs.get("proposal_id"),
            "file_type": kwargs.get("file_type"),
            "row_count": kwargs.get("row_count"),
            "feature_count": kwargs.get("feature_count"),
            "columns": kwargs.get("columns") or [],
            "preview": kwargs.get("preview") or [],
            "metadata": kwargs.get("metadata") or {},
            "created_at": "2026-05-29T00:00:00Z",
            "uploaded_at": "2026-05-29T00:00:00Z",
        }

    def fake_create_assets_batch(assets, *, project_id, proposal_id, dataset_id):
        stored_assets.extend(assets)
        return [{**a, "id": f"a{i}", "dataset_id": dataset_id} for i, a in enumerate(assets)]

    monkeypatch.setattr(
        "app.routes.datasets.datasets_repo.create_dataset",
        fake_create_dataset,
    )
    monkeypatch.setattr(
        "app.routes.datasets.uploaded_infra_repo.create_assets_batch",
        fake_create_assets_batch,
    )

    state.reset_world()
    client = TestClient(app)
    csv = (
        b"latitude,longitude,name,status,power_kw\n"
        b"43.65,-79.40,Station A,active,75\n"
        b"43.66,-79.41,Station B,active,50\n"
    )
    pid = "00000000-0000-0000-0000-000000000001"
    r = client.post(
        "/api/datasets/upload",
        data={"projectId": pid},
        files={"file": ("chargers.csv", csv, "text/csv")},
    )
    assert r.status_code == 201, r.text
    body = r.json()
    assert body["extractedExistingInfrastructureCount"] == 2
    assert body["detectedExistingInfrastructureKind"] == "ev_charger"
    assert len(stored_assets) == 2
    assert stored_assets[0]["asset_kind"] == "ev_charger"


def test_upload_feedback_does_not_create_assets(monkeypatch):
    stored_assets: list[dict] = []

    monkeypatch.setattr(
        "app.routes.datasets.datasets_repo.create_dataset",
        lambda **kwargs: {
            "id": "ds-uuid-2",
            "name": kwargs["name"],
            "dataset_type": kwargs["dataset_type"],
            "project_id": kwargs.get("project_id"),
            "metadata": kwargs.get("metadata") or {},
            "columns": kwargs.get("columns") or [],
            "preview": kwargs.get("preview") or [],
            "created_at": "2026-05-29T00:00:00Z",
        },
    )
    monkeypatch.setattr(
        "app.routes.datasets.uploaded_infra_repo.create_assets_batch",
        lambda assets, **kw: stored_assets.extend(assets) or [],
    )

    state.reset_world()
    client = TestClient(app)
    csv = b"comment,rating\nNice,5\n"
    r = client.post(
        "/api/datasets/upload",
        data={"projectId": "00000000-0000-0000-0000-000000000001"},
        files={"file": ("feedback.csv", csv, "text/csv")},
    )
    assert r.status_code == 201
    assert r.json()["extractedExistingInfrastructureCount"] == 0
    assert stored_assets == []
