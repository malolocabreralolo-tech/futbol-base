// Plan B2, tarea 4: index.html es el esqueleto del rediseño (spec §5.4 y §10). La cabecera, la
// barra y la primera caja se pintan antes de que lleguen los datos; app.js sustituye la caja. Lo
// que lee el bot (generate_js.py y source_health.py) se ejecuta de verdad en
// test_index_bot_contract.py; aquí, la forma.
import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tabbar } from '../../src/ui.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const INDEX = readFileSync(join(ROOT, 'index.html'), 'utf8');

test('esqueleto: saltar al contenido, cabecera, la barra de ui.tabbar y main#contenido.page con su primera caja', () => {
  assert.match(INDEX, /<html lang="es">/);
  assert.match(INDEX, /<a class="skip-link" href="#contenido">Saltar al contenido<\/a>/);
  assert.match(INDEX, /<header class="shell-header">/);
  assert.ok(INDEX.includes(String(tabbar('miequipo'))), 'la barra estática es ui.tabbar("miequipo"), tal cual');
  assert.equal((INDEX.match(/<nav\b/g) || []).length, 1);
  assert.match(INDEX, /<main id="contenido" class="page" tabindex="-1">\s*<div class="skeleton-screen" data-skeleton="home" aria-busy="true">/);
  assert.doesNotMatch(INDEX, /<h1\b/, 'el h1 lo pone cada pantalla');
});

test('datos inmediatos: los nueve data-*.js de antes, en el mismo orden (decisión 5), y después el arranque', () => {
  const scripts = [...INDEX.matchAll(/<script\b[^>]*\bsrc="\.\/([^"?]+)\?v=\d{8}[a-z]?"[^>]*><\/script>/g)].map((m) => m[1]);
  assert.deepEqual(scripts, [
    'data-benjamin.js', 'data-prebenjamin.js', 'data-history.js', 'data-goleadores.js',
    'data-matchdetail-keys.js', 'data-shields.js', 'data-stats.js', 'data-seasons.js',
    'data-maspalomas-cup-2026.js',
  ]);
  // app.js no se arranca al importarse: index.html lo importa (versionado, como los datos) y llama a start.
  const boot = INDEX.match(/<script type="module">[\s\S]*?<\/script>/);
  assert.ok(boot, 'falta el arranque');
  assert.match(boot[0], /const \{ start \} = await import\('\.\/src\/app\.js\?v=\d{8}[a-z]?'\);\s*start\(document, window\);/);
  assert.ok(INDEX.indexOf(boot[0]) > INDEX.indexOf('data-maspalomas-cup-2026.js'), 'arranca después de los datos');
  // Antes, quita de las cachés de la app anterior (las que guardan src/render.js) sus app.js, state.js
  // y links.js: su SW los serviría viejos aunque cambie la ?v= (A1 de la revisión adversarial).
  assert.match(boot[0], /if \(navigator\.serviceWorker\?\.controller\) \{/);
  assert.match(boot[0], /for \(const name of await caches\.keys\(\)\)/);
  assert.match(boot[0], /cache\.match\('\.\/src\/render\.js', \{ ignoreSearch: true \}\)/);
  assert.match(boot[0], /for \(const file of \['\.\/src\/app\.js', '\.\/src\/state\.js', '\.\/src\/links\.js'\]\) await cache\.delete\(file, \{ ignoreSearch: true \}\);/);
  assert.ok(boot[0].indexOf('caches.keys') < boot[0].indexOf("import('./src/app.js"), 'limpia antes de importar');
  assert.doesNotMatch(INDEX, /<script\b[^>]*\bdefer\b/, 'defer llega en B4');
});

test('si el arranque falla, un aviso con estilos en línea y «Reintentar», que busca el SW nuevo y recarga (R2-3)', () => {
  const boot = INDEX.match(/<script type="module">[\s\S]*?<\/script>/)[0];
  // Todo el arranque (la limpieza, el import y start) va dentro del try: sin conexión en plena
  // transición no hay acta.css ni los módulos nuevos, y la página nunca se queda en «Cargando…».
  assert.match(boot, /^<script type="module">\s*(?:\/\/[^\n]*\s*)*try \{\s*if \(navigator\.serviceWorker\?\.controller\)/);
  assert.ok(boot.indexOf('} catch (error) {') > boot.indexOf('start(document, window);'), 'el catch recoge el import y start');
  assert.match(boot, /innerHTML = `<div role="alert" style="[^"]+">\s*<p style="[^"]+">No se pudo abrir la versión nueva de la app\. Comprueba la conexión y pulsa Reintentar\.<\/p>\s*<button type="button" id="reintentar-arranque" style="[^"]*min-height:44px[^"]*">Reintentar<\/button>\s*<\/div>`;/);
  const retry = boot.slice(boot.indexOf("getElementById('reintentar-arranque')"));
  assert.match(retry, /registration\.update\(\)/, 'Reintentar busca el SW nuevo');
  assert.match(retry, /location\.reload\(\);/, 'y recarga');
});

test('marcas del bot: una sola versión en todas las ?v=, data-seasons.js versionado y el literal oculto', () => {
  const versions = new Set([...INDEX.matchAll(/\?v=([0-9a-z]+)/g)].map((m) => m[1]));
  assert.equal(versions.size, 1, [...versions].join(', '));
  assert.match([...versions][0], /^\d{8}[a-z]?$/);
  // La hoja va en una URL nueva, acta.css: el SW de la app anterior sirve style.css desde su caché.
  assert.match(INDEX, /<link rel="stylesheet" href="\.\/acta\.css\?v=\d{8}[a-z]?">/);
  assert.match(INDEX, /<script src="\.\/data-seasons\.js\?v=\d{8}[a-z]?"><\/script>/);
  assert.match(INDEX, /<span id="legacyUpdated" hidden>Última actualización: \d{2}\/\d{2}\/\d{4}<\/span>/);
  assert.equal((INDEX.match(/Última actualización: /g) || []).length, 1);
});

test('tema del sistema: theme-color claro y oscuro, sin selector de tema ni fuentes de Google (spec §4.9)', () => {
  assert.match(INDEX, /<meta name="theme-color" content="#FFFFFF" media="\(prefers-color-scheme: light\)">/);
  assert.match(INDEX, /<meta name="theme-color" content="#15171C" media="\(prefers-color-scheme: dark\)">/);
  assert.doesNotMatch(INDEX, /fonts\.googleapis|fonts\.gstatic|style-acta\.css|style\.css|themeToggle|data-theme/);
});
