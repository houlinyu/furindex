/**
 * The local extraction provider: a vet document in, an ExtractedReport out,
 * with no API key, no model and no third-party service.
 *
 * Three layers:
 *   1. `pdf-text` — the PDF's own text layer (src/lib/pdf-text.ts). Exact.
 *   2. `ocr`      — tesseract.js on an image (src/lib/ocr.ts). Approximate.
 *   3. the parser — text → records (src/lib/vet-parser.ts). Rules, not a model.
 *
 * Same shape as `extractReport` in src/lib/extraction.ts, so it can stand in
 * for it. It is deliberately worse: it fills fewer fields, it refuses more
 * often, and it reports lower confidence — which is what the review screen
 * needs in order to stop an OCR misreading from landing in a health record.
 *
 * Wiring as it stands: the client calls /api/documents/[id]/extract first and
 * falls back to /api/documents/[id]/extract-local on the 503 that route
 * returns when no ANTHROPIC_API_KEY is set (src/lib/extract-request.ts). That
 * keeps the model-backed route untouched and upgrades every upload the moment
 * a key is configured.
 *
 * To fold it into the model route instead, replace that route's 503 block with:
 *
 *     if (!process.env.ANTHROPIC_API_KEY) {
 *       const extracted = await scanReportLocal(bytes, doc.mime_type);
 *       await supabase.from("documents")
 *         .update({ status: "extracted", extracted, extraction_error: null })
 *         .eq("id", id);
 *       return NextResponse.json({ ok: true, extracted });
 *     }
 *
 * — after the storage download rather than before it, since it needs `bytes`.
 */
import type { ExtractedReport } from "./extraction";
import type { SupportedMime } from "./extraction";
import { extractPdfText } from "./pdf-text";
import { ocrImage } from "./ocr";
import { parseVetReport, type ParseTrace } from "./vet-parser";
import { localReaderAvailable } from "./reader";

/**
 * Whether the local reader should be used. It needs nothing configured, so the
 * only reason to say no is an explicit opt-out — which lives in reader.ts with
 * the rest of the reader question, so the UI copy and this route agree.
 */
export function localExtractProvider(): boolean {
  return localReaderAvailable();
}

export interface LocalScanDetail {
  layer: "pdf-text" | "ocr";
  ocrConfidence: number | null;
  ms: number;
  trace: ParseTrace;
}

/** The scan plus everything the parser noticed — for tests and diagnostics. */
export async function scanReportLocalDetailed(
  fileBytes: Uint8Array,
  mimeType: string
): Promise<{ report: ExtractedReport; detail: LocalScanDetail }> {
  const started = Date.now();

  if (mimeType === "application/pdf") {
    const pdf = await extractPdfText(fileBytes);
    if (!pdf.hasTextLayer) {
      // A scanned PDF is pixels in a PDF wrapper. Rasterising it in Node needs
      // a native canvas binding this project does not carry, so rather than
      // pretend, say exactly what to do instead.
      throw new Error(
        "This PDF has no text in it — it is a scan. Photograph the page and upload it as a PNG or JPG instead, and it will be read by OCR."
      );
    }
    const { report, trace } = parseVetReport(pdf.text, { source: "pdf-text" });
    return {
      report,
      detail: { layer: "pdf-text", ocrConfidence: null, ms: Date.now() - started, trace },
    };
  }

  const ocr = await ocrImage(fileBytes);
  const { report, trace } = parseVetReport(ocr.text, {
    source: "ocr",
    ocrConfidence: ocr.confidence,
  });
  return {
    report,
    detail: { layer: "ocr", ocrConfidence: ocr.confidence, ms: Date.now() - started, trace },
  };
}

/**
 * Drop-in for `extractReport`. The pet-name hint is accepted so the two
 * providers have the same signature, and ignored: a rules parser has no way to
 * use a hint without inventing an identity the document does not state.
 */
export async function scanReportLocal(
  fileBytes: Uint8Array,
  mimeType: SupportedMime | string,
  _petNameHint?: string | null
): Promise<ExtractedReport> {
  const { report } = await scanReportLocalDetailed(fileBytes, mimeType);
  return report;
}
