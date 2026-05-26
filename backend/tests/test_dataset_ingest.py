from __future__ import annotations

import json

import pytest

from app.dataset_ingest import DatasetValidationError, parse_upload


def test_csv_upload_detects_energy_demand():
    parsed = parse_upload(
        filename="zone_energy_demand.csv",
        content_type="text/csv",
        body=b"zone_id,kwh,peak_load\nz1,120,9\nz2,140,11\n",
    )

    assert parsed.file_type == "csv"
    assert parsed.dataset_type == "energy_demand"
    assert parsed.row_count == 2
    assert parsed.columns == ["zone_id", "kwh", "peak_load"]
    assert parsed.preview[0]["zone_id"] == "z1"


def test_geojson_upload_counts_features_and_geometry():
    body = json.dumps(
        {
            "type": "FeatureCollection",
            "features": [
                {
                    "type": "Feature",
                    "geometry": {"type": "Point", "coordinates": [-79.38, 43.65]},
                    "properties": {"charger_id": "c1", "connector": "CCS"},
                }
            ],
        }
    ).encode()

    parsed = parse_upload(
        filename="ev_chargers.geojson",
        content_type="application/geo+json",
        body=body,
    )

    assert parsed.file_type == "geojson"
    assert parsed.dataset_type == "ev_chargers"
    assert parsed.feature_count == 1
    assert parsed.metadata["geometryTypes"] == ["Point"]
    assert parsed.preview[0]["geometryType"] == "Point"


def test_upload_rejects_unsupported_file_type():
    with pytest.raises(DatasetValidationError):
        parse_upload(
            filename="notes.txt",
            content_type="text/plain",
            body=b"hello",
        )
