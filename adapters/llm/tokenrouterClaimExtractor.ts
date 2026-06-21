import type {
  LLMClaimExtractor,
  LLMClaimExtractorInput,
  LLMClaimExtractorResult,
  LLMClaimCategory,
} from "./types";
import { callTokenRouter } from "../../lib/tokenRouterClient";

const VALID_CATEGORIES = new Set<LLMClaimCategory>([
  "multi-agent",
  "mcp",
  "rag",
  "realtime",
  "voice",
  "cv",
]);

const SYSTEM_PROMPT = `You are a technical claim extractor for a project credibility tool. Your job is to identify technical implementation claims in a project description that fall into one of these six categories:

- multi-agent: Claims about multi-agent architectures, agent orchestration, autonomous agents, crews, or swarms
- mcp: Claims about the Model Context Protocol (MCP) or modelcontextprotocol
- rag: Claims about Retrieval-Augmented Generation (RAG), vector databases, embeddings, or semantic search
- realtime: Claims about real-time features, WebSockets, Server-Sent Events (SSE), or streaming
- voice: Claims about voice AI, audio processing, speech-to-text, text-to-speech, or microphone input
- cv: Claims about computer vision, video AI, object detection, pose estimation, or image recognition

Extract ONLY claims that fit one of these six categories. Ignore business claims, user-count claims, marketing language, and vague impact claims.

Respond with a JSON object in this exact format:
{"claims": [{"category": "<category_id>", "claimText": "<direct quote or paraphrase of the claim>"}]}

If no relevant technical claims are found, respond with: {"claims": []}

Respond with ONLY the JSON object. No markdown code blocks, no other text before or after.`;

interface RawClaim {
  category: unknown;
  claimText: unknown;
}

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
  // Find the outermost JSON object or array
  const objMatch = noReasoning.match(/\{[\s\S]*\}/);
  if (objMatch) return objMatch[0].trim();
  return noReasoning;
}

function parseExtractorResponse(raw: string): LLMClaimExtractorResult | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(extractJson(raw));
  } catch {
    return null;
  }

  if (
    typeof parsed !== "object" ||
    parsed === null ||
    !Array.isArray((parsed as Record<string, unknown>).claims)
  ) {
    return null;
  }

  const rawClaims = (parsed as { claims: unknown[] }).claims;
  const claims = rawClaims
    .filter(
      (c): c is RawClaim =>
        typeof c === "object" &&
        c !== null &&
        typeof (c as RawClaim).category === "string" &&
        typeof (c as RawClaim).claimText === "string" &&
        VALID_CATEGORIES.has((c as RawClaim).category as LLMClaimCategory),
    )
    .map((c) => ({
      category: c.category as LLMClaimCategory,
      claimText: c.claimText as string,
    }));

  return { claims };
}

export const tokenrouterClaimExtractor: LLMClaimExtractor = {
  async extractClaims(
    input: LLMClaimExtractorInput,
  ): Promise<LLMClaimExtractorResult | null> {
    const prompt = `${SYSTEM_PROMPT}\n\n---\n\n${input.projectText}`;
    const result = await callTokenRouter({
      messages: [{ role: "user", content: prompt }],
      timeoutMs: 30_000,
    });
    if (!result.ok) return null;
    return parseExtractorResponse(result.content);
  },
};
