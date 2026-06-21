import type { ClaimWithEvidence, Evidence, ScoredClaim } from "../types/pipeline";

// Source-type weights encode how reliably each evidence type proves real implementation.
// Ordering mirrors the architecture rule: code > config > file path > docs > nothing.
const POSITIVE_WEIGHTS: Record<Evidence["source"], number> = {
  source_file: 5, // actual code using the technology — strongest signal
  package_json: 4, // declared dependency — strong intent signal
  file_tree: 2, // matching filename — moderate structural signal
  readme: 1, // self-reported doc mention — weakest, easiest to fabricate
  absence: 0, // absence items are never positive; weight is irrelevant but must be defined
};

// Each negative (absence / missing-signal) item adds this much to the denominator,
// diluting the score proportionally without flooring to zero on the first missing signal.
// A value of 1 means one absence item has the same diluting force as losing one "readme" point.
const NEGATIVE_DENOMINATOR_WEIGHT = 1;

export function scoreAuthenticity(claims: ClaimWithEvidence[]): ScoredClaim[] {
  return claims.map((c) => {
    // Sum weights for positive evidence items only.
    const positivePoints = c.evidence
      .filter((e) => e.positive)
      .reduce((sum, e) => sum + POSITIVE_WEIGHTS[e.source], 0);

    // Each negative item dilutes the score by expanding the denominator.
    // This keeps mixed evidence in a middle range instead of collapsing to 0 or 100.
    const negativeCount = c.evidence.filter((e) => !e.positive).length;
    const denominator = positivePoints + negativeCount * NEGATIVE_DENOMINATOR_WEIGHT;

    const score = denominator === 0 ? 0 : Math.round((positivePoints / denominator) * 100);

    return { ...c, score };
  });
}
