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

-- ============================================================================
-- Health & behaviour journal (added 2026-08-23). PURELY ADDITIVE — creates one
-- new enum, one new table and its policy. Alters nothing, drops nothing.
--
-- The clinical tables record events a vet produced. This one records what the
-- owner noticed: "off her food again", "limping after the walk". Individually
-- trivial, but a date-ordered run of them is the history a vet asks for and an
-- owner can never reconstruct from memory.
-- ============================================================================

do $$ begin
  create type journal_category as enum ('symptom','behaviour','mood','appetite','energy','other');
exception when duplicate_object then null; end $$;

create table if not exists public.journal_entries (
  id           uuid primary key default gen_random_uuid(),
  pet_id       uuid not null references public.pets(id) on delete cascade,
  owner_id     uuid not null references auth.users(id) on delete cascade,
  occurred_on  date not null default current_date,
  category     journal_category not null default 'symptom',
  title        text not null check (length(trim(title)) between 1 and 120),
  body         text,
  -- 1 = barely noticeable, 5 = call the vet. Null because most observations
  -- aren't severe enough to rate, and forcing a number would invent data.
  severity     smallint check (severity is null or severity between 1 and 5),
  -- Object key in the existing private 'vet-reports' bucket, same
  -- <auth.uid()>/<uuid>.<ext> convention the storage policies key off.
  photo_path   text,
  created_at   timestamptz not null default now()
);
create index if not exists journal_entries_pet_idx on public.journal_entries(pet_id, occurred_on desc);

alter table public.journal_entries enable row level security;

drop policy if exists "journal_entries: owner all" on public.journal_entries;
create policy "journal_entries: owner all" on public.journal_entries
  for all
  using (owner_id = auth.uid() and public.owns_pet(pet_id))
  with check (owner_id = auth.uid() and public.owns_pet(pet_id));
-- ============================================================================
-- Partner enquiries (added 2026-08-23). PURELY ADDITIVE.
-- Anyone can WRITE one (that is the point of a contact form); nobody can read
-- them through the API. Reads happen via the Supabase dashboard or a service
-- role, never through the anon key — otherwise a public form becomes a public
-- mailing list.
-- ============================================================================

create table if not exists public.partner_inquiries (
  id           uuid primary key default gen_random_uuid(),
  name         text not null check (length(trim(name)) between 1 and 120),
  email        text not null check (position('@' in email) > 1 and length(email) <= 254),
  organisation text check (length(organisation) <= 160),
  category     text check (category in ('wearables','clinic','diagnostics','insurance','other')),
  message      text not null check (length(trim(message)) between 10 and 4000),
  -- Coarse provenance only. No IP, no user agent: this is a contact form, not
  -- an analytics endpoint, and collecting less is the whole posture of the app.
  source_page  text,
  handled      boolean not null default false,
  created_at   timestamptz not null default now()
);
create index if not exists partner_inquiries_new_idx
  on public.partner_inquiries(created_at desc) where not handled;

alter table public.partner_inquiries enable row level security;

drop policy if exists "partner_inquiries: anyone may submit" on public.partner_inquiries;
drop policy if exists "partner_inquiries: no public read"    on public.partner_inquiries;

-- Insert only. There is deliberately NO select policy, so with RLS on, every
-- read through the anon or authenticated key returns zero rows.
create policy "partner_inquiries: anyone may submit" on public.partner_inquiries
  for insert to anon, authenticated with check (true);

-- ============================================================================
-- Nutrition & feeding (added 2026-08-23). PURELY ADDITIVE — two new enums plus
-- two new tables and their policies. Alters nothing, drops nothing.
--
-- Two tables, not one, because they answer different questions. The PLAN is
-- what the pet is supposed to eat — the thing a vet asks about and the thing
-- that changes maybe twice a year. The LOG is what actually went in the bowl,
-- which matters during an illness, a diet trial, or a household where more than
-- one person feeds. Merging them would force a full plan restatement on every
-- meal, and nobody would log the second meal.
-- ============================================================================

do $$ begin
  create type food_type as enum ('dry','wet','raw','home_cooked','mixed','prescription');
exception when duplicate_object then null; end $$;

-- Deliberately unit-agnostic rather than normalising to grams: a cup of kibble
-- and a cup of wet food weigh nothing alike, so a conversion here would invent
-- precision the owner never gave us. We store what they measured with.
do $$ begin
  create type food_unit as enum ('g','oz','cup','can','scoop');
exception when duplicate_object then null; end $$;

create table if not exists public.feeding_plans (
  id               uuid primary key default gen_random_uuid(),
  pet_id           uuid not null references public.pets(id) on delete cascade,
  owner_id         uuid not null references auth.users(id) on delete cascade,
  food_brand       text,
  food_product     text,
  food_type        food_type not null default 'dry',
  amount_per_meal  numeric(8,2) check (amount_per_meal is null or (amount_per_meal > 0 and amount_per_meal < 100000)),
  amount_unit      food_unit not null default 'g',
  meals_per_day    smallint not null default 2 check (meals_per_day between 1 and 6),
  -- Nullable and separate from amount: most owners don't know the kcal figure,
  -- and deriving it from amount would be a guess presented as a measurement.
  calories_per_day integer check (calories_per_day is null or (calories_per_day > 0 and calories_per_day < 20000)),
  notes            text,
  -- Superseded plans are kept, never deleted — a diet change is often the
  -- answer to "when did the itching start?".
  is_current       boolean not null default true,
  started_on       date not null default current_date,
  ended_on         date,
  created_at       timestamptz not null default now(),
  constraint feeding_plan_ended_after_started check (ended_on is null or ended_on >= started_on),
  -- A plan can't be both the current diet and a closed chapter.
  constraint feeding_plan_current_is_open check (not (is_current and ended_on is not null))
);
create index if not exists feeding_plans_pet_idx on public.feeding_plans(pet_id, started_on desc);
create index if not exists feeding_plans_current_idx on public.feeding_plans(pet_id) where is_current;

create table if not exists public.feeding_logs (
  id         uuid primary key default gen_random_uuid(),
  pet_id     uuid not null references public.pets(id) on delete cascade,
  owner_id   uuid not null references auth.users(id) on delete cascade,
  fed_at     timestamptz not null default now(),
  amount     numeric(8,2) check (amount is null or (amount > 0 and amount < 100000)),
  amount_unit food_unit not null default 'g',
  -- Free text on purpose. There is no caretaker system, and inventing one to
  -- record "the dog walker" would block the note that matters today.
  fed_by     text,
  -- A refused or deliberately withheld meal is a clinical signal, so it is
  -- recorded as a meal that didn't happen rather than as no row at all.
  skipped    boolean not null default false,
  notes      text,
  created_at timestamptz not null default now(),
  -- A skipped meal has no amount to report; allowing one invites "fed 0".
  constraint feeding_log_skipped_has_no_amount check (not (skipped and amount is not null))
);
create index if not exists feeding_logs_pet_idx on public.feeding_logs(pet_id, fed_at desc);

alter table public.feeding_plans enable row level security;
alter table public.feeding_logs  enable row level security;

drop policy if exists "feeding_plans: owner all" on public.feeding_plans;
create policy "feeding_plans: owner all" on public.feeding_plans
  for all
  using (owner_id = auth.uid() and public.owns_pet(pet_id))
  with check (owner_id = auth.uid() and public.owns_pet(pet_id));

drop policy if exists "feeding_logs: owner all" on public.feeding_logs;
create policy "feeding_logs: owner all" on public.feeding_logs
  for all
  using (owner_id = auth.uid() and public.owns_pet(pet_id))
  with check (owner_id = auth.uid() and public.owns_pet(pet_id));
-- ============================================================================
-- Rate limiting for the public, unauthenticated breed-scan endpoint.
-- PURELY ADDITIVE.
--
-- The endpoint costs money per call and requires no account, so without this a
-- single script can run up a bill overnight. Counted per hashed IP per hour.
-- We store a SHA-256 of (ip + a server-side salt), never the address itself:
-- enough to rate limit, not enough to identify anyone or to be worth stealing.
-- ============================================================================

create table if not exists public.scan_rate_limit (
  ip_hash    text not null,
  window_start timestamptz not null,
  count      integer not null default 1 check (count >= 0),
  primary key (ip_hash, window_start)
);
create index if not exists scan_rate_limit_window_idx on public.scan_rate_limit(window_start);

alter table public.scan_rate_limit enable row level security;
-- No policies at all: this table is only ever touched by the server via the
-- SECURITY DEFINER function below. Anon and authenticated keys can do nothing.

create or replace function public.claim_scan_slot(
  p_ip_hash text,
  p_limit   integer default 5
)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_window timestamptz := date_trunc('hour', now());
  v_count  integer;
begin
  insert into public.scan_rate_limit (ip_hash, window_start, count)
  values (p_ip_hash, v_window, 1)
  on conflict (ip_hash, window_start)
    do update set count = public.scan_rate_limit.count + 1
  returning count into v_count;

  -- Opportunistic cleanup; this table should never grow unbounded.
  delete from public.scan_rate_limit where window_start < now() - interval '2 days';

  return v_count <= p_limit;
end;
$$;

revoke all on function public.claim_scan_slot(text, integer) from public;
grant execute on function public.claim_scan_slot(text, integer) to anon, authenticated;

-- ============================================================================
-- Journal time-of-day (added 2026-08-23). PURELY ADDITIVE — one nullable
-- column. Nothing is altered, nothing is dropped.
--
-- WHY a time at all: Gruen et al. 2017, PLOS ONE 12(1):e0169576 (n=98 cats)
-- measured activity as strongly bimodal across the day — a morning peak around
-- 05:30–09:00, an evening peak around 17:00–23:00, and a trough around
-- 02:00–05:00 — with weekday and weekend patterns differing at p<0.0001,
-- attributed to the owner's schedule. An entry logged only to a DATE throws
-- away the axis with the largest measured effect in that literature.
-- "Vomiting at 3am" and "vomiting after dinner" are different stories.
--
-- WHY nullable: the same reasoning already applied to `severity` above. Most
-- observations are recalled as "sometime this morning", or written up hours
-- later, and forcing a clock reading would invent data that reads as precise.
--
-- WHY `time` and not `timestamptz`: the value comes from an <input type="time">
-- and is the owner's LOCAL wall clock. There is no instant to convert, and the
-- server has no way to know the owner's zone, so anything that reinterprets it
-- in the server's zone silently shifts every entry for every owner outside it.
-- Stored as the wall clock it was typed as, and read back the same way.
-- ============================================================================

alter table public.journal_entries add column if not exists occurred_at time;

-- ============================================================================
-- Care reminders (added 2026-08-23). PURELY ADDITIVE — two new enums, one new
-- table, its indexes and one policy. Alters nothing, drops nothing.
--
-- WHY a table of its own rather than more date columns on the clinical tables:
-- the product promises to warn you before things lapse, but the only thing that
-- can currently lapse in the schema is a vaccination that happens to have a
-- `due_on` filled in. The most-forgotten items in pet care aren't vaccinations
-- at all — monthly flea, worm and heartworm preventatives are, precisely
-- because they recur on a short cycle with no appointment attached to them.
-- Those have no home in `vaccinations` (nothing was administered by a vet) or
-- in `medications` (a course with a start and an end is a different shape from
-- a treatment that repeats forever). A reminder is its own thing: a title, a
-- date it is next owed, and a rhythm.
--
-- WHY it does not point at the clinical rows: a reminder is admin, not a
-- medical record. Keeping it separate means an owner can delete, snooze or
-- abandon a reminder without touching the health history, and a health record
-- can be corrected without silently rescheduling anything.
-- ============================================================================

do $$ begin
  create type care_kind as enum
    ('vaccination','medication','preventative','checkup','grooming','other');
exception when duplicate_object then null; end $$;

-- 'none' is a real, common answer — a one-off "book the dental" is a reminder
-- too — so it is a value in the enum rather than a null repeat_interval.
-- 'biannual' here means every six months (twice a year), which is how vets
-- schedule senior check-ups; the UI never uses the bare word for that reason.
do $$ begin
  create type care_interval as enum
    ('none','weekly','monthly','quarterly','biannual','annual');
exception when duplicate_object then null; end $$;

create table if not exists public.care_reminders (
  id                uuid primary key default gen_random_uuid(),
  pet_id            uuid not null references public.pets(id) on delete cascade,
  owner_id          uuid not null references auth.users(id) on delete cascade,
  title             text not null check (length(trim(title)) > 0),
  kind              care_kind not null default 'other',
  -- Not null: a reminder with no date cannot remind anyone of anything. New
  -- reminders default to today rather than to nothing.
  due_on            date not null default current_date,
  repeat_interval   care_interval not null default 'none',
  -- When it was last actually done. Null = never done yet, which is different
  -- from "done and the next one is scheduled" and is worth being able to tell
  -- apart when an owner asks "did I ever give her that?".
  last_completed_on date,
  notes             text,
  -- Retired rather than deleted: the pet outgrew the treatment, the course
  -- ended, the reminder was a mistake. Deleting would take the completion
  -- history with it, so nothing here ever deletes.
  is_active         boolean not null default true,
  created_at        timestamptz not null default now()
  -- No "completion is not in the future" CHECK here on purpose: current_date is
  -- STABLE, not IMMUTABLE, and Postgres rejects it inside a CHECK. That rule is
  -- enforced in completeReminder() instead.
);

-- The dashboard's only question is "what is due soon across ALL my pets", which
-- is an owner-wide scan ordered by date, not a per-pet lookup. Partial on
-- is_active because retired reminders are never part of that answer and would
-- otherwise pad the index for every owner who has ever cancelled one.
create index if not exists care_reminders_due_idx
  on public.care_reminders(owner_id, due_on)
  where is_active;

-- The pet page's question, which is the other half of the traffic.
create index if not exists care_reminders_pet_idx
  on public.care_reminders(pet_id, due_on);

alter table public.care_reminders enable row level security;

drop policy if exists "care_reminders: owner all" on public.care_reminders;
create policy "care_reminders: owner all" on public.care_reminders
  for all
  using (owner_id = auth.uid() and public.owns_pet(pet_id))
  with check (owner_id = auth.uid() and public.owns_pet(pet_id));

-- ============================================================================
-- Pet profile questionnaire (added 2026-08-23)
--
-- Seven short blocks of optional questions an owner answers about their animal:
-- temperament, what it enjoys, reported conditions, diet, daily routine, home,
-- and what they'd want a wearable to track. None of it is clinical and none of
-- it is required.
--
-- WHY ONE ROW PER PET rather than a row per answer: every question here has
-- exactly one answer per pet at a time, and the questions are a fixed set we
-- author. A tall answers table would buy flexibility we don't need and cost a
-- pivot on every read.
--
-- WHY text[] AND NOT jsonb: the whole point of collecting this is to be able to
-- ask "how many anxious cats live in apartments" later. That is
--   ... where 'anxious' = any(personality) and 'apartment' = any(home_type)
-- against a GIN index, in SQL, with no JSON path expressions and no chance of
-- a typo in a key silently matching nothing. jsonb would make the same question
-- a string-matching exercise.
--
-- WHY KEYS AND NOT LABELS: the values stored are the stable keys defined in
-- src/lib/pet-profile.ts ('joint_mobility'), never the display label
-- ("Joint / mobility"). Labels get reworded — a reworded label must never
-- fork a cohort in two.
--
-- Purely additive: nothing here alters or drops an existing object.
-- ============================================================================

-- yes / no / not sure. 'not_sure' is a real answer to "any current health
-- conditions?", not a missing one — most owners genuinely don't know, and
-- collapsing that into null would lose the difference between "I don't know"
-- and "I didn't answer". NULL still means unanswered.
do $$ begin
  create type profile_tristate as enum ('yes','no','not_sure');
exception when duplicate_object then null; end $$;

create table if not exists public.pet_profiles (
  -- Primary key, not a separate id: one profile per pet, enforced by the
  -- database rather than by remembering to upsert correctly everywhere.
  pet_id           uuid primary key references public.pets(id) on delete cascade,
  owner_id         uuid not null references auth.users(id) on delete cascade,

  -- Block 2 — personality & behaviour
  personality      text[] not null default '{}',
  enjoys           text[] not null default '{}',

  -- Block 3 — health & medical history. Owner-reported, never a diagnosis.
  -- `conditions` is only meaningful when has_conditions = 'yes'; the action
  -- clears it otherwise so a stored list can never contradict the gate.
  has_conditions   profile_tristate,
  conditions       text[] not null default '{}',

  -- Block 4 — nutrition. Multi-select on purpose: "dry + wet" is the common
  -- real answer, and 'mixed' alone doesn't say mixed with what.
  diet             text[] not null default '{}',

  -- Block 5 — daily routine
  routine          text[] not null default '{}',

  -- Block 6 — environment & lifestyle
  home_type        text[] not null default '{}',
  lives_with       text[] not null default '{}',

  -- Block 7 — activity & wearables
  uses_wearable    profile_tristate,
  track_interest   text[] not null default '{}',

  -- Which blocks the owner has actually been through, including the ones they
  -- skipped. WHY: an empty text[] cannot tell "asked, nothing applied" apart
  -- from "never asked", and without that difference the pet page would go on
  -- offering the questionnaire to someone who has already declined every block.
  completed_blocks text[] not null default '{}',

  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

-- The cohort questions this table exists to answer are "which pets have X in
-- this array", which is a containment test — GIN, not btree. Only on the four
-- columns worth slicing a population by; the rest are read per-pet through the
-- primary key and would just be index to maintain.
create index if not exists pet_profiles_personality_idx
  on public.pet_profiles using gin (personality);
create index if not exists pet_profiles_conditions_idx
  on public.pet_profiles using gin (conditions);
create index if not exists pet_profiles_home_type_idx
  on public.pet_profiles using gin (home_type);
create index if not exists pet_profiles_lives_with_idx
  on public.pet_profiles using gin (lives_with);
create index if not exists pet_profiles_owner_idx on public.pet_profiles(owner_id);

-- Saving one block at a time means this row is written seven times over, so
-- "when did they last touch this" has to come from a trigger rather than from
-- whichever action remembered to set it.
drop trigger if exists pet_profiles_touch_updated_at on public.pet_profiles;
create trigger pet_profiles_touch_updated_at
  before update on public.pet_profiles
  for each row execute function public.touch_updated_at();

alter table public.pet_profiles enable row level security;

-- Same shape as custom_values: owner-scoped AND reachable only through a pet
-- the caller owns. Both halves matter — owner_id alone would let a forged
-- pet_id write a row pointing at someone else's animal.
drop policy if exists "pet_profiles: owner all" on public.pet_profiles;
create policy "pet_profiles: owner all" on public.pet_profiles
  for all
  using (owner_id = auth.uid() and public.owns_pet(pet_id))
  with check (owner_id = auth.uid() and public.owns_pet(pet_id));
-- Block 2 — Vaccines & preventive care (added 2026-08-23)
--
-- PURELY ADDITIVE. Four nullable columns and two unique indexes. Nothing here
-- alters a type, changes a default, tightens a constraint, or touches a row.
-- Every existing query, insert and policy behaves exactly as it did before this
-- ran, because every column added is nullable with no default and every index
-- added is unique only over tuples that contain a value this feature writes.
--
-- Not added, on purpose:
--   * No new table. The two facts this feature produces — "this jab happened"
--     and "poke me about it then" — are already what vaccinations and
--     care_reminders are for. A third table would have been a parallel truth.
--   * No new RLS policy. Columns inherit their table's policies, and both
--     tables are already owner-scoped through public.owns_pet(pet_id). Adding
--     a policy here would only risk loosening one that already works.
--   * No new value on the care_interval enum. See interval_months below.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- vaccinations.vaccine_key
--
-- Which of the known core vaccines this row is, as a STABLE KEY ('rabies',
-- 'dhpp', 'fvrcp', …) and never as a display label — labels get reworded and a
-- reworded label would orphan every row that stored the old wording.
--
-- Null for every row that already exists and for anything typed by hand into
-- the free-text vaccinations form, which stays exactly as it was. `name` is
-- still the human-readable record; this is only the machine tie-back that lets
-- the block recognise a jab it wrote earlier.
--
-- Deliberately NOT a foreign key or an enum: the authoritative list lives in
-- src/lib/vaccines.ts, it will grow, and a database enum would turn "add a
-- vaccine to the list" into a migration.
-- ---------------------------------------------------------------------------
alter table public.vaccinations
  add column if not exists vaccine_key text;

-- The idempotency guard for the block's save. Same pet, same vaccine, same day
-- is the same jab, and re-submitting the form must not write it twice.
-- administered_on is part of the key because a dog genuinely does get rabies
-- again in three years and that is a second, wanted row.
--
-- Safe to create over live data: every pre-existing row has vaccine_key NULL,
-- NULLs are distinct in a unique index, so no existing pair can collide and the
-- index cannot fail to build.
create unique index if not exists vaccinations_vaccine_key_uidx
  on public.vaccinations(pet_id, vaccine_key, administered_on);

-- ---------------------------------------------------------------------------
-- care_reminders.reminder_lead_days
--
-- How many days BEFORE the real due date this reminder deliberately lands.
--
-- The reminder's own due_on is the "poke me" date, not the vaccine's due date —
-- an owner asked to be told two weeks early wants it in the list two weeks
-- early, and care_reminders is the only thing that puts anything in that list.
-- Storing the lead alongside it keeps the truth recoverable: the real due date
-- is always exactly due_on + reminder_lead_days, for every lead including the
-- calendar-month one where the number is 28, 29, 30 or 31.
--
-- Null on every existing reminder, which is correct — a hand-written reminder
-- has no lead, its due_on IS its due date, and nothing about it changes.
-- ---------------------------------------------------------------------------
alter table public.care_reminders
  add column if not exists reminder_lead_days smallint
  check (reminder_lead_days is null or (reminder_lead_days >= 0 and reminder_lead_days <= 62));

-- ---------------------------------------------------------------------------
-- care_reminders.vaccine_key
--
-- Which core vaccine this reminder is about, same stable keys as above.
--
-- Earns its place twice: it is what makes re-running the block update the one
-- existing reminder instead of adding a sixth copy, and it is what lets a
-- future surface answer "when is the rabies one" without string-matching a
-- title that someone will eventually reword.
-- ---------------------------------------------------------------------------
alter table public.care_reminders
  add column if not exists vaccine_key text;

-- One reminder per vaccine per pet. This is the constraint that actually makes
-- the save idempotent under a double-tap, rather than merely usually idempotent
-- the way a read-then-write is.
--
-- Same safety argument as above: existing reminders all have vaccine_key NULL,
-- NULLs are distinct, nothing pre-existing can collide.
create unique index if not exists care_reminders_vaccine_key_uidx
  on public.care_reminders(pet_id, vaccine_key);

-- ---------------------------------------------------------------------------
-- care_reminders.interval_months
--
-- The vaccine interval the owner actually chose, in months.
--
-- WHY THIS EXISTS RATHER THAN A NEW care_interval ENUM VALUE: the enum stops at
-- 'annual', and the published adult intervals for DHPP and FVRCP are about
-- three years. There is no honest existing value for that. Adding one would
-- mean ALTER TYPE on live data, which this migration will not do — and enum
-- values in Postgres can never be removed once added, so it is the one kind of
-- "additive" change that is genuinely irreversible.
--
-- So the truthful number lives here, and repeat_interval is set to 'annual'
-- only when the interval really is twelve months, and to 'none' otherwise. The
-- consequence is visible and intended: ticking off a three-year reminder
-- retires it rather than silently rescheduling it a year out, which would have
-- been the app inventing a rhythm nobody agreed to. The next one gets scheduled
-- when the next jab is actually recorded.
-- ---------------------------------------------------------------------------
alter table public.care_reminders
  add column if not exists interval_months smallint
  check (interval_months is null or (interval_months >= 1 and interval_months <= 120));
-- Onboarding progress (added 2026-08-23)
--
-- New-pet onboarding walks the owner through a handful of blocks — basics,
-- behaviour & health, vaccines, photos, wearable — and finishes on a dashboard.
-- Every one of those blocks is skippable on purpose: this is behavioural data
-- collection, not a gate, and a forced-completion funnel is the fastest way to
-- lose the owner on block two. So the app has to be able to record "we asked,
-- they passed" as a first-class answer, distinct from "we never asked".
--
-- WHY A SEPARATE TABLE, NOT A COLUMN ON pets
-- `add column if not exists pets.onboarding_progress jsonb` would have been one
-- line, and it was the wrong line:
--   - `pets` is the hottest, most-shared row in the app; six components and
--     every other in-flight branch consume the `Pet` type. Widening it makes a
--     funnel-analytics concern part of the identity record everyone reads.
--   - Onboarding state has a different lifecycle from the pet. It is written on
--     every step transition, it is uninteresting after the first week, and it
--     is the sort of thing a future migration may well want to drop wholesale.
--     Dropping a table is safe; dropping a column from a live `pets` is not.
--   - This shape matches `custom_values` exactly — owner_id + pet_id + the same
--     `for all` RLS policy — so there is one ownership rule to reason about.
-- The per-step statuses themselves ARE jsonb rather than one column per step,
-- because the step list is a product decision that will move (the questionnaire
-- is already seven blocks behind three of these steps). Adding a step should be
-- an edit to src/lib/onboarding.ts, not a migration.
--
-- PURELY ADDITIVE: nothing above this line is altered or dropped.
-- ============================================================================

create table if not exists public.pet_onboarding (
  -- One row per pet, so "where are they up to" is a primary-key lookup and
  -- there is no way to end up with two disagreeing progress rows.
  pet_id     uuid primary key references public.pets(id) on delete cascade,
  owner_id   uuid not null references auth.users(id) on delete cascade,
  -- { "basics": "complete", "behavior-health": "skipped" }
  -- Absent key = never answered, which is deliberately NOT the same as
  -- "skipped": one of them is worth a gentle nudge later, the other is the
  -- owner having already said no.
  steps      jsonb not null default '{}'::jsonb
             check (jsonb_typeof(steps) = 'object'),
  -- The step they were last on. Only a tiebreak for resuming: the real answer
  -- is derived from `steps` (see resumeStepKey in src/lib/onboarding.ts), so a
  -- null or stale value here degrades to "first block they haven't answered".
  last_step  text,
  updated_at timestamptz not null default now()
);

-- The dashboard's question is "which of MY pets are mid-onboarding", which is
-- an owner-wide scan; the per-pet lookup is already the primary key.
create index if not exists pet_onboarding_owner_idx on public.pet_onboarding(owner_id);

drop trigger if exists pet_onboarding_touch_updated_at on public.pet_onboarding;
create trigger pet_onboarding_touch_updated_at
  before update on public.pet_onboarding
  for each row execute function public.touch_updated_at();

alter table public.pet_onboarding enable row level security;

drop policy if exists "pet_onboarding: owner all" on public.pet_onboarding;
create policy "pet_onboarding: owner all" on public.pet_onboarding
  for all
  using (owner_id = auth.uid() and public.owns_pet(pet_id))
  with check (owner_id = auth.uid() and public.owns_pet(pet_id));
