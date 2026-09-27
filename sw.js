// Service worker — bump CACHE_VERSION every time content changes so
// clients pick up the update instead of serving stale cached pages.
const CACHE_VERSION = "dsm-2026-09-27.1";
const APP_SHELL = [
  "./",
  "index.html",
  "manifest.json",
  "docs-manifest.json",
  "icons/icon-192.png",
  "icons/icon-512.png"
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE_VERSION);
      await cache.addAll(APP_SHELL);
      try {
        const res = await fetch("docs-manifest.json", { cache: "no-store" });
        const manifest = await res.json();
        const docUrls = (manifest.docs || []).map((d) => d.file);
        await cache.addAll(docUrls);
      } catch (e) {
        // manifest fetch failed at install time — app shell is still cached,
        // docs will be cached opportunistically on first visit instead.
      }
      self.skipWaiting();
    })()
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(
        keys.filter((k) => k !== CACHE_VERSION).map((k) => caches.delete(k))
      );
      await self.clients.claim();
    })()
  );
});

// Network-first for same-origin GET requests, falling back to cache when
// offline; successful network responses refresh the cache so the app stays
// current when online and still works fully offline.
self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET" || new URL(req.url).origin !== self.location.origin) return;

  event.respondWith(
    (async () => {
      const cache = await caches.open(CACHE_VERSION);
      try {
        const fresh = await fetch(req);
        if (fresh && fresh.ok) cache.put(req, fresh.clone());
        return fresh;
      } catch (e) {
        const cached = await cache.match(req, { ignoreSearch: true });
        if (cached) return cached;
        if (req.mode === "navigate") {
          const shell = await cache.match("index.html");
          if (shell) return shell;
        }
        throw e;
      }
    })()
  );
});
