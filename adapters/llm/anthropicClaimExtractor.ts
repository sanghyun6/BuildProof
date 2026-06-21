import Anthropic from "@anthropic-ai/sdk";
import type {
  LLMClaimExtractor,
  LLMClaimExtractorInput,
  LLMClaimExtractorResult,
  LLMClaimCategory,
} from "./types";

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

function stripMarkdown(text: string): string {
  const match = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  return match ? match[1].trim() : text.trim();
}

function parseExtractorResponse(raw: string): LLMClaimExtractorResult | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(stripMarkdown(raw));
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

export const anthropicClaimExtractor: LLMClaimExtractor = {
  async extractClaims(
    input: LLMClaimExtractorInput,
  ): Promise<LLMClaimExtractorResult | null> {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) return null;

    try {
      const client = new Anthropic({ apiKey });
      const message = await client.messages.create({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 512,
        system: SYSTEM_PROMPT,
        messages: [{ role: "user", content: input.projectText }],
      });

      const textBlock = message.content.find((b) => b.type === "text");
      if (!textBlock || textBlock.type !== "text") return null;

      return parseExtractorResponse(textBlock.text);
    } catch {
      return null;
    }
  },
};
