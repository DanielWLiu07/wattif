"""Phase 17 evidence chunk extraction and persistence tests."""

from __future__ import annotations

import json

from app.data.evidence_extract import extract_evidence_chunks
from app.data.dataset_parse import parse_upload


def test_feedback_csv_creates_evidence_chunks():
    raw = b"comment,rating,ward\nToo much curb parking congestion,2,W1\nNeed more fast chargers near transit,4,W2\n"
    parsed = parse_upload(filename="feedback.csv", raw=raw)
    chunks, summary = extract_evidence_chunks(
        rows=parsed["rows"],
        dataset_type=parsed["dataset_type"],
        columns=parsed["columns"],
    )
    assert summary["extracted_evidence_chunk_count"] >= 2
    assert any("parking" in c["chunk_text"].lower() for c in chunks)
    assert all(len(c["chunk_text"]) <= 1500 for c in chunks)


def test_ev_charger_csv_creates_useful_not_excessive_chunks():
    raw = (
        b"latitude,longitude,station_id,status,operator,charger_type\n"
        b"43.65,-79.40,S1,active,ChargeCo,DCFC\n"
        b"43.66,-79.41,S2,unavailable,OtherCo,Level2\n"
        b"43.67,-79.42,S3,active,ChargeCo,DCFC\n"
    )
    parsed = parse_upload(filename="chargers.csv", raw=raw)
    chunks, summary = extract_evidence_chunks(
        rows=parsed["rows"],
        dataset_type="ev_chargers",
        columns=parsed["columns"],
    )
    assert 1 <= summary["extracted_evidence_chunk_count"] <= 10
    assert any("status" in c["chunk_text"].lower() for c in chunks)


def test_geojson_properties_create_chunks():
    fc = {
        "type": "FeatureCollection",
        "features": [
            {
                "type": "Feature",
                "geometry": {"type": "Point", "coordinates": [-79.4, 43.65]},
                "properties": {
                    "comment": "Heatwave caused long outages last summer",
                    "status": "active",
                },
            }
        ],
    }
    parsed = parse_upload(filename="feedback.geojson", raw=json.dumps(fc).encode())
    chunks, summary = extract_evidence_chunks(
        rows=parsed["rows"],
        dataset_type=parsed["dataset_type"],
        columns=parsed["columns"],
    )
    assert summary["extracted_evidence_chunk_count"] >= 1
    assert any("heat" in c["chunk_text"].lower() for c in chunks)


def test_numeric_only_dataset_still_uploads():
    raw = b"zone,peak_kwh,july_load\nz1,9000,12000\nz2,8000,11000\n"
    parsed = parse_upload(filename="demand.csv", raw=raw)
    chunks, summary = extract_evidence_chunks(
        rows=parsed["rows"],
        dataset_type="energy_demand",
        columns=parsed["columns"],
    )
    assert parsed["dataset_type"] == "energy_demand"
    assert summary["extracted_evidence_chunk_count"] >= 1


def test_repository_create_and_delete_by_dataset(monkeypatch):
    store: list[dict] = []

    class FakeQuery:
        def __init__(self, data):
            self._data = data

        def select(self, *_a, **_k):
            return self

        def eq(self, field, value):
            self._data = [r for r in self._data if r.get(field) == value]
            return self

        def order(self, *_a, **_k):
            return self

        def limit(self, n):
            self._data = self._data[:n]
            return self

        def insert(self, rows):
            self._rows = rows if isinstance(rows, list) else [rows]
            return self

        def delete(self):
            return self

        def execute(self):
            if hasattr(self, "_rows"):
                import uuid

                created = []
                for row in self._rows:
                    rec = {"id": str(uuid.uuid4()), **row}
                    store.append(rec)
                    created.append(rec)
                return type("R", (), {"data": created})()
            if hasattr(self, "_delete_ids"):
                deleted = [r for r in store if r["id"] in self._delete_ids]
                store[:] = [r for r in store if r["id"] not in self._delete_ids]
                return type("R", (), {"data": deleted})()
            return type("R", (), {"data": list(self._data)})()

    class FakeTable:
        def select(self, *_a):
            q = FakeQuery(list(store))
            return q

        def insert(self, rows):
            q = FakeQuery(list(store))
            return q.insert(rows)

        def delete(self):
            q = FakeQuery(list(store))
            q._delete_ids = set()

            def eq(field, value):
                q._delete_ids.update(r["id"] for r in q._data if r.get(field) == value)
                return q

            q.eq = eq
            return q

    monkeypatch.setattr(
        "app.db.repositories.dataset_evidence_chunks.table",
        lambda _name: FakeTable(),
    )

    from app.db.repositories import dataset_evidence_chunks as repo

    saved = repo.create_chunks_batch(
        [
            {
                "chunk_text": "comment: parking congestion near chargers",
                "chunk_summary": "parking congestion",
                "source_row_index": 0,
                "source_field": "comment",
                "topic_tags": ["parking"],
            }
        ],
        project_id="p1",
        proposal_id="prop1",
        dataset_id="ds1",
        dataset_type="public_feedback",
    )
    assert len(saved) == 1
    assert repo.list_by_dataset("ds1")
    n = repo.delete_by_dataset("ds1")
    assert n == 1
    assert repo.list_by_dataset("ds1") == []


def test_search_lexical_scoring(monkeypatch):
    pool = [
        {
            "id": "c1",
            "project_id": "p1",
            "dataset_id": "d1",
            "chunk_text": "comment: Too much curb parking congestion near chargers",
            "topic_tags": ["parking", "ev_charging"],
            "dataset_type": "public_feedback",
            "source_field": "comment",
            "created_at": "2026-01-01",
        },
        {
            "id": "c2",
            "project_id": "p1",
            "dataset_id": "d2",
            "chunk_text": "status: active | operator: GridCo",
            "topic_tags": ["grid"],
            "dataset_type": "grid_infrastructure",
            "source_field": "row",
            "created_at": "2026-01-02",
        },
    ]
    monkeypatch.setattr(
        "app.db.repositories.dataset_evidence_chunks.list_by_project",
        lambda pid, **kw: pool if pid == "p1" else [],
    )

    from app.db.repositories import dataset_evidence_chunks as repo

    hits = repo.search_chunks(project_id="p1", query="parking charger", limit=3)
    assert hits
    assert hits[0]["id"] == "c1"
    assert hits[0]["score"] > 0

    empty = repo.search_chunks(project_id="p1", query="quantum physics", limit=3)
    assert empty == []
