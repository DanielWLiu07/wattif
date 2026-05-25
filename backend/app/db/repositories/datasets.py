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
    limit: int = 50,
) -> list[dict[str, Any]]:
    try:
        q = table(TABLE).select("*").order("created_at", desc=True).limit(limit)
        if project_id:
            q = q.eq("project_id", project_id)
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
