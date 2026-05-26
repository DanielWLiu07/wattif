"""Phase 15 uploaded existing infrastructure extraction tests."""

from __future__ import annotations

import json

from app.data.dataset_parse import parse_upload
from app.data.infra_extract import extract_infrastructure_assets


def test_extract_ev_charger_rows_from_csv():
    raw = (
        b"latitude,longitude,name,status,power_kw\n"
        b"43.65,-79.40,Station A,active,75\n"
        b"43.66,-79.41,Station B,unavailable,50\n"
        b",,Bad Row,,,\n"
    )
    parsed = parse_upload(filename="ev_chargers.csv", raw=raw)
    assets, summary = extract_infrastructure_assets(
        rows=parsed["rows"],
        dataset_type=parsed["dataset_type"],
    )
    assert summary["detected_existing_infrastructure_kind"] == "ev_charger"
    assert summary["extracted_existing_infrastructure_count"] == 2
    assert summary["invalid_existing_infrastructure_rows"] == 1
    assert len(assets) == 2
    assert assets[0]["name"] == "Station A"
    assert assets[0]["power_kw"] == 75.0
    assert assets[0]["status"] == "active"


def test_extract_ignores_missing_coordinates():
    raw = b"name,status\nFoo,active\nBar,active\n"
    parsed = parse_upload(filename="chargers.csv", raw=raw)
    assets, summary = extract_infrastructure_assets(
        rows=parsed["rows"],
        dataset_type="ev_chargers",
    )
    assert assets == []
    assert summary["extracted_existing_infrastructure_count"] == 0
    assert summary["invalid_existing_infrastructure_rows"] == 2


def test_extract_from_geojson_points():
    fc = {
        "type": "FeatureCollection",
        "features": [
            {
                "type": "Feature",
                "geometry": {"type": "Point", "coordinates": [-79.4, 43.65]},
                "properties": {
                    "name": "Geo Charger",
                    "status": "active",
                    "power_kw": 100,
                },
            },
            {
                "type": "Feature",
                "geometry": {"type": "Point", "coordinates": [-79.5, 43.7]},
                "properties": {"name": "No power"},
            },
        ],
    }
    parsed = parse_upload(filename="chargers.geojson", raw=json.dumps(fc).encode())
    assets, summary = extract_infrastructure_assets(
        rows=parsed["rows"],
        dataset_type=parsed["dataset_type"],
    )
    assert summary["extracted_existing_infrastructure_count"] == 2
    assert assets[0]["longitude"] == -79.4
    assert assets[0]["latitude"] == 43.65


def test_non_infrastructure_upload_has_no_extraction():
    raw = b"comment,rating\nGreat,5\nBad,1\n"
    parsed = parse_upload(filename="feedback.csv", raw=raw)
    assets, summary = extract_infrastructure_assets(
        rows=parsed["rows"],
        dataset_type=parsed["dataset_type"],
    )
    assert assets == []
    assert summary["detected_existing_infrastructure_kind"] is None
    assert summary["extracted_existing_infrastructure_count"] == 0
