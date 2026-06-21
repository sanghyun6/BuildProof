import type { ClaimVerdict, VerdictLabel } from "../types/pipeline";
import { VerdictBadge } from "./VerdictBadge";

const detectorIcon: Record<string, string> = {
  MCP: "⚙️",
  "Multi-agent": "🤖",
  "Voice / audio": "🎙️",
  "RAG / vector DB": "🗄️",
  "Real-time / streaming": "⚡",
  "Computer vision / video AI": "👁️",
};

const verdictCell: Record<VerdictLabel, string> = {
  "Strongly supported": "border-emerald-800/40 bg-emerald-950/20",
  "Partially supported": "border-amber-800/40 bg-amber-950/20",
  "README-only claim": "border-orange-800/40 bg-orange-950/20",
  "Unsupported by repository evidence": "border-red-800/40 bg-red-950/20",
  "No implementation evidence found": "border-red-800/40 bg-red-950/20",
};

export function DetectorSummary({ verdicts }: { verdicts: ClaimVerdict[] }) {
  return (
    <div className="bg-gray-900/60 border border-gray-800/80 rounded-xl p-5">
      <p className="text-[10px] font-semibold text-gray-600 uppercase tracking-widest mb-4">
        Detector summary
      </p>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
        {verdicts.map((v) => {
          const cell = verdictCell[v.verdict] ?? "border-gray-800 bg-gray-800/30";
          return (
            <div
              key={v.id}
              className={`flex flex-col gap-2.5 border ${cell} rounded-lg p-3`}
            >
              <div className="flex items-center gap-1.5">
                <span className="text-sm">{detectorIcon[v.detector] ?? "🔍"}</span>
                <span className="text-xs font-medium text-gray-400 truncate">{v.detector}</span>
              </div>
              <VerdictBadge verdict={v.verdict} />
            </div>
          );
        })}
      </div>
    </div>
  );
}
