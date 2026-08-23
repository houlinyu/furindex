/**
 * Pure date arithmetic and bucketing for care reminders.
 *
 * Everything in this file works on bare "YYYY-MM-DD" strings and plain
 * integers. Nothing here constructs a `Date` to do arithmetic with, and that is
 * deliberate — see the two hazards below, both of which produce a reminder that
 * silently fires on the wrong day.
 *
 * ── HAZARD 1: DST ───────────────────────────────────────────────────────────
 * The obvious way to add a week is `new Date(due + "T00:00:00").getTime() +
 * 7 * 86_400_000`. In any zone that observes daylight saving, one week a year
 * contains a 25-hour day, and seven literal 24-hour spans do not cross it.
 * Measured in America/New_York, 2026-10-29 + 7 days that way lands on
 * 2026-11-04 at 23:00 — a reminder set for the 5th that fires on the 4th.
 *
 * Reaching for `.toISOString().slice(0,10)` to read the date back instead swaps
 * one bug for a worse one, because that returns the UTC day: in
 * Pacific/Auckland the same arithmetic reads 2026-11-04 for a local 2026-11-05,
 * and it is off by a day for part of every day of the year, DST or not.
 *
 * Reminders are calendar objects, not instants: "a month from the 14th" is the
 * 14th, whatever the clocks did in between. So all arithmetic here runs on the
 * proleptic Gregorian calendar as integers (`daysFromCivil` / `civilFromDays`,
 * Howard Hinnant's algorithms), which has no hours in it at all and therefore
 * nothing for DST or UTC offsets to shift. Verified across both transitions in
 * both hemispheres.
 *
 * ── HAZARD 2: month-end ─────────────────────────────────────────────────────
 * 31 January plus one month is not 31 February. `setMonth()` rolls that over to
 * 2 or 3 March, so a flea treatment set for the 31st drifts forward a few days
 * every short month and eventually detaches from the date the owner chose.
 * `addMonths` clamps to the last real day of the target month instead: 31 Jan +
 * 1 month = 28 Feb (29 in a leap year), and 31 Mar + 1 month = 30 Apr.
 *
 * Clamping is not the same as remembering. A reminder anchored on the 31st and
 * completed on time each month reads 31 Jan → 28 Feb → 28 Mar, not back to the
 * 31st. That is the honest behaviour here, because the next due date is always
 * computed from the completion (see `nextDueAfterCompletion`), and the day the
 * owner actually gave the treatment is the day the cycle now runs on.
 */

import type { CareInterval, CareReminder } from "@/lib/types";

// ------------------------------------------------------------ civil dates --

export type CivilDate = { year: number; month: number; day: number };

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

/** Days in `month` (1-12) of `year`, Gregorian, leap years included. */
export function daysInMonth(year: number, month: number): number {
  if (month === 2) {
    const leap = (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
    return leap ? 29 : 28;
  }
  return [4, 6, 9, 11].includes(month) ? 30 : 31;
}

/**
 * "2026-02-30" is a string that parses and a date that does not exist. Strict,
 * because a bad date that silently becomes 2 March is worse than one rejected.
 */
export function parseDate(iso: string | null | undefined): CivilDate | null {
  if (!iso) return null;
  const m = ISO_DATE.exec(iso.trim());
  if (!m) return null;
  const year = Number(m[1]);
  const month = Number(m[2]);
  const day = Number(m[3]);
  if (month < 1 || month > 12) return null;
  if (day < 1 || day > daysInMonth(year, month)) return null;
  return { year, month, day };
}

export function toISO(d: CivilDate): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.year}-${pad(d.month)}-${pad(d.day)}`;
}

/** Days since 1970-01-01, pure integer maths. Hinnant's days_from_civil. */
export function daysFromCivil({ year, month, day }: CivilDate): number {
  const y = year - (month <= 2 ? 1 : 0);
  const era = Math.floor(y / 400);
  const yoe = y - era * 400;
  const doy = Math.floor((153 * (month + (month > 2 ? -3 : 9)) + 2) / 5) + day - 1;
  const doe = yoe * 365 + Math.floor(yoe / 4) - Math.floor(yoe / 100) + doy;
  return era * 146097 + doe - 719468;
}

/** The inverse. Hinnant's civil_from_days. */
export function civilFromDays(z: number): CivilDate {
  const zz = z + 719468;
  const era = Math.floor(zz / 146097);
  const doe = zz - era * 146097;
  const yoe = Math.floor(
    (doe - Math.floor(doe / 1460) + Math.floor(doe / 36524) - Math.floor(doe / 146096)) / 365
  );
  const y = yoe + era * 400;
  const doy = doe - (365 * yoe + Math.floor(yoe / 4) - Math.floor(yoe / 100));
  const mp = Math.floor((5 * doy + 2) / 153);
  const day = doy - Math.floor((153 * mp + 2) / 5) + 1;
  const month = mp + (mp < 10 ? 3 : -9);
  return { year: y + (month <= 2 ? 1 : 0), month, day };
}

/** Whole calendar days from `from` to `to`. Negative when `to` is earlier. */
export function daysBetween(from: string, to: string): number | null {
  const a = parseDate(from);
  const b = parseDate(to);
  if (!a || !b) return null;
  return daysFromCivil(b) - daysFromCivil(a);
}

/** Add whole days. No hours involved, so DST cannot reach it. */
export function addDays(iso: string, n: number): string | null {
  const d = parseDate(iso);
  if (!d) return null;
  return toISO(civilFromDays(daysFromCivil(d) + n));
}

/**
 * Add whole months, clamping to the last real day of the target month.
 * 2026-01-31 + 1 → 2026-02-28. 2024-01-31 + 1 → 2024-02-29. 2026-03-31 + 1 →
 * 2026-04-30. Never rolls over into the following month.
 */
export function addMonths(iso: string, n: number): string | null {
  const d = parseDate(iso);
  if (!d) return null;
  const total = d.year * 12 + (d.month - 1) + n;
  const year = Math.floor(total / 12);
  const month = total - year * 12 + 1;
  return toISO({ year, month, day: Math.min(d.day, daysInMonth(year, month)) });
}

// -------------------------------------------------------------- intervals --

/** Every interval expressed as its step. One place to read the rhythm off. */
const STEP: Record<CareInterval, { months: number } | { days: number } | null> = {
  none: null,
  weekly: { days: 7 },
  monthly: { months: 1 },
  quarterly: { months: 3 },
  biannual: { months: 6 },
  annual: { months: 12 },
};

/**
 * The next occurrence of `interval` measured from `from`. Null for a one-off,
 * which has no next occurrence — that is an answer, not a failure.
 */
export function nextOccurrence(from: string, interval: CareInterval): string | null {
  const step = STEP[interval];
  if (!step) return null;
  return "days" in step ? addDays(from, step.days) : addMonths(from, step.months);
}

/**
 * Where the next due date goes once something is marked done.
 *
 * Measured from the COMPLETION DATE, never from the old due date. This is the
 * single most consequential decision in the whole feature. Advancing from the
 * old due date means an owner who gives a monthly treatment four days late is
 * immediately four days late again next month, and every month after that,
 * forever — the app nags on a schedule the owner has already demonstrated they
 * don't keep, and the overdue badge becomes background noise they learn to
 * ignore. Advancing from the completion re-anchors the cycle on what actually
 * happened: treated on the 8th, next one due the 8th.
 *
 * The cost is that the date drifts away from the one originally chosen. That is
 * the correct trade for a protection interval — a flea treatment protects for a
 * month from the dose, not from the calendar square — and for check-ups and
 * grooming the drift is what the owner meant anyway.
 */
export function nextDueAfterCompletion(
  interval: CareInterval,
  completedOn: string
): string | null {
  return nextOccurrence(completedOn, interval);
}

/**
 * Where a snooze lands. Pushes forward from whichever is later, today or the
 * existing due date, so a snooze can never quietly pull a future reminder
 * closer. A snooze deliberately does NOT touch `last_completed_on`: deferring a
 * thing is not doing it, and a record that conflates the two is worthless when
 * an owner later asks when the last dose actually was.
 */
export function snoozedDueDate(dueOn: string, today: string, days: number): string | null {
  const base = parseDate(dueOn) && dueOn > today ? dueOn : today;
  return addDays(base, days);
}

// ---------------------------------------------------------------- buckets --

/** How soon "soon" is. A week is the horizon an owner can act inside. */
export const SOON_DAYS = 7;

export type ReminderBucket = "overdue" | "soon" | "later";

export const BUCKET_LABEL: Record<ReminderBucket, string> = {
  overdue: "Overdue",
  soon: "This week",
  later: "Later",
};

/**
 * Which pile a due date falls in, relative to `today`. Both are bare dates, so
 * this is a calendar comparison and not a clock one — something due today is
 * "this week" all day, not overdue from one minute past midnight.
 */
export function bucketFor(dueOn: string, today: string): ReminderBucket {
  const days = daysBetween(today, dueOn);
  if (days === null) return "later";
  if (days < 0) return "overdue";
  return days <= SOON_DAYS ? "soon" : "later";
}

export type GroupedReminders = {
  overdue: CareReminder[];
  soon: CareReminder[];
  later: CareReminder[];
};

/**
 * Split a list into the three piles, each sorted soonest-first. Inactive
 * reminders are dropped: they were retired on purpose and re-surfacing them
 * would be the app arguing with the owner.
 */
export function groupReminders(reminders: CareReminder[], today: string): GroupedReminders {
  const out: GroupedReminders = { overdue: [], soon: [], later: [] };
  for (const r of reminders) {
    if (!r.is_active) continue;
    out[bucketFor(r.due_on, today)].push(r);
  }
  const byDate = (a: CareReminder, b: CareReminder) =>
    a.due_on.localeCompare(b.due_on) || a.title.localeCompare(b.title);
  out.overdue.sort(byDate);
  out.soon.sort(byDate);
  out.later.sort(byDate);
  return out;
}

// ------------------------------------------------------------ description --

function plural(n: number, unit: string): string {
  return `${n} ${unit}${n === 1 ? "" : "s"}`;
}

/**
 * Plain English, relative to `today`. "was due 3 days ago", "due tomorrow",
 * "due in about 2 months".
 *
 * TONE: this is lapsed admin and nothing else. It never implies the animal is
 * unwell, never escalates ("urgent", "at risk", "unprotected"), and never
 * scolds. A missed flea tablet is a chore that slipped, which is the normal
 * condition of owning a pet, and an app that treats it as an alarm gets muted.
 */
export function describeDue(dueOn: string, today: string): string {
  const days = daysBetween(today, dueOn);
  if (days === null) return "no date set";

  if (days < 0) {
    const late = -days;
    if (late === 1) return "was due yesterday";
    if (late < 14) return `was due ${plural(late, "day")} ago`;
    if (late < 60) return `was due about ${plural(Math.round(late / 7), "week")} ago`;
    if (late < 365) return `was due about ${plural(Math.round(late / 30), "month")} ago`;
    return "was due over a year ago";
  }

  if (days === 0) return "due today";
  if (days === 1) return "due tomorrow";
  if (days < 14) return `due in ${plural(days, "day")}`;
  if (days < 60) return `due in about ${plural(Math.round(days / 7), "week")}`;
  if (days < 365) return `due in about ${plural(Math.round(days / 30), "month")}`;
  return "due in over a year";
}

/**
 * The whole sentence, for the dashboard where the pet isn't implied by context:
 * "Bella's flea treatment was due 3 days ago".
 */
export function describeReminder(
  petName: string | null,
  title: string,
  dueOn: string,
  today: string
): string {
  const subject = petName ? `${petName}'s ${lowerFirst(title)}` : title;
  return `${subject} ${describeDue(dueOn, today)}`;
}

/** "Flea treatment" reads wrong after a possessive; "flea treatment" reads right. */
function lowerFirst(s: string): string {
  if (!s) return s;
  // Leave an acronym or a proper noun alone — "DHPP", "Bravecto" are not typos.
  if (s.slice(0, 2) !== s.slice(0, 2).toLowerCase() && s.slice(0, 2) === s.slice(0, 2).toUpperCase()) {
    return s;
  }
  return s[0].toLowerCase() + s.slice(1);
}

// ------------------------------------------------------------------ today --

/**
 * Today as a bare date in the LOCAL zone of whoever calls it.
 *
 * Read off the local calendar fields rather than `toISOString().slice(0,10)`,
 * which returns the UTC day and is therefore wrong for part of every day in
 * every zone that isn't UTC — for an owner in Los Angeles it flips to tomorrow
 * at 5pm, and every reminder due tomorrow would spend the evening claiming to
 * be due today.
 *
 * The server and the browser can disagree about the date for a few hours a day.
 * The components resolve that by rendering the server's answer first and
 * re-checking on the client after mount; see ReminderList.
 */
export function todayISO(now: Date = new Date()): string {
  return toISO({
    year: now.getFullYear(),
    month: now.getMonth() + 1,
    day: now.getDate(),
  });
}
