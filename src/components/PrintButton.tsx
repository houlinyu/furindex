"use client";

/**
 * Deliberately `window.print()` and not a PDF library.
 *
 * Every browser already ships a competent PDF writer behind the print dialog:
 * it honours the @page rules, it lets the user pick A4 or Letter, it works
 * offline, and it adds nothing to the bundle. A client-side PDF generator would
 * be ~300 kB to produce a worse-looking file with worse text selection.
 */
export default function PrintButton({ className = "" }: { className?: string }) {
  return (
    <button
      type="button"
      onClick={() => window.print()}
      className={
        className ||
        "rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700"
      }
    >
      Print / Save as PDF
    </button>
  );
}
