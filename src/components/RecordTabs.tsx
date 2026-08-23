"use client";

import { useActionState, useEffect, useId, useRef, useState } from "react";
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
  "inline-flex min-h-11 items-center rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700";

type Tab = "vaccinations" | "medications" | "weight" | "visits";
const TABS: { key: Tab; label: string }[] = [
  { key: "vaccinations", label: "Vaccinations" },
  { key: "medications", label: "Medications" },
  { key: "weight", label: "Weight" },
  { key: "visits", label: "Vet visits" },
];

const today = () => new Date().toISOString().slice(0, 10);

/**
 * Props that link a field to the form's error message. The server actions only
 * ever return a single form-level `error` (see RecordFormState), so there is no
 * per-field detail to attach — these go on the field the error is most likely
 * about, which is the one that is required.
 */
type ErrorLink = { "aria-invalid"?: true; "aria-describedby"?: string };

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
  /** Called with the props that bind the primary field to the error message. */
  children: (errorLink: ErrorLink) => React.ReactNode;
  className?: string;
}) {
  const [state, formAction, pending] = useActionState<RecordFormState, FormData>(action, {});
  const ref = useRef<HTMLFormElement>(null);
  const errorId = useId();

  // Clear the fields once the row is actually written, so the next entry starts
  // from empty rather than the previous values.
  if (state.ok && ref.current) ref.current.reset();

  const errorLink: ErrorLink = state.error
    ? { "aria-invalid": true, "aria-describedby": errorId }
    : {};

  return (
    <form ref={ref} action={formAction} className={className}>
      {children(errorLink)}
      {state.error && (
        <p
          id={errorId}
          className="text-sm text-red-600 sm:col-span-2 dark:text-red-400"
          role="alert"
        >
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

  // A link that says "Log a weight" has to land on the weight form, not merely
  // near it — scrolling someone to a tab strip and leaving them to find the
  // right tab is the same dead end as having no link at all.
  useEffect(() => {
    let lastHandled = "";
    const open = () => {
      const hash = window.location.hash;
      const m = hash.match(/^#records-(\w+)$/);
      const t = m?.[1] as Tab | undefined;
      if (!t || !TABS.some((x) => x.key === t)) return;
      setTab(t);
      // Do the scroll ourselves. A hash-only Link in the App Router does not
      // reliably scroll, and the anchor may not exist yet at navigation time —
      // so the tab would open correctly two thousand pixels below the fold.
      if (hash !== lastHandled) {
        lastHandled = hash;
        window.requestAnimationFrame(() => {
          document
            .getElementById(`records-${t}`)
            ?.scrollIntoView({ behavior: "smooth", block: "start" });
        });
      }
    };
    open();
    window.addEventListener("hashchange", open);
    // A same-page hash Link does not always emit hashchange in the App Router,
    // and the mount effect has already run by then. A short poll costs nothing
    // and makes the button work on the second press as well as the first.
    const poll = window.setInterval(open, 400);
    return () => {
      window.removeEventListener("hashchange", open);
      window.clearInterval(poll);
    };
  }, []);
  const tabRefs = useRef<Record<string, HTMLButtonElement | null>>({});
  const baseId = useId();
  const tabId = (t: Tab) => `${baseId}-tab-${t}`;
  const panelId = (t: Tab) => `${baseId}-panel-${t}`;

  const count: Record<Tab, number> = {
    vaccinations: vaccinations.length,
    medications: medications.length,
    weight: weights.length,
    visits: visits.length,
  };

  /** Arrow keys move between tabs, as the tablist pattern requires — without
   *  this the roving tabindex below would strand the other three tabs. */
  function onTabKeyDown(e: React.KeyboardEvent) {
    const i = TABS.findIndex((t) => t.key === tab);
    let next = -1;
    if (e.key === "ArrowRight") next = (i + 1) % TABS.length;
    else if (e.key === "ArrowLeft") next = (i - 1 + TABS.length) % TABS.length;
    else if (e.key === "Home") next = 0;
    else if (e.key === "End") next = TABS.length - 1;
    if (next < 0) return;
    e.preventDefault();
    const key = TABS[next].key;
    setTab(key);
    tabRefs.current[key]?.focus();
  }

  return (
    <section>
      {/* One real element per tab. A link to #records-weight must find
          something to scroll to — a hash with no target silently does
          nothing, which is exactly how this shipped broken twice. */}
      {TABS.map((t) => (
        <span key={t.key} id={`records-${t.key}`} className="block scroll-mt-24" />
      ))}

      <div
        role="tablist"
        aria-label="Health records"
        onKeyDown={onTabKeyDown}
        className="mb-4 flex flex-wrap gap-1 border-b border-[var(--border)]"
      >
        {TABS.map((t) => {
          const selected = tab === t.key;
          return (
            <button
              key={t.key}
              type="button"
              role="tab"
              id={tabId(t.key)}
              aria-selected={selected}
              // Only the selected panel is rendered, so pointing at a missing
              // id on the others would be a dangling reference.
              aria-controls={selected ? panelId(t.key) : undefined}
              tabIndex={selected ? 0 : -1}
              ref={(el) => {
                tabRefs.current[t.key] = el;
              }}
              onClick={() => setTab(t.key)}
              className={`-mb-px inline-flex min-h-11 items-center border-b-2 px-3 py-2 text-sm transition ${
                selected
                  ? "border-brand-600 font-medium text-[var(--brand-text)]"
                  : "muted border-transparent hover:text-[var(--brand-text)]"
              }`}
            >
              {t.label}
              {count[t.key] > 0 && <span className="muted ml-1.5 text-xs">{count[t.key]}</span>}
            </button>
          );
        })}
      </div>

      {tab === "vaccinations" && (
        <div role="tabpanel" id={panelId("vaccinations")} aria-labelledby={tabId("vaccinations")}>
          <RecordForm action={addVaccination} submitLabel="Add vaccination" className="card mb-4 grid gap-3 p-4 sm:grid-cols-2">
            {(errorLink) => (
              <>
                <input type="hidden" name="pet_id" value={petId} />
                <label className="muted text-xs">
                  Vaccine
                  <input
                    name="name"
                    required
                    placeholder="e.g. Rabies"
                    className={field}
                    {...errorLink}
                  />
                </label>
                <label className="muted text-xs">
                  Clinic
                  <input name="vet_clinic" placeholder="Clinic" className={field} />
                </label>
                <label className="muted text-xs">
                  Given
                  <input name="administered_on" type="date" required defaultValue={today()} className={field} />
                </label>
                <label className="muted text-xs">
                  Next due
                  <input name="due_on" type="date" className={field} />
                </label>
              </>
            )}
          </RecordForm>

          <RecordList
            empty="Nothing here yet. This is the list a boarding kennel or a new vet asks for, so it is the one worth filling first."
            rows={vaccinations.map((v) => {
              const days = v.due_on ? daysUntil(v.due_on) : null;
              return {
                id: v.id,
                title: v.name,
                subtitle: [formatDate(v.administered_on), v.vet_clinic].filter(Boolean).join(" · "),
                right: v.due_on ? (
                  <span
                    className={
                      days! < 0
                        ? "text-red-600 dark:text-red-400"
                        : days! <= 30
                          ? "text-amber-700 dark:text-amber-400"
                          : "muted"
                    }
                  >
                    due {formatDate(v.due_on)}
                  </span>
                ) : null,
              };
            })}
          />
        </div>
      )}

      {tab === "medications" && (
        <div role="tabpanel" id={panelId("medications")} aria-labelledby={tabId("medications")}>
          <RecordForm action={addMedication} submitLabel="Add medication" className="card mb-4 grid gap-3 p-4 sm:grid-cols-2">
            {(errorLink) => (
              <>
                <input type="hidden" name="pet_id" value={petId} />
                <label className="muted text-xs">
                  Medication
                  <input name="name" required placeholder="Medication" className={field} {...errorLink} />
                </label>
                <label className="muted text-xs">
                  Dosage
                  <input name="dosage" placeholder="e.g. 5 mg" className={field} />
                </label>
                <label className="muted text-xs">
                  Frequency
                  <input name="frequency" placeholder="e.g. twice daily" className={field} />
                </label>
                <div />
                <label className="muted text-xs">
                  Start
                  <input name="start_date" type="date" defaultValue={today()} className={field} />
                </label>
                <label className="muted text-xs">
                  End (optional)
                  <input name="end_date" type="date" className={field} />
                </label>
              </>
            )}
          </RecordForm>

          <RecordList
            empty="Nothing here yet. Finished courses are worth adding too — what they have taken before is the part nobody remembers a year later."
            rows={medications.map((m) => {
              const ended = m.end_date && daysUntil(m.end_date) < 0;
              return {
                id: m.id,
                title: m.name,
                subtitle: [m.dosage, m.frequency, `from ${formatDate(m.start_date)}`]
                  .filter(Boolean)
                  .join(" · "),
                right: (
                  <span className={ended ? "muted" : "text-[var(--brand-text)]"}>
                    {ended ? "finished" : "active"}
                  </span>
                ),
              };
            })}
          />
        </div>
      )}

      {tab === "weight" && (
        <div role="tabpanel" id={panelId("weight")} aria-labelledby={tabId("weight")}>
          <RecordForm action={addWeight} submitLabel="Log weight" className="card mb-4 grid gap-3 p-4 sm:grid-cols-2">
            {(errorLink) => (
              <>
                <input type="hidden" name="pet_id" value={petId} />
                <label className="muted text-xs">
                  Weight (kg)
                  <input
                    name="weight_kg"
                    type="number"
                    step="0.01"
                    min="0.01"
                    max="999.99"
                    required
                    className={field}
                    {...errorLink}
                  />
                </label>
                <label className="muted text-xs">
                  Date
                  <input name="recorded_on" type="date" defaultValue={today()} className={field} />
                </label>
              </>
            )}
          </RecordForm>

          <RecordList
            empty="Nothing here yet. Two readings a few weeks apart is where the trend line starts, and weight tends to move before anything else does."
            rows={weights.map((w) => ({
              id: w.id,
              title: `${w.weight_kg} kg`,
              subtitle: formatDate(w.recorded_on),
              right: null,
            }))}
          />
        </div>
      )}

      {tab === "visits" && (
        <div role="tabpanel" id={panelId("visits")} aria-labelledby={tabId("visits")}>
          <RecordForm action={addVetVisit} submitLabel="Add visit" className="card mb-4 grid gap-3 p-4 sm:grid-cols-2">
            {(errorLink) => (
              <>
                <input type="hidden" name="pet_id" value={petId} />
                <label className="muted text-xs">
                  Clinic
                  <input name="clinic" placeholder="Clinic" className={field} {...errorLink} />
                </label>
                <label className="muted text-xs">
                  Date
                  <input name="visited_on" type="date" defaultValue={today()} className={field} />
                </label>
                <label className="muted text-xs">
                  Reason for visit
                  <input name="reason" placeholder="Reason for visit" className={field} />
                </label>
                <label className="muted text-xs">
                  Diagnosis
                  <input name="diagnosis" placeholder="Diagnosis" className={field} />
                </label>
                <label className="muted text-xs">
                  Cost (USD)
                  <input name="cost" type="number" step="0.01" min="0" placeholder="Cost (USD)" className={field} />
                </label>
                <div />
                <label className="muted text-xs sm:col-span-2">
                  Notes
                  <textarea name="notes" rows={2} placeholder="Notes" className={field} />
                </label>
              </>
            )}
          </RecordForm>

          <RecordList
            empty="Nothing here yet. A date and a line about what it was for is enough to answer when this last came up."
            rows={visits.map((v) => ({
              id: v.id,
              title: v.reason || v.diagnosis || "Visit",
              subtitle: [formatDate(v.visited_on), v.clinic].filter(Boolean).join(" · "),
              right: <span className="muted">{formatMoney(v.cost_cents)}</span>,
            }))}
          />
        </div>
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
