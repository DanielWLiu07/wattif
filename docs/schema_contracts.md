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
