"""BuildProof Audit Court — Repo Forensics sidecar agent.

Run from this directory:

    cd band_agents
    python repo_forensics.py

Requires:
    - agent_config.yaml with a ``repo_forensics`` block (agent_id + api_key)
    - ANTHROPIC_API_KEY in environment or band_agents/.env
"""
from _runtime import main


if __name__ == "__main__":
    main(agent_key="repo_forensics", display_name="BuildProofRepoForensics")
