"""Launch all four BuildProof Band sidecar agents in one process.

This is a convenience launcher for local development and demos. It boots
the lead judge plus the three specialists concurrently via asyncio, each
holding its own Band websocket connection.

Production deployments will usually run each agent in its own container
or process — this single-process launcher is provided so the full Audit
Court can be started with one command.

Usage:

    cd band_agents
    python run_all.py

Ctrl+C exits all four agents cleanly.

Requires the same setup as the individual scripts:
    - agent_config.yaml with all four role blocks
    - ANTHROPIC_API_KEY in environment or band_agents/.env
"""
from __future__ import annotations

import asyncio

from _runtime import run_agent

ROLES: list[tuple[str, str]] = [
    ("lead_judge", "BuildProofLeadJudge"),
    ("claim_prosecutor", "BuildProofClaimProsecutor"),
    ("evidence_defender", "BuildProofEvidenceDefender"),
    ("repo_forensics", "BuildProofRepoForensics"),
]


async def _run_all() -> None:
    tasks: list[asyncio.Task[None]] = [
        asyncio.create_task(run_agent(key, name), name=name)
        for key, name in ROLES
    ]
    print(f"[run_all] launched {len(tasks)} Band agents — Ctrl+C to stop.")
    try:
        await asyncio.gather(*tasks)
    except asyncio.CancelledError:
        pass


def main() -> None:
    try:
        asyncio.run(_run_all())
    except KeyboardInterrupt:
        print("[run_all] shutdown requested.")


if __name__ == "__main__":
    main()
