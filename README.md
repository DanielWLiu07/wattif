# WattIf

WattIf is a Toronto-focused renewable siting and city-simulation demo. The backend owns the world state, simulation engine, optimizer, planner, and optional ML bridge. The frontend renders the live map experience, keeps the client state in sync, and falls back to mock data when the backend is unavailable.

## Project Structure

```text
backend/   FastAPI app, simulation engine, planner, optimizer, and data loader
frontend/  Vite + React UI, Zustand store, API client, and map components
ml/        Optional ML models and inference helpers
data/      Processed Toronto datasets used by the backend
scripts/   Data extraction and preprocessing utilities
docs/      Architecture notes and supporting documentation
```

## Quick Start

### Backend

```bash
cd backend
uv run uvicorn app.main:app --reload
```

### Frontend

```bash
cd frontend
npm install
npm run dev
```

If you prefer a single mental model: start the backend first, then run the frontend. The frontend will still load with mock data if the API is down, but the live experience comes from the FastAPI server.

## Data Flow

1. Processed city data is loaded from data/processed.
2. backend/app/data/loader.py builds the world or falls back to seeded data.
3. backend/app/state.py creates the singleton world and session state.
4. backend/app/main.py exposes REST and WebSocket endpoints.
5. frontend/src/api/client.ts fetches live data and falls back to mocks.
6. frontend/src/store.ts keeps the UI state synchronized and drives the map panels.

## Architecture Notes

See [docs/architecture.md](docs/architecture.md) for the full system overview, folder map, and runtime diagrams.

## Key Commands

Backend checks live under backend/pyproject.toml and frontend scripts live in frontend/package.json.

- Backend API: `uvicorn app.main:app --reload`
- Frontend dev server: `npm run dev`
- Frontend build: `npm run build`
- Frontend lint: `npm run lint`

## Core Modules

- [backend/app/main.py](backend/app/main.py)
- [backend/app/state.py](backend/app/state.py)
- [backend/app/sim/engine.py](backend/app/sim/engine.py)
- [backend/app/optimizer.py](backend/app/optimizer.py)
- [backend/app/planner.py](backend/app/planner.py)
- [frontend/src/App.tsx](frontend/src/App.tsx)
- [frontend/src/store.ts](frontend/src/store.ts)
- [frontend/src/api/client.ts](frontend/src/api/client.ts)
