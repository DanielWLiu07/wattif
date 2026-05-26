# WattIf Phase 11 — Proposal Review Demo Flow

This guide walks through the ideal judge/stakeholder demo using the **Saved** tab as the review hub. Everything below is **decision-support only** — not engineering validation, not municipal approval evidence, and not a substitute for real public consultation.

## Prerequisites

- Backend running with Supabase env vars configured (`SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`)
- Frontend connected (TopBar shows **Supabase**, not Memory)
- Optional: Islington sample CSVs in repo root (`ev_chargers_islington_city_centre_west.csv`, `ev_owner_feedback_islington_city_centre_west.csv`, `energy_demand_islington_city_centre_west.csv`)

## Demo path (≈10 minutes)

### 1. Create or select a project

**Saved tab → Projects**

- Create a project (e.g. `Islington EV Pilot`)
- The **Proposal readiness** checklist shows *Project selected* ✓

### 2. Create or select a proposal

**Saved tab → Proposals**

- Create a proposal (e.g. `City Centre West EV Access`)
- **Proposal review** panel appears with summary stats and checklist progress

### 3. Upload datasets

**Saved tab → Datasets**

- Upload EV charger, feedback, and/or demand CSVs
- Explain: stored as metadata/previews for planner context — **does not rebuild Toronto simulation**
- Checklist: *Dataset uploaded* ✓

### 4. Generate synthetic cohort concerns

**Saved tab → Cohort concerns → Generate resident concerns**

- Explain: deterministic, dataset-grounded **synthetic** personas — not real residents or surveyed feedback
- Checklist: *Cohort concerns generated* ✓

### 5. Ask the operator for recommendations

**Chat tab (right dock)**

Suggested prompt:

> Based on resident concerns, what should we change in this proposal?

- Operator returns structured actions, tradeoffs, and optional placements
- Checklist: *Operator recommendation generated* ✓ (also persisted in `planner_runs` when Supabase is on)

### 6. Place concern-aware infrastructure

**Build tab**

- Place EV chargers, batteries, etc. (manual or accept operator placements)
- Return to Saved tab — **Persisted placements** and review summary show infra counts by type
- Checklist: *Infrastructure placed* ✓

### 7. Run simulation and save a snapshot

**Build tab**

- Step/play simulation; optionally fire heatwave or blackout scenario
- **Saved tab → Snapshot history → Save**
- Optional: use **Live vs snapshot** comparison
- Checklist: *Snapshot saved* ✓

### 8. Generate decision memo

**Saved tab → Decision memo → Generate decision memo**

- Review section chips to jump within preview
- Copy markdown or download `.md` / `.html`
- Checklist: *Decision memo generated* ✓

### 9. Explain caveats honestly

When presenting the memo, state clearly:

| Claim | Reality |
|-------|---------|
| "Residents said…" | Synthetic cohort concerns from dataset previews |
| "Grid-validated" | Rule-based demo simulation only |
| "Official planning doc" | Draft decision-support memo for demo |
| "Uploaded data rebuilt the city" | Context/summaries only — zones/demand unchanged |

The memo **Caveats** section repeats these limits.

## Proposal review panel (Phase 11)

The **Proposal review** block at the top of the Saved tab shows:

- Selected project/proposal names
- Infrastructure count by type
- Latest snapshot status
- Dataset and concern counts
- Operator recommendation on file (yes/no)
- Decision memo status and timestamp

The **Proposal readiness** checklist tracks 8 demo steps with next-action hints for anything missing.

## Supabase disabled

If persistence is off (Memory mode):

- Saved tab shows configuration guidance
- Checklist items remain visible but actions return 503 / disabled states
- In-memory simulation and Chat still work; nothing persists

## What this demo does not cover

- User authentication / multi-tenant RLS
- PDF export
- Full RAG or autonomous LLM resident agents
- Engineering-grade grid interconnection studies
- Regenerating the Toronto simulation from uploaded datasets

## Quick verification

After the demo path:

1. Refresh the page — proposal infra reloads; operator-rec flag survives in session storage if generated this session
2. Regenerate decision memo — should include infra, datasets, concerns, recommendations, snapshot metrics, tradeoffs, caveats
3. Confirm EV placement, snapshot restore, dataset delete, and concern generation still work
