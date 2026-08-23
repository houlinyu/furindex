import AppShell from "@/components/AppShell";
import JoinCommunity from "@/components/JoinCommunity";
import PostComposer from "@/components/PostComposer";
import CommunityFeed from "@/components/CommunityFeed";
import PublishPet from "@/components/PublishPet";
import { redirect } from "next/navigation";
import { createClient, getUser } from "@/lib/supabase/server";
import { leaveCommunity } from "@/app/community-actions";
import { SPECIES_EMOJI } from "@/lib/format";
import type {
  CommunityPet,
  CommunityPost,
  CommunityProfile,
  Pet,
} from "@/lib/types";

export default async function CommunityPage() {
  const user = await getUser();
  // Middleware normally prevents this, but a session expiring between the
  // middleware check and this render would otherwise 500 instead of redirecting.
  if (!user) redirect("/login");
  const supabase = await createClient();

  const { data: me } = await supabase
    .from("community_profiles")
    .select("*")
    .eq("id", user.id)
    .maybeSingle();

  const profile = me as CommunityProfile | null;

  if (!profile?.is_public) {
    return (
      <AppShell email={user?.email}>
        <h1 className="text-2xl font-semibold tracking-tight">Community</h1>
        <p className="muted mb-6 mt-1 text-sm">
          Meet other owners and their animals.
        </p>
        <JoinCommunity existing={profile} />
      </AppShell>
    );
  }

  // Everything below is readable only because RLS allows signed-in users to see
  // rows belonging to owners who set is_public. No health table is touched.
  const [{ data: posts }, { data: pets }, { data: myPets }] = await Promise.all([
    supabase.from("community_posts").select("*").order("created_at", { ascending: false }).limit(50),
    supabase.from("community_pets").select("*").order("created_at", { ascending: false }).limit(60),
    supabase.from("pets").select("*").order("name"),
  ]);

  // Scoped to the posts actually on screen — this used to fetch every reaction
  // in the whole community on every page load and filter them in JS.
  const postIds = (posts ?? []).map((p) => p.id);
  const { data: reactions } = postIds.length
    ? await supabase.from("post_reactions").select("*").in("post_id", postIds)
    : { data: [] };

  const { data: profiles } = await supabase
    .from("community_profiles")
    .select("*")
    .eq("is_public", true);

  const profileById = new Map(
    ((profiles ?? []) as CommunityProfile[]).map((p) => [p.id, p])
  );
  const communityPets = (pets ?? []) as CommunityPet[];
  const minePublished = communityPets.filter((p) => p.owner_id === user.id);

  return (
    <AppShell email={user?.email}>
      <div className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight">Community</h1>
        <div className="mt-1 flex flex-wrap items-center gap-3">
          <p className="muted text-sm">
            Posting as {profile.avatar_emoji} {profile.display_name}
            {profile.city ? ` · ${profile.city}` : ""}
          </p>
          <form action={leaveCommunity}>
            <button className="muted text-xs underline underline-offset-4 hover:text-red-600">
              Leave the community
            </button>
          </form>
        </div>
      </div>

      <section className="mb-8">
        <PostComposer pets={minePublished} />
      </section>

      {communityPets.length > 0 && (
        <section className="mb-8">
          <h2 className="mb-3 text-sm font-medium uppercase tracking-wide muted">
            Pets around here
          </h2>
          <div className="flex gap-3 overflow-x-auto pb-2">
            {communityPets.map((p) => (
              <div key={p.id} className="card w-40 shrink-0 p-3 text-center">
                <div className="text-3xl">
                  {p.avatar_emoji || SPECIES_EMOJI[p.species] || "🐾"}
                </div>
                <p className="mt-1 truncate text-sm font-medium">{p.name}</p>
                <p className="muted truncate text-xs">
                  {p.breed ?? SPECIES_EMOJI[p.species]}
                </p>
                {p.bio && <p className="muted mt-1 line-clamp-3 text-xs">{p.bio}</p>}
              </div>
            ))}
          </div>
        </section>
      )}

      <section className="mb-8">
        <PublishPet
          pets={(myPets ?? []) as Pet[]}
          alreadyPublished={minePublished}
        />
      </section>

      <section>
        <h2 className="mb-3 text-sm font-medium uppercase tracking-wide muted">Feed</h2>
        <CommunityFeed
          posts={(posts ?? []) as CommunityPost[]}
          profiles={profileById}
          pets={new Map(communityPets.map((p) => [p.id, p]))}
          reactions={(reactions ?? []) as { post_id: string; user_id: string; emoji: string }[]}
          currentUserId={user.id}
        />
      </section>
    </AppShell>
  );
}
