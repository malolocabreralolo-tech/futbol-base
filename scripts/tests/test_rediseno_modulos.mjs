// Plan B2, tarea 4: contrato de los módulos de src/ desde el corte (spec §5.1, §5.2 y §10).
// Sustituye al contrato de B1 (test_rediseno_b1_contract.mjs), que vigilaba que la app vieja no
// cargara nada nuevo. Es genérico: vale para todo src/, también para los módulos que lleguen.
// - Ningún módulo toca el navegador al importarse, sin excepciones: app.js exporta su arranque
//   (start) y lo llama index.html.
// - Solo state.js nombra los globales de datos, y nadie usa globalThis.
// - Imports planos y estáticos, a módulos que existen; src/ sin subcarpetas.
// - Cada screen-*.js exporta el contrato de pantalla, y los nueve módulos viejos no vuelven.
import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const read = (path) => readFileSync(join(ROOT, path), 'utf8');
const ENTRIES = readdirSync(join(ROOT, 'src'));
const MODULES = ENTRIES.filter((f) => f.endsWith('.js')).sort();
const OLD = ['render.js', 'modals.js', 'miequipo.js', 'init.js', 'favorites.js', 'filters.js', 'health.js',
  'plantilla.js', 'matchdetail-rich.js'];
const BROWSER = ['window', 'document', 'localStorage', 'sessionStorage', 'location', 'history', 'navigator'];

// Código sin comentarios (los comentarios pueden nombrar HISTORY o localStorage).
const code = (src) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
// Globales de datos: los nombres que declaran los data-*.js en su nivel superior. Solo los
// nombres, nunca los valores; el patrón cubre los ficheros de temporadas que aún no existen.
const DATA_NAMES = [...new Set(readdirSync(ROOT).filter((f) => /^data-.*\.js$/.test(f))
  .flatMap((f) => [...read(f).matchAll(/(?:^|;)\s*(?:const|let|var)\s+([A-Z][A-Z0-9_]*)\s*=/gm)].map((m) => m[1])))].sort();
const DATA_GLOBAL = new RegExp(String.raw`\b(?:${DATA_NAMES.join('|')}|(?:SEASON|LINEUPS|PLAYERS|TEAMS)_\d{4}_\d{4})\b`);

// Importa `files` con trampas en los globales del navegador y devuelve los que se leyeron.
async function importWatching(files) {
  const saved = BROWSER.map((name) => [name, Object.getOwnPropertyDescriptor(globalThis, name)]);
  const touched = [];
  for (const name of BROWSER) {
    Object.defineProperty(globalThis, name, { configurable: true, get() { touched.push(name); return undefined; } });
  }
  try {
    for (const f of files) await import(`../../src/${f}`);
  } finally {
    for (const [name, descriptor] of saved) {
      if (descriptor) Object.defineProperty(globalThis, name, descriptor);
      else delete globalThis[name];
    }
  }
  return touched;
}

test('ningún módulo de src/ toca el navegador al importarse, app.js incluido', async () => {
  for (const f of ['app.js', 'screen-home.js', 'state.js']) assert.ok(MODULES.includes(f), MODULES.join(', '));
  assert.deepEqual(await importWatching(MODULES), []);
});

test('app.js exporta su arranque: lo llama index.html, nunca el propio módulo al importarse', async () => {
  const app = await import('../../src/app.js');
  assert.equal(typeof app.start, 'function');
  assert.equal(typeof app.startContext, 'function');
  assert.doesNotMatch(code(read('src/app.js')), /^\s*start\(/m, 'app.js no se arranca a sí mismo');
});

test('solo state.js nombra los globales de datos, y ningún módulo usa globalThis', () => {
  for (const name of ['BENJAMIN', 'PREBENJAMIN', 'HISTORY', 'HIST_MATCHES', 'SHIELDS', 'SEASONS', 'GOL_BENJ']) {
    assert.ok(DATA_NAMES.includes(name), `falta ${name} en la lista de globales de datos`);
  }
  for (const f of MODULES) {
    const src = code(read(`src/${f}`));
    assert.doesNotMatch(src, /\bglobalThis\b/, `${f} usa globalThis`);
    if (f === 'state.js') continue;
    assert.doesNotMatch(src, /\btypeof\s+[A-Z][A-Z0-9_]*\b/, `${f}: typeof sobre un global`);
    const hit = src.match(DATA_GLOBAL);
    assert.equal(hit, null, `${f} nombra el global de datos ${hit && hit[0]}: los datos entran por state.js`);
  }
});

test('imports planos y estáticos, a módulos de src/ que existen; src/ sin subcarpetas', () => {
  for (const entry of ENTRIES) assert.ok(statSync(join(ROOT, 'src', entry)).isFile(), `src/${entry} no es un fichero`);
  for (const f of MODULES) {
    const src = code(read(`src/${f}`));
    assert.doesNotMatch(src, /\bimport\s*\(/, `${f}: import() dinámico`);
    for (const [, spec] of src.matchAll(/(?:from|import)\s*['"]([^'"]+)['"]/g)) {
      assert.match(spec, /^\.\/[\w-]+\.js$/, `${f}: «${spec}» no es un módulo plano de src/`);
      assert.ok(MODULES.includes(spec.slice(2)), `${f} importa ${spec}, que no existe`);
    }
  }
});

test('cada screen-*.js exporta el contrato de pantalla { id, needs, render }', async () => {
  const screens = MODULES.filter((f) => /^screen-[a-z]+\.js$/.test(f));
  assert.ok(screens.includes('screen-home.js'));
  for (const f of screens) {
    const { screen } = await import(`../../src/${f}`);
    assert.equal(screen.id, f.slice('screen-'.length, -'.js'.length), f);
    assert.equal(typeof screen.needs, 'function', f);
    assert.equal(typeof screen.render, 'function', f);
    if ('mount' in screen) assert.equal(typeof screen.mount, 'function', f);
  }
});

test('los nueve módulos del diseño anterior no vuelven', () => {
  assert.deepEqual(OLD.filter((f) => MODULES.includes(f)), []);
});
