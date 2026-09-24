// Mi equipo, la portada (spec §4.2, §4.8, §6.4 y §7).
//
// render(ctx) es puro y síncrono: homeState decide el estado (E, X, D, B, C o A,
// en ese orden) sobre la resolución de mi equipo, y cada estado pinta su bloque
// con los componentes de ui.js. El estado va en data-state, que usan las pruebas
// de navegador. mount(root, ctx, nav) añade el comportamiento. Nada toca el DOM
// al importarse.
import { html } from './html.js';
import { box, cells, crest, empty, notice, screenHead, standingsTable } from './ui.js';
import {
  lastResults, matchState, playerName, retiredTeams, seasonLabel, seasonSummary, sourceInfo,
  teamFixtures, teamShort,
} from './model.js';
import { homeState } from './myteam.js';
import {
  buildCalendar, countdownLabel, dayMonthLong, downloadCalendar, routeHref, shareLink, venueUrl, weekdayDate,
} from './links.js';
import { ensureHealth, teamScorers } from './state.js';

// Fechas y horas siempre en Canarias (spec §8). Las fechas de partido son días de calendario
// ('AAAA-MM-DD') y se escriben con los nombres de links.js, sin los datos de idioma del motor (B9).
// La hora de una comprobación (un instante) pasa a Canarias con Intl, pero solo con partes numéricas.
const TZ = 'Atlantic/Canary';
const CLOCK = new Intl.DateTimeFormat('en-CA', {
  timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
});
const parts = (format, date) => Object.fromEntries(format.formatToParts(date).map(p => [p.type, p.value]));

// '2026-10-04' → 'dom 4 oct'
const shortDate = weekdayDate;

// Un instante (checkedAt de data-health) en Canarias: { day: 'AAAA-MM-DD', time: 'H:MM' }.
function canary(instant) {
  const date = new Date(instant);
  if (!instant || !Number.isFinite(date.getTime())) return null;
  const p = parts(CLOCK, date);
  return { day: `${p.year}-${p.month}-${p.day}`, time: `${Number(p.hour)}:${p.minute}` };
}

// «hoy a las 22:11» o «el 23 de septiembre a las 22:11» (spec §7: nunca «ahora»).
function checkedPhrase(instant, today) {
  const c = canary(instant);
  if (!c) return null;
  return c.day === today ? `hoy a las ${c.time}` : `el ${dayMonthLong(c.day)} a las ${c.time}`;
}

const score = (a, b) => `${a}–${b}`;
// 3.25 → '3,3': un decimal con coma, sin los datos de idioma del motor.
const oneDecimal = n => n.toFixed(1).replace('.', ',');
const listText = names => (names.length < 2 ? names.join('') : `${names.slice(0, -1).join(', ')} y ${names[names.length - 1]}`);

// ── Enlaces (spec §4.1) ─────────────────────────────────────────────────

const matchHref = m => routeHref('partido', { s: m.season, g: m.groupId, r: m.roundKey, h: m.home, a: m.away });
const teamHref = (group, team) => routeHref('equipo', { s: group.season, g: group.id, t: team });
// «Cambiar» y las demás búsquedas abren Explorar con el buscador enfocado: el
// ancla #buscar va tras la ruta, como #calendario en la ficha de equipo.
const SEARCH = `${routeHref('explorar')}#buscar`;

// ── Piezas comunes ──────────────────────────────────────────────────────

// La cabecera de pantalla común (screenHead, ui.js): escudo, nombre (el único h1), la etiqueta y
// «Cambiar». En E y X, sin «Cambiar»: la caja ya ofrece buscar otro equipo.
function header(name, subtitle, { shields, change = true }) {
  return screenHead(name, {
    sub: subtitle, crest: crest(name, { size: 46, shields, lazy: false }),
    action: change ? { href: SEARCH, label: 'Cambiar' } : null,
  });
}

const blockEmpty = (title, text) => html`<section class="block"><div class="block-head"><h2 class="block-title">${title}</h2></div>${empty(text)}</section>`;

const roundOf = (group, match) => group.rounds.find(round => round.key === match.roundKey) || null;

// La última jornada (en su orden) con algún resultado, o null.
function lastPlayedRound(group) {
  const played = group.rounds.filter(round => round.matches.some(m => m.hs != null && m.as != null));
  return played[played.length - 1] || null;
}

// Local o visitante, con escudo grande, en el próximo y en el último partido.
const side = (team, label, shields) => html`<span class="fixture-team">${crest(team, { size: 46, shields, lazy: false })}<span class="fixture-side">${label}</span><span class="fixture-name">${team}</span></span>`;

// Decisión 20 de B1: el grupo guardado terminó y el club no aparece en la fase
// siguiente, que ya lleva una semana en marcha (estados C y D).
const staleNotice = resolution => (resolution.stale
  ? notice('¿Sigue tu equipo en la Segunda Fase?', html`<a class="more" href="${SEARCH}">Búscalo en Explorar</a>`)
  : '');

// Lo principal y lo de consulta; en escritorio, dos columnas (spec §4.8).
const columns = (main, aside) => html`<div class="home-cols"><div class="home-main">${main}</div><div class="home-side">${aside}</div></div>`;

// ── Estado E: elegir equipo (spec §4.2 y §6.3) ──────────────────────────

function stateE(ctx, { shields }) {
  const name = ctx.myTeam?.name || 'Mi equipo';
  const choices = ctx.resolution.candidates.map((c, i) => html`<li><button type="button" class="choice" data-action="elegir" data-index="${i}">${crest(c.name, { size: 32, shields })}<span class="choice-text"><span class="choice-name">${c.name}</span><span class="choice-label">${c.group.label}</span></span></button></li>`);
  return html`${header(name, `Temporada ${seasonLabel(ctx.portal.season)}`, { shields, change: false })}${box(
    html`<ul class="choices">${choices}<li><a class="choice choice-none" href="${SEARCH}">Ninguno: buscar otro equipo</a></li></ul>`,
    { title: '¿En qué equipo juega ahora?' })}`;
}

// ── Estado X: no aparece ────────────────────────────────────────────────

function stateX(ctx, { shields }) {
  const name = ctx.myTeam?.name || 'Mi equipo';
  const season = seasonLabel(ctx.portal.season);
  return html`${header(name, `Temporada ${season}`, { shields, change: false })}<section class="block">${empty(`${name} no aparece en ${season}`)}<div class="buttons home-cta"><a class="button is-main" href="${SEARCH}">Elegir equipo</a></div></section>`;
}

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
  return html`${box(html`${when}${teams}${venue}${buttons}`, { title: 'Próximo partido', context: countdownLabel(m.dateISO, today) })}<p class="vh" role="status" data-role="aviso"></p>`;
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

function lastFiveBlock(results, group, name) {
  const items = results.map(r => html`<li><a class="last5-cell" href="${matchHref(r.match)}"><span class="form-chip form-${r.letter.toLowerCase()}" aria-hidden="true">${r.letter}</span><span class="vh">${LETTER[r.letter]}, </span><span class="last5-score">${score(r.gf, r.gc)}</span><span class="last5-rival"><span class="vh">${r.side === 'casa' ? 'en casa contra ' : 'fuera contra '}</span>${teamShort(r.rival)}</span></a></li>`);
  const more = html`<a class="more" href="${teamHref(group, name)}#calendario">calendario completo</a>`;
  return box(html`<ol class="last5 last5-${results.length}">${items}</ol>`,
    { title: results.length === 5 ? 'Últimos cinco' : 'Últimos resultados', context: more });
}

function standingsBlock(group, name, shields) {
  if (!group.standings.length) return blockEmpty('Clasificación', 'Clasificación sin publicar');
  const after = lastPlayedRound(group);
  return box(standingsTable(group.standings, {
    view: 'puntos', mine: name, shields, hrefFor: row => teamHref(group, row.team), caption: `Clasificación: ${group.label}`,
  }), { title: 'Clasificación', context: after ? `tras la ${after.label.toLowerCase()}` : null });
}

// Goleadores del equipo en su grupo: [{ name, goals, games }], por goles.
const scorersOf = (ctx, group, name) => teamScorers(ctx.model.scorers(group.season, group.cat),
  { name, season: group.season, cat: group.cat, groupId: group.id });

function scorersBlock(ctx, group, name) {
  const list = scorersOf(ctx, group, name);
  if (!list.length) return blockEmpty('Goleadores del equipo', 'Sin goleadores publicados de este equipo');
  const rows = list.slice(0, 5).map(s => html`<tr><th scope="row" class="sc-name">${playerName(s.name)}</th><td class="sc-goals">${s.goals}</td><td class="sc-games">${s.games}</td></tr>`);
  const more = html`<a class="more" href="${routeHref('goleadores', { s: group.season, g: group.id, t: name })}">ver todos</a>`;
  return box(html`<table class="scorers"><caption class="vh">Goleadores de ${name}</caption><thead><tr><th scope="col" class="sc-name">Jugador</th><th scope="col" class="sc-goals">Goles</th><th scope="col" class="sc-games"><abbr title="Partidos jugados">PJ</abbr></th></tr></thead><tbody>${rows}</tbody></table>`,
    { title: 'Goleadores del equipo', context: more });
}

// Partidos del equipo (sin los de retirados) con fecha pasada y sin marcador.
function missingResults(name, group, today) {
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
  if (vsRetired > 0) text += ` y ${vsRetired} contra ${listText(retired)} (${retired.length > 1 ? 'retirados' : 'retirado'})`;
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

// «Clasificación oficial de futbolaspalmas.com, comprobada el …» (spec §4.2 y §7).
function freshness(ctx, group) {
  const info = sourceInfo(group, false);
  const of = info.source ? ` de ${info.source}` : '';
  const lead = info.kind === 'calculada' ? `Clasificación calculada con los resultados${of}`
    : info.kind === 'corregida' ? `Clasificación${of} con los puntos corregidos` : `Clasificación oficial${of}`;
  const health = ctx.health;
  const item = health && health.season === group.season && health.groups ? health.groups[group.id] : null;
  const when = item && item.checkedAt ? checkedPhrase(item.checkedAt, ctx.today) : null;
  const text = `${lead}${when ? `, comprobada ${when}` : ''}.${item && item.status !== 'ok' ? ' Revisión pendiente.' : ''}`;
  return html`<p class="home-fresh">${text} <a class="more" href="${routeHref('fuentes')}">Ver fuentes</a></p>`;
}

// ── Estados A, B y C ────────────────────────────────────────────────────

// Sin nada jugado, un único vacío en lugar de Últimos cinco, goleadores y cifras
// (spec §4.2 B). Sus dos causas (B1, M2): el grupo no ha empezado, o sí, pero mi
// equipo no ha jugado (un retirado, como CD Batán en PG2).
function notPlayedText(group, name) {
  const started = group.rounds.some(round => round.matches.some(m => m.hs != null && m.as != null));
  if (!started) return 'Aún no se ha jugado ninguna jornada';
  if (retiredTeams(group).has(name)) return `${name} figura como retirado en este grupo`;
  return `${name} todavía no ha jugado ningún partido en este grupo`;
}

function seasonView(ctx, env, top) {
  const { group, name } = ctx.resolution;
  const results = lastResults(name, group, 5);
  const main = [top];
  const aside = [standingsBlock(group, name, env.shields)];
  if (results.length) {
    main.push(lastFiveBlock(results, group, name));
    aside.push(scorersBlock(ctx, group, name), figuresBlock(ctx, group, name));
  } else {
    main.push(html`<section class="block">${empty(notPlayedText(group, name))}</section>`);
  }
  aside.push(freshness(ctx, group));
  return columns(main, aside);
}

function stateA(ctx, env) {
  const { group, name } = ctx.resolution;
  const fx = teamFixtures(name, group, ctx.today);
  return html`${header(name, group.label, env)}${seasonView(ctx, env, nextBlock(fx.next, group, ctx.today, env.shields))}`;
}

function stateB(ctx, env) {
  const { group, name } = ctx.resolution;
  const fx = teamFixtures(name, group, ctx.today);
  const top = fx.next ? nextBlock(fx.next, group, ctx.today, env.shields)
    : box(html`<p class="home-note">${noNextText(fx, { finished: false })}</p>`, { title: 'Próximo partido' });
  return html`${header(name, group.label, env)}${seasonView(ctx, env, top)}`;
}

function stateC(ctx, env) {
  const r = ctx.resolution;
  const fx = teamFixtures(r.name, r.group, ctx.today);
  return html`${header(r.name, r.group.label, env)}${staleNotice(r)}${seasonView(ctx, env, lastBlock(fx, r.group, env.shields))}`;
}

// ── Estado D: temporada terminada ───────────────────────────────────────

// La cabecera, el aviso y la clasificación completa del grupo terminado.
function stateD(ctx, env) {
  const r = ctx.resolution;
  return html`${header(r.name, `Temporada ${seasonLabel(r.group.season)} terminada`, env)}${staleNotice(r)}${columns([], [standingsBlock(r.group, r.name, env.shields)])}`;
}

// ── Compartir y calendario del próximo partido (los usa mount) ──────────

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

// Confirma en el propio botón y en la región de estado, y vuelve al texto original.
function confirmOn(button, status, text) {
  if (status) status.textContent = text;
  if (!button.dataset.label) button.dataset.label = button.textContent;
  button.textContent = text;
  setTimeout(() => { button.textContent = button.dataset.label; }, 2500);
}

async function share(button, status, data) {
  const outcome = await shareLink(data);
  if (outcome === 'copiado') confirmOn(button, status, 'Enlace copiado');
  else if (outcome === 'no copiado') confirmOn(button, status, 'No se pudo copiar el enlace');
}

const STATES = { E: stateE, X: stateX, D: stateD, B: stateB, C: stateC, A: stateA };

export const screen = {
  id: 'home',
  // Todo sale de los datos inmediatos salvo data-health.json (la caja de D y la frescura): se pide
  // una vez y queda en datasets.health. Nunca rechaza: sin él, la portada se pinta igual (spec §7).
  needs: (params, datasets) => (datasets.health ? [] : [ensureHealth().then((health) => { datasets.health = health; })]),
  render(ctx) {
    const state = homeState({ resolution: ctx.resolution, todayISO: ctx.today, portalSeason: ctx.portal.season });
    const body = STATES[state](ctx, { shields: (ctx.datasets && ctx.datasets.shields) || {} });
    return html`<section data-screen="home" data-state="${state}">${body}</section>`;
  },
  mount(root, ctx, nav) {
    const section = root.matches && root.matches('[data-screen="home"]') ? root : root.querySelector('[data-screen="home"]');
    if (!section) return;
    // La escucha va en la sección, que se sustituye en cada pintado: nunca se acumula.
    section.addEventListener('click', event => {
      const target = event.target.closest('[data-action]');
      if (!target || !section.contains(target)) return;
      const action = target.getAttribute('data-action');
      if (action === 'elegir') {
        const c = ctx.resolution.candidates[Number(target.getAttribute('data-index'))];
        if (c && nav && typeof nav.saveMyTeam === 'function') {
          nav.saveMyTeam({ name: c.name, season: c.group.season, cat: c.cat, groupId: c.group.id });
        }
        return;
      }
      const { name, group } = ctx.resolution;
      const next = teamFixtures(name, group, ctx.today).next;
      if (!next) return;
      // El enlace compartido es el de la página sin consulta ni ruta: solo la del partido.
      const data = shareData(next, location.href.split(/[?#]/)[0]);
      if (action === 'calendario') {
        downloadCalendar(...calendarArgs(next, group, data.url));
      } else if (action === 'compartir') {
        share(target, section.querySelector('[data-role="aviso"]'), data);
      }
    });
  },
};
