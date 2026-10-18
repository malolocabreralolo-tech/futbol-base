// Pantalla Tabla (spec §4.4 y §4.8; maqueta 5-2). render(ctx) es pura: el selector de vistas
// (cinco en móvil; Todas, Casa y Fuera en escritorio), la clasificación con la fila propia,
// la forma, casa y fuera con su cobertura, los goleadores del grupo y la procedencia. Bajo la
// cabecera, la tira de los grupos de su competición (groupStrip), y a su derecha, «Mi grupo» o
// «Otras ligas». Una sola tabla: por debajo de 1024 px el CSS deja las columnas de la vista.
import { html } from './html.js';
import {
  block, screenHead, standingsTable, segmented, crest, notice, empty, listEs, sourcePhrase, groupStrip, scrollToCurrent,
} from './ui.js';
import { errorBox } from './shell.js';
import { lastResults, homeAwayTable, retiredTeams, groupFinished, playerName, sourceInfo, seasonLabel, siblingGroups } from './model.js';
import { routeHref, teamHref } from './links.js';
import { groupScorers, seasonNeeds } from './state.js';
import { myGroupIn, myTeamIn } from './myteam.js';

const NARROW = [['puntos', 'Puntos'], ['goles', 'Goles'], ['forma', 'Forma'], ['casa', 'Casa'], ['fuera', 'Fuera']]
  .map(([value, label]) => ({ value, label }));
// Escritorio: todas las columnas y, además, Casa y Fuera (decisión 15 de B1).
const WIDE = [['todas', 'Todas'], ['casa', 'Casa'], ['fuera', 'Fuera']].map(([value, label]) => ({ value, label }));
const VIEWS = ['puntos', 'goles', 'forma', 'casa', 'fuera', 'todas'];

// Cobertura de Casa y Fuera (spec §7), que salen del calendario: los partidos con resultado
// entre equipos activos frente a los que cuenta la clasificación oficial. null si cuadran.
// `exact`: la única diferencia son los partidos de los retirados. Un retirado de la tabla cuenta
// cada partido en su fila y en la del rival (la suma de J entre dos); uno que la tabla ya no lista
// (AL15 de 2026-27), solo en la del rival, y solo si la federación da por buenos sus resultados
// administrativos: lo dice el J de cada rival frente a sus partidos con resultado. `absent`: ninguno
// de esos retirados está en el calendario.
export function homeAwayCoverage(group) {
  const retired = retiredTeams(group);
  const rows = group.standings || [];
  const listed = new Set(rows.map(row => row.team));
  const played = rows.reduce((n, row) => n + (row.pj || 0), 0);
  const gone = rows.filter(row => retired.has(row.team) && row.pj > 0);
  const names = gone.map(row => row.team);
  const inCalendar = new Set();
  const withResult = new Map();   // partidos con resultado de cada equipo activo de la tabla
  const vsOutside = new Map();    // de ellos, contra un retirado que la tabla no lista
  const outside = new Set();
  let calendar = 0;
  for (const round of group.rounds || []) {
    for (const m of round.matches) {
      inCalendar.add(m.home);
      inCalendar.add(m.away);
      if (m.hs == null || m.as == null) continue;
      if (!retired.has(m.home) && !retired.has(m.away)) calendar += 1;
      for (const [team, rival] of [[m.home, m.away], [m.away, m.home]]) {
        if (retired.has(team) || !listed.has(team)) continue;
        withResult.set(team, (withResult.get(team) || 0) + 1);
        if (retired.has(rival) && !listed.has(rival)) {
          vsOutside.set(team, (vsOutside.get(team) || 0) + 1);
          outside.add(rival);
        }
      }
    }
  }
  let counted = 0;
  for (const row of rows) {
    const out = vsOutside.get(row.team) || 0;
    if (out) counted += Math.min(out, Math.max(0, (row.pj || 0) - ((withResult.get(row.team) || 0) - out)));
  }
  if (counted) names.push(...outside);
  const official = Math.round((played + counted) / 2);
  if (calendar === official) return null;
  const vsRetired = gone.reduce((n, row) => n + row.pj, 0) + counted;
  return { calendar, official, vsRetired, retired: names, exact: calendar === official - vsRetired,
    absent: names.every(team => !inCalendar.has(team)) };
}

// La nota de cobertura de homeAwayCoverage, en número con sus cifras: un solo partido contra el
// retirado (2017-18 GC4, 2023-24 PFV3) es «el partido», no «los 1 partidos».
export function coverageText(c) {
  const whom = `${listEs(c.retired)} (${c.retired.length > 1 ? 'retirados' : 'retirado'})`;
  if (c.exact) {
    const one = c.vsRetired === 1;
    return `No cuenta ${one ? 'el partido' : `los ${c.vsRetired} partidos`} contra ${whom}${
      c.absent ? `, que no ${one ? 'está' : 'están'} en el calendario` : ''}.`;
  }
  const also = c.vsRetired ? `, ${c.vsRetired === 1 ? 'uno' : c.vsRetired} de ellos contra ${whom}` : '';
  const calendar = c.calendar === 1 ? 'el partido' : `los ${c.calendar} partidos`;
  return `Con ${calendar} con resultado del calendario; la clasificación oficial cuenta ${c.official}${also}.`;
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
// La oficial que la web ha ordenado por puntos (group.reordered: points_order de generate_js.py), en
// la temporada del portal: la federación la publica por puntos por partido (PG2 de 2026-27).
const REORDERED_TAIL = ', ordenada por puntos: la federación ordena este grupo por puntos por partido.';

// Procedencia (sourceInfo de model.js, que devuelve datos: decisión 3 del esqueleto).
function sourceLine(group, historical) {
  const info = sourceInfo(group, historical);
  const reordered = group.reordered && !historical && info.kind === 'oficial';
  const say = `${sourcePhrase(info)}${reordered ? REORDERED_TAIL : SOURCE_TAIL[info.kind] || '.'}`;
  const archive = historical ? ` Archivo de la temporada ${seasonLabel(group.season)}.` : '';
  return html`<p class="notice source-line">${say}${archive}${info.url ? html` <a class="source-link" href="${info.url}" target="_blank" rel="noopener noreferrer">Ver fuente</a>` : ''}</p>`;
}

// La acción de la cabecera: «Mi grupo», la Tabla del grupo de mi equipo en esa temporada (el de su
// misma competición si juega en ella), con la misma vista, cuando el que se mira no es el suyo; si lo
// es, o mi equipo no juega esa temporada, «Otras ligas»: las de su categoría y su isla.
function headAction(ctx, group, siblings, keep) {
  const s = group.season;
  const target = myTeamIn(group, ctx.myTeam, ctx.resolution) ? null
    : myGroupIn(ctx.model.season(s), ctx.myTeam, ctx.resolution, siblings ? siblings.list : []);
  return target
    ? { href: routeHref('tabla', { s, g: target.id, v: keep }), label: 'Mi grupo' }
    : { href: routeHref('ligas', { s, c: group.cat, i: group.island, to: 'tabla' }), label: 'Otras ligas' };
}

function render(ctx) {
  const { params, model, today } = ctx;
  const shields = (ctx.datasets && ctx.datasets.shields) || {};
  const s = params.s || ctx.portal.season;
  const others = { href: routeHref('ligas', { s, to: 'tabla' }), label: 'Otras ligas' };
  // Sin la temporada (needs no la trajo): la caja de error, nunca otra temporada (§7).
  if (!model.season(s)) {
    return html`<section data-screen="tabla">${screenHead('Tabla', { action: others })}${errorBox(`la temporada ${seasonLabel(s)}`)}</section>`;
  }
  const group = model.group(s, params.g);
  if (!group) {
    const why = params.g ? `No hay ningún grupo ${params.g} en la temporada ${seasonLabel(s)}.` : 'Elige un grupo en «Otras ligas».';
    return html`<section data-screen="tabla">${screenHead('Tabla', { action: others })}${empty(why)}</section>`;
  }
  const historical = s !== ctx.portal.season;
  const v = VIEWS.includes(params.v) ? params.v : 'puntos';
  // La tira de los grupos de su competición, que conserva la vista (Puntos y Todas, las de por defecto,
  // van sin `v`), y la acción de la cabecera.
  const siblings = siblingGroups(model, group);
  const keep = v === 'puntos' || v === 'todas' ? '' : v;
  const mineId = siblings && (siblings.list.find(g => myTeamIn(g, ctx.myTeam, ctx.resolution)) || {}).id;
  const strip = siblings ? groupStrip({
    label: siblings.entry.label, groups: siblings.list, currentId: group.id, mineId,
    hrefFor: g => routeHref('tabla', { s, g: g.id, v: keep }),
  }) : '';
  const head = html`${screenHead('Tabla', { sub: historical ? `${group.label} · ${seasonLabel(s)}` : group.label, action: headAction(ctx, group, siblings, keep) })}${strip}`;
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

// Al montar, la tira de grupos se desliza hasta el actual, dentro de su caja: la página no se mueve.
function mount(root) {
  scrollToCurrent(root.querySelector('.group-scroll'));
}

export const screen = {
  id: 'tabla',
  needs: (params, datasets, { portalSeason } = {}) => seasonNeeds(params.s, datasets, portalSeason),
  render,
  mount,
};
