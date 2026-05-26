# WattIf — Vision Gap Analysis (Audit)

**Audit date:** Post–Phase 3 persistence.  
**Purpose:** Truth table — vision vs **current code**, not roadmap promises.

---

## Summary

Phase 3 delivered **partial Supabase persistence**: projects, proposals, proposal-scoped infrastructure, and manual simulation snapshots. The **live sim singleton** and most “platform” features remain in-memory or unimplemented.

**Correct framing:** Persistence is **partially implemented** through Supabase. It is **not** the same as a full production planning platform.

---

## Truth table

| Capability | Vision / pitch | Current reality | Gap severity |
|------------|----------------|-----------------|--------------|
| **Database / persistence** | Cloud-saved plans | Supabase Postgres when env + migrations set; else memory-only API 503 | **Partial** — was “none”, now partial |
| **Saved projects & proposals** | Multi-scenario planning | CRUD via REST + Saved tab | **Low** for MVP save/load |
| **Infrastructure persistence** | Assets survive sessions | `proposal_infrastructure` + reload on select | **Low** for scoped save |
| **Simulation snapshots** | Version history | Manual save; list/history; restore to live sim; latest GET; JSON includes metrics/scenarios/infra | **Low** for MVP versioning; no auto-save |
| **Live sim state** | Full state in DB | In-memory `World` only | **High** |
| **Multi-user auth / RBAC** | Teams, permissions | None; service role backend | **High** |
| **Row-level security** | Tenant isolation | Not enabled | **High** |
| **Dataset upload** | Real utility data | Table stub; no upload flow | **High** |
| **Report export** | PDF/CSV deliverables | Not implemented | **High** |
| **LLM resident agents** | Autonomous stakeholders | Template voices; optional LLM on some REST | **High** |
| **EV charger placement** | Full asset catalog | Placeable + lightweight sim/sentiment/optimizer; not full network planning | **Low** for demo sandbox |
| **Real-time collab** | Multi-user edit | Not implemented | **High** |
| **Planner / siting ML** | Production ML | Heuristic + optional models | **Medium** |

---

## Stale claims corrected (pre–Phase 3 audit)

These statements were **wrong** and are removed from current audit docs:

| Stale claim | Current truth |
|-------------|---------------|
| “No database” | Supabase optional; 9+ tables with migrations |
| “No persistence” | Projects, proposals, infra, snapshots persist when configured |
| “No saved proposals” | Saved tab create/select works |
| “Refresh loses all work” | Selected proposal reloads infrastructure from DB |
| “Frontend talks to Supabase directly” | Frontend uses FastAPI only |
| “Persistence routes always work” | 503 when Supabase unset; 502 on DB errors |

---

## What persistence is real (Phase 3)

Verified flows (code + manual QA):

1. **Migrations:** Base tables + `simulation_snapshots.scenarios` / `.infrastructure` JSONB
2. **API:** `GET/POST /api/projects`, `GET/POST /api/proposals`
3. **Infrastructure:** `GET/POST/DELETE /api/proposals/{id}/infrastructure`
4. **Snapshots:** `POST /api/proposals/{id}/snapshots`, `GET .../snapshots/latest`
5. **Frontend:** Saved tab, `selectProposal` reload, `addInfraAt` dual-write, `saveSnapshot`, `removeInfra` delete
6. **Health:** `persistenceProvider` / `supabaseConfigured` on `/api/health`
7. **Tests:** `backend/tests/test_persistence.py` (503 when disabled)

---

## What is still missing

### Platform / ops

- User authentication, orgs, RBAC
- RLS and multi-tenant isolation
- Automated migration deploy in CI
- Audit logs, backups strategy (beyond Supabase defaults)

### Product features

- Dataset upload and ingestion pipeline
- Report / export generation
- Full EV network planning / utility-grade siting (Phase 6 adds placeable demo chargers only)
- Snapshot **restore to live sim** (infra JSON replay; does not sync `proposal_infrastructure`)
- Auto snapshot on sim milestones
- Full sim state persistence (agents, ticks, flows history)

### AI / agents

- True LLM resident agents with memory and tool use
- Planner runs persisted and replayed (`planner_runs` table is skeleton)

### Frontend gaps

- No Supabase client (by design — backend writer only)
- Mock fallback when API down hides persistence entirely
- Latest snapshot display ≠ sim state restore

---

## Risk register (updated)

| Risk | Mitigation today | Residual |
|------|------------------|----------|
| Data loss on refresh | Proposal infra reload | Session infra without proposal still lost |
| Unauthorized DB access | Service role on backend only | No RLS; key leak = full DB |
| Stale docs | This audit + schema_contracts | Keep audit in sync with phases |
| Demo overstated as prod | TopBar badges, status_contract | Stakeholders may still assume “cloud app = SaaS” |

---

## Recommended next phases (informational)

Not commitments — gap closure order often cited in project plan:

1. Auth + RLS
2. Sync snapshot restore ↔ proposal_infrastructure (optional explicit “persist restore”)
3. Dataset upload
4. Report export
5. LLM agent loop (if still in vision)

---

## Key Takeaways

1. **Persistence moved from “none” to “partial Supabase”** — update all external messaging accordingly.
2. **Saved proposal infrastructure and manual snapshots are production-quality for a hackathon MVP**, not for enterprise planning.
3. **Largest remaining gaps:** auth, full sim persistence, dataset pipeline, export, real LLM agents.
4. **Do not conflate** “we have a database” with “we have a multi-user planning platform.”
