"""Agentic siting planner (tool-calling) with auto + step modes.

- Provider-agnostic: Anthropic preferred for tool-use, OpenAI-compatible "feather" fallback.
- NO key -> deterministic "planner-lite" that runs the greedy optimizer so the feature still works.
- Streams events: {type:"thought"} | {type:"tool_call"} | {type:"tool_result"}
                  | {type:"placement"} | {type:"done"} | {type:"error"}.
- Guardrails: <=25 iterations, budget cap, arg validation (no absurd placements).
- step mode: before each *mutating* tool the planner awaits an injected `confirm` callback;
  the WS handler wires that to client approve/reject messages. POST has no pause -> auto only.

Implemented as an async generator yielding event dicts. The WS handler sends each; the REST
handler collects them into a list.
"""

from __future__ import annotations

import json
import logging
from typing import AsyncIterator, Awaitable, Callable

from . import config
from .models import InfraCreate
from .optimizer import DEFAULT_CAPACITY_KW, candidate_cost, optimize

log = logging.getLogger("wattif.planner")

DEFAULT_BUDGET_CAD = 60_000_000.0
MAX_ITERATIONS = 25
MAX_SIM_TICKS = 60
TORONTO_BBOX = (-79.7, 43.55, -79.1, 43.86)  # lng_min, lat_min, lng_max, lat_max

ConfirmFn = Callable[[dict], Awaitable[bool]]


# ---------------------------------------------------------------------------
# Tool schemas (single source -> Anthropic + OpenAI shapes)
# ---------------------------------------------------------------------------
_TOOLS: list[dict] = [
    {
        "name": "get_city_state",
        "description": "Summary of the city: zone count, placed infra, and the highest energy-burden zones with low coverage (best equity targets).",
        "input_schema": {"type": "object", "properties": {}, "required": []},
    },
    {
        "name": "get_metrics",
        "description": "Current simulation metrics (coverage, equity, emissions, cost, approval).",
        "input_schema": {"type": "object", "properties": {}, "required": []},
    },
    {
        "name": "get_budget",
        "description": "Remaining capital budget (CAD) for this planning run.",
        "input_schema": {"type": "object", "properties": {}, "required": []},
    },
    {
        "name": "optimize",
        "description": "Rank candidate sites. Returns recommendations with zoneId, kind, coverage and equity gains.",
        "input_schema": {
            "type": "object",
            "properties": {
                "kind": {
                    "type": "string",
                    "enum": ["solar", "wind", "battery", "microgrid", "ev_charger"],
                },
                "n": {"type": "integer", "minimum": 1, "maximum": 15},
            },
            "required": [],
        },
    },
    {
        "name": "place_infrastructure",
        "description": "Place an installation in a zone (by zoneId) or at a [lng,lat] position. Costs budget.",
        "input_schema": {
            "type": "object",
            "properties": {
                "kind": {
                    "type": "string",
                    "enum": ["solar", "wind", "battery", "microgrid", "ev_charger"],
                },
                "zoneId": {"type": "string"},
                "position": {
                    "type": "array",
                    "items": {"type": "number"},
                    "minItems": 2,
                    "maxItems": 2,
                },
                "capacityKw": {"type": "number", "minimum": 100, "maximum": 50000},
            },
            "required": ["kind"],
        },
    },
    {
        "name": "remove_infrastructure",
        "description": "Remove a previously placed installation by id (refunds its cost to the budget).",
        "input_schema": {
            "type": "object",
            "properties": {"id": {"type": "string"}},
            "required": ["id"],
        },
    },
    {
        "name": "run_simulation",
        "description": "Advance the simulation by N months to see the effect of placements.",
        "input_schema": {
            "type": "object",
            "properties": {"ticks": {"type": "integer", "minimum": 1, "maximum": 60}},
            "required": ["ticks"],
        },
    },
    {
        "name": "launch_program",
        "description": (
            "Launch an INDIVIDUAL-adoption incentive program so more households adopt over time "
            "(distributed adoption, distinct from placing infrastructure). Use for prompts like "
            "'offer a rooftop solar rebate in high-burden neighbourhoods'."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "program": {
                    "type": "string",
                    "enum": ["rooftop_solar_rebate", "ev_incentive", "retrofit_grant"],
                },
                "scope": {
                    "type": "string",
                    "description": "a zoneId, 'high_burden', or 'all'",
                },
                "intensity": {"type": "number", "minimum": 0.1, "maximum": 2},
            },
            "required": ["program"],
        },
    },
]

MUTATING_TOOLS = {"place_infrastructure", "remove_infrastructure", "launch_program"}


def _anthropic_tools() -> list[dict]:
    return _TOOLS


def _openai_tools() -> list[dict]:
    return [
        {
            "type": "function",
            "function": {
                "name": t["name"],
                "description": t["description"],
                "parameters": t["input_schema"],
            },
        }
        for t in _TOOLS
    ]


# ---------------------------------------------------------------------------
# Tool execution against the World
# ---------------------------------------------------------------------------
class PlannerTools:
    def __init__(self, world, budget_cad: float):
        self.world = world
        self.engine = world.engine
        self.budget_total = budget_cad
        self.spent = 0.0
        self.placements: list[dict] = []  # infra placed this run (camelCase dicts)
        self.guard_intent: str | None = None

    @property
    def remaining(self) -> float:
        return self.budget_total - self.spent

    def protected_note(self) -> str | None:
        """A one-line note about protected no-build zones the planner must avoid, or None."""
        names = [
            self.engine.zones[i].name
            for i in range(self.engine.num_zones)
            if bool(self.engine.zone_no_build[i])
        ]
        if not names:
            return None
        shown = ", ".join(names[:3])
        more = f" and {len(names) - 3} more" if len(names) > 3 else ""
        return (
            f"Avoiding {len(names)} protected area(s) ({shown}{more}) — renewables can't be "
            f"sited in environmentally-significant zones."
        )

    def execute(self, name: str, args: dict) -> dict:
        from .planner_intent import allows_tool

        if self.guard_intent is not None and not allows_tool(self.guard_intent, name):
            return {
                "blocked": True,
                "error": (
                    f"Tool '{name}' is not allowed for '{self.guard_intent}' intent. "
                    "Only explicit placement requests may mutate infrastructure."
                ),
            }
        try:
            fn = getattr(self, f"_t_{name}", None)
            if fn is None:
                return {"error": f"unknown tool {name}"}
            return fn(args or {})
        except Exception as exc:  # noqa: BLE001 — surface as tool error so the model adapts
            return {"error": str(exc)}

    # --- read tools ---
    def _t_get_city_state(self, _args: dict) -> dict:
        tick = self.engine.current_tick()
        cov = {d.zone_id: d.coverage_pct for d in tick.zone_deltas}
        # equity targets: high burden + low coverage
        ranked = sorted(
            self.engine.zones,
            key=lambda z: z.demographics.energy_burden_index - cov.get(z.id, 0.0),
            reverse=True,
        )
        targets = [
            {
                "zoneId": z.id,
                "name": z.name,
                "energyBurden": z.demographics.energy_burden_index,
                "coveragePct": round(cov.get(z.id, 0.0), 3),
                "solarPotential": z.solar_potential,
                "windPotential": z.wind_potential,
            }
            for z in ranked[:8]
        ]
        return {
            "zones": self.engine.num_zones,
            "placedInfra": len(self.engine.infra),
            "tick": self.engine.tick,
            "equityTargets": targets,
        }

    def _t_get_metrics(self, _args: dict) -> dict:
        return self.engine.current_metrics().model_dump(by_alias=True)

    def _t_get_budget(self, _args: dict) -> dict:
        return {
            "budgetCad": self.budget_total,
            "spentCad": round(self.spent, 2),
            "remainingCad": round(self.remaining, 2),
        }

    def _t_optimize(self, args: dict) -> dict:
        kind = args.get("kind")
        n = int(args.get("n", 5))
        recs = optimize(self.engine, kind=kind, n=n)
        out = []
        for r in recs:
            zi = self.engine._nearest_zone(r.position)
            out.append(
                {
                    "zoneId": self.engine.zones[zi].id,
                    "kind": r.kind,
                    "expectedCoverageGain": r.expected_coverage_gain,
                    "equityGain": r.equity_gain,
                    "score": r.score,
                    "rationale": r.rationale,
                }
            )
        return {"recommendations": out}

    # --- mutating tools ---
    def _t_place_infrastructure(self, args: dict) -> dict:
        kind = args.get("kind")
        if kind not in DEFAULT_CAPACITY_KW:
            return {"error": f"invalid kind {kind!r}"}
        capacity = args.get("capacityKw")
        capacity = (
            float(capacity) if capacity is not None else DEFAULT_CAPACITY_KW[kind]
        )
        if not (100 <= capacity <= 50000):
            return {"error": "capacityKw must be 100..50000"}

        position = args.get("position")
        zone_id = args.get("zoneId")
        if zone_id:
            zone = self.world.zones_by_id.get(zone_id)
            if zone is None:
                return {"error": f"unknown zoneId {zone_id!r}"}
            zi = next(
                (i for i, z in enumerate(self.engine.zones) if z.id == zone_id), None
            )
            if zi is not None and bool(self.engine.zone_no_build[zi]):
                return {"error": f"{zone_id} is a protected no-build zone"}
            position = list(zone.centroid)
        if not position or len(position) != 2:
            return {"error": "provide zoneId or a [lng,lat] position"}
        lng, lat = float(position[0]), float(position[1])
        if not (
            TORONTO_BBOX[0] <= lng <= TORONTO_BBOX[2]
            and TORONTO_BBOX[1] <= lat <= TORONTO_BBOX[3]
        ):
            return {"error": "position outside Toronto bounds"}

        cost = candidate_cost(kind, capacity)
        if cost > self.remaining:
            return {
                "error": f"insufficient budget: needs {cost:.0f}, {self.remaining:.0f} left"
            }

        infra = self.world.place_infra(
            InfraCreate(
                kind=kind, position=(lng, lat), capacity_kw=capacity, status="active"
            )
        )
        self.spent += infra.cost_cad
        dump = infra.model_dump(by_alias=True)
        self.placements.append(dump)
        return {"placed": dump, "remainingCad": round(self.remaining, 2)}

    def _t_remove_infrastructure(self, args: dict) -> dict:
        iid = args.get("id")
        infra = self.engine.infra.get(iid)
        if infra is None:
            return {"error": f"no infra {iid!r}"}
        refund = infra.cost_cad
        if self.world.remove_infra(iid):
            self.spent = max(0.0, self.spent - refund)
            return {"removed": iid, "remainingCad": round(self.remaining, 2)}
        return {"error": f"could not remove {iid!r}"}

    def _t_run_simulation(self, args: dict) -> dict:
        ticks = min(int(args.get("ticks", 1)), MAX_SIM_TICKS)
        metrics = self.engine.step_many(ticks)
        return {"ranTicks": ticks, "metrics": metrics.model_dump(by_alias=True)}

    def _t_launch_program(self, args: dict) -> dict:
        program = args.get("program")
        scope = args.get("scope") or args.get("zoneId") or "all"
        intensity = float(args.get("intensity", 1.0) or 1.0)
        return self.world.launch_program(program, scope, intensity)


# ---------------------------------------------------------------------------
# System prompt
# ---------------------------------------------------------------------------
def _system_prompt(
    goal: str | None,
    budget: float,
    dataset_context: str | None = None,
) -> str:
    base = (
        "You are the WattIf planning copilot for Toronto. Reason broadly; act narrowly.\n"
        "Answer project/planning questions directly from context when possible.\n"
        "Uploaded existing infrastructure is read-only context — not proposed infrastructure.\n"
        "Synthetic cohort concerns are synthetic, not real residents or public consultation.\n"
        "Do NOT place, build, remove, launch programs, or auto-optimize-to-place unless the user "
        "explicitly asks to place/build/add/auto-place infrastructure.\n"
        "For recommendation questions, suggest actions first; wait for explicit placement "
        "instruction before mutating the proposal.\n"
        f"Budget: {budget:,.0f} CAD. {('User goal: ' + goal) if goal else ''}\n"
        "When explicitly asked to place infrastructure: inspect city state + metrics, call optimize "
        "for candidate sites, place high-value installations (favor high-burden zones), optionally "
        "run simulation to verify. Keep thoughts to one short sentence before each tool call."
    )
    if dataset_context:
        base += f"\n\n{dataset_context}"
    return base


# ---------------------------------------------------------------------------
# Planner-lite (no key): deterministic greedy optimizer as a planner
# ---------------------------------------------------------------------------
async def _planner_lite(
    tools: PlannerTools, goal: str | None, confirm: ConfirmFn | None = None
) -> AsyncIterator[dict]:
    goal_txt = f" Targeting: {goal}." if goal else ""
    yield {
        "type": "thought",
        "text": (
            f"Surveying the city for the highest-impact, equity-weighted sites within a "
            f"{tools.budget_total:,.0f} CAD budget.{goal_txt}"
        ),
    }

    yield {"type": "tool_call", "name": "get_city_state", "args": {}}
    state = tools.execute("get_city_state", {})
    yield {"type": "tool_result", "name": "get_city_state", "result": state}
    top = state.get("equityTargets", [])[:3]
    if top:
        names = ", ".join(f"{t['name']} (burden {t['energyBurden']:.2f})" for t in top)
        yield {
            "type": "thought",
            "text": f"Highest energy-burden, under-served zones: {names}. Prioritizing these.",
        }
    note = tools.protected_note()
    if note:
        yield {"type": "thought", "text": note}

    yield {"type": "tool_call", "name": "optimize", "args": {"n": 8}}
    res = tools.execute("optimize", {"n": 8})
    yield {"type": "tool_result", "name": "optimize", "result": res}

    placed = 0
    skipped_budget = 0
    for rec in res.get("recommendations", []):
        if tools.remaining <= 0:
            yield {"type": "thought", "text": "Budget exhausted — stopping placements."}
            break
        # Narrate the decision with the optimizer's specific, grounded rationale.
        cost = candidate_cost(rec["kind"], DEFAULT_CAPACITY_KW[rec["kind"]])
        yield {"type": "thought", "text": f"{rec['rationale']} Est. {cost:,.0f} CAD."}
        args = {"kind": rec["kind"], "zoneId": rec["zoneId"]}
        yield {"type": "tool_call", "name": "place_infrastructure", "args": args}
        # step mode: pause for client approval before each placement (works without a key).
        if not await _maybe_confirm(
            {"name": "place_infrastructure", "args": args}, confirm
        ):
            yield {
                "type": "tool_result",
                "name": "place_infrastructure",
                "result": {"rejected": True},
            }
            yield {
                "type": "thought",
                "text": f"Skipping {rec['kind']} in {rec['zoneId']} — rejected.",
            }
            continue
        pres = tools.execute("place_infrastructure", args)
        yield {"type": "tool_result", "name": "place_infrastructure", "result": pres}
        if "placed" in pres:
            placed += 1
            yield {"type": "placement", "infra": pres["placed"]}
        elif "budget" in str(pres.get("error", "")).lower():
            skipped_budget += 1

    yield {
        "type": "thought",
        "text": f"Placed {placed} installations. Running 24 months to verify the impact.",
    }
    yield {"type": "tool_call", "name": "run_simulation", "args": {"ticks": 24}}
    sim = tools.execute("run_simulation", {"ticks": 24})
    yield {"type": "tool_result", "name": "run_simulation", "result": sim}

    m = sim.get("metrics", {})
    tail = f" Skipped {skipped_budget} site(s) over budget." if skipped_budget else ""
    yield {
        "type": "done",
        "summary": (
            f"Placed {placed} installations (spent {tools.spent:,.0f} of "
            f"{tools.budget_total:,.0f} CAD), reaching {m.get('coveragePct', 0) * 100:.1f}% city "
            f"coverage, {m.get('equityScore', 0) * 100:.0f}% equity, and "
            f"{m.get('approvalPct', 0) * 100:.0f}% public approval after two years.{tail}"
        ),
        "placements": tools.placements,
        "spentCad": round(tools.spent, 2),
    }


# ---------------------------------------------------------------------------
# Scripted "demo" planner — deterministic, NO network. Exercises the FULL tool
# surface (get_city_state, get_metrics, get_budget, optimize, place, run_simulation)
# with LLM-style first-person narration so the agentic loop is demoable with no key.
# ---------------------------------------------------------------------------
async def _planner_demo(
    tools: PlannerTools, goal: str | None, confirm: ConfirmFn | None = None
) -> AsyncIterator[dict]:
    goal_txt = f" My objective: {goal}." if goal else ""
    yield {
        "type": "thought",
        "text": f"Let me start by reading the city's current state and metrics.{goal_txt}",
    }

    yield {"type": "tool_call", "name": "get_city_state", "args": {}}
    state = tools.execute("get_city_state", {})
    yield {"type": "tool_result", "name": "get_city_state", "result": state}

    yield {"type": "tool_call", "name": "get_metrics", "args": {}}
    m0 = tools.execute("get_metrics", {})
    yield {"type": "tool_result", "name": "get_metrics", "result": m0}
    yield {
        "type": "thought",
        "text": (
            f"Right now the city is at {m0.get('coveragePct', 0) * 100:.1f}% renewable coverage, "
            f"{m0.get('equityScore', 0) * 100:.0f}% equity, {m0.get('approvalPct', 0) * 100:.0f}% approval. "
            f"I want to lift coverage while serving high energy-burden neighbourhoods first."
        ),
    }

    top = state.get("equityTargets", [])[:3]
    if top:
        names = ", ".join(t["name"] for t in top)
        yield {
            "type": "thought",
            "text": f"The most under-served high-burden zones are {names}. Let me rank concrete sites.",
        }
    note = tools.protected_note()
    if note:
        yield {"type": "thought", "text": note}

    yield {"type": "tool_call", "name": "optimize", "args": {"n": 8}}
    res = tools.execute("optimize", {"n": 8})
    yield {"type": "tool_result", "name": "optimize", "result": res}

    placed = 0
    for idx, rec in enumerate(res.get("recommendations", [])):
        if tools.remaining <= 0:
            yield {
                "type": "thought",
                "text": "I've used the budget — time to stop and verify.",
            }
            break
        yield {
            "type": "thought",
            "text": rec.get("rationale", f"Placing {rec['kind']} in {rec['zoneId']}."),
        }
        args = {"kind": rec["kind"], "zoneId": rec["zoneId"]}
        yield {"type": "tool_call", "name": "place_infrastructure", "args": args}
        if not await _maybe_confirm(
            {"name": "place_infrastructure", "args": args}, confirm
        ):
            yield {
                "type": "tool_result",
                "name": "place_infrastructure",
                "result": {"rejected": True},
            }
            yield {
                "type": "thought",
                "text": "Understood — skipping that one and moving on.",
            }
            continue
        pres = tools.execute("place_infrastructure", args)
        yield {"type": "tool_result", "name": "place_infrastructure", "result": pres}
        if "placed" in pres:
            placed += 1
            yield {"type": "placement", "infra": pres["placed"]}
        # Check the budget every couple of placements (realistic agent behaviour).
        if idx % 2 == 1:
            yield {"type": "tool_call", "name": "get_budget", "args": {}}
            b = tools.execute("get_budget", {})
            yield {"type": "tool_result", "name": "get_budget", "result": b}
            yield {
                "type": "thought",
                "text": f"{b['remainingCad']:,.0f} CAD left — I'll keep prioritizing equity.",
            }

    yield {
        "type": "thought",
        "text": f"Placed {placed} installations. Let me fast-forward two years to confirm the impact.",
    }
    yield {"type": "tool_call", "name": "run_simulation", "args": {"ticks": 24}}
    sim = tools.execute("run_simulation", {"ticks": 24})
    yield {"type": "tool_result", "name": "run_simulation", "result": sim}
    m1 = sim.get("metrics", {})

    d_cov = (m1.get("coveragePct", 0) - m0.get("coveragePct", 0)) * 100
    yield {
        "type": "done",
        "summary": (
            f"Placed {placed} installations for {tools.spent:,.0f} CAD, prioritizing high "
            f"energy-burden neighbourhoods. Over two years coverage rose to "
            f"{m1.get('coveragePct', 0) * 100:.1f}% (+{d_cov:.1f} pts), equity to "
            f"{m1.get('equityScore', 0) * 100:.0f}%, approval to {m1.get('approvalPct', 0) * 100:.0f}%."
        ),
        "placements": tools.placements,
        "spentCad": round(tools.spent, 2),
    }


# ---------------------------------------------------------------------------
# LLM planner (Anthropic tool-use / feather function-calling)
# ---------------------------------------------------------------------------
async def _maybe_confirm(event: dict, confirm: ConfirmFn | None) -> bool:
    if confirm is None:
        return True
    return await confirm(event)


async def _planner_anthropic(
    tools: PlannerTools,
    goal: str | None,
    budget: float,
    confirm: ConfirmFn | None,
    dataset_context: str | None = None,
) -> AsyncIterator[dict]:
    import anthropic

    client = anthropic.Anthropic(api_key=config.ANTHROPIC_API_KEY)
    system = _system_prompt(goal, budget, dataset_context)
    messages: list[dict] = [
        {"role": "user", "content": "Plan the city's renewable build-out now."}
    ]

    for _ in range(MAX_ITERATIONS):
        resp = client.messages.create(
            model=config.CLAUDE_MODEL,
            max_tokens=1024,
            system=[
                {"type": "text", "text": system, "cache_control": {"type": "ephemeral"}}
            ],
            tools=_anthropic_tools(),
            messages=messages,
        )
        # Surface text as thoughts.
        for block in resp.content:
            if block.type == "text" and block.text.strip():
                yield {"type": "thought", "text": block.text.strip()}

        tool_uses = [b for b in resp.content if b.type == "tool_use"]
        if resp.stop_reason != "tool_use" or not tool_uses:
            final = next(
                (b.text for b in resp.content if b.type == "text"), "Planning complete."
            )
            yield {
                "type": "done",
                "summary": final,
                "placements": tools.placements,
                "spentCad": round(tools.spent, 2),
            }
            return

        messages.append({"role": "assistant", "content": resp.content})
        results = []
        for tu in tool_uses:
            args = tu.input or {}
            yield {"type": "tool_call", "name": tu.name, "args": args}
            if tu.name in MUTATING_TOOLS and not await _maybe_confirm(
                {"name": tu.name, "args": args}, confirm
            ):
                result = {"rejected": True, "note": "user rejected this action"}
            else:
                result = tools.execute(tu.name, args)
                if "placed" in result:
                    yield {"type": "placement", "infra": result["placed"]}
            yield {"type": "tool_result", "name": tu.name, "result": result}
            results.append(
                {
                    "type": "tool_result",
                    "tool_use_id": tu.id,
                    "content": json.dumps(result),
                }
            )
            if tools.remaining <= 0:
                yield {"type": "thought", "text": "Budget exhausted — wrapping up."}
        messages.append({"role": "user", "content": results})

    yield {
        "type": "done",
        "summary": "Reached the iteration limit.",
        "placements": tools.placements,
        "spentCad": round(tools.spent, 2),
    }


async def _planner_feather(
    tools: PlannerTools,
    goal: str | None,
    budget: float,
    confirm: ConfirmFn | None,
    dataset_context: str | None = None,
) -> AsyncIterator[dict]:
    from openai import OpenAI

    client = OpenAI(api_key=config.FEATHER_API_KEY, base_url=config.FEATHER_BASE_URL)
    messages: list[dict] = [
        {"role": "system", "content": _system_prompt(goal, budget, dataset_context)},
        {"role": "user", "content": "Plan the city's renewable build-out now."},
    ]
    oai_tools = _openai_tools()

    for _ in range(MAX_ITERATIONS):
        resp = client.chat.completions.create(
            model=config.FEATHER_MODEL,
            max_tokens=1024,
            messages=messages,
            tools=oai_tools,
        )
        msg = resp.choices[0].message
        if msg.content and msg.content.strip():
            yield {"type": "thought", "text": msg.content.strip()}

        tool_calls = msg.tool_calls or []
        if not tool_calls:
            yield {
                "type": "done",
                "summary": msg.content or "Planning complete.",
                "placements": tools.placements,
                "spentCad": round(tools.spent, 2),
            }
            return

        messages.append(msg.model_dump())
        for tc in tool_calls:
            name = tc.function.name
            try:
                args = json.loads(tc.function.arguments or "{}")
            except json.JSONDecodeError:
                args = {}
            yield {"type": "tool_call", "name": name, "args": args}
            if name in MUTATING_TOOLS and not await _maybe_confirm(
                {"name": name, "args": args}, confirm
            ):
                result = {"rejected": True, "note": "user rejected this action"}
            else:
                result = tools.execute(name, args)
                if "placed" in result:
                    yield {"type": "placement", "infra": result["placed"]}
            yield {"type": "tool_result", "name": name, "result": result}
            messages.append(
                {"role": "tool", "tool_call_id": tc.id, "content": json.dumps(result)}
            )

    yield {
        "type": "done",
        "summary": "Reached the iteration limit.",
        "placements": tools.placements,
        "spentCad": round(tools.spent, 2),
    }


# ---------------------------------------------------------------------------
# Real-time multi-turn planner chat (headline) — keyless via the demo provider.
# Keeps the world + conversation across turns; reacts in-character to scenarios
# injected mid-conversation.
# ---------------------------------------------------------------------------

# Which technologies a scenario makes the planner favour when it reacts.
_REACTION_KINDS: dict[str, list[str]] = {
    "blackout": ["microgrid", "battery"],
    "earthquake": ["microgrid", "battery"],
    "ice_storm": ["microgrid", "battery"],
    "cold_snap": ["battery", "microgrid"],
    "heatwave": ["solar", "battery"],
    "drought": ["solar", "battery"],
    "gas_spike": ["solar", "battery"],
    "solar_approved": ["solar"],
    "policy_incentive": ["solar", "battery"],
    "wind_lull": ["battery", "solar"],
    "population_boom": ["microgrid", "battery"],
    "factory_opening": ["microgrid", "battery"],
    "ev_surge": ["ev_charger", "battery", "microgrid"],
    "turbine_noise_complaint": ["solar", "microgrid"],
    "grid_upgrade": ["solar", "wind"],
}

_INTENT_KEYWORDS = {
    "battery": ["battery", "batteries", "storage", "store"],
    "solar": ["solar", "panel", "panels", "rooftop", "pv"],
    "wind": ["wind", "turbine", "turbines"],
    "microgrid": ["microgrid", "micro-grid", "community", "resilien"],
    "ev_charger": ["ev charger", "ev chargers", "charging hub", "charging station", "charger"],
}


def parse_intent(text: str) -> dict:
    """Heuristic NL intent parse for the keyless demo chat.

    Returns {kind: str|None, n: int, zone_query: str|None}.
    """
    t = (text or "").lower()
    kind = None
    for k, words in _INTENT_KEYWORDS.items():
        if any(w in t for w in words):
            kind = k
            break
    # zone hint phrases (facilities.json will refine "hospitals"/"shelters" later)
    zone_query = None
    for q in (
        "hospital",
        "shelter",
        "downtown",
        "waterfront",
        "high burden",
        "high-burden",
        "equity",
        "low income",
        "low-income",
    ):
        if q in t:
            zone_query = q
            break
    # rough count
    n = 3
    for num, val in (
        ("one", 1),
        ("two", 2),
        ("three", 3),
        ("four", 4),
        ("five", 5),
        ("a few", 3),
        ("several", 4),
    ):
        if num in t:
            n = val
            break
    import re as _re

    m = _re.search(r"\b(\d+)\b", t)
    if m:
        n = max(1, min(int(m.group(1)), 10))

    # Individual-adoption program intent (distinct from placing infrastructure).
    program = None
    if "ev" in t and any(w in t for w in ("incentive", "rebate", "subsidy", "program")):
        program = "ev_incentive"
    elif any(w in t for w in ("retrofit", "efficiency", "grant")):
        program = "retrofit_grant"
    elif any(
        w in t for w in ("rebate", "incentive", "subsidy", "adopt", "rooftop program")
    ):
        program = "rooftop_solar_rebate"
    scope = (
        "high_burden"
        if (
            zone_query
            in ("high burden", "high-burden", "equity", "low income", "low-income")
        )
        else "all"
    )
    return {
        "kind": kind,
        "n": n,
        "zone_query": zone_query,
        "program": program,
        "scope": scope,
    }


class PlannerChat:
    """A long-lived planning conversation over one session world.

    Persists the world (via World), a shared budget tracker, and (for LLM providers) the
    message history across turns. Scenarios injected mid-turn are observed and reacted to.
    """

    def __init__(
        self,
        world,
        budget_cad: float,
        goal: str | None = None,
        dataset_context: str | None = None,
        project_id: str | None = None,
        proposal_id: str | None = None,
    ):
        self.world = world
        self.tools = PlannerTools(world, budget_cad)
        self.goal = goal
        self.dataset_context = dataset_context
        self.project_id = project_id
        self.proposal_id = proposal_id
        self.provider = config.llm_provider()
        self.pending_scenarios: list = []  # Scenario objects injected since last observation
        self.messages: list[dict] = []  # LLM conversation history
        self.turn_count = 0

    def inject_scenario(self, scn) -> None:
        self.pending_scenarios.append(scn)

    def _drain_scenarios(self) -> list:
        scns, self.pending_scenarios = self.pending_scenarios, []
        return scns

    def sync_context(
        self,
        *,
        project_id: str | None = None,
        proposal_id: str | None = None,
    ) -> None:
        """Refresh planner context when project/proposal changes mid-session."""
        from .cohort_context import build_planner_context

        if project_id is not None:
            self.project_id = project_id
        if proposal_id is not None:
            self.proposal_id = proposal_id
        self.dataset_context = build_planner_context(
            project_id=self.project_id, proposal_id=self.proposal_id
        )

    async def turn(
        self,
        user_message: str,
        confirm: ConfirmFn | None = None,
        intent: str | None = None,
    ):
        """Run one planning turn for a user message, streaming events."""
        from .planner_copilot import (
            is_copilot_intent,
            run_copilot_turn,
            run_recommendation_turn,
        )
        from .planner_intent import classify_planner_intent

        self.turn_count += 1
        bucket = classify_planner_intent(user_message, intent)
        self.tools.guard_intent = bucket

        try:
            if is_copilot_intent(bucket):
                async for ev in run_copilot_turn(bucket, self, user_message):
                    yield ev
                return

            if bucket == "recommendation":
                async for ev in run_recommendation_turn(self, user_message, confirm):
                    yield ev
                return

            if bucket == "explicit_placement":
                self.tools.guard_intent = "explicit_placement"
                parsed = parse_intent(user_message)
                if parsed.get("program"):
                    async for ev in self._demo_program_turn(parsed, confirm):
                        yield ev
                    return
                if self.provider in (None, "demo") or self.provider is None:
                    async for ev in self._demo_turn(user_message, confirm):
                        yield ev
                else:
                    try:
                        async for ev in self._llm_turn(user_message, confirm):
                            yield ev
                    except Exception as exc:  # noqa: BLE001
                        log.warning("LLM chat turn failed (%s); using demo turn", exc)
                        async for ev in self._demo_turn(user_message, confirm):
                            yield ev
                return

            async for ev in run_copilot_turn(
                "general_wattif_question", self, user_message
            ):
                yield ev
        except Exception as exc:  # noqa: BLE001 — always terminate cleanly for UI
            log.exception("planner turn failed")
            yield {
                "type": "error",
                "message": str(exc),
            }
            yield {
                "type": "done",
                "summary": (
                    "Something went wrong while processing that request. "
                    "Please retry or rephrase."
                ),
                "placements": self.tools.placements,
                "spentCad": round(self.tools.spent, 2),
            }

    async def _concern_recommendation_turn(
        self, user_message: str, confirm: ConfirmFn | None, auto_place: bool = True
    ):
        """Structured operator recommendations grounded in cohort concerns."""
        from .cohort_context import (
            fetch_concern_summaries,
            fetch_proposal_infra_summary,
        )
        from .concern_recommendations import build_concern_recommendations
        from .dataset_context import fetch_dataset_summaries

        yield {
            "type": "thought",
            "text": (
                "Operator mode: reviewing uploaded datasets, synthetic cohort concerns, "
                "and current proposal infrastructure before recommending changes."
            ),
        }
        await _sleep()

        concerns = fetch_concern_summaries(
            project_id=self.project_id, proposal_id=self.proposal_id
        )
        datasets = fetch_dataset_summaries(
            project_id=self.project_id, proposal_id=self.proposal_id
        )
        proposal_infra = fetch_proposal_infra_summary(proposal_id=self.proposal_id)

        yield {
            "type": "tool_call",
            "name": "get_metrics",
            "args": {},
        }
        metrics = self.tools.execute("get_metrics", {})
        yield {"type": "tool_result", "name": "get_metrics", "result": metrics}
        await _sleep()

        if not concerns:
            yield {
                "type": "thought",
                "text": (
                    "No cohort concerns found for this project/proposal — generate concerns "
                    "from uploaded datasets before expecting grounded recommendations."
                ),
            }
            await _sleep()

        rec = build_concern_recommendations(
            concerns=concerns,
            dataset_summaries=datasets,
            proposal_infra=proposal_infra,
            tools=self.tools,
            user_message=user_message,
        )
        yield {"type": "recommendation", "recommendation": rec}

        placed = 0
        if auto_place and concerns and rec.get("optional_tool_actions"):
            for action in rec.get("optional_tool_actions") or []:
                if action.get("name") != "place_infrastructure":
                    continue
                args = action.get("args") or {}
                yield {
                    "type": "thought",
                    "text": action.get("rationale")
                    or f"Applying concern-aware {args.get('kind')} placement.",
                }
                yield {"type": "tool_call", "name": "place_infrastructure", "args": args}
                if not await _maybe_confirm(
                    {"name": "place_infrastructure", "args": args}, confirm
                ):
                    yield {
                        "type": "tool_result",
                        "name": "place_infrastructure",
                        "result": {"rejected": True},
                    }
                    continue
                pres = self.tools.execute("place_infrastructure", args)
                yield {
                    "type": "tool_result",
                    "name": "place_infrastructure",
                    "result": pres,
                }
                if "placed" in pres:
                    placed += 1
                    yield {"type": "placement", "infra": pres["placed"]}
                await _sleep()

        if placed:
            yield {
                "type": "tool_call",
                "name": "run_simulation",
                "args": {"ticks": 12},
            }
            sim = self.tools.execute("run_simulation", {"ticks": 12})
            yield {"type": "tool_result", "name": "run_simulation", "result": sim}

        from .concern_recommendations import refresh_recommendation_after_actions

        rec = refresh_recommendation_after_actions(
            rec,
            proposal_infra=proposal_infra,
            session_placements=self.tools.placements,
            placed_count=placed,
            remaining_budget=self.tools.remaining,
        )

        self._maybe_persist_recommendation(rec, user_message)

        yield {
            "type": "done",
            "summary": rec.get("summary", "Concern-aware recommendations ready."),
            "recommendation": rec,
            "placements": self.tools.placements,
            "spentCad": round(self.tools.spent, 2),
        }

    def _maybe_persist_recommendation(self, rec: dict, user_message: str) -> None:
        if not self.proposal_id:
            return
        try:
            from .db.repositories import planner_runs as runs_repo
            from .db.repositories.base import PersistenceDisabledError

            runs_repo.create_run(
                proposal_id=self.proposal_id,
                mode="concern_recommendation",
                provider=self.provider or "demo",
                output={"userMessage": user_message, "recommendation": rec},
            )
        except PersistenceDisabledError:
            return
        except Exception as exc:  # noqa: BLE001 — optional persistence
            log.debug("planner recommendation persist skipped: %s", exc)

    # -- demo (keyless) turn --------------------------------------------
    def _react_observation(self):
        """If scenarios were injected, return (events, preferred_kinds) to react in-character."""
        scns = self._drain_scenarios()
        if not scns:
            return [], None
        events = []
        prefer: list[str] = []
        for scn in scns:
            events.append(
                {"type": "scenario", "scenario": scn.model_dump(by_alias=True)}
            )
            kinds = _REACTION_KINDS.get(scn.type, ["microgrid"])
            prefer = kinds
            verb = {
                "blackout": "A blackout just hit",
                "earthquake": "An earthquake just struck",
                "heatwave": "A heatwave just set in",
                "ice_storm": "An ice storm just hit",
                "gas_spike": "Gas prices just spiked",
                "policy_incentive": "A new incentive just passed",
            }.get(scn.type, f"A {scn.label} just occurred")
            events.append(
                {
                    "type": "thought",
                    "text": f"{verb} — pivoting to {' and '.join(kinds)} for resilience and to keep the most vulnerable zones served.",
                }
            )
            rxn = self.world.scenario_reaction_voices(scn, n=3)
            if rxn:
                events.append(
                    {
                        "type": "voices",
                        "trigger": scn.type,
                        "voices": [v.model_dump(by_alias=True) for v in rxn],
                    }
                )
        return events, prefer

    async def _demo_turn(self, user_message: str, confirm: ConfirmFn | None):
        intent = parse_intent(user_message)
        yield {
            "type": "thought",
            "text": f'Got it: "{user_message.strip()}". Let me assess the city and act.',
        }
        await _sleep()

        # Program intent -> launch an individual-adoption incentive (distributed adoption).
        if intent.get("program"):
            async for ev in self._demo_program_turn(intent, confirm):
                yield ev
            return

        # Observe the world.
        yield {"type": "tool_call", "name": "get_metrics", "args": {}}
        m0 = self.tools.execute("get_metrics", {})
        yield {"type": "tool_result", "name": "get_metrics", "result": m0}
        await _sleep()

        note = self.tools.protected_note()
        if note:
            yield {"type": "thought", "text": note}
            await _sleep()

        # React to any scenario already pending before we start.
        react_events, prefer = self._react_observation()
        for ev in react_events:
            yield ev
            await _sleep()

        kind = (prefer[0] if prefer else None) or intent["kind"]
        n = intent["n"]
        yield {
            "type": "thought",
            "text": (
                f"Ranking {'resilient ' if prefer else ''}{kind or 'mixed'} sites"
                + (
                    f" focused on {intent['zone_query']} areas"
                    if intent["zone_query"]
                    else ""
                )
                + ", weighting high energy-burden neighbourhoods."
            ),
        }
        yield {
            "type": "tool_call",
            "name": "optimize",
            "args": {"kind": kind, "n": max(n, 5)},
        }
        res = self.tools.execute("optimize", {"kind": kind, "n": max(n, 5)})
        yield {"type": "tool_result", "name": "optimize", "result": res}
        await _sleep()

        placed = 0
        for rec in res.get("recommendations", []):
            if placed >= n or self.tools.remaining <= 0:
                break
            # Mid-turn scenario injection: observe + react, then re-rank toward resilient tech.
            react_events, new_prefer = self._react_observation()
            if react_events:
                for ev in react_events:
                    yield ev
                    await _sleep()
                rk = new_prefer[0] if new_prefer else kind
                yield {
                    "type": "tool_call",
                    "name": "optimize",
                    "args": {"kind": rk, "n": max(n, 5)},
                }
                res2 = self.tools.execute("optimize", {"kind": rk, "n": max(n, 5)})
                yield {"type": "tool_result", "name": "optimize", "result": res2}
                # continue placing from the new ranking
                res = res2
                await _sleep()
                # restart iteration over the new recommendations
                for rec2 in res.get("recommendations", []):
                    if placed >= n or self.tools.remaining <= 0:
                        break
                    async for ev in self._place(rec2, confirm):
                        yield ev
                        if ev.get("type") == "placement":
                            placed += 1
                    await _sleep()
                break

            async for ev in self._place(rec, confirm):
                yield ev
                if ev.get("type") == "placement":
                    placed += 1
            await _sleep()

        yield {
            "type": "thought",
            "text": f"Placed {placed} this turn. Running 12 months to confirm the impact.",
        }
        yield {"type": "tool_call", "name": "run_simulation", "args": {"ticks": 12}}
        sim = self.tools.execute("run_simulation", {"ticks": 12})
        yield {"type": "tool_result", "name": "run_simulation", "result": sim}
        m1 = sim.get("metrics", {})
        yield {
            "type": "done",
            "summary": (
                f"Done. Placed {placed} installation(s) this turn ({self.tools.spent:,.0f} CAD spent total). "
                f"Coverage {m1.get('coveragePct', 0) * 100:.1f}%, equity {m1.get('equityScore', 0) * 100:.0f}%, "
                f"approval {m1.get('approvalPct', 0) * 100:.0f}%. What next?"
            ),
            "placements": self.tools.placements,
            "spentCad": round(self.tools.spent, 2),
        }

    async def _demo_program_turn(self, intent: dict, confirm: ConfirmFn | None):
        program = intent["program"]
        scope = intent.get("scope", "all")
        label = {
            "rooftop_solar_rebate": "rooftop-solar rebate",
            "ev_incentive": "EV incentive",
            "retrofit_grant": "retrofit grant",
        }.get(program, program)
        where = (
            "high energy-burden neighbourhoods"
            if scope == "high_burden"
            else "the whole city"
        )
        yield {
            "type": "thought",
            "text": f"Launching a {label} across {where} to drive individual household adoption.",
        }

        # adoption baseline before
        before = sum(
            d.adoption_count for d in self.tools.engine.current_tick().zone_deltas
        )

        args = {"program": program, "scope": scope, "intensity": 1.0}
        yield {"type": "tool_call", "name": "launch_program", "args": args}
        if not await _maybe_confirm({"name": "launch_program", "args": args}, confirm):
            yield {
                "type": "tool_result",
                "name": "launch_program",
                "result": {"rejected": True},
            }
            yield {
                "type": "done",
                "summary": "Program cancelled.",
                "placements": self.tools.placements,
                "spentCad": round(self.tools.spent, 2),
            }
            return
        res = self.tools.execute("launch_program", args)
        yield {"type": "tool_result", "name": "launch_program", "result": res}
        rxn = self.world.reaction_voices(trigger=f"program:{program}", n=3)
        if rxn:
            yield {
                "type": "voices",
                "trigger": f"program:{program}",
                "voices": [v.model_dump(by_alias=True) for v in rxn],
            }
        await _sleep()

        yield {
            "type": "thought",
            "text": "Running 18 months to let households take up the incentive.",
        }
        yield {"type": "tool_call", "name": "run_simulation", "args": {"ticks": 18}}
        sim = self.tools.execute("run_simulation", {"ticks": 18})
        yield {"type": "tool_result", "name": "run_simulation", "result": sim}

        after_tick = self.tools.engine.current_tick()
        after = sum(d.adoption_count for d in after_tick.zone_deltas)
        m = sim.get("metrics", {})
        yield {
            "type": "done",
            "summary": (
                f"{label.capitalize()} active across {where}. Rooftop-solar adopters grew from "
                f"{before:,} to {after:,} households (+{after - before:,}) over 18 months; "
                f"coverage now {m.get('coveragePct', 0) * 100:.1f}%. What next?"
            ),
            "placements": self.tools.placements,
            "spentCad": round(self.tools.spent, 2),
        }

    async def _place(self, rec: dict, confirm: ConfirmFn | None):
        yield {
            "type": "thought",
            "text": rec.get("rationale", f"Placing {rec['kind']} in {rec['zoneId']}."),
        }
        args = {"kind": rec["kind"], "zoneId": rec["zoneId"]}
        yield {"type": "tool_call", "name": "place_infrastructure", "args": args}
        if not await _maybe_confirm(
            {"name": "place_infrastructure", "args": args}, confirm
        ):
            yield {
                "type": "tool_result",
                "name": "place_infrastructure",
                "result": {"rejected": True},
            }
            return
        pres = self.tools.execute("place_infrastructure", args)
        yield {"type": "tool_result", "name": "place_infrastructure", "result": pres}
        if "placed" in pres:
            yield {"type": "placement", "infra": pres["placed"]}
            rxn = self.world.reaction_voices(
                trigger="placement", zone_id=rec.get("zoneId"), kind=rec["kind"], n=2
            )
            if rxn:
                yield {
                    "type": "voices",
                    "trigger": "placement",
                    "voices": [v.model_dump(by_alias=True) for v in rxn],
                }

    # -- LLM turn (multi-turn history + scenario observations) ----------
    async def _llm_turn(self, user_message: str, confirm: ConfirmFn | None):
        if self.provider == "anthropic":
            async for ev in self._llm_turn_anthropic(user_message, confirm):
                yield ev
        else:
            async for ev in self._llm_turn_feather(user_message, confirm):
                yield ev

    async def _llm_turn_anthropic(self, user_message: str, confirm: ConfirmFn | None):
        import anthropic

        client = anthropic.Anthropic(api_key=config.ANTHROPIC_API_KEY)
        system = _system_prompt(
            self.goal, self.tools.budget_total, self.dataset_context
        )
        self.messages.append({"role": "user", "content": user_message})

        for _ in range(MAX_ITERATIONS):
            # Surface any injected scenario as an observation the model must react to.
            for ev in self._scenario_observations_for_llm():
                yield ev
            resp = client.messages.create(
                model=config.CLAUDE_MODEL,
                max_tokens=1024,
                system=[
                    {
                        "type": "text",
                        "text": system,
                        "cache_control": {"type": "ephemeral"},
                    }
                ],
                tools=_anthropic_tools(),
                messages=self.messages,
            )
            for block in resp.content:
                if block.type == "text" and block.text.strip():
                    yield {"type": "thought", "text": block.text.strip()}
            tool_uses = [b for b in resp.content if b.type == "tool_use"]
            if resp.stop_reason != "tool_use" or not tool_uses:
                final = next(
                    (b.text for b in resp.content if b.type == "text"),
                    "Done. What next?",
                )
                yield {
                    "type": "done",
                    "summary": final,
                    "placements": self.tools.placements,
                    "spentCad": round(self.tools.spent, 2),
                }
                return
            self.messages.append({"role": "assistant", "content": resp.content})
            results = []
            for tu in tool_uses:
                args = tu.input or {}
                yield {"type": "tool_call", "name": tu.name, "args": args}
                if tu.name in MUTATING_TOOLS and not await _maybe_confirm(
                    {"name": tu.name, "args": args}, confirm
                ):
                    result = {"rejected": True}
                else:
                    result = self.tools.execute(tu.name, args)
                    if "placed" in result:
                        yield {"type": "placement", "infra": result["placed"]}
                yield {"type": "tool_result", "name": tu.name, "result": result}
                results.append(
                    {
                        "type": "tool_result",
                        "tool_use_id": tu.id,
                        "content": json.dumps(result),
                    }
                )
            self.messages.append({"role": "user", "content": results})
        yield {
            "type": "done",
            "summary": "Reached the iteration limit for this turn.",
            "placements": self.tools.placements,
            "spentCad": round(self.tools.spent, 2),
        }

    async def _llm_turn_feather(self, user_message: str, confirm: ConfirmFn | None):
        from openai import OpenAI

        from .planner_tool_parse import (
            contains_raw_tool_call,
            merge_tool_calls,
        )

        client = OpenAI(
            api_key=config.FEATHER_API_KEY, base_url=config.FEATHER_BASE_URL
        )
        if not self.messages:
            self.messages.append(
                {
                    "role": "system",
                    "content": _system_prompt(
                        self.goal, self.tools.budget_total, self.dataset_context
                    ),
                }
            )
        self.messages.append({"role": "user", "content": user_message})
        oai_tools = _openai_tools()

        for _ in range(MAX_ITERATIONS):
            for ev in self._scenario_observations_for_llm():
                yield ev
            resp = client.chat.completions.create(
                model=config.FEATHER_MODEL,
                max_tokens=1024,
                messages=self.messages,
                tools=oai_tools,
            )
            msg = resp.choices[0].message
            merged_calls, clean_content = merge_tool_calls(
                msg.tool_calls, msg.content
            )
            raw_in_content = contains_raw_tool_call(msg.content or "")

            if clean_content:
                yield {"type": "thought", "text": clean_content}

            if not merged_calls:
                if raw_in_content:
                    summary = (
                        "I tried to call the optimizer, but the model returned malformed "
                        "tool syntax. Please retry or ask me to recommend without placing."
                    )
                    yield {
                        "type": "done",
                        "summary": summary,
                        "placements": self.tools.placements,
                        "spentCad": round(self.tools.spent, 2),
                    }
                    return
                yield {
                    "type": "done",
                    "summary": msg.content or "Done. What next?",
                    "placements": self.tools.placements,
                    "spentCad": round(self.tools.spent, 2),
                }
                return

            assistant_msg = msg.model_dump()
            if merged_calls and not msg.tool_calls:
                assistant_msg["tool_calls"] = [
                    {
                        "id": f"parsed_{c['name']}_{i}",
                        "type": "function",
                        "function": {
                            "name": c["name"],
                            "arguments": json.dumps(c["args"]),
                        },
                    }
                    for i, c in enumerate(merged_calls)
                ]
            self.messages.append(assistant_msg)

            for i, call in enumerate(merged_calls):
                name = call["name"]
                args = call.get("args") or {}
                tool_id = f"parsed_{name}_{i}"
                yield {"type": "tool_call", "name": name, "args": args}
                if name in MUTATING_TOOLS and not await _maybe_confirm(
                    {"name": name, "args": args}, confirm
                ):
                    result = {"rejected": True}
                else:
                    result = self.tools.execute(name, args)
                    if "placed" in result:
                        yield {"type": "placement", "infra": result["placed"]}
                yield {"type": "tool_result", "name": name, "result": result}
                self.messages.append(
                    {
                        "role": "tool",
                        "tool_call_id": tool_id,
                        "content": json.dumps(result),
                    }
                )

        yield {
            "type": "done",
            "summary": "Reached the iteration limit for this turn.",
            "placements": self.tools.placements,
            "spentCad": round(self.tools.spent, 2),
        }

    def _scenario_observations_for_llm(self):
        """Yield scenario events + push an observation into the LLM message history."""
        events = []
        for scn in self._drain_scenarios():
            events.append(
                {"type": "scenario", "scenario": scn.model_dump(by_alias=True)}
            )
            note = (
                f"OBSERVATION: a {scn.label} just occurred in the city ({scn.description}). "
                f"Adapt your plan in-character — prioritize resilient technologies and the most affected zones."
            )
            self.messages.append({"role": "user", "content": note})
        return events


async def _sleep(seconds: float = 0.05) -> None:
    """Small pause so events stream in real time (UI animates during a turn)."""
    import asyncio

    await asyncio.sleep(seconds)


# ---------------------------------------------------------------------------
# Public entry
# ---------------------------------------------------------------------------
async def run_planner(
    world,
    mode: str = "auto",
    goal: str | None = None,
    budget_cad: float | None = None,
    confirm: ConfirmFn | None = None,
    project_id: str | None = None,
    proposal_id: str | None = None,
) -> AsyncIterator[dict]:
    """Yield planner events. step mode uses `confirm` to gate mutating tools (WS only)."""
    from .cohort_context import build_planner_context, fetch_concern_summaries

    budget = budget_cad if budget_cad is not None else DEFAULT_BUDGET_CAD
    tools = PlannerTools(world, budget)
    provider = config.llm_provider()
    dataset_context = build_planner_context(
        project_id=project_id, proposal_id=proposal_id
    )
    concern_count = len(
        fetch_concern_summaries(project_id=project_id, proposal_id=proposal_id)
    )
    if dataset_context:
        yield {
            "type": "thought",
            "text": (
                "Noting uploaded datasets and synthetic cohort concerns as planning "
                f"context ({concern_count} concern(s); simulation unchanged)."
            ),
        }

    yield {
        "type": "thought",
        "text": f"Planner starting (mode={mode}, provider={provider or 'none'}, budget={budget:,.0f} CAD).",
    }

    step_confirm = confirm if mode == "step" else None

    if goal:
        chat = PlannerChat(
            world,
            budget,
            goal=goal,
            dataset_context=dataset_context,
            project_id=project_id,
            proposal_id=proposal_id,
        )
        async for ev in chat.turn(goal, step_confirm):
            yield ev
        return

    if provider is None:
        async for ev in _planner_lite(tools, goal, step_confirm):
            yield ev
        return

    if provider == "demo":
        # Scripted, deterministic, no network — exercises the full tool loop end-to-end.
        async for ev in _planner_demo(tools, goal, step_confirm):
            yield ev
        return

    try:
        runner = _planner_anthropic if provider == "anthropic" else _planner_feather
        async for ev in runner(
            tools, goal, budget, step_confirm, dataset_context=dataset_context
        ):
            yield ev
    except Exception as exc:  # noqa: BLE001 — fall back to deterministic planner-lite
        log.warning(
            "LLM planner (%s) failed (%s); falling back to planner-lite", provider, exc
        )
        yield {
            "type": "thought",
            "text": "LLM planner error — falling back to the deterministic optimizer.",
        }
        async for ev in _planner_lite(tools, goal, step_confirm):
            yield ev
