// Alevín en la web (contrato común de alevín; r3.md §6 con las correcciones de critic.md): la tercera
// categoría, de Gran Canaria, en un fichero perezoso (data-alevin.js; data-season-<S>-alevin.js en las
// temporadas pasadas) que nunca entra en la carga inicial.
// - model.js: CATEGORIES con alevín al final, la categoría de un grupo sin `cat`, la Copa de Campeones
//   alevín, la Segunda Fase con cualquier letra (la F de 2026-27) y las Eliminatorias como copa; la
//   temporada (y el índice de clubes) se reconstruyen cuando llega el alevín, con sus goleadores, sus
//   estados y sus equipaciones.
// - state.js: ensureAlevin y ensureSeasonAlevin (un vuelo, 404 = sin alevín, fallo = null reintentable)
//   y alevinNeeds, la carga que pide el router.
// - router.js: `c=alevin` vale; un grupo que no está se busca en el alevín antes de darlo por perdido;
//   Explorar y Ligas sin `c` lo esperan y, si falla, se pintan con un aviso y «Reintentar»; si la ruta
//   lo pide, la caja de error «No se pudieron cargar los datos de alevín», nunca el falso «No
//   encontramos el grupo».
// - store.js y myteam.js: mi equipo alevín se guarda y se resuelve; la v1 sigue con dos categorías.
// - start() de verdad: Tabla de AL1 en frío, Explorar con alevín y mi equipo alevín tras recargar.
import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { fixture } from './fixtures/rediseno/load.mjs';
import { fakeBrowser, memoryStorage } from './fixtures/rediseno/fake-browser.mjs';
import { ctxFor, datasetsFor, PORTAL_SEASON, DEFAULT_TEAM } from './fixtures/rediseno/screens.mjs';
import { alevinRaw, pastAlevinRaw, dataFile, archive } from './fixtures/rediseno/simulate.mjs';
import {
  CATEGORIES, CAT_NAMES, CAT_WORDS, CAT_SHORT, buildSeason, competitionKey, competitions, createModel, groupLabel, phaseLevel,
} from '../../src/model.js';
import { buildClubIndex, defaultCategory, resolveMyTeam, teamTrajectory } from '../../src/myteam.js';
import { isCupGroup, alevinData, alevinNeeds, ensureAlevin, ensureSeasonAlevin } from '../../src/state.js';
import { loadStore, migrateV1, STORE_KEY } from '../../src/store.js';
import { parseRoute, routeHref } from '../../src/links.js';
import { resolveParams, needsAlevin, startRouter } from '../../src/router.js';
import { SCREEN_MAP } from '../../src/screens.js';
import { previousPanelContent } from '../../src/screen-partido.js';
import { trajectoryContent } from '../../src/team-extras.js';
import { start, startContext } from '../../src/app.js';

// El alevín de la temporada del portal de las fixtures (2025-26, el 24/09/2026: terminado).
const ALEV = alevinRaw({ season: PORTAL_SEASON, today: '2026-09-24' });
const loaded = () => alevinData(ALEV);
// El registro de datos con el alevín sin pedir (lo de app.js) o ya cargado.
const pending = (extra = {}) => ({ ...datasetsFor(), alevin: undefined, seasonAlevin: {}, ...extra });
const withAlevin = (extra = {}) => ({ ...datasetsFor(), alevin: loaded(), seasonAlevin: {}, ...extra });
const MESAS_AL1 = { name: 'Las Mesas Hu.', season: PORTAL_SEASON, cat: 'alevin', groupId: 'AL1' };

// ── model.js ─────────────────────────────────────────────────────────────

test('CATEGORIES y sus nombres: alevín al final, sin cambiar el orden ni los nombres de las otras dos', () => {
  assert.deepEqual(CATEGORIES, ['benjamin', 'prebenjamin', 'alevin']);
  assert.equal(CAT_NAMES.alevin, 'Alevín');
  assert.equal(CAT_WORDS.alevin, 'alevín');
  assert.equal(CAT_SHORT.alevin, 'alev.');
});

test('la categoría de un grupo sin `cat` sale de su fullName, también alevín (groupLabel de las fichas de jugador)', () => {
  const raw = { season: '2026-2027', fullName: 'ALEVIN PRIMERA FASE GC - GRUPO 3', phase: 'Primera Fase GC', island: 'grancanaria', name: 'Grupo 3' };
  assert.equal(groupLabel(raw), 'Alevín, Primera Fase, Grupo 3');
  assert.equal(groupLabel({ ...raw, fullName: '', cat: 'alevin' }), 'Alevín, Primera Fase, Grupo 3');
  assert.equal(competitionKey(raw, '2026-2027').cat, 'alevin');
  assert.equal(groupLabel({ ...raw, fullName: 'PREBENJAMIN PRIMERA FASE GC - GRUPO 3', phase: 'Gran Canaria' }), 'Prebenjamín, Grupo 3 de Gran Canaria');
  assert.equal(groupLabel({ ...raw, fullName: 'BENJAMIN PRIMERA FASE GC - GRUPO 3' }), 'Benjamín, Primera Fase, Grupo 3');
  assert.equal(groupLabel({ ...raw, fullName: '', cat: 'cadete' }), 'Primera Fase, Grupo 3', 'una categoría que no es de la app');
});

test('la Copa de Campeones alevín es la Copa de Campeones (con la letra de su fase, como la de benjamín de 2024-25)', () => {
  const ck = (phase) => competitionKey({ id: 'ALCCA1', phase, island: 'grancanaria', cat: 'alevin' }, '2024-2025');
  assert.deepEqual([ck('Copa Campeones Alevin A').cup, ck('Copa Campeones Alevin A').key, ck('Copa Campeones Alevin A').label],
    ['campeones', 'copa-campeones', 'Copa de Campeones']);
  assert.equal(ck('Copa de Campeones Alevín').key, 'copa-campeones');
  assert.equal(groupLabel({ id: 'ALCCB1', season: '2024-2025', phase: 'Copa Campeones Alevin B', island: 'grancanaria', cat: 'alevin', name: 'Grupo 1' }),
    'Alevín, Copa de Campeones, Fase B');
});

test('Segunda Fase con cualquier letra: la F (y la Z) es su propia fase, de nivel 2, después de la E; «Segunda Fase GC» sigue sin letra', () => {
  const raw = (id, phase) => ({ id, name: 'Grupo 1', fullName: `BENJAMIN ${phase.toUpperCase()} - GRUPO 1`, phase, island: 'grancanaria', standings: [] });
  const season = buildSeason({ name: '2026-2027', current: true, history: {}, benjamin: [
    raw('F1', 'Segunda Fase F'), raw('A1', 'Segunda Fase A'), raw('Z1', 'Segunda Fase Z'), raw('E1', 'Segunda Fase E'), raw('FF1', 'Primera Fase GC'),
  ] });
  const byId = (id) => season.groups.find((g) => g.id === id);
  assert.deepEqual(['F1', 'Z1'].map((id) => [byId(id).compKey, byId(id).label, phaseLevel(byId(id))]),
    [['segunda-f', 'Benjamín, Segunda Fase F, Grupo 1', 2], ['segunda-z', 'Benjamín, Segunda Fase Z, Grupo 1', 2]]);
  assert.equal(phaseLevel(byId('FF1')), 1);
  const model = { season: () => season, cups: () => null };
  assert.deepEqual(competitions(model, '2026-2027').map((c) => c.key), ['segunda-a', 'segunda-e', 'segunda-f', 'segunda-z', 'primera-fase']);
  assert.equal(competitionKey({ phase: 'Segunda Fase GC', island: 'grancanaria', cat: 'benjamin' }, '2023-2024').key, 'segunda-fase');
});

test('Eliminatorias (benjamín, prebenjamín o alevín): una copa, que se abre en la pantalla Copa', () => {
  for (const [id, cat] of [['EL1', 'benjamin'], ['PEL1', 'prebenjamin'], ['ALEL1', 'alevin']]) {
    const raw = { id, phase: 'Eliminatorias', island: 'grancanaria', cat, name: 'Grupo 1' };
    assert.equal(isCupGroup(raw), true, id);
    const ck = competitionKey(raw, '2026-2027');
    assert.deepEqual([ck.cup, ck.key, ck.label], ['eliminatorias', 'eliminatorias', 'Eliminatorias'], id);
  }
  assert.equal(isCupGroup({ id: 'EL1', phase: 'Eliminatorias determinar FASE' }), true);
  const past = pastAlevinRaw('2025-2026');
  const season = buildSeason({ name: '2025-2026', alevin: past.alevin });
  const el = season.groups.find((g) => g.id === 'ALEL1');
  assert.equal(el.kind, 'cup-bracket');
  assert.equal(el.cat, 'alevin');
  assert.deepEqual(el.rounds.map((r) => r.label), ['Semifinales', 'Final']);
  assert.equal(el.label, 'Alevín, Eliminatorias, Grupo 1');
  const model = { season: () => season, cups: () => null };
  assert.deepEqual(competitions(model, '2025-2026').map((c) => `${c.cat} ${c.kind} ${c.key}`),
    ['alevin liga segunda-a', 'alevin liga segunda-f', 'alevin copa eliminatorias']);
});

test('createModel: la temporada del portal se reconstruye cuando llega el alevín, y el índice de clubes con ella', () => {
  const datasets = pending();
  const model = createModel(datasets, { portalSeason: PORTAL_SEASON, buildClubIndex });
  const before = model.season(PORTAL_SEASON);
  const index = model.clubIndex();
  assert.equal(before.groups.some((g) => g.cat === 'alevin'), false);
  assert.deepEqual(model.scorers(PORTAL_SEASON, 'alevin'), []);
  datasets.alevin = loaded();
  const after = model.season(PORTAL_SEASON);
  assert.notEqual(after, before);
  assert.equal(model.season(PORTAL_SEASON), after, 'ya construida, la misma');
  const al1 = model.group(PORTAL_SEASON, 'AL1');
  assert.equal(al1.cat, 'alevin');
  assert.equal(al1.label, 'Alevín, Primera Fase, Grupo 1');
  assert.deepEqual(al1.rounds.map((r) => r.key), ['Jornada 1', 'Jornada 2', 'Jornada 3', 'Jornada 4', 'Jornada 5'], 'de HISTORY_ALEV');
  assert.equal(al1.standings[0].pj, 5);
  // Benjamín y prebenjamín, los mismos grupos que antes, en su orden.
  assert.deepEqual(after.groups.filter((g) => g.cat !== 'alevin').map((g) => g.id), before.groups.map((g) => g.id));
  assert.notEqual(model.clubIndex(), index, 'el índice de clubes se rehace con los equipos de alevín');
  assert.equal(model.clubIndex(), model.clubIndex());
  assert.equal(model.scorers(PORTAL_SEASON, 'alevin'), datasets.alevin.gol);
});

test('createModel: estados y equipaciones de alevín (ESTADOS_ALEV y EQUIPOS_ALEV), y la temporada pasada con su data-season-<S>-alevin.js', () => {
  const datasets = withAlevin({ equipos: { 'Las Mesas Hu.': ['ROJA', 'NEGRO', 'ROJAS', 'CAMPO PREBENJAMÍN', null, null] } });
  const model = createModel(datasets, { portalSeason: PORTAL_SEASON, buildClubIndex });
  const al1 = model.group(PORTAL_SEASON, 'AL1');
  const aplazado = al1.rounds.find((r) => r.key === 'Jornada 4').matches[0];
  assert.deepEqual(model.matchStatus(aplazado), { state: 'aplazado', note: 'por lluvia', start: null });
  assert.equal(model.teamInfo(PORTAL_SEASON, 'Las Mesas Hu.', 'alevin').shirt, 'AZUL CELESTE');
  assert.equal(model.teamInfo(PORTAL_SEASON, 'Las Mesas Hu.', 'prebenjamin').shirt, 'ROJA', 'el homónimo de prebenjamín, la suya');
  assert.equal(model.teamInfo(PORTAL_SEASON, 'Las Mesas Hu.').shirt, 'ROJA');
  // 2024-25 archivada: sin su alevín, solo benjamín y prebenjamín; con él, también ALA1, ALF1 y ALEL1.
  datasets.seasonRaw['2024-2025'] = archive('2024-2025');
  const plain = model.season('2024-2025');
  assert.equal(plain.groups.some((g) => g.cat === 'alevin'), false);
  datasets.seasonAlevin['2024-2025'] = pastAlevinRaw('2024-2025');
  const full = model.season('2024-2025');
  assert.notEqual(full, plain);
  assert.deepEqual(full.groups.filter((g) => g.cat === 'alevin').map((g) => `${g.id} ${g.kind}`), ['ALA1 league', 'ALF1 league', 'ALEL1 cup-bracket']);
  assert.deepEqual(model.scorers('2024-2025', 'alevin').map((e) => e.id), ['ALA1']);
  assert.deepEqual(model.scorers('2024-2025', 'benjamin'), []);
  // Un 404 (sin alevín esa temporada) es un objeto vacío: nada de alevín.
  datasets.seasonRaw['2023-2024'] = archive('2023-2024');
  datasets.seasonAlevin['2023-2024'] = {};
  assert.equal(model.season('2023-2024').groups.some((g) => g.cat === 'alevin'), false);
});

// ── state.js ─────────────────────────────────────────────────────────────

test('alevinData: las seis constantes de data-alevin.js con los nombres del registro; sin ellas, vacío', () => {
  assert.deepEqual(alevinData({}), { groups: [], stats: null, history: {}, gol: [], estados: {}, equipos: {} });
  const data = alevinData(ALEV);
  assert.equal(data.groups, ALEV.ALEVIN);
  assert.equal(data.stats, ALEV.ALEV_STATS);
  assert.equal(data.history, ALEV.HISTORY_ALEV);
  assert.equal(data.gol, ALEV.GOL_ALEV);
  assert.equal(data.estados, ALEV.ESTADOS_ALEV);
  assert.equal(data.equipos, ALEV.EQUIPOS_ALEV);
});

test('ensureAlevin y ensureSeasonAlevin: un vuelo, el texto leído por expresión regular; un fallo, null y se reintenta; un 404, sin alevín', async () => {
  const requests = [];
  const files = {};
  const saved = { fetch: globalThis.fetch, warn: console.warn };
  globalThis.fetch = async (url) => {
    requests.push(String(url));
    const body = files[String(url).replace(/^\.\//, '').replace(/\?.*$/, '')];
    if (body === 503) return { ok: false, status: 503, text: async () => 'no disponible' };
    return body == null ? { ok: false, status: 404, text: async () => '' } : { ok: true, status: 200, text: async () => body };
  };
  console.warn = () => {};
  try {
    files['data-alevin.js'] = 503;
    assert.equal(await ensureAlevin(), null, 'un 503: null');
    files['data-alevin.js'] = '<!doctype html><title>sin conexión</title>';
    assert.equal(await ensureAlevin(), null, 'lo que no es el fichero (el index.html del SW sin conexión): null');
    files['data-alevin.js'] = `// Auto-generated by scripts/generate_js.py\n${dataFile(ALEV)}`;
    const [a, b] = await Promise.all([ensureAlevin(), ensureAlevin()]);
    assert.equal(a, b, 'un solo vuelo');
    assert.deepEqual(a, alevinData(ALEV));
    assert.equal(await ensureAlevin(), a, 'cargado, no se vuelve a pedir');
    assert.deepEqual(requests, ['./data-alevin.js', './data-alevin.js', './data-alevin.js']);
    // Temporadas pasadas: data-season-<S>-alevin.js, con su constante SEASON_<S>_ALEVIN.
    requests.length = 0;
    const past = pastAlevinRaw('2024-2025');
    files['data-season-2024-2025-alevin.js'] = `const SEASON_2024_2025_ALEVIN=${JSON.stringify(past)};\n`;
    assert.deepEqual(await ensureSeasonAlevin('2024-2025'), past);
    assert.deepEqual(await ensureSeasonAlevin('2023-2024'), {}, 'un 404: la temporada no tiene alevín');
    assert.deepEqual(await ensureSeasonAlevin('2023-2024'), {});
    files['data-season-2022-2023-alevin.js'] = 503;
    assert.equal(await ensureSeasonAlevin('2022-2023'), null);
    files['data-season-2022-2023-alevin.js'] = 'const SEASON_2022_2023_ALEVIN={"name":"2022-2023","alevin":[]};';
    assert.deepEqual(await ensureSeasonAlevin('2022-2023'), { name: '2022-2023', alevin: [] }, 'el fallo no se memoriza');
    assert.deepEqual(requests, ['./data-season-2024-2025-alevin.js', './data-season-2023-2024-alevin.js',
      './data-season-2022-2023-alevin.js', './data-season-2022-2023-alevin.js']);
  } finally {
    globalThis.fetch = saved.fetch;
    console.warn = saved.warn;
  }
});

test('alevinNeeds: [] si ya está; si no, la carga que lo deja en el registro, o que rechaza con «alevín» para la caja de error', async () => {
  assert.throws(() => alevinNeeds(PORTAL_SEASON, pending(), null), TypeError);
  assert.deepEqual(alevinNeeds(PORTAL_SEASON, withAlevin(), PORTAL_SEASON), []);
  assert.deepEqual(alevinNeeds('2024-2025', pending({ seasonAlevin: { '2024-2025': {} } }), PORTAL_SEASON), []);
  const datasets = pending();
  const [load] = alevinNeeds(PORTAL_SEASON, datasets, PORTAL_SEASON, { ensure: async () => loaded() });
  await load;
  assert.deepEqual(datasets.alevin, loaded());
  const failing = pending();
  await assert.rejects(alevinNeeds(PORTAL_SEASON, failing, PORTAL_SEASON, { ensure: async () => null })[0], { message: 'alevín' });
  assert.equal(failing.alevin, undefined, 'un fallo no se guarda');
  const past = pending();
  await alevinNeeds('2024-2025', past, PORTAL_SEASON, { ensureSeason: async () => ({}) })[0];
  assert.deepEqual(past.seasonAlevin, { '2024-2025': {} });
  await assert.rejects(alevinNeeds('2024-2025', pending(), PORTAL_SEASON, { ensureSeason: async () => null })[0],
    { message: 'alevín de la temporada 2024/25' });
});

// ── router.js ────────────────────────────────────────────────────────────

const resolve = (hash, options) => resolveParams(parseRoute(hash), ctxFor('', {}, options));
const target = (res) => (res.redirect ? [routeHref(res.redirect.screen, res.redirect.params), res.redirect.notice] : res);

test('`c=alevin` vale en Ligas, Goleadores y Récords; otra categoría se quita', () => {
  for (const screen of ['ligas', 'goleadores', 'records']) {
    assert.deepEqual(resolve(`#/${screen}?c=alevin`, { datasets: withAlevin() }), { params: { c: 'alevin', s: PORTAL_SEASON } }, screen);
    assert.deepEqual(target(resolve(`#/${screen}?c=cadete`, { datasets: withAlevin() })), [`#/${screen}`, null], screen);
  }
});

test('un grupo que no está: con el alevín sin pedir, pendiente de alevín; con él, el grupo o, si tampoco está, «No encontramos el grupo»', () => {
  for (const screen of ['tabla', 'jornada', 'copa', 'goleadores']) {
    assert.deepEqual(resolve(`#/${screen}?g=AL1`, { datasets: pending() }), { params: { g: 'AL1', s: PORTAL_SEASON }, alevin: PORTAL_SEASON }, screen);
  }
  assert.deepEqual(resolve('#/equipo?g=AL1&t=Las%20Mesas%20Hu.', { datasets: pending() }),
    { params: { g: 'AL1', t: 'Las Mesas Hu.', s: PORTAL_SEASON }, alevin: PORTAL_SEASON });
  assert.deepEqual(resolve('#/partido?g=AL1&r=Jornada%201&h=Las%20Mesas%20Hu.&a=Maspalomas', { datasets: pending() }).alevin, PORTAL_SEASON);
  assert.deepEqual(resolve('#/tabla?g=AL1', { datasets: withAlevin() }), { params: { g: 'AL1', s: PORTAL_SEASON } });
  assert.deepEqual(target(resolve('#/tabla?g=AL9', { datasets: withAlevin() })),
    ['#/ligas?c=prebenjamin&to=tabla', 'No encontramos el grupo AL9 en la temporada 2025/26']);
  // Un grupo que sí está no espera a nada.
  assert.deepEqual(resolve('#/tabla?g=PG3', { datasets: pending() }), { params: { g: 'PG3', s: PORTAL_SEASON } });
  // Temporada pasada cargada sin su alevín: pendiente del de esa temporada.
  const past = pending({ seasonRaw: { '2024-2025': archive('2024-2025') } });
  assert.deepEqual(resolve('#/tabla?s=2024-2025&g=ALA1', { datasets: past }), { params: { s: '2024-2025', g: 'ALA1' }, alevin: '2024-2025' });
});

test('Jornada y Tabla sin grupo con mi equipo alevín (o de otra temporada): esperan al alevín antes de resolverlo', () => {
  assert.deepEqual(resolve('#/tabla', { datasets: pending(), myTeam: MESAS_AL1 }), { params: { s: PORTAL_SEASON }, alevin: PORTAL_SEASON });
  assert.deepEqual(resolve('#/jornada', { datasets: withAlevin(), myTeam: MESAS_AL1 }), { params: { s: PORTAL_SEASON, g: 'AL1' } });
  const lastYear = { name: 'Las Mesas Hu.', season: '2024-2025', cat: 'prebenjamin', groupId: 'PGC2' };
  assert.deepEqual(resolve('#/jornada', { datasets: pending(), myTeam: lastYear }).alevin, PORTAL_SEASON);
  assert.deepEqual(resolve('#/jornada', { datasets: pending() }), { params: { s: PORTAL_SEASON, g: 'PG2' } }, 'mi equipo de prebenjamín, sin esperar');
});

test('needsAlevin: lo que la pantalla pinta con alevín (c=alevin, Explorar, Ligas sin c, mi equipo alevín o de otra temporada)', () => {
  const need = (hash, options = {}) => {
    const ctx = ctxFor('', {}, { datasets: pending(), ...options });
    const res = resolveParams(parseRoute(hash), ctx);
    return needsAlevin({ screen: parseRoute(hash).screen, params: res.params }, ctx);
  };
  assert.deepEqual(need('#/explorar'), { season: PORTAL_SEASON, soft: true });
  assert.deepEqual(need('#/ligas'), { season: PORTAL_SEASON, soft: true });
  assert.deepEqual(need('#/ligas?f=copa-campeones'), { season: PORTAL_SEASON, soft: true });
  assert.deepEqual(need('#/ligas?c=alevin'), { season: PORTAL_SEASON, soft: false });
  assert.deepEqual(need('#/goleadores?c=alevin'), { season: PORTAL_SEASON, soft: false });
  assert.deepEqual(need('#/records?c=alevin'), { season: PORTAL_SEASON, soft: false });
  assert.equal(need('#/ligas?c=benjamin'), null);
  assert.equal(need('#/'), null, 'la portada de mi equipo de prebenjamín no pide alevín (presupuesto de 3 s)');
  assert.equal(need('#/goleadores'), null);
  assert.equal(need('#/fuentes'), null);
  assert.deepEqual(need('#/', { myTeam: MESAS_AL1 }), { season: PORTAL_SEASON, soft: false });
  assert.deepEqual(need('#/records', { myTeam: MESAS_AL1 }), { season: PORTAL_SEASON, soft: false }, 'la categoría por defecto es la de mi equipo');
  assert.deepEqual(need('#/', { myTeam: { ...DEFAULT_TEAM, season: '2024-2025' } }), { season: PORTAL_SEASON, soft: true },
    'cambio de temporada: el paso 1 busca en las tres categorías (opción a de la crítica); si no llega, sin él');
  assert.equal(need('#/explorar', { datasets: withAlevin() }), null, 'ya cargado');
  // Una temporada pasada: su data-season-<S>-alevin.js.
  assert.deepEqual(need('#/explorar?s=2024-2025'), { season: '2024-2025', soft: true });
  assert.equal(need('#/explorar?s=2024-2025', { datasets: pending({ seasonAlevin: { '2024-2025': {} } }) }), null);
});

// El router de verdad con las pantallas de verdad y el registro de datos de app.js; loadAlevin, la carga
// del alevín (alevinNeeds con la fixture), que falla las primeras `fails` veces.
function routerWith(hash, { datasets = pending(), fails = 0, myTeam, log = [] } = {}) {
  let calls = 0;
  const loadAlevin = (season, data, portalSeason) => {
    log.push(season);
    if (season !== portalSeason) return alevinNeeds(season, data, portalSeason, { ensureSeason: async () => ({}) });
    return alevinNeeds(season, data, portalSeason, { ensure: async () => (++calls <= fails ? null : loaded()) });
  };
  const b = fakeBrowser(hash);
  const router = startRouter({ screens: SCREEN_MAP, root: b.root, getContext: () => ctxFor('', {}, { datasets, myTeam }), window: b.win, loadAlevin });
  return { b, router, datasets, log };
}

test('Tabla de AL1 en frío: el router carga el alevín (una vez) y la pinta, sin aviso ni redirección', async () => {
  const { b, router, log } = routerWith('#/tabla?g=AL1');
  await router.idle();
  assert.deepEqual(log, [PORTAL_SEASON]);
  assert.deepEqual(b.entries(), ['#/tabla?g=AL1']);
  assert.match(b.root.innerHTML, /^<section data-screen="tabla">/);
  assert.match(b.root.innerHTML, /<h1>Tabla<\/h1><p class="screen-sub">Alevín, Primera Fase, Grupo 1<\/p>/);
  assert.doesNotMatch(b.root.innerHTML, /route-notice|No encontramos/);
  b.click({ href: '#/explorar' });
  await router.idle();
  assert.deepEqual(log, [PORTAL_SEASON], 'ya cargado: Explorar no lo vuelve a pedir');
});

test('si falla, la ruta que pide alevín da su caja de error con «Reintentar», nunca el falso «No encontramos el grupo»', async () => {
  for (const hash of ['#/tabla?g=AL1', '#/ligas?c=alevin', '#/goleadores?c=alevin']) {
    const { b, router } = routerWith(hash, { fails: 1 });
    await router.idle();
    assert.deepEqual(b.entries(), [hash], hash);
    assert.match(b.root.innerHTML, /data-state="error"/, hash);
    assert.match(b.root.innerHTML, /No se pudieron cargar los datos de alevín\./, hash);
    assert.doesNotMatch(b.root.innerHTML, /No encontramos/, hash);
    b.click({ 'data-action': 'retry', type: 'button' }, 'button');
    await router.idle();
    assert.doesNotMatch(b.root.innerHTML, /data-state="error"|No se pudieron/, `${hash}: «Reintentar» lo vuelve a pedir`);
  }
  // Mi equipo alevín: la portada tampoco se pinta en X por error.
  const { b, router } = routerWith('#/', { fails: 1, myTeam: MESAS_AL1 });
  await router.idle();
  assert.match(b.root.innerHTML, /<section data-screen="home" data-state="error">/);
  assert.match(b.root.innerHTML, /No se pudieron cargar los datos de alevín\./);
});

test('Explorar y Ligas sin `c`: si falla, benjamín y prebenjamín con un aviso y «Reintentar»; al reintentar, alevín', async () => {
  for (const [hash, alevin] of [['#/explorar', '#/ligas?s=2025-2026&amp;c=alevin&amp;f=primera-fase'], ['#/ligas', '#/ligas?s=2025-2026&amp;c=alevin&amp;f=primera-fase']]) {
    const { b, router } = routerWith(hash, { fails: 1 });
    await router.idle();
    const out = b.root.innerHTML;
    assert.doesNotMatch(out, /data-state="error"/, hash);
    assert.match(out, /<div class="box partial-box" role="status"><p class="partial-text">No se pudieron cargar los datos de alevín: se ven benjamín y prebenjamín\.<\/p><div class="buttons"><button class="button" type="button" data-action="retry">Reintentar<\/button><\/div><\/div>/, hash);
    assert.match(out, /href="#\/ligas\?s=2025-2026&amp;c=prebenjamin&amp;f=grancanaria/, `${hash}: lo demás, sí`);
    assert.ok(!out.includes(alevin), hash);
    b.click({ 'data-action': 'retry', type: 'button' }, 'button');
    await router.idle();
    assert.doesNotMatch(b.root.innerHTML, /partial-box/, hash);
    assert.ok(b.root.innerHTML.includes(alevin), `${hash}: tras reintentar, alevín`);
  }
});

test('Explorar con el alevín: su bloque en Ligas, después de prebenjamín, y el buscador encuentra los dos Las Mesas de alevín', async () => {
  const { b, router } = routerWith('#/explorar?q=mesas');
  await router.idle();
  const out = b.root.innerHTML;
  const heads = [...out.matchAll(/<h3 class="link-head">([^<]+)<\/h3>/g)].map((m) => m[1]);
  assert.deepEqual(heads, ['Benjamín', 'Prebenjamín', 'Alevín']);
  assert.match(out, /Alevín, Primera Fase, Grupo 1/);
  assert.match(out, /href="#\/equipo\?s=2025-2026&amp;g=AL2&amp;t=Las%20Mesas%20B"/);
});

test('Ligas de alevín de una temporada pasada: la Segunda Fase A antes que la F, y las Eliminatorias en Copa', async () => {
  const datasets = pending({ seasonRaw: { '2024-2025': archive('2024-2025') } });
  const loadAlevin = (season, data, portalSeason) => alevinNeeds(season, data, portalSeason,
    { ensure: async () => loaded(), ensureSeason: async () => pastAlevinRaw('2024-2025') });
  const b = fakeBrowser('#/ligas?s=2024-2025&c=alevin');
  const router = startRouter({ screens: SCREEN_MAP, root: b.root, getContext: () => ctxFor('', {}, { datasets }), window: b.win, loadAlevin });
  await router.idle();
  const rows = [...b.root.innerHTML.matchAll(/<a class="link-row" href="([^"]+)"><span class="link-row-main"><span class="link-row-title">([^<]+)</g)].map((m) => `${m[2]} → ${m[1]}`);
  assert.deepEqual(rows, [
    'Segunda Fase A → #/ligas?s=2024-2025&amp;c=alevin&amp;f=segunda-a',
    'Segunda Fase F → #/ligas?s=2024-2025&amp;c=alevin&amp;f=segunda-f',
    'Eliminatorias → #/ligas?s=2024-2025&amp;c=alevin&amp;f=eliminatorias',
  ]);
  b.click({ href: '#/tabla?s=2024-2025&g=ALEL1' });
  await router.idle();
  assert.equal(b.hash(), '#/copa?s=2024-2025&g=ALEL1', 'unas Eliminatorias se abren en Copa');
  assert.match(b.root.innerHTML, /^<section data-screen="copa"/);
  assert.match(b.root.innerHTML, /Final/);
});

// ── store.js y myteam.js ─────────────────────────────────────────────────

test('store.js: mi equipo alevín se guarda en la v2; la v1 (la app anterior) sigue con dos categorías', () => {
  const storage = memoryStorage(new Map([[STORE_KEY, JSON.stringify({ myTeam: MESAS_AL1, recent: [] })]]));
  assert.deepEqual(loadStore(storage, { defaultTeam: DEFAULT_TEAM, portalSeason: PORTAL_SEASON }).myTeam, MESAS_AL1);
  const cadete = memoryStorage(new Map([[STORE_KEY, JSON.stringify({ myTeam: { ...MESAS_AL1, cat: 'cadete' }, recent: [] })]]));
  assert.equal(loadStore(cadete, { defaultTeam: DEFAULT_TEAM, portalSeason: PORTAL_SEASON }).myTeam.cat, 'prebenjamin');
  assert.equal(migrateV1({ teams: [{ name: 'X', cat: 'alevin', groupId: 'AL1' }], selected: 'alevin|AL1|x' }), null);
});

test('myteam.js: la categoría por defecto, el cambio de temporada a alevín y la trayectoria con alevín', () => {
  assert.equal(defaultCategory({ status: 'ok', cat: 'alevin' }, DEFAULT_TEAM), 'alevin');
  assert.equal(defaultCategory({ status: 'absent' }, { cat: 'alevin' }), 'alevin');
  assert.equal(defaultCategory({ status: 'ok', cat: 'cadete' }, { cat: 'cadete' }), 'benjamin', 'el respaldo sigue siendo benjamín');
  // Cambio de temporada (paso 1): Guayarmina, de benjamín el año anterior, juega en benjamín (A1) y en
  // alevín (AL1). Sin alevín, A1 en silencio; con él, la pregunta, con el paso natural a alevín: por eso
  // el router espera al alevín en un cambio de temporada (opción (a) de critic.md).
  const guayarmina = { name: 'Guayarmina', season: '2024-2025', cat: 'benjamin', groupId: 'A1' };
  const without = createModel(datasetsFor(), { portalSeason: PORTAL_SEASON, buildClubIndex });
  assert.equal(resolveMyTeam(guayarmina, without.season(PORTAL_SEASON), without.clubIndex(), '2026-09-24').status, 'ok');
  const model = createModel(withAlevin(), { portalSeason: PORTAL_SEASON, buildClubIndex });
  const r = resolveMyTeam(guayarmina, model.season(PORTAL_SEASON), model.clubIndex(), '2026-09-24');
  assert.equal(r.status, 'ask');
  assert.deepEqual(r.candidates.map((c) => `${c.cat} ${c.group.id} ${c.name}`), ['benjamin A1 Guayarmina', 'alevin AL1 Guayarmina']);
  // La trayectoria recorre las tres categorías: Las Mesas Hu. en prebenjamín (PG2) y en alevín (AL1).
  const traj = teamTrajectory(model, 'Las Mesas Hu.', model.clubIndex(), [PORTAL_SEASON]);
  assert.deepEqual(traj.filter((row) => row.name === 'Las Mesas Hu.').map((row) => `${row.cat} ${row.group.id}`),
    ['benjamin A2', 'prebenjamin PG2', 'alevin AL1']);
});

// ── start() de verdad: el fetch de los data-*.js perezosos ───────────────

const FILES = {};
const fetched = [];
globalThis.fetch = async (url) => {
  const file = String(url).replace(/^\.\//, '').replace(/\?.*$/, '');
  fetched.push(file);
  const body = FILES[file];
  return body ? { ok: true, status: 200, text: async () => body } : { ok: false, status: 404, text: async () => '' };
};
const GLOBALS = ['BENJAMIN', 'PREBENJAMIN', 'HISTORY', 'GOL_BENJ', 'GOL_PREBENJ', 'SHIELDS', 'SEASONS', 'MASPALOMAS_CUP_BENJAMIN', 'MASPALOMAS_CUP_PREBENJAMIN'];
function installData() {
  const raw = fixture('current-2025-2026');
  const cups = fixture('cups-2025-2026');
  const values = { BENJAMIN: raw.benjamin, PREBENJAMIN: raw.prebenjamin, HISTORY: raw.history, GOL_BENJ: [], GOL_PREBENJ: [],
    SHIELDS: fixture('shields'), SEASONS: [{ name: PORTAL_SEASON, current: true }],
    MASPALOMAS_CUP_BENJAMIN: cups.benjamin, MASPALOMAS_CUP_PREBENJAMIN: cups.prebenjamin };
  for (const name of GLOBALS) globalThis[name] = values[name];
}
const PORTAL = { season: PORTAL_SEASON, nextSeason: '2026-2027', defaultTeam: DEFAULT_TEAM, timeZone: 'Atlantic/Canary' };
async function load(storage, hash) {
  installData();
  const page = fakeBrowser(hash, { storage });
  const router = start(page.doc, page.win, PORTAL, { now: () => new Date('2026-09-24T12:00:00Z') });
  await router.idle();
  return { page, router };
}

test('start(): la portada de mi equipo de prebenjamín nunca pide data-alevin.js (presupuesto de 3 s)', async () => {
  fetched.length = 0;
  const { page } = await load(new Map(), '#/');
  assert.match(page.main.innerHTML, /<section data-screen="home" data-state="D"/);
  assert.ok(!fetched.includes('data-alevin.js'), `la portada pidió ${fetched.join(', ')}`);
});

test('start(): Tabla de AL1 en frío, Explorar con alevín y mi equipo alevín que sobrevive a recargar', async () => {
  FILES['data-alevin.js'] = dataFile(ALEV);
  const storage = new Map();
  const cold = await load(storage, '#/tabla?g=AL1');
  assert.match(cold.page.main.innerHTML, /<p class="screen-sub">Alevín, Primera Fase, Grupo 1<\/p>/);
  // «Hacer mi equipo» desde la ficha de Las Mesas Hu. en AL1: se guarda tal cual.
  cold.router.nav.saveMyTeam(MESAS_AL1);
  await cold.router.idle();
  assert.deepEqual(JSON.parse(storage.get(STORE_KEY)).myTeam, MESAS_AL1);
  const again = await load(storage, '#/');
  assert.match(again.page.main.innerHTML, /<section data-screen="home" data-state="D"/);
  // En estado D (2025/26 terminada): «Así terminó 2025/26» con su grupo de alevín, y su fila en la tabla.
  assert.match(again.page.main.innerHTML, /<h1>Las Mesas Hu\.<\/h1>/);
  assert.match(again.page.main.innerHTML, /<h2 class="block-title">Así terminó 2025\/26<\/h2><p class="block-context">Alevín, Primera Fase, Grupo 1<\/p>/);
  assert.match(again.page.main.innerHTML, /<tr class="is-mine"><td class="st-pos">1<\/td><th scope="row" class="st-team"><a class="st-link" href="#\/equipo\?s=2025-2026&amp;g=AL1&amp;t=Las%20Mesas%20Hu\.">/);
  assert.deepEqual(JSON.parse(storage.get(STORE_KEY)).myTeam, MESAS_AL1, 'al recargar, sigue siendo el de alevín');
});

test('startContext: el registro de las pruebas, con el alevín ya cargado (vacío) salvo que se pida otra cosa', () => {
  const ctx = startContext({ storage: memoryStorage(), portal: { season: PORTAL_SEASON, defaultTeam: DEFAULT_TEAM }, datasets: datasetsFor(), today: '2026-09-24' });
  assert.deepEqual(ctx.datasets.alevin, alevinData({}));
});

// ── Revisión adversarial de la web de alevín ─────────────────────────────

const plain = (out) => String(out).replace(/<[^>]+>/g, ' ').replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim();
const MESAS_MATCH = (group) => group.rounds[0].matches.find((m) => m.home === 'Las Mesas Hu.' || m.away === 'Las Mesas Hu.');

test('Cara a cara de un partido de alevín: «Ver temporadas anteriores» pide el alevín de cada una (un 404, sin alevín); si no llega, la caja de error', async () => {
  const panel = async (serve, cat = 'alevin') => {
    const asked = [];
    const datasets = withAlevin({ seasonRaw: { '2024-2025': archive('2024-2025') }, seasonAlevin: {} });
    const ctx = ctxFor('partido', {}, { datasets });
    const group = ctx.model.group(PORTAL_SEASON, cat === 'alevin' ? 'AL1' : 'PG2');
    const out = await previousPanelContent(ctx, MESAS_MATCH(group), group, { ensureSeason: async (name) => { asked.push(name); return serve(name); } });
    return { out: plain(out), asked };
  };
  const found = await panel(() => pastAlevinRaw('2024-2025'));
  assert.deepEqual(found.asked, ['2024-2025']);
  assert.match(found.out, /^2024\/25 · Alevín, Segunda Fase A, Grupo 1 J1, 11 abr Las Mesas Hu\. – Maspalomas/);
  // Sin alevín esa temporada (un 404): ahora sí es verdad que no se enfrentaron.
  assert.equal((await panel(() => ({}))).out, 'No encontramos partidos entre estos dos equipos en la temporada 2024/25.');
  // Si no llega (sin conexión, un 503), la caja de error con «Reintentar»: nunca el falso «No encontramos».
  const failed = await panel(() => null);
  assert.match(failed.out, /^No se pudieron cargar los datos de las temporadas anteriores\. Reintentar$/);
  // Uno de prebenjamín no pide alevín.
  assert.deepEqual((await panel(() => pastAlevinRaw('2024-2025'), 'prebenjamin')).asked, []);
});

test('Trayectoria: el alevín de la temporada del portal y el de cada pasada; sin el del portal, la caja de error; sin el de una pasada, sin él y con un aviso', async () => {
  const content = async ({ portal = () => loaded(), past = () => pastAlevinRaw('2024-2025') } = {}) => {
    const asked = [];
    const datasets = pending({ seasonRaw: { '2024-2025': archive('2024-2025') } });
    const ctx = ctxFor('equipo', {}, { datasets });
    const out = await trajectoryContent(ctx, 'Las Mesas Hu.', async () => null, {
      ensure: async () => { asked.push(PORTAL_SEASON); return portal(); },
      ensureSeason: async (name) => { asked.push(name); return past(name); },
    });
    return { out: String(out), asked };
  };
  const full = await content();
  assert.deepEqual(full.asked.sort(), ['2024-2025', PORTAL_SEASON]);
  assert.match(full.out, /<span class="traj-team">Las Mesas Hu\.<\/span><span class="traj-group">Alevín, Primera Fase, Grupo 1<\/span>/, 'la del portal');
  assert.match(full.out, /<span class="traj-team">Las Mesas Hu\.<\/span><span class="traj-group">Alevín, Segunda Fase A, Grupo 1<\/span>/, 'la pasada');
  assert.doesNotMatch(full.out, /partial-box|error-box/);
  // Sin data-alevin.js, la caja de error del panel (con su «Reintentar»), como sin una temporada.
  assert.match(plain((await content({ portal: () => null })).out), /^No se pudieron cargar los datos de la trayectoria\. Reintentar$/);
  // Sin el alevín de una pasada (sin conexión: esos ficheros solo se guardan al usarse), la trayectoria sin
  // él, con un aviso y «Reintentar» (el del panel).
  const partial = await content({ past: () => null });
  assert.match(partial.out, /^<div class="box partial-box" role="status"><p class="partial-text">No se pudieron cargar los datos de alevín de la temporada 2024\/25: la trayectoria sale sin ellos\.<\/p><div class="buttons"><button class="button" type="button" data-action="retry">Reintentar<\/button><\/div><\/div>/);
  assert.match(partial.out, /Alevín, Primera Fase, Grupo 1/);
  assert.doesNotMatch(partial.out, /Alevín, Segunda Fase A/);
});

test('Goleadores de una temporada pasada sin alevín: el selector de categoría sigue y dice que de alevín no hay; sin ninguna, el aviso de la temporada', () => {
  const gol = { benjamin: [{ id: 'A1', g: 'BENJAMIN - GRUPO 1', s: [['Uno, Jugador', 'Guayarmina', 5, 3]] }] };
  const render = (raw, c) => String(SCREEN_MAP.goleadores.render(ctxFor('goleadores', { s: '2024-2025', c },
    { datasets: datasetsFor({ seasonRaw: { '2024-2025': raw } }) })));
  const out = render({ ...archive('2024-2025'), gol }, 'alevin');
  assert.match(out, /<nav class="gol-cats" aria-label="Categoría">/);
  assert.match(out, /<p class="empty">No hay goleadores de alevín de la temporada 2024\/25 en esta web\.<\/p>/);
  assert.match(render({ ...archive('2024-2025'), gol }, 'benjamin'), /1 jugador de 1 grupo/);
  const none = render(archive('2024-2025'), 'alevin');
  assert.doesNotMatch(none, /gol-cats/);
  assert.match(none, /<p class="empty">No hay goleadores de la temporada 2024\/25 en esta web\.<\/p>/);
});

test('Récords de alevín: el detalle de cada fila sin la categoría, que ya dice el selector', () => {
  const out = String(SCREEN_MAP.records.render(ctxFor('records', { c: 'alevin' }, { datasets: withAlevin() })));
  const details = [...out.matchAll(/<span class="rc-detail">([^<]*)<\/span>/g)].map((m) => m[1]);
  assert.ok(details.length > 0);
  assert.ok(details.every((d) => !d.includes('Alevín')), details.join(' | '));
  assert.ok(details.some((d) => d.startsWith('Primera Fase, Grupo 1')), details.join(' | '));
});

test('«Todos los grupos» de alevín en frío (#/jornada?c=alevin&f=primera-fase): espera al alevín, nunca el falso «No encontramos la competición»', async () => {
  const hash = '#/jornada?c=alevin&f=primera-fase';
  const { b, router, log } = routerWith(hash);
  await router.idle();
  assert.deepEqual(log, [PORTAL_SEASON]);
  assert.equal(b.hash(), hash);
  assert.match(b.root.innerHTML, /^<section data-screen="jornada"/);
  assert.doesNotMatch(b.root.innerHTML, /No encontramos|route-notice/);
  // Si falla, la caja de error de alevín.
  const failed = routerWith(hash, { fails: 1 });
  await failed.router.idle();
  assert.equal(failed.b.hash(), hash);
  assert.match(failed.b.root.innerHTML, /No se pudieron cargar los datos de alevín\./);
  // Una de benjamín que no existe no espera al alevín: a Ligas, con su aviso.
  const lost = routerWith('#/jornada?c=benjamin&f=no-existe');
  await lost.router.idle();
  assert.deepEqual(lost.log, []);
  assert.match(lost.b.root.innerHTML, /No encontramos la competición no-existe/);
});

test('la barra, con el alevín ya cargado: la ficha y un partido de mi equipo alevín, abiertos en frío, marcan Mi equipo', async () => {
  for (const hash of ['#/equipo?g=AL1&t=Las%20Mesas%20Hu.', '#/partido?g=AL1&r=Jornada%201&h=Las%20Mesas%20Hu.&a=Maspalomas']) {
    const { b, router } = routerWith(hash, { myTeam: MESAS_AL1 });
    await router.idle();
    assert.deepEqual(b.marks(), [['#/', 'true']], hash);
  }
});

test('mi equipo de otra temporada que no es de alevín: espera al alevín, pero si no llega se pinta sin él (nunca la caja de error)', async () => {
  const lastYear = { name: 'UD Valleseco', season: '2024-2025', cat: 'benjamin', groupId: 'P1' };
  const ctx = ctxFor('', {}, { datasets: pending(), myTeam: lastYear });
  assert.deepEqual(needsAlevin({ screen: '', params: {} }, ctx), { season: PORTAL_SEASON, soft: true });
  assert.deepEqual(resolve('#/tabla', { datasets: pending(), myTeam: lastYear }), { params: { s: PORTAL_SEASON }, alevin: PORTAL_SEASON, soft: true });
  for (const hash of ['#/', '#/jornada', '#/tabla']) {
    const { b, router, log } = routerWith(hash, { fails: 1, myTeam: lastYear });
    await router.idle();
    assert.deepEqual(log, [PORTAL_SEASON], hash);
    assert.doesNotMatch(b.root.innerHTML, /data-state="error"|No se pudieron/, hash);
    assert.match(b.root.innerHTML, hash === '#/' ? /<h1>UD Valleseco<\/h1>/ : /<p class="screen-sub">Benjamín, /, hash);
  }
  // Mi equipo alevín sí da la caja de error (sin alevín, X por error): la prueba de arriba.
});
