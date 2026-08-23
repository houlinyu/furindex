/**
 * Feature 2 — a week of care with who did what. The picture is about caretaker
 * attribution, not the grid: shared responsibility is the actual feature.
 */
const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const EVENTS = [
  { day: 0, icon: "🥣", who: "Diana", done: true, label: "Breakfast" },
  { day: 1, icon: "🐕", who: "Alex", done: true, label: "Walk" },
  { day: 2, icon: "💊", who: "Sitter", done: false, label: "Medication" },
  { day: 4, icon: "🩺", who: "Diana", done: false, label: "Vet visit" },
  { day: 5, icon: "🧼", who: "Alex", done: false, label: "Grooming" },
];

export default function CalendarArt() {
  return (
    <div className="w-full">
      <div className="mb-1.5 grid grid-cols-7 gap-1.5">
        {DAYS.map((d) => (
          <div key={d} className="muted text-center text-[10px] font-medium uppercase">
            {d.slice(0, 1)}
          </div>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-1.5">
        {DAYS.map((d, i) => {
          const ev = EVENTS.find((e) => e.day === i);
          return (
            <div
              key={d}
              className={`flex aspect-square flex-col items-center justify-center rounded-lg border ${
                ev ? "border-brand-300 bg-brand-50/60" : "border-[var(--border)]"
              }`}
            >
              {ev && (
                <>
                  <span className="text-base leading-none">{ev.icon}</span>
                  <span className="muted mt-0.5 text-[8px] leading-none">{ev.who}</span>
                  {ev.done && <span className="text-[9px] leading-none text-[var(--brand-text)]">✓</span>}
                </>
              )}
            </div>
          );
        })}
      </div>
      <ul className="mt-3 space-y-1.5">
        {EVENTS.slice(0, 3).map((e) => (
          <li key={e.label} className="flex items-center gap-2 text-xs">
            <span aria-hidden>{e.icon}</span>
            <span className="flex-1 truncate">{e.label}</span>
            <span className="muted text-[10px]">{e.who}</span>
            <span className={e.done ? "text-[var(--brand-text)]" : "muted"}>{e.done ? "done" : "due"}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
