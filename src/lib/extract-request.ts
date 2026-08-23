/**
 * Asks the server to read an uploaded document.
 *
 * Two readers exist. The model-backed one is better and needs an API key; the
 * on-device one needs nothing and is weaker. This tries the good one first and
 * falls back only when the server says it has no key — so setting a key later
 * silently upgrades every upload, and never setting one still works.
 */
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

export async function requestExtraction(documentId: string): Promise<ExtractionOutcome> {
  const res = await fetch(`/api/documents/${documentId}/extract`, { method: "POST" });
  if (res.ok) return { ok: true, reader: "model" };

  // 503 is the "no ANTHROPIC_API_KEY" answer. Anything else is a real failure
  // of a reader that does exist, and re-reading locally would only confuse it.
  if (res.status !== 503) {
    const b = await body(res);
    return { ok: false, error: b.error, disabled: b.disabled, reader: "model" };
  }

  const local = await fetch(`/api/documents/${documentId}/extract-local`, { method: "POST" });
  if (local.ok) return { ok: true, reader: "on-device" };
  const b = await body(local);
  return { ok: false, error: b.error, disabled: b.disabled, reader: "on-device" };
}
