// Plan B3, Tarea 9: pantalla Goleadores (spec §4.7 y §4.1; decisión 25 de B3). render(ctx) es pura:
// se prueba sobre el HTML que devuelve, con los goleadores congelados (gol-2025-2026) y `today`
// inyectado. También categoryScorers (state.js), el buscador de mount, que apunta la `q` con
// nav.update (decisión 4), y las páginas de la lista (decisión 159), con una de unos 2.000 jugadores.
import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { goleadores, archive } from './fixtures/rediseno/simulate.mjs';
import { ctxFor, datasetsFor, cssRules, PORTAL_SEASON } from './fixtures/rediseno/screens.mjs';
import { screen, filterScorers, PAGE_ROWS, SEARCH_FIRST, SEARCH_ROWS } from '../../src/screen-goleadores.js';
import { SCREEN_MAP } from '../../src/screens.js';
import { categoryScorers, rankScorers } from '../../src/state.js';
import { defaultCategory } from '../../src/myteam.js';

const TODAY = '2026-09-23';
const LAS_MESAS_A2 = { name: 'Las Mesas Hu.', season: PORTAL_SEASON, cat: 'benjamin', groupId: 'A2' };
const GOL = goleadores();
const s = (h) => String(h);
const text = (h) => s(h).replace(/<[^>]*>/g, ' ').replace(/&quot;/g, '"').replace(/&#39;/g, "'")
  .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim();
const ctxOf = (params, { myTeam, datasets = datasetsFor({ ...goleadores() }) } = {}) => ctxFor('goleadores', { s: PORTAL_SEASON, ...params }, { today: TODAY, datasets, ...(myTeam ? { myTeam } : {}) });
const render = (params, opts) => s(screen.render(ctxOf(params, opts)));
// Las filas pintadas: [puesto, jugador, equipo, goles, PJ] y el enlace del equipo. La primera de una
// página que añade «Ver N más» lleva su id y tabindex -1.
const rows = (out) => [...out.matchAll(/<tr(?: id="goleador-\d+" tabindex="-1")?><td class="st-pos">(\d+)<\/td><th scope="row" class="gol-player"><span class="gol-name">([^<]*)<\/span><a class="gol-team" href="([^"]+)">.*?<span class="gol-team-name">([^<]*)<\/span><\/a><\/th><td class="sc-goals">(\d+)<\/td><td class="sc-pj">(\d+)<\/td><\/tr>/g)]
  .map((m) => ({ row: [+m[1], text(m[2]), text(m[4]), +m[5], +m[6]], href: m[3] }));
const count = (out) => text((out.match(/<p class="gol-count" role="status">(.*?)<\/p>/) || [])[1] || '');
// La etiqueta del buscador, sea cual sea el orden de sus atributos.
const input = (out) => (out.match(/<input\b[^>]*\bid="buscar-goleador"[^>]*>/) || [''])[0];

test('categoryScorers: la categoría entera, un jugador por nombre y equipo con sus fases sumadas', () => {
  const benj = categoryScorers(GOL.golBenj);
  assert.equal(benj.length, 586);
  assert.equal(benj.filter((r) => r.groups.length > 1).length, 75);
  // El primero suma A1 (44 en 18) y FF5 (12 en 4); su ficha es la del grupo en el que más jugó.
  assert.deepEqual(benj[0], { name: 'Del Rosario Jimenez, Mario', team: 'Arucas', goals: 56, games: 22, groupId: 'A1', groups: ['A1', 'FF5'] });
  // La fila más alta sin sumar (B1, 54 en 18) queda segunda.
  assert.deepEqual(benj.slice(1, 3).map((r) => [r.name, r.team, r.goals, r.games, r.groups.join('+')]),
    [['Moreno Rodriguez, Diego', 'Roque Amagro', 54, 18, 'B1'], ['Quintana Ojeda, Diego', 'San Lázaro', 43, 22, 'B2+FF9']]);
  // Un homónimo de otro equipo va aparte.
  assert.deepEqual(benj.filter((r) => r.name === 'Del Rosario Jimenez, Mario').map((r) => [r.team, r.goals, r.games]),
    [['Arucas', 56, 22], ['Arucas B', 18, 11]]);
  const pre = categoryScorers(GOL.golPrebenj);
  assert.equal(pre.length, 299);
  assert.deepEqual([pre[0].name, pre[0].team, pre[0].goals, pre[0].games, pre[0].groupId], ['Raffay Buehre, Lucas', 'CD Cerruda', 66, 20, 'PG3']);
  assert.deepEqual(categoryScorers(null), []);
  assert.deepEqual(categoryScorers([{ id: 'X', s: [['B', 't', 3, 5], ['A', 't', 3, 4], ['C', 't', 9, 9]] }]).map((r) => r.name), ['C', 'A', 'B']);
  // El puesto (rankScorers), el de Goleadores y el de los 30 primeros de Récords: con los mismos goles
  // y partidos, el mismo; a igualdad de goles, antes el de menos partidos.
  const pos = (list) => rankScorers(list.map(([goals, games]) => ({ goals, games }))).map((r) => r.pos);
  assert.deepEqual(pos([[9, 9], [3, 4], [3, 4], [3, 5]]), [1, 2, 2, 4]);
  assert.deepEqual(rankScorers(pre).slice(3, 7).map((r) => `${r.pos} ${r.goals} ${r.games}`), ['4 50 20', '5 42 18', '6 42 19', '7 41 21']);
});

test('filterScorers: el equipo por su nombre exacto; la búsqueda, sin tildes y en cualquier orden, desde dos letras', () => {
  const benj = categoryScorers(GOL.golBenj);
  const mesas = filterScorers(benj, { team: 'Las Mesas Hu.' });
  assert.equal(mesas.length, 13);
  assert.deepEqual([mesas[0].name, mesas[0].goals, mesas[0].games, mesas[0].groups.join('+')], ['Espiau Chicoy, Alvaro', 29, 23, 'A2+FF5']);
  assert.deepEqual([...new Set(filterScorers(benj, { query: 'mesas' }).map((r) => r.team))], ['Las Mesas Hu.', 'Las Mesas B', 'Las Mesas Hu. B']);
  const pre = categoryScorers(GOL.golPrebenj);
  assert.deepEqual(filterScorers(pre, { query: 'lucas LEON' }).map((r) => r.name), ['León Rodríguez, Lucas']);
  assert.deepEqual(filterScorers(pre, { query: 'huracan lucas' }).map((r) => r.name), ['León Rodríguez, Lucas'], 'jugador y equipo a la vez');
  assert.equal(filterScorers(pre, { query: 'l' }).length, 299, 'una letra no filtra');
  assert.equal(filterScorers(pre, { query: 'zzz' }).length, 0);
});

test('defaultCategory (myteam.js): la de mi equipo resuelto; sin él (E o X), la del equipo por defecto; si no, benjamín', () => {
  const ok = (cat) => ({ status: 'ok', cat });
  assert.equal(defaultCategory(ok('benjamin'), { cat: 'prebenjamin' }), 'benjamin');
  assert.equal(defaultCategory({ status: 'absent' }, { cat: 'prebenjamin' }), 'prebenjamin');
  assert.equal(defaultCategory({ status: 'ask', candidates: [] }, null), 'benjamin');
  assert.equal(defaultCategory(ok('alevin'), { cat: 'cadete' }), 'benjamin', 'una categoría que no existe no vale');
});

test('la global de mi categoría (prebenjamín): cabecera, categoría, buscador y la primera página, las 200 primeras de 299', () => {
  const out = render({});
  assert.match(out, /^<section data-screen="goleadores"><header class="screen-head"><a class="back" href="#\/explorar" data-action="back" aria-label="Volver">‹<\/a>/);
  assert.equal((out.match(/<h1[ >]/g) || []).length, 1);
  assert.match(out, /<h1>Goleadores<\/h1><p class="screen-sub">Prebenjamín, todos los grupos<\/p><\/div><\/header>/);
  assert.match(out, /<nav class="gol-cats" aria-label="Categoría"><div class="segmented"><a class="segment" id="categoria-benjamin" href="#\/goleadores\?s=2025-2026&amp;c=benjamin">Benjamín<\/a><a class="segment" id="categoria-prebenjamin" href="#\/goleadores\?s=2025-2026&amp;c=prebenjamin" aria-current="true">Prebenjamín<\/a><\/div><\/nav>/);
  // El buscador de Explorar (searchBox, ui.js), con su id estable.
  assert.match(out, /<form\b[^>]*\brole="search"[^>]*>.*<input\b[^>]*\bid="buscar-goleador"[^>]*>.*<\/form>/);
  assert.match(input(out), /\btype="search"/);
  assert.equal(count(out), '299 jugadores de 2 grupos');
  const list = rows(out);
  assert.equal(list.length, PAGE_ROWS);
  assert.deepEqual(list.slice(0, 2).map((r) => r.row), [[1, 'Lucas Raffay Buehre', 'CD Cerruda', 66, 20], [2, 'Eydan Santana Moreno', 'UD Vecindario', 57, 20]]);
  assert.equal(list[0].href, '#/equipo?s=2025-2026&amp;g=PG3&amp;t=CD%20Cerruda');
  // Con los mismos goles y partidos, el mismo puesto.
  assert.deepEqual(list.slice(14, 17).map((r) => r.row.slice(0, 2)), [[15, 'Hugo Cabrera Castells'], [16, 'Deremyk Benitez Ponce'], [16, 'Victor Omar Trujillo Ruiz']]);
  // Las 99 que quedan, con un botón que las añade (decisión 159): no despliega nada, sin aria-expanded.
  assert.match(out, /<\/tbody><\/table><\/div><button type="button" class="gol-more" data-action="ver-mas" aria-controls="goleadores-filas">Ver los 99 que quedan<\/button>/);
  assert.doesNotMatch(out, /aria-expanded|<tbody[^>]* hidden/);
  assert.doesNotMatch(out, /Primera y la Segunda Fase/, 'en prebenjamín no hay fases que sumar');
});

test('benjamín: 586 jugadores de 8 grupos, el primero suma sus dos fases y lo dice; su equipo abre la ficha del grupo en el que más jugó', () => {
  const out = render({ c: 'benjamin' });
  assert.match(out, /<p class="screen-sub">Benjamín, todos los grupos<\/p>/);
  assert.match(out, /id="categoria-benjamin" href="#\/goleadores\?s=2025-2026&amp;c=benjamin" aria-current="true"/);
  assert.equal(count(out), '586 jugadores de 8 grupos');
  const list = rows(out);
  assert.deepEqual(list[0].row, [1, 'Mario Del Rosario Jimenez', 'Arucas', 56, 22]);
  assert.equal(list[0].href, '#/equipo?s=2025-2026&amp;g=A1&amp;t=Arucas');
  assert.match(out, /Ver 200 más \(quedan 386\)/);
  assert.match(out, /<p class="notice">Cada jugador suma sus goles y sus partidos de todos los grupos en los que jugó con el mismo equipo: la Primera y la Segunda Fase\.<\/p><\/section>$/);
  // Mi equipo en benjamín (A2): su categoría es la de por defecto.
  assert.match(render({}, { myTeam: LAS_MESAS_A2 }), /<p class="screen-sub">Benjamín, todos los grupos<\/p>/);
  // Sin mi equipo resuelto (X), la del equipo por defecto (prebenjamín), aunque el guardado sea de benjamín.
  assert.match(render({}, { myTeam: { name: 'Nadie', season: PORTAL_SEASON, cat: 'benjamin', groupId: 'A1' } }), /<p class="screen-sub">Prebenjamín, todos los grupos<\/p>/);
});

test('t, un equipo por su nombre exacto: sus jugadores con su puesto en la lista entera, y el enlace para quitarlo', () => {
  const out = render({ c: 'benjamin', t: 'Las Mesas Hu.' });
  assert.equal(count(out), '13 de 586 jugadores');
  assert.match(out, /<p class="notice"><b>Equipo:<\/b> Las Mesas Hu\. · <a class="more" href="#\/goleadores\?s=2025-2026&amp;c=benjamin">Ver todos los equipos<\/a><\/p>/);
  const list = rows(out);
  assert.equal(list.length, 13);
  assert.deepEqual(list.slice(0, 2).map((r) => r.row), [[21, 'Alvaro Espiau Chicoy', 'Las Mesas Hu.', 29, 23], [39, 'Sergio Espiau Chicoy', 'Las Mesas Hu.', 23, 23]]);
  // Cada uno abre la ficha de su equipo en el grupo en el que más jugó: A2, salvo quien solo jugó la
  // Primera Fase (FF5).
  assert.equal(list.map((r) => r.href.match(/g=(\w+)/)[1]).join(' '), 'A2 A2 A2 A2 A2 A2 A2 A2 A2 A2 A2 FF5 A2');
  assert.deepEqual(list[11].row, [279, 'Enrique Garcia Gonzalez', 'Las Mesas Hu.', 4, 5]);
  assert.equal(list[0].href, '#/equipo?s=2025-2026&amp;g=A2&amp;t=Las%20Mesas%20Hu.');
  assert.doesNotMatch(out, /gol-more/);
  // Un equipo sin goleadores en la lista.
  assert.match(render({ c: 'benjamin', t: 'Nadie' }), /<p class="empty">Nadie no tiene goleadores en esta lista\.<\/p>/);
});

test('un grupo (desde la Tabla o «ver todos» de la portada): su lista, «Todos los grupos» y el filtro del equipo', () => {
  const out = render({ g: 'PG2' });
  assert.match(out, /<h1>Goleadores<\/h1><p class="screen-sub">Prebenjamín, Grupo 2 de Gran Canaria<\/p><\/div><a class="screen-action" href="#\/goleadores\?s=2025-2026&amp;c=prebenjamin">Todos los grupos<\/a><\/header>/);
  assert.doesNotMatch(out, /gol-cats/, 'la categoría es la del grupo');
  assert.equal(count(out), '149 jugadores');
  assert.equal(rows(out).length, 149);
  assert.doesNotMatch(out, /gol-more|Primera y la Segunda Fase/);
  const mine = render({ g: 'PG2', t: 'Las Mesas Hu.' });
  assert.equal(count(mine), '11 de 149 jugadores');
  assert.deepEqual(rows(mine)[0].row, [36, 'Theo De La Rosa Perello', 'Las Mesas Hu.', 12, 17]);
  assert.match(mine, /<a class="screen-action" href="#\/goleadores\?s=2025-2026&amp;c=prebenjamin&amp;t=Las%20Mesas%20Hu\.">Todos los grupos<\/a>/);
});

test('q de la dirección: render pinta la misma búsqueda, con el texto en el buscador; sin resultados, lo dice', () => {
  const out = render({ c: 'benjamin', q: 'mesas' });
  assert.match(input(out), /\bvalue="mesas"/);
  assert.equal(count(out), '29 de 586 jugadores');
  assert.deepEqual(rows(out).slice(0, 1).map((r) => r.row), [[21, 'Alvaro Espiau Chicoy', 'Las Mesas Hu.', 29, 23]]);
  const none = render({ c: 'benjamin', q: 'zzz' });
  assert.equal(count(none), '0 de 586 jugadores');
  assert.match(none, /<div data-scorers><p class="empty">Ningún jugador ni equipo con «zzz»\.<\/p><\/div>/);
  assert.match(render({ c: 'benjamin', t: 'Las Mesas Hu.', q: 'zzz' }), /<p class="empty">Ningún goleador de Las Mesas Hu\. con «zzz»\.<\/p>/);
  // Con una búsqueda, las 30 primeras y «Ver 100 más» (decisión 159): «an» da 346 jugadores de benjamín.
  const an = render({ c: 'benjamin', q: 'an' });
  assert.equal(count(an), '346 de 586 jugadores');
  assert.equal(rows(an).length, SEARCH_FIRST);
  assert.match(an, />Ver 100 más \(quedan 316\)<\/button>/);
});

test('sin goleadores: una temporada pasada, un grupo que no los publica, uno sin goles y una categoría sin datos', () => {
  const past = render({ s: '2024-2025', c: 'benjamin' }, { datasets: datasetsFor({ ...goleadores(), seasonRaw: { '2024-2025': archive('2024-2025') } }) });
  assert.match(past, /<p class="screen-sub">Benjamín, todos los grupos · 2024\/25<\/p>/);
  assert.match(past, /<p class="empty">No hay goleadores de la temporada 2024\/25: esta web solo guarda los de la temporada actual\.<\/p><\/section>$/);
  assert.doesNotMatch(past, /buscar-goleador|gol-cats/);
  assert.match(render({ g: 'PFV2' }), /<p class="empty">La fuente de este grupo no publica goleadores\.<\/p>/);
  assert.match(render({ g: 'BCA1' }, { datasets: datasetsFor({ ...goleadores(), champions: true }) }), /<p class="empty">La fuente de este grupo no publica goleadores\.<\/p>/);
  assert.match(render({ g: 'PG2' }, { datasets: datasetsFor({ golPrebenj: [{ id: 'PG2', s: [] }] }) }), /<p class="empty">Todavía no hay goles registrados en este grupo\.<\/p>/);
  const bare = render({ c: 'benjamin' }, { datasets: datasetsFor() });
  assert.match(bare, /<p class="empty">Todavía no hay goleadores de benjamín en la temporada 2025\/26\.<\/p>/);
  assert.match(bare, /class="gol-cats"/, 'se puede cambiar de categoría');
});

// Elementos mínimos para mount, como en las pruebas de mount de B2: la sección, el buscador, la
// lista, el recuento y el tbody de la tabla, al que mount añade las páginas (insertAdjacentHTML);
// la primera fila de cada página se encuentra por su id y guarda si recibió el foco.
function mountWith(params, { myTeam, datasets } = {}) {
  const ctx = ctxOf(params, { myTeam, ...(datasets ? { datasets } : {}) });
  const input = { id: 'buscar-goleador', value: params.q || '', blurred: 0, blur() { this.blurred++; } };
  const box = { innerHTML: '' };
  const counter = { textContent: '' };
  const body = { added: [], insertAdjacentHTML(where, markup) { assert.equal(where, 'beforeend'); this.added.push(markup); } };
  const focused = [];
  const found = { '[data-scorers]': box, '.gol-count': counter, '#buscar-goleador': input, '#goleadores-filas': body };
  const firstRow = (sel) => (/^#goleador-\d+$/.test(sel) && body.added.some((markup) => markup.startsWith(`<tr id="${sel.slice(1)}" tabindex="-1">`))
    ? { focus: () => focused.push(sel.slice(1)) } : null);
  const on = {};
  const section = { matches: (sel) => sel === '[data-screen="goleadores"]', querySelector: (sel) => found[sel] || firstRow(sel), addEventListener: (type, fn) => { on[type] = fn; } };
  const updates = [];
  screen.mount(section, ctx, { update: (p) => { updates.push(p); return true; } });
  const button = { textContent: '', removed: false, remove() { this.removed = true; } };
  button.closest = () => button;
  return { ctx, input, box, counter, body, focused, on, updates, button };
}

test('mount: al escribir filtra, repinta solo la lista y el recuento y apunta la q con nav.update, sin tocar el campo; una letra que no filtra no repinta', () => {
  const m = mountWith({ c: 'benjamin' });
  // Una letra todavía no filtra: la lista ya pintada se queda (nada que repintar), y la q va a la dirección.
  m.input.value = 'm';
  m.on.input({ target: m.input });
  assert.equal(m.box.innerHTML, '', 'sin repintar');
  assert.deepEqual(m.updates, [{ s: PORTAL_SEASON, c: 'benjamin', q: 'm' }]);
  m.input.value = 'mesas';
  m.on.input({ target: m.input });
  assert.equal(rows(m.box.innerHTML).length, 29);
  assert.equal(m.counter.textContent, '29 de 586 jugadores');
  assert.deepEqual(m.updates[1], { s: PORTAL_SEASON, c: 'benjamin', q: 'mesas' });
  assert.equal(m.input.value, 'mesas', 'el campo no se repinta: el cursor sigue donde estaba');
  // Una búsqueda con más resultados («me», 107): las 30 primeras y el botón con las que quedan.
  m.input.value = 'me';
  m.on.input({ target: m.input });
  assert.equal(rows(m.box.innerHTML).length, SEARCH_FIRST);
  assert.equal(m.counter.textContent, '107 de 586 jugadores');
  assert.match(m.box.innerHTML, />Ver los 77 que quedan<\/button>/);
  // Borrar la búsqueda: la lista entera desde el principio, también con 30 filas (al escribir, nunca
  // más: repintar 200 pasaba de 200 ms por tecla con la CPU ×4), con páginas de 200, y la q fuera de
  // la dirección (routeHref quita la vacía).
  m.input.value = '';
  m.on.input({ target: m.input });
  assert.equal(rows(m.box.innerHTML).length, SEARCH_FIRST);
  assert.match(m.box.innerHTML, />Ver 200 más \(quedan 556\)<\/button>/);
  assert.equal(m.counter.textContent, '586 jugadores de 8 grupos');
  assert.deepEqual(m.updates[3], { s: PORTAL_SEASON, c: 'benjamin', q: '' });
  // Otro campo (ninguno, hoy) no filtra; Intro no recarga la página y cierra el teclado.
  m.on.input({ target: { id: 'otro', value: 'x' } });
  assert.equal(m.updates.length, 4);
  let prevented = false;
  m.on.submit({ preventDefault: () => { prevented = true; } });
  assert.ok(prevented);
  assert.equal(m.input.blurred, 1);
});

test('mount: «Ver 200 más» añade la página siguiente al final, sin repintar lo pintado, y lleva el foco a su primera fila; en la última, el botón se va (decisión 159)', () => {
  const m = mountWith({ c: 'benjamin' });
  m.on.click({ target: m.button });
  const page2 = rows(m.body.added[0]);
  assert.equal(page2.length, PAGE_ROWS);
  assert.equal(page2[0].row[0], 201);
  assert.match(m.body.added[0], /^<tr id="goleador-201" tabindex="-1"><td class="st-pos">201<\/td>/);
  assert.deepEqual(m.focused, ['goleador-201']);
  assert.equal(m.button.textContent, 'Ver los 186 que quedan');
  assert.equal(m.box.innerHTML, '', 'lo pintado no se vuelve a pintar');
  m.on.click({ target: m.button });
  const page3 = rows(m.body.added[1]);
  // Hasta el último, el 585.º (dos empatan en el 585).
  assert.deepEqual([page3.length, page3.at(-1).row[0]], [186, 585]);
  assert.deepEqual(m.focused, ['goleador-201', 'goleador-401']);
  assert.equal(m.button.removed, true, 'sin nada que añadir, el botón se va');
  // Con la búsqueda de la dirección («an», 346 jugadores): 30 pintados y páginas de 100.
  const q = mountWith({ c: 'benjamin', q: 'an' });
  assert.equal(filterScorers(categoryScorers(GOL.golBenj), { query: 'an' }).length, 346);
  q.on.click({ target: q.button });
  assert.equal(rows(q.body.added[0]).length, SEARCH_ROWS);
  assert.equal(q.button.textContent, 'Ver 100 más (quedan 216)');
  assert.deepEqual(q.focused, ['goleador-31']);
  // Un clic fuera del botón no hace nada; sin lista (una temporada pasada), mount no hace nada.
  m.on.click({ target: { closest: () => null } });
  assert.equal(m.body.added.length, 2);
  assert.equal(screen.mount({ matches: () => true, querySelector: () => null }, ctxOf({})), undefined);
});

test('una lista de 2.000 jugadores, como benjamín con los datos vivos: 200 filas y cada toque añade 200; una búsqueda pinta 30 y cada toque, 100 (decisión 159)', () => {
  // Un grupo de benjamín (A1) con 2.000 goleadores de 20 equipos, todos con goles distintos.
  const golBenj = [{ id: 'A1', s: Array.from({ length: 2000 }, (_, i) => [`Jugador ${String(i + 1).padStart(4, '0')}, Ana`, `Equipo ${i % 20}`, 2000 - i, 10]) }];
  const datasets = datasetsFor({ golBenj });
  const out = render({ c: 'benjamin' }, { datasets });
  assert.equal(count(out), '2000 jugadores de 1 grupo');
  assert.equal(rows(out).length, PAGE_ROWS);
  assert.match(out, />Ver 200 más \(quedan 1800\)<\/button>/);
  const m = mountWith({ c: 'benjamin' }, { datasets });
  for (let tap = 1; tap <= 9; tap++) {
    m.on.click({ target: m.button });
    assert.equal(rows(m.body.added.at(-1)).length, PAGE_ROWS, `toque ${tap}`);
  }
  assert.equal(m.button.removed, true, 'nueve toques, y las 2.000');
  assert.equal(m.focused.at(-1), 'goleador-1801');
  // Una búsqueda que casa con todos: 30 filas y «Ver 100 más»; cada toque, 100.
  const q = mountWith({ c: 'benjamin' }, { datasets });
  q.input.value = 'ana';
  q.on.input({ target: q.input });
  assert.equal(rows(q.box.innerHTML).length, SEARCH_FIRST);
  assert.match(q.box.innerHTML, />Ver 100 más \(quedan 1970\)<\/button>/);
  q.on.click({ target: q.button });
  assert.equal(rows(q.body.added[0]).length, SEARCH_ROWS);
  // Con el nombre, uno solo.
  q.input.value = 'jugador 1234';
  q.on.input({ target: q.input });
  assert.deepEqual(rows(q.box.innerHTML).map((r) => r.row), [[1234, 'Ana Jugador 1234', 'Equipo 13', 767, 10]]);
});

test('registro: Goleadores en su ruta, sin cargas propias', () => {
  assert.equal(SCREEN_MAP.goleadores, screen);
  assert.equal(screen.id, 'goleadores');
  assert.deepEqual(screen.needs({ s: PORTAL_SEASON }, datasetsFor(), { portalSeason: PORTAL_SEASON }), []);
});

test('CSS: el equipo es un enlace de 44 px que no agranda la fila, «Ver N más» también; el puesto de 4 cifras cabe; clases que existen', () => {
  const rules = cssRules();
  const bodyOf = (sel) => rules.filter((r) => r.media === null && r.selector === sel).map((r) => r.body).join(';');
  assert.match(bodyOf('.gol-team'), /min-height:\s*44px/);
  assert.match(bodyOf('.gol-team'), /margin:\s*-12px 0/);
  assert.match(bodyOf('.gol-more'), /min-height:\s*44px/);
  // Hasta «2140» con los datos vivos: 44 px, no los 24 de la Tabla (decisión 161).
  assert.match(bodyOf('.gol-table .st-pos'), /width:\s*44px/);
  const out = [render({}), render({ c: 'benjamin', t: 'Las Mesas Hu.' }), render({ g: 'PG2' }), render({ c: 'benjamin', q: 'zzz' })].join('');
  const used = new Set(out.match(/class="[^"]+"/g).flatMap((m) => m.slice(7, -1).split(/\s+/)));
  assert.deepEqual([...used].filter((c) => !rules.classes.has(c)), []);
});
