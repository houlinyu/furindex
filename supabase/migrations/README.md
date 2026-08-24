# Migrations waiting to be applied

Three features are built, reviewed and browser-tested, but **not live** — each
needs its tables to exist first, and applying schema changes needs a credential
this project doesn't keep in the repo. Run the files here in the Supabase SQL
editor (Dashboard → SQL Editor → paste → Run), in order, then merge the matching
branch.

Nothing here is destructive. Every file is additive only: new enums, new tables,
new indexes, new policies. No `drop table`, no `truncate`, no `alter` of an
existing column. The `drop policy if exists` lines apply only to the new tables
each file creates, and exist so a file can be re-run safely.

Verify with the counts at the bottom of each section rather than assuming it
worked.

---

## 001_media_history.sql — photo / video / voice-note timeline

**Branch:** `feat/media`

Creates `media_kind` enum, `pet_media` table, a GIN index on `user_tags`, one
RLS policy, and widens the existing `vet-reports` storage bucket to accept
video and audio (it currently allows PDF and images only) with a 100 MB ceiling.

The bucket widening is a `update storage.buckets ... where id = 'vet-reports'`
that *unions* the new MIME types onto whatever is already allowed, so it will
not narrow an existing list, and leaves a `null` list alone rather than
tightening it.

**After running it**, check:

```sql
select count(*) from information_schema.tables
 where table_schema = 'public' and table_name = 'pet_media';           -- 1
select allowed_mime_types, file_size_limit
  from storage.buckets where id = 'vet-reports';                       -- includes video/*, audio/*
```

**Then:** merge `feat/media` and add `<MediaSection petId={p.id} />` to
`src/app/pets/[id]/page.tsx`. One caveat that is easy to lose: the branch also
changes `next.config.ts` to `Permissions-Policy: microphone=(self)`. Without
that change the voice-note recorder cannot work at all — `getUserMedia` rejects
outright, in every browser, and there is no prompt the user could accept.

## 002_health_check.sql — guided nine-part check + daily wellbeing note

**Branch:** `feat/health-check`

Creates four enums (`health_check_part`, `health_capture_type`,
`health_self_assessment`, `health_ai_review_status`), three tables
(`health_checks`, `health_check_items`, `wellbeing_notes`), two unique indexes
that the app's upserts depend on, and one policy per table.

The two unique indexes are load-bearing, not decoration: the app upserts on
`(pet_id, checked_on)` and `(check_id, part)` so that re-taking a photo corrects
this morning's entry instead of stacking a second row. If those indexes are
missing the upserts fail at runtime.

`ai_review_status` is `pending` on every row and nothing writes another value.
It exists so the column doesn't have to be added later; no AI is mentioned
anywhere in that UI, deliberately.

**After running it**, check:

```sql
select table_name from information_schema.tables
 where table_schema = 'public'
   and table_name in ('health_checks','health_check_items','wellbeing_notes'); -- 3 rows
select indexname from pg_indexes
 where indexname in ('health_checks_pet_day_idx','health_check_items_part_idx'); -- 2 rows
```

**Then:** merge `feat/health-check` and add a `Health check` link to the pet
page header. Note this branch also appends to `src/lib/types.ts`, which is the
one file likely to conflict with `feat/media` — the resolution is to keep both
sets of appended types.

## No migration needed — connected-care dashboard

**Branch:** `feat/care-dashboard`

Reads existing tables only and probes for the health-check tables above,
degrading to "not tracked" in words when they're absent. It can be merged at
any time, before or after the others. It gets more useful once `002` is applied,
because the body-part tiles then have something to read.

---

## Applying by CLI instead

If you'd rather not paste, and you have the database password:

```bash
psql "$DATABASE_URL" -f supabase/migrations/001_media_history.sql
psql "$DATABASE_URL" -f supabase/migrations/002_health_check.sql
```

## Why these aren't in supabase/schema.sql yet

`schema.sql` is the from-scratch definition of a working database, and the rule
this repo follows is that it stays runnable top-to-bottom on an empty project.
Appending a block there before it has ever been executed would mean the file
claims a shape the real database does not have — which is how you end up
debugging an app against a schema that only exists in git. These land in
`schema.sql` once they are actually applied.
