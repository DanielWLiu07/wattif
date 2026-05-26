"""Uploaded existing infrastructure assets (Phase 15 — read-only context)."""

from __future__ import annotations

import logging
from typing import Any

from .base import PersistenceDisabledError, table

log = logging.getLogger("wattif.db.uploaded_infrastructure")

TABLE = "uploaded_infrastructure_assets"


def list_assets(
    *,
    project_id: str | None = None,
    proposal_id: str | None = None,
    dataset_id: str | None = None,
    limit: int = 500,
) -> list[dict[str, Any]]:
    try:
        q = table(TABLE).select("*").order("created_at", desc=True).limit(limit)
        if project_id:
            q = q.eq("project_id", project_id)
        if proposal_id:
            q = q.eq("proposal_id", proposal_id)
        if dataset_id:
            q = q.eq("dataset_id", dataset_id)
        resp = q.execute()
        return resp.data or []
    except PersistenceDisabledError:
        raise
    except Exception as exc:
        log.warning("list_assets failed: %s", exc)
        raise


def create_assets_batch(
    assets: list[dict[str, Any]],
    *,
    project_id: str | None,
    proposal_id: str | None,
    dataset_id: str,
) -> list[dict[str, Any]]:
    if not assets:
        return []
    rows = []
    for a in assets:
        rows.append(
            {
                "project_id": project_id,
                "proposal_id": proposal_id,
                "dataset_id": dataset_id,
                "asset_kind": a["asset_kind"],
                "source_type": a.get("source_type", "upload"),
                "name": a.get("name"),
                "address": a.get("address"),
                "latitude": a["latitude"],
                "longitude": a["longitude"],
                "zone_id": a.get("zone_id"),
                "status": a.get("status"),
                "operator": a.get("operator"),
                "capacity_kw": a.get("capacity_kw"),
                "power_kw": a.get("power_kw"),
                "charger_type": a.get("charger_type"),
                "metadata": a.get("metadata") or {},
                "source_row_index": a.get("source_row_index"),
            }
        )
    try:
        resp = table(TABLE).insert(rows).execute()
        return resp.data or []
    except PersistenceDisabledError:
        raise
    except Exception as exc:
        log.warning("create_assets_batch failed: %s", exc)
        raise


def delete_by_dataset(dataset_id: str) -> int:
    try:
        resp = table(TABLE).delete().eq("dataset_id", dataset_id).execute()
        return len(resp.data or [])
    except PersistenceDisabledError:
        raise
    except Exception as exc:
        log.warning("delete_by_dataset failed: %s", exc)
        raise
