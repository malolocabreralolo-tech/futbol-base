# Render Smoke Test in CI — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Catch, before merge, the bug class that bit twice — a `src/`/`index.html` change that leaves the app un-rendered (globalThis bug → MI EQUIPO empty-state; a throw in the module graph → empty `#sec-miequipo`).

**Architecture:** A pure `checkRenderedDom(dom)` (zero-dep, unit-tested with fixtures — the deterministic guardian) plus a thin browser harness in the same `scripts/tests/render-smoke.mjs`: a Node static server + auto-detected headless Chrome `--dump-dom`, asserting MI EQUIPO (the default screen) renders real content. A new gating CI job runs it; the `tests.yml` path filter is widened so front-end changes actually trigger it.

**Tech Stack:** Node 22 ESM, `node:*` only (no npm deps, no package.json, no third-party actions). GitHub-hosted `ubuntu-latest` (preinstalled `google-chrome`).

**Spec:** `docs/superpowers/specs/2026-05-19-render-smoke-ci-design.md`

---

## Design refinement vs spec (testability)

The spec describes `render-smoke.mjs` doing the assertions. To make the guardian **deterministically provable without a browser** (spec §5 intent), the assertion logic is a pure exported function `checkRenderedDom(dom) → {ok, failures[]}`, unit-tested in `test_js_modules.mjs` with good / globalThis-empty-state / empty-section fixtures. The browser harness (server + Chrome) is a thin `main()` around it, run directly (and in CI). This satisfies spec §3 (isolation/testability) and strengthens §5; no behavioral deviation from the spec's intent.

## File Structure

| File | Responsibility |
|---|---|
| `scripts/tests/render-smoke.mjs` (create) | `export function checkRenderedDom(dom)` (pure) + a `main()` browser harness (static server, Chrome detect, `--dump-dom`, SKIP/FAIL/PASS) run only when executed directly |
| `scripts/tests/test_js_modules.mjs` (modify) | 3 unit tests importing `checkRenderedDom` (good→ok, empty-state→fail, empty-section→fail) — deterministic, no browser |
| `.github/workflows/tests.yml` (modify) | New gating `render-smoke` job; widen `on.push.paths` + `on.pull_request.paths` to front-end files |

**Operational rules:** isolated worktree/branch; NEVER `git push` (finishing handles integration); local commits only; no `CACHE_NAME`/`?v=` bump (product assets untouched); only the 3 files above change.

---

## Task 1: pure `checkRenderedDom` + unit tests (the deterministic guardian)

**Files:**
- Create: `scripts/tests/render-smoke.mjs` (this task: ONLY the pure function + exports; the harness is Task 2)
- Modify: `scripts/tests/test_js_modules.mjs`

- [ ] **Step 1: Write the failing unit tests** — append to `scripts/tests/test_js_modules.mjs`:

```js
// render smoke: pure DOM checker (deterministic, no browser)
import { checkRenderedDom } from './render-smoke.mjs';

const SMOKE_GOOD_DOM = `<!DOCTYPE html><html><body><main>
<div id="sec-miequipo" class="section active">
 <div class="me-hero"><h2>Las Mesas Hu.</h2><div class="me-meta">Prebenjamín</div></div>
 <div class="me-card"><div class="me-cal" id="meCal"><div class="me-crow"><span>J1</span></div></div></div>
 <div class="me-card">Su posición en el Grupo 2<table class="standings-table me-mini"></table></div>
 <div class="me-card">Goleadores del equipo<div class="me-scrow"><span>P</span></div></div>
 ${'<span>padpadpad</span>'.repeat(60)}
</div><div id="sec-clasif" class="section"></div></main></body></html>`;

test('checkRenderedDom: healthy MI EQUIPO render passes', () => {
  const { ok, failures } = checkRenderedDom(SMOKE_GOOD_DOM);
  assert.deepEqual(failures, []);
  assert.equal(ok, true);
});

test('checkRenderedDom: globalThis-class empty-state fails', () => {
  const bad = `<!DOCTYPE html><html><body><main>
<div id="sec-miequipo" class="section active"><div class="empty-state"><div class="empty-icon">x</div><p>No hay datos del equipo esta temporada</p></div></div>
<div id="sec-clasif" class="section"></div></main></body></html>`;
  const { ok, failures } = checkRenderedDom(bad);
  assert.equal(ok, false);
  assert.ok(failures.length >= 1);
  assert.ok(failures.some(f => /empty-state|hero|datos/.test(f)));
});

test('checkRenderedDom: empty #sec-miequipo (JS threw) fails', () => {
  const empty = '<html><body><main><div id="sec-miequipo" class="section active"></div><div id="sec-clasif" class="section"></div></main></body></html>';
  const { ok, failures } = checkRenderedDom(empty);
  assert.equal(ok, false);
  assert.ok(failures.length >= 1);
});
```

- [ ] **Step 2: Run, verify FAIL** — `node --test scripts/tests/test_js_modules.mjs` → FAILS at import (`render-smoke.mjs` missing / no `checkRenderedDom` export). Note counts.

- [ ] **Step 3: Create `scripts/tests/render-smoke.mjs`** with EXACTLY this content (pure function + exports; harness added in Task 2):

```js
/**
 * Render smoke test for the futbol-base SPA.
 *
 * `checkRenderedDom(dom)` is a pure assertion over the serialized DOM of
 * index.html AFTER its JS ran. It catches the regression class that bit
 * twice: a src/ or index.html change that leaves MI EQUIPO (the default
 * screen) un-rendered — the globalThis bug (empty-state "No hay datos del
 * equipo esta temporada") or any throw in the module graph (empty
 * #sec-miequipo). Unit-tested in test_js_modules.mjs with fixtures.
 *
 * Run directly (`node scripts/tests/render-smoke.mjs`) to exercise the real
 * browser harness; in CI it gates. Zero npm deps (node:* only).
 */

export function checkRenderedDom(dom) {
  const failures = [];
  const has = (s) => dom.includes(s);

  if (!/<div id="sec-miequipo"[^>]*\bclass="[^"]*\bactive\b/.test(dom))
    failures.push('#sec-miequipo.active not found (section did not activate)');
  if (!has('me-hero'))
    failures.push('hero (.me-hero) missing — MI EQUIPO did not render');
  if (!has('Las Mesas Hu.'))
    failures.push('featured team name "Las Mesas Hu." missing');
  if (!has('me-cal'))
    failures.push('calendar (.me-cal) missing');
  if (!has('me-crow') && !has('me-next'))
    failures.push('no calendar rows (.me-crow/.me-next)');
  if (!has('me-mini') && !has('Su posición'))
    failures.push('mini-table (.me-mini / "Su posición") missing');
  if (!has('me-scrow') && !has('Goleadores del equipo'))
    failures.push('scorers (.me-scrow / "Goleadores del equipo") missing');
  if (has('No hay datos del equipo esta temporada'))
    failures.push('empty-state present — render produced no data (globalThis-class bug?)');
  if (has('en construcción'))
    failures.push('stub placeholder ("en construcción") present');

  const m = dom.match(/<div id="sec-miequipo"[^>]*>([\s\S]*?)<div id="sec-clasif"/);
  const inner = m ? m[1] : '';
  if (inner.length < 500)
    failures.push(`#sec-miequipo content too small (${inner.length} chars) — likely empty/failed render`);

  return { ok: failures.length === 0, failures };
}
```

- [ ] **Step 4: Run, verify PASS** — `node --test scripts/tests/test_js_modules.mjs` → all pass (prior + 3 new). `node --check scripts/tests/render-smoke.mjs` → clean.

- [ ] **Step 5: Commit**
```bash
git add scripts/tests/render-smoke.mjs scripts/tests/test_js_modules.mjs
git commit -m "test(ci): pure checkRenderedDom + deterministic regression fixtures"
```

---

## Task 2: browser harness (static server + headless Chrome) in render-smoke.mjs

**Files:**
- Modify: `scripts/tests/render-smoke.mjs` (append imports at top + the harness; keep `checkRenderedDom` unchanged)

- [ ] **Step 1: Add imports at the very top of `scripts/tests/render-smoke.mjs`** (above the doc comment is fine; ESM imports hoist — place them as the first lines of the file):

```js
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join, dirname, normalize, extname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { spawnSync } from 'node:child_process';
```

- [ ] **Step 2: Append the harness** at the END of `scripts/tests/render-smoke.mjs` (after `checkRenderedDom`):

```js
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const MIME = {
  '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript',
  '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml',
  '.png': 'image/png', '.ico': 'image/x-icon',
  '.webmanifest': 'application/manifest+json',
};

function startServer() {
  return new Promise((resolve) => {
    const srv = createServer(async (req, res) => {
      try {
        let p = decodeURIComponent((req.url || '/').split('?')[0]);
        if (p === '/' || p === '') p = '/index.html';
        const fp = normalize(join(ROOT, p));
        if (!fp.startsWith(ROOT) || !existsSync(fp)) {
          res.statusCode = 404; res.end('not found'); return;
        }
        const body = await readFile(fp);
        res.setHeader('Content-Type', MIME[extname(fp)] || 'application/octet-stream');
        res.end(body);
      } catch {
        res.statusCode = 500; res.end('error');
      }
    });
    srv.listen(0, '127.0.0.1', () => resolve(srv));
  });
}

function findChrome() {
  const cands = [
    process.env.CHROME, 'google-chrome', 'google-chrome-stable',
    'chromium', 'chromium-browser',
  ].filter(Boolean);
  const lookup = process.platform === 'win32' ? 'where' : 'which';
  for (const c of cands) {
    try {
      const w = spawnSync(lookup, [c], { encoding: 'utf8' });
      if (w.status === 0 && w.stdout && w.stdout.trim())
        return w.stdout.trim().split(/\r?\n/)[0].trim();
    } catch { /* try next */ }
  }
  return null;
}

async function main() {
  const chrome = findChrome();
  if (!chrome) {
    console.log('SKIP: no headless browser available (runs in CI)');
    process.exit(0);
  }
  const srv = await startServer();
  const port = srv.address().port;
  const url = `http://127.0.0.1:${port}/index.html`;
  try {
    const r = spawnSync(chrome, [
      '--headless=new', '--no-sandbox', '--disable-gpu',
      '--disable-dev-shm-usage', '--virtual-time-budget=8000',
      '--dump-dom', url,
    ], { encoding: 'utf8', timeout: 60000, maxBuffer: 64 * 1024 * 1024 });

    const dom = r.stdout || '';
    const ranOk = dom.includes('<html') && dom.length > 1000;
    if (!ranOk) {
      console.log(
        `SKIP: headless browser produced no DOM (env). ` +
        `status=${r.status} signal=${r.signal} ` +
        `err=${r.error && r.error.code} domLen=${dom.length}`);
      process.exit(0);
    }

    const { ok, failures } = checkRenderedDom(dom);
    if (ok) {
      console.log(`PASS: render smoke OK — MI EQUIPO rendered (DOM ${dom.length} bytes)`);
      process.exit(0);
    }
    console.error('FAIL: render smoke assertions failed:');
    for (const f of failures) console.error('  - ' + f);
    process.exit(1);
  } finally {
    srv.close();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
```

- [ ] **Step 3: Parse + unit suite unaffected** — `node --check scripts/tests/render-smoke.mjs` → clean. `node --test scripts/tests/test_js_modules.mjs 2>&1 | grep -E "^# (pass|fail)"` → all pass (importing the module does NOT run `main()` — the `import.meta.url === pathToFileURL(process.argv[1]).href` guard is false under the test runner). Confirm count unchanged vs Task 1.

- [ ] **Step 4: Run the harness directly (must NOT false-FAIL on healthy code)** — `node scripts/tests/render-smoke.mjs; echo "exit=$?"`. Acceptable outcomes:
  - `PASS: render smoke OK ...` `exit=0` (Chrome available and the spawn worked), OR
  - `SKIP: ...` `exit=0` (no Chrome, or the sandbox killed the spawn / no DOM).
  Any `FAIL ... exit=1` on the current healthy code is a defect in `checkRenderedDom`/harness — STOP and fix before commit. Record which outcome occurred.

- [ ] **Step 5: Commit**
```bash
git add scripts/tests/render-smoke.mjs
git commit -m "test(ci): headless-Chrome render-smoke harness (SKIP-safe, zero-dep)"
```

---

## Task 3: CI job + path filter in tests.yml

**Files:**
- Modify: `.github/workflows/tests.yml`

- [ ] **Step 1: Widen the path filters.** The current `on:` block is exactly:

```yaml
on:
  push:
    branches: [main]
    paths:
      - 'scripts/**.py'
      - 'futbolbase.db'
      - 'data-*.js'
      - '.github/workflows/tests.yml'
  pull_request:
    paths:
      - 'scripts/**.py'
      - 'futbolbase.db'
      - 'data-*.js'
```

Replace it with exactly:

```yaml
on:
  push:
    branches: [main]
    paths:
      - 'scripts/**.py'
      - 'scripts/tests/**'
      - 'futbolbase.db'
      - 'data-*.js'
      - 'src/**'
      - 'index.html'
      - 'style.css'
      - 'sw.js'
      - 'manifest.json'
      - '.github/workflows/tests.yml'
  pull_request:
    paths:
      - 'scripts/**.py'
      - 'scripts/tests/**'
      - 'futbolbase.db'
      - 'data-*.js'
      - 'src/**'
      - 'index.html'
      - 'style.css'
      - 'sw.js'
      - 'manifest.json'
```

- [ ] **Step 2: Add the gating job.** The file currently ends with the `node-tests` job whose last line is `        run: node --test scripts/tests/test_js_modules.mjs`. Append (one blank line then) this job at the end of the file:

```yaml

  render-smoke:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '22'
      - name: Render smoke (headless Chrome)
        run: node scripts/tests/render-smoke.mjs
```

- [ ] **Step 3: Validate the YAML** — run:
```bash
python3 -c "import yaml,sys; d=yaml.safe_load(open('.github/workflows/tests.yml')); assert set(d['jobs'])=={'pytest','node-tests','render-smoke'}, d['jobs']; print('jobs:', sorted(d['jobs'])); print('push.paths:', d[True]['push']['paths']); print('pr.paths:', d[True]['pull_request']['paths'])"
```
(Note: PyYAML parses the `on:` key as boolean `True` — that's a known YAML quirk and is fine; GitHub Actions reads it correctly. The assertion just confirms structure.) Expected: jobs == pytest/node-tests/render-smoke; both paths lists include `src/**`, `index.html`, `style.css`, `sw.js`, `manifest.json`, `scripts/tests/**` plus the originals. If PyYAML is missing: `pip install pyyaml` first (local dev only; not committed).

- [ ] **Step 4: Commit**
```bash
git add .github/workflows/tests.yml
git commit -m "ci: gating render-smoke job + trigger tests.yml on front-end changes"
```

---

## Task 4: full verification + canary proof + sign-off

**Files:** none (verification only; the canary edit is reverted, never committed)

- [ ] **Step 1: Suites green**
```bash
node --test scripts/tests/test_js_modules.mjs 2>&1 | grep -E "^# (tests|pass|fail|skipped)"
python3 -m pytest scripts/tests/ -q 2>&1 | tail -1
node --check scripts/tests/render-smoke.mjs
```
Expected: Node `# fail 0` (includes the 3 `checkRenderedDom` tests); pytest `27 passed, 5 skipped`; `node --check` clean.

- [ ] **Step 2: Deterministic guardian proof (no browser needed).** The 3 unit tests already prove `checkRenderedDom` returns `ok:false` for the globalThis-class empty-state and for an empty `#sec-miequipo`, and `ok:true` for a healthy render. Re-run just those:
```bash
node --test --test-name-pattern="checkRenderedDom" scripts/tests/test_js_modules.mjs 2>&1 | grep -E "^# (pass|fail)"
```
Expected: 3 pass / 0 fail. This is the authoritative, environment-independent proof that the guardian catches the regression class.

- [ ] **Step 3: Harness behavior (env-dependent, must be SKIP or PASS — never FAIL on healthy code)**
```bash
node scripts/tests/render-smoke.mjs; echo "exit=$?"
```
Expected: `PASS: ... exit=0` OR `SKIP: ... exit=0`. Record which. (FAIL here on healthy code = defect → STOP.)

- [ ] **Step 4: Canary red↔green (only if Step 3 produced PASS, i.e., a working local browser; otherwise this is verified in CI — see note).** Temporarily inject, as the FIRST statement inside `export function renderMiEquipo()` in `src/miequipo.js`, the line `throw new Error('smoke-canary');`. Then:
```bash
node scripts/tests/render-smoke.mjs; echo "exit=$?"
```
Expected: `FAIL: render smoke assertions failed:` with messages (hero missing / #sec-miequipo too small) and `exit=1`. Then **revert**:
```bash
git checkout -- src/miequipo.js
node scripts/tests/render-smoke.mjs; echo "exit=$?"   # back to PASS exit=0
```
The canary edit is NEVER committed. **If Step 3 was SKIP** (no usable local browser): skip the live canary; the deterministic unit tests (Step 2) already prove the checker logic, and the real browser red↔green is observed in CI when the branch runs `tests.yml` (the `render-smoke` job goes red if the rendered DOM regresses). Document in the report that the live canary was deferred to CI with the reason.

- [ ] **Step 5: Acceptance sign-off** — re-read spec §7; confirm each of the 7 criteria against Steps 1-4 evidence. Any miss → new task, not a silent pass. Note explicitly: zero npm deps added (no `package.json`, no `node_modules`), no third-party actions in `tests.yml`.

- [ ] **Step 6: Final commit only if verification fixes were needed** (otherwise none):
```bash
git add -A && git commit -m "fix(ci): render-smoke verification adjustments"
```
Never `git push` (finishing-a-development-branch handles integration; the real CI red↔green is observed there).

---

## Notes for the implementer

- `checkRenderedDom` is pure and the unit-tested core — the deterministic guardian. The browser harness is a thin, SKIP-safe wrapper; never let an environment failure (no Chrome, sandbox kill, timeout, no DOM) become `exit 1` — only a real assertion failure on a real DOM is `exit 1`.
- The `import.meta.url === pathToFileURL(process.argv[1]).href` guard ensures importing the module (unit tests) does NOT start a server/browser.
- MI EQUIPO renders synchronously from the eager classic `data-*.js` globals (no fetch), so `--dump-dom --virtual-time-budget=8000` reliably captures its content; lazy matchdetail is irrelevant to this smoke.
- Do not add `package.json`, npm deps, or third-party CI actions — the project is deliberately zero-dep.
- The path-filter widening is essential: without it `tests.yml` (hence this smoke job) never runs on `src/`/`index.html` changes — exactly the changes that introduced the two bugs this guards against.
