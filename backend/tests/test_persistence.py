"""Persistence API tests — must not break demo when Supabase is unset."""

from __future__ import annotations

import app.config as config
import app.db.supabase_client as sc
import app.state as state
from app.db.repositories import proposal_infrastructure
from app.db.repositories.base import PersistenceDisabledError
from app.main import app
from fastapi.testclient import TestClient
import pytest


def _disable_supabase(monkeypatch):
    monkeypatch.setattr(config, "SUPABASE_URL", None)
    monkeypatch.setattr(config, "SUPABASE_SERVICE_ROLE_KEY", None)
    sc._client = None
    sc._init_attempted = False


def test_health_reports_memory_persistence_by_default(monkeypatch):
    _disable_supabase(monkeypatch)
    state.reset_world()
    client = TestClient(app)
    h = client.get("/api/health").json()
    assert h["persistenceProvider"] == "memory"
    assert h["supabaseConfigured"] is False


def test_persistence_endpoints_503_when_unconfigured(monkeypatch):
    _disable_supabase(monkeypatch)
    state.reset_world()
    client = TestClient(app)

    for method, path, body in (
        ("get", "/api/projects", None),
        ("post", "/api/projects", {"name": "Test"}),
        ("get", "/api/proposals", None),
        ("post", "/api/proposals", {"projectId": "00000000-0000-0000-0000-000000000001", "name": "P"}),
        ("get", "/api/assets/definitions", None),
        ("post", "/api/assets/definitions", {"name": "A", "kind": "solar"}),
    ):
        if method == "get":
            r = client.get(path)
        else:
            r = client.post(path, json=body)
        assert r.status_code == 503, f"{method} {path} -> {r.status_code}"
        assert r.json()["detail"]["available"] is False


def test_proposal_infrastructure_repository_disabled(monkeypatch):
    _disable_supabase(monkeypatch)

    with pytest.raises(PersistenceDisabledError):
        proposal_infrastructure.list_by_proposal(
            "00000000-0000-0000-0000-000000000002"
        )

    with pytest.raises(PersistenceDisabledError):
        proposal_infrastructure.create(
            proposal_id="00000000-0000-0000-0000-000000000002",
            kind="solar",
            position=[-79.38, 43.65],
            capacity_kw=250,
        )

    with pytest.raises(PersistenceDisabledError):
        proposal_infrastructure.delete("00000000-0000-0000-0000-000000000003")


def test_health_reports_supabase_when_env_set(monkeypatch):
    monkeypatch.setattr(config, "SUPABASE_URL", "https://example.supabase.co")
    monkeypatch.setattr(config, "SUPABASE_SERVICE_ROLE_KEY", "test-key")
    sc._client = None
    sc._init_attempted = False
    state.reset_world()
    client = TestClient(app)
    h = client.get("/api/health").json()
    assert h["persistenceProvider"] == "supabase"
    assert h["supabaseConfigured"] is True
