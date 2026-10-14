// Pantalla Jornada (spec §4.3 y §4.8; maqueta 5-1). render(ctx) es pura: «‹ Jornada N de M ›»
// con sus fechas, los partidos por día con el propio primero y resaltado, el aviso de la
// jornada, la botonera y «Otro grupo»; bajo la cabecera, los otros grupos de la competición
// («‹ Grupo 5 de 24 ›»), el atajo a Tabla y Evolución y «Este grupo | Todos (N)». Sin `g` y con `c` y
// `f`, «Todos los grupos»: la misma jornada en todos los de la competición. mount() añade compartir y
// el .ics del grupo.
import { html } from './html.js';
import {
  screenHead, matchRow, notice, empty, listEs, shareStatus, block, countLabel, segmented, groupChip, groupNav, groupViews,
  scrollToCurrent,
} from './ui.js';
import { errorBox } from './shell.js';
import {
  CAT_NAMES, competitionRound, competitions, defaultRound, findRound, groupSummary, roundNotice, retiredTeams, matchState,
  seasonLabel, siblingGroups,
} from './model.js';
// Los días y los meses, escritos en links.js (Tarea 7): sin los datos de idioma del motor.
import { MONTHS, WEEKDAYS, routeHref, matchHref, downloadCalendar, shareAndAnnounce } from './links.js';
import { jornadaNumber, seasonNeeds } from './state.js';
import { myTeamIn } from './myteam.js';

function dayParts(iso) {
  const [y, m, d] = iso.split('-').map(Number);
  return { y, d, month: MONTHS[m - 1], weekday: WEEKDAYS[new Date(Date.UTC(y, m - 1, d)).getUTCDay()] };
}

// Cabecera de un día: «Martes 2 de junio»; sin fecha, «Sin fecha».
export function dayLabel(iso) {
  if (!iso) return 'Sin fecha';
  const { d, month, weekday } = dayParts(iso);
  return `${weekday[0].toUpperCase()}${weekday.slice(1)} ${d} de ${month}`;
}

// Intervalo de la jornada: «del 2 al 6 de junio», «del 30 de mayo al 2 de junio», con el año
// solo si cambia; un solo día, «sábado 6 de junio».
export function dateRange(from, to) {
  if (!from) return 'sin fecha publicada';
  const a = dayParts(from), b = dayParts(to || from);
  if (!to || from === to) return `${a.weekday} ${a.d} de ${a.month}`;
  if (a.y !== b.y) return `del ${a.d} de ${a.month} de ${a.y} al ${b.d} de ${b.month} de ${b.y}`;
  if (a.month !== b.month) return `del ${a.d} de ${a.month} al ${b.d} de ${b.month}`;
  return `del ${a.d} al ${b.d} de ${b.month}`;
}

// La ronda de `r` (findRound, de la Tarea 6: Round.key y, si no existe, por número, para un enlace
// escrito a mano con «r=30»; la misma regla que el router), o la de defaultRound (decisión 1 de B1:
// por fecha). null si el grupo no tiene rondas.
function pickRound(group, r, today) {
  return findRound(group, r) || defaultRound(group, today);
}

// «Jornada N de M»; M es la mayor jornada del grupo, aunque falte alguna en la fuente.
function roundTitle(group, round) {
  if (round.n === null) return round.label;
  return `Jornada ${round.n} de ${Math.max(group.rounds.length, ...group.rounds.map(x => x.n ?? 0))}`;
}

const againstRetired = retired => m => retired.has(m.home) || retired.has(m.away);
// Si `m` es un partido de `mine` (el nombre resuelto, o null sin equipo propio en este grupo).
const isMineOf = mine => m => mine !== null && (m.home === mine || m.away === mine);

// Días de la jornada, sin los partidos contra retirados (nunca se jugarán; el aviso los
// explica). El día del partido propio va primero y, dentro, el propio en cabeza; los demás, por
// fecha; «Sin fecha», al final. En cada día, por hora y en el orden de la fuente.
function roundDays(group, round, mine) {
  const vsRetired = againstRetired(retiredTeams(group));
  const isMine = isMineOf(mine);
  const byDay = new Map();
  round.matches.filter(m => !vsRetired(m)).forEach((m, i) => {
    const key = m.dateISO || '';
    if (!byDay.has(key)) byDay.set(key, []);
    byDay.get(key).push({ m, i });
  });
  const days = [...byDay].map(([date, items]) => ({
    date: date || null,
    mine: items.some(({ m }) => isMine(m)),
    matches: items.sort((a, b) => isMine(b.m) - isMine(a.m)
      || (a.m.time || '99:99').localeCompare(b.m.time || '99:99') || a.i - b.i).map(({ m }) => m),
  }));
  return days.sort((a, b) => b.mine - a.mine || (a.date === null) - (b.date === null)
    || (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
}

// Aviso de la jornada con los textos de §4.3, o null.
function noticeText(n) {
  if (!n) return null;
  if (n.kind === 'faltan') {
    const one = n.missing === 1;
    return { term: `Falta${one ? '' : 'n'} ${n.missing} partido${one ? '' : 's'}`, text: 'de esta jornada en la fuente' };
  }
  const why = n.retired.length ? ` (descansa o le tocaba contra ${listEs(n.retired, 'o')})` : '';
  return { term: 'Sin partido en esta jornada:', text: `${listEs(n.teams, 'y')}${why}` };
}

// Partidos futuros del grupo para el .ics de «Calendario del grupo» (§4.3): los `pendiente`, sin
// los de retirados, en la forma de buildCalendar (links.js).
export function groupCalendar(group, today) {
  const vsRetired = againstRetired(retiredTeams(group));
  return (group.rounds || []).flatMap(round => round.matches
    .filter(m => !vsRetired(m) && matchState(m, today) === 'pendiente')
    .map(m => ({ date: m.dateISO, time: m.time || '', home: m.home, away: m.away, venue: m.venue || '', jornada: round.label })));
}

// «Otro grupo»: con grupos hermanos, directo a la lista de los de su competición (f); si no, a las
// ligas de su categoría y su isla.
const otherGroup = (s, group, siblings = null) => ({
  href: routeHref('ligas', { s, c: group && group.cat, i: group && group.island, f: siblings ? group.compKey : '', to: 'jornada' }),
  label: 'Otro grupo',
});

// Los otros grupos de su competición, «‹ Grupo 5 de 24 ›», y el atajo a la Tabla y a la Evolución del
// grupo, debajo de la cabecera. Cada grupo abre la jornada del mismo número (las claves cambian de un
// grupo a otro: «Jornada 4» y «4»); si no la tiene, la suya por defecto.
function groupBar(ctx, group, siblings, round) {
  const s = group.season;
  const mineId = siblings && (siblings.list.find(g => myTeamIn(g, ctx.myTeam, ctx.resolution)) || {}).id;
  const same = target => (round && round.n !== null ? (findRound(target, String(round.n)) || {}).key : '');
  return html`${siblings ? groupNav(siblings, {
    hrefFor: target => routeHref('jornada', { s, g: target.id, r: same(target) }),
    listHref: routeHref('ligas', { s, c: group.cat, f: group.compKey, to: 'jornada' }), mineId,
  }) : ''}${groupViews(group, 'jornada')}`;
}

// «‹» y «›» de la jornada, con id estable: al cambiar de jornada (replaceState), el router devuelve el
// foco al control pulsado, no al h1 (B11 de la revisión). En un extremo, el apagado conserva el id y el
// foco. href: el enlace, o null en un extremo; what: la jornada de al lado («Jornada 29»).
function roundStep(href, what, glyph, label, id) {
  return href
    ? html`<a class="round-step" id="${id}" href="${href}" aria-label="${label}: ${what}">${glyph}</a>`
    : html`<span class="round-step is-off" id="${id}" role="link" aria-disabled="true" tabindex="-1" aria-label="${label}: no hay">${glyph}</span>`;
}

// «Este grupo | Todos (N)», encima de la jornada: un grupo o todos los de su competición, con la jornada
// del mismo número. one: { label, href } del grupo; all: el enlace a «Todos los grupos». Ids estables:
// alcance-grupo y alcance-todos.
function scopeNav(one, all, count, active) {
  const options = [{ value: 'grupo', label: one.label }, { value: 'todos', label: `Todos (${count})` }];
  return html`<nav class="round-scope" aria-label="Grupos de la jornada">${segmented(options, active, value => (value === 'todos' ? all : one.href), { idPrefix: 'alcance' })}</nav>`;
}

// ── «Todos los grupos» de una competición (#/jornada?s&c&f&r, sin g) ─────

// La jornada del mismo número en todos los grupos de liga de la competición, uno debajo de otro (en
// escritorio, en dos columnas): el de mi equipo primero y resaltado, y cada uno con sus partidos por día
// (como en un grupo: el propio primero y sin los de retirados), el enlace a su tabla con el líder y el
// aviso del que descansa.
// Arriba, «Mi grupo | Todos (N)», «‹ Jornada N de M ›» (por número: las claves cambian de un grupo a
// otro) con las fechas de todos, y un índice de anclas para saltar a cada grupo. Por defecto, la
// jornada de mi grupo o la más repetida (competitionRound).
function competitionView(ctx, s) {
  const { params, model, today } = ctx;
  const shields = (ctx.datasets && ctx.datasets.shields) || {};
  const entry = competitions(model, s, { cat: params.c || null }).find(e => e.key === params.f);
  const groups = entry ? entry.groups.filter(g => g.kind === 'league') : [];
  const sub = entry ? `${CAT_NAMES[entry.cat]}, ${entry.label}${s === ctx.portal.season ? '' : ` · ${seasonLabel(s)}`}` : null;
  const head = screenHead('Jornada', { sub, action: { href: routeHref('ligas', { s, c: entry ? entry.cat : params.c, f: params.f, to: 'jornada' }), label: 'Elegir grupo' } });
  if (!groups.length) return html`<section data-screen="jornada">${head}${empty(`No encontramos la competición ${params.f} en la temporada ${seasonLabel(s)}.`)}</section>`;
  const mineOf = new Map(groups.map(g => [g.id, myTeamIn(g, ctx.myTeam, ctx.resolution)]));
  const mineGroup = groups.find(g => mineOf.get(g.id)) || null;
  const numbers = [...new Set(groups.flatMap(g => g.rounds.map(r => r.n)).filter(n => n !== null))].sort((a, b) => a - b);
  const asked = params.r ? jornadaNumber(params.r) : null;
  const n = numbers.includes(asked) ? asked : competitionRound(groups, today, mineGroup && mineGroup.id);
  if (n === null) {
    const why = s === ctx.portal.season ? 'La fuente todavía no ha publicado el calendario de esta competición.'
      : 'La fuente no publicó el calendario de esta competición.';
    return html`<section data-screen="jornada">${head}${empty(why)}</section>`;
  }
  const at = { s, c: entry.cat, f: entry.key };
  const home = mineGroup || groups[0];
  const homeRound = findRound(home, String(n));
  const scope = scopeNav({ label: mineGroup ? 'Mi grupo' : groupSummary(home).label, href: routeHref('jornada', { s, g: home.id, r: homeRound ? homeRound.key : '' }) },
    routeHref('jornada', { ...at, r: String(n) }), groups.length, 'todos');
  const rounds = groups.map(g => ({ group: g, round: findRound(g, String(n)), mine: mineOf.get(g.id) || null }));
  const dates = rounds.flatMap(({ round }) => (round ? round.matches.map(m => m.dateISO).filter(Boolean) : [])).sort();
  const k = numbers.indexOf(n);
  const near = m => (m == null ? null : routeHref('jornada', { ...at, r: String(m) }));
  const nav = html`<nav class="round-nav" aria-label="Jornadas">${roundStep(near(numbers[k - 1]), `Jornada ${numbers[k - 1]}`, '‹', 'Jornada anterior', 'round-prev')}<div class="round-now"><h2 class="round-title">Jornada ${n} de ${numbers[numbers.length - 1]}</h2><p class="round-dates">${dateRange(dates[0], dates[dates.length - 1])} · ${countLabel(groups.length, 'grupo', 'grupos')}</p></div>${roundStep(near(numbers[k + 1]), `Jornada ${numbers[k + 1]}`, '›', 'Jornada siguiente', 'round-next')}</nav>`;
  // El índice: una casilla por grupo, en su orden, que salta a su bloque (un ancla de la página).
  const index = html`<nav class="group-index" aria-label="Ir a un grupo"><div class="group-strip">${groups.map(g => groupChip(g, `#jornada-${g.id}`, { mine: Boolean(mineOf.get(g.id)) }))}</div></nav>`;
  const ordered = [...rounds.filter(x => x.mine), ...rounds.filter(x => !x.mine)];
  const sections = ordered.map(({ group, round, mine }) => {
    const summary = groupSummary(group);
    const title = mine ? html`${summary.label}<span class="block-mine"> · mi grupo</span>` : summary.label;
    const table = html`<a class="block-link" href="${routeHref('tabla', { s, g: group.id })}">${summary.leader ? `tabla · líder: ${summary.leader}` : 'tabla'}</a>`;
    const id = `jornada-${group.id}`;
    if (!round) return block(title, empty(`Este grupo no tiene jornada ${n}.`), { context: table, id });
    // Sus partidos por día, como en un grupo: matchRow solo dice la hora.
    const isMine = isMineOf(mine);
    const days = roundDays(group, round, mine);
    const warn = noticeText(roundNotice(group, round));
    const body = days.length
      ? days.map(day => html`<h3 class="group-day">${dayLabel(day.date)}</h3><div class="box">${day.matches.map(m => matchRow(m, { mine: isMine(m), today, shields, href: matchHref(m) }))}</div>`)
      : empty('La fuente no trae partidos de esta jornada.');
    return block(title, html`${body}${warn ? notice(warn.term, warn.text) : ''}`, { context: table, id });
  });
  return html`<section data-screen="jornada">${head}${scope}${nav}${index}<div class="round-groups">${sections}</div></section>`;
}

function render(ctx) {
  const { params, model, today } = ctx;
  const shields = (ctx.datasets && ctx.datasets.shields) || {};
  const s = params.s || ctx.portal.season;
  // Sin la temporada (needs no la trajo): la caja de error, nunca otra temporada (§7).
  if (!model.season(s)) {
    return html`<section data-screen="jornada">${screenHead('Jornada', { action: otherGroup(s) })}${errorBox(`la temporada ${seasonLabel(s)}`)}</section>`;
  }
  if (!params.g && params.f) return competitionView(ctx, s);
  const group = model.group(s, params.g);
  if (!group) {
    const why = params.g ? `No hay ningún grupo ${params.g} en la temporada ${seasonLabel(s)}.` : 'Elige un grupo en «Otro grupo».';
    return html`<section data-screen="jornada">${screenHead('Jornada', { action: otherGroup(s) })}${empty(why)}</section>`;
  }
  const sub = s === ctx.portal.season ? group.label : `${group.label} · ${seasonLabel(s)}`;
  const siblings = siblingGroups(model, group);
  const round = pickRound(group, params.r, today);
  const head = html`${screenHead('Jornada', { sub, action: otherGroup(s, group, siblings) })}${groupBar(ctx, group, siblings, round)}`;
  if (!round) {
    // En una temporada cerrada ya no lo publicará (2012-13: el archivo del portal solo guardó las tablas).
    const why = s === ctx.portal.season ? 'La fuente todavía no ha publicado el calendario de este grupo.'
      : 'La fuente no publicó el calendario de este grupo.';
    return html`<section data-screen="jornada">${head}${empty(why)}</section>`;
  }
  const mine = myTeamIn(group, ctx.myTeam, ctx.resolution);
  const at = group.rounds.indexOf(round);
  const step = (target, glyph, label, id) => roundStep(target ? routeHref('jornada', { s, g: group.id, r: target.key }) : null,
    target && target.label, glyph, label, id);
  // Con grupos hermanos, «Este grupo | Todos (N)»: la misma jornada en todos los de su competición.
  const scope = siblings ? scopeNav({ label: 'Este grupo', href: routeHref('jornada', { s, g: group.id, r: round.key }) },
    routeHref('jornada', { s, c: group.cat, f: group.compKey, r: round.n === null ? '' : String(round.n) }), siblings.list.length, 'grupo') : '';
  const days = roundDays(group, round, mine);
  const dates = days.map(day => day.date).filter(Boolean).sort();
  const nav = html`<nav class="round-nav" aria-label="Jornadas">${step(group.rounds[at - 1], '‹', 'Jornada anterior', 'round-prev')}<div class="round-now"><h2 class="round-title">${roundTitle(group, round)}</h2><p class="round-dates">${dateRange(dates[0], dates[dates.length - 1])}</p></div>${step(group.rounds[at + 1], '›', 'Jornada siguiente', 'round-next')}</nav>`;
  const isMine = isMineOf(mine);
  const list = days.length
    ? html`<div class="days">${days.map(day => html`<section class="day"><h3 class="day-title">${dayLabel(day.date)}</h3><div class="box">${day.matches.map(m => matchRow(m, { mine: isMine(m), today, shields, href: matchHref(m) }))}</div></section>`)}</div>`
    : empty('La fuente no trae partidos de esta jornada.');
  const warn = noticeText(roundNotice(group, round));
  const calendar = groupCalendar(group, today).length > 0
    ? html`<button class="button" type="button" data-action="group-calendar">Calendario del grupo</button>` : '';
  // Bajo la botonera, la región de estado de «Compartir jornada» (shareStatus, la de todas las pantallas).
  const actions = html`<div class="box round-actions"><div class="buttons"><button class="button" type="button" data-action="share-round">Compartir jornada</button>${calendar}</div></div>${shareStatus()}`;
  return html`<section data-screen="jornada">${head}${scope}${nav}${list}${warn ? notice(warn.term, warn.text) : ''}${actions}</section>`;
}

function mount(root, ctx) {
  // La tira de grupos, hasta el actual, dentro de su caja: la página no se mueve.
  scrollToCurrent(root.querySelector('.group-strip'));
  const el = root.querySelector('[data-screen="jornada"]') || root;
  const group = ctx.model.group(ctx.params.s || ctx.portal.season, ctx.params.g);
  const round = group && pickRound(group, ctx.params.r, ctx.today);
  if (!round) return;
  const link = params => new URL(routeHref('jornada', params), location.href).href;
  el.addEventListener('click', (event) => {
    const button = event.target.closest('button[data-action]');
    if (!button) return;
    if (button.dataset.action === 'share-round') {
      // shareLink y la respuesta común (links.js): «Enlace copiado.» o el enlace, en la región de estado.
      shareAndAnnounce({ title: `${round.label} · ${group.label}`, url: link({ s: group.season, g: group.id, r: round.key }) },
        el.querySelector('.share-status'));
    } else if (button.dataset.action === 'group-calendar') {
      downloadCalendar(groupCalendar(group, ctx.today), {
        season: group.season, group: group.id, name: group.label, url: link({ s: group.season, g: group.id }),
      });
    }
  });
}

export const screen = {
  id: 'jornada',
  needs: (params, datasets, { portalSeason } = {}) => seasonNeeds(params.s, datasets, portalSeason),
  render,
  mount,
};
