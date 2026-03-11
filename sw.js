const CACHE_NAME = 'agendapro-v3';
const ASSETS = ['/TaskWeek/', '/TaskWeek/index.html', '/TaskWeek/manifest.json'];

self.addEventListener('install', e => {
  self.skipWaiting();
  e.waitUntil(caches.open(CACHE_NAME).then(c => c.addAll(ASSETS).catch(() => {})));
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  e.respondWith(
    caches.match(e.request).then(cached => {
      if (cached) return cached;
      return fetch(e.request).then(response => {
        if (response && response.status === 200 && response.type === 'basic') {
          const clone = response.clone();
          caches.open(CACHE_NAME).then(c => c.put(e.request, clone));
        }
        return response;
      }).catch(() => caches.match('/TaskWeek/index.html'));
    })
  );
});

// IndexedDB helpers
function openDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open('agendapro-sw', 2);
    req.onupgradeneeded = e => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains('notifs')) db.createObjectStore('notifs', { keyPath: 'id' });
      if (!db.objectStoreNames.contains('widget')) db.createObjectStore('widget', { keyPath: 'key' });
    };
    req.onsuccess = e => resolve(e.target.result);
    req.onerror = () => reject(req.error);
  });
}
function dbGetAll(store) {
  return openDB().then(db => new Promise((res, rej) => {
    const req = db.transaction(store, 'readonly').objectStore(store).getAll();
    req.onsuccess = () => res(req.result);
    req.onerror = () => rej(req.error);
  }));
}
function dbPut(store, obj) {
  return openDB().then(db => new Promise((res, rej) => {
    const tx = db.transaction(store, 'readwrite');
    tx.objectStore(store).put(obj);
    tx.oncomplete = () => res();
    tx.onerror = () => rej(tx.error);
  }));
}
function dbDelete(store, key) {
  return openDB().then(db => new Promise((res, rej) => {
    const tx = db.transaction(store, 'readwrite');
    tx.objectStore(store).delete(key);
    tx.oncomplete = () => res();
    tx.onerror = () => rej(tx.error);
  }));
}

// Messages from the page
self.addEventListener('message', async e => {
  const { type, payload } = e.data || {};
  if (type === 'SCHEDULE_NOTIF') {
    await dbPut('notifs', payload);
    if (self.registration.periodicSync) {
      try { await self.registration.periodicSync.register('check-notifs', { minInterval: 60000 }); } catch(_) {}
    }
    try { await self.registration.sync.register('check-notifs'); } catch(_) {}
  }
  if (type === 'CANCEL_NOTIF') await dbDelete('notifs', payload.id);
  if (type === 'CANCEL_ALL_NOTIFS') {
    const all = await dbGetAll('notifs');
    for (const n of all) await dbDelete('notifs', n.id);
  }
  if (type === 'UPDATE_WIDGET') {
    await dbPut('widget', { key: 'data', ...payload });
    await updateWidget();
  }
  if (type === 'CHECK_NOTIFS') await checkAndFireNotifs();
});

// Check and fire due notifications
async function checkAndFireNotifs() {
  const now = Date.now();
  let notifs;
  try { notifs = await dbGetAll('notifs'); } catch(_) { return; }
  for (const n of notifs) {
    if (n.fireAt <= now) {
      await self.registration.showNotification(n.title, {
        body: n.body || '',
        icon: '/TaskWeek/icons/icon-192.png',
        badge: '/TaskWeek/icons/icon-192.png',
        requireInteraction: true,
        data: { url: '/', eventId: n.id },
        actions: [
          { action: 'open', title: '📅 Ouvrir' },
          { action: 'snooze', title: '⏰ +10 min' },
          { action: 'dismiss', title: '✕ Ignorer' }
        ]
      });
      await dbDelete('notifs', n.id);
    }
  }
  const upcoming = notifs.filter(n => n.fireAt > now);
  if ('setAppBadge' in self.navigator) {
    upcoming.length > 0
      ? self.navigator.setAppBadge(upcoming.length).catch(()=>{})
      : self.navigator.clearAppBadge().catch(()=>{});
  }
}

self.addEventListener('periodicsync', e => {
  if (e.tag === 'check-notifs') e.waitUntil(checkAndFireNotifs());
});

self.addEventListener('sync', e => {
  if (e.tag === 'check-notifs') e.waitUntil(checkAndFireNotifs());
});

self.addEventListener('push', e => {
  const data = e.data ? e.data.json() : {};
  e.waitUntil(self.registration.showNotification(data.title || 'Agenda Pro', {
    body: data.body || '',
    icon: '/TaskWeek/icons/icon-192.png',
    badge: '/TaskWeek/icons/icon-192.png',
    vibrate: [200, 100, 200],
    tag: data.tag || 'agenda-notif',
    requireInteraction: true,
    data: { url: data.url || '/' },
    actions: [
      { action: 'open', title: '📅 Ouvrir' },
      { action: 'snooze', title: '⏰ +10 min' },
      { action: 'dismiss', title: '✕ Ignorer' }
    ]
  }));
});

self.addEventListener('notificationclick', e => {
  e.notification.close();
  if (e.action === 'dismiss') return;
  if (e.action === 'snooze') {
    dbPut('notifs', {
      id: e.notification.tag + '_snooze_' + Date.now(),
      title: e.notification.title,
      body: e.notification.body,
      fireAt: Date.now() + 10 * 60 * 1000,
      tag: e.notification.tag
    });
    return;
  }
  e.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(list => {
      for (const c of list) { if ('focus' in c) return c.focus(); }
      if (clients.openWindow) return clients.openWindow('/TaskWeek/');
    })
  );
});

// Widget API (Chrome Android experimental)
async function updateWidget() {
  if (!('widgets' in self)) return;
  const rows = await dbGetAll('widget');
  const widgetData = rows.find(x => x.key === 'data');
  if (!widgetData) return;
  try {
    const instances = await self.widgets.matchAll({ tag: 'agenda-today' });
    for (const w of instances) {
      await self.widgets.updateByInstanceId(w.id, { data: JSON.stringify(widgetData) });
    }
  } catch(_) {}
}

self.addEventListener('widgetinstall', e => {
  e.waitUntil(updateWidget());
});
self.addEventListener('widgetresume', e => {
  e.waitUntil(updateWidget());
});
self.addEventListener('widgetclick', e => {
  e.waitUntil(clients.openWindow('/TaskWeek/').catch(()=>{}));
});
