import { strict as assert } from 'node:assert';
import { createRequire } from 'node:module';
import { startServer, findChrome } from './render-smoke.mjs';

// npm install --no-save --package-lock=false playwright@1.58.0
// node scripts/tests/interaction-smoke.mjs
// Uses the installed Chrome (or CHROME=/absolute/path), like render-smoke.
//
// Desde el corte de B2, en mínimos: la portada carga a 320, 390, 768 y 1440 px, en claro y en
// oscuro (prefers-color-scheme emulado), con los colores de su tema, sin desplazamiento
// horizontal, con un solo h1 y con la barra de 4 destinos sin tapar el contenido. Los escenarios
// de navegación de §11 llegan con el router y las pantallas (Tarea 13).
const { chromium } = createRequire(import.meta.url)('playwright');
const chrome = findChrome();
assert.ok(chrome, 'Chrome is required for the interaction smoke test');
const server = await startServer();
const url = `http://127.0.0.1:${server.address().port}/index.html`;
const PAPER = { light: 'rgb(255, 255, 255)', dark: 'rgb(21, 23, 28)' };   // --paper de cada tema (spec §3.1)
let browser;

async function checkHome(viewport, colorScheme) {
  const context = await browser.newContext({
    viewport, colorScheme, serviceWorkers: 'block', locale: 'es-ES',
    timezoneId: 'Atlantic/Canary', reducedMotion: 'reduce',
  });
  try {
    const page = await context.newPage();
    page.setDefaultTimeout(6000);
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(url);
    const home = page.locator('section[data-screen="home"][data-state]');
    await home.waitFor();
    assert.match(await home.getAttribute('data-state'), /^[ABCD]$/, 'la portada enseña su equipo');
    assert.equal(await page.locator('h1').count(), 1, 'un solo h1');
    const layout = await page.evaluate(() => {
      const bar = document.querySelector('.tabbar').getBoundingClientRect().toJSON();
      window.scrollTo({ top: document.documentElement.scrollHeight, behavior: 'instant' });
      const blocks = [...document.querySelectorAll('#contenido section[data-screen] > *')];
      return {
        width: innerWidth, height: innerHeight, pageWidth: document.documentElement.scrollWidth,
        paper: getComputedStyle(document.body).backgroundColor,
        tabs: document.querySelectorAll('.tabbar .tab').length,
        current: document.querySelector('.tabbar [aria-current="page"]')?.getAttribute('href'),
        position: getComputedStyle(document.querySelector('.tabbar')).position,
        bar, barTop: document.querySelector('.tabbar').getBoundingClientRect().top,
        lastBottom: Math.max(...blocks.map(node => node.getBoundingClientRect().bottom)),
      };
    });
    assert.ok(layout.pageWidth <= layout.width, `Page width ${layout.pageWidth}px exceeds viewport ${layout.width}px`);
    assert.equal(layout.paper, PAPER[colorScheme], `fondo del tema ${colorScheme}`);
    assert.equal(layout.tabs, 4, 'barra de 4 destinos');
    assert.equal(layout.current, '#/', 'Mi equipo es el destino actual');
    if (viewport.width < 1024) {
      assert.equal(layout.position, 'fixed');
      assert.ok(Math.abs(layout.bar.bottom - layout.height) < 1, 'la barra toca el borde inferior');
      assert.ok(layout.lastBottom <= layout.barTop + 1, 'al final de la página, la barra no tapa la portada');
    } else {
      assert.equal(layout.position, 'static', 'en escritorio, pestañas arriba');
    }
    assert.deepEqual(errors, [], 'No application JavaScript errors');
  } finally {
    await context.close();
  }
}

try {
  browser = await chromium.launch({ executablePath: chrome, headless: true, args: ['--no-sandbox'] });
  for (const viewport of [
    { width: 320, height: 568 }, { width: 390, height: 844 },
    { width: 768, height: 1024 }, { width: 1440, height: 1000 },
  ]) {
    for (const colorScheme of ['light', 'dark']) {
      await checkHome(viewport, colorScheme);
      console.log(`PASS: la portada carga a ${viewport.width}px en ${colorScheme === 'light' ? 'claro' : 'oscuro'}, sin desplazamiento horizontal`);
    }
  }
} finally {
  if (browser) await browser.close();
  server.closeAllConnections();
  await new Promise(resolve => server.close(resolve));
}
