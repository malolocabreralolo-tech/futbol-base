// Navegación entre grupos (petición de las familias: «poder navegar en la web entre los distintos
// grupos para ir viendo los resultados y la evolución de los otros grupos dentro de cada categoría»).
// El modelo (siblingGroups, groupProgression y competitionRound) y las pantallas (Tabla con su
// Evolución, Jornada con «Todos los grupos» y el navegador de grupos de las dos), sobre las fixtures
// congeladas y nunca sobre los data-*.js vivos: render(ctx) es pura y se prueba sobre su HTML.
import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { fixture } from './fixtures/rediseno/load.mjs';
import { currentAt } from './fixtures/rediseno/simulate.mjs';
import { ctxFor, cssRules, datasetsFor, pastSeasonRaw, PORTAL_SEASON } from './fixtures/rediseno/screens.mjs';
import { screen as tabla } from '../../src/screen-tabla.js';
import { screen as jornada } from '../../src/screen-jornada.js';
import { groupNav, scrollToCurrent } from '../../src/ui.js';
import { historyMode, resolveParams } from '../../src/router.js';
import { parseRoute } from '../../src/links.js';
import { competitionRound, defaultRound, groupProgression, pointsProgression, siblingGroups } from '../../src/model.js';

const ids = (groups) => groups.map((g) => g.id);
const modelOf = (datasets = datasetsFor()) => ctxFor('tabla', {}, { datasets }).model;
const groupOf = (id, datasets) => modelOf(datasets).group(PORTAL_SEASON, id);
const str = (h) => String(h);
// Texto visible: sin etiquetas, con las entidades básicas resueltas y los espacios juntos.
const text = (h) => str(h).replace(/<[^>]*>/g, ' ').replace(/&quot;/g, '"').replace(/&#39;/g, "'")
  .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim();
const renderTabla = (params, opts) => str(tabla.render(ctxFor('tabla', { s: PORTAL_SEASON, ...params }, opts)));
const renderJornada = (params, opts) => str(jornada.render(ctxFor('jornada', { s: PORTAL_SEASON, ...params }, opts)));
const segments = (out, label) => [...((out.match(new RegExp(`<nav class="[^"]*" aria-label="${label}">(.*?)</nav>`)) || ['', ''])[1])
  .matchAll(/<a class="segment" id="([^"]+)" href="([^"]*)"( aria-current="true")?>([^<]*)<\/a>/g)]
  .map((m) => ({ id: m[1], href: m[2].replace(/&amp;/g, '&'), current: !!m[3], label: m[4] }));
const notices = (out) => [...out.matchAll(/<p class="notice">(.*?)<\/p>/g)].map((m) => text(m[1]));

// La Primera Fase de benjamín con 24 grupos (los cuatro de la fixture más copias de FF15 con su código
// y su nombre), como la de 2026-27: la tira de números solo sale con más de seis.
function withGroups(count, { from = 'FF15', current = fixture('current-2025-2026') } = {}) {
  const base = current.benjamin.find((g) => g.id === from);
  for (let n = 1; n <= count; n++) {
    const id = `FF${n}`;
    if (current.benjamin.some((g) => g.id === id)) continue;
    current.benjamin.push({ ...structuredClone(base), id, name: `Grupo ${n}` });
    current.history[id] = structuredClone(current.history[from]);
  }
  return current;
}

// ── siblingGroups ─────────────────────────────────────────────────────────

test('siblingGroups: los grupos de liga de la misma competición y categoría, en el orden natural de Ligas', () => {
  const model = modelOf();
  const nav = siblingGroups(model, model.group(PORTAL_SEASON, 'FF9'));
  assert.deepEqual(ids(nav.list), ['FF5', 'FF9', 'FF13', 'FF15'], 'Grupo 9 antes que Grupo 13');
  assert.equal(nav.index, 1);
  assert.deepEqual([nav.prev.id, nav.next.id], ['FF5', 'FF13']);
  assert.deepEqual([nav.entry.cat, nav.entry.key, nav.entry.label], ['benjamin', 'primera-fase', 'Primera Fase']);
  const first = siblingGroups(model, model.group(PORTAL_SEASON, 'FF5'));
  assert.deepEqual([first.index, first.prev, first.next.id], [0, null, 'FF9']);
  const last = siblingGroups(model, model.group(PORTAL_SEASON, 'FF15'));
  assert.deepEqual([last.index, last.prev.id, last.next], [3, 'FF13', null]);
  // Cada fase, la suya: la Segunda Fase A no se mezcla con la B, ni benjamín con prebenjamín.
  assert.deepEqual(ids(siblingGroups(model, model.group(PORTAL_SEASON, 'A2')).list), ['A1', 'A2']);
  assert.deepEqual(ids(siblingGroups(model, model.group(PORTAL_SEASON, 'PG2')).list), ['PG2', 'PG3']);
});

test('siblingGroups: null con un solo grupo, para una copa o un torneo y sin grupo', () => {
  const model = modelOf();
  assert.equal(siblingGroups(model, model.group(PORTAL_SEASON, 'PFV2')), null, 'Fuerteventura, un solo grupo');
  assert.equal(siblingGroups(model, model.cups().groups.find((g) => g.kind !== 'league')), null);
  assert.equal(siblingGroups(model, null), null);
  // Una temporada pasada: la suya (2024-25 de B3 trae P3 y P9 de la Primera Fase; la de B2, solo P1).
  const b3 = modelOf(datasetsFor({ seasonRaw: { '2024-2025': fixture('historical-2024-2025-b3') } }));
  assert.deepEqual(ids(siblingGroups(b3, b3.group('2024-2025', 'P9')).list), ['P3', 'P9']);
  const b2 = modelOf(datasetsFor({ seasonRaw: { '2024-2025': pastSeasonRaw() } }));
  assert.equal(siblingGroups(b2, b2.group('2024-2025', 'P1')), null);
});

test('siblingGroups: con 24 grupos, del 1 al 24 en orden natural', () => {
  const model = modelOf(datasetsFor({ current: withGroups(24) }));
  const nav = siblingGroups(model, model.group(PORTAL_SEASON, 'FF5'));
  assert.equal(nav.list.length, 24);
  assert.deepEqual(ids(nav.list).slice(0, 3), ['FF1', 'FF2', 'FF3']);
  assert.equal(nav.list[23].id, 'FF24');
  assert.equal(nav.index, 4);
});

// ── groupProgression ─────────────────────────────────────────────────────

test('groupProgression: los puntos de cada equipo, los de pointsProgression; en el orden de la clasificación y el retirado sin datos', () => {
  const pg2 = groupOf('PG2');
  const evo = groupProgression(pg2);
  assert.equal(evo.rounds.length, 30);
  assert.deepEqual(evo.rounds[0], { key: 'Jornada 1', label: 'Jornada 1', n: 1 });
  assert.equal(evo.played, 30);
  assert.deepEqual(evo.rows.map((r) => r.team), pg2.standings.map((r) => r.team));
  for (const row of evo.rows.filter((r) => !r.retired)) {
    assert.deepEqual(row.pts, pointsProgression(row.team, pg2).map((p) => p.pts), row.team);
  }
  const batan = evo.rows.at(-1);
  assert.deepEqual([batan.team, batan.retired], ['CD Batán', true]);
  assert.ok(batan.pts.every((v) => v === null) && batan.pos.every((v) => v === null), 'el retirado no tiene línea ni puesto');
  assert.equal(evo.rows.find((r) => r.team === 'Las Mesas Hu.').pts.at(-1), 31, 'sin los 2 partidos contra Batán');
});

test('groupProgression: el puesto tras cada jornada, por puntos, diferencia de goles, goles a favor y nombre', () => {
  const evo = groupProgression(groupOf('PG2'));
  const pos = (team) => evo.rows.find((r) => r.team === team).pos.slice(0, 7);
  assert.deepEqual(pos('Unión Viera'), [3, 1, 1, 1, 2, 5, 5]);
  assert.deepEqual(pos('Acodetti'), [1, 2, 2, 2, 1, 1, 1]);
  assert.deepEqual(pos('Las Mesas Hu.'), [5, 8, 8, 8, 8, 8, 8]);
  // Cada jornada jugada, del 1 al 14 sin repetir (el retirado no cuenta).
  for (let i = 0; i < evo.played; i++) {
    assert.deepEqual(evo.rows.filter((r) => !r.retired).map((r) => r.pos[i]).sort((a, b) => a - b), Array.from({ length: 14 }, (_, k) => k + 1), `jornada ${i + 1}`);
  }
});

test('groupProgression: a mitad de temporada, null en las jornadas por jugar; sin jornadas, nada', () => {
  const evo = groupProgression(groupOf('PG2', datasetsFor({ current: currentAt('2026-03-01') })));
  assert.equal(evo.played, 17, 'la jornada 17, la última con algún resultado');
  const mine = evo.rows.find((r) => r.team === 'Las Mesas Hu.');
  assert.deepEqual(mine.pts.slice(15, 18), [18, 18, null]);
  assert.ok(mine.pos[16] > 0);
  assert.equal(mine.pos[17], null);
  const empty = fixture('current-2025-2026');
  empty.history.PG2 = {};
  const none = groupProgression(groupOf('PG2', datasetsFor({ current: empty })));
  assert.deepEqual([none.rounds, none.played], [[], 0]);
  assert.equal(none.rows.length, 15, 'los equipos de la clasificación, sin datos');
});

test('groupProgression: sin clasificación, los equipos del calendario en el orden del último puesto calculado', () => {
  const current = fixture('current-2025-2026');
  current.prebenjamin.find((g) => g.id === 'PG3').standings = [];
  const evo = groupProgression(groupOf('PG3', datasetsFor({ current })));
  assert.equal(evo.rows.length, 14);
  assert.deepEqual(evo.rows.map((r) => r.pos.at(-1)), Array.from({ length: 14 }, (_, k) => k + 1));
});

// ── competitionRound ─────────────────────────────────────────────────────

test('competitionRound: el número de la jornada por defecto del grupo de mi equipo; si no está, la más repetida', () => {
  const at = (today) => {
    const model = modelOf(datasetsFor({ current: currentAt(today) }));
    return (id) => model.group(PORTAL_SEASON, id);
  };
  // El 1 de febrero, PG2 va por la jornada 13 y PG3 por la 14 (defaultRound, por fecha).
  const feb = at('2026-02-01');
  assert.deepEqual([defaultRound(feb('PG2'), '2026-02-01').n, defaultRound(feb('PG3'), '2026-02-01').n], [13, 14]);
  const gc = [feb('PG2'), feb('PG3')];
  assert.equal(competitionRound(gc, '2026-02-01', 'PG3'), 14, 'la de mi grupo');
  assert.equal(competitionRound(gc, '2026-02-01', 'PG2'), 13);
  assert.equal(competitionRound(gc, '2026-02-01', null), 13, 'sin mi grupo, a igualdad, la menor');
  assert.equal(competitionRound(gc, '2026-02-01', 'A1'), 13, 'mi grupo no es de esta lista');
  // El 15 de abril: A1 y B1 por la 17 y A2 por la 14 (un aplazado): manda la más repetida.
  const apr = at('2026-04-15');
  assert.equal(competitionRound([apr('A2'), apr('A1'), apr('B1')], '2026-04-15', null), 17);
  assert.equal(competitionRound([], '2026-04-15', null), null);
});

// ── Tabla: Evolución del grupo (v=evolucion y v=posiciones) ──────────────

const evoRows = (out) => [...(out.match(/<table class="standings evo-table">.*?<tbody>(.*?)<\/tbody>/) || ['', ''])[1]
  .matchAll(/<tr( class="is-mine")?>(.*?)<\/tr>/g)].map((m) => ({ mine: !!m[1], html: m[2], text: text(m[2]) }));
const gridRows = (out) => [...(out.match(/<table class="evo-grid">.*?<tbody>(.*?)<\/tbody>/) || ['', ''])[1]
  .matchAll(/<tr( class="is-mine")?>(.*?)<\/tr>/g)].map((m) => ({ mine: !!m[1], html: m[2], text: text(m[2]) }));

test('Evolución, Puntos (PG2): una fila por equipo en el orden de la clasificación, su línea con el mismo tope y los Pts en texto', () => {
  const out = renderTabla({ g: 'PG2', v: 'evolucion' });
  assert.match(out, /^<section data-screen="tabla">/);
  assert.equal((out.match(/<h1[ >]/g) || []).length, 1);
  assert.deepEqual(segments(out, 'Evolución del grupo').map(({ id, label, current, href }) => [id, label, current, href]), [
    ['evo-puntos', 'Puntos', true, '#/tabla?s=2025-2026&g=PG2&v=evolucion'],
    ['evo-posiciones', 'Posiciones', false, '#/tabla?s=2025-2026&g=PG2&v=posiciones'],
  ]);
  assert.doesNotMatch(out, /class="tabla-views/, 'sin el selector de vistas de la clasificación');
  assert.match(out, /<h2 class="block-title">Evolución de puntos<\/h2><p class="block-context">desde el calendario<\/p>/);
  const rows = evoRows(out);
  assert.equal(rows.length, 15);
  assert.deepEqual(rows.map((r) => r.text.split(' ')[0]), Array.from({ length: 15 }, (_, k) => String(k + 1)));
  assert.equal(rows[0].text, '1 Unión Viera 79');
  assert.equal(rows[8].mine, true);
  assert.equal(rows[8].text, '9 Las Mesas Hu. (mi equipo) 37', 'los Pts de la clasificación oficial');
  assert.match(rows[8].html, /<a class="st-link" href="#\/equipo\?s=2025-2026&amp;g=PG2&amp;t=Las%20Mesas%20Hu\.">/);
  // El mismo tope (el mayor de los calculados) en todas las líneas, sólidas: pointsChart de ui.js.
  const boxes = rows.slice(0, 14).map((r) => (r.html.match(/viewBox="0 0 (\d+) (\d+)"/) || []).slice(1).join('x'));
  assert.equal(new Set(boxes).size, 1, boxes.join(' '));
  assert.match(boxes[0], /^29x\d+$/);
  assert.doesNotMatch(out, /dasharray/);
  // El retirado, con la palabra y sin línea.
  assert.match(rows[14].html, /<td class="evo-line"><span class="st-retired">retirado<\/span><\/td>/);
  assert.doesNotMatch(rows[14].html, /<svg/);
  assert.deepEqual(notices(out), [
    'Calculada desde el calendario: sin desempates ni sanciones de la federación.',
    'No cuenta los 28 partidos contra CD Batán (retirado), que no están en el calendario.',
  ]);
  assert.doesNotMatch(out, /Goleadores del grupo/, 'la evolución va sola');
});

test('Evolución, Posiciones (PG2): la rejilla J1…J30 con la primera columna fija, el líder de cada jornada y mi fila', () => {
  const out = renderTabla({ g: 'PG2', v: 'posiciones' });
  assert.deepEqual(segments(out, 'Evolución del grupo').map((x) => [x.label, x.current]), [['Puntos', false], ['Posiciones', true]]);
  assert.match(out, /<h2 class="block-title">Puesto tras cada jornada<\/h2><p class="block-context">desde el calendario<\/p>/);
  // Una tabla de verdad, que se desliza dentro de su caja (región con foco para el teclado).
  assert.match(out, /<div class="box evo-scroll" role="region" aria-label="Puesto tras cada jornada; se desliza en horizontal" tabindex="0"><table class="evo-grid"><caption class="vh">Puesto de cada equipo tras cada jornada en Prebenjamín, Grupo 2 de Gran Canaria<\/caption>/);
  const heads = [...out.match(/<table class="evo-grid">.*?<thead>(.*?)<\/thead>/)[1].matchAll(/<th scope="col"[^>]*>(.*?)<\/th>/g)].map((m) => text(m[1]));
  assert.deepEqual(heads, ['Equipo', ...Array.from({ length: 30 }, (_, k) => String(k + 1))]);
  assert.match(out, /<th scope="col"><abbr title="Jornada 1">1<\/abbr><\/th>/);
  const rows = gridRows(out);
  assert.equal(rows.length, 15);
  assert.match(rows[0].html, /^<th scope="row" class="evo-team"><a class="st-link" href="#\/equipo\?s=2025-2026&amp;g=PG2&amp;t=Uni%C3%B3n%20Viera">/);
  assert.equal(rows[0].text.split(' ').slice(2, 9).join(' '), '3 1 1 1 2 5 5');
  assert.match(rows[0].html, /<td>3<\/td><td class="is-leader">1<\/td>/, 'el líder de cada jornada, marcado');
  assert.equal(rows.filter((r) => r.mine).length, 1);
  assert.match(rows[8].text, /^Las Mesas Hu\. \(mi equipo\) 5 8 8 8 8 8 8/);
  assert.equal((out.match(/class="is-leader"/g) || []).length, 30, 'un líder por jornada');
  assert.match(rows[14].html, /<td class="evo-retired" colspan="30"><span class="st-retired">retirado<\/span><\/td>/);
});

test('Evolución: a mitad de temporada, la rejilla hasta la última jornada jugada; con menos de dos, «Todavía no hay evolución»', () => {
  const march = { today: '2026-03-01', datasets: datasetsFor({ current: currentAt('2026-03-01') }) };
  const grid = renderTabla({ g: 'PG2', v: 'posiciones' }, march);
  assert.equal((grid.match(/<th scope="col"><abbr title="Jornada \d+">/g) || []).length, 17);
  const one = { today: '2025-10-15', datasets: datasetsFor({ current: currentAt('2025-10-15') }) };
  for (const v of ['evolucion', 'posiciones']) {
    const out = renderTabla({ g: 'PG2', v }, one);
    assert.match(out, /<p class="empty">Todavía no hay evolución: se ve a partir de la segunda jornada jugada\.<\/p>/, v);
    assert.doesNotMatch(out, /<svg|evo-grid/, v);
    assert.deepEqual(notices(out), [], v);
  }
});

test('Evolución: si cuadra con la clasificación oficial, solo el aviso de «calculada»; si no, la nota sin inventar la causa', () => {
  const calculated = 'Calculada desde el calendario: sin desempates ni sanciones de la federación.';
  assert.deepEqual(notices(renderTabla({ g: 'A1', v: 'evolucion' })), [calculated]);
  // PG3: la federación le da 10 puntos a CD Tablero y el calendario, 13 (con los mismos partidos).
  assert.deepEqual(notices(renderTabla({ g: 'PG3', v: 'posiciones' })), [calculated, 'Nota: la clasificación oficial da otros puntos a CD Tablero.']);
  const current = fixture('current-2025-2026');
  for (const team of ['Arucas', 'Moya']) current.benjamin.find((g) => g.id === 'A1').standings.find((r) => r[1] === team)[2] -= 3;
  assert.deepEqual(notices(renderTabla({ g: 'A1', v: 'evolucion' }, { datasets: datasetsFor({ current }) })),
    [calculated, 'Nota: la clasificación oficial da otros puntos a Arucas y Moya.']);
});

test('Evolución: el router acepta sus dos vistas; mount lleva la rejilla a las últimas jornadas sin mover la página', () => {
  for (const v of ['evolucion', 'posiciones']) {
    const ctx = ctxFor('tabla', {});
    assert.deepEqual(resolveParams(parseRoute(`#/tabla?g=PG2&v=${v}`), ctx), { params: { g: 'PG2', v, s: PORTAL_SEASON } }, v);
  }
  const grid = { scrollLeft: 0, scrollWidth: 1400, clientWidth: 360 };
  const root = { querySelector: (sel) => (sel === '.evo-scroll' ? grid : null), querySelectorAll: () => [] };
  tabla.mount(root, ctxFor('tabla', { s: PORTAL_SEASON, g: 'PG2', v: 'posiciones' }));
  assert.equal(grid.scrollLeft, 1400 - 360);
});

test('Evolución: el CSS de la línea pequeña y de la rejilla con la primera columna fija, sin trazos discontinuos', () => {
  const rules = cssRules();
  const body = (sel) => rules.filter((r) => r.media === null && r.selector.split(',').map((x) => x.trim()).includes(sel)).map((r) => r.body).join(';');
  assert.match(body('.evo-line .points-chart'), /height:\s*28px/);
  assert.match(body('.evo-scroll'), /overflow-x:\s*auto/);
  assert.match(body('.evo-grid .evo-team'), /position:\s*sticky/);
  assert.match(body('.evo-grid .evo-team'), /left:\s*0/);
  assert.match(body('.evo-grid .evo-team'), /background:\s*var\(--paper\)/);
  assert.match(body('.evo-grid .is-leader'), /color:\s*var\(--ink\)/);
  assert.match(body('.evo-grid tr.is-mine > *'), /background:\s*var\(--mark\)/);
  assert.doesNotMatch(rules.filter((r) => /evo-/.test(r.selector)).map((r) => r.body).join(';'), /dashed|dasharray/);
  const out = ['evolucion', 'posiciones'].map((v) => renderTabla({ g: 'PG2', v })).join('');
  const used = new Set(out.match(/class="[^"]+"/g).flatMap((m) => m.slice(7, -1).split(/\s+/)));
  assert.deepEqual([...used].filter((c) => !rules.classes.has(c)), [], 'clases que existen en acta.css');
});

// ── Navegador de grupos: «‹ Grupo 5 de 24 ›», la tira de números y el atajo ──

const BENJ_FF5 = { name: 'Las Mesas Hu.', season: PORTAL_SEASON, cat: 'benjamin', groupId: 'FF5' };
const groupNavOf = (out) => (out.match(/<nav class="group-nav"[^>]*>.*?<\/div><\/nav>/) || [''])[0];
const step = (out, id) => {
  const m = out.match(new RegExp(`<(a|span) class="group-step[^"]*" id="${id}"([^>]*)>`));
  if (!m) return null;
  return m[1] === 'span' ? 'off' : (m[2].match(/href="([^"]*)"/) || [])[1].replace(/&amp;/g, '&');
};
const chips = (out) => [...out.matchAll(/<a class="group-chip( is-mine)?" id="([^"]+)" href="([^"]*)"( aria-current="true")?>(.*?)<\/a>/g)]
  .map((m) => ({ id: m[2], href: m[3].replace(/&amp;/g, '&'), mine: !!m[1], current: !!m[4], text: text(m[5]) }));

test('groupNav: «‹ Grupo 2 de 2 ›» con el enlace a la lista de grupos, la competición y el líder; ids estables', () => {
  const model = modelOf();
  const nav = siblingGroups(model, model.group(PORTAL_SEASON, 'PG3'));
  const out = str(groupNav(nav, { hrefFor: (g) => `#/tabla?g=${g.id}`, listHref: '#/ligas?f=grancanaria' }));
  assert.match(out, /^<nav class="group-nav" aria-label="Grupos de Gran Canaria"><div class="group-steps">/);
  assert.match(out, /<a class="group-step" id="grupo-prev" href="#\/tabla\?g=PG2" aria-label="Grupo anterior: Grupo 2">‹<\/a>/);
  assert.match(out, /<span class="group-step is-off" id="grupo-next" role="link" aria-disabled="true" tabindex="-1" aria-label="Grupo siguiente: no hay">›<\/span>/);
  // «Grupo 5 de 24» cuando el nombre es su número; si no (la fixture solo trae PG2 y PG3), el puesto aparte.
  assert.match(out, /<a class="group-now" id="grupo-lista" href="#\/ligas\?f=grancanaria"><span class="group-title">Grupo 3 · 2 de 2<\/span><span class="group-sub">Gran Canaria · líder: UD Vecindario<\/span><span class="vh">\. Ver los 2 grupos<\/span><\/a>/);
  assert.doesNotMatch(out, /group-strip/, 'con seis grupos o menos, sin la tira de números');
});

test('Tabla (PG2): el navegador bajo la cabecera, el atajo «Jornada | Tabla | Evolución» y «Otro grupo» directo a la lista de grupos', () => {
  const out = renderTabla({ g: 'PG2', v: 'forma' });
  assert.match(out, /<\/header><nav class="group-nav" aria-label="Grupos de Gran Canaria">/, 'debajo de la cabecera');
  assert.equal(step(out, 'grupo-prev'), 'off');
  assert.equal(step(out, 'grupo-next'), '#/tabla?s=2025-2026&g=PG3&v=forma', 'conserva la vista');
  assert.equal(text(out.match(/<a class="group-now".*?<\/a>/)[0]), 'Grupo 2 · 1 de 2 Gran Canaria · líder: Unión Viera . Ver los 2 grupos');
  assert.match(out, /<a class="group-now" id="grupo-lista" href="#\/ligas\?s=2025-2026&amp;c=prebenjamin&amp;f=grancanaria&amp;to=tabla">/);
  assert.deepEqual(segments(out, 'Ver el grupo').map(({ id, label, current, href }) => [id, label, current, href]), [
    ['ver-jornada', 'Jornada', false, '#/jornada?s=2025-2026&g=PG2'],
    ['ver-tabla', 'Tabla', true, '#/tabla?s=2025-2026&g=PG2'],
    ['ver-evolucion', 'Evolución', false, '#/tabla?s=2025-2026&g=PG2&v=evolucion'],
  ]);
  assert.ok(out.indexOf('class="group-nav"') < out.indexOf('aria-label="Ver el grupo"') && out.indexOf('aria-label="Ver el grupo"') < out.indexOf('class="tabla-views'));
  assert.match(out, /<a class="screen-action" href="#\/ligas\?s=2025-2026&amp;c=prebenjamin&amp;i=grancanaria&amp;f=grancanaria&amp;to=tabla">Otro grupo<\/a>/);
  // En la Evolución, el atajo marca Evolución y «‹ ›» siguen en la evolución del otro grupo.
  const evo = renderTabla({ g: 'PG3', v: 'posiciones' });
  assert.deepEqual(segments(evo, 'Ver el grupo').filter((x) => x.current).map((x) => x.label), ['Evolución']);
  assert.equal(step(evo, 'grupo-prev'), '#/tabla?s=2025-2026&g=PG2&v=posiciones');
});

test('Tabla con un solo grupo en su competición (PFV2): sin navegador; el atajo sí, y «Otro grupo» como antes', () => {
  const out = renderTabla({ g: 'PFV2' });
  assert.doesNotMatch(out, /group-nav/);
  assert.deepEqual(segments(out, 'Ver el grupo').map((x) => x.label), ['Jornada', 'Tabla', 'Evolución']);
  assert.match(out, /<a class="screen-action" href="#\/ligas\?s=2025-2026&amp;c=prebenjamin&amp;i=fuerteventura&amp;to=tabla">Otro grupo<\/a>/);
});

test('con más de seis grupos, la tira de números: cada grupo de un toque, el actual con aria-current y el de mi equipo marcado', () => {
  const opts = { myTeam: BENJ_FF5, datasets: datasetsFor({ current: withGroups(24) }) };
  const out = renderTabla({ g: 'FF9' }, opts);
  assert.match(groupNavOf(out), /<div class="group-strip">/);
  const list = chips(out);
  assert.equal(list.length, 24);
  assert.deepEqual(list.slice(0, 3).map((c) => [c.id, c.text, c.href]), [
    ['grupo-FF1', 'Grupo 1', '#/tabla?s=2025-2026&g=FF1'], ['grupo-FF2', 'Grupo 2', '#/tabla?s=2025-2026&g=FF2'], ['grupo-FF3', 'Grupo 3', '#/tabla?s=2025-2026&g=FF3']]);
  assert.match(out, /<a class="group-chip" id="grupo-FF9" href="[^"]*" aria-current="true"><span class="vh">Grupo <\/span>9<\/a>/);
  assert.deepEqual(list.filter((c) => c.current).map((c) => c.id), ['FF9'].map((id) => `grupo-${id}`));
  assert.deepEqual(list.filter((c) => c.mine).map((c) => [c.id, c.text]), [['grupo-FF5', 'Grupo 5 (grupo de mi equipo)']]);
  assert.equal(text(out.match(/<a class="group-now".*?<\/a>/)[0]), 'Grupo 9 de 24 Primera Fase · líder: AD Huracán . Ver los 24 grupos');
});

test('Jornada: el navegador conserva el número de jornada (por número: las claves cambian entre grupos) y, si no existe, va sin r', () => {
  const current = fixture('current-2025-2026');
  // FF13 con las claves de la fuente sin «Jornada» («1»…«5»); FF15 sin la jornada 3.
  current.history.FF13 = Object.fromEntries(Object.entries(current.history.FF13).map(([key, rows]) => [key.replace('Jornada ', ''), rows]));
  delete current.history.FF15['Jornada 3'];
  const opts = { myTeam: BENJ_FF5, datasets: datasetsFor({ current }) };
  const out = renderJornada({ g: 'FF9', r: 'Jornada 3' }, opts);
  assert.match(out, /<\/header><nav class="group-nav" aria-label="Grupos de Primera Fase">/);
  assert.equal(step(out, 'grupo-prev'), '#/jornada?s=2025-2026&g=FF5&r=Jornada%203');
  assert.equal(step(out, 'grupo-next'), '#/jornada?s=2025-2026&g=FF13&r=3');
  assert.equal(step(renderJornada({ g: 'FF13', r: '3' }, opts), 'grupo-next'), '#/jornada?s=2025-2026&g=FF15', 'FF15 no tiene la 3');
  assert.match(out, /<a class="group-now" id="grupo-lista" href="#\/ligas\?s=2025-2026&amp;c=benjamin&amp;f=primera-fase&amp;to=jornada">/);
  assert.deepEqual(segments(out, 'Ver el grupo').map(({ label, current, href }) => [label, current, href]), [
    ['Jornada', true, '#/jornada?s=2025-2026&g=FF9'],
    ['Tabla', false, '#/tabla?s=2025-2026&g=FF9'],
    ['Evolución', false, '#/tabla?s=2025-2026&g=FF9&v=evolucion'],
  ]);
  assert.match(out, /<a class="screen-action" href="#\/ligas\?s=2025-2026&amp;c=benjamin&amp;i=grancanaria&amp;f=primera-fase&amp;to=jornada">Otro grupo<\/a>/);
  assert.ok(out.indexOf('aria-label="Ver el grupo"') < out.indexOf('<nav class="round-nav"'), 'el atajo, antes de la jornada');
});

test('historial: cambiar de grupo con el navegador es replace (como cambiar de jornada o de vista); de pantalla, push', () => {
  const R = parseRoute;
  assert.equal(historyMode(R('#/tabla?s=2025-2026&g=PG2'), R('#/tabla?s=2025-2026&g=PG3')), 'replace');
  assert.equal(historyMode(R('#/tabla?s=2025-2026&g=PG2&v=evolucion'), R('#/tabla?s=2025-2026&g=PG3&v=evolucion')), 'replace');
  assert.equal(historyMode(R('#/jornada?s=2025-2026&g=FF9&r=Jornada%203'), R('#/jornada?s=2025-2026&g=FF13&r=3')), 'replace');
  assert.equal(historyMode(R('#/tabla?s=2025-2026&g=PG2'), R('#/jornada?s=2025-2026&g=PG2')), 'push', 'el atajo cambia de pantalla');
  assert.equal(historyMode(R('#/tabla?s=2025-2026&g=PG2'), R('#/tabla?s=2024-2025&g=PG2')), 'push', 'otra temporada');
});

test('mount: la tira se desliza hasta el grupo actual, dentro de su caja y sin mover la página', () => {
  const chip = { offsetLeft: 900, offsetWidth: 44 };
  const strip = { scrollLeft: 0, scrollWidth: 1300, clientWidth: 360, querySelector: (sel) => (sel === '[aria-current]' ? chip : null) };
  scrollToCurrent(strip);
  assert.equal(strip.scrollLeft, 900 - (360 - 44) / 2, 'el actual, en medio');
  const first = { offsetLeft: 0, offsetWidth: 44 };
  const start = { scrollLeft: 50, scrollWidth: 1300, clientWidth: 360, querySelector: () => first };
  scrollToCurrent(start);
  assert.equal(start.scrollLeft, 0, 'nunca negativo');
  for (const [screen, params] of [[tabla, { g: 'FF9' }], [jornada, { g: 'FF9' }]]) {
    const own = { scrollLeft: 0, scrollWidth: 1300, clientWidth: 360, querySelector: () => chip };
    const el = { addEventListener: () => {}, querySelector: () => null };
    const root = { querySelector: (sel) => (sel === '.group-strip' ? own : sel === '[data-screen="jornada"]' ? el : null) };
    screen.mount(root, ctxFor(screen.id, { s: PORTAL_SEASON, ...params }, { myTeam: BENJ_FF5, datasets: datasetsFor({ current: withGroups(24) }) }));
    assert.equal(own.scrollLeft, 900 - (360 - 44) / 2, screen.id);
  }
});

test('navegador: el CSS de la tira (desliza en horizontal con ajuste) y casillas de 44 px', () => {
  const rules = cssRules();
  const body = (sel) => rules.filter((r) => r.media === null && r.selector.split(',').map((x) => x.trim()).includes(sel)).map((r) => r.body).join(';');
  assert.match(body('.group-strip'), /overflow-x:\s*auto/);
  assert.match(body('.group-strip'), /scroll-snap-type:\s*x/);
  // El texto oculto de las casillas (.vh, absoluto) se queda dentro de la tira: si no, la página
  // entera se desplazaba en horizontal (867 px a 320 de ancho con 24 grupos).
  assert.match(body('.group-strip'), /position:\s*relative/);
  assert.match(body('.evo-scroll'), /position:\s*relative/);
  const desk = rules.filter((r) => r.media && /min-width:\s*1024px/.test(r.media) && r.selector === '.group-strip').map((r) => r.body).join(';');
  assert.match(desk, /overflow:\s*visible/, 'en escritorio, todas a la vista');
  assert.match(body('.group-chip'), /min-height:\s*44px/);
  assert.match(body('.group-chip'), /min-width:\s*44px/);
  assert.match(body('.group-chip'), /scroll-snap-align/);
  assert.match(body('.group-chip[aria-current]'), /background:\s*var\(--ink\)/);
  assert.match(body('.group-chip.is-mine'), /background:\s*var\(--mark\)/);
  assert.match(body('.group-now'), /min-height:\s*(44|56)px/);
  for (const sel of ['.group-step', '.round-step']) assert.match(body(sel), /min-height:\s*56px/, sel);
  const out = [renderTabla({ g: 'FF9' }, { myTeam: BENJ_FF5, datasets: datasetsFor({ current: withGroups(24) }) }), renderJornada({ g: 'PG2' })].join('');
  const used = new Set(out.match(/class="[^"]+"/g).flatMap((m) => m.slice(7, -1).split(/\s+/)));
  assert.deepEqual([...used].filter((c) => !rules.classes.has(c)), [], 'clases que existen en acta.css');
});
