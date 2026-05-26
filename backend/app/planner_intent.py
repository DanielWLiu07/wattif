"""Planner intent routing and mutation guard (Phase 15 copilot fix)."""

from __future__ import annotations

import re
from typing import Literal

PlannerIntent = Literal[
    "read_uploaded_infrastructure",
    "summarize_datasets",
    "explain_concerns",
    "critique_design",
    "recommendation",
    "explicit_placement",
    "general_wattif_question",
]

MUTATING_TOOL_NAMES = frozenset(
    {"place_infrastructure", "remove_infrastructure", "launch_program"}
)

# Tools blocked for read-only / advisory intents (optimize only as placement prelude).
BLOCKED_NON_PLACEMENT_TOOLS = MUTATING_TOOL_NAMES | frozenset({"optimize"})

_READ_UPLOADED_PATTERNS = (
    r"where are (?:the )?(?:infra|infrastructure) points",
    r"list uploaded (?:existing )?infrastructure",
    r"show uploaded (?:ev )?chargers?",
    r"what chargers? did i upload",
    r"where are the existing chargers?",
    r"what existing infrastructure",
    r"uploaded (?:ev )?charger points?",
    r"infra points in (?:the )?uploaded dataset",
    r"points in (?:my|the) uploaded",
)

_SUMMARIZE_DATASETS_PATTERNS = (
    r"summarize (?:my )?datasets?",
    r"what datasets? did i upload",
    r"what is in my uploaded data",
    r"describe (?:my )?uploaded datasets?",
    r"uploaded dataset summary",
)

_EXPLAIN_CONCERNS_PATTERNS = (
    r"why are (?:the )?(?:agents|residents|cohorts?) concerned",
    r"what are (?:the )?(?:synthetic )?cohort concerns",
    r"what concerns are most severe",
    r"explain (?:the )?(?:synthetic )?(?:cohort )?concerns?",
    r"synthetic concerns?",
)

_CRITIQUE_PATTERNS = (
    r"what is wrong with (?:my )?design",
    r"what(?:'s| is) wrong with (?:this )?proposal",
    r"weaknesses? in (?:this )?proposal",
    r"what would a planner object to",
    r"equity risks?",
    r"critique (?:my )?(?:design|proposal)",
)

_RECOMMENDATION_PATTERNS = (
    r"what should (?:i|we) change",
    r"where should we add more",
    r"recommend improvements?",
    r"based on uploaded chargers?",
    r"what should we change in this proposal",
    r"what tradeoffs should i mention",
    r"suggest improvements?",
    r"what should i add for",
    r"how do we reduce opposition",
    r"improve (?:this )?proposal based on",
    r"address (?:the )?(?:uploaded )?(?:feedback|concern)",
    r"based on (?:resident )?concern",
    r"use (?:resident )?concerns? to recommend",
    r"recommend infrastructure changes",
)

_EXPLICIT_PLACEMENT_PATTERNS = (
    r"\bplace\b",
    r"\bauto[- ]place\b",
    r"\bbuild the (?:top|recommended)",
    r"\bbuild out\b",
    r"\badd the recommended",
    r"\binstall\b",
    r"\bdeploy\b",
    r"\bmaximize (?:coverage|equity|renewable)",
    r"\bput (?:up|in)\b.*\b(?:solar|wind|battery|microgrid|ev charger|chargers)\b",
    r"\badd\b.*\b(?:solar|wind|battery|microgrid|ev charger|chargers|storage)\b",
    r"\bbuild\b.*\b(?:solar|wind|battery|microgrid|ev charger|chargers|microgrids|renewables?)\b",
)

_EXPLICIT_INTENT_MAP: dict[str, PlannerIntent] = {
    "concern_recommendation": "recommendation",
    "concern": "recommendation",
    "address_concerns": "recommendation",
    "explicit_placement": "explicit_placement",
    "placement": "explicit_placement",
    "read_uploaded_infrastructure": "read_uploaded_infrastructure",
    "summarize_datasets": "summarize_datasets",
    "explain_concerns": "explain_concerns",
    "critique_design": "critique_design",
    "recommendation": "recommendation",
}


def _matches(text: str, patterns: tuple[str, ...]) -> bool:
    return any(re.search(p, text) for p in patterns)


def classify_planner_intent(
    text: str,
    explicit_intent: str | None = None,
) -> PlannerIntent:
    """Route user messages to copilot intent buckets before tool selection."""
    if explicit_intent:
        mapped = _EXPLICIT_INTENT_MAP.get(explicit_intent.lower().strip())
        if mapped:
            return mapped

    t = (text or "").lower().strip()
    if not t:
        return "general_wattif_question"

    if _matches(t, _READ_UPLOADED_PATTERNS):
        return "read_uploaded_infrastructure"

    if _matches(t, _SUMMARIZE_DATASETS_PATTERNS):
        return "summarize_datasets"

    if _matches(t, _RECOMMENDATION_PATTERNS):
        return "recommendation"

    if _matches(t, _EXPLAIN_CONCERNS_PATTERNS):
        return "explain_concerns"

    if _matches(t, _CRITIQUE_PATTERNS):
        return "critique_design"

    # Explicit placement wins when user clearly asks to mutate the world.
    if _matches(t, _EXPLICIT_PLACEMENT_PATTERNS):
        return "explicit_placement"

    return "general_wattif_question"


def allows_mutation(intent: PlannerIntent) -> bool:
    """Only explicit placement may mutate proposal/sim state via tools."""
    return intent == "explicit_placement"


def allows_tool(intent: PlannerIntent, tool_name: str) -> bool:
    """Mutation guard for planner tool execution."""
    if tool_name in MUTATING_TOOL_NAMES:
        return allows_mutation(intent)
    if tool_name == "optimize" and intent != "explicit_placement":
        return intent == "recommendation"
    return True


def intent_label(intent: PlannerIntent) -> str:
    return intent.replace("_", " ")
