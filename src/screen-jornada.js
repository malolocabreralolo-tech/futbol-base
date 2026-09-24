// Pantalla Jornada (spec §4.3 y §4.8; maqueta 5-1). render(ctx) es pura: «‹ Jornada N de M ›»
// con sus fechas, los partidos por día con el propio primero y resaltado, el aviso de la
// jornada, la botonera y «Otro grupo». mount() añade compartir y el .ics del grupo.
import { html } from './html.js';
import { screenHead, matchRow, notice, empty } from './ui.js';
import { errorBox } from './shell.js';
import { defaultRound, findRound, roundNotice, retiredTeams, matchState, seasonLabel } from './model.js';
// Los días y los meses, escritos en links.js (Tarea 7): sin los datos de idioma del motor.
import { MONTHS, WEEKDAYS, routeHref, downloadCalendar, shareLink } from './links.js';
import { seasonNeeds } from './state.js';
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

// «A», «A y B», «A, B y C» (o con «o»).
const listEs = (items, conj) => (items.length < 2 ? items.join('')
  : `${items.slice(0, -1).join(', ')} ${conj} ${items[items.length - 1]}`);

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

// Días de la jornada, sin los partidos contra retirados (nunca se jugarán; el aviso los
// explica). El día del partido propio va primero y, dentro, el propio en cabeza; los demás, por
// fecha; «Sin fecha», al final. En cada día, por hora y en el orden de la fuente.
function roundDays(group, round, mine) {
  const vsRetired = againstRetired(retiredTeams(group));
  const isMine = m => mine !== null && (m.home === mine || m.away === mine);
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

const otherGroup = (s, group) => ({
  href: routeHref('ligas', { s, c: group && group.cat, i: group && group.island, to: 'jornada' }),
  label: 'Otro grupo',
});

function render(ctx) {
  const { params, model, today } = ctx;
  const shields = (ctx.datasets && ctx.datasets.shields) || {};
  const s = params.s || ctx.portal.season;
  // Sin la temporada (needs no la trajo): la caja de error, nunca otra temporada (§7).
  if (!model.season(s)) {
    return html`<section data-screen="jornada">${screenHead('Jornada', { action: otherGroup(s) })}${errorBox(`la temporada ${seasonLabel(s)}`)}</section>`;
  }
  const group = model.group(s, params.g);
  if (!group) {
    const why = params.g ? `No hay ningún grupo ${params.g} en la temporada ${seasonLabel(s)}.` : 'Elige un grupo en «Otro grupo».';
    return html`<section data-screen="jornada">${screenHead('Jornada', { action: otherGroup(s) })}${empty(why)}</section>`;
  }
  const sub = s === ctx.portal.season ? group.label : `${group.label} · ${seasonLabel(s)}`;
  const head = screenHead('Jornada', { sub, action: otherGroup(s, group) });
  const round = pickRound(group, params.r, today);
  if (!round) {
    return html`<section data-screen="jornada">${head}${empty('La fuente todavía no ha publicado el calendario de este grupo.')}</section>`;
  }
  const mine = myTeamIn(group, ctx.myTeam, ctx.resolution);
  const at = group.rounds.indexOf(round);
  const roundHref = target => routeHref('jornada', { s, g: group.id, r: target.key });
  // «‹ ›» con id estable: al cambiar de jornada (replaceState), el router devuelve el foco al control
  // pulsado, no al h1 (B11 de la revisión). En un extremo, el apagado conserva el id y el foco.
  const step = (target, glyph, label, id) => (target
    ? html`<a class="round-step" id="${id}" href="${roundHref(target)}" aria-label="${label}: ${target.label}">${glyph}</a>`
    : html`<span class="round-step is-off" id="${id}" role="link" aria-disabled="true" tabindex="-1" aria-label="${label}: no hay">${glyph}</span>`);
  const days = roundDays(group, round, mine);
  const dates = days.map(day => day.date).filter(Boolean).sort();
  const nav = html`<nav class="round-nav" aria-label="Jornadas">${step(group.rounds[at - 1], '‹', 'Jornada anterior', 'round-prev')}<div class="round-now"><h2 class="round-title">${roundTitle(group, round)}</h2><p class="round-dates">${dateRange(dates[0], dates[dates.length - 1])}</p></div>${step(group.rounds[at + 1], '›', 'Jornada siguiente', 'round-next')}</nav>`;
  const isMine = m => mine !== null && (m.home === mine || m.away === mine);
  const matchHref = m => routeHref('partido', { s, g: group.id, r: round.key, h: m.home, a: m.away });
  const list = days.length
    ? html`<div class="days">${days.map(day => html`<section class="day"><h3 class="day-title">${dayLabel(day.date)}</h3><div class="box">${day.matches.map(m => matchRow(m, { mine: isMine(m), today, shields, href: matchHref(m) }))}</div></section>`)}</div>`
    : empty('La fuente no trae partidos de esta jornada.');
  const warn = noticeText(roundNotice(group, round));
  const calendar = groupCalendar(group, today).length > 0
    ? html`<button class="button" type="button" data-action="group-calendar">Calendario del grupo</button>` : '';
  const actions = html`<div class="box round-actions"><div class="buttons" aria-live="polite"><button class="button" type="button" data-action="share-round">Compartir jornada</button>${calendar}</div></div>`;
  return html`<section data-screen="jornada">${head}${nav}${list}${warn ? notice(warn.term, warn.text) : ''}${actions}</section>`;
}

// Cambia un momento el texto del botón («Enlace copiado»); la botonera es aria-live.
function flash(button, text) {
  if (!button.dataset.label) button.dataset.label = button.textContent;
  button.textContent = text;
  setTimeout(() => { button.textContent = button.dataset.label; }, 2500);
}

// shareLink (links.js): navigator.share y, si no hay o falla, copiar el enlace (§4.2 A). La
// botonera dice en el propio botón si se copió.
async function share(button, data) {
  const outcome = await shareLink(data);
  if (outcome === 'copiado') flash(button, 'Enlace copiado');
  else if (outcome === 'no copiado') flash(button, 'No se pudo copiar el enlace');
}

function mount(root, ctx) {
  const el = root.querySelector('[data-screen="jornada"]') || root;
  const group = ctx.model.group(ctx.params.s || ctx.portal.season, ctx.params.g);
  const round = group && pickRound(group, ctx.params.r, ctx.today);
  if (!round) return;
  const link = params => new URL(routeHref('jornada', params), location.href).href;
  el.addEventListener('click', (event) => {
    const button = event.target.closest('button[data-action]');
    if (!button) return;
    if (button.dataset.action === 'share-round') {
      share(button, { title: `${round.label} · ${group.label}`, url: link({ s: group.season, g: group.id, r: round.key }) });
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
