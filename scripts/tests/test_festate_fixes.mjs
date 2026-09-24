/**
 * Node test runner — FE-STATE fixes regression tests (2026-06-11).
 * Run: node --test scripts/tests/test_festate_fixes.mjs
 *
 * Covers:
 *   1. normalizeTeamName broken punctuation regex (state.js) + shields no-regression
 *   2. C1: normalizeForTeamsMapping conserves trailing filial letter (a/b/c/d)
 *   5. 'JNaN' jornada pills: jornadaNumber/jornadaLabel/sortJornadaKeys
 *   6. typeof guards for BENJAMIN/PREBENJAMIN; getData(season, cat)
 *   8. lazy loaders: failures not cached for the session, honest season error
 * (3, 4 and 7 — escapeHtml, teamBadge and getTeamForm — left with the B2 cut:
 * html.js, ui.js and model.js cover them in the test_rediseno_*.mjs suites.)
 */

import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

/* ── browser-global stubs (must exist BEFORE importing src/state.js) ──
 * Data globals are set as globalThis properties: properties of the global
 * object ARE visible as bare identifiers (the reverse of the lexical-const
 * gotcha), so `typeof BENJAMIN !== 'undefined'` guards see them. */
let fetchImpl = async () => { throw new Error('fetch not stubbed'); };
globalThis.fetch = (...a) => fetchImpl(...a);

// No <script> of data-seasons.js: the lazy loaders request without ?v=.
globalThis.document = {
  querySelector: () => null,
  querySelectorAll: () => [],
};

const NAME_QUOTES = 'ATLETICO HURACAN, A.D. "A"';   // real 2024-25 FIFLP name

const state = await import('../../src/state.js');
const stateSrc = readFileSync(join(ROOT, 'src', 'state.js'), 'utf8');

function loadDataFile(filename, probes) {
  const txt = readFileSync(join(ROOT, filename), 'utf8');
  const ctx = {};
  vm.createContext(ctx);
  const probe = probes.map(n => `${n}:typeof ${n}!=='undefined'?${n}:undefined`).join(',');
  vm.runInContext(`${txt}\nthis.__exports={${probe}};`, ctx);
  return ctx.__exports;
}

/* ════ 1. normalizeTeamName punctuation regex ════ */

test('normalizeTeamName strips straight punctuation (broken-regex regression)', () => {
  assert.equal(state.normalizeTeamName(NAME_QUOTES), 'huracan a');
  assert.equal(state.normalizeTeamName('MOGAN, C.F.'), 'mogan');
  assert.equal(state.normalizeTeamName("L'Aldea C.D."), 'laldea');
});

test('normalizeTeamName strips curly Unicode quotes (Wayback names)', () => {
  assert.equal(state.normalizeTeamName('“Tahíche” C.D.'), 'tahiche');
  assert.equal(state.normalizeTeamName('VET“C” SA-COR'), 'vetc sa-cor');
  assert.equal(state.normalizeTeamName('Marzagan’s ‘B’'), 'marzagans b');
});

test('normalizeTeamName is idempotent', () => {
  const once = state.normalizeTeamName(NAME_QUOTES);
  assert.equal(state.normalizeTeamName(once), once);
});

test('shields no-regression: fixed normalize resolves >= names than the broken one', () => {
  // BROKEN (pre-fix) normalize: char class requires a trailing "]" so it
  // never strips punctuation. Kept here as the historical reference point.
  const normBroken = s => s.normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/['".,‘’“”]]/g, '')
    .replace(/\b(CF|UD|CD|AD|SD|AFC|SC|CP|CE|CEF|SSD|ATLETICO|ATL)\b/gi, '')
    .toLowerCase().trim().replace(/\s+/g, ' ');

  const { SHIELDS: realShields } = loadDataFile('data-shields.js', ['SHIELDS']);
  assert.ok(realShields && Object.keys(realShields).length > 100, 'real SHIELDS loads');

  const makeResolver = norm => {
    const shNorm = {};
    const keysNorm = Object.keys(realShields).map(k => [k, norm(k)]);
    for (const [k, n] of keysNorm) if (n && !shNorm[n]) shNorm[n] = realShields[k];
    return name => {
      if (realShields[name]) return true;
      const n = norm(name);
      if (n && shNorm[n]) return true;
      if (n.length >= 4 && keysNorm.some(([, kn]) => kn.length >= 4 && (kn.includes(n) || n.includes(kn)))) return true;
      return false;
    };
  };

  const names = new Set();
  const collect = groups => {
    for (const g of groups || []) {
      for (const r of g.standings || []) names.add(r[1]);
      for (const ms of Object.values(g.jornadas || {})) for (const m of ms) { names.add(m[1]); names.add(m[2]); }
      for (const m of g.matches || []) { names.add(m[2]); names.add(m[3]); }
    }
  };
  collect(loadDataFile('data-benjamin.js', ['BENJAMIN']).BENJAMIN);
  collect(loadDataFile('data-prebenjamin.js', ['PREBENJAMIN']).PREBENJAMIN);
  for (const s of ['2021-2022', '2022-2023', '2023-2024', '2024-2025']) {
    const key = `SEASON_${s.replace('-', '_')}`;
    const obj = loadDataFile(`data-season-${s}.js`, [key])[key];
    collect(obj.benjamin); collect(obj.prebenjamin);
  }
  // Cota de cordura ("se han cargado datos de verdad"), no del contraste de
  // abajo. Bajó de 400 a 300 el 26/07/2026: fundir los clubes duplicados
  // (mismo equipo con dos grafías) redujo los nombres distintos de ~450 a ~390.
  assert.ok(names.size > 300, `expected >300 team names, got ${names.size}`);

  const before = makeResolver(normBroken);
  const after = makeResolver(state.normalizeTeamName);
  let bCount = 0, aCount = 0;
  const lost = [];
  for (const n of names) {
    const b = before(n), a = after(n);
    if (b) bCount++;
    if (a) aCount++;
    if (b && !a) lost.push(n);
  }
  assert.deepEqual(lost, [], 'no team may LOSE its shield with the fixed regex');
  assert.ok(aCount >= bCount, `after (${aCount}) must be >= before (${bCount})`);
});

/* ════ 2. C1: normalizeForTeamsMapping conserves filial letter ════ */

test('C1: normalizeForTeamsMapping keeps the trailing team letter', () => {
  assert.equal(state.normalizeForTeamsMapping('UD Atalaya'), 'atalaya');
  assert.equal(state.normalizeForTeamsMapping('UD Atalaya B'), 'atalaya b');
  assert.equal(state.normalizeForTeamsMapping(NAME_QUOTES), 'huracan a');
  assert.equal(state.normalizeForTeamsMapping('Atletico Huracan A'), 'huracan a');
});

test('C1: normalizeForTeamsMapping still strips accents/punctuation/club tokens', () => {
  assert.equal(state.normalizeForTeamsMapping('ARUCAS, C.F.'), 'arucas');
  assert.equal(state.normalizeForTeamsMapping('U.D. MOYA'), 'moya');
  assert.equal(state.normalizeForTeamsMapping('C.D. Gáldar'), 'galdar');
  assert.equal(state.normalizeForTeamsMapping(''), '');
  assert.equal(state.normalizeForTeamsMapping(null), '');
});

/* ════ 5. jornada labels (JNaN in Copa 2024-25) ════ */

test('jornadaNumber: numeric and "Jornada N" labels parse; copa labels do not', () => {
  assert.equal(state.jornadaNumber('Jornada 5'), 5);
  assert.equal(state.jornadaNumber('7'), 7);
  assert.equal(state.jornadaNumber(' 12 '), 12);
  // Copa 2024-25 real keys carry dates — must NOT yield the date day
  assert.equal(state.jornadaNumber('08-06-2025 ( Ronda 1 Ida )'), null);
  assert.equal(state.jornadaNumber('Semifinal'), null);
});

test('jornadaLabel: J<n> for numeric labels, verbatim otherwise', () => {
  assert.equal(state.jornadaLabel('Jornada 5'), 'J5');
  assert.equal(state.jornadaLabel('7'), 'J7');
  assert.equal(state.jornadaLabel('Semifinal'), 'Semifinal');
  assert.equal(state.jornadaLabel('08-06-2025 ( Ronda 1 Ida )'), '08-06-2025 ( Ronda 1 Ida )');
});

test('sortJornadaKeys: numeric ascending, non-numeric keep insertion order after', () => {
  assert.deepEqual(state.sortJornadaKeys(['Jornada 10', '3', 'Jornada 2']),
    ['Jornada 2', '3', 'Jornada 10']);
  assert.deepEqual(
    state.sortJornadaKeys(['25-04-2025 ( Ronda 1 )', '26-04-2025 ( Ronda 2 )']),
    ['25-04-2025 ( Ronda 1 )', '26-04-2025 ( Ronda 2 )']);
});

/* ════ 6. typeof guards for data globals ════ */

test('getData survives undefined BENJAMIN/PREBENJAMIN (returns [])', () => {
  // BENJAMIN/PREBENJAMIN are NOT defined at this point of the test file.
  assert.equal(typeof globalThis.BENJAMIN, 'undefined', 'precondition');
  assert.deepEqual(state.getData('', 'benjamin'), [], 'no ReferenceError, empty fallback');
  assert.deepEqual(state.getData('', 'prebenjamin'), []);
});

test('state.js guards BENJAMIN/PREBENJAMIN with the typeof pattern', () => {
  assert.ok(/typeof BENJAMIN !== 'undefined'/.test(stateSrc));
  assert.ok(/typeof PREBENJAMIN !== 'undefined'/.test(stateSrc));
});

/* ════ 8. lazy loaders: failures are retryable + honest season errors ════ */

test('ensureLineups: a failed fetch is NOT cached for the session', async () => {
  fetchImpl = async () => ({ ok: false, status: 503, text: async () => '' });
  const first = await state.ensureLineups('2024-2025');
  assert.equal(first, null, 'failure returns the null sentinel');

  fetchImpl = async () => ({
    ok: true, status: 200,
    text: async () => 'const LINEUPS_2024_2025={"M|N|1-0":{"home":[],"away":[],"events":[]}};',
  });
  const second = await state.ensureLineups('2024-2025');
  assert.ok(second && second['M|N|1-0'], 'retry after failure must refetch and succeed');
});

test('ensureLineups: a 404 IS cached for the session (fetch called once); a 503 is not (ronda de arreglos 1)', async () => {
  let calls404 = 0;
  fetchImpl = async () => { calls404 += 1; return { ok: false, status: 404, text: async () => '' }; };
  const first = await state.ensureLineups('2029-2030');
  assert.deepEqual(first, {}, '404: sin fichero de actas (temporada sin actas), {}');
  const second = await state.ensureLineups('2029-2030');
  assert.deepEqual(second, {});
  assert.equal(calls404, 1, '404: la segunda llamada no repite el fetch, queda en caché');

  let calls503 = 0;
  fetchImpl = async () => { calls503 += 1; return { ok: false, status: 503, text: async () => '' }; };
  const third = await state.ensureLineups('2028-2029');
  assert.equal(third, null);
  const fourth = await state.ensureLineups('2028-2029');
  assert.equal(fourth, null);
  assert.equal(calls503, 2, '503: cada llamada repite el fetch, nunca se guarda en caché');
});

test('ensurePlayers: a failed fetch is NOT cached for the session', async () => {
  fetchImpl = async () => { throw new Error('network down'); };
  assert.equal(await state.ensurePlayers('2024-2025'), null);

  fetchImpl = async () => ({
    ok: true, status: 200,
    text: async () => 'const PLAYERS_2024_2025={"1":[{"n":"X","ap":1,"st":1,"g":0,"y":0,"rd":0}]};\nconst TEAMS_2024_2025={"atalaya b":1};',
  });
  const second = await state.ensurePlayers('2024-2025');
  assert.ok(second && second.players && second.teams, 'retry succeeds');
  assert.equal(second.teams['atalaya b'], 1);
});

test('ensureMatchDetail: failure returns null sentinel and allows retry', async () => {
  fetchImpl = async () => ({ ok: false, status: 500, text: async () => '' });
  const first = await state.ensureMatchDetail();
  assert.equal(first, null,
    'failure must be a null sentinel, not a fake empty {} cached forever');

  fetchImpl = async () => ({
    ok: true, status: 200,
    text: async () => 'const MATCH_DETAIL={"a|b|1-0":{"g":[[1,"x"]]}};',
  });
  const second = await state.ensureMatchDetail();
  assert.ok(second && second['a|b|1-0'], 'retry after failure must succeed');
});

test('failed historical season: getData returns [] (never mislabeled current data)', async () => {
  globalThis.BENJAMIN = [{ id: 'CUR', name: 'Actual', standings: [] }];
  fetchImpl = async () => ({ ok: false, status: 404, text: async () => '' });

  await state.ensureSeasonData('2098-2099');
  assert.deepEqual(state.getData('2098-2099', 'benjamin'), [],
    'an unloaded historical season must NOT fall back to current-season data');
  assert.ok(state.getSeasonError('2098-2099'),
    'getSeasonError must report the failure');

  // retry path: a later successful fetch clears the error and loads data
  fetchImpl = async () => ({
    ok: true, status: 200,
    text: async () => 'const SEASON_2098_2099={"name":"2098-2099","benjamin":[{"id":"H1","standings":[]}],"prebenjamin":[]};',
  });
  await state.ensureSeasonData('2098-2099');
  assert.equal(state.getSeasonError('2098-2099'), null, 'error cleared on success');
  const data = state.getData('2098-2099', 'benjamin');
  assert.equal(data.length, 1);
  assert.equal(data[0].id, 'H1', 'retry loads the real historical groups');
  assert.equal(state.getData('', 'benjamin')[0].id, 'CUR', 'the current season still reads BENJAMIN');

  delete globalThis.BENJAMIN;
});
