// ── Claim Extractor ──────────────────────────────────────────────────────────

export type LLMClaimCategory = "multi-agent" | "mcp" | "rag" | "realtime" | "voice" | "cv";

export interface LLMExtractedClaim {
  category: LLMClaimCategory;
  claimText: string;
}

export interface LLMClaimExtractorInput {
  projectText: string;
}

export interface LLMClaimExtractorResult {
  claims: LLMExtractedClaim[];
}

/** Returns null to signal "use keyword fallback". */
export interface LLMClaimExtractor {
  extractClaims(input: LLMClaimExtractorInput): Promise<LLMClaimExtractorResult | null>;
}

// ── Claim Judge ───────────────────────────────────────────────────────────────

export const VALID_VERDICT_LABELS = [
  "Strongly supported",
  "Partially supported",
  "README-only claim",
  "Unsupported by repository evidence",
  "No implementation evidence found",
] as const;

export type LLMVerdictLabel = (typeof VALID_VERDICT_LABELS)[number];

export interface LLMJudgeInputClaim {
  id: string;
  detector: string;
  claim: string;
  score: number;
  evidence: Array<{ text: string; source: string; positive: boolean }>;
}

export interface LLMJudgeInput {
  claims: LLMJudgeInputClaim[];
  scanSource: string;
  repoUnavailable: boolean;
}

export interface LLMJudgedClaim {
  id: string;
  verdict: LLMVerdictLabel;
  rationale?: string;
}

export interface LLMJudgeResult {
  judgements: LLMJudgedClaim[];
}

/** Returns null to signal "use deterministic fallback". */
export interface LLMClaimJudge {
  judgeClaims(input: LLMJudgeInput): Promise<LLMJudgeResult | null>;
}
