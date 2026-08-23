"use client";

import Link from "next/link";
import { useEffect } from "react";

/**
 * Last line of defence. Every known throwing path has been converted to return
 * an error instead, but without this file any future one renders Next's raw
 * "Application error: a server-side exception has occurred" — which tells the
 * user nothing and looks broken.
 */
export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <main className="flex min-h-screen items-center justify-center px-4">
      <div className="card max-w-md p-8 text-center">
        <div className="text-4xl">🐾</div>
        <h1 className="mt-4 text-lg font-semibold tracking-tight">
          That didn&apos;t work
        </h1>
        <p className="muted mt-2 text-sm leading-relaxed">
          Something went wrong on our side. Your records are safe — nothing was
          changed by this.
        </p>
        <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
          <button
            onClick={reset}
            className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700"
          >
            Try again
          </button>
          <Link
            href="/dashboard"
            className="rounded-lg border border-[var(--border)] px-4 py-2 text-sm font-medium hover:border-brand-500 hover:text-brand-600"
          >
            Back to dashboard
          </Link>
        </div>
        {error.digest && (
          <p className="muted mt-6 text-xs">Reference: {error.digest}</p>
        )}
      </div>
    </main>
  );
}
