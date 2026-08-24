import { redirect } from "next/navigation";
import AppShell from "@/components/AppShell";
import { createClient, getUser } from "@/lib/supabase/server";
import LocalDateTime from "@/components/LocalDateTime";
import type { ContactMessage, PartnerInquiry } from "@/lib/types";

export const metadata = { title: "Inbox — FurIndex" };

/**
 * The owner's view of everything the two public forms collected.
 *
 * Access is enforced by RLS, not by this page: the SELECT policies on
 * contact_messages and partner_inquiries only return rows to the owner account,
 * so a different signed-in user simply sees empty lists rather than being
 * trusted to have been redirected. The email check here is only so a non-owner
 * gets an honest "not for you" instead of two blank sections.
 */
const OWNER = "yuhoulin737@gmail.com";

export default async function InboxPage() {
  const user = await getUser();
  if (!user) redirect("/login?next=/inbox");

  const isOwner = (user.email ?? "").toLowerCase() === OWNER;
  const supabase = await createClient();

  const [{ data: contacts }, { data: partners }] = await Promise.all([
    supabase.from("contact_messages").select("*").order("created_at", { ascending: false }).limit(200),
    supabase.from("partner_inquiries").select("*").order("created_at", { ascending: false }).limit(200),
  ]);

  const messages = (contacts ?? []) as ContactMessage[];
  const inquiries = (partners ?? []) as PartnerInquiry[];

  return (
    <AppShell email={user.email}>
      <h1 className="text-2xl font-semibold tracking-tight">Inbox</h1>
      {!isOwner ? (
        <p className="muted mt-3 text-sm">
          This inbox belongs to the FurIndex owner. Nothing here is yours to read.
        </p>
      ) : (
        <>
          <p className="muted mb-8 mt-1 text-sm">
            Everything the contact and partner forms have collected. Only you can
            see this.
          </p>

          <section className="mb-10">
            <h2 className="mb-3 text-sm font-medium uppercase tracking-wide muted">
              Contact messages ({messages.length})
            </h2>
            {messages.length === 0 ? (
              <p className="muted text-sm">Nothing yet.</p>
            ) : (
              <ul className="space-y-3">
                {messages.map((m) => (
                  <li key={m.id} className="card p-4">
                    <div className="flex flex-wrap items-baseline justify-between gap-2">
                      <a href={`mailto:${m.email}`} className="text-sm font-medium hover:underline">
                        {m.email}
                      </a>
                      <LocalDateTime iso={m.created_at} className="muted text-xs" />
                    </div>
                    <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed">{m.message}</p>
                    {m.source_page && (
                      <p className="muted mt-2 text-xs">from {m.source_page}</p>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section>
            <h2 className="mb-3 text-sm font-medium uppercase tracking-wide muted">
              Partner enquiries ({inquiries.length})
            </h2>
            {inquiries.length === 0 ? (
              <p className="muted text-sm">Nothing yet.</p>
            ) : (
              <ul className="space-y-3">
                {inquiries.map((q) => (
                  <li key={q.id} className="card p-4">
                    <div className="flex flex-wrap items-baseline justify-between gap-2">
                      <a href={`mailto:${q.email}`} className="text-sm font-medium hover:underline">
                        {q.email}
                      </a>
                      <LocalDateTime iso={q.created_at} className="muted text-xs" />
                    </div>
                    <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed">{q.message}</p>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </>
      )}
    </AppShell>
  );
}
