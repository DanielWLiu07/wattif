"""Synthetic resident reaction routes (Phase 16)."""

from __future__ import annotations

import logging

from fastapi import APIRouter, HTTPException, Query

from ..db.repositories import proposals as proposals_repo
from ..db.repositories import synthetic_resident_reactions as reactions_repo
from ..db.repositories.base import PersistenceDisabledError
from ..persistence_models import (
    PersistenceUnavailableResponse,
    SyntheticResidentReaction,
    SyntheticResidentReactionGenerateResponse,
)
from ..synthetic_resident_reactions import generate_synthetic_resident_reactions

log = logging.getLogger("wattif.routes.resident_reactions")

router = APIRouter(prefix="/api", tags=["resident-reactions"])

_UNAVAILABLE = PersistenceUnavailableResponse()


def _unavailable() -> HTTPException:
    return HTTPException(
        status_code=503,
        detail=_UNAVAILABLE.model_dump(by_alias=True),
    )


def _row_to_reaction(row: dict) -> SyntheticResidentReaction:
    return SyntheticResidentReaction(
        id=row["id"],
        project_id=row["project_id"],
        proposal_id=row.get("proposal_id"),
        cohort_id=row.get("cohort_id"),
        concern_id=row.get("concern_id"),
        reaction_type=row.get("reaction_type") or "llm_synthetic_reaction",
        persona_label=row.get("persona_label"),
        stance=row.get("stance") or "neutral",
        summary=row.get("summary") or "",
        key_concern=row.get("key_concern"),
        suggested_change=row.get("suggested_change"),
        evidence=row.get("evidence"),
        confidence=row.get("confidence"),
        caveat=row.get("caveat") or "",
        source_context=row.get("source_context") or {},
        provider=row.get("provider"),
        model=row.get("model"),
        created_at=row.get("created_at"),
    )


@router.get(
    "/projects/{project_id}/resident-reactions",
    response_model=list[SyntheticResidentReaction],
)
def list_project_resident_reactions(
    project_id: str,
    limit: int = Query(default=100, ge=1, le=300),
) -> list[SyntheticResidentReaction]:
    try:
        rows = reactions_repo.list_by_project(project_id, limit=limit)
        return [_row_to_reaction(r) for r in rows]
    except PersistenceDisabledError:
        raise _unavailable() from None
    except Exception as exc:
        log.warning("GET project resident-reactions failed: %s", exc)
        raise HTTPException(status_code=502, detail="Persistence query failed") from exc


@router.get(
    "/proposals/{proposal_id}/resident-reactions",
    response_model=list[SyntheticResidentReaction],
)
def list_proposal_resident_reactions(
    proposal_id: str,
    limit: int = Query(default=100, ge=1, le=300),
) -> list[SyntheticResidentReaction]:
    try:
        rows = reactions_repo.list_by_proposal(proposal_id, limit=limit)
        return [_row_to_reaction(r) for r in rows]
    except PersistenceDisabledError:
        raise _unavailable() from None
    except Exception as exc:
        log.warning("GET proposal resident-reactions failed: %s", exc)
        raise HTTPException(status_code=502, detail="Persistence query failed") from exc


@router.post(
    "/proposals/{proposal_id}/resident-reactions/generate",
    response_model=SyntheticResidentReactionGenerateResponse,
)
def generate_proposal_resident_reactions(
    proposal_id: str,
    use_llm: bool = Query(default=True, alias="useLlm"),
) -> SyntheticResidentReactionGenerateResponse:
    try:
        proposal = proposals_repo.get_proposal(proposal_id)
        if proposal is None:
            raise HTTPException(status_code=404, detail="proposal_not_found")
        project_id = proposal.get("project_id")
        if not project_id:
            raise HTTPException(status_code=400, detail="proposal_missing_project")

        reactions_repo.delete_by_proposal(proposal_id)

        specs, meta = generate_synthetic_resident_reactions(
            project_id=project_id,
            proposal_id=proposal_id,
            use_llm=use_llm,
        )

        saved: list[SyntheticResidentReaction] = []
        for spec in specs:
            row = reactions_repo.create(
                project_id=project_id,
                proposal_id=proposal_id,
                cohort_id=spec.get("cohort_id"),
                concern_id=spec.get("concern_id"),
                reaction_type=spec.get("reaction_type"),
                persona_label=spec.get("persona_label"),
                stance=spec.get("stance"),
                summary=spec.get("summary"),
                key_concern=spec.get("key_concern"),
                suggested_change=spec.get("suggested_change"),
                evidence=spec.get("evidence"),
                confidence=spec.get("confidence"),
                caveat=spec.get("caveat"),
                source_context=spec.get("source_context"),
                provider=spec.get("provider"),
                model=spec.get("model"),
            )
            saved.append(_row_to_reaction(row))

        return SyntheticResidentReactionGenerateResponse(
            reactions=saved,
            provider=meta["provider"],
            model=meta["model"],
            count=meta["count"],
        )
    except PersistenceDisabledError:
        raise _unavailable() from None
    except HTTPException:
        raise
    except Exception as exc:
        log.warning("POST generate resident-reactions failed: %s", exc)
        raise HTTPException(status_code=502, detail="Reaction generation failed") from exc


@router.delete("/resident-reactions/{reaction_id}")
def delete_resident_reaction(reaction_id: str) -> dict:
    try:
        ok = reactions_repo.delete(reaction_id)
        if not ok:
            raise HTTPException(
                status_code=404, detail=f"reaction {reaction_id} not found"
            )
        return {"ok": True, "reactionId": reaction_id}
    except PersistenceDisabledError:
        raise _unavailable() from None
    except HTTPException:
        raise
    except Exception as exc:
        log.warning("DELETE resident-reaction failed: %s", exc)
        raise HTTPException(status_code=502, detail="Persistence delete failed") from exc
