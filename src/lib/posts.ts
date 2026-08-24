/**
 * The writing. Typed data, no CMS, no new dependency.
 *
 * Adding a fourth post is one object appended to POSTS below. Nothing else
 * changes: the index, the per-post route, generateStaticParams, the reading
 * time and the RSS feed all read from this array.
 *
 * Bodies are blocks of plain strings rather than JSX so that two things stay
 * honest and automatic — the reading time (word count of the real prose, not a
 * number somebody typed and then let rot) and the RSS description. Inline
 * emphasis and links use a three-rule markup that PostBody renders:
 *
 *   **bold**            _italic_            [text](https://url)
 *
 * That is the whole vocabulary. If a post ever needs more than that, it wants
 * to be a TSX module, not a bigger parser.
 *
 * No "use client" anywhere in this chain: the post pages are server components
 * and importing a value out of a client module into one is the thing that has
 * taken this app down before.
 */

export type Block =
  /** Body paragraph. */
  | { p: string }
  /** Section heading (renders as an h2). */
  | { h: string }
  /** Bulleted list. */
  | { ul: string[] }
  /** Numbered steps, each with a short title and a line of explanation. */
  | { steps: { t: string; b: string }[] }
  /** A bordered aside — used for the caveats, which are the point, not a footnote. */
  | { note: { t: string; p: string[] } };

export type Source = { label: string; url: string };

export type Post = {
  slug: string;
  title: string;
  /** ISO yyyy-mm-dd. Sorted on, and rendered as a local-independent UTC date. */
  date: string;
  /** One line. Shown under the title on the index and as the RSS description. */
  standfirst: string;
  /** Used for <meta name="description">; falls back to the standfirst. */
  description?: string;
  body: Block[];
  sources: Source[];
  /** When the figures in this post were last checked against the sources. */
  checkedOn: string;
};

// ---------------------------------------------------------------- helpers ---

/** Strips the inline markup so word counts and RSS text see prose, not syntax. */
export function stripMarkup(text: string): string {
  return text
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/_([^_]+)_/g, "$1");
}

/** Every piece of prose in a body, in order. */
export function blockText(block: Block): string[] {
  if ("p" in block) return [block.p];
  if ("h" in block) return [block.h];
  if ("ul" in block) return block.ul;
  if ("steps" in block) return block.steps.flatMap((s) => [s.t, s.b]);
  return [block.note.t, ...block.note.p];
}

export function postPlainText(post: Post): string {
  return post.body.flatMap(blockText).map(stripMarkup).join("\n\n");
}

/**
 * Minutes, at 220 words a minute — the middle of the usual 200–250 range for
 * adult silent reading of non-fiction. Rounded up, floor of one, because "0 min
 * read" is not a thing.
 */
export function readingMinutes(post: Post): number {
  const words = postPlainText(post).split(/\s+/).filter(Boolean).length;
  return Math.max(1, Math.round(words / 220));
}

/**
 * Fixed to UTC on purpose. Rendering a date through the server's local zone
 * makes it hydrate differently in the browser and flip by a day either side of
 * midnight — the same bug the journal timestamps had.
 */
export function formatPostDate(iso: string): string {
  return new Date(`${iso}T12:00:00Z`).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}

// ------------------------------------------------------------------ posts ---

export const POSTS: Post[] = [
  {
    slug: "cancer-vaccine-for-one-dog",
    title: "A machine-learning engineer built a cancer vaccine for his own dog",
    date: "2026-08-23",
    standfirst:
      "One dog, no control arm, and a result worth taking seriously anyway — for what it says is possible rather than what it proves.",
    description:
      "What a personalised cancer vaccine is, why veterinary oncology is a credible place for it, and what has to exist first.",
    body: [
      {
        p: "Personalised cancer medicine is arriving for humans. Dogs may get there faster. Veterinary oncology already has a licensed therapeutic cancer vaccine, and dogs develop spontaneous cancers that resemble human disease far more closely than any engineered mouse. The bottleneck is not the biology. It is that almost no dog has a health record worth analysing.",
      },

      { h: "It has already been done for one dog" },
      {
        p: "**Rosie** was Paul Conyngham's dog. Surgery, then chemotherapy, then immunotherapy — all of it failed. Conyngham is not an oncologist; he is a machine-learning engineer, around seventeen years of it, who had previously co-founded an applied-AI company.",
      },
      {
        p: "So he sequenced her tumour and her healthy tissue, used the difference to identify candidate neoantigens — mutated proteins her immune system might be taught to recognise — and, with scientists at UNSW, had an mRNA vaccine made against that specific list. It is believed to be the first fully computationally designed mRNA cancer vaccine given to a dog. Doing it by hand took roughly **a year and about $20,000**.",
      },
      {
        note: {
          t: "What happened, and what it is not",
          p: [
            "Rosie's responsive tumours shrank by a reported **50–75%**, with substantial immune-cell infiltration.",
            "That is one dog. It is n=1, it has no control arm, the figures are the company's own account, and none of it is peer-reviewed. It is not evidence that this works. It is evidence that it is _possible_, which is a different and much earlier claim.",
          ],
        },
      },
      {
        p: "The honest next step is the one being taken. Conyngham's company **Gamgee** (Y Combinator, Summer 2026) has a second-generation vaccine and a **30-dog trial** running in Australia. Those results do not exist yet. When they do, they will mean far more than Rosie does.",
      },
      {
        p: "The human parallel, briefly: the Australian pathologist Richard Scolyer applied his own melanoma research to his glioblastoma, went **22 months** without recurrence against a median of about **six**, and died on 7 June 2026. Personalised cancer vaccines are early everywhere. Dogs are simply where the work can move fastest.",
      },

      { h: "What “personalised cancer vaccine” actually means" },
      {
        p: "It is not a preventive vaccine. Nothing here stops an animal getting cancer. It is a treatment that teaches an immune system to recognise a tumour it has been ignoring.",
      },
      {
        steps: [
          {
            t: "Sequence the tumour and the healthy tissue",
            b: "Compare them. The differences are mutations the cancer carries and the rest of the body does not.",
          },
          {
            t: "Find the neoantigens",
            b: "A subset of those mutations produce altered proteins the immune system could, in principle, see as foreign. Predicting which ones is the hard computational step.",
          },
          {
            t: "Manufacture against that individual",
            b: "Build a vaccine — mRNA or peptide — encoding those specific neoantigens. Every batch belongs to one patient.",
          },
          {
            t: "Train the immune system on them",
            b: "T-cells that were ignoring the tumour learn to find it. Often paired with checkpoint inhibitors that stop the tumour switching that response off.",
          },
        ],
      },

      { h: "Why dogs are not a lesser version of this" },
      {
        note: {
          t: "It already exists, in part",
          p: [
            "A therapeutic vaccine for canine oral melanoma (ONCEPT) was conditionally licensed by the USDA in 2007 and **fully licensed in February 2010** — described at the time as the first USDA-approved therapeutic cancer vaccine in either animals or humans. Veterinary medicine did not wait for permission to try immunotherapy; on this particular front it got there first.",
          ],
        },
      },
      {
        note: {
          t: "The cancers are real, not induced",
          p: [
            "Dogs develop osteosarcoma, lymphoma, melanoma and haemangiosarcoma spontaneously, with intact immune systems, sharing our homes, water and air. That is a better model of human disease than a mouse engineered to grow a tumour on schedule.",
          ],
        },
      },
      {
        note: {
          t: "The traffic already runs both ways",
          p: [
            "The NCI's Comparative Oncology Trials Consortium runs drug trials in pet dogs with naturally occurring cancers specifically to inform human drug development. It is not hypothetical: results from dogs with osteosarcoma treated with L-MTP-PE formed part of the rationale for taking it into Phase III trials in children.",
          ],
        },
      },

      { h: "Where a records app fits, and where it does not" },
      {
        p: "We want to be exact about this, because health-tech routinely overclaims. **FurIndex is not a therapy, a diagnostic, or medical advice.** We do not sequence anything. We will never tell you your animal has cancer.",
      },
      {
        p: "What personalised veterinary medicine needs, and mostly does not have, is a baseline. To know that a tumour is growing you need the weight from eighteen months ago. To read a genomic panel usefully you need the clinical history it sits inside. To enrol an animal in a trial you need records a researcher can actually use. Today that history is a folder of PDFs, a drawer of paper, and an owner's memory.",
      },
      {
        note: {
          t: "So we started at the boring end",
          p: [
            "Read the paperwork owners already have. Structure it. Keep it longitudinal and owner-permissioned. Make the field layer open enough that a genomic panel or a sensor stream can write into it without us redesigning the schema.",
            "That is unglamorous next to a cancer vaccine. It is also the part that has to exist first, and the part nobody is doing.",
          ],
        },
      },
    ],
    sources: [
      {
        label:
          "Gamgee — Y Combinator company profile (founder background, the Rosie case, the reported 50–75% shrinkage, the 30-dog trial, S2026 batch)",
        url: "https://www.ycombinator.com/companies/gamgee",
      },
      {
        label:
          "ABC News — Richard Scolyer's 22-month remission and his death on 7 June 2026",
        url: "https://www.abc.net.au/news/2026-06-08/professor-richard-scolyer-dies-from-brain-cancer-aged-59/104442396",
      },
      {
        label:
          "USDA/Merial — full licensure of ONCEPT canine oral melanoma vaccine, February 2010",
        url: "https://www.avma.org/javma-news/2010-03-15/canine-cancer-vaccine-gets-full-license",
      },
      {
        label:
          "Paoloni & Khanna — the NCI Comparative Oncology Trials Consortium, PLOS Medicine 2009, doi:10.1371/journal.pmed.1000161",
        url: "https://doi.org/10.1371/journal.pmed.1000161",
      },
    ],
    checkedOn: "23 August 2026",
  },

  {
    slug: "breed-tells-you-how-a-dog-looks",
    title: "Breed tells you how a dog looks, not who they are",
    date: "2026-08-23",
    standfirst:
      "Breed explains about 9% of the variance in dog behaviour. Two large genetic studies agree, and the second one found no behaviour genes at all.",
    description:
      "Morrill 2022 and Lord 2025 on what breed does and does not predict — and why we removed temperament labels from our own photo scanner.",
    body: [
      {
        p: "Ask what a dog will be like and almost everyone answers with a breed. Border collies are clever, labradors are friendly, terriers are stubborn. The two largest genetic studies to look at this directly both land in the same place: breed is an excellent predictor of a dog's body and a poor predictor of their behaviour.",
      },

      { h: "What the numbers actually are" },
      {
        p: "Morrill and colleagues, in _Science_ in 2022, surveyed **18,385 dogs** through their owners and genotyped **2,155** of them across **78 breeds**. Breed explained about **9%** of the variance in behaviour — a generalized eta squared of **0.089 ± 0.039**. An independent design in the same paper, run on mutts rather than purebreds, gave a marginal R² of **9 ± 3%** for behaviour against **20 ± 12%** for physical traits.",
      },
      {
        p: "The paper does not leave this to interpretation. One of its own section headings reads: **“Breed is not a reliable predictor of individual behavior.”**",
      },

      { h: "What 9% feels like from inside a breed" },
      {
        p: "A variance figure is abstract. The overlap is not. In every breed with at least 25 dogs in the survey, **67.2 ± 7.5%** of dogs scored within one standard deviation of the whole cohort's mean, and **95.4 ± 3.0%** within two. Nearly every dog of nearly every breed sits inside the ordinary middle of all dogs.",
      },
      {
        p: "The same asymmetry shows up when you ask which traits separate breeds at all. Only **5.1%** of breed–behaviour pairs were significantly differentiated — **30 out of 583**. For physical traits it was **41.5%**, or **17 out of 41**.",
      },

      { h: "Then the search for the genes came up empty" },
      {
        p: "Lord and colleagues, in _PNAS_ in 2025, took **3,287 dogs** and tested **135** candidate behaviour SNPs drawn from the prior literature — variants previously reported to be associated with dog behaviour. **Zero** of them were associated with any of the seven behavioural traits examined.",
      },
      {
        p: "This was not an underpowered study that found nothing anywhere. The same dogs, put through the same pipeline, produced **6,570** significant associations for appearance and **26** for behaviour.",
      },
      {
        p: "The heritability estimates tell the same story from the other side:",
      },
      {
        ul: [
          "Height — about **1.00**",
          "Ear shape — **0.98**",
          "Fur length — **0.95**",
          "“Easy to train” — **0.476**",
          "“Relaxed greeting people” — **0.081**",
        ],
      },
      {
        p: "Behaviour is not unheritable. Trainability at 0.476 is a real number. But it is a fraction of what shape an ear takes, and it is spread across the genome in a way that 135 of the field's best candidate variants could not touch.",
      },

      { h: "What we did with this" },
      {
        p: "Breed informs the **body**, not the **character**. That distinction has a product consequence, and we took it.",
      },
      {
        note: {
          t: "We removed the temperament chips from our photo scanner",
          p: [
            "Our breed scanner used to return temperament labels alongside its breed guess. It no longer does. Guessing a breed from a photo is already uncertain; hanging a personality prediction off that guess stacks a 9%-of-variance claim on top of an uncertain input and shows the result as though it described the animal in front of you.",
            "What the scanner returns now is what breed is actually good for: size, coat, build, and the health conditions that are genuinely breed-associated. Who your dog is, you will find out the ordinary way.",
          ],
        },
      },
      {
        p: "This matters beyond a feature. Breed-based behaviour assumptions decide which dogs get adopted, which are surrendered, and which are legislated against. The evidence for those assumptions is about 9%, and the genes underneath them have not been found.",
      },
    ],
    sources: [
      {
        label:
          "Morrill K. et al., “Ancestry-inclusive dog genomics challenges popular breed stereotypes,” Science 2022, doi:10.1126/science.abk0639",
        url: "https://doi.org/10.1126/science.abk0639",
      },
      {
        label:
          "Lord K.A. et al., PNAS 2025, doi:10.1073/pnas.2421752122 (135 candidate behaviour SNPs, n=3,287)",
        url: "https://doi.org/10.1073/pnas.2421752122",
      },
    ],
    checkedOn: "23 August 2026",
  },

  {
    slug: "the-feature-we-didnt-build",
    title: "The feature we didn't build",
    date: "2026-08-23",
    standfirst:
      "“Activity is down, your pet may be in pain” is the obvious feature for an activity tracker. In 98 cats, mean activity did not differ at all.",
    description:
      "Gruen 2017 found no difference in mean activity between cats with and without degenerative joint disease. Here is what we built instead.",
    body: [
      {
        p: "The obvious feature for an app that tracks a pet's activity writes itself. Activity is down; your pet may be in pain. Push a notification, suggest a vet visit, take the credit when it turns out to be arthritis. It is intuitive, it is easy to build, and every owner would understand it immediately.",
      },
      {
        p: "We went looking for the evidence and it pointed the other way.",
      },

      { h: "The study that should have supported it" },
      {
        p: "Gruen and colleagues, in _PLOS ONE_ in 2017, put Actical collar accelerometers on **98 cats** — **83** with radiographic degenerative joint disease and **15** without — and recorded activity in one-minute epochs.",
      },
      {
        p: "**Mean per-minute activity did not differ between the groups.** One-way ANOVA, **p = 0.541**. Not a small effect, not a trend in the expected direction with an underpowered sample. Nothing.",
      },
      {
        p: "It gets more awkward than that. Cats with **higher** pain scores were **more** active during the day, not less — the opposite sign to the one the feature assumes.",
      },

      { h: "There was a signal. It is not one you can use on an animal." },
      {
        p: "The paper did find a real difference, and it is worth being precise about what kind. Using functional data analysis on the shape of the 24-hour activity distribution — _when_ activity happened across the day, not _how much_ of it there was — the groups separated: functional Anderson–Darling **p = 0.013** at weekends and **p = 0.010** on weekdays. Cats with DJD had muted peaks and troughs.",
      },
      {
        note: {
          t: "That is a group-level result",
          p: [
            "The authors state it directly: this distinguishes groups of cats, and cannot classify an individual animal. A difference in the average shape of two distributions is not a test you can run on the cat asleep on your sofa.",
            "A product that shipped this as a per-pet alert would be taking a finding the authors explicitly scoped to populations and applying it to one animal, in a notification, to an owner who has no way to know the difference.",
          ],
        },
      },
      {
        p: "The paper's own limitations narrow it further. The normal cats were significantly younger than the DJD cats, which is close to unavoidable: radiographic DJD affects **60–92%** of older cats, so an age-matched group of genuinely normal old cats barely exists to recruit. Variability between individual cats was marked. And variability _between_ accelerometers exceeded variability _within_ a single accelerometer — two devices disagree with each other more than one device disagrees with itself.",
      },

      { h: "What we built instead" },
      {
        p: "Per-pet baselines, not population norms. Every trend in FurIndex compares an animal to its own history and to nothing else.",
      },
      {
        p: "That choice is not only a reaction to Gruen. Karimjee and colleagues, in _Royal Society Open Science_ in 2024, worked with **22 dogs** and found no significant effect of age on any of their activity metrics, and stated plainly that their sample was not large enough to systematically address breed or body size at all. Two studies, two species, different methods, converging on the same conclusion: the only reference point that reliably means something for an individual animal is that individual animal.",
      },
      {
        p: "So the app will tell you that this pet is meaningfully less active than this pet was last month. It puts that next to the weight, the medication changes and whatever you wrote in the journal, and it stops there. The interpretation is a conversation with your vet, not a push notification.",
      },

      { h: "The honest conclusion" },
      {
        p: "We wanted to build the pain-detection feature. The data contradicted it. In 98 cats, the single most intuitive signal in the whole category — less movement means more pain — was not there, and the one real effect was a group-level distribution shape the authors said could not be applied to an individual.",
      },
      {
        p: "We do not know how to detect pain from activity data. Nobody has shown that they do. Until somebody does, we would rather ship a smaller product that is true.",
      },
    ],
    sources: [
      {
        label:
          "Gruen M.E. et al., “The Use of Functional Data Analysis to Evaluate Activity in a Spontaneous Model of Degenerative Joint Disease Associated Pain in Cats,” PLOS ONE 2017;12(1):e0169576, doi:10.1371/journal.pone.0169576",
        url: "https://doi.org/10.1371/journal.pone.0169576",
      },
      {
        label:
          "Karimjee K., Harron R.C.M., Piercy R.J., Daley M.A., “A standardised approach to quantifying activity in domestic dogs,” Royal Society Open Science 2024;11(7):240119, doi:10.1098/rsos.240119",
        url: "https://doi.org/10.1098/rsos.240119",
      },
    ],
    checkedOn: "23 August 2026",
  },
];

/**
 * Newest first. The index, the RSS feed and /science's redirect all use this.
 *
 * All three posts carry the same date because all three were written on the
 * same day. They were briefly staggered a week apart, which made the blog look
 * like it had a publishing history it does not have — a small invention, but an
 * invention, in a place that spends three posts arguing for checking what you
 * are told. Every post's `checkedOn` line said 23 August the whole time and
 * quietly contradicted the fake dates.
 *
 * With ties, the order below falls back to the order in POSTS. Array.sort is
 * stable in every engine we target, but relying on that silently would leave
 * the running order of the blog resting on an implementation detail, so the
 * tiebreak is written down.
 */
const ORDER = new Map(POSTS.map((p, i) => [p.slug, i]));

export const POSTS_BY_DATE: Post[] = [...POSTS].sort(
  (a, b) => b.date.localeCompare(a.date) || ORDER.get(a.slug)! - ORDER.get(b.slug)!
);

export function getPost(slug: string): Post | undefined {
  return POSTS.find((p) => p.slug === slug);
}

/**
 * Where /science goes. It is the essay that used to live there, so the old URL
 * has to land on it rather than on the index — anyone who followed a link to
 * /science was promised that piece specifically.
 */
export const SCIENCE_POST_SLUG = "cancer-vaccine-for-one-dog";
