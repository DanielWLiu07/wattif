"""Optional Supabase persistence (Phase 2)."""

from .supabase_client import get_supabase_client, supabase_available

__all__ = ["get_supabase_client", "supabase_available"]
