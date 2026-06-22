const CACHE = "scannertate-v1";
const ASSETS = ["/", "/index.html", "/img/LogoTate.png", "/img/icon-192.png", "/img/icon-512.png", "/img/apple-touch-icon.png"];

self.addEventListener("install", e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});

self.addEventListener("fetch", e => {
  // Solo cachear GET, no WebSocket
  if (e.request.method !== "GET" || e.request.url.startsWith("ws")) return;
  e.respondWith(
    caches.match(e.request).then(cached => cached || fetch(e.request))
  );
});
