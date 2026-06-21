"""BuildProof Audit Court — Claim Prosecutor sidecar agent.

Run from this directory:

    cd band_agents
    python claim_prosecutor.py

Requires:
    - agent_config.yaml with a ``claim_prosecutor`` block (agent_id + api_key)
    - ANTHROPIC_API_KEY in environment or band_agents/.env
"""
from _runtime import main


if __name__ == "__main__":
    main(agent_key="claim_prosecutor", display_name="BuildProofClaimProsecutor")
