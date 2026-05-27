"""Extract text evidence chunks from uploaded CSV/JSON/GeoJSON rows (Phase 17)."""

from __future__ import annotations

import re
from typing import Any

MAX_CHUNK_TEXT = 1500
MAX_CHUNKS = 500

TEXT_COLUMN_CANDIDATES: tuple[str, ...] = (
    "feedback",
    "comment",
    "comments",
    "concern",
    "issue",
    "description",
    "notes",
    "response",
    "text",
    "summary",
    "address",
    "location",
    "status",
    "operator",
    "charger_type",
    "plug_type",
    "connector_type",
    "name",
    "station_name",
    "site_name",
    "ward",
    "neighbourhood",
    "neighborhood",
    "rating",
    "sentiment",
)

STRUCTURED_VALUE_FIELDS: tuple[str, ...] = (
    "status",
    "operator",
    "charger_type",
    "plug_type",
    "address",
    "location",
    "name",
    "station_name",
    "power_kw",
    "capacity_kw",
)

_SKIP_KEYS = frozenset(
    {
        "_source_row_index",
        "_geometry_type",
        "_lat",
        "_lng",
        "latitude",
        "lat",
        "longitude",
        "lng",
        "lon",
    }
)

_TOPIC_KEYWORDS: dict[str, tuple[str, ...]] = {
    "parking": ("parking", "curb", "congestion", "stall", "lot"),
    "ev_charging": ("charger", "charging", "ev", "dcfc", "plug"),
    "demand": ("demand", "peak", "load", "kwh", "summer", "heat"),
    "heatwave": ("heat", "heatwave", "cooling", "temperature"),
    "grid": ("grid", "feeder", "substation", "outage", "reliability"),
    "affordability": ("afford", "bill", "burden", "cost", "rent"),
    "feedback": ("feedback", "comment", "concern", "oppose", "support"),
}


def _norm_key(key: str) -> str:
    return re.sub(r"[^a-z0-9]+", "_", (key or "").strip().lower()).strip("_")


def _build_col_map(row: dict[str, Any]) -> dict[str, str]:
    out: dict[str, str] = {}
    for k in row:
        if str(k).startswith("_"):
            continue
        nk = _norm_key(str(k))
        if nk and nk not in out:
            out[nk] = str(k)
    return out


def _is_candidate_column(norm_name: str) -> bool:
    if norm_name in TEXT_COLUMN_CANDIDATES:
        return True
    return any(c in norm_name for c in ("comment", "feedback", "concern", "note", "text"))


def _clean_text(val: Any) -> str:
    if val is None:
        return ""
    s = str(val).strip()
    if not s or s.lower() in ("null", "none", "nan", "n/a"):
        return ""
    return s


def _truncate(text: str, limit: int = MAX_CHUNK_TEXT) -> str:
    if len(text) <= limit:
        return text
    return text[: limit - 3].rstrip() + "..."


def _infer_topic_tags(text: str, dataset_type: str) -> list[str]:
    tags: list[str] = []
    lower = text.lower()
    for tag, keywords in _TOPIC_KEYWORDS.items():
        if any(kw in lower for kw in keywords):
            tags.append(tag)
    if dataset_type and dataset_type not in tags:
        tags.append(dataset_type)
    return list(dict.fromkeys(tags))[:8]


def _row_index(row: dict[str, Any], fallback: int) -> int:
    idx = row.get("_source_row_index")
    if isinstance(idx, int):
        return idx
    return fallback


def _primary_text_fields(col_map: dict[str, str]) -> list[str]:
    primary: list[str] = []
    for norm, orig in col_map.items():
        if _is_candidate_column(norm):
            primary.append(orig)
    return primary


def _structured_fields(col_map: dict[str, str]) -> list[tuple[str, str]]:
    out: list[tuple[str, str]] = []
    for alias in STRUCTURED_VALUE_FIELDS:
        orig = col_map.get(alias)
        if orig:
            out.append((alias, orig))
    return out


def _chunk_from_row(
    row: dict[str, Any],
    *,
    row_index: int,
    dataset_type: str,
    source_field: str,
    parts: list[str],
) -> dict[str, Any] | None:
    text = _truncate(" | ".join(p for p in parts if p))
    if len(text) < 8:
        return None
    summary = _truncate(text, 200) if len(text) > 200 else text
    return {
        "chunk_text": text,
        "chunk_summary": summary,
        "source_row_index": row_index,
        "source_field": source_field,
        "topic_tags": _infer_topic_tags(text, dataset_type),
        "metadata": {"datasetType": dataset_type, "fieldCount": len(parts)},
    }


def extract_evidence_chunks(
    *,
    rows: list[dict[str, Any]],
    dataset_type: str,
    columns: list[str] | None = None,
) -> tuple[list[dict[str, Any]], dict[str, Any]]:
    """Return (chunk_specs, extraction_summary). Never raises."""
    chunks: list[dict[str, Any]] = []
    skipped_empty = 0

    for i, row in enumerate(rows[:MAX_CHUNKS * 2]):
        if len(chunks) >= MAX_CHUNKS:
            break
        if not isinstance(row, dict):
            continue
        col_map = _build_col_map(row)
        row_idx = _row_index(row, i)
        text_fields = _primary_text_fields(col_map)

        if text_fields:
            long_parts: list[str] = []
            for orig in text_fields:
                val = _clean_text(row.get(orig))
                if not val:
                    continue
                if len(val) >= 20 or orig.lower() in (
                    "comment",
                    "comments",
                    "feedback",
                    "concern",
                    "description",
                    "notes",
                    "response",
                    "text",
                    "summary",
                ):
                    chunk = _chunk_from_row(
                        row,
                        row_index=row_idx,
                        dataset_type=dataset_type,
                        source_field=orig,
                        parts=[f"{orig}: {val}"],
                    )
                    if chunk:
                        chunks.append(chunk)
                else:
                    long_parts.append(f"{orig}: {val}")

            if long_parts and len(chunks) < MAX_CHUNKS:
                combined = _chunk_from_row(
                    row,
                    row_index=row_idx,
                    dataset_type=dataset_type,
                    source_field="combined",
                    parts=long_parts,
                )
                if combined:
                    chunks.append(combined)
        else:
            struct = _structured_fields(col_map)
            parts: list[str] = []
            for alias, orig in struct:
                val = _clean_text(row.get(orig))
                if val:
                    parts.append(f"{alias}: {val}")
            if not parts:
                for k, v in row.items():
                    if str(k).startswith("_") or _norm_key(str(k)) in _SKIP_KEYS:
                        continue
                    val = _clean_text(v)
                    if val and len(val) >= 3:
                        parts.append(f"{k}: {val}")
                    if len(parts) >= 6:
                        break
            chunk = _chunk_from_row(
                row,
                row_index=row_idx,
                dataset_type=dataset_type,
                source_field="row",
                parts=parts[:8],
            )
            if chunk:
                chunks.append(chunk)
            else:
                skipped_empty += 1

    summary = {
        "extracted_evidence_chunk_count": len(chunks),
        "skipped_empty_rows": skipped_empty,
        "dataset_type": dataset_type,
    }
    return chunks, summary
