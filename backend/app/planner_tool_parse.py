"""Parse Featherless raw tool-call text into structured planner tool calls."""

from __future__ import annotations

import json
import re
from typing import Any

# Featherless sometimes emits: <|tool_call>call:optimize{kind:solar,n:5}<tool_call|>
RAW_TOOL_CALL_RE = re.compile(
    r"<\|tool_call>\s*call:(?P<name>[a-z_]+)\s*\{(?P<args>[^}]*)\}\s*<tool_call\|>",
    re.IGNORECASE,
)


def _coerce_value(raw: str) -> Any:
    s = raw.strip().strip("\"'")
    if not s:
        return ""
    if re.fullmatch(r"-?\d+", s):
        return int(s)
    if re.fullmatch(r"-?\d+\.\d+", s):
        return float(s)
    if s.lower() in ("true", "false"):
        return s.lower() == "true"
    return s


def _parse_args_blob(args_str: str) -> dict[str, Any]:
    out: dict[str, Any] = {}
    for part in re.split(r",(?=\s*\w+:)", args_str or ""):
        part = part.strip()
        if not part or ":" not in part:
            continue
        key, _, val = part.partition(":")
        key = key.strip()
        if not key:
            continue
        out[key] = _coerce_value(val)
    return out


def strip_raw_tool_calls(text: str) -> str:
    """Remove raw tool-call tokens from model text."""
    cleaned = RAW_TOOL_CALL_RE.sub("", text or "")
    return re.sub(r"\s+", " ", cleaned).strip()


def contains_raw_tool_call(text: str) -> bool:
    return bool(RAW_TOOL_CALL_RE.search(text or ""))


def parse_raw_tool_calls(text: str) -> list[dict[str, Any]]:
    """Extract structured tool calls from raw Featherless text; dedupe identical calls."""
    seen: set[tuple[str, str]] = set()
    out: list[dict[str, Any]] = []
    for match in RAW_TOOL_CALL_RE.finditer(text or ""):
        name = match.group("name")
        args = _parse_args_blob(match.group("args"))
        key = (name, json.dumps(args, sort_keys=True))
        if key in seen:
            continue
        seen.add(key)
        out.append({"name": name, "args": args})
    return out


def merge_tool_calls(
    structured: list[Any] | None,
    raw_text: str | None,
) -> tuple[list[dict[str, Any]], str]:
    """Combine OpenAI tool_calls with parsed raw text calls; return (calls, clean_text)."""
    clean = strip_raw_tool_calls(raw_text or "")
    merged: list[dict[str, Any]] = []
    seen: set[tuple[str, str]] = set()

    def _add(name: str, args: dict[str, Any]) -> None:
        key = (name, json.dumps(args or {}, sort_keys=True))
        if key in seen:
            return
        seen.add(key)
        merged.append({"name": name, "args": args or {}})

    for tc in structured or []:
        fn = getattr(tc, "function", None) or tc.get("function") if isinstance(tc, dict) else None
        if fn is None:
            continue
        name = getattr(fn, "name", None) or (fn.get("name") if isinstance(fn, dict) else None)
        raw_args = getattr(fn, "arguments", None) or (
            fn.get("arguments") if isinstance(fn, dict) else None
        )
        try:
            args = json.loads(raw_args or "{}")
        except json.JSONDecodeError:
            args = {}
        if name:
            _add(name, args)

    for call in parse_raw_tool_calls(raw_text or ""):
        _add(call["name"], call["args"])

    return merged, clean
