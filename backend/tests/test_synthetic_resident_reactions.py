"""Phase 16 synthetic resident reaction generator and persistence tests."""

from __future__ import annotations

import app.config as config
import app.db.supabase_client as sc
from app.db.repositories.base import PersistenceDisabledError
from app.synthetic_resident_reactions import (
    REACTION_CAVEAT,
    build_reaction_context_pack,
    format_reactions_for_prompt,
    generate_deterministic_reactions,
    generate_synthetic_resident_reactions,
)
import pytest


def _sample_context(*, with_concerns: bool = True) -> dict:
    ctx = {
        "projectId": "proj-1",
        "proposalId": "prop-1",
        "proposalName": "EV Expansion",
        "cohorts": [
            {"id": "c1", "name": "EV owners", "cohortType": "ev_owners"},
            {"id": "c2", "name": "Renters", "cohortType": "renters"},
        ],
        "concerns": [],
        "datasets": [{"name": "chargers.csv", "datasetType": "ev_chargers"}],
        "proposalInfraCounts": {"ev_charger": 2, "battery": 1},
        "uploadedInfrastructureCount": 5,
    }
    if with_concerns:
        ctx["concerns"] = [
            {
                "id": "conc-1",
                "cohortId": "c1",
                "cohortName": "EV owners",
                "topic": "parking_and_congestion",
                "stance": "oppose",
                "summary": "Parking congestion near proposed curbside chargers.",
                "evidence": ["Dataset: feedback.csv"],
            },
            {
                "id": "conc-2",
                "cohortId": "c2",
                "cohortName": "Renters",
                "topic": "affordability_and_peaks",
                "stance": "mixed",
                "summary": "Renters want bill relief before new load is added.",
                "evidence": ["Demand upload"],
            },
        ]
    return ctx


def test_deterministic_fallback_without_concerns():
    ctx = _sample_context(with_concerns=False)
    reactions = generate_deterministic_reactions(ctx)
    assert 2 <= len(reactions) <= 4
    assert all(r["provider"] == "deterministic" for r in reactions)
    assert all(r["model"] == "fallback_v1" for r in reactions)


def test_deterministic_from_concerns():
    ctx = _sample_context()
    reactions = generate_deterministic_reactions(ctx)
    assert len(reactions) == 2
    assert reactions[0]["persona_label"] == "EV owners"
    assert reactions[0]["stance"] == "oppose"
    assert reactions[0]["key_concern"] == "parking_and_congestion"


def test_generate_includes_caveat(monkeypatch):
    monkeypatch.setattr(
        "app.synthetic_resident_reactions.build_reaction_context_pack",
        lambda **kw: _sample_context(),
    )
    reactions, meta = generate_synthetic_resident_reactions(
        project_id="proj-1", proposal_id="prop-1", use_llm=False
    )
    assert len(reactions) >= 2
    assert all(r["caveat"] == REACTION_CAVEAT for r in reactions)
    assert meta["provider"] == "deterministic"


def test_llm_failure_falls_back(monkeypatch):
    monkeypatch.setattr(config, "ANTHROPIC_API_KEY", "sk-test")
    monkeypatch.setattr(config, "FEATHER_API_KEY", None)
    monkeypatch.setattr(config, "FEATHER_BASE_URL", None)
    monkeypatch.setattr(
        "app.synthetic_resident_reactions.build_reaction_context_pack",
        lambda **kw: _sample_context(),
    )

    def _boom(_ctx):
        raise RuntimeError("503 service unavailable")

    monkeypatch.setattr(
        "app.synthetic_resident_reactions._call_llm_for_reactions", _boom
    )
    reactions, meta = generate_synthetic_resident_reactions(
        project_id="proj-1", proposal_id="prop-1", use_llm=True
    )
    assert len(reactions) >= 2
    assert meta["provider"] == "deterministic"
    assert all(r["caveat"] == REACTION_CAVEAT for r in reactions)


def test_llm_success_when_mocked(monkeypatch):
    monkeypatch.setattr(config, "ANTHROPIC_API_KEY", "sk-test")
    monkeypatch.setattr(config, "FEATHER_API_KEY", None)
    monkeypatch.setattr(config, "FEATHER_BASE_URL", None)
    monkeypatch.setattr(
        "app.synthetic_resident_reactions.build_reaction_context_pack",
        lambda **kw: _sample_context(),
    )

    def _fake_llm(_ctx):
        return [
            {
                "persona_label": "Climate advocates",
                "stance": "support",
                "summary": "Support batteries paired with solar before heat season.",
                "key_concern": "heat resilience",
                "suggested_change": "Add community battery hub.",
                "evidence": "Weather-risk dataset",
                "confidence": 0.8,
                "provider": "anthropic",
                "model": "claude-test",
            }
        ]

    monkeypatch.setattr(
        "app.synthetic_resident_reactions._call_llm_for_reactions", _fake_llm
    )
    reactions, meta = generate_synthetic_resident_reactions(
        project_id="proj-1", proposal_id="prop-1", use_llm=True
    )
    assert len(reactions) == 1
    assert meta["provider"] == "anthropic"
    assert reactions[0]["caveat"] == REACTION_CAVEAT


def test_format_reactions_for_prompt():
    reactions = [
        {
            "stance": "mixed",
            "summary": "Worried about peak load.",
            "suggested_change": "Add storage before new EV load.",
        },
        {
            "stance": "support",
            "summary": "Likes transit-adjacent chargers.",
            "suggested_change": "Expand off-street charger pilot.",
        },
    ]
    text = format_reactions_for_prompt(reactions)
    assert "Synthetic resident reactions: 2 generated" in text
    assert "mixed" in text
    assert "support" in text
    assert REACTION_CAVEAT in text


def test_repository_create_list_delete(monkeypatch):
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

        def insert(self, row):
            self._row = row
            return self

        def delete(self):
            return self

        def execute(self):
            if hasattr(self, "_row"):
                import uuid

                rec = {"id": str(uuid.uuid4()), **self._row}
                store.append(rec)
                return type("R", (), {"data": [rec]})()
            if hasattr(self, "_delete"):
                before = len(store)
                store[:] = [r for r in store if r.get("id") not in self._delete]
                deleted = [r for r in store if r.get("id") in self._delete]
                return type("R", (), {"data": deleted or ([{}] if before else [])})()
            return type("R", (), {"data": list(self._data)})()

    class FakeTable:
        def __init__(self):
            self._data = store

        def select(self, *_a):
            return FakeQuery(list(store))

        def insert(self, row):
            q = FakeQuery(list(store))
            return q.insert(row)

        def delete(self):
            q = FakeQuery(list(store))
            q._delete = set()
            orig_eq = q.eq

            def eq(field, value):
                orig_eq(field, value)
                q._delete.update(r["id"] for r in q._data)
                return q

            q.eq = eq
            return q

    monkeypatch.setattr(
        "app.db.repositories.synthetic_resident_reactions.table",
        lambda _name: FakeTable(),
    )

    from app.db.repositories import synthetic_resident_reactions as repo

    row = repo.create(
        project_id="p1",
        proposal_id="prop1",
        stance="mixed",
        summary="Test reaction",
        caveat=REACTION_CAVEAT,
    )
    assert row["id"]
    listed = repo.list_by_proposal("prop1")
    assert len(listed) == 1
    assert repo.delete(row["id"]) is True
    assert repo.list_by_proposal("prop1") == []


def test_build_context_pack_monkeypatched(monkeypatch):
    monkeypatch.setattr(
        "app.synthetic_resident_reactions.proposals_repo.get_proposal",
        lambda pid: {"id": pid, "name": "Test Proposal", "status": "draft"},
    )
    monkeypatch.setattr(
        "app.synthetic_resident_reactions.agents_repo.list_profiles",
        lambda **kw: [{"id": "c1", "name": "EV owners", "cohort_type": "ev_owners"}],
    )
    monkeypatch.setattr(
        "app.synthetic_resident_reactions.fetch_concern_summaries",
        lambda **kw: [{"id": "x", "summary": "concern"}],
    )
    monkeypatch.setattr(
        "app.synthetic_resident_reactions.fetch_dataset_summaries",
        lambda **kw: [{"name": "ds"}],
    )
    monkeypatch.setattr(
        "app.synthetic_resident_reactions.fetch_proposal_infra_summary",
        lambda **kw: [{"kind": "ev_charger"}],
    )
    monkeypatch.setattr(
        "app.synthetic_resident_reactions.fetch_uploaded_infrastructure",
        lambda **kw: [{"asset_kind": "ev_charger"}],
    )
    monkeypatch.setattr(
        "app.synthetic_resident_reactions.snapshots_repo.get_latest",
        lambda pid: {"tick": 10, "metrics": {"coverage": 0.5}},
    )
    monkeypatch.setattr(
        "app.report_generator.fetch_operator_recommendation",
        lambda pid: {"summary": "Add batteries first."},
    )

    ctx = build_reaction_context_pack(project_id="p1", proposal_id="prop1")
    assert ctx["proposalName"] == "Test Proposal"
    assert len(ctx["concerns"]) == 1
    assert ctx["snapshotTick"] == 10
    assert ctx["operatorRecommendationSummary"]


def test_repository_disabled(monkeypatch):
    monkeypatch.setattr(config, "SUPABASE_URL", None)
    monkeypatch.setattr(config, "SUPABASE_SERVICE_ROLE_KEY", None)
    sc._client = None
    sc._init_attempted = False

    from app.db.repositories import synthetic_resident_reactions as repo

    with pytest.raises(PersistenceDisabledError):
        repo.list_by_project("p1")


def test_resident_reaction_api_generate(monkeypatch):
    import app.state as state
    from app.main import app
    from fastapi.testclient import TestClient

    saved_specs = [
        {
            "persona_label": "EV owners",
            "stance": "mixed",
            "summary": "Synthetic reaction text.",
            "caveat": REACTION_CAVEAT,
            "provider": "deterministic",
            "model": "fallback_v1",
            "reaction_type": "llm_synthetic_reaction",
            "source_context": {},
        }
    ]

    monkeypatch.setattr(
        "app.routes.resident_reactions.proposals_repo.get_proposal",
        lambda pid: {"id": pid, "project_id": "proj-1"},
    )
    monkeypatch.setattr(
        "app.routes.resident_reactions.reactions_repo.delete_by_proposal",
        lambda pid: 0,
    )
    monkeypatch.setattr(
        "app.routes.resident_reactions.generate_synthetic_resident_reactions",
        lambda **kw: (saved_specs, {"provider": "deterministic", "model": "fallback_v1", "count": 1}),
    )
    monkeypatch.setattr(
        "app.routes.resident_reactions.reactions_repo.create",
        lambda **fields: {"id": "r1", **fields},
    )
    monkeypatch.setattr(
        "app.routes.resident_reactions.reactions_repo.list_by_proposal",
        lambda pid, **kw: [{"id": "r1", "project_id": "proj-1", "proposal_id": pid, **saved_specs[0], "caveat": REACTION_CAVEAT}],
    )

    state.reset_world()
    client = TestClient(app)
    r = client.post("/api/proposals/prop-1/resident-reactions/generate")
    assert r.status_code == 200
    body = r.json()
    assert body["count"] == 1
    assert body["reactions"][0]["summary"] == "Synthetic reaction text."
    assert body["reactions"][0]["caveat"] == REACTION_CAVEAT

    listed = client.get("/api/proposals/prop-1/resident-reactions")
    assert listed.status_code == 200
    assert len(listed.json()) == 1
