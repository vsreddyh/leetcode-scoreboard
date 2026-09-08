const VERSION = "lc-board-v1";

self.addEventListener("install", (event) => {
  self.skipWaiting();
  event.waitUntil(caches.open(VERSION).then((c) => c.addAll(["/"])));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k)));
      await self.clients.claim();
    })()
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  const url = new URL(req.url);
  if (req.method !== "GET" || url.origin !== self.location.origin) return;

  // API: network only (never serve stale scores)
  if (url.pathname.startsWith("/api/")) return;

  // Navigations: network-first, fall back to cached shell
  if (req.mode === "navigate") {
    event.respondWith(
      fetch(req)
        .then((res) => {
          const copy = req.clone();
          caches.open(VERSION).then((c) => c.put(copy, res.clone()));
          // res is already a clone-safe stream copy? put() consumes clone; return res
          return res;
        })
        .catch(async () => {
          const cache = await caches.open(VERSION);
          return cache.match(req).then((m) => m ?? cache.match("/dashboard"));
        })
    );
    return;
  }

  // Static assets: stale-while-revalidate
  if (/\.(png|svg|ico|css|js|woff2?)$/.test(url.pathname)) {
    event.respondWith(
      (async () => {
        const cache = await caches.open(VERSION);
        const cached = await cache.match(req);
        const fetchPromise = fetch(req)
          .then((res) => {
            cache.put(req, res.clone());
            return res;
          })
          .catch(() => cached);
        return cached ?? fetchPromise;
      })()
    );
  }
});
