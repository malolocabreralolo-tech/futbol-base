// Navegación entre grupos (petición de las familias: «poder navegar en la web entre los distintos
// grupos para ir viendo los resultados de los otros grupos dentro de cada categoría»), en su forma
// simple (14/10/2026: «abajo tienes Jornada y Tabla y dentro también… hay muchas opciones»): una sola
// tira de fichas bajo la cabecera de Tabla y Jornada («Todos» delante en Jornada), «Mi grupo» u «Otras
// ligas» a la derecha de la cabecera, la barra de abajo que conserva el grupo que se mira y «Todos los
// grupos» de Jornada. Sin la Evolución del grupo: sus enlaces viejos abren la Tabla. El modelo
// (siblingGroups y competitionRound), las pantallas, la barra (tabTargets y updateTabbar) y el router,
// sobre las fixtures congeladas y nunca sobre los data-*.js vivos: render(ctx) es pura y se prueba
// sobre su HTML.
import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { fixture } from './fixtures/rediseno/load.mjs';
import { currentAt } from './fixtures/rediseno/simulate.mjs';
import { fakeBrowser } from './fixtures/rediseno/fake-browser.mjs';
import { ctxFor, cssRules, datasetsFor, pastSeasonRaw, PORTAL_SEASON } from './fixtures/rediseno/screens.mjs';
import { screen as tabla } from '../../src/screen-tabla.js';
import { screen as jornada } from '../../src/screen-jornada.js';
import { groupStrip, scrollToCurrent } from '../../src/ui.js';
import { historyMode, resolveParams, startRouter, tabTargets } from '../../src/router.js';
import { SCREEN_MAP } from '../../src/screens.js';
import { parseRoute, routeHref } from '../../src/links.js';
import { competitionRound, defaultRound, siblingGroups } from '../../src/model.js';
import * as model from '../../src/model.js';
import { myGroupIn } from '../../src/myteam.js';

const ids = (groups) => groups.map((g) => g.id);
const modelOf = (datasets = datasetsFor()) => ctxFor('tabla', {}, { datasets }).model;
const groupOf = (id, datasets) => modelOf(datasets).group(PORTAL_SEASON, id);
const str = (h) => String(h);
// Texto visible: sin etiquetas, con las entidades básicas resueltas y los espacios juntos.
const text = (h) => str(h).replace(/<[^>]*>/g, ' ').replace(/&quot;/g, '"').replace(/&#39;/g, "'")
  .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim();
const amp = (href) => href.replace(/&amp;/g, '&');
const renderTabla = (params, opts) => str(tabla.render(ctxFor('tabla', { s: PORTAL_SEASON, ...params }, opts)));
const renderJornada = (params, opts) => str(jornada.render(ctxFor('jornada', { s: PORTAL_SEASON, ...params }, opts)));
const notices = (out) => [...out.matchAll(/<p class="notice">(.*?)<\/p>/g)].map((m) => text(m[1]));
// La acción de la cabecera: [texto, enlace].
const action = (out) => {
  const m = out.match(/<a class="screen-action" href="([^"]*)">([^<]*)<\/a>/);
  return m ? [m[2], amp(m[1])] : null;
};
// Las fichas de la tira, en orden: { id, href, text, label, current, mine, all }.
const chips = (out) => [...out.matchAll(/<a class="group-chip( is-all)?( is-mine)?" id="([^"]+)" href="([^"]*)" aria-label="([^"]*)"( aria-current="true")?>(.*?)<\/a>/g)]
  .map((m) => ({ all: !!m[1], mine: !!m[2], id: m[3], href: amp(m[4]), label: m[5], current: !!m[6], text: text(m[7]) }));

// Mi equipo en benjamín: Las Mesas Hu. jugó la Primera Fase en FF5 (el resuelto, el 24/09/2026, es A2).
const BENJ_FF5 = { name: 'Las Mesas Hu.', season: PORTAL_SEASON, cat: 'benjamin', groupId: 'FF5' };
// El 20 de octubre de 2025, los cuatro grupos de la Primera Fase van por la jornada 3.
const OCT = (extra = {}) => ({ today: '2025-10-20', myTeam: BENJ_FF5, datasets: datasetsFor({ current: currentAt('2025-10-20') }), ...extra });

// La Primera Fase de benjamín con 24 grupos (los cuatro de la fixture más copias de FF15 con su código
// y su nombre), como la de 2026-27.
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
  const m = modelOf();
  const nav = siblingGroups(m, m.group(PORTAL_SEASON, 'FF9'));
  assert.deepEqual(ids(nav.list), ['FF5', 'FF9', 'FF13', 'FF15'], 'Grupo 9 antes que Grupo 13');
  assert.equal(nav.index, 1);
  assert.deepEqual([nav.prev.id, nav.next.id], ['FF5', 'FF13']);
  assert.deepEqual([nav.entry.cat, nav.entry.key, nav.entry.label], ['benjamin', 'primera-fase', 'Primera Fase']);
  const first = siblingGroups(m, m.group(PORTAL_SEASON, 'FF5'));
  assert.deepEqual([first.index, first.prev, first.next.id], [0, null, 'FF9']);
  const last = siblingGroups(m, m.group(PORTAL_SEASON, 'FF15'));
  assert.deepEqual([last.index, last.prev.id, last.next], [3, 'FF13', null]);
  // Cada fase, la suya: la Segunda Fase A no se mezcla con la B, ni benjamín con prebenjamín.
  assert.deepEqual(ids(siblingGroups(m, m.group(PORTAL_SEASON, 'A2')).list), ['A1', 'A2']);
  assert.deepEqual(ids(siblingGroups(m, m.group(PORTAL_SEASON, 'PG2')).list), ['PG2', 'PG3']);
});

test('siblingGroups: null con un solo grupo, para una copa o un torneo y sin grupo', () => {
  const m = modelOf();
  assert.equal(siblingGroups(m, m.group(PORTAL_SEASON, 'PFV2')), null, 'Fuerteventura, un solo grupo');
  assert.equal(siblingGroups(m, m.cups().groups.find((g) => g.kind !== 'league')), null);
  assert.equal(siblingGroups(m, null), null);
  // Una temporada pasada: la suya (2024-25 de B3 trae P3 y P9 de la Primera Fase; la de B2, solo P1).
  const b3 = modelOf(datasetsFor({ seasonRaw: { '2024-2025': fixture('historical-2024-2025-b3') } }));
  assert.deepEqual(ids(siblingGroups(b3, b3.group('2024-2025', 'P9')).list), ['P3', 'P9']);
  const b2 = modelOf(datasetsFor({ seasonRaw: { '2024-2025': pastSeasonRaw() } }));
  assert.equal(siblingGroups(b2, b2.group('2024-2025', 'P1')), null);
});

test('siblingGroups: con 24 grupos, del 1 al 24 en orden natural', () => {
  const m = modelOf(datasetsFor({ current: withGroups(24) }));
  const nav = siblingGroups(m, m.group(PORTAL_SEASON, 'FF5'));
  assert.equal(nav.list.length, 24);
  assert.deepEqual(ids(nav.list).slice(0, 3), ['FF1', 'FF2', 'FF3']);
  assert.equal(nav.list[23].id, 'FF24');
  assert.equal(nav.index, 4);
});

test('la Evolución del grupo ya no existe: ni groupProgression en el modelo ni sus vistas', () => {
  assert.equal(model.groupProgression, undefined);
  const out = renderTabla({ g: 'PG2', v: 'posiciones' });
  assert.doesNotMatch(out, /evo-|Evolución|Posiciones|Puesto tras cada jornada/);
  assert.match(out, /<nav class="tabla-views is-narrow"/, 'una v desconocida, la vista por defecto');
});

// ── competitionRound ─────────────────────────────────────────────────────

test('competitionRound: el número de la jornada por defecto del grupo de mi equipo; si no está, la más repetida', () => {
  const at = (today) => {
    const m = modelOf(datasetsFor({ current: currentAt(today) }));
    return (id) => m.group(PORTAL_SEASON, id);
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

// ── myGroupIn: el grupo de «Mi grupo» ────────────────────────────────────

test('myGroupIn: el de la competición que se mira si juega en ella; si no, el resuelto o el de esa temporada', () => {
  const ctx = ctxFor('tabla', {}, { myTeam: BENJ_FF5 });
  const season = ctx.model.season(PORTAL_SEASON);
  const ff = siblingGroups(ctx.model, ctx.model.group(PORTAL_SEASON, 'FF9')).list;
  assert.equal(myGroupIn(season, ctx.myTeam, ctx.resolution, ff).id, 'FF5', 'su grupo de la Primera Fase');
  // Fuera de su competición, el resuelto (el 24/09/2026, la temporada terminada: A2).
  assert.equal(myGroupIn(season, ctx.myTeam, ctx.resolution, []).id, ctx.resolution.group.id);
  // Una temporada pasada: el primero de liga en que aparece; sin él, null.
  const past = ctxFor('tabla', {}, { datasets: datasetsFor({ seasonRaw: { '2024-2025': pastSeasonRaw() } }) });
  assert.equal(myGroupIn(past.model.season('2024-2025'), past.myTeam, past.resolution).id, 'PGC2');
  const none = ctxFor('tabla', {}, { myTeam: { name: 'Nadie', season: PORTAL_SEASON, cat: 'benjamin', groupId: 'FF5' } });
  assert.equal(myGroupIn(none.model.season('2024-2025'), none.myTeam, none.resolution), null);
});

// ── La tira de grupos (groupStrip) ───────────────────────────────────────

test('groupStrip: una ficha por grupo con su número, el nombre completo para el lector, la actual y la mía; «Todos» delante y fuera de lo que se desliza', () => {
  const m = modelOf();
  const nav = siblingGroups(m, m.group(PORTAL_SEASON, 'PG3'));
  const out = str(groupStrip({ label: nav.entry.label, groups: nav.list, currentId: 'PG3', mineId: 'PG2', hrefFor: (g) => `#/tabla?g=${g.id}` }));
  assert.equal(out, '<nav class="group-strip" aria-label="Grupos de Gran Canaria"><div class="group-scroll">'
    + '<a class="group-chip is-mine" id="grupo-PG2" href="#/tabla?g=PG2" aria-label="Grupo 2, líder Unión Viera, mi grupo">2</a>'
    + '<a class="group-chip" id="grupo-PG3" href="#/tabla?g=PG3" aria-label="Grupo 3, líder UD Vecindario" aria-current="true">3</a></div></nav>');
  const all = str(groupStrip({ label: 'Gran Canaria', groups: nav.list, hrefFor: (g) => `#/jornada?g=${g.id}`, all: { href: '#/jornada?f=grancanaria', current: true } }));
  assert.match(all, /^<nav class="group-strip" aria-label="Grupos de Gran Canaria"><a class="group-chip is-all" id="grupo-todos" href="#\/jornada\?f=grancanaria" aria-label="Todos los grupos" aria-current="true">Todos<\/a><div class="group-scroll">/);
  assert.deepEqual(chips(all).filter((c) => c.current).map((c) => c.id), ['grupo-todos']);
  // Sin líder (nadie ha jugado), solo el nombre; un nombre que no es «Grupo N», entero.
  const fresh = fixture('current-2025-2026');
  fresh.prebenjamin.find((g) => g.id === 'PG3').standings.forEach((row) => { row[3] = 0; });
  const g3 = groupOf('PG3', datasetsFor({ current: fresh }));
  assert.match(str(groupStrip({ label: 'X', groups: [g3], hrefFor: () => '#' })), /aria-label="Grupo 3">3<\/a>/);
  const named = { ...g3, id: 'Z1', name: 'Fase A', label: 'Fase A' };
  assert.match(str(groupStrip({ label: 'X', groups: [named], hrefFor: () => '#' })), />Fase A<\/a>/);
});

test('Tabla (PG2, mi grupo): cabecera → tira → vistas → clasificación; la tira conserva la vista y a la derecha, «Otras ligas»', () => {
  const out = renderTabla({ g: 'PG2', v: 'forma' });
  assert.match(out, /<\/header><nav class="group-strip" aria-label="Grupos de Gran Canaria">/, 'debajo de la cabecera');
  assert.ok(out.indexOf('class="group-strip"') < out.indexOf('class="tabla-views') && out.indexOf('class="tabla-views') < out.indexOf('<h2 class="block-title">Clasificación'));
  assert.deepEqual(chips(out).map(({ id, href, current, mine }) => [id, href, current, mine]), [
    ['grupo-PG2', '#/tabla?s=2025-2026&g=PG2&v=forma', true, true],
    ['grupo-PG3', '#/tabla?s=2025-2026&g=PG3&v=forma', false, false],
  ]);
  assert.deepEqual(action(out), ['Otras ligas', '#/ligas?s=2025-2026&c=prebenjamin&i=grancanaria&to=tabla']);
  // Ni el atajo «Jornada | Tabla | Evolución», ni la caja «‹ Grupo N de M ›», ni la ficha «Todos».
  assert.doesNotMatch(out, /group-nav|group-steps|grupo-prev|aria-label="Ver el grupo"|ver-evolucion|grupo-todos/);
  // Puntos y Todas, las vistas por defecto, van sin v.
  assert.deepEqual(chips(renderTabla({ g: 'PG2', v: 'todas' })).map((c) => c.href), ['#/tabla?s=2025-2026&g=PG2', '#/tabla?s=2025-2026&g=PG3']);
});

test('Tabla de otro grupo (PG3): «Mi grupo» a la Tabla de mi grupo con la misma vista; sin hermanos (PFV2), sin tira', () => {
  assert.deepEqual(action(renderTabla({ g: 'PG3' })), ['Mi grupo', '#/tabla?s=2025-2026&g=PG2']);
  assert.deepEqual(action(renderTabla({ g: 'PG3', v: 'goles' })), ['Mi grupo', '#/tabla?s=2025-2026&g=PG2&v=goles']);
  const single = renderTabla({ g: 'PFV2' });
  assert.doesNotMatch(single, /group-strip|group-chip/);
  assert.deepEqual(action(single), ['Mi grupo', '#/tabla?s=2025-2026&g=PG2'], 'mi grupo, aunque sea de otra competición');
  // Sin mi equipo en esa temporada, «Otras ligas».
  const nobody = { myTeam: { name: 'Nadie', season: PORTAL_SEASON, cat: 'prebenjamin', groupId: 'PG2' } };
  assert.deepEqual(action(renderTabla({ g: 'PG3' }, nobody)), ['Otras ligas', '#/ligas?s=2025-2026&c=prebenjamin&i=grancanaria&to=tabla']);
});

test('con 24 grupos: una ficha por grupo, la actual con aria-current y la de mi equipo marcada; «Mi grupo», a la mía', () => {
  const opts = { myTeam: BENJ_FF5, datasets: datasetsFor({ current: withGroups(24) }) };
  const out = renderTabla({ g: 'FF9' }, opts);
  const list = chips(out);
  assert.equal(list.length, 24);
  assert.deepEqual(list.slice(0, 3).map((c) => [c.id, c.text, c.href]), [
    ['grupo-FF1', '1', '#/tabla?s=2025-2026&g=FF1'], ['grupo-FF2', '2', '#/tabla?s=2025-2026&g=FF2'], ['grupo-FF3', '3', '#/tabla?s=2025-2026&g=FF3']]);
  assert.deepEqual(list.filter((c) => c.current).map((c) => [c.id, c.label]), [['grupo-FF9', 'Grupo 9, líder AD Huracán']]);
  assert.deepEqual(list.filter((c) => c.mine).map((c) => [c.id, c.label]), [['grupo-FF5', 'Grupo 5, líder Las Mesas Hu., mi grupo']]);
  assert.deepEqual(action(out), ['Mi grupo', '#/tabla?s=2025-2026&g=FF5']);
});

test('Jornada de un grupo: cabecera → tira con «Todos» delante → «‹ Jornada N de M ›»; cada ficha, la jornada del mismo número', () => {
  const current = fixture('current-2025-2026');
  // FF13 con las claves de la fuente sin «Jornada» («1»…«5»); FF15 sin la jornada 3.
  current.history.FF13 = Object.fromEntries(Object.entries(current.history.FF13).map(([key, rows]) => [key.replace('Jornada ', ''), rows]));
  delete current.history.FF15['Jornada 3'];
  const opts = { myTeam: BENJ_FF5, datasets: datasetsFor({ current }) };
  const out = renderJornada({ g: 'FF9', r: 'Jornada 3' }, opts);
  assert.match(out, /<\/header><nav class="group-strip" aria-label="Grupos de Primera Fase"><a class="group-chip is-all" id="grupo-todos"/);
  assert.ok(out.indexOf('class="group-strip"') < out.indexOf('<nav class="round-nav"'), 'la tira, antes de la jornada');
  assert.deepEqual(chips(out).map(({ id, href, current, mine }) => [id, href, current, mine]), [
    ['grupo-todos', '#/jornada?s=2025-2026&c=benjamin&f=primera-fase&r=3', false, false],
    ['grupo-FF5', '#/jornada?s=2025-2026&g=FF5&r=Jornada%203', false, true],
    ['grupo-FF9', '#/jornada?s=2025-2026&g=FF9&r=Jornada%203', true, false],
    ['grupo-FF13', '#/jornada?s=2025-2026&g=FF13&r=3', false, false],
    ['grupo-FF15', '#/jornada?s=2025-2026&g=FF15', false, false],
  ]);
  // «Mi grupo»: la misma jornada en el de mi equipo.
  assert.deepEqual(action(out), ['Mi grupo', '#/jornada?s=2025-2026&g=FF5&r=Jornada%203']);
  // Ni la caja de grupos, ni el atajo, ni «Este grupo | Todos (N)».
  assert.doesNotMatch(out, /group-nav|round-scope|alcance-|aria-label="Ver el grupo"|Este grupo/);
  // En el mío, «Otras ligas»; sin grupos hermanos (PFV2), sin tira.
  assert.deepEqual(action(renderJornada({ g: 'FF5' }, opts)), ['Otras ligas', '#/ligas?s=2025-2026&c=benjamin&i=grancanaria&to=jornada']);
  assert.doesNotMatch(renderJornada({ g: 'PFV2' }), /group-strip/);
});

test('historial: cambiar de grupo con la tira o con «Mi grupo», y de un grupo a «Todos» y vuelta, es replace; de pantalla, push', () => {
  const R = parseRoute;
  assert.equal(historyMode(R('#/tabla?s=2025-2026&g=PG2'), R('#/tabla?s=2025-2026&g=PG3')), 'replace');
  assert.equal(historyMode(R('#/tabla?s=2025-2026&g=PG2&v=forma'), R('#/tabla?s=2025-2026&g=PG3&v=forma')), 'replace');
  assert.equal(historyMode(R('#/jornada?s=2025-2026&g=FF9&r=Jornada%203'), R('#/jornada?s=2025-2026&g=FF13&r=3')), 'replace');
  assert.equal(historyMode(R('#/jornada?s=2025-2026&g=FF5&r=Jornada%203'), R('#/jornada?s=2025-2026&c=benjamin&f=primera-fase&r=3')), 'replace', 'a «Todos»');
  assert.equal(historyMode(R('#/jornada?s=2025-2026&c=benjamin&f=primera-fase&r=3'), R('#/jornada?s=2025-2026&g=FF9&r=Jornada%203')), 'replace', 'de «Todos» a un grupo');
  assert.equal(historyMode(R('#/tabla?s=2025-2026&g=PG2'), R('#/jornada?s=2025-2026&g=PG2')), 'push', 'la barra cambia de pantalla');
  assert.equal(historyMode(R('#/tabla?s=2025-2026&g=PG2'), R('#/tabla?s=2024-2025&g=PG2')), 'push', 'otra temporada');
});

test('enlaces viejos de la Evolución (v=evolucion y v=posiciones): la vista por defecto de la Tabla, sin aviso', () => {
  for (const v of ['evolucion', 'posiciones']) {
    const res = resolveParams(parseRoute(`#/tabla?s=2025-2026&g=PG2&v=${v}`), ctxFor('tabla', {}));
    assert.deepEqual(res, { redirect: { screen: 'tabla', params: { s: '2025-2026', g: 'PG2' }, notice: null } }, v);
  }
});

test('mount: la tira se desliza hasta la ficha actual (o, en «Todos», hasta la mía), dentro de su caja y sin mover la página', () => {
  const chip = { offsetLeft: 900, offsetWidth: 44 };
  const strip = { scrollLeft: 0, scrollWidth: 1300, clientWidth: 360, querySelector: (sel) => (sel === '[aria-current]' ? chip : null) };
  scrollToCurrent(strip);
  assert.equal(strip.scrollLeft, 900 - (360 - 44) / 2, 'la actual, en medio');
  const first = { offsetLeft: 0, offsetWidth: 44 };
  const start = { scrollLeft: 50, scrollWidth: 1300, clientWidth: 360, querySelector: () => first };
  scrollToCurrent(start);
  assert.equal(start.scrollLeft, 0, 'nunca negativo');
  const mine = { scrollLeft: 0, scrollWidth: 1300, clientWidth: 360, querySelector: (sel) => (sel === '.is-mine' ? chip : null) };
  scrollToCurrent(mine);
  assert.equal(mine.scrollLeft, 900 - (360 - 44) / 2, 'sin actual en la tira («Todos»), la mía');
  for (const [screen, params] of [[tabla, { g: 'FF9' }], [jornada, { g: 'FF9' }]]) {
    const own = { scrollLeft: 0, scrollWidth: 1300, clientWidth: 360, querySelector: () => chip };
    const el = { addEventListener: () => {}, querySelector: () => null };
    const root = { querySelector: (sel) => (sel === '.group-scroll' ? own : sel === '[data-screen="jornada"]' ? el : null) };
    screen.mount(root, ctxFor(screen.id, { s: PORTAL_SEASON, ...params }, { myTeam: BENJ_FF5, datasets: datasetsFor({ current: withGroups(24) }) }));
    assert.equal(own.scrollLeft, 900 - (360 - 44) / 2, screen.id);
  }
});

test('CSS de la tira: se desliza dentro de su caja con ajuste, fichas de 44 px sin borde y con fondo suave; en escritorio, en filas', () => {
  const rules = cssRules();
  const body = (sel, media = (m) => m === null) => rules.filter((r) => media(r.media) && r.selector.split(',').map((x) => x.trim()).includes(sel)).map((r) => r.body).join(';');
  assert.match(body('.group-scroll'), /overflow-x:\s*auto/);
  assert.match(body('.group-scroll'), /scroll-snap-type:\s*x/);
  // offsetLeft de las fichas, relativo a su caja (scrollToCurrent), y lo absoluto de cada ficha dentro.
  assert.match(body('.group-scroll'), /position:\s*relative/);
  const desk = body('.group-scroll', (m) => m !== null && /min-width:\s*1024px/.test(m));
  assert.match(desk, /overflow:\s*visible/, 'en escritorio, todas a la vista');
  assert.match(desk, /flex-wrap:\s*wrap/);
  const chip = body('.group-chip');
  assert.match(chip, /min-height:\s*44px/);
  assert.match(chip, /min-width:\s*44px/);
  assert.match(chip, /scroll-snap-align/);
  assert.match(chip, /background:\s*var\(--line\)/, 'fondo suave');
  assert.doesNotMatch(chip, /border:/, 'sin borde');
  assert.match(body('.group-chip[aria-current]'), /background:\s*var\(--ink\)/);
  assert.match(body('.group-chip[aria-current]'), /color:\s*var\(--on-ink\)/);
  assert.match(body('.group-chip.is-mine'), /color:\s*var\(--ink\)/);
  assert.doesNotMatch(rules.filter((r) => /group-|match-day/.test(r.selector)).map((r) => r.body).join(';'), /dashed|dotted|dasharray/);
  const out = [renderTabla({ g: 'FF9' }, { myTeam: BENJ_FF5, datasets: datasetsFor({ current: withGroups(24) }) }), renderJornada({ g: 'PG2' }),
    renderJornada({ c: 'benjamin', f: 'primera-fase' }, OCT())].join('');
  const used = new Set(out.match(/class="[^"]+"/g).flatMap((m) => m.slice(7, -1).split(/\s+/)));
  assert.deepEqual([...used].filter((c) => !rules.classes.has(c)), [], 'clases que existen en acta.css');
  // Lo de la navegación anterior ya no está en la hoja.
  assert.deepEqual([...rules.classes].filter((c) => /^(group-(nav|steps|step|now|title|sub|views|index|day)|round-scope|evo-.*)$/.test(c)), []);
});

// ── La barra conserva el grupo (tabTargets y updateTabbar) ───────────────

test('tabTargets: en Jornada, Tabla y Partido de otro grupo, Jornada y Tabla llevan a ese grupo y su temporada', () => {
  const ctx = ctxFor('tabla', {});
  const at = (screen, params) => tabTargets({ screen, params: { s: PORTAL_SEASON, ...params } }, ctx);
  const pg3 = { jornada: '#/jornada?s=2025-2026&g=PG3', tabla: '#/tabla?s=2025-2026&g=PG3' };
  assert.deepEqual(at('tabla', { g: 'PG3', v: 'forma' }), pg3);
  assert.deepEqual(at('jornada', { g: 'PG3', r: 'Jornada 4' }), pg3);
  assert.deepEqual(at('partido', { g: 'PG3', r: 'Jornada 4', h: 'A', a: 'B' }), pg3);
  // El grupo de mi equipo, las pantallas sin grupo y un grupo que no es de liga: los de siempre.
  assert.deepEqual(at('tabla', { g: 'PG2' }), {});
  assert.deepEqual(at('jornada', { g: 'PG2', r: 'Jornada 4' }), {});
  for (const screen of ['', 'explorar', 'equipo', 'ligas']) assert.deepEqual(at(screen, { g: 'PG3' }), {}, screen);
  const cup = ctx.model.cups().groups.find((g) => g.kind !== 'league');
  assert.deepEqual(tabTargets({ screen: 'partido', params: { s: cup.season, g: cup.id } }, ctx), {});
  // Otra temporada: la suya, aunque sea el grupo de mi equipo de entonces.
  const past = ctxFor('tabla', {}, { datasets: datasetsFor({ seasonRaw: { '2024-2025': pastSeasonRaw() } }) });
  assert.deepEqual(tabTargets({ screen: 'tabla', params: { s: '2024-2025', g: 'PGC2' } }, past),
    { jornada: '#/jornada?s=2024-2025&g=PGC2', tabla: '#/tabla?s=2024-2025&g=PGC2' });
});

test('tabTargets en «Todos los grupos»: Jornada a esa vista y Tabla a la de mi grupo si está en la competición; si no, a la del primero', () => {
  const ctx = ctxFor('jornada', {}, { myTeam: BENJ_FF5 });
  const todos = (params, c = ctx) => tabTargets({ screen: 'jornada', params: { s: PORTAL_SEASON, ...params } }, c);
  // Mi equipo jugó la Primera Fase en FF5 (el resuelto, el 24/09/2026, es otro: A2).
  assert.deepEqual(todos({ c: 'benjamin', f: 'primera-fase', r: '3' }),
    { jornada: '#/jornada?s=2025-2026&c=benjamin&f=primera-fase', tabla: '#/tabla?s=2025-2026&g=FF5' });
  // Sin mi equipo en ella (el de siempre, PG2 de prebenjamín): la del primer grupo.
  assert.deepEqual(todos({ c: 'benjamin', f: 'primera-fase' }, ctxFor('jornada', {})).tabla, '#/tabla?s=2025-2026&g=FF5');
  assert.deepEqual(todos({ c: 'benjamin', f: 'segunda-b' }, ctxFor('jornada', {})).tabla, '#/tabla?s=2025-2026&g=B1');
  // Con mi grupo resuelto en ella, su Tabla de siempre.
  assert.deepEqual(todos({ c: 'prebenjamin', f: 'grancanaria' }, ctxFor('jornada', {})),
    { jornada: '#/jornada?s=2025-2026&c=prebenjamin&f=grancanaria', tabla: '#/tabla' });
});

test('la barra con el router: conserva el grupo que se mira, marca su pestaña y vuelve a la de mi grupo desde Mi equipo', async () => {
  const datasets = datasetsFor();
  const b = fakeBrowser('#/tabla?s=2025-2026&g=PG3');
  const router = startRouter({ screens: { ...SCREEN_MAP }, root: b.root, getContext: () => ctxFor('', {}, { datasets }), window: b.win });
  await router.idle();
  const hrefs = () => b.doc.querySelectorAll('.tabbar a.tab').map((t) => t.getAttribute('href'));
  assert.deepEqual(hrefs(), ['#/', '#/jornada?s=2025-2026&g=PG3', '#/tabla?s=2025-2026&g=PG3', '#/explorar']);
  assert.deepEqual(b.marks(), [['#/tabla?s=2025-2026&g=PG3', 'page']]);
  // La pestaña Jornada abre la jornada de PG3 (push) y sigue en PG3.
  b.click({ href: '#/jornada?s=2025-2026&g=PG3' });
  await router.idle();
  assert.equal(b.hash(), '#/jornada?s=2025-2026&g=PG3');
  assert.match(b.root.innerHTML, /<p class="screen-sub">Prebenjamín, Grupo 3 de Gran Canaria<\/p>/);
  assert.deepEqual(b.marks(), [['#/jornada?s=2025-2026&g=PG3', 'page']]);
  assert.deepEqual(b.entries(), ['#/tabla?s=2025-2026&g=PG3', '#/jornada?s=2025-2026&g=PG3']);
  // «Mi grupo» (replace): de vuelta en el mío, las pestañas de siempre.
  b.click({ href: '#/jornada?s=2025-2026&g=PG2' });
  await router.idle();
  assert.deepEqual(hrefs(), ['#/', '#/jornada', '#/tabla', '#/explorar']);
  assert.deepEqual(b.marks(), [['#/jornada', 'page']]);
  assert.equal(b.entries().length, 2, '«Mi grupo» cambia de grupo con replace');
  // Desde otro grupo, Mi equipo devuelve las pestañas al grupo de mi equipo.
  b.click({ href: '#/tabla?s=2025-2026&g=PG3' });
  await router.idle();
  assert.equal(hrefs()[2], '#/tabla?s=2025-2026&g=PG3');
  b.click({ href: '#/' });
  await router.idle();
  assert.deepEqual(hrefs(), ['#/', '#/jornada', '#/tabla', '#/explorar']);
  assert.deepEqual(b.marks(), [['#/', 'page']]);
  b.click({ href: '#/tabla' });
  await router.idle();
  assert.match(b.root.innerHTML, /<p class="screen-sub">Prebenjamín, Grupo 2 de Gran Canaria<\/p>/, 'la Tabla de mi grupo');
});

// ── Jornada: «Todos los grupos» de una competición (#/jornada?s&c&f&r, sin g) ──

const resolveAt = (hash, opts) => resolveParams(parseRoute(hash), ctxFor('jornada', {}, opts));
const redirectOf = (res) => (res.redirect ? [routeHref(res.redirect.screen, res.redirect.params), res.redirect.notice] : res);
const blocks = (out) => [...out.matchAll(/<section class="block" id="jornada-([^"]+)"><div class="block-head"><h2 class="block-title">(.*?)<\/h2>(?:<p class="block-context">(.*?)<\/p>)?<\/div>(.*?)<\/section>/g)]
  .map((m) => ({ id: m[1], title: text(m[2]), context: m[3] || '', body: m[4] }));
const matchTexts = (html) => [...html.matchAll(/<a class="match-row[^"]*" href="[^"]*">(.*?)<\/a>/g)].map((m) => text(m[1]));
test('router: «Todos los grupos» se elige con c y f, sin g; sin c, la de la competición; una que no existe, a Ligas con aviso', () => {
  assert.deepEqual(resolveAt('#/jornada?c=benjamin&f=primera-fase'), { params: { c: 'benjamin', f: 'primera-fase', s: PORTAL_SEASON } });
  assert.deepEqual(resolveAt('#/jornada?c=benjamin&f=primera-fase&r=3'), { params: { c: 'benjamin', f: 'primera-fase', r: '3', s: PORTAL_SEASON } });
  assert.deepEqual(redirectOf(resolveAt('#/jornada?f=grancanaria')), ['#/jornada?c=prebenjamin&f=grancanaria', null]);
  assert.deepEqual(redirectOf(resolveAt('#/jornada?c=benjamin&f=primera-fase&r=9')), ['#/jornada?c=benjamin&f=primera-fase', null], 'ningún grupo tiene la 9');
  assert.deepEqual(redirectOf(resolveAt('#/jornada?c=benjamin&f=nada')),
    ['#/ligas?c=benjamin&to=jornada', 'No encontramos la competición nada en la temporada 2025/26']);
  assert.deepEqual(redirectOf(resolveAt('#/jornada?g=PG2&c=prebenjamin&f=grancanaria')), ['#/jornada?g=PG2', null], 'con g, manda el grupo');
  const R = parseRoute;
  assert.equal(historyMode(R('#/jornada?s=2025-2026&c=benjamin&f=primera-fase&r=3'), R('#/jornada?s=2025-2026&c=benjamin&f=primera-fase&r=4')), 'replace');
});

test('Todos los grupos: la tira con «Todos» marcada, «‹ Jornada 3 de 5 ›» con las fechas de todos y un bloque compacto por grupo, el mío primero', () => {
  const out = renderJornada({ c: 'benjamin', f: 'primera-fase' }, OCT());
  assert.match(out, /^<section data-screen="jornada">/);
  assert.equal((out.match(/<h1[ >]/g) || []).length, 1);
  assert.match(out, /<h1>Jornada<\/h1><p class="screen-sub">Benjamín, Primera Fase<\/p>/);
  // Mi grupo está en la competición: a la derecha, «Otras ligas».
  assert.deepEqual(action(out), ['Otras ligas', '#/ligas?s=2025-2026&c=benjamin&i=grancanaria&to=jornada']);
  assert.deepEqual(chips(out).map(({ id, href, current, mine }) => [id, href, current, mine]), [
    ['grupo-todos', '#/jornada?s=2025-2026&c=benjamin&f=primera-fase&r=3', true, false],
    ['grupo-FF5', '#/jornada?s=2025-2026&g=FF5&r=Jornada%203', false, true],
    ['grupo-FF9', '#/jornada?s=2025-2026&g=FF9&r=Jornada%203', false, false],
    ['grupo-FF13', '#/jornada?s=2025-2026&g=FF13&r=Jornada%203', false, false],
    ['grupo-FF15', '#/jornada?s=2025-2026&g=FF15&r=Jornada%203', false, false],
  ]);
  assert.match(out, /<nav class="round-nav" aria-label="Jornadas"><a class="round-step" id="round-prev" href="#\/jornada\?s=2025-2026&amp;c=benjamin&amp;f=primera-fase&amp;r=2" aria-label="Jornada anterior: Jornada 2">‹<\/a><div class="round-now"><h2 class="round-title">Jornada 3 de 5<\/h2><p class="round-dates">del 24 al 26 de octubre<\/p><\/div><a class="round-step" id="round-next" href="#\/jornada\?s=2025-2026&amp;c=benjamin&amp;f=primera-fase&amp;r=4"/);
  assert.ok(out.indexOf('class="group-strip"') < out.indexOf('class="round-nav"') && out.indexOf('class="round-nav"') < out.indexOf('class="round-groups"'));
  const list = blocks(out);
  assert.deepEqual(list.map((b) => [b.id, b.title]), [['FF5', 'Grupo 5 · mi grupo'], ['FF9', 'Grupo 9'], ['FF13', 'Grupo 13'], ['FF15', 'Grupo 15']]);
  // Cabecera compacta: el nombre y el enlace discreto «tabla ›» (su nombre completo, para el lector).
  assert.equal(list[0].context, '<a class="block-link" href="#/tabla?s=2025-2026&amp;g=FF5" aria-label="Grupo 5: tabla">tabla ›</a>');
  // Una sola caja por grupo, con el día encima de sus partidos (matchRow, el de mi equipo primero).
  assert.match(list[0].body, /^<div class="box"><h3 class="match-day">Domingo 26 de octubre<\/h3><a class="match-row is-mine"/);
  assert.equal(matchTexts(list[0].body).length, 3);
  assert.equal((list[3].body.match(/<div class="box">/g) || []).length, 1, 'FF15: tres días en una caja');
  assert.deepEqual([...list[3].body.matchAll(/<h3 class="match-day">(.*?)<\/h3>/g)].map((m) => m[1]),
    ['Viernes 24 de octubre', 'Sábado 25 de octubre', 'Domingo 26 de octubre']);
  assert.equal((out.match(/class="match-row is-mine"/g) || []).length, 1);
  assert.ok(list.slice(1).every((b) => matchTexts(b.body).length === 3));
  // Sin el índice de anclas, ni «Mi grupo | Todos (N)», ni la botonera de un grupo.
  assert.doesNotMatch(out, /group-index|href="#jornada-|alcance-|Grupos de la jornada|share-round|group-day/);
});

test('Todos los grupos: alineada por número (claves distintas entre grupos), el grupo sin esa jornada y, sin mi grupo en ella, «Mi grupo»', () => {
  const current = currentAt('2025-10-20');
  current.history.FF13 = Object.fromEntries(Object.entries(current.history.FF13).map(([key, rows]) => [key.replace('Jornada ', ''), rows]));
  delete current.history.FF15['Jornada 3'];
  const out = renderJornada({ c: 'benjamin', f: 'primera-fase', r: '3' }, OCT({ datasets: datasetsFor({ current }) }));
  const list = blocks(out);
  assert.equal(matchTexts(list.find((b) => b.id === 'FF13').body).length, 3, 'FF13 con la clave «3»');
  assert.match(list.find((b) => b.id === 'FF15').body, /<p class="empty">Este grupo no tiene jornada 3\.<\/p>/);
  assert.equal(chips(out).find((c) => c.id === 'grupo-FF15').href, '#/jornada?s=2025-2026&g=FF15', 'sin la 3, a su jornada por defecto');
  // Sin mi equipo en la competición (el de siempre, PG2): la jornada más repetida, por orden, y «Mi grupo»,
  // a la jornada de mi grupo de prebenjamín.
  const other = renderJornada({ c: 'benjamin', f: 'primera-fase' }, OCT({ myTeam: undefined }));
  assert.match(other, /<h2 class="round-title">Jornada 3 de 5<\/h2>/);
  assert.deepEqual(blocks(other).map((b) => b.title), ['Grupo 5', 'Grupo 9', 'Grupo 13', 'Grupo 15']);
  assert.deepEqual(chips(other).filter((c) => c.mine), []);
  assert.deepEqual(action(other), ['Mi grupo', '#/jornada?s=2025-2026&g=PG2']);
});

test('Todos los grupos: el aviso del que descansa en cada grupo (PG2 y PG3, jornada 30)', () => {
  const out = renderJornada({ c: 'prebenjamin', f: 'grancanaria', r: '30' });
  const pg2 = blocks(out).find((b) => b.id === 'PG2');
  assert.equal(pg2.title, 'Grupo 2 · mi grupo');
  assert.deepEqual(notices(pg2.body), ['Sin partido en esta jornada: RC Victoria y Arucas B (descansa o le tocaba contra CD Batán)']);
  assert.equal(notices(blocks(out).find((b) => b.id === 'PG3').body).length, 1);
});
