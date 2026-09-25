// Capturas para el usuario (spec §11, verificación visual antes de publicar): cada pantalla de B2 y
// los estados A, B, C, D, E y X de la portada, más error, vacío y sin conexión, y las de B3 (la ficha
// en A y en D con su plantilla y su trayectoria abiertas, Explorar con resultados, Ligas con
// «Comparar grupos» abierto, el cuadro y la liguilla de Copa, Goleadores, Récords, Temporadas, Fuentes
// y Ajustes), a 390 px en claro y en oscuro y a 1440 px en claro. Salen de los mundos de fixtures de
// fixture-site.mjs (datos congelados y reloj fijado), así que no dependen del día. Cada captura es la
// pantalla entera: la ventana crece hasta el alto de la página, con la barra en su sitio.
// Uso, desde la raíz del repo: OUT=<directorio> node scripts/tests/capturas.mjs
import { strict as assert } from 'node:assert';
import { createRequire } from 'node:module';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { startServer, findChrome } from './render-smoke.mjs';
import { waitForAsync } from './browser-wait.mjs';
import { useWorld } from './fixture-site.mjs';

const out = process.env.OUT;
if (!out) { console.error('Falta OUT=<directorio de las capturas>'); process.exit(2); }
mkdirSync(out, { recursive: true });
const { chromium } = createRequire(import.meta.url)('playwright');
const chrome = findChrome();
assert.ok(chrome, 'Chrome is required for the screenshots');

const PARTIDO_J15 = '#/partido?s=2025-2026&g=PG2&r=Jornada%2015&h=AD%20Hurac%C3%A1n&a=Las%20Mesas%20Hu.';
const PARTIDO_J30 = '#/partido?s=2025-2026&g=PG2&r=Jornada%2030&h=Las%20Mesas%20Hu.&a=AD%20Hurac%C3%A1n';
const PARTIDO_ACTA = '#/partido?s=2025-2026&g=A1&r=Jornada%201&h=Guayarmina&a=Santidad';
// La ficha de Guayarmina (A1), con actas en las fixtures: su plantilla sale de ellas.
const GUAYARMINA = '#/equipo?s=2025-2026&g=A1&t=Guayarmina';
// Lo que se abre antes de la foto: [botón que se pulsa, lo que tiene que aparecer].
const OPEN_SQUAD_AND_TRAJECTORY = [
  ['#contenido button.squad-player', '#contenido tr.squad-detail a.squad-match'],
  ['#contenido button[data-action="trayectoria"]', '#trayectoria a.traj-row'],
];
// [nombre, mundo, ruta, lo que tiene que verse: data-screen y data-state (null: sin estado), opciones]
const SHOTS = [
  ['portada-A', 'A', '#/', ['home', 'A']],
  ['portada-B', 'B', '#/', ['home', 'B']],
  ['portada-C', 'C', '#/', ['home', 'C']],
  ['portada-D', 'D', '#/', ['home', 'D']],
  ['portada-E', 'E', '#/', ['home', 'E']],
  ['portada-X', 'X', '#/', ['home', 'X']],
  ['jornada', 'A', '#/jornada', ['jornada', null]],
  ['tabla', 'D', '#/tabla', ['tabla', null]],
  ['tabla-forma', 'D', '#/tabla?v=forma', ['tabla', null]],
  ['partido', 'D', PARTIDO_J15, ['partido', null]],
  ['partido-acta', 'D', PARTIDO_ACTA, ['partido', null]],
  // Error: la temporada 2023-24 no llega (503) → la caja de error de la pantalla, con «Reintentar».
  ['error', 'D', '#/tabla?s=2023-2024', ['tabla', 'error'], { fail: ['data-season-2023-2024.js'] }],
  // Vacío: un partido sin cronología ni acta (spec §4.5 y caso 7 de §11).
  ['vacio', 'D', PARTIDO_J30, ['partido', null]],
  // Sin conexión: el aviso de la cabecera con la fecha de data-health (spec §4.10).
  ['sin-conexion', 'D', '#/', ['home', 'D'], { offline: true }],
  // B3: la ficha a mitad de temporada (A) y terminada (D), con la plantilla y la trayectoria abiertas.
  ['equipo-A', 'A', GUAYARMINA, ['equipo', 'A'], { act: OPEN_SQUAD_AND_TRAJECTORY }],
  ['equipo-D', 'D', GUAYARMINA, ['equipo', 'D'], { act: OPEN_SQUAD_AND_TRAJECTORY }],
  // Explorar con los resultados de «hurac» (la búsqueda va en la ruta).
  ['explorar', 'D', '#/explorar?s=2025-2026&q=hurac', ['explorar', null]],
  // Ligas: los grupos de prebenjamín de Gran Canaria, con «Comparar grupos» abierto.
  ['ligas-comparar', 'D', '#/ligas?s=2025-2026&c=prebenjamin&f=grancanaria', ['ligas', null],
    { act: [['#comparar-prebenjamin', '#comparar-prebenjamin-tabla tbody tr']] }],
  // Copa: el cuadro (Copa Maspalomas benjamín, MCBK2) y una liguilla (MCP3).
  ['copa-cuadro', 'D', '#/copa?s=2025-2026&g=MCBK2', ['copa', null]],
  ['copa-liguilla', 'D', '#/copa?s=2025-2026&g=MCP3', ['copa', null]],
  ['goleadores', 'D', '#/goleadores', ['goleadores', null]],
  ['records', 'D', '#/records', ['records', null]],
  ['temporadas', 'D', '#/temporadas', ['temporadas', null]],
  ['fuentes', 'D', '#/fuentes', ['fuentes', null]],
  ['ajustes', 'D', '#/ajustes', ['ajustes', null]],
];
const VARIANTS = [[390, 844, 'light', 'claro'], [390, 844, 'dark', 'oscuro'], [1440, 900, 'light', 'claro']];

const server = await startServer();
const base = `http://127.0.0.1:${server.address().port}/index.html`;
const browser = await chromium.launch({ executablePath: chrome, headless: true, args: ['--no-sandbox'] });
const problems = [];
let count = 0;
try {
  for (const [name, world, hash, [screen, state], options = {}] of SHOTS) {
    for (const [width, height, colorScheme, theme] of VARIANTS) {
      const label = `${name}-${width}-${theme}`;
      const context = await browser.newContext({
        viewport: { width, height }, colorScheme, serviceWorkers: 'block', locale: 'es-ES',
        timezoneId: 'Atlantic/Canary', reducedMotion: 'reduce',
      });
      try {
        await useWorld(context, world, { fail: options.fail || [] });
        const page = await context.newPage();
        page.setDefaultTimeout(10000);
        page.on('pageerror', (error) => problems.push(`${label}: ${error.message}`));
        await page.goto(base + hash);
        await waitForAsync(page, ([s, st]) => {
          const section = document.querySelector('#contenido section[data-screen]');
          return section && section.getAttribute('data-screen') === s && section.getAttribute('data-state') === st;
        }, [screen, state], { label });
        // Lo que se abre antes de la foto, con su localizador: sin esperas fijas. Después, el ratón a
        // la esquina: nada queda subrayado por :hover en la foto.
        for (const [button, shown] of options.act || []) {
          await page.locator(button).first().click();
          await page.locator(shown).first().waitFor();
        }
        if (options.act) await page.mouse.move(0, 0);
        // La ventana, del alto de la página: todo queda a la vista y los escudos diferidos cargan.
        const fit = async () => {
          const full = await page.evaluate(() => ({ height: document.documentElement.scrollHeight, overflow: document.documentElement.scrollWidth - innerWidth }));
          if (full.overflow > 0) problems.push(`${label}: desplazamiento horizontal de ${full.overflow}px`);
          await page.setViewportSize({ width, height: Math.max(height, full.height) });
        };
        await fit();
        // Los escudos (o ya su monograma) y la fuente, cargados antes de la foto. Los del cuadro de copa
        // que quedan fuera de la vista dentro de su caja deslizante no cargarían nunca: se piden ya.
        await page.evaluate(() => { for (const img of document.querySelectorAll('img[loading="lazy"]')) img.loading = 'eager'; });
        await waitForAsync(page, () => document.fonts.status === 'loaded'
          && [...document.images].every((img) => img.complete && img.naturalWidth > 0), null, { label: `${label}, escudos y fuente` });
        if (options.offline) {
          // Sin conexión, después de cargar: el aviso de la cabecera, con los escudos ya en la página.
          await context.setOffline(true);
          await waitForAsync(page, () => document.querySelector('.shell-offline')?.textContent.startsWith('Sin conexión.'));
          await fit();
        }
        await page.screenshot({ path: join(out, `${label}.png`) });
        count += 1;
        console.log(`${label}: ${screen}${state ? ` (${state})` : ''}`);
      } finally {
        await context.close();
      }
    }
  }
} finally {
  await browser.close();
  server.closeAllConnections();
  await new Promise((resolve) => server.close(resolve));
}
console.log(problems.length ? 'PROBLEMAS:\n' + problems.join('\n') : `OK: ${count} capturas en ${out}`);
process.exit(problems.length ? 1 : 0);
