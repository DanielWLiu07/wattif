"""Persistence REST routes (Phase 2) — Supabase-backed when configured."""

from __future__ import annotations

import logging

from fastapi import APIRouter, HTTPException, Query

from ..db.repositories.base import PersistenceDisabledError
from ..db.repositories import assets, projects, proposals
from ..persistence_models import (
    AssetDefinition,
    AssetDefinitionCreate,
    PersistenceUnavailableResponse,
    Project,
    ProjectCreate,
    Proposal,
    ProposalCreate,
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
