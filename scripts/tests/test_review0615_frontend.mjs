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

test('unifiedPrebenLeagueGroups no mezcla islas: una sola competición', async () => {
  const { unifiedPrebenLeagueGroups } = await import('../../src/state.js');
  // 2025-26: al entrar el prebenjamín insular, 'PFV*' ordena antes que 'PG*' y
  // la tabla unificada la encabezaba Fuerteventura, comparando equipos de islas
  // distintas que no se cruzan nunca.
  const fila = n => Array.from({ length: n }, (_, i) => [i + 1, 'E' + i, 10 - i, 5]);
  const PRE = [
    { id: 'PCC1', phase: 'Copa de Campeones', standings: fila(8) },
    { id: 'PFV1', phase: 'Fuerteventura', standings: fila(7) },
    { id: 'PFV2', phase: 'Fuerteventura', standings: fila(7) },
    { id: 'PFV3', phase: 'Fuerteventura', standings: fila(7) },
    { id: 'PG1', phase: 'Gran Canaria', standings: fila(15) },
    { id: 'PG2', phase: 'Gran Canaria', standings: fila(15) },
    { id: 'PG3', phase: 'Gran Canaria', standings: fila(14) },
    { id: 'PLZ1', phase: 'Lanzarote', standings: fila(5) },
    { id: 'PLZ2', phase: 'Lanzarote', standings: fila(4) },
  ];
  assert.deepEqual(unifiedPrebenLeagueGroups(PRE).map(x => x.id), ['PG1', 'PG2', 'PG3']);
});

test('unifiedPrebenLeagueGroups con una sola competición la devuelve entera', async () => {
  const { unifiedPrebenLeagueGroups } = await import('../../src/state.js');
  const PRE = [
    { id: 'PG1', phase: 'Gran Canaria', standings: [[1, 'A', 10, 5]] },
    { id: 'PG2', phase: 'Gran Canaria', standings: [[1, 'B', 9, 5]] },
  ];
  assert.deepEqual(unifiedPrebenLeagueGroups(PRE).map(x => x.id), ['PG1', 'PG2']);
});

test('unifiedPrebenLeagueGroups aguanta vacío y sin standings', async () => {
  const { unifiedPrebenLeagueGroups } = await import('../../src/state.js');
  assert.deepEqual(unifiedPrebenLeagueGroups([]), []);
  assert.deepEqual(unifiedPrebenLeagueGroups(null), []);
  assert.equal(unifiedPrebenLeagueGroups([{ id: 'PG1', phase: 'GC' }]).length, 1);
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

test('buildKnockoutBracket marca el avance por penaltis (matchAdvancer + pen)', () => {
  const s = src('render.js');
  // matchAdvancer prefiere la 6ª columna explícita y cae a bracketDrawAdvancer
  // para los datos históricos que no la tienen.
  assert.match(s, /matchAdvancer\(/, 'el bracket debe resolver el avance en empates');
  assert.match(s, /pen/i, 'debe indicar "(pen)" en empates resueltos');
  const st = src('state.js');
  assert.match(st, /bracketDrawAdvancer\(/,
    'matchAdvancer debe conservar la deducción por ronda posterior');
});

test('buildUnifiedPrebenjamin filtra cups (usa unifiedPrebenLeagueGroups)', () => {
  const s = src('state.js');
  assert.match(s, /unifiedPrebenLeagueGroups\(/, 'buildUnifiedPrebenjamin debe filtrar grupos de liga');
  // ya no debe iterar PREBENJAMIN.forEach numerando por idx con corte >3
  assert.doesNotMatch(s, /PREBENJAMIN\.forEach\(\(g, idx\) => \{[\s\S]{0,120}groupNum > 3/);
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
test('buildKnockoutBracket renderiza tabla para cups round-robin', () => {
  const s = src('render.js');
  assert.match(s, /isRoundRobinCup\(/, 'buildKnockoutBracket debe usar isRoundRobinCup para elegir tabla vs bracket');
});

/* Campeón de un cuadro sin clasificación (Maspalomas Cup: grupos que son
 * bracket puro, standings vacío). Antes la cabecera decía "0 equipos" y la
 * final decidida en penaltis se quedaba sin campeón: bracketDrawAdvancer mira
 * quién aparece en la ronda SIGUIENTE, y después de la final no hay ninguna. */

test('matchAdvancer: la 6ª columna manda sobre la deducción', async () => {
  const { matchAdvancer } = await import('../../src/state.js');
  const jornadas = { 'F': [['27/06', 'A', 'B', 2, 2, 'away']] };
  const rounds = ['F'];
  assert.equal(matchAdvancer(jornadas.F[0], jornadas, rounds, 0), 'away');
  // Marcador decisivo: gana quien marcó más, la columna no hace falta.
  assert.equal(matchAdvancer(['27/06', 'A', 'B', 3, 1], jornadas, rounds, 0), 'home');
  assert.equal(matchAdvancer(['27/06', 'A', 'B', 0, 1], jornadas, rounds, 0), 'away');
  // Sin jugar no avanza nadie.
  assert.equal(matchAdvancer(['27/06', 'A', 'B', null, null], jornadas, rounds, 0), null);
});

test('matchAdvancer: sin 6ª columna sigue deduciendo del cuadro (histórico)', async () => {
  const { matchAdvancer } = await import('../../src/state.js');
  const jornadas = {
    'S': [['26/06', 'A', 'B', 1, 1], ['26/06', 'C', 'D', 2, 0]],
    'F': [['27/06', 'B', 'C', 3, 0]],
  };
  const rounds = ['S', 'F'];
  // A-B empatan; B aparece en la final → pasó B.
  assert.equal(matchAdvancer(jornadas.S[0], jornadas, rounds, 0), 'away');
});

test('bracketChampion: sale del ganador de la final, penaltis incluidos', async () => {
  const { bracketChampion } = await import('../../src/state.js');
  const conPenaltis = { 'F': [['27/06', 'AD Huracán A', 'UD Vecindario A', 2, 2, 'away']] };
  assert.equal(bracketChampion(conPenaltis, ['F']), 'UD Vecindario A');
  const conMarcador = { 'F': [['27/06', 'Gáldar CF', 'CD Jovero', 7, 2]] };
  assert.equal(bracketChampion(conMarcador, ['F']), 'Gáldar CF');
});

test('bracketChampion: null cuando la última ronda no decide', async () => {
  const { bracketChampion } = await import('../../src/state.js');
  // Empate sin dato de penaltis ni ronda posterior: no inventamos campeón.
  assert.equal(bracketChampion({ 'F': [['27/06', 'A', 'B', 1, 1]] }, ['F']), null);
  // Última ronda con varios partidos (liguilla): no es una final.
  assert.equal(bracketChampion({ 'R': [['1/06','A','B',1,0], ['1/06','C','D',2,0]] }, ['R']), null);
  // Final sin jugar.
  assert.equal(bracketChampion({ 'F': [['27/06', 'A', 'B', null, null]] }, ['F']), null);
  assert.equal(bracketChampion({}, []), null);
});

/* ─── countMatches: el chip "N partidos" de la stats-bar ───────────────────
 * Bug encontrado en la revisión 25/07: en la temporada ACTUAL los grupos solo
 * llevan la última jornada inline (el resto vive en HISTORY), así que la suma
 * ingenua daba 78 partidos en prebenjamín. El parche previo sustituía el total
 * por HIST_MATCHES pero SOLO para benjamín, y HIST_MATCHES es el total de LAS
 * DOS categorías: benjamín inflaba (2705 en vez de 2126) y prebenjamín
 * contaba una jornada. */

test('countMatches: la temporada actual cuenta desde HISTORY, no la jornada inline', async () => {
  const { countMatches } = await import('../../src/state.js');
  const grupos = [{ id: 'A1', matches: [1, 2, 3] }];           // solo la última jornada
  const HIST = { A1: { J1: [1, 2, 3], J2: [1, 2, 3], J3: [1, 2] } };
  assert.equal(countMatches(grupos, HIST), 8);
  // Sin HISTORY (histórica) el per-season file ya trae todo inline.
  assert.equal(countMatches(grupos, null), 3);
});

test('countMatches: los grupos que no pasan por la DB cuentan sus partidos inline', async () => {
  const { countMatches } = await import('../../src/state.js');
  // La Maspalomas Cup no está en HISTORY y lleva todos sus partidos inline:
  // si se ignorasen, desaparecerían del recuento.
  const grupos = [
    { id: 'A1', matches: [1] },
    { id: 'MCB1', matches: [1, 2, 3, 4, 5, 6] },
  ];
  const HIST = { A1: { J1: [1, 2, 3, 4] } };
  assert.equal(countMatches(grupos, HIST), 10);
});

test('countMatches: cuadros sin lista matches suman por jornadas', async () => {
  const { countMatches } = await import('../../src/state.js');
  const grupos = [{ id: 'MCBK1', jornadas: { Previa: [1, 2], Final: [1] } }];
  assert.equal(countMatches(grupos, null), 3);
});

test('countMatches: tolera entradas vacías', async () => {
  const { countMatches } = await import('../../src/state.js');
  assert.equal(countMatches([], null), 0);
  assert.equal(countMatches(null, null), 0);
  assert.equal(countMatches([{ id: 'X', standings: [] }], null), 0);
});

test('countStats ya no usa el atajo HIST_MATCHES solo-benjamín', () => {
  const s = src('state.js');
  assert.doesNotMatch(s, /S\.cat === 'benjamin' && typeof HIST_MATCHES/,
    'el recuento debe ser por categoría, no un total global para benjamín');
  assert.match(s, /countMatches\(data, hist\)/);
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

test('phaseIcon: las fases insulares de nombre largo dejan de caer al genérico', async () => {
  const { phaseIcon } = await import('../../src/state.js');
  // Nombres exactos: sin cambios.
  assert.equal(phaseIcon('Primera Fase GC'), '🏟️');
  assert.equal(phaseIcon('Segunda Fase A'), '🏆');
  assert.equal(phaseIcon('Fuerteventura'), '🏝️');
  // Por palabra clave (antes todas ⚽).
  assert.equal(phaseIcon('Fase 1 Fuerteventura'), '🏝️');
  assert.equal(phaseIcon('Primera Lanzarote'), '🌋');
  assert.equal(phaseIcon('Preferente Lanzarote'), '🌋');
  assert.equal(phaseIcon('Copa de Campeones'), '🏆');
  assert.equal(phaseIcon('Copa Cabildo Primera Lanzarote'), '🏆');
  // Sin coincidencia: genérico.
  assert.equal(phaseIcon('Fase Rara'), '⚽');
  assert.equal(phaseIcon(''), '⚽');
  assert.equal(phaseIcon(null), '⚽');
});

test('groupJornadaLabel unifica el badge entre fuentes', async () => {
  const { groupJornadaLabel } = await import('../../src/state.js');
  // futbolaspalmas guarda 'Jornada 30'; FIFLP el número pelado.
  assert.equal(groupJornadaLabel('14'), 'Jornada 14');
  assert.equal(groupJornadaLabel('Jornada 30'), 'Jornada 30');
  assert.equal(groupJornadaLabel(''), '');
  assert.equal(groupJornadaLabel(null), '');
  // Las rondas de copa no son números y se dejan tal cual.
  assert.equal(groupJornadaLabel('Semifinales'), 'Semifinales');
});

test('la cabecera de grupo usa groupJornadaLabel, no el valor crudo', () => {
  const s = src('render.js');
  assert.match(s, /jornada-badge">\$\{escapeHtml\(groupJornadaLabel\(g\.jornada\)\)\}/);
});

test('renderSection confiesa el fallo de temporada en TODAS las secciones', () => {
  const s = src('render.js');
  // Antes solo lo comprobaba renderClasif: ESTADÍSTICAS pintaba 0 partidos y 0
  // goles como si fuera el récord real de esa temporada.
  const i = s.indexOf('export function renderSection');
  const bloque = s.slice(i, i + 1200);
  assert.match(bloque, /seasonErrorBox\(\)/,
    'renderSection debe comprobar el error antes de despachar la sección');
  assert.match(bloque, /return;/);
});

test('POR ISLA abre la ficha de equipo: los nombres no son decorativos', () => {
  const s = src('render.js');
  const i = s.indexOf('export function renderIsla');
  const bloque = s.slice(i, s.indexOf('/* ====== STATS SECTION', i));
  assert.match(bloque, /delegateActivation\(container, '\.team-name-cell'/,
    'renderIsla debe delegar la activación como renderClasif (ratón y teclado)');
  assert.match(bloque, /openTeamDetail\(td\.dataset\.team, td\.dataset\.group\)/);
});

test('el modal busca el grupo en las dos categorías', () => {
  const s = src('modals.js');
  // MI EQUIPO es la pantalla de aterrizaje y su equipo puede ser de la otra
  // categoría: con S.cat a secas, el modal salía sin grupo ni comparativa.
  assert.match(s, /porCategoria\(otra\)/);
});
