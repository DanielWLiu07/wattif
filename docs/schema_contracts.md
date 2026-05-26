# WattIf Schema Contracts

This document describes the Phase 3 persistence shapes shared by the FastAPI API,
the React frontend, and Supabase Postgres.

## Project

Top-level planning workspace.

```ts
type Project = {
  id: string;
  name: string;
  description?: string | null;
  city: string;
  metadata: Record<string, unknown>;
  createdAt?: string | null;
  updatedAt?: string | null;
};
```

## Proposal

Saved planning scenario within a project.

```ts
type Proposal = {
  id: string;
  projectId: string;
  name: string;
  description?: string | null;
  status: string;
  metadata: Record<string, unknown>;
  createdAt?: string | null;
  updatedAt?: string | null;
};
```

## ProposalInfrastructure

Durable record of a placed infrastructure unit in a proposal. The live simulator
still uses the existing `Infra` shape and `/api/infra`; this table records the
proposal placement so it can be reloaded.

First-class Supabase columns:

```ts
type ProposalInfrastructure = {
  id: string;
  proposalId: string;
  kind: "solar" | "wind" | "battery" | "microgrid" | "ev_charger" | string;
  zoneId?: string | null;
  position?: [number, number] | null;
  capacityKw?: number | null;
  metadata: Record<string, unknown>;
  createdAt?: string | null;
};
```

Current `metadata` keys:

- `costCad`: placement cost used by the simulator/UI.
- `status`: `planned`, `active`, or `damaged`.
- `modelUrl`: frontend model path for existing built-in assets.
- `placedBy`: `you` or `ai`.
- `clientId`: original frontend/simulation infra id used before Supabase assigned
  a row id.

Reserved future-friendly keys:

- `assetDefinitionId`: future link to a custom asset definition.
- `spec`: future custom asset or vendor specification.

## SimulationSnapshot

Point-in-time manual save for a proposal. Phase 3 uses an explicit Save Snapshot
action rather than automatic per-tick versioning.

```ts
type SimulationSnapshot = {
  id: string;
  proposalId: string;
  tick: number;
  metrics: Record<string, unknown>;
  scenarios: Record<string, unknown>[];
  infrastructure: Record<string, unknown>[];
  createdAt?: string | null;
};
```

The `metrics` object stores the current `SimMetrics` payload. The `scenarios`
array stores active scenarios as returned to the frontend. The `infrastructure`
array stores compact live infra state: `id`, `kind`, `position`, `capacityKw`,
`costCad`, `status`, `modelUrl`, and `zoneId` when available.

### Phase 5: restore and comparison (frontend)

- `GET /api/proposals/{proposal_id}/snapshots` lists history (newest first).
- **Restore snapshot** is a frontend-only live-sim action: it resets the in-memory
  sim, replays `infrastructure` via existing `POST /api/infra` placement, and
  refreshes sentiment/flows/voices/metrics. It does **not** modify
  `proposal_infrastructure` rows.
- **Comparison** reads stored `metrics` from a selected snapshot vs current live
  `SimMetrics` (coverage, approval, equity, emissions, grid load, cost).

## UploadedDataset (Phase 7)

Project/proposal-scoped dataset registry. Stores metadata and preview rows/features only — not full uploaded file bytes.

```ts
type UploadedDataset = {
  id: string;
  projectId?: string | null;
  proposalId?: string | null;
  name: string;
  datasetType:
    | "ev_chargers"
    | "ev_sentiment"
    | "energy_demand"
    | "weather_risk"
    | "grid_infrastructure"
    | "demographic"
    | "zoning_constraints"
    | "public_feedback"
    | "generic";
  fileType?: "csv" | "json" | "geojson" | null;
  rowCount?: number | null;
  featureCount?: number | null;
  columns: string[];
  preview: Record<string, unknown>[];
  metadata: Record<string, unknown>; // includes detectedType, geometryTypes, originalFilename
  createdAt?: string | null;
  uploadedAt?: string | null;
};
```

### Phase 7 API routes

| Method | Path | Purpose |
|--------|------|---------|
| `POST` | `/api/datasets/upload` | Multipart upload (`file`, `projectId`, `proposalId`, optional `datasetType`) |
| `GET` | `/api/projects/{project_id}/datasets` | List datasets for a project |
| `GET` | `/api/proposals/{proposal_id}/datasets` | List datasets for a proposal |
| `GET` | `/api/projects/{project_id}/datasets/context` | Lightweight summaries for planner |
| `GET` | `/api/datasets/{dataset_id}` | Fetch one dataset |
| `DELETE` | `/api/datasets/{dataset_id}` | Delete dataset metadata |

Upload limits (demo): 512 KiB per file; CSV ≤ 10k rows; GeoJSON ≤ 5k features; preview capped at 10 rows / 5 features.

### Phase 8: CohortProfile and CohortConcern

Dataset-grounded **synthetic** cohort personas and structured concerns. Not real residents; not validated public consultation.

```ts
type CohortProfile = {
  id: string;
  projectId?: string | null;
  proposalId?: string | null;
  name: string;
  cohortType:
    | "ev_owners"
    | "renters"
    | "homeowners"
    | "small_businesses"
    | "seniors"
    | "high_energy_burden_households"
    | "climate_advocates"
    | "grid_reliability_concerned"
    | "generic_residents";
  zoneId?: string | null;
  description?: string | null;
  priorities: string[];
  datasetIds: string[];
  confidence?: number | null;
  metadata: Record<string, unknown>;
  createdAt?: string | null;
};

type CohortConcern = {
  id: string;
  cohortId: string;
  projectId?: string | null;
  proposalId?: string | null;
  severity: "low" | "medium" | "high";
  stance: "support" | "oppose" | "mixed" | "neutral";
  topic: string;
  summary: string;
  evidence: string[];
  relatedDatasetIds: string[];
  relatedInfraIds: string[];
  metadata: Record<string, unknown>;
  createdAt?: string | null;
};
```

#### Phase 8 API routes

| Method | Path | Purpose |
|--------|------|---------|
| `POST` | `/api/projects/{project_id}/cohorts/generate?proposalId=` | Regenerate cohorts + concerns from uploaded datasets |
| `GET` | `/api/projects/{project_id}/cohorts` | List cohort profiles |
| `GET` | `/api/proposals/{proposal_id}/cohorts` | List cohorts for proposal scope |
| `GET` | `/api/projects/{project_id}/concerns` | List structured concerns |
| `GET` | `/api/proposals/{proposal_id}/concerns` | List concerns for proposal |
| `GET` | `/api/projects/{project_id}/concerns/context` | Planner summaries (empty when persistence off) |
| `DELETE` | `/api/concerns/{concern_id}` | Delete one concern |

Generation uses deterministic rules in `backend/app/data/concern_generator.py`. Optional real-LLM wording enrichment is not required for this MVP.

Planner context combines Phase 7 dataset summaries, Phase 8 concern summaries, and persisted proposal infrastructure via `backend/app/cohort_context.py` (`build_planner_context`).

### Phase 9 operator recommendation mode

When the user asks to improve a proposal from resident/cohort concerns (WebSocket chat or REST `POST /api/planner/run` with a matching `goal`), the planner emits a structured recommendation event:

```typescript
type OperatorRecommendation = {
  summary: string;
  key_concerns_considered: {
    id?: string;
    topic?: string;
    cohortName?: string;
    severity?: string;
    stance?: string;
    summary?: string;
    evidence?: string[];
  }[];
  recommended_actions: {
    action: string;
    kinds?: string[];
    priority?: string;
    sourceTopics?: string[];
    program?: string;
  }[];
  tradeoffs: string[];
  suggested_next_step: string;
  optional_tool_actions?: {
    name: string;
    args: Record<string, unknown>;
    rationale?: string;
  }[];
};
```

Planner stream event:

```typescript
{ type: "recommendation"; recommendation: OperatorRecommendation }
```

Deterministic mapping lives in `backend/app/concern_recommendations.py`. Optional placements use existing `place_infrastructure` tools (auto mode applies; step mode awaits approval). Recommendations may be logged to `planner_runs` when Supabase is configured — failures are non-fatal.

Honesty: cohort concerns remain synthetic/deterministic decision-support signals, not validated public consultation or engineering sign-off. Real LLM providers may improve phrasing on non-concern prompts; concern mode works without API keys.

### Phase 10: Proposal impact report / decision memo

Deterministic markdown report summarizing a proposal for stakeholder review. Generated on demand — not persisted to a dedicated table.

```ts
type ProposalReportSection = {
  id: string;
  title: string;
  markdown: string;
};

type ProposalReport = {
  projectId: string;
  proposalId: string;
  generatedAt: string;
  markdown: string;
  html?: string | null;
  sections: ProposalReportSection[];
  hasOperatorRecommendation: boolean;
};
```

| Method | Path | Purpose |
|--------|------|---------|
| `GET` | `/api/proposals/{proposal_id}/report` | JSON report payload (default) |
| `GET` | `/api/proposals/{proposal_id}/report?format=markdown` | Raw markdown text |
| `GET` | `/api/proposals/{proposal_id}/report?format=html` | Simple HTML export |

Report sections: Executive Summary, Proposal Infrastructure, Uploaded Data Sources, Simulation Metrics / Snapshot, Synthetic Resident & Cohort Concerns, Operator Recommendations, Key Tradeoffs, Resilience / Stress-Test Notes, Recommended Next Steps, Caveats.

Data sources: project/proposal metadata, `proposal_infrastructure`, latest `simulation_snapshots`, uploaded dataset summaries, synthetic cohort profiles/concerns, latest `planner_runs` concern recommendation (if any).

Implementation: `backend/app/report_generator.py`; frontend **Decision memo** panel in Saved tab (`DecisionMemoPanel.tsx`).

Honesty: the report is a **demo decision-support artifact**. It is not engineering-grade grid validation, not municipal approval evidence, and not a substitute for real public consultation. Returns **503** when Supabase persistence is disabled.

### Phase 7 honesty rules

- Uploaded data is stored, previewed, and summarized for planner/operator context.
- Uploaded data does **not** regenerate zones, agents, demand, or the full Toronto simulation.
- Uploaded data does **not** create true resident/cohort LLM agents automatically.
- Future Phase 8 agents should consume summaries via `backend/app/dataset_context.py`.

## Runtime Rules

- The backend is the only Supabase writer.
- The frontend calls FastAPI persistence routes and never receives the service
  role key.
- If Supabase is not configured, persistence-specific routes return 503 and the
  in-memory simulation continues to work.
- LLM/planner flows must propose structured actions; they do not directly mutate
  Supabase or simulation state.
