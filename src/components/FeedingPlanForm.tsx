"use client";

import { useActionState, useEffect, useRef } from "react";
import { setFeedingPlan, type NutritionState } from "@/app/nutrition-actions";
import {
  FOOD_BRANDS,
  FOOD_TYPES,
  FOOD_TYPE_LABEL,
  FOOD_UNITS,
  FOOD_UNIT_LABEL,
  type FeedingPlan,
} from "@/lib/types";

const field =
  "w-full rounded-lg border border-[var(--border)] bg-transparent px-3 py-2 text-sm outline-none focus:border-brand-500";
const submit =
  "inline-flex min-h-11 items-center rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-60";
const labelText = "mb-1 block text-xs font-medium";

/**
 * Setting a plan while one is already current supersedes it. The copy says so
 * out loud, because "save" reading as "overwrite my diet history" is the one
 * misunderstanding this form can cause.
 */
export default function FeedingPlanForm({
  petId,
  current,
  onSaved,
  onCancel,
}: {
  petId: string;
  current: FeedingPlan | null;
  onSaved?: () => void;
  onCancel?: () => void;
}) {
  const [state, formAction, pending] = useActionState<NutritionState, FormData>(
    setFeedingPlan,
    {}
  );
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state.ok) {
      formRef.current?.reset();
      onSaved?.();
    }
    // onSaved identity changes every render in the parent; depending on it would
    // re-fire the reset on every keystroke.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  const today = new Date().toISOString().slice(0, 10);
  const id = (name: string) => `plan-${name}`;

  return (
    <form ref={formRef} action={formAction} className="card grid gap-3 p-4 sm:grid-cols-2">
      <input type="hidden" name="pet_id" value={petId} />

      <div className="sm:col-span-2">
        <label htmlFor={id("food_brand")} className={labelText}>
          Brand
        </label>
        <input
          id={id("food_brand")}
          name="food_brand"
          list="food-brands"
          // Free text on purpose: the datalist is a shortcut for the common ones,
          // not a closed list. Plenty of pets eat something nobody has heard of.
          placeholder="Start typing, or write anything"
          defaultValue={current?.food_brand ?? ""}
          className={field}
        />
        <datalist id="food-brands">
          {FOOD_BRANDS.map((b) => (
            <option key={b} value={b} />
          ))}
        </datalist>
      </div>

      <div>
        <label htmlFor={id("food_product")} className={labelText}>
          Product
        </label>
        <input
          id={id("food_product")}
          name="food_product"
          placeholder="e.g. Adult Sensitive Skin"
          defaultValue={current?.food_product ?? ""}
          className={field}
        />
      </div>

      <div>
        <label htmlFor={id("food_type")} className={labelText}>
          Food type
        </label>
        <select
          id={id("food_type")}
          name="food_type"
          defaultValue={current?.food_type ?? "dry"}
          className={field}
        >
          {FOOD_TYPES.map((t) => (
            <option key={t} value={t}>
              {FOOD_TYPE_LABEL[t]}
            </option>
          ))}
        </select>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label htmlFor={id("amount_per_meal")} className={labelText}>
            Amount per meal
          </label>
          <input
            id={id("amount_per_meal")}
            name="amount_per_meal"
            type="number"
            step="0.01"
            min="0.01"
            placeholder="e.g. 120"
            defaultValue={current?.amount_per_meal ?? ""}
            className={field}
          />
        </div>
        <div>
          <label htmlFor={id("amount_unit")} className={labelText}>
            Unit
          </label>
          <select
            id={id("amount_unit")}
            name="amount_unit"
            defaultValue={current?.amount_unit ?? "g"}
            className={field}
          >
            {FOOD_UNITS.map((u) => (
              <option key={u} value={u}>
                {FOOD_UNIT_LABEL[u]}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label htmlFor={id("meals_per_day")} className={labelText}>
            Meals per day
          </label>
          <select
            id={id("meals_per_day")}
            name="meals_per_day"
            defaultValue={String(current?.meals_per_day ?? 2)}
            className={field}
          >
            {[1, 2, 3, 4, 5, 6].map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor={id("calories_per_day")} className={labelText}>
            kcal / day
          </label>
          <input
            id={id("calories_per_day")}
            name="calories_per_day"
            type="number"
            step="1"
            min="1"
            placeholder="If you know it"
            defaultValue={current?.calories_per_day ?? ""}
            className={field}
          />
        </div>
      </div>

      <div>
        <label htmlFor={id("started_on")} className={labelText}>
          Started
        </label>
        <input
          id={id("started_on")}
          name="started_on"
          type="date"
          defaultValue={today}
          className={field}
        />
      </div>

      <div>
        <label htmlFor={id("ended_on")} className={labelText}>
          Ended
        </label>
        <input id={id("ended_on")} name="ended_on" type="date" className={field} />
        <p className="muted mt-1 text-xs">
          Leave blank unless you&apos;re filling in a food they no longer eat.
        </p>
      </div>

      <div className="sm:col-span-2">
        <label htmlFor={id("notes")} className={labelText}>
          Notes
        </label>
        <textarea
          id={id("notes")}
          name="notes"
          rows={2}
          placeholder="Toppers, supplements, why the vet chose this food…"
          className={field}
        />
      </div>

      {current && (
        <p className="muted text-xs sm:col-span-2">
          Saving this keeps {current.food_brand || current.food_product || "the current food"} in
          the diet history and marks it ended today.
        </p>
      )}

      {state.error && (
        <p className="text-sm text-red-600 sm:col-span-2 dark:text-red-400" role="alert">
          {state.error}
        </p>
      )}

      <div className="flex items-center gap-3 sm:col-span-2">
        <button type="submit" disabled={pending} className={submit}>
          {pending ? "Saving…" : current ? "Save new food" : "Save feeding plan"}
        </button>
        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            className="inline-flex min-h-11 items-center muted text-xs underline underline-offset-4"
          >
            Cancel
          </button>
        )}
      </div>
    </form>
  );
}
