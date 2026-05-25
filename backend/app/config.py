"""Runtime configuration. Loads .env if present; everything has sane defaults."""

from __future__ import annotations

import os
from pathlib import Path

from dotenv import load_dotenv

load_dotenv()

# Repo layout: backend/app/config.py -> backend/ -> repo root
BACKEND_DIR = Path(__file__).resolve().parent.parent
REPO_ROOT = BACKEND_DIR.parent
DATA_PROCESSED_DIR = REPO_ROOT / "data" / "processed"

# --- LLM provider (reasoning-agent layer) -------------------------------
# Provider-agnostic: prefer Anthropic if configured, else an OpenAI-compatible
# gateway ("feather"), else a clean rule-based fallback so the sim always runs.

# (a) Anthropic
ANTHROPIC_API_KEY: str | None = os.getenv("ANTHROPIC_API_KEY")
CLAUDE_MODEL: str = os.getenv("WATTIF_CLAUDE_MODEL", "claude-opus-4-7")

# (b) OpenAI-compatible gateway (e.g. "feather" multi-model key)
FEATHER_API_KEY: str | None = os.getenv("FEATHER_API_KEY")
FEATHER_BASE_URL: str | None = os.getenv("FEATHER_BASE_URL")
FEATHER_MODEL: str = os.getenv("FEATHER_MODEL", "gpt-4o-mini")

# (c) Scripted "demo" provider — deterministic, NO network. Default ON when no real key so
# the full agentic experience (planner tool-calling loop, auto+step) works end-to-end with no
# key. A real provider above takes precedence. Disable with WATTIF_DEMO_LLM=0.
DEMO_LLM: bool = os.getenv("WATTIF_DEMO_LLM", "1").lower() not in (
    "0",
    "false",
    "no",
    "off",
)

# How many agents get an LLM-generated rationale per request (kept small + cheap).
LLM_AGENT_SAMPLE: int = int(os.getenv("WATTIF_LLM_AGENT_SAMPLE", "8"))

# Sim
SECONDS_PER_TICK: float = float(os.getenv("WATTIF_TICK_SECONDS", "1.0"))
START_YEAR: int = int(os.getenv("WATTIF_START_YEAR", "2025"))
RANDOM_SEED: int = int(os.getenv("WATTIF_SEED", "42"))

# Synthetic data sizing
NUM_AGENTS: int = int(os.getenv("WATTIF_NUM_AGENTS", "3000"))

# CORS — Vite dev server
CORS_ORIGINS: list[str] = os.getenv(
    "WATTIF_CORS_ORIGINS",
    "http://localhost:5173,http://127.0.0.1:5173,http://localhost:4173",
).split(",")


def llm_provider() -> str | None:
    """Active provider: real key wins; else the scripted 'demo' provider (if enabled); else None."""
    if ANTHROPIC_API_KEY:
        return "anthropic"
    if FEATHER_API_KEY and FEATHER_BASE_URL:
        return "feather"
    if DEMO_LLM:
        return "demo"
    return None


def real_llm_provider() -> str | None:
    """A network-backed provider (Anthropic/feather), or None. Excludes the scripted demo."""
    p = llm_provider()
    return p if p in ("anthropic", "feather") else None


def llm_enabled() -> bool:
    """True when any provider (incl. scripted demo) is active (else pure rule-based)."""
    return llm_provider() is not None
