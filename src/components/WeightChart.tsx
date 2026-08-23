/**
 * Single-series weight sparkline. Deliberately dependency-free inline SVG —
 * a chart library is not worth the bundle for one line.
 */
export default function WeightChart({
  points,
}: {
  points: { date: string; kg: number }[];
}) {
  if (points.length < 2) return null;

  const W = 640;
  const H = 160;
  const PAD = { top: 12, right: 12, bottom: 22, left: 36 };

  const xs = points.map((p) => new Date(p.date + "T00:00:00").getTime());
  const ys = points.map((p) => p.kg);
  const xMin = Math.min(...xs);
  const xMax = Math.max(...xs);
  const yMin = Math.min(...ys);
  const yMax = Math.max(...ys);
  // Pad the y-range so a flat series doesn't collapse to a zero-height band.
  const yPad = (yMax - yMin || Math.max(yMax * 0.1, 0.5)) * 0.15;
  const y0 = yMin - yPad;
  const y1 = yMax + yPad;

  const px = (t: number) =>
    PAD.left + ((t - xMin) / (xMax - xMin || 1)) * (W - PAD.left - PAD.right);
  const py = (v: number) =>
    PAD.top + (1 - (v - y0) / (y1 - y0 || 1)) * (H - PAD.top - PAD.bottom);

  const path = points
    .map((p, i) => `${i === 0 ? "M" : "L"}${px(xs[i]).toFixed(1)},${py(p.kg).toFixed(1)}`)
    .join(" ");

  const fmtDate = (t: number) =>
    new Date(t).toLocaleDateString(undefined, { month: "short", day: "numeric" });

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      className="h-auto w-full"
      role="img"
      aria-label={`Weight from ${ys[0]} kg on ${points[0].date} to ${ys.at(-1)} kg on ${points.at(-1)!.date}`}
    >
      {[y0, (y0 + y1) / 2, y1].map((v) => (
        <g key={v}>
          <line
            x1={PAD.left}
            x2={W - PAD.right}
            y1={py(v)}
            y2={py(v)}
            stroke="var(--border)"
            strokeWidth={1}
          />
          <text x={4} y={py(v) + 4} fontSize={10} fill="var(--muted)">
            {v.toFixed(1)}
          </text>
        </g>
      ))}

      <path d={path} fill="none" stroke="var(--color-brand-500)" strokeWidth={2}
            strokeLinecap="round" strokeLinejoin="round" />

      {points.map((p, i) => (
        <circle key={p.date} cx={px(xs[i])} cy={py(p.kg)} r={3}
                fill="var(--color-brand-600)" />
      ))}

      <text x={PAD.left} y={H - 6} fontSize={10} fill="var(--muted)">
        {fmtDate(xMin)}
      </text>
      <text x={W - PAD.right} y={H - 6} fontSize={10} fill="var(--muted)" textAnchor="end">
        {fmtDate(xMax)}
      </text>
    </svg>
  );
}
