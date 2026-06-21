import type {
  CompressedEvidenceContext,
  EvidenceCompressor,
  EvidenceCompressorInput,
} from "./types";
import { compressEvidenceContextLocal } from "../../pipeline/compressEvidenceContext";
import { estimateTokens } from "../../lib/tokenEstimate";

// The remote endpoint below is a placeholder (.example TLD — never a real domain).
// The adapter returns null immediately (no network call) when TOKEN_COMPANY_API_URL is not
// set to a real URL. Set TOKEN_COMPANY_API_URL to a real endpoint to enable remote calls.
// See provider.ts for the gating logic and isTokenCompanyRemoteReady() below.
const DEFAULT_PLACEHOLDER_URL = "https://api.thetokencompany.example/v1/compress";

function isPlaceholderUrl(url: string): boolean {
  return (
    url.trim() === "" ||
    url === DEFAULT_PLACEHOLDER_URL ||
    url.includes(".example") ||
    url.endsWith(".invalid") ||
    url.endsWith(".localhost")
  );
}

// Returns true only when both the API key and a real (non-placeholder) API URL are configured.
// Use this to gate UI labels and integration status — never report remote as "enabled" when
// TOKEN_COMPANY_API_URL is blank or still the placeholder.
export function isTokenCompanyRemoteReady(): boolean {
  const key = process.env.TOKEN_COMPANY_API_KEY;
  if (!key) return false;
  const url = process.env.TOKEN_COMPANY_API_URL ?? "";
  return !isPlaceholderUrl(url);
}

interface TokenCompanyApiResponse {
  compressed?: string;
}

function isApiResponse(v: unknown): v is TokenCompanyApiResponse {
  return typeof v === "object" && v !== null && typeof (v as Record<string, unknown>).compressed === "string";
}

export const theTokenCompanyCompressor: EvidenceCompressor = {
  async compress(input: EvidenceCompressorInput): Promise<CompressedEvidenceContext | null> {
    const apiKey = process.env.TOKEN_COMPANY_API_KEY;
    if (!apiKey) return null;

    const apiUrl = process.env.TOKEN_COMPANY_API_URL ?? "";
    // Never call a placeholder or unconfigured URL — return null so provider falls back to local.
    if (isPlaceholderUrl(apiUrl)) return null;

    // We send a claim-aware compressed payload as the base so the remote service
    // operates on already-structured text. This avoids regressing below the local floor
    // and limits what we send across the wire.
    const localBase = compressEvidenceContextLocal(input.judgeInput);

    let response: Response;
    try {
      response = await fetch(apiUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          text: localBase.compressedText,
          target: "llm-judge-context",
        }),
      });
    } catch {
      return null;
    }

    if (!response.ok) return null;

    let parsed: unknown;
    try {
      parsed = await response.json();
    } catch {
      return null;
    }

    if (!isApiResponse(parsed) || !parsed.compressed) return null;

    const remoteText = parsed.compressed;
    const remoteEstimate = estimateTokens(remoteText);

    // If the remote response is somehow larger than our local base, prefer the local base —
    // compression must never inflate context.
    if (remoteEstimate.estimatedTokens >= localBase.metadata.compressedEstimatedTokens) {
      return {
        ...localBase,
        metadata: {
          ...localBase.metadata,
          source: "the-token-company",
          notes: "Remote response not smaller than local base; kept local base payload.",
        },
      };
    }

    const rawEstimated = localBase.metadata.rawEstimatedTokens;
    const percentReduction =
      rawEstimated === 0
        ? 0
        : Math.max(
            0,
            Math.round(((rawEstimated - remoteEstimate.estimatedTokens) / rawEstimated) * 100),
          );
    const compressionRatio =
      rawEstimated === 0
        ? 1
        : Number((remoteEstimate.estimatedTokens / rawEstimated).toFixed(3));

    return {
      compressedInput: localBase.compressedInput,
      compressedText: remoteText,
      metadata: {
        ...localBase.metadata,
        source: "the-token-company",
        compressedEstimatedTokens: remoteEstimate.estimatedTokens,
        compressedChars: remoteEstimate.chars,
        compressionRatio,
        percentReduction,
      },
    };
  },
};
