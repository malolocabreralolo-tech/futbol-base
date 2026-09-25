// Plan B3, Tareas 4 y 5: la ficha de Equipo, `#/equipo?s&g&t` (spec §4.6 y §4.8; decisiones 5, 11 y
// 15, y 12 a 14 de B3). render(ctx) es pura y se prueba sobre su HTML con el ctx común (ctxFor), las
// fixtures congeladas y `today` inyectado; mount, con una sección y un nav falsos.
import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { fixture } from './fixtures/rediseno/load.mjs';
import { currentAt, nextSeasonRaw, goleadores, lineupsFor, archive } from './fixtures/rediseno/simulate.mjs';
import { ctxFor, datasetsFor, pastSeasonRaw, cssRules } from './fixtures/rediseno/screens.mjs';
import { anyCards, findGroup, playerMatches, pointsProgression, teamSquad } from '../../src/model.js';
import { teamTrajectory } from '../../src/myteam.js';
import { pointsChart } from '../../src/ui.js';
import { buildCalendar, teamCalendarEvents } from '../../src/links.js';
import { SCREEN_MAP } from '../../src/screens.js';
import { screen, playerDetail, pointsNote, trajectoryContent } from '../../src/screen-equipo.js';

const s = (h) => String(h);
const text = (h) => s(h).replace(/<[^>]*>/g, ' ').replace(/&quot;/g, '"').replace(/&#39;/g, "'")
  .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim();
const titles = (h) => [...s(h).matchAll(/<h2 class="block-title">(.*?)<\/h2>/g)].map((m) => m[1]);
// El bloque <section class="block"> cuyo título es `title`, o null (los bloques no se anidan).
const blockOf = (h, title) => (s(h).match(/<section class="block"[^>]*>[\s\S]*?<\/section>/g) || [])
  .find((b) => b.includes(`<h2 class="block-title">${title}</h2>`)) || null;
const head = (h) => s(h).match(/<header class="screen-head">.*?<\/header>/)[0];
// Las tres partes de la vista de equipo (teamColumns): lo principal, la consulta y lo largo (`rest`).
const columnsOf = (h) => {
  const m = s(h).match(/<div class="home-cols has-rest"><div class="home-main">([\s\S]*)<\/div><div class="home-side">([\s\S]*)<\/div><div class="home-rest">([\s\S]*)<\/div><\/div><\/section>$/);
  return { main: titles(m[1]), side: titles(m[2]), rest: titles(m[3]) };
};
const HURACAN = { s: '2025-2026', g: 'PG2', t: 'AD Huracán' };
const LAS_MESAS = { s: '2025-2026', g: 'PG2', t: 'Las Mesas Hu.' };
const HURACAN_TEAM = { name: 'AD Huracán', season: '2025-2026', cat: 'prebenjamin', groupId: 'PG2' };

// La ficha tal como la pinta el router: la temporada del día `today` con los goleadores congelados.
// Mi equipo es el de ctxFor (Las Mesas Hu., PG2) salvo que se pida otro.
const ctxAt = (params, today, { raw = today < '2026-06-07' ? currentAt(today) : fixture('current-2025-2026'), myTeam, datasets } = {}) =>
  ctxFor('equipo', params, { today, datasets: datasets || datasetsFor({ current: raw, ...goleadores() }), ...(myTeam ? { myTeam } : {}) });
const render = (params, today, options) => s(screen.render(ctxAt(params, today, options)));

test('contrato de pantalla: id equipo, registrada en SCREEN_MAP, y una sección con data-state y un solo h1 en A, B, C y D', () => {
  assert.equal(screen.id, 'equipo');
  assert.equal(SCREEN_MAP.equipo, screen);
  assert.deepEqual(screen.needs({}, { health: fixture('health') }), []);
  assert.equal(typeof screen.mount, 'function');
  const next = nextSeasonRaw({ prebenjamin: ['PG2', 'PG3'] });
  const cases = [
    ['A', render(HURACAN, '2026-03-01')],
    ['B', s(screen.render(ctxFor('equipo', { ...HURACAN, s: '2026-2027' }, { today: '2026-10-01', portalSeason: '2026-2027', datasets: datasetsFor({ current: next, seasons: [{ name: '2026-2027', current: true }] }) })))],
    ['C', render(HURACAN, '2026-06-03')],
    ['D', render(HURACAN, '2026-09-23')],
  ];
  for (const [state, out] of cases) {
    assert.match(out, new RegExp(`^<section data-screen="equipo" data-state="${state}"><header class="screen-head">`), state);
    assert.ok(out.endsWith('</section>'), state);
    assert.equal((out.match(/<h1[\s>]/g) || []).length, 1, state);
    assert.match(out, /<h1>AD Huracán<\/h1>/, state);
  }
});

// M4 de la revisión final de B2: data-health.json una vez por sesión, como la portada.
test('needs: data-health.json una sola vez por sesión (null si falló), y nunca rechaza', async () => {
  const saved = { fetch: globalThis.fetch, warn: console.warn };
  let calls = 0;
  globalThis.fetch = async () => { calls += 1; return { ok: false, status: 503, text: async () => '' }; };
  console.warn = () => {};
  try {
    const datasets = { lineups: { '2025-2026': {} } };
    const loads = screen.needs(HURACAN, datasets);
    assert.equal(loads.length, 1);
    await Promise.all(loads);
    assert.equal(datasets.health, null);
    assert.deepEqual(screen.needs(HURACAN, datasets), [], 'falló: esta sesión no lo vuelve a pedir');
    assert.equal(calls, 1);
  } finally {
    globalThis.fetch = saved.fetch;
    console.warn = saved.warn;
  }
});

test('A de otro equipo (AD Huracán, 01/03/2026): «‹», escudo, nombre, grupo y «Hacer mi equipo»; su partido, su fila y su calendario', () => {
  const out = render(HURACAN, '2026-03-01');
  assert.match(head(out), /^<header class="screen-head"><a class="back" href="#\/explorar" data-action="back" aria-label="Volver">‹<\/a><img class="crest crest-46"/);
  assert.match(head(out), /<h1>AD Huracán<\/h1><p class="screen-sub">Prebenjamín, Grupo 2 de Gran Canaria<\/p><\/div><button type="button" class="screen-action team-make" data-action="hacer-mi-equipo">Hacer mi equipo<\/button><\/header>$/);
  const cols = columnsOf(out);
  assert.deepEqual(cols.main, ['Próximo partido', 'Últimos cinco']);
  assert.deepEqual(cols.side.slice(0, 3), ['Clasificación', 'Goleadores del equipo', 'La temporada en cifras']);
  assert.deepEqual(cols.rest, ['Calendario']);
  assert.match(text(blockOf(out, 'Próximo partido')), /^Próximo partido hoy Jornada 17 Fecha dom 1 mar Hora 10:30 Local RC Victoria – Visitante AD Huracán/);
  // «calendario completo» es el ancla de la propia ficha.
  assert.match(blockOf(out, 'Últimos cinco'), /<a class="more" href="#calendario">calendario completo<\/a>/);
  // Su fila resaltada, con el texto oculto «este equipo»: no es mi equipo (Las Mesas Hu.).
  assert.match(blockOf(out, 'Clasificación'), /<tr class="is-mine"><td class="st-pos">3<\/td>.*?AD Huracán<\/span><\/a><span class="vh"> \(este equipo\)<\/span>/);
  assert.doesNotMatch(out, /\(mi equipo\)/);
  // Dos columnas: lo principal, la consulta y, en `rest`, el calendario completo.
  assert.match(out, /<div class="home-cols has-rest"><div class="home-main">.*<\/div><div class="home-side">.*<\/div><div class="home-rest"><section class="block" id="calendario">/);
  assert.doesNotMatch(out, /data-slot/);
});

test('el calendario completo, siempre en render (#calendario): 26 partidos con su estado y «Calendario del equipo (.ics)» encima', () => {
  const calendar = blockOf(render(HURACAN, '2026-03-01'), 'Calendario');
  assert.match(calendar, /^<section class="block" id="calendario"><div class="block-head"><h2 class="block-title">Calendario<\/h2><p class="block-context">26 partidos<\/p><\/div><div class="box cal-actions"><div class="buttons"><button type="button" class="button" data-action="calendario-equipo">Calendario del equipo \(\.ics\)<\/button><\/div><\/div><ol class="box cal">/);
  const whens = [...calendar.matchAll(/<p class="cal-when">(.*?)<\/p>/g)].map((m) => m[1]);
  assert.deepEqual([whens.length, whens[0], whens.at(-1)], [26, 'Jornada 1 · dom 12 oct', 'Jornada 30 · mar 2 jun']);
  assert.equal((calendar.match(/<span class="match-score">\d+–\d+<\/span>/g) || []).length, 14, 'jugados hasta el 01/03');
  assert.equal((calendar.match(/<span class="match-score is-pending">–<\/span>/g) || []).length, 12);
  // Un retirado sin partidos: el vacío, con el ancla y sin botón.
  const batan = render({ ...HURACAN, t: 'CD Batán' }, '2026-03-01');
  assert.match(batan, /<section class="block" id="calendario"><div class="block-head"><h2 class="block-title">Calendario<\/h2><\/div><p class="empty">Sin partidos en el calendario de este grupo<\/p><\/section>/);
  assert.doesNotMatch(batan, /calendario-equipo/);
});

test('teamCalendarEvents (decisión 15): todos los partidos con fecha del equipo, jugados o no, con la temporada del grupo', () => {
  const group = findGroup(ctxAt(HURACAN, '2026-03-01').model, '2025-2026', 'PG2');
  const events = teamCalendarEvents('AD Huracán', group);
  assert.equal(events.length, 26);
  assert.deepEqual(events[0], { date: '2025-10-12', time: '09:00', home: 'Telde', away: 'AD Huracán', jor: 'Jornada 1', venue: '' });
  assert.deepEqual(events.at(-1), { date: '2026-06-02', time: '17:30', home: 'Las Mesas Hu.', away: 'AD Huracán', jor: 'Jornada 30', venue: '' });
  assert.equal(events.filter((e) => e.date < '2026-03-01').length, 14, 'también los ya jugados');
  const ics = buildCalendar(events, { season: group.season, group: group.id, name: 'AD Huracán', now: new Date('2026-03-01T12:00:00Z') });
  assert.equal((ics.match(/BEGIN:VEVENT/g) || []).length, 26);
  assert.match(ics, /\r\nX-WR-CALNAME:AD Huracán\r\n/);
  assert.match(ics, /\r\nDTSTART:20251012T080000Z\r\nSUMMARY:Telde – AD Huracán\r\n/, 'las 09:00 de Canarias en octubre son las 08:00 UTC');
  // Un partido sin fecha no puede ir en un calendario; uno sin hora va como día entero.
  const raw = currentAt('2026-03-01');
  raw.history.PG2['Jornada 1'].find((row) => row[2] === 'AD Huracán')[0] = '';
  raw.history.PG2['Jornada 2'].find((row) => row[1] === 'AD Huracán')[6] = '';
  const odd = findGroup(ctxAt(HURACAN, '2026-03-01', { raw }).model, '2025-2026', 'PG2');
  const fewer = teamCalendarEvents('AD Huracán', odd);
  assert.equal(fewer.length, 25);
  assert.match(buildCalendar(fewer, { season: '2025-2026', name: 'AD Huracán' }), /\r\nDTSTART;VALUE=DATE:20251019\r\nSUMMARY:AD Huracán – RC Victoria\r\n/);
});

test('«Hacer mi equipo» (decisión 11): no en la ficha de mi equipo, ni en otra temporada; sí en la de otro equipo de la actual', () => {
  const mine = render(LAS_MESAS, '2026-03-01');
  assert.doesNotMatch(mine, /hacer-mi-equipo/);
  assert.match(head(mine), /<h1>Las Mesas Hu\.<\/h1><p class="screen-sub">Prebenjamín, Grupo 2 de Gran Canaria<\/p><\/div><\/header>$/);
  assert.match(blockOf(mine, 'Clasificación'), /<span class="vh"> \(mi equipo\)<\/span>/);
  // La misma ficha cuando mi equipo es otro: el botón vuelve.
  assert.match(render(LAS_MESAS, '2026-03-01', { myTeam: HURACAN_TEAM }), /data-action="hacer-mi-equipo"/);
  // 2024/25: mi equipo es siempre de la temporada del portal.
  const past = s(screen.render(ctxFor('equipo', { s: '2024-2025', g: 'PGC2', t: 'Las Mesas Hu.' }, {
    today: '2026-03-01', datasets: datasetsFor({ current: currentAt('2026-03-01'), seasonRaw: { '2024-2025': pastSeasonRaw() } }),
  })));
  assert.match(past, /^<section data-screen="equipo" data-state="D">/);
  assert.doesNotMatch(past, /hacer-mi-equipo/);
});

test('B (2026/27 simulada): su próximo partido, un único vacío, la tabla a cero y el calendario, sin nada de 2025/26', () => {
  const next = nextSeasonRaw({ prebenjamin: ['PG2', 'PG3'] });
  const out = s(screen.render(ctxFor('equipo', { ...HURACAN, s: '2026-2027' }, {
    today: '2026-10-01', portalSeason: '2026-2027', datasets: datasetsFor({ current: next, seasons: [{ name: '2026-2027', current: true }] }),
  })));
  assert.match(out, /data-state="B"/);
  assert.deepEqual(columnsOf(out).main, ['Próximo partido']);
  assert.deepEqual(columnsOf(out).side[0], 'Clasificación');
  assert.deepEqual(columnsOf(out).rest, ['Calendario']);
  assert.match(out, /<p class="empty">Aún no se ha jugado ninguna jornada<\/p>/);
  assert.equal((blockOf(out, 'Clasificación').match(/<td class="st-pts">0<\/td>/g) || []).length, 15);
  assert.doesNotMatch(out, /2025-2026|2025\/26/, 'ni un enlace ni una etiqueta de 2025/26');
});

test('C y D: el último partido y, terminada la temporada, «Así terminó» y «Verano», sin la caja de 2026/27 ni «Ver toda la temporada»', () => {
  const c = render(HURACAN, '2026-06-03');
  assert.match(c, /data-state="C"/);
  assert.match(text(blockOf(c, 'Último partido')), /^Último partido jornada 30 · mar 2 jun Local Las Mesas Hu\. 2–7 Visitante AD Huracán Ya ha jugado todos sus partidos$/);
  assert.doesNotMatch(c, /Segunda Fase\?/, 'el aviso stale es de Mi equipo');
  // La ficha de Las Mesas Hu. cuando mi equipo es AD Huracán, el 23/09/2026.
  const d = render(LAS_MESAS, '2026-09-23', { myTeam: HURACAN_TEAM });
  assert.match(d, /data-state="D"/);
  assert.match(head(d), /<h1>Las Mesas Hu\.<\/h1><p class="screen-sub">Temporada 2025\/26 terminada<\/p>/);
  assert.deepEqual(columnsOf(d).main, ['Así terminó 2025/26', 'Verano: Maspalomas Cup 2026']);
  assert.deepEqual(columnsOf(d).side[0], 'Clasificación final');
  assert.deepEqual(columnsOf(d).rest, ['Calendario']);
  assert.match(text(blockOf(d, 'Así terminó 2025/26')), /Posición 9\.º de 15 Puntos 37 Balance 12G 1E 15P/);
  assert.doesNotMatch(d, /Temporada 2026\/27|A la espera|home-all|Ver toda la temporada/);
  assert.match(d, /<div class="home-rest"><section class="block" id="calendario">/);
});

test('temporada pasada (PGC2 2024/25): D con la etiqueta de su temporada, su calendario con el .ics y ningún «Verano»', () => {
  const out = s(screen.render(ctxFor('equipo', { s: '2024-2025', g: 'PGC2', t: 'Las Mesas Hu.' }, {
    today: '2026-03-01', datasets: datasetsFor({ current: currentAt('2026-03-01'), seasonRaw: { '2024-2025': pastSeasonRaw() } }),
  })));
  assert.match(head(out), /<h1>Las Mesas Hu\.<\/h1><p class="screen-sub">Temporada 2024\/25 terminada<\/p>/);
  assert.deepEqual(columnsOf(out).main, ['Así terminó 2024/25']);
  assert.deepEqual(columnsOf(out).side[0], 'Clasificación final');
  assert.deepEqual(columnsOf(out).rest, ['Calendario']);
  assert.match(text(blockOf(out, 'Así terminó 2024/25')), /Posición 8\.º de 11 Puntos 15 Balance 5G 0E 15P/);
  assert.match(blockOf(out, 'Calendario'), /<p class="block-context">22 partidos<\/p>.*data-action="calendario-equipo"/);
  assert.match(blockOf(out, 'Clasificación final'), /href="#\/tabla\?s=2024-2025&amp;g=PGC2">ver completa<\/a>/);
});

test('lo que no pasa por el router: sin la temporada, la caja de error; sin el grupo de liga o sin el equipo, un vacío que lo dice', () => {
  const failed = s(screen.render(ctxFor('equipo', { s: '2023-2024', g: 'GC3', t: 'Las Mesas Hu.' }, { today: '2026-03-01' })));
  assert.match(failed, /^<section data-screen="equipo"><header class="screen-head"><a class="back" href="#\/explorar"[^>]*>‹<\/a><div class="screen-head-text"><h1>Equipo<\/h1>/);
  assert.match(text(failed), /No se pudieron cargar los datos de la temporada 2023\/24\. Reintentar/);
  assert.match(render({ ...HURACAN, g: 'ZZ9' }, '2026-03-01'), /<h1>Equipo<\/h1>.*<p class="empty">No hay ningún grupo de liga ZZ9 en la temporada 2025\/26\.<\/p>/);
  assert.match(render({ ...HURACAN, g: 'MCP3', t: 'UD Las Mesas Huracán' }, '2026-03-01'), /<p class="empty">No hay ningún grupo de liga MCP3 en la temporada 2025\/26\.<\/p>/);
  assert.match(render({ ...HURACAN, t: 'Guayarmina' }, '2026-03-01'), /<p class="empty">No encontramos a Guayarmina en Prebenjamín, Grupo 2 de Gran Canaria\.<\/p>/);
});

// Una sección y un nav falsos: lo justo para mount (los clics delegados, a todos sus oyentes) y lo
// que el nav recibe.
function mountWith(ctx) {
  const calls = [];
  const listeners = [];
  const section = { addEventListener(type, fn) { if (type === 'click') listeners.push(fn); }, contains: () => true, querySelector: () => null };
  const root = { matches: () => false, querySelector: (selector) => (selector === '[data-screen="equipo"]' ? section : null) };
  const nav = { addRecent: (entry) => { calls.push(['addRecent', entry]); return true; }, saveMyTeam: (team) => { calls.push(['saveMyTeam', team]); } };
  const done = screen.mount(root, ctx, nav);
  // El botón pulsado: closest encuentra su data-action y nada más (no está en ningún panel).
  const click = (action) => {
    const button = { getAttribute: (name) => ({ 'data-action': action })[name], closest: (selector) => (selector === '[data-action]' ? button : null) };
    const event = { target: button, preventDefault() {}, stopPropagation() {} };
    listeners.forEach((fn) => fn(event));
  };
  return { calls, done, click };
}

test('mount: la ficha va a «Vistos hace poco» (decisión 5) y «Hacer mi equipo» guarda { name, season, cat, groupId } con nav.saveMyTeam', () => {
  const { calls, done, click } = mountWith(ctxAt(HURACAN, '2026-03-01'));
  assert.equal(done, undefined, 'la ficha no tiene calendario de escritorio que limpiar');
  assert.deepEqual(calls, [['addRecent', { s: '2025-2026', g: 'PG2', t: 'AD Huracán' }]]);
  click('hacer-mi-equipo');
  assert.deepEqual(calls.at(-1), ['saveMyTeam', HURACAN_TEAM]);
  // Lo que no es una ficha no se apunta.
  assert.deepEqual(mountWith(ctxAt({ ...HURACAN, t: 'Guayarmina' }, '2026-03-01')).calls, []);
});

test('«Hacer mi equipo» en una fase anterior de mi equipo (decisión 40): guardada FF5, la resolución pasa a A2 y la ficha de FF5 dice dónde juega ahora', () => {
  const FF5 = { s: '2025-2026', g: 'FF5', t: 'Las Mesas Hu.' };
  // Con mi equipo en prebenjamín (el de ctxFor), la ficha de FF5 es la de otro equipo: el botón sale.
  assert.match(render(FF5, '2026-03-01'), /data-action="hacer-mi-equipo"/);
  // mount lo guarda con nav.saveMyTeam: Las Mesas Hu. de FF5, en benjamín.
  const { calls, click } = mountWith(ctxAt(FF5, '2026-03-01'));
  click('hacer-mi-equipo');
  const saved = calls.at(-1)[1];
  assert.deepEqual(saved, { name: 'Las Mesas Hu.', season: '2025-2026', cat: 'benjamin', groupId: 'FF5' });
  // El router vuelve a pintar FF5 con lo guardado: la Primera Fase terminó y la resolución pasa a A2
  // (el cambio de fase), así que FF5 ya no es «mi equipo» para la barra. En lugar del botón, dónde juega.
  const ctx = ctxAt(FF5, '2026-03-01', { myTeam: saved });
  assert.equal(ctx.resolution.group.id, 'A2');
  const after = s(screen.render(ctx));
  assert.doesNotMatch(after, /hacer-mi-equipo/);
  assert.match(after, /<\/header><p class="notice">Tu equipo ahora juega en <a class="more" href="#\/equipo\?s=2025-2026&amp;g=A2&amp;t=Las%20Mesas%20Hu\.">Benjamín, Segunda Fase A, Grupo 2<\/a>\.<\/p><div class="home-cols has-rest">/);
  // La ficha de A2 es mi equipo: ni el botón ni el aviso.
  assert.doesNotMatch(s(screen.render(ctxAt({ ...FF5, g: 'A2' }, '2026-03-01', { myTeam: saved }))), /hacer-mi-equipo|Tu equipo ahora juega/);
  // Otro equipo del club (Las Mesas Hu. B, en FF13) sigue con el botón.
  assert.match(render({ s: '2025-2026', g: 'FF13', t: 'Las Mesas Hu. B' }, '2026-03-01', { myTeam: saved }), /data-action="hacer-mi-equipo"/);
});

test('mount: «Calendario del equipo (.ics)» descarga los 26 partidos con fecha, con el enlace de la ficha', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const saved = { document: globalThis.document, location: globalThis.location, create: URL.createObjectURL, revoke: URL.revokeObjectURL };
  let blob = null;
  const anchor = { clicked: 0, click() { anchor.clicked += 1; } };
  globalThis.document = { createElement: (tag) => (tag === 'a' ? anchor : null) };
  globalThis.location = { href: 'https://x.test/futbol-base/index.html#/equipo?g=PG2&t=AD%20Hurac%C3%A1n' };
  URL.createObjectURL = (value) => { blob = value; return 'blob:x'; };
  URL.revokeObjectURL = () => {};
  try {
    mountWith(ctxAt(HURACAN, '2026-03-01')).click('calendario-equipo');
    assert.equal(anchor.clicked, 1);
    assert.equal(anchor.download, 'calendario-ad-huracan.ics');
    const ics = (await blob.text()).replace(/\r\n /g, '');   // las líneas plegadas (RFC 5545), en una
    assert.equal((ics.match(/BEGIN:VEVENT/g) || []).length, 26);
    assert.match(ics, /\r\nURL:https:\/\/x\.test\/futbol-base\/index\.html#\/equipo\?s=2025-2026&g=PG2&t=AD%20Hurac%C3%A1n\r\n/);
  } finally {
    if (saved.document === undefined) delete globalThis.document; else globalThis.document = saved.document;
    if (saved.location === undefined) delete globalThis.location; else globalThis.location = saved.location;
    URL.createObjectURL = saved.create;
    URL.revokeObjectURL = saved.revoke;
  }
});

test('cada clase que emite la ficha existe en acta.css', () => {
  const rules = cssRules();
  const out = [
    render(HURACAN, '2026-03-01'), render(HURACAN, '2026-06-03'), render(LAS_MESAS, '2026-09-23', { myTeam: HURACAN_TEAM }),
    render({ ...HURACAN, t: 'CD Batán' }, '2026-03-01'), render({ ...HURACAN, t: 'Guayarmina' }, '2026-03-01'),
  ].join('');
  const missing = [...new Set([...out.matchAll(/class="([^"]+)"/g)].flatMap((m) => m[1].split(/\s+/)))].filter((c) => !rules.classes.has(c));
  assert.deepEqual(missing, []);
  assert.ok(rules.some((r) => r.media === null && r.selector === '.cal-actions'), 'el botón del .ics tiene su hueco');
});

// ── Plan B3, Tarea 5: evolución de puntos, plantilla y trayectoria (decisiones 12 a 14) ──────────

const ACTAS = { '2025-2026': lineupsFor('2025-2026') };
const A1 = (t) => ({ s: '2025-2026', g: 'A1', t });
// La ficha con las actas ya cargadas (lo que hace needs), el 23/09/2026 salvo otro día.
const withActas = (params, today = '2026-09-23', { lineups = ACTAS, myTeam } = {}) => s(screen.render(ctxFor('equipo', params, {
  today, datasets: datasetsFor({ current: today < '2026-06-07' ? currentAt(today) : fixture('current-2025-2026'), ...goleadores(), lineups }), ...(myTeam ? { myTeam } : {}),
})));
const pg2 = (raw = fixture('current-2025-2026')) => findGroup(ctxAt(HURACAN, '2026-09-23', { raw }).model, '2025-2026', 'PG2');
const a1 = () => findGroup(ctxAt(HURACAN, '2026-09-23').model, '2025-2026', 'A1');

test('pointsProgression: los puntos acumulados jornada a jornada desde el calendario, sin retirados, y null en las que faltan por jugar', () => {
  const final = pointsProgression('Las Mesas Hu.', pg2());
  assert.equal(final.length, 30);
  assert.deepEqual(final[0], { roundKey: 'Jornada 1', label: 'Jornada 1', pts: 3 });
  assert.deepEqual(final.map((p) => p.pts), [3, 3, 3, 6, 6, 6, 6, 9, 12, 12, 12, 12, 12, 15, 15, 18, 18, 18, 21, 21, 24, 24, 27, 28, 28, 28, 28, 28, 31, 31]);
  // El 01/03/2026: hasta la jornada 17, la última con algún resultado del grupo; después, por jugar.
  const march = pointsProgression('Las Mesas Hu.', pg2(currentAt('2026-03-01')));
  assert.deepEqual(march.slice(15, 18).map((p) => p.pts), [18, 18, null]);
  assert.equal(march.filter((p) => p.pts == null).length, 13);
  // Un retirado: todo a cero (no juega nada que cuente).
  assert.ok(pointsProgression('CD Batán', pg2()).every((p) => p.pts === 0));
});

test('pointsChart: una línea sólida en tinta, sin puntos ni relleno ni trazos discontinuos; decorativa, y nada sin dos jornadas', () => {
  const out = s(pointsChart([{ pts: 3 }, { pts: 3 }, { pts: 6 }, { pts: null }], { max: 9 }));
  assert.equal(out, '<svg class="points-chart" viewBox="0 0 3 9" preserveAspectRatio="none" aria-hidden="true" focusable="false">'
    + '<line class="points-base" x1="0" y1="9" x2="3" y2="9"></line><polyline class="points-line" points="0,6 1,6 2,3"></polyline></svg>');
  assert.doesNotMatch(out, /circle|marker|dasharray|polygon|fill=/);
  assert.equal(s(pointsChart([{ pts: 3 }, { pts: null }], { max: 9 })), '', 'una sola jornada jugada: no hay línea');
  assert.equal(s(pointsChart([{ pts: 0 }, { pts: 0 }], { max: 0 })), '', 'sin partidos que puntúen');
  const rules = cssRules();
  const line = rules.filter((r) => r.selector === '.points-line').map((r) => r.body).join(';');
  assert.match(line, /stroke:\s*var\(--ink\)/);
  assert.match(line, /fill:\s*none/);
  assert.match(line, /vector-effect:\s*non-scaling-stroke/);
  assert.doesNotMatch(rules.filter((r) => /points-/.test(r.selector)).map((r) => r.body).join(';'), /dasharray|marker/);
});

test('evolución de puntos en la ficha: la gráfica, el dato en texto y la nota de cobertura cuando no llega a los puntos oficiales (Las Mesas: 31 y 37)', () => {
  const out = render(LAS_MESAS, '2026-09-23', { myTeam: HURACAN_TEAM });
  const evolution = blockOf(out, 'Evolución de puntos');
  assert.match(evolution, /<p class="block-context">desde el calendario<\/p><\/div><div class="box"><div class="points-plot"><svg class="points-chart" viewBox="0 0 29 78"/);
  assert.equal(text(evolution), 'Evolución de puntos desde el calendario Jornada 1 3 Jornada 30 31 Máximo posible 78');
  assert.match(out, /<\/section><p class="notice"><b>Cobertura:<\/b> la gráfica suma 31 puntos con los 26 partidos del calendario; la clasificación oficial da 37, con 2 partidos más contra CD Batán \(retirado\)\.<\/p>/);
  // Con el último resultado sin publicar, la nota de la temporada en cifras.
  assert.deepEqual(pointsNote('Las Mesas Hu.', pg2(currentAt('2026-06-02')), '2026-06-03'), { label: 'Cobertura:',
    text: 'la gráfica suma 31 puntos con el calendario y la clasificación oficial da 37: 25 de 26 partidos con resultado y 2 contra CD Batán (retirado).' });
  // Sin retirados en su grupo, la gráfica llega a los puntos oficiales: sin nota.
  const pg3 = findGroup(ctxAt(HURACAN, '2026-09-23').model, '2025-2026', 'PG3');
  assert.equal(pointsProgression('UD Vecindario', pg3).at(-1).pts, 78);
  assert.equal(pointsNote('UD Vecindario', pg3, '2026-09-23'), null);
  // Ni en B, sin nada jugado, ni para un retirado.
  assert.equal(blockOf(render({ ...HURACAN, t: 'CD Batán' }, '2026-03-01'), 'Evolución de puntos'), null);
});

test('la nota de la gráfica: «Cobertura:» si al calendario le faltan partidos; «Nota:» si con los mismos no coinciden, sin inventar la causa (decisión 163)', () => {
  // Retirados (Las Mesas en PG2): lo que falta, con su etiqueta.
  assert.deepEqual(pointsNote('Las Mesas Hu.', pg2(), '2026-09-23'), { label: 'Cobertura:',
    text: 'la gráfica suma 31 puntos con los 26 partidos del calendario; la clasificación oficial da 37, con 2 partidos más contra CD Batán (retirado).' });
  // Los mismos 26 partidos en el calendario y en la clasificación, que da 3 puntos menos (como 321
  // fichas de los datos vivos, la mayoría con 3 de diferencia): que no coinciden, sin decir por qué.
  const raw = fixture('current-2025-2026');
  const admin = { ...raw, prebenjamin: raw.prebenjamin.map((g) => (g.id !== 'PG3' ? g
    : { ...g, standings: g.standings.map((r) => (r[1] === 'UD Vecindario' ? [r[0], r[1], r[2] - 3, ...r.slice(3)] : r)) })) };
  const vecindario = { s: '2025-2026', g: 'PG3', t: 'UD Vecindario' };
  const pg3 = findGroup(ctxAt(vecindario, '2026-09-23', { raw: admin }).model, '2025-2026', 'PG3');
  const nota = { label: 'Nota:', text: 'el calendario y la clasificación oficial no coinciden. Con los mismos 26 partidos, la gráfica suma 78 puntos y la clasificación oficial, 75.' };
  assert.deepEqual(pointsNote('UD Vecindario', pg3, '2026-09-23'), nota);
  assert.match(render(vecindario, '2026-09-23', { raw: admin }), new RegExp(`</section><p class="notice"><b>Nota:</b> ${nota.text.replace(/[.()]/g, '\\$&')}</p>`));
  assert.doesNotMatch(render(vecindario, '2026-09-23', { raw: admin }), /Cobertura:/);
});

test('teamSquad: las actas de A1 por (s, gr), sin las de un lado vacío; Liam Garcia Larsen, 9 PJ, 9 de titular y 21 goles', () => {
  const squad = teamSquad(ACTAS['2025-2026'], { group: a1(), team: 'Guayarmina' });
  assert.deepEqual([squad.rows.length, squad.actas, squad.skipped, squad.groupActas], [10, 9, 1, 44]);
  assert.deepEqual(squad.rows[0], { name: 'GARCIA LARSEN, LIAM', dorsal: 9, ap: 9, st: 9, g: 21, y: 0, rd: 0 });
  assert.deepEqual(squad.rows[1], { name: 'RAMOS MENDOZA, FRANCISCO ADUEN', dorsal: 10, ap: 9, st: 8, g: 20, y: 0, rd: 0 });
  // Las actas de FF1 de la misma temporada no cuentan en A1 (con ellas, Garcia Larsen sumaría 26 en 11).
  assert.equal(squad.rows.reduce((n, r) => n + r.g, 0), teamSquad(fixture('lineups-2025-2026'), { group: a1(), team: 'Guayarmina' }).rows.reduce((n, r) => n + r.g, 0));
  // Goleta: sus 10 actas traen al rival en `home` y `away` vacío; Gran Canaria C no tiene ninguna.
  assert.deepEqual(Object.values(teamSquad(ACTAS['2025-2026'], { group: a1(), team: 'Goleta' })).map((v) => (Array.isArray(v) ? v.length : v)), [0, 0, 10, 44]);
  assert.deepEqual(Object.values(teamSquad(ACTAS['2025-2026'], { group: a1(), team: 'Gran Canaria C' })).map((v) => (Array.isArray(v) ? v.length : v)), [0, 0, 0, 44]);
  // Dorsal: el más repetido (Hmiddouch lleva el 6, el 11 y el 7) y, si empatan, el de su acta más reciente
  // (Galván Medina, el 2 y el 6 dos veces cada uno: el 6, el del 14/03).
  const dorsal = (team, name) => teamSquad(ACTAS['2025-2026'], { group: a1(), team }).rows.find((r) => r.name === name).dorsal;
  assert.equal(dorsal('San Nicolás', 'HMIDDOUCH, ADAM'), 7);
  assert.equal(dorsal('Unión Viera', 'GALVAN MEDINA, ADRIAN'), 6);
  // Una clave repetida ({dup, list}): cuenta la entrada de su (s, gr), la de A1, y nada más.
  const dup = { ...ACTAS['2025-2026'] };
  const key = 'Guayarmina|Santidad|8-4';
  dup[key] = { dup: true, list: [dup[key], { ...dup[key], gr: 'FF1' }] };
  assert.deepEqual(teamSquad(dup, { group: a1(), team: 'Guayarmina' }).rows[0], squad.rows[0]);
});

test('playerMatches y playerDetail: sus partidos en orden de fecha, con el marcador desde su equipo y el enlace a cada uno', () => {
  const matches = playerMatches(ACTAS['2025-2026'], { group: a1(), team: 'Guayarmina', player: 'GARCIA LARSEN, LIAM' });
  assert.equal(matches.length, 9);
  assert.deepEqual(matches.map((m) => [m.match.roundKey, m.side, m.goals]).slice(0, 2), [['Jornada 1', 'home', 1], ['Jornada 2', 'away', 1]]);
  assert.equal(matches.reduce((n, m) => n + m.goals, 0), 21);
  const detail = s(playerDetail(ACTAS['2025-2026'], a1(), 'Guayarmina', 'GARCIA LARSEN, LIAM'));
  const items = [...detail.matchAll(/<a class="squad-match" href="([^"]+)">(.*?)<\/a>/g)];
  assert.equal(items.length, 9);
  assert.equal(items[1][1], '#/partido?s=2025-2026&amp;g=A1&amp;r=Jornada%202&amp;h=UD%20Valleseco&amp;a=Guayarmina');
  assert.equal(text(items[1][2]), 'Jornada 2 · mar 16 dic fuera contra Valleseco 1–4 1 gol', 'perdió 4–1 fuera: 1–4 desde Guayarmina');
  assert.equal(text(items[6][2]), 'Jornada 11 · vie 27 feb fuera contra Moya 13–1 4 goles');
});

test('la plantilla en la ficha: N.º, jugador (un botón con aria-expanded), PJ, titular y goles, y la cobertura de las actas', () => {
  const out = withActas(A1('Guayarmina'));
  const squad = blockOf(out, 'Plantilla');
  assert.match(squad, /<p class="block-context">según las actas<\/p>/);
  assert.match(squad, /<thead><tr><th scope="col" class="sq-dorsal"><abbr title="Dorsal">N\.º<\/abbr><\/th><th scope="col" class="sq-name">Jugador<\/th><th scope="col" class="sq-num"><abbr title="Partidos jugados">PJ<\/abbr><\/th><th scope="col" class="sq-num"><abbr title="Partidos de titular">Tit\.<\/abbr><\/th><th scope="col" class="sq-goals">Goles<\/th><\/tr><\/thead>/);
  assert.match(squad, /<tbody><tr><td class="sq-dorsal">9<\/td><th scope="row" class="sq-name"><button type="button" class="squad-player" data-action="jugador" data-index="0" aria-expanded="false">Liam Garcia Larsen<\/button><\/th><td class="sq-num">9<\/td><td class="sq-num">9<\/td><td class="sq-goals">21<\/td><\/tr>/);
  assert.equal((squad.match(/class="squad-player"/g) || []).length, 10);
  assert.doesNotMatch(squad, /squad-detail|Tarjetas/, 'el detalle lo pinta mount; sin tarjetas en la temporada, sin su columna');
  assert.match(out, /<\/section><p class="notice">Actas de 9 de 20 partidos jugados; 1 acta más llega incompleta \(sin uno de los dos equipos\) y no cuenta\.<\/p>/);
  // Con una tarjeta en la temporada (en otro grupo), las columnas de tarjetas.
  const cards = structuredClone(ACTAS['2025-2026']);
  const ff1 = Object.values(cards).find((acta) => acta.gr === 'FF1');
  ff1.home[0].y = 1;
  assert.equal(anyCards(ACTAS['2025-2026']), false);
  assert.equal(anyCards(cards), true);
  assert.match(blockOf(withActas(A1('Guayarmina'), '2026-09-23', { lineups: { '2025-2026': cards } }), 'Plantilla'),
    /<th scope="col" class="sq-num"><abbr title="Tarjetas amarillas">TA<\/abbr><\/th><th scope="col" class="sq-num"><abbr title="Tarjetas rojas">TR<\/abbr><\/th><\/tr>/);
});

test('la plantilla dice lo que falta: actas incompletas (Goleta), ninguna del equipo, ninguna del grupo (nada) y un fallo de la carga', () => {
  assert.equal(text(blockOf(withActas(A1('Goleta')), 'Plantilla')),
    'Plantilla Las 10 actas de sus partidos llegan incompletas (sin uno de los dos equipos): no se puede saber su plantilla.');
  assert.equal(text(blockOf(withActas(A1('Gran Canaria C')), 'Plantilla')), 'Plantilla La federación no ha publicado actas de sus partidos.');
  assert.equal(blockOf(withActas(HURACAN), 'Plantilla'), null, 'PG2 no tiene actas: la mayoría de grupos, tampoco');
  const failed = withActas(A1('Guayarmina'), '2026-09-23', { lineups: { '2025-2026': null } });
  assert.match(blockOf(failed, 'Plantilla'), /No se pudieron cargar los datos de las actas de 2025\/26\..*data-action="retry"/);
});

test('needs: las actas de la temporada de la ruta una vez (un 404 es «sin actas»); un fallo se vuelve a pedir en la visita siguiente', async () => {
  const saved = { fetch: globalThis.fetch, warn: console.warn };
  let calls = 0;
  let up = false;
  globalThis.fetch = async () => {
    calls += 1;
    return up ? { ok: true, status: 200, text: async () => `const LINEUPS_2021_2022=${JSON.stringify({ 'A|B|1-0': { s: '2021-2022', gr: 'X' } })};` }
      : { ok: false, status: 503, text: async () => '' };
  };
  console.warn = () => {};
  try {
    const datasets = { health: null };
    await Promise.all(screen.needs({ s: '2021-2022' }, datasets));
    assert.equal(datasets.lineups['2021-2022'], null, 'falló: la plantilla enseña su caja de error');
    up = true;
    const again = screen.needs({ s: '2021-2022' }, datasets);
    assert.equal(again.length, 1, 'la visita siguiente lo vuelve a pedir');
    await Promise.all(again);
    assert.deepEqual(Object.keys(datasets.lineups['2021-2022']), ['A|B|1-0']);
    assert.deepEqual(screen.needs({ s: '2021-2022' }, datasets), [], 'cargadas, no se vuelven a pedir');
    assert.equal(calls, 2);
  } finally {
    globalThis.fetch = saved.fetch;
    console.warn = saved.warn;
  }
});

// Todo el archivo de las fixtures: 2025-26, 2024-25 y 2023-24.
const ARCHIVE = [{ name: '2025-2026', current: true }, { name: '2024-2025', current: false }, { name: '2023-2024', current: false }];
const archiveCtx = (seasonRaw = {}) => ctxFor('equipo', LAS_MESAS, { today: '2026-09-23', datasets: datasetsFor({ seasonRaw, seasons: ARCHIVE }) });

test('teamTrajectory: una fila por temporada, categoría y nombre exacto del club, en el grupo de liga de la fase más alta', () => {
  const ctx = archiveCtx({ '2024-2025': archive('2024-2025'), '2023-2024': archive('2023-2024') });
  const rows = teamTrajectory(ctx.model, 'Las Mesas Hu.', ctx.model.clubIndex(), ARCHIVE.map((x) => x.name));
  assert.deepEqual(rows.map((r) => [r.season, r.cat, r.name, r.group.id, r.pos, r.pts]), [
    ['2025-2026', 'benjamin', 'Las Mesas B', 'B2', 12, 1],
    ['2025-2026', 'benjamin', 'Las Mesas Hu.', 'A2', 4, 43],
    ['2025-2026', 'benjamin', 'Las Mesas Hu. B', 'FF13', 4, 6],
    ['2025-2026', 'prebenjamin', 'Las Mesas Hu.', 'PG2', 9, 37],
    ['2024-2025', 'benjamin', 'L.Mesas Hu. B', 'P9', 5, 13],
    ['2024-2025', 'benjamin', 'Las Mesas B', 'C2', 6, 20],
    ['2024-2025', 'benjamin', 'Las Mesas Hu.', 'A1', 7, 13],
    ['2024-2025', 'prebenjamin', 'Las Mesas Hu.', 'PGC2', 8, 15],
    ['2023-2024', 'benjamin', 'Las Mesas B', 'SF8', 10, 6],
    ['2023-2024', 'benjamin', 'Las Mesas Hu.', 'SF1', 3, 39],
  ]);
  // Una temporada sin cargar no sale; el mismo nombre de otro club (AD Huracán), tampoco.
  const partial = archiveCtx({ '2024-2025': archive('2024-2025') });
  const some = teamTrajectory(partial.model, 'Las Mesas Hu.', partial.model.clubIndex(), ARCHIVE.map((x) => x.name));
  assert.deepEqual([...new Set(some.map((r) => r.season))], ['2025-2026', '2024-2025']);
  assert.ok(!rows.some((r) => /Hurac/.test(r.name)));
});

test('la trayectoria bajo demanda: el botón con aria-expanded y su panel vacío; al abrirla, todo el archivo, y si falla, su propio «Reintentar»', async (t) => {
  const block = blockOf(render(LAS_MESAS, '2026-09-23', { myTeam: HURACAN_TEAM }), 'Trayectoria');
  assert.equal(block, '<section class="block"><div class="block-head"><h2 class="block-title">Trayectoria</h2><p class="block-context">todas las temporadas</p></div>'
    + '<button type="button" class="team-toggle" data-action="trayectoria" aria-expanded="false" aria-controls="trayectoria">Ver la trayectoria</button>'
    + '<div id="trayectoria" class="team-panel" aria-live="polite" hidden></div></section>');
  // Al abrirla: carga lo que falta del archivo (loadSeasons, de state.js) y pinta sus filas.
  const ctx = archiveCtx();
  const asked = [];
  const content = s(await trajectoryContent(ctx, 'Las Mesas Hu.', async (name) => { asked.push(name); return archive(name); }));
  assert.deepEqual(asked, ['2024-2025', '2023-2024']);
  assert.deepEqual([...content.matchAll(/<h3 class="traj-season">(.*?)<\/h3>/g)].map((m) => m[1]), ['2025/26', '2024/25', '2023/24']);
  assert.equal((content.match(/<a class="traj-row"/g) || []).length, 10);
  assert.match(content, /<a class="traj-row" href="#\/tabla\?s=2024-2025&amp;g=PGC2"><span class="traj-team">Las Mesas Hu\.<\/span><span class="traj-group">Prebenjamín, Grupo 2 de Gran Canaria<\/span><span class="traj-pos">8\.º de 11<\/span><span class="traj-pts">15 puntos<\/span><\/a>/);
  // Si una temporada no llega: la caja de error del panel, con su «Reintentar»; nunca lanza.
  t.mock.method(console, 'error', () => {});
  const failed = s(await trajectoryContent(archiveCtx(), 'Las Mesas Hu.', async (name) => (name === '2023-2024' ? null : archive(name))));
  assert.match(failed, /^<div class="box error-box" role="alert"><p class="error-text">No se pudieron cargar los datos de la trayectoria\.<\/p>.*data-action="retry"/);
  const broken = s(await trajectoryContent(archiveCtx(), 'Las Mesas Hu.', async () => ({ name: 'x', benjamin: { roto: true } })));
  assert.match(broken, /No se pudieron cargar los datos de la trayectoria\./);
});

test('mount: «Ver la trayectoria» carga el archivo en su panel y su «Reintentar» es del panel, no del router', async () => {
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
    const panel = { innerHTML: '', hidden: true, isConnected: true, setAttribute() {}, removeAttribute() {}, hasChildNodes: () => panel.innerHTML !== '' };
    const listeners = [];
    const section = {
      addEventListener(type, fn) { if (type === 'click') listeners.push(fn); }, contains: () => true,
      querySelector: (selector) => (selector === '#trayectoria' ? panel : null),
    };
    const ctx = archiveCtx();
    screen.mount({ matches: () => true, querySelector: () => null, ...section }, ctx, { addRecent: () => true });
    const attrs = { 'data-action': 'trayectoria', 'aria-expanded': 'false' };
    const button = { textContent: 'Ver la trayectoria', getAttribute: (n) => attrs[n], setAttribute: (n, v) => { attrs[n] = v; }, closest: (sel) => (sel === '[data-action]' ? button : null) };
    const flush = () => new Promise((resolve) => setImmediate(resolve));
    listeners.forEach((fn) => fn({ target: button }));
    assert.deepEqual([attrs['aria-expanded'], button.textContent, panel.hidden], ['true', 'Ocultar la trayectoria', false]);
    for (let i = 0; i < 5; i += 1) await flush();
    assert.match(panel.innerHTML, /No se pudieron cargar los datos de la trayectoria\./, '2023-24 no llega');
    // «Reintentar» dentro del panel: lo atiende la ficha (el router no se entera) y ya llega todo.
    served.add('2023-2024');
    const retry = { getAttribute: (n) => ({ 'data-action': 'retry' })[n], closest: (sel) => (sel === '[data-action]' ? retry : sel === '#trayectoria' ? panel : null) };
    const event = { target: retry, prevented: 0, stopped: 0, preventDefault() { event.prevented += 1; }, stopPropagation() { event.stopped += 1; } };
    listeners.forEach((fn) => fn(event));
    assert.deepEqual([event.prevented, event.stopped], [1, 1]);
    for (let i = 0; i < 5; i += 1) await flush();
    assert.equal((panel.innerHTML.match(/<a class="traj-row"/g) || []).length, 10);
  } finally {
    globalThis.fetch = saved.fetch;
    console.error = saved.error;
  }
});

test('la columna de consulta de la ficha: la clasificación, goleadores y cifras, y después la evolución, la plantilla y la trayectoria', () => {
  assert.deepEqual(columnsOf(withActas(A1('Guayarmina'), '2026-03-01')).side,
    ['Clasificación', 'Goleadores del equipo', 'La temporada en cifras', 'Evolución de puntos', 'Plantilla', 'Trayectoria']);
  assert.deepEqual(columnsOf(withActas(A1('Guayarmina'))).side, ['Clasificación final', 'Evolución de puntos', 'Plantilla', 'Trayectoria']);
});

test('estilos de la evolución, la plantilla y la trayectoria: cada clase existe, lo pulsable mide 44 px y sin radio ni sombra', () => {
  const rules = cssRules();
  const out = [withActas(A1('Guayarmina')), withActas(A1('Goleta')), s(playerDetail(ACTAS['2025-2026'], a1(), 'Guayarmina', 'GARCIA LARSEN, LIAM'))].join('')
    + '<tr class="squad-detail"></tr><p class="team-loading"></p><h3 class="traj-season"></h3><a class="traj-row"><span class="traj-team"></span><span class="traj-group"></span><span class="traj-pos"></span><span class="traj-pts"></span></a>';
  const missing = [...new Set([...out.matchAll(/class="([^"]+)"/g)].flatMap((m) => m[1].split(/\s+/)))].filter((c) => !rules.classes.has(c));
  assert.deepEqual(missing, []);
  const decl = (selector) => rules.filter((r) => r.media === null && r.selector.split(',').map((x) => x.trim()).includes(selector)).map((r) => r.body).join(';');
  for (const selector of ['.squad-player', '.squad-match', '.team-toggle', '.traj-row']) assert.match(decl(selector), /min-height:\s*44px/, selector);
  const mine = rules.filter((r) => /squad|traj|team-|points-/.test(r.selector)).map((r) => r.body).join(';');
  assert.doesNotMatch(mine, /border-radius|box-shadow|text-transform/);
});
