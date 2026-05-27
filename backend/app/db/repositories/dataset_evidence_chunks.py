"""Dataset evidence chunk persistence (Phase 17)."""

from __future__ import annotations

import logging
import re
from typing import Any

from .base import PersistenceDisabledError, table

log = logging.getLogger("wattif.db.dataset_evidence_chunks")

TABLE = "dataset_evidence_chunks"


def list_by_project(
    project_id: str,
    *,
    limit: int = 200,
) -> list[dict[str, Any]]:
    try:
        resp = (
            table(TABLE)
            .select("*")
            .eq("project_id", project_id)
            .order("created_at", desc=True)
            .limit(limit)
            .execute()
        )
        return resp.data or []
    except PersistenceDisabledError:
        raise
    except Exception as exc:
        log.warning("list_by_project evidence chunks failed: %s", exc)
        raise


def list_by_proposal(
    proposal_id: str,
    *,
    limit: int = 200,
) -> list[dict[str, Any]]:
    try:
        resp = (
            table(TABLE)
            .select("*")
            .eq("proposal_id", proposal_id)
            .order("created_at", desc=True)
            .limit(limit)
            .execute()
        )
        return resp.data or []
    except PersistenceDisabledError:
        raise
    except Exception as exc:
        log.warning("list_by_proposal evidence chunks failed: %s", exc)
        raise


def list_by_dataset(
    dataset_id: str,
    *,
    limit: int = 500,
) -> list[dict[str, Any]]:
    try:
        resp = (
            table(TABLE)
            .select("*")
            .eq("dataset_id", dataset_id)
            .order("source_row_index")
            .limit(limit)
            .execute()
        )
        return resp.data or []
    except PersistenceDisabledError:
        raise
    except Exception as exc:
        log.warning("list_by_dataset evidence chunks failed: %s", exc)
        raise


def create_chunks_batch(
    chunks: list[dict[str, Any]],
    *,
    project_id: str,
    proposal_id: str | None,
    dataset_id: str,
    dataset_type: str | None = None,
) -> list[dict[str, Any]]:
    if not chunks:
        return []
    rows = []
    for c in chunks:
        rows.append(
            {
                "project_id": project_id,
                "proposal_id": proposal_id,
                "dataset_id": dataset_id,
                "source_type": c.get("source_type") or "uploaded_dataset",
                "chunk_text": c["chunk_text"],
                "chunk_summary": c.get("chunk_summary"),
                "dataset_type": dataset_type or c.get("dataset_type"),
                "source_row_index": c.get("source_row_index"),
                "source_field": c.get("source_field"),
                "topic_tags": c.get("topic_tags") or [],
                "metadata": c.get("metadata") or {},
            }
        )
    try:
        resp = table(TABLE).insert(rows).execute()
        return resp.data or []
    except PersistenceDisabledError:
        raise
    except Exception as exc:
        log.warning("create_chunks_batch failed: %s", exc)
        raise


def delete_by_dataset(dataset_id: str) -> int:
    try:
        rows = (
            table(TABLE).select("id").eq("dataset_id", dataset_id).execute().data or []
        )
        for row in rows:
            table(TABLE).delete().eq("id", row["id"]).execute()
        return len(rows)
    except PersistenceDisabledError:
        raise
    except Exception as exc:
        log.warning("delete_by_dataset evidence chunks failed: %s", exc)
        raise


def _tokenize(query: str) -> list[str]:
    return [t for t in re.findall(r"[a-z0-9]+", query.lower()) if len(t) >= 2]


def search_chunks(
    *,
    project_id: str | None = None,
    proposal_id: str | None = None,
    query: str,
    limit: int = 5,
    dataset_type: str | None = None,
    topic: str | None = None,
) -> list[dict[str, Any]]:
    """Lexical overlap scoring over stored chunks."""
    if project_id:
        pool = list_by_project(project_id, limit=500)
    elif proposal_id:
        pool = list_by_proposal(proposal_id, limit=500)
    else:
        return []

    if dataset_type:
        pool = [c for c in pool if (c.get("dataset_type") or "") == dataset_type]
    if topic:
        pool = [
            c
            for c in pool
            if topic in (c.get("topic_tags") or [])
            or topic in (c.get("chunk_text") or "").lower()
        ]

    tokens = _tokenize(query)
    if not tokens:
        return pool[:limit]

    scored: list[tuple[float, dict[str, Any]]] = []
    for chunk in pool:
        text = (chunk.get("chunk_text") or "").lower()
        tags = " ".join(chunk.get("topic_tags") or []).lower()
        field = (chunk.get("source_field") or "").lower()
        dtype = (chunk.get("dataset_type") or "").lower()
        score = 0.0
        for tok in tokens:
            if tok in text:
                score += 2.0
            if tok in tags:
                score += 1.5
            if tok in field:
                score += 0.5
            if tok in dtype:
                score += 1.0
        if score > 0:
            scored.append((score, chunk))

    scored.sort(key=lambda x: (-x[0], x[1].get("created_at") or ""))
    out: list[dict[str, Any]] = []
    for score, chunk in scored[:limit]:
        row = dict(chunk)
        row["score"] = round(score, 2)
        out.append(row)
    return out
