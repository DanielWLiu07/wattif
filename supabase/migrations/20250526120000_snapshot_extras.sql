-- WattIf Phase 3: add explicit snapshot payload columns.
-- Apply manually via Supabase SQL editor or `supabase db push`.

ALTER TABLE simulation_snapshots
    ADD COLUMN IF NOT EXISTS scenarios JSONB NOT NULL DEFAULT '[]'::jsonb,
    ADD COLUMN IF NOT EXISTS infrastructure JSONB NOT NULL DEFAULT '[]'::jsonb;
