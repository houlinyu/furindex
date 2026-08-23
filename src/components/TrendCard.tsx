import {
  describeChange,
  describeSeries,
  describeSilence,
  trimNumber,
  type SeriesAnalysis,
} from "@/lib/baselines";

/**
 * One metric: its recent shape, its current value, and how that compares to the
 * pet's own baseline.
 *
 * Colour policy, on purpose:
 *   • never red, never green. Red reads as "emergency" and green as "all clear",
 *     and we are entitled to neither — we are comparing an animal to itself, not
 *     diagnosing it. Amber (rising) and sky (falling) read as "look at this"
 *     without reading as a verdict.
 *   • low confidence is always grey, no matter how large the percentage. Thin
 *     data must never look urgent; that is exactly how owners are trained to
 *     panic at noise.
 *   • the arrow and the sentence carry the direction too, so colour is never the
 *     only channel — required for colour-blind readers and for anyone reading
 *     this on a bad phone screen in the vet's waiting room.
 */
export default function TrendCard({
  label,
  unit,
  petName,
  analysis,
}: {
  label: string;
  unit?: string | null;
  petName?: string | null;
  analysis: SeriesAnalysis;
}) {
  const { baseline, change, silentReason } = analysis;
  const points = baseline.points;
  const suffix = unit ? ` ${unit}` : "";

  // Grey unless we have both a change worth surfacing AND enough data to mean it.
  const notable = !!change && change.confidence !== "low";
  const tone = !notable
    ? "muted"
    : change!.direction === "up"
      ? "text-amber-600 dark:text-amber-400"
      : "text-sky-700 dark:text-sky-400";

  const sentence = change
    ? describeChange(change, { label, petName, includeVetNote: false })
    : describeSilence(silentReason ?? "no-data", baseline.windowDays);

  return (
    <div className="card p-4">
      <div className="flex items-baseline justify-between gap-2">
        <p className="truncate text-sm font-medium">{label}</p>
        <span className="muted shrink-0 text-xs">
          {points.length} reading{points.length === 1 ? "" : "s"}
        </span>
      </div>

      <div className="mt-1 flex items-baseline gap-2">
        <p className="text-lg font-semibold text-brand-600">
          {baseline.latestValue == null ? "—" : `${trimNumber(baseline.latestValue)}${suffix}`}
        </p>
        {change && (
          <p className={`text-sm font-medium ${tone}`}>
            <span aria-hidden>{change.direction === "up" ? "▲" : "▼"}</span>{" "}
            {change.percentChange < 1 ? change.percentChange.toFixed(1) : Math.round(change.percentChange)}%
          </p>
        )}
      </div>

      <Sparkline
        points={points}
        baselineMean={baseline.baseline.count > 0 ? baseline.baseline.mean : null}
        notable={notable}
        toneClass={tone}
        altText={describeSeries(baseline, { label, unit })}
      />

      <p className={`mt-2 text-xs ${notable ? tone : "muted"}`}>{sentence}</p>
    </div>
  );
}

/**
 * Compact inline SVG, same dependency-free approach as WeightChart — a chart
 * library is still not worth the bundle. The dashed line is the baseline mean,
 * so the delta is something you can see rather than something you have to
 * take on trust from the percentage above it.
 */
function Sparkline({
  points,
  baselineMean,
  notable,
  toneClass,
  altText,
}: {
  points: { date: string; value: number }[];
  baselineMean: number | null;
  notable: boolean;
  toneClass: string;
  altText: string;
}) {
  // One point is a dot, not a trend; say so in words instead of drawing a line.
  if (points.length < 2) {
    return <p className="muted mt-3 text-xs">{altText}</p>;
  }

  const W = 260;
  const H = 56;
  const PAD = 4;

  const xs = points.map((p) => new Date(p.date + "T00:00:00").getTime());
  const ys = points.map((p) => p.value);
  const xMin = Math.min(...xs);
  const xMax = Math.max(...xs);
  // Include the baseline mean in the y-range or its guide line can fall
  // outside the box and silently disappear.
  const candidates = baselineMean == null ? ys : [...ys, baselineMean];
  const yMin = Math.min(...candidates);
  const yMax = Math.max(...candidates);
  // Pad so a flat series doesn't collapse to a zero-height band.
  const yPad = (yMax - yMin || Math.max(Math.abs(yMax) * 0.1, 0.5)) * 0.15;
  const y0 = yMin - yPad;
  const y1 = yMax + yPad;

  const px = (t: number) => PAD + ((t - xMin) / (xMax - xMin || 1)) * (W - 2 * PAD);
  const py = (v: number) => PAD + (1 - (v - y0) / (y1 - y0 || 1)) * (H - 2 * PAD);

  const path = points
    .map((p, i) => `${i === 0 ? "M" : "L"}${px(xs[i]).toFixed(1)},${py(p.value).toFixed(1)}`)
    .join(" ");

  const stroke = notable ? "currentColor" : "var(--color-brand-500)";

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      className={`mt-3 h-auto w-full ${notable ? toneClass : ""}`}
      role="img"
      aria-label={altText}
    >
      {baselineMean != null && (
        <line
          x1={PAD}
          x2={W - PAD}
          y1={py(baselineMean)}
          y2={py(baselineMean)}
          stroke="var(--border)"
          strokeWidth={1}
          strokeDasharray="3 3"
        />
      )}
      <path
        d={path}
        fill="none"
        stroke={stroke}
        strokeWidth={1.75}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle
        cx={px(xs[xs.length - 1])}
        cy={py(ys[ys.length - 1])}
        r={2.5}
        fill={stroke}
      />
    </svg>
  );
}
