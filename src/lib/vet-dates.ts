/**
 * Date reading for the local (no-model) extractor.
 *
 * The hard case is `03/04/2026`. A US clinic means 3 March; a UK clinic means
 * 3 April. Guessing is not acceptable — a wrong vaccination date silently
 * shifts a booster reminder by a month. So:
 *
 *   1. Textual dates ("August 14, 2026", "14 August 2026", "2026-08-14") are
 *      unambiguous and are read directly.
 *   2. A numeric date whose first field is > 12 can only be D/M/Y; one whose
 *      second field is > 12 can only be M/D/Y. Those resolve themselves.
 *   3. If a document contains self-resolving dates that all point one way, the
 *      document's own convention is established and the remaining numeric dates
 *      are read with it. This is a determination about the document's format,
 *      not a guess about its content — but it is still recorded as `inferred`
 *      so the caller can hold confidence down.
 *   4. Otherwise the date is ambiguous and comes back null. Never a guess.
 */

export type DateOrder = "mdy" | "dmy" | "unknown";

export interface ParsedDate {
  /** ISO YYYY-MM-DD, or null when the date could not be resolved. */
  iso: string | null;
  /** Exactly as printed. */
  raw: string;
  /** True when the day/month order could not be settled at all. */
  ambiguous: boolean;
  /** True when the order came from the document's other dates, not this one. */
  inferred: boolean;
}

const MONTHS: Record<string, number> = {
  jan: 1, january: 1, feb: 2, febr: 2, february: 2, mar: 3, march: 3,
  apr: 4, april: 4, may: 5, jun: 6, june: 6, jul: 7, july: 7,
  aug: 8, august: 8, sep: 9, sept: 9, september: 9, oct: 10, october: 10,
  nov: 11, november: 11, dec: 12, december: 12,
};

const MONTH_WORD = Object.keys(MONTHS).join("|");

/** `08/14/2026`, `8-2-26`, `03.04.2026` */
const NUMERIC_RE = /\b(\d{1,2})\s*[/.\-]\s*(\d{1,2})\s*[/.\-]\s*(\d{2,4})\b/g;
/** `2026-08-14`, and the same order written with `/` or `.` separators. */
// Trailing (?!\d) rather than \b so an ISO-8601 datetime keeps its date: a
// practice-management export prints "2026-08-14T09:30", where a \b between the
// day digit and the letter T would fail and drop the whole date.
const ISO_RE = /\b(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})(?!\d)/g;
/** `August 14, 2026` / `Aug 14 2026` / `Aug-14-2026` / `Sept. 3, 2026` */
const MDY_WORD_RE = new RegExp(`\\b(${MONTH_WORD})\\.?[\\s.\\-]+(\\d{1,2})(?:st|nd|rd|th)?[,\\s.\\-]+(\\d{4})\\b`, "gi");
/** `14 August 2026` / `14th August 2026` / `14-Aug-2026` / `3 Sept 2026` */
const DMY_WORD_RE = new RegExp(`\\b(\\d{1,2})(?:st|nd|rd|th)?[\\s.\\-]+(${MONTH_WORD})\\.?[,\\s.\\-]+(\\d{4})\\b`, "gi");

function isRealDate(y: number, m: number, d: number): boolean {
  if (m < 1 || m > 12 || d < 1 || d > 31) return false;
  if (y < 1970 || y > 2100) return false;
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
}

function iso(y: number, m: number, d: number): string {
  return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

/** Two-digit years: 00–69 → 2000s, 70–99 → 1900s. The usual pivot. */
function fullYear(raw: string): number {
  const n = Number(raw);
  if (raw.length === 4) return n;
  return n <= 69 ? 2000 + n : 1900 + n;
}

export interface DateHit {
  raw: string;
  /** Index in the source string, so the caller can look at what precedes it. */
  index: number;
  parse: (order: DateOrder) => ParsedDate;
}

/** Every date-shaped run in `text`, left to right, without resolving order yet. */
export function findDates(text: string): DateHit[] {
  const hits: DateHit[] = [];
  const claimed: Array<[number, number]> = [];

  const claim = (start: number, end: number) => {
    if (claimed.some(([s, e]) => start < e && end > s)) return false;
    claimed.push([start, end]);
    return true;
  };

  const push = (m: RegExpExecArray, parse: (o: DateOrder) => ParsedDate) => {
    if (!claim(m.index, m.index + m[0].length)) return;
    hits.push({ raw: m[0], index: m.index, parse });
  };

  // Textual and ISO forms first — they are unambiguous, and claiming their
  // span stops the numeric matcher from re-reading a fragment of them.
  for (const m of text.matchAll(ISO_RE)) {
    const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
    if (!isRealDate(y, mo, d)) continue;
    push(m as RegExpExecArray, () => ({ iso: iso(y, mo, d), raw: m[0], ambiguous: false, inferred: false }));
  }
  for (const m of text.matchAll(MDY_WORD_RE)) {
    const mo = MONTHS[m[1].toLowerCase()];
    const [d, y] = [Number(m[2]), Number(m[3])];
    if (!mo || !isRealDate(y, mo, d)) continue;
    push(m as RegExpExecArray, () => ({ iso: iso(y, mo, d), raw: m[0], ambiguous: false, inferred: false }));
  }
  for (const m of text.matchAll(DMY_WORD_RE)) {
    const mo = MONTHS[m[2].toLowerCase()];
    const [d, y] = [Number(m[1]), Number(m[3])];
    if (!mo || !isRealDate(y, mo, d)) continue;
    push(m as RegExpExecArray, () => ({ iso: iso(y, mo, d), raw: m[0], ambiguous: false, inferred: false }));
  }
  for (const m of text.matchAll(NUMERIC_RE)) {
    const a = Number(m[1]);
    const b = Number(m[2]);
    const y = fullYear(m[3]);
    const mdyOk = isRealDate(y, a, b);
    const dmyOk = isRealDate(y, b, a);
    if (!mdyOk && !dmyOk) continue;
    push(m as RegExpExecArray, (order) => {
      const raw = m[0];
      if (mdyOk && !dmyOk) return { iso: iso(y, a, b), raw, ambiguous: false, inferred: false };
      if (dmyOk && !mdyOk) return { iso: iso(y, b, a), raw, ambiguous: false, inferred: false };
      // Both readings are real dates: only the document's convention can say.
      if (order === "mdy") return { iso: iso(y, a, b), raw, ambiguous: false, inferred: true };
      if (order === "dmy") return { iso: iso(y, b, a), raw, ambiguous: false, inferred: true };
      return { iso: null, raw, ambiguous: true, inferred: false };
    });
  }

  return hits.sort((x, y2) => x.index - y2.index);
}

/**
 * Which way round the document writes numeric dates, judged only from dates
 * that can only be read one way. Contradictory evidence yields "unknown" —
 * a document that contains both 14/08 and 08/14 is not going to be untangled
 * by a rules parser, and should not pretend otherwise.
 */
export function detectDateOrder(text: string): DateOrder {
  let mdyOnly = 0;
  let dmyOnly = 0;
  for (const m of text.matchAll(NUMERIC_RE)) {
    const a = Number(m[1]);
    const b = Number(m[2]);
    const y = fullYear(m[3]);
    const mdyOk = isRealDate(y, a, b);
    const dmyOk = isRealDate(y, b, a);
    if (mdyOk && !dmyOk) mdyOnly++;
    else if (dmyOk && !mdyOk) dmyOnly++;
  }
  if (mdyOnly > 0 && dmyOnly === 0) return "mdy";
  if (dmyOnly > 0 && mdyOnly === 0) return "dmy";
  return "unknown";
}

/** Convenience: the first date in a string, resolved with `order`. */
export function parseFirstDate(text: string, order: DateOrder): ParsedDate | null {
  const hits = findDates(text);
  return hits.length ? hits[0].parse(order) : null;
}
