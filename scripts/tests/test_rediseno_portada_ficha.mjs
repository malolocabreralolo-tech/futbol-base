// Mi equipo con todo lo de la ficha (plan del 04/10/2026; spec §4.2, §4.6, §4.8 y §4.11): la portada
// es la vista de la ficha de mi equipo con la cabecera de la portada, con la evolución de puntos, la
// plantilla, la trayectoria y el calendario completo con su .ics. La plantilla no espera a las actas
// (D4): render pinta un hueco que fillSquad llena tras la carga de la página, sin bloquear needs. Solo
// fixtures y `today` inyectado; el ctx es el común (ctxFor) y la sección, la falsa de fake-browser.mjs.
import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { fixture } from './fixtures/rediseno/load.mjs';
import { currentAt, nextSeasonRaw, goleadores, groupLineups, seasonLineups, archive } from './fixtures/rediseno/simulate.mjs';
import { ctxFor, datasetsFor, cssRules } from './fixtures/rediseno/screens.mjs';
import { fakeSection } from './fixtures/rediseno/fake-browser.mjs';
import { screen } from '../../src/screen-home.js';
import { screen as equipo } from '../../src/screen-equipo.js';
import { fillSquad, squadBlock } from '../../src/team-extras.js';

const s = (h) => String(h);
const titles = (h) => [...s(h).matchAll(/<h2 class="block-title">(.*?)<\/h2>/g)].map((m) => m[1]);
// El bloque <section class="block"> cuyo título es `title`, o null (los bloques no se anidan).
const blockOf = (h, title) => (s(h).match(/<section class="block"[^>]*>[\s\S]*?<\/section>/g) || [])
  .find((b) => b.includes(`<h2 class="block-title">${title}</h2>`)) || null;
const head = (h) => s(h).match(/<header class="screen-head">.*?<\/header>/)[0];
const cols = (h) => s(h).match(/<div class="home-cols has-rest">[\s\S]*<\/div>(?=<\/section>$)/)[0];
const flush = async () => { for (let i = 0; i < 6; i += 1) await new Promise((resolve) => setImmediate(resolve)); };

const LAS_MESAS = { name: 'Las Mesas Hu.', season: '2025-2026', cat: 'prebenjamin', groupId: 'PG2' };
// Guayarmina, en A1: el único grupo de liga de las fixtures con actas. El 01/03/2026, en A con 10
// partidos jugados.
const GUAYARMINA = { name: 'Guayarmina', season: '2025-2026', cat: 'benjamin', groupId: 'A1' };
const MARCH = '2026-03-01';
const KEY = '2025-2026/A1';
const SLOT = '<section class="block" id="plantilla" data-slot="plantilla" aria-busy="true"><div class="block-head"><h2 class="block-title">Plantilla</h2><p class="block-context">según las actas</p></div><p class="team-loading">Cargando la plantilla…</p></section>';

// Los datos de un día con los goleadores congelados y las actas que se pidan; `health`, si se da,
// sustituye al data-health.json de las fixtures.
function datasetsAt(today, { raw = today < '2026-06-07' ? currentAt(today) : fixture('current-2025-2026'), lineups = {}, health } = {}) {
  const datasets = datasetsFor({ current: raw, ...goleadores(), lineups });
  if (health !== undefined) datasets.health = health;
  return datasets;
}
// La portada de `myTeam` y la ficha de un equipo sobre los mismos datos.
const homeCtx = (today, { myTeam = LAS_MESAS, datasets = datasetsAt(today), portalSeason } = {}) =>
  ctxFor('', {}, { today, datasets, myTeam, ...(portalSeason ? { portalSeason } : {}) });
const fichaCtx = (params, today, { myTeam = LAS_MESAS, datasets = datasetsAt(today) } = {}) =>
  ctxFor('equipo', params, { today, datasets, myTeam });
const team = (ctx) => ({ group: ctx.resolution.group, name: ctx.resolution.name });
// Una ventana falsa: navigator.onLine y sus oyentes, que fire() dispara como el navegador.
function fakeWindow({ onLine = true } = {}) {
  const listeners = {};
  const win = {
    navigator: { onLine }, listeners,
    addEventListener: (type, fn) => { (listeners[type] ||= []).push(fn); },
    removeEventListener: (type, fn) => { listeners[type] = (listeners[type] || []).filter((f) => f !== fn); },
    fire: (type) => (listeners[type] || []).slice().forEach((fn) => fn({})),
  };
  return win;
}
// Ya: el `when` de las pruebas que no esperan a la carga de la página.
const now = (run) => { run(); };

// ── 1. La portada es la ficha de mi equipo con otra cabecera ─────────────

test('la portada es la ficha de mi equipo con otra cabecera: sus columnas, idénticas, en A, C y D', () => {
  const ready = { ...fixture('health'), nextSeason: { name: '2026-2027', status: 'ready' } };
  const cases = [['A', MARCH], ['C', '2026-06-03'], ['D', '2026-06-15', ready]];
  for (const [state, today, health] of cases) {
    const datasets = datasetsAt(today, { lineups: { '2025-2026/PG2': {} }, health });
    const home = s(screen.render(homeCtx(today, { datasets })));
    const ficha = s(equipo.render(fichaCtx({ s: '2025-2026', g: 'PG2', t: 'Las Mesas Hu.' }, today, { datasets })));
    assert.match(home, new RegExp(`^<section data-screen="home" data-state="${state}">`), state);
    assert.match(ficha, new RegExp(`^<section data-screen="equipo" data-state="${state}">`), state);
    assert.equal(cols(home), cols(ficha), state);
    // La cabecera es la de la portada: «Cambiar», sin «‹» ni «Hacer mi equipo».
    assert.match(head(home), /<a class="screen-action" href="#\/explorar#buscar">Cambiar<\/a><\/header>$/, state);
    assert.doesNotMatch(head(home), /class="back"|hacer-mi-equipo/, state);
  }
});

// ── 2. La plantilla, sin esperar a las actas ─────────────────────────────

test('la plantilla de la portada no espera: el hueco sin actas o si fallaron, nada con {} y la de la ficha con ellas; en B, nada', () => {
  const at = (lineups) => s(screen.render(homeCtx(MARCH, { myTeam: GUAYARMINA, datasets: datasetsAt(MARCH, { lineups }) })));
  const pending = at({});
  assert.match(pending, /^<section data-screen="home" data-state="A">/);
  assert.equal(blockOf(pending, 'Plantilla'), SLOT);
  // Si fallaron (null), el mismo hueco, que fillSquad vuelve a pedir: nunca la caja de error en render.
  const failed = at({ [KEY]: null });
  assert.equal(blockOf(failed, 'Plantilla'), SLOT);
  assert.doesNotMatch(failed, /role="alert"|data-action="retry"/);
  // Un 404 ({}): el grupo no tiene actas, y no hay plantilla.
  const none = at({ [KEY]: {} });
  assert.equal(blockOf(none, 'Plantilla'), null);
  assert.doesNotMatch(none, /id="plantilla"/);
  // Con las actas ya cargadas, la plantilla en el acto, la misma de la ficha.
  const actas = seasonLineups('2025-2026');
  const loaded = blockOf(at(actas), 'Plantilla');
  assert.match(loaded, /<table class="squad">/);
  const ficha = equipo.render(fichaCtx({ s: '2025-2026', g: 'A1', t: 'Guayarmina' }, MARCH, { myTeam: GUAYARMINA, datasets: datasetsAt(MARCH, { lineups: actas }) }));
  assert.equal(loaded, blockOf(ficha, 'Plantilla'));
  // B (2026/27 simulada): sin partidos no hay actas suyas; ni hueco ni bloque, aunque el grupo tenga actas.
  const b = s(screen.render(homeCtx('2026-10-01', {
    myTeam: { ...GUAYARMINA, season: '2026-2027' }, portalSeason: '2026-2027',
    datasets: datasetsAt('2026-10-01', { raw: nextSeasonRaw({ benjamin: ['A1'] }), lineups: { '2026-2027/A1': groupLineups('2025-2026', 'A1') } }),
  })));
  assert.match(b, /^<section data-screen="home" data-state="B">/);
  assert.doesNotMatch(b, /Plantilla|id="plantilla"/);
});

// ── 3. needs no pide actas ──────────────────────────────────────────────

test('needs de la portada no pide actas: nada con data-health cargado y, sin él, una sola carga, la suya', async (t) => {
  t.mock.method(console, 'warn', () => {});
  assert.deepEqual(screen.needs({}, { health: fixture('health'), lineups: {} }), []);
  const saved = globalThis.fetch;
  const asked = [];
  globalThis.fetch = async (url) => { asked.push(String(url)); return { ok: false, status: 503, text: async () => '' }; };
  try {
    const loads = screen.needs({}, { lineups: {} });
    assert.equal(loads.length, 1);
    await Promise.all(loads);
    assert.ok(asked.length > 0);
    assert.deepEqual(asked.filter((url) => /data-lineups-/.test(url)), []);
  } finally {
    globalThis.fetch = saved;
  }
});

// ── 4 a 9. fillSquad ─────────────────────────────────────────────────────

test('fillSquad espera a `when`: no pide las actas hasta que llega su turno', async () => {
  const ctx = homeCtx(MARCH, { myTeam: GUAYARMINA });
  const page = fakeSection('home', { plantilla: SLOT });
  let calls = 0;
  let turn = null;
  fillSquad(page.section, ctx, team(ctx), {
    load: async () => { calls += 1; return groupLineups('2025-2026', 'A1'); }, win: fakeWindow(), when: (run) => { turn = run; },
  });
  await flush();
  assert.equal(calls, 0);
  assert.equal(page.block('plantilla').markup, SLOT);
  turn();
  await flush();
  assert.equal(calls, 1);
  assert.match(page.block('plantilla').markup, /<table class="squad">/);
});

test('fillSquad con las actas: el bloque de render con ellas, en su sitio, guardadas en datasets y sin mover el foco', async () => {
  const ctx = homeCtx(MARCH, { myTeam: GUAYARMINA });
  const page = fakeSection('home', { plantilla: SLOT });
  const asked = [];
  const data = groupLineups('2025-2026', 'A1');
  fillSquad(page.section, ctx, team(ctx), { load: async (season, group) => { asked.push([season, group]); return data; }, win: fakeWindow(), when: now });
  await flush();
  assert.deepEqual(asked, [['2025-2026', 'A1']]);
  assert.equal(ctx.datasets.lineups[KEY], data);
  assert.equal(page.block('plantilla').markup, s(squadBlock(ctx, team(ctx).group, 'Guayarmina')));
  assert.equal(page.block('plantilla').markup, blockOf(s(screen.render(ctx)), 'Plantilla'));
  assert.equal(page.focus.el, null);
});

test('fillSquad con {} (un 404): el grupo no tiene actas y el hueco se va', async () => {
  const ctx = homeCtx(MARCH, { myTeam: GUAYARMINA });
  const page = fakeSection('home', { plantilla: SLOT });
  fillSquad(page.section, ctx, team(ctx), { load: async () => ({}), win: fakeWindow(), when: now });
  await flush();
  assert.equal(page.block('plantilla'), null);
  assert.deepEqual(ctx.datasets.lineups[KEY], {});
});

test('fillSquad con un fallo y conexión: la caja de error, y su «Reintentar» lo atiende la portada y pinta la tabla en su sitio', async (t) => {
  t.mock.method(console, 'warn', () => {});
  const ctx = homeCtx(MARCH, { myTeam: GUAYARMINA });
  const page = fakeSection('home', { plantilla: SLOT });
  fillSquad(page.section, ctx, team(ctx), { load: async () => null, win: fakeWindow(), when: now });
  await flush();
  const failed = page.block('plantilla').markup;
  assert.match(failed, /^<section class="block" id="plantilla">.*role="alert".*No se pudieron cargar los datos de las actas de 2025\/26\..*data-action="retry"/);
  assert.equal(ctx.datasets.lineups[KEY], null);
  const saved = globalThis.fetch;
  const asked = [];
  let up = false;
  globalThis.fetch = async (url) => {
    asked.push(String(url));
    return up ? { ok: true, status: 200, text: async () => `const LINEUPS_2025_2026_A1=${JSON.stringify(groupLineups('2025-2026', 'A1'))};` }
      : { ok: false, status: 503, text: async () => '' };
  };
  try {
    // La sección falsa no tiene ventana: el mount no vuelve a llenar el hueco (fillSquad, nada).
    assert.equal(screen.mount(page.section, ctx, {}), undefined);
    const first = page.clickIn('plantilla', { 'data-action': 'retry' });
    assert.deepEqual([first.event.prevented, first.event.stopped], [true, true]);
    assert.deepEqual([first.target.disabled, first.target.textContent], [true, 'Cargando…']);
    await flush();
    assert.deepEqual(asked, ['./data-lineups-2025-2026-A1.js']);
    assert.equal(page.block('plantilla').markup, failed, 'otra vez la caja, con su botón');
    up = true;
    page.clickIn('plantilla', { 'data-action': 'retry' });
    await flush();
    const block = page.block('plantilla');
    assert.match(block.markup, /<table class="squad">/);
    assert.equal(block.markup, blockOf(s(screen.render(ctx)), 'Plantilla'));
    assert.equal(page.focus.el, block.title, 'lo pulsó el usuario: el foco, a su título');
    assert.equal(block.title.tabindex, '-1');
  } finally {
    globalThis.fetch = saved;
  }
});

test('fillSquad sin conexión: un vacío tranquilo, sin alerta ni botón, que se rellena solo al volver la conexión', async () => {
  const ctx = homeCtx(MARCH, { myTeam: GUAYARMINA });
  const page = fakeSection('home', { plantilla: SLOT });
  const win = fakeWindow({ onLine: false });
  let calls = 0;
  const load = async () => { calls += 1; return win.navigator.onLine ? groupLineups('2025-2026', 'A1') : null; };
  fillSquad(page.section, ctx, team(ctx), { load, win, when: now });
  await flush();
  const quiet = page.block('plantilla').markup;
  assert.equal(quiet, '<section class="block" id="plantilla"><div class="block-head"><h2 class="block-title">Plantilla</h2></div><p class="empty">Sin conexión. Si hay actas de sus partidos, la plantilla aparecerá al volver la conexión.</p></section>');
  assert.doesNotMatch(quiet, /role="alert"|data-action="retry"/);
  assert.equal(win.listeners.online.length, 1);
  win.navigator.onLine = true;
  win.fire('online');
  await flush();
  assert.equal(calls, 2);
  assert.match(page.block('plantilla').markup, /<table class="squad">/);
  assert.deepEqual(win.listeners.online, [], 'el escuchador se quita al usarse');
});

test('fillSquad tras salir de la portada: guarda las actas pero no pinta, ni en un bloque desconectado; la limpieza quita el escuchador', async () => {
  const ctx = homeCtx(MARCH, { myTeam: GUAYARMINA });
  const data = groupLineups('2025-2026', 'A1');
  // La limpieza (el router la llama antes del pintado siguiente) llega antes que las actas.
  const page = fakeSection('home', { plantilla: SLOT });
  let answer = null;
  const done = fillSquad(page.section, ctx, team(ctx), { load: () => new Promise((resolve) => { answer = resolve; }), win: fakeWindow(), when: now });
  assert.equal(typeof done, 'function');
  done();
  answer(data);
  await flush();
  assert.equal(ctx.datasets.lineups[KEY], data, 'la portada siguiente, o la ficha, la pintan en el acto');
  assert.equal(page.block('plantilla').markup, SLOT);
  // El bloque ya no está en la página (otro pintado lo quitó): no se pinta.
  const other = homeCtx(MARCH, { myTeam: GUAYARMINA });
  const gone = fakeSection('home', { plantilla: SLOT });
  let late = null;
  fillSquad(gone.section, other, team(other), { load: () => new Promise((resolve) => { late = resolve; }), win: fakeWindow(), when: now });
  const block = gone.block('plantilla');
  block.isConnected = false;
  late(data);
  await flush();
  assert.equal(gone.block('plantilla'), block);
  assert.equal(block.markup, SLOT);
  // Sin conexión y ya en otra pantalla: la limpieza quita el escuchador de online, y no se cancela nada más.
  const offline = homeCtx(MARCH, { myTeam: GUAYARMINA });
  const win = fakeWindow({ onLine: false });
  let cancelled = 0;
  const stop = fillSquad(fakeSection('home', { plantilla: SLOT }).section, offline, team(offline), { load: async () => null, win, when: (run) => { run(); return () => { cancelled += 1; }; } });
  await flush();
  assert.equal(win.listeners.online.length, 1);
  stop();
  assert.deepEqual(win.listeners.online, []);
  assert.equal(cancelled, 1);
});

test('fillSquad sin `when`, antes de `load`: espera al evento load y luego al navegador libre (1 s de tope); la limpieza quita el escuchador o cancela la espera', async () => {
  const ctx = homeCtx(MARCH, { myTeam: GUAYARMINA });
  // Una ventana que aún carga, con requestIdleCallback que guarda cada espera en `idle`.
  const loading = (readyState = 'loading') => {
    const win = fakeWindow();
    win.document = { readyState };
    win.idle = [];
    win.cancelled = [];
    win.requestIdleCallback = (fn, options) => { win.idle.push({ fn, options }); return win.idle.length; };
    win.cancelIdleCallback = (id) => { win.cancelled.push(id); };
    return win;
  };
  let calls = 0;
  const load = async () => { calls += 1; return groupLineups('2025-2026', 'A1'); };
  const win = loading();
  const page = fakeSection('home', { plantilla: SLOT });
  fillSquad(page.section, ctx, team(ctx), { load, win });
  assert.deepEqual([calls, win.listeners.load.length, win.idle.length], [0, 1, 0], 'antes de load, nada');
  win.fire('load');
  assert.deepEqual([calls, win.idle.length, win.idle[0].options], [0, 1, { timeout: 1000 }], 'tras load, espera al navegador libre');
  win.idle[0].fn();
  await flush();
  assert.equal(calls, 1);
  assert.match(page.block('plantilla').markup, /<table class="squad">/);
  // La limpieza antes de load: quita el escuchador y nunca pide.
  const early = loading();
  fillSquad(fakeSection('home', { plantilla: SLOT }).section, homeCtx(MARCH, { myTeam: GUAYARMINA }), team(ctx), { load, win: early })();
  assert.deepEqual(early.listeners.load, []);
  // La limpieza con la espera ya puesta (la página ya cargada): la cancela.
  const ready = loading('complete');
  const stop = fillSquad(fakeSection('home', { plantilla: SLOT }).section, homeCtx(MARCH, { myTeam: GUAYARMINA }), team(ctx), { load, win: ready });
  assert.equal(ready.idle.length, 1);
  stop();
  assert.deepEqual(ready.cancelled, [1]);
  assert.equal(calls, 1);
});

test('fillSquad sin requestIdleCallback (Safari): setTimeout tras load, que la limpieza cancela', async () => {
  const ctx = homeCtx(MARCH, { myTeam: GUAYARMINA });
  let calls = 0;
  const load = async () => { calls += 1; return groupLineups('2025-2026', 'A1'); };
  const win = fakeWindow();
  win.document = { readyState: 'complete' };
  const page = fakeSection('home', { plantilla: SLOT });
  fillSquad(page.section, ctx, team(ctx), { load, win });
  assert.equal(calls, 0, 'en el turno siguiente, no en este');
  await new Promise((resolve) => setTimeout(resolve, 5));
  await flush();
  assert.equal(calls, 1);
  assert.match(page.block('plantilla').markup, /<table class="squad">/);
  const stop = fillSquad(fakeSection('home', { plantilla: SLOT }).section, homeCtx(MARCH, { myTeam: GUAYARMINA }), team(ctx), { load, win });
  stop();
  await new Promise((resolve) => setTimeout(resolve, 5));
  assert.equal(calls, 1, 'cancelado');
});

test('fillSquad con el hueco ya por encima de la ventana: lo que se mira no se mueve (spec §7, nota del punto 13)', async () => {
  // Móvil: la columna de la consulta (el hueco, de 45 px, y la trayectoria) y debajo el calendario.
  // `grow`: lo que crece el bloque al llenarse (negativo: se quita); `moves`: lo que baja con él
  // (en escritorio el calendario va en la otra columna); `anchored`: el navegador ya lo compensó.
  async function page({ slotTop, grow, moves = ['traj', 'rest'], anchored = false, data = groupLineups('2025-2026', 'A1') }) {
    const scrolls = [];
    const win = fakeWindow();
    win.scrollBy = (x, y) => { scrolls.push(y); };
    const rect = (top, height) => {
      const el = { top, isConnected: true, hasAttribute: () => false, getBoundingClientRect: () => ({ top: el.top, bottom: el.top + height }) };
      return el;
    };
    const screenEl = { hasAttribute: (n) => n === 'data-screen' };
    const rest = rect(slotTop + 45 + 60, 1800);
    const side = { hasAttribute: () => false, parentElement: screenEl, nextElementSibling: rest };
    const traj = rect(slotTop + 45, 60);
    let current = null;
    const slot = {
      ...rect(slotTop, 45), parentElement: side, nextElementSibling: traj,
      set outerHTML(_value) {
        slot.isConnected = false;
        current = null;
        if (anchored) return;
        if (moves.includes('traj')) traj.top += grow;
        if (moves.includes('rest')) rest.top += grow;
      },
    };
    slot.getBoundingClientRect = () => ({ top: slotTop, bottom: slotTop + 45 });
    current = slot;
    const section = { querySelector: (sel) => (sel === '#plantilla' ? current : null) };
    const ctx = homeCtx(MARCH, { myTeam: GUAYARMINA });
    fillSquad(section, ctx, team(ctx), { load: async () => data, win, when: now });
    await flush();
    assert.equal(slot.isConnected, false, 'el hueco se pintó');
    return scrolls;
  }
  assert.deepEqual(await page({ slotTop: -400, grow: 521 }), [521], 'llega la tabla: la página baja lo que crece');
  assert.deepEqual(await page({ slotTop: -400, grow: -64, data: {} }), [-64], 'sin actas se quita: sube lo que mide');
  assert.deepEqual(await page({ slotTop: -1000, grow: 521 }), [521], 'con la trayectoria también arriba, el calendario');
  assert.deepEqual(await page({ slotTop: -1000, grow: 521, moves: ['traj'] }), [], 'en escritorio el calendario no se mueve');
  assert.deepEqual(await page({ slotTop: 120, grow: 521 }), [], 'el hueco, a la vista: se ve llenarse');
  assert.deepEqual(await page({ slotTop: -400, grow: 521, anchored: true }), [], 'el navegador ya lo compensó');
});

// ── 11. mount: jugador y trayectoria ─────────────────────────────────────

const ARCHIVE = [{ name: '2025-2026', current: true }, { name: '2024-2025', current: false }, { name: '2023-2024', current: false }];

test('mount de la portada: un jugador despliega sus partidos y «Ver la trayectoria» carga su panel, con su propio «Reintentar», que deja el foco en el título del bloque', async () => {
  // El jugador: la fila de sus partidos, debajo de la suya, al desplegarlo; al plegarlo, se quita.
  const ctx = homeCtx(MARCH, { myTeam: GUAYARMINA, datasets: datasetsAt(MARCH, { lineups: seasonLineups('2025-2026') }) });
  const listeners = [];
  const section = { matches: (sel) => sel === '[data-screen="home"]', addEventListener: (type, fn) => { if (type === 'click') listeners.push(fn); }, contains: () => true, querySelector: () => null };
  assert.equal(screen.mount(section, ctx, {}), undefined, 'con las actas ya cargadas no hay hueco que llenar');
  let removed = 0;
  const row = { children: { length: 5 }, inserted: null, insertAdjacentHTML: (where, markup) => { row.inserted = [where, markup]; }, nextElementSibling: { remove: () => { removed += 1; } } };
  const attrs = { 'data-action': 'jugador', 'data-index': '0', 'aria-expanded': 'false' };
  const player = {
    getAttribute: (n) => attrs[n] ?? null, setAttribute: (n, v) => { attrs[n] = v; }, removeAttribute: (n) => { delete attrs[n]; },
    closest: (sel) => (sel === '[data-action]' ? player : sel === 'tr' ? row : null),
  };
  listeners.forEach((fn) => fn({ target: player }));
  assert.equal(row.inserted[0], 'afterend');
  assert.match(row.inserted[1], /^<tr class="squad-detail" id="jugador-0"><td colspan="5"><ul class="squad-matches"><li><a class="squad-match" href="#\/partido\?s=2025-2026&amp;g=A1&amp;/);
  assert.deepEqual([attrs['aria-expanded'], attrs['aria-controls']], ['true', 'jugador-0']);
  listeners.forEach((fn) => fn({ target: player }));
  assert.deepEqual([removed, attrs['aria-expanded'], attrs['aria-controls']], [1, 'false', undefined]);

  // La trayectoria: todo el archivo, bajo demanda; si una temporada no llega, su panel lo dice y su
  // «Reintentar» es suyo (el router no se entera).
  const saved = { fetch: globalThis.fetch, error: console.error };
  const served = new Set(['2024-2025']);
  globalThis.fetch = async (url) => {
    const name = (String(url).match(/data-season-(\d{4}-\d{4})\.js/) || [])[1];
    return served.has(name)
      ? { ok: true, status: 200, text: async () => `const SEASON_${name.replace('-', '_')}=${JSON.stringify(archive(name))};` }
      : { ok: false, status: 503, text: async () => '' };
  };
  console.error = () => {};
  try {
    const archived = ctxFor('', {}, { today: '2026-09-23', datasets: datasetsFor({ seasons: ARCHIVE, lineups: { '2025-2026/PG2': {} } }) });
    // El documento del panel, con el foco, y el título de su bloque (Trayectoria).
    const doc = { activeElement: null };
    const title = {
      tabindex: null, options: null,
      hasAttribute: (n) => n === 'tabindex' && title.tabindex !== null,
      setAttribute: (n, v) => { if (n === 'tabindex') title.tabindex = String(v); },
      focus: (options) => { title.options = options; doc.activeElement = title; },
    };
    const panel = {
      innerHTML: '', hidden: true, isConnected: true, setAttribute() {}, removeAttribute() {}, hasChildNodes: () => panel.innerHTML !== '',
      ownerDocument: doc, contains: (el) => Boolean(el && el.inPanel),
      closest: (sel) => (sel === '.block' ? { querySelector: (q) => (q === '.block-title' ? title : null) } : null),
    };
    const heard = [];
    const page = {
      matches: (sel) => sel === '[data-screen="home"]', addEventListener: (type, fn) => { if (type === 'click') heard.push(fn); }, contains: () => true,
      querySelector: (sel) => (sel === '#trayectoria' ? panel : null),
    };
    screen.mount(page, archived, {});
    const toggle = { 'data-action': 'trayectoria', 'aria-expanded': 'false' };
    const button = { textContent: 'Ver la trayectoria', getAttribute: (n) => toggle[n], setAttribute: (n, v) => { toggle[n] = v; }, closest: (sel) => (sel === '[data-action]' ? button : null) };
    doc.activeElement = button;
    heard.forEach((fn) => fn({ target: button }));
    assert.deepEqual([toggle['aria-expanded'], button.textContent, panel.hidden], ['true', 'Ocultar la trayectoria', false]);
    await flush();
    assert.match(panel.innerHTML, /No se pudieron cargar los datos de la trayectoria\./, '2023-24 no llega');
    assert.deepEqual([doc.activeElement, title.options], [button, null], 'el foco, fuera del panel: se queda en su botón');
    served.add('2023-2024');
    const retry = { inPanel: true, getAttribute: (n) => ({ 'data-action': 'retry' })[n], closest: (sel) => (sel === '[data-action]' ? retry : sel === '#trayectoria' ? panel : null) };
    const event = { target: retry, prevented: 0, stopped: 0, preventDefault() { event.prevented += 1; }, stopPropagation() { event.stopped += 1; } };
    // Con el teclado, el foco está en su «Reintentar», que sale del DOM: pasa al título del bloque.
    doc.activeElement = retry;
    heard.forEach((fn) => fn(event));
    assert.deepEqual([event.prevented, event.stopped], [1, 1]);
    assert.deepEqual([doc.activeElement, title.tabindex, title.options], [title, '-1', { preventScroll: true }]);
    await flush();
    assert.equal((panel.innerHTML.match(/<a class="traj-row"/g) || []).length, 10);
    assert.equal(doc.activeElement, title, 'y ahí sigue con la trayectoria pintada');
  } finally {
    globalThis.fetch = saved.fetch;
    console.error = saved.error;
  }
});

// ── 12. Estilos ─────────────────────────────────────────────────────────

test('cada clase de la portada existe en acta.css: con el hueco, con la tabla, sin conexión y con la caja de error', async () => {
  const rules = cssRules();
  const at = (lineups) => s(screen.render(homeCtx(MARCH, { myTeam: GUAYARMINA, datasets: datasetsAt(MARCH, { lineups }) })));
  const painted = async (load, win) => {
    const ctx = homeCtx(MARCH, { myTeam: GUAYARMINA });
    const page = fakeSection('home', { plantilla: SLOT });
    fillSquad(page.section, ctx, team(ctx), { load, win, when: now });
    await flush();
    return page.block('plantilla').markup;
  };
  const out = [
    at({}), at(seasonLineups('2025-2026')),
    await painted(async () => null, fakeWindow({ onLine: false })), await painted(async () => null, fakeWindow()),
  ].join('');
  assert.match(out, /data-slot="plantilla"[\s\S]*<table class="squad">[\s\S]*Sin conexión[\s\S]*role="alert"/);
  // error-box es el gancho de la caja de error de shell.js, sin regla propia (como en test_rediseno_shell).
  const missing = [...new Set([...out.matchAll(/class="([^"]+)"/g)].flatMap((m) => m[1].split(/\s+/)))]
    .filter((c) => !rules.classes.has(c) && c !== 'error-box');
  assert.deepEqual(missing, []);
});

// ── 10. mount de punta a punta (al final: ensureLineups memoriza los éxitos por proceso) ─────────

test('mount de punta a punta: devuelve su limpieza y, con la página cargada y el navegador libre, llena el hueco con ensureLineups', async (t) => {
  t.mock.method(console, 'warn', () => {});
  const saved = globalThis.fetch;
  const asked = [];
  globalThis.fetch = async (url) => {
    asked.push(String(url));
    // Solo A1 tiene actas en las fixtures (y FF1): el fichero de PG2 no existe.
    return /data-lineups-2025-2026-A1\.js/.test(String(url))
      ? { ok: true, status: 200, text: async () => `const LINEUPS_2025_2026_A1=${JSON.stringify(groupLineups('2025-2026', 'A1'))};` }
      : { ok: false, status: 404, text: async () => '' };
  };
  // La ventana de la sección (ownerDocument.defaultView): la página ya cargada y el navegador libre en
  // el turno siguiente.
  const view = () => {
    const win = fakeWindow();
    win.document = { readyState: 'complete' };
    win.idle = [];
    win.requestIdleCallback = (fn, options) => { win.idle.push(options); return setImmediate(fn); };
    win.cancelIdleCallback = (id) => clearImmediate(id);
    return win;
  };
  try {
    // Guayarmina (A1): la plantilla.
    const ctx = homeCtx(MARCH, { myTeam: GUAYARMINA });
    const win = view();
    const page = fakeSection('home', { plantilla: SLOT }, { view: win });
    const done = screen.mount(page.section, ctx, {});
    assert.equal(typeof done, 'function');
    assert.deepEqual(win.idle, [{ timeout: 1000 }]);
    await flush();
    const block = page.block('plantilla');
    assert.match(block.markup, /<table class="squad">/);
    assert.equal(block.markup, blockOf(s(screen.render(ctx)), 'Plantilla'));
    assert.equal(page.focus.el, null);
    done();
    // Las Mesas (PG2), sin fichero de actas: un 404, y el hueco se va.
    const mesas = homeCtx(MARCH);
    const empty = fakeSection('home', { plantilla: SLOT }, { view: view() });
    const stop = screen.mount(empty.section, mesas, {});
    await flush();
    assert.ok(asked.includes('./data-lineups-2025-2026-PG2.js'));
    assert.equal(empty.block('plantilla'), null);
    assert.deepEqual(mesas.datasets.lineups['2025-2026/PG2'], {});
    stop();
    // La portada siguiente ya tiene las de A1: la plantilla en el pintado y nada que llenar.
    const again = homeCtx(MARCH, { myTeam: GUAYARMINA, datasets: ctx.datasets });
    assert.match(blockOf(s(screen.render(again)), 'Plantilla'), /<table class="squad">/);
    assert.equal(screen.mount(fakeSection('home', {}, { view: view() }).section, again, {}), undefined);
  } finally {
    globalThis.fetch = saved;
  }
});
