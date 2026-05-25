# Supabase setup (Phase 2)

WattIf uses **Supabase Postgres** as the optional persistence layer. The FastAPI backend is the **only writer** (service role key). The frontend never receives the service role key.

**The app runs fully without Supabase** — simulation, map, and demo planner use in-memory state as before.

---

## Required env vars (backend only)

| Variable | Required | Description |
|----------|----------|-------------|
| `SUPABASE_URL` | When using persistence | Project URL from Supabase dashboard |
| `SUPABASE_SERVICE_ROLE_KEY` | When using persistence | **Server only** — never commit or expose to frontend |

When both are set, `/api/health` reports:

- `persistenceProvider`: `"supabase"`
- `supabaseConfigured`: `true`

When unset, `persistenceProvider` is `"memory"` and persistence REST routes return **503**.

## Frontend env (Phase 3+)

`VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` are placeholders for a future read-only client. **Not required in Phase 2.**

---

## Apply the schema

Migration file:

```
supabase/migrations/20250525120000_initial_persistence.sql
```

**Option A — Supabase SQL editor**

1. Open your Supabase project → SQL → New query.
2. Paste the migration file contents.
3. Run once.

**Option B — Supabase CLI**

```bash
supabase link --project-ref YOUR_PROJECT_REF
supabase db push
```

Migrations are **not** applied automatically when the FastAPI app starts.

---

## Verify

1. Start backend with env vars set (see `backend/.env.example`).
2. `GET http://localhost:8000/api/health` → `"persistenceProvider": "supabase"`.
3. `POST http://localhost:8000/api/projects` with body `{"name": "Toronto pilot"}` → 201.
4. `GET http://localhost:8000/api/projects` → list includes the project.

Without env vars, step 3 returns **503** with `"available": false`.

---

## Security

- **Never commit** `SUPABASE_SERVICE_ROLE_KEY` or put it in the frontend.
- RLS and auth policies are **future work** — backend uses service role for MVP foundation.
- Rotate keys if accidentally exposed.

---

## Key Takeaways

1. Supabase is **optional** for local demo.
2. Only the **backend** talks to Postgres in Phase 2.
3. **Live simulation state** is still in-memory; persisted tables are for projects/proposals metadata foundation.
