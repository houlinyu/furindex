import { redirect } from "next/navigation";
import { SCIENCE_POST_SLUG } from "@/lib/posts";

/**
 * /science was a single essay. It is now the first post on /writing.
 *
 * This route stays and REDIRECTS rather than 404ing: the old URL is already in
 * the wild — the nav pointed at it, and so does anything anyone has shared —
 * and a dead link is a worse outcome than an extra hop. It goes to that
 * specific post, not to the index, because whoever followed the link was
 * promised that piece.
 *
 * Kept as a page rather than a next.config redirect so the reason lives next to
 * the content it points at, and so /science's existing entry in the middleware's
 * PUBLIC_EXACT keeps working unchanged for signed-out visitors.
 */
export default function SciencePage(): never {
  redirect(`/writing/${SCIENCE_POST_SLUG}`);
}
