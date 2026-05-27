"""Lightweight uploaded-dataset context for planner/operator (Phase 7).

Future Phase 8 resident/cohort agents should import `fetch_dataset_summaries` and
`format_summaries_for_prompt` rather than duplicating Supabase access.
"""

from __future__ import annotations

import logging
from typing import Any

from .db.repositories import datasets as datasets_repo
from .db.repositories.base import PersistenceDisabledError

log = logging.getLogger("wattif.dataset_context")


def _summary_from_row(row: dict[str, Any]) -> dict[str, Any]:
    meta = row.get("metadata") or {}
    columns = row.get("columns") or []
    col_names = columns if isinstance(columns, list) else []
    return {
        "id": row.get("id"),
        "name": row.get("name"),
        "datasetType": row.get("dataset_type"),
        "fileType": row.get("file_type"),
        "rowCount": row.get("row_count"),
        "featureCount": row.get("feature_count"),
        "columns": col_names[:20],
        "detectedType": meta.get("detectedType"),
        "createdAt": row.get("created_at") or row.get("uploaded_at"),
    }


def fetch_dataset_summaries(
    *,
    project_id: str | None = None,
    proposal_id: str | None = None,
    limit: int = 20,
) -> list[dict[str, Any]]:
    """Return lightweight dataset summaries; empty when persistence is disabled."""
    if not project_id and not proposal_id:
        return []
    try:
        rows = datasets_repo.list_datasets(
            project_id=project_id,
            proposal_id=proposal_id,
            limit=limit,
        )
        return [_summary_from_row(r) for r in rows]
    except PersistenceDisabledError:
        return []
    except Exception as exc:
        log.warning("fetch_dataset_summaries failed: %s", exc)
        return []


def format_summaries_for_prompt(summaries: list[dict[str, Any]]) -> str:
    if not summaries:
        return ""
    lines = [
        "Uploaded project datasets (context only — do NOT assume they rebuilt the simulation):"
    ]
    for s in summaries:
        parts = [s.get("name") or "dataset", f"type={s.get('datasetType', 'generic')}"]
        if s.get("rowCount") is not None:
            parts.append(f"rows={s['rowCount']}")
        if s.get("featureCount") is not None:
            parts.append(f"features={s['featureCount']}")
        cols = s.get("columns") or []
        if cols:
            parts.append(f"columns={', '.join(str(c) for c in cols[:8])}")
        lines.append("- " + "; ".join(parts))
    lines.append(
        "Use these as planning context only. They do not auto-regenerate zones, agents, or demand."
    )
    return "\n".join(lines)


def format_summaries_detailed(summaries: list[dict[str, Any]]) -> str:
    """Expanded dataset summary for operator read-only answers."""
    if not summaries:
        return (
            "No uploaded datasets found for this project/proposal. "
            "Upload CSV/JSON/GeoJSON in the Saved tab to add planner context."
        )
    lines = [
        f"Uploaded datasets ({len(summaries)} total) — context only, simulation unchanged:"
    ]
    for i, s in enumerate(summaries, start=1):
        name = s.get("name") or "dataset"
        dtype = s.get("datasetType") or s.get("dataset_type") or "generic"
        parts = [f"{i}. {name}", f"type={dtype}"]
        if s.get("rowCount") is not None:
            parts.append(f"rows={s['rowCount']}")
        if s.get("featureCount") is not None:
            parts.append(f"features={s['featureCount']}")
        cols = s.get("columns") or []
        if cols:
            parts.append(f"columns={', '.join(str(c) for c in cols[:10])}")
        ext = s.get("extractedExistingInfrastructureCount")
        if ext is None:
            meta = s.get("metadata") or {}
            ext = meta.get("infraExtraction", {}).get(
                "extracted_existing_infrastructure_count"
            )
        if ext:
            parts.append(f"extracted_infra_points={ext}")
        lines.append(" — ".join(parts))
    lines.append(
        "Dataset previews inform the operator; they do not rebuild Toronto zones/agents/simulation."
    )
    return "\n".join(lines)
