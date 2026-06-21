import type {
  JudgeComparison,
  JudgeComparisonDisagreement,
  JudgeComparisonProvider,
  JudgeComparisonProviderResult,
  VerdictLabel,
} from "../types/pipeline";
import type { LLMClaimJudge, LLMJudgeInput, LLMJudgeResult } from "../adapters/llm/types";
import { anthropicClaimJudge } from "../adapters/llm/anthropicClaimJudge";
import { tokenrouterClaimJudge } from "../adapters/llm/tokenrouterClaimJudge";
import { tokenRouterModel } from "../lib/tokenRouterClient";

export const ANTHROPIC_JUDGE_MODEL = "claude-haiku-4-5-20251001";

export interface ClaimMeta {
  id: string;
  claim: string;
  detector: string;
}

export type ComparisonEligibility =
  | { eligible: true }
  | {
      eligible: false;
      reason:
        | "disabled"
        | "missing-anthropic-key"
        | "missing-tokenrouter-key"
        | "no-claims";
    };

export function checkComparisonEligibility(claimCount: number): ComparisonEligibility {
  const enabled = (process.env.JUDGE_COMPARISON ?? "off").toLowerCase() === "on";
  if (!enabled) return { eligible: false, reason: "disabled" };
  if (claimCount === 0) return { eligible: false, reason: "no-claims" };
  if (!process.env.ANTHROPIC_API_KEY) {
    return { eligible: false, reason: "missing-anthropic-key" };
  }
  if (!process.env.TOKENROUTER_API_KEY) {
    return { eligible: false, reason: "missing-tokenrouter-key" };
  }
  return { eligible: true };
}

export async function runJudgeProvider(
  provider: JudgeComparisonProvider,
  input: LLMJudgeInput,
  judges: { anthropic?: LLMClaimJudge; tokenrouter?: LLMClaimJudge } = {},
): Promise<JudgeComparisonProviderResult> {
  const judge =
    provider === "anthropic"
      ? (judges.anthropic ?? anthropicClaimJudge)
      : (judges.tokenrouter ?? tokenrouterClaimJudge);
  const model = provider === "anthropic" ? ANTHROPIC_JUDGE_MODEL : tokenRouterModel();

  const start = Date.now();
  let result: LLMJudgeResult | null = null;
  let threw = false;
  try {
    result = await judge.judgeClaims(input);
  } catch {
    threw = true;
  }
  const durationMs = Date.now() - start;

  if (threw) {
    return { provider, model, verdicts: null, durationMs, failureReason: "judge-threw" };
  }
  if (result === null) {
    return { provider, model, verdicts: null, durationMs, failureReason: "no-result" };
  }
  return {
    provider,
    model,
    verdicts: result.judgements.map((j) => ({
      id: j.id,
      verdict: j.verdict as VerdictLabel,
      ...(j.rationale ? { rationale: j.rationale } : {}),
    })),
    durationMs,
  };
}

export function buildComparison(
  anthropic: JudgeComparisonProviderResult,
  tokenrouter: JudgeComparisonProviderResult,
  claimMeta: ClaimMeta[],
): JudgeComparison {
  const anthropicOk = anthropic.verdicts !== null;
  const tokenrouterOk = tokenrouter.verdicts !== null;

  if (!anthropicOk && !tokenrouterOk) {
    return {
      status: "failed",
      anthropic,
      tokenrouter,
      agreementRate: null,
      agreedCount: 0,
      comparedCount: 0,
      disagreements: [],
      notes: "Both providers failed — no comparison possible",
    };
  }

  if (!anthropicOk || !tokenrouterOk) {
    return {
      status: "partial",
      anthropic,
      tokenrouter,
      agreementRate: null,
      agreedCount: 0,
      comparedCount: 0,
      disagreements: [],
      notes: anthropicOk
        ? "TokenRouter judge did not return — partial comparison only"
        : "Anthropic judge did not return — partial comparison only",
    };
  }

  const aMap = new Map(anthropic.verdicts!.map((v) => [v.id, v]));
  const tMap = new Map(tokenrouter.verdicts!.map((v) => [v.id, v]));
  const metaMap = new Map(claimMeta.map((m) => [m.id, m]));

  let agreedCount = 0;
  let comparedCount = 0;
  const disagreements: JudgeComparisonDisagreement[] = [];

  for (const meta of claimMeta) {
    const a = aMap.get(meta.id);
    const t = tMap.get(meta.id);
    if (!a || !t) continue;
    comparedCount++;
    if (a.verdict === t.verdict) {
      agreedCount++;
      continue;
    }
    const m = metaMap.get(meta.id) ?? meta;
    disagreements.push({
      claimId: meta.id,
      claim: m.claim,
      detector: m.detector,
      anthropicVerdict: a.verdict,
      tokenrouterVerdict: t.verdict,
      ...(a.rationale ? { anthropicRationale: a.rationale } : {}),
      ...(t.rationale ? { tokenrouterRationale: t.rationale } : {}),
    });
  }

  const agreementRate =
    comparedCount === 0 ? null : Math.round((agreedCount / comparedCount) * 100);

  return {
    status: "success",
    anthropic,
    tokenrouter,
    agreementRate,
    agreedCount,
    comparedCount,
    disagreements,
  };
}

/**
 * Run both providers in parallel against the same input and assemble a comparison.
 * Used by tests and stand-alone callers. The production pipeline reuses the primary
 * judge result (see `judgeClaims.ts`) so the active provider is never called twice.
 */
export async function compareJudges(
  input: LLMJudgeInput,
  claimMeta: ClaimMeta[],
  judges: { anthropic?: LLMClaimJudge; tokenrouter?: LLMClaimJudge } = {},
): Promise<JudgeComparison> {
  const [anthropicSettled, tokenrouterSettled] = await Promise.allSettled([
    runJudgeProvider("anthropic", input, judges),
    runJudgeProvider("tokenrouter", input, judges),
  ]);

  const anthropic =
    anthropicSettled.status === "fulfilled"
      ? anthropicSettled.value
      : {
          provider: "anthropic" as const,
          model: ANTHROPIC_JUDGE_MODEL,
          verdicts: null,
          failureReason: "judge-threw",
        };
  const tokenrouter =
    tokenrouterSettled.status === "fulfilled"
      ? tokenrouterSettled.value
      : {
          provider: "tokenrouter" as const,
          model: tokenRouterModel(),
          verdicts: null,
          failureReason: "judge-threw",
        };

  return buildComparison(anthropic, tokenrouter, claimMeta);
}
