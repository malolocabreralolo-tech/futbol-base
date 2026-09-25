// Pantalla Partido (spec §4.5): resultado con los penaltis, los goles de
// timelineFor con su aviso si no cuadran con el marcador, las alineaciones del
// acta, el cara a cara del grupo con las temporadas anteriores bajo demanda y
// el contexto de los dos equipos.
// render(ctx) es pura y síncrona: no toca el DOM ni el reloj (hoy llega en
// ctx.today). mount(root, ctx) pone el comportamiento: compartir y desplegar
// las temporadas anteriores (con su «Reintentar»). «‹» y el «Reintentar» de la
// pantalla son del router (data-action="back" y "retry").
import { html, join } from './html.js';
import { block, box, cells, crest, empty, formChips, notice, screenHead, shareStatus } from './ui.js';
import {
  actaFor, competitionKey, findGroup, findMatch, headToHead, lastResults, matchState, penaltyWinner, playerName,
  roundOf, seasonLabel, teamShort, timelineFor,
} from './model.js';
import { countdownLabel, dayMonth, matchHref, shareAndAnnounce, weekdayDate } from './links.js';
import {
  ensureLineups, ensureMatchDetail, ensureSeasonData, loadSeasons, normalizeTeamName,
} from './state.js';
import { errorBox } from './shell.js';

const DASH = '–';
const PREVIOUS_ID = 'partido-anteriores';
const LOADERS = { ensureMatchDetail, ensureLineups, ensureSeasonData };

// ── Textos y fechas ──────────────────────────────────────────────────────

const score = (home, away) => `${home}${DASH}${away}`;
const dashed = (pair) => String(pair ?? '').replace('-', DASH);

// Día del calendario (AAAA-MM-DD), con los nombres de links.js (Tarea 7), sin los datos de idioma
// del motor: «jue 12 feb» en la casilla de fecha y «12 feb» en el cara a cara.
const longDate = weekdayDate;
const shortDate = dayMonth;

// Procedencia de cada cifra, para el aviso de datos contradictorios (spec §7).
const TIMELINE_SOURCE = { futbolaspalmas: 'la cronología de futbolaspalmas', acta: 'el acta de la federación' };
function scoreSource(group) {
  const url = String(group.url || '');
  if (/futbolaspalmas\.com/i.test(url)) return 'el resultado de futbolaspalmas';
  if (/fiflp\.com/i.test(url)) return 'el resultado de la federación';
  return 'el resultado del calendario';
}

// Acta oficial en la web de la federación (spec §9.2): abre sin sesión.
const actaUrl = (cod) => `https://www.fiflp.com/pnfg/NPcd/NFG_CmpPartido?cod_primaria=1000120&CodActa=${cod}&cod_acta=${cod}`;

// ── Localizar el partido de la ruta ──────────────────────────────────────

// (s, g, r, h, a) identifica el partido: findMatch de model.js (Tarea 6), el mismo criterio con
// el que el router lo deja pasar (la ronda por su clave o su número; si ahí no está, el único
// partido de h contra a del grupo).

function locate(ctx) {
  const params = ctx.params || {};
  const season = params.s || ctx.portal.season;
  const loaded = ctx.model.season(season);
  const group = loaded ? findGroup(ctx.model, season, params.g) : null;
  const match = group ? findMatch(group, params) : null;
  return { season, loaded, group, match };
}

// «‹» sin historial de la app es ctx.backHref, que pone el router con parentOf (router.js): la
// jornada del partido (spec §4.1) o, en un torneo o una copa, su cuadro (decisión 100). Un solo
// padre para la pantalla y para la caja de error del router (M2 de la revisión final de B2).

// El lado de mi equipo en este partido ('home' | 'away'), solo en su grupo resuelto.
function mineSide(ctx, match) {
  const r = ctx.resolution;
  if (!r || r.status !== 'ok' || !r.group || r.group.id !== match.groupId || r.group.season !== match.season) return null;
  return r.name === match.home ? 'home' : r.name === match.away ? 'away' : null;
}

// ── Bloques (block, de ui.js) ────────────────────────────────────────────

// La cabecera de pantalla común (screenHead, ui.js): «‹» al padre, el título, la etiqueta de
// jornada y grupo, y Compartir (un botón, con los datos del enlace). Debajo, la región de estado
// común (shareStatus) dice si se copió el enlace.
function header({ title, subtitle, back, share }) {
  const shareButton = share
    ? html`<button type="button" class="screen-action" data-action="share" data-title="${share.title}" data-text="${share.text}" data-path="${share.path}">Compartir</button>`
    : null;
  return html`${screenHead(title, { sub: subtitle, back, action: shareButton })}${shareStatus()}`;
}

function resultBlock(match, { today, shields }) {
  const state = matchState(match, today);
  const played = state === 'jugado';
  const context = played ? 'final' : state === 'pendiente' ? countdownLabel(match.dateISO, today) || 'pendiente' : state;
  const facts = cells([
    { label: 'Fecha', value: match.dateISO ? longDate(match.dateISO) : 'sin fecha', muted: !match.dateISO },
    { label: 'Hora', value: match.time || 'no publicada', muted: !match.time },
    { label: 'Campo', value: match.venue || 'no publicado', muted: !match.venue },
  ]);
  const team = (name, side) => html`<div class="pt-team">${crest(name, { size: 46, shields, lazy: false })}<span class="pt-side">${side}</span><span class="pt-name">${name}</span></div>`;
  const marker = played
    ? html`<p class="pt-score"><span class="vh">Resultado: </span>${score(match.hs, match.as)}</p>`
    : html`<p class="pt-score is-pending"><span aria-hidden="true">${DASH}</span><span class="vh">Sin resultado</span></p>`;
  // Eliminatoria resuelta por penaltis (spec §4.5 y §9.3): quién pasó y la tanda si se conoce.
  const winner = penaltyWinner(match);
  const penalties = winner
    ? html`<p class="pt-penalties">${winner} pasó por penaltis${match.shootout ? html` <span class="pt-tanda">(${dashed(match.shootout)})</span>` : ''}</p>`
    : '';
  return box(html`${facts}<div class="pt-teams">${team(match.home, 'Local')}${marker}${team(match.away, 'Visitante')}</div>${penalties}`,
    { title: 'Resultado', context });
}

const noName = html`<span class="pt-noname">sin nombre</span>`;
const minuteOf = (goal) => (goal.minute != null ? html`<span class="pt-g-min">${goal.minute}'</span>` : '');

// Cronología en tres columnas (spec §4.5): goleador local | minuto y marcador parcial | goleador visitante.
function goalsTable(goals, match, mine) {
  const scorer = (goal, side) => (goal.side !== side ? '' : goal.name || noName);
  const cls = (base, side) => (mine === side ? `${base} pt-mine` : base);
  const rows = goals.map((goal) => html`<tr><td class="${cls('pt-g-home', 'home')}">${scorer(goal, 'home')}</td><td class="pt-g-mid">${minuteOf(goal)}${goal.minute != null && goal.score ? ' ' : ''}${goal.score ? html`<b class="pt-g-score">${dashed(goal.score)}</b>` : ''}</td><td class="${cls('pt-g-away', 'away')}">${scorer(goal, 'away')}</td></tr>`);
  return html`<table class="pt-goals"><caption class="vh">Goles en orden: local a la izquierda y visitante a la derecha</caption><thead><tr><th scope="col" class="pt-g-home"><span class="vh">${match.home} (local)</span></th><th scope="col" class="pt-g-mid"><span class="vh">Minuto y marcador</span></th><th scope="col" class="pt-g-away"><span class="vh">${match.away} (visitante)</span></th></tr></thead><tbody>${rows}</tbody></table>`;
}

// Acta con algún gol sin minuto: la lista de goleadores de cada equipo, cada
// uno una vez con sus goles y los minutos que da el acta, sin marcador parcial.
function goalsLists(goals, match, mine) {
  const list = (side, name, label) => {
    const scorers = new Map();
    for (const goal of goals) {
      if (goal.side !== side) continue;
      const entry = scorers.get(goal.name) || { name: goal.name, count: 0, minutes: [] };
      entry.count += 1;
      if (goal.minute != null) entry.minutes.push(`${goal.minute}'`);
      scorers.set(goal.name, entry);
    }
    const items = [...scorers.values()].map((s) => html`<li>${s.name || noName}${s.count > 1 ? html` <span class="pt-glist-n">(${s.count}<span class="vh"> goles</span>)</span>` : ''}${s.minutes.length ? html` <span class="pt-g-min">${s.minutes.join(', ')}</span>` : ''}</li>`);
    return html`<div class="${mine === side ? 'pt-glist pt-mine' : 'pt-glist'}"><h3 class="pt-glist-head"><span class="pt-side">${label}</span> ${name}</h3>${items.length
      ? html`<ul>${items}</ul>`
      : html`<p class="pt-glist-none">Sin goles</p>`}</div>`;
  };
  return html`<div class="pt-glists">${list('home', match.home, 'Local')}${list('away', match.away, 'Visitante')}</div>`;
}

function goalsBlock(match, group, ctx) {
  const detail = ctx.datasets.matchDetail;
  const lineups = (ctx.datasets.lineups || {})[match.season];
  // Sin data-matchdetail.js no se sabe si hay cronología de futbolaspalmas, que
  // manda sobre el acta: caja de error, nunca el acta en su lugar.
  if (detail == null) return block('Goles', errorBox('la cronología de goles'));
  const timeline = timelineFor(match, detail, lineups || null);
  const scoreless = match.hs === 0 && match.as === 0;
  if (!timeline) {
    if (lineups == null) return block('Goles', errorBox('la cronología de goles'));
    return block('Goles', empty(scoreless ? 'Partido sin goles.' : 'Ninguna fuente publica quién marcó en este partido.'));
  }
  const { source, goals, mismatch } = timeline;
  const mine = mineSide(ctx, match);
  const timed = goals.length > 0 && goals.every((goal) => goal.score);
  let body;
  if (!goals.length) {
    body = empty(scoreless ? 'Partido sin goles.' : `${source === 'acta' ? 'El acta' : 'La cronología'} no recoge quién marcó.`);
  } else if (source === 'futbolaspalmas' || timed) {
    body = html`<div class="box">${goalsTable(goals, match, mine)}</div>`;
  } else {
    body = html`<div class="box">${goalsLists(goals, match, mine)}</div>${notice(null, 'El acta no da el minuto de todos los goles, así que no hay marcador parcial.')}`;
  }
  // Datos contradictorios (spec §4.5 y §7): las dos cifras y su procedencia.
  const warning = mismatch
    ? notice('Los goles no cuadran con el marcador:', `${TIMELINE_SOURCE[source]} suma ${dashed(mismatch.timeline)} y ${scoreSource(group)} es ${dashed(mismatch.score)}.`)
    : '';
  return block('Goles', html`${body}${warning}`, { context: source === 'futbolaspalmas' ? 'minuto a minuto' : 'según el acta' });
}

function lineupTable(players, team, side) {
  const byDorsal = (a, b) => (a.dn ?? 999) - (b.dn ?? 999) || playerName(a.n).localeCompare(playerName(b.n), 'es');
  const starters = players.filter((p) => p.r === 'starter').sort(byDorsal);
  const subs = players.filter((p) => p.r !== 'starter').sort(byDorsal);
  const row = (p) => html`<tr><td class="pt-dorsal">${p.dn ?? ''}</td><th scope="row" class="pt-player">${playerName(p.n)}</th><td class="pt-pgoals">${p.g > 0 ? html`${p.g}<span class="vh"> ${p.g === 1 ? 'gol' : 'goles'}</span>` : ''}</td></tr>`;
  const part = (title, list) => (list.length
    ? html`<tbody><tr class="pt-lu-group"><th scope="rowgroup" colspan="3">${title}</th></tr>${list.map(row)}</tbody>`
    : '');
  return html`<table class="pt-lineup"><caption class="vh">Alineación de ${team} (${side})</caption><thead><tr><th scope="col" class="pt-dorsal"><abbr title="Dorsal">N.º</abbr></th><th scope="col" class="pt-player">Jugador</th><th scope="col" class="pt-pgoals">Goles</th></tr></thead>${part('Titulares', starters)}${part('Suplentes', subs)}</table>`;
}

const staff = (label, name) => html`<p class="pt-staff"><span class="pt-staff-label">${label}:</span> ${name ? playerName(name) : html`<span class="pt-none">no consta</span>`}</p>`;

function lineupsBlock(match, group, ctx) {
  // La Maspalomas Cup no es de la federación: nunca tiene acta.
  if (/maspalomas/.test(String(group.compKey || ''))) return '';
  const lineups = (ctx.datasets.lineups || {})[match.season];
  if (lineups == null) return block('Alineaciones', errorBox(`las actas de ${seasonLabel(match.season)}`));
  const acta = actaFor(match, lineups);
  if (!acta) return block('Alineaciones', empty('La federación no ha publicado el acta de este partido.'));
  const team = (side) => {
    const name = side === 'home' ? match.home : match.away;
    const label = side === 'home' ? 'Local' : 'Visitante';
    return html`<div class="pt-lu-team"><h3 class="pt-lu-head"><span class="pt-side">${label}</span> ${name}</h3>${lineupTable(acta[side] || [], name, label.toLowerCase())}${staff('Entrenador/a', side === 'home' ? acta.coachH : acta.coachA)}</div>`;
  };
  const link = acta.cod
    ? html`<a class="pt-acta" href="${actaUrl(acta.cod)}" target="_blank" rel="noopener noreferrer">Ver acta oficial<span class="vh"> (web de la federación, en otra pestaña)</span></a>`
    : '';
  return box(html`<div class="pt-lu-teams">${team('home')}${team('away')}</div><div class="pt-lu-foot">${staff('Árbitro/a', acta.ref)}${link}</div>`,
    { title: 'Alineaciones', context: acta.cod ? `acta nº ${acta.cod}` : null });
}

function h2hRow(group, m, { current, today, phase = null }) {
  const round = roundOf(group, m);
  const number = round && round.n != null ? `J${round.n}` : round ? round.label : m.roundKey;
  // Una fila de otra fase lleva la fase delante: «Primera Fase · J3».
  const tag = phase ? `${phase} · ${number}` : number;
  const played = matchState(m, today) === 'jugado';
  // En móvil, nombres cortos (spec §3.5); el completo lo leen los lectores de pantalla.
  const inner = html`<span class="pt-h2h-when">${m.dateISO ? `${tag}, ${shortDate(m.dateISO)}` : tag}</span><span class="pt-h2h-teams"><span class="pt-full">${m.home} ${DASH} ${m.away}</span><span class="pt-short" aria-hidden="true">${teamShort(m.home)} ${DASH} ${teamShort(m.away)}</span></span><span class="${played ? 'pt-h2h-score' : 'pt-h2h-score is-pending'}">${played ? score(m.hs, m.as) : DASH}</span>`;
  return current
    ? html`<div class="pt-h2h-row is-current" aria-current="true"><span class="vh">Este partido: </span>${inner}</div>`
    : html`<a class="pt-h2h-row" href="${matchHref(m)}">${inner}</a>`;
}

// Temporadas anteriores a la del partido que la web publica, de la más reciente a la más antigua.
export function pastSeasons(seasons, seasonName) {
  return (seasons || []).map((s) => s.name)
    .filter((name) => /^\d{4}-\d{4}$/.test(name) && name < seasonName)
    .sort()
    .reverse();
}

// Los grupos de un cara a cara (spec §4.5, «de la misma categoría»; decisión 24 de B3): los de la
// temporada en esa categoría, que son sus ligas (la primera y la segunda fase de benjamín) y sus
// copas de la federación (Copa de Campeones e insulares). Una sola regla para esta temporada y para
// las anteriores. Nunca un torneo de la Maspalomas, con otros nombres («UD Las Mesas Huracán»): vive
// en model.cups() y no en la temporada, y el filtro lo deja escrito.
const isTournament = (group) => /maspalomas/.test(String(group.compKey || ''));
const h2hGroups = (season, cat) => season.groups.filter((g) => g.cat === cat && !isTournament(g));

// Cara a cara de la temporada: los partidos entre los dos equipos, por su nombre exacto, en los
// grupos de h2hGroups (en una liga y en una copa de la federación), por fecha y con el actual
// resaltado. En un torneo, los de su grupo.
function h2hBlock(match, group, ctx) {
  const same = (g, m) => g.id === group.id && m.roundKey === match.roundKey && m.home === match.home && m.away === match.away;
  const season = isTournament(group) ? null : ctx.model.season(group.season);
  const groups = season ? h2hGroups(season, group.cat) : [group];
  const when = (m) => m.dateISO || '9999-99-99';
  const found = groups.flatMap((g) => headToHead(g, match.home, match.away).map((m) => ({ g, m })));
  const ordered = found.map((x, i) => ({ ...x, i })).sort((x, y) => (when(x.m) < when(y.m) ? -1 : when(x.m) > when(y.m) ? 1 : x.i - y.i));
  const phase = (g) => (g.id === group.id ? null : competitionKey(g, g.season).label);
  const rows = ordered.map(({ g, m }) => h2hRow(g, m, { current: same(g, m), today: ctx.today, phase: phase(g) }));
  const previous = pastSeasons(ctx.datasets.seasons, match.season).length
    ? html`<button type="button" class="pt-prev-toggle" data-action="previous" aria-expanded="false" aria-controls="${PREVIOUS_ID}">Ver temporadas anteriores</button><div id="${PREVIOUS_ID}" class="pt-prev" aria-live="polite" hidden></div>`
    : '';
  return block('Cara a cara', html`<div class="box">${join(rows)}</div>${previous}`, { context: season ? 'esta temporada' : 'en esta competición' });
}

// Candidato único de un lado, entre los equipos que juegan en el grupo (spec §4.5, «con el nombre
// normalizado igual»): si varios normalizan como `wantExact`, se prefiere el que coincide con él
// exactamente; si sigue habiendo varios, o ninguno exacto, null. Sin un candidato limpio el grupo
// es ambiguo (dos equipos con el mismo nombre normalizado, como «UD Barrial» y «Barrial Atl.») y
// mejor no enseñar nada que mezclar los partidos de otro equipo.
function resolveTeam(teams, wantExact) {
  const wantNorm = normalizeTeamName(wantExact);
  const candidates = teams.filter((t) => normalizeTeamName(t) === wantNorm);
  if (candidates.length === 1) return candidates[0];
  if (candidates.length > 1) {
    const exact = candidates.filter((t) => t === wantExact);
    if (exact.length === 1) return exact[0];
  }
  return null;
}

// Cara a cara de temporadas anteriores (spec §4.5): los grupos de h2hGroups (ligas y
// copas de la federación de la misma categoría, decisión 24 de B3) en los que ambos
// equipos, con el nombre normalizado igual (como el historial de la ficha antigua),
// se enfrentaron. Nunca de la otra categoría.
export function previousMeetings(model, names, match, cat) {
  const out = [];
  for (const name of names) {
    const season = model.season(name);
    if (!season) continue;
    for (const group of h2hGroups(season, cat)) {
      const teams = [...new Set(group.rounds.flatMap((round) => round.matches.flatMap((m) => [m.home, m.away])))];
      const home = resolveTeam(teams, match.home);
      const away = resolveTeam(teams, match.away);
      if (!home || !away || home === away) continue;
      // headToHead ya da los dos sentidos en orden cronológico (spec §4.5, «por fecha»); una sola
      // llamada con el único par resuelto, nunca la pareja invertida, así que ningún partido sale
      // dos veces. La clave es defensiva: cada partido, una sola vez, por su grupo, jornada, local
      // y visitante.
      const seen = new Set();
      const matches = headToHead(group, home, away).filter((m) => {
        const key = `${group.id}|${m.roundKey}|${m.home}|${m.away}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
      if (matches.length) out.push({ season: name, group, matches });
    }
  }
  return out;
}

// Lo que se pinta al desplegar «Ver temporadas anteriores», ya cargadas (o no) en datasets.seasonRaw.
export function previousBlock(ctx, match, group) {
  const names = pastSeasons(ctx.datasets.seasons, match.season);
  if (names.some((name) => !ctx.model.season(name))) return errorBox('las temporadas anteriores');
  const found = previousMeetings(ctx.model, names, match, group.cat);
  if (!found.length) {
    const span = names.length === 1 ? `la temporada ${seasonLabel(names[0])}` : `las temporadas ${seasonLabel(names[names.length - 1])} a ${seasonLabel(names[0])}`;
    return empty(`No encontramos partidos entre estos dos equipos en ${span}.`);
  }
  return join(found.map(({ season, group: g, matches }) => html`<h3 class="pt-prev-head">${seasonLabel(season)} · ${g.label}</h3><div class="box">${join(matches.map((m) => h2hRow(g, m, { current: false, today: ctx.today })))}</div>`));
}

function contextBlock(match, group) {
  if (group.kind === 'cup-bracket') return '';
  const item = (team) => {
    const row = (group.standings || []).find((r) => r.team === team);
    if (!row || row.pos == null) return { label: team, value: 'sin clasificación', muted: true };
    if (row.retired) return { label: team, value: 'retirado', muted: true };
    const form = lastResults(team, group).map((r) => r.letter);
    return {
      label: team,
      value: html`<span class="pt-pos">${row.pos}.º</span>${form.length ? html`<span class="vh">, últimos resultados: </span>${formChips(form)}` : ''}`,
    };
  };
  return box(html`<div class="pt-context">${cells([item(match.home), item(match.away)])}</div>`,
    { title: 'Contexto', context: 'posición y últimos cinco' });
}

// ── Pantalla ─────────────────────────────────────────────────────────────

const screenHtml = (content) => html`<section data-screen="partido">${content}</section>`;

export function render(ctx) {
  const { season, loaded, group, match } = locate(ctx);
  const listed = (ctx.datasets.seasons || []).some((s) => s.name === season);
  if (!loaded && listed && season !== ctx.portal.season) {
    return screenHtml(html`${header({ title: 'Partido', back: ctx.backHref })}${errorBox(`la temporada ${seasonLabel(season)}`)}`);
  }
  if (!match) {
    const where = group ? group.label : `la temporada ${seasonLabel(season)}`;
    return screenHtml(html`${header({ title: 'Partido', subtitle: group ? group.label : null, back: ctx.backHref })}${block('Partido no encontrado', empty(`Este partido no está en los datos de ${where}.`))}`);
  }
  const round = roundOf(group, match);
  const roundLabel = round ? round.label : match.roundKey;
  const past = season !== ctx.portal.season ? ` · ${seasonLabel(season)}` : '';
  const played = matchState(match, ctx.today) === 'jugado';
  const shields = ctx.datasets.shields || {};
  const share = {
    title: `${match.home} ${DASH} ${match.away}`,
    text: `${played ? `${match.home} ${score(match.hs, match.as)} ${match.away}` : `${match.home} ${DASH} ${match.away}`} (${roundLabel}, ${group.label}${past})`,
    path: matchHref(match),
  };
  const head = header({
    title: html`Partido<span class="vh">: ${match.home} ${DASH} ${match.away}</span>`,
    subtitle: `${roundLabel} · ${group.label}${past}`,
    back: ctx.backHref,
    share,
  });
  // Sin marcador no hay goles ni acta que enseñar.
  const main = html`${resultBlock(match, { today: ctx.today, shields })}${played ? goalsBlock(match, group, ctx) : ''}${played ? lineupsBlock(match, group, ctx) : ''}`;
  const side = html`${h2hBlock(match, group, ctx)}${contextBlock(match, group)}`;
  return screenHtml(html`${head}<div class="pt-cols"><div class="pt-main">${main}</div><div class="pt-aside">${side}</div></div>`);
}

// Cargas perezosas (spec §5.4): la cronología, las actas de la temporada del
// partido y, si es pasada, la temporada. Los cargadores devuelven null si
// fallan. La cronología y las actas son opcionales: el bloque que las necesita
// pinta la caja de error y el resto se pinta. La temporada es imprescindible:
// sin ella, la carga rechaza y el router pinta la caja de la pantalla entera.
export function partidoNeeds(params, datasets, loaders = LOADERS) {
  const seasons = datasets.seasons || [];
  const s = (params && params.s) || (seasons.find((x) => x.current) || {}).name;
  if (!s) return [];
  if (!datasets.lineups) datasets.lineups = {};
  if (!datasets.seasonRaw) datasets.seasonRaw = {};
  const loads = [
    loaders.ensureMatchDetail().then((data) => { datasets.matchDetail = data; }),
    loaders.ensureLineups(s).then((data) => { datasets.lineups[s] = data; }),
  ];
  const listed = seasons.find((x) => x.name === s);
  if (listed && !listed.current && !datasets.seasonRaw[s]) {
    loads.push(loaders.ensureSeasonData(s).then((raw) => {
      if (!raw) throw new Error(`la temporada ${seasonLabel(s)}`);
      datasets.seasonRaw[s] = raw;
    }));
  }
  return loads;
}

// Carga las temporadas anteriores y arma el contenido del panel; nunca lanza. Un fallo de la carga
// o de un dato mal formado que llegue después (por ejemplo, el RangeError de rowToMatch con una
// temporada con una fila mal formada) se convierte en la caja de error del propio panel, con su
// «Reintentar», en vez de dejar la promesa rechazada sin nadie que la atienda. Pura (no toca el
// DOM): se prueba sin navegador.
export async function previousPanelContent(ctx, match, group) {
  try {
    await loadSeasons(ctx.datasets, pastSeasons(ctx.datasets.seasons, match.season));
    return previousBlock(ctx, match, group);
  } catch (err) {
    console.error('[partido] temporadas anteriores', err);
    return errorBox('las temporadas anteriores');
  }
}

async function showPrevious(section, ctx) {
  const panel = section.querySelector(`#${PREVIOUS_ID}`);
  const { group, match } = locate(ctx);
  if (!panel || !match) return;
  // innerHTML solo recibe Html de html``, que ya escapa cada dato (spec §5.1).
  panel.setAttribute('aria-busy', 'true');
  panel.innerHTML = String(html`<p class="pt-loading">Cargando temporadas anteriores…</p>`);
  const content = await previousPanelContent(ctx, match, group);
  // Una respuesta lenta nunca pinta sobre otra pantalla.
  if (!panel.isConnected) return;
  panel.innerHTML = String(content);
  panel.removeAttribute('aria-busy');
}

function togglePrevious(section, ctx, button) {
  const panel = section.querySelector(`#${PREVIOUS_ID}`);
  if (!panel) return;
  const open = button.getAttribute('aria-expanded') === 'true';
  button.setAttribute('aria-expanded', String(!open));
  button.textContent = open ? 'Ver temporadas anteriores' : 'Ocultar temporadas anteriores';
  panel.hidden = open;
  if (!open && !panel.hasChildNodes()) showPrevious(section, ctx);
}

// Compartir (spec §4.2 A) con shareAndAnnounce (links.js): navigator.share con el enlace al
// partido y, sin share o si falla, copiarlo; se dice en la región de estado (con el enlace, si no
// se pudo). Es la respuesta de todas las pantallas que comparten.
function sharePartido(button, section) {
  const url = new URL(button.getAttribute('data-path'), window.location.href.split(/[?#]/)[0]).href;
  return shareAndAnnounce({ title: button.getAttribute('data-title'), text: button.getAttribute('data-text'), url },
    section.querySelector('.share-status'));
}

export function mount(root, ctx) {
  const section = root && root.matches && root.matches('[data-screen="partido"]') ? root : root && root.querySelector('[data-screen="partido"]');
  if (!section) return;
  // Un solo manejador en la sección, que se va con ella al repintar. Atiende Compartir, el
  // desplegable de temporadas anteriores y su «Reintentar»; «‹» y el «Reintentar» de la pantalla
  // siguen hasta el router, que escucha en el documento.
  section.addEventListener('click', (event) => {
    const target = event.target && event.target.closest ? event.target.closest('[data-action]') : null;
    if (!target || !section.contains(target)) return;
    const action = target.getAttribute('data-action');
    const inPanel = Boolean(target.closest(`#${PREVIOUS_ID}`));
    if (action !== 'share' && action !== 'previous' && !(action === 'retry' && inPanel)) return;
    event.preventDefault();
    event.stopPropagation();
    if (action === 'share') sharePartido(target, section);
    else if (action === 'previous') togglePrevious(section, ctx, target);
    else showPrevious(section, ctx);
  });
}

export const screen = {
  id: 'partido',
  needs: (params, datasets) => partidoNeeds(params, datasets),
  render,
  mount,
};
