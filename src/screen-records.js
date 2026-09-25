// Pantalla Récords (spec §4.7 y §4.11; decisión 26 de B3). render(ctx) es pura: los récords de una
// temporada y una categoría, calculados con el modelo (seasonRecords, model.js) y nunca con
// data-stats.js, y en la temporada del portal los 30 máximos goleadores de la categoría
// (categoryScorers, state.js) con «ver todos». Cada récord enlaza a su partido o a la ficha de su
// equipo. Una temporada pasada la carga el router antes de pintar (decisión 2 de B3): needs no pide
// nada.
import { html } from './html.js';
import { block, box, cells, crest, empty, screenHead, segmented } from './ui.js';
import { errorBox } from './shell.js';
import { playerName, roundOf, seasonLabel, seasonRecords, RECORD_MIN_PJ, RECORD_MIN_SIDE } from './model.js';
import { matchHref, routeHref, teamHref, weekdayDate } from './links.js';
import { categoryScorers, rankScorers } from './state.js';
import { defaultCategory } from './myteam.js';

const CATS = [{ value: 'benjamin', label: 'Benjamín' }, { value: 'prebenjamin', label: 'Prebenjamín' }];
const CAT_WORD = { benjamin: 'benjamín', prebenjamin: 'prebenjamín' };
export const TOP_SCORERS = 30;
const TOP_RANK = 3;

// Cifras sin los datos de idioma del motor (decisión 123 de B2): 3253 → «3.253», 8.0123 → «8,01».
const thousands = (n) => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
const decimals = (n, digits) => n.toFixed(digits).replace('.', ',');

// Una fila de récord: qué es (opcional), el equipo o el partido, la cifra y el detalle. Enlaza siempre.
function recordRow({ href, what = null, main, figure, detail }) {
  return html`<li><a class="rc-row" href="${href}">${what ? html`<span class="rc-what">${what}</span>` : ''}<span class="rc-subject">${main}</span><span class="rc-figure">${figure}</span><span class="rc-detail">${detail}</span></a></li>`;
}

// env = { s, shields, group(id), where(id) }: el grupo de la temporada y su etiqueta sin la categoría,
// que ya dice el selector («Grupo 3 de Gran Canaria»).
const teamMain = (team, env) => html`${crest(team, { shields: env.shields })}<span class="rc-name">${team}</span>`;

function matchRow(what, match, env) {
  const round = roundOf(env.group(match.groupId), match);
  const detail = [env.where(match.groupId), round ? round.label.toLowerCase() : match.roundKey, weekdayDate(match.dateISO)]
    .filter(Boolean).join(' · ');
  return recordRow({ href: matchHref(match), what, main: html`<span class="rc-name">${match.home} – ${match.away}</span>`, figure: `${match.hs}–${match.as}`, detail });
}

function teamsBlock(records, env) {
  const context = `${RECORD_MIN_PJ} partidos o más`;
  if (!records.bestAttack) return block('Ataque y defensa', empty(`Ningún equipo ha jugado todavía ${RECORD_MIN_PJ} partidos.`), { context });
  const row = (what, r, figure) => recordRow({
    href: teamHref(env.s, r.groupId, r.team), what, main: teamMain(r.team, env), figure,
    detail: `en ${r.pj} partidos · ${env.where(r.groupId)}`,
  });
  return block('Ataque y defensa', html`<ul class="box rc-list">${[
    row('Más goles a favor', records.bestAttack, records.bestAttack.gf),
    row('Menos goles en contra', records.bestDefense, records.bestDefense.gc),
  ]}</ul>`, { context });
}

// Los 3 primeros de una clasificación de equipos (rachas, casa y fuera), o el vacío que dice por qué.
function rankingBlock(title, context, rows, env, { figure, detail = () => null, none }) {
  if (!rows.length) return block(title, empty(none), { context });
  return block(title, html`<ol class="box rc-list">${rows.slice(0, TOP_RANK).map((r) => recordRow({
    href: teamHref(env.s, r.groupId, r.team), main: teamMain(r.team, env), figure: figure(r),
    detail: [detail(r), env.where(r.groupId)].filter(Boolean).join(' · '),
  }))}</ol>`, { context });
}

// Los 30 primeros de la categoría, sumando las fases de cada jugador (categoryScorers), con «ver
// todos». El puesto es el de la lista entera de Goleadores (rankScorers, decisión 144).
function scorersBlock(ctx, c, env) {
  const title = 'Máximos goleadores';
  const { s } = env;
  if (s !== ctx.portal.season) return block(title, empty('Esta web solo guarda los goleadores de la temporada actual.'));
  const all = rankScorers(categoryScorers(ctx.model.scorers(s, c)));
  if (!all.length) return block(title, empty(`Todavía no hay goleadores publicados de ${CAT_WORD[c]}.`));
  const rows = all.slice(0, TOP_SCORERS).map((row) => html`<tr><td class="st-pos">${row.pos}</td><th scope="row" class="st-team"><a class="st-link" href="${teamHref(s, row.groupId, row.team)}">${crest(row.team, { shields: env.shields })}<span class="rc-who"><span class="st-name">${playerName(row.name)}</span><span class="rc-team">${row.team}</span></span></a></th><td class="sc-goals">${row.goals}</td><td class="sc-pj">${row.games}</td></tr>`);
  const more = html`<a class="more" href="${routeHref('goleadores', { s, c })}">ver todos (${thousands(all.length)})</a>`;
  return block(title, html`<div class="box"><table class="standings rc-scorers"><caption class="vh">Máximos goleadores de ${CAT_WORD[c]}, temporada ${seasonLabel(s)}</caption><thead><tr><th scope="col" class="st-pos"><abbr title="Puesto">#</abbr></th><th scope="col" class="st-team">Jugador</th><th scope="col" class="sc-goals">Goles</th><th scope="col" class="sc-pj"><abbr title="Partidos jugados">PJ</abbr></th></tr></thead><tbody>${rows}</tbody></table></div>`, { context: more });
}

function render(ctx) {
  const { params, model } = ctx;
  const s = params.s || ctx.portal.season;
  // `c` por defecto (decisión 26): la de Goleadores (defaultCategory, myteam.js), la categoría de mi
  // equipo resuelto o, si no la hay (E o X), la del equipo por defecto.
  const c = CATS.some((cat) => cat.value === params.c) ? params.c : defaultCategory(ctx.resolution, ctx.portal.defaultTeam);
  const head = screenHead('Récords', { sub: `Temporada ${seasonLabel(s)}`, back: ctx.backHref, action: { href: routeHref('temporadas'), label: 'Otra temporada' } });
  const season = model.season(s);
  // Sin la temporada (el router la carga antes de pintar): la caja de error, nunca otra temporada (§7).
  if (!season) return html`<section data-screen="records">${head}${errorBox(`la temporada ${seasonLabel(s)}`)}</section>`;
  const picker = html`<nav class="rc-cats" aria-label="Categoría">${segmented(CATS, c, (value) => routeHref('records', { s, c: value }), { idPrefix: 'categoria' })}</nav>`;
  const records = seasonRecords(season, c);
  if (!records.totals.matches) {
    const leagues = season.groups.some((group) => group.cat === c && group.kind === 'league');
    const why = leagues ? `Aún no se ha jugado ningún partido de liga de ${CAT_WORD[c]} en la temporada ${seasonLabel(s)}.`
      : `No hay ligas de ${CAT_WORD[c]} en la temporada ${seasonLabel(s)}.`;
    return html`<section data-screen="records">${head}${picker}<div class="block">${empty(why)}</div></section>`;
  }
  const group = (id) => season.groups.find((g) => g.id === id) || null;
  const env = {
    s, group,
    shields: (ctx.datasets && ctx.datasets.shields) || {},
    where: (id) => (group(id) ? group(id).label.replace(/^(?:Benjamín|Prebenjamín), /, '') : id),
  };
  const { totals, streaks } = records;
  const main = [
    box(cells([
      { label: 'Partidos', value: thousands(totals.matches) },
      { label: 'Goles', value: thousands(totals.goals) },
      { label: 'Por partido', value: decimals(totals.avg, 2) },
    ]), { title: 'Totales', context: 'partidos de liga con resultado' }),
    block('Partidos', html`<ul class="box rc-list">${[
      matchRow('Mayor goleada', records.biggestWin, env),
      matchRow('Partido con más goles', records.mostGoals, env),
    ]}</ul>`),
    teamsBlock(records, env),
    rankingBlock('Mejor racha de victorias', 'victorias seguidas', streaks.wins, env,
      { figure: (r) => r.n, none: 'Ningún equipo ha ganado todavía un partido.' }),
    rankingBlock('Mejor racha invicta', 'partidos sin perder', streaks.unbeaten, env,
      { figure: (r) => r.n, none: 'Ningún equipo ha sumado todavía un punto.' }),
    rankingBlock('Mejores en casa', `puntos por partido, con ${RECORD_MIN_SIDE} o más`, records.bestHome, env,
      { figure: (r) => decimals(r.ppj, 2), detail: (r) => `${r.pts} puntos en ${r.pj} partidos`, none: `Ningún equipo ha jugado todavía ${RECORD_MIN_SIDE} partidos en casa.` }),
    rankingBlock('Mejores fuera', `puntos por partido, con ${RECORD_MIN_SIDE} o más`, records.bestAway, env,
      { figure: (r) => decimals(r.ppj, 2), detail: (r) => `${r.pts} puntos en ${r.pj} partidos`, none: `Ningún equipo ha jugado todavía ${RECORD_MIN_SIDE} partidos fuera.` }),
  ];
  return html`<section data-screen="records">${head}${picker}<div class="rc-cols"><div class="rc-records">${main}</div><div class="rc-top">${scorersBlock(ctx, c, env)}</div></div></section>`;
}

export const screen = {
  id: 'records',
  needs: () => [],
  render,
};
