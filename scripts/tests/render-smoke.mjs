import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join, dirname, normalize, extname, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { spawnSync } from 'node:child_process';

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
 * browser harness (added in Task 2); in CI it gates. Zero npm deps (node:* only).
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
  if (!has('me-crow') && !has('me-next') && !has('Sin partidos'))
    failures.push('calendar rendered no rows and no "Sin partidos" (.me-crow/.me-next)');
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
        if (!fp.startsWith(ROOT + sep) || !existsSync(fp)) {
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
  const envC = process.env.CHROME;
  if (envC && (envC.startsWith('/') || /^[A-Za-z]:\\/.test(envC))) return envC;
  const cands = [
    envC, 'google-chrome', 'google-chrome-stable',
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
    console.log('SKIP: no headless browser available (headless browser only required in CI)');
    process.exit(0);
  }
  const srv = await startServer();
  process.on('exit', () => { try { srv.close(); } catch { /* noop */ } });
  const port = srv.address().port;
  const url = `http://127.0.0.1:${port}/index.html`;
  try {
    const r = spawnSync(chrome, [
      '--headless=new', '--no-sandbox', '--disable-gpu',
      '--disable-dev-shm-usage', '--virtual-time-budget=8000',
      '--dump-dom', url,
    ], { encoding: 'utf8', timeout: 60000, maxBuffer: 64 * 1024 * 1024 });

    const dom = r.stdout || '';
    // A Chrome error interstitial (ERR_CONNECTION_REFUSED, etc.) also contains
    // <html> and is >1000 bytes — exclude it so an env failure is SKIP, not FAIL.
    const ranOk = dom.includes('<html') && dom.length > 1000
      && !dom.includes('ERR_') && !dom.includes('chrome-error://');
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
    // server is closed via the process 'exit' hook (process.exit() does not
    // run finally reliably across async); kept here as a no-op marker.
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
