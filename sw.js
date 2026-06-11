// Weekio Service Worker — Notifications push vendredi 17h
// À déployer à la RACINE du repo GitHub (même niveau que index.html)

const CACHE_NAME = 'weekio-sw-v1';
const SUPABASE_URL = 'https://scsycswbcbofxgfluukr.supabase.co';
const SUPABASE_ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNjc3ljc3diY2JvZnhnZmx1dWtyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3MTQ1NTY4MDAsImV4cCI6MjAzMDEzMjgwMH0.placeholder';

let scheduledTimer = null;

// ── Installation ──
self.addEventListener('install', e => {
  self.skipWaiting();
});

self.addEventListener('activate', e => {
  e.waitUntil(clients.claim());
});

// ── Réception des messages depuis l'app ──
self.addEventListener('message', e => {
  const { type, delayMs, city, timestamp } = e.data || {};

  if (type === 'SCHEDULE_WEEKEND_NOTIF') {
    // Annuler tout timer existant
    if (scheduledTimer) clearTimeout(scheduledTimer);

    console.log('[SW] Notification planifiée dans', Math.round(delayMs / 1000 / 60), 'minutes pour', city);

    // Programmer la notification
    scheduledTimer = setTimeout(async () => {
      await sendWeekendNotif(city);
    }, delayMs);

    // Confirmer à l'app
    e.source?.postMessage({ type: 'NOTIF_SCHEDULED', timestamp });
  }

  if (type === 'CANCEL_NOTIF') {
    if (scheduledTimer) { clearTimeout(scheduledTimer); scheduledTimer = null; }
  }

  if (type === 'TEST_NOTIF') {
    // Pour tester immédiatement sans attendre vendredi
    sendWeekendNotif(city || 'Paris');
  }
});

// ── Générer et envoyer la notification ──
async function sendWeekendNotif(city) {
  try {
    // Appel à Supabase Edge Function pour générer l'activité via Claude
    let activity = null;
    try {
      const res = await fetch(`${SUPABASE_URL}/functions/v1/weekend-notif`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${SUPABASE_ANON}`
        },
        body: JSON.stringify({ city })
      });
      if (res.ok) {
        const data = await res.json();
        activity = data.activity;
      }
    } catch(err) {
      console.warn('[SW] Edge function failed, using fallback', err);
    }

    // Fallback si l'API échoue
    const title = activity?.titre || `🗓 C'est bientôt le week-end !`;
    const body = activity?.description
      ? `${activity.description.substring(0, 100)}...`
      : `Des idées d'activités autour de ${city} t'attendent sur Weekio !`;

    await self.registration.showNotification(title, {
      body,
      icon: '/icon-192.png',
      badge: '/icon-72.png',
      tag: 'weekio-weekend',
      renotify: true,
      vibrate: [200, 100, 200],
      data: { city, url: 'https://weekio.app' },
      actions: [
        { action: 'open', title: '🗓 Voir les idées' },
        { action: 'dismiss', title: 'Plus tard' }
      ]
    });

    // Re-planifier pour le vendredi suivant
    const nextFriday = getNextFriday17h();
    const delayMs = nextFriday - Date.now();
    scheduledTimer = setTimeout(() => sendWeekendNotif(city), delayMs);
    console.log('[SW] Prochaine notification planifiée pour', new Date(nextFriday).toLocaleString('fr-FR'));

  } catch(err) {
    console.error('[SW] Erreur notification:', err);
  }
}

// ── Clic sur la notification ──
self.addEventListener('notificationclick', e => {
  e.notification.close();
  const city = e.notification.data?.city || '';
  const url = e.notification.data?.url || 'https://weekio.app';

  if (e.action === 'dismiss') return;

  e.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(clientList => {
      // Si l'app est déjà ouverte, focus dessus
      for (const client of clientList) {
        if (client.url.includes('weekio.app') && 'focus' in client) {
          client.focus();
          client.postMessage({ type: 'NOTIF_CLICK', city });
          return;
        }
      }
      // Sinon ouvrir une nouvelle fenêtre
      if (clients.openWindow) {
        return clients.openWindow(url + (city ? `?city=${encodeURIComponent(city)}` : ''));
      }
    })
  );
});

// ── Fermeture de la notification ──
self.addEventListener('notificationclose', e => {
  console.log('[SW] Notification fermée');
});

// ── Utilitaire : prochain vendredi à 17h ──
function getNextFriday17h() {
  const now = new Date();
  const next = new Date(now);
  const day = now.getDay();
  const daysUntil = (5 - day + 7) % 7 || 7;
  next.setDate(now.getDate() + daysUntil);
  next.setHours(17, 0, 0, 0);
  return next.getTime();
}
