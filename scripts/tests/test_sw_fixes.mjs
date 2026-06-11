/**
 * Node test runner — Service Worker + index.html registration fixes.
 * Run: node --test scripts/tests/test_sw_fixes.mjs
 *
 * Covers (review 2026-06-11, agente SW-HTML):
 *   1. STATIC_ASSETS contains the FULL static import graph of src/app.js
 *   2. data-*.js reach the stale-while-revalidate branch (was unreachable:
 *      the generic cache-first .js branch captured them first); escudos clause
 *      fixed (pathname never starts with './')
 *   3. old ?v= query entries are purged from the cache on successful put
 *   4. index.html uses standard SW registration (no unregister-on-every-load)
 *   5. C3: CACHE_NAME literal on line 1, matcheable by /futbolbase-v[0-9a-z]+/
 *
 * sw.js is a classic script (not a module): it is loaded in a vm context with
 * a stubbed `self`, and its pure decision functions (classifyRequest,
 * staleKeysFor) are probed via bare identifiers — same technique as
 * loadDataFile in test_js_modules.mjs.
 */

import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const swSrc = readFileSync(join(ROOT, 'sw.js'), 'utf8');
const idxSrc = readFileSync(join(ROOT, 'index.html'), 'utf8');

// ─── sw.js loader (classic script → vm with stubbed self) ─────────────────
function loadSw() {
  const listeners = {};
  const selfStub = {
    addEventListener: (type, fn) => { listeners[type] = fn; },
    skipWaiting: () => {},
    clients: { claim: () => {} },
    location: { origin: 'https://example.test' },
  };
  const ctx = { self: selfStub, console, URL };
  vm.createContext(ctx);
  const probes = ['CACHE_NAME', 'STATIC_ASSETS', 'classifyRequest', 'staleKeysFor'];
  const probe = probes
    .map(n => `${n}:typeof ${n}!=='undefined'?${n}:undefined`)
    .join(',');
  vm.runInContext(`${swSrc}\nthis.__exports={${probe}};`, ctx);
  return { ...ctx.__exports, listeners };
}

const sw = loadSw();

// ─── 1. static import graph ⊆ STATIC_ASSETS ───────────────────────────────
function staticImportGraph(entry) {
  const seen = new Set();
  const queue = [entry];
  while (queue.length) {
    const f = queue.pop();
    if (seen.has(f)) continue;
    seen.add(f);
    const src = readFileSync(join(ROOT, 'src', f), 'utf8');
    // static imports only: `import ... from './x.js'` and bare `import './x.js'`
    // (dynamic import('./x.js') has a paren, never matches `import '`/`from '`)
    for (const m of src.matchAll(/(?:from|import)\s+['"]\.\/([\w-]+\.js)['"]/g)) {
      queue.push(m[1]);
    }
  }
  return seen;
}

test('STATIC_ASSETS covers the whole static import graph of src/app.js', () => {
  assert.ok(Array.isArray(sw.STATIC_ASSETS), 'STATIC_ASSETS must be an array');
  const graph = staticImportGraph('app.js');
  assert.ok(graph.size >= 8, `expected >=8 modules in graph, got ${graph.size}`);
  for (const mod of graph) {
    assert.ok(sw.STATIC_ASSETS.includes(`./src/${mod}`),
      `./src/${mod} (statically imported from app.js) missing in STATIC_ASSETS`);
  }
});

test('STATIC_ASSETS includes the 3 modules the review found missing', () => {
  for (const f of ['./src/miequipo.js', './src/plantilla.js', './src/matchdetail-rich.js']) {
    assert.ok(sw.STATIC_ASSETS.includes(f), `${f} missing in STATIC_ASSETS`);
  }
});

test('invariant: data-matchdetail.js lazy (not precached), keys file eager', () => {
  assert.ok(!sw.STATIC_ASSETS.includes('./data-matchdetail.js'),
    'data-matchdetail.js must NOT be precached');
  assert.ok(sw.STATIC_ASSETS.includes('./data-matchdetail-keys.js'),
    'data-matchdetail-keys.js must be precached');
});

// ─── 2. strategy: SWR reachable for data-*.js, cache-first for the rest ───
test('classifyRequest is a pure function exposed by sw.js', () => {
  assert.equal(typeof sw.classifyRequest, 'function',
    'sw.js must define classifyRequest(pathname) for the fetch handler');
});

test('classifyRequest: data-*.js → stale-while-revalidate (reachable branch)', () => {
  assert.equal(sw.classifyRequest('/futbol-base/data-benjamin.js?v=1'.split('?')[0]), 'swr');
  assert.equal(sw.classifyRequest('/futbol-base/data-benjamin.js'), 'swr');
  assert.equal(sw.classifyRequest('/futbol-base/data-matchdetail.js'), 'swr');
  assert.equal(sw.classifyRequest('/data-lineups-2024-2025.js'), 'swr');
});

test('classifyRequest: code/styles/images → cache-first; html → swr', () => {
  assert.equal(sw.classifyRequest('/futbol-base/src/app.js'), 'cache-first');
  assert.equal(sw.classifyRequest('/futbol-base/style.css'), 'cache-first');
  assert.equal(sw.classifyRequest('/futbol-base/icons.svg'), 'cache-first');
  assert.equal(sw.classifyRequest('/futbol-base/index.html'), 'swr');
  assert.equal(sw.classifyRequest('/futbol-base/'), 'swr');
  assert.equal(sw.classifyRequest('/'), 'swr');
});

test('classifyRequest: escudos clause fixed (pathname starts with "/")', () => {
  assert.equal(sw.classifyRequest('/futbol-base/escudos/100x100arucas.png'), 'cache-first');
  assert.equal(sw.classifyRequest('/escudos/100x100arucas.png'), 'cache-first');
});

test('source contract: fetch handler dispatches via classifyRequest, data- before generic js', () => {
  assert.ok(/classifyRequest\(url\.pathname\)/.test(swSrc),
    'fetch handler must call classifyRequest(url.pathname)');
  const body = sw.classifyRequest.toString();
  const dataIdx = body.indexOf('data-');
  const genericIdx = body.search(/\(js\|css/);
  assert.ok(dataIdx >= 0, 'classifyRequest must special-case data- files');
  assert.ok(genericIdx > dataIdx,
    'the data- check must be evaluated BEFORE the generic .js/.css cache-first check');
});

// ─── 3. purge of stale ?v= entries ─────────────────────────────────────────
test('staleKeysFor returns same-pathname entries with a different query', () => {
  assert.equal(typeof sw.staleKeysFor, 'function',
    'sw.js must define staleKeysFor(requestUrl, cachedUrls)');
  const cached = [
    'https://x.test/fb/data-benjamin.js?v=20260610',
    'https://x.test/fb/data-benjamin.js?v=20260611',
    'https://x.test/fb/data-benjamin.js',
    'https://x.test/fb/data-prebenjamin.js?v=20260610',
    'https://x.test/fb/src/app.js?v=20260610',
  ];
  // [...result]: normalize the vm-realm array to the host realm for deepEqual
  const stale = [...sw.staleKeysFor('https://x.test/fb/data-benjamin.js?v=20260611', cached)];
  assert.deepEqual(stale.sort(), [
    'https://x.test/fb/data-benjamin.js',
    'https://x.test/fb/data-benjamin.js?v=20260610',
  ].sort());
});

test('staleKeysFor: unversioned request purges nothing', () => {
  const cached = ['https://x.test/fb/data-benjamin.js?v=20260611'];
  assert.deepEqual([...sw.staleKeysFor('https://x.test/fb/data-benjamin.js', cached)], []);
});

test('source contract: putAndPurge used by BOTH cache-first and SWR branches', () => {
  const defs = swSrc.match(/async function putAndPurge\s*\(/g) || [];
  assert.equal(defs.length, 1, 'sw.js must define putAndPurge once');
  const calls = swSrc.match(/putAndPurge\(e\.request/g) || [];
  assert.ok(calls.length >= 2,
    `putAndPurge must be called in both fetch branches (found ${calls.length} call(s))`);
});

// ─── 4. index.html: standard registration, no unregister-every-load ───────
test('index.html registers SW without unregistering on every load', () => {
  assert.ok(!/unregister\s*\(/.test(idxSrc),
    'index.html must NOT unregister the SW on every load');
  assert.ok(!/getRegistrations/.test(idxSrc),
    'index.html must NOT enumerate registrations to nuke them');
  assert.ok(/navigator\.serviceWorker\.register\(['"]\.\/sw\.js['"]\)/.test(idxSrc),
    'index.html must register ./sw.js');
  assert.ok(/\.update\(\)/.test(idxSrc),
    'index.html must call registration.update() on each load');
});

test('sw.js lifecycle: skipWaiting on install, clients.claim on activate', () => {
  assert.ok(/self\.skipWaiting\(\)/.test(swSrc), 'install must call self.skipWaiting()');
  assert.ok(/clients\.claim\(\)/.test(swSrc), 'activate must call clients.claim()');
  assert.equal(typeof sw.listeners.install, 'function', 'install listener registered');
  assert.equal(typeof sw.listeners.activate, 'function', 'activate listener registered');
  assert.equal(typeof sw.listeners.fetch, 'function', 'fetch listener registered');
});

// ─── 5. C3: CACHE_NAME contract for generate_js.py ────────────────────────
test('C3: CACHE_NAME literal on line 1, bumpable via /futbolbase-v[0-9a-z]+/', () => {
  const firstLine = swSrc.split('\n')[0];
  assert.ok(/^const CACHE_NAME = 'futbolbase-v[0-9a-z]+';\s*$/.test(firstLine),
    `line 1 must be const CACHE_NAME = 'futbolbase-vXXXX'; — got: ${firstLine}`);
  assert.ok(/futbolbase-v[0-9a-z]+/.test(sw.CACHE_NAME),
    'CACHE_NAME value must match futbolbase-v[0-9a-z]+');
});
