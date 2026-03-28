const CACHE_NAME = 'futbolbase-v20260328b';

// All files to precache on install
const ASSETS = [
  './',
  './index.html',
  './style.css',
  './app.js',
  './data-benjamin.js',
  './data-prebenjamin.js',
  './data-history.js',
  './data-goleadores.js',
  './data-matchdetail.js',
  './data-shields.js',
  './data-stats.js',
  './data-seasons.js'
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE_NAME).then(c => c.addAll(ASSETS)));
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
  // Always fetch from network, no caching during development
  e.respondWith(
    fetch(e.request).catch(() => caches.match(e.request).then(cached => cached || caches.match('./index.html')))
  );
});
