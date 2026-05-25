"""Agent "voices" — short, event-driven opinion posts from a sampled subset of agents.

Voices ARE the visible signal of the opinion model. The no-key path must read like real,
diverse Torontonians — not three repeated templates — so this module ships a large library
varied across stance x archetype x topic x scenario. An optional LLM rewrite (see llm.py
`enrich_voices`) upgrades quality when a provider key is set; the rule-based output is designed
to be convincing on its own.
"""

from __future__ import annotations

import numpy as np

from ..models import AgentVoice
from .sentiment import KINDS

_KIND_NOUN = {
    "solar": "rooftop solar",
    "wind": "wind turbines",
    "battery": "battery storage",
    "microgrid": "a community microgrid",
}

# ---------------------------------------------------------------------------
# Generic stance pools (varied; {topic} = kind noun, {zone} = neighbourhood)
# ---------------------------------------------------------------------------
_GENERIC = {
    "support": [
        "Finally seeing {topic} come to {zone} — my bills and the air both feel better.",
        "All for {topic} in {zone}. Honestly it's overdue.",
        "{topic} just makes sense for {zone}. Sign me up.",
        "Proud of {zone} for backing {topic} — let's keep this momentum.",
        "Every block in {zone} should have {topic} if you ask me.",
        "My neighbours were skeptical about {topic}, but {zone} is coming around.",
        "Cleaner air and steadier bills — {topic} is a win for {zone}.",
        "Took a while, but {topic} in {zone} is exactly the right call.",
        "I'd happily chip in for more {topic} around {zone}.",
        "{zone} going big on {topic} is the kind of news I want to hear.",
        "Watched {topic} go up near me in {zone} and I'm sold.",
        "If {topic} works in {zone}, the rest of the city should follow.",
    ],
    "oppose": [
        "Not sold on {topic} for {zone} — who's actually paying for all this?",
        "{topic} in {zone}? I worry about the cost and the disruption.",
        "I'd rather {zone} slow down on {topic} until we see real savings.",
        "Skeptical about {topic} here — feels rushed for {zone}.",
        "Show me the numbers before you put {topic} in {zone}.",
        "{topic} sounds nice but {zone} has bigger problems right now.",
        "Worried {topic} just raises my costs in {zone}.",
        "Nobody asked {zone} residents before pushing {topic}.",
        "I'll believe {topic} helps {zone} when I see it on my bill.",
        "Feels like {topic} in {zone} is more politics than progress.",
        "Hard pass on {topic} for {zone} until the kinks are worked out.",
    ],
    "neutral": [
        "Watching how {topic} plays out in {zone} before I decide.",
        "Could go either way on {topic} for {zone} — show me the data.",
        "{topic} in {zone} is interesting; I've got questions.",
        "Curious whether {topic} actually moves the needle in {zone}.",
        "On the fence about {topic} for {zone}, honestly.",
        "Tell me what {topic} costs {zone} households and I'll weigh in.",
        "Open to {topic} in {zone} if the case is solid.",
        "Still reading up on what {topic} means for {zone}.",
    ],
}

# ---------------------------------------------------------------------------
# Archetype-specific lines (distinct voice per resident type)
# ---------------------------------------------------------------------------
_ARCHETYPE_LINES = {
    "renter-lowincome": {
        "support": [
            "As a renter on a tight budget, {topic} in {zone} could finally ease my hydro bill.",
            "I can't install anything myself, so {topic} for {zone} is how people like me benefit.",
            "Lower bills matter most to me — {topic} in {zone} is welcome.",
        ],
        "oppose": [
            "I rent in {zone}; if {topic} bumps my rent, that's a hard no.",
            "Will {topic} actually reach renters in {zone}, or just owners?",
        ],
        "neutral": [
            "Renting in {zone}, I just want to know if {topic} lowers what I pay.",
        ],
    },
    "highrise-tenant": {
        "support": [
            "From my apartment in {zone}, {topic} beats putting panels on a roof I don't own.",
            "Community options like {topic} are perfect for a highrise like mine in {zone}.",
        ],
        "oppose": [
            "Not sure {topic} does anything for tower residents in {zone}.",
        ],
        "neutral": [
            "Tower living in {zone} means {topic} only helps if it's shared — does it?",
        ],
    },
    "owner-suburban": {
        "support": [
            "With my own roof and an EV to charge in {zone}, {topic} is a no-brainer.",
            "Bought into {topic} for resilience here in {zone} — worth every cent.",
        ],
        "oppose": [
            "I own in {zone} and {topic} near homes worries me — noise and property values.",
            "Keep {topic} away from quiet streets in {zone}, please.",
        ],
        "neutral": [
            "As a {zone} homeowner I'm weighing {topic} against the payback period.",
        ],
    },
    "owner-urban": {
        "support": [
            "Downtown in {zone}, {topic} is exactly the kind of upgrade we need.",
            "Happy to see {topic} densifying clean power in {zone}.",
        ],
        "oppose": [
            "Space is tight in {zone} — not sure {topic} fits here.",
        ],
        "neutral": [
            "Urban {zone} is complicated; I want to see {topic} done right.",
        ],
    },
    "small-business": {
        "support": [
            "For my shop in {zone}, {topic} means predictable power and lower overhead — yes.",
            "Reliable energy keeps my {zone} business open; {topic} helps.",
        ],
        "oppose": [
            "Construction for {topic} in {zone} could hurt my storefront traffic.",
        ],
        "neutral": [
            "Running a business in {zone}, I need {topic} to pencil out before I cheer.",
        ],
    },
    "renter-midincome": {
        "support": [
            "Renting in {zone}, I'd back {topic} if it keeps bills steady.",
            "{topic} feels like the right direction for {zone}.",
        ],
        "oppose": [
            "Decent option, but {topic} in {zone} shouldn't land on tenants' bills.",
        ],
        "neutral": [
            "Could support {topic} in {zone} — depends on who pays.",
        ],
    },
}

# ---------------------------------------------------------------------------
# Scenario-specific reactions (take priority when a scenario context is set)
# ---------------------------------------------------------------------------
_SCENARIO_LINES = {
    "blackout": {
        "support": [
            "When the grid went down, the microgrid kept {zone} lit — I'm a believer now.",
            "After that blackout, {topic} for {zone} suddenly feels essential.",
            "No more sitting in the dark — {zone} needs {topic} and backup power.",
            "My fridge stayed cold thanks to backup power — {zone} needs more {topic}.",
            "The blackout proved it: {topic} keeps {zone} running when the grid can't.",
        ],
        "oppose": [
            "One blackout and everyone wants {topic} in {zone}? Let's not overreact.",
            "The blackout was rough, but {topic} in {zone} isn't a magic fix.",
        ],
        "neutral": [
            "That blackout made me rethink {topic} for {zone}, not gonna lie.",
            "Sat in the dark during the blackout — now I'm at least asking about {topic} in {zone}.",
            "The outage got {zone} talking about {topic}; I'm listening.",
        ],
    },
    "heatwave": {
        "support": [
            "This heat is brutal — {topic} in {zone} would keep the AC affordable.",
            "Peak afternoons are killing my bill; {topic} for {zone} can't come soon enough.",
        ],
        "oppose": [
            "It's hot, sure, but is {topic} really the fix for {zone}?",
        ],
        "neutral": [
            "Heatwave's got me looking harder at {topic} for {zone}.",
        ],
    },
    "earthquake": {
        "support": [
            "After the quake, resilient power like {topic} matters more than ever in {zone}.",
        ],
        "oppose": [
            "Fix the damaged lines in {zone} first, then talk to me about {topic}.",
        ],
        "neutral": [
            "The quake shook my view on {topic} for {zone} — still processing.",
        ],
    },
    "ice_storm": {
        "support": [
            "Lost power for days in the ice storm — {zone} needs {topic} and storage.",
        ],
        "neutral": [
            "After the ice storm I'm at least curious about {topic} for {zone}.",
        ],
        "oppose": [],
    },
    "gas_spike": {
        "support": [
            "With gas prices through the roof, {topic} in {zone} is the smart hedge.",
        ],
        "neutral": [
            "Energy costs are spiking — maybe {topic} pencils out for {zone} now.",
        ],
        "oppose": [],
    },
    "policy_incentive": {
        "support": [
            "With the new rebate, {topic} in {zone} is finally within reach for me.",
        ],
        "neutral": [
            "That incentive has me reconsidering {topic} for {zone}.",
        ],
        "oppose": [],
    },
    "turbine_noise_complaint": {
        "oppose": [
            "The turbine hum near {zone} is real — I can't back more wind here.",
            "Love clean energy, hate the noise — {topic} doesn't belong this close in {zone}.",
        ],
        "neutral": [
            "Torn on {topic} for {zone} — the noise complaints aren't nothing.",
        ],
        "support": [],
    },
    "population_boom": {
        "support": [
            "{zone} is growing fast — we'll need {topic} just to keep up.",
        ],
        "neutral": [
            "More neighbours in {zone} means more demand; does {topic} keep pace?",
        ],
        "oppose": [],
    },
}

# Natural openers used only when a scenario has no dedicated line for that stance.
_CONTEXT_OPENER = {
    "blackout": "After the blackout, ",
    "heatwave": "During this heatwave, ",
    "earthquake": "Since the quake, ",
    "ice_storm": "After the ice storm, ",
    "gas_spike": "With gas prices up, ",
    "policy_incentive": "With the new rebate, ",
    "cold_snap": "In this cold snap, ",
    "ev_surge": "With everyone buying EVs, ",
}


def _stance_for(mean_opinion: float) -> str:
    if mean_opinion >= 0.6:
        return "support"
    if mean_opinion < 0.45:
        return "oppose"
    return "neutral"


def _pick_template(
    rng, archetype: str, stance: str, context: str | None
) -> tuple[str, bool]:
    """Return (template, used_scenario_line). Prefers scenario- then archetype-specific."""
    # 1) scenario-specific (55%)
    if context and context in _SCENARIO_LINES:
        pool = _SCENARIO_LINES[context].get(stance) or []
        if pool and rng.random() < 0.55:
            return str(rng.choice(pool)), True
    # 2) archetype-specific (45%)
    arche = _ARCHETYPE_LINES.get(archetype, {}).get(stance) or []
    if arche and rng.random() < 0.45:
        return str(rng.choice(arche)), False
    # 3) generic
    return str(rng.choice(_GENERIC[stance])), False


def generate_voices(
    sentiment,
    zones_by_id: dict,
    n: int = 8,
    context: str | None = None,
    rng: np.random.Generator | None = None,
) -> list[AgentVoice]:
    """Sample n agents and produce rich, varied rule-templated voices."""
    if sentiment.n == 0 or n <= 0:
        return []
    rng = rng or np.random.default_rng()
    idxs = rng.choice(sentiment.n, size=min(n, sentiment.n), replace=False)

    voices: list[AgentVoice] = []
    for i in idxs:
        agent = sentiment.agents[int(i)]
        op = sentiment.opinion[int(i)]
        mean_op = float(op.mean())
        stance = _stance_for(mean_op)
        # Topic = the kind they feel most strongly about (highest if support, lowest if oppose).
        ki = int(np.argmax(op)) if stance != "oppose" else int(np.argmin(op))
        kind = KINDS[ki]
        zone = zones_by_id.get(agent.zone_id)
        zone_name = zone.name if zone else "my area"

        template, used_scenario = _pick_template(rng, agent.archetype, stance, context)
        text = template.format(topic=_KIND_NOUN[kind], zone=zone_name)

        # If we didn't use a scenario-specific line, optionally prepend a natural opener.
        if not used_scenario:
            opener = _CONTEXT_OPENER.get(context or "", "")
            if opener and rng.random() < 0.5:
                text = opener + text[0].lower() + text[1:]

        voices.append(
            AgentVoice(
                agent_id=agent.id,
                zone_id=agent.zone_id,
                archetype=agent.archetype,
                avatar_seed=agent.id,
                text=text,
                stance=stance,  # type: ignore[arg-type]
                topic=kind,
            )
        )
    return voices
