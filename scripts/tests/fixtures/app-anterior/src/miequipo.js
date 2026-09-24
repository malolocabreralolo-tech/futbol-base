import {
  $, el, teamBadge, S, FEATURED, isFeatured,
  featuredStandingFrom, featuredMatchesFrom, featuredScorersFrom,
  ensureLineups, ensurePlayers, normalizeForTeamsMapping, jornadaLabel,
  escapeHtml as esc} from './state.js';
import { openMatchDetail, openTeamDetail } from './modals.js';
import { renderPlantillaInto } from './plantilla.js';
import { PORTAL } from './config.js';
import { currentGroups, renderFavoriteBar, openTeamPicker, favoriteKey } from './favorites.js';
import { routeUrl, copyLink, downloadCalendar, venueUrl, fixtureISO, displayDate } from './links.js';
import { sourceInfo, refreshHealthLabels, openDataInfo } from './health.js';

// data-*.js use top-level `const` (classic scripts) -> global LEXICAL bindings,
// NOT properties of the global object. Read them as bare identifiers, typeof-guarded,
// exactly like src/render.js & src/modals.js do.
// (C2: `esc` is the shared escapeHtml from state.js, aliased above.)
let _showAllScorers = false;

/* Today's LOCAL date as YYYY-MM-DD. This is the ONLY place renderMiEquipo
 * touches the browser clock — the date is then injected into the pure
 * helpers below so they stay testable with a fixed day. Exported for
 * render.js (groupFinished), same UI-edge rule applies there. */
export function localTodayISO() {
  const n = new Date();
  return n.getFullYear() + '-' + String(n.getMonth() + 1).padStart(2, '0')
    + '-' + String(n.getDate()).padStart(2, '0');
}

/* Pure: resolve a fixture date ('YYYY-MM-DD' or 'DD/MM') to ISO, relative to
 * the injected todayISO. DD/MM rollover rule: season fixtures never sit more
 * than ~6 months in the past, so only a date >180 days behind today rolls to
 * NEXT year (Dec→Jan mid-season crossing). A fixture 5 days ago is an EXPIRED
 * fixture — never next June's (the 06/06 PRÓXIMO bug). Exported for tests. */
export function matchDateISO(d, todayISO) {
  if (!d) return null;
  const s = String(d);
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const m = s.match(/^(\d{2})\/(\d{2})$/);
  if (!m || !todayISO) return null;
  const t = String(todayISO);
  const ty = +t.slice(0, 4);
  const diffDays = (Date.UTC(ty, +t.slice(5, 7) - 1, +t.slice(8, 10))
    - Date.UTC(ty, +m[2] - 1, +m[1])) / 86400000;
  // >180 días en el pasado → cruce dic→ene hacia el año siguiente; la regla
  // simétrica (>180 días en el futuro → año anterior) cubre el caso inverso:
  // un 20/12 aplazado visto en enero es del diciembre pasado, no del próximo.
  const y = diffDays > 180 ? ty + 1 : diffDays < -180 ? ty - 1 : ty;
  return y + '-' + m[2] + '-' + m[1];
}

/* Pure end-of-season classifier for the featured team's calendar.
 * `matches` is the featuredMatchesFrom() shape; todayISO is injected by the
 * caller (see localTodayISO — never read the clock in here).
 * Returns { state, nextIdx, lastPlayedIdx }:
 *   'upcoming' — there is a real future (or undated) unplayed match; nextIdx
 *                points at it. Expired unplayed fixtures are skipped.
 *   'finished' — nothing left to play but the season had matches;
 *                lastPlayedIdx is the final result's index.
 *   'empty'    — nothing played and nothing upcoming. */
export function seasonOutlook(matches, todayISO) {
  const list = Array.isArray(matches) ? matches : [];
  for (let i = 0; i < list.length; i++) {
    const m = list[i];
    if (m.played) continue;
    const iso = matchDateISO(m.date, todayISO);
    if (iso === null || iso >= todayISO)
      return { state: 'upcoming', nextIdx: i, lastPlayedIdx: -1 };
  }
  for (let i = list.length - 1; i >= 0; i--)
    if (list[i].played)
      return { state: 'finished', nextIdx: -1, lastPlayedIdx: i };
  return { state: 'empty', nextIdx: -1, lastPlayedIdx: -1 };
}

function fmtDate(d) {
  // Resuelve el año con matchDateISO (parseMatchDate hacía rollover al año
  // siguiente para fechas vencidas → día de semana incorrecto, QA 11/6:
  // 'dom, 06/06' para un sábado).
  const iso = matchDateISO(d, localTodayISO());
  if (!iso) return esc(d || '');
  const dt = new Date(iso + 'T12:00:00');
  return dt.toLocaleDateString('es-ES',
    { weekday: 'short', day: '2-digit', month: '2-digit' });
}

function countdownLabel(d) {
  const iso = matchDateISO(d, localTodayISO());
  if (!iso) return '';
  const dt = new Date(iso + 'T00:00:00');
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const days = Math.round((dt - today) / 86400000);
  if (days < 0) return '';
  if (days === 0) return 'HOY';
  if (days === 1) return 'MAÑANA';
  return 'EN ' + days + ' DÍAS';
}

function venueTimeFor(next, group) {
  if (!next || !group || !Array.isArray(group.matches))
    return { time: '', venue: '' };
  const row = group.matches.find(r => r[2] === next.home && r[3] === next.away);
  return row ? { time: row[1] || '', venue: row[6] || '' }
             : { time: '', venue: '' };
}

function hasDetail(m) {
  if (!m.played) return false;
  return typeof MATCH_DETAIL_KEYS !== 'undefined'
    && !!MATCH_DETAIL_KEYS[m.home + '|' + m.away + '|' + m.hs + '-' + m.as];
}

function standingTr(r, isLeader) {
  const df = r[9];
  const dfCls = df > 0 ? 'df-pos' : df < 0 ? 'df-neg' : '';
  const dfStr = df > 0 ? '+' + df : df;
  const featured = isFeatured(r[1]);
  const trCls = ((r[0] <= 3 ? 'pos-' + r[0] + ' ' : '')
    + (featured ? 'featured-team ' : '')
    + (isLeader ? 'me-leadrow' : '')).trim();
  return '<tr class="' + trCls + '">'
    + '<td>' + r[0] + '</td>'
    + '<td>' + teamBadge(r[1]) + ' ' + esc(r[1]) + '</td>'
    + '<td class="pts-col">' + r[2] + '</td>'
    + '<td>' + r[3] + '</td>'
    + '<td class="' + dfCls + '">' + dfStr + '</td>'
    + '</tr>';
}

/* Pure: width % for a scorer's goal bar, proportional to the section max.
 * Rounded to integer and clamped to [0,100]; a positive share floors at 3 so
 * a 1-goal bar stays a visible sliver. max<=0 (empty section) or goals<=0 or
 * non-finite input → 0, never a division by zero. Shared with render.js
 * (goleadores podium/table). TDD in test_uxui2_fixes.mjs. */
export function goalBarPct(goals, max) {
  const g = Number(goals), m = Number(max);
  if (!Number.isFinite(g) || !Number.isFinite(m) || g <= 0 || m <= 0) return 0;
  return Math.max(3, Math.round(Math.min(g / m, 1) * 100));
}

function renderScorers(scorers) {
  if (!scorers.length)
    return '<div class="me-ct">Goleadores del equipo</div>'
      + '<div class="me-empty">Sin goleadores registrados</div>';
  const list = _showAllScorers ? scorers : scorers.slice(0, 5);
  const maxGoals = scorers.reduce((mx, p) => Math.max(mx, p.goals || 0), 0);
  let rows = '';
  list.forEach((p, i) => {
    rows += '<div class="me-scrow">'
      + '<span class="me-scrk">' + (i + 1) + '</span>'
      + '<span class="me-scnm"><span class="me-scnm-t">' + esc(p.name)
        + (i === 0 ? ' &#128081;' : '') + '</span>'
        + '<span class="gol-bar-track"><span class="gol-bar" style="width:'
        + goalBarPct(p.goals, maxGoals) + '%"></span></span></span>'
      + '<span class="me-scg">' + p.goals + '</span>'
      + '<span class="me-scpj">' + p.games + ' PJ</span>'
      + '</div>';
  });
  const more = scorers.length > 5
    ? '<button class="me-link" id="meGolToggle" type="button">' + (_showAllScorers
        ? 'Ver menos' : 'Ver los ' + scorers.length + ' goleadores')
        + ' &rarr;</button>'
    : '';
  return '<div class="me-ct">Goleadores del equipo '
    + '<span class="me-mut">' + scorers.length + ' jugadores</span></div>'
    + rows + more;
}

/* MI EQUIPO is pinned to the CURRENT season: its standings/calendar/scorers
 * read the current-season globals (PREBENJAMIN/HISTORY/GOL_PREBENJ), so the
 * Plantilla card must use the current season too — NOT the season selected
 * in the jornadas selector (S.season). Exported for tests. */
export function miEquipoSeason(seasons) {
  const cur = Array.isArray(seasons) ? seasons.find(s => s && s.current) : null;
  return (cur && cur.name) || PORTAL.season;
}

/* Team name used to look up the plantilla mapping. FEATURED has `name`
 * (there is no `team` property). Exported for tests. */
export function plantillaTeamName(featured) {
  return (featured && featured.name) || '';
}


let _showFullCalendar = false;
let _calendarTeam = '';

function jumpToFullGroup() {
  const catBtn = document.querySelector('.cat-btn[data-cat="' + FEATURED.cat + '"]');
  if (catBtn && !catBtn.classList.contains('active')) catBtn.click();
  S.jorGroup = FEATURED.groupId;
  S.search = FEATURED.name;
  S.filterIsland = '';
  S.filterPhase = '';
  document.querySelector('.section-tab[data-section="clasif"]')?.click();
}

export function renderMiEquipo() {
  const c = $('#sec-miequipo');
  if (!c) return;
  c.innerHTML = '';
  const season = miEquipoSeason(typeof SEASONS !== 'undefined' ? SEASONS : null);
  const selectedKey = favoriteKey(FEATURED);
  if (_calendarTeam !== selectedKey) { _showFullCalendar = false; _showAllScorers = false; _calendarTeam = selectedKey; }
  const intro = el('div', 'page-intro');
  intro.innerHTML = '<div><span class="eyebrow">FÚTBOL BASE · LAS PALMAS</span><h2>Tu equipo. Cada jornada.</h2><p>Los partidos, los resultados y la ilusión de los nuestros.</p></div>'
    + '<span class="season-chip">' + esc(season.replace('-', '/')) + '</span>';
  c.appendChild(intro);
  renderFavoriteBar(c);

  const stand = featuredStandingFrom(currentGroups(FEATURED.cat));
  if (!stand) {
    const empty = el('div', 'me-card empty-state');
    empty.innerHTML = '<div class="empty-icon">⚽</div><h3>Elige el grupo de tu equipo</h3><p>El grupo guardado de ' + esc(FEATURED.name) + ' no figura en esta temporada.</p><button class="btn btn-primary">Buscar equipo</button>';
    empty.querySelector('button').addEventListener('click', openTeamPicker);
    c.appendChild(empty); return;
  }
  const { group, pos, total, row } = stand;
  const source = typeof HISTORY !== 'undefined' ? HISTORY[FEATURED.groupId] : null;
  const matches = featuredMatchesFrom(source || group.jornadas);
  const golData = FEATURED.cat === 'benjamin'
    ? (typeof GOL_BENJ !== 'undefined' ? GOL_BENJ : null)
    : (typeof GOL_PREBENJ !== 'undefined' ? GOL_PREBENJ : null);
  const scorers = featuredScorersFrom(golData);
  const today = localTodayISO();
  // Resolve DD/MM against the published season, including when reopening an archive.
  const dated = matches.map(match => ({ ...match, date: fixtureISO(match.date, season) || match.date }));
  const outlook = seasonOutlook(dated, today);
  const completed = dated.filter(match => match.played).sort((a, b) => String(a.date).localeCompare(String(b.date)) || a.jorNum - b.jorNum);
  const upcoming = dated.filter(match => !match.played && (!fixtureISO(match.date, season) || match.date >= today))
    .sort((a, b) => String(a.date).localeCompare(String(b.date)) || a.jorNum - b.jorNum);
  const next = upcoming[0];
  const last = completed.at(-1);
  const form = completed.slice(-5);
  const link = routeUrl({ section: 'miequipo', season, cat: FEATURED.cat, group: FEATURED.groupId, team: FEATURED.name, round: '', q: '' });
  const catLabel = FEATURED.cat === 'benjamin' ? 'Benjamín' : 'Prebenjamín';
  const hero = el('div', 'me-hero');
  hero.innerHTML = '<div class="me-crest">' + teamBadge(FEATURED.name) + '</div>'
    + '<div class="me-id"><span class="eyebrow">TU EQUIPO</span><h2>' + esc(FEATURED.name) + '</h2><div class="me-meta">' + catLabel + ' · ' + esc(group.phase) + ' · ' + esc(group.name) + '</div>'
    + '<button class="text-button" id="meTeamProfile">Ver ficha del equipo ↗</button></div>'
    + '<div class="hero-summary"><div class="me-pos"><span class="me-pos-n">' + pos + '<small>º</small></span><span class="me-pos-l">de ' + total + ' equipos</span></div>'
    + '<div class="hero-points"><strong>' + row[2] + '</strong><span>puntos</span></div>'
    + '<div class="hero-form"><span>Últimos 5 resultados</span><div class="form-strip">' + form.map(match => '<span class="form-dot ' + match.result + '" title="' + esc(displayDate(match.date, season) + ' · ' + match.opp) + '">' + ({ W: 'G', D: 'E', L: 'P' }[match.result]) + '</span>').join('') + '</div></div></div>';
  hero.querySelector('#meTeamProfile').addEventListener('click', () => openTeamDetail(FEATURED.name, FEATURED.groupId));
  c.appendChild(hero);

  const focusMatch = next || last;
  const focus = el('div', 'me-card me-match-focus' + (next ? ' me-next' : ' me-over'));
  const ended = outlook.state === 'finished' && today > season.split('-')[1] + '-07-01';
  focus.innerHTML = '<div class="card-heading"><div><span class="eyebrow">' + (next ? 'PRÓXIMO ENCUENTRO' : 'ÚLTIMO RESULTADO REGISTRADO') + '</span><h3>' + (next ? 'Ya queda menos.' : 'Así fue la última jornada.') + '</h3></div>'
    + '<span class="status-pill">' + (next ? esc(jornadaLabel(next.jor)) : ended ? 'Temporada finalizada' : 'Sin próximos partidos publicados') + '</span></div>';
  if (focusMatch) {
    const vt = venueTimeFor(focusMatch, group);
    const venue = focusMatch.venue || vt.venue;
    const time = focusMatch.time || vt.time;
    const score = focusMatch.played ? '<strong>' + focusMatch.hs + '</strong><span>–</span><strong>' + focusMatch.as + '</strong>'
      : '<strong>' + (time ? esc(time) : 'VS') + '</strong>';
    focus.innerHTML += '<div class="focus-fixture"><div class="focus-team">' + teamBadge(focusMatch.home) + '<strong>' + esc(focusMatch.home) + '</strong><span>Local</span></div><div class="focus-score' + (!focusMatch.played ? ' pending-score' : '') + '">' + score + '</div><div class="focus-team">' + teamBadge(focusMatch.away) + '<strong>' + esc(focusMatch.away) + '</strong><span>Visitante</span></div></div>'
      + '<div class="fixture-info"><span>◷ ' + esc(displayDate(focusMatch.date, season)) + (time ? ' · ' + esc(time) + ' h' : ' · horario no disponible') + '</span><span>⌖ ' + esc(venue || 'Campo no publicado') + '</span></div>'
      + '<div class="fixture-actions"><button class="btn btn-primary" id="meMatchDetail">Ver partido ↗</button>'
      + (venue ? '<a class="btn btn-secondary" href="' + esc(venueUrl(venue, group.island)) + '" target="_blank" rel="noopener noreferrer">Cómo llegar ↗</a>' : '')
      + '<button class="btn btn-secondary" id="meShare">Compartir equipo</button><a class="btn btn-quiet" href="https://wa.me/?text=' + encodeURIComponent(FEATURED.name + '\n' + link) + '" target="_blank" rel="noopener noreferrer">WhatsApp ↗</a></div>';
    focus.querySelector('#meMatchDetail').addEventListener('click', () => openMatchDetail({ ...focusMatch, date: displayDate(focusMatch.date, season), jornada: focusMatch.jor, groupId: FEATURED.groupId, venue }));
    focus.querySelector('#meShare').addEventListener('click', () => copyLink(link));
  } else {
    focus.innerHTML += '<p class="me-empty">Todavía no hay encuentros publicados para este grupo. Tu favorito queda guardado.</p>';
  }
  c.appendChild(focus);

  const side = el('div', 'me-side');
  c.appendChild(side);
  const mini = el('div', 'me-card me-mini');
  const low = Math.max(0, pos - 3), high = Math.min(total, pos + 2);
  const body = (low > 0 ? standingTr(group.standings[0], true) : '')
    + (low > 1 ? '<tr class="me-gaprow" aria-hidden="true"><td colspan="5">···</td></tr>' : '')
    + group.standings.slice(low, high).map(r => standingTr(r, false)).join('');
  mini.innerHTML = '<div class="card-heading"><div><span class="eyebrow">EN LA CLASIFICACIÓN</span><h3>' + esc(group.name) + '</h3></div><span class="muted">' + catLabel + '</span></div>'
    + '<div class="table-wrap"><table class="standings-table me-mini"><caption class="sr-only">Posición de ' + esc(FEATURED.name) + ' y equipos cercanos</caption><thead><tr><th scope="col">#</th><th scope="col">Equipo</th><th scope="col">PTS</th><th scope="col">J</th><th scope="col">DIF</th></tr></thead><tbody>' + body + '</tbody></table></div>'
    + '<button class="me-link" id="meGoGroup">Ver grupo completo →</button>' + sourceInfo(group);
  mini.querySelector('#meGoGroup').addEventListener('click', jumpToFullGroup);
  side.appendChild(mini);

  const calCard = el('div', 'me-card me-cal-card');
  c.appendChild(calCard);
  const recordedResults = completed.length;
  const standingPlayed = Number(row[3]);
  function paintCalendar() {
    const all = [...dated].sort((a, b) => String(b.date).localeCompare(String(a.date)) || b.jorNum - a.jorNum);
    const visible = _showFullCalendar ? all : all.filter(match => match.played || (fixtureISO(match.date, season) && match.date < today)).slice(0, 5);
    const rows = visible.map((match, i) => {
      const missing = !match.played && fixtureISO(match.date, season) && match.date < today;
      const status = match.status === 'postponed' ? 'aplazado' : match.status === 'not_played' ? 'no disputado' : missing ? 'sin resultado' : match.time || 'por confirmar';
      const result = match.played ? (match.isHome ? match.hs + '–' + match.as : match.as + '–' + match.hs) : '<span class="me-nd">' + esc(status) + '</span>';
      return '<button class="me-crow ' + (match.played ? 'me-r-' + ({ W: 'G', D: 'E', L: 'P' }[match.result]) : 'me-dim') + '" data-mi="' + i + '"><span class="calendar-date"><strong>' + esc(displayDate(match.date, season, { weekday: undefined, month: 'short' })) + '</strong><small>' + esc(jornadaLabel(match.jor)) + ' · ' + (match.isHome ? 'Casa' : 'Fuera') + '</small></span>'
        + teamBadge(match.opp) + '<span class="me-o">' + esc(match.opp) + '</span><span class="me-res ' + (match.played ? ({ W: 'G', D: 'E', L: 'P' }[match.result]) : 'me-res-nd') + '">' + result + '</span><span class="row-arrow" aria-hidden="true">↗</span></button>';
    }).join('');
    calCard.innerHTML = '<div class="card-heading"><div><span class="eyebrow">PARTIDO A PARTIDO</span><h3>' + (_showFullCalendar ? 'Calendario completo' : 'Últimos encuentros') + '</h3></div><span class="me-mut">' + dated.length + ' registrados</span></div>'
      + (standingPlayed > recordedResults ? '<p class="me-coverage">El calendario recoge ' + recordedResults + ' resultado' + (recordedResults === 1 ? '' : 's') + '; la clasificación contabiliza ' + standingPlayed + ' partidos jugados.</p>' : '')
      + '<div class="me-cal" id="meCal">' + (rows || '<p class="me-empty">Sin partidos anteriores. Consulta el próximo encuentro arriba.</p>') + '</div>'
      + '<div class="calendar-actions"><button class="me-link" id="meCalendarToggle" aria-expanded="' + _showFullCalendar + '" aria-controls="meCal">' + (_showFullCalendar ? 'Mostrar solo los últimos 5 ↑' : 'Ver calendario completo (' + dated.length + ') ↓') + '</button>'
      + '<button class="btn btn-quiet" id="meDownload" ' + (!dated.some(match => fixtureISO(match.date, season)) ? 'disabled' : '') + '>↓ Calendario .ics</button></div>';
    calCard.querySelector('#meCalendarToggle').addEventListener('click', () => { _showFullCalendar = !_showFullCalendar; paintCalendar(); calCard.querySelector('#meCalendarToggle').focus({ preventScroll: true }); });
    calCard.querySelector('#meDownload').addEventListener('click', () => downloadCalendar(dated, { name: FEATURED.name, season, group: FEATURED.groupId, url: link }));
    calCard.querySelectorAll('[data-mi]').forEach(button => button.addEventListener('click', () => {
      const match = visible[+button.dataset.mi];
      openMatchDetail({ ...match, date: displayDate(match.date, season), jornada: match.jor, groupId: FEATURED.groupId, venue: match.venue || null });
    }));
  }
  paintCalendar();

  const golCard = el('div', 'me-card me-gol');
  const paintScorers = () => {
    golCard.innerHTML = renderScorers(scorers);
    golCard.querySelector('#meGolToggle')?.addEventListener('click', () => { _showAllScorers = !_showAllScorers; paintScorers(); golCard.querySelector('#meGolToggle')?.focus(); });
  };
  paintScorers(); side.appendChild(golCard);

  const plantCard = el('div', 'me-card me-plant-card');
  plantCard.innerHTML = '<div class="me-ct">Plantilla</div><div class="plant-host"><div class="skeleton-rows" aria-hidden="true"><div class="skeleton skeleton-row"></div><div class="skeleton skeleton-row"></div></div></div>';
  side.appendChild(plantCard);
  Promise.all([ensurePlayers(season), ensureLineups(season)]).then(([pdata, ldata]) => {
    if (!plantCard.isConnected) return;
    const teamId = pdata?.teams[normalizeForTeamsMapping(plantillaTeamName(FEATURED))];
    const rows = teamId == null ? [] : pdata.players[String(teamId)] || [];
    if (!rows.length) { plantCard.remove(); return; }
    renderPlantillaInto(plantCard.querySelector('.plant-host'), rows, { teamId: String(teamId), season, teamName: FEATURED.name, lineupsForExpand: ldata || undefined });
  });

  const notice = el('div', 'season-note');
  notice.innerHTML = '<div><span class="eyebrow">LA SIGUIENTE TEMPORADA</span><strong>' + esc(PORTAL.nextSeason.replace('-', '/')) + ' · Grupos pendientes de verificación</strong><p>Tu equipo sigue guardado. Incorporaremos los nuevos calendarios cuando la fuente confirme sus grupos y fechas.</p></div><button class="btn btn-secondary">Datos y fuentes ↗</button>';
  notice.querySelector('button').addEventListener('click', openDataInfo);
  c.appendChild(notice);
  refreshHealthLabels();
}
