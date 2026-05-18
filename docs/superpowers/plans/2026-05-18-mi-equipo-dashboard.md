# MI EQUIPO Dashboard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a fixed "MI EQUIPO" dashboard for Las Mesas Hu. Prebenjamin as the default screen of the futbol-base portal, plus a global highlight of that team across the whole site.

**Architecture:** Pure data-extraction helpers in `src/state.js` (unit-tested in Node). A new isolated render module `src/miequipo.js` builds the dashboard DOM from existing in-browser globals. `src/render.js` routes the new section and applies a `.featured-team` class in its table/match builders. No data files, scrapers or DB touched.

**Tech Stack:** Vanilla ES modules, static GitHub Pages site. Tests: `node --test` + `pytest`. Visual verification via Playwright.

**Spec:** `docs/superpowers/specs/2026-05-18-mi-equipo-dashboard-design.md`

---

## Security

This codebase renders via `.innerHTML` throughout (`src/render.js`, `src/modals.js`, `src/state.js`) and mitigates XSS by HTML-escaping every externally-sourced string before interpolation: see the existing `_esc()` in `render.js` and `escHtml()` in `modals.js`. FIFLP-scraped team/player names can contain `"`, `&`, `<`.

This plan follows the same established, reviewed pattern: `src/miequipo.js` defines an `esc()` helper and applies it to **every** team name, player name and opponent string before it reaches `.innerHTML`. Numbers (goals, points, positions) are not user-controlled. The data source is DB-generated JSON, not request input. Adding a different sanitization stack (e.g. DOMPurify) for one module would be inconsistent with the rest of the site and is out of scope. Reviewers must verify each interpolation of a name goes through `esc()`.

## File Structure

| File | Responsibility |
|---|---|
| `src/state.js` (modify) | `FEATURED` constant; pure helpers `isFeatured`, `featuredStandingFrom`, `featuredMatchesFrom`, `featuredScorersFrom`; `.featured-team` in `buildUnifiedPrebenjamin` |
| `src/miequipo.js` (create) | `renderMiEquipo()` -- hero, calendar, mini-table, scorers; uses the pure helpers with live globals |
| `src/render.js` (modify) | Route `miequipo` in `renderSection()`; set `document.body.dataset.section`; apply `.featured-team` in `buildStandingsTable`, `renderMatchCards`, `buildKnockoutBracket` |
| `src/init.js` (verify) | MI EQUIPO tab active by default (HTML-driven; verification only) |
| `index.html` (modify) | New tab button + section div; move `active`; bump all `?v=` |
| `sw.js` (modify) | Bump `CACHE_NAME` |
| `style.css` (modify) | `me-*` styles, `.featured-team`, hide global controls on MI EQUIPO, tab fade |
| `scripts/tests/test_js_modules.mjs` (modify) | Unit tests for the new pure helpers |

**Operational rules (apply throughout):**
- Do NOT `git push` (workflow `update.yml` owns pushes). Local commits only.
- Work in an isolated worktree/branch, never hand-push to `main`.
- The cache-bust version string is exactly `20260518a` everywhere.

---

## Task 1: FEATURED constant + isFeatured helper

**Files:**
- Modify: `src/state.js` (after the `S` object, ~line 14)
- Test: `scripts/tests/test_js_modules.mjs`

- [ ] **Step 1: Write the failing test** -- append to `scripts/tests/test_js_modules.mjs`:

```js
// FEATURED / isFeatured
import { isFeatured, FEATURED } from '../../src/state.js';

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
```

- [ ] **Step 2: Run test, verify it FAILS**

Run: `node --test scripts/tests/test_js_modules.mjs`
Expected: FAIL -- import error: `isFeatured`/`FEATURED` not exported.

- [ ] **Step 3: Implement** -- in `src/state.js`, right after the `S` object's closing `};` (line ~14, before `/* ====== HELPERS ====== */`):

```js
/* ====== FEATURED TEAM (fixed personal portal) ====== */
export const FEATURED = { cat: 'prebenjamin', groupId: 'PG2', name: 'Las Mesas Hu.' };

/* True when `name` is the featured team (normalized match). Covers club
 * prefixes and the dot in "Hu." but NOT B teams. */
export function isFeatured(name) {
  if (!name) return false;
  return normalizeTeamName(name) === normalizeTeamName(FEATURED.name);
}
```

`normalizeTeamName` is a hoisted function declaration later in the module -- safe to call.

- [ ] **Step 4: Run test, verify it PASSES**

Run: `node --test scripts/tests/test_js_modules.mjs`
Expected: PASS -- all green.

- [ ] **Step 5: Commit**

```bash
git add src/state.js scripts/tests/test_js_modules.mjs
git commit -m "feat(miequipo): FEATURED constant + isFeatured helper"
```

---

## Task 2: Pure data-extraction helpers

**Files:**
- Modify: `src/state.js` (after `isFeatured`)
- Test: `scripts/tests/test_js_modules.mjs`

- [ ] **Step 1: Write the failing test** -- append to `scripts/tests/test_js_modules.mjs`:

```js
// featured data extraction
import {
  featuredStandingFrom, featuredMatchesFrom, featuredScorersFrom,
} from '../../src/state.js';

test('featuredStandingFrom finds Las Mesas in PREBENJAMIN PG2', () => {
  const { PREBENJAMIN } = loadDataFile('data-prebenjamin.js');
  const r = featuredStandingFrom(PREBENJAMIN);
  assert.ok(r);
  assert.equal(r.row[1], 'Las Mesas Hu.');
  assert.equal(r.pos, r.row[0]);
  assert.ok(r.total >= r.pos);
  assert.equal(r.group.id, 'PG2');
});

test('featuredStandingFrom returns null when team absent', () => {
  assert.equal(featuredStandingFrom([{ id: 'PG2', name: 'G2',
    standings: [[1, 'Otro', 0, 0, 0, 0, 0, 0, 0, 0]] }]), null);
  assert.equal(featuredStandingFrom([]), null);
});

test('featuredMatchesFrom builds a sorted played/upcoming list', () => {
  const hist = {
    'Jornada 2': [['2026-01-10', 'Rival X', 'Las Mesas Hu.', 1, 3]],
    'Jornada 1': [['2026-01-03', 'Las Mesas Hu.', 'Rival Y', 2, 2],
                  ['2026-01-03', 'Otro', 'Mas', 0, 0]],
    'Jornada 3': [['06/06', 'Las Mesas Hu.', 'Rival Z', null, null]],
  };
  const m = featuredMatchesFrom(hist);
  assert.equal(m.length, 3);
  assert.deepEqual(m.map(x => x.jorNum), [1, 2, 3]);
  assert.equal(m[0].opp, 'Rival Y');
  assert.equal(m[0].isHome, true);
  assert.equal(m[0].result, 'D');
  assert.equal(m[0].played, true);
  assert.equal(m[1].opp, 'Rival X');
  assert.equal(m[1].isHome, false);
  assert.equal(m[1].result, 'W');
  assert.equal(m[2].played, false);
  assert.equal(m[2].result, null);
});

test('featuredMatchesFrom on empty/missing history -> []', () => {
  assert.deepEqual(featuredMatchesFrom(undefined), []);
  assert.deepEqual(featuredMatchesFrom({}), []);
});

test('featuredScorersFrom returns Las Mesas players sorted by goals', () => {
  const { GOL_PREBENJ } = loadDataFile('data-goleadores.js');
  const s = featuredScorersFrom(GOL_PREBENJ);
  assert.ok(s.length >= 1);
  for (let i = 1; i < s.length; i++)
    assert.ok(s[i - 1].goals >= s[i].goals);
  assert.ok(s.every(p => typeof p.name === 'string' && typeof p.goals === 'number'));
});

test('featuredScorersFrom handles missing group -> []', () => {
  assert.deepEqual(featuredScorersFrom([{ g: 'OTRO GRUPO', s: [] }]), []);
  assert.deepEqual(featuredScorersFrom(undefined), []);
});
```

- [ ] **Step 2: Run test, verify it FAILS**

Run: `node --test scripts/tests/test_js_modules.mjs`
Expected: FAIL -- helpers not exported.

- [ ] **Step 3: Implement** -- in `src/state.js`, directly after `isFeatured`:

```js
/* Standings row of the featured team within a PREBENJAMIN-shaped array.
 * Returns { group, row, pos, total } or null. */
export function featuredStandingFrom(prebenjamin) {
  if (!Array.isArray(prebenjamin)) return null;
  const group = prebenjamin.find(g => g.id === FEATURED.groupId);
  if (!group || !Array.isArray(group.standings)) return null;
  const row = group.standings.find(r => isFeatured(r[1]));
  if (!row) return null;
  return { group, row, pos: row[0], total: group.standings.length };
}

/* All matches of the featured team from a HISTORY[groupId]-shaped object,
 * sorted by jornada then date. Entry: { jor, jorNum, date, home, away,
 * hs, as, isHome, opp, played, result } -- result 'W'|'D'|'L' or null. */
export function featuredMatchesFrom(historyGroup) {
  if (!historyGroup || typeof historyGroup !== 'object') return [];
  const out = [];
  Object.entries(historyGroup).forEach(([jor, matches]) => {
    if (!Array.isArray(matches)) return;
    const jorNum = parseInt(String(jor).replace(/\D/g, ''), 10) || 0;
    matches.forEach(m => {
      const [date, home, away, hs, as] = m;
      if (!isFeatured(home) && !isFeatured(away)) return;
      const isHome = isFeatured(home);
      const played = hs !== null && hs !== undefined
        && as !== null && as !== undefined;
      let result = null;
      if (played) {
        const gf = isHome ? hs : as;
        const gc = isHome ? as : hs;
        result = gf > gc ? 'W' : gf < gc ? 'L' : 'D';
      }
      out.push({ jor, jorNum, date, home, away, hs, as, isHome,
        opp: isHome ? away : home, played, result });
    });
  });
  out.sort((a, b) => a.jorNum - b.jorNum
    || String(a.date).localeCompare(String(b.date)));
  return out;
}

/* Featured team's scorers from a GOL_PREBENJ-shaped array. Entry shape in
 * data: [name, team, goals, games]. Sorted goals desc, games asc. */
export function featuredScorersFrom(golPrebenj) {
  if (!Array.isArray(golPrebenj)) return [];
  const grp = golPrebenj.find(g => g.g === 'PREBENJAMIN GC GRUPO 2');
  if (!grp || !Array.isArray(grp.s)) return [];
  return grp.s
    .filter(s => isFeatured(s[1]))
    .map(s => ({ name: s[0], goals: s[2], games: s[3] }))
    .sort((a, b) => b.goals - a.goals || a.games - b.games);
}
```

- [ ] **Step 4: Run test, verify it PASSES**

Run: `node --test scripts/tests/test_js_modules.mjs`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/state.js scripts/tests/test_js_modules.mjs
git commit -m "feat(miequipo): pure standings/matches/scorers extraction helpers"
```

---

## Task 3: Section shell -- tab, container, default, control hiding

**Files:** `index.html`, `src/state.js`, `src/render.js`, `src/miequipo.js` (stub), `style.css`

- [ ] **Step 1: Tab button (first) in `index.html`** -- replace the `<nav class="section-tabs">` block (~lines 58-64) with:

```html
      <nav class="section-tabs">
        <button class="section-tab active" data-section="miequipo">&#11088; MI EQUIPO</button>
        <button class="section-tab" data-section="clasif">CLASIFICACIONES</button>
        <button class="section-tab" data-section="jornadas">JORNADAS</button>
        <button class="section-tab" data-section="goleadores">GOLEADORES</button>
        <button class="section-tab" data-section="isla">POR ISLA</button>
        <button class="section-tab" data-section="stats">ESTAD&Iacute;STICAS</button>
      </nav>
```

- [ ] **Step 2: Section container in `index.html`** -- replace the `<main class="main">` block (~lines 69-75) with:

```html
  <main class="main">
    <div id="sec-miequipo" class="section active"></div>
    <div id="sec-clasif" class="section"></div>
    <div id="sec-jornadas" class="section"></div>
    <div id="sec-goleadores" class="section"></div>
    <div id="sec-isla" class="section"></div>
    <div id="sec-stats" class="section"></div>
  </main>
```

- [ ] **Step 3: Default section + route**

In `src/state.js` change `S.section` default (line ~3) to:
```js
  section: 'miequipo',  // 'miequipo'|'clasif'|'jornadas'|'goleadores'|'isla'|'stats'
```

In `src/render.js` add below the import on line 2:
```js
import { renderMiEquipo } from './miequipo.js';
```

Replace the top of `renderSection()` (~line 22) with:
```js
export function renderSection() {
  $$('.section').forEach(s => s.classList.remove('active'));
  const sec = S.section;
  document.body.dataset.section = sec;
  $(`#sec-${sec}`).classList.add('active');

  if (sec === 'miequipo') renderMiEquipo();
  else if (sec === 'clasif') renderClasif();
  else if (sec === 'jornadas') renderJornadas();
  else if (sec === 'goleadores') renderGoleadores();
  else if (sec === 'isla') renderIsla();
  else if (sec === 'stats') renderStats();
}
```

- [ ] **Step 4: Stub `src/miequipo.js`** (replaced in Task 4) -- create with:
```js
import { $ } from './state.js';

export function renderMiEquipo() {
  const c = $('#sec-miequipo');
  if (c) c.innerHTML = '<div class="empty-state"><div class="empty-icon">&#11088;</div><p>MI EQUIPO (en construccion)</p></div>';
}
```

- [ ] **Step 5: Hide global controls on MI EQUIPO** -- in `style.css`, after `.section-tab.disabled {...}` (~line 286):
```css
body[data-section="miequipo"] .season-cat-row,
body[data-section="miequipo"] .season-selector,
body[data-section="miequipo"] .stats-bar { display: none; }
```

- [ ] **Step 6: Verify init.js (no edit).** `bindEvents()` already binds every `[data-section]` click and toggles `.active`. `S.section` is not persisted; HTML ships MI EQUIPO active. Confirm by reading `src/init.js` that nothing forces `S.section` away from its default. No code change.

- [ ] **Step 7: Smoke check**

Run:
```bash
(pkill -f "http.server 8899" 2>/dev/null; true) && (python3 -m http.server 8899 >/tmp/fb.log 2>&1 &) && sleep 1 && curl -s -o /dev/null -w "%{http_code}\n" http://localhost:8899/index.html
```
Expected: `200`. Browser at `http://localhost:8899/` shows the placeholder by default; other tabs still work; controls hidden only on MI EQUIPO.

- [ ] **Step 8: Commit**
```bash
git add index.html src/state.js src/render.js src/miequipo.js style.css
git commit -m "feat(miequipo): section shell, default tab, hide global controls"
```

---

## Task 4: MI EQUIPO dashboard render

**Files:** replace `src/miequipo.js` with the full implementation below. Reads live globals via `globalThis`. Every name passes through `esc()` (see Security section).

- [ ] **Step 1: Understand the module** -- the canonical source is the fenced block in Step 1a below; copy it verbatim into `src/miequipo.js` (replacing the Task 3 stub). The module exports `renderMiEquipo()` and:
  - imports `{ $, el, teamBadge, S, FEATURED, featuredStandingFrom, featuredMatchesFrom, featuredScorersFrom }` from `./state.js` and `{ openMatchDetail }` from `./modals.js`;
  - defines `esc()` (the standard 5-char HTML escaper) and applies it to every team/player/opponent string;
  - builds Hero, Calendario (with PROXIMO divider + amber next card, "ultimo" tag, colored results, internal-scroll container auto-scrolled to PROXIMO), Mini-tabla (leader + window of pos-3..pos+3, featured row class), Goleadores (top 5 + crown + in-place toggle);
  - `jumpToFullGroup()` clicks the prebenjamin cat button, sets `S.jorGroup='PG2'`, clicks the Clasificaciones tab.

- [ ] **Step 1a: Create the module file**

Run exactly (writes the module via the editor of your choice is also fine; the canonical source is this fenced block -- copy it verbatim into `src/miequipo.js`):

```js
import {
  $, el, teamBadge, S, FEATURED,
  featuredStandingFrom, featuredMatchesFrom, featuredScorersFrom,
} from './state.js';
import { openMatchDetail } from './modals.js';

const G = () => globalThis;
let _showAllScorers = false;

function esc(s) {
  return String(s).replace(/[&<>"']/g, c =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function parseMatchDate(d) {
  if (!d) return null;
  let m = String(d).match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (m) return new Date(+m[1], +m[2] - 1, +m[3]);
  m = String(d).match(/^(\d{2})\/(\d{2})$/);
  if (m) {
    const now = new Date();
    let dt = new Date(now.getFullYear(), +m[2] - 1, +m[1]);
    if (dt < new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1))
      dt = new Date(now.getFullYear() + 1, +m[2] - 1, +m[1]);
    return dt;
  }
  return null;
}

function fmtDate(d) {
  const dt = parseMatchDate(d);
  if (!dt) return esc(d || '');
  return dt.toLocaleDateString('es-ES',
    { weekday: 'short', day: '2-digit', month: '2-digit' });
}

function countdownLabel(d) {
  const dt = parseMatchDate(d);
  if (!dt) return '';
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const days = Math.round((dt - today) / 86400000);
  if (days < 0) return '';
  if (days === 0) return 'HOY';
  if (days === 1) return 'MANANA';
  return 'EN ' + days + ' DIAS';
}

function venueTimeFor(next, group) {
  if (!next || !group || !Array.isArray(group.matches))
    return { time: '', venue: '' };
  const row = group.matches.find(r => r[2] === next.home && r[3] === next.away);
  return row ? { time: row[1] || '', venue: row[6] || '' }
             : { time: '', venue: '' };
}

function hasDetail(m) {
  const MD = G().MATCH_DETAIL;
  if (!MD || !m.played) return false;
  const d = MD[m.home + '|' + m.away + '|' + m.hs + '-' + m.as];
  return !!(d && d.g && d.g.length);
}

function standingTr(r, isLeader) {
  const df = r[9];
  const dfCls = df > 0 ? 'df-pos' : df < 0 ? 'df-neg' : '';
  const dfStr = df > 0 ? '+' + df : df;
  const featured = r[1] === FEATURED.name;
  const trCls = ((r[0] <= 3 ? 'pos-' + r[0] + ' ' : '')
    + (featured ? 'featured-team ' : '')
    + (isLeader ? 'me-leadrow' : '')).trim();
  return '<tr class="' + trCls + '">'
    + '<td>' + r[0] + '</td>'
    + '<td>' + teamBadge(r[1]) + ' ' + esc(r[1]) + '</td>'
    + '<td class="pts-col">' + r[2] + '</td>'
    + '<td>' + r[3] + '</td>'
    + '<td class="' + dfCls + '">' + dfStr + '</td>'
    + '</tr>';
}

function renderScorers(scorers) {
  if (!scorers.length)
    return '<div class="me-ct">Goleadores del equipo</div>'
      + '<div class="me-empty">Sin goleadores registrados</div>';
  const list = _showAllScorers ? scorers : scorers.slice(0, 5);
  let rows = '';
  list.forEach((p, i) => {
    rows += '<div class="me-scrow">'
      + '<span class="me-scrk">' + (i + 1) + '</span>'
      + '<span class="me-scnm">' + esc(p.name)
        + (i === 0 ? ' &#128081;' : '') + '</span>'
      + '<span class="me-scg">' + p.goals + '</span>'
      + '<span class="me-scpj">' + p.games + ' PJ</span>'
      + '</div>';
  });
  const more = scorers.length > 5
    ? '<div class="me-link" id="meGolToggle">' + (_showAllScorers
        ? 'Ver menos' : 'Ver los ' + scorers.length + ' goleadores')
        + ' &rarr;</div>'
    : '';
  return '<div class="me-ct">Goleadores del equipo '
    + '<span class="me-mut">' + scorers.length + ' jugadores</span></div>'
    + rows + more;
}

function jumpToFullGroup() {
  const catBtn = document.querySelector('.cat-btn[data-cat="prebenjamin"]');
  if (catBtn && !catBtn.classList.contains('active')) catBtn.click();
  S.jorGroup = FEATURED.groupId;
  const tab = document.querySelector('.section-tab[data-section="clasif"]');
  if (tab) tab.click();
  requestAnimationFrame(() => window.scrollTo({ top: 0, behavior: 'smooth' }));
}

export function renderMiEquipo() {
  const c = $('#sec-miequipo');
  if (!c) return;
  c.innerHTML = '';

  const stand = featuredStandingFrom(G().PREBENJAMIN);
  if (!stand) {
    c.innerHTML = '<div class="empty-state"><div class="empty-icon">&#11088;</div>'
      + '<p>No hay datos del equipo esta temporada</p></div>';
    return;
  }
  const group = stand.group, pos = stand.pos, total = stand.total;
  const HISTORY = G().HISTORY;
  const matches = featuredMatchesFrom(HISTORY ? HISTORY[FEATURED.groupId] : null);
  const scorers = featuredScorersFrom(G().GOL_PREBENJ);

  const hero = el('div', 'me-hero');
  hero.innerHTML =
    '<div class="me-crest">' + teamBadge(FEATURED.name) + '</div>'
    + '<div class="me-id"><h2>' + esc(FEATURED.name) + '</h2>'
    + '<div class="me-meta">Prebenjamin &middot; ' + esc(group.name)
      + ' &middot; ' + esc(group.phase) + '</div></div>'
    + '<div class="me-pos"><div class="me-pos-n">' + pos + '&ordm;</div>'
    + '<div class="me-pos-l">DE ' + total + ' EQUIPOS</div></div>';
  c.appendChild(hero);

  const calCard = el('div', 'me-card');
  let lastPlayedIdx = -1;
  for (let i = matches.length - 1; i >= 0; i--)
    if (matches[i].played) { lastPlayedIdx = i; break; }
  const nextIdx = matches.findIndex(m => !m.played);

  let calRows = '';
  matches.forEach((m, i) => {
    if (i === nextIdx) {
      const vt = venueTimeFor(m, group);
      const cd = countdownLabel(m.date);
      calRows += '<div class="me-divnow"><span class="me-ln"></span>'
        + '<span class="me-divt">PROXIMO</span><span class="me-ln"></span></div>';
      calRows += '<div class="me-next"><div class="me-next-top">'
        + '<span class="me-next-j">JORNADA ' + m.jorNum + '</span>'
        + (cd ? '<span class="me-next-cd">' + esc(cd) + '</span>' : '')
        + '</div><div class="me-next-opp">' + teamBadge(m.opp) + ' '
        + esc(m.opp) + ' <span class="me-next-loc">('
        + (m.isHome ? 'casa' : 'fuera') + ')</span></div>'
        + '<div class="me-next-when">&#128197; ' + fmtDate(m.date)
        + (vt.time ? ' &middot; &#128344; ' + esc(vt.time) : '')
        + (vt.venue ? ' &middot; &#128205; ' + esc(vt.venue) : '')
        + '</div></div>';
      return;
    }
    const played = m.played;
    const cls = played
      ? 'me-res ' + (m.result === 'W' ? 'G' : m.result === 'L' ? 'P' : 'E')
      : 'me-res me-next-min';
    const score = played ? (m.hs + '-' + m.as) : fmtDate(m.date);
    const rowCls = ('me-crow' + (!played ? ' me-dim' : '')
      + (i === lastPlayedIdx ? ' me-last' : '')).trim();
    const tappable = played && hasDetail(m);
    calRows += '<div class="' + rowCls + '"'
      + (tappable ? ' data-mi="' + i + '" role="button" tabindex="0"' : '')
      + '><span class="me-jn">J' + m.jorNum + '</span>'
      + '<span class="me-hv">' + (m.isHome ? 'L' : 'V') + '</span>'
      + '<span class="me-o">' + esc(m.opp)
      + (i === lastPlayedIdx ? '<span class="me-taglast">ultimo</span>' : '')
      + (tappable ? ' <span class="me-detail">&#9917;</span>' : '')
      + '</span><span class="' + cls + '">' + esc(score) + '</span></div>';
  });
  if (nextIdx === -1 && matches.length)
    calRows += '<div class="me-crow me-dim"><span class="me-jn">&mdash;</span>'
      + '<span class="me-hv">&middot;</span>'
      + '<span class="me-o">Temporada finalizada</span>'
      + '<span class="me-res">&mdash;</span></div>';
  calCard.innerHTML = '<div class="me-ct">Calendario '
    + '<span class="me-mut">' + matches.length + ' partidos</span></div>'
    + '<div class="me-cal" id="meCal">'
    + (calRows || '<div class="me-empty">Sin partidos</div>') + '</div>';
  c.appendChild(calCard);

  calCard.querySelectorAll('[data-mi]').forEach(node => {
    const open = () => {
      const m = matches[+node.dataset.mi];
      openMatchDetail({ home: m.home, away: m.away, hs: m.hs, as: m.as,
        date: fmtDate(m.date), jornada: 'Jornada ' + m.jorNum,
        groupId: FEATURED.groupId, venue: null });
    };
    node.addEventListener('click', open);
    node.addEventListener('keydown', e => { if (e.key === 'Enter') open(); });
  });

  requestAnimationFrame(() => {
    const cal = $('#meCal');
    const target = cal && cal.querySelector('.me-divnow');
    if (cal && target) cal.scrollTop = target.offsetTop - cal.offsetTop - 8;
    else if (cal) cal.scrollTop = cal.scrollHeight;
  });

  const miniCard = el('div', 'me-card');
  const st = group.standings;
  const lo = Math.max(0, pos - 1 - 3);
  const hi = Math.min(st.length, pos - 1 + 3 + 1);
  const win = st.slice(lo, hi);
  const showLeader = lo > 0;
  let bodyRows = '';
  if (showLeader) bodyRows += standingTr(st[0], true);
  win.forEach(r => { bodyRows += standingTr(r, false); });
  miniCard.innerHTML = '<div class="me-ct">Su posicion en el '
    + esc(group.name) + '</div><div class="table-wrap">'
    + '<table class="standings-table me-mini"><thead><tr><th>#</th>'
    + '<th>Equipo</th><th>PTS</th><th>J</th><th>DIF</th></tr></thead>'
    + '<tbody>' + bodyRows + '</tbody></table></div>'
    + '<div class="me-link" id="meGoGroup">Ver grupo completo &rarr;</div>';
  c.appendChild(miniCard);
  $('#meGoGroup').addEventListener('click', jumpToFullGroup);

  const golCard = el('div', 'me-card');
  const wireToggle = () => {
    const t = golCard.querySelector('#meGolToggle');
    if (t) t.addEventListener('click', () => {
      _showAllScorers = !_showAllScorers;
      golCard.innerHTML = renderScorers(scorers);
      wireToggle();
    });
  };
  golCard.innerHTML = renderScorers(scorers);
  c.appendChild(golCard);
  wireToggle();
}
```

- [ ] **Step 2: Parse-check**

Run: `node --check src/miequipo.js`
Expected: exit 0, no output.

- [ ] **Step 3: Unit suite (no regressions)**

Run: `node --test scripts/tests/test_js_modules.mjs`
Expected: PASS.

- [ ] **Step 4: Visual smoke check**

```bash
(pkill -f "http.server 8899" 2>/dev/null; true) && (python3 -m http.server 8899 >/tmp/fb.log 2>&1 &) && sleep 1 && curl -s -o /dev/null -w "%{http_code}\n" http://localhost:8899/
```
Expected `200`. Browser: hero (Las Mesas Hu., "9 / DE 15 EQUIPOS"), calendar with amber PROXIMO card and "ultimo" tag, mini-table with featured row tinted, scorers with crown + working toggle.

- [ ] **Step 5: Commit**
```bash
git add src/miequipo.js
git commit -m "feat(miequipo): full dashboard render (hero/calendario/mini-tabla/goleadores)"
```

---

## Task 5: Global highlight of the featured team

**Files:** `src/render.js`, `src/state.js`, `style.css`

- [ ] **Step 1: Import isFeatured into render.js** -- add `isFeatured` to the line 1 import from `./state.js` (append it to the existing destructured list).

- [ ] **Step 2: `buildStandingsTable`** -- find (~line 229):
```js
    const cls = pos <= 3 ? `pos-${pos}` : '';
    html += `<tr class="${cls}">`;
```
Replace with:
```js
    const cls = (pos <= 3 ? `pos-${pos}` : '') + (isFeatured(row[1]) ? ' featured-team' : '');
    html += `<tr class="${cls.trim()}">`;
```

- [ ] **Step 3: `renderMatchCards`** -- find (~line 472):
```js
    const card = el('div', `match-card ${hasScore ? 'completed' : 'upcoming'}`);
```
Replace with:
```js
    const featuredCls = (isFeatured(m.home) || isFeatured(m.away)) ? ' featured-team' : '';
    const card = el('div', `match-card ${hasScore ? 'completed' : 'upcoming'}${featuredCls}`);
```

- [ ] **Step 4: `buildKnockoutBracket`** -- find (~line 187-188):
```js
      const homeClass = `bracket-team${homeWin ? ' winner' : ''}${draw ? ' draw' : ''}`;
      const awayClass = `bracket-team${awayWin ? ' winner' : ''}${draw ? ' draw' : ''}`;
```
Replace with:
```js
      const homeClass = `bracket-team${homeWin ? ' winner' : ''}${draw ? ' draw' : ''}${isFeatured(home) ? ' featured-team' : ''}`;
      const awayClass = `bracket-team${awayWin ? ' winner' : ''}${draw ? ' draw' : ''}${isFeatured(away) ? ' featured-team' : ''}`;
```

- [ ] **Step 5: `buildUnifiedPrebenjamin` in state.js** -- find (~line 228-230):
```js
    const cls = pos <= 3 ? 'pos-' + pos : '';
    const dfCls = t.df > 0 ? 'df-pos' : (t.df < 0 ? 'df-neg' : '');
    const dfStr = t.df > 0 ? '+' + t.df : t.df;
    html += `<tr class="${cls}">`;
```
Replace with:
```js
    const cls = (pos <= 3 ? 'pos-' + pos : '') + (isFeatured(t.name) ? ' featured-team' : '');
    const dfCls = t.df > 0 ? 'df-pos' : (t.df < 0 ? 'df-neg' : '');
    const dfStr = t.df > 0 ? '+' + t.df : t.df;
    html += `<tr class="${cls.trim()}">`;
```
(`isFeatured` is in the same module -- no import.)

- [ ] **Step 6: Highlight CSS** -- in `style.css`, after `.standings-table .df-neg {...}` (~line 489):
```css
/* ====== FEATURED TEAM HIGHLIGHT ====== */
.standings-table tr.featured-team td { background: var(--accent-dim); color: var(--text); }
.standings-table tr.featured-team td:nth-child(2) { font-weight: 700; box-shadow: inset 3px 0 0 var(--accent); }
.match-card.featured-team { border-color: var(--green-border); box-shadow: inset 0 0 0 1px var(--accent-dim); }
.bracket-team.featured-team { box-shadow: inset 3px 0 0 var(--accent); }
.bracket-team.featured-team .bracket-team-name { font-weight: 700; }
```

- [ ] **Step 7: Parse + suite**

Run: `node --check src/render.js && node --check src/state.js && node --test scripts/tests/test_js_modules.mjs`
Expected: no syntax errors; all tests PASS.

- [ ] **Step 8: Visual check** -- CLASIFICACIONES -> Prebenjamin -> expand Grupo 2: "Las Mesas Hu." tinted with green bar. A benjamin group with "Las Mesas Hu." also highlighted. "Las Mesas B" NOT highlighted.

- [ ] **Step 9: Commit**
```bash
git add src/render.js src/state.js style.css
git commit -m "feat(miequipo): global featured-team highlight across tables/matches/brackets"
```

---

## Task 6: Dashboard styling (me-*)

**Files:** `style.css`

- [ ] **Step 1: Add the me-* block** -- in `style.css`, immediately before `/* ====== RESPONSIVE ====== */` (~line 779), insert:

```css
/* ====== MI EQUIPO DASHBOARD ====== */
#sec-miequipo { display: none; }
#sec-miequipo.active { display: flex; flex-direction: column; gap: 14px; max-width: 760px; margin: 0 auto; }
.me-hero { display: flex; align-items: center; gap: 15px; background: linear-gradient(150deg, var(--card-hover) 0%, var(--card) 60%); border: 1px solid var(--border); border-radius: 18px; padding: 18px; position: relative; overflow: hidden; }
.me-hero::after { content: ""; position: absolute; right: -40px; top: -30px; width: 170px; height: 170px; background: radial-gradient(circle, var(--accent-dim), transparent 70%); }
.me-crest .team-badge { width: 64px; height: 64px; font-size: 22px; border-radius: 15px; }
.me-id h2 { font-size: 21px; font-weight: 700; line-height: 1.15; }
.me-meta { color: var(--text2); font-size: 12.5px; margin-top: 4px; }
.me-pos { margin-left: auto; text-align: center; }
.me-pos-n { font-size: 34px; font-weight: 800; color: var(--accent); line-height: 1; }
.me-pos-l { font-size: 10.5px; color: var(--text3); letter-spacing: .5px; margin-top: 2px; }
.me-card { background: var(--card); border: 1px solid var(--border); border-radius: 16px; padding: 14px; }
.me-ct { font-size: 11px; letter-spacing: .7px; color: var(--text3); font-weight: 700; text-transform: uppercase; margin-bottom: 10px; display: flex; justify-content: space-between; }
.me-mut { color: var(--text3); font-weight: 600; letter-spacing: 0; text-transform: none; }
.me-empty { color: var(--text2); font-size: 13px; padding: 10px 2px; }
.me-link { margin-top: 10px; font-size: 12px; color: var(--accent); font-weight: 700; cursor: pointer; }
.me-link:hover { text-decoration: underline; }
.me-cal { display: flex; flex-direction: column; max-height: 320px; overflow-y: auto; }
.me-crow { display: flex; align-items: center; gap: 9px; padding: 9px 4px; border-top: 1px solid var(--border); font-size: 12.5px; }
.me-crow:first-child { border-top: 0; }
.me-crow.me-dim { opacity: .5; }
.me-crow.me-last { background: rgba(127,127,127,.06); }
.me-crow[data-mi] { cursor: pointer; }
.me-crow[data-mi]:hover { background: var(--card-hover); }
.me-jn { font-size: 10px; color: var(--text3); width: 32px; flex: 0 0 32px; }
.me-hv { font-size: 9px; font-weight: 800; width: 14px; color: var(--text3); }
.me-o { flex: 1; color: var(--text); font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.me-res { font-weight: 800; width: 46px; text-align: right; }
.me-res.G { color: var(--accent); }
.me-res.E { color: var(--text2); }
.me-res.P { color: var(--red); }
.me-res.me-next-min { color: var(--text3); font-size: 11px; font-weight: 700; }
.me-taglast { font-size: 9px; color: var(--text3); font-weight: 700; margin-left: 6px; border: 1px solid var(--border); padding: 1px 5px; border-radius: 5px; }
.me-detail { opacity: .8; }
.me-divnow { display: flex; align-items: center; gap: 8px; margin: 10px 0 2px; }
.me-ln { flex: 1; height: 1px; background: linear-gradient(90deg, transparent, var(--amber), transparent); }
.me-divt { font-size: 9.5px; font-weight: 800; letter-spacing: 1px; color: var(--amber); }
.me-next { background: rgba(255,193,7,.08); border: 1px solid rgba(255,193,7,.35); border-radius: 12px; padding: 12px; margin: 2px 0; }
.me-next-top { display: flex; align-items: center; gap: 9px; }
.me-next-j { font-size: 10px; font-weight: 800; color: var(--amber); }
.me-next-cd { margin-left: auto; font-size: 10px; font-weight: 800; color: var(--amber); background: rgba(255,193,7,.16); padding: 3px 7px; border-radius: 6px; }
.me-next-opp { font-size: 16px; font-weight: 700; margin-top: 7px; }
.me-next-opp .team-badge { width: 22px; height: 22px; font-size: 8px; vertical-align: -5px; }
.me-next-loc { color: var(--text3); font-weight: 600; font-size: 13px; }
.me-next-when { font-size: 12px; color: var(--text2); margin-top: 4px; }
.me-mini tr.me-leadrow td { border-bottom: 2px solid var(--border); }
.me-scrow { display: flex; align-items: center; gap: 10px; padding: 8px 2px; border-top: 1px solid var(--border); font-size: 13px; }
.me-scrow:first-of-type { border-top: 0; }
.me-scrk { width: 18px; color: var(--text3); font-size: 12px; text-align: center; }
.me-scnm { flex: 1; font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.me-scg { font-weight: 800; color: var(--accent); width: 30px; text-align: right; }
.me-scpj { font-size: 11px; color: var(--text3); width: 50px; text-align: right; }
```

- [ ] **Step 2: Mobile tweaks + tab fade** -- inside the existing `@media (max-width: 768px) {` block (~line 780), before its closing `}`:
```css
  #sec-miequipo.active { gap: 12px; }
  .me-hero { padding: 14px; gap: 12px; }
  .me-crest .team-badge { width: 54px; height: 54px; }
  .me-id h2 { font-size: 18px; }
  .me-pos-n { font-size: 28px; }
  .section-tabs { -webkit-mask-image: linear-gradient(90deg, #000 90%, transparent); mask-image: linear-gradient(90deg, #000 90%, transparent); }
```

- [ ] **Step 3: Featured accent on the MI EQUIPO tab** -- after `.section-tab.disabled {...}` (~line 286):
```css
.section-tab[data-section="miequipo"] { color: var(--accent); opacity: .75; }
.section-tab[data-section="miequipo"].active { opacity: 1; }
```

- [ ] **Step 4: Load check**

Run:
```bash
cd /home/manolo/claude/futbol-base && (pkill -f "http.server 8899" 2>/dev/null; true) && (python3 -m http.server 8899 >/tmp/fb.log 2>&1 &) && sleep 1 && curl -s -o /dev/null -w "%{http_code}\n" http://localhost:8899/style.css
```
Expected: `200`.

- [ ] **Step 5: Commit**
```bash
git add style.css
git commit -m "style(miequipo): dashboard me-* styles, tab fade, theme-var driven"
```

---

## Task 7: Cache-bust (sw.js + index.html)

**Files:** `sw.js`, `index.html`

- [ ] **Step 1: Inspect** -- `grep -n "CACHE_NAME" sw.js` (expect `const CACHE_NAME = 'futbolbase-v...';`)

- [ ] **Step 2: Bump cache name**
```bash
sed -i "s/futbolbase-v[0-9a-z]*/futbolbase-v20260518a/" sw.js && grep -n CACHE_NAME sw.js
```
Expected: line now contains `futbolbase-v20260518a`.

- [ ] **Step 3: Bump every ?v= in index.html** -- first inspect, then replace the current value:
```bash
grep -n '?v=' index.html | head -20
sed -i 's/?v=20260518"/?v=20260518a"/g' index.html && grep -n '?v=' index.html | head -20
```
Expected: every data/app `<script>` ends with `?v=20260518a"`. If the current value differs from `?v=20260518`, adapt the sed left-hand side to the actual value seen in the first grep. No extra `<script>` for `miequipo.js` -- it is imported by `render.js`. Verify: `grep -n "miequipo" src/render.js` shows the import + route.

- [ ] **Step 4: Footer date** -- confirm the "Ultima actualizacion" `<p>` exists; do NOT hand-edit (generate_js.py territory). No-op verification.

- [ ] **Step 5: Commit**
```bash
git add sw.js index.html
git commit -m "chore(miequipo): cache-bust sw.js + index.html ?v=20260518a"
```

---

## Task 8: Full verification

**Files:** none (verification only)

- [ ] **Step 1: Full suites**
```bash
cd /home/manolo/claude/futbol-base && node --test scripts/tests/test_js_modules.mjs && python3 -m pytest scripts/tests/ -q
```
Expected: Node suite all PASS (incl. new featured tests); pytest all PASS (no regressions; they do not touch the front -- must stay green).

- [ ] **Step 2: Screenshots (Playwright), MI EQUIPO** at 1280x900 and 390x844, dark + light (toggle via the moon button). Verify: hero text + position; calendar auto-scrolled to PROXIMO, "ultimo" tag, colored results; mini-table leader+window with featured tint; scorers crown + toggle; light theme readable (no hardcoded dark leak).

- [ ] **Step 3: Regression pass** -- CLASIFICACIONES/JORNADAS/GOLEADORES/POR ISLA/ESTADISTICAS render as before; season selector + category toggle + stats-bar visible there, hidden on MI EQUIPO; season switching still works; "Las Mesas Hu." highlighted in standings/matches, "Las Mesas B" not.

- [ ] **Step 4: Acceptance sign-off** -- re-read spec section 11; confirm all 10 criteria. Any miss becomes a new task, not a silent pass.

- [ ] **Step 5: Final commit (only if fixes were needed)**
```bash
git add -A && git commit -m "fix(miequipo): verification adjustments"
```
Do NOT push (operational rule -- update.yml owns pushes).

---

## Notes for the implementer

- **Never push.** Local commits only.
- Page globals from data-*.js: `PREBENJAMIN`, `HISTORY`, `GOL_PREBENJ`, `MATCH_DETAIL`, `SHIELDS`, `STATS`, `SEASONS`, `BENJAMIN`. `miequipo.js` reads them via `globalThis`; the pure helpers take them as args so they stay testable.
- Every team/player/opponent string reaches `.innerHTML` only through `esc()` (see Security section). Numbers are not user-controlled.
- Source discrepancy is expected and intentional: hero/mini-table use official `PREBENJAMIN` standings; calendar uses `HISTORY['PG2']`. Do not reconcile.
