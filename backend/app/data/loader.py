"""Load world data: prefer data/processed/{zones,agents}.json, else seed synthetically."""

from __future__ import annotations

import json
import logging

from .. import config
from ..models import Agent, Zone
from .seed import build_world

log = logging.getLogger("wattif.data")


def _load_json(name: str) -> list | None:
    path = config.DATA_PROCESSED_DIR / name
    if not path.exists():
        return None
    try:
        with path.open() as f:
            data = json.load(f)
        if isinstance(data, list) and data:
            return data
        log.warning("%s is empty or not a list; ignoring", path)
    except (json.JSONDecodeError, OSError) as exc:
        log.warning("failed to read %s: %s; falling back to seed", path, exc)
    return None


def load_attitudes() -> dict[str, dict] | None:
    """Load attitudes.json -> {zoneId: priors}. Defensive; returns None if absent/invalid.

    priors carry proRenewablePrior / solarPropensity / evPropensity / retrofitPropensity (0..1).
    """
    # attitudes.json is a dict ({source, ..., zonePriors:[...]}), so read it directly.
    path = config.DATA_PROCESSED_DIR / "attitudes.json"
    if not path.exists():
        return None
    try:
        with path.open() as f:
            doc = json.load(f)
        priors = doc.get("zonePriors") if isinstance(doc, dict) else None
        if not priors:
            return None
        out = {p["zoneId"]: p for p in priors if "zoneId" in p}
        log.info("loaded attitudes.json: %d zone priors", len(out))
        return out or None
    except (json.JSONDecodeError, OSError, KeyError, TypeError) as exc:
        log.warning("failed to read attitudes.json: %s; using model priors", exc)
        return None


def _load_dict_doc(name: str, list_key: str) -> list | None:
    """Load a dict-shaped processed doc and return doc[list_key] (defensive)."""
    path = config.DATA_PROCESSED_DIR / name
    if not path.exists():
        return None
    try:
        with path.open() as f:
            doc = json.load(f)
        items = (
            doc.get(list_key)
            if isinstance(doc, dict)
            else (doc if isinstance(doc, list) else None)
        )
        return items or None
    except (json.JSONDecodeError, OSError, TypeError) as exc:
        log.warning("failed to read %s: %s", name, exc)
        return None


def load_facilities() -> list[dict] | None:
    """Real relief/gathering facilities [{id,name,category,position,zoneId,...}], or None."""
    items = _load_dict_doc("facilities.json", "facilities")
    if items:
        log.info("loaded facilities.json: %d facilities", len(items))
    return items


def load_constraints() -> dict[str, dict] | None:
    """Per-zone siting constraints -> {zoneId: {sitingPenalty, noBuild, ...}}, or None."""
    zones = _load_dict_doc("constraints.json", "zones")
    if not zones:
        return None
    out = {z["zoneId"]: z for z in zones if "zoneId" in z}
    if out:
        log.info(
            "loaded constraints.json: %d zones (%d no-build)",
            len(out),
            sum(1 for z in out.values() if z.get("noBuild")),
        )
    return out or None


def load_existing_infra() -> list[dict] | None:
    """Real existing installations [{id,kind,name,position,zoneId,...}], or None."""
    items = _load_dict_doc("existing_infra.json", "infra")
    if items:
        log.info("loaded existing_infra.json: %d installations", len(items))
    return items


def load_environment() -> dict[str, dict] | None:
    """Per-zone environment indicators -> {zoneId: {greenScore, pollutionBurden, ...}}, or None."""
    zones = _load_dict_doc("environment.json", "zones")
    if not zones:
        return None
    out = {z["zoneId"]: z for z in zones if "zoneId" in z}
    if out:
        log.info("loaded environment.json: %d zones", len(out))
    return out or None


def load_generation_mix() -> dict | None:
    """IESO generation mix doc (avg grid intensity + fuel mix) for context/display, or None."""
    path = config.DATA_PROCESSED_DIR / "generation_mix.json"
    if not path.exists():
        return None
    try:
        with path.open() as f:
            doc = json.load(f)
        return doc if isinstance(doc, dict) else None
    except (json.JSONDecodeError, OSError) as exc:
        log.warning("failed to read generation_mix.json: %s", exc)
        return None


def load_world() -> tuple[list[Zone], list[Agent], str]:
    """Returns (zones, agents, source) where source is 'processed' or 'seed'.

    Falls back to seeded data when processed fixtures are absent or unusable.
    """
    zones_raw = _load_json("zones.json")
    agents_raw = _load_json("agents.json")

    if zones_raw is not None:
        try:
            zones = [Zone.model_validate(z) for z in zones_raw]
            if agents_raw is not None:
                agents = [Agent.model_validate(a) for a in agents_raw]
            else:
                # zones from data/, but synthesize agents to match
                _, agents = build_world()
                agents = [a for a in agents]
            log.info(
                "loaded %d zones from data/processed (source=processed)", len(zones)
            )
            return zones, agents, "processed"
        except Exception as exc:  # noqa: BLE001 — any validation issue -> safe fallback
            log.warning("processed fixtures failed validation (%s); using seed", exc)

    zones, agents = build_world()
    log.info("generated %d zones, %d agents (source=seed)", len(zones), len(agents))
    return zones, agents, "seed"
