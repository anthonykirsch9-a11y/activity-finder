// Weekio Service Worker — v2.1 (notifications vendredi)
const CACHE_NAME = 'weekio-v4';
const ASSETS = ['/', '/index.html', '/manifest.json'];

// Install
self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE_NAME).then(c => c.addAll(ASSETS)).then(() => self.skipWaiting())
  );
});

// Activate
self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

// Fetch — réseau en priorité, cache en fallback
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  if (!e.request.url.startsWith('http')) return;
  e.respondWith(
    fetch(e.request).catch(() => caches.match(e.request))
  );
});

// ── NOTIFICATIONS PUSH ──
let _notifTimer = null;

self.addEventListener('message', e => {
  if (!e.data) return;

  if (e.data.type === 'SCHEDULE_WEEKEND_NOTIF') {
    const { delayMs, city, timestamp } = e.data;
    console.log('[SW] Notification planifiée dans', Math.round(delayMs / 3600000), 'h pour', city);

    // Annuler le précédent timer si existant
    if (_notifTimer) clearTimeout(_notifTimer);

    // Planifier la notification
    _notifTimer = setTimeout(() => {
      sendWeekendNotif(city);
    }, Math.min(delayMs, 2147483647)); // max ~24 jours (limite JS)

    // Confirmer à la page
    e.source?.postMessage({ type: 'NOTIF_SCHEDULED', timestamp });
  }

  if (e.data.type === 'SEND_TEST_NOTIF') {
    sendWeekendNotif(e.data.city || 'votre ville', true);
  }
});

async function sendWeekendNotif(city, isTest = false) {
  const title = isTest ? '🔔 Test Weekio' : '🌿 C\'est bientôt le week-end !';
  const body = `Voici 3 idées d'activités près de ${city} pour ce week-end. Ouvre Weekio pour découvrir !`;

  try {
    await self.registration.showNotification(title, {
      body,
      icon: '/favicon.ico',
      badge: '/favicon.ico',
      tag: 'weekio-weekend',
      renotify: true,
      data: { url: '/', city },
      actions: [
        { action: 'open', title: '🔍 Chercher des idées' },
        { action: 'dismiss', title: 'Plus tard' }
      ]
    });
    console.log('[SW] Notification envoyée pour', city);
  } catch(e) {
    console.error('[SW] Erreur notification:', e);
  }
}

// Clic sur notification → ouvrir l'app
self.addEventListener('notificationclick', e => {
  e.notification.close();
  if (e.action === 'dismiss') return;

  const city = e.notification.data?.city || '';
  const url = city ? `/?notif_city=${encodeURIComponent(city)}` : '/';

  e.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(clientList => {
      if (clientList.length > 0) {
        clientList[0].focus();
        clientList[0].postMessage({ type: 'NOTIF_CLICK', city });
        return;
      }
      return clients.openWindow(url);
    })
  );
});
