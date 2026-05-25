"""Agent profile / concern repositories — skeleton for Phase 3+."""

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
    limit: int = 50,
) -> list[dict[str, Any]]:
    try:
        q = table(PROFILES).select("*").order("created_at", desc=True).limit(limit)
        if project_id:
            q = q.eq("project_id", project_id)
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


def list_concerns(
    *,
    proposal_id: str | None = None,
    limit: int = 50,
) -> list[dict[str, Any]]:
    try:
        q = table(CONCERNS).select("*").order("created_at", desc=True).limit(limit)
        if proposal_id:
            q = q.eq("proposal_id", proposal_id)
        resp = q.execute()
        return resp.data or []
    except PersistenceDisabledError:
        raise
    except Exception as exc:
        log.warning("list_concerns failed: %s", exc)
        raise
