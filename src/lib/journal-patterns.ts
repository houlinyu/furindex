import { parseWallClock } from "@/lib/format";
import type { JournalEntry } from "@/lib/types";

/**
 * The pure layer behind JournalPatterns.
 *
 * It lives here, not in the component, because that component is "use client".
 * A server component importing a value from a client module compiles fine and
 * then throws at request time in a production build — which took every pet page
 * down until it was caught. Anything the server needs to call belongs in a
 * server-safe module.
 */

export type Timed = {
  hour: number;
  weekend: boolean;
  category: JournalEntry["category"];
};

/**
 * Eight, because the sentence this gates ("most often in the evening") is a
 * claim. Under a patternless log the chance one quarter of the day holds a 60%
 * share is ~11% at n=8 and ~44% at a 50% bar — so 8 is where the false-pattern
 * rate first drops near one in ten while still being reachable in a few weeks.
 */
export const MIN_TIMED_ENTRIES = 8;

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

export function hasEnoughTimedEntries(entries: JournalEntry[]): boolean {
  return toTimed(entries).length >= MIN_TIMED_ENTRIES;
}
