"""Hybrid agent layer: LLM-generated preference/rationale for a SAMPLED subset of agents.

Provider-agnostic:
  - (a) Anthropic via ANTHROPIC_API_KEY (claude-opus-4-7 / claude-sonnet-4-6), using the
        anthropic SDK with prompt caching of the stable "rules of the world" system prompt.
  - (b) An OpenAI-compatible gateway ("feather") via FEATHER_API_KEY + FEATHER_BASE_URL +
        FEATHER_MODEL, using the openai SDK with base_url=FEATHER_BASE_URL.
  - Prefers Anthropic when both are set; clean rule-based fallback when neither is — nothing
    breaks and the sim always runs.

Never called on the hot sim-tick path — invoked on demand (e.g. when the frontend inspects a
zone) so ticks stay fast and deterministic.
"""

from __future__ import annotations

import json
import logging

from .. import config
from ..models import Agent, AgentVoice, Zone

log = logging.getLogger("wattif.llm")

# Stable, cacheable system prompt — the "rules of the world". Keep this frozen so the
# prompt-cache prefix stays valid across requests (no timestamps / per-request IDs).
_SYSTEM_PROMPT = """You are the behavioural model for WattIf, an agent-based digital twin \
of Toronto used to plan renewable-energy siting with an energy-equity lens.

Each agent is a household or small business with a demand profile, income bracket, \
rooftop availability, and EV ownership. Your job: for each agent in the batch, output a \
SHORT first-person rationale (max ~22 words) explaining their stance on adopting rooftop \
solar or supporting nearby community renewable infrastructure (solar/wind/battery/microgrid).

Ground the rationale in the agent's situation:
- low-income renters: cost-sensitive, often can't install rooftop solar, benefit most from \
community microgrids and bill relief; high energy burden.
- mid-income owners: payback-period driven, swayed by incentives and neighbours adopting.
- high-income suburban owners: early adopters, value resilience and EV charging.
- small businesses: care about operating costs and reliability.

Return ONLY a JSON array of objects: [{"id": "<agentId>", "rationale": "<text>"}]. \
No prose, no markdown fences."""


def _fallback_rationale(agent: Agent, zone: Zone) -> str:
    """Deterministic, plausible rationale without any API call."""
    burden = zone.demographics.energy_burden_index
    if agent.archetype.startswith("renter") or agent.archetype == "highrise-tenant":
        if burden > 0.55:
            return "I rent and can't install panels, but a community microgrid could finally cut my high energy bills."
        return "As a renter I'd back shared neighbourhood solar — I want cheaper power without owning the roof."
    if agent.income_bracket == "high":
        base = "I'll adopt rooftop solar early for resilience"
        return base + (
            " and to charge my EV cleanly."
            if agent.ev_owner
            else " and long-term savings."
        )
    if agent.archetype == "small-business":
        return "Lower, predictable energy costs and reliable supply make local renewables an easy yes for my business."
    # mid-income owner default
    if agent.has_rooftop:
        return "If the payback period is reasonable and neighbours are adopting, I'll put solar on my roof."
    return "I'm interested in clean energy but need incentives or a community option that fits my budget."


def rule_based_rationales(
    agents: list[Agent], zones_by_id: dict[str, Zone]
) -> list[dict[str, str]]:
    out = []
    for a in agents:
        zone = zones_by_id.get(a.zone_id)
        rationale = (
            _fallback_rationale(a, zone)
            if zone
            else "Interested in affordable clean energy options."
        )
        out.append({"id": a.id, "rationale": rationale})
    return out


def _agent_brief(agent: Agent, zone: Zone) -> dict:
    return {
        "id": agent.id,
        "archetype": agent.archetype,
        "incomeBracket": agent.income_bracket,
        "hasRooftop": agent.has_rooftop,
        "evOwner": agent.ev_owner,
        "solarAdopted": agent.solar_adopted,
        "monthlyDemandKwh": round(agent.demand_kwh, 1),
        "zone": zone.name,
        "zoneEnergyBurden": zone.demographics.energy_burden_index,
        "zoneSolarPotential": zone.solar_potential,
    }


def _parse_rationale_array(text: str) -> dict[str, str]:
    """Parse the model's JSON array into {id: rationale}, tolerating ```json fences."""
    t = text.strip()
    if t.startswith("```"):
        t = t.split("\n", 1)[-1].rsplit("```", 1)[0].strip()
        if t.startswith("json"):
            t = t[4:].strip()
    parsed = json.loads(t)
    return {item["id"]: item.get("rationale", "") for item in parsed if "id" in item}


def _call_anthropic(user_payload: str) -> str:
    """Anthropic SDK with prompt caching of the stable system prefix."""
    import anthropic

    client = anthropic.Anthropic(api_key=config.ANTHROPIC_API_KEY)
    resp = client.messages.create(
        model=config.CLAUDE_MODEL,
        max_tokens=1024,
        system=[
            {
                "type": "text",
                "text": _SYSTEM_PROMPT,
                "cache_control": {
                    "type": "ephemeral"
                },  # cache the stable rules-of-the-world prefix
            }
        ],
        messages=[{"role": "user", "content": user_payload}],
    )
    log.info(
        "anthropic rationales: cache_read=%s cache_write=%s",
        getattr(resp.usage, "cache_read_input_tokens", None),
        getattr(resp.usage, "cache_creation_input_tokens", None),
    )
    return next((b.text for b in resp.content if b.type == "text"), "")


def _call_feather(user_payload: str) -> str:
    """OpenAI-compatible gateway via the openai SDK (base_url=FEATHER_BASE_URL)."""
    from openai import OpenAI

    client = OpenAI(api_key=config.FEATHER_API_KEY, base_url=config.FEATHER_BASE_URL)
    resp = client.chat.completions.create(
        model=config.FEATHER_MODEL,
        max_tokens=1024,
        messages=[
            {"role": "system", "content": _SYSTEM_PROMPT},
            {"role": "user", "content": user_payload},
        ],
    )
    log.info(
        "feather rationales via %s (model=%s)",
        config.FEATHER_BASE_URL,
        config.FEATHER_MODEL,
    )
    return resp.choices[0].message.content or ""


def generate_rationales(
    agents: list[Agent], zones_by_id: dict[str, Zone]
) -> list[dict[str, str]]:
    """Return [{id, rationale}] for the given agents.

    Dispatches to whichever LLM provider is configured (Anthropic preferred, else the
    OpenAI-compatible gateway). Any missing config, missing SDK, or API failure degrades
    gracefully to the deterministic rule-based generator.
    """
    if not agents:
        return []

    provider = config.real_llm_provider()  # scripted demo + no-key both use rule-based
    if provider is None:
        return rule_based_rationales(agents, zones_by_id)

    briefs = [
        _agent_brief(a, zones_by_id[a.zone_id])
        for a in agents
        if a.zone_id in zones_by_id
    ]
    user_payload = "Agents:\n" + json.dumps(briefs, separators=(",", ":"))

    try:
        text = (
            _call_anthropic(user_payload)
            if provider == "anthropic"
            else _call_feather(user_payload)
        )
        by_id = _parse_rationale_array(text)
        # Fill any gaps with fallback so every requested agent has a rationale.
        result = []
        for a in agents:
            rationale = by_id.get(a.id)
            if not rationale:
                zone = zones_by_id.get(a.zone_id)
                rationale = _fallback_rationale(a, zone) if zone else ""
            result.append({"id": a.id, "rationale": rationale})
        return result
    except Exception as exc:  # noqa: BLE001 — never let LLM issues break the API
        log.warning(
            "%s rationale generation failed (%s); using fallback", provider, exc
        )
        return rule_based_rationales(agents, zones_by_id)


# ---------------------------------------------------------------------------
# v2: voice enrichment — rewrite rule-templated voices into livelier posts
# ---------------------------------------------------------------------------
_VOICES_SYSTEM = """You rewrite short civic opinion posts for WattIf, a Toronto renewable-energy \
simulation. Given a batch of residents' draft posts (with their stance and the technology they're \
reacting to), rewrite each into a punchier, natural, first-person line (max ~22 words). Keep the \
SAME stance and topic. Vary voice by archetype. No hashtags, no emoji, no preamble.

Return ONLY a JSON array: [{"id": "<agentId>", "text": "<rewritten>"}]."""


def enrich_voices(
    voices: list[AgentVoice], context: str | None = None
) -> list[AgentVoice]:
    """LLM-rewrite voice text (provider-agnostic). Returns the inputs unchanged on any failure."""
    if not voices:
        return voices
    provider = (
        config.real_llm_provider()
    )  # scripted demo + no-key keep the rich rule-based text
    if provider is None:
        return voices

    payload = {
        "context": context or "",
        "posts": [
            {
                "id": v.agent_id,
                "stance": v.stance,
                "topic": v.topic,
                "archetype": v.archetype,
                "draft": v.text,
            }
            for v in voices
        ],
    }
    user = json.dumps(payload, separators=(",", ":"))

    try:
        if provider == "anthropic":
            import anthropic

            client = anthropic.Anthropic(api_key=config.ANTHROPIC_API_KEY)
            resp = client.messages.create(
                model=config.CLAUDE_MODEL,
                max_tokens=1024,
                system=[
                    {
                        "type": "text",
                        "text": _VOICES_SYSTEM,
                        "cache_control": {"type": "ephemeral"},
                    }
                ],
                messages=[{"role": "user", "content": user}],
            )
            text = next((b.text for b in resp.content if b.type == "text"), "")
        else:
            from openai import OpenAI

            client = OpenAI(
                api_key=config.FEATHER_API_KEY, base_url=config.FEATHER_BASE_URL
            )
            resp = client.chat.completions.create(
                model=config.FEATHER_MODEL,
                max_tokens=1024,
                messages=[
                    {"role": "system", "content": _VOICES_SYSTEM},
                    {"role": "user", "content": user},
                ],
            )
            text = resp.choices[0].message.content or ""

        t = text.strip()
        if t.startswith("```"):
            t = t.split("\n", 1)[-1].rsplit("```", 1)[0].strip()
            if t.startswith("json"):
                t = t[4:].strip()
        parsed = {
            item["id"]: item.get("text", "") for item in json.loads(t) if "id" in item
        }
        for v in voices:
            new_text = parsed.get(v.agent_id)
            if new_text:
                v.text = new_text
        return voices
    except Exception as exc:  # noqa: BLE001 — enrichment is best-effort
        log.warning(
            "%s voice enrichment failed (%s); using rule-based text", provider, exc
        )
        return voices
