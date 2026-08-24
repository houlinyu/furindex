import OverlayChart, {
  MarkerLegend,
  type ChartMarker,
} from "@/components/dashboard/OverlayChart";
import SourceBadge from "@/components/dashboard/SourceBadge";
import {
  describeChange,
  describeSeries,
  describeSilence,
  type SeriesAnalysis,
} from "@/lib/baselines";
import type { MetricSource } from "@/lib/dashboard";

export type TrendSeries = {
  key: string;
  label: string;
  unit: string | null;
  source: MetricSource;
  origin: string;
  analysis: SeriesAnalysis;
};

/**
 * A chart per metric, all on the same timeline, with the owner's manual log
 * entries overlaid as markers.
 *
 * Series with fewer than two readings get a sentence instead of a chart. A
 * one-point "trend" drawn as a flat line is a picture of nothing that looks
 * like a picture of stability, which is the most misleading thing this section
 * could produce.
 */
export default function TrendsSection({
  series,
  markers,
  petName,
}: {
  series: TrendSeries[];
  markers: ChartMarker[];
  petName: string;
}) {
  if (series.length === 0) return null;

  return (
    <div className="space-y-3">
      {series.map((s) => {
        const b = s.analysis.baseline;
        const chartable = b.points.length >= 2;
        const alt = describeSeries(b, { label: s.label, unit: s.unit });
        const sentence = s.analysis.change
          ? describeChange(s.analysis.change, {
              label: s.label,
              petName,
              includeVetNote: false,
            })
          : describeSilence(s.analysis.silentReason ?? "no-data", b.windowDays);

        return (
          <div key={s.key} className="card p-4">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="text-sm font-medium">{s.label}</p>
                <p className="muted text-xs">
                  {b.points.length} reading{b.points.length === 1 ? "" : "s"}
                  {b.firstDate && b.latestDate ? ` · ${b.firstDate} to ${b.latestDate}` : ""}
                </p>
              </div>
              <SourceBadge source={s.source} origin={s.origin} />
            </div>

            {chartable ? (
              <>
                <div className="mt-3">
                  <OverlayChart
                    points={b.points}
                    unit={s.unit}
                    baselineMean={b.baseline.count > 0 ? b.baseline.mean : null}
                    markers={markers}
                    altText={alt}
                  />
                </div>
                <MarkerLegend kinds={markers.map((m) => m.kind)} />
                {b.baseline.count > 0 && (
                  <p className="muted mt-1 text-[0.6875rem]">
                    The dashed line is {petName}&apos;s own average over the previous{" "}
                    {b.windowDays} days. It is a reference to this animal, not a target.
                  </p>
                )}
              </>
            ) : (
              <p className="muted mt-3 text-xs leading-relaxed">{alt}</p>
            )}

            <p className="muted mt-2 text-xs leading-relaxed">{sentence}</p>
          </div>
        );
      })}
    </div>
  );
}
