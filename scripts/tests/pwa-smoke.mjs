// PWA smoke (spec §5.5 y §11): el paso de la app anterior al rediseño, con el service worker de verdad.
// La versión anterior es la app de main 31a15b8 con su sw.js (scripts/tests/fixtures/app-anterior);
// después se publica el árbol de trabajo con las marcas de versión subidas, como el despliegue de B4 y
// B5. Las dos versiones reciben los mismos datos y el mismo src/config.js, congelados: los de las
// fixtures de B1 (23/09/2026), nunca los data-*.js vivos, que cambian con el bot y al activar 2026/27.
// El SW anterior sirve los .js de src/ con stale-while-revalidate y los .css con cache-first, los dos
// ignorando la ?v= (A1 de la revisión):
//  - la hoja nueva va en otra URL, acta.css, que su caché no tiene;
//  - la primera vez que se abre un código nuevo, index.html quita de las cachés de otras versiones su
//    código y sus hojas antes de importar app.js (desde B3, para cualquier versión: decisión 155).
// Mientras el SW nuevo se instala (su precache queda retenido), cada apertura tiene que ser entera de
// una versión: la 1.ª, la anterior; la 2.ª y la 3.ª, la nueva (documento, hoja y módulos), también si
// en la 1.ª falló la actualización en segundo plano de app.js y state.js. Sin conexión entre la 1.ª y
// la 2.ª, el index.html nuevo no encuentra ni la hoja ni los módulos: el aviso con «Reintentar», que
// con conexión abre la app nueva. Con el SW nuevo activo, la app nueva funciona sin conexión: la
// portada, Jornada y el buscador de Explorar (B3), con los datos precacheados.
// Después, un segundo escenario: un despliegue de código sobre el SW de la propia rama (codeDeploy).
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { startServer, findChrome } from './render-smoke.mjs';
import { waitForAsync } from './browser-wait.mjs';
import { fixture } from './fixtures/rediseno/load.mjs';

const { chromium } = createRequire(import.meta.url)('playwright');
const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const PREVIOUS = join(ROOT, 'scripts', 'tests', 'fixtures', 'app-anterior');
// La portada del rediseño, en cualquier estado (spec §11), y la de la app anterior.
const HOME = 'section[data-screen="home"][data-state]';
const OLD_HOME = '.me-hero';
const read = (dir, file) => {
  const path = join(dir, file);
  return existsSync(path) && statSync(path).isFile() ? readFileSync(path, 'utf8') : null;
};
const versionOf = (sw) => sw.match(/CACHE_NAME = 'futbolbase-v([^']+)'/)[1];
const OLD_VERSION = versionOf(read(PREVIOUS, 'sw.js'));
const TREE_VERSION = versionOf(read(ROOT, 'sw.js'));
const PUBLISHED = '20991231a';
const oldCache = `futbolbase-v${OLD_VERSION}`;
const expected = `futbolbase-v${PUBLISHED}`;
const publish = (file, text) => (file === 'index.html' || file === 'sw.js' ? text.replaceAll(TREE_VERSION, PUBLISHED) : text);
const NOTICE = 'No se pudo abrir la versión nueva de la app. Comprueba la conexión y pulsa Reintentar.';

// Los datos y la configuración de las dos versiones, congelados (R2-2 de la revisión adversarial): las
// fixtures de B1, el día de los datos de hoy (23/09/2026), y el config.js de la app anterior (2025/26,
// con Las Mesas en PG2). Lo que las fixtures no traen, vacío: las temporadas archivadas, que el SW
// anterior precachea todas, y las fichas de jugadores, que la app anterior pide para su portada.
const js = (pairs) => ({ type: 'text/javascript', body: pairs.map(([name, value]) => `const ${name}=${JSON.stringify(value)};`).join('\n') + '\n' });
const FROZEN = (() => {
  const raw = fixture('current-2025-2026');
  const past = fixture('historical-2024-2025');
  const cups = fixture('cups-2025-2026');
  return {
    'src/config.js': { type: 'text/javascript', body: read(PREVIOUS, 'src/config.js') },
    'data-benjamin.js': js([['BENJAMIN', raw.benjamin]]),
    'data-prebenjamin.js': js([['PREBENJAMIN', raw.prebenjamin]]),
    'data-history.js': js([['HISTORY', raw.history]]),
    'data-goleadores.js': js([['GOL_BENJ', []], ['GOL_PREBENJ', []]]),
    'data-matchdetail-keys.js': js([['MATCH_DETAIL_KEYS', {}]]),
    'data-shields.js': js([['SHIELDS', fixture('shields')]]),
    'data-stats.js': js([['STATS', {}]]),
    'data-seasons.js': js([['SEASONS', [{ name: '2025-2026', current: true }, { name: '2024-2025', current: false }]]]),
    'data-maspalomas-cup-2026.js': js([['MASPALOMAS_CUP_BENJAMIN', cups.benjamin], ['MASPALOMAS_CUP_PREBENJAMIN', cups.prebenjamin]]),
    'data-season-2024-2025.js': js([['SEASON_2024_2025', { name: '2024-2025', current: false, benjamin: past.benjamin, prebenjamin: past.prebenjamin }]]),
    'data-matchdetail.js': js([['MATCH_DETAIL', fixture('matchdetail')]]),
    'data-lineups-2025-2026.js': js([['LINEUPS_2025_2026', fixture('lineups-2025-2026')]]),
    'data-health.json': { type: 'application/json', body: JSON.stringify(fixture('health')) },
  };
})();
function frozen(file) {
  if (Object.hasOwn(FROZEN, file)) return FROZEN[file];
  const [, kind, from, to] = file.match(/^data-(season|players)-(\d{4})-(\d{4})\.js$/) || [];
  if (kind === 'season') return js([[`SEASON_${from}_${to}`, { name: `${from}-${to}`, current: false, benjamin: [], prebenjamin: [] }]]);
  if (kind === 'players') return js([[`PLAYERS_${from}_${to}`, {}], [`TEAMS_${from}_${to}`, {}]]);
  return null;
}

// De qué versión es lo que sirvió una apertura: la anterior, la nueva, igual en las dos o ninguna.
function generation(file, body) {
  const data = frozen(file);
  if (data) return body === data.body ? 'igual' : 'ninguna';
  const before = read(PREVIOUS, file);
  const now = read(ROOT, file);
  const after = now === null ? null : publish(file, now);
  if (body === before && body === after) return 'igual';
  if (body === after) return 'nueva';
  if (body === before) return 'anterior';
  return 'ninguna';
}

const upstream = await startServer();
let phase = 'anterior';
let release;
const precacheHeld = new Promise((resolve) => { release = resolve; });
const failing = new Set();   // actualizaciones en segundo plano del SW anterior que fallan
const proxy = createServer(async (req, res) => {
  const url = new URL(req.url, 'http://portal.test');
  const file = decodeURIComponent(url.pathname === '/' ? 'index.html' : url.pathname.slice(1));
  const fromWorker = req.headers['sec-fetch-dest'] === 'empty';
  const isConfig = file === 'src/config.js';
  const isDocument = file === 'index.html';
  const cacheControl = isConfig || isDocument ? 'public, max-age=3600' : 'no-store';
  try {
    if (phase === 'nueva') {
      // El precache del SW nuevo (con la ?v= publicada) espera a que la prueba lo suelte.
      if (fromWorker && url.searchParams.get('v') === PUBLISHED) await precacheHeld;
      // La actualización en segundo plano del SW anterior (con su ?v=) de un módulo que falla.
      if (fromWorker && url.searchParams.get('v') === OLD_VERSION && failing.has(file)) {
        res.writeHead(503, { 'Content-Type': 'text/plain', 'Cache-Control': 'no-store' });
        res.end('no disponible');
        return;
      }
    }
    // Datos y config.js, congelados y los mismos en las dos versiones; ningún data-* vivo.
    const data = frozen(file);
    if (data || file.startsWith('data-')) {
      if (!data) console.error('PWA fixture HTTP 404 (sin dato congelado)', req.url);
      // Una CDN que aún guarda las URL sin ?v= de antes de publicar: el SW nuevo las pide con ?v=.
      const stale = phase === 'nueva' && isConfig && !url.searchParams.has('v');
      res.writeHead(data ? 200 : 404, { 'Content-Type': data ? data.type : 'text/plain', 'Cache-Control': cacheControl });
      res.end(data ? data.body + (stale ? '\n// previously cached HTTP asset' : '') : 'no está congelado');
      return;
    }
    if (phase === 'anterior') {
      const body = read(PREVIOUS, file);
      if (body !== null) {
        res.writeHead(200, { 'Content-Type': file.endsWith('.css') ? 'text/css' : file.endsWith('.html') ? 'text/html' : file.endsWith('.svg') ? 'image/svg+xml' : file.endsWith('.json') ? 'application/json' : 'text/javascript', 'Cache-Control': cacheControl });
        res.end(body);
        return;
      }
    }
    const response = await fetch(`http://127.0.0.1:${upstream.address().port}${req.url}`);
    // Los módulos de la app anterior ya no existen: su SW los pide en segundo plano y le dan 404.
    const expectedGone = phase === 'nueva' && fromWorker && read(PREVIOUS, file) !== null && read(ROOT, file) === null;
    if (!response.ok && !expectedGone) console.error('PWA fixture HTTP', response.status, req.url);
    let body = Buffer.from(await response.arrayBuffer());
    if (phase === 'nueva' && response.ok) {
      let text = publish(file, body.toString());
      if (file === 'sw.js') text += "\nself.addEventListener('message', e => e.ports[0]?.postMessage(CACHE_NAME));";
      // Una CDN que aún guarda las URL sin ?v= de antes de publicar: el SW nuevo las pide con ?v=.
      if (isDocument && !url.searchParams.has('v')) text += '\n<!-- previously cached HTTP document -->';
      if (file === 'sw.js' || file === 'index.html') body = Buffer.from(text);
    }
    res.writeHead(response.status, { 'Content-Type': response.headers.get('content-type') || 'text/plain', 'Cache-Control': cacheControl });
    res.end(body);
  } catch {
    res.writeHead(500);
    res.end();
  }
});
await new Promise((resolve) => proxy.listen(0, '127.0.0.1', resolve));
const base = `http://127.0.0.1:${proxy.address().port}/index.html`;

// ── 2. Despliegue de código sobre el SW de la rama (A1 de la revisión del plan B3; decisión 157) ──
// La versión «a» es el árbol publicado como 20991231a, instalada y con su SW al mando. Se publica «b»
// (20991231b) con un cambio de código de verdad: state.js exporta SIGUIENTE y app.js lo importa (las
// exportaciones cambian, como de B2 a B3), acta.css lleva una marca (--version-codigo: "b") y CODIGO
// cambia. El SW de «a» revalida src/*.js fichero a fichero y nunca la hoja (cache-first):
//  - la instalación del SW de «b» (sus peticiones con ?v= de «b») queda retenida hasta el final;
//  - 1.ª apertura: «a» entera. En segundo plano, su SW revalida el documento y los módulos, ya de «b»,
//    salvo state.js, que da 503 (mala cobertura): su caché se queda con index.html y app.js de «b» y
//    con state.js y acta.css de «a»;
//  - 2.ª apertura, en otra página: «b» entera (la marca de la hoja, Explorar, sin el aviso del arranque
//    ni errores). Sin la limpieza del arranque (decisión 155), el SyntaxError de state.js y la hoja vieja;
//  - 3.ª, sin conexión (el servidor corta las conexiones): «b» entera, desde la caché;
//  - se suelta la instalación: el SW de «b» toma el mando y borra la caché de «a», y la app es «b» entera.
// Los datos, los congelados de arriba (FROZEN), y el código sin caché HTTP (no-store): determinista.
const CODE_A = '20991231a';
const CODE_B = '20991231b';
const MARK = '--version-codigo';
// Una condición del servidor, que se comprueba cada 50 ms hasta `timeout` (nunca un tiempo fijo).
async function settle(condition, label, timeout = 15000) {
  const deadline = Date.now() + timeout;
  while (!condition()) {
    if (Date.now() >= deadline) throw new Error(`${label}: condition not met after ${timeout}ms`);
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
}
async function codeDeploy(browser) {
  let phase = 'a';
  let down = false;          // sin conexión: el servidor corta cada conexión
  let failState = false;     // la revalidación de state.js del SW de «a» da 503
  let failedState = false;   // y ya la dio
  let release;
  const held = new Promise((resolve) => { release = resolve; });
  // El código de cada versión: el del árbol con sus marcas y, en «b», el cambio de exportaciones y la marca.
  const code = (file) => {
    if (!(file === 'index.html' || file === 'sw.js' || file === 'acta.css' || /^src\/[^/]+\.js$/.test(file))) return null;
    let text = read(ROOT, file);
    if (text === null) return null;
    if (file === 'index.html' || file === 'sw.js') text = text.replaceAll(TREE_VERSION, phase === 'a' ? CODE_A : CODE_B);
    if (phase === 'b') {
      if (file === 'index.html') text = text.replace(/const CODIGO = '[0-9a-f]{8}';/, "const CODIGO = 'siguient';");
      if (file === 'src/state.js') text += "\nexport const SIGUIENTE = 'b';\n";
      if (file === 'src/app.js') text = `import { SIGUIENTE } from './state.js';\nif (SIGUIENTE !== 'b') throw new Error('mezcla');\n${text}`;
      if (file === 'acta.css') text += `\n:root { ${MARK}: "b"; }\n`;
    }
    return text;
  };
  const server = createServer(async (req, res) => {
    const url = new URL(req.url, 'http://portal.test');
    const file = decodeURIComponent(url.pathname === '/' ? 'index.html' : url.pathname.slice(1));
    if (down) { req.socket.destroy(); return; }
    const fromWorker = req.headers['sec-fetch-dest'] === 'empty';
    const v = url.searchParams.get('v');
    try {
      if (fromWorker && v === CODE_B) await held;
      if (failState && fromWorker && v === CODE_A && file === 'src/state.js') {
        failedState = true;
        res.writeHead(503, { 'Content-Type': 'text/plain', 'Cache-Control': 'no-store' });
        res.end('no disponible');
        return;
      }
      const data = frozen(file);
      if (data || file.startsWith('data-')) {
        if (!data) console.error('PWA fixture HTTP 404 (sin dato congelado)', req.url);
        res.writeHead(data ? 200 : 404, { 'Content-Type': data ? data.type : 'text/plain', 'Cache-Control': 'no-store' });
        res.end(data ? data.body : 'no está congelado');
        return;
      }
      const text = code(file);
      if (text !== null) {
        const type = file.endsWith('.css') ? 'text/css' : file.endsWith('.html') ? 'text/html' : 'text/javascript';
        res.writeHead(200, { 'Content-Type': `${type}; charset=utf-8`, 'Cache-Control': 'no-store' });
        res.end(text);
        return;
      }
      const response = await fetch(`http://127.0.0.1:${upstream.address().port}${req.url}`);
      res.writeHead(response.status, { 'Content-Type': response.headers.get('content-type') || 'text/plain', 'Cache-Control': 'no-store' });
      res.end(Buffer.from(await response.arrayBuffer()));
    } catch {
      res.writeHead(500);
      res.end();
    }
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const home = `http://127.0.0.1:${server.address().port}/index.html`;
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: 'es-ES', timezoneId: 'Atlantic/Canary' });
  // Una apertura: una página nueva, que carga la app entera; lo que se ve y los errores del arranque.
  const open = async (label, hash = '#/explorar') => {
    const page = await context.newPage();
    page.setDefaultTimeout(20000);
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    page.on('console', (message) => { if (message.type() === 'error' && message.text().startsWith('[arranque]')) errors.push(message.text().split('\n')[0]); });
    await page.goto(home + hash);
    await waitForAsync(page, () => !!document.querySelector('#contenido section[data-screen], #contenido [role="alert"]'), null, { label });
    const look = await page.evaluate((mark) => ({
      screen: document.querySelector('#contenido section[data-screen]')?.getAttribute('data-screen') ?? null,
      alert: !!document.querySelector('#contenido [role="alert"]'),
      marca: getComputedStyle(document.documentElement).getPropertyValue(mark).trim(),
    }), MARK);
    return { page, seen: { ...look, errores: errors } };
  };
  const whole = (label, seen, marca) => assert.deepEqual(seen, { screen: 'explorar', alert: false, marca, errores: [] },
    `despliegue de código, ${label}: ${JSON.stringify(seen)}`);
  try {
    // «a» instalada: su SW al mando (clients.claim) y su precache, sin volver a cargar la página: así
    // ninguna revalidación de «a» queda pendiente cuando se publica «b».
    let o = await open('despliegue de código, «a»', '#/');
    await waitForAsync(o.page, (name) => caches.keys().then((keys) => keys.includes(name) && !!navigator.serviceWorker.controller),
      `futbolbase-v${CODE_A}`, { label: 'despliegue de código, «a» instalada' });
    await o.page.close();
    // Se publica «b». 1.ª apertura: «a» entera; su SW revalida en segundo plano, y state.js da 503.
    phase = 'b';
    failState = true;
    o = await open('despliegue de código, 1.ª apertura');
    whole('1.ª apertura, «a» entera', o.seen, '');
    await settle(() => failedState, 'despliegue de código, la revalidación de state.js');
    await waitForAsync(o.page, async ([name, a, b]) => {
      const cache = await caches.open(name);
      const text = async (key) => { const response = await cache.match(key); return response ? response.text() : ''; };
      return (await text('./index.html')).includes(b) && (await text(`./src/app.js?v=${a}`)).includes('SIGUIENTE');
    }, [`futbolbase-v${CODE_A}`, CODE_A, CODE_B], { label: 'despliegue de código, index.html y app.js de «b» en la caché de «a»' });
    await o.page.close();
    failState = false;
    // 2.ª apertura, con el SW de «a» al mando: «b» entera.
    o = await open('despliegue de código, 2.ª apertura');
    whole('2.ª apertura, «b» entera', o.seen, '"b"');
    await o.page.close();
    // 3.ª, sin conexión: «b» entera, desde la caché del SW de «a».
    down = true;
    o = await open('despliegue de código, 3.ª apertura sin conexión');
    whole('3.ª apertura sin conexión, «b» entera', o.seen, '"b"');
    await o.page.close();
    down = false;
    // Se suelta la instalación del SW de «b»: toma el mando y borra la caché de «a». Se espera desde
    // una página que el SW sirve de la red sin guardar nada (manifest.json), para que ninguna
    // revalidación del SW de «a» toque su caché mientras «b» se activa; y, como la comprobación de la
    // publicación, pidiendo la actualización en cada vuelta. Si no llega, el error dice cómo quedó.
    release();
    const probe = await context.newPage();
    await probe.goto(home.replace(/index\.html$/, 'manifest.json'));
    const workers = () => probe.evaluate(async () => {
      const registration = await navigator.serviceWorker.getRegistration();
      return { caches: await caches.keys(), installing: registration?.installing?.state ?? null, waiting: registration?.waiting?.state ?? null,
        active: registration?.active?.state ?? null, controlled: !!navigator.serviceWorker.controller };
    });
    await waitForAsync(probe, async (name) => {
      const registration = await navigator.serviceWorker.getRegistration();
      try { await registration?.update(); } catch { /* ya se está instalando */ }
      const keys = await caches.keys();
      return keys.length === 1 && keys[0] === name && registration?.active?.state === 'activated'
        && navigator.serviceWorker.controller === registration.active;
    }, `futbolbase-v${CODE_B}`, { timeout: 30000, interval: 500, label: 'despliegue de código, el SW de «b» al mando' })
      .catch(async (error) => { throw new Error(`${error.message.split('\n')[0]}: ${JSON.stringify(await workers())}`); });
    await probe.close();
    // Con el SW de «b» al mando desde la navegación: «b» entera.
    o = await open('despliegue de código, con el SW de «b»');
    whole('con el SW de «b»', o.seen, '"b"');
    await o.page.close();
    console.log('PASS: despliegue de código sobre el SW de la rama: la 1.ª apertura es la versión anterior; la 2.ª, con su revalidación de state.js fallida, y la 3.ª, sin conexión, la nueva entera (su hoja y sus módulos, sin el aviso del arranque); con el SW nuevo, también');
  } finally {
    release();
    await context.close();
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
  }
}

let browser;
try {
  browser = await chromium.launch({ executablePath: findChrome(), headless: true, args: ['--no-sandbox'] });
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: 'es-ES', timezoneId: 'Atlantic/Canary' });
  // La app anterior pide sus fuentes a Google: fuera de la prueba.
  await context.route(/^https:\/\/fonts\.(googleapis|gstatic)\.com\//, (route) => route.abort());
  context.on('console', (message) => { if (message.text().includes('[SW]')) console.log(message.text()); });
  const page = await context.newPage();
  page.setDefaultTimeout(20000);
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  // Lo que sirve cada apertura (documento, hojas y módulos de src/), con su versión.
  let served = [];
  page.on('response', (response) => {
    const url = new URL(response.url());
    if (url.origin !== new URL(base).origin || !/^\/(index\.html)?$|\.css$|^\/src\/.+\.js$/.test(url.pathname)) return;
    const file = url.pathname === '/' ? 'index.html' : decodeURIComponent(url.pathname.slice(1));
    served.push(response.text().then((body) => ({ file, generation: generation(file, body) }), () => ({ file, generation: 'sin cuerpo' })));
  });
  const opening = async (label, wanted) => {
    const seen = await Promise.all(served);
    served = [];
    const byGeneration = {};
    for (const { file, generation: g } of seen) (byGeneration[g] ||= []).push(file);
    const other = wanted === 'nueva' ? 'anterior' : 'nueva';
    assert.ok(seen.some(({ file }) => file === 'index.html'), `${label}: no llegó el documento`);
    assert.ok(seen.some(({ file }) => file.endsWith('.css')), `${label}: no llegó ninguna hoja`);
    for (const g of [other, 'ninguna', 'sin cuerpo']) {
      assert.deepEqual(byGeneration[g] || [], [], `${label}: la versión ${wanted} con ficheros de «${g}»`);
    }
    assert.deepEqual(errors, [], `${label}: errores de JavaScript`);
  };

  // 1. La app anterior instalada: su SW controla la página y tiene su precache.
  await page.goto(base);
  await page.locator(OLD_HOME).waitFor();
  await page.evaluate(async () => { await navigator.serviceWorker.ready; });
  await page.reload();
  await page.locator(OLD_HOME).waitFor();
  await waitForAsync(page, (name) => caches.keys().then((keys) => keys.includes(name) && !!navigator.serviceWorker.controller), oldCache);
  served = [];

  // 2. Se publica el rediseño. En la 1.ª apertura, la actualización en segundo plano de app.js y
  // state.js falla: su caché se queda con los viejos, aunque ya guarde el index.html nuevo.
  phase = 'nueva';
  failing.add('src/app.js');
  failing.add('src/state.js');
  await page.reload();
  await page.locator(OLD_HOME).waitFor();
  await opening('1.ª apertura', 'anterior');
  await waitForAsync(page, (name) => caches.open(name).then((cache) => cache.match('./index.html'))
    .then((response) => (response ? response.text() : '')).then((text) => text.includes('id="contenido"')), oldCache);
  failing.clear();

  // 3. Sin conexión, con el SW anterior al mando y el index.html nuevo en su caché, que no tiene ni
  // acta.css ni los módulos nuevos: el aviso con «Reintentar», nunca «Cargando…» sin más (R2-3).
  await context.setOffline(true);
  await page.reload();
  const notice = page.locator('#contenido [role="alert"]');
  await notice.waitFor();
  assert.equal((await notice.locator('p').textContent()).trim(), NOTICE);
  const retry = notice.getByRole('button', { name: 'Reintentar' });
  assert.ok((await retry.boundingBox()).height >= 44, '«Reintentar» mide al menos 44 px');
  assert.equal(await page.locator(`${HOME}, ${OLD_HOME}, [data-skeleton]`).count(), 0, 'sin conexión: ni una portada ni el esqueleto');
  assert.deepEqual(errors, [], 'sin conexión: errores de JavaScript');
  served = [];

  // 4. Con conexión, «Reintentar» abre la app nueva (2.ª apertura), y recargar, la 3.ª; con el SW
  // anterior todavía al mando: la app nueva entera, con acta.css.
  await context.setOffline(false);
  for (const [label, open] of [['2.ª apertura, con «Reintentar»', () => retry.click()], ['3.ª apertura', () => page.reload()]]) {
    await open();
    await page.locator(HOME).waitFor();
    await opening(label, 'nueva');
    assert.ok(await page.evaluate((name) => caches.keys().then((keys) => keys.includes(name)), oldCache), `${label}: el SW anterior ya no manda`);
    const look = await page.evaluate(() => ({
      sheets: [...document.styleSheets].map((sheet) => new URL(sheet.href || location.href).pathname),
      font: getComputedStyle(document.body).fontFamily.split(',')[0].replace(/["']/g, ''),
      bar: getComputedStyle(document.querySelector('.tabbar')).position,
    }));
    assert.deepEqual(look, { sheets: ['/acta.css'], font: 'Public Sans', bar: 'fixed' }, label);
  }

  // 5. El SW nuevo termina de instalarse, borra la caché anterior y toma el mando.
  release();
  await waitForAsync(page, ({ expected, oldCache }) => caches.keys().then((keys) => keys.includes(expected) && !keys.includes(oldCache)), { expected, oldCache });
  await waitForAsync(page, async () => {
    const registration = await navigator.serviceWorker.getRegistration();
    return registration?.active?.state === 'activated' && navigator.serviceWorker.controller === registration.active;
  });
  await waitForAsync(page, (expected) => new Promise((resolve) => {
    const channel = new MessageChannel();
    channel.port1.onmessage = (event) => resolve(event.data === expected);
    navigator.serviceWorker.controller?.postMessage('version', [channel.port2]);
    setTimeout(() => resolve(false), 500);
  }), expected);
  await page.reload();
  await page.locator(HOME).waitFor();
  await opening('con el SW nuevo', 'nueva');
  const config = await page.evaluate(async (name) => {
    const response = await (await caches.open(name)).match('./src/config.js');
    return response ? response.text() : null;
  }, expected);
  assert.ok(config && config.includes('export const PORTAL'), 'config.js precacheado');
  assert.ok(!config.includes('previously cached HTTP asset'), 'the new PWA must bypass HTTP entries cached before publication');
  assert.ok(!(await page.content()).includes('previously cached HTTP document'), 'navigation must retain the newly published HTML');
  assert.equal(await page.evaluate(async (name) => (await (await caches.open(name)).match('./index.html'))?.status, expected), 200);

  // 6. Sin conexión: la portada, con la fuente, los iconos y la hoja precacheados.
  await context.setOffline(true);
  await page.reload();
  await page.locator(HOME).waitFor();
  await opening('sin conexión', 'nueva');
  assert.match(await page.locator(HOME).getAttribute('data-state'), /^[ABCD]$/);
  assert.equal(await page.locator('h1').count(), 1);
  const precached = await page.evaluate(async (name) => (await (await caches.open(name)).keys()).map((r) => new URL(r.url).pathname), expected);
  for (const path of ['/fonts/PublicSans-latin.woff2', '/icons/icon-192.png', '/src/screen-home.js', '/src/screen-jornada.js', '/src/screen-explorar.js', '/acta.css']) {
    assert.ok(precached.includes(path), `${path} is not precached`);
  }
  // La cabecera avisa de que no hay conexión (spec §4.10).
  await waitForAsync(page, () => document.querySelector('.shell-offline')?.textContent.startsWith('Sin conexión.'));
  // Jornada, por la barra, también sin conexión: su módulo y los datos inmediatos están en caché.
  await page.locator('.tabbar a.tab[href="#/jornada"]').click();
  await page.locator('#contenido section[data-screen="jornada"]').waitFor();
  assert.equal(await page.locator('#contenido section[data-screen="jornada"][data-state="error"]').count(), 0);
  assert.equal(await page.locator('#contenido h1').textContent(), 'Jornada');
  // Explorar, por la barra, también sin conexión (B3): el buscador filtra con los datos precacheados.
  await page.locator('.tabbar a.tab[href="#/explorar"]').click();
  await page.locator('#contenido section[data-screen="explorar"]').waitFor();
  assert.equal(await page.locator('#contenido h1').textContent(), 'Explorar');
  await page.locator('#buscar').fill('hurac');
  await page.locator('#resultados a.search-result[href="#/equipo?s=2025-2026&g=PG2&t=AD%20Hurac%C3%A1n"]').waitFor();
  assert.equal(await page.locator('#contenido .error-box').count(), 0, 'Explorar sin conexión: sin cajas de error');
  assert.deepEqual(errors, []);
  console.log(`PASS: de la app anterior (su SW real) al rediseño, con datos congelados: la 1.ª apertura es la anterior; sin conexión a medias, el aviso con «Reintentar»; la 2.ª y la 3.ª, la nueva con acta.css y sin mezclar módulos; con ${expected}, la portada, Jornada y el buscador de Explorar funcionan sin conexión`);
  await context.close();
  await codeDeploy(browser);
} finally {
  if (browser) await browser.close();
  proxy.closeAllConnections();
  upstream.closeAllConnections();
  await Promise.all([new Promise((resolve) => proxy.close(resolve)), new Promise((resolve) => upstream.close(resolve))]);
}
