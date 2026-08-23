/**
 * Baselines and change detection.
 *
 * The whole point of this module: a pet's own history is the only sensible
 * reference range. A 4.6 kg cat means nothing in the abstract; a 4.6 kg cat
 * that was 5.4 kg for the last two months means something. So every number
 * here is relative to the same animal's own recent past — never to a breed
 * table, never to a population norm, never to a diagnosis.
 *
 * DESIGN RULE THAT DRIVES EVERY THRESHOLD BELOW:
 * a false "your pet is declining" is far worse than staying silent. An owner
 * who is scared by noise either books an unnecessary vet visit or — much
 * worse — learns to ignore us, and then misses the real one. Silence costs
 * us nothing; the data is still on screen and the owner can read it. So every
 * guard is deliberately biased toward saying nothing, and where a threshold
 * was a judgement call it was rounded in the conservative direction.
 *
 * Pure functions, no I/O, no dates from the network — everything is derived
 * from the points passed in, so this is trivially checkable by construction
 * and safe to run in a server component.
 */

const DAY_MS = 86_400_000;

// ---------------------------------------------------------------- tunables --

/**
 * A window needs this many readings before we will compare it to anything.
 * Two points define a line through any noise; three is the minimum that can
 * disagree with itself. This is the single most important guard here.
 */
export const MIN_POINTS_PER_WINDOW = 3;

/**
 * A series that spans less than this can't have a "baseline" — measurements
 * taken over a week are one event, not a trend. (Weighing a dog three times
 * on Saturday tells you about the scale, not the dog.)
 */
export const MIN_SPAN_DAYS = 10;

/**
 * Percentage floor. Below this, a move is not worth an owner's attention even
 * if it is statistically real — most home scales and most hand-entered numbers
 * are not accurate to a few percent anyway.
 */
export const MIN_PERCENT_CHANGE = 10;

/**
 * The delta must also clear this many standard deviations of the combined
 * windows. One SD is a low bar statistically, but it is stacked ON TOP of the
 * percentage floor and the median cross-check, so the effective bar is high.
 * Raising it further starts hiding real weight loss in noisy series.
 */
export const NOISE_SD_MULTIPLE = 1;

/** Default comparison window. 30 days is what an owner can actually recall. */
export const DEFAULT_WINDOW_DAYS = 30;

// ------------------------------------------------------------------- types --

export type SeriesPoint = {
  /** "YYYY-MM-DD" or any ISO timestamp — only the date part is used. */
  date: string;
  value: number;
};

/** A point after cleaning: valid, day-resolution, de-duplicated. */
export type CleanPoint = { date: string; day: number; value: number };

export type Direction = "up" | "down" | "flat";
export type Confidence = "low" | "medium" | "high";

export type WindowStats = {
  count: number;
  mean: number;
  /** Median, kept so we can cross-check the mean against one wild outlier. */
  median: number;
  /** Sample SD (n-1). Deliberately the larger, more conservative estimator. */
  stdDev: number;
  min: number;
  max: number;
  points: CleanPoint[];
};

export type Baseline = {
  windowDays: number;
  /** Every clean point, sorted oldest first — what the sparkline draws. */
  points: CleanPoint[];
  /** The most recent `windowDays` of readings. */
  recent: WindowStats;
  /** The `windowDays` immediately before that. The reference range. */
  baseline: WindowStats;
  latestValue: number | null;
  latestDate: string | null;
  firstDate: string | null;
  /** Days covered by the whole series, first to last reading. */
  spanDays: number;
  /** Days between the newest reading and `asOf`. High = we're describing history. */
  stalenessDays: number;
  absoluteChange: number;
  /**
   * Percent change against |baseline mean|. Null when the baseline mean is 0,
   * where "percent change" is not a defined quantity — see detectChange.
   */
  percentChange: number | null;
  direction: Direction;
  confidence: Confidence;
};

export type SuppressReason =
  | "no-data"
  | "too-few-recent"
  | "too-few-baseline"
  | "span-too-short"
  | "stale"
  | "undefined-percent"
  | "below-percent-floor"
  | "within-noise"
  | "median-disagrees";

export type Change = {
  direction: Exclude<Direction, "flat">;
  /** Always positive — the direction carries the sign. */
  percentChange: number;
  absoluteChange: number;
  recentMean: number;
  baselineMean: number;
  confidence: Confidence;
  windowDays: number;
  baseline: Baseline;
};

export type SeriesAnalysis = {
  baseline: Baseline;
  /** Non-null only when the change survived every guard below. */
  change: Change | null;
  /** Why we stayed silent. Null when `change` is set. */
  silentReason: SuppressReason | null;
};

export type BaselineOptions = {
  windowDays?: number;
  /**
   * "Today", as epoch ms. Injectable so this module is deterministic and
   * testable — nothing here reads the clock unless it has to.
   */
  asOf?: number;
};

// ------------------------------------------------------------------- clean --

/** Local midnight of a date string's day part, or null if unparseable. */
function toDay(date: string): number | null {
  if (typeof date !== "string" || date.length < 10) return null;
  const t = new Date(date.slice(0, 10) + "T00:00:00").getTime();
  return Number.isFinite(t) ? t : null;
}

function toIso(day: number): string {
  const d = new Date(day);
  const m = `${d.getMonth() + 1}`.padStart(2, "0");
  const dd = `${d.getDate()}`.padStart(2, "0");
  return `${d.getFullYear()}-${m}-${dd}`;
}

/**
 * Drop junk, sort oldest-first, and collapse same-day readings to their mean.
 *
 * Same-day collapsing matters: an owner who weighs a dog four times on the day
 * they buy a scale would otherwise give that one day four votes and shift the
 * whole window. One day, one data point.
 *
 * Accepts unsorted input on purpose — Supabase queries in this app come back in
 * different orders per screen and no caller should have to remember which.
 */
export function cleanSeries(points: readonly SeriesPoint[] | null | undefined): CleanPoint[] {
  if (!points || points.length === 0) return [];

  const byDay = new Map<number, number[]>();
  for (const p of points) {
    if (!p || typeof p.value !== "number" || !Number.isFinite(p.value)) continue;
    const day = toDay(p.date);
    if (day === null) continue;
    const bucket = byDay.get(day);
    if (bucket) bucket.push(p.value);
    else byDay.set(day, [p.value]);
  }

  return [...byDay.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([day, values]) => ({
      day,
      date: toIso(day),
      value: values.reduce((s, v) => s + v, 0) / values.length,
    }));
}

// -------------------------------------------------------------- statistics --

function mean(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((s, v) => s + v, 0) / values.length;
}

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const s = [...values].sort((a, b) => a - b);
  const mid = s.length >> 1;
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

/** Sample standard deviation. 0 for fewer than two points, by definition. */
function stdDev(values: number[]): number {
  if (values.length < 2) return 0;
  const m = mean(values);
  const variance =
    values.reduce((s, v) => s + (v - m) ** 2, 0) / (values.length - 1);
  return Math.sqrt(variance);
}

function summarize(points: CleanPoint[]): WindowStats {
  const values = points.map((p) => p.value);
  return {
    count: points.length,
    mean: mean(values),
    median: median(values),
    stdDev: stdDev(values),
    min: values.length ? Math.min(...values) : 0,
    max: values.length ? Math.max(...values) : 0,
    points,
  };
}

/**
 * Confidence is about how much we trust the comparison, not about how big the
 * change is. It is driven by how many readings there are and how noisy the
 * reference window is relative to its own level (coefficient of variation).
 */
function gradeConfidence(
  recent: WindowStats,
  base: WindowStats,
  spanDays: number,
): Confidence {
  const n = Math.min(recent.count, base.count);
  if (n < MIN_POINTS_PER_WINDOW || spanDays < MIN_SPAN_DAYS) return "low";

  // Spread relative to level. A baseline mean of 0 gives no scale to judge
  // spread against, so we refuse to claim high confidence there.
  const cv = base.mean === 0 ? null : base.stdDev / Math.abs(base.mean);

  if (n >= 5 && spanDays >= 21 && cv !== null && cv <= 0.15) return "high";
  if (n >= MIN_POINTS_PER_WINDOW && (cv === null ? base.stdDev === 0 : cv <= 0.35)) {
    return "medium";
  }
  return "low";
}

// ----------------------------------------------------------- computeBaseline --

/**
 * Split a dated series into "the last `windowDays`" and "the `windowDays`
 * before that", and describe the move between them.
 *
 * The windows are anchored on the NEWEST READING, not on today. If an owner
 * stopped logging six weeks ago we still want to describe what their data says
 * rather than show two empty windows — but the resulting `stalenessDays` is
 * what stops `detectChange` from announcing six-week-old news as if it were
 * current.
 */
export function computeBaseline(
  points: readonly SeriesPoint[] | null | undefined,
  options: BaselineOptions = {},
): Baseline {
  const windowDays =
    Number.isFinite(options.windowDays) && (options.windowDays as number) > 0
      ? Math.floor(options.windowDays as number)
      : DEFAULT_WINDOW_DAYS;

  const clean = cleanSeries(points);
  const empty = summarize([]);

  if (clean.length === 0) {
    return {
      windowDays,
      points: [],
      recent: empty,
      baseline: empty,
      latestValue: null,
      latestDate: null,
      firstDate: null,
      spanDays: 0,
      stalenessDays: Infinity,
      absoluteChange: 0,
      percentChange: null,
      direction: "flat",
      confidence: "low",
    };
  }

  const anchor = clean[clean.length - 1].day;
  const recentCut = anchor - windowDays * DAY_MS;
  const baselineCut = anchor - 2 * windowDays * DAY_MS;

  // Half-open windows so no reading is ever counted in both.
  const recent = summarize(clean.filter((p) => p.day > recentCut));
  const base = summarize(
    clean.filter((p) => p.day > baselineCut && p.day <= recentCut),
  );

  const spanDays = Math.round((anchor - clean[0].day) / DAY_MS);
  const asOf = options.asOf ?? Date.now();
  const stalenessDays = Math.max(0, Math.round((asOf - anchor) / DAY_MS));

  const comparable = recent.count > 0 && base.count > 0;
  const absoluteChange = comparable ? recent.mean - base.mean : 0;

  // Divide by |mean| so a negative-valued series (a delta field, a temperature
  // offset) doesn't get its percent sign flipped.
  const percentChange =
    comparable && base.mean !== 0
      ? (absoluteChange / Math.abs(base.mean)) * 100
      : null;

  const direction: Direction =
    Math.abs(absoluteChange) < 1e-9 ? "flat" : absoluteChange > 0 ? "up" : "down";

  return {
    windowDays,
    points: clean,
    recent,
    baseline: base,
    latestValue: clean[clean.length - 1].value,
    latestDate: clean[clean.length - 1].date,
    firstDate: clean[0].date,
    spanDays,
    stalenessDays,
    absoluteChange,
    percentChange,
    direction,
    confidence: gradeConfidence(recent, base, spanDays),
  };
}

// ------------------------------------------------------------- detectChange --

/**
 * Decide whether a move is worth putting in front of an owner.
 *
 * Every guard below exists because the alternative is telling someone their
 * animal is deteriorating on the strength of two data points and a rounding
 * error. In order:
 *
 *  1. MIN_POINTS_PER_WINDOW in BOTH windows — a mean of one reading is a reading.
 *  2. MIN_SPAN_DAYS of history — no trends from a single busy week.
 *  3. Not stale — the newest reading must be inside the current window, or we
 *     would be reporting old news in the present tense.
 *  4. A defined percent change — a zero baseline mean has no percent, and
 *     "up from zero" is a category we would rather stay quiet about than
 *     dress up as a number.
 *  5. Past MIN_PERCENT_CHANGE — big enough for a human to care about.
 *  6. Past NOISE_SD_MULTIPLE standard deviations of the two windows combined —
 *     big enough to not be this series' ordinary wobble. If the data is
 *     perfectly flat (SD exactly 0) that test is vacuous and usually means
 *     repeated or rounded entries rather than a genuinely steady animal, so
 *     we double the percentage floor instead of trusting the zero.
 *  7. The MEDIANS must agree with the means. This is the outlier guard: one
 *     mistyped 45.0 kg in a 4.5 kg cat drags the mean a long way and the
 *     median almost not at all, so the two disagree and we say nothing.
 *
 * Returns null — silence — whenever any guard fails.
 */
export function detectChange(
  points: readonly SeriesPoint[] | null | undefined,
  options: BaselineOptions = {},
): Change | null {
  return analyzeSeries(points, options).change;
}

/**
 * `detectChange` plus the baseline it was computed from and the reason for any
 * silence. UI wants all three: the numbers to draw, the verdict, and something
 * honest to say when there is no verdict.
 */
export function analyzeSeries(
  points: readonly SeriesPoint[] | null | undefined,
  options: BaselineOptions = {},
): SeriesAnalysis {
  const b = computeBaseline(points, options);
  const silent = (reason: SuppressReason): SeriesAnalysis => ({
    baseline: b,
    change: null,
    silentReason: reason,
  });

  if (b.points.length === 0) return silent("no-data");
  if (b.recent.count < MIN_POINTS_PER_WINDOW) return silent("too-few-recent");
  if (b.baseline.count < MIN_POINTS_PER_WINDOW) return silent("too-few-baseline");
  if (b.spanDays < MIN_SPAN_DAYS) return silent("span-too-short");
  if (b.stalenessDays > b.windowDays) return silent("stale");
  if (b.percentChange === null) return silent("undefined-percent");
  if (b.direction === "flat") return silent("below-percent-floor");

  const pct = Math.abs(b.percentChange);
  const delta = Math.abs(b.absoluteChange);

  // Pooled spread of both windows: the recent window's own noise counts too,
  // otherwise a calm baseline plus a wild recent month reads as a clean signal.
  const noise = Math.hypot(b.baseline.stdDev, b.recent.stdDev) / Math.SQRT2;
  const percentFloor = noise === 0 ? MIN_PERCENT_CHANGE * 2 : MIN_PERCENT_CHANGE;

  if (pct < percentFloor) return silent("below-percent-floor");
  if (noise > 0 && delta < NOISE_SD_MULTIPLE * noise) return silent("within-noise");

  // Outlier cross-check: the robust centre must move the same way, and by at
  // least half as much in percentage terms.
  const medianDelta = b.recent.median - b.baseline.median;
  const sameWay = Math.sign(medianDelta) === Math.sign(b.absoluteChange);
  const medianPct =
    b.baseline.median === 0 ? null : (Math.abs(medianDelta) / Math.abs(b.baseline.median)) * 100;
  if (!sameWay || medianPct === null || medianPct < percentFloor / 2) {
    return silent("median-disagrees");
  }

  return {
    baseline: b,
    change: {
      direction: b.direction === "up" ? "up" : "down",
      percentChange: pct,
      absoluteChange: delta,
      recentMean: b.recent.mean,
      baselineMean: b.baseline.mean,
      confidence: b.confidence,
      windowDays: b.windowDays,
      baseline: b,
    },
    silentReason: null,
  };
}

// ------------------------------------------------------------------ wording --

export type DescribeOptions = {
  /** Metric name as the owner sees it — "Weight", "Activity". */
  label: string;
  petName?: string | null;
  unit?: string | null;
  /**
   * Append the one piece of advice we allow ourselves. Off by default so the
   * caller has to opt in per surface.
   */
  includeVetNote?: boolean;
};

function roundPercent(pct: number): string {
  // Below 1% a whole number would render "0%", which reads as a bug.
  return pct < 1 ? pct.toFixed(1) : `${Math.round(pct)}`;
}

/**
 * One plain sentence. Describes the number and nothing else — no cause, no
 * severity, no "may indicate". We are not qualified to interpret this and
 * neither is a chart.
 */
export function describeChange(change: Change, options: DescribeOptions): string {
  const { label, petName, includeVetNote } = options;
  const owner = petName ? `${petName}'s own` : "their own";
  const side = change.direction === "up" ? "above" : "below";

  let sentence =
    `${label} is ${roundPercent(change.percentChange)}% ${side} ` +
    `${owner} ${change.windowDays}-day average.`;

  if (change.confidence === "low") {
    // Say the quiet part out loud rather than letting a bold number imply
    // certainty we don't have.
    sentence += ` That's from few readings, so treat it as a hint rather than a finding.`;
  } else if (includeVetNote) {
    sentence += ` If it keeps up, it's worth mentioning to your vet.`;
  }

  return sentence;
}

/**
 * Plain-text alternative for a sparkline. A chart on its own is not accessible;
 * this is what a screen reader gets instead, and it has to carry the same
 * information the picture does — range, direction, and where it ends up.
 */
export function describeSeries(baseline: Baseline, options: DescribeOptions): string {
  const unit = options.unit ? ` ${options.unit}` : "";
  const n = baseline.points.length;
  if (n === 0) return `No ${options.label.toLowerCase()} readings recorded.`;

  const fmt = (v: number) => `${trimNumber(v)}${unit}`;
  if (n === 1) {
    return `${options.label}: one reading, ${fmt(baseline.points[0].value)} on ${baseline.points[0].date}.`;
  }

  const all = baseline.points.map((p) => p.value);
  const lo = Math.min(...all);
  const hi = Math.max(...all);
  return (
    `${options.label}: ${n} readings from ${baseline.firstDate} to ${baseline.latestDate}, ` +
    `ranging ${fmt(lo)} to ${fmt(hi)}, latest ${fmt(baseline.latestValue ?? 0)}.`
  );
}

/** What the owner would have to record for us to be able to say anything. */
export function describeSilence(reason: SuppressReason, windowDays = DEFAULT_WINDOW_DAYS): string {
  switch (reason) {
    case "no-data":
      return "No readings yet.";
    case "too-few-recent":
      return `Fewer than ${MIN_POINTS_PER_WINDOW} readings in the last ${windowDays} days.`;
    case "too-few-baseline":
      return `Not enough earlier readings to compare against yet.`;
    case "span-too-short":
      return `Readings so far cover under ${MIN_SPAN_DAYS} days.`;
    case "stale":
      return "No recent readings — this is history, not a current trend.";
    case "undefined-percent":
      return "Earlier readings average zero, so there's no percentage to compare to.";
    case "below-percent-floor":
    case "within-noise":
    case "median-disagrees":
      return "Holding steady within its usual range.";
  }
}

/** Drop trailing zeros so 4.50 reads as 4.5 and 4.00 as 4. */
export function trimNumber(value: number): string {
  if (!Number.isFinite(value)) return "—";
  const abs = Math.abs(value);
  const decimals = abs >= 100 ? 0 : abs >= 10 ? 1 : 2;
  return `${parseFloat(value.toFixed(decimals))}`;
}

/**
 * Enough data to be worth drawing a card for at all — lower than the bar for
 * claiming a change, because showing an owner their own two months of readings
 * is useful even when we have nothing to say about them.
 */
export function hasEnoughToChart(baseline: Baseline): boolean {
  return baseline.points.length >= MIN_POINTS_PER_WINDOW && baseline.spanDays >= MIN_SPAN_DAYS;
}
