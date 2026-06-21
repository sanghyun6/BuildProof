"use client";

import { useState, useEffect } from "react";
import { ScoreBar } from "../components/ScoreBar";
import { DetectorSummary } from "../components/DetectorSummary";
import { ClaimCard } from "../components/ClaimCard";
import {
  generateBandCourtPacket,
  generateBandStarterMessage,
  generateBandCombinedMessage,
  generateBandSelfTestMessage,
} from "../lib/bandCourtPacket";
import type {
  AuditReport,
  AuditTrace,
  ClaimExtractionSource,
  CompressionMetadataPublic,
  IngestMeta,
  JudgeComparison,
  JudgeSource,
  ScanSource,
  TraceExportStatus,
} from "../types/pipeline";
import type {
  CompressionStatusLabel,
  IntegrationLabel,
  IntegrationStatus,
  JudgeComparisonStatusLabel,
  LLMProviderLabel,
} from "../lib/integrationStatus";

type AuditMode = "manual" | "url";

const SAMPLE_INPUTS = [
  {
    label: "RAG + MCP",
    text: "This project uses MCP (Model Context Protocol) to expose tools and resources. It also features a RAG pipeline backed by a vector database for semantic search and document retrieval.",
  },
  {
    label: "Voice + Real-time",
    text: "Real-time streaming chat with voice input support. Users speak through their microphone and receive live transcription via speech-to-text. Responses stream using Server-Sent Events.",
  },
  {
    label: "Vision + Multi-agent",
    text: "Multi-agent system with a planner agent and executor agents for computer vision tasks. Includes object detection, pose estimation, and image classification using a vision model.",
  },
];

function ClaimExtractionNote({ source }: { source: ClaimExtractionSource }) {
  if (source === "llm-anthropic") {
    return <p className="text-xs text-indigo-400 mt-0.5">Claim extraction: LLM · Anthropic</p>;
  }
  if (source === "llm-tokenrouter") {
    return <p className="text-xs text-indigo-400 mt-0.5">Claim extraction: LLM · TokenRouter</p>;
  }
  if (source === "keyword-fallback") {
    return (
      <p className="text-xs text-yellow-500 mt-0.5">
        Claim extraction: keyword fallback (LLM call failed)
      </p>
    );
  }
  return <p className="text-xs text-gray-600 mt-0.5">Claim extraction: keyword</p>;
}

function JudgeNote({ source }: { source: JudgeSource }) {
  if (source === "llm-anthropic") {
    return <p className="text-xs text-indigo-400 mt-0.5">Judge: LLM · Anthropic</p>;
  }
  if (source === "llm-tokenrouter") {
    return <p className="text-xs text-indigo-400 mt-0.5">Judge: LLM · TokenRouter</p>;
  }
  if (source === "deterministic-fallback") {
    return (
      <p className="text-xs text-yellow-500 mt-0.5">
        Judge: deterministic fallback (LLM call failed)
      </p>
    );
  }
  return <p className="text-xs text-gray-600 mt-0.5">Judge: deterministic</p>;
}

function ScanStatusNote({ source }: { source: ScanSource }) {
  if (source === "github-api") {
    return (
      <div className="flex flex-col gap-0.5 mt-1">
        <p className="text-xs text-green-500">✓ GitHub scan succeeded</p>
        <p className="text-xs text-gray-600">
          Checked source files, package.json, requirements.txt, and pyproject.toml
        </p>
      </div>
    );
  }
  if (source === "invalid-url") {
    return (
      <div className="flex flex-col gap-0.5 mt-1">
        <p className="text-xs text-yellow-500">⚠ Invalid GitHub URL — repository was not scanned</p>
        <p className="text-xs text-gray-600">Evidence based on description text only</p>
      </div>
    );
  }
  if (source === "unavailable") {
    return (
      <div className="flex flex-col gap-0.5 mt-1">
        <p className="text-xs text-yellow-500">⚠ Repository scan unavailable</p>
        <p className="text-xs text-gray-600">
          Evidence based on description text only. If this is a public repo, a{" "}
          <code className="font-mono text-gray-500">GITHUB_TOKEN</code> env var on the server may
          help with rate limits.
        </p>
      </div>
    );
  }
  return null;
}

function ingestStatusLabel(meta: IngestMeta): string {
  if (meta.source === "browserbase") {
    return meta.status === "partial" ? "Browserbase · partial extraction" : "Browserbase";
  }
  if (meta.warnings.some((w) => w.toLowerCase().startsWith("browserbase ingestion"))) {
    return "demo data · Browserbase fallback";
  }
  return "demo data · Browserbase not configured";
}

function IngestMetaCard({ meta }: { meta: IngestMeta }) {
  const isBrowserbase = meta.source === "browserbase";
  const label = ingestStatusLabel(meta);
  return (
    <div
      className={`bg-gray-900/60 border rounded-2xl p-4 flex flex-col gap-3 ${
        isBrowserbase ? "border-indigo-700/40" : "border-amber-800/40"
      }`}
    >
      <div className="flex items-center gap-2 flex-wrap">
        <span
          className={`text-xs font-semibold uppercase tracking-wider ${
            isBrowserbase ? "text-indigo-400" : "text-amber-500"
          }`}
        >
          Project URL extraction
        </span>
        <span className="text-xs text-gray-600">· {label}</span>
      </div>

      {isBrowserbase && meta.title && (
        <p className="text-sm font-semibold text-white">{meta.title}</p>
      )}

      {meta.builtWith.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {meta.builtWith.map((tech) => (
            <span
              key={tech}
              className="text-xs px-2 py-0.5 rounded-full bg-gray-800 border border-gray-700 text-gray-400"
            >
              {tech}
            </span>
          ))}
        </div>
      )}

      {meta.warnings.length > 0 && (
        <div className="flex flex-col gap-1">
          {meta.warnings.map((w, i) => (
            <p
              key={i}
              className={`text-xs leading-relaxed ${
                isBrowserbase ? "text-yellow-600/80" : "text-amber-600/80"
              }`}
            >
              ⚠ {w}
            </p>
          ))}
        </div>
      )}
    </div>
  );
}

const TRACE_STATUS_COLORS: Record<string, string> = {
  success: "text-green-500",
  skipped: "text-gray-500",
  fallback: "text-yellow-500",
  error: "text-red-400",
};

const TRACE_STATUS_ICONS: Record<string, string> = {
  success: "✓",
  skipped: "–",
  fallback: "⚠",
  error: "✕",
};

const EXPORT_LABEL: Record<TraceExportStatus, string> = {
  disabled: "disabled",
  exported: "Sentry",
  failed: "export failed",
};

const EXPORT_COLOR: Record<TraceExportStatus, string> = {
  disabled: "text-gray-700",
  exported: "text-green-600",
  failed: "text-red-500",
};

function TracePanel({ trace }: { trace: AuditTrace }) {
  const [open, setOpen] = useState(false);

  return (
    <div className="bg-gray-900/60 border border-gray-800/80 rounded-2xl overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-gray-800/40 transition-colors"
      >
        <span className="text-[10px] font-semibold text-gray-600 uppercase tracking-widest">
          Run trace
        </span>
        <span className="text-xs text-gray-600">
          {open ? "▲ hide" : "▼ show"} · {trace.steps.length} steps ·{" "}
          {trace.totalDurationMs}ms
        </span>
      </button>

      {open && (
        <div className="border-t border-gray-800 px-4 py-3 flex flex-col gap-2">
          {trace.steps.map((step, i) => {
            const color = TRACE_STATUS_COLORS[step.status] ?? "text-gray-400";
            const icon = TRACE_STATUS_ICONS[step.status] ?? "·";
            return (
              <div key={i} className="flex items-start gap-2 text-xs">
                <span className={`shrink-0 w-4 text-center font-bold ${color}`}>{icon}</span>
                <div className="flex flex-col gap-0.5 min-w-0">
                  <span className="text-gray-300 font-mono">{step.step}</span>
                  <span className="text-gray-500 leading-relaxed">{step.message}</span>
                </div>
              </div>
            );
          })}
          <div className="mt-1 pt-2 border-t border-gray-800 flex flex-col gap-0.5">
            <p className="text-xs text-gray-700">
              Total pipeline duration: {trace.totalDurationMs}ms
            </p>
            <p className="text-xs text-gray-700">
              Local trace: <span className="text-gray-500">always shown</span>
              {trace.externalExport !== undefined && (
                <>
                  {" "}· External trace export:{" "}
                  <span className={EXPORT_COLOR[trace.externalExport]}>
                    {EXPORT_LABEL[trace.externalExport]}
                  </span>
                </>
              )}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

const INTEGRATION_LABEL_COLOR: Record<IntegrationLabel, string> = {
  enabled: "text-green-500",
  "fallback mode": "text-yellow-500",
  "not configured": "text-gray-600",
  "missing keys": "text-red-400",
};

const LLM_PROVIDER_COLOR: Record<LLMProviderLabel, string> = {
  anthropic: "text-green-500",
  tokenrouter: "text-green-500",
  auto: "text-yellow-500",
  fallback: "text-yellow-500",
};

const COMPRESSION_LABEL_COLOR: Record<CompressionStatusLabel, string> = {
  enabled: "text-green-500",
  "local mode": "text-cyan-400",
  "fallback mode": "text-yellow-500",
  disabled: "text-gray-600",
};

const JUDGE_COMPARISON_LABEL_COLOR: Record<JudgeComparisonStatusLabel, string> = {
  enabled: "text-green-500",
  disabled: "text-gray-600",
  "not eligible": "text-yellow-500",
};

function IntegrationStatusCard({ status }: { status: IntegrationStatus }) {
  type LabelKey = Exclude<
    keyof IntegrationStatus,
    "llmProvider" | "tokenCompany" | "tokenrouterModel" | "judgeComparison" | "showBandCourt"
  >;
  const labelRows: Array<{ name: string; key: LabelKey }> = [
    { name: "GitHub token", key: "github" },
    { name: "Anthropic", key: "anthropic" },
    { name: "TokenRouter", key: "tokenrouter" },
    { name: "Browserbase", key: "browserbase" },
    { name: "Sentry", key: "sentry" },
  ];
  const tokenrouterSelected = status.llmProvider === "tokenrouter";
  const tokenrouterMissing = tokenrouterSelected && status.tokenrouter !== "enabled";
  return (
    <div className="bg-gray-800/30 border border-gray-800/60 rounded-xl px-4 py-3 flex flex-col gap-2">
      <p className="text-xs font-semibold text-gray-600 uppercase tracking-wider">
        Integration status
      </p>
      <div className="grid grid-cols-2 gap-x-6 gap-y-1">
        {labelRows.map(({ name, key }) => (
          <div key={key} className="flex items-center justify-between gap-2">
            <span className="text-xs text-gray-500">{name}</span>
            <span className={`text-xs font-medium ${INTEGRATION_LABEL_COLOR[status[key] as IntegrationLabel]}`}>
              {status[key] as string}
            </span>
          </div>
        ))}
        {tokenrouterSelected && (
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs text-gray-500">TR model</span>
            <span className="text-xs font-medium text-indigo-400">{status.tokenrouterModel}</span>
          </div>
        )}
        <div className="flex items-center justify-between gap-2">
          <span className="text-xs text-gray-500">Token Company</span>
          <span className={`text-xs font-medium ${COMPRESSION_LABEL_COLOR[status.tokenCompany]}`}>
            {status.tokenCompany}
          </span>
        </div>
        <div className="flex items-center justify-between gap-2">
          <span className="text-xs text-gray-500">Judge comparison</span>
          <span
            className={`text-xs font-medium ${JUDGE_COMPARISON_LABEL_COLOR[status.judgeComparison]}`}
          >
            {status.judgeComparison}
          </span>
        </div>
        <div className="flex items-center justify-between gap-2">
          <span className="text-xs text-gray-500">Band Audit Court</span>
          <span className="text-xs font-medium text-gray-600">
            {status.showBandCourt ? "on (experimental)" : "off"}
          </span>
        </div>
      </div>
      {tokenrouterMissing && (
        <div className="border-t border-yellow-800/40 pt-2">
          <p className="text-xs text-yellow-500">
            ⚠ LLM_PROVIDER=tokenrouter but TOKENROUTER_API_KEY is not set — falling back to deterministic judge
          </p>
        </div>
      )}
      <div className="border-t border-gray-800 pt-2 flex items-center justify-between gap-2">
        <span className="text-xs text-gray-500">LLM provider</span>
        <span className={`text-xs font-medium ${LLM_PROVIDER_COLOR[status.llmProvider]}`}>
          {status.llmProvider}
        </span>
      </div>
    </div>
  );
}

function compressionSourceLabel(meta: CompressionMetadataPublic): string {
  if (meta.fallbackUsed) return "local fallback";
  if (meta.source === "the-token-company") return "The Token Company";
  if (meta.source === "local-claim-aware") return "local claim-aware";
  if (meta.source === "disabled") return "disabled";
  return "fallback";
}

function compressionStatusLabel(meta: CompressionMetadataPublic): {
  text: string;
  classes: string;
} {
  if (meta.source === "disabled") {
    return {
      text: "Disabled",
      classes: "bg-gray-800/60 text-gray-400 border-gray-700",
    };
  }
  if (meta.fallbackUsed) {
    return {
      text: "Fallback",
      classes: "bg-yellow-900/30 text-yellow-400 border-yellow-700/40",
    };
  }
  if (meta.source === "the-token-company") {
    return {
      text: "Active · Remote",
      classes: "bg-emerald-900/30 text-emerald-400 border-emerald-700/40",
    };
  }
  return {
    text: "Active · Local",
    classes: "bg-cyan-900/30 text-cyan-300 border-cyan-700/40",
  };
}

function CompressionPanel({ meta }: { meta: CompressionMetadataPublic }) {
  const [open, setOpen] = useState(true);
  const status = compressionStatusLabel(meta);
  const source = compressionSourceLabel(meta);
  const reductionPositive = meta.percentReduction > 0;

  return (
    <div className="bg-gray-900/60 border border-cyan-700/30 rounded-2xl overflow-hidden shadow-lg shadow-cyan-900/10">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-gray-800/50 transition-colors"
      >
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs font-semibold text-cyan-300 uppercase tracking-wider">
            Evidence Compression
          </span>
          <span
            className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${status.classes}`}
          >
            {status.text}
          </span>
          <span className="text-xs text-gray-600">· source: {source}</span>
        </div>
        <span className="text-xs text-gray-600">{open ? "▲ hide" : "▼ show"}</span>
      </button>

      {open && (
        <div className="border-t border-cyan-800/20 px-4 py-5 flex flex-col gap-5">
          <p className="text-xs text-gray-400 leading-relaxed">
            BuildProof compresses the evidence payload sent to the LLM judge before judgment.
            Compression is claim-aware — claim text, verdict labels, source-file evidence, and
            polarity are preserved; repeated README mentions and missing-signal lists are
            condensed.
          </p>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="bg-gray-800/60 border border-gray-700/60 rounded-lg px-3 py-2 flex flex-col gap-0.5">
              <span className="text-[10px] uppercase tracking-wider text-gray-500">
                Raw tokens
              </span>
              <span className="text-lg font-bold text-gray-200 tabular-nums">
                {meta.rawEstimatedTokens.toLocaleString()}
              </span>
            </div>
            <div className="bg-gray-800/60 border border-cyan-800/40 rounded-lg px-3 py-2 flex flex-col gap-0.5">
              <span className="text-[10px] uppercase tracking-wider text-cyan-400">
                Compressed
              </span>
              <span className="text-lg font-bold text-cyan-200 tabular-nums">
                {meta.compressedEstimatedTokens.toLocaleString()}
              </span>
            </div>
            <div className="bg-gray-800/60 border border-gray-700/60 rounded-lg px-3 py-2 flex flex-col gap-0.5">
              <span className="text-[10px] uppercase tracking-wider text-gray-500">
                Reduction
              </span>
              <span
                className={`text-lg font-bold tabular-nums ${
                  reductionPositive ? "text-emerald-300" : "text-gray-400"
                }`}
              >
                {meta.percentReduction}%
              </span>
            </div>
            <div className="bg-gray-800/60 border border-gray-700/60 rounded-lg px-3 py-2 flex flex-col gap-0.5">
              <span className="text-[10px] uppercase tracking-wider text-gray-500">
                Ratio
              </span>
              <span className="text-lg font-bold text-gray-200 tabular-nums">
                {meta.compressionRatio.toFixed(2)}×
              </span>
            </div>
          </div>

          <div className="flex flex-col gap-2">
            <p className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider">
              Preserved signals
            </p>
            <div className="flex flex-wrap gap-1.5">
              <span className="text-xs px-2 py-0.5 rounded-full bg-gray-800 border border-gray-700 text-gray-300">
                {meta.preservedSignals.claims} claim{meta.preservedSignals.claims === 1 ? "" : "s"}
              </span>
              <span className="text-xs px-2 py-0.5 rounded-full bg-emerald-900/30 border border-emerald-800/40 text-emerald-300">
                {meta.preservedSignals.positiveEvidence} positive
              </span>
              <span className="text-xs px-2 py-0.5 rounded-full bg-red-900/30 border border-red-800/40 text-red-300">
                {meta.preservedSignals.negativeEvidence} negative
              </span>
              <span className="text-xs px-2 py-0.5 rounded-full bg-gray-800 border border-gray-700 text-gray-400">
                {meta.preservedSignals.sourceFiles} source-file
              </span>
              <span className="text-xs px-2 py-0.5 rounded-full bg-gray-800 border border-gray-700 text-gray-400">
                {meta.preservedSignals.packageJsonItems} deps
              </span>
              <span className="text-xs px-2 py-0.5 rounded-full bg-gray-800 border border-gray-700 text-gray-400">
                {meta.preservedSignals.fileTreeItems} file-tree
              </span>
              <span className="text-xs px-2 py-0.5 rounded-full bg-gray-800 border border-gray-700 text-gray-400">
                {meta.preservedSignals.readmeItems} README
              </span>
              <span className="text-xs px-2 py-0.5 rounded-full bg-gray-800 border border-gray-700 text-gray-400">
                {meta.preservedSignals.absenceItems} missing-signal
              </span>
              <span className="text-xs px-2 py-0.5 rounded-full bg-gray-800 border border-gray-700 text-gray-400">
                {meta.preservedSignals.uniqueFilePaths} file path{meta.preservedSignals.uniqueFilePaths === 1 ? "" : "s"}
              </span>
            </div>
          </div>

          <div className="flex flex-col gap-1 text-xs">
            <p className="text-gray-500">
              Fallback used:{" "}
              <span className={meta.fallbackUsed ? "text-yellow-400" : "text-gray-400"}>
                {meta.fallbackUsed ? "yes — local claim-aware compressor" : "no"}
              </span>
            </p>
            <p className="text-gray-500">
              Bytes (est. chars): {meta.rawChars.toLocaleString()} →{" "}
              <span className="text-cyan-300">{meta.compressedChars.toLocaleString()}</span>
            </p>
            {meta.notes && (
              <p className="text-gray-600 leading-relaxed">Note: {meta.notes}</p>
            )}
          </div>

          <p className="text-xs text-gray-700 leading-relaxed">
            Tradeoff: fewer input tokens at the LLM judge — lower latency and cost — while
            preserving claim text, verdict polarity, source-file evidence, file paths, and
            missing-signal markers. The visible report below is unchanged: the user-facing
            evidence list always shows the full uncompressed evidence.
          </p>
        </div>
      )}
    </div>
  );
}

function JudgeComparisonPanel({ comparison }: { comparison: JudgeComparison }) {
  const [open, setOpen] = useState(true);

  const statusBadge = (() => {
    if (comparison.status === "success") {
      return {
        text: "Both providers returned",
        classes: "bg-emerald-900/30 text-emerald-300 border-emerald-700/40",
      };
    }
    if (comparison.status === "partial") {
      return {
        text: "Partial — one provider returned",
        classes: "bg-yellow-900/30 text-yellow-300 border-yellow-700/40",
      };
    }
    if (comparison.status === "failed") {
      return {
        text: "Both providers failed",
        classes: "bg-red-900/30 text-red-300 border-red-700/40",
      };
    }
    return {
      text: "Skipped",
      classes: "bg-gray-800/60 text-gray-400 border-gray-700",
    };
  })();

  const anthropicOk = comparison.anthropic.verdicts !== null;
  const tokenrouterOk = comparison.tokenrouter.verdicts !== null;

  const claimRows: Array<{
    id: string;
    claim: string;
    detector: string;
    anthropicVerdict: string | null;
    tokenrouterVerdict: string | null;
    anthropicRationale?: string;
    tokenrouterRationale?: string;
    agree: boolean;
  }> = (() => {
    if (!anthropicOk || !tokenrouterOk) return [];
    const ids = new Set<string>();
    comparison.anthropic.verdicts!.forEach((v) => ids.add(v.id));
    comparison.tokenrouter.verdicts!.forEach((v) => ids.add(v.id));
    const aMap = new Map(comparison.anthropic.verdicts!.map((v) => [v.id, v]));
    const tMap = new Map(comparison.tokenrouter.verdicts!.map((v) => [v.id, v]));
    const dMap = new Map(comparison.disagreements.map((d) => [d.claimId, d]));
    return Array.from(ids).map((id) => {
      const a = aMap.get(id);
      const t = tMap.get(id);
      const d = dMap.get(id);
      return {
        id,
        claim: d?.claim ?? "",
        detector: d?.detector ?? "",
        anthropicVerdict: a?.verdict ?? null,
        tokenrouterVerdict: t?.verdict ?? null,
        anthropicRationale: a?.rationale,
        tokenrouterRationale: t?.rationale,
        agree: !!a && !!t && a.verdict === t.verdict,
      };
    });
  })();

  return (
    <div className="bg-gray-900/60 border border-indigo-700/40 rounded-2xl overflow-hidden shadow-lg shadow-indigo-900/10">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-gray-800/50 transition-colors"
      >
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs font-semibold text-indigo-300 uppercase tracking-wider">
            Judge Comparison
          </span>
          <span
            className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${statusBadge.classes}`}
          >
            {statusBadge.text}
          </span>
          {comparison.agreementRate !== null && (
            <span className="text-xs text-gray-500">
              · {comparison.agreementRate}% agreement ({comparison.agreedCount}/
              {comparison.comparedCount})
            </span>
          )}
        </div>
        <span className="text-xs text-gray-600">{open ? "▲ hide" : "▼ show"}</span>
      </button>

      {open && (
        <div className="border-t border-indigo-800/30 px-4 py-5 flex flex-col gap-5">
          <p className="text-xs text-gray-400 leading-relaxed">
            Both Anthropic (Claude) and TokenRouter (MiniMax-M3) judged the same evidence
            payload in parallel. The canonical verdict in the report above comes from the
            primary judge; this panel shows where the two providers agree and where they
            diverge.
          </p>

          {/* Provider summary cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="bg-gray-800/60 border border-gray-700/60 rounded-lg px-3 py-3 flex flex-col gap-1">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-semibold text-indigo-300">Anthropic</span>
                <span
                  className={`text-[10px] font-medium ${
                    anthropicOk ? "text-emerald-400" : "text-red-400"
                  }`}
                >
                  {anthropicOk ? "✓ returned" : `✕ ${comparison.anthropic.failureReason ?? "failed"}`}
                </span>
              </div>
              <span className="text-[10px] text-gray-500 font-mono">
                {comparison.anthropic.model}
              </span>
              {comparison.anthropic.durationMs !== undefined && (
                <span className="text-[10px] text-gray-600">
                  {comparison.anthropic.durationMs.toLocaleString()}ms
                </span>
              )}
            </div>
            <div className="bg-gray-800/60 border border-gray-700/60 rounded-lg px-3 py-3 flex flex-col gap-1">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-semibold text-indigo-300">TokenRouter</span>
                <span
                  className={`text-[10px] font-medium ${
                    tokenrouterOk ? "text-emerald-400" : "text-red-400"
                  }`}
                >
                  {tokenrouterOk
                    ? "✓ returned"
                    : `✕ ${comparison.tokenrouter.failureReason ?? "failed"}`}
                </span>
              </div>
              <span className="text-[10px] text-gray-500 font-mono">
                {comparison.tokenrouter.model}
              </span>
              {comparison.tokenrouter.durationMs !== undefined && (
                <span className="text-[10px] text-gray-600">
                  {comparison.tokenrouter.durationMs.toLocaleString()}ms
                </span>
              )}
            </div>
          </div>

          {/* Per-claim comparison */}
          {claimRows.length > 0 && (
            <div className="flex flex-col gap-2">
              <p className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider">
                Per-claim comparison
              </p>
              <div className="flex flex-col gap-2">
                {claimRows.map((row) => (
                  <div
                    key={row.id}
                    className={`rounded-lg px-3 py-2.5 border ${
                      row.agree
                        ? "border-gray-700/60 bg-gray-800/40"
                        : "border-yellow-700/40 bg-yellow-900/10"
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2 mb-1.5">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="text-xs font-mono text-gray-500 shrink-0">
                          {row.detector}
                        </span>
                        <span className="text-xs text-gray-300 truncate">{row.claim}</span>
                      </div>
                      <span
                        className={`text-xs font-semibold shrink-0 ${
                          row.agree ? "text-emerald-400" : "text-yellow-400"
                        }`}
                      >
                        {row.agree ? "✓ agree" : "⚠ disagree"}
                      </span>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      <div className="bg-gray-900/60 border border-gray-800 rounded px-2 py-1.5">
                        <p className="text-[10px] text-indigo-400 font-semibold mb-0.5">
                          Anthropic
                        </p>
                        <p className="text-xs text-gray-200">
                          {row.anthropicVerdict ?? "—"}
                        </p>
                        {row.anthropicRationale && (
                          <p className="text-[11px] text-gray-500 mt-1 leading-relaxed line-clamp-3">
                            {row.anthropicRationale}
                          </p>
                        )}
                      </div>
                      <div className="bg-gray-900/60 border border-gray-800 rounded px-2 py-1.5">
                        <p className="text-[10px] text-indigo-400 font-semibold mb-0.5">
                          TokenRouter
                        </p>
                        <p className="text-xs text-gray-200">
                          {row.tokenrouterVerdict ?? "—"}
                        </p>
                        {row.tokenrouterRationale && (
                          <p className="text-[11px] text-gray-500 mt-1 leading-relaxed line-clamp-3">
                            {row.tokenrouterRationale}
                          </p>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {comparison.notes && (
            <p className="text-xs text-gray-600 leading-relaxed border-t border-gray-800 pt-2">
              Note: {comparison.notes}
            </p>
          )}

          <p className="text-xs text-gray-700 leading-relaxed">
            Comparison mode is opt-in via{" "}
            <code className="font-mono text-gray-500">JUDGE_COMPARISON=on</code> and only
            runs when both <code className="font-mono text-gray-500">ANTHROPIC_API_KEY</code>{" "}
            and <code className="font-mono text-gray-500">TOKENROUTER_API_KEY</code> are
            configured. The canonical verdicts above are unchanged.
          </p>
        </div>
      )}
    </div>
  );
}

const BAND_AGENTS = [
  {
    handle: "BuildProofLeadJudge",
    role: "Coordinates review · posts final consensus verdict",
    borderClass: "border-violet-700/40",
    textClass: "text-violet-400",
  },
  {
    handle: "BuildProofClaimProsecutor",
    role: "Challenges weak or unsupported claims",
    borderClass: "border-red-800/40",
    textClass: "text-red-400",
  },
  {
    handle: "BuildProofEvidenceDefender",
    role: "Defends claims using available evidence",
    borderClass: "border-green-800/40",
    textClass: "text-green-400",
  },
  {
    handle: "BuildProofRepoForensics",
    role: "Classifies repository evidence quality",
    borderClass: "border-blue-800/40",
    textClass: "text-blue-400",
  },
] as const;

function BandCourtPanel({ report }: { report: AuditReport }) {
  const [open, setOpen] = useState(true);
  const [copied, setCopied] = useState<
    "starter" | "packet" | "combined" | "selftest" | null
  >(null);
  const [packetOpen, setPacketOpen] = useState(false);

  const packet = generateBandCourtPacket(report);
  const starterMessage = generateBandStarterMessage();
  const combinedMessage = generateBandCombinedMessage(report);
  const selfTestMessage = generateBandSelfTestMessage();

  function copyTo(
    text: string,
    key: "starter" | "packet" | "combined" | "selftest",
  ) {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(key);
      setTimeout(() => setCopied(null), 2000);
    });
  }

  return (
    <div className="bg-gray-900/60 border border-violet-700/40 rounded-2xl overflow-hidden shadow-lg shadow-violet-900/10">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-gray-800/50 transition-colors"
      >
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs font-semibold text-violet-400 uppercase tracking-wider">
            Band Audit Court
          </span>
          <span className="text-xs bg-green-900/40 text-green-400 border border-green-700/40 px-2 py-0.5 rounded-full font-medium">
            Ready
          </span>
          <span className="text-xs text-gray-600">· 4-agent deliberation</span>
        </div>
        <span className="text-xs text-gray-600">{open ? "▲ hide" : "▼ show"}</span>
      </button>

      {open && (
        <div className="border-t border-violet-800/30 px-4 py-5 flex flex-col gap-5">
          {/* Band-first notice */}
          <div className="bg-violet-950/40 border border-violet-700/40 rounded-lg px-4 py-3">
            <p className="text-sm font-semibold text-violet-300">
              Live Audit Court conversation happens in Band, not in this app.
            </p>
            <p className="text-xs text-gray-400 mt-1 leading-relaxed">
              BuildProof generates the court packet from the audit above. You paste it into a
              Band room containing the four sidecar agents. The actual multi-agent deliberation —
              specialist replies and the Final Consensus Verdict — unfolds in Band.
              BuildProof does not display Band chat history.
            </p>
          </div>

          {/* Agents */}
          <div className="flex flex-col gap-2">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
              Court agents
            </p>
            <div className="flex flex-col gap-1.5">
              {BAND_AGENTS.map(({ handle, role, borderClass, textClass }) => (
                <div
                  key={handle}
                  className={`flex items-center gap-3 px-3 py-2 rounded-lg bg-gray-800/60 border ${borderClass}`}
                >
                  <span className={`text-xs font-mono font-medium shrink-0 ${textClass}`}>
                    @{handle}
                  </span>
                  <span className="text-xs text-gray-500">— {role}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Copy actions */}
          <div className="flex flex-col gap-2">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
              Copy to clipboard
            </p>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => copyTo(selfTestMessage, "selftest")}
                title="Paste into Band to confirm all four agents are present before sending the full packet."
                className="text-xs px-3 py-1.5 rounded-md border border-emerald-700 text-emerald-400 hover:bg-emerald-900/30 transition-colors"
              >
                {copied === "selftest" ? "Copied!" : "Copy self-test message"}
              </button>
              <button
                type="button"
                onClick={() => copyTo(combinedMessage, "combined")}
                className="text-xs px-3 py-1.5 rounded-md bg-violet-700 text-white font-semibold hover:bg-violet-600 transition-colors"
              >
                {copied === "combined" ? "Copied!" : "Copy combined Band room message"}
              </button>
              <button
                type="button"
                onClick={() => copyTo(packet, "packet")}
                className="text-xs px-3 py-1.5 rounded-md border border-violet-700 text-violet-400 hover:bg-violet-900/30 transition-colors"
              >
                {copied === "packet" ? "Copied!" : "Copy court packet only"}
              </button>
              <button
                type="button"
                onClick={() => copyTo(starterMessage, "starter")}
                className="text-xs px-3 py-1.5 rounded-md border border-gray-600 text-gray-300 hover:border-gray-500 hover:text-white transition-colors"
              >
                {copied === "starter" ? "Copied!" : "Copy starter message only"}
              </button>
            </div>
            <p className="text-xs text-gray-600 leading-relaxed">
              Run the self-test first (step 2 below) to confirm all four agents are live in the
              Band room. Then paste the combined message to start the court. The conversation
              happens in Band — BuildProof does not receive or display agent replies.
            </p>
          </div>

          {/* Packet preview — what gets pasted to Band, NOT the conversation */}
          <div className="flex flex-col gap-1.5">
            <button
              type="button"
              onClick={() => setPacketOpen((v) => !v)}
              className="self-start text-xs text-gray-600 hover:text-gray-400 transition-colors"
            >
              {packetOpen ? "▲ Hide" : "▼ Preview"} packet (what gets pasted to Band)
            </button>
            {packetOpen && (
              <div className="bg-gray-800/60 border border-gray-700 rounded-lg p-3">
                <p className="text-xs text-gray-600 mb-2">
                  This is the packet text that{" "}
                  <span className="text-violet-400 font-semibold">Copy combined Band room message</span>{" "}
                  places on your clipboard. This is not the agent conversation — the actual
                  deliberation happens in Band after you paste this.
                </p>
                <pre className="text-xs text-gray-400 font-mono whitespace-pre-wrap leading-relaxed max-h-64 overflow-y-auto">
                  {combinedMessage}
                </pre>
              </div>
            )}
          </div>

          {/* 6-step Band-first runbook */}
          <div className="bg-gray-800/40 border border-gray-700 rounded-lg px-4 py-3 flex flex-col gap-2">
            <p className="text-xs font-semibold text-gray-400">How to run the Audit Court in Band</p>
            <ol className="text-xs text-gray-500 leading-relaxed flex flex-col gap-2 list-decimal list-inside">
              <li>
                Start the four Band sidecar agents:{" "}
                <code className="font-mono text-gray-400">
                  cd band_agents &amp;&amp; source .venv/bin/activate &amp;&amp; python run_all.py
                </code>
              </li>
              <li>
                Click{" "}
                <span className="text-emerald-400 font-semibold">Copy self-test message</span>{" "}
                above and paste it into the Band room.
              </li>
              <li>
                Confirm all four agents reply{" "}
                <code className="font-mono text-gray-400">READY — &lt;handle&gt;</code> in Band
                before proceeding.
              </li>
              <li>
                Click{" "}
                <span className="text-violet-300 font-semibold">
                  Copy combined Band room message
                </span>{" "}
                above.
              </li>
              <li>Paste the combined message into the Band room and send.</li>
              <li>
                Watch the Audit Court conversation unfold in Band.{" "}
                <span className="text-gray-600">BuildProof does not display Band replies.</span>
              </li>
            </ol>
            <p className="text-xs text-gray-600 mt-1 leading-relaxed">
              Full setup:{" "}
              <code className="font-mono text-gray-600">band_agents/README.md</code>
            </p>
          </div>

          {/* Divider note */}
          <p className="text-xs text-gray-700 leading-relaxed">
            BuildProof generates the packet and provides copy buttons only. Band is the
            agent-to-agent coordination layer — all deliberation happens there. This web app
            does not call Band, receive Band messages, or display live Band chat history.
          </p>
        </div>
      )}
    </div>
  );
}

export default function Home() {
  const [mode, setMode] = useState<AuditMode>("manual");
  const [projectText, setProjectText] = useState("");
  const [githubUrl, setGithubUrl] = useState("");
  const [projectUrl, setProjectUrl] = useState("");
  const [report, setReport] = useState<AuditReport | null>(null);
  const [loading, setLoading] = useState(false);
  const [auditError, setAuditError] = useState<string | null>(null);
  const [integrationStatus, setIntegrationStatus] = useState<IntegrationStatus | null>(null);

  useEffect(() => {
    fetch("/api/status")
      .then((r) => r.json())
      .then((data) => setIntegrationStatus(data as IntegrationStatus))
      .catch(() => {/* non-critical — status card simply won't render */});
  }, []);

  function switchMode(next: AuditMode) {
    setMode(next);
    setReport(null);
    setAuditError(null);
  }

  async function runAudit() {
    setLoading(true);
    setAuditError(null);

    const body =
      mode === "url"
        ? { projectUrl }
        : { projectText, githubUrl };

    try {
      const res = await fetch("/api/audit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const data = (await res.json()) as { error?: string };
        setAuditError(data.error ?? "Audit failed");
        return;
      }
      setReport((await res.json()) as AuditReport);
    } catch {
      setAuditError("Could not reach the audit service. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  const canSubmit =
    mode === "url"
      ? projectUrl.trim().length > 0
      : projectText.trim().length > 0;

  return (
    <main className="min-h-screen flex flex-col">
      {/* Header */}
      <header className="sticky top-0 z-10 border-b border-white/5 backdrop-blur-md bg-gray-950/80 px-6 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center text-sm shadow-lg shadow-indigo-900/40">
            🔍
          </div>
          <div>
            <h1 className="text-sm font-bold text-white tracking-tight leading-none">BuildProof</h1>
            <p className="text-[10px] text-gray-600 leading-none mt-0.5">AI project credibility auditor</p>
          </div>
        </div>
        <span className="text-[10px] font-mono text-gray-700 border border-gray-800 px-2 py-0.5 rounded-full">
          beta
        </span>
      </header>

      <div className="flex-1 max-w-3xl mx-auto w-full px-4 py-10 flex flex-col gap-10">
        {/* Hero */}
        {!report && (
          <div className="text-center flex flex-col items-center gap-4 pt-2">
            <h2 className="text-4xl font-extrabold tracking-tight bg-gradient-to-b from-white via-gray-100 to-gray-400 bg-clip-text text-transparent leading-tight">
              Does the repo match<br className="hidden sm:block" /> the pitch?
            </h2>
            <p className="text-gray-500 max-w-md text-sm leading-relaxed">
              BuildProof checks whether technical claims in a project&rsquo;s description are
              backed by implementation evidence in its GitHub repository.
            </p>
            <div className="flex items-center gap-2 text-xs font-medium">
              {(["Claim", "Evidence", "Verdict"] as const).map((step, i) => (
                <span key={step} className="flex items-center gap-2">
                  <span className="px-2.5 py-1 rounded-full bg-gray-900 border border-gray-800 text-gray-400">
                    {step}
                  </span>
                  {i < 2 && <span className="text-gray-700">→</span>}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Input form */}
        <section className="bg-gray-900/60 border border-gray-800/80 rounded-2xl p-6 flex flex-col gap-5 shadow-xl shadow-black/20">
          <div className="flex items-center justify-between">
            <h3 className="text-[10px] font-semibold text-gray-600 uppercase tracking-widest">
              Audit a project
            </h3>

            {/* Mode tabs */}
            <div className="flex rounded-lg bg-gray-800/60 border border-gray-700/60 p-0.5 text-xs gap-0.5">
              <button
                type="button"
                onClick={() => switchMode("manual")}
                className={`px-3 py-1 rounded-md transition-all ${
                  mode === "manual"
                    ? "bg-gray-700 text-white font-semibold shadow-sm"
                    : "text-gray-500 hover:text-gray-300"
                }`}
              >
                Manual
              </button>
              <button
                type="button"
                onClick={() => switchMode("url")}
                className={`px-3 py-1 rounded-md transition-all ${
                  mode === "url"
                    ? "bg-gray-700 text-white font-semibold shadow-sm"
                    : "text-gray-500 hover:text-gray-300"
                }`}
              >
                Project URL
              </button>
            </div>
          </div>

          {mode === "manual" && (
            <>
              <div className="flex flex-col gap-3">
                <div className="flex items-center gap-2.5 flex-wrap">
                  <span className="text-xs text-gray-600 shrink-0 tracking-wide">Try an example</span>
                  <div className="h-px flex-1 bg-gray-800 hidden sm:block" />
                  <div className="flex flex-wrap gap-1.5">
                    {SAMPLE_INPUTS.map((s) => (
                      <button
                        key={s.label}
                        type="button"
                        onClick={() => setProjectText(s.text)}
                        className="text-xs px-3 py-1 rounded-full bg-gray-800/80 border border-gray-700/60 text-gray-400 hover:bg-indigo-950/60 hover:border-indigo-500/50 hover:text-indigo-300 transition-all duration-150 font-medium"
                      >
                        {s.label}
                      </button>
                    ))}
                  </div>
                </div>

                <textarea
                  id="project-text"
                  rows={5}
                  placeholder="Paste your Devpost description, README excerpt, or pitch text here..."
                  value={projectText}
                  onChange={(e) => setProjectText(e.target.value)}
                  className="w-full bg-gray-800/80 border border-gray-700/60 rounded-lg px-3 py-2.5 text-sm text-gray-200 placeholder-gray-600 resize-none focus:outline-none focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500/30 transition-all"
                />
              </div>

              <div className="flex flex-col gap-2">
                <label htmlFor="github-url" className="text-xs text-gray-500 font-medium">
                  GitHub repository URL{" "}
                  <span className="text-gray-700 font-normal">· optional</span>
                </label>
                <input
                  id="github-url"
                  type="url"
                  placeholder="https://github.com/username/repo"
                  value={githubUrl}
                  onChange={(e) => setGithubUrl(e.target.value)}
                  className="w-full bg-gray-800/80 border border-gray-700/60 rounded-lg px-3 py-2.5 text-sm text-gray-200 placeholder-gray-600 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500/30 transition-all"
                />
              </div>
            </>
          )}

          {mode === "url" && (
            <div className="flex flex-col gap-2">
              <label htmlFor="project-url" className="text-xs text-gray-500 font-medium">
                Project URL
              </label>
              <input
                id="project-url"
                type="url"
                placeholder="https://devpost.com/software/your-project"
                value={projectUrl}
                onChange={(e) => setProjectUrl(e.target.value)}
                className="w-full bg-gray-800/80 border border-gray-700/60 rounded-lg px-3 py-2.5 text-sm text-gray-200 placeholder-gray-600 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500/30 transition-all"
              />
              <div className="bg-gray-800/60 border border-gray-700 rounded-lg px-3 py-2 flex flex-col gap-0.5">
                <p className="text-xs text-gray-400 font-medium">How project URL mode works</p>
                <p className="text-xs text-gray-500 leading-relaxed">
                  If <code className="font-mono text-gray-400">BROWSERBASE_API_KEY</code> and{" "}
                  <code className="font-mono text-gray-400">BROWSERBASE_PROJECT_ID</code> are
                  configured on the server, this URL will be fetched and parsed via Browserbase.
                  Otherwise, the audit runs on sample demo data. The report will show which was
                  used.
                </p>
              </div>
            </div>
          )}

          {integrationStatus && <IntegrationStatusCard status={integrationStatus} />}

          {auditError && <p className="text-xs text-red-400">{auditError}</p>}

          <button
            onClick={runAudit}
            disabled={loading || !canSubmit}
            className="self-start bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-500 hover:to-violet-500 disabled:opacity-40 disabled:cursor-not-allowed text-white font-semibold text-sm px-5 py-2.5 rounded-lg transition-all shadow-lg shadow-indigo-900/30 hover:shadow-indigo-900/50 flex items-center gap-2"
          >
            {loading ? (
              <>
                <span className="animate-spin inline-block w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full" />
                Auditing...
              </>
            ) : (
              <>🔍 Run Audit</>
            )}
          </button>
        </section>

        {/* Audit report */}
        {report && (
          <section className="flex flex-col gap-6">
            {/* Ingest metadata (URL mode only) */}
            {report.ingestMeta && <IngestMetaCard meta={report.ingestMeta} />}

            {/* Project summary card */}
            <div className="bg-gray-900/60 border border-gray-800/80 rounded-2xl p-5 flex flex-col gap-5 shadow-xl shadow-black/20">
              <div className="flex items-start justify-between gap-4">
                <div className="flex flex-col gap-1.5 min-w-0">
                  <p className="text-[10px] font-semibold text-gray-600 uppercase tracking-widest">
                    Project
                  </p>
                  <h2 className="text-xl font-bold text-white leading-tight">{report.projectName}</h2>
                  {report.githubUrl && (
                    <a
                      href={report.githubUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-indigo-400 text-xs hover:text-indigo-300 hover:underline break-all transition-colors"
                    >
                      {report.githubUrl}
                    </a>
                  )}
                  <div className="flex flex-col gap-0.5 mt-0.5">
                    <ScanStatusNote source={report.scanSource} />
                    <ClaimExtractionNote source={report.claimExtractionSource} />
                    <JudgeNote source={report.judgeSource} />
                  </div>
                </div>
                <div className="shrink-0 flex flex-col items-end gap-0.5">
                  <span className="text-5xl font-black tabular-nums bg-gradient-to-b from-white to-gray-400 bg-clip-text text-transparent leading-none">
                    {report.overallScore}
                  </span>
                  <span className="text-xs text-gray-600 font-medium">/ 100</span>
                </div>
              </div>
              <ScoreBar score={report.overallScore} />
            </div>

            {report.verdicts.length === 0 ? (
              <div className="bg-gray-900/60 border border-gray-800/80 rounded-2xl p-8 text-center">
                <p className="text-gray-400 text-sm">No tracked technical claims detected.</p>
                <p className="text-gray-600 text-xs mt-2">
                  Try including terms like &ldquo;multi-agent&rdquo;, &ldquo;MCP&rdquo;,
                  &ldquo;RAG&rdquo;, &ldquo;streaming&rdquo;, &ldquo;voice&rdquo;, or
                  &ldquo;computer vision&rdquo;.
                </p>
              </div>
            ) : (
              <>
                <DetectorSummary verdicts={report.verdicts} />

                <div>
                  <p className="text-[10px] font-semibold text-gray-600 uppercase tracking-widest mb-3">
                    Claim evidence breakdown
                  </p>
                  <div className="flex flex-col gap-3">
                    {report.verdicts.map((v) => (
                      <ClaimCard key={v.id} verdict={v} />
                    ))}
                  </div>
                </div>
              </>
            )}

            {report.trace && <TracePanel trace={report.trace} />}

            {report.compression && <CompressionPanel meta={report.compression} />}

            {report.judgeComparison && (
              <JudgeComparisonPanel comparison={report.judgeComparison} />
            )}

            {integrationStatus?.showBandCourt && <BandCourtPanel report={report} />}

            <p className="text-xs text-center text-gray-700 pb-4">
              BuildProof uses evidence-based analysis only. Verdicts reflect what is or is not
              present in the repository at time of audit.
            </p>
          </section>
        )}
      </div>
    </main>
  );
}
