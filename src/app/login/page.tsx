import LoginForm from "@/components/LoginForm";

export const metadata = { title: "Sign in — FurIndex" };

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; error?: string }>;
}) {
  const { next, error } = await searchParams;

  // Only same-origin relative paths survive — never bounce to a supplied host.
  const safeNext = next && next.startsWith("/") && !next.startsWith("//") ? next : "/dashboard";

  return (
    <main className="flex min-h-screen items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <div className="text-4xl">🐾</div>
          <h1 className="mt-3 text-2xl font-semibold tracking-tight">FurIndex</h1>
          <p className="muted mt-1 text-sm">
            Vaccinations, meds, weight and vet visits — in one place.
          </p>
        </div>

        {/* No Suspense boundary needed now: LoginForm reads no search params of
            its own, so it server-renders on the first paint. */}
        <LoginForm next={safeNext} initialError={error ?? null} />

        <p className="muted mt-6 text-center text-xs leading-relaxed">
          Password sign-in works instantly. Email links also work, but this
          project can only send two per hour.
        </p>
      </div>
    </main>
  );
}
