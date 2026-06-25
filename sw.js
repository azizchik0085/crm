const CACHE_NAME = 'courier-app-cache-v2';
const ASSETS = [
  '/courier.html',
  '/css/courier-style.css',
  '/js/storage.js',
  '/js/courier-app.js',
  '/manifest.json',
  '/assets/icon-192.png',
  '/assets/icon-512.png',
  'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css'
];

// Install Event
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      console.log('Caching assets');
      return cache.addAll(ASSETS);
    })
  );
  self.skipWaiting();
});

// Activate Event
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys => {
      return Promise.all(
        keys.map(key => {
          if (key !== CACHE_NAME) {
            return caches.delete(key);
          }
        })
      );
    })
  );
  self.clients.claim();
});

// Fetch Event (Cache-first with Network fallback)
self.addEventListener('fetch', event => {
  // Only cache GET requests
  if (event.request.method !== 'GET') return;
  
  // Skip backend API calls to ensure live data is fetched
  if (event.request.url.includes('/api/')) {
    return;
  }

  // Only handle Courier PWA assets to avoid caching the main admin site (index.html, app.js, crm.js, etc.)
  const isCourierAsset = ASSETS.some(asset => {
    const path = asset.startsWith('http') ? asset : self.location.origin + asset;
    return event.request.url === path;
  }) || event.request.url.includes('courier.html') || event.request.url.includes('courier-app.js') || event.request.url.includes('courier-style.css');

  if (!isCourierAsset) {
    return; // Fallback to normal network request
  }

  event.respondWith(
    caches.match(event.request).then(cachedResponse => {
      if (cachedResponse) {
        return cachedResponse;
      }
      return fetch(event.request).then(networkResponse => {
        if (!networkResponse || networkResponse.status !== 200) {
          return networkResponse;
        }
        // Cache newly fetched assets
        const responseToCache = networkResponse.clone();
        caches.open(CACHE_NAME).then(cache => {
          cache.put(event.request, responseToCache);
        });
        return networkResponse;
      }).catch(() => {
        // Return cached page offline if network fails
        if (event.request.mode === 'navigate') {
          return caches.match('/courier.html');
        }
      });
    })
  );
});
