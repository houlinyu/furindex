import type { CleanPoint } from "@/lib/baselines";

export type ChartMarker = {
  /** "YYYY-MM-DD". */
  date: string;
  kind: MarkerKind;
  /** What it was, for the accessible description. */
  label: string;
};

export type MarkerKind = "journal" | "meal" | "skipped" | "check";

export const MARKER_LABEL: Record<MarkerKind, string> = {
  journal: "Journal note",
  meal: "Meal logged",
  skipped: "Meal skipped",
  check: "Health check",
};

/**
 * A single numeric series with the owner's manual log entries overlaid on the
 * same timeline.
 *
 * Same dependency-free inline SVG as WeightChart and TrendCard's sparkline — a
 * chart library is still not worth the bundle, and this is a server component,
 * so the whole thing costs zero client JS.
 *
 * The markers live in their own lane under the plot rather than on the line.
 * On the line they would read as data points of the series, which they are
 * not: a journal note is not a weight reading, and putting the two in the same
 * visual channel is exactly the blurring of sources this dashboard exists to
 * avoid. Each kind gets its own SHAPE, not just its own colour, so the lane
 * survives a colour-blind reader and a bad phone screen.
 */
export default function OverlayChart({
  points,
  unit,
  baselineMean,
  markers = [],
  altText,
}: {
  points: CleanPoint[];
  unit?: string | null;
  /** The owner's own reference level. Drawn dashed, never labelled "normal". */
  baselineMean?: number | null;
  markers?: ChartMarker[];
  altText: string;
}) {
  if (points.length < 2) return null;

  const W = 640;
  const H = 190;
  const PAD = { top: 26, right: 12, bottom: 52, left: 42 };
  const LANE_Y = H - 34; // marker lane baseline
  const AXIS_Y = H - 6;

  const dayMs = (d: string) => new Date(d.slice(0, 10) + "T00:00:00").getTime();

  const xs = points.map((p) => dayMs(p.date));
  const markerXs = markers
    .map((m) => dayMs(m.date))
    .filter((t) => Number.isFinite(t));

  // The x domain covers the markers too: otherwise a note written after the
  // last reading would silently vanish, and "no marker" would be a lie.
  const xMin = Math.min(...xs, ...(markerXs.length ? markerXs : xs));
  const xMax = Math.max(...xs, ...(markerXs.length ? markerXs : xs));

  const ys = points.map((p) => p.value);
  const candidates = baselineMean == null ? ys : [...ys, baselineMean];
  const yLo = Math.min(...candidates);
  const yHi = Math.max(...candidates);
  const yPad = (yHi - yLo || Math.max(Math.abs(yHi) * 0.1, 0.5)) * 0.15;
  // Don't let the breathing room push the axis below zero for a series that
  // cannot be negative — a "-0.02 g" tick is a number nobody could ever record,
  // and an axis label that can't happen undermines the ones that can.
  const padded = yLo - yPad;
  const y0 = yLo >= 0 && padded < 0 ? 0 : padded;
  const y1 = yHi + yPad;

  const px = (t: number) =>
    PAD.left + ((t - xMin) / (xMax - xMin || 1)) * (W - PAD.left - PAD.right);
  const py = (v: number) =>
    PAD.top + (1 - (v - y0) / (y1 - y0 || 1)) * (H - PAD.top - PAD.bottom);

  const path = points
    .map((p, i) => `${i === 0 ? "M" : "L"}${px(xs[i]).toFixed(1)},${py(p.value).toFixed(1)}`)
    .join(" ");

  const fmtDate = (t: number) =>
    new Date(t).toLocaleDateString(undefined, { month: "short", day: "numeric" });

  // One glyph per day per kind — three notes on a Tuesday is still one Tuesday.
  const seen = new Set<string>();
  const lanes: MarkerKind[] = ["journal", "meal", "skipped", "check"];
  const drawn = markers
    .filter((m) => {
      const t = dayMs(m.date);
      if (!Number.isFinite(t)) return false;
      const key = `${m.date}|${m.kind}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .map((m) => ({ ...m, x: px(dayMs(m.date)), row: lanes.indexOf(m.kind) }));

  const yTicks = [y0, (y0 + y1) / 2, y1];

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full" role="img" aria-label={altText}>
      {yTicks.map((v, i) => (
        <g key={i}>
          <line
            x1={PAD.left}
            x2={W - PAD.right}
            y1={py(v)}
            y2={py(v)}
            stroke="var(--border)"
            strokeWidth={1}
          />
          <text x={4} y={py(v) + 4} fontSize={10} fill="var(--muted)">
            {formatTick(v)}
          </text>
        </g>
      ))}

      {baselineMean != null && (
        <line
          x1={PAD.left}
          x2={W - PAD.right}
          y1={py(baselineMean)}
          y2={py(baselineMean)}
          stroke="var(--muted)"
          strokeWidth={1}
          strokeDasharray="4 4"
          opacity={0.7}
        />
      )}

      <path
        d={path}
        fill="none"
        stroke="var(--color-brand-500)"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {points.map((p, i) => (
        <circle key={p.date} cx={px(xs[i])} cy={py(p.value)} r={2.75} fill="var(--color-brand-600)" />
      ))}

      {/* Marker lane. Separated from the plot by a rule so nobody reads a
          journal note as a reading of the series above it. */}
      <line
        x1={PAD.left}
        x2={W - PAD.right}
        y1={LANE_Y - 12}
        y2={LANE_Y - 12}
        stroke="var(--border)"
        strokeWidth={1}
      />
      {drawn.map((m, i) => (
        <g key={`${m.date}-${m.kind}-${i}`}>
          {/* Routine meals get no guide line into the plot. They happen twice a
              day, so a line each would be a picket fence over the series and
              would bury the markers that actually single a day out. */}
          {m.kind !== "meal" && (
            <line
              x1={m.x}
              x2={m.x}
              y1={PAD.top}
              y2={LANE_Y - 12}
              stroke="var(--border)"
              strokeWidth={1}
              opacity={0.55}
            />
          )}
          <MarkerGlyph kind={m.kind} x={m.x} y={LANE_Y} />
          <title>{`${m.label} — ${m.date}`}</title>
        </g>
      ))}

      <text x={PAD.left} y={AXIS_Y} fontSize={10} fill="var(--muted)">
        {fmtDate(xMin)}
      </text>
      <text x={W - PAD.right} y={AXIS_Y} fontSize={10} fill="var(--muted)" textAnchor="end">
        {fmtDate(xMax)}
      </text>
      {unit && (
        // Above the y ticks, not centred on the x axis — between two dates it
        // reads as a third date rather than as the unit of the scale.
        <text x={4} y={11} fontSize={10} fill="var(--muted)">
          {unit}
        </text>
      )}
    </svg>
  );
}

/** Shape per kind — colour is a secondary channel, never the only one. */
function MarkerGlyph({ kind, x, y }: { kind: MarkerKind; x: number; y: number }) {
  const stroke = "var(--muted)";
  switch (kind) {
    case "journal":
      return (
        <polygon
          points={`${x},${y - 5} ${x + 4.5},${y} ${x},${y + 5} ${x - 4.5},${y}`}
          fill={stroke}
        />
      );
    case "meal":
      // A thin tick, not a block: a run of them should read as a density strip
      // rather than as a solid bar that hides the notes beside it.
      return <rect x={x - 1} y={y - 4} width={2} height={8} fill={stroke} />;
    case "skipped":
      return (
        <rect
          x={x - 3.5}
          y={y - 3.5}
          width={7}
          height={7}
          fill="none"
          stroke={stroke}
          strokeWidth={1.4}
        />
      );
    case "check":
      return (
        <polygon points={`${x},${y - 5} ${x + 4.5},${y + 4} ${x - 4.5},${y + 4}`} fill={stroke} />
      );
  }
}

function formatTick(v: number): string {
  const abs = Math.abs(v);
  const decimals = abs >= 100 ? 0 : abs >= 10 ? 1 : 2;
  return `${parseFloat(v.toFixed(decimals))}`;
}

/** The legend, as HTML — SVG text at this size is a readability problem. */
export function MarkerLegend({ kinds }: { kinds: MarkerKind[] }) {
  const unique = [...new Set(kinds)];
  if (unique.length === 0) return null;
  return (
    <ul className="muted mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[0.6875rem]">
      {unique.map((k) => (
        <li key={k} className="flex items-center gap-1.5">
          <svg width={12} height={12} viewBox="0 0 12 12" aria-hidden>
            <MarkerGlyph kind={k} x={6} y={6} />
          </svg>
          {MARKER_LABEL[k]}
        </li>
      ))}
    </ul>
  );
}
