import { createClient } from "@/lib/supabase/server";
import MediaGallery from "@/components/MediaGallery";
import type { MediaItem } from "@/lib/media";
import type { PetMedia } from "@/lib/types";

/** Long enough to watch a page of clips, short enough that a leaked URL dies fast. */
const SIGNED_URL_TTL = 60 * 60;

/**
 * Server half of the timeline: it turns object keys into signed URLs and hands
 * the rest to the client component that does the filtering.
 *
 * Signed in ONE batch rather than per row. A pet with three months of clips
 * would otherwise be three months of sequential round trips before the page
 * could render — the same reason JournalTimeline batches its thumbnails.
 */
export default async function MediaTimeline({ rows }: { rows: PetMedia[] }) {
  if (rows.length === 0) return null;

  const urls = await signAll(rows);
  const items: MediaItem[] = rows.map((r) => ({
    ...r,
    url: urls.get(r.storage_path) ?? null,
  }));

  return <MediaGallery items={items} />;
}

async function signAll(rows: PetMedia[]): Promise<Map<string, string>> {
  const paths = [...new Set(rows.map((r) => r.storage_path))];
  const supabase = await createClient();
  const { data } = await supabase.storage
    .from("vet-reports")
    .createSignedUrls(paths, SIGNED_URL_TTL);

  // A missing signature means no playback for that one row, not a broken page:
  // the caption and the tags are still the record, and losing an owner's
  // written note because a file went missing would be the worse failure.
  const urls = new Map<string, string>();
  for (const r of data ?? []) {
    if (!r.error && r.path && r.signedUrl) urls.set(r.path, r.signedUrl);
  }
  return urls;
}
