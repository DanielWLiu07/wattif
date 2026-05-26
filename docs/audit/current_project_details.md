# WattIf — Current Project Details (Audit)

**Audit date:** Post–Phase 3 persistence.  
**Audience:** Product, demo, and stakeholder review.

---

## What WattIf is today

WattIf is a **Toronto energy-equity planning demo** with:

- Interactive map + infrastructure placement (solar, battery, heat pump, etc.)
- Rule-based simulation with optional ML/LLM enrichment
- Scenario comparison and resident “voices” (template-based by default)
- **Optional Supabase persistence** for saved projects, proposals, infrastructure, and snapshots

It is **not** a full production planning platform, multi-tenant SaaS, or authenticated collaboration tool.

---

## User-facing capabilities (verified)

| Feature | Status | Notes |
|---------|--------|-------|
| Create/list projects | **Real** (Supabase) | Saved tab → New Project |
| Create/list proposals | **Real** (Supabase) | Per-project proposals |
| Select saved proposal | **Real** | Restores persisted infrastructure into live sim |
| Place infrastructure | **Real** | Dual-write to live sim + `proposal_infrastructure` when proposal selected |
| Remove infrastructure | **Real** | Deletes persisted row when mapped |
| Save Snapshot | **Real** | Writes metrics, scenarios, infrastructure JSON to `simulation_snapshots` |
| Snapshot history | **Real** | Lists snapshots for selected proposal in Saved tab |
| Restore snapshot to live sim | **Real** | Replays snapshot infra JSON; does not change persisted proposal rows |
| Live vs snapshot comparison | **Real** | Deltas for coverage, approval, equity, emissions, grid load, cost |
| View latest snapshot metadata | **Real** | `GET .../snapshots/latest`; defaults comparison target |
| Run simulation | **Real** (in-memory) | Not auto-persisted on each tick |
| Run optimizer | **Real** (in-memory) | Can recommend EV chargers in high-EV / low-coverage zones |
| Place EV charger | **Real** | Fifth placeable kind; persists + snapshots like other infra |
| Resident voices | **Template** | LLM optional on REST paths only |
| Dataset upload | **Missing** | Table exists; no upload UI/API |
| Report export | **Missing** | |
| User login / RBAC | **Missing** | Service role backend only |
| LLM resident agents | **Missing** | Rule/template voices only |

---

## Persistence modes (UI)

TopBar and Saved tab reflect backend health:

| Mode | Meaning |
|------|---------|
| **In-memory** | No Supabase env; persistence routes return 503 |
| **Supabase (no proposal)** | DB connected; user has not selected a proposal |
| **Supabase (proposal)** | Proposal selected; infra placement persists |

Selection survives refresh via `localStorage` + reload on mount.

---

## What “saved” means now

**Before Phase 3 (stale claim):** “Nothing is saved; refresh loses everything.”

**Now:**

- **Saved:** Project name, proposal name, placed infrastructure rows, manually saved snapshot records.
- **Not saved automatically:** Live tick state, agent positions, transient metrics between snapshots, session-only infra when no proposal is selected.

Refreshing the page with a selected proposal **reloads infrastructure** from the database.

---

## Demo vs production honesty

| Area | Demo / partial | Production-ready |
|------|----------------|------------------|
| Map + placement | ✓ | |
| Sim engine | ✓ (in-memory) | |
| Supabase projects/proposals/infra/snapshots | ✓ (when configured) | No auth/RLS |
| Voices | Template (+ optional LLM) | No true agent loop |
| Data pipeline | Synthetic/mock | No real utility uploads |
| Export / reports | | ✗ |

---

## Environment requirements

**Backend** (`backend/.env`):

- Optional LLM keys (Claude, Feather)
- Optional `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` for persistence

**Frontend** (`frontend/.env`):

- `VITE_API_URL` (default `http://localhost:8000`)

**Database:**

- Run migrations under `supabase/migrations/` manually in Supabase project.

---

## Key Takeaways

1. **Saved proposals and infrastructure are real** when Supabase is configured and migrations applied.
2. **Snapshots are manually triggered**, not continuous sim checkpoints.
3. **Persistence ≠ full platform** — no auth, upload, export, or autonomous LLM agents.
4. **Live simulation** still runs in backend memory; only proposal-scoped artifacts persist.
