import type {
  ClaimVerdict,
  CompressionMetadataPublic,
  JudgeComparison,
  JudgeComparisonProviderResult,
  JudgeSource,
  ScanSource,
  ScoredClaim,
  VerdictLabel,
} from "../types/pipeline";
import { selectProvider } from "../adapters/llm/provider";
import { anthropicClaimJudge } from "../adapters/llm/anthropicClaimJudge";
import { tokenrouterClaimJudge } from "../adapters/llm/tokenrouterClaimJudge";
import type { LLMJudgeInput, LLMJudgeResult } from "../adapters/llm/types";
import { runCompression, selectCompressionMode } from "../adapters/compression/provider";
import {
  ANTHROPIC_JUDGE_MODEL,
  buildComparison,
  checkComparisonEligibility,
  runJudgeProvider,
} from "./compareJudges";
import { tokenRouterModel } from "../lib/tokenRouterClient";

function labelFromScore(score: number): VerdictLabel {
  if (score >= 76) return "Strongly supported";
  if (score >= 51) return "Partially supported";
  if (score >= 26) return "README-only claim";
  if (score >= 1) return "Unsupported by repository evidence";
  return "No implementation evidence found";
}

function deterministicJudge(scored: ScoredClaim[]): ClaimVerdict[] {
  return scored.map((c) => ({
    ...c,
    verdict: labelFromScore(c.score),
  }));
}

function applyLLMJudgements(
  scored: ScoredClaim[],
  judgements: Array<{ id: string; verdict: VerdictLabel; rationale?: string }>,
): ClaimVerdict[] {
  const verdictMap = new Map(judgements.map((j) => [j.id, j]));
  return scored.map((c) => {
    const judged = verdictMap.get(c.id);
    if (!judged) {
      // LLM omitted this claim — should not happen after validation, but fall back gracefully
      return { ...c, verdict: labelFromScore(c.score) };
    }
    return {
      ...c,
      verdict: judged.verdict,
      ...(judged.rationale ? { rationale: judged.rationale } : {}),
    };
  });
}

export interface JudgeClaimsResult {
  verdicts: ClaimVerdict[];
  source: JudgeSource;
  compression?: CompressionMetadataPublic;
  comparison?: JudgeComparison;
}

async function timedJudgeCall(
  judge: typeof anthropicClaimJudge,
  input: LLMJudgeInput,
): Promise<{ result: LLMJudgeResult | null; durationMs: number; threw: boolean }> {
  const start = Date.now();
  try {
    const result = await judge.judgeClaims(input);
    return { result, durationMs: Date.now() - start, threw: false };
  } catch {
    return { result: null, durationMs: Date.now() - start, threw: true };
  }
}

function primaryResultToProviderResult(
  primary: "anthropic" | "tokenrouter",
  result: LLMJudgeResult,
  durationMs: number,
): JudgeComparisonProviderResult {
  return {
    provider: primary,
    model: primary === "anthropic" ? ANTHROPIC_JUDGE_MODEL : tokenRouterModel(),
    verdicts: result.judgements.map((j) => ({
      id: j.id,
      verdict: j.verdict as VerdictLabel,
      ...(j.rationale ? { rationale: j.rationale } : {}),
    })),
    durationMs,
  };
}

export async function judgeClaims(
  scored: ScoredClaim[],
  scanSource: ScanSource,
): Promise<JudgeClaimsResult> {
  const provider = selectProvider();

  if (provider === "none") {
    return { verdicts: deterministicJudge(scored), source: "deterministic" };
  }

  if (scored.length === 0) {
    return { verdicts: [], source: "deterministic" };
  }

  const repoUnavailable = scanSource === "invalid-url" || scanSource === "unavailable";

  const rawJudgeInput: LLMJudgeInput = {
    claims: scored.map((c) => ({
      id: c.id,
      detector: c.detector,
      claim: c.claim,
      score: c.score,
      evidence: c.evidence.map((e) => ({
        text: e.text,
        source: e.source,
        positive: e.positive,
      })),
    })),
    scanSource,
    repoUnavailable,
  };

  let judgeInput = rawJudgeInput;
  let compression: CompressionMetadataPublic | undefined;
  try {
    const compressionMode = selectCompressionMode();
    if (compressionMode !== "off") {
      const { context } = await runCompression(rawJudgeInput);
      judgeInput = context.compressedInput;
      compression = context.metadata;
    }
  } catch {
    // Compression must never break the audit — fall back to raw input.
    judgeInput = rawJudgeInput;
    compression = undefined;
  }

  const claimMeta = scored.map((c) => ({ id: c.id, claim: c.claim, detector: c.detector }));
  const eligibility = checkComparisonEligibility(scored.length);

  // Primary judge call (captures both result + duration for optional comparison reuse).
  const primaryJudge = provider === "anthropic" ? anthropicClaimJudge : tokenrouterClaimJudge;
  const primary = await timedJudgeCall(primaryJudge, judgeInput);

  // Primary failed → deterministic fallback. Skip comparison in this path (safer/cheaper).
  if (primary.result === null) {
    return {
      verdicts: deterministicJudge(scored),
      source: "deterministic-fallback",
      ...(compression ? { compression } : {}),
    };
  }

  const verdicts = applyLLMJudgements(scored, primary.result.judgements);
  const source: JudgeSource =
    provider === "anthropic" ? "llm-anthropic" : "llm-tokenrouter";

  // Comparison only when eligible. Run only the secondary provider — primary result is reused.
  let comparison: JudgeComparison | undefined;
  if (eligibility.eligible) {
    const secondaryProvider = provider === "anthropic" ? "tokenrouter" : "anthropic";
    const secondaryResult = await runJudgeProvider(secondaryProvider, judgeInput);
    const primaryProviderResult = primaryResultToProviderResult(
      provider,
      primary.result,
      primary.durationMs,
    );
    const anthropicProviderResult =
      provider === "anthropic" ? primaryProviderResult : secondaryResult;
    const tokenrouterProviderResult =
      provider === "tokenrouter" ? primaryProviderResult : secondaryResult;
    comparison = buildComparison(
      anthropicProviderResult,
      tokenrouterProviderResult,
      claimMeta,
    );
  }

  return {
    verdicts,
    source,
    ...(compression ? { compression } : {}),
    ...(comparison ? { comparison } : {}),
  };
}
