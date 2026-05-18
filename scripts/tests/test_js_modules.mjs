/**
 * Node test runner — JS module sanity tests.
 * Run: node --test scripts/tests/test_js_modules.mjs
 *
 * Tests:
 *   1. data-*.js files parse cleanly via vm.runInContext
 *   2. normalizeTeamName behaves correctly for common cases
 *   3. SHIELDS contains the expected canonical entries
 */

import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { isFeatured, FEATURED } from '../../src/state.js';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

function loadDataFile(filename) {
  const txt = readFileSync(join(ROOT, filename), 'utf8');
  const ctx = { document: undefined, window: undefined };
  vm.createContext(ctx);
  // The data files declare top-level `const NAME = ...;`. Run them, then
  // probe a known set of names; whichever exists gets returned.
  const probes = [
    'SEASONS', 'BENJAMIN', 'PREBENJAMIN', 'SHIELDS',
    'SEASON_2021_2022', 'SEASON_2022_2023', 'SEASON_2023_2024',
    'SEASON_2024_2025', 'SEASON_2025_2026',
  ];
  const probe = probes
    .map(n => `${n}:typeof ${n}!=='undefined'?${n}:undefined`)
    .join(',');
  vm.runInContext(`${txt}\nthis.__exports={${probe}};`, ctx);
  return ctx.__exports;
}

// ─── normalizeTeamName ────────────────────────────────────────────────────
// Mirror of the function in src/state.js — keep in sync.
function normalizeTeamName(s) {
  return s.normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/['".,''""]/g, '')
    .replace(/\b(CF|UD|CD|AD|SD|AFC|SC|CP|CE|CEF|SSD|ATLETICO|ATL)\b/gi, '')
    .toLowerCase().trim().replace(/\s+/g, ' ');
}

test('normalizeTeamName: strips accents', () => {
  assert.equal(normalizeTeamName('Gáldar'), 'galdar');
  assert.equal(normalizeTeamName('Garepa Viera'), 'garepa viera');
});

test('normalizeTeamName: strips club prefixes', () => {
  assert.equal(normalizeTeamName('UD Lanzarote'), 'lanzarote');
  assert.equal(normalizeTeamName('CD Tahiche'), 'tahiche');
  // Note: ATLETICO matches with-or-without accent regex; accents stripped first
  assert.equal(normalizeTeamName('CF Atlético Huracán'), 'huracan');
});

test('normalizeTeamName: collapses whitespace', () => {
  assert.equal(normalizeTeamName('  Las   Palmas '), 'las palmas');
});

test('normalizeTeamName: idempotent', () => {
  const norm = normalizeTeamName('Atlético G.C., C.F. "A"');
  assert.equal(normalizeTeamName(norm), norm);
});

// ─── data-*.js parses ────────────────────────────────────────────────────

test('data-seasons.js loads with SEASONS array', () => {
  const { SEASONS } = loadDataFile('data-seasons.js');
  assert.ok(Array.isArray(SEASONS), 'SEASONS should be an array');
  assert.ok(SEASONS.length >= 2, 'should have at least 2 seasons');
  assert.ok(SEASONS.some(s => s.current === true), 'one season must be marked current');
  // After optimization: only {name, current} keys (no inline group data)
  for (const s of SEASONS) {
    assert.ok(typeof s.name === 'string' && /^\d{4}-\d{4}$/.test(s.name),
      `season name should be YYYY-YYYY: ${s.name}`);
  }
});

test('data-benjamin.js loads BENJAMIN array of groups', () => {
  const { BENJAMIN } = loadDataFile('data-benjamin.js');
  assert.ok(Array.isArray(BENJAMIN), 'BENJAMIN should be an array');
  assert.ok(BENJAMIN.length > 0, 'should have groups');
  for (const g of BENJAMIN) {
    assert.ok(typeof g.id === 'string', `group missing id: ${JSON.stringify(g).slice(0,100)}`);
    assert.ok(Array.isArray(g.standings), `${g.id}: standings should be array`);
  }
});

test('data-shields.js loads SHIELDS map with canonical entries', () => {
  const { SHIELDS } = loadDataFile('data-shields.js');
  assert.ok(SHIELDS && typeof SHIELDS === 'object');
  // Should include the entries we added 2026-05-08 for 2024-25
  assert.ok(SHIELDS['Almegranca'], 'Almegranca shield missing');
  assert.ok(SHIELDS['Inter Colonia'], 'Inter Colonia shield missing');
  assert.ok(SHIELDS['Inter Colonia B'], 'Inter Colonia B shield missing');
  // Random sanity
  assert.ok(SHIELDS['Las Palmas'], 'Las Palmas shield missing');
});

test('per-season files have benjamin and prebenjamin arrays', () => {
  for (const name of ['2021-2022', '2022-2023', '2023-2024', '2024-2025']) {
    const data = loadDataFile(`data-season-${name}.js`);
    const key = `SEASON_${name.replace('-', '_')}`;
    const obj = data[key];
    assert.ok(obj, `${name}: SEASON_ object not found`);
    assert.equal(obj.name, name, `${name}: name mismatch`);
    assert.ok(Array.isArray(obj.benjamin), `${name}: benjamin not array`);
    assert.ok(Array.isArray(obj.prebenjamin), `${name}: prebenjamin not array`);
    assert.ok(obj.benjamin.length > 0, `${name}: 0 benjamin groups`);
  }
});

test('per-season groups have valid standings + jornadas shape', () => {
  for (const name of ['2024-2025', '2021-2022']) {
    const data = loadDataFile(`data-season-${name}.js`);
    const key = `SEASON_${name.replace('-', '_')}`;
    const obj = data[key];
    for (const cat of ['benjamin', 'prebenjamin']) {
      for (const g of obj[cat]) {
        // standings: array of [pos, team, pts, J, G, E, P, GF, GC, DF]
        for (const row of g.standings) {
          assert.ok(Array.isArray(row), `${name}/${g.id}: standings row not array`);
          assert.equal(row.length, 10, `${name}/${g.id}: row len=${row.length}`);
          const [pos, team, pts, J] = row;
          assert.equal(typeof pos, 'number');
          assert.equal(typeof team, 'string');
          if (J > 0) assert.ok(pts <= J * 3, `${name}/${g.id}/${team}: pts=${pts} > 3*J=${J*3}`);
        }
        // jornadas: object {num: [[date,home,away,hs,as], ...]}
        if (g.jornadas) {
          for (const [num, matches] of Object.entries(g.jornadas)) {
            assert.ok(Array.isArray(matches), `${name}/${g.id}/J${num}: matches not array`);
            for (const m of matches) {
              assert.ok(Array.isArray(m) && m.length === 5,
                `${name}/${g.id}/J${num}: match shape ${JSON.stringify(m)}`);
            }
          }
        }
      }
    }
  }
});

// FEATURED / isFeatured
test('FEATURED points at Las Mesas Hu. Prebenjamin PG2', () => {
  assert.equal(FEATURED.cat, 'prebenjamin');
  assert.equal(FEATURED.groupId, 'PG2');
  assert.equal(FEATURED.name, 'Las Mesas Hu.');
});

test('isFeatured matches the team and variants, not B teams', () => {
  assert.equal(isFeatured('Las Mesas Hu.'), true);
  assert.equal(isFeatured('Las Mesas Hu'), true);
  assert.equal(isFeatured('CD Las Mesas Hu.'), true);
  assert.equal(isFeatured('Las Mesas B'), false);
  assert.equal(isFeatured('Las Mesas Hu. B'), false);
  assert.equal(isFeatured('AD Huracan'), false);
  assert.equal(isFeatured(''), false);
  assert.equal(isFeatured(undefined), false);
});
