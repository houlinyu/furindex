import Link from "next/link";

export default function NotFound() {
  return (
    <main className="flex min-h-screen items-center justify-center px-4">
      <div className="card max-w-md p-8 text-center">
        <div className="text-4xl">🔍</div>
        <h1 className="mt-4 text-lg font-semibold tracking-tight">Not found</h1>
        <p className="muted mt-2 text-sm leading-relaxed">
          That page doesn&apos;t exist, or it belongs to someone else&apos;s account.
        </p>
        <Link
          href="/dashboard"
          className="mt-6 inline-block rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700"
        >
          Back to dashboard
        </Link>
      </div>
    </main>
  );
}
