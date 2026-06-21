import type { Evidence } from "../types/pipeline";

const sourceLabel: Record<Evidence["source"], string> = {
  readme: "README",
  package_json: "pkg",
  source_file: "source",
  file_tree: "tree",
  absence: "absent",
};

export function EvidenceItem({ item }: { item: Evidence }) {
  return (
    <li className="flex items-start gap-2.5 py-1.5 border-b border-gray-800/40 last:border-0">
      <span
        className={`mt-0.5 shrink-0 w-4 h-4 rounded-full flex items-center justify-center text-[9px] font-bold
          ${item.positive
            ? "bg-emerald-900/50 text-emerald-400 ring-1 ring-emerald-700/40"
            : "bg-red-900/50 text-red-400 ring-1 ring-red-700/40"
          }`}
      >
        {item.positive ? "✓" : "✕"}
      </span>
      <span className="text-sm text-gray-300 leading-snug">
        <span
          className={`inline-block text-[10px] uppercase tracking-wider font-semibold px-1.5 py-0.5 rounded mr-1.5 align-middle
            ${item.positive
              ? "bg-emerald-950/60 text-emerald-600"
              : "bg-red-950/60 text-red-600"
            }`}
        >
          {sourceLabel[item.source]}
        </span>
        {item.text}
      </span>
    </li>
  );
}
