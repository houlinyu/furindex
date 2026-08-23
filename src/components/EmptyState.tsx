import Link from "next/link";
import type { ReactNode } from "react";

/**
 * The shared "there's nothing here yet" card.
 *
 * WHY IT TAKES A `hint` AND A `secondary` SLOT
 * An empty state that only names the absence ("No pets yet") leaves the reader
 * to guess the two things they actually want to know: what this would be for,
 * and how much work it is. `body` answers the first, `hint` answers the second,
 * and `secondary` gives the reader a way to look before they commit — the path
 * that keeps someone who isn't ready to type yet from simply leaving.
 */
export default function EmptyState({
  icon = "🐾",
  title,
  body,
  href,
  cta,
  hint,
  secondary,
}: {
  icon?: string;
  title: string;
  body: string;
  href?: string;
  cta?: string;
  /** One short line on what it takes — sets expectations before the click. */
  hint?: string;
  /** A lower-commitment alternative, e.g. a sample to look at. */
  secondary?: ReactNode;
}) {
  return (
    <div className="card px-6 py-10 text-center">
      <div className="text-3xl" aria-hidden>
        {icon}
      </div>
      <p className="mt-3 font-medium">{title}</p>
      <p className="muted mx-auto mt-1 max-w-sm text-sm leading-relaxed">{body}</p>
      {href && cta && (
        <Link
          href={href}
          className="mt-5 inline-flex min-h-11 items-center rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700"
        >
          {cta}
        </Link>
      )}
      {hint && <p className="muted mx-auto mt-2 max-w-sm text-xs">{hint}</p>}
      {secondary && <div className="mt-2 flex justify-center">{secondary}</div>}
    </div>
  );
}
