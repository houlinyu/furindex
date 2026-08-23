import { joinCommunity } from "@/app/community-actions";
import type { CommunityProfile } from "@/lib/types";

const field =
  "w-full rounded-lg border border-[var(--border)] bg-transparent px-3 py-2 text-sm outline-none focus:border-brand-500";

export default function JoinCommunity({ existing }: { existing: CommunityProfile | null }) {
  return (
    <div className="card p-6">
      <div className="mb-4">
        <p className="font-medium">You&apos;re not in the community yet</p>
        <p className="muted mt-1 text-sm">
          Joining shows other signed-in owners your display name, anything you post,
          and any pets you choose to publish. It shares{" "}
          <span className="font-medium">none</span> of your health records —
          vaccinations, medications, weight, vet visits and uploaded documents stay
          private, always. You can leave at any time.
        </p>
      </div>

      <form action={joinCommunity} className="space-y-3">
        <div className="grid gap-3 sm:grid-cols-[5rem_1fr]">
          <div>
            <label htmlFor="avatar_emoji" className="mb-1 block text-sm font-medium">
              Icon
            </label>
            <input
              id="avatar_emoji"
              name="avatar_emoji"
              defaultValue={existing?.avatar_emoji ?? "🐾"}
              maxLength={8}
              className={`${field} text-center`}
            />
          </div>
          <div>
            <label htmlFor="display_name" className="mb-1 block text-sm font-medium">
              Display name <span className="text-red-500">*</span>
            </label>
            <input
              id="display_name"
              name="display_name"
              required
              minLength={2}
              maxLength={40}
              defaultValue={existing?.display_name ?? ""}
              className={field}
            />
          </div>
        </div>

        <div>
          <label htmlFor="city" className="mb-1 block text-sm font-medium">
            City <span className="muted text-xs">(optional)</span>
          </label>
          <input id="city" name="city" maxLength={60} defaultValue={existing?.city ?? ""} className={field} />
        </div>

        <div>
          <label htmlFor="bio" className="mb-1 block text-sm font-medium">
            About you <span className="muted text-xs">(optional)</span>
          </label>
          <textarea
            id="bio"
            name="bio"
            rows={2}
            maxLength={280}
            defaultValue={existing?.bio ?? ""}
            className={field}
          />
        </div>

        <button className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700">
          Join the community
        </button>
      </form>
    </div>
  );
}
