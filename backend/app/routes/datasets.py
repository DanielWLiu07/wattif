"""Dataset upload REST routes — metadata + preview only."""

from __future__ import annotations

import logging

from fastapi import APIRouter, File, Form, HTTPException, Query, UploadFile

from ..data.dataset_parse import DatasetParseError, parse_upload
from ..dataset_context import fetch_dataset_summaries
from ..db.repositories import datasets as datasets_repo
from ..db.repositories.base import PersistenceDisabledError
from ..persistence_models import (
    PersistenceUnavailableResponse,
    UploadedDataset,
    UploadedDatasetSummary,
)

log = logging.getLogger("wattif.routes.datasets")

router = APIRouter(prefix="/api", tags=["datasets"])

_UNAVAILABLE = PersistenceUnavailableResponse()


def _unavailable() -> HTTPException:
    return HTTPException(
        status_code=503,
        detail=_UNAVAILABLE.model_dump(by_alias=True),
    )


def _row_to_dataset(row: dict) -> UploadedDataset:
    columns = row.get("columns") or []
    if not isinstance(columns, list):
        columns = []
    preview = row.get("preview") or []
    if not isinstance(preview, list):
        preview = []
    return UploadedDataset(
        id=row["id"],
        project_id=row.get("project_id"),
        proposal_id=row.get("proposal_id"),
        name=row["name"],
        dataset_type=row.get("dataset_type", "generic"),
        file_type=row.get("file_type"),
        row_count=row.get("row_count"),
        feature_count=row.get("feature_count"),
        columns=[str(c) for c in columns],
        preview=preview,
        metadata=row.get("metadata") or {},
        created_at=row.get("created_at"),
        updated_at=row.get("updated_at"),
        uploaded_at=row.get("uploaded_at") or row.get("created_at"),
    )


def _row_to_summary(row: dict) -> UploadedDatasetSummary:
    meta = row.get("metadata") or {}
    columns = row.get("columns") or []
    return UploadedDatasetSummary(
        id=row["id"],
        name=row["name"],
        dataset_type=row.get("dataset_type", "generic"),
        file_type=row.get("file_type"),
        row_count=row.get("row_count"),
        feature_count=row.get("feature_count"),
        columns=[str(c) for c in columns][:20],
        detected_type=meta.get("detectedType"),
        created_at=row.get("created_at") or row.get("uploaded_at"),
    )


@router.post("/datasets/upload", response_model=UploadedDataset, status_code=201)
async def upload_dataset(
    file: UploadFile = File(...),
    project_id: str | None = Form(default=None, alias="projectId"),
    proposal_id: str | None = Form(default=None, alias="proposalId"),
    dataset_type: str | None = Form(default=None, alias="datasetType"),
) -> UploadedDataset:
    if not project_id and not proposal_id:
        raise HTTPException(
            status_code=400,
            detail="projectId or proposalId is required to attach the dataset.",
        )
    filename = file.filename or "upload"
    try:
        raw = await file.read()
        parsed = parse_upload(
            filename=filename,
            raw=raw,
            content_type=file.content_type,
            dataset_type_override=dataset_type,
        )
    except DatasetParseError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    try:
        row = datasets_repo.create_dataset(
            name=parsed["name"],
            dataset_type=parsed["dataset_type"],
            project_id=project_id,
            proposal_id=proposal_id,
            file_type=parsed["file_type"],
            row_count=parsed.get("row_count"),
            feature_count=parsed.get("feature_count"),
            columns=parsed.get("columns"),
            preview=parsed.get("preview"),
            metadata=parsed.get("metadata"),
        )
        return _row_to_dataset(row)
    except PersistenceDisabledError:
        raise _unavailable() from None
    except Exception as exc:
        log.warning("POST /api/datasets/upload failed: %s", exc)
        raise HTTPException(status_code=502, detail="Persistence write failed") from exc


@router.get("/projects/{project_id}/datasets", response_model=list[UploadedDataset])
def list_project_datasets(
    project_id: str,
    limit: int = Query(default=50, ge=1, le=200),
) -> list[UploadedDataset]:
    try:
        rows = datasets_repo.list_datasets(project_id=project_id, limit=limit)
        return [_row_to_dataset(r) for r in rows]
    except PersistenceDisabledError:
        raise _unavailable() from None
    except Exception as exc:
        log.warning("GET /api/projects/%s/datasets failed: %s", project_id, exc)
        raise HTTPException(status_code=502, detail="Persistence query failed") from exc


@router.get(
    "/projects/{project_id}/datasets/context",
    response_model=list[UploadedDatasetSummary],
)
def project_datasets_context(
    project_id: str,
    limit: int = Query(default=20, ge=1, le=50),
) -> list[UploadedDatasetSummary]:
    summaries = fetch_dataset_summaries(project_id=project_id, limit=limit)
    return [UploadedDatasetSummary(**s) for s in summaries]


@router.get("/proposals/{proposal_id}/datasets", response_model=list[UploadedDataset])
def list_proposal_datasets(
    proposal_id: str,
    limit: int = Query(default=50, ge=1, le=200),
) -> list[UploadedDataset]:
    try:
        rows = datasets_repo.list_datasets(proposal_id=proposal_id, limit=limit)
        return [_row_to_dataset(r) for r in rows]
    except PersistenceDisabledError:
        raise _unavailable() from None
    except Exception as exc:
        log.warning("GET /api/proposals/%s/datasets failed: %s", proposal_id, exc)
        raise HTTPException(status_code=502, detail="Persistence query failed") from exc


@router.get(
    "/proposals/{proposal_id}/datasets/context",
    response_model=list[UploadedDatasetSummary],
)
def proposal_datasets_context(
    proposal_id: str,
    limit: int = Query(default=20, ge=1, le=50),
) -> list[UploadedDatasetSummary]:
    summaries = fetch_dataset_summaries(proposal_id=proposal_id, limit=limit)
    return [UploadedDatasetSummary(**s) for s in summaries]


@router.get("/datasets/{dataset_id}", response_model=UploadedDataset)
def get_dataset(dataset_id: str) -> UploadedDataset:
    try:
        row = datasets_repo.get_dataset(dataset_id)
        if row is None:
            raise HTTPException(status_code=404, detail=f"dataset {dataset_id} not found")
        return _row_to_dataset(row)
    except PersistenceDisabledError:
        raise _unavailable() from None
    except HTTPException:
        raise
    except Exception as exc:
        log.warning("GET /api/datasets/%s failed: %s", dataset_id, exc)
        raise HTTPException(status_code=502, detail="Persistence query failed") from exc


@router.delete("/datasets/{dataset_id}")
def delete_dataset(dataset_id: str) -> dict:
    try:
        ok = datasets_repo.delete_dataset(dataset_id)
        if not ok:
            raise HTTPException(status_code=404, detail=f"dataset {dataset_id} not found")
        return {"ok": True, "datasetId": dataset_id}
    except PersistenceDisabledError:
        raise _unavailable() from None
    except HTTPException:
        raise
    except Exception as exc:
        log.warning("DELETE /api/datasets/%s failed: %s", dataset_id, exc)
        raise HTTPException(status_code=502, detail="Persistence delete failed") from exc
