
-- ============================================================================
-- Media history (added 2026-08-23). PURELY ADDITIVE.
--
-- Photos, short videos and voice notes attached to a pet, on one chronological
-- timeline. The point of the voice note in particular: an owner says "she's
-- been going to her water bowl more" and no tag vocabulary anyone could design
-- would have had a checkbox for that. Free text and audio capture the thing
-- the owner actually noticed; the tags are only there to make it findable
-- again six months later.
-- ============================================================================

do $$ begin
  create type media_kind as enum ('photo','video','audio');
exception when duplicate_object then null; end $$;

create table if not exists public.pet_media (
  id            uuid primary key default gen_random_uuid(),
  -- Not nullable, unlike documents.pet_id: a clip of a limp is meaningless
  -- without knowing whose limp it is, and there is no extraction step here
  -- that could work the pet out afterwards.
  pet_id        uuid not null references public.pets(id) on delete cascade,
  owner_id      uuid not null references auth.users(id) on delete cascade,
  -- Object key in the existing private 'vet-reports' bucket, same
  -- <auth.uid()>/<uuid>.<ext> convention the storage policies key off.
  -- Unique so a failed row insert can never leave a path that is both
  -- referenced and re-uploadable.
  storage_path  text not null unique,
  kind          media_kind not null,
  mime_type     text not null,
  size_bytes    integer not null check (size_bytes > 0),
  -- Seconds, for video and audio. Null for a photo, and ALSO null when the
  -- browser could not decode a length — a MediaRecorder blob commonly reports
  -- Infinity for its own duration. An unknown length is not a zero-length clip,
  -- so it is stored as unknown rather than as 0.
  duration_seconds numeric(7,2) check (duration_seconds is null or duration_seconds > 0),
  -- The free-text half, and the important half. Deliberately long: "she's been
  -- going to her water bowl more" is worth more than any tag, and truncating an
  -- owner mid-sentence is how you teach them not to bother writing it.
  caption       text check (caption is null or length(caption) <= 2000),
  -- Tags the OWNER applied. Lower-cased and de-duplicated by the app.
  user_tags     text[] not null default '{}',
  -- Reserved for machine-derived tags (gait analysis from video, a transcript
  -- of a voice note turned into symptom keywords). NOTHING WRITES THIS YET and
  -- no UI reads it — it exists so that adding it later is a migration of code,
  -- not of data.
  --
  -- RULE, when something does eventually populate it: never auto-apply
  -- AI-derived tags as fact. They stay in this column, visibly separate from
  -- user_tags, shown as a suggestion the owner accepts or ignores — the same
  -- posture documents.extracted already takes, where nothing reaches the health
  -- tables until the owner confirms it. A machine guess that is rendered
  -- indistinguishably from an owner's own observation becomes evidence in a
  -- vet's hands, and neither we nor the owner can tell it apart afterwards.
  ai_tags       text[] not null default '{}',
  -- The day the thing happened, which is not the day it was uploaded: people
  -- film the limp on Sunday and get round to the app on Wednesday.
  recorded_on   date not null default current_date,
  created_at    timestamptz not null default now()
);

-- The timeline's only question: this pet's media, newest first. created_at is
-- the tiebreak because several clips commonly share a day and without it their
-- order flips between renders (the same bug the journal index fixed).
create index if not exists pet_media_pet_idx
  on public.pet_media(pet_id, recorded_on desc, created_at desc);
-- Tag filtering is an array containment test (user_tags @> '{limping}'), which
-- a btree cannot serve at all.
create index if not exists pet_media_user_tags_idx
  on public.pet_media using gin (user_tags);

alter table public.pet_media enable row level security;

drop policy if exists "pet_media: owner all" on public.pet_media;
create policy "pet_media: owner all" on public.pet_media
  for all
  using (owner_id = auth.uid() and public.owns_pet(pet_id))
  with check (owner_id = auth.uid() and public.owns_pet(pet_id));

-- --------------------------------------------------- storage, widened -------
-- ADDITIVE UPDATE, not a re-create. The 'vet-reports' bucket has live objects
-- in it; `delete from storage.buckets` would take them with it, and re-running
-- the INSERT above with a different array would silently make every existing
-- PDF's type un-uploadable. So: read the current list, union the new types onto
-- it, write it back.
--
-- This statement sits AFTER the original insert-on-conflict on purpose. Running
-- this file top to bottom resets allowed_mime_types to the pdf/image four and
-- then widens it again; the order is what makes a full re-run idempotent.
--
-- A null allowed_mime_types means "no restriction" in Supabase storage, so it is
-- left alone — unioning onto null and writing back an array would TIGHTEN the
-- bucket, which is the opposite of what this migration is for.
update storage.buckets
set
  allowed_mime_types = case
    when allowed_mime_types is null then null
    else (
      select array_agg(distinct m order by m)
      from unnest(
        allowed_mime_types || array[
          -- Video: what phones actually produce. mp4/h264 from both platforms,
          -- quicktime because that is what an iPhone hands over unconverted,
          -- webm because that is what a desktop browser records, 3gpp because
          -- older Android cameras still emit it.
          'video/mp4','video/quicktime','video/webm','video/3gpp',
          -- Audio: webm/opus is Chrome's MediaRecorder output, mp4/aac is
          -- Safari's, ogg is Firefox's; mpeg/wav/aac/x-m4a cover a file an
          -- owner picks from their phone rather than records here.
          'audio/webm','audio/ogg','audio/mpeg','audio/mp4','audio/aac',
          'audio/wav','audio/x-wav','audio/x-m4a'
        ]::text[]
      ) as m
    )
  end,
  -- 100 MB. Sits deliberately ABOVE the app's own caps (50 MB video, 15 MB
  -- audio, 10 MB photo — see src/lib/media.ts) so that the honest, specific
  -- client-side message is always the one an owner hits, and storage never
  -- rejects something the UI said was fine. Raising the app caps later does not
  -- need another migration.
  file_size_limit = greatest(coalesce(file_size_limit, 0), 104857600)
where id = 'vet-reports';

-- The three storage policies above are keyed on bucket_id + the <uid>/ prefix
-- only, so they already cover these new object types. Nothing to add.
