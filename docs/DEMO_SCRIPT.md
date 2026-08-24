# FurIndex — 5 minute launch script

Roughly 650 spoken words plus demo pauses. At a normal pace that lands at
4:30–4:50, which leaves you a margin rather than a cliff.

---

## Before you walk up (2 minutes of setup, do not skip)

- [ ] Signed in on **https://furindex.vercel.app**, sitting on `/dashboard`
- [ ] **One pet already created** — the demo is about the record filling itself,
      not about typing a pet's name in front of people
- [ ] A vet PDF on the desktop, ready to drag. If you don't have one, use the
      **"or try a sample report"** button under the upload box — it needs no
      file and no network luck
- [ ] A second tab already open on that pet's page, so you can cut to the
      finished record without waiting for a page load
- [ ] Browser zoom at ~125%. Nobody past row three can read 16px
- [ ] Phone hotspot ready

**If the wifi dies:** talk through the same beats over the screenshots and say
"it's live, go try it on your phone while I finish." Do not debug on stage.

---

## [0:00 – 0:40] The problem

> Quick show of hands — who here has a pet?
>
> Keep your hand up if you know when their last rabies shot was.
>
> *(pause — hands drop)*
>
> That's the problem. Not that you don't care. It's that the answer is in a
> folder, or a photo of a folder, or an email from a vet you stopped going to
> two years ago.
>
> And the one moment you need it — a new clinic, a boarding kennel, something
> going wrong at eleven at night — is exactly the moment you can't find it.

---

## [0:40 – 1:00] What it is

> FurIndex is a health record for your pet that a vet can actually read.
>
> It's live right now, it's open, there's no password, and it's open source.

---

## [1:00 – 2:20] The demo — this is the whole pitch

> Here's the part I actually want to show you.
>
> This is a real vet invoice. A PDF. The kind you get emailed once and never
> open again.

**→ Drag the PDF onto the upload box.**

> I'm dropping it in. And —

**→ Review screen appears. Let it land. Don't talk over it.**

> It read it.
>
> Three vaccinations — rabies, DHPP, bordetella — each with the date it was
> given, when the next one is due, and the lot number. Two medications with
> their doses. Her weight, 9.39 kilos. The visit itself: the clinic, and two
> hundred and eighty-four dollars fifty.
>
> Ten records, out of one PDF, in the time it took to upload.
>
> Now — the part that matters. **Nothing has been saved yet.** Every line has a
> checkbox. I keep what's right and I drop what isn't. It proposes; I decide.

**→ Click Save.**

> And now it's her record.
>
> That's the product. The paperwork you already have becomes a record you can
> actually use.

---

## [2:20 – 3:00] The thing you can't see

> Here's what I'm proudest of, and you can't see any of it.
>
> There's no AI API key behind that.
>
> No OpenAI, no Anthropic, no per-document cost. It's the PDF's own text layer,
> OCR for photographs, and a parser that knows what a vaccination record looks
> like. Which means three things: it's free to run, it doesn't get more
> expensive as more people use it, and **your vet records aren't shipped to a
> third party to be read.**
>
> If a model is available, it uses it and does better. When there isn't one —
> and right now there isn't — it still works.

---

## [3:00 – 4:00] Three decisions we'd defend

> Three calls we made that I'd defend in an argument.
>
> **One. Dates are arithmetic, not medical advice.** We'll tell you rabies is
> due in a year — and on the same screen we'll tell you it might be three, that
> it depends on your local law and which vaccine your clinic used, and that we
> can't know which. So go check your certificate.
>
> **Two. We won't tell you what your dog is like from its breed.** There's a
> 2022 paper in *Science*, eighteen thousand dogs: breed explains about nine
> percent of the behavioural difference between individual dogs. Nine. So we
> describe the body and never the character. Every pet app does the opposite.
>
> **Three. Your health data never becomes social data.** There's a community in
> here. There is deliberately no database link — none — between a post and a
> medical record. If you want to share something, you type it yourself.

---

## [4:00 – 4:35] Where it goes, and the ask

> Where this goes next is vets and wearables.
>
> Today we read the owner's PDF. The better version is the clinic writing
> straight into the record.
>
> And a collar that counts steps is only worth anything if the weight, the
> medications and the vet visits are sitting right next to it — which, now,
> they are.
>
> That's a real ask, not a slide. If you work with a clinic network or a device
> company, come find me afterwards.

---

## [4:35 – 5:00] Close

> FurIndex. Open, no password, works on your phone right now. Code's on GitHub,
> MIT licensed.
>
> Go and look up when your dog's rabies shot is due.
>
> That's it. Thank you.

---

## Likely questions

**"How accurate is the extraction?"**
On PDFs with a real text layer, exact — every field on our test set. On
photographs it's OCR, and OCR gets digits wrong: it read 75 mg as 25 mg once.
That's why it reports low confidence on photos and pre-ticks nothing, so a
misread has to get past a human before it becomes a health record.

**"What about privacy?"**
Row-level security on every table in Postgres — the database scopes each query
to the signed-in owner, not the application code. So a bug in a page can't leak
another person's records.

**"Is this a medical device / does it give advice?"**
No, and it goes out of its way not to. It records what you tell it and does
date arithmetic. Every screen that could be read as advice says who actually
decides — your vet.

**"What's the business model?"**
Not answered yet, and I'd rather say that than invent one. The honest version:
the clinic side is where the value is, and free-to-run infrastructure means we
can find that out without a burn rate.

**"How long did this take?"**
One Sundai build. It's live and open source — you can read every commit.
