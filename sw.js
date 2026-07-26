const CACHE_NAME = 'futbolbase-v20260726u';
const OFFLINE_URL = './index.html';

// Static assets — cached on install, served cache-first.
// Must cover the FULL static import graph of src/app.js
// (app → init → state/render → modals/miequipo → plantilla/matchdetail-rich).
const STATIC_ASSETS = [
  './',
  './index.html',
  './style.css',
  './src/app.js',
  './src/init.js',
  './src/state.js',
  './src/render.js',
  './src/modals.js',
  './src/miequipo.js',
  './src/plantilla.js',
  './src/matchdetail-rich.js',
  './data-benjamin.js',
  './data-prebenjamin.js',
  './data-history.js',
  './data-goleadores.js',
  './data-matchdetail-keys.js',
  './data-shields.js',
  './data-stats.js',
  './data-seasons.js',
  './data-maspalomas-cup-2026.js',
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

// Pure: decide the caching strategy for a same-origin GET pathname.
//   'swr'         -> stale-while-revalidate: HTML + data-*.js (freshness matters,
//                    but serve cache instantly and revalidate in background).
//                    NOTE: the data- check runs BEFORE the generic .js check —
//                    otherwise cache-first would capture all .js and make this
//                    branch unreachable.
//   'cache-first' -> code, styles, images, fonts, escudos (immutable per ?v=).
//   'network'     -> everything else (network, offline fallback).
function classifyRequest(pathname) {
  const file = pathname.split('/').pop();
  if (file.startsWith('data-') && file.endsWith('.js')) return 'swr';
  // Los módulos de src/ se piden SIN ?v= (index.html versiona app.js, pero no
  // sus imports), así que con cache-first un arreglo de solo código no llegaba
  // al usuario hasta que por casualidad cambiaran los datos o alguien se
  // acordara de bumpear CACHE_NAME a mano. Con stale-while-revalidate se sirve
  // igual de rápido y la siguiente carga ya lleva el arreglo.
  if (pathname.includes('/src/') && pathname.endsWith('.js')) return 'swr';
  if (pathname.endsWith('/') || pathname.endsWith('.html')) return 'swr';
  if (/\.(js|css|png|jpg|jpeg|webp|svg|woff2?|ico)$/.test(pathname) ||
      pathname.includes('/escudos/')) return 'cache-first';
  return 'network';
}

// El precache guarda las URLs SIN ?v= y la página las pide CON ?v=, así que
// una búsqueda exacta no encontraba nada: 1,2 MB descargados en cada
// instalación para no usarlos jamás. Ignorar la query es seguro porque la
// caché entera está versionada por CACHE_NAME — al bumpearla se reinstala todo
// y `activate` borra las generaciones anteriores, así que dentro de una misma
// caché no puede haber dos versiones del mismo fichero.
function matchIgnoringVersion(request) {
  return caches.match(request, { ignoreSearch: true });
}

// Pure: given the just-cached request URL and the URLs already in the cache,
// return the entries with the SAME pathname but a DIFFERENT query (stale ?v=
// versions) that must be deleted. Unversioned requests purge nothing, so the
// install-time precache (no ?v=) never wipes versioned runtime entries.
function staleKeysFor(requestUrl, cachedUrls) {
  const u = new URL(requestUrl);
  if (!u.search) return [];
  return cachedUrls.filter(k => {
    const ku = new URL(k);
    return ku.origin === u.origin && ku.pathname === u.pathname && ku.search !== u.search;
  });
}

// Cache a successful response, then purge stale ?v= variants of the same
// pathname (otherwise every daily ?v= bump leaks ~484KB of dead entries).
async function putAndPurge(request, response) {
  const cache = await caches.open(CACHE_NAME);
  await cache.put(request, response);
  const keys = await cache.keys();
  const stale = new Set(staleKeysFor(request.url, keys.map(k => k.url)));
  await Promise.all(keys.filter(k => stale.has(k.url)).map(k => cache.delete(k)));
}

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE_NAME).then(async c => {
      // Core assets — best effort (retry on demand if any missing)
      await c.addAll(STATIC_ASSETS).catch(err => {
        console.warn('[SW] Static asset precache failed (will retry on demand):', err);
      });
      // Season files — best effort, don't block install
      await Promise.allSettled(SEASON_FILES.map(url => c.add(url)));
    })
  );
  // Activate the updated SW immediately (paired with clients.claim below)
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

  const strategy = classifyRequest(url.pathname);

  // Stale-while-revalidate: serve cache instantly, refresh in background
  if (strategy === 'swr') {
    e.respondWith(
      matchIgnoringVersion(e.request).then(cached => {
        const networkFetch = fetch(e.request).then(response => {
          if (response.ok) putAndPurge(e.request, response.clone());
          return response;
        }).catch(() => cached || caches.match(OFFLINE_URL));
        return cached || networkFetch;
      })
    );
    return;
  }

  // Cache-first for static assets (js, css, images, fonts, escudos)
  if (strategy === 'cache-first') {
    e.respondWith(
      matchIgnoringVersion(e.request).then(cached => {
        if (cached) return cached;
        return fetch(e.request).then(response => {
          if (response.ok) putAndPurge(e.request, response.clone());
          return response;
        });
      })
    );
    return;
  }

  // Default: network, fall back to offline page
  e.respondWith(
    fetch(e.request).catch(() => caches.match(OFFLINE_URL))
  );
});
