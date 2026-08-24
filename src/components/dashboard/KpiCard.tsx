import SourceBadge from "@/components/dashboard/SourceBadge";
import type { Kpi } from "@/lib/dashboard";

/**
 * One KPI.
 *
 * Colour policy is TrendCard's, unchanged and for the same reason: never red,
 * never green, and always grey when the comparison is low-confidence no matter
 * how large the percentage. We are comparing an animal to itself, which
 * entitles us to say "this moved" and to nothing else. The arrow and the
 * sentence carry the direction too, so colour is never the only channel.
 *
 * There is no branch in here that renders a placeholder value. A metric with
 * nothing behind it never becomes a Kpi in the first place — see lib/dashboard.
 */
export default function KpiCard({ kpi }: { kpi: Kpi }) {
  const change = kpi.change ?? null;
  const notable = !!change && change.confidence !== "low";
  const tone = !notable
    ? "muted"
    : change!.direction === "up"
      ? "text-amber-700 dark:text-amber-400"
      : "text-sky-700 dark:text-sky-400";

  return (
    <div className="card flex flex-col p-4">
      <div className="flex items-start justify-between gap-2">
        <p className="min-w-0 text-sm font-medium">{kpi.label}</p>
        <SourceBadge source={kpi.source} origin={kpi.origin} />
      </div>

      <p className="mt-2 flex items-baseline gap-1.5">
        <span className="text-2xl font-semibold leading-tight text-[var(--brand-text)]">
          {kpi.value}
        </span>
        {kpi.unit && <span className="muted text-sm">{kpi.unit}</span>}
        {change && (
          <span className={`ml-1 text-sm font-medium ${tone}`}>
            <span aria-hidden>{change.direction === "up" ? "▲" : "▼"}</span>
            <span className="sr-only">{change.direction === "up" ? "up" : "down"}</span>
          </span>
        )}
      </p>

      {kpi.context && <p className="muted mt-1 text-xs leading-relaxed">{kpi.context}</p>}

      {change && (
        <p className={`mt-2 text-xs leading-relaxed ${notable ? tone : "muted"}`}>
          {change.sentence}
        </p>
      )}

      <p className="muted mt-auto pt-2 text-[0.6875rem]">{kpi.origin}</p>
    </div>
  );
}
