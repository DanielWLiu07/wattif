"""Uploaded existing infrastructure context for planner (Phase 15)."""

from __future__ import annotations

import logging
from statistics import mean
from typing import Any

from .db.repositories import proposals as proposals_repo
from .db.repositories import uploaded_infrastructure as uploaded_infra_repo
from .db.repositories.base import PersistenceDisabledError

log = logging.getLogger("wattif.existing_infra_context")


def fetch_uploaded_infrastructure(
    *,
    project_id: str | None = None,
    proposal_id: str | None = None,
    limit: int = 500,
) -> list[dict[str, Any]]:
    if not project_id and not proposal_id:
        return []
    try:
        if not project_id and proposal_id:
            prop = proposals_repo.get_proposal(proposal_id)
            if prop:
                project_id = prop.get("project_id")
        if project_id:
            rows = uploaded_infra_repo.list_assets(project_id=project_id, limit=limit)
            if proposal_id:
                return [
                    r
                    for r in rows
                    if not r.get("proposal_id") or r.get("proposal_id") == proposal_id
                ]
            return rows
        return uploaded_infra_repo.list_assets(proposal_id=proposal_id, limit=limit)
    except PersistenceDisabledError:
        return []
    except Exception as exc:
        log.warning("fetch_uploaded_infrastructure failed: %s", exc)
        return []


def _status_bucket(status: str | None) -> str:
    s = (status or "").strip().lower()
    if s in ("active", "available", "operational", "online", "working"):
        return "active"
    if s in ("unavailable", "offline", "inactive", "broken", "out_of_service", "closed"):
        return "unavailable"
    return "other"


def summarize_uploaded_existing_infra(assets: list[dict[str, Any]]) -> str:
    """Compact one-line summary for planner context — not full row dump."""
    if not assets:
        return ""
    by_kind: dict[str, list[dict[str, Any]]] = {}
    for a in assets:
        by_kind.setdefault(a.get("asset_kind") or "unknown", []).append(a)

    lines: list[str] = [
        "Uploaded existing infrastructure (read-only context from datasets — "
        "not proposed infrastructure, not validated official city data):"
    ]
    for kind, rows in sorted(by_kind.items()):
        if kind == "ev_charger":
            total = len(rows)
            active = sum(1 for r in rows if _status_bucket(r.get("status")) == "active")
            unavailable = sum(
                1 for r in rows if _status_bucket(r.get("status")) == "unavailable"
            )
            powers = [
                float(r["power_kw"])
                for r in rows
                if r.get("power_kw") is not None
            ] + [
                float(r["capacity_kw"])
                for r in rows
                if r.get("capacity_kw") is not None and r.get("power_kw") is None
            ]
            parts = [f"Uploaded existing EV chargers: {total} total"]
            if active:
                parts.append(f"{active} active")
            if unavailable:
                parts.append(f"{unavailable} unavailable")
            if powers:
                parts.append(f"average power {mean(powers):.0f} kW")
            lines.append("- " + ", ".join(parts) + ".")
        else:
            lines.append(f"- Uploaded existing {kind.replace('_', ' ')}: {len(rows)} total.")
    lines.append(
        "These are map/context overlays from uploads; they do not regenerate simulation or count as proposal placements."
    )
    return "\n".join(lines)


def format_uploaded_assets_detailed(
    assets: list[dict[str, Any]],
    *,
    asset_kind: str | None = None,
    limit: int = 50,
) -> str:
    """Formatted list of uploaded infrastructure rows for operator answers."""
    rows = assets
    if asset_kind:
        rows = [a for a in rows if (a.get("asset_kind") or "") == asset_kind]
    if not rows:
        if asset_kind == "ev_charger":
            return "No uploaded EV charger points found for this project/proposal."
        return "No uploaded existing infrastructure points found for this project/proposal."

    kind_label = (asset_kind or rows[0].get("asset_kind") or "infrastructure").replace(
        "_", " "
    )
    lines = [
        f"I found {len(rows)} uploaded existing {kind_label} point(s) "
        "(read-only context from your upload — not proposed infrastructure):"
    ]
    for i, a in enumerate(rows[:limit], start=1):
        name = a.get("name") or f"Point {i}"
        addr = a.get("address") or "—"
        lat = a.get("latitude")
        lng = a.get("longitude")
        coord = f"{lat:.4f}, {lng:.4f}" if lat is not None and lng is not None else "—"
        ctype = a.get("charger_type") or "—"
        power = a.get("power_kw") or a.get("capacity_kw")
        power_s = f"{power:.0f} kW" if power is not None else "—"
        status = a.get("status") or "—"
        operator = a.get("operator")
        op_s = f" · {operator}" if operator else ""
        lines.append(
            f"{i}. {name} — {addr} — {coord} — {ctype} — {power_s} — {status}{op_s}"
        )
    if len(rows) > limit:
        lines.append(f"… and {len(rows) - limit} more (truncated).")
    lines.append(
        "These are uploaded inventory overlays only; they do not regenerate simulation "
        "or count as proposal placements."
    )
    return "\n".join(lines)


def format_uploaded_existing_infra_for_prompt(
    *,
    project_id: str | None = None,
    proposal_id: str | None = None,
) -> str:
    assets = fetch_uploaded_infrastructure(
        project_id=project_id, proposal_id=proposal_id
    )
    return summarize_uploaded_existing_infra(assets)
