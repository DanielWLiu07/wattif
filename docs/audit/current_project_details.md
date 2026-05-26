# WattIf Current Project Details Audit

**Audit date:** Post–Phase 3 persistence.  
**Audience:** Product, demo, and stakeholder review.
Audit date: 2026-05-25

Purpose: explain what the product is today from a product perspective, without treating future vision as current behavior.

## What WattIf is today

WattIf is a **Toronto energy-equity planning demo** with:

- Interactive map + infrastructure placement (solar, battery, heat pump, etc.)
- Rule-based simulation with optional ML/LLM enrichment
- Scenario comparison and resident “voices” (template-based by default)
- **Optional Supabase persistence** for saved projects, proposals, infrastructure, and snapshots

It is **not** a full production planning platform, multi-tenant SaaS, or authenticated collaboration tool.
## Plain-English Project Overview

WattIf is currently an interactive Toronto clean-energy planning prototype. It lets a user explore a 3D map, place clean-energy infrastructure, run a monthly simulation, trigger disaster/stress scenarios, view metrics, see resident-style opinion snippets, ask a planning agent to recommend/place assets, and save proposal placements/snapshots when Supabase is configured.

The best honest description today is: a polished hackathon-stage digital twin demo for Toronto renewable infrastructure siting, with a real rule-based simulation backend and optional persistence.

It is not yet a full Figma/SimCity-style city-design sandbox. It does not let users upload arbitrary datasets, import arbitrary GIS layers, model individual real humans, or run validated engineering-grade grid studies.

## Current Target User

| User | Fit today | Why |
|---|---|---|
| Hackathon judges/demo audience | Strong | Visual, interactive, resilient offline fallback, guided demo |
| Product discovery with planners | Medium | Communicates the concept and workflows, but results are not validated for decisions |
| City/energy planning professionals | Early prototype only | Needs uploaded local data, reproducibility, validation, assumptions, auth, and export |
| Residents/public engagement | Demo only | Voices are simulated/templates, not surveyed or persistent resident inputs |
| Infrastructure engineers | Weak | No grid power-flow model, interconnection constraints, or engineering validation |

## Current User Journey

The current happy path:

1. Open the frontend.
2. App loads zones, agents, seeded infrastructure, metrics, sentiment, voices, flows, and optional city data layers.
3. User explores Toronto on the map.
4. User places solar, wind, battery, or microgrid assets manually, or asks the planning agent to place assets.
5. User presses play/step to advance monthly simulation.
6. User fires scenarios such as blackout, heatwave, ice storm, gas spike, population boom, or policy incentive.
7. User watches coverage, equity, approval, cost, grid load, emissions, activity, flows, people dots, and voices change.
8. If Supabase is configured, user creates/selects a project and proposal, persists placements, and saves snapshots.

Evidence: `frontend/src/App.tsx`, `frontend/src/store.ts`, `frontend/src/components/LeftDock.tsx`, `frontend/src/components/RightDock.tsx`, `frontend/src/components/ProjectsTab.tsx`.

## Implemented Features

| Feature | Current status | Evidence |
|---|---|---|
| 3D map shell | Implemented | `frontend/src/components/MapView.tsx` |
| Toronto zones | Implemented via processed/fixture/seed data | `backend/app/data/loader.py`, `frontend/src/data/mock.ts` |
| Infrastructure placement | Implemented for 4 kinds | `frontend/src/store.ts`, `backend/app/main.py`, `backend/app/models.py` |
| Simulation metrics | Implemented, rule-based | `backend/app/sim/engine.py`, `frontend/src/components/Hud.tsx` |
| Scenarios/disasters | Implemented, rule-based | `backend/app/scenarios.py`, `frontend/src/components/ScenarioControls.tsx` |
| Public sentiment | Implemented, simulated | `backend/app/sim/sentiment.py`, `backend/app/sim/voices.py` |
| Resident voices | Implemented as sampled generated posts | `backend/app/sim/voices.py`, `frontend/src/components/VoicesFeed.tsx` |
| Planning agent UI | Implemented | `frontend/src/components/ChatPanel.tsx`, `backend/app/planner.py` |
| Optimizer | Implemented, greedy default | `backend/app/optimizer.py` |
| Supabase projects/proposals | Implemented when env configured | `backend/app/routes/persistence.py`, `frontend/src/components/ProjectsTab.tsx` |
| Proposal infrastructure persistence | Implemented | `backend/app/routes/persistence.py`, `frontend/src/store.ts` |
| Snapshot metrics/scenarios/infrastructure persistence | Implemented | `supabase/migrations/20250526120000_snapshot_extras.sql`, `frontend/src/store.ts` |
| Upload datasets | Missing | No upload route or frontend upload component |
| Arbitrary GIS import | Missing | No file import/layer schema pipeline |
| EV charger placement | Missing as placeable kind | `InfraKind` is `solar | wind | battery | microgrid` in `frontend/src/types.ts` and `backend/app/models.py` |

## Demo Flow

There is a guided demo in `frontend/src/store.ts` via `runGuidedDemo()`.

Current scripted flow:

| Step | What it shows |
|---|---|
| 1 | Energy-equity gap overlay |
| 2 | Demand concentration |
| 3 | AI planner sites solar, wind, battery, and microgrids |
| 4 | Play simulation and show flows/adoption |
| 5 | Trigger city-wide blackout |
| 6 | Show microgrid resilience moment |

This is a strong demo flow. It should not be described as a validated planning workflow.

## Map Functionality

## User-facing capabilities (verified)

| Feature | Status | Notes |
|---------|--------|-------|
| Create/list projects | **Real** (Supabase) | Saved tab → New Project |
| Create/list proposals | **Real** (Supabase) | Per-project proposals |
| Select saved proposal | **Real** | Restores persisted infrastructure into live sim |
| Place infrastructure | **Real** | Dual-write to live sim + `proposal_infrastructure` when proposal selected |
| Remove infrastructure | **Real** | Deletes persisted row when mapped |
| Save Snapshot | **Real** | Writes metrics, scenarios, infrastructure JSON to `simulation_snapshots` |
| Snapshot history | **Real** | Lists snapshots for selected proposal in Saved tab |
| Restore snapshot to live sim | **Real** | Replays snapshot infra JSON; does not change persisted proposal rows |
| Live vs snapshot comparison | **Real** | Deltas for coverage, approval, equity, emissions, grid load, cost |
| View latest snapshot metadata | **Real** | `GET .../snapshots/latest`; defaults comparison target |
| Run simulation | **Real** (in-memory) | Not auto-persisted on each tick |
| Run optimizer | **Real** (in-memory) | Can recommend EV chargers in high-EV / low-coverage zones |
| Place EV charger | **Real** | Fifth placeable kind; persists + snapshots like other infra |
| Resident voices | **Template** | LLM optional on REST paths only |
| Dataset upload | **Missing** | Table exists; no upload UI/API |
| Report export | **Partial (Phase 10)** | Markdown/HTML decision memo via `GET /api/proposals/{id}/report`; Saved tab panel; not PDF; not persisted |
| User login / RBAC | **Missing** | Service role backend only |
| LLM resident agents | **Missing** | Rule/template voices only |

---

## Persistence modes (UI)

TopBar and Saved tab reflect backend health:

| Mode | Meaning |
|------|---------|
| **In-memory** | No Supabase env; persistence routes return 503 |
| **Supabase (no proposal)** | DB connected; user has not selected a proposal |
| **Supabase (proposal)** | Proposal selected; infra placement persists |

Selection survives refresh via `localStorage` + reload on mount.

---

## What “saved” means now

**Before Phase 3 (stale claim):** “Nothing is saved; refresh loses everything.”

**Now:**

- **Saved:** Project name, proposal name, placed infrastructure rows, manually saved snapshot records.
- **Not saved automatically:** Live tick state, agent positions, transient metrics between snapshots, session-only infra when no proposal is selected.

Refreshing the page with a selected proposal **reloads infrastructure** from the database.

---

## Demo vs production honesty

| Area | Demo / partial | Production-ready |
|------|----------------|------------------|
| Map + placement | ✓ | |
| Sim engine | ✓ (in-memory) | |
| Supabase projects/proposals/infra/snapshots | ✓ (when configured) | No auth/RLS |
| Voices | Template (+ optional LLM) | No true agent loop |
| Data pipeline | Synthetic/mock | No real utility uploads |
| Export / reports | | ✗ |

---

## Environment requirements

**Backend** (`backend/.env`):

- Optional LLM keys (Claude, Feather)
- Optional `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` for persistence

**Frontend** (`frontend/.env`):

- `VITE_API_URL` (default `http://localhost:8000`)

**Database:**

- Run migrations under `supabase/migrations/` manually in Supabase project.

---

## Key Takeaways

1. **Saved proposals and infrastructure are real** when Supabase is configured and migrations applied.
2. **Snapshots are manually triggered**, not continuous sim checkpoints.
3. **Persistence ≠ full platform** — no auth, upload, export, or autonomous LLM agents.
4. **Live simulation** still runs in backend memory; only proposal-scoped artifacts persist.
What is real today:

| Capability | Status |
|---|---|
| Pan/zoom/tilt/orbit map | Real |
| MapLibre dark base map | Real |
| Optional Mapbox Standard | Real when `VITE_MAPBOX_TOKEN` exists |
| Optional Google 3D Tiles | Real when `VITE_GOOGLE_MAPS_KEY` exists |
| Zone hover/click tooltips | Real |
| Region filtering | Real, heuristic region grouping in frontend |
| Layer toggles | Real |
| Infrastructure model rendering | Real GLB models referenced from `/models/...` |
| Animated flows, people dots, speech bubbles | Real visualization driven by simulated data |
| User-uploaded GIS layers | Missing |
| Export/share map state | Missing |

Evidence: `frontend/src/components/MapView.tsx`, `frontend/src/map/layers.ts`, `frontend/src/store.ts`.

## Infrastructure Placement Functionality

Implemented placeable asset kinds:

| Kind | Current behavior |
|---|---|
| `solar` | Place manually or via planner; generates monthly supply with solar capacity factor |
| `wind` | Place manually or via planner; generates monthly supply with wind capacity factor |
| `battery` | Place manually or via planner; peak shaving/enabling credit, not net generation |
| `microgrid` | Place manually or via planner; generation plus resilience during outages |

Placement flow:

1. User selects kind and clicks map.
2. Frontend creates optimistic `Infra`.
3. Frontend calls `/api/infra`.
4. Backend adds it to the in-memory engine and returns subject approval counts.
5. If Supabase proposal is selected, frontend also calls `/api/proposals/{proposal_id}/infrastructure`.
6. Metrics, sentiment, flows, siting priority, and voices refresh.

Limitations:

| Limitation | Current truth |
|---|---|
| No EV charger placement | EV chargers may appear as existing infra data, but not as a placeable `InfraKind` |
| No custom asset upload | `asset_definitions` exists but is metadata-only in the current UI/API |
| No construction phasing | Status is simple `planned`, `active`, `damaged` |
| No interconnection queue/capacity | Grid load is simplified, not a utility interconnection model |
| No detailed cost model | Costs are fixed presets/heuristics |

## Saved Proposal and Snapshot Functionality

Phase 3 persistence is real when Supabase is configured.

What works:

| Capability | Status | Evidence |
|---|---|---|
| Create/select projects | Implemented | `ProjectsTab`, `/api/projects` |
| Create/select proposals | Implemented | `ProjectsTab`, `/api/proposals` |
| Persist new placements under selected proposal | Implemented | `frontend/src/store.ts`, `/api/proposals/{id}/infrastructure` |
| Reload proposal placements after refresh/reselect | Implemented | `selectProposal()` in `frontend/src/store.ts` |
| Save snapshots with metrics/scenarios/infrastructure | Implemented | `saveSnapshot()` in `frontend/src/store.ts`, snapshot migration |
| Get latest snapshot | Implemented | `/api/proposals/{id}/snapshots/latest` |
| Upload CSV/JSON/GeoJSON datasets | Implemented (Phase 7) | `DatasetUploadPanel`, `/api/datasets/upload` |
| List/preview/delete uploaded datasets | Implemented (Phase 7) | `/api/projects/{id}/datasets`, Saved tab |
| Planner reads uploaded dataset summaries | Implemented (Phase 7) | `dataset_context.py`, WS `projectId`/`proposalId` |
| Generate dataset-grounded cohort concerns | Implemented (Phase 8) | `CohortConcernsPanel`, `/api/projects/{id}/cohorts/generate` |
| Planner reads synthetic cohort concern summaries | Implemented (Phase 8) | `cohort_context.py`, `build_planner_context` |
| Operator recommends proposal changes from concerns | Implemented (Phase 9) | `concern_recommendations.py`, ChatPanel concern mode |
| Generate proposal impact report / decision memo | Implemented (Phase 10) | `report_generator.py`, `DecisionMemoPanel`, `/api/proposals/{id}/report` |

What does not yet work:

| Capability | Current truth |
|---|---|
| Full simulation restore from snapshot | Latest snapshot is displayed and stored, but not replayed into the engine as a complete state restore |
| Multi-user isolation/auth | Not implemented |
| Dataset upload MVP | Implemented (Phase 7): upload/list/preview/delete; planner context; no sim rebuild |
| Full simulation rebuild from uploaded data | Not implemented |
| True autonomous LLM resident/cohort agents | Not implemented — Phase 8 uses deterministic rules only |
| Validated public consultation / survey results | Not implemented — concerns are synthetic decision-support signals |
| Versioned proposal diff/review workflow | Not implemented |

## Scenario and Disaster Functionality

Implemented scenarios are rule-based events that mutate the session engine.

Backend-supported scenario types include:

| Type | Example effects |
|---|---|
| `earthquake` | Damages infra, outages zones, reduces grid capacity |
| `heatwave` | Increases demand, gathers residents at cooling centers, shifts sentiment to solar/battery |
| `ice_storm` | Increases heating demand, damages infra, outages zones |
| `blackout` | Outages many zones, reduces grid capacity, boosts microgrid/battery sentiment |
| `gas_spike` | Increases adoption incentive and solar sentiment |
| `population_boom` | Increases demand |
| `policy_incentive` | Increases adoption and solar/battery sentiment |
| `flood` | Hits high flood-risk zones when data exists |
| Additional backend types | `cold_snap`, `drought`, `wind_lull`, `grid_upgrade`, `ev_surge`, `factory_opening`, `turbine_noise_complaint`, `solar_approved`, `custom` |

Frontend presets currently expose an older subset in `frontend/src/types.ts` and `frontend/src/components/ScenarioControls.tsx`.

Truth: scenarios are useful visual stress tests, not calibrated disaster models.

## Metrics and Dashboard Functionality

The dashboard shows:

| Metric | Current source |
|---|---|
| Coverage | `SimEngine._compute()` |
| Approval | Sentiment model aggregate |
| Equity | Coverage weighted by energy burden/environment/heat vulnerability |
| Clean kWh/mo | Simulated supply |
| Grid load | Simplified peak load vs capacity with battery shaving |
| Emissions/mo | Unmet demand times marginal gas factor |
| Capital | Sum of current infrastructure costs |

Evidence: `backend/app/sim/engine.py`, `frontend/src/components/Hud.tsx`.

Truth: these are directional simulation metrics. They should not be pitched as engineering-grade financial, grid, or emissions estimates.

## AI Planner Functionality

There are two planner realities.

| Mode | Current truth |
|---|---|
| Real LLM configured | Planner can use Anthropic or Feather function/tool calling |
| Default/no keys | Planner is scripted/demo or deterministic planner-lite |

The planner can:

| Capability | Status |
|---|---|
| Inspect city state and metrics | Implemented |
| Run optimizer | Implemented |
| Place infrastructure | Implemented |
| Run simulation | Implemented |
| Launch adoption programs | Implemented as simulated incentive levers |
| Respond to scenarios during chat | Implemented in demo and LLM paths |
| Ask for approval in step mode | Implemented over WebSocket |
| Recommend proposal improvements from synthetic cohort concerns | Implemented (Phase 9) — structured `recommendation` events, concern-topic mapping, optional tool placements |
| Read uploaded datasets + proposal infra in planner context | Implemented (Phase 7–9) | `build_planner_context` |

It does not yet:

| Missing behavior | Why |
|---|---|
| Persist planner memory across app sessions | WebSocket session only (concern runs optionally log to `planner_runs`) |
| Provide validated tradeoff reports | Chat/recommendation events and Phase 10 decision memo are decision-support, not engineering sign-off |
| Export stakeholder-ready PDF reports | Phase 10 provides markdown/HTML only; no PDF pipeline |
| Autonomous real resident LLM agents | Phase 8/9 concerns remain deterministic/synthetic |

Evidence: `backend/app/planner.py`, `frontend/src/components/ChatPanel.tsx`, `frontend/src/api/client.ts`.

## Resident Agents and Voices Functionality

Current resident-like layer:

| Question | Answer |
|---|---|
| Are individual humans currently modeled? | No. The app models representative agents generated/sampled from zone data. They are not real humans. |
| Are they actual LLM-powered agents? | No. The runtime resident layer is arrays plus rule-based sentiment/voices. |
| Are they persistent? | No. Agent state is in-memory and resettable; SQL `agent_profiles` is not wired into runtime. |
| Do they reason independently? | No. Sentiment is vectorized and templated, not autonomous reasoning. |
| Do they have memory? | No durable individual memory. Opinion can drift during a session, but no persistent per-agent memory. |
| Do they react to infrastructure changes? | Yes, through rule-based sentiment shifts and reaction voice templates. |
| Are voices templated, rule-based, LLM-generated, or mock data? | Primarily rule-templated. Optional LLM rewriting exists only with real provider keys. Frontend also has mock voices when backend is unavailable. |
| Where does this happen? | `backend/app/sim/sentiment.py`, `backend/app/sim/voices.py`, `backend/app/sim/llm.py`, `frontend/src/data/mock.ts`. |

What is real:

- Agents have `id`, `zoneId`, `position`, archetype, demand, income, rooftop, EV, and solar adoption fields.
- Sentiment changes in response to placement, programs, scenarios, and time.
- Voices are tied to sampled agent ids and positions.
- Voices can reference renters, owners, businesses, wind noise, bills, heatwaves, blackouts, and programs.

What is not real:

- No resident has an LLM loop.
- No resident stores memory or a private history.
- No resident independently reads the proposal and reasons.
- No resident is grounded in uploaded household records.
- Phase 8 saves deterministic cohort concerns to `agent_concerns` when generated; runtime map voices remain separate.

## What Is Real

These can be claimed carefully:

| Claim | Honest status |
|---|---|
| Interactive 3D Toronto energy-planning prototype | Real |
| Rule-based agent/population simulation | Real |
| Manual placement of solar, wind, battery, and microgrid assets | Real |
| Scenario stress tests with visual impacts | Real |
| Equity-weighted siting recommendations | Real as heuristic optimizer |
| Optional LLM-backed planner | Real when keys are configured |
| Scripted no-key planning demo | Real |
| Supabase project/proposal/placement/snapshot persistence | Real when env and migrations are configured |
| Existing city/context layers from committed data | Real for included processed datasets |

## What Is Mocked

| Surface | Mock behavior |
|---|---|
| Frontend offline zones/agents | `frontend/src/data/mock.ts` |
| Frontend offline metrics | `metricsForTick()` in `mock.ts` |
| Frontend offline scenarios | `mockScenario()` and `scenarioImpact()` |
| Frontend offline voices | `mockVoices()` |
| Frontend offline planner | `mockPlannerEvents()` |
| Seed infra | `seedInfra()` creates starter assets in both live/offline flows |

## What Is Fallback-Only

| Surface | Fallback trigger | Result |
|---|---|---|
| REST calls | Backend unavailable or non-OK | Mock data/local behavior |
| `/ws/sim` | Socket unavailable | Local step/play loop |
| `/ws/planner` | Socket unavailable | Mock planner session |
| Supabase | Env missing | Memory mode and disabled UI |
| ML | `ml.inference` absent/fails | Baseline/heuristic logic |
| LLM | No real provider | Rule-based rationales/voices and scripted planner |

## What Can Honestly Be Pitched Today

Safe pitch:

> WattIf is an interactive Toronto clean-energy planning prototype that lets users place renewable and resilience infrastructure, run a simplified monthly simulation, test scenario stressors, view equity/coverage/approval metrics, receive heuristic siting recommendations, and optionally persist proposals and snapshots with Supabase. It includes an agentic planner interface that can run with real LLM providers or a scripted demo fallback.

Good demo claims:

| Claim | Safe wording |
|---|---|
| AI planner | "Agentic planner interface with real LLM support and a no-key scripted fallback" |
| Resident voices | "Simulated resident/cohort voices generated from representative agents and sentiment rules" |
| Persistence | "Supabase-backed saved proposals, placements, and snapshots when configured" |
| Disaster scenarios | "Rule-based stress-test scenarios for exploring resilience tradeoffs" |
| Equity | "Heuristic equity-weighted scoring using energy burden and contextual layers" |

## What Should Not Be Claimed Yet

Avoid these claims:

| Do not claim | Why |
|---|---|
| "Models real residents" | Agents are representative synthetic/sampled records, not real humans |
| "Resident AI agents reason independently" | Voices are rule/template generated, not autonomous LLM agents |
| "Upload any city dataset" | No upload flow or runtime project data binding |
| "Supports EV charger planning" | EV chargers are existing/context data only, not placeable infrastructure |
| "Engineering-grade grid impact" | Grid load is simplified and not power-flow/interconnection analysis |
| "Validated cost estimates" | Costs are presets/heuristics |
| "Production multi-user platform" | No auth, RLS, tenant isolation, or durable sim sessions |
| "Planner is always LLM-powered" | Default provider is scripted demo |
| "Snapshots fully restore simulations" | Snapshot payloads are saved but not full engine replay/restore |

## Recommended Phase 5 Direction

The most valuable Phase 5 is to make the project truly data-grounded and proposal-centric:

1. Add project-scoped dataset upload/import for small CSV/GeoJSON files.
2. Bind uploaded data to map layers and simulation inputs with explicit schema mapping.
3. Make snapshots restorable, not just saved.
4. Upgrade resident voices into persistent cohort agents tied to datasets and proposals.
5. Add an honest capability/status panel so users can see live backend, Supabase, real LLM, ML, and fallback state.

## Key Takeaways

- WattIf today is a strong interactive prototype, not a production planning tool.
- Phase 3 persistence is real for projects, proposals, infrastructure placements, and snapshots, but persistence is still partial.
- The map/simulation/optimizer are meaningful and demonstrable, but they are heuristic.
- Resident agents are currently simulated cohorts plus templated voices, not independent AI agents.
- The best next product move is to ground proposals in uploaded/project data and make saved snapshots fully restorable.
