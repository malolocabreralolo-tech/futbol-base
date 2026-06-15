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
