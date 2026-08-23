import { POSTS_BY_DATE, postPlainText } from "@/lib/posts";

/**
 * RSS 2.0 for /writing. A route handler rather than a page: the response has to
 * be XML with an XML content type, and a page would give it an HTML shell.
 *
 * The directory is literally named `rss.xml`, so the URL is /writing/rss.xml —
 * which means it goes through middleware like any other path (the matcher only
 * exempts image extensions), and /writing therefore has to be in the public
 * prefixes or a signed-out feed reader gets a 307 to /login.
 */

export const dynamic = "force-dynamic";

/** XML has five, and missing any one of them makes the feed unparseable. */
function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

/** RFC 822, which is what RSS 2.0 requires — not ISO 8601. */
function rfc822(iso: string): string {
  return new Date(`${iso}T12:00:00Z`).toUTCString();
}

function siteUrl(request: Request): string {
  const configured = process.env.NEXT_PUBLIC_SITE_URL;
  if (configured) return configured.replace(/\/+$/, "");
  // Falls back to whatever host actually served this, so a preview deploy's
  // feed does not hand out localhost links.
  return new URL(request.url).origin;
}

export async function GET(request: Request) {
  const base = siteUrl(request);
  const self = `${base}/writing/rss.xml`;

  const items = POSTS_BY_DATE.map((post) => {
    const url = `${base}/writing/${post.slug}`;
    // The standfirst plus the opening of the piece: enough for a reader to
    // decide, not so much that the feed becomes the canonical copy.
    const summary = `${post.standfirst}\n\n${postPlainText(post).slice(0, 600)}…`;
    return [
      "    <item>",
      `      <title>${esc(post.title)}</title>`,
      `      <link>${esc(url)}</link>`,
      `      <guid isPermaLink="true">${esc(url)}</guid>`,
      `      <pubDate>${esc(rfc822(post.date))}</pubDate>`,
      `      <description>${esc(summary)}</description>`,
      "    </item>",
    ].join("\n");
  }).join("\n");

  const xml = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">',
    "  <channel>",
    "    <title>FurIndex — Writing</title>",
    `    <link>${esc(`${base}/writing`)}</link>`,
    "    <description>What the evidence actually says about pet health, with the sample sizes attached.</description>",
    "    <language>en-gb</language>",
    `    <atom:link href="${esc(self)}" rel="self" type="application/rss+xml"/>`,
    ...(POSTS_BY_DATE[0]
      ? [`    <lastBuildDate>${esc(rfc822(POSTS_BY_DATE[0].date))}</lastBuildDate>`]
      : []),
    items,
    "  </channel>",
    "</rss>",
    "",
  ].join("\n");

  return new Response(xml, {
    headers: {
      "content-type": "application/rss+xml; charset=utf-8",
      "cache-control": "public, max-age=0, s-maxage=3600",
    },
  });
}
