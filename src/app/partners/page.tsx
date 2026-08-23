import { redirect } from "next/navigation";

/** The page moved to /collaborate. The old path may already be in someone's
 *  inbox, so it redirects rather than 404s. */
export default function PartnersRedirect() {
  redirect("/collaborate");
}
