"use client";

import { useEffect, useState } from "react";

/**
 * A timestamp that survives hydration.
 *
 * THE BUG THIS FIXES
 * `new Date(iso).toLocaleString(undefined, …)` asks the runtime for its own
 * timezone. On the server that runtime is a Vercel function in UTC; in the
 * browser it is the reader's actual zone. The two produce different text for
 * the same instant, so React threw error #418 (hydration text mismatch) on
 * every community feed render in production — invisible locally, because a dev
 * machine's server and browser share a timezone.
 *
 * THE FIX
 * Render a fixed-UTC string on the server AND on the first client render, so
 * hydration compares identical text. Only after mount does it swap to the
 * reader's local time. There is no flash of wrong content in practice — the
 * effect runs in the same frame as hydration — and, more importantly, a reader
 * with JavaScript disabled still gets a real timestamp rather than nothing.
 *
 * Do not "simplify" this to a bare toLocaleString, and do not reach for
 * suppressHydrationWarning: that silences the console while leaving the text
 * genuinely wrong until React repaints it.
 */
export default function LocalDateTime({
  iso,
  withTime = true,
  className,
}: {
  iso: string;
  /** Off for date-only contexts, where a time would be noise. */
  withTime?: boolean;
  className?: string;
}) {
  const options: Intl.DateTimeFormatOptions = withTime
    ? { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }
    : { year: "numeric", month: "short", day: "numeric" };

  // The deterministic version both sides agree on.
  const utc = new Intl.DateTimeFormat("en-GB", { ...options, timeZone: "UTC" }).format(
    new Date(iso)
  );
  const [label, setLabel] = useState(utc);

  useEffect(() => {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return;
    setLabel(d.toLocaleString(undefined, options));
    // `options` is rebuilt every render, so it is deliberately not a dependency
    // — iso and withTime are what actually change the output.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [iso, withTime]);

  if (Number.isNaN(new Date(iso).getTime())) return <span className={className}>—</span>;

  return (
    <time dateTime={iso} className={className}>
      {label}
    </time>
  );
}
