// Plan B2, tarea 4: index.html es el esqueleto del rediseño (spec §5.4 y §10). La cabecera, la
// barra y la primera caja se pintan antes de que lleguen los datos; app.js sustituye la caja. Lo
// que lee el bot (generate_js.py y source_health.py) se ejecuta de verdad en
// test_index_bot_contract.py; aquí, la forma. Desde B3 (decisiones 155 y 156), el arranque limpia el
// código de otras versiones una vez por versión de código (CODIGO, la huella de src/*.js y acta.css).
// Desde B4, los datos inmediatos van con defer, el arranque, en una función asíncrona (decisiones 4 y
// 5 de B4), y el registro del SW, tras load; los iconos y el manifiesto, en test_rediseno_pwa.mjs.
import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { createHash } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
import { tabbar } from '../../src/ui.js';
import { WORLDS, worldFiles } from './fixture-site.mjs';

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

test('datos inmediatos: los siete que lee la portada, con defer y en el orden de antes (decisión 5 de B2; B4, decisiones 1 y 4), y después el arranque', () => {
  const scripts = [...INDEX.matchAll(/<script\b[^>]*\bsrc="\.\/([^"?]+)\?v=\d{8}[a-z]?"[^>]*><\/script>/g)].map((m) => m[1]);
  assert.deepEqual(scripts, [
    'data-benjamin.js', 'data-prebenjamin.js', 'data-history.js', 'data-goleadores.js',
    'data-shields.js', 'data-seasons.js', 'data-maspalomas-cup-2026.js',
  ]);
  // Con defer se ejecutan en el orden del documento cuando termina el análisis, y el módulo en línea,
  // detrás: los globales ya están cuando arranca app.js (spec §5.4; decisión 4 de B4).
  const deferred = [...INDEX.matchAll(/<script defer src="\.\/([^"?]+)\?v=\d{8}[a-z]?"><\/script>/g)].map((m) => m[1]);
  assert.deepEqual(deferred, scripts, 'los siete, con defer');
  // app.js no se arranca al importarse: index.html lo importa (versionado, como los datos) y llama a start.
  const boot = INDEX.match(/<script type="module">[\s\S]*?<\/script>/);
  assert.ok(boot, 'falta el arranque');
  assert.match(boot[0], /const \{ start \} = await import\('\.\/src\/app\.js\?v=\d{8}[a-z]?'\);\s*start\(document, window\);/);
  assert.ok(INDEX.indexOf(boot[0]) > INDEX.indexOf('data-maspalomas-cup-2026.js'), 'arranca después de los datos');
  // Antes, una vez por versión de código y con un SW al mando, quita de las cachés de otras versiones
  // el código y las hojas de esta app, y vuelve a pedir la hoja: su SW los serviría viejos aunque
  // cambie la ?v= (A1 de la revisión adversarial de B2 y de la del plan B3; decisión 155 de B3).
  assert.match(boot[0], /const CODIGO = '[0-9a-f]{8}';/);
  assert.ok(boot[0].includes("seen = localStorage.getItem('futbol-base:codigo');"), 'lee el CODIGO que abrió este navegador');
  assert.ok(boot[0].includes('if (navigator.serviceWorker?.controller && seen !== CODIGO) {'), 'solo con un SW al mando y un código nuevo');
  // Su ámbito: las cachés futbolbase-v* que no son la de esta versión (la ?v= de data-seasons.js) y, en
  // ellas, src/*.js y las hojas bajo la ruta de la app; los datos, nunca.
  assert.ok(boot[0].includes('document.querySelector(\'script[src*="data-seasons.js"]\')'));
  assert.ok(boot[0].includes("if (!name.startsWith('futbolbase-v') || name === `futbolbase-v${version}`) continue;"));
  assert.ok(boot[0].includes('if (pathname.startsWith(home) && /\\/src\\/[^/]+\\.js$|\\.css$/.test(pathname) && await cache.delete(request)) stale = true;'));
  // Si se quitó algo, la hoja ya aplicada se vuelve a pedir (el SW anterior nunca la revalida).
  assert.ok(boot[0].includes('fresh.href = `${sheet.href}&c=${CODIGO}`;'));
  assert.ok(boot[0].includes('if (fresh.sheet) sheet.remove(); else fresh.remove();'));
  // El orden: se lee el marcador, se limpia, se importa app.js, start y, solo entonces, se apunta.
  const at = (text) => boot[0].indexOf(text);
  assert.ok(at("localStorage.getItem('futbol-base:codigo')") < at('caches.keys()'), 'lee el marcador antes de limpiar');
  assert.ok(at('caches.keys()') < at("import('./src/app.js"), 'limpia antes de importar');
  assert.ok(at('start(document, window);') < at("localStorage.setItem('futbol-base:codigo', CODIGO)"), 'apunta CODIGO tras start');
  // El marcador se apunta solo si un SW manda en la página: una apertura que se lo salta (Mayús+Recargar,
  // «Bypass for network») con el SW anterior todavía activo no purgó nada, y apuntarlo igual dejaría la
  // limpieza sin hacer para siempre (ronda de arreglos 1, reproducido con bypass.mjs).
  assert.match(boot[0], /start\(document, window\);\s*if \(navigator\.serviceWorker\?\.controller\) \{\s*try \{ localStorage\.setItem\('futbol-base:codigo', CODIGO\); \} catch/,
    'el marcador se apunta solo si hay un SW al mando (ronda de arreglos 1)');
  assert.doesNotMatch(boot[0], /src\/render\.js/, 'la limpieza de la app anterior queda dentro de la general');
});

test('si el arranque falla, un aviso con estilos en línea y «Reintentar», que busca el SW nuevo y recarga (R2-3)', () => {
  const boot = INDEX.match(/<script type="module">[\s\S]*?<\/script>/)[0];
  // Todo el arranque (el marcador, la limpieza, el import, start y el marcador otra vez) va dentro del
  // try: sin conexión en plena transición no hay acta.css ni los módulos nuevos, y la página nunca se
  // queda en «Cargando…». Y el try, en una función asíncrona que se llama al cerrarla, sin await de
  // nivel superior en el módulo (decisión 5 de B4): antes, solo comentarios; después, nada.
  assert.match(boot, /^<script type="module">\s*(?:\/\/[^\n]*\s*)*\(async \(\) => \{\s*try \{\s*const CODIGO = '[0-9a-f]{8}';/);
  assert.match(boot, /\}\)\(\);\s*<\/script>$/, 'la función asíncrona cierra el módulo');
  assert.ok(boot.indexOf('} catch (error) {') > boot.indexOf("localStorage.setItem('futbol-base:codigo', CODIGO)"), 'el catch recoge el import, start y el marcador');
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
  assert.match(INDEX, /<script defer src="\.\/data-seasons\.js\?v=\d{8}[a-z]?"><\/script>/);
  assert.match(INDEX, /<span id="legacyUpdated" hidden>Última actualización: \d{2}\/\d{2}\/\d{4}<\/span>/);
  assert.equal((INDEX.match(/Última actualización: /g) || []).length, 1);
});

test('tema del sistema: theme-color claro y oscuro, sin selector de tema ni fuentes de Google (spec §4.9)', () => {
  assert.match(INDEX, /<meta name="theme-color" content="#FFFFFF" media="\(prefers-color-scheme: light\)">/);
  assert.match(INDEX, /<meta name="theme-color" content="#15171C" media="\(prefers-color-scheme: dark\)">/);
  assert.doesNotMatch(INDEX, /fonts\.googleapis|fonts\.gstatic|style-acta\.css|style\.css|themeToggle|data-theme/);
});

test('CODIGO es la huella del código del árbol: src/*.js y acta.css (scripts/codigo.py; decisión 156 de B3)', () => {
  // La misma que calcula scripts/codigo.py: sha1 de acta.css y de src/*.js por nombre, de cada uno su
  // ruta, un cero, su contenido y otro cero; sus 8 primeras cifras. Si falla, se cambió código sin
  // subir CODIGO: `python3 scripts/codigo.py`. El bot nunca toca src/ ni acta.css.
  const files = ['acta.css', ...readdirSync(join(ROOT, 'src')).filter((f) => f.endsWith('.js')).sort().map((f) => `src/${f}`)];
  const hash = createHash('sha1');
  for (const file of files) hash.update(Buffer.concat([Buffer.from(`${file}\0`), readFileSync(join(ROOT, file)), Buffer.from('\0')]));
  assert.equal((INDEX.match(/const CODIGO = '([0-9a-f]{8})';/) || [])[1], hash.digest('hex').slice(0, 8),
    'CODIGO desfasado: ejecuta python3 scripts/codigo.py');
});

// B4 (decisiones 1 y 3): data-matchdetail-keys.js, data-stats.js y data-players-<S>.js ya no los lee
// nadie (el ⚽ de las listas se fue con la app anterior, Récords sale del modelo y la plantilla, de las
// actas) y el generador ya no los escribe (su prueba, en test_pygen_fixes.py). Si volvieran, cada carga
// en frío los descargaría para nada. Una fusión con main que se quede con los que el bot regeneró
// antes de publicar B4 también sale aquí.
const RETIRED = /data-(?:matchdetail-keys|stats|players-\d{4}-\d{4})\.js/;
test('los datos retirados en B4 no vuelven: ni en index.html, ni en sw.js, ni en el repositorio, ni en los mundos de las pruebas', () => {
  assert.doesNotMatch(INDEX, RETIRED);
  assert.doesNotMatch(readFileSync(join(ROOT, 'sw.js'), 'utf8'), RETIRED);
  assert.deepEqual(readdirSync(ROOT).filter((file) => RETIRED.test(file)), []);
  for (const name of Object.keys(WORLDS)) {
    assert.deepEqual(Object.keys(worldFiles(name)).filter((file) => RETIRED.test(file)), [], `mundo ${name}`);
  }
});

// El SW se registra tras el evento load (Plan B4): con los datos en defer, el <script> del registro corre
// durante el análisis, y en la primera visita su precache (unos 2 MB) competía con los datos y los
// módulos de la portada. Si load ya pasó, en seguida. El contrato de §10 se conserva: register('./sw.js')
// y .update(), sin unregister, dentro de if ('serviceWorker' in navigator). Se ejecuta el <script> real
// con un navegador falso, durante el análisis y ya cargada la página.
test('el service worker se registra tras load, o en seguida si load ya pasó, con register(\'./sw.js\') y .update() (§10)', async () => {
  const script = [...INDEX.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((m) => m[1]).find((text) => text.includes('serviceWorker'));
  assert.ok(script, 'falta el <script> del registro');
  assert.match(script, /if \('serviceWorker' in navigator\) \{/);
  assert.match(script, /navigator\.serviceWorker\.register\('\.\/sw\.js'\)\s*\.then\(reg => reg\.update\(\)\)/, 'el literal de §10');
  assert.doesNotMatch(script, /unregister\s*\(/, 'sin unregister');
  const run = (readyState) => {
    const calls = [];
    const listeners = {};
    const register = (url) => { calls.push(url); return Promise.resolve({ update: () => calls.push('update') }); };
    vm.runInContext(script, vm.createContext({
      navigator: { serviceWorker: { register } },
      document: { readyState },
      addEventListener: (type, listener) => { listeners[type] = listener; },
    }));
    return { calls, listeners };
  };
  const settle = () => new Promise((resolve) => setImmediate(resolve));
  const parsing = run('loading');
  await settle();
  assert.deepEqual(parsing.calls, [], 'durante el análisis no se registra');
  assert.deepEqual(Object.keys(parsing.listeners), ['load']);
  parsing.listeners.load();
  await settle();
  assert.deepEqual(parsing.calls, ['./sw.js', 'update'], 'tras load, se registra y busca la versión nueva');
  const loaded = run('complete');
  await settle();
  assert.deepEqual(loaded.calls, ['./sw.js', 'update'], 'si load ya pasó, en seguida');
  assert.deepEqual(Object.keys(loaded.listeners), []);
});
