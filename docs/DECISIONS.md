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

---

## 5. A feeding plan is superseded, never overwritten or deleted

**Date:** 2026-08-23 · **Status:** accepted

Changing a pet's food inserts a new `feeding_plans` row and marks the previous
one `is_current = false` with an `ended_on` date. Nothing updates a plan in
place, and nothing deletes one.

**Why:** "when did you change her food?" is one of the first questions asked
about a skin, gut or weight problem, and the answer is usually months old. An
in-place edit destroys exactly the dates that make the history diagnostic, and
the owner has no way to reconstruct them.

**Consequence:** the plan table grows one row per diet change, and every read
has to pick the current plan rather than assuming one row per pet. A "correct a
typo" affordance would need a genuine update path — add it deliberately, don't
reach for it by turning supersede into overwrite.

---

## 6. A journal time is optional, local, and never interpreted

**Date:** 2026-08-23 · **Status:** accepted

`journal_entries.occurred_at` is a **nullable** bare `time` — the owner's local
wall clock, stored verbatim, never combined with a date and never turned into an
instant on the server. `JournalPatterns` draws it back as a 24-hour clock face
and a weekday/weekend pair, states its own n, and refuses to draw below 8 timed
entries.

**Why time at all:** Gruen et al. 2017, PLOS ONE 12(1):e0169576 (n=98 cats)
measured activity as strongly bimodal across the day — morning peak ~05:30–09:00,
evening peak ~17:00–23:00, trough ~02:00–05:00 — with weekday/weekend patterns
differing at p<0.0001. A date-only entry discards the axis with the largest
measured effect in that literature. "Vomiting at 3am" and "vomiting after dinner"
are different stories.

**Why nullable:** same reasoning as `severity`. Most observations are recalled as
"sometime this morning". A forced clock reading invents data that reads as
precise in a vet's hands.

**Why bare `time` and not `timestamptz`:** an `<input type="time">` value is the
owner's local wall clock with no instant behind it. Resolving it in the server's
zone would silently shift every entry for every owner who doesn't live there.
The same reasoning made the future-date guard in `journal-actions.ts` allow a
day of slack rather than compare a local date to a UTC one.

**Why the view claims nothing:** that same paper found mean activity did NOT
differ between arthritic (n=83) and healthy (n=15) cats (p=0.541), and could not
classify any individual animal. So there is no population curve to overlay and
no "normal" to deviate from. `JournalPatterns` describes what the owner logged
and nothing else — no comparison to other animals, no health language. Do not
add a reference curve, a "your pet is unusual" badge, or a severity overlay to
it; the evidence for any of them does not exist.

**Consequence:** the 8-entry floor and the 60%-share bar before naming a part of
the day are load-bearing, not cosmetic — they hold the false "most often in the
evening" rate near one in ten under a patternless log. Lowering either turns the
sentence into noise an owner will repeat to a vet.

## 7. Profile answers are `text[]` of stable keys, one row per pet

**Date:** 2026-08-23 · **Status:** accepted

`pet_profiles` is one row per pet (`pet_id` is the primary key), with a
`text[]` column per multi-select question and a `profile_tristate` enum column
per yes/no/not-sure question. The values stored are the option **keys** defined
in `src/lib/pet-profile.ts` (`joint_mobility`), never the display labels
("Joint / mobility").

**Why arrays and not jsonb:** the reason to collect any of this is to be able to
ask "how many anxious cats live in apartments" later. As arrays that is

```sql
where 'anxious' = any(personality) and 'apartment' = any(home_type)
```

against a GIN index — plain SQL, no JSON path expressions, and a mistyped key
fails loudly at review time rather than silently matching nothing. In jsonb the
same question is a string-matching exercise against a document whose shape
nothing enforces.

**Why keys and not labels:** labels are copy and get reworded. A stored label
means "Joint / mobility" and "Joint or mobility" become two cohorts in one
column and nothing ever tells you. Renaming an option key is a migration;
rewording its label is not. This is the whole reason the option lists live in
`src/lib/pet-profile.ts` rather than in the JSX — the form renders from that
list and the server action validates against the same list, so the two cannot
drift.

**Why one row per pet, not a row per answer:** every question has exactly one
answer per pet at a time and the question set is authored, not user-defined. A
tall answers table would buy flexibility nothing needs and cost a pivot on every
read. `custom_values` is the tall table for the things owners define themselves;
this is not that.

**Why `completed_blocks`:** an empty `text[]` cannot tell "asked, nothing
applied" apart from "never asked". Without the difference, the pet page keeps
offering the questionnaire to someone who has already been through and declined
every block. Skipping is a complete answer to an optional question and has to be
recordable as one.

**Consequence:** the seven blocks save one at a time (`saveProfileBlock`), so the
most an interrupted session can lose is the screen on the display. Do not
collapse them into a single submit at the end.
