import type { createClient } from "@/lib/supabase/server";
import type { Pet } from "@/lib/types";

/**
 * Pet photos live in the same private `vet-reports` bucket as scanned reports,
 * under the same `<auth.uid()>/…` prefix the storage policies key off. A second
 * bucket would mean a second set of policies to keep in step with those in
 * schema.sql, for no gain — the policy only ever looks at the first path segment.
 */
export const PET_PHOTO_BUCKET = "vet-reports";

/** `pets.photo_url` holds a storage PATH, never a URL — the bucket is private,
 *  so anything rendered has to be signed server-side first. */
const PHOTO_PREFIX = "pets";

/** Long enough to outlive a slow render and a bit of reading; short enough that
 *  a link copied out of devtools is dead before it can be passed around. */
const SIGNED_URL_TTL_SECONDS = 60 * 60;

type ServerClient = Awaited<ReturnType<typeof createClient>>;

/** Storage path for a fresh upload. Kept here so the browser uploader and the
 *  server-side prefix check can't drift apart. */
export function petPhotoPath(userId: string, ext: string): string {
  return `${userId}/${PHOTO_PREFIX}/${crypto.randomUUID()}.${ext}`;
}

/** Signed URL for one pet's photo, or null when there is no photo (or the
 *  object has gone missing — a broken <img> is worse than the emoji fallback). */
export async function signedPetPhotoUrl(
  supabase: ServerClient,
  path: string | null | undefined
): Promise<string | null> {
  if (!path) return null;
  const { data } = await supabase.storage
    .from(PET_PHOTO_BUCKET)
    .createSignedUrl(path, SIGNED_URL_TTL_SECONDS);
  return data?.signedUrl ?? null;
}

/**
 * Signed URLs for a list of pets, keyed by pet id. One round trip rather than
 * one per pet — a list page with eight animals would otherwise make eight calls.
 */
export async function signedPetPhotoUrls(
  supabase: ServerClient,
  pets: Pick<Pet, "id" | "photo_url">[]
): Promise<Record<string, string>> {
  const withPhoto = pets.filter((p): p is Pick<Pet, "id"> & { photo_url: string } =>
    Boolean(p.photo_url)
  );
  if (withPhoto.length === 0) return {};

  const { data } = await supabase.storage
    .from(PET_PHOTO_BUCKET)
    .createSignedUrls(
      withPhoto.map((p) => p.photo_url),
      SIGNED_URL_TTL_SECONDS
    );

  const byPath = new Map<string, string>();
  for (const row of data ?? []) {
    if (row.path && row.signedUrl && !row.error) byPath.set(row.path, row.signedUrl);
  }

  const urls: Record<string, string> = {};
  for (const p of withPhoto) {
    const url = byPath.get(p.photo_url);
    if (url) urls[p.id] = url;
  }
  return urls;
}
