"""Central planner turn dispatch with intent gate (Phase 15)."""

from __future__ import annotations

import logging
import uuid
from typing import AsyncIterator, TYPE_CHECKING

from .planner_intent import (
    PlannerIntent,
    classify_planner_intent,
    is_deterministic_intent,
)

if TYPE_CHECKING:
    from .planner import ConfirmFn, PlannerChat

log = logging.getLogger("wattif.planner.dispatch")

BLOCKED_MUTATION_ANSWER = (
    "I can recommend changes, but I will not place infrastructure unless you "
    "explicitly ask me to add/place/build it."
)


async def dispatch_planner_turn(
    chat: PlannerChat,
    user_message: str,
    confirm: ConfirmFn | None = None,
    intent: str | None = None,
    *,
    turn_id: str | None = None,
) -> AsyncIterator[dict]:
    """Single entry for intent classification and routing before any LLM call."""
    from .planner_copilot import (
        is_copilot_intent,
        run_copilot_turn,
        run_recommendation_turn,
    )
    from .planner import parse_intent

    tid = turn_id or str(uuid.uuid4())
    chat.turn_count += 1
    bucket: PlannerIntent = classify_planner_intent(user_message, intent)
    chat.tools.guard_intent = bucket

    log.info(
        "planner turn %s intent=%s deterministic=%s provider=%s",
        tid,
        bucket,
        is_deterministic_intent(bucket),
        chat.provider,
    )

    def _stamp(ev: dict) -> dict:
        ev["turnId"] = tid
        ev["intent"] = bucket
        return ev

    try:
        if is_copilot_intent(bucket):
            async for ev in run_copilot_turn(bucket, chat, user_message):
                yield _stamp(ev)
            return

        if bucket == "recommendation":
            async for ev in run_recommendation_turn(chat, user_message, confirm):
                yield _stamp(ev)
            return

        if bucket == "explicit_placement":
            chat.tools.guard_intent = "explicit_placement"
            parsed = parse_intent(user_message)
            if parsed.get("program"):
                async for ev in chat._demo_program_turn(parsed, confirm):
                    yield _stamp(ev)
                return
            if chat.provider in (None, "demo"):
                async for ev in chat._demo_turn(user_message, confirm):
                    yield _stamp(ev)
            else:
                try:
                    async for ev in chat._llm_turn(user_message, confirm):
                        yield _stamp(ev)
                except Exception as exc:  # noqa: BLE001
                    log.warning("LLM chat turn failed (%s); using demo turn", exc)
                    async for ev in chat._demo_turn(user_message, confirm):
                        yield _stamp(ev)
            return

        async for ev in run_copilot_turn(
            "general_wattif_question", chat, user_message
        ):
            yield _stamp(ev)
    except Exception as exc:  # noqa: BLE001
        log.exception("planner turn failed")
        yield _stamp({"type": "error", "message": str(exc)})
        yield _stamp(
            {
                "type": "done",
                "placements": chat.tools.placements,
                "spentCad": round(chat.tools.spent, 2),
            }
        )


async def collect_planner_turn(
    chat: PlannerChat,
    user_message: str,
    *,
    intent: str | None = None,
    turn_id: str | None = None,
) -> list[dict]:
    """Run one turn and return all events (REST helper)."""
    out: list[dict] = []
    async for ev in dispatch_planner_turn(
        chat, user_message, confirm=None, intent=intent, turn_id=turn_id
    ):
        out.append(ev)
    return out
