# Decisions

Short records of choices that are expensive to reverse. If you're about to
undo one of these, read the "why" first — and if you undo it anyway, add a new
entry rather than editing the old one.

Not for everyday choices. If it's cheap to change, just change it.

---

## 1. The repo lives under the Sundai org, not a personal account

**Date:** 2026-08-23 · **Status:** accepted

The canonical repo sits in the Sundai GitHub org; we push to it from our
personal accounts as org members.

**Why:** the Sundai project landing page links to the repo, so it needs to
outlive any one person's involvement. If it lived under a personal account,
nobody else could add collaborators, manage secrets, or transfer it if that
person went quiet. Transferring personal → org later works but breaks existing
forks and CI tokens, and branch protection has to be redone.

**Consequence:** commits are still attributed to us individually. Repo starts
private and goes public before the Sundai submission.

---

## 2. Supabase with Row Level Security, no backend service

**Date:** 2026-08-23 · **Status:** accepted

Postgres, auth and authorization all come from Supabase. Server Components
query it directly; Server Actions write. There is no separate API layer.

**Why:** on a hackathon clock, an API tier is pure overhead — it would just
forward requests to Postgres. RLS pushes authorization into the database, so
there is no code path that can forget an ownership check.

**Consequence:** the security model is only as good as `schema.sql`. Any new
table starts with `enable row level security` and a policy, in the same commit.
A table added without a policy is invisible to the app, which fails loudly —
that's deliberate.

---

## 3. The service role key never enters this codebase

**Date:** 2026-08-23 · **Status:** accepted

Only the anon key is used, and only ever from `NEXT_PUBLIC_*` vars.

**Why:** the service role key bypasses RLS entirely. Once it exists in the
codebase, one careless import into a client component leaks every user's
records. Nothing we're building needs it.

**Consequence:** if you ever genuinely need admin access (a migration script, a
cron job), it goes in a separate process outside this repo — not behind a
`if (typeof window === "undefined")` check.

---

## 4. No real animal or owner data, ever

**Date:** 2026-08-23 · **Status:** accepted

Demos use synthetic pets. `.gitignore` blocks `data/` and `*.csv`.

**Why:** animal records aren't PHI so HIPAA doesn't apply, but owner records
(name, email, address, payment) are ordinary personal data, and several US
states impose confidentiality duties on veterinary records. A public hackathon
repo is the worst possible place for any of it.
