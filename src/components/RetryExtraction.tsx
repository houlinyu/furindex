"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function RetryExtraction({
  documentId,
  label = "Try again",
}: {
  documentId: string;
  label?: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/documents/${documentId}/extract`, { method: "POST" });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setError(body.error ?? "Still couldn't read it.");
      }
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <button
        onClick={run}
        disabled={busy}
        className="inline-flex min-h-11 items-center rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-60"
      >
        {busy ? "Reading…" : label}
      </button>
      {error && <p className="mt-3 text-sm text-red-600 dark:text-red-400">{error}</p>}
    </>
  );
}
