/**
 * OCR in the visitor's browser, because on the server it does not finish.
 *
 * WHY THIS EXISTS
 * /api/documents/[id]/extract-local reads a photograph with tesseract.js in a
 * serverless function. Locally that takes 1–12 seconds. On Vercel it exceeds the
 * 60-second function ceiling and returns FUNCTION_INVOCATION_TIMEOUT — so photo
 * reading, which the landing page and the upload box both advertise, had never
 * once worked in production. Text-layer PDFs were fine (185 ms) and hid it.
 *
 * Raising maxDuration is not available: 60s is already the cap on this plan.
 *
 * In the browser there is no such ceiling. The tab can take as long as it needs,
 * the work is the visitor's own CPU rather than a metered function, and the
 * photograph never leaves the device at all — which is a stronger version of the
 * promise the upload box already makes.
 *
 * The engine and the English traineddata are served from this origin
 * (/tessdata/eng.traineddata.gz), never a CDN: the whole point of this path is
 * that a medical document can be read with no third party involved.
 *
 * PDFs deliberately still go to the server route. They are exact and fast there,
 * and pdf.js in the browser would be a second copy of a problem we do not have.
 */
import type { ExtractedReport, SupportedMime } from "./extraction";
import { parseVetReport } from "./vet-parser";

/** Same shape the server route returns, so callers cannot tell them apart. */
export interface BrowserScan {
  report: ExtractedReport;
  ocrConfidence: number;
  ms: number;
}

export function canReadInBrowser(mime: string): boolean {
  return mime === "image/png" || mime === "image/jpeg" || mime === "image/webp";
}

export async function scanImageInBrowser(
  file: File,
  onProgress?: (fraction: number) => void
): Promise<BrowserScan> {
  const started = Date.now();
  const { createWorker } = await import("tesseract.js");

  const worker = await createWorker("eng", 1, {
    // Same-origin copy of the traineddata that the server path uses.
    langPath: "/tessdata",
    gzip: true,
    logger: onProgress
      ? (m: { status: string; progress: number }) => {
          // Only the recognise phase is worth showing; the load phases jump
          // around and make a progress bar look broken.
          if (m.status === "recognizing text") onProgress(m.progress);
        }
      : undefined,
  });

  try {
    const { data } = await worker.recognize(file);
    const text = data.text ?? "";
    const confidence = data.confidence ?? 0;
    const { report } = parseVetReport(text, { source: "ocr", ocrConfidence: confidence });
    return { report, ocrConfidence: confidence, ms: Date.now() - started };
  } finally {
    await worker.terminate();
  }
}

/** Narrowing helper so callers can pass a File's type straight through. */
export function asSupportedMime(mime: string): SupportedMime | null {
  return mime === "application/pdf" ||
    mime === "image/png" ||
    mime === "image/jpeg" ||
    mime === "image/webp"
    ? (mime as SupportedMime)
    : null;
}
