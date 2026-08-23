/**
 * Feature 4 — sensor signal joined to a human observation on one timeline.
 * The join is the point: neither line alone would prompt a vet visit.
 */
const SIGNALS = [
  { icon: "❤️", label: "Resting heart rate", delta: "↑ 8%", tone: "amber" },
  { icon: "😴", label: "Sleep", delta: "↑ 12%", tone: "amber" },
  { icon: "🐕", label: "Activity", delta: "↓ 18%", tone: "red" },
  { icon: "🥣", label: "Appetite", delta: "steady", tone: "muted" },
];

export default function SignalsArt() {
  return (
    <div className="w-full space-y-2">
      {SIGNALS.map((s) => (
        <div key={s.label} className="flex items-center gap-2.5 rounded-lg border border-[var(--border)] px-3 py-2">
          <span aria-hidden>{s.icon}</span>
          <span className="flex-1 truncate text-xs">{s.label}</span>
          <span
            className={`text-xs font-medium ${
              s.tone === "red" ? "text-red-600" : s.tone === "amber" ? "text-amber-600" : "muted"
            }`}
          >
            {s.delta}
          </span>
        </div>
      ))}

      <div className="rounded-lg border border-[var(--border)] p-3">
        <p className="muted text-[10px] font-medium uppercase tracking-wide">From the collar</p>
        <p className="text-xs">Activity below baseline, 4 days running</p>
        <div className="my-2 border-t border-dashed border-[var(--border)]" />
        <p className="muted text-[10px] font-medium uppercase tracking-wide">From you</p>
        <p className="text-xs">&ldquo;Less interested in playing&rdquo; — logged Tuesday</p>
      </div>

      <div className="rounded-lg border border-brand-300 bg-brand-50/60 p-3">
        <p className="text-xs font-medium">Two sources, same week</p>
        <p className="muted mt-1 text-xs leading-relaxed">
          Neither reading alone would prompt a call. Together they are a pattern
          worth mentioning.
        </p>
      </div>
    </div>
  );
}
