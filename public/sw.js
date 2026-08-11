const STATIC_CACHE = "worldexplorer-static-v5";
const TILE_CACHE = "worldexplorer-osm-v1";
const APP_SHELL = ["/", "/manifest.webmanifest", "/favicon.svg", "/vendor/leaflet.js"];
const MAX_TILE_ENTRIES = 500;

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(STATIC_CACHE).then((cache) => cache.addAll(APP_SHELL)));
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((key) => ![STATIC_CACHE, TILE_CACHE].includes(key)).map((key) => caches.delete(key))),
    ),
  );
  self.clients.claim();
});

async function trimTiles() {
  const cache = await caches.open(TILE_CACHE);
  const keys = await cache.keys();
  await Promise.all(keys.slice(0, Math.max(0, keys.length - MAX_TILE_ENTRIES)).map((key) => cache.delete(key)));
}

async function tileFirst(request) {
  const cache = await caches.open(TILE_CACHE);
  const cached = await cache.match(request);
  if (cached) return cached;
  const response = await fetch(request);
  if (response.ok || response.type === "opaque") {
    await cache.put(request, response.clone());
    void trimTiles();
  }
  return response;
}

async function networkFirst(request) {
  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(STATIC_CACHE);
      await cache.put(request, response.clone());
    }
    return response;
  } catch {
    return (await caches.match(request)) || (await caches.match("/"));
  }
}

async function staticFirst(request) {
  const cached = await caches.match(request);
  if (cached) return cached;
  const response = await fetch(request);
  if (response.ok) {
    const cache = await caches.open(STATIC_CACHE);
    await cache.put(request, response.clone());
  }
  return response;
}

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;
  const url = new URL(event.request.url);
  if (url.pathname.startsWith("/api/")) {
    event.respondWith(fetch(event.request).catch(() => new Response(JSON.stringify({ error: "Hors ligne" }), {
      status: 503,
      headers: { "Content-Type": "application/json" },
    })));
    return;
  }
  if (url.hostname === "tile.openstreetmap.org" || url.hostname.endsWith(".tile.openstreetmap.org")) {
    event.respondWith(tileFirst(event.request));
    return;
  }
  if (event.request.mode === "navigate") {
    event.respondWith(networkFirst(event.request));
    return;
  }
  if (url.origin === self.location.origin) event.respondWith(staticFirst(event.request));
});
