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

- Toronto-only fixtures, no upload, optional Supabase persistence for saved proposals
- Placeable: solar, wind, battery, microgrid — **not EV chargers**
- Scripted demo planner by default; real LLM optional
- Template voices + rule-based sentiment — **not cohort LLM agents**
- In-memory live sim engine; **optional Supabase** for projects/proposals, placements, and manual snapshots

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

### Phase 2 — Supabase persistence foundation ✅ (complete)

| Task | Deliverable | Status |
|------|-------------|--------|
| 2.1 | Config + `/api/health` persistence fields | Done |
| 2.2 | `supabase/migrations/` initial schema | Done |
| 2.3 | `backend/app/db/supabase_client.py` | Done |
| 2.4 | Repository layer skeleton | Done |
| 2.5 | Minimal REST: projects, proposals, asset definitions | Done |
| 2.6 | Top-bar **Supabase** vs **In-memory** badge | Done |
| 2.7 | `docs/supabase_setup.md`, status contract updates | Done |

**In scope (done):** Backend service-role client, SQL schema, CRUD skeleton, 503 when unconfigured.

**Still out of scope (Phase 3+):** Frontend Supabase client, sim state persistence, dataset/asset file upload, RLS/auth.

See [supabase_setup.md](./supabase_setup.md).

### Phase 3 — Persist proposal state ✅ (complete)

| Task | Deliverable | Status |
|------|-------------|--------|
| 3.1 | Project/proposal/placement/snapshot schema contracts | Done |
| 3.2 | `proposal_infrastructure` repository methods | Done |
| 3.3 | `simulation_snapshots` repository methods + snapshot extras migration | Done |
| 3.4 | Proposal infrastructure + snapshot REST routes | Done |
| 3.5 | Existing placement flow persists to selected proposal | Done |
| 3.6 | Minimal project/proposal selection UI | Done |
| 3.7 | Persisted placements reload into the active simulation when compatible | Done |
| 3.8 | Explicit manual Save Snapshot action | Done |
| 3.9 | Updated persistence honesty labels and docs | Done |

**Still in-memory:** the live simulation engine and automatic per-tick state remain in-process.

### Phase 4 — Dataset ingest + custom assets (planned)

- Upload API for GeoJSON/CSV zones, infra points, survey priors
- Validation pipeline; city/session abstraction beyond Toronto-only
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
3. **Phase 3 proposal persistence is shipped**; env vars optional; live sim ticks remain in-memory while selected proposals can persist placements and manual snapshots.
