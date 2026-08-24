/**
 * Tries to break row-level security on the newly migrated tables, using two
 * real accounts and the Supabase client directly.
 *
 * Going through the client rather than the app is the whole point: the app's
 * own queries are already scoped by the code that writes them, so testing
 * through the UI mostly proves the UI asks the right questions. RLS is what
 * protects the data when something asks a WRONG question — a bug in a page, a
 * forged id, or anybody with the anon key, which is public by design.
 *
 * The app is live on the open internet and these tables hold medical records
 * and photographs, so "the policy looks right" is not the standard.
 *
 *   node scripts/rls-check.mjs [base-url]
 */
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join, resolve } from "node:path";

const repo = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const env = {};
for (const line of readFileSync(join(repo, ".env.local"), "utf8").split("\n")) {
  const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/.exec(line);
  if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, "");
}
const URL_ = env.NEXT_PUBLIC_SUPABASE_URL;
const ANON = env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

const fails = [];
const ok = (m) => console.log("  ok  " + m);
const bad = (m, d) => { console.log("  BAD " + m + (d ? " :: " + d : "")); fails.push(m); };

async function account(tag) {
  const c = createClient(URL_, ANON);
  const email = `rls-${tag}-${Date.now()}@furindex-test.com`;
  const { data, error } = await c.auth.signUp({ email, password: "rls-password-123" });
  if (error) throw new Error(`signUp ${tag}: ${error.message}`);
  if (!data.session) {
    const { error: e2 } = await c.auth.signInWithPassword({ email, password: "rls-password-123" });
    if (e2) throw new Error(`signIn ${tag}: ${e2.message}`);
  }
  const { data: { user } } = await c.auth.getUser();
  const { data: pet, error: petErr } = await c
    .from("pets")
    .insert({ owner_id: user.id, name: `Pet-${tag}`, species: "dog" })
    .select("id")
    .single();
  if (petErr) throw new Error(`createPet ${tag}: ${petErr.message}`);
  return { client: c, userId: user.id, petId: pet.id, email };
}

const A = await account("a");
const B = await account("b");
console.log(`two accounts, two pets\n`);

// Seed one row of each kind on B, so there is something for A to try to reach.
const seeded = {};
{
  const { data, error } = await B.client
    .from("pet_media")
    .insert({
      pet_id: B.petId, owner_id: B.userId,
      storage_path: `${B.userId}/secret.png`, kind: "photo",
      mime_type: "image/png", size_bytes: 123,
      caption: "B-PRIVATE-CAPTION", user_tags: ["private"], recorded_on: "2026-08-20",
    })
    .select("id").single();
  error ? bad("could not seed pet_media on B", error.message) : (seeded.pet_media = data.id);
}
{
  const { data, error } = await B.client
    .from("health_checks")
    .insert({ pet_id: B.petId, owner_id: B.userId, checked_on: "2026-08-20" })
    .select("id").single();
  if (error) bad("could not seed health_checks on B", error.message);
  else {
    seeded.health_checks = data.id;
    const { data: item, error: e } = await B.client
      .from("health_check_items")
      .insert({
        check_id: data.id, pet_id: B.petId, owner_id: B.userId,
        part: "eyes", self_assessment: "looks_off", note: "B-PRIVATE-NOTE",
      })
      .select("id").single();
    e ? bad("could not seed health_check_items on B", e.message) : (seeded.health_check_items = item.id);
  }
}
{
  const { data, error } = await B.client
    .from("wellbeing_notes")
    .insert({ pet_id: B.petId, owner_id: B.userId, body: "B-PRIVATE-BODY", sensation_tags: [], mood: 3 })
    .select("id").single();
  error ? bad("could not seed wellbeing_notes on B", error.message) : (seeded.wellbeing_notes = data.id);
}

const TABLES = ["pet_media", "health_checks", "health_check_items", "wellbeing_notes"];

console.log("\n--- can A READ B's rows? ---");
for (const t of TABLES) {
  const { data, error } = await A.client.from(t).select("*");
  const leaked = (data ?? []).filter((r) => r.owner_id === B.userId);
  leaked.length === 0
    ? ok(`${t}: A sees none of B's rows${error ? " (error: " + error.message + ")" : ""}`)
    : bad(`${t}: A READ ${leaked.length} of B's rows`, JSON.stringify(leaked[0]).slice(0, 160));
}

console.log("\n--- can A read a specific row of B's by id? ---");
for (const t of TABLES) {
  if (!seeded[t]) continue;
  const { data } = await A.client.from(t).select("*").eq("id", seeded[t]);
  (data ?? []).length === 0 ? ok(`${t}: direct id lookup returns nothing`) : bad(`${t}: direct id lookup LEAKED`);
}

console.log("\n--- can A UPDATE B's rows? ---");
for (const t of TABLES) {
  if (!seeded[t]) continue;
  const { data } = await A.client.from(t).update({ owner_id: A.userId }).eq("id", seeded[t]).select("id");
  (data ?? []).length === 0 ? ok(`${t}: update refused`) : bad(`${t}: A UPDATED B's row`);
}

console.log("\n--- can A DELETE B's rows? ---");
for (const t of TABLES) {
  if (!seeded[t]) continue;
  await A.client.from(t).delete().eq("id", seeded[t]);
  const { data } = await B.client.from(t).select("id").eq("id", seeded[t]);
  (data ?? []).length === 1 ? ok(`${t}: delete refused, B's row survives`) : bad(`${t}: A DELETED B's row`);
}

console.log("\n--- can A write a row ONTO B's pet? (owns_pet must stop this) ---");
{
  const { error } = await A.client.from("pet_media").insert({
    pet_id: B.petId, owner_id: A.userId,
    storage_path: `${A.userId}/x.png`, kind: "photo",
    mime_type: "image/png", size_bytes: 1, recorded_on: "2026-08-20",
  });
  error ? ok("pet_media: refused a row aimed at B's pet") : bad("A wrote a row onto B's pet");
}
{
  const { error } = await A.client.from("wellbeing_notes").insert({
    pet_id: B.petId, owner_id: A.userId, body: "injected", sensation_tags: [],
  });
  error ? ok("wellbeing_notes: refused a row aimed at B's pet") : bad("A wrote a note onto B's pet");
}

console.log("\n--- and the owner can still use their own data ---");
for (const t of TABLES) {
  if (!seeded[t]) continue;
  const { data, error } = await B.client.from(t).select("id").eq("id", seeded[t]);
  (data ?? []).length === 1
    ? ok(`${t}: B reads their own row`)
    : bad(`${t}: RLS also blocks the OWNER`, error?.message ?? "no row");
}

console.log(fails.length ? `\nFAILED: ${fails.join(" | ")}` : "\nrls: every cross-account attempt was refused");
process.exit(fails.length ? 1 : 0);
