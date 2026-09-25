// Plan B2, tarea 5: el marco de la app (spec §4.1, §4.8, §4.10, §7 y §8). shell.js, su CSS
// y la cabecera y el esqueleto de la portada que lleva index.html.
import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { SCREENS } from '../../src/links.js';
import { tabbar, screenHead } from '../../src/ui.js';
import {
  renderHeader, updateTabbar, offlineNotice, skeleton, errorBox, errorScreen, routeNotice, routeTitle,
} from '../../src/shell.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const read = (path) => readFileSync(join(ROOT, path), 'utf8');
const s = (h) => String(h);
// Texto visible: sin etiquetas y con las entidades básicas resueltas.
const text = (h) => s(h).replace(/<[^>]*>/g, '')
  .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');

// La barra ya pintada, como la ve updateTabbar: los <a class="tab"> de ui.tabbar con sus atributos.
function fakeDoc() {
  const tabs = [...s(tabbar(null)).matchAll(/<a class="tab" href="([^"]*)"/g)].map(([, href]) => {
    const attrs = { href };
    return {
      attrs,
      getAttribute: (name) => attrs[name] ?? null,
      setAttribute: (name, value) => { attrs[name] = String(value); },
      removeAttribute: (name) => { delete attrs[name]; },
    };
  });
  return { tabs, querySelectorAll: (selector) => (selector === '.tabbar a.tab' ? tabs : []) };
}
const marks = (doc) => doc.tabs.map((t) => [t.attrs.href, t.attrs['aria-current'] ?? null]);

test('renderHeader: la marca lleva a Mi equipo; dentro, la barra de ui.js y el hueco del aviso', () => {
  assert.equal(s(renderHeader()), '<div class="shell-bar"><a class="brand" href="#/">Fútbol base <span class="brand-place">Las Palmas</span></a>'
    + `${tabbar('miequipo')}</div><div class="shell-offline" role="status"></div>`);
  assert.ok(s(renderHeader({ active: 'tabla', current: 'true' })).includes(s(tabbar('tabla', { current: 'true' }))));
  assert.equal((s(renderHeader()).match(/<nav /g) || []).length, 1);
});

test('updateTabbar: "page" en el destino de la pantalla, "true" en las secundarias y nada en los demás', () => {
  const doc = fakeDoc();
  updateTabbar('jornada', 'page', doc);
  assert.deepEqual(marks(doc), [['#/', null], ['#/jornada', 'page'], ['#/tabla', null], ['#/explorar', null]]);
  updateTabbar('explorar', 'true', doc);
  assert.deepEqual(marks(doc), [['#/', null], ['#/jornada', null], ['#/tabla', null], ['#/explorar', 'true']]);
  updateTabbar(null, 'page', doc);
  assert.deepEqual(marks(doc).map(([, value]) => value), [null, null, null, null]);
  assert.throws(() => updateTabbar('partido', 'page', doc), RangeError);
  assert.throws(() => updateTabbar('tabla', 'location', doc), RangeError);
});

test('offlineNotice: «Sin conexión. Datos del …» con lastDataChange o, si falta, «Última actualización»', () => {
  assert.equal(s(offlineNotice({ lastDataChange: '2026-09-23' }, '20/09/2026')),
    '<p class="notice"><b>Sin conexión.</b> Datos del 23/09/2026</p>');
  assert.equal(text(offlineNotice(null, '20/09/2026')), 'Sin conexión. Datos del 20/09/2026');
  assert.equal(text(offlineNotice({ lastDataChange: null }, '20/09/2026')), 'Sin conexión. Datos del 20/09/2026');
  assert.equal(text(offlineNotice(null, 'ayer')).trim(), 'Sin conexión.');
  assert.equal(text(offlineNotice(undefined, undefined)).trim(), 'Sin conexión.');
});

test('skeleton: cabecera y primeras cajas de cada pantalla, ocupado, sin h1 ni data-screen', () => {
  for (const id of ['home', 'jornada', 'tabla', 'partido', 'ajustes']) {
    const out = s(skeleton(id));
    assert.match(out, new RegExp(`^<div class="skeleton-screen" data-skeleton="${id}" aria-busy="true"><p class="vh" role="status">Cargando…</p>`), id);
    assert.match(out, /<div class="screen-head sk-head" aria-hidden="true">/, id);
    assert.match(out, /<div class="box skeleton [\w-]+"><\/div>/, id);
    assert.doesNotMatch(out, /<h1|data-screen=/, id);
  }
  assert.match(s(skeleton('home')), /<span class="sk sk-crest"><\/span>.*<div class="box skeleton sk-box-home"><\/div>/);
  assert.doesNotMatch(s(skeleton('jornada')), /sk-crest/);
  // Las pantallas de B3 comparten el esqueleto genérico (la provisional de B2 ya no existe).
  assert.equal(s(skeleton('explorar')), s(skeleton('ajustes')).replace('data-skeleton="ajustes"', 'data-skeleton="explorar"'));
});

test('errorBox: «No se pudieron cargar los datos de <qué>» y Reintentar con data-action="retry"', () => {
  assert.equal(s(errorBox('la temporada 2024/25')), '<div class="box error-box" role="alert"><p class="error-text">'
    + 'No se pudieron cargar los datos de la temporada 2024/25.</p><div class="buttons">'
    + '<button class="button is-main" type="button" data-action="retry">Reintentar</button></div></div>');
  assert.match(s(errorBox('<b>"x"</b>')), /de &lt;b&gt;&quot;x&quot;&lt;\/b&gt;\./);
});

test('errorScreen: la pantalla con su h1, «‹» si tiene padre y la caja de error', () => {
  const out = s(errorScreen({ screenId: 'partido', title: 'Partido', what: 'los goles', back: '#/jornada?g=PG2' }));
  assert.match(out, /^<section data-screen="partido" data-state="error"><header class="screen-head"><a class="back" href="#\/jornada\?g=PG2" data-action="back"/);
  assert.equal((out.match(/<h1>/g) || []).length, 1);
  assert.match(out, /<h1>Partido<\/h1>/);
  assert.ok(out.includes(s(errorBox('los goles'))));
  assert.doesNotMatch(s(errorScreen({ screenId: 'home', title: 'Mi equipo', what: 'x' })), /class="back"/);
});

test('routeTitle: un título por ruta de §4.1; routeNotice: aviso anunciado con role="status"', () => {
  assert.deepEqual(SCREENS.map(routeTitle), ['Mi equipo', 'Jornada', 'Tabla', 'Explorar', 'Partido', 'Equipo', 'Ligas',
    'Copa', 'Goleadores', 'Temporadas anteriores', 'Récords', 'Datos y fuentes', 'Ajustes']);
  assert.equal(routeTitle('desconocida'), 'Mi equipo');
  assert.equal(s(routeNotice('Elige tu equipo en Mi equipo')), '<p class="notice route-notice" role="status">Elige tu equipo en Mi equipo</p>');
});

// ── CSS (spec §3.4, §4.8 y §8) ──────────────────────────────────────────

const CSS = read('acta.css');
// Reglas del CSS como {media, selector, body}; un nivel de @media.
function parseCss(src) {
  const rules = [];
  const walk = (str, media) => {
    let i = 0;
    while (i < str.length) {
      const open = str.indexOf('{', i);
      if (open < 0) break;
      const prelude = str.slice(i, open).trim();
      let depth = 1, j = open + 1;
      for (; j < str.length && depth; j++) {
        if (str[j] === '{') depth++;
        else if (str[j] === '}') depth--;
      }
      const body = str.slice(open + 1, j - 1);
      if (prelude.startsWith('@media')) walk(body, prelude);
      else rules.push({ media, selector: prelude, body });
      i = j;
    }
  };
  walk(src.replace(/\/\*[\s\S]*?\*\//g, ''), null);
  return rules;
}
const RULES = parseCss(CSS);
const DESKTOP = (m) => m !== null && /min-width:\s*1024px/.test(m);
function decl(selector, media = (m) => m === null) {
  const found = RULES.filter((r) => media(r.media) && r.selector.split(',').map((x) => x.trim()).includes(selector));
  assert.ok(found.length, `no hay regla para «${selector}»`);
  return found.map((r) => r.body).join(';');
}

test('CSS: en escritorio, marca y pestañas a 1120 px con regla de tinta; en móvil y tableta, sin marca', () => {
  assert.doesNotMatch(CSS, /\.shell-brand/, 'el bloque provisional del corte se ha ido');
  assert.match(decl('.brand'), /display:\s*none/);
  const brand = decl('.brand', DESKTOP);
  assert.match(brand, /display:\s*flex/);
  assert.match(brand, /min-height:\s*44px/);
  const bar = decl('.shell-bar', DESKTOP);
  assert.match(bar, /display:\s*flex/);
  assert.match(bar, /max-width:\s*1120px/);
  assert.match(decl('.shell-header', DESKTOP), /border-bottom:\s*1\.5px solid var\(--ink\)/);
  assert.match(decl('.page'), /max-width:\s*640px/, 'tableta: el diseño móvil centrado a 640 px');
  // La barra es fija en móvil: ningún antepasado puede crearle un bloque contenedor.
  const shell = RULES.filter((r) => /\.shell-(header|bar)\b/.test(r.selector)).map((r) => r.body).join(';');
  assert.doesNotMatch(shell, /transform|filter|contain|will-change|perspective/);
});

test('CSS: esqueletos grises y quietos; el hueco del aviso sin conexión nunca se oculta', () => {
  assert.match(decl('.sk'), /background:\s*var\(--line\)/);
  assert.match(decl('.box.skeleton'), /border-color:\s*var\(--line\)/);
  const sk = RULES.filter((r) => /\.sk\b|\.sk-|skeleton/.test(r.selector)).map((r) => r.body).join(';');
  assert.doesNotMatch(sk, /animation|transition/);
  assert.match(decl('.shell-offline:not(:empty)'), /border-bottom/);
  // Una región viva con display: none deja de anunciarse.
  assert.doesNotMatch(CSS, /\.shell-offline[^{]*\{[^}]*display:\s*none/);
});

test('cada clase que emite shell.js existe en acta.css (salvo los ganchos del router y las pruebas)', () => {
  const defined = new Set([...CSS.replace(/\/\*[\s\S]*?\*\//g, '').matchAll(/\.([a-zA-Z][\w-]*)/g)].map((m) => m[1]));
  const HOOKS = new Set(['skeleton-screen', 'sk-head', 'error-box', 'route-notice']);
  const out = [renderHeader(), offlineNotice(null, '23/09/2026'),
    screenHead('t', { sub: 's', action: { href: '#', label: 'a' }, back: '#' }),
    ...['home', 'jornada', 'tabla', 'partido', 'ajustes'].map(skeleton),
    errorScreen({ screenId: 'home', title: 't', what: 'w' }), routeNotice('x')].map(String).join('');
  const used = new Set([...out.matchAll(/class="([^"]+)"/g)].flatMap((m) => m[1].split(/\s+/)));
  assert.deepEqual([...used].filter((c) => !defined.has(c) && !HOOKS.has(c)), []);
});

test('index.html: la cabecera de renderHeader, con la barra dentro, y el esqueleto de la portada en main', () => {
  const page = read('index.html');
  assert.ok(page.includes(`<header class="shell-header">${renderHeader()}</header>`), 'la cabecera no es la de renderHeader()');
  assert.equal((page.match(/<nav class="tabbar"/g) || []).length, 1, 'una sola barra, la de la cabecera');
  const main = page.match(/<main id="contenido" class="page"[^>]*>([\s\S]*?)<\/main>/);
  assert.ok(main, 'falta <main id="contenido" class="page">');
  assert.equal(main[1].trim(), s(skeleton('home')));
  assert.match(page, /<a class="skip-link" href="#contenido">/);
  assert.ok(page.indexOf('<header class="shell-header">') < page.indexOf('<main id="contenido"'));
});
