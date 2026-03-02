const CACHE_NAME = 'futbolbase-v20260302c';
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
  './data-shields.js'
];

// Data files that should use network-first strategy
const DATA_FILES = ['data-benjamin', 'data-prebenjamin', 'data-history', 'data-goleadores', 'data-matchdetail', 'data-shields'];

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
  const isDataFile = DATA_FILES.some(f => e.request.url.includes(f));

  if (isDataFile) {
    // Network-first for data files: always try fresh data, fall back to cache
    e.respondWith(
      fetch(e.request).then(resp => {
        const clone = resp.clone();
        caches.open(CACHE_NAME).then(c => c.put(e.request, clone));
        return resp;
      }).catch(() => caches.match(e.request))
    );
  } else {
    // Cache-first for static assets (HTML, CSS, JS, images)
    e.respondWith(
      caches.match(e.request).then(cached => {
        if (cached) return cached;
        return fetch(e.request).then(resp => {
          if (!e.request.url.startsWith(self.location.origin)) return resp;
          const clone = resp.clone();
          caches.open(CACHE_NAME).then(c => c.put(e.request, clone));
          return resp;
        });
      }).catch(() => caches.match('./index.html'))
    );
  }
});
