// Vista de equipo (spec §4.2, §4.6 y §4.8; decisión 8 de B3): los estados A, B, C y D de un equipo
// en su grupo, por `{ group, name }`. La comparten Mi equipo (screen-home.js, que pone la resolución
// de mi equipo, E y X) y la ficha de Equipo (screen-equipo.js). No es una pantalla: teamView da la
// cabecera y los bloques de cada columna, teamColumns los coloca y mountTeamView pone su
// comportamiento. Todo es puro salvo mountTeamView, y nada toca el DOM al importarse.
import { html } from './html.js';
import {
  block, box, cells, crest, empty, listEs, matchRow, notice, screenHead, shareStatus, sourcePhrase, standingsTable,
} from './ui.js';
import {
  competitionKey, lastResults, matchState, penaltyWinner, playerName, retiredTeams, roundOf, seasonLabel,
  seasonSummary, sourceInfo, teamFixtures, teamShort,
} from './model.js';
import { showNextSeasonBox, summerCups, teamState } from './myteam.js';
import {
  buildCalendar, checkedCell, checkedPhrase, countdownLabel, dayMonth, downloadCalendar, matchHref, monthName,
  routeHref, shareAndAnnounce, teamHref, venueUrl, weekdayDate,
} from './links.js';
import { teamScorers } from './state.js';

// Fechas y horas siempre en Canarias (spec §8). Las fechas de partido son días de calendario
// ('AAAA-MM-DD') y se escriben con los nombres de links.js, sin los datos de idioma del motor (B9);
// la hora de una comprobación (un instante), con checkedPhrase y checkedCell, también de links.js.

// '2026-10-04' → 'dom 4 oct'
const shortDate = weekdayDate;

const score = (a, b) => `${a}–${b}`;
// 3.25 → '3,3': un decimal con coma, sin los datos de idioma del motor.
const oneDecimal = n => n.toFixed(1).replace('.', ',');

// «Cambiar» y las demás búsquedas abren Explorar con el buscador enfocado: el ancla #buscar va tras
// la ruta, como #calendario en la ficha de equipo. La usan también E y X de la portada.
export const SEARCH_HREF = `${routeHref('explorar')}#buscar`;

// ── Cabecera y columnas ─────────────────────────────────────────────────

// La acción de la cabecera: «Cambiar» (Mi equipo) o «Hacer mi equipo» (Equipo, decisión 11).
const ACTIONS = {
  change: { href: SEARCH_HREF, label: 'Cambiar' },
  make: html`<button type="button" class="screen-action team-make" data-action="hacer-mi-equipo">Hacer mi equipo</button>`,
};

// La cabecera común (screenHead, ui.js): «‹» si la pantalla lo tiene, el escudo, el nombre (el único
// h1), la etiqueta y la acción. action: 'change', 'make' o null (sin acción, como en E y X).
export function teamHeader(name, subtitle, { shields = {}, action = null, back = null } = {}) {
  return screenHead(name, {
    sub: subtitle, crest: crest(name, { size: 46, shields, lazy: false }), action: action ? ACTIONS[action] : null, back,
  });
}

// Lo principal y lo de consulta; en escritorio, dos columnas (spec §4.8). `rest`, lo largo (el
// calendario completo de la ficha): en móvil va al final, detrás de la consulta, y en escritorio
// debajo de lo principal, en la columna izquierda (.has-rest en acta.css). Sin `rest`, el marcado de
// siempre.
export function teamColumns(main, aside, rest = []) {
  const more = rest.filter(Boolean);
  return more.length
    ? html`<div class="home-cols has-rest"><div class="home-main">${main}</div><div class="home-side">${aside}</div><div class="home-rest">${more}</div></div>`
    : html`<div class="home-cols"><div class="home-main">${main}</div><div class="home-side">${aside}</div></div>`;
}

// La última jornada (en su orden) con algún resultado, o null.
function lastPlayedRound(group) {
  const played = group.rounds.filter(round => round.matches.some(m => m.hs != null && m.as != null));
  return played[played.length - 1] || null;
}

// Local o visitante, con escudo grande, en el próximo y en el último partido.
const side = (team, label, shields) => html`<span class="fixture-team">${crest(team, { size: 46, shields, lazy: false })}<span class="fixture-side">${label}</span><span class="fixture-name">${team}</span></span>`;

// Decisión 20 de B1: el grupo guardado terminó y el club no aparece en la fase siguiente, que ya
// lleva una semana en marcha (estados C y D de Mi equipo).
const staleNotice = stale => (stale
  ? notice('¿Sigue tu equipo en la Segunda Fase?', html`<a class="more" href="${SEARCH_HREF}">Búscalo en Explorar</a>`)
  : '');

// ── Próximo partido (A y B) y último partido (C) ────────────────────────

function nextBlock(m, group, today, shields) {
  const round = roundOf(group, m);
  const when = cells([
    { label: 'Jornada', value: round && round.n != null ? round.n : (round ? round.label : m.roundKey) },
    { label: 'Fecha', value: shortDate(m.dateISO) },
    { label: 'Hora', value: m.time || 'por confirmar', muted: !m.time },
  ]);
  const teams = html`<div class="fixture">${side(m.home, 'Local', shields)}<span class="fixture-vs" aria-hidden="true">–</span>${side(m.away, 'Visitante', shields)}</div>`;
  const venue = html`<p class="fixture-venue"><span class="cell-label">Campo</span><span class="${m.venue ? 'fixture-place' : 'fixture-place is-muted'}">${m.venue || 'no publicado'}</span></p>`;
  const buttons = html`<div class="buttons">${m.venue ? html`<a class="button is-main" href="${venueUrl(m.venue, group.island)}" target="_blank" rel="noopener noreferrer">Cómo llegar</a>` : ''}<button type="button" class="${m.venue ? 'button' : 'button is-main'}" data-action="calendario">Calendario</button><button type="button" class="button" data-action="compartir">Compartir</button></div>`;
  return html`${box(html`${when}${teams}${venue}${buttons}`, { title: 'Próximo partido', context: countdownLabel(m.dateISO, today) })}${shareStatus()}`;
}

// Sin próximo partido, por qué (B1, «Para B2»): sin fecha, sin resultado o todo jugado.
function noNextText(fx, { finished }) {
  if (fx.undated > 0) return 'Próximo partido sin fecha publicada';
  if (fx.remaining > 0) return 'Resultado pendiente de publicar';
  return finished ? 'Ya ha jugado todos sus partidos' : 'Sin partidos en el calendario de este grupo';
}

function lastBlock(fx, group, shields) {
  const m = fx.last;
  const round = roundOf(group, m);
  const context = [round ? round.label.toLowerCase() : m.roundKey, shortDate(m.dateISO)].filter(Boolean).join(' · ');
  return box(html`<a class="result" href="${matchHref(m)}">${side(m.home, 'Local', shields)}<span class="result-score">${score(m.hs, m.as)}</span>${side(m.away, 'Visitante', shields)}</a><p class="home-note">${noNextText(fx, { finished: true })}</p>`,
    { title: 'Último partido', context });
}

// ── Últimos cinco, clasificación, goleadores y cifras ───────────────────

const LETTER = { G: 'Ganado', E: 'Empatado', P: 'Perdido' };

// «calendario completo»: en Mi equipo abre la ficha en su ancla; en la ficha, el ancla de la página.
function lastFiveBlock(results, calendarHref) {
  const items = results.map(r => html`<li><a class="last5-cell" href="${matchHref(r.match)}"><span class="form-chip form-${r.letter.toLowerCase()}" aria-hidden="true">${r.letter}</span><span class="vh">${LETTER[r.letter]}, </span><span class="last5-score">${score(r.gf, r.gc)}</span><span class="last5-rival"><span class="vh">${r.side === 'casa' ? 'en casa contra ' : 'fuera contra '}</span>${teamShort(r.rival)}</span></a></li>`);
  const more = html`<a class="more" href="${calendarHref}">calendario completo</a>`;
  return box(html`<ol class="last5 last5-${results.length}">${items}</ol>`,
    { title: results.length === 5 ? 'Últimos cinco' : 'Últimos resultados', context: more });
}

// La fila del equipo resaltada; su texto oculto dice de quién es: «mi equipo» en Mi equipo y en la
// ficha de mi equipo, «este equipo» en la de otro.
function standingsBlock(group, name, { shields, mine }) {
  if (!group.standings.length) return block('Clasificación', empty('Clasificación sin publicar'));
  const after = lastPlayedRound(group);
  return box(standingsTable(group.standings, {
    view: 'puntos', mine: name, mineText: mine ? 'mi equipo' : 'este equipo', shields,
    hrefFor: row => teamHref(group.season, group.id, row.team), caption: `Clasificación: ${group.label}`,
  }), { title: 'Clasificación', context: after ? `tras la ${after.label.toLowerCase()}` : null });
}

// Goleadores del equipo en su grupo: [{ name, goals, games }], por goles.
const scorersOf = (ctx, group, name) => teamScorers(ctx.model.scorers(group.season, group.cat),
  { name, season: group.season, cat: group.cat, groupId: group.id });

function scorersBlock(ctx, group, name) {
  const list = scorersOf(ctx, group, name);
  if (!list.length) return block('Goleadores del equipo', empty('Sin goleadores publicados de este equipo'));
  const rows = list.slice(0, 5).map(s => html`<tr><th scope="row" class="sc-name">${playerName(s.name)}</th><td class="sc-goals">${s.goals}</td><td class="sc-games">${s.games}</td></tr>`);
  const more = html`<a class="more" href="${routeHref('goleadores', { s: group.season, g: group.id, t: name })}">ver todos</a>`;
  return box(html`<table class="scorers"><caption class="vh">Goleadores de ${name}</caption><thead><tr><th scope="col" class="sc-name">Jugador</th><th scope="col" class="sc-goals">Goles</th><th scope="col" class="sc-games"><abbr title="Partidos jugados">PJ</abbr></th></tr></thead><tbody>${rows}</tbody></table>`,
    { title: 'Goleadores del equipo', context: more });
}

// Partidos del equipo (sin los de retirados) con fecha pasada y sin marcador.
export function missingResults(name, group, today) {
  const retired = retiredTeams(group);
  return group.rounds.flatMap(round => round.matches).filter(m => (m.home === name || m.away === name)
    && !retired.has(m.home) && !retired.has(m.away) && matchState(m, today) === 'sin resultado').length;
}

// Nota de cobertura (spec §7) de las cifras calculadas con el calendario:
// - con retirados, «26 partidos en el calendario y 2 contra CD Batán (retirado)»;
// - si falta algo más (partidos `sin resultado`), «N de M partidos con resultado»;
// - si no cuadra por otra causa, «Calculado con N partidos del calendario».
// Y, si la suma sigue sin dar el PJ oficial, «la clasificación cuenta P». null si cuadra.
export function coverageText(coverage, missing = 0) {
  if (!coverage) return null;
  const { played, calendar, vsRetired, retired, withResult: n } = coverage;
  const due = n + missing;
  let text;
  if (missing > 0) text = `${n} de ${due} partidos con resultado`;
  else if (vsRetired > 0) text = n === calendar ? `${n} partidos en el calendario` : `${n} partidos jugados en el calendario`;
  else text = `Calculado con ${n} partidos del calendario`;
  if (vsRetired > 0) text += ` y ${vsRetired} contra ${listEs(retired)} (${retired.length > 1 ? 'retirados' : 'retirado'})`;
  if (due + vsRetired !== played) text += `; la clasificación cuenta ${played}`;
  return text;
}

function figuresBlock(ctx, group, name) {
  const sum = seasonSummary(name, group);
  const record = r => `${r.g}G ${r.e}E ${r.p}P`;
  const result = r => (r ? `${score(r.gf, r.gc)} ${teamShort(r.rival)}` : null);
  const content = html`${cells([
    { label: 'Goles a favor', value: sum.gf ?? '—' },
    { label: 'En contra', value: sum.gc ?? '—' },
    { label: 'Por partido', value: sum.perMatch ? `${oneDecimal(sum.perMatch.gf)} – ${oneDecimal(sum.perMatch.gc)}` : '—' },
  ])}${cells([
    { label: 'En casa', value: record(sum.home) },
    { label: 'Fuera', value: record(sum.away) },
  ])}${cells([
    { label: 'Mejor resultado', value: result(sum.best) ?? '—' },
    { label: 'Peor derrota', value: result(sum.worst) ?? 'ninguna', muted: !sum.worst },
  ])}`;
  const note = coverageText(sum.coverage, missingResults(name, group, ctx.today));
  return html`${box(content, { title: 'La temporada en cifras' })}${note ? notice('Cobertura:', note) : ''}`;
}

// «Clasificación oficial de futbolaspalmas.com, comprobada el …» (spec §4.2 y §7): la frase de
// procedencia de sourcePhrase (ui.js), la misma de la Tabla, con la comprobación del grupo.
function freshness(ctx, group) {
  const lead = sourcePhrase(sourceInfo(group, false));
  const health = ctx.health;
  const item = health && health.season === group.season && health.groups ? health.groups[group.id] : null;
  const when = item && item.checkedAt ? checkedPhrase(item.checkedAt, ctx.today) : null;
  const text = `${lead}${when ? `, comprobada ${when}` : ''}.${item && item.status !== 'ok' ? ' Revisión pendiente.' : ''}`;
  return html`<p class="home-fresh">${text} <a class="more" href="${routeHref('fuentes')}">Ver fuentes</a></p>`;
}

// ── Estados A, B y C ────────────────────────────────────────────────────

// Sin nada jugado, un único vacío en lugar de Últimos cinco, goleadores y cifras (spec §4.2 B). Sus
// dos causas (B1, M2): el grupo no ha empezado, o sí, pero el equipo no ha jugado (un retirado, como
// CD Batán en PG2).
function notPlayedText(group, name) {
  const started = group.rounds.some(round => round.matches.some(m => m.hs != null && m.as != null));
  if (!started) return 'Aún no se ha jugado ninguna jornada';
  if (retiredTeams(group).has(name)) return `${name} figura como retirado en este grupo`;
  return `${name} todavía no ha jugado ningún partido en este grupo`;
}

// Hueco del calendario en la columna principal de A, B y C de Mi equipo: mount lo pinta en escritorio.
const CALENDAR_SLOT = html`<div data-slot="calendario"></div>`;

function seasonView(v, state) {
  const { ctx, group, name, shields } = v;
  const fx = teamFixtures(name, group, ctx.today);
  const top = state === 'C' ? lastBlock(fx, group, shields)
    : fx.next ? nextBlock(fx.next, group, ctx.today, shields)
      : box(html`<p class="home-note">${noNextText(fx, { finished: false })}</p>`, { title: 'Próximo partido' });
  const results = lastResults(name, group, 5);
  const main = [top];
  const aside = [standingsBlock(group, name, v)];
  if (results.length) {
    const calendarHref = v.calendar === 'always' ? '#calendario' : `${teamHref(group.season, group.id, name)}#calendario`;
    main.push(lastFiveBlock(results, calendarHref));
    aside.push(scorersBlock(ctx, group, name), figuresBlock(ctx, group, name));
  } else {
    main.push(block(null, empty(notPlayedText(group, name))));
  }
  const rest = [];
  if (v.calendar === 'always') rest.push(teamCalendar(name, group, { today: ctx.today, shields }));
  else main.push(CALENDAR_SLOT);
  aside.push(freshness(ctx, group));
  const head = html`${teamHeader(name, group.label, v)}${state === 'C' ? staleNotice(v.stale) : ''}`;
  return { head, main, aside, rest };
}

// ── Estado D: temporada terminada (spec §4.2 D, §6.4 y maqueta 6-1) ─────

// Sin data-health, la fecha del literal oculto «Última actualización: DD/MM/AAAA» de index.html, sin
// hora (spec §4.2 D): «23 sept».
function legacyCell(text) {
  const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(String(text ?? '').trim());
  return m ? dayMonth(`${m[3]}-${m[2]}-${m[1]}`) : null;
}

// '2025-2026' → '2026-2027'
const nextSeasonOf = season => {
  const m = /^(\d{4})-(\d{4})$/.exec(String(season));
  return m ? `${Number(m[1]) + 1}-${Number(m[2]) + 1}` : '';
};

// La caja «Temporada 2026/27» de §4.2 D: la pintan Mi equipo en D y Fuentes.
export function nextSeasonBox(ctx, name, next) {
  const health = ctx.health;
  const checked = health && health.checkedAt ? checkedCell(health.checkedAt, ctx.today) : legacyCell(ctx.legacyDate);
  const club = teamShort(name).replace(/\s[A-E]$/, '');
  return box(html`${cells([
    { label: 'Grupos', value: 'pendientes en esta web' },
    { label: 'Última comprobación', value: checked || 'no disponible', muted: !checked },
  ])}<p class="box-text">La temporada ${seasonLabel(next)} aparecerá aquí cuando la federación publique los grupos y se activen en esta web. Si hay más de un equipo de ${club}, te preguntaremos cuál es el tuyo.</p>`,
  { title: `Temporada ${seasonLabel(next)}` });
}

function endedBlock(ctx, group, name) {
  const sum = seasonSummary(name, group);
  const top = scorersOf(ctx, group, name)[0] || null;
  const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;
  const content = html`${cells([
    { label: 'Posición', value: sum.pos != null ? `${sum.pos}.º de ${sum.of}` : '—' },
    { label: 'Puntos', value: sum.pts ?? '—' },
    { label: 'Balance', value: sum.g != null ? `${sum.g}G ${sum.e}E ${sum.p}P` : '—' },
  ])}${cells([
    { label: 'A favor', value: sum.gf != null ? plural(sum.gf, 'gol', 'goles') : '—' },
    { label: 'En contra', value: sum.gc != null ? plural(sum.gc, 'gol', 'goles') : '—' },
    { label: 'Último', value: sum.last ? `${score(sum.last.gf, sum.last.gc)} ${teamShort(sum.last.rival)}` : '—' },
  ])}${top ? html`<p class="home-top"><span class="cell-label">Máximo goleador</span><span class="home-top-name"><b>${playerName(top.name)}</b>, ${plural(top.goals, 'gol', 'goles')} en ${plural(top.games, 'partido', 'partidos')}</span></p>` : ''}`;
  return box(content, { title: `Así terminó ${seasonLabel(group.season)}`, context: group.label });
}

// «Verano» (spec §6.4 y decisión 19 de B1): los torneos de su categoría, una caja por competición, con
// la fase de grupos (puesto) y cada partido de cuadro.
function summerBlocks(ctx, group, name) {
  const cups = ctx.model.cups();
  if (!cups) return [];
  const mine = { name, season: group.season, cat: group.cat, groupId: group.id };
  const byCompetition = new Map();
  for (const entry of summerCups(cups, mine, ctx.model.clubIndex())) {
    const label = competitionKey(entry.group, entry.group.season).label;
    if (!byCompetition.has(label)) byCompetition.set(label, []);
    byCompetition.get(label).push(entry);
  }
  return [...byCompetition].map(([label, entries]) => {
    const rows = entries.flatMap(entry => (entry.group.kind === 'cup-bracket'
      ? entry.rows.map(m => bracketRow(entry.group, m))
      : [groupPhaseRow(entry.group, entry.team)]));
    const months = [...new Set(entries.flatMap(e => e.rows).map(m => m.dateISO).filter(Boolean).sort()
      .map(monthName))];
    return box(html`<ul class="summer">${rows}</ul>`, { title: `Verano: ${label}`, context: listEs(months) });
  });
}

// Las filas de «Verano» abren el torneo (decisión 67 de B2).
function groupPhaseRow(group, team) {
  const row = group.standings.find(r => r.team === team);
  return html`<li><a class="summer-row" href="${routeHref('copa', { s: group.season, g: group.id })}"><span class="summer-what">Fase de grupos, ${group.name}</span><span class="summer-main">${row ? `${row.pos}.º de ${group.standings.length}` : teamShort(team)}</span><span class="summer-score">${row ? `${row.pts} pts` : ''}</span></a></li>`;
}

function bracketRow(group, m) {
  const round = roundOf(group, m);
  const when = shortDate(m.dateISO);
  const what = `${group.name}, ${(round ? round.label : m.roundKey).toLowerCase()}${when ? ` · ${when}` : ''}`;
  const played = m.hs != null && m.as != null;
  const winner = penaltyWinner(m);
  const penalties = winner ? `${teamShort(winner)} pasó por penaltis${m.shootout ? ` (${m.shootout.replace('-', '–')})` : ''}` : null;
  return html`<li><a class="summer-row" href="${routeHref('copa', { s: group.season, g: group.id })}"><span class="summer-what">${what}</span><span class="summer-main">${teamShort(m.home)} – ${teamShort(m.away)}</span><span class="summer-score">${played ? score(m.hs, m.as) : '–'}</span>${penalties ? html`<span class="summer-note">${penalties}</span>` : ''}</a></li>`;
}

// La fila propia con las dos de arriba y las dos de abajo; cerca de un extremo, las cinco primeras
// o las cinco últimas.
function windowAround(rows, name, around = 2) {
  const size = 2 * around + 1;
  const i = rows.findIndex(row => row.team === name);
  if (i < 0) return rows.slice(0, size);
  const start = Math.max(0, Math.min(i - around, rows.length - size));
  return rows.slice(start, start + size);
}

function finalStandings(group, name, { shields, mine }) {
  if (!group.standings.length) return block('Clasificación final', empty('Clasificación sin publicar'));
  const more = html`<a class="more" href="${routeHref('tabla', { s: group.season, g: group.id })}">ver completa</a>`;
  return box(standingsTable(windowAround(group.standings, name), {
    view: 'resumen', mine: name, mineText: mine ? 'mi equipo' : 'este equipo', shields,
    hrefFor: row => teamHref(group.season, group.id, row.team), caption: `Clasificación final: ${group.label}`,
  }), { title: 'Clasificación final', context: more });
}

// En la ficha (calendar 'always') no hay caja de la temporada siguiente (§4.6) ni «Ver toda la
// temporada», que llevaría a la misma ficha: su calendario completo ya está en la página.
function endedView(v, nextSeason) {
  const { ctx, group, name, shields } = v;
  const withBox = nextSeason && showNextSeasonBox({ group, health: ctx.health, portalSeason: ctx.portal.season });
  const next = nextSeasonOf(group.season);
  const subtitle = withBox ? `A la espera de la temporada ${seasonLabel(next)}` : `Temporada ${seasonLabel(group.season)} terminada`;
  const always = v.calendar === 'always';
  const main = [
    withBox ? nextSeasonBox(ctx, name, next) : '',
    endedBlock(ctx, group, name),
    ...summerBlocks(ctx, group, name),
    always ? '' : html`<a class="home-all" href="${teamHref(group.season, group.id, name)}">Ver toda la temporada ${seasonLabel(group.season)}</a>`,
  ];
  const rest = always ? [teamCalendar(name, group, { today: ctx.today, shields })] : [];
  return { head: html`${teamHeader(name, subtitle, v)}${staleNotice(v.stale)}`, main, aside: [finalStandings(group, name, v)], rest };
}

// ── La vista ────────────────────────────────────────────────────────────

// El estado (teamState de myteam.js: D, B, C o A) y lo que se pinta: la cabecera (head, con el aviso
// stale de C y D) y los bloques de cada columna, que la pantalla coloca con teamColumns y a los que
// puede añadir los suyos. Opciones:
// - action: 'change' («Cambiar», Mi equipo), 'make' («Hacer mi equipo», Equipo) o null;
// - nextSeason: la caja de la temporada siguiente en D (solo Mi equipo);
// - stale: el aviso de la decisión 20 de B1 en C y D (solo Mi equipo);
// - calendar: 'wide', el hueco que mount llena en escritorio (Mi equipo); 'always', el calendario
//   completo en render, con su ancla #calendario (Equipo);
// - mine: si el equipo es mi equipo (el texto oculto de su fila en la clasificación);
// - shields: los escudos.
// El «‹» es el del router (ctx.backHref): la portada no lo tiene y la ficha sí.
export function teamView(ctx, { group, name }, {
  action = null, nextSeason = false, stale = null, calendar = 'wide', mine = false, shields = {},
} = {}) {
  const state = teamState({ group, name, todayISO: ctx.today, portalSeason: ctx.portal.season });
  const v = { ctx, group, name, shields, action, stale, calendar, mine, back: ctx.backHref || null };
  return { state, ...(state === 'D' ? endedView(v, nextSeason) : seasonView(v, state)) };
}

// ── Calendario completo del equipo (spec §4.6 y §4.8) ───────────────────

// Todos sus partidos del grupo, en orden de jornada y con su estado (spec §5.3). El bloque lleva
// siempre el ancla #calendario, también sin partidos (un retirado).
export function teamCalendar(team, group, { today, shields = {} } = {}) {
  const items = group.rounds.flatMap(round => round.matches.filter(m => m.home === team || m.away === team).map(m => ({ round, m })));
  if (!items.length) return block('Calendario', empty('Sin partidos en el calendario de este grupo'), { id: 'calendario' });
  const rows = items.map(({ round, m }) => html`<li><p class="cal-when">${round.label}${m.dateISO ? ` · ${shortDate(m.dateISO)}` : ''}</p>${matchRow(m, { today, shields, href: matchHref(m) })}</li>`);
  return block('Calendario', html`<ol class="box cal">${rows}</ol>`, { context: `${items.length} partidos`, id: 'calendario' });
}

// Solo en escritorio: se pinta al montar y al cruzar los 1024 px, nunca oculto con CSS (spec §5.1: se
// pinta solo lo visible). El router llama a la limpieza que devuelve mount justo antes del próximo
// pintado (paint() de router.js): por eso wideCalendar devuelve la suya, que quita el escuchador de
// matchMedia (que no es del DOM y no desaparece solo al sustituir la sección).
const WIDE = '(min-width: 1024px)';
function wideCalendar(section, ctx, { group, name }) {
  const slot = section.querySelector('[data-slot="calendario"]');
  if (!slot || typeof matchMedia !== 'function') return null;
  const query = matchMedia(WIDE);
  const off = () => { if (typeof query.removeEventListener === 'function') query.removeEventListener('change', paint); };
  const paint = () => {
    if (!slot.isConnected) { off(); return; }
    // Html de la plantilla html``, que escapa toda interpolación, como el pintado del router.
    slot.innerHTML = query.matches ? String(teamCalendar(name, group, { today: ctx.today, shields: ctx.datasets?.shields || {} })) : '';
  };
  paint();
  if (typeof query.addEventListener === 'function') query.addEventListener('change', paint);
  return off;
}

// ── Compartir y calendario del próximo partido ──────────────────────────

export function shareData(match, pageHref) {
  const when = [shortDate(match.dateISO), match.time].filter(Boolean).join(', ');
  const title = `${match.home} – ${match.away}`;
  return { title, text: when ? `${title}, ${when}` : title, url: new URL(matchHref(match), pageHref).href };
}

// El partido como evento de buildCalendar y downloadCalendar (links.js): [partidos, opciones].
function calendarArgs(match, group, url) {
  const round = roundOf(group, match);
  return [[{
    date: match.dateISO, home: match.home, away: match.away, time: match.time, venue: match.venue,
    jor: round ? round.label : match.roundKey,
  }], { season: match.season, group: match.groupId, name: `${match.home} – ${match.away}`, url }];
}

// El .ics que descarga «Calendario» (`now` fijo en las pruebas).
export function matchCalendar(match, group, { url = '', now = new Date() } = {}) {
  const [matches, options] = calendarArgs(match, group, url);
  return buildCalendar(matches, { ...options, now });
}

// El comportamiento de la vista en su sección (la que se sustituye en cada pintado: la escucha nunca
// se acumula): «Calendario» y «Compartir» del próximo partido del equipo y, con calendar 'wide', el
// calendario de escritorio. Devuelve la limpieza de ese calendario, o undefined.
export function mountTeamView(section, ctx, { group, name }, { calendar = 'wide' } = {}) {
  section.addEventListener('click', event => {
    const target = event.target.closest('[data-action]');
    if (!target || !section.contains(target)) return;
    const action = target.getAttribute('data-action');
    if (action !== 'calendario' && action !== 'compartir') return;
    const next = teamFixtures(name, group, ctx.today).next;
    if (!next) return;
    // El enlace compartido es el de la página sin consulta ni ruta: solo la del partido.
    const data = shareData(next, location.href.split(/[?#]/)[0]);
    if (action === 'calendario') downloadCalendar(...calendarArgs(next, group, data.url));
    // La respuesta común (links.js): «Enlace copiado.» o el enlace, en la región de estado.
    else shareAndAnnounce(data, section.querySelector('.share-status'));
  });
  return calendar === 'wide' ? wideCalendar(section, ctx, { group, name }) || undefined : undefined;
}
