"""Proposal infrastructure repository — persisted placements for a proposal."""

from __future__ import annotations

import logging
from typing import Any

from .base import PersistenceDisabledError, table

log = logging.getLogger("wattif.db.proposal_infrastructure")

TABLE = "proposal_infrastructure"


def list_by_proposal(
    proposal_id: str,
    *,
    limit: int = 200,
) -> list[dict[str, Any]]:
    try:
        resp = (
            table(TABLE)
            .select("*")
            .eq("proposal_id", proposal_id)
            .order("created_at", desc=False)
            .limit(limit)
            .execute()
        )
        return resp.data or []
    except PersistenceDisabledError:
        raise
    except Exception as exc:
        log.warning("list_by_proposal failed: %s", exc)
        raise


def create(
    *,
    proposal_id: str,
    kind: str,
    position: list[float] | tuple[float, float] | None = None,
    capacity_kw: float | None = None,
    zone_id: str | None = None,
    metadata: dict[str, Any] | None = None,
) -> dict[str, Any]:
    row = {
        "proposal_id": proposal_id,
        "kind": kind,
        "zone_id": zone_id,
        "position": list(position) if position is not None else None,
        "capacity_kw": capacity_kw,
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
        log.warning("create proposal infrastructure failed: %s", exc)
        raise


def update_metadata(infra_id: str, metadata: dict[str, Any]) -> dict[str, Any]:
    try:
        resp = table(TABLE).update({"metadata": metadata}).eq("id", infra_id).execute()
        if not resp.data:
            raise RuntimeError("update returned no rows")
        return resp.data[0]
    except PersistenceDisabledError:
        raise
    except Exception as exc:
        log.warning("update_metadata failed: %s", exc)
        raise


def delete(infra_id: str) -> bool:
    try:
        resp = table(TABLE).delete().eq("id", infra_id).execute()
        return bool(resp.data)
    except PersistenceDisabledError:
        raise
    except Exception as exc:
        log.warning("delete proposal infrastructure failed: %s", exc)
        raise
