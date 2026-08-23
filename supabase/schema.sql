-- ============================================================================
-- sundai-pet-health : schema + Row Level Security
-- Run this once in the Supabase SQL editor (Dashboard -> SQL -> New query).
-- Every table is owner-scoped: a signed-in user can only ever see their own
-- pets and the records hanging off them. There is no cross-user sharing yet.
-- ============================================================================

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------- enums ----
do $$ begin
  create type pet_species as enum ('dog','cat','bird','rabbit','reptile','small_mammal','other');
exception when duplicate_object then null; end $$;

do $$ begin
  create type pet_sex as enum ('male','female','unknown');
exception when duplicate_object then null; end $$;

-- ------------------------------------------------------------- profiles ----
create table if not exists public.profiles (
  id          uuid primary key references auth.users(id) on delete cascade,
  full_name   text,
  created_at  timestamptz not null default now()
);

-- Auto-create a profile row the moment someone signs up.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, full_name)
  values (new.id, new.raw_user_meta_data->>'full_name')
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ----------------------------------------------------------------- pets ----
create table if not exists public.pets (
  id            uuid primary key default gen_random_uuid(),
  owner_id      uuid not null references auth.users(id) on delete cascade,
  name          text not null check (length(trim(name)) > 0),
  species       pet_species not null default 'dog',
  breed         text,
  sex           pet_sex not null default 'unknown',
  birth_date    date check (birth_date <= current_date),
  microchip_id  text,
  photo_url     text,
  notes         text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index if not exists pets_owner_id_idx on public.pets(owner_id);

-- --------------------------------------------------------- vaccinations ----
create table if not exists public.vaccinations (
  id              uuid primary key default gen_random_uuid(),
  pet_id          uuid not null references public.pets(id) on delete cascade,
  name            text not null,
  administered_on date not null,
  due_on          date,
  vet_clinic      text,
  lot_number      text,
  notes           text,
  created_at      timestamptz not null default now(),
  constraint due_after_administered check (due_on is null or due_on >= administered_on)
);
create index if not exists vaccinations_pet_id_idx on public.vaccinations(pet_id);
create index if not exists vaccinations_due_on_idx on public.vaccinations(due_on);

-- ---------------------------------------------------------- medications ----
create table if not exists public.medications (
  id          uuid primary key default gen_random_uuid(),
  pet_id      uuid not null references public.pets(id) on delete cascade,
  name        text not null,
  dosage      text,
  frequency   text,
  start_date  date not null default current_date,
  end_date    date,
  notes       text,
  created_at  timestamptz not null default now(),
  constraint end_after_start check (end_date is null or end_date >= start_date)
);
create index if not exists medications_pet_id_idx on public.medications(pet_id);

-- ---------------------------------------------------------- weight_logs ----
create table if not exists public.weight_logs (
  id           uuid primary key default gen_random_uuid(),
  pet_id       uuid not null references public.pets(id) on delete cascade,
  recorded_on  date not null default current_date,
  weight_kg    numeric(6,2) not null check (weight_kg > 0 and weight_kg < 1000),
  created_at   timestamptz not null default now(),
  unique (pet_id, recorded_on)
);
create index if not exists weight_logs_pet_id_idx on public.weight_logs(pet_id, recorded_on desc);

-- ------------------------------------------------------------ vet_visits ---
create table if not exists public.vet_visits (
  id          uuid primary key default gen_random_uuid(),
  pet_id      uuid not null references public.pets(id) on delete cascade,
  visited_on  date not null default current_date,
  clinic      text,
  reason      text,
  diagnosis   text,
  notes       text,
  cost_cents  integer check (cost_cents is null or cost_cents >= 0),
  created_at  timestamptz not null default now()
);
create index if not exists vet_visits_pet_id_idx on public.vet_visits(pet_id, visited_on desc);

-- ------------------------------------------------------- updated_at glue ---
create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end;
$$;

drop trigger if exists pets_touch_updated_at on public.pets;
create trigger pets_touch_updated_at
  before update on public.pets
  for each row execute function public.touch_updated_at();

-- ============================================================================
-- Row Level Security
-- ============================================================================

alter table public.profiles     enable row level security;
alter table public.pets         enable row level security;
alter table public.vaccinations enable row level security;
alter table public.medications  enable row level security;
alter table public.weight_logs  enable row level security;
alter table public.vet_visits   enable row level security;

-- Does the current user own this pet? Used by every child-table policy.
create or replace function public.owns_pet(p_pet_id uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1 from public.pets
    where id = p_pet_id and owner_id = auth.uid()
  );
$$;

-- profiles: you see and edit only your own row.
drop policy if exists "profiles: self read"   on public.profiles;
drop policy if exists "profiles: self write"  on public.profiles;
create policy "profiles: self read"  on public.profiles for select using (id = auth.uid());
create policy "profiles: self write" on public.profiles for update using (id = auth.uid()) with check (id = auth.uid());

-- pets: full CRUD, scoped to owner.
drop policy if exists "pets: owner all" on public.pets;
create policy "pets: owner all" on public.pets
  for all
  using (owner_id = auth.uid())
  with check (owner_id = auth.uid());

-- Child tables: reachable only through a pet you own.
do $$
declare t text;
begin
  foreach t in array array['vaccinations','medications','weight_logs','vet_visits'] loop
    execute format('drop policy if exists %I on public.%I', t || ': owner all', t);
    execute format($f$
      create policy %I on public.%I
        for all
        using (public.owns_pet(pet_id))
        with check (public.owns_pet(pet_id))
    $f$, t || ': owner all', t);
  end loop;
end $$;

-- ============================================================================
-- Sanity check: as an anonymous caller these must all return 0 rows, not error.
--   set role anon; select count(*) from public.pets; reset role;
-- ============================================================================

-- ============================================================================
-- Vet report ingestion (added 2026-08-23)
-- Owners upload a PDF/photo of a vet report; Claude extracts structured records
-- from it; the owner reviews and confirms before anything is written to the
-- health tables. Nothing here writes to vaccinations/medications/etc. directly.
-- ============================================================================

do $$ begin
  create type document_status as enum ('uploaded','extracting','extracted','failed','applied');
exception when duplicate_object then null; end $$;

create table if not exists public.documents (
  id               uuid primary key default gen_random_uuid(),
  -- Nullable: a report can be uploaded before the pet exists. The extracted
  -- pet identity is then used to create one, and this is backfilled.
  pet_id           uuid references public.pets(id) on delete cascade,
  owner_id         uuid not null references auth.users(id) on delete cascade,
  storage_path     text not null unique,
  filename         text not null,
  mime_type        text not null,
  size_bytes       integer not null check (size_bytes > 0),
  status           document_status not null default 'uploaded',
  -- Claude's structured read of the document. Never trusted as fact until the
  -- owner confirms it — see documents.applied_at.
  extracted        jsonb,
  extraction_error text,
  applied_at       timestamptz,
  created_at       timestamptz not null default now()
);
create index if not exists documents_pet_id_idx on public.documents(pet_id, created_at desc);
create index if not exists documents_unfiled_idx on public.documents(owner_id, created_at desc)
  where pet_id is null;
create index if not exists documents_owner_id_idx on public.documents(owner_id);

alter table public.documents enable row level security;

drop policy if exists "documents: owner all" on public.documents;
create policy "documents: owner all" on public.documents
  for all
  using (owner_id = auth.uid() and (pet_id is null or public.owns_pet(pet_id)))
  with check (owner_id = auth.uid() and (pet_id is null or public.owns_pet(pet_id)));

-- ----------------------------------------------------------- storage --------
-- Private bucket. Path convention is <auth.uid()>/<uuid>.<ext>, and
-- the policies below key off that first path segment — change the convention
-- and you silently change who can read what.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'vet-reports', 'vet-reports', false, 20971520,
  array['application/pdf','image/png','image/jpeg','image/webp']
)
on conflict (id) do update
  set file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "vet-reports: owner read"   on storage.objects;
drop policy if exists "vet-reports: owner insert" on storage.objects;
drop policy if exists "vet-reports: owner delete" on storage.objects;

create policy "vet-reports: owner read" on storage.objects
  for select using (
    bucket_id = 'vet-reports' and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "vet-reports: owner insert" on storage.objects
  for insert with check (
    bucket_id = 'vet-reports' and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "vet-reports: owner delete" on storage.objects
  for delete using (
    bucket_id = 'vet-reports' and (storage.foldername(name))[1] = auth.uid()::text
  );

-- ============================================================================
-- User-defined fields (added 2026-08-23)
--
-- The four clinical tables above are fixed on purpose: reminders need a sortable
-- due_on, the trend chart needs a numeric weight. Everything else an owner wants
-- to track is defined by the owner, not by us. Extraction proposes new field
-- definitions from what it finds in a document; the owner accepts or ignores
-- them, and the schema grows from their own records.
-- ============================================================================

do $$ begin
  create type field_type as enum ('text','number','date','boolean');
exception when duplicate_object then null; end $$;

create table if not exists public.field_definitions (
  id          uuid primary key default gen_random_uuid(),
  owner_id    uuid not null references auth.users(id) on delete cascade,
  label       text not null check (length(trim(label)) > 0),
  field_type  field_type not null default 'text',
  unit        text,
  -- 'pet'   : one current value per pet (microchip registry, insurance policy)
  -- 'event' : a value with a date, many per pet (blood glucose, litter weight)
  scope       text not null default 'event' check (scope in ('pet','event')),
  created_at  timestamptz not null default now(),
  unique (owner_id, label)
);
create index if not exists field_definitions_owner_idx on public.field_definitions(owner_id);

create table if not exists public.custom_values (
  id            uuid primary key default gen_random_uuid(),
  owner_id      uuid not null references auth.users(id) on delete cascade,
  pet_id        uuid not null references public.pets(id) on delete cascade,
  definition_id uuid not null references public.field_definitions(id) on delete cascade,
  -- Provenance: which uploaded report this came from, if any. Null = typed by hand.
  document_id   uuid references public.documents(id) on delete set null,
  recorded_on   date not null default current_date,
  value_text    text,
  value_number  numeric,
  value_date    date,
  value_bool    boolean,
  created_at    timestamptz not null default now(),
  -- Exactly one value column must be populated, matching the definition's type.
  constraint one_value_only check (
    (value_text is not null)::int + (value_number is not null)::int +
    (value_date is not null)::int + (value_bool is not null)::int = 1
  )
);
create index if not exists custom_values_pet_idx on public.custom_values(pet_id, recorded_on desc);
create index if not exists custom_values_def_idx on public.custom_values(definition_id);

alter table public.field_definitions enable row level security;
alter table public.custom_values     enable row level security;

drop policy if exists "field_definitions: owner all" on public.field_definitions;
create policy "field_definitions: owner all" on public.field_definitions
  for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());

drop policy if exists "custom_values: owner all" on public.custom_values;
create policy "custom_values: owner all" on public.custom_values
  for all
  using (owner_id = auth.uid() and public.owns_pet(pet_id))
  with check (owner_id = auth.uid() and public.owns_pet(pet_id));

-- ============================================================================
-- Daily fact panel (added 2026-08-23)
-- One generated fact per owner per day, tailored to the species/ages they keep.
-- Cached so a returning visit doesn't re-bill an API call.
-- ============================================================================

create table if not exists public.daily_facts (
  id         uuid primary key default gen_random_uuid(),
  owner_id   uuid not null references auth.users(id) on delete cascade,
  fact_date  date not null default current_date,
  body       text not null,
  topic      text,
  created_at timestamptz not null default now(),
  unique (owner_id, fact_date)
);

alter table public.daily_facts enable row level security;
drop policy if exists "daily_facts: owner all" on public.daily_facts;
create policy "daily_facts: owner all" on public.daily_facts
  for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());

-- ============================================================================
-- Community (added 2026-08-23)
--
-- READ THIS BEFORE ADDING A POLICY HERE.
--
-- Every other table in this schema is strictly owner-only. These three are the
-- only tables any other user can read, and they are readable ONLY by signed-in
-- users, ONLY for rows their author explicitly chose to publish.
--
-- Health data never becomes community data. There is deliberately no join from
-- a post to vaccinations / medications / weight_logs / vet_visits / documents /
-- custom_values. If you want to let someone share a health detail, they type it
-- into the post body themselves — do not add a foreign key that does it for them.
-- ============================================================================

create table if not exists public.community_profiles (
  id           uuid primary key references auth.users(id) on delete cascade,
  display_name text not null check (length(trim(display_name)) between 2 and 40),
  bio          text check (length(bio) <= 280),
  avatar_emoji text default '🐾',
  city         text check (length(city) <= 60),
  -- Off by default. Joining the community is an action, not a consequence of
  -- signing up.
  is_public    boolean not null default false,
  created_at   timestamptz not null default now()
);

create table if not exists public.community_posts (
  id         uuid primary key default gen_random_uuid(),
  author_id  uuid not null references auth.users(id) on delete cascade,
  -- Denormalised on purpose: the pet's NAME, not a foreign key to pets. A join
  -- would make an owner-only row reachable from a public one.
  pet_name   text check (length(pet_name) <= 40),
  body       text not null check (length(trim(body)) between 1 and 1000),
  created_at timestamptz not null default now()
);
create index if not exists community_posts_recent_idx on public.community_posts(created_at desc);

create table if not exists public.post_reactions (
  post_id    uuid not null references public.community_posts(id) on delete cascade,
  user_id    uuid not null references auth.users(id) on delete cascade,
  emoji      text not null check (emoji in ('❤️','🐾','😂','💪','🙏')),
  created_at timestamptz not null default now(),
  primary key (post_id, user_id, emoji)
);

alter table public.community_profiles enable row level security;
alter table public.community_posts    enable row level security;
alter table public.post_reactions     enable row level security;

-- Profiles: your own row always; other people's only if they published it.
drop policy if exists "community_profiles: read public" on public.community_profiles;
drop policy if exists "community_profiles: self write"  on public.community_profiles;
drop policy if exists "community_profiles: self insert" on public.community_profiles;
create policy "community_profiles: read public" on public.community_profiles
  for select to authenticated using (is_public or id = auth.uid());
create policy "community_profiles: self insert" on public.community_profiles
  for insert to authenticated with check (id = auth.uid());
create policy "community_profiles: self write" on public.community_profiles
  for update to authenticated using (id = auth.uid()) with check (id = auth.uid());

-- Posts: readable by signed-in users, but only from authors who went public.
drop policy if exists "community_posts: read"       on public.community_posts;
drop policy if exists "community_posts: self write" on public.community_posts;
drop policy if exists "community_posts: self del"   on public.community_posts;
create policy "community_posts: read" on public.community_posts
  for select to authenticated using (
    author_id = auth.uid()
    or exists (
      select 1 from public.community_profiles p
      where p.id = community_posts.author_id and p.is_public
    )
  );
create policy "community_posts: self write" on public.community_posts
  for insert to authenticated with check (author_id = auth.uid());
create policy "community_posts: self del" on public.community_posts
  for delete to authenticated using (author_id = auth.uid());

-- Reactions: visible on any post you can see; you may only add/remove your own.
drop policy if exists "post_reactions: read"      on public.post_reactions;
drop policy if exists "post_reactions: self add"  on public.post_reactions;
drop policy if exists "post_reactions: self del"  on public.post_reactions;
create policy "post_reactions: read" on public.post_reactions
  for select to authenticated using (
    exists (select 1 from public.community_posts cp where cp.id = post_reactions.post_id)
  );
create policy "post_reactions: self add" on public.post_reactions
  for insert to authenticated with check (user_id = auth.uid());
create policy "post_reactions: self del" on public.post_reactions
  for delete to authenticated using (user_id = auth.uid());

-- ---------------------------------------------------------------------------
-- Community pet profiles.
--
-- A DELIBERATE COPY, not a view onto public.pets. An owner opts a pet into the
-- community by creating a row here with just the sociable facts — name, species,
-- a line of bio. `source_pet_id` exists only so the UI can offer "add Bella"
-- and is never followed to read health data; the policy below authorises on
-- owner_id alone, so a null or stale source_pet_id changes nothing.
-- ---------------------------------------------------------------------------

create table if not exists public.community_pets (
  id            uuid primary key default gen_random_uuid(),
  owner_id      uuid not null references auth.users(id) on delete cascade,
  source_pet_id uuid references public.pets(id) on delete set null,
  name          text not null check (length(trim(name)) between 1 and 40),
  species       pet_species not null default 'dog',
  breed         text check (length(breed) <= 60),
  bio           text check (length(bio) <= 280),
  avatar_emoji  text default '🐾',
  created_at    timestamptz not null default now()
);
create index if not exists community_pets_owner_idx on public.community_pets(owner_id);

alter table public.community_pets enable row level security;

drop policy if exists "community_pets: read"       on public.community_pets;
drop policy if exists "community_pets: self write" on public.community_pets;
drop policy if exists "community_pets: self mod"   on public.community_pets;
drop policy if exists "community_pets: self del"   on public.community_pets;

-- Same visibility rule as posts: your own always, others' only once they publish.
create policy "community_pets: read" on public.community_pets
  for select to authenticated using (
    owner_id = auth.uid()
    or exists (
      select 1 from public.community_profiles p
      where p.id = community_pets.owner_id and p.is_public
    )
  );
create policy "community_pets: self write" on public.community_pets
  for insert to authenticated with check (owner_id = auth.uid());
create policy "community_pets: self mod" on public.community_pets
  for update to authenticated using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy "community_pets: self del" on public.community_pets
  for delete to authenticated using (owner_id = auth.uid());

-- Let a post point at a community pet (safe — that table is already community-scoped).
alter table public.community_posts
  add column if not exists community_pet_id uuid references public.community_pets(id) on delete set null;

-- ============================================================================
-- Post-install check. Run as an anonymous caller: every one of these must
-- return 0 rows rather than an error, and none may leak another user's data.
--   set role anon;
--   select count(*) from public.pets;               -- 0
--   select count(*) from public.community_posts;    -- 0 (authenticated-only)
--   reset role;
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 2026-08-23 fix: deleting a pet must not destroy the scanned reports.
-- documents.pet_id was ON DELETE CASCADE, so removing a pet permanently deleted
-- the original vet paperwork — the one artifact an owner cannot reconstruct —
-- and orphaned the private PDFs in storage. The column is already nullable and
-- the app already handles unfiled documents, so SET NULL is the correct rule.
-- ---------------------------------------------------------------------------
alter table public.documents drop constraint if exists documents_pet_id_fkey;
alter table public.documents
  add constraint documents_pet_id_fkey
  foreign key (pet_id) references public.pets(id) on delete set null;
-- ============================================================================
-- Insurance (added 2026-08-23). PURELY ADDITIVE — creates new tables only,
-- alters nothing existing, drops nothing. Safe to run against live data.
-- ============================================================================

create table if not exists public.insurance_policies (
  id                uuid primary key default gen_random_uuid(),
  pet_id            uuid not null references public.pets(id) on delete cascade,
  owner_id          uuid not null references auth.users(id) on delete cascade,
  provider          text not null check (length(trim(provider)) > 0),
  policy_number     text,
  plan_name         text,
  start_date        date,
  end_date          date,
  monthly_premium_cents integer check (monthly_premium_cents is null or monthly_premium_cents >= 0),
  deductible_cents      integer check (deductible_cents is null or deductible_cents >= 0),
  reimbursement_pct     integer check (reimbursement_pct is null or (reimbursement_pct between 0 and 100)),
  annual_limit_cents    integer check (annual_limit_cents is null or annual_limit_cents >= 0),
  contact_phone     text,
  notes             text,
  created_at        timestamptz not null default now(),
  constraint policy_end_after_start check (end_date is null or start_date is null or end_date >= start_date)
);
create index if not exists insurance_policies_pet_idx on public.insurance_policies(pet_id);

do $$ begin
  create type claim_status as enum ('draft','submitted','in_review','approved','partially_paid','paid','denied');
exception when duplicate_object then null; end $$;

create table if not exists public.insurance_claims (
  id             uuid primary key default gen_random_uuid(),
  policy_id      uuid not null references public.insurance_policies(id) on delete cascade,
  pet_id         uuid not null references public.pets(id) on delete cascade,
  owner_id       uuid not null references auth.users(id) on delete cascade,
  -- Provenance: which uploaded report backs this claim. SET NULL, never cascade —
  -- losing a document must not silently delete the claim record.
  document_id    uuid references public.documents(id) on delete set null,
  claim_number   text,
  service_date   date not null default current_date,
  description    text,
  amount_claimed_cents integer check (amount_claimed_cents is null or amount_claimed_cents >= 0),
  amount_paid_cents    integer check (amount_paid_cents is null or amount_paid_cents >= 0),
  status         claim_status not null default 'draft',
  submitted_on   date,
  resolved_on    date,
  notes          text,
  created_at     timestamptz not null default now()
);
create index if not exists insurance_claims_pet_idx on public.insurance_claims(pet_id, service_date desc);
create index if not exists insurance_claims_policy_idx on public.insurance_claims(policy_id);

alter table public.insurance_policies enable row level security;
alter table public.insurance_claims   enable row level security;

drop policy if exists "insurance_policies: owner all" on public.insurance_policies;
create policy "insurance_policies: owner all" on public.insurance_policies
  for all
  using (owner_id = auth.uid() and public.owns_pet(pet_id))
  with check (owner_id = auth.uid() and public.owns_pet(pet_id));

drop policy if exists "insurance_claims: owner all" on public.insurance_claims;
create policy "insurance_claims: owner all" on public.insurance_claims
  for all
  using (owner_id = auth.uid() and public.owns_pet(pet_id))
  with check (owner_id = auth.uid() and public.owns_pet(pet_id));
