"use client";

import { useTransition } from "react";
import { deletePost, toggleReaction } from "@/app/community-actions";
import { REACTION_EMOJI, type CommunityPet, type CommunityPost, type CommunityProfile } from "@/lib/types";

type Reaction = { post_id: string; user_id: string; emoji: string };

export default function CommunityFeed({
  posts,
  profiles,
  pets,
  reactions,
  currentUserId,
}: {
  posts: CommunityPost[];
  profiles: Map<string, CommunityProfile>;
  pets: Map<string, CommunityPet>;
  reactions: Reaction[];
  currentUserId: string;
}) {
  const [pending, startTransition] = useTransition();

  if (posts.length === 0) {
    return (
      <p className="card muted px-4 py-10 text-center text-sm">
        No posts yet. This is where owners share how their animals are getting on —
        a photo, a small win, a question about something odd. Yours can be the
        first.
      </p>
    );
  }

  return (
    <ul className="space-y-3">
      {posts.map((post) => {
        const author = profiles.get(post.author_id);
        const pet = post.community_pet_id ? pets.get(post.community_pet_id) : null;
        const mine = post.author_id === currentUserId;
        const forPost = reactions.filter((r) => r.post_id === post.id);

        return (
          <li key={post.id} className="card p-4">
            <div className="flex items-start gap-3">
              <span className="text-2xl">{author?.avatar_emoji ?? "🐾"}</span>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium">
                  {author?.display_name ?? "Someone"}
                  {pet && <span className="muted font-normal"> · with {pet.name}</span>}
                </p>
                <p className="muted text-xs">
                  {new Date(post.created_at).toLocaleString(undefined, {
                    month: "short",
                    day: "numeric",
                    hour: "numeric",
                    minute: "2-digit",
                  })}
                  {author?.city ? ` · ${author.city}` : ""}
                </p>
                <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed">{post.body}</p>

                <div className="mt-3 flex flex-wrap items-center gap-1">
                  {REACTION_EMOJI.map((emoji) => {
                    const count = forPost.filter((r) => r.emoji === emoji).length;
                    const active = forPost.some(
                      (r) => r.emoji === emoji && r.user_id === currentUserId
                    );
                    return (
                      <button
                        key={emoji}
                        onClick={() =>
                          startTransition(async () => {
                            await toggleReaction(post.id, emoji);
                          })
                        }
                        className={`rounded-full border px-2 py-0.5 text-xs transition ${
                          active
                            ? "border-brand-500 bg-brand-50/60 text-brand-700"
                            : "muted border-[var(--border)] hover:border-brand-300"
                        }`}
                        disabled={pending}
                        aria-pressed={active}
                        aria-label={`React ${emoji}`}
                      >
                        {emoji} {count > 0 && count}
                      </button>
                    );
                  })}

                  {mine && (
                    <form
                      action={deletePost}
                      className="ml-auto"
                    >
                      <input type="hidden" name="post_id" value={post.id} />
                      <button className="inline-flex min-h-11 items-center muted text-xs underline underline-offset-4 hover:text-red-600 dark:hover:text-red-400">
                        Delete
                      </button>
                    </form>
                  )}
                </div>
              </div>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
