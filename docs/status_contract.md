# WattIf — Implementation Status Contract

This document defines the **status labels** used in project documentation and (where applicable) the runtime UI. All docs and badges should use these terms consistently.

**Authority:** When docs disagree, trust the [audit docs](./audit/) (if present), then running code, then this contract, then older vision notes.

See also: [project_details.md](./project_details.md) (current truth), [project_plan.md](./project_plan.md) (phased roadmap).

---

## Status labels

| Label | Meaning |
|-------|---------|
| **Implemented** | Works in production code paths today; not dependent on mock/fallback for core behavior when backend is running. |
| **Mocked** | Frontend or offline path synthesizes data locally (`frontend/src/data/mock.ts`) when the backend is unreachable or an endpoint fails. |
| **Fallback-only** | Feature exists but degrades to rules, heuristics, or scripted behavior when optional deps (LLM, ML, processed data) are missing. |
| **Planned** | Explicitly scoped in the roadmap; placeholders may exist (env vars, docs) but no working implementation. |
| **Missing** | Not in the codebase; no stubs beyond documentation. |

---

## Feature status reference

| Feature | Status | Notes |
|---------|--------|-------|
| Mapbox / deck.gl map (Toronto) | **Implemented** | `MapView.tsx`, `map/layers.ts`; MapLibre fallback without token |
| Solar / wind / battery / microgrid placement | **Implemented** | `POST /api/infra`, sim engine |
| Equity-weighted optimizer | **Implemented** | Greedy path on `POST /api/optimize` |
| Monthly tick simulation | **Implemented** | Rule-based `SimEngine` |
| Scenario stress tests (blackout, heatwave, etc.) | **Implemented** | `scenarios.py` + frontend controls |
| Existing infra map layer (incl. EV chargers) | **Implemented** | Read-only from `existing_infra.json` |
| Frontend offline mock | **Mocked** | Full demo without backend |
| ML demand forecast / clustering | **Fallback-only** | Heuristics when `.joblib` absent |
| Planner **without** real LLM API keys | **Fallback-only** | Scripted demo (`WATTIF_DEMO_LLM=1` default) |
| Planner **with** Anthropic / Feather keys | **Implemented** | Real tool-calling LLM |
| Resident voices (sim tick + default REST) | **Fallback-only** | Template library in `voices.py` |
| Voice LLM enrichment | **Fallback-only** | Only when `realLlm` provider configured |
| Resident “agents” as autonomous AI | **Missing** | Simulation records + templates, not LLM agents |
| EV charger **placement** / simulation | **Implemented** | Placeable `ev_charger` kind; lightweight demand/sentiment/adoption effects; template voices |
| Dataset upload (city GIS, surveys, etc.) | **Missing** | Planned Phase 4+ |
| Custom asset upload (GLB definitions) | **Missing** | Planned Phase 4+ |
| Supabase persistence foundation | **Implemented** | Schema + backend client + REST when env configured; see [supabase_setup.md](./supabase_setup.md) |
| Proposal save / load (end-to-end UI) | **Implemented** | Supabase-backed projects/proposals UI; placements persist to selected proposal |
| Simulation snapshots (manual save) | **Implemented** | Explicit Save Snapshot action stores metrics, active scenarios, and infra state |
| Snapshot history + restore to live sim | **Implemented** | Saved tab lists snapshots; Restore replays infra JSON to live sim only (proposal rows unchanged) |
| Live vs snapshot metric comparison | **Implemented** | Saved tab compares coverage, approval, equity, emissions, grid load, cost |
| Live sim state persistence (automatic) | **Missing** | Still in-memory `World` singleton; snapshots are manual |
| Report export (PDF / summary) | **Missing** | Planned |
| Cohort resident AI agents (20–30 personas) | **Missing** | Planned |
| Operator agent reads resident concerns | **Missing** | Planner does not consume voice feed |
| Multi-city / upload your city | **Missing** | Toronto fixtures only |

---

## Runtime UI labels (Phase 1–2)

The top bar uses these user-facing strings (see `TopBar.tsx`):

| UI label | When shown |
|----------|------------|
| **Live API** / **Live + WS** | Backend zones fetch succeeded |
| **Mock data** | Backend unreachable |
| **Demo planner** | No `realLlm` in `/api/health` (includes offline mock) |
| **Real LLM planner** | `/api/health` reports `realLlm` (Anthropic or Feather) |
| **Template voices** | No `realLlm` (tick path always templated; label is conservative) |
| **LLM voices** | `realLlm` set — REST enrichment available |
| **In-memory** | Live backend, `persistenceProvider` is `"memory"` |
| **Supabase · no proposal** | Live backend, Supabase configured, but no proposal selected |
| **Saving to "<proposal name>"** | Live backend, Supabase configured, and placements/snapshots persist to the selected proposal |

---

## Documentation rules

1. Separate **Current Implementation** from **Target Vision** in all product docs.
2. Do not label **Fallback-only** or **Mocked** features as **Implemented** in pitch materials.
3. Do not label **Planned** env vars (e.g. Supabase) as required for Phase 1.
4. Update this table when a feature moves status (especially after Phase 2+).

---

## Key Takeaways

- **Implemented** means real code on the happy path—not demo scripts or mocks.
- **Fallback-only** is intentional degradation; disclose it in UI and docs.
- **Planned** items may have `.env.example` placeholders but must not be required to run the app.
