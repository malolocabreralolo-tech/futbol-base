const CACHE_NAME = 'futbolbase-v20260301';
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
});
