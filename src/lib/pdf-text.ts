/**
 * Layer 1: the text layer a real clinic's software already put in the PDF.
 *
 * Practice-management systems (Cornerstone, ezyVet, Avimark, IDEXX Neo) print
 * to PDF, so the characters are in the file exactly as typed. Reading them is
 * lossless — no OCR, no model, ~30 ms. This is the path most uploads should
 * take, and the only one that can honestly return "high" confidence.
 */

export interface PdfText {
  text: string;
  pages: number;
  /** False when the PDF is a scan: pages of pixels with no characters at all. */
  hasTextLayer: boolean;
}

/** Fewer than this many word characters means there is no usable text layer. */
const MIN_CHARS = 40;

export async function extractPdfText(bytes: Uint8Array): Promise<PdfText> {
  // Imported lazily: unpdf pulls in a pdf.js build, and a route that never
  // sees a PDF should never pay for it.
  const { extractText, getDocumentProxy } = await import("unpdf");
  try {
    // pdf.js takes ownership of the buffer it is handed and detaches it, which
    // would break the caller's bytes for anything that runs afterwards (a retry,
    // or a second reader). Hand it a copy.
    const pdf = await getDocumentProxy(new Uint8Array(bytes));
    const { totalPages, text } = await extractText(pdf, { mergePages: true });
    const merged = Array.isArray(text) ? text.join("\n") : text;
    const wordChars = merged.replace(/[^A-Za-z0-9]/g, "").length;
    return { text: merged, pages: totalPages, hasTextLayer: wordChars >= MIN_CHARS };
  } catch {
    // A corrupt, truncated, empty, or non-PDF byte stream makes pdf.js throw.
    // The contract is to report "no usable text layer" (so the caller falls
    // through to OCR), never to crash the request. An unreadable file is a
    // scan-shaped input, not an error.
    return { text: "", pages: 0, hasTextLayer: false };
  }
}
