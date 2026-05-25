"""Persistence API tests — must not break demo when Supabase is unset."""

from __future__ import annotations

import app.state as state
from app.main import app
from fastapi.testclient import TestClient


def test_health_reports_memory_persistence_by_default(monkeypatch):
    monkeypatch.delenv("SUPABASE_URL", raising=False)
    monkeypatch.delenv("SUPABASE_SERVICE_ROLE_KEY", raising=False)
    state.reset_world()
    client = TestClient(app)
    h = client.get("/api/health").json()
    assert h["persistenceProvider"] == "memory"
    assert h["supabaseConfigured"] is False


def test_persistence_endpoints_503_when_unconfigured(monkeypatch):
    monkeypatch.delenv("SUPABASE_URL", raising=False)
    monkeypatch.delenv("SUPABASE_SERVICE_ROLE_KEY", raising=False)
    # Reset cached supabase client between tests
    import app.db.supabase_client as sc

    sc._client = None
    sc._init_attempted = False

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


def test_health_reports_supabase_when_env_set(monkeypatch):
    monkeypatch.setenv("SUPABASE_URL", "https://example.supabase.co")
    monkeypatch.setenv("SUPABASE_SERVICE_ROLE_KEY", "test-key")
    import app.config as config

    monkeypatch.setattr(config, "SUPABASE_URL", "https://example.supabase.co")
    monkeypatch.setattr(config, "SUPABASE_SERVICE_ROLE_KEY", "test-key")
    state.reset_world()
    client = TestClient(app)
    h = client.get("/api/health").json()
    assert h["persistenceProvider"] == "supabase"
    assert h["supabaseConfigured"] is True
