import JournalPatternsChart from "@/components/JournalPatternsChart";
import type { JournalEntry } from "@/lib/types";

/**
 * Server-safe entry point for the journal "time of day" view.
 *
 * WHY THIS FILE IS A SHELL
 * The pet page is a server component and calls `hasEnoughTimedEntries()` to
 * decide whether to render the section's heading at all. When that function
 * lived in the same module as the chart — a `"use client"` module — the export
 * was a client *reference*, not a function, and calling it during the server
 * render threw ("Attempted to call hasEnoughTimedEntries() from the server").
 * It only surfaced in a production build, which is why it shipped.
 *
 * So the arithmetic lives in `journal-timing.ts` (no directive, callable from
 * either side), the interactive chart lives in `JournalPatternsChart.tsx`, and
 * this module re-exports both under the names the page already imports.
 */
export { hasEnoughTimedEntries } from "@/components/journal-timing";

export default function JournalPatterns({ entries }: { entries: JournalEntry[] }) {
  return <JournalPatternsChart entries={entries} />;
}
