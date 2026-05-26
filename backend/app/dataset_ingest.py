"""Small, deterministic dataset upload parsing and classification helpers."""

from __future__ import annotations

import csv
import io
import json
from collections import Counter
from dataclasses import dataclass
from typing import Any

MAX_UPLOAD_BYTES = 2 * 1024 * 1024
MAX_PREVIEW_ITEMS = 8
MAX_COLUMNS = 80
MAX_CELL_CHARS = 240

DATASET_TYPES = {
    "ev_chargers",
    "ev_sentiment",
    "energy_demand",
    "weather_risk",
    "grid_infrastructure",
    "demographic",
    "zoning_constraints",
    "public_feedback",
    "generic",
}


class DatasetValidationError(ValueError):
    """Raised for user-fixable upload validation errors."""


@dataclass(frozen=True)
class ParsedDataset:
    name: str
    dataset_type: str
    file_type: str
    row_count: int | None
    feature_count: int | None
    columns: list[str]
    preview: list[dict[str, Any]]
    metadata: dict[str, Any]


def parse_upload(
    *,
    filename: str,
    content_type: str | None,
    body: bytes,
    dataset_type: str | None = None,
) -> ParsedDataset:
    if not body:
        raise DatasetValidationError("Uploaded file is empty")
    if len(body) > MAX_UPLOAD_BYTES:
        raise DatasetValidationError(
            f"Uploaded file is too large; limit is {MAX_UPLOAD_BYTES // (1024 * 1024)} MB"
        )

    name = _display_name(filename)
    file_type = _file_type(filename, content_type)
    if file_type == "csv":
        parsed = _parse_csv(body)
    elif file_type in ("json", "geojson"):
        parsed = _parse_json(body, assume_geojson=file_type == "geojson")
        file_type = parsed.pop("file_type", file_type)
    else:
        raise DatasetValidationError("Only CSV, JSON, and GeoJSON uploads are supported")

    detected_type, signals = classify_dataset(
        filename=filename,
        columns=parsed["columns"],
        preview=parsed["preview"],
        feature_count=parsed.get("feature_count"),
        geojson=parsed.get("geojson", False),
    )
    final_type = _normalize_dataset_type(dataset_type) or detected_type

    metadata = {
        "summary": _summary(final_type, file_type, parsed),
        "detectedDatasetType": detected_type,
        "classificationSignals": signals,
        "originalFilename": filename,
        "contentType": content_type,
        "sizeBytes": len(body),
        **parsed.get("metadata", {}),
    }
    return ParsedDataset(
        name=name,
        dataset_type=final_type,
        file_type=file_type,
        row_count=parsed.get("row_count"),
        feature_count=parsed.get("feature_count"),
        columns=parsed["columns"],
        preview=parsed["preview"],
        metadata=metadata,
    )


def classify_dataset(
    *,
    filename: str,
    columns: list[str],
    preview: list[dict[str, Any]],
    feature_count: int | None = None,
    geojson: bool = False,
) -> tuple[str, dict[str, Any]]:
    text = " ".join(
        [
            filename,
            *columns,
            *[
                " ".join(str(v) for v in row.values() if isinstance(v, (str, int, float)))
                for row in preview[:3]
            ],
        ]
    ).lower()
    scores: Counter[str] = Counter()
    rules = {
        "ev_chargers": ("ev", "charger", "charging", "station", "plug", "connector"),
        "ev_sentiment": ("ev", "sentiment", "survey", "opinion", "charging concern"),
        "energy_demand": ("demand", "load", "kwh", "mwh", "consumption", "peak"),
        "weather_risk": ("flood", "heat", "storm", "risk", "hazard", "weather"),
        "grid_infrastructure": ("substation", "feeder", "transformer", "grid", "line"),
        "demographic": ("population", "income", "renter", "age", "household", "census"),
        "zoning_constraints": ("zoning", "constraint", "no build", "setback", "parcel"),
        "public_feedback": ("feedback", "complaint", "comment", "issue", "request"),
    }
    for dtype, words in rules.items():
        for word in words:
            if word in text:
                scores[dtype] += 2 if word in filename.lower() else 1
    if geojson or feature_count is not None:
        if any(word in text for word in ("zoning", "constraint", "parcel", "setback")):
            scores["zoning_constraints"] += 2
        elif any(word in text for word in ("substation", "feeder", "grid", "line")):
            scores["grid_infrastructure"] += 2
    if "sentiment" in text and "ev" in text:
        scores["ev_sentiment"] += 3
    if "charger" in text and "ev" in text:
        scores["ev_chargers"] += 3

    dataset_type = scores.most_common(1)[0][0] if scores else "generic"
    return dataset_type, {"scores": dict(scores), "geojson": geojson}


def _parse_csv(body: bytes) -> dict[str, Any]:
    text = _decode_text(body)
    try:
        reader = csv.DictReader(io.StringIO(text))
    except csv.Error as exc:
        raise DatasetValidationError(f"CSV could not be parsed: {exc}") from exc
    if not reader.fieldnames:
        raise DatasetValidationError("CSV must include a header row")
    columns = [str(c).strip() for c in reader.fieldnames if str(c).strip()][:MAX_COLUMNS]
    preview: list[dict[str, Any]] = []
    row_count = 0
    try:
        for row in reader:
            row_count += 1
            if len(preview) < MAX_PREVIEW_ITEMS:
                preview.append({c: _cell(row.get(c)) for c in columns})
    except csv.Error as exc:
        raise DatasetValidationError(f"CSV could not be parsed: {exc}") from exc
    return {
        "row_count": row_count,
        "feature_count": None,
        "columns": columns,
        "preview": preview,
        "metadata": {"delimiter": ","},
    }


def _parse_json(body: bytes, *, assume_geojson: bool) -> dict[str, Any]:
    try:
        data = json.loads(_decode_text(body))
    except json.JSONDecodeError as exc:
        raise DatasetValidationError(f"JSON could not be parsed: {exc.msg}") from exc
    if isinstance(data, dict) and data.get("type") == "FeatureCollection":
        features = data.get("features")
        if not isinstance(features, list):
            raise DatasetValidationError("GeoJSON FeatureCollection must include features[]")
        preview = [_feature_preview(f) for f in features[:MAX_PREVIEW_ITEMS]]
        columns = _columns_from_rows(
            [f.get("properties") for f in features if isinstance(f, dict)]
        )
        geometry_types = sorted(
            {
                str((f.get("geometry") or {}).get("type"))
                for f in features
                if isinstance(f, dict) and isinstance(f.get("geometry"), dict)
            }
        )
        return {
            "file_type": "geojson",
            "row_count": None,
            "feature_count": len(features),
            "columns": columns,
            "preview": preview,
            "geojson": True,
            "metadata": {
                "geometryTypes": geometry_types,
                "bbox": data.get("bbox") if isinstance(data.get("bbox"), list) else None,
            },
        }
    if assume_geojson:
        raise DatasetValidationError("GeoJSON upload must be a FeatureCollection")

    rows: list[Any]
    if isinstance(data, list):
        rows = data
    elif isinstance(data, dict):
        rows = [data]
    else:
        raise DatasetValidationError("JSON upload must be an object, array, or GeoJSON")
    preview = [_object_preview(row) for row in rows[:MAX_PREVIEW_ITEMS]]
    return {
        "file_type": "json",
        "row_count": len(rows),
        "feature_count": None,
        "columns": _columns_from_rows(rows),
        "preview": preview,
        "metadata": {},
    }


def _feature_preview(feature: Any) -> dict[str, Any]:
    if not isinstance(feature, dict):
        return {"value": _cell(feature)}
    geometry = feature.get("geometry") or {}
    props = feature.get("properties") or {}
    return {
        "id": _cell(feature.get("id")),
        "geometryType": geometry.get("type") if isinstance(geometry, dict) else None,
        **_object_preview(props),
    }


def _object_preview(row: Any) -> dict[str, Any]:
    if not isinstance(row, dict):
        return {"value": _cell(row)}
    return {str(k): _cell(v) for k, v in list(row.items())[:MAX_COLUMNS]}


def _columns_from_rows(rows: list[Any]) -> list[str]:
    cols: list[str] = []
    seen: set[str] = set()
    for row in rows:
        if not isinstance(row, dict):
            continue
        for key in row:
            k = str(key)
            if k not in seen:
                seen.add(k)
                cols.append(k)
            if len(cols) >= MAX_COLUMNS:
                return cols
    return cols


def _decode_text(body: bytes) -> str:
    try:
        return body.decode("utf-8-sig")
    except UnicodeDecodeError as exc:
        raise DatasetValidationError("File must be UTF-8 text") from exc


def _cell(value: Any) -> Any:
    if value is None or isinstance(value, (int, float, bool)):
        return value
    if isinstance(value, (dict, list)):
        value = json.dumps(value, ensure_ascii=True)
    text = str(value)
    return text if len(text) <= MAX_CELL_CHARS else text[:MAX_CELL_CHARS] + "..."


def _display_name(filename: str) -> str:
    clean = filename.rsplit("/", 1)[-1].rsplit("\\", 1)[-1].strip()
    return clean or "uploaded dataset"


def _file_type(filename: str, content_type: str | None) -> str:
    lower = filename.lower()
    if lower.endswith(".geojson"):
        return "geojson"
    if lower.endswith(".csv"):
        return "csv"
    if lower.endswith(".json"):
        return "json"
    ctype = (content_type or "").split(";", 1)[0].lower()
    if ctype in ("text/csv", "application/csv"):
        return "csv"
    if ctype in ("application/geo+json", "application/vnd.geo+json"):
        return "geojson"
    if ctype == "application/json":
        return "json"
    return "unknown"


def _normalize_dataset_type(value: str | None) -> str | None:
    if not value or value == "auto":
        return None
    if value not in DATASET_TYPES:
        raise DatasetValidationError(f"datasetType must be one of {sorted(DATASET_TYPES)}")
    return value


def _summary(dataset_type: str, file_type: str, parsed: dict[str, Any]) -> str:
    count = parsed.get("feature_count")
    noun = "features" if count is not None else "rows"
    count = count if count is not None else parsed.get("row_count", 0)
    cols = parsed.get("columns") or []
    col_text = f" with {len(cols)} column(s)" if cols else ""
    return f"{dataset_type} {file_type.upper()} dataset: {count} {noun}{col_text}."
