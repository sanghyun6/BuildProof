import type { LLMJudgeInput } from "../llm/types";
import type {
  CompressionMetadataPublic,
  CompressionPreservedSignals,
  CompressionSource,
} from "../../types/pipeline";

export type { CompressionSource };
export type PreservedSignals = CompressionPreservedSignals;
export type CompressionMetadata = CompressionMetadataPublic;

export interface CompressedEvidenceContext {
  compressedInput: LLMJudgeInput;
  compressedText: string;
  metadata: CompressionMetadata;
}

export interface EvidenceCompressorInput {
  judgeInput: LLMJudgeInput;
  rawText: string;
}

export interface EvidenceCompressor {
  compress(input: EvidenceCompressorInput): Promise<CompressedEvidenceContext | null>;
}
