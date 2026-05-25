"""Centralized Supabase client — returns None when persistence is not configured."""

from __future__ import annotations

import logging
from typing import Any

from .. import config

log = logging.getLogger("wattif.db")

_client: Any | None = None
_init_attempted = False


def supabase_available() -> bool:
    """True when env vars are set and a client was obtained (or can be)."""
    return get_supabase_client() is not None


def get_supabase_client() -> Any | None:
    """Return a cached Supabase client, or None if not configured / import fails."""
    global _client, _init_attempted

    if not config.supabase_enabled():
        return None

    if _init_attempted:
        return _client

    _init_attempted = True
    try:
        from supabase import create_client

        _client = create_client(config.SUPABASE_URL, config.SUPABASE_SERVICE_ROLE_KEY)
        log.info("Supabase client initialized (persistence=supabase)")
    except Exception as exc:  # noqa: BLE001 — demo must keep running
        log.warning(
            "Supabase client unavailable (%s); falling back to in-memory persistence",
            exc,
        )
        _client = None

    return _client
