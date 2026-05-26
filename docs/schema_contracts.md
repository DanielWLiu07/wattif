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

## Runtime Rules

- The backend is the only Supabase writer.
- The frontend calls FastAPI persistence routes and never receives the service
  role key.
- If Supabase is not configured, persistence-specific routes return 503 and the
  in-memory simulation continues to work.
- LLM/planner flows must propose structured actions; they do not directly mutate
  Supabase or simulation state.
