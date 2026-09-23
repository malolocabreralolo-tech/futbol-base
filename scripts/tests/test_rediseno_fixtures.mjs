// Fixtures congeladas del rediseño «Acta» (Plan B1, Tarea 1): forma y hechos
// reales comprobados el 23/09/2026 sobre los datos de 2025-26.
// Solo lee scripts/tests/fixtures/rediseno/*.json (load.mjs): nunca los
// data-*.js ni src/config.js vivos, que cambian al activar 2026/27.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fixture, FIXTURE_NAMES } from './fixtures/rediseno/load.mjs';

const ids = groups => groups.map(g => g.id);
const rowsOf = rounds => Object.values(rounds).flat();
const teamsIn = rows => new Set(rows.flatMap(r => [r[1], r[2]]));
const plays = name => r => r[1] === name || r[2] === name;
const currentGroup = (cur, id) => [...cur.benjamin, ...cur.prebenjamin].find(g => g.id === id);

test('fixtures: existen todas, se parsean y cada llamada devuelve una copia nueva', () => {
  assert.deepEqual(FIXTURE_NAMES, [
    'current-2025-2026', 'historical-2024-2025', 'cups-2025-2026', 'matchdetail',
    'lineups-2025-2026', 'shields', 'health', 'phases', 'favorites-v1',
  ]);
  for (const name of FIXTURE_NAMES) assert.ok(fixture(name), name);
  const copia = fixture('favorites-v1');
  copia.teams.length = 0;
  assert.equal(fixture('favorites-v1').teams.length, 2);
  assert.throws(() => fixture('data-benjamin'), /fixture desconocida: data-benjamin/);
});

test('current-2025-2026: grupos pedidos, forma de data-benjamin.js y filas de HISTORY de 8 columnas', () => {
  const cur = fixture('current-2025-2026');
  assert.equal(cur.season, '2025-2026');
  assert.deepEqual(ids(cur.benjamin), ['A1', 'A2', 'B1', 'B2', 'FF5', 'FF9', 'FF13', 'FF15']);
  assert.deepEqual(ids(cur.prebenjamin), ['PG2', 'PG3', 'PFV2']);
  assert.deepEqual(Object.keys(cur.history).sort(),
    ['A1', 'A2', 'B1', 'B2', 'FF13', 'FF15', 'FF5', 'FF9', 'PFV2', 'PG2', 'PG3']);
  for (const g of [...cur.benjamin, ...cur.prebenjamin]) {
    assert.deepEqual(Object.keys(g).sort(), ['fullName', 'id', 'island', 'jornada', 'matches',
      'name', 'phase', 'standings', 'standingsKind', 'url'], g.id);
    for (const row of g.standings) assert.equal(row.length, 10, `${g.id} ${JSON.stringify(row)}`);
    for (const row of g.matches) assert.equal(row.length, 7, `${g.id} ${JSON.stringify(row)}`);
    for (const row of rowsOf(cur.history[g.id])) assert.equal(row.length, 8, `${g.id} ${JSON.stringify(row)}`);
  }
});

test('PG2: 15 filas, CD Batán 0-0-28 sin partidos en el calendario, 30 jornadas y 182 partidos', () => {
  const cur = fixture('current-2025-2026');
  const pg2 = currentGroup(cur, 'PG2');
  const hist = cur.history.PG2;
  assert.equal(pg2.standings.length, 15);
  assert.deepEqual(pg2.standings.find(r => r[1] === 'CD Batán'), [15, 'CD Batán', 0, 28, 0, 0, 28, 0, 84, -84]);
  assert.equal(Object.keys(hist).length, 30);
  assert.equal(rowsOf(hist).length, 182);
  assert.ok(!teamsIn(rowsOf(hist)).has('CD Batán'));
  // Jornada 30: 6 partidos; RC Victoria y Arucas B no juegan (descansa o le tocaba contra CD Batán).
  assert.equal(hist['Jornada 30'].length, 6);
  for (const t of ['RC Victoria', 'Arucas B', 'CD Batán']) assert.ok(!teamsIn(hist['Jornada 30']).has(t), t);
  assert.deepEqual(hist['Jornada 30'][0], ['2026-06-02', 'Las Mesas Hu.', 'AD Huracán', 2, 7, null, '17:30', null]);
  // Las Mesas: 28 PJ en la tabla y 26 partidos en el calendario, todos con resultado.
  assert.equal(pg2.standings.find(r => r[1] === 'Las Mesas Hu.')[3], 28);
  const mesas = rowsOf(hist).filter(plays('Las Mesas Hu.'));
  assert.equal(mesas.length, 26);
  assert.ok(mesas.every(r => r[3] !== null && r[4] !== null));
});

test('PG3: 14 equipos y jornadas de 6 partidos salvo 2 de 7 (la moda es 6)', () => {
  const cur = fixture('current-2025-2026');
  assert.equal(currentGroup(cur, 'PG3').standings.length, 14);
  const porJornada = Object.values(cur.history.PG3).map(rows => rows.length);
  assert.equal(porJornada.length, 30);
  assert.equal(porJornada.filter(n => n === 6).length, 28);
  assert.equal(porJornada.filter(n => n === 7).length, 2);
});

test('PFV2: CD Teguinte solo está en el calendario, con 14 partidos sin fecha ni resultado', () => {
  const cur = fixture('current-2025-2026');
  const pfv2 = currentGroup(cur, 'PFV2');
  assert.equal(pfv2.standings.length, 7);
  assert.ok(!pfv2.standings.some(r => r[1] === 'CD Teguinte'));
  assert.deepEqual(Object.keys(cur.history.PFV2).slice(0, 3), ['1', '2', '3']);
  const teguinte = rowsOf(cur.history.PFV2).filter(plays('CD Teguinte'));
  assert.equal(teguinte.length, 14);
  for (const r of teguinte) assert.deepEqual([r[0], r[3], r[4]], ['', null, null]);
  // Las demás fechas de PFV2 van en DD-MM-YYYY.
  assert.ok(rowsOf(cur.history.PFV2).filter(r => r[0]).every(r => /^\d{2}-\d{2}-\d{4}$/.test(r[0])));
});

test('Las Mesas: «Las Mesas Hu.» en PG2, A2 y FF5; «Las Mesas Hu. B» en FF13; «Las Mesas B» en B2', () => {
  const cur = fixture('current-2025-2026');
  const has = (id, name) => currentGroup(cur, id).standings.some(r => r[1] === name);
  for (const id of ['PG2', 'A2', 'FF5']) assert.ok(has(id, 'Las Mesas Hu.'), id);
  assert.ok(has('FF13', 'Las Mesas Hu. B'));
  assert.ok(has('B2', 'Las Mesas B'));
  assert.ok(!has('B2', 'Las Mesas Hu. B'));
  assert.equal(currentGroup(cur, 'FF13').phase, 'Primera Fase GC');
  assert.equal(currentGroup(cur, 'B2').phase, 'Segunda Fase B');
});

test('Santa Brígida: en FF9 y, en la Segunda Fase B, con el mismo nombre en B1 y en B2', () => {
  const cur = fixture('current-2025-2026');
  const groupsWith = name => [...cur.benjamin, ...cur.prebenjamin].filter(g => g.standings.some(r => r[1] === name)).map(g => g.id);
  assert.deepEqual(groupsWith('Santa Brígida'), ['B1', 'B2', 'FF9', 'PG2']);
  assert.deepEqual([currentGroup(cur, 'B1').phase, currentGroup(cur, 'B2').phase], ['Segunda Fase B', 'Segunda Fase B']);
  assert.equal(currentGroup(cur, 'FF9').phase, 'Primera Fase GC');
  // FF9 acaba el 08/11/2025; B1 empieza el 28/11/2025.
  assert.equal(rowsOf(cur.history.FF9).map(r => r[0]).sort().at(-1), '2025-11-08');
  assert.equal(rowsOf(cur.history.B1).map(r => r[0]).sort()[0], '2025-11-28');
});

test('historical-2024-2025: P1 y PGC2 con la forma de SEASON_2024_2025 y filas de 8 columnas', () => {
  const h = fixture('historical-2024-2025');
  assert.equal(h.season, '2024-2025');
  assert.deepEqual(ids(h.benjamin), ['P1']);
  assert.deepEqual(ids(h.prebenjamin), ['PGC2']);
  for (const g of [...h.benjamin, ...h.prebenjamin]) {
    assert.deepEqual(Object.keys(g).sort(), ['current_jornada', 'fullName', 'id', 'island',
      'jornadas', 'name', 'phase', 'standings'], g.id);
    for (const row of rowsOf(g.jornadas)) assert.equal(row.length, 8, `${g.id} ${JSON.stringify(row)}`);
  }
  const [p1] = h.benjamin;
  const [pgc2] = h.prebenjamin;
  assert.deepEqual([p1.phase, p1.standings.length, Object.keys(p1.jornadas).length, rowsOf(p1.jornadas).length],
    ['Primera Fase GC', 10, 9, 45]);
  assert.deepEqual([pgc2.phase, pgc2.standings.length, Object.keys(pgc2.jornadas).length, rowsOf(pgc2.jornadas).length],
    ['Gran Canaria', 11, 22, 132]);
  assert.ok(pgc2.standings.some(r => r[1] === 'Las Mesas Hu.'));
});

test('cups-2025-2026: MCB16 y MCP3 en línea de 7 columnas; MCBK2 y MCPK1, cuadros de 9', () => {
  const c = fixture('cups-2025-2026');
  assert.deepEqual(Object.keys(c).sort(), ['benjamin', 'prebenjamin']);
  assert.deepEqual(ids(c.benjamin), ['MCB16', 'MCBK2']);
  assert.deepEqual(ids(c.prebenjamin), ['MCP3', 'MCPK1']);
  for (const g of [...c.benjamin, ...c.prebenjamin]) {
    assert.equal(g.phase, 'Maspalomas Cup');
    for (const row of g.matches) assert.equal(row.length, 7, `${g.id} ${JSON.stringify(row)}`);
  }
  for (const g of [c.benjamin[0], c.prebenjamin[0]]) {
    assert.ok(!('jornadas' in g), g.id);
    assert.equal(g.standings.length, 4, g.id);
  }
  for (const g of [c.benjamin[1], c.prebenjamin[1]]) {
    assert.deepEqual(g.standings, [], g.id);
    for (const row of rowsOf(g.jornadas)) assert.equal(row.length, 9, `${g.id} ${JSON.stringify(row)}`);
  }
});

test('MCP3 y MCPK1: UD Las Mesas Huracán, 3.º del Grupo C, y su Copa Plata', () => {
  const c = fixture('cups-2025-2026');
  const [mcp3, mcpk1] = c.prebenjamin;
  assert.equal(mcp3.name, 'Grupo C');
  assert.deepEqual(mcp3.standings.find(r => r[1] === 'UD Las Mesas Huracán').slice(0, 3), [3, 'UD Las Mesas Huracán', 3]);
  assert.equal(mcpk1.name, 'Copa Plata');
  const mine = Object.entries(mcpk1.jornadas).flatMap(([round, rows]) =>
    rows.filter(plays('UD Las Mesas Huracán')).map(r => [round, ...r]));
  assert.deepEqual(mine, [
    ['26-06-2026 ( Previa )', '26/06', 'CD Tablero', 'UD Las Mesas Huracán', 1, 4, null, '16:00', 'CD 3.1', null],
    ['27-06-2026 ( Cuartos )', '27/06', 'UD Las Mesas Huracán', 'CF Unión Carrizal', 1, 1, 'home', '10:00', 'CD 4', '3-2'],
    ['27-06-2026 ( Semifinales )', '27/06', 'UD Las Mesas Huracán', 'CD Maspa Training A', 2, 4, null, '13:00', 'CD 2.1', null],
  ]);
  // En benjamín también juega un «UD Las Mesas Huracán» (MCB16 y MCBK2): el Verano de PG2 no los incluye.
  assert.ok(c.benjamin[0].standings.some(r => r[1] === 'UD Las Mesas Huracán'));
  assert.ok(rowsOf(c.benjamin[1].jornadas).some(plays('UD Las Mesas Huracán')));
});

test('matchdetail: Calero es de FF15 y su clave la comparte un partido de PG2; la 2-9 de Las Mesas es de A2', () => {
  const md = fixture('matchdetail');
  const cur = fixture('current-2025-2026');
  const hist = fixture('historical-2024-2025');
  const is = (h, a, hs, as) => r => r[1] === h && r[2] === a && r[3] === hs && r[4] === as;
  const calero = md['CD Calero|La Garita|1-11'];
  assert.deepEqual([calero.s, calero.gr, calero.g.length, calero.g.at(-1)[2]], ['2025-2026', 'FF15', 12, '1-11']);
  assert.equal(rowsOf(cur.history.FF15).filter(is('CD Calero', 'La Garita', 1, 11)).length, 1);
  assert.equal(rowsOf(cur.history.PG2).filter(is('CD Calero', 'La Garita', 1, 11)).length, 1);
  assert.equal(md['Las Mesas Hu.|AD Huracán|2-9'].gr, 'A2');
  assert.equal(md['Las Mesas Hu.|AD Huracán|2-7'], undefined);
  // Otras dos claves compartidas: la entrada es de otro grupo (FF9) o de otra temporada (FF1 de 2025-26).
  assert.deepEqual([md['RC Victoria|AD Huracán|0-6'].s, md['RC Victoria|AD Huracán|0-6'].gr], ['2025-2026', 'FF9']);
  assert.equal(rowsOf(cur.history.A2).filter(is('RC Victoria', 'AD Huracán', 0, 6)).length, 1);
  assert.deepEqual([md['Guayarmina|UD Guía|8-1'].s, md['Guayarmina|UD Guía|8-1'].gr], ['2025-2026', 'FF1']);
  assert.equal(rowsOf(hist.benjamin[0].jornadas).filter(is('Guayarmina', 'UD Guía', 8, 1)).length, 1);
  for (const [key, entry] of Object.entries(md)) {
    for (const e of entry.dup ? entry.list : [entry]) {
      assert.deepEqual(Object.keys(e).sort(), ['g', 'gr', 's'], key);
      assert.ok(Array.isArray(e.g) && e.g.every(goal => goal.length === 5), key);
    }
  }
  // Hoy MATCH_DETAIL no tiene ninguna entrada {dup, list}: las pruebas de dup usan datos sintéticos.
  assert.equal(Object.values(md).filter(e => e.dup).length, 0);
  assert.equal(Object.keys(md).length, 434);
});

test('lineups-2025-2026: las 44 actas de A1', () => {
  const lineups = fixture('lineups-2025-2026');
  const entries = Object.values(lineups);
  assert.equal(entries.length, 44);
  for (const e of entries) {
    assert.deepEqual(Object.keys(e).sort(), ['away', 'coachA', 'coachH', 'cod', 'events', 'gr', 'home', 'ref', 's']);
    assert.deepEqual([e.s, e.gr], ['2025-2026', 'A1']);
  }
});

test('shields: escudos de los nombres de las fixtures y de quienes comparten su fichero', () => {
  const sh = fixture('shields');
  for (const name of ['Las Mesas Hu.', 'Las Mesas B', 'L.Mesas Hu. B', 'MESAS, U.D. LAS "B"']) {
    assert.equal(sh[name], 'lasMesasEscudo.png', name);
  }
  assert.equal(sh['AD Huracán'], 'huracan.png');
  assert.equal(sh['RC Victoria'], 'victoria.png');
  assert.equal(sh['RC Victoria B'], 'victoria2019.png');
  assert.equal(sh['CD Batán'], 'batanEscudo.png');
  assert.equal(sh['CD Teguinte'], 'teguinte.png');
  assert.equal(sh['CD Calero'], 'calero2018.png');
  // Sin escudo propio, ni exacto ni normalizado (solo el viejo teamBadge les daba uno por inclusión).
  assert.equal(sh['Las Mesas Hu. B'], undefined);
  assert.equal(sh['UD Las Mesas Huracán'], undefined);
  assert.equal(Object.keys(sh).length, 174);
});

test('health: data-health.json real, con 2026/27 pendiente', () => {
  const h = fixture('health');
  assert.equal(h.season, '2025-2026');
  assert.deepEqual(h.nextSeason, { name: '2026-2027', status: 'pending' });
  assert.match(h.checkedAt, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
  assert.match(h.lastDataChange, /^\d{4}-\d{2}-\d{2}$/);
  assert.equal(typeof h.groups.PG2.status, 'string');
});

test('phases: un registro por grupo de la base, en las 5 temporadas, coherente con las fixtures', () => {
  const ph = fixture('phases');
  assert.equal(ph.length, 191);
  for (const p of ph) assert.deepEqual(Object.keys(p).sort(), ['cat', 'code', 'island', 'name', 'phase', 'season']);
  assert.deepEqual([...new Set(ph.map(p => p.season))].sort(),
    ['2021-2022', '2022-2023', '2023-2024', '2024-2025', '2025-2026']);
  assert.deepEqual([...new Set(ph.map(p => p.cat))].sort(), ['benjamin', 'prebenjamin']);
  assert.equal(new Set(ph.map(p => `${p.season}|${p.cat}|${p.code}`)).size, 191);
  assert.equal(new Set(ph.map(p => `${p.season}|${p.cat}|${p.phase}`)).size, 56);
  assert.ok(ph.every(p => p.phase && p.name && ['grancanaria', 'lanzarote', 'fuerteventura'].includes(p.island)));
  assert.ok(!ph.some(p => p.code.startsWith('MC')), 'la Maspalomas Cup no está en la base');
  const cur = fixture('current-2025-2026');
  const hist = fixture('historical-2024-2025');
  const casos = [
    ...['benjamin', 'prebenjamin'].flatMap(cat => cur[cat].map(g => [cur.season, cat, g])),
    ...['benjamin', 'prebenjamin'].flatMap(cat => hist[cat].map(g => [hist.season, cat, g])),
  ];
  for (const [season, cat, g] of casos) {
    assert.deepEqual(ph.find(p => p.season === season && p.cat === cat && p.code === g.id),
      { season, cat, code: g.id, phase: g.phase, island: g.island, name: g.name }, `${season} ${g.id}`);
  }
});

test('favorites-v1: forma exacta de futbol-base:favorites:v1 (favorites.js)', () => {
  assert.deepEqual(fixture('favorites-v1'), {
    teams: [
      { name: 'Las Mesas Hu.', cat: 'prebenjamin', groupId: 'PG2' },
      { name: 'AD Huracán', cat: 'prebenjamin', groupId: 'PG2' },
    ],
    selected: 'prebenjamin|PG2|las mesas hu',
  });
});
