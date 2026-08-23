/**
 * Print-optimised health summary — the sheet you hand a vet or a boarding kennel.
 *
 * Deliberately NOT wrapped in AppShell. A print view whose chrome is hidden by a
 * media query is one CSS regression away from putting a "Sign out" link on a
 * document going to a kennel; not rendering the chrome at all is the version
 * that cannot regress. Everything interactive here lives inside `.no-print`.
 *
 * Empty sections print "None recorded" rather than disappearing. On a sheet
 * someone is making a clinical decision from, "no medications" and "we didn't
 * put medications on this page" have to be distinguishable.
 */
import Link from "next/link";
import { notFound } from "next/navigation";
import PrintButton from "@/components/PrintButton";
import WeightChart from "@/components/WeightChart";
import { createClient, getUser } from "@/lib/supabase/server";
import {
  SPECIES_LABEL,
  ageFromBirthDate,
  daysUntil,
  formatDate,
  formatDateTime,
  formatMoney,
  formatWallClock,
} from "@/lib/format";
import {
  CLAIM_STATUS_LABEL,
  FOOD_TYPE_LABEL,
  FOOD_UNIT_LABEL,
  JOURNAL_CATEGORY_LABEL,
  type FeedingPlan,
  type InsuranceClaim,
  type InsurancePolicy,
  type JournalEntry,
  type Medication,
  type Pet,
  type Vaccination,
  type VetVisit,
  type WeightLog,
} from "@/lib/types";
import "./print.css";

export const dynamic = "force-dynamic";

/** How much history is "recent". Enough to be useful, few enough to stay short. */
const RECENT_VISITS = 8;
const RECENT_JOURNAL = 10;
const RECENT_WEIGHTS = 10;

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const { data } = await supabase.from("pets").select("name").eq("id", id).maybeSingle();
  const name = (data as { name: string } | null)?.name;
  // Chrome prints document.title in its own optional header, so this is the
  // title on the paper as well as in the tab.
  return { title: name ? `${name} — health summary` : "Health summary" };
}

// ------------------------------------------------------------- derivations --

const today = () => new Date().toISOString().slice(0, 10);

/** A course with no end date is still being given; one ending today still counts. */
function isActiveMedication(m: Medication): boolean {
  return m.end_date == null || m.end_date >= today();
}

/** Relative gloss on a due date. Only called when there IS one. */
function dueLabel(due: string): string {
  const d = daysUntil(due);
  if (d < 0) return `overdue by ${-d} day${d === -1 ? "" : "s"}`;
  if (d === 0) return "due today";
  if (d <= 60) return `due in ${d} day${d === 1 ? "" : "s"}`;
  // Past two months, the exact date is already in the column next door; a month
  // count is the part a reader can't do in their head.
  const months = Math.round(d / 30.44);
  return months < 24
    ? `in ~${months} months`
    : `in ~${(d / 365.25).toFixed(1)} years`;
}

/**
 * First-to-last change, plus the last 90 days on its own. The long view tells
 * you the shape of the animal; the 90-day view is the one that catches the
 * slide nobody noticed.
 */
function weightTrend(rows: WeightLog[]): string | null {
  if (rows.length < 2) return null;
  const first = rows[0];
  const last = rows[rows.length - 1];
  const delta = last.weight_kg - first.weight_kg;
  const pct = first.weight_kg > 0 ? (delta / first.weight_kg) * 100 : 0;
  const word = delta > 0 ? "up" : delta < 0 ? "down" : "unchanged";
  const overall =
    delta === 0
      ? `Unchanged at ${last.weight_kg} kg across ${rows.length} readings`
      : `${word} ${Math.abs(delta).toFixed(2)} kg (${Math.abs(pct).toFixed(1)}%) ` +
        `from ${first.weight_kg} kg on ${formatDate(first.recorded_on)} ` +
        `to ${last.weight_kg} kg on ${formatDate(last.recorded_on)}`;

  const cutoff = new Date(Date.now() - 90 * 86_400_000).toISOString().slice(0, 10);
  const recent = rows.filter((r) => r.recorded_on >= cutoff);
  if (recent.length < 2) return overall;
  const rDelta = recent[recent.length - 1].weight_kg - recent[0].weight_kg;
  const rWord = rDelta > 0 ? "up" : rDelta < 0 ? "down" : "flat";
  const last90 =
    rDelta === 0
      ? "flat over the last 90 days"
      : `${rWord} ${Math.abs(rDelta).toFixed(2)} kg over the last 90 days`;
  return `${overall}; ${last90}`;
}

/** No end date, or one still in the future. The latest such policy is the live one. */
function activePolicy(policies: InsurancePolicy[]): InsurancePolicy | null {
  const t = today();
  const live = policies.filter((p) => !p.end_date || p.end_date >= t);
  return (
    [...live].sort((a, b) => (b.start_date ?? "").localeCompare(a.start_date ?? ""))[0] ?? null
  );
}

function currentPlan(plans: FeedingPlan[]): FeedingPlan | null {
  // Two rows could briefly both be current if a supersede half-failed; the most
  // recently started one is the truthful answer either way.
  return (
    [...plans].filter((p) => p.is_current).sort((a, b) => b.started_on.localeCompare(a.started_on))[0] ??
    null
  );
}

/**
 * Escape a run of text for use inside a CSS `content: "..."` string. A pet
 * called `Ozzy "The Bin" Osbourne` would otherwise terminate the string early
 * and the browser would drop the whole @page rule — and, with a well-chosen
 * name, could close it and open something else.
 */
function cssString(text: string): string {
  return text
    .replace(/\\/g, "\\\\")
    .replace(/"/g, '\\"')
    .replace(/[\n\r\u2028\u2029]/g, " ")
    .replace(/</g, "\\3c ");
}

// ------------------------------------------------------------- primitives ---

function Section({
  title,
  note,
  children,
}: {
  title: string;
  note?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="mb-6">
      <h2 className="mb-2 border-b border-[var(--border)] pb-1 text-sm font-semibold uppercase tracking-wide">
        {title}
        {note && <span className="muted ml-2 text-xs font-normal normal-case">{note}</span>}
      </h2>
      {children}
    </section>
  );
}

function Empty({ what }: { what: string }) {
  return <p className="muted text-sm">None recorded.{` No ${what} have been entered for this pet.`}</p>;
}

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="rec">
      <dt className="muted text-[11px] uppercase tracking-wide">{label}</dt>
      <dd className="text-sm">{value || "—"}</dd>
    </div>
  );
}

// ------------------------------------------------------------------ page ----

export default async function SummaryPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await getUser();
  const supabase = await createClient();

  const { data: pet } = await supabase.from("pets").select("*").eq("id", id).maybeSingle();
  if (!pet) notFound();

  const [vaccinations, medications, weights, visits, policies, claims, journal, plans] =
    await Promise.all([
      supabase.from("vaccinations").select("*").eq("pet_id", id).order("administered_on", { ascending: false }),
      supabase.from("medications").select("*").eq("pet_id", id).order("start_date", { ascending: false }),
      supabase.from("weight_logs").select("*").eq("pet_id", id).order("recorded_on", { ascending: true }),
      supabase.from("vet_visits").select("*").eq("pet_id", id).order("visited_on", { ascending: false }),
      supabase.from("insurance_policies").select("*").eq("pet_id", id).order("created_at"),
      supabase
        .from("insurance_claims")
        .select("*")
        .eq("pet_id", id)
        .order("service_date", { ascending: false })
        .limit(6),
      supabase
        .from("journal_entries")
        .select("*")
        .eq("pet_id", id)
        // Several entries can share a day; without the tiebreak their order
        // flips between renders — and between the screen and the printout.
        .order("occurred_on", { ascending: false })
        .order("created_at", { ascending: false })
        .limit(RECENT_JOURNAL),
      supabase
        .from("feeding_plans")
        .select("*")
        .eq("pet_id", id)
        .order("started_on", { ascending: false })
        .order("created_at", { ascending: false }),
    ]);

  const p = pet as Pet;
  const vaccRows = (vaccinations.data ?? []) as Vaccination[];
  const medRows = (medications.data ?? []) as Medication[];
  const weightRows = (weights.data ?? []) as WeightLog[];
  const visitRows = (visits.data ?? []) as VetVisit[];
  const policyRows = (policies.data ?? []) as InsurancePolicy[];
  const claimRows = (claims.data ?? []) as InsuranceClaim[];
  const journalRows = (journal.data ?? []) as JournalEntry[];
  const planRows = (plans.data ?? []) as FeedingPlan[];

  const activeMeds = medRows.filter(isActiveMedication);
  const pastMeds = medRows.filter((m) => !isActiveMedication(m));
  const latestWeight = weightRows[weightRows.length - 1];
  const trend = weightTrend(weightRows);
  const policy = activePolicy(policyRows);
  const plan = currentPlan(planRows);
  const exportedOn = new Date();
  const exportedLabel = exportedOn.toLocaleDateString(undefined, {
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  return (
    <div className="sheet px-4 py-6 print:px-0 print:py-0">
      {/*
        The repeating footer's left-hand half. print.css owns the page number and
        the typography; only the two strings that depend on this pet can be
        injected here, and a CSS `content` string has to be escaped by hand
        because there is no JSX-style auto-escaping inside a stylesheet.
      */}
      <style
        dangerouslySetInnerHTML={{
          __html: `@page { @bottom-left { content: "${cssString(
            `${p.name} — health summary · exported ${exportedLabel}`
          )}"; } }`,
        }}
      />
      {/* Everything in here is screen-only; the printed sheet starts at <article>. */}
      <div className="no-print mb-6 flex flex-wrap items-center gap-3">
        <Link href={`/pets/${p.id}`} className="muted text-sm hover:text-brand-600">
          ← {p.name}
        </Link>
        <div className="ml-auto flex flex-wrap items-center gap-2">
          <a
            href={`/api/export?pet=${p.id}`}
            className="muted rounded-lg border border-[var(--border)] px-3 py-2 text-xs hover:border-brand-500 hover:text-brand-600"
          >
            Download JSON
          </a>
          <a
            href={`/api/export/vaccinations?pet=${p.id}`}
            className="muted rounded-lg border border-[var(--border)] px-3 py-2 text-xs hover:border-brand-500 hover:text-brand-600"
          >
            Vaccinations CSV
          </a>
          <a
            href={`/api/export/weight_logs?pet=${p.id}`}
            className="muted rounded-lg border border-[var(--border)] px-3 py-2 text-xs hover:border-brand-500 hover:text-brand-600"
          >
            Weights CSV
          </a>
          <PrintButton />
        </div>
      </div>

      <p className="no-print muted mb-6 text-xs">
        This page is laid out for paper. Print or save it as a PDF and it drops the
        navigation, prints black on white, and fits A4 or US Letter.
      </p>

      <article>
        <header className="sheet-head mb-6 border-b-2 border-[var(--text)] pb-3">
          <div className="flex flex-wrap items-baseline gap-x-3">
            <h1 className="text-2xl font-semibold tracking-tight">{p.name}</h1>
            <p className="muted text-sm">
              {[
                SPECIES_LABEL[p.species],
                p.breed,
                p.sex !== "unknown" ? p.sex : null,
                ageFromBirthDate(p.birth_date),
              ]
                .filter(Boolean)
                .join(" · ")}
            </p>
            <p className="muted ml-auto text-xs">Health summary · {exportedLabel}</p>
          </div>

          <dl className="mt-3 grid grid-cols-2 gap-x-6 gap-y-2 sm:grid-cols-4">
            <Field label="Species" value={SPECIES_LABEL[p.species]} />
            <Field label="Breed" value={p.breed} />
            <Field label="Sex" value={p.sex === "unknown" ? "Unknown" : p.sex} />
            <Field
              label="Date of birth"
              value={
                p.birth_date
                  ? `${formatDate(p.birth_date)} (${ageFromBirthDate(p.birth_date) ?? "age unknown"})`
                  : null
              }
            />
            <Field label="Microchip" value={p.microchip_id} />
            <Field
              label="Current weight"
              value={
                latestWeight
                  ? `${latestWeight.weight_kg} kg (${formatDate(latestWeight.recorded_on)})`
                  : null
              }
            />
            <Field label="Owner account" value={user?.email} />
            <Field label="Records held" value={`${vaccRows.length + medRows.length + weightRows.length + visitRows.length} entries`} />
          </dl>

          {p.notes && (
            <p className="rec mt-3 whitespace-pre-wrap text-sm">
              <span className="muted text-[11px] uppercase tracking-wide">Owner notes: </span>
              {p.notes}
            </p>
          )}
        </header>

        {/* ---------------------------------------------------- medications -- */}
        <Section title="Current medications" note={`${activeMeds.length} active`}>
          {activeMeds.length === 0 ? (
            <Empty what="medications" />
          ) : (
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="border-b border-[var(--border)] text-left">
                  <th className="py-1 pr-3 font-medium">Medication</th>
                  <th className="py-1 pr-3 font-medium">Dose</th>
                  <th className="py-1 pr-3 font-medium">Frequency</th>
                  <th className="py-1 pr-3 font-medium">Started</th>
                  <th className="py-1 font-medium">Notes</th>
                </tr>
              </thead>
              <tbody>
                {activeMeds.map((m) => (
                  <tr key={m.id} className="rec border-b border-[var(--border)] align-top">
                    <td className="py-1 pr-3 font-medium">{m.name}</td>
                    <td className="py-1 pr-3">{m.dosage || "—"}</td>
                    <td className="py-1 pr-3">{m.frequency || "—"}</td>
                    <td className="py-1 pr-3 whitespace-nowrap">{formatDate(m.start_date)}</td>
                    <td className="muted py-1">{m.notes || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          {pastMeds.length > 0 && (
            <p className="muted rec mt-2 text-xs">
              Previously: {pastMeds.slice(0, 8).map((m) => `${m.name} (to ${formatDate(m.end_date)})`).join("; ")}
              {pastMeds.length > 8 && ` — and ${pastMeds.length - 8} more`}
            </p>
          )}
        </Section>

        {/* --------------------------------------------------- vaccinations -- */}
        <Section title="Vaccination history" note={`${vaccRows.length} recorded`}>
          {vaccRows.length === 0 ? (
            <Empty what="vaccinations" />
          ) : (
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="border-b border-[var(--border)] text-left">
                  <th className="py-1 pr-3 font-medium">Vaccine</th>
                  <th className="py-1 pr-3 font-medium">Given</th>
                  <th className="py-1 pr-3 font-medium">Next due</th>
                  <th className="py-1 pr-3 font-medium">Clinic</th>
                  <th className="py-1 font-medium">Lot</th>
                </tr>
              </thead>
              <tbody>
                {vaccRows.map((v) => (
                  <tr key={v.id} className="rec border-b border-[var(--border)] align-top">
                    <td className="py-1 pr-3 font-medium">{v.name}</td>
                    <td className="py-1 pr-3 whitespace-nowrap">{formatDate(v.administered_on)}</td>
                    <td className="py-1 pr-3 whitespace-nowrap">
                      {v.due_on ? (
                        <>
                          {formatDate(v.due_on)}
                          <span className="muted"> ({dueLabel(v.due_on)})</span>
                        </>
                      ) : (
                        <span className="muted">not recorded</span>
                      )}
                    </td>
                    <td className="py-1 pr-3">{v.vet_clinic || "—"}</td>
                    <td className="muted py-1">{v.lot_number || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Section>

        {/* --------------------------------------------------------- weight -- */}
        <Section
          title="Weight history"
          note={`${weightRows.length} reading${weightRows.length === 1 ? "" : "s"}`}
        >
          {weightRows.length === 0 ? (
            <Empty what="weights" />
          ) : (
            <div className="avoid-break">
              {trend && <p className="rec mb-2 text-sm">Trend: {trend}</p>}
              {weightRows.length >= 2 && (
                <div className="weight-chart card mb-3 p-3">
                  <WeightChart
                    points={weightRows.map((w) => ({ date: w.recorded_on, kg: w.weight_kg }))}
                  />
                </div>
              )}
              <table className="w-full border-collapse text-sm">
                <thead>
                  <tr className="border-b border-[var(--border)] text-left">
                    <th className="py-1 pr-3 font-medium">Date</th>
                    <th className="py-1 pr-3 font-medium">Weight (kg)</th>
                    <th className="py-1 font-medium">Change</th>
                  </tr>
                </thead>
                <tbody>
                  {[...weightRows]
                    .reverse()
                    .slice(0, RECENT_WEIGHTS)
                    .map((w, i, arr) => {
                      const prev = arr[i + 1];
                      const d = prev ? w.weight_kg - prev.weight_kg : null;
                      return (
                        <tr key={w.id} className="rec border-b border-[var(--border)]">
                          <td className="py-1 pr-3 whitespace-nowrap">{formatDate(w.recorded_on)}</td>
                          <td className="py-1 pr-3">{w.weight_kg}</td>
                          <td className="muted py-1">
                            {d == null ? "—" : `${d > 0 ? "+" : ""}${d.toFixed(2)} kg`}
                          </td>
                        </tr>
                      );
                    })}
                </tbody>
              </table>
              {weightRows.length > RECENT_WEIGHTS && (
                <p className="muted mt-1 text-xs">
                  Showing the {RECENT_WEIGHTS} most recent of {weightRows.length} readings; the
                  chart covers all of them.
                </p>
              )}
            </div>
          )}
        </Section>

        {/* ---------------------------------------------------- vet visits --- */}
        <Section title="Recent vet visits" note={`${visitRows.length} recorded`}>
          {visitRows.length === 0 ? (
            <Empty what="vet visits" />
          ) : (
            <div>
              {visitRows.slice(0, RECENT_VISITS).map((v) => (
                <div key={v.id} className="rec mb-2 border-b border-[var(--border)] pb-2">
                  <p className="text-sm">
                    <span className="font-medium">{formatDate(v.visited_on)}</span>
                    {v.clinic && <span className="muted"> · {v.clinic}</span>}
                    {v.cost_cents != null && (
                      <span className="muted"> · {formatMoney(v.cost_cents)}</span>
                    )}
                  </p>
                  {v.reason && <p className="text-sm">Reason: {v.reason}</p>}
                  {v.diagnosis && <p className="text-sm">Diagnosis: {v.diagnosis}</p>}
                  {v.notes && <p className="muted text-sm">{v.notes}</p>}
                </div>
              ))}
              {visitRows.length > RECENT_VISITS && (
                <p className="muted text-xs">
                  and {visitRows.length - RECENT_VISITS} earlier visit
                  {visitRows.length - RECENT_VISITS === 1 ? "" : "s"} not shown.
                </p>
              )}
            </div>
          )}
        </Section>

        {/* ----------------------------------------------------- insurance --- */}
        <Section title="Insurance">
          {!policy ? (
            <Empty what="active policies" />
          ) : (
            <div className="avoid-break">
              <dl className="grid grid-cols-2 gap-x-6 gap-y-2 sm:grid-cols-4">
                <Field label="Provider" value={policy.provider} />
                <Field label="Plan" value={policy.plan_name} />
                <Field label="Policy number" value={policy.policy_number} />
                <Field label="Contact" value={policy.contact_phone} />
                <Field label="Cover from" value={formatDate(policy.start_date)} />
                <Field
                  label="Cover to"
                  value={policy.end_date ? formatDate(policy.end_date) : "open-ended"}
                />
                <Field label="Deductible" value={formatMoney(policy.deductible_cents)} />
                <Field
                  label="Reimbursement"
                  value={policy.reimbursement_pct != null ? `${policy.reimbursement_pct}%` : null}
                />
              </dl>
              {claimRows.length > 0 && (
                <p className="muted rec mt-2 text-xs">
                  Recent claims:{" "}
                  {claimRows
                    .map(
                      (c) =>
                        `${formatDate(c.service_date)} ${formatMoney(c.amount_claimed_cents)} (${CLAIM_STATUS_LABEL[c.status]})`
                    )
                    .join("; ")}
                </p>
              )}
            </div>
          )}
        </Section>

        {/* ------------------------------------------------------- feeding --- */}
        <Section title="Current feeding plan">
          {!plan ? (
            <Empty what="feeding plans" />
          ) : (
            <div className="avoid-break">
              <dl className="grid grid-cols-2 gap-x-6 gap-y-2 sm:grid-cols-4">
                <Field
                  label="Food"
                  value={[plan.food_brand, plan.food_product].filter(Boolean).join(" · ")}
                />
                <Field label="Type" value={FOOD_TYPE_LABEL[plan.food_type]} />
                <Field
                  label="Per meal"
                  value={
                    plan.amount_per_meal != null
                      ? `${plan.amount_per_meal} ${FOOD_UNIT_LABEL[plan.amount_unit]}`
                      : null
                  }
                />
                <Field
                  label="Meals per day"
                  value={String(plan.meals_per_day)}
                />
                <Field
                  label="Calories per day"
                  value={plan.calories_per_day != null ? `${plan.calories_per_day} kcal` : null}
                />
                <Field label="In place since" value={formatDate(plan.started_on)} />
              </dl>
              {plan.notes && <p className="rec mt-2 whitespace-pre-wrap text-sm">{plan.notes}</p>}
            </div>
          )}
        </Section>

        {/* ------------------------------------------------------- journal --- */}
        <Section title="Recent observations" note={`${journalRows.length} most recent`}>
          {journalRows.length === 0 ? (
            <Empty what="journal entries" />
          ) : (
            <div>
              {journalRows.map((j) => (
                <div key={j.id} className="rec mb-2 border-b border-[var(--border)] pb-2">
                  <p className="text-sm">
                    <span className="font-medium">{formatDate(j.occurred_on)}</span>
                    {j.occurred_at && <span className="muted"> {formatWallClock(j.occurred_at)}</span>}
                    <span className="muted"> · {JOURNAL_CATEGORY_LABEL[j.category]}</span>
                    {j.severity != null && <span className="muted"> · severity {j.severity}/5</span>}
                  </p>
                  <p className="text-sm font-medium">{j.title}</p>
                  {j.body && <p className="muted whitespace-pre-wrap text-sm">{j.body}</p>}
                </div>
              ))}
            </div>
          )}
        </Section>

        <p className="muted rec mt-6 border-t border-[var(--border)] pt-2 text-xs">
          Owner-entered records from FurIndex. Not a veterinary document and not a
          substitute for the issuing clinic&apos;s own certificates — vaccination
          certificates and lab reports should travel with this sheet.
          {" "}Generated {formatDateTime(exportedOn.toISOString())}.
        </p>
      </article>

    </div>
  );
}
