import Link from "next/link";
import MarketingNav from "@/components/MarketingNav";
import { getUser } from "@/lib/supabase/server";
import { CONTACT_EMAIL } from "@/lib/links";

export const metadata = {
  title: "Terms of Use — FurIndex",
  description:
    "The plain terms for using FurIndex: a record-keeping tool for pet owners, not veterinary advice, provided as-is by an independent project.",
};

const UPDATED = "26 August 2026";

function S({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-10">
      <h2 className="text-xl font-semibold tracking-tight">{title}</h2>
      <div className="muted mt-3 space-y-3 text-sm leading-relaxed sm:text-base">{children}</div>
    </section>
  );
}

export default async function TermsPage() {
  const user = await getUser();
  return (
    <div className="min-h-screen">
      <MarketingNav signedIn={!!user} />
      <main id="main" className="mx-auto max-w-3xl px-6 pb-24 pt-16">
        <p className="muted mb-3 text-sm font-medium uppercase tracking-[0.2em]">Terms of Use</p>
        <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">
          Using FurIndex.
        </h1>
        <p className="muted mt-4 text-sm">Last updated {UPDATED}.</p>

        <div className="card mt-8 p-5 text-sm leading-relaxed">
          <p className="font-medium">The short version</p>
          <p className="muted mt-2">
            FurIndex helps you keep your pet&apos;s health records. It is a
            record-keeping tool, <span className="font-medium">not veterinary
            advice</span>, and it is provided as-is by a small independent project.
            By creating an account or using the app, you agree to the terms below.
          </p>
        </div>

        {/* The single most important term for a pet-health app — kept prominent. */}
        <div className="card mt-6 border-amber-400 p-5 text-sm leading-relaxed">
          <p className="font-medium">Not veterinary or medical advice</p>
          <p className="muted mt-2">
            FurIndex helps you record and organise information — it does not diagnose,
            treat, or advise. Records read from a photo or PDF can be misread (a digit
            in a dose or date, a microchip number), so you should always check what
            the app shows against the original document, and nothing is saved to a
            record until you confirm it. Reminders are a convenience, not a guarantee.
            For any decision about your animal&apos;s health, rely on your
            veterinarian — not on this app.
          </p>
        </div>

        <S title="What FurIndex is">
          <p>
            A tool for pet owners to keep, read, and organise their own pet&apos;s
            records. It is offered free of charge by an independent operator (built as
            a Sundai project), not a company.
          </p>
        </S>

        <S title="Your account">
          <p>
            You are responsible for your login and for what happens under your
            account. Keep your password to yourself, give accurate information, and
            let us know if you think your account has been accessed by someone else.
            FurIndex is for adults (16+).
          </p>
        </S>

        <S title="Acceptable use">
          <p>Please use FurIndex only for its purpose. In particular, do not:</p>
          <ul className="list-disc space-y-2 pl-5">
            <li>upload or store other people&apos;s personal information without their permission;</li>
            <li>upload unlawful, harmful, or infringing content, or content you have no right to share;</li>
            <li>try to access another user&apos;s data, probe or break the app&apos;s security, or disrupt the service;</li>
            <li>use the app to provide veterinary or medical services to others.</li>
          </ul>
        </S>

        <S title="Your content">
          <p>
            What you put into FurIndex stays yours. You grant us only the limited
            permission needed to store and process it so the app can work for you (for
            example, to save a record, read an uploaded document, or show you your
            data). You are responsible for the content you add and for having the
            right to add it.
          </p>
        </S>

        <S title="The community">
          <p>
            If you choose to publish a pet to the community, that content becomes
            public and you are responsible for it. We may remove content that breaks
            these terms.
          </p>
        </S>

        <S title="Availability and changes">
          <p>
            This is a free, independent project. The app is provided on an{" "}
            <span className="font-medium">&ldquo;as is&rdquo; and &ldquo;as
            available&rdquo;</span> basis; it may change, have interruptions, or be
            discontinued. We will try to give reasonable notice of a major change but
            cannot promise uninterrupted service.
          </p>
        </S>

        <S title="Disclaimers and liability">
          <p>
            To the fullest extent permitted by law, FurIndex is provided without
            warranties of any kind, and the operator is not liable for any indirect or
            consequential loss, or for decisions made in reliance on information the
            app displayed — including any misread record. Always confirm important
            details against the original document and with your vet. Because FurIndex
            is provided free of charge, to the extent any liability cannot be
            excluded it is limited to EUR 100 (or its equivalent). Nothing in these
            terms limits any liability that cannot be limited by law.
          </p>
        </S>

        <S title="Ending your use">
          <p>
            You can stop using FurIndex at any time and delete your data (see the{" "}
            <Link className="underline underline-offset-4 hover:text-[var(--brand-text)]" href="/privacy">
              Privacy page
            </Link>
            ). We may suspend or close an account that abuses the service or breaks
            these terms.
          </p>
        </S>

        <S title="Changes to these terms">
          <p>
            If these terms change, we will update the date above and, for material
            changes, make a reasonable effort to let you know. Continuing to use the
            app after a change means you accept the updated terms.
          </p>
        </S>

        <S title="Governing law">
          <p>
            These terms are governed by the laws of the operator&apos;s place of
            residence in the United States, without regard to conflict-of-law rules.
            If you are a consumer, this does not deprive you of the protection of the
            mandatory consumer-protection rules of the country where you live.
          </p>
        </S>

        <div className="muted mt-12 border-t border-[var(--border)] pt-6 text-sm">
          <p>
            See also our{" "}
            <Link className="underline underline-offset-4 hover:text-[var(--brand-text)]" href="/privacy">
              Privacy policy
            </Link>
            . Questions? <a className="underline underline-offset-4 hover:text-[var(--brand-text)]" href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>
          </p>
        </div>
      </main>
    </div>
  );
}
