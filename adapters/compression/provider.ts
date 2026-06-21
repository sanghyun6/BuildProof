import type { LLMJudgeInput } from "../llm/types";
import type { CompressedEvidenceContext } from "./types";
import {
  compressEvidenceContextLocal,
  disabledCompressionContext,
} from "../../pipeline/compressEvidenceContext";
import {
  theTokenCompanyCompressor,
  isTokenCompanyRemoteReady,
} from "./theTokenCompanyCompressor";

export type CompressionMode = "off" | "local" | "token-company" | "auto";

export function selectCompressionMode(): CompressionMode {
  const raw = (process.env.COMPRESSION_PROVIDER ?? "auto").toLowerCase();
  if (raw === "off" || raw === "disabled" || raw === "none") return "off";
  if (raw === "local") return "local";
  if (raw === "token-company" || raw === "the-token-company") return "token-company";
  return "auto";
}

export interface CompressionRunResult {
  context: CompressedEvidenceContext;
  fallbackUsed: boolean;
}

export async function runCompression(input: LLMJudgeInput): Promise<CompressionRunResult> {
  const mode = selectCompressionMode();

  if (mode === "off") {
    return { context: disabledCompressionContext(input), fallbackUsed: false };
  }

  if (mode === "local") {
    return { context: compressEvidenceContextLocal(input), fallbackUsed: false };
  }

  // mode is "token-company" or "auto" — only attempt remote when key + real URL are set.
  const remoteReady = isTokenCompanyRemoteReady();

  if (remoteReady) {
    try {
      const rawText = JSON.stringify(input);
      const remote = await theTokenCompanyCompressor.compress({ judgeInput: input, rawText });
      if (remote) {
        return { context: remote, fallbackUsed: false };
      }
    } catch {
      // fall through to local fallback
    }

    const localFallback = compressEvidenceContextLocal(input);
    return {
      context: {
        ...localFallback,
        metadata: {
          ...localFallback.metadata,
          source: "fallback",
          fallbackUsed: true,
          notes: "The Token Company call failed or returned no payload — local claim-aware compression used.",
        },
      },
      fallbackUsed: true,
    };
  }

  if (mode === "token-company") {
    // Explicitly requested remote but key or API URL is not configured.
    const localFallback = compressEvidenceContextLocal(input);
    return {
      context: {
        ...localFallback,
        metadata: {
          ...localFallback.metadata,
          source: "fallback",
          fallbackUsed: true,
          notes: "The Token Company remote is not configured (missing key or TOKEN_COMPANY_API_URL) — local claim-aware compression used.",
        },
      },
      fallbackUsed: true,
    };
  }

  // auto without remote configured — local compressor runs directly, no fallback flag.
  return { context: compressEvidenceContextLocal(input), fallbackUsed: false };
}
