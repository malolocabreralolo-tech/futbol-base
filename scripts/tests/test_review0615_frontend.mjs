/**
 * Node test runner — fixes frontend de la revisión 2026-06-15.
 * Run: node --test scripts/tests/test_review0615_frontend.mjs
 *
 * Quedan las funciones de state.js que usa el modelo del rediseño: las etiquetas
 * de ronda, el detector de copa y liguilla o cuadro. validJorGroup,
 * knockoutRoundsSource, unifiedPrebenLeagueGroups, countStats, phaseIcon y
 * groupJornadaLabel se fueron con sus pruebas en la revisión final de B2 (M5);
 * countMatches, matchAdvancer, bracketDrawAdvancer y bracketChampion, en B5
 * (decisión 6): nada de src/ las usaba. Quién pasó y el campeón de un cuadro son
 * bracket(), de model.js, con sus pruebas en test_rediseno_copa.mjs.
 */

import { test } from 'node:test';
import { strict as assert } from 'node:assert';

/* ─── Etiqueta de ronda por NOMBRE explícito (no por posición) ─────────────
 * Las rondas salían intercambiadas (Final↔Semifinales) cuando el orden era
 * alfabético. La etiqueta debe venir del nombre en la clave ("( Final )"),
 * order-independiente; el orden de columnas lo arregla _jornada_sort_key. */

test('knockoutRoundLabel: usa el nombre explícito (order-independiente)', async () => {
  const { knockoutRoundLabel } = await import('../../src/state.js');
  assert.equal(knockoutRoundLabel('10-06-2026 ( Cuartos )', 0, 3), 'Cuartos');
  assert.equal(knockoutRoundLabel('10-06-2026 ( Semifinales )', 1, 3), 'Semifinales');
  assert.equal(knockoutRoundLabel('10-06-2026 ( Final )', 2, 3), 'Final');
  // aunque la posición fuese errónea, la etiqueta sale del nombre
  assert.equal(knockoutRoundLabel('10-06-2026 ( Final )', 1, 3), 'Final');
  // "Semifinales" contiene "final" pero NO debe etiquetarse Final
  assert.equal(knockoutRoundLabel('( Semifinales )', 0, 2), 'Semifinales');
});

test('knockoutRoundLabel: la ronda Previa se etiqueta por nombre, no cruda', async () => {
  const { knockoutRoundLabel } = await import('../../src/state.js');
  // Maspalomas Cup: cuadro de 34 equipos → 2 eliminatorias previas. Sin este
  // caso el label caía al fallback y se pintaba literal "( Previa )".
  assert.equal(knockoutRoundLabel('26-06-2026 ( Previa )', 0, 6), 'Previa');
  // La posición (fromEnd = 5) no la debe reetiquetar como ronda numerada.
  assert.notEqual(knockoutRoundLabel('26-06-2026 ( Previa )', 0, 6), 'Ronda 6');
});

test('knockoutRoundLabel: cups "Ronda N" (2024-25) usan posición → Cuartos/Semis/Final', async () => {
  const { knockoutRoundLabel } = await import('../../src/state.js');
  // bracket de 3 rondas "Ronda 1/2/3 Ida": idx1 → Semifinales (no "Ronda 2")
  assert.equal(knockoutRoundLabel('08-06-2025 ( Ronda 1 Ida )', 0, 3), 'Cuartos');
  assert.equal(knockoutRoundLabel('09-06-2025 ( Ronda 2 Ida )', 1, 3), 'Semifinales');
  assert.equal(knockoutRoundLabel('10-06-2025 ( Ronda 3 Ida )', 2, 3), 'Final');
  // bracket profundo (>4 rondas): cae a "Ronda N"
  assert.equal(knockoutRoundLabel('( Ronda 5 )', 0, 6), 'Ronda 5');
});

/* ─── H1: detector de copa por código o fase (groupKind de model.js lo usa) ─ */

test('isCupGroup detecta cups por código/fase', async () => {
  const { isCupGroup } = await import('../../src/state.js');
  assert.equal(isCupGroup({ id: 'PCC1', phase: 'Copa de Campeones' }), true);
  assert.equal(isCupGroup({ id: 'BCA1', phase: 'Copa de Campeones' }), true);
  assert.equal(isCupGroup({ id: 'PG3', phase: 'Gran Canaria' }), false);
  assert.equal(isCupGroup({ id: 'A1', phase: 'Segunda Fase A' }), false);
});

// ── Copa de Campeones 2023-24: grupos round-robin (1 ronda, >2 partidos) ──
// Deben renderizarse como TABLA de clasificación, NO como bracket (que
// knockoutRoundLabel etiquetaría "Final" por posición — bug). Los cups
// multi-ronda (2024-25/2025-26) siguen siendo brackets.
test('isRoundRobinCup: 1 ronda con >2 partidos → true (grupo liguilla)', async () => {
  const { isRoundRobinCup } = await import('../../src/state.js');
  const rr = { '14-06-2024 ( Ronda 1 )': [['','A','B',1,0,''],['','C','D',2,1,''],['','A','C',3,0,'']] };
  assert.equal(isRoundRobinCup(rr), true);
});
test('isRoundRobinCup: multi-ronda → false (bracket de verdad)', async () => {
  const { isRoundRobinCup } = await import('../../src/state.js');
  const bracket = {
    '08-06-2025 ( Ronda 1 )': [['','A','B',1,0,''],['','C','D',2,1,'']],
    '08-06-2025 ( Ronda 2 )': [['','A','C',1,0,'']],
  };
  assert.equal(isRoundRobinCup(bracket), false);
});
test('isRoundRobinCup: 1 ronda con 1 partido (una final suelta) → false', async () => {
  const { isRoundRobinCup } = await import('../../src/state.js');
  assert.equal(isRoundRobinCup({ '( Final )': [['','A','B',1,0,'']] }), false);
  assert.equal(isRoundRobinCup({}), false);
  assert.equal(isRoundRobinCup(null), false);
});
/* Copas insulares 2023-24 (Lanzarote / Fuerteventura): se llaman "Copa" pero
 * son LIGUILLAS de jornadas numeradas con clasificación completa, no cuadros.
 * isKnockoutGroup las marca como copa por la fase, así que sin esto se
 * pintarían como un bracket de varias columnas con etiquetas inventadas
 * (Cuartos/Semis/Final por posición). Un cuadro es un EMBUDO: la última ronda
 * tiene menos partidos que la primera. */

test('isRoundRobinCup: liguilla multi-jornada de tamaño constante → tabla', async () => {
  const { isRoundRobinCup } = await import('../../src/state.js');
  const liguilla = {
    'J1': [['','A','B',1,0],['','C','D',2,1],['','E','F',0,0],['','G','H',3,1]],
    'J2': [['','A','C',1,0],['','B','D',2,1],['','E','G',0,0],['','F','H',3,1]],
    'J3': [['','A','D',1,0],['','B','C',2,1],['','E','H',0,0],['','F','G',3,1]],
  };
  assert.equal(isRoundRobinCup(liguilla), true);
});

test('isRoundRobinCup: los cuadros reales del proyecto siguen siendo cuadros', async () => {
  const { isRoundRobinCup } = await import('../../src/state.js');
  const r = n => Array.from({ length: n }, () => ['','A','B',1,0]);
  // 2024-25 y 2025-26 (BCA1…, PCC1) y Maspalomas Cup 2026
  assert.equal(isRoundRobinCup({ a: r(2), b: r(2), c: r(1) }), false);
  assert.equal(isRoundRobinCup({ a: r(4), b: r(2), c: r(1) }), false);
  assert.equal(isRoundRobinCup({ a: r(2), b: r(16), c: r(8), d: r(4), e: r(2), f: r(1) }), false);
});

test('isRoundRobinCup: un cuadro a medio jugar no se confunde con liguilla', async () => {
  const { isRoundRobinCup } = await import('../../src/state.js');
  const r = n => Array.from({ length: n }, () => ['','A','B',1,0]);
  // Cuartos jugados, semifinales en curso, final aún sin aparecer.
  assert.equal(isRoundRobinCup({ cuartos: r(4), semis: r(2) }), false);
});

