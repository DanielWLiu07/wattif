"""Simulation snapshot repository — manual proposal state saves."""

from __future__ import annotations

import logging
from typing import Any

from .base import PersistenceDisabledError, table

log = logging.getLogger("wattif.db.simulation_snapshots")

TABLE = "simulation_snapshots"


def list_by_proposal(
    proposal_id: str,
    *,
    limit: int = 50,
) -> list[dict[str, Any]]:
    try:
        resp = (
            table(TABLE)
            .select("*")
            .eq("proposal_id", proposal_id)
            .order("created_at", desc=True)
            .limit(limit)
            .execute()
        )
        return resp.data or []
    except PersistenceDisabledError:
        raise
    except Exception as exc:
        log.warning("list_by_proposal failed: %s", exc)
        raise


def get_latest(proposal_id: str) -> dict[str, Any] | None:
    try:
        resp = (
            table(TABLE)
            .select("*")
            .eq("proposal_id", proposal_id)
            .order("created_at", desc=True)
            .limit(1)
            .execute()
        )
        rows = resp.data or []
        return rows[0] if rows else None
    except PersistenceDisabledError:
        raise
    except Exception as exc:
        log.warning("get_latest failed: %s", exc)
        raise


def create(
    *,
    proposal_id: str,
    tick: int,
    metrics: dict[str, Any] | None = None,
    scenarios: list[dict[str, Any]] | None = None,
    infrastructure: list[dict[str, Any]] | None = None,
) -> dict[str, Any]:
    row = {
        "proposal_id": proposal_id,
        "tick": tick,
        "metrics": metrics or {},
        "scenarios": scenarios or [],
        "infrastructure": infrastructure or [],
    }
    try:
        resp = table(TABLE).insert(row).execute()
        if not resp.data:
            raise RuntimeError("insert returned no rows")
        return resp.data[0]
    except PersistenceDisabledError:
        raise
    except Exception as exc:
        log.warning("create snapshot failed: %s", exc)
        raise
