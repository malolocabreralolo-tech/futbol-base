// Pantalla Jornada (spec §4.3 y §4.8; maqueta 5-1). render(ctx) es pura: «‹ Jornada N de M ›»
// con sus fechas, los partidos por día con el propio primero y resaltado, el aviso de la
// jornada y la botonera. Bajo la cabecera, la tira de los grupos de su competición (groupStrip), con
// «Todos» delante, y a su derecha, «Mi grupo» u «Otras ligas». Sin `g` y con `c` y `f`, «Todos los
// grupos»: la misma jornada en todos los de la competición, un bloque por grupo. mount() añade
// compartir y el .ics del grupo. En las ligas de prebenjamín de la temporada en curso (17/10/2026), cada
// partido sin jugar de cualquier jornada (todo el calendario, no solo la próxima: lo pidió el usuario ese
// mismo día) lleva debajo su pronóstico (pronostico.js; la línea, forecastLine de ui.js, la misma a
// cualquier distancia) y la jornada, la nota de en qué se basa, que en una jornada de más adelante dice
// para dentro de cuántas jornadas y que se recalcula (forecastNote); en cualquier otro grupo, en lo
// jugado y en lo que no está pendiente, forecastRound no da ninguno y no se pinta nada.
import { html } from './html.js';
import {
  screenHead, matchRow, notice, empty, listEs, shareStatus, block, groupStrip, scrollToCurrent, forecastNote, forecastOptions,
} from './ui.js';
import { errorBox } from './shell.js';
import {
  CAT_NAMES, competitionRound, competitions, defaultRound, findRound, groupSummary, roundNotice, retiredTeams, matchState,
  seasonLabel, siblingGroups,
} from './model.js';
// Los días y los meses, escritos en links.js (Tarea 7): sin los datos de idioma del motor.
import { MONTHS, WEEKDAYS, routeHref, matchHref, downloadCalendar, shareAndAnnounce } from './links.js';
import { jornadaNumber, seasonNeeds } from './state.js';
import { myGroupIn, myTeamIn } from './myteam.js';
import { forecastRound } from './pronostico.js';

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

// Los pronósticos de una jornada (forecastRound de pronostico.js, con las opciones de la web): { of(m),
// list }, el de cada partido (o null) y todos, para la nota. Fuera de prebenjamín de la temporada en
// curso, todos null.
function roundForecasts(ctx, group, round) {
  const list = forecastRound(group, round, forecastOptions(ctx));
  const byMatch = new Map(round.matches.map((m, i) => [m, list[i]]));
  return { of: m => byMatch.get(m) || null, list };
}

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

// La clave de la jornada de número `n` en `group` (las claves cambian de un grupo a otro: «Jornada 4» y
// «4»), o '' si no la tiene: el enlace va entonces a su jornada por defecto.
const roundKey = (group, n) => (n == null ? '' : (findRound(group, String(n)) || {}).key || '');

// «Otras ligas»: las ligas de la temporada, de la categoría y la isla del grupo si lo hay (to: la
// pantalla a la que llevan sus grupos).
const otherLeagues = (s, group = null) => ({
  href: routeHref('ligas', { s, c: group && group.cat, i: group && group.island, to: 'jornada' }),
  label: 'Otras ligas',
});

// La acción de la cabecera: «Mi grupo», la jornada del grupo de mi equipo en esa temporada (el de su
// misma competición si juega en ella, `first`, con el número de jornada `n`; si no, o sin `n`, su jornada
// por defecto), cuando lo que se mira no es suyo (mine); si lo es, o mi equipo no juega esa temporada,
// «Otras ligas». En un grupo, `n` solo si la jornada se eligió (r): la que abre por defecto un grupo
// ajeno (un aplazado de la 1) no es la del próximo partido de mi equipo.
function headAction(ctx, s, { mine, first, n, group }) {
  const target = mine ? null : myGroupIn(ctx.model.season(s), ctx.myTeam, ctx.resolution, first);
  if (!target) return otherLeagues(s, group);
  return { href: routeHref('jornada', { s, g: target.id, r: first.includes(target) ? roundKey(target, n) : '' }), label: 'Mi grupo' };
}

// «‹» y «›» de la jornada, con id estable: al cambiar de jornada (replaceState), el router devuelve el
// foco al control pulsado, no al h1 (B11 de la revisión). En un extremo, el apagado conserva el id y el
// foco. href: el enlace, o null en un extremo; what: la jornada de al lado («Jornada 29»).
function roundStep(href, what, glyph, label, id) {
  return href
    ? html`<a class="round-step" id="${id}" href="${href}" aria-label="${label}: ${what}">${glyph}</a>`
    : html`<span class="round-step is-off" id="${id}" role="link" aria-disabled="true" tabindex="-1" aria-label="${label}: no hay">${glyph}</span>`;
}

// ── «Todos los grupos» de una competición (#/jornada?s&c&f&r, sin g) ─────

// La jornada del mismo número en todos los grupos de liga de la competición, uno debajo de otro (en
// escritorio, en dos columnas), el de mi equipo primero: cada uno, un bloque con su nombre, el enlace
// discreto a su tabla y sus partidos en una sola caja, por día (como en un grupo: el propio primero y
// resaltado, y sin los de retirados), con el aviso del que descansa. Arriba, la tira con «Todos»
// marcada y «‹ Jornada N de M ›» (por número: las claves cambian de un grupo a otro) con las fechas de
// todos. Por defecto, la jornada de mi grupo o la más repetida (competitionRound).
function competitionView(ctx, s) {
  const { params, model, today } = ctx;
  const shields = (ctx.datasets && ctx.datasets.shields) || {};
  const entry = competitions(model, s, { cat: params.c || null }).find(e => e.key === params.f);
  const groups = entry ? entry.groups.filter(g => g.kind === 'league') : [];
  const sub = entry ? `${CAT_NAMES[entry.cat]}, ${entry.label}${s === ctx.portal.season ? '' : ` · ${seasonLabel(s)}`}` : null;
  if (!groups.length) {
    const head = screenHead('Jornada', { sub, action: otherLeagues(s) });
    return html`<section data-screen="jornada">${head}${empty(`No encontramos la competición ${params.f} en la temporada ${seasonLabel(s)}.`)}</section>`;
  }
  const mineOf = new Map(groups.map(g => [g.id, myTeamIn(g, ctx.myTeam, ctx.resolution)]));
  const mineGroup = groups.find(g => mineOf.get(g.id)) || null;
  const numbers = [...new Set(groups.flatMap(g => g.rounds.map(r => r.n)).filter(n => n !== null))].sort((a, b) => a - b);
  const asked = params.r ? jornadaNumber(params.r) : null;
  const n = numbers.includes(asked) ? asked : competitionRound(groups, today, mineGroup && mineGroup.id);
  const at = { s, c: entry.cat, f: entry.key };
  const head = screenHead('Jornada', { sub, action: headAction(ctx, s, { mine: Boolean(mineGroup), first: groups, n, group: groups[0] }) });
  const strip = groupStrip({
    label: entry.label, groups, mineId: mineGroup && mineGroup.id,
    hrefFor: g => routeHref('jornada', { s, g: g.id, r: roundKey(g, n) }),
    all: { href: routeHref('jornada', { ...at, r: n === null ? '' : String(n) }), current: true },
  });
  if (n === null) {
    const why = s === ctx.portal.season ? 'La fuente todavía no ha publicado el calendario de esta competición.'
      : 'La fuente no publicó el calendario de esta competición.';
    return html`<section data-screen="jornada">${head}${strip}${empty(why)}</section>`;
  }
  const rounds = groups.map(g => ({ group: g, round: findRound(g, String(n)), mine: mineOf.get(g.id) || null }));
  const dates = rounds.flatMap(({ round }) => (round ? round.matches.map(m => m.dateISO).filter(Boolean) : [])).sort();
  const k = numbers.indexOf(n);
  const near = m => (m == null ? null : routeHref('jornada', { ...at, r: String(m) }));
  const nav = html`<nav class="round-nav" aria-label="Jornadas">${roundStep(near(numbers[k - 1]), `Jornada ${numbers[k - 1]}`, '‹', 'Jornada anterior', 'round-prev')}<div class="round-now"><h2 class="round-title">Jornada ${n} de ${numbers[numbers.length - 1]}</h2><p class="round-dates">${dateRange(dates[0], dates[dates.length - 1])}</p></div>${roundStep(near(numbers[k + 1]), `Jornada ${numbers[k + 1]}`, '›', 'Jornada siguiente', 'round-next')}</nav>`;
  const ordered = [...rounds.filter(x => x.mine), ...rounds.filter(x => !x.mine)];
  // Los pronósticos de todos los grupos, para una sola nota debajo (la misma en cada uno sería ruido).
  const guesses = [];
  const sections = ordered.map(({ group, round, mine }) => {
    const { label } = groupSummary(group);
    const title = mine ? html`${label}<span class="block-mine"> · mi grupo</span>` : label;
    const table = html`<a class="block-link" href="${routeHref('tabla', { s, g: group.id })}" aria-label="${label}: tabla">tabla ›</a>`;
    const id = `jornada-${group.id}`;
    if (!round) return block(title, empty(`Este grupo no tiene jornada ${n}.`), { context: table, id });
    // Sus partidos en una caja, con el día encima de los de cada día: matchRow solo dice la hora.
    const isMine = isMineOf(mine);
    const days = roundDays(group, round, mine);
    const warn = noticeText(roundNotice(group, round));
    const guess = roundForecasts(ctx, group, round);
    guesses.push(...guess.list);
    const body = days.length
      ? html`<div class="box">${days.map(day => html`<h3 class="match-day">${dayLabel(day.date)}</h3>${day.matches.map(m => matchRow(m, { mine: isMine(m), today, shields, href: matchHref(m), forecast: guess.of(m) }))}`)}</div>`
      : empty('La fuente no trae partidos de esta jornada.');
    return block(title, html`${body}${warn ? notice(warn.term, warn.text) : ''}`, { context: table, id });
  });
  return html`<section data-screen="jornada">${head}${strip}${nav}<div class="round-groups">${sections}</div>${forecastNote(guesses, { each: true })}</section>`;
}

function render(ctx) {
  const { params, model, today } = ctx;
  const shields = (ctx.datasets && ctx.datasets.shields) || {};
  const s = params.s || ctx.portal.season;
  // Sin la temporada (needs no la trajo): la caja de error, nunca otra temporada (§7).
  if (!model.season(s)) {
    return html`<section data-screen="jornada">${screenHead('Jornada', { action: otherLeagues(s) })}${errorBox(`la temporada ${seasonLabel(s)}`)}</section>`;
  }
  if (!params.g && params.f) return competitionView(ctx, s);
  const group = model.group(s, params.g);
  if (!group) {
    const why = params.g ? `No hay ningún grupo ${params.g} en la temporada ${seasonLabel(s)}.` : 'Elige un grupo en «Otras ligas».';
    return html`<section data-screen="jornada">${screenHead('Jornada', { action: otherLeagues(s) })}${empty(why)}</section>`;
  }
  const sub = s === ctx.portal.season ? group.label : `${group.label} · ${seasonLabel(s)}`;
  const siblings = siblingGroups(model, group);
  const round = pickRound(group, params.r, today);
  const n = round ? round.n : null;
  // La tira de los grupos de su competición, con «Todos» delante: cada grupo abre la jornada del mismo
  // número (si no la tiene, la suya por defecto), y «Todos», esa jornada en todos.
  const mine = myTeamIn(group, ctx.myTeam, ctx.resolution);
  const first = siblings ? siblings.list : [];
  const strip = siblings ? groupStrip({
    label: siblings.entry.label, groups: siblings.list, currentId: group.id,
    mineId: (first.find(g => myTeamIn(g, ctx.myTeam, ctx.resolution)) || {}).id,
    hrefFor: target => routeHref('jornada', { s, g: target.id, r: roundKey(target, n) }),
    all: { href: routeHref('jornada', { s, c: group.cat, f: group.compKey, r: n === null ? '' : String(n) }) },
  }) : '';
  const chosen = params.r ? n : null;
  const head = html`${screenHead('Jornada', { sub, action: headAction(ctx, s, { mine: Boolean(mine), first, n: chosen, group }) })}${strip}`;
  if (!round) {
    // En una temporada cerrada ya no lo publicará (2012-13: el archivo del portal solo guardó las tablas).
    const why = s === ctx.portal.season ? 'La fuente todavía no ha publicado el calendario de este grupo.'
      : 'La fuente no publicó el calendario de este grupo.';
    return html`<section data-screen="jornada">${head}${empty(why)}</section>`;
  }
  const at = group.rounds.indexOf(round);
  const step = (target, glyph, label, id) => roundStep(target ? routeHref('jornada', { s, g: group.id, r: target.key }) : null,
    target && target.label, glyph, label, id);
  const days = roundDays(group, round, mine);
  const dates = days.map(day => day.date).filter(Boolean).sort();
  const nav = html`<nav class="round-nav" aria-label="Jornadas">${step(group.rounds[at - 1], '‹', 'Jornada anterior', 'round-prev')}<div class="round-now"><h2 class="round-title">${roundTitle(group, round)}</h2><p class="round-dates">${dateRange(dates[0], dates[dates.length - 1])}</p></div>${step(group.rounds[at + 1], '›', 'Jornada siguiente', 'round-next')}</nav>`;
  const isMine = isMineOf(mine);
  const guess = roundForecasts(ctx, group, round);
  const list = days.length
    ? html`<div class="days">${days.map(day => html`<section class="day"><h3 class="day-title">${dayLabel(day.date)}</h3><div class="box">${day.matches.map(m => matchRow(m, { mine: isMine(m), today, shields, href: matchHref(m), forecast: guess.of(m) }))}</div></section>`)}</div>`
    : empty('La fuente no trae partidos de esta jornada.');
  const warn = noticeText(roundNotice(group, round));
  const calendar = groupCalendar(group, today).length > 0
    ? html`<button class="button" type="button" data-action="group-calendar">Calendario del grupo</button>` : '';
  // Bajo la botonera, la región de estado de «Compartir jornada» (shareStatus, la de todas las pantallas).
  const actions = html`<div class="box round-actions"><div class="buttons"><button class="button" type="button" data-action="share-round">Compartir jornada</button>${calendar}</div></div>${shareStatus()}`;
  return html`<section data-screen="jornada">${head}${nav}${list}${warn ? notice(warn.term, warn.text) : ''}${forecastNote(guess.list)}${actions}</section>`;
}

function mount(root, ctx) {
  // La tira de grupos, hasta el actual, dentro de su caja: la página no se mueve.
  scrollToCurrent(root.querySelector('.group-scroll'));
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
