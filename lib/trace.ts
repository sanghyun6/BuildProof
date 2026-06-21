import type { AuditTrace, AuditTraceStep, TraceStepStatus } from "../types/pipeline";

export class TraceCollector {
  private readonly steps: AuditTraceStep[] = [];
  private readonly startMs = Date.now();

  add(
    step: string,
    status: TraceStepStatus,
    message: string,
    metadata?: Record<string, string | number | boolean>,
  ): void {
    this.steps.push({ step, status, message, ...(metadata ? { metadata } : {}) });
  }

  build(): AuditTrace {
    return {
      steps: this.steps,
      totalDurationMs: Date.now() - this.startMs,
    };
  }
}
