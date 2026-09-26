// Plan B2, tarea 2: state.js prepara el corte sin romper la app vieja.
// - shieldFile: el fichero de escudo exacto o normalizado, nunca por subcadena; lo usan ui.js
//   (crest) y myteam.js (buildClubIndex), que antes repetían la búsqueda (M7 de B1).
// - dataVersion(): la ?v= de <script src="data-seasons.js">, en todas las peticiones perezosas.
// - Tiempo límite: una petición perezosa que no responde se corta a los 15 s (fetchData).
// - readGlobals() y ensureHealth().
// El navegador se simula: un document con los <script> de datos y un fetch que anota las URLs.
import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { fixture } from './fixtures/rediseno/load.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const read = (path) => readFileSync(join(ROOT, path), 'utf8');

// El <script> de data-seasons.js lleva la versión de los datos; el de data-benjamin.js, otra, para
// comprobar que solo manda la de data-seasons.js (la app anterior la tomaba de data-matchdetail-keys.js,
// que B4 retiró).
const scripts = {
  'data-seasons.js': './data-seasons.js?v=20260923j',
  'data-benjamin.js': './data-benjamin.js?v=VIEJA',
};
globalThis.document = {
  querySelector(selector) {
    const m = String(selector).match(/^script\[src\*="([^"]+)"\]$/);
    const src = m ? scripts[m[1]] : undefined;
    return src ? { src: 'http://127.0.0.1:8000/' + src.slice(2), getAttribute: (name) => (name === 'src' ? src : null) } : null;
  },
  querySelectorAll: () => [],
  addEventListener() {},
};
const requests = [];
const bodies = {
  'data-matchdetail.js': 'const MATCH_DETAIL={"a|b|1-0":{"s":"2025-2026","gr":"PG2","g":[]}};',
  'data-season-2024-2025.js': 'const SEASON_2024_2025={"name":"2024-2025","current":false,"benjamin":[],"prebenjamin":[]};',
  'data-season-2023-2024.js': 'const SEASON_2023_2024={"name":"2023-2024","current":false,"benjamin":[],"prebenjamin":[]};',
  'data-lineups-2025-2026.js': 'const LINEUPS_2025_2026={};',
  'data-health.json': null,   // cada prueba de ensureHealth decide
};
globalThis.fetch = async (url) => {
  requests.push(String(url));
  const body = bodies[String(url).replace(/^\.\//, '').replace(/\?.*$/, '')];
  return body == null
    ? { ok: false, status: 404, text: async () => '' }
    : { ok: true, status: 200, text: async () => body };
};

const state = await import('../../src/state.js');

test('dataVersion: la ?v= del <script> de data-seasons.js, o "" si no está', () => {
  assert.equal(state.dataVersion(), '20260923j');
  const saved = scripts['data-seasons.js'];
  delete scripts['data-seasons.js'];
  try {
    assert.equal(state.dataVersion(), '');
  } finally {
    scripts['data-seasons.js'] = saved;
  }
});

test('nada espera para siempre: cada petición perezosa se corta a los 15 s y la carga falla (null) sin memorizarse', async (t) => {
  assert.equal(state.LAZY_TIMEOUT_MS, 15000, 'el tiempo límite de las peticiones perezosas');
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const saved = globalThis.fetch;
  const hung = [];
  // Un servidor que no responde nunca: la promesa solo termina si la petición se aborta.
  globalThis.fetch = (url, { signal } = {}) => new Promise((resolve, reject) => {
    hung.push(String(url));
    signal?.addEventListener('abort', () => reject(Object.assign(new Error('abortada'), { name: 'AbortError' })));
  });
  const quiet = { error: console.error, warn: console.warn };
  console.error = () => {};
  console.warn = () => {};
  try {
    const loads = [state.ensureMatchDetail(), state.ensureSeasonData('2022-2023'), state.ensureLineups('2023-2024'),
      state.ensureHealth()];
    assert.equal(hung.length, 4, hung.join(', '));
    t.mock.timers.tick(state.LAZY_TIMEOUT_MS - 1);
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(hung.length, 4, 'todavía en vuelo');
    t.mock.timers.tick(1);
    assert.deepEqual(await Promise.all(loads), [null, null, null, null]);
  } finally {
    globalThis.fetch = saved;
    console.error = quiet.error;
    console.warn = quiet.warn;
  }
});

test('ensureHealth: null si falla, un solo vuelo al reintentar, memoria y la versión de los datos', async () => {
  requests.length = 0;
  bodies['data-health.json'] = null;
  assert.equal(await state.ensureHealth(), null, 'un fallo no lanza: null');
  bodies['data-health.json'] = JSON.stringify(fixture('health'));
  const [a, b] = await Promise.all([state.ensureHealth(), state.ensureHealth()]);
  assert.equal(a, b, 'las dos llamadas comparten el vuelo');
  assert.equal(a.nextSeason.status, 'pending');
  assert.equal(await state.ensureHealth(), a, 'cargado una vez, no se vuelve a pedir');
  assert.deepEqual(requests, ['./data-health.json?v=20260923j', './data-health.json?v=20260923j']);
});

test('cada petición perezosa lleva la versión de data-seasons.js, nunca la de otro <script> de datos', async () => {
  requests.length = 0;
  assert.ok(await state.ensureMatchDetail());
  assert.ok(await state.ensureSeasonData('2024-2025'));
  assert.ok(await state.ensureLineups('2025-2026'));
  assert.deepEqual(requests.map((url) => url.replace(/\?.*$/, '')), [
    './data-matchdetail.js', './data-season-2024-2025.js', './data-lineups-2025-2026.js',
  ]);
  for (const url of requests) assert.match(url, /\?v=20260923j$/, url);
});

test('sin el <script> de data-seasons.js, las peticiones van sin ?v=', async () => {
  const saved = scripts['data-seasons.js'];
  delete scripts['data-seasons.js'];
  requests.length = 0;
  try {
    assert.ok(await state.ensureSeasonData('2023-2024'));
  } finally {
    scripts['data-seasons.js'] = saved;
  }
  assert.deepEqual(requests, ['./data-season-2023-2024.js']);
});

test('todas las peticiones perezosas pasan por fetchData(): la versión de los datos y el tiempo límite', () => {
  const src = read('src/state.js');
  assert.equal((src.match(/\bfetch\(/g) || []).length, 1, 'un solo fetch en state.js, el de fetchData');
  assert.match(src, /await fetch\(`\.\/\$\{file\}\$\{dataQuery\(\)\}`, \{ signal: controller\.signal \}\)/);
  const loaders = src.match(/await fetchData\(/g) || [];
  assert.equal(loaders.length, 4, 'matchdetail, temporadas, actas y data-health');
  assert.doesNotMatch(src, /data-matchdetail-keys\.js"\]/, 'la versión ya no sale de data-matchdetail-keys.js');
});

test('readGlobals: los nueve globales inmediatos con typeof, null si falta', () => {
  const KEYS = { benjamin: 'BENJAMIN', prebenjamin: 'PREBENJAMIN', history: 'HISTORY', golBenj: 'GOL_BENJ',
    golPrebenj: 'GOL_PREBENJ', shields: 'SHIELDS', seasons: 'SEASONS', cupBenjamin: 'MASPALOMAS_CUP_BENJAMIN',
    cupPrebenjamin: 'MASPALOMAS_CUP_PREBENJAMIN' };
  assert.deepEqual(state.readGlobals(), Object.fromEntries(Object.keys(KEYS).map((key) => [key, null])));
  const cur = fixture('current-2025-2026');
  const cups = fixture('cups-2025-2026');
  const values = { BENJAMIN: cur.benjamin, PREBENJAMIN: cur.prebenjamin, HISTORY: cur.history, GOL_BENJ: [],
    GOL_PREBENJ: [], SHIELDS: fixture('shields'), SEASONS: [{ name: '2025-2026', current: true }],
    MASPALOMAS_CUP_BENJAMIN: cups.benjamin, MASPALOMAS_CUP_PREBENJAMIN: cups.prebenjamin };
  // Las propiedades del objeto global se ven como identificadores desnudos, igual que los
  // `const` de los data-*.js en el navegador.
  Object.assign(globalThis, values);
  try {
    const got = state.readGlobals();
    for (const [key, name] of Object.entries(KEYS)) assert.equal(got[key], values[name], key);
  } finally {
    for (const name of Object.keys(values)) delete globalThis[name];
  }
  const src = read('src/state.js');
  for (const name of Object.values(KEYS)) {
    assert.match(src, new RegExp(`typeof ${name} !== 'undefined' \\? ${name} : null`), name);
  }
});

test('shieldFile: exacto o normalizado, nunca por subcadena', () => {
  const shields = fixture('shields');
  assert.equal(state.shieldFile('Las Mesas Hu.', shields), 'lasMesasEscudo.png');
  assert.equal(state.shieldFile('MESAS, U.D. LAS "B"', shields), 'lasMesasEscudo.png');
  assert.equal(state.shieldFile('Telde', shields), 'udTeldeEscudo.png', 'normalizado: «UD Telde»');
  assert.equal(state.shieldFile('Acodetti', shields), 'acodetti.png', 'normalizado: «Acodetti CF»');
  // Por subcadena, «UD Las Mesas Huracán» se llevaría el escudo de AD Huracán.
  assert.equal(state.shieldFile('UD Las Mesas Huracán', shields), null);
  assert.equal(state.shieldFile('Las Mesas Hu. B', shields), null);
  assert.equal(state.shieldFile('', shields), null);
  assert.equal(state.shieldFile(null, shields), null);
  assert.equal(state.shieldFile('Las Mesas Hu.', null), null);
  assert.equal(state.shieldFile('Las Mesas Hu.', {}), null);
});

test('crest y buildClubIndex buscan el escudo con shieldFile: una sola búsqueda (M7)', async () => {
  for (const file of ['src/ui.js', 'src/myteam.js']) {
    const src = read(file);
    assert.match(src, /import \{[^}]*\bshieldFile\b[^}]*\} from '\.\/state\.js';/, file);
    assert.doesNotMatch(src, /\bnormalizeTeamName\b/, `${file} no normaliza por su cuenta`);
  }
  const { crest } = await import('../../src/ui.js');
  const { buildClubIndex } = await import('../../src/myteam.js');
  const shields = fixture('shields');
  assert.match(String(crest('Telde', { shields })), /data-full="\.\/escudos\/udTeldeEscudo\.png"/);
  assert.match(String(crest('UD Las Mesas Huracán', { shields })), /class="mono mono-16"/);
  // «Las Mesas Hu» (sin punto) solo llega al escudo de «Las Mesas Hu.» normalizando, y así se une a
  // 'MESAS, U.D. LAS "B"', con otra clave base; «UD Las Mesas Huracán» no hereda el de AD Huracán.
  const names = ['Las Mesas Hu', 'MESAS, U.D. LAS "B"', 'UD Las Mesas Huracán', 'AD Huracán'];
  const index = buildClubIndex(names, shields, {});
  assert.equal(index.same('Las Mesas Hu', 'MESAS, U.D. LAS "B"'), true);
  assert.equal(index.same('UD Las Mesas Huracán', 'AD Huracán'), false);
  assert.equal(buildClubIndex(names, {}, {}).same('Las Mesas Hu', 'MESAS, U.D. LAS "B"'), false, 'sin escudos no hay arista');
});

// ── Plan B2, tarea 4 (corte): decisiones 1 y 2 ──────────────────────────────

test('decisiones 1 y 2: state.js sin estado de interfaz, sin HTML y sin lo que ya cubre el modelo', () => {
  for (const gone of ['S', 'FEATURED', 'isFeatured', 'featuredStandingFrom', 'featuredMatchesFrom',
    'featuredScorersFrom', 'getTeamForm', 'isHistorical', 'getCurrentSeason', 'teamBadge', 'teamBadgeFallback',
    'handleBadgeError', 'installBadgeErrorDelegation', 'escapeHtml', 'escapeAttr', '$', '$$', 'el',
    'ACTIVATION_KEYS', 'makeActivatable', 'delegateActivation', 'buildUnifiedPrebenjamin', 'buildSparkline',
    // M5 de la revisión final de B2: las heredadas que nadie usaba en src/, index.html ni sw.js.
    'getData', 'withSeasonCup', 'countStats', 'getSeasonError', 'ensurePlayers', 'phaseIcon',
    'unifiedPrebenLeagueGroups', 'validJorGroup', 'jornadaLabel', 'groupJornadaLabel', 'knockoutRoundsSource',
    'getPhases']) {
    assert.equal(gone in state, false, `${gone} sigue en state.js`);
  }
  for (const kept of ['countMatches', 'groupScorers', 'teamScorers']) {
    assert.equal(typeof state[kept], 'function', kept);
  }
  assert.doesNotMatch(read('src/state.js'), /<(img|span|div|table|svg)\b/, 'state.js ya no pinta HTML');
});

// I2 de la revisión final de B2: groupScorers (Tabla y Goleadores) y teamScorers (Mi equipo), las
// dos aquí y con un solo orden; teamScorers es el filtro por equipo de groupScorers.
const GOL = [
  { id: 'PG1', g: 'PREBENJAMIN GC GRUPO 1', s: [['Otro, Grupo', 'Las Mesas Hu.', 30, 20]] },
  { id: 'PG2', g: 'PREBENJAMIN GC GRUPO 2', s: [
    ['Santana Santacruz, Agoney', 'Las Mesas Hu.', 11, 21], ['De La Rosa Perello, Theo', 'Las Mesas Hu.', 12, 17],
    ['Igual, Goles', 'Las Mesas Hu.', 11, 19], ['Filial, Uno', 'Las Mesas B', 20, 10], ['Rival, Uno', 'AD Huracán', 40, 20]] },
];

test('groupScorers(gol, groupId): los goleadores del grupo, de más a menos goles y, a igualdad, con menos partidos', () => {
  assert.deepEqual(state.groupScorers(GOL, 'PG2').map((r) => [r.name, r.team, r.goals, r.games]), [
    ['Rival, Uno', 'AD Huracán', 40, 20], ['Filial, Uno', 'Las Mesas B', 20, 10],
    ['De La Rosa Perello, Theo', 'Las Mesas Hu.', 12, 17], ['Igual, Goles', 'Las Mesas Hu.', 11, 19],
    ['Santana Santacruz, Agoney', 'Las Mesas Hu.', 11, 21],
  ]);
  assert.equal(state.groupScorers(GOL, 'PG9'), null, 'sin el grupo en la fuente, null');
  assert.equal(state.groupScorers(null, 'PG2'), null);
  assert.deepEqual(state.groupScorers([{ id: 'X', s: [] }], 'X'), []);
  assert.deepEqual(state.groupScorers([{ id: 'X' }], 'X'), [], 'sin lista, ninguno');
});

test('decisión 2: teamScorers(gol, team), los goleadores del equipo en su grupo, por goles y partidos', () => {
  const team = { cat: 'prebenjamin', groupId: 'PG2', name: 'Las Mesas Hu.' };
  assert.deepEqual(state.teamScorers(GOL, team), [
    { name: 'De La Rosa Perello, Theo', goals: 12, games: 17 },
    { name: 'Igual, Goles', goals: 11, games: 19 },
    { name: 'Santana Santacruz, Agoney', goals: 11, games: 21 },
  ]);
  // El grupo se busca solo por su código (id): el respaldo por la clave de texto de los ficheros
  // antiguos se fue, porque todas las entradas publicadas llevan id (I2 de la revisión final).
  assert.deepEqual(state.teamScorers(GOL.map(({ g, s }) => ({ g, s })), team), []);
  assert.deepEqual(state.teamScorers(GOL, { ...team, groupId: 'PG9' }), []);
  assert.deepEqual(state.teamScorers(undefined, team), []);
  assert.deepEqual(state.teamScorers(GOL, null), []);
});
