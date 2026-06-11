/**
 * Node test runner — FE-STATE fixes regression tests (2026-06-11).
 * Run: node --test scripts/tests/test_festate_fixes.mjs
 *
 * Covers:
 *   1. normalizeTeamName broken punctuation regex (state.js) + shields no-regression
 *   2. C1: normalizeForTeamsMapping conserves trailing filial letter (a/b/c/d)
 *   3. C2: escapeHtml/escapeAttr exported from state.js, used by render.js
 *   4. teamBadge onerror fallback via delegation (no inline module-scope ref)
 *   5. 'JNaN' jornada pills: jornadaNumber/jornadaLabel/sortJornadaKeys
 *   6. typeof guards for BENJAMIN/PREBENJAMIN/GOL_*
 *   7. getTeamForm jornada-key parsing ('Jornada N' keys)
 *   8. lazy loaders: failures not cached for the session, honest season error
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
 * gotcha), so `typeof SHIELDS !== 'undefined'` guards see them. */
let fetchImpl = async () => { throw new Error('fetch not stubbed'); };
globalThis.fetch = (...a) => fetchImpl(...a);

const docListeners = [];
globalThis.document = {
  querySelector: () => null,
  querySelectorAll: () => [],
  addEventListener: (type, fn, capture) => docListeners.push({ type, fn, capture }),
};

const NAME_QUOTES = 'ATLETICO HURACAN, A.D. "A"';   // real 2024-25 FIFLP name
const NAME_INJECT = '<img src=x onerror=evil()>';
globalThis.SHIELDS = {
  'Las Palmas': 'laspalmas.png',
  [NAME_QUOTES]: 'huracan.png',
  [NAME_INJECT]: 'evil.png',
};
globalThis.HISTORY = {
  G1: {
    // Insertion order J2-then-J1, and J1 played LATER than J2 (postponed
    // match) so a date-based ordering is distinguishable from jornada order.
    'Jornada 2': [['2026-01-10', 'Equipo X', 'Rival B', 1, 0]],
    'Jornada 1': [['2026-01-17', 'Equipo X', 'Rival C', 0, 2]],
  },
};

const state = await import('../../src/state.js');
const renderSrc = readFileSync(join(ROOT, 'src', 'render.js'), 'utf8');
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
  assert.ok(names.size > 400, `expected >400 team names, got ${names.size}`);

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

/* ════ 3. C2: escapeHtml / escapeAttr ════ */

test('C2: state.js exports escapeHtml and escapeAttr', () => {
  assert.equal(typeof state.escapeHtml, 'function', 'escapeHtml export');
  assert.equal(typeof state.escapeAttr, 'function', 'escapeAttr export');
  assert.equal(state.escapeHtml('<img src=x onerror=evil()>'),
    '&lt;img src=x onerror=evil()&gt;');
  assert.equal(state.escapeHtml('A & "B" \'C\''), 'A &amp; &quot;B&quot; &#39;C&#39;');
  assert.equal(state.escapeAttr(NAME_QUOTES),
    'ATLETICO HURACAN, A.D. &quot;A&quot;');
});

test('C2: render.js imports the shared escapers and drops its duplicate', () => {
  assert.ok(/import\s*\{[^}]*\bescapeHtml\b[^}]*\}\s*from\s*'\.\/state\.js'/s.test(renderSrc),
    'render.js must import escapeHtml from ./state.js');
  assert.ok(/import\s*\{[^}]*\bescapeAttr\b[^}]*\}\s*from\s*'\.\/state\.js'/s.test(renderSrc),
    'render.js must import escapeAttr from ./state.js');
  assert.ok(!/function\s+_esc\s*\(/.test(renderSrc),
    'render.js must not keep its private _esc duplicate (C2: zero duplicates)');
});

test('C2: render.js no longer interpolates scraped strings raw into innerHTML', () => {
  for (const raw of ['${row[1]}', '${m.home}', '${m.away}', '${m.venue}',
    '${s.name}', '${s.team}', '${s.group}', '${t.name}', '${phase}']) {
    assert.ok(!renderSrc.includes(raw),
      `render.js must escape this interpolation: ${raw}`);
  }
  assert.ok(!stateSrc.includes('${t.name}'),
    'state.js buildUnifiedPrebenjamin must escape ${t.name}');
  assert.ok(!stateSrc.includes('title="${t.groupName}"'),
    'state.js buildUnifiedPrebenjamin must escape the title attribute');
});

test('C2: teamBadge escapes the alt attribute (real 2024-25 quoted name)', () => {
  const html = state.teamBadge(NAME_QUOTES);
  assert.ok(html.startsWith('<img'), 'exact SHIELDS hit must yield an <img>');
  assert.ok(html.includes('alt="ATLETICO HURACAN, A.D. &quot;A&quot;"'),
    `alt must be quote-escaped, got: ${html}`);
  // No stray attribute garbage: a double quote may not appear inside the alt value
  assert.ok(!/alt="[^"]*"A""/.test(html), 'alt attribute must not be broken');
});

test('C2: teamBadge neutralizes an injection-shaped team name', () => {
  const html = state.teamBadge(NAME_INJECT);
  assert.ok(!html.includes('<img src=x'), 'payload must not survive unescaped');
  assert.ok(html.includes('&lt;img src=x onerror=evil()&gt;'),
    'payload must appear HTML-escaped');
});

/* ════ 4. teamBadge fallback without module-scope onerror reference ════ */

test('teamBadge HTML has no inline onerror (was a ReferenceError to a module fn)', () => {
  for (const name of [NAME_QUOTES, 'Las Palmas']) {
    const html = state.teamBadge(name);
    assert.ok(!/onerror=/.test(html), `no inline onerror in: ${html}`);
    assert.ok(!/teamBadgeFallback/.test(html), 'no reference to the module-scope fn');
  }
  assert.ok(!/onerror=/.test(stateSrc), 'state.js must not emit inline onerror anywhere');
});

test('handleBadgeError swaps a broken badge <img> for the initials fallback', () => {
  const img = {
    tagName: 'IMG',
    classList: { contains: c => c === 'team-badge' },
    alt: 'Las Palmas',
    outerHTML: '<img>',
  };
  assert.equal(state.handleBadgeError(img), true);
  assert.ok(/team-badge/.test(img.outerHTML), 'fallback span has team-badge class');
  assert.ok(/LP/.test(img.outerHTML), 'initials LP rendered');
  // non-badge targets are ignored
  assert.equal(state.handleBadgeError({ tagName: 'DIV', classList: { contains: () => false } }), false);
  assert.equal(state.handleBadgeError(null), false);
});

test('state.js installs capture-phase error delegation on the document', () => {
  assert.ok(docListeners.some(l => l.type === 'error' && l.capture === true),
    'document must have a capture-phase error listener (img error does not bubble)');
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

test('render.js uses jornadaLabel and no longer maps jornada keys through Number', () => {
  assert.ok(!/Object\.keys\(group\.jornadas\)\.map\(Number\)/.test(renderSrc),
    'historical pills must not coerce keys with Number (JNaN)');
  assert.ok(/\bjornadaLabel\b/.test(renderSrc), 'render.js must use jornadaLabel');
  assert.ok(!/'J'\s*\+\s*num\b/.test(renderSrc), "no 'J'+num concatenation left");
});

/* ════ 6. typeof guards for data globals ════ */

test('getData survives undefined BENJAMIN/PREBENJAMIN (returns [])', () => {
  // BENJAMIN/PREBENJAMIN are NOT defined at this point of the test file.
  assert.equal(typeof globalThis.BENJAMIN, 'undefined', 'precondition');
  state.S.season = '';
  state.S.cat = 'benjamin';
  assert.deepEqual(state.getData(), [], 'no ReferenceError, empty fallback');
  state.S.cat = 'prebenjamin';
  assert.deepEqual(state.getData(), []);
  state.S.cat = 'benjamin';
});

test('render.js guards GOL_BENJ/GOL_PREBENJ with the typeof pattern', () => {
  assert.ok(/typeof GOL_BENJ !== 'undefined'/.test(renderSrc),
    'GOL_BENJ must be typeof-guarded');
  assert.ok(/typeof GOL_PREBENJ !== 'undefined'/.test(renderSrc),
    'GOL_PREBENJ must be typeof-guarded');
  assert.ok(!/globalThis\.(GOL_BENJ|GOL_PREBENJ|BENJAMIN|PREBENJAMIN)/.test(renderSrc),
    'guards must use bare identifiers, never globalThis');
});

test('state.js guards BENJAMIN/PREBENJAMIN with the typeof pattern', () => {
  assert.ok(/typeof BENJAMIN !== 'undefined'/.test(stateSrc));
  assert.ok(/typeof PREBENJAMIN !== 'undefined'/.test(stateSrc));
});

/* ════ 7. getTeamForm with 'Jornada N' keys ════ */

test('getTeamForm orders by jornada number, not by NaN/date accident', () => {
  state.S.season = '';
  const form = state.getTeamForm('Equipo X', 'G1', 5);
  assert.equal(form.length, 2);
  // J1 (loss, played 2026-01-17) must come BEFORE J2 (win, played 2026-01-10)
  assert.deepEqual(form.map(f => f.result), ['L', 'W']);
});

/* ════ 8. lazy loaders: failures are retryable + honest season errors ════ */

test('ensureLineups: a failed fetch is NOT cached for the session', async () => {
  fetchImpl = async () => ({ ok: false, status: 404, text: async () => '' });
  const first = await state.ensureLineups('2024-2025');
  assert.equal(first, null, 'failure returns the null sentinel');

  fetchImpl = async () => ({
    ok: true, status: 200,
    text: async () => 'const LINEUPS_2024_2025={"M|N|1-0":{"home":[],"away":[],"events":[]}};',
  });
  const second = await state.ensureLineups('2024-2025');
  assert.ok(second && second['M|N|1-0'], 'retry after failure must refetch and succeed');
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
  state.S.season = '2098-2099';
  state.S.cat = 'benjamin';
  assert.deepEqual(state.getData(), [],
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
  const data = state.getData();
  assert.equal(data.length, 1);
  assert.equal(data[0].id, 'H1', 'retry loads the real historical groups');

  state.S.season = '';
  delete globalThis.BENJAMIN;
});

test('render.js renders an honest season-error state with retry', () => {
  assert.ok(/getSeasonError/.test(renderSrc),
    'render.js must consult getSeasonError');
  assert.ok(/No se pudieron cargar los datos de la temporada/.test(renderSrc),
    'honest error message present');
  assert.ok(/Reintentar/.test(renderSrc), 'retry affordance present');
});
