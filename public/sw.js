/* WorshipHQ service worker — app-shell + runtime caching for fast, offline-friendly use.
   Internet in Ghana is often intermittent, so we cache aggressively and fall back
   gracefully when offline. Data records are cached in IndexedDB by the app itself
   (see src/lib/offline) — this SW handles the shell, assets and navigation. */

// v2: pages are now requested by the browser itself (navigation preload) instead of re-fetched here. The re-fetch could drop
// the sign-in cookie when a link from an email or SMS opened the installed app, which signed people out.
const VERSION = "worshiphq-v2";
const SHELL_CACHE = `${VERSION}-shell`;
const RUNTIME_CACHE = `${VERSION}-runtime`;

const SHELL_ASSETS = ["/", "/app", "/offline", "/icon.svg", "/manifest.webmanifest"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(SHELL_CACHE).then((cache) => cache.addAll(SHELL_ASSETS).catch(() => {})),
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((k) => !k.startsWith(VERSION)).map((k) => caches.delete(k))),
      )
      // Let the browser start each page request itself, in parallel with this worker starting up.
      .then(() => (self.registration.navigationPreload ? self.registration.navigationPreload.enable().catch(() => {}) : undefined))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return; // let cross-origin (e.g. Unsplash) hit network

  // Navigations: network-first, fall back to cache, then offline page.
  // The page request is the BROWSER's own (event.preloadResponse), so it carries the sign-in cookie exactly like a normal
  // visit, including when the app is opened from a link in an email, SMS or chat. We only re-fetch ourselves when the
  // browser did not start one.
  if (request.mode === "navigate") {
    event.respondWith(
      (async () => {
        try {
          const res = (await event.preloadResponse) || (await fetch(request));
          // Keep a copy for offline use, but never a redirect or an error page.
          if (res && res.ok && res.type === "basic") {
            const copy = res.clone();
            caches.open(RUNTIME_CACHE).then((c) => c.put(request, copy));
          }
          return res;
        } catch {
          return (await caches.match(request)) || (await caches.match("/offline"));
        }
      })(),
    );
    return;
  }

  // Static assets: stale-while-revalidate.
  event.respondWith(
    caches.match(request).then((cached) => {
      const network = fetch(request)
        .then((res) => {
          const copy = res.clone();
          caches.open(RUNTIME_CACHE).then((c) => c.put(request, copy));
          return res;
        })
        .catch(() => cached);
      return cached || network;
    }),
  );
});

// Allow the page to trigger an immediate activation after an update.
self.addEventListener("message", (e) => {
  if (e.data === "SKIP_WAITING") self.skipWaiting();
});
