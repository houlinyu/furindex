# 🐾 FurIndex

A pet health record app — vaccinations, medications, weight trends and vet
visits for the animals in your life. Built for **Sundai**.

**Sundai project page:** _add the link once the project is registered_
**Live demo:** _add the Vercel URL once deployed_

> Before demoing, fill in `src/lib/links.ts` — anything left as `REPLACE_ME`
> renders a visible "(link TODO)" on the site footer.

> Personal side project. Not affiliated with any employer, and it holds no
> employer data.

---

## Stack

| Layer    | Choice                                        |
| -------- | --------------------------------------------- |
| Frontend | Next.js 15 (App Router) · React 19 · TypeScript |
| Styling  | Tailwind CSS v4                                |
| Backend  | Supabase — Postgres + Auth + Storage           |
| AI       | Claude Opus 5 — reads vet reports into records  |
| Auth     | Magic-link (email OTP), no passwords           |
| Security | Postgres Row Level Security on every table     |

No ORM, no state library, no chart library. Server Components read straight
from Postgres; Server Actions do the writes.

## What it does

**Upload a vet report — a PDF or a phone photo — and it becomes a record.**
Claude reads the vaccinations, medications, weight, diagnosis and next-due dates
out of the document. You review every line before anything is saved; nothing is
written that you didn't tick. If you have no pets on file yet, the report can
create the pet too.

Anything the document holds that our fixed tables don't — blood glucose, body
condition score, dental grade — becomes **a field you define**, and the next
report carrying the same label lines up with it automatically.

Plus: due/overdue reminders, a weight trend chart, a daily note tailored to the
animals you keep, and an opt-in community that shares no health data.

You will need an `ANTHROPIC_API_KEY` for the extraction and daily-note features.
Everything else works without one.

---

## Getting started

**1. Install** (needs Node 18.18+)

```bash
npm install
```

**2. Create a Supabase project** at https://supabase.com/dashboard — free tier
is plenty.

**3. Create the schema.** Open the project's SQL editor and run the whole of
[`supabase/schema.sql`](supabase/schema.sql). It creates the tables, the
signup trigger, and the RLS policies.

**4. Configure the environment**

```bash
cp .env.example .env.local
```

Fill in `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` from
Supabase → Project Settings → API.

**5. Point auth back at localhost.** Supabase → Authentication → URL
Configuration:

- Site URL: `http://localhost:3000`
- Redirect URLs: add `http://localhost:3000/auth/callback`

**6. Run it**

```bash
npm run dev
```

Open http://localhost:3000, enter your email, click the link in your inbox.

---

## How the data is protected

Every table has RLS enabled and no table is readable without a session:

- `pets` — you can only see rows where `owner_id = auth.uid()`.
- `vaccinations`, `medications`, `weight_logs`, `vet_visits` — reachable only
  through a pet you own, enforced by the `owns_pet()` security-definer function.

That means the anon key in the browser is not a secret worth guarding — it can
only ever return your own rows. **The service role key is a different story:
it bypasses RLS entirely.** It is not needed by any code here; don't add it
unless you build admin tooling, and never expose it to the client.

### A note on regulation

Animal health records are **not** PHI, so HIPAA does not apply. But owner
records (name, email, address, payment) are ordinary personal data, and some
US states impose confidentiality duties on veterinary records. So:

- Never commit real owner or patient data. `.gitignore` blocks `data/` and
  `*.csv` for this reason.
- Use synthetic pets for the demo.

---

## Project layout

```
src/
  app/
    actions.ts            server actions — all writes go through here
    dashboard/            upcoming-care overview
    pets/                 list, create, detail
    login/                magic-link form
    auth/callback/        exchanges the emailed code for a session
  components/             AppShell, RecordTabs, WeightChart, ...
  lib/
    supabase/client.ts    browser client
    supabase/server.ts    per-request server client
    types.ts              hand-written schema mirror
    format.ts             dates, ages, currency
  middleware.ts           session refresh + route guard
supabase/
  schema.sql              tables, triggers, RLS policies
```

---

## Deploying

Vercel is the shortest path:

1. Push to GitHub.
2. Import the repo at vercel.com — it detects Next.js automatically.
3. Add `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` and
   `NEXT_PUBLIC_SITE_URL` (your production URL) as environment variables.
4. Add `https://<your-app>.vercel.app/auth/callback` to the Supabase redirect
   allowlist, and set Site URL to the production URL.

The deployed URL is what goes on the Sundai project page.

---

## Roadmap

- [ ] Photo upload (Supabase Storage, per-user bucket policies)
- [ ] Email/push reminders for vaccinations coming due
- [ ] Share a pet's record with a co-owner or a vet (read-only invite)
- [ ] Export a printable health summary as PDF
- [ ] Breed-aware weight guidance
