import type { Claim, DetectorResult, Evidence, RepoScan } from "../types/pipeline";
import { detectMcp } from "../detectors/mcp";
import { detectRag } from "../detectors/rag";
import { detectRealtime } from "../detectors/realtime";
import { detectVoice } from "../detectors/voice";
import { detectMultiAgent } from "../detectors/multiAgent";
import { detectComputerVision } from "../detectors/computerVision";

// Fallback for any claim category added in the future before its detector is written.
function notImplemented(): Evidence[] {
  return [{ text: "No implementation evidence found", source: "absence", positive: false }];
}

const REAL_DETECTORS: Record<string, (scan: RepoScan) => Evidence[]> = {
  mcp: detectMcp,
  rag: detectRag,
  realtime: detectRealtime,
  voice: detectVoice,
  "multi-agent": detectMultiAgent,
  cv: detectComputerVision,
};

export function runDetectors(claims: Claim[], scan: RepoScan): DetectorResult[] {
  return claims.map((claim) => {
    const detect = REAL_DETECTORS[claim.id];
    return {
      claimId: claim.id,
      evidence: detect ? detect(scan) : notImplemented(),
    };
  });
}
