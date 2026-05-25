"""Optional bridge to the repo-root `ml/` package (demand forecast + equity clustering).

The `ml/` module is OPTIONAL. This bridge imports it defensively (adding the repo root
to sys.path) and exposes thin wrappers that return None / fall back when ml is absent or
errors. Nothing here runs on the hot sim-tick path — it backs on-demand endpoints only.
"""

from __future__ import annotations

import logging
import sys
from typing import Any

from . import config

log = logging.getLogger("wattif.ml")

_ml = None
_tried = False


def _ml_module():
    global _ml, _tried
    if _tried:
        return _ml
    _tried = True
    try:
        root = str(config.REPO_ROOT)
        if root not in sys.path:
            sys.path.insert(0, root)
        import ml.inference as inference  # noqa: PLC0415

        _ml = inference
        log.info("ml/ module loaded (models=%s)", inference.models_available())
    except Exception as exc:  # noqa: BLE001 — ml is optional; never break boot
        log.info("ml/ module not available (%s); using built-in rule-based logic", exc)
        _ml = None
    return _ml


def ml_available() -> bool:
    return _ml_module() is not None


def models_available() -> dict[str, bool]:
    mod = _ml_module()
    if mod is None:
        return {}
    try:
        return mod.models_available()
    except Exception:  # noqa: BLE001
        return {}


def forecast_demand(
    entity: Any, month: int = 1, context: dict | None = None
) -> float | None:
    """ml-backed demand forecast (kWh) for a Zone/Agent, or None if ml unavailable."""
    mod = _ml_module()
    if mod is None:
        return None
    try:
        return float(mod.predict_demand(entity, month=month, context=context))
    except Exception as exc:  # noqa: BLE001
        log.warning("ml.predict_demand failed (%s)", exc)
        return None


def scenario_adoption(
    agent: Any, context: dict | None = None
) -> dict[str, float] | None:
    """ml per-technology adoption propensity under a scenario, or None if ml unavailable.

    Returns {solar, battery, microgrid, wind, ev} each 0..1. context: {scenario, intensity, ...}.
    """
    mod = _ml_module()
    if mod is None:
        return None
    try:
        return mod.scenario_adoption(agent, context)
    except Exception as exc:  # noqa: BLE001
        log.warning("ml.scenario_adoption failed (%s)", exc)
        return None


def zone_clusters(zones) -> dict[str, dict] | None:
    """{zone_id: {cluster, label}} via ml.zone_cluster, or None if ml unavailable."""
    mod = _ml_module()
    if mod is None:
        return None
    out: dict[str, dict] = {}
    try:
        for z in zones:
            out[z.id] = mod.zone_cluster(z)
        return out
    except Exception as exc:  # noqa: BLE001
        log.warning("ml.zone_cluster failed (%s)", exc)
        return None


def siting_priority(zone: Any, context: dict | None = None) -> dict | None:
    """ml-backed build-priority for a zone (fuses unmet demand + energy burden), or None.

    Returns {score, unmet_demand_kwh, unmet_ratio, energy_burden, equity_weight,
    demand_signal, rationale}. context: {renewable_supply_kwh|coverage_pct, equity_weight, month}.
    """
    mod = _ml_module()
    if mod is None:
        return None
    try:
        return mod.siting_priority(zone, context)
    except Exception as exc:  # noqa: BLE001
        log.warning("ml.siting_priority failed (%s)", exc)
        return None
