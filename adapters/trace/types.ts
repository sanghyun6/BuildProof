import type { AuditTrace, TraceExportStatus } from "../../types/pipeline";

export interface TraceAdapter {
  exportTrace(trace: AuditTrace): Promise<TraceExportStatus>;
}
