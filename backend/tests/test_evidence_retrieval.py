"""Phase 17 evidence retrieval and planner integration tests."""

from __future__ import annotations

from app.evidence_retrieval import (
    EVIDENCE_CAVEAT,
    format_evidence_for_prompt,
    infer_query_from_text,
    retrieve_evidence_for_context,
    search_evidence,
)


def test_infer_query_from_critique():
    q = infer_query_from_text(
        "What is wrong with my design based on uploaded evidence?",
        intent="critique_design",
    )
    assert "feedback" in q or "concern" in q
    assert "design" in q.lower() or "problem" in q


def test_search_returns_relevant_chunks(monkeypatch):
    pool = [
        {
            "id": "c1",
            "dataset_id": "d1",
            "chunk_text": "comment: curb parking congestion near chargers",
            "topic_tags": ["parking"],
            "dataset_type": "public_feedback",
            "source_field": "comment",
            "source_row_index": 0,
            "score": 4.0,
        }
    ]
    monkeypatch.setattr(
        "app.evidence_retrieval.chunks_repo.search_chunks",
        lambda **kw: pool if "parking" in kw.get("query", "") else [],
    )
    monkeypatch.setattr(
        "app.evidence_retrieval._dataset_name_map",
        lambda ids: {"d1": "feedback.csv"},
    )
    hits = search_evidence(project_id="p1", query="parking charger", limit=3)
    assert len(hits) == 1
    assert hits[0]["datasetName"] == "feedback.csv"
    assert "parking" in hits[0]["chunkText"].lower()


def test_unrelated_query_empty(monkeypatch):
    monkeypatch.setattr(
        "app.evidence_retrieval.chunks_repo.search_chunks",
        lambda **kw: [],
    )
    assert search_evidence(project_id="p1", query="quantum physics") == []


def test_format_evidence_for_prompt():
    snippets = [
        {
            "chunkText": "Too much parking congestion",
            "datasetType": "public_feedback",
            "sourceField": "comment",
            "sourceRowIndex": 1,
        }
    ]
    text = format_evidence_for_prompt(snippets)
    assert "Uploaded evidence snippets" in text
    assert "parking congestion" in text
    assert EVIDENCE_CAVEAT in text


def test_retrieve_for_context(monkeypatch):
    monkeypatch.setattr(
        "app.evidence_retrieval.search_evidence",
        lambda **kw: [{"chunkText": "heatwave peak demand", "score": 2.0}]
        if kw.get("project_id") == "p1"
        else [],
    )
    rows = retrieve_evidence_for_context(
        project_id="p1",
        user_message="why are agents concerned about heatwave?",
        intent="explain_concerns",
    )
    assert len(rows) == 1


def test_planner_context_includes_evidence(monkeypatch):
    from app.cohort_context import build_planner_context

    monkeypatch.setattr(
        "app.cohort_context.fetch_concern_summaries",
        lambda **kw: [],
    )
    monkeypatch.setattr(
        "app.cohort_context.fetch_proposal_infra_summary",
        lambda **kw: [],
    )
    monkeypatch.setattr(
        "app.dataset_context.fetch_dataset_summaries",
        lambda **kw: [],
    )
    monkeypatch.setattr(
        "app.existing_infra_context.format_uploaded_existing_infra_for_prompt",
        lambda **kw: "",
    )
    monkeypatch.setattr(
        "app.synthetic_resident_reactions.fetch_reaction_summaries",
        lambda **kw: [],
    )
    monkeypatch.setattr(
        "app.evidence_retrieval.search_evidence",
        lambda **kw: [
            {
                "chunkText": "comment: parking congestion",
                "datasetType": "public_feedback",
                "sourceField": "comment",
                "sourceRowIndex": 0,
            }
        ],
    )
    ctx = build_planner_context(project_id="p1", proposal_id="prop1")
    assert ctx is not None
    assert "Uploaded evidence snippets" in ctx
    assert "parking congestion" in ctx


def test_synthetic_reactions_use_evidence(monkeypatch):
    monkeypatch.setattr(
        "app.synthetic_resident_reactions.build_reaction_context_pack",
        lambda **kw: {
            "concerns": [
                {
                    "id": "c1",
                    "cohortId": "p1",
                    "cohortName": "EV owners",
                    "topic": "parking",
                    "stance": "oppose",
                    "summary": "Parking issues.",
                    "evidence": [],
                }
            ],
            "cohorts": [{"id": "p1", "name": "EV owners", "cohortType": "ev_owners"}],
            "evidenceSnippets": [
                {"chunkText": "comment: curb parking congestion near chargers"}
            ],
            "proposalInfraCounts": {},
        },
    )
    from app.synthetic_resident_reactions import generate_synthetic_resident_reactions

    reactions, _ = generate_synthetic_resident_reactions(
        project_id="p1", proposal_id="prop1", use_llm=False
    )
    assert reactions[0]["evidence"]
    assert "parking" in reactions[0]["evidence"].lower()
