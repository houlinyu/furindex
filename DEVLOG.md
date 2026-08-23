# Development log

Append-only. Newest entry at the top. One entry per working session — not per
commit, git already has those.

The point of this file is the stuff git can't tell you: what we tried that
didn't work, what we're blocked on, and what the next person to sit down should
pick up. If you leave the project mid-thought, write the thought down here.

**Format:** `## YYYY-MM-DD — who`, then what changed / what's blocked / what's next.

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
