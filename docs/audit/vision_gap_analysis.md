# WattIf — Vision Gap Analysis (Audit)

**Audit date:** Post–Phase 3 persistence.  
**Purpose:** Truth table — vision vs **current code**, not roadmap promises.

---

## Summary

Phase 3 delivered **partial Supabase persistence**: projects, proposals, proposal-scoped infrastructure, and manual simulation snapshots. The **live sim singleton** and most “platform” features remain in-memory or unimplemented.

**Correct framing:** Persistence is **partially implemented** through Supabase. It is **not** the same as a full production planning platform.

---

## Truth table

| Capability | Vision / pitch | Current reality | Gap severity |
|------------|----------------|-----------------|--------------|
| **Database / persistence** | Cloud-saved plans | Supabase Postgres when env + migrations set; else memory-only API 503 | **Partial** — was “none”, now partial |
| **Saved projects & proposals** | Multi-scenario planning | CRUD via REST + Saved tab | **Low** for MVP save/load |
| **Infrastructure persistence** | Assets survive sessions | `proposal_infrastructure` + reload on select | **Low** for scoped save |
| **Simulation snapshots** | Version history | Manual save; list/history; restore to live sim; latest GET; JSON includes metrics/scenarios/infra | **Low** for MVP versioning; no auto-save |
| **Live sim state** | Full state in DB | In-memory `World` only | **High** |
| **Multi-user auth / RBAC** | Teams, permissions | None; service role backend | **High** |
| **Row-level security** | Tenant isolation | Not enabled | **High** |
| **Dataset upload** | Real utility data | Table stub; no upload flow | **High** |
| **Report export** | PDF/CSV deliverables | Not implemented | **High** |
| **LLM resident agents** | Autonomous stakeholders | Template voices; optional LLM on some REST | **High** |
| **EV charger placement** | Full asset catalog | Placeable + lightweight sim/sentiment/optimizer; not full network planning | **Low** for demo sandbox |
| **Real-time collab** | Multi-user edit | Not implemented | **High** |
| **Planner / siting ML** | Production ML | Heuristic + optional models | **Medium** |

---

## Stale claims corrected (pre–Phase 3 audit)

These statements were **wrong** and are removed from current audit docs:

| Stale claim | Current truth |
|-------------|---------------|
| “No database” | Supabase optional; 9+ tables with migrations |
| “No persistence” | Projects, proposals, infra, snapshots persist when configured |
| “No saved proposals” | Saved tab create/select works |
| “Refresh loses all work” | Selected proposal reloads infrastructure from DB |
| “Frontend talks to Supabase directly” | Frontend uses FastAPI only |
| “Persistence routes always work” | 503 when Supabase unset; 502 on DB errors |

---

## What persistence is real (Phase 3)

Verified flows (code + manual QA):

1. **Migrations:** Base tables + `simulation_snapshots.scenarios` / `.infrastructure` JSONB
2. **API:** `GET/POST /api/projects`, `GET/POST /api/proposals`
3. **Infrastructure:** `GET/POST/DELETE /api/proposals/{id}/infrastructure`
4. **Snapshots:** `POST /api/proposals/{id}/snapshots`, `GET .../snapshots/latest`
5. **Frontend:** Saved tab, `selectProposal` reload, `addInfraAt` dual-write, `saveSnapshot`, `removeInfra` delete
6. **Health:** `persistenceProvider` / `supabaseConfigured` on `/api/health`
7. **Tests:** `backend/tests/test_persistence.py` (503 when disabled)

---

## What is still missing

### Platform / ops

- User authentication, orgs, RBAC
- RLS and multi-tenant isolation
- Automated migration deploy in CI
- Audit logs, backups strategy (beyond Supabase defaults)

### Product features

- Dataset upload and ingestion pipeline
- Report / export generation
- Full EV network planning / utility-grade siting (Phase 6 adds placeable demo chargers only)
- Snapshot **restore to live sim** (infra JSON replay; does not sync `proposal_infrastructure`)
- Auto snapshot on sim milestones
- Full sim state persistence (agents, ticks, flows history)

### AI / agents

- True LLM resident agents with memory and tool use
- Planner runs persisted and replayed (`planner_runs` table is skeleton)

### Frontend gaps

- No Supabase client (by design — backend writer only)
- Mock fallback when API down hides persistence entirely
- Latest snapshot display ≠ sim state restore

---

## Risk register (updated)

| Risk | Mitigation today | Residual |
|------|------------------|----------|
| Data loss on refresh | Proposal infra reload | Session infra without proposal still lost |
| Unauthorized DB access | Service role on backend only | No RLS; key leak = full DB |
| Stale docs | This audit + schema_contracts | Keep audit in sync with phases |
| Demo overstated as prod | TopBar badges, status_contract | Stakeholders may still assume “cloud app = SaaS” |

---

## Recommended next phases (informational)

Not commitments — gap closure order often cited in project plan:

1. Auth + RLS
2. Sync snapshot restore ↔ proposal_infrastructure (optional explicit “persist restore”)
3. Dataset upload
4. Report export
5. LLM agent loop (if still in vision)

---

## Key Takeaways

1. **Persistence moved from “none” to “partial Supabase”** — update all external messaging accordingly.
2. **Saved proposal infrastructure and manual snapshots are production-quality for a hackathon MVP**, not for enterprise planning.
3. **Largest remaining gaps:** auth, full sim persistence, dataset pipeline, export, real LLM agents.
4. **Do not conflate** “we have a database” with “we have a multi-user planning platform.”
# WattIf Vision Gap Analysis

Audit date: 2026-05-25

Purpose: compare the intended city-designer sandbox vision with the current implementation, using code evidence.

## Intended Vision Summary

The intended WattIf product is a Figma/SimCity-style sandbox for clean-energy infrastructure planning. City designers should be able to upload local datasets, visualize infrastructure and GIS layers, design proposals before construction, place many types of clean-energy and resilience assets, estimate cost/demand/generation/grid/equity/resilience impacts, run local disasters, understand resident/cohort reactions, and use an operator/planner agent to interpret concerns and recommend improvements.

The intended agent model has two categories:

| Agent category | Intended role |
|---|---|
| Resident/cohort agents | Represent households, humans, or groups; grounded in local/uploaded datasets; react to proposals; raise support, concern, tradeoff, and equity signals |
| Operator/planner agent | Works with the designer; interprets resident concerns; recommends infrastructure changes; evaluates proposals with tools/data; explains tradeoffs |

## Current Capabilities

Current WattIf is a strong demo prototype with:

- React/deck.gl 3D Toronto map.
- Manual placement of solar, wind, battery, and microgrid assets.
- Rule-based monthly simulation for demand, clean supply, grid load, emissions, equity, cost, adoption, and approval.
- Rule-based scenarios such as blackout, heatwave, ice storm, gas spike, policy incentive, and flood.
- Heuristic optimizer and build-priority scoring.
- Optional LLM-backed operator/planner, with scripted demo fallback by default.
- Simulated resident voices from representative agents and sentiment rules.
- Optional Supabase persistence for projects, proposals, placements, and snapshots.
- Committed Toronto/context layers such as facilities, constraints, flood, heat vulnerability, existing infra, district energy, generation mix, and emissions context.

## Implemented vs Partial vs Mocked vs Missing

| Capability | Status | Evidence |
|---|---|---|
| Interactive 3D map | Implemented | `frontend/src/components/MapView.tsx`, `frontend/src/map/layers.ts` |
| Toronto zone visualization | Implemented | `backend/app/data/loader.py`, `frontend/src/data/mock.ts` |
| Manual infrastructure placement | Implemented for 4 kinds | `frontend/src/store.ts`, `backend/app/main.py`, `backend/app/models.py` |
| Save proposals/placements | Implemented with Supabase | `backend/app/routes/persistence.py`, `frontend/src/components/ProjectsTab.tsx` |
| Save snapshots | Implemented with metrics/scenarios/infrastructure JSONB | `frontend/src/store.ts`, `supabase/migrations/20250526120000_snapshot_extras.sql` |
| Restore proposal infrastructure | Implemented | `selectProposal()` in `frontend/src/store.ts` |
| Restore full snapshot state | Partial/missing | Latest snapshot is loaded/displayed, but not replayed into engine |
| Scenario stress testing | Implemented as rules | `backend/app/scenarios.py` |
| Metrics dashboard | Implemented | `backend/app/sim/engine.py`, `frontend/src/components/Hud.tsx` |
| Optimizer | Implemented as heuristic/greedy default | `backend/app/optimizer.py` |
| Operator/planner agent | Partial | Real LLM only with provider keys; scripted default in `backend/app/planner.py` |
| Resident/cohort voices | Partial | Rule-templated voices in `backend/app/sim/voices.py` |
| True resident AI agents | Missing | No per-agent LLM loops, memory, persistence, or concern records |
| Dataset upload | Missing | No frontend upload or backend upload route |
| Arbitrary GIS layer import | Missing | Only committed/known layers are loaded |
| EV charger placement | Missing | `InfraKind` excludes EV chargers |
| ML-backed modeling | Fallback/optional | `backend/app/ml_bridge.py` no-ops when `ml.inference` absent |
| Auth/multi-user platform | Missing | Migrations defer RLS/auth; backend uses service-role Supabase key |

## Truth Table

| Claim | Current status | Evidence from code | Can we pitch this today? | What is needed to make it real? |
|---|---|---|---|---|
| WattIf is an interactive clean-energy planning prototype | Implemented | `frontend/src/App.tsx`, `frontend/src/components/MapView.tsx` | Yes | Continue calling it a prototype/demo |
| Users can place solar, wind, batteries, and microgrids | Implemented | `frontend/src/types.ts`, `backend/app/models.py`, `frontend/src/store.ts` | Yes | Add validations/constraints and richer asset specs for planning use |
| Users can place EV chargers | Missing | `InfraKind` only includes `solar`, `wind`, `battery`, `microgrid` | No | Add `ev_charger` model, UI, sim effects, persistence compatibility |
| WattIf can save proposals | Implemented when Supabase configured | `backend/app/routes/persistence.py`, `frontend/src/components/ProjectsTab.tsx` | Yes, with qualifier | Add auth, RLS, ownership, and error recovery |
| WattIf saves snapshots with metrics/scenarios/infrastructure | Implemented | `SimulationSnapshotCreate`, migration adding `scenarios` and `infrastructure` | Yes | Add full restore/replay support |
| WattIf fully restores simulation snapshots | Partial/missing | `selectProposal()` loads latest snapshot but re-places infra and resets simulation | No | Engine snapshot hydrate endpoint and frontend restore action |
| WattIf supports uploaded city datasets | Missing | `uploaded_datasets` SQL exists, but no upload route or UI | No | File upload, storage, schema mapping, project binding, validation |
| WattIf visualizes GIS layers | Partial | Known layers in `frontend/src/map/layers.ts` and `backend/app/data/loader.py` | Yes, for built-in layers | Arbitrary GeoJSON/CSV layer importer |
| WattIf estimates cost | Partial heuristic | `INFRA_PRESETS`, `COST_PER_KW`, `candidate_cost()` | Carefully | Replace presets with configurable cost library/assumptions |
| WattIf estimates generation | Partial heuristic | `CAPACITY_FACTOR` in `backend/app/sim/engine.py` | Carefully | Resource data, temporal profiles, asset-specific specs |
| WattIf estimates grid/load impact | Partial heuristic | `grid_load_pct` in `SimEngine._compute()` | Carefully | Power-flow/interconnection model and feeder/grid data |
| WattIf estimates equity impact | Implemented heuristic | `zone_equity_weight` and `equity_score` in `backend/app/sim/engine.py` | Yes, as heuristic | Document methodology and support custom equity datasets |
| WattIf estimates resilience impact | Partial heuristic | Outage/microgrid behavior in `backend/app/scenarios.py` and `engine.py` | Carefully | Calibrated outage/restoration/resilience model |
| WattIf has resident voices | Implemented as simulated voices | `backend/app/sim/voices.py`, `frontend/src/components/VoicesFeed.tsx` | Yes, with qualifier | Persistent, proposal-grounded cohort agents |
| WattIf has LLM-powered resident agents | Missing/optional rewrite only | `enrich_voices()` only rewrites templates with real provider keys | No | Per-cohort prompts, memory, tools, persisted concerns |
| WattIf has an operator/planner agent | Partial | `backend/app/planner.py`, `frontend/src/components/ChatPanel.tsx` | Yes, with qualifier | Make real provider status explicit and persist runs |
| The planner is always a real LLM | False | `WATTIF_DEMO_LLM` defaults scripted provider on | No | Require real provider or disclose demo mode clearly |
| ML models drive the simulation | Mostly false | `ml_bridge` is optional and defensive | No | Ship model code/artifacts and validate outputs |
| App works without backend | Implemented fallback | `frontend/src/api/client.ts`, `frontend/src/data/mock.ts` | Yes | Label offline/mock mode clearly |
| Current outputs are decision-grade | Not yet | Heuristics and fallbacks throughout sim/planner | No | Validation, assumptions, uncertainty, calibrated datasets |

## Product Gaps

| Gap | Impact |
|---|---|
| No upload/import workflow | Product cannot yet adapt to a city designer's own datasets |
| No proposal canvas metaphor | Users place assets on a map, but not in a Figma-like object/versioning workflow |
| No project-scoped data model | Supabase saves proposals, but runtime data is global Toronto fixtures |
| No export/report workflow | Planner results and proposal impacts are not packaged for review |
| No role/auth model | Not ready for real teams or municipalities |
| No explicit assumptions panel | Users may over-trust heuristic outputs |

## Architecture Gaps

| Gap | Current state | Needed architecture |
|---|---|---|
| Session isolation | One process-wide `World` in `backend/app/state.py` | Project/session-scoped worlds with durable IDs |
| Snapshot restore | Save-only plus display | Snapshot hydrate/replay and deterministic versioning |
| Dataset binding | Processed global fixtures | Project datasets, schema mapping, provenance |
| Capability honesty | Health fields exist but UI can still look fully capable in fallback | Prominent capability/status model across UI |
| Agent persistence | Future SQL tables, not runtime | Runtime agent profiles/concerns linked to proposals |
| Planner persistence | WebSocket memory only | Stored planner runs, decisions, tool traces, summaries |
| Type consistency | Frontend scenario type list lags backend | Shared generated schema/contracts |

## Data Gaps

| Intended data | Current state |
|---|---|
| Uploaded city datasets | Missing |
| Local GIS layers | Only committed known Toronto/context layers |
| Household/resident survey data | Not present |
| Detailed grid topology/feeders | Not present |
| Interconnection constraints | Not present beyond coarse no-build/siting penalties |
| Asset cost catalogs | Presets only |
| Temporal demand/generation profiles | Simplified monthly calculations |
| Building-level suitability | Visual buildings exist, but not analytical building-level siting |
| Cohort/persona source provenance | Archetypes/attitudes can be loaded, but no user-provided grounding |

## AI and Agent Gaps

### Resident-Agent Section

| Question | Honest answer |
|---|---|
| Are individual humans currently modeled? | No. Current agents are representative synthetic/sampled records, not real humans. |
| Are they actual LLM-powered agents? | No. Resident voices are generated from rules/templates. LLM can optionally rewrite text, but that is not independent agency. |
| Are they persistent? | No. Runtime agents and opinions live in the process/session. SQL tables for `agent_profiles` and `agent_concerns` exist but are not wired to runtime behavior. |
| Do they reason independently? | No. Opinion changes are vectorized sentiment shifts and templated reactions. |
| Do they have memory? | No durable memory. There is transient opinion drift during a session. |
| Do they react to infrastructure changes? | Yes, through `SentimentModel.on_placement()`, subject approval, and `reaction_voices()`. |
| Are voices templated, rule-based, LLM-generated, or mock data? | Backend voices are rule-templated; optionally LLM-rewritten with real provider keys. Frontend has mock voices when backend is absent. |
| Where in code does this happen? | `backend/app/sim/sentiment.py`, `backend/app/sim/voices.py`, `backend/app/sim/llm.py`, `frontend/src/data/mock.ts`. |
| What is needed to upgrade them? | Persist cohort profiles, bind them to project datasets, store concerns/memory, give them proposal context and tools, and run controlled LLM or rule+LLM deliberation per cohort. |

Upgrade path to true resident/cohort AI agents:

1. Define `CohortAgent` as a persisted project/proposal entity, not a transient generated `Agent`.
2. Bind each cohort to uploaded/local data slices: tenure, income, building type, EV access, heat/flood vulnerability, proximity to proposed assets.
3. Add a proposal evaluation input: changed infrastructure, local benefits, local costs, disaster impacts, distributional effects.
4. Generate structured concerns first, prose second. Store concerns in `agent_concerns`.
5. Add memory: prior stance, previous proposals, resolved/unresolved concerns.
6. Add evaluation mode: deterministic rule score plus optional LLM explanation.
7. Make voices auditable with provenance: which facts and rules drove the concern.

### Operator/Planner Agent Gaps

| Current planner strength | Gap |
|---|---|
| Can call tools and place assets | Needs stronger grounding in project/uploaded data |
| Can run live over WebSocket | Needs durable run logs and reproducible decisions |
| Can use real LLM providers | Needs UI disclosure of real vs demo provider |
| Can react to scenarios | Needs to interpret structured resident concerns |
| Can launch incentive programs | Needs policy/program semantics tied to costs and cohorts |

## Simulation Gaps

| Area | Current model | Gap |
|---|---|---|
| Demand | Monthly zone demand growth and scenario multipliers | Needs temporal profiles, building/sector breakdown, uploaded demand |
| Generation | Fixed capacity factors and zone potential | Needs resource profiles and asset specs |
| Battery | Peak shaving/enabling credit | Needs charge/discharge/storage model |
| Grid load | Simplified peak load vs capacity | Needs network/feeder/interconnection modeling |
| Equity | Weighted zone coverage | Needs transparent methodology and custom local indicators |
| Resilience | Outage and microgrid heuristics | Needs duration, restoration, critical facilities, service continuity |
| Adoption | Rule-based rooftop/EV adoption | Needs calibrated behavior or policy model |
| Sentiment | Vectorized opinion drift | Needs cohort-specific concern model |

## UX Gaps

| UX need | Current state |
|---|---|
| Figma-like canvas with object editing | Map placement exists, but no object inspector for detailed proposal editing/versioning |
| Dataset upload wizard | Missing |
| Layer manager for arbitrary GIS | Missing |
| Proposal comparison | Missing |
| Explanation of assumptions | Sparse/implicit |
| Capability mode disclosure | Some badges exist, but fallback/local/demo can still be mistaken for real |
| Export/share/report | Missing |
| Review of resident concerns | Voices feed exists, but no structured concern workflow |

## Safe Claims

Use these claims:

- "Interactive Toronto clean-energy siting prototype."
- "Rule-based simulation of clean supply, demand, cost, equity, emissions, grid load, and public approval."
- "Manual placement of solar, wind, battery, and microgrid assets."
- "Scenario stress tests for exploring resilience tradeoffs."
- "Heuristic optimizer and build-priority ranking."
- "Supabase-backed proposals, persisted placements, and snapshots when configured."
- "Simulated resident/cohort voices from representative agents."
- "Operator/planner chat with real LLM support and scripted fallback."

## Misleading Claims to Avoid

Avoid these claims until implemented:

- "Production city-planning platform."
- "Decision-grade engineering simulation."
- "Real resident agents."
- "LLM-powered resident agents."
- "Upload any city dataset."
- "Import arbitrary GIS layers."
- "EV charger placement."
- "Validated grid impact."
- "Automatically interprets resident concerns."
- "Planner always uses a real LLM."
- "Snapshots fully restore every simulation detail."

## Minimum Next Steps

Minimum steps to move toward the intended sandbox:

1. Add explicit capability/status UI: backend live, Supabase active, real LLM active, ML active, fallback/mock active.
2. Implement snapshot restore/hydrate so saved snapshots are not just historical records.
3. Add a basic project dataset upload flow for CSV/GeoJSON with metadata and validation.
4. Bind one uploaded dataset to one visible custom map layer.
5. Add project-scoped runtime world creation instead of a single global `World`.
6. Add persistent cohort profiles and stored concerns for proposals.
7. Expand infrastructure kinds to include EV chargers and make current support explicit.

## Recommended Phase 5

Recommended Phase 5: "Project Data and Truthful Agent Grounding."

Scope:

| Workstream | Deliverable |
|---|---|
| Dataset upload | Project-scoped CSV/GeoJSON upload, metadata, validation, list/delete |
| Layer binding | Render uploaded GeoJSON or point CSV as a custom map layer |
| Snapshot restore | Hydrate engine from saved infrastructure/scenarios/metrics or replay deterministically |
| Cohort agents v1 | Persist 5-10 cohort profiles per project, generated from loaded data, with structured concerns |
| Planner grounding | Planner reads saved proposal, current metrics, and cohort concerns before recommending changes |
| Honesty UI | Always-visible badge for Live/Mock, Supabase/Memory, Real LLM/Demo, ML/Heuristic |

Why this phase: it directly attacks the biggest credibility gap. The app already looks like the vision; now it needs data grounding and persistence semantics to make that appearance honest.

## Stretch Goals

| Stretch goal | Value |
|---|---|
| Proposal comparison view | Makes planning tradeoffs concrete |
| Exportable PDF/markdown report | Lets designers share results |
| EV charger asset model | Aligns with intended infrastructure vision |
| Cost assumptions editor | Makes estimates transparent |
| Scenario builder | Lets users define local shocks |
| Agent concern dashboard | Turns voices into actionable planning feedback |
| Shared generated API schema | Reduces frontend/backend type drift |
| Auth/RLS | Required for real teams |

## Key Takeaways

- WattIf is visually close to the intended sandbox but architecturally still a demo-oriented simulator.
- The current repo has real value: map, simulation, optimizer, scenarios, planner interface, and Supabase proposal persistence.
- The largest truth gap is resident/cohort agency. Current voices are simulated and templated, not independent persistent AI agents.
- The second largest gap is uploaded/project data. The app runs on committed Toronto fixtures and seed/mock fallbacks, not user-provided city datasets.
- Phase 5 should prioritize data grounding, snapshot restore, persistent cohort concerns, and explicit capability disclosure before adding more visual features.
