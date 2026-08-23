"use client";

import { useActionState, useRef, useState } from "react";
import {
  addMedication,
  addVaccination,
  addVetVisit,
  addWeight,
  type RecordFormState,
} from "@/app/actions";
import { daysUntil, formatDate, formatMoney } from "@/lib/format";
import type { Medication, Vaccination, VetVisit, WeightLog } from "@/lib/types";

const field =
  "w-full rounded-lg border border-[var(--border)] bg-transparent px-3 py-2 text-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600 focus:border-brand-500";
const submit =
  "rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700";

type Tab = "vaccinations" | "medications" | "weight" | "visits";
const TABS: { key: Tab; label: string }[] = [
  { key: "vaccinations", label: "Vaccinations" },
  { key: "medications", label: "Medications" },
  { key: "weight", label: "Weight" },
  { key: "visits", label: "Vet visits" },
];

const today = () => new Date().toISOString().slice(0, 10);

/**
 * Every record form goes through this. It exists because the previous version
 * passed the server action straight to `action=`, which meant a validation
 * failure threw a full-page "Application error" and the button never disabled —
 * so users clicked again, and again. That is exactly how one tester ended up
 * with eleven identical pets.
 */
function RecordForm({
  action,
  submitLabel,
  children,
  className = "",
}: {
  action: (prev: RecordFormState, fd: FormData) => Promise<RecordFormState>;
  submitLabel: string;
  children: React.ReactNode;
  className?: string;
}) {
  const [state, formAction, pending] = useActionState<RecordFormState, FormData>(action, {});
  const ref = useRef<HTMLFormElement>(null);

  // Clear the fields once the row is actually written, so the next entry starts
  // from empty rather than the previous values.
  if (state.ok && ref.current) ref.current.reset();

  return (
    <form ref={ref} action={formAction} className={className}>
      {children}
      {state.error && (
        <p className="text-sm text-red-600 sm:col-span-2" role="alert">
          {state.error}
        </p>
      )}
      <div className="sm:col-span-2">
        <button type="submit" disabled={pending} className={submit}>
          {pending ? "Saving…" : submitLabel}
        </button>
      </div>
    </form>
  );
}

export default function RecordTabs({
  petId,
  vaccinations,
  medications,
  weights,
  visits,
}: {
  petId: string;
  vaccinations: Vaccination[];
  medications: Medication[];
  weights: WeightLog[];
  visits: VetVisit[];
}) {
  const [tab, setTab] = useState<Tab>("vaccinations");

  const count: Record<Tab, number> = {
    vaccinations: vaccinations.length,
    medications: medications.length,
    weight: weights.length,
    visits: visits.length,
  };

  return (
    <section>
      <div className="mb-4 flex flex-wrap gap-1 border-b border-[var(--border)]">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`-mb-px border-b-2 px-3 py-2 text-sm transition ${
              tab === t.key
                ? "border-brand-600 font-medium text-brand-600"
                : "muted border-transparent hover:text-brand-600"
            }`}
          >
            {t.label}
            {count[t.key] > 0 && <span className="muted ml-1.5 text-xs">{count[t.key]}</span>}
          </button>
        ))}
      </div>

      {tab === "vaccinations" && (
        <>
          <RecordForm action={addVaccination} submitLabel="Add vaccination" className="card mb-4 grid gap-3 p-4 sm:grid-cols-2">
            <input type="hidden" name="pet_id" value={petId} />
            <input name="name" required placeholder="Vaccine (e.g. Rabies)" className={field} />
            <input name="vet_clinic" placeholder="Clinic" className={field} />
            <label className="muted text-xs">
              Given
              <input name="administered_on" type="date" required defaultValue={today()} className={field} />
            </label>
            <label className="muted text-xs">
              Next due
              <input name="due_on" type="date" className={field} />
            </label>
          </RecordForm>

          <RecordList
            empty="No vaccinations recorded yet."
            rows={vaccinations.map((v) => {
              const days = v.due_on ? daysUntil(v.due_on) : null;
              return {
                id: v.id,
                title: v.name,
                subtitle: [formatDate(v.administered_on), v.vet_clinic].filter(Boolean).join(" · "),
                right: v.due_on ? (
                  <span className={days! < 0 ? "text-red-600" : days! <= 30 ? "text-amber-600" : "muted"}>
                    due {formatDate(v.due_on)}
                  </span>
                ) : null,
              };
            })}
          />
        </>
      )}

      {tab === "medications" && (
        <>
          <RecordForm action={addMedication} submitLabel="Add medication" className="card mb-4 grid gap-3 p-4 sm:grid-cols-2">
            <input type="hidden" name="pet_id" value={petId} />
            <input name="name" required placeholder="Medication" className={field} />
            <input name="dosage" placeholder="Dosage (e.g. 5 mg)" className={field} />
            <input name="frequency" placeholder="Frequency (e.g. twice daily)" className={field} />
            <div />
            <label className="muted text-xs">
              Start
              <input name="start_date" type="date" defaultValue={today()} className={field} />
            </label>
            <label className="muted text-xs">
              End (optional)
              <input name="end_date" type="date" className={field} />
            </label>
          </RecordForm>

          <RecordList
            empty="No medications recorded yet."
            rows={medications.map((m) => {
              const ended = m.end_date && daysUntil(m.end_date) < 0;
              return {
                id: m.id,
                title: m.name,
                subtitle: [m.dosage, m.frequency, `from ${formatDate(m.start_date)}`]
                  .filter(Boolean)
                  .join(" · "),
                right: (
                  <span className={ended ? "muted" : "text-brand-600"}>
                    {ended ? "finished" : "active"}
                  </span>
                ),
              };
            })}
          />
        </>
      )}

      {tab === "weight" && (
        <>
          <RecordForm action={addWeight} submitLabel="Log weight" className="card mb-4 grid gap-3 p-4 sm:grid-cols-2">
            <input type="hidden" name="pet_id" value={petId} />
            <label className="muted text-xs">
              Weight (kg)
              <input name="weight_kg" type="number" step="0.01" min="0.01" max="999.99" required className={field} />
            </label>
            <label className="muted text-xs">
              Date
              <input name="recorded_on" type="date" defaultValue={today()} className={field} />
            </label>
          </RecordForm>

          <RecordList
            empty="No weight readings yet."
            rows={weights.map((w) => ({
              id: w.id,
              title: `${w.weight_kg} kg`,
              subtitle: formatDate(w.recorded_on),
              right: null,
            }))}
          />
        </>
      )}

      {tab === "visits" && (
        <>
          <RecordForm action={addVetVisit} submitLabel="Add visit" className="card mb-4 grid gap-3 p-4 sm:grid-cols-2">
            <input type="hidden" name="pet_id" value={petId} />
            <input name="clinic" placeholder="Clinic" className={field} />
            <label className="muted text-xs">
              Date
              <input name="visited_on" type="date" defaultValue={today()} className={field} />
            </label>
            <input name="reason" placeholder="Reason for visit" className={field} />
            <input name="diagnosis" placeholder="Diagnosis" className={field} />
            <input name="cost" type="number" step="0.01" min="0" placeholder="Cost (USD)" className={field} />
            <div />
            <textarea name="notes" rows={2} placeholder="Notes" className={`${field} sm:col-span-2`} />
          </RecordForm>

          <RecordList
            empty="No vet visits recorded yet."
            rows={visits.map((v) => ({
              id: v.id,
              title: v.reason || v.diagnosis || "Visit",
              subtitle: [formatDate(v.visited_on), v.clinic].filter(Boolean).join(" · "),
              right: <span className="muted">{formatMoney(v.cost_cents)}</span>,
            }))}
          />
        </>
      )}
    </section>
  );
}

function RecordList({
  rows,
  empty,
}: {
  rows: { id: string; title: string; subtitle: string; right: React.ReactNode }[];
  empty: string;
}) {
  if (rows.length === 0) {
    return <p className="card muted px-4 py-8 text-center text-sm">{empty}</p>;
  }
  return (
    <ul className="card divide-y divide-[var(--border)]">
      {rows.map((r) => (
        <li key={r.id} className="flex items-center gap-3 px-4 py-3">
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium">{r.title}</p>
            <p className="muted truncate text-xs">{r.subtitle}</p>
          </div>
          {r.right && <span className="shrink-0 text-xs">{r.right}</span>}
        </li>
      ))}
    </ul>
  );
}
