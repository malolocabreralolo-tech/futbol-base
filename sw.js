const CACHE_NAME = 'futbolbase-v20260428d';
const OFFLINE_URL = './index.html';

// Static assets — cached on install, served cache-first
const STATIC_ASSETS = [
  './',
  './index.html',
  './style.css',
  './src/app.js',
  './src/init.js',
  './src/state.js',
  './src/render.js',
  './src/modals.js',
  './data-benjamin.js',
  './data-prebenjamin.js',
  './data-history.js',
  './data-goleadores.js',
  './data-matchdetail.js',
  './data-shields.js',
  './data-stats.js',
  './data-seasons.js',
  './icons.svg',
  './manifest.json',
];

// Season data files — loaded lazily by the app, precache when available
const SEASON_FILES = [
  './data-season-2024-2025.js',
  './data-season-2023-2024.js',
  './data-season-2022-2023.js',
  './data-season-2021-2022.js',
];

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE_NAME).then(async c => {
      // Core assets — fail install if any missing (network-first for reliability)
      await c.addAll(STATIC_ASSETS).catch(err => {
        console.warn('[SW] Static asset precache failed (will retry on demand):', err);
      });
      // Season files — best effort, don't block install
      await Promise.allSettled(SEASON_FILES.map(url => c.add(url)));
    })
  );
  self.skipWaiting();
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);

  // Skip non-GET and cross-origin
  if (e.request.method !== 'GET') return;
  if (url.origin !== self.location.origin) return;

  // Cache-first for static assets (js, css, images, fonts)
  if (/\.(js|css|png|jpg|webp|svg|woff2?)$/.test(url.pathname) || url.pathname.startsWith('./escudos')) {
    e.respondWith(
      caches.match(e.request).then(cached => {
        if (cached) return cached;
        return fetch(e.request).then(response => {
          if (response.ok) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then(c => c.put(e.request, clone));
          }
          return response;
        });
      })
    );
    return;
  }

  // Stale-while-revalidate for HTML and data files (balance freshness + offline)
  if (url.pathname === '/' || url.pathname.endsWith('.html') || url.pathname.endsWith('.js') && url.pathname.includes('data-')) {
    e.respondWith(
      caches.match(e.request).then(cached => {
        const networkFetch = fetch(e.request).then(response => {
          if (response.ok) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then(c => c.put(e.request, clone));
          }
          return response;
        }).catch(() => cached || caches.match(OFFLINE_URL));
        return cached || networkFetch;
      })
    );
    return;
  }

  // Default: network, fall back to offline page
  e.respondWith(
    fetch(e.request).catch(() => caches.match(OFFLINE_URL))
  );
});
