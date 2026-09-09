import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { startServer, findChrome } from './render-smoke.mjs';

const { chromium } = createRequire(import.meta.url)('playwright');
const upstream = await startServer();
let legacy = true;
const oldCache = 'futbolbase-v-test-previous';
const expected = readFileSync(new URL('../../sw.js', import.meta.url), 'utf8').match(/CACHE_NAME = '([^']+)'/)[1];
const proxy = createServer(async (req, res) => {
  if (req.url.split('?')[0] === '/sw.js' && legacy) {
    res.writeHead(200, { 'Content-Type': 'text/javascript', 'Cache-Control': 'no-store' });
    res.end(`self.addEventListener('install', e => { e.waitUntil(caches.open('${oldCache}').then(c => c.put('./src/config.js', new Response('previous version')))); self.skipWaiting(); }); self.addEventListener('activate', e => e.waitUntil(self.clients.claim())); self.addEventListener('message', e => e.ports[0]?.postMessage('old'));`);
    return;
  }
  try {
    const response = await fetch(`http://127.0.0.1:${upstream.address().port}${req.url}`);
    if (!response.ok) console.error('PWA fixture HTTP', response.status, req.url);
    res.writeHead(response.status, { 'Content-Type': response.headers.get('content-type') || 'text/plain', 'Cache-Control': 'no-store' });
    const body = Buffer.from(await response.arrayBuffer());
    res.end(req.url.startsWith('/sw.js') ? body.toString() + "\nself.addEventListener('message', e => e.ports[0]?.postMessage(CACHE_NAME));" : body);
  } catch { res.writeHead(500); res.end(); }
});
await new Promise(resolve => proxy.listen(0, '127.0.0.1', resolve));
let browser;
try {
  browser = await chromium.launch({ executablePath: findChrome(), headless: true, args: ['--no-sandbox'] });
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: 'es-ES' });
  const page = await context.newPage();
  context.on('console', message => { if (message.text().includes('[SW]')) console.log(message.text()); });
  page.setDefaultTimeout(15000);
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(`http://127.0.0.1:${proxy.address().port}/index.html`);
  await page.locator('.me-hero').waitFor();
  // Finish the page's initial registration/update cycle before simulating
  // publication; otherwise an in-flight legacy response can arrive afterward.
  await page.evaluate(async () => (await navigator.serviceWorker.ready).update());
  await page.waitForFunction(old => caches.keys().then(keys => keys.includes(old)), oldCache);
  legacy = false;
  await page.evaluate(async () => (await navigator.serviceWorker.getRegistration()).update());
  await page.waitForFunction(({ expected, oldCache }) => caches.keys().then(keys => keys.includes(expected) && !keys.includes(oldCache)), { expected, oldCache });
  await page.waitForFunction(async () => {
    const registration = await navigator.serviceWorker.getRegistration();
    return registration?.active?.state === 'activated' && navigator.serviceWorker.controller === registration.active;
  });
  await page.waitForFunction(expected => new Promise(resolve => {
    const channel = new MessageChannel();
    channel.port1.onmessage = event => resolve(event.data === expected);
    navigator.serviceWorker.controller?.postMessage('version', [channel.port2]);
    setTimeout(() => resolve(false), 500);
  }), expected);
  await page.reload();
  await page.locator('.me-hero').waitFor();
  const config = await page.evaluate(async name => {
    const cache = await caches.open(name);
    const response = await cache.match('./src/config.js');
    if (!response) throw new Error('Missing config. Cached: ' + (await cache.keys()).map(r => r.url).join(', '));
    return response.text();
  }, expected);
  assert.ok(config.includes('export const PORTAL'));
  assert.equal(await page.evaluate(async name => (await (await caches.open(name)).match('./index.html'))?.status, expected), 200);
  await page.evaluate(async () => (await navigator.serviceWorker.ready).update());
  await page.waitForFunction(async () => {
    const registration = await navigator.serviceWorker.getRegistration();
    return registration?.active?.state === 'activated' && navigator.serviceWorker.controller === registration.active;
  });
  await page.waitForFunction(expected => new Promise(resolve => {
    const channel = new MessageChannel();
    channel.port1.onmessage = event => resolve(event.data === expected);
    navigator.serviceWorker.controller?.postMessage('version', [channel.port2]);
    setTimeout(() => resolve(false), 500);
  }), expected);
  await context.setOffline(true);
  await page.reload();
  await page.locator('.me-hero').waitFor();
  await page.locator('#chooseTeam').click();
  await page.locator('#favoriteSearch').fill('Mesas');
  assert.ok(await page.locator('.picker-team').count() > 0);
  assert.deepEqual(errors, []);
  console.log(`PASS: previous PWA cache replaced by ${expected}; dashboard and team search work offline`);
  await context.close();
} finally {
  if (browser) await browser.close();
  proxy.closeAllConnections(); upstream.closeAllConnections();
  await Promise.all([new Promise(resolve => proxy.close(resolve)), new Promise(resolve => upstream.close(resolve))]);
}
