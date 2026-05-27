-- Phase 17: lightweight evidence chunks from uploaded datasets (MVP RAG layer).

CREATE TABLE IF NOT EXISTS dataset_evidence_chunks (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id      UUID NOT NULL REFERENCES projects (id) ON DELETE CASCADE,
    proposal_id     UUID REFERENCES proposals (id) ON DELETE SET NULL,
    dataset_id      UUID NOT NULL REFERENCES uploaded_datasets (id) ON DELETE CASCADE,
    source_type     TEXT NOT NULL DEFAULT 'uploaded_dataset',
    chunk_text      TEXT NOT NULL,
    chunk_summary   TEXT,
    dataset_type    TEXT,
    source_row_index INTEGER,
    source_field    TEXT,
    topic_tags      TEXT[] NOT NULL DEFAULT '{}',
    metadata        JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_dataset_evidence_chunks_project_id
    ON dataset_evidence_chunks (project_id);

CREATE INDEX IF NOT EXISTS idx_dataset_evidence_chunks_proposal_id
    ON dataset_evidence_chunks (proposal_id);

CREATE INDEX IF NOT EXISTS idx_dataset_evidence_chunks_dataset_id
    ON dataset_evidence_chunks (dataset_id);

CREATE INDEX IF NOT EXISTS idx_dataset_evidence_chunks_dataset_type
    ON dataset_evidence_chunks (dataset_type);

CREATE INDEX IF NOT EXISTS idx_dataset_evidence_chunks_created_at
    ON dataset_evidence_chunks (created_at DESC);

CREATE INDEX IF NOT EXISTS idx_dataset_evidence_chunks_topic_tags
    ON dataset_evidence_chunks USING GIN (topic_tags);
