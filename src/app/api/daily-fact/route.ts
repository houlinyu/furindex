import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { generateDailyFact } from "@/lib/daily-fact";
import type { Pet } from "@/lib/types";

export const maxDuration = 30;

/** Today's note — cached per owner per day, so a reload doesn't re-bill a call. */
export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  // Without a key there is no fact to generate. 204 lets the panel hide itself
  // quietly instead of logging a 500 in the console on every dashboard load.
  if (!process.env.ANTHROPIC_API_KEY) {
    return new NextResponse(null, { status: 204 });
  }

  const today = new Date().toISOString().slice(0, 10);

  const { data: cached } = await supabase
    .from("daily_facts")
    .select("*")
    .eq("fact_date", today)
    .maybeSingle();

  if (cached) {
    return NextResponse.json({ topic: cached.topic, body: cached.body, cached: true });
  }

  const { data: pets } = await supabase.from("pets").select("*").order("created_at");

  try {
    const fact = await generateDailyFact((pets ?? []) as Pet[], today);

    // Two tabs open on the same morning would both generate; upsert makes the
    // loser reuse the winner's row instead of erroring on the unique index.
    await supabase
      .from("daily_facts")
      .upsert(
        { owner_id: user.id, fact_date: today, body: fact.body, topic: fact.topic },
        { onConflict: "owner_id,fact_date" }
      );

    return NextResponse.json({ ...fact, cached: false });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Could not generate today's note";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
