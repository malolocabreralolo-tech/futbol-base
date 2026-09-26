// El presupuesto de rendimiento de la spec (§5.4), medido con un guion del repo (decisión 11 del plan
// B4). No se llama test_*.mjs: ni node --test ni el CI lo ejecutan, porque mide tiempos.
//
//   node scripts/tests/presupuesto.mjs [--web <url>] [--runs N]
//
// El perfil es el de la auditoría de §5.4, el móvil de Lighthouse: «4G lenta» (150 ms de latencia,
// 1.638,4 kbit/s de bajada y 750 kbit/s de subida) y la CPU ×4, por CDP, en frío (sin caché ni SW).
// - Portada: index.html con los datos del árbol (servido por pages-server.mjs, como GitHub Pages) o
//   los de la web de --web, a 390×844 y DPR 3. «Portada pintada» es el momento en que
//   #contenido section[data-screen="home"] entra en el documento (el esqueleto estático no cuenta).
//   La mediana de N aperturas (3), la suya y la del LCP, tiene que bajar de 3.000 ms.
// - CLS: el mundo A de fixture-site.mjs (datos congelados y reloj fijado), con el mismo perfil, a 390
//   (DPR 3) y a 1440 px. De cada apertura, la suma de los desplazamientos sin interacción (una cota
//   superior del CLS de web-vitals); el máximo de N por ancho, menor de 0,1. Siempre en local: el
//   mundo A lo sirve Playwright.
// - Imágenes de Tabla: index.html#/tabla?s=2025-2026&g=PG2 con los datos del árbol (o los de --web), en
//   frío y con todas las imágenes de la pantalla (las diferidas se piden ya): la suma de los bytes
//   transferidos, menos de 300 KB (de 1.024 bytes).
// Ninguna espera es un tiempo fijo: cada medida espera a su condición (la pantalla en el documento, la
// fuente y las imágenes a la vista completas y nada en vuelo por la red, en dos comprobaciones
// seguidas) y a dos fotogramas, para que lleguen las últimas entradas de LCP y de layout-shift.
// Sale con 0 (PRESUPUESTO: OK), con 1 si un umbral no se cumple (PRESUPUESTO: MAL) y con 2 si no pudo
// medir.
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { waitForAsync } from './browser-wait.mjs';
import { useWorld } from './fixture-site.mjs';
import { startPagesServer } from './pages-server.mjs';
import { findChrome } from './render-smoke.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
export const LIMITS = { home: 3000, lcp: 3000, cls: 0.1, tablaKB: 300 };
const SLOW_4G = { offline: false, latency: 150, downloadThroughput: (1638.4 * 1024) / 8, uploadThroughput: (750 * 1024) / 8 };
const CPU = 4;
const PHONE = { width: 390, height: 844, dpr: 3 };
const DESKTOP = { width: 1440, height: 900, dpr: 1 };
const TABLA = 'index.html#/tabla?s=2025-2026&g=PG2';

export function parseArgs(argv) {
  const args = { web: null, runs: 3 };
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === '--web' && argv[i + 1]) args.web = new URL(argv[(i += 1)]).href.replace(/\/?$/, '/');
    else if (argv[i] === '--runs' && /^[1-9]\d*$/.test(argv[i + 1] || '')) args.runs = Number(argv[(i += 1)]);
    else throw new Error(`argumento no válido: ${argv[i]} (uso: presupuesto.mjs [--web <url>] [--runs N])`);
  }
  return args;
}

export function median(values) {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

const comma = (value, digits) => value.toFixed(digits).replace('.', ',');

// Las líneas del informe y si se cumple todo. home, lcp y fcp: medianas en ms; kb: lo que transfiere
// la portada; cls: { ancho: máximo }; tabla: { bytes, images }.
export function report({ home, lcp, fcp, kb, runs, cls, tabla }) {
  const clsMax = Math.max(...Object.values(cls));
  const tablaKB = tabla.bytes / 1024;
  const ok = home < LIMITS.home && lcp < LIMITS.lcp && clsMax < LIMITS.cls && tablaKB < LIMITS.tablaKB;
  return {
    ok,
    lines: [
      `portada: ${Math.round(home)} ms (< ${LIMITS.home}); LCP ${Math.round(lcp)} ms (< ${LIMITS.lcp}); FCP ${Math.round(fcp)} ms; ${Math.round(kb)} KB; mediana de ${runs}`,
      `CLS: ${comma(clsMax, 4)} (< ${comma(LIMITS.cls, 1)}): ${Object.entries(cls).map(([width, value]) => `${width} px ${comma(value, 4)}`).join(' y ')}; máximo de ${runs}, mundo A`,
      `imágenes de Tabla: ${comma(tablaKB, 1)} KB (< ${LIMITS.tablaKB}): ${tabla.images} imágenes, PG2`,
      `PRESUPUESTO: ${ok ? 'OK' : 'MAL'}`,
    ],
  };
}

// Antes que cualquier script de la página: cuándo entra la portada en el documento, el LCP y la suma de
// los desplazamientos sin interacción.
function observers() {
  const measured = { home: null, lcp: 0, cls: 0 };
  window.__presupuesto = measured;
  new MutationObserver((_, observer) => {
    if (document.querySelector('#contenido section[data-screen="home"]')) {
      measured.home = performance.now();
      observer.disconnect();
    }
  }).observe(document, { childList: true, subtree: true });
  new PerformanceObserver((list) => { for (const entry of list.getEntries()) measured.lcp = entry.startTime; })
    .observe({ type: 'largest-contentful-paint', buffered: true });
  new PerformanceObserver((list) => { for (const entry of list.getEntries()) if (!entry.hadRecentInput) measured.cls += entry.value; })
    .observe({ type: 'layout-shift', buffered: true });
}

// La portada en el documento, la fuente cargada y las imágenes a la vista, completas.
function homeReady() {
  const measured = window.__presupuesto;
  if (!measured || measured.home === null || document.fonts.status !== 'loaded') return false;
  return [...document.images].every((img) => {
    const box = img.getBoundingClientRect();
    return img.complete || box.bottom <= 0 || box.top >= innerHeight || box.width === 0;
  });
}

// La tabla de la clasificación en el documento y todas las imágenes completas: las diferidas se piden ya.
function tablaReady() {
  if (!document.querySelector('#contenido section[data-screen="tabla"] table')) return false;
  for (const img of document.querySelectorAll('img[loading="lazy"]')) img.loading = 'eager';
  return [...document.images].every((img) => img.complete);
}

// Una apertura en frío: contexto nuevo sin SW, caché desactivada y, si throttle, la red y la CPU del
// perfil. Cuenta lo que hay en vuelo y los bytes transferidos, en total y de las imágenes.
async function coldPage(browser, { width, height, dpr }, { throttle = true, world = null } = {}) {
  const context = await browser.newContext({
    viewport: { width, height }, deviceScaleFactor: dpr, locale: 'es-ES', timezoneId: 'Atlantic/Canary', serviceWorkers: 'block',
  });
  if (world) await useWorld(context, world);
  const page = await context.newPage();
  const cdp = await context.newCDPSession(page);
  await cdp.send('Network.enable');
  await cdp.send('Network.setCacheDisabled', { cacheDisabled: true });
  if (throttle) {
    await cdp.send('Network.emulateNetworkConditions', SLOW_4G);
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: CPU });
  }
  const net = { pending: new Set(), bytes: 0, images: 0, imageBytes: 0 };
  const types = new Map();
  cdp.on('Network.requestWillBeSent', (e) => { if (!e.request.url.startsWith('data:')) net.pending.add(e.requestId); });
  cdp.on('Network.responseReceived', (e) => { types.set(e.requestId, e.type); });
  cdp.on('Network.loadingFinished', (e) => {
    if (!net.pending.delete(e.requestId)) return;
    net.bytes += e.encodedDataLength;
    if (types.get(e.requestId) === 'Image') { net.images += 1; net.imageBytes += e.encodedDataLength; }
  });
  cdp.on('Network.loadingFailed', (e) => { net.pending.delete(e.requestId); });
  await page.addInitScript(observers);
  return { context, page, net };
}

// La página está quieta: su condición se cumple y no hay nada en vuelo, en dos comprobaciones seguidas
// (cada 100 ms, como waitForAsync). Después, dos fotogramas y una tarea.
async function settle(page, net, ready, label) {
  const deadline = Date.now() + 90000;
  for (let calm = 0; calm < 2;) {
    await waitForAsync(page, ready, null, { timeout: Math.max(1, deadline - Date.now()), interval: 100, label });
    calm = net.pending.size === 0 ? calm + 1 : 0;
    if (calm < 2) {
      if (Date.now() > deadline) throw new Error(`${label}: ${net.pending.size} peticiones siguen en vuelo tras 90 s`);
      await new Promise((next) => setTimeout(next, 100));
    }
  }
  await page.evaluate(() => new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(() => setTimeout(done, 0)))));
}

async function measureHome(browser, site, runs) {
  const results = [];
  for (let i = 1; i <= runs; i += 1) {
    const { context, page, net } = await coldPage(browser, PHONE);
    try {
      await page.goto(new URL('index.html', site).href, { waitUntil: 'commit', timeout: 90000 });
      await settle(page, net, homeReady, `portada, apertura ${i}`);
      const times = await page.evaluate(() => ({
        home: window.__presupuesto.home,
        lcp: window.__presupuesto.lcp,
        fcp: performance.getEntriesByName('first-contentful-paint')[0]?.startTime ?? 0,
      }));
      results.push({ ...times, kb: net.bytes / 1024 });
    } finally {
      await context.close();
    }
  }
  const of = (key) => median(results.map((result) => result[key]));
  return { home: of('home'), lcp: of('lcp'), fcp: of('fcp'), kb: of('kb') };
}

async function measureCls(browser, site, runs) {
  const cls = {};
  for (const device of [PHONE, DESKTOP]) {
    cls[device.width] = 0;
    for (let i = 1; i <= runs; i += 1) {
      const { context, page, net } = await coldPage(browser, device, { world: 'A' });
      try {
        await page.goto(new URL('index.html', site).href, { waitUntil: 'commit', timeout: 90000 });
        const label = `CLS a ${device.width} px, apertura ${i}`;
        await settle(page, net, homeReady, label);
        const { state, value } = await page.evaluate(() => ({
          state: document.querySelector('#contenido section[data-screen="home"]').getAttribute('data-state'),
          value: window.__presupuesto.cls,
        }));
        if (state !== 'A') throw new Error(`${label}: la portada del mundo A está en ${state}, no en A`);
        cls[device.width] = Math.max(cls[device.width], value);
      } finally {
        await context.close();
      }
    }
  }
  return cls;
}

async function measureTabla(browser, site) {
  const { context, page, net } = await coldPage(browser, PHONE, { throttle: false });
  try {
    await page.goto(new URL(TABLA, site).href, { waitUntil: 'commit', timeout: 90000 });
    await settle(page, net, tablaReady, 'Tabla de PG2');
    return { bytes: net.imageBytes, images: net.images };
  } finally {
    await context.close();
  }
}

async function main(argv) {
  const args = parseArgs(argv);
  const chrome = findChrome();
  if (!chrome) throw new Error('no hay Chrome: CHROME=/ruta/de/chrome');
  const { chromium } = createRequire(import.meta.url)('playwright');
  // server y browser se crean dentro del try: si chromium.launch() falla (binario roto, sandbox
  // denegado…) el servidor ya arrancado no debe quedar abierto colgando el proceso. Cada cierre se
  // hace solo si llegó a crearse, y su fallo no debe tapar el error original del try (o su resultado).
  let server = null;
  let browser = null;
  try {
    server = await startPagesServer(ROOT);
    browser = await chromium.launch({ executablePath: chrome, headless: true, args: ['--no-sandbox'] });
    const site = args.web || server.url;
    console.log(`sitio: ${args.web || 'el árbol, con pages-server.mjs'}; el CLS, en local con el mundo A`);
    const home = await measureHome(browser, site, args.runs);
    const cls = await measureCls(browser, server.url, args.runs);
    const tabla = await measureTabla(browser, site);
    const { lines, ok } = report({ ...home, runs: args.runs, cls, tabla });
    for (const line of lines) console.log(line);
    return ok ? 0 : 1;
  } finally {
    if (browser) await browser.close().catch(() => {});
    if (server) await server.close().catch(() => {});
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main(process.argv.slice(2)).then((code) => { process.exitCode = code; }, (error) => {
    console.error(`PRESUPUESTO: sin medir: ${error.message}`);
    process.exitCode = 2;
  });
}
