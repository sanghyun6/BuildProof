import type { Claim, ClaimExtractionSource, ProjectInput } from "../types/pipeline";
import { selectProvider } from "../adapters/llm/provider";
import { anthropicClaimExtractor } from "../adapters/llm/anthropicClaimExtractor";
import { tokenrouterClaimExtractor } from "../adapters/llm/tokenrouterClaimExtractor";
import type { LLMClaimCategory, LLMClaimExtractorResult } from "../adapters/llm/types";

interface ClaimDefinition {
  id: LLMClaimCategory;
  detector: string;
  text: string;
  keywords: string[];
}

const CLAIM_DEFINITIONS: ClaimDefinition[] = [
  {
    id: "multi-agent",
    detector: "Multi-agent",
    text: "Uses multi-agent architecture",
    keywords: [
      "multi-agent",
      "multi agent",
      "agents",
      "agent orchestration",
      "autonomous agents",
      "crew",
      "swarm",
    ],
  },
  {
    id: "mcp",
    detector: "MCP",
    text: "Uses MCP",
    keywords: ["mcp", "model context protocol", "modelcontextprotocol"],
  },
  {
    id: "rag",
    detector: "RAG / vector DB",
    text: "Uses RAG or vector database",
    keywords: [
      "rag",
      "retrieval augmented generation",
      "vector database",
      "vector db",
      "embeddings",
      "pinecone",
      "chroma",
      "weaviate",
      "faiss",
      "pgvector",
      "qdrant",
    ],
  },
  {
    id: "realtime",
    detector: "Real-time / streaming",
    text: "Uses real-time or streaming functionality",
    keywords: [
      "real-time",
      "realtime",
      "streaming",
      "live",
      "websocket",
      "sse",
      "event stream",
    ],
  },
  {
    id: "voice",
    detector: "Voice / audio",
    text: "Uses voice or audio AI",
    keywords: [
      "voice",
      "audio",
      "speech",
      "transcription",
      "microphone",
      "whisper",
      "text-to-speech",
      "tts",
      "stt",
    ],
  },
  {
    id: "cv",
    detector: "Computer vision / video AI",
    text: "Uses computer vision or video AI",
    keywords: [
      "computer vision",
      "video ai",
      "image recognition",
      "object detection",
      "pose estimation",
      "ocr",
      "camera",
      "frame analysis",
    ],
  },
];

const DEFINITION_BY_ID = new Map(CLAIM_DEFINITIONS.map((d) => [d.id, d]));

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// Phrases and hyphenated terms are precise enough for substring matching.
// Single bare words use word boundaries to prevent substring false positives
// (e.g. "rag" must not match "storage", "live" must not match "deliver").
function matchesKeyword(normalizedText: string, keyword: string): boolean {
  if (keyword.includes(" ") || keyword.includes("-")) {
    return normalizedText.includes(keyword);
  }
  return new RegExp(`\\b${escapeRegExp(keyword)}\\b`).test(normalizedText);
}

function keywordExtract(input: ProjectInput): Claim[] {
  const lower = input.projectText.toLowerCase();
  const claims: Claim[] = [];

  for (const def of CLAIM_DEFINITIONS) {
    const matched = def.keywords.some((kw) => matchesKeyword(lower, kw.toLowerCase()));
    if (matched) {
      claims.push({ id: def.id, detector: def.detector, text: def.text });
    }
  }

  return claims;
}

function llmResultToClaims(result: LLMClaimExtractorResult): Claim[] {
  const claims: Claim[] = [];
  const seen = new Set<string>();
  for (const extracted of result.claims) {
    if (seen.has(extracted.category)) continue;
    seen.add(extracted.category);
    const def = DEFINITION_BY_ID.get(extracted.category);
    if (def) {
      claims.push({ id: def.id, detector: def.detector, text: def.text });
    }
  }
  return claims;
}

export interface ExtractClaimsResult {
  claims: Claim[];
  source: ClaimExtractionSource;
}

export async function extractClaims(input: ProjectInput): Promise<ExtractClaimsResult> {
  const provider = selectProvider();

  if (provider === "anthropic") {
    const result = await anthropicClaimExtractor.extractClaims({ projectText: input.projectText });
    if (result !== null) {
      return { claims: llmResultToClaims(result), source: "llm-anthropic" };
    }
    return { claims: keywordExtract(input), source: "keyword-fallback" };
  }

  if (provider === "tokenrouter") {
    const result = await tokenrouterClaimExtractor.extractClaims({ projectText: input.projectText });
    if (result !== null) {
      return { claims: llmResultToClaims(result), source: "llm-tokenrouter" };
    }
    return { claims: keywordExtract(input), source: "keyword-fallback" };
  }

  return { claims: keywordExtract(input), source: "keyword" };
}
