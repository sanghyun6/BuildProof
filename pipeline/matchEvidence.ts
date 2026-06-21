import type { Claim, ClaimWithEvidence, DetectorResult } from "../types/pipeline";

export function matchEvidence(
  claims: Claim[],
  detectorResults: DetectorResult[]
): ClaimWithEvidence[] {
  const evidenceMap = new Map<string, DetectorResult>();
  for (const result of detectorResults) {
    evidenceMap.set(result.claimId, result);
  }

  return claims.map((claim) => ({
    id: claim.id,
    detector: claim.detector,
    claim: claim.text,
    evidence: evidenceMap.get(claim.id)?.evidence ?? [],
  }));
}
