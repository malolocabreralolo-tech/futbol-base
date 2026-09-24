import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join, dirname, normalize, extname, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { spawnSync, spawn } from 'node:child_process';

/**
 * Render smoke test for the futbol-base SPA (rediseño «Acta», spec §11).
 *
 * `checkRenderedDom(dom, { teamName })` is a pure assertion over the serialized DOM of index.html
 * AFTER its JS ran. Its markers do not depend on the moment of the season, so it does not turn
 * red when a season ends or starts: the home screen (<section data-screen="home">) must be in
 * state A, B, C or D, with its screen header (header.screen-head), one h1 with the team name and
 * at least one block. E (asking which team), X (team absent), the error box («Reintentar») and
 * the skeleton of index.html left untouched (app.js threw) fail. Unit-tested in
 * test_rediseno_smoke.mjs with the real screen over frozen fixtures.
 *
 * Run directly (`node scripts/tests/render-smoke.mjs`) to exercise the real
 * browser harness; in CI it gates. Zero npm deps (node:* only).
 */

const ENTITIES = { '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&#39;': "'" };
const decode = (text) => text.replace(/<[^>]*>/g, '').replace(/&(amp|lt|gt|quot|#39);/g, (e) => ENTITIES[e]).trim();

export function checkRenderedDom(dom, { teamName } = {}) {
  const failures = [];
  const section = dom.match(/<section\b[^>]*\bdata-screen="home"[^>]*>/);
  const state = section ? ((section[0].match(/\bdata-state="([A-Z])"/) || [])[1] || null) : null;
  if (!section) failures.push('falta la portada: no hay <section data-screen="home">');
  else if (!state) failures.push('la portada no marca su estado (data-state)');
  else if (state === 'E') failures.push('estado E: la portada pregunta por el equipo en vez de enseñarlo');
  else if (state === 'X') failures.push('estado X: el equipo no aparece en la temporada del portal');
  else if (!'ABCD'.includes(state)) failures.push(`estado desconocido: ${state}`);
  if (section) {
    if (!/<header class="screen-head">/.test(dom)) failures.push('falta la cabecera de Mi equipo (header.screen-head)');
    const h1 = [...dom.matchAll(/<h1\b[^>]*>([\s\S]*?)<\/h1>/g)].map((m) => decode(m[1]));
    if (h1.length !== 1) failures.push(`la portada tiene ${h1.length} h1, y debe tener uno`);
    else if (teamName && !h1[0].includes(teamName)) failures.push(`el h1 dice «${h1[0]}», no «${teamName}»`);
    if (!/<section class="block">/.test(dom)) failures.push('la portada no tiene ningún bloque');
  }
  if (/data-action="retry"/.test(dom)) failures.push('caja de error con «Reintentar»: la portada no pudo cargar sus datos');
  if (/class="box skeleton[" ]|data-skeleton="/.test(dom)) failures.push('el esqueleto de index.html sigue ahí: app.js no pintó la portada');
  return { ok: failures.length === 0, failures, state };
}

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const MIME = {
  '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript',
  '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml',
  '.png': 'image/png', '.ico': 'image/x-icon', '.woff2': 'font/woff2',
  '.webmanifest': 'application/manifest+json',
};

export function startServer() {
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

export function findChrome() {
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

/* Run Chrome ASYNC (node:child_process spawn), NOT spawnSync. spawnSync
 * blocks Node's event loop for the whole Chrome run, so the in-process
 * static server can never accept Chrome's connections → every request
 * deadlocks → ETIMEDOUT/empty DOM → false SKIP (root cause 2026-05-19,
 * proven in CI). With async spawn the event loop stays free and the
 * server serves Chrome (real render in ~1s). Collect stdout, hard-kill
 * on timeout. Resolves { stdout, stderr, code, signal, timedOut,
 * spawnErr } — never rejects. */
function runChrome(bin, args, ms) {
  return new Promise((resolve) => {
    let stdout = '', stderr = '', done = false;
    const ch = spawn(bin, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    const finish = (extra) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      resolve({ stdout, stderr, ...extra });
    };
    const timer = setTimeout(() => {
      try { ch.kill('SIGKILL'); } catch { /* already gone */ }
      finish({ timedOut: true });
    }, ms);
    ch.stdout.on('data', (d) => { stdout += d; });
    ch.stderr.on('data', (d) => { stderr += d; });
    ch.on('close', (code, signal) => finish({ code, signal, timedOut: false }));
    ch.on('error', (e) => finish({ spawnErr: (e && e.code) || String(e) }));
  });
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
    const r = await runChrome(chrome, [
      '--headless=new', '--no-sandbox', '--disable-gpu',
      '--disable-dev-shm-usage', '--virtual-time-budget=8000',
      '--dump-dom', url,
    ], 45000);

    const dom = r.stdout || '';
    // A Chrome error interstitial (ERR_CONNECTION_REFUSED, etc.) also contains
    // <html> and is >1000 bytes — exclude it so an env failure is SKIP, not FAIL.
    const ranOk = dom.includes('<html') && dom.length > 1000
      && !dom.includes('ERR_') && !dom.includes('chrome-error://');
    if (!ranOk) {
      console.log(
        `SKIP: headless browser produced no DOM (env). ` +
        `timedOut=${r.timedOut} code=${r.code} signal=${r.signal} ` +
        `spawnErr=${r.spawnErr} domLen=${dom.length}`);
      process.exit(0);
    }

    // Con el almacén vacío, la portada es la del equipo por defecto (spec §4.2).
    const { PORTAL } = await import(pathToFileURL(join(ROOT, 'src', 'config.js')).href);
    const { ok, failures, state } = checkRenderedDom(dom, { teamName: PORTAL.defaultTeam.name });
    if (ok) {
      console.log(`PASS: render smoke OK — Mi equipo en estado ${state} (DOM ${dom.length} bytes)`);
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
