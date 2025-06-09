const CACHE_NAME = 'programme-hebdo-cache-v1';
const urlsToCache = [
  '/hebdo-app/',
  '/hebdo-app/index.html',
  '/hebdo-app/manifest.json',
  '/hebdo-app/icons/icon-192.png',
  '/hebdo-app/icons/icon-512.png',
  '/hebdo-app/favicon.ico'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      return cache.addAll(urlsToCache);
    })
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(cacheNames =>
      Promise.all(
        cacheNames.filter(name => name !== CACHE_NAME)
          .map(name => caches.delete(name))
      )
    )
  );
});

self.addEventListener('fetch', event => {
  event.respondWith(
    caches.match(event.request).then(response =>
      response || fetch(event.request)
    )
  );
});
