/** Feature 3 — history plus trend, with the insight stated in words. */
const SERIES = [
  { label: "Weight", pts: [40, 41, 42, 44, 47, 51, 54], unit: "kg", tone: "amber" },
  { label: "Appetite", pts: [50, 49, 51, 50, 48, 50, 49], unit: "", tone: "brand" },
  { label: "Activity", pts: [58, 55, 52, 48, 43, 38, 34], unit: "", tone: "red" },
];

function Spark({ pts, tone }: { pts: number[]; tone: string }) {
  const w = 96, h = 26;
  const min = Math.min(...pts), max = Math.max(...pts);
  const d = pts
    .map((v, i) => {
      const x = (i / (pts.length - 1)) * w;
      const y = h - ((v - min) / (max - min || 1)) * h;
      return `${i ? "L" : "M"}${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");
  const stroke =
    tone === "red" ? "#dc2626" : tone === "amber" ? "#d97706" : "var(--color-brand-500)";
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="h-6 w-24" aria-hidden>
      <path d={d} fill="none" stroke={stroke} strokeWidth={2} strokeLinecap="round" />
    </svg>
  );
}

export default function DashboardArt() {
  return (
    <div className="w-full space-y-2">
      {SERIES.map((s) => (
        <div key={s.label} className="flex items-center gap-3 rounded-lg border border-[var(--border)] px-3 py-2">
          <span className="w-16 shrink-0 text-xs font-medium">{s.label}</span>
          <Spark pts={s.pts} tone={s.tone} />
          <span
            className={`ml-auto text-xs font-medium ${
              s.tone === "red"
                ? "text-red-600 dark:text-red-400"
                : s.tone === "amber"
                  ? "text-amber-700 dark:text-amber-400"
                  : "muted"
            }`}
          >
            {s.tone === "red" ? "↓ 18%" : s.tone === "amber" ? "↑ 8%" : "steady"}
          </span>
        </div>
      ))}
      <div className="rounded-lg border border-brand-300 bg-brand-50/60 p-3">
        <p className="text-xs font-medium">💡 Worth watching</p>
        <p className="muted mt-1 text-xs leading-relaxed">
          Activity has been below Luna&apos;s own 30-day baseline for 4 days while
          appetite held steady. Something to raise at her next visit.
        </p>
      </div>
    </div>
  );
}
