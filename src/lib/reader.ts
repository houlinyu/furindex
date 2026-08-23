/**
 * Which document reader this deployment has.
 *
 * Decided in one place so the pages, the wording shown to the user and the two
 * API routes cannot drift apart — the dashboard spent a deploy telling people
 * "automatic reading is off" while the on-device reader was live behind it,
 * because the page tested for an API key and the route did not.
 *
 * Server-only, and deliberately free of any import of the readers themselves:
 * a page that only wants to phrase a sentence should not drag tesseract's
 * module graph into the server bundle.
 */
export type ReaderKind = "model" | "on-device" | "off";

/** The on-device reader needs nothing configured, so only an opt-out disables it. */
export function localReaderAvailable(): boolean {
  return process.env.LOCAL_EXTRACTION !== "off";
}

export function readerKind(): ReaderKind {
  if (process.env.ANTHROPIC_API_KEY) return "model";
  return localReaderAvailable() ? "on-device" : "off";
}
