"""Parse and validate small CSV / JSON / GeoJSON uploads for Phase 7."""

from __future__ import annotations

import csv
import io
import json
from typing import Any

from .dataset_classify import detect_dataset_type, summarize_properties, validate_dataset_type

MAX_UPLOAD_BYTES = 512 * 1024  # 512 KiB demo limit
MAX_CSV_ROWS = 10_000
MAX_JSON_ITEMS = 5_000
MAX_GEOJSON_FEATURES = 5_000
MAX_PREVIEW_ROWS = 10
MAX_PREVIEW_FEATURES = 5
MAX_COLUMNS_LISTED = 40


class DatasetParseError(ValueError):
    """User-facing validation error."""


def _decode_text(raw: bytes) -> str:
    if len(raw) > MAX_UPLOAD_BYTES:
        raise DatasetParseError(
            f"File exceeds {MAX_UPLOAD_BYTES // 1024} KiB upload limit for demo uploads."
        )
    for enc in ("utf-8-sig", "utf-8", "latin-1"):
        try:
            return raw.decode(enc)
        except UnicodeDecodeError:
            continue
    raise DatasetParseError("Could not decode file as UTF-8 text.")


def _infer_file_type(filename: str, content_type: str | None) -> str:
    name = (filename or "").lower()
    ct = (content_type or "").lower()
    if name.endswith(".geojson") or name.endswith(".json") and "geojson" in name:
        if "geojson" in name or "featurecollection" in ct:
            return "geojson"
    if name.endswith(".geojson"):
        return "geojson"
    if name.endswith(".csv") or "csv" in ct:
        return "csv"
    if name.endswith(".json") or "json" in ct:
        return "json"
    if name.endswith(".geojson"):
        return "geojson"
    raise DatasetParseError("Unsupported file type. Use .csv, .json, or .geojson.")


def _parse_csv(text: str) -> dict[str, Any]:
    reader = csv.DictReader(io.StringIO(text))
    if not reader.fieldnames:
        raise DatasetParseError("CSV has no header row.")
    columns = [c.strip() for c in reader.fieldnames if c and c.strip()][:MAX_COLUMNS_LISTED]
    rows: list[dict[str, Any]] = []
    for i, row in enumerate(reader):
        if i >= MAX_CSV_ROWS:
            raise DatasetParseError(f"CSV exceeds {MAX_CSV_ROWS} row limit.")
        rows.append({k: row.get(k) for k in reader.fieldnames if k})
    preview = rows[:MAX_PREVIEW_ROWS]
    return {
        "file_type": "csv",
        "row_count": len(rows),
        "feature_count": None,
        "columns": columns,
        "preview": preview,
        "metadata": {"geometryTypes": []},
    }


def _parse_json_obj(obj: Any) -> dict[str, Any]:
    if isinstance(obj, dict) and obj.get("type") == "FeatureCollection":
        return _parse_geojson(obj)
    if isinstance(obj, dict) and obj.get("type") == "Feature":
        return _parse_geojson({"type": "FeatureCollection", "features": [obj]})
    if isinstance(obj, list):
        if not obj:
            return {
                "file_type": "json",
                "row_count": 0,
                "feature_count": None,
                "columns": [],
                "preview": [],
                "metadata": {"root": "array"},
            }
        if all(isinstance(x, dict) for x in obj):
            columns = list({k for row in obj[:50] if isinstance(row, dict) for k in row})[
                :MAX_COLUMNS_LISTED
            ]
            if len(obj) > MAX_JSON_ITEMS:
                raise DatasetParseError(f"JSON array exceeds {MAX_JSON_ITEMS} item limit.")
            return {
                "file_type": "json",
                "row_count": len(obj),
                "feature_count": None,
                "columns": columns,
                "preview": obj[:MAX_PREVIEW_ROWS],
                "metadata": {"root": "array"},
            }
        raise DatasetParseError("JSON array must contain objects.")
    if isinstance(obj, dict):
        columns = list(obj.keys())[:MAX_COLUMNS_LISTED]
        return {
            "file_type": "json",
            "row_count": 1,
            "feature_count": None,
            "columns": columns,
            "preview": [obj],
            "metadata": {"root": "object"},
        }
    raise DatasetParseError("JSON must be an object, FeatureCollection, or array of objects.")


def _parse_geojson(obj: dict) -> dict[str, Any]:
    features = obj.get("features")
    if not isinstance(features, list):
        raise DatasetParseError("GeoJSON FeatureCollection must have a features array.")
    if len(features) > MAX_GEOJSON_FEATURES:
        raise DatasetParseError(f"GeoJSON exceeds {MAX_GEOJSON_FEATURES} feature limit.")
    geom_types: set[str] = set()
    prop_keys: set[str] = set()
    preview: list[dict[str, Any]] = []
    for i, feat in enumerate(features):
        if not isinstance(feat, dict):
            continue
        geom = feat.get("geometry") or {}
        gtype = geom.get("type")
        if gtype:
            geom_types.add(str(gtype))
        props = feat.get("properties") if isinstance(feat.get("properties"), dict) else {}
        for k in summarize_properties(props, max_keys=MAX_COLUMNS_LISTED):
            prop_keys.add(k)
        if i < MAX_PREVIEW_FEATURES:
            preview.append(
                {
                    "geometryType": gtype,
                    "properties": props,
                }
            )
    columns = sorted(prop_keys)[:MAX_COLUMNS_LISTED]
    return {
        "file_type": "geojson",
        "row_count": None,
        "feature_count": len(features),
        "columns": columns,
        "preview": preview,
        "metadata": {
            "geometryTypes": sorted(geom_types),
            "featureCount": len(features),
        },
    }


def parse_upload(
    *,
    filename: str,
    raw: bytes,
    content_type: str | None = None,
    dataset_type_override: str | None = None,
) -> dict[str, Any]:
    """Parse upload bytes into storable metadata + preview (no full file persistence)."""
    file_type = _infer_file_type(filename, content_type)
    text = _decode_text(raw)

    if file_type == "csv":
        parsed = _parse_csv(text)
    else:
        try:
            obj = json.loads(text)
        except json.JSONDecodeError as exc:
            raise DatasetParseError(f"Invalid JSON: {exc}") from exc
        if file_type == "geojson":
            if not isinstance(obj, dict):
                raise DatasetParseError("GeoJSON must be a JSON object.")
            parsed = _parse_geojson(obj)
        else:
            parsed = _parse_json_obj(obj)
            if parsed["file_type"] == "json" and isinstance(obj, dict) and obj.get("type") == "FeatureCollection":
                parsed = _parse_geojson(obj)
                parsed["file_type"] = "geojson"

    detected = detect_dataset_type(
        filename=filename,
        columns=parsed.get("columns"),
        is_geojson=parsed["file_type"] == "geojson",
    )
    dataset_type = validate_dataset_type(dataset_type_override or detected)

    return {
        "name": filename.rsplit("/", 1)[-1].rsplit("\\", 1)[-1] or "upload",
        "dataset_type": dataset_type,
        "dataset_type_detected": detected,
        "file_type": parsed["file_type"],
        "row_count": parsed.get("row_count"),
        "feature_count": parsed.get("feature_count"),
        "columns": parsed.get("columns") or [],
        "preview": parsed.get("preview") or [],
        "metadata": {
            **(parsed.get("metadata") or {}),
            "detectedType": detected,
            "originalFilename": filename,
            "contentType": content_type,
        },
    }
