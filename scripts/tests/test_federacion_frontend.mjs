// Datos de la federación en el frontend (2026-10): goleadores sin nombre publicado.
import test from 'node:test';
import assert from 'node:assert/strict';
import { playerName } from '../../src/model.js';
import { groupScorers, teamScorers, categoryScorers } from '../../src/state.js';

test('un goleador sin nombre publicado se dice así y cuenta en la lista', () => {
  assert.equal(playerName('#PG2-1'), 'Sin nombre publicado');
  assert.equal(playerName('MORENO MEDEROS, JAVIER'), 'Javier Moreno Mederos');
  const gol = [{ id: 'A2', g: 'X', s: [['GARCIA, ENRIQUE', 'Las Mesas Hu.', 2, 20], ['#A2-1', 'Las Mesas Hu.', 27, 23]] }];
  const team = teamScorers(gol, { groupId: 'A2', name: 'Las Mesas Hu.' });
  assert.deepEqual(team.map(s => [playerName(s.name), s.goals]), [['Sin nombre publicado', 27], ['Enrique Garcia', 2]]);
  assert.equal(groupScorers(gol, 'A2')[0].goals, 27);
  // Dos sin nombre del mismo equipo en grupos distintos no se suman: claves distintas.
  const two = [{ id: 'A2', s: [['#A2-1', 'Las Mesas Hu.', 5, 3]] }, { id: 'FF5', s: [['#FF5-1', 'Las Mesas Hu.', 4, 3]] }];
  assert.equal(categoryScorers(two).length, 2);
});

// Delegados del acta de la federación en Partido (delH/delA del generador).
import { fixture } from './fixtures/rediseno/load.mjs';
import { datasetsFrom as baseDatasets, seasonLineups } from './fixtures/rediseno/simulate.mjs';
import { ctxFor } from './fixtures/rediseno/screens.mjs';
import { screen } from '../../src/screen-partido.js';

test('Partido: los delegados del acta, solo si constan', () => {
  const lineups = structuredClone(fixture('lineups-2025-2026'));
  const key = Object.keys(lineups).find(k => k.startsWith('Unión Viera|Santidad|'));
  assert.ok(key, 'la fixture trae el acta de A1 J3');
  lineups[key].delH = { equipo: 'PEREZ GARCIA, ANA', campo: 'LOPEZ DIAZ, LUIS' };
  const datasets = baseDatasets(fixture('current-2025-2026'), {
    golBenj: [], golPrebenj: [], seasons: [{ name: '2025-2026', current: true }], matchDetail: fixture('matchdetail'),
    lineups: { ...seasonLineups('2025-2026'), '2025-2026/A1': lineups }, health: fixture('health'),
  });
  const params = { s: '2025-2026', g: 'A1', r: 'Jornada 3', h: 'Unión Viera', a: 'Santidad' };
  const out = String(screen.render(ctxFor('partido', params, { today: '2026-09-23', datasets })));
  const t = out.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
  assert.ok(t.includes('Delegado/a: Ana Perez Garcia'));
  assert.ok(t.includes('Delegado/a de campo: Luis Lopez Diaz'));
  // El visitante no trae delegados: para ellos no se pinta nada (ni «no consta»).
  assert.equal((t.match(/Delegado\/a: /g) || []).length, 1);
});

import { venueUrl, venueDetails } from '../../src/links.js';

test('«Cómo llegar» va a la dirección del directorio de campos si se conoce', () => {
  const campos = { 'Agapito Reyes Viera F-8': ['C. Mosta, 1B', 'Arrecife', 'Hierba Artificial', 'Fútbol 11'] };
  const q = (url) => new URL(url).searchParams.get('query');
  assert.equal(q(venueUrl('Agapito Reyes Viera F-8', 'lanzarote', campos)), 'Agapito Reyes Viera F-8, C. Mosta, 1B, Arrecife, España');
  assert.equal(q(venueUrl('Otro campo', 'lanzarote', campos)), 'Otro campo, Lanzarote, España');
  assert.equal(venueDetails('Agapito Reyes Viera F-8', campos), 'Hierba Artificial · Fútbol 11');
  assert.equal(venueDetails('Otro campo', campos), '');
  assert.equal(venueDetails('x', null), '');
});

import { formStreak } from '../../src/model.js';

test('racha actual: la más fuerte de al menos dos partidos', () => {
  const r = (gf, gc) => ({ gf, gc });
  assert.deepEqual(formStreak([r(0, 2), r(3, 1), r(2, 0), r(4, 1)]), { kind: 'victorias', n: 3 });
  assert.deepEqual(formStreak([r(0, 2), r(1, 1), r(3, 0), r(2, 2)]), { kind: 'sin perder', n: 3 });
  assert.deepEqual(formStreak([r(5, 0), r(0, 1), r(1, 3)]), { kind: 'derrotas', n: 2 });
  assert.equal(formStreak([r(1, 0), r(0, 1)]), null);     // una derrota suelta no es racha
  assert.equal(formStreak([]), null);
});

// Finales, semifinales y torneos de cierre de la federación (temporadas pasadas importadas de la federación):
// copas con su propio nombre, después de las ligas y las copas insulares.
import { competitionKey, groupKind } from '../../src/model.js';
import { isCupGroup } from '../../src/state.js';

test('finales, semifinales y torneos de cierre: copas con su nombre', () => {
  const g = (phase, island = 'lanzarote') => ({ id: 'X1', phase, island, cat: 'benjamin', name: 'Grupo 1' });
  for (const phase of ['Final Liga Primera Lanzarote', 'Semifinal Copa Cabildo Primera Lanzarote', 'Torneo Cierre Prebenjamín', 'Clausura Benjamín']) {
    assert.ok(isCupGroup(g(phase)), phase);
  }
  assert.ok(!isCupGroup(g('Primera Fase GC')) && !isCupGroup(g('Fase 2 Fuerteventura')));
  const final = competitionKey(g('Final Liga Primera Lanzarote'), '2023-2024');
  assert.equal(final.cup, 'final');
  assert.equal(final.label, 'Final Liga Primera Lanzarote');
  assert.notEqual(final.key, competitionKey(g('Final Copa Cabildo Primera Lanzarote'), '2023-2024').key);
  const torneo = competitionKey(g('Torneo Cierre Prebenjamín', 'grancanaria'), '2023-2024');
  assert.deepEqual([torneo.cup, torneo.label], ['torneo', 'Torneo Cierre Prebenjamín']);
  // Una final suelta (una ronda, un partido) es un cuadro; un torneo con jornadas de liguilla, una tabla.
  const m = { home: 'A', away: 'B', hs: 1, as: 0 };
  assert.equal(groupKind(g('Final Liga Primera Lanzarote'), [{ key: 'Jornada 1', matches: [m] }]), 'cup-bracket');
  assert.equal(groupKind(g('Torneo Cierre Prebenjamín'), [{ key: 'Jornada 1', matches: [m, m, m] }, { key: 'Jornada 2', matches: [m, m, m] }]), 'cup-league');
});

// Temporadas archivadas (2017-18 a 2020-21): las semifinales de Lanzarote (meta_by_name les da la fase en
// singular), la Superliga de Fuerteventura (una liga) y la copa prebenjamín de Gran Canaria.
test('archivadas: la «Semifinal …» y la Copa Gran Canaria son copas; la Superliga, una liga', () => {
  assert.ok(isCupGroup({ id: 'LZ1S1', phase: 'Semifinal Liga Primera Lanzarote' }));
  assert.ok(!isCupGroup({ id: 'FVS1', phase: 'Superliga Fuerteventura' }));
  assert.ok(isCupGroup({ id: 'PCGC1', phase: 'Copa Gran Canaria' }));
});

// Grupos archivados con su clasificación oficial y sin partidos (la federación no publicó sus actas):
// una copa así es una liguilla con su tabla, no un cuadro vacío, y el que perdió todos sus partidos no
// es un retirado.
import { buildGroup, retiredTeams } from '../../src/model.js';

test('archivadas sin partidos: la copa con la tabla jugada es una liguilla, y nadie es un retirado', () => {
  const row = (pos, team, pj, g, e, p) => [pos, team, 3 * g + e, pj, g, e, p, 3 * g, 2 * p, 3 * g - 2 * p];
  const table = [row(1, 'CD Herbania', 8, 6, 2, 0), row(2, 'Peña Amistad', 8, 4, 1, 3), row(3, 'CD Corralejo D', 8, 0, 0, 8)];
  const cfv1 = { id: 'CFV1', name: 'Grupo 1', phase: 'Copa Fuerteventura', island: 'fuerteventura', standings: table, jornadas: {} };
  assert.equal(groupKind(cfv1, []), 'cup-league');
  assert.equal(groupKind({ ...cfv1, id: 'PCGC1', phase: 'Copa Gran Canaria' }, []), 'cup-league');
  // Con la tabla a cero (una copa que no ha empezado) o sin ella, el cuadro de siempre.
  assert.equal(groupKind({ ...cfv1, standings: table.map((r) => [r[0], r[1], 0, 0, 0, 0, 0, 0, 0, 0]) }, []), 'cup-bracket');
  assert.equal(groupKind({ ...cfv1, standings: [] }, []), 'cup-bracket');
  const group = buildGroup(cfv1, { season: '2018-2019', cat: 'benjamin' });
  assert.equal(group.kind, 'cup-league');
  assert.deepEqual(group.standings.map((r) => [r.team, r.retired]), [['CD Herbania', false], ['Peña Amistad', false], ['CD Corralejo D', false]]);
  // Una liga sin partidos, igual: sin calendario, no estar en él no hace a nadie retirado.
  const gc2 = buildGroup({ ...cfv1, id: 'GC2', phase: 'Primera Fase GC', island: 'grancanaria' }, { season: '2017-2018', cat: 'benjamin' });
  assert.equal(gc2.kind, 'league');
  assert.equal(retiredTeams(gc2).size, 0);
  // Con calendario, el que no está en él y no ha ganado ni empatado nada sí lo es (spec §5.3).
  const played = buildGroup({ ...cfv1, id: 'GC2', phase: 'Primera Fase GC', jornadas: { 1: [['01-10-2017', 'CD Herbania', 'Peña Amistad', 2, 1, null, '10:00', 'X']] } },
    { season: '2017-2018', cat: 'benjamin' });
  assert.deepEqual([...retiredTeams(played)], ['CD Corralejo D']);
});
