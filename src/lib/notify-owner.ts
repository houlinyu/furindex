/**
 * Best-effort email to the owner when someone submits a form.
 *
 * THE HONEST CONSTRAINT
 * This app has no email provider wired in, so the RELIABLE record of a
 * submission is the database row — collected, private, and readable by the
 * owner in /inbox. This function is the OPTIONAL extra: if a forwarding
 * endpoint is configured, it also pushes the message to the owner's inbox so
 * they don't have to check the app.
 *
 * It is deliberately fire-and-forget and never throws: a submission must be
 * saved whether or not the notification succeeds. A form that fails because an
 * email relay was down would be a worse outcome than a quiet miss the owner
 * still sees in /inbox.
 *
 * To turn on email delivery, set ONE of these in the environment:
 *   WEB3FORMS_ACCESS_KEY   — free, no server; get a key at web3forms.com by
 *                            verifying the destination address once. Nothing
 *                            else to run.
 *   RESEND_API_KEY + OWNER_EMAIL — if you'd rather use Resend.
 * Until one is set, this is a no-op and submissions live only in /inbox.
 */
const OWNER_EMAIL = process.env.OWNER_EMAIL ?? "yuhoulin737@gmail.com";

export async function notifyOwner(subject: string, fromEmail: string, body: string): Promise<void> {
  try {
    const web3 = process.env.WEB3FORMS_ACCESS_KEY;
    if (web3) {
      await fetch("https://api.web3forms.com/submit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          access_key: web3,
          subject,
          from_name: "FurIndex",
          email: fromEmail,
          message: body,
        }),
      });
      return;
    }

    const resend = process.env.RESEND_API_KEY;
    if (resend) {
      await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { Authorization: `Bearer ${resend}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          from: "FurIndex <onboarding@resend.dev>",
          to: [OWNER_EMAIL],
          reply_to: fromEmail,
          subject,
          text: body,
        }),
      });
    }
    // No key configured: the DB row is the record. Not an error.
  } catch {
    // Swallowed on purpose — see the doc comment.
  }
}
