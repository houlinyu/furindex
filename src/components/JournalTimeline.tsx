import { createClient } from "@/lib/supabase/server";
import { formatDate, formatWallClock } from "@/lib/format";
import {
  JOURNAL_CATEGORY_EMOJI,
  JOURNAL_CATEGORY_LABEL,
  type JournalEntry,
} from "@/lib/types";

/** Long enough to read a page of entries, short enough that a leaked URL dies fast. */
const SIGNED_URL_TTL = 60 * 60;

const SEVERITY_LABEL: Record<number, string> = {
  1: "Barely noticeable",
  2: "Mild",
  3: "Worth watching",
  4: "Bad",
  5: "Urgent",
};

/**
 * The read side of the journal: one observation per row, newest first. Read
 * top-to-bottom it is the "when did this start / how often does it happen"
 * history a vet asks for and nobody remembers accurately.
 */
export default async function JournalTimeline({ entries }: { entries: JournalEntry[] }) {
  // Nothing to list, and the entry form directly above already says what the
  // journal is for and offers the way in. A second card repeating it is the
  // "heading over nothing" this page had too much of.
  if (entries.length === 0) return null;

  const photoUrls = await signPhotos(entries);

  return (
    <ol className="space-y-3">
      {entries.map((e) => {
        const url = e.photo_path ? photoUrls.get(e.photo_path) : undefined;

        return (
          <li key={e.id} className="card flex gap-3 p-4">
            <span
              aria-hidden
              className="mt-0.5 shrink-0 text-xl leading-none"
              title={JOURNAL_CATEGORY_LABEL[e.category]}
            >
              {JOURNAL_CATEGORY_EMOJI[e.category]}
            </span>

            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                <p className="text-sm font-medium">{e.title}</p>
                <span className="muted text-xs">
                  {JOURNAL_CATEGORY_LABEL[e.category]} · {formatDate(e.occurred_on)}
                  {/* Absent for most entries, and shown as nothing at all rather
                      than a placeholder — "no time recorded" is the normal case,
                      not a gap to nag about. */}
                  {e.occurred_at && ` at ${formatWallClock(e.occurred_at)}`}
                </span>
              </div>

              {e.severity != null && <Severity level={e.severity} />}

              {e.body && (
                <p className="muted mt-1.5 whitespace-pre-wrap text-sm">{e.body}</p>
              )}
            </div>

            {url && (
              // eslint-disable-next-line @next/next/no-img-element -- signed URL from a
              // private bucket; next/image would need the host allow-listed and would
              // re-fetch it through the optimiser after the signature expires.
              <img
                src={url}
                alt={`Photo attached to “${e.title}”`}
                className="h-16 w-16 shrink-0 rounded-lg border border-[var(--border)] object-cover"
              />
            )}
          </li>
        );
      })}
    </ol>
  );
}

function Severity({ level }: { level: number }) {
  const tone =
    level >= 4 ? "bg-red-500" : level === 3 ? "bg-amber-500" : "bg-brand-500";

  return (
    <p className="mt-1.5 flex items-center gap-1.5">
      <span className="flex gap-0.5" aria-hidden>
        {[1, 2, 3, 4, 5].map((n) => (
          <span
            key={n}
            className={`h-1.5 w-4 rounded-full ${n <= level ? tone : "bg-[var(--border)]"}`}
          />
        ))}
      </span>
      <span className="muted text-xs">
        Severity {level}/5 — {SEVERITY_LABEL[level]}
      </span>
    </p>
  );
}

/**
 * The bucket is private, so every thumbnail needs a signature. Signed in one
 * batch rather than per row — a month of entries would otherwise be a month of
 * round trips before the page can render.
 */
async function signPhotos(entries: JournalEntry[]): Promise<Map<string, string>> {
  const paths = [...new Set(entries.map((e) => e.photo_path).filter((p): p is string => !!p))];
  if (paths.length === 0) return new Map();

  const supabase = await createClient();
  const { data } = await supabase.storage
    .from("vet-reports")
    .createSignedUrls(paths, SIGNED_URL_TTL);

  // A missing or failed signature just means no thumbnail — the note itself is
  // the record, and losing it because a file went missing would be worse.
  const urls = new Map<string, string>();
  for (const r of data ?? []) {
    if (!r.error && r.path && r.signedUrl) urls.set(r.path, r.signedUrl);
  }
  return urls;
}
