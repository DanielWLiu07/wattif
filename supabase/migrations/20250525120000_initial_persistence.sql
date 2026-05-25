-- WattIf Phase 2: initial persistence schema (MVP foundation).
-- Apply manually via Supabase SQL editor or `supabase db push` — NOT auto-applied at app startup.
--
-- RLS / auth: deferred to a future phase. Backend uses service role key only (server-side).

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ---------------------------------------------------------------------------
-- projects — top-level planning workspace (e.g. a city or study area)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS projects (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name        TEXT NOT NULL,
    description TEXT,
    city        TEXT NOT NULL DEFAULT 'Toronto',
    metadata    JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_projects_city ON projects (city);

-- ---------------------------------------------------------------------------
-- proposals — saved planning scenarios within a project
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS proposals (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id  UUID NOT NULL REFERENCES projects (id) ON DELETE CASCADE,
    name        TEXT NOT NULL,
    description TEXT,
    status      TEXT NOT NULL DEFAULT 'draft',
    metadata    JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_proposals_project_id ON proposals (project_id);

-- ---------------------------------------------------------------------------
-- proposal_infrastructure — infra placements linked to a proposal (snapshot)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS proposal_infrastructure (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    proposal_id UUID NOT NULL REFERENCES proposals (id) ON DELETE CASCADE,
    kind        TEXT NOT NULL,
    zone_id     TEXT,
    position    JSONB,
    capacity_kw DOUBLE PRECISION,
    metadata    JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_proposal_infra_proposal_id
    ON proposal_infrastructure (proposal_id);

-- ---------------------------------------------------------------------------
-- simulation_snapshots — point-in-time sim metrics for a proposal
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS simulation_snapshots (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    proposal_id UUID NOT NULL REFERENCES proposals (id) ON DELETE CASCADE,
    tick        INTEGER NOT NULL DEFAULT 0,
    metrics     JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_sim_snapshots_proposal_id
    ON simulation_snapshots (proposal_id);

-- ---------------------------------------------------------------------------
-- asset_definitions — custom infra asset specs (metadata only in Phase 2)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS asset_definitions (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id  UUID REFERENCES projects (id) ON DELETE SET NULL,
    name        TEXT NOT NULL,
    kind        TEXT NOT NULL,
    spec        JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_asset_definitions_project_id
    ON asset_definitions (project_id);

-- ---------------------------------------------------------------------------
-- uploaded_datasets — dataset registry (metadata only; no file bytes yet)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS uploaded_datasets (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id    UUID REFERENCES projects (id) ON DELETE SET NULL,
    name          TEXT NOT NULL,
    dataset_type  TEXT NOT NULL,
    metadata      JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_uploaded_datasets_project_id
    ON uploaded_datasets (project_id);

-- ---------------------------------------------------------------------------
-- agent_profiles — cohort resident agent personas (future AI layer)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS agent_profiles (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id  UUID REFERENCES projects (id) ON DELETE SET NULL,
    name        TEXT NOT NULL,
    archetype   TEXT,
    context     JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_agent_profiles_project_id
    ON agent_profiles (project_id);

-- ---------------------------------------------------------------------------
-- agent_concerns — structured concerns raised by cohort agents
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS agent_concerns (
    id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    agent_profile_id UUID REFERENCES agent_profiles (id) ON DELETE CASCADE,
    proposal_id      UUID REFERENCES proposals (id) ON DELETE SET NULL,
    concern_type     TEXT,
    summary          TEXT,
    detail           JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_agent_concerns_proposal_id
    ON agent_concerns (proposal_id);

-- ---------------------------------------------------------------------------
-- planner_runs — log of planner sessions / outputs
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS planner_runs (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    proposal_id UUID REFERENCES proposals (id) ON DELETE SET NULL,
    mode        TEXT,
    provider    TEXT,
    output      JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_planner_runs_proposal_id
    ON planner_runs (proposal_id);
