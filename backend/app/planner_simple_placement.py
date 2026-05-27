"""Deterministic explicit placement for simple NL commands (Phase 17 QA fix)."""

from __future__ import annotations

import logging
import re
from typing import Any, AsyncIterator, Literal, TYPE_CHECKING

from .planner_intent import normalize_planner_input

if TYPE_CHECKING:
    from .planner import ConfirmFn, PlannerChat

log = logging.getLogger("wattif.planner.simple_placement")

PlacementTarget = Literal[
    "highest_burden",
    "low_coverage",
    "high_load",
    "vulnerable",
    "default",
]

_KIND_KEYWORDS: dict[str, tuple[str, ...]] = {
    "solar": ("solar", "panel", "panels", "rooftop", "pv"),
    "wind": ("wind", "turbine", "turbines"),
    "battery": ("battery", "batteries", "storage", "store"),
    "microgrid": ("microgrid", "micro-grid", "microgrids"),
    "ev_charger": (
        "ev charger",
        "ev chargers",
        "charging hub",
        "charging station",
        "charger",
        "chargers",
    ),
}

_TARGET_PATTERNS: dict[PlacementTarget, tuple[str, ...]] = {
    "highest_burden": (
        r"highest[- ]burden",
        r"high[- ]burden",
        r"top \d+ burden",
        r"burdened zones?",
        r"burdened neighbourhoods?",
        r"energy[- ]burden",
        r"equity[- ]target",
    ),
    "low_coverage": (
        r"where coverage is missing",
        r"coverage is missing",
        r"low coverage",
        r"missing coverage",
        r"underserved",
        r"coverage gaps?",
    ),
    "high_load": (
        r"high[- ]load",
        r"grid load",
        r"peak load",
        r"high demand",
    ),
    "vulnerable": (
        r"vulnerable zones?",
        r"vulnerable neighbourhoods?",
        r"at[- ]risk",
    ),
}

_AMBIGUITY_MARKERS = (
    r"\bconsider(?:ing)?\b",
    r"\bdepending on\b",
    r"\bunless\b",
    r"\beither\b",
    r"\btradeoff\b",
    r"\boptimally across\b",
    r"\bbalance\b",
    r"\bwithout placing\b",
)

_SIMPLE_ACTION = re.compile(
    r"\b(add|place|build|install|deploy|put)\b",
    re.I,
)


def _extract_kind(text: str) -> str | None:
    for kind, words in _KIND_KEYWORDS.items():
        if any(w in text for w in words):
            return kind
    return None


def _extract_target(text: str) -> PlacementTarget:
    for target, patterns in _TARGET_PATTERNS.items():
        if any(re.search(p, text) for p in patterns):
            return target
    if re.search(r"\b(neighbourhoods?|zones?|areas?)\b", text):
        return "highest_burden"
    return "default"


def _extract_count(text: str, *, target: PlacementTarget) -> int:
    default = 5 if target in ("highest_burden", "vulnerable", "default") else 3
    n = default
    for word, val in (
        ("one", 1),
        ("two", 2),
        ("three", 3),
        ("four", 4),
        ("five", 5),
        ("a few", 3),
        ("several", 4),
    ):
        if word in text:
            n = val
            break
    m = re.search(r"\btop\s+(\d+)\b", text)
    if m:
        n = int(m.group(1))
    else:
        m = re.search(r"\b(\d+)\b", text)
        if m:
            n = int(m.group(1))
    return max(1, min(n, 10))


def _target_label(target: PlacementTarget) -> str:
    return {
        "highest_burden": "highest energy-burden neighbourhoods",
        "low_coverage": "low-coverage areas",
        "high_load": "high grid-load neighbourhoods",
        "vulnerable": "vulnerable zones",
        "default": "priority neighbourhoods",
    }[target]


def parse_simple_explicit_placement(text: str) -> dict[str, Any] | None:
    """Return placement spec when prompt is simple enough for backend parsing."""
    t = normalize_planner_input(text)
    if not t or not _SIMPLE_ACTION.search(t):
        return None

    if any(re.search(p, t) for p in _AMBIGUITY_MARKERS):
        return None

    kind = _extract_kind(t)
    if not kind:
        return None

    # Multiple asset kinds -> defer to LLM.
    kinds_found = sum(1 for words in _KIND_KEYWORDS.values() if any(w in t for w in words))
    if kinds_found > 1:
        return None

    target = _extract_target(t)
    n = _extract_count(t, target=target)

    return {
        "kind": kind,
        "n": n,
        "target": target,
        "targetLabel": _target_label(target),
    }


def _zone_rankings(tools, target: PlacementTarget) -> dict[str, dict[str, Any]]:
    state = tools.execute("get_city_state", {})
    ranked: dict[str, dict[str, Any]] = {}
    for z in state.get("equityTargets") or []:
        ranked[z["zoneId"]] = z
    return ranked


def _sort_recommendations(
    recs: list[dict[str, Any]],
    *,
    target: PlacementTarget,
    zone_rank: dict[str, dict[str, Any]],
) -> list[dict[str, Any]]:
    if target == "low_coverage":
        return sorted(
            recs,
            key=lambda r: zone_rank.get(r.get("zoneId"), {}).get("coveragePct", 1.0),
        )
    if target in ("highest_burden", "vulnerable", "high_load", "default"):
        return sorted(
            recs,
            key=lambda r: -zone_rank.get(r.get("zoneId"), {}).get("energyBurden", 0.0),
        )
    return recs


async def run_simple_explicit_placement(
    chat: PlannerChat,
    spec: dict[str, Any],
    confirm: ConfirmFn | None,
    user_message: str,
) -> AsyncIterator[dict]:
    """Execute optimize + place without calling Featherless/LLM."""
    from .planner import _sleep
    from .planner_events import terminal_done, yield_copilot_answer

    kind = spec["kind"]
    n = spec["n"]
    target: PlacementTarget = spec["target"]
    target_label = spec["targetLabel"]

    yield {
        "type": "thought",
        "text": (
            f"Deterministic placement: adding {n} {kind.replace('_', ' ')} "
            f"in {target_label} using the backend optimizer."
        ),
    }
    await _sleep()

    note = chat.tools.protected_note()
    if note:
        yield {"type": "thought", "text": note}
        await _sleep()

    pool_n = max(n, 5)
    yield {
        "type": "tool_call",
        "name": "optimize",
        "args": {"kind": kind, "n": pool_n},
    }
    res = chat.tools.execute("optimize", {"kind": kind, "n": pool_n})
    yield {"type": "tool_result", "name": "optimize", "result": res}
    await _sleep()

    zone_rank = _zone_rankings(chat.tools, target)
    recs = _sort_recommendations(
        list(res.get("recommendations") or []),
        target=target,
        zone_rank=zone_rank,
    )

    placed = 0
    for rec in recs:
        if placed >= n or chat.tools.remaining <= 0:
            break
        async for ev in chat._place(rec, confirm):
            yield ev
            if ev.get("type") == "placement":
                placed += 1
        await _sleep()

    if placed > 0:
        yield {
            "type": "tool_call",
            "name": "run_simulation",
            "args": {"ticks": 12},
        }
        sim = chat.tools.execute("run_simulation", {"ticks": 12})
        yield {"type": "tool_result", "name": "run_simulation", "result": sim}
        m1 = sim.get("metrics", {})
        metrics_note = (
            f" Coverage {m1.get('coveragePct', 0) * 100:.1f}%, "
            f"equity {m1.get('equityScore', 0) * 100:.0f}%, "
            f"approval {m1.get('approvalPct', 0) * 100:.0f}%."
        )
    else:
        metrics_note = ""

    if placed == 0:
        body = (
            f"I could not place {kind.replace('_', ' ')} in {target_label} "
            f"(budget or site constraints). Try a smaller count or different asset type."
        )
    else:
        body = (
            f"Placed {placed} {kind.replace('_', ' ')} installation(s) in {target_label} "
            f"({chat.tools.spent:,.0f} CAD spent this session).{metrics_note}"
        )

    async for ev in yield_copilot_answer(chat, body):
        yield ev


LLM_PLACEMENT_UNAVAILABLE = (
    "The LLM provider is temporarily unavailable. I can still recommend candidate sites, "
    "but I could not complete this placement through the LLM path."
)
