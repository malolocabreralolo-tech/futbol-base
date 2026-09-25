import { strict as assert } from 'node:assert';
import { createRequire } from 'node:module';
import { startServer, findChrome } from './render-smoke.mjs';
import { waitForAsync } from './browser-wait.mjs';
import { useWorld, STORE_KEY } from './fixture-site.mjs';

// npm install --no-save --package-lock=false playwright@1.58.0
// node scripts/tests/interaction-smoke.mjs
// Uses the installed Chrome (or CHROME=/absolute/path), like render-smoke.
//
// Escenarios de spec §11 a 320, 390, 768 y 1440 px, en claro y en oscuro (prefers-color-scheme
// emulado), sobre el mundo de fixtures A de fixture-site.mjs: 01/03/2026, Las Mesas Hu. en PG2 a
// mitad de temporada (la jornada por defecto es la 17, la del primer partido pendiente), con los
// datos congelados y el reloj fijado.
// De B2:
// - la barra con 4 destinos y su aria-current, sin tapar el contenido;
// - jornada anterior y siguiente, sin entradas nuevas en el historial y con el foco en el control
//   pulsado; al cambiar de pantalla, en el h1 (B11 de la revisión);
// - las vistas de Tabla: cinco en móvil y tableta, y Todas, Casa y Fuera en escritorio, con el foco
//   en el segmento pulsado;
// - abrir un partido y volver con Atrás; entrar por enlace directo (el 8–1) y volver con «‹»;
// - traducir un enlace antiguo de WhatsApp, con su temporada y sin entrada nueva;
// - «Otro grupo» → Ligas → Tabla (B3, Tarea 7): la liga, sus grupos y la Tabla del grupo elegido, con
//   Tabla marcada en la barra.
// De B3 (Tarea 12):
// - buscar un equipo desde «Cambiar», sin una entrada por letra, abrir su ficha y comprobar que mi
//   equipo no cambia: la portada sigue siendo la de Las Mesas Hu.;
// - las pantallas nuevas (la ficha con su plantilla y su trayectoria, «Comparar grupos», Copa,
//   Goleadores, Récords, Temporadas, Fuentes y Ajustes), sin desplazamiento horizontal; el cuadro de
//   copa se desliza dentro de su caja y la página no;
// - «Hacer mi equipo» desde la ficha: se guarda en futbol-base:v2 y, al recargar, la portada es la
//   del equipo nuevo.
// Y una vez, en el mundo E (§11, caso 3): la respuesta a la pregunta se guarda y, al recargar, la
// portada es la de ese equipo, sin preguntar.
// Sin esperas fijas: cada paso espera a su condición (waitForAsync, que al agotarse dice el escenario,
// el ancho y el tema) o a su localizador.
const { chromium } = createRequire(import.meta.url)('playwright');
const chrome = findChrome();
assert.ok(chrome, 'Chrome is required for the interaction smoke test');
const server = await startServer();
const base = `http://127.0.0.1:${server.address().port}/index.html`;
const PAPER = { light: 'rgb(255, 255, 255)', dark: 'rgb(21, 23, 28)' };   // --paper de cada tema (spec §3.1)
// PG2, jornada 15 (12/02/2026): AD Huracán 8–1 Las Mesas Hu.
const DIRECT = '#/partido?s=2025-2026&g=PG2&r=Jornada%2015&h=AD%20Hurac%C3%A1n&a=Las%20Mesas%20Hu.';
const LEGACY = '#section=jornadas&cat=prebenjamin&season=2025-2026&group=PG2&round=Jornada+15';
// El id de cada vista de la Tabla, en el selector de móvil y en el de escritorio (B11).
const VIEW_ID = { Puntos: 'puntos', Goles: 'goles', Forma: 'forma', Casa: 'casa', Fuera: 'fuera', Todas: 'todas' };
// Columnas visibles de la Tabla en cada vista (spec §4.4).
const HEADS = {
  Puntos: '#,Equipo,J,G,E,P,DG,Pts', Goles: '#,Equipo,GF,GC,DG,Pts', Forma: '#,Equipo,J,Últimos 5,Pts',
  Casa: '#,Equipo,J,G,E,P,Pts', Fuera: '#,Equipo,J,G,E,P,Pts', Todas: '#,Equipo,J,G,E,P,GF,GC,DG,Últimos 5,Pts',
};
// La ficha de AD Huracán en PG2, a la que lleva el buscador; mi equipo de siempre y el que se hace mío.
const HURACAN = '#/equipo?s=2025-2026&g=PG2&t=AD%20Hurac%C3%A1n';
const LAS_MESAS = { name: 'Las Mesas Hu.', season: '2025-2026', cat: 'prebenjamin', groupId: 'PG2' };
const AD_HURACAN = { name: 'AD Huracán', season: '2025-2026', cat: 'prebenjamin', groupId: 'PG2' };
// Las pantallas de B3 que se miden sin desplazamiento horizontal (Explorar, la ficha de AD Huracán y
// Ligas, en sus propios pasos): [ruta, pantalla, lo que se despliega antes: [botón, lo que aparece]].
const B3_SCREENS = [
  ['#/equipo?s=2025-2026&g=A1&t=Guayarmina', 'equipo', [
    ['#contenido button.squad-player', '#contenido tr.squad-detail a.squad-match'],
    ['#contenido button[data-action="trayectoria"]', '#trayectoria a.traj-row'],
  ]],
  ['#/ligas?s=2025-2026&c=prebenjamin&f=grancanaria', 'ligas', [['#comparar-prebenjamin', '#comparar-prebenjamin-tabla tbody tr']]],
  ['#/copa?s=2025-2026&g=MCBK2', 'copa', []],
  ['#/goleadores', 'goleadores', []],
  ['#/records', 'records', []],
  ['#/temporadas', 'temporadas', []],
  ['#/fuentes', 'fuentes', []],
  ['#/ajustes', 'ajustes', [['#contenido button[data-action="borrar-datos"]', '#ajustes-borrar button[data-action="cancelar-borrado"]']]],
];
let browser;

// Lo que miran los escenarios, de una vez.
const snapshot = (page) => page.evaluate(() => {
  const section = document.querySelector('#contenido section[data-screen]');
  const visible = (el) => el.getClientRects().length > 0;
  return {
    hash: location.hash, length: history.length,
    screen: section?.getAttribute('data-screen') ?? null,
    state: section?.getAttribute('data-state') ?? null,
    route: section?.getAttribute('data-route') ?? null,
    h1: document.querySelector('#contenido h1')?.textContent ?? null,
    round: document.querySelector('#contenido .round-title')?.textContent ?? null,
    tabs: [...document.querySelectorAll('.tabbar a.tab[aria-current]')].map((a) => `${a.getAttribute('href')} ${a.getAttribute('aria-current')}`),
    focus: document.activeElement?.id || document.activeElement?.tagName || null,
    heads: [...document.querySelectorAll('#contenido table.standings:not(.group-scorers) thead th')].filter(visible).map((th) => th.textContent).join(','),
  };
});

// Espera a que esté pintada la pantalla `screen` (con ese hash y esa jornada, si se dan). `label`: el
// escenario, el ancho y el tema, para el mensaje si se agota la espera (Para B3, punto 21).
async function paintedAs(page, screen, { hash = null, round = null, label }) {
  await waitForAsync(page, ([s, h, r]) => {
    const section = document.querySelector('#contenido section[data-screen]');
    if (!section || section.getAttribute('data-screen') !== s) return false;
    if (h && location.hash !== h) return false;
    return !r || document.querySelector('#contenido .round-title')?.textContent === r;
  }, [screen, hash, round], { label: `${label}: se espera ${screen}${hash ? ` en ${hash}` : ''}` });
  return snapshot(page);
}

// Sin desplazamiento horizontal, la barra con 4 destinos y, por debajo de 1024 px, fija abajo y sin
// tapar el final de la pantalla; desde 1024 px, pestañas arriba.
async function checkLayout(page, width, label) {
  const m = await page.evaluate(() => {
    const bar = document.querySelector('.tabbar');
    window.scrollTo(0, document.documentElement.scrollHeight);
    const parts = [...document.querySelectorAll('#contenido section[data-screen] > *')];
    const result = {
      overflow: document.documentElement.scrollWidth - innerWidth, height: innerHeight,
      position: getComputedStyle(bar).position, tabs: bar.querySelectorAll('a.tab').length,
      bar: bar.getBoundingClientRect().toJSON(), paper: getComputedStyle(document.body).backgroundColor,
      lastBottom: Math.max(...parts.map((node) => node.getBoundingClientRect().bottom)),
    };
    window.scrollTo(0, 0);
    return result;
  });
  assert.ok(m.overflow <= 0, `${label}: desplazamiento horizontal de ${m.overflow}px`);
  assert.equal(m.tabs, 4, `${label}: barra de 4 destinos`);
  if (width < 1024) {
    assert.equal(m.position, 'fixed', `${label}: la barra, fija abajo`);
    assert.ok(Math.abs(m.bar.bottom - m.height) < 1, `${label}: la barra toca el borde inferior`);
    assert.ok(m.lastBottom <= m.bar.top + 1, `${label}: al final de la pantalla, la barra no tapa el contenido`);
  } else {
    assert.equal(m.position, 'static', `${label}: en escritorio, pestañas arriba`);
  }
  return m;
}

const newContext = (viewport, colorScheme) => browser.newContext({
  viewport, colorScheme, serviceWorkers: 'block', locale: 'es-ES', timezoneId: 'Atlantic/Canary', reducedMotion: 'reduce',
});
const nameOf = (viewport, colorScheme) => `${viewport.width}px en ${colorScheme === 'light' ? 'claro' : 'oscuro'}`;

async function scenarios(viewport, colorScheme) {
  const label = nameOf(viewport, colorScheme);
  const context = await newContext(viewport, colorScheme);
  const errors = [];
  const open = async (hash) => {
    const page = await context.newPage();
    page.setDefaultTimeout(8000);
    page.on('pageerror', (error) => errors.push(`${hash}: ${error.message}`));
    await page.goto(base + hash);
    return page;
  };
  try {
    await useWorld(context, 'A');

    // 1. La portada: Mi equipo marcado en la barra, el tema del sistema y nada tapado.
    const page = await open('#/');
    let s = await paintedAs(page, 'home', { label: `${label}, portada` });
    assert.equal(s.state, 'A', `${label}: la portada del 01/03/2026 está en A`);
    assert.deepEqual(s.tabs, ['#/ page'], label);
    assert.equal((await checkLayout(page, viewport.width, `${label}, portada`)).paper, PAPER[colorScheme], `${label}: fondo del tema`);

    // 2. Jornada por la barra; anterior y siguiente cambian la jornada sin entrada nueva.
    await page.click('.tabbar a.tab[href="#/jornada"]');
    s = await paintedAs(page, 'jornada', { hash: '#/jornada', round: 'Jornada 17 de 30', label: `${label}, jornada` });
    assert.deepEqual(s.tabs, ['#/jornada page'], label);
    const entries = s.length;
    assert.equal(s.focus, 'H1', `${label}: al cambiar de pantalla, el foco va al h1`);
    await page.click('#contenido #round-prev');
    s = await paintedAs(page, 'jornada', { hash: '#/jornada?s=2025-2026&g=PG2&r=Jornada%2016', round: 'Jornada 16 de 30', label: `${label}, jornada anterior` });
    assert.equal(s.focus, 'round-prev', `${label}: al cambiar de jornada, el foco se queda en «‹»`);
    await page.click('#contenido #round-next');
    s = await paintedAs(page, 'jornada', { hash: '#/jornada?s=2025-2026&g=PG2&r=Jornada%2017', round: 'Jornada 17 de 30', label: `${label}, jornada siguiente` });
    assert.equal(s.focus, 'round-next', `${label}: al cambiar de jornada, el foco se queda en «›»`);
    assert.equal(s.length, entries, `${label}: cambiar de jornada usa replaceState`);
    await checkLayout(page, viewport.width, `${label}, jornada`);

    // 3. Abrir el partido propio de la jornada (va el primero) y volver con Atrás.
    await page.click('#contenido a.match-row.is-mine');
    s = await paintedAs(page, 'partido', { label: `${label}, partido` });
    assert.equal(s.h1, 'Partido: Las Mesas Hu. – Unión Viera', label);
    assert.equal(s.focus, 'H1', `${label}: en el partido, el foco va al h1`);
    assert.deepEqual(s.tabs, ['#/jornada true'], `${label}: Partido lleva el destino de origen`);
    await checkLayout(page, viewport.width, `${label}, partido`);
    await page.goBack();
    s = await paintedAs(page, 'jornada', { hash: '#/jornada?s=2025-2026&g=PG2&r=Jornada%2017', round: 'Jornada 17 de 30', label: `${label}, Atrás desde el partido` });

    // 4. Tabla: cada vista, sin entrada nueva, con sus columnas.
    await page.click('.tabbar a.tab[href="#/tabla"]');
    s = await paintedAs(page, 'tabla', { hash: '#/tabla', label: `${label}, tabla` });
    const tabEntries = s.length;
    const selector = viewport.width < 1024 ? '.tabla-views.is-narrow' : '.tabla-views.is-wide';
    const prefix = viewport.width < 1024 ? 'vista' : 'vista-ancha';
    const views = viewport.width < 1024 ? ['Goles', 'Forma', 'Casa', 'Fuera', 'Puntos'] : ['Casa', 'Fuera', 'Todas'];
    for (const view of views) {
      await page.locator(`#contenido ${selector} a.segment`, { hasText: view }).click();
      await waitForAsync(page, ([sel, v]) => document.querySelector(`#contenido ${sel} a.segment[aria-current]`)?.textContent === v, [selector, view], { label: `${label}, vista ${view} de la Tabla` });
      s = await snapshot(page);
      assert.equal(s.heads, HEADS[view], `${label}: columnas de la vista ${view}`);
      assert.equal(s.focus, `${prefix}-${VIEW_ID[view]}`, `${label}: el foco se queda en el segmento ${view}`);
    }
    assert.equal(s.length, tabEntries, `${label}: cambiar de vista usa replaceState`);
    await checkLayout(page, viewport.width, `${label}, tabla`);

    // 5. «Otro grupo» → Ligas → Tabla (§11): las ligas de prebenjamín de Gran Canaria, con Tabla como
    // destino (la barra no cambia); la liga abre sus grupos, y el grupo, su Tabla.
    await page.click('#contenido a.screen-action');
    s = await paintedAs(page, 'ligas', { hash: '#/ligas?s=2025-2026&c=prebenjamin&i=grancanaria&to=tabla', label: `${label}, «Otro grupo»` });
    assert.equal(s.h1, 'Ligas', label);
    assert.deepEqual(s.tabs, ['#/tabla true'], label);
    await checkLayout(page, viewport.width, `${label}, ligas`);
    await page.click('#contenido a.link-row');
    s = await paintedAs(page, 'ligas', { hash: '#/ligas?s=2025-2026&c=prebenjamin&f=grancanaria&to=tabla', label: `${label}, grupos de la liga` });
    assert.equal(s.h1, 'Gran Canaria', label);
    assert.deepEqual(s.tabs, ['#/tabla true'], label);
    await checkLayout(page, viewport.width, `${label}, grupos de la liga`);
    await page.click('#contenido a.group-row[href="#/tabla?s=2025-2026&g=PG3"]');
    s = await paintedAs(page, 'tabla', { hash: '#/tabla?s=2025-2026&g=PG3', label: `${label}, Tabla del grupo elegido` });
    assert.deepEqual(s.tabs, ['#/tabla page'], label);
    await page.close();

    // 6. Enlace directo a un partido de mi equipo (el 8–1): Mi equipo marcado, sin desplazamiento
    // horizontal (Para B3, punto 20), y «‹» a su jornada.
    const direct = await open(DIRECT);
    s = await paintedAs(direct, 'partido', { label: `${label}, partido enlazado` });
    const fresh = s.length;
    assert.equal(s.h1, 'Partido: AD Huracán – Las Mesas Hu.', label);
    assert.deepEqual(s.tabs, ['#/ true'], `${label}: enlace directo a un partido de mi equipo`);
    await checkLayout(direct, viewport.width, `${label}, partido enlazado`);
    await direct.click('#contenido a.back');
    s = await paintedAs(direct, 'jornada', { hash: '#/jornada?s=2025-2026&g=PG2&r=Jornada%2015', round: 'Jornada 15 de 30', label: `${label}, «‹» del partido enlazado` });
    assert.deepEqual(s.tabs, ['#/jornada page'], label);
    await direct.close();

    // 7. Enlace antiguo de WhatsApp: se traduce con replaceState, sin entrada nueva.
    const legacy = await open(LEGACY);
    s = await paintedAs(legacy, 'jornada', { hash: '#/jornada?s=2025-2026&g=PG2&r=Jornada%2015', round: 'Jornada 15 de 30', label: `${label}, enlace antiguo` });
    assert.equal(s.length, fresh, `${label}: el enlace antiguo no crea entrada`);
    await checkLayout(legacy, viewport.width, `${label}, enlace antiguo`);
    await legacy.close();

    assert.deepEqual(errors, [], `${label}: sin errores de JavaScript`);
  } finally {
    await context.close();
  }
}

// El cuadro de copa (spec §4.7 y §8): en móvil y tableta se desliza dentro de su caja, y la pestaña de la
// final lo lleva hasta ella sin mover la página; en escritorio, todas las rondas a la vista.
async function checkBracket(page, width, label) {
  const state = () => page.evaluate(() => {
    const strip = document.querySelector('#contenido .bracket');
    return { scrolls: strip.scrollWidth > strip.clientWidth + 1, left: strip.scrollLeft, overflow: document.documentElement.scrollWidth - innerWidth, x: window.scrollX };
  });
  const before = await state();
  if (width >= 1024) {
    assert.ok(!before.scrolls, `${label}: en escritorio, todas las rondas a la vista`);
    return;
  }
  assert.ok(before.scrolls, `${label}: el cuadro se desliza dentro de su caja`);
  await page.click('#contenido #ronda-6-tab');
  await waitForAsync(page, () => document.querySelector('#ronda-6-tab')?.hasAttribute('aria-current')
    && document.querySelector('#contenido .bracket').scrollLeft > 0, null, { label: `${label}: la pestaña «Final» del cuadro` });
  const after = await state();
  assert.ok(after.overflow <= 0 && after.x === 0, `${label}: la página no se desplaza con el cuadro (${JSON.stringify(after)})`);
}

// Escenarios de B3 de §11, en el mundo A: buscar un equipo, abrir su ficha y comprobar que mi equipo no
// cambia; las pantallas nuevas sin desplazamiento horizontal; y «Hacer mi equipo», guardado y
// respetado al recargar.
async function scenariosB3(viewport, colorScheme) {
  const label = nameOf(viewport, colorScheme);
  const context = await newContext(viewport, colorScheme);
  const errors = [];
  try {
    await useWorld(context, 'A');
    const page = await context.newPage();
    page.setDefaultTimeout(8000);
    page.on('pageerror', (error) => errors.push(error.message));
    const stored = () => page.evaluate((key) => JSON.parse(localStorage.getItem(key)), STORE_KEY);
    const go = async (hash, screen, step) => {
      await page.evaluate((h) => { location.hash = h; }, hash);
      return paintedAs(page, screen, { hash, label: `${label}, ${step}` });
    };
    await page.goto(`${base}#/`);
    let s = await paintedAs(page, 'home', { label: `${label}, portada` });

    // 1. «Cambiar» → Explorar con el foco en el buscador; escribir «hurac» letra a letra filtra la
    //    lista y apunta la búsqueda en la dirección sin entradas nuevas (decisión 4 de B3).
    await page.click('#contenido a.screen-action');
    s = await paintedAs(page, 'explorar', { hash: '#/explorar#buscar', label: `${label}, «Cambiar»` });
    assert.equal(s.focus, 'buscar', `${label}: «Cambiar» deja el foco en el buscador`);
    const entries = s.length;
    await page.keyboard.type('hurac');
    await waitForAsync(page, () => location.hash === '#/explorar?s=2025-2026&q=hurac#buscar'
      && document.querySelectorAll('#resultados a.search-result').length > 0, null, { label: `${label}, buscar «hurac»` });
    s = await snapshot(page);
    assert.equal(s.length, entries, `${label}: escribir no crea una entrada por letra`);
    assert.equal(s.focus, 'buscar', `${label}: el foco sigue en el buscador`);
    await checkLayout(page, viewport.width, `${label}, Explorar con resultados`);

    // 2. Su ficha: Explorar marcado, «Hacer mi equipo» y la ficha en «Vistos hace poco»; mi equipo
    //    sigue siendo Las Mesas Hu., también en la portada.
    await page.click(`#resultados a.search-result[href="${HURACAN}"]`);
    s = await paintedAs(page, 'equipo', { hash: HURACAN, label: `${label}, ficha de AD Huracán` });
    assert.equal(s.h1, 'AD Huracán', label);
    assert.deepEqual(s.tabs, ['#/explorar true'], `${label}: la ficha de otro equipo cuelga de Explorar`);
    assert.equal(await page.locator('#contenido button[data-action="hacer-mi-equipo"]').count(), 1, `${label}: «Hacer mi equipo»`);
    await checkLayout(page, viewport.width, `${label}, ficha`);
    const seen = await stored();
    assert.deepEqual(seen.myTeam, LAS_MESAS, `${label}: visitar una ficha no cambia mi equipo`);
    assert.deepEqual(seen.recent[0], { s: '2025-2026', g: 'PG2', t: 'AD Huracán' }, `${label}: la ficha va a «Vistos hace poco»`);
    await page.click('.tabbar a.tab[href="#/"]');
    s = await paintedAs(page, 'home', { hash: '#/', label: `${label}, portada tras la ficha` });
    assert.equal(s.h1, 'Las Mesas Hu.', `${label}: la portada sigue siendo la de mi equipo`);

    // 3. Las pantallas nuevas, con lo que despliegan: ninguna desplaza la página en horizontal ni queda
    //    tapada por la barra; el cuadro de copa se desliza por dentro.
    for (const [hash, screen, steps] of B3_SCREENS) {
      await go(hash, screen, screen);
      for (const [button, shown] of steps) {
        await page.locator(button).first().click();
        await page.locator(shown).first().waitFor();
      }
      await checkLayout(page, viewport.width, `${label}, ${screen}`);
      if (screen === 'copa') await checkBracket(page, viewport.width, `${label}, cuadro de copa`);
    }

    // 4. «Hacer mi equipo» desde la ficha: se guarda, la barra pasa a Mi equipo y, al recargar, la
    //    portada es la del equipo nuevo.
    await go(HURACAN, 'equipo', 'ficha otra vez');
    await page.click('#contenido button[data-action="hacer-mi-equipo"]');
    await waitForAsync(page, () => !document.querySelector('#contenido button[data-action="hacer-mi-equipo"]')
      && document.querySelector('.tabbar a.tab[aria-current]')?.getAttribute('href') === '#/', null, { label: `${label}, «Hacer mi equipo»` });
    assert.deepEqual((await stored()).myTeam, AD_HURACAN, `${label}: «Hacer mi equipo» lo guarda en ${STORE_KEY}`);
    await page.reload();
    s = await paintedAs(page, 'equipo', { hash: HURACAN, label: `${label}, ficha tras recargar` });
    assert.deepEqual(s.tabs, ['#/ true'], `${label}: tras recargar, la ficha es mi equipo`);
    assert.equal(await page.locator('#contenido button[data-action="hacer-mi-equipo"]').count(), 0, label);
    await page.click('.tabbar a.tab[href="#/"]');
    s = await paintedAs(page, 'home', { hash: '#/', label: `${label}, portada del equipo nuevo` });
    assert.equal(s.h1, 'AD Huracán', `${label}: la portada es la del equipo nuevo`);

    assert.deepEqual(errors, [], `${label}: sin errores de JavaScript`);
  } finally {
    await context.close();
  }
}

// Mundo E (§11, caso 3): «Las Mesas Hu. B» guardado en FF13 pregunta; la respuesta se guarda en el
// almacén y, al recargar, la portada es la de ese equipo, sin preguntar (M6 de la revisión).
async function answerE() {
  const context = await newContext({ width: 390, height: 844 }, 'light');
  try {
    await useWorld(context, 'E');
    const page = await context.newPage();
    page.setDefaultTimeout(8000);
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.goto(`${base}#/`);
    let s = await paintedAs(page, 'home', { label: 'mundo E, la pregunta' });
    assert.equal(s.state, 'E', 'mundo E: la pregunta');
    const choice = page.locator('#contenido [data-action="elegir"][data-index="0"]');
    const name = await choice.locator('.choice-name').textContent();
    await choice.click();
    await waitForAsync(page, () => document.querySelector('#contenido section[data-screen="home"]')?.getAttribute('data-state') !== 'E', null, { label: 'mundo E, la respuesta' });
    const saved = await page.evaluate((key) => JSON.parse(localStorage.getItem(key)).myTeam, STORE_KEY);
    assert.deepEqual(saved, { name, season: '2025-2026', cat: 'benjamin', groupId: 'A2' }, 'la respuesta se guarda');
    await page.reload();
    s = await paintedAs(page, 'home', { label: 'mundo E, tras recargar' });
    assert.notEqual(s.state, 'E', 'tras recargar no vuelve a preguntar');
    assert.equal(s.h1, name, 'la portada es la del equipo elegido');
    assert.deepEqual(errors, [], 'mundo E: sin errores de JavaScript');
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
      const label = nameOf(viewport, colorScheme);
      await scenarios(viewport, colorScheme);
      console.log(`PASS: ${label}: barra, jornadas, vistas de Tabla, partido con Atrás y con «‹», el 8–1 enlazado, enlace antiguo y «Otro grupo» → Ligas → Tabla, el foco en su sitio y sin desplazamiento horizontal`);
      await scenariosB3(viewport, colorScheme);
      console.log(`PASS: ${label}: buscar «hurac» sin una entrada por letra y abrir su ficha sin cambiar mi equipo, las pantallas de B3 sin desplazamiento horizontal (el cuadro de copa, dentro de su caja) y «Hacer mi equipo», guardado y respetado al recargar`);
    }
  }
  await answerE();
  console.log('PASS: mundo E (§11, caso 3): la respuesta se guarda y, al recargar, la portada de ese equipo sin preguntar');
} finally {
  if (browser) await browser.close();
  server.closeAllConnections();
  await new Promise((resolve) => server.close(resolve));
}
