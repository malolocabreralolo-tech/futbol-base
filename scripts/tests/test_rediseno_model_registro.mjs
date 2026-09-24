// Plan B2, tarea 3: createModel(datasets, { portalSeason, buildClubIndex }), el acceso memorizado a
// temporadas, grupos, torneos, índice de clubes y goleadores sobre el registro de datos (contrato del
// esqueleto). buildClubIndex llega inyectado: model.js no importa de myteam.js (sin ciclos).
// Datos: las fixtures congeladas de B1, nunca los data-*.js vivos.
import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { fixture } from './fixtures/rediseno/load.mjs';
import { datasetsFrom } from './fixtures/rediseno/simulate.mjs';
import { createModel } from '../../src/model.js';
import { buildClubIndex, resolveMyTeam, homeState } from '../../src/myteam.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const PORTAL_SEASON = '2025-2026';
const fresh = () => {
  const datasets = datasetsFrom(fixture('current-2025-2026'));
  return { datasets, model: createModel(datasets, { portalSeason: PORTAL_SEASON, buildClubIndex }) };
};
const row = (pos, team) => [pos, team, 0, 0, 0, 0, 0, 0, 0, 0];

test('la temporada del portal sale de benjamin, prebenjamin e history, y se memoriza', () => {
  const { model } = fresh();
  const season = model.season(PORTAL_SEASON);
  assert.equal(season.name, PORTAL_SEASON);
  assert.equal(season.current, true);
  assert.deepEqual(season.groups.map((group) => group.id),
    ['A1', 'A2', 'B1', 'B2', 'FF5', 'FF9', 'FF13', 'FF15', 'PG2', 'PG3', 'PFV2']);
  const pg2 = season.groups.find((group) => group.id === 'PG2');
  assert.equal(pg2.rounds.length, 30, 'las jornadas salen de HISTORY, no de la jornada en línea');
  assert.equal(pg2.rounds.flatMap((round) => round.matches).length, 182);
  assert.equal(model.season(PORTAL_SEASON), season, 'memorizada: el mismo objeto');
});

test('una temporada pasada solo existe cuando está cargada en seasonRaw', () => {
  const { datasets, model } = fresh();
  assert.equal(model.season('2024-2025'), null);
  datasets.seasonRaw['2024-2025'] = fixture('historical-2024-2025');
  const old = model.season('2024-2025');
  assert.equal(old.name, '2024-2025');
  assert.equal(old.current, false);
  assert.deepEqual(old.groups.map((group) => group.id), ['P1', 'PGC2']);
  assert.ok(old.groups.every((group) => group.season === '2024-2025' && group.rounds.length > 0));
  assert.equal(model.season('2024-2025'), old);
  assert.equal(model.season('2023-2024'), null);
  assert.equal(model.season('basura'), null);
});

test('group(season, id): el grupo de esa temporada o null', () => {
  const { datasets, model } = fresh();
  assert.equal(model.group(PORTAL_SEASON, 'PG2').label, 'Prebenjamín, Grupo 2 de Gran Canaria');
  assert.equal(model.group(PORTAL_SEASON, 'ZZ9'), null);
  assert.equal(model.group('2024-2025', 'PGC2'), null, 'temporada sin cargar');
  datasets.seasonRaw['2024-2025'] = fixture('historical-2024-2025');
  assert.equal(model.group('2024-2025', 'PGC2').season, '2024-2025');
  assert.equal(model.group('2024-2025', 'PG2'), null, 'los códigos no cruzan temporadas');
});

test('cups(): los torneos de 2025-26, memorizados; null sin datos, y llegan si se cargan después', () => {
  const { model } = fresh();
  const cups = model.cups();
  assert.equal(cups.season, '2025-2026');
  assert.deepEqual(cups.groups.map((group) => group.id), ['MCB16', 'MCBK2', 'MCP3', 'MCPK1']);
  assert.equal(model.cups(), cups);
  const datasets = datasetsFrom(fixture('current-2025-2026'), { cupBenjamin: null, cupPrebenjamin: null });
  const without = createModel(datasets, { portalSeason: PORTAL_SEASON });
  assert.equal(without.cups(), null);
  datasets.cupPrebenjamin = fixture('cups-2025-2026').prebenjamin;
  assert.deepEqual(without.cups().groups.map((group) => group.id), ['MCP3', 'MCPK1']);
});

test('los torneos siguen siendo de 2025-26 con otra temporada en el portal', () => {
  const model = createModel(datasetsFrom(fixture('current-2025-2026')), { portalSeason: '2026-2027' });
  assert.equal(model.cups().season, '2025-2026');
  assert.ok(model.cups().groups.every((group) => group.season === '2025-2026'));
});

test('clubIndex(): nombres de la temporada, los torneos y los escudos, memorizado', () => {
  const { model } = fresh();
  const index = model.clubIndex();
  assert.equal(index.same('Las Mesas Hu.', 'UD Las Mesas Huracán'), true, 'alias de la Maspalomas (MCP3)');
  assert.equal(index.same('Las Mesas Hu.', 'MESAS, U.D. LAS "B"'), true, 'mismo escudo');
  assert.equal(index.same('Las Mesas Hu.', 'AD Huracán'), false);
  assert.equal(model.clubIndex(), index, 'memorizado: el mismo objeto');
});

test('clubIndex(): se rehace al cargar otra temporada, y sus nombres entran en el universo', () => {
  const datasets = {
    benjamin: [{ id: 'G1', name: 'Grupo 1', phase: 'Primera Fase', island: 'grancanaria', standings: [row(1, 'Alfa')] }],
    prebenjamin: [], history: { G1: {} }, shields: {}, seasonRaw: {},
  };
  const model = createModel(datasets, { portalSeason: PORTAL_SEASON, buildClubIndex });
  const before = model.clubIndex();
  assert.deepEqual(before.members('Alfa'), ['Alfa']);
  datasets.seasonRaw['2024-2025'] = { benjamin: [{ id: 'G1', name: 'Grupo 1', phase: 'Primera Fase',
    island: 'grancanaria', standings: [row(1, 'Alfa B')], jornadas: {} }], prebenjamin: [] };
  const after = model.clubIndex();
  assert.notEqual(after, before);
  assert.deepEqual(after.members('Alfa'), ['Alfa', 'Alfa B']);
  assert.equal(model.clubIndex(), after);
});

test('scorers(season, cat): los goleadores de la temporada actual; [] en las pasadas', () => {
  const golPrebenj = [{ id: 'PG2', g: 'PREBENJAMIN GC GRUPO 2', s: [['De La Rosa Perello, Theo', 'Las Mesas Hu.', 12, 17]] }];
  const model = createModel(datasetsFrom(fixture('current-2025-2026'), { golPrebenj }), { portalSeason: PORTAL_SEASON });
  assert.equal(model.scorers(PORTAL_SEASON, 'prebenjamin'), golPrebenj);
  assert.deepEqual(model.scorers(PORTAL_SEASON, 'benjamin'), [], 'sin data-goleadores.js');
  assert.deepEqual(model.scorers('2024-2025', 'prebenjamin'), []);
});

test('buildClubIndex llega inyectado: sin él, clubIndex() lanza, y model.js no importa de myteam.js', () => {
  const model = createModel(datasetsFrom(fixture('current-2025-2026')), { portalSeason: PORTAL_SEASON });
  assert.equal(model.season(PORTAL_SEASON).name, PORTAL_SEASON, 'lo demás funciona sin el índice');
  assert.throws(() => model.clubIndex(), TypeError);
  const src = readFileSync(join(ROOT, 'src', 'model.js'), 'utf8');
  assert.doesNotMatch(src, /from '\.\/myteam\.js'/, 'myteam.js importa de model.js: sería un ciclo');
});

test('createModel exige la temporada del portal: sin ella, las fechas saldrían de config.js', () => {
  assert.throws(() => createModel(datasetsFrom(fixture('current-2025-2026')), {}), TypeError);
  assert.throws(() => createModel(datasetsFrom(fixture('current-2025-2026')), { portalSeason: '2025/26' }), TypeError);
});

test('con el modelo, Las Mesas en PG2 el 23/09/2026 queda en D sin pregunta (caso 1 de §11)', () => {
  const { model } = fresh();
  const myTeam = { name: 'Las Mesas Hu.', season: PORTAL_SEASON, cat: 'prebenjamin', groupId: 'PG2' };
  const resolution = resolveMyTeam(myTeam, model.season(PORTAL_SEASON), model.clubIndex(), '2026-09-23');
  assert.equal(resolution.status, 'ok');
  assert.equal(resolution.group, model.group(PORTAL_SEASON, 'PG2'));
  assert.equal(homeState({ resolution, todayISO: '2026-09-23', portalSeason: PORTAL_SEASON }), 'D');
});
