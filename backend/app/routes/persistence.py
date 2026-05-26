"""Persistence REST routes — Supabase-backed when configured."""

from __future__ import annotations

import logging

from fastapi import APIRouter, HTTPException, Query, Request

from ..db.repositories.base import PersistenceDisabledError
from ..db.repositories import (
    assets,
    datasets,
    projects,
    proposal_infrastructure,
    proposals,
    simulation_snapshots,
)
from ..dataset_ingest import DatasetValidationError, parse_upload
from ..persistence_models import (
    AssetDefinition,
    AssetDefinitionCreate,
    PersistenceUnavailableResponse,
    Project,
    ProjectCreate,
    Proposal,
    ProposalCreate,
    ProposalInfrastructure,
    ProposalInfrastructureCreate,
    SimulationSnapshot,
    SimulationSnapshotCreate,
    UploadedDataset,
)

log = logging.getLogger("wattif.routes.persistence")

router = APIRouter(prefix="/api", tags=["persistence"])

_UNAVAILABLE = PersistenceUnavailableResponse()


def _unavailable() -> HTTPException:
    return HTTPException(
        status_code=503,
        detail=_UNAVAILABLE.model_dump(by_alias=True),
    )


def _row_to_project(row: dict) -> Project:
    return Project(
        id=row["id"],
        name=row["name"],
        description=row.get("description"),
        city=row.get("city", "Toronto"),
        metadata=row.get("metadata") or {},
        created_at=row.get("created_at"),
        updated_at=row.get("updated_at"),
    )


def _row_to_proposal(row: dict) -> Proposal:
    return Proposal(
        id=row["id"],
        project_id=row["project_id"],
        name=row["name"],
        description=row.get("description"),
        status=row.get("status", "draft"),
        metadata=row.get("metadata") or {},
        created_at=row.get("created_at"),
        updated_at=row.get("updated_at"),
    )


def _row_to_asset(row: dict) -> AssetDefinition:
    return AssetDefinition(
        id=row["id"],
        project_id=row.get("project_id"),
        name=row["name"],
        kind=row["kind"],
        spec=row.get("spec") or {},
        created_at=row.get("created_at"),
        updated_at=row.get("updated_at"),
    )


def _row_to_dataset(row: dict) -> UploadedDataset:
    metadata = row.get("metadata") or {}
    row_count = row.get("row_count")
    feature_count = row.get("feature_count")
    return UploadedDataset(
        id=row["id"],
        project_id=row.get("project_id"),
        proposal_id=row.get("proposal_id"),
        name=row["name"],
        dataset_type=row["dataset_type"],
        file_type=row.get("file_type") or metadata.get("fileType"),
        row_count=row_count if row_count is not None else metadata.get("rowCount"),
        feature_count=feature_count
        if feature_count is not None
        else metadata.get("featureCount"),
        columns=row.get("columns") or metadata.get("columns") or [],
        preview=row.get("preview") or metadata.get("preview") or [],
        metadata=metadata,
        uploaded_at=row.get("uploaded_at") or row.get("created_at"),
        created_at=row.get("created_at"),
        updated_at=row.get("updated_at"),
    )


def _row_to_infrastructure(row: dict) -> ProposalInfrastructure:
    return ProposalInfrastructure(
        id=row["id"],
        proposal_id=row["proposal_id"],
        kind=row["kind"],
        zone_id=row.get("zone_id"),
        position=row.get("position"),
        capacity_kw=row.get("capacity_kw"),
        metadata=row.get("metadata") or {},
        created_at=row.get("created_at"),
    )


def _row_to_snapshot(row: dict) -> SimulationSnapshot:
    return SimulationSnapshot(
        id=row["id"],
        proposal_id=row["proposal_id"],
        tick=row.get("tick", 0),
        metrics=row.get("metrics") or {},
        scenarios=row.get("scenarios") or [],
        infrastructure=row.get("infrastructure") or [],
        created_at=row.get("created_at"),
    )


@router.get("/projects", response_model=list[Project])
def list_projects(
    limit: int = Query(default=50, ge=1, le=200),
) -> list[Project]:
    try:
        rows = projects.list_projects(limit=limit)
        return [_row_to_project(r) for r in rows]
    except PersistenceDisabledError:
        raise _unavailable() from None
    except Exception as exc:
        log.warning("GET /api/projects failed: %s", exc)
        raise HTTPException(status_code=502, detail="Persistence query failed") from exc


@router.post("/projects", response_model=Project, status_code=201)
def create_project(body: ProjectCreate) -> Project:
    try:
        row = projects.create_project(
            name=body.name,
            description=body.description,
            city=body.city,
            metadata=body.metadata,
        )
        return _row_to_project(row)
    except PersistenceDisabledError:
        raise _unavailable() from None
    except Exception as exc:
        log.warning("POST /api/projects failed: %s", exc)
        raise HTTPException(status_code=502, detail="Persistence write failed") from exc


@router.get("/proposals", response_model=list[Proposal])
def list_proposals(
    project_id: str | None = Query(default=None, alias="projectId"),
    limit: int = Query(default=50, ge=1, le=200),
) -> list[Proposal]:
    try:
        rows = proposals.list_proposals(project_id=project_id, limit=limit)
        return [_row_to_proposal(r) for r in rows]
    except PersistenceDisabledError:
        raise _unavailable() from None
    except Exception as exc:
        log.warning("GET /api/proposals failed: %s", exc)
        raise HTTPException(status_code=502, detail="Persistence query failed") from exc


@router.post("/proposals", response_model=Proposal, status_code=201)
def create_proposal(body: ProposalCreate) -> Proposal:
    try:
        row = proposals.create_proposal(
            project_id=body.project_id,
            name=body.name,
            description=body.description,
            status=body.status,
            metadata=body.metadata,
        )
        return _row_to_proposal(row)
    except PersistenceDisabledError:
        raise _unavailable() from None
    except Exception as exc:
        log.warning("POST /api/proposals failed: %s", exc)
        raise HTTPException(status_code=502, detail="Persistence write failed") from exc


@router.get(
    "/proposals/{proposal_id}/infrastructure",
    response_model=list[ProposalInfrastructure],
)
def list_proposal_infrastructure(
    proposal_id: str,
    limit: int = Query(default=200, ge=1, le=500),
) -> list[ProposalInfrastructure]:
    try:
        rows = proposal_infrastructure.list_by_proposal(proposal_id, limit=limit)
        return [_row_to_infrastructure(r) for r in rows]
    except PersistenceDisabledError:
        raise _unavailable() from None
    except Exception as exc:
        log.warning("GET /api/proposals/%s/infrastructure failed: %s", proposal_id, exc)
        raise HTTPException(status_code=502, detail="Persistence query failed") from exc


@router.post(
    "/proposals/{proposal_id}/infrastructure",
    response_model=ProposalInfrastructure,
    status_code=201,
)
def create_proposal_infrastructure(
    proposal_id: str,
    body: ProposalInfrastructureCreate,
) -> ProposalInfrastructure:
    metadata = {
        **body.metadata,
        **{
            k: v
            for k, v in {
                "costCad": body.cost_cad,
                "status": body.status,
                "modelUrl": body.model_url,
                "placedBy": body.placed_by,
                "clientId": body.client_id,
            }.items()
            if v is not None
        },
    }
    try:
        row = proposal_infrastructure.create(
            proposal_id=proposal_id,
            kind=body.kind,
            position=body.position,
            capacity_kw=body.capacity_kw,
            zone_id=body.zone_id,
            metadata=metadata,
        )
        return _row_to_infrastructure(row)
    except PersistenceDisabledError:
        raise _unavailable() from None
    except Exception as exc:
        log.warning("POST /api/proposals/%s/infrastructure failed: %s", proposal_id, exc)
        raise HTTPException(status_code=502, detail="Persistence write failed") from exc


@router.delete("/proposals/{proposal_id}/infrastructure/{infra_id}")
def delete_proposal_infrastructure(proposal_id: str, infra_id: str) -> dict:
    try:
        ok = proposal_infrastructure.delete(infra_id)
        if not ok:
            raise HTTPException(status_code=404, detail=f"infra {infra_id} not found")
        return {"ok": True, "proposalId": proposal_id, "infraId": infra_id}
    except PersistenceDisabledError:
        raise _unavailable() from None
    except HTTPException:
        raise
    except Exception as exc:
        log.warning(
            "DELETE /api/proposals/%s/infrastructure/%s failed: %s",
            proposal_id,
            infra_id,
            exc,
        )
        raise HTTPException(status_code=502, detail="Persistence delete failed") from exc


@router.get("/proposals/{proposal_id}/snapshots", response_model=list[SimulationSnapshot])
def list_simulation_snapshots(
    proposal_id: str,
    limit: int = Query(default=50, ge=1, le=200),
) -> list[SimulationSnapshot]:
    try:
        rows = simulation_snapshots.list_by_proposal(proposal_id, limit=limit)
        return [_row_to_snapshot(r) for r in rows]
    except PersistenceDisabledError:
        raise _unavailable() from None
    except Exception as exc:
        log.warning("GET /api/proposals/%s/snapshots failed: %s", proposal_id, exc)
        raise HTTPException(status_code=502, detail="Persistence query failed") from exc


@router.post(
    "/proposals/{proposal_id}/snapshots",
    response_model=SimulationSnapshot,
    status_code=201,
)
def create_simulation_snapshot(
    proposal_id: str,
    body: SimulationSnapshotCreate,
) -> SimulationSnapshot:
    try:
        row = simulation_snapshots.create(
            proposal_id=proposal_id,
            tick=body.tick,
            metrics=body.metrics,
            scenarios=body.scenarios,
            infrastructure=body.infrastructure,
        )
        return _row_to_snapshot(row)
    except PersistenceDisabledError:
        raise _unavailable() from None
    except Exception as exc:
        log.warning("POST /api/proposals/%s/snapshots failed: %s", proposal_id, exc)
        raise HTTPException(status_code=502, detail="Persistence write failed") from exc


@router.get(
    "/proposals/{proposal_id}/snapshots/latest",
    response_model=SimulationSnapshot,
)
def get_latest_simulation_snapshot(proposal_id: str) -> SimulationSnapshot:
    try:
        row = simulation_snapshots.get_latest(proposal_id)
        if row is None:
            raise HTTPException(status_code=404, detail="No snapshots found")
        return _row_to_snapshot(row)
    except PersistenceDisabledError:
        raise _unavailable() from None
    except HTTPException:
        raise
    except Exception as exc:
        log.warning("GET /api/proposals/%s/snapshots/latest failed: %s", proposal_id, exc)
        raise HTTPException(status_code=502, detail="Persistence query failed") from exc


@router.get("/assets/definitions", response_model=list[AssetDefinition])
def list_asset_definitions(
    project_id: str | None = Query(default=None, alias="projectId"),
    limit: int = Query(default=50, ge=1, le=200),
) -> list[AssetDefinition]:
    try:
        rows = assets.list_definitions(project_id=project_id, limit=limit)
        return [_row_to_asset(r) for r in rows]
    except PersistenceDisabledError:
        raise _unavailable() from None
    except Exception as exc:
        log.warning("GET /api/assets/definitions failed: %s", exc)
        raise HTTPException(status_code=502, detail="Persistence query failed") from exc


@router.post("/assets/definitions", response_model=AssetDefinition, status_code=201)
def create_asset_definition(body: AssetDefinitionCreate) -> AssetDefinition:
    try:
        row = assets.create_definition(
            name=body.name,
            kind=body.kind,
            project_id=body.project_id,
            spec=body.spec,
        )
        return _row_to_asset(row)
    except PersistenceDisabledError:
        raise _unavailable() from None
    except Exception as exc:
        log.warning("POST /api/assets/definitions failed: %s", exc)
        raise HTTPException(status_code=502, detail="Persistence write failed") from exc


@router.post("/datasets/upload", response_model=UploadedDataset, status_code=201)
async def upload_dataset(
    request: Request,
    project_id: str | None = Query(default=None, alias="projectId"),
    proposal_id: str | None = Query(default=None, alias="proposalId"),
    filename: str = Query(default="upload.csv", min_length=1, max_length=240),
    dataset_type: str | None = Query(default=None, alias="datasetType"),
) -> UploadedDataset:
    if not project_id and not proposal_id:
        raise HTTPException(
            status_code=422,
            detail="Provide projectId and/or proposalId for dataset upload",
        )
    try:
        body = await request.body()
        parsed = parse_upload(
            filename=filename,
            content_type=request.headers.get("content-type"),
            body=body,
            dataset_type=dataset_type,
        )
        row = datasets.create_dataset(
            project_id=project_id,
            proposal_id=proposal_id,
            name=parsed.name,
            dataset_type=parsed.dataset_type,
            file_type=parsed.file_type,
            row_count=parsed.row_count,
            feature_count=parsed.feature_count,
            columns=parsed.columns,
            preview=parsed.preview,
            metadata=parsed.metadata,
        )
        return _row_to_dataset(row)
    except DatasetValidationError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except PersistenceDisabledError:
        raise _unavailable() from None
    except Exception as exc:
        log.warning("POST /api/datasets/upload failed: %s", exc)
        raise HTTPException(status_code=502, detail="Dataset persistence failed") from exc


@router.get("/projects/{project_id}/datasets", response_model=list[UploadedDataset])
def list_project_datasets(
    project_id: str,
    limit: int = Query(default=50, ge=1, le=200),
) -> list[UploadedDataset]:
    try:
        rows = datasets.list_datasets(project_id=project_id, limit=limit)
        return [_row_to_dataset(r) for r in rows]
    except PersistenceDisabledError:
        raise _unavailable() from None
    except Exception as exc:
        log.warning("GET /api/projects/%s/datasets failed: %s", project_id, exc)
        raise HTTPException(status_code=502, detail="Persistence query failed") from exc


@router.get("/proposals/{proposal_id}/datasets", response_model=list[UploadedDataset])
def list_proposal_datasets(
    proposal_id: str,
    limit: int = Query(default=50, ge=1, le=200),
) -> list[UploadedDataset]:
    try:
        rows = datasets.list_datasets(proposal_id=proposal_id, limit=limit)
        return [_row_to_dataset(r) for r in rows]
    except PersistenceDisabledError:
        raise _unavailable() from None
    except Exception as exc:
        log.warning("GET /api/proposals/%s/datasets failed: %s", proposal_id, exc)
        raise HTTPException(status_code=502, detail="Persistence query failed") from exc


@router.get("/datasets/{dataset_id}", response_model=UploadedDataset)
def get_dataset(dataset_id: str) -> UploadedDataset:
    try:
        row = datasets.get_dataset(dataset_id)
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
        ok = datasets.delete_dataset(dataset_id)
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
