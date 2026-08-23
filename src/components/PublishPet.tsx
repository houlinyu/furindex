import { publishPet, unpublishPet } from "@/app/community-actions";
import { SPECIES_EMOJI } from "@/lib/format";
import type { CommunityPet, Pet } from "@/lib/types";

/**
 * Publishing copies name/species/breed into community_pets. It never links the
 * health record — see the schema comment on community_pets.
 */
export default function PublishPet({
  pets,
  alreadyPublished,
}: {
  pets: Pet[];
  alreadyPublished: CommunityPet[];
}) {
  const publishedSourceIds = new Set(
    alreadyPublished.map((p) => p.source_pet_id).filter(Boolean)
  );
  const unpublished = pets.filter((p) => !publishedSourceIds.has(p.id));

  if (pets.length === 0) return null;

  return (
    <div className="card p-4">
      <h2 className="text-sm font-medium">Your pets in the community</h2>
      <p className="muted mt-1 text-xs">
        Only the name, species and breed are shared. Health records never are.
      </p>

      {alreadyPublished.length > 0 && (
        <ul className="mt-3 space-y-2">
          {alreadyPublished.map((p) => (
            <li key={p.id} className="flex items-center gap-2 text-sm">
              <span>{p.avatar_emoji || SPECIES_EMOJI[p.species]}</span>
              <span className="flex-1 truncate">{p.name}</span>
              <form action={unpublishPet}>
                <input type="hidden" name="community_pet_id" value={p.id} />
                <button className="inline-flex min-h-11 items-center muted text-xs underline underline-offset-4 hover:text-red-600 dark:hover:text-red-400">
                  Remove
                </button>
              </form>
            </li>
          ))}
        </ul>
      )}

      {unpublished.length > 0 && (
        <div className="mt-4 space-y-2 border-t border-[var(--border)] pt-3">
          {unpublished.map((p) => (
            <form key={p.id} action={publishPet} className="flex items-center gap-2">
              <input type="hidden" name="source_pet_id" value={p.id} />
              <span>{SPECIES_EMOJI[p.species]}</span>
              <span className="flex-1 truncate text-sm">{p.name}</span>
              <input
                name="bio"
                placeholder="One line about them (optional)"
                maxLength={280}
                className="hidden w-56 rounded-lg border border-[var(--border)] bg-transparent px-2 py-1 text-xs outline-none focus:border-brand-500 sm:block"
              />
              <button className="inline-flex min-h-11 items-center rounded-lg border border-[var(--border)] px-3 py-1 text-xs hover:border-brand-500 hover:text-[var(--brand-text)]">
                Publish
              </button>
            </form>
          ))}
        </div>
      )}
    </div>
  );
}
