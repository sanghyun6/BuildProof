import type {
  LLMClaimJudge,
  LLMJudgeInput,
  LLMJudgeResult,
  LLMJudgedClaim,
  LLMVerdictLabel,
} from "./types";
import { VALID_VERDICT_LABELS } from "./types";
import { callTokenRouter } from "../../lib/tokenRouterClient";

const VALID_LABEL_SET = new Set<string>(VALID_VERDICT_LABELS);

const SYSTEM_PROMPT = `You are an evidence-grounded audit tool for technical project claims. Your role is to assign a verdict label to each technical claim based ONLY on the evidence items provided by static code analysis.

You must not:
- Invent new evidence or assume files/dependencies exist that are not listed
- Search the internet or use knowledge about the repository beyond what is provided
- Make assumptions about implementation quality beyond what is stated in the evidence

Allowed verdict labels (use the exact strings):
- "Strongly supported" — dependency found AND source code implementation found
- "Partially supported" — some implementation evidence but not comprehensive
- "README-only claim" — claim appears in description text; no code or dependency evidence found
- "Unsupported by repository evidence" — weak signals only, or repository was not scanned
- "No implementation evidence found" — zero signals of any kind

Grounding rules you must follow:
1. If repo_unavailable is true, verdict must be "Unsupported by repository evidence" or "No implementation evidence found".
2. If all evidence items for a claim have positive=false, verdict must be "README-only claim", "Unsupported by repository evidence", or "No implementation evidence found".
3. Use "Strongly supported" only when there are at least two positive evidence items from different source types (e.g., package_json + source_file).
4. Rationale must be 1–2 sentences grounded only in the provided evidence items.
5. Do not use any of these words in rationale: fake, lying, scam, fraud, deceptive.

Respond with valid JSON in this exact format:
{"judgements": [{"id": "<claim_id>", "verdict": "<label>", "rationale": "<1-2 sentences>"}]}

Include every claim from the input in the judgements array. Respond with ONLY the JSON object. No markdown code blocks, no other text before or after.`;

/**
 * Belt-and-suspenders JSON extractor for reasoning models:
 * 1. Strip <think>...</think> (already done by client, but safe to repeat)
 * 2. Extract content inside ```json ... ``` code block if present
 * 3. Fall back to the first {...} object found in the text
 */
function extractJson(text: string): string {
  const noReasoning = text.replace(/<think>[\s\S]*?<\/think>/gi, "").trim();
  const blockMatch = noReasoning.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (blockMatch) return blockMatch[1].trim();
  const objMatch = noReasoning.match(/\{[\s\S]*\}/);
  if (objMatch) return objMatch[0].trim();
  return noReasoning;
}

function parseJudgeResponse(
  raw: string,
  expectedIds: Set<string>,
): LLMJudgeResult | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(extractJson(raw));
  } catch {
    return null;
  }

  if (
    typeof parsed !== "object" ||
    parsed === null ||
    !Array.isArray((parsed as Record<string, unknown>).judgements)
  ) {
    return null;
  }

  const rawItems = (parsed as { judgements: unknown[] }).judgements;
  const judgements: LLMJudgedClaim[] = [];

  for (const item of rawItems) {
    if (typeof item !== "object" || item === null) return null;
    const r = item as Record<string, unknown>;
    if (typeof r.id !== "string" || typeof r.verdict !== "string") return null;
    if (!VALID_LABEL_SET.has(r.verdict)) return null;
    judgements.push({
      id: r.id,
      verdict: r.verdict as LLMVerdictLabel,
      ...(typeof r.rationale === "string" ? { rationale: r.rationale } : {}),
    });
  }

  const returnedIds = new Set(judgements.map((j) => j.id));
  for (const id of expectedIds) {
    if (!returnedIds.has(id)) return null;
  }

  return { judgements };
}

export const tokenrouterClaimJudge: LLMClaimJudge = {
  async judgeClaims(input: LLMJudgeInput): Promise<LLMJudgeResult | null> {
    if (input.claims.length === 0) return { judgements: [] };

    const userContent = JSON.stringify({
      scan_source: input.scanSource,
      repo_unavailable: input.repoUnavailable,
      claims: input.claims,
    });
    const prompt = `${SYSTEM_PROMPT}\n\n---\n\n${userContent}`;

    const result = await callTokenRouter({
      messages: [{ role: "user", content: prompt }],
      timeoutMs: 60_000,
    });
    if (!result.ok) return null;

    const expectedIds = new Set(input.claims.map((c) => c.id));
    return parseJudgeResponse(result.content, expectedIds);
  },
};
