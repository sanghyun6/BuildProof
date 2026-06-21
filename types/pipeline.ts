export type ClaimExtractionSource =
  | "keyword"
  | "llm"
  | "llm-anthropic"
  | "llm-tokenrouter"
  | "keyword-fallback";

export type CompressionSource =
  | "disabled"
  | "local-claim-aware"
  | "the-token-company"
  | "fallback";

export interface CompressionPreservedSignals {
  claims: number;
  positiveEvidence: number;
  negativeEvidence: number;
  sourceFiles: number;
  packageJsonItems: number;
  readmeItems: number;
  absenceItems: number;
  fileTreeItems: number;
  uniqueFilePaths: number;
}

export interface CompressionMetadataPublic {
  source: CompressionSource;
  rawEstimatedTokens: number;
  compressedEstimatedTokens: number;
  rawChars: number;
  compressedChars: number;
  compressionRatio: number;
  percentReduction: number;
  preservedSignals: CompressionPreservedSignals;
  fallbackUsed: boolean;
  notes?: string;
}

export type TraceStepStatus = "success" | "skipped" | "fallback" | "error";

export interface AuditTraceStep {
  step: string;
  status: TraceStepStatus;
  message: string;
  metadata?: Record<string, string | number | boolean>;
  durationMs?: number;
}

export type TraceExportStatus = "disabled" | "exported" | "failed";

export interface AuditTrace {
  steps: AuditTraceStep[];
  totalDurationMs: number;
  externalExport?: TraceExportStatus;
}

export type IngestSource = "mock" | "browserbase";
export type IngestStatus = "success" | "partial" | "failed";

export interface IngestMeta {
  title: string;
  builtWith: string[];
  source: IngestSource;
  status: IngestStatus;
  warnings: string[];
}

export type JudgeSource =
  | "deterministic"
  | "llm"
  | "llm-anthropic"
  | "llm-tokenrouter"
  | "deterministic-fallback";

export type JudgeComparisonProvider = "anthropic" | "tokenrouter";

export interface JudgeComparisonProviderResult {
  provider: JudgeComparisonProvider;
  model: string;
  verdicts: Array<{
    id: string;
    verdict: VerdictLabel;
    rationale?: string;
  }> | null;
  durationMs?: number;
  failureReason?: string;
}

export interface JudgeComparisonDisagreement {
  claimId: string;
  claim: string;
  detector: string;
  anthropicVerdict: VerdictLabel | null;
  tokenrouterVerdict: VerdictLabel | null;
  anthropicRationale?: string;
  tokenrouterRationale?: string;
}

export type JudgeComparisonStatus = "success" | "partial" | "failed" | "skipped";

export interface JudgeComparison {
  status: JudgeComparisonStatus;
  anthropic: JudgeComparisonProviderResult;
  tokenrouter: JudgeComparisonProviderResult;
  agreementRate: number | null;
  agreedCount: number;
  comparedCount: number;
  disagreements: JudgeComparisonDisagreement[];
  notes?: string;
}

export type VerdictLabel =
  | "Strongly supported"
  | "Partially supported"
  | "README-only claim"
  | "Unsupported by repository evidence"
  | "No implementation evidence found";

export interface Evidence {
  text: string;
  source: "readme" | "package_json" | "source_file" | "file_tree" | "absence";
  positive: boolean;
}

export interface ClaimVerdict {
  id: string;
  detector: string;
  claim: string;
  evidence: Evidence[];
  verdict: VerdictLabel;
  score: number; // 0–100
  rationale?: string;
}

export interface AuditReport {
  projectName: string;
  githubUrl: string;
  auditedAt: string;
  overallScore: number; // 0–100
  verdicts: ClaimVerdict[];
  scanSource: ScanSource;
  claimExtractionSource: ClaimExtractionSource;
  judgeSource: JudgeSource;
  ingestMeta?: IngestMeta;
  trace?: AuditTrace;
  compression?: CompressionMetadataPublic;
  judgeComparison?: JudgeComparison;
}

// --- Pipeline stage types ---

export interface ProjectInput {
  projectText: string;
  githubUrl: string;
}

export interface Claim {
  id: string;
  detector: string;
  text: string;
}

export type ScanSource = "mock" | "github-api" | "invalid-url" | "unavailable";

export interface RepoScan {
  githubUrl: string;
  owner: string | null;
  repo: string | null;
  source: ScanSource;
  defaultBranch: string | null;
  fileTree: string[];
  packageJson: Record<string, unknown> | null;
  readmeText: string | null;
  sourceFiles: Record<string, string>;
  /** Raw content of Python dependency files (requirements.txt, pyproject.toml, etc.) keyed by filename */
  pythonDepFiles: Record<string, string>;
}

export interface DetectorResult {
  claimId: string;
  evidence: Evidence[];
}

export interface ClaimWithEvidence {
  id: string;
  detector: string;
  claim: string;
  evidence: Evidence[];
}

export interface ScoredClaim extends ClaimWithEvidence {
  score: number;
}
