"""Shared planner event helpers — canonical terminal semantics (Phase 15)."""

from __future__ import annotations

from typing import Any, AsyncIterator, TYPE_CHECKING

if TYPE_CHECKING:
    from .planner import PlannerChat


def terminal_done(
    chat: PlannerChat,
    *,
    summary: str | None = None,
    recommendation: dict[str, Any] | None = None,
    final_message_sent: bool = False,
) -> dict[str, Any]:
    """Emit a terminal done event.

    When an answer/recommendation/error already carried user-visible text,
    omit summary so the client does not render duplicate final messages.
    """
    ev: dict[str, Any] = {
        "type": "done",
        "placements": chat.tools.placements,
        "spentCad": round(chat.tools.spent, 2),
    }
    if recommendation is not None:
        ev["recommendation"] = recommendation
    if summary and not final_message_sent:
        ev["summary"] = summary
    return ev


async def yield_copilot_answer(
    chat: PlannerChat, body: str
) -> AsyncIterator[dict]:
    """Canonical copilot finish: one answer + one terminal done (no duplicate text)."""
    yield {"type": "answer", "text": body}
    yield terminal_done(chat, final_message_sent=True)
