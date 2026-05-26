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
from .sentiment import KIND_IDX, KINDS

_KIND_NOUN = {
    "solar": "rooftop solar",
    "wind": "wind turbines",
    "battery": "battery storage",
    "microgrid": "a community microgrid",
    "ev_charger": "EV charging",
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


# ---------------------------------------------------------------------------
# Personas — opinionated, distinct voices. Each agent gets a persona (from archetype +
# a deterministic personality overlay); lines are pointed and specific, not fence-sitting.
# ---------------------------------------------------------------------------
_PERSONA_LINES = {
    "advocate": {
        "support": [
            "We can't wait — {zone} needs {topic} now. The climate clock is ticking.",
            "Bring {topic} to {zone} and don't stop there — every rooftop, every block.",
            "Yes to {topic} in {zone}, full stop. This is the fight of our time.",
        ],
        "oppose": [
            "Even I think this {topic} rollout in {zone} is half-baked — do it properly.",
        ],
        "neutral": [
            "I want {topic} in {zone} — show me it's done right and I'm all in, loudly.",
        ],
    },
    "skeptic": {
        "support": [
            "Fine — if {topic} actually lowers bills in {zone}, I'll stop complaining.",
        ],
        "oppose": [
            "Who's paying for {topic} in {zone}? Because it's always us.",
            "{topic} in {zone} is a feel-good money pit. Hard no.",
            "Not in {zone}. Fix what's already broken before chasing {topic}.",
        ],
        "neutral": [
            "I'll believe {topic} helps {zone} when it shows up on my bill — not before.",
        ],
    },
    "pragmatist": {
        "support": [
            "The math works: {topic} in {zone} pays back fast. Approve it.",
            "{topic} in {zone} pencils out — solid ROI, let's go.",
        ],
        "oppose": [
            "Numbers don't add up for {topic} in {zone} yet — wait for costs to drop.",
        ],
        "neutral": [
            "Show me the payback on {topic} in {zone}. Under eight years and I'm in.",
        ],
    },
    "business": {
        "support": [
            "Reliable power keeps my {zone} shop open — {topic} that cuts outages and bills? Sold.",
            "{topic} in {zone} means steadier overhead. Good for business.",
        ],
        "oppose": [
            "Construction for {topic} in {zone} kills my foot traffic — time it right or skip it.",
        ],
        "neutral": [
            "If {topic} keeps {zone} powered through peak, my business is interested.",
        ],
    },
    "renter": {
        "support": [
            "Finally — {topic} in {zone} that could cut MY hydro bill, not just owners'.",
            "As a renter in {zone}, community {topic} is how people like me actually benefit.",
        ],
        "oppose": [
            "If {topic} in {zone} lands on tenants' bills, that's a hard no.",
            "Will {topic} reach renters in {zone}, or just dress up the landlords' towers?",
        ],
        "neutral": [
            "{topic} in {zone} only matters to me if it lowers what I pay — rent and hydro.",
        ],
    },
    "owner": {
        "support": [
            "Put {topic} on my street in {zone} — happy to lead the block.",
            "Bought into {topic} here in {zone} for resilience. Worth every cent.",
        ],
        "oppose": [
            "Keep {topic} off quiet streets in {zone} — noise and property values matter.",
            "Not by my home in {zone}. Site {topic} somewhere with room.",
        ],
        "neutral": [
            "I'll weigh {topic} for {zone} against the payback — and the view.",
        ],
    },
    "senior": {
        "support": [
            "At my age in {zone}, reliable power and cool air aren't luxuries — {topic}, please.",
            "{topic} in {zone} means I'm not sweating through the next heatwave. Yes.",
        ],
        "oppose": [
            "I'm on a fixed income in {zone} — {topic} had better not raise my bills.",
        ],
        "neutral": [
            "As long as {topic} keeps {zone}'s heat and power steady, I'll back it.",
        ],
    },
    "student": {
        "support": [
            "{zone} needs {topic} yesterday — my generation inherits this mess.",
            "Climate won't wait. Put {topic} all over {zone}.",
        ],
        "oppose": [
            "Honestly {topic} in {zone} smells like greenwashing — go bigger or go home.",
        ],
        "neutral": [
            "{topic} in {zone} is a start, but it's nowhere near fast enough.",
        ],
    },
}


def _stance_for(mean_opinion: float) -> str:
    # Narrow neutral band -> fewer fence-sitters, more clear stances.
    if mean_opinion >= 0.55:
        return "support"
    if mean_opinion < 0.45:
        return "oppose"
    return "neutral"


def _persona(archetype: str, mean_opinion: float, agent_id: str) -> str:
    """Deterministic persona from archetype + opinion + a stable per-agent personality bucket.

    Handles both the data-2 archetype names (owner-detached, condo-owner, renter-low/mid, senior,
    student, small-business) and the legacy ones (owner-suburban/urban, renter-*income, highrise-tenant).
    """
    # senior/student are real archetypes -> keep their identity (don't override with advocate/skeptic).
    if archetype == "senior":
        return "senior"
    if archetype == "student":
        return "student"
    if archetype == "small-business":
        base = "business"
    elif archetype.startswith("renter") or archetype == "highrise-tenant":
        base = "renter"
    elif archetype in ("owner-detached", "owner-suburban"):
        base = "owner"
    else:  # condo-owner, owner-urban, or unknown
        base = "pragmatist"
    # Strong opinions become passionate advocates / blunt skeptics (keeps a vivid spread).
    if mean_opinion >= 0.66:
        return "advocate"
    if mean_opinion < 0.38:
        return "skeptic"
    # A little personality variety for the moderate middle.
    if base == "pragmatist":
        h = (sum(ord(c) for c in agent_id) % 100) / 100.0
        if h < 0.12:
            return "senior"
        if h < 0.24:
            return "student"
    return base


def _pick_template(
    rng, archetype: str, stance: str, context: str | None, persona: str | None = None
) -> tuple[str, bool]:
    """Return (template, used_scenario_line). Priority: scenario -> persona -> archetype -> generic."""
    # 1) scenario-specific (on an event, 55%)
    if context and context in _SCENARIO_LINES:
        pool = _SCENARIO_LINES[context].get(stance) or []
        if pool and rng.random() < 0.55:
            return str(rng.choice(pool)), True
    # 2) persona-specific (opinionated; 70%)
    if persona:
        pp = _PERSONA_LINES.get(persona, {}).get(stance) or []
        if pp and rng.random() < 0.70:
            return str(rng.choice(pp)), False
    # 3) archetype-specific
    arche = _ARCHETYPE_LINES.get(archetype, {}).get(stance) or []
    if arche and rng.random() < 0.5:
        return str(rng.choice(arche)), False
    # 4) generic
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

        persona = _persona(agent.archetype, mean_op, agent.id)
        template, used_scenario = _pick_template(
            rng, agent.archetype, stance, context, persona
        )
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
                position=tuple(agent.position),
            )
        )
    return voices


# ---------------------------------------------------------------------------
# Event-driven REACTION voices (placement / scenario), tied to specific zones+agents.
# ---------------------------------------------------------------------------
_PLACEMENT_LINES = {
    "solar": [
        "Panels going up near me in {zone} — about time.",
        "Solar on our block in {zone}? I'm here for it.",
        "Nice to see rooftop solar finally reaching {zone}.",
    ],
    "battery": [
        "A battery near my building in {zone}, finally — backup when we need it.",
        "Storage in {zone} means the lights stay on. Good call.",
        "Glad {zone} is getting battery storage — peace of mind.",
    ],
    "wind": [
        "A turbine near {zone}? Clean power — I'll keep an ear out for noise.",
        "Wind coming to {zone}; let's see how it spins.",
        "Didn't expect a turbine by {zone}, but I'll take the clean energy.",
    ],
    "microgrid": [
        "A community microgrid in {zone} — this is exactly what we asked for.",
        "Our own microgrid in {zone}? Resilience at last.",
        "{zone} getting a microgrid is the best news I've heard all year.",
    ],
    "ev_charger": [
        "EV chargers near my daily stops in {zone}? Finally — I can actually charge here.",
        "Shared charging in {zone} helps renters like me who can't plug in at home.",
        "A charging hub in {zone} — my commute just got a lot less stressful.",
        "Businesses in {zone} will love foot traffic from a new charger.",
    ],
}


# Opposition lines for a placed/proposed installation (NIMBY / cost / who-pays).
_PLACEMENT_OPPOSE = {
    "solar": [
        "Solar going up in {zone}? Who's footing the bill — and will it reach renters?",
        "Panels in {zone} are fine, just not on my hydro bill.",
    ],
    "battery": [
        "A battery installation in {zone}? Hope it's safe and actually lowers bills.",
        "Storage in {zone} — sure, but who's paying for it?",
    ],
    "wind": [
        "A turbine proposed near me in {zone}? Hard no — the noise.",
        "Keep that wind turbine away from {zone}'s homes, please.",
    ],
    "microgrid": [
        "A microgrid in {zone}? Sounds pricey — show me it cuts bills first.",
        "Not sure {zone} needs its own grid — who maintains it?",
    ],
    "ev_charger": [
        "Another charger in {zone}? Hope it doesn't eat street parking.",
        "EV hubs in {zone} are fine — just don't block loading zones.",
        "Chargers in {zone} help some people, but congestion worries me.",
    ],
}

# Reaction lines for an individual-adoption PROGRAM, by program name.
_PROGRAM_LINES = {
    "rooftop_solar_rebate": {
        "support": [
            "I'm taking the rooftop-solar rebate in {zone} — finally affordable.",
            "A solar rebate for {zone}? Signing up today.",
        ],
        "oppose": [
            "A solar rebate in {zone}? Only helps people who own their roof.",
            "Rebates in {zone} sound nice, but renters get nothing.",
        ],
    },
    "ev_incentive": {
        "support": [
            "With this EV incentive, I'm finally going electric in {zone}.",
            "EV rebate in {zone}? My next car's electric.",
        ],
        "oppose": [
            "EV incentives in {zone} help the well-off buy cars — what about transit?",
        ],
    },
    "retrofit_grant": {
        "support": [
            "Taking the retrofit grant in {zone} — lower bills, warmer winters.",
            "A retrofit grant for {zone}? My drafty place needs it.",
        ],
        "oppose": [
            "Retrofit grants in {zone}? Landlords should pay, not tenants.",
        ],
    },
}
_PROGRAM_KIND = {
    "rooftop_solar_rebate": "solar",
    "retrofit_grant": "solar",
    "ev_incentive": "ev_charger",
}


def reaction_voices(
    sentiment,
    zones_by_id: dict,
    zone_idxs: list[int] | None,
    trigger: str,
    kind: str | None = None,
    n: int = 4,
    rng: np.random.Generator | None = None,
) -> list[AgentVoice]:
    """A few prompt REACTION voices from agents in the affected zones, NAMING the subject.

    trigger forms: "placement" (+kind) -> support/oppose the specific install; "program:<name>" or a
    bare program name -> support/oppose the program; otherwise a scenario type -> event-aware lines.
    Each voice's stance reflects the agent's own opinion toward the subject. Tagged with a subject
    `trigger` label + position. Sampled, keyless.
    """
    if sentiment.n == 0 or n <= 0:
        return []
    rng = rng or np.random.default_rng()
    if zone_idxs:
        pool = np.where(np.isin(sentiment.zone_idx, np.asarray(zone_idxs)))[0]
    else:
        pool = np.arange(sentiment.n)
    if len(pool) == 0:
        pool = np.arange(sentiment.n)
    idxs = rng.choice(pool, size=min(n, len(pool)), replace=False)

    program = None
    if trigger.startswith("program:"):
        program = trigger.split(":", 1)[1]
    elif trigger in _PROGRAM_LINES:
        program = trigger

    out: list[AgentVoice] = []
    for i in idxs:
        agent = sentiment.agents[int(i)]
        op = sentiment.opinion[int(i)]
        zone = zones_by_id.get(agent.zone_id)
        zone_name = zone.name if zone else "my area"

        if program and program in _PROGRAM_LINES:
            subj_kind = _PROGRAM_KIND.get(program, "solar")
            stance = "support" if float(op[KIND_IDX[subj_kind]]) >= 0.5 else "oppose"
            pool_lines = (
                _PROGRAM_LINES[program].get(stance)
                or _PROGRAM_LINES[program]["support"]
            )
            text = str(rng.choice(pool_lines)).format(zone=zone_name)
            topic, subject = subj_kind, f"program:{program}"
        elif (
            trigger == "placement" or trigger.startswith("placement")
        ) and kind in _PLACEMENT_LINES:
            # Stance toward THIS specific install = the agent's opinion of that kind.
            stance = "support" if float(op[KIND_IDX[kind]]) >= 0.5 else "oppose"
            lines = (
                _PLACEMENT_LINES[kind]
                if stance == "support"
                else _PLACEMENT_OPPOSE[kind]
            )
            text = str(rng.choice(lines)).format(zone=zone_name)
            topic, subject = kind, f"placement:{kind}"
        else:
            mean_op = float(op.mean())
            stance = _stance_for(mean_op)
            ki = int(np.argmax(op)) if stance != "oppose" else int(np.argmin(op))
            topic = KINDS[ki]
            persona = _persona(agent.archetype, mean_op, agent.id)
            template, _ = _pick_template(rng, agent.archetype, stance, trigger, persona)
            text = template.format(topic=_KIND_NOUN[topic], zone=zone_name)
            subject = trigger

        out.append(
            AgentVoice(
                agent_id=agent.id,
                zone_id=agent.zone_id,
                archetype=agent.archetype,
                avatar_seed=agent.id,
                text=text,
                stance=stance,  # type: ignore[arg-type]
                topic=topic,
                position=tuple(agent.position),
                trigger=subject,
            )
        )
    return out
