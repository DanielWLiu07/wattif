"""Dataset parse/classify and API tests."""

from __future__ import annotations

import json

import app.config as config
import app.db.supabase_client as sc
import app.state as state
from app.data.dataset_classify import detect_dataset_type
from app.data.dataset_parse import DatasetParseError, parse_upload
from app.main import app
from fastapi.testclient import TestClient
import pytest


def _disable_supabase(monkeypatch):
    monkeypatch.setattr(config, "SUPABASE_URL", None)
    monkeypatch.setattr(config, "SUPABASE_SERVICE_ROLE_KEY", None)
    sc._client = None
    sc._init_attempted = False


def test_detect_ev_chargers_from_columns():
    assert (
        detect_dataset_type(
            filename="chargers.csv",
            columns=["latitude", "longitude", "station_id", "plug_type"],
        )
        == "ev_chargers"
    )


def test_detect_public_feedback():
    assert (
        detect_dataset_type(
            filename="survey.csv",
            columns=["comment", "rating", "ward"],
        )
        == "public_feedback"
    )


def test_parse_csv_preview():
    raw = b"name,demand_kwh,zone\nA,100,z1\nB,200,z2\n"
    parsed = parse_upload(filename="demand.csv", raw=raw)
    assert parsed["file_type"] == "csv"
    assert parsed["row_count"] == 2
    assert parsed["dataset_type"] == "energy_demand"
    assert len(parsed["preview"]) == 2
    assert "demand_kwh" in parsed["columns"]


def test_parse_geojson_features():
    fc = {
        "type": "FeatureCollection",
        "features": [
            {
                "type": "Feature",
                "geometry": {"type": "Point", "coordinates": [-79.4, 43.65]},
                "properties": {"charger_id": "c1", "power_kw": 50},
            }
        ],
    }
    raw = json.dumps(fc).encode()
    parsed = parse_upload(filename="chargers.geojson", raw=raw)
    assert parsed["file_type"] == "geojson"
    assert parsed["feature_count"] == 1
    assert parsed["dataset_type"] == "ev_chargers"


def test_parse_rejects_oversize():
    raw = b"x" * (512 * 1024 + 1)
    with pytest.raises(DatasetParseError):
        parse_upload(filename="big.csv", raw=raw)


def test_dataset_endpoints_503_when_unconfigured(monkeypatch):
    _disable_supabase(monkeypatch)
    state.reset_world()
    client = TestClient(app)
    pid = "00000000-0000-0000-0000-000000000001"
    for method, path in (
        ("get", f"/api/projects/{pid}/datasets"),
        ("get", f"/api/datasets/00000000-0000-0000-0000-000000000002"),
        ("delete", f"/api/datasets/00000000-0000-0000-0000-000000000002"),
    ):
        r = client.get(path) if method == "get" else client.delete(path)
        assert r.status_code == 503
        assert r.json()["detail"]["available"] is False

    # Context endpoint degrades to empty list when persistence is off (planner-safe).
    ctx = client.get(f"/api/projects/{pid}/datasets/context")
    assert ctx.status_code == 200
    assert ctx.json() == []
