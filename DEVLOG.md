# Development log

Append-only. Newest entry at the top. One entry per working session — not per
commit, git already has those.

The point of this file is the stuff git can't tell you: what we tried that
didn't work, what we're blocked on, and what the next person to sit down should
pick up. If you leave the project mid-thought, write the thought down here.

**Format:** `## YYYY-MM-DD — who`, then what changed / what's blocked / what's next.

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
- Naming: Supabase project is "FurIndex", app is branded "Petfolio". Pick one.

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
