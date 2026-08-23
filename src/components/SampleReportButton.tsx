"use client";

import { useTransition } from "react";
import { createSampleDocument } from "@/app/document-actions";

export default function SampleReportButton({ primary }: { primary: boolean }) {
  const [pending, startTransition] = useTransition();

  return (
    <button
      onClick={() =>
        startTransition(async () => {
          await createSampleDocument();
        })
      }
      disabled={pending}
      className={
        primary
          ? "rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-60"
          : "muted text-xs underline underline-offset-4 hover:text-brand-600 disabled:opacity-60"
      }
    >
      {pending ? "Opening…" : primary ? "Open a sample report" : "or try a sample report"}
    </button>
  );
}
