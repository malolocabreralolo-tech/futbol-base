// Plan B2, tarea 12: integración (spec §4.1, §4.2, §4.10, §5.4 y §6). Rutas y barra completas,
// mi equipo guardado al arrancar solo con un cambio de fase (A2 de la revisión adversarial) y el
// cableado de app.js: escudos, aviso sin conexión, sesión y «Hacer mi equipo». start() se ejecuta
// de verdad sobre un navegador falso y un almacén en memoria: el guardado al arrancar, la
// activación de 2026/27 por partes (§11, caso 3), los datos inmediatos que faltan y los enlaces
// que el router deja pasar porque la pantalla los sabe leer.
import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { fixture } from './fixtures/rediseno/load.mjs';
import { fakeBrowser, memoryStorage } from './fixtures/rediseno/fake-browser.mjs';
import { ctxFor, datasetsFor } from './fixtures/rediseno/screens.mjs';
import { currentAt, nextSeasonRaw, teamNames } from './fixtures/rediseno/simulate.mjs';
import { buildSeason } from '../../src/model.js';
import { buildClubIndex, resolveMyTeam, myTeamToSave } from '../../src/myteam.js';
import { SCREENS } from '../../src/links.js';
import { STORE_KEY, LEGACY_KEY } from '../../src/store.js';
import { SCREEN_MAP } from '../../src/screens.js';
import { start, startContext } from '../../src/app.js';
import { screen as home } from '../../src/screen-home.js';
import { screen as jornada } from '../../src/screen-jornada.js';
import { screen as tabla } from '../../src/screen-tabla.js';
import { screen as partido } from '../../src/screen-partido.js';
import { screen as equipo } from '../../src/screen-equipo.js';
import { screen as pendiente } from '../../src/screen-pendiente.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const shields = fixture('shields');
const raw = fixture('current-2025-2026');
const real = buildSeason({ name: raw.season, current: true, ...raw });
const index = buildClubIndex(teamNames(real), shields);
const PG2 = { name: 'Las Mesas Hu.', season: '2025-2026', cat: 'prebenjamin', groupId: 'PG2' };
const DEFAULT_TEAM = { cat: 'prebenjamin', groupId: 'PG2', name: 'Las Mesas Hu.' };
const PORTAL_2526 = { season: '2025-2026', nextSeason: '2026-2027', defaultTeam: DEFAULT_TEAM, timeZone: 'Atlantic/Canary' };
const PORTAL_2627 = { season: '2026-2027', nextSeason: '2027-2028', defaultTeam: DEFAULT_TEAM, timeZone: 'Atlantic/Canary' };

test('rutas completas: las cuatro pantallas de B2, Equipo y la provisional en las otras ocho de B3', () => {
  assert.deepEqual(Object.keys(SCREEN_MAP).sort(), [...SCREENS].sort());
  assert.equal(SCREEN_MAP[''], home);
  assert.equal(SCREEN_MAP.jornada, jornada);
  assert.equal(SCREEN_MAP.tabla, tabla);
  assert.equal(SCREEN_MAP.partido, partido);
  assert.equal(SCREEN_MAP.equipo, equipo);
  assert.deepEqual([home, jornada, tabla, partido, equipo].map((s) => s.id), ['home', 'jornada', 'tabla', 'partido', 'equipo']);
  assert.deepEqual(SCREENS.filter((name) => SCREEN_MAP[name] === pendiente),
    ['explorar', 'ligas', 'copa', 'goleadores', 'temporadas', 'records', 'fuentes', 'ajustes']);
});

test('myTeamToSave: el cambio de fase (FF5 → A2, decisión 12 de B1) sí; nada si no cambia', () => {
  const ff5 = { name: 'Las Mesas Hu.', season: '2025-2026', cat: 'benjamin', groupId: 'FF5' };
  const moved = resolveMyTeam(ff5, real, index, '2026-09-23');
  assert.deepEqual(myTeamToSave(ff5, moved), { name: 'Las Mesas Hu.', season: '2025-2026', cat: 'benjamin', groupId: 'A2' });
  assert.equal(myTeamToSave(PG2, resolveMyTeam(PG2, real, index, '2026-09-23')), null);
  assert.equal(myTeamToSave(PG2, { status: 'absent' }), null);
});

test('myTeamToSave: un cambio de temporada nunca se guarda solo, con una categoría o con las dos (A2 de la revisión)', () => {
  const at = (groups) => {
    const next = buildSeason({ name: '2026-2027', current: true, ...nextSeasonRaw(groups) });
    return resolveMyTeam(PG2, next, buildClubIndex(teamNames(real, next), shields), '2026-09-01');
  };
  const half = at({ prebenjamin: ['PG2'] });
  assert.equal(half.status, 'ok', 'el paso 1 lo resuelve en silencio…');
  assert.equal(myTeamToSave(PG2, half), null, '…pero no se guarda: la familia no lo ha confirmado');
  const whole = at({ benjamin: ['A1'], prebenjamin: ['PG2'] });
  assert.equal(whole.status, 'ok');
  assert.equal(myTeamToSave(PG2, whole), null, 'tampoco con las dos categorías');
  // Con «Las Mesas B» en benjamín, el paso 1 pregunta (E): lo guarda la respuesta, con nav.saveMyTeam.
  assert.equal(at({ benjamin: ['B2'], prebenjamin: ['PG2'] }).status, 'ask');
});

// ── start() de verdad, sobre un navegador falso ────────────────────────────

// El navegador falso es el común (fixtures/rediseno/fake-browser.mjs), el mismo de las pruebas del
// router: historial y hash, eventos, el <main> que guarda el HTML pintado, el hueco del aviso sin
// conexión, el literal «Última actualización» y el almacenamiento, un Map compartido entre cargas,
// como el localStorage de un móvil.

// Los data-*.js inmediatos, como los globales del navegador, y los perezosos por fetch.
const GLOBALS = ['BENJAMIN', 'PREBENJAMIN', 'HISTORY', 'GOL_BENJ', 'GOL_PREBENJ', 'SHIELDS', 'SEASONS',
  'MASPALOMAS_CUP_BENJAMIN', 'MASPALOMAS_CUP_PREBENJAMIN'];
function installData(season, { without = [], seasons = [{ name: '2025-2026', current: true }] } = {}) {
  const cups = fixture('cups-2025-2026');
  const values = { BENJAMIN: season.benjamin, PREBENJAMIN: season.prebenjamin, HISTORY: season.history,
    GOL_BENJ: [], GOL_PREBENJ: [], SHIELDS: shields, SEASONS: seasons,
    MASPALOMAS_CUP_BENJAMIN: cups.benjamin, MASPALOMAS_CUP_PREBENJAMIN: cups.prebenjamin };
  for (const name of GLOBALS) delete globalThis[name];
  for (const [name, value] of Object.entries(values)) if (!without.includes(name)) globalThis[name] = value;
}
// Una temporada archivada con la forma de data-season-<S>.js (const SEASON_<S>={name, benjamin, prebenjamin}).
const seasonFile = (name, { benjamin = [], prebenjamin = [] }) => `const SEASON_${name.replace('-', '_')}=${JSON.stringify({ name, benjamin, prebenjamin })};`;
const FILES = {
  'data-health.json': () => JSON.stringify(fixture('health')),
  'data-matchdetail.js': () => `const MATCH_DETAIL=${JSON.stringify(fixture('matchdetail'))};`,
  'data-lineups-2025-2026.js': () => `const LINEUPS_2025_2026=${JSON.stringify(fixture('lineups-2025-2026'))};`,
  'data-season-2024-2025.js': () => seasonFile('2024-2025', fixture('historical-2024-2025')),
};
globalThis.fetch = async (url) => {
  const body = FILES[String(url).replace(/^\.\//, '').replace(/\?.*$/, '')];
  return body ? { ok: true, status: 200, text: async () => body() } : { ok: false, status: 404, text: async () => '' };
};

// Una carga de la app: los datos de `season`, el día `today` (a mediodía en Canarias, inyectado en
// start() como el reloj: nada de temporizadores simulados, sin su ExperimentalWarning) y el almacén.
async function load(storage, { season = raw, portal = PORTAL_2526, today, hash = '#/', without = [], seasons }) {
  installData(season, { without, seasons });
  const page = fakeBrowser(hash, { storage });
  const router = start(page.doc, page.win, portal, { now: () => new Date(`${today}T12:00:00Z`) });
  if (router) await router.idle();
  return { page, router };
}
const stateOf = (page) => (page.main.innerHTML.match(/<section data-screen="home" data-state="([A-Z]|error)"/) || [])[1];
const saved = (storage) => JSON.parse(storage.get(STORE_KEY)).myTeam;

test('start: el cambio de fase se guarda al arrancar, antes del primer pintado (FF5 → A2)', async () => {
  const ff5 = { name: 'Las Mesas Hu.', season: '2025-2026', cat: 'benjamin', groupId: 'FF5' };
  const storage = new Map([[STORE_KEY, JSON.stringify({ myTeam: ff5, recent: [] })]]);
  const { page } = await load(storage, { season: currentAt('2026-03-01'), today: '2026-03-01' });
  assert.deepEqual(saved(storage), { ...ff5, groupId: 'A2' });
  assert.equal(stateOf(page), 'A');
  assert.match(page.main.innerHTML, /<h1>Las Mesas Hu\.<\/h1><p class="screen-sub">Benjamín, Segunda Fase A, Grupo 2<\/p>/);
});

test('§11, caso 3, por partes: el primer día PG2 en silencio y sin guardar; el segundo, la pregunta; su respuesta se guarda y se respeta', async () => {
  const storage = new Map([[STORE_KEY, JSON.stringify({ myTeam: PG2, recent: [] })]]);
  // Día 1: 2026/27 solo con el prebenjamín de Gran Canaria. El paso 1 da PG2 sin preguntar…
  let day = await load(storage, { season: nextSeasonRaw({ prebenjamin: ['PG2', 'PG3'] }), portal: PORTAL_2627, today: '2026-10-01' });
  assert.equal(stateOf(day.page), 'B');
  assert.match(day.page.main.innerHTML, /<p class="screen-sub">Prebenjamín, Grupo 2 de Gran Canaria<\/p>/);
  assert.deepEqual(saved(storage), PG2, '…y no lo guarda: no es una respuesta de la familia');
  // Día 2: llega el benjamín de Gran Canaria, con «Las Mesas Hu.» (A2) y «Las Mesas B» (B2): E.
  const both = nextSeasonRaw({ benjamin: ['A2', 'B2'], prebenjamin: ['PG2', 'PG3'] });
  day = await load(storage, { season: both, portal: PORTAL_2627, today: '2026-10-02' });
  assert.equal(stateOf(day.page), 'E');
  assert.equal((day.page.main.innerHTML.match(/data-action="elegir"/g) || []).length, 3);
  // La respuesta (el botón llama a nav.saveMyTeam) se guarda y la portada se vuelve a pintar.
  const answer = { name: 'Las Mesas Hu.', season: '2026-2027', cat: 'benjamin', groupId: 'A2' };
  day.router.nav.saveMyTeam(answer);
  await day.router.idle();
  assert.deepEqual(saved(storage), answer);
  assert.equal(stateOf(day.page), 'B');
  assert.match(day.page.main.innerHTML, /<p class="screen-sub">Benjamín, Segunda Fase A, Grupo 2<\/p>/);
  // Día 3: la carga siguiente respeta la respuesta, sin preguntar.
  day = await load(storage, { season: both, portal: PORTAL_2627, today: '2026-10-03' });
  assert.equal(stateOf(day.page), 'B');
  assert.match(day.page.main.innerHTML, /<p class="screen-sub">Benjamín, Segunda Fase A, Grupo 2<\/p>/);
  assert.deepEqual(saved(storage), answer);
});

test('sin un dato inmediato de la temporada, la caja de error con «Reintentar», que recarga; nunca X ni B falsos (M4)', async () => {
  for (const missing of ['BENJAMIN', 'PREBENJAMIN', 'HISTORY']) {
    const storage = new Map();
    const { page, router } = await load(storage, { today: '2026-03-01', without: [missing] });
    assert.equal(router, null, `${missing}: el router no arranca`);
    assert.equal(stateOf(page), 'error', missing);
    assert.match(page.main.innerHTML, /<h1>Mi equipo<\/h1>/);
    assert.match(page.main.innerHTML, /No se pudieron cargar los datos de la temporada 2025\/26\./);
    assert.doesNotMatch(page.main.innerHTML, /no aparece|Aún no se ha jugado/);
    assert.equal(storage.size, 0, 'no resuelve ni guarda mi equipo');
    assert.match(page.main.innerHTML, /data-action="retry"/, `${missing}: el botón «Reintentar» existe de verdad`);
    page.click({ 'data-action': 'retry', type: 'button' }, 'button');
    assert.deepEqual(page.reloads, [true], `${missing}: «Reintentar» recarga la página`);
  }
});

test('sin los datos inmediatos, la caja de error actualiza también la barra y el título de la ruta pedida (M4)', async () => {
  const { page } = await load(new Map(), { today: '2026-03-01', hash: '#/tabla', without: ['BENJAMIN'] });
  assert.deepEqual(page.marks(), [['#/tabla', 'page']], 'la barra marca Tabla, no Mi equipo');
  assert.equal(page.doc.title, 'Tabla · Fútbol Base Las Palmas');
});

test('un dato mal formado que hace fallar el guardado al arrancar no impide que el router arranque (registra y no guarda)', async (t) => {
  const errorSpy = t.mock.method(console, 'error');
  // Una fila de HISTORY con menos columnas de las que acepta rowToMatch (5, 6, 8 o 9): buildSeason
  // lanza un RangeError la primera vez que getContext() construye la temporada del portal, que es
  // justo lo que hace el guardado al arrancar (src/app.js) antes de que exista el router.
  const broken = structuredClone(raw);
  const groupId = broken.benjamin[0].id;
  const roundKey = Object.keys(broken.history[groupId])[0];
  broken.history[groupId][roundKey][0] = broken.history[groupId][roundKey][0].slice(0, 3);
  const storage = new Map();
  const { page, router } = await load(storage, { season: broken, today: '2026-03-01' });
  assert.ok(router, 'el router arranca igual, aunque el guardado al arrancar haya fallado');
  assert.equal(storage.size, 0, 'no guarda nada: el fallo se registra, no se guarda a medias');
  assert.equal(stateOf(page), 'error', 'el mismo fallo vuelve a aparecer al pintar, y el router enseña su caja de error');
  const logged = errorSpy.mock.calls.some((call) => String(call.arguments[0]).includes('[app] guardado al arrancar'));
  assert.ok(logged, 'registra el fallo del guardado al arrancar con console.error');
});

test('el router deja pasar lo que las pantallas saben leer: la jornada por su número y el único partido h–a (B7)', async (t) => {
  // Con las pantallas reales, el mount() de Jornada y Partido corre de verdad: un error ahí no
  // debe quedar escondido dentro de la guarda del router (hallazgo de la revisión, ronda 1).
  const errorSpy = t.mock.method(console, 'error');
  const open = async (hash) => {
    const { page } = await load(new Map(), { today: '2026-03-01', hash });
    return page;
  };
  let page = await open('#/jornada?g=PG2&r=30');
  assert.equal(page.hash(), '#/jornada?g=PG2&r=30', 'sin redirección');
  assert.match(page.main.innerHTML, /<h2 class="round-title">Jornada 30 de 30<\/h2>/);
  page = await open('#/partido?g=PG2&r=30&h=Las%20Mesas%20Hu.&a=AD%20Hurac%C3%A1n');
  assert.equal(page.hash(), '#/partido?g=PG2&r=30&h=Las%20Mesas%20Hu.&a=AD%20Hurac%C3%A1n');
  assert.match(page.main.innerHTML, /<h1>Partido<span class="vh">: Las Mesas Hu\. – AD Huracán<\/span><\/h1>/);
  // Otra jornada, pero un único Huracán–Las Mesas en el grupo: el 8–1 de la jornada 15.
  page = await open('#/partido?g=PG2&r=Jornada%2099&h=AD%20Hurac%C3%A1n&a=Las%20Mesas%20Hu.');
  assert.match(page.main.innerHTML, /<h1>Partido<span class="vh">: AD Huracán – Las Mesas Hu\.<\/span><\/h1>/);
  assert.match(page.main.innerHTML, /<p class="screen-sub">Jornada 15 · Prebenjamín, Grupo 2 de Gran Canaria<\/p>/);
  const mountErrors = errorSpy.mock.calls.filter((call) => String(call.arguments[0]).includes('[router] mount'));
  assert.deepEqual(mountErrors, [], 'el mount de las pantallas reales no debe lanzar (con las pantallas reales)');
});

// Las temporadas que publica SEASONS cuando hay archivo: la actual y 2024/25.
const WITH_PAST = [{ name: '2025-2026', current: true }, { name: '2024-2025', current: false }];

test('temporada pasada que la pantalla no pide (Equipo): la carga el router y la pinta, nunca la caja de error (I4(a)); la ficha va a «Vistos hace poco»', async (t) => {
  const errorSpy = t.mock.method(console, 'error');
  const hash = '#/equipo?s=2024-2025&g=PGC2&t=Las%20Mesas%20Hu.';
  const storage = new Map();
  const { page } = await load(storage, { today: '2026-03-01', hash, seasons: WITH_PAST });
  assert.equal(page.hash(), hash, 'sin redirección');
  assert.match(page.main.innerHTML, /^<section data-screen="equipo" data-state="D">/);
  assert.match(page.main.innerHTML, /<h1>Las Mesas Hu\.<\/h1><p class="screen-sub">Temporada 2024\/25 terminada<\/p>/);
  assert.doesNotMatch(page.main.innerHTML, /No se pudieron cargar/);
  // El mount de verdad la apunta en el almacén (decisión 5 de B3), con el equipo por defecto.
  assert.deepEqual(JSON.parse(storage.get(STORE_KEY)).recent, [{ s: '2024-2025', g: 'PGC2', t: 'Las Mesas Hu.' }]);
  // El enlace de la revisión (A1, que la temporada 2024/25 de las fixtures no tiene): cargada la
  // temporada, el grupo se valida y lleva a Explorar con su aviso, tampoco a la caja de error.
  const other = await load(new Map(), { today: '2026-03-01', hash: '#/equipo?s=2024-2025&g=A1&t=Guayarmina', seasons: WITH_PAST });
  assert.equal(other.page.hash(), '#/explorar?s=2024-2025&q=Guayarmina');
  assert.match(other.page.main.innerHTML, /No encontramos el grupo A1 en la temporada 2024\/25/);
  assert.deepEqual(errorSpy.mock.calls.map((call) => String(call.arguments[0])), [], 'ni el router ni la carga registran errores');
});

test('si falla la carga de esa temporada: la caja de error, y «Reintentar» pinta la pantalla al volver la red (I4(a))', async (t) => {
  // La carga fallida y la caja de error se registran con console.error: aquí se esperan.
  t.mock.method(console, 'error', () => {});
  const hash = '#/equipo?s=2023-2024&g=PGC9&t=Las%20Mesas%20Hu.';
  const seasons = [...WITH_PAST, { name: '2023-2024', current: false }];
  const { page, router } = await load(new Map(), { today: '2026-03-01', hash, seasons });
  assert.match(page.main.innerHTML, /^<section data-screen="equipo" data-state="error">/);
  assert.match(page.main.innerHTML, /No se pudieron cargar los datos de la temporada 2023\/24\./);
  assert.match(page.main.innerHTML, /data-action="retry"/);
  // Vuelve la red: el fichero ya llega (una temporada mínima, con el grupo del enlace).
  FILES['data-season-2023-2024.js'] = () => seasonFile('2023-2024', {
    prebenjamin: [{ id: 'PGC9', name: 'Grupo 9', phase: 'Gran Canaria', island: 'grancanaria', standings: [[1, 'Las Mesas Hu.', 0, 0, 0, 0, 0, 0, 0, 0]], jornadas: {} }],
  });
  try {
    // El «Reintentar» de la caja: lo atiende el router, que vuelve a pedir la temporada.
    assert.equal(page.click({ 'data-action': 'retry', type: 'button' }, 'button'), true);
    await router.idle();
    assert.equal(page.hash(), hash);
    assert.match(page.main.innerHTML, /^<section data-screen="equipo" data-state="D">/);
    assert.match(page.main.innerHTML, /<h1>Las Mesas Hu\.<\/h1>/);
  } finally {
    delete FILES['data-season-2023-2024.js'];
  }
});

test('aviso sin conexión en vivo: aparece al arrancar sin conexión, se va con online y vuelve con offline', async () => {
  installData(raw, {});
  const page = fakeBrowser('#/', { storage: new Map() });
  page.win.navigator.onLine = false;
  const router = start(page.doc, page.win, PORTAL_2526);
  await router.idle();
  const slot = () => page.doc.querySelector('.shell-offline').innerHTML;
  assert.match(slot(), /Sin conexión\.<\/b> Datos del 23\/09\/2026/, 'arranca sin conexión: el aviso aparece con la fecha');
  page.setOnline(true);
  assert.equal(slot(), '', 'con conexión: el aviso se vacía');
  page.setOnline(false);
  assert.match(slot(), /Sin conexión\.<\/b> Datos del 23\/09\/2026/, 'sin conexión otra vez: el aviso vuelve, con la fecha correcta');
});

// app.js es el punto de entrada: start(doc, win) lo llama index.html. Además de su conducta (arriba),
// el orden de su cableado con el navegador se comprueba en el código; en el navegador, en el paso 6
// y en la Tarea 13.
const APP = readFileSync(join(ROOT, 'src/app.js'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
const routerStart = APP.indexOf('startRouter({');

test('app.js: crestFallback en captura y mi equipo guardado, los dos antes del primer pintado', () => {
  const crest = APP.search(/doc\.addEventListener\(\s*'error',[^;]*crestFallback\([^;]*,\s*true\s*\)/);
  assert.ok(crest >= 0, 'falta el manejador de errores de imagen en captura');
  const save = APP.search(/myTeamToSave\(store\.myTeam,/);
  assert.ok(save >= 0, 'falta guardar mi equipo al arrancar');
  assert.ok(routerStart > crest && routerStart > save, 'los dos van antes de startRouter');
});

// El aviso sin conexión en vivo (online/offline y offlineNotice) ya se comprueba por conducta,
// arriba: aquí solo lo que esa prueba no puede ver desde fuera (sesión y la forma de saveMyTeam).
test('app.js: sesión y «Hacer mi equipo» con saveStore', () => {
  assert.match(APP, /session: safeStorage\(\(\) => win\.sessionStorage\)/);
  assert.match(APP, /saveMyTeam\(myTeam\) \{\s*store = \{ \.\.\.store, myTeam \};\s*return saveStore\(storage, store\);/);
});
// ── Plan B3, tarea 1: paso 0 del router, vistos hace poco y «Borrar datos» con start() ──

test('paso 0 de B3: una temporada que se lee pero está mal formada da la caja de error con «Reintentar», nunca el esqueleto', async (t) => {
  // El dato roto y la caja de error se registran con console.error: aquí se esperan.
  t.mock.method(console, 'error', () => {});
  const hash = '#/partido?s=2021-2022&g=PGC9&r=1&h=A&a=B';
  const seasons = [...WITH_PAST, { name: '2021-2022', current: false }];
  // const SEASON_2021_2022={…}; se parsea, pero `benjamin` no es un array: buildSeason lanza al construirla,
  // al validar la ruta y otra vez al calcular el «‹» de la caja (parentOf de Partido → findGroup).
  FILES['data-season-2021-2022.js'] = () => seasonFile('2021-2022', { benjamin: { roto: true } });
  try {
    const { page, router } = await load(new Map(), { today: '2026-03-01', hash, seasons });
    assert.equal(page.hash(), hash);
    assert.match(page.main.innerHTML, /^<section data-screen="partido" data-state="error">/);
    assert.match(page.main.innerHTML, /<h1>Partido<\/h1>/);
    assert.match(page.main.innerHTML, /No se pudieron cargar los datos de esta pantalla\./);
    assert.match(page.main.innerHTML, /<button class="button is-main" type="button" data-action="retry">Reintentar<\/button>/);
    assert.doesNotMatch(page.main.innerHTML, /data-skeleton/);
    // El «‹», sin el modelo que lanza: la jornada del enlace.
    assert.match(page.main.innerHTML, /<a class="back" href="#\/jornada\?s=2021-2022&amp;g=PGC9&amp;r=1" data-action="back"/);
    // «Reintentar» vuelve a pintar la caja (el dato sigue roto) y termina.
    assert.equal(page.click({ 'data-action': 'retry', type: 'button' }, 'button'), true);
    await router.idle();
    assert.match(page.main.innerHTML, /^<section data-screen="partido" data-state="error">/);
  } finally {
    delete FILES['data-season-2021-2022.js'];
  }
});

test('ctx.recent sale del almacén en startContext, en ctxFor y en start(); nav.addRecent lo guarda sin volver a pintar y sobrevive a la recarga (decisión 5 de B3)', async (t) => {
  const seen = [{ s: '2025-2026', g: 'PG2', t: 'AD Huracán' }];
  // startContext, la base de ctxFor: los del almacén, saneados.
  const dirty = memoryStorage(new Map([[STORE_KEY, JSON.stringify({ myTeam: PG2, recent: [...seen, { g: 'PG3' }] })]]));
  assert.deepEqual(startContext({ storage: dirty, portal: PORTAL_2526, datasets: datasetsFor(), today: '2026-03-01' }).recent, seen);
  assert.deepEqual(ctxFor('explorar', { s: '2025-2026' }, { recent: seen }).recent, seen);
  assert.deepEqual(ctxFor('explorar', { s: '2025-2026' }).recent, []);
  // start(): el ctx de cada pintado.
  const render = t.mock.method(home, 'render');
  const lastCtx = () => render.mock.calls.at(-1).arguments[0];
  const storage = new Map([[STORE_KEY, JSON.stringify({ myTeam: PG2, recent: seen })]]);
  const { router } = await load(storage, { today: '2026-03-01' });
  assert.deepEqual(lastCtx().recent, seen);
  const paints = render.mock.callCount();
  const acodetti = { s: '2025-2026', g: 'PG2', t: 'Acodetti' };
  assert.equal(router.nav.addRecent(acodetti), true, 'guardado en el almacén');
  await router.idle();
  assert.equal(render.mock.callCount(), paints, 'sin volver a pintar');
  assert.deepEqual(JSON.parse(storage.get(STORE_KEY)), { myTeam: PG2, recent: [acodetti, ...seen] });
  router.nav.retry();
  await router.idle();
  assert.deepEqual(lastCtx().recent, [acodetti, ...seen], 'el pintado siguiente ya lo trae, de memoria');
  await load(storage, { today: '2026-03-01' });
  assert.deepEqual(lastCtx().recent, [acodetti, ...seen], 'y tras recargar, del almacén');
});

test('«Borrar datos»: nav.clearData borra v2, v1, las claves antiguas y el destino de la sesión, y abre Mi equipo con el equipo por defecto; la recarga no vuelve a migrar (decisión 6 de B3)', async (t) => {
  const huracan = { name: 'AD Huracán', season: '2025-2026', cat: 'prebenjamin', groupId: 'PG2' };
  const v1 = { teams: [{ name: 'AD Huracán', cat: 'prebenjamin', groupId: 'PG2' }], selected: 'prebenjamin|PG2|huracan' };
  const storage = new Map([
    [STORE_KEY, JSON.stringify({ myTeam: huracan, recent: [{ s: '2025-2026', g: 'PG2', t: 'Acodetti' }] })],
    [LEGACY_KEY, JSON.stringify(v1)], ['season', '2025-2026'], ['cat', 'prebenjamin'], ['theme', 'light'],
  ]);
  const { page, router } = await load(storage, { today: '2026-03-01' });
  assert.match(page.main.innerHTML, /<h1>AD Huracán<\/h1>/);
  page.click({ href: '#/tabla' });
  await router.idle();
  assert.equal(page.win.sessionStorage.getItem('futbol-base:destino'), 'tabla');
  page.click({ href: '#/ajustes' });
  await router.idle();
  const removed = t.mock.method(page.win.sessionStorage, 'removeItem');
  await router.nav.clearData();
  assert.equal(storage.size, 0, 'ni v2, ni v1, ni season, cat y theme');
  assert.deepEqual(removed.mock.calls.map((call) => call.arguments[0]), ['futbol-base:destino']);
  assert.deepEqual(page.entries(), ['#/', '#/tabla', '#/ajustes', '#/']);
  assert.match(page.main.innerHTML, /<h1>Las Mesas Hu\.<\/h1>/, 'Mi equipo, con el equipo por defecto');
  // Al recargar: el equipo por defecto, sin migrar otra vez la clave v1 (ya no está) ni escribir nada.
  const again = await load(storage, { today: '2026-03-01' });
  assert.match(again.page.main.innerHTML, /<h1>Las Mesas Hu\.<\/h1>/);
  assert.equal(storage.size, 0);
});
