/**
 * Feature 1 — the pet at the centre, information orbiting it.
 * Inline SVG rather than a screenshot: it survives theme changes, scales without
 * blurring, and reads as "connected" in a way a cropped UI shot cannot.
 */
const NODES = [
  { icon: "🪪", label: "Identity" },
  { icon: "❤️", label: "Health" },
  { icon: "⚖️", label: "Weight" },
  { icon: "🥣", label: "Nutrition" },
  { icon: "🐾", label: "Behaviour" },
  { icon: "💊", label: "Medication" },
  { icon: "📅", label: "Care" },
  { icon: "👤", label: "Caretakers" },
];

export default function ProfileArt() {
  const cx = 160, cy = 160, r = 104;
  return (
    <svg
      viewBox="0 0 320 320"
      className="h-auto w-full"
      role="img"
      aria-label="A pet at the centre of eight connected categories: identity, health, weight, nutrition, behaviour, medication, care and caretakers."
    >
      <circle cx={cx} cy={cy} r={r} fill="none" stroke="var(--border)" strokeWidth={1} strokeDasharray="3 5" />
      {NODES.map((n, i) => {
        const a = (i / NODES.length) * Math.PI * 2 - Math.PI / 2;
        const x = cx + Math.cos(a) * r;
        const y = cy + Math.sin(a) * r;
        return (
          <g key={n.label}>
            <line x1={cx} y1={cy} x2={x} y2={y} stroke="var(--border)" strokeWidth={1} />
            <circle cx={x} cy={y} r={21} fill="var(--surface)" stroke="var(--color-brand-300)" strokeWidth={1.5} />
            <text x={x} y={y + 6} fontSize={16} textAnchor="middle">{n.icon}</text>
            <text x={x} y={y + 35} fontSize={9} textAnchor="middle" fill="var(--muted)">{n.label}</text>
          </g>
        );
      })}
      <circle cx={cx} cy={cy} r={42} fill="var(--color-brand-600)" />
      <text x={cx} y={cy + 14} fontSize={40} textAnchor="middle">🐕</text>
    </svg>
  );
}
