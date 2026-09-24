// Plan B1, tarea 12: componentes de ui.js (spec §3.3, §3.5 y §8) sobre el HTML
// que producen. Los datos son copias literales de datos reales: la tabla final
// de PG2 2025-26, su jornada 30, la tanda de la Maspalomas Cup y nombres de la
// federación con comillas.
import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  crest, crestFallback, monogram, box, cells, matchRow, standingsTable,
  formChips, segmented, notice, empty, tabbar,
} from '../../src/ui.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const TODAY = '2026-09-23';

// Entradas reales de SHIELDS (data-shields.js, 23/09/2026).
const SHIELDS = {
  'Unión Viera': 'unionviera.png', 'Acodetti CF': 'acodetti.png', 'AD Huracán': 'huracan.png',
  'Las Mesas Hu.': 'lasMesasEscudo.png', 'UD Telde': 'udTeldeEscudo.png', 'CD Batán': 'batanEscudo.png',
  'Santa Brígida': 'villa.png', 'Jovero-Las Rosas': 'joveroLasRosas.jpg',
  'VICTORIA, REAL CLUB "B"': 'victoria2019.png', 'MESAS, U.D. LAS "B"': 'lasMesasEscudo.png',
};

// PG2 2025-26, clasificación final (data-prebenjamin.js), en la forma Row del modelo.
const ROW = (pos, team, pts, pj, g, e, p, gf, gc, dg, extra = {}) =>
  ({ pos, team, pts, pj, g, e, p, gf, gc, dg, retired: false, ...extra });
const PG2 = [
  ROW(1, 'Unión Viera', 79, 28, 26, 1, 1, 190, 36, 154, { form: ['G', 'G', 'P', 'G', 'G'] }),
  ROW(2, 'Acodetti', 78, 28, 26, 0, 2, 196, 57, 139, { form: ['G', 'G', 'G', 'G', 'G'] }),
  ROW(8, 'Telde', 40, 28, 13, 1, 14, 86, 98, -12, { form: ['P', 'G', 'G', 'P', 'G'] }),
  ROW(9, 'Las Mesas Hu.', 37, 28, 12, 1, 15, 90, 120, -30, { form: ['E', 'P', 'P', 'G', 'P'] }),
  ROW(15, 'CD Batán', 0, 28, 0, 0, 28, 0, 84, -84, { retired: true }),
];

// PG2, jornada 30 (data-history.js): [2026-06-02, Las Mesas Hu., AD Huracán, 2, 7, null, 17:30, null].
const J30 = { season: '2025-2026', groupId: 'PG2', roundKey: 'Jornada 30', dateISO: '2026-06-02',
  time: '17:30', venue: null, home: 'Las Mesas Hu.', away: 'AD Huracán', hs: 2, as: 7,
  advancer: null, shootout: null };
// Maspalomas Cup, Copa Plata, cuartos (MCPK1): ["27/06", "UD Las Mesas Huracán",
// "CF Unión Carrizal", 1, 1, "home", "10:00", "CD 4", "3-2"].
const CUARTOS = { season: '2025-2026', groupId: 'MCPK1', roundKey: 'Cuartos', dateISO: '2026-06-27',
  time: '10:00', venue: 'CD 4', home: 'UD Las Mesas Huracán', away: 'CF Unión Carrizal', hs: 1, as: 1,
  advancer: 'home', shootout: '3-2' };

const s = (h) => String(h);
// Texto visible: sin etiquetas (y con ellas, sin atributos) y con las entidades básicas resueltas.
const text = (h) => s(h).replace(/<[^>]*>/g, ' ')
  .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
const headers = (h) => [...s(h).matchAll(/<th scope="col"[^>]*>(.*?)<\/th>/g)].map(m => m[1].replace(/<[^>]*>/g, ''));

test('crest: miniatura escudos/s/<fichero>.png, original en data-full y atributos de carga', () => {
  const img = s(crest('Las Mesas Hu.', { shields: SHIELDS }));
  assert.equal(img, '<img class="crest crest-16" src="./escudos/s/lasMesasEscudo.png"'
    + ' data-full="./escudos/lasMesasEscudo.png" data-name="Las Mesas Hu." alt=""'
    + ' width="16" height="16" loading="lazy" decoding="async">');
  const grande = s(crest('AD Huracán', { size: 46, shields: SHIELDS, lazy: false }));
  assert.match(grande, /class="crest crest-46"/);
  assert.match(grande, /width="46" height="46"/);
  assert.doesNotMatch(grande, /loading=/, 'la primera pantalla no se carga en diferido');
  assert.match(grande, /decoding="async"/);
});

test('crest: un original .jpg tiene miniatura .png y conserva su extensión en data-full', () => {
  const img = s(crest('Jovero-Las Rosas', { shields: SHIELDS }));
  assert.match(img, /src="\.\/escudos\/s\/joveroLasRosas\.png"/);
  assert.match(img, /data-full="\.\/escudos\/joveroLasRosas\.jpg"/);
});

test('crest: sin entrada exacta usa la normalizada (Acodetti → «Acodetti CF», Telde → «UD Telde»)', () => {
  assert.match(s(crest('Acodetti', { shields: SHIELDS })), /src="\.\/escudos\/s\/acodetti\.png"/);
  assert.match(s(crest('Telde', { shields: SHIELDS })), /src="\.\/escudos\/s\/udTeldeEscudo\.png"/);
});

test('crest: nombres con comillas quedan escapados en los atributos', () => {
  const img = s(crest('VICTORIA, REAL CLUB "B"', { size: 32, shields: SHIELDS }));
  assert.match(img, /data-name="VICTORIA, REAL CLUB &quot;B&quot;"/);
  assert.match(img, /src="\.\/escudos\/s\/victoria2019\.png"/);
  assert.doesNotMatch(img, /CLUB "B"/);
  const mesas = s(crest('MESAS, U.D. LAS "B"', { shields: SHIELDS }));
  assert.match(mesas, /data-name="MESAS, U\.D\. LAS &quot;B&quot;"/);
  assert.match(mesas, /src="\.\/escudos\/s\/lasMesasEscudo\.png"/);
});

test('crest: sin escudo, monograma del mismo tamaño; tamaños fuera de 16/32/46 se rechazan', () => {
  // «Femarguín» no tiene escudo en SHIELDS.
  assert.equal(s(crest('Femarguín', { size: 46, shields: SHIELDS })),
    '<span class="mono mono-46" aria-hidden="true">FE</span>');
  assert.equal(s(crest('Femarguín')), '<span class="mono mono-16" aria-hidden="true">FE</span>');
  assert.throws(() => crest('Telde', { size: 20, shields: SHIELDS }), RangeError);
  assert.throws(() => monogram('Telde', 24), RangeError);
});

test('monogram: dos iniciales sin siglas de club ni puntuación', () => {
  const ini = (n) => s(monogram(n)).replace(/<[^>]*>/g, '');
  assert.equal(ini('Las Mesas Hu.'), 'LM');
  assert.equal(ini('Acodetti'), 'AC');
  assert.equal(ini('CD Batán'), 'BA');
  assert.equal(ini('Atco. Fomento'), 'FO');
  assert.equal(ini('VICTORIA, REAL CLUB "B"'), 'VB');
  assert.equal(ini('MESAS, U.D. LAS "B"'), 'ML');
  assert.equal(ini('Pto.del Carmen'), 'PC');
  assert.equal(ini('Unión Viera'), 'UV');
  assert.equal(s(monogram('Las Mesas Hu.', 32)), '<span class="mono mono-32" aria-hidden="true">LM</span>');
});

test('crestFallback: miniatura → original → monograma', () => {
  const attrs = { class: 'crest crest-32', src: './escudos/s/huracan.png', 'data-full': './escudos/huracan.png',
    'data-name': 'AD Huracán', width: '32' };
  const img = {
    tagName: 'IMG',
    classList: { contains: (c) => attrs.class.split(' ').includes(c) },
    getAttribute: (k) => attrs[k] ?? null,
    setAttribute: (k, v) => { attrs[k] = String(v); },
    set outerHTML(v) { this.replacedBy = v; },
  };
  assert.equal(crestFallback(img), 'full');
  assert.equal(attrs.src, './escudos/huracan.png');
  assert.equal(crestFallback(img), 'mono');
  assert.equal(img.replacedBy, '<span class="mono mono-32" aria-hidden="true">HU</span>');
  assert.equal(crestFallback({ tagName: 'IMG', classList: { contains: () => false } }), null);
  assert.equal(crestFallback(null), null);
});

test('box: título en h2, contexto a la derecha y contenido Html sin reescapar', () => {
  const out = s(box(cells([{ label: 'Jornada', value: 1 }]), { title: 'Próximo partido', context: 'faltan 3 días' }));
  assert.match(out, /^<section class="block"><div class="block-head"><h2 class="block-title">Próximo partido<\/h2><p class="block-context">faltan 3 días<\/p><\/div><div class="box"><dl class="cells cells-1">/);
  assert.equal(s(box('a < b')), '<div class="box">a &lt; b</div>');
  assert.doesNotMatch(s(box('x', { title: 'Tabla' })), /block-context/);
});

test('cells: dl con etiqueta y dato, el 0 se pinta y el dato apagado lleva su clase', () => {
  const out = s(cells([{ label: 'Posición', value: '9º de 15' }, { label: 'Puntos', value: 37 },
    { label: 'Empates', value: 0 }]));
  assert.equal(out, '<dl class="cells cells-3">'
    + '<div class="cell"><dt class="cell-label">Posición</dt><dd class="cell-value">9º de 15</dd></div>'
    + '<div class="cell"><dt class="cell-label">Puntos</dt><dd class="cell-value">37</dd></div>'
    + '<div class="cell"><dt class="cell-label">Empates</dt><dd class="cell-value">0</dd></div></dl>');
  assert.match(s(cells([{ label: 'Campo', value: 'no publicado', muted: true }, { label: 'Hora', value: '17:30' }])),
    /^<dl class="cells cells-2"><div class="cell is-muted">/);
  assert.match(s(cells([1, 2, 3, 4].map(n => ({ label: 'x', value: n })))), /cells-2/);
  assert.match(s(cells([1, 2, 3, 4, 5, 6].map(n => ({ label: 'x', value: n })))), /cells-3/);
  assert.equal(s(cells([])), '');
});

test('matchRow: partido jugado propio, con resalte, marcador y enlace escapado', () => {
  const out = s(matchRow(J30, { mine: true, today: TODAY, shields: SHIELDS,
    href: '#/partido?s=2025-2026&g=PG2&r=Jornada 30&h=Las Mesas Hu.&a=AD Huracán' }));
  assert.match(out, /^<a class="match-row is-mine" href="#\/partido\?s=2025-2026&amp;g=PG2&amp;r=Jornada 30&amp;h=Las Mesas Hu\.&amp;a=AD Huracán">/);
  assert.match(out, /<span class="vh">Partido de mi equipo\. <\/span>/);
  assert.match(out, /<span class="match-time">17:30<\/span>/);
  assert.match(out, /<span class="match-team match-home"><span class="match-name">Las Mesas Hu\.<\/span><img class="crest crest-16" src="\.\/escudos\/s\/lasMesasEscudo\.png"/);
  assert.match(out, /<span class="match-score">2–7<\/span>/);
  assert.match(out, /<span class="match-team match-away"><img class="crest crest-16" src="\.\/escudos\/s\/huracan\.png"[^>]*><span class="match-name">AD Huracán<\/span><\/span>/);
  assert.doesNotMatch(out, /match-note/);
  const ajeno = s(matchRow(J30, { today: TODAY, shields: SHIELDS }));
  assert.match(ajeno, /^<div class="match-row">/);
  assert.doesNotMatch(ajeno, /is-mine|vh/);
});

test('matchRow: sin marcador enseña el estado (pendiente, sin resultado, sin fecha)', () => {
  const base = { ...J30, hs: null, as: null };
  const pendiente = s(matchRow({ ...base, dateISO: '2026-10-04', time: '10:30' }, { today: TODAY }));
  assert.match(pendiente, /<span class="match-score is-pending">–<\/span>/);
  assert.doesNotMatch(pendiente, /match-note/);
  assert.match(s(matchRow(base, { today: TODAY })), /<span class="match-note">sin resultado<\/span>/);
  const sinFecha = s(matchRow({ ...base, dateISO: null, time: null }, { today: TODAY }));
  assert.match(sinFecha, /<span class="match-time"><\/span>/);
  assert.match(sinFecha, /<span class="match-note">sin fecha<\/span>/);
  assert.throws(() => matchRow(J30, {}), TypeError, 'today se inyecta siempre');
});

test('matchRow: eliminatoria empatada dice quién pasó por penaltis y la tanda', () => {
  const out = s(matchRow(CUARTOS, { today: TODAY }));
  assert.match(out, /<span class="match-score">1–1<\/span>/);
  assert.match(out, /<span class="match-note">UD Las Mesas Huracán pasó por penaltis \(3–2\)<\/span>/);
});

test('standingsTable: columnas por vista, con #, Equipo y Pts siempre', () => {
  const cols = {
    puntos: ['#', 'Equipo', 'J', 'G', 'E', 'P', 'DG', 'Pts'],
    goles: ['#', 'Equipo', 'GF', 'GC', 'DG', 'Pts'],
    forma: ['#', 'Equipo', 'J', 'Últimos 5', 'Pts'],
    casa: ['#', 'Equipo', 'J', 'G', 'E', 'P', 'Pts'],
    fuera: ['#', 'Equipo', 'J', 'G', 'E', 'P', 'Pts'],
    todas: ['#', 'Equipo', 'J', 'G', 'E', 'P', 'GF', 'GC', 'DG', 'Últimos 5', 'Pts'],
  };
  for (const [view, expected] of Object.entries(cols)) {
    const out = standingsTable(PG2, { view });
    assert.deepEqual(headers(out), expected, view);
    const first = s(out).match(/<tbody><tr>(.*?)<\/tr>/)[1];
    assert.equal((first.match(/<t[dh][ >]/g) || []).length, expected.length, `${view}: celdas por fila`);
  }
  assert.deepEqual(headers(standingsTable(PG2, { view: 'inventada' })), cols.puntos, 'vista desconocida → puntos');
  assert.deepEqual(headers(standingsTable(PG2)), cols.puntos, 'puntos por defecto');
});

test('standingsTable: th con scope, caption oculto, abreviaturas explicadas y DG con signo', () => {
  const out = s(standingsTable(PG2, { caption: 'Clasificación del Grupo 2 de Gran Canaria' }));
  assert.match(out, /^<table class="standings"><caption class="vh">Clasificación del Grupo 2 de Gran Canaria<\/caption><thead><tr>/);
  assert.match(s(standingsTable(PG2)), /<caption class="vh">Clasificación<\/caption>/);
  assert.equal((out.match(/<th scope="row" class="st-team">/g) || []).length, PG2.length);
  assert.match(out, /<th scope="col" class="st-num"><abbr title="Partidos jugados">J<\/abbr><\/th>/);
  assert.match(out, /<th scope="col" class="st-pts"><abbr title="Puntos">Pts<\/abbr><\/th>/);
  assert.match(out, /<td class="st-dg">\+154<\/td>/);
  assert.match(out, /<td class="st-dg">−30<\/td>/, 'signo menos tipográfico (U+2212)');
  assert.match(out, /<td class="st-pts">37<\/td>/);
});

test('standingsTable: fila propia con clase y texto para lectores; enlaces escapados', () => {
  const out = s(standingsTable(PG2, { mine: 'Las Mesas Hu.', shields: SHIELDS,
    hrefFor: (r) => `#/equipo?g=PG2&t=${encodeURIComponent(r.team)}` }));
  const mias = [...out.matchAll(/<tr class="is-mine">(.*?)<\/tr>/g)];
  assert.equal(mias.length, 1);
  assert.match(mias[0][1], /^<td class="st-pos">9<\/td><th scope="row" class="st-team"><a class="st-link" href="#\/equipo\?g=PG2&amp;t=Las%20Mesas%20Hu\.">/);
  assert.match(mias[0][1], /<span class="vh"> \(mi equipo\)<\/span><\/th>/);
  assert.equal((out.match(/\(mi equipo\)/g) || []).length, 1);
  assert.match(s(standingsTable(PG2)), /<span class="st-label"><span class="mono mono-16" aria-hidden="true">UV<\/span><span class="st-name">Unión Viera<\/span><\/span>/);
});

test('standingsTable: vista Forma con fichas y «retirado» para los retirados', () => {
  const out = s(standingsTable(PG2, { view: 'forma' }));
  assert.match(out, /<td class="st-form"><span class="form"><span class="form-chip form-e">E<\/span><span class="form-chip form-p">P<\/span>/);
  assert.match(out, /<td class="st-form"><span class="st-retired">retirado<\/span><\/td>/);
});

test('standingsTable: los nombres con comillas no rompen el marcado', () => {
  const out = s(standingsTable([ROW(1, 'VICTORIA, REAL CLUB "B"', 3, 1, 1, 0, 0, 5, 1, 4),
    ROW(2, 'MESAS, U.D. LAS "B"', 0, 1, 0, 0, 1, 1, 5, -4)],
  { mine: 'MESAS, U.D. LAS "B"', shields: SHIELDS, hrefFor: (r) => `#/equipo?t=${r.team}` }));
  assert.match(out, /<span class="st-name">VICTORIA, REAL CLUB &quot;B&quot;<\/span>/);
  assert.match(out, /href="#\/equipo\?t=MESAS, U\.D\. LAS &quot;B&quot;"/);
  assert.doesNotMatch(out, /CLUB "B"|LAS "B"/);
  assert.equal((out.match(/<tr class="is-mine">/g) || []).length, 1);
  assert.match(out, /<tr class="is-mine"><td class="st-pos">2<\/td>/);
});

test('formChips: G, E y P con su clase; cualquier otra letra se rechaza', () => {
  assert.equal(s(formChips(['G', 'E', 'P'])), '<span class="form">'
    + '<span class="form-chip form-g">G</span><span class="form-chip form-e">E</span>'
    + '<span class="form-chip form-p">P</span></span>');
  assert.equal(s(formChips([])), '<span class="form"></span>');
  for (const bad of ['W', 'D', 'L', 'g', '']) assert.throws(() => formChips([bad]), RangeError, bad);
});

test('segmented: enlaces y aria-current="true" solo en el activo', () => {
  const opts = [{ value: 'puntos', label: 'Puntos' }, { value: 'forma', label: 'Forma' }];
  const out = s(segmented(opts, 'forma', (v) => `#/tabla?g=PG2&v=${v}`));
  assert.equal(out, '<div class="segmented">'
    + '<a class="segment" href="#/tabla?g=PG2&amp;v=puntos">Puntos</a>'
    + '<a class="segment" href="#/tabla?g=PG2&amp;v=forma" aria-current="true">Forma</a></div>');
});

test('notice y empty', () => {
  assert.equal(s(notice('Sin partido en esta jornada:', 'RC Victoria y Arucas B (descansa o le tocaba contra CD Batán)')),
    '<p class="notice"><b>Sin partido en esta jornada:</b> RC Victoria y Arucas B (descansa o le tocaba contra CD Batán)</p>');
  assert.equal(s(notice('', 'Faltan 2 partidos de esta jornada en la fuente')),
    '<p class="notice">Faltan 2 partidos de esta jornada en la fuente</p>');
  assert.equal(s(empty('Aún no se ha jugado ninguna jornada')),
    '<p class="empty">Aún no se ha jugado ninguna jornada</p>');
});

test('tabbar: 4 destinos, iconos SVG ocultos al lector y aria-current solo en el activo', () => {
  const out = s(tabbar('tabla'));
  assert.match(out, /^<nav class="tabbar" aria-label="Navegación principal">/);
  const tabs = [...out.matchAll(/<a class="tab" href="([^"]*)"( aria-current="page")?>.*?<span class="tab-label">(.*?)<\/span><\/a>/g)]
    .map(m => [m[1], m[3], Boolean(m[2])]);
  assert.deepEqual(tabs, [['#/', 'Mi equipo', false], ['#/jornada', 'Jornada', false],
    ['#/tabla', 'Tabla', true], ['#/explorar', 'Explorar', false]]);
  assert.equal((out.match(/<svg [^>]*aria-hidden="true" focusable="false"/g) || []).length, 4);
  assert.equal((out.match(/aria-current/g) || []).length, 1);
  assert.match(s(tabbar('explorar', { current: 'true' })), /href="#\/explorar" aria-current="true"/);
  assert.doesNotMatch(s(tabbar(null)), /aria-current/);
  assert.throws(() => tabbar('partido'), RangeError);
});

test('ni inglés ni emoji: Local/Visitante y G/E/P, nunca HOME, AWAY ni W/D/L', () => {
  const all = [
    crest('Las Mesas Hu.', { shields: SHIELDS }), monogram('Telde'),
    box(cells([{ label: 'Jornada', value: 30 }]), { title: 'Resultado', context: 'final' }),
    matchRow(J30, { mine: true, today: TODAY, shields: SHIELDS, href: '#/partido' }),
    matchRow(CUARTOS, { today: TODAY }),
    ...['puntos', 'goles', 'forma', 'casa', 'fuera', 'todas'].map(view =>
      standingsTable(PG2, { view, mine: 'Las Mesas Hu.', shields: SHIELDS, hrefFor: () => '#/equipo' })),
    formChips(['G', 'E', 'P']), segmented([{ value: 'a', label: 'Puntos' }], 'a', () => '#/tabla'),
    notice('Aviso:', 'texto'), empty('vacío'), tabbar('miequipo'),
  ].map(String).join('\n');
  assert.doesNotMatch(text(all), /\b(HOME|AWAY|Home|Away|home|away)\b/);
  assert.doesNotMatch(text(all), /(^|[^\p{L}])[WDL]([^\p{L}]|$)/u);
  assert.doesNotMatch(all, /\p{Extended_Pictographic}/u);
});

test('cada clase que emite ui.js existe en style-acta.css', () => {
  const css = readFileSync(join(ROOT, 'style-acta.css'), 'utf8');
  const defined = new Set([...css.replace(/\/\*[\s\S]*?\*\//g, '').matchAll(/\.([a-zA-Z][\w-]*)/g)].map(m => m[1]));
  const out = [
    crest('Las Mesas Hu.', { shields: SHIELDS }), crest('Femarguín', { size: 32 }), crest('x', { size: 46 }),
    box(cells([{ label: 'a', value: 1, muted: true }, { label: 'b', value: 2 }, { label: 'c', value: 3 },
      { label: 'd', value: 4 }, { label: 'e', value: 5 }]), { title: 't', context: 'c' }),
    cells([{ label: 'a', value: 1 }]), cells([{ label: 'a', value: 1 }, { label: 'b', value: 2 }]),
    cells([{ label: 'a', value: 1 }, { label: 'b', value: 2 }, { label: 'c', value: 3 }]),
    matchRow({ ...J30, hs: null, as: null }, { mine: true, today: TODAY, shields: SHIELDS, href: '#' }),
    matchRow(CUARTOS, { today: TODAY }),
    standingsTable(PG2, { view: 'todas', mine: 'Las Mesas Hu.', shields: SHIELDS, hrefFor: () => '#' }),
    standingsTable(PG2, { view: 'forma' }),
    segmented([{ value: 'a', label: 'A' }], 'a', () => '#'), notice('t', 'x'), empty('x'), tabbar('jornada'),
  ].map(String).join('');
  const used = new Set([...out.matchAll(/class="([^"]+)"/g)].flatMap(m => m[1].split(/\s+/)));
  assert.deepEqual([...used].filter(c => !defined.has(c)), []);
});
