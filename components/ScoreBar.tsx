export function ScoreBar({ score }: { score: number }) {
  const gradient =
    score >= 70
      ? "from-emerald-500 to-teal-400"
      : score >= 40
        ? "from-amber-500 to-yellow-400"
        : "from-red-500 to-rose-400";

  const label =
    score >= 70
      ? "Well supported"
      : score >= 40
        ? "Partially supported"
        : "Insufficient evidence";

  const labelColor =
    score >= 70
      ? "text-emerald-400"
      : score >= 40
        ? "text-amber-400"
        : "text-red-400";

  return (
    <div className="flex flex-col gap-2">
      <div className="h-1.5 bg-gray-800 rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full bg-gradient-to-r ${gradient} transition-all duration-700 ease-out`}
          style={{ width: `${score}%` }}
        />
      </div>
      <div className="flex items-center justify-between">
        <span className="text-xs text-gray-600">Evidence score</span>
        <span className={`text-xs font-semibold ${labelColor}`}>{label}</span>
      </div>
    </div>
  );
}
