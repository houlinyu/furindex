import MarketingNav from "@/components/MarketingNav";
import BreedScanWidget from "@/components/BreedScanWidget";
import { getUser } from "@/lib/supabase/server";

export const metadata = {
  title: "Pet ID — FurIndex",
  description:
    "Drop a photo of your pet and get a breed guess plus a genuinely interesting fact — free, no sign-up, and the photo never leaves your device.",
};

export default async function IdentifyPage() {
  const user = await getUser();
  return (
    <div className="min-h-screen">
      <MarketingNav signedIn={!!user} />
      <main id="main" className="mx-auto max-w-2xl px-5 py-16">
        <p className="muted text-xs font-medium uppercase tracking-widest">
          Free · no sign-up
        </p>
        <h1 className="mt-3 text-3xl font-semibold leading-tight tracking-tight sm:text-4xl">
          Who&apos;s that?
        </h1>
        <p className="muted mt-4 max-w-xl text-base leading-relaxed">
          Upload a cute photo of your furry friend and we&apos;ll tell you what
          we think they are — plus something about them you probably didn&apos;t
          know. It runs in your own browser, so the photo never leaves your
          device, and there&apos;s nothing to sign up for.
        </p>

        <div className="mt-8">
          <BreedScanWidget />
        </div>

        <p className="muted mt-8 text-xs leading-relaxed">
          Dogs get a breed guess from a list of 118. Cats we&apos;ll only call
          &ldquo;a cat&rdquo; — breeds can&apos;t reliably be told from a photo,
          and most cats aren&apos;t a breed anyway. Every fact here is written
          down and sourced, never made up.
        </p>
      </main>
    </div>
  );
}
