"""Lightweight lexical evidence retrieval over uploaded dataset chunks (Phase 17)."""

from __future__ import annotations

import logging
import re
from typing import Any

from .db.repositories import dataset_evidence_chunks as chunks_repo
from .db.repositories import datasets as datasets_repo
from .db.repositories.base import PersistenceDisabledError

log = logging.getLogger("wattif.evidence_retrieval")

EVIDENCE_CAVEAT = (
    "Uploaded evidence snippets are extracted from uploaded datasets and may be incomplete. "
    "They are decision-support context, not validated public consultation."
)

_INTENT_QUERY_HINTS: dict[str, str] = {
    "explain_concerns": "concern feedback parking congestion opposition resident",
    "critique_design": "feedback concern parking congestion design problem issue",
    "read_uploaded_infrastructure": "charger status operator unavailable active infrastructure",
    "summarize_datasets": "dataset summary feedback demand",
    "resilience_scenario": "heatwave outage peak demand grid reliability",
    "concern_recommendation": "concern feedback parking peak demand affordability",
    "ev_placement": "charger parking transit access congestion status",
    "general_wattif_question": "feedback concern demand charger",
}


def normalize_query(query: str) -> str:
    return re.sub(r"\s+", " ", (query or "").strip())


def infer_query_from_text(text: str, intent: str | None = None) -> str:
    """Build a retrieval query from user message and planner intent."""
    if intent and intent in _INTENT_QUERY_HINTS:
        base = _INTENT_QUERY_HINTS[intent]
    else:
        base = "feedback concern charger parking demand heatwave"
    t = (text or "").lower()
    extra: list[str] = []
    if re.search(r"\bconcern|worried|oppose|resident|agent\b", t):
        extra.extend(["concern", "feedback", "parking", "congestion"])
    if re.search(r"\bdesign|wrong|problem|issue|critique\b", t):
        extra.extend(["feedback", "concern", "issue", "parking"])
    if re.search(r"\bev|charger|charging\b", t):
        extra.extend(["charger", "charging", "parking", "status"])
    if re.search(r"\bheat|heatwave|summer|peak\b", t):
        extra.extend(["heat", "peak", "demand", "summer"])
    if re.search(r"\bgrid|outage|reliability\b", t):
        extra.extend(["grid", "outage", "reliability"])
    if re.search(r"\bafford|bill|rent|burden\b", t):
        extra.extend(["afford", "bill", "burden"])
    parts = [base, *extra, t[:120]]
    return normalize_query(" ".join(parts))


def _dataset_name_map(dataset_ids: set[str]) -> dict[str, str]:
    names: dict[str, str] = {}
    for did in dataset_ids:
        try:
            row = datasets_repo.get_dataset(did)
            if row:
                names[did] = row.get("name") or did
        except Exception:
            names[did] = did
    return names


def _to_search_result(row: dict[str, Any], names: dict[str, str]) -> dict[str, Any]:
    did = row.get("dataset_id") or ""
    return {
        "id": row.get("id"),
        "datasetId": did,
        "datasetName": names.get(did),
        "datasetType": row.get("dataset_type"),
        "chunkText": row.get("chunk_text"),
        "chunkSummary": row.get("chunk_summary"),
        "sourceRowIndex": row.get("source_row_index"),
        "sourceField": row.get("source_field"),
        "topicTags": row.get("topic_tags") or [],
        "score": float(row.get("score") or 0),
        "metadata": row.get("metadata") or {},
    }


def search_evidence(
    *,
    project_id: str | None = None,
    proposal_id: str | None = None,
    query: str,
    limit: int = 5,
    dataset_type: str | None = None,
    topic: str | None = None,
) -> list[dict[str, Any]]:
    """Retrieve top-K evidence snippets with lexical scoring."""
    q = normalize_query(query)
    if not q or (not project_id and not proposal_id):
        return []
    try:
        rows = chunks_repo.search_chunks(
            project_id=project_id,
            proposal_id=proposal_id,
            query=q,
            limit=limit,
            dataset_type=dataset_type,
            topic=topic,
        )
        names = _dataset_name_map({str(r.get("dataset_id")) for r in rows if r.get("dataset_id")})
        return [_to_search_result(r, names) for r in rows]
    except PersistenceDisabledError:
        raise
    except Exception as exc:
        log.warning("search_evidence failed: %s", exc)
        return []


def retrieve_evidence_for_context(
    *,
    project_id: str | None = None,
    proposal_id: str | None = None,
    user_message: str = "",
    intent: str | None = None,
    limit: int = 5,
) -> list[dict[str, Any]]:
    query = infer_query_from_text(user_message, intent)
    try:
        return search_evidence(
            project_id=project_id,
            proposal_id=proposal_id,
            query=query,
            limit=limit,
        )
    except PersistenceDisabledError:
        return []


def format_evidence_for_prompt(
    snippets: list[dict[str, Any]],
    *,
    max_snippets: int = 5,
) -> str:
    """Compact evidence block for planner/operator prompts."""
    if not snippets:
        return ""
    lines = [
        "Uploaded evidence snippets (from dataset uploads — decision-support only, "
        "NOT validated public consultation, NOT real resident evidence):"
    ]
    for i, s in enumerate(snippets[:max_snippets], start=1):
        text = (s.get("chunkText") or s.get("chunk_text") or "")[:220]
        dtype = s.get("datasetType") or s.get("dataset_type") or "dataset"
        field = s.get("sourceField") or s.get("source_field") or "row"
        row_idx = s.get("sourceRowIndex") if s.get("sourceRowIndex") is not None else s.get("source_row_index")
        loc = f"row {row_idx}" if row_idx is not None else "upload"
        lines.append(f"- [{dtype}/{field} {loc}] {text}")
    lines.append(EVIDENCE_CAVEAT)
    return "\n".join(lines)


def fetch_evidence_summaries(
    *,
    project_id: str | None = None,
    proposal_id: str | None = None,
    limit: int = 20,
) -> list[dict[str, Any]]:
    if not project_id and not proposal_id:
        return []
    try:
        if proposal_id:
            rows = chunks_repo.list_by_proposal(proposal_id, limit=limit)
        else:
            rows = chunks_repo.list_by_project(project_id, limit=limit)
        names = _dataset_name_map({str(r.get("dataset_id")) for r in rows if r.get("dataset_id")})
        return [_to_search_result({**r, "score": 0}, names) for r in rows]
    except PersistenceDisabledError:
        return []
    except Exception as exc:
        log.warning("fetch_evidence_summaries failed: %s", exc)
        return []
