import type { AuditReport, IngestMeta, ProjectInput } from "../types/pipeline";
import { TraceCollector } from "../lib/trace";
import { sentryTraceAdapter } from "../adapters/trace/sentryTraceAdapter";
import { ingestProject } from "./ingestProject";
import { extractClaims } from "./extractClaims";
import { scanRepo } from "./scanRepo";
import { runDetectors } from "./runDetectors";
import { matchEvidence } from "./matchEvidence";
import { scoreAuthenticity } from "./scoreAuthenticity";
import { judgeClaims } from "./judgeClaims";
import { applySafety } from "./applySafety";
import { generateReport } from "./generateReport";

export async function runPipeline(
  input: ProjectInput,
  options?: { ingestMeta?: IngestMeta },
): Promise<AuditReport> {
  const collector = new TraceCollector();

  // Trace: input received
  const hasGithubUrl = input.githubUrl.trim().length > 0;
  collector.add(
    "input-received",
    "success",
    hasGithubUrl
      ? `Project text received with GitHub URL`
      : `Project text received (no GitHub URL)`,
    { hasGithubUrl, textLength: input.projectText.length },
  );

  // Trace: ingest mode
  if (options?.ingestMeta) {
    const meta = options.ingestMeta;
    collector.add(
      "project-url-ingestion",
      meta.source === "browserbase" ? "success" : "fallback",
      meta.source === "browserbase"
        ? `Browserbase ingestion succeeded (status: ${meta.status})`
        : `Project URL ingestion used demo fixture data`,
      { source: meta.source, status: meta.status },
    );
  } else {
    collector.add(
      "project-url-ingestion",
      "skipped",
      "Manual mode — no project URL ingestion",
    );
  }

  const ingested = ingestProject(input);

  // Claim extraction
  const { claims, source: claimExtractionSource } = await extractClaims(ingested);
  const extractionIsLLM =
    claimExtractionSource === "llm" ||
    claimExtractionSource === "llm-anthropic" ||
    claimExtractionSource === "llm-tokenrouter";
  const extractionProvider =
    claimExtractionSource === "llm-tokenrouter" ? "TokenRouter (MiniMax-M3)" : "Anthropic";
  collector.add(
    "claim-extraction",
    claimExtractionSource === "keyword-fallback" ? "fallback" : "success",
    extractionIsLLM
      ? `LLM (${extractionProvider}) extracted ${claims.length} claim(s)`
      : claimExtractionSource === "keyword-fallback"
        ? `LLM failed — keyword fallback found ${claims.length} claim(s)`
        : `Keyword matcher found ${claims.length} claim(s)`,
    { source: claimExtractionSource, claimCount: claims.length },
  );

  // GitHub scan
  const scan = await scanRepo(ingested);
  const scanStatus =
    scan.source === "github-api"
      ? "success"
      : scan.source === "invalid-url"
        ? "skipped"
        : "fallback";
  collector.add(
    "github-scan",
    scanStatus,
    scan.source === "github-api"
      ? `GitHub API scan succeeded (${scan.fileTree.length} files indexed)`
      : scan.source === "invalid-url"
        ? "No valid GitHub URL — repository not scanned"
        : "GitHub scan unavailable — evidence based on text only",
    { source: scan.source, fileCount: scan.fileTree.length },
  );

  // Detectors
  const detectorResults = runDetectors(claims, scan);
  collector.add(
    "detectors-run",
    "success",
    `${detectorResults.length} detector(s) run across ${claims.length} claim(s)`,
    { detectorCount: detectorResults.length },
  );

  const matched = matchEvidence(claims, detectorResults);
  const scored = scoreAuthenticity(matched);

  // Judge
  const {
    verdicts: judged,
    source: judgeSource,
    compression,
    comparison,
  } = await judgeClaims(scored, scan.source);

  if (compression) {
    const compressionStatus = compression.fallbackUsed
      ? "fallback"
      : compression.source === "disabled"
        ? "skipped"
        : "success";
    collector.add(
      "evidence-compression",
      compressionStatus,
      compression.source === "disabled"
        ? "Evidence compression disabled — raw context sent to LLM judge"
        : compression.fallbackUsed
          ? `Compression: The Token Company unavailable — local claim-aware compressor used (${compression.percentReduction}% reduction)`
          : compression.source === "the-token-company"
            ? `Compression: The Token Company reduced judge context by ${compression.percentReduction}%`
            : `Compression: local claim-aware compressor reduced judge context by ${compression.percentReduction}%`,
      {
        source: compression.source,
        rawEstimatedTokens: compression.rawEstimatedTokens,
        compressedEstimatedTokens: compression.compressedEstimatedTokens,
        percentReduction: compression.percentReduction,
        fallbackUsed: compression.fallbackUsed,
      },
    );
  }

  const judgeIsLLM =
    judgeSource === "llm" ||
    judgeSource === "llm-anthropic" ||
    judgeSource === "llm-tokenrouter";
  const judgeProvider = judgeSource === "llm-tokenrouter" ? "TokenRouter (MiniMax-M3)" : "Anthropic";
  collector.add(
    "judge",
    judgeSource === "deterministic-fallback" ? "fallback" : "success",
    judgeIsLLM
      ? `LLM judge (${judgeProvider}) evaluated ${judged.length} claim(s)`
      : judgeSource === "deterministic-fallback"
        ? `LLM judge failed — deterministic fallback applied`
        : `Deterministic judge applied to ${judged.length} claim(s)`,
    { source: judgeSource, verdictCount: judged.length },
  );

  // Comparison (optional; only when JUDGE_COMPARISON=on and both keys present)
  if (comparison) {
    const compStatus =
      comparison.status === "success"
        ? "success"
        : comparison.status === "failed"
          ? "error"
          : "fallback";
    const rateText =
      comparison.agreementRate !== null
        ? `${comparison.agreementRate}% agreement (${comparison.agreedCount}/${comparison.comparedCount})`
        : "no agreement rate available";
    const anthropicLabel = comparison.anthropic.verdicts !== null ? "✓" : "✕";
    const tokenrouterLabel = comparison.tokenrouter.verdicts !== null ? "✓" : "✕";
    collector.add(
      "judge-comparison",
      compStatus,
      `Judge comparison — Anthropic ${anthropicLabel}, TokenRouter ${tokenrouterLabel} — ${rateText}`,
      {
        status: comparison.status,
        agreementRate: comparison.agreementRate ?? -1,
        agreedCount: comparison.agreedCount,
        comparedCount: comparison.comparedCount,
        disagreements: comparison.disagreements.length,
        anthropicModel: comparison.anthropic.model,
        tokenrouterModel: comparison.tokenrouter.model,
        ...(comparison.anthropic.durationMs !== undefined
          ? { anthropicDurationMs: comparison.anthropic.durationMs }
          : {}),
        ...(comparison.tokenrouter.durationMs !== undefined
          ? { tokenrouterDurationMs: comparison.tokenrouter.durationMs }
          : {}),
      },
    );
  } else {
    const enabled = (process.env.JUDGE_COMPARISON ?? "off").toLowerCase() === "on";
    if (enabled) {
      collector.add(
        "judge-comparison",
        "skipped",
        "Judge comparison enabled but ineligible (missing key, no claims, or primary fallback)",
        { enabled: true },
      );
    }
  }

  // Safety
  const safe = applySafety(judged);
  collector.add("safety-applied", "success", "Safety language rules applied to all verdicts");

  // Report
  collector.add("report-generated", "success", "Audit report assembled");

  const trace = collector.build();

  // Export trace to Sentry if configured; set externalExport regardless so the UI can show status.
  try {
    trace.externalExport = await sentryTraceAdapter.exportTrace(trace);
  } catch {
    trace.externalExport = "failed";
  }

  return generateReport(
    ingested,
    safe,
    scan.source,
    claimExtractionSource,
    judgeSource,
    options?.ingestMeta,
    trace,
    compression,
    comparison,
  );
}
