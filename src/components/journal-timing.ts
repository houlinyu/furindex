import { parseWallClock } from "@/lib/format";
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
export const MIN_TIMED_ENTRIES = 8;

/**
 * Share of timed entries one part of the day must hold before we will name it.
 * See above for the false-positive arithmetic; 0.5 was too weak (44% at n=8).
 */
export const DOMINANT_SHARE = 0.6;

/**
 * Weekday and weekend are drawn as two separate small charts only when each
 * side has this many entries. Below it, one side is a handful of points and
 * putting them side by side invites a comparison the data cannot carry.
 */
export const MIN_PER_DAY_TYPE = 4;

/**
 * Boundaries taken from the peaks and trough the paper actually reports, so the
 * buckets line up with the published structure rather than with round numbers.
 * `to` is exclusive; overnight wraps past midnight.
 */
export const PARTS = [
  { key: "morning", label: "the morning", noun: "Morning", from: 5, to: 11 },
  { key: "afternoon", label: "the afternoon", noun: "Afternoon", from: 11, to: 17 },
  { key: "evening", label: "the evening", noun: "Evening", from: 17, to: 23 },
  { key: "overnight", label: "overnight", noun: "Overnight", from: 23, to: 5 },
] as const;

// ------------------------------------------------------------------ shared --

export type Timed = { hour: number; weekend: boolean; category: JournalCategory };

export function partIndex(hour: number): number {
  return PARTS.findIndex((p) =>
    p.from < p.to ? hour >= p.from && hour < p.to : hour >= p.from || hour < p.to
  );
}

/** 24 counts, index = hour. */
export function histogram(rows: Timed[]): number[] {
  const h = new Array(24).fill(0);
  for (const r of rows) h[r.hour] += 1;
  return h;
}

export function partCounts(rows: Timed[]): number[] {
  const c = new Array(PARTS.length).fill(0);
  for (const r of rows) c[partIndex(r.hour)] += 1;
  return c;
}

/** The one part of the day worth naming, or null when the log is spread out. */
export function dominantPart(rows: Timed[]): (typeof PARTS)[number] | null {
  if (rows.length === 0) return null;
  const counts = partCounts(rows);
  const max = Math.max(...counts);
  // A tie is not a pattern, however lopsided the rest looks.
  if (counts.filter((c) => c === max).length !== 1) return null;
  if (max / rows.length < DOMINANT_SHARE) return null;
  return PARTS[counts.indexOf(max)];
}

/** "9pm", "12am" — bare hour labels for axes and prose. */
export function hourLabel(h: number): string {
  const suffix = h < 12 ? "am" : "pm";
  const twelve = h % 12 === 0 ? 12 : h % 12;
  return `${twelve}${suffix}`;
}

/**
 * Timed entries, parsed once. `occurred_at` is a bare wall clock with no zone,
 * and `occurred_on` is a bare date — neither is combined with the other, and
 * neither is turned into an instant, so nothing here shifts by timezone.
 */
export function toTimed(entries: JournalEntry[]): Timed[] {
  const out: Timed[] = [];
  for (const e of entries) {
    const mins = parseWallClock(e.occurred_at);
    if (mins == null) continue;
    // Midnight-anchored local parse, same convention as lib/format.ts.
    const day = new Date(e.occurred_on + "T00:00:00").getDay();
    if (Number.isNaN(day)) continue;
    out.push({
      hour: Math.floor(mins / 60),
      weekend: day === 0 || day === 6,
      category: e.category,
    });
  }
  return out;
}

/** Exported so the page can drop the whole section — heading included — rather
 *  than render a header over nothing. */
export function hasEnoughTimedEntries(entries: JournalEntry[]): boolean {
  return toTimed(entries).length >= MIN_TIMED_ENTRIES;
}
