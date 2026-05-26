"""Uploaded dataset repository — skeleton (metadata registry only)."""

from __future__ import annotations

import logging
from typing import Any

from .base import PersistenceDisabledError, table

log = logging.getLogger("wattif.db.datasets")

TABLE = "uploaded_datasets"


def list_datasets(
    *,
    project_id: str | None = None,
    proposal_id: str | None = None,
    limit: int = 50,
) -> list[dict[str, Any]]:
    try:
        q = table(TABLE).select("*").order("created_at", desc=True).limit(limit)
        if project_id:
            q = q.eq("project_id", project_id)
        if proposal_id:
            q = q.eq("proposal_id", proposal_id)
        resp = q.execute()
        return resp.data or []
    except PersistenceDisabledError:
        raise
    except Exception as exc:
        log.warning("list_datasets failed: %s", exc)
        raise


def get_dataset(dataset_id: str) -> dict[str, Any] | None:
    try:
        resp = table(TABLE).select("*").eq("id", dataset_id).maybe_single().execute()
        return resp.data
    except PersistenceDisabledError:
        raise
    except Exception as exc:
        log.warning("get_dataset failed: %s", exc)
        raise


def create_dataset(
    *,
    name: str,
    dataset_type: str,
    file_type: str,
    project_id: str | None = None,
    proposal_id: str | None = None,
    row_count: int | None = None,
    feature_count: int | None = None,
    columns: list[str] | None = None,
    preview: list[dict[str, Any]] | None = None,
    metadata: dict[str, Any] | None = None,
) -> dict[str, Any]:
    row = {
        "project_id": project_id,
        "proposal_id": proposal_id,
        "name": name,
        "dataset_type": dataset_type,
        "file_type": file_type,
        "row_count": row_count,
        "feature_count": feature_count,
        "columns": columns or [],
        "preview": preview or [],
        "metadata": metadata or {},
    }
    try:
        resp = table(TABLE).insert(row).execute()
        if not resp.data:
            raise RuntimeError("insert returned no rows")
        return resp.data[0]
    except PersistenceDisabledError:
        raise
    except Exception as exc:
        log.warning("create_dataset failed: %s", exc)
        raise


def delete_dataset(dataset_id: str) -> bool:
    try:
        resp = table(TABLE).delete().eq("id", dataset_id).execute()
        return bool(resp.data)
    except PersistenceDisabledError:
        raise
    except Exception as exc:
        log.warning("delete_dataset failed: %s", exc)
        raise
