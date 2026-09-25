// Plan B2, tarea 6: el router (spec §4.1, §5.1, §7 y §8). Funciones puras sobre las fixtures
// congeladas y startRouter con un window y un document falsos: token de navegación con promesas
// controladas, enlaces antiguos, historial, «‹», desplazamiento, foco y Reintentar.
import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { fixture } from './fixtures/rediseno/load.mjs';
import { fakeBrowser } from './fixtures/rediseno/fake-browser.mjs';
import { buildSeason, buildCups, findGroup, findRound, findMatch, seasonLabel } from '../../src/model.js';
import { buildClubIndex } from '../../src/myteam.js';
import { teamNames } from './fixtures/rediseno/simulate.mjs';
import { html } from '../../src/html.js';
import { SCREENS, parseRoute, routeHref } from '../../src/links.js';
import { routeTitle } from '../../src/shell.js';
import { resolveParams, historyMode, parentOf, activeTab, routeIsMine, startRouter } from '../../src/router.js';
import { screen as pendiente } from '../../src/screen-pendiente.js';
import { SCREEN_MAP } from '../../src/screens.js';

const PORTAL = '2025-2026';
const raw = fixture('current-2025-2026');
const current = buildSeason({ name: raw.season, current: true, ...raw });
const pastRaw = fixture('historical-2024-2025');
const past = buildSeason({ name: pastRaw.season, current: false, benjamin: pastRaw.benjamin, prebenjamin: pastRaw.prebenjamin });
const cups = buildCups({ season: '2025-2026', ...fixture('cups-2025-2026') });
const SEASONS = [{ name: '2025-2026', current: true }, { name: '2024-2025', current: false }];
const group = (id) => current.groups.find((g) => g.id === id);
const MY_TEAM = { name: 'Las Mesas Hu.', season: PORTAL, cat: 'prebenjamin', groupId: 'PG2' };
const OK = { status: 'ok', group: group('PG2'), name: 'Las Mesas Hu.', cat: 'prebenjamin' };
const ASK = { status: 'ask', candidates: [{ group: group('PG2'), name: 'Las Mesas Hu.', cat: 'prebenjamin' }] };
// PG2, jornada 30: Las Mesas Hu. 2–7 AD Huracán y Acodetti 12–1 Santa Brígida.
const J30 = '#/partido?g=PG2&r=Jornada%2030&h=Las%20Mesas%20Hu.&a=AD%20Hurac%C3%A1n';
const OTHER = '#/partido?g=PG2&r=Jornada%2030&h=Acodetti&a=Santa%20Br%C3%ADgida';

// Índice de clubes con un nombre más de Las Mesas Hu. (sin punto), del mismo club.
const INDEX = buildClubIndex([...teamNames(current, cups), 'Las Mesas Hu'], fixture('shields'));
// Modelo con el contrato de createModel: la temporada pasada solo existe cuando está en `loaded`,
// que se lee en cada llamada (una carga de needs lo amplía).
function model(loaded = []) {
  const seasons = () => ({ [PORTAL]: current, ...(loaded.includes('2024-2025') ? { '2024-2025': past } : {}) });
  return {
    season: (name) => seasons()[name] || null,
    group: (season, id) => seasons()[season]?.groups.find((g) => g.id === id) || null,
    cups: () => cups,
    clubIndex: () => INDEX,
  };
}
function context({ resolution = OK, loaded = [] } = {}) {
  return () => ({
    portal: { season: PORTAL, defaultTeam: { cat: 'prebenjamin', groupId: 'PG2', name: 'Las Mesas Hu.' } },
    model: model(loaded), resolution, myTeam: MY_TEAM, today: '2026-09-23', health: null,
    datasets: { seasons: SEASONS, seasonRaw: {} },
  });
}
const resolve = (hash, options) => resolveParams(parseRoute(hash), context(options)());
// Una redirección como [href, aviso]; así se lee igual que en la barra de direcciones.
const target = (res) => (res.redirect ? [routeHref(res.redirect.screen, res.redirect.params), res.redirect.notice] : res);

// ── resolveParams: cada fila de §4.1 ─────────────────────────────────────

test('Mi equipo, Temporadas, Fuentes y Ajustes no llevan parámetros', () => {
  for (const hash of ['#/', '#/?g=PG2', '#/temporadas', '#/fuentes?x=1', '#/ajustes']) assert.deepEqual(resolve(hash), { params: {} }, hash);
});

test('Jornada y Tabla: s es la temporada del portal y g, el grupo resuelto de mi equipo', () => {
  assert.deepEqual(resolve('#/jornada'), { params: { s: PORTAL, g: 'PG2' } });
  assert.deepEqual(resolve('#/tabla?v=forma'), { params: { v: 'forma', s: PORTAL, g: 'PG2' } });
  assert.deepEqual(resolve('#/jornada?g=PG3&r=Jornada%203'), { params: { g: 'PG3', r: 'Jornada 3', s: PORTAL } });
  assert.deepEqual(resolve('#/tabla?s=2025-2026&g=A2'), { params: { s: PORTAL, g: 'A2' } });
});

test('una vista de Tabla o una jornada que no existen se quitan (replaceState, sin aviso); la jornada vale por su número', () => {
  assert.deepEqual(target(resolve('#/tabla?g=PG2&v=rara')), ['#/tabla?g=PG2', null]);
  assert.deepEqual(target(resolve('#/jornada?r=Jornada%2099')), ['#/jornada', null]);
  assert.deepEqual(target(resolve('#/jornada?g=A2&r=Jornada%2030')), ['#/jornada?g=A2', null], 'A2 tiene 22 jornadas');
  // Un enlace escrito a mano con el número: la pantalla lo lee (findRound), y el router no lo quita.
  assert.deepEqual(resolve('#/jornada?g=PG2&r=30'), { params: { g: 'PG2', r: '30', s: PORTAL } });
});

test('findRound y findMatch: la ronda por clave o número; el partido en su ronda o, si no, el único h–a del grupo', () => {
  const pg2 = group('PG2');
  assert.equal(findRound(pg2, 'Jornada 30').key, 'Jornada 30');
  assert.equal(findRound(pg2, '30').key, 'Jornada 30');
  assert.equal(findRound(pg2, 'J30').key, 'Jornada 30');
  assert.equal(findRound(pg2, 'Jornada 99'), null);
  assert.equal(findRound(pg2, ''), null);
  const mesas = { h: 'Las Mesas Hu.', a: 'AD Huracán' };
  assert.equal(findMatch(pg2, { r: 'Jornada 30', ...mesas }).dateISO, '2026-06-02');
  assert.equal(findMatch(pg2, { r: '30', ...mesas }).dateISO, '2026-06-02');
  assert.equal(findMatch(pg2, { r: 'Jornada 3', ...mesas }).dateISO, '2026-06-02', 'otra jornada: el único Las Mesas–Huracán');
  assert.equal(findMatch(pg2, mesas).dateISO, '2026-06-02');
  assert.equal(findMatch(pg2, { r: 'Jornada 30', h: 'AD Huracán', a: 'Las Mesas Hu.' }).dateISO, '2026-02-12', 'el de la ida, J15');
  assert.equal(findMatch(pg2, { r: 'Jornada 30', h: 'x', a: 'y' }), null);
});

test('findGroup: el grupo de la temporada, el de los torneos, y null sin grupo o sin temporada cargada (ronda de arreglos 1, findGroup única)', () => {
  assert.equal(findGroup(model(), PORTAL, 'PG2'), group('PG2'));
  assert.equal(findGroup(model(), PORTAL, 'MCPK1'), cups.groups.find((g) => g.id === 'MCPK1'), 'de los torneos, si no está en la temporada');
  assert.equal(findGroup(model(), PORTAL, 'ZZ9'), null);
  assert.equal(findGroup(model(), '2024-2025', 'PGC2'), null, 'temporada pasada sin cargar');
  assert.equal(findGroup(model(['2024-2025']), '2024-2025', 'PGC2'), past.groups.find((g) => g.id === 'PGC2'), 'cargada, la encuentra');
});

test('temporada pasada: sin cargar queda pendiente; cargada, el primer grupo de liga de mi categoría con su nombre', () => {
  assert.deepEqual(resolve('#/tabla?s=2024-2025'), { params: { s: '2024-2025' }, pending: true });
  assert.deepEqual(resolve('#/tabla?s=2024-2025', { loaded: ['2024-2025'] }), { params: { s: '2024-2025', g: 'PGC2' } });
  // En benjamín de 2024-25 (P1) Las Mesas Hu. no jugó: a Ligas de esa temporada y categoría.
  const benjamin = { status: 'ok', group: group('A2'), name: 'Las Mesas Hu.', cat: 'benjamin' };
  assert.deepEqual(target(resolve('#/jornada?s=2024-2025', { loaded: ['2024-2025'], resolution: benjamin })),
    ['#/ligas?s=2024-2025&c=benjamin&to=jornada', 'Las Mesas Hu. no aparece en la temporada 2024/25']);
});

test('con E o X, Jornada y Tabla abren #/ligas de la temporada actual con «Elige tu equipo en Mi equipo»', () => {
  for (const resolution of [ASK, { status: 'absent' }]) {
    assert.deepEqual(target(resolve('#/jornada', { resolution })), ['#/ligas?to=jornada', 'Elige tu equipo en Mi equipo']);
    assert.deepEqual(target(resolve('#/tabla?v=goles', { resolution })), ['#/ligas?to=tabla', 'Elige tu equipo en Mi equipo']);
    // Con el grupo en el enlace, la pantalla se abre igual.
    assert.deepEqual(resolve('#/tabla?g=PG3', { resolution }), { params: { g: 'PG3', s: PORTAL } });
  }
});

test('un grupo que no es de liga lleva a #/copa (liguilla y cuadro de la Maspalomas Cup)', () => {
  assert.equal(cups.groups.find((g) => g.id === 'MCP3').kind, 'cup-league');
  assert.equal(cups.groups.find((g) => g.id === 'MCPK1').kind, 'cup-bracket');
  assert.deepEqual(target(resolve('#/tabla?g=MCP3')), ['#/copa?g=MCP3', null]);
  assert.deepEqual(target(resolve('#/jornada?g=MCPK1&r=Final')), ['#/copa?g=MCPK1', null]);
});

test('grupo que no existe: a #/ligas con aviso; temporada desconocida: se quita, con aviso', () => {
  assert.deepEqual(target(resolve('#/tabla?g=LZS1')), ['#/ligas?c=prebenjamin&to=tabla', 'No encontramos el grupo LZS1 en la temporada 2025/26']);
  assert.deepEqual(target(resolve('#/tabla?s=2024-2025&g=PG2', { loaded: ['2024-2025'] })),
    ['#/ligas?s=2024-2025&c=prebenjamin&to=tabla', 'No encontramos el grupo PG2 en la temporada 2024/25']);
  assert.deepEqual(target(resolve('#/tabla?s=1999-2000&g=PG2')), ['#/tabla?g=PG2', 'No existe la temporada 1999/00; te enseñamos la actual']);
});

test('Explorar, Ligas, Copa, Goleadores y Récords: la temporada por defecto y sus parámetros', () => {
  assert.deepEqual(resolve('#/explorar?q=Mesas'), { params: { q: 'Mesas', s: PORTAL } });
  assert.deepEqual(resolve('#/ligas?c=benjamin&i=grancanaria&f=segunda-fase-a&to=tabla'),
    { params: { c: 'benjamin', i: 'grancanaria', f: 'segunda-fase-a', to: 'tabla', s: PORTAL } });
  assert.deepEqual(resolve('#/copa?g=MCPK1'), { params: { g: 'MCPK1', s: PORTAL } });
  assert.deepEqual(resolve('#/goleadores?s=2024-2025&c=prebenjamin'), { params: { s: '2024-2025', c: 'prebenjamin' } });
  assert.deepEqual(resolve('#/records?c=benjamin'), { params: { c: 'benjamin', s: PORTAL } });
});

test('Partido: vale si findMatch lo encuentra (su ronda, o el único h–a del grupo); si no, a su jornada con aviso', () => {
  assert.deepEqual(resolve(J30), { params: { g: 'PG2', r: 'Jornada 30', h: 'Las Mesas Hu.', a: 'AD Huracán', s: PORTAL } });
  // Por su número, o con otra jornada pero un único Huracán–Las Mesas en el grupo (J15): la pantalla lo lee.
  assert.deepEqual(resolve('#/partido?g=PG2&r=30&h=Las%20Mesas%20Hu.&a=AD%20Hurac%C3%A1n'), { params: { g: 'PG2', r: '30', h: 'Las Mesas Hu.', a: 'AD Huracán', s: PORTAL } });
  assert.deepEqual(resolve('#/partido?g=PG2&r=Jornada%2030&h=AD%20Hurac%C3%A1n&a=Las%20Mesas%20Hu.'),
    { params: { g: 'PG2', r: 'Jornada 30', h: 'AD Huracán', a: 'Las Mesas Hu.', s: PORTAL } });
  // CD Batán se retiró: sus partidos no están en el calendario.
  assert.deepEqual(target(resolve('#/partido?g=PG2&r=Jornada%2030&h=Telde&a=CD%20Bat%C3%A1n')),
    ['#/jornada?g=PG2&r=Jornada%2030', 'No encontramos ese partido']);
  assert.deepEqual(target(resolve('#/partido?g=PG2&r=Jornada%2099&h=x&a=y')), ['#/jornada?g=PG2', 'No encontramos ese partido']);
  assert.deepEqual(target(resolve('#/partido?h=x&a=y')), ['#/jornada', 'No encontramos ese partido']);
  assert.deepEqual(resolve('#/partido?s=2024-2025&g=PGC2&r=Jornada%201&h=x&a=y'),
    { params: { s: '2024-2025', g: 'PGC2', r: 'Jornada 1', h: 'x', a: 'y' }, pending: true });
});

test('Equipo: g es obligatorio; sin él, el equipo se busca en Explorar', () => {
  assert.deepEqual(resolve('#/equipo?g=PG2&t=Las%20Mesas%20Hu.'), { params: { g: 'PG2', t: 'Las Mesas Hu.', s: PORTAL } });
  assert.deepEqual(target(resolve('#/equipo?t=Las%20Mesas%20Hu.')), ['#/explorar?q=Las%20Mesas%20Hu.', null]);
  assert.deepEqual(target(resolve('#/equipo?g=ZZ9&t=X')), ['#/explorar?q=X', 'No encontramos el grupo ZZ9 en la temporada 2025/26']);
});

// ── historyMode, parentOf, activeTab y routeIsMine ───────────────────────

test('historyMode: cambiar de pantalla es push; jornada, vista de Tabla o búsqueda, replace', () => {
  const R = parseRoute;
  assert.equal(historyMode(null, R('#/tabla')), 'push');
  assert.equal(historyMode(R('#/'), R('#/jornada')), 'push');
  assert.equal(historyMode(R('#/jornada?g=PG2&r=Jornada%201'), R('#/jornada?g=PG2&r=Jornada%202')), 'replace');
  assert.equal(historyMode(R('#/jornada?g=PG2'), R('#/jornada?g=PG2&r=Jornada%202')), 'replace');
  assert.equal(historyMode(R('#/jornada?g=PG2&r=Jornada%201'), R('#/jornada?g=PG3&r=Jornada%201')), 'push');
  assert.equal(historyMode(R('#/tabla?g=PG2&v=puntos'), R('#/tabla?g=PG2&v=forma')), 'replace');
  assert.equal(historyMode(R('#/tabla?g=PG2'), R('#/tabla?s=2024-2025&g=PG2')), 'push');
  assert.equal(historyMode(R('#/explorar?q=Mes'), R('#/explorar?q=Mesas')), 'replace');
  assert.equal(historyMode(R('#/goleadores?g=PG2&q=a'), R('#/goleadores?g=PG2&q=ab')), 'replace');
  assert.equal(historyMode(R(J30), R(OTHER)), 'push');
  assert.equal(historyMode(R('#/tabla?g=PG2'), R('#/tabla?g=PG2')), 'replace', 'la misma ruta no crea otra entrada');
});

test('parentOf: Partido → su jornada; lo que cuelga de Explorar → Explorar; los destinos principales, nada', () => {
  assert.deepEqual(parentOf(parseRoute(J30)), { screen: 'jornada', params: { g: 'PG2', r: 'Jornada 30' } });
  assert.deepEqual(parentOf({ screen: 'partido', params: { s: '2024-2025', g: 'PGC2', r: 'Jornada 3', h: 'x', a: 'y' } }),
    { screen: 'jornada', params: { s: '2024-2025', g: 'PGC2', r: 'Jornada 3' } });
  for (const screen of ['equipo', 'copa', 'goleadores', 'ligas', 'temporadas', 'records', 'fuentes', 'ajustes']) {
    assert.deepEqual(parentOf({ screen, params: { g: 'PG2' } }), { screen: 'explorar', params: {} }, screen);
  }
  for (const screen of ['', 'jornada', 'tabla', 'explorar']) assert.equal(parentOf({ screen, params: {} }), null, screen);
});

test('activeTab: el destino marcado de cada fila de §4.1, "page" en los principales y "true" en las demás', () => {
  const tab = (hash, last = null, mine = false) => activeTab(parseRoute(hash), last, mine);
  assert.deepEqual(tab('#/'), { active: 'miequipo', current: 'page' });
  assert.deepEqual(tab('#/jornada?g=PG3'), { active: 'jornada', current: 'page' });
  assert.deepEqual(tab('#/tabla'), { active: 'tabla', current: 'page' });
  assert.deepEqual(tab('#/explorar?q=x'), { active: 'explorar', current: 'page' });
  // Partido: el último destino principal; por enlace directo, Mi equipo si es mío y Jornada si no.
  assert.deepEqual(tab(J30, 'tabla', true), { active: 'tabla', current: 'true' });
  assert.deepEqual(tab(J30, null, true), { active: 'miequipo', current: 'true' });
  assert.deepEqual(tab(OTHER, null, false), { active: 'jornada', current: 'true' });
  assert.deepEqual(tab(OTHER, 'partido', false), { active: 'jornada', current: 'true' }, 'solo cuenta un destino principal');
  // Equipo: Mi equipo si (s, g, t) es mi equipo; si no, Explorar.
  assert.deepEqual(tab('#/equipo?g=PG2&t=Las%20Mesas%20Hu.', 'tabla', true), { active: 'miequipo', current: 'true' });
  assert.deepEqual(tab('#/equipo?g=PG2&t=Acodetti', 'tabla', false), { active: 'explorar', current: 'true' });
  // Ligas: Explorar, o el de `to` si viene de «Otro grupo».
  assert.deepEqual(tab('#/ligas?c=prebenjamin'), { active: 'explorar', current: 'true' });
  assert.deepEqual(tab('#/ligas?to=tabla'), { active: 'tabla', current: 'true' });
  assert.deepEqual(tab('#/ligas?to=jornada'), { active: 'jornada', current: 'true' });
  for (const hash of ['#/copa?g=MCPK1', '#/goleadores', '#/temporadas', '#/records', '#/fuentes', '#/ajustes']) {
    assert.deepEqual(tab(hash, 'tabla'), { active: 'explorar', current: 'true' }, hash);
  }
});

test('routeIsMine: el partido o la ficha de mi equipo, en su grupo y su temporada', () => {
  const R = (hash) => ({ screen: parseRoute(hash).screen, params: { s: PORTAL, ...parseRoute(hash).params } });
  assert.equal(routeIsMine(R(J30), OK), true);
  assert.equal(routeIsMine(R(OTHER), OK), false);
  assert.equal(routeIsMine(R('#/equipo?g=PG2&t=Las%20Mesas%20Hu.'), OK), true);
  assert.equal(routeIsMine(R('#/equipo?g=PG3&t=Las%20Mesas%20Hu.'), OK), false);
  assert.equal(routeIsMine({ screen: 'partido', params: { s: '2024-2025', g: 'PG2', r: 'Jornada 30', h: 'Las Mesas Hu.', a: 'x' } }, OK), false);
  assert.equal(routeIsMine(R(J30), ASK), false);
  assert.equal(routeIsMine(R('#/tabla?g=PG2'), OK), false);
});

// ── Pantallas registradas y pantalla provisional ─────────────────────────

// Rutas de B3 (decisión 6 de B2): la pantalla provisional. Jornada, Tabla y Partido la llevan
// hasta que la Tarea 12 registra las suyas.
const B3 = ['explorar', 'equipo', 'ligas', 'copa', 'goleadores', 'temporadas', 'records', 'fuentes', 'ajustes'];

test('cada ruta de §4.1 tiene pantalla; las de B3 pintan la provisional con su h1 y el vacío', () => {
  assert.deepEqual(Object.keys(SCREEN_MAP).sort(), [...SCREENS].sort());
  assert.equal(SCREEN_MAP[''].id, 'home');
  for (const name of SCREENS) assert.equal(typeof SCREEN_MAP[name].render, 'function', name);
  for (const name of B3) {
    assert.equal(SCREEN_MAP[name], pendiente, name);
    const back = parentOf({ screen: name, params: {} });
    const out = String(pendiente.render({ route: { screen: name, params: {} }, backHref: back ? routeHref(back.screen, back.params) : null }));
    assert.equal((out.match(/<h1>/g) || []).length, 1, name);
    assert.ok(out.includes(`<h1>${routeTitle(name)}</h1>`), name);
    assert.ok(out.includes('Esta pantalla llega en la próxima fase del rediseño.'), name);
    assert.match(out, new RegExp(`^<section data-screen="pendiente" data-route="${name}">`), name);
  }
  assert.deepEqual(pendiente.needs({}, {}), []);
});

// ── startRouter con un window y un document falsos ─────────────────────

// El navegador falso es el común (fixtures/rediseno/fake-browser.mjs), el mismo de las pruebas de
// start() en test_rediseno_integracion.mjs.

// Pantalla falsa: su h1 es su id y enseña la ruta resuelta en <p class="where">.
function screen(id, { log = [], needs = () => [], mount = null, body = null } = {}) {
  return {
    id,
    needs: (params, datasets) => { log.push(`needs ${id}`); return needs(params, datasets); },
    render: (ctx) => {
      log.push(`render ${id}`);
      return html`<section data-screen="${id}"><header class="screen-head"><h1>${id}</h1></header><p class="where">${routeHref(ctx.route.screen, ctx.params)}</p>${body ? body(ctx) : ''}</section>`;
    },
    mount: (root, ctx, nav) => { log.push(`mount ${id}`); return mount ? mount(root, ctx, nav) : undefined; },
  };
}
const where = (b) => (b.root.innerHTML.match(/<p class="where">([^<]*)<\/p>/) || [])[1]?.replace(/&amp;/g, '&');
const deferred = () => {
  let resolve, reject;
  const promise = new Promise((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
};
const tick = () => new Promise((resolve) => setImmediate(resolve));
// Arranca el router sin volcar en la salida los console.error esperados (cajas de error).
async function quietly(options) {
  const original = console.error;
  console.error = () => {};
  try {
    const router = startRouter(options);
    await router.idle();
    return router;
  } finally {
    console.error = original;
  }
}

test('la ruta inicial pasa por needs, render y mount; marca la barra y no mueve el foco', async () => {
  const b = fakeBrowser('#/');
  const log = [];
  const router = startRouter({ screens: { '': screen('home', { log }) }, root: b.root, getContext: context(), window: b.win });
  await router.idle();
  assert.deepEqual(log, ['needs home', 'render home', 'mount home']);
  assert.match(b.root.innerHTML, /<h1>home<\/h1>/);
  assert.equal(b.h1().focused, 0, 'la carga inicial no mueve el foco');
  assert.deepEqual(b.marks(), [['#/', 'page']]);
  assert.equal(b.doc.title, 'Fútbol Base Las Palmas');
  assert.equal(b.win.history.scrollRestoration, 'manual');
  assert.deepEqual(router.current(), { screen: '', params: {} });
});

test('needs recibe la temporada del portal del contexto: ninguna pantalla la lee de config.js (R2-1)', async () => {
  const b = fakeBrowser('#/tabla?g=PG2');
  const received = [];
  const tabla = { ...screen('tabla'), needs: (params, datasets, options) => { received.push(options); return []; } };
  const router = startRouter({ screens: { tabla }, root: b.root, getContext: context(), window: b.win });
  await router.idle();
  assert.deepEqual(received, [{ portalSeason: PORTAL }]);
});

test('token: una respuesta lenta (o un error) nunca pinta sobre la ruta nueva', async () => {
  const b = fakeBrowser('#/');
  const log = [];
  const slow = deferred();
  const failing = deferred();
  const screens = {
    '': screen('home', { log }),
    tabla: screen('tabla', { log, needs: () => [slow.promise] }),
    explorar: screen('explorar', { log, needs: () => [failing.promise] }),
    jornada: screen('jornada', { log }),
  };
  const router = startRouter({ screens, root: b.root, getContext: context(), window: b.win });
  await router.idle();
  assert.equal(b.click({ href: '#/tabla' }), true);
  assert.match(b.root.innerHTML, /data-skeleton="tabla"/, 'el esqueleto mientras carga');
  b.click({ href: '#/explorar' });
  b.click({ href: '#/jornada' });
  await router.idle();
  assert.match(b.root.innerHTML, /<h1>jornada<\/h1>/);
  slow.resolve();
  failing.reject(new Error('la temporada 2024/25'));
  await tick();
  assert.match(b.root.innerHTML, /<h1>jornada<\/h1>/, 'la tabla y el error llegaron tarde y no pintan');
  assert.ok(!log.includes('render tabla') && !log.includes('render explorar'));
  assert.deepEqual(b.marks(), [['#/jornada', 'page']]);
});

test('enlace antiguo de WhatsApp: se traduce con replaceState, sin entrada nueva, y conserva su temporada', async () => {
  const b = fakeBrowser('#section=jornadas&cat=prebenjamin&season=2025-2026&group=PG2&round=Jornada+30');
  const router = startRouter({ screens: { '': screen('home'), jornada: screen('jornada') }, root: b.root, getContext: context(), window: b.win });
  await router.idle();
  assert.deepEqual(b.entries(), ['#/jornada?s=2025-2026&g=PG2&r=Jornada%2030']);
  assert.equal(where(b), '#/jornada?s=2025-2026&g=PG2&r=Jornada%2030');
  const m = fakeBrowser('#section=jornadas&group=PG2&match=%5B%22Las+Mesas+Hu.%22%2C%22AD+Hurac%C3%A1n%22%2C%22Jornada+30%22%5D');
  const r2 = startRouter({ screens: { '': screen('home'), partido: screen('partido') }, root: m.root, getContext: context(), window: m.win });
  await r2.idle();
  assert.deepEqual(m.entries(), [J30]);
  assert.deepEqual(m.marks(), [['#/', 'true']], 'enlace directo a un partido de mi equipo: Mi equipo');
});

test('enlace antiguo «miequipo» de mi equipo (la URL que escribía la app anterior): Mi equipo, no su ficha', async () => {
  const open = async (hash) => {
    const b = fakeBrowser(hash);
    const router = startRouter({ screens: { '': screen('home'), equipo: pendiente }, root: b.root, getContext: context(), window: b.win });
    await router.idle();
    return b.entries();
  };
  // El mismo nombre que el guardado, o el mismo club en el mismo grupo («Las Mesas Hu», sin punto).
  assert.deepEqual(await open('#section=miequipo&cat=prebenjamin&season=2025-2026&group=PG2&team=Las+Mesas+Hu.'), ['#/']);
  assert.deepEqual(await open('#section=miequipo&cat=prebenjamin&season=2025-2026&group=PG2&team=Las+Mesas+Hu'), ['#/']);
  // Otro equipo, o el mismo club en otro grupo: su ficha, con la temporada del enlace (§4.1).
  assert.deepEqual(await open('#section=miequipo&cat=prebenjamin&season=2025-2026&group=PG2&team=AD+Hurac%C3%A1n'),
    ['#/equipo?s=2025-2026&g=PG2&t=AD%20Hurac%C3%A1n']);
  assert.deepEqual(await open('#section=miequipo&cat=benjamin&season=2025-2026&group=A2&team=Las+Mesas+Hu'),
    ['#/equipo?s=2025-2026&g=A2&t=Las%20Mesas%20Hu']);
});

test('enlace directo con parámetros que faltan o no existen: la pantalla por defecto, con aviso, nunca en blanco', async () => {
  const b = fakeBrowser('#/jornada');
  const router = startRouter({ screens: { '': screen('home'), jornada: screen('jornada'), ligas: pendiente }, root: b.root, getContext: context({ resolution: ASK }), window: b.win });
  await router.idle();
  assert.deepEqual(b.entries(), ['#/ligas?to=jornada']);
  assert.match(b.root.innerHTML, /<\/header><p class="notice route-notice" role="status">Elige tu equipo en Mi equipo<\/p>/);
  assert.deepEqual(b.marks(), [['#/jornada', 'true']]);
  const g = fakeBrowser('#/tabla?g=LZS1');
  const r2 = startRouter({ screens: { '': screen('home'), tabla: screen('tabla'), ligas: pendiente }, root: g.root, getContext: context(), window: g.win });
  await r2.idle();
  assert.deepEqual(g.entries(), ['#/ligas?c=prebenjamin&to=tabla']);
  assert.match(g.root.innerHTML, /<h1>Ligas<\/h1><\/div><\/header><p class="notice route-notice" role="status">No encontramos el grupo LZS1 en la temporada 2025\/26<\/p>/);
});

// La carga de una temporada pasada que el router pide él mismo (loadSeason, con la firma de
// seasonNeeds): la apunta en `loaded`, que lee el modelo falso, o rechaza las `fails` primeras
// veces como una red caída, con el Error('la temporada 2024/25') de seasonNeeds.
function seasonLoader(loaded, { fails = 0, log = [] } = {}) {
  let calls = 0;
  return (name, datasets, portalSeason) => {
    log.push(`carga ${name}`);
    if (!name || name === portalSeason || loaded.includes(name)) return [];
    return [++calls <= fails
      ? Promise.reject(new Error(`la temporada ${seasonLabel(name)}`))
      : Promise.resolve().then(() => { loaded.push(name); })];
  };
}

test('temporada pasada sin cargar: se carga y después se pone el grupo por defecto', async () => {
  const b = fakeBrowser('#/tabla?s=2024-2025');
  const loaded = [];
  const log = [];
  const tabla = screen('tabla', { log, needs: (params) => (loaded.includes(params.s) ? [] : [Promise.resolve().then(() => { loaded.push(params.s); })]) });
  const router = startRouter({ screens: { '': screen('home'), tabla }, root: b.root, getContext: context({ loaded }), window: b.win, loadSeason: seasonLoader(loaded) });
  await router.idle();
  assert.equal(where(b), '#/tabla?s=2024-2025&g=PGC2');
  assert.deepEqual(b.entries(), ['#/tabla?s=2024-2025'], 'el valor por defecto no reescribe la dirección');
  assert.deepEqual(log.filter((x) => x.startsWith('render')), ['render tabla']);
});

// ── Ronda final de B2: temporada pendiente, ancla de formulario y padre de Partido ──

test('temporada pasada sin cargar que la pantalla no pide: la carga el router y la pinta, nunca la caja de error (I4(a))', async () => {
  const b = fakeBrowser('#/equipo?s=2024-2025&g=PGC2&t=Las%20Mesas%20Hu.');
  const loaded = [];
  const log = [];
  // La provisional (y cualquier pantalla de B3 que olvide seasonNeeds) no pide nada en needs.
  const router = startRouter({ screens: { '': screen('home'), equipo: pendiente }, root: b.root, getContext: context({ loaded }), window: b.win, loadSeason: seasonLoader(loaded, { log }) });
  await router.idle();
  assert.deepEqual(log, ['carga 2024-2025'], 'el router pide la temporada pendiente, con la de la ruta');
  assert.deepEqual(loaded, ['2024-2025']);
  assert.match(b.root.innerHTML, /^<section data-screen="pendiente" data-route="equipo">/);
  assert.doesNotMatch(b.root.innerHTML, /No se pudieron cargar/);
  assert.deepEqual(b.entries(), ['#/equipo?s=2024-2025&g=PGC2&t=Las%20Mesas%20Hu.']);
  // Con la temporada cargada, el grupo se valida como siempre: uno que no existe lleva a Explorar.
  const g = fakeBrowser('#/equipo?s=2024-2025&g=ZZ9&t=X');
  const loaded2 = [];
  const r2 = startRouter({ screens: { '': screen('home'), equipo: pendiente, explorar: pendiente }, root: g.root, getContext: context({ loaded: loaded2 }), window: g.win, loadSeason: seasonLoader(loaded2) });
  await r2.idle();
  assert.deepEqual(g.entries(), ['#/explorar?s=2024-2025&q=X']);
  assert.match(g.root.innerHTML, /No encontramos el grupo ZZ9 en la temporada 2024\/25/);
});

test('si la carga de la temporada pendiente falla: la caja de error, y su «Reintentar» funciona al volver la red (I4(a))', async () => {
  const b = fakeBrowser('#/tabla?s=2024-2025');
  const loaded = [];
  const log = [];
  const router = await quietly({ screens: { '': screen('home'), tabla: screen('tabla', { log }) }, root: b.root, getContext: context({ loaded }), window: b.win, loadSeason: seasonLoader(loaded, { fails: 1 }) });
  assert.match(b.root.innerHTML, /^<section data-screen="tabla" data-state="error">/);
  assert.match(b.root.innerHTML, /No se pudieron cargar los datos de la temporada 2024\/25\./);
  assert.equal(b.click({ 'data-action': 'retry', type: 'button' }, 'button'), true);
  await router.idle();
  assert.equal(where(b), '#/tabla?s=2024-2025&g=PGC2');
  assert.deepEqual(log.filter((x) => x.startsWith('render')), ['render tabla']);
});

test('un ancla que es un control de formulario se lleva el foco al avanzar, al volver y al reintentar (#/explorar#buscar, I4(b))', async () => {
  const b = fakeBrowser('#/');
  const explorar = screen('explorar', { body: () => html`<form role="search"><input id="buscar" type="search"></form>` });
  const equipo = screen('equipo', { body: () => html`<div id="calendario">Calendario</div>` });
  const router = startRouter({ screens: { '': screen('home'), explorar, equipo }, root: b.root, getContext: context(), window: b.win });
  await router.idle();
  const buscar = () => b.doc.getElementById('buscar');
  b.click({ href: '#/explorar#buscar' });
  await router.idle();
  assert.equal(buscar().tagName, 'INPUT');
  assert.equal(buscar().focused, 1, 'al avanzar, el foco va al buscador (§4.2 A)');
  assert.equal(b.h1().focused, 0, 'y no al h1');
  // Un ancla que no es un control (el calendario de la ficha) solo desplaza: el foco, al h1.
  b.click({ href: '#/equipo?g=PG2&t=Las%20Mesas%20Hu.#calendario' });
  await router.idle();
  assert.equal(b.doc.getElementById('calendario').scrolled, 1);
  assert.equal(b.h1().focused, 1);
  // Al volver (pop) a #/explorar#buscar, otra vez el buscador.
  b.win.history.back();
  await tick();
  await router.idle();
  assert.equal(buscar().focused, 1, 'al volver, el buscador');
  assert.equal(b.h1().focused, 0);
  // Y al reintentar (refresh).
  router.nav.retry();
  await router.idle();
  assert.equal(buscar().focused, 1, 'al reintentar, el buscador');
  assert.equal(b.h1().focused, 0);
});

test('parentOf con el modelo: un partido de copa o de torneo vuelve a #/copa?s&g; uno de liga, a la jornada de su partido (M2)', () => {
  const m = model();
  const up = (params) => parentOf({ screen: 'partido', params: { s: PORTAL, ...params } }, m);
  assert.deepEqual(up({ g: 'MCPK1', r: '27-06-2026 ( Cuartos )', h: 'UD Las Mesas Huracán', a: 'CF Unión Carrizal' }),
    { screen: 'copa', params: { s: PORTAL, g: 'MCPK1' } }, 'cuadro de la Maspalomas Cup (model.cups())');
  assert.deepEqual(up({ g: 'MCP3', r: 'Fase de Grupos', h: 'UD Las Mesas Huracán', a: 'Real Club Victoria' }),
    { screen: 'copa', params: { s: PORTAL, g: 'MCP3' } }, 'liguilla de la Maspalomas Cup: tampoco es de liga');
  // De liga: la jornada del partido, con su clave, aunque el enlace traiga el número u otra jornada.
  assert.deepEqual(up({ g: 'PG2', r: '30', h: 'Las Mesas Hu.', a: 'AD Huracán' }), { screen: 'jornada', params: { s: PORTAL, g: 'PG2', r: 'Jornada 30' } });
  assert.deepEqual(up({ g: 'PG2', r: 'Jornada 3', h: 'AD Huracán', a: 'Las Mesas Hu.' }), { screen: 'jornada', params: { s: PORTAL, g: 'PG2', r: 'Jornada 15' } });
  // Un partido que no está en el grupo: la jornada por defecto de su grupo.
  assert.deepEqual(up({ g: 'PG2', r: 'Jornada 30', h: 'x', a: 'y' }), { screen: 'jornada', params: { s: PORTAL, g: 'PG2' } });
  // Sin modelo, o sin su temporada cargada, lo que trae el enlace, como antes.
  assert.deepEqual(parentOf({ screen: 'partido', params: { s: '2024-2025', g: 'PGC2', r: '6', h: 'x', a: 'y' } }, m),
    { screen: 'jornada', params: { s: '2024-2025', g: 'PGC2', r: '6' } });
  assert.deepEqual(parentOf({ screen: 'partido', params: { s: PORTAL, g: 'MCPK1', r: 'Final' } }),
    { screen: 'jornada', params: { s: PORTAL, g: 'MCPK1', r: 'Final' } });
});

test('ctx.backHref de un partido de torneo es #/copa?s&g, y nav.back() sin historial de la app va allí (M2)', async () => {
  const hash = routeHref('partido', { g: 'MCPK1', r: '27-06-2026 ( Cuartos )', h: 'UD Las Mesas Huracán', a: 'CF Unión Carrizal' });
  const b = fakeBrowser(hash);
  let seen = null;
  const screens = { '': screen('home'), partido: screen('partido', { mount: (root, ctx) => { seen = ctx; } }), copa: screen('copa') };
  const router = startRouter({ screens, root: b.root, getContext: context(), window: b.win });
  await router.idle();
  assert.equal(seen.backHref, '#/copa?s=2025-2026&g=MCPK1');
  await router.nav.back();
  assert.deepEqual(b.entries(), [hash, '#/copa?s=2025-2026&g=MCPK1']);
  assert.match(b.root.innerHTML, /<h1>copa<\/h1>/);
});

test('historial: cambiar de pantalla es push; cambiar de jornada o de vista, replace', async () => {
  const b = fakeBrowser('#/jornada?g=PG2&r=Jornada%201');
  const router = startRouter({ screens: { '': screen('home'), jornada: screen('jornada'), tabla: screen('tabla') }, root: b.root, getContext: context(), window: b.win });
  await router.idle();
  b.click({ href: '#/jornada?g=PG2&r=Jornada%202' });
  await router.idle();
  assert.deepEqual(b.entries(), ['#/jornada?g=PG2&r=Jornada%202']);
  b.click({ href: '#/tabla' });
  await router.idle();
  assert.deepEqual(b.entries(), ['#/jornada?g=PG2&r=Jornada%202', '#/tabla']);
  b.click({ href: '#/tabla?v=goles' });
  await router.idle();
  assert.deepEqual(b.entries(), ['#/jornada?g=PG2&r=Jornada%202', '#/tabla?v=goles']);
  assert.equal(where(b), '#/tabla?s=2025-2026&g=PG2&v=goles');
});

test('Atrás y «‹» con entrada anterior de la app: history.back(), con el desplazamiento guardado y foco al h1', async () => {
  const b = fakeBrowser('#/');
  const log = [];
  let partidoCtx = null;
  const screens = { '': screen('home', { log }), partido: screen('partido', { log, mount: (root, ctx) => { partidoCtx = ctx; } }) };
  const router = startRouter({ screens, root: b.root, getContext: context(), window: b.win });
  await router.idle();
  b.scroll(420);
  b.click({ href: J30 });
  await router.idle();
  assert.equal(b.win.scrollY, 0, 'la ficha empieza arriba');
  assert.equal(b.h1().focused, 1, 'foco al h1 al avanzar');
  assert.equal(b.h1().getAttribute('tabindex'), '-1');
  assert.deepEqual(b.marks(), [['#/', 'true']], 'Partido desde Mi equipo: su destino de origen');
  assert.equal(partidoCtx.backHref, '#/jornada?s=2025-2026&g=PG2&r=Jornada%2030');
  assert.equal(partidoCtx.lastPrimary, 'miequipo');
  assert.equal(b.click({ href: partidoCtx.backHref, 'data-action': 'back' }), true);
  await tick();
  await router.idle();
  assert.equal(b.index(), 0);
  assert.match(b.root.innerHTML, /<h1>home<\/h1>/);
  assert.equal(b.win.scrollY, 420, 'vuelve adonde estaba la portada');
  assert.equal(b.h1().focused, 1);
  assert.deepEqual(log.filter((x) => x === 'render home'), ['render home', 'render home'], 'popstate y hashchange: un solo pintado');
});

test('«‹» entrando por enlace directo: sigue el enlace al padre (Partido → su jornada), con push', async () => {
  const b = fakeBrowser(OTHER);
  let ctxSeen = null;
  const screens = { '': screen('home'), partido: screen('partido', { mount: (root, ctx) => { ctxSeen = ctx; } }), jornada: screen('jornada') };
  const router = startRouter({ screens, root: b.root, getContext: context(), window: b.win });
  await router.idle();
  assert.deepEqual(b.marks(), [['#/jornada', 'true']], 'enlace directo a un partido que no es mío: Jornada');
  assert.equal(b.click({ href: ctxSeen.backHref, 'data-action': 'back' }), true);
  await router.idle();
  assert.deepEqual(b.entries(), [OTHER, '#/jornada?s=2025-2026&g=PG2&r=Jornada%2030']);
  assert.match(b.root.innerHTML, /<h1>jornada<\/h1>/);
  assert.deepEqual(b.marks(), [['#/jornada', 'page']]);
});

test('un hash escrito a mano es una entrada nueva de la app, y su «‹» vuelve atrás', async () => {
  const b = fakeBrowser('#/');
  const log = [];
  const router = startRouter({ screens: { '': screen('home', { log }), tabla: screen('tabla', { log }) }, root: b.root, getContext: context(), window: b.win });
  await router.idle();
  b.type('#/tabla');
  await router.idle();
  assert.match(b.root.innerHTML, /<h1>tabla<\/h1>/);
  assert.deepEqual(log.filter((x) => x === 'render tabla'), ['render tabla']);
  assert.equal(b.click({ href: '#/', 'data-action': 'back' }), true);
  await tick();
  await router.idle();
  assert.equal(b.index(), 0);
  assert.match(b.root.innerHTML, /<h1>home<\/h1>/);
});

test('error de carga: caja con Reintentar, que vuelve a pedir los datos y pinta la pantalla', async () => {
  const b = fakeBrowser('#/tabla');
  let calls = 0;
  const tabla = screen('tabla', { needs: () => [++calls === 1 ? Promise.reject(new Error('la temporada 2024/25')) : Promise.resolve()] });
  const router = await quietly({ screens: { '': screen('home'), tabla }, root: b.root, getContext: context(), window: b.win });
  assert.match(b.root.innerHTML, /^<section data-screen="tabla" data-state="error">/);
  assert.match(b.root.innerHTML, /<h1>Tabla<\/h1>/);
  assert.match(b.root.innerHTML, /No se pudieron cargar los datos de la temporada 2024\/25\./);
  assert.equal(b.click({ 'data-action': 'retry', type: 'button' }, 'button'), true);
  await router.idle();
  assert.match(b.root.innerHTML, /<h1>tabla<\/h1>/);
  assert.equal(calls, 2);
});

test('un fallo de programación da la caja de error sin su mensaje; render tiene que devolver Html', async () => {
  const b = fakeBrowser('#/tabla');
  const tabla = { id: 'tabla', needs: () => { throw new TypeError('x is undefined'); }, render: () => html`` };
  await quietly({ screens: { '': screen('home'), tabla }, root: b.root, getContext: context(), window: b.win });
  assert.match(b.root.innerHTML, /No se pudieron cargar los datos de esta pantalla\./);
  assert.doesNotMatch(b.root.innerHTML, /undefined/);
  const t = fakeBrowser('#/tabla');
  const texto = { id: 'tabla', needs: () => [], render: () => '<h1>sin escapar</h1>' };
  await quietly({ screens: { '': screen('home'), tabla: texto }, root: t.root, getContext: context(), window: t.win });
  assert.match(t.root.innerHTML, /data-state="error"/);
  assert.doesNotMatch(t.root.innerHTML, /sin escapar/);
});

test('un bucle de redirecciones (defensivo) da «No se pudieron cargar los datos de esta pantalla», nunca su mensaje literal', async () => {
  const b = fakeBrowser('#/tabla');
  // Un getContext que alterna la resolución en cada llamada: resolveParams converge siempre con un
  // contexto fijo, así que para probar el límite (defensivo) de MAX_REDIRECTS hace falta un
  // contexto que cambie solo, no un caso real de la tabla de §4.1.
  const other = { status: 'ok', group: group('A2'), name: 'AD Huracán', cat: 'benjamin' };
  const ctxA = context();
  const ctxB = context({ resolution: other });
  let toggle = false;
  const flip = () => { toggle = !toggle; return (toggle ? ctxA : ctxB)(); };
  const tabla = { id: 'tabla', needs: () => [Promise.resolve()], render: () => html`<h1>tabla</h1>` };
  await quietly({ screens: { '': screen('home'), tabla }, root: b.root, getContext: flip, window: b.win });
  assert.match(b.root.innerHTML, /No se pudieron cargar los datos de esta pantalla\./);
  assert.doesNotMatch(b.root.innerHTML, /Demasiadas redirecciones/);
});

test('al cambiar de jornada el desplazamiento se queda y el foco vuelve al control pulsado (mismo id)', async () => {
  const b = fakeBrowser('#/jornada?g=PG2&r=Jornada%201');
  const jornada = screen('jornada', { body: (ctx) => html`<a id="siguiente" href="#/jornada?g=PG2&r=Jornada%202">›</a>` });
  const router = startRouter({ screens: { '': screen('home'), jornada }, root: b.root, getContext: context(), window: b.win });
  await router.idle();
  b.scroll(150);
  b.doc.getElementById('siguiente').focus();
  b.click({ href: '#/jornada?g=PG2&r=Jornada%202', id: 'siguiente' });
  await router.idle();
  assert.equal(b.win.scrollY, 150);
  assert.equal(b.doc.getElementById('siguiente').focused, 1, 'el control nuevo con el mismo id');
  assert.equal(b.h1().focused, 0);
});

test('el foco vuelve al control pulsado aunque el clic no lo active (Safari, B11)', async () => {
  const b = fakeBrowser('#/jornada?g=PG2&r=Jornada%201');
  const jornada = screen('jornada', { body: () => html`<a id="siguiente" href="#/jornada?g=PG2&r=Jornada%202">›</a>` });
  const router = startRouter({ screens: { '': screen('home'), jornada }, root: b.root, getContext: context(), window: b.win });
  await router.idle();
  // A diferencia de la prueba anterior, nunca se llama a .focus(): Safari no activa el control al
  // pulsarlo, así que b.doc.activeElement sigue siendo null en todo momento.
  b.click({ href: '#/jornada?g=PG2&r=Jornada%202', id: 'siguiente' });
  await router.idle();
  assert.equal(b.doc.getElementById('siguiente').focused, 1, 'el control nuevo con el mismo id, aunque el clic no lo activara');
  assert.equal(b.h1().focused, 0);
});

test('un ancla tras un segundo # manda al avanzar: se desplaza al ancla, no arriba', async () => {
  const b = fakeBrowser('#/');
  const equipo = screen('equipo', { body: () => html`<div id="calendario">Calendario</div>` });
  const router = startRouter({ screens: { '': screen('home'), equipo }, root: b.root, getContext: context(), window: b.win });
  await router.idle();
  b.scroll(200);
  b.click({ href: '#/equipo?g=PG2&t=Las%20Mesas%20Hu.#calendario' });
  await router.idle();
  assert.equal(b.doc.getElementById('calendario').scrolled, 1, 'scrollIntoView en el ancla');
  assert.equal(b.win.scrollY, 200, 'no se fuerza win.scrollTo(0, …) cuando hay ancla');
});

test('«Saltar al contenido» lleva el foco a main sin cambiar la ruta', async () => {
  const b = fakeBrowser('#/');
  const router = startRouter({ screens: { '': screen('home') }, root: b.root, getContext: context(), window: b.win });
  await router.idle();
  assert.equal(b.click({ class: 'skip-link', href: '#contenido' }), true);
  assert.deepEqual(b.entries(), ['#/']);
  assert.equal(b.main.focused, 1);
  assert.equal(b.main.getAttribute('tabindex'), '-1');
});

test('un ancla interna cuyo destino no existe no cambia la ruta ni repinta (se previene igual)', async () => {
  const b = fakeBrowser('#/');
  const log = [];
  const router = startRouter({ screens: { '': screen('home', { log }) }, root: b.root, getContext: context(), window: b.win });
  await router.idle();
  log.length = 0;
  assert.equal(b.click({ href: '#noexiste' }), true, 'se previene aunque el destino no exista (B3)');
  assert.deepEqual(b.entries(), ['#/']);
  assert.deepEqual(log, [], 'ninguna navegación nueva: no hay needs, render ni mount');
});

test('mount puede devolver una limpieza, que se llama justo antes de pintar la pantalla siguiente', async () => {
  const b = fakeBrowser('#/');
  const log = [];
  const home = screen('home', { mount: () => () => log.push('limpieza home') });
  const router = startRouter({ screens: { '': home, tabla: screen('tabla', { log }) }, root: b.root, getContext: context(), window: b.win });
  await router.idle();
  b.click({ href: '#/tabla' });
  await router.idle();
  assert.deepEqual(log, ['needs tabla', 'render tabla', 'limpieza home', 'mount tabla']);
});

test('el último destino principal se guarda en la sesión y marca Partido tras recargar', async () => {
  const saved = new Map();
  const session = { getItem: (k) => saved.get(k) ?? null, setItem: (k, v) => { saved.set(k, v); } };
  const b = fakeBrowser('#/tabla');
  const screens = { '': screen('home'), tabla: screen('tabla'), partido: screen('partido') };
  await startRouter({ screens, root: b.root, getContext: context(), window: b.win, session }).idle();
  assert.equal(saved.get('futbol-base:destino'), 'tabla');
  const again = fakeBrowser(OTHER);
  await startRouter({ screens, root: again.root, getContext: context(), window: again.win, session }).idle();
  assert.deepEqual(again.marks(), [['#/tabla', 'true']]);
});

test('nav.saveMyTeam guarda con actions.saveMyTeam y vuelve a pintar la ruta', async () => {
  const b = fakeBrowser('#/');
  const log = [];
  let nav = null;
  let stored = null;
  const home = screen('home', { log, mount: (root, ctx, n) => { nav = n; } });
  const router = startRouter({ screens: { '': home }, root: b.root, getContext: context(), window: b.win, actions: { saveMyTeam: (team) => { stored = team; return true; } } });
  await router.idle();
  const team = { name: 'Las Mesas B', season: '2026-2027', cat: 'benjamin', groupId: 'B2' };
  assert.equal(nav.saveMyTeam(team), true);
  await router.idle();
  assert.deepEqual(stored, team);
  assert.deepEqual(log.filter((x) => x === 'render home'), ['render home', 'render home']);
  assert.equal(b.h1().focused, 1);
});

test('si mount navega (nav.replace), manda esa navegación: el pintado anterior no recoloca nada', async () => {
  const b = fakeBrowser('#/');
  const explorar = screen('explorar', { mount: (root, ctx, nav) => { nav.replace('tabla', { v: 'goles' }); } });
  const router = startRouter({ screens: { '': screen('home'), explorar, tabla: screen('tabla') }, root: b.root, getContext: context(), window: b.win });
  await router.idle();
  b.scroll(300);
  b.click({ href: '#/explorar' });
  await router.idle();
  assert.deepEqual(b.entries(), ['#/', '#/tabla?v=goles']);
  assert.match(b.root.innerHTML, /<h1>tabla<\/h1>/);
  assert.equal(b.h1().focused, 1, 'un solo foco, el de la tabla');
  // La navegación anidada hereda el destino de fuera: es un push, así que arriba (hallazgo 3),
  // nunca el scrollY 300 de antes de pulsar Explorar.
  assert.equal(b.win.scrollY, 0, 'arriba al avanzar, no el scroll de antes del push');
});

test('un mount que navega y además devuelve limpieza: no pisa la de la pantalla nueva ni se pierde', async () => {
  const b = fakeBrowser('#/');
  const log = [];
  const explorar = screen('explorar', { log, mount: (root, ctx, nav) => { nav.go('tabla'); return () => log.push('limpieza explorar'); } });
  const tabla = screen('tabla', { log, mount: () => () => log.push('limpieza tabla') });
  const jornada = screen('jornada', { log });
  const router = startRouter({ screens: { '': screen('home', { log }), explorar, tabla, jornada }, root: b.root, getContext: context(), window: b.win });
  await router.idle();
  log.length = 0;
  b.click({ href: '#/explorar' });
  await router.idle();
  // La limpieza de explorar se llama en el acto: su pantalla nunca llegó a quedarse en pantalla.
  assert.deepEqual(log, ['needs explorar', 'render explorar', 'mount explorar', 'needs tabla', 'render tabla', 'mount tabla', 'limpieza explorar']);
  log.length = 0;
  b.click({ href: '#/jornada' });
  await router.idle();
  // Al salir de tabla (la que de verdad estaba en pantalla), su limpieza; nunca la de explorar otra vez.
  assert.deepEqual(log, ['needs jornada', 'render jornada', 'limpieza tabla', 'mount jornada']);
});

test('idle() espera una navegación lanzada desde mount, aunque tenga needs pendientes', async () => {
  const b = fakeBrowser('#/');
  const gate = deferred();
  const tabla = screen('tabla', { needs: () => [gate.promise] });
  const explorar = screen('explorar', { mount: (root, ctx, nav) => { nav.go('tabla'); } });
  const router = startRouter({ screens: { '': screen('home'), explorar, tabla }, root: b.root, getContext: context(), window: b.win });
  await router.idle();
  b.click({ href: '#/explorar' });
  const idlePromise = router.idle();
  let resolved = false;
  idlePromise.then(() => { resolved = true; });
  await tick();
  assert.equal(resolved, false, 'todavía no: tabla (lanzada desde el mount de explorar) sigue esperando su needs');
  assert.match(b.root.innerHTML, /data-skeleton="tabla"/);
  gate.resolve();
  await idlePromise;
  assert.equal(resolved, true);
  assert.match(b.root.innerHTML, /<h1>tabla<\/h1>/);
});

test('nav.back() devuelve la promesa de la vuelta atrás, no la del pintado anterior', async () => {
  const b = fakeBrowser('#/');
  const gate = deferred();
  let calls = 0;
  const home = screen('home', { needs: () => (++calls === 1 ? [] : [gate.promise]) });
  const tabla = screen('tabla');
  const router = startRouter({ screens: { '': home, tabla }, root: b.root, getContext: context(), window: b.win });
  await router.idle();
  b.click({ href: '#/tabla' });
  await router.idle();
  const backPromise = router.nav.back();
  let resolved = false;
  backPromise.then(() => { resolved = true; });
  await tick();
  assert.equal(resolved, false, 'la vuelta a Mi equipo tiene needs pendientes: back() no ha terminado');
  assert.match(b.root.innerHTML, /data-skeleton="home"/);
  gate.resolve();
  await backPromise;
  assert.equal(resolved, true);
  assert.match(b.root.innerHTML, /<h1>home<\/h1>/);
});

test('dos nav.back() seguidos: ninguna de las dos promesas se queda colgada (B2, ronda 2)', async () => {
  // deferBack: history.back() no cambia el índice hasta su propio popstate, como un navegador de
  // verdad; con el navegador falso por defecto (que lo cambia ya) los dos back() no compiten por
  // el mismo pendiente, y el fallo no se ve.
  const b = fakeBrowser('#/', { deferBack: true });
  const router = startRouter({ screens: { '': screen('home'), fuentes: screen('fuentes') }, root: b.root, getContext: context(), window: b.win });
  await router.idle();
  b.click({ href: '#/fuentes' });
  await router.idle();
  const p1 = router.nav.back();
  const p2 = router.nav.back();
  let r1 = false, r2 = false;
  p1.then(() => { r1 = true; });
  p2.then(() => { r2 = true; });
  await tick();
  await tick();
  await tick();
  assert.equal(r1, true, 'la promesa del primer nav.back() no se queda colgada para siempre');
  assert.equal(r2, true);
  assert.equal(b.index(), 0);
  assert.match(b.root.innerHTML, /<h1>home<\/h1>/);
});
