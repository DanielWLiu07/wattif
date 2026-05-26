"""Deterministic uploaded-dataset type classification (no LLM)."""

from __future__ import annotations

import re
from typing import Any

DATASET_TYPES = (
    "ev_chargers",
    "ev_sentiment",
    "energy_demand",
    "weather_risk",
    "grid_infrastructure",
    "demographic",
    "zoning_constraints",
    "public_feedback",
    "generic",
)

_TYPE_KEYWORDS: list[tuple[str, tuple[str, ...]]] = [
    ("ev_chargers", ("charger", "charging", "evse", "plug", "station", "latitude", "longitude", "lat", "lon", "lng")),
    ("ev_sentiment", ("ev_sentiment", "charger_sentiment", "charging_sentiment", "ev_rating", "ev_opinion")),
    ("public_feedback", ("comment", "feedback", "review", "rating", "sentiment", "opinion", "survey", "complaint")),
    ("energy_demand", ("demand", "kwh", "load", "peak", "consumption", "usage", "energy_use")),
    ("weather_risk", ("temperature", "heat", "flood", "snow", "storm", "rain", "drought", "wildfire", "hvi", "climate")),
    ("grid_infrastructure", ("substation", "feeder", "transformer", "grid", "transmission", "distribution", "line")),
    ("demographic", ("income", "population", "renter", "household", "demographic", "census", "age", "ethnicity")),
    ("zoning_constraints", ("zoning", "restricted", "no_build", "constraint", "land_use", "permitted", "overlay")),
]


def _norm_columns(columns: list[str]) -> list[str]:
    return [re.sub(r"[^a-z0-9]+", "_", c.strip().lower()) for c in columns if c]


def _score_type(dtype: str, tokens: set[str], filename: str) -> int:
    keywords = _TYPE_KEYWORDS[[t[0] for t in _TYPE_KEYWORDS].index(dtype)][1]
    score = 0
    for kw in keywords:
        if kw in tokens:
            score += 2
        if kw in filename:
            score += 1
    return score


def detect_dataset_type(
    *,
    filename: str,
    columns: list[str] | None = None,
    content_hints: list[str] | None = None,
    is_geojson: bool = False,
) -> str:
    """Classify dataset type from filename, column names, and optional content hints."""
    filename_l = filename.lower()
    col_tokens: set[str] = set(_norm_columns(columns or []))
    for part in re.split(r"[_\-\.]+", filename_l):
        if part:
            col_tokens.add(part)
    for hint in content_hints or []:
        col_tokens.update(re.split(r"[^a-z0-9]+", hint.lower()))

    if is_geojson and any(t in col_tokens for t in ("charger", "charging", "evse", "station")):
        return "ev_chargers"

    scores: dict[str, int] = {}
    for dtype, _ in _TYPE_KEYWORDS:
        scores[dtype] = _score_type(dtype, col_tokens, filename_l)

    # ev_sentiment vs public_feedback: prefer ev_sentiment when EV context present
    if scores.get("public_feedback", 0) > 0 and any(
        t in col_tokens for t in ("ev", "charger", "charging", "electric")
    ):
        scores["ev_sentiment"] = scores.get("ev_sentiment", 0) + scores["public_feedback"] + 1

    best = max(scores.items(), key=lambda x: x[1])
    if best[1] <= 0:
        return "generic"
    return best[0]


def validate_dataset_type(value: str) -> str:
    v = (value or "generic").strip().lower()
    return v if v in DATASET_TYPES else "generic"


def summarize_properties(props: dict[str, Any], max_keys: int = 12) -> list[str]:
    """Column-like keys from GeoJSON feature properties."""
    keys: list[str] = []
    for k in props:
        if k.startswith("_"):
            continue
        keys.append(str(k))
        if len(keys) >= max_keys:
            break
    return keys
