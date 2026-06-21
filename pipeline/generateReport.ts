import type {
  AuditReport,
  AuditTrace,
  ClaimExtractionSource,
  ClaimVerdict,
  CompressionMetadataPublic,
  IngestMeta,
  JudgeComparison,
  JudgeSource,
  ProjectInput,
  ScanSource,
} from "../types/pipeline";

function deriveProjectName(input: ProjectInput): string {
  const trimmed = input.githubUrl.replace(/\/$/, "");
  const parts = trimmed.split("/");
  return parts.at(-1) ?? "Unknown Project";
}

export function generateReport(
  input: ProjectInput,
  verdicts: ClaimVerdict[],
  scanSource: ScanSource,
  claimExtractionSource: ClaimExtractionSource,
  judgeSource: JudgeSource,
  ingestMeta?: IngestMeta,
  trace?: AuditTrace,
  compression?: CompressionMetadataPublic,
  judgeComparison?: JudgeComparison,
): AuditReport {
  const overallScore =
    verdicts.length === 0
      ? 0
      : Math.round(
          verdicts.reduce((sum, v) => sum + v.score, 0) / verdicts.length
        );

  const projectName = ingestMeta?.title ?? deriveProjectName(input);

  return {
    projectName,
    githubUrl: input.githubUrl,
    auditedAt: new Date().toISOString(),
    overallScore,
    verdicts,
    scanSource,
    claimExtractionSource,
    judgeSource,
    ...(ingestMeta ? { ingestMeta } : {}),
    ...(trace ? { trace } : {}),
    ...(compression ? { compression } : {}),
    ...(judgeComparison ? { judgeComparison } : {}),
  };
}
