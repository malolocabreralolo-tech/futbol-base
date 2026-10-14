// Pantalla Tabla (spec §4.4 y §4.8; maqueta 5-2). render(ctx) es pura: el selector de vistas
// (cinco en móvil; Todas, Casa y Fuera en escritorio), la clasificación con la fila propia,
// la forma, casa y fuera con su cobertura, los goleadores del grupo, la procedencia y
// «Otro grupo». Una sola tabla: por debajo de 1024 px el CSS deja las columnas de la vista.
// La Evolución del grupo (v=evolucion y v=posiciones) va en la misma pantalla: la línea de puntos de
// cada equipo o la rejilla de su puesto tras cada jornada, calculadas con el calendario. Bajo la
// cabecera, los otros grupos de la competición («‹ Grupo 5 de 24 ›») y el atajo a Jornada y Evolución.
import { html } from './html.js';
import {
  block, screenHead, standingsTable, segmented, crest, notice, empty, listEs, sourcePhrase, pointsChart, groupNav, groupViews,
  scrollToCurrent,
} from './ui.js';
import { errorBox } from './shell.js';
import {
  lastResults, homeAwayTable, retiredTeams, groupFinished, groupProgression, playerName, sourceInfo, seasonLabel,
  siblingGroups,
} from './model.js';
import { routeHref, teamHref } from './links.js';
import { groupScorers, seasonNeeds } from './state.js';
import { myTeamIn } from './myteam.js';

const NARROW = [['puntos', 'Puntos'], ['goles', 'Goles'], ['forma', 'Forma'], ['casa', 'Casa'], ['fuera', 'Fuera']]
  .map(([value, label]) => ({ value, label }));
// Escritorio: todas las columnas y, además, Casa y Fuera (decisión 15 de B1).
const WIDE = [['todas', 'Todas'], ['casa', 'Casa'], ['fuera', 'Fuera']].map(([value, label]) => ({ value, label }));
// La Evolución del grupo: la línea de puntos de cada equipo (v=evolucion) o su puesto tras cada
// jornada (v=posiciones); los ids, evo-puntos y evo-posiciones.
const EVOLUTION = [['puntos', 'Puntos'], ['posiciones', 'Posiciones']].map(([value, label]) => ({ value, label }));
const VIEWS = ['puntos', 'goles', 'forma', 'casa', 'fuera', 'todas', 'evolucion', 'posiciones'];

// Cobertura de Casa y Fuera (spec §7), que salen del calendario: los partidos con resultado
// entre equipos activos frente a los que cuenta la clasificación oficial (la suma de J entre
// dos). null si cuadran. `exact`: la única diferencia son los partidos de los retirados.
export function homeAwayCoverage(group) {
  const retired = retiredTeams(group);
  const rows = group.standings || [];
  const played = rows.reduce((n, row) => n + (row.pj || 0), 0);
  const gone = rows.filter(row => retired.has(row.team) && row.pj > 0);
  const vsRetired = gone.reduce((n, row) => n + row.pj, 0);
  let calendar = 0;
  for (const round of group.rounds || []) {
    for (const m of round.matches) {
      if (m.hs != null && m.as != null && !retired.has(m.home) && !retired.has(m.away)) calendar += 1;
    }
  }
  const official = Math.round(played / 2);
  if (calendar === official) return null;
  return { calendar, official, vsRetired, retired: gone.map(row => row.team), exact: calendar === official - vsRetired };
}

// Los retirados con J > 0 nunca están en el calendario (regla 1 de retiredTeams).
function coverageText(c) {
  const whom = `${listEs(c.retired)} (${c.retired.length > 1 ? 'retirados' : 'retirado'})`;
  if (c.exact) return `No cuenta los ${c.vsRetired} partidos contra ${whom}, que no están en el calendario.`;
  const also = c.vsRetired ? `, ${c.vsRetired} de ellos contra ${whom}` : '';
  return `Con los ${c.calendar} partidos con resultado del calendario; la clasificación oficial cuenta ${c.official}${also}.`;
}

// Casa y Fuera de la federación (su clasificación detallada, group.official), si cuadra con la
// clasificación (los partidos de casa y fuera de cada equipo suman los suyos): las filas de la vista,
// por puntos (3 por victoria y 1 por empate) y victorias; null si no hay o no cuadra (una detallada
// de otra jornada).
export function officialHomeAway(group, side) {
  const official = group && group.official;
  if (!official || !(group.standings || []).length) return null;
  const i = side === 'casa' ? 0 : 4;
  const rows = [];
  for (const row of group.standings) {
    const o = official[row.team];
    if (!Array.isArray(o) || o[0] == null || o[4] == null || o[0] + o[4] !== row.pj) return null;
    rows.push({ team: row.team, pj: o[i], g: o[i + 1], e: o[i + 2], p: o[i + 3], pts: 3 * o[i + 1] + o[i + 2],
      gf: null, gc: null, dg: null, retired: row.retired });
  }
  rows.sort((a, b) => a.retired - b.retired || b.pts - a.pts || b.g - a.g);
  return rows.map((row, k) => ({ ...row, pos: k + 1 }));
}

// Qué significa cada puesto de la tabla (app de futbolaspalmas, group.zones):
// «1.º–4.º: Eliminatorias determinar FASE · 5.º: FASE “E” · 6.º: FASE “F”», o null.
const ZONE_WORD = { ascenso: 'Ascenso', playoff: 'Playoff', copa: 'Copa', promocion: 'Promoción', descenso: 'Descenso' };
export function zonesText(group) {
  const zones = Array.isArray(group && group.zones) ? group.zones : [];
  const parts = zones.filter((z) => Array.isArray(z) && Number.isFinite(z[0]) && Number.isFinite(z[1]))
    .map(([from, to, kind, text]) => `${from === to ? `${from}.º` : `${from}.º–${to}.º`}: ${text || ZONE_WORD[kind] || kind}`);
  return parts.length ? parts.join(' · ') : null;
}

// Los puntos de sanción que pone la federación (clasificación detallada): «Las Mesas Hu. (3 puntos)».
export function sanctionsText(group) {
  const official = (group && group.official) || {};
  const list = Object.entries(official).filter(([, row]) => Array.isArray(row) && row[8] > 0)
    .map(([team, row]) => `${team} (${row[8]} ${row[8] === 1 ? 'punto' : 'puntos'})`);
  return list.length ? listEs(list) : null;
}

// «jornada 30, final»: hasta dónde llega la clasificación.
function standingsContext(group, today, portalSeason) {
  const round = group.currentRound && group.rounds.find(r => r.key === group.currentRound);
  const done = groupFinished(group, today, portalSeason);
  if (!round) return done ? 'final' : null;
  return `${round.label.toLowerCase()}${done ? ', final' : ''}`;
}

function scorersBlock(group, scorers, historical, shields) {
  const s = group.season;
  if (!scorers || !scorers.length) {
    const why = historical ? 'No hay goleadores de esta temporada en esta web.'
      : scorers ? 'Todavía no hay goles registrados en este grupo.'
        : 'La fuente de este grupo no publica goleadores.';
    return block('Goleadores del grupo', empty(why));
  }
  const all = scorers.length > 10
    ? html`<a class="block-link" href="${routeHref('goleadores', { s, g: group.id })}">ver todos (${scorers.length})</a>` : null;
  const rows = scorers.slice(0, 10).map(row => html`<tr><th scope="row" class="st-team"><span class="st-label">${crest(row.team, { shields })}<span class="st-name">${playerName(row.name)}</span><span class="vh">, ${row.team}</span></span></th><td class="sc-goals">${row.goals}</td><td class="sc-pj">${row.games}</td></tr>`);
  return block('Goleadores del grupo', html`<div class="box"><table class="standings group-scorers"><caption class="vh">Goleadores del grupo</caption><thead><tr><th scope="col" class="st-team">Jugador</th><th scope="col" class="sc-goals">Goles</th><th scope="col" class="sc-pj"><abbr title="Partidos jugados">PJ</abbr></th></tr></thead><tbody>${rows}</tbody></table></div>`, { context: all });
}

// Lo que la Tabla añade a la frase de procedencia (sourcePhrase, ui.js): la advertencia de una
// clasificación calculada o corregida, o el punto.
const SOURCE_TAIL = {
  calculada: ': puede no reflejar sanciones ni desempates de la federación.',
  corregida: ': consulta la fuente por si hay sanciones.',
};

// Procedencia (sourceInfo de model.js, que devuelve datos: decisión 3 del esqueleto).
function sourceLine(group, historical) {
  const info = sourceInfo(group, historical);
  const say = `${sourcePhrase(info)}${SOURCE_TAIL[info.kind] || '.'}`;
  const archive = historical ? ` Archivo de la temporada ${seasonLabel(group.season)}.` : '';
  return html`<p class="notice source-line">${say}${archive}${info.url ? html` <a class="source-link" href="${info.url}" target="_blank" rel="noopener noreferrer">Ver fuente</a>` : ''}</p>`;
}

// ── Evolución del grupo (groupProgression de model.js) ──────────────────

const CALCULATED = 'Calculada desde el calendario: sin desempates ni sanciones de la federación.';

// Lo que la evolución, que sale del calendario, no cuadra con la clasificación oficial: la cobertura
// de Casa y Fuera (los partidos que no están en el calendario) o, si cuentan los mismos, los equipos a
// los que la oficial da otros puntos, sin inventar la causa (decisión 163 de B3). null si cuadra.
function evolutionNote(group, evo) {
  const coverage = homeAwayCoverage(group);
  if (coverage) return notice(null, coverageText(coverage));
  const official = new Map((group.standings || []).map(row => [row.team, row.pts]));
  const off = evo.rows.filter(row => !row.retired && official.has(row.team) && official.get(row.team) != null
    && row.pts[evo.played - 1] !== official.get(row.team)).map(row => row.team);
  return off.length ? notice('Nota:', `la clasificación oficial da otros puntos a ${listEs(off)}.`) : null;
}

// Puntos: una fila por equipo en el orden de la clasificación (#, escudo y nombre), su línea de puntos
// jornada a jornada con el mismo tope para todos (pointsChart: sólida, en tinta, decorativa) y los Pts
// de la clasificación en texto. El retirado, con la palabra y sin línea.
function evolutionPoints(group, evo, { mine, shields, s }) {
  const official = new Map((group.standings || []).map(row => [row.team, row]));
  const max = Math.max(0, ...evo.rows.map(row => row.pts[evo.played - 1] ?? 0));
  const body = evo.rows.map((row, i) => {
    const own = official.get(row.team);
    const isMine = mine != null && row.team === mine;
    const line = row.retired ? html`<span class="st-retired">retirado</span>` : pointsChart(row.pts.map(pts => ({ pts })), { max });
    return html`<tr${isMine ? html` class="is-mine"` : ''}><td class="st-pos">${own && own.pos != null ? own.pos : i + 1}</td><th scope="row" class="st-team"><a class="st-link" href="${teamHref(s, group.id, row.team)}">${crest(row.team, { shields })}<span class="st-name">${row.team}</span></a>${isMine ? html`<span class="vh"> (mi equipo)</span>` : ''}</th><td class="evo-line">${line}</td><td class="st-pts">${own ? own.pts : row.pts[evo.played - 1]}</td></tr>`;
  });
  return html`<div class="box"><table class="standings evo-table"><caption class="vh">Evolución de puntos de ${group.label}</caption><thead><tr><th scope="col" class="st-pos"><abbr title="Posición">#</abbr></th><th scope="col" class="st-team">Equipo</th><th scope="col" class="evo-line">Jornada a jornada</th><th scope="col" class="st-pts"><abbr title="Puntos">Pts</abbr></th></tr></thead><tbody>${body}</tbody></table></div>`;
}

// Posiciones: la rejilla de su puesto tras cada jornada jugada, una columna por jornada, con el equipo
// en la primera columna, fija, y el resto deslizándose dentro de la caja (mount la lleva al final); el
// líder de cada jornada, en tinta, y mi fila con el resalte propio. Una tabla de verdad.
function evolutionGrid(group, evo, { mine, shields, s }) {
  const rounds = evo.rounds.slice(0, evo.played);
  const head = rounds.map(r => html`<th scope="col"><abbr title="${r.label}">${r.n ?? r.label}</abbr></th>`);
  const body = evo.rows.map((row) => {
    const isMine = mine != null && row.team === mine;
    const cells = row.retired
      ? html`<td class="evo-retired" colspan="${rounds.length}"><span class="st-retired">retirado</span></td>`
      : rounds.map((r, i) => (row.pos[i] === 1 ? html`<td class="is-leader">1</td>` : html`<td>${row.pos[i]}</td>`));
    return html`<tr${isMine ? html` class="is-mine"` : ''}><th scope="row" class="evo-team"><a class="st-link" href="${teamHref(s, group.id, row.team)}">${crest(row.team, { shields })}<span class="st-name">${row.team}</span></a>${isMine ? html`<span class="vh"> (mi equipo)</span>` : ''}</th>${cells}</tr>`;
  });
  return html`<div class="box evo-scroll" role="region" aria-label="Puesto tras cada jornada; se desliza en horizontal" tabindex="0"><table class="evo-grid"><caption class="vh">Puesto de cada equipo tras cada jornada en ${group.label}</caption><thead><tr><th scope="col" class="evo-team">Equipo</th>${head}</tr></thead><tbody>${body}</tbody></table></div>`;
}

// La vista Evolución: «Puntos | Posiciones», el bloque y sus avisos; con menos de dos jornadas
// jugadas, el vacío.
function evolutionView(group, v, opts) {
  const href = value => routeHref('tabla', { s: opts.s, g: group.id, v: value === 'puntos' ? 'evolucion' : value });
  const views = html`<nav class="evo-views" aria-label="Evolución del grupo">${segmented(EVOLUTION, v === 'posiciones' ? v : 'puntos', href, { idPrefix: 'evo' })}</nav>`;
  const title = v === 'posiciones' ? 'Puesto tras cada jornada' : 'Evolución de puntos';
  const evo = groupProgression(group);
  if (evo.played < 2) {
    return html`${views}${block(title, empty('Todavía no hay evolución: se ve a partir de la segunda jornada jugada.'))}`;
  }
  const content = v === 'posiciones' ? evolutionGrid(group, evo, opts) : evolutionPoints(group, evo, opts);
  const note = evolutionNote(group, evo);
  return html`${views}${block(title, content, { context: 'desde el calendario' })}${notice(null, CALCULATED)}${note || ''}`;
}

function render(ctx) {
  const { params, model, today } = ctx;
  const shields = (ctx.datasets && ctx.datasets.shields) || {};
  const s = params.s || ctx.portal.season;
  // «Otro grupo»: con grupos hermanos, directo a la lista de los de su competición (f); si no, a las
  // ligas de su categoría y su isla.
  const other = (g, nav = null) => ({ href: routeHref('ligas', { s, c: g && g.cat, i: g && g.island, f: nav ? g.compKey : '', to: 'tabla' }), label: 'Otro grupo' });
  // Sin la temporada (needs no la trajo): la caja de error, nunca otra temporada (§7).
  if (!model.season(s)) {
    return html`<section data-screen="tabla">${screenHead('Tabla', { action: other(null) })}${errorBox(`la temporada ${seasonLabel(s)}`)}</section>`;
  }
  const group = model.group(s, params.g);
  if (!group) {
    const why = params.g ? `No hay ningún grupo ${params.g} en la temporada ${seasonLabel(s)}.` : 'Elige un grupo en «Otro grupo».';
    return html`<section data-screen="tabla">${screenHead('Tabla', { action: other(null) })}${empty(why)}</section>`;
  }
  const historical = s !== ctx.portal.season;
  const v = VIEWS.includes(params.v) ? params.v : 'puntos';
  const evolution = v === 'evolucion' || v === 'posiciones';
  // Los otros grupos de su competición, «‹ Grupo 5 de 24 ›» (conservan la vista), y el atajo a la
  // Jornada y a la Evolución del grupo, debajo de la cabecera.
  const siblings = siblingGroups(model, group);
  const mineId = siblings && (siblings.list.find(g => myTeamIn(g, ctx.myTeam, ctx.resolution)) || {}).id;
  const keep = v === 'puntos' || v === 'todas' ? '' : v;
  const groupBar = html`${siblings ? groupNav(siblings, {
    hrefFor: g => routeHref('tabla', { s, g: g.id, v: keep }),
    listHref: routeHref('ligas', { s, c: group.cat, f: group.compKey, to: 'tabla' }), mineId,
  }) : ''}${groupViews(group, evolution ? 'evolucion' : 'tabla')}`;
  const head = html`${screenHead('Tabla', { sub: historical ? `${group.label} · ${seasonLabel(s)}` : group.label, action: other(group, siblings) })}${groupBar}`;
  if (evolution) {
    const mine = myTeamIn(group, ctx.myTeam, ctx.resolution);
    return html`<section data-screen="tabla">${head}${evolutionView(group, v, { mine, shields, s })}</section>`;
  }
  const scorers = scorersBlock(group, groupScorers(model.scorers(s, group.cat), group.id), historical, shields);
  const source = sourceLine(group, historical);
  if (!group.standings.length) {
    return html`<section data-screen="tabla">${head}${block('Clasificación', empty('Clasificación sin publicar.'))}${scorers}${source}</section>`;
  }
  const side = v === 'casa' || v === 'fuera' ? v : null;
  // Puntos (móvil) y Todas (escritorio) son la vista por defecto: sin `v` en el enlace.
  const href = value => routeHref('tabla', { s, g: group.id, v: value === 'puntos' || value === 'todas' ? '' : value });
  const views = html`<nav class="tabla-views is-narrow" aria-label="Vista de la tabla">${segmented(NARROW, v === 'todas' ? 'puntos' : v, href, { idPrefix: 'vista' })}</nav><nav class="tabla-views is-wide" aria-label="Vista de la tabla">${segmented(WIDE, side || 'todas', href, { idPrefix: 'vista-ancha' })}</nav>`;
  const mine = myTeamIn(group, ctx.myTeam, ctx.resolution);
  const common = { mine, shields, hrefFor: row => teamHref(s, group.id, row.team) };
  let table;
  if (side) {
    const where = side === 'casa' ? 'en casa' : 'fuera de casa';
    const official = officialHomeAway(group, side);
    const coverage = official ? null : homeAwayCoverage(group);
    table = block(`Clasificación ${where}`, html`<div class="box">${standingsTable(official || homeAwayTable(group, side), { ...common, view: side, caption: `Clasificación ${where} de ${group.label}` })}</div>${coverage ? notice(null, coverageText(coverage)) : ''}`,
      { context: official ? 'según la federación' : 'desde el calendario' });
  } else {
    const rows = group.standings.map(row => ({ ...row, form: lastResults(row.team, group).map(x => x.letter) }));
    table = block('Clasificación', html`<div class="box tabla-${v === 'todas' ? 'puntos' : v}">${standingsTable(rows, { ...common, view: 'todas', caption: `Clasificación de ${group.label}` })}</div>`,
      { context: standingsContext(group, today, ctx.portal.season) });
  }
  const zones = zonesText(group);
  const sanctions = sanctionsText(group);
  const extra = html`${zones ? notice('Qué se juega cada puesto:', zones) : ''}${sanctions ? notice('Puntos de sanción:', sanctions) : ''}`;
  return html`<section data-screen="tabla">${head}${views}${table}${extra}${scorers}${source}</section>`;
}

// Al montar, la tira de grupos se desliza hasta el actual y la rejilla de posiciones, hasta las últimas
// jornadas, cada una dentro de su caja: la página no se mueve (scrollLeft, nunca scrollIntoView).
function mount(root) {
  scrollToCurrent(root.querySelector('.group-strip'));
  const grid = root.querySelector('.evo-scroll');
  if (grid) grid.scrollLeft = Math.max(0, grid.scrollWidth - grid.clientWidth);
}

export const screen = {
  id: 'tabla',
  needs: (params, datasets, { portalSeason } = {}) => seasonNeeds(params.s, datasets, portalSeason),
  render,
  mount,
};
