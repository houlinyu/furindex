"use client";

import { useActionState, useEffect, useState } from "react";
import Link from "next/link";
import {
  completeReminder,
  deactivateReminder,
  snoozeReminder,
  type ReminderState,
} from "@/app/reminder-actions";
import {
  BUCKET_LABEL,
  describeDue,
  groupReminders,
  todayISO,
  type ReminderBucket,
} from "@/lib/reminders";
import { formatDate } from "@/lib/format";
import {
  CARE_INTERVAL_LABEL,
  CARE_KIND_EMOJI,
  type CareReminder,
} from "@/lib/types";

const SNOOZE_DAYS = 7;

/**
 * A button that submits one server action, with its own pending state.
 *
 * One `<form>` per action rather than one form per row: `useActionState` binds a
 * single action, and sharing one across a whole list would grey out every row's
 * button whenever any one of them was saving.
 */
function ActionButton({
  action,
  reminderId,
  today,
  extra,
  className,
  pendingLabel,
  ariaLabel,
  onResult,
  children,
}: {
  action: (prev: ReminderState, fd: FormData) => Promise<ReminderState>;
  reminderId: string;
  today: string;
  extra?: Record<string, string>;
  className: string;
  pendingLabel: string;
  /** Distinguishes otherwise identical buttons in a list, e.g. "Done" x6. */
  ariaLabel: string;
  onResult: (state: ReminderState) => void;
  children: React.ReactNode;
}) {
  const [state, formAction, pending] = useActionState<ReminderState, FormData>(action, {});

  // Reported upward rather than rendered here, so a row shows one error line in
  // one place instead of shifting layout under whichever button was pressed.
  useEffect(() => {
    if (state.error || state.ok) onResult(state);
    // onResult is recreated every render by the parent; depending on it would
    // re-fire this on every render and re-report a stale error forever.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  return (
    <form action={formAction} className="contents">
      <input type="hidden" name="reminder_id" value={reminderId} />
      {/* The browser's calendar date, not the server's — see resolveToday(). */}
      <input type="hidden" name="today" value={today} />
      {Object.entries(extra ?? {}).map(([k, v]) => (
        <input key={k} type="hidden" name={k} value={v} />
      ))}
      <button type="submit" disabled={pending} aria-label={ariaLabel} className={className}>
        {pending ? pendingLabel : children}
      </button>
    </form>
  );
}

const DOT: Record<ReminderBucket, string> = {
  overdue: "bg-red-500",
  soon: "bg-amber-500",
  later: "bg-brand-500",
};

function ReminderRow({
  reminder,
  bucket,
  today,
  petName,
}: {
  reminder: CareReminder;
  bucket: ReminderBucket;
  today: string;
  /** Set on the dashboard, where a row has no pet to be read in the context of. */
  petName?: string | null;
}) {
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);

  const repeats = reminder.repeat_interval !== "none";
  // Possessive form only where the pet isn't already implied by the page.
  const subject = petName ? `${petName}'s ${reminder.title}` : reminder.title;

  return (
    <li className="flex flex-wrap items-center gap-x-3 gap-y-2 px-4 py-3">
      <span
        aria-hidden
        className={`h-2 w-2 shrink-0 rounded-full ${DOT[bucket]}`}
      />
      <span aria-hidden className="shrink-0 text-lg leading-none">
        {CARE_KIND_EMOJI[reminder.kind]}
      </span>

      <div className="min-w-0 flex-1 basis-48">
        <p className="truncate text-sm font-medium">{subject}</p>
        <p className="muted text-xs">
          {/* Lapsed admin, stated plainly. Nothing here says or implies anything
              about how the animal is — a missed tablet is a chore that slipped. */}
          <span className={bucket === "overdue" ? "text-red-600 dark:text-red-400" : undefined}>
            {describeDue(reminder.due_on, today)}
          </span>
          {" · "}
          {formatDate(reminder.due_on)}
          {repeats && ` · ${CARE_INTERVAL_LABEL[reminder.repeat_interval].toLowerCase()}`}
        </p>
      </div>

      <div className="flex shrink-0 items-center gap-2">
        <ActionButton
          action={completeReminder}
          reminderId={reminder.id}
          today={today}
          className="inline-flex min-h-11 items-center rounded-lg bg-brand-600 px-4 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-60"
          pendingLabel="Saving…"
          ariaLabel={`Mark ${subject} done`}
          onResult={(s) => setError(s.error ?? null)}
        >
          {/* One tap is the whole point: an owner standing in the kitchen with
              the tablet in their hand will not fill in a form about it. */}
          Done
        </ActionButton>

        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          aria-controls={`reminder-more-${reminder.id}`}
          aria-label={open ? `Close options for ${subject}` : `More options for ${subject}`}
          className="muted inline-flex min-h-11 items-center rounded-lg border border-[var(--border)] px-3 text-xs hover:border-brand-500 hover:text-[var(--brand-text)]"
        >
          {open ? "Close" : "More"}
        </button>
      </div>

      {open && (
        <div
          id={`reminder-more-${reminder.id}`}
          className="flex w-full flex-wrap items-center gap-2 border-t border-[var(--border)] pt-3"
        >
          <ActionButton
            action={snoozeReminder}
            reminderId={reminder.id}
            today={today}
            extra={{ days: String(SNOOZE_DAYS) }}
            className="muted inline-flex min-h-11 items-center rounded-lg border border-[var(--border)] px-3 text-xs hover:border-brand-500 hover:text-[var(--brand-text)] disabled:opacity-60"
            pendingLabel="Snoozing…"
            ariaLabel={`Remind me about ${subject} in a week`}
            onResult={(s) => setError(s.error ?? null)}
          >
            Remind me in a week
          </ActionButton>

          <ActionButton
            action={deactivateReminder}
            reminderId={reminder.id}
            today={today}
            className="muted inline-flex min-h-11 items-center rounded-lg border border-[var(--border)] px-3 text-xs hover:border-red-500 hover:text-red-600 disabled:opacity-60"
            pendingLabel="Stopping…"
            ariaLabel={`Stop reminding me about ${subject}`}
            onResult={(s) => setError(s.error ?? null)}
          >
            Stop reminding me
          </ActionButton>

          {reminder.last_completed_on && (
            <span className="muted text-xs">
              Last done {formatDate(reminder.last_completed_on)}
            </span>
          )}
          {reminder.notes && (
            <p className="muted w-full text-xs whitespace-pre-wrap">{reminder.notes}</p>
          )}
        </div>
      )}

      {error && (
        <p className="w-full text-xs text-red-600 dark:text-red-400" role="alert">
          {error}
        </p>
      )}
    </li>
  );
}

/**
 * The read side of reminders: what is owed, split into the three piles an owner
 * actually acts on, each one tap from being cleared.
 *
 * TONE, throughout: this is admin that has slipped, never a health warning.
 * "Bella's flea treatment was due 3 days ago" — a fact about a calendar, not
 * about the animal. No red alarms beyond a dot, no "at risk", no urgency the
 * situation doesn't have. An app that treats a late worming tablet as an
 * emergency gets its notifications turned off, and then it can't remind anyone
 * of anything.
 */
export default function ReminderList({
  reminders,
  today: serverToday,
  petNames,
  showPetNames = false,
  emptyMessage = "Nothing due. Add a reminder and it'll show up here before it lapses.",
  limit,
}: {
  reminders: CareReminder[];
  /** The server's local date, so the first render matches on both sides. */
  today: string;
  /** pet id → name. Needed only when showPetNames is on. */
  petNames?: Record<string, string>;
  showPetNames?: boolean;
  emptyMessage?: string;
  /** Caps each group. The dashboard wants a glance, not the whole backlog. */
  limit?: number;
}) {
  // The server and the browser disagree about the date for a few hours a day,
  // and the browser is the one that knows the owner's zone. Starting from the
  // server's answer keeps hydration identical; correcting after mount keeps
  // "due today" honest for anyone not sitting in the server's timezone.
  const [today, setToday] = useState(serverToday);
  useEffect(() => {
    const local = todayISO();
    if (local !== serverToday) setToday(local);
  }, [serverToday]);

  const groups = groupReminders(reminders, today);
  const order: ReminderBucket[] = ["overdue", "soon", "later"];
  const total = groups.overdue.length + groups.soon.length + groups.later.length;

  if (total === 0) {
    return <div className="card muted px-4 py-6 text-center text-sm">{emptyMessage}</div>;
  }

  return (
    <div className="space-y-5">
      {order.map((bucket) => {
        const all = groups[bucket];
        if (all.length === 0) return null;
        const rows = limit ? all.slice(0, limit) : all;
        const hidden = all.length - rows.length;

        return (
          <section key={bucket}>
            <h3 className="muted mb-2 text-xs font-medium uppercase tracking-wide">
              {BUCKET_LABEL[bucket]}
              <span className="ml-2 font-normal">{all.length}</span>
            </h3>
            <ul className="card divide-y divide-[var(--border)]">
              {rows.map((r) => (
                <ReminderRow
                  key={r.id}
                  reminder={r}
                  bucket={bucket}
                  today={today}
                  petName={showPetNames ? (petNames?.[r.pet_id] ?? null) : null}
                />
              ))}
            </ul>
            {hidden > 0 && (
              <p className="muted mt-2 text-xs">
                {hidden} more {hidden === 1 ? "reminder" : "reminders"} in this group —
                open the pet to see {hidden === 1 ? "it" : "them"}.
              </p>
            )}
          </section>
        );
      })}

      {showPetNames && (
        <p className="muted text-xs">
          Reminders live on each pet.{" "}
          <Link href="/pets" className="underline underline-offset-4">
            Open a pet
          </Link>{" "}
          to add or edit one.
        </p>
      )}
    </div>
  );
}
