"""BuildProof Audit Court — Lead Judge sidecar agent.

Run from this directory:

    cd band_agents
    python lead_judge.py

Requires:
    - agent_config.yaml with a ``lead_judge`` block (agent_id + api_key)
    - ANTHROPIC_API_KEY in environment or band_agents/.env
"""
from _runtime import main


if __name__ == "__main__":
    main(agent_key="lead_judge", display_name="BuildProofLeadJudge")
