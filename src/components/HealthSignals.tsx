import TrendCard from "@/components/TrendCard";
import {
  analyzeSeries,
  hasEnoughToChart,
  DEFAULT_WINDOW_DAYS,
  MIN_POINTS_PER_WINDOW,
  MIN_SPAN_DAYS,
  type SeriesAnalysis,
  type SeriesPoint,
} from "@/lib/baselines";
import type { CustomValue, FieldDefinition, WeightLog } from "@/lib/types";

/**
 * Health signals: every numeric series this pet has, compared to itself.
 *
 * Server component — this is arithmetic over rows the page already fetched, so
 * it costs one render and zero client JS. Nothing here calls out to anything.
 *
 * It deliberately does NOT invent metrics. Weight comes from weight_logs; every
 * other series is a field the owner's own reports produced. If we have nothing
 * with enough history we say exactly that, because a dashboard that fabricates
 * a trend from two readings is worse than a dashboard with an empty state.
 */
export default function HealthSignals({
  petName,
  weights,
  values,
  definitions,
  windowDays = DEFAULT_WINDOW_DAYS,
}: {
  petName: string;
  weights: WeightLog[];
  values: CustomValue[];
  definitions: FieldDefinition[];
  windowDays?: number;
}) {
  const series = collectSeries(weights, values, definitions);
  const analysed = series
    .map((s) => ({ ...s, analysis: analyzeSeries(s.points, { windowDays }) }))
    .sort(compareForDisplay);

  const ready = analysed.filter((s) => hasEnoughToChart(s.analysis.baseline));
  const notReady = analysed.filter((s) => !hasEnoughToChart(s.analysis.baseline));
  const notable = ready.filter(
    (s) => s.analysis.change && s.analysis.change.confidence !== "low",
  );

  return (
    <section className="mb-8">
      <h2 className="mb-1 text-sm font-medium uppercase tracking-wide muted">
        Health signals
      </h2>
      <p className="muted mb-3 text-xs">
        Each measurement compared to {petName}&apos;s own previous {windowDays} days —
        not to a breed chart. These are observations, not diagnoses.
      </p>

      {ready.length === 0 ? (
        <NotEnoughYet petName={petName} windowDays={windowDays} pending={notReady} />
      ) : (
        <>
          <p className="mb-3 text-sm">
            {notable.length === 0 ? (
              <span className="muted">
                Everything with enough history is holding steady inside {petName}&apos;s
                usual range.
              </span>
            ) : (
              <>
                {notable.length} of {ready.length} measurement
                {ready.length === 1 ? "" : "s"} moved outside {petName}&apos;s usual
                range.{" "}
                <span className="muted">
                  Changes are worth knowing about, not worrying about — a quiet
                  week is usually just a quiet week.
                </span>
              </>
            )}
          </p>

          <div className="grid gap-3 sm:grid-cols-2">
            {ready.map((s) => (
              <TrendCard
                key={s.key}
                label={s.label}
                unit={s.unit}
                petName={petName}
                analysis={s.analysis}
              />
            ))}
          </div>

          {notReady.length > 0 && (
            <p className="muted mt-3 text-xs">
              Still building a baseline for{" "}
              {notReady.map((s) => s.label).join(", ")} — {MIN_POINTS_PER_WINDOW} readings
              in each of two {windowDays}-day stretches is where comparison starts.
            </p>
          )}
        </>
      )}
    </section>
  );
}

/**
 * Honest empty state. It names what is missing rather than showing a zero or a
 * placeholder chart, because the owner can actually fix "log it a few more
 * times" — they can't fix a number we made up.
 */
function NotEnoughYet({
  petName,
  windowDays,
  pending,
}: {
  petName: string;
  windowDays: number;
  pending: { label: string; analysis: SeriesAnalysis }[];
}) {
  return (
    <div className="card p-6">
      <p className="text-sm font-medium">Nothing to compare yet</p>
      <p className="muted mt-2 max-w-xl text-sm leading-relaxed">
        To say anything honest about a trend we need at least {MIN_POINTS_PER_WINDOW}{" "}
        readings in the last {windowDays} days and {MIN_POINTS_PER_WINDOW} in the{" "}
        {windowDays} days before that, spanning at least {MIN_SPAN_DAYS} days. Until
        then any percentage would be noise dressed up as news, so we&apos;d rather
        show you nothing.
      </p>

      {pending.length > 0 && (
        <ul className="muted mt-3 space-y-1 text-xs">
          {pending.map((s) => (
            <li key={s.label} className="flex justify-between gap-3">
              <span className="truncate">{s.label}</span>
              <span className="shrink-0">
                {s.analysis.baseline.points.length} reading
                {s.analysis.baseline.points.length === 1 ? "" : "s"}
                {s.analysis.baseline.spanDays > 0
                  ? ` over ${s.analysis.baseline.spanDays} days`
                  : ""}
              </span>
            </li>
          ))}
        </ul>
      )}

      <p className="muted mt-3 text-xs">
        Weigh {petName} on a routine, or upload another vet report — the numbers in
        it become series here automatically.
      </p>
    </div>
  );
}

// ------------------------------------------------------------------ series --

type Series = {
  key: string;
  label: string;
  unit: string | null;
  points: SeriesPoint[];
};

/**
 * Weight plus every owner-defined numeric field that has values for this pet.
 * Non-numeric field types are skipped outright — "percent change in a date" is
 * not a thing, and a boolean's mean is not something to show an owner.
 */
function collectSeries(
  weights: WeightLog[],
  values: CustomValue[],
  definitions: FieldDefinition[],
): Series[] {
  const series: Series[] = [];

  if (weights.length > 0) {
    series.push({
      key: "weight",
      label: "Weight",
      unit: "kg",
      points: weights.map((w) => ({ date: w.recorded_on, value: w.weight_kg })),
    });
  }

  const numericDefs = definitions.filter((d) => d.field_type === "number");
  for (const def of numericDefs) {
    const points = values
      .filter((v) => v.definition_id === def.id && v.value_number != null)
      .map((v) => ({ date: v.recorded_on, value: v.value_number as number }));
    // A definition the owner has never filled in for this pet is not a series.
    if (points.length === 0) continue;
    series.push({ key: def.id, label: def.label, unit: def.unit, points });
  }

  return series;
}

/** Notable changes first, then anything with a verdict, then the longest series. */
function compareForDisplay(
  a: { analysis: SeriesAnalysis },
  b: { analysis: SeriesAnalysis },
): number {
  const rank = (s: SeriesAnalysis) =>
    s.change ? (s.change.confidence === "low" ? 1 : 0) : 2;
  const byRank = rank(a.analysis) - rank(b.analysis);
  if (byRank !== 0) return byRank;
  return b.analysis.baseline.points.length - a.analysis.baseline.points.length;
}
