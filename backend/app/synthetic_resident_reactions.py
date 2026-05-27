"""On-demand synthetic resident/cohort reactions (Phase 16).

Generates structured decision-support reactions grounded in proposal context,
uploaded datasets, cohort concerns, and metrics. Not real residents or consultation.
"""

from __future__ import annotations

import json
import logging
from typing import Any

from . import config
from .cohort_context import fetch_concern_summaries, fetch_proposal_infra_summary
from .data.concern_generator import COHORT_LABELS
from .dataset_context import fetch_dataset_summaries
from .db.repositories import agents as agents_repo
from .db.repositories import proposal_infrastructure as infra_repo
from .db.repositories import proposals as proposals_repo
from .db.repositories import simulation_snapshots as snapshots_repo
from .existing_infra_context import fetch_uploaded_infrastructure
from .report_generator import fetch_operator_recommendation

log = logging.getLogger("wattif.synthetic_resident_reactions")

REACTION_CAVEAT = (
    "Synthetic reaction generated for decision support only — "
    "not a real resident response or public consultation."
)

VALID_STANCES = frozenset({"support", "oppose", "mixed", "concern", "neutral"})

_SYSTEM_PROMPT = """You generate synthetic cohort resident reactions for WattIf, a Toronto \
energy-planning decision-support tool.

These are NOT real residents, NOT public consultation, and NOT validated survey results.
Output structured JSON only — no markdown fences, no prose outside JSON.

Return a JSON object:
{
  "reactions": [
    {
      "personaLabel": "EV owners",
      "stance": "mixed",
      "summary": "One sentence reaction to the proposal",
      "keyConcern": "Primary worry",
      "suggestedChange": "Concrete planning ask",
      "evidence": "Brief grounding from context",
      "confidence": 0.75
    }
  ]
}

stance must be one of: support, oppose, mixed, concern, neutral.
Produce 2–4 reactions from distinct cohort personas grounded in the supplied context."""


def _normalize_stance(raw: str | None) -> str:
    s = (raw or "neutral").strip().lower()
    if s in VALID_STANCES:
        return s
    if s in ("supportive", "supporting", "favor", "favour"):
        return "support"
    if s in ("opposed", "opposition", "against"):
        return "oppose"
    if s in ("concerned", "worried"):
        return "concern"
    return "neutral"


def _infra_counts(infra: list[dict[str, Any]]) -> dict[str, int]:
    counts: dict[str, int] = {}
    for row in infra:
        k = row.get("kind") or "unknown"
        counts[k] = counts.get(k, 0) + 1
    return counts


def build_reaction_context_pack(
    *,
    project_id: str,
    proposal_id: str | None,
) -> dict[str, Any]:
    """Compact context for reaction generation."""
    proposal = proposals_repo.get_proposal(proposal_id) if proposal_id else None
    profiles = agents_repo.list_profiles(project_id=project_id, limit=50)
    if proposal_id:
        profiles = [
            p
            for p in profiles
            if p.get("proposal_id") == proposal_id or not p.get("proposal_id")
        ]

    concerns = fetch_concern_summaries(project_id=project_id, proposal_id=proposal_id)
    datasets = fetch_dataset_summaries(project_id=project_id, proposal_id=proposal_id)
    proposal_infra = (
        fetch_proposal_infra_summary(proposal_id=proposal_id) if proposal_id else []
    )
    if proposal_id and not proposal_infra:
        raw_infra = infra_repo.list_by_proposal(proposal_id, limit=50)
        proposal_infra = [
            {
                "id": r.get("id"),
                "kind": r.get("kind"),
                "zoneId": r.get("zone_id"),
                "capacityKw": r.get("capacity_kw"),
            }
            for r in raw_infra
        ]

    uploaded = fetch_uploaded_infrastructure(
        project_id=project_id, proposal_id=proposal_id, limit=100
    )
    snapshot = snapshots_repo.get_latest(proposal_id) if proposal_id else None
    recommendation = (
        fetch_operator_recommendation(proposal_id) if proposal_id else None
    )

    return {
        "projectId": project_id,
        "proposalId": proposal_id,
        "proposalName": (proposal or {}).get("name"),
        "proposalStatus": (proposal or {}).get("status"),
        "cohorts": [
            {
                "id": p.get("id"),
                "name": p.get("name"),
                "cohortType": p.get("cohort_type") or p.get("archetype"),
                "priorities": (p.get("priorities") or [])[:5],
            }
            for p in profiles[:12]
        ],
        "concerns": concerns[:12],
        "datasets": datasets[:8],
        "proposalInfrastructure": proposal_infra,
        "proposalInfraCounts": _infra_counts(proposal_infra),
        "uploadedInfrastructureCount": len(uploaded),
        "uploadedInfraByKind": _infra_counts(
            [{"kind": a.get("asset_kind")} for a in uploaded]
        ),
        "snapshotMetrics": (snapshot or {}).get("metrics") if snapshot else None,
        "snapshotTick": (snapshot or {}).get("tick") if snapshot else None,
        "operatorRecommendationSummary": (
            (recommendation or {}).get("summary")[:400] if recommendation else None
        ),
    }


def _suggested_change_from_concern(concern: dict[str, Any]) -> str:
    topic = concern.get("topic") or "planning"
    stance = concern.get("stance") or "mixed"
    if topic in ("peak_demand_pressure", "grid_capacity"):
        return "Add storage or stage EV load before expanding charger clusters."
    if topic in ("parking_and_congestion", "proposal_ev_placement"):
        return "Move chargers to off-street lots with excess parking capacity."
    if topic in ("climate_resilience", "heat_vulnerability"):
        return "Pair batteries/microgrids with cooling-adjacent resilience hubs."
    if topic == "ev_charger_access":
        return "Fill fast-charging gaps near transit and commercial corridors."
    if stance == "support":
        return "Expand similar investments where this cohort sees clear benefit."
    return "Revise siting to address the concern topic before scaling deployment."


def generate_deterministic_reactions(
    context: dict[str, Any],
) -> list[dict[str, Any]]:
    """2–4 deterministic reactions from cohort concerns and context."""
    concerns = context.get("concerns") or []
    cohorts = context.get("cohorts") or []
    infra_counts = context.get("proposalInfraCounts") or {}
    reactions: list[dict[str, Any]] = []

    name_by_id = {c.get("id"): c.get("name") for c in cohorts}
    type_by_id = {c.get("id"): c.get("cohortType") for c in cohorts}

    source_rows = concerns[:4] if concerns else []

    if not source_rows:
        generic_label = "Generic residents"
        ev_n = infra_counts.get("ev_charger", 0)
        bat_n = infra_counts.get("battery", 0)
        reactions.append(
            {
                "persona_label": generic_label,
                "stance": "mixed",
                "summary": (
                    f"Synthetic cohort sees {ev_n} proposed EV charger(s) and "
                    f"{bat_n} battery placement(s) — wants clearer equity and parking impacts "
                    "before endorsing expansion."
                ),
                "key_concern": "Limited dataset grounding for local impacts",
                "suggested_change": (
                    "Upload EV/demand datasets and generate cohort concerns for richer reactions."
                ),
                "evidence": "Fallback context — no persisted cohort concerns yet.",
                "confidence": 0.45,
                "provider": "deterministic",
                "model": "fallback_v1",
            }
        )
        if ev_n > 0:
            reactions.append(
                {
                    "persona_label": "EV owners",
                    "stance": "support" if ev_n <= 3 else "concern",
                    "summary": (
                        f"EV owners react to {ev_n} proposed charger(s): supportive if sited "
                        "in high-access corridors, wary if clustered in parking-constrained lots."
                    ),
                    "key_concern": "Charger access vs parking congestion",
                    "suggested_change": (
                        "Prioritize transit-adjacent and off-street charger sites."
                    ),
                    "evidence": f"Proposal infrastructure: ev_charger×{ev_n}",
                    "confidence": 0.55,
                    "provider": "deterministic",
                    "model": "fallback_v1",
                }
            )
        return reactions[:4]

    for concern in source_rows[:4]:
        cohort_id = concern.get("cohortId")
        cohort_type = type_by_id.get(cohort_id) or "generic_residents"
        persona = (
            concern.get("cohortName")
            or name_by_id.get(cohort_id)
            or COHORT_LABELS.get(cohort_type, cohort_type.replace("_", " ").title())
        )
        stance = _normalize_stance(concern.get("stance"))
        if stance == "neutral":
            stance = "mixed"
        summary = concern.get("summary") or "Synthetic cohort has planning concerns."
        evidence_list = concern.get("evidence") or []
        evidence = evidence_list[0] if evidence_list else concern.get("topic")

        reactions.append(
            {
                "persona_label": persona,
                "stance": stance,
                "summary": summary[:320],
                "key_concern": concern.get("topic") or "planning",
                "suggested_change": _suggested_change_from_concern(concern),
                "evidence": str(evidence)[:240] if evidence else None,
                "confidence": 0.65,
                "cohort_id": cohort_id,
                "concern_id": concern.get("id"),
                "provider": "deterministic",
                "model": "fallback_v1",
            }
        )

    return reactions[:4]


def _parse_reactions_json(text: str) -> list[dict[str, Any]]:
    t = text.strip()
    if t.startswith("```"):
        t = t.split("\n", 1)[-1].rsplit("```", 1)[0].strip()
        if t.startswith("json"):
            t = t[4:].strip()
    parsed = json.loads(t)
    if isinstance(parsed, list):
        return parsed
    if isinstance(parsed, dict):
        return parsed.get("reactions") or parsed.get("items") or []
    return []


def _call_llm_for_reactions(context: dict[str, Any]) -> list[dict[str, Any]]:
    """Call real LLM provider; raises on failure."""
    provider = config.real_llm_provider()
    if not provider:
        raise RuntimeError("no_real_llm_provider")

    payload = json.dumps(context, indent=2, default=str)
    user_msg = (
        "Generate synthetic cohort reactions for this planning context:\n\n"
        f"{payload}\n\n"
        f"Every reaction must reflect decision-support only. "
        f"Required caveat text: {REACTION_CAVEAT}"
    )

    if provider == "anthropic":
        import anthropic

        client = anthropic.Anthropic(api_key=config.ANTHROPIC_API_KEY)
        resp = client.messages.create(
            model=config.CLAUDE_MODEL,
            max_tokens=2048,
            system=_SYSTEM_PROMPT,
            messages=[{"role": "user", "content": user_msg}],
        )
        text = next((b.text for b in resp.content if b.type == "text"), "")
        model = config.CLAUDE_MODEL
    else:
        from openai import OpenAI

        client = OpenAI(api_key=config.FEATHER_API_KEY, base_url=config.FEATHER_BASE_URL)
        resp = client.chat.completions.create(
            model=config.FEATHER_MODEL,
            max_tokens=2048,
            messages=[
                {"role": "system", "content": _SYSTEM_PROMPT},
                {"role": "user", "content": user_msg},
            ],
        )
        text = resp.choices[0].message.content or ""
        model = config.FEATHER_MODEL

    raw_items = _parse_reactions_json(text)
    out: list[dict[str, Any]] = []
    for item in raw_items[:6]:
        if not isinstance(item, dict):
            continue
        summary = (item.get("summary") or item.get("reaction") or "").strip()
        if not summary:
            continue
        out.append(
            {
                "persona_label": item.get("personaLabel") or item.get("persona_label"),
                "stance": _normalize_stance(item.get("stance")),
                "summary": summary[:500],
                "key_concern": item.get("keyConcern") or item.get("key_concern"),
                "suggested_change": item.get("suggestedChange")
                or item.get("suggested_change"),
                "evidence": item.get("evidence"),
                "confidence": item.get("confidence"),
                "provider": provider,
                "model": model,
            }
        )
    if not out:
        raise ValueError("llm_returned_no_reactions")
    return out


def _attach_cohort_ids(
    reactions: list[dict[str, Any]], context: dict[str, Any]
) -> None:
    """Best-effort link reactions to persisted cohort profiles."""
    cohorts = context.get("cohorts") or []
    by_name = {(c.get("name") or "").lower(): c.get("id") for c in cohorts}
    by_type = {(c.get("cohortType") or "").lower(): c.get("id") for c in cohorts}
    for r in reactions:
        if r.get("cohort_id"):
            continue
        label = (r.get("persona_label") or "").lower()
        for key, cid in by_name.items():
            if key and key in label:
                r["cohort_id"] = cid
                break
        else:
            for ctype, cid in by_type.items():
                if ctype and ctype.replace("_", " ") in label:
                    r["cohort_id"] = cid
                    break


def generate_synthetic_resident_reactions(
    *,
    project_id: str,
    proposal_id: str | None,
    use_llm: bool = True,
) -> tuple[list[dict[str, Any]], dict[str, Any]]:
    """Return (reaction_specs, meta) ready for persistence."""
    context = build_reaction_context_pack(
        project_id=project_id, proposal_id=proposal_id
    )
    provider_used = "deterministic"
    model_used = "fallback_v1"

    reactions: list[dict[str, Any]] = []
    if use_llm and config.real_llm_provider():
        try:
            reactions = _call_llm_for_reactions(context)
            provider_used = reactions[0].get("provider") or config.real_llm_provider()
            model_used = reactions[0].get("model") or "unknown"
        except Exception as exc:
            log.warning("LLM synthetic reactions failed, using fallback: %s", exc)
            reactions = []

    if not reactions:
        reactions = generate_deterministic_reactions(context)
        provider_used = "deterministic"
        model_used = "fallback_v1"

    _attach_cohort_ids(reactions, context)

    for r in reactions:
        r.setdefault("reaction_type", "llm_synthetic_reaction")
        r["caveat"] = REACTION_CAVEAT
        r["source_context"] = {
            "proposalId": proposal_id,
            "concernCount": len(context.get("concerns") or []),
            "datasetCount": len(context.get("datasets") or []),
            "providerUsed": provider_used,
        }
        r.setdefault("provider", provider_used)
        r.setdefault("model", model_used)

    meta = {
        "provider": provider_used,
        "model": model_used,
        "count": len(reactions),
        "usedLlm": provider_used not in ("deterministic",),
    }
    return reactions, meta


def format_reactions_for_prompt(reactions: list[dict[str, Any]]) -> str:
    """Compact planner/operator summary — not a full row dump."""
    if not reactions:
        return ""

    stance_counts: dict[str, int] = {}
    changes: list[str] = []
    summaries: list[str] = []
    for r in reactions:
        st = _normalize_stance(r.get("stance"))
        stance_counts[st] = stance_counts.get(st, 0) + 1
        if r.get("suggested_change"):
            changes.append(str(r["suggested_change"])[:120])
        if r.get("summary"):
            summaries.append(str(r["summary"])[:160])

    stance_parts = ", ".join(
        f"{n} {st}" for st, n in sorted(stance_counts.items(), key=lambda x: -x[1])
    )
    change_hint = ""
    if changes:
        uniq = list(dict.fromkeys(changes))[:3]
        change_hint = " Common requested changes: " + "; ".join(uniq) + "."

    summary_hint = ""
    if summaries:
        summary_hint = " Key summaries: " + " | ".join(summaries[:3]) + "."

    return (
        f"Synthetic resident reactions: {len(reactions)} generated; {stance_parts}."
        f"{change_hint}{summary_hint} "
        f"({REACTION_CAVEAT})"
    )


def fetch_reaction_summaries(
    *,
    project_id: str | None = None,
    proposal_id: str | None = None,
    limit: int = 20,
) -> list[dict[str, Any]]:
    from .db.repositories import synthetic_resident_reactions as repo
    from .db.repositories.base import PersistenceDisabledError

    if not project_id and not proposal_id:
        return []
    try:
        if proposal_id:
            rows = repo.list_by_proposal(proposal_id, limit=limit)
        else:
            rows = repo.list_by_project(project_id, limit=limit)
        return [
            {
                "id": r.get("id"),
                "personaLabel": r.get("persona_label"),
                "stance": r.get("stance"),
                "summary": r.get("summary"),
                "keyConcern": r.get("key_concern"),
                "suggestedChange": r.get("suggested_change"),
                "provider": r.get("provider"),
            }
            for r in rows
        ]
    except PersistenceDisabledError:
        return []
    except Exception as exc:
        log.warning("fetch_reaction_summaries failed: %s", exc)
        return []
