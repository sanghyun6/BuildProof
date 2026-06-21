import type { VerdictLabel } from "../types/pipeline";

const styles: Record<VerdictLabel, { pill: string; dot: string }> = {
  "Strongly supported": {
    pill: "bg-emerald-950/70 text-emerald-300 border border-emerald-800/50",
    dot: "bg-emerald-400",
  },
  "Partially supported": {
    pill: "bg-amber-950/70 text-amber-300 border border-amber-800/50",
    dot: "bg-amber-400",
  },
  "README-only claim": {
    pill: "bg-orange-950/70 text-orange-300 border border-orange-800/50",
    dot: "bg-orange-400",
  },
  "Unsupported by repository evidence": {
    pill: "bg-red-950/70 text-red-300 border border-red-800/50",
    dot: "bg-red-400",
  },
  "No implementation evidence found": {
    pill: "bg-red-950/70 text-red-300 border border-red-800/50",
    dot: "bg-red-400",
  },
};

export function VerdictBadge({ verdict }: { verdict: VerdictLabel }) {
  const { pill, dot } = styles[verdict];
  return (
    <span
      className={`inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full whitespace-nowrap ${pill}`}
    >
      <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${dot}`} />
      {verdict}
    </span>
  );
}
