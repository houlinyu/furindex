"use client";

/**
 * Block 2 — Vaccines & preventive care.
 *
 * One row per core vaccine for the pet's species. Each row asks one question —
 * has this been given? — in three honest answers, and only then asks for a
 * date. Everything downstream of that date is arithmetic the owner can edit.
 *
 * ── THE TONE, WHICH IS THE HARD PART ───────────────────────────────────────
 * This screen is one bad sentence away from practising veterinary medicine. It
 * knows nothing about the animal in front of it: not its age, not its health,
 * not which vial the clinic used, not what the law says where the owner lives.
 * What it has is a published guideline number and a calendar.
 *
 * So: every interval is rendered as an editable input pre-filled with a
 * default, never as text. Every default sits next to the note explaining why it
 * is only a default and which published guideline it came from. Nothing on this
 * screen says "due", "required", "overdue", "protected" or "at risk" in its own
 * voice — the computed date is labelled "estimated next due", which is what it
 * is. The disclaimer is one plain sentence at the top rather than a paragraph
 * of hedging, because a paragraph gets skipped and a sentence gets read.
 *
 * Rabies gets a second, louder caveat of its own. Its interval is a legal
 * question, and on a legal question the app has no standing to have a default
 * at all — only a starting guess it says out loud is a guess.
 *
 * ── THE MECHANICS ──────────────────────────────────────────────────────────
 * - useActionState, and the whole fieldset disables while pending. A form
 *   without that is how this codebase once produced eleven duplicate records.
 * - Pre-filled from rows that already exist, so the second visit shows what was
 *   saved and re-submitting is a genuine no-op rather than a second copy.
 * - The estimated next-due is derived during render from the date and the
 *   interval, until the owner edits it — at which point theirs sticks. No
 *   effects, no race between two fields recomputing each other.
 * - Every control is at least 44px tall and has a real <label>. The radio
 *   inputs are visually hidden but genuinely present, so this is keyboard- and
 *   screen-reader-navigable as an ordinary radio group.
 */

import { useActionState, useEffect, useMemo, useState } from "react";
import { saveVaccineBlock, type VaccineBlockState } from "@/app/vaccine-actions";
import { formatDate } from "@/lib/format";
import { todayISO } from "@/lib/reminders";
import {
  APPLIED_ANSWERS,
  APPLIED_FOLLOW_UP,
  APPLIED_LABEL,
  DEFAULT_LEAD,
  PUPPY_KITTEN_NOTE,
  RABIES_NOTE,
  REMINDER_LEADS,
  VACCINE_DISCLAIMER,
  isReminderLead,
  nextDueFrom,
  reminderDateFor,
  vaccinesFor,
  type AppliedAnswer,
  type ReminderLead,
  type VaccineDef,
} from "@/lib/vaccines";
import type { CareReminder, PetSpecies, Vaccination } from "@/lib/types";

const field =
  "w-full min-h-11 rounded-lg border border-[var(--border)] bg-transparent px-3 py-2 text-sm outline-none focus:border-brand-500";
const labelText = "mb-1 block text-xs font-medium";

type RowState = {
  applied: AppliedAnswer;
  administeredOn: string;
  months: string;
  /** Only consulted once `dueTouched`; before that the shown date is derived. */
  dueOn: string;
  dueTouched: boolean;
};

/**
 * Seeds a row from what is already saved.
 *
 * Defaults to "Not sure" rather than "No". An owner who has not answered has
 * not said no, and pre-selecting "No" would put words in their mouth on a
 * medical question — the same reason "unsure" is a first-class value in the
 * data model rather than a synonym for absent.
 */
function seedRow(
  def: VaccineDef,
  vaccinations: Vaccination[],
  reminders: CareReminder[]
): RowState {
  const latest = vaccinations
    .filter((v) => v.vaccine_key === def.key)
    .sort((a, b) => b.administered_on.localeCompare(a.administered_on))[0];
  const reminder = reminders.find((r) => r.vaccine_key === def.key && r.is_active);

  const months = reminder?.interval_months ?? def.defaultIntervalMonths;

  if (!latest) {
    return {
      applied: "unsure",
      administeredOn: "",
      months: String(months),
      dueOn: "",
      dueTouched: false,
    };
  }
  const derived = nextDueFrom(latest.administered_on, months);
  return {
    applied: "yes",
    administeredOn: latest.administered_on,
    months: String(months),
    dueOn: latest.due_on ?? "",
    // Treat a stored due date that our own arithmetic would not have produced
    // as an edit the owner made, so re-rendering never silently overwrites it.
    dueTouched: !!latest.due_on && latest.due_on !== derived,
  };
}

function seedLead(reminders: CareReminder[]): ReminderLead {
  const withLead = reminders.find(
    (r) => r.vaccine_key && r.reminder_lead_days !== null && r.is_active
  );
  if (!withLead || withLead.reminder_lead_days === null) return DEFAULT_LEAD;
  if (withLead.reminder_lead_days <= 7) return "1w";
  if (withLead.reminder_lead_days <= 14) return "2w";
  return "1m";
}

export default function VaccineBlock({
  petId,
  species,
  vaccinations,
  reminders,
}: {
  petId: string;
  species: PetSpecies;
  vaccinations: Vaccination[];
  reminders: CareReminder[];
}) {
  const defs = useMemo(() => vaccinesFor(species), [species]);

  const [state, formAction, pending] = useActionState<VaccineBlockState, FormData>(
    saveVaccineBlock,
    {}
  );

  const [rows, setRows] = useState<Record<string, RowState>>(() =>
    Object.fromEntries(defs.map((d) => [d.key, seedRow(d, vaccinations, reminders)]))
  );
  const [lead, setLead] = useState<ReminderLead>(() => seedLead(reminders));

  // Filled after mount only. Seeding it during the server render would send the
  // server's calendar date to a browser whose evening is the server's tomorrow.
  const [today, setToday] = useState("");
  useEffect(() => setToday(todayISO()), []);

  // Nothing to render for a species we have no defined core set for. Saying so
  // would be better than silence if we had anything true to say, but inventing
  // a rabbit or reptile schedule is exactly what this feature must not do, and
  // an empty checklist reads as "you have nothing to do", which is worse.
  if (defs.length === 0) return null;

  function patch(key: string, next: Partial<RowState>) {
    setRows((prev) => ({ ...prev, [key]: { ...prev[key], ...next } }));
  }

  return (
    <section className="mb-8">
      <h2 className="mb-1 text-sm font-medium uppercase tracking-wide muted">
        Vaccines &amp; preventive care
      </h2>
      <p className="muted mb-3 text-xs">
        Work down the list off your vaccination card. Anything you&apos;re not sure
        about can stay &ldquo;not sure&rdquo; — a blank is more useful than a guess.
      </p>

      <form action={formAction} className="card p-4">
        <input type="hidden" name="pet_id" value={petId} />
        {today && <input type="hidden" name="today" value={today} />}

        {/* The disclaimer sits ABOVE the inputs, not under the save button.
            Below the fold it is decoration; above the first question it is
            context for every answer that follows. */}
        <p className="mb-4 rounded-lg border border-[var(--border)] bg-[color-mix(in_srgb,var(--brand-text)_5%,transparent)] p-3 text-xs leading-relaxed">
          <strong className="font-medium">These aren&apos;t medical advice.</strong>{" "}
          {VACCINE_DISCLAIMER}
        </p>

        <fieldset disabled={pending} className="min-w-0">
          <legend className="sr-only">Core vaccines</legend>

          <ul className="divide-y divide-[var(--border)]">
            {defs.map((def) => {
              const row = rows[def.key];
              const monthsNum = Number(row.months);
              const monthsOk =
                Number.isInteger(monthsNum) && monthsNum >= 1 && monthsNum <= 120;

              const derivedDue =
                row.applied === "yes" && row.administeredOn && monthsOk
                  ? nextDueFrom(row.administeredOn, monthsNum)
                  : null;
              const dueValue = row.dueTouched ? row.dueOn : (derivedDue ?? "");
              const remindOn = dueValue ? reminderDateFor(dueValue, lead) : null;

              return (
                <li key={def.key} className="py-4 first:pt-0 last:pb-0">
                  <div className="flex flex-wrap items-baseline gap-x-2">
                    <h3 className="text-sm font-medium">{def.label}</h3>
                    {def.tier.tier === "risk_based" && (
                      <span className="muted rounded border border-[var(--border)] px-1.5 py-0.5 text-[10px] uppercase tracking-wide">
                        risk-based
                      </span>
                    )}
                  </div>
                  {def.expansion && (
                    <p className="muted mt-0.5 text-xs">{def.expansion}</p>
                  )}
                  <p className="mt-1 text-xs leading-relaxed">{def.covers}</p>
                  <p className="muted mt-1 text-xs leading-relaxed">{def.tier.note}</p>

                  {/* ---- the tri-state question ---- */}
                  <fieldset className="mt-3">
                    <legend className={labelText}>
                      Has {def.label} been given?
                    </legend>
                    <div className="flex flex-wrap gap-2">
                      {APPLIED_ANSWERS.map((a) => {
                        const checked = row.applied === a;
                        return (
                          <label
                            key={a}
                            className="cursor-pointer"
                            // 44px minimum tap target, on the label itself so
                            // the whole pill is the hit area and not just the
                            // text inside it.
                          >
                            <input
                              type="radio"
                              name={`applied__${def.key}`}
                              value={a}
                              checked={checked}
                              onChange={() => patch(def.key, { applied: a })}
                              className="peer sr-only"
                            />
                            <span
                              className={`inline-flex min-h-11 min-w-[5.5rem] items-center justify-center rounded-lg border px-4 text-sm transition peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-brand-600 ${
                                checked
                                  ? "border-brand-500 font-medium text-[var(--brand-text)]"
                                  : "border-[var(--border)] hover:border-brand-500"
                              }`}
                            >
                              {APPLIED_LABEL[a]}
                            </span>
                          </label>
                        );
                      })}
                    </div>
                  </fieldset>

                  {row.applied !== "yes" && (
                    <p className="muted mt-2 text-xs">{APPLIED_FOLLOW_UP[row.applied]}</p>
                  )}

                  {/* ---- date, interval, computed due ---- */}
                  {row.applied === "yes" && (
                    <div className="mt-3 grid gap-3 sm:grid-cols-3">
                      <div>
                        <label htmlFor={`date-${def.key}`} className={labelText}>
                          Date last given
                        </label>
                        <input
                          id={`date-${def.key}`}
                          name={`date__${def.key}`}
                          type="date"
                          value={row.administeredOn}
                          max={today || undefined}
                          onChange={(e) =>
                            patch(def.key, { administeredOn: e.target.value })
                          }
                          className={field}
                        />
                      </div>

                      <div>
                        <label htmlFor={`interval-${def.key}`} className={labelText}>
                          Repeat every (months)
                        </label>
                        <input
                          id={`interval-${def.key}`}
                          name={`interval__${def.key}`}
                          type="number"
                          inputMode="numeric"
                          min={1}
                          max={120}
                          step={1}
                          value={row.months}
                          onChange={(e) => patch(def.key, { months: e.target.value })}
                          className={field}
                          aria-describedby={`interval-note-${def.key}`}
                        />
                      </div>

                      <div>
                        <label htmlFor={`due-${def.key}`} className={labelText}>
                          Estimated next due
                        </label>
                        <input
                          id={`due-${def.key}`}
                          name={`due__${def.key}`}
                          type="date"
                          value={dueValue}
                          onChange={(e) =>
                            patch(def.key, { dueOn: e.target.value, dueTouched: true })
                          }
                          className={field}
                          aria-describedby={`due-note-${def.key}`}
                        />
                        <p id={`due-note-${def.key}`} className="muted mt-1 text-xs">
                          {row.dueTouched
                            ? "Your date — we won't recalculate over it."
                            : "Calculated. Change it and yours sticks."}
                        </p>
                      </div>
                    </div>
                  )}

                  {/* The note explaining the default ALWAYS renders, whether or
                      not the row is expanded. A number without its caveat is an
                      assertion, and this is the caveat. */}
                  <p
                    id={`interval-note-${def.key}`}
                    className="muted mt-2 text-xs leading-relaxed"
                  >
                    <span className="font-medium">
                      Default {def.defaultIntervalMonths} months —{" "}
                    </span>
                    {def.intervalNote}
                  </p>
                  <p className="muted mt-1 text-[11px] leading-relaxed">
                    Where that came from: {def.source}
                  </p>

                  {def.jurisdictional && (
                    <p className="mt-2 rounded-lg border border-amber-500/40 bg-amber-500/5 p-2.5 text-xs leading-relaxed">
                      <strong className="font-medium">Check this one.</strong>{" "}
                      {RABIES_NOTE}
                    </p>
                  )}

                  {row.applied === "yes" && dueValue && remindOn && (
                    <p className="muted mt-2 text-xs">
                      Estimated due {formatDate(dueValue)} · we&apos;ll remind you{" "}
                      {formatDate(remindOn)}
                    </p>
                  )}
                </li>
              );
            })}
          </ul>

          {/* ---- one lead time for the whole set ---- */}
          <fieldset className="mt-5 border-t border-[var(--border)] pt-4">
            <legend className={labelText}>Remind me</legend>
            <div className="flex flex-wrap gap-2">
              {REMINDER_LEADS.map((opt) => {
                const checked = lead === opt.key;
                return (
                  <label key={opt.key} className="cursor-pointer">
                    <input
                      type="radio"
                      name="lead"
                      value={opt.key}
                      checked={checked}
                      onChange={(e) =>
                        setLead(isReminderLead(e.target.value) ? e.target.value : DEFAULT_LEAD)
                      }
                      className="peer sr-only"
                    />
                    <span
                      className={`inline-flex min-h-11 items-center justify-center rounded-lg border px-4 text-sm transition peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-brand-600 ${
                        checked
                          ? "border-brand-500 font-medium text-[var(--brand-text)]"
                          : "border-[var(--border)] hover:border-brand-500"
                      }`}
                    >
                      {opt.label}
                    </span>
                  </label>
                );
              })}
            </div>
            <p className="muted mt-2 text-xs leading-relaxed">
              Applies to every row above. The reminder lands this far ahead of the
              estimated date so there is time to book.
            </p>
          </fieldset>

          <p className="muted mt-4 text-xs leading-relaxed">{PUPPY_KITTEN_NOTE}</p>

          <div className="mt-4 flex flex-wrap items-center gap-3">
            <button
              type="submit"
              disabled={pending}
              className="inline-flex min-h-11 shrink-0 items-center rounded-lg bg-brand-600 px-4 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-60"
            >
              {pending ? "Saving…" : "Save vaccination record"}
            </button>
            {state.ok && !state.error && (
              <span className="text-xs text-[var(--brand-text)]" role="status">
                Saved. {state.scheduled ?? 0} reminder
                {state.scheduled === 1 ? "" : "s"} scheduled.
              </span>
            )}
          </div>
        </fieldset>

        {state.error && (
          <p className="mt-3 text-sm text-red-600 dark:text-red-400" role="alert">
            {state.error}
          </p>
        )}
      </form>
    </section>
  );
}
