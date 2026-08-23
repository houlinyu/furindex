"use client";

import { useActionState, useId } from "react";
import { submitInquiry, type InquiryState } from "@/app/inquiry-actions";

const field =
  "w-full rounded-lg border border-[var(--border)] bg-transparent px-3 py-2 text-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600 focus:border-brand-500";

export default function PartnerInquiryForm({ sourcePage = "/partners" }: { sourcePage?: string }) {
  const [state, formAction, pending] = useActionState<InquiryState, FormData>(submitInquiry, {});
  const errorId = useId();
  // submitInquiry validates name, email and message and returns a single
  // message for whichever failed, so all three required fields point at it.
  const errorLink = state.error
    ? { "aria-invalid": true as const, "aria-describedby": errorId }
    : {};

  if (state.ok) {
    return (
      <div className="card p-6 text-center">
        <div className="text-3xl">📬</div>
        <p className="mt-3 font-medium">Thanks — that reached us</p>
        <p className="muted mx-auto mt-1 max-w-sm text-sm leading-relaxed">
          We read every one of these ourselves. If there&apos;s something to talk
          about, you&apos;ll hear back at the address you gave.
        </p>
      </div>
    );
  }

  return (
    <form action={formAction} className="card grid gap-3 p-6 sm:grid-cols-2">
      <input type="hidden" name="source_page" value={sourcePage} />

      <div>
        <label htmlFor="iq-name" className="mb-1 block text-sm font-medium">
          Your name <span className="text-red-600 dark:text-red-400">*</span>
        </label>
        <input id="iq-name" name="name" required maxLength={120} autoComplete="name" className={field} {...errorLink} />
      </div>

      <div>
        <label htmlFor="iq-email" className="mb-1 block text-sm font-medium">
          Email <span className="text-red-600 dark:text-red-400">*</span>
        </label>
        <input id="iq-email" name="email" type="email" required maxLength={254} autoComplete="email" className={field} {...errorLink} />
      </div>

      <div>
        <label htmlFor="iq-org" className="mb-1 block text-sm font-medium">
          Organisation
        </label>
        <input id="iq-org" name="organisation" maxLength={160} autoComplete="organization" className={field} />
      </div>

      <div>
        <label htmlFor="iq-cat" className="mb-1 block text-sm font-medium">
          What are you building?
        </label>
        <select id="iq-cat" name="category" defaultValue="other" className={field}>
          <option value="wearables">Wearables &amp; sensors</option>
          <option value="clinic">Veterinary clinic or practice software</option>
          <option value="diagnostics">Diagnostics or genomics</option>
          <option value="insurance">Insurance or preventive care</option>
          <option value="other">Something else</option>
        </select>
      </div>

      <div className="sm:col-span-2">
        <label htmlFor="iq-msg" className="mb-1 block text-sm font-medium">
          What would you want to write into the record? <span className="text-red-600 dark:text-red-400">*</span>
        </label>
        <textarea
          id="iq-msg"
          name="message"
          required
          rows={4}
          minLength={10}
          maxLength={4000}
          placeholder="A sentence or two is plenty."
          className={field}
          {...errorLink}
        />
      </div>

      {state.error && (
        <p id={errorId} className="text-sm text-red-600 sm:col-span-2 dark:text-red-400" role="alert">
          {state.error}
        </p>
      )}

      <div className="sm:col-span-2">
        <button
          type="submit"
          disabled={pending}
          className="inline-flex min-h-11 items-center rounded-lg bg-brand-600 px-6 py-2.5 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-60"
        >
          {pending ? "Sending…" : "Send"}
        </button>
        <p className="muted mt-2 text-xs">
          Goes straight to the team. We don&apos;t add you to anything.
        </p>
      </div>
    </form>
  );
}
