import {
  $, el, teamBadge, S, FEATURED, isFeatured,
  featuredStandingFrom, featuredMatchesFrom, featuredScorersFrom,
  ensureLineups, ensurePlayers, normalizeForTeamsMapping,
  escapeHtml as esc} from './state.js';
import { openMatchDetail } from './modals.js';
import { renderPlantillaInto } from './plantilla.js';

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
    ? '<div class="me-link" id="meGolToggle">' + (_showAllScorers
        ? 'Ver menos' : 'Ver los ' + scorers.length + ' goleadores')
        + ' &rarr;</div>'
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
  return (cur && cur.name) || '2025-2026';
}

/* Team name used to look up the plantilla mapping. FEATURED has `name`
 * (there is no `team` property). Exported for tests. */
export function plantillaTeamName(featured) {
  return (featured && featured.name) || '';
}

function jumpToFullGroup() {
  const catBtn = document.querySelector('.cat-btn[data-cat="prebenjamin"]');
  if (catBtn && !catBtn.classList.contains('active')) catBtn.click();
  S.jorGroup = FEATURED.groupId;
  const tab = document.querySelector('.section-tab[data-section="clasif"]');
  if (tab) tab.click();
  requestAnimationFrame(() => window.scrollTo({ top: 0, behavior: 'smooth' }));
}

export function renderMiEquipo() {
  const c = $('#sec-miequipo');
  if (!c) return;
  c.innerHTML = '';

  const stand = featuredStandingFrom(typeof PREBENJAMIN !== 'undefined' ? PREBENJAMIN : null);
  if (!stand) {
    c.innerHTML = '<div class="empty-state"><div class="empty-icon">&#11088;</div>'
      + '<p>No hay datos del equipo esta temporada</p></div>';
    return;
  }
  const group = stand.group, pos = stand.pos, total = stand.total;
  const hist = typeof HISTORY !== 'undefined' && HISTORY ? HISTORY[FEATURED.groupId] : null;
  const matches = featuredMatchesFrom(hist);
  const scorers = featuredScorersFrom(typeof GOL_PREBENJ !== 'undefined' ? GOL_PREBENJ : null);

  const hero = el('div', 'me-hero');
  hero.innerHTML =
    '<div class="me-crest">' + teamBadge(FEATURED.name) + '</div>'
    + '<div class="me-id"><h2>' + esc(FEATURED.name) + '</h2>'
    + '<div class="me-meta">Prebenjamín &middot; ' + esc(group.name)
      + ' &middot; ' + esc(group.phase) + '</div></div>'
    + '<div class="me-pos"><div class="me-pos-n">' + pos + '&ordm;</div>'
    + '<div class="me-pos-l">DE ' + total + ' EQUIPOS</div></div>';
  c.appendChild(hero);

  // End-of-season state: the browser clock is read ONCE here (UI edge) and
  // injected into the pure classifier. 'finished' replaces the PRÓXIMO card
  // with a sober closing card (see below).
  const outlook = seasonOutlook(matches, localTodayISO());

  if (outlook.state === 'finished') {
    const r = stand.row; // [pos, team, pts, j, g, e, p, gf, gc, df]
    const last = matches[outlook.lastPlayedIdx];
    const lastCls = last.result === 'W' ? 'G' : last.result === 'L' ? 'P' : 'E';
    // The hero above already carries the XL final position — this card owns
    // the season balance (PTS + G/E/P + goals) and the closing result.
    const overCard = el('div', 'me-card me-over');
    overCard.innerHTML =
      '<div class="me-over-flag"><span class="me-ln"></span>'
      + '<span class="me-over-t">&#127937; Temporada finalizada</span>'
      + '<span class="me-ln"></span></div>'
      + '<div class="me-over-main">'
      + '<div class="me-over-stats">'
      + '<div class="me-over-stat"><span class="n pts">' + r[2] + '</span><span class="l">PTS</span></div>'
      + '<div class="me-over-sep"></div>'
      + '<div class="me-over-stat"><span class="n w">' + r[4] + '</span><span class="l">G</span></div>'
      + '<div class="me-over-stat"><span class="n d">' + r[5] + '</span><span class="l">E</span></div>'
      + '<div class="me-over-stat"><span class="n p">' + r[6] + '</span><span class="l">P</span></div>'
      + '<div class="me-over-sep"></div>'
      + '<div class="me-over-stat"><span class="n">' + r[7] + '</span><span class="l">GF</span></div>'
      + '<div class="me-over-stat"><span class="n">' + r[8] + '</span><span class="l">GC</span></div>'
      + '</div></div>'
      + '<div class="me-over-last">'
      + '<span class="me-over-last-l">&Uacute;ltimo partido &middot; J' + last.jorNum + '</span>'
      + '<span class="me-over-last-m">' + esc(last.home)
      + ' <b class="me-res ' + lastCls + '">' + last.hs + '-' + last.as + '</b> '
      + esc(last.away) + '</span></div>';
    c.appendChild(overCard);
  }

  const calCard = el('div', 'me-card');
  let lastPlayedIdx = -1;
  for (let i = matches.length - 1; i >= 0; i--)
    if (matches[i].played) { lastPlayedIdx = i; break; }
  const nextIdx = outlook.nextIdx;

  let calRows = '';
  matches.forEach((m, i) => {
    if (i === nextIdx) {
      const vt = venueTimeFor(m, group);
      const cd = countdownLabel(m.date);
      calRows += '<div class="me-divnow"><span class="me-ln"></span>'
        + '<span class="me-divt">PRÓXIMO</span><span class="me-ln"></span></div>';
      calRows += '<div class="me-next"><div class="me-next-top">'
        + '<span class="me-next-j">JORNADA ' + m.jorNum + '</span>'
        + (cd ? '<span class="me-next-cd">' + esc(cd) + '</span>' : '')
        + '</div><div class="me-next-opp">' + teamBadge(m.opp) + ' '
        + esc(m.opp) + ' <span class="me-next-loc">('
        + (m.isHome ? 'casa' : 'fuera') + ')</span></div>'
        + '<div class="me-next-when">&#128197; ' + fmtDate(m.date)
        + (vt.time ? ' &middot; &#128344; ' + esc(vt.time) : '')
        + (vt.venue ? ' &middot; &#128205; ' + esc(vt.venue) : '')
        + '</div></div>';
      return;
    }
    const played = m.played;
    const cls = played
      ? 'me-res ' + (m.result === 'W' ? 'G' : m.result === 'L' ? 'P' : 'E')
      : 'me-res me-next-min';
    // Temporada finalizada: un fixture vencido sin jugar no es 'pendiente'
    // ni lleva fecha — chip 'no disputado' (QA 11/6: 'dom, 06/06' partido en
    // dos líneas y contradictorio bajo la tarjeta TEMPORADA FINALIZADA).
    const notPlayedOver = !played && outlook.state === 'finished';
    const score = played ? (m.hs + '-' + m.as) : notPlayedOver ? null : fmtDate(m.date);
    const resCls = score === null ? cls + ' me-res-nd' : cls;
    const rowCls = ('me-crow' + (!played ? ' me-dim' : '')
      + (i === lastPlayedIdx ? ' me-last' : '')).trim();
    const tappable = played && hasDetail(m);
    calRows += '<div class="' + rowCls + '"'
      + (tappable ? ' data-mi="' + i + '" role="button" tabindex="0"' : '')
      + '><span class="me-jn">J' + m.jorNum + '</span>'
      + '<span class="me-hv">' + (m.isHome ? 'L' : 'V') + '</span>'
      + '<span class="me-o">' + esc(m.opp)
      + (i === lastPlayedIdx ? '<span class="me-taglast">último</span>' : '')
      + (tappable ? ' <span class="me-detail">&#9917;</span>' : '')
      + '</span><span class="' + resCls + '">'
      + (score === null ? '<span class="me-nd">no disputado</span>' : esc(score))
      + '</span></div>';
  });
  // (When the season is over the .me-over card above is the closing state —
  //  no extra filler row needed here.)
  calCard.innerHTML = '<div class="me-ct">Calendario '
    + '<span class="me-mut">' + matches.length + ' partidos</span></div>'
    + '<div class="me-cal" id="meCal">'
    + (calRows || '<div class="me-empty">Sin partidos</div>') + '</div>';
  c.appendChild(calCard);

  calCard.querySelectorAll('[data-mi]').forEach(node => {
    const open = () => {
      const m = matches[+node.dataset.mi];
      openMatchDetail({ home: m.home, away: m.away, hs: m.hs, as: m.as,
        date: fmtDate(m.date), jornada: 'Jornada ' + m.jorNum,
        groupId: FEATURED.groupId, venue: null });
    };
    node.addEventListener('click', open);
    node.addEventListener('keydown', e => { if (e.key === 'Enter') open(); });
  });

  requestAnimationFrame(() => {
    const cal = $('#meCal');
    const target = cal && cal.querySelector('.me-divnow');
    if (cal && target) cal.scrollTop = target.offsetTop - cal.offsetTop - 8;
    else if (cal) cal.scrollTop = cal.scrollHeight;
  });

  const miniCard = el('div', 'me-card');
  const st = group.standings;
  const lo = Math.max(0, pos - 1 - 3);
  const hi = Math.min(st.length, pos - 1 + 3 + 1);
  const win = st.slice(lo, hi);
  const showLeader = lo > 0;
  let bodyRows = '';
  if (showLeader) bodyRows += standingTr(st[0], true);
  // Separador cuando hay hueco entre el líder y la ventana (QA 11/6: la
  // tabla saltaba de la posición 1 a la 6 y parecía consecutiva).
  if (lo > 1) bodyRows += '<tr class="me-gaprow" aria-hidden="true">'
    + '<td colspan="5">&#8943;</td></tr>';
  win.forEach(r => { bodyRows += standingTr(r, false); });
  miniCard.innerHTML = '<div class="me-ct">Su posición en el '
    + esc(group.name) + '</div><div class="table-wrap">'
    + '<table class="standings-table me-mini"><thead><tr><th>#</th>'
    + '<th>Equipo</th><th>PTS</th><th>J</th><th>DIF</th></tr></thead>'
    + '<tbody>' + bodyRows + '</tbody></table></div>'
    + '<div class="me-link" id="meGoGroup">Ver grupo completo &rarr;</div>';
  c.appendChild(miniCard);
  $('#meGoGroup').addEventListener('click', jumpToFullGroup);

  // SP-2: Plantilla card — always the CURRENT season (see miEquipoSeason)
  const plantCard = el('div', 'me-card me-plant-card');
  const season = miEquipoSeason(typeof SEASONS !== 'undefined' ? SEASONS : null);
  plantCard.innerHTML = '<div class="me-ct">Plantilla ' + season.replace('-20', '-') + '</div>'
    + '<div id="me-plant-host" class="plant-host">'
    // CSS-only skeleton with the silhouette of the plantilla table rows
    + '<div class="skeleton-rows" aria-hidden="true">'
    + '<div class="skeleton skeleton-row"></div><div class="skeleton skeleton-row"></div>'
    + '<div class="skeleton skeleton-row"></div><div class="skeleton skeleton-row"></div>'
    + '</div></div>';
  c.appendChild(plantCard);
  Promise.all([ensurePlayers(season), ensureLineups(season)]).then(([pdata, ldata]) => {
    const host = document.getElementById('me-plant-host');
    if (!host) return;
    if (!pdata) {
      host.innerHTML = '<div class="plant-empty"><span class="plant-empty-ico">&#128203;</span> No hay datos de plantilla para esta temporada.</div>';
      return;
    }
    const teamName = plantillaTeamName(FEATURED);
    const teamId = pdata.teams[normalizeForTeamsMapping(teamName)];
    if (teamId == null) {
      host.innerHTML = '<div class="plant-empty"><span class="plant-empty-ico">&#128203;</span> No hay datos de plantilla para este equipo en esta temporada.</div>';
      return;
    }
    const rows = pdata.players[String(teamId)] || [];
    renderPlantillaInto(host, rows, {
      teamId: String(teamId),
      season,
      lineupsForExpand: ldata || undefined,
    });
  });

  const golCard = el('div', 'me-card');
  const wireToggle = () => {
    const t = golCard.querySelector('#meGolToggle');
    if (t) t.addEventListener('click', () => {
      _showAllScorers = !_showAllScorers;
      golCard.innerHTML = renderScorers(scorers);
      wireToggle();
    });
  };
  golCard.innerHTML = renderScorers(scorers);
  c.appendChild(golCard);
  wireToggle();
}
