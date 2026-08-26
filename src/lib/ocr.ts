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

/**
 * Decode the image with sharp and re-encode it to a clean PNG before OCR. This
 * is a SAFETY GATE, not a quality step: tesseract.js reports a failure to read
 * an image by re-throwing on a later tick from inside its Worker, which escapes
 * as an uncaughtException the caller's try/catch and `.catch()` cannot trap — so
 * a single corrupt, truncated, empty, or non-image upload would take down the
 * whole server process. sharp fails synchronously and catchably on exactly those
 * inputs, so probing here converts an uncatchable crash into a clean empty read.
 * The pixels are not altered (no grayscale/normalise/resize — those were tried
 * and hurt real scans); only the container is validated and normalised.
 */
async function decodeForOcr(bytes: Uint8Array): Promise<Buffer | null> {
  try {
    const sharp = (await import("sharp")).default;
    return await sharp(Buffer.from(bytes), { failOn: "none" }).png().toBuffer();
  } catch {
    return null;
  }
}

export async function ocrImage(bytes: Uint8Array): Promise<OcrResult> {
  const started = Date.now();
  const input = await decodeForOcr(bytes);
  // Undecodable bytes never reach tesseract — return an empty, zero-confidence
  // read so the pipeline treats it as an unreadable scan, not a crash.
  if (!input) return { text: "", confidence: 0, ms: Date.now() - started };
  // Lazy: the WASM core is several MB and must not load on unrelated requests.
  const { createWorker } = await import("tesseract.js");
  const worker = await createWorker("eng", 1, {
    langPath: tessdataDir(),
    gzip: true,
    // Nothing to cache to on a read-only serverless filesystem.
    cacheMethod: "none",
  });
  try {
    const { data } = await worker.recognize(input);
    return { text: data.text ?? "", confidence: data.confidence ?? 0, ms: Date.now() - started };
  } finally {
    await worker.terminate();
  }
}
