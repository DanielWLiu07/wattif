"""Read-only WattIf planning copilot turns (Phase 15 operator fix)."""

from __future__ import annotations

import re
from typing import TYPE_CHECKING, AsyncIterator

from .planner_intent import PlannerIntent, intent_label

if TYPE_CHECKING:
    from .planner import PlannerChat

COPILOT_INTENTS: frozenset[PlannerIntent] = frozenset(
    {
        "read_uploaded_infrastructure",
        "summarize_datasets",
        "explain_concerns",
        "critique_design",
        "resilience_scenario",
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
    elif intent == "resilience_scenario":
        async for ev in _resilience_scenario(chat, user_message):
            yield ev
    else:
        async for ev in _general_answer(chat, user_message):
            yield ev


async def _read_uploaded_infra(chat: PlannerChat, user_message: str) -> AsyncIterator[dict]:
    from .existing_infra_context import (
        fetch_uploaded_infrastructure,
        format_uploaded_assets_detailed,
    )
    from .planner_events import yield_copilot_answer

    assets = fetch_uploaded_infrastructure(
        project_id=chat.project_id, proposal_id=chat.proposal_id
    )
    t = (user_message or "").lower()
    kind = "ev_charger" if re.search(r"\b(charger|chargers|ev)\b", t) else None
    body = format_uploaded_assets_detailed(assets, asset_kind=kind)
    async for ev in yield_copilot_answer(chat, body):
        yield ev


async def _summarize_datasets(chat: PlannerChat) -> AsyncIterator[dict]:
    from .dataset_context import fetch_dataset_summaries, format_summaries_detailed
    from .planner_events import yield_copilot_answer

    summaries = fetch_dataset_summaries(
        project_id=chat.project_id, proposal_id=chat.proposal_id
    )
    body = format_summaries_detailed(summaries)
    async for ev in yield_copilot_answer(chat, body):
        yield ev


async def _explain_concerns(chat: PlannerChat) -> AsyncIterator[dict]:
    from .cohort_context import fetch_concern_summaries, format_concerns_for_prompt
    from .evidence_retrieval import format_evidence_for_prompt, retrieve_evidence_for_context
    from .planner_events import yield_copilot_answer

    concerns = fetch_concern_summaries(
        project_id=chat.project_id, proposal_id=chat.proposal_id
    )
    evidence = retrieve_evidence_for_context(
        project_id=chat.project_id,
        proposal_id=chat.proposal_id,
        user_message="why are agents concerned resident feedback",
        intent="explain_concerns",
        limit=5,
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
        if evidence:
            lines.append("\n" + format_evidence_for_prompt(evidence, max_snippets=5))
        body = "\n".join(lines)
    async for ev in yield_copilot_answer(chat, body):
        yield ev


async def _critique_design(chat: PlannerChat) -> AsyncIterator[dict]:
    from .cohort_context import fetch_concern_summaries, fetch_proposal_infra_summary
    from .existing_infra_context import fetch_uploaded_infrastructure
    from .evidence_retrieval import format_evidence_for_prompt, retrieve_evidence_for_context
    from .planner_events import yield_copilot_answer

    concerns = fetch_concern_summaries(
        project_id=chat.project_id, proposal_id=chat.proposal_id
    )
    evidence = retrieve_evidence_for_context(
        project_id=chat.project_id,
        proposal_id=chat.proposal_id,
        user_message="what is wrong with my design uploaded evidence feedback",
        intent="critique_design",
        limit=5,
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

    if evidence:
        lines.append("\nUploaded evidence signals:")
        for s in evidence[:5]:
            text = (s.get("chunkText") or "")[:180]
            dtype = s.get("datasetType") or "dataset"
            lines.append(f"- [{dtype}] {text}")

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
    async for ev in yield_copilot_answer(chat, body):
        yield ev


async def _resilience_scenario(
    chat: PlannerChat, user_message: str
) -> AsyncIterator[dict]:
    """Stress-test / resilience planning without requiring cohort concerns or mutations."""
    from .cohort_context import fetch_concern_summaries
    from .existing_infra_context import fetch_uploaded_infrastructure
    from .planner_events import yield_copilot_answer

    t = (user_message or "").lower()
    if "blackout" in t:
        scenario = "blackout"
        focus = "outage islands, microgrids, and battery backup for critical loads"
    elif "ev surge" in t or "ev load" in t:
        scenario = "ev_surge"
        focus = "EV-charger load management, timed charging, and peak-shaving storage"
    elif "heat" in t:
        scenario = "heatwave"
        focus = (
            "summer peak load, cooling-centre support, solar+battery hubs, and demand response"
        )
    else:
        scenario = "general"
        focus = "coverage gaps, equity-weighted resilience, and staged storage/microgrid anchors"

    yield {"type": "tool_call", "name": "get_metrics", "args": {}}
    metrics = chat.tools.execute("get_metrics", {})
    yield {"type": "tool_result", "name": "get_metrics", "result": metrics}

    yield {"type": "tool_call", "name": "get_city_state", "args": {}}
    state = chat.tools.execute("get_city_state", {})
    yield {"type": "tool_result", "name": "get_city_state", "result": state}

    concerns = fetch_concern_summaries(
        project_id=chat.project_id, proposal_id=chat.proposal_id
    )
    uploaded = fetch_uploaded_infrastructure(
        project_id=chat.project_id, proposal_id=chat.proposal_id
    )
    top_targets = state.get("equityTargets", [])[:3]
    target_names = ", ".join(z.get("name", "?") for z in top_targets) or "high-burden zones"

    lines = [
        f"Grid resilience plan for {scenario.replace('_', ' ')} (advisory — no placements made):",
        f"- Current metrics: {metrics.get('coveragePct', 0) * 100:.1f}% coverage, "
        f"{metrics.get('equityScore', 0) * 100:.0f}% equity, "
        f"{metrics.get('approvalPct', 0) * 100:.0f}% approval.",
        f"- Focus: {focus}.",
        f"- Priority zones: {target_names}.",
    ]
    if uploaded:
        lines.append(
            f"- Uploaded existing infrastructure: {len(uploaded)} point(s) for context "
            "(overlay only — not proposed)."
        )
    actions = [
        "Add battery storage near high-burden zones to shave summer/winter peaks.",
        "Designate a community microgrid anchor (cooling centre, hospital corridor, or shelter).",
        "Run a heatwave or blackout stress-test scenario before scaling EV charger clusters.",
        "Pair demand-response messaging with any new EV load — stagger charging away from peak hours.",
    ]
    if scenario == "ev_surge":
        actions.insert(
            0,
            "Audit uploaded charger geography for clusters that could overload local feeders.",
        )
    elif scenario == "blackout":
        actions.insert(
            0,
            "Map critical facilities and ensure at least one islanded microgrid/battery hub per cluster.",
        )
    lines.append("\nRecommended actions (suggest only — ask explicitly to place/build):")
    for i, action in enumerate(actions[:5], start=1):
        lines.append(f"{i}. {action}")
    if not concerns:
        lines.append(
            "\nNo synthetic cohort concerns are loaded, so this is not concern-grounded."
        )
    else:
        lines.append(
            f"\nNote: {len(concerns)} synthetic cohort concern(s) available for deeper grounding "
            "if you ask for concern-based recommendations."
        )
    lines.append(
        "\nAsk me to place batteries/microgrids explicitly when you are ready to mutate the proposal."
    )
    body = "\n".join(lines)
    async for ev in yield_copilot_answer(chat, body):
        yield ev


async def _general_answer(chat: PlannerChat, user_message: str) -> AsyncIterator[dict]:
    """Best-effort context answer without tools that mutate or optimize."""
    from .planner_events import yield_copilot_answer

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
    async for ev in yield_copilot_answer(chat, body):
        yield ev


async def run_recommendation_turn(
    chat: PlannerChat,
    user_message: str,
    confirm,
) -> AsyncIterator[dict]:
    """Recommendations without auto-placement unless explicit placement intent."""
    from .cohort_context import fetch_concern_summaries
    from .concern_recommendations import is_concern_improvement_intent

    concerns = fetch_concern_summaries(
        project_id=chat.project_id, proposal_id=chat.proposal_id
    )
    if concerns or is_concern_improvement_intent(user_message):
        async for ev in chat._concern_recommendation_turn(
            user_message, confirm, auto_place=False
        ):
            yield ev
        return

    async for ev in _recommendation_without_concerns(chat, user_message):
        yield ev


async def _recommendation_without_concerns(
    chat: PlannerChat, user_message: str
) -> AsyncIterator[dict]:
    """Suggest improvements from metrics/uploaded infra when no cohort concerns exist."""
    from .dataset_context import fetch_dataset_summaries, format_summaries_detailed
    from .existing_infra_context import (
        fetch_uploaded_infrastructure,
        summarize_uploaded_existing_infra,
    )
    from .planner_events import yield_copilot_answer

    yield {
        "type": "thought",
        "text": (
            "Recommendation mode: reviewing metrics and uploaded context "
            "(no auto-placement)."
        ),
    }
    datasets = fetch_dataset_summaries(
        project_id=chat.project_id, proposal_id=chat.proposal_id
    )
    uploaded = fetch_uploaded_infrastructure(
        project_id=chat.project_id, proposal_id=chat.proposal_id
    )
    yield {"type": "tool_call", "name": "get_metrics", "args": {}}
    metrics = chat.tools.execute("get_metrics", {})
    yield {"type": "tool_result", "name": "get_metrics", "result": metrics}

    t = (user_message or "").lower()
    lines = [
        "Recommendations (advisory — no placements made):",
        f"- Metrics: {metrics.get('coveragePct', 0) * 100:.1f}% coverage, "
        f"{metrics.get('equityScore', 0) * 100:.0f}% equity.",
    ]
    if uploaded:
        lines.append(summarize_uploaded_existing_infra(uploaded))
    if datasets:
        lines.append(format_summaries_detailed(datasets))
    if re.search(r"ev|charger", t):
        lines.append(
            "- Suggest adding EV chargers in coverage gaps near uploaded inventory clusters, "
            "favouring off-street lots to reduce parking conflict."
        )
        lines.append(
            "- Consider battery storage upstream of dense charger clusters before scaling Level 3 hubs."
        )
    else:
        lines.append(
            "- Prioritize high energy-burden, under-served zones for the next infrastructure tranche."
        )
    lines.append(
        "\nNo synthetic cohort concerns are loaded — these are heuristic recommendations. "
        "Ask explicitly to place/build when ready to mutate the proposal."
    )
    body = "\n".join(lines)
    async for ev in yield_copilot_answer(chat, body):
        yield ev
