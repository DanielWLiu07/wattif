-- Phase 8: additive columns for dataset-grounded cohort profiles and structured concerns.

ALTER TABLE agent_profiles
    ADD COLUMN IF NOT EXISTS proposal_id UUID REFERENCES proposals (id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS cohort_type TEXT,
    ADD COLUMN IF NOT EXISTS zone_id TEXT,
    ADD COLUMN IF NOT EXISTS description TEXT,
    ADD COLUMN IF NOT EXISTS priorities JSONB NOT NULL DEFAULT '[]'::jsonb,
    ADD COLUMN IF NOT EXISTS dataset_ids JSONB NOT NULL DEFAULT '[]'::jsonb,
    ADD COLUMN IF NOT EXISTS confidence REAL,
    ADD COLUMN IF NOT EXISTS metadata JSONB NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE agent_concerns
    ADD COLUMN IF NOT EXISTS project_id UUID REFERENCES projects (id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS severity TEXT,
    ADD COLUMN IF NOT EXISTS stance TEXT,
    ADD COLUMN IF NOT EXISTS topic TEXT,
    ADD COLUMN IF NOT EXISTS evidence JSONB NOT NULL DEFAULT '[]'::jsonb,
    ADD COLUMN IF NOT EXISTS related_dataset_ids JSONB NOT NULL DEFAULT '[]'::jsonb,
    ADD COLUMN IF NOT EXISTS related_infra_ids JSONB NOT NULL DEFAULT '[]'::jsonb,
    ADD COLUMN IF NOT EXISTS metadata JSONB NOT NULL DEFAULT '{}'::jsonb;

CREATE INDEX IF NOT EXISTS idx_agent_profiles_proposal_id
    ON agent_profiles (proposal_id);

CREATE INDEX IF NOT EXISTS idx_agent_concerns_project_id
    ON agent_concerns (project_id);
