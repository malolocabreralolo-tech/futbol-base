// Plan B3, Tarea 11: la pantalla Datos y fuentes (spec §4.7, §4.2 D y §7; decisión 28 de B3).
// render(ctx) es pura: se prueba con ctxFor sobre las fixtures (health.json es el data-health.json
// del 23/09/2026) y `today` inyectado. needs pide data-health también si ya falló, y el «Reintentar»
// del router lo vuelve a pedir: se prueba con startRouter, el navegador falso y un fetch simulado.
import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';
import { ctxFor, datasetsFor, cssRules, PORTAL_SEASON, DEFAULT_TEAM } from './fixtures/rediseno/screens.mjs';
import { fixture } from './fixtures/rediseno/load.mjs';
import { fakeBrowser, memoryStorage } from './fixtures/rediseno/fake-browser.mjs';
import { startContext } from '../../src/app.js';
import { startRouter } from '../../src/router.js';
import { SCREEN_MAP } from '../../src/screens.js';
import { screen, healthRows } from '../../src/screen-fuentes.js';

const text = (h) => String(h).replace(/<[^>]*>/g, ' ').replace(/&quot;/g, '"').replace(/&#39;/g, "'")
  .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim();
// datasets con la fixture de data-health retocada por `edit`, o con otro health (null: falló).
function edited(edit) {
  const datasets = datasetsFor();
  edit(datasets.health);
  return datasets;
}
function withHealth(health) {
  const datasets = datasetsFor();
  datasets.health = health;
  return datasets;
}
const render = (datasets = datasetsFor(), opts = {}) => String(screen.render(ctxFor('fuentes', {}, { datasets, ...opts })));
// Las filas de la comprobación: [etiqueta, estado, mensaje, href o null].
const rowsOf = (out) => [...out.matchAll(/<li>(?:<a class="fu-row" href="([^"]*)" target="_blank" rel="noopener noreferrer">|<div class="fu-row">)<span class="fu-name">([^<]*)<\/span><span class="fu-state(?: is-alert)?">([^<]*)<\/span>(?:<span class="fu-detail">([^<]*)<\/span>)?/g)]
  .map(([, href, label, state, detail]) => [label, state, detail || '', href || null]);

test('estado de los datos: la última comprobación con su hora de Canarias y el último cambio; «hoy» si es hoy', () => {
  const out = render();
  assert.match(out, /^<section data-screen="fuentes"><header class="screen-head"><a class="back" href="#\/explorar" data-action="back" aria-label="Volver">‹<\/a><div class="screen-head-text"><h1>Datos y fuentes<\/h1><p class="screen-sub">Temporada 2025\/26<\/p><\/div><\/header>/);
  assert.equal((out.match(/<h1[ >]/g) || []).length, 1);
  assert.match(out, /<h2 class="block-title">Estado de los datos<\/h2><\/div><div class="box"><dl class="cells cells-2"><div class="cell"><dt class="cell-label">Última comprobación<\/dt><dd class="cell-value">23 de septiembre, 22:11<\/dd><\/div><div class="cell"><dt class="cell-label">Último cambio en los datos<\/dt><dd class="cell-value">23 de septiembre<\/dd><\/div><\/dl><\/div>/);
  assert.match(render(datasetsFor(), { today: '2026-09-23' }), /<dd class="cell-value">hoy, 22:11<\/dd><\/div><div class="cell"><dt class="cell-label">Último cambio en los datos<\/dt><dd class="cell-value">hoy<\/dd>/);
  const blank = render(edited((h) => { delete h.checkedAt; delete h.lastDataChange; }));
  assert.match(blank, /<div class="cell is-muted"><dt class="cell-label">Última comprobación<\/dt><dd class="cell-value">no disponible<\/dd><\/div><div class="cell is-muted"><dt class="cell-label">Último cambio en los datos<\/dt><dd class="cell-value">no disponible<\/dd>/);
});

test('una fila por grupo comprobado: la etiqueta del modelo, el estado en palabras, el mensaje y su fuente; primero lo que pide atención', () => {
  const out = render();
  const rows = rowsOf(out);
  assert.equal(rows.length, 45, 'los 45 grupos de data-health');
  // PG1, la única revisión pendiente, no está en las fixtures: sale con su código.
  assert.deepEqual(rows[0], ['PG1', 'Revisión pendiente', '1 marcadores difieren de la fuente; se conservan los resultados registrados, pendientes de contraste.', 'https://futbolaspalmas.com/1prebenjamin1']);
  // Después, las correctas: en el orden del modelo y, al final, las que el modelo no conoce.
  assert.deepEqual(rows.slice(1, 11).map(([label]) => label), [
    'Benjamín, Segunda Fase A, Grupo 1', 'Benjamín, Segunda Fase A, Grupo 2', 'Benjamín, Segunda Fase B, Grupo 1',
    'Benjamín, Segunda Fase B, Grupo 2', 'Benjamín, Primera Fase, Grupo 5', 'Benjamín, Primera Fase, Grupo 9',
    'Benjamín, Primera Fase, Grupo 13', 'Benjamín, Primera Fase, Grupo 15', 'Prebenjamín, Grupo 2 de Gran Canaria',
    'Prebenjamín, Grupo 3 de Gran Canaria']);
  assert.deepEqual(rows[9], ['Prebenjamín, Grupo 2 de Gran Canaria', 'Correcta', '15 equipos; 182 encuentros disponibles', 'https://futbolaspalmas.com/1prebenjamin2']);
  assert.deepEqual(rows.slice(11, 14).map(([label]) => label), ['A3', 'A4', 'B3']);
  assert.match(out, /<span class="fu-state is-alert">Revisión pendiente<\/span>/);
  assert.match(out, /<span class="vh"> \(abre futbolaspalmas\.com en otra pestaña\)<\/span><\/a><\/li>/);
  assert.match(out, /<h2 class="block-title">Comprobación por grupo<\/h2><p class="block-context">44 correctas y 1 con revisión pendiente<\/p>/);
  assert.match(out, /<\/ul><\/section><p class="notice">Cada grupo abre su página en futbolaspalmas\.com\.<\/p>/);
});

test('estados raros y fuentes que no son web: «Error», «Sin estado» y ninguna fila enlaza a lo que no es http ni https', () => {
  const out = render(edited((h) => {
    Object.assign(h.groups.A1, { status: 'rejected', message: '2 marcadores difieren de la fuente.' });
    Object.assign(h.groups.PG3, { status: 'error', message: 'HTTP 500', url: 'javascript:alert(1)' });
    h.groups.FF5.status = 'raro';
  }));
  const rows = rowsOf(out);
  assert.deepEqual(rows.slice(0, 4), [
    ['Prebenjamín, Grupo 3 de Gran Canaria', 'Error', 'HTTP 500', null],
    ['Benjamín, Segunda Fase A, Grupo 1', 'Revisión pendiente', '2 marcadores difieren de la fuente.', 'https://futbolaspalmas.com/benjamin-segunda-fase-uno/'],
    ['PG1', 'Revisión pendiente', '1 marcadores difieren de la fuente; se conservan los resultados registrados, pendientes de contraste.', 'https://futbolaspalmas.com/1prebenjamin1'],
    ['Benjamín, Primera Fase, Grupo 5', 'Sin estado', '6 equipos; 0 encuentros disponibles', 'https://futbolaspalmas.com/benjamin-primera-fase-cinco/'],
  ]);
  assert.match(out, /<li><div class="fu-row"><span class="fu-name">Prebenjamín, Grupo 3 de Gran Canaria<\/span><span class="fu-state is-alert">Error<\/span>/);
  assert.doesNotMatch(out, /javascript:/);
  assert.match(out, /<p class="block-context">41 correctas, 2 con revisión pendiente, 1 con error y 1 sin estado<\/p>/);
});

test('los grupos de la temporada sin página web comprobada, en una línea con sus etiquetas', () => {
  // PFV2 no tiene entrada en data-health; con la Copa de Campeones, tampoco BCA1, BCB1, BCC1 ni PCC1.
  assert.match(render(), /<p class="notice">1 grupo sin página web comprobada; sus datos vienen de la federación: Prebenjamín, Grupo 2 de Fuerteventura\.<\/p>/);
  assert.match(render(datasetsFor({ champions: true })),
    /<p class="notice">5 grupos sin página web comprobada; sus datos vienen de la federación: Benjamín, Copa de Campeones, Fase A; Benjamín, Copa de Campeones, Fase B; Benjamín, Copa de Campeones, Fase C; Prebenjamín, Grupo 2 de Fuerteventura; Prebenjamín, Copa de Campeones, Eliminatorias\.<\/p>/);
  // Sin la temporada comprobada cargada, las filas llevan su código y no se dice qué falta.
  const bare = healthRows(fixture('health'), null);
  assert.equal(bare.rows.length, 45);
  assert.equal(bare.rows.find((row) => row.id === 'PG2').label, 'PG2');
  assert.deepEqual(bare.unchecked, []);
});

test('la temporada siguiente, con el texto de la portada en D; sin «pendiente», sin caja', () => {
  const out = render();
  assert.match(out, /<h2 class="block-title">Temporada 2026\/27<\/h2><\/div><div class="box"><dl class="cells cells-2"><div class="cell"><dt class="cell-label">Grupos<\/dt><dd class="cell-value">pendientes en esta web<\/dd><\/div><div class="cell"><dt class="cell-label">Última comprobación<\/dt><dd class="cell-value">23 sept, 22:11<\/dd><\/div><\/dl><p class="box-text">La temporada 2026\/27 aparecerá aquí cuando la federación publique los grupos y se activen en esta web\. Si hay más de un equipo de Las Mesas Hu\., te preguntaremos cuál es el tuyo\.<\/p><\/div><\/section><\/section>$/);
  assert.doesNotMatch(render(edited((h) => { h.nextSeason.status = 'activa'; })), /Temporada 2026\/27|aparecerá aquí/);
  assert.doesNotMatch(render(edited((h) => { delete h.nextSeason; })), /aparecerá aquí/);
});

test('sin data-health: el vacío y el «Reintentar» del router, sin inventar nada', () => {
  for (const health of [null, undefined]) {
    const out = render(withHealth(health));
    assert.match(out, /^<section data-screen="fuentes"><header class="screen-head">.*<h1>Datos y fuentes<\/h1><\/div><\/header><div class="block"><div class="empty fu-failed"><p>No se pudo cargar el estado de las fuentes\.<\/p><div class="buttons"><button class="button is-main" type="button" data-action="retry">Reintentar<\/button><\/div><\/div><\/div><\/section>$/, String(health));
  }
});

test('needs pide data-health si no está, también si ya falló; el «Reintentar» del router lo vuelve a pedir y pinta las filas', async (t) => {
  t.mock.method(console, 'warn', () => {});
  const saved = globalThis.fetch;
  const asked = [];
  let fail = true;
  globalThis.fetch = async (url) => {
    asked.push(String(url));
    return fail ? { ok: false, status: 503, text: async () => '' } : { ok: true, status: 200, text: async () => JSON.stringify(fixture('health')) };
  };
  try {
    const datasets = datasetsFor();
    assert.deepEqual(screen.needs({}, datasets), [], 'con data-health, nada que pedir');
    datasets.health = undefined;
    const storage = memoryStorage();
    const getContext = () => startContext({ storage, portal: { season: PORTAL_SEASON, defaultTeam: DEFAULT_TEAM }, datasets, today: '2026-09-24' });
    const b = fakeBrowser('#/fuentes');
    const router = startRouter({ screens: SCREEN_MAP, root: b.root, getContext, window: b.win });
    await router.idle();
    assert.deepEqual(asked, ['./data-health.json'], 'sin pedir todavía: lo pide');
    assert.equal(datasets.health, null);
    assert.match(b.root.innerHTML, /No se pudo cargar el estado de las fuentes\./);
    // «Reintentar» es el del router: vuelve a llamar a needs, que lo vuelve a pedir (ya falló: null).
    fail = false;
    assert.equal(b.click({ 'data-action': 'retry', type: 'button' }, 'button'), true);
    await router.idle();
    assert.deepEqual(asked, ['./data-health.json', './data-health.json']);
    assert.equal(datasets.health.season, '2025-2026');
    assert.equal(rowsOf(b.root.innerHTML).length, 45);
    assert.deepEqual(b.marks(), [['#/explorar', 'true']]);
    assert.equal(b.doc.title, 'Datos y fuentes · Fútbol Base Las Palmas');
    assert.deepEqual(screen.needs({}, datasets), [], 'y ya no lo vuelve a pedir');
  } finally {
    globalThis.fetch = saved;
  }
});

test('registro y CSS: la ruta pinta Fuentes; solo clases que existen y filas de 44 px', () => {
  assert.equal(SCREEN_MAP.fuentes, screen);
  assert.match(readFileSync(new URL('../../sw.js', import.meta.url), 'utf8'), /\n {2}'\.\/src\/screen-fuentes\.js',\n/);
  const rules = cssRules();
  const outs = [render(), render(withHealth(null)), render(edited((h) => { h.groups.PG3.url = ''; h.groups.PG3.status = 'error'; }))];
  const used = new Set(outs.join('').match(/class="[^"]+"/g).flatMap((m) => m.slice(7, -1).split(/\s+/)));
  assert.deepEqual([...used].filter((c) => !rules.classes.has(c)), []);
  assert.match(rules.filter((r) => r.media === null && r.selector === '.fu-row').map((r) => r.body).join(';'), /min-height:\s*44px/);
  assert.equal(text(render()).includes('undefined'), false);
});
