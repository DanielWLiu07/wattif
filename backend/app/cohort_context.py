"""Dataset-grounded cohort concern context for planner/operator (Phase 8)."""

from __future__ import annotations

import logging
from typing import Any

from .db.repositories import agents as agents_repo
from .db.repositories.base import PersistenceDisabledError

log = logging.getLogger("wattif.cohort_context")


def _concern_summary_from_row(row: dict[str, Any], cohort_name: str | None = None) -> dict[str, Any]:
    evidence = row.get("evidence") or []
    if not isinstance(evidence, list):
        evidence = []
    return {
        "id": row.get("id"),
        "cohortId": row.get("agent_profile_id"),
        "cohortName": cohort_name,
        "severity": row.get("severity"),
        "stance": row.get("stance"),
        "topic": row.get("topic") or row.get("concern_type"),
        "summary": row.get("summary"),
        "evidence": evidence[:3],
        "relatedDatasetIds": row.get("related_dataset_ids") or [],
    }


def fetch_concern_summaries(
    *,
    project_id: str | None = None,
    proposal_id: str | None = None,
    limit: int = 30,
) -> list[dict[str, Any]]:
    """Lightweight concern summaries for planner; empty when persistence disabled."""
    if not project_id and not proposal_id:
        return []
    try:
        profiles = agents_repo.list_profiles(project_id=project_id, limit=100)
        if proposal_id:
            profiles = [
                p
                for p in profiles
                if p.get("proposal_id") == proposal_id or not p.get("proposal_id")
            ]
        name_by_id = {p["id"]: p.get("name") for p in profiles}
        concerns = agents_repo.list_concerns(
            project_id=project_id,
            proposal_id=proposal_id,
            limit=limit,
        )
        out = []
        for c in concerns:
            cid = c.get("agent_profile_id")
            out.append(
                _concern_summary_from_row(c, name_by_id.get(cid) if cid else None)
            )
        return out
    except PersistenceDisabledError:
        return []
    except Exception as exc:
        log.warning("fetch_concern_summaries failed: %s", exc)
        return []


def format_concerns_for_prompt(summaries: list[dict[str, Any]]) -> str:
    if not summaries:
        return ""
    lines = [
        "Dataset-grounded synthetic cohort concerns (decision-support only — NOT real residents, "
        "NOT validated public consultation):"
    ]
    for s in summaries:
        parts = [
            s.get("cohortName") or "cohort",
            f"topic={s.get('topic', 'planning')}",
            f"stance={s.get('stance', 'neutral')}",
            f"severity={s.get('severity', 'medium')}",
        ]
        if s.get("summary"):
            parts.append(str(s["summary"])[:200])
        lines.append("- " + "; ".join(parts))
    lines.append(
        "Treat these as synthetic signals from uploaded dataset previews. Do not claim they are "
        "real people unless the dataset explicitly represents public feedback."
    )
    return "\n".join(lines)


def build_planner_context(
    *,
    project_id: str | None = None,
    proposal_id: str | None = None,
) -> str | None:
    """Combine Phase 7 dataset + Phase 8 cohort concern context for the planner."""
    from .dataset_context import fetch_dataset_summaries, format_summaries_for_prompt

    parts: list[str] = []
    ds = format_summaries_for_prompt(
        fetch_dataset_summaries(project_id=project_id, proposal_id=proposal_id)
    )
    if ds:
        parts.append(ds)
    cc = format_concerns_for_prompt(
        fetch_concern_summaries(project_id=project_id, proposal_id=proposal_id)
    )
    if cc:
        parts.append(cc)
    return "\n\n".join(parts) if parts else None
