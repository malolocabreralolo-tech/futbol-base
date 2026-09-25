// Rutas nuevas, enlaces antiguos y cuenta atrás (spec §4.1 y §4.2.A).
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  SCREENS, parseRoute, routeHref, translateLegacy, countdownLabel, matchHref, teamHref, canaryDateTime, checkedPhrase,
  checkedCell, calendarFileName, downloadCalendar, shareAndAnnounce,
} from '../../src/links.js';

const SEASON = '2025-2026';

test('SCREENS son las pantallas de la tabla de rutas', () => {
  assert.deepEqual(SCREENS, ['', 'jornada', 'tabla', 'explorar', 'partido', 'equipo', 'ligas', 'copa', 'goleadores', 'temporadas', 'records', 'fuentes', 'ajustes']);
});

test('parseRoute lee pantalla y parámetros; lo desconocido es la portada', () => {
  assert.deepEqual(parseRoute('#/tabla?g=PG2&v=forma'), { screen: 'tabla', params: { g: 'PG2', v: 'forma' } });
  for (const hash of ['#/', '#', '', undefined, null, '#/desconocida?g=PG2', '#/Tabla', '#/tabla/extra', '#section=clasif&group=PG2']) {
    assert.deepEqual(parseRoute(hash), { screen: '', params: {} }, String(hash));
  }
  assert.deepEqual(parseRoute('#/tabla?g=&v=forma'), { screen: 'tabla', params: { v: 'forma' } });
  assert.deepEqual(parseRoute('#/tabla?g=PG2&g=PG3'), { screen: 'tabla', params: { g: 'PG2' } });
  assert.deepEqual(parseRoute('#/equipo?g=PG2&t=Las+Mesas+Hu.'), { screen: 'equipo', params: { g: 'PG2', t: 'Las Mesas Hu.' } });
  assert.deepEqual(parseRoute('#/equipo?s=2025-2026&g=PG2&t=Las%20Mesas%20Hu.#calendario'),
    { screen: 'equipo', params: { s: '2025-2026', g: 'PG2', t: 'Las Mesas Hu.' } });
});

test('routeHref omite vacíos y ordena las claves de forma estable', () => {
  assert.equal(routeHref('tabla', { v: 'forma', g: 'PG2' }), '#/tabla?g=PG2&v=forma');
  assert.equal(routeHref('', {}), '#/');
  assert.equal(routeHref('explorar'), '#/explorar');
  assert.equal(routeHref('tabla', { s: '', g: 'PG2', v: null, r: undefined }), '#/tabla?g=PG2');
  assert.equal(routeHref('partido', { a: 'AD Huracán', h: 'Las Mesas Hu.', r: 'Jornada 30', g: 'PG2', s: '2024-2025' }),
    '#/partido?s=2024-2025&g=PG2&r=Jornada%2030&h=Las%20Mesas%20Hu.&a=AD%20Hurac%C3%A1n');
  assert.equal(routeHref('ligas', { to: 'tabla', f: 'segunda-fase-a', i: 'grancanaria', c: 'benjamin', s: SEASON }),
    '#/ligas?s=2025-2026&c=benjamin&i=grancanaria&f=segunda-fase-a&to=tabla');
  // `r` es siempre Round.key («Jornada 3», «06-06-2026 ( Final )»), nunca un número.
  assert.equal(routeHref('jornada', { g: 'PG2', r: 'Jornada 3' }), '#/jornada?g=PG2&r=Jornada%203');
  assert.equal(routeHref('desconocida', { g: 'PG2' }), '#/');
});

test('ida y vuelta de cada ruta de §4.1, con nombres difíciles', () => {
  const routes = [
    ['', {}],
    ['jornada', { s: SEASON, g: 'PG2', r: 'Jornada 30' }],
    ['tabla', { s: SEASON, g: 'PG2', v: 'forma' }],
    ['explorar', { s: '2024-2025', q: 'Unión & Sur' }],
    ['partido', { s: SEASON, g: 'PFV2', r: '14', h: 'ATISACHI DE FUERTEVENTURA C.F., C.D. "B"', a: 'CD Herbania' }],
    ['equipo', { s: SEASON, g: 'B2', t: 'Inter/Pilar' }],
    ['ligas', { s: SEASON, c: 'prebenjamin', i: 'lanzarote', f: 'maspalomas', to: 'jornada' }],
    ['copa', { s: SEASON, g: 'MCPK1' }],
    ['goleadores', { s: SEASON, c: 'benjamin', g: 'A2', t: 'Corazón Mª', q: '50% + 1 #9 ¿?=&' }],
    ['temporadas', {}],
    ['records', { s: '2023-2024', c: 'benjamin' }],
    ['fuentes', {}],
    ['ajustes', {}],
    ['equipo', { s: SEASON, g: 'FV11', t: 'VET“C” SA-COR' }],
    ['equipo', { s: SEASON, g: 'FF13', t: 'L.Mesas Hu. B' }],
    ['equipo', { s: SEASON, g: 'B2', t: 'MESAS, U.D. LAS "B"' }],
    ['equipo', { s: SEASON, g: 'LZ1', t: 'Pto.del Carmen' }],
    ['jornada', { s: SEASON, g: 'BCA1', r: '06-06-2026 ( Final )' }],
  ];
  assert.deepEqual([...new Set(routes.map(([screen]) => screen))].sort(), [...SCREENS].sort());
  for (const [screen, params] of routes) {
    const href = routeHref(screen, params);
    assert.match(href, /^#\/[a-z]*(\?[^#\s]*)?$/, href);
    assert.deepEqual(parseRoute(href), { screen, params }, href);
  }
});

test('enlaces antiguos: cada fila de la tabla de §4.1 (hashes reales de routeUrl)', () => {
  const cases = [
    ['#section=miequipo&cat=prebenjamin&season=2025-2026', '#/'],
    ['#section=miequipo&cat=prebenjamin&season=2025-2026&group=PG2&team=Las+Mesas+Hu.', '#/equipo?s=2025-2026&g=PG2&t=Las%20Mesas%20Hu.'],
    ['#section=clasif&cat=prebenjamin&season=2025-2026&group=PG2', '#/tabla?s=2025-2026&g=PG2'],
    ['#section=jornadas&cat=prebenjamin&season=2025-2026&group=PG2&round=Jornada+30', '#/jornada?s=2025-2026&g=PG2&r=Jornada%2030'],
    ['#section=jornadas&cat=prebenjamin&season=2025-2026&group=PG2&round=Jornada+30&match=%5B%22Las+Mesas+Hu.%22%2C%22AD+Hurac%C3%A1n%22%2C%22Jornada+30%22%5D',
      '#/partido?s=2025-2026&g=PG2&r=Jornada%2030&h=Las%20Mesas%20Hu.&a=AD%20Hurac%C3%A1n'],
    ['#section=clasif&cat=prebenjamin&season=2025-2026&group=PG2&team=AD+Hurac%C3%A1n', '#/equipo?s=2025-2026&g=PG2&t=AD%20Hurac%C3%A1n'],
    ['#section=clasif&cat=prebenjamin&season=2025-2026&team=AD+Hurac%C3%A1n', '#/explorar?s=2025-2026&q=AD%20Hurac%C3%A1n'],
    ['#section=goleadores&cat=benjamin&season=2025-2026&group=A2', '#/goleadores?s=2025-2026&g=A2'],
    ['#section=isla&cat=benjamin&season=2025-2026&island=lanzarote', '#/ligas?s=2025-2026&c=benjamin&i=lanzarote'],
    ['#section=stats&cat=benjamin&season=2025-2026', '#/records?s=2025-2026&c=benjamin'],
  ];
  // La temporada del enlace se conserva siempre (M3 de la revisión de B2): tras activar 2026/27, un
  // enlace de 2025/26 sigue en 2025/26.
  for (const [legacy, expected] of cases) assert.equal(translateLegacy(legacy), expected, legacy);
});

test('enlaces antiguos: temporada, parámetros sobrantes y casos límite', () => {
  const t = hash => translateLegacy(hash);
  assert.equal(t('#section=clasif&cat=prebenjamin&season=2024-2025&group=PGC2'), '#/tabla?s=2024-2025&g=PGC2');
  assert.equal(t('#section=clasif&group=PG2'), '#/tabla?g=PG2');
  assert.equal(t('#section=jornadas&cat=benjamin&season=2025-2026&group=B2&round=Jornada+12&q=mesas&island=grancanaria&phase=Segunda+Fase+B'), '#/jornada?s=2025-2026&g=B2&r=Jornada%2012');
  assert.equal(t('#section=goleadores&cat=benjamin&season=2025-2026'), '#/goleadores?s=2025-2026&c=benjamin');
  assert.equal(t('#section=jornadas&group=PG2&round=Jornada+3&match=%5Bmal'), '#/jornada?g=PG2&r=Jornada%203');
  assert.equal(t('#section=jornadas&round=Jornada+3&match=%5B%22A%22%2C%22B%22%2C%22Jornada+3%22%5D'), '#/jornada?r=Jornada%203');
  assert.equal(t('#section=miequipo&cat=prebenjamin&season=2025-2026&team=Las+Mesas+Hu.'), '#/explorar?s=2025-2026&q=Las%20Mesas%20Hu.');
  // La URL que escribía la app anterior en cada carga, con mi equipo: Mi equipo (M3).
  const mine = (team, group) => team === 'Las Mesas Hu.' && group === 'PG2';
  assert.equal(translateLegacy('#section=miequipo&cat=prebenjamin&season=2025-2026&group=PG2&team=Las+Mesas+Hu.', { isMine: mine }), '#/');
  assert.equal(translateLegacy('#section=miequipo&cat=prebenjamin&season=2025-2026&group=PG2&team=Telde', { isMine: mine }), '#/equipo?s=2025-2026&g=PG2&t=Telde');
  assert.equal(translateLegacy('#section=clasif&cat=prebenjamin&season=2025-2026&group=PG2&team=Las+Mesas+Hu.', { isMine: mine }),
    '#/equipo?s=2025-2026&g=PG2&t=Las%20Mesas%20Hu.', 'solo «miequipo» abre Mi equipo');
  assert.equal(t('#section=otra&group=PG2'), '#/');
  assert.equal(t('#section=clasif&season=..%2F..%2Fmal&group=PG2'), '#/tabla?g=PG2');
  for (const hash of ['#/tabla?g=PG2', '#/', '', '#', undefined, '#calendario', '#group=PG2']) assert.equal(t(hash), null, String(hash));
});

test('cada enlace antiguo traducido es una ruta nueva válida', () => {
  const legacy = ['#section=stats', '#section=isla&island=fuerteventura', '#section=goleadores&group=PG3',
    '#section=jornadas&group=PG2&match=%5B%22Las+Mesas+Hu.%22%2C%22AD+Hurac%C3%A1n%22%2C%22Jornada+30%22%5D'];
  assert.deepEqual(legacy.map(hash => parseRoute(translateLegacy(hash)).screen), ['records', 'ligas', 'goleadores', 'partido']);
});

test('countdownLabel: hoy, mañana, faltan N días; nada si ya pasó o la fecha no es válida', () => {
  assert.equal(countdownLabel('2026-09-23', '2026-09-23'), 'hoy');
  assert.equal(countdownLabel('2026-09-24', '2026-09-23'), 'mañana');
  assert.equal(countdownLabel('2026-09-26', '2026-09-23'), 'faltan 3 días');
  assert.equal(countdownLabel('2027-01-02', '2026-12-31'), 'faltan 2 días');
  assert.equal(countdownLabel('2026-10-26', '2026-10-24'), 'faltan 2 días');
  for (const [date, today] of [['2026-09-22', '2026-09-23'], [null, '2026-09-23'], ['por confirmar', '2026-09-23'],
    ['2026-02-31', '2026-02-01'], ['2026-13-01', '2026-09-23'], ['24/09', '2026-09-23'], ['2026-09-24', '']]) {
    assert.equal(countdownLabel(date, today), null, `${date} / ${today}`);
  }
});

// ── Revisión final de B2: ayudantes únicos (I2) y el nombre de los .ics (M3) ──

test('matchHref y teamHref: los enlaces a las fichas, siempre con su temporada', () => {
  const m = { season: '2025-2026', groupId: 'PG2', roundKey: 'Jornada 30', home: 'Las Mesas Hu.', away: 'AD Huracán' };
  assert.equal(matchHref(m), '#/partido?s=2025-2026&g=PG2&r=Jornada%2030&h=Las%20Mesas%20Hu.&a=AD%20Hurac%C3%A1n');
  assert.equal(matchHref({ ...m, season: '2024-2025', groupId: 'MCPK1', roundKey: '27-06-2026 ( Cuartos )' }),
    '#/partido?s=2024-2025&g=MCPK1&r=27-06-2026%20(%20Cuartos%20)&h=Las%20Mesas%20Hu.&a=AD%20Hurac%C3%A1n');
  assert.equal(teamHref('2025-2026', 'PG2', 'MESAS, U.D. LAS "B"'), '#/equipo?s=2025-2026&g=PG2&t=MESAS%2C%20U.D.%20LAS%20%22B%22');
  assert.deepEqual(parseRoute(teamHref('2025-2026', 'B2', 'Inter/Pilar')), { screen: 'equipo', params: { s: '2025-2026', g: 'B2', t: 'Inter/Pilar' } });
});

test('canaryDateTime, checkedPhrase y checkedCell: fecha y hora de Canarias de un instante, «hoy» si es hoy', () => {
  // Verano (UTC+1) y el paso de medianoche: 23:30 UTC del 02/06 son las 0:30 del 03/06 en Canarias.
  assert.deepEqual(canaryDateTime('2026-09-23T21:11:00+00:00'), { day: '2026-09-23', time: '22:11' });
  assert.deepEqual(canaryDateTime('2026-06-02T23:30:00+00:00'), { day: '2026-06-03', time: '0:30' });
  // Invierno (UTC+0).
  assert.deepEqual(canaryDateTime('2026-01-10T09:05:00Z'), { day: '2026-01-10', time: '9:05' });
  for (const bad of [null, undefined, '', 'mañana']) assert.equal(canaryDateTime(bad), null, String(bad));
  assert.equal(checkedPhrase('2026-09-23T21:11:00+00:00', '2026-09-23'), 'hoy a las 22:11');
  assert.equal(checkedPhrase('2026-09-23T21:11:00+00:00', '2026-09-24'), 'el 23 de septiembre a las 22:11');
  assert.equal(checkedCell('2026-09-23T21:11:00+00:00', '2026-09-23'), 'hoy, 22:11');
  assert.equal(checkedCell('2026-09-23T21:11:00+00:00', '2026-09-24'), '23 sept, 22:11');
  assert.equal(checkedPhrase(null, '2026-09-23'), null);
  assert.equal(checkedCell('', '2026-09-23'), null);
});

test('M3: el nombre del .ics va sin tildes (NFD) y sin guiones en los extremos', () => {
  assert.equal(calendarFileName('Prebenjamín, Grupo 2 de Gran Canaria'), 'calendario-prebenjamin-grupo-2-de-gran-canaria.ics');
  assert.equal(calendarFileName('Las Mesas Hu. – AD Huracán'), 'calendario-las-mesas-hu-ad-huracan.ics');
  assert.equal(calendarFileName('Veteranos – Las Mesas Hu.'), 'calendario-veteranos-las-mesas-hu.ics');
  assert.equal(calendarFileName('«Unión» Viera B'), 'calendario-union-viera-b.ics');
  assert.equal(calendarFileName('–'), 'calendario.ics');
});

test('M3: downloadCalendar descarga el .ics con ese nombre', () => {
  const saved = { document: globalThis.document, setTimeout: globalThis.setTimeout };
  const anchor = { clicks: 0, click() { this.clicks += 1; } };
  globalThis.document = { createElement: (tag) => (tag === 'a' ? anchor : null) };
  // La URL del Blob se revoca al segundo: aquí, en el acto, para no dejar la prueba esperando.
  globalThis.setTimeout = (fn) => { fn(); return 0; };
  try {
    downloadCalendar([{ date: '2026-06-02', time: '17:30', home: 'Las Mesas Hu.', away: 'AD Huracán', jornada: 'Jornada 30' }],
      { season: '2025-2026', group: 'PG2', name: 'Prebenjamín, Grupo 2 de Gran Canaria', url: '' });
  } finally {
    globalThis.document = saved.document;
    globalThis.setTimeout = saved.setTimeout;
  }
  assert.equal(anchor.download, 'calendario-prebenjamin-grupo-2-de-gran-canaria.ics');
  assert.equal(anchor.clicks, 1);
});

// I2: la respuesta de Partido para todas las pantallas que comparten.
test('shareAndAnnounce: «Enlace copiado.» o, si no se pudo copiar, el enlace en la región de estado; nada si se compartió', async () => {
  const saved = Object.getOwnPropertyDescriptor(globalThis, 'navigator');
  const withNavigator = (value) => Object.defineProperty(globalThis, 'navigator', { value, configurable: true, writable: true });
  const data = { title: 'Jornada 30 · Prebenjamín, Grupo 2 de Gran Canaria', url: 'https://x.test/futbol-base/#/jornada?s=2025-2026&g=PG2&r=Jornada%2030' };
  const copied = [];
  const clipboard = { writeText: async (text) => { copied.push(text); } };
  try {
    let status = { textContent: '' };
    withNavigator({ clipboard });
    assert.equal(await shareAndAnnounce(data, status), 'copiado');
    assert.equal(status.textContent, 'Enlace copiado.');
    assert.deepEqual(copied, [data.url]);
    // Sin share ni portapapeles (y sin documento, en Node): el enlace, para copiarlo a mano.
    status = { textContent: '' };
    withNavigator({ clipboard: { writeText: async () => { throw new Error('denegado'); } } });
    assert.equal(await shareAndAnnounce(data, status), 'no copiado');
    assert.equal(status.textContent, `No se pudo copiar el enlace: ${data.url}`);
    // Compartido o cancelado: no dice nada.
    status = { textContent: '' };
    withNavigator({ share: async () => {}, clipboard });
    assert.equal(await shareAndAnnounce(data, status), 'compartido');
    withNavigator({ share: async () => { throw new DOMException('cancelado', 'AbortError'); }, clipboard });
    assert.equal(await shareAndAnnounce(data, status), 'cancelado');
    assert.equal(status.textContent, '');
    // Sin región de estado, no lanza.
    assert.equal(await shareAndAnnounce(data, null), 'cancelado');
  } finally {
    if (saved) Object.defineProperty(globalThis, 'navigator', saved);
    else delete globalThis.navigator;
  }
});
