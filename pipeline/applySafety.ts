import type { ClaimVerdict, Evidence } from "../types/pipeline";

const BANNED_WORDS = ["fake", "lying", "scam", "fraud", "deceptive"] as const;

function sanitize(text: string): string {
  let result = text;
  for (const word of BANNED_WORDS) {
    result = result.replace(new RegExp(word, "gi"), "[removed]");
  }
  return result;
}

function sanitizeEvidence(e: Evidence): Evidence {
  return { ...e, text: sanitize(e.text) };
}

export function applySafety(verdicts: ClaimVerdict[]): ClaimVerdict[] {
  return verdicts.map((v) => ({
    ...v,
    claim: sanitize(v.claim),
    evidence: v.evidence.map(sanitizeEvidence),
    ...(v.rationale ? { rationale: sanitize(v.rationale) } : {}),
  }));
}
