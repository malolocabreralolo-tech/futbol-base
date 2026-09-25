// Plan B3, Tarea 11: la pantalla Ajustes (spec §4.7 y §4.9; decisión 29 de B3). render(ctx) es pura
// y se prueba con ctxFor; mount, con los dobles de la sección que pinta el router (como la pregunta
// de E en la portada): el botón despliega el aviso, «Cancelar» lo recoge y solo «Borrar» llama a
// nav.clearData. El borrado de verdad, con start(), está en test_rediseno_integracion.mjs.
import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';
import { ctxFor, datasetsFor, cssRules } from './fixtures/rediseno/screens.mjs';
import { nextSeasonRaw } from './fixtures/rediseno/simulate.mjs';
import { SCREEN_MAP } from '../../src/screens.js';
import { screen, confirmPanel } from '../../src/screen-ajustes.js';

const render = (opts = {}) => String(screen.render(ctxFor('ajustes', {}, opts)));
const LAS_MESAS = { name: 'Las Mesas Hu.', season: '2025-2026', cat: 'prebenjamin', groupId: 'PG2' };
// 2026/27 activada: con A1 y PG3, Las Mesas no aparece (X); con B2 y PG2, hay dos equipos del club (E).
const in2627 = (groups) => ({ portalSeason: '2026-2027', today: '2026-10-01', myTeam: LAS_MESAS, datasets: datasetsFor({ current: nextSeasonRaw(groups) }) });

// La sección pintada, como la ve mount: el botón (con sus atributos), el panel y la delegación de clics.
function painted() {
  const attrs = { 'data-action': 'borrar-datos', 'aria-expanded': 'false' };
  const toggle = { focused: 0, getAttribute: (n) => attrs[n] ?? null, setAttribute: (n, v) => { attrs[n] = String(v); }, focus() { toggle.focused += 1; } };
  const panel = { innerHTML: '', hidden: true };
  let onClick = null;
  const section = {
    addEventListener: (type, fn) => { if (type === 'click') onClick = fn; },
    contains: () => true,
    querySelector: (sel) => (sel === '[data-action="borrar-datos"]' ? toggle : sel === '#ajustes-borrar' ? panel : null),
  };
  const root = { matches: () => false, querySelector: (sel) => (sel === '[data-screen="ajustes"]' ? section : null) };
  const button = (action) => (action === 'borrar-datos' ? toggle : { getAttribute: (n) => (n === 'data-action' ? action : null) });
  const click = (action) => onClick({ target: { closest: () => button(action) } });
  return { root, toggle, panel, click, attrs };
}

test('mi equipo con la etiqueta de su grupo y «Cambiar», que abre Explorar con el buscador; sin selector de tema', () => {
  const out = render({ myTeam: LAS_MESAS });
  assert.match(out, /^<section data-screen="ajustes"><header class="screen-head"><a class="back" href="#\/explorar" data-action="back" aria-label="Volver">‹<\/a><div class="screen-head-text"><h1>Ajustes<\/h1><\/div><\/header>/);
  assert.equal((out.match(/<h1[ >]/g) || []).length, 1);
  assert.match(out, /<h2 class="block-title">Mi equipo<\/h2><\/div><div class="box"><div class="aj-team"><img class="crest crest-32" src="\.\/escudos\/s\/lasMesasEscudo\.png"[^>]*><span class="aj-team-text"><span class="aj-team-name">Las Mesas Hu\.<\/span><span class="aj-team-label">Prebenjamín, Grupo 2 de Gran Canaria<\/span><\/span><a class="screen-action" href="#\/explorar#buscar">Cambiar<\/a><\/div><\/div><\/section>/);
  assert.doesNotMatch(out, /tema|theme|oscuro|claro/i, 'el tema sigue al sistema (§4.9)');
});

test('mi equipo sin resolver: en X, que no aparece en la temporada; en E, que falta elegir en Mi equipo', () => {
  const x = render(in2627({ benjamin: ['A1'], prebenjamin: ['PG3'] }));
  assert.match(x, /<span class="aj-team-name">Las Mesas Hu\.<\/span><span class="aj-team-label">No aparece en 2026\/27<\/span>/);
  const e = render(in2627({ benjamin: ['B2'], prebenjamin: ['PG2'] }));
  assert.match(e, /<span class="aj-team-name">Las Mesas Hu\.<\/span><span class="aj-team-label">Pendiente de elegir en Mi equipo<\/span>/);
  assert.match(e, /<a class="screen-action" href="#\/explorar#buscar">Cambiar<\/a>/);
});

test('«Borrar datos de esta app»: un botón con aria-expanded y su panel, vacío y oculto hasta desplegarlo', () => {
  const out = render();
  assert.match(out, /<h2 class="block-title">Datos de esta app<\/h2><\/div><div class="box"><p class="box-text">Esta app guarda en este navegador tu equipo y los equipos que has visto hace poco\.<\/p><button class="button aj-clear" type="button" data-action="borrar-datos" aria-expanded="false" aria-controls="ajustes-borrar">Borrar datos de esta app<\/button><div id="ajustes-borrar" class="aj-confirm" hidden><\/div><\/div><\/section><\/section>$/);
  assert.equal(String(confirmPanel()), '<p class="aj-warning">Se borrarán tu equipo y los vistos hace poco.</p><div class="buttons"><button class="button is-main" type="button" data-action="confirmar-borrado">Borrar</button><button class="button" type="button" data-action="cancelar-borrado">Cancelar</button></div>');
  assert.deepEqual(screen.needs({}, datasetsFor(), { portalSeason: '2025-2026' }), []);
});

test('mount: dos pasos sin diálogo; «Cancelar» recoge el aviso y devuelve el foco; solo «Borrar» llama a nav.clearData', () => {
  const dom = painted();
  const cleared = [];
  assert.equal(screen.mount(dom.root, ctxFor('ajustes', {}), { clearData: () => cleared.push(1) }), undefined);
  // 1. El botón despliega el aviso, con «Borrar» y «Cancelar».
  dom.click('borrar-datos');
  assert.equal(dom.attrs['aria-expanded'], 'true');
  assert.equal(dom.panel.hidden, false);
  assert.equal(dom.panel.innerHTML, String(confirmPanel()));
  // 2. «Cancelar» lo recoge, deja el foco en el botón y no borra.
  dom.click('cancelar-borrado');
  assert.deepEqual([dom.attrs['aria-expanded'], dom.panel.hidden, dom.panel.innerHTML, dom.toggle.focused], ['false', true, '', 1]);
  assert.deepEqual(cleared, []);
  // El botón también lo recoge (dos pulsaciones), sin borrar.
  dom.click('borrar-datos');
  dom.click('borrar-datos');
  assert.deepEqual([dom.attrs['aria-expanded'], dom.panel.hidden], ['false', true]);
  assert.deepEqual(cleared, []);
  // 3. Desplegado, «Borrar» llama a nav.clearData (que borra y abre Mi equipo, decisión 6).
  dom.click('borrar-datos');
  dom.click('confirmar-borrado');
  assert.deepEqual(cleared, [1]);
  // Sin su sección (un pintado que ya no es Ajustes), mount no hace nada.
  assert.equal(screen.mount({ matches: () => false, querySelector: () => null }, {}, {}), undefined);
});

test('registro y CSS: la ruta pinta Ajustes; solo clases que existen, botones de 44 px y 640 px en escritorio', () => {
  assert.equal(SCREEN_MAP.ajustes, screen);
  assert.match(readFileSync(new URL('../../sw.js', import.meta.url), 'utf8'), /\n {2}'\.\/src\/screen-ajustes\.js',\n/);
  const rules = cssRules();
  const outs = [render(), render(in2627({ benjamin: ['A1'], prebenjamin: ['PG3'] })), String(confirmPanel())];
  const used = new Set(outs.join('').match(/class="[^"]+"/g).flatMap((m) => m.slice(7, -1).split(/\s+/)));
  assert.deepEqual([...used].filter((c) => !rules.classes.has(c)), []);
  const body = (selector) => rules.filter((r) => r.media === null && r.selector === selector).map((r) => r.body).join(';');
  assert.match(body('.button'), /min-height:\s*44px/, '«Borrar datos de esta app», «Borrar» y «Cancelar» son .button');
  assert.match(body('.screen-action'), /min-height:\s*44px/, '«Cambiar»');
  assert.match(body('.aj-clear'), /width:\s*100%/);
  const wide = rules.find((r) => r.media && /min-width:\s*1024px/.test(r.media) && r.selector.includes('[data-screen="ajustes"]'));
  assert.ok(wide && /max-width:\s*640px/.test(wide.body));
});
