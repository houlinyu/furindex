"use client";

import { useActionState, useId } from "react";
import { submitContact, type ContactState } from "@/app/contact-actions";

const field =
  "w-full rounded-lg border border-[var(--border)] bg-transparent px-3 py-2 text-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600 focus:border-brand-500";

export default function ContactForm({ sourcePage = "/contact" }: { sourcePage?: string }) {
  const [state, action, pending] = useActionState<ContactState, FormData>(submitContact, {});
  const errorId = useId();
  const errorLink = state.error
    ? { "aria-invalid": true as const, "aria-describedby": errorId }
    : {};

  if (state.ok) {
    return (
      <div className="card p-6 text-center">
        <div className="text-3xl">📬</div>
        <p className="mt-3 font-medium">Got it — thank you</p>
        <p className="muted mx-auto mt-1 max-w-sm text-sm leading-relaxed">
          A real person reads these. If it needs a reply, you&apos;ll hear back at
          the address you gave.
        </p>
      </div>
    );
  }

  return (
    <form action={action} className="card grid gap-3 p-6">
      <input type="hidden" name="source_page" value={sourcePage} />

      <div>
        <label htmlFor="contact-email" className="mb-1 block text-sm font-medium">
          Your email
        </label>
        <input
          id="contact-email"
          name="email"
          type="email"
          required
          maxLength={254}
          autoComplete="email"
          placeholder="you@example.com"
          className={field}
          {...errorLink}
        />
      </div>

      <div>
        <label htmlFor="contact-msg" className="mb-1 block text-sm font-medium">
          Your message
        </label>
        <textarea
          id="contact-msg"
          name="message"
          required
          rows={5}
          maxLength={4000}
          placeholder="Anything at all — a question, an idea, something that broke. A sentence or two is plenty."
          className={field}
          {...errorLink}
        />
      </div>

      {state.error && (
        <p id={errorId} role="alert" className="text-sm text-red-600 dark:text-red-400">
          {state.error}
        </p>
      )}

      <div>
        <button
          type="submit"
          disabled={pending}
          className="inline-flex min-h-11 items-center rounded-lg bg-brand-600 px-6 py-2.5 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-60"
        >
          {pending ? "Sending…" : "Send message"}
        </button>
        <p className="muted mt-2 text-xs">
          Goes straight to the team. We don&apos;t add you to anything.
        </p>
      </div>
    </form>
  );
}
