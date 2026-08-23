"use client";

import { useActionState, useId } from "react";
import { setPassword, type SetPasswordState } from "@/app/auth-actions";

/**
 * Gives a link-created account a password.
 *
 * The two sign-in methods used to be one-way doors: sign in with an email link
 * and you could never use a password, because nothing ever set one. With the
 * hosted mailer capped at two emails an hour, that is a real lockout rather
 * than an inconvenience.
 */
export default function SetPasswordForm() {
  const [state, action, pending] = useActionState<SetPasswordState, FormData>(setPassword, {});
  const errorId = useId();

  const field =
    "w-full rounded-lg border border-[var(--border)] bg-transparent px-3 py-2 text-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600 focus:border-brand-500";

  return (
    <form action={action} className="card space-y-3 p-6">
      <div>
        <p className="font-medium">Set a password</p>
        <p className="muted mt-1 text-sm">
          If you signed in with an email link, your account doesn&apos;t have a
          password yet. Set one here and you can sign in instantly from any
          device — no waiting on an email.
        </p>
      </div>

      <div>
        <label htmlFor="new-password" className="muted mb-1 block text-xs font-medium">
          New password
        </label>
        <input
          id="new-password"
          name="password"
          type="password"
          required
          minLength={8}
          autoComplete="new-password"
          aria-describedby={state.error ? errorId : undefined}
          aria-invalid={state.error ? true : undefined}
          className={field}
        />
        <p className="muted mt-1 text-xs">At least 8 characters.</p>
      </div>

      <div>
        <label htmlFor="confirm-password" className="muted mb-1 block text-xs font-medium">
          Type it again
        </label>
        <input
          id="confirm-password"
          name="confirm"
          type="password"
          required
          minLength={8}
          autoComplete="new-password"
          className={field}
        />
      </div>

      {state.error && (
        <p id={errorId} role="alert" className="text-sm text-red-600 dark:text-red-400">
          {state.error}
        </p>
      )}
      {state.ok && (
        <p role="status" className="text-sm text-green-700 dark:text-green-400">
          Password set. You can sign in with it from now on.
        </p>
      )}

      <button
        disabled={pending}
        className="inline-flex min-h-11 items-center rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-60"
      >
        {pending ? "Saving…" : "Save password"}
      </button>
    </form>
  );
}
