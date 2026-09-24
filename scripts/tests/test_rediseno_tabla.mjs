// Plan B2, Tarea 10: pantalla Tabla (spec §4.4, §4.8 y §7; decisiones 3 y 15 de B1). render(ctx)
// es pura: se prueba sobre el HTML que devuelve, con las fixtures congeladas y `today` inyectado.
import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';
import { currentAt } from './fixtures/rediseno/simulate.mjs';
import { fixture } from './fixtures/rediseno/load.mjs';
import { ctxFor, datasetsFor, pastSeasonRaw, cssRules, PORTAL_SEASON } from './fixtures/rediseno/screens.mjs';
import { screen, homeAwayCoverage, groupScorers } from '../../src/screen-tabla.js';
import { lastResults, homeAwayTable, sourceInfo } from '../../src/model.js';
import { standingsTable } from '../../src/ui.js';

// PG2, goleadores: los 12 primeros de GOL_PREBENJ (data-goleadores.js, 23/09/2026), copia literal.
const GOL_PG2 = [{ id: 'PG2', g: 'PREBENJAMIN GC GRUPO 2', s: [
  ['León Rodríguez, Lucas', 'AD Huracán', 50, 20], ['Garcia Santana, Hector', 'Acodetti', 42, 18],
  ['Lozano Martin, Daniel', 'Acodetti', 28, 17], ['Rodriguez Aloma, Antoine', 'AD Huracán', 27, 19],
  ['Cabrera Castells, Hugo', 'Santa Brígida', 24, 19], ['Benitez Ponce, Deremyk', 'La Garita', 24, 21],
  ['Trujillo Ruiz, Victor Omar', 'Unión Viera', 24, 21], ['Perez Lopez, Adriel', 'La Garita', 23, 18],
  ['Figueras Medina, Ilian Alexis', 'AD Huracán', 22, 19], ['Martin Aguiar, Luka', 'RC Victoria', 22, 21],
  ['Vega Hernandez, Juan Ramon', 'Unión Viera', 21, 21], ['Rodriguez Suarez, Airam', 'Veteranos', 20, 20],
] }];

const s = (h) => String(h);
const text = (h) => s(h).replace(/<[^>]*>/g, ' ').replace(/&quot;/g, '"').replace(/&#39;/g, "'")
  .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim();
const opts = (extra = {}) => ({ datasets: datasetsFor({ golPrebenj: GOL_PG2, ...extra }) });
const render = (params, o = opts()) => s(screen.render(ctxFor('tabla', { s: PORTAL_SEASON, ...params }, o)));
const nav = (out, which) => (out.match(new RegExp(`<nav class="tabla-views is-${which}"[^>]*>(.*?)</nav>`)) || [])[1] || '';
const active = (html) => [...html.matchAll(/<a class="segment"[^>]*aria-current="true">([^<]*)<\/a>/g)].map(m => m[1]);
const ids = (html) => [...html.matchAll(/<a class="segment" id="([^"]+)"/g)].map(m => m[1]);
const labels = (html) => [...html.matchAll(/<a class="segment"[^>]*>([^<]*)<\/a>/g)].map(m => m[1]);
const bodyRows = (out) => [...(out.match(/<table class="standings">.*?<tbody>(.*?)<\/tbody>/) || ['', ''])[1]
  .matchAll(/<tr( class="is-mine")?>(.*?)<\/tr>/g)].map(m => ({ mine: !!m[1], html: m[2], text: text(m[2]) }));
const pg2 = () => ctxFor('tabla', {}).model.group(PORTAL_SEASON, 'PG2');

test('PG2 por defecto: cinco vistas en móvil (Puntos), Todas, Casa y Fuera en escritorio (Todas)', () => {
  const out = render({ g: 'PG2' });
  assert.match(out, /^<section data-screen="tabla">/);
  assert.equal((out.match(/<h1[ >]/g) || []).length, 1);
  assert.match(out, /<h1>Tabla<\/h1><p class="screen-sub">Prebenjamín, Grupo 2 de Gran Canaria<\/p>/);
  assert.match(out, /<a class="screen-action" href="#\/ligas\?s=2025-2026&amp;c=prebenjamin&amp;i=grancanaria&amp;to=tabla">Otro grupo<\/a>/);
  assert.deepEqual(labels(nav(out, 'narrow')), ['Puntos', 'Goles', 'Forma', 'Casa', 'Fuera']);
  assert.deepEqual(active(nav(out, 'narrow')), ['Puntos']);
  assert.deepEqual(labels(nav(out, 'wide')), ['Todas', 'Casa', 'Fuera']);
  assert.deepEqual(active(nav(out, 'wide')), ['Todas']);
  // Un id estable por vista y selector: al cambiar de vista (replaceState), el router devuelve el
  // foco al segmento pulsado, no al h1 (B11 de la revisión).
  assert.deepEqual(ids(nav(out, 'narrow')), ['vista-puntos', 'vista-goles', 'vista-forma', 'vista-casa', 'vista-fuera']);
  assert.deepEqual(ids(nav(out, 'wide')), ['vista-ancha-todas', 'vista-ancha-casa', 'vista-ancha-fuera']);
  assert.match(nav(out, 'narrow'), /href="#\/tabla\?s=2025-2026&amp;g=PG2" aria-current="true">Puntos/, 'la vista por defecto va sin v');
  assert.match(nav(out, 'narrow'), /href="#\/tabla\?s=2025-2026&amp;g=PG2&amp;v=forma">Forma/);
  assert.match(nav(out, 'wide'), /href="#\/tabla\?s=2025-2026&amp;g=PG2" aria-current="true">Todas/);
  assert.match(out, /<h2 class="block-title">Clasificación<\/h2><p class="block-context">jornada 30, final<\/p>/);
  assert.match(out, /<div class="box tabla-puntos"><table class="standings">/);
});

test('PG2: una sola tabla con todas las columnas, # Equipo y Pts, la fila propia y cada equipo a #/equipo', () => {
  const out = render({ g: 'PG2' });
  const heads = [...out.match(/<thead>(.*?)<\/thead>/)[1].matchAll(/<th scope="col"[^>]*>(.*?)<\/th>/g)].map(m => text(m[1]));
  assert.deepEqual(heads, ['#', 'Equipo', 'J', 'G', 'E', 'P', 'GF', 'GC', 'DG', 'Últimos 5', 'Pts']);
  const rows = bodyRows(out);
  assert.equal(rows.length, 15);
  assert.deepEqual(rows.filter(r => r.mine).map(r => r.text.split(' (')[0]), ['9 Las Mesas Hu.']);
  assert.match(rows[8].html, /<a class="st-link" href="#\/equipo\?s=2025-2026&amp;g=PG2&amp;t=Las%20Mesas%20Hu\.">/);
  assert.match(rows[8].html, /<td class="st-pts">37<\/td>$/);
  assert.equal((out.match(/<table class="standings">/g) || []).length, 1, 'no hay una segunda tabla escondida');
});

test('Forma: los cinco últimos de lastResults y «retirado» para CD Batán', () => {
  const out = render({ g: 'PG2', v: 'forma' });
  assert.deepEqual(active(nav(out, 'narrow')), ['Forma']);
  assert.deepEqual(active(nav(out, 'wide')), ['Todas']);
  assert.match(out, /<div class="box tabla-forma">/);
  const rows = bodyRows(out);
  const letters = (row) => [...row.html.matchAll(/<span class="form-chip form-[gep]">([GEP])<\/span>/g)].map(m => m[1]).join('');
  assert.equal(letters(rows[8]), lastResults('Las Mesas Hu.', pg2()).map(x => x.letter).join(''));
  assert.equal(letters(rows[8]), 'EPPGP');
  assert.equal(letters(rows[0]), 'GGPGG');
  assert.match(rows[14].html, /<td class="st-form"><span class="st-retired">retirado<\/span><\/td>/);
  assert.match(rows[14].text, /^15 .*CD Batán 28 0 0 28 0 84 −84 retirado 0$/);
});

test('Casa y Fuera: homeAwayTable, la fila propia y la nota de cobertura de Batán', () => {
  for (const [v, where] of [['casa', 'en casa'], ['fuera', 'fuera de casa']]) {
    const out = render({ g: 'PG2', v });
    assert.deepEqual(active(nav(out, 'narrow')), [v === 'casa' ? 'Casa' : 'Fuera']);
    assert.deepEqual(active(nav(out, 'wide')), [v === 'casa' ? 'Casa' : 'Fuera']);
    assert.match(out, new RegExp(`<h2 class="block-title">Clasificación ${where}</h2><p class="block-context">desde el calendario</p>`));
    const rows = bodyRows(out);
    const expected = homeAwayTable(pg2(), v);
    assert.deepEqual(rows.map(r => r.text.split(' ').pop()), expected.map(r => String(r.pts)));
    const own = expected.find(r => r.team === 'Las Mesas Hu.');
    assert.equal(rows.find(r => r.mine).text, `${own.pos} Las Mesas Hu. (mi equipo) ${[own.pj, own.g, own.e, own.p, own.pts].join(' ')}`);
    assert.equal(text(out.match(/<p class="notice">.*?<\/p>/)[0]),
      'No cuenta los 28 partidos contra CD Batán (retirado), que no están en el calendario.');
  }
});

test('cobertura: nada en PFV2; con resultados que faltan, las dos cifras y los retirados', () => {
  assert.equal(homeAwayCoverage(ctxFor('tabla', {}).model.group(PORTAL_SEASON, 'PFV2')), null);
  assert.doesNotMatch(render({ g: 'PFV2', v: 'casa' }), /class="notice"/);
  assert.deepEqual(homeAwayCoverage(pg2()), { calendar: 182, official: 210, vsRetired: 28, retired: ['CD Batán'], exact: true });
  // Clasificación final y calendario del 1 de marzo (currentAt): faltan resultados.
  const out = render({ g: 'PG2', v: 'fuera' }, { today: '2026-03-01', datasets: datasetsFor({ current: currentAt('2026-03-01') }) });
  assert.equal(text(out.match(/<p class="notice">.*?<\/p>/)[0]),
    'Con los 101 partidos con resultado del calendario; la clasificación oficial cuenta 210, 28 de ellos contra CD Batán (retirado).');
});

test('goleadores del grupo: los 10 primeros con escudo, goles y PJ, y «ver todos»', () => {
  const out = render({ g: 'PG2' });
  const block = out.match(/<section class="block"><div class="block-head"><h2 class="block-title">Goleadores del grupo<\/h2>.*?<\/section>/)[0];
  assert.match(block, /<p class="block-context"><a class="block-link" href="#\/goleadores\?s=2025-2026&amp;g=PG2">ver todos \(12\)<\/a><\/p>/);
  const rows = [...block.matchAll(/<tr><th scope="row"[^>]*>(.*?)<\/th><td class="sc-goals">(\d+)<\/td><td class="sc-pj">(\d+)<\/td><\/tr>/g)];
  assert.equal(rows.length, 10);
  assert.deepEqual(rows.map(m => [text(m[1]), +m[2], +m[3]]).slice(0, 2), [
    ['Lucas León Rodríguez , AD Huracán', 50, 20], ['Hector Garcia Santana , Acodetti', 42, 18]]);
  assert.match(rows[0][1], /<img class="crest crest-16" src="\.\/escudos\/s\/huracan\.png"/);
  assert.match(block, /<th scope="col" class="sc-goals">Goles<\/th><th scope="col" class="sc-pj"><abbr title="Partidos jugados">PJ<\/abbr><\/th>/);
  // Con 10 o menos no hay «ver todos».
  const few = [{ id: 'PG2', s: GOL_PG2[0].s.slice(0, 10) }];
  assert.doesNotMatch(render({ g: 'PG2' }, opts({ golPrebenj: few })), /ver todos/);
  assert.deepEqual(groupScorers([{ id: 'X', s: [['B', 't', 3, 5], ['A', 't', 3, 4], ['C', 't', 9, 9]] }], 'X').map(r => r.name), ['C', 'A', 'B']);
  assert.equal(groupScorers(null, 'X'), null);
  assert.equal(groupScorers([{ id: 'Y', s: [] }], 'X'), null, 'sin el grupo, null');
  assert.deepEqual(groupScorers([{ id: 'X', s: [] }], 'X'), []);
});

test('goleadores: un vacío que dice por qué, en PFV2, sin goles aún y en una temporada pasada', () => {
  assert.match(render({ g: 'PFV2' }), /<h2 class="block-title">Goleadores del grupo<\/h2><\/div><p class="empty">La fuente de este grupo no publica goleadores\.<\/p>/);
  assert.match(render({ g: 'PG2' }, opts({ golPrebenj: [{ id: 'PG2', s: [] }] })), /<p class="empty">Todavía no hay goles registrados en este grupo\.<\/p>/);
  const past = render({ s: '2024-2025', g: 'P1' }, { datasets: datasetsFor({ golPrebenj: GOL_PG2, seasonRaw: { '2024-2025': pastSeasonRaw() } }) });
  assert.match(past, /<p class="empty">Esta web solo guarda los goleadores de la temporada actual\.<\/p>/);
});

test('procedencia: sourceInfo (datos) con «Ver fuente»; sin enlace si el grupo no lo trae', () => {
  const info = sourceInfo(pg2(), false);
  const out = render({ g: 'PG2' });
  assert.equal(info.kind, 'oficial');
  assert.match(out, new RegExp(`<p class="notice source-line">Clasificación oficial de ${info.source.replace(/\./g, '\\.')}\\. <a class="source-link" href="${info.url.replace(/[.?]/g, '\\$&')}" target="_blank" rel="noopener noreferrer">Ver fuente</a></p>`));
  assert.match(render({ g: 'PFV2' }), /<p class="notice source-line">Clasificación oficial\.<\/p>/);
  const raw = fixture('current-2025-2026');
  raw.prebenjamin.find(g => g.id === 'PG2').standingsKind = 'reconstructed';
  assert.match(text(render({ g: 'PG2' }, opts({ current: raw }))), /Clasificación calculada con los resultados de .+: puede no reflejar sanciones ni desempates de la federación\. Ver fuente/);
});

test('temporada pasada (P1 2024-25): la temporada en la etiqueta, forma del archivo y sin fila propia', () => {
  const out = render({ s: '2024-2025', g: 'P1', v: 'forma' }, { datasets: datasetsFor({ seasonRaw: { '2024-2025': pastSeasonRaw() } }) });
  assert.match(out, /<p class="screen-sub">Benjamín, Primera Fase, Grupo 1 · 2024\/25<\/p>/);
  assert.match(out, /<p class="block-context">jornada 9, final<\/p>/);
  const rows = bodyRows(out);
  assert.equal(rows.length, 10);
  assert.ok(rows.every(r => !r.mine));
  assert.match(rows[0].text, /^1 .*Moya 9 7 1 1 41 17 \+24 G G G G G 22$/);
  assert.match(rows[0].html, /href="#\/equipo\?s=2024-2025&amp;g=P1&amp;t=Moya"/);
  assert.match(out, /<p class="notice source-line">Clasificación oficial\. Archivo de la temporada 2024\/25\.<\/p>/);
  assert.match(out, /href="#\/ligas\?s=2024-2025&amp;c=benjamin&amp;i=grancanaria&amp;to=tabla"/);
});

test('temporada sin cargar, sin clasificación, grupo que no existe o vista desconocida: nunca en blanco', () => {
  const failed = render({ s: '2023-2024', g: 'P1' });
  assert.match(failed, /<h1>Tabla<\/h1>/);
  assert.match(text(failed), /No se pudieron cargar los datos de la temporada 2023\/24/);
  assert.match(failed, /data-action="retry"/);
  const raw = fixture('current-2025-2026');
  raw.prebenjamin.find(g => g.id === 'PG2').standings = [];
  const empty = render({ g: 'PG2' }, opts({ current: raw }));
  assert.match(empty, /<p class="empty">Clasificación sin publicar\.<\/p>/);
  assert.doesNotMatch(empty, /tabla-views/);
  assert.match(render({ g: 'ZZ9' }), /<h1>Tabla<\/h1>.*<p class="empty">No hay ningún grupo ZZ9 en la temporada 2025\/26\.<\/p>/);
  const odd = render({ g: 'PG2', v: 'xyz' });
  assert.deepEqual(active(nav(odd, 'narrow')), ['Puntos']);
  assert.match(odd, /<div class="box tabla-puntos">/);
  assert.deepEqual(active(nav(render({ g: 'PG2', v: 'todas' }), 'narrow')), ['Puntos'], 'un enlace de escritorio en el móvil');
});

test('J, G, E y P llevan su propia clase (para las vistas de móvil)', () => {
  const out = s(standingsTable([{ pos: 1, team: 'A', pts: 3, pj: 1, g: 1, e: 0, p: 0, gf: 2, gc: 1, dg: 1, retired: false }], { view: 'todas' }));
  for (const c of ['st-pj', 'st-g', 'st-e', 'st-p']) assert.match(out, new RegExp(`<td class="st-num ${c}">`), c);
});

test('CSS: columnas por vista solo por debajo de 1024 px; cada selector en su ancho; .segmented nunca se oculta', () => {
  const rules = cssRules();
  const narrow = (m) => m !== null && /max-width:\s*1023\.98px/.test(m);
  const wide = (m) => m !== null && /min-width:\s*1024px/.test(m);
  const hides = (sel, media) => rules.some(r => media(r.media) && r.selector.includes(sel) && /display:\s*none/.test(r.body));
  assert.ok(hides('.tabla-puntos .standings :is(.st-gf, .st-gc, .st-form)', narrow));
  assert.ok(hides('.tabla-goles .standings :is(.st-pj, .st-g, .st-e, .st-p, .st-form)', narrow));
  assert.ok(hides('.tabla-forma .standings :is(.st-g, .st-e, .st-p, .st-gf, .st-gc, .st-dg)', narrow));
  assert.ok(!rules.some(r => r.media === null && /tabla-(puntos|goles|forma)/.test(r.selector)), 'en escritorio, todas las columnas');
  assert.ok(hides('.tabla-views.is-wide', (m) => m === null));
  assert.ok(hides('.tabla-views.is-narrow', wide));
  assert.ok(!rules.some(r => /\.segment/.test(r.selector) && /display:\s*none/.test(r.body)));
  assert.match(rules.find(r => r.selector === '.block-link, .source-link').body, /min-height:\s*44px/);
  const dg = rules.find(r => wide(r.media) && r.selector === '[data-screen="tabla"] .standings .st-dg');
  assert.ok(dg && +dg.body.match(/width:\s*(\d+)px/)[1] >= 52, 'en escritorio, «−128» no toca la columna vecina');
  const used = new Set([render({ g: 'PG2' }), render({ g: 'PG2', v: 'casa' }), render({ g: 'PFV2' })].join('')
    .match(/class="[^"]+"/g).flatMap(m => m.slice(7, -1).split(/\s+/)));
  assert.deepEqual([...used].filter(c => !rules.classes.has(c)), []);
});
