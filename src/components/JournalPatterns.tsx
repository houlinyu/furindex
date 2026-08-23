"use client";

import { useMemo, useState } from "react";
import {
  hasEnoughTimedEntries,
  toTimed,
  MIN_TIMED_ENTRIES,
  type Timed,
} from "@/lib/journal-patterns";
import {
  JOURNAL_CATEGORY_LABEL,
  type JournalCategory,
  type JournalEntry,
} from "@/lib/types";

/**
 * When, in the day, this owner logged things about this pet.
 *
 * WHY THIS VIEW EXISTS
 * Gruen et al. 2017, PLOS ONE 12(1):e0169576 (n=98 cats) measured activity as
 * strongly bimodal across the day — a morning peak around 05:30–09:00, an
 * evening peak around 17:00–23:00, a trough around 02:00–05:00 — and found
 * weekday and weekend patterns differing at p<0.0001, which they attribute to
 * the owner's schedule rather than to the animal. Time of day is the axis with
 * the largest measured effect in that literature, and a journal that records
 * only a date throws it away. "Vomiting at 3am" and "vomiting after dinner"
 * are different clinical stories, and the difference is exactly what an owner
 * cannot reconstruct from memory three weeks later.
 *
 * WHY IT CLAIMS NOTHING
 * The same paper found mean activity did NOT differ between arthritic (n=83)
 * and healthy (n=15) cats (p=0.541), and could not classify any individual
 * animal. So there is no population curve worth overlaying, no "normal" to
 * deviate from, and nothing here that could support an inference about health.
 * Everything below therefore describes one thing only: what this owner wrote
 * down, and when they said it happened. Not what it means. Not whether it is
 * unusual. The wording is deliberately kept in the second person and in the
 * past tense — "you've noted this six times, most often in the evening" — so
 * it can never be misread as a finding about the animal.
 *
 * It is also, strictly, a record of *reported* times. An owner asleep at 3am
 * logs less at 3am regardless of the pet, which is one more reason the shape
 * here is described and never interpreted.
 */

// ---------------------------------------------------------------- tunables --

/**
 * Timed entries needed before the chart is drawn at all.
 *
 * Chosen against the sentence this component is willing to say. Entries are
 * summarised into four parts of the day; under a patternless (uniform) log,
 * the chance that one part happens to hold >=60% of the entries — the bar
 * `dominantPart` requires before it will name a time of day — is about 15% at
 * n=6, 11% at n=8, 8% at n=10, and ~1% from n=12 up. (Exact multinomial, four
 * equally likely buckets.) Eight is where that false-"most often in the
 * evening" rate first drops near one in ten while still being reachable by a
 * real owner within a few weeks of logging.
 *
 * Deliberately biased toward showing nothing, in line with `lib/baselines.ts`:
 * a shape read out of six data points is the kind of thing owners remember and
 * repeat to a vet, and silence costs us nothing — the entries themselves are
 * still on screen in the timeline.
 */

/**
 * Share of timed entries one part of the day must hold before we will name it.
 * See above for the false-positive arithmetic; 0.5 was too weak (44% at n=8).
 */
const DOMINANT_SHARE = 0.6;

/**
 * Weekday and weekend are drawn as two separate small charts only when each
 * side has this many entries. Below it, one side is a handful of points and
 * putting them side by side invites a comparison the data cannot carry.
 */
const MIN_PER_DAY_TYPE = 4;

/**
 * Boundaries taken from the peaks and trough the paper actually reports, so the
 * buckets line up with the published structure rather than with round numbers.
 * `to` is exclusive; overnight wraps past midnight.
 */
const PARTS = [
  { key: "morning", label: "the morning", noun: "Morning", from: 5, to: 11 },
  { key: "afternoon", label: "the afternoon", noun: "Afternoon", from: 11, to: 17 },
  { key: "evening", label: "the evening", noun: "Evening", from: 17, to: 23 },
  { key: "overnight", label: "overnight", noun: "Overnight", from: 23, to: 5 },
] as const;

// ------------------------------------------------------------------ shared --


function partIndex(hour: number): number {
  return PARTS.findIndex((p) =>
    p.from < p.to ? hour >= p.from && hour < p.to : hour >= p.from || hour < p.to
  );
}

/** 24 counts, index = hour. */
function histogram(rows: Timed[]): number[] {
  const h = new Array(24).fill(0);
  for (const r of rows) h[r.hour] += 1;
  return h;
}

function partCounts(rows: Timed[]): number[] {
  const c = new Array(PARTS.length).fill(0);
  for (const r of rows) c[partIndex(r.hour)] += 1;
  return c;
}

/** The one part of the day worth naming, or null when the log is spread out. */
function dominantPart(rows: Timed[]): (typeof PARTS)[number] | null {
  if (rows.length === 0) return null;
  const counts = partCounts(rows);
  const max = Math.max(...counts);
  // A tie is not a pattern, however lopsided the rest looks.
  if (counts.filter((c) => c === max).length !== 1) return null;
  if (max / rows.length < DOMINANT_SHARE) return null;
  return PARTS[counts.indexOf(max)];
}

/** "9pm", "12am" — bare hour labels for axes and prose. */
function hourLabel(h: number): string {
  const suffix = h < 12 ? "am" : "pm";
  const twelve = h % 12 === 0 ? 12 : h % 12;
  return `${twelve}${suffix}`;
}

/**
 * Timed entries, parsed once. `occurred_at` is a bare wall clock with no zone,
 * and `occurred_on` is a bare date — neither is combined with the other, and
 * neither is turned into an instant, so nothing here shifts by timezone.
 */

/** Exported so the page can drop the whole section — heading included — rather
 *  than render a header over nothing. */

// --------------------------------------------------------------- component --

export default function JournalPatterns({ entries }: { entries: JournalEntry[] }) {
  const [category, setCategory] = useState<"all" | JournalCategory>("all");

  const timed = useMemo(() => toTimed(entries), [entries]);
  const untimed = entries.length - timed.length;

  const rows = useMemo(
    () => (category === "all" ? timed : timed.filter((t) => t.category === category)),
    [timed, category]
  );

  // Categories offered for filtering, with their timed counts, so the owner can
  // see before choosing that "Appetite (3)" will not draw anything.
  const options = useMemo(() => {
    const counts = new Map<JournalCategory, number>();
    for (const t of timed) counts.set(t.category, (counts.get(t.category) ?? 0) + 1);
    return [...counts.entries()].sort((a, b) => b[1] - a[1]);
  }, [timed]);

  if (timed.length < MIN_TIMED_ENTRIES) return null;

  const noun = category === "all" ? "entries" : `${JOURNAL_CATEGORY_LABEL[category].toLowerCase()} entries`;
  const part = dominantPart(rows);
  const counts = histogram(rows);
  const parts = partCounts(rows);
  const busiest = counts.indexOf(Math.max(...counts));

  const weekdays = rows.filter((r) => !r.weekend);
  const weekend = rows.filter((r) => r.weekend);
  const showSplit = weekdays.length >= MIN_PER_DAY_TYPE && weekend.length >= MIN_PER_DAY_TYPE;

  // The plain-language description. Purely a count and a shape — no comparison
  // to any other animal, no adjective that implies good or bad.
  const sentence =
    rows.length < MIN_TIMED_ENTRIES
      ? `Only ${rows.length} timed ${noun} so far — too few to show a shape.`
      : part
        ? `You've noted ${rows.length} ${noun} with a time, most often in ${part.label}.`
        : `You've noted ${rows.length} ${noun} with a time, spread across the day rather than bunched in one part of it.`;

  // The chart's text alternative. Says the same thing the picture says, in the
  // same order, so a screen reader isn't given a worse version of the page.
  const altText = `Twenty-four-hour clock of ${rows.length} timed ${noun}. ${PARTS.map(
    (p, i) => `${p.noun} ${parts[i]}`
  ).join(", ")}. Busiest hour ${hourLabel(busiest)}.`;

  return (
    <div className="card p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-2">
        <div>
          <p className="text-sm font-medium">Time of day</p>
          {/* Stated plainly and up front: this is a count of what was written
              down, not a measurement of the animal. */}
          <p className="muted text-xs">
            When you said things happened — from {timed.length} timed{" "}
            {timed.length === 1 ? "entry" : "entries"}
            {untimed > 0 && `; ${untimed} without a time ${untimed === 1 ? "isn't" : "aren't"} shown`}.
          </p>
        </div>

        {options.length > 1 && (
          <div className="flex items-center gap-2">
            <label htmlFor="pattern-category" className="muted text-xs">
              Show
            </label>
            <select
              id="pattern-category"
              value={category}
              onChange={(e) => setCategory(e.target.value as "all" | JournalCategory)}
              className="rounded-lg border border-[var(--border)] bg-transparent px-2 py-1 text-xs focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600"
            >
              <option value="all">Everything ({timed.length})</option>
              {options.map(([c, n]) => (
                <option key={c} value={c}>
                  {JOURNAL_CATEGORY_LABEL[c]} ({n})
                </option>
              ))}
            </select>
          </div>
        )}
      </div>

      {rows.length < MIN_TIMED_ENTRIES ? (
        <p className="muted mt-4 text-sm">{sentence}</p>
      ) : (
        <>
          <div className="mt-4 grid gap-4 sm:grid-cols-[minmax(0,15rem)_minmax(0,1fr)] sm:items-center">
            <ClockFace counts={counts} altText={altText} />

            <div>
              <p className="text-sm">{sentence}</p>

              <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1 text-xs sm:grid-cols-4">
                {PARTS.map((p, i) => (
                  <div key={p.key}>
                    <dt className="muted">{p.noun}</dt>
                    <dd className="font-medium">{parts[i]}</dd>
                  </div>
                ))}
              </dl>
            </div>
          </div>

          {showSplit && (
            <div className="mt-5 border-t border-[var(--border)] pt-4">
              <p className="text-sm font-medium">Weekdays and weekends, side by side</p>
              {/* Shown because owner routine is the largest reported source of
                  variation in when a pet is active (weekday vs weekend differed
                  at p<0.0001 in Gruen et al.). Shown as two separate charts
                  rather than one overlay, and never subtracted from each other:
                  there are five weekdays to two weekend days, so a bigger
                  weekday count means almost nothing on its own. */}
              <p className="muted mt-0.5 text-xs">
                There are more weekdays than weekend days, so a bigger weekday count is
                expected. These are just the two sets of entries, drawn separately.
              </p>

              <div className="mt-3 grid gap-4 sm:grid-cols-2">
                <HourStrip rows={weekdays} title="Weekdays" noun={noun} />
                <HourStrip rows={weekend} title="Weekends" noun={noun} />
              </div>
            </div>
          )}

          <details className="mt-4">
            <summary className="muted cursor-pointer text-xs">The numbers behind this</summary>
            <table className="mt-2 w-full text-xs">
              <caption className="sr-only">
                Timed {noun} by part of the day, and by hour within each part
              </caption>
              <thead>
                <tr className="muted text-left">
                  <th scope="col" className="py-1 font-medium">Part of day</th>
                  <th scope="col" className="py-1 font-medium">Hours</th>
                  <th scope="col" className="py-1 text-right font-medium">Entries</th>
                </tr>
              </thead>
              <tbody>
                {PARTS.map((p, i) => (
                  <tr key={p.key} className="border-t border-[var(--border)]">
                    <th scope="row" className="py-1 text-left font-normal">{p.noun}</th>
                    <td className="muted py-1">
                      {hourLabel(p.from)}–{hourLabel(p.to)}
                    </td>
                    <td className="py-1 text-right tabular-nums">{parts[i]}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </details>

          {/* The honest limit of this view, stated where it is read rather than
              buried: the study behind it could not tell arthritic cats from
              healthy ones by activity, so nothing here is evidence of anything. */}
          <p className="muted mt-4 text-xs">
            This is a record of what you logged, not a measurement of your pet.
            Timing varies enormously between healthy animals — in the
            study this view is based on (Gruen et al., PLOS ONE 2017), average
            activity did not distinguish arthritic cats from healthy ones and could
            not classify any individual animal. Bring the pattern to your vet as an
            observation; it isn&rsquo;t a finding on its own.
          </p>
        </>
      )}
    </div>
  );
}

// ------------------------------------------------------------------ charts --

/**
 * A 24-hour radial bar chart: midnight at the top, clockwise, one spoke per
 * hour. A clock face rather than a bar chart because the data is genuinely
 * cyclical — 11pm and 1am are adjacent in life and at opposite ends of a linear
 * axis, which is precisely where the paper's overnight trough sits.
 *
 * Dependency-free inline SVG, same choice as WeightChart and TrendCard: a chart
 * library is not worth the bundle for one series. One series, so one hue and no
 * legend; the faint track behind every hour keeps the empty hours legible
 * instead of leaving a gap that reads as missing rather than as zero.
 */
function ClockFace({ counts, altText }: { counts: number[]; altText: string }) {
  const SIZE = 280;
  const C = SIZE / 2;
  const R0 = 46;
  const R1 = 112;
  const max = Math.max(...counts, 1);

  const slice = (Math.PI * 2) / 24;
  // ~2px of surface between neighbouring segments at the outer radius.
  const gap = 0.012;
  const angle = (h: number) => h * slice - Math.PI / 2;

  const sector = (r0: number, r1: number, a0: number, a1: number) => {
    const pt = (r: number, a: number) =>
      `${(C + r * Math.cos(a)).toFixed(2)},${(C + r * Math.sin(a)).toFixed(2)}`;
    return [
      `M${pt(r0, a0)}`,
      `L${pt(r1, a0)}`,
      `A${r1},${r1} 0 0 1 ${pt(r1, a1)}`,
      `L${pt(r0, a1)}`,
      `A${r0},${r0} 0 0 0 ${pt(r0, a0)}`,
      "Z",
    ].join(" ");
  };

  return (
    <svg viewBox={`0 0 ${SIZE} ${SIZE}`} className="h-auto w-full" role="img" aria-label={altText}>
      {counts.map((n, h) => {
        const a0 = angle(h) + gap;
        const a1 = angle(h + 1) - gap;
        const r = R0 + (n / max) * (R1 - R0);
        return (
          <g key={h}>
            {/* Track: the hour exists whether or not anything was logged in it. */}
            <path d={sector(R0, R1, a0, a1)} fill="var(--border)" opacity={0.28} />
            {n > 0 && (
              <path d={sector(R0, r, a0, a1)} fill="var(--color-brand-500)">
                <title>
                  {hourLabel(h)}–{hourLabel((h + 1) % 24)}: {n}
                </title>
              </path>
            )}
          </g>
        );
      })}

      <circle cx={C} cy={C} r={R0 - 2} fill="none" stroke="var(--border)" strokeWidth={1} />

      {[
        { h: 0, x: C, y: 18, anchor: "middle" },
        { h: 6, x: SIZE - 6, y: C + 4, anchor: "end" },
        { h: 12, x: C, y: SIZE - 10, anchor: "middle" },
        { h: 18, x: 6, y: C + 4, anchor: "start" },
      ].map((t) => (
        <text
          key={t.h}
          x={t.x}
          y={t.y}
          fontSize={11}
          fill="var(--muted)"
          textAnchor={t.anchor as "middle" | "end" | "start"}
        >
          {hourLabel(t.h)}
        </text>
      ))}
    </svg>
  );
}

/**
 * The weekday/weekend small multiple. Linear rather than radial because the two
 * are read side by side, and a shared linear axis is the only fair way to
 * compare two shapes. Same hue as the clock — these are the same entries split,
 * not two different quantities, so a second colour would imply a contrast the
 * data doesn't support.
 */
function HourStrip({ rows, title, noun }: { rows: Timed[]; title: string; noun: string }) {
  const counts = histogram(rows);
  const parts = partCounts(rows);
  const max = Math.max(...counts, 1);

  const W = 240;
  const H = 54;
  const BASE = H - 12;
  const slot = W / 24;
  const barW = slot - 2; // 2px of surface between neighbouring bars

  return (
    <figure className="m-0">
      <figcaption className="muted mb-1 text-xs">
        {title} — {rows.length} {rows.length === 1 ? "entry" : "entries"}
      </figcaption>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="h-auto w-full"
        role="img"
        aria-label={`${title}: ${rows.length} timed ${noun}. ${PARTS.map(
          (p, i) => `${p.noun} ${parts[i]}`
        ).join(", ")}.`}
      >
        <line x1={0} x2={W} y1={BASE} y2={BASE} stroke="var(--border)" strokeWidth={1} />
        {counts.map((n, h) => {
          const barH = n === 0 ? 0 : ((n / max) * (BASE - 6)) || 0;
          return (
            n > 0 && (
              <rect
                key={h}
                x={h * slot + 1}
                y={BASE - barH}
                width={barW}
                height={barH}
                rx={2}
                fill="var(--color-brand-500)"
              >
                <title>
                  {hourLabel(h)}–{hourLabel((h + 1) % 24)}: {n}
                </title>
              </rect>
            )
          );
        })}
        {[0, 6, 12, 18].map((h) => (
          <text
            key={h}
            x={h * slot + barW / 2}
            y={H - 1}
            fontSize={9}
            fill="var(--muted)"
            textAnchor={h === 0 ? "start" : "middle"}
          >
            {hourLabel(h)}
          </text>
        ))}
      </svg>
    </figure>
  );
}

// Re-exported so existing imports from this module keep working.
export { hasEnoughTimedEntries };
