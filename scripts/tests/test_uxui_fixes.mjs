/**
 * Node test runner — UX/UI fixes 2026-06-11.
 * Run: node --test scripts/tests/test_uxui_fixes.mjs
 *
 * Covers:
 *   1. seasonOutlook(matches, todayISO) — pure end-of-season classifier for
 *      MI EQUIPO. The browser date is injected at the UI edge; the helper
 *      itself must never call `new Date()` without arguments.
 *   2. matchDateISO(date, todayISO) — pure DD/MM → ISO resolver that does
 *      NOT roll a recently-expired date into next year (the 06/06 bug).
 *   3. Source contracts for the presentation work (skeletons, focus-visible,
 *      reduced-motion, theme-color sync, aria-current).
 */

import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { seasonOutlook, matchDateISO } from '../../src/miequipo.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

// Helper to build featuredMatchesFrom-shaped entries succinctly.
const M = (date, played, result, hs, as, isHome) =>
  ({ date, played, result: result || null,
     hs: hs ?? null, as: as ?? null, isHome: isHome ?? true,
     opp: 'Rival', home: 'A', away: 'B', jorNum: 0 });

// ─── matchDateISO ──────────────────────────────────────────────────────────

test('matchDateISO: ISO dates pass through', () => {
  assert.equal(matchDateISO('2026-05-28', '2026-06-11'), '2026-05-28');
});

test('matchDateISO: DD/MM resolves to current year when recent past (NO next-year rollover)', () => {
  // The real bug: J30 on 06/06 with today=2026-06-11 must be 2026-06-06,
  // never 2027-06-06.
  assert.equal(matchDateISO('06/06', '2026-06-11'), '2026-06-06');
});

test('matchDateISO: DD/MM crossing new year resolves forward', () => {
  // Mid-season: today Dec 2025, fixture 10/01 → January 2026 (future).
  assert.equal(matchDateISO('10/01', '2025-12-20'), '2026-01-10');
});

test('matchDateISO: unparseable → null', () => {
  assert.equal(matchDateISO('', '2026-06-11'), null);
  assert.equal(matchDateISO(null, '2026-06-11'), null);
  assert.equal(matchDateISO('próximamente', '2026-06-11'), null);
});

// ─── seasonOutlook ─────────────────────────────────────────────────────────

test('seasonOutlook: future unplayed match → upcoming with its index', () => {
  const matches = [
    M('2026-06-01', true, 'W', 3, 1, true),
    M('2026-06-14', false),
  ];
  const o = seasonOutlook(matches, '2026-06-11');
  assert.equal(o.state, 'upcoming');
  assert.equal(o.nextIdx, 1);
});

test('seasonOutlook: match TODAY still counts as upcoming', () => {
  const o = seasonOutlook([M('2026-06-11', false)], '2026-06-11');
  assert.equal(o.state, 'upcoming');
  assert.equal(o.nextIdx, 0);
});

test('seasonOutlook: expired unplayed fixtures are skipped, later future one wins', () => {
  const matches = [
    M('2026-05-20', false),          // expired, never played
    M('2026-06-20', false),          // real future fixture
  ];
  const o = seasonOutlook(matches, '2026-06-11');
  assert.equal(o.state, 'upcoming');
  assert.equal(o.nextIdx, 1);
});

test('seasonOutlook: REAL scenario — only expired fixtures left → finished', () => {
  // Las Mesas Hu. J29 played 28/05, J30 fixture 06/06 never played, today 11/06.
  const matches = [
    M('2026-05-05', true, 'L', 1, 8, true),
    M('2026-05-28', true, 'W', 2, 9, false),
    M('06/06', false),               // DD/MM expired — the visible bug
  ];
  const o = seasonOutlook(matches, '2026-06-11');
  assert.equal(o.state, 'finished');
  assert.equal(o.lastPlayedIdx, 1);
});

test('seasonOutlook: all matches played → finished, lastPlayedIdx = last', () => {
  const matches = [
    M('2026-05-01', true, 'W', 2, 0, true),
    M('2026-05-08', true, 'D', 1, 1, true),
  ];
  const o = seasonOutlook(matches, '2026-06-11');
  assert.equal(o.state, 'finished');
  assert.equal(o.lastPlayedIdx, 1);
});

test('seasonOutlook: unparseable-date unplayed match is conservatively upcoming', () => {
  const o = seasonOutlook([M('por determinar', false)], '2026-06-11');
  assert.equal(o.state, 'upcoming');
  assert.equal(o.nextIdx, 0);
});

test('seasonOutlook: no matches / nothing played → empty', () => {
  assert.equal(seasonOutlook([], '2026-06-11').state, 'empty');
  assert.equal(seasonOutlook(undefined, '2026-06-11').state, 'empty');
  // only expired fixtures, zero played: nothing to celebrate
  assert.equal(seasonOutlook([M('2026-05-20', false)], '2026-06-11').state, 'empty');
});

test('seasonOutlook + matchDateISO are pure: no new Date() inside', () => {
  assert.ok(!/new Date/.test(seasonOutlook.toString()),
    'seasonOutlook must not construct dates — todayISO is injected');
  assert.ok(!/new Date/.test(matchDateISO.toString()),
    'matchDateISO must not construct dates — todayISO is injected');
});

// ─── source contracts: presentation work ──────────────────────────────────

const css = readFileSync(join(ROOT, 'style.css'), 'utf8');
const idx = readFileSync(join(ROOT, 'index.html'), 'utf8');
const initSrc = readFileSync(join(ROOT, 'src/init.js'), 'utf8');
const mieqSrc = readFileSync(join(ROOT, 'src/miequipo.js'), 'utf8');
const modalsSrc = readFileSync(join(ROOT, 'src/modals.js'), 'utf8');

test('style.css: season-error + retry button styled', () => {
  assert.ok(/\.season-error\b/.test(css), '.season-error rules missing');
  assert.ok(/\.season-retry-btn\b/.test(css), '.season-retry-btn rules missing');
});

test('style.css: skeleton shimmer exists and respects reduced motion', () => {
  assert.ok(/\.skeleton\b/.test(css), '.skeleton class missing');
  assert.ok(/prefers-reduced-motion:\s*no-preference/.test(css),
    'motion must be gated behind prefers-reduced-motion: no-preference');
});

test('style.css: tabular numerals on standings tables + focus-visible ring', () => {
  assert.ok(/font-variant-numeric:\s*tabular-nums/.test(css), 'tabular-nums missing');
  assert.ok(/:focus-visible/.test(css), ':focus-visible rules missing');
});

test('skeleton replaces the plantilla loading spinners (miequipo + modals)', () => {
  assert.ok(!/Cargando plantilla/.test(mieqSrc),
    'miequipo.js still shows the text spinner instead of a skeleton');
  assert.ok(!/Cargando plantilla/.test(modalsSrc),
    'modals.js still shows the text spinner instead of a skeleton');
  assert.ok(/skeleton/.test(mieqSrc), 'miequipo.js must render .skeleton placeholders');
  assert.ok(/skeleton/.test(modalsSrc), 'modals.js must render .skeleton placeholders');
});

test('miequipo.js: season-finished card replaces PRÓXIMO when season is over', () => {
  assert.ok(/seasonOutlook\s*\(/.test(mieqSrc), 'renderMiEquipo must call seasonOutlook');
  assert.ok(/me-over/.test(mieqSrc), 'finished-state card (.me-over) missing');
  assert.ok(/TEMPORADA FINALIZADA/i.test(mieqSrc), 'closing card copy missing');
});

test('init.js: theme-color meta synced with active theme', () => {
  assert.ok(/theme-color/.test(initSrc), 'init.js must sync the theme-color meta');
});

test('init.js + index.html: aria-current on the active tab', () => {
  assert.ok(/aria-current/.test(initSrc), 'init.js must manage aria-current on tab change');
  assert.ok(/aria-current="page"/.test(idx), 'index.html must mark the initial active tab');
});

test('index.html: icon-only modal close button has an aria-label', () => {
  assert.ok(/id="modalClose"[^>]*aria-label=|aria-label="[^"]*"[^>]*id="modalClose"/.test(idx),
    'modal close button needs aria-label');
});

// ─── QA 11/6 follow-ups ─────────────────────────────────────────────────────

test('matchDateISO: DD/MM far in the FUTURE rolls back a year (postponed Dec fixture seen in Jan)', () => {
  // Symmetric rule to the Dec→Jan crossing: a 20/12 fixture viewed on
  // 2027-01-05 belongs to December 2026, not December 2027.
  assert.equal(matchDateISO('20/12', '2027-01-05'), '2026-12-20');
  // And the forward crossing still works: a 10/01 fixture seen in December.
  assert.equal(matchDateISO('10/01', '2026-12-20'), '2027-01-10');
});

const renderSrc = readFileSync(join(ROOT, 'src', 'render.js'), 'utf8');
const cssSrc = readFileSync(join(ROOT, 'style.css'), 'utf8');
const mieqSrc2 = readFileSync(join(ROOT, 'src', 'miequipo.js'), 'utf8');

test('miequipo.js: expired unplayed fixtures show "no disputado" when season is over', () => {
  assert.ok(/no disputado/.test(mieqSrc2), 'calendar must tag expired fixtures as no disputado');
  assert.ok(/me-nd/.test(cssSrc), 'style.css must style the .me-nd chip');
});

test('miequipo.js: mini-table renders a gap separator between leader and window', () => {
  assert.ok(/me-gaprow/.test(mieqSrc2), 'gap row missing in mini-table');
  assert.ok(/me-gaprow/.test(cssSrc), 'style.css must style .me-gaprow');
});

test('render.js: form chips display Spanish letters (G/E/P) keeping W/D/L classes', () => {
  assert.ok(/FORM_LETTER\s*=\s*\{\s*W:\s*'G',\s*D:\s*'E',\s*L:\s*'P'\s*\}/.test(renderSrc),
    'FORM_LETTER display map missing');
});

test('style.css: .table-wrap has no max-height (nested scroll hid rows without a cue)', () => {
  const wrapBlock = cssSrc.match(/\.table-wrap\s*\{[^}]*\}/g) || [];
  for (const block of wrapBlock)
    assert.ok(!/max-height/.test(block), '.table-wrap must not cap height: ' + block);
});

test('style.css: light-theme coverage for QA findings (retry btn, scorers zebra, chip token)', () => {
  assert.ok(/\[data-theme="light"\] \.season-retry-btn \{[^}]*background/.test(cssSrc));
  assert.ok(/\[data-theme="light"\] \.scorers-table tr:nth-child\(even\)/.test(cssSrc));
  assert.ok(/--chip:/.test(cssSrc), '--chip token must be defined');
});
