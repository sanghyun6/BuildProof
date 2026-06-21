import type { ClaimVerdict, VerdictLabel } from "../types/pipeline";
import { VerdictBadge } from "./VerdictBadge";
import { EvidenceItem } from "./EvidenceItem";

const detectorIcon: Record<string, string> = {
  MCP: "⚙️",
  "Multi-agent": "🤖",
  "Voice / audio": "🎙️",
  "RAG / vector DB": "🗄️",
  "Real-time / streaming": "⚡",
  "Computer vision / video AI": "👁️",
};

const verdictAccent: Record<VerdictLabel, string> = {
  "Strongly supported": "border-l-emerald-500",
  "Partially supported": "border-l-amber-500",
  "README-only claim": "border-l-orange-500",
  "Unsupported by repository evidence": "border-l-red-500",
  "No implementation evidence found": "border-l-red-500",
};

export function ClaimCard({ verdict }: { verdict: ClaimVerdict }) {
  const icon = detectorIcon[verdict.detector] ?? "🔍";
  const accent = verdictAccent[verdict.verdict] ?? "border-l-gray-700";

  return (
    <div
      className={`bg-gray-900/60 border border-gray-800/80 border-l-2 ${accent} rounded-xl p-5 flex flex-col gap-4`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2">
          <span className="text-base">{icon}</span>
          <span className="text-[10px] font-semibold text-gray-500 uppercase tracking-widest">
            {verdict.detector}
          </span>
        </div>
        <VerdictBadge verdict={verdict.verdict} />
      </div>

      <p className="text-gray-100 font-medium leading-snug">
        &ldquo;{verdict.claim}&rdquo;
      </p>

      <div>
        <p className="text-[10px] font-semibold text-gray-600 uppercase tracking-widest mb-2">
          Evidence
        </p>
        <ul className="flex flex-col">
          {verdict.evidence.map((e, i) => (
            <EvidenceItem key={i} item={e} />
          ))}
        </ul>
      </div>

      {verdict.rationale && (
        <div className="border-t border-gray-800/60 pt-3">
          <p className="text-[10px] font-semibold text-gray-600 uppercase tracking-widest mb-1.5">
            Assessment
          </p>
          <p className="text-xs text-gray-400 leading-relaxed">{verdict.rationale}</p>
        </div>
      )}
    </div>
  );
}
