import Link from "next/link";
import MarketingNav from "@/components/MarketingNav";
import { getUser } from "@/lib/supabase/server";

export const metadata = {
  title: "Personalised medicine is coming for pets — FurIndex",
  description:
    "What a personalised cancer vaccine is, why veterinary oncology is a credible place for it, and what has to exist first.",
};

export default async function SciencePage() {
  const user = await getUser();

  return (
    <div className="min-h-screen">
      <a href="#main" className="skip-link">
        Skip to content
      </a>
      <MarketingNav signedIn={!!user} />

      <main id="main">

      {/* ---------------------------------------------------------- hero --- */}
      <section className="mx-auto max-w-3xl px-5 pb-10 pt-16">
        <p className="muted text-xs font-medium uppercase tracking-widest">
          Where this is going
        </p>
        <h1 className="mt-3 text-3xl font-semibold leading-tight tracking-tight sm:text-4xl">
          Personalised cancer medicine is arriving for humans.
          <br />
          <span className="text-[var(--brand-text)]">Dogs may get there faster.</span>
        </h1>
        <p className="muted mt-5 text-base leading-relaxed">
          Not as a metaphor. Veterinary oncology already has a licensed therapeutic
          cancer vaccine, and dogs develop spontaneous cancers that resemble human
          disease more closely than any engineered mouse. The bottleneck is not the
          biology. It is that almost no dog has a health record worth analysing.
        </p>
      </section>

      {/* --------------------------------------------------------- story --- */}
      <section className="border-y border-[var(--border)] bg-brand-50/30">
        <div className="mx-auto max-w-3xl px-5 py-14">
          <h2 className="text-xl font-semibold tracking-tight">
            The case that made people pay attention
          </h2>

          <p className="muted mt-4 text-sm leading-relaxed">
            In June 2023 the Australian pathologist <strong>Richard Scolyer</strong> —
            one of the world&apos;s leading melanoma pathologists, and then
            co-medical director of Melanoma Institute Australia — was diagnosed
            with glioblastoma, IDH wild-type. It is a brain cancer with a grim and
            famously unmoved prognosis, typically measured in months.
          </p>

          <p className="muted mt-3 text-sm leading-relaxed">
            He did something unusual. With his colleague Georgina Long, he applied
            to his own brain the approach his career had helped develop for
            melanoma: combination immunotherapy given <em>before</em> surgery
            rather than after, plus a vaccine built from the specific mutations
            found in his own tumour tissue. He was the first brain cancer patient
            in the world to receive either. The two were named Australians of the
            Year in 2024.
          </p>

          <div className="card mt-6 p-5">
            <p className="text-sm font-medium">What actually happened</p>
            <p className="muted mt-2 text-sm leading-relaxed">
              He went <strong>22 months without recurrence</strong>, against a
              median time to recurrence for this cancer of roughly six months. In
              March 2025 the tumour returned; some of it could not be removed, and
              he described the prognosis as poor. <strong>He died on 7 June 2026,
              aged 59</strong>, about three years after a diagnosis that normally
              allows months. He had stepped down from his role at the Institute
              shortly before.
            </p>
          </div>

          <div className="card mt-4 p-5">
            <p className="text-sm font-medium">
              Be honest about what this was, and wasn&apos;t
            </p>
            <p className="muted mt-2 text-sm leading-relaxed">
              This was <strong>n = 1</strong>. Not a trial, no control arm, and not
              evidence of efficacy — a scientist consenting to an untested protocol
              on himself, with full knowledge of the odds. It did not cure him.
            </p>
            <p className="muted mt-2 text-sm leading-relaxed">
              We think the story is worth telling precisely because of how it
              ended. The interesting claim is not that this beats cancer. It is
              that a therapy can now be built against one individual&apos;s tumour
              at all — and that what limits it is increasingly data and
              manufacturing logistics rather than fundamental science. The
              neoadjuvant immunotherapy data from that work was published in
              Nature Medicine; the approach outlived the patient.
            </p>
          </div>
        </div>
      </section>

      {/* ------------------------------------------------------- how it works */}
      <section className="mx-auto max-w-3xl px-5 py-14">
        <h2 className="text-xl font-semibold tracking-tight">
          What &ldquo;personalised cancer vaccine&rdquo; actually means
        </h2>
        <p className="muted mt-3 text-sm leading-relaxed">
          It is not a preventive vaccine. Nothing here stops an animal getting cancer.
          It is a treatment that teaches an immune system to recognise a tumour it has
          been ignoring.
        </p>

        <ol className="mt-6 space-y-4">
          {[
            {
              n: "1",
              t: "Sequence the tumour and the healthy tissue",
              b: "Compare them. The differences are mutations the cancer carries and the rest of the body does not.",
            },
            {
              n: "2",
              t: "Find the neoantigens",
              b: "A subset of those mutations produce altered proteins that the immune system could, in principle, see as foreign. Predicting which ones is the hard computational step.",
            },
            {
              n: "3",
              t: "Manufacture against that individual",
              b: "Build a vaccine — mRNA or peptide — encoding those specific neoantigens. Every batch is one patient's.",
            },
            {
              n: "4",
              t: "Train the immune system on them",
              b: "T-cells that were ignoring the tumour learn to find it. Often paired with checkpoint inhibitors that stop the tumour switching that response off.",
            },
          ].map((s) => (
            <li key={s.n} className="card flex gap-4 p-4">
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-brand-600 text-xs font-semibold text-white">
                {s.n}
              </span>
              <div>
                <p className="text-sm font-medium">{s.t}</p>
                <p className="muted mt-1 text-sm leading-relaxed">{s.b}</p>
              </div>
            </li>
          ))}
        </ol>
      </section>

      {/* ------------------------------------------------------------ pets --- */}
      <section className="border-y border-[var(--border)]">
        <div className="mx-auto max-w-3xl px-5 py-14">
          <h2 className="text-xl font-semibold tracking-tight">
            Why dogs are not a lesser version of this
          </h2>

          <div className="mt-5 space-y-4">
            <div className="card p-5">
              <p className="text-sm font-medium">It already exists, in part</p>
              <p className="muted mt-2 text-sm leading-relaxed">
                A therapeutic vaccine for canine oral melanoma (ONCEPT) was
                conditionally licensed by the USDA in 2007 and <strong>fully
                licensed in February 2010</strong> — described at the time as the
                first USDA-approved therapeutic cancer vaccine in either animals or
                humans. Veterinary medicine did not wait for permission to try
                immunotherapy; on this particular front it got there first.
              </p>
            </div>

            <div className="card p-5">
              <p className="text-sm font-medium">The cancers are real, not induced</p>
              <p className="muted mt-2 text-sm leading-relaxed">
                Dogs develop osteosarcoma, lymphoma, melanoma and haemangiosarcoma
                spontaneously, with intact immune systems, sharing our homes, water and
                air. That is a far better model of human disease than a mouse
                engineered to grow a tumour on schedule — which is why comparative
                oncology programmes run canine trials alongside human ones.
              </p>
            </div>

            <div className="card p-5">
              <p className="text-sm font-medium">The traffic already runs both ways</p>
              <p className="muted mt-2 text-sm leading-relaxed">
                The NCI&apos;s Comparative Oncology Trials Consortium runs drug
                trials in pet dogs with naturally occurring cancers specifically to
                inform human drug development. It is not hypothetical: results from
                dogs with osteosarcoma treated with L-MTP-PE formed part of the
                rationale for taking it into Phase III trials in children.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* ------------------------------------------------------ our part ----- */}
      <section className="mx-auto max-w-3xl px-5 py-14">
        <h2 className="text-xl font-semibold tracking-tight">
          Where a records app fits — and where it doesn&apos;t
        </h2>

        <p className="muted mt-3 text-sm leading-relaxed">
          We want to be exact about this, because health-tech routinely overclaims.
          <strong> FurIndex is not a therapy, a diagnostic, or medical advice.</strong>{" "}
          We do not sequence anything. We will never tell you your animal has cancer.
        </p>

        <p className="muted mt-3 text-sm leading-relaxed">
          What personalised veterinary medicine needs, and mostly does not have, is a
          baseline. To know that a tumour is growing you need the weight from eighteen
          months ago. To read a genomic panel usefully you need the clinical history it
          sits inside. To enrol an animal in a trial you need records a researcher can
          actually use. Today that history is a folder of PDFs, a drawer of paper, and
          an owner&apos;s memory.
        </p>

        <div className="card mt-6 p-5">
          <p className="text-sm font-medium">So we started at the boring end</p>
          <p className="muted mt-2 text-sm leading-relaxed">
            Read the paperwork owners already have. Structure it. Keep it longitudinal
            and owner-permissioned. Make the field layer open enough that a genomic
            panel or a sensor stream can write into it without us redesigning the
            schema.
          </p>
          <p className="muted mt-2 text-sm leading-relaxed">
            That is unglamorous next to a cancer vaccine. It is also the part that has
            to exist first, and the part nobody is doing.
          </p>
        </div>

        <div className="mt-8 flex flex-wrap gap-3">
          <Link
            href="/partners"
            className="inline-flex min-h-11 items-center rounded-lg bg-brand-600 px-5 py-2.5 text-sm font-medium text-white hover:bg-brand-700"
          >
            Partner with us
          </Link>
          <Link
            href={user ? "/dashboard" : "/login"}
            className="inline-flex min-h-11 items-center rounded-lg border border-[var(--border)] px-5 py-2.5 text-sm font-medium hover:border-brand-500 hover:text-[var(--brand-text)]"
          >
            Start a record
          </Link>
        </div>

        <div className="muted mt-8 border-t border-[var(--border)] pt-4 text-xs leading-relaxed">
          <p>
            Educational content only. Nothing here is veterinary or medical advice —
            talk to your vet about your animal, and to a doctor about yourself.
          </p>
          <p className="mt-2">
            Facts on this page were checked against public reporting on 23 August
            2026. Sources: ABC News (Scolyer diagnosis, 22-month remission, March
            2025 recurrence, death 7 June 2026); Merial/USDA announcement of full
            ONCEPT licensure, February 2010; Paoloni &amp; Khanna, &ldquo;The
            Comparative Oncology Trials Consortium,&rdquo; PLOS Medicine 2009.
          </p>
        </div>
      </section>
      </main>
    </div>
  );
}
