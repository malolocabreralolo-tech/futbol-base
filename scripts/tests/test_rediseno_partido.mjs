// Plan B2, tarea 11: pantalla Partido (spec §4.5, §5.3, §7, §9.2, §9.3 y §11,
// caso 7). Solo fixtures congeladas y hoy inyectado: nunca los data-*.js vivos.
import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { fixture } from './fixtures/rediseno/load.mjs';
import { currentAt, datasetsFrom as baseDatasets } from './fixtures/rediseno/simulate.mjs';
import { actaFor, createModel, findMatch } from '../../src/model.js';
import { ensureLineups } from '../../src/state.js';
import { routeHref } from '../../src/links.js';
import { parentOf } from '../../src/router.js';
import {
  loadSeasons, partidoNeeds, pastSeasons, previousBlock, previousMeetings, previousPanelContent, screen,
} from '../../src/screen-partido.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const PORTAL = { season: '2025-2026', defaultTeam: { cat: 'prebenjamin', groupId: 'PG2', name: 'Las Mesas Hu.' } };
const SEASONS = [{ name: '2025-2026', current: true }, { name: '2024-2025', current: false }];
const TODAY = '2026-09-23';

// Registro de datos con la forma de B2 (datasetsFrom de la Tarea 3), con la cronología y las actas
// ya cargadas, como las deja needs.
function datasetsFrom(raw = fixture('current-2025-2026')) {
  return baseDatasets(raw, {
    golBenj: [], golPrebenj: [], seasons: SEASONS, matchDetail: fixture('matchdetail'),
    lineups: { '2025-2026': fixture('lineups-2025-2026') }, health: fixture('health'),
  });
}

// backHref: el «‹» que el router pone en el ctx (parentOf con el modelo, M2 de la revisión final).
function ctxFor(params, { today = TODAY, datasets = datasetsFrom(), resolution = null } = {}) {
  const route = { screen: 'partido', params };
  const model = createModel(datasets, { portalSeason: PORTAL.season });
  const parent = parentOf(route, model);
  return {
    route, params, today, datasets, resolution, model,
    myTeam: { ...PORTAL.defaultTeam, season: PORTAL.season }, health: datasets.health,
    portal: PORTAL, lastPrimary: 'jornada', backHref: routeHref(parent.screen, parent.params),
  };
}

const render = (params, opts) => String(screen.render(ctxFor(params, opts)));
const text = (out) => String(out).replace(/<[^>]+>/g, ' ').replace(/&#39;/g, "'").replace(/&quot;/g, '"')
  .replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim();

// La caja de error de shell.js (Tarea 5): su texto y su botón «Reintentar».
const failBox = (out, what) => text(out).includes(`No se pudieron cargar los datos de ${what}`)
  && /<button[^>]*data-action="retry"/.test(String(out));

// El bloque <section class="block"> con ese título, o null si no se pinta.
function blockOf(out, title) {
  const s = String(out);
  const at = s.indexOf(`<h2 class="block-title">${title}</h2>`);
  if (at < 0) return null;
  const start = s.lastIndexOf('<section class="block"', at);
  const tags = /<section\b|<\/section>/g;
  tags.lastIndex = start;
  let depth = 0;
  for (let m; (m = tags.exec(s));) {
    depth += m[0] === '</section>' ? -1 : 1;
    if (depth === 0) return s.slice(start, m.index + m[0].length);
  }
  return s.slice(start);
}

const PG2_J30 = { s: '2025-2026', g: 'PG2', r: 'Jornada 30', h: 'Las Mesas Hu.', a: 'AD Huracán' };
const A1_J1 = { s: '2025-2026', g: 'A1', r: 'Jornada 1', h: 'Guayarmina', a: 'Santidad' };
const A1_J3 = { s: '2025-2026', g: 'A1', r: 'Jornada 3', h: 'Unión Viera', a: 'Santidad' };
const A1_J11 = { s: '2025-2026', g: 'A1', r: 'Jornada 11', h: 'Moya', a: 'Guayarmina' };
const A1_J14 = { s: '2025-2026', g: 'A1', r: 'Jornada 14', h: 'Goleta', a: 'Arucas' };
const MCPK1_CUARTOS = { s: '2025-2026', g: 'MCPK1', r: '27-06-2026 ( Cuartos )', h: 'UD Las Mesas Huracán', a: 'CF Unión Carrizal' };

test('PG2, 02/06/2026, Las Mesas Hu. 2–7 AD Huracán: sin cronología, sin acta y cara a cara solo de PG2 (§11, caso 7)', () => {
  const out = render(PG2_J30);
  assert.match(out, /^<section data-screen="partido">/);
  assert.equal(out.match(/<h1[\s>]/g).length, 1);
  assert.match(out, /<h1>Partido<span class="vh">: Las Mesas Hu\. – AD Huracán<\/span><\/h1>/);
  assert.match(out, /<p class="screen-sub">Jornada 30 · Prebenjamín, Grupo 2 de Gran Canaria<\/p>/);
  // «‹» sin historial: la jornada del partido (spec §4.1). La cabecera es screenHead (ui.js).
  assert.match(out, /^<section data-screen="partido"><header class="screen-head"><a class="back" href="#\/jornada\?s=2025-2026&amp;g=PG2&amp;r=Jornada%2030" data-action="back" aria-label="Volver">‹<\/a>/);
  assert.match(out, /<button type="button" class="screen-action" data-action="share"/);
  assert.equal(text(blockOf(out, 'Resultado')),
    'Resultado final Fecha mar 2 jun Hora 17:30 Campo no publicado Local Las Mesas Hu. Resultado: 2–7 Visitante AD Huracán');
  // La cronología 'Las Mesas Hu.|AD Huracán|2-9' es de A2 (benjamín): no es la de este partido.
  const goles = blockOf(out, 'Goles');
  assert.equal(text(goles), 'Goles Ninguna fuente publica quién marcó en este partido.');
  assert.match(goles, /<p class="empty">/);
  assert.equal(text(blockOf(out, 'Alineaciones')), 'Alineaciones La federación no ha publicado el acta de este partido.');
  // Cara a cara de la temporada en prebenjamín: J15 y J30 de PG2, con el actual resaltado; nunca el
  // 2–9 ni el 4–1 de A2, que es benjamín.
  const h2h = blockOf(out, 'Cara a cara');
  assert.deepEqual(h2h.match(/class="pt-h2h-row[^"]*"/g), ['class="pt-h2h-row"', 'class="pt-h2h-row is-current"']);
  assert.ok(text(h2h).startsWith('Cara a cara esta temporada J15, 12 feb AD Huracán – Las Mesas Hu. Huracán – Las Mesas Hu. 8–1 Este partido: J30, 2 jun Las Mesas Hu. – AD Huracán Las Mesas Hu. – Huracán 2–7'));
  assert.doesNotMatch(h2h, /2–9|4–1/);
  assert.match(h2h, /<a class="pt-h2h-row" href="#\/partido\?s=2025-2026&amp;g=PG2&amp;r=Jornada%2015&amp;h=AD%20Hurac%C3%A1n&amp;a=Las%20Mesas%20Hu\.">/);
  // Contexto: posición actual y forma de los dos, en una línea.
  assert.equal(text(blockOf(out, 'Contexto')),
    'Contexto posición y últimos cinco Las Mesas Hu. 9.º , últimos resultados: E P P G P AD Huracán 3.º , últimos resultados: P G G G G');
  // Terminología de la spec: Local y Visitante, G, E y P.
  assert.doesNotMatch(text(out), /\b(HOME|AWAY|Home|Away)\b/);
});

test('cara a cara de la temporada: todos los grupos de liga de la categoría, por fecha (AD Huracán y RC Victoria, FF9 y A2)', () => {
  // Se cruzaron en la primera fase de benjamín (FF9, J1) y dos veces en la segunda (A2, J4 y J15).
  const out = render({ s: '2025-2026', g: 'A2', r: 'Jornada 4', h: 'AD Huracán', a: 'RC Victoria' });
  const h2h = blockOf(out, 'Cara a cara');
  assert.deepEqual(h2h.match(/class="pt-h2h-row[^"]*"/g), ['class="pt-h2h-row"', 'class="pt-h2h-row is-current"', 'class="pt-h2h-row"']);
  assert.equal(text(h2h), 'Cara a cara esta temporada Primera Fase · J1, 12 oct RC Victoria – AD Huracán Victoria – Huracán 0–6'
    + ' Este partido: J4, 11 ene AD Huracán – RC Victoria Huracán – Victoria 2–2 J15, 29 mar RC Victoria – AD Huracán Victoria – Huracán 0–6'
    + ' Ver temporadas anteriores');
  // Cada fila abre su partido, en su grupo.
  assert.deepEqual(h2h.match(/href="[^"]*"/g), [
    'href="#/partido?s=2025-2026&amp;g=FF9&amp;r=Jornada%201&amp;h=RC%20Victoria&amp;a=AD%20Hurac%C3%A1n"',
    'href="#/partido?s=2025-2026&amp;g=A2&amp;r=Jornada%2015&amp;h=RC%20Victoria&amp;a=AD%20Hurac%C3%A1n"',
  ]);
});

test('A1, Guayarmina 8–4 Santidad: cronología de futbolaspalmas en tres columnas y alineaciones del acta', () => {
  const out = render(A1_J1);
  const goles = blockOf(out, 'Goles');
  assert.ok(text(goles).startsWith('Goles minuto a minuto'));
  const body = goles.slice(goles.indexOf('<tbody>'));
  assert.equal(body.match(/<tr>/g).length, 12);
  assert.match(body, /^<tbody><tr><td class="pt-g-home">A\. Valencia Gil<\/td><td class="pt-g-mid"><span class="pt-g-min">12'<\/span> <b class="pt-g-score">1–0<\/b><\/td><td class="pt-g-away"><\/td><\/tr>/);
  assert.match(body, /<tr><td class="pt-g-home"><\/td><td class="pt-g-mid"><span class="pt-g-min">29'<\/span> <b class="pt-g-score">6–1<\/b><\/td><td class="pt-g-away">H\. Contreras Cordero<\/td><\/tr>/);
  assert.doesNotMatch(goles, /no cuadran/);
  const al = blockOf(out, 'Alineaciones');
  const t = text(al);
  assert.ok(t.startsWith('Alineaciones acta nº 246973 Local Guayarmina'));
  // Titulares primero y luego suplentes, por dorsal, con el nombre de playerName y los goles.
  const order = ['Titulares', 'Rodrigo Santana Betancor', 'Liova Godoy Mendoza', 'Suplentes', 'Daniela Maria Godoy Armas', 'Visitante Santidad'];
  assert.deepEqual(order.map((s) => t.indexOf(s)).slice().sort((x, y) => x - y), order.map((s) => t.indexOf(s)));
  assert.match(al, /<tr><td class="pt-dorsal">10<\/td><th scope="row" class="pt-player">Francisco Aduen Ramos Mendoza<\/th><td class="pt-pgoals">2<span class="vh"> goles<\/span><\/td><\/tr>/);
  assert.match(al, /<tr><td class="pt-dorsal">8<\/td><th scope="row" class="pt-player">Hector Contreras Cordero<\/th><td class="pt-pgoals">3<span class="vh"> goles<\/span><\/td><\/tr>/);
  assert.ok(t.includes('Entrenador/a: no consta'));
  assert.ok(t.includes('Árbitro/a: Armiche Jesús Tacoronte Mendoza'));
  // Acta oficial (spec §9.2): abre sin sesión en un navegador limpio.
  assert.match(al, /<a class="pt-acta" href="https:\/\/www\.fiflp\.com\/pnfg\/NPcd\/NFG_CmpPartido\?cod_primaria=1000120&amp;CodActa=246973&amp;cod_acta=246973" target="_blank" rel="noopener noreferrer">Ver acta oficial/);
  // Entrenador con nombre: «Apellidos, Nombre» pasa a «Nombre Apellidos».
  assert.ok(text(blockOf(render(A1_J3), 'Alineaciones')).includes('Entrenador/a: Jose M Leon Cordero'));
});

test('Aviso cuando los goles no cuadran con el marcador: las dos cifras y su procedencia (spec §4.5 y §7)', () => {
  // futbolaspalmas suma 13–2 y su resultado es 14–1.
  assert.ok(text(blockOf(render(A1_J3), 'Goles')).endsWith(
    'Los goles no cuadran con el marcador: la cronología de futbolaspalmas suma 13–2 y el resultado de futbolaspalmas es 14–1.'));
  // Solo acta: la federación apunta los 20 goles al local y el resultado es 0–20.
  const goles = text(blockOf(render(A1_J14), 'Goles'));
  assert.ok(goles.startsWith('Goles según el acta Local Goleta'));
  assert.ok(goles.endsWith('Los goles no cuadran con el marcador: el acta de la federación suma 20–0 y el resultado de futbolaspalmas es 0–20.'));
});

test('Acta sin cronología y con goles sin minuto: la lista de cada equipo, sin marcador parcial', () => {
  const goles = blockOf(render(A1_J11), 'Goles');
  assert.match(goles, /<div class="pt-glists">/);
  assert.doesNotMatch(goles, /pt-g-score|pt-goals/);
  // Cada goleador una vez, con sus goles y los minutos que da el acta: 1 de Moya y 13 de Guayarmina.
  const lists = goles.split(/<div class="pt-glist(?: pt-mine)?">/).slice(1);
  assert.deepEqual(lists.map((l) => (l.match(/<li>/g) || []).length), [1, 4]);
  assert.equal(text(lists[0]), 'Local Moya Álvaro González Leon');
  assert.deepEqual([...lists[1].matchAll(/<li>([^<]+)/g)].map((m) => m[1].trim()),
    ['Liam Garcia Larsen', 'Tara Adeysha Padron Santana', 'Francisco Aduen Ramos Mendoza', 'Abian Jose Valencia Gil']);
  assert.match(lists[1], /<li>Liam Garcia Larsen <span class="pt-glist-n">\(4<span class="vh"> goles<\/span>\)<\/span> <span class="pt-g-min">2&#39;, 32&#39;<\/span><\/li>/);
  assert.match(lists[1], /<li>Francisco Aduen Ramos Mendoza <span class="pt-glist-n">\(5<span class="vh"> goles<\/span>\)<\/span> <span class="pt-g-min">33&#39;<\/span><\/li>/);
  assert.ok(text(goles).endsWith('El acta no da el minuto de todos los goles, así que no hay marcador parcial.'));
  assert.doesNotMatch(goles, /no cuadran/);
});

test('Maspalomas Cup (MCPK1): pasó por penaltis con la tanda; sin acta ni contexto (spec §4.5 y §9.3)', () => {
  const out = render(MCPK1_CUARTOS);
  assert.match(out, /<p class="screen-sub">Cuartos · Prebenjamín, Maspalomas Cup 2026, Copa Plata<\/p>/);
  assert.match(out, /<p class="pt-penalties">UD Las Mesas Huracán pasó por penaltis <span class="pt-tanda">\(3–2\)<\/span><\/p>/);
  assert.ok(text(blockOf(out, 'Resultado')).includes('Resultado: 1–1'));
  assert.equal(blockOf(out, 'Alineaciones'), null);
  assert.equal(blockOf(out, 'Contexto'), null);
  assert.match(out, /<a class="back" href="#\/copa\?s=2025-2026&amp;g=MCPK1" data-action="back"/);
  // Sin la tanda (una copa sin la columna 8), solo quién pasó.
  const ds = datasetsFrom();
  const k1 = ds.cupPrebenjamin.find((g) => g.id === 'MCPK1');
  k1.jornadas['27-06-2026 ( Cuartos )'][0][8] = null;
  assert.match(render(MCPK1_CUARTOS, { datasets: ds }), /<p class="pt-penalties">UD Las Mesas Huracán pasó por penaltis<\/p>/);
  // Un partido del cuadro sin empate no lleva la nota.
  const previa = render({ s: '2025-2026', g: 'MCPK1', r: '26-06-2026 ( Previa )', h: 'CD Tablero', a: 'UD Las Mesas Huracán' });
  assert.ok(text(blockOf(previa, 'Resultado')).includes('Resultado: 1–4'));
  assert.doesNotMatch(previa, /penaltis/);
});

test('«‹» es el ctx.backHref del router (parentOf): la copa en un torneo, la jornada del partido en una liga (M2)', () => {
  // Un torneo o una copa: su cuadro (decisión 100), el mismo padre que da el router.
  assert.match(render(MCPK1_CUARTOS), /<a class="back" href="#\/copa\?s=2025-2026&amp;g=MCPK1" data-action="back"/);
  // Partido no calcula otro padre: pinta el que le da el router, sea cual sea.
  const ctx = ctxFor(PG2_J30);
  ctx.backHref = '#/jornada?s=2025-2026&g=PG2';
  assert.match(String(screen.render(ctx)), /<header class="screen-head"><a class="back" href="#\/jornada\?s=2025-2026&amp;g=PG2" data-action="back"/);
  // La temporada pasada que no se pudo cargar: el «‹» va a la jornada de esa temporada, el mismo
  // de la caja de error del router, y no a la jornada de la temporada actual.
  const past = render({ s: '2024-2025', g: 'PGC2', r: '6', h: 'Las Mesas Hu.', a: 'AD Huracán' });
  assert.match(past, /<a class="back" href="#\/jornada\?s=2024-2025&amp;g=PGC2&amp;r=6" data-action="back"/);
});

test('Un fichero perezoso que falla: su bloque con «Reintentar» y el resto de la pantalla (spec §7)', () => {
  const sinCronologia = datasetsFrom();
  sinCronologia.matchDetail = null;
  const a = render(A1_J1, { datasets: sinCronologia });
  const ga = blockOf(a, 'Goles');
  assert.ok(failBox(ga, 'la cronología de goles'));
  assert.doesNotMatch(ga, /Ramos Mendoza/, 'nunca el acta en lugar de la cronología');
  assert.ok(text(blockOf(a, 'Alineaciones')).includes('Francisco Aduen Ramos Mendoza'));
  assert.ok(blockOf(a, 'Resultado') && blockOf(a, 'Cara a cara') && blockOf(a, 'Contexto'));

  const sinActas = datasetsFrom();
  sinActas.lineups = { '2025-2026': null };
  const b = render(A1_J1, { datasets: sinActas });
  assert.ok(failBox(blockOf(b, 'Alineaciones'), 'las actas de 2025/26'));
  // La cronología de futbolaspalmas no necesita el acta.
  assert.ok(text(blockOf(b, 'Goles')).includes('A. Valencia Gil'));
  // Sin el acta tampoco se sabe si hay goles del acta: la caja de error, no un vacío falso.
  assert.ok(failBox(blockOf(render(A1_J11, { datasets: sinActas }), 'Goles'), 'la cronología de goles'));

  // Temporada pasada que no se pudo cargar: la caja de error, con cabecera y un solo h1.
  const c = render({ s: '2024-2025', g: 'PGC2', r: '6', h: 'Las Mesas Hu.', a: 'AD Huracán' });
  assert.equal(c.match(/<h1[\s>]/g).length, 1);
  assert.ok(failBox(c, 'la temporada 2024/25'));
});

test('Cronología con nombre y minuto a null y acta sin goles (plan B1, «Para B2»)', () => {
  const ds = datasetsFrom();
  ds.matchDetail = {
    ...ds.matchDetail,
    'AD Huracán|Las Mesas Hu.|8-1': { s: '2025-2026', gr: 'PG2', g: [[null, null, '1-0', 'h', 'r'], [27, '1-1', '1-1', 'a', 'r']] },
  };
  const out = render({ s: '2025-2026', g: 'PG2', r: 'Jornada 15', h: 'AD Huracán', a: 'Las Mesas Hu.' }, { datasets: ds });
  const goles = blockOf(out, 'Goles');
  assert.match(goles, /<tr><td class="pt-g-home"><span class="pt-noname">sin nombre<\/span><\/td><td class="pt-g-mid"><b class="pt-g-score">1–0<\/b><\/td><td class="pt-g-away"><\/td><\/tr>/);
  assert.match(goles, /<td class="pt-g-away"><span class="pt-noname">sin nombre<\/span><\/td>/);
  assert.ok(text(goles).endsWith('la cronología de futbolaspalmas suma 1–1 y el resultado de futbolaspalmas es 8–1.'));

  const acta = { s: '2025-2026', gr: 'PG2', cod: 1, home: [{ n: 'PEREZ, ANA', dn: 1, r: 'starter', g: 0 }], away: [], events: [], coachH: null, coachA: null, ref: null };
  const ds2 = datasetsFrom();
  ds2.lineups = { '2025-2026': { ...ds2.lineups['2025-2026'], 'Las Mesas Hu.|AD Huracán|2-7': acta } };
  const out2 = render(PG2_J30, { datasets: ds2 });
  assert.equal(text(blockOf(out2, 'Goles')),
    'Goles según el acta El acta no recoge quién marcó. Los goles no cuadran con el marcador: el acta de la federación suma 0–0 y el resultado de futbolaspalmas es 2–7.');
  assert.ok(text(blockOf(out2, 'Alineaciones')).includes('Ana Perez'));
});

test('Mi equipo: sus goleadores en tinta, como en la maqueta 5-3 (AD Huracán 8–1 Las Mesas Hu.)', () => {
  const ds = datasetsFrom();
  const model = createModel(ds, { portalSeason: PORTAL.season });
  const resolution = { status: 'ok', group: model.group('2025-2026', 'PG2'), name: 'Las Mesas Hu.', cat: 'prebenjamin' };
  const params = { s: '2025-2026', g: 'PG2', r: 'Jornada 15', h: 'AD Huracán', a: 'Las Mesas Hu.' };
  const goles = blockOf(render(params, { datasets: ds, resolution }), 'Goles');
  assert.match(goles, /<td class="pt-g-home"><\/td><td class="pt-g-mid"><span class="pt-g-min">37'<\/span> <b class="pt-g-score">2–1<\/b><\/td><td class="pt-g-away pt-mine">Yadiel<\/td>/);
  assert.doesNotMatch(goles, /pt-g-home pt-mine/);
  // Sin resolución, o en otro grupo, nadie va en tinta.
  assert.doesNotMatch(blockOf(render(params), 'Goles'), /pt-mine/);
});

test('Partido de una temporada pasada: su temporada en la cabecera y sus enlaces', () => {
  const ds = datasetsFrom();
  const hist = fixture('historical-2024-2025');
  ds.seasonRaw['2024-2025'] = { name: '2024-2025', current: false, benjamin: hist.benjamin, prebenjamin: hist.prebenjamin };
  ds.lineups['2024-2025'] = {};
  const out = render({ s: '2024-2025', g: 'PGC2', r: '6', h: 'Las Mesas Hu.', a: 'AD Huracán' }, { datasets: ds });
  assert.match(out, /<p class="screen-sub">Jornada 6 · Prebenjamín, Grupo 2 de Gran Canaria · 2024\/25<\/p>/);
  assert.match(out, /<a class="back" href="#\/jornada\?s=2024-2025&amp;g=PGC2&amp;r=6" data-action="back"/);
  assert.equal(text(blockOf(out, 'Resultado')).slice(0, 60), 'Resultado final Fecha sáb 30 nov Hora 09:00 Campo LAS TORRES');
  assert.equal(text(blockOf(out, 'Alineaciones')), 'Alineaciones La federación no ha publicado el acta de este partido.');
  const h2h = blockOf(out, 'Cara a cara');
  assert.deepEqual(h2h.match(/class="pt-h2h-row[^"]*"/g), ['class="pt-h2h-row is-current"', 'class="pt-h2h-row"']);
  assert.doesNotMatch(h2h, /Ver temporadas anteriores/, 'no hay temporadas anteriores a 2024-25 en SEASONS');
});

test('Partido pendiente: la cuenta atrás, sin marcador, sin goles ni alineaciones', () => {
  const out = render(PG2_J30, { today: '2026-06-01', datasets: datasetsFrom(currentAt('2026-06-01')) });
  assert.ok(text(blockOf(out, 'Resultado')).startsWith('Resultado mañana Fecha mar 2 jun Hora 17:30'));
  assert.match(out, /<p class="pt-score is-pending"><span aria-hidden="true">–<\/span><span class="vh">Sin resultado<\/span><\/p>/);
  assert.equal(blockOf(out, 'Goles'), null);
  assert.equal(blockOf(out, 'Alineaciones'), null);
  assert.match(blockOf(out, 'Cara a cara'), /<span class="pt-h2h-score is-pending">–<\/span>/);
  assert.match(out, /data-text="Las Mesas Hu\. – AD Huracán \(Jornada 30, Prebenjamín, Grupo 2 de Gran Canaria\)"/);
});

test('Temporadas anteriores bajo demanda: misma categoría y el nombre normalizado (spec §4.5)', async () => {
  const ds = datasetsFrom();
  const ctx = ctxFor(PG2_J30, { datasets: ds });
  const out = String(screen.render(ctx));
  assert.match(blockOf(out, 'Cara a cara'), /<button type="button" class="pt-prev-toggle" data-action="previous" aria-expanded="false" aria-controls="partido-anteriores">Ver temporadas anteriores<\/button><div id="partido-anteriores" class="pt-prev" aria-live="polite" hidden><\/div>/);
  const group = ctx.model.group('2025-2026', 'PG2');
  const match = findMatch(group, PG2_J30);
  assert.deepEqual(pastSeasons(ds.seasons, '2025-2026'), ['2024-2025']);
  // Sin cargar, o si la carga falla: la caja de error con «Reintentar».
  assert.equal(await loadSeasons(ds, ['2024-2025'], async () => null), false);
  assert.ok(failBox(previousBlock(ctx, match, group), 'las temporadas anteriores'));
  // Cargadas (el cargador devuelve el SEASON_2024_2025 congelado).
  const hist = fixture('historical-2024-2025');
  const calls = [];
  const ok = await loadSeasons(ds, ['2024-2025'], async (name) => {
    calls.push(name);
    return { name, current: false, benjamin: hist.benjamin, prebenjamin: hist.prebenjamin };
  });
  assert.equal(ok, true);
  assert.deepEqual(calls, ['2024-2025']);
  assert.deepEqual(previousMeetings(ctx.model, ['2024-2025'], match, 'prebenjamin').map((f) => [f.season, f.group.id, f.matches.length]),
    [['2024-2025', 'PGC2', 2]]);
  assert.deepEqual(previousMeetings(ctx.model, ['2024-2025'], match, 'benjamin'), [], 'nunca de la otra categoría');
  const block = String(previousBlock(ctx, match, group));
  assert.ok(text(block).startsWith('2024/25 · Prebenjamín, Grupo 2 de Gran Canaria J6, 30 nov Las Mesas Hu. – AD Huracán'));
  assert.ok(text(block).includes('J17, 1 mar AD Huracán – Las Mesas Hu. Huracán – Las Mesas Hu. 9–0'));
  assert.match(block, /href="#\/partido\?s=2024-2025&amp;g=PGC2&amp;r=6&amp;h=Las%20Mesas%20Hu\.&amp;a=AD%20Hurac%C3%A1n"/);
  assert.doesNotMatch(block, /is-current/);
  // Con la temporada cargada y sin enfrentamientos, se dice.
  const none = String(previousBlock(ctx, { ...match, home: 'Arucas B', away: 'CD Calero' }, group));
  assert.equal(text(none), 'No encontramos partidos entre estos dos equipos en la temporada 2024/25.');
});

// Grupo crudo mínimo de una temporada pasada, con la forma de las fixtures (§5.3): standings vacío
// (no lo necesita previousMeetings) y jornadas en línea de 8 columnas.
const pastRawGroup = (id, jornadas) => ({
  id, name: id, fullName: id, phase: 'Gran Canaria', island: 'grancanaria', standings: [], jornadas,
});
const pastModel = (prebenjamin) => createModel(
  { seasonRaw: { '2024-2025': { name: '2024-2025', benjamin: [], prebenjamin } } },
  { portalSeason: '2025-2026' },
);

test('previousMeetings: equipos con el mismo nombre normalizado, nunca mezclados, sin duplicar y por fecha (ronda de arreglos 1)', () => {
  // 1) «UD Barrial» y «Barrial Atl.» normalizan igual (normalizeTeamName quita UD y ATL): el cara
  // a cara de «UD Barrial – Arucas» solo lista los partidos de UD Barrial, nunca los de Barrial Atl.
  // Barrial Atl. también se enfrenta a Arucas (una jornada distinta): con el código viejo,
  // homes = ['UD Barrial', 'Barrial Atl.'] y aways = ['Arucas'] mezclaban ese partido con los de
  // UD Barrial.
  const mixed = pastRawGroup('PGX1', {
    '1': [['05/10', 'UD Barrial', 'Arucas', 3, 1, null, '10:00', ''], ['05/10', 'Barrial Atl.', 'Telde', 0, 2, null, '10:00', '']],
    '2': [['12/10', 'Arucas', 'UD Barrial', 1, 1, null, '10:00', '']],
    '3': [['20/10', 'Barrial Atl.', 'Arucas', 4, 0, null, '10:00', '']],
  });
  const found1 = previousMeetings(pastModel([mixed]), ['2024-2025'], { home: 'UD Barrial', away: 'Arucas' }, 'prebenjamin');
  assert.equal(found1.length, 1);
  assert.equal(found1[0].matches.length, 2);
  for (const m of found1[0].matches) {
    assert.ok(m.home === 'UD Barrial' || m.away === 'UD Barrial');
    assert.notEqual(m.home, 'Barrial Atl.');
    assert.notEqual(m.away, 'Barrial Atl.');
  }

  // 2) Dos equipos que normalizan igual y ninguno con el nombre exacto del partido actual: el
  // grupo, ambiguo, no sale (mejor nada que un partido de otro equipo).
  const ambiguous = pastRawGroup('PGX2', {
    '1': [['05/10', 'UD Barrial', 'Arucas', 2, 0, null, '10:00', ''], ['05/10', 'CD Barrial', 'Telde', 1, 1, null, '10:00', '']],
  });
  assert.deepEqual(previousMeetings(pastModel([ambiguous]), ['2024-2025'], { home: 'Barrial', away: 'Arucas' }, 'prebenjamin'), []);

  // 3) El partido actual enfrenta a dos equipos que normalizan igual entre sí: antes, el bucle
  // (a,b)/(b,a) sobre headToHead (que ya da los dos sentidos) contaba cada partido dos veces.
  const self = pastRawGroup('PGX3', {
    '1': [['05/10', 'UD Barrial', 'Barrial Atl.', 3, 0, null, '10:00', '']],
    '2': [['12/10', 'Barrial Atl.', 'UD Barrial', 1, 1, null, '10:00', '']],
  });
  const found3 = previousMeetings(pastModel([self]), ['2024-2025'], { home: 'UD Barrial', away: 'Barrial Atl.' }, 'prebenjamin');
  assert.equal(found3.length, 1);
  assert.equal(found3[0].matches.length, 2, 'sin duplicar: dos partidos, no cuatro');

  // 4) Orden por fecha dentro del grupo (la misma regla que el resto de la pantalla), no por
  // jornada: J2 (5 oct) va antes que J1 (20 oct).
  const unordered = pastRawGroup('PGX4', {
    '1': [['20/10', 'UD Barrial', 'Arucas', 2, 2, null, '10:00', '']],
    '2': [['05/10', 'Arucas', 'UD Barrial', 1, 0, null, '10:00', '']],
  });
  const found4 = previousMeetings(pastModel([unordered]), ['2024-2025'], { home: 'UD Barrial', away: 'Arucas' }, 'prebenjamin');
  assert.deepEqual(found4[0].matches.map((m) => m.dateISO), ['2024-10-05', '2024-10-20']);
});

test('previousPanelContent: un fallo tras cargar (dato mal formado) da la caja de error, nunca se queda a medias (ronda de arreglos 1)', async () => {
  const match = { season: '2025-2026', home: 'Las Mesas Hu.', away: 'AD Huracán' };
  const group = { cat: 'prebenjamin' };
  // La temporada ya está en seasonRaw (loadSeasons no hace red), pero model.season() lanza al
  // construirla: simula el RangeError de rowToMatch con una fila mal formada, que antes dejaba el
  // panel colgado en «Cargando…» (showPrevious no tenía camino de error).
  const ctx = {
    today: TODAY,
    datasets: { seasons: SEASONS, seasonRaw: { '2024-2025': { name: '2024-2025' } } },
    model: { season: () => { throw new RangeError('fila con columnas inválidas'); } },
  };
  const saved = console.error;
  console.error = () => {};
  try {
    const content = await previousPanelContent(ctx, match, group);
    assert.ok(failBox(content, 'las temporadas anteriores'));
  } finally {
    console.error = saved;
  }
});

test('needs pide la cronología, las actas de la temporada del partido y, si es pasada, la temporada, que es la única que rechaza', async () => {
  const calls = [];
  const loaders = {
    ensureMatchDetail: async () => { calls.push('cronología'); return { k: 1 }; },
    ensureLineups: async (s) => { calls.push(`actas ${s}`); return s === '2024-2025' ? null : {}; },
    ensureSeasonData: async (s) => { calls.push(`temporada ${s}`); return { name: s, current: false, benjamin: [], prebenjamin: [] }; },
  };
  const ds = { seasons: SEASONS, seasonRaw: {}, lineups: {}, matchDetail: null };
  const loads = partidoNeeds({ s: '2025-2026', g: 'PG2' }, ds, loaders);
  assert.equal(loads.length, 2);
  await Promise.all(loads);
  assert.deepEqual(calls, ['cronología', 'actas 2025-2026']);
  assert.deepEqual([ds.matchDetail, ds.lineups['2025-2026']], [{ k: 1 }, {}]);
  calls.length = 0;
  await Promise.all(partidoNeeds({ s: '2024-2025', g: 'PGC2' }, ds, loaders));
  assert.deepEqual(calls, ['cronología', 'actas 2024-2025', 'temporada 2024-2025']);
  assert.equal(ds.lineups['2024-2025'], null, 'el fallo queda anotado para la caja de error');
  assert.equal(ds.seasonRaw['2024-2025'].name, '2024-2025');
  // Sin `s`, la temporada actual de SEASONS; una temporada ya cargada no se pide otra vez.
  calls.length = 0;
  await Promise.all(partidoNeeds({ g: 'PG2' }, ds, loaders));
  await Promise.all(partidoNeeds({ s: '2024-2025', g: 'PGC2' }, ds, loaders));
  assert.deepEqual(calls, ['cronología', 'actas 2025-2026', 'cronología', 'actas 2024-2025']);
  // La temporada del partido es imprescindible: si no llega, la carga rechaza con «la temporada …»,
  // el <qué> de la caja de error del router. Cronología y actas no rechazan nunca.
  const failing = { ...loaders, ensureSeasonData: async () => null };
  const ds2 = { seasons: [...SEASONS, { name: '2023-2024', current: false }], seasonRaw: {}, lineups: {}, matchDetail: null };
  await assert.rejects(Promise.all(partidoNeeds({ s: '2023-2024', g: 'P1' }, ds2, failing)), { message: 'la temporada 2023/24' });
  assert.equal(ds2.seasonRaw['2023-2024'], undefined);
  assert.equal(screen.id, 'partido');
  assert.equal(typeof screen.needs, 'function');
});

test('Partido que no está: vacío con enlace a la jornada, nunca una pantalla en blanco; enlaces antiguos con el número', () => {
  const out = render({ ...PG2_J30, a: 'Nadie' });
  assert.equal(out.match(/<h1[\s>]/g).length, 1);
  assert.ok(text(out).includes('Partido no encontrado Este partido no está en los datos de Prebenjamín, Grupo 2 de Gran Canaria.'));
  assert.match(out, /<a class="back" href="#\/jornada\?s=2025-2026&amp;g=PG2" data-action="back"/);
  assert.ok(text(render({ ...PG2_J30, g: 'ZZ9' })).includes('Este partido no está en los datos de la temporada 2025/26.'));
  // «30» por «Jornada 30» (el número de un enlace antiguo) y la ronda ausente: el único partido de h contra a.
  const group = ctxFor(PG2_J30).model.group('2025-2026', 'PG2');
  assert.equal(findMatch(group, { ...PG2_J30, r: '30' }).dateISO, '2026-06-02');
  assert.equal(findMatch(group, { ...PG2_J30, r: undefined }).dateISO, '2026-06-02');
  assert.equal(findMatch(group, { ...PG2_J30, r: 'Jornada 29' }).dateISO, '2026-06-02');
});

test('actaFor: el acta de su grupo y su temporada; nunca la de otro partido con la misma clave', () => {
  const lineups = fixture('lineups-2025-2026');
  const entry = lineups['Guayarmina|Santidad|8-4'];
  const match = { season: '2025-2026', groupId: 'A1', roundKey: 'Jornada 1', home: 'Guayarmina', away: 'Santidad', hs: 8, as: 4 };
  assert.equal(actaFor(match, lineups).cod, 246973);
  assert.equal(actaFor({ ...match, groupId: 'A2' }, lineups), null);
  assert.equal(actaFor({ ...match, season: '2024-2025' }, lineups), null);
  assert.equal(actaFor({ ...match, hs: null, as: null }, lineups), null);
  assert.equal(actaFor(match, null), null);
  const dup = { 'Guayarmina|Santidad|8-4': { dup: true, list: [entry, { ...entry, gr: 'FF1', cod: 1 }] } };
  assert.equal(actaFor(match, dup).cod, 246973);
  assert.equal(actaFor({ ...match, groupId: 'FF1' }, dup).cod, 1);
});

test('ensureLineups: sin fichero de actas (404) no hay actas; otro fallo da null y se reintenta', async () => {
  const saved = { document: globalThis.document, fetch: globalThis.fetch, warn: console.warn };
  const script = { src: 'https://x/data-seasons.js?v=20260923j', getAttribute: () => './data-seasons.js?v=20260923j' };
  globalThis.document = { querySelector: () => script };
  console.warn = () => {};
  const seen = [];
  let status = 404;
  globalThis.fetch = async (url) => {
    seen.push(url);
    return { ok: status === 200, status, text: async () => 'const LINEUPS_2031_2032 = {"a|b|1-0":{"s":"2031-2032","gr":"X"}};\n' };
  };
  try {
    assert.deepEqual(await ensureLineups('2030-2031'), {});
    assert.match(seen[0], /^\.\/data-lineups-2030-2031\.js\?v=20260923j$/);
    status = 503;
    assert.equal(await ensureLineups('2031-2032'), null);
    status = 200;
    assert.deepEqual(Object.keys(await ensureLineups('2031-2032')), ['a|b|1-0']);
  } finally {
    globalThis.document = saved.document;
    globalThis.fetch = saved.fetch;
    console.warn = saved.warn;
  }
});

test('acta.css: cada clase de la pantalla existe; marcador de 40 px; pulsables de 44 px; resalte sin óvalo', () => {
  const css = readFileSync(join(ROOT, 'acta.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
  const defined = new Set([...css.matchAll(/\.([a-zA-Z][\w-]*)/g)].map((m) => m[1]));
  const ctx = ctxFor(PG2_J30);
  const group = ctx.model.group('2025-2026', 'PG2');
  const hist = fixture('historical-2024-2025');
  ctx.datasets.seasonRaw['2024-2025'] = { name: '2024-2025', current: false, benjamin: hist.benjamin, prebenjamin: hist.prebenjamin };
  const out = [PG2_J30, A1_J1, A1_J3, A1_J11, A1_J14, MCPK1_CUARTOS].map((p) => render(p)).join('')
    + render(PG2_J30, { today: '2026-06-01', datasets: datasetsFrom(currentAt('2026-06-01')) })
    + String(previousBlock(ctx, findMatch(group, PG2_J30), group))
    + '<p class="pt-loading">';
  const used = new Set([...out.matchAll(/class="([^"]+)"/g)].flatMap((m) => m[1].split(/\s+/)).filter((c) => /^(pt|is)-/.test(c)));
  assert.deepEqual([...used].filter((c) => !defined.has(c)), []);
  const rule = (selector) => {
    const m = css.match(new RegExp(`(?:^|\\})\\s*${selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*\\{([^}]*)\\}`));
    assert.ok(m, `no hay regla para «${selector}»`);
    return m[1];
  };
  assert.match(rule('.pt-score'), /font-size:\s*40px/);
  assert.match(rule('.pt-score'), /font-weight:\s*800/);
  for (const sel of ['.pt-h2h-row', '.pt-prev-toggle', '.pt-acta']) assert.match(rule(sel), /(min-)?height:\s*44px/, sel);
  const current = rule('.pt-h2h-row.is-current');
  assert.match(current, /background:\s*var\(--mark\)/);
  assert.match(current, /color:\s*var\(--ink\)/);
  assert.match(current, /font-weight:\s*800/);
  assert.match(current, /box-shadow:\s*inset 3px 0 0 var\(--ink\)/);
  // Ninguna regla de la pantalla redondea (sin óvalo ni radio, §3.3) ni fuerza mayúsculas.
  const own = [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)].filter((m) => m[1].includes('.pt-'));
  assert.ok(own.length > 40);
  for (const [, selector, body] of own) assert.doesNotMatch(body, /border-radius|text-transform:\s*uppercase/, selector.trim());
});
