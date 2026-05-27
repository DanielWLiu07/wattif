"""Tests for Featherless raw tool-call parsing."""

from __future__ import annotations

from app.planner_tool_parse import (
    contains_raw_tool_call,
    merge_tool_calls,
    parse_raw_tool_calls,
    strip_raw_tool_calls,
)


def test_parse_optimize_raw_tool_call():
    raw = "<|tool_call>call:optimize{kind:solar,n:5}<tool_call|>"
    calls = parse_raw_tool_calls(raw)
    assert len(calls) == 1
    assert calls[0]["name"] == "optimize"
    assert calls[0]["args"] == {"kind": "solar", "n": 5}


def test_strip_raw_tool_call_from_text():
    raw = "Planning now <|tool_call>call:optimize{kind:solar,n:5}<tool_call|> done"
    assert strip_raw_tool_calls(raw) == "Planning now done"
    assert not contains_raw_tool_call(strip_raw_tool_calls(raw))


def test_dedupe_identical_raw_tool_calls():
    raw = (
        "<|tool_call>call:optimize{kind:solar,n:5}<tool_call|>"
        "<|tool_call>call:optimize{kind:solar,n:5}<tool_call|>"
    )
    calls = parse_raw_tool_calls(raw)
    assert len(calls) == 1


def test_merge_tool_calls_dedupes_structured_and_raw():
    class Fn:
        name = "optimize"
        arguments = '{"kind":"solar","n":5}'

    class TC:
        function = Fn()

    merged, clean = merge_tool_calls(
        [TC()],
        "<|tool_call>call:optimize{kind:solar,n:5}<tool_call|>",
    )
    assert len(merged) == 1
    assert merged[0]["args"]["kind"] == "solar"
    assert clean == ""
