// Plan B2, Tarea 9: pantalla Jornada (spec §4.3, §4.8 y caso 5 de §11). render(ctx) es pura:
// se prueba sobre el HTML que devuelve, con las fixtures congeladas y `today` inyectado.
import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { fixture } from './fixtures/rediseno/load.mjs';
import { currentAt } from './fixtures/rediseno/simulate.mjs';
import { ctxFor, datasetsFor, pastSeasonRaw, cssRules, MY_TEAM, PORTAL_SEASON } from './fixtures/rediseno/screens.mjs';
import { screen, groupCalendar, dayLabel, dateRange } from '../../src/screen-jornada.js';
import { myTeamIn } from '../../src/myteam.js';
import { seasonNeeds } from '../../src/state.js';
import { seasonLabel } from '../../src/model.js';
import { buildCalendar } from '../../src/links.js';

const s = (h) => String(h);
// Texto visible: sin etiquetas, con las entidades básicas resueltas y los espacios juntos.
const text = (h) => s(h).replace(/<[^>]*>/g, ' ').replace(/&quot;/g, '"').replace(/&#39;/g, "'")
  .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim();
const render = (params, opts) => s(screen.render(ctxFor('jornada', { s: PORTAL_SEASON, ...params }, opts)));
const at = (today) => ({ today, datasets: datasetsFor({ current: currentAt(today) }) });
const title = (out) => (out.match(/<h2 class="round-title">(.*?)<\/h2>/) || [])[1];
const days = (out) => [...out.matchAll(/<h3 class="day-title">(.*?)<\/h3>/g)].map(m => m[1]);
const noticeOf = (out) => text((out.match(/<p class="notice">.*?<\/p>/) || [''])[0]);
const rows = (out) => [...out.matchAll(/<a class="match-row[^"]*" href="([^"]*)">(.*?)<\/a>/g)]
  .map(m => ({ href: m[1].replace(/&amp;/g, '&'), mine: m[0].includes('is-mine'), text: text(m[2]) }));

test('PG2, jornada 30: cabecera, «Jornada 30 de 30», del 2 al 6 de junio y el aviso de §11 caso 5', () => {
  const out = render({ g: 'PG2', r: 'Jornada 30' });
  assert.match(out, /^<section data-screen="jornada">/);
  assert.equal((out.match(/<h1[ >]/g) || []).length, 1);
  assert.match(out, /<h1>Jornada<\/h1><p class="screen-sub">Prebenjamín, Grupo 2 de Gran Canaria<\/p>/);
  assert.match(out, /<a class="screen-action" href="#\/ligas\?s=2025-2026&amp;c=prebenjamin&amp;i=grancanaria&amp;to=jornada">Otro grupo<\/a>/);
  assert.equal(title(out), 'Jornada 30 de 30');
  assert.match(out, /<p class="round-dates">del 2 al 6 de junio<\/p>/);
  assert.equal(noticeOf(out), 'Sin partido en esta jornada: RC Victoria y Arucas B (descansa o le tocaba contra CD Batán)');
  assert.match(out, /<p class="notice"><b>Sin partido en esta jornada:<\/b> /);
  assert.doesNotMatch(text(out), /Faltan|Sin datos en la fuente/);
});

test('PG2, jornada 30: los partidos por día, el propio primero y resaltado; cada fila abre su ficha', () => {
  const out = render({ g: 'PG2', r: 'Jornada 30' });
  assert.deepEqual(days(out), ['Martes 2 de junio', 'Sábado 6 de junio']);
  const list = rows(out);
  assert.equal(list.length, 6);
  assert.deepEqual(list.map(r => r.mine), [true, false, false, false, false, false]);
  assert.equal(list[0].text, 'Partido de mi equipo. 17:30 Las Mesas Hu. 2–7 AD Huracán');
  assert.equal(list[0].href, '#/partido?s=2025-2026&g=PG2&r=Jornada%2030&h=Las%20Mesas%20Hu.&a=AD%20Hurac%C3%A1n');
  assert.deepEqual(list.slice(1).map(r => r.text.split(' ')[1]), ['Acodetti', 'Gran', 'La', 'Las', 'Telde']);
  assert.ok(list.every(r => r.href.startsWith('#/partido?s=2025-2026&g=PG2&r=Jornada%2030&h=')));
});

test('el día del partido propio va primero aunque sea posterior; «Sin fecha», al final', () => {
  const current = fixture('current-2025-2026');
  const j30 = current.history.PG2['Jornada 30'];
  j30[0][0] = '2026-06-07';   // Las Mesas Hu. – AD Huracán, al domingo
  j30[5][0] = '';             // Telde – CD Calero, sin fecha
  const out = render({ g: 'PG2', r: 'Jornada 30' }, { datasets: datasetsFor({ current }) });
  assert.deepEqual(days(out), ['Domingo 7 de junio', 'Sábado 6 de junio', 'Sin fecha']);
  assert.equal(rows(out)[0].mine, true);
  assert.match(out, /<p class="round-dates">del 6 al 7 de junio<\/p>/);
});

test('anterior y siguiente: enlaces a la jornada vecina con r = Round.key y un id estable; en los extremos, desactivados', () => {
  // El id es el mismo en cada jornada: al cambiar (replaceState), el router devuelve el foco al
  // control pulsado (B11 de la revisión); en un extremo, el apagado conserva el id y el foco.
  const last = render({ g: 'PG2', r: 'Jornada 30' });
  assert.match(last, /<a class="round-step" id="round-prev" href="#\/jornada\?s=2025-2026&amp;g=PG2&amp;r=Jornada%2029" aria-label="Jornada anterior: Jornada 29">‹<\/a>/);
  assert.match(last, /<span class="round-step is-off" id="round-next" role="link" aria-disabled="true" tabindex="-1" aria-label="Jornada siguiente: no hay">›<\/span>/);
  const first = render({ g: 'PG2', r: 'Jornada 1' });
  assert.match(first, /<span class="round-step is-off" id="round-prev" role="link" aria-disabled="true" tabindex="-1" aria-label="Jornada anterior: no hay">‹<\/span>/);
  assert.match(first, /id="round-next" href="#\/jornada\?s=2025-2026&amp;g=PG2&amp;r=Jornada%202" aria-label="Jornada siguiente: Jornada 2">›<\/a>/);
});

test('jornada por defecto (defaultRound, por fecha): sin r, con una r que no existe o con su número', () => {
  assert.equal(title(render({ g: 'PG2' })), 'Jornada 30 de 30', 'temporada terminada: la última con resultados');
  assert.equal(title(render({ g: 'PG2' }, at('2026-05-27'))), 'Jornada 29 de 30');
  assert.equal(title(render({ g: 'A2' }, at('2026-01-10'))), 'Jornada 4 de 22', 'el aplazado de la jornada 2 no manda (decisión 1 de B1)');
  assert.equal(title(render({ g: 'PG2', r: 'Jornada 99' })), 'Jornada 30 de 30');
  assert.equal(title(render({ g: 'PG2', r: '12' })), 'Jornada 12 de 30', 'un enlace escrito a mano con el número');
});

test('M con huecos: el máximo entre el número de rondas y el mayor n (grupo sintético, sin la jornada 3)', () => {
  // Grupo a mano con la forma de Round/Group del modelo: rondas con n 1, 2 y 4 (sin la 3), así
  // que rounds.length (3) no basta para dar M; manda el mayor n (4), como escribe roundTitle.
  const round = (n) => ({ key: String(n), label: `Jornada ${n}`, n, dateFrom: null, dateTo: null, matches: [] });
  const group = {
    season: PORTAL_SEASON, id: 'SINT', cat: 'prebenjamin', name: 'Sintético', fullName: null, phase: null,
    island: 'grancanaria', url: null, standingsKind: null, kind: 'league', compKey: 'sintetico-grancanaria',
    label: 'Grupo sintético', standings: [], rounds: [round(1), round(2), round(4)], currentRound: null,
  };
  const season = { name: PORTAL_SEASON, current: true, groups: [group] };
  const model = {
    season: (name) => (name === PORTAL_SEASON ? season : null),
    group: (name, id) => (name === PORTAL_SEASON && id === 'SINT' ? group : null),
  };
  const ctx = {
    route: { screen: 'jornada', params: { g: 'SINT', r: '4' } }, params: { g: 'SINT', r: '4' }, model,
    myTeam: null, resolution: { status: 'absent' }, today: '2026-09-24', health: null, datasets: {},
    portal: { season: PORTAL_SEASON, defaultTeam: null }, lastPrimary: 'jornada',
  };
  assert.equal(title(s(screen.render(ctx))), 'Jornada 4 de 4');
});

test('PG3: en ninguna jornada aparece «faltan»; los dos que no juegan, sin retirados', () => {
  const pg3 = ctxFor('jornada', { s: PORTAL_SEASON, g: 'PG3' }).model.group(PORTAL_SEASON, 'PG3');
  assert.equal(pg3.rounds.length, 30);
  for (const round of pg3.rounds) {
    const out = render({ g: 'PG3', r: round.key });
    assert.doesNotMatch(text(out), /Falta/, round.key);
    // Las jornadas 4 y 19 traen los siete partidos: nadie se queda sin jugar.
    if (round.matches.length === 7) assert.equal(noticeOf(out), '', round.key);
    else assert.match(noticeOf(out), /^Sin partido en esta jornada: [^(),]+ y [^()]+$/, round.key);
  }
});

test('PFV2: CD Teguinte (retirado) no sale en la lista, el aviso lo nombra y sus partidos sin fecha no mandan', () => {
  const out = render({ g: 'PFV2', r: '1' });
  assert.equal(title(out), 'Jornada 1 de 14');
  assert.deepEqual(days(out), ['Domingo 2 de noviembre']);
  assert.equal(rows(out).length, 3);
  assert.ok(rows(out).every(r => !r.text.includes('Teguinte')));
  assert.equal(noticeOf(out), 'Sin partido en esta jornada: ATISACHI DE FUERTEVENTURA C.F., C.D. "B" (descansa o le tocaba contra CD Teguinte)');
  assert.match(out, /ATISACHI DE FUERTEVENTURA C\.F\., C\.D\. &quot;B&quot;/, 'comillas escapadas');
  // A 1 de marzo, la jornada 9 (08/03) va antes que la 3 aplazada (15/03).
  assert.equal(title(render({ g: 'PFV2' }, at('2026-03-01'))), 'Jornada 9 de 14');
});

test('faltan: una jornada con menos partidos que la moda del grupo, en singular y en plural', () => {
  for (const [quitar, texto] of [[2, 'Faltan 2 partidos de esta jornada en la fuente'], [1, 'Falta 1 partido de esta jornada en la fuente']]) {
    const current = fixture('current-2025-2026');
    current.history.PG2['Jornada 15'].splice(0, quitar);
    const out = render({ g: 'PG2', r: 'Jornada 15' }, { datasets: datasetsFor({ current }) });
    assert.equal(noticeOf(out), texto);
  }
});

test('Calendario del grupo: solo con partidos futuros, sin los de retirados, y el .ics con uno por partido', () => {
  assert.doesNotMatch(render({ g: 'PG2' }), /data-action="group-calendar"/, 'sin partidos futuros, se oculta');
  const out = render({ g: 'PG2' }, at('2026-05-27'));
  // Bajo la botonera, la región de estado común de «Compartir» (shareStatus, I2 de la revisión final).
  assert.match(out, /<div class="buttons"><button class="button" type="button" data-action="share-round">Compartir jornada<\/button><button class="button" type="button" data-action="group-calendar">Calendario del grupo<\/button><\/div><\/div><p class="share-status" role="status"><\/p><\/section>$/);
  const pg2 = ctxFor('jornada', {}, at('2026-05-27')).model.group(PORTAL_SEASON, 'PG2');
  const futuros = groupCalendar(pg2, '2026-05-27');
  assert.equal(futuros.length, 11, 'cinco de la jornada 29 y seis de la 30');
  assert.deepEqual(futuros[0], { date: '2026-05-27', time: '18:00', home: 'Santa Brígida', away: 'Arucas B', venue: '', jornada: 'Jornada 29' });
  const ics = buildCalendar(futuros, { season: PORTAL_SEASON, group: 'PG2', name: pg2.label, now: new Date('2026-05-27T08:00:00Z') });
  assert.equal((ics.match(/BEGIN:VEVENT/g) || []).length, 11);
  const pfv2 = ctxFor('jornada', {}, at('2026-03-01')).model.group(PORTAL_SEASON, 'PFV2');
  const fv = groupCalendar(pfv2, '2026-03-01');
  assert.equal(fv.length, 21);
  assert.ok(fv.every(m => m.home !== 'CD Teguinte' && m.away !== 'CD Teguinte'));
});

// I2 de la revisión final de B2: la respuesta común de «Compartir» (la de Partido): sin share ni
// portapapeles, el enlace de la jornada en la región de estado, para copiarlo a mano; el botón no cambia.
test('mount: «Compartir jornada» sin share ni portapapeles escribe el enlace en la región de estado', async () => {
  const ctx = ctxFor('jornada', { s: PORTAL_SEASON, g: 'PG2', r: 'Jornada 30' });
  let onClick = null;
  const status = { textContent: '' };
  const el = { addEventListener: (type, fn) => { if (type === 'click') onClick = fn; }, querySelector: (sel) => (sel === '.share-status' ? status : null) };
  const root = { querySelector: (sel) => (sel === '[data-screen="jornada"]' ? el : null) };
  const saved = { navigator: Object.getOwnPropertyDescriptor(globalThis, 'navigator'), location: globalThis.location };
  Object.defineProperty(globalThis, 'navigator', { configurable: true, writable: true,
    value: { clipboard: { writeText: async () => { throw new Error('denegado'); } } } });
  globalThis.location = { href: 'https://x.test/futbol-base/#/jornada' };
  try {
    screen.mount(root, ctx);
    const button = { textContent: 'Compartir jornada', dataset: { action: 'share-round' } };
    onClick({ target: { closest: () => button } });
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(status.textContent, 'No se pudo copiar el enlace: https://x.test/futbol-base/#/jornada?s=2025-2026&g=PG2&r=Jornada%2030');
    assert.equal(button.textContent, 'Compartir jornada', 'el botón no cambia de texto');
  } finally {
    if (saved.navigator) Object.defineProperty(globalThis, 'navigator', saved.navigator);
    else delete globalThis.navigator;
    if (saved.location === undefined) delete globalThis.location;
    else globalThis.location = saved.location;
  }
});

test('temporada pasada (P1 2024-25): la temporada en la etiqueta, fechas DD/MM, sin resalte ni calendario', () => {
  const datasets = datasetsFor({ seasonRaw: { '2024-2025': pastSeasonRaw() } });
  const out = render({ s: '2024-2025', g: 'P1' }, { datasets });
  assert.match(out, /<p class="screen-sub">Benjamín, Primera Fase, Grupo 1 · 2024\/25<\/p>/);
  assert.equal(title(out), 'Jornada 9 de 9');
  assert.match(out, /<p class="round-dates">del 20 al 21 de diciembre<\/p>/);
  assert.deepEqual(days(out), ['Viernes 20 de diciembre', 'Sábado 21 de diciembre']);
  assert.equal(rows(out).length, 5);
  assert.ok(rows(out).every(r => !r.mine && r.href.startsWith('#/partido?s=2024-2025&g=P1&r=9&')));
  assert.doesNotMatch(out, /group-calendar/);
  assert.match(out, /href="#\/ligas\?s=2024-2025&amp;c=benjamin&amp;i=grancanaria&amp;to=jornada"/);
});

test('temporada sin cargar, grupo que no existe o sin calendario: nunca una pantalla en blanco', () => {
  // needs no trajo 2023-24: la caja de error de shell.js (Tarea 5), con «Reintentar».
  const failed = render({ s: '2023-2024', g: 'P1' });
  assert.match(failed, /<h1>Jornada<\/h1>/);
  assert.match(text(failed), /No se pudieron cargar los datos de la temporada 2023\/24/);
  assert.match(failed, /data-action="retry"/);
  const none = render({ g: 'ZZ9' });
  assert.match(none, /<h1>Jornada<\/h1>/);
  assert.match(none, /<p class="empty">No hay ningún grupo ZZ9 en la temporada 2025\/26\.<\/p>/);
  assert.match(none, /href="#\/ligas\?s=2025-2026&amp;to=jornada">Otro grupo/);
  const current = fixture('current-2025-2026');
  current.history.PG2 = {};
  const out = render({ g: 'PG2' }, { datasets: datasetsFor({ current }) });
  assert.match(out, /<p class="empty">La fuente todavía no ha publicado el calendario de este grupo\.<\/p>/);
});

test('sin g: «Elige un grupo en «Otro grupo».» sin lanzar', () => {
  let out;
  assert.doesNotThrow(() => { out = render({}); });
  assert.match(out, /<h1>Jornada<\/h1>/);
  assert.match(out, /<p class="empty">Elige un grupo en «Otro grupo»\.<\/p>/);
  assert.match(out, /href="#\/ligas\?s=2025-2026&amp;to=jornada">Otro grupo/);
});

test('fechas: días de la semana, intervalos entre meses y años, y un solo día', () => {
  assert.equal(dayLabel('2026-06-02'), 'Martes 2 de junio');
  assert.equal(dayLabel(null), 'Sin fecha');
  assert.equal(dateRange('2026-06-02', '2026-06-06'), 'del 2 al 6 de junio');
  assert.equal(dateRange('2026-05-30', '2026-06-02'), 'del 30 de mayo al 2 de junio');
  assert.equal(dateRange('2025-12-28', '2026-01-03'), 'del 28 de diciembre de 2025 al 3 de enero de 2026');
  assert.equal(dateRange('2026-06-06', '2026-06-06'), 'sábado 6 de junio');
  assert.equal(dateRange(undefined, undefined), 'sin fecha publicada');
  assert.equal(seasonLabel('2024-2025'), '2024/25');
});

test('myTeamIn: el de la resolución en su grupo, el nombre exacto en su categoría y nunca un homónimo', () => {
  const ctx = ctxFor('jornada', {}, { datasets: datasetsFor({ seasonRaw: { '2024-2025': pastSeasonRaw() } }) });
  const g = (season, id) => ctx.model.group(season, id);
  assert.equal(myTeamIn(g(PORTAL_SEASON, 'PG2'), MY_TEAM, ctx.resolution), 'Las Mesas Hu.');
  assert.equal(myTeamIn(g(PORTAL_SEASON, 'A2'), MY_TEAM, ctx.resolution), null, '«Las Mesas Hu.» de benjamín es otro equipo');
  assert.equal(myTeamIn(g(PORTAL_SEASON, 'PG3'), MY_TEAM, ctx.resolution), null);
  assert.equal(myTeamIn(g('2024-2025', 'PGC2'), MY_TEAM, ctx.resolution), 'Las Mesas Hu.');
  assert.equal(myTeamIn(g('2024-2025', 'P1'), MY_TEAM, ctx.resolution), null);
  assert.equal(myTeamIn(g(PORTAL_SEASON, 'PG2'), MY_TEAM, { status: 'ask', candidates: [] }), 'Las Mesas Hu.');
  assert.equal(myTeamIn(null, MY_TEAM, ctx.resolution), null);
  // Santa Brígida juega en B1 y en B2 (Segunda Fase B): con B1 resuelto, la de B2 es otro equipo;
  // la de FF9, su grupo de la Primera Fase, sí es la suya.
  const brigida = { name: 'Santa Brígida', season: PORTAL_SEASON, cat: 'benjamin', groupId: 'B1' };
  const ok = { status: 'ok', group: g(PORTAL_SEASON, 'B1'), name: 'Santa Brígida', cat: 'benjamin' };
  assert.equal(myTeamIn(g(PORTAL_SEASON, 'B1'), brigida, ok), 'Santa Brígida');
  assert.equal(myTeamIn(g(PORTAL_SEASON, 'B2'), brigida, ok), null);
  assert.equal(myTeamIn(g(PORTAL_SEASON, 'FF9'), brigida, ok), 'Santa Brígida');
});

test('needs: [] en la temporada del portal o ya cargada; si no, la carga y la guarda, o rechaza con «la temporada …»', async () => {
  const datasets = datasetsFor();
  assert.deepEqual(seasonNeeds(PORTAL_SEASON, datasets, PORTAL_SEASON), []);
  assert.throws(() => seasonNeeds('2024-2025', datasets), TypeError, 'sin la temporada del portal, nunca la de config.js');
  // La temporada del portal llega a screen.needs desde el router (R2-1 de la revisión adversarial).
  assert.deepEqual(screen.needs({ s: PORTAL_SEASON }, datasets, { portalSeason: PORTAL_SEASON }), []);
  assert.deepEqual(screen.needs({ s: '2024-2025' }, { seasonRaw: { '2024-2025': {} } }, { portalSeason: PORTAL_SEASON }), []);
  const saved = { fetch: globalThis.fetch, document: globalThis.document, error: console.error };
  globalThis.document = { querySelector: () => null };
  console.error = () => {};   // ensureSeasonData avisa del 404 por consola
  try {
    globalThis.fetch = async () => ({ ok: false, status: 404 });
    const [fails] = seasonNeeds('2022-2023', datasets, PORTAL_SEASON);
    await assert.rejects(fails, { message: 'la temporada 2022/23' });
    assert.equal(datasets.seasonRaw['2022-2023'], undefined);
    globalThis.fetch = async () => ({ ok: true, text: async () => 'const SEASON_2023_2024={"name":"2023-2024","benjamin":[],"prebenjamin":[]};' });
    const loads = seasonNeeds('2023-2024', datasets, PORTAL_SEASON);
    assert.equal(loads.length, 1);
    await loads[0];
    assert.equal(datasets.seasonRaw['2023-2024'].name, '2023-2024');
    assert.deepEqual(seasonNeeds('2023-2024', datasets, PORTAL_SEASON), []);
  } finally {
    console.error = saved.error;
    globalThis.fetch = saved.fetch;
    if (saved.document === undefined) delete globalThis.document; else globalThis.document = saved.document;
  }
});

test('la pantalla es pura y usa solo clases que existen en acta.css', () => {
  const defined = cssRules().classes;
  const out = [render({ g: 'PG2', r: 'Jornada 30' }), render({ g: 'PG2' }, at('2026-05-27')), render({ g: 'ZZ9' })].join('');
  const used = new Set([...out.matchAll(/class="([^"]+)"/g)].flatMap(m => m[1].split(/\s+/)));
  assert.deepEqual([...used].filter(c => !defined.has(c)), []);
  const ctx = ctxFor('jornada', { s: PORTAL_SEASON, g: 'PG2', r: 'Jornada 30' });
  assert.equal(s(screen.render(ctx)), s(screen.render(ctx)), 'mismo ctx, mismo HTML');
  assert.equal(screen.id, 'jornada');
  assert.equal(typeof screen.mount, 'function');
});

test('CSS: acción y flechas de 44 px o más, y los días en dos columnas solo desde 1024 px', () => {
  const rules = cssRules();
  const body = (selector, media = null) => rules.filter(r => r.media === media && r.selector === selector).map(r => r.body).join(';');
  assert.match(body('.screen-action'), /min-height:\s*44px/);
  assert.match(body('.round-step'), /min-height:\s*56px/);
  assert.match(body('.screen-head'), /border-bottom:\s*2px solid var\(--ink\)/);
  const days = rules.filter(r => r.selector === '.days');
  assert.equal(days.length, 1);
  assert.match(days[0].media, /min-width:\s*1024px/);
  assert.match(days[0].body, /grid-template-columns:\s*repeat\(auto-fit, minmax\(400px, 1fr\)\)/);
});
