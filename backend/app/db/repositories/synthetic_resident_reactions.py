"""Synthetic resident reaction persistence (Phase 16)."""

from __future__ import annotations

import logging
from typing import Any

from .base import PersistenceDisabledError, table

log = logging.getLogger("wattif.db.synthetic_resident_reactions")

TABLE = "synthetic_resident_reactions"


def list_by_project(
    project_id: str,
    *,
    limit: int = 100,
) -> list[dict[str, Any]]:
    try:
        resp = (
            table(TABLE)
            .select("*")
            .eq("project_id", project_id)
            .order("created_at", desc=True)
            .limit(limit)
            .execute()
        )
        return resp.data or []
    except PersistenceDisabledError:
        raise
    except Exception as exc:
        log.warning("list_by_project synthetic reactions failed: %s", exc)
        raise


def list_by_proposal(
    proposal_id: str,
    *,
    limit: int = 100,
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
        log.warning("list_by_proposal synthetic reactions failed: %s", exc)
        raise


def create(**fields: Any) -> dict[str, Any]:
    row = {k: v for k, v in fields.items() if v is not None}
    try:
        resp = table(TABLE).insert(row).execute()
        if not resp.data:
            raise RuntimeError("insert returned no rows")
        return resp.data[0]
    except PersistenceDisabledError:
        raise
    except Exception as exc:
        log.warning("create synthetic reaction failed: %s", exc)
        raise


def delete(reaction_id: str) -> bool:
    try:
        resp = table(TABLE).delete().eq("id", reaction_id).execute()
        return bool(resp.data)
    except PersistenceDisabledError:
        raise
    except Exception as exc:
        log.warning("delete synthetic reaction failed: %s", exc)
        raise


def delete_by_proposal(proposal_id: str) -> int:
    """Remove all reactions for a proposal (regeneration)."""
    try:
        rows = (
            table(TABLE)
            .select("id")
            .eq("proposal_id", proposal_id)
            .execute()
            .data
            or []
        )
        for row in rows:
            table(TABLE).delete().eq("id", row["id"]).execute()
        return len(rows)
    except PersistenceDisabledError:
        raise
    except Exception as exc:
        log.warning("delete_by_proposal synthetic reactions failed: %s", exc)
        raise
