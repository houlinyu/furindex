/**
 * Correlated observations: two independent things the owner recorded that
 * happened to move in the same stretch of days.
 *
 * WHAT THIS DELIBERATELY IS NOT
 * It is not an alert engine. There is no severity, no score, no ranking, and
 * no sentence anywhere in this file that says or implies "something is wrong".
 * Nothing here is a health verdict, because we have no basis for one: Gruen et
 * al. (2017), 98 cats, found that mean activity did NOT separate arthritic
 * animals from healthy ones (p = 0.541) and that the cats in more pain were
 * MORE active during the day. The intuitive reading — quiet pet, something
 * wrong — is contradicted by the best evidence we have. So the most this
 * module ever does is put two facts in one sentence and stop.
 *
 * THE INDEPENDENCE RULE, which is the point of the whole file
 * Two signals only count as a coincidence worth mentioning when they come from
 * different STREAMS (different acts of recording) *and* describe different
 * CONCEPTS. Without both halves the module would keep discovering that a
 * quiet-day tap and a "seemed low today" journal note agree with each other —
 * which is one observation written down twice, dressed up as corroboration.
 *
 * Pure module. `today` is passed in.
 */

import {
  DEFAULT_WINDOW_DAYS,
  analyzeSeries,
  type SeriesAnalysis,
  type SeriesPoint,
} from "@/lib/baselines";
import { formatDate } from "@/lib/format";
import { shiftDay } from "@/lib/dashboard";
import type { FeedingLog, JournalEntry } from "@/lib/types";
import { localDayKey } from "@/lib/format";

/** The act of recording. Two signals from one stream are one act, not two. */
export type SignalStream =
  | "activity-tap"
  | "scale"
  | "journal"
  | "feeding-log"
  | "wellbeing-checkin";

/** What the signal is about. Two signals about one concept are one fact. */
export type SignalConcept = "energy" | "body-mass" | "appetite" | "mood" | "sleep";

export type Signal = {
  id: string;
  stream: SignalStream;
  concept: SignalConcept;
  /** A clause, lower case, no trailing stop — joined into a sentence below. */
  clause: string;
  /** Inclusive date range the signal covers, "YYYY-MM-DD". */
  from: string;
  to: string;
};

export type Observation = {
  id: string;
  sentence: string;
  from: string;
  to: string;
  signals: [Signal, Signal];
};

/** Journal categories that carry a signal we can name. */
const JOURNAL_CONCEPT: Partial<Record<JournalEntry["category"], SignalConcept>> = {
  appetite: "appetite",
  mood: "mood",
  energy: "energy",
};

/**
 * How many notes of one kind before we'll call it a run. Two, matching the
 * spirit of MIN_POINTS_PER_WINDOW next door: one note is a day, two is a
 * pattern the owner themselves noticed twice.
 */
export const MIN_NOTES = 2;

/** Skipped meals before we'll mention them, and the same reasoning. */
export const MIN_SKIPPED_MEALS = 2;

export type ObservationInput = {
  petName: string;
  today: string;
  /** Matches the baseline window so a numeric signal and a note signal can overlap. */
  windowDays?: number;
  activity: SeriesPoint[];
  weights: SeriesPoint[];
  sleep: SeriesPoint[];
  wellbeingMood: SeriesPoint[];
  wellbeingEnergy: SeriesPoint[];
  journal: readonly JournalEntry[];
  feedingLogs: readonly FeedingLog[];
};

// ----------------------------------------------------------------- signals --

/**
 * A numeric series becomes a signal only if `analyzeSeries` produced a change
 * AND graded it above "low". Everything in lib/baselines' guard stack applies
 * unchanged: minimum points per window, minimum span, staleness, the percentage
 * floor, the noise multiple and the median cross-check. Nothing here relaxes
 * any of them, and a low-confidence change is explicitly not enough to be half
 * of a coincidence — thin data must never look like corroboration.
 */
function numericSignal(
  analysis: SeriesAnalysis,
  args: { id: string; stream: SignalStream; concept: SignalConcept; noun: string },
): Signal | null {
  const change = analysis.change;
  if (!change || change.confidence === "low") return null;

  const points = analysis.baseline.recent.points;
  if (points.length === 0) return null;

  const side = change.direction === "up" ? "above" : "below";
  const pct =
    change.percentChange < 1
      ? change.percentChange.toFixed(1)
      : `${Math.round(change.percentChange)}`;

  return {
    id: args.id,
    stream: args.stream,
    concept: args.concept,
    clause:
      `${args.noun} has been running ${pct}% ${side} its own usual range ` +
      `across the ${points.length} readings since ${formatDate(points[0].date)}`,
    from: points[0].date,
    to: points[points.length - 1].date,
  };
}

export function collectSignals(input: ObservationInput): Signal[] {
  const windowDays = input.windowDays ?? DEFAULT_WINDOW_DAYS;
  const windowStart = shiftDay(input.today, -(windowDays - 1));
  const opts = { windowDays: DEFAULT_WINDOW_DAYS };
  const signals: Signal[] = [];

  const push = (s: Signal | null) => {
    if (s) signals.push(s);
  };

  push(
    numericSignal(analyzeSeries(input.activity, opts), {
      id: "activity",
      stream: "activity-tap",
      concept: "energy",
      noun: "the activity you've been logging",
    }),
  );
  push(
    numericSignal(analyzeSeries(input.weights, opts), {
      id: "weight",
      stream: "scale",
      concept: "body-mass",
      noun: "weight",
    }),
  );
  push(
    numericSignal(analyzeSeries(input.sleep, opts), {
      id: "sleep",
      stream: "wellbeing-checkin",
      concept: "sleep",
      noun: "the sleep you've been checking in",
    }),
  );
  push(
    numericSignal(analyzeSeries(input.wellbeingMood, opts), {
      id: "wellbeing-mood",
      stream: "wellbeing-checkin",
      concept: "mood",
      noun: "the mood you've been checking in",
    }),
  );
  push(
    numericSignal(analyzeSeries(input.wellbeingEnergy, opts), {
      id: "wellbeing-energy",
      stream: "wellbeing-checkin",
      concept: "energy",
      noun: "the energy you've been checking in",
    }),
  );

  // -- journal notes: the owner's own words, grouped by what they're about ----
  const byConcept = new Map<SignalConcept, JournalEntry[]>();
  for (const e of input.journal) {
    const concept = JOURNAL_CONCEPT[e.category];
    if (!concept) continue;
    if (e.occurred_on < windowStart || e.occurred_on > input.today) continue;
    const bucket = byConcept.get(concept);
    if (bucket) bucket.push(e);
    else byConcept.set(concept, [e]);
  }
  for (const [concept, entries] of byConcept) {
    if (entries.length < MIN_NOTES) continue;
    const dates = entries.map((e) => e.occurred_on).sort();
    const from = dates[0];
    const to = dates[dates.length - 1];
    const when =
      from === to ? `on ${formatDate(from)}` : `between ${formatDate(from)} and ${formatDate(to)}`;
    signals.push({
      id: `journal-${concept}`,
      stream: "journal",
      concept,
      clause: `you wrote ${entries.length} ${concept} notes ${when}`,
      from,
      to,
    });
  }

  // -- skipped meals: only from an owner who is logging meals routinely -------
  const logged = input.feedingLogs
    .map((l) => ({ log: l, day: localDayKey(l.fed_at) }))
    .filter((r) => r.day >= windowStart && r.day <= input.today);
  const skipped = logged.filter((r) => r.log.skipped);
  const eaten = logged.filter((r) => !r.log.skipped);
  if (skipped.length >= MIN_SKIPPED_MEALS && eaten.length > 0) {
    const dates = skipped.map((r) => r.day).sort();
    signals.push({
      id: "skipped-meals",
      stream: "feeding-log",
      concept: "appetite",
      clause: `you recorded ${skipped.length} skipped meals between ${formatDate(
        dates[0],
      )} and ${formatDate(dates[dates.length - 1])}`,
      from: dates[0],
      to: dates[dates.length - 1],
    });
  }

  return signals;
}

// ------------------------------------------------------------ independence --

/**
 * Different act of recording AND different subject. Both halves are required.
 *
 * The journal is the case that makes this necessary. An "energy" journal note
 * and the activity ladder are two different streams but the same concept — the
 * owner observing how lively their pet seemed — so pairing them would
 * manufacture agreement out of one observation. Conversely two journal notes
 * about different concepts are one act of sitting down to write, and treating
 * them as two independent signals would mean the more someone journals the more
 * "correlations" we find.
 */
export function areIndependent(a: Signal, b: Signal): boolean {
  return a.stream !== b.stream && a.concept !== b.concept;
}

/** Inclusive overlap on day resolution. */
export function overlaps(a: Signal, b: Signal): boolean {
  return a.from <= b.to && b.from <= a.to;
}

// -------------------------------------------------------------- the output --

/**
 * Every independent, overlapping pair, capped.
 *
 * Capped at two because the point is to name a coincidence, not to produce a
 * list an owner reads as a problem count. If three separate pairs qualify, the
 * third one adds no information the first two didn't and does add alarm.
 */
export const MAX_OBSERVATIONS = 2;

export function findObservations(
  signals: readonly Signal[],
  max: number = MAX_OBSERVATIONS,
): Observation[] {
  const out: Observation[] = [];
  const used = new Set<string>();

  for (let i = 0; i < signals.length; i++) {
    for (let j = i + 1; j < signals.length; j++) {
      const a = signals[i];
      const b = signals[j];
      if (!areIndependent(a, b) || !overlaps(a, b)) continue;
      // One signal appears in at most one observation, or a single quiet week
      // gets reported three times over.
      if (used.has(a.id) || used.has(b.id)) continue;
      used.add(a.id);
      used.add(b.id);
      const sentence = `${capitalise(a.clause)}, and ${b.clause}.`;
      out.push({
        id: `${a.id}+${b.id}`,
        sentence,
        from: a.from < b.from ? a.from : b.from,
        to: a.to > b.to ? a.to : b.to,
        signals: [a, b],
      });
      if (out.length >= max) return out;
    }
  }
  return out;
}

function capitalise(s: string): string {
  return s.length === 0 ? s : s[0].toUpperCase() + s.slice(1);
}

/**
 * The one piece of advice this feature is allowed to give, and only behind a
 * disclosure the owner has to open.
 *
 * It is phrased so that the answer to "should I panic" is visibly no. It does
 * not recommend a visit; it says what to say if there is already one, which is
 * the only version of this sentence we can support.
 */
export function worthMentioningLine(observations: readonly Observation[]): string {
  if (observations.length === 0) return "";
  const spans = observations.map((o) =>
    o.from === o.to ? formatDate(o.from) : `${formatDate(o.from)} – ${formatDate(o.to)}`,
  );
  return (
    `If you've already got a visit booked, these are the dates to mention: ${spans.join("; ")}. ` +
    `On their own they are not a reason to book one. Two things landing in the same fortnight is ` +
    `what a calendar looks like — it is not evidence that either caused the other, or that either ` +
    `is a problem.`
  );
}

/** The standing caveat that sits under any observation we print. */
export const OBSERVATION_CAVEAT =
  "These are two separate things you recorded, in the same stretch of days. That is a coincidence " +
  "worth noticing, not a finding. Nothing here says one caused the other, and nothing here is a " +
  "judgement about how your pet is.";

/** What we say when there is nothing — which is most of the time, by design. */
export const NO_OBSERVATIONS =
  "Nothing to line up. We only say something when two independent things you recorded — a number " +
  "and a note, say, from different days' work — move in the same window. Most weeks that doesn't " +
  "happen, and silence here is the normal state rather than an all-clear.";
