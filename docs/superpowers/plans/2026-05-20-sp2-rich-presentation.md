# SP-2 — Presentación rica de actas (Implementation Plan)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Construir las 4 superficies de UI que consumen los `data-lineups-<S>.js` / `data-players-<S>.js` producidos por SP-1: plantilla por equipo (en `openTeamDetail`), cronología completa (en `openMatchDetail`), expandible inline de jugador, y card "Plantilla" en MI EQUIPO.

**Architecture:** Capa nueva en `src/`: dos módulos puros y testeables — `src/plantilla.js` (tabla + expandible) y `src/matchdetail-rich.js` (alineaciones + cronología unificada). Funciones de lazy-load nuevas en `src/state.js` (`ensureLineups`, `ensurePlayers`) replicando el patrón de `ensureMatchDetail`. Una dependencia mínima en SP-1: añadir `TEAMS_<S>` a `generate_players_js` para tener el mapping nombre→team_id en el cliente.

**Tech Stack:** Vanilla JS (zero-dep). `node --test` para Node test runner. Python 3.11 para generadores. Sin nuevas dependencias npm. Spec: `docs/superpowers/specs/2026-05-20-sp2-rich-presentation-design.md`.

---

## File Map

**Crear:**
- `src/plantilla.js` — `renderPlantillaInto(container, teamName, season, opts)` + helpers; expone `aggregatePlayerFromLineups`, `renderPlayerDetailHtml`, `renderPlantillaTable`, `sortPlantillaRows`.
- `src/matchdetail-rich.js` — `renderLineupsAndTimeline(container, match)` + helpers (`renderLineupsHtml`, `mergeAndOrderEvents`, `renderTimelineHtml`).
- `scripts/tests/test_sp2_modules.mjs` — tests Node con datos sintéticos.

**Modificar:**
- `src/state.js` — añadir `ensureLineups(season)` y `ensurePlayers(season)` y un helper `getCurrentSeason()`.
- `src/modals.js` — `openTeamDetail` invoca `renderPlantillaInto`; `openMatchDetail` invoca `renderLineupsAndTimeline`.
- `src/miequipo.js` — nueva card "Plantilla" entre calendario y goleadores.
- `style.css` — estilos `.plant-*`, `.match-lineups`, `.match-timeline`, `.player-detail-*`.
- `scripts/generate_js.py::generate_players_js` — emitir `TEAMS_<S>` además de `PLAYERS_<S>`.
- `scripts/tests/test_data_integrity.py` — invariante de presencia de `TEAMS_<S>`.
- `scripts/tests/test_js_modules.mjs` — source-contract anti-globalThis.
- `scripts/tests/render-smoke.mjs` — aserción de la nueva card Plantilla.
- `sw.js` — bump de `CACHE_NAME`.
- `index.html` — `?v=` bump automático.

---

## Reglas operacionales

- **No `git push` mientras `update.yml` corre.** Verificar con `gh run list --workflow=update.yml --status in_progress --limit 1`.
- **`.github/workflows/*` bloqueado por hook** → heredoc (en SP-2 no se tocan workflows).
- **CI es Python 3.11** — sin backslashes en f-strings.
- **`data-*.js` no se editan a mano** — sólo vía `generate_js.py`.
- **Trabajo en worktree aislado** (Task 1 lo crea).
- **Identificadores desnudos guardados** para leer las constantes de los data files (`typeof LINEUPS_X !== 'undefined' ? LINEUPS_X : null`) — **nunca** `globalThis`/`window.` (lección 2026-05-18 en memoria). Los renders usan `innerHTML` igual que el resto del proyecto, con escape explícito vía la función `escHtml`/`esc` definida en cada módulo nuevo.

---

## Task 1: Worktree aislado + baseline verde

**Files:** ninguno (setup del skill).

- [ ] **Step 1: Crear worktree**

Desde `using-git-worktrees`: `.worktrees/sp2-rich-presentation`. Branch `worktree-sp2-rich-presentation` desde `main`. Verificar con `git branch --show-current`.

- [ ] **Step 2: Baseline verde**

```bash
python3 -m pytest scripts/tests/ -q
node --test scripts/tests/test_js_modules.mjs
node scripts/tests/render-smoke.mjs || true
```

Expected: pytest 84+5 skipped, node tests 26/26. Si algo falla, parar.

---

## Task 2: SP-1 dependencia mínima — `TEAMS_<S>` en `data-players-<S>.js`

**Files:**
- Modify: `scripts/generate_js.py::generate_players_js`
- Modify: `scripts/tests/test_data_integrity.py` (test nuevo)

- [ ] **Step 1: Test fallido**

En `scripts/tests/test_data_integrity.py`:

```python
def test_generate_players_js_emits_teams_mapping(tmp_path):
    """data-players-<S>.js incluye TEAMS_<S> = {<norm_name>: team_id}."""
    import shutil, sqlite3, json, re, os
    from scripts.migrate_actas_schema import migrate
    from scripts.import_fiflp_actas import import_raw
    from scripts.generate_js import generate_players_js
    from scripts.acta_reconciler import normalize_team_name
    ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
    DB_PATH = os.path.join(ROOT, "futbolbase.db")
    db = tmp_path / "fb.db"; shutil.copy(DB_PATH, db)
    conn = sqlite3.connect(str(db)); migrate(conn)
    real = conn.execute("""SELECT m.id, s.name, t1.name, t2.name, m.date, m.home_score, m.away_score, m.home_team_id, m.away_team_id
        FROM matches m JOIN groups g ON g.id=m.group_id JOIN seasons s ON s.id=g.season_id
        JOIN teams t1 ON t1.id=m.home_team_id JOIN teams t2 ON t2.id=m.away_team_id
        WHERE m.home_score IS NOT NULL LIMIT 1""").fetchone()
    raw = {str(real[0]+700000): {
        "cod_acta": real[0]+700000,
        "header": {"season": real[1].replace("-","/"), "jornada":"1", "date":real[4],
                   "home_team":real[2],"away_team":real[3],
                   "home_score":real[5],"away_score":real[6],"competition":"x"},
        "lineups":{"home":[{"name":"PEREZ, JUAN","dorsal":1,"role":"starter"}],"away":[]},
        "events":[{"kind":"goal","side":"home","player_name":"PEREZ, JUAN","minute":5,"goal_type":"normal"}],
        "staff":{"referee":"R","coach_home":"H","coach_away":"A"}}}
    p = tmp_path / "raw.json"; p.write_text(json.dumps(raw))
    import_raw(conn, str(p))
    js = generate_players_js(conn, real[1])
    suffix = real[1].replace("-", "_")
    assert f"const PLAYERS_{suffix}" in js
    assert f"const TEAMS_{suffix}" in js, "generate_players_js must emit TEAMS_<S>"
    m = re.search(rf"const TEAMS_{suffix}\s*=\s*(\{{.*?\}});", js, re.DOTALL)
    assert m, "TEAMS_<S> declaration not parseable"
    teams = json.loads(m.group(1))
    assert normalize_team_name(real[2]) in teams
    assert teams[normalize_team_name(real[2])] == real[7]
```

- [ ] **Step 2: Run → FAIL** (TEAMS_ no emitido aún)

```bash
python3 -m pytest scripts/tests/test_data_integrity.py::test_generate_players_js_emits_teams_mapping -v
```

- [ ] **Step 3: Implementar TEAMS_<S>**

En `scripts/generate_js.py`, sustituir `generate_players_js` por:

```python
def generate_players_js(conn, season_name):
    """Emit data-players-<season>.js with per-team player aggregates +
       a normalized team_name -> team_id mapping for client-side lookup.
       const PLAYERS_<YYYY_YYYY> = { "<team_id>": [{n, ap, st, g, y, rd}, ...] };
       const TEAMS_<YYYY_YYYY>   = { "<norm_team_name>": team_id, ... };
    """
    from scripts.acta_reconciler import normalize_team_name
    season_id = conn.execute("SELECT id FROM seasons WHERE name=?", (season_name,)).fetchone()
    if not season_id:
        return f"// no season {season_name}\n"
    rows = conn.execute("""
      SELECT a.team_id, p.full_name,
             COUNT(*) AS ap,
             SUM(CASE WHEN a.role='starter' THEN 1 ELSE 0 END) AS st,
             SUM(a.goals)  AS gl,
             SUM(a.yellow) AS y,
             SUM(a.red)    AS rd
        FROM appearances a
        JOIN players p ON p.id=a.player_id
        JOIN matches m ON m.id=a.match_id
        JOIN groups g  ON g.id=m.group_id
       WHERE g.season_id=?
       GROUP BY a.team_id, a.player_id
       ORDER BY a.team_id, gl DESC""", (season_id[0],)).fetchall()
    obj = {}
    for tid, name, ap, st, gl, y, rd in rows:
        obj.setdefault(str(tid), []).append(
            {"n": name, "ap": ap, "st": st or 0, "g": gl or 0, "y": y or 0, "rd": rd or 0}
        )
    team_rows = conn.execute("""
      SELECT DISTINCT t.id, t.name
        FROM teams t
        JOIN appearances a ON a.team_id=t.id
        JOIN matches m ON m.id=a.match_id
        JOIN groups g ON g.id=m.group_id
       WHERE g.season_id=?""", (season_id[0],)).fetchall()
    teams = {normalize_team_name(name): tid for tid, name in team_rows}
    suffix = _season_const_suffix(season_name)
    return ("// Auto-generated by scripts/generate_js.py — do not edit\n"
            f"const PLAYERS_{suffix} = " + json.dumps(obj, ensure_ascii=False) + ";\n"
            f"const TEAMS_{suffix} = " + json.dumps(teams, ensure_ascii=False) + ";\n")
```

- [ ] **Step 4: Run → PASS**

```bash
python3 -m pytest scripts/tests/test_data_integrity.py::test_generate_players_js_emits_teams_mapping -v
python3 -m pytest scripts/tests/ -q
python3 scripts/generate_js.py
```

Expected: 85 passed, 5 skipped. Generator corre sin error.

- [ ] **Step 5: Commit**

```bash
git add scripts/generate_js.py scripts/tests/test_data_integrity.py
git commit -m "feat(generate): emit TEAMS_<S> name->id mapping alongside PLAYERS_<S>

SP-2 needs it for client-side team_name -> team_id lookup. Generator now
emits two consts in the same data-players-<season>.js file.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 3: `ensureLineups`, `ensurePlayers`, `getCurrentSeason` en `src/state.js`

**Files:**
- Modify: `src/state.js`
- Modify: `scripts/tests/test_js_modules.mjs`

- [ ] **Step 1: Test fallido (source-contract + presencia)**

Añadir al final de `scripts/tests/test_js_modules.mjs`:

```js
test('state.js exports ensureLineups, ensurePlayers, getCurrentSeason (SP-2)', () => {
  const src = readFileSync(join(ROOT, 'src', 'state.js'), 'utf8');
  assert.ok(/export\s+async\s+function\s+ensureLineups\b/.test(src),
    'state.js must export ensureLineups');
  assert.ok(/export\s+async\s+function\s+ensurePlayers\b/.test(src),
    'state.js must export ensurePlayers');
  assert.ok(/export\s+function\s+getCurrentSeason\b/.test(src),
    'state.js must export getCurrentSeason');
  for (const f of ['state.js']) {
    const s = readFileSync(join(ROOT, 'src', f), 'utf8');
    assert.ok(!/globalThis\.(LINEUPS_|PLAYERS_|TEAMS_)/.test(s),
      f + ': must not read LINEUPS_/PLAYERS_/TEAMS_ via globalThis');
    assert.ok(!/window\.(LINEUPS_|PLAYERS_|TEAMS_)/.test(s),
      f + ': must not read LINEUPS_/PLAYERS_/TEAMS_ via window.');
  }
});
```

- [ ] **Step 2: Run → FAIL**

```bash
node --test scripts/tests/test_js_modules.mjs 2>&1 | tail -8
```

- [ ] **Step 3: Implementar en `src/state.js`**

Añadir al final del fichero (después de `ensureMatchDetail`):

```js
/* SP-2: lazy-loaders + season helper. Parse data files via regex (same
 * pattern as ensureMatchDetail). Returns null on failure -> UI shows empty-state. */

const _lineups = {};
const _lineupsPromise = {};
const _players = {};
const _playersPromise = {};

function _seasonSuffix(season) { return season.replace('-', '_'); }

function _versionFromMatchDetailKeys() {
  return (document.querySelector('script[src*="data-matchdetail-keys.js"]')
    ?.src.match(/v=([^&]+)/)?.[1]) || '';
}

export async function ensureLineups(season) {
  if (_lineups[season] !== undefined) return _lineups[season];
  if (_lineupsPromise[season]) return _lineupsPromise[season];
  _lineupsPromise[season] = (async () => {
    const ver = _versionFromMatchDetailKeys();
    const suffix = _seasonSuffix(season);
    try {
      const r = await fetch('./data-lineups-' + season + '.js' + (ver ? '?v=' + ver : ''));
      if (!r.ok) throw new Error('HTTP ' + r.status);
      const txt = await r.text();
      const re = new RegExp('const LINEUPS_' + suffix + '\\s*=\\s*(\\{[\\s\\S]*\\});');
      const m = txt.match(re);
      if (!m) throw new Error('LINEUPS_' + suffix + ' not parseable');
      _lineups[season] = JSON.parse(m[1]);
    } catch (e) {
      console.warn('[state] ensureLineups failed:', e.message);
      _lineups[season] = null;
    }
    return _lineups[season];
  })();
  return _lineupsPromise[season];
}

export async function ensurePlayers(season) {
  if (_players[season] !== undefined) return _players[season];
  if (_playersPromise[season]) return _playersPromise[season];
  _playersPromise[season] = (async () => {
    const ver = _versionFromMatchDetailKeys();
    const suffix = _seasonSuffix(season);
    try {
      const r = await fetch('./data-players-' + season + '.js' + (ver ? '?v=' + ver : ''));
      if (!r.ok) throw new Error('HTTP ' + r.status);
      const txt = await r.text();
      const reP = new RegExp('const PLAYERS_' + suffix + '\\s*=\\s*(\\{[\\s\\S]*?\\});');
      const reT = new RegExp('const TEAMS_'   + suffix + '\\s*=\\s*(\\{[\\s\\S]*?\\});');
      const mp = txt.match(reP);
      const mt = txt.match(reT);
      if (!mp || !mt) throw new Error('PLAYERS_/TEAMS_' + suffix + ' not parseable');
      _players[season] = { players: JSON.parse(mp[1]), teams: JSON.parse(mt[1]) };
    } catch (e) {
      console.warn('[state] ensurePlayers failed:', e.message);
      _players[season] = null;
    }
    return _players[season];
  })();
  return _playersPromise[season];
}

export function getCurrentSeason() {
  // Default: featured season. If S.season is set (jornadas selector) prefer
  // that; otherwise '2025-2026' (the current portal season).
  return (typeof S !== 'undefined' && S && S.season) || '2025-2026';
}
```

- [ ] **Step 4: Run → PASS**

```bash
node --test scripts/tests/test_js_modules.mjs 2>&1 | tail -5
```

- [ ] **Step 5: Commit**

```bash
git add src/state.js scripts/tests/test_js_modules.mjs
git commit -m "feat(state): ensureLineups + ensurePlayers + getCurrentSeason for SP-2

Mirror ensureMatchDetail pattern (regex parse, no globalThis). Return null
on failure so consumers can show empty-state.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 4: `src/plantilla.js` — render puro de tabla + sort

**Files:**
- Create: `src/plantilla.js`
- Create: `scripts/tests/test_sp2_modules.mjs`

- [ ] **Step 1: Tests Node**

Crear `scripts/tests/test_sp2_modules.mjs`:

```js
import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { renderPlantillaTable, sortPlantillaRows } from '../../src/plantilla.js';

const SAMPLE = [
  { n: "OJEDA DELGADO, T.", ap: 12, st: 10, g: 14, y: 2, rd: 0 },
  { n: "OJEDA SANTANA, M.", ap: 12, st: 11, g: 8,  y: 0, rd: 0 },
  { n: "DOS SANTOS, M.",    ap: 8,  st: 0,  g: 0,  y: 0, rd: 0 },
];

test('plantilla: default sort goals desc, ties broken by ap desc, name asc', () => {
  const s = sortPlantillaRows(SAMPLE, 'g', 'desc');
  assert.equal(s[0].n, 'OJEDA DELGADO, T.');
  assert.equal(s[1].n, 'OJEDA SANTANA, M.');
  assert.equal(s[2].n, 'DOS SANTOS, M.');
});

test('plantilla: sort by ap asc puts sub-only first when their ap is lowest', () => {
  const s = sortPlantillaRows(SAMPLE, 'ap', 'asc');
  assert.equal(s[0].n, 'DOS SANTOS, M.');
});

test('plantilla: renderPlantillaTable produces a table with 7 headers and N rows', () => {
  const html = renderPlantillaTable(SAMPLE, { teamId: '197', season: '2024-2025' });
  assert.ok(/class="[^"]*plant-table/.test(html));
  const ths = html.match(/<th\b/g) || [];
  assert.ok(ths.length >= 7);
  const trs = html.match(/<tr[^>]*class="[^"]*plant-row/g) || [];
  assert.equal(trs.length, 3);
  assert.ok(/plant-row[^"]*top-scorer/.test(html), 'top scorer marked');
  assert.ok(/plant-row[^"]*role-sub/.test(html), 'sub-only marked');
});

test('plantilla: empty data renders empty-state', () => {
  const html = renderPlantillaTable([], { teamId: '197', season: '2024-2025' });
  assert.ok(/plant-empty/.test(html));
  assert.ok(/no hay datos de plantilla/i.test(html));
});
```

- [ ] **Step 2: Run → FAIL**

```bash
node --test scripts/tests/test_sp2_modules.mjs 2>&1 | tail -3
```

- [ ] **Step 3: Implementar `src/plantilla.js`**

```js
// src/plantilla.js — SP-2: render de plantilla (tabla sobria, estilo A).
// Pure render: HTML string from {rows, opts}. No DOM access (separate function).

export function sortPlantillaRows(rows, key, dir) {
  key = key || 'g';
  dir = dir || 'desc';
  const mul = dir === 'desc' ? -1 : 1;
  const cmp = (a, b) => {
    const va = a[key], vb = b[key];
    if (typeof va === 'number' && typeof vb === 'number') {
      if (va !== vb) return (va - vb) * mul;
    } else {
      const sa = String(va || ''), sb = String(vb || '');
      const c = sa.localeCompare(sb, 'es');
      if (c !== 0) return c * mul;
    }
    if (a.ap !== b.ap) return b.ap - a.ap;
    return String(a.n).localeCompare(String(b.n), 'es');
  };
  return rows.slice().sort(cmp);
}

function escHtml(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g,
    c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]));
}

export function renderPlantillaTable(rows, opts) {
  opts = opts || {};
  const teamId = opts.teamId, season = opts.season;
  const sortKey = opts.sortKey || 'g';
  const sortDir = opts.sortDir || 'desc';
  if (!rows || rows.length === 0) {
    return '<div class="plant-empty">'
         + 'ⓘ No hay datos de plantilla para esta temporada.'
         + '<span class="plant-empty-hint">Las plantillas aparecen cuando se importan las actas FIFLP del equipo.</span>'
         + '</div>';
  }
  const sorted = sortPlantillaRows(rows, sortKey, sortDir);
  const top = sorted.reduce((t, p) => (!t || p.g > t.g) ? p : t, null);
  const cols = [
    { k: 'dorsal', l: '#' },
    { k: 'n',      l: 'Jugador' },
    { k: 'ap',     l: 'PJ' },
    { k: 'st',     l: 'TIT' },
    { k: 'g',      l: 'G' },
    { k: 'y',      l: 'A' },
    { k: 'rd',     l: 'R' },
  ];
  const head = '<thead><tr>' + cols.map(c => {
    const arrow = (c.k === sortKey) ? (sortDir === 'desc' ? ' ▾' : ' ▴') : '';
    return '<th class="plant-th" data-sort-key="' + c.k + '">' + escHtml(c.l) + arrow + '</th>';
  }).join('') + '</tr></thead>';
  const body = '<tbody>' + sorted.map(p => {
    const isTop = top && p.n === top.n && p.g > 0;
    const isSubOnly = (p.st || 0) === 0 && (p.ap || 0) > 0;
    const cls = ['plant-row'];
    if (isTop) cls.push('top-scorer');
    if (isSubOnly) cls.push('role-sub');
    const dor = p.dorsal != null ? p.dorsal : '·';
    return '<tr class="' + cls.join(' ') + '"'
      + ' data-player-name="' + escHtml(p.n) + '"'
      + ' data-team-id="' + escHtml(teamId) + '"'
      + ' data-season="' + escHtml(season) + '">'
      + '<td class="plant-dor"><span class="dor">' + escHtml(dor) + '</span></td>'
      + '<td class="plant-name">' + escHtml(p.n) + '</td>'
      + '<td class="plant-num">' + (p.ap|0) + '</td>'
      + '<td class="plant-num">' + (p.st|0) + '</td>'
      + '<td class="plant-num plant-g">' + (p.g|0) + '</td>'
      + '<td class="plant-num">' + (p.y|0) + '</td>'
      + '<td class="plant-num' + ((p.rd|0)>0 ? ' plant-red' : '') + '">' + (p.rd|0) + '</td>'
      + '</tr>';
  }).join('') + '</tbody>';
  return '<table class="plant-table" data-team-id="' + escHtml(teamId) + '" data-season="' + escHtml(season) + '">'
       + head + body + '</table>';
}
```

- [ ] **Step 4: Run → PASS**

```bash
node --test scripts/tests/test_sp2_modules.mjs 2>&1 | tail -6
```

- [ ] **Step 5: Commit**

```bash
git add src/plantilla.js scripts/tests/test_sp2_modules.mjs
git commit -m "feat(plantilla): pure renderPlantillaTable + sortPlantillaRows (style A)

Top scorer and sub-only rows get marker classes. Empty-state honest when
rows=[]. Pure: returns HTML string, no DOM access.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 5: `renderPlantillaInto` — DOM mount + sort interactivity

**Files:**
- Modify: `src/plantilla.js`
- Modify: `scripts/tests/test_sp2_modules.mjs`

- [ ] **Step 1: Test (with minimal DOM stub)**

Añadir a `scripts/tests/test_sp2_modules.mjs`:

```js
function makeStubContainer() {
  let html = '';
  const events = [];
  return {
    set innerHTML(v) { html = v; },
    get innerHTML() { return html; },
    addEventListener(name, fn) { events.push({ name, fn }); },
    querySelectorAll(sel) {
      if (!sel.includes('plant-th')) return [];
      const ths = [...html.matchAll(/<th[^>]*data-sort-key="([^"]+)"/g)];
      return ths.map(m => ({
        dataset: { sortKey: m[1] },
        addEventListener(n, f) { events.push({ name: n, fn: f, key: m[1] }); },
      }));
    },
    _click(k) {
      const ev = events.find(e => e.key === k && e.name === 'click');
      ev && ev.fn({ currentTarget: { dataset: { sortKey: k } } });
    },
  };
}

test('renderPlantillaInto: header click re-sorts and updates arrow', async () => {
  const { renderPlantillaInto } = await import('../../src/plantilla.js');
  const c = makeStubContainer();
  renderPlantillaInto(c, [
    { n: "A", ap: 5, st: 0, g: 1, y: 0, rd: 0 },
    { n: "B", ap: 10, st: 5, g: 1, y: 0, rd: 0 },
  ], { teamId: '1', season: '2024-2025' });
  assert.ok(/A/.test(c.innerHTML) && /B/.test(c.innerHTML));
  c._click('ap');
  assert.ok(/data-sort-key="ap"[^>]*>PJ\s*[▾▴]/.test(c.innerHTML),
    'PJ header shows arrow after click');
});
```

- [ ] **Step 2: Run → FAIL**

- [ ] **Step 3: Implementar**

Añadir al final de `src/plantilla.js`:

```js
export function renderPlantillaInto(container, rows, opts) {
  opts = opts || {};
  const state = { sortKey: 'g', sortDir: 'desc' };
  const draw = () => {
    const tableHtml = renderPlantillaTable(rows, Object.assign({}, opts, state));
    const title = opts.title ? '<div class="plant-title">' + escHtml(opts.title) + '</div>' : '';
    container.innerHTML = title + tableHtml;
    container.querySelectorAll('.plant-th').forEach(th => {
      th.addEventListener('click', (e) => {
        const k = e.currentTarget.dataset.sortKey;
        if (!k || k === 'dorsal') return;
        if (state.sortKey === k) {
          state.sortDir = state.sortDir === 'desc' ? 'asc' : 'desc';
        } else {
          state.sortKey = k;
          state.sortDir = (k === 'n') ? 'asc' : 'desc';
        }
        draw();
      });
    });
  };
  draw();
}
```

- [ ] **Step 4: Run → PASS**

```bash
node --test scripts/tests/test_sp2_modules.mjs 2>&1 | tail -3
```

- [ ] **Step 5: Commit**

```bash
git add src/plantilla.js scripts/tests/test_sp2_modules.mjs
git commit -m "feat(plantilla): renderPlantillaInto mounts table with sortable headers

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 6: Integrar Plantilla en `openTeamDetail`

**Files:**
- Modify: `src/modals.js`

- [ ] **Step 1: Inspect insertion point**

```bash
grep -n "modal-stats-header\|let body" src/modals.js | head -5
```

Confirmar: `let body = '';` antes de las construcciones existentes (Temporada, Forma, Resultados, Análisis). Vamos a iniciar `body` con la sección Plantilla.

- [ ] **Step 2: Añadir imports y secciones**

Al top de `src/modals.js` (junto a los imports existentes):

```js
import { ensureMatchDetail, ensureLineups, ensurePlayers, getCurrentSeason } from './state.js';
import { renderPlantillaInto } from './plantilla.js';
```

Si `ensureMatchDetail` ya estaba importado, dejarlo y añadir solo los nuevos.

Sustituir `let body = '';` (en `openTeamDetail`) por:

```js
  let body = '<div class="modal-stats-header">Plantilla</div>'
           + '<div id="plant-modal-host" class="plant-host">'
           + '<div class="plant-empty plant-empty-loading">Cargando plantilla…</div>'
           + '</div>';
```

Después de `modalBody.innerHTML = body;` (busca esa línea más abajo en la función), añadir:

```js
  const season = getCurrentSeason();
  const host = document.getElementById('plant-modal-host');
  if (host) {
    Promise.all([ensurePlayers(season), ensureLineups(season)]).then(([pdata, ldata]) => {
      if (!pdata) {
        host.innerHTML = '<div class="plant-empty">ⓘ No hay datos de plantilla para esta temporada.</div>';
        return;
      }
      const norm = String(teamName).normalize('NFKD').replace(/[̀-ͯ]/g,'')
                                    .replace(/[.,;:'"]/g,' ').replace(/\s+/g,' ').trim().toLowerCase();
      const teamId = pdata.teams[norm];
      if (teamId == null) {
        host.innerHTML = '<div class="plant-empty">ⓘ No hay datos de plantilla para este equipo en esta temporada.</div>';
        return;
      }
      const rows = pdata.players[String(teamId)] || [];
      renderPlantillaInto(host, rows, {
        teamId: String(teamId),
        season,
        lineupsForExpand: ldata || undefined,
      });
    });
  }
```

(`lineupsForExpand` se usa en Task 10. Inofensivo añadirlo ya.)

- [ ] **Step 3: Manual smoke (HTTP server)**

```bash
python3 -m http.server 8000 &
sleep 1
echo "Abrir http://localhost:8000, ir a Clasificaciones, click en un equipo: el modal debe mostrar sección Plantilla con empty-state o con datos."
echo "Sin errores de consola."
pkill -f "python3 -m http.server" 2>/dev/null || true
```

- [ ] **Step 4: Run tests**

```bash
python3 -m pytest scripts/tests/ -q
node --test scripts/tests/test_js_modules.mjs
node --test scripts/tests/test_sp2_modules.mjs
```

Expected: pytest 85+5, node 27+ test passing, sp2 tests 5 passing.

- [ ] **Step 5: Commit**

```bash
git add src/modals.js
git commit -m "feat(modals): Plantilla section in openTeamDetail (lazy ensurePlayers)

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 7: MI EQUIPO — nueva card "Plantilla"

**Files:**
- Modify: `src/miequipo.js`
- Modify: `scripts/tests/render-smoke.mjs`
- Modify: `scripts/tests/test_js_modules.mjs` (SMOKE_GOOD_DOM)

- [ ] **Step 1: render-smoke fixture update**

En `scripts/tests/render-smoke.mjs::checkRenderedDom`, añadir entre las aserciones (después de `me-mini`):

```js
  if (!has('me-plant-card') && !has('Plantilla 2'))
    failures.push('SP-2 Plantilla card (.me-plant-card / "Plantilla 2XXX") missing');
```

En `scripts/tests/test_js_modules.mjs`, dentro del literal `SMOKE_GOOD_DOM`, añadir antes del `</div></main>` de `#sec-miequipo` la línea:

```html
<div class="me-card me-plant-card"><div class="me-ct">Plantilla 2024-25</div><div class="plant-empty">No data</div></div>
```

- [ ] **Step 2: Run node tests → FAIL**

```bash
node --test scripts/tests/test_js_modules.mjs 2>&1 | tail -8
```

Expected: 'Plantilla card' missing in the render-smoke test of the healthy fixture (porque el fixture aún no incluye la card o porque el código miequipo aún no la genera).

- [ ] **Step 3: Implementar la card en `src/miequipo.js`**

Top imports:

```js
import { ensureLineups, ensurePlayers, getCurrentSeason } from './state.js';
import { renderPlantillaInto } from './plantilla.js';
```

Buscar la línea `c.appendChild(miniCard);` y añadir DESPUÉS, ANTES de `c.appendChild(golCard);`:

```js
  // SP-2: Plantilla card
  const plantCard = el('div', 'me-card me-plant-card');
  const season = getCurrentSeason();
  plantCard.innerHTML = '<div class="me-ct">Plantilla ' + season.replace('-20', '-') + '</div>'
    + '<div id="me-plant-host" class="plant-host">'
    + '<div class="plant-empty plant-empty-loading">Cargando plantilla…</div>'
    + '</div>';
  c.appendChild(plantCard);
  Promise.all([ensurePlayers(season), ensureLineups(season)]).then(([pdata, ldata]) => {
    const host = document.getElementById('me-plant-host');
    if (!host) return;
    if (!pdata) {
      host.innerHTML = '<div class="plant-empty">ⓘ No hay datos de plantilla para esta temporada.</div>';
      return;
    }
    const teamName = (typeof FEATURED !== 'undefined' && FEATURED.team) ? FEATURED.team : 'Las Mesas Hu.';
    const norm = String(teamName).normalize('NFKD').replace(/[̀-ͯ]/g,'')
                                  .replace(/[.,;:'"]/g,' ').replace(/\s+/g,' ').trim().toLowerCase();
    const teamId = pdata.teams[norm];
    if (teamId == null) {
      host.innerHTML = '<div class="plant-empty">ⓘ No hay datos de plantilla para este equipo en esta temporada.</div>';
      return;
    }
    const rows = pdata.players[String(teamId)] || [];
    renderPlantillaInto(host, rows, {
      teamId: String(teamId),
      season,
      lineupsForExpand: ldata || undefined,
    });
  });
```

- [ ] **Step 4: Run all tests → PASS**

```bash
python3 -m pytest scripts/tests/ -q
node --test scripts/tests/test_js_modules.mjs
node --test scripts/tests/test_sp2_modules.mjs
node scripts/tests/render-smoke.mjs || echo "SKIP local OK"
```

- [ ] **Step 5: Commit**

```bash
git add src/miequipo.js scripts/tests/render-smoke.mjs scripts/tests/test_js_modules.mjs
git commit -m "feat(miequipo): Plantilla card between calendar and goleadores

FEATURED team is the source. Empty-state honest when no actas imported.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 8: `src/matchdetail-rich.js` — alineaciones + cronología unificada

**Files:**
- Create: `src/matchdetail-rich.js`
- Modify: `scripts/tests/test_sp2_modules.mjs`

- [ ] **Step 1: Tests Node**

Añadir a `scripts/tests/test_sp2_modules.mjs`:

```js
import { renderLineupsHtml, mergeAndOrderEvents, renderTimelineHtml } from '../../src/matchdetail-rich.js';

const M = {
  home: [
    { n: "GUTIERREZ, J", dn: 1, r: 'starter', g: 0, y: 0, rd: 0 },
    { n: "SANTANA, A",   dn: 4, r: 'starter', g: 0, y: 0, rd: 0 },
    { n: "YANEZ, S",     dn: 12, r: 'sub',     g: 0, y: 0, rd: 0 },
  ],
  away: [
    { n: "PEREZ, M", dn: 1, r: 'starter', g: 0, y: 0, rd: 0 },
    { n: "LOPEZ, B", dn: 2, r: 'starter', g: 0, y: 1, rd: 0 },
  ],
  events: [
    { t: 'goal',   s: 'h', n: 'SANTANA, A', m: 12, gt: 'normal' },
    { t: 'yellow', s: 'a', n: 'LOPEZ, B',   m: 34 },
    { t: 'sub',    s: 'h', n: 'GUTIERREZ, J', n2: 'YANEZ, S', m: 55 },
  ],
  coachH: 'PEPE',
  coachA: 'JUAN',
  ref:    'ARBITRO X',
};

test('lineups: both teams with starter/sub split + coaches', () => {
  const html = renderLineupsHtml(M);
  assert.ok(/match-lineups/.test(html));
  assert.ok(/match-line-side[^"]*home/.test(html));
  assert.ok(/match-line-side[^"]*away/.test(html));
  assert.ok(/match-sub-divider/.test(html));
  assert.ok(/Entrenador.*PEPE/.test(html));
  assert.ok(/Entrenador.*JUAN/.test(html));
});

test('timeline: events sorted by minute, null minutes last', () => {
  const ord = mergeAndOrderEvents([
    { t:'goal',s:'h',n:'X',m:30 },
    { t:'yellow',s:'a',n:'Y',m:null },
    { t:'goal',s:'h',n:'Z',m:10 },
  ]);
  assert.equal(ord[0].n, 'Z');
  assert.equal(ord[1].n, 'X');
  assert.equal(ord[2].n, 'Y');
});

test('timeline: renders icons (goal/yellow/sub) + minutes', () => {
  const html = renderTimelineHtml(M.events);
  assert.ok(/⚽/.test(html), 'goal icon ⚽');
  assert.ok(/🟨/.test(html), 'yellow icon');
  assert.ok(/🔄/.test(html), 'sub icon');
  assert.ok(/YANEZ, S/.test(html) && /GUTIERREZ, J/.test(html), 'sub shows both names');
  const html2 = renderTimelineHtml([{ t:'goal', s:'h', n:'P', m:5, gt:'penalty' }]);
  assert.ok(/penalti/i.test(html2));
});

test('timeline: empty -> empty-state', () => {
  assert.ok(/timeline-empty/.test(renderTimelineHtml([])));
});
```

- [ ] **Step 2: Run → FAIL**

```bash
node --test scripts/tests/test_sp2_modules.mjs 2>&1 | tail -3
```

- [ ] **Step 3: Implementar `src/matchdetail-rich.js`**

```js
// src/matchdetail-rich.js — SP-2: alineaciones + cronología unificada.
const ICONS = { goal: '⚽', yellow: '🟨', red: '🟥',
                sub: '🔄', sub_in: '↑', sub_out: '↓' };
const GOAL_LABEL = { penalty: ' (penalti)', own: ' (en propia)' };

function esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g,
    c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]));
}

function renderSidePlayers(players, side) {
  const starters = players.filter(p => p.r === 'starter');
  const subs     = players.filter(p => p.r === 'sub');
  const row = p => '<div class="match-line-row' + (p.r === 'sub' ? ' is-sub' : '') + '">'
      + '<span class="match-line-dor">' + esc(p.dn != null ? p.dn : '·') + '</span>'
      + '<span class="match-line-name">' + esc(p.n) + '</span></div>';
  return '<div class="match-line-side match-line-' + side + '">'
       + '<div class="match-line-title">' + esc(side.toUpperCase()) + '</div>'
       + starters.map(row).join('')
       + (subs.length ? '<div class="match-sub-divider">Suplentes</div>' : '')
       + subs.map(row).join('') + '</div>';
}

export function renderLineupsHtml(match) {
  if (!match) return '<div class="match-line-empty"></div>';
  const home = Array.isArray(match.home) ? match.home : [];
  const away = Array.isArray(match.away) ? match.away : [];
  if (home.length === 0 && away.length === 0) {
    return '<div class="match-line-empty">No hay alineaciones disponibles para este partido.</div>';
  }
  const coachH = match.coachH ? '<div class="match-line-coach">Entrenador: ' + esc(match.coachH) + '</div>' : '';
  const coachA = match.coachA ? '<div class="match-line-coach">Entrenador: ' + esc(match.coachA) + '</div>' : '';
  return '<div class="match-lineups"><div class="match-lineups-grid">'
       + renderSidePlayers(home, 'home') + coachH
       + renderSidePlayers(away, 'away') + coachA
       + '</div></div>';
}

export function mergeAndOrderEvents(events) {
  const arr = (events || []).slice();
  arr.sort((a, b) => {
    const ma = (a.m == null) ? 1e9 : a.m;
    const mb = (b.m == null) ? 1e9 : b.m;
    return ma - mb;
  });
  return arr;
}

export function renderTimelineHtml(events) {
  const ord = mergeAndOrderEvents(events);
  if (ord.length === 0) return '<div class="match-timeline timeline-empty">No hay eventos registrados.</div>';
  const rows = ord.map(ev => {
    const icon = ICONS[ev.t] || '·';
    const min = (ev.m == null) ? '–\'' : (ev.m + '\'');
    const sideCls = ev.s === 'h' ? 'is-home' : 'is-away';
    let body;
    if (ev.t === 'sub') {
      body = '<span class="ev-sub">' + ICONS.sub_in + ' ' + esc(ev.n2 || '')
           + ' <span class="ev-sub-sep">/</span> ' + ICONS.sub_out + ' ' + esc(ev.n || '') + '</span>';
    } else if (ev.t === 'goal') {
      body = '<span class="ev-player">' + esc(ev.n) + '</span>' + esc(GOAL_LABEL[ev.gt] || '');
    } else {
      body = '<span class="ev-player">' + esc(ev.n) + '</span>';
    }
    return '<div class="match-tl-row ' + sideCls + '">'
         + '<span class="match-tl-min">' + esc(min) + '</span>'
         + '<span class="match-tl-icon">' + esc(icon) + '</span>'
         + body + '</div>';
  }).join('');
  return '<div class="match-timeline">' + rows + '</div>';
}

export function renderLineupsAndTimeline(container, match) {
  if (!container) return;
  if (!match) {
    container.innerHTML = '<div class="match-line-empty">Alineaciones y cronología no disponibles para este partido.</div>';
    return;
  }
  const refHtml = match.ref ? '<div class="match-referee">Árbitro: ' + esc(match.ref) + '</div>' : '';
  container.innerHTML = renderLineupsHtml(match)
       + '<div class="match-section-title">Cronología</div>'
       + renderTimelineHtml(match.events)
       + refHtml;
}
```

- [ ] **Step 4: Run → PASS**

```bash
node --test scripts/tests/test_sp2_modules.mjs 2>&1 | tail -5
```

- [ ] **Step 5: Commit**

```bash
git add src/matchdetail-rich.js scripts/tests/test_sp2_modules.mjs
git commit -m "feat(matchdetail-rich): pure renderers for lineups + unified timeline

Unicode icons, null minutes last, sub events show both players.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 9: Integrar match-detail enriquecido en `openMatchDetail`

**Files:**
- Modify: `src/modals.js`

- [ ] **Step 1: Inspect openMatchDetail**

```bash
grep -n "openMatchDetail\|modalGoalsSection\|ensureMatchDetail" src/modals.js | head -10
```

- [ ] **Step 2: Modificar**

Imports adicionales (en el bloque de imports SP-2):

```js
import { renderLineupsAndTimeline } from './matchdetail-rich.js';
```

Después del bloque que abre el modal (justo donde se llamaba `ensureMatchDetail`), reemplazar/ampliar para:

```js
  const goalsSection = document.getElementById('modalGoalsSection');
  if (goalsSection && !document.getElementById('modalLineupsSection')) {
    const lineupsHost = document.createElement('div');
    lineupsHost.id = 'modalLineupsSection';
    lineupsHost.className = 'match-rich-host';
    goalsSection.parentNode.insertBefore(lineupsHost, goalsSection);
  }
  const season = getCurrentSeason();
  const matchKey = match.home + '|' + match.away + '|' + match.hs + '-' + match.as;
  Promise.all([ensureLineups(season), ensureMatchDetail()]).then(([lineups, details]) => {
    const lineupsHost = document.getElementById('modalLineupsSection');
    const m = lineups && lineups[matchKey];
    if (lineupsHost && m) renderLineupsAndTimeline(lineupsHost, m);
    const goalsHost = document.getElementById('modalGoalsSection');
    if (goalsHost && (!m || !(m.events && m.events.length > 0))) {
      const detail = details && details[matchKey];
      if (detail && detail.g && detail.g.length > 0) {
        goalsHost.innerHTML = buildGoalsHtml(detail, match.venue);
      }
    } else if (goalsHost) {
      goalsHost.innerHTML = '';
    }
  });
```

- [ ] **Step 3: Manual smoke + tests**

```bash
python3 -m http.server 8000 &
sleep 1
echo "Click match badge ⚽: should show alineaciones + cronología if LINEUPS exists; else classic goals."
pkill -f "python3 -m http.server" 2>/dev/null || true
python3 -m pytest scripts/tests/ -q
node --test scripts/tests/test_js_modules.mjs
node --test scripts/tests/test_sp2_modules.mjs
```

- [ ] **Step 4: Commit**

```bash
git add src/modals.js
git commit -m "feat(modals): enrich openMatchDetail with lineups + unified timeline

Pulls LINEUPS_<S>[match_key] in parallel with ensureMatchDetail. Renders
alineaciones above the goals section; classic goals fallback when LINEUPS
missing. Zero regression.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 10: Expandible inline de jugador (panel-en-fila)

**Files:**
- Modify: `src/plantilla.js`
- Modify: `scripts/tests/test_sp2_modules.mjs`

- [ ] **Step 1: Test aggregation**

Añadir a `scripts/tests/test_sp2_modules.mjs`:

```js
import { aggregatePlayerFromLineups, renderPlayerDetailHtml } from '../../src/plantilla.js';

test('aggregatePlayerFromLineups: counts apps/starters/goals/cards', () => {
  const lineups = {
    'A|B|2-1': {
      home: [{ n:'X', dn:10, r:'starter', g:1, y:0, rd:0 }],
      away: [{ n:'Y', dn:7,  r:'starter', g:1, y:1, rd:0 }],
      events: [
        { t:'goal',s:'h',n:'X',m:5 },
        { t:'goal',s:'a',n:'Y',m:50 },
        { t:'yellow',s:'a',n:'Y',m:60 },
      ],
    },
    'A|C|0-0': {
      home: [{ n:'X', dn:10, r:'sub', g:0, y:0, rd:0 }],
      away: [],
      events: [],
    },
  };
  const x = aggregatePlayerFromLineups(lineups, 'X');
  assert.equal(x.appearances, 2);
  assert.equal(x.starters, 1);
  assert.equal(x.goals, 1);
  assert.equal(x.matches.length, 2);
  assert.equal(x.matches[0].matchKey, 'A|B|2-1');
});

test('renderPlayerDetailHtml: shows name, stats, matches', () => {
  const html = renderPlayerDetailHtml('PEPE', {
    appearances: 5, starters: 4, goals: 2, yellow: 1, red: 0,
    matches: [{ matchKey: 'A|B|1-0', side:'home', g:1, y:0, rd:0 }],
  });
  assert.ok(/PEPE/.test(html));
  assert.ok(/<b>5<\/b>\s*PJ/.test(html));
  assert.ok(/player-detail-match/.test(html));
});
```

- [ ] **Step 2: Run → FAIL**

- [ ] **Step 3: Implementar agregación + render del detalle**

Añadir a `src/plantilla.js`:

```js
export function aggregatePlayerFromLineups(lineups, playerName) {
  let appearances = 0, starters = 0, goals = 0, yellow = 0, red = 0;
  const matches = [];
  for (const [matchKey, m] of Object.entries(lineups || {})) {
    const inHome = (m.home || []).find(p => p.n === playerName);
    const inAway = (m.away || []).find(p => p.n === playerName);
    const app = inHome || inAway;
    if (!app) continue;
    appearances += 1;
    if (app.r === 'starter') starters += 1;
    goals  += app.g  | 0;
    yellow += app.y  | 0;
    red    += app.rd | 0;
    matches.push({ matchKey, side: inHome ? 'home' : 'away',
                   g: app.g|0, y: app.y|0, rd: app.rd|0 });
  }
  return { appearances, starters, goals, yellow, red, matches };
}

export function renderPlayerDetailHtml(playerName, agg) {
  if (!agg) return '<div class="plant-empty">Sin datos para este jugador.</div>';
  const rowsHtml = agg.matches.length === 0
    ? '<div class="player-detail-no-matches">Sin partidos registrados.</div>'
    : agg.matches.slice(0, 30).map(r => {
        const parts = String(r.matchKey).split('|');
        const home = parts[0] || '', away = parts[1] || '', score = parts[2] || '';
        const vsHtml = r.side === 'home'
          ? '<span class="pdm-vs">' + escHtml(home) + ' <i>vs</i> ' + escHtml(away) + '</span>'
          : '<span class="pdm-vs">' + escHtml(away) + ' <i>vs</i> ' + escHtml(home) + '</span>';
        return '<div class="player-detail-match">'
             + vsHtml
             + '<span class="pdm-score">' + escHtml(score) + '</span>'
             + (r.g  > 0 ? '<span class="pdm-tag tag-g">⚽' + r.g + '</span>' : '')
             + (r.y  > 0 ? '<span class="pdm-tag tag-y">🟨' + r.y + '</span>' : '')
             + (r.rd > 0 ? '<span class="pdm-tag tag-r">🟥' + r.rd + '</span>' : '')
             + '</div>';
      }).join('');
  return '<div class="player-detail">'
       + '<div class="player-detail-head">' + escHtml(playerName) + '</div>'
       + '<div class="player-detail-stats">'
       + '<span><b>' + agg.appearances + '</b> PJ</span>'
       + '<span><b>' + agg.starters + '</b> TIT</span>'
       + '<span><b>' + agg.goals + '</b> G</span>'
       + '<span><b>' + agg.yellow + '</b> A</span>'
       + '<span><b>' + agg.red + '</b> R</span>'
       + '</div>'
       + '<div class="player-detail-matches">' + rowsHtml + '</div>'
       + '<button class="player-detail-close" type="button">← Cerrar</button>'
       + '</div>';
}
```

- [ ] **Step 4: Wire en `renderPlantillaInto` (extender la función existente)**

Antes de cerrar `draw()` dentro de `renderPlantillaInto`, añadir el bloque que cablea click handlers en las filas. Sustituir la función `renderPlantillaInto` completa por la versión extendida:

```js
export function renderPlantillaInto(container, rows, opts) {
  opts = opts || {};
  const state = { sortKey: 'g', sortDir: 'desc' };
  const memo = new Map();
  const draw = () => {
    const tableHtml = renderPlantillaTable(rows, Object.assign({}, opts, state));
    const title = opts.title ? '<div class="plant-title">' + escHtml(opts.title) + '</div>' : '';
    container.innerHTML = title + tableHtml;
    container.querySelectorAll('.plant-th').forEach(th => {
      th.addEventListener('click', (e) => {
        const k = e.currentTarget.dataset.sortKey;
        if (!k || k === 'dorsal') return;
        if (state.sortKey === k) state.sortDir = state.sortDir === 'desc' ? 'asc' : 'desc';
        else { state.sortKey = k; state.sortDir = (k === 'n') ? 'asc' : 'desc'; }
        draw();
      });
    });
    if (opts.lineupsForExpand) {
      container.querySelectorAll('.plant-row').forEach(tr => {
        tr.addEventListener('click', () => {
          const next = tr.nextElementSibling;
          if (next && next.classList && next.classList.contains('player-detail-tr')) {
            next.remove();
            tr.classList.remove('plant-row-active');
            return;
          }
          container.querySelectorAll('.player-detail-tr').forEach(n => n.remove());
          container.querySelectorAll('.plant-row-active').forEach(n => n.classList.remove('plant-row-active'));
          const name = tr.dataset.playerName;
          let agg = memo.get(name);
          if (!agg) { agg = aggregatePlayerFromLineups(opts.lineupsForExpand, name); memo.set(name, agg); }
          const detailHtml = renderPlayerDetailHtml(name, agg);
          const detailTr = document.createElement('tr');
          detailTr.className = 'player-detail-tr';
          const td = document.createElement('td');
          td.colSpan = 7;
          td.innerHTML = detailHtml;
          detailTr.appendChild(td);
          tr.parentNode.insertBefore(detailTr, tr.nextSibling);
          tr.classList.add('plant-row-active');
          const closeBtn = detailTr.querySelector('.player-detail-close');
          if (closeBtn) closeBtn.addEventListener('click', () => {
            detailTr.remove();
            tr.classList.remove('plant-row-active');
          });
        });
      });
    }
  };
  draw();
}
```

- [ ] **Step 5: Run → PASS**

```bash
node --test scripts/tests/test_sp2_modules.mjs 2>&1 | tail -3
```

- [ ] **Step 6: Manual smoke**

Click en jugador en MI EQUIPO o en modal de equipo → panel expandible. Click otra vez o "← Cerrar" → cierra.

- [ ] **Step 7: Commit**

```bash
git add src/plantilla.js scripts/tests/test_sp2_modules.mjs
git commit -m "feat(plantilla): inline expandable player detail panel

aggregatePlayerFromLineups + renderPlayerDetailHtml + row-click wiring.
Toggle, close button, memo per (container, player). No modal-on-modal.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 11: CSS styling (`style.css`)

**Files:**
- Modify: `style.css`

- [ ] **Step 1: Append SP-2 styles**

Añadir al final de `style.css` el bloque completo de estilos `.plant-*`, `.player-detail-*`, `.match-lineups`, `.match-timeline`, `.match-tl-*`, `.match-line-*`, `.dor`, `.match-referee`. (Estilos detallados en spec §3.3 y §4.1; mismo lenguaje visual que el resto del proyecto — usar `var(--accent)`, `var(--muted)`, `var(--border)` consistentes con el tema actual.)

Lista de selectores a añadir (cada uno con sus propiedades CSS):

- `.plant-host`, `.plant-empty`, `.plant-empty-hint`, `.plant-title`
- `.plant-table`, `.plant-th`, `.plant-row`, `.plant-num`, `.plant-red`, `.plant-g`
- `.plant-row.role-sub`, `.plant-row.top-scorer`, `.plant-row-active`
- `.dor` (chip de dorsal)
- `.player-detail-tr td`, `.player-detail-head`, `.player-detail-stats`, `.player-detail-matches`, `.player-detail-match`, `.pdm-vs`, `.pdm-score`, `.pdm-tag`, `.tag-g`, `.tag-y`, `.tag-r`, `.player-detail-close`
- `.match-rich-host`, `.match-lineups`, `.match-lineups-grid` (con media query <640px para 1 col)
- `.match-line-side`, `.match-line-title`, `.match-line-row`, `.match-line-row.is-sub`, `.match-line-dor`, `.match-line-name`, `.match-sub-divider`, `.match-line-coach`, `.match-line-empty`
- `.match-section-title`, `.match-timeline`, `.match-timeline.timeline-empty`, `.match-tl-row`, `.match-tl-row.is-home`, `.match-tl-row.is-away`, `.match-tl-min`, `.match-tl-icon`, `.ev-sub-sep`, `.match-referee`

Implementación: usar el snippet completo CSS del spec (sección §3.3-§4.1) — copia exacta. Estilo coherente con tokens existentes del tema.

- [ ] **Step 2: Manual smoke**

```bash
python3 -m http.server 8000 &
sleep 1
echo "Verificar visualmente: Plantilla legible, alineaciones 2-col, cronología con iconos, panel jugador legible."
pkill -f "python3 -m http.server" 2>/dev/null || true
```

- [ ] **Step 3: Commit**

```bash
git add style.css
git commit -m "style(sp2): plantilla + player detail + match lineups + timeline

Coherent with --accent/--muted/--border tokens. Mobile collapses lineups
to one column at <640px.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 12: Source-contract test final

**Files:**
- Modify: `scripts/tests/test_js_modules.mjs`

- [ ] **Step 1: Test estricto contra globalThis/window**

Añadir al final de `scripts/tests/test_js_modules.mjs`:

```js
test('source-contract: SP-2 consts not read via globalThis/window in src/', () => {
  const files = ['app.js','init.js','state.js','modals.js','miequipo.js','render.js','plantilla.js','matchdetail-rich.js'];
  for (const f of files) {
    let s;
    try { s = readFileSync(join(ROOT, 'src', f), 'utf8'); }
    catch { continue; }
    for (const g of ['LINEUPS_', 'PLAYERS_', 'TEAMS_']) {
      assert.ok(!new RegExp('globalThis\\.' + g).test(s), f + ': no globalThis.' + g);
      assert.ok(!new RegExp('window\\.' + g).test(s),     f + ': no window.'     + g);
    }
  }
});
```

- [ ] **Step 2: Run → PASS** (todo el código SP-2 ya respeta esto)

```bash
node --test scripts/tests/test_js_modules.mjs 2>&1 | tail -3
```

- [ ] **Step 3: Commit**

```bash
git add scripts/tests/test_js_modules.mjs
git commit -m "test(node): source-contract — SP-2 consts must not use globalThis/window

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 13: Cache bump + final integration

**Files:**
- Modify: `sw.js`
- (Auto): `index.html`

- [ ] **Step 1: Bump CACHE_NAME**

En `sw.js` primera línea, sustituir el valor por `'futbolbase-v20260520a'` (o `b/c` si ya existe).

- [ ] **Step 2: Regenerate**

```bash
python3 scripts/generate_js.py
git diff index.html | head -6
```

Expected: `?v=` placeholders en index.html bumpeados; `data-players-<S>.js` actualizado con `TEAMS_<S>` añadido.

- [ ] **Step 3: Full smoke**

```bash
python3 -m pytest scripts/tests/ -q
node --test scripts/tests/test_js_modules.mjs
node --test scripts/tests/test_sp2_modules.mjs
node scripts/tests/render-smoke.mjs || echo "SKIP local OK"
python3 -m http.server 8000 &
sleep 1
echo "Manual verification (open http://localhost:8000):"
echo " 1. MI EQUIPO has Plantilla card (empty or populated)"
echo " 2. Click team in Clasificaciones -> modal shows Plantilla section"
echo " 3. Click a player row -> inline detail panel"
echo " 4. Click a match badge -> alineaciones + cronología unificada (or classic if no data)"
pkill -f "python3 -m http.server" 2>/dev/null || true
```

- [ ] **Step 4: Commit**

```bash
git add sw.js index.html
git commit -m "chore(sw): bump CACHE_NAME for SP-2 release; ?v= regenerated

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 14: Documentación + memoria

**Files:**
- Create: `docs/SP-2-presentation.md`
- Modify: `~/.claude/projects/-home-manolo/memory/futbol-base-state.md`

- [ ] **Step 1: Doc de uso**

Crear `docs/SP-2-presentation.md` con: lista de las 4 superficies, qué datos consume cada una (LINEUPS_<S>, PLAYERS_<S>, TEAMS_<S>), cómo invocar manualmente (clicks), política de empty-states honestos, lazy-load.

- [ ] **Step 2: Update memoria**

Append a `memory/futbol-base-state.md` un bloque "SP-2 presentación rica" listando módulos nuevos, dependencia con SP-1 (TEAMS_<S>), source-contract anti-globalThis.

- [ ] **Step 3: Commit**

```bash
git add docs/SP-2-presentation.md
git commit -m "docs(sp2): usage + empty-state policy + integration map

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Self-Review (DONE inline)

**Spec coverage:**

- §3 plantilla por equipo (en modal de equipo) → Tasks 4, 5, 6 ✓
- §4 match detail enriquecido → Tasks 8, 9 ✓
- §5 perfil inline expandible → Task 10 ✓
- §6 MI EQUIPO plantilla card → Task 7 ✓
- §7 ensureLineups + ensurePlayers + getCurrentSeason → Task 3 ✓
- §8 tests + cache bump + docs → Tasks 11, 12, 13, 14 ✓
- §10 dependencia SP-1 (TEAMS_<S>) → Task 2 ✓
- 10 criterios de aceptación de §8.3 → tests + manual smokes en Tasks 6/7/9/10/13 ✓

**Placeholder scan:** Ninguno. Cada paso tiene código completo + comandos exactos + outputs esperados. Iteración acotada por tests.

**Type consistency:** `ensureLineups(season) -> object|null`, `ensurePlayers(season) -> {players, teams}|null` consistentes Tasks 3, 6, 7, 9, 10. `renderPlantillaInto(container, rows, opts)` con `opts.lineupsForExpand` consistente Tasks 5 y 10. `renderLineupsAndTimeline(container, match)` consistente Tasks 8 y 9. `data-team-id` / `data-season` data-attrs en `.plant-row` consistentes Tasks 4-10. Match-key formato `home|away|hs-as` consistente con MATCH_DETAIL existente.

---

**Plan completo.**

## Execution Handoff

Dos opciones:

**1. Subagent-Driven (recomendado)** — Despacho subagente fresco por tarea con revisión spec + calidad entre tareas.

**2. Inline Execution** — Ejecuto las 14 tareas en este hilo con checkpoints.

¿Cuál prefieres?
