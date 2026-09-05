const CACHE_NAME = 'tubetally-runtime-v1';
const OFFLINE_URL = './index.html';
const ASSETS_TO_CACHE = [
  './',
  './index.html',
  './manifest.json',
  './icon.svg',
  './version.json',
  './auth.v2.1.bundle.js'
];

self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS_TO_CACHE))
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(
      keys.map((key) => {
        if (key !== CACHE_NAME) return caches.delete(key);
      })
    ))
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;

  const url = new URL(event.request.url);
  const refreshOnline = event.request.mode === 'navigate'
    || url.pathname.endsWith('.bundle.js')
    || url.pathname.endsWith('/version.json');

  if (refreshOnline) {
    event.respondWith((async () => {
      try {
        const response = await fetch(event.request);
        if (response.status === 200 && response.type !== 'opaque') {
          const cache = await caches.open(CACHE_NAME);
          const cacheKey = event.request.mode === 'navigate' ? OFFLINE_URL : event.request;
          await cache.put(cacheKey, response.clone());
        }
        return response;
      } catch {
        const cached = await caches.match(event.request);
        if (cached) return cached;
        if (event.request.mode === 'navigate') return caches.match(OFFLINE_URL);
        return new Response('', { status: 503, statusText: 'Offline' });
      }
    })());
    return;
  }

  event.respondWith((async () => {
    const cached = await caches.match(event.request);
    if (cached) return cached;
    const response = await fetch(event.request);
    if (response.status === 200 && response.type !== 'opaque') {
      const cache = await caches.open(CACHE_NAME);
      await cache.put(event.request, response.clone());
    }
    return response;
  })());
});
