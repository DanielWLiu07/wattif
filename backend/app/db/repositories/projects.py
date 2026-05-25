"""Project repository — minimal create/list/get."""

from __future__ import annotations

import logging
from typing import Any

from .base import PersistenceDisabledError, table

log = logging.getLogger("wattif.db.projects")

TABLE = "projects"


def list_projects(limit: int = 50) -> list[dict[str, Any]]:
    try:
        resp = table(TABLE).select("*").order("created_at", desc=True).limit(limit).execute()
        return resp.data or []
    except PersistenceDisabledError:
        raise
    except Exception as exc:
        log.warning("list_projects failed: %s", exc)
        raise


def get_project(project_id: str) -> dict[str, Any] | None:
    try:
        resp = table(TABLE).select("*").eq("id", project_id).maybe_single().execute()
        return resp.data
    except PersistenceDisabledError:
        raise
    except Exception as exc:
        log.warning("get_project failed: %s", exc)
        raise


def create_project(
    *,
    name: str,
    description: str | None = None,
    city: str = "Toronto",
    metadata: dict | None = None,
) -> dict[str, Any]:
    row = {
        "name": name,
        "description": description,
        "city": city,
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
        log.warning("create_project failed: %s", exc)
        raise
