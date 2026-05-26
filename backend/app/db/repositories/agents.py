"""Agent profile / concern repositories — cohort persistence (Phase 8)."""

from __future__ import annotations

import logging
from typing import Any

from .base import PersistenceDisabledError, table

log = logging.getLogger("wattif.db.agents")

PROFILES = "agent_profiles"
CONCERNS = "agent_concerns"


def list_profiles(
    *,
    project_id: str | None = None,
    proposal_id: str | None = None,
    limit: int = 50,
) -> list[dict[str, Any]]:
    try:
        q = table(PROFILES).select("*").order("created_at", desc=True).limit(limit)
        if project_id:
            q = q.eq("project_id", project_id)
        if proposal_id:
            q = q.eq("proposal_id", proposal_id)
        resp = q.execute()
        return resp.data or []
    except PersistenceDisabledError:
        raise
    except Exception as exc:
        log.warning("list_profiles failed: %s", exc)
        raise


def get_profile(profile_id: str) -> dict[str, Any] | None:
    try:
        resp = (
            table(PROFILES).select("*").eq("id", profile_id).maybe_single().execute()
        )
        return resp.data
    except PersistenceDisabledError:
        raise
    except Exception as exc:
        log.warning("get_profile failed: %s", exc)
        raise


def create_profile(**fields: Any) -> dict[str, Any]:
    row = {k: v for k, v in fields.items() if v is not None}
    try:
        resp = table(PROFILES).insert(row).execute()
        if not resp.data:
            raise RuntimeError("insert returned no rows")
        return resp.data[0]
    except PersistenceDisabledError:
        raise
    except Exception as exc:
        log.warning("create_profile failed: %s", exc)
        raise


def delete_generated_profiles(*, project_id: str, proposal_id: str | None = None) -> int:
    """Remove previously auto-generated cohort profiles (cascades concerns)."""
    try:
        q = table(PROFILES).select("id").eq("project_id", project_id)
        if proposal_id:
            q = q.eq("proposal_id", proposal_id)
        rows = q.execute().data or []
        deleted = 0
        for row in rows:
            pid = row["id"]
            prof = get_profile(pid)
            if not prof:
                continue
            meta = prof.get("metadata") or {}
            if not meta.get("generated"):
                continue
            table(PROFILES).delete().eq("id", pid).execute()
            deleted += 1
        return deleted
    except PersistenceDisabledError:
        raise
    except Exception as exc:
        log.warning("delete_generated_profiles failed: %s", exc)
        raise


def list_concerns(
    *,
    project_id: str | None = None,
    proposal_id: str | None = None,
    profile_id: str | None = None,
    limit: int = 100,
) -> list[dict[str, Any]]:
    try:
        q = table(CONCERNS).select("*").order("created_at", desc=True).limit(limit)
        if project_id:
            q = q.eq("project_id", project_id)
        if proposal_id:
            q = q.eq("proposal_id", proposal_id)
        if profile_id:
            q = q.eq("agent_profile_id", profile_id)
        resp = q.execute()
        return resp.data or []
    except PersistenceDisabledError:
        raise
    except Exception as exc:
        log.warning("list_concerns failed: %s", exc)
        raise


def create_concern(**fields: Any) -> dict[str, Any]:
    row = {k: v for k, v in fields.items() if v is not None}
    try:
        resp = table(CONCERNS).insert(row).execute()
        if not resp.data:
            raise RuntimeError("insert returned no rows")
        return resp.data[0]
    except PersistenceDisabledError:
        raise
    except Exception as exc:
        log.warning("create_concern failed: %s", exc)
        raise


def delete_concern(concern_id: str) -> bool:
    try:
        resp = table(CONCERNS).delete().eq("id", concern_id).execute()
        return bool(resp.data)
    except PersistenceDisabledError:
        raise
    except Exception as exc:
        log.warning("delete_concern failed: %s", exc)
        raise
