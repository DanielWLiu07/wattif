"""Tests for the provider-agnostic reasoning-agent layer (rule-based fallback path)."""

from __future__ import annotations

import importlib

from app.data.seed import build_world
from app.sim.llm import generate_rationales, rule_based_rationales


def _sample(n: int = 5):
    zones, agents = build_world(seed=5, num_agents=300)
    return agents[:n], {z.id: z for z in zones}


def test_fallback_returns_rationale_for_every_agent(monkeypatch):
    # Force "no provider configured" so we exercise the rule-based path deterministically.
    import app.config as config

    monkeypatch.setattr(config, "ANTHROPIC_API_KEY", None)
    monkeypatch.setattr(config, "FEATHER_API_KEY", None)
    monkeypatch.setattr(config, "FEATHER_BASE_URL", None)
    importlib.reload  # no-op; config funcs read module-level attrs we patched

    agents, zones_by_id = _sample(6)
    out = generate_rationales(agents, zones_by_id)
    assert len(out) == len(agents)
    assert all(o["id"] and o["rationale"] for o in out)
    # ids round-trip and align
    assert [o["id"] for o in out] == [a.id for a in agents]


def test_provider_selection_prefers_anthropic(monkeypatch):
    import app.config as config

    monkeypatch.setattr(config, "ANTHROPIC_API_KEY", "sk-test")
    monkeypatch.setattr(config, "FEATHER_API_KEY", "feather-test")
    monkeypatch.setattr(config, "FEATHER_BASE_URL", "https://gateway.example/v1")
    assert config.llm_provider() == "anthropic"
    assert config.llm_enabled() is True


def test_provider_selection_feather_when_only_feather(monkeypatch):
    import app.config as config

    monkeypatch.setattr(config, "ANTHROPIC_API_KEY", None)
    monkeypatch.setattr(config, "FEATHER_API_KEY", "feather-test")
    monkeypatch.setattr(config, "FEATHER_BASE_URL", "https://gateway.example/v1")
    assert config.llm_provider() == "feather"
    assert config.real_llm_provider() == "feather"


def test_provider_selection_featherless_env_aliases(monkeypatch):
    """FEATHERLESS_* names (common in .env) resolve to the feather provider."""
    monkeypatch.delenv("FEATHER_API_KEY", raising=False)
    monkeypatch.delenv("FEATHER_BASE_URL", raising=False)
    monkeypatch.delenv("ANTHROPIC_API_KEY", raising=False)
    monkeypatch.setenv("FEATHERLESS_API_KEY", "rc_test_key")
    monkeypatch.setenv("FEATHERLESS_BASE_URL", "https://api.featherless.ai/v1")
    monkeypatch.setenv("FEATHERLESS_MODEL", "google/gemma-test")

    import app.config as config

    importlib.reload(config)
    assert config.FEATHER_API_KEY == "rc_test_key"
    assert config.FEATHER_BASE_URL == "https://api.featherless.ai/v1"
    assert config.FEATHER_MODEL == "google/gemma-test"
    assert config.llm_provider() == "feather"
    assert config.real_llm_provider() == "feather"
    # Restore module defaults for later tests (reload without alias env).
    monkeypatch.delenv("FEATHERLESS_API_KEY", raising=False)
    monkeypatch.delenv("FEATHERLESS_BASE_URL", raising=False)
    monkeypatch.delenv("FEATHERLESS_MODEL", raising=False)
    importlib.reload(config)


def test_demo_provider_is_default_without_key(monkeypatch):
    import app.config as config

    monkeypatch.setattr(config, "ANTHROPIC_API_KEY", None)
    monkeypatch.setattr(config, "FEATHER_API_KEY", None)
    monkeypatch.setattr(config, "FEATHER_BASE_URL", None)
    monkeypatch.setattr(config, "DEMO_LLM", True)
    # Scripted demo provider is active, but it is NOT a network-backed provider.
    assert config.llm_provider() == "demo"
    assert config.llm_enabled() is True
    assert config.real_llm_provider() is None


def test_provider_none_when_demo_disabled(monkeypatch):
    import app.config as config

    monkeypatch.setattr(config, "ANTHROPIC_API_KEY", None)
    monkeypatch.setattr(config, "FEATHER_API_KEY", None)
    monkeypatch.setattr(config, "FEATHER_BASE_URL", None)
    monkeypatch.setattr(config, "DEMO_LLM", False)
    assert config.llm_provider() is None
    assert config.llm_enabled() is False


def test_empty_agents_returns_empty():
    assert generate_rationales([], {}) == []


def test_rule_based_is_deterministic():
    agents, zones_by_id = _sample(4)
    a = rule_based_rationales(agents, zones_by_id)
    b = rule_based_rationales(agents, zones_by_id)
    assert a == b
