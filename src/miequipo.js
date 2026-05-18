import {
  $, el, teamBadge, S, FEATURED,
  featuredStandingFrom, featuredMatchesFrom, featuredScorersFrom,
} from './state.js';
import { openMatchDetail } from './modals.js';

const G = () => globalThis;
let _showAllScorers = false;

function esc(s) {
  return String(s).replace(/[&<>"']/g, c =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function parseMatchDate(d) {
  if (!d) return null;
  let m = String(d).match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (m) return new Date(+m[1], +m[2] - 1, +m[3]);
  m = String(d).match(/^(\d{2})\/(\d{2})$/);
  if (m) {
    const now = new Date();
    let dt = new Date(now.getFullYear(), +m[2] - 1, +m[1]);
    if (dt < new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1))
      dt = new Date(now.getFullYear() + 1, +m[2] - 1, +m[1]);
    return dt;
  }
  return null;
}

function fmtDate(d) {
  const dt = parseMatchDate(d);
  if (!dt) return esc(d || '');
  return dt.toLocaleDateString('es-ES',
    { weekday: 'short', day: '2-digit', month: '2-digit' });
}

function countdownLabel(d) {
  const dt = parseMatchDate(d);
  if (!dt) return '';
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
  const MD = G().MATCH_DETAIL;
  if (!MD || !m.played) return false;
  const d = MD[m.home + '|' + m.away + '|' + m.hs + '-' + m.as];
  return !!(d && d.g && d.g.length);
}

function standingTr(r, isLeader) {
  const df = r[9];
  const dfCls = df > 0 ? 'df-pos' : df < 0 ? 'df-neg' : '';
  const dfStr = df > 0 ? '+' + df : df;
  const featured = r[1] === FEATURED.name;
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

function renderScorers(scorers) {
  if (!scorers.length)
    return '<div class="me-ct">Goleadores del equipo</div>'
      + '<div class="me-empty">Sin goleadores registrados</div>';
  const list = _showAllScorers ? scorers : scorers.slice(0, 5);
  let rows = '';
  list.forEach((p, i) => {
    rows += '<div class="me-scrow">'
      + '<span class="me-scrk">' + (i + 1) + '</span>'
      + '<span class="me-scnm">' + esc(p.name)
        + (i === 0 ? ' &#128081;' : '') + '</span>'
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

  const stand = featuredStandingFrom(G().PREBENJAMIN);
  if (!stand) {
    c.innerHTML = '<div class="empty-state"><div class="empty-icon">&#11088;</div>'
      + '<p>No hay datos del equipo esta temporada</p></div>';
    return;
  }
  const group = stand.group, pos = stand.pos, total = stand.total;
  const HISTORY = G().HISTORY;
  const matches = featuredMatchesFrom(HISTORY ? HISTORY[FEATURED.groupId] : null);
  const scorers = featuredScorersFrom(G().GOL_PREBENJ);

  const hero = el('div', 'me-hero');
  hero.innerHTML =
    '<div class="me-crest">' + teamBadge(FEATURED.name) + '</div>'
    + '<div class="me-id"><h2>' + esc(FEATURED.name) + '</h2>'
    + '<div class="me-meta">Prebenjamín &middot; ' + esc(group.name)
      + ' &middot; ' + esc(group.phase) + '</div></div>'
    + '<div class="me-pos"><div class="me-pos-n">' + pos + '&ordm;</div>'
    + '<div class="me-pos-l">DE ' + total + ' EQUIPOS</div></div>';
  c.appendChild(hero);

  const calCard = el('div', 'me-card');
  let lastPlayedIdx = -1;
  for (let i = matches.length - 1; i >= 0; i--)
    if (matches[i].played) { lastPlayedIdx = i; break; }
  const nextIdx = matches.findIndex(m => !m.played);

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
    const score = played ? (m.hs + '-' + m.as) : fmtDate(m.date);
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
      + '</span><span class="' + cls + '">' + esc(score) + '</span></div>';
  });
  if (nextIdx === -1 && matches.length)
    calRows += '<div class="me-crow me-dim"><span class="me-jn">&mdash;</span>'
      + '<span class="me-hv">&middot;</span>'
      + '<span class="me-o">Temporada finalizada</span>'
      + '<span class="me-res">&mdash;</span></div>';
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
  win.forEach(r => { bodyRows += standingTr(r, false); });
  miniCard.innerHTML = '<div class="me-ct">Su posición en el '
    + esc(group.name) + '</div><div class="table-wrap">'
    + '<table class="standings-table me-mini"><thead><tr><th>#</th>'
    + '<th>Equipo</th><th>PTS</th><th>J</th><th>DIF</th></tr></thead>'
    + '<tbody>' + bodyRows + '</tbody></table></div>'
    + '<div class="me-link" id="meGoGroup">Ver grupo completo &rarr;</div>';
  c.appendChild(miniCard);
  $('#meGoGroup').addEventListener('click', jumpToFullGroup);

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
