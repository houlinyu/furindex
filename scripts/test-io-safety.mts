/**
 * Crash-safety of the two byte-level readers. A corrupt, empty, truncated, or
 * non-matching upload must degrade to an empty read — never throw, and above all
 * never take down the server process. (tesseract.js reports a bad image by
 * re-throwing on a later tick from inside its Worker, which escapes a caller's
 * try/catch as an uncaughtException; ocrImage now validates the bytes with sharp
 * first, so that path can no longer fire.)
 *
 *   npx tsx scripts/test-io-safety.mts
 */
import { ocrImage } from "../src/lib/ocr";
import { extractPdfText } from "../src/lib/pdf-text";
import { scanReportLocalDetailed } from "../src/lib/extraction-local";

let passed = 0;
let failed = 0;
const ok = (c: boolean, what: string) => {
  if (c) passed++;
  else {
    failed++;
    console.log(`  FAIL ${what}`);
  }
};

// If any of these throws (sync or async), the process would exit non-zero and
// the test would fail loudly — which is exactly the crash we are guarding.
process.on("uncaughtException", (e) => {
  console.log(`  FAIL uncaughtException escaped: ${e.message.slice(0, 80)}`);
  process.exit(1);
});

const badImages: Array<[string, Uint8Array]> = [
  ["empty", new Uint8Array(0)],
  ["five random bytes", new Uint8Array([1, 2, 3, 4, 5])],
  ["text-as-image", new Uint8Array(Buffer.from("this is not an image at all"))],
  ["truncated png header", new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a])],
];
for (const [name, bytes] of badImages) {
  try {
    const r = await ocrImage(bytes);
    ok(r.text === "" && r.confidence === 0, `ocrImage(${name}) returns an empty read`);
  } catch (e) {
    ok(false, `ocrImage(${name}) threw: ${(e as Error).message.slice(0, 60)}`);
  }
}

const badPdfs: Array<[string, Uint8Array]> = [
  ["empty", new Uint8Array(0)],
  ["header only", new Uint8Array(Buffer.from("%PDF-1.4"))],
  ["random garbage", new Uint8Array(Buffer.from("just some plain text, definitely not a pdf"))],
  ["truncated", new Uint8Array(Buffer.from("%PDF-1.4\n1 0 obj\n<< /Type /Catalog"))],
];
for (const [name, bytes] of badPdfs) {
  try {
    const r = await extractPdfText(bytes);
    ok(r.hasTextLayer === false, `extractPdfText(${name}) reports no text layer`);
  } catch (e) {
    ok(false, `extractPdfText(${name}) threw: ${(e as Error).message.slice(0, 60)}`);
  }
}

// A textless / corrupt / scanned PDF is ROUTINE input: the extractor must return
// a graceful unreadable report (which the route serves as a handled 200), never
// throw (which the route would map to an HTTP 500).
for (const [name, bytes] of badPdfs) {
  try {
    const { report } = await scanReportLocalDetailed(bytes, "application/pdf");
    ok(report.unreadable === true, `scanReportLocalDetailed(${name}) returns an unreadable report, not a throw`);
  } catch (e) {
    ok(false, `scanReportLocalDetailed(${name}) threw (would be a 500): ${(e as Error).message.slice(0, 60)}`);
  }
}

console.log(`\n${passed} passed, ${failed} failed`);
if (failed) process.exit(1);
