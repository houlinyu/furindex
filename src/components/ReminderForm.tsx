"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { createReminder, type ReminderState } from "@/app/reminder-actions";
import { todayISO } from "@/lib/reminders";
import {
  CARE_INTERVALS,
  CARE_INTERVAL_LABEL,
  CARE_KINDS,
  CARE_KIND_EMOJI,
  CARE_KIND_LABEL,
  REMINDER_PRESETS,
  type CareInterval,
  type CareKind,
  type ReminderPreset,
} from "@/lib/types";

const field =
  "w-full rounded-lg border border-[var(--border)] bg-transparent px-3 py-2 text-sm outline-none focus:border-brand-500";
const labelText = "mb-1 block text-xs font-medium";

/**
 * Adds a reminder.
 *
 * The presets across the top are the whole design of this form. A blank form is
 * a wall: an owner who has never written this down doesn't know what the app
 * wants, and the item they are least likely to invent unprompted — the monthly
 * flea/worm/heartworm preventative — is precisely the one that gets forgotten,
 * because it recurs on a short cycle with no appointment attached to it. Tapping
 * a preset fills the name, the kind and the rhythm, and leaves the date, which
 * is the only part the app genuinely cannot guess.
 */
export default function ReminderForm({ petId }: { petId: string }) {
  const [state, formAction, pending] = useActionState<ReminderState, FormData>(
    createReminder,
    {}
  );
  const formRef = useRef<HTMLFormElement>(null);

  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [kind, setKind] = useState<CareKind>("preventative");
  const [repeat, setRepeat] = useState<CareInterval>("monthly");
  const [dueOn, setDueOn] = useState("");

  // Filled after mount, never during the server render: seeding a date from the
  // server's clock would show tomorrow's date to an owner whose evening is the
  // server's next morning.
  const [today, setToday] = useState("");
  useEffect(() => setToday(todayISO()), []);

  useEffect(() => {
    if (!state.ok) return;
    formRef.current?.reset();
    setTitle("");
    setDueOn("");
    setOpen(false);
  }, [state]);

  function applyPreset(preset: ReminderPreset) {
    setTitle(preset.title);
    setKind(preset.kind);
    setRepeat(preset.repeat_interval);
    // The date is left alone on purpose. Guessing it would be a made-up medical
    // date, and a wrong one is worse than an empty one — the owner defaults it
    // to today by leaving it blank, which is right far more often than not.
    setOpen(true);
  }

  if (!open) {
    return (
      <div className="card p-4">
        <p className="text-sm font-medium">Add a reminder</p>
        <p className="muted mt-1 text-xs">
          Pick a common one, or start from scratch. Everything can be edited after.
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          {REMINDER_PRESETS.map((preset) => (
            <button
              key={preset.id}
              type="button"
              onClick={() => applyPreset(preset)}
              title={preset.hint}
              className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-[var(--border)] px-3 text-sm hover:border-brand-500 hover:text-[var(--brand-text)]"
            >
              <span aria-hidden>{CARE_KIND_EMOJI[preset.kind]}</span>
              {preset.label}
            </button>
          ))}
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="muted inline-flex min-h-11 items-center rounded-lg px-3 text-sm underline underline-offset-4 hover:text-[var(--brand-text)]"
          >
            Something else
          </button>
        </div>
      </div>
    );
  }

  return (
    <form ref={formRef} action={formAction} className="card p-4">
      <input type="hidden" name="pet_id" value={petId} />
      {/* The browser's calendar date. The server validates it and falls back to
          its own if it's more than a day out. */}
      {today && <input type="hidden" name="today" value={today} />}

      <fieldset disabled={pending} className="min-w-0">
        <legend className="text-sm font-medium">Add a reminder</legend>

        <div className="mt-3 flex flex-wrap gap-2">
          {REMINDER_PRESETS.map((preset) => (
            <button
              key={preset.id}
              type="button"
              onClick={() => applyPreset(preset)}
              title={preset.hint}
              className={`inline-flex min-h-11 items-center gap-2 rounded-lg border px-3 text-xs ${
                title === preset.title
                  ? "border-brand-500 text-[var(--brand-text)]"
                  : "border-[var(--border)] hover:border-brand-500"
              }`}
            >
              <span aria-hidden>{CARE_KIND_EMOJI[preset.kind]}</span>
              {preset.label}
            </button>
          ))}
        </div>

        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <label htmlFor="reminder-title" className={labelText}>
              What needs doing
            </label>
            <input
              id="reminder-title"
              name="title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              maxLength={120}
              required
              placeholder="Flea & worm treatment"
              className={field}
            />
          </div>

          <div>
            <label htmlFor="reminder-kind" className={labelText}>
              Type
            </label>
            <select
              id="reminder-kind"
              name="kind"
              value={kind}
              onChange={(e) => setKind(e.target.value as CareKind)}
              className={field}
            >
              {CARE_KINDS.map((k) => (
                <option key={k} value={k}>
                  {CARE_KIND_LABEL[k]}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label htmlFor="reminder-interval" className={labelText}>
              How often
            </label>
            <select
              id="reminder-interval"
              name="repeat_interval"
              value={repeat}
              onChange={(e) => setRepeat(e.target.value as CareInterval)}
              className={field}
            >
              {CARE_INTERVALS.map((i) => (
                <option key={i} value={i}>
                  {CARE_INTERVAL_LABEL[i]}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label htmlFor="reminder-due" className={labelText}>
              Next due
            </label>
            <input
              id="reminder-due"
              name="due_on"
              type="date"
              value={dueOn}
              onChange={(e) => setDueOn(e.target.value)}
              className={field}
              aria-describedby="reminder-due-hint"
            />
            <p id="reminder-due-hint" className="muted mt-1 text-xs">
              Leave blank for today. After that it moves on each time you tick it
              off.
            </p>
          </div>

          <div>
            <label htmlFor="reminder-notes" className={labelText}>
              Notes <span className="muted font-normal">(optional)</span>
            </label>
            <input
              id="reminder-notes"
              name="notes"
              maxLength={500}
              placeholder="Brand, dose, which vet…"
              className={field}
            />
          </div>
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-3">
          <button
            type="submit"
            disabled={pending}
            className="inline-flex min-h-11 shrink-0 items-center rounded-lg bg-brand-600 px-4 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-60"
          >
            {pending ? "Saving…" : "Add reminder"}
          </button>
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="muted inline-flex min-h-11 items-center text-xs underline underline-offset-4"
          >
            Cancel
          </button>
        </div>
      </fieldset>

      {state.error && (
        <p className="mt-3 text-sm text-red-600 dark:text-red-400" role="alert">
          {state.error}
        </p>
      )}
    </form>
  );
}
