// Plan B3, Tarea 10: la pantalla Récords (spec §4.7 y §4.11; decisión 26 de B3). seasonRecords
// calcula con el modelo sobre las fixtures congeladas (la temporada actual y el archivo de 2024-25 y
// 2023-24), nunca con data-stats.js; render(ctx) es pura y se prueba con ctxFor, los goleadores
// congelados y `today` inyectado; y la temporada pasada la carga el router (decisión 2 de B3).
import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';
import { ctxFor, datasetsFor, cssRules, PORTAL_SEASON, DEFAULT_TEAM } from './fixtures/rediseno/screens.mjs';
import { goleadores, archive, nextSeasonRaw } from './fixtures/rediseno/simulate.mjs';
import { fakeBrowser, memoryStorage } from './fixtures/rediseno/fake-browser.mjs';
import { escape } from '../../src/html.js';
import { seasonRecords, bestStreaks, homeAwayTable, playerName } from '../../src/model.js';
import { categoryScorers, rankScorers } from '../../src/state.js';
import { defaultCategory } from '../../src/myteam.js';
import { matchHref, teamHref } from '../../src/links.js';
import { startContext } from '../../src/app.js';
import { startRouter } from '../../src/router.js';
import { SCREEN_MAP } from '../../src/screens.js';
import { screen, TOP_SCORERS } from '../../src/screen-records.js';

// Los goleadores congelados y el archivo de 2024-25 y 2023-24, cargado y anunciado en SEASONS.
const data = (extra = {}) => datasetsFor({ ...goleadores(), seasonRaw: { '2024-2025': archive('2024-2025'), '2023-2024': archive('2023-2024') }, ...extra });
const ctx = (params, opts = {}) => ctxFor('records', { s: PORTAL_SEASON, ...params }, { datasets: data(), ...opts });
const render = (params, opts) => String(screen.render(ctx(params, opts)));
const seasonOf = (name) => ctx({}).model.season(name);
const brief = (m) => m && `${m.home} ${m.hs}–${m.as} ${m.away} (${m.groupId}, ${m.roundKey}, ${m.dateISO})`;
const text = (h) => String(h).replace(/<[^>]*>/g, ' ').replace(/&quot;/g, '"').replace(/&#39;/g, "'")
  .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim();
// El bloque de título `title`, entero.
const blockOf = (out, title) => (out.match(new RegExp(`<section class="block"><div class="block-head"><h2 class="block-title">${title}</h2>.*?</section>`)) || [''])[0];
// Las filas de récord de un bloque: [qué es, quién, cifra, detalle, href].
const rowsOf = (html) => [...html.matchAll(/<a class="rc-row" href="([^"]*)">(?:<span class="rc-what">([^<]*)<\/span>)?<span class="rc-subject">(.*?)<\/span><span class="rc-figure">([^<]*)<\/span><span class="rc-detail">([^<]*)<\/span><\/a>/g)]
  .map(([, href, what, subject, figure, detail]) => [what || null, text(subject), figure, detail, href]);

test('seasonRecords, prebenjamín 2025-26 (PG2, PG3 y PFV2): totales, mayor goleada y partido con más goles, con el orden de los grupos al empatar', () => {
  const season = seasonOf(PORTAL_SEASON);
  const r = seasonRecords(season, 'prebenjamin');
  assert.deepEqual([r.totals.matches, r.totals.goals, r.totals.avg.toFixed(4)], [406, 3253, '8.0123']);
  assert.equal(brief(r.biggestWin), 'UD Vecindario 21–0 Ingenio B (PG3, Jornada 2, 2025-10-18)');
  // El 21–0 de PG3 también suma 21 goles: a igualdad, el primero en el orden de los grupos (PG2).
  assert.equal(brief(r.mostGoals), 'CD Calero 1–20 AD Huracán (PG2, Jornada 5, 2025-11-18)');
  // Más goles a favor y menos en contra, de la clasificación, con 10 partidos o más.
  assert.deepEqual(r.bestAttack, { team: 'AD Huracán', groupId: 'PG2', pj: 28, gf: 226, gc: 43 });
  assert.deepEqual(r.bestDefense, { team: 'CD 35600', groupId: 'PFV2', pj: 12, gf: 68, gc: 21 });
  // Las rachas son las de bestStreaks, tal cual.
  assert.deepEqual(r.streaks, bestStreaks(season, 'prebenjamin'));
  assert.deepEqual(r.streaks.wins.slice(0, 3).map((x) => `${x.team} ${x.n}`), ['UD Vecindario 26', 'Unión Viera 18', 'Acodetti 15']);
  assert.deepEqual(r.streaks.unbeaten.slice(0, 3).map((x) => `${x.team} ${x.n}`), ['UD Vecindario 26', 'Unión Viera 23', 'Acodetti 15']);
});

test('seasonRecords: los 3 mejores en casa y fuera por puntos por partido (homeAwayTable), con 5 partidos o más', () => {
  const season = seasonOf(PORTAL_SEASON);
  const r = seasonRecords(season, 'prebenjamin');
  const show = (rows) => rows.map((x) => `${x.team} ${x.groupId} ${x.pts}/${x.pj}`);
  // Los tres a 3,00 en casa con 39 puntos: a igualdad, la diferencia de goles.
  assert.deepEqual(show(r.bestHome), ['UD Vecindario PG3 39/13', 'Unión Viera PG2 39/13', 'Acodetti PG2 39/13']);
  assert.deepEqual(show(r.bestAway), ['UD Vecindario PG3 39/13', 'CD 35600 PFV2 18/6', 'Unión Viera PG2 34/13']);
  const uv = homeAwayTable(season.groups.find((g) => g.id === 'PG2'), 'casa').find((x) => x.team === 'Unión Viera');
  assert.deepEqual(r.bestHome[1], { team: 'Unión Viera', groupId: 'PG2', pj: uv.pj, pts: uv.pts, ppj: 3, g: uv.g, e: uv.e, p: uv.p, gf: uv.gf, gc: uv.gc });
});

test('seasonRecords, benjamín 2025-26: la Primera Fase (5 partidos) no llega a los mínimos; Las Palmas, 0–24 y el ataque y la defensa', () => {
  const season = seasonOf(PORTAL_SEASON);
  const r = seasonRecords(season, 'benjamin');
  assert.deepEqual([r.totals.matches, r.totals.goals], [544, 4943]);
  assert.equal(brief(r.biggestWin), 'Atl. Marzasport 0–24 Las Palmas (A2, Jornada 4, 2026-01-09)');
  assert.equal(r.mostGoals, r.biggestWin, 'la mayor goleada es también el partido con más goles');
  assert.deepEqual(r.bestAttack, { team: 'Las Palmas', groupId: 'A2', pj: 22, gf: 288, gc: 17 });
  assert.deepEqual(r.bestDefense, r.bestAttack);
  // Sin el mínimo de 10, ganaría AD Huracán de FF9, con 2 goles en contra en 5 partidos.
  const ff9 = season.groups.find((g) => g.id === 'FF9').standings.find((row) => row.team === 'AD Huracán');
  assert.deepEqual([ff9.pj, ff9.gc], [5, 2]);
  // Casa y fuera, con 5 partidos o más: la Primera Fase juega 2 o 3 de cada lado.
  assert.deepEqual([...r.bestHome, ...r.bestAway].filter((x) => x.groupId.startsWith('FF')), []);
  assert.deepEqual(r.bestHome.map((x) => `${x.team} ${x.groupId} ${x.pts}/${x.pj}`), ['Las Palmas A2 33/11', 'Las Torres B2 33/11', 'Unión Viera A1 30/10']);
  assert.deepEqual(r.streaks.wins.slice(0, 2).map((x) => `${x.team} ${x.groupId} ${x.n}`), ['Las Palmas A2 22', 'Las Torres B2 22']);
});

test('seasonRecords, temporadas pasadas con el archivo: 2024-25 y 2023-24; sin copas ni liguillas; sin ligas, todo vacío', () => {
  const past = seasonOf('2024-2025');
  const b = seasonRecords(past, 'benjamin');
  assert.deepEqual([b.totals.matches, b.totals.goals, b.totals.avg.toFixed(2)], [270, 1985, '7.35'], 'A1, C2, P1, P3 y P9, sin BCC1');
  assert.equal(brief(b.biggestWin), 'Las Palmas 25–0 Telde C (P9, 6, 2024-11-30)');
  assert.deepEqual(b.bestAttack, { team: 'AD Huracán', groupId: 'A1', pj: 16, gf: 144, gc: 9 });
  assert.deepEqual(b.bestDefense, b.bestAttack);
  assert.deepEqual([b.streaks.wins[0], b.streaks.unbeaten[0]].map((x) => `${x.team} ${x.groupId} ${x.n}`), ['ATLETICO G.C., C.F. "C" C2 11', 'AD Huracán A1 16']);
  // Con 5 partidos en casa se entra (Las Palmas, P9); con 4, no: sin el mínimo, Garepa Viera (P3,
  // 12 de 12) entraría a 3,00 en lugar de AD Huracán (2,75).
  assert.deepEqual(b.bestHome.map((x) => `${x.team} ${x.groupId} ${x.pts}/${x.pj}`), ['Las Palmas P9 15/5', 'Moya P1 15/5', 'AD Huracán A1 22/8']);
  const garepa = homeAwayTable(past.groups.find((g) => g.id === 'P3'), 'casa').find((x) => x.team === 'Garepa Viera');
  assert.deepEqual([garepa.pts, garepa.pj], [12, 4]);
  assert.equal(brief(seasonRecords(past, 'prebenjamin').biggestWin), 'Unión Viera 22–0 Arucas B (PGC2, 7, 2024-12-07)');
  // 2023-24: BC1 (Copa de Campeones) y CFV1 (Copa Fuerteventura) son liguillas de copa y no cuentan.
  const old = seasonOf('2023-2024');
  assert.deepEqual(old.groups.filter((g) => g.kind !== 'league').map((g) => g.id), ['BC1', 'CFV1']);
  const o = seasonRecords(old, 'benjamin');
  assert.deepEqual([o.totals.matches, o.totals.goals], [275, 2037]);
  assert.equal(brief(o.biggestWin), 'Garepa Viera 32–0 UD Piletas (GC3, 9, 2023-12-16)');
  assert.deepEqual(o.bestAttack, { team: 'Las Palmas', groupId: 'GC3', pj: 10, gf: 150, gc: 4 }, 'con 10 partidos justos');
  assert.deepEqual(seasonRecords(old, 'prebenjamin'), {
    totals: { matches: 0, goals: 0, avg: null }, biggestWin: null, mostGoals: null, bestAttack: null, bestDefense: null,
    bestHome: [], bestAway: [], streaks: { wins: [], unbeaten: [] },
  });
});

test('seasonRecords: la Copa de Campeones 2025-26 no cambia nada (solo cuentan las ligas)', () => {
  const withCup = ctx({}, { datasets: data({ champions: true }) }).model.season(PORTAL_SEASON);
  assert.ok(withCup.groups.some((g) => g.id === 'BCA1'));
  for (const cat of ['benjamin', 'prebenjamin']) {
    assert.deepEqual(seasonRecords(withCup, cat), seasonRecords(seasonOf(PORTAL_SEASON), cat), cat);
  }
});

test('la temporada actual: cabecera, selector de categoría (la de mi equipo), totales y los récords con su enlace', () => {
  const out = render({});
  assert.match(out, /^<section data-screen="records"><header class="screen-head"><a class="back" href="#\/explorar" data-action="back" aria-label="Volver">‹<\/a><div class="screen-head-text"><h1>Récords<\/h1><p class="screen-sub">Temporada 2025\/26<\/p><\/div><a class="screen-action" href="#\/temporadas">Otra temporada<\/a><\/header>/);
  assert.equal((out.match(/<h1[ >]/g) || []).length, 1);
  assert.match(out, /<nav class="rc-cats" aria-label="Categoría"><div class="segmented"><a class="segment" id="categoria-benjamin" href="#\/records\?s=2025-2026&amp;c=benjamin">Benjamín<\/a><a class="segment" id="categoria-prebenjamin" href="#\/records\?s=2025-2026&amp;c=prebenjamin" aria-current="true">Prebenjamín<\/a><\/div><\/nav>/);
  assert.match(out, /<h2 class="block-title">Totales<\/h2><p class="block-context">partidos de liga con resultado<\/p><\/div><div class="box"><dl class="cells cells-3"><div class="cell"><dt class="cell-label">Partidos<\/dt><dd class="cell-value">406<\/dd><\/div><div class="cell"><dt class="cell-label">Goles<\/dt><dd class="cell-value">3\.253<\/dd><\/div><div class="cell"><dt class="cell-label">Por partido<\/dt><dd class="cell-value">8,01<\/dd><\/div><\/dl><\/div>/);
  const r = seasonRecords(seasonOf(PORTAL_SEASON), 'prebenjamin');
  assert.deepEqual(rowsOf(blockOf(out, 'Partidos')), [
    ['Mayor goleada', 'UD Vecindario – Ingenio B', '21–0', 'Grupo 3 de Gran Canaria · jornada 2 · sáb 18 oct', escape(matchHref(r.biggestWin))],
    ['Partido con más goles', 'CD Calero – AD Huracán', '1–20', 'Grupo 2 de Gran Canaria · jornada 5 · mar 18 nov', escape(matchHref(r.mostGoals))],
  ]);
  assert.equal(matchHref(r.biggestWin), '#/partido?s=2025-2026&g=PG3&r=Jornada%202&h=UD%20Vecindario&a=Ingenio%20B');
  const teams = blockOf(out, 'Ataque y defensa');
  assert.match(teams, /<p class="block-context">10 partidos o más<\/p>/);
  assert.deepEqual(rowsOf(teams), [
    ['Más goles a favor', 'AD Huracán', '226', 'en 28 partidos · Grupo 2 de Gran Canaria', escape(teamHref(PORTAL_SEASON, 'PG2', 'AD Huracán'))],
    ['Menos goles en contra', 'CD 35600', '21', 'en 12 partidos · Grupo 2 de Fuerteventura', escape(teamHref(PORTAL_SEASON, 'PFV2', 'CD 35600'))],
  ]);
  assert.match(teams, /<span class="rc-subject"><img class="crest crest-16" src="\.\/escudos\/s\/huracan\.png"/);
});

test('rachas, casa y fuera: los 3 primeros de cada una, con su cifra, su grupo y la ficha de su equipo', () => {
  const out = render({});
  const rows = (title) => rowsOf(blockOf(out, title)).map(([what, who, figure, detail]) => [what, who, figure, detail]);
  assert.match(blockOf(out, 'Mejor racha de victorias'), /<p class="block-context">victorias seguidas<\/p><\/div><ol class="box rc-list">/);
  assert.deepEqual(rows('Mejor racha de victorias'), [
    [null, 'UD Vecindario', '26', 'Grupo 3 de Gran Canaria'], [null, 'Unión Viera', '18', 'Grupo 2 de Gran Canaria'],
    [null, 'Acodetti', '15', 'Grupo 2 de Gran Canaria']]);
  assert.match(blockOf(out, 'Mejor racha invicta'), /<p class="block-context">partidos sin perder<\/p>/);
  assert.deepEqual(rows('Mejor racha invicta').map(([, who, figure]) => `${who} ${figure}`), ['UD Vecindario 26', 'Unión Viera 23', 'Acodetti 15']);
  assert.match(blockOf(out, 'Mejores en casa'), /<p class="block-context">puntos por partido, con 5 o más<\/p>/);
  assert.deepEqual(rows('Mejores fuera'), [
    [null, 'UD Vecindario', '3,00', '39 puntos en 13 partidos · Grupo 3 de Gran Canaria'],
    [null, 'CD 35600', '3,00', '18 puntos en 6 partidos · Grupo 2 de Fuerteventura'],
    [null, 'Unión Viera', '2,62', '34 puntos en 13 partidos · Grupo 2 de Gran Canaria']]);
  assert.equal(rowsOf(blockOf(out, 'Mejores fuera'))[1][4], escape(teamHref(PORTAL_SEASON, 'PFV2', 'CD 35600')));
});

test('máximos goleadores: los 30 primeros de la categoría (sumando sus fases), con su puesto, su equipo y «ver todos»', () => {
  const table = (out) => [...blockOf(out, 'Máximos goleadores').matchAll(/<tr><td class="st-pos">(\d+)<\/td><th scope="row" class="st-team"><a class="st-link" href="([^"]*)">.*?<span class="st-name">([^<]*)<\/span><span class="rc-team">([^<]*)<\/span><\/span><\/a><\/th><td class="sc-goals">(\d+)<\/td><td class="sc-pj">(\d+)<\/td><\/tr>/g)]
    .map(([, pos, href, name, team, goals, games]) => ({ pos: +pos, href, name, team, goals: +goals, games: +games }));
  for (const [c, first, last, total] of [
    ['prebenjamin', ['Lucas Raffay Buehre', 'CD Cerruda', 66, 20], ['Lucas Sosa Oliva', 'La Garita', 18, 21], 299],
    // Del Rosario Jimenez suma A1 (44) y FF5 (12): pasa a Moreno Rodriguez, la fila más alta (54).
    ['benjamin', ['Mario Del Rosario Jimenez', 'Arucas', 56, 22], ['Diego Montesdeoca Marrero', 'Arucas D', 25, 19], 586],
  ]) {
    const out = render({ c });
    const rows = table(out);
    const all = categoryScorers(ctx({}).model.scorers(PORTAL_SEASON, c));
    assert.equal(rows.length, TOP_SCORERS, c);
    assert.deepEqual([rows[0].name, rows[0].team, rows[0].goals, rows[0].games], first, c);
    assert.deepEqual([rows[29].name, rows[29].team, rows[29].goals, rows[29].games], last, c);
    assert.deepEqual(rows.map((row) => row.name), all.slice(0, 30).map((row) => playerName(row.name)), c);
    // Cada uno abre la ficha de su equipo, en el grupo que da categoryScorers.
    assert.deepEqual(rows.map((row) => row.href), all.slice(0, 30).map((row) => escape(teamHref(PORTAL_SEASON, row.groupId, row.team))), c);
    assert.match(blockOf(out, 'Máximos goleadores'), new RegExp(`<p class="block-context"><a class="more" href="#/goleadores\\?s=2025-2026&amp;c=${c}">ver todos \\(${total}\\)</a></p>`), c);
  }
  // El puesto es el de Goleadores (rankScorers, decisión 144): a igualdad de goles, antes el de menos
  // partidos (42 en 18 es 5.º, y 42 en 19, 6.º).
  assert.deepEqual(table(render({})).slice(3, 7).map((row) => `${row.pos} ${row.goals} ${row.games}`), ['4 50 20', '5 42 18', '6 42 19', '7 41 21']);
  assert.deepEqual(table(render({})).map((row) => row.pos), rankScorers(categoryScorers(ctx({}).model.scorers(PORTAL_SEASON, 'prebenjamin'))).slice(0, 30).map((row) => row.pos));
  assert.match(blockOf(render({}), 'Máximos goleadores'), /<caption class="vh">Máximos goleadores de prebenjamín, temporada 2025\/26<\/caption>/);
});

test('`c` por defecto: la categoría de mi equipo resuelto; si no la hay (X), la del equipo por defecto; `c` manda', () => {
  const a2 = { name: 'Las Mesas Hu.', season: PORTAL_SEASON, cat: 'benjamin', groupId: 'A2' };
  // La regla de Goleadores (defaultCategory, myteam.js), sobre el ctx de la pantalla.
  const byDefault = (c) => defaultCategory(c.resolution, c.portal.defaultTeam);
  assert.equal(byDefault(ctx({}, { myTeam: a2 })), 'benjamin');
  assert.match(render({}, { myTeam: a2 }), /id="categoria-benjamin" href="[^"]*" aria-current="true">Benjamín/);
  assert.match(render({ c: 'prebenjamin' }, { myTeam: a2 }), /id="categoria-prebenjamin" href="[^"]*" aria-current="true">Prebenjamín/);
  // 2026/27 activada con A1 y PG3: Las Mesas no aparece (X). Manda el equipo por defecto (prebenjamín),
  // no la categoría guardada (benjamín), y sin partidos jugados, un solo vacío.
  const x = ctxFor('records', { s: '2026-2027' }, {
    portalSeason: '2026-2027', myTeam: a2, today: '2026-10-01',
    datasets: datasetsFor({ current: nextSeasonRaw({ benjamin: ['A1'], prebenjamin: ['PG3'] }) }),
  });
  assert.equal(x.resolution.status, 'absent');
  assert.equal(DEFAULT_TEAM.cat, 'prebenjamin');
  assert.equal(byDefault(x), 'prebenjamin');
  const out = String(screen.render(x));
  assert.match(out, /id="categoria-prebenjamin" href="#\/records\?s=2026-2027&amp;c=prebenjamin" aria-current="true">/);
  assert.match(out, /<\/nav><div class="block"><p class="empty">Aún no se ha jugado ningún partido de liga de prebenjamín en la temporada 2026\/27\.<\/p><\/div><\/section>$/);
  assert.doesNotMatch(out, /Totales|Máximos goleadores/);
});

test('una temporada pasada: los mismos récords con su temporada en cada enlace, y sin goleadores', () => {
  const out = render({ s: '2024-2025', c: 'benjamin' });
  assert.match(out, /<p class="screen-sub">Temporada 2024\/25<\/p>/);
  assert.match(out, /href="#\/records\?s=2024-2025&amp;c=prebenjamin">Prebenjamín<\/a>/);
  const matches = rowsOf(blockOf(out, 'Partidos'));
  assert.deepEqual(matches[0].slice(0, 4), ['Mayor goleada', 'Las Palmas – Telde C', '25–0', 'Primera Fase, Grupo 9 · jornada 6 · sáb 30 nov']);
  assert.equal(matches[0][4], escape('#/partido?s=2024-2025&g=P9&r=6&h=Las%20Palmas&a=Telde%20C'));
  assert.equal(rowsOf(blockOf(out, 'Ataque y defensa'))[0][4], escape(teamHref('2024-2025', 'A1', 'AD Huracán')));
  assert.match(out, /<h2 class="block-title">Máximos goleadores<\/h2><\/div><p class="empty">Esta web solo guarda los goleadores de la temporada actual\.<\/p>/);
  assert.doesNotMatch(out, /rc-scorers|ver todos/);
});

test('sin ligas de la categoría, sin la temporada o sin goleadores: nunca en blanco', () => {
  const none = render({ s: '2023-2024', c: 'prebenjamin' });
  assert.match(none, /<nav class="rc-cats" aria-label="Categoría">.*<\/nav><div class="block"><p class="empty">No hay ligas de prebenjamín en la temporada 2023\/24\.<\/p><\/div><\/section>$/);
  // Sin la temporada (el router la carga antes; aquí, sin cargar): la caja de error con «Reintentar».
  const missing = String(screen.render(ctxFor('records', { s: '2023-2024' }, { datasets: datasetsFor() })));
  assert.match(missing, /<h1>Récords<\/h1>/);
  assert.match(text(missing), /No se pudieron cargar los datos de la temporada 2023\/24\./);
  assert.match(missing, /data-action="retry"/);
  // La temporada actual sin goleadores publicados (data-goleadores.js sin la categoría).
  const empty = String(screen.render(ctxFor('records', { s: PORTAL_SEASON }, { datasets: datasetsFor() })));
  assert.match(empty, /<h2 class="block-title">Máximos goleadores<\/h2><\/div><p class="empty">Todavía no hay goleadores publicados de prebenjamín\.<\/p>/);
  assert.match(empty, /<h2 class="block-title">Totales<\/h2>/, 'los récords, igual');
});

test('una temporada pasada sin cargar: el router la carga y Récords la pinta, sin caja de error (decisión 2)', async () => {
  const datasets = datasetsFor({ ...goleadores() });
  assert.equal(datasets.seasonRaw['2024-2025'], undefined, '2024-25 anunciada, pero sin cargar');
  const storage = memoryStorage();
  const getContext = () => startContext({ storage, portal: { season: PORTAL_SEASON, defaultTeam: DEFAULT_TEAM }, datasets, today: '2026-09-24' });
  const loads = [];
  const loadSeason = (name, ds) => {
    loads.push(name);
    return [Promise.resolve().then(() => { ds.seasonRaw[name] = archive(name); })];
  };
  const b = fakeBrowser('#/records?s=2024-2025&c=benjamin');
  const router = startRouter({ screens: SCREEN_MAP, root: b.root, getContext, window: b.win, loadSeason });
  await router.idle();
  assert.deepEqual(loads, ['2024-2025']);
  assert.deepEqual(b.entries(), ['#/records?s=2024-2025&c=benjamin']);
  assert.match(b.root.innerHTML, /^<section data-screen="records">/);
  assert.match(b.root.innerHTML, /<span class="rc-name">Las Palmas – Telde C<\/span><\/span><span class="rc-figure">25–0<\/span>/);
  assert.doesNotMatch(b.root.innerHTML, /No se pudieron cargar|route-notice/);
  assert.deepEqual(b.marks(), [['#/explorar', 'true']]);
  assert.equal(b.doc.title, 'Récords · Fútbol Base Las Palmas');
  assert.deepEqual(screen.needs({ s: '2024-2025' }, datasets, { portalSeason: PORTAL_SEASON }), [], 'la pantalla no pide su temporada');
});

test('registro: la ruta #/records pinta Récords y sw.js la precachea', () => {
  assert.equal(SCREEN_MAP.records, screen);
  assert.equal(screen.id, 'records');
  const sw = readFileSync(new URL('../../sw.js', import.meta.url), 'utf8');
  assert.match(sw, /\n {2}'\.\/src\/screen-records\.js',\n/);
});

test('CSS: solo clases que existen, filas de 44 px, y en escritorio los goleadores en su columna', () => {
  const rules = cssRules();
  const outs = [render({}), render({ c: 'benjamin' }), render({ s: '2024-2025', c: 'benjamin' }), render({ s: '2023-2024', c: 'prebenjamin' })];
  const used = new Set(outs.join('').match(/class="[^"]+"/g).flatMap((m) => m.slice(7, -1).split(/\s+/)));
  assert.deepEqual([...used].filter((c) => !rules.classes.has(c)), []);
  const body = (selector, media = null) => rules.filter((r) => r.media === media && r.selector === selector).map((r) => r.body).join(';');
  assert.match(body('.rc-row'), /min-height:\s*44px/);
  assert.match(body('.rc-name'), /text-overflow:\s*ellipsis/, 'un nombre largo no empuja la página a 320 px');
  const wide = rules.find((r) => r.media && /min-width:\s*1024px/.test(r.media) && r.selector === '.rc-cols');
  assert.ok(wide && /grid-template-columns:\s*minmax\(0, 1fr\) minmax\(0, 1fr\)/.test(wide.body));
  assert.ok(!rules.some((r) => r.media === null && r.selector === '.rc-cols' && /display:\s*grid/.test(r.body)), 'en móvil, una columna');
  const mismo = ctx({});
  assert.equal(String(screen.render(mismo)), String(screen.render(mismo)), 'mismo ctx, mismo HTML');
});
