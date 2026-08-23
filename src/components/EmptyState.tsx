import Link from "next/link";

export default function EmptyState({
  icon = "🐾",
  title,
  body,
  href,
  cta,
}: {
  icon?: string;
  title: string;
  body: string;
  href?: string;
  cta?: string;
}) {
  return (
    <div className="card px-6 py-12 text-center">
      <div className="text-3xl">{icon}</div>
      <p className="mt-3 font-medium">{title}</p>
      <p className="muted mx-auto mt-1 max-w-sm text-sm">{body}</p>
      {href && cta && (
        <Link
          href={href}
          className="mt-5 inline-block rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700"
        >
          {cta}
        </Link>
      )}
    </div>
  );
}
