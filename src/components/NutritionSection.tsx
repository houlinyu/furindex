"use client";

import { useActionState, useEffect, useState } from "react";
import FeedingLogForm from "@/components/FeedingLogForm";
import FeedingPlanForm from "@/components/FeedingPlanForm";
import { endFeedingPlan, type NutritionState } from "@/app/nutrition-actions";
import { formatDate, formatDateTime, localDayKey } from "@/lib/format";
import {
  FOOD_TYPE_EMOJI,
  FOOD_TYPE_LABEL,
  FOOD_UNIT_LABEL,
  type FeedingLog,
  type FeedingPlan,
} from "@/lib/types";

/** Enough to see yesterday and today at a glance without a scroll trap. */
const RECENT = 8;

function planTitle(p: FeedingPlan): string {
  return [p.food_brand, p.food_product].filter(Boolean).join(" · ") || "Unnamed food";
}

function servingLine(p: FeedingPlan): string {
  const per =
    p.amount_per_meal != null
      ? `${p.amount_per_meal} ${FOOD_UNIT_LABEL[p.amount_unit]}`
      : null;
  const meals = `${p.meals_per_day} ${p.meals_per_day === 1 ? "meal" : "meals"}/day`;
  return [per && `${per} per meal`, meals, p.calories_per_day && `${p.calories_per_day} kcal/day`]
    .filter(Boolean)
    .join(" · ");
}

export default function NutritionSection({
  petId,
  plans,
  logs,
}: {
  petId: string;
  plans: FeedingPlan[];
  logs: FeedingLog[];
}) {
  // Two rows could briefly both be current if a supersede half-failed; the most
  // recently started one is the truthful answer either way.
  const current =
    [...plans]
      .filter((p) => p.is_current)
      .sort((a, b) => b.started_on.localeCompare(a.started_on))[0] ?? null;
  const past = plans.filter((p) => p.id !== current?.id);

  const [changing, setChanging] = useState(false);
  const [showAllLogs, setShowAllLogs] = useState(false);

  // Which day it is depends on the viewer's timezone, and the server doesn't
  // know it. Deferring to the client keeps the count honest instead of
  // hydrating a number computed in the wrong zone.
  const [todayKey, setTodayKey] = useState<string | null>(null);
  useEffect(() => setTodayKey(localDayKey(new Date().toISOString())), []);

  const fedToday =
    todayKey === null
      ? null
      : logs.filter((l) => !l.skipped && localDayKey(l.fed_at) === todayKey).length;

  const visibleLogs = showAllLogs ? logs : logs.slice(0, RECENT);

  return (
    <div className="space-y-5">
      {/* ------------------------------------------------------ current plan --- */}
      {current ? (
        <div className="card p-4">
          <div className="flex flex-wrap items-start gap-3">
            <span className="text-xl" aria-hidden>
              {FOOD_TYPE_EMOJI[current.food_type]}
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium">{planTitle(current)}</p>
              <p className="muted text-xs">
                {FOOD_TYPE_LABEL[current.food_type]} · {servingLine(current)}
              </p>
              <p className="muted mt-0.5 text-xs">Since {formatDate(current.started_on)}</p>
              {current.notes && (
                <p className="mt-2 whitespace-pre-wrap text-xs">{current.notes}</p>
              )}
            </div>
            <div className="flex shrink-0 flex-col items-end gap-1">
              {fedToday !== null && (
                <span
                  className={`rounded-full border px-2 py-0.5 text-xs ${
                    fedToday >= current.meals_per_day
                      ? "border-brand-300 text-brand-700"
                      : "border-[var(--border)] muted"
                  }`}
                >
                  {fedToday}/{current.meals_per_day} today
                </span>
              )}
              {!changing && (
                <button
                  onClick={() => setChanging(true)}
                  className="muted text-xs underline underline-offset-4 hover:text-brand-600"
                >
                  Change food
                </button>
              )}
              <EndPlanButton petId={petId} plan={current} />
            </div>
          </div>
        </div>
      ) : (
        <p className="card muted px-4 py-6 text-center text-sm">
          No feeding plan yet. Recording what they eat, and how much, is what makes a
          change in appetite mean something later.
        </p>
      )}

      {(changing || !current) && (
        <FeedingPlanForm
          petId={petId}
          current={current}
          onSaved={() => setChanging(false)}
          onCancel={current ? () => setChanging(false) : undefined}
        />
      )}

      {/* ------------------------------------------------------- log a meal --- */}
      <div>
        <h3 className="muted mb-2 text-sm font-medium uppercase tracking-wide">Log a meal</h3>
        <FeedingLogForm petId={petId} plan={current} />
      </div>

      {/* --------------------------------------------------- feeding history --- */}
      <div>
        <h3 className="muted mb-2 text-sm font-medium uppercase tracking-wide">
          Recent feeds
        </h3>
        {logs.length === 0 ? (
          <p className="card muted px-4 py-6 text-center text-sm">
            Nothing logged yet.
          </p>
        ) : (
          <>
            <ul className="card divide-y divide-[var(--border)]">
              {visibleLogs.map((l) => (
                <li key={l.id} className="flex items-center gap-3 px-4 py-3 text-sm">
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium">
                      {l.skipped
                        ? "Skipped"
                        : l.amount != null
                          ? `${l.amount} ${FOOD_UNIT_LABEL[l.amount_unit]}`
                          : "Fed"}
                      {l.fed_by && <span className="muted font-normal"> · {l.fed_by}</span>}
                    </p>
                    {l.notes && <p className="muted truncate text-xs">{l.notes}</p>}
                  </div>
                  {l.skipped && (
                    <span className="shrink-0 rounded-full border border-amber-300 px-2 py-0.5 text-xs text-amber-700">
                      refused
                    </span>
                  )}
                  {/* The server renders this in its own timezone; the browser
                      re-renders it in the viewer's, which is the correct one. */}
                  <span className="muted shrink-0 text-xs" suppressHydrationWarning>
                    {formatDateTime(l.fed_at)}
                  </span>
                </li>
              ))}
            </ul>
            {logs.length > RECENT && (
              <button
                onClick={() => setShowAllLogs((v) => !v)}
                className="muted mt-2 text-xs underline underline-offset-4 hover:text-brand-600"
              >
                {showAllLogs ? "Show recent only" : `Show all ${logs.length} feeds`}
              </button>
            )}
          </>
        )}
      </div>

      {/* ----------------------------------------------------- diet history --- */}
      {past.length > 0 && (
        <div>
          <h3 className="muted mb-2 text-sm font-medium uppercase tracking-wide">
            Diet history
          </h3>
          <ul className="card divide-y divide-[var(--border)]">
            {past.map((p) => (
              <li key={p.id} className="flex items-center gap-3 px-4 py-3 text-sm">
                <span aria-hidden>{FOOD_TYPE_EMOJI[p.food_type]}</span>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">{planTitle(p)}</p>
                  <p className="muted truncate text-xs">
                    {FOOD_TYPE_LABEL[p.food_type]} · {servingLine(p)}
                  </p>
                </div>
                <span className="muted shrink-0 text-xs">
                  {formatDate(p.started_on)} → {p.ended_on ? formatDate(p.ended_on) : "—"}
                </span>
              </li>
            ))}
          </ul>
          <p className="muted mt-2 text-xs">
            Old plans are kept, never deleted — when a food changed is often the answer to
            when a problem started.
          </p>
        </div>
      )}
    </div>
  );
}

/** Ends a diet without starting a replacement. The row survives as history. */
function EndPlanButton({ petId, plan }: { petId: string; plan: FeedingPlan }) {
  const [state, formAction, pending] = useActionState<NutritionState, FormData>(
    endFeedingPlan,
    {}
  );
  const [confirming, setConfirming] = useState(false);

  useEffect(() => {
    if (state.ok) setConfirming(false);
  }, [state]);

  if (!confirming) {
    return (
      <button
        onClick={() => setConfirming(true)}
        className="muted text-xs underline underline-offset-4 hover:text-red-600"
      >
        End this diet
      </button>
    );
  }

  return (
    <form action={formAction} className="flex flex-col items-end gap-1">
      <input type="hidden" name="pet_id" value={petId} />
      <input type="hidden" name="plan_id" value={plan.id} />
      <label htmlFor={`end-${plan.id}`} className="muted text-xs">
        Ended on
      </label>
      <input
        id={`end-${plan.id}`}
        name="ended_on"
        type="date"
        defaultValue={new Date().toISOString().slice(0, 10)}
        min={plan.started_on}
        className="rounded-lg border border-[var(--border)] bg-transparent px-2 py-1 text-xs outline-none focus:border-brand-500"
      />
      <div className="flex items-center gap-2">
        <button
          type="submit"
          disabled={pending}
          className="rounded-lg border border-[var(--border)] px-2 py-1 text-xs hover:border-red-400 hover:text-red-600 disabled:opacity-60"
        >
          {pending ? "Ending…" : "Confirm"}
        </button>
        <button
          type="button"
          onClick={() => setConfirming(false)}
          className="muted text-xs underline underline-offset-4"
        >
          Cancel
        </button>
      </div>
      {state.error && (
        <p className="text-xs text-red-600" role="alert">
          {state.error}
        </p>
      )}
    </form>
  );
}
