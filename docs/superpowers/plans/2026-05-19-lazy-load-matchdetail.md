# Lazy-load data-matchdetail.js Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove the 359 KB eager-blocking `data-matchdetail.js` from initial load: ship a tiny eager keys index for the ⚽ badge and lazy-fetch the full goal-timeline data only when a match modal is opened.

**Architecture:** New generated `data-matchdetail-keys.js` (`const MATCH_DETAIL_KEYS={key:1,…}`) loaded eager (small, for badges). `data-matchdetail.js` keeps its content but loses its `<script>` tag; `ensureMatchDetail()` in `src/state.js` fetch+parses it on first modal open (single-flight cache, mirroring the existing `loadAllHistoricalSeasons` season-file pattern). Badge consumers read the keys map; the modal renders its goal timeline after the lazy fetch resolves (mirroring the existing fire-and-forget `loadCrossSeasonHistory` pattern in `modals.js`).

**Tech Stack:** Vanilla ES modules, static GitHub Pages site, Python generator (`scripts/generate_js.py`). Tests: `node --test` + `pytest`.

**Spec:** `docs/superpowers/specs/2026-05-19-lazy-load-matchdetail-design.md`

---

## Security / conventions

The codebase renders via escaped `.innerHTML` (`_esc`/`escHtml`/`esc`). This plan does NOT change that model: the moved goal-timeline markup keeps the exact original interpolations (FIFLP-sourced scorer names are project-trusted DB data, same as today — no new sanitization regression). Data globals from `data-*.js` are top-level `const` in classic scripts → global LEXICAL bindings, NOT properties of `globalThis` (see 2026-05-18 root cause). Read `MATCH_DETAIL_KEYS` as a bare identifier guarded with `typeof`, never `globalThis`.

## File Structure

| File | Responsibility |
|---|---|
| `scripts/generate_js.py` (modify) | New `generate_matchdetail_keys_js(conn)` + call in `main()`; keeps `data-matchdetail-keys.js` in sync on every `update.yml` run |
| `data-matchdetail-keys.js` (create, generated) | Eager `const MATCH_DETAIL_KEYS={"H|A|h-a":1,…}` — O(1) presence map of matches with a goal timeline |
| `index.html` (modify) | Swap the `data-matchdetail.js` `<script>` for `data-matchdetail-keys.js`; cache-bump `?v=` |
| `src/state.js` (modify) | `export async function ensureMatchDetail()` — lazy fetch+parse+single-flight cache of full `MATCH_DETAIL` |
| `src/render.js` (modify) | Badge uses `MATCH_DETAIL_KEYS` instead of full `MATCH_DETAIL` |
| `src/miequipo.js` (modify) | `hasDetail()` uses `MATCH_DETAIL_KEYS` |
| `src/modals.js` (modify) | Extract goals markup to `buildGoalsHtml()`; render goals after `ensureMatchDetail()` resolves into a `#modalGoalsSection` placeholder |
| `sw.js` (modify) | Drop `./data-matchdetail.js` from `STATIC_ASSETS`, add `./data-matchdetail-keys.js`, bump `CACHE_NAME` |
| `scripts/tests/test_js_modules.mjs` (modify) | Build-invariant test + source-contract test; extend `probes` |

**Operational rules:** isolated worktree/branch; NEVER `git push` (the agent doesn't push; finishing handles it); local commits only; bump `CACHE_NAME`+`?v=`; do NOT run scrapers or full regen — only generate the one keys file from the tracked DB; `data-*.js` are generated, not hand-edited.

Release version string used in this plan: **`20260519a`** (use exactly this in `index.html ?v=` and `sw.js CACHE_NAME`).

---

## Task 1: generator emits the keys index

**Files:**
- Modify: `scripts/generate_js.py` (add function after `generate_matchdetail_js`, ~line 193; add call in `main()` after the `data-matchdetail.js` write, ~line 712)

- [ ] **Step 1: Add `generate_matchdetail_keys_js`** — in `scripts/generate_js.py`, immediately AFTER the `generate_matchdetail_js` function (it ends with `return js` then a blank line before `def generate_shields_js`), insert:

```python
def generate_matchdetail_keys_js(conn):
    """Generate data-matchdetail-keys.js: an O(1) presence map of the match
    keys that have a goal timeline, so the ⚽ badge can render without loading
    the full (~359 KB) data-matchdetail.js. Same JOIN as
    generate_matchdetail_js, so the key set is identical by construction."""
    header = (
        "// data-matchdetail-keys.js — generado por scripts/generate_js.py\n"
        "// NO editar manualmente — usar scripts/update.sh para regenerar\n\n"
    )
    rows = conn.execute(
        """SELECT DISTINCT h.name, a.name, m.home_score, m.away_score
           FROM matches m
           JOIN teams h ON m.home_team_id = h.id
           JOIN teams a ON m.away_team_id = a.id
           JOIN goals g ON g.match_id = m.id
           ORDER BY m.id""",
    ).fetchall()
    keys = {f"{home}|{away}|{hs}-{as_}": 1 for home, away, hs, as_ in rows}
    return header + "const MATCH_DETAIL_KEYS=" + js_val(keys) + ";"
```

- [ ] **Step 2: Call it in `main()`** — in `scripts/generate_js.py` `main()`, find:

```python
    print("4. data-matchdetail.js")
    write_file("data-matchdetail.js", generate_matchdetail_js(conn))
```
Insert directly after it:
```python
    print("4b. data-matchdetail-keys.js")
    write_file("data-matchdetail-keys.js", generate_matchdetail_keys_js(conn))
```

- [ ] **Step 3: Generate the initial artifact from the tracked DB** (generation step, not hand-editing; does NOT regen other files or bump ?v=). Run from repo root:

```bash
python3 -c "
import sys, os
sys.path.insert(0, 'scripts')
from db import get_connection
from generate_js import generate_matchdetail_keys_js
conn = get_connection()          # exactly mirrors generate_js.py main() line 697
out = generate_matchdetail_keys_js(conn)
open('data-matchdetail-keys.js', 'w', encoding='utf-8').write(out)
conn.close()
print('bytes:', os.path.getsize('data-matchdetail-keys.js'))
"
```
Expected: prints `bytes:` with a value roughly 20000–60000 (≪ 359277). (`db.get_connection(db_path=None)` defaults to the tracked `futbolbase.db`; this is the same call `main()` uses — verified, no DB args needed.)

- [ ] **Step 4: Verify the artifact parses and matches** — run:
```bash
node -e "
const fs=require('fs');
const t=fs.readFileSync('data-matchdetail-keys.js','utf8');
const m=t.match(/const MATCH_DETAIL_KEYS=(\{[\s\S]*\});/);
const keys=JSON.parse(m[1]);
const d=fs.readFileSync('data-matchdetail.js','utf8').match(/const MATCH_DETAIL=(\{[\s\S]*\});/);
const MD=JSON.parse(d[1]);
const exp=Object.keys(MD).filter(k=>MD[k]&&MD[k].g&&MD[k].g.length>0).sort();
const got=Object.keys(keys).sort();
console.log('keys:',got.length,'expected:',exp.length,'equal:',JSON.stringify(got)===JSON.stringify(exp));
"
```
Expected: `equal: true` and a non-zero count.

- [ ] **Step 5: Commit**
```bash
git add scripts/generate_js.py data-matchdetail-keys.js
git commit -m "feat(perf): generate data-matchdetail-keys.js index (badge without 359KB)"
```

---

## Task 2: lazy loader `ensureMatchDetail()` in state.js

**Files:**
- Modify: `src/state.js` (add an exported function; anchor: immediately BEFORE the line `/* Get last N results for a team from HISTORY */` which precedes `export function getTeamForm`)
- Test: `scripts/tests/test_js_modules.mjs`

- [ ] **Step 1: Write the failing source-contract test** — append to `scripts/tests/test_js_modules.mjs`:

```js
// lazy matchdetail loader contract
test('state.js exports a single-flight ensureMatchDetail loader', () => {
  const s = readFileSync(join(ROOT, 'src/state.js'), 'utf8');
  assert.ok(/export async function ensureMatchDetail\s*\(/.test(s),
    'state.js must export async ensureMatchDetail()');
  assert.ok(/_matchDetailPromise/.test(s), 'must single-flight via a cached promise');
  assert.ok(/fetch\(`?\.\/data-matchdetail\.js/.test(s),
    'must fetch ./data-matchdetail.js');
  assert.ok(!/globalThis|window\.\s*MATCH_DETAIL/.test(s),
    'must not use globalThis/window for matchdetail');
});
```

- [ ] **Step 2: Run, verify FAIL** — `node --test scripts/tests/test_js_modules.mjs` → the new test FAILS (function absent). Note counts.

- [ ] **Step 3: Implement** — in `src/state.js`, immediately BEFORE the comment line `/* Get last N results for a team from HISTORY */`, insert:

```js
/* Lazy loader for the full goal-timeline data. data-matchdetail.js is no
 * longer an eager <script> (it is ~359 KB); fetch+parse it on demand the
 * first time a match modal needs it. Single-flight + module cache. Mirrors
 * loadAllHistoricalSeasons() in modals.js. ?v= is inherited from the eager
 * data-matchdetail-keys.js script tag so cache-busting stays aligned. */
let _matchDetail = null;
let _matchDetailPromise = null;
export async function ensureMatchDetail() {
  if (_matchDetail) return _matchDetail;
  if (_matchDetailPromise) return _matchDetailPromise;
  _matchDetailPromise = (async () => {
    const ver = (document.querySelector('script[src*="data-matchdetail-keys.js"]')
      ?.src.match(/v=([^&]+)/)?.[1]) || '';
    try {
      const r = await fetch(`./data-matchdetail.js${ver ? `?v=${ver}` : ''}`);
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const txt = await r.text();
      const m = txt.match(/const MATCH_DETAIL=(\{[\s\S]*\});/);
      if (!m) throw new Error('MATCH_DETAIL not found in data-matchdetail.js');
      _matchDetail = JSON.parse(m[1]);
    } catch (e) {
      console.error('[state] ensureMatchDetail failed:', e);
      _matchDetail = {};
    }
    return _matchDetail;
  })();
  return _matchDetailPromise;
}
```

- [ ] **Step 4: Run, verify PASS** — `node --test scripts/tests/test_js_modules.mjs` → all pass (prior + new). `node --check src/state.js` → clean.

- [ ] **Step 5: Commit**
```bash
git add src/state.js scripts/tests/test_js_modules.mjs
git commit -m "feat(perf): ensureMatchDetail() lazy single-flight loader"
```

---

## Task 3: badge consumers use the keys map

**Files:**
- Modify: `src/render.js` (`renderMatchCards`, the `hasDetail` const ~line 497-499)
- Modify: `src/miequipo.js` (`hasDetail` function, ~line 56-62)
- Test: `scripts/tests/test_js_modules.mjs`

- [ ] **Step 1: Write the failing test** — append to `scripts/tests/test_js_modules.mjs`:

```js
// badge must use the lightweight keys map, never the full object
test('badge consumers use MATCH_DETAIL_KEYS, not full MATCH_DETAIL', () => {
  const render = readFileSync(join(ROOT, 'src/render.js'), 'utf8');
  const mieq = readFileSync(join(ROOT, 'src/miequipo.js'), 'utf8');
  assert.ok(/MATCH_DETAIL_KEYS/.test(render), 'render.js uses MATCH_DETAIL_KEYS');
  assert.ok(/MATCH_DETAIL_KEYS/.test(mieq), 'miequipo.js uses MATCH_DETAIL_KEYS');
  assert.ok(!/\bMATCH_DETAIL\b/.test(render),
    'render.js must not reference full MATCH_DETAIL (\\b excludes _KEYS)');
  assert.ok(!/\bMATCH_DETAIL\b/.test(mieq),
    'miequipo.js must not reference full MATCH_DETAIL');
});
```
(Note: `\bMATCH_DETAIL\b` does NOT match inside `MATCH_DETAIL_KEYS` because `_` is a word char — no boundary.)

- [ ] **Step 2: Run, verify FAIL** — `node --test scripts/tests/test_js_modules.mjs` → new test FAILS (files still say `MATCH_DETAIL[...]`).

- [ ] **Step 3a: Fix `src/render.js`** — find exactly:
```js
    const detailKey = `${m.home}|${m.away}|${m.hs}-${m.as}`;
    const hasDetail = hasScore
      && typeof MATCH_DETAIL !== 'undefined'
      && MATCH_DETAIL[detailKey]?.g?.length > 0;
```
Replace with:
```js
    const detailKey = `${m.home}|${m.away}|${m.hs}-${m.as}`;
    const hasDetail = hasScore
      && typeof MATCH_DETAIL_KEYS !== 'undefined'
      && !!MATCH_DETAIL_KEYS[detailKey];
```

- [ ] **Step 3b: Fix `src/miequipo.js`** — find exactly:
```js
function hasDetail(m) {
  const MD = typeof MATCH_DETAIL !== 'undefined' ? MATCH_DETAIL : null;
  if (!MD || !m.played) return false;
  const d = MD[m.home + '|' + m.away + '|' + m.hs + '-' + m.as];
  return !!(d && d.g && d.g.length);
}
```
Replace with:
```js
function hasDetail(m) {
  if (!m.played) return false;
  return typeof MATCH_DETAIL_KEYS !== 'undefined'
    && !!MATCH_DETAIL_KEYS[m.home + '|' + m.away + '|' + m.hs + '-' + m.as];
}
```

- [ ] **Step 4: Run, verify PASS** — `node --test scripts/tests/test_js_modules.mjs` → all pass. `node --check src/render.js src/miequipo.js` → clean.

- [ ] **Step 5: Commit**
```bash
git add src/render.js src/miequipo.js scripts/tests/test_js_modules.mjs
git commit -m "feat(perf): ⚽ badge reads MATCH_DETAIL_KEYS (no heavy data needed)"
```

---

## Task 4: modal renders goals after lazy load

**Files:**
- Modify: `src/modals.js` (import line 1; the goals `if` block ~line 151-182; the tail of `openMatchDetail` ~line 200-206)

- [ ] **Step 1: Add the import** — `src/modals.js` line 1 currently:
```js
import { el, $, getData, teamBadge, normalizeTeamName, isHistorical, buildSparkline, S } from './state.js';
```
Replace with (append `ensureMatchDetail`):
```js
import { el, $, getData, teamBadge, normalizeTeamName, isHistorical, buildSparkline, S, ensureMatchDetail } from './state.js';
```

- [ ] **Step 2: Add the reusable goals-HTML helper** — in `src/modals.js`, add this module-level function immediately ABOVE `export function openMatchDetail(match) {`:

```js
/* Build the goal-timeline section HTML for a match detail entry.
 * Extracted so it can be rendered after the lazy ensureMatchDetail() fetch.
 * Markup identical to the previous inline version. */
function buildGoalsHtml(detail, venue) {
  let h = '<div class="modal-goals-section">';
  h += '<div class="modal-stats-header">⚽ Cronología de goles</div>';
  const venueToShow = detail.v || venue;
  if (venueToShow) h += `<div class="modal-venue">📍 ${venueToShow}</div>`;
  if (detail.r) h += `<div class="modal-venue">📝 Árbitro: ${detail.r}</div>`;
  h += '<div class="goals-timeline">';
  detail.g.forEach(g => {
    // g: [minute, name, running, 'h'/'a', type_char]
    const min = g[0];
    const scorer = g[1];
    const running = g[2];
    const side = g[3];
    const gtype = g[4];
    const isHome = side === 'h';
    const typeIcon = gtype === 'p' ? ' (pen.)' : gtype === 'o' ? ' (p.p.)' : '';
    const sideClass = isHome ? 'goal-home' : 'goal-away';
    h += `<div class="goal-event ${sideClass}">
      <div class="goal-minute">${min}'</div>
      <div class="goal-info">
        <span class="goal-scorer">${scorer}${typeIcon}</span>
        <span class="goal-running">${running}</span>
      </div>
    </div>`;
  });
  h += '</div></div>';
  return h;
}
```

- [ ] **Step 3: Remove the synchronous goals block** — in `openMatchDetail`, delete exactly this block (it sits between the head-to-head section and the "Streaks comparison from STATS" comment):
```js
  // Match detail: goal scorers and minutes from FIFLP data
  if (typeof MATCH_DETAIL !== 'undefined') {
    const detailKey = `${home}|${away}|${hs}-${as}`;
    const detail = MATCH_DETAIL[detailKey];
    if (detail && detail.g && detail.g.length > 0) {
      bodyHtml += '<div class="modal-goals-section">';
      bodyHtml += '<div class="modal-stats-header">⚽ Cronología de goles</div>';
      const venueToShow = detail.v || venue;
      if (venueToShow) bodyHtml += `<div class="modal-venue">📍 ${venueToShow}</div>`;
      if (detail.r) bodyHtml += `<div class="modal-venue">📝 Árbitro: ${detail.r}</div>`;
      bodyHtml += '<div class="goals-timeline">';
      detail.g.forEach(g => {
        // g: [minute, name, running, 'h'/'a', type_char]
        const min = g[0];
        const scorer = g[1];
        const running = g[2];
        const side = g[3]; // 'h' or 'a'
        const gtype = g[4]; // 'r', 'p', 'o'
        const isHome = side === 'h';
        const typeIcon = gtype === 'p' ? ' (pen.)' : gtype === 'o' ? ' (p.p.)' : '';
        const sideClass = isHome ? 'goal-home' : 'goal-away';
        bodyHtml += `<div class="goal-event ${sideClass}">
          <div class="goal-minute">${min}'</div>
          <div class="goal-info">
            <span class="goal-scorer">${scorer}${typeIcon}</span>
            <span class="goal-running">${running}</span>
          </div>
        </div>`;
      });
      bodyHtml += '</div></div>';
    }
  }
```
Replace it with NOTHING (delete the whole block; the streaks block follows directly).

- [ ] **Step 4: Append the placeholder + async fill** — in `openMatchDetail`, the tail currently reads:
```js
  if (!bodyHtml) {
    bodyHtml = '<div class="modal-h2h-empty">No hay datos adicionales disponibles para este partido</div>';
  }

  modalBody.innerHTML = bodyHtml;
  modalOverlay.classList.add('open');
}
```
Replace it with:
```js
  if (!bodyHtml) {
    bodyHtml = '<div class="modal-h2h-empty">No hay datos adicionales disponibles para este partido</div>';
  }

  // Goal timeline is lazy: placeholder now, fill after ensureMatchDetail().
  // Placed after the empty-state check so it never suppresses that message;
  // the timeline renders at the end of the modal body (was between h2h and
  // streaks — minor, intentional reorder to keep the empty-state correct).
  bodyHtml += '<div id="modalGoalsSection"></div>';

  modalBody.innerHTML = bodyHtml;
  modalOverlay.classList.add('open');

  // Fire-and-forget, same pattern as loadCrossSeasonHistory(): the modal is
  // already open; fill the goals section once the lazy data resolves.
  const _detailKey = `${home}|${away}|${hs}-${as}`;
  ensureMatchDetail().then(md => {
    const detail = md && md[_detailKey];
    if (detail && detail.g && detail.g.length > 0) {
      const slot = document.getElementById('modalGoalsSection');
      if (slot) slot.innerHTML = buildGoalsHtml(detail, venue);
    }
  });
}
```
(`home, away, hs, as, venue` are already destructured at the top of `openMatchDetail` from `match` — confirm that line `const { home, away, hs, as, date, jornada, groupId, venue } = match;` exists; if the destructure names differ, adapt the `_detailKey`/`venue` references accordingly.)

- [ ] **Step 5: Verify** — `node --check src/modals.js` → clean. `node --test scripts/tests/test_js_modules.mjs` → all pass (no regressions). `grep -n "MATCH_DETAIL\b" src/modals.js` → no bare full-object synchronous use remains (only `ensureMatchDetail`/`MATCH_DETAIL_KEYS`-free; the helper uses `detail` param, not the global).

- [ ] **Step 6: Commit**
```bash
git add src/modals.js
git commit -m "feat(perf): modal renders goal timeline after lazy ensureMatchDetail"
```

---

## Task 5: index.html + sw.js wiring

**Files:**
- Modify: `index.html` (line ~104)
- Modify: `sw.js` (`STATIC_ASSETS` line ~18; `CACHE_NAME` line 1)
- Test: `scripts/tests/test_js_modules.mjs`

- [ ] **Step 1: Write the failing test** — append to `scripts/tests/test_js_modules.mjs`:

```js
// wiring: eager keys file, lazy heavy file, sw not precaching the heavy one
test('index.html + sw.js wired for lazy matchdetail', () => {
  const idx = readFileSync(join(ROOT, 'index.html'), 'utf8');
  const sw = readFileSync(join(ROOT, 'sw.js'), 'utf8');
  assert.ok(/<script src="\.\/data-matchdetail-keys\.js\?v=/.test(idx),
    'index.html must eager-load data-matchdetail-keys.js');
  assert.ok(!/<script src="\.\/data-matchdetail\.js\?v=/.test(idx),
    'index.html must NOT eager-load the heavy data-matchdetail.js');
  assert.ok(!/['"]\.\/data-matchdetail\.js['"]/.test(sw),
    'sw.js STATIC_ASSETS must not precache data-matchdetail.js');
  assert.ok(/['"]\.\/data-matchdetail-keys\.js['"]/.test(sw),
    'sw.js must precache data-matchdetail-keys.js');
});
```

- [ ] **Step 2: Run, verify FAIL** — `node --test scripts/tests/test_js_modules.mjs` → new test FAILS.

- [ ] **Step 3: index.html** — find exactly:
```html
  <script src="./data-matchdetail.js?v=20260518a"></script>
```
Replace with:
```html
  <script src="./data-matchdetail-keys.js?v=20260519a"></script>
```
Then bump every other `?v=20260518a` to `?v=20260519a` in index.html:
```bash
sed -i 's/?v=20260518a"/?v=20260519a"/g' index.html && grep -n '?v=' index.html | head -20
```
Expected: every data/app `<script>` ends with `?v=20260519a"`; the matchdetail line is now `data-matchdetail-keys.js?v=20260519a`. (If current value is not `20260518a`, first `grep -n '?v=' index.html` and adapt the sed left side.)

- [ ] **Step 4: sw.js** — (a) bump cache name:
```bash
sed -i "s/futbolbase-v[0-9a-z]*/futbolbase-v20260519a/" sw.js && grep -n CACHE_NAME sw.js
```
(b) In `STATIC_ASSETS`, find the line `  './data-matchdetail.js',` and replace it with `  './data-matchdetail-keys.js',` (swap heavy → keys; keep array order/commas valid).

- [ ] **Step 5: Run, verify PASS + parse** — `node --test scripts/tests/test_js_modules.mjs` → all pass. `node --check sw.js` → clean. `python3 -c "s=open('sw.js').read();print(s.count('{'),s.count('}'))"` braces balanced (sanity).

- [ ] **Step 6: Commit**
```bash
git add index.html sw.js scripts/tests/test_js_modules.mjs
git commit -m "feat(perf): eager keys script + sw drops heavy matchdetail; cache-bump v20260519a"
```

---

## Task 6: build-invariant test + probes

**Files:**
- Modify: `scripts/tests/test_js_modules.mjs` (extend `probes`; add invariant test)

- [ ] **Step 1: Extend the probes array** — in `loadDataFile`, the `probes` array currently ends with `'GOL_BENJ', 'GOL_PREBENJ',`. Add `'MATCH_DETAIL', 'MATCH_DETAIL_KEYS',` to it (same line style).

- [ ] **Step 2: Write the failing invariant test** — append to `scripts/tests/test_js_modules.mjs`:

```js
// build invariant: keys index == exactly the matches with a goal timeline
test('data-matchdetail-keys.js exactly mirrors keys with goal timelines', () => {
  const { MATCH_DETAIL } = loadDataFile('data-matchdetail.js');
  const { MATCH_DETAIL_KEYS } = loadDataFile('data-matchdetail-keys.js');
  assert.ok(MATCH_DETAIL && typeof MATCH_DETAIL === 'object', 'MATCH_DETAIL object');
  assert.ok(MATCH_DETAIL_KEYS && typeof MATCH_DETAIL_KEYS === 'object',
    'MATCH_DETAIL_KEYS object');
  const expected = Object.keys(MATCH_DETAIL)
    .filter(k => MATCH_DETAIL[k] && MATCH_DETAIL[k].g && MATCH_DETAIL[k].g.length > 0)
    .sort();
  const got = Object.keys(MATCH_DETAIL_KEYS).sort();
  assert.deepEqual(got, expected);
  assert.ok(got.length > 0, 'expected a non-empty key set');
  for (const k of got) assert.ok(MATCH_DETAIL_KEYS[k], `truthy value for ${k}`);
});
```

- [ ] **Step 3: Run, verify PASS** — `node --test scripts/tests/test_js_modules.mjs`. Since `data-matchdetail-keys.js` already exists (Task 1) and was generated from the same JOIN, this passes immediately. (If it FAILS, the generator/artifact is inconsistent — STOP, do not weaken the test; re-run Task 1 Step 3 and investigate.) Confirm total count rose and `# fail 0`.

- [ ] **Step 4: Run full suites (no regressions)**
```bash
node --test scripts/tests/test_js_modules.mjs 2>&1 | grep -E "^# (tests|pass|fail|skipped)"
python3 -m pytest scripts/tests/ -q 2>&1 | tail -1
```
Expected: Node all pass, `# fail 0`; pytest `27 passed, 5 skipped` (unchanged).

- [ ] **Step 5: Commit**
```bash
git add scripts/tests/test_js_modules.mjs
git commit -m "test(perf): build-invariant for matchdetail keys index + probes"
```

---

## Task 7: full verification

**Files:** none (verification only)

- [ ] **Step 1: Suites**
```bash
node --test scripts/tests/test_js_modules.mjs 2>&1 | grep -E "^# (pass|fail)"
python3 -m pytest scripts/tests/ -q 2>&1 | tail -1
node --check src/state.js src/render.js src/miequipo.js src/modals.js sw.js
```
Expected: Node `# fail 0`; pytest `27 passed, 5 skipped`; `node --check` clean.

- [ ] **Step 2: Headless DOM + network proof** (the env kills persistent servers; do server + headless Chrome IN ONE bash call). Run:
```bash
CHROME=$(ls -d ~/.cache/ms-playwright/chromium-*/chrome-linux/chrome 2>/dev/null | tail -1); [ -x "$CHROME" ] || CHROME=/usr/bin/google-chrome
python3 -m http.server 8912 >/tmp/s.log 2>&1 & SRV=$!; sleep 2
timeout 60 "$CHROME" --headless=new --no-sandbox --disable-gpu --virtual-time-budget=6000 --dump-dom "http://127.0.0.1:8912/index.html" >/tmp/dom.html 2>/tmp/c.err
kill $SRV 2>/dev/null || true
grep -c 'data-matchdetail-keys.js' /tmp/dom.html | sed 's/^/keys script in DOM: /'
grep -c 'detail-badge' /tmp/dom.html | sed 's/^/⚽ badges rendered: /'
grep -co 'src="./data-matchdetail.js' /tmp/dom.html | sed 's/^/heavy eager script (want 0): /'
```
Expected: keys script present (≥1), ⚽ badges rendered (≥1 — proves the keys map drives the badge with NO heavy file), heavy eager script = 0. (`--dump-dom` runs JS; MI EQUIPO/Jornadas badges come from `MATCH_DETAIL_KEYS`.)

- [ ] **Step 3: Manual browser checklist (report for the human to confirm)** — list, do not fake: open the served site; DevTools Network shows NO `data-matchdetail.js` on first load (only `data-matchdetail-keys.js`, small); ⚽ badges appear in Jornadas and MI EQUIPO calendar identical to before; click a match WITH ⚽ → modal opens instantly, goal timeline appears a moment later and is identical to before; reopen same match → instant (cached, no re-fetch in Network); click a match WITHOUT ⚽ → no timeline, no `data-matchdetail.js` request; the `data-matchdetail.js` request appears ONLY on the first modal-with-goals open.

- [ ] **Step 4: Acceptance sign-off** — re-read spec §8; confirm all 8 criteria against Steps 1-3 evidence. Any miss → new task, not a silent pass.

- [ ] **Step 5: Final commit only if verification fixes were needed**
```bash
git add -A && git commit -m "fix(perf): verification adjustments"
```
Otherwise none. Never `git push` (finishing handles integration).

---

## Notes for the implementer

- `data-matchdetail.js` STILL exists and is still generated/committed — it just loses its `<script>` tag and SW precache; it is fetched lazily. Do not delete it.
- `ensureMatchDetail()` caches into a module variable, never re-assigns the (now non-existent) `MATCH_DETAIL` global. The badge path must use `MATCH_DETAIL_KEYS` (eager) exclusively.
- Read `MATCH_DETAIL_KEYS` as a bare typeof-guarded identifier — NOT `globalThis` (2026-05-18 root cause; there is a regression test enforcing no-globalThis).
- Goal timeline now renders at the END of the modal body (was between h2h and streaks). Intentional: keeps the "No hay datos adicionales" empty-state check correct. Do not try to restore the old position by moving the placeholder above the empty-state check.
- Env limitation: persistent local servers die (SIGURG); browser only via in-call server + headless Chrome `--dump-dom`, or the human's browser. Don't claim visual verification you didn't do.
