"""Shared runtime for BuildProof Band sidecar agents.

Each agent script in this directory (lead_judge.py, claim_prosecutor.py,
evidence_defender.py, repo_forensics.py) is a thin wrapper that calls
``main(agent_key, display_name)`` from this module.

Credentials for the four Band agents are loaded from ``agent_config.yaml``
via the official ``band.config.load_agent_config`` helper. The Anthropic
API key used by ``AnthropicAdapter`` is read from the process environment
or, if absent, from ``band_agents/.env`` via python-dotenv.

The four agent_keys expected in agent_config.yaml are:
    lead_judge, claim_prosecutor, evidence_defender, repo_forensics

Secrets are never logged or echoed. Missing config and missing env vars
both exit with a clear human message and a non-zero status.
"""
from __future__ import annotations

import asyncio
import os
import sys
from pathlib import Path

from dotenv import load_dotenv

from band import Agent
from band.adapters.anthropic import AnthropicAdapter
from band.config import load_agent_config

_HERE = Path(__file__).resolve().parent
_CONFIG_PATH = _HERE / "agent_config.yaml"
_PROMPTS_DIR = _HERE / "prompts"
DEFAULT_MODEL = "claude-sonnet-4-5-20250929"


def _load_env() -> None:
    load_dotenv(_HERE / ".env")
    load_dotenv()


def _require_anthropic_key() -> str:
    key = os.environ.get("ANTHROPIC_API_KEY", "").strip()
    if not key:
        sys.exit(
            "ANTHROPIC_API_KEY is not set. Add it to band_agents/.env or "
            "export it in your shell before starting this agent."
        )
    return key


def _load_prompt(agent_key: str) -> str:
    prompt_file = _PROMPTS_DIR / f"{agent_key}.md"
    if not prompt_file.exists():
        sys.exit(f"Prompt file not found: {prompt_file}")
    return prompt_file.read_text(encoding="utf-8")


def _load_band_credentials(agent_key: str) -> tuple[str, str]:
    if not _CONFIG_PATH.exists():
        sys.exit(
            f"{_CONFIG_PATH.name} not found in {_HERE}. "
            "Copy agent_config.yaml.example to agent_config.yaml and paste the "
            "agent_id / api_key Band gave you for each role."
        )
    try:
        return load_agent_config(agent_key, config_path=_CONFIG_PATH)
    except Exception as exc:  # noqa: BLE001 — surface any loader error verbatim
        sys.exit(
            f"Failed to load Band credentials for '{agent_key}' from "
            f"{_CONFIG_PATH.name}: {exc}"
        )


def build_agent(agent_key: str, *, model: str = DEFAULT_MODEL) -> Agent:
    """Construct (but do not run) a Band Agent for one BuildProof role."""
    _load_env()
    anthropic_key = _require_anthropic_key()
    prompt = _load_prompt(agent_key)
    agent_id, api_key = _load_band_credentials(agent_key)

    adapter = AnthropicAdapter(
        model=model,
        provider_key=anthropic_key,
        prompt=prompt,
    )
    return Agent.create(adapter=adapter, agent_id=agent_id, api_key=api_key)


async def run_agent(agent_key: str, display_name: str) -> None:
    """Build and run one Band Agent until interrupted."""
    agent = build_agent(agent_key)
    print(f"[{display_name}] starting — attempting Band connection as '{agent_key}'...")
    await agent.start()
    print(f"[{display_name}] running — waiting for Band messages.")
    try:
        await agent.run_forever()
    finally:
        await agent.stop(timeout=30.0)


def main(agent_key: str, display_name: str) -> None:
    """Synchronous entry point used by each agent script."""
    try:
        asyncio.run(run_agent(agent_key, display_name))
    except KeyboardInterrupt:
        print(f"[{display_name}] shutdown requested.")
