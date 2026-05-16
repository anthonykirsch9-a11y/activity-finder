const CACHE_NAME = 'weekio-v1';
const ASSETS_TO_CACHE = [
  './',
  './index.html',
  './manifest.json',
  'https://fonts.googleapis.com/css2?family=Fraunces:ital,opsz,wght@0,9..144,700;0,9..144,800;1,9..144,700&family=DM+Sans:wght@400;500;600;700&display=swap',
  'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css'
];

// Installation — mise en cache des ressources essentielles
self.addEventListener('install', function(event) {
  event.waitUntil(
    caches.open(CACHE_NAME).then(function(cache) {
      console.log('✅ Weekio : mise en cache des ressources');
      return cache.addAll(ASSETS_TO_CACHE).catch(function(err) {
        console.log('Cache partiel (normal pour les fonts externes):', err);
      });
    })
  );
  self.skipWaiting();
});

// Activation — suppression des anciens caches
self.addEventListener('activate', function(event) {
  event.waitUntil(
    caches.keys().then(function(cacheNames) {
      return Promise.all(
        cacheNames.filter(function(name) {
          return name !== CACHE_NAME;
        }).map(function(name) {
          return caches.delete(name);
        })
      );
    })
  );
  self.clients.claim();
});

// Fetch — stratégie Network First avec fallback cache
self.addEventListener('fetch', function(event) {
  // Ne pas intercepter les requêtes API (Supabase, OpenMeteo, Places)
  const url = event.request.url;
  if (
    url.includes('supabase.co') ||
    url.includes('open-meteo.com') ||
    url.includes('googleapis.com/maps') ||
    url.includes('api.anthropic.com') ||
    url.includes('pexels.com') ||
    url.includes('wa.me')
  ) {
    return; // Laisser passer sans interception
  }

  event.respondWith(
    fetch(event.request)
      .then(function(response) {
        // Mettre en cache les réponses réussies
        if (response && response.status === 200 && response.type === 'basic') {
          const responseToCache = response.clone();
          caches.open(CACHE_NAME).then(function(cache) {
            cache.put(event.request, responseToCache);
          });
        }
        return response;
      })
      .catch(function() {
        // Réseau indisponible → servir depuis le cache
        return caches.match(event.request).then(function(cached) {
          if (cached) return cached;
          // Fallback ultime : page principale
          if (event.request.destination === 'document') {
            return caches.match('./index.html');
          }
        });
      })
  );
});
