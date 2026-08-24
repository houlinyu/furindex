/**
 * One body part's history — what the "tap for that part's history" on the
 * dashboard's body map opens.
 *
 * The guided health check (spec 4.2) is being built in another session and its
 * tables are not on this branch. This page therefore has two honest states and
 * no third: the check exists and here is what you recorded, or the check isn't
 * here yet and this page says so. It never renders an empty timeline that
 * implies you looked and found nothing.
 */
import Link from "next/link";
import { notFound } from "next/navigation";
import AppShell from "@/components/AppShell";
import {
  AMBER_MEANS,
  PART_STATUS_GLYPH,
  PART_STATUS_LABEL,
  PART_STATUS_TONE,
  bodyPartById,
  summarizeParts,
} from "@/lib/body-parts";
import { loadHealthChecks } from "@/lib/optional-sources";
import { createClient, getUser } from "@/lib/supabase/server";
import { formatDate } from "@/lib/format";
import { todayIso } from "@/lib/activity";
import type { Pet } from "@/lib/types";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string; part: string }>;
}) {
  const { part } = await params;
  const bodyPart = bodyPartById(part);
  return { title: bodyPart ? `${bodyPart.label} — history` : "Body part history" };
}

export default async function BodyPartHistoryPage({
  params,
}: {
  params: Promise<{ id: string; part: string }>;
}) {
  const { id, part } = await params;
  const bodyPart = bodyPartById(part);
  if (!bodyPart) notFound();

  const user = await getUser();
  const supabase = await createClient();

  const { data: pet } = await supabase.from("pets").select("*").eq("id", id).maybeSingle();
  if (!pet) notFound();
  const p = pet as Pet;

  const source = await loadHealthChecks(supabase, id);
  const state = summarizeParts(source.available ? source.checks : [], todayIso()).find(
    (s) => s.part.id === bodyPart.id,
  )!;

  return (
    <AppShell email={user?.email}>
      <Link
        href={`/pets/${p.id}/dashboard`}
        className="muted inline-flex min-h-11 items-center text-sm hover:text-[var(--brand-text)]"
      >
        ← {p.name}&apos;s dashboard
      </Link>

      <header className="mb-6 mt-3">
        <h1 className="text-2xl font-semibold tracking-tight">{bodyPart.label}</h1>
        <p className="muted mt-1 text-sm leading-relaxed">{bodyPart.why}</p>
        <p className="muted mt-1 text-xs">
          Captured as {bodyPart.capture === "video" ? "a short video" : "a photo"}
          {bodyPart.optional ? " · optional in the check" : ""}
        </p>
      </header>

      <div
        className={`card mb-6 flex items-center gap-3 border p-4 ${PART_STATUS_TONE[state.status]}`}
      >
        <span className="text-lg" aria-hidden>
          {PART_STATUS_GLYPH[state.status]}
        </span>
        <div className="min-w-0">
          <p className="text-sm font-medium">{PART_STATUS_LABEL[state.status]}</p>
          <p className="muted text-xs">
            {state.lastChecked
              ? `Last looked at ${formatDate(state.lastChecked)}${
                  state.daysSince !== null ? ` · ${state.daysSince} days ago` : ""
                }`
              : "No look recorded."}
          </p>
        </div>
      </div>

      {!source.available ? (
        <div className="card p-6">
          <p className="text-sm font-medium">No history to show yet</p>
          <p className="muted mt-2 max-w-xl text-sm leading-relaxed">{source.reason}</p>
          <p className="muted mt-2 max-w-xl text-sm leading-relaxed">
            When the guided check lands, every look you record at {p.name}&apos;s{" "}
            {bodyPart.label.toLowerCase()} shows up here in order, with whatever you wrote
            at the time. Until then there is nothing to display, and an empty timeline
            would suggest you looked and found nothing — which isn&apos;t what happened.
          </p>
        </div>
      ) : state.history.length === 0 ? (
        <div className="card p-6">
          <p className="text-sm font-medium">Not checked yet</p>
          <p className="muted mt-2 max-w-xl text-sm leading-relaxed">
            The guided check is available, but {bodyPart.label.toLowerCase()} hasn&apos;t
            been looked at for {p.name}. That is an absence, not a result.
          </p>
        </div>
      ) : (
        <ol className="space-y-3">
          {state.history.map((c, i) => (
            <li key={`${c.checkedOn}-${i}`} className="card p-4">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <p className="text-sm font-medium">{formatDate(c.checkedOn)}</p>
                <span
                  className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[0.6875rem] ${PART_STATUS_TONE[c.assessment]}`}
                >
                  {PART_STATUS_LABEL[c.assessment]}
                </span>
              </div>
              {c.note && (
                <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed">{c.note}</p>
              )}
            </li>
          ))}
        </ol>
      )}

      <p className="muted mt-4 text-xs leading-relaxed">
        {AMBER_MEANS} Everything on this page is your own assessment, recorded and read
        back — none of it is ours, and none of it is a diagnosis.
      </p>
    </AppShell>
  );
}
