"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { removePetPhoto, setPetPhoto } from "@/app/pet-actions";
import { PET_PHOTO_BUCKET, petPhotoPath } from "@/lib/photos";
import PetAvatar from "@/components/PetAvatar";
import type { Pet } from "@/lib/types";

const EXT: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
};
const ACCEPT = Object.keys(EXT).join(",");

// Same ceiling as an image in ReportUpload: the bucket's 20 MB is sized for
// PDFs, and a modern phone photo clears 5 MB without trying.
const MAX_BYTES = 4.5 * 1024 * 1024;

/**
 * Uploads straight from the browser to the private bucket, then asks the server
 * to record the path. Going via a server action would push the whole file
 * through the Next server for no benefit.
 */
export default function PetPhotoUpload({
  pet,
  photoUrl = null,
}: {
  pet: Pick<Pet, "id" | "name" | "species">;
  /** Signed URL for the current photo, if any. */
  photoUrl?: string | null;
}) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [url, setUrl] = useState<string | null>(photoUrl);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleFile(file: File) {
    setError(null);

    if (!EXT[file.type]) {
      setError("Choose a photo — PNG, JPG or WebP.");
      return;
    }
    if (file.size === 0) {
      setError("That file is empty.");
      return;
    }
    if (file.size > MAX_BYTES) {
      setError(
        `That photo is ${(file.size / 1e6).toFixed(1)} MB — images must be under 4.5 MB. Most phones let you share a smaller copy, or take the shot again at lower resolution.`
      );
      return;
    }

    setBusy(true);
    try {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error("Your session expired — sign in again.");

      const path = petPhotoPath(user.id, EXT[file.type]);
      const { error: upErr } = await supabase.storage
        .from(PET_PHOTO_BUCKET)
        .upload(path, file, { contentType: file.type, upsert: false });
      if (upErr) throw new Error(upErr.message);

      const res = await setPetPhoto({ petId: pet.id, storagePath: path });
      if (res.error) {
        // The file is in the bucket but nothing references it. Without this it
        // would sit there forever, counting against storage and invisible.
        await supabase.storage.from(PET_PHOTO_BUCKET).remove([path]);
        throw new Error(res.error);
      }

      setUrl(res.photoUrl ?? null);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setBusy(false);
    }
  }

  async function handleRemove() {
    setError(null);
    setBusy(true);
    try {
      const res = await removePetPhoto(pet.id);
      if (res.error) throw new Error(res.error);
      setUrl(null);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't remove that photo");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      {/* A real label bound to the file input — clicking it opens the picker
          natively, so the styled button below is an affordance, not the only way in. */}
      <label htmlFor="pet-photo" className="mb-1 block w-fit text-sm font-medium">
        Photo
      </label>

      <div className="flex items-center gap-4">
        <PetAvatar pet={pet} photoUrl={url} size="lg" />

        <div className="min-w-0">
          <input
            ref={inputRef}
            id="pet-photo"
            type="file"
            accept={ACCEPT}
            className="sr-only"
            disabled={busy}
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) handleFile(file);
              // Let the same file be re-picked after a failure.
              e.target.value = "";
            }}
          />

          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              disabled={busy}
              onClick={() => inputRef.current?.click()}
              className="rounded-lg border border-[var(--border)] px-3 py-1.5 text-xs font-medium hover:border-brand-500 hover:text-brand-600 disabled:opacity-60"
            >
              {busy ? "Working…" : url ? "Replace photo" : "Upload a photo"}
            </button>

            {url && !busy && (
              <button
                type="button"
                onClick={handleRemove}
                className="muted text-xs underline underline-offset-4 hover:text-red-600"
              >
                Remove
              </button>
            )}
          </div>

          <p className="muted mt-1.5 text-xs leading-relaxed">
            PNG, JPG or WebP up to 4.5 MB. Saved as soon as you pick it — you
            don&apos;t need to submit the form.
          </p>
        </div>
      </div>

      {error && (
        <p className="mt-2 text-sm text-red-600" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
