// src/matchdetail-rich.js — SP-2: alineaciones + cronología unificada.
const ICONS = { goal: '⚽', yellow: '🟨', red: '🟥',
                sub: '🔄', sub_in: '↑', sub_out: '↓' };
const GOAL_LABEL = { penalty: ' (penalti)', own: ' (en propia)' };

function esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g,
    c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]));
}

function renderSidePlayers(players, side) {
  const starters = players.filter(p => p.r === 'starter');
  const subs     = players.filter(p => p.r === 'sub');
  const row = p => '<div class="match-line-row' + (p.r === 'sub' ? ' is-sub' : '') + '">'
      + '<span class="match-line-dor">' + esc(p.dn != null ? p.dn : '·') + '</span>'
      + '<span class="match-line-name">' + esc(p.n) + '</span></div>';
  return '<div class="match-line-side match-line-' + side + '">'
       + '<div class="match-line-title">' + esc(side.toUpperCase()) + '</div>'
       + starters.map(row).join('')
       + (subs.length ? '<div class="match-sub-divider">Suplentes</div>' : '')
       + subs.map(row).join('') + '</div>';
}

export function renderLineupsHtml(match) {
  if (!match) return '<div class="match-line-empty"></div>';
  const home = Array.isArray(match.home) ? match.home : [];
  const away = Array.isArray(match.away) ? match.away : [];
  if (home.length === 0 && away.length === 0) {
    return '<div class="match-line-empty">No hay alineaciones disponibles para este partido.</div>';
  }
  const coachH = match.coachH ? '<div class="match-line-coach">Entrenador: ' + esc(match.coachH) + '</div>' : '';
  const coachA = match.coachA ? '<div class="match-line-coach">Entrenador: ' + esc(match.coachA) + '</div>' : '';
  return '<div class="match-lineups"><div class="match-lineups-grid">'
       + renderSidePlayers(home, 'home') + coachH
       + renderSidePlayers(away, 'away') + coachA
       + '</div></div>';
}

export function mergeAndOrderEvents(events) {
  const arr = (events || []).slice();
  arr.sort((a, b) => {
    const ma = (a.m == null) ? 1e9 : a.m;
    const mb = (b.m == null) ? 1e9 : b.m;
    return ma - mb;
  });
  return arr;
}

export function renderTimelineHtml(events) {
  const ord = mergeAndOrderEvents(events);
  if (ord.length === 0) return '<div class="match-timeline timeline-empty">No hay eventos registrados.</div>';
  const rows = ord.map(ev => {
    const icon = ICONS[ev.t] || '·';
    const min = (ev.m == null) ? '–\'' : (ev.m + '\'');
    const sideCls = ev.s === 'h' ? 'is-home' : 'is-away';
    let body;
    if (ev.t === 'sub') {
      body = '<span class="ev-sub">' + ICONS.sub_in + ' ' + esc(ev.n2 || '')
           + ' <span class="ev-sub-sep">/</span> ' + ICONS.sub_out + ' ' + esc(ev.n || '') + '</span>';
    } else if (ev.t === 'goal') {
      body = '<span class="ev-player">' + esc(ev.n) + '</span>' + esc(GOAL_LABEL[ev.gt] || '');
    } else {
      body = '<span class="ev-player">' + esc(ev.n) + '</span>';
    }
    return '<div class="match-tl-row ' + sideCls + '">'
         + '<span class="match-tl-min">' + esc(min) + '</span>'
         + '<span class="match-tl-icon">' + esc(icon) + '</span>'
         + body + '</div>';
  }).join('');
  return '<div class="match-timeline">' + rows + '</div>';
}

export function renderLineupsAndTimeline(container, match) {
  if (!container) return;
  if (!match) {
    container.innerHTML = '<div class="match-line-empty">Alineaciones y cronología no disponibles para este partido.</div>';
    return;
  }
  const refHtml = match.ref ? '<div class="match-referee">Árbitro: ' + esc(match.ref) + '</div>' : '';
  container.innerHTML = renderLineupsHtml(match)
       + '<div class="match-section-title">Cronología</div>'
       + renderTimelineHtml(match.events)
       + refHtml;
}
