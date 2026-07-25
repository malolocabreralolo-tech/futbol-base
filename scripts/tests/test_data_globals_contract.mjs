// Contrato: cada global que src/*.js lee con `typeof X !== 'undefined'` tiene
// que estar DECLARADA por algún data-*.js cargado de forma eager en index.html.
//
// Por qué existe este test: los data-*.js declaran `const X = …` en scripts
// clásicos, así que X vive en el registro léxico global y no en `globalThis`.
// El patrón del proyecto es leerlas con identificador desnudo + typeof-guard, y
// ese guard DEVUELVE null EN SILENCIO si la variable no existe: una sección
// entera se queda vacía sin un solo error en consola.
//
// Pasó de verdad (28/06/2026): `fetch_maspalomas_cup.py` emitía
// `MASPALOMAS_CUP_2026` mientras state.js leía `MASPALOMAS_CUP_BENJAMIN` /
// `MASPALOMAS_CUP_PREBENJAMIN`. El fichero publicado estaba bien porque se
// había editado a mano, pero cualquier re-ejecución del scraper habría dejado
// la Maspalomas Cup en blanco. Este test ata las dos puntas.
import { test } from 'node:test';
import assert from 'node:assert';
import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

// Globales que NO vienen de un data-*.js eager y por tanto no aplican:
// se cargan de forma perezosa (fetch + parse) o son estado del propio módulo.
const NOT_FROM_EAGER_DATA = new Set([
  'S',              // estado de la app (state.js)
  'HIST_MATCHES',   // per-season, fetch perezoso
]);

const read = (p) => readFileSync(join(ROOT, p), 'utf8');

function eagerDataScripts() {
  const html = read('index.html');
  return [...html.matchAll(/src="\.\/(data-[\w.-]+\.js)(?:\?[^"]*)?"/g)]
    .map((m) => m[1]);
}

function declaredIn(file) {
  const src = read(file);
  return new Set(
    [...src.matchAll(/^const ([A-Z][A-Z0-9_]*)\s*=/gm)].map((m) => m[1]),
  );
}

function guardedGlobals() {
  const dir = join(ROOT, 'src');
  const found = new Map(); // global -> [ficheros]
  for (const f of readdirSync(dir).filter((f) => f.endsWith('.js'))) {
    const src = readFileSync(join(dir, f), 'utf8');
    for (const m of src.matchAll(/typeof ([A-Z][A-Z0-9_]*) !== 'undefined'/g)) {
      if (!found.has(m[1])) found.set(m[1], []);
      found.get(m[1]).push(`src/${f}`);
    }
  }
  return found;
}

test('todo global leído con typeof-guard lo declara un data-*.js eager', () => {
  const declared = new Map(); // global -> fichero que la declara
  for (const file of eagerDataScripts()) {
    for (const name of declaredIn(file)) declared.set(name, file);
  }

  const missing = [];
  for (const [name, users] of guardedGlobals()) {
    if (NOT_FROM_EAGER_DATA.has(name)) continue;
    if (!declared.has(name)) missing.push(`${name} (leída en ${users.join(', ')})`);
  }

  assert.deepStrictEqual(
    missing, [],
    `Globales que nadie declara — la sección se renderiza VACÍA sin error:\n  ` +
    missing.join('\n  '),
  );
});

test('los data-*.js eager de index.html existen y declaran algo', () => {
  for (const file of eagerDataScripts()) {
    const names = declaredIn(file);
    assert.ok(names.size > 0, `${file} no declara ninguna const de nivel superior`);
  }
});

test('el service worker precachea todos los data-*.js eager', () => {
  // Si un data-*.js eager falta en STATIC_ASSETS, la PWA arranca sin él en la
  // primera carga offline y esa sección aparece vacía.
  const sw = read('sw.js');
  const assets = sw.slice(sw.indexOf('STATIC_ASSETS'), sw.indexOf('SEASON_FILES'));
  for (const file of eagerDataScripts()) {
    assert.ok(assets.includes(`'./${file}'`),
      `${file} se carga eager en index.html pero no está en STATIC_ASSETS de sw.js`);
  }
});

test('el generador de la Maspalomas Cup emite las variables que consume state.js', () => {
  // Contrato específico del bug: el script Python y el consumidor JS tienen que
  // hablar de las mismas variables (el .js publicado se regenera desde él).
  const py = read('scripts/fetch_maspalomas_cup.py');
  const state = read('src/state.js');
  for (const v of ['MASPALOMAS_CUP_BENJAMIN', 'MASPALOMAS_CUP_PREBENJAMIN']) {
    assert.ok(py.includes(v), `${v} no aparece en fetch_maspalomas_cup.py`);
    assert.ok(state.includes(v), `${v} ya no se usa en state.js`);
  }
});
