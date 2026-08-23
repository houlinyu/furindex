# Development log

Append-only. Newest entry at the top. One entry per working session — not per
commit, git already has those.

The point of this file is the stuff git can't tell you: what we tried that
didn't work, what we're blocked on, and what the next person to sit down should
pick up. If you leave the project mid-thought, write the thought down here.

**Format:** `## YYYY-MM-DD — who`, then what changed / what's blocked / what's next.

---

## 2026-08-23 (pet profile questionnaire) — hyu

**Seven-block optional profile questionnaire, resumed from an interrupted
session and finished.** Branch `feat/profile-quiz`.

**What it is.** `/pets/[id]/profile`, one block per screen: basics (the pet row
itself), personality & behaviour, health & medical history, nutrition, daily
routine, environment & lifestyle, activity & wearables. Every block has a real
Skip in the same row and at the same size as Continue, Back is a submit so
going back saves the screen on the way out, and each block writes on its own —
closing the tab loses at most the screen on the display. Progress is stated as
"3 of 7", never as a percentage; there is nothing here to score.

**Storage.** New `pet_profiles` table, one row per pet, `text[]` per
multi-select and a `profile_tristate` enum per yes/no/not-sure. Stores stable
option keys, never labels. See DECISIONS #7 for why arrays and not jsonb.
**The migration has NOT been applied to the shared Supabase project** — the
schema.sql addition is purely additive (no ALTER, no DROP) and needs pasting
into the project before this branch does anything on a deploy. Until then the
quiz renders and says plainly that saving will fail; it does not crash.

**Not wired into the pet page.** `PetProfileCard` exists and is ready, but
`src/app/pets/[id]/page.tsx` was off-limits this session. Two-line wiring
instructions are in the PR description.

**Also fixed, unrelated but latent:** `src/app/search-actions.ts` exported a
constant (`HIT_ICON`) from a `"use server"` module — the exact shape that 500'd
the dashboard in e9fb36d. Nothing imported it. `scripts/check-server-actions.mjs`
now runs as part of `npm run build` and fails the build on that pattern, and on
a server module importing a non-component value from a `"use client"` module.
It was written for this and caught that on its first run.

**Verified in a real browser** against the live project (registration, pet
creation, graceful degradation with the table absent) and against a local
PostgREST stand-in for `pet_profiles` (all seven blocks, persistence across a
reload, Skip storing nothing, Back losing nothing, re-entry showing existing
answers). What is NOT verified: the SQL itself has never been run — no Postgres
on this box and no service-role key. Read the additive block once before pasting
it.

---

## 2026-08-23 (hardening) — hyu

**Password auth added; five stress-test defects fixed. All verified live.**

**Why passwords.** The hosted Supabase mailer is capped at 2 emails/hour for the
whole project and the cap cannot be raised without custom SMTP (I tried; the
Management API returns 401 on `rate_limit_email_sent`). Two sign-ins and the
third person gets silence with no explanation — fatal on stage. Password auth has
no ceiling and no spam-folder failure mode. `mailer_autoconfirm` is now true, so
signup issues a session instantly and sends no email at all.

Tradeoff accepted: nobody proves they own the address they register with. For a
password-gated preview where every account is isolated by RLS, that is fine.
Turn it back off before any real launch.

**Verified against live Supabase, not assumed:**
- signup -> session immediately, zero emails
- sign-in works; wrong password 400s
- a brand-new user sees 0 rows on pets/documents/vaccinations/custom_values/community_posts
- they can insert their own pet (201)
- forging `owner_id` to another user is refused: **403, "new row violates
  row-level security policy"**

**Five defects from the live stress test:**
1. HIGH — `/login` shipped an EMPTY Suspense boundary. `useSearchParams()` forces
   a client-side bailout and there was no fallback, so the only sign-in path was
   a blank gap until JS hydrated, and non-functional without JS. Fixed by reading
   search params in the server component and passing them as props. The form now
   server-renders; `BAILOUT_TO_CLIENT_SIDE_RENDERING` is gone from the HTML.
2. MEDIUM — a live, clickable link to `.../projects/REPLACE_ME` labelled
   "(link TODO)" was in production. `isPlaceholder()` only appended the label; it
   did not suppress the anchor. Now renders plain text until the URL is real.
3. LOW — `/login` had the same `<title>` as the homepage.
4. LOW — no `X-Frame-Options`, so `/login` was iframe-able and overlayable for
   credential harvesting. Added that plus nosniff, Referrer-Policy,
   Permissions-Policy, and `poweredByHeader: false`.
5. LOW — middleware used a bare `startsWith`, so a future `/login-admin` or
   `/authorize` would have become public automatically. Now matches on segment
   boundaries. Verified: all three now 307 rather than 200.

**Clean under test:** medians 87-129ms across public routes; 100 requests at
concurrency 10 -> 100/100 200s, p95 165ms; 25 concurrent -> no degradation; the
password gate resists no-cookie, wrong-cookie, wrong `?k=`, HEAD, and encoded
paths; `//evil.com` normalises same-origin (no open redirect); zero secrets in
served HTML or the JS bundle.

---

## 2026-08-23 (deployed) — hyu

**LIVE: https://furindex.vercel.app** — private preview, gated by a shared
password. Renamed Petfolio -> FurIndex throughout to match the Supabase project.

- Vercel project `furindex` under team `fur-index`, production deploy.
- Supabase auth site_url + redirect allowlist set for both localhost and the
  production URL, via the Management API — no dashboard clicking needed.
- GitHub repo Website field points at the deploy.
- `SITE_PASSWORD` gate in `src/middleware.ts`: no password -> 401, `?k=<pw>`
  sets a 30-day cookie. Inactive when the env var is unset, so local dev is
  unaffected. This is preview hygiene, NOT real security — the app's own auth is
  what protects data.

**Two traps hit during deploy, worth remembering**
1. `vercel link` silently REWROTE `.env.local`, so a later
   `grep NEXT_PUBLIC_... .env.local | cut` piped empty strings and
   `vercel env add` registered nothing. Only `SITE_PASSWORD` landed and every
   page 500'd with "Your project's URL and Key are required".
2. `vercel env add` with piped stdin did not register values at all, silently.
   Fixed by going straight to the REST API
   (`POST /v10/projects/{id}/env`) — see `set-vercel-env.mjs` in the session
   scratchpad. If env vars ever look missing again, check the API, not the CLI.

Also: a 500 immediately after `vercel deploy --prod` can just be propagation.
Re-check before debugging.

**Still open**
- No ANTHROPIC_API_KEY, by choice — sample-report path covers the demo.
- Sundai project page not registered; `SUNDAI_PROJECT_URL` still REPLACE_ME.
- Repo is private, so `REPO_IS_PUBLIC` stays false and the Source link is hidden.

---

## 2026-08-23 (night) — hyu

**Supabase is live and the app runs against it.** Project `FurIndex`
(`pkckggqctrgzzeoivfsj`, us-west-2). Schema applied via the Management API:
14 tables, RLS enabled on all 14, 24 policies, `vet-reports` bucket present and
private. `.env.local` written with the real URL + anon key.

**RLS verified against the live database, not assumed.** Anonymous REST reads on
all 12 data tables return `[]`; anonymous insert into `pets` returns 401;
unauthenticated storage listing returns 400.

**No ANTHROPIC_API_KEY, by decision.** Setting up API billing was not worth the
interruption mid-hackathon. The app now degrades cleanly instead of erroring:
- `/api/documents/[id]/extract` returns a readable 503 when the key is absent,
  not a stack trace.
- The dashboard swaps the upload dropzone for a "see how it works" card.
- `createSampleDocument()` seeds a realistic pre-extracted report
  (`src/lib/demo-report.ts`) so the review -> confirm -> apply flow demos fully
  with no key and no token spend. It writes the same row shape a real extraction
  does, so there is no separate demo code path downstream.
- The sample is labelled on the review page and in its filename. It must never
  read as something the model actually parsed.

Adding a key later re-enables real extraction with zero code changes — the
dashboard branches on `process.env.ANTHROPIC_API_KEY` server-side.

**Still to do**
- Supabase Auth -> URL Configuration: Site URL + `/auth/callback` redirect.
  Login silently fails until this is set. Dashboard-only, cannot be scripted.
- Deploy (Vercel), then `gh repo edit --homepage <url>`.
- Register the Sundai project page and fill `SUNDAI_PROJECT_URL` in
  `src/lib/links.ts`.
- Naming: Supabase project is "FurIndex", app is branded "FurIndex". Pick one.

---

## 2026-08-23 (evening) — hyu

**Marketing surface + review fixes. Build green: 15 routes, 0 type errors.**

**New pages** — all public (added to `PUBLIC_EXACT` in `src/middleware.ts`):
- `/` landing, `/partners`, `/science`, `/compare`.
- `/science` tells the Richard Scolyer personalised-cancer-vaccine story and
  argues veterinary oncology is a credible near-term venue. It states plainly
  that the case was n=1 and that his cancer later recurred — **verify the
  specifics against current reporting before demoing**, and keep the honesty;
  it is more persuasive than overclaiming, and a page that oversells an
  experimental therapy is a real liability.
- `/compare` positions against clinic apps, wearables, DNA tests, insurance and
  manual trackers, and includes a "where we're genuinely behind" section.

**Fixed from the code review** (agent verified independently with its own toolchain):
- Retry lock: a document stuck in `extracting` after a timeout could never be
  retried — the 409 guard made the retry button permanently dead. Guard removed;
  extraction is idempotent.
- `field_definitions` upsert was rewriting `field_type` on every new document,
  which would flip an established `number` field to `text` and strand earlier
  values in the wrong column. Now select-then-insert, and values always coerce
  with the EXISTING type.
- `custom_values` was written but never read anywhere — the feature the landing
  page advertises had no read path. Added `src/components/CustomFields.tsx`,
  rendered on the pet page.
- Image upload cap was 20 MB; the Anthropic API rejects images far below that,
  and phone photos clear 5 MB easily. Now 4.5 MB for images, 20 MB for PDFs.
- `toggleReaction` wasn't awaited inside `startTransition` — no pending state,
  unhandled rejection on failure.
- Dashboard "Coming up" could fill its 20-row window with long-past overdue rows
  and miss near-term ones. Added a 90-day floor.
- Wired `leaveCommunity` (JoinCommunity promised "leave at any time" and it was
  unreachable) and `deleteDocument` (a failed upload couldn't be discarded).
- Removed `npm run lint` — no ESLint config, and it dropped into an interactive
  prompt that would hang CI.

**Deferred, on purpose**
- `src/lib/types.ts` has `Relationships: []` and `Insert: Partial<T>`, so FK
  embeds don't typecheck and NOT NULL omissions are runtime errors rather than
  compile errors. Real fix is `npx supabase gen types` — needs a project ref,
  which we don't have yet. Do this right after the Supabase project exists.
- No CI workflow.

**Footgun found the hard way**
- With `NEXT_PUBLIC_SUPABASE_*` unset, EVERY route 500s — including the public
  landing page, because `MarketingNav` calls `getUser()`. Set the env vars in
  Vercel *before* the first deploy or the demo URL is a 500.

**Next**
- Supabase project + run `supabase/schema.sql` + one real end-to-end upload.
- `ANTHROPIC_API_KEY` in `.env.local`.
- Deploy to Vercel.

---

## 2026-08-23 (later) — hyu

**Built and VERIFIED — `npm run build` passes, 12 routes, 0 type errors.**
A local Node 22.11 was installed at `/home/hyu/personal/.node` (outside the repo)
so the scaffold could actually be compiled rather than hoped at.

**Added**
- Vet report ingestion. Upload a PDF or phone photo → Claude Opus 5 reads it via
  structured outputs (`messages.parse` + `zodOutputFormat`) → owner reviews every
  extracted line → only ticked rows are written. `src/lib/extraction.ts`,
  `src/app/api/documents/[id]/extract/route.ts`, `src/components/ExtractionReview.tsx`.
- Reports can create the pet. `documents.pet_id` is nullable, so a first upload
  with zero pets on file creates the animal from the document's own identity block.
- User-defined fields. Anything the report holds that the fixed tables don't
  (blood glucose, BCS, dental grade) becomes a `field_definitions` row the owner
  accepts, and lines up automatically with the next report using the same label.
- Daily fact panel, generated per owner per day from the species/ages they keep,
  cached in `daily_facts` so a reload doesn't re-bill an API call.
- Community: opt-in profiles, published pets, posts, reactions.
- Public marketing landing page at `/` with the partnership pitch.

**Fixed during the build (would all have cost you time)**
- `next@15.1.0` ships a known CVE (CVE-2025-66478). Pinned to `15.5.23`.
  Deliberately NOT 16.x — major-version break, wrong bet on a hackathon clock.
- `@anthropic-ai/sdk@0.71` has neither `messages.parse` nor `helpers/zod`.
  Now on `0.120.0`.
- The SDK's zod helper needs **zod v4**; v3 fails to typecheck. Now on `4.4.3`.
- The hand-written `Database` type used `Record<string, never>` for Views, which
  does not satisfy supabase-js's schema constraint — every query silently
  degraded to `never` (~60 errors). Fixed to the `{ [_ in never]: never }` form
  that `supabase gen types` emits.
- `@supabase/ssr@0.5.2` was too old for that type shape. Now `0.12.4`.
- Dropped two PostgREST FK embeds (`select("*, pets(name)")`) — the hand-written
  types carry no relationship metadata, so the join can't resolve. Joined in JS.

**Known, accepted**
- `npm audit` reports 3 high vulns in `sharp` (transitive via next image
  optimization). The only offered fix is next@16. We don't use `next/image`, so
  the exposed surface is nil. Revisit after the hackathon.
- No test suite.
- Nothing has been run against a real Supabase project yet — schema.sql is
  unexecuted. That is the single biggest untested surface.

**Next**
- Create the Supabase project, run the whole of `supabase/schema.sql`, and do one
  real end-to-end upload. Log what breaks here.
- Set `ANTHROPIC_API_KEY` locally or extraction 500s.
- Deploy to Vercel for the demo URL.

---

## 2026-08-23 — hyu

**Done**
- Scaffolded the app: Next.js 15 (App Router) + React 19 + TypeScript +
  Tailwind v4 + Supabase.
- Data model and RLS in `supabase/schema.sql`: pets, vaccinations, medications,
  weight_logs, vet_visits. Every table owner-scoped.
- Auth: magic link, session refresh in `src/middleware.ts`.
- Screens: dashboard (due/overdue feed), pet list, add pet, pet detail with
  tabbed record entry and an SVG weight trend.

**Not yet verified**
- Nothing has been built or run. The scaffold was written on a machine with no
  Node toolchain, so `npm install && npm run dev` has never executed. First
  person on a laptop: run it and log what breaks here.

**Next**
- Stand up the Supabase project and paste in `schema.sql`.
- Confirm the magic-link round trip works end to end.
- Deploy to Vercel to get a demo URL for the Sundai project page.
