import { SPECIES_EMOJI, SPECIES_LABEL } from "@/lib/format";
import type { Pet } from "@/lib/types";

type Size = "sm" | "md" | "lg";

/** The emoji sizes are the ones already used at each call site, so swapping a
 *  bare <span> for this component doesn't shift any layout. */
const EMOJI_SIZE: Record<Size, string> = {
  sm: "text-2xl",
  md: "text-3xl",
  lg: "text-5xl",
};

/** Photos are square-cropped to roughly the emoji's optical size at each scale. */
const PHOTO_SIZE: Record<Size, string> = {
  sm: "h-10 w-10",
  md: "h-14 w-14",
  lg: "h-20 w-20",
};

/**
 * A pet's face: the uploaded photo when there is one, the species emoji when
 * there isn't. Drop-in replacement for the bare emoji spans.
 *
 * `photoUrl` must be a signed URL — see signedPetPhotoUrl(). Passing the raw
 * `pets.photo_url` would render a 400 from the private bucket.
 */
export default function PetAvatar({
  pet,
  photoUrl = null,
  size = "md",
  className = "",
}: {
  pet: Pick<Pet, "name" | "species">;
  photoUrl?: string | null;
  size?: Size;
  className?: string;
}) {
  if (!photoUrl) {
    return (
      <span
        role="img"
        aria-label={`${SPECIES_LABEL[pet.species] ?? "Pet"} — no photo yet`}
        className={`shrink-0 leading-none ${EMOJI_SIZE[size]} ${className}`}
      >
        {SPECIES_EMOJI[pet.species] ?? "🐾"}
      </span>
    );
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element -- signed Supabase URLs
    // are single-use and time-limited, so next/image's optimiser cache would
    // serve stale 400s and every host would need a remotePatterns entry.
    <img
      src={photoUrl}
      alt={`Photo of ${pet.name}`}
      className={`shrink-0 rounded-full border border-[var(--border)] object-cover ${PHOTO_SIZE[size]} ${className}`}
    />
  );
}
