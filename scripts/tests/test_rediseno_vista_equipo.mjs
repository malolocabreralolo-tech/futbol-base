// Plan B3, Tarea 3: la vista de equipo compartida (team-view.js; decisiones 8 a 10 de B3), el estado
// de un equipo (teamState, myteam.js) y lo que la acompaña en ui.js: block sin título, el texto
// oculto de la fila resaltada y el de formChips (recomendación 4 de B1). La portada es la vista de la
// ficha con su cabecera: lo fijan sus huellas. Solo fixtures y `today` inyectado; el ctx es el común
// (ctxFor).
import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { createHash } from 'node:crypto';
import { fixture } from './fixtures/rediseno/load.mjs';
import { currentAt, nextSeasonRaw, datasetsFrom, goleadores } from './fixtures/rediseno/simulate.mjs';
import { ctxFor, datasetsFor, pastSeasonRaw, cssRules } from './fixtures/rediseno/screens.mjs';
import { buildSeason, findGroup } from '../../src/model.js';
import { homeState, teamState } from '../../src/myteam.js';
import { block, empty, standingsTable } from '../../src/ui.js';
import { screen as home } from '../../src/screen-home.js';
import { SEARCH_HREF, mountTeamView, teamCalendar, teamColumns, teamHeader, teamView } from '../../src/team-view.js';

const s = (h) => String(h);
const text = (h) => s(h).replace(/<[^>]*>/g, ' ').replace(/&quot;/g, '"').replace(/&#39;/g, "'")
  .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim();
const titles = (h) => [...s(h).matchAll(/<h2 class="block-title">(.*?)<\/h2>/g)].map((m) => m[1]);
const LAS_MESAS = { name: 'Las Mesas Hu.', season: '2025-2026', cat: 'prebenjamin', groupId: 'PG2' };
const HURACAN = { s: '2025-2026', g: 'PG2', t: 'AD Huracán' };

// ── La portada es la vista de la ficha con su cabecera: lo fijan sus huellas ──

// El ctx de la portada de test_rediseno_portada.mjs, con los goleadores congelados de la Tarea 2.
function homeCtx({
  raw = fixture('current-2025-2026'), myTeam = LAS_MESAS, today, portalSeason = '2025-2026',
  withHealth = fixture('health'), legacyDate = null, goles = true, stale = false,
} = {}) {
  const gol = goleadores();
  const datasets = datasetsFrom(raw, { golBenj: goles ? gol.golBenj : null, golPrebenj: goles ? gol.golPrebenj : null, health: withHealth });
  const ctx = ctxFor('', {}, { today, datasets, myTeam, portalSeason, legacyDate });
  return stale ? { ...ctx, resolution: { ...ctx.resolution, stale: true } } : ctx;
}

// La jornada 30 de PG2 sin fecha publicada (el próximo partido de Las Mesas, el 31/05/2026) y el de la
// jornada 18 sin hora (el del 01/03/2026): los dos casos de C y de A que las fixtures no traen.
function undatedJ30() {
  const raw = currentAt('2026-05-31');
  raw.history.PG2['Jornada 30'][0][0] = '';
  return raw;
}
function untimedJ18() {
  const raw = currentAt('2026-03-01');
  raw.history.PG2['Jornada 18'].find((m) => m[1] === 'Las Mesas Hu.' || m[2] === 'Las Mesas Hu.')[6] = '';
  return raw;
}

// sha1 del render de la portada en e82eb86 (antes de team-view.js), con las fixtures de B1 y B3; las
// cinco últimas, de B5 (decisión 7), del render de 0208d26, el mismo tras la limpieza de la Tarea 3.
// 2026-10: los casos A y C, con la fila nueva de «La temporada en cifras» (racha, porterías a cero y
// partidos sin marcar); B, D, E y X no la pintan y siguen idénticos.
// 2026-10-04: todos salvo E y X, con lo de la ficha: el calendario completo siempre (#calendario y su
// .ics), la evolución de puntos, el hueco de la plantilla (homeCtx no trae actas) y la trayectoria; E y
// X no pasan por la vista de equipo y siguen idénticos.
const HOME = {
  A: [{ raw: currentAt('2026-03-01'), today: '2026-03-01' }, '062616427c1cf19db58ae77a448cfcba9d4e7d24'],
  'A en A2, con campo': [{ raw: currentAt('2026-05-20'), myTeam: { ...LAS_MESAS, cat: 'benjamin', groupId: 'A2' }, today: '2026-05-20' }, '6d60fb613c156c2f417aacf20283b56c12638296'],
  B: [{ raw: nextSeasonRaw({ benjamin: ['A1', 'B2', 'FF15'], prebenjamin: ['PG2', 'PG3'] }), myTeam: { ...LAS_MESAS, season: '2026-2027' }, today: '2026-10-01', portalSeason: '2026-2027', goles: false }, '8f38ff09c03b854b3c67b06379db98f43a7906a5'],
  'B de CD Batán': [{ raw: currentAt('2026-03-01'), myTeam: { ...LAS_MESAS, name: 'CD Batán' }, today: '2026-03-01' }, 'ec9408309fb1e01858c0f10de2323a8cb2b9b978'],
  C: [{ raw: currentAt('2026-06-03'), today: '2026-06-03' }, '78c2ccf15140bcba7f4ab32cec7d977cb15b925d'],
  'C con stale': [{ raw: currentAt('2026-06-03'), today: '2026-06-03', stale: true }, '55cd7df7d8cd584c80a5b1387b314fdd2c98c007'],
  D: [{ today: '2026-09-23' }, 'f87e4cdba48b2842da8307c4622412e7a028af29'],
  'D con stale': [{ today: '2026-09-23', stale: true }, '4a012403a8464d66a961e6754f4ad1ef3da84cd8'],
  'D con 2026/27 lista': [{ today: '2026-06-15', withHealth: { ...fixture('health'), nextSeason: { name: '2026-2027', status: 'ready' } } }, '23d56557e72ace1bacfa47bf48efcdb93f5d74b0'],
  'D sin data-health': [{ today: '2026-09-23', withHealth: null, legacyDate: '23/09/2026' }, '242aed028208c777fcfe06596347f7567bd076da'],
  E: [{ myTeam: { name: 'Las Mesas Hu. B', season: '2025-2026', cat: 'benjamin', groupId: 'FF13' }, today: '2026-09-23' }, 'bede1e6746de45c5d2cf5882130d5d6594e6257d'],
  X: [{ raw: nextSeasonRaw({ benjamin: ['A1'], prebenjamin: ['PG3'] }), today: '2026-10-01', portalSeason: '2026-2027', goles: false }, 'b60fcec7f40d3730d9150338f6377318bec65bad'],
  'D sin «Verano»': [{ myTeam: { ...LAS_MESAS, name: 'RC Victoria' }, today: '2026-09-23' }, 'd286ecc605a4802ca61f4f102e7000f7e0d5d8c5'],
  'C, próximo partido sin fecha publicada': [{ raw: undatedJ30(), today: '2026-05-31' }, 'c2444e026d549f3ac3dc941e2a92e056c9d04fc8'],
  'C, resultado pendiente de publicar': [{ raw: currentAt('2026-06-02'), today: '2026-06-03' }, '5744594dda12a29f299cc39c80e98519e0b0fd47'],
  'A con menos de cinco resultados': [{ raw: currentAt('2025-10-25'), today: '2025-10-25' }, 'f245004e9b5e0b3d21c3241147ed7940179da926'],
  'A con la hora por confirmar': [{ raw: untimedJ18(), today: '2026-03-01' }, 'f40e8faf1c07dda0534dc3df64a38879a1a470d2'],
};

test('la portada pinta, byte a byte, lo que fijan sus huellas en A, B, C, D, E y X', () => {
  for (const [name, [options, sha1]] of Object.entries(HOME)) {
    const out = s(home.render(homeCtx(options)));
    assert.equal(createHash('sha1').update(out).digest('hex'), sha1, name);
  }
  // Lo que fija cada huella de B5, en claro: que el caso es el que dice su nombre.
  const text = (options) => s(home.render(homeCtx(options)));
  const [verano, sinFecha, pendiente, pocos, sinHora] = ['D sin «Verano»', 'C, próximo partido sin fecha publicada',
    'C, resultado pendiente de publicar', 'A con menos de cinco resultados', 'A con la hora por confirmar'].map((name) => text(HOME[name][0]));
  assert.ok(verano.includes('data-state="D"') && !verano.includes('Verano'));
  assert.ok(sinFecha.includes('data-state="C"') && sinFecha.includes('Próximo partido sin fecha publicada'));
  assert.ok(pendiente.includes('data-state="C"') && pendiente.includes('Resultado pendiente de publicar'));
  assert.ok(pocos.includes('data-state="A"') && pocos.includes('Últimos resultados') && !pocos.includes('Últimos cinco'));
  assert.match(sinHora, /<div class="cell is-muted"><dt class="cell-label">Hora<\/dt><dd class="cell-value">por confirmar<\/dd><\/div>/);
  // Lo de la ficha (2026-10-04), en claro. A: el calendario completo con su .ics y la consulta entera,
  // con el hueco de la plantilla (homeCtx no trae actas).
  const [a, b, d] = ['A', 'B', 'D'].map((name) => text(HOME[name][0]));
  const calendar = (out) => out.match(/<section class="block" id="calendario">[\s\S]*?<\/section>/)[0];
  assert.equal((calendar(a).match(/<a class="match-row"/g) || []).length, 26);
  assert.match(calendar(a), /data-action="calendario-equipo"/);
  const side = (out) => titles(out.match(/<div class="home-side">([\s\S]*)<\/div><div class="home-rest">/)[1]);
  assert.deepEqual(side(a), ['Clasificación', 'Goleadores del equipo', 'La temporada en cifras', 'Evolución de puntos', 'Plantilla', 'Trayectoria']);
  assert.match(a, /<section class="block" id="plantilla" data-slot="plantilla" aria-busy="true">/);
  // B: sin nada jugado, ni evolución ni plantilla; D: el calendario, sin «Ver toda la temporada».
  assert.deepEqual(side(b), ['Clasificación', 'Trayectoria']);
  assert.doesNotMatch(b, /Plantilla/);
  assert.doesNotMatch(d, /home-all/);
  assert.match(d, /<div class="home-rest"><section class="block" id="calendario">/);
});

// ── teamState (decisión 9) ──────────────────────────────────────────────

test('teamState: D, B, C o A de cualquier equipo en su grupo, sin resolución; homeState la usa tras E y X', () => {
  const at = (today, raw = currentAt(today)) => buildSeason({ name: '2025-2026', current: true, ...raw });
  const state = (season, g, name, today, portalSeason = '2025-2026') => teamState({ group: season.groups.find((x) => x.id === g), name, todayISO: today, portalSeason });
  const march = at('2026-03-01');
  assert.equal(state(march, 'PG2', 'Las Mesas Hu.', '2026-03-01'), 'A');
  assert.equal(state(march, 'PG2', 'AD Huracán', '2026-03-01'), 'A', 'su partido es ese mismo día');
  assert.equal(state(march, 'PG2', 'CD Batán', '2026-03-01'), 'B', 'retirado: nada jugado ni próximo');
  assert.equal(state(march, 'FF5', 'Las Mesas Hu.', '2026-03-01'), 'C', 'la Primera Fase terminada antes de junio');
  assert.equal(state(at('2026-06-03'), 'PG2', 'Las Mesas Hu.', '2026-06-03'), 'C');
  assert.equal(state(at('2026-09-23', fixture('current-2025-2026')), 'PG2', 'AD Huracán', '2026-09-23'), 'D');
  // Una temporada pasada siempre está terminada; la 2026/27 simulada, sin nada jugado, en B.
  const past = buildSeason({ name: '2024-2025', ...pastSeasonRaw() });
  assert.equal(state(past, 'P1', 'Moya', '2026-03-01'), 'D');
  const next = buildSeason({ name: '2026-2027', current: true, ...nextSeasonRaw({ prebenjamin: ['PG2'] }) });
  assert.equal(state(next, 'PG2', 'AD Huracán', '2026-10-01', '2026-2027'), 'B');
  // homeState: E y X por la resolución; el resto, teamState del grupo resuelto.
  const group = march.groups.find((x) => x.id === 'PG2');
  assert.equal(homeState({ resolution: { status: 'ask', candidates: [] }, todayISO: '2026-03-01', portalSeason: '2025-2026' }), 'E');
  assert.equal(homeState({ resolution: { status: 'absent' }, todayISO: '2026-03-01', portalSeason: '2025-2026' }), 'X');
  assert.equal(homeState({ resolution: { status: 'ok', group, name: 'CD Batán', cat: 'prebenjamin' }, todayISO: '2026-03-01', portalSeason: '2025-2026' }), 'B');
});

// ── ui.js: block sin título (decisión 10) y el texto oculto de la fila resaltada ──

test('block(null, …): la sección sin cabecera ni contexto, con su ancla si la lleva', () => {
  assert.equal(s(block(null, empty('Nada'))), '<section class="block"><p class="empty">Nada</p></section>');
  assert.equal(s(block('', empty('Nada'), { context: 'se ignora' })), '<section class="block"><p class="empty">Nada</p></section>');
  assert.equal(s(block(null, empty('Nada'), { id: 'calendario' })), '<section class="block" id="calendario"><p class="empty">Nada</p></section>');
  assert.equal(s(block('Calendario', empty('Nada'), { context: '2 partidos' })),
    '<section class="block"><div class="block-head"><h2 class="block-title">Calendario</h2><p class="block-context">2 partidos</p></div><p class="empty">Nada</p></section>');
});

test('standingsTable: la fila resaltada dice «mi equipo» por defecto y, con mineText, de quién es', () => {
  const rows = [{ pos: 1, team: 'AD Huracán', pts: 3, pj: 1, g: 1, e: 0, p: 0, gf: 5, gc: 0, dg: 5, retired: false }];
  assert.match(s(standingsTable(rows, { mine: 'AD Huracán' })), /<span class="vh"> \(mi equipo\)<\/span>/);
  const other = s(standingsTable(rows, { mine: 'AD Huracán', mineText: 'este equipo' }));
  assert.match(other, /<tr class="is-mine"><td class="st-pos">1<\/td><th scope="row" class="st-team"><span class="st-label">.*<\/span><span class="vh"> \(este equipo\)<\/span><\/th>/);
  assert.doesNotMatch(other, /mi equipo/);
});

// ── La vista de equipo (decisión 8) ─────────────────────────────────────

const equipoCtx = (params, today, raw = currentAt(today), extra = {}) => ctxFor('equipo', params, {
  today, datasets: datasetsFor({ current: raw, ...goleadores() }), ...extra,
});
const viewOf = (ctx, options = {}) => {
  const group = findGroup(ctx.model, ctx.params.s, ctx.params.g);
  return teamView(ctx, { group, name: ctx.params.t }, { shields: ctx.datasets.shields, ...options });
};

test('teamHeader: «Cambiar» a Explorar con el buscador, «Hacer mi equipo» como botón, ninguna acción y el «‹»', () => {
  assert.equal(SEARCH_HREF, '#/explorar#buscar');
  const change = s(teamHeader('Las Mesas Hu.', 'Grupo', { action: 'change' }));
  assert.match(change, /<a class="screen-action" href="#\/explorar#buscar">Cambiar<\/a><\/header>$/);
  const make = s(teamHeader('AD Huracán', 'Grupo', { action: 'make', back: '#/explorar' }));
  assert.match(make, /^<header class="screen-head"><a class="back" href="#\/explorar" data-action="back" aria-label="Volver">‹<\/a><span class="mono mono-46" aria-hidden="true">HU<\/span>/);
  assert.match(make, /<button type="button" class="screen-action team-make" data-action="hacer-mi-equipo">Hacer mi equipo<\/button><\/header>$/);
  assert.doesNotMatch(s(teamHeader('Las Mesas Hu.', 'Grupo')), /screen-action|class="back"/);
});

test('A de otro equipo con las opciones de la ficha (AD Huracán, 01/03/2026): su partido, su fila «este equipo» y el calendario en render', () => {
  const ctx = equipoCtx(HURACAN, '2026-03-01');
  const view = viewOf(ctx, { action: 'make' });
  assert.equal(view.state, 'A');
  assert.match(s(view.head), /^<header class="screen-head"><a class="back" href="#\/explorar"[^>]*>‹<\/a><img class="crest crest-46"[^>]*>/);
  assert.match(s(view.head), /<h1>AD Huracán<\/h1><p class="screen-sub">Prebenjamín, Grupo 2 de Gran Canaria<\/p><\/div><button type="button" class="screen-action team-make" data-action="hacer-mi-equipo">Hacer mi equipo<\/button><\/header>$/);
  assert.deepEqual(view.main.map(titles).flat(), ['Próximo partido', 'Últimos cinco']);
  assert.match(text(view.main[0]), /^Próximo partido hoy Jornada 17 Fecha dom 1 mar Hora 10:30 Local RC Victoria – Visitante AD Huracán/);
  // «calendario completo» es el ancla de la misma página, no otra entrada del historial.
  assert.match(s(view.main[1]), /<p class="block-context"><a class="more" href="#calendario">calendario completo<\/a><\/p>/);
  assert.deepEqual(view.aside.map(titles).flat(), ['Clasificación', 'Goleadores del equipo', 'La temporada en cifras']);
  assert.match(s(view.aside[0]), /<tr class="is-mine"><td class="st-pos">3<\/td>.*?<span class="st-name">AD Huracán<\/span><\/a><span class="vh"> \(este equipo\)<\/span>/);
  assert.match(text(view.aside[1]), /^Goleadores del equipo ver todos Goleadores de AD Huracán Jugador Goles PJ Lucas León Rodríguez 50 20/);
  // El calendario completo, siempre en render y en `rest`, con su ancla; sin el hueco de escritorio.
  assert.equal(view.rest.length, 1);
  assert.match(s(view.rest[0]), /^<section class="block" id="calendario"><div class="block-head"><h2 class="block-title">Calendario<\/h2><p class="block-context">26 partidos<\/p><\/div>/);
  assert.equal((s(view.rest[0]).match(/<a class="match-row" href="#\/partido\?s=2025-2026&amp;g=PG2&amp;/g) || []).length, 26);
  assert.doesNotMatch([...view.main, ...view.aside].map(s).join(''), /data-slot/);
  // Con las opciones de la portada, lo mismo: el calendario en `rest` y el ancla de la página.
  const portada = viewOf(ctx, { action: 'change' });
  assert.equal(portada.rest.length, 1);
  assert.match(s(portada.main[1]), /href="#calendario"/);
});

test('C y D de la ficha: sin aviso stale ni caja de la temporada siguiente, y D sin «Ver toda la temporada»', () => {
  const c = viewOf(equipoCtx(HURACAN, '2026-06-03'), { action: 'make' });
  assert.equal(c.state, 'C');
  assert.match(text(c.main[0]), /^Último partido jornada 30 · mar 2 jun Local Las Mesas Hu\. 2–7 Visitante AD Huracán Ya ha jugado todos sus partidos$/);
  const ctx = equipoCtx(HURACAN, '2026-09-23', fixture('current-2025-2026'));
  const d = viewOf(ctx, { action: 'make' });
  assert.equal(d.state, 'D');
  assert.match(s(d.head), /<h1>AD Huracán<\/h1><p class="screen-sub">Temporada 2025\/26 terminada<\/p>/);
  assert.deepEqual(d.main.map(titles).flat(), ['Así terminó 2025/26']);
  assert.match(text(d.main.join('')), /Posición 3\.º de 15 Puntos 71 Balance 23G 2E 3P/);
  assert.doesNotMatch(d.main.join(''), /home-all|Temporada 2026\/27/);
  assert.deepEqual(d.aside.map(titles).flat(), ['Clasificación final']);
  assert.match(s(d.aside[0]), /<span class="vh"> \(este equipo\)<\/span>/);
  assert.match(s(d.rest[0]), /^<section class="block" id="calendario">/);
  // La misma D con las opciones de la portada: la caja de 2026/27 y el aviso stale; sin «Ver toda la
  // temporada», porque el calendario completo ya está en la página.
  const portada = viewOf(ctx, { action: 'change', nextSeason: true, stale: true, mine: true });
  assert.match(s(portada.head), /<p class="screen-sub">A la espera de la temporada 2026\/27<\/p>.*<b>¿Sigue tu equipo en la Segunda Fase\?<\/b>/);
  assert.deepEqual(portada.main.map(titles).flat(), ['Temporada 2026/27', 'Así terminó 2025/26']);
  assert.doesNotMatch(portada.main.join(''), /home-all/);
  assert.match(s(portada.aside[0]), /<span class="vh"> \(mi equipo\)<\/span>/);
  assert.match(s(portada.rest[0]), /^<section class="block" id="calendario">/);
});

test('teamColumns: sin `rest`, las dos columnas de siempre; con él, la tercera parte y .has-rest', () => {
  assert.equal(s(teamColumns(['a'], ['b'])), '<div class="home-cols"><div class="home-main">a</div><div class="home-side">b</div></div>');
  assert.equal(s(teamColumns(['a'], ['b'], ['', null])), '<div class="home-cols"><div class="home-main">a</div><div class="home-side">b</div></div>');
  assert.equal(s(teamColumns(['a'], ['b'], ['c'])),
    '<div class="home-cols has-rest"><div class="home-main">a</div><div class="home-side">b</div><div class="home-rest">c</div></div>');
});

test('teamCalendar: el ancla #calendario también sin partidos (CD Batán, retirado)', () => {
  const pg2 = buildSeason({ name: '2025-2026', current: true, ...currentAt('2026-03-01') }).groups.find((g) => g.id === 'PG2');
  assert.equal(s(teamCalendar('CD Batán', pg2, { today: '2026-03-01' })),
    '<section class="block" id="calendario"><div class="block-head"><h2 class="block-title">Calendario</h2></div><p class="empty">Sin partidos en el calendario de este grupo</p></section>');
});

// Una sección falsa: lo justo para mountTeamView (el clic delegado y la región de estado).
function fakeSection() {
  const status = { textContent: '' };
  const section = {
    onClick: null, status,
    addEventListener(type, fn) { if (type === 'click') section.onClick = fn; },
    contains: () => true,
    querySelector: (selector) => (selector === '.share-status' ? status : null),
  };
  return section;
}

test('mountTeamView: «Compartir» comparte el próximo partido del equipo de la vista, no el de mi equipo', async () => {
  const ctx = equipoCtx(HURACAN, '2026-03-01');
  const group = findGroup(ctx.model, '2025-2026', 'PG2');
  const section = fakeSection();
  const saved = { navigator: Object.getOwnPropertyDescriptor(globalThis, 'navigator'), location: globalThis.location };
  Object.defineProperty(globalThis, 'navigator', { configurable: true, writable: true,
    value: { clipboard: { writeText: async () => { throw new Error('denegado'); } } } });
  globalThis.location = { href: 'https://x.test/futbol-base/index.html#/equipo?g=PG2' };
  try {
    assert.equal(mountTeamView(section, ctx, { group, name: 'AD Huracán' }), undefined);
    const button = { getAttribute: (name) => ({ 'data-action': 'compartir' })[name] };
    section.onClick({ target: { closest: () => button } });
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(section.status.textContent, 'No se pudo copiar el enlace: https://x.test/futbol-base/index.html'
      + '#/partido?s=2025-2026&g=PG2&r=Jornada%2017&h=RC%20Victoria&a=AD%20Hurac%C3%A1n');
  } finally {
    if (saved.navigator) Object.defineProperty(globalThis, 'navigator', saved.navigator);
    else delete globalThis.navigator;
    if (saved.location === undefined) delete globalThis.location;
    else globalThis.location = saved.location;
  }
});

// ── Estilos de la vista ─────────────────────────────────────────────────

const RULES = cssRules();
const DESKTOP = (m) => m !== null && /min-width:\s*1024px/.test(m);
const decl = (selector, media = (m) => m === null) => {
  const found = RULES.filter((r) => media(r.media) && r.selector.split(',').map((x) => x.trim()).includes(selector));
  assert.ok(found.length, `no hay regla para «${selector}»`);
  return found.map((r) => r.body).join(';');
};

test('cada clase de la vista existe en acta.css, y `rest` va debajo de lo principal en escritorio y al final en móvil', () => {
  const views = [
    viewOf(equipoCtx(HURACAN, '2026-03-01'), { action: 'make' }),
    viewOf(equipoCtx(HURACAN, '2026-09-23', fixture('current-2025-2026')), { action: 'make' }),
  ];
  const out = views.map((v) => s(v.head) + s(teamColumns(v.main, v.aside, v.rest))).join('');
  const missing = [...new Set([...out.matchAll(/class="([^"]+)"/g)].flatMap((m) => m[1].split(/\s+/)))].filter((c) => !RULES.classes.has(c));
  assert.deepEqual(missing, []);
  assert.match(decl('.home-rest'), /min-width:\s*0/);
  assert.doesNotMatch(RULES.filter((r) => r.media === null && /has-rest|home-rest/.test(r.selector)).map((r) => r.body).join(';'), /grid-row|order/,
    'en móvil, el orden del documento: lo principal, la consulta y `rest`');
  assert.match(decl('.home-cols.has-rest', DESKTOP), /grid-template-rows:\s*auto 1fr/);
  assert.match(decl('.has-rest > .home-side', DESKTOP), /grid-row:\s*1 \/ span 2/);
  assert.match(decl('.has-rest > .home-rest', DESKTOP), /grid-column:\s*1/);
  assert.match(decl('.has-rest > .home-rest', DESKTOP), /grid-row:\s*2/);
});

// ── Plan B5, Tarea 3: el estado, una vez por pintado de la portada (decisión 6) ──

test('teamView con `state`: la vista del estado que le dan, sin volver a calcularlo; sin él, teamState', () => {
  const ctx = equipoCtx(HURACAN, '2026-09-23', fixture('current-2025-2026'));
  const own = viewOf(ctx, { action: 'make' });
  assert.equal(own.state, 'D');
  assert.deepEqual(own.main.map(titles).flat(), ['Así terminó 2025/26']);
  // Con el estado de quien ya lo calculó (la portada, con homeState), ese: aquí, uno que no es el suyo.
  const given = viewOf(ctx, { action: 'make', state: 'A' });
  assert.equal(given.state, 'A');
  assert.deepEqual(given.main.map(titles).flat(), ['Próximo partido', 'Últimos cinco']);
  // La portada le pasa el suyo: el mismo pintado, byte a byte, que sin él (las huellas de arriba).
  const home = homeCtx({ today: '2026-09-23' });
  const r = home.resolution;
  const state = homeState({ resolution: r, todayISO: home.today, portalSeason: home.portal.season });
  const opts = { action: 'change', nextSeason: true, mine: true, shields: home.datasets.shields };
  assert.deepEqual(teamView(home, { group: r.group, name: r.name }, { ...opts, state }), teamView(home, { group: r.group, name: r.name }, opts));
});
