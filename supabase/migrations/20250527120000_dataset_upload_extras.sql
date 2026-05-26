-- Phase 7: additive columns for dataset upload MVP (metadata + preview only; no file bytes).

ALTER TABLE uploaded_datasets
    ADD COLUMN IF NOT EXISTS proposal_id UUID REFERENCES proposals (id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS file_type TEXT,
    ADD COLUMN IF NOT EXISTS row_count INTEGER,
    ADD COLUMN IF NOT EXISTS feature_count INTEGER,
    ADD COLUMN IF NOT EXISTS columns JSONB NOT NULL DEFAULT '[]'::jsonb,
    ADD COLUMN IF NOT EXISTS preview JSONB NOT NULL DEFAULT '[]'::jsonb,
    ADD COLUMN IF NOT EXISTS uploaded_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_uploaded_datasets_proposal_id
    ON uploaded_datasets (proposal_id);
