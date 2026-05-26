"""Read-only WattIf planning copilot turns (Phase 15 operator fix)."""

from __future__ import annotations

import re
from typing import TYPE_CHECKING, Any, AsyncIterator

from .planner_intent import PlannerIntent, intent_label

if TYPE_CHECKING:
    from .planner import PlannerChat

COPILOT_INTENTS: frozenset[PlannerIntent] = frozenset(
    {
        "read_uploaded_infrastructure",
        "summarize_datasets",
        "explain_concerns",
        "critique_design",
        "general_wattif_question",
    }
)


def is_copilot_intent(intent: PlannerIntent) -> bool:
    return intent in COPILOT_INTENTS


async def run_copilot_turn(
    intent: PlannerIntent,
    chat: PlannerChat,
    user_message: str,
) -> AsyncIterator[dict]:
    """Answer from WattIf context without mutating infrastructure."""
    yield {
        "type": "thought",
        "text": (
            f"Copilot mode ({intent_label(intent)}): answering from project context "
            "without placing or optimizing infrastructure."
        ),
    }

    if intent == "read_uploaded_infrastructure":
        async for ev in _read_uploaded_infra(chat, user_message):
            yield ev
    elif intent == "summarize_datasets":
        async for ev in _summarize_datasets(chat):
            yield ev
    elif intent == "explain_concerns":
        async for ev in _explain_concerns(chat):
            yield ev
    elif intent == "critique_design":
        async for ev in _critique_design(chat):
            yield ev
    else:
        async for ev in _general_answer(chat, user_message):
            yield ev


async def _read_uploaded_infra(chat: PlannerChat, user_message: str) -> AsyncIterator[dict]:
    from .existing_infra_context import (
        fetch_uploaded_infrastructure,
        format_uploaded_assets_detailed,
    )

    assets = fetch_uploaded_infrastructure(
        project_id=chat.project_id, proposal_id=chat.proposal_id
    )
    t = (user_message or "").lower()
    kind = "ev_charger" if re.search(r"\b(charger|chargers|ev)\b", t) else None
    body = format_uploaded_assets_detailed(assets, asset_kind=kind)
    yield {"type": "answer", "text": body}
    yield {
        "type": "done",
        "summary": body,
        "placements": chat.tools.placements,
        "spentCad": round(chat.tools.spent, 2),
    }


async def _summarize_datasets(chat: PlannerChat) -> AsyncIterator[dict]:
    from .dataset_context import fetch_dataset_summaries, format_summaries_detailed

    summaries = fetch_dataset_summaries(
        project_id=chat.project_id, proposal_id=chat.proposal_id
    )
    body = format_summaries_detailed(summaries)
    yield {"type": "answer", "text": body}
    yield {
        "type": "done",
        "summary": body,
        "placements": chat.tools.placements,
        "spentCad": round(chat.tools.spent, 2),
    }


async def _explain_concerns(chat: PlannerChat) -> AsyncIterator[dict]:
    from .cohort_context import fetch_concern_summaries, format_concerns_for_prompt

    concerns = fetch_concern_summaries(
        project_id=chat.project_id, proposal_id=chat.proposal_id
    )
    if not concerns:
        body = (
            "No synthetic cohort concerns found for this project/proposal. "
            "Generate concerns from uploaded datasets in the Saved tab first."
        )
    else:
        header = (
            "Synthetic cohort concerns (decision-support only — NOT real residents, "
            "NOT public consultation):\n\n"
        )
        sorted_c = sorted(
            concerns,
            key=lambda c: {"high": 0, "medium": 1, "low": 2}.get(
                str(c.get("severity", "medium")).lower(), 1
            ),
        )
        lines = [header + format_concerns_for_prompt(sorted_c)]
        severe = [c for c in sorted_c if str(c.get("severity", "")).lower() == "high"]
        if severe:
            topics = ", ".join(
                dict.fromkeys(
                    str(c.get("topic") or "planning") for c in severe[:5]
                )
            )
            lines.append(f"\nMost severe topics: {topics}.")
        body = "\n".join(lines)
    yield {"type": "answer", "text": body}
    yield {
        "type": "done",
        "summary": body,
        "placements": chat.tools.placements,
        "spentCad": round(chat.tools.spent, 2),
    }


async def _critique_design(chat: PlannerChat) -> AsyncIterator[dict]:
    from .cohort_context import fetch_concern_summaries, fetch_proposal_infra_summary
    from .existing_infra_context import fetch_uploaded_infrastructure

    concerns = fetch_concern_summaries(
        project_id=chat.project_id, proposal_id=chat.proposal_id
    )
    proposal_infra = fetch_proposal_infra_summary(proposal_id=chat.proposal_id)
    uploaded = fetch_uploaded_infrastructure(
        project_id=chat.project_id, proposal_id=chat.proposal_id
    )
    metrics = chat.tools.execute("get_metrics", {})

    yield {"type": "tool_call", "name": "get_metrics", "args": {}}
    yield {"type": "tool_result", "name": "get_metrics", "result": metrics}

    lines = [
        "Proposal critique (advisory — no placements made):",
        f"- Simulation: {metrics.get('coveragePct', 0) * 100:.1f}% coverage, "
        f"{metrics.get('equityScore', 0) * 100:.0f}% equity, "
        f"{metrics.get('approvalPct', 0) * 100:.0f}% approval.",
    ]
    if proposal_infra:
        counts: dict[str, int] = {}
        for row in proposal_infra:
            k = row.get("kind") or "unknown"
            counts[k] = counts.get(k, 0) + 1
        lines.append(
            "- Proposed infrastructure: "
            + ", ".join(f"{k}×{n}" for k, n in sorted(counts.items()))
            + "."
        )
    else:
        lines.append("- Proposed infrastructure: none persisted for this proposal yet.")

    if uploaded:
        lines.append(
            f"- Uploaded existing inventory: {len(uploaded)} point(s) for context "
            "(not counted as proposed)."
        )
    if concerns:
        top = sorted(
            concerns,
            key=lambda c: {"high": 0, "medium": 1, "low": 2}.get(
                str(c.get("severity", "medium")).lower(), 1
            ),
        )[:3]
        for c in top:
            lines.append(
                f"- Concern ({c.get('severity', 'medium')} / {c.get('topic', 'planning')}): "
                f"{(c.get('summary') or '')[:160]}"
            )
    else:
        lines.append("- No synthetic cohort concerns loaded — critique is metrics-only.")

    weak: list[str] = []
    if metrics.get("equityScore", 1) < 0.45:
        weak.append("equity score is low relative to high-burden zones")
    if metrics.get("approvalPct", 1) < 0.5:
        weak.append("public approval may be fragile")
    if not proposal_infra:
        weak.append("proposal has no persisted placements to evaluate")
    if concerns and any(str(c.get("severity")).lower() == "high" for c in concerns):
        weak.append("high-severity synthetic concerns are unresolved")
    if weak:
        lines.append("\nLikely weaknesses: " + "; ".join(weak) + ".")
    else:
        lines.append(
            "\nNo major red flags from metrics alone — review uploaded data and concerns for nuance."
        )
    lines.append(
        "\nAsk me to recommend changes or explicitly request placement when ready to mutate the proposal."
    )
    body = "\n".join(lines)
    yield {"type": "answer", "text": body}
    yield {
        "type": "done",
        "summary": body,
        "placements": chat.tools.placements,
        "spentCad": round(chat.tools.spent, 2),
    }


async def _general_answer(chat: PlannerChat, user_message: str) -> AsyncIterator[dict]:
    """Best-effort context answer without tools that mutate or optimize."""
    parts: list[str] = [
        "WattIf planning copilot — I can summarize datasets, list uploaded infrastructure, "
        "explain synthetic cohort concerns, critique your proposal, or recommend changes. "
        "I only place/build infrastructure when you explicitly ask.",
    ]
    if chat.dataset_context:
        parts.append("\nCurrent project context:\n" + chat.dataset_context[:2000])
    else:
        parts.append(
            "\nSelect a project/proposal and upload datasets in the Saved tab for richer answers."
        )
    body = "\n".join(parts)
    yield {"type": "answer", "text": body}
    yield {
        "type": "done",
        "summary": body,
        "placements": chat.tools.placements,
        "spentCad": round(chat.tools.spent, 2),
    }


async def run_recommendation_turn(
    chat: PlannerChat,
    user_message: str,
    confirm,
) -> AsyncIterator[dict]:
    """Recommendations without auto-placement unless explicit placement intent."""

    async for ev in chat._concern_recommendation_turn(
        user_message, confirm, auto_place=False
    ):
        yield ev
