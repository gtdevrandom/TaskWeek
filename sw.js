const CACHE_NAME = 'programme-hebdo-cache-v1';
const urlsToCache = [
  './',
  './index.html',
  './manifest.json',
];

// Cache les assets à l'installation
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      return cache.addAll(urlsToCache);
    })
  );
});

// Répond avec cache ou réseau
self.addEventListener('fetch', event => {
  event.respondWith(
    caches.match(event.request).then(response => {
      return response || fetch(event.request);
    })
  );
});
