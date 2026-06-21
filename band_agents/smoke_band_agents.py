"""Smoke test for BuildProof Band sidecar agents.

Tests each agent script one at a time with a short timeout so you can
distinguish between the five common failure modes:

  DEPENDENCY_MISSING  — Python package not installed (ImportError)
  NO_ANTHROPIC_KEY    — ANTHROPIC_API_KEY absent or empty
  PLACEHOLDER_CONFIG  — agent_config.yaml still has placeholder values
  BAND_AUTH_FAILED    — Band returned 401 / Forbidden (bad credentials)
  ERROR_DURING_RUN    — unclassified traceback during startup
  LIKELY_RUNNING      — no error within the timeout → agent is up

A successful Band agent runs forever, so a 12-second timeout with no
traceback or non-zero exit is treated as "likely running / connected".

Secrets are never printed — any output that looks like a key or UUID is
redacted before being shown to you.
"""
from __future__ import annotations

import re
import subprocess
import sys
import time
from pathlib import Path

_HERE = Path(__file__).resolve().parent
_VENV_PYTHON = _HERE / ".venv" / "bin" / "python"

AGENTS: list[tuple[str, str]] = [
    ("lead_judge.py", "BuildProofLeadJudge"),
    ("claim_prosecutor.py", "BuildProofClaimProsecutor"),
    ("evidence_defender.py", "BuildProofEvidenceDefender"),
    ("repo_forensics.py", "BuildProofRepoForensics"),
]

TIMEOUT_S: int = 12

# Outcome labels ordered from most-specific to least-specific
_OUTCOMES = {
    "LIKELY_RUNNING": "✓ (timed out cleanly — likely connected)",
    "EXITED_CLEAN": "✓ (exited 0)",
    "DEPENDENCY_MISSING": "✗ missing Python dependency",
    "NO_ANTHROPIC_KEY": "✗ ANTHROPIC_API_KEY not set",
    "PLACEHOLDER_CONFIG": "✗ agent_config.yaml still has placeholder values",
    "BAND_AUTH_FAILED": "✗ Band returned 401 / Forbidden",
    "ERROR_DURING_RUN": "✗ error during startup (see stderr preview above)",
    "EXITED_WITH_ERROR": "✗ exited with non-zero status",
}


def _redact(text: str) -> str:
    """Strip anything that looks like a secret before showing it to the user."""
    text = re.sub(r"sk-ant-[A-Za-z0-9\-_]+", "sk-ant-****", text)
    text = re.sub(
        r"[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}",
        "****-uuid-****",
        text,
        flags=re.IGNORECASE,
    )
    return text


def _classify(stdout: str, stderr: str, returncode: int | None) -> str:
    combined = (stdout + "\n" + stderr).lower()

    if "importerror" in combined or "modulenotfounderror" in combined:
        return "DEPENDENCY_MISSING"

    if ("anthropic_api_key" in combined and ("not set" in combined or "missing" in combined)) or (
        "add it to band_agents/.env" in combined
    ):
        return "NO_ANTHROPIC_KEY"

    if (
        "placeholder" in combined
        or "uuid-for-" in combined
        or "band-api-key-for-" in combined
    ):
        return "PLACEHOLDER_CONFIG"

    if "401" in combined or "unauthorized" in combined or "forbidden" in combined:
        return "BAND_AUTH_FAILED"

    if returncode is not None and returncode != 0:
        if "traceback" in combined or "error" in combined:
            return "ERROR_DURING_RUN"
        return "EXITED_WITH_ERROR"

    if returncode is None:
        # timed out — if there's an error in the output it's during startup
        if "traceback" in combined:
            return "ERROR_DURING_RUN"
        return "LIKELY_RUNNING"

    return "EXITED_CLEAN"


def _smoke_one(script: str, display_name: str) -> str:
    python = str(_VENV_PYTHON) if _VENV_PYTHON.exists() else sys.executable
    print(f"  [{display_name}] launching (timeout={TIMEOUT_S}s)...")
    try:
        result = subprocess.run(
            [python, script],
            cwd=str(_HERE),
            capture_output=True,
            text=True,
            timeout=TIMEOUT_S,
        )
        stdout = _redact(result.stdout)
        stderr = _redact(result.stderr)
        outcome = _classify(stdout, stderr, result.returncode)
        if outcome not in ("LIKELY_RUNNING", "EXITED_CLEAN") and stderr.strip():
            preview = "\n    ".join(_redact(stderr).splitlines()[:3])
            print(f"    stderr: {preview}")
        return outcome
    except subprocess.TimeoutExpired as exc:
        stdout = _redact(exc.stdout or "")
        stderr = _redact(exc.stderr or "")
        return _classify(stdout, stderr, None)


def main() -> None:
    print("=== BuildProof Band Smoke Test ===")
    print(f"Each agent is tested with a {TIMEOUT_S}s timeout.")
    print("Timeout + no traceback = 'LIKELY_RUNNING' (agent connected to Band).")
    print()

    results: list[tuple[str, str, str]] = []
    for script, display_name in AGENTS:
        outcome = _smoke_one(script, display_name)
        label = _OUTCOMES.get(outcome, f"? {outcome}")
        print(f"  {label}  [{display_name}]")
        print()
        results.append((script, display_name, outcome))

    passing = {"LIKELY_RUNNING", "EXITED_CLEAN"}
    ok = [r for r in results if r[2] in passing]
    fail = [r for r in results if r[2] not in passing]

    if not fail:
        print(f"[PASS] All {len(results)} agents appear to be running.")
    else:
        print(f"[PARTIAL/FAIL] {len(ok)}/{len(results)} agents appear to be running.")
        for _, name, outcome in fail:
            print(f"  {name}: {outcome}")
        sys.exit(1)


if __name__ == "__main__":
    main()
