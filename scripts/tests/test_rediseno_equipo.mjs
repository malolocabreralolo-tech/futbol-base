// Plan B3, Tareas 4 y 5: la ficha de Equipo, `#/equipo?s&g&t` (spec §4.6 y §4.8; decisiones 5, 11 y
// 15, y 12 a 14 de B3). render(ctx) es pura y se prueba sobre su HTML con el ctx común (ctxFor), las
// fixtures congeladas y `today` inyectado; mount, con una sección y un nav falsos.
import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { fixture } from './fixtures/rediseno/load.mjs';
import { currentAt, nextSeasonRaw, goleadores } from './fixtures/rediseno/simulate.mjs';
import { ctxFor, datasetsFor, pastSeasonRaw, cssRules } from './fixtures/rediseno/screens.mjs';
import { findGroup } from '../../src/model.js';
import { buildCalendar, teamCalendarEvents } from '../../src/links.js';
import { SCREEN_MAP } from '../../src/screens.js';
import { screen } from '../../src/screen-equipo.js';

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
