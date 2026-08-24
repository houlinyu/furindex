/**
 * Screen 4.4 — the health dashboard.
 *
 * It reads as a dashboard rather than a form summary, and it is built entirely
 * out of things this deployment actually holds. Three rules run through every
 * decision on this page:
 *
 *  1. Every KPI card names its source. `Kpi.source` is a required field in
 *     lib/dashboard, so a card without one does not compile.
 *  2. A metric with nothing behind it gets no card, no zero and no dash — it
 *     appears in "Not tracked" as a sentence explaining why. There is no
 *     wearable in this deployment, so heart rate, temperature, distance and
 *     speed are absent by construction rather than filled with placeholders.
 *  3. Nothing is compared to a population. Every comparison on this page runs
 *     through lib/baselines, which compares the animal to its own recent past
 *     and stays silent unless the move clears its whole guard stack. No verdicts.
 *
 * Server component throughout: zero client JS, and no server actions, because
 * nothing here mutates anything.
 */
import Link from "next/link";
import { notFound } from "next/navigation";
import AppShell from "@/components/AppShell";
import PetAvatar from "@/components/PetAvatar";
import KpiCard from "@/components/dashboard/KpiCard";
import NotTracked from "@/components/dashboard/NotTracked";
import BodyStatusGrid from "@/components/dashboard/BodyStatusGrid";
import TrendsSection, { type TrendSeries } from "@/components/dashboard/TrendsSection";
import ObservationsPanel from "@/components/dashboard/ObservationsPanel";
import type { ChartMarker } from "@/components/dashboard/OverlayChart";
import { createClient, getUser } from "@/lib/supabase/server";
import { signedPetPhotoUrl } from "@/lib/photos";
import { SPECIES_LABEL, ageFromBirthDate, localDayKey } from "@/lib/format";
import {
  analyzeSeries,
  DEFAULT_WINDOW_DAYS,
  MIN_POINTS_PER_WINDOW,
  MIN_SPAN_DAYS,
  type SeriesPoint,
} from "@/lib/baselines";
import {
  ACTIVITY_FIELD_UNIT,
  ACTIVITY_NOT_A_SYMPTOM_NOTE,
  findActivityDefinition,
  todayIso,
} from "@/lib/activity";
import {
  KPI_WINDOW_DAYS,
  buildKpis,
  findDurationDefinition,
  type WellbeingSeries,
} from "@/lib/dashboard";
import { collectSignals, findObservations } from "@/lib/observations";
import { summarizeParts } from "@/lib/body-parts";
import { loadHealthChecks, loadWellbeing } from "@/lib/optional-sources";
import type {
  CustomValue,
  FeedingLog,
  FieldDefinition,
  JournalEntry,
  Pet,
  WeightLog,
} from "@/lib/types";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const { data } = await supabase.from("pets").select("name").eq("id", id).maybeSingle();
  const name = (data as { name: string } | null)?.name;
  return { title: name ? `${name} — health dashboard` : "Health dashboard" };
}

/** Beyond this many distinct meal days the marker lane stops being readable. */
const MEAL_MARKER_DAY_CAP = 30;

export default async function PetDashboardPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const user = await getUser();
  const supabase = await createClient();

  const { data: pet } = await supabase.from("pets").select("*").eq("id", id).maybeSingle();
  if (!pet) notFound();
  const p = pet as Pet;

  const [weights, customValues, definitions, feeding, journal, checkSource, wellbeingSource] =
    await Promise.all([
      supabase
        .from("weight_logs")
        .select("*")
        .eq("pet_id", id)
        .order("recorded_on", { ascending: true }),
      supabase
        .from("custom_values")
        .select("*")
        .eq("pet_id", id)
        .order("recorded_on", { ascending: true }),
      supabase.from("field_definitions").select("*").order("label"),
      supabase
        .from("feeding_logs")
        .select("*")
        .eq("pet_id", id)
        .order("fed_at", { ascending: false })
        .limit(400),
      supabase
        .from("journal_entries")
        .select("*")
        .eq("pet_id", id)
        .order("occurred_on", { ascending: false })
        .order("created_at", { ascending: false })
        .limit(200),
      // Both of these belong to sessions that haven't landed. They answer
      // "not yet" rather than throwing — see lib/optional-sources.
      loadHealthChecks(supabase, id),
      loadWellbeing(supabase, id),
    ]);

  const weightRows = (weights.data ?? []) as WeightLog[];
  const valueRows = (customValues.data ?? []) as CustomValue[];
  const defRows = (definitions.data ?? []) as FieldDefinition[];
  const feedingRows = (feeding.data ?? []) as FeedingLog[];
  const journalRows = (journal.data ?? []) as JournalEntry[];
  const photoUrl = await signedPetPhotoUrl(supabase, p.photo_url);

  const today = todayIso();
  const wellbeing: WellbeingSeries | null = wellbeingSource.available
    ? wellbeingSource.series
    : null;

  // ------------------------------------------------------------------ KPIs --
  const { cards, untracked, isEmpty } = buildKpis({
    petName: p.name,
    today,
    windowDays: KPI_WINDOW_DAYS,
    weights: weightRows,
    values: valueRows,
    definitions: defRows,
    feedingLogs: feedingRows,
    wellbeing,
  });

  // ---------------------------------------------------------------- series --
  const activityDef = findActivityDefinition(defRows);
  const durationDef = findDurationDefinition(defRows);
  const seriesFor = (defId: string): SeriesPoint[] =>
    valueRows
      .filter((v) => v.definition_id === defId && v.value_number != null)
      .map((v) => ({ date: v.recorded_on, value: v.value_number as number }));

  const weightPoints: SeriesPoint[] = weightRows.map((w) => ({
    date: w.recorded_on,
    value: w.weight_kg,
  }));
  const activityPoints = activityDef ? seriesFor(activityDef.id) : [];
  const durationPoints = durationDef ? seriesFor(durationDef.id) : [];

  const opts = { windowDays: DEFAULT_WINDOW_DAYS };
  const trends: TrendSeries[] = [];
  if (weightPoints.length > 0) {
    trends.push({
      key: "weight",
      label: "Weight",
      unit: "kg",
      source: "manual",
      origin: "the weights you've recorded",
      analysis: analyzeSeries(weightPoints, opts),
    });
  }
  if (activityPoints.length > 0) {
    trends.push({
      key: "activity",
      label: "Activity level",
      unit: ACTIVITY_FIELD_UNIT,
      source: "manual",
      origin: "your daily activity tap",
      analysis: analyzeSeries(activityPoints, opts),
    });
  }
  if (durationDef && durationPoints.length > 0) {
    trends.push({
      key: "duration",
      label: durationDef.label,
      unit: durationDef.unit,
      source: "manual",
      origin: `your "${durationDef.label}" field`,
      analysis: analyzeSeries(durationPoints, opts),
    });
  }
  if (wellbeing) {
    const wb: [string, string, string | null, SeriesPoint[]][] = [
      ["wb-sleep", "Sleep", "h", wellbeing.sleepHours],
      ["wb-mood", "Mood", null, wellbeing.mood],
      ["wb-energy", "Energy", null, wellbeing.energy],
    ];
    for (const [key, label, unit, points] of wb) {
      if (points.length === 0) continue;
      trends.push({
        key,
        label,
        unit,
        source: "manual",
        origin: `your daily check-in (${wellbeing.tableName})`,
        analysis: analyzeSeries(points, opts),
      });
    }
  }

  // --------------------------------------------------------------- markers --
  const markers: ChartMarker[] = [];
  for (const e of journalRows) {
    markers.push({ date: e.occurred_on, kind: "journal", label: e.title });
  }
  const mealDays = new Set<string>();
  for (const l of feedingRows) {
    const day = localDayKey(l.fed_at);
    if (!day) continue;
    if (l.skipped) markers.push({ date: day, kind: "skipped", label: "Meal skipped" });
    else mealDays.add(day);
  }
  // Every meal on a busy log would turn the lane into a solid bar and hide the
  // markers that carry information.
  const mealsShown = mealDays.size > 0 && mealDays.size <= MEAL_MARKER_DAY_CAP;
  if (mealsShown) {
    for (const day of mealDays) markers.push({ date: day, kind: "meal", label: "Meal logged" });
  }
  if (checkSource.available) {
    for (const c of checkSource.checks) {
      markers.push({ date: c.checkedOn, kind: "check", label: "Health check" });
    }
  }

  // ---------------------------------------------------------- observations --
  const signals = collectSignals({
    petName: p.name,
    today,
    activity: activityPoints,
    weights: weightPoints,
    sleep: wellbeing?.sleepHours ?? [],
    wellbeingMood: wellbeing?.mood ?? [],
    wellbeingEnergy: wellbeing?.energy ?? [],
    journal: journalRows,
    feedingLogs: feedingRows,
  });
  const observations = findObservations(signals);

  // ------------------------------------------------------------ body parts --
  const partStates = summarizeParts(
    checkSource.available ? checkSource.checks : [],
    today,
  );

  return (
    <AppShell email={user?.email}>
      <Link
        href={`/pets/${p.id}`}
        className="muted inline-flex min-h-11 items-center text-sm hover:text-[var(--brand-text)]"
      >
        ← {p.name}
      </Link>

      <header className="mb-6 mt-3 flex flex-wrap items-start gap-4">
        <PetAvatar pet={p} photoUrl={photoUrl} size="lg" />
        <div className="min-w-0 flex-1 basis-48">
          <h1 className="text-2xl font-semibold tracking-tight">
            {p.name}&apos;s health dashboard
          </h1>
          <p className="muted mt-1 text-sm">
            {[SPECIES_LABEL[p.species], p.breed, ageFromBirthDate(p.birth_date)]
              .filter(Boolean)
              .join(" · ")}
          </p>
          <p className="muted mt-1 text-xs leading-relaxed">
            Everything here is measured against {p.name}&apos;s own history — never a breed
            chart or a population average. Nothing on this page is a diagnosis.
          </p>
        </div>
        <Link
          href={`/pets/${p.id}/summary`}
          className="ml-auto inline-flex min-h-11 shrink-0 items-center rounded-lg bg-brand-600 px-4 text-sm font-medium text-white hover:bg-brand-700"
        >
          Export this for my vet
        </Link>
      </header>

      {/* ------------------------------------------------------------ KPIs -- */}
      <section className="mb-8">
        <h2 className="mb-1 text-sm font-medium uppercase tracking-wide muted">
          Last {KPI_WINDOW_DAYS} days
        </h2>
        <p className="muted mb-3 text-xs leading-relaxed">
          Every card says where its number came from. Manually logged means you tapped or
          typed it; computed means we did arithmetic on things you logged and measured
          nothing new.
        </p>

        {isEmpty ? (
          <div className="card p-6">
            <p className="text-sm font-medium">Nothing logged for {p.name} yet</p>
            <p className="muted mt-2 max-w-xl text-sm leading-relaxed">
              This is an empty dashboard rather than a dashboard full of zeros, because
              zero readings and a reading of zero are different things and only one of
              them is true here. Log a weight or tap today&apos;s activity level and the
              first card appears; the comparisons start once there are{" "}
              {MIN_POINTS_PER_WINDOW} readings in each of two {DEFAULT_WINDOW_DAYS}-day
              stretches spanning at least {MIN_SPAN_DAYS} days.
            </p>
            <Link
              href={`/pets/${p.id}#activity`}
              className="mt-4 inline-flex min-h-11 items-center rounded-lg bg-brand-600 px-4 text-sm font-medium text-white hover:bg-brand-700"
            >
              Log something for {p.name}
            </Link>
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {cards.map((kpi) => (
              <KpiCard key={kpi.key} kpi={kpi} />
            ))}
          </div>
        )}

        <div className="mt-3">
          <NotTracked metrics={untracked} />
        </div>

        <p className="muted mt-3 text-xs leading-relaxed">{ACTIVITY_NOT_A_SYMPTOM_NOTE}</p>
      </section>

      {/* ------------------------------------------------------ body parts -- */}
      <section className="mb-8">
        <h2 className="mb-1 text-sm font-medium uppercase tracking-wide muted">
          Part by part
        </h2>
        <p className="muted mb-3 text-xs leading-relaxed">
          What you saw when you last looked, in your own words. Tap any part for its
          history.
        </p>
        <BodyStatusGrid
          petId={p.id}
          states={partStates}
          unavailableReason={checkSource.available ? null : checkSource.reason}
        />
      </section>

      {/* ---------------------------------------------------------- trends -- */}
      {trends.length > 0 && (
        <section className="mb-8">
          <h2 className="mb-1 text-sm font-medium uppercase tracking-wide muted">Trends</h2>
          <p className="muted mb-3 text-xs leading-relaxed">
            Each series on its own timeline, with your manual log entries marked underneath
            it. The markers sit in their own lane on purpose — a journal note is not a
            reading of the line above it.
            {mealDays.size > MEAL_MARKER_DAY_CAP && (
              <>
                {" "}
                Individual meals aren&apos;t marked here: {mealDays.size} days of them would
                fill the lane and hide everything else. Skipped meals still are.
              </>
            )}
          </p>
          <TrendsSection series={trends} markers={markers} petName={p.name} />
        </section>
      )}

      {/* ---------------------------------------------------- observations -- */}
      <section className="mb-8">
        <h2 className="mb-1 text-sm font-medium uppercase tracking-wide muted">
          Things that lined up
        </h2>
        <p className="muted mb-3 text-xs leading-relaxed">
          Two independent records moving in the same window, described and nothing more.
          No score, no severity, no verdict — we are not in a position to give one.
        </p>
        <ObservationsPanel observations={observations} />
      </section>

      <section className="mb-8">
        <div className="card p-4">
          <p className="text-sm font-medium">Taking this to a vet</p>
          <p className="muted mt-1 text-sm leading-relaxed">
            The printable summary has the whole record — weights, vaccinations,
            medications, visits, journal and diet — laid out for someone reading it cold.
            It is the same document this dashboard is a live view of.
          </p>
          <Link
            href={`/pets/${p.id}/summary`}
            className="mt-3 inline-flex min-h-11 items-center rounded-lg border border-[var(--border)] px-4 text-sm hover:border-brand-500 hover:text-[var(--brand-text)]"
          >
            Open the printable summary
          </Link>
        </div>
      </section>
    </AppShell>
  );
}
