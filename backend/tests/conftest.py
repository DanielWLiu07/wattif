"""Shared pytest fixtures — keep tests offline when backend/.env has real LLM keys."""

from __future__ import annotations

import pytest


@pytest.fixture(autouse=True)
def _isolate_llm_for_tests(monkeypatch):
    """Prevent integration tests from calling network LLMs loaded from backend/.env."""
    import app.config as config

    monkeypatch.setattr(config, "ANTHROPIC_API_KEY", None)
    monkeypatch.setattr(config, "FEATHER_API_KEY", None)
    monkeypatch.setattr(config, "FEATHER_BASE_URL", None)
    monkeypatch.setattr(config, "DEMO_LLM", True)
