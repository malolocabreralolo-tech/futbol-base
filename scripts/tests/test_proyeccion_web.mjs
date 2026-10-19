// El pronóstico de la clasificación final en la web (19/10/2026): el bloque «Pronóstico de la clasificación
// final» de la ficha de equipo y de Mi equipo (projectionBlock de team-extras.js), en el sitio de la
// evolución de puntos, que se quitó. render(ctx) es pura: se prueba sobre el HTML, con las fixtures
// congeladas (la temporada del portal es 2025-26) y `today` inyectado. El modelo (src/proyeccion.js) tiene
// sus pruebas en test_proyeccion.mjs; aquí, lo que se pinta, dónde, y dónde no se pinta nada: benjamín, una
// temporada pasada o terminada, un retirado, un equipo que aún no ha jugado, antes de dos jornadas y con una
// clasificación que no cuadra con el calendario.
import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { currentAt } from './fixtures/rediseno/simulate.mjs';
import { ctxFor, datasetsFor, cssRules, PORTAL_SEASON } from './fixtures/rediseno/screens.mjs';
import { screen as home } from '../../src/screen-home.js';
import { screen as equipo } from '../../src/screen-equipo.js';
import { teamShort } from '../../src/model.js';
import { teamHref } from '../../src/links.js';
import { forecastOptions } from '../../src/ui.js';
import { projectStandings, startMatchesCalendar } from '../../src/proyeccion.js';

const s = (h) => String(h);
const text = (h) => s(h).replace(/<[^>]*>/g, ' ').replace(/&quot;/g, '"').replace(/&#39;/g, "'")
  .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim();
const titles = (h) => [...s(h).matchAll(/<h2 class="block-title">(.*?)<\/h2>/g)].map((m) => m[1]);
const TITLE = 'Pronóstico de la clasificación final';
const blockOf = (out) => (s(out).match(/<section class="block"><div class="block-head"><h2 class="block-title">Pronóstico de la clasificación final<\/h2>[\s\S]*?<\/section>/) || [null])[0];

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
const projOf = (opts = at()) => {
  const ctx = ctxFor('equipo', { s: PORTAL_SEASON, g: 'PG2', t: 'Las Mesas Hu.' }, opts);
  return projectStandings(ctx.model.group(PORTAL_SEASON, 'PG2'), forecastOptions(ctx));
};

test('la ficha de Las Mesas Hu. (prebenjamín de la temporada del portal, dos jornadas jugadas): el bloque, en el sitio de la evolución', () => {
  const out = ficha('Las Mesas Hu.');
  // (Sin la plantilla: estas fixtures no traen actas de PG2.)
  const side = titles(out.match(/<div class="home-side">([\s\S]*)<\/div><div class="home-rest">/)[1]);
  assert.deepEqual(side, ['Clasificación', 'Goleadores del equipo', 'La temporada en cifras', TITLE, 'Trayectoria']);
  assert.doesNotMatch(out, /Evolución de puntos|points-/);
  const block = blockOf(out);
  assert.match(block, /^<section class="block"><div class="block-head"><h2 class="block-title">Pronóstico de la clasificación final<\/h2><p class="block-context">estimación<\/p><\/div><div class="box"><div class="proj-head">/);
  const p = projOf();
  const me = p.rows.find((r) => r.team === 'Las Mesas Hu.');
  // Arriba, el puesto pronosticado (el de la tabla final proyectada), con «.º», y la línea del abanico y los puntos.
  assert.match(block, new RegExp(`<p class="proj-pick">Pronóstico: <b class="proj-pos">${me.pos}\\.º</b></p>`));
  const range = me.lo === me.hi ? `${me.lo}.º` : `Entre ${me.lo}.º y ${me.hi}.º`;
  assert.match(block, new RegExp(`<p class="proj-range">${range}, 8 de cada 10 veces · unos ${Math.round(me.pts)} puntos</p>`));
  assert.ok(me.lo <= me.pos && me.pos <= me.hi);
  // Debajo, la tabla final proyectada de toda la liga (sin CD Batán, retirado), en su orden, con las clases
  // de la Tabla: el puesto, el escudo y el nombre corto con el enlace a su ficha, los puntos y el abanico.
  const rows = [...block.matchAll(/<tr( class="is-mine")?><td class="st-pos">(\d+)<\/td><th scope="row" class="st-team"><a class="st-link" href="([^"]*)">.*?<span class="st-name">([^<]*)<\/span><\/a>(?:<span class="vh"> \(([^)]*)\)<\/span>)?<\/th><td class="st-pts">(\d+)<\/td><td class="st-fan">([^<]*)<\/td><\/tr>/g)];
  assert.equal(rows.length, p.rows.length);
  assert.equal(p.rows.length, 14, 'los 15 de la tabla menos CD Batán');
  assert.ok(!p.rows.some((r) => r.team === 'CD Batán'));
  p.rows.forEach((r, i) => {
    const [, mine, pos, href, name, hidden, pts, fan] = rows[i];
    assert.equal(Number(pos), r.pos);
    assert.equal(href, teamHref(PORTAL_SEASON, 'PG2', r.team).replace(/&/g, '&amp;'));
    assert.equal(name, teamShort(r.team).replace(/&/g, '&amp;'));
    assert.equal(Number(pts), Math.round(r.pts));
    assert.equal(fan, r.lo === r.hi ? `${r.lo}.º` : `${r.lo}.º–${r.hi}.º`);
    assert.equal(Boolean(mine), r.team === 'Las Mesas Hu.');
    assert.equal(hidden || null, r.team === 'Las Mesas Hu.' ? 'mi equipo' : null);
  });
  assert.match(block, /<caption class="vh">Clasificación final pronosticada: Prebenjamín, Grupo 2 de Gran Canaria<\/caption>/);
  assert.match(block, /<abbr title="Puestos en que acaba 8 de cada 10 veces">Entre<\/abbr>/);
  // Y de dónde sale, en una nota.
  assert.match(block, /<\/div><p class="notice">Con el pronóstico de cada partido que queda: 2\.000 simulaciones del resto de la liga, que se rehacen con cada resultado nuevo\. «Entre»: los puestos en que acaba cada equipo 8 de cada 10 veces \(comprobado con temporadas pasadas\)\. Es una estimación, no un resultado\.<\/p><\/section>$/);
});

test('la ficha de otro equipo del grupo: su fila resaltada, «este equipo», y su puesto arriba; la misma tabla', () => {
  const block = blockOf(ficha('AD Huracán'));
  const p = projOf();
  const huracan = p.rows.find((r) => r.team === 'AD Huracán');
  assert.match(block, new RegExp(`Pronóstico: <b class="proj-pos">${huracan.pos}\\.º</b>`));
  assert.match(block, /<tr class="is-mine"><td class="st-pos">\d+<\/td><th scope="row" class="st-team"><a class="st-link" href="[^"]*AD%20Hurac%C3%A1n">.*?<span class="st-name">Huracán<\/span><\/a><span class="vh"> \(este equipo\)<\/span>/);
  assert.equal((block.match(/class="is-mine"/g) || []).length, 1);
  // Las filas, las mismas que en la de Las Mesas Hu. salvo el resaltado.
  const plain = (b) => b.replace(/<div class="proj-head">.*?<\/div>/, '').replace(/ class="is-mine"/, '').replace(/<span class="vh"> \([^)]*\)<\/span>/, '');
  assert.equal(plain(block), plain(blockOf(ficha('Las Mesas Hu.'))));
});

test('Mi equipo (Las Mesas Hu.): el mismo bloque que su ficha, en la consulta, tras las cifras y antes de la plantilla', () => {
  const out = s(home.render(ctxFor('home', {}, at())));
  assert.match(out, /data-state="A"/);
  const side = titles(out.match(/<div class="home-side">([\s\S]*)<\/div><div class="home-rest">/)[1]);
  assert.deepEqual(side, ['Clasificación', 'Goleadores del equipo', 'La temporada en cifras', TITLE, 'Plantilla', 'Trayectoria']);
  assert.equal(blockOf(out), blockOf(ficha('Las Mesas Hu.')));
  assert.match(blockOf(out), /<span class="vh"> \(mi equipo\)<\/span>/);
  assert.doesNotMatch(out, /Evolución de puntos/);
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

test('sin bloque: benjamín, otra temporada, la temporada terminada, un retirado y antes de dos jornadas jugadas', () => {
  // Benjamín (FF5, Mi equipo), aunque lleve dos jornadas jugadas.
  const benj = s(home.render(ctxFor('home', {}, { ...at(), myTeam: { name: 'Las Mesas Hu.', season: PORTAL_SEASON, cat: 'benjamin', groupId: 'FF5' } })));
  assert.match(benj, /data-state="A"/);
  assert.doesNotMatch(benj, /Pronóstico de la clasificación final|proj-|Evolución de puntos/);
  // La temporada terminada (23/09/2026): nada por jugar.
  assert.equal(blockOf(ficha('Las Mesas Hu.', { today: '2026-09-23' })), null);
  // CD Batán, retirado: ni en la tabla proyectada ni su bloque.
  assert.equal(blockOf(ficha('CD Batán')), null);
  // El 13/10/2025, con una sola jornada jugada (PARAMS.minRounds, 2): nada, como el pronóstico de partidos.
  assert.equal(blockOf(ficha('Las Mesas Hu.', at('2025-10-13'))), null);
  // Como si fuera de otra temporada: el modelo no lo admite (forecastApplies).
  const ctx = ctxFor('equipo', { s: PORTAL_SEASON, g: 'PG2', t: 'Las Mesas Hu.' }, at());
  const group = ctx.model.group(PORTAL_SEASON, 'PG2');
  assert.equal(projectStandings({ ...group, season: '2024-2025' }, forecastOptions(ctx)), null);
});

test('un equipo que aún no ha jugado: sin su bloque (como el pronóstico de sus partidos); los demás lo tienen, con él en la tabla', () => {
  // El 20/10/2025, con los partidos de Veteranos de la 1 y la 2 sin resultado (aplazados).
  const noVeteranos = (raw) => {
    for (const rows of Object.values(raw.history.PG2)) {
      for (const row of rows) if (row[1] === 'Veteranos' || row[2] === 'Veteranos') { row[3] = null; row[4] = null; }
    }
  };
  const opts = at(TODAY, dayRaw(TODAY, noVeteranos));
  assert.equal(blockOf(ficha('Veteranos', opts)), null);
  const mesas = blockOf(ficha('Las Mesas Hu.', opts));
  assert.ok(mesas);
  assert.match(mesas, /<span class="st-name">Veteranos<\/span>/);
});

test('con una clasificación que no cuadra con el calendario (la de las fixtures, la del final): ningún bloque', () => {
  const opts = { today: TODAY, datasets: datasetsFor({ current: currentAt(TODAY) }) };
  const ctx = ctxFor('equipo', { s: PORTAL_SEASON, g: 'PG2', t: 'Las Mesas Hu.' }, opts);
  const group = ctx.model.group(PORTAL_SEASON, 'PG2');
  assert.equal(startMatchesCalendar(group, { status: forecastOptions(ctx).status }), false);
  assert.equal(projectStandings(group, forecastOptions(ctx)), null);
  assert.equal(blockOf(ficha('Las Mesas Hu.', opts)), null);
  // La del día (dayRaw), sí.
  assert.equal(startMatchesCalendar(ctxFor('equipo', { s: PORTAL_SEASON, g: 'PG2', t: 'Las Mesas Hu.' }, at()).model.group(PORTAL_SEASON, 'PG2')), true);
});

test('estilos: el puesto grande y en tinta; la tabla, con las clases de la Tabla; sin discontinuas, radios ni sombras', () => {
  const rules = cssRules();
  const body = (sel) => rules.filter((r) => r.media === null && r.selector.split(',').map((x) => x.trim()).includes(sel)).map((r) => r.body).join(';');
  assert.match(body('.proj-pos'), /color:\s*var\(--ink\)/);
  assert.match(body('.proj-pos'), /font-weight:\s*800/);
  assert.match(body('.proj-range'), /color:\s*var\(--mute\)/);
  assert.match(body('.standings .st-fan'), /white-space:\s*nowrap/);
  assert.doesNotMatch(rules.filter((r) => /proj-|st-fan/.test(r.selector)).map((r) => r.body).join(';'), /dashed|dotted|dasharray|gradient|border-radius|box-shadow/);
  // Nada de la evolución de puntos queda en la hoja.
  assert.ok(!rules.some((r) => /points-/.test(r.selector)));
  const out = [ficha('Las Mesas Hu.'), s(home.render(ctxFor('home', {}, at())))].join('');
  const used = new Set(out.match(/class="[^"]+"/g).flatMap((m) => m.slice(7, -1).split(/\s+/)));
  assert.deepEqual([...used].filter((c) => !rules.classes.has(c)), []);
});

test('lo que oye el lector de pantalla: el puesto, el abanico y la tabla con su leyenda y la fila propia', () => {
  const block = blockOf(ficha('Las Mesas Hu.'));
  const me = projOf().rows.find((r) => r.team === 'Las Mesas Hu.');
  assert.ok(text(block).startsWith(`Pronóstico de la clasificación final estimación Pronóstico: ${me.pos}.º `));
  assert.match(block, /<th scope="col" class="st-pos"><abbr title="Puesto pronosticado">#<\/abbr><\/th><th scope="col" class="st-team">Equipo<\/th><th scope="col" class="st-pts"><abbr title="Puntos previstos">Pts<\/abbr><\/th>/);
});
