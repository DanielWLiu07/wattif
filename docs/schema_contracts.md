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
  kind: "solar" | "wind" | "battery" | "microgrid" | string;
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

## UploadedDataset

Phase 7 adds a metadata/preview registry for designer-uploaded CSV, JSON, and
GeoJSON datasets. The original file bytes are not retained in this MVP.

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
    | "generic"
    | string;
  fileType?: "csv" | "json" | "geojson" | string | null;
  rowCount?: number | null;
  featureCount?: number | null;
  columns: string[];
  preview: Record<string, unknown>[];
  metadata: Record<string, unknown>;
  uploadedAt?: string | null;
  createdAt?: string | null;
  updatedAt?: string | null;
};
```

Current `metadata` keys include `summary`, `detectedDatasetType`,
`classificationSignals`, `originalFilename`, `contentType`, `sizeBytes`, and
for GeoJSON, `geometryTypes`/`bbox` when present.

### Dataset Endpoints

- `POST /api/datasets/upload?projectId=&proposalId=&filename=&datasetType=`
  accepts raw file bytes with `Content-Type` set to CSV, JSON, or GeoJSON. At
  least one of `projectId` or `proposalId` is required. `datasetType` is
  optional; omitted or `auto` uses deterministic filename/column/content
  heuristics.
- `GET /api/projects/{projectId}/datasets` lists project-scoped uploads.
- `GET /api/proposals/{proposalId}/datasets` lists proposal-scoped uploads.
- `GET /api/datasets/{datasetId}` fetches one dataset metadata/preview record.
- `DELETE /api/datasets/{datasetId}` removes a dataset registry record.

Validation errors return `400` with a readable message. Supabase-disabled mode
returns `503` with the shared persistence unavailable payload.

## Runtime Rules

- The backend is the only Supabase writer.
- The frontend calls FastAPI persistence routes and never receives the service
  role key.
- If Supabase is not configured, persistence-specific routes return 503 and the
  in-memory simulation continues to work.
- LLM/planner flows can read uploaded dataset summaries for the selected
  project/proposal as context, but uploaded datasets do not regenerate the city
  simulation yet.
- LLM/planner flows must propose structured actions; they do not directly mutate
  Supabase or simulation state.
