# Phase 16 — Synthetic Resident Reactions

## What Phase 16 adds

Phase 16 introduces **on-demand, persisted, synthetic LLM-generated resident/cohort reactions** for a selected proposal. These are structured decision-support personas grounded in:

- Selected project/proposal metadata
- Uploaded dataset summaries
- Uploaded existing infrastructure inventory
- Proposal infrastructure placements
- Synthetic cohort concerns (Phase 8)
- Latest simulation snapshot metrics (if saved)
- Recent operator concern-aware recommendation (if generated)

Reactions are **not** real residents, **not** public consultation, and **not** validated survey feedback.

## How to generate reactions

1. Start backend and frontend with Supabase persistence configured.
2. Open the **Saved** tab and select a **project** and **proposal**.
3. (Recommended) Upload datasets and click **Generate synthetic cohort concerns**.
4. Click **Generate synthetic resident reactions** in the new panel below cohort concerns.
5. Reaction cards appear with persona label, stance, summary, key concern, suggested change, evidence, caveat, and provider/model badge.
6. Refresh the browser — reactions reload from Supabase via `GET /api/proposals/{id}/resident-reactions`.

## How reactions differ from other signals

| Signal | Source | Phase |
|--------|--------|-------|
| **Deterministic cohort concerns** | Rule-based generator from dataset previews | Phase 8 |
| **Template sim voices** | Rule-based rationales on map inspect | Pre-16 |
| **Synthetic resident reactions** | On-demand LLM (Featherless/Anthropic) or deterministic fallback | Phase 16 |
| **Operator recommendations** | Concern-aware planner turn (demo or LLM) | Phase 9 |

Concerns are **deterministic** and regenerated from datasets. Reactions are **narrative persona responses** to the full proposal context, persisted once generated until replaced.

## API endpoints

- `GET /api/projects/{project_id}/resident-reactions`
- `GET /api/proposals/{proposal_id}/resident-reactions`
- `POST /api/proposals/{proposal_id}/resident-reactions/generate`
- `DELETE /api/resident-reactions/{reaction_id}`

Regenerating for a proposal **replaces** the previous reaction batch for that proposal.

## Planner / operator context

When reactions exist, a compact summary is appended to planner dataset context (read-only):

> Synthetic resident reactions: 4 generated; 2 mixed, 1 support, 1 concern. Common requested changes: …

Ask the operator: *"What are synthetic residents reacting to in this proposal?"* — it should reference persisted reactions without placing infrastructure.

## Decision memo

The Phase 10 report includes reactions under **Synthetic Resident & Cohort Concerns** with the required caveat when reactions are on file.

## Manual QA steps

1. Start backend (`cd backend && uvicorn app.main:app --reload`) and frontend (`cd frontend && npm run dev`).
2. Select project/proposal in Saved tab.
3. Upload dataset(s).
4. Generate synthetic cohort concerns.
5. Generate synthetic resident reactions.
6. Confirm reaction cards appear with caveat and provider badge.
7. Refresh browser — reactions reload.
8. Ask operator: *"What are synthetic residents reacting to in this proposal?"*
   - **Expected:** References reaction summaries/stances; does **not** auto-place infrastructure.
9. Generate decision memo — confirm reactions section and caveat appear.
10. Disable Featherless (`WATTIF_DEMO_LLM=0`, no API keys) or simulate provider failure — confirm deterministic fallback still produces 2–4 reactions labeled `deterministic / fallback_v1`.

## Limitations

- **Synthetic reactions are not real residents.**
- **Not public consultation** or validated survey feedback.
- **No RAG** — context is compact summaries only, not vector retrieval over uploads.
- **No every-tick autonomous resident agents** — generation is on-demand only.
- **Generated on demand and persisted/cached** in `synthetic_resident_reactions`.
- **Decision-support only** — do not use as engagement or approval evidence.
- **Does not mutate proposal infrastructure** or alter Phase 15 planner dispatch/event lifecycle.
- **Regeneration replaces** prior reactions for the same proposal.

## Migration

Apply `supabase/migrations/20250530120000_synthetic_resident_reactions.sql` via Supabase SQL editor or `supabase db push`.
