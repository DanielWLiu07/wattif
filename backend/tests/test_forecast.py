"""Tests for the forward-simulation forecast endpoint (POST /api/forecast)."""

from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

import app.state as state
from app.main import app


@pytest.fixture
def client():
    state.reset_world()
    return TestClient(app)


def _check_series(series, horizon):
    assert len(series) == horizon + 1
    for p in series:
        assert set(p) >= {"tick", "approval", "coverage", "equity", "emissions"}
        assert 0.0 <= p["approval"] <= 1.0
        assert 0.0 <= p["coverage"]
        assert 0.0 <= p["equity"] <= 1.0
        assert p["emissions"] >= 0.0
    # ticks are consecutive starting at the live world's current tick.
    ticks = [p["tick"] for p in series]
    assert ticks == list(range(ticks[0], ticks[0] + horizon + 1))


def test_baseline_only_when_no_proposals(client):
    r = client.post("/api/forecast", json={"ticks": 6})
    assert r.status_code == 200
    body = r.json()
    assert body["horizon"] == 6
    _check_series(body["baseline"], 6)
    assert body["projected"] is None


def test_default_ticks_is_12(client):
    body = client.post("/api/forecast", json={}).json()
    assert body["horizon"] == 12
    _check_series(body["baseline"], 12)


def test_ticks_clamped_to_range(client):
    assert client.post("/api/forecast", json={"ticks": 999}).json()["horizon"] == 36
    assert client.post("/api/forecast", json={"ticks": 0}).json()["horizon"] == 1


def test_projected_differs_from_baseline_and_helps_coverage(client):
    payload = {
        "ticks": 8,
        "proposed": [
            {"kind": "solar", "position": [-79.38, 43.65]},
            {"kind": "microgrid", "position": [-79.40, 43.66]},
        ],
    }
    body = client.post("/api/forecast", json=payload).json()
    assert body["horizon"] == 8
    _check_series(body["baseline"], 8)
    assert body["projected"] is not None
    _check_series(body["projected"], 8)

    base_last = body["baseline"][-1]
    proj_last = body["projected"][-1]
    # Adding clean generation should not reduce final coverage; it should differ somewhere.
    assert proj_last["coverage"] >= base_last["coverage"]
    assert body["projected"] != body["baseline"]


def test_forecast_does_not_mutate_live_world(client):
    before_tick = client.get("/api/sim/metrics").json()["tick"]
    before_infra = len(client.get("/api/infra").json())
    client.post(
        "/api/forecast",
        json={"ticks": 10, "proposed": [{"kind": "wind", "position": [-79.38, 43.65]}]},
    )
    after = client.get("/api/sim/metrics").json()
    assert after["tick"] == before_tick
    assert len(client.get("/api/infra").json()) == before_infra
