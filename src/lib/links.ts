/**
 * External links, in one place so there's a single edit before demoing.
 * Anything still holding a REPLACE_ME value renders a visible "(link TODO)".
 */
export const SUNDAI_PROJECT_URL = "https://www.sundai.club/projects/REPLACE_ME";
export const GITHUB_REPO_URL = "https://github.com/houlinyu/furindex";
export const CONTACT_EMAIL = "yuhoulin737@gmail.com";

/**
 * The repo is PRIVATE. A "Source" link to a private repo 404s for every visitor
 * who isn't an invited collaborator, which looks broken on a public landing page.
 * Flip this to true at the same moment you flip the repo to public.
 */
export const REPO_IS_PUBLIC = false;

export const isPlaceholder = (url: string) => url.includes("REPLACE_ME");
