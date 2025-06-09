const CACHE_NAME = 'programme-hebdo-cache-v1';
const urlsToCache = [
  './',
  './index.html',
  './manifest.json',
  './favicon.ico'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(urlsToCache))
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(key => key !== CACHE_NAME).map(key => caches.delete(key)))
    )
  );
});

self.addEventListener('fetch', event => {
  event.respondWith(
    caches.match(event.request).then(cachedResp => {
      return cachedResp || fetch(event.request).catch(() => {
        // Optionnel: fallback vers page offline si tu en as une
        // return caches.match('/offline.html');
      });
    })
  );
});
