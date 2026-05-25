# WattIf — Current Project Details (Audit)

**Audit date:** Based on inspection of the repository as it exists today.  
**Purpose:** Plain-English description of what the product **actually is and does** — not what it aspires to become.  
**Technical depth:** See [complete_system_architecture.md](./complete_system_architecture.md).  
**Vision comparison:** See [vision_gap_analysis.md](./vision_gap_analysis.md).

---

## Plain-English overview

WattIf is an **interactive 3D map prototype** for exploring renewable-energy siting across **44 Toronto neighbourhoods**. A user can place solar arrays, wind turbines, battery storage, and microgrid hubs on the map, run a **fast-forward monthly simulation**, trigger **disaster-style scenarios** (blackouts, heatwaves, ice storms, etc.), and watch city metrics change — coverage, public approval, equity score, emissions, and cost.

The map can show **real Toronto open-data overlays**: flood risk, heat vulnerability, existing solar installations, EV charging station locations (read-only), cooling centres, siting constraints, and district energy service areas.

An **"AI planning agent"** in the chat panel can propose and place infrastructure automatically. **Without API keys, this agent is a scripted demo** — it follows a predetermined tool-calling sequence with keyword-matched chat responses, not a live large language model.

**Resident "voices"** appear as short opinion posts during simulation. These are **generated from a large template library** keyed off agent archetype, stance, and scenario — not from individual AI agents reasoning about proposals.

The app **works fully offline** using built-in mock data if the backend is not running.

---

## Target user (based on current implementation)

The implementation today fits:

| User | Fit | Why |
|------|-----|-----|
| **Hackathon demo audience / judges** | Strong | Polished map UI, guided 6-step tour, works offline |
| **Energy equity storyteller** | Moderate | Equity-weighted optimizer + burden overlays tell a compelling narrative |
| **City designer testing arbitrary uploaded datasets** | **None** | No upload, no city picker, Toronto-only fixtures |
| **Urban planner needing report-grade outputs** | **Weak** | Metrics are simplified; no export, no PDF, no survey integration |
| **Infrastructure engineer modeling EV charging** | **None** | EV chargers are display-only; not placeable or simulated |
| **Researcher needing persistent agent populations** | **Weak** | In-memory session only; agents reset on server restart |

**Honest positioning today:** an **explorable digital twin demo** for Toronto renewable siting with equity framing — not a production planning tool.

---

## Current user journey

1. **Land on welcome modal** ([`frontend/src/components/Welcome.tsx`](../../frontend/src/components/Welcome.tsx)) — choose guided demo or free exploration.
2. **See Toronto map** — 44 zone polygons; optional Mapbox/Google 3D buildings.
3. **Left dock → Build tab** — pick Manual, AI Auto, or AI Step placement mode; select infra kind; click map to place OR run optimizer recommendations.
4. **Left dock → Events tab** — pick scenario (blackout, heatwave, etc.); click a zone or run city-wide.
5. **Left dock → Map tab** — toggle overlays (equity, demand, sentiment, flood, existing infra, etc.).
6. **Timeline** — play/pause/step simulation months forward.
7. **Right dock** — chat with planner agent; read activity log, voices feed, stats charts, inspect placed assets.
8. **Observe outcomes** — coverage/approval/equity metrics update; agents animate on map (~320 dots); speech bubbles show opinions; outage overlay during blackouts.

**Session ends when:** user resets session, refreshes page, or backend process restarts — **nothing persists**.

---

## Implemented features (what actually works)

### Map functionality

| Feature | Status | Evidence |
|---------|--------|----------|
| 44 Toronto zone polygons | **Real** (processed data) | `data/processed/zones.json`, `/api/zones` |
| 3D infrastructure GLB models | **Real** | `frontend/public/models/*.glb`, `layers.ts` ScenegraphLayer |
| Choropleth overlays (equity, sentiment, flood) | **Real** | `layers.ts` + backend layer endpoints |
| Demand hexbin layer | **Real** | Uses agent demand fields |
| ~320 animated agent dots | **Visual sample only** | `store.ts` subsamples from ~4,001 agents |
| Existing solar/wind/hydro/EV points | **Real (read-only)** | `existing_infra.json`, 82 EV chargers |
| Google/Mapbox 3D buildings | **Optional** | Env tokens in `MapView.tsx` |
| Per-building rooftop placement | **Not implemented** | Placement is zone-level + map click coordinate |

### Infrastructure placement

| Kind | Placeable | Simulated | 3D model |
|------|-----------|-----------|----------|
| Solar | Yes | Yes | Yes |
| Wind | Yes | Yes | Yes |
| Battery | Yes | Yes (peak shave) | Yes |
| Microgrid | Yes | Yes (outage resilience) | Yes |
| EV charger | **No** | **No** | Display existing only |

Placement modes ([`frontend/src/components/BuildTab.tsx`](../../frontend/src/components/BuildTab.tsx)):

- **Manual** — user picks kind, clicks map
- **AI Auto** — triggers planner WebSocket with auto goal; scripted or LLM depending on keys
- **AI Step** — same but pauses for approve/reject on each placement

Optimizer ([`POST /api/optimize`](../../backend/app/main.py)) returns ranked recommendations with rationales from the greedy scorer — **works without LLM**.

### Scenario / disaster functionality

**7 UI presets** in [`ScenarioControls.tsx`](../../frontend/src/components/ScenarioControls.tsx) plus Random; backend supports **16+ scenario types** in [`scenarios.py`](../../backend/app/scenarios.py).

What scenarios actually do:

| Effect | Examples |
|--------|----------|
| Zone demand multiplier | Heatwave (+demand in high-HVI zones), gas spike |
| Zone outage (grid down) | Blackout, flood, ice storm — microgrids keep supply |
| Grid capacity shrink | Blackout (−40% capacity) |
| Infra damage | Earthquake, flood — zero supply from damaged installs |
| Sentiment target shifts | Per-kind opinion nudges by archetype |
| Agent mobilization hints | Frontend moves ~320 sampled agents toward facilities |

**Not implemented:** real weather feeds, snowstorm geodata (ice storm is a sim lever, not weather data), structural damage modeling beyond flipping infra status.

### Metrics / dashboard

**Always visible strip** ([`RightDock.tsx`](../../frontend/src/components/RightDock.tsx) `MiniStats`): coverage %, approval %, tick/year.

**Stats tab** ([`Hud.tsx`](../../frontend/src/components/Hud.tsx)):

| Metric | Source |
|--------|--------|
| Coverage | `SimMetrics.coveragePct` |
| Approval | `SimMetrics.approvalPct` |
| Equity | `SimMetrics.equityScore` |
| Clean kWh/month | `renewableSupplyKwh` |
| Grid load | `gridLoadPct` |
| Emissions/month | `emissionsTonnes` (unmet demand × gas peaker factor) |
| Capital spent | `costCumulativeCad` |
| History chart | Last 120 ticks in store |
| Ontario grid carbon intensity | `/api/generation-mix` (if backend up) |
| Toronto SBEI headline | `/api/sbei` (display context only) |

**Not shown:** detailed cost breakdown per zone, LCOE, jobs impact, noise contours for wind, EV charging utilization.

### AI planner functionality

| Capability | With API keys | Default (no keys) |
|------------|---------------|-------------------|
| Chat UI | Yes | Yes |
| Tool-calling loop appearance | Yes | Yes (scripted) |
| Interprets free-form designer intent | LLM parsing | **Keyword matching** (`parse_intent()` in `planner.py`) |
| Recommends sites | Optimizer + LLM narration | Optimizer + fixed narration |
| Explains tradeoffs | LLM-generated | Template strings |
| Reacts to mid-chat scenarios | Demo/LLM turn | Scripted pivot in `_demo_turn()` |
| Step-mode approval | Yes | Yes |

Evidence: `PlannerChat.turn()` at `planner.py` L760–761 routes `(None, "demo")` to `_demo_turn()`. Default config: `WATTIF_DEMO_LLM=1` in `config.py`.

### Resident agents / voices functionality

**This is not a multi-agent AI system.** Here is what exists:

| Layer | What it is |
|-------|------------|
| **Agent records** | ~4,001 JSON rows with archetype, income, demand, rooftop, `ev_owner` boolean |
| **Sentiment model** | NumPy matrix: each agent has 4 opinion values (solar/wind/battery/microgrid) that drift toward targets |
| **Voices** | Short text posts sampled from templates in `voices.py` (~500+ lines of template pools) |
| **Rationales** | Optional LLM or rule-based one-liners via `/api/rationales` (not shown in main UI flow) |
| **Map animation** | ~320 agent dots colored by sentiment; mobilize to facilities during scenarios |

Voices on the **sim tick hot path** (`main.py` L623–627): **always templated, never LLM**.

REST `/api/agents/voices?enrich=true` (default) calls `enrich_voices()` only when `real_llm_provider()` is set — **demo mode does not enrich**.

---

## Guided demo flow

[`store.ts` `runGuidedDemo()`](../../frontend/src/store.ts) — 6 scripted steps:

| Step | Duration | Action |
|------|----------|--------|
| 1 | 4.2s | Show equity choropleth |
| 2 | 4.2s | Show demand hexbins |
| 3 | 9s | `setPlacementMode("auto")` — triggers AI planner |
| 4 | 7s | Play sim with flows + agents visible |
| 5 | 4.5s | City-wide blackout scenario |
| 6 | 5s | Pause; resilience caption |

Uses live backend if available; otherwise mock data — demo does not force either mode.

---

## What is real

| Item | Details |
|------|---------|
| Toronto zone boundaries | From Toronto Open Data (via `build.py`) |
| Census-derived demographics | Population, tenure, income on zones |
| 4,001 simulation agents | Committed in `agents.json` |
| Real existing renewables + EV chargers | 100 renewable + 82 EV in `existing_infra.json` |
| Flood, constraints, facilities layers | From open data where raw cache existed at build time |
| Equity-weighted optimizer | Implemented in `optimizer.py`, exposed on REST |
| Monthly tick simulation | `SimEngine` with adoption, sentiment, flows, metrics |
| Scenario engine | 16 types mutating demand, outages, sentiment |
| 3D map with infra models | deck.gl + GLB assets |
| Offline frontend | Full mock path in `mock.ts` |
| Optional real LLM | Anthropic/Feather when keys configured |
| ML training pipeline | `ml/train.py` complete; artifacts not shipped |

---

## What is mocked

| Item | Details |
|------|---------|
| **Entire backend when offline** | `mock.ts` provides zones, agents, metrics, voices, planner events |
| **Initial seed infra (4 items)** | `mock.seedInfra()` always runs client-side in `store.init()` — not fetched from backend |
| **Frontend planner when WS fails** | `mockPlannerEvents()` deterministic generator |
| **Per-endpoint failures while "live"** | Any REST timeout → that endpoint's mock; badge still says Live |
| **Heat vulnerability index** | Modeled composite in `build.py`, not official city HVI dataset |
| **District energy zones** | Modeled from public knowledge, not open GIS |
| **Agent voices (default deployment)** | Template library — reads like real opinions but is not survey data |
| **Demo LLM planner** | Scripted narration mimicking an agentic loop |

---

## What is fallback-only

| Feature | Fallback behavior |
|---------|-------------------|
| ML demand forecast | Zone baseline `demandKwhMonthly` |
| ML zone clusters | `{available: false}` |
| ML scenario adoption nudge | Heuristic multipliers in `inference.py` |
| LLM voice enrichment | Unchanged template text |
| LLM rationales | `_fallback_rationale()` by archetype |
| LLM planner | `_planner_demo()` or `_planner_lite()` |
| Processed data missing | `seed.build_world()` synthetic Toronto |
| OR-Tools optimizer | Greedy always used on REST API |
| Attitudes.json missing | Model-computed sentiment priors |

---

## What can honestly be pitched today

**Safe claims:**

- "Interactive 3D map of Toronto neighbourhoods for exploring renewable siting trade-offs"
- "Equity-weighted site recommendation engine prioritizing high energy-burden zones"
- "Fast-forward simulation showing coverage, approval, emissions, and grid load over time"
- "Stress-test scenarios like blackouts and heatwaves to see resilience effects"
- "Living city visualization with resident opinion feed and animated agents"
- "Grounded in Toronto open data: boundaries, census, flood, existing renewables, EV chargers"
- "Works offline for demos; optional live backend and optional LLM enhancement"

**Impressive but qualified claims:**

- "AI planning agent" → **must disclose** default is scripted demo without API keys
- "Machine learning demand forecasting" → **must disclose** models not shipped; heuristics run
- "4,000+ resident agents" → **must disclose** they are simulation records with template voices, not autonomous AI

---

## What should NOT be claimed yet

| Do not claim | Reality |
|--------------|---------|
| "Upload your city's datasets" | No upload UI or API |
| "Figma/SimCity-style block-level design" | Zone-level + point placement, not parcel editing |
| "EV charging infrastructure planning" | EV chargers are read-only dots; not placeable |
| "Autonomous AI resident agents" | Rule-based sentiment + templates |
| "Real survey/consultation integration" | Static 2021 attitudes JSON; voices are synthetic |
| "Weather and snowstorm risk modeling" | Scenario levers only; no weather GIS |
| "Persistent sessions / saved proposals" | In-memory; lost on restart |
| "Production-ready planning reports" | No export; simplified metrics |
| "Full Toronto population simulation" | ~4,001 sample agents scaled by `zone_representation` |
| "LLM-powered planner out of the box" | Demo script is default |

---

## Comparison to prior project docs

[`docs/OVERVIEW.md`](../OVERVIEW.md) and [`docs/ARCHITECTURE.md`](../ARCHITECTURE.md) describe the system generously. Specific corrections:

| Prior doc claim | Audit finding |
|-----------------|---------------|
| "16 processed files loaded at boot" | **13 loaded**; `demand.json`, `solar.json`, `buildings.json` ignored at runtime |
| "AI planner" without qualification | Default path is **scripted demo**, not LLM |
| "LLM-generated rationales/voices" | Only with real API keys; demo mode uses rules/templates |
| "Optional ML models" implied trained | **No `.joblib` in repo**; heuristics always run |
| "Works without backend" | True for frontend; backend voices/planner differ from mock behavior |

---

## Key Takeaways

1. **WattIf today is a compelling Toronto-specific energy-equity demo** with a real simulation core and rich map UX — not a general-purpose city designer sandbox.
2. **The "residents" are simulated opinion vectors and template quotes**, not LLM agents with personalities, memory, or independent reasoning.
3. **The "AI planner" is primarily a scripted demo** unless Anthropic or Feather API keys are configured.
4. **The frontend mock path is a first-class feature**, not an edge case — always account for it when describing behavior.
5. **Several vision features (upload, EV planning, block-level design, real surveys) are entirely absent** from the codebase.
6. **Pitch the equity narrative and interactive simulation honestly**; avoid claiming autonomous agents or dataset upload until built.
