const CACHE_NAME = 'programme-hebdo-cache-v1';
const urlsToCache = [
  './',
  './index.html',
  './manifest.json',
  './favicon.ico',
  './icons/icon-192.png' // important si utilisé dans la notif
];

// Mise en cache des fichiers
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(urlsToCache))
  );
  self.skipWaiting();
});

// Nettoyage ancien cache
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(key => key !== CACHE_NAME).map(key => caches.delete(key)))
    )
  );
  self.clients.claim();
});

// Réponses aux requêtes réseau
self.addEventListener('fetch', event => {
  event.respondWith(
    caches.match(event.request).then(cachedResp => {
      return cachedResp || fetch(event.request).catch(() => {
        // return caches.match('/offline.html'); // à activer si page offline
      });
    })
  );
});

// 🔔 Réception de message depuis la page principale
self.addEventListener('message', event => {
  if (event.data && event.data.type === 'notify-task') {
    const task = event.data.task;
    self.registration.showNotification(`Tâche à faire : ${task.text}`, {
      body: task.time ? `Heure : ${task.time}` : 'Pas d’heure précisée',
      icon: 'icons/icon-192.png',
      badge: 'icons/icon-192.png',
      tag: task.id,
      renotify: true
    });
  }
});
