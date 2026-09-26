// Servidor estático que imita a GitHub Pages (decisión 11 del plan B4), para medir el presupuesto
// (presupuesto.mjs) con las mismas condiciones que la web publicada:
// - gzip en los ficheros de texto (HTML, CSS, JavaScript, JSON, SVG y el manifiesto) si el navegador
//   lo acepta, como GitHub Pages; las imágenes y la fuente, tal cual;
// - Cache-Control: max-age=600 en cada respuesta, como GitHub Pages;
// - el sitio en la raíz y también bajo /futbol-base/, la ruta de la web publicada; «/» y
//   «/futbol-base/» son index.html, y la ?v= no cuenta;
// - solo GET y HEAD, y nada fuera de `root` (404).
// startPagesServer(root, { port }) → { url, close() }: url es la raíz, con la barra final.
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize, resolve, sep } from 'node:path';
import { gzipSync } from 'node:zlib';

const PREFIX = '/futbol-base';
const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.mjs': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
};
const COMPRESSIBLE = /^(?:text\/|application\/(?:javascript|json|manifest\+json)|image\/svg\+xml)/;

// El fichero de `root` que sirve una ruta de la URL, o null si queda fuera.
function fileFor(root, pathname) {
  let path;
  try { path = decodeURIComponent(pathname); } catch { return null; }
  if (path === PREFIX || path.startsWith(`${PREFIX}/`)) path = path.slice(PREFIX.length) || '/';
  if (path.endsWith('/')) path += 'index.html';
  const file = normalize(join(root, path));
  return file.startsWith(root + sep) ? file : null;
}

export async function startPagesServer(root, { port = 0 } = {}) {
  const base = resolve(root);
  const gzipped = new Map();
  const server = createServer(async (req, res) => {
    try {
      if (req.method !== 'GET' && req.method !== 'HEAD') {
        res.writeHead(405, { Allow: 'GET, HEAD' });
        res.end();
        return;
      }
      const file = fileFor(base, new URL(req.url, 'http://pages.local').pathname);
      const info = file ? await stat(file).catch(() => null) : null;
      if (!info || !info.isFile()) {
        res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'max-age=600' });
        res.end(req.method === 'HEAD' ? undefined : 'no está en el sitio');
        return;
      }
      const type = TYPES[extname(file).toLowerCase()] || 'application/octet-stream';
      const headers = { 'Content-Type': type, 'Cache-Control': 'max-age=600', Vary: 'Accept-Encoding' };
      let body = await readFile(file);
      if (COMPRESSIBLE.test(type) && /\bgzip\b/.test(req.headers['accept-encoding'] || '')) {
        const key = `${file}\0${info.mtimeMs}\0${info.size}`;
        if (!gzipped.has(key)) gzipped.set(key, gzipSync(body));
        body = gzipped.get(key);
        headers['Content-Encoding'] = 'gzip';
      }
      headers['Content-Length'] = body.length;
      res.writeHead(200, headers);
      res.end(req.method === 'HEAD' ? undefined : body);
    } catch {
      res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('error');
    }
  });
  await new Promise((ready, fail) => {
    server.once('error', fail);
    server.listen(port, '127.0.0.1', ready);
  });
  return {
    url: `http://127.0.0.1:${server.address().port}/`,
    close: () => new Promise((done) => {
      server.closeAllConnections();
      server.close(() => done());
    }),
  };
}
