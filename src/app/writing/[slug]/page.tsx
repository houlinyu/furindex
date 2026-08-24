import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import MarketingNav from "@/components/MarketingNav";
import PostBody from "@/components/PostBody";
import { getUser } from "@/lib/supabase/server";
import {
  POSTS,
  POSTS_BY_DATE,
  formatPostDate,
  getPost,
  readingMinutes,
} from "@/lib/posts";

export function generateStaticParams() {
  return POSTS.map((p) => ({ slug: p.slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const post = getPost(slug);
  if (!post) return { title: "Not found — FurIndex" };

  const description = post.description ?? post.standfirst;
  return {
    title: `${post.title} — FurIndex`,
    description,
    alternates: { canonical: `/writing/${post.slug}` },
    openGraph: {
      type: "article",
      title: post.title,
      description,
      publishedTime: post.date,
      url: `/writing/${post.slug}`,
    },
  };
}

export default async function PostPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const post = getPost(slug);
  if (!post) notFound();

  const user = await getUser();
  const index = POSTS_BY_DATE.findIndex((p) => p.slug === post.slug);
  // Position in the list, not age: every post here was written on the same day,
  // so "older"/"newer" would be a claim about time that isn't true.
  const previous = index > 0 ? POSTS_BY_DATE[index - 1] : null;
  const next = index < POSTS_BY_DATE.length - 1 ? POSTS_BY_DATE[index + 1] : null;

  return (
    <div className="min-h-screen">
      <a href="#main" className="skip-link">
        Skip to content
      </a>
      <MarketingNav signedIn={!!user} />

      <main id="main" className="mx-auto max-w-3xl px-5 pb-16 pt-10">
        <Link
          href="/writing"
          className="muted inline-flex min-h-11 items-center text-sm hover:text-[var(--brand-text)]"
        >
          ← Writing
        </Link>

        <article className="mt-2">
          <p className="muted text-xs">
            <time dateTime={post.date}>{formatPostDate(post.date)}</time>
            <span aria-hidden> · </span>
            {readingMinutes(post)} min read
          </p>
          <h1 className="mt-3 text-3xl font-semibold leading-tight tracking-tight sm:text-4xl">
            {post.title}
          </h1>
          <p className="mt-4 text-base leading-relaxed text-[var(--brand-text)]">
            {post.standfirst}
          </p>

          <div className="mt-8">
            <PostBody blocks={post.body} />
          </div>

          {/* Sources and the disclaimer are part of the post, not a footer. Every
              figure above is somebody else's measurement and should be traceable
              to them in one click. */}
          <footer className="mt-12 border-t border-[var(--border)] pt-6">
            <h2 className="text-sm font-semibold">Sources</h2>
            <ul className="muted mt-3 space-y-2 text-xs leading-relaxed">
              {post.sources.map((s) => (
                <li key={s.url}>
                  <a
                    href={s.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="underline underline-offset-4 hover:text-[var(--brand-text)]"
                  >
                    {s.label}
                  </a>
                </li>
              ))}
            </ul>
            <p className="muted mt-4 text-xs leading-relaxed">
              Figures on this page were checked against these sources on{" "}
              {post.checkedOn}.
            </p>
            <p className="muted mt-2 text-xs leading-relaxed">
              Educational content only. Nothing here is veterinary or medical advice —
              talk to your vet about your animal, and to a doctor about yourself.
            </p>
          </footer>
        </article>

        {(previous || next) && (
          <nav aria-label="More writing" className="mt-10 grid gap-3 sm:grid-cols-2">
            {next && (
              <Link href={`/writing/${next.slug}`} className="card p-4 hover:border-brand-500">
                <p className="muted text-xs">Next</p>
                <p className="mt-1 text-sm font-medium leading-snug">{next.title}</p>
              </Link>
            )}
            {previous && (
              <Link
                href={`/writing/${previous.slug}`}
                className="card p-4 hover:border-brand-500 sm:col-start-2"
              >
                <p className="muted text-xs">Previous</p>
                <p className="mt-1 text-sm font-medium leading-snug">{previous.title}</p>
              </Link>
            )}
          </nav>
        )}
      </main>
    </div>
  );
}
