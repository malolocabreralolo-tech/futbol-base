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
import { datasetsFrom as baseDatasets } from './fixtures/rediseno/simulate.mjs';
import { ctxFor } from './fixtures/rediseno/screens.mjs';
import { screen } from '../../src/screen-partido.js';

test('Partido: los delegados del acta, solo si constan', () => {
  const lineups = structuredClone(fixture('lineups-2025-2026'));
  const key = Object.keys(lineups).find(k => k.startsWith('Unión Viera|Santidad|'));
  assert.ok(key, 'la fixture trae el acta de A1 J3');
  lineups[key].delH = { equipo: 'PEREZ GARCIA, ANA', campo: 'LOPEZ DIAZ, LUIS' };
  const datasets = baseDatasets(fixture('current-2025-2026'), {
    golBenj: [], golPrebenj: [], seasons: [{ name: '2025-2026', current: true }], matchDetail: fixture('matchdetail'),
    lineups: { '2025-2026': lineups }, health: fixture('health'),
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
