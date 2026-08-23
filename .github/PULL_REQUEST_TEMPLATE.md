## What this changes

<!-- One or two sentences. What can a user do now that they couldn't before? -->

Closes #

## How I tested it

<!-- Actually ran it? What did you click? "Didn't run it" is a valid answer,
     just say so. -->

## Checklist

- [ ] `npm run typecheck` and `npm run build` pass
- [ ] If the schema changed: `schema.sql` updated, re-run against the shared
      Supabase project, `src/lib/types.ts` regenerated, and I told the other
      person in chat
- [ ] If a new table was added: RLS enabled and a policy written in the same commit
- [ ] No real pet/owner data, no keys, nothing `NEXT_PUBLIC_` that shouldn't be
