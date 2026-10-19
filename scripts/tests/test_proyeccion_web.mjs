// El pronóstico de la clasificación final en la web (19/10/2026). La primera versión era un bloque con la
// tabla prevista en la ficha de equipo y en Mi equipo; tras verla, el usuario lo pidió así: «no me pongas el
// pronóstico en una tipo tabla, sino pónmelo, por ejemplo, la temporada en cifras, ahí me pones pronóstico
// quinto, mis 55 puntos, y luego si pincho ahí […] ver esa tabla […], pero esa tabla no me la pongas en cada
// uno de los equipos». Ahora:
// - en «La temporada en cifras» de la ficha y de Mi equipo, la primera cifra, «Pronóstico final: 4.º, unos
//   45 puntos · Ver la tabla prevista ›» (projectionFigure de team-view.js), un enlace a
// - la tabla prevista, en un solo sitio: la Tabla del grupo, vista v=pronostico (projectionView de
//   screen-tabla.js), fuera del selector de vistas, con el enlace de vuelta a la clasificación y, desde la
//   clasificación, el enlace «Ver el pronóstico de la clasificación final ›»;
// - el router (projectionParams): la vista solo donde hay pronóstico, `t` (el equipo resaltado) solo con
//   ella, y las dos, sin entrada en el historial, como las demás vistas.
// Revisión del 19/10/2026: cada pantalla pide solo lo que enseña (la cabecera de src/proyeccion.js): el
// enlace y el router, projectionApplies (sin pronosticar nada); la cifra, projectPlaces (sin simular); y solo
// la vista, projectStandings (con las simulaciones). La tabla prevista nombra a los equipos como la
// clasificación (no con el nombre corto).
// render(ctx) es pura: se prueba sobre el HTML, con las fixtures congeladas (la temporada del portal es
// 2025-26) y `today` inyectado. El modelo (src/proyeccion.js) tiene sus pruebas en test_proyeccion.mjs; aquí,
// lo que se pinta, dónde, y dónde no se pinta nada: benjamín, una temporada pasada o terminada, un retirado,
// un equipo que aún no ha jugado o que no está en la tabla, antes de dos jornadas y con una clasificación que
// no cuadra con el calendario.
import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';
import { currentAt } from './fixtures/rediseno/simulate.mjs';
import { ctxFor, datasetsFor, cssRules, PORTAL_SEASON } from './fixtures/rediseno/screens.mjs';
import { screen as home } from '../../src/screen-home.js';
import { screen as equipo } from '../../src/screen-equipo.js';
import { screen as tabla, projectionHref, PROJECTION_VIEW } from '../../src/screen-tabla.js';
import { historyMode, resolveParams } from '../../src/router.js';
import { parseRoute, routeHref, teamHref } from '../../src/links.js';
import { forecastOptions } from '../../src/ui.js';
import { projectPlaces, projectStandings, projectionApplies, startMatchesCalendar } from '../../src/proyeccion.js';

const s = (h) => String(h);
const text = (h) => s(h).replace(/<[^>]*>/g, '').replace(/&quot;/g, '"').replace(/&#39;/g, "'")
  .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim();
const titles = (h) => [...s(h).matchAll(/<h2 class="block-title">(.*?)<\/h2>/g)].map((m) => m[1]);
const amp = (x) => x.replace(/&/g, '&amp;');
const TITLE = 'Pronóstico de la clasificación final';
const figureOf = (out) => (s(out).match(/<a class="proj-figure"[\s\S]*?<\/a>/) || [null])[0];
const figuresBox = (out) => (s(out).match(/<h2 class="block-title">La temporada en cifras<\/h2><\/div><div class="box">([\s\S]*?)<\/div><\/section>/) || [null, null])[1];
const blockOf = (out) => (s(out).match(/<section class="block"><div class="block-head"><h2 class="block-title">Pronóstico de la clasificación final<\/h2>[\s\S]*?<\/section>/) || [null])[0];
const sideOf = (out) => titles(s(out).match(/<div class="home-side">([\s\S]*)<\/div><div class="home-rest">/)[1]);

// El 20/10/2025, PG2 lleva dos jornadas jugadas y la 3 por jugar. currentAt deja la clasificación del final
// de la temporada, que no cuadra con el calendario de ese día (y la web no pronostica: la última prueba);
// dayRaw pone en PG2 la de ese día, la de sus partidos con marcador, por puntos, diferencia y goles, con CD
// Batán (retirado, que el calendario no trae) al final, como la de la federación.
const TODAY = '2025-10-20';
function dayRaw(today = TODAY, edit = null) {
  const raw = currentAt(today);
  if (edit) edit(raw);
  const pg2 = raw.prebenjamin.find((g) => g.id === 'PG2');
  const t = new Map();
  for (const rows of Object.values(raw.history.PG2)) {
    for (const [, h, a, hs, as] of rows) {
      for (const team of [h, a]) if (!t.has(team)) t.set(team, { pts: 0, pj: 0, g: 0, e: 0, p: 0, gf: 0, gc: 0 });
      if (hs == null || as == null) continue;
      for (const [team, gf, gc] of [[h, hs, as], [a, as, hs]]) {
        const r = t.get(team);
        r.pj += 1; r.gf += gf; r.gc += gc;
        if (gf > gc) { r.g += 1; r.pts += 3; } else if (gf === gc) { r.e += 1; r.pts += 1; } else r.p += 1;
      }
    }
  }
  const listed = [...t].sort(([, x], [, y]) => y.pts - x.pts || (y.gf - y.gc) - (x.gf - x.gc) || y.gf - x.gf)
    .map(([team, r]) => [0, team, r.pts, r.pj, r.g, r.e, r.p, r.gf, r.gc, r.gf - r.gc]);
  const rest = pg2.standings.filter((r) => !t.has(r[1]));
  pg2.standings = [...listed, ...rest].map((r, i) => [i + 1, ...r.slice(1)]);
  return raw;
}
const at = (today = TODAY, raw = dayRaw(today), extra = {}) => ({ today, datasets: datasetsFor({ current: raw }), ...extra });
const ficha = (t, opts = at()) => s(equipo.render(ctxFor('equipo', { s: PORTAL_SEASON, g: 'PG2', t }, opts)));
const table = (params, opts = at()) => s(tabla.render(ctxFor('tabla', { s: PORTAL_SEASON, g: 'PG2', ...params }, opts)));
const pg2Of = (opts = at()) => ctxFor('tabla', {}, opts).model.group(PORTAL_SEASON, 'PG2');
const projOf = (opts = at()) => {
  const ctx = ctxFor('equipo', { s: PORTAL_SEASON, g: 'PG2', t: 'Las Mesas Hu.' }, opts);
  return projectStandings(ctx.model.group(PORTAL_SEASON, 'PG2'), forecastOptions(ctx));
};
const route = (hash, opts = at()) => resolveParams(parseRoute(hash), ctxFor('tabla', {}, opts));
const target = (res) => (res.redirect ? routeHref(res.redirect.screen, res.redirect.params) : res);

// ── La cifra de «La temporada en cifras» ────────────────────────────────

test('la ficha de Las Mesas Hu.: «Pronóstico final», la primera cifra, con su puesto y sus puntos, y enlace a la tabla prevista', () => {
  const out = ficha('Las Mesas Hu.');
  // Ni el bloque con la tabla (la primera versión) ni la evolución: la consulta, como antes de los dos.
  assert.deepEqual(sideOf(out), ['Clasificación', 'Goleadores del equipo', 'La temporada en cifras', 'Trayectoria']);
  assert.doesNotMatch(out, /Pronóstico de la clasificación final|Evolución de puntos|points-|class="standings"[^>]*>[^]*st-fan/);
  const me = projOf().rows.find((r) => r.team === 'Las Mesas Hu.');
  const href = routeHref('tabla', { s: PORTAL_SEASON, g: 'PG2', v: 'pronostico', t: 'Las Mesas Hu.' });
  assert.equal(href, '#/tabla?s=2025-2026&g=PG2&t=Las%20Mesas%20Hu.&v=pronostico');
  assert.equal(projectionHref(pg2Of(), 'Las Mesas Hu.'), href);
  // La primera de la caja, antes de «Goles a favor»; toda la cifra es el enlace.
  assert.equal(figuresBox(out).indexOf('<a class="proj-figure"'), 0);
  assert.equal(figureOf(out), `<a class="proj-figure" href="${amp(href)}"><span class="cell-label">Pronóstico final<span class="vh">: </span></span><span class="proj-figure-main"><b class="proj-figure-pos">${me.pos}.º</b><span class="proj-figure-pts"><span class="vh">, </span>unos ${Math.round(me.pts)} puntos</span><span class="proj-figure-more"><span class="vh">. </span>Ver la tabla prevista<span aria-hidden="true"> ›</span></span></span></a>`);
  assert.match(figuresBox(out), /<\/a><dl class="cells cells-3"><div class="cell"><dt class="cell-label">Goles a favor<\/dt>/);
  // Lo que oye el lector de pantalla: la frase entera, sin la flecha.
  assert.equal(text(figureOf(out)).replace(' ›', ''), `Pronóstico final: ${me.pos}.º, unos ${Math.round(me.pts)} puntos. Ver la tabla prevista`);
});

test('la ficha de otro equipo del grupo: su puesto y sus puntos, y el enlace con su nombre (su fila, resaltada en la tabla)', () => {
  const huracan = projOf().rows.find((r) => r.team === 'AD Huracán');
  const fig = figureOf(ficha('AD Huracán'));
  assert.match(fig, /^<a class="proj-figure" href="#\/tabla\?s=2025-2026&amp;g=PG2&amp;t=AD%20Hurac%C3%A1n&amp;v=pronostico">/);
  assert.match(fig, new RegExp(`<b class="proj-figure-pos">${huracan.pos}\\.º</b><span class="proj-figure-pts"><span class="vh">, </span>unos ${Math.round(huracan.pts)} puntos</span>`));
});

test('Mi equipo (Las Mesas Hu.): la misma cifra que su ficha, en su «La temporada en cifras»; ni bloque ni tabla', () => {
  const out = s(home.render(ctxFor('home', {}, at())));
  assert.match(out, /data-state="A"/);
  assert.deepEqual(sideOf(out), ['Clasificación', 'Goleadores del equipo', 'La temporada en cifras', 'Plantilla', 'Trayectoria']);
  assert.equal(figureOf(out), figureOf(ficha('Las Mesas Hu.')));
  assert.equal(figuresBox(out).indexOf('<a class="proj-figure"'), 0);
  assert.doesNotMatch(out, /Pronóstico de la clasificación final|st-fan|Evolución de puntos/);
});

test('el mismo pintado da lo mismo (semilla fija y caché); con un resultado más, otro pronóstico', () => {
  assert.equal(ficha('Las Mesas Hu.'), ficha('Las Mesas Hu.'));
  const opts = at();
  const ctx = ctxFor('equipo', { s: PORTAL_SEASON, g: 'PG2', t: 'Las Mesas Hu.' }, opts);
  const group = ctx.model.group(PORTAL_SEASON, 'PG2');
  assert.equal(projectStandings(group, forecastOptions(ctx)), projectStandings(group, forecastOptions(ctx)), 'una vez por grupo');
  // Con la jornada 3 jugada (el 27/10/2025), se rehace: menos partidos por jugar y otra tabla de partida.
  const later = projOf(at('2025-10-27'));
  const now = projOf();
  assert.ok(later.matches < now.matches, `${later.matches} < ${now.matches}`);
  assert.equal(later.rounds, 3);
  assert.notDeepEqual(later.rows.map((r) => r.pts), now.rows.map((r) => r.pts));
});

test('sin cifra: benjamín, otra temporada, la temporada terminada, un retirado y antes de dos jornadas jugadas', () => {
  // Benjamín (FF5, Mi equipo), aunque lleve dos jornadas jugadas: «La temporada en cifras», sin ella.
  const benj = s(home.render(ctxFor('home', {}, { ...at(), myTeam: { name: 'Las Mesas Hu.', season: PORTAL_SEASON, cat: 'benjamin', groupId: 'FF5' } })));
  assert.match(benj, /data-state="A"/);
  assert.match(benj, /La temporada en cifras/);
  assert.doesNotMatch(benj, /proj-figure|Pronóstico final|Pronóstico de la clasificación final|Evolución de puntos/);
  // La temporada terminada (23/09/2026): nada por jugar.
  assert.equal(figureOf(ficha('Las Mesas Hu.', { today: '2026-09-23' })), null);
  // CD Batán, retirado: ni en la tabla proyectada ni su cifra.
  assert.equal(figureOf(ficha('CD Batán')), null);
  // El 13/10/2025, con una sola jornada jugada (PARAMS.minRounds, 2): nada, como el pronóstico de partidos.
  assert.equal(figureOf(ficha('Las Mesas Hu.', at('2025-10-13'))), null);
  // Como si fuera de otra temporada: el modelo no lo admite (forecastApplies).
  const ctx = ctxFor('equipo', { s: PORTAL_SEASON, g: 'PG2', t: 'Las Mesas Hu.' }, at());
  const group = ctx.model.group(PORTAL_SEASON, 'PG2');
  assert.equal(projectStandings({ ...group, season: '2024-2025' }, forecastOptions(ctx)), null);
});

test('un equipo que aún no ha jugado: sin su cifra (como el pronóstico de sus partidos), aunque la ficha lleve «La temporada en cifras»; él va en la tabla', () => {
  // Sin ningún resultado (los de la 1 y la 2, aplazados), la ficha ni siquiera lleva «La temporada en
  // cifras» (figuresBlock pide resultados): ahí no se prueba el guarda.
  const noVeteranos = (raw) => {
    for (const rows of Object.values(raw.history.PG2)) {
      for (const row of rows) if (row[1] === 'Veteranos' || row[2] === 'Veteranos') { row[3] = null; row[4] = null; }
    }
  };
  assert.doesNotMatch(ficha('Veteranos', at(TODAY, dayRaw(TODAY, noVeteranos))), /La temporada en cifras/);
  // Con sus dos partidos de mesa (0-3 y 3-0 sin hora): están en el calendario y en la tabla, y la ficha
  // lleva «La temporada en cifras», pero el pronóstico no los cuenta (trainingFor), así que no ha jugado
  // ninguno de los que cuentan (PARAMS.minPlayed): sin cifra.
  const desk = (raw) => {
    for (const rows of Object.values(raw.history.PG2)) {
      for (const row of rows) {
        if ((row[1] === 'Veteranos' || row[2] === 'Veteranos') && row[3] != null) {
          row[3] = row[1] === 'Veteranos' ? 0 : 3; row[4] = row[1] === 'Veteranos' ? 3 : 0; row[6] = null;
        }
      }
    }
  };
  const opts = at(TODAY, dayRaw(TODAY, desk));
  const vet = projOf(opts).rows.find((r) => r.team === 'Veteranos');
  assert.equal(vet.played, 0);
  const out = ficha('Veteranos', opts);
  assert.match(out, /La temporada en cifras/);
  assert.equal(figureOf(out), null);
  assert.ok(figureOf(ficha('Las Mesas Hu.', opts)));
  assert.match(blockOf(table({ v: 'pronostico' }, opts)), /<span class="st-name">Veteranos<\/span>/);
});

test('un equipo con resultados que no está en la clasificación: su ficha lleva «La temporada en cifras», sin cifra; ni en la tabla prevista', () => {
  // Veteranos fuera de la tabla de la federación (como uno que la tabla ya no lista), con sus resultados en
  // el calendario: no está en la clasificación de partida, ni en la tabla prevista.
  const raw = dayRaw();
  const pg2 = raw.prebenjamin.find((g) => g.id === 'PG2');
  pg2.standings = pg2.standings.filter((r) => r[1] !== 'Veteranos').map((r, i) => [i + 1, ...r.slice(1)]);
  const opts = at(TODAY, raw);
  const p = projOf(opts);
  assert.ok(p);
  assert.ok(!p.rows.some((r) => r.team === 'Veteranos'));
  const out = ficha('Veteranos', opts);
  assert.match(out, /La temporada en cifras/);
  assert.equal(figureOf(out), null);
  assert.ok(figureOf(ficha('Las Mesas Hu.', opts)));
  assert.doesNotMatch(blockOf(table({ v: 'pronostico' }, opts)), /Veteranos/);
});

test('con una clasificación que no cuadra con el calendario (la de las fixtures, la del final): ni cifra ni vista ni enlace', () => {
  const opts = { today: TODAY, datasets: datasetsFor({ current: currentAt(TODAY) }) };
  const group = pg2Of(opts);
  assert.equal(startMatchesCalendar(group, { status: forecastOptions(ctxFor('tabla', {}, opts)).status }), false);
  assert.equal(projectStandings(group, forecastOptions(ctxFor('tabla', {}, opts))), null);
  assert.equal(figureOf(ficha('Las Mesas Hu.', opts)), null);
  assert.doesNotMatch(table({}, opts), /tabla-switch|pronostico/);
  // La del día (dayRaw), sí.
  assert.equal(startMatchesCalendar(pg2Of()), true);
});

// ── La tabla prevista, en la Tabla (v=pronostico) ───────────────────────

test('la vista del pronóstico: la tabla prevista de toda la liga, sin el selector, con la vuelta a la clasificación y la nota', () => {
  assert.equal(PROJECTION_VIEW, 'pronostico');
  const out = table({ v: 'pronostico' });
  assert.match(out, /^<section data-screen="tabla"><header class="screen-head"><div class="screen-head-text"><h1>Tabla<\/h1><p class="screen-sub">Prebenjamín, Grupo 2 de Gran Canaria<\/p>/);
  assert.equal((out.match(/<h1[ >]/g) || []).length, 1);
  // Ni el selector de vistas (no está en él), ni la clasificación, ni goleadores ni procedencia.
  assert.doesNotMatch(out, /tabla-views|<h2 class="block-title">(Clasificación|Goleadores del grupo)<\/h2>|source-line/);
  assert.deepEqual(titles(out), [TITLE]);
  // Arriba, la vuelta a la clasificación (sin v ni t); la tira de grupos conserva la vista.
  assert.match(out, /<\/nav><div class="tabla-proj"><p class="tabla-switch"><a class="more" href="#\/tabla\?s=2025-2026&amp;g=PG2"><span aria-hidden="true">‹<\/span><span class="tabla-switch-label">Ver la clasificación actual<\/span><\/a><\/p><section class="block">/);
  assert.match(out, /<a class="group-chip[^"]*" id="grupo-PG2" href="#\/tabla\?s=2025-2026&amp;g=PG2&amp;v=pronostico"/);
  const block = blockOf(out);
  assert.match(block, /^<section class="block"><div class="block-head"><h2 class="block-title">Pronóstico de la clasificación final<\/h2><p class="block-context">estimación<\/p><\/div><div class="box"><table class="standings">/);
  const p = projOf();
  // Toda la liga (sin CD Batán, retirado), en su orden, con las clases de la clasificación: el puesto, el
  // escudo y el nombre (el de la clasificación) con el enlace a su ficha, los puntos y el abanico; sin `t`,
  // mi equipo resaltado.
  const rows = [...block.matchAll(/<tr( class="is-mine")?><td class="st-pos">(\d+)<\/td><th scope="row" class="st-team"><a class="st-link" href="([^"]*)">.*?<span class="st-name">([^<]*)<\/span><\/a>(?:<span class="vh"> \(([^)]*)\)<\/span>)?<\/th><td class="st-pts">(\d+)<\/td><td class="st-fan">([^<]*)<\/td><\/tr>/g)];
  assert.equal(p.rows.length, 14, 'los 15 de la tabla menos CD Batán');
  assert.equal(rows.length, p.rows.length);
  assert.ok(!p.rows.some((r) => r.team === 'CD Batán'));
  p.rows.forEach((r, i) => {
    const [, mine, pos, href, name, hidden, pts, fan] = rows[i];
    assert.equal(Number(pos), r.pos);
    assert.equal(href, amp(teamHref(PORTAL_SEASON, 'PG2', r.team)));
    assert.equal(name, amp(r.team));
    assert.equal(Number(pts), Math.round(r.pts));
    assert.equal(fan, r.lo === r.hi ? `${r.lo}.º` : `${r.lo}.º–${r.hi}.º`);
    assert.ok(r.lo <= r.pos && r.pos <= r.hi);
    assert.equal(Boolean(mine), r.team === 'Las Mesas Hu.');
    assert.equal(hidden || null, r.team === 'Las Mesas Hu.' ? 'mi equipo' : null);
  });
  assert.match(block, /<caption class="vh">Clasificación final pronosticada: Prebenjamín, Grupo 2 de Gran Canaria<\/caption>/);
  assert.match(block, /<th scope="col" class="st-pos"><abbr title="Puesto pronosticado">#<\/abbr><\/th><th scope="col" class="st-team">Equipo<\/th><th scope="col" class="st-pts"><abbr title="Puntos previstos">Pts<\/abbr><\/th><th scope="col" class="st-fan"><abbr title="Puestos en que acaba 8 de cada 10 veces">Entre<\/abbr><\/th>/);
  // Y de dónde sale, en una nota.
  assert.match(block, /<\/div><p class="notice">Con el pronóstico de cada partido que queda: 2\.000 simulaciones del resto de la liga, que se rehacen con cada resultado nuevo\. «Entre»: los puestos en que acaba cada equipo 8 de cada 10 veces \(comprobado con temporadas pasadas\)\. Es una estimación, no un resultado\.<\/p><\/section>$/);
  // Los mismos nombres que la clasificación de la vista de por defecto («AD Huracán», no «Huracán»): al
  // cambiar de vista, los equipos se llaman igual.
  const names = (h) => [...h.matchAll(/<span class="st-name">([^<]*)<\/span>/g)].map((m) => m[1]).sort();
  const standing = s(table({})).match(/<h2 class="block-title">Clasificación<\/h2>[\s\S]*?<\/table>/)[0];
  assert.deepEqual(names(block), names(standing).filter((n) => n !== 'CD Batán'));
  assert.ok(names(block).includes('AD Huracán'));
  // La misma tabla, una sola vez por grupo: el mismo pintado da lo mismo.
  assert.equal(table({ v: 'pronostico' }), out);
});

test('el abanico de un solo puesto: «3.º», sin guion (avanzada la temporada)', () => {
  // El 2/2/2026, con 13 jornadas jugadas, Acodetti acaba 3.º en más de 8 de cada 10 simulaciones (fanMass).
  const opts = at('2026-02-02');
  const p = projOf(opts);
  const one = p.rows.filter((r) => r.lo === r.hi);
  assert.ok(one.length >= 1, 'algún equipo con un solo puesto');
  const block = blockOf(table({ v: 'pronostico' }, opts));
  for (const r of one) {
    assert.match(block, new RegExp(`<span class="st-name">${r.team}</span></a>(?:<span class="vh"> \\([^)]*\\)</span>)?</th><td class="st-pts">\\d+</td><td class="st-fan">${r.lo}\\.º</td>`), r.team);
  }
  const acodetti = p.rows.find((r) => r.team === 'Acodetti');
  assert.deepEqual([acodetti.lo, acodetti.hi], [3, 3]);
  assert.match(block, /<span class="st-name">Acodetti<\/span><\/a><\/th><td class="st-pts">\d+<\/td><td class="st-fan">3\.º<\/td>/);
});

test('la vista del pronóstico con t: la fila de ese equipo resaltada («este equipo»), solo ella; con mi equipo, «mi equipo»', () => {
  const plain = (b) => b.replace(/ class="is-mine"/g, '').replace(/<span class="vh"> \([^)]*\)<\/span>/g, '');
  const mine = blockOf(table({ v: 'pronostico' }));
  const huracan = blockOf(table({ v: 'pronostico', t: 'AD Huracán' }));
  assert.equal((huracan.match(/class="is-mine"/g) || []).length, 1);
  assert.match(huracan, /<tr class="is-mine"><td class="st-pos">\d+<\/td><th scope="row" class="st-team"><a class="st-link" href="[^"]*AD%20Hurac%C3%A1n">.*?<span class="st-name">AD Huracán<\/span><\/a><span class="vh"> \(este equipo\)<\/span>/);
  assert.equal(plain(huracan), plain(mine), 'las filas, las mismas salvo el resaltado');
  assert.equal(blockOf(table({ v: 'pronostico', t: 'Las Mesas Hu.' })), mine);
  // Un `t` que no está en la tabla (un retirado): mi equipo, como sin él.
  assert.equal(blockOf(table({ v: 'pronostico', t: 'CD Batán' })), mine);
});

test('la clasificación de un grupo con pronóstico: «Ver el pronóstico de la clasificación final ›» bajo la tabla, en cada vista', () => {
  const link = '<p class="tabla-switch"><a class="more" href="#/tabla?s=2025-2026&amp;g=PG2&amp;v=pronostico"><span class="tabla-switch-label">Ver el pronóstico de la clasificación final</span><span aria-hidden="true">›</span></a></p>';
  for (const v of [undefined, 'goles', 'forma', 'casa', 'fuera', 'todas']) {
    const out = table(v ? { v } : {});
    assert.ok(out.includes(`</section>${link}`), `${v || 'puntos'}: justo bajo la clasificación`);
    assert.equal(out.split(link).length, 2, v || 'puntos');
    assert.doesNotMatch(out, /Pronóstico de la clasificación final<\/h2>/);
  }
  // Las vistas de siempre, sin la del pronóstico en el selector.
  assert.doesNotMatch(table({}).match(/<nav class="tabla-views is-narrow"[\s\S]*?<\/nav>/)[0], /pronostico/);
});

test('donde no hay pronóstico, v=pronostico es la vista por defecto y no hay enlace: benjamín, temporada terminada', () => {
  // FF5 (benjamín), con dos jornadas jugadas: la clasificación y el selector, como sin v.
  const benj = (v) => s(tabla.render(ctxFor('tabla', { s: PORTAL_SEASON, g: 'FF5', ...(v ? { v } : {}) }, at())));
  assert.equal(benj('pronostico'), benj());
  assert.match(benj(), /tabla-views/);
  assert.doesNotMatch(benj(), /tabla-switch|Pronóstico de la clasificación final/);
  // PG2 el 23/09/2026: nada por jugar.
  const done = at('2026-09-23', currentAt('2026-09-23'));
  assert.equal(table({ v: 'pronostico' }, done), table({}, done));
  assert.doesNotMatch(table({}, done), /tabla-switch/);
});

test('cada pantalla pide solo lo que enseña: el enlace y el router, projectionApplies; la cifra, projectPlaces; las simulaciones, solo la vista', () => {
  // Las tres van a una: projectionApplies es true justo cuando projectPlaces y projectStandings dan algo, y
  // las dos dan el mismo puesto y los mismos puntos.
  const cases = [
    ['PG2 del día', at(), 'PG2', true],
    ['una sola jornada', at('2025-10-13'), 'PG2', false],
    ['terminada', at('2026-09-23', currentAt('2026-09-23')), 'PG2', false],
    ['no cuadra', { today: TODAY, datasets: datasetsFor({ current: currentAt(TODAY) }) }, 'PG2', false],
    ['benjamín', at(), 'FF5', false],
  ];
  for (const [label, opts, id, want] of cases) {
    const ctx = ctxFor('tabla', {}, opts);
    const group = ctx.model.group(PORTAL_SEASON, id);
    const o = forecastOptions(ctx);
    assert.equal(projectionApplies(group, o), want, label);
    assert.equal(projectPlaces(group, o) !== null, want, label);
    assert.equal(projectStandings(group, o) !== null, want, label);
  }
  const ctx = ctxFor('tabla', {}, at());
  const group = ctx.model.group(PORTAL_SEASON, 'PG2');
  const places = projectPlaces(group, forecastOptions(ctx));
  const full = projectStandings(group, forecastOptions(ctx));
  assert.equal(projectPlaces(group, forecastOptions(ctx)), places, 'una vez por grupo');
  assert.deepEqual(full.rows.map(({ team, pos, pts, dg, gf, played }) => ({ team, pos, pts, dg, gf, played })), places.rows);
  assert.ok(places.rows.every((r) => !('probs' in r) && !('lo' in r)), 'sin simular');
  assert.deepEqual([places.matches, places.rounds], [full.matches, full.rounds]);
  // En el código: la cifra (team-view.js) y el router no llaman a projectStandings; la Tabla, solo en su
  // vista.
  const src = (f) => readFileSync(new URL(`../../src/${f}`, import.meta.url), 'utf8');
  assert.doesNotMatch(src('team-view.js'), /projectStandings/);
  assert.match(src('team-view.js'), /projectPlaces\(group, forecastOptions\(ctx\)\)/);
  assert.doesNotMatch(src('router.js'), /projectStandings|projectPlaces/);
  assert.match(src('router.js'), /projectionApplies\(group, forecastOptions\(ctx\)\)/);
  const calls = [...src('screen-tabla.js').matchAll(/^.*projectStandings\(.*$/gm)].map((m) => m[0].trim());
  assert.deepEqual(calls, ['const projection = applies && params.v === PROJECTION_VIEW ? projectStandings(group, options) : null;']);
});

// ── El router: la vista y `t` ───────────────────────────────────────────

test('router: v=pronostico se queda donde hay pronóstico, con `t` si está en la tabla prevista; si no, se quitan sin aviso', () => {
  assert.deepEqual(route('#/tabla?g=PG2&v=pronostico'), { params: { g: 'PG2', v: 'pronostico', s: PORTAL_SEASON } });
  assert.deepEqual(route('#/tabla?g=PG2&v=pronostico&t=AD%20Hurac%C3%A1n'), { params: { g: 'PG2', v: 'pronostico', t: 'AD Huracán', s: PORTAL_SEASON } });
  // Sin `g`, el grupo de mi equipo (PG2).
  assert.deepEqual(route('#/tabla?v=pronostico'), { params: { v: 'pronostico', s: PORTAL_SEASON, g: 'PG2' } });
  // `t` de un retirado o de otro grupo: fuera, y la vista se queda.
  for (const t of ['CD%20Bat%C3%A1n', 'Guayarmina']) {
    const res = route(`#/tabla?g=PG2&v=pronostico&t=${t}`);
    assert.deepEqual([target(res), res.redirect.notice], ['#/tabla?g=PG2&v=pronostico', null], t);
  }
  // `t` sin la vista del pronóstico no dice nada: fuera.
  assert.equal(target(route('#/tabla?g=PG2&t=AD%20Hurac%C3%A1n')), '#/tabla?g=PG2');
  assert.equal(target(route('#/tabla?g=PG2&v=forma&t=AD%20Hurac%C3%A1n')), '#/tabla?g=PG2&v=forma');
  // Donde no hay pronóstico (benjamín; PG2 con la clasificación del final, que no cuadra con el calendario;
  // la temporada terminada), la vista y su `t` se quitan, como una vista que no existe.
  assert.equal(target(route('#/tabla?g=FF5&v=pronostico&t=Las%20Mesas%20Hu.')), '#/tabla?g=FF5');
  assert.equal(target(route('#/tabla?g=PG2&v=pronostico&t=Las%20Mesas%20Hu.', { today: TODAY, datasets: datasetsFor({ current: currentAt(TODAY) }) })), '#/tabla?g=PG2');
  assert.equal(target(route('#/tabla?g=PG2&v=pronostico', at('2026-09-23', currentAt('2026-09-23')))), '#/tabla?g=PG2');
  assert.equal(route('#/tabla?g=PG2&v=pronostico', at('2026-09-23', currentAt('2026-09-23'))).redirect.notice, null);
});

test('historial: de la ficha a la tabla prevista, push; entre la clasificación y la tabla prevista (con o sin t), replace', () => {
  const R = (hash) => { const r = parseRoute(hash); return { screen: r.screen, params: route(hash).params || r.params }; };
  const fichaRoute = { screen: 'equipo', params: { s: PORTAL_SEASON, g: 'PG2', t: 'AD Huracán' } };
  const prevista = R('#/tabla?s=2025-2026&g=PG2&t=AD%20Hurac%C3%A1n&v=pronostico');
  assert.equal(historyMode(fichaRoute, prevista), 'push');
  assert.equal(historyMode(prevista, R('#/tabla?s=2025-2026&g=PG2')), 'replace', '«Ver la clasificación actual»');
  assert.equal(historyMode(R('#/tabla?s=2025-2026&g=PG2'), R('#/tabla?s=2025-2026&g=PG2&v=pronostico')), 'replace', '«Ver el pronóstico…»');
  assert.equal(historyMode(R('#/tabla?s=2025-2026&g=PG2&v=pronostico'), R('#/tabla?s=2025-2026&g=PG3&v=pronostico')), 'replace', 'la tira de grupos');
});

// ── Estilos ─────────────────────────────────────────────────────────────

test('estilos: la cifra, con el puesto grande y en tinta y el enlace subrayado; la tabla, con las clases de la Tabla; sin discontinuas, radios ni sombras', () => {
  const rules = cssRules();
  const body = (sel, media = null) => rules.filter((r) => r.media === media && r.selector.split(',').map((x) => x.trim()).includes(sel)).map((r) => r.body).join(';');
  assert.match(body('.proj-figure-pos'), /color:\s*var\(--ink\)/);
  assert.match(body('.proj-figure-pos'), /font-weight:\s*800/);
  assert.match(body('.proj-figure-more'), /color:\s*var\(--ink\)/);
  assert.match(body('.proj-figure-more'), /text-decoration:\s*underline/);
  assert.match(body('.proj-figure-main'), /flex-wrap:\s*wrap/);
  assert.match(body('.proj-figure'), /display:\s*block/);
  assert.match(body('.standings .st-fan'), /white-space:\s*nowrap/);
  assert.match(body('.tabla-switch-label'), /text-decoration:\s*underline/);
  assert.match(body('.tabla-proj', '@media (min-width: 1024px)'), /max-width:\s*640px/);
  assert.doesNotMatch(rules.filter((r) => /proj-|st-fan|tabla-switch/.test(r.selector)).map((r) => r.body).join(';'), /dashed|dotted|dasharray|gradient|border-radius|box-shadow/);
  // Nada de la evolución de puntos ni del bloque de la primera versión queda en la hoja.
  assert.ok(!rules.some((r) => /points-|proj-head|proj-pick|proj-range|\.proj-pos\b/.test(r.selector)));
  const out = [ficha('Las Mesas Hu.'), s(home.render(ctxFor('home', {}, at()))), table({}), table({ v: 'pronostico', t: 'AD Huracán' })].join('');
  const used = new Set(out.match(/class="[^"]+"/g).flatMap((m) => m.slice(7, -1).split(/\s+/)));
  assert.deepEqual([...used].filter((c) => !rules.classes.has(c)), []);
});
