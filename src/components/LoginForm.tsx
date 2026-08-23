"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { signInWithPassword, signUpWithPassword } from "@/app/auth-actions";

const field =
  "w-full rounded-lg border border-[var(--border)] bg-transparent px-3 py-2 text-sm outline-none focus:border-brand-500";

type Mode = "password" | "magic";

export default function LoginForm({
  next,
  initialError,
}: {
  next: string;
  initialError: string | null;
}) {
  const [mode, setMode] = useState<Mode>("password");
  const [isRegister, setIsRegister] = useState(false);
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<"idle" | "working" | "sent">("idle");
  const [error, setError] = useState<string | null>(initialError);

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
          className="muted mt-4 text-xs underline underline-offset-4"
        >
          Use a password
        </button>
      </div>
    );
  }

  return (
    <div className="card p-6">
      <div className="mb-4 flex gap-1 rounded-lg border border-[var(--border)] p-1 text-xs">
        <button
          onClick={() => setMode("password")}
          className={`flex-1 rounded-md px-2 py-1.5 transition ${
            mode === "password" ? "bg-brand-600 font-medium text-white" : "muted"
          }`}
        >
          Password
        </button>
        <button
          onClick={() => setMode("magic")}
          className={`flex-1 rounded-md px-2 py-1.5 transition ${
            mode === "magic" ? "bg-brand-600 font-medium text-white" : "muted"
          }`}
        >
          Email link
        </button>
      </div>

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
            />
            {isRegister && <p className="muted mt-1 text-xs">At least 8 characters.</p>}
          </div>

          {error && (
            <p className="text-sm text-red-600" role="alert">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={status === "working"}
            className="w-full rounded-lg bg-brand-600 px-3 py-2 text-sm font-medium text-white transition hover:bg-brand-700 disabled:opacity-60"
          >
            {status === "working" ? "…" : isRegister ? "Create account" : "Sign in"}
          </button>

          <button
            type="button"
            onClick={() => {
              setIsRegister(!isRegister);
              setError(null);
            }}
            className="muted w-full text-center text-xs underline underline-offset-4"
          >
            {isRegister ? "I already have an account" : "New here? Create an account"}
          </button>
        </form>
      ) : (
        <form onSubmit={onMagicSubmit} className="space-y-3">
          <div>
            <label htmlFor="magic-email" className="mb-1 block text-sm font-medium">
              Email
            </label>
            <input
              id="magic-email"
              type="email"
              required
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              className={field}
            />
          </div>

          {error && (
            <p className="text-sm text-red-600" role="alert">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={status === "working"}
            className="w-full rounded-lg bg-brand-600 px-3 py-2 text-sm font-medium text-white transition hover:bg-brand-700 disabled:opacity-60"
          >
            {status === "working" ? "Sending…" : "Email me a link"}
          </button>
          <p className="muted text-center text-xs">
            This project can send 2 sign-in emails per hour. Passwords have no limit.
          </p>
        </form>
      )}
    </div>
  );
}
