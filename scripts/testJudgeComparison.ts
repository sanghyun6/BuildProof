/**
 * Inline tests for pipeline/compareJudges.ts — no network, no API keys.
 * Run with: npx tsx scripts/testJudgeComparison.ts
 */

import {
  buildComparison,
  checkComparisonEligibility,
  compareJudges,
  runJudgeProvider,
} from "../pipeline/compareJudges";
import type {
  JudgeComparisonProviderResult,
  VerdictLabel,
} from "../types/pipeline";
import type {
  LLMClaimJudge,
  LLMJudgeInput,
  LLMJudgeResult,
} from "../adapters/llm/types";

let passed = 0;
let failed = 0;

function expect(label: string, cond: boolean, detail?: string) {
  if (cond) {
    console.log(`  PASS  ${label}`);
    passed++;
  } else {
    console.error(`  FAIL  ${label}${detail ? `\n        ${detail}` : ""}`);
    failed++;
  }
}

function withEnv<T>(env: Record<string, string | undefined>, fn: () => T): T {
  const saved: Record<string, string | undefined> = {};
  for (const [k, v] of Object.entries(env)) {
    saved[k] = process.env[k];
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
  try {
    return fn();
  } finally {
    for (const [k, v] of Object.entries(saved)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  }
}

function fakeJudge(result: LLMJudgeResult | null, throwIt = false): LLMClaimJudge {
  return {
    async judgeClaims(_input: LLMJudgeInput): Promise<LLMJudgeResult | null> {
      if (throwIt) throw new Error("fake judge thrown");
      return result;
    },
  };
}

const SAMPLE_INPUT: LLMJudgeInput = {
  claims: [
    { id: "c1", detector: "mcp", claim: "uses MCP", score: 60, evidence: [] },
    { id: "c2", detector: "rag", claim: "uses RAG", score: 30, evidence: [] },
    {
      id: "c3",
      detector: "multi-agent",
      claim: "multi-agent system",
      score: 80,
      evidence: [],
    },
  ],
  scanSource: "github-api",
  repoUnavailable: false,
};

const CLAIM_META = SAMPLE_INPUT.claims.map((c) => ({
  id: c.id,
  claim: c.claim,
  detector: c.detector,
}));

// --- Eligibility tests ---

console.log("\n— checkComparisonEligibility —");

expect(
  "disabled by default",
  withEnv(
    { JUDGE_COMPARISON: undefined, ANTHROPIC_API_KEY: "a", TOKENROUTER_API_KEY: "t" },
    () => {
      const r = checkComparisonEligibility(3);
      return !r.eligible && r.reason === "disabled";
    },
  ),
);

expect(
  "JUDGE_COMPARISON=off → disabled",
  withEnv(
    { JUDGE_COMPARISON: "off", ANTHROPIC_API_KEY: "a", TOKENROUTER_API_KEY: "t" },
    () => {
      const r = checkComparisonEligibility(3);
      return !r.eligible && r.reason === "disabled";
    },
  ),
);

expect(
  "on + both keys + claims → eligible",
  withEnv(
    { JUDGE_COMPARISON: "on", ANTHROPIC_API_KEY: "a", TOKENROUTER_API_KEY: "t" },
    () => {
      const r = checkComparisonEligibility(3);
      return r.eligible;
    },
  ),
);

expect(
  "on + missing anthropic → not eligible",
  withEnv(
    { JUDGE_COMPARISON: "on", ANTHROPIC_API_KEY: undefined, TOKENROUTER_API_KEY: "t" },
    () => {
      const r = checkComparisonEligibility(3);
      return !r.eligible && r.reason === "missing-anthropic-key";
    },
  ),
);

expect(
  "on + missing tokenrouter → not eligible",
  withEnv(
    { JUDGE_COMPARISON: "on", ANTHROPIC_API_KEY: "a", TOKENROUTER_API_KEY: undefined },
    () => {
      const r = checkComparisonEligibility(3);
      return !r.eligible && r.reason === "missing-tokenrouter-key";
    },
  ),
);

expect(
  "on + 0 claims → not eligible",
  withEnv(
    { JUDGE_COMPARISON: "on", ANTHROPIC_API_KEY: "a", TOKENROUTER_API_KEY: "t" },
    () => {
      const r = checkComparisonEligibility(0);
      return !r.eligible && r.reason === "no-claims";
    },
  ),
);

expect(
  "on + case insensitive (ON) → eligible",
  withEnv(
    { JUDGE_COMPARISON: "ON", ANTHROPIC_API_KEY: "a", TOKENROUTER_API_KEY: "t" },
    () => {
      const r = checkComparisonEligibility(1);
      return r.eligible;
    },
  ),
);

// --- buildComparison tests ---

console.log("\n— buildComparison —");

function pr(
  provider: "anthropic" | "tokenrouter",
  verdicts: Array<{ id: string; verdict: VerdictLabel; rationale?: string }> | null,
  failureReason?: string,
): JudgeComparisonProviderResult {
  return {
    provider,
    model: provider === "anthropic" ? "claude-test" : "MiniMax-test",
    verdicts,
    durationMs: 100,
    ...(failureReason ? { failureReason } : {}),
  };
}

{
  const a = pr("anthropic", [
    { id: "c1", verdict: "Strongly supported", rationale: "a-rationale-1" },
    { id: "c2", verdict: "README-only claim" },
    { id: "c3", verdict: "Strongly supported" },
  ]);
  const t = pr("tokenrouter", [
    { id: "c1", verdict: "Strongly supported", rationale: "t-rationale-1" },
    { id: "c2", verdict: "README-only claim" },
    { id: "c3", verdict: "Strongly supported" },
  ]);
  const comp = buildComparison(a, t, CLAIM_META);
  expect("100% agreement", comp.agreementRate === 100, `got ${comp.agreementRate}`);
  expect("agreedCount=3, comparedCount=3", comp.agreedCount === 3 && comp.comparedCount === 3);
  expect("status=success", comp.status === "success");
  expect("no disagreements", comp.disagreements.length === 0);
}

{
  const a = pr("anthropic", [
    { id: "c1", verdict: "Strongly supported" },
    { id: "c2", verdict: "README-only claim" },
    { id: "c3", verdict: "Strongly supported" },
  ]);
  const t = pr("tokenrouter", [
    { id: "c1", verdict: "Partially supported" },
    { id: "c2", verdict: "README-only claim" },
    { id: "c3", verdict: "Unsupported by repository evidence" },
  ]);
  const comp = buildComparison(a, t, CLAIM_META);
  expect(
    "33% agreement (1/3 agree)",
    comp.agreementRate === 33,
    `got ${comp.agreementRate}`,
  );
  expect("2 disagreements", comp.disagreements.length === 2);
  expect(
    "disagreement carries both verdicts",
    comp.disagreements[0].anthropicVerdict === "Strongly supported" &&
      comp.disagreements[0].tokenrouterVerdict === "Partially supported",
  );
  expect(
    "disagreement carries claim/detector metadata",
    comp.disagreements[0].claim === "uses MCP" &&
      comp.disagreements[0].detector === "mcp",
  );
}

{
  const a = pr("anthropic", null, "no-result");
  const t = pr("tokenrouter", [{ id: "c1", verdict: "Strongly supported" }]);
  const comp = buildComparison(a, t, CLAIM_META);
  expect("partial status when anthropic null", comp.status === "partial");
  expect("agreementRate null in partial", comp.agreementRate === null);
  expect("no disagreements computed in partial", comp.disagreements.length === 0);
  expect(
    "anthropic verdicts remain null",
    comp.anthropic.verdicts === null && comp.anthropic.failureReason === "no-result",
  );
}

{
  const a = pr("anthropic", null, "judge-threw");
  const t = pr("tokenrouter", null, "no-result");
  const comp = buildComparison(a, t, CLAIM_META);
  expect("failed status when both null", comp.status === "failed");
  expect("notes set on failed", typeof comp.notes === "string");
}

// --- runJudgeProvider tests ---

console.log("\n— runJudgeProvider —");

(async () => {
  {
    const judge = fakeJudge({
      judgements: [
        { id: "c1", verdict: "Strongly supported", rationale: "ok" },
        { id: "c2", verdict: "README-only claim" },
        { id: "c3", verdict: "Partially supported" },
      ],
    });
    const r = await runJudgeProvider("anthropic", SAMPLE_INPUT, { anthropic: judge });
    expect(
      "runJudgeProvider returns verdicts",
      r.verdicts !== null && r.verdicts.length === 3,
    );
    expect("provider tag matches", r.provider === "anthropic");
    expect("durationMs present", typeof r.durationMs === "number");
  }
  {
    const judge = fakeJudge(null);
    const r = await runJudgeProvider("tokenrouter", SAMPLE_INPUT, { tokenrouter: judge });
    expect("null result becomes failureReason=no-result", r.failureReason === "no-result");
    expect("verdicts null", r.verdicts === null);
  }
  {
    const judge = fakeJudge(null, true);
    const r = await runJudgeProvider("anthropic", SAMPLE_INPUT, { anthropic: judge });
    expect("thrown judge becomes failureReason=judge-threw", r.failureReason === "judge-threw");
    expect("verdicts null on throw", r.verdicts === null);
  }

  // --- compareJudges (parallel runner) tests ---

  console.log("\n— compareJudges (parallel) —");

  {
    const aJudge = fakeJudge({
      judgements: [
        { id: "c1", verdict: "Strongly supported" },
        { id: "c2", verdict: "README-only claim" },
        { id: "c3", verdict: "Partially supported" },
      ],
    });
    const tJudge = fakeJudge({
      judgements: [
        { id: "c1", verdict: "Strongly supported" },
        { id: "c2", verdict: "Unsupported by repository evidence" },
        { id: "c3", verdict: "Partially supported" },
      ],
    });
    const comp = await compareJudges(SAMPLE_INPUT, CLAIM_META, {
      anthropic: aJudge,
      tokenrouter: tJudge,
    });
    expect(
      "67% agreement (2/3)",
      comp.agreementRate === 67,
      `got ${comp.agreementRate}`,
    );
    expect("1 disagreement", comp.disagreements.length === 1);
  }

  {
    const aJudge = fakeJudge(null);
    const tJudge = fakeJudge({
      judgements: [{ id: "c1", verdict: "Strongly supported" }],
    });
    const comp = await compareJudges(SAMPLE_INPUT, CLAIM_META, {
      anthropic: aJudge,
      tokenrouter: tJudge,
    });
    expect("partial when anthropic null", comp.status === "partial");
  }

  {
    const aJudge = fakeJudge(null, true);
    const tJudge = fakeJudge(null, true);
    const comp = await compareJudges(SAMPLE_INPUT, CLAIM_META, {
      anthropic: aJudge,
      tokenrouter: tJudge,
    });
    expect("failed when both throw", comp.status === "failed");
  }

  console.log(`\n${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
})();
