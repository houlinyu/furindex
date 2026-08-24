
-- ============================================================================
-- Guided health check + wellbeing notes (Block 4, screens 4.2 and 4.3).
-- Added 2026-08-23. PURELY ADDITIVE — four new enums, three new tables, their
-- indexes and one policy each. Nothing is altered, nothing is dropped.
--
-- WHAT THIS IS, AND WHAT IT DELIBERATELY IS NOT: this is the owner's own
-- record of what they could see on a given day. It is not an assessment, a
-- score, or a triage. Every judgement stored here was made by the owner and is
-- stored as theirs — hence `self_assessment`, not `status`, and hence no
-- severity, no ranking and no derived "health score" column anywhere below.
-- Adding one later would change what this table means to the person who filled
-- it in, which is not a change a migration gets to make quietly.
-- ============================================================================

-- The nine parts of the guided check. Fixed rather than free text: the whole
-- point of the checklist is that "eyes" means the same thing in March as it did
-- in January, so a photo taken now can be put beside the one from last time.
do $$ begin
  create type health_check_part as enum
    ('eyes','mouth','ears','paws','coat','nose','poop','gait','behaviour');
exception when duplicate_object then null; end $$;

-- What the attached file actually is. Derived from the file's MIME type at
-- upload, not from what the card asked for — an owner who sends a still of a
-- limp instead of a clip has still recorded something worth keeping.
do $$ begin
  create type health_capture_type as enum ('photo','video','audio');
exception when duplicate_object then null; end $$;

-- The owner's own read, in their words, and the only judgement in this schema.
-- 'not_sure' is a first-class answer, not a missing one: an owner who can't
-- tell has told us something real, and forcing a binary would manufacture a
-- confidence nobody has. Null (no row, or a row with no assessment) means the
-- part was skipped, which is also fine and is never counted against anyone.
do $$ begin
  create type health_self_assessment as enum ('looks_normal','not_sure','looks_off');
exception when duplicate_object then null; end $$;

-- Reserved for a later review pass. THE RULE, from the Block 4 spec, verbatim:
-- any AI-suggested flag is surfaced as "worth a second look" — **never**
-- auto-labelled as a diagnosis or symptom without the owner (or, later, a vet)
-- confirming.
--
-- So: 'flagged' here means "something suggested a second look", it does NOT
-- mean "this pet has a problem", and nothing may render it as one. Today every
-- row is 'pending' and nothing writes any other value — no model runs against
-- this table, and the UI says nothing about review, because implying a review
-- that has not happened would be the same lie in the other direction.
do $$ begin
  create type health_ai_review_status as enum ('pending','reviewed','flagged');
exception when duplicate_object then null; end $$;

-- One dated session per pet. The session exists so that nine parts captured
-- across one morning read as one check rather than nine unrelated photos, and
-- so a later "compare with last time" has something to compare.
create table if not exists public.health_checks (
  id          uuid primary key default gen_random_uuid(),
  pet_id      uuid not null references public.pets(id) on delete cascade,
  owner_id    uuid not null references auth.users(id) on delete cascade,
  -- The owner's local day, sent by the browser. A check is a calendar event
  -- ("Sunday morning's check"), not an instant.
  checked_on  date not null default current_date,
  created_at  timestamptz not null default now()
);

-- One check per pet per day, which is what makes the session joinable-to
-- without the app having to track an "open" session in a cookie: the card's
-- save upserts on this key and either finds today's check or starts it. Also
-- makes the whole thing race-safe when someone taps two cards at once.
create unique index if not exists health_checks_pet_day_idx
  on public.health_checks(pet_id, checked_on);

create table if not exists public.health_check_items (
  id                uuid primary key default gen_random_uuid(),
  check_id          uuid not null references public.health_checks(id) on delete cascade,
  -- Denormalised from the parent check so RLS can be the same one-line policy
  -- as every other table here, and so a per-pet history query is one table.
  pet_id            uuid not null references public.pets(id) on delete cascade,
  owner_id          uuid not null references auth.users(id) on delete cascade,
  part              health_check_part not null,
  -- Object key in the existing private 'vet-reports' bucket, same
  -- <auth.uid()>/<uuid>.<ext> convention the storage policies key off.
  -- Nullable: an owner who writes "back paw still swollen" and attaches
  -- nothing has recorded something worth keeping.
  media_path        text,
  media_type        health_capture_type,
  captured_at       timestamptz not null default now(),
  -- Nullable on purpose. A part can be skipped, and an attachment with no
  -- opinion attached to it is a legitimate thing to save.
  self_assessment   health_self_assessment,
  -- The caption, or a transcribed voice note later.
  note              text,
  ai_review_status  health_ai_review_status not null default 'pending',
  created_at        timestamptz not null default now(),
  constraint health_check_items_media_pair check (
    (media_path is null) = (media_type is null)
  )
);

-- One row per part per check: re-taking the eye photo corrects the record for
-- that morning rather than stacking a second eyes row beside it.
create unique index if not exists health_check_items_part_idx
  on public.health_check_items(check_id, part);

-- "Show me this part's history" — the part-by-part view in 4.4.
create index if not exists health_check_items_pet_part_idx
  on public.health_check_items(pet_id, part, captured_at desc);

-- Screen 4.3. The qualitative layer: what the owner would say out loud if you
-- asked them how the animal has been. Kept apart from the guided check because
-- it is not about a body part and is written on days when no check happens.
create table if not exists public.wellbeing_notes (
  id              uuid primary key default gen_random_uuid(),
  pet_id          uuid not null references public.pets(id) on delete cascade,
  owner_id        uuid not null references auth.users(id) on delete cascade,
  body            text,
  -- Free-form text[] rather than an enum table: the six quick tags are a
  -- starting vocabulary, not a taxonomy, and the set will change more often
  -- than a migration is worth. Values are validated app-side against
  -- SENSATION_TAGS in src/lib/health-check.ts.
  sensation_tags  text[] not null default '{}',
  -- 1 = flat, 5 = full of it. Nullable: same reasoning as journal severity —
  -- a number nobody meant reads as evidence later.
  mood            smallint check (mood is null or mood between 1 and 5),
  -- Optional voice note, same bucket and path convention as above. Depends on
  -- the bucket allowing an audio MIME type; until it does, the UI does not
  -- offer this and the column stays null.
  voice_path      text,
  -- An instant, not a date: this is the value 4.4 plots against sensor data,
  -- and "energy 2 at 7am" and "energy 2 at 11pm" are different observations.
  recorded_at     timestamptz not null default now(),
  created_at      timestamptz not null default now(),
  -- A note that says nothing is not a note. At least one of the three ways of
  -- saying something must be present.
  constraint wellbeing_notes_not_empty check (
    body is not null or mood is not null or cardinality(sensation_tags) > 0
  )
);

create index if not exists wellbeing_notes_pet_idx
  on public.wellbeing_notes(pet_id, recorded_at desc);

alter table public.health_checks      enable row level security;
alter table public.health_check_items enable row level security;
alter table public.wellbeing_notes    enable row level security;

drop policy if exists "health_checks: owner all" on public.health_checks;
create policy "health_checks: owner all" on public.health_checks
  for all
  using (owner_id = auth.uid() and public.owns_pet(pet_id))
  with check (owner_id = auth.uid() and public.owns_pet(pet_id));

drop policy if exists "health_check_items: owner all" on public.health_check_items;
create policy "health_check_items: owner all" on public.health_check_items
  for all
  using (owner_id = auth.uid() and public.owns_pet(pet_id))
  with check (owner_id = auth.uid() and public.owns_pet(pet_id));

drop policy if exists "wellbeing_notes: owner all" on public.wellbeing_notes;
create policy "wellbeing_notes: owner all" on public.wellbeing_notes
  for all
  using (owner_id = auth.uid() and public.owns_pet(pet_id))
  with check (owner_id = auth.uid() and public.owns_pet(pet_id));
