/**
 * External links, in one place so there's a single edit before demoing.
 * Anything still holding a REPLACE_ME value renders a visible "(link TODO)".
 */
export const SUNDAI_PROJECT_URL = "https://www.sundai.club/projects/REPLACE_ME";
export const GITHUB_REPO_URL = "https://github.com/houlinyu/furindex";
export const CONTACT_EMAIL = "yuhoulin737@gmail.com";

/**
 * The repo is PUBLIC (houlinyu/furindex), so the landing page can show a working
 * "Source" link. If it is ever made private again, flip this back to false — a
 * Source link to a private repo 404s for every visitor who isn't a collaborator.
 */
export const REPO_IS_PUBLIC = true;

export const isPlaceholder = (url: string) => url.includes("REPLACE_ME");
