"""Planner run repository — skeleton (log persisted planner output)."""

from __future__ import annotations

import logging
from typing import Any

from .base import PersistenceDisabledError, table

log = logging.getLogger("wattif.db.planner_runs")

TABLE = "planner_runs"


def list_runs(
    *,
    proposal_id: str | None = None,
    limit: int = 50,
) -> list[dict[str, Any]]:
    try:
        q = table(TABLE).select("*").order("created_at", desc=True).limit(limit)
        if proposal_id:
            q = q.eq("proposal_id", proposal_id)
        resp = q.execute()
        return resp.data or []
    except PersistenceDisabledError:
        raise
    except Exception as exc:
        log.warning("list_runs failed: %s", exc)
        raise


def get_run(run_id: str) -> dict[str, Any] | None:
    try:
        resp = table(TABLE).select("*").eq("id", run_id).maybe_single().execute()
        return resp.data
    except PersistenceDisabledError:
        raise
    except Exception as exc:
        log.warning("get_run failed: %s", exc)
        raise
