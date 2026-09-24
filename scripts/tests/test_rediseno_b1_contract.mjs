// Plan B1, tarea 14: contrato de los cimientos del rediseño.
// - Los módulos nuevos se importan en Node sin DOM y no tocan globales del
//   navegador al importarse.
// - No leen globales de datos (data-*.js) ni del navegador (globalThis,
//   window, document, localStorage): reciben los datos por parámetro (el
//   cableado llega en B2).
// - Solo importan módulos planos de src/ que sobreviven al corte de B2.
// - La app actual no carga nada de B1: ni index.html, ni sw.js, ni
//   manifest.json, ni el grafo de imports de src/app.js.
import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const NEW = ['html.js', 'model.js', 'myteam.js', 'store.js', 'ui.js'];
// Lo que pueden importar: los nuevos y el legado que se queda tras el corte (spec §5.2).
const ALLOWED_IMPORTS = new Set([...NEW, 'links.js', 'state.js', 'config.js']);
const read = (path) => readFileSync(join(ROOT, path), 'utf8');

// Globales de datos: los nombres que declaran los data-*.js en su nivel superior («const X=» al
// principio de línea o tras «;»). Solo se leen los nombres, nunca los valores: es la única
// lectura de esos ficheros que se permite en las pruebas. El patrón de años cubre además los
// ficheros que aparecerán al activar temporadas nuevas.
const DATA_NAMES = [...new Set(readdirSync(ROOT).filter((f) => /^data-.*\.js$/.test(f))
  .flatMap((f) => [...read(f).matchAll(/(?:^|;)\s*(?:const|let|var)\s+([A-Z][A-Z0-9_]*)\s*=/gm)].map((m) => m[1])))].sort();
const DATA_GLOBAL = new RegExp(String.raw`\b(?:${DATA_NAMES.join('|')}|(?:SEASON|LINEUPS|PLAYERS|TEAMS)_\d{4}_\d{4})\b`);
// Código sin comentarios (los comentarios pueden nombrar HISTORY o localStorage).
const code = (src) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');

test('los módulos nuevos se importan en Node sin tocar globales del navegador', async () => {
  // Legado: su nivel superior mira `document` con typeof. Se carga antes de las trampas.
  await import('../../src/state.js');
  await import('../../src/links.js');
  const names = ['window', 'document', 'localStorage', 'sessionStorage', 'location', 'history', 'navigator'];
  const saved = names.map((n) => [n, Object.getOwnPropertyDescriptor(globalThis, n)]);
  const touched = [];
  for (const n of names) {
    Object.defineProperty(globalThis, n, { configurable: true, get() { touched.push(n); return undefined; } });
  }
  try {
    for (const f of NEW) await import(`../../src/${f}`);
  } finally {
    for (const [n, d] of saved) {
      if (d) Object.defineProperty(globalThis, n, d);
      else delete globalThis[n];
    }
  }
  assert.deepEqual(touched, [], `leídos al importar: ${touched.join(', ')}`);
});

test('los módulos nuevos no leen globales de datos ni del navegador', () => {
  // La lista sale de los propios data-*.js: también HIST_MATCHES, declarado tras un «;».
  for (const name of ['BENJAMIN', 'PREBENJAMIN', 'HISTORY', 'HIST_MATCHES', 'SHIELDS', 'SEASONS', 'MATCH_DETAIL']) {
    assert.ok(DATA_NAMES.includes(name), `falta ${name} en la lista de globales de datos`);
  }
  for (const f of NEW) {
    const src = code(read(`src/${f}`));
    assert.doesNotMatch(src, /\btypeof\s+[A-Z][A-Z0-9_]*\b/, `${f}: typeof sobre un global`);
    const browser = src.match(/\b(globalThis|window|document|localStorage|sessionStorage)\b/);
    assert.equal(browser, null, `${f} nombra el global del navegador ${browser && browser[0]}`);
    const hit = src.match(DATA_GLOBAL);
    assert.equal(hit, null, `${f} nombra el global de datos ${hit && hit[0]}`);
  }
});

test('los módulos nuevos solo importan módulos planos de src/ que sobreviven al corte', () => {
  for (const f of NEW) {
    const src = code(read(`src/${f}`));
    assert.doesNotMatch(src, /\bimport\s*\(/, `${f}: import() dinámico`);
    for (const [, spec] of src.matchAll(/(?:from|import)\s*['"]([^'"]+)['"]/g)) {
      assert.match(spec, /^\.\/[\w-]+\.js$/, `${f}: «${spec}» no es un módulo plano de src/`);
      assert.ok(ALLOWED_IMPORTS.has(spec.slice(2)), `${f} importa ${spec}, que se borra en el corte de B2`);
    }
  }
});

// Mismo recorrido que test_sw_fixes.mjs: imports estáticos desde src/app.js.
function staticImportGraph(entry) {
  const seen = new Set();
  const queue = [entry];
  while (queue.length) {
    const f = queue.pop();
    if (seen.has(f)) continue;
    seen.add(f);
    for (const m of read(`src/${f}`).matchAll(/(?:from|import)\s+['"]\.\/([\w-]+\.js)['"]/g)) queue.push(m[1]);
  }
  return seen;
}

test('la app actual no importa los módulos nuevos', () => {
  const graph = staticImportGraph('app.js');
  assert.ok(graph.has('links.js'), 'el grafo de app.js debería incluir links.js');
  assert.deepEqual(NEW.filter((f) => graph.has(f)), []);
});

test('index.html, sw.js y manifest.json no cargan nada de B1', () => {
  const B1 = [...NEW.map((f) => `src/${f}`), 'style-acta.css', 'PublicSans-latin.woff2', 'icons/icon-'];
  for (const file of ['index.html', 'sw.js', 'manifest.json']) {
    const src = read(file);
    assert.deepEqual(B1.filter((ref) => src.includes(ref)), [], `${file} ya referencia ficheros de B1`);
  }
});
