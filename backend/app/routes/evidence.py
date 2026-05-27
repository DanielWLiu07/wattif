"""Dataset evidence chunk routes (Phase 17)."""

from __future__ import annotations

import logging

from fastapi import APIRouter, HTTPException, Query

from ..db.repositories import dataset_evidence_chunks as chunks_repo
from ..db.repositories.base import PersistenceDisabledError
from ..evidence_retrieval import search_evidence
from ..persistence_models import (
    DatasetEvidenceChunk,
    EvidenceSearchRequest,
    EvidenceSearchResult,
    PersistenceUnavailableResponse,
)

log = logging.getLogger("wattif.routes.evidence")

router = APIRouter(prefix="/api", tags=["evidence"])

_UNAVAILABLE = PersistenceUnavailableResponse()


def _unavailable() -> HTTPException:
    return HTTPException(
        status_code=503,
        detail=_UNAVAILABLE.model_dump(by_alias=True),
    )


def _row_to_chunk(row: dict) -> DatasetEvidenceChunk:
    return DatasetEvidenceChunk(
        id=row["id"],
        project_id=row["project_id"],
        proposal_id=row.get("proposal_id"),
        dataset_id=row["dataset_id"],
        source_type=row.get("source_type") or "uploaded_dataset",
        chunk_text=row.get("chunk_text") or "",
        chunk_summary=row.get("chunk_summary"),
        dataset_type=row.get("dataset_type"),
        source_row_index=row.get("source_row_index"),
        source_field=row.get("source_field"),
        topic_tags=row.get("topic_tags") or [],
        metadata=row.get("metadata") or {},
        created_at=row.get("created_at"),
    )


@router.get(
    "/projects/{project_id}/evidence-chunks",
    response_model=list[DatasetEvidenceChunk],
)
def list_project_evidence_chunks(
    project_id: str,
    limit: int = Query(default=100, ge=1, le=500),
) -> list[DatasetEvidenceChunk]:
    try:
        rows = chunks_repo.list_by_project(project_id, limit=limit)
        return [_row_to_chunk(r) for r in rows]
    except PersistenceDisabledError:
        raise _unavailable() from None
    except Exception as exc:
        log.warning("GET project evidence-chunks failed: %s", exc)
        raise HTTPException(status_code=502, detail="Persistence query failed") from exc


@router.get(
    "/proposals/{proposal_id}/evidence-chunks",
    response_model=list[DatasetEvidenceChunk],
)
def list_proposal_evidence_chunks(
    proposal_id: str,
    limit: int = Query(default=100, ge=1, le=500),
) -> list[DatasetEvidenceChunk]:
    try:
        rows = chunks_repo.list_by_proposal(proposal_id, limit=limit)
        return [_row_to_chunk(r) for r in rows]
    except PersistenceDisabledError:
        raise _unavailable() from None
    except Exception as exc:
        log.warning("GET proposal evidence-chunks failed: %s", exc)
        raise HTTPException(status_code=502, detail="Persistence query failed") from exc


@router.post(
    "/projects/{project_id}/evidence-search",
    response_model=list[EvidenceSearchResult],
)
def search_project_evidence(
    project_id: str,
    body: EvidenceSearchRequest,
) -> list[EvidenceSearchResult]:
    try:
        results = search_evidence(
            project_id=project_id,
            query=body.query,
            limit=body.limit,
            dataset_type=body.dataset_type,
            topic=body.topic,
        )
        return [EvidenceSearchResult(**r) for r in results]
    except PersistenceDisabledError:
        raise _unavailable() from None
    except Exception as exc:
        log.warning("POST project evidence-search failed: %s", exc)
        raise HTTPException(status_code=502, detail="Evidence search failed") from exc


@router.post(
    "/proposals/{proposal_id}/evidence-search",
    response_model=list[EvidenceSearchResult],
)
def search_proposal_evidence(
    proposal_id: str,
    body: EvidenceSearchRequest,
) -> list[EvidenceSearchResult]:
    try:
        results = search_evidence(
            proposal_id=proposal_id,
            query=body.query,
            limit=body.limit,
            dataset_type=body.dataset_type,
            topic=body.topic,
        )
        return [EvidenceSearchResult(**r) for r in results]
    except PersistenceDisabledError:
        raise _unavailable() from None
    except Exception as exc:
        log.warning("POST proposal evidence-search failed: %s", exc)
        raise HTTPException(status_code=502, detail="Evidence search failed") from exc
