import { createClient } from "@/lib/supabase/server";
import { formatDate, formatTime } from "@/lib/format";
import {
  HEALTH_CHECK_PART_EMOJI,
  HEALTH_CHECK_PART_LABEL,
  HEALTH_CHECK_PART_IDS,
  SELF_ASSESSMENT_RECAP,
} from "@/lib/health-check";
import type { CaptureType, HealthCheck, HealthCheckItem } from "@/lib/types";

const SIGNED_URL_TTL = 60 * 60;

const MEDIA_NOUN: Record<CaptureType, string> = {
  photo: "Photo",
  video: "Clip",
  audio: "Recording",
};

/**
 * Earlier checks, newest first. Read top to bottom it is the "what did this
 * look like in March" history that nobody can reconstruct from memory.
 *
 * Deliberately not a status board: no green/amber/red, no per-part score, no
 * "3 of 9 completed". Each line is a quotation of what the owner said at the
 * time, and a check with two parts in it is shown as exactly that, without
 * comment.
 */
export default async function HealthCheckHistory({
  checks,
  items,
}: {
  checks: HealthCheck[];
  items: HealthCheckItem[];
}) {
  if (checks.length === 0) return null;

  const urls = await signMedia(items);
  const byCheck = new Map<string, HealthCheckItem[]>();
  for (const item of items) {
    const list = byCheck.get(item.check_id);
    if (list) list.push(item);
    else byCheck.set(item.check_id, [item]);
  }

  // Checklist order, not capture order — the eyes card sits above the paws card
  // every time, so two dates can be read side by side.
  const rank = new Map(HEALTH_CHECK_PART_IDS.map((p, i) => [p, i]));

  return (
    <ol className="mt-4 space-y-3">
      {checks.map((check) => {
        const rows = (byCheck.get(check.id) ?? []).slice().sort(
          (a, b) => (rank.get(a.part) ?? 0) - (rank.get(b.part) ?? 0)
        );
        if (rows.length === 0) return null;

        return (
          <li key={check.id} className="card p-4">
            <p className="text-sm font-medium">{formatDate(check.checked_on)}</p>
            <p className="muted mt-0.5 text-xs">
              {rows.length === 1 ? "1 part recorded" : `${rows.length} parts recorded`}
            </p>

            <ul className="mt-3 space-y-3">
              {rows.map((row) => {
                const url = row.media_path ? urls.get(row.media_path) : undefined;
                return (
                  <li key={row.id} className="flex gap-3">
                    <span aria-hidden className="mt-0.5 shrink-0 text-lg leading-none">
                      {HEALTH_CHECK_PART_EMOJI[row.part]}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm">
                        {HEALTH_CHECK_PART_LABEL[row.part]}
                        <span className="muted"> · {formatTime(row.captured_at)}</span>
                      </p>
                      {row.self_assessment && (
                        <p className="muted text-xs">
                          {SELF_ASSESSMENT_RECAP[row.self_assessment]}
                        </p>
                      )}
                      {row.note && (
                        <p className="mt-1 whitespace-pre-wrap text-xs">{row.note}</p>
                      )}
                      {row.media_path && !url && row.media_type && (
                        <p className="muted mt-1 text-xs">
                          {MEDIA_NOUN[row.media_type]} attached
                        </p>
                      )}
                    </div>
                    {url && row.media_type === "photo" && (
                      // eslint-disable-next-line @next/next/no-img-element -- signed URL
                      // from a private bucket; next/image would need the host allow-listed.
                      <img
                        src={url}
                        alt={`What you attached for ${HEALTH_CHECK_PART_LABEL[row.part].toLowerCase()}`}
                        className="h-14 w-14 shrink-0 rounded-lg border border-[var(--border)] object-cover"
                      />
                    )}
                    {url && row.media_type === "video" && (
                      <video
                        src={url}
                        controls
                        preload="metadata"
                        className="h-14 w-20 shrink-0 rounded-lg border border-[var(--border)] object-cover"
                      />
                    )}
                    {url && row.media_type === "audio" && (
                      <audio src={url} controls className="max-w-[12rem] shrink-0" />
                    )}
                  </li>
                );
              })}
            </ul>
          </li>
        );
      })}
    </ol>
  );
}

/** One batch for the whole page — see JournalTimeline for the same reasoning. */
async function signMedia(items: HealthCheckItem[]): Promise<Map<string, string>> {
  const paths = [...new Set(items.map((i) => i.media_path).filter((p): p is string => !!p))];
  if (paths.length === 0) return new Map();

  const supabase = await createClient();
  const { data } = await supabase.storage.from("vet-reports").createSignedUrls(paths, SIGNED_URL_TTL);

  const urls = new Map<string, string>();
  for (const r of data ?? []) {
    if (!r.error && r.path && r.signedUrl) urls.set(r.path, r.signedUrl);
  }
  return urls;
}
