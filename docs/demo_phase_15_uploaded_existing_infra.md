# WattIf Phase 15 — Uploaded Existing Infrastructure

Phase 15 turns coordinate-bearing infrastructure uploads (especially EV charger CSV/JSON/GeoJSON) into **read-only uploaded existing infrastructure** assets: stored in Supabase, listed in the Saved tab, rendered on the map as a distinct overlay, and summarized compactly for the planner/operator.

## What Phase 15 adds

- **Backend extraction** on dataset upload for `ev_chargers` and `grid_infrastructure` types
- **Table** `uploaded_infrastructure_assets` (linked to project, optional proposal, and source dataset)
- **Read APIs**
  - `GET /api/projects/{project_id}/existing-infrastructure`
  - `GET /api/proposals/{proposal_id}/existing-infrastructure`
- **Planner context** — compact summary only (e.g. “Uploaded existing EV chargers: 12 total, 10 active, 2 unavailable, average power 75 kW.”)
- **Frontend Saved tab** — “Uploaded existing infrastructure” panel with counts and caveat
- **Map overlay** — amber ring markers, visually distinct from proposed 3D EV chargers and from Toronto fixture existing-infra layer

## Expected EV charger CSV shape

Minimum columns (header names are flexible):

| Column | Aliases accepted |
|--------|------------------|
| Latitude | `latitude`, `lat`, `y` |
| Longitude | `longitude`, `lng`, `lon`, `long`, `x` |

Optional columns (best-effort mapping):

| Field | Aliases |
|-------|---------|
| Name | `name`, `site_name`, `location_name`, `charger_name` |
| Address | `address`, `street`, `location` |
| Status | `status`, `operational_status`, `availability` |
| Operator | `operator`, `network`, `provider` |
| Charger type | `charger_type`, `type`, `connector_type` |
| Power (kW) | `power_kw`, `power`, `max_power_kw`, `capacity_kw` |
| Capacity (kW) | `capacity_kw`, `capacity` |

Example:

```csv
name,latitude,longitude,status,power_kw,operator
King St Hub,43.6487,-79.3854,active,75,ChargeNet
Bloor Station,43.6615,-79.3870,unavailable,50,CityGrid
```

GeoJSON Point features are also supported (coordinates extracted from geometry).

Rows with missing or invalid coordinates are **skipped** without failing the upload.

## Manual QA steps

1. Start backend and frontend with Supabase persistence configured.
2. Create or select a **project** and **proposal** (Saved tab).
3. Upload an EV charger CSV with valid `latitude` / `longitude` columns.
4. Confirm upload toast shows extracted point count (if any).
5. Confirm **Saved → Uploaded existing infrastructure** shows extracted / EV charger / active-unavailable counts.
6. Confirm **amber ring markers** appear on the map at uploaded coordinates.
7. Place a **proposed EV charger** (Build tab) and confirm it uses the 3D model — visually different from uploaded markers.
8. Refresh the browser; confirm uploaded assets reload for the selected project/proposal.
9. Open **Chat** and ask: *“Given the uploaded existing EV chargers, where should we add more capacity?”*
10. Confirm the planner references the uploaded existing charger summary in its answer.

## Limitations

- **Uploaded existing infrastructure is context/map overlay only.** It does not drive simulation metrics directly.
- **It does not regenerate Toronto zones, agents, or simulation.**
- **It does not mutate `proposal_infrastructure`.**
- **It does not count as proposed infrastructure.**
- **It does not implement RAG.**
- **It does not implement agentic resident agents.**
- **It is not validated official city infrastructure** unless the uploaded source file is itself an official inventory.

Deleting a source dataset removes derived `uploaded_infrastructure_assets` rows for that dataset.
