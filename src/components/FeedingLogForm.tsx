"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { logFeeding, type NutritionState } from "@/app/nutrition-actions";
import { FOOD_UNITS, FOOD_UNIT_LABEL, type FeedingPlan } from "@/lib/types";

const field =
  "w-full rounded-lg border border-[var(--border)] bg-transparent px-3 py-2 text-sm outline-none focus:border-brand-500";
const submit =
  "inline-flex min-h-11 items-center shrink-0 rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-60";
const labelText = "mb-1 block text-xs font-medium";

/** `new Date()` → the value a datetime-local input wants, in the viewer's zone. */
function localInputValue(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(
    d.getHours()
  )}:${pad(d.getMinutes())}`;
}

/**
 * Two taps to log a meal, because an owner feeding twice a day will not fill in
 * a form twice a day. The amount and unit default to whatever the current plan
 * says, so the common case is "the usual" and the button.
 */
export default function FeedingLogForm({
  petId,
  plan,
}: {
  petId: string;
  plan: FeedingPlan | null;
}) {
  const [state, formAction, pending] = useActionState<NutritionState, FormData>(logFeeding, {});
  const formRef = useRef<HTMLFormElement>(null);
  const [detail, setDetail] = useState(false);
  const [skipped, setSkipped] = useState(false);
  // Empty until the owner opens the detail panel: seeding it from the clock
  // during the server render would disagree with the browser's clock and zone.
  const [when, setWhen] = useState("");

  useEffect(() => {
    if (!state.ok) return;
    formRef.current?.reset();
    setSkipped(false);
    setWhen("");
    setDetail(false);
  }, [state]);

  function openDetail() {
    setWhen(localInputValue(new Date()));
    setDetail(true);
  }

  // A datetime-local value read on the server would be resolved in the server's
  // timezone, so the browser converts it to an absolute instant here instead.
  const fedAtIso = (() => {
    if (!when) return "";
    const d = new Date(when);
    return Number.isNaN(d.getTime()) ? "" : d.toISOString();
  })();

  return (
    <form ref={formRef} action={formAction} className="card p-4">
      <input type="hidden" name="pet_id" value={petId} />
      {fedAtIso && <input type="hidden" name="fed_at" value={fedAtIso} />}

      <div className="flex flex-wrap items-end gap-3">
        <div className="w-28">
          <label htmlFor="log-amount" className={labelText}>
            Amount
          </label>
          <input
            id="log-amount"
            name="amount"
            type="number"
            step="0.01"
            min="0.01"
            disabled={skipped}
            defaultValue={plan?.amount_per_meal ?? ""}
            placeholder="—"
            className={`${field} disabled:opacity-40`}
          />
        </div>
        <div className="w-28">
          <label htmlFor="log-unit" className={labelText}>
            Unit
          </label>
          <select
            id="log-unit"
            name="amount_unit"
            disabled={skipped}
            defaultValue={plan?.amount_unit ?? "g"}
            className={`${field} disabled:opacity-40`}
          >
            {FOOD_UNITS.map((u) => (
              <option key={u} value={u}>
                {FOOD_UNIT_LABEL[u]}
              </option>
            ))}
          </select>
        </div>

        <button type="submit" disabled={pending} className={submit}>
          {pending ? "Saving…" : skipped ? "Log skipped meal" : "Log meal"}
        </button>

        {!detail && (
          <button
            type="button"
            onClick={openDetail}
            className="inline-flex min-h-11 items-center muted shrink-0 pb-2 text-xs underline underline-offset-4 hover:text-[var(--brand-text)]"
          >
            Add time, who fed, notes
          </button>
        )}
      </div>

      {detail && (
        <div className="mt-3 grid gap-3 border-t border-[var(--border)] pt-3 sm:grid-cols-2">
          <div>
            <label htmlFor="log-fed-at" className={labelText}>
              When
            </label>
            <input
              id="log-fed-at"
              type="datetime-local"
              value={when}
              onChange={(e) => setWhen(e.target.value)}
              className={field}
            />
          </div>
          <div>
            <label htmlFor="log-fed-by" className={labelText}>
              Fed by
            </label>
            <input
              id="log-fed-by"
              name="fed_by"
              maxLength={80}
              // Free text: there is no caretaker system, and "the neighbour" is a
              // perfectly good answer to the only question this field asks.
              placeholder="e.g. Sam, dog walker, kennel"
              className={field}
            />
          </div>
          <div className="sm:col-span-2">
            <label htmlFor="log-notes" className={labelText}>
              Notes
            </label>
            <input
              id="log-notes"
              name="notes"
              placeholder="Left half of it, wolfed it down, added the tablet…"
              className={field}
            />
          </div>
        </div>
      )}

      <div className="mt-3 flex flex-wrap items-center gap-3">
        <label htmlFor="log-skipped" className="flex items-center gap-2 text-xs">
          <input
            id="log-skipped"
            name="skipped"
            type="checkbox"
            checked={skipped}
            onChange={(e) => setSkipped(e.target.checked)}
            className="h-4 w-4 accent-[var(--color-brand-600)]"
          />
          {/* A refused meal is a clinical signal, so it gets a record rather
              than being left as a gap in the log. */}
          Meal was refused or skipped
        </label>
        {detail && (
          <button
            type="button"
            onClick={() => {
              setDetail(false);
              setWhen("");
            }}
            className="inline-flex min-h-11 items-center muted text-xs underline underline-offset-4"
          >
            Hide details
          </button>
        )}
      </div>

      {state.error && (
        <p className="mt-3 text-sm text-red-600 dark:text-red-400" role="alert">
          {state.error}
        </p>
      )}
    </form>
  );
}
