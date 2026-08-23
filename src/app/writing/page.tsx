import Link from "next/link";
import MarketingNav from "@/components/MarketingNav";
import { getUser } from "@/lib/supabase/server";
import { POSTS_BY_DATE, formatPostDate, readingMinutes } from "@/lib/posts";

export const metadata = {
  title: "Writing — FurIndex",
  description:
    "What the evidence actually says about pet health, including the times it told us not to build something.",
  alternates: { types: { "application/rss+xml": "/writing/rss.xml" } },
};

/**
 * The index. Newest first, straight off POSTS_BY_DATE — adding a fourth post is
 * an entry in src/lib/posts.ts and nothing here changes.
 *
 * Public: signed-out visitors have to be able to read all of this, which is why
 * /writing is in the middleware's public prefixes.
 */
export default async function WritingIndexPage() {
  const user = await getUser();

  return (
    <div className="min-h-screen">
      <a href="#main" className="skip-link">
        Skip to content
      </a>
      <MarketingNav signedIn={!!user} />

      <main id="main" className="mx-auto max-w-3xl px-5 pb-16 pt-14">
        <p className="muted text-xs font-medium uppercase tracking-widest">Writing</p>
        <h1 className="mt-3 text-3xl font-semibold leading-tight tracking-tight sm:text-4xl">
          What the evidence actually says
        </h1>
        <p className="muted mt-5 text-base leading-relaxed">
          Notes on the research behind pet health, with the sample sizes attached —
          including the features we looked into and then decided not to build.
        </p>

        <ol className="mt-10 space-y-4">
          {POSTS_BY_DATE.map((post) => (
            <li key={post.slug}>
              <Link
                href={`/writing/${post.slug}`}
                className="card block p-5 transition hover:border-brand-500"
              >
                <p className="muted text-xs">
                  <time dateTime={post.date}>{formatPostDate(post.date)}</time>
                  <span aria-hidden> · </span>
                  {readingMinutes(post)} min read
                </p>
                <h2 className="mt-2 text-lg font-semibold leading-snug tracking-tight">
                  {post.title}
                </h2>
                <p className="muted mt-2 text-sm leading-relaxed">{post.standfirst}</p>
              </Link>
            </li>
          ))}
        </ol>

        <p className="muted mt-10 text-xs">
          <a
            href="/writing/rss.xml"
            className="underline underline-offset-4 hover:text-[var(--brand-text)]"
          >
            RSS feed
          </a>
          <span aria-hidden> · </span>
          Educational content only — nothing here is veterinary or medical advice.
        </p>
      </main>
    </div>
  );
}
