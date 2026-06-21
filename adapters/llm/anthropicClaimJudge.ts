import Anthropic from "@anthropic-ai/sdk";
import type {
  LLMClaimJudge,
  LLMJudgeInput,
  LLMJudgeResult,
  LLMJudgedClaim,
  LLMVerdictLabel,
} from "./types";
import { VALID_VERDICT_LABELS } from "./types";

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

function stripMarkdown(text: string): string {
  const match = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  return match ? match[1].trim() : text.trim();
}

function parseJudgeResponse(
  raw: string,
  expectedIds: Set<string>,
): LLMJudgeResult | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(stripMarkdown(raw));
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

export const anthropicClaimJudge: LLMClaimJudge = {
  async judgeClaims(input: LLMJudgeInput): Promise<LLMJudgeResult | null> {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) return null;
    if (input.claims.length === 0) return { judgements: [] };

    const userMessage = JSON.stringify({
      scan_source: input.scanSource,
      repo_unavailable: input.repoUnavailable,
      claims: input.claims,
    });

    try {
      const client = new Anthropic({ apiKey });
      const message = await client.messages.create({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 1024,
        system: SYSTEM_PROMPT,
        messages: [{ role: "user", content: userMessage }],
      });

      const textBlock = message.content.find((b) => b.type === "text");
      if (!textBlock || textBlock.type !== "text") return null;

      const expectedIds = new Set(input.claims.map((c) => c.id));
      return parseJudgeResponse(textBlock.text, expectedIds);
    } catch {
      return null;
    }
  },
};
