/**
 * Node test runner — UX/UI etapa 2 (A1: "app de estadio" nav + hero + identidad).
 * Run: node --test scripts/tests/test_uxui2_fixes.mjs
 *
 * Source contracts (no new logic helpers were added — presentation only):
 *   1. Mobile bottom nav: .section-tabs repositioned (position:fixed +
 *      env(safe-area-inset-bottom)) INSIDE the <=768px media query, reusing
 *      the same element so init.js click/aria-current logic is untouched.
 *   2. body gets padding-bottom on mobile so content/footer never hide
 *      behind the fixed bar; scroll-top floats above it.
 *   3. Tabs carry an icon (aria-hidden) + label span in index.html markup.
 *   4. aria-current management intact (init.js + initial tab in index.html).
 *   5. Theme toggle still lives in the header (must not get lost in the
 *      compact mobile header).
 *   6. Hero XL: crest >=96px with accent ring, ordinal chip 56-64px Bebas;
 *      the season-over card no longer duplicates the hero's XL position.
 */

import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const css = readFileSync(join(ROOT, 'style.css'), 'utf8');
const idx = readFileSync(join(ROOT, 'index.html'), 'utf8');
const initSrc = readFileSync(join(ROOT, 'src', 'init.js'), 'utf8');
const mieqSrc = readFileSync(join(ROOT, 'src', 'miequipo.js'), 'utf8');

// Everything from the mobile breakpoint onwards (the bottom-nav block lives
// inside `@media (max-width: 768px)`).
const mediaIdx = css.indexOf('@media (max-width: 768px)');
const mobile = mediaIdx >= 0 ? css.slice(mediaIdx) : '';

// ─── 1. bottom nav: fixed + safe-area, same element, in the media query ───

test('style.css: mobile media query exists and contains the bottom-nav rules', () => {
  assert.ok(mediaIdx >= 0, '@media (max-width: 768px) block missing');
  const rule = mobile.match(/\.section-tabs\s*\{[^}]*\}/);
  assert.ok(rule, '.section-tabs rule missing inside the mobile media query');
  assert.ok(/position:\s*fixed/.test(rule[0]),
    'bottom nav must be position:fixed on mobile');
  assert.ok(/bottom:\s*0/.test(rule[0]), 'bottom nav must pin to bottom:0');
  assert.ok(/env\(safe-area-inset-bottom\)/.test(rule[0]),
    'bottom nav must pad for env(safe-area-inset-bottom)');
});

test('style.css: bottom nav is an elevated blur surface with an opaque fallback', () => {
  assert.ok(/backdrop-filter:\s*blur/.test(mobile),
    'backdrop-filter blur missing on the bottom nav');
  assert.ok(/@supports[^{]*backdrop-filter/.test(mobile),
    'blur must be progressive (@supports) over an opaque background fallback');
  assert.ok(/\[data-theme="light"\] \.section-tabs/.test(mobile),
    'bottom nav needs its light-theme surface variant');
});

test('style.css: desktop keeps the top tab-bar (no fixed positioning outside the media query)', () => {
  const desktop = css.slice(0, mediaIdx);
  const rules = desktop.match(/\.section-tabs\s*\{[^}]*\}/g) || [];
  assert.ok(rules.length > 0, 'base .section-tabs rule missing');
  for (const r of rules)
    assert.ok(!/position:\s*fixed/.test(r),
      'desktop .section-tabs must NOT be fixed: ' + r);
});

// ─── 2. content never hides behind the bar ────────────────────────────────

test('style.css: mobile body padding-bottom clears the fixed bar (footer included)', () => {
  const rule = mobile.match(/(^|\s)body\s*\{[^}]*\}/);
  assert.ok(rule, 'body rule missing inside the mobile media query');
  assert.ok(/padding-bottom:\s*calc\([^)]*safe-area-inset-bottom[^)]*\)/.test(rule[0]),
    'mobile body needs padding-bottom: calc(...safe-area-inset-bottom)');
});

test('style.css: scroll-top button floats above the bottom nav on mobile', () => {
  const rule = mobile.match(/\.scroll-top[.\w-]*\s*\{[^}]*\}/);
  assert.ok(rule, '.scroll-top mobile offset missing');
  assert.ok(/bottom:\s*calc\(/.test(rule[0]),
    'scroll-top must offset its bottom above the nav bar');
  // The base .scroll-top rule (bottom:24px) is declared AFTER the mobile
  // media query — the override needs higher specificity or it silently loses.
  assert.ok(/\.scroll-top\.scroll-top\s*\{/.test(mobile),
    'mobile scroll-top override must out-specify the later base rule');
});

// ─── 3. tab markup: icon + label spans ─────────────────────────────────────

test('index.html: every section tab has an aria-hidden icon and a label span', () => {
  const tabs = idx.match(/<button class="section-tab[^"]*"[^>]*data-section="[^"]+"[^>]*>[\s\S]*?<\/button>/g) || [];
  assert.equal(tabs.length, 6, 'expected the 6 section tabs');
  for (const t of tabs) {
    assert.ok(/<span class="tab-ico" aria-hidden="true">/.test(t),
      'tab missing its aria-hidden .tab-ico: ' + t);
    assert.ok(/<span class="tab-label">/.test(t),
      'tab missing its .tab-label: ' + t);
  }
});

test('style.css: icons stack above labels on mobile, stay hidden on desktop (except ⭐ MI EQUIPO)', () => {
  assert.ok(/\.section-tab \.tab-ico\s*\{\s*display:\s*none/.test(css),
    'desktop must hide .tab-ico by default');
  assert.ok(/\.section-tab\[data-section="miequipo"\] \.tab-ico\s*\{\s*display:\s*inline/.test(css),
    'desktop keeps MI EQUIPO’s inline star');
  const mob = mobile.match(/\.section-tab \.tab-ico\s*\{[^}]*\}/);
  assert.ok(mob && /display:\s*block/.test(mob[0]),
    'mobile must show icons as block above the label');
});

// ─── 4. aria-current contract intact ──────────────────────────────────────

test('init.js + index.html: aria-current handling untouched by the nav repositioning', () => {
  assert.ok(/setAttribute\('aria-current',\s*'page'\)/.test(initSrc),
    'init.js must still set aria-current=page on the active tab');
  assert.ok(/removeAttribute\('aria-current'\)/.test(initSrc),
    'init.js must still clear aria-current on inactive tabs');
  assert.ok(/data-section="miequipo" aria-current="page"/.test(idx),
    'index.html must keep aria-current=page on the initial MI EQUIPO tab');
});

// ─── 5. theme toggle survives the compact mobile header ───────────────────

test('index.html: theme toggle lives inside the header with its aria-label', () => {
  const header = idx.match(/<header[\s\S]*?<\/header>/);
  assert.ok(header, '<header> missing');
  assert.ok(/id="themeToggle"/.test(header[0]), 'theme toggle must stay in the header');
  assert.ok(/id="themeToggle"[^>]*aria-label=|aria-label="[^"]*"[^>]*id="themeToggle"/.test(header[0]),
    'theme toggle needs its aria-label');
});

// ─── 6. hero XL + season-over card de-duplication ─────────────────────────

test('style.css: hero crest is XL (>=96px) with an accent ring, on both breakpoints', () => {
  const base = css.match(/\.me-crest \.team-badge\s*\{[^}]*\}/);
  assert.ok(base, '.me-crest .team-badge base rule missing');
  const w = base[0].match(/width:\s*(\d+)px/);
  assert.ok(w && +w[1] >= 96 && +w[1] <= 110, 'crest base width must be 96-110px');
  assert.ok(/box-shadow:[^;]*var\(--green-border\)/.test(base[0]),
    'crest needs its accent ring (box-shadow with --green-border)');
  const mob = mobile.match(/\.me-crest \.team-badge\s*\{[^}]*\}/);
  assert.ok(mob, 'mobile crest override missing');
  const mw = mob[0].match(/width:\s*(\d+)px/);
  assert.ok(mw && +mw[1] >= 96, 'mobile crest must stay >=96px');
});

test('style.css: ordinal chip digits are scoreboard-sized Bebas (56-64px)', () => {
  const base = css.match(/\.me-pos-n\s*\{[^}]*\}/);
  assert.ok(base, '.me-pos-n rule missing');
  assert.ok(/Bebas Neue/.test(base[0]), 'ordinal must use Bebas Neue');
  const fs = base[0].match(/font-size:\s*(\d+)px/);
  assert.ok(fs && +fs[1] >= 56 && +fs[1] <= 64, 'ordinal base size must be 56-64px');
  const mob = mobile.match(/\.me-pos-n\s*\{[^}]*\}/);
  assert.ok(mob, 'mobile .me-pos-n override missing');
  const mfs = mob[0].match(/font-size:\s*(\d+)px/);
  assert.ok(mfs && +mfs[1] >= 56, 'mobile ordinal must stay >=56px');
});

test('miequipo.js: season-over card emphasises the balance, not the hero’s position', () => {
  assert.ok(!/me-over-pos/.test(mieqSrc),
    'season-over card must not repeat the XL position (me-over-pos removed)');
  assert.ok(/<span class="n pts">/.test(mieqSrc),
    'season-over card must lead with the PTS stat');
  assert.ok(/TEMPORADA FINALIZADA/i.test(mieqSrc), 'closing card copy must remain');
});

test('style.css: no stale .me-over-pos/.me-over-n rules left behind', () => {
  assert.ok(!/\.me-over-pos\b/.test(css), '.me-over-pos CSS should be gone');
  assert.ok(!/\.me-over-n\b/.test(css), '.me-over-n CSS should be gone');
  assert.ok(/\.me-over-stat \.n\.pts/.test(css), 'PTS stat needs its accent rule');
  assert.ok(/\[data-theme="light"\] \.me-over-stat \.n\.pts/.test(css),
    'PTS stat needs its light-theme variant');
});

/* ═══════════════════════════════════════════════════════════════════════
 * ETAPA A2 — sheets + scoreboard + goleadores (appended; A1 tests above).
 *
 * TDD helpers:
 *   - modals.js: sheetDragOffset / sheetShouldClose (swipe-down close)
 *   - miequipo.js: goalBarPct (proportional goal bars)
 * Source contracts: bottom-sheet CSS under the mobile media query, drag
 * handle in index.html, reduced-motion gating, scoreboard pills in
 * renderMatchCards + modal header, podium + bars in goleadores.
 * ═══════════════════════════════════════════════════════════════════════ */

const modalsSrc = readFileSync(join(ROOT, 'src', 'modals.js'), 'utf8');
const renderSrc = readFileSync(join(ROOT, 'src', 'render.js'), 'utf8');

// ─── A2.1 sheet drag helpers (pure, TDD) ──────────────────────────────────

test('A2 modals.sheetDragOffset: downward drag → positive offset; up/NaN → 0', async () => {
  const { sheetDragOffset } = await import('../../src/modals.js');
  assert.equal(sheetDragOffset(100, 180), 80, 'drag down 80px');
  assert.equal(sheetDragOffset(100, 100), 0, 'no movement');
  assert.equal(sheetDragOffset(100, 40), 0, 'upward drag clamps to 0 (sheet never lifts)');
  assert.equal(sheetDragOffset(undefined, 50), 0, 'non-finite start → 0');
  assert.equal(sheetDragOffset(100, NaN), 0, 'non-finite current → 0');
});

test('A2 modals.sheetShouldClose: closes only past the threshold (default 80px)', async () => {
  const { sheetShouldClose, SHEET_CLOSE_PX } = await import('../../src/modals.js');
  assert.equal(SHEET_CLOSE_PX, 80, 'spec: >80px closes');
  assert.equal(sheetShouldClose(81), true);
  assert.equal(sheetShouldClose(80), false, 'exactly 80 does NOT close (spec: >80)');
  assert.equal(sheetShouldClose(0), false);
  assert.equal(sheetShouldClose(41, 40), true, 'custom threshold honored');
});

test('A2 modals.js: swipe-down wiring — touch listeners, live transform, close via helper', () => {
  assert.ok(/addEventListener\('touchstart'/.test(modalsSrc), 'touchstart listener missing');
  assert.ok(/addEventListener\('touchmove'/.test(modalsSrc), 'touchmove listener missing');
  assert.ok(/\{\s*passive:\s*true\s*\}/.test(modalsSrc), 'touch listeners must be passive (no scroll jank)');
  assert.ok(/translateY\(/.test(modalsSrc), 'live transform during drag missing');
  assert.ok(/sheetShouldClose\([^)]*\)/.test(modalsSrc), 'touchend must decide via sheetShouldClose');
  assert.ok(/sheet-dragging/.test(modalsSrc), 'transition must be suspended during the drag (.sheet-dragging)');
});

// ─── A2.2 bottom-sheet markup + CSS contracts ─────────────────────────────

test('A2 index.html: drag handle in the modal markup (aria-hidden, outside #modalContent)', () => {
  assert.ok(/<div class="sheet-handle" aria-hidden="true"><\/div>/.test(idx),
    'sheet-handle div missing');
  const handleIdx = idx.indexOf('sheet-handle');
  const contentIdx = idx.indexOf('id="modalContent"');
  assert.ok(handleIdx >= 0 && contentIdx >= 0 && handleIdx < contentIdx,
    'handle must sit before #modalContent (innerHTML rewrites would wipe it inside)');
});

test('style.css A2: modal becomes a bottom sheet ONLY inside a mobile media query', () => {
  // The sheet lives in a SECOND (max-width:768px) block that must sit AFTER
  // the desktop modal base rules — equal-specificity declarations win on
  // source order, so an earlier block would silently lose (A1 scroll-top
  // lesson). lastIndexOf with the trailing '{' skips the combined
  // reduced-motion query.
  const sheetIdx = css.lastIndexOf('@media (max-width: 768px) {');
  assert.ok(sheetIdx > mediaIdx, 'dedicated sheet media block missing');
  const baseModalIdx = css.indexOf('.modal-overlay {');
  assert.ok(baseModalIdx >= 0 && sheetIdx > baseModalIdx,
    'sheet block must come AFTER the modal base rules (source-order cascade)');
  const sheet = css.slice(sheetIdx);
  // base: centered dialog, handle hidden (desktop language untouched)
  const before = css.slice(0, sheetIdx);
  const baseOverlay = before.match(/\.modal-overlay\s*\{[^}]*\}/);
  assert.ok(baseOverlay && /align-items:\s*center/.test(baseOverlay[0]),
    'desktop overlay must stay centered');
  assert.ok(/\.sheet-handle\s*\{[^}]*display:\s*none/.test(before),
    'handle must be hidden on desktop');
  // mobile: anchored sheet
  const mOverlay = sheet.match(/\.modal-overlay\s*\{[^}]*\}/);
  assert.ok(mOverlay && /align-items:\s*flex-end/.test(mOverlay[0]),
    'mobile overlay must anchor the sheet to the bottom');
  const mModal = sheet.match(/(^|\s)\.modal\s*\{[^}]*\}/);
  assert.ok(mModal, '.modal rule missing in the sheet block');
  assert.ok(/border-radius:\s*20px 20px 0 0/.test(mModal[0]),
    'sheet radius must be 20px top-only');
  assert.ok(/max-height:\s*92dvh/.test(mModal[0]), 'sheet max-height must be 92dvh');
  assert.ok(/transform:\s*translateY\(100%\)/.test(mModal[0]),
    'closed sheet must rest below the viewport');
  assert.ok(/\.modal-overlay\.open \.modal\s*\{[^}]*translateY\(0\)/.test(sheet),
    'open sheet must slide to translateY(0)');
  assert.ok(/\.modal\.sheet-dragging\s*\{[^}]*transition:\s*none/.test(sheet),
    'transition must be off while dragging');
  const mHandle = sheet.match(/\.sheet-handle\s*\{[^}]*\}/);
  assert.ok(mHandle && /display:\s*block/.test(mHandle[0]), 'handle must show on mobile');
  assert.ok(/width:\s*36px/.test(mHandle[0]) && /height:\s*4px/.test(mHandle[0]),
    'handle must be the spec 36x4px bar');
  // backdrop: subtle blur behind the sheet, with a light-theme variant
  assert.ok(/@supports[^{]*backdrop-filter/.test(sheet)
    && /\[data-theme="light"\] \.modal-overlay/.test(sheet),
    'sheet backdrop blur needs @supports + light variant');
});

test('style.css A2: sheet slide-up is gated by prefers-reduced-motion', () => {
  const sheetIdx = css.lastIndexOf('@media (max-width: 768px) {');
  const sheet = css.slice(sheetIdx);
  // the sheet .modal rule itself must NOT re-enable the transition...
  const mModal = sheet.match(/(^|\s)\.modal\s*\{[^}]*\}/);
  assert.ok(mModal && /transition:\s*none/.test(mModal[0]),
    'sheet .modal must default to transition:none (reduced-motion safe)');
  // ...the 250ms slide-up lives in a combined media query
  assert.ok(/@media \(max-width: 768px\) and \(prefers-reduced-motion: no-preference\)\s*\{[^@]*\.modal\s*\{[^}]*transition:[^}]*transform[^}]*\}/.test(css),
    'slide-up transition must live under (max-width:768px) and (prefers-reduced-motion: no-preference)');
});

// ─── A2.3 scoreboard pills ────────────────────────────────────────────────

test('render.js A2: renderMatchCards emits the scoreboard pill with win/lose/draw digits', () => {
  assert.ok(/match-score scoreboard/.test(renderSrc), 'scoreboard class missing on .match-score');
  assert.ok(/sb-num/.test(renderSrc), 'sb-num digit spans missing');
  assert.ok(/sb-sep/.test(renderSrc), 'sb-sep separator missing');
  // winner/loser/draw classification for BOTH sides
  assert.ok(/m\.hs > m\.as \? ' win' : m\.hs < m\.as \? ' lose' : ' draw'/.test(renderSrc)
    || /' win'[\s\S]{0,80}' lose'[\s\S]{0,40}' draw'/.test(renderSrc),
    'home/away digits must carry win/lose/draw classes');
});

test('modals.js A2: modal header score upgraded to scoreboard-xl (same language)', () => {
  assert.ok(/modal-big-score scoreboard-xl/.test(modalsSrc), 'scoreboard-xl class missing');
  assert.ok(/sb-num/.test(modalsSrc), 'modal digits must reuse .sb-num');
});

test('style.css A2: scoreboard digits are Bebas (cards 22-26px, modal 32-40px) + light variants', () => {
  // Modal XL bajado de 40px a 34px tras el QA 11/6: el pill ancho empujaba
  // el nombre del equipo local a dos líneas en desktop.
  const base = css.match(/\.sb-num\s*\{[^}]*\}/);
  assert.ok(base, '.sb-num rule missing');
  assert.ok(/Bebas Neue/.test(base[0]), 'digits must be Bebas');
  assert.ok(/tabular-nums/.test(base[0]), 'digits must be tabular');
  const fs = base[0].match(/font-size:\s*(\d+)px/);
  assert.ok(fs && +fs[1] >= 22 && +fs[1] <= 26, 'card digits must be 22-26px');
  const xl = css.match(/\.modal-big-score\.scoreboard-xl \.sb-num\s*\{[^}]*\}/);
  assert.ok(xl, 'scoreboard-xl digit rule missing');
  const xfs = xl[0].match(/font-size:\s*(\d+)px/);
  assert.ok(xfs && +xfs[1] >= 32 && +xfs[1] <= 40, 'modal digits must be 32-40px');
  // states
  const win = css.match(/\.sb-num\.win\s*\{[^}]*\}/);
  assert.ok(win && /var\(--accent\)/.test(win[0]), 'winner digit must be accent');
  const lose = css.match(/\.sb-num\.lose\s*\{[^}]*\}/);
  assert.ok(lose && /var\(--text3\)/.test(lose[0]), 'loser digit must be dimmed');
  assert.ok(/\.sb-num\.draw\s*\{[^}]*\}/.test(css), 'draw digit state missing');
  // inset pill + light variant
  const pill = css.match(/\.match-score\.scoreboard\s*\{[^}]*\}/);
  assert.ok(pill && /inset/.test(pill[0]), 'pill must carry an inset (LED bezel) shadow');
  assert.ok(/\[data-theme="light"\] \.match-score\.scoreboard/.test(css),
    'scoreboard pill needs its light-theme variant');
});

test('style.css A2: me-res harmonized (tabular digits), not broken', () => {
  const meres = css.match(/\.me-res\s*\{[^}]*\}/);
  assert.ok(meres, '.me-res rule missing');
  assert.ok(/tabular-nums/.test(meres[0]), 'me-res must align digits like the scoreboards');
});

// ─── A2.4 goleadores: goalBarPct (pure, TDD) + podium + bars ──────────────

test('A2 miequipo.goalBarPct: proportional %, rounded, safe on max 0', async () => {
  const { goalBarPct } = await import('../../src/miequipo.js');
  assert.equal(goalBarPct(20, 20), 100, 'leader fills the track');
  assert.equal(goalBarPct(10, 20), 50);
  assert.equal(goalBarPct(1, 3), 33, 'rounds to integer');
  assert.equal(goalBarPct(2, 3), 67, 'rounds half up');
  assert.equal(goalBarPct(0, 20), 0, 'no goals → no bar');
  assert.equal(goalBarPct(5, 0), 0, 'max 0 → 0 (no division by zero)');
  assert.equal(goalBarPct(5, -1), 0, 'negative max → 0');
  assert.equal(goalBarPct(NaN, 10), 0, 'non-finite goals → 0');
  assert.equal(goalBarPct(1, 100), 3, 'tiny positive share floors at 3% (visible sliver)');
  assert.equal(goalBarPct(50, 20), 100, 'goals beyond max clamp at 100');
});

test('render.js A2: top-3 podium (DOM order 2º-1º-3º) with medals + goals XL', () => {
  assert.ok(/gol-podium/.test(renderSrc), 'podium container missing');
  assert.ok(/🥇/.test(renderSrc) && /🥈/.test(renderSrc) && /🥉/.test(renderSrc),
    'medal emojis missing');
  // visual order: silver, gold, bronze (1st in the middle, taller)
  assert.ok(/pod\(p2[\s\S]*?pod\(p1[\s\S]*?pod\(p3/.test(renderSrc),
    'podium DOM order must be 2º-1º-3º');
  assert.ok(/gol-pod-goals/.test(renderSrc), 'XL goals element missing');
});

test('render.js A2: rest of scorers carry a proportional goal bar', () => {
  assert.ok(/goalBarPct\(/.test(renderSrc), 'render.js must use the shared goalBarPct helper');
  assert.ok(/gol-bar-track/.test(renderSrc) && /gol-bar/.test(renderSrc),
    'bar track/fill markup missing');
  assert.ok(/style="width:\s*\$\{|style="width:' \+/.test(renderSrc) || /width:\s*\$\{[^}]*pct/.test(renderSrc),
    'bar width must be inline (% of max)');
});

test('miequipo.js A2: team scorers card keeps 👑 + toggle and gains bars', () => {
  assert.ok(/goalBarPct\(/.test(mieqSrc), 'miequipo must use goalBarPct');
  assert.ok(/gol-bar/.test(mieqSrc), 'team scorer rows must render bars');
  assert.ok(/&#128081;/.test(mieqSrc), 'the 👑 on the top scorer must survive');
  assert.ok(/meGolToggle/.test(mieqSrc), 'the "Ver los N" toggle must survive');
});

test('style.css A2: goal bar gradient accent→accent-dim, animation gated, podium light variants', () => {
  const bar = css.match(/\.gol-bar\s*\{[^}]*\}/);
  assert.ok(bar, '.gol-bar rule missing');
  assert.ok(/linear-gradient\([^)]*var\(--accent[^)]*var\(--accent-dim\)|linear-gradient\([^)]*var\(--accent-dim\)[^)]*var\(--accent\)/.test(bar[0]),
    'bar must use the accent→accent-dim gradient');
  // growth animation ONLY under reduced-motion: no-preference
  const motionBlocks = css.match(/@media \(prefers-reduced-motion: no-preference\)\s*\{[\s\S]*?\n\}/g) || [];
  assert.ok(motionBlocks.some(b => /gol-bar/.test(b)),
    'bar animation must live inside a no-preference motion block');
  const before = css.split('@media (prefers-reduced-motion: no-preference)')[0];
  assert.ok(!/\.gol-bar\s*\{[^}]*animation/.test(bar[0]),
    'the base .gol-bar rule must not animate unconditionally');
  // podium
  assert.ok(/\.gol-pod-1\s*\{[^}]*\}/.test(css), 'first-place podium card rule missing');
  assert.ok(/\[data-theme="light"\] \.gol-pod-1/.test(css),
    'podium needs its light-theme variant');
});
