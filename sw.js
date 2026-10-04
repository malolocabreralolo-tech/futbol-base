const CACHE_NAME = 'futbolbase-v20261004t';
const CRESTS_CACHE = 'futbolbase-escudos-e8bc8090';
const OFFLINE_URL = './index.html';

// Los escudos (escudos/, originales y miniaturas) van en su propia caché,
// CRESTS_CACHE, no en CACHE_NAME, que cambia con cada subida de datos del bot
// (decisión 1 de B5): al activarse cada versión nueva se borraban con la
// anterior, y la primera apertura sin red pintaba monogramas. Su nombre lleva
// el sello de escudos/ (las 8 primeras cifras hex del sha1 de la lista
// ordenada de «<ruta>:<sha1 del fichero>»), que escribe y comprueba
// scripts/build_crests.py: un escudo nuevo o cambiado da otro sello, y
// `activate` borra la caché anterior. El bot no toca esta línea: sus
// expresiones buscan futbolbase-v (test_index_bot_contract.py).

// La URL de red lleva la versión (?v=), y las claves de la caché, no. GitHub
// Pages purga su CDN en cada despliegue y su clave no mira la query: la ?v=
// solo cambia la clave de la caché HTTP del navegador. Los escudos llevan su
// sello en vez de la versión de los datos (decisión 1 de B5).
function versionedAssetURL(request, version = CACHE_NAME.replace('futbolbase-v', '')) {
  const url = new URL(typeof request === 'string' ? request : request.url, self.location.href);
  url.searchParams.set('v', version);
  return url.href;
}

function fetchFresh(request, cache = 'no-cache', version) {
  return fetch(versionedAssetURL(request, version), { cache, credentials: 'same-origin' });
}

// Static assets — cached on install (spec §5.5): the page, the stylesheet, the
// manifest, the self-hosted font, the PWA icons, the FULL static import graph
// of src/app.js (test_sw_fixes.mjs compares it with the real graph) and the
// eager data-*.js that index.html loads.
const STATIC_ASSETS = [
  './',
  './index.html',
  './acta.css',
  './manifest.json',
  './data-health.json',
  './fonts/PublicSans-latin.woff2',
  './icons/icon-180.png',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-maskable-512.png',
  './src/app.js',
  './src/router.js',
  './src/shell.js',
  './src/screens.js',
  './src/screen-ligas.js',
  './src/screen-explorar.js',
  './src/screen-jornada.js',
  './src/screen-tabla.js',
  './src/screen-partido.js',
  './src/screen-temporadas.js',
  './src/screen-fuentes.js',
  './src/screen-ajustes.js',
  './src/screen-records.js',
  './src/screen-copa.js',
  './src/screen-goleadores.js',
  './src/screen-equipo.js',
  './src/config.js',
  './src/html.js',
  './src/links.js',
  './src/model.js',
  './src/myteam.js',
  './src/screen-home.js',
  './src/team-view.js',
  './src/team-extras.js',
  './src/state.js',
  './src/store.js',
  './src/ui.js',
  './data-benjamin.js',
  './data-prebenjamin.js',
  './data-history.js',
  './data-goleadores.js',
  './data-shields.js',
  './data-seasons.js',
  './data-maspalomas-cup-2026.js',
];

// Season data files — loaded lazily by the app, precache when available: los
// archivos de las temporadas pasadas. scripts/activate_season.py añade el de la
// temporada que cierra.
const SEASON_FILES = [
  './data-season-2025-2026.js',
  './data-season-2024-2025.js',
  './data-season-2023-2024.js',
  './data-season-2022-2023.js',
  './data-season-2021-2022.js',
];

// Las actas van por grupo (data-lineups-<S>-<grupo>.js): precachearlas todas
// serían ~10 MB por temporada en cada subida de datos. Se guardan según se
// usan (stale-while-revalidate) y cada versión nueva vuelve a bajar, al
// instalarse, las de los grupos que ya estaban en la caché de la anterior
// (las LINEUPS_KEEP más recientes), antes de que `activate` la borre: la
// ficha de mi equipo, ya vista, sigue con su plantilla sin conexión tras una
// subida de datos (decisión 2 de B5).
const LINEUPS_KEEP = 12;

// Pure: de las URLs de las cachés anteriores (en orden de inserción, la más
// reciente al final), las rutas relativas de las actas de grupo que hay que
// volver a bajar, sin repetir y como mucho `keep`.
function lineupsToCarry(urls, keep = LINEUPS_KEEP) {
  const files = [];
  for (const url of urls) {
    const file = new URL(url).pathname.split('/').pop();
    if (!/^data-lineups-\d{4}-\d{4}-[A-Za-z0-9]+\.js$/.test(file)) continue;
    const i = files.indexOf(file);
    if (i >= 0) files.splice(i, 1);
    files.push(file);
  }
  return files.slice(-keep).map(file => './' + file);
}

async function usedLineups() {
  const urls = [];
  for (const name of await caches.keys()) {
    if (!name.startsWith('futbolbase-v') || name === CACHE_NAME) continue;
    for (const request of await (await caches.open(name)).keys()) urls.push(request.url);
  }
  return lineupsToCarry(urls);
}

// Pure: decide the caching strategy for a same-origin GET pathname.
//   'swr'         -> stale-while-revalidate: HTML + data-*.js (freshness matters,
//                    but serve cache instantly and revalidate in background).
//                    NOTE: the data- check runs BEFORE the generic .js check —
//                    otherwise cache-first would capture all .js and make this
//                    branch unreachable.
//   'escudo'      -> escudos/ (originales y miniaturas): cache-first en
//                    CRESTS_CACHE, que no cambia con los datos (decisión 1 de
//                    B5). Antes del cache-first genérico, que casaría con sus
//                    .png y .jpg.
//   'cache-first' -> code, styles, images, fonts (immutable per ?v=).
//   'network'     -> everything else (network, offline fallback).
function classifyRequest(pathname) {
  const file = pathname.split('/').pop();
  if (file === 'data-health.json') return 'swr';
  if (file.startsWith('data-') && file.endsWith('.js')) return 'swr';
  // Los módulos de src/ se piden SIN ?v= (index.html versiona app.js, pero no
  // sus imports), así que con cache-first un arreglo de solo código no llegaba
  // al usuario hasta que por casualidad cambiaran los datos o alguien se
  // acordara de bumpear CACHE_NAME a mano. Con stale-while-revalidate se sirve
  // igual de rápido y la siguiente carga ya lleva el arreglo.
  if (pathname.includes('/src/') && pathname.endsWith('.js')) return 'swr';
  if (pathname.endsWith('/') || pathname.endsWith('.html')) return 'swr';
  if (pathname.includes('/escudos/')) return 'escudo';
  if (/\.(js|css|png|jpg|jpeg|webp|svg|woff2?|ico)$/.test(pathname)) return 'cache-first';
  return 'network';
}

// El precache guarda las URLs SIN ?v= y la página las pide CON ?v=, así que
// una búsqueda exacta no encontraba nada: 1,2 MB descargados en cada
// instalación para no usarlos jamás. Ignorar la query es seguro porque la
// caché entera está versionada por CACHE_NAME — al bumpearla se reinstala todo
// y `activate` borra las generaciones anteriores, así que dentro de una misma
// caché no puede haber dos versiones del mismo fichero.
async function matchIgnoringVersion(request) {
  // Primero la entrada EXACTA (con su ?v=), y solo si no está, la del
  // precache, que va sin versión. Buscar directamente ignorando la query hacía
  // que una copia mala del precache — instalada, por ejemplo, mientras el
  // despliegue estaba a medias — se sirviera para siempre en vez de saltarse
  // como antes. Con este orden, cuando existe la versionada manda ella, y el
  // precache sigue valiendo para la primera carga (que es para lo que está).
  const cache = await caches.open(CACHE_NAME);
  return (await cache.match(request))
      || (await cache.match(request, { ignoreSearch: true }));
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
      // One unavailable asset must not discard all the successful downloads.
      const carried = await usedLineups().catch(() => []);
      const results = await Promise.allSettled([...STATIC_ASSETS, ...SEASON_FILES, ...carried].map(async url => {
        const response = await fetchFresh(url, 'reload');
        if (!response.ok) throw new Error(url + ': HTTP ' + response.status);
        await c.put(url, response);
      }));
      const failed = results.filter(result => result.status === 'rejected');
      if (failed.length) console.warn('[SW] Assets will retry on demand:', failed.length);
    })
  );
  // Activate the updated SW immediately (paired with clients.claim below)
  self.skipWaiting();
});

// Solo las cachés de esta app de otras versiones: las futbolbase-v* que no son
// CACHE_NAME y las futbolbase-escudos-* que no son CRESTS_CACHE (decisión 1 de
// B5). El origen (malolocabreralolo-tech.github.io) lo comparte otro proyecto
// de la cuenta, y sus cachés no se tocan (decisión 8 de B4). La limpieza del
// arranque de index.html solo mira las futbolbase-v* (código y hojas).
self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => (k.startsWith('futbolbase-v') && k !== CACHE_NAME)
        || (k.startsWith('futbolbase-escudos-') && k !== CRESTS_CACHE)).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
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
        const networkFetch = fetchFresh(e.request).then(async response => {
          if (response.ok) await putAndPurge(e.request, response.clone());
          return response;
        }).catch(() => cached || caches.match(OFFLINE_URL));
        e.waitUntil(networkFetch.then(() => {}));
        return cached || networkFetch;
      })
    );
    return;
  }

  // Escudos: cache-first contra CRESTS_CACHE (decisión 1 de B5); de la red, con
  // el sello como ?v=. La copia se guarda antes de responder (un escudo pesa
  // unos KB): el que se ve ya está en la caché, aunque la app se cierre en
  // seguida. Si no se puede guardar, se pinta igual.
  if (strategy === 'escudo') {
    e.respondWith(
      caches.open(CRESTS_CACHE).then(async cache => {
        const cached = await cache.match(e.request);
        if (cached) return cached;
        const response = await fetchFresh(e.request, 'no-cache', CRESTS_CACHE.replace('futbolbase-escudos-', ''));
        if (response.ok) await cache.put(e.request, response.clone()).catch(() => {});
        return response;
      })
    );
    return;
  }

  // Cache-first for static assets (js, css, images, fonts)
  if (strategy === 'cache-first') {
    e.respondWith(
      matchIgnoringVersion(e.request).then(cached => {
        if (cached) return cached;
        return fetchFresh(e.request).then(response => {
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
