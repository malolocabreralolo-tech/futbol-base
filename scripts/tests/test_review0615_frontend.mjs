/**
 * Node test runner — fixes frontend de la revisión 2026-06-15.
 * Run: node --test scripts/tests/test_review0615_frontend.mjs
 *
 * #9: pestaña JORNADAS en blanco al cambiar a temporada histórica. S.jorGroup
 *     conservaba un código de la temporada ACTUAL ('A2'/'PG2') que no existe
 *     en los grupos históricos (GC1..GC12) -> getData().find(...) undefined ->
 *     return mudo -> panel vacío. Fix: validJorGroup (puro) valida pertenencia
 *     y cae al primer grupo; + empty-state en vez de return mudo.
 */

import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const src = f => readFileSync(join(ROOT, 'src', f), 'utf8');

test('validJorGroup mantiene el grupo si existe en la temporada activa', async () => {
  const { validJorGroup } = await import('../../src/state.js');
  assert.equal(validJorGroup('A2', [{ id: 'A1' }, { id: 'A2' }, { id: 'B1' }]), 'A2');
});

test('validJorGroup cae al primero si el grupo es stale (cambio a histórica)', async () => {
  const { validJorGroup } = await import('../../src/state.js');
  // S.jorGroup='A2' de la actual; la histórica solo tiene GC1..GC12
  assert.equal(validJorGroup('A2', [{ id: 'GC1' }, { id: 'GC2' }]), 'GC1');
});

test('validJorGroup cae al primero si no había grupo previo', async () => {
  const { validJorGroup } = await import('../../src/state.js');
  assert.equal(validJorGroup('', [{ id: 'X' }]), 'X');
  assert.equal(validJorGroup(null, [{ id: 'X' }]), 'X');
});

test('validJorGroup devuelve "" si no hay grupos', async () => {
  const { validJorGroup } = await import('../../src/state.js');
  assert.equal(validJorGroup('A2', []), '');
});

test('renderJornadas valida jorGroup con validJorGroup (no solo si falsy)', () => {
  const s = src('render.js');
  assert.match(s, /validJorGroup\(\s*S\.jorGroup\s*,\s*data\s*\)/,
    'renderJornadas debe normalizar S.jorGroup vía validJorGroup');
});

test('renderJornadaContent emite empty-state si el grupo no existe (no return mudo)', () => {
  const s = src('render.js');
  // tras resolver group, si no existe debe pintar empty-state en matchesDiv
  assert.match(
    s,
    /const group = getData\(\)\.find[\s\S]{0,200}empty-state/,
    'renderJornadaContent debe pintar empty-state cuando el grupo no se encuentra',
  );
});

/* ─── Cups 2025-26: bracket de knockout en temporada actual ───────────────
 * buildKnockoutBracket leía g.jornadas, ausente en grupos de temporada actual
 * (sus rondas viven en HISTORY[code], como toda la temporada actual). Las cups
 * 2025-26 (BCA1/BCB1/BCC1/PCC1) salían "Sin partidos registrados". Fuente de
 * rondas extraída a knockoutRoundsSource (puro). */

test('knockoutRoundsSource: histórica usa g.jornadas inline (per-season file)', async () => {
  const { knockoutRoundsSource } = await import('../../src/state.js');
  const g = { id: 'BCA1', jornadas: { Final: [['', 'A', 'B', 1, 0, '']] } };
  assert.deepEqual(knockoutRoundsSource(g, true, { BCA1: { X: [] } }), g.jornadas);
});

test('knockoutRoundsSource: actual cae a HISTORY[code] (cup sin jornadas inline)', async () => {
  const { knockoutRoundsSource } = await import('../../src/state.js');
  const g = { id: 'BCA1', standings: [] };
  const HIST = { BCA1: { '06-06-2026 ( Final )': [['', 'ACODETTI', 'PALMAS', 0, 1, '']] } };
  assert.deepEqual(knockoutRoundsSource(g, false, HIST), HIST.BCA1);
});

test('knockoutRoundsSource: histórica sin jornadas NO usa HISTORY (colisión de código)', async () => {
  const { knockoutRoundsSource } = await import('../../src/state.js');
  assert.deepEqual(knockoutRoundsSource({ id: 'BCA1' }, true, { BCA1: { X: [] } }), {});
});

test('knockoutRoundsSource: {} si no hay fuente', async () => {
  const { knockoutRoundsSource } = await import('../../src/state.js');
  assert.deepEqual(knockoutRoundsSource({ id: 'Z' }, false, null), {});
});

test('buildKnockoutBracket usa knockoutRoundsSource (cups actuales renderizan)', () => {
  const s = src('render.js');
  assert.match(s, /knockoutRoundsSource\(/, 'buildKnockoutBracket debe usar knockoutRoundsSource');
  assert.doesNotMatch(s, /const rounds = g\.jornadas \? Object\.keys/,
    'ya no debe leer g.jornadas directo para las rondas');
});

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

test('knockoutRoundLabel: cups "Ronda N" (2024-25) usan posición → Cuartos/Semis/Final', async () => {
  const { knockoutRoundLabel } = await import('../../src/state.js');
  // bracket de 3 rondas "Ronda 1/2/3 Ida": idx1 → Semifinales (no "Ronda 2")
  assert.equal(knockoutRoundLabel('08-06-2025 ( Ronda 1 Ida )', 0, 3), 'Cuartos');
  assert.equal(knockoutRoundLabel('09-06-2025 ( Ronda 2 Ida )', 1, 3), 'Semifinales');
  assert.equal(knockoutRoundLabel('10-06-2025 ( Ronda 3 Ida )', 2, 3), 'Final');
  // bracket profundo (>4 rondas): cae a "Ronda N"
  assert.equal(knockoutRoundLabel('( Ronda 5 )', 0, 6), 'Ronda 5');
});

test('buildKnockoutBracket usa knockoutRoundLabel', () => {
  const s = src('render.js');
  assert.match(s, /knockoutRoundLabel\(/, 'debe usar knockoutRoundLabel para las etiquetas');
});

/* ─── H1: la copa prebenjamín (PCC1) no debe romper la clasificación unificada ─
 * PCC1 ordena antes que PG1 en PREBENJAMIN; buildUnifiedPrebenjamin numeraba
 * por posición y cortaba en >3 → PG3 (14 equipos) desaparecía y un equipo de
 * copa encabezaba la tabla. Debe filtrar grupos de liga. */

test('isCupGroup detecta cups por código/fase', async () => {
  const { isCupGroup } = await import('../../src/state.js');
  assert.equal(isCupGroup({ id: 'PCC1', phase: 'Copa de Campeones' }), true);
  assert.equal(isCupGroup({ id: 'BCA1', phase: 'Copa de Campeones' }), true);
  assert.equal(isCupGroup({ id: 'PG3', phase: 'Gran Canaria' }), false);
  assert.equal(isCupGroup({ id: 'A1', phase: 'Segunda Fase A' }), false);
});

test('unifiedPrebenLeagueGroups excluye cups y conserva PG3', async () => {
  const { unifiedPrebenLeagueGroups } = await import('../../src/state.js');
  const PRE = [
    { id: 'PCC1', phase: 'Copa de Campeones', standings: [[1, 'X', 6, 2]] },
    { id: 'PG1', phase: 'Gran Canaria', standings: [[1, 'A', 10, 5]] },
    { id: 'PG2', phase: 'Gran Canaria', standings: [[1, 'B', 9, 5]] },
    { id: 'PG3', phase: 'Gran Canaria', standings: [[1, 'C', 8, 5]] },
  ];
  assert.deepEqual(unifiedPrebenLeagueGroups(PRE).map(x => x.id), ['PG1', 'PG2', 'PG3']);
});

/* ─── M4: empates por penaltis muestran quién avanzó ─────────────────────── */

test('bracketDrawAdvancer: el que aparece en ronda posterior avanzó', async () => {
  const { bracketDrawAdvancer } = await import('../../src/state.js');
  const jor = { C: [['', 'A', 'B', 1, 1]], S: [['', 'B', 'X', 0, 3]] };
  assert.equal(bracketDrawAdvancer(jor, ['C', 'S'], 0, 'A', 'B'), 'away');
  assert.equal(bracketDrawAdvancer(jor, ['C', 'S'], 0, 'B', 'A'), 'home');
});

test('bracketDrawAdvancer: null si ninguno aparece después (final)', async () => {
  const { bracketDrawAdvancer } = await import('../../src/state.js');
  assert.equal(bracketDrawAdvancer({ F: [['', 'A', 'B', 2, 2]] }, ['F'], 0, 'A', 'B'), null);
});

test('buildKnockoutBracket marca el avance por penaltis (bracketDrawAdvancer + pen)', () => {
  const s = src('render.js');
  assert.match(s, /bracketDrawAdvancer\(/, 'el bracket debe resolver el avance en empates');
  assert.match(s, /pen/i, 'debe indicar "(pen)" en empates resueltos');
});

test('buildUnifiedPrebenjamin filtra cups (usa unifiedPrebenLeagueGroups)', () => {
  const s = src('state.js');
  assert.match(s, /unifiedPrebenLeagueGroups\(/, 'buildUnifiedPrebenjamin debe filtrar grupos de liga');
  // ya no debe iterar PREBENJAMIN.forEach numerando por idx con corte >3
  assert.doesNotMatch(s, /PREBENJAMIN\.forEach\(\(g, idx\) => \{[\s\S]{0,120}groupNum > 3/);
});
