/**
 * Node test runner — regresiones FE-MODALS (revisión 2026-06-11).
 * Run: node --test scripts/tests/test_femodals_fixes.mjs
 *
 * Cubre:
 *   1. resolveSeasonDataset — colisión de IDs de grupo (A1...) entre la
 *      temporada histórica 2024-2025 y el global HISTORY (temporada actual):
 *      en modo histórico los modales deben leer group.jornadas, NUNCA HISTORY,
 *      y las rachas (STATS, solo temporada actual) deben suprimirse.
 *   2. fillIfCurrent — stale-slot guard para las inserciones asíncronas de
 *      los modales (lineups/cronología/plantilla/histórico cross-season).
 *   3. miequipo — FEATURED.name (no FEATURED.team) y temporada fijada a la
 *      actual (ignora S.season) en la card Plantilla.
 *   4. Escapado — buildGoalsHtml y las interpolaciones señaladas de modals.js.
 *   5. Guard typeof en la lectura de globals de data-*.js (modals.js:71).
 *
 * Los módulos se importan dinámicamente: modals.js debe ser importable sin
 * DOM (typeof document guard) para poder testear sus helpers puros.
 */

import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const src = f => readFileSync(join(ROOT, 'src', f), 'utf8');

/* ─── Fixtures: colisión real de IDs — A1 existe en HISTORY (2025-26) y en
 *     data-season-2024-2025.js con partidos DISTINTOS. ─────────────────── */
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

/* ─── 0. modals.js importable sin DOM ──────────────────────────────────── */

test('modals.js: importable bajo node (typeof document guard en top-level)', async () => {
  const mod = await import('../../src/modals.js');
  assert.equal(typeof mod.openMatchDetail, 'function');
  assert.equal(typeof mod.openTeamDetail, 'function');
});

/* ─── 1. resolveSeasonDataset ──────────────────────────────────────────── */

test('resolveSeasonDataset: temporada histórica seleccionada → group.jornadas, nunca HISTORY (colisión A1)', async () => {
  const { resolveSeasonDataset } = await import('../../src/modals.js');
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

test('resolveSeasonDataset: temporada actual → HISTORY[groupId] + STATS', async () => {
  const { resolveSeasonDataset } = await import('../../src/modals.js');
  const ds = resolveSeasonDataset({ season: '', cat: 'benjamin' }, {
    group: GROUP_2425, groupId: 'A1', history: HISTORY_FIX, stats: STATS_FIX,
  });
  assert.equal(ds.historical, false);
  assert.equal(ds.matchSource, HISTORY_FIX.A1);
  assert.equal(ds.matchSource['Jornada 1'][0][1], 'EQUIPO ACTUAL X');
  assert.equal(ds.stats, STATS_FIX);
});

test('resolveSeasonDataset: actual sin entrada en HISTORY → fallback a group.jornadas (copa)', async () => {
  const { resolveSeasonDataset } = await import('../../src/modals.js');
  const ds = resolveSeasonDataset({ season: '' }, {
    group: GROUP_2425, groupId: 'BCA1', history: HISTORY_FIX, stats: null,
  });
  assert.equal(ds.matchSource, GROUP_2425.jornadas);
});

test('resolveSeasonDataset: histórico sin jornadas / sin grupo → objeto vacío', async () => {
  const { resolveSeasonDataset } = await import('../../src/modals.js');
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

test('resolveSeasonDataset: jornadas con forma rara (array) no se usa como matchSource', async () => {
  const { resolveSeasonDataset } = await import('../../src/modals.js');
  const ds = resolveSeasonDataset({ season: '2023-2024' }, {
    group: { id: 'A1', jornadas: [1, 2, 3] }, groupId: 'A1', history: null, stats: null,
  });
  assert.deepEqual(ds.matchSource, {});
});

/* ─── 2. fillIfCurrent (stale-slot guard) ──────────────────────────────── */

test('fillIfCurrent: slot vigente → render se ejecuta y devuelve true', async () => {
  const { fillIfCurrent } = await import('../../src/modals.js');
  const slot = { dataset: { key: 'A|B|2-1' } };
  let called = null;
  const ok = fillIfCurrent(slot, 'A|B|2-1', s => { called = s; });
  assert.equal(ok, true);
  assert.equal(called, slot);
});

test('fillIfCurrent: slot de OTRO partido (stale) → no inyecta nada', async () => {
  const { fillIfCurrent } = await import('../../src/modals.js');
  // Escenario de la revisión: el callback del partido A resuelve cuando el
  // modal ya muestra el partido B — el host por id es el de B.
  const slotB = { dataset: { key: 'C|D|0-0' } };
  let called = false;
  const ok = fillIfCurrent(slotB, 'A|B|2-1', () => { called = true; });
  assert.equal(ok, false);
  assert.equal(called, false, 'la alineación de A no debe pintarse en el modal de B');
});

test('fillIfCurrent: slot null/sin dataset → false sin lanzar', async () => {
  const { fillIfCurrent } = await import('../../src/modals.js');
  assert.equal(fillIfCurrent(null, 'k', () => {}), false);
  assert.equal(fillIfCurrent({}, 'k', () => {}), false);
});

test('modals.js: todas las inserciones asíncronas usan el guard (dataset.key + fillIfCurrent)', () => {
  const s = src('modals.js');
  assert.ok(/dataset\.key/.test(s), 'los hosts deben marcarse con dataset.key al abrir el modal');
  const uses = s.match(/fillIfCurrent\(/g) || [];
  // 4 inserciones asíncronas: lineups, cronología de goles, plantilla del
  // modal de equipo e histórico cross-season (+1 de la declaración export).
  assert.ok(uses.length >= 4, `fillIfCurrent debe usarse en las 4 inserciones async (visto: ${uses.length})`);
});

/* ─── 3. miequipo: FEATURED.name + temporada fijada a la actual ────────── */

test('miequipo: plantillaTeamName usa FEATURED.name (FEATURED.team no existe)', async () => {
  const { plantillaTeamName } = await import('../../src/miequipo.js');
  // Con el bug (FEATURED.team || fallback hardcodeado) un featured distinto
  // de 'Las Mesas Hu.' devolvería el literal hardcodeado.
  assert.equal(plantillaTeamName({ cat: 'prebenjamin', name: 'Otro Equipo CF' }), 'Otro Equipo CF');
  assert.equal(plantillaTeamName(null), '');
});

test('miequipo: miEquipoSeason devuelve la current de SEASONS e ignora la selección', async () => {
  const { miEquipoSeason } = await import('../../src/miequipo.js');
  assert.equal(miEquipoSeason([{ name: '2024-2025' }, { name: '2025-2026', current: true }]),
    '2025-2026');
  assert.equal(miEquipoSeason(null), '2025-2026', 'fallback sin SEASONS');
  assert.equal(miEquipoSeason([{ name: '2024-2025' }]), '2025-2026', 'fallback sin current');
});

test('miequipo.js (fuente): sin FEATURED.team y sin getCurrentSeason() — MI EQUIPO va fijado a la temporada actual', () => {
  const s = src('miequipo.js');
  assert.ok(!s.includes('FEATURED.team'), 'FEATURED.team no existe; usar FEATURED.name');
  assert.ok(!s.includes('getCurrentSeason()'),
    'la card Plantilla no debe usar la temporada seleccionada (S.season)');
});

/* ─── 4. Escapado ──────────────────────────────────────────────────────── */

test('buildGoalsHtml: escapa goleador, sede y árbitro (datos scrapeados)', async () => {
  const { buildGoalsHtml } = await import('../../src/modals.js');
  const detail = {
    v: 'Campo "X" <sur>',
    r: 'COLEGIADO <b>',
    g: [[10, 'PEPE <img src=x onerror=alert(1)>', '1-0', 'h', 'n']],
  };
  const html = buildGoalsHtml(detail, null);
  assert.ok(!html.includes('<img src=x'), 'el nombre del goleador debe escaparse');
  assert.ok(html.includes('&lt;img src=x'), 'escapado visible del goleador');
  assert.ok(!html.includes('<sur>'), 'la sede debe escaparse');
  assert.ok(!html.includes('<b>'), 'el árbitro debe escaparse');
});

test('modals.js (fuente): interpolaciones señaladas escapadas (:51, :98-100, :327)', () => {
  const s = src('modals.js');
  assert.ok(!s.includes('${scorer}'), 'goleador del timeline sin escapar (modals.js:51)');
  assert.ok(!s.includes('${home}'), 'nombre home sin escapar (modals.js:98)');
  assert.ok(!s.includes('${away}'), 'nombre away sin escapar (modals.js:100)');
  assert.ok(!s.includes('title="${m.opp}"'), 'atributo title sin escapar (modals.js:327)');
});

test('C2: modals/plantilla/matchdetail-rich/miequipo importan escapeHtml/escapeAttr de state.js (cero duplicados)', () => {
  for (const f of ['modals.js', 'plantilla.js', 'matchdetail-rich.js', 'miequipo.js']) {
    const s = src(f);
    assert.ok(!/function\s+(escHtml|escapeHtml|esc)\s*\(/.test(s),
      `${f}: helper de escape local duplicado — debe importarse de state.js`);
    assert.ok(/import\s*\{[^}]*escapeHtml[^}]*\}\s*from\s*'\.\/state\.js'/.test(s),
      `${f}: falta el import de escapeHtml desde ./state.js`);
  }
});

/* ─── 5. typeof guard sobre globals de data-*.js (modals.js:71) ────────── */

test('modals.js (fuente): BENJAMIN/PREBENJAMIN siempre con typeof guard', () => {
  const s = src('modals.js');
  assert.ok(!s.includes("S.cat === 'benjamin' ? BENJAMIN : PREBENJAMIN"),
    'lectura desnuda de globals sin typeof guard (modals.js:71)');
  assert.ok(/typeof BENJAMIN !== 'undefined'/.test(s));
  assert.ok(/typeof PREBENJAMIN !== 'undefined'/.test(s));
});
