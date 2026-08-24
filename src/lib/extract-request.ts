/**
 * Reads an uploaded document, wherever that can actually happen.
 *
 * Three readers now, tried in order of quality:
 *
 *  1. the model-backed server route — best, needs an API key
 *  2. the on-device server route — exact for PDFs with a text layer, ~185ms
 *  3. the BROWSER — for photographs, because OCR does not fit in a serverless
 *     function: on Vercel it blows the 60-second ceiling and returns
 *     FUNCTION_INVOCATION_TIMEOUT, so photo reading had never worked in
 *     production even though the upload box advertises it. The tab has no such
 *     limit, and the photograph never leaves the device.
 *
 * PDFs deliberately stay on the server: they are exact and fast there.
 */
import { canReadInBrowser } from "@/lib/extraction-browser";

export interface ExtractionOutcome {
  ok: boolean;
  error?: string;
  /** True when reading is switched off entirely, which is not a failed upload. */
  disabled?: boolean;
  /** Which reader produced the result. */
  reader?: "model" | "on-device";
}

async function body(res: Response): Promise<{ error?: string; disabled?: boolean }> {
  return (await res.json().catch(() => ({}))) as { error?: string; disabled?: boolean };
}

export async function requestExtraction(
  documentId: string,
  /** The file itself, needed only for the browser path. */
  file?: File,
  onProgress?: (fraction: number) => void
): Promise<ExtractionOutcome> {
  const res = await fetch(`/api/documents/${documentId}/extract`, { method: "POST" });
  if (res.ok) return { ok: true, reader: "model" };

  // 503 is the "no ANTHROPIC_API_KEY" answer. Anything else is a real failure
  // of a reader that does exist, and re-reading locally would only confuse it.
  if (res.status !== 503) {
    const b = await body(res);
    return { ok: false, error: b.error, disabled: b.disabled, reader: "model" };
  }

  // A photograph is read here, in this tab, not on the server.
  if (file && canReadInBrowser(file.type)) {
    return readInBrowser(documentId, file, onProgress);
  }

  const local = await fetch(`/api/documents/${documentId}/extract-local`, { method: "POST" });
  if (local.ok) return { ok: true, reader: "on-device" };
  const b = await body(local);
  return { ok: false, error: b.error, disabled: b.disabled, reader: "on-device" };
}

async function readInBrowser(
  documentId: string,
  file: File,
  onProgress?: (fraction: number) => void
): Promise<ExtractionOutcome> {
  try {
    const { scanImageInBrowser } = await import("@/lib/extraction-browser");
    const { saveBrowserExtraction } = await import("@/app/document-actions");
    const { report } = await scanImageInBrowser(file, onProgress);
    const saved = await saveBrowserExtraction(documentId, report);
    if (saved.error) return { ok: false, error: saved.error, reader: "on-device" };
    return { ok: true, reader: "on-device" };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Reading that photo failed.";
    // Record the failure so the review screen can explain itself rather than
    // showing a document stuck forever in "reading".
    const { saveBrowserExtractionError } = await import("@/app/document-actions");
    await saveBrowserExtractionError(documentId, message).catch(() => {});
    return { ok: false, error: message, reader: "on-device" };
  }
}
