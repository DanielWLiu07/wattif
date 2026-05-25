# WattIf — Project Plan

> **Trust order:** Running code and [project_details.md](./project_details.md) over this plan when they disagree on *current* behavior. This document describes **where we are going**, not only what exists today.

---

## Target Vision

WattIf should become a **Figma/SimCity-style sandbox** for clean-energy infrastructure planning.

**Target user:** City designer, urban planner, energy planner, or infrastructure decision-maker who wants to test proposals before spending real money or committing to construction.

**Target experience:**

1. Upload or connect relevant **city datasets** (boundaries, grid, demand, demographics, restrictions, surveys, weather risk).
2. Explore a **GIS/3D map** (Mapbox + deck.gl).
3. Propose infrastructure — solar, wind, **EV chargers**, batteries, microgrids, and **custom uploaded assets**.
4. See **generation, demand matching, cost, grid load, equity, sentiment, cohort concerns, and disaster resilience**.
5. Work with an **operator/planner agent** (Claude primary, Featherless fallback) that interprets resident concerns and recommends improvements.
6. Interact with **cohort resident agents** (demo scope: ~20–30 personas) grounded in data — not template-only voices.
7. **Persist proposals** (Supabase) and export decision-ready summaries.

**Agent vision (target):**

| Agent type | Target behavior |
|------------|-----------------|
| **Resident / cohort agents** | Personalities from datasets; react to proposals; voice concerns (noise, equity, EV access, outages) |
| **Operator / planner agent** | Interprets concerns; recommends infra; explains tradeoffs; uses tools over city data |

---

## Current Implementation (Phase 0 baseline)

See [project_details.md](./project_details.md). Summary:

- Toronto-only fixtures, no upload, no Supabase, no persistence
- Placeable: solar, wind, battery, microgrid — **not EV chargers**
- Scripted demo planner by default; real LLM optional
- Template voices + rule-based sentiment — **not cohort LLM agents**
- In-memory session only

Status labels: [status_contract.md](./status_contract.md).

---

## Phased roadmap

### Phase 1 — Align docs, product truth, and runtime honesty labels ✅ (this phase)

| Task | Deliverable |
|------|-------------|
| 1.1 | `project_details.md`, `project_plan.md`, updates to OVERVIEW/ARCHITECTURE |
| 1.2 | `status_contract.md` |
| 1.3 | Top-bar honesty badges (Live/Mock, Demo/Real LLM planner, Template/LLM voices, In-memory) |
| 1.4 | `.env.example` placeholders including Supabase (not required yet) |
| 1.5 | Verification (build, tests) |

**Out of scope:** Supabase client, migrations, new agents, sim changes.

### Phase 2 — Supabase persistence (planned)

- Supabase project + schema for proposals, sessions, assets metadata
- Backend service role integration
- Frontend anon client for save/load proposal
- Replace “In-memory” badge when persistence is real
- **Do not start in Phase 1**

### Phase 3 — Dataset ingest (planned)

- Upload API for GeoJSON/CSV zones, infra points, survey priors
- Validation pipeline; city/session abstraction beyond Toronto-only

### Phase 4 — Custom assets (planned)

- Upload GLB or asset manifest; register new infra kinds in sim (scoped)

### Phase 5 — Cohort resident agents (planned)

- 20–30 named personas; structured concerns on placement/scenario
- Optional LLM layer grounded in cohort state
- Planner consumes aggregated concerns

### Phase 6 — Operator agent upgrade (planned)

- Claude primary, Featherless fallback (formalize in config)
- Planner reads voice/concern feed; richer tool surface (EV, noise proxy)

### Phase 7 — EV infrastructure + reporting (planned)

- EV charger as placeable `InfraKind`; demand/adoption hooks
- Export summary / PDF

---

## LLM strategy (target)

| Priority | Provider | Config |
|----------|----------|--------|
| 1 | Anthropic (Claude) | `ANTHROPIC_API_KEY` |
| 2 | Featherless / OpenAI-compatible | `FEATHER_API_KEY`, `FEATHER_BASE_URL` |
| 3 | Scripted demo | `WATTIF_DEMO_LLM=1` when no keys |

Today: Phase 1 labels expose which path is active via `/api/health`.

---

## Audit documentation

If present, deep-dive audits live under `docs/audit/`:

- [complete_system_architecture.md](./audit/complete_system_architecture.md)
- [current_project_details.md](./audit/current_project_details.md)
- [vision_gap_analysis.md](./audit/vision_gap_analysis.md)

Regenerate or refresh audits when major phases land.

---

## Key Takeaways

1. **Phase 1 is documentation and honesty** — no Supabase, no new agents, no sim rewrite.
2. **Target vision is a multi-phase effort**; see [status_contract.md](./status_contract.md) before claiming features in pitches.
3. **Phase 2 starts Supabase**; env placeholders exist in Phase 1 but are not required to run the app.
