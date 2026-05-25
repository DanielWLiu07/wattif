"""Asset definition repository — minimal create/list/get."""

from __future__ import annotations

import logging
from typing import Any

from .base import PersistenceDisabledError, table

log = logging.getLogger("wattif.db.assets")

TABLE = "asset_definitions"


def list_definitions(
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
        log.warning("list_definitions failed: %s", exc)
        raise


def get_definition(asset_id: str) -> dict[str, Any] | None:
    try:
        resp = table(TABLE).select("*").eq("id", asset_id).maybe_single().execute()
        return resp.data
    except PersistenceDisabledError:
        raise
    except Exception as exc:
        log.warning("get_definition failed: %s", exc)
        raise


def create_definition(
    *,
    name: str,
    kind: str,
    project_id: str | None = None,
    spec: dict | None = None,
) -> dict[str, Any]:
    row = {
        "name": name,
        "kind": kind,
        "project_id": project_id,
        "spec": spec or {},
    }
    try:
        resp = table(TABLE).insert(row).execute()
        if not resp.data:
            raise RuntimeError("insert returned no rows")
        return resp.data[0]
    except PersistenceDisabledError:
        raise
    except Exception as exc:
        log.warning("create_definition failed: %s", exc)
        raise
