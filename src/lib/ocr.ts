/**
 * Layer 2: OCR, for photographs and scans.
 *
 * tesseract.js — MIT, WASM, no key, no account. Both the engine and the
 * English traineddata are served from this repo (`tessdata/eng.traineddata.gz`
 * and the `tesseract.js-core` package), never from a CDN: the point of this
 * path is that a document can be read with no third party involved at all.
 */
import path from "node:path";

export interface OcrResult {
  text: string;
  /** Tesseract's mean word confidence, 0–100. Below ~70 the text is mush. */
  confidence: number;
  ms: number;
}

/** Where `eng.traineddata.gz` lives. Overridable for unusual deployments. */
export function tessdataDir(): string {
  return process.env.TESSDATA_PATH || path.join(process.cwd(), "tessdata");
}

export async function ocrImage(bytes: Uint8Array): Promise<OcrResult> {
  const started = Date.now();
  // Lazy: the WASM core is several MB and must not load on unrelated requests.
  const { createWorker } = await import("tesseract.js");
  const worker = await createWorker("eng", 1, {
    langPath: tessdataDir(),
    gzip: true,
    // Nothing to cache to on a read-only serverless filesystem.
    cacheMethod: "none",
  });
  try {
    const { data } = await worker.recognize(Buffer.from(bytes));
    return { text: data.text ?? "", confidence: data.confidence ?? 0, ms: Date.now() - started };
  } finally {
    await worker.terminate();
  }
}
