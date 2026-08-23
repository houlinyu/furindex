import { createPost } from "@/app/community-actions";
import type { CommunityPet } from "@/lib/types";

export default function PostComposer({ pets }: { pets: CommunityPet[] }) {
  return (
    <form action={createPost} className="card space-y-3 p-4">
      <textarea
        name="body"
        required
        rows={3}
        maxLength={1000}
        placeholder="How's your animal today?"
        className="w-full resize-none rounded-lg border border-[var(--border)] bg-transparent px-3 py-2 text-sm outline-none focus:border-brand-500"
      />
      <div className="flex flex-wrap items-center gap-3">
        {pets.length > 0 && (
          <select
            name="community_pet_id"
            defaultValue=""
            className="rounded-lg border border-[var(--border)] bg-transparent px-2 py-1.5 text-xs outline-none focus:border-brand-500"
          >
            <option value="">No pet tagged</option>
            {pets.map((p) => (
              <option key={p.id} value={p.id}>
                {p.avatar_emoji} {p.name}
              </option>
            ))}
          </select>
        )}
        <button className="ml-auto rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700">
          Post
        </button>
      </div>
    </form>
  );
}
