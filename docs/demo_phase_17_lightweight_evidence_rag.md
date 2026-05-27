# Phase 17 — Lightweight Evidence RAG Layer

## What Phase 17 adds

Phase 17 adds a **lightweight evidence retrieval layer** over uploaded datasets. When you upload CSV, JSON, or GeoJSON files, WattIf extracts **text evidence chunks** from meaningful fields (comments, feedback, status, descriptions, GeoJSON properties, etc.) and stores them in Supabase.

The operator/planner, synthetic resident reactions, and decision memo can then **cite relevant uploaded evidence snippets** via lexical (keyword) search — no embedding keys required.

## What counts as evidence

Evidence chunks are extracted from:

- **CSV** text-heavy columns: `comment`, `feedback`, `concern`, `description`, `notes`, `status`, `operator`, `address`, etc.
- **JSON/GeoJSON** string properties on rows/features
- **Structured rows** where multiple fields combine into a compact snippet (e.g. EV charger status + operator)

Evidence is **uploaded dataset context only** — not validated public consultation, not real resident testimony, and not guaranteed complete.

## How retrieval works

1. Chunks are stored in `dataset_evidence_chunks` with metadata (dataset type, source row/field, topic tags).
2. Search uses **deterministic lexical scoring** (token overlap in chunk text, topic tags, dataset type).
3. Top-K snippets (default 5) are returned with scores.
4. Planner copilot, reaction generator, and reports include **3–5 concise snippets** — never a full dump.

No OpenAI/embedding keys are required. Optional vector search is not implemented in this phase.

## API endpoints

- `GET /api/projects/{project_id}/evidence-chunks`
- `GET /api/proposals/{proposal_id}/evidence-chunks`
- `POST /api/projects/{project_id}/evidence-search` — body: `{ "query": "...", "limit": 5 }`
- `POST /api/proposals/{proposal_id}/evidence-search`

Upload responses include `extractedEvidenceChunkCount`. Dataset delete cascades evidence chunks.

## Manual QA steps

1. Apply migration `supabase/migrations/20250531120000_dataset_evidence_chunks.sql`.
2. Start backend and frontend with Supabase configured.
3. Select project/proposal in Saved tab.
4. Upload a CSV with text feedback/comments (e.g. `comment,parking,rating` rows).
5. Confirm upload toast/preview shows **extracted evidence snippet count**.
6. Open **Uploaded evidence snippets** panel — confirm total count and recent snippets.
7. Search for `charger`, `parking`, or `heatwave` — confirm relevant snippets with scores.
8. Generate synthetic resident reactions — confirm reactions reference uploaded evidence when relevant.
9. Ask operator: *"Why are synthetic residents concerned?"* — expect concern summary + evidence snippets, **no placement**.
10. Ask: *"What is wrong with my design based on uploaded evidence?"* — expect critique with evidence, **no placement**.
11. Generate decision memo — confirm **Uploaded Evidence Signals** section with caveat.

## Limitations

- **Lightweight retrieval**, not a full RAG/vector platform
- **No PDF parsing** (upload pipeline supports CSV/JSON/GeoJSON only)
- **No city/simulation regeneration** from evidence
- **Not validated public consultation** or verified resident feedback
- **No guarantee evidence is complete** — extraction skips empty/low-value rows
- **No autonomous resident agents** beyond Phase 16 on-demand reactions
- **Evidence is read-only context** — does not mutate proposal infrastructure
- **Lexical scoring only** — no semantic embeddings in Phase 17

## Migration

Apply via Supabase SQL editor or `supabase db push`:

`supabase/migrations/20250531120000_dataset_evidence_chunks.sql`
