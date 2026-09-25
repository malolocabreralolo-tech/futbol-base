// Pantalla Tabla (spec §4.4 y §4.8; maqueta 5-2). render(ctx) es pura: el selector de vistas
// (cinco en móvil; Todas, Casa y Fuera en escritorio), la clasificación con la fila propia,
// la forma, casa y fuera con su cobertura, los goleadores del grupo, la procedencia y
// «Otro grupo». Una sola tabla: por debajo de 1024 px el CSS deja las columnas de la vista.
import { html } from './html.js';
import { block, screenHead, standingsTable, segmented, crest, notice, empty, listEs, sourcePhrase } from './ui.js';
import { errorBox } from './shell.js';
import { lastResults, homeAwayTable, retiredTeams, groupFinished, playerName, sourceInfo, seasonLabel } from './model.js';
import { routeHref, teamHref } from './links.js';
import { groupScorers, seasonNeeds } from './state.js';
import { myTeamIn } from './myteam.js';

const NARROW = [['puntos', 'Puntos'], ['goles', 'Goles'], ['forma', 'Forma'], ['casa', 'Casa'], ['fuera', 'Fuera']]
  .map(([value, label]) => ({ value, label }));
// Escritorio: todas las columnas y, además, Casa y Fuera (decisión 15 de B1).
const WIDE = [['todas', 'Todas'], ['casa', 'Casa'], ['fuera', 'Fuera']].map(([value, label]) => ({ value, label }));
const VIEWS = ['puntos', 'goles', 'forma', 'casa', 'fuera', 'todas'];

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
    const why = historical ? 'Esta web solo guarda los goleadores de la temporada actual.'
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

function render(ctx) {
  const { params, model, today } = ctx;
  const shields = (ctx.datasets && ctx.datasets.shields) || {};
  const s = params.s || ctx.portal.season;
  const other = g => ({ href: routeHref('ligas', { s, c: g && g.cat, i: g && g.island, to: 'tabla' }), label: 'Otro grupo' });
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
  const head = screenHead('Tabla', { sub: historical ? `${group.label} · ${seasonLabel(s)}` : group.label, action: other(group) });
  const scorers = scorersBlock(group, groupScorers(model.scorers(s, group.cat), group.id), historical, shields);
  const source = sourceLine(group, historical);
  if (!group.standings.length) {
    return html`<section data-screen="tabla">${head}${block('Clasificación', empty('Clasificación sin publicar.'))}${scorers}${source}</section>`;
  }
  const v = VIEWS.includes(params.v) ? params.v : 'puntos';
  const side = v === 'casa' || v === 'fuera' ? v : null;
  // Puntos (móvil) y Todas (escritorio) son la vista por defecto: sin `v` en el enlace.
  const href = value => routeHref('tabla', { s, g: group.id, v: value === 'puntos' || value === 'todas' ? '' : value });
  const views = html`<nav class="tabla-views is-narrow" aria-label="Vista de la tabla">${segmented(NARROW, v === 'todas' ? 'puntos' : v, href, { idPrefix: 'vista' })}</nav><nav class="tabla-views is-wide" aria-label="Vista de la tabla">${segmented(WIDE, side || 'todas', href, { idPrefix: 'vista-ancha' })}</nav>`;
  const mine = myTeamIn(group, ctx.myTeam, ctx.resolution);
  const common = { mine, shields, hrefFor: row => teamHref(s, group.id, row.team) };
  let table;
  if (side) {
    const where = side === 'casa' ? 'en casa' : 'fuera de casa';
    const coverage = homeAwayCoverage(group);
    table = block(`Clasificación ${where}`, html`<div class="box">${standingsTable(homeAwayTable(group, side), { ...common, view: side, caption: `Clasificación ${where} de ${group.label}` })}</div>${coverage ? notice(null, coverageText(coverage)) : ''}`,
      { context: 'desde el calendario' });
  } else {
    const rows = group.standings.map(row => ({ ...row, form: lastResults(row.team, group).map(x => x.letter) }));
    table = block('Clasificación', html`<div class="box tabla-${v === 'todas' ? 'puntos' : v}">${standingsTable(rows, { ...common, view: 'todas', caption: `Clasificación de ${group.label}` })}</div>`,
      { context: standingsContext(group, today, ctx.portal.season) });
  }
  return html`<section data-screen="tabla">${head}${views}${table}${scorers}${source}</section>`;
}

export const screen = {
  id: 'tabla',
  needs: (params, datasets, { portalSeason } = {}) => seasonNeeds(params.s, datasets, portalSeason),
  render,
};
