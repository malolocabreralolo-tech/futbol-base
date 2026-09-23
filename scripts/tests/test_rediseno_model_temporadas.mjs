/**
 * Rediseño «Acta», Tarea 3: model.js, filas, grupos y temporadas (spec §5.3).
 * Run: node --test scripts/tests/test_rediseno_model_temporadas.mjs
 *
 * Solo fixtures congeladas (scripts/tests/fixtures/rediseno/) y filas reales
 * copiadas literalmente; nunca los data-*.js ni src/config.js vivos.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fixture } from './fixtures/rediseno/load.mjs';
import {
  rowToMatch, inlineRowToMatch, buildGroup, buildSeason, buildCups, groupKind, matchState,
} from '../../src/model.js';
import { fixtureISO } from '../../src/links.js';

const MATCH_KEYS = ['season', 'groupId', 'roundKey', 'dateISO', 'time', 'venue', 'home', 'away', 'hs', 'as', 'advancer', 'shootout'];
const ROUND_KEYS = ['key', 'label', 'n', 'dateFrom', 'dateTo', 'matches'];
const GROUP_KEYS = ['season', 'id', 'cat', 'name', 'fullName', 'phase', 'island', 'url', 'standingsKind',
  'kind', 'compKey', 'label', 'standings', 'rounds', 'currentRound'];
const ROW_KEYS = ['pos', 'team', 'pts', 'pj', 'g', 'e', 'p', 'gf', 'gc', 'dg', 'retired'];

const current = () => {
  const f = fixture('current-2025-2026');
  return buildSeason({ name: f.season, current: true, benjamin: f.benjamin, prebenjamin: f.prebenjamin, history: f.history });
};
const historical = () => {
  const f = fixture('historical-2024-2025');
  return buildSeason({ name: f.season, current: false, benjamin: f.benjamin, prebenjamin: f.prebenjamin });
};
const cups = () => {
  const f = fixture('cups-2025-2026');
  return buildCups({ season: '2025-2026', benjamin: f.benjamin, prebenjamin: f.prebenjamin });
};
const byId = (groups, id) => groups.find(g => g.id === id);
const allMatches = group => group.rounds.flatMap(r => r.matches);

// ── rowToMatch ─────────────────────────────────────────────────────────────

test('rowToMatch: fila de HISTORY (8 columnas, fecha ISO)', () => {
  const m = rowToMatch(['2026-06-02', 'Las Mesas Hu.', 'AD Huracán', 2, 7, null, '17:30', null],
    { season: '2025-2026', groupId: 'PG2', roundKey: 'Jornada 30' });
  assert.deepEqual(m, {
    season: '2025-2026', groupId: 'PG2', roundKey: 'Jornada 30', dateISO: '2026-06-02', time: '17:30',
    venue: null, home: 'Las Mesas Hu.', away: 'AD Huracán', hs: 2, as: 7, advancer: null, shootout: null,
  });
  assert.deepEqual(Object.keys(m), MATCH_KEYS);
});

test('rowToMatch: fila histórica DD/MM toma el año de la temporada; "" pasa a null', () => {
  const ctx = { season: '2024-2025', groupId: 'PGC2', roundKey: '1' };
  const oct = rowToMatch(['26/10', 'AD Huracán', 'VETERANOS DEL PILA, C.D.', 3, 0, null, '09:00', 'LAS TORRES F8 (2)'], ctx);
  assert.equal(oct.dateISO, '2024-10-26');
  assert.equal(oct.time, '09:00');
  assert.equal(oct.venue, 'LAS TORRES F8 (2)');
  const apr = rowToMatch(['06/04', 'Las Mesas Hu.', 'Tamaraceite', 0, 8, null, '09:00', 'LAS TORRES F8 (2)'], { ...ctx, roundKey: '22' });
  assert.equal(apr.dateISO, '2025-04-06');
  const noDate = rowToMatch(['', 'Simusetti', 'Arucas B', null, null, null, '', ''], ctx);
  assert.equal(noDate.dateISO, null);
  assert.equal(noDate.time, null);
  assert.equal(noDate.venue, null);
  assert.equal(noDate.hs, null);
  assert.equal(noDate.as, null);
});

test('rowToMatch: DD-MM-YYYY (Fuerteventura)', () => {
  const m = rowToMatch(['02-11-2025', 'COTILLO, C.D. EL', 'CD 35600', 4, 9, null, '10:30', 'CENTRO DEPORTIVO INSULAR FRANCISCO MELIÁN 2'],
    { season: '2025-2026', groupId: 'PFV2', roundKey: '1' });
  assert.equal(m.dateISO, '2025-11-02');
});

test('rowToMatch: sin fecha en la fila, la toma de la clave de ronda (Copa de Campeones)', () => {
  const m = rowToMatch(['', 'Acodetti', 'Las Palmas', 0, 1, null, '', ''],
    { season: '2025-2026', groupId: 'BCA1', roundKey: '06-06-2026 ( Final )' });
  assert.equal(m.dateISO, '2026-06-06');
  assert.equal(m.time, null);
  assert.equal(m.venue, null);
});

test('rowToMatch: DD/MM del mismo día que la clave de ronda toma el año de la clave (julio y agosto de 2027)', () => {
  const ctx = { season: '2026-2027', groupId: 'MCPK1', roundKey: '02-07-2027 ( Final )' };
  const final = rowToMatch(['02/07', 'CD Maspa Training A', 'CF Unión Viera', null, null, null, '12:00', 'CD 1', null], ctx);
  assert.equal(final.dateISO, '2027-07-02');
  // Agosto sin año es del primer año, como en fixtureISO: solo la clave dice que esta final es de 2027.
  const august = ['14/08', 'CD Maspa Training A', 'CF Unión Viera', null, null];
  assert.equal(rowToMatch(august, { ...ctx, roundKey: '14-08-2027 ( Final )' }).dateISO, '2027-08-14');
  assert.equal(rowToMatch(august, { ...ctx, roundKey: 'Final' }).dateISO, '2026-08-14');
});

test('rowToMatch: julio sin año es del año final de la temporada, y fixtureISO no cambia (decisión 18)', () => {
  const ctx = { season: '2026-2027', groupId: 'MCP3', roundKey: 'Fase de Grupos' };
  const july = rowToMatch(['01/07', 'CD Tablero', 'UD Las Mesas Huracán', null, null], ctx);
  assert.equal(july.dateISO, '2027-07-01');
  assert.equal(fixtureISO('01/07', '2026-2027'), '2026-07-01');
  // El 29/06/2027, el partido del 30/06 y el del 01/07 siguen pendientes.
  const june = rowToMatch(['30/06', 'CD Tablero', 'UD Las Mesas Huracán', null, null], ctx);
  assert.equal(june.dateISO, '2027-06-30');
  assert.equal(matchState(june, '2027-06-29'), 'pendiente');
  assert.equal(matchState(july, '2027-06-29'), 'pendiente');
});

test('rowToMatch: cuadro de 9 columnas con pen y tanda', () => {
  const m = rowToMatch(['27/06', 'UD Las Mesas Huracán', 'CF Unión Carrizal', 1, 1, 'home', '10:00', 'CD 4', '3-2'],
    { season: '2025-2026', groupId: 'MCPK1', roundKey: '27-06-2026 ( Cuartos )' });
  assert.deepEqual(m, {
    season: '2025-2026', groupId: 'MCPK1', roundKey: '27-06-2026 ( Cuartos )', dateISO: '2026-06-27',
    time: '10:00', venue: 'CD 4', home: 'UD Las Mesas Huracán', away: 'CF Unión Carrizal',
    hs: 1, as: 1, advancer: 'home', shootout: '3-2',
  });
});

test('rowToMatch: filas antiguas de 6 y 5 columnas (caché vieja del SW)', () => {
  const ctx = { season: '2025-2026', groupId: 'MCPK1', roundKey: '27-06-2026 ( Cuartos )' };
  const six = rowToMatch(['27/06', 'UD Las Mesas Huracán', 'CF Unión Carrizal', 1, 1, 'home'], ctx);
  assert.equal(six.advancer, 'home');
  assert.equal(six.time, null);
  assert.equal(six.venue, null);
  assert.equal(six.shootout, null);
  const five = rowToMatch(['26/06', 'CD Tablero', 'UD Las Mesas Huracán', 1, 4], { ...ctx, roundKey: '26-06-2026 ( Previa )' });
  assert.equal(five.dateISO, '2026-06-26');
  assert.equal(five.advancer, null);
  assert.equal(five.shootout, null);
});

test('rowToMatch: rechaza el formato en línea de 7 columnas y la temporada ausente', () => {
  const inline = ['23/06', '14:00', 'UD Las Mesas Huracán', 'Real Club Victoria', 1, 4, 'Campo CD 1.2 - Campo Joma 2'];
  assert.throws(() => rowToMatch(inline, { season: '2025-2026', groupId: 'MCP3', roundKey: 'Fase de Grupos' }), RangeError);
  assert.throws(() => rowToMatch(['2026-06-02', 'A', 'B', 1, 0, null, '', ''], { groupId: 'PG2', roundKey: 'Jornada 30' }), TypeError);
});

// ── inlineRowToMatch ───────────────────────────────────────────────────────

test('inlineRowToMatch: fase de grupos de la Maspalomas [día, hora, local, visitante, gl, gv, campo]', () => {
  const m = inlineRowToMatch(['23/06', '14:00', 'UD Las Mesas Huracán', 'Real Club Victoria', 1, 4, 'Campo CD 1.2 - Campo Joma 2'],
    { season: '2025-2026', groupId: 'MCP3', roundKey: 'Fase de Grupos' });
  assert.deepEqual(m, {
    season: '2025-2026', groupId: 'MCP3', roundKey: 'Fase de Grupos', dateISO: '2026-06-23', time: '14:00',
    venue: 'Campo CD 1.2 - Campo Joma 2', home: 'UD Las Mesas Huracán', away: 'Real Club Victoria',
    hs: 1, as: 4, advancer: null, shootout: null,
  });
  assert.throws(() => inlineRowToMatch(['2026-06-02', 'A', 'B', 1, 0, null, '', ''],
    { season: '2025-2026', groupId: 'MCP3', roundKey: 'Fase de Grupos' }), RangeError);
});

// ── buildSeason: temporada actual ──────────────────────────────────────────

test('buildSeason actual: grupos de ambas categorías, en orden y con la forma de §5.3', () => {
  const f = fixture('current-2025-2026');
  const s = current();
  assert.equal(s.name, '2025-2026');
  assert.equal(s.current, true);
  assert.deepEqual(s.groups.map(g => `${g.cat}:${g.id}`), [
    ...f.benjamin.map(g => `benjamin:${g.id}`), ...f.prebenjamin.map(g => `prebenjamin:${g.id}`),
  ]);
  assert.deepEqual(s.groups.map(g => g.id).sort(), ['A1', 'A2', 'B1', 'B2', 'FF13', 'FF15', 'FF5', 'FF9', 'PFV2', 'PG2', 'PG3']);
  for (const g of s.groups) {
    assert.deepEqual(Object.keys(g), GROUP_KEYS, g.id);
    assert.equal(g.season, '2025-2026');
    g.standings.forEach(r => { assert.deepEqual(Object.keys(r), ROW_KEYS); assert.equal(typeof r.retired, 'boolean'); });
    g.rounds.forEach(r => {
      assert.deepEqual(Object.keys(r), ROUND_KEYS);
      r.matches.forEach(m => assert.deepEqual(Object.keys(m), MATCH_KEYS));
    });
  }
});

test('buildSeason actual: PG2 sale de HISTORY entera (30 jornadas), nunca de matches en línea', () => {
  const pg2 = byId(current().groups, 'PG2');
  assert.equal(pg2.kind, 'league');
  assert.equal(pg2.url, 'https://futbolaspalmas.com/1prebenjamin2');
  assert.equal(pg2.standingsKind, 'source');
  assert.equal(pg2.currentRound, 'Jornada 30');
  assert.equal(pg2.rounds.length, 30);
  assert.deepEqual(pg2.rounds.slice(0, 3).map(r => r.key), ['Jornada 1', 'Jornada 2', 'Jornada 3']);
  assert.equal(allMatches(pg2).length, 182);
  const j30 = pg2.rounds[29];
  assert.deepEqual({ key: j30.key, label: j30.label, n: j30.n, dateFrom: j30.dateFrom, dateTo: j30.dateTo, count: j30.matches.length },
    { key: 'Jornada 30', label: 'Jornada 30', n: 30, dateFrom: '2026-06-02', dateTo: '2026-06-06', count: 6 });
  assert.deepEqual(j30.matches[0], {
    season: '2025-2026', groupId: 'PG2', roundKey: 'Jornada 30', dateISO: '2026-06-02', time: '17:30',
    venue: null, home: 'Las Mesas Hu.', away: 'AD Huracán', hs: 2, as: 7, advancer: null, shootout: null,
  });
  assert.deepEqual(pg2.standings[0], {
    pos: 1, team: 'Unión Viera', pts: 79, pj: 28, g: 26, e: 1, p: 1, gf: 190, gc: 36, dg: 154, retired: false,
  });
  assert.equal(pg2.standings.length, 15);
});

test('buildSeason actual: PFV2 ordena jornadas numéricas y deja sin fecha los partidos de CD Teguinte', () => {
  const pfv2 = byId(current().groups, 'PFV2');
  assert.deepEqual(pfv2.rounds.map(r => r.key), ['1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '11', '12', '13', '14']);
  assert.deepEqual(pfv2.rounds.map(r => r.n), [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14]);
  assert.equal(pfv2.rounds[0].label, 'Jornada 1');
  assert.equal(pfv2.currentRound, '14');
  const teguinte = allMatches(pfv2).filter(m => m.home === 'CD Teguinte' || m.away === 'CD Teguinte');
  assert.equal(teguinte.length, 14);
  assert.ok(teguinte.every(m => m.dateISO === null && m.hs === null && m.as === null));
  assert.equal(pfv2.rounds[0].dateFrom, '2025-11-02');
});

test('buildGroup actual: sin entrada en HISTORY no hay jornadas (nunca las matches en línea)', () => {
  const f = fixture('current-2025-2026');
  const raw = f.prebenjamin.find(g => g.id === 'PG2');
  assert.equal(raw.matches.length, 6, 'la fixture trae la jornada en curso en línea');
  const g = buildGroup(raw, { season: f.season, cat: 'prebenjamin', current: true, history: {} });
  assert.deepEqual(g.rounds, []);
  assert.equal(g.currentRound, null);
  assert.equal(g.standings.length, 15);
});

test('buildSeason: HISTORY solo alimenta la temporada actual (códigos repetidos entre temporadas)', () => {
  const f = fixture('historical-2024-2025');
  const ajena = { P1: { 'Jornada 1': [['2025-10-01', 'Otro', 'Equipo', 1, 0, null, '', '']] } };
  const s = buildSeason({ name: f.season, current: false, benjamin: f.benjamin, prebenjamin: f.prebenjamin, history: ajena });
  const p1 = byId(s.groups, 'P1');
  assert.equal(p1.rounds.length, 9);
  assert.ok(allMatches(p1).every(m => m.home !== 'Otro'));
});

// ── buildSeason: temporada histórica ───────────────────────────────────────

test('buildSeason histórica: P1 y PGC2 desde jornadas, con el año de su temporada', () => {
  const s = historical();
  assert.equal(s.current, false);
  assert.deepEqual(s.groups.map(g => `${g.cat}:${g.id}`), ['benjamin:P1', 'prebenjamin:PGC2']);
  const p1 = byId(s.groups, 'P1');
  assert.equal(p1.url, null);
  assert.equal(p1.standingsKind, null);
  assert.equal(p1.kind, 'league');
  assert.equal(p1.currentRound, '9');
  assert.deepEqual(p1.rounds.map(r => r.label), ['Jornada 1', 'Jornada 2', 'Jornada 3', 'Jornada 4', 'Jornada 5',
    'Jornada 6', 'Jornada 7', 'Jornada 8', 'Jornada 9']);
  assert.deepEqual([p1.rounds[0].dateFrom, p1.rounds[0].dateTo], ['2024-10-25', '2024-10-26']);
  assert.deepEqual([p1.rounds[8].dateFrom, p1.rounds[8].dateTo], ['2024-12-20', '2024-12-21']);
  assert.ok(allMatches(p1).every(m => m.time === null && m.venue === null));
  const pgc2 = byId(s.groups, 'PGC2');
  assert.equal(pgc2.rounds.length, 22);
  const simusetti = allMatches(pgc2).filter(m => m.home === 'Simusetti' || m.away === 'Simusetti');
  assert.equal(simusetti.length, 22);
  assert.ok(simusetti.every(m => m.dateISO === null));
  const huracan = pgc2.rounds[0].matches.find(m => m.home === 'AD Huracán');
  assert.deepEqual([huracan.dateISO, huracan.time, huracan.venue, huracan.hs, huracan.as],
    ['2024-10-26', '09:00', 'LAS TORRES F8 (2)', 3, 0]);
});

// ── buildCups: Maspalomas ──────────────────────────────────────────────────

test('buildCups: fase de grupos en línea (cup-league) y cuadros desde jornadas (cup-bracket)', () => {
  const c = cups();
  assert.equal(c.season, '2025-2026');
  assert.deepEqual(Object.fromEntries(c.groups.map(g => [g.id, `${g.cat}:${g.kind}`])), {
    MCB16: 'benjamin:cup-league', MCBK2: 'benjamin:cup-bracket',
    MCP3: 'prebenjamin:cup-league', MCPK1: 'prebenjamin:cup-bracket',
  });
  const mcp3 = byId(c.groups, 'MCP3');
  assert.equal(mcp3.rounds.length, 1);
  assert.deepEqual({ key: mcp3.rounds[0].key, label: mcp3.rounds[0].label, n: mcp3.rounds[0].n,
    dateFrom: mcp3.rounds[0].dateFrom, dateTo: mcp3.rounds[0].dateTo, count: mcp3.rounds[0].matches.length },
  { key: 'Fase de Grupos', label: 'Fase de Grupos', n: null, dateFrom: '2026-06-23', dateTo: '2026-06-25', count: 6 });
  assert.equal(mcp3.currentRound, 'Fase de Grupos');
  assert.equal(mcp3.url, null);
  assert.deepEqual(mcp3.standings.map(r => [r.pos, r.team, r.pts]), [
    [1, 'Real Club Victoria', 9], [2, 'CDA El Médano CF', 4], [3, 'UD Las Mesas Huracán', 3], [4, 'Arucas CF', 1],
  ]);
});

test('buildCups: MCPK1, rondas del cuadro, quién pasó y tanda', () => {
  const k1 = byId(cups().groups, 'MCPK1');
  assert.deepEqual(k1.rounds.map(r => r.label), ['Previa', 'Cuartos', 'Semifinales', 'Final']);
  assert.deepEqual(k1.rounds.map(r => r.matches.length), [4, 4, 2, 1]);
  assert.equal(k1.currentRound, null);
  const qf = k1.rounds[1].matches.find(m => m.home === 'UD Las Mesas Huracán');
  assert.deepEqual([qf.away, qf.hs, qf.as, qf.advancer, qf.shootout, qf.time, qf.venue],
    ['CF Unión Carrizal', 1, 1, 'home', '3-2', '10:00', 'CD 4']);
  const final = k1.rounds[3].matches[0];
  assert.deepEqual([final.home, final.away, final.hs, final.as, final.advancer, final.dateISO],
    ['CD Maspa Training A', 'CF Unión Viera', 1, 2, 'away', '2026-06-27']);
  const previa = k1.rounds[0].matches.find(m => m.away === 'UD Las Mesas Huracán');
  assert.deepEqual([previa.home, previa.hs, previa.as, previa.advancer], ['CD Tablero', 1, 4, 'away']);
});

test('buildCups: MCBK2, final de la Copa Oro por penaltis', () => {
  const k2 = byId(cups().groups, 'MCBK2');
  assert.deepEqual(k2.rounds.map(r => r.label), ['Previa', 'Dieciseisavos', 'Octavos', 'Cuartos', 'Semifinales', 'Final']);
  const final = k2.rounds[5].matches[0];
  assert.deepEqual([final.home, final.away, final.hs, final.as, final.advancer, final.shootout],
    ['AD Huracán A', 'UD Vecindario A', 2, 2, 'away', '3-4']);
});

// ── groupKind ──────────────────────────────────────────────────────────────

const rounds = (...sizes) => sizes.map((n, i) => ({ key: String(i + 1), matches: Array.from({ length: n }, () => ({})) }));

test('groupKind: liga, liguilla de copa y cuadro (regla del embudo)', () => {
  assert.equal(groupKind({ id: 'PG2', phase: 'Gran Canaria' }, rounds(7, 6, 6)), 'league');
  // Liga cuya última jornada tiene menos partidos: sigue siendo liga
  assert.equal(groupKind({ id: 'FF17', phase: 'Primera Fase GC' }, rounds(3, 3, 2)), 'league');
  // Copa de Campeones 2023-24: una ronda de 7 partidos → liguilla
  assert.equal(groupKind({ id: 'BC1', phase: 'Copa de Campeones' },
    [{ key: '14-06-2024 ( Ronda 1 )', matches: Array.from({ length: 7 }, () => ({})) }]), 'cup-league');
  // Copa Fuerteventura 2022-23: jornadas numeradas de tamaño constante → liguilla
  assert.equal(groupKind({ id: 'CFV1', phase: 'Copa Fuerteventura' }, rounds(3, 3, 3, 3, 3)), 'cup-league');
  // Copa de Campeones 2025-26: cuartos, semifinales y final → cuadro
  assert.equal(groupKind({ id: 'BCA1', phase: 'Copa de Campeones' },
    [{ key: '06-06-2026 ( Cuartos )', matches: [{}, {}, {}, {}] }, { key: '06-06-2026 ( Semifinales )', matches: [{}, {}] },
      { key: '06-06-2026 ( Final )', matches: [{}] }]), 'cup-bracket');
  // Detectores que solo tenía isKnockoutGroup: código …KO y rondas «Ronda N»
  assert.equal(groupKind({ id: 'XKO', phase: 'Torneo' }, rounds(4, 2, 1)), 'cup-bracket');
  assert.equal(groupKind({ id: 'X1', phase: 'Torneo' },
    [{ key: 'Ronda 1', matches: [{}, {}] }, { key: 'Ronda 2', matches: [{}] }]), 'cup-bracket');
});

// ── matchState ─────────────────────────────────────────────────────────────

test('matchState: jugado, pendiente, sin resultado y sin fecha (spec §5.3)', () => {
  const ctx = { season: '2025-2026', groupId: 'FB', roundKey: 'Jornada 13' };
  const played = rowToMatch(['2026-06-02', 'Las Mesas Hu.', 'AD Huracán', 2, 7, null, '17:30', null], { ...ctx, groupId: 'PG2', roundKey: 'Jornada 30' });
  assert.equal(matchState(played, '2026-01-01'), 'jugado');
  assert.equal(matchState(played, '2026-09-23'), 'jugado');
  // El único partido con fecha y sin marcador de HISTORY (FB, jornada 13)
  const fb = rowToMatch(['2026-04-11', 'CD Tamasite', 'Corralejo 35', null, null, null, '10:00', null], ctx);
  assert.equal(matchState(fb, '2026-04-10'), 'pendiente');
  assert.equal(matchState(fb, '2026-04-11'), 'pendiente', 'el mismo día todavía es pendiente');
  assert.equal(matchState(fb, '2026-04-12'), 'sin resultado');
  assert.equal(matchState(fb, '2026-09-23'), 'sin resultado');
  // Sin fecha nunca es pendiente (CD Teguinte en PFV2)
  const teguinte = rowToMatch(['', 'ATISACHI DE FUERTEVENTURA C.F., C.D. "B"', 'CD Teguinte', null, null, null, '', ''],
    { ...ctx, groupId: 'PFV2', roundKey: '1' });
  assert.equal(matchState(teguinte, '2025-09-01'), 'sin fecha');
  assert.equal(matchState(teguinte, '2026-09-23'), 'sin fecha');
  assert.throws(() => matchState(fb, undefined), TypeError);
  assert.throws(() => matchState(fb, '11/04/2026'), TypeError);
});

test('matchState sobre las fixtures: en PFV2 solo los de CD Teguinte quedan sin fecha', () => {
  const pfv2 = byId(current().groups, 'PFV2');
  const states = allMatches(pfv2).map(m => matchState(m, '2026-09-23'));
  assert.equal(states.filter(s => s === 'sin fecha').length, 14);
  assert.equal(states.filter(s => s === 'pendiente').length, 0);
  assert.equal(states.filter(s => s === 'jugado').length, allMatches(pfv2).length - 14);
});
