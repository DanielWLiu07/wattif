"""Shared persistence helpers for repository modules."""

from __future__ import annotations

import logging
from typing import Any

from ..supabase_client import get_supabase_client

log = logging.getLogger("wattif.db")


class PersistenceDisabledError(Exception):
    """Raised when Supabase is not configured or client init failed."""


def require_client() -> Any:
    client = get_supabase_client()
    if client is None:
        raise PersistenceDisabledError("Supabase persistence is not configured")
    return client


def table(name: str):
    return require_client().table(name)
