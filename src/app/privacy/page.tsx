import Link from "next/link";
import MarketingNav from "@/components/MarketingNav";
import { getUser } from "@/lib/supabase/server";
import { CONTACT_EMAIL } from "@/lib/links";

export const metadata = {
  title: "Privacy — FurIndex",
  description:
    "What FurIndex collects, where it's stored, who processes it, and the fact that it is never sold. Plain language, and true to what the app actually does.",
};

const UPDATED = "26 August 2026";

/** A section with a heading, in the plain-language style the rest of the site uses. */
function S({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-10">
      <h2 className="text-xl font-semibold tracking-tight">{title}</h2>
      <div className="muted mt-3 space-y-3 text-sm leading-relaxed sm:text-base">{children}</div>
    </section>
  );
}

export default async function PrivacyPage() {
  const user = await getUser();
  return (
    <div className="min-h-screen">
      <MarketingNav signedIn={!!user} />
      <main id="main" className="mx-auto max-w-3xl px-6 pb-24 pt-16">
        <p className="muted mb-3 text-sm font-medium uppercase tracking-[0.2em]">Privacy</p>
        <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">
          Your records are yours.
        </h1>
        <p className="muted mt-4 text-sm">Last updated {UPDATED}.</p>

        <div className="card mt-8 p-5 text-sm leading-relaxed">
          <p className="font-medium">The short version</p>
          <p className="muted mt-2">
            FurIndex keeps your pet&apos;s health records for you. Your records are
            private by default. We do not sell your data, we do not run advertising
            or analytics trackers, and — in this deployment — we do not send your
            uploaded documents to any third-party AI. This page explains exactly
            what is collected and who touches it.
          </p>
        </div>

        <S title="Who runs this">
          <p>
            FurIndex is a small, independent project (built as a{" "}
            <a
              className="underline underline-offset-4 hover:text-[var(--brand-text)]"
              href="https://www.sundai.club"
              target="_blank"
              rel="noopener noreferrer"
            >
              Sundai
            </a>{" "}
            project), operated by an individual, not a company. Questions or
            requests: <a className="underline underline-offset-4 hover:text-[var(--brand-text)]" href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>.
          </p>
        </S>

        <S title="What we collect">
          <ul className="list-disc space-y-2 pl-5">
            <li>
              <span className="font-medium">Your account.</span> Your email address,
              and a password that is stored only as a secure hash (we never see it).
              Authentication is handled by Supabase.
            </li>
            <li>
              <span className="font-medium">What you put in.</span> The records you
              create or upload about your pet — vaccinations, medications, weight,
              vet visits, reminders, notes, journal entries, photos, and the vet
              documents you upload. This is information about your <em>pet</em>, and
              whatever you choose to type; you decide what goes in.
            </li>
            <li>
              <span className="font-medium">Messages you send us.</span> If you use
              the contact form, the email address and message you provide.
            </li>
            <li>
              <span className="font-medium">A little technical data.</span> The
              session cookie that keeps you logged in, and — when you use the photo
              breed scanner — your IP address, which is immediately hashed (salted
              SHA-256, truncated) and used only to rate-limit abuse, never stored in
              a form that identifies you.
            </li>
          </ul>
        </S>

        <S title="Why we process it, and on what basis">
          <p>
            We use your data only to run the app for you: to sign you in, to store
            and show the records you create, to read a document you upload, and to
            send you reminders you asked for. We keep the abuse-prevention rate limit
            (the hashed IP) to keep the service available.
          </p>
          <p>
            For anyone in the EU or UK, the legal bases are: performing our agreement
            with you (providing the account and features you asked for); our
            legitimate interest in keeping the app secure and abuse-free; and your
            consent where you choose to do something optional, such as publishing a
            pet to the community.
          </p>
        </S>

        <S title="How your documents and photos are read">
          <p>
            Your uploaded file is stored privately (see below). How it is{" "}
            <em>read</em> depends on the file. A{" "}
            <span className="font-medium">photo</span> of a report is read by OCR
            right in your own browser — it is not sent to a server to be read. A{" "}
            <span className="font-medium">PDF</span> that already has selectable
            text is read on our own server. Either way, in this deployment{" "}
            <span className="font-medium">no third-party AI service is involved</span>
            , and nothing you upload is used to train any model.
          </p>
          <p>
            The photo you drop into the breed scanner is likewise read{" "}
            <span className="font-medium">in your own browser</span>; it is not
            stored, and in this deployment it is not sent to any AI. (Your browser
            downloads the recognition model once from Hugging Face&apos;s content
            network to do this; that request reaches Hugging Face like loading any
            file from the web, but the photo itself stays on your device.)
          </p>
        </S>

        <S title="Where it is stored, and who processes it for us">
          <p>Your data lives with two service providers who process it on our behalf:</p>
          <ul className="list-disc space-y-2 pl-5">
            <li>
              <span className="font-medium">Supabase</span> — the database, login,
              and private file storage. Every table is protected by row-level
              security so one account cannot read another&apos;s data, and uploaded
              files sit in a private bucket scoped to your account.
            </li>
            <li>
              <span className="font-medium">Vercel</span> — hosting and the servers
              that run the app.
            </li>
          </ul>
          <p>
            Both are based in the United States, so your data is processed there. If
            you are in the EU or UK, that transfer is made under the standard
            contractual clauses these providers offer.
          </p>
          <p>
            Some optional integrations exist in the code but are switched{" "}
            <span className="font-medium">off in this deployment</span>. In
            particular, an AI provider (Anthropic) would — only if an API key were
            configured — read your uploaded documents, read your breed-scan photo,
            and write the dashboard &ldquo;daily note&rdquo; from your pets&apos;
            details. None of that happens here. Two smaller integrations are likewise
            off: an email-forwarding service (Resend / Web3Forms) that would notify
            us of a contact message, and a breed-facts API. If any of these is ever
            turned on, this page will be updated to name it, and what it processes,
            before it goes live.
          </p>
        </S>

        <S title="Cookies">
          <p>
            Only what is necessary to run the app: the session cookie that keeps you
            signed in (and, on a password-gated preview build, a cookie that
            remembers you entered the access password). There are no advertising
            cookies and no analytics trackers.
          </p>
        </S>

        <S title="If you publish to the community">
          <p>
            Nothing is public unless you make it so. If you choose to publish a pet
            to the community, the content you publish becomes visible to others until
            you unpublish it. Everything else stays private to your account.
          </p>
        </S>

        <S title="What we never do">
          <ul className="list-disc space-y-2 pl-5">
            <li>We do not sell or rent your data to anyone.</li>
            <li>We do not show ads or run third-party analytics or tracking.</li>
            <li>
              In this deployment, we do not send your uploaded documents to a
              third-party AI (see &ldquo;who processes it&rdquo; above for exactly
              what would change if an AI key were ever added).
            </li>
          </ul>
        </S>

        <S title="Your choices and rights">
          <ul className="list-disc space-y-2 pl-5">
            <li>
              <span className="font-medium">See and edit.</span> Everything you
              stored is visible in the app, and you can edit or remove individual
              records at any time.
            </li>
            <li>
              <span className="font-medium">Export.</span> You can export your data
              from within the app.
            </li>
            <li>
              <span className="font-medium">Delete.</span> You can delete a pet and
              its records in the app. To delete your entire account and all its data,
              email us at{" "}
              <a className="underline underline-offset-4 hover:text-[var(--brand-text)]" href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>{" "}
              and we will remove it.
            </li>
          </ul>
          <p>
            Depending on where you live (for example the EU/UK or California), you
            may have additional rights to access, correct, delete, export, restrict,
            or object to the processing of your personal data — and, in the EU/UK,
            to lodge a complaint with your local data-protection authority. Email us
            and we will honour them.
          </p>
        </S>

        <S title="How long we keep it">
          <p>
            We keep your records for as long as your account exists, so they are
            there when you need them. When you delete a record, a pet, or your
            account, it is removed.
          </p>
        </S>

        <S title="Children">
          <p>
            FurIndex is for adult pet owners and is not directed at children. Please
            do not use it if you are under 16.
          </p>
        </S>

        <S title="Security, honestly">
          <p>
            Accounts are isolated from each other by row-level security, files are
            private, and passwords are hashed. That said, no online service can
            promise perfect security. If we ever become aware of a breach affecting
            your data, we will act on it and tell affected users.
          </p>
        </S>

        <S title="Changes to this page">
          <p>
            If this policy changes, we will update the date at the top, and for
            anything material we will make a reasonable effort to let you know.
          </p>
        </S>

        <div className="muted mt-12 border-t border-[var(--border)] pt-6 text-sm">
          <p>
            See also our{" "}
            <Link className="underline underline-offset-4 hover:text-[var(--brand-text)]" href="/terms">
              Terms of Use
            </Link>
            . Questions? <a className="underline underline-offset-4 hover:text-[var(--brand-text)]" href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>
          </p>
        </div>
      </main>
    </div>
  );
}
