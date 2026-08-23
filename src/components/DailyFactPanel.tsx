"use client";

import { useEffect, useState } from "react";

type Fact = { topic: string | null; body: string };

/**
 * Loads after paint rather than blocking the dashboard — the fact is a nice
 * extra, not the reason anyone opened the app.
 */
export default function DailyFactPanel() {
  const [fact, setFact] = useState<Fact | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let alive = true;
    fetch("/api/daily-fact")
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error("failed"))))
      .then((d) => alive && setFact({ topic: d.topic ?? null, body: d.body }))
      .catch(() => alive && setFailed(true));
    return () => {
      alive = false;
    };
  }, []);

  // Stay silent on failure — a broken panel is worse than no panel.
  if (failed) return null;

  return (
    <div className="card bg-brand-50/40 p-4">
      <p className="muted mb-1 text-xs font-medium uppercase tracking-wide">
        {fact?.topic ? `Today · ${fact.topic}` : "Today"}
      </p>
      {fact ? (
        <p className="text-sm leading-relaxed">{fact.body}</p>
      ) : (
        <div className="space-y-2" aria-hidden>
          <div className="h-3 w-full animate-pulse rounded bg-[var(--border)]" />
          <div className="h-3 w-4/5 animate-pulse rounded bg-[var(--border)]" />
        </div>
      )}
    </div>
  );
}
