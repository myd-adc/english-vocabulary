const CACHE_NAME = "lexivocab-v6";
const STATIC_ASSETS = [
  "/", "/index.html", "/app.js", "/quiz.js", "/speech.js", "/icons.js", "/style.css", "/manifest.json",
  "/icon-192.png", "/apple-touch-icon.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((c) => c.addAll(STATIC_ASSETS)));
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))))
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  // API and MCP/OAuth traffic is never cached: always live data.
  if (url.pathname.startsWith("/api/") || url.pathname.startsWith("/mcp") ||
      url.pathname.startsWith("/.well-known/") || url.pathname === "/health") return;
  // App shell: network-first so deploys show up immediately; cache only as offline fallback.
  event.respondWith(
    // cache: "no-cache" revalidates with the server instead of trusting the browser's HTTP cache.
    fetch(request, { cache: "no-cache" })
      .then((response) => {
        if (response.ok) {
          const copy = response.clone();
          caches.open(CACHE_NAME).then((c) => c.put(request, copy));
        }
        return response;
      })
      .catch(async () => (await caches.match(request)) || new Response("Offline", { status: 503 }))
  );
});
