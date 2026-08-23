"use client";

import { useActionState, useId } from "react";
import { joinCommunity, type CommunityState } from "@/app/community-actions";
import type { CommunityProfile } from "@/lib/types";

const field =
  "w-full rounded-lg border border-[var(--border)] bg-transparent px-3 py-2 text-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600 focus:border-brand-500";

export default function JoinCommunity({
  existing,
  hiddenPosts = 0,
  hiddenPets = 0,
}: {
  existing: CommunityProfile | null;
  /** Rows this person has written that nobody else can currently see. */
  hiddenPosts?: number;
  hiddenPets?: number;
}) {
  const [state, formAction, pending] = useActionState<CommunityState, FormData>(joinCommunity, {});
  const errorId = useId();
  // joinCommunity returns one form-level message; the only required field is
  // the display name, so that is where the link goes.
  const errorLink = state.error
    ? { "aria-invalid": true as const, "aria-describedby": errorId }
    : {};

  return (
    <div className="card p-6">
      {hiddenPosts + hiddenPets > 0 && (
        <div className="mb-4 rounded-lg border border-amber-300/60 bg-amber-50 p-3 text-sm dark:border-amber-500/30 dark:bg-amber-500/10">
          <p className="font-medium">
            {hiddenPosts > 0 && `${hiddenPosts} post${hiddenPosts === 1 ? "" : "s"}`}
            {hiddenPosts > 0 && hiddenPets > 0 && " and "}
            {hiddenPets > 0 && `${hiddenPets} published pet${hiddenPets === 1 ? "" : "s"}`}
            {" "}
            {hiddenPosts + hiddenPets === 1 ? "is" : "are"} hidden right now
          </p>
          <p className="muted mt-1">
            You can still see your own, which is why this is easy to miss — but
            while your profile is private nobody else can. Nothing was deleted;
            rejoining below makes it all visible again.
          </p>
        </div>
      )}

      <div className="mb-4">
        <p className="font-medium">
          {hiddenPosts + hiddenPets > 0
            ? "Your profile is private"
            : "You\u2019re not in the community yet"}
        </p>
        <p className="muted mt-1 text-sm">
          Joining shows other signed-in owners your display name, anything you post,
          and any pets you choose to publish. It shares{" "}
          <span className="font-medium">none</span> of your health records —
          vaccinations, medications, weight, vet visits and uploaded documents stay
          private, always. You can leave at any time.
        </p>
      </div>

      <form action={formAction} className="space-y-3">
        <div className="grid gap-3 sm:grid-cols-[5rem_1fr]">
          <div>
            <label htmlFor="avatar_emoji" className="mb-1 block text-sm font-medium">
              Icon
            </label>
            <input
              id="avatar_emoji"
              name="avatar_emoji"
              defaultValue={existing?.avatar_emoji ?? "🐾"}
              maxLength={8}
              className={`${field} text-center`}
            />
          </div>
          <div>
            <label htmlFor="display_name" className="mb-1 block text-sm font-medium">
              Display name <span className="text-red-600 dark:text-red-400">*</span>
            </label>
            <input
              id="display_name"
              name="display_name"
              required
              minLength={2}
              maxLength={40}
              defaultValue={existing?.display_name ?? ""}
              className={field}
              {...errorLink}
            />
          </div>
        </div>

        <div>
          <label htmlFor="city" className="mb-1 block text-sm font-medium">
            City <span className="muted text-xs">(optional)</span>
          </label>
          <input id="city" name="city" maxLength={60} defaultValue={existing?.city ?? ""} className={field} />
        </div>

        <div>
          <label htmlFor="bio" className="mb-1 block text-sm font-medium">
            About you <span className="muted text-xs">(optional)</span>
          </label>
          <textarea
            id="bio"
            name="bio"
            rows={2}
            maxLength={280}
            defaultValue={existing?.bio ?? ""}
            className={field}
          />
        </div>

        {state.error && (
          <p id={errorId} className="text-sm text-red-600 dark:text-red-400" role="alert">
            {state.error}
          </p>
        )}
        <button
          disabled={pending}
          className="inline-flex min-h-11 items-center rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-60"
        >
          {pending ? "Joining…" : "Join the community"}
        </button>
      </form>
    </div>
  );
}
