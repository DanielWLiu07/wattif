# WattIf — Project Details (Current Implementation)

> **Trust order:** Running code → [status_contract.md](./status_contract.md) → [audit docs](./audit/) (if present) → [OVERVIEW.md](./OVERVIEW.md) / [ARCHITECTURE.md](./ARCHITECTURE.md) → vision sections in [project_plan.md](./project_plan.md).

This document describes **what WattIf is today**, separate from the [target vision](./project_plan.md#target-vision).

---

## Current Implementation

### What it is

WattIf is a **Toronto-specific** interactive map and simulation demo for exploring renewable-energy siting with an **energy-equity** lens. Stack: **React/Vite frontend** + **FastAPI backend** + static **`data/processed/`** JSON fixtures.

### Who it serves today

- Hackathon / demo audiences
- Storytelling about equity-weighted siting trade-offs
- Developers extending the sim or map

It is **not** yet a general-purpose city-designer sandbox with uploaded datasets or persistent proposals.

### Core capabilities (Implemented)

| Area | Detail |
|------|--------|
| **Map** | 44 Toronto zones; MapLibre/Mapbox + deck.gl; 3D infra GLB models |
| **Placeable infra** | Solar, wind, battery, microgrid |
| **Simulation** | Monthly ticks; coverage, equity, approval, emissions, grid load, cost |
| **Optimizer** | Greedy equity-weighted siting recommendations |
| **Scenarios** | Blackout, heatwave, ice storm, gas spike, flood, and others |
| **Overlays** | Equity, demand, sentiment, flood, constraints, existing renewables, EV chargers (read-only) |
| **AI chat UI** | WebSocket planner with auto/step modes |
| **Offline mode** | Full frontend mock when backend is down |

### Fallback / mocked behavior (disclose honestly)

| Area | Reality |
|------|---------|
| **Planner (default)** | **Scripted demo** — keyword intent, no network (`WATTIF_DEMO_LLM=1`) |
| **Planner (with keys)** | Real LLM when `ANTHROPIC_API_KEY` or Feather gateway configured |
| **Resident voices** | **Template library** — not autonomous LLM agents |
| **Voice LLM enrich** | Only when real LLM provider active; sim tick always templates |
| **Agents** | ~4,001 simulation records; ~320 animated map dots |
| **ML** | Training pipeline exists; heuristics run if models not on disk |
| **Session** | **In-memory only** — lost on server restart |
| **EV chargers** | **Read-only** map points — not placeable or simulated |

### What is Missing / Planned

See [status_contract.md](./status_contract.md) and [project_plan.md](./project_plan.md). Highlights:

- Supabase persistence (Phase 2)
- Dataset upload API (Phase 2+)
- Custom asset upload (Phase 2+)
- EV charger placement (roadmap)
- Cohort resident AI agents (roadmap)
- Report export (roadmap)
- Multi-city support (roadmap)

---

## Repository layout

| Path | Role |
|------|------|
| `frontend/` | React SPA, Zustand store, map UI |
| `backend/` | FastAPI sim, optimizer, planner |
| `data/processed/` | Toronto JSON fixtures |
| `scripts/` | Offline data build pipeline |
| `ml/` | Optional sklearn models |
| `docs/` | Product and architecture documentation |

---

## Related documentation

| Doc | Purpose |
|-----|---------|
| [OVERVIEW.md](./OVERVIEW.md) | User-facing product overview |
| [ARCHITECTURE.md](./ARCHITECTURE.md) | Technical architecture |
| [status_contract.md](./status_contract.md) | Implemented / Mocked / Planned labels |
| [project_plan.md](./project_plan.md) | Phased roadmap |
| [audit/complete_system_architecture.md](./audit/complete_system_architecture.md) | Deep architecture audit *(if present)* |
| [audit/current_project_details.md](./audit/current_project_details.md) | Product audit *(if present)* |
| [supabase_setup.md](./supabase_setup.md) | Supabase env vars and migration apply steps |

---

## Key Takeaways

1. WattIf today is a **strong Toronto demo**, not a upload-your-city sandbox.
2. **Demo planner and template voices are the default** — not full LLM agents.
3. Use [status_contract.md](./status_contract.md) for consistent status language in docs and UI.
