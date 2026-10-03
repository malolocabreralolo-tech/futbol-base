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
