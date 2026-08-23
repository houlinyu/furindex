"use client";

import { useActionState, useRef } from "react";
import { createPost, type CommunityState } from "@/app/community-actions";
import type { CommunityPet } from "@/lib/types";

export default function PostComposer({ pets }: { pets: CommunityPet[] }) {
  const [state, formAction, pending] = useActionState<CommunityState, FormData>(createPost, {});
  const ref = useRef<HTMLFormElement>(null);
  if (state.ok && ref.current) ref.current.reset();

  return (
    <form ref={ref} action={formAction} className="card space-y-3 p-4">
      <textarea
        name="body"
        required
        rows={3}
        maxLength={1000}
        placeholder="How's your animal today?"
        className="w-full resize-none rounded-lg border border-[var(--border)] bg-transparent px-3 py-2 text-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600 focus:border-brand-500"
      />
      {state.error && (
        <p className="text-sm text-red-600" role="alert">
          {state.error}
        </p>
      )}
      <div className="flex flex-wrap items-center gap-3">
        {pets.length > 0 && (
          <select
            name="community_pet_id"
            defaultValue=""
            className="rounded-lg border border-[var(--border)] bg-transparent px-2 py-1.5 text-xs outline-none focus:border-brand-500"
          >
            <option value="">No pet tagged</option>
            {pets.map((p) => (
              <option key={p.id} value={p.id}>
                {p.avatar_emoji} {p.name}
              </option>
            ))}
          </select>
        )}
        <button
          disabled={pending}
          className="ml-auto rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-60"
        >
          {pending ? "Posting…" : "Post"}
        </button>
      </div>
    </form>
  );
}
