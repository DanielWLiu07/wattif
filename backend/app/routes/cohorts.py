"""Cohort profile and structured concern routes (Phase 8)."""

from __future__ import annotations

import logging
from typing import Any

from fastapi import APIRouter, HTTPException, Query

from ..cohort_context import fetch_concern_summaries
from ..data.concern_generator import generate_cohorts_and_concerns
from ..db.repositories import agents as agents_repo
from ..db.repositories import datasets as datasets_repo
from ..db.repositories import proposal_infrastructure
from ..db.repositories.base import PersistenceDisabledError
from ..persistence_models import (
    CohortConcern,
    CohortGenerateResponse,
    CohortProfile,
    PersistenceUnavailableResponse,
)

log = logging.getLogger("wattif.routes.cohorts")

router = APIRouter(prefix="/api", tags=["cohorts"])

_UNAVAILABLE = PersistenceUnavailableResponse()


def _unavailable() -> HTTPException:
    return HTTPException(
        status_code=503,
        detail=_UNAVAILABLE.model_dump(by_alias=True),
    )


def _row_to_cohort(row: dict) -> CohortProfile:
    priorities = row.get("priorities") or []
    dataset_ids = row.get("dataset_ids") or []
    if not isinstance(priorities, list):
        priorities = []
    if not isinstance(dataset_ids, list):
        dataset_ids = []
    return CohortProfile(
        id=row["id"],
        project_id=row.get("project_id"),
        proposal_id=row.get("proposal_id"),
        name=row["name"],
        cohort_type=row.get("cohort_type") or row.get("archetype") or "generic_residents",
        zone_id=row.get("zone_id"),
        description=row.get("description"),
        priorities=[str(p) for p in priorities],
        dataset_ids=[str(d) for d in dataset_ids],
        confidence=row.get("confidence"),
        metadata=row.get("metadata") or row.get("context") or {},
        created_at=row.get("created_at"),
        updated_at=row.get("updated_at"),
    )


def _row_to_concern(row: dict) -> CohortConcern:
    evidence = row.get("evidence") or []
    if not isinstance(evidence, list):
        detail = row.get("detail") or {}
        evidence = detail.get("evidence") or []
    ds_ids = row.get("related_dataset_ids") or []
    infra_ids = row.get("related_infra_ids") or []
    return CohortConcern(
        id=row["id"],
        cohort_id=row.get("agent_profile_id") or "",
        project_id=row.get("project_id"),
        proposal_id=row.get("proposal_id"),
        severity=row.get("severity") or "medium",
        stance=row.get("stance") or "neutral",
        topic=row.get("topic") or row.get("concern_type") or "planning",
        summary=row.get("summary") or "",
        evidence=[str(e) for e in evidence],
        related_dataset_ids=[str(d) for d in ds_ids],
        related_infra_ids=[str(i) for i in infra_ids],
        metadata=row.get("metadata") or row.get("detail") or {},
        created_at=row.get("created_at"),
    )


def _load_datasets(project_id: str, proposal_id: str | None) -> list[dict[str, Any]]:
    merged: dict[str, dict] = {}
    for row in datasets_repo.list_datasets(project_id=project_id, limit=100):
        merged[row["id"]] = row
    if proposal_id:
        for row in datasets_repo.list_datasets(proposal_id=proposal_id, limit=100):
            merged[row["id"]] = row
    return list(merged.values())


@router.post(
    "/projects/{project_id}/cohorts/generate",
    response_model=CohortGenerateResponse,
)
def generate_cohorts(
    project_id: str,
    proposal_id: str | None = Query(default=None, alias="proposalId"),
) -> CohortGenerateResponse:
    try:
        datasets = _load_datasets(project_id, proposal_id)
        infra_rows: list[dict] = []
        if proposal_id:
            infra_rows = proposal_infrastructure.list_by_proposal(proposal_id, limit=200)

        agents_repo.delete_generated_profiles(
            project_id=project_id, proposal_id=proposal_id
        )

        cohort_rows, concern_specs = generate_cohorts_and_concerns(
            project_id=project_id,
            proposal_id=proposal_id,
            datasets=datasets,
            proposal_infrastructure=infra_rows,
        )

        saved_cohorts: list[CohortProfile] = []
        cohort_id_by_type: dict[str, str] = {}
        for c in cohort_rows:
            row = agents_repo.create_profile(
                project_id=project_id,
                proposal_id=c.get("proposal_id"),
                name=c["name"],
                archetype=c.get("cohort_type"),
                cohort_type=c.get("cohort_type"),
                zone_id=c.get("zone_id"),
                description=c.get("description"),
                priorities=c.get("priorities"),
                dataset_ids=c.get("dataset_ids"),
                confidence=c.get("confidence"),
                context=c.get("context"),
                metadata=c.get("metadata"),
            )
            saved_cohorts.append(_row_to_cohort(row))
            cohort_id_by_type[c["cohort_type"]] = row["id"]

        saved_concerns: list[CohortConcern] = []
        for spec in concern_specs:
            spec = dict(spec)
            ct = spec.pop("cohort_type", "generic_residents")
            profile_id = cohort_id_by_type.get(ct)
            if not profile_id:
                continue
            row = agents_repo.create_concern(
                agent_profile_id=profile_id,
                project_id=project_id,
                proposal_id=spec.get("proposal_id"),
                concern_type=spec.get("topic"),
                topic=spec.get("topic"),
                summary=spec.get("summary"),
                severity=spec.get("severity"),
                stance=spec.get("stance"),
                evidence=spec.get("evidence"),
                related_dataset_ids=spec.get("related_dataset_ids"),
                related_infra_ids=spec.get("related_infra_ids"),
                detail=spec.get("detail"),
                metadata=spec.get("metadata"),
            )
            saved_concerns.append(_row_to_concern(row))

        return CohortGenerateResponse(
            cohorts=saved_cohorts,
            concerns=saved_concerns,
            datasets_used=len(datasets),
        )
    except PersistenceDisabledError:
        raise _unavailable() from None
    except Exception as exc:
        log.warning("POST /api/projects/%s/cohorts/generate failed: %s", project_id, exc)
        raise HTTPException(status_code=502, detail="Cohort generation failed") from exc


@router.get("/projects/{project_id}/cohorts", response_model=list[CohortProfile])
def list_project_cohorts(
    project_id: str,
    limit: int = Query(default=50, ge=1, le=200),
) -> list[CohortProfile]:
    try:
        rows = agents_repo.list_profiles(project_id=project_id, limit=limit)
        return [_row_to_cohort(r) for r in rows]
    except PersistenceDisabledError:
        raise _unavailable() from None
    except Exception as exc:
        log.warning("GET /api/projects/%s/cohorts failed: %s", project_id, exc)
        raise HTTPException(status_code=502, detail="Persistence query failed") from exc


@router.get("/proposals/{proposal_id}/cohorts", response_model=list[CohortProfile])
def list_proposal_cohorts(
    proposal_id: str,
    limit: int = Query(default=50, ge=1, le=200),
) -> list[CohortProfile]:
    try:
        rows = agents_repo.list_profiles(proposal_id=proposal_id, limit=limit)
        return [_row_to_cohort(r) for r in rows]
    except PersistenceDisabledError:
        raise _unavailable() from None
    except Exception as exc:
        log.warning("GET /api/proposals/%s/cohorts failed: %s", proposal_id, exc)
        raise HTTPException(status_code=502, detail="Persistence query failed") from exc


@router.get("/projects/{project_id}/concerns", response_model=list[CohortConcern])
def list_project_concerns(
    project_id: str,
    limit: int = Query(default=100, ge=1, le=300),
) -> list[CohortConcern]:
    try:
        rows = agents_repo.list_concerns(project_id=project_id, limit=limit)
        return [_row_to_concern(r) for r in rows]
    except PersistenceDisabledError:
        raise _unavailable() from None
    except Exception as exc:
        log.warning("GET /api/projects/%s/concerns failed: %s", project_id, exc)
        raise HTTPException(status_code=502, detail="Persistence query failed") from exc


@router.get("/proposals/{proposal_id}/concerns", response_model=list[CohortConcern])
def list_proposal_concerns(
    proposal_id: str,
    limit: int = Query(default=100, ge=1, le=300),
) -> list[CohortConcern]:
    try:
        rows = agents_repo.list_concerns(proposal_id=proposal_id, limit=limit)
        return [_row_to_concern(r) for r in rows]
    except PersistenceDisabledError:
        raise _unavailable() from None
    except Exception as exc:
        log.warning("GET /api/proposals/%s/concerns failed: %s", proposal_id, exc)
        raise HTTPException(status_code=502, detail="Persistence query failed") from exc


@router.get(
    "/projects/{project_id}/concerns/context",
    response_model=list[dict],
)
def project_concerns_context(project_id: str) -> list[dict]:
    return fetch_concern_summaries(project_id=project_id)


@router.delete("/concerns/{concern_id}")
def delete_concern(concern_id: str) -> dict:
    try:
        ok = agents_repo.delete_concern(concern_id)
        if not ok:
            raise HTTPException(status_code=404, detail=f"concern {concern_id} not found")
        return {"ok": True, "concernId": concern_id}
    except PersistenceDisabledError:
        raise _unavailable() from None
    except HTTPException:
        raise
    except Exception as exc:
        log.warning("DELETE /api/concerns/%s failed: %s", concern_id, exc)
        raise HTTPException(status_code=502, detail="Persistence delete failed") from exc
