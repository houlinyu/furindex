# Working on this together

Two people, short timeline. The rules below exist only to stop us overwriting
each other — anything stricter isn't worth it.

## Setup

See [README](README.md#getting-started). One extra step for the second person:
**we share one Supabase project.** Ask for the URL and anon key rather than
creating your own, otherwise you'll be adding pets to a different database and
we'll spend an hour confused about why they don't show up.

Send credentials over Signal/DM. Not in a GitHub issue, not in a commit.

## Branching

`main` is always deployable — Vercel builds it. Never push straight to it.

```bash
git checkout -b feat/vaccination-reminders   # feat/ fix/ chore/ docs/
# ... work ...
git push -u origin feat/vaccination-reminders
```

Then open a PR. On a hackathon clock, a PR that's been green for a few minutes
with no comment is fine to merge yourself — the PR is there for the record and
the build check, not to gate on ceremony. Anything touching `schema.sql` or
auth, wait for the other person to actually look.

## Avoiding collisions

We only really have one shared-state problem: **the database schema.**

- Schema changes go in `supabase/schema.sql`, and the file is written to be
  re-runnable (`if not exists`, `create or replace`, `drop policy if exists`).
  Re-run the whole file rather than applying a fragment by hand.
- **Say in chat when you've changed the schema**, and paste the run into the
  shared Supabase project yourself. The other person then pulls `main` and
  re-runs the file locally. A schema change that only exists on your branch
  will break the other person's app with a confusing PostgREST error.
- Regenerate `src/lib/types.ts` in the same commit as any schema change.

Otherwise: claim work in an issue before you start it, so we don't both build
the reminders feature.

## Where things get written down

| What | Where |
| --- | --- |
| What to build next, who's on it | GitHub Issues |
| What happened in a session, what's blocked | [DEVLOG.md](DEVLOG.md) |
| Why we chose something hard to reverse | [docs/DECISIONS.md](docs/DECISIONS.md) |
| How a specific change works | the PR description |
| What the app is, how to run it | [README.md](README.md) |

If you find yourself explaining something in chat for the second time, it
belongs in one of those.

## Before you open a PR

```bash
npm run typecheck
npm run build
```

Both clean. There is no `npm run lint` — ESLint was never configured and the
script dropped into an interactive prompt that would hang CI, so it was removed
rather than left as a trap. There's no test suite yet either; if you add either,
say so in the DEVLOG.
