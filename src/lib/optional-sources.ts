/**
 * Sources that may or may not exist yet.
 *
 * Two of the three inputs to this dashboard are being built in parallel by
 * other sessions: the guided health check (spec 4.2) and the daily "how's your
 * pet feeling" check-in (spec 4.3). Neither table is in supabase/schema.sql on
 * this branch. The dashboard has to render correctly today, render correctly
 * the moment those land, and never require a schema change of its own.
 *
 * So it asks. Each probe is a cheap `select` against a candidate table name;
 * PostgREST answers "no such table" with an error rather than throwing, and an
 * error here means "not yet", not "broken". The dashboard then says so in
 * words instead of showing an empty chart.
 *
 * WHY IT PROBES SEVERAL NAMES
 * Nothing has landed, so the exact table name is not yet decided. Probing the
 * handful of plausible names costs one round trip (they run in parallel) and
 * means the dashboard lights up on its own rather than needing a follow-up
 * commit that nobody remembers to make. Column names are read defensively for
 * the same reason.
 *
 * Everything here returns a discriminated union with an `available` flag; there
 * is no code path that turns a missing table into a zero.
 */

import { isSelfAssessment, type PartCheck, type BodyPartId } from "@/lib/body-parts";
import { bodyPartById } from "@/lib/body-parts";
import type { SeriesPoint } from "@/lib/baselines";
import type { WellbeingSeries } from "@/lib/dashboard";

// ---------------------------------------------------------- loose querying --

type LooseRow = Record<string, unknown>;
type LooseResult = { data: LooseRow[] | null; error: { message: string } | null };
type LooseBuilder = PromiseLike<LooseResult> & {
  eq(column: string, value: string): LooseBuilder;
  in(column: string, values: string[]): LooseBuilder;
  limit(n: number): LooseBuilder;
};
type LooseClient = { from(table: string): { select(columns: string): LooseBuilder } };

/**
 * The generated client can only name tables that are in `Database`, which by
 * definition these are not. The cast is confined to this module and only ever
 * used for reads whose failure is an expected outcome — never for a write.
 */
export type ProbeableClient = { from(table: string): unknown };

function loosen(supabase: ProbeableClient): LooseClient {
  return supabase as unknown as LooseClient;
}

/** How many rows any probe will pull. Plenty of history, bounded. */
const PROBE_LIMIT = 500;

async function probe(
  client: LooseClient,
  table: string,
  filter: { column: string; value: string } | { column: string; values: string[] } | null,
): Promise<LooseRow[] | null> {
  try {
    let q = client.from(table).select("*");
    if (filter && "value" in filter) q = q.eq(filter.column, filter.value);
    if (filter && "values" in filter) {
      if (filter.values.length === 0) return [];
      q = q.in(filter.column, filter.values);
    }
    const { data, error } = await q.limit(PROBE_LIMIT);
    // An error is "this table isn't here yet". Row-level security returns an
    // empty array instead, which is a different (and correct) answer.
    if (error) return null;
    return data ?? [];
  } catch {
    // A network-level failure is indistinguishable from absence from here, and
    // both mean the same thing to the page: say we don't have it.
    return null;
  }
}

/** First key present on the row, out of a list of plausible spellings. */
function pick(row: LooseRow, keys: readonly string[]): unknown {
  for (const k of keys) {
    if (k in row && row[k] !== null && row[k] !== undefined) return row[k];
  }
  return undefined;
}

function asDay(v: unknown): string | null {
  if (typeof v !== "string" || v.length < 10) return null;
  const day = v.slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(day) ? day : null;
}

function asNumber(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && v.trim() !== "") {
    const n = Number(v);
    if (Number.isFinite(n)) return n;
  }
  return null;
}

function asText(v: unknown): string | null {
  return typeof v === "string" && v.trim() !== "" ? v : null;
}

// ------------------------------------------------------- guided health check --

export type HealthCheckSource =
  | { available: false; reason: string }
  | { available: true; tableName: string; checks: PartCheck[] };

/** Table names the guided-check session could plausibly land under. */
const CHECK_ITEM_TABLES = ["health_check_items", "health_check_parts"] as const;
const CHECK_SESSION_TABLES = ["health_checks", "health_check_sessions"] as const;

const PART_KEYS = ["part", "body_part", "part_id"] as const;
const ASSESSMENT_KEYS = ["self_assessment", "assessment", "owner_assessment", "status"] as const;
const NOTE_KEYS = ["note", "caption", "notes", "comment"] as const;
const CAPTURED_KEYS = ["captured_at", "checked_on", "occurred_on", "recorded_on", "created_at"] as const;

const CHECK_UNAVAILABLE =
  "The guided health check isn't part of this deployment yet, so nothing has been recorded to show. " +
  "Every part below reads as not checked — which is the truth, not a placeholder.";

function toPartCheck(row: LooseRow, fallbackDate: string | null): PartCheck | null {
  const partRaw = pick(row, PART_KEYS);
  const part = typeof partRaw === "string" ? bodyPartById(partRaw) : null;
  if (!part) return null;

  const assessment = pick(row, ASSESSMENT_KEYS);
  if (!isSelfAssessment(assessment)) return null;

  const checkedOn = asDay(pick(row, CAPTURED_KEYS)) ?? fallbackDate;
  if (!checkedOn) return null;

  return {
    part: part.id as BodyPartId,
    checkedOn,
    assessment,
    note: asText(pick(row, NOTE_KEYS)),
  };
}

/**
 * Every recorded look at every body part for this pet, or an honest absence.
 *
 * Tries the flat shape first (items carrying `pet_id` directly), then the
 * two-table shape the spec's JSON implies (a check session per sitting, items
 * hanging off it). Both are reasonable designs and we don't get to pick.
 */
export async function loadHealthChecks(
  supabase: ProbeableClient,
  petId: string,
): Promise<HealthCheckSource> {
  const client = loosen(supabase);

  // Shape A — items filtered directly by pet.
  const flat = await Promise.all(
    CHECK_ITEM_TABLES.map(async (t) => ({
      table: t,
      rows: await probe(client, t, { column: "pet_id", value: petId }),
    })),
  );
  for (const hit of flat) {
    if (hit.rows === null) continue;
    const checks = hit.rows
      .map((r) => toPartCheck(r, null))
      .filter((c): c is PartCheck => c !== null);
    if (checks.length > 0 || hit.rows.length === 0) {
      return { available: true, tableName: hit.table, checks };
    }
  }

  // Shape B — a session table keyed by pet, items keyed by session.
  const sessions = await Promise.all(
    CHECK_SESSION_TABLES.map(async (t) => ({
      table: t,
      rows: await probe(client, t, { column: "pet_id", value: petId }),
    })),
  );
  const session = sessions.find((s) => s.rows !== null);
  if (!session || session.rows === null) return { available: false, reason: CHECK_UNAVAILABLE };

  const dateById = new Map<string, string>();
  for (const row of session.rows) {
    const id = asText(row.id);
    if (!id) continue;
    const day = asDay(pick(row, CAPTURED_KEYS));
    if (day) dateById.set(id, day);
    else dateById.set(id, "");
  }
  const ids = [...dateById.keys()];

  const items = await Promise.all(
    CHECK_ITEM_TABLES.map(async (t) => ({
      table: t,
      rows: await probe(client, t, { column: "check_id", values: ids }),
    })),
  );
  const item = items.find((i) => i.rows !== null);
  if (!item || item.rows === null) return { available: false, reason: CHECK_UNAVAILABLE };

  const checks = item.rows
    .map((r) => {
      const parentId = asText(pick(r, ["check_id", "health_check_id", "session_id"]));
      const fallback = parentId ? dateById.get(parentId) || null : null;
      return toPartCheck(r, fallback);
    })
    .filter((c): c is PartCheck => c !== null);

  return { available: true, tableName: item.table, checks };
}

// ------------------------------------------------------------ the check-in --

export type WellbeingSource =
  | { available: false; reason: string }
  | { available: true; series: WellbeingSeries };

const WELLBEING_TABLES = [
  "wellbeing_notes",
  "wellbeing_entries",
  "wellbeing_checkins",
  "feeling_notes",
] as const;

const SLEEP_KEYS = ["sleep_hours", "hours_slept", "sleep"] as const;
const MOOD_KEYS = ["mood", "mood_score", "mood_rating", "energy_mood"] as const;
const ENERGY_KEYS = ["energy", "energy_score", "energy_level"] as const;
const WELLBEING_DATE_KEYS = [
  "noted_on",
  "occurred_on",
  "recorded_on",
  "checked_in_on",
  "created_at",
] as const;

const WELLBEING_UNAVAILABLE =
  "The daily check-in — how they seemed, how they slept — isn't part of this deployment yet. " +
  "Sleep and mood have no source, so they have no card.";

export async function loadWellbeing(
  supabase: ProbeableClient,
  petId: string,
): Promise<WellbeingSource> {
  const client = loosen(supabase);

  const hits = await Promise.all(
    WELLBEING_TABLES.map(async (t) => ({
      table: t,
      rows: await probe(client, t, { column: "pet_id", value: petId }),
    })),
  );
  const hit = hits.find((h) => h.rows !== null);
  if (!hit || hit.rows === null) return { available: false, reason: WELLBEING_UNAVAILABLE };

  const sleepHours: SeriesPoint[] = [];
  const mood: SeriesPoint[] = [];
  const energy: SeriesPoint[] = [];

  for (const row of hit.rows) {
    const date = asDay(pick(row, WELLBEING_DATE_KEYS));
    if (!date) continue;
    const s = asNumber(pick(row, SLEEP_KEYS));
    if (s !== null) sleepHours.push({ date, value: s });
    const m = asNumber(pick(row, MOOD_KEYS));
    if (m !== null) mood.push({ date, value: m });
    const e = asNumber(pick(row, ENERGY_KEYS));
    if (e !== null) energy.push({ date, value: e });
  }

  return {
    available: true,
    series: { tableName: hit.table, sleepHours, mood, energy },
  };
}
