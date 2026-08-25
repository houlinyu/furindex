/* FurIndex service worker — installability + a graceful offline shell only.
 *
 * Deliberately conservative: it never caches anything under /api or /auth, and
 * it is network-first for pages so a signed-in user always gets fresh data when
 * online. The only thing it serves from cache is a tiny offline notice when the
 * network is gone — a health record must never quietly show a stale page as if
 * it were current.
 */
const CACHE = "furindex-shell-v1";
const OFFLINE_URL = "/offline.html";

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE).then((c) => c.add(OFFLINE_URL)));
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith("/api") || url.pathname.startsWith("/auth")) return;

  // Only handle page navigations; let the browser deal with everything else so
  // we never interfere with the Next.js asset pipeline or Supabase requests.
  if (request.mode === "navigate") {
    event.respondWith(fetch(request).catch(() => caches.match(OFFLINE_URL)));
  }
});
