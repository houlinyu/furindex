"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { signInWithPassword, signUpWithPassword } from "@/app/auth-actions";

const field =
  "w-full rounded-lg border border-[var(--border)] bg-transparent px-3 py-2 text-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600 focus:border-brand-500";

type Mode = "password" | "magic" | "reset";

// Only one of the two forms is mounted at a time, so a single fixed id is
// unambiguous and keeps aria-describedby readable.
const ERROR_ID = "login-error";

export default function LoginForm({
  next,
  initialError,
  startRegister = false,
}: {
  next: string;
  initialError: string | null;
  /** Open straight into "create an account" — the nav's Create account button. */
  startRegister?: boolean;
}) {
  const [mode, setMode] = useState<Mode>("password");
  const [isRegister, setIsRegister] = useState(startRegister);
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<"idle" | "working" | "sent" | "reset-sent">("idle");
  const [error, setError] = useState<string | null>(initialError);

  // Sign-in failures come back as one message for the whole form — there is no
  // per-field detail to attach, so both credential fields point at it.
  const errorLink = error
    ? { "aria-invalid": true as const, "aria-describedby": ERROR_ID }
    : {};

  async function onPasswordSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setStatus("working");
    setError(null);
    const fd = new FormData(e.currentTarget);
    fd.set("next", next);
    try {
      // These redirect on success; a returned object always means failure.
      const res = isRegister ? await signUpWithPassword(fd) : await signInWithPassword(fd);
      if (res && "error" in res) {
        setError(res.error);
        setStatus("idle");
      }
    } catch (err) {
      // redirect() throws by design — let Next handle it.
      if (err && typeof err === "object" && "digest" in err) throw err;
      setError("Something went wrong. Try again.");
      setStatus("idle");
    }
  }

  async function onMagicSubmit(e: React.FormEvent) {
    e.preventDefault();
    setStatus("working");
    setError(null);

    const supabase = createClient();
    const origin = process.env.NEXT_PUBLIC_SITE_URL ?? window.location.origin;
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: `${origin}/auth/callback?next=${encodeURIComponent(next)}` },
    });

    if (error) {
      setError(
        /rate|limit|seconds/i.test(error.message)
          ? "Too many sign-in emails from this project in the last hour. Use a password instead — it works immediately."
          : error.message
      );
      setStatus("idle");
      return;
    }
    setStatus("sent");
  }

  async function onResetSubmit(e: React.FormEvent) {
    e.preventDefault();
    setStatus("working");
    setError(null);

    const supabase = createClient();
    const origin = process.env.NEXT_PUBLIC_SITE_URL ?? window.location.origin;
    // Straight to the page that can actually set a password. The recovery link
    // is an ordinary code exchange, so /auth/callback already handles it — the
    // only thing that makes it a reset is where it lands.
    // Bounded, because the button disables itself while this is in flight and a
    // request that never settles leaves it disabled forever with nothing said.
    // On timeout we still show the confirmation: the mail may well have been
    // sent, and the alternative — an error implying it wasn't — would be a
    // guess presented as fact.
    const timeout = new Promise<{ error: null }>((resolve) =>
      setTimeout(() => resolve({ error: null }), 12000)
    );
    const { error } = await Promise.race([
      supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${origin}/auth/callback?next=${encodeURIComponent("/account?reset=1")}`,
      }),
      timeout,
    ]);

    if (error && /rate|limit|seconds/i.test(error.message)) {
      setError(
        "Too many emails from this project in the last hour — the free mailer allows two. Try again shortly."
      );
      setStatus("idle");
      return;
    }
    // Any other failure is swallowed on purpose. Reporting "no such account"
    // here would turn this box into a way to test whether an address is
    // registered, so the answer is the same either way.
    setStatus("reset-sent");
  }

  if (status === "reset-sent") {
    return (
      <div className="card p-6 text-center">
        <div className="text-3xl">🔑</div>
        <p className="mt-3 font-medium">Check your inbox</p>
        <p className="muted mt-1 text-sm">
          If <span className="font-medium">{email}</span> has an account, there
          is a link in it. Opening the link signs you in and takes you straight
          to where you choose a new password.
        </p>
        <p className="muted mt-2 text-xs">
          It often lands in spam. This project can send two emails an hour, so
          if nothing arrives, wait a little rather than pressing again.
        </p>
        <button
          onClick={() => {
            setStatus("idle");
            setMode("password");
            setError(null);
          }}
          className="muted mt-4 inline-flex min-h-11 items-center text-xs underline underline-offset-4"
        >
          Back to sign in
        </button>
      </div>
    );
  }

  if (status === "sent") {
    return (
      <div className="card p-6 text-center">
        <div className="text-3xl">📬</div>
        <p className="mt-3 font-medium">Check your inbox</p>
        <p className="muted mt-1 text-sm">
          We sent a sign-in link to <span className="font-medium">{email}</span>.
        </p>
        <p className="muted mt-2 text-xs">
          It often lands in spam. Nothing after a minute? Use a password instead.
        </p>
        <button
          onClick={() => {
            setStatus("idle");
            setMode("password");
          }}
          className="muted mt-4 inline-flex min-h-11 items-center text-xs underline underline-offset-4"
        >
          Use a password
        </button>
      </div>
    );
  }

  return (
    <div className="card p-6">
      {mode === "reset" ? (
        <div className="mb-4">
          <p className="font-medium">Reset your password</p>
          <p className="muted mt-1 text-sm">
            Tell us the address on the account and we&apos;ll email a link that
            lets you set a new one.
          </p>
        </div>
      ) : (
      <div className="mb-4 flex gap-1 rounded-lg border border-[var(--border)] p-1 text-xs">
        <button
          type="button"
          aria-pressed={mode === "password"}
          onClick={() => setMode("password")}
          className={`inline-flex min-h-11 flex-1 items-center justify-center rounded-md px-2 py-1.5 transition ${
            mode === "password" ? "bg-brand-600 font-medium text-white" : "muted"
          }`}
        >
          Password
        </button>
        <button
          type="button"
          aria-pressed={mode === "magic"}
          onClick={() => setMode("magic")}
          className={`inline-flex min-h-11 flex-1 items-center justify-center rounded-md px-2 py-1.5 transition ${
            mode === "magic" ? "bg-brand-600 font-medium text-white" : "muted"
          }`}
        >
          Email link
        </button>
      </div>
      )}

      {mode === "password" ? (
        <form onSubmit={onPasswordSubmit} className="space-y-3">
          <div>
            <label htmlFor="email" className="mb-1 block text-sm font-medium">
              Email
            </label>
            <input
              id="email"
              name="email"
              type="email"
              required
              autoComplete="email"
              placeholder="you@example.com"
              className={field}
              {...errorLink}
            />
          </div>
          <div>
            <label htmlFor="password" className="mb-1 block text-sm font-medium">
              Password
            </label>
            <input
              id="password"
              name="password"
              type="password"
              required
              minLength={isRegister ? 8 : undefined}
              autoComplete={isRegister ? "new-password" : "current-password"}
              className={field}
              aria-describedby={
                [isRegister ? "password-hint" : null, error ? ERROR_ID : null]
                  .filter(Boolean)
                  .join(" ") || undefined
              }
              aria-invalid={error ? true : undefined}
            />
            {isRegister && (
              <p id="password-hint" className="muted mt-1 text-xs">
                At least 8 characters.
              </p>
            )}
          </div>

          {error && (
            <p id={ERROR_ID} className="text-sm text-red-600 dark:text-red-400" role="alert">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={status === "working"}
            className="inline-flex min-h-11 w-full items-center justify-center rounded-lg bg-brand-600 px-3 py-2 text-sm font-medium text-white transition hover:bg-brand-700 disabled:opacity-60"
          >
            {status === "working" ? "…" : isRegister ? "Create account" : "Sign in"}
          </button>

          <button
            type="button"
            onClick={() => {
              setIsRegister(!isRegister);
              setError(null);
            }}
            className="muted inline-flex min-h-11 w-full items-center justify-center text-center text-xs underline underline-offset-4"
          >
            {isRegister ? "I already have an account" : "New here? Create an account"}
          </button>

          {!isRegister && (
            <button
              type="button"
              onClick={() => {
                setMode("reset");
                setError(null);
              }}
              className="muted inline-flex min-h-11 w-full items-center justify-center text-center text-xs underline underline-offset-4"
            >
              Forgot your password?
            </button>
          )}
        </form>
      ) : mode === "magic" ? (
        <form onSubmit={onMagicSubmit} className="space-y-3">
          <div>
            <label htmlFor="magic-email" className="mb-1 block text-sm font-medium">
              Email
            </label>
            <input
              id="magic-email"
              name="email"
              type="email"
              required
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              className={field}
              {...errorLink}
            />
          </div>

          {error && (
            <p id={ERROR_ID} className="text-sm text-red-600 dark:text-red-400" role="alert">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={status === "working"}
            className="inline-flex min-h-11 w-full items-center justify-center rounded-lg bg-brand-600 px-3 py-2 text-sm font-medium text-white transition hover:bg-brand-700 disabled:opacity-60"
          >
            {status === "working" ? "Sending…" : "Email me a link"}
          </button>
          <p className="muted text-center text-xs">
            This project can send 2 sign-in emails per hour. Passwords have no limit.
          </p>
        </form>
      ) : (
        <form onSubmit={onResetSubmit} className="space-y-3">
          <div>
            <label htmlFor="reset-email" className="mb-1 block text-sm font-medium">
              Email
            </label>
            <input
              id="reset-email"
              name="email"
              type="email"
              required
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              className={field}
              {...errorLink}
            />
          </div>

          {error && (
            <p id={ERROR_ID} className="text-sm text-red-600 dark:text-red-400" role="alert">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={status === "working"}
            className="inline-flex min-h-11 w-full items-center justify-center rounded-lg bg-brand-600 px-3 py-2 text-sm font-medium text-white transition hover:bg-brand-700 disabled:opacity-60"
          >
            {status === "working" ? "Sending…" : "Email me a reset link"}
          </button>

          <button
            type="button"
            onClick={() => {
              setMode("password");
              setError(null);
            }}
            className="muted inline-flex min-h-11 w-full items-center justify-center text-center text-xs underline underline-offset-4"
          >
            Back to sign in
          </button>

          <p className="muted text-center text-xs">
            Never had a password? An account made with an email link doesn&apos;t
            have one — sign in with a link instead, then set a password on your
            account page.
          </p>
        </form>
      )}
    </div>
  );
}
