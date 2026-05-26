"""Extract read-only uploaded existing infrastructure from dataset rows."""

from __future__ import annotations

import math
import re
from typing import Any

INFRASTRUCTURE_DATASET_TYPES: dict[str, str] = {
    "ev_chargers": "ev_charger",
    "grid_infrastructure": "grid_infrastructure",
}

_LAT_KEYS = ("latitude", "lat", "y")
_LNG_KEYS = ("longitude", "lng", "lon", "long", "x")

_FIELD_ALIASES: dict[str, tuple[str, ...]] = {
    "name": ("name", "station_name", "charger_name", "site_name", "title", "station_id"),
    "address": ("address", "location", "street", "site_address", "area"),
    "status": ("status", "availability", "operational_status", "state"),
    "operator": ("operator", "network", "provider", "owner", "vendor"),
    "charger_type": ("charger_type", "plug_type", "connector_type", "plug", "connector"),
    "power_kw": ("power_kw", "power", "kw", "max_power_kw", "max_kw", "rated_kw"),
    "capacity_kw": ("capacity_kw", "capacity"),
    "zone_id": ("zone_id", "zone", "neighbourhood", "neighborhood", "ward"),
}


def _norm_key(key: str) -> str:
    return re.sub(r"[^a-z0-9]+", "_", (key or "").strip().lower()).strip("_")


def _build_col_map(row: dict[str, Any]) -> dict[str, str]:
    """Map normalized column name -> original key in row."""
    out: dict[str, str] = {}
    for k in row:
        if k.startswith("_"):
            continue
        nk = _norm_key(str(k))
        if nk and nk not in out:
            out[nk] = k
    return out


def _pick(row: dict[str, Any], col_map: dict[str, str], aliases: tuple[str, ...]) -> Any:
    for alias in aliases:
        orig = col_map.get(alias)
        if orig is None:
            continue
        val = row.get(orig)
        if val is not None and str(val).strip() != "":
            return val
    return None


def _to_float(val: Any) -> float | None:
    if val is None:
        return None
    if isinstance(val, (int, float)) and math.isfinite(val):
        return float(val)
    try:
        s = str(val).strip().replace(",", "")
        if not s:
            return None
        f = float(s)
        return f if math.isfinite(f) else None
    except (TypeError, ValueError):
        return None


def _valid_coords(lat: float | None, lng: float | None) -> bool:
    if lat is None or lng is None:
        return False
    if not (-90.0 <= lat <= 90.0 and -180.0 <= lng <= 180.0):
        return False
    return True


def _coords_from_row(row: dict[str, Any], col_map: dict[str, str]) -> tuple[float | None, float | None]:
    if "_lat" in row and "_lng" in row:
        return _to_float(row["_lat"]), _to_float(row["_lng"])
    lat = _to_float(_pick(row, col_map, _LAT_KEYS))
    lng = _to_float(_pick(row, col_map, _LNG_KEYS))
    return lat, lng


def asset_kind_for_dataset_type(dataset_type: str) -> str | None:
    return INFRASTRUCTURE_DATASET_TYPES.get(dataset_type)


def extract_infrastructure_assets(
    *,
    rows: list[dict[str, Any]],
    dataset_type: str,
) -> tuple[list[dict[str, Any]], dict[str, Any]]:
    """Return (asset dicts ready for DB insert, extraction summary)."""
    asset_kind = asset_kind_for_dataset_type(dataset_type)
    summary: dict[str, Any] = {
        "extracted_existing_infrastructure_count": 0,
        "invalid_existing_infrastructure_rows": 0,
        "detected_existing_infrastructure_kind": asset_kind,
    }
    if not asset_kind or not rows:
        return [], summary

    used_keys = {
        *_LAT_KEYS,
        *_LNG_KEYS,
        *(a for aliases in _FIELD_ALIASES.values() for a in aliases),
    }
    assets: list[dict[str, Any]] = []
    invalid = 0

    for idx, row in enumerate(rows):
        if not isinstance(row, dict):
            invalid += 1
            continue
        col_map = _build_col_map(row)
        lat, lng = _coords_from_row(row, col_map)
        if not _valid_coords(lat, lng):
            invalid += 1
            continue

        meta: dict[str, Any] = {}
        for k, v in row.items():
            if k.startswith("_"):
                continue
            nk = _norm_key(str(k))
            if nk in used_keys:
                continue
            if v is not None and str(v).strip() != "":
                meta[k] = v

        power = _to_float(_pick(row, col_map, _FIELD_ALIASES["power_kw"]))
        capacity = _to_float(_pick(row, col_map, _FIELD_ALIASES["capacity_kw"]))
        if capacity is None:
            capacity = power

        assets.append(
            {
                "asset_kind": asset_kind,
                "source_type": "upload",
                "name": _pick(row, col_map, _FIELD_ALIASES["name"]),
                "address": _pick(row, col_map, _FIELD_ALIASES["address"]),
                "latitude": lat,
                "longitude": lng,
                "zone_id": _pick(row, col_map, _FIELD_ALIASES["zone_id"]),
                "status": _pick(row, col_map, _FIELD_ALIASES["status"]),
                "operator": _pick(row, col_map, _FIELD_ALIASES["operator"]),
                "power_kw": power,
                "capacity_kw": capacity,
                "charger_type": _pick(row, col_map, _FIELD_ALIASES["charger_type"]),
                "metadata": meta,
                "source_row_index": row.get("_source_row_index", idx),
            }
        )

    summary["extracted_existing_infrastructure_count"] = len(assets)
    summary["invalid_existing_infrastructure_rows"] = invalid
    return assets, summary
