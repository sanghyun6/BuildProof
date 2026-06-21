// Server-only — do not import this file in client components.
import * as Sentry from "@sentry/node";
import type { TraceAdapter } from "./types";
import type { AuditTrace, TraceExportStatus } from "../../types/pipeline";

let initialized = false;

function tryInit(): boolean {
  if (!process.env.SENTRY_DSN) return false;
  if (initialized) return true;
  Sentry.init({
    dsn: process.env.SENTRY_DSN,
    // Disable performance tracing — we export audit traces ourselves as custom events.
    tracesSampleRate: 0,
  });
  initialized = true;
  return true;
}

/** Capture an unexpected pipeline error in Sentry. No-op if SENTRY_DSN is not set. */
export async function captureSentryError(err: unknown): Promise<void> {
  if (!tryInit()) return;
  Sentry.captureException(err);
  await Sentry.flush(2000);
}

export const sentryTraceAdapter: TraceAdapter = {
  async exportTrace(trace: AuditTrace): Promise<TraceExportStatus> {
    if (!tryInit()) return "disabled";

    try {
      const ingestionStep = trace.steps.find((s) => s.step === "project-url-ingestion");
      const claimStep = trace.steps.find((s) => s.step === "claim-extraction");
      const scanStep = trace.steps.find((s) => s.step === "github-scan");
      const judgeStep = trace.steps.find((s) => s.step === "judge");

      const auditMode =
        ingestionStep?.status === "skipped" ? "manual" : "project-url";

      // Safe metadata only — no user text, no API keys, no source code.
      Sentry.captureEvent({
        message: "BuildProof audit trace",
        level: "info",
        extra: {
          auditMode,
          totalDurationMs: trace.totalDurationMs,
          stepCount: trace.steps.length,
          scanSource: scanStep?.metadata?.["source"],
          claimExtractionSource: claimStep?.metadata?.["source"],
          claimCount: claimStep?.metadata?.["claimCount"],
          judgeSource: judgeStep?.metadata?.["source"],
          stepStatuses: Object.fromEntries(
            trace.steps.map((s) => [s.step, s.status]),
          ),
        },
      });

      await Sentry.flush(2000);
      return "exported";
    } catch {
      return "failed";
    }
  },
};
