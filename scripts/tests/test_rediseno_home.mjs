// Plan B2, tarea 4: la portada (screen-home.js) y el arranque (startContext de app.js). render(ctx)
// es puro: se prueba en Node con el contexto que construye startContext sobre las fixtures
// congeladas, con `today` inyectado (spec §11). Estas pruebas fijan lo que comparten la portada
// mínima del corte y la completa de las Tareas 7 y 8: el estado, la cabecera de pantalla con su h1,
// el título y el contexto de su primer bloque y los textos de §4.2. El detalle de cada estado va en
// test_rediseno_portada.mjs (Tareas 7 y 8).
import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { fixture } from './fixtures/rediseno/load.mjs';
import { currentAt, nextSeasonRaw, datasetsFrom } from './fixtures/rediseno/simulate.mjs';
import { STORE_KEY, LEGACY_KEY } from '../../src/store.js';
import { startContext } from '../../src/app.js';
import { screen } from '../../src/screen-home.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const DEFAULT_TEAM = { cat: 'prebenjamin', groupId: 'PG2', name: 'Las Mesas Hu.' };
const PORTAL = { season: '2025-2026', defaultTeam: DEFAULT_TEAM };
const PORTAL_2627 = { season: '2026-2027', defaultTeam: DEFAULT_TEAM };

// Un Storage en memoria; `items` es el contenido inicial.
function memoryStorage(items = {}) {
  const map = new Map(Object.entries(items));
  return { map, getItem: (key) => (map.has(key) ? map.get(key) : null), setItem: (key, value) => { map.set(key, String(value)); } };
}
const saved = (myTeam) => memoryStorage({ [STORE_KEY]: JSON.stringify({ myTeam, recent: [] }) });
const LAS_MESAS_2526 = { name: 'Las Mesas Hu.', season: '2025-2026', cat: 'prebenjamin', groupId: 'PG2' };

function page({ raw = fixture('current-2025-2026'), today, portal = PORTAL, storage = memoryStorage() }) {
  const base = startContext({ storage, portal, datasets: datasetsFrom(raw), today });
  const ctx = { ...base, route: { screen: '', params: {} }, params: {} };
  return { ctx, out: String(screen.render(ctx)) };
}
const stateOf = (out) => (out.match(/^<section data-screen="home" data-state="([A-Z])">/) || [])[1];
const text = (out) => out.replace(/<[^>]+>/g, ' ').replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim();
const h1s = (out) => [...out.matchAll(/<h1\b[^>]*>([^<]*)<\/h1>/g)].map((m) => m[1]);
// Título y contexto (si es texto) de cada bloque, en orden.
const blocks = (out) => [...out.matchAll(/<h2 class="block-title">([^<]*)<\/h2>(?:<p class="block-context">([^<]*)<\/p>)?/g)]
  .map((m) => [m[1], m[2] ?? null]);

test('contrato de pantalla: id, needs y render; raíz <section data-screen="home" data-state> con la cabecera y un solo h1', () => {
  assert.equal(screen.id, 'home');
  assert.deepEqual(screen.needs({}, { health: fixture('health') }), []);
  const { out } = page({ today: '2026-09-23' });
  assert.equal(stateOf(out), 'D');
  assert.match(out, /^<section data-screen="home" data-state="D"><header class="screen-head">/);
  assert.deepEqual(h1s(out), ['Las Mesas Hu.']);
  assert.match(out, /<\/section>$/);
});

test('A (01/03/2026): escudo, nombre, grupo y «Cambiar» en la cabecera, y «Próximo partido» con la cuenta atrás', () => {
  const { out } = page({ raw: currentAt('2026-03-01'), today: '2026-03-01' });
  assert.equal(stateOf(out), 'A');
  const head = out.match(/<header class="screen-head">[\s\S]*?<\/header>/)[0];
  assert.match(head, /^<header class="screen-head"><img class="crest crest-46" src="\.\/escudos\/s\/lasMesasEscudo\.png"[^>]*decoding="async">/);
  assert.doesNotMatch(head, /loading="lazy"/, 'el escudo de la primera pantalla no espera');
  assert.match(head, /<h1>Las Mesas Hu\.<\/h1><p class="screen-sub">Prebenjamín, Grupo 2 de Gran Canaria<\/p><\/div><a class="screen-action" href="#\/explorar#buscar">Cambiar<\/a><\/header>$/);
  assert.deepEqual(blocks(out)[0], ['Próximo partido', 'faltan 6 días']);
});

test('B al empezar (01/10/2025): el próximo partido y un único vacío, «Aún no se ha jugado ninguna jornada»', () => {
  const { out } = page({ raw: currentAt('2025-10-01'), today: '2025-10-01' });
  assert.equal(stateOf(out), 'B');
  assert.deepEqual(blocks(out)[0], ['Próximo partido', 'faltan 10 días']);
  assert.equal((out.match(/<p class="empty">/g) || []).length, 1);
  assert.match(out, /<p class="empty">Aún no se ha jugado ninguna jornada<\/p>/);
});

test('B de un equipo que no juega en un grupo que ya juega (CD Batán, M2): nunca «ninguna jornada»', () => {
  const { out } = page({ today: '2026-03-01', storage: saved({ ...LAS_MESAS_2526, name: 'CD Batán' }) });
  assert.equal(stateOf(out), 'B');
  assert.deepEqual(h1s(out), ['CD Batán']);
  assert.doesNotMatch(out, /Aún no se ha jugado ninguna jornada/);
  assert.match(out, /<p class="empty">CD Batán figura como retirado en este grupo<\/p>/);
});

test('C (31/05/2026): «Último partido», que abre la ficha del 2–7', () => {
  const { out } = page({ today: '2026-05-31' });
  assert.equal(stateOf(out), 'C');
  assert.equal(blocks(out)[0][0], 'Último partido');
  assert.match(out, /href="#\/partido\?s=2025-2026&amp;g=PG2&amp;r=Jornada%2030&amp;h=Las%20Mesas%20Hu\.&amp;a=AD%20Hurac%C3%A1n"/);
});

test('D (23/09/2026, datos de hoy): la temporada terminada, con sus bloques y sin próximo ni último partido', () => {
  const { out } = page({ today: '2026-09-23' });
  assert.equal(stateOf(out), 'D');
  assert.ok(blocks(out).length > 0, 'algún bloque');
  assert.doesNotMatch(out, /Próximo partido|Último partido/);
});

test('E (2026/27 con Las Mesas en las dos categorías): la pregunta con cada candidato y «Ninguno»', () => {
  const { ctx, out } = page({
    raw: nextSeasonRaw({ benjamin: ['B2'], prebenjamin: ['PG2'] }), today: '2026-10-01', portal: PORTAL_2627,
    storage: saved(LAS_MESAS_2526),
  });
  assert.equal(ctx.resolution.status, 'ask');
  assert.equal(stateOf(out), 'E');
  assert.deepEqual(h1s(out), ['Las Mesas Hu.']);
  assert.deepEqual(blocks(out).map(([title]) => title), ['¿En qué equipo juega ahora?']);
  assert.match(text(out), /Las Mesas Hu\. Prebenjamín, Grupo 2 de Gran Canaria Las Mesas B Benjamín, Segunda Fase B, Grupo 2 Ninguno: buscar otro equipo/);
  assert.equal((out.match(/<button type="button" class="choice" data-action="elegir" data-index="\d">/g) || []).length, 2);
  assert.doesNotMatch(out, />Cambiar</, 'la pregunta ya ofrece buscar otro equipo');
});

test('X (2026/27 sin Las Mesas): «Las Mesas Hu. no aparece en 2026/27» y «Elegir equipo»', () => {
  const { out } = page({
    raw: nextSeasonRaw({ benjamin: ['A1'], prebenjamin: ['PG3'] }), today: '2026-10-01', portal: PORTAL_2627,
    storage: saved(LAS_MESAS_2526),
  });
  assert.equal(stateOf(out), 'X');
  assert.match(out, /<p class="empty">Las Mesas Hu\. no aparece en 2026\/27<\/p>/);
  assert.match(out, /<a class="button is-main" href="#\/explorar#buscar">Elegir equipo<\/a>/);
});

test('primera visita y almacenamiento roto: la portada del equipo por defecto, sin preguntas (foco 3)', () => {
  const blocked = { getItem() { throw new Error('SecurityError'); }, setItem() { throw new Error('SecurityError'); } };
  const cases = [
    ['vacío', memoryStorage()],
    ['bloqueado', blocked],
    ['que lanza al abrirlo', () => { throw new Error('SecurityError'); }],
  ];
  for (const [name, storage] of cases) {
    const { ctx, out } = page({ today: '2026-09-23', storage });
    assert.deepEqual(ctx.myTeam, { ...DEFAULT_TEAM, season: '2025-2026' }, name);
    assert.equal(ctx.resolution.status, 'ok', name);
    assert.equal(stateOf(out), 'D', name);
  }
  const empty = memoryStorage();
  page({ today: '2026-09-23', storage: empty });
  assert.equal(empty.map.size, 0, 'el equipo por defecto no se guarda solo');
});

test('favoritos v1: la migración y el paso 0, sin preguntas (foco 3)', () => {
  const storage = memoryStorage({ [LEGACY_KEY]: JSON.stringify(fixture('favorites-v1')) });
  const { ctx, out } = page({ today: '2026-09-23', storage });
  assert.deepEqual(ctx.myTeam, LAS_MESAS_2526);
  assert.equal(ctx.resolution.status, 'ok');
  assert.equal(ctx.resolution.group.id, 'PG2');
  assert.equal(stateOf(out), 'D');
  assert.ok(storage.map.has(STORE_KEY), 'la migración escribe v2');
  assert.ok(storage.map.has(LEGACY_KEY), 'y no borra v1');
});

test('render es puro y escapa: mismo ctx, mismo HTML; un nombre con comillas y «<» no rompe nada', () => {
  const { ctx, out } = page({ today: '2026-09-23' });
  assert.equal(String(screen.render(ctx)), out);
  const odd = 'MESAS, U.D. LAS "<B>"';
  const x = page({ raw: nextSeasonRaw({ prebenjamin: ['PG3'] }), today: '2026-10-01', portal: PORTAL_2627,
    storage: saved({ ...LAS_MESAS_2526, name: odd }) }).out;
  assert.equal(stateOf(x), 'X');
  assert.ok(x.includes('<h1>MESAS, U.D. LAS &quot;&lt;B&gt;&quot;</h1>'));
  assert.doesNotMatch(x, /<B>/);
});

test('cada clase que pinta la portada existe en acta.css', () => {
  const css = readFileSync(join(ROOT, 'acta.css'), 'utf8');
  const defined = new Set([...css.replace(/\/\*[\s\S]*?\*\//g, '').matchAll(/\.([a-zA-Z][\w-]*)/g)].map((m) => m[1]));
  const outs = [
    page({ raw: currentAt('2026-03-01'), today: '2026-03-01' }), page({ raw: currentAt('2025-10-01'), today: '2025-10-01' }),
    page({ today: '2026-05-31' }), page({ today: '2026-09-23' }),
    page({ raw: nextSeasonRaw({ benjamin: ['B2'], prebenjamin: ['PG2'] }), today: '2026-10-01', portal: PORTAL_2627, storage: saved(LAS_MESAS_2526) }),
    page({ raw: nextSeasonRaw({ prebenjamin: ['PG3'] }), today: '2026-10-01', portal: PORTAL_2627, storage: saved(LAS_MESAS_2526) }),
  ].map(({ out }) => out);
  assert.deepEqual(outs.map(stateOf), ['A', 'B', 'C', 'D', 'E', 'X']);
  const used = new Set(outs.flatMap((out) => [...out.matchAll(/class="([^"]+)"/g)].flatMap((m) => m[1].split(/\s+/))));
  assert.deepEqual([...used].filter((c) => !defined.has(c)), []);
});
