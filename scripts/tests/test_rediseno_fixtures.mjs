// Fixtures congeladas del rediseño «Acta» (Plan B1, Tarea 1, y Plan B3, Tarea 2):
// forma y hechos reales comprobados el 23/09/2026 sobre los datos de 2025-26 y del
// archivo, y los ayudantes que montan con ellas los datos de las pruebas.
// Solo lee scripts/tests/fixtures/rediseno/*.json (load.mjs): nunca los
// data-*.js ni src/config.js vivos, que cambian al activar 2026/27.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fixture, FIXTURE_NAMES } from './fixtures/rediseno/load.mjs';
import { goleadores, withChampions, cupsRaw, archive, lineupsFor, currentAt } from './fixtures/rediseno/simulate.mjs';
import { datasetsFor, pastSeasonRaw } from './fixtures/rediseno/screens.mjs';

const ids = groups => groups.map(g => g.id);
const rowsOf = rounds => Object.values(rounds).flat();
const teamsIn = rows => new Set(rows.flatMap(r => [r[1], r[2]]));
const plays = name => r => r[1] === name || r[2] === name;
const currentGroup = (cur, id) => [...cur.benjamin, ...cur.prebenjamin].find(g => g.id === id);

test('fixtures: existen todas, se parsean y cada llamada devuelve una copia nueva', () => {
  assert.deepEqual(FIXTURE_NAMES, [
    'current-2025-2026', 'historical-2024-2025', 'cups-2025-2026', 'matchdetail',
    'lineups-2025-2026', 'shields', 'health', 'phases', 'favorites-v1',
    'gol-2025-2026', 'campeones-2025-2026', 'historical-2023-2024', 'historical-2024-2025-b3',
    'lineups-2025-2026-ff1', 'cups-extra-2025-2026',
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

// ─── Fixtures de B3 (build_fixtures_b3.mjs, decisión 30 del plan B3) ─────────────────────────

const SEASON_KEYS = ['benjamin', 'current', 'name', 'prebenjamin'];
const ARCHIVE_GROUP_KEYS = ['current_jornada', 'fullName', 'id', 'island', 'jornadas', 'name', 'phase', 'standings'];
const row = (group, team) => group.standings.find(r => r[1] === team);
// Suma de goleadores por jugador y equipo exactos, como la lista global de una categoría.
function byPlayer(entries) {
  const out = new Map();
  for (const { id, s } of entries) {
    for (const [name, team, goals, games] of s) {
      const key = `${name}|${team}`;
      const acc = out.get(key) || { name, team, goals: 0, games: 0, groups: [] };
      acc.goals += goals;
      acc.games += games;
      acc.groups.push(id);
      out.set(key, acc);
    }
  }
  return [...out.values()].sort((a, b) => b.goals - a.goals || a.games - b.games);
}

test('gol-2025-2026: GOL_BENJ y GOL_PREBENJ de los grupos de las fixtures, en el orden de la fuente', () => {
  const gol = fixture('gol-2025-2026');
  assert.deepEqual(Object.keys(gol), ['season', 'benjamin', 'prebenjamin']);
  assert.equal(gol.season, '2025-2026');
  const count = entries => Object.fromEntries(entries.map(e => [e.id, e.s.length]));
  assert.deepEqual(count(gol.benjamin), { A1: 114, A2: 135, B1: 119, B2: 126, FF13: 39, FF15: 43, FF5: 48, FF9: 37 });
  assert.deepEqual(count(gol.prebenjamin), { PG2: 149, PG3: 150 });
  assert.deepEqual(ids(gol.benjamin), ['A1', 'A2', 'B1', 'B2', 'FF13', 'FF15', 'FF5', 'FF9']);
  const cur = fixture('current-2025-2026');
  for (const cat of ['benjamin', 'prebenjamin']) {
    for (const entry of gol[cat]) {
      assert.deepEqual(Object.keys(entry), ['id', 'g', 's'], entry.id);
      const teams = new Set(currentGroup(cur, entry.id).standings.map(r => r[1]));
      for (const r of entry.s) {
        assert.ok(r.length === 4 && typeof r[0] === 'string' && Number.isInteger(r[2]) && Number.isInteger(r[3]), `${entry.id} ${JSON.stringify(r)}`);
        assert.ok(teams.has(r[1]), `${entry.id}: ${r[1]} no está en la clasificación`);
      }
      // La fuente ya va de más a menos goles y, a igualdad, de menos a más partidos.
      assert.ok(entry.s.every((r, i) => i === 0 || entry.s[i - 1][2] > r[2] || (entry.s[i - 1][2] === r[2] && entry.s[i - 1][3] <= r[3])), entry.id);
    }
  }
  // PFV2 no publica goleadores (la Tabla dice «La fuente de este grupo no publica goleadores.»).
  assert.ok(!gol.prebenjamin.some(e => e.id === 'PFV2'));
});

test('gol-2025-2026: las copias literales de B2 salen de aquí, y la lista global suma las fases', () => {
  const gol = fixture('gol-2025-2026');
  const pg2 = gol.prebenjamin.find(e => e.id === 'PG2');
  // Los 12 primeros de PG2 (test_rediseno_tabla.mjs) y las 11 filas de Las Mesas (fixture-site.mjs).
  assert.deepEqual(pg2.s[0], ['León Rodríguez, Lucas', 'AD Huracán', 50, 20]);
  assert.deepEqual(pg2.s[11], ['Rodriguez Suarez, Airam', 'Veteranos', 20, 20]);
  const mesas = pg2.s.filter(r => r[1] === 'Las Mesas Hu.');
  assert.equal(mesas.length, 11);
  assert.deepEqual([mesas[0], mesas[10]], [['De La Rosa Perello, Theo', 'Las Mesas Hu.', 12, 17], ['Rodriguez Del Rosario, Yadiel', 'Las Mesas Hu.', 1, 21]]);
  assert.deepEqual(gol.benjamin.find(e => e.id === 'A2').s.filter(r => r[1] === 'Las Mesas Hu.')[0], ['Espiau Chicoy, Alvaro', 'Las Mesas Hu.', 23, 19]);
  // Benjamín: 661 filas y 586 jugadores; 75 salen en dos grupos (Primera y Segunda Fase). El máximo
  // goleador sumado no es el de la fila más alta (Moreno Rodriguez, 54 en B1).
  const benj = byPlayer(gol.benjamin);
  assert.equal(benj.length, 586);
  assert.equal(benj.filter(p => p.groups.length > 1).length, 75);
  assert.deepEqual(benj[0], { name: 'Del Rosario Jimenez, Mario', team: 'Arucas', goals: 56, games: 22, groups: ['A1', 'FF5'] });
  assert.deepEqual(benj[1], { name: 'Moreno Rodriguez, Diego', team: 'Roque Amagro', goals: 54, games: 18, groups: ['B1'] });
  // Un homónimo de otro equipo va aparte: «Del Rosario Jimenez, Mario» de Arucas B, en B1.
  assert.deepEqual(benj.find(p => p.name === 'Del Rosario Jimenez, Mario' && p.team === 'Arucas B'),
    { name: 'Del Rosario Jimenez, Mario', team: 'Arucas B', goals: 18, games: 11, groups: ['B1'] });
  // Prebenjamín: 299 filas y 299 jugadores, sin fases que sumar.
  const pre = byPlayer(gol.prebenjamin);
  assert.equal(pre.length, 299);
  assert.deepEqual(pre[0], { name: 'Raffay Buehre, Lucas', team: 'CD Cerruda', goals: 66, games: 20, groups: ['PG3'] });
});

test('campeones-2025-2026: BCA1, BCB1, BCC1 y PCC1 con la forma de data-benjamin.js y sus rondas de HISTORY', () => {
  const c = fixture('campeones-2025-2026');
  assert.deepEqual(Object.keys(c), ['season', 'benjamin', 'prebenjamin', 'history']);
  assert.equal(c.season, '2025-2026');
  assert.deepEqual(ids(c.benjamin), ['BCA1', 'BCB1', 'BCC1']);
  assert.deepEqual(ids(c.prebenjamin), ['PCC1']);
  assert.deepEqual(Object.keys(c.history), ['BCA1', 'BCB1', 'BCC1', 'PCC1']);
  for (const g of [...c.benjamin, ...c.prebenjamin]) {
    assert.deepEqual(Object.keys(g).sort(), ['fullName', 'id', 'island', 'jornada', 'matches',
      'name', 'phase', 'standings', 'standingsKind', 'url'], g.id);
    assert.deepEqual([g.phase, g.island, g.url, g.standingsKind], ['Copa de Campeones', 'grancanaria', '', 'source'], g.id);
    const rounds = Object.keys(c.history[g.id]);
    assert.deepEqual(rounds.map(k => k.replace(/^\d{2}-\d{2}-\d{4} /, '')), ['( Cuartos )', '( Semifinales )', '( Final )'], g.id);
    assert.equal(g.jornada, rounds[2], g.id);
    for (const r of rowsOf(c.history[g.id])) {
      assert.equal(r.length, 8, `${g.id} ${JSON.stringify(r)}`);
      assert.equal(r[0], '', `${g.id}: la fecha va en la clave de la ronda`);
    }
  }
  assert.deepEqual(c.benjamin.map(g => g.name), ['Fase A', 'Fase B', 'Fase C']);
  assert.equal(c.prebenjamin[0].name, 'Eliminatorias');
  assert.deepEqual([...c.benjamin, ...c.prebenjamin].map(g => g.standings.length), [8, 8, 8, 6]);
  assert.deepEqual(Object.values(c.history).map(rounds => Object.values(rounds).map(rows => rows.length)),
    [[4, 2, 1], [4, 2, 1], [4, 2, 1], [2, 2, 1]]);
  assert.equal(Object.values(c.history).reduce((n, rounds) => n + rowsOf(rounds).length, 0), 26);
});

test('campeones-2025-2026: los cuatro campeones ganan su final, y dos empates sin tanda se deciden en la ronda siguiente', () => {
  const c = fixture('campeones-2025-2026');
  const final = id => Object.values(c.history[id]).at(-1);
  const winner = r => (r[3] > r[4] ? r[1] : r[2]);
  const champions = {};
  for (const g of [...c.benjamin, ...c.prebenjamin]) {
    const [match] = final(g.id);
    assert.equal(final(g.id).length, 1, g.id);
    champions[g.id] = winner(match);
    assert.equal(g.standings[0][1], champions[g.id], `${g.id}: el 1.º de su clasificación es el campeón`);
    assert.deepEqual(g.matches, [['', '', match[1], match[2], match[3], match[4], '']], `${g.id}: en línea, solo la final`);
  }
  assert.deepEqual(champions, { BCA1: 'Las Palmas', BCB1: 'Las Torres', BCC1: 'La Garita B', PCC1: 'LA UNION DE VECINDARIO' });
  assert.deepEqual(final('BCB1')[0].slice(1, 5), ['CLARAVISION-ROQUE AMAGRO, C.D.', 'Las Torres', 0, 4]);
  // Empates sin columna de penaltis: pasa quien juega la ronda siguiente.
  const [cuartosA, semisA] = Object.values(c.history.BCA1);
  assert.deepEqual(cuartosA.find(plays('Tamaraceite')).slice(1, 6), ['Unión Viera', 'Tamaraceite', 5, 5, null]);
  assert.ok(semisA.some(plays('Tamaraceite')) && !semisA.some(plays('Unión Viera')));
  const [cuartosP, semisP, finalP] = Object.values(c.history.PCC1);
  assert.deepEqual(semisP.find(plays('Unión Viera')).slice(1, 6), ['Unión Viera', 'Acodetti', 2, 2, null]);
  assert.ok(finalP.some(plays('Acodetti')));
  // PCC1: dos cuartos; LA UNION DE VECINDARIO y Unión Viera entran en semifinales.
  assert.ok(!cuartosP.some(plays('LA UNION DE VECINDARIO')) && !cuartosP.some(plays('Unión Viera')));
});

test('historical-2023-2024: forma de SEASON_2023_2024; Las Mesas en SF1, GC3, SF8 y GC8; BC1 y CFV1', () => {
  const h = fixture('historical-2023-2024');
  assert.deepEqual(Object.keys(h).sort(), SEASON_KEYS);
  assert.deepEqual([h.name, h.current], ['2023-2024', false]);
  assert.deepEqual(ids(h.benjamin), ['BC1', 'CFV1', 'GC3', 'GC8', 'SF1', 'SF8']);
  assert.deepEqual(h.prebenjamin, []);
  for (const g of h.benjamin) {
    assert.deepEqual(Object.keys(g).sort(), ARCHIVE_GROUP_KEYS, g.id);
    for (const r of rowsOf(g.jornadas)) assert.equal(r.length, 8, `${g.id} ${JSON.stringify(r)}`);
  }
  const g = id => h.benjamin.find(x => x.id === id);
  assert.deepEqual(row(g('SF1'), 'Las Mesas Hu.'), [3, 'Las Mesas Hu.', 39, 18, 12, 3, 3, 79, 37, 42]);
  assert.deepEqual(row(g('GC3'), 'Las Mesas Hu.'), [3, 'Las Mesas Hu.', 25, 10, 8, 1, 1, 64, 18, 46]);
  assert.deepEqual(row(g('SF8'), 'Las Mesas B'), [10, 'Las Mesas B', 6, 18, 1, 3, 14, 51, 95, -44]);
  assert.deepEqual(row(g('GC8'), 'Las Mesas B'), [8, 'Las Mesas B', 7, 9, 2, 1, 6, 11, 28, -17]);
  assert.deepEqual(['SF1', 'SF8', 'GC3', 'GC8'].map(id => [g(id).phase, g(id).standings.length, rowsOf(g(id).jornadas).length]),
    [['Segunda Fase GC', 10, 90], ['Segunda Fase GC', 10, 90], ['Primera Fase GC', 10, 50], ['Primera Fase GC', 10, 45]]);
  // BC1: la Copa de Campeones de 2023-24 es una liguilla de una sola ronda de 7 partidos.
  assert.deepEqual([g('BC1').phase, Object.keys(g('BC1').jornadas), rowsOf(g('BC1').jornadas).length, g('BC1').standings.length],
    ['Copa de Campeones', ['14-06-2024 ( Ronda 1 )'], 7, 8]);
  assert.deepEqual(g('BC1').standings[0].slice(0, 3), [1, 'Las Palmas', 9]);
  // CFV1: copa insular de Fuerteventura jugada como liga (9 jornadas de 4 partidos).
  assert.deepEqual([g('CFV1').phase, g('CFV1').island, Object.keys(g('CFV1').jornadas).length, rowsOf(g('CFV1').jornadas).length],
    ['Copa Fuerteventura', 'fuerteventura', 9, 36]);
  assert.deepEqual(g('CFV1').standings[0].slice(0, 3), [1, 'UD Tarajalejo', 24]);
});

test('historical-2024-2025-b3: A1, BCC1, C2, P3 y P9 con la forma de SEASON_2024_2025; los grupos de Las Mesas', () => {
  const h = fixture('historical-2024-2025-b3');
  assert.deepEqual(Object.keys(h).sort(), SEASON_KEYS);
  assert.deepEqual([h.name, h.current], ['2024-2025', false]);
  assert.deepEqual(ids(h.benjamin), ['A1', 'BCC1', 'C2', 'P3', 'P9']);
  assert.deepEqual(h.prebenjamin, []);
  for (const g of h.benjamin) {
    assert.deepEqual(Object.keys(g).sort(), ARCHIVE_GROUP_KEYS, g.id);
    for (const r of rowsOf(g.jornadas)) assert.equal(r.length, 8, `${g.id} ${JSON.stringify(r)}`);
  }
  const g = id => h.benjamin.find(x => x.id === id);
  assert.deepEqual(row(g('A1'), 'Las Mesas Hu.'), [7, 'Las Mesas Hu.', 13, 16, 3, 4, 9, 23, 64, -41]);
  assert.deepEqual(row(g('P3'), 'Las Mesas Hu.'), [2, 'Las Mesas Hu.', 23, 9, 7, 2, 0, 56, 8, 48]);
  assert.deepEqual(row(g('C2'), 'Las Mesas B'), [6, 'Las Mesas B', 20, 16, 5, 5, 6, 44, 48, -4]);
  assert.deepEqual(row(g('P9'), 'L.Mesas Hu. B'), [5, 'L.Mesas Hu. B', 13, 8, 4, 1, 3, 25, 39, -14]);
  assert.deepEqual(['A1', 'C2', 'P3', 'P9'].map(id => [g(id).phase, g(id).standings.length, rowsOf(g(id).jornadas).length]),
    [['Segunda Fase A GC', 9, 72], ['Segunda Fase C GC', 9, 72], ['Primera Fase GC', 10, 45], ['Primera Fase GC', 9, 36]]);
  assert.deepEqual([g('BCC1').phase, g('BCC1').standings.length, Object.values(g('BCC1').jornadas).map(rows => rows.length)],
    ['Copa Campeones Benjamin C', 6, [2, 2, 1]]);
});

test('BCC1 2024-25: el cuadro contradice al marcador en dos partidos', () => {
  const bcc1 = fixture('historical-2024-2025-b3').benjamin.find(g => g.id === 'BCC1');
  assert.deepEqual(Object.keys(bcc1.jornadas), ['07-06-2025 ( Ronda 1 Ida )', '07-06-2025 ( Ronda 2 Ida )', '07-06-2025 ( Ronda 3 Ida )']);
  const [r1, r2, r3] = Object.values(bcc1.jornadas).map(rows => rows.map(r => r.slice(1, 6)));
  const VECINDARIO = 'LA UNION DE VECINDARIO "B"';
  // Ronda 1: Arguineguín gana a Guayarmina, pero es Guayarmina quien juega la ronda 2 y la final.
  assert.deepEqual(r1, [['Arguineguín', 'Guayarmina', 2, 1, null], [VECINDARIO, 'Pedro Hidalgo', 8, 4, null]]);
  // Ronda 2: Santa Brígida gana a Vecindario B, pero es Vecindario B quien juega la final.
  assert.deepEqual(r2, [['ATLETICO G.C., C.F. "C"', 'Guayarmina', 3, 5, null], [VECINDARIO, 'VILLA DE SANTA BRIGIDA, U.D. "A"', 0, 1, null]]);
  assert.deepEqual(r3, [[VECINDARIO, 'Guayarmina', 2, 0, null]]);
  assert.deepEqual(bcc1.standings[0].slice(0, 4), [1, VECINDARIO, 6, 3]);
});

test('phases: los grupos del archivo de B3 casan con phases.json', () => {
  const ph = fixture('phases');
  for (const h of [fixture('historical-2023-2024'), fixture('historical-2024-2025-b3')]) {
    for (const g of h.benjamin) {
      assert.deepEqual(ph.find(p => p.season === h.name && p.cat === 'benjamin' && p.code === g.id),
        { season: h.name, cat: 'benjamin', code: g.id, phase: g.phase, island: g.island, name: g.name }, `${h.name} ${g.id}`);
    }
  }
  // La Copa de Campeones 2025-26 también está en la base.
  const c = fixture('campeones-2025-2026');
  for (const [cat, g] of [...c.benjamin.map(g => ['benjamin', g]), ['prebenjamin', c.prebenjamin[0]]]) {
    assert.deepEqual(ph.find(p => p.season === '2025-2026' && p.cat === cat && p.code === g.id),
      { season: '2025-2026', cat, code: g.id, phase: g.phase, island: g.island, name: g.name }, g.id);
  }
});

test('lineups-2025-2026-ff1: las 7 actas de FF1, con los dos lados; Guayarmina y San Nicolás también tienen actas en A1', () => {
  const ff1 = fixture('lineups-2025-2026-ff1');
  const a1 = fixture('lineups-2025-2026');
  assert.deepEqual(Object.keys(ff1), [
    'Guayarmina|UD Guía|8-1', 'Atalaya B|San Nicolás|5-11', 'UD Barrial|Guayarmina|4-9', 'Atalaya B|UD Guía|1-10',
    'San Nicolás|Guayarmina|4-5', 'San Nicolás|UD Guía|8-1', 'UD Barrial|Atalaya B|5-2',
  ]);
  for (const [key, e] of Object.entries(ff1)) {
    assert.deepEqual(Object.keys(e).sort(), ['away', 'coachA', 'coachH', 'cod', 'events', 'gr', 'home', 'ref', 's'], key);
    assert.deepEqual([e.s, e.gr], ['2025-2026', 'FF1'], key);
    assert.ok(e.home.length && e.away.length, `${key}: los dos lados`);
    assert.ok(!Object.hasOwn(a1, key), `${key} no está en las actas de A1`);
  }
  const teams = obj => new Set(Object.keys(obj).flatMap(k => k.split('|').slice(0, 2)));
  assert.deepEqual([...teams(ff1)].sort(), ['Atalaya B', 'Guayarmina', 'San Nicolás', 'UD Barrial', 'UD Guía']);
  assert.deepEqual([...teams(ff1)].filter(t => teams(a1).has(t)).sort(), ['Guayarmina', 'San Nicolás']);
  // Sin filtrar por (s, gr), una plantilla de A1 mezclaría la Primera Fase: Liam Garcia Larsen, de
  // Guayarmina, marca en las dos.
  const goals = (obj, name) => Object.values(obj).flatMap(e => [...e.home, ...e.away]).filter(p => p.n === name).reduce((n, p) => n + p.g, 0);
  assert.deepEqual([goals(a1, 'GARCIA LARSEN, LIAM'), goals(ff1, 'GARCIA LARSEN, LIAM')], [25, 5]);
});

test('cups-extra-2025-2026: MCBK1 y MCPK2, cuadros como los de B1; Gáldar CF y AD Huracán ganan la final', () => {
  const c = fixture('cups-extra-2025-2026');
  assert.deepEqual(Object.keys(c), ['benjamin', 'prebenjamin']);
  assert.deepEqual(ids(c.benjamin), ['MCBK1']);
  assert.deepEqual(ids(c.prebenjamin), ['MCPK2']);
  const [mcbk1] = c.benjamin;
  const [mcpk2] = c.prebenjamin;
  assert.deepEqual([mcbk1.name, mcpk2.name], ['Copa Plata', 'Copa Oro']);
  for (const g of [mcbk1, mcpk2]) {
    assert.equal(g.phase, 'Maspalomas Cup');
    assert.deepEqual(g.standings, [], g.id);
    for (const r of g.matches) assert.equal(r.length, 7, `${g.id} ${JSON.stringify(r)}`);
    for (const r of rowsOf(g.jornadas)) assert.equal(r.length, 9, `${g.id} ${JSON.stringify(r)}`);
  }
  const rounds = g => Object.keys(g.jornadas).map(k => k.replace(/^\d{2}-\d{2}-\d{4} /, ''));
  assert.deepEqual(rounds(mcbk1), ['( Previa )', '( Dieciseisavos )', '( Octavos )', '( Cuartos )', '( Semifinales )', '( Final )']);
  assert.deepEqual(Object.values(mcbk1.jornadas).map(rows => rows.length), [2, 16, 8, 4, 2, 1]);
  assert.deepEqual(rounds(mcpk2), ['( Previa )', '( Cuartos )', '( Semifinales )', '( Final )']);
  assert.deepEqual(Object.values(mcpk2.jornadas).map(rows => rows.length), [4, 4, 2, 1]);
  assert.deepEqual(Object.values(mcbk1.jornadas).at(-1), [['27/06', 'Gáldar CF', 'CD Jovero Las Rosas', 7, 2, null, '17:00', 'CD 1.2', null]]);
  assert.deepEqual(Object.values(mcpk2.jornadas).at(-1), [['27/06', 'AD Huracán', 'Gáldar CF', 4, 0, null, '16:00', 'CD 1.1', null]]);
  // Tandas: 6 en MCBK1 y 1 en MCPK2. Las Mesas no juega ninguna de las dos.
  assert.deepEqual([mcbk1, mcpk2].map(g => rowsOf(g.jornadas).filter(r => r[8]).length), [6, 1]);
  assert.ok([mcbk1, mcpk2].every(g => !rowsOf(g.jornadas).some(plays('UD Las Mesas Huracán'))));
});

test('simulate.mjs: goleadores, withChampions, cupsRaw, archive y lineupsFor', () => {
  const { golBenj, golPrebenj } = goleadores();
  assert.deepEqual([golBenj.length, golPrebenj.length], [8, 2]);
  // withChampions: la Copa de Campeones al final de cada categoría, sin tocar el crudo recibido.
  const base = currentAt('2026-03-01');
  const cur = withChampions(base);
  assert.deepEqual(ids(cur.benjamin), ['A1', 'A2', 'B1', 'B2', 'FF5', 'FF9', 'FF13', 'FF15', 'BCA1', 'BCB1', 'BCC1']);
  assert.deepEqual(ids(cur.prebenjamin), ['PG2', 'PG3', 'PFV2', 'PCC1']);
  assert.equal(Object.keys(cur.history).length, 15);
  assert.equal(base.benjamin.length, 8);
  assert.ok(!('BCA1' in base.history));
  assert.throws(() => withChampions(cur), /withChampions: BCA1 ya está en la temporada/);
  assert.equal(withChampions().benjamin.length, 11);
  // cupsRaw: los de B1 tal cual y, con extra, por código.
  assert.deepEqual(cupsRaw(), fixture('cups-2025-2026'));
  const cups = cupsRaw({ extra: true });
  assert.deepEqual([ids(cups.benjamin), ids(cups.prebenjamin)], [['MCB16', 'MCBK1', 'MCBK2'], ['MCP3', 'MCPK1', 'MCPK2']]);
  // archive: la forma de SEASON_<S>; 2024-25 une B1 y B3 en el orden de data-season-2024-2025.js.
  const a2425 = archive('2024-2025');
  assert.deepEqual(Object.keys(a2425).sort(), SEASON_KEYS);
  assert.deepEqual([a2425.name, a2425.current, ids(a2425.benjamin), ids(a2425.prebenjamin)],
    ['2024-2025', false, ['A1', 'BCC1', 'C2', 'P1', 'P3', 'P9'], ['PGC2']]);
  assert.deepEqual(archive('2023-2024'), fixture('historical-2023-2024'));
  assert.deepEqual(ids(pastSeasonRaw().benjamin), ['P1'], 'pastSeasonRaw sigue siendo el de B1');
  assert.throws(() => archive('2022-2023'), /archive: no hay fixture de la temporada 2022-2023/);
  // lineupsFor: A1 y FF1 en 2025-26; {} en las demás, como ensureLineups con un 404.
  assert.equal(Object.keys(lineupsFor('2025-2026')).length, 51);
  assert.deepEqual(lineupsFor('2024-2025'), {});
});

test('screens.mjs: datasetsFor sin opciones es el de B2; con opciones, los datos de B3', () => {
  const b2 = datasetsFor();
  assert.deepEqual(b2.seasons, [{ name: '2025-2026', current: true }, { name: '2024-2025', current: false }]);
  assert.deepEqual([b2.golBenj, b2.golPrebenj, b2.seasonRaw, b2.lineups], [[], [], {}, {}]);
  assert.deepEqual([ids(b2.benjamin).length, ids(b2.cupBenjamin), ids(b2.cupPrebenjamin)], [8, ['MCB16', 'MCBK2'], ['MCP3', 'MCPK1']]);
  const b3 = datasetsFor({
    ...goleadores(), champions: true, cupsExtra: true,
    seasonRaw: { '2024-2025': archive('2024-2025'), '2023-2024': archive('2023-2024') },
    lineups: { '2025-2026': lineupsFor('2025-2026') },
  });
  assert.deepEqual(b3.seasons.map(s => [s.name, s.current]), [['2025-2026', true], ['2024-2025', false], ['2023-2024', false]]);
  assert.deepEqual(ids(b3.prebenjamin), ['PG2', 'PG3', 'PFV2', 'PCC1']);
  assert.ok(b3.history.PCC1 && b3.history.BCA1);
  assert.deepEqual([ids(b3.cupBenjamin), ids(b3.cupPrebenjamin)], [['MCB16', 'MCBK1', 'MCBK2'], ['MCP3', 'MCPK1', 'MCPK2']]);
  assert.deepEqual([b3.golBenj.length, b3.golPrebenj.length, Object.keys(b3.lineups['2025-2026']).length], [8, 2, 51]);
  assert.equal(b3.health.season, '2025-2026');
  // `seasons` explícito manda.
  assert.deepEqual(datasetsFor({ seasons: [{ name: '2025-2026', current: true }] }).seasons, [{ name: '2025-2026', current: true }]);
});
