"""BuildProof Audit Court — Evidence Defender sidecar agent.

Run from this directory:

    cd band_agents
    python evidence_defender.py

Requires:
    - agent_config.yaml with an ``evidence_defender`` block (agent_id + api_key)
    - ANTHROPIC_API_KEY in environment or band_agents/.env
"""
from _runtime import main


if __name__ == "__main__":
    main(agent_key="evidence_defender", display_name="BuildProofEvidenceDefender")
