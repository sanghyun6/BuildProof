"""Preflight checker for BuildProof Band agent configuration.

Reads agent_config.yaml and verifies:
  - Each required agent block is present (lead_judge, claim_prosecutor,
    evidence_defender, repo_forensics)
  - agent_id and api_key are non-empty and are not placeholder values
    (e.g. uuid-for-*, band-api-key-for-*)
  - ANTHROPIC_API_KEY is present in the environment or band_agents/.env

Does NOT attempt a live Band connection.  If the config shape passes, run
the individual agent scripts to confirm live auth.

Prints only masked values — never raw secrets.
"""
from __future__ import annotations

import os
import sys
from pathlib import Path

import yaml
from dotenv import load_dotenv

_HERE = Path(__file__).resolve().parent
_CONFIG_PATH = _HERE / "agent_config.yaml"

REQUIRED_AGENTS: list[str] = [
    "lead_judge",
    "claim_prosecutor",
    "evidence_defender",
    "repo_forensics",
]

PLACEHOLDER_PREFIXES: tuple[str, ...] = (
    "uuid-for-",
    "band-api-key-for-",
    "@your-band-handle",
)


def _mask(value: str) -> str:
    if len(value) <= 8:
        return "****"
    return value[:4] + "****" + value[-4:]


def _is_placeholder(value: str) -> bool:
    low = value.lower()
    return any(low.startswith(p) for p in PLACEHOLDER_PREFIXES)


def check_config() -> bool:
    """Return True if every agent block has non-placeholder credentials."""
    if not _CONFIG_PATH.exists():
        print(f"[ERROR]   {_CONFIG_PATH.name} not found in {_HERE}.")
        print("          Copy agent_config.yaml.example → agent_config.yaml and fill in credentials.")
        return False

    try:
        with open(_CONFIG_PATH, encoding="utf-8") as f:
            config = yaml.safe_load(f) or {}
    except Exception as exc:
        print(f"[ERROR]   Failed to parse {_CONFIG_PATH.name}: {exc}")
        return False

    all_ok = True
    for agent_key in REQUIRED_AGENTS:
        block = config.get(agent_key, {})
        if not block:
            print(f"[MISSING] '{agent_key}' block not found in agent_config.yaml")
            all_ok = False
            continue

        agent_id = (block.get("agent_id") or "").strip()
        api_key = (block.get("api_key") or "").strip()
        issues: list[str] = []

        if not agent_id:
            issues.append("agent_id is empty")
        elif _is_placeholder(agent_id):
            issues.append(f"agent_id is a placeholder ({_mask(agent_id)})")

        if not api_key:
            issues.append("api_key is empty")
        elif _is_placeholder(api_key):
            issues.append(f"api_key is a placeholder ({_mask(api_key)})")

        if issues:
            print(f"[INVALID] {agent_key}: {'; '.join(issues)}")
            all_ok = False
        else:
            print(
                f"[OK]      {agent_key:<22} "
                f"agent_id={_mask(agent_id)}  api_key={_mask(api_key)}"
            )

    return all_ok


def check_anthropic_key() -> bool:
    """Return True if ANTHROPIC_API_KEY is set (value is never printed)."""
    load_dotenv(_HERE / ".env")
    load_dotenv()
    key = os.environ.get("ANTHROPIC_API_KEY", "").strip()
    if key:
        print("[OK]      ANTHROPIC_API_KEY is set")
        return True
    print("[MISSING] ANTHROPIC_API_KEY is not set")
    print("          Add it to band_agents/.env or export it in your shell.")
    return False


def main() -> None:
    print("=== BuildProof Band Setup Check ===")
    print(f"Config: {_CONFIG_PATH}")
    print()

    config_ok = check_config()
    print()
    key_ok = check_anthropic_key()
    print()

    if config_ok and key_ok:
        print("[PASS] Config shape looks like real credentials.")
        print()
        print("Live Band auth has NOT been verified here — that requires a network call.")
        print("To confirm the connection, run one agent and watch for errors within ~5 s:")
        print()
        print("  cd band_agents && source .venv/bin/activate")
        print("  python lead_judge.py")
        print()
        print("If Band rejects the credentials you will see a WebSocket error or")
        print("HTTP 401 within a few seconds of the 'attempting Band connection' line.")
    else:
        print("[FAIL] Config is incomplete or still contains placeholder values.")
        print("       Fix the issues above before running any Band agent.")
        sys.exit(1)


if __name__ == "__main__":
    main()
