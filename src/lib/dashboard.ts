/**
 * The dashboard's KPI model (Block 4.4).
 *
 * TWO RULES ARE ENFORCED BY THE TYPES IN THIS FILE, NOT BY THE COMPONENTS.
 *
 * 1. `source` is a required field on `Kpi`. There is no default and no
 *    optional marker, so a card cannot be constructed without saying where its
 *    number came from. The spec's line — "do not blur objective sensor data
 *    with subjective owner input" — is the whole reason this dashboard is
 *    allowed to exist next to a wearable one, and a `source?: MetricSource`
 *    would have been quietly dropped by the third card somebody added.
 *
 * 2. A metric with no data does not become a `Kpi` at all. It becomes an
 *    `UntrackedMetric`, which has a `reason` and NO value field — there is
 *    nowhere to put a zero even if someone wanted to. "Heart rate: 0 bpm" and
 *    "Sleep: —" are both worse than not having the card, because a dash still
 *    occupies the shape of a reading and a zero is simply false.
 *
 * Pure module: every function here is arithmetic over rows the page fetched.
 * The clock is passed in as `today` so this is deterministic.
 */

import {
  analyzeSeries,
  describeChange,
  trimNumber,
  DEFAULT_WINDOW_DAYS,
  type Confidence,
  type SeriesAnalysis,
  type SeriesPoint,
} from "@/lib/baselines";
import {
  ACTIVE_THRESHOLD_G,
  ACTIVITY_FIELD_UNIT,
  findActivityDefinition,
  formatG,
  isActiveVectorMagnitude,
  rungForActivityValue,
} from "@/lib/activity";
import { formatDate, localDayKey } from "@/lib/format";
import type {
  CustomValue,
  FeedingLog,
  FieldDefinition,
  WeightLog,
} from "@/lib/types";

// -------------------------------------------------------------- the source --

/**
 * Where a number came from. Three values, matching the spec exactly.
 *
 * There is deliberately no "estimated" member even though the spec's prose
 * mentions one. This app estimates nothing: every figure below is either
 * something the owner entered or arithmetic over things the owner entered. A
 * source value we would never legitimately use is a source value that would
 * eventually get used illegitimately.
 */
export type MetricSource = "device" | "manual" | "computed";

export const SOURCE_LABEL: Record<MetricSource, string> = {
  device: "Device-synced",
  manual: "Manually logged",
  computed: "Computed",
};

/** The tooltip-length explanation, shown in full on the card's back page. */
export const SOURCE_MEANING: Record<MetricSource, string> = {
  device: "Read off a connected device. Nothing in this app produces one yet.",
  manual: "Exactly what you tapped or typed. Nobody measured it.",
  computed: "Worked out from your own logs — no new measurement, just arithmetic.",
};

export const SOURCE_TONE: Record<MetricSource, string> = {
  device: "border-sky-600/40 text-sky-800 dark:border-sky-400/30 dark:text-sky-300",
  manual:
    "border-brand-500/40 text-[var(--brand-text)] dark:border-brand-300/30",
  computed: "border-[var(--border)] text-[var(--muted)]",
};

// ---------------------------------------------------------------- the card --

export type Kpi = {
  key: string;
  label: string;
  /** REQUIRED — see the header. Every card renders it. */
  source: MetricSource;
  /** The specific origin, in words: "your daily activity tap", "weight_logs". */
  origin: string;
  /** Pre-formatted. Never "0" standing in for "we don't know". */
  value: string;
  unit?: string | null;
  /** One line of context under the number — dates, denominators, caveats. */
  context?: string | null;
  /** Own-baseline comparison, already through every guard in lib/baselines. */
  change?: {
    sentence: string;
    direction: "up" | "down";
    confidence: Confidence;
  } | null;
};

/**
 * A metric we are NOT going to show a number for. No value field exists on
 * this type, on purpose.
 */
export type UntrackedMetric = {
  key: string;
  label: string;
  /** Why there is nothing, in the owner's terms. Never an apology, never a promise. */
  reason: string;
  /** True when the only way to get this is hardware we don't integrate with. */
  needsDevice: boolean;
};

export type DashboardKpis = {
  cards: Kpi[];
  untracked: UntrackedMetric[];
  /** True when literally nothing has been logged — drives the empty state. */
  isEmpty: boolean;
};

// ------------------------------------------------------------- wellbeing in --

/**
 * The daily check-in (spec 4.3) is being built in another session. This is the
 * shape the dashboard needs from it; `null` means the table isn't there yet and
 * every metric that depends on it becomes untracked rather than zero.
 */
export type WellbeingSeries = {
  tableName: string;
  sleepHours: SeriesPoint[];
  mood: SeriesPoint[];
  energy: SeriesPoint[];
};

// ------------------------------------------------------------------ inputs --

export type DashboardInput = {
  petName: string;
  today: string;
  /** Window for event counts ("meals in the last N days"). Not a baseline window. */
  windowDays?: number;
  weights: readonly WeightLog[];
  values: readonly CustomValue[];
  definitions: readonly FieldDefinition[];
  feedingLogs: readonly FeedingLog[];
  wellbeing: WellbeingSeries | null;
};

/** Default event-count window. A week is the unit owners actually think in. */
export const KPI_WINDOW_DAYS = 7;

// ----------------------------------------------------------------- helpers --

export function shiftDay(iso: string, days: number): string {
  const t = new Date(iso.slice(0, 10) + "T00:00:00").getTime();
  if (!Number.isFinite(t)) return iso;
  const d = new Date(t + days * 86_400_000);
  const m = `${d.getMonth() + 1}`.padStart(2, "0");
  const dd = `${d.getDate()}`.padStart(2, "0");
  return `${d.getFullYear()}-${m}-${dd}`;
}

function seriesFor(values: readonly CustomValue[], definitionId: string): SeriesPoint[] {
  return values
    .filter((v) => v.definition_id === definitionId && v.value_number != null)
    .map((v) => ({ date: v.recorded_on, value: v.value_number as number }));
}

/**
 * Turn a vetted change into the card's sentence, or null.
 *
 * Note what is NOT here: no threshold of our own, no severity, no rewording.
 * `analyzeSeries` already decided whether there is anything to say and
 * `describeChange` already decided how to say it. This function's only job is
 * to not add anything.
 */
function changeFrom(analysis: SeriesAnalysis, label: string, petName: string) {
  const c = analysis.change;
  if (!c) return null;
  return {
    sentence: describeChange(c, { label, petName, includeVetNote: false }),
    direction: c.direction,
    confidence: c.confidence,
  };
}

/**
 * A numeric field the owner defined that is plausibly a duration of activity.
 *
 * WHY THIS EXISTS: the activity ladder records WHAT the pet was doing, not for
 * HOW LONG. There is no minutes column anywhere in this schema, so "active
 * minutes" — the headline KPI on every wearable dashboard — cannot be computed
 * from anything we hold. The only honest way to show it is if the owner has
 * made themselves a minutes field and is filling it in, so that is exactly and
 * only when it appears.
 */
export function findDurationDefinition(
  definitions: readonly FieldDefinition[] | null | undefined,
): FieldDefinition | null {
  if (!definitions) return null;
  return (
    definitions.find(
      (d) =>
        d.field_type === "number" &&
        /^(min|mins|minute|minutes)$/i.test((d.unit ?? "").trim()) &&
        /walk|activ|exercis|play|run/i.test(d.label),
    ) ?? null
  );
}

// -------------------------------------------------------------- the builder --

export function buildKpis(input: DashboardInput): DashboardKpis {
  const {
    petName,
    today,
    windowDays = KPI_WINDOW_DAYS,
    weights,
    values,
    definitions,
    feedingLogs,
    wellbeing,
  } = input;

  const windowStart = shiftDay(today, -(windowDays - 1));
  const cards: Kpi[] = [];
  const untracked: UntrackedMetric[] = [];

  // ------------------------------------------------------------- activity --
  const activityDef = findActivityDefinition(definitions);
  const activityPoints = activityDef ? seriesFor(values, activityDef.id) : [];
  const activityAnalysis = analyzeSeries(activityPoints, {
    windowDays: DEFAULT_WINDOW_DAYS,
  });

  if (activityPoints.length > 0) {
    const latest = [...activityPoints].sort((a, b) => a.date.localeCompare(b.date)).at(-1)!;
    const rung = rungForActivityValue(latest.value);

    cards.push({
      key: "activity-level",
      label: "Activity level",
      source: "manual",
      origin: "your daily activity tap",
      // The rung's own words. `formatG` only appears when the stored number
      // isn't one of our rungs — a figure that came out of a vet report, say —
      // and then we show the number rather than guessing which rung it meant.
      value: rung ? rung.label : formatG(latest.value),
      context: rung
        ? `${formatG(latest.value)} · logged ${formatDate(latest.date)}`
        : `Not one of the activity steps · logged ${formatDate(latest.date)}`,
      change: changeFrom(activityAnalysis, "Activity level", petName),
    });

    // Active days: a count over the days that were actually logged. The
    // denominator is logged days, NOT 7 — a day nobody tapped is a day with no
    // information, not a day the animal spent lying down.
    const inWindow = activityPoints.filter(
      (p) => p.date >= windowStart && p.date <= today,
    );
    if (inWindow.length > 0) {
      const active = inWindow.filter((p) => isActiveVectorMagnitude(p.value)).length;
      cards.push({
        key: "active-days",
        label: "Active days",
        source: "computed",
        origin: `your activity taps, against the study's ${ACTIVE_THRESHOLD_G} ${ACTIVITY_FIELD_UNIT} active/inactive line`,
        value: `${active} of ${inWindow.length}`,
        context:
          `Days logged in the last ${windowDays} that were at walking pace or above. ` +
          `Days you didn't log aren't counted either way.`,
      });
    }
  } else {
    untracked.push({
      key: "activity-level",
      label: "Activity level",
      reason:
        "Nothing logged yet. One tap a day on the pet page — the steps are behaviours somebody measured on a collar accelerometer.",
      needsDevice: false,
    });
  }

  // ------------------------------------------------------- active minutes --
  const durationDef = findDurationDefinition(definitions);
  const durationPoints = durationDef ? seriesFor(values, durationDef.id) : [];
  if (durationDef && durationPoints.length > 0) {
    const inWindow = durationPoints.filter((p) => p.date >= windowStart && p.date <= today);
    const basis = inWindow.length > 0 ? inWindow : [];
    if (basis.length > 0) {
      const total = basis.reduce((s, p) => s + p.value, 0);
      cards.push({
        key: "active-minutes",
        label: durationDef.label,
        source: "manual",
        origin: `your "${durationDef.label}" field`,
        value: trimNumber(total),
        unit: "min",
        context: `Across ${basis.length} logged day${basis.length === 1 ? "" : "s"} in the last ${windowDays}.`,
        change: changeFrom(
          analyzeSeries(durationPoints, { windowDays: DEFAULT_WINDOW_DAYS }),
          durationDef.label,
          petName,
        ),
      });
    }
  } else {
    untracked.push({
      key: "active-minutes",
      label: "Active minutes",
      // The honest reason, and it is not "connect a device": a wearable is one
      // way to get this, but so is writing the number down, and we should not
      // imply the owner is blocked on hardware they don't have.
      reason:
        "Nothing here records duration. The daily activity log captures what your pet was doing, not for how long — so there is no number to show. A minutes field of your own would fill this card.",
      needsDevice: false,
    });
  }

  // --------------------------------------------------------------- weight --
  const weightPoints: SeriesPoint[] = weights.map((w) => ({
    date: w.recorded_on,
    value: w.weight_kg,
  }));
  if (weightPoints.length > 0) {
    const latest = [...weightPoints].sort((a, b) => a.date.localeCompare(b.date)).at(-1)!;
    cards.push({
      key: "weight",
      label: "Weight",
      source: "manual",
      origin: "the weights you've recorded",
      value: trimNumber(latest.value),
      unit: "kg",
      context: `Last weighed ${formatDate(latest.date)} · ${weightPoints.length} reading${
        weightPoints.length === 1 ? "" : "s"
      } on file`,
      change: changeFrom(
        analyzeSeries(weightPoints, { windowDays: DEFAULT_WINDOW_DAYS }),
        "Weight",
        petName,
      ),
    });
  } else {
    untracked.push({
      key: "weight",
      label: "Weight",
      reason: "No weights recorded yet. Two, a few weeks apart, is where a trend starts.",
      needsDevice: false,
    });
  }

  // -------------------------------------------------------- eating events --
  if (feedingLogs.length > 0) {
    const days = feedingLogs
      .map((l) => ({ log: l, day: localDayKey(l.fed_at) }))
      .filter((r) => r.day !== "");
    const inWindow = days.filter((r) => r.day >= windowStart && r.day <= today);
    const meals = inWindow.filter((r) => !r.log.skipped).length;
    const skipped = inWindow.filter((r) => r.log.skipped).length;
    const lastDay = days.map((r) => r.day).sort().at(-1) ?? null;

    cards.push({
      key: "eating",
      label: "Eating events",
      source: "manual",
      origin: "the meals you've logged",
      // A zero here is a real count, not a stand-in for missing data — we only
      // reach this branch because feeding logs exist. The context line says so
      // explicitly so it can't be read as "the pet ate nothing".
      value: `${meals}`,
      context:
        meals === 0
          ? `No meals logged in the last ${windowDays} days${
              lastDay ? ` — the last one was ${formatDate(lastDay)}` : ""
            }. That's a gap in the log, not necessarily a gap in the bowl.`
          : `Meals logged in the last ${windowDays} days${
              skipped > 0 ? `, plus ${skipped} recorded as skipped` : ""
            }.`,
    });
  } else {
    untracked.push({
      key: "eating",
      label: "Eating events",
      reason:
        "No meals logged yet. Logging is per meal, so this card stays empty until there's something in it.",
      needsDevice: false,
    });
  }

  // ------------------------------------------------------ sleep and mood ---
  if (wellbeing) {
    pushWellbeingCard(cards, untracked, {
      key: "sleep",
      label: "Sleep",
      unit: "h",
      points: wellbeing.sleepHours,
      tableName: wellbeing.tableName,
      petName,
      reason:
        "The daily check-in is here, but no sleep hours have been entered yet.",
    });
    pushWellbeingCard(cards, untracked, {
      key: "mood",
      label: "Mood",
      unit: null,
      points: wellbeing.mood,
      tableName: wellbeing.tableName,
      petName,
      reason: "The daily check-in is here, but no mood has been entered yet.",
    });
  } else {
    for (const [key, label] of [
      ["sleep", "Sleep"],
      ["mood", "Mood"],
    ] as const) {
      untracked.push({
        key,
        label,
        reason:
          "Comes from the daily check-in, which isn't part of this deployment yet. Nothing else here can stand in for it.",
        needsDevice: false,
      });
    }
  }

  // ------------------------------------------------------- the wearable ones --
  untracked.push(...WEARABLE_ONLY);

  return {
    cards,
    untracked,
    isEmpty: cards.length === 0,
  };
}

function pushWellbeingCard(
  cards: Kpi[],
  untracked: UntrackedMetric[],
  args: {
    key: string;
    label: string;
    unit: string | null;
    points: SeriesPoint[];
    tableName: string;
    petName: string;
    reason: string;
  },
) {
  if (args.points.length === 0) {
    untracked.push({ key: args.key, label: args.label, reason: args.reason, needsDevice: false });
    return;
  }
  const latest = [...args.points].sort((a, b) => a.date.localeCompare(b.date)).at(-1)!;
  cards.push({
    key: args.key,
    label: args.label,
    source: "manual",
    origin: `your daily check-in (${args.tableName})`,
    value: trimNumber(latest.value),
    unit: args.unit,
    context: `Checked in ${formatDate(latest.date)} · ${args.points.length} entr${
      args.points.length === 1 ? "y" : "ies"
    }`,
    change: changeFrom(
      analyzeSeries(args.points, { windowDays: DEFAULT_WINDOW_DAYS }),
      args.label,
      args.petName,
    ),
  });
}

/**
 * The four KPIs the spec asks for that only a wearable can produce.
 *
 * They are listed rather than silently dropped, and the reason is the same one
 * that makes them absent: an owner who has seen a wearable dashboard will look
 * for heart rate, and "we don't have it" is a better answer than a blank space
 * they have to interpret. But they render as text rows, never as cards with a
 * dash where the number goes, because a dash still occupies the shape of a
 * reading.
 *
 * The wording does NOT say "connect a device". Spec 4.1a is BLOCKED — Web
 * Bluetooth doesn't exist on iOS and no consumer collar exposes a public
 * profile — so there is no connect flow to send anyone to, and this repo's own
 * rule is not to promise integrations it hasn't built.
 */
export const WEARABLE_ONLY: UntrackedMetric[] = [
  {
    key: "heart-rate",
    label: "Heart rate",
    reason: "Needs a wearable. This app has no device integration, and we won't estimate it.",
    needsDevice: true,
  },
  {
    key: "temperature",
    label: "Body temperature",
    reason: "Needs a wearable or a thermometer reading. Nothing here measures it.",
    needsDevice: true,
  },
  {
    key: "distance",
    label: "Distance",
    reason: "Needs GPS on the collar. Nothing here measures it.",
    needsDevice: true,
  },
  {
    key: "speed",
    label: "Speed",
    reason: "Needs GPS on the collar. Nothing here measures it.",
    needsDevice: true,
  },
];
