"use client";

import { useState } from "react";
import { leaveCommunity } from "@/app/community-actions";

/**
 * Leaving is one click on a small underlined link sitting next to your own
 * name, and it hides every post and published pet you have from everyone else
 * at once — while leaving them all perfectly visible to you, so there is no
 * feedback that anything changed. That is a lot of consequence for a misclick,
 * so it now says what it does before it does it.
 *
 * Nothing is deleted, and the copy says that too: the fear that leaving throws
 * away what you wrote is exactly what stops people using a leave button they
 * ought to feel free to use.
 */
export default function LeaveCommunityButton() {
  const [confirming, setConfirming] = useState(false);

  if (!confirming) {
    return (
      <button
        onClick={() => setConfirming(true)}
        className="muted text-xs underline underline-offset-4 hover:text-red-600"
      >
        Leave the community
      </button>
    );
  }

  return (
    <span className="inline-flex flex-wrap items-center gap-2 text-xs">
      <span className="muted">
        Your posts and published pets stay saved, but nobody else will see them.
      </span>
      <form action={leaveCommunity} className="inline">
        <button className="rounded-lg border border-red-300 px-2 py-1 font-medium text-red-600 hover:bg-red-50 dark:border-red-500/40 dark:hover:bg-red-500/10">
          Leave
        </button>
      </form>
      <button onClick={() => setConfirming(false)} className="muted underline underline-offset-4">
        Cancel
      </button>
    </span>
  );
}
