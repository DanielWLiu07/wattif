-- Phase 16: persisted synthetic LLM-generated resident/cohort reactions (decision-support only).

CREATE TABLE IF NOT EXISTS synthetic_resident_reactions (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id      UUID NOT NULL REFERENCES projects (id) ON DELETE CASCADE,
    proposal_id     UUID REFERENCES proposals (id) ON DELETE SET NULL,
    cohort_id       UUID REFERENCES agent_profiles (id) ON DELETE SET NULL,
    concern_id      UUID REFERENCES agent_concerns (id) ON DELETE SET NULL,
    reaction_type   TEXT NOT NULL DEFAULT 'llm_synthetic_reaction',
    persona_label   TEXT,
    stance          TEXT NOT NULL,
    summary         TEXT NOT NULL,
    key_concern     TEXT,
    suggested_change TEXT,
    evidence        TEXT,
    confidence      DOUBLE PRECISION,
    caveat          TEXT NOT NULL,
    source_context  JSONB NOT NULL DEFAULT '{}'::jsonb,
    provider        TEXT,
    model           TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_synthetic_resident_reactions_project_id
    ON synthetic_resident_reactions (project_id);

CREATE INDEX IF NOT EXISTS idx_synthetic_resident_reactions_proposal_id
    ON synthetic_resident_reactions (proposal_id);

CREATE INDEX IF NOT EXISTS idx_synthetic_resident_reactions_created_at
    ON synthetic_resident_reactions (created_at DESC);
