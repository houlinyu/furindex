import MarketingNav from "@/components/MarketingNav";
import ContactForm from "@/components/ContactForm";
import { getUser } from "@/lib/supabase/server";

export const metadata = {
  title: "Contact us — FurIndex",
  description: "A question, an idea, or something that broke — write to the FurIndex team.",
};

export default async function ContactPage() {
  const user = await getUser();
  return (
    <div className="min-h-screen">
      <MarketingNav signedIn={!!user} />
      <main id="main" className="mx-auto max-w-2xl px-5 py-16">
        <p className="muted text-xs font-medium uppercase tracking-widest">Contact us</p>
        <h1 className="mt-3 text-3xl font-semibold leading-tight tracking-tight sm:text-4xl">
          Say anything.
        </h1>
        <p className="muted mt-4 max-w-xl text-base leading-relaxed">
          A question about your pet&apos;s record, an idea, a bug, or just hello.
          Leave an email and a line or two — a sentence or two is plenty — and a
          real person will read it.
        </p>
        <div className="mt-8">
          <ContactForm sourcePage="/contact" />
        </div>
      </main>
    </div>
  );
}
