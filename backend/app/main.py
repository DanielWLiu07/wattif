"""WattIf FastAPI app: REST + WebSocket serving the docs/PLAN.md contract."""

from __future__ import annotations

import asyncio
import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI, HTTPException, Query, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware

from . import config
from .models import (
    Agent,
    AgentVoice,
    Flow,
    Infra,
    InfraCreate,
    OptimizeRequest,
    PlannerRunRequest,
    Recommendation,
    Scenario,
    ScenarioRequest,
    SimMetrics,
    StepRequest,
    Zone,
)
from . import ml_bridge
from .sim.llm import generate_rationales
from .state import get_world

logging.basicConfig(level=logging.INFO, format="%(levelname)s %(name)s: %(message)s")
log = logging.getLogger("wattif")


@asynccontextmanager
async def lifespan(app: FastAPI):
    world = get_world()
    log.info(
        "WattIf backend ready: %d zones, %d agents (data source=%s), LLM=%s",
        len(world.zones),
        len(world.agents),
        world.source,
        "on" if config.llm_enabled() else "off (rule-based fallback)",
    )
    yield


app = FastAPI(title="WattIf Backend", version="0.1.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[o.strip() for o in config.CORS_ORIGINS],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ---------------------------------------------------------------------------
# Health / meta
# ---------------------------------------------------------------------------
@app.get("/api/health")
def health() -> dict:
    world = get_world()
    return {
        "ok": True,
        "zones": len(world.zones),
        "agents": len(world.agents),
        "infra": len(world.engine.infra),
        "tick": world.engine.tick,
        "dataSource": world.source,
        "llmEnabled": config.llm_enabled(),
        "llmProvider": config.llm_provider(),
        "realLlm": config.real_llm_provider(),  # None when running on the scripted demo provider
        "mlAvailable": ml_bridge.ml_available(),
        "mlModels": ml_bridge.models_available(),
    }


# ---------------------------------------------------------------------------
# Zones / Agents
# ---------------------------------------------------------------------------
@app.get("/api/zones", response_model=list[Zone])
def get_zones() -> list[Zone]:
    return get_world().zones


@app.get("/api/agents", response_model=list[Agent])
def get_agents(
    zone_id: str | None = Query(default=None, alias="zoneId"),
    limit: int | None = Query(default=None, ge=1),
) -> list[Agent]:
    agents = get_world().agents_for(zone_id)
    if limit is not None:
        return agents[:limit]
    return agents


@app.get("/api/zones/clusters", response_model=dict)
def get_zone_clusters() -> dict:
    """Optional ml-backed equity clustering ({zoneId: {cluster, label}}).

    Returns {"available": false} when the ml/ module isn't present.
    """
    world = get_world()
    clusters = ml_bridge.zone_clusters(world.zones)
    if clusters is None:
        return {"available": False, "clusters": {}}
    return {"available": True, "clusters": clusters}


@app.get("/api/forecast")
def get_forecast(
    zone_id: str = Query(alias="zoneId"),
    month: int = Query(default=1, ge=1, le=12),
) -> dict:
    """Demand forecast (kWh) for a zone. Uses ml/ if present, else the sim baseline."""
    world = get_world()
    zone = world.zones_by_id.get(zone_id)
    if zone is None:
        raise HTTPException(status_code=404, detail=f"zone {zone_id} not found")
    ml_value = ml_bridge.forecast_demand(zone, month=month)
    return {
        "zoneId": zone_id,
        "month": month,
        "demandKwh": round(
            ml_value if ml_value is not None else zone.demand_kwh_monthly, 1
        ),
        "source": "ml" if ml_value is not None else "baseline",
    }


@app.get("/api/rationales", response_model=list[dict])
def get_rationales(
    zone_id: str | None = Query(default=None, alias="zoneId"),
    n: int = Query(default=config.LLM_AGENT_SAMPLE, ge=1, le=40),
) -> list[dict]:
    """Hybrid agent layer: short preference/rationale for a SAMPLED subset of agents.

    Claude-generated (with prompt caching) when ANTHROPIC_API_KEY is set; otherwise a
    clean rule-based fallback. Sampled + off the tick path so the sim stays fast.
    """
    world = get_world()
    pool = world.agents_for(zone_id)
    sample = pool[:n]
    return generate_rationales(sample, world.zones_by_id)


# ---------------------------------------------------------------------------
# Infra
# ---------------------------------------------------------------------------
@app.get("/api/infra", response_model=list[Infra])
def list_infra() -> list[Infra]:
    return get_world().engine.list_infra()


@app.post("/api/infra")
def place_infra(payload: InfraCreate) -> dict:
    """Place infra and return it PLUS subject-tied proposal approval among nearby agents.

    Response = all Infra fields (camelCase) + {proposalApproval, supportCount, opposeCount,
    neutralCount} reflecting local support/oppose toward THIS specific installation's kind.
    """
    world = get_world()
    infra = world.place_infra(payload)
    return {
        **infra.model_dump(by_alias=True),
        **world.proposal_approval_for_infra(infra),
    }


@app.delete("/api/infra/{infra_id}")
def delete_infra(infra_id: str) -> dict:
    ok = get_world().remove_infra(infra_id)
    if not ok:
        raise HTTPException(status_code=404, detail=f"infra {infra_id} not found")
    return {"ok": True}


# ---------------------------------------------------------------------------
# Simulation
# ---------------------------------------------------------------------------
@app.post("/api/sim/reset", response_model=SimMetrics)
def sim_reset() -> SimMetrics:
    return get_world().engine.reset()


@app.post("/api/sim/step", response_model=SimMetrics)
def sim_step(body: StepRequest | None = None) -> SimMetrics:
    ticks = body.ticks if body else 1
    return get_world().engine.step_many(ticks)


@app.get("/api/sim/metrics", response_model=SimMetrics)
def sim_metrics() -> SimMetrics:
    return get_world().engine.current_metrics()


@app.get("/api/activity")
def get_activity(since: int = Query(default=-1)) -> dict:
    """Backfill of the per-tick human-readable activity log; returns entries with tick > since."""
    log = get_world().engine.activity_log
    return {"activity": [e for e in log if e["tick"] > since]}


# ---------------------------------------------------------------------------
# Optimizer
# ---------------------------------------------------------------------------
@app.post("/api/optimize", response_model=list[Recommendation])
def optimize_endpoint(body: OptimizeRequest | None = None) -> list[Recommendation]:
    from .optimizer import optimize

    body = body or OptimizeRequest()
    return optimize(get_world().engine, kind=body.kind, n=body.n)


# ---------------------------------------------------------------------------
# v2: Session / scenarios
# ---------------------------------------------------------------------------
@app.post("/api/session/reset", response_model=SimMetrics)
def session_reset() -> SimMetrics:
    """Restore base state (clear placed infra + scenarios, reset sim to tick 0)."""
    world = get_world()
    world.session_reset()
    return world.engine.current_metrics()


@app.post("/api/scenario", response_model=Scenario)
def post_scenario(body: ScenarioRequest | None = None) -> Scenario:
    body = body or ScenarioRequest()
    return get_world().apply_scenario(
        body.type or "random",
        body.intensity,
        zone_id=body.zone_id,
        center=body.center,
        radius_km=body.radius_km,
    )


@app.get("/api/scenarios", response_model=list[Scenario])
def get_scenarios() -> list[Scenario]:
    return get_world().active_scenarios


# ---------------------------------------------------------------------------
# v2: Sentiment / voices
# ---------------------------------------------------------------------------
@app.get("/api/sentiment")
def get_sentiment(subject: str | None = Query(default=None)) -> dict:
    """City + per-zone approval (0..1). With ?subject=infra:<id>|kind:<k>|program:<name>, also
    returns support/oppose toward THAT specific subject among the relevant (nearby) agents."""
    world = get_world()
    summary = world.sentiment_summary().model_dump(by_alias=True)
    if subject:
        summary["subject"] = world.subject_approval(subject)
    return summary


@app.get("/api/agents/voices", response_model=list[AgentVoice])
def get_voices(
    n: int = Query(default=8, ge=1, le=60),
    context: str | None = Query(default=None),
    enrich: bool = Query(default=True),
    event: str | None = Query(default=None),
    zone_id: str | None = Query(default=None, alias="zoneId"),
    kind: str | None = Query(default=None),
) -> list[AgentVoice]:
    """Sampled agent opinion posts (each carries agentId/zoneId/position).

    Pass event=placement (+ zoneId, kind) or event=<scenarioType> (+ zoneId) to get a few
    prompt REACTION voices from that zone instead of the steady city-wide trickle.
    Rule-templated; LLM-enriched when a provider key is set.
    """
    world = get_world()
    if event:
        voices = world.reaction_voices(trigger=event, zone_id=zone_id, kind=kind, n=n)
    else:
        voices = world.voices(n=n, context=context)
    if enrich and config.llm_enabled():
        from .sim.llm import enrich_voices

        voices = enrich_voices(
            voices, context=event or context or world.last_scenario_type
        )
    return voices


# ---------------------------------------------------------------------------
# v2: Living-scene data
# ---------------------------------------------------------------------------
@app.get("/api/flows", response_model=list[Flow])
def get_flows() -> list[Flow]:
    return get_world().flows()


@app.get("/api/facilities")
def get_facilities() -> dict:
    """Real relief/gathering facilities (cooling centres, pools, libraries) for map layers.

    Returns {available, facilities:[...]} — empty + available:false if facilities.json is absent.
    """
    from .data.loader import load_facilities

    items = load_facilities()
    return {"available": items is not None, "facilities": items or []}


@app.get("/api/constraints")
def get_constraints() -> dict:
    """Per-zone siting constraints as a LIST (for tinting zones), not a GeoJSON FeatureCollection.

    Returns {available, zones: [{zoneId, sitingPenalty, noBuild}]} — one entry per zone (44).
    """
    from .data.loader import load_constraints

    cons = load_constraints()
    zones = [
        {
            "zoneId": zid,
            "sitingPenalty": round(float(c.get("sitingPenalty", 0.0)), 4),
            "noBuild": bool(c.get("noBuild", False)),
        }
        for zid, c in (cons or {}).items()
    ]
    return {"available": cons is not None, "zones": zones}


@app.get("/api/environment")
def get_environment() -> dict:
    """Per-zone environment indicators as a LIST (for zone tooltip/legend), same shape as constraints.

    Returns {available, zones: [{zoneId, greenScore, pollutionBurden}]}.
    """
    from .data.loader import load_environment

    env = load_environment()
    zones = [
        {
            "zoneId": zid,
            "greenScore": round(float(e.get("greenScore", 0.0)), 4),
            "pollutionBurden": round(float(e.get("pollutionBurden", 0.0)), 4),
        }
        for zid, e in (env or {}).items()
    ]
    return {"available": env is not None, "zones": zones}


@app.get("/api/district-energy")
def get_district_energy() -> dict:
    """District-energy service area: which downtown zones already have low-carbon thermal."""
    from .data.loader import load_district_energy

    de = load_district_energy()
    zones = [
        {
            "zoneId": z["zoneId"],
            "servedFraction": round(float(z.get("servedFraction", 0.0)), 3),
            "systemName": z.get("system") or z.get("systemName"),
        }
        for z in (de or {}).get("zones", [])
        if "zoneId" in z
    ]
    return {
        "available": de is not None,
        "zones": zones,
        "servicePolygon": (de or {}).get("servicePolygon"),
    }


@app.get("/api/archetypes")
def get_archetypes() -> dict:
    """Per-zone agent archetype proportions (actual mix from the loaded agents), for a FE breakdown.

    `source` is "data" when archetypes.json calibrated the mix, else "model".
    """
    from .data.loader import load_archetypes
    from .state import archetype_mix

    world = get_world()
    mix = archetype_mix(world.agents, world.zones)
    return {
        "available": True,
        "source": "data" if load_archetypes() else "model",
        "zones": [{"zoneId": zid, "mix": m} for zid, m in mix.items()],
    }


@app.get("/api/sbei")
def get_sbei() -> dict:
    """City-wide sector-based GHG inventory (display/context: 16 Mt, buildings 57%, net-zero 2040)."""
    from .data.loader import load_sbei

    doc = load_sbei()
    return {"available": doc is not None, **(doc or {})}


@app.get("/api/flood")
def get_flood() -> dict:
    """Per-zone flood risk as a LIST (for tinting), same shape as constraints/environment."""
    from .data.loader import load_flood

    flood = load_flood()
    zones = [
        {
            "zoneId": zid,
            "floodRiskScore": round(float(z.get("floodRiskScore", 0.0)), 4),
            "floodRisk": z.get("floodRisk", "low"),
        }
        for zid, z in (flood or {}).items()
    ]
    return {"available": flood is not None, "zones": zones}


@app.get("/api/heat-vulnerability")
def get_heat_vulnerability() -> dict:
    """Per-zone heat-vulnerability index as a LIST (for tinting), same shape as constraints."""
    from .data.loader import load_heat_vulnerability

    hv = load_heat_vulnerability()
    zones = [
        {
            "zoneId": zid,
            "hvi": round(float(z.get("heatVulnerabilityIndex", z.get("hvi", 0.0))), 4),
            "level": z.get("level", "low"),
        }
        for zid, z in (hv or {}).items()
    ]
    return {"available": hv is not None, "zones": zones}


@app.get("/api/existing_infra")
@app.get("/api/existing-infra")
def get_existing_infra() -> dict:
    """Real existing installations (city renewables + EV chargers) — 'what's already there'.

    A distinct layer for the frontend: point list with positions. Both /api/existing_infra and
    /api/existing-infra are served.
    """
    from .data.loader import load_existing_infra

    items = load_existing_infra()
    return {"available": items is not None, "layer": "existing", "infra": items or []}


@app.get("/api/generation-mix")
def get_generation_mix() -> dict:
    """Ontario IESO grid mix for context/display, plus the MARGINAL factor used for emissions.

    Note: emissions savings use the marginal gas-peaker factor (~450 gCO2/kWh), not the ~38
    gCO2/kWh grid average (which would make savings look trivial). Both are surfaced here.
    """
    from .data.loader import load_generation_mix
    from .sim.engine import GAS_EMISSION_FACTOR_T_PER_KWH

    mix = load_generation_mix()
    return {
        "available": mix is not None,
        "mix": mix or {},
        "marginalGco2PerKwh": round(GAS_EMISSION_FACTOR_T_PER_KWH * 1_000_000, 1),
    }


# ---------------------------------------------------------------------------
# v2: Agentic planner
# ---------------------------------------------------------------------------
@app.post("/api/planner/run")
async def planner_run(body: PlannerRunRequest | None = None) -> dict:
    """Run the planner to completion and return all streamed events (auto mode).

    Step mode requires the WS endpoint (no pause channel over REST) — REST forces auto.
    """
    from .planner import run_planner

    body = body or PlannerRunRequest()
    world = get_world()
    events = [
        ev
        async for ev in run_planner(
            world, mode="auto", goal=body.goal, budget_cad=body.budget_cad
        )
    ]
    return {"events": events}


@app.websocket("/ws/planner")
async def ws_planner(ws: WebSocket) -> None:
    """Real-time, multi-turn planner chat.

    Start AND continue a turn (frontend's primary shape):
      {"type":"user_message", "text":"add solar to high-burden neighbourhoods",
       "mode":"auto"|"step", "budgetCad"?: number}
    The first message also configures mode/budget. `text` is the instruction and is run through
    the intent parser (so "battery storage near hospitals" actually places batteries).
    Aliases also accepted: {"mode","goal","budgetCad"} and {"action":"message","text"}.
    Any time:
      {"action":"scenario","scenarioType":"blackout","intensity":1,"zoneId"?,...} -> inject an
          event DURING a turn; the agent observes it and reacts in-character. Applied even when idle.
      {"action":"approve"|"reject"}  -> step-mode gate for the pending mutating tool
      {"action":"stop"} / {"type":"stop"}  -> end the chat
    Server streams: turn_start | thought | tool_call | tool_result | placement | scenario |
      awaiting_approval | done, in REAL TIME as each happens. The socket stays open after 'done'
      so follow-ups continue with the world + conversation preserved.
    """
    from .planner import DEFAULT_BUDGET_CAD, PlannerChat

    await ws.accept()
    world = get_world()
    try:
        cfg = await ws.receive_json()
    except WebSocketDisconnect:
        return

    mode = cfg.get("mode", "auto")
    budget = cfg.get("budgetCad") or DEFAULT_BUDGET_CAD
    # The typed instruction may arrive as `text` (frontend) or `goal` (alias).
    first_text = cfg.get("text") or cfg.get("goal")
    chat = PlannerChat(world, budget, goal=first_text)

    user_q: asyncio.Queue = asyncio.Queue()
    approval_q: asyncio.Queue = asyncio.Queue()
    running = {"v": False}
    if first_text:
        user_q.put_nowait(first_text)

    async def confirm(tool_call: dict) -> bool:
        await ws.send_json({"type": "awaiting_approval", **tool_call})
        return await approval_q.get()

    def _extract_text(msg: dict) -> str | None:
        return msg.get("text") or msg.get("message") or msg.get("goal")

    async def receiver() -> None:
        # On ANY disconnect/receive error, push the stop sentinel so the main loop unblocks
        # (otherwise it could hang forever on user_q.get() after an idle disconnect).
        try:
            while True:
                msg = await ws.receive_json()
                if not isinstance(msg, dict):
                    continue  # ignore malformed frames
                action = msg.get("action")
                mtype = msg.get("type")
                if action == "stop" or mtype == "stop":
                    return
                if action in ("approve", "reject"):
                    await approval_q.put(action == "approve")
                elif action == "scenario" or mtype == "scenario":
                    try:
                        scn = world.apply_scenario(
                            msg.get("scenarioType", "random"),
                            float(msg.get("intensity", 1.0) or 1.0),
                            zone_id=msg.get("zoneId"),
                            center=msg.get("center"),
                            radius_km=msg.get("radiusKm"),
                        )
                        chat.inject_scenario(scn)
                        if not running["v"]:
                            await user_q.put(
                                f"React to the {scn.label} that just occurred."
                            )
                    except Exception as exc:  # noqa: BLE001 — malformed scenario must not kill the socket
                        log.warning("planner WS scenario inject failed: %s", exc)
                elif (
                    mtype == "user_message" or action in ("message", "msg")
                ) and _extract_text(msg):
                    # Honor the typed instruction (frontend's primary continue-turn shape).
                    await user_q.put(_extract_text(msg))
        except (WebSocketDisconnect, RuntimeError, ValueError):
            pass
        finally:
            await user_q.put(None)  # always unblock the main loop

    recv_task = asyncio.create_task(receiver())
    cfn = confirm if mode == "step" else None
    try:
        while True:
            user_msg = await user_q.get()
            if user_msg is None:
                break
            running["v"] = True
            await ws.send_json({"type": "turn_start", "message": user_msg})
            async for ev in chat.turn(user_msg, cfn):
                await ws.send_json(ev)
            running["v"] = False
    except (WebSocketDisconnect, RuntimeError):
        pass
    finally:
        recv_task.cancel()
        await asyncio.gather(recv_task, return_exceptions=True)


# ---------------------------------------------------------------------------
# WebSocket: stream SimMetrics + per-zone deltas each tick
# ---------------------------------------------------------------------------
@app.websocket("/ws/sim")
async def ws_sim(ws: WebSocket) -> None:
    """Bidirectional sim stream.

    Client -> server JSON control messages:
      {"action": "play"}            start auto-advancing
      {"action": "pause"}           stop auto-advancing
      {"action": "step", "ticks": k} advance k ticks (default 1)
      {"action": "reset"}           reset to tick 0
      {"action": "speed", "seconds": s} set seconds per tick
    Server -> client (STAGGERED per advance, so the UI can animate DURING a tick):
      {"type":"tick_start","tick":k}
      {"type":"tick", ...SimTick}                       # metrics + per-zone deltas (incl. approval)
      {"type":"voices","voices":[...]}                  # a few sampled agent posts
      {"type":"tick_complete","tick":k}
    Plus {"type":"state", ...SimTick} on connect and after reset.
    """
    await ws.accept()
    world = get_world()
    engine = world.engine

    playing = False
    seconds_per_tick = config.SECONDS_PER_TICK

    async def stream_tick(tick) -> None:
        """Emit one tick as a staggered sequence for liveness."""
        t = tick.metrics.tick
        await ws.send_json({"type": "tick_start", "tick": t})
        await asyncio.sleep(0.04)
        await ws.send_json({"type": "tick", **tick.model_dump(by_alias=True)})
        await asyncio.sleep(0.04)
        # Distinct activity event (also embedded in the tick frame above) for the "what's
        # happening around the city" log.
        if tick.activity:
            await ws.send_json(
                {
                    "type": "activity",
                    "tick": t,
                    "year": tick.metrics.year,
                    "activity": tick.activity,
                }
            )
            await asyncio.sleep(0.04)
        # ~a few sampled voices each tick (rule-based on the hot loop — no LLM call here).
        voices = world.voices(n=3)
        await ws.send_json(
            {"type": "voices", "voices": [v.model_dump(by_alias=True) for v in voices]}
        )
        await ws.send_json({"type": "tick_complete", "tick": t})

    # Send current state immediately.
    await ws.send_json(
        {"type": "state", **engine.current_tick().model_dump(by_alias=True)}
    )

    async def receiver() -> None:
        nonlocal playing, seconds_per_tick
        while True:
            msg = (
                await ws.receive_json()
            )  # raises WebSocketDisconnect on close (caught below)
            if not isinstance(msg, dict):
                continue
            try:
                action = msg.get("action")
                if action == "play":
                    playing = True
                elif action == "pause":
                    playing = False
                elif action == "reset":
                    engine.reset()
                    await ws.send_json(
                        {
                            "type": "state",
                            **engine.current_tick().model_dump(by_alias=True),
                        }
                    )
                elif action == "scenario":
                    scn = world.apply_scenario(
                        msg.get("scenarioType", "random"),
                        float(msg.get("intensity", 1.0) or 1.0),
                        zone_id=msg.get("zoneId"),
                        center=msg.get("center"),
                        radius_km=msg.get("radiusKm"),
                    )
                    await ws.send_json(
                        {"type": "scenario", "scenario": scn.model_dump(by_alias=True)}
                    )
                    # Prompt reaction chatter from the affected zones.
                    rxn = world.scenario_reaction_voices(scn, n=4)
                    if rxn:
                        await ws.send_json(
                            {
                                "type": "voices",
                                "trigger": scn.type,
                                "voices": [v.model_dump(by_alias=True) for v in rxn],
                            }
                        )
                elif action == "step":
                    ticks = max(1, min(int(msg.get("ticks", 1) or 1), 120))
                    for _ in range(ticks):
                        await stream_tick(engine.step())
                elif action == "speed":
                    seconds_per_tick = max(
                        0.05, float(msg.get("seconds", seconds_per_tick) or 0.1)
                    )
            except (WebSocketDisconnect, RuntimeError):
                raise  # disconnect -> exit the receiver
            except Exception as exc:  # noqa: BLE001 — a bad message must not kill the stream
                log.warning("ws/sim: ignoring bad message %r (%s)", msg, exc)

    async def ticker() -> None:
        try:
            while True:
                if playing:
                    await stream_tick(engine.step())
                await asyncio.sleep(seconds_per_tick if playing else 0.1)
        except (WebSocketDisconnect, RuntimeError):
            pass  # client went away mid-send — stop quietly

    recv_task = asyncio.create_task(receiver())
    tick_task = asyncio.create_task(ticker())
    try:
        await recv_task
    except (WebSocketDisconnect, RuntimeError):
        pass
    finally:
        tick_task.cancel()
        recv_task.cancel()
        await asyncio.gather(tick_task, recv_task, return_exceptions=True)
