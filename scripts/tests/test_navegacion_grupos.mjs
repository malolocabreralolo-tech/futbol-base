// Navegación entre grupos (petición de las familias: «poder navegar en la web entre los distintos
// grupos para ir viendo los resultados y la evolución de los otros grupos dentro de cada categoría»).
// El modelo (siblingGroups, groupProgression y competitionRound), sobre las fixtures congeladas y
// nunca sobre los data-*.js vivos.
import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { fixture } from './fixtures/rediseno/load.mjs';
import { currentAt } from './fixtures/rediseno/simulate.mjs';
import { ctxFor, datasetsFor, pastSeasonRaw, PORTAL_SEASON } from './fixtures/rediseno/screens.mjs';
import { competitionRound, defaultRound, groupProgression, pointsProgression, siblingGroups } from '../../src/model.js';

const ids = (groups) => groups.map((g) => g.id);
const modelOf = (datasets = datasetsFor()) => ctxFor('tabla', {}, { datasets }).model;
const groupOf = (id, datasets) => modelOf(datasets).group(PORTAL_SEASON, id);

// La Primera Fase de benjamín con 24 grupos (los cuatro de la fixture más copias de FF15 con su código
// y su nombre), como la de 2026-27: la tira de números solo sale con más de seis.
export function withGroups(count, { from = 'FF15', current = fixture('current-2025-2026') } = {}) {
  const base = current.benjamin.find((g) => g.id === from);
  for (let n = 1; n <= count; n++) {
    const id = `FF${n}`;
    if (current.benjamin.some((g) => g.id === id)) continue;
    current.benjamin.push({ ...structuredClone(base), id, name: `Grupo ${n}` });
    current.history[id] = structuredClone(current.history[from]);
  }
  return current;
}

// ── siblingGroups ─────────────────────────────────────────────────────────

test('siblingGroups: los grupos de liga de la misma competición y categoría, en el orden natural de Ligas', () => {
  const model = modelOf();
  const nav = siblingGroups(model, model.group(PORTAL_SEASON, 'FF9'));
  assert.deepEqual(ids(nav.list), ['FF5', 'FF9', 'FF13', 'FF15'], 'Grupo 9 antes que Grupo 13');
  assert.equal(nav.index, 1);
  assert.deepEqual([nav.prev.id, nav.next.id], ['FF5', 'FF13']);
  assert.deepEqual([nav.entry.cat, nav.entry.key, nav.entry.label], ['benjamin', 'primera-fase', 'Primera Fase']);
  const first = siblingGroups(model, model.group(PORTAL_SEASON, 'FF5'));
  assert.deepEqual([first.index, first.prev, first.next.id], [0, null, 'FF9']);
  const last = siblingGroups(model, model.group(PORTAL_SEASON, 'FF15'));
  assert.deepEqual([last.index, last.prev.id, last.next], [3, 'FF13', null]);
  // Cada fase, la suya: la Segunda Fase A no se mezcla con la B, ni benjamín con prebenjamín.
  assert.deepEqual(ids(siblingGroups(model, model.group(PORTAL_SEASON, 'A2')).list), ['A1', 'A2']);
  assert.deepEqual(ids(siblingGroups(model, model.group(PORTAL_SEASON, 'PG2')).list), ['PG2', 'PG3']);
});

test('siblingGroups: null con un solo grupo, para una copa o un torneo y sin grupo', () => {
  const model = modelOf();
  assert.equal(siblingGroups(model, model.group(PORTAL_SEASON, 'PFV2')), null, 'Fuerteventura, un solo grupo');
  assert.equal(siblingGroups(model, model.cups().groups.find((g) => g.kind !== 'league')), null);
  assert.equal(siblingGroups(model, null), null);
  // Una temporada pasada: la suya (2024-25 de B3 trae P3 y P9 de la Primera Fase; la de B2, solo P1).
  const b3 = modelOf(datasetsFor({ seasonRaw: { '2024-2025': fixture('historical-2024-2025-b3') } }));
  assert.deepEqual(ids(siblingGroups(b3, b3.group('2024-2025', 'P9')).list), ['P3', 'P9']);
  const b2 = modelOf(datasetsFor({ seasonRaw: { '2024-2025': pastSeasonRaw() } }));
  assert.equal(siblingGroups(b2, b2.group('2024-2025', 'P1')), null);
});

test('siblingGroups: con 24 grupos, del 1 al 24 en orden natural', () => {
  const model = modelOf(datasetsFor({ current: withGroups(24) }));
  const nav = siblingGroups(model, model.group(PORTAL_SEASON, 'FF5'));
  assert.equal(nav.list.length, 24);
  assert.deepEqual(ids(nav.list).slice(0, 3), ['FF1', 'FF2', 'FF3']);
  assert.equal(nav.list[23].id, 'FF24');
  assert.equal(nav.index, 4);
});

// ── groupProgression ─────────────────────────────────────────────────────

test('groupProgression: los puntos de cada equipo, los de pointsProgression; en el orden de la clasificación y el retirado sin datos', () => {
  const pg2 = groupOf('PG2');
  const evo = groupProgression(pg2);
  assert.equal(evo.rounds.length, 30);
  assert.deepEqual(evo.rounds[0], { key: 'Jornada 1', label: 'Jornada 1', n: 1 });
  assert.equal(evo.played, 30);
  assert.deepEqual(evo.rows.map((r) => r.team), pg2.standings.map((r) => r.team));
  for (const row of evo.rows.filter((r) => !r.retired)) {
    assert.deepEqual(row.pts, pointsProgression(row.team, pg2).map((p) => p.pts), row.team);
  }
  const batan = evo.rows.at(-1);
  assert.deepEqual([batan.team, batan.retired], ['CD Batán', true]);
  assert.ok(batan.pts.every((v) => v === null) && batan.pos.every((v) => v === null), 'el retirado no tiene línea ni puesto');
  assert.equal(evo.rows.find((r) => r.team === 'Las Mesas Hu.').pts.at(-1), 31, 'sin los 2 partidos contra Batán');
});

test('groupProgression: el puesto tras cada jornada, por puntos, diferencia de goles, goles a favor y nombre', () => {
  const evo = groupProgression(groupOf('PG2'));
  const pos = (team) => evo.rows.find((r) => r.team === team).pos.slice(0, 7);
  assert.deepEqual(pos('Unión Viera'), [3, 1, 1, 1, 2, 5, 5]);
  assert.deepEqual(pos('Acodetti'), [1, 2, 2, 2, 1, 1, 1]);
  assert.deepEqual(pos('Las Mesas Hu.'), [5, 8, 8, 8, 8, 8, 8]);
  // Cada jornada jugada, del 1 al 14 sin repetir (el retirado no cuenta).
  for (let i = 0; i < evo.played; i++) {
    assert.deepEqual(evo.rows.filter((r) => !r.retired).map((r) => r.pos[i]).sort((a, b) => a - b), Array.from({ length: 14 }, (_, k) => k + 1), `jornada ${i + 1}`);
  }
});

test('groupProgression: a mitad de temporada, null en las jornadas por jugar; sin jornadas, nada', () => {
  const evo = groupProgression(groupOf('PG2', datasetsFor({ current: currentAt('2026-03-01') })));
  assert.equal(evo.played, 17, 'la jornada 17, la última con algún resultado');
  const mine = evo.rows.find((r) => r.team === 'Las Mesas Hu.');
  assert.deepEqual(mine.pts.slice(15, 18), [18, 18, null]);
  assert.ok(mine.pos[16] > 0);
  assert.equal(mine.pos[17], null);
  const empty = fixture('current-2025-2026');
  empty.history.PG2 = {};
  const none = groupProgression(groupOf('PG2', datasetsFor({ current: empty })));
  assert.deepEqual([none.rounds, none.played], [[], 0]);
  assert.equal(none.rows.length, 15, 'los equipos de la clasificación, sin datos');
});

test('groupProgression: sin clasificación, los equipos del calendario en el orden del último puesto calculado', () => {
  const current = fixture('current-2025-2026');
  current.prebenjamin.find((g) => g.id === 'PG3').standings = [];
  const evo = groupProgression(groupOf('PG3', datasetsFor({ current })));
  assert.equal(evo.rows.length, 14);
  assert.deepEqual(evo.rows.map((r) => r.pos.at(-1)), Array.from({ length: 14 }, (_, k) => k + 1));
});

// ── competitionRound ─────────────────────────────────────────────────────

test('competitionRound: el número de la jornada por defecto del grupo de mi equipo; si no está, la más repetida', () => {
  const at = (today) => {
    const model = modelOf(datasetsFor({ current: currentAt(today) }));
    return (id) => model.group(PORTAL_SEASON, id);
  };
  // El 1 de febrero, PG2 va por la jornada 13 y PG3 por la 14 (defaultRound, por fecha).
  const feb = at('2026-02-01');
  assert.deepEqual([defaultRound(feb('PG2'), '2026-02-01').n, defaultRound(feb('PG3'), '2026-02-01').n], [13, 14]);
  const gc = [feb('PG2'), feb('PG3')];
  assert.equal(competitionRound(gc, '2026-02-01', 'PG3'), 14, 'la de mi grupo');
  assert.equal(competitionRound(gc, '2026-02-01', 'PG2'), 13);
  assert.equal(competitionRound(gc, '2026-02-01', null), 13, 'sin mi grupo, a igualdad, la menor');
  assert.equal(competitionRound(gc, '2026-02-01', 'A1'), 13, 'mi grupo no es de esta lista');
  // El 15 de abril: A1 y B1 por la 17 y A2 por la 14 (un aplazado): manda la más repetida.
  const apr = at('2026-04-15');
  assert.equal(competitionRound([apr('A2'), apr('A1'), apr('B1')], '2026-04-15', null), 17);
  assert.equal(competitionRound([], '2026-04-15', null), null);
});
