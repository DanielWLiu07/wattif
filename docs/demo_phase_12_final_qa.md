# WattIf Phase 12 — Final Demo QA

Concise checklist for the complete demo flow after Featherless real-LLM configuration and Saved-tab review polish.

## Prerequisites

- Backend: `backend/.env` with Supabase + Featherless (or `FEATHER_*` aliases)
- Frontend: `npm run dev` (Vite on port 5173)
- Optional Islington CSVs in repo root for dataset upload demo

## Featherless verification

1. Restart backend from any cwd — config loads `backend/.env` explicitly.
2. Run:
   ```bat
   cd backend
   py -c "from app.config import llm_provider, real_llm_provider; print('llmProvider', llm_provider()); print('realLlm', real_llm_provider())"
   ```
   Expect: `llmProvider feather`, `realLlm feather` when keys are set.
3. `GET http://localhost:8000/api/health` → `llmProvider: "feather"`, `realLlm: "feather"`, `llmEnabled: true`.
4. TopBar shows **Real LLM planner** (not Demo planner).
5. TopBar still shows **Template voices** — sim/resident quotes are template-based by design; Featherless powers the planner/operator only.

Env aliases accepted: `FEATHERLESS_API_KEY` / `FEATHERLESS_BASE_URL` / `FEATHERLESS_MODEL` or `FEATHER_*`. Demo LLM (`WATTIF_DEMO_LLM=1`) does **not** override when a real Feather/Anthropic key is configured.

## Demo flow (Saved tab hub)

| Step | Action | Check |
|------|--------|-------|
| 1 | Create/select project + proposal | Proposal review panel + readiness checklist appear |
| 2 | Upload Islington datasets | Checklist: *Dataset uploaded* ✓ |
| 3 | Generate synthetic cohort concerns | Checklist: *Cohort concerns generated* ✓ |
| 4 | Chat → concern-aware operator prompt | Response references datasets, concerns, geography, budget, tradeoffs |
| 5 | Place recommended infra (incl. EV charger if suggested) | Checklist: *Infrastructure placed* ✓ |
| 6 | Run sim → Save snapshot | Checklist: *Snapshot saved* ✓ |
| 7 | Snapshot comparison | Live vs saved metrics render |
| 8 | Generate decision memo | Copy markdown, download `.md` / `.html`; caveat visible |
| 9 | Refresh browser | Project/proposal selection, infra, datasets, concerns, snapshots reload; operator rec. restored from `planner_runs` |

Suggested operator prompt:

> Based on synthetic cohort concerns, what should we change in this proposal?

## What “Real LLM planner” means

- The **operator/planner** chat agent can call tools and reason via Anthropic or Featherless when configured.
- **Resident/sim voices** on the map and tick loop remain **template-based** — not autonomous LLM resident agents.
- Cohort concerns are **synthetic**, generated deterministically from uploaded dataset previews.

## Operator recommendation readiness

The checklist item *Operator recommendation generated* becomes ✓ only when:

- A planner `recommendation`/`done` event includes a non-empty summary, **or**
- A generated decision memo reports `hasOperatorRecommendation`, **or**
- Persisted `planner_runs` (mode `concern_recommendation`) exist for the proposal.

Opening Chat alone does **not** mark it complete.

## Supabase disabled

When persistence is off (`persistenceProvider: "memory"`):

- Saved tab shows disabled/unavailable states — does not crash.
- Report endpoint returns **503** with a clear reason.
- Decision memo generate button disabled with “Requires Supabase persistence”.

## Known limitations (do not overclaim)

- Not engineering validation, grid interconnection studies, or municipal approval evidence.
- Not public consultation — synthetic cohort concerns only.
- Dataset upload provides planner context; it does **not** rebuild the Toronto simulation.
- No PDF export, auth/RLS, or full RAG in this demo scope.

## Quick backend test

```bat
cd backend
py -m pytest -q
```
