import { createClient } from "@/lib/supabase/server";
import { formatDateTime } from "@/lib/format";
import { MOOD_LABEL, tagEmoji, tagLabel } from "@/lib/health-check";
import type { WellbeingNote } from "@/lib/types";

/** Long enough to read the page, short enough that a leaked URL dies fast. */
const SIGNED_URL_TTL = 60 * 60;

/**
 * What the owner has said lately, newest first. Presented as quotations of the
 * owner, not as findings: no severity, no colour, no ordering by concern.
 */
export default async function WellbeingTimeline({ notes }: { notes: WellbeingNote[] }) {
  if (notes.length === 0) return null;

  const voiceUrls = await signVoiceNotes(notes);

  return (
    <ol className="mt-4 space-y-3">
      {notes.map((n) => {
        const url = n.voice_path ? voiceUrls.get(n.voice_path) : undefined;
        return (
          <li key={n.id} className="card p-4">
            <p className="muted text-xs">{formatDateTime(n.recorded_at)}</p>

            {n.body && <p className="mt-1.5 whitespace-pre-wrap text-sm">{n.body}</p>}

            {n.sensation_tags.length > 0 && (
              <ul className="mt-2 flex flex-wrap gap-1.5">
                {n.sensation_tags.map((t) => (
                  <li
                    key={t}
                    className="muted inline-flex items-center gap-1 rounded-full border border-[var(--border)] px-2 py-0.5 text-xs"
                  >
                    <span aria-hidden>{tagEmoji(t)}</span>
                    {tagLabel(t)}
                  </li>
                ))}
              </ul>
            )}

            {n.mood != null && (
              <p className="muted mt-2 text-xs">
                Energy &amp; mood {n.mood}/5 — {MOOD_LABEL[n.mood]}
              </p>
            )}

            {url && <audio src={url} controls className="mt-2 w-full max-w-sm" />}
          </li>
        );
      })}
    </ol>
  );
}

/**
 * The bucket is private, so every clip needs a signature. Signed in one batch
 * rather than per row — a month of notes would otherwise be a month of round
 * trips before the page can render.
 */
async function signVoiceNotes(notes: WellbeingNote[]): Promise<Map<string, string>> {
  const paths = [...new Set(notes.map((n) => n.voice_path).filter((p): p is string => !!p))];
  if (paths.length === 0) return new Map();

  const supabase = await createClient();
  const { data } = await supabase.storage.from("vet-reports").createSignedUrls(paths, SIGNED_URL_TTL);

  // A missing signature just means no player — the written note is the record,
  // and losing it because a file went missing would be worse.
  const urls = new Map<string, string>();
  for (const r of data ?? []) {
    if (!r.error && r.path && r.signedUrl) urls.set(r.path, r.signedUrl);
  }
  return urls;
}
