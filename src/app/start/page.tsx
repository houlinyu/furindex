import Link from "next/link";
import Logo from "@/components/Logo";
import StartFunnel from "@/components/StartFunnel";
import { getUser } from "@/lib/supabase/server";

export const metadata = { title: "Start a record — FurIndex" };

/**
 * The photo-less entrance to the funnel.
 *
 * Someone whose pictures are on their phone, or whose scan came back unsure,
 * still has to be able to start — and the landing page's dropzone is the only
 * door we had. This page is that same first question with no photo attached.
 * Public (see middleware): asking what kind of animal you have is not something
 * we should make anyone sign in to answer.
 */
export default async function StartPage() {
  const user = await getUser();

  return (
    <main className="flex min-h-screen items-center justify-center px-4 py-12">
      <div className="w-full max-w-md">
        <div className="mb-8 text-center">
          <Link href="/" className="inline-flex" aria-label="FurIndex home">
            <Logo className="mx-auto h-12 w-12 text-brand-600" title="FurIndex" />
          </Link>
          <h1 className="mt-3 text-2xl font-semibold tracking-tight">
            Let&apos;s start their record
          </h1>
          <p className="muted mt-2 text-sm leading-relaxed">
            One question first, so the form arrives half filled in.
          </p>
        </div>

        <div className="card p-6">
          <h2 className="mb-4 text-sm font-medium">What have you got?</h2>
          <StartFunnel />
          <p className="muted mt-4 text-xs leading-relaxed">
            {user
              ? "Next: name them. Everything else can wait."
              : "Next: an email and a password, then their name. Everything else can wait."}
          </p>
        </div>

        <p className="muted mt-6 text-center text-xs">
          Something else — a rabbit, a bird, a reptile?{" "}
          <Link
            href="/pets/new"
            className="underline underline-offset-4 hover:text-[var(--brand-text)]"
          >
            Go straight to the form
          </Link>
          .
        </p>
      </div>
    </main>
  );
}
