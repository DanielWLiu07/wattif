"""Proposal repository — minimal create/list/get."""

from __future__ import annotations

import logging
from typing import Any

from .base import PersistenceDisabledError, table

log = logging.getLogger("wattif.db.proposals")

TABLE = "proposals"


def list_proposals(
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
        log.warning("list_proposals failed: %s", exc)
        raise


def get_proposal(proposal_id: str) -> dict[str, Any] | None:
    try:
        resp = table(TABLE).select("*").eq("id", proposal_id).maybe_single().execute()
        return resp.data
    except PersistenceDisabledError:
        raise
    except Exception as exc:
        log.warning("get_proposal failed: %s", exc)
        raise


def create_proposal(
    *,
    project_id: str,
    name: str,
    description: str | None = None,
    status: str = "draft",
    metadata: dict | None = None,
) -> dict[str, Any]:
    row = {
        "project_id": project_id,
        "name": name,
        "description": description,
        "status": status,
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
        log.warning("create_proposal failed: %s", exc)
        raise
