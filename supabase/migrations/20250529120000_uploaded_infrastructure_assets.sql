-- Phase 15: uploaded existing infrastructure assets (read-only context from datasets).

CREATE TABLE IF NOT EXISTS uploaded_infrastructure_assets (
    id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id       UUID REFERENCES projects (id) ON DELETE CASCADE,
    proposal_id      UUID REFERENCES proposals (id) ON DELETE SET NULL,
    dataset_id       UUID REFERENCES uploaded_datasets (id) ON DELETE CASCADE,
    asset_kind       TEXT NOT NULL,
    source_type      TEXT NOT NULL DEFAULT 'upload',
    name             TEXT,
    address          TEXT,
    latitude         DOUBLE PRECISION NOT NULL,
    longitude        DOUBLE PRECISION NOT NULL,
    zone_id          TEXT,
    status           TEXT,
    operator         TEXT,
    capacity_kw      DOUBLE PRECISION,
    power_kw         DOUBLE PRECISION,
    charger_type     TEXT,
    metadata         JSONB NOT NULL DEFAULT '{}'::jsonb,
    source_row_index INTEGER,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_uploaded_infra_assets_project_id
    ON uploaded_infrastructure_assets (project_id);

CREATE INDEX IF NOT EXISTS idx_uploaded_infra_assets_proposal_id
    ON uploaded_infrastructure_assets (proposal_id);

CREATE INDEX IF NOT EXISTS idx_uploaded_infra_assets_dataset_id
    ON uploaded_infrastructure_assets (dataset_id);
