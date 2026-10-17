// El pronóstico en la web (17/10/2026): la línea discreta bajo cada partido sin jugar de la Jornada (y de
// «Todos los grupos») con su nota, el bloque «Pronóstico» de la pantalla Partido y la línea del próximo
// partido de Mi equipo; solo en prebenjamín de la temporada del portal. render(ctx) es pura: se prueba
// sobre el HTML, con las fixtures congeladas (la temporada del portal es 2025-26) y `today` inyectado,
// como las demás pantallas. El modelo (src/pronostico.js) tiene sus pruebas en test_pronostico.mjs; aquí,
// lo que se pinta y dónde no se pinta nada: benjamín, alevín, lo jugado, lo de un retirado, las
// jornadas con menos de dos jugadas, un equipo que aún no ha jugado y lo que va más allá de la próxima
// jornada (revisión del 17/10/2026).
import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { fixture } from './fixtures/rediseno/load.mjs';
import { currentAt, alevinRaw } from './fixtures/rediseno/simulate.mjs';
import { ctxFor, datasetsFor, cssRules, PORTAL_SEASON } from './fixtures/rediseno/screens.mjs';
import { screen as jornada } from '../../src/screen-jornada.js';
import { screen as partido } from '../../src/screen-partido.js';
import { screen as home } from '../../src/screen-home.js';
import { findRound } from '../../src/model.js';
import { alevinData } from '../../src/state.js';
import { forecastLine, forecastNote, forecastOptions, matchRow, oddsBar, percent } from '../../src/ui.js';
import { forecastMatch, forecastRound, horizonOf, outcome, topScores } from '../../src/pronostico.js';

const s = (h) => String(h);
// Texto visible y oído: sin etiquetas, con las entidades básicas resueltas y los espacios juntos (también
// el de no separación del «72 %»).
const text = (h) => s(h).replace(/<[^>]*>/g, ' ').replace(/&quot;/g, '"').replace(/&#39;/g, "'")
  .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim();
// Lo que se ve: sin el texto para el lector de pantalla (.vh).
const seen = (h) => text(s(h).replace(/<span class="vh">[^<]*<\/span>/g, ''));

// El 20/10/2025, PG2 (prebenjamín) y FF5 y FF9 (benjamín) llevan dos jornadas jugadas y la 3 por jugar.
const TODAY = '2025-10-20';
const at = (today = TODAY, current = currentAt(today), extra = {}) => ({ today, datasets: { ...datasetsFor({ current }), ...extra } });
const ctxOf = (screen, params, opts = at()) => ctxFor(screen, { s: PORTAL_SEASON, ...params }, opts);
const renderJornada = (params, opts) => s(jornada.render(ctxOf('jornada', params, opts)));
const renderPartido = (params, opts) => s(partido.render(ctxOf('partido', params, opts)));
const rows = (out) => [...out.matchAll(/<a class="match-row[^"]*" href="[^"]*">(.*?)<\/a>/g)].map((m) => m[1]);
const lines = (out) => [...out.matchAll(/<span class="match-forecast">(.*?<\/span>)<\/span>/g)].map((m) => m[1]);
const notes = (out) => [...out.matchAll(/<p class="notice">(.*?)<\/p>/g)].map((m) => text(m[1]));
const MESAS_J3 = { g: 'PG2', r: 'Jornada 3', h: 'Las Mesas Hu.', a: 'Veteranos' };

// El pronóstico que pinta la web para un partido: el de forecastMatch con las opciones de la web.
function expected(params, opts = at()) {
  const ctx = ctxOf('partido', params, opts);
  const group = ctx.model.group(PORTAL_SEASON, params.g);
  const match = findRound(group, params.r).matches.find((m) => m.home === params.h && m.away === params.a);
  return forecastMatch(group, match, forecastOptions(ctx));
}

// ── Componentes (ui.js) ─────────────────────────────────────────────────

const PENDING = { home: 'Moya', away: 'UD Atalaya', hs: null, as: null, dateISO: '2026-10-23', time: '17:30', roundKey: 'Jornada 3' };
const GUESS = { home: 'Moya', away: 'UD Atalaya', pHome: 0.83, pDraw: 0.07, pAway: 0.1, pick: 'home', score: [6, 2], rounds: 2, matches: 9 };

test('percent: entero con espacio de no separación; nunca 0 % ni 100 %', () => {
  assert.equal(percent(0.72), '72 %');
  assert.equal(percent(0.004), '<1 %');
  assert.equal(percent(0.996), '>99 %');
  assert.equal(percent(0.995), '>99 %');
  assert.equal(percent(0.01), '1 %');
});

test('forecastLine: «Pronóstico 6–2 · Moya 83 %» a la vista y, para el lector de pantalla, que no es un resultado', () => {
  const line = s(forecastLine(GUESS));
  assert.match(line, /^<span class="match-forecast"><span aria-hidden="true">Pronóstico 6–2 · Moya 83 %<\/span><span class="vh">Pronóstico, no es un resultado: lo más probable, 6 a 2; favorito, Moya, con un 83 %\.<\/span><\/span>$/);
  // El visitante, con su nombre corto (sin el «UD»), y el empate.
  assert.equal(seen(forecastLine({ ...GUESS, pick: 'away', score: [2, 5], pAway: 0.6 })), 'Pronóstico 2–5 · Atalaya 60 %');
  assert.equal(seen(forecastLine({ ...GUESS, pick: 'draw', score: [4, 4], pDraw: 0.41 })), 'Pronóstico 4–4 · empate 41 %');
  assert.match(text(forecastLine({ ...GUESS, pick: 'draw', score: [4, 4], pDraw: 0.41 })), /no es un resultado: lo más probable, empate a 4, con un 41 %\.$/);
  assert.equal(s(forecastLine(null)), '');
  assert.match(s(forecastLine(GUESS, 'fixture-forecast')), /^<span class="fixture-forecast">/);
});

test('matchRow: el pronóstico va debajo, nunca en la casilla del marcador; jugado o sin pronóstico, la fila de siempre', () => {
  const row = s(matchRow(PENDING, { today: '2026-10-17', href: '#', forecast: GUESS }));
  assert.match(row, /<span class="match-score is-pending">–<\/span><span class="match-team match-away">.*<\/span><span class="match-forecast">/);
  assert.equal((row.match(/class="match-score[^"]*">([^<]*)</) || [])[1], '–', 'el marcador sigue con su raya');
  assert.equal(s(matchRow(PENDING, { today: '2026-10-17', href: '#', forecast: null })), s(matchRow(PENDING, { today: '2026-10-17', href: '#' })));
  const played = { ...PENDING, hs: 4, as: 1 };
  assert.equal(s(matchRow(played, { today: '2026-10-25', href: '#', forecast: GUESS })), s(matchRow(played, { today: '2026-10-25', href: '#' })));
  assert.doesNotMatch(s(matchRow(played, { today: '2026-10-25', forecast: GUESS })), /forecast|Pronóstico/);
});

test('forecastNote: de dónde sale, una vez y en partidos (no en jornadas, que pueden ir a medias); sin pronósticos, nada', () => {
  assert.equal(s(forecastNote([null, null])), '');
  assert.equal(text(forecastNote([null, GUESS, GUESS])), 'Pronóstico: estimación según los 9 partidos jugados en el grupo; no es un resultado.');
  assert.equal(text(forecastNote([GUESS, { ...GUESS, matches: 11 }])), 'Pronóstico: estimación según los partidos jugados en el grupo; no es un resultado.');
  assert.equal(text(forecastNote([GUESS], { each: true })), 'Pronóstico: estimación según los partidos jugados en cada grupo; no es un resultado.');
  assert.doesNotMatch(text(forecastNote([GUESS])), /jornada/);
});

test('oddsBar: tres tramos sólidos en milésimas enteras que suman 1000, decorativa y sin discontinuas', () => {
  const bar = s(oddsBar(0.8312, 0.0701, 0.0987));
  assert.match(bar, /^<svg class="odds-bar" viewBox="0 0 1000 10" preserveAspectRatio="none" aria-hidden="true" focusable="false">/);
  const widths = [...bar.matchAll(/<rect class="odds-(home|draw|away)" x="(\d+)" y="0" width="(\d+)"/g)].map((m) => [m[1], Number(m[2]), Number(m[3])]);
  assert.deepEqual(widths, [['home', 0, 831], ['draw', 831, 70], ['away', 901, 99]]);
  assert.doesNotMatch(bar, /dash/);
});

// ── Jornada ─────────────────────────────────────────────────────────────

test('Jornada de prebenjamín (PG2, jornada 3): cada partido sin jugar con su línea, el marcador en «–» y la nota de los partidos jugados', () => {
  const out = renderJornada({ g: 'PG2', r: 'Jornada 3' });
  const list = rows(out);
  assert.equal(list.length, 6);
  assert.equal(lines(out).length, 6, 'todos llevan pronóstico');
  for (const row of list) {
    assert.match(row, /<span class="match-score is-pending">–<\/span>/);
    assert.match(row, /<span class="match-forecast"><span aria-hidden="true">Pronóstico \d+–\d+ · [^<]+ \d+ %<\/span><span class="vh">Pronóstico, no es un resultado: /);
  }
  // La de Las Mesas, la de forecastMatch: su marcador, su favorito y su probabilidad.
  const f = expected(MESAS_J3);
  assert.equal(f.pick, 'away');
  assert.ok(f.score[0] < f.score[1]);
  assert.ok(seen(list[0]).endsWith(`Pronóstico ${f.score[0]}–${f.score[1]} · Veteranos ${Math.round(f.pAway * 100)} %`), seen(list[0]));
  assert.ok(notes(out).includes(`Pronóstico: estimación según los ${f.matches} partidos jugados en el grupo; no es un resultado.`), notes(out).join(' | '));
  // La nota, tras el aviso de la jornada y antes de la botonera.
  assert.match(out, /<p class="notice"><b>Sin partido en esta jornada:<\/b>[^]*<p class="notice"><b>Pronóstico:<\/b>[^]*data-action="share-round"/);
});

test('Jornada: nada en lo jugado ni antes de dos jornadas jugadas', () => {
  const played = renderJornada({ g: 'PG2', r: 'Jornada 1' });
  assert.equal(rows(played).length, 7);
  assert.doesNotMatch(played, /match-forecast|Pronóstico/);
  // El 12/10/2025, con la jornada 1 a medias, la 3 todavía no tiene pronóstico.
  const early = renderJornada({ g: 'PG2', r: 'Jornada 3' }, at('2025-10-12'));
  assert.equal(rows(early).length, 6);
  assert.doesNotMatch(early, /match-forecast|Pronóstico/);
  // El 18/10, la 2 a medias: sus partidos sin jugar, sin pronóstico (solo cuenta la 1, la de antes).
  const half = renderJornada({ g: 'PG2', r: 'Jornada 2' }, at('2025-10-18'));
  assert.ok(half.includes('match-score is-pending'));
  assert.doesNotMatch(half, /match-forecast|Pronóstico/);
});

test('solo la próxima jornada: el 20/10/2025, la 3 de PG2 sí; la 4, la 10 y la última, nada; Partido de una de ellas, sin bloque', () => {
  const ctx = ctxOf('jornada', { g: 'PG2' });
  const group = ctx.model.group(PORTAL_SEASON, 'PG2');
  assert.equal(horizonOf(group, TODAY), '2025-10-29', 'seis días después del primero de la 3 (el 23)');
  assert.equal(lines(renderJornada({ g: 'PG2', r: 'Jornada 3' })).length, 6);
  const last = group.rounds[group.rounds.length - 1].key;
  for (const r of ['Jornada 4', 'Jornada 10', last]) {
    const out = renderJornada({ g: 'PG2', r });
    assert.ok(rows(out).length > 0 && out.includes('match-score is-pending'), r);
    assert.doesNotMatch(out, /match-forecast|Pronóstico/, r);
    assert.ok(forecastRound(group, findRound(group, r), forecastOptions(ctx)).every((f) => f === null), r);
  }
  const far = findRound(group, last).matches[0];
  const out = renderPartido({ g: 'PG2', r: last, h: far.home, a: far.away });
  assert.match(out, /pt-score is-pending/);
  assert.equal(blockOf(out, 'Pronóstico'), null);
  // «Todos los grupos» de la jornada 4: tampoco.
  assert.doesNotMatch(renderJornada({ c: 'prebenjamin', f: 'grancanaria', r: '4' }), /match-forecast|Pronóstico/);
});

test('Jornada de benjamín y de alevín: ningún pronóstico, aunque lleven dos jornadas jugadas', () => {
  for (const g of ['FF5', 'FF9']) {
    const out = renderJornada({ g, r: 'Jornada 3' });
    assert.ok(rows(out).length > 0 && out.includes('match-score is-pending'), g);
    assert.doesNotMatch(out, /match-forecast|Pronóstico/, g);
    // El mismo grupo como si fuera de prebenjamín sí lo tendría: lo que lo quita es la categoría.
    const ctx = ctxOf('jornada', { g, r: 'Jornada 3' });
    const group = ctx.model.group(PORTAL_SEASON, g);
    const round = findRound(group, 'Jornada 3');
    assert.ok(forecastRound({ ...group, cat: 'prebenjamin' }, round, forecastOptions(ctx)).some(Boolean), g);
    assert.ok(forecastRound(group, round, forecastOptions(ctx)).every((f) => f === null), g);
  }
  // Alevín (AL1, contrato común de alevín): el 15/10/2025, con tres jornadas jugadas y la 4 por jugar.
  const alevin = at('2025-10-15', currentAt('2025-10-15'), { alevin: alevinData(alevinRaw({ season: PORTAL_SEASON, today: '2025-10-15' })) });
  const out = renderJornada({ g: 'AL1', r: 'Jornada 4' }, alevin);
  assert.ok(rows(out).length > 0 && out.includes('match-score is-pending'));
  assert.doesNotMatch(out, /match-forecast|Pronóstico/);
});

test('«Todos los grupos»: en prebenjamín, la línea en cada partido y una sola nota; en benjamín, nada', () => {
  const out = renderJornada({ c: 'prebenjamin', f: 'grancanaria', r: '3' });
  assert.match(out, /id="jornada-PG2"/);
  assert.equal(lines(out).length, rows(out).length);
  assert.ok(lines(out).length >= 12, String(lines(out).length));
  const forecasts = notes(out).filter((n) => n.startsWith('Pronóstico:'));
  assert.deepEqual(forecasts, ['Pronóstico: estimación según los partidos jugados en cada grupo; no es un resultado.']);
  const benj = renderJornada({ c: 'benjamin', f: 'primera-fase', r: '3' });
  assert.ok(rows(benj).length > 0);
  assert.doesNotMatch(benj, /match-forecast|Pronóstico/);
});

test('un retirado no tiene pronóstico ni cambia los de los demás', () => {
  // «Equipo Retirado», fuera de la clasificación y con dos derrotas por 0-3, como lo deja la federación,
  // y su partido de la jornada 3 sin jugar (retiredTeams).
  const raw = currentAt(TODAY);
  raw.history.PG2['Jornada 1'].push(['2025-10-11', 'Equipo Retirado', 'CD Calero', 0, 3, null, '10:00', null]);
  raw.history.PG2['Jornada 2'].push(['2025-10-18', 'AD Huracán', 'Equipo Retirado', 3, 0, null, '10:00', null]);
  raw.history.PG2['Jornada 3'].push(['2025-10-25', 'Equipo Retirado', 'Gran Canaria', null, null, null, '10:00', null]);
  const opts = at(TODAY, raw);
  const out = renderJornada({ g: 'PG2', r: 'Jornada 3' }, opts);
  assert.ok(rows(out).every((row) => !row.includes('Equipo Retirado')), 'la Jornada no pinta los partidos de un retirado');
  assert.match(out, /le tocaba contra CD Batán o Equipo Retirado/, 'el aviso de la jornada sí lo nombra');
  assert.deepEqual(lines(out), lines(renderJornada({ g: 'PG2', r: 'Jornada 3' })), 'los demás, como si no existiera');
  assert.equal(expected({ g: 'PG2', r: 'Jornada 3', h: 'Equipo Retirado', a: 'Gran Canaria' }, opts), null);
  assert.equal(blockOf(renderPartido({ g: 'PG2', r: 'Jornada 3', h: 'Equipo Retirado', a: 'Gran Canaria' }, opts), 'Pronóstico'), null);
});

// ── Partido ─────────────────────────────────────────────────────────────

// El bloque <section class="block"> con ese título, o null.
function blockOf(out, title) {
  const at = out.indexOf(`<h2 class="block-title">${title}</h2>`);
  if (at < 0) return null;
  const start = out.lastIndexOf('<section class="block"', at);
  return out.slice(start, out.indexOf('</section>', at) + '</section>'.length);
}

test('Partido sin jugar de prebenjamín: el bloque «Pronóstico» bajo el resultado, con el 1X2, el más probable y otros dos', () => {
  const out = renderPartido(MESAS_J3);
  const f = expected(MESAS_J3);
  const block = blockOf(out, 'Pronóstico');
  assert.ok(block, 'hay bloque');
  assert.match(block, /^<section class="block" id="pronostico"><div class="block-head"><h2 class="block-title">Pronóstico<\/h2><p class="block-context">estimación<\/p><\/div>/);
  // Debajo del resultado (que sigue sin marcador) y antes del cara a cara.
  assert.ok(out.indexOf('Resultado</h2>') < out.indexOf('Pronóstico</h2>') && out.indexOf('Pronóstico</h2>') < out.indexOf('Cara a cara</h2>'));
  assert.match(out, /<p class="pt-score is-pending"><span aria-hidden="true">–<\/span><span class="vh">Sin resultado<\/span><\/p>/);
  // La barra y sus tres cifras, local, empate y visitante, en ese orden.
  assert.match(block, /<svg class="odds-bar"[^>]*aria-hidden="true"/);
  const odds = [...block.matchAll(/<div class="odds-item is-(home|draw|away)"><dt( title="[^"]*")?>(.*?)<\/dt><dd>(.*?)<\/dd><\/div>/g)].map((m) => [m[1], m[2] || '', text(m[3]), m[4]]);
  assert.deepEqual(odds, [
    ['home', ' title="Las Mesas Hu."', 'Gana Las Mesas Hu.', percent(f.pHome)], ['draw', '', 'Empate', percent(f.pDraw)],
    ['away', ' title="Veteranos"', 'Gana Veteranos', percent(f.pAway)],
  ]);
  // El más probable (el del favorito) y los dos que le siguen sin cambiar de ganador.
  const cells = [...block.matchAll(/<div class="cell is-muted"><dt class="cell-label">(.*?)<\/dt><dd class="cell-value">(.*?)<\/dd>/g)].map((m) => [m[1], m[2]]);
  assert.equal(cells.length, 2, 'las dos casillas, apagadas: nunca con la letra de un dato real');
  assert.deepEqual(cells[0], ['Resultado más probable', `${f.score[0]}–${f.score[1]}`]);
  assert.equal(cells[1][0], 'Goles esperados');
  assert.match(cells[1][1], /^\d+,\d – \d+,\d$/);
  const others = topScores(f.xgHome, f.xgAway, { n: 3, pick: f.pick });
  assert.deepEqual(others[0].score, f.score);
  const also = others.slice(1).map((x) => `${x.score[0]}–${x.score[1]}`);
  assert.match(block, new RegExp(`<p class="odds-also">También probables: ${also[0]} y ${also[1]}\\.</p>`));
  for (const x of others) assert.ok(x.score[0] < x.score[1], 'todos con el mismo ganador');
  // En qué se basa.
  assert.equal(text(block.match(/<p class="notice">.*?<\/p>/)[0]),
    `Con los ${f.matches} partidos jugados en el grupo esta temporada. Es una estimación, no un resultado.`);
});

test('Partido: si los goles esperados no van con el favorito (el 1X2 es de las notas; los goles, del Poisson), no se enseñan', () => {
  // Con un 0-4 de Santa Brígida en el campo del Gran Canaria en la jornada 1, las notas ponen a La Garita de
  // favorita contra Acodetti, y el Poisson les da casi los mismos goles, algo más a Acodetti: un partido
  // igualado, en el que cada modelo inclina la balanza a un lado.
  const params = { g: 'PG2', r: 'Jornada 3', h: 'La Garita', a: 'Acodetti' };
  const raw = currentAt(TODAY);
  const first = raw.history.PG2['Jornada 1'].find((row) => row[1] === 'Gran Canaria' && row[2] === 'Santa Brígida');
  first[3] = 0; first[4] = 4;
  const opts = at(TODAY, raw);
  const f = expected(params, opts);
  assert.equal(f.pick, 'home');
  assert.equal(f.goalsAgree, false);
  assert.ok(f.xgAway > f.xgHome && f.score[0] > f.score[1], JSON.stringify(f));
  const block = blockOf(renderPartido(params, opts), 'Pronóstico');
  const cells = [...block.matchAll(/<div class="cell is-muted"><dt class="cell-label">(.*?)<\/dt><dd class="cell-value">(.*?)<\/dd>/g)].map((m) => [m[1], m[2]]);
  assert.deepEqual(cells, [['Resultado más probable', `${f.score[0]}–${f.score[1]}`]]);
  assert.match(block, /<dl class="cells cells-1">/);
  assert.doesNotMatch(block, /Goles esperados/);
  assert.match(block, /class="odds-bar"/, 'la barra y las cifras, como siempre');
  // Sin el cambio, el mismo partido con sus dos casillas.
  assert.equal(expected(params).goalsAgree, true);
  assert.match(blockOf(renderPartido(params), 'Pronóstico'), /Goles esperados/);
});

test('un equipo que aún no ha jugado: ni línea en la Jornada ni bloque en Partido (solo miraría al rival)', () => {
  // Los dos partidos de Las Mesas, sin el marcador (la fuente aún no lo ha publicado).
  const raw = currentAt(TODAY);
  for (const key of ['Jornada 1', 'Jornada 2']) {
    for (const row of raw.history.PG2[key]) if (row[1] === 'Las Mesas Hu.' || row[2] === 'Las Mesas Hu.') { row[3] = null; row[4] = null; }
  }
  const opts = at(TODAY, raw);
  assert.equal(expected(MESAS_J3, opts), null);
  assert.equal(blockOf(renderPartido(MESAS_J3, opts), 'Pronóstico'), null);
  const out = renderJornada({ g: 'PG2', r: 'Jornada 3' }, opts);
  const mesas = rows(out).find((row) => row.includes('Las Mesas Hu.'));
  assert.ok(mesas && !mesas.includes('match-forecast'), 'su fila, sin línea');
  assert.equal(lines(out).length, 5, 'los demás, con la suya');
});

test('Partido: nada si se ha jugado, en benjamín ni en alevín', () => {
  assert.equal(blockOf(renderPartido({ g: 'PG2', r: 'Jornada 1', h: 'Las Mesas Hu.', a: 'UD Jinámar' }), 'Pronóstico'), null);
  const ff5 = fixture('current-2025-2026').history.FF5['Jornada 3'][0];
  const benj = renderPartido({ g: 'FF5', r: 'Jornada 3', h: ff5[1], a: ff5[2] });
  assert.match(benj, /pt-score is-pending/);
  assert.equal(blockOf(benj, 'Pronóstico'), null);
  assert.doesNotMatch(benj, /odds-|Pronóstico/);
  const raw = alevinRaw({ season: PORTAL_SEASON, today: '2025-10-15' });
  const [, h, a] = raw.HISTORY_ALEV.AL1['Jornada 4'][1];
  const alev = renderPartido({ g: 'AL1', r: 'Jornada 4', h, a }, at('2025-10-15', currentAt('2025-10-15'), { alevin: alevinData(raw) }));
  assert.match(alev, /pt-score is-pending/);
  assert.doesNotMatch(alev, /odds-|Pronóstico/);
});

// ── Mi equipo ───────────────────────────────────────────────────────────

test('Mi equipo (Las Mesas Hu., prebenjamín): la línea bajo el próximo partido; en benjamín, nada', () => {
  const out = s(home.render(ctxFor('home', {}, at())));
  assert.match(out, /data-state="A"/);
  const f = expected(MESAS_J3);
  const line = out.match(/<span class="fixture-forecast">(.*?<\/span>)<\/span>/);
  assert.ok(line, 'hay línea');
  assert.equal(seen(line[1]), `Pronóstico ${f.score[0]}–${f.score[1]} · Veteranos ${Math.round(f.pAway * 100)} %`);
  // Dentro de la caja del próximo partido, bajo los dos equipos y antes del campo.
  assert.match(out, /<div class="fixture">.*<span class="fixture-forecast">.*<\/div><p class="fixture-venue">/);
  // Solo el próximo: el calendario completo, sin pronósticos.
  assert.doesNotMatch(out, /match-forecast/);
  const benj = s(home.render(ctxFor('home', {}, { ...at(), myTeam: { name: 'Las Mesas Hu.', season: PORTAL_SEASON, cat: 'benjamin', groupId: 'FF5' } })));
  assert.doesNotMatch(benj, /forecast|Pronóstico/);
});

// ── El modelo para la pantalla Partido: topScores (pronostico.js) ───────

test('topScores: de más a menos; con pick, solo ese desenlace y empezando por el marcador de outcome', () => {
  for (const [h, a] of [[6.4, 3.0], [2.5, 4.2], [4.3, 4.3], [1.8, 1.2], [0.4, 0.3]]) {
    const o = outcome(h, a);
    const top = topScores(h, a, { n: 5, pick: o.pick });
    assert.deepEqual(top[0].score, o.score, `${h}-${a}`);
    assert.ok(Math.abs(top[0].p - o.pScore) < 1e-12, `${h}-${a}`);
    for (let i = 1; i < top.length; i += 1) assert.ok(top[i - 1].p >= top[i].p);
    const side = ([l, v]) => (l > v ? 'home' : l < v ? 'away' : 'draw');
    assert.ok(top.every((x) => side(x.score) === o.pick), `${h}-${a}`);
  }
  // Sin pick, todos los marcadores: con 1,8 y 1,2, el primero es el 1-1.
  assert.deepEqual(topScores(1.8, 1.2, { n: 1 })[0].score, [1, 1]);
  assert.equal(topScores(3, 2, { n: 3 }).length, 3);
});

// ── Estilos (acta.css) ──────────────────────────────────────────────────

test('estilos: la línea, pequeña, sin negrita y en --mute (también en la fila propia); la barra, sólida; las clases existen', () => {
  const rules = cssRules();
  const body = (sel) => rules.filter((r) => r.media === null && r.selector.split(',').map((x) => x.trim()).includes(sel)).map((r) => r.body).join(';');
  for (const sel of ['.match-forecast', '.match-row.is-mine .match-forecast']) {
    assert.match(body(sel), /color:\s*var\(--mute\)/, sel);
    assert.match(body(sel), /font-weight:\s*400/, sel);
    assert.match(body(sel), /font-size:\s*12px/, sel);
    assert.match(body(sel), /grid-column:\s*2 \/ -1/, sel);
  }
  assert.match(body('.match-score'), /font-size:\s*15px/, 'el marcador real, más grande');
  assert.match(body('.fixture-forecast'), /color:\s*var\(--mute\)/);
  assert.match(body('.odds-home'), /fill:\s*var\(--ink\)/);
  // El empate, en --mute (de 3:1 para arriba sobre el papel en los dos temas; --draw, a 1,24:1, no se veía).
  assert.match(body('.odds-draw'), /fill:\s*var\(--mute\)/);
  assert.match(body('.is-draw .odds-key'), /background:\s*var\(--mute\)/);
  assert.match(body('.odds-away'), /fill:\s*var\(--text\)/);
  // El nombre de la leyenda, en una línea y con «…»: las tres cifras, a la misma altura.
  for (const rule of [/white-space:\s*nowrap/, /overflow:\s*hidden/, /text-overflow:\s*ellipsis/]) assert.match(body('.odds-item dt'), rule);
  assert.doesNotMatch(rules.filter((r) => /odds|forecast/.test(r.selector)).map((r) => r.body).join(';'), /dashed|dotted|dasharray|gradient/);
  const out = [renderJornada({ g: 'PG2', r: 'Jornada 3' }), renderPartido(MESAS_J3), s(home.render(ctxFor('home', {}, at())))].join('');
  const used = new Set(out.match(/class="[^"]+"/g).flatMap((m) => m.slice(7, -1).split(/\s+/)));
  assert.deepEqual([...used].filter((c) => !rules.classes.has(c)), []);
});
