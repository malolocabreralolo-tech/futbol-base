// Plan B2, tarea 3: funciones puras del diseño anterior que se mueven a model.js (spec §5.2),
// con sus pruebas portadas: sortPlantillaRows, aggregatePlayerFromLineups y mergeAndOrderEvents
// (de test_sp2_modules.mjs), resolveSeasonDataset (de test_femodals_fixes.mjs) y
// filterCompetitionGroups (de test_portal_features.mjs). sourceInfo devuelve datos y no HTML
// (decisión 3); la pantalla Tabla lo pinta.
import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { fixture } from './fixtures/rediseno/load.mjs';
import {
  sortPlantillaRows, aggregatePlayerFromLineups, mergeAndOrderEvents, resolveSeasonDataset,
  filterCompetitionGroups, sourceInfo, buildSeason,
} from '../../src/model.js';

// ─── sortPlantillaRows ─────────────────────────────────────────────────────

const SAMPLE = [
  { n: 'OJEDA DELGADO, T.', ap: 12, st: 10, g: 14, y: 2, rd: 0 },
  { n: 'OJEDA SANTANA, M.', ap: 12, st: 11, g: 8,  y: 0, rd: 0 },
  { n: 'DOS SANTOS, M.',    ap: 8,  st: 0,  g: 0,  y: 0, rd: 0 },
];

test('plantilla: default sort goals desc, ties broken by ap desc, name asc', () => {
  const s = sortPlantillaRows(SAMPLE, 'g', 'desc');
  assert.equal(s[0].n, 'OJEDA DELGADO, T.');
  assert.equal(s[1].n, 'OJEDA SANTANA, M.');
  assert.equal(s[2].n, 'DOS SANTOS, M.');
});

test('plantilla: sort by ap asc puts sub-only first when their ap is lowest', () => {
  const s = sortPlantillaRows(SAMPLE, 'ap', 'asc');
  assert.equal(s[0].n, 'DOS SANTOS, M.');
});

// ─── mergeAndOrderEvents ───────────────────────────────────────────────────

test('timeline: events sorted by minute, null minutes last', () => {
  const ord = mergeAndOrderEvents([
    { t: 'goal', s: 'h', n: 'X', m: 30 },
    { t: 'yellow', s: 'a', n: 'Y', m: null },
    { t: 'goal', s: 'h', n: 'Z', m: 10 },
  ]);
  assert.equal(ord[0].n, 'Z');
  assert.equal(ord[1].n, 'X');
  assert.equal(ord[2].n, 'Y');
});

// ─── aggregatePlayerFromLineups ────────────────────────────────────────────

test('aggregatePlayerFromLineups: counts apps/starters/goals/cards', () => {
  const lineups = {
    'A|B|2-1': {
      home: [{ n: 'X', dn: 10, r: 'starter', g: 1, y: 0, rd: 0 }],
      away: [{ n: 'Y', dn: 7, r: 'starter', g: 1, y: 1, rd: 0 }],
      events: [
        { t: 'goal', s: 'h', n: 'X', m: 5 },
        { t: 'goal', s: 'a', n: 'Y', m: 50 },
        { t: 'yellow', s: 'a', n: 'Y', m: 60 },
      ],
    },
    'A|C|0-0': {
      home: [{ n: 'X', dn: 10, r: 'sub', g: 0, y: 0, rd: 0 }],
      away: [],
      events: [],
    },
  };
  const x = aggregatePlayerFromLineups(lineups, 'X');
  assert.equal(x.appearances, 2);
  assert.equal(x.starters, 1);
  assert.equal(x.goals, 1);
  assert.equal(x.matches.length, 2);
  assert.equal(x.matches[0].matchKey, 'A|B|2-1');
});

test('aggregatePlayerFromLineups solo cuenta los partidos de SU equipo', () => {
  // Mismo nombre en dos clubes: sin filtrar por equipo se sumaban los dos y el desplegable
  // contradecía a la fila de la tabla.
  const L = {
    'Firgas|Moya|2-1': { home: [{ n: 'PEREZ, JUAN', r: 'starter', g: 1, y: 0, rd: 0 }], away: [] },
    'Teror|Firgas|0-3': { home: [], away: [{ n: 'PEREZ, JUAN', r: 'sub', g: 2, y: 1, rd: 0 }] },
    'Arucas|Moya|1-1': { home: [{ n: 'PEREZ, JUAN', r: 'starter', g: 5, y: 0, rd: 0 }], away: [] },
  };
  const suyo = aggregatePlayerFromLineups(L, 'PEREZ, JUAN', 'Firgas');
  assert.equal(suyo.appearances, 2);
  assert.equal(suyo.goals, 3);          // 1 + 2, sin los 5 del homónimo
  assert.equal(suyo.starters, 1);
  const todos = aggregatePlayerFromLineups(L, 'PEREZ, JUAN');
  assert.equal(todos.appearances, 3);   // sin equipo, comportamiento anterior
});

test('aggregatePlayerFromLineups salta una clave repetida sin romperse', () => {
  // Plan A §9.2: una clave `local|visitante|gl-gv` que comparten dos partidos llega como
  // {dup: true, list}; sin saber cuál es, no cuenta ninguno.
  const DUP = { dup: true, list: [
    { s: '2025-2026', gr: 'PG2', cod: 125782, events: [],
      home: [{ n: 'PEREZ, JUAN', r: 'starter', g: 1, y: 0, rd: 0 }], away: [] },
    { s: '2025-2026', gr: 'FF15', cod: 258611, events: [],
      home: [{ n: 'PEREZ, JUAN', r: 'starter', g: 2, y: 0, rd: 0 }], away: [] },
  ] };
  const L = {
    'CD Calero|La Garita|1-11': DUP,
    'CD Calero|Moya|2-0': { s: '2025-2026', gr: 'FF15', cod: 258700, events: [],
      home: [{ n: 'PEREZ, JUAN', r: 'starter', g: 1, y: 0, rd: 0 }], away: [] },
  };
  const agg = aggregatePlayerFromLineups(L, 'PEREZ, JUAN', 'CD Calero');
  assert.equal(agg.appearances, 1);
  assert.equal(agg.goals, 1);
  assert.deepEqual(agg.matches.map(m => m.matchKey), ['CD Calero|Moya|2-0']);
});

// ─── resolveSeasonDataset ──────────────────────────────────────────────────
// Colisión real de IDs: A1 existe en HISTORY (2025-26) y en data-season-2024-2025.js con
// partidos DISTINTOS.
const HISTORY_FIX = {
  A1: { 'Jornada 1': [['07/10', 'EQUIPO ACTUAL X', 'EQUIPO ACTUAL Y', 2, 1]] },
};
const GROUP_2425 = {
  id: 'A1', phase: 'Primera Fase', name: 'Grupo 1',
  jornadas: { 'Jornada 1': [['2024-10-05', 'EQUIPO HIST X', 'EQUIPO HIST Y', 0, 3]] },
  standings: [[1, 'EQUIPO HIST Y', 3, 1, 1, 0, 0, 3, 0, 3]],
};
const STATS_FIX = {
  benjamin: { teams: { 'EQUIPO ACTUAL X': { streak: { type: 'W', count: 2 } } } },
};

test('resolveSeasonDataset: temporada histórica seleccionada → group.jornadas, nunca HISTORY (colisión A1)', () => {
  const ds = resolveSeasonDataset({ season: '2024-2025', cat: 'benjamin' }, {
    group: GROUP_2425, groupId: 'A1', history: HISTORY_FIX, stats: STATS_FIX,
  });
  assert.equal(ds.historical, true);
  assert.equal(ds.matchSource, GROUP_2425.jornadas,
    'en histórico los partidos salen del propio grupo, no de HISTORY');
  const j1 = ds.matchSource['Jornada 1'];
  assert.equal(j1[0][1], 'EQUIPO HIST X', 'partido histórico, no el actual');
  assert.equal(ds.stats, null, 'STATS es solo temporada actual: suprimido en histórico');
});

test('resolveSeasonDataset: temporada actual → HISTORY[groupId] + STATS', () => {
  const ds = resolveSeasonDataset({ season: '', cat: 'benjamin' }, {
    group: GROUP_2425, groupId: 'A1', history: HISTORY_FIX, stats: STATS_FIX,
  });
  assert.equal(ds.historical, false);
  assert.equal(ds.matchSource, HISTORY_FIX.A1);
  assert.equal(ds.matchSource['Jornada 1'][0][1], 'EQUIPO ACTUAL X');
  assert.equal(ds.stats, STATS_FIX);
});

test('resolveSeasonDataset: actual sin entrada en HISTORY → fallback a group.jornadas (copa)', () => {
  const ds = resolveSeasonDataset({ season: '' }, {
    group: GROUP_2425, groupId: 'BCA1', history: HISTORY_FIX, stats: null,
  });
  assert.equal(ds.matchSource, GROUP_2425.jornadas);
});

test('resolveSeasonDataset: histórico sin jornadas / sin grupo → objeto vacío', () => {
  const ds1 = resolveSeasonDataset({ season: '2023-2024' }, {
    group: { id: 'A1' }, groupId: 'A1', history: HISTORY_FIX, stats: STATS_FIX,
  });
  assert.deepEqual(ds1.matchSource, {});
  assert.equal(ds1.stats, null);
  const ds2 = resolveSeasonDataset({ season: '2023-2024' }, {
    group: null, groupId: 'A1', history: HISTORY_FIX, stats: STATS_FIX,
  });
  assert.deepEqual(ds2.matchSource, {});
});

test('resolveSeasonDataset: jornadas con forma rara (array) no se usa como matchSource', () => {
  const ds = resolveSeasonDataset({ season: '2023-2024' }, {
    group: { id: 'A1', jornadas: [1, 2, 3] }, groupId: 'A1', history: null, stats: null,
  });
  assert.deepEqual(ds.matchSource, {});
});

// ─── filterCompetitionGroups ───────────────────────────────────────────────

test('filters combine club names, islands and phases, and handle empty groups', () => {
  const groups = [{ island: 'grancanaria', phase: 'Liga', standings: [[1, 'Unión Viera']] },
    { island: 'lanzarote', phase: 'Copa', standings: [[1, 'Unión Viera B']] }, { standings: [] }];
  assert.equal(filterCompetitionGroups(groups, { search: 'union viera' }).length, 2);
  assert.deepEqual(filterCompetitionGroups(groups, { search: 'union', filterIsland: 'grancanaria', filterPhase: 'Liga' }), [groups[0]]);
  assert.equal(filterCompetitionGroups(groups, { search: 'inexistente' }).length, 0);
  assert.equal(filterCompetitionGroups(groups).length, 3, 'sin filtros, todos: ya no lee el estado S');
});

// ─── sourceInfo (decisión 3) ───────────────────────────────────────────────

const season = buildSeason({ name: '2025-2026', current: true, ...fixture('current-2025-2026') });
const groupOf = (id) => season.groups.find((group) => group.id === id);

test('sourceInfo: clasificación oficial de futbolaspalmas.com, con su enlace (PG2)', () => {
  assert.deepEqual(sourceInfo(groupOf('PG2')), {
    kind: 'oficial', source: 'futbolaspalmas.com', url: 'https://futbolaspalmas.com/1prebenjamin2',
  });
});

test('sourceInfo: sin URL no hay fuente ni enlace (PFV2, de la FIFLP)', () => {
  assert.deepEqual(sourceInfo(groupOf('PFV2')), { kind: 'oficial', source: null, url: null });
});

test('sourceInfo: calculada y corregida según standingsKind', () => {
  const pg2 = groupOf('PG2');
  assert.equal(sourceInfo({ ...pg2, standingsKind: 'reconstructed' }).kind, 'calculada');
  assert.equal(sourceInfo({ ...pg2, standingsKind: 'corrected' }).kind, 'corregida');
  assert.equal(sourceInfo({ ...pg2, standingsKind: null }).kind, 'oficial');
});

test('sourceInfo: en una temporada pasada no enlaza la página de la actual', () => {
  assert.deepEqual(sourceInfo(groupOf('PG2'), true), { kind: 'oficial', source: null, url: null });
});

test('sourceInfo: devuelve datos, no HTML, y nunca un enlace que no sea http(s)', () => {
  const info = sourceInfo({ id: 'X', url: 'javascript:alert(1)', standingsKind: 'source' });
  assert.deepEqual(info, { kind: 'oficial', source: null, url: null });
  assert.equal(sourceInfo({ id: 'X', url: 'http://' }).url, null, 'sin dominio no hay enlace');
  assert.equal(sourceInfo({ id: 'X', url: 'https://www.fiflp.com/pnfg/' }).source, 'fiflp.com');
  for (const value of Object.values(sourceInfo(groupOf('PG2')))) assert.doesNotMatch(String(value), /[<>]/);
});
