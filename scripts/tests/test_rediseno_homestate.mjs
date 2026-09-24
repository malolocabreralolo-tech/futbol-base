// Estado de la portada (spec §4.2) y caja de la temporada siguiente, con datos reales congelados.
import test from 'node:test';
import assert from 'node:assert/strict';
import { fixture } from './fixtures/rediseno/load.mjs';
import { currentAt, nextSeasonRaw, teamNames } from './fixtures/rediseno/simulate.mjs';
import { buildSeason, defaultRound } from '../../src/model.js';
import { buildClubIndex, resolveMyTeam, homeState, showNextSeasonBox } from '../../src/myteam.js';

const PORTAL_SEASON = '2025-2026';
const health = fixture('health');
const shields = fixture('shields');
const season = raw => buildSeason({ name: raw.season, current: true, ...raw });
const real = season(fixture('current-2025-2026'));
const index = buildClubIndex(teamNames(real), shields);
const LAS_MESAS_PG2 = { name: 'Las Mesas Hu.', season: '2025-2026', cat: 'prebenjamin', groupId: 'PG2' };
const own = (built, groupId, name) => ({ status: 'ok', group: built.groups.find(g => g.id === groupId), name, cat: 'prebenjamin' });
const state = (resolution, todayISO, portalSeason = PORTAL_SEASON) => homeState({ resolution, todayISO, portalSeason });

test('la fixture de data-health tiene la temporada siguiente pendiente', () => {
  assert.deepEqual(health.nextSeason, { name: '2026-2027', status: 'pending' });
});

test('caso 1: el 23/09/2026 PG2 Las Mesas está en D con la caja de 2026/27 y sin pregunta', () => {
  const resolution = resolveMyTeam(LAS_MESAS_PG2, real, index, '2026-09-23');
  assert.equal(resolution.status, 'ok');
  assert.equal(state(resolution, '2026-09-23'), 'D');
  assert.equal(showNextSeasonBox({ group: resolution.group, health, portalSeason: PORTAL_SEASON }), true);
});

test('caso 1: el 15/06/2026 es D, y sin la caja si la temporada siguiente no está pendiente', () => {
  const resolution = own(real, 'PG2', 'Las Mesas Hu.');
  assert.equal(state(resolution, '2026-06-15'), 'D');
  const notPending = { ...health, nextSeason: { name: '2026-2027', status: 'ready' } };
  assert.equal(showNextSeasonBox({ group: resolution.group, health: notPending, portalSeason: PORTAL_SEASON }), false);
});

test('caso 1: una ficha de 2024-25 es D y nunca lleva la caja', () => {
  const raw = fixture('historical-2024-2025');
  const old = buildSeason({ name: raw.season, current: false, benjamin: raw.benjamin, prebenjamin: raw.prebenjamin });
  const resolution = own(old, 'PGC2', 'Las Mesas Hu.');
  assert.equal(state(resolution, '2026-09-23'), 'D');
  assert.equal(showNextSeasonBox({ group: resolution.group, health, portalSeason: PORTAL_SEASON }), false);
  assert.equal(showNextSeasonBox({ group: resolution.group, health: null, portalSeason: PORTAL_SEASON }), false);
});

test('orden de §4.2: un grupo terminado sin ningún resultado es D, no B (PGC2 de 2024-25 sin marcadores)', () => {
  const raw = structuredClone(fixture('historical-2024-2025'));
  const group = raw.prebenjamin.find(g => g.id === 'PGC2');
  for (const rows of Object.values(group.jornadas)) for (const row of rows) { row[3] = null; row[4] = null; }
  const old = buildSeason({ name: raw.season, current: false, benjamin: [], prebenjamin: [group] });
  assert.equal(state(own(old, 'PGC2', 'Las Mesas Hu.'), '2026-09-23'), 'D');
});

test('sin data-health, un grupo de la temporada del portal lleva la caja', () => {
  const group = real.groups.find(g => g.id === 'PG2');
  assert.equal(showNextSeasonBox({ group, health: null, portalSeason: PORTAL_SEASON }), true);
  assert.equal(showNextSeasonBox({ group, health: undefined, portalSeason: PORTAL_SEASON }), true);
});

test('E si hay que preguntar y X si el equipo no aparece', () => {
  const candidates = [{ group: real.groups.find(g => g.id === 'PG2'), name: 'Las Mesas Hu.', cat: 'prebenjamin' }];
  assert.equal(state({ status: 'ask', candidates }, '2026-09-23'), 'E');
  assert.equal(state({ status: 'absent' }, '2026-09-23'), 'X');
});

test('A en plena temporada, B antes de la jornada 1 y C en el hueco anterior al 1 de junio', () => {
  assert.equal(state(own(season(currentAt('2026-03-01')), 'PG2', 'Las Mesas Hu.'), '2026-03-01'), 'A');
  assert.equal(state(own(season(currentAt('2025-10-01')), 'PG2', 'Las Mesas Hu.'), '2025-10-01'), 'B');
  assert.equal(state(own(real, 'PG2', 'Las Mesas Hu.'), '2026-05-31'), 'C');
});

test('el 1 de junio con la jornada 30 pendiente: Las Mesas juega (A) y RC Victoria no tiene partido (C)', () => {
  const june = season(currentAt('2026-06-01'));
  assert.equal(state(own(june, 'PG2', 'Las Mesas Hu.'), '2026-06-01'), 'A');
  assert.equal(state(own(june, 'PG2', 'RC Victoria'), '2026-06-01'), 'C');
});

test('los partidos contra un retirado (CD Teguinte en PFV2) no son el próximo partido de nadie', () => {
  const raw = structuredClone(fixture('current-2025-2026'));
  for (const rows of Object.values(raw.history.PFV2)) {
    for (const row of rows) if (row[1] === 'CD Teguinte' || row[2] === 'CD Teguinte') row[0] = '28-05-2026';
  }
  const built = season(raw);
  const tetir = { status: 'ok', group: built.groups.find(g => g.id === 'PFV2'), name: 'Unión Tetir', cat: 'prebenjamin' };
  assert.equal(state(tetir, '2026-05-25'), 'C');
  assert.equal(state(tetir, '2026-06-15'), 'D');
});

test('caso 4: jornada 1 de 2026/27 sin resultados es B, solo con datos de 2026/27 y también sin clasificación', () => {
  const next = season(nextSeasonRaw({ benjamin: ['A1', 'B2', 'FF15'], prebenjamin: ['PG2', 'PG3'] }));
  const nextIndex = buildClubIndex(teamNames(next), shields);
  const answered = { name: 'Las Mesas Hu.', season: '2026-2027', cat: 'prebenjamin', groupId: 'PG2' };
  const resolution = resolveMyTeam(answered, next, nextIndex, '2026-10-01');
  assert.equal(resolution.status, 'ok');
  const matches = resolution.group.rounds.flatMap(round => round.matches);
  assert.ok(matches.length > 0 && matches.every(m => m.season === '2026-2027' && m.dateISO >= '2026-07-01' && m.hs === null));
  assert.ok(resolution.group.standings.every(row => row.pj === 0 && row.pts === 0));
  assert.equal(state(resolution, '2026-10-01', '2026-2027'), 'B');
  assert.equal(state(resolution, '2026-10-20', '2026-2027'), 'B');
  assert.equal(defaultRound(resolution.group, '2026-10-01').n, 1);
  // Clasificación sin publicar (vacía): nada lanza, nadie queda retirado y sigue en B.
  const unpublished = { ...resolution, group: { ...resolution.group, standings: [] } };
  assert.equal(state(unpublished, '2026-10-01', '2026-2027'), 'B');
});
