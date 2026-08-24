-- ============================================================================
-- Contact + partner inbox (added 2026-08-24). PURELY ADDITIVE.
--
-- Two things:
--   1. contact_messages — the open "contact us" box. Anyone may write; nobody
--      reads it through the API except the owner (see the SELECT policy).
--   2. a SELECT policy on the EXISTING partner_inquiries so the same owner can
--      read those too. Until now partner_inquiries had INSERT and no SELECT,
--      so submissions were write-only — collected but unreadable through the
--      app. That is fixed for the owner account, and only that account.
--
-- "The owner" is one email, checked against the signed-in user's JWT. Not a
-- role, not a table flag — a literal address, because there is exactly one
-- person who should read these and hard-coding it is clearer and safer than a
-- role nobody else will ever hold.
-- ============================================================================

create table if not exists public.contact_messages (
  id          uuid primary key default gen_random_uuid(),
  email       text not null check (length(email) between 3 and 254),
  message     text not null check (length(trim(message)) between 1 and 4000),
  source_page text,
  -- Set only when a signed-in user submits; null for an anonymous sender.
  submitter   uuid references auth.users(id) on delete set null,
  created_at  timestamptz not null default now()
);
create index if not exists contact_messages_recent_idx
  on public.contact_messages(created_at desc);

alter table public.contact_messages enable row level security;

drop policy if exists "contact_messages: anyone may submit" on public.contact_messages;
drop policy if exists "contact_messages: owner reads"       on public.contact_messages;

-- Anyone, signed in or not, may leave a message.
create policy "contact_messages: anyone may submit" on public.contact_messages
  for insert to anon, authenticated with check (true);

-- Only the owner account may read them back.
create policy "contact_messages: owner reads" on public.contact_messages
  for select to authenticated
  using (auth.jwt() ->> 'email' = 'yuhoulin737@gmail.com');

-- Give the owner read access to the partner inbox too.
drop policy if exists "partner_inquiries: owner reads" on public.partner_inquiries;
create policy "partner_inquiries: owner reads" on public.partner_inquiries
  for select to authenticated
  using (auth.jwt() ->> 'email' = 'yuhoulin737@gmail.com');
