// src/plantilla.js — SP-2: render de plantilla (tabla sobria, estilo A).
// Pure render: HTML string from {rows, opts}. No DOM access in renderPlantillaTable.

// C2: shared escape helper from state.js (no local duplicates).
import { escapeHtml as escHtml } from './state.js';

export function sortPlantillaRows(rows, key, dir) {
  key = key || 'g';
  dir = dir || 'desc';
  const mul = dir === 'desc' ? -1 : 1;
  const cmp = (a, b) => {
    const va = a[key], vb = b[key];
    if (typeof va === 'number' && typeof vb === 'number') {
      if (va !== vb) return (va - vb) * mul;
    } else {
      const sa = String(va || ''), sb = String(vb || '');
      const c = sa.localeCompare(sb, 'es');
      if (c !== 0) return c * mul;
    }
    if (a.ap !== b.ap) return b.ap - a.ap;
    return String(a.n).localeCompare(String(b.n), 'es');
  };
  return rows.slice().sort(cmp);
}

export function renderPlantillaTable(rows, opts) {
  opts = opts || {};
  const teamId = opts.teamId, season = opts.season;
  const sortKey = opts.sortKey || 'g';
  const sortDir = opts.sortDir || 'desc';
  if (!rows || rows.length === 0) {
    return '<div class="plant-empty">'
         + 'ⓘ No hay datos de plantilla para esta temporada.'
         + '<span class="plant-empty-hint">Las plantillas aparecen cuando se importan las actas FIFLP del equipo.</span>'
         + '</div>';
  }
  const sorted = sortPlantillaRows(rows, sortKey, sortDir);
  const top = sorted.reduce((t, p) => (!t || p.g > t.g) ? p : t, null);
  const cols = [
    { k: 'dorsal', l: '#' },
    { k: 'n',      l: 'Jugador' },
    { k: 'ap',     l: 'PJ' },
    { k: 'st',     l: 'TIT' },
    { k: 'g',      l: 'G' },
    { k: 'y',      l: 'A' },
    { k: 'rd',     l: 'R' },
  ];
  const head = '<thead><tr>' + cols.map(c => {
    const arrow = (c.k === sortKey) ? (sortDir === 'desc' ? ' ▾' : ' ▴') : '';
    return '<th class="plant-th" data-sort-key="' + c.k + '">' + escHtml(c.l) + arrow + '</th>';
  }).join('') + '</tr></thead>';
  const body = '<tbody>' + sorted.map(p => {
    const isTop = top && p.n === top.n && p.g > 0;
    const isSubOnly = (p.st || 0) === 0 && (p.ap || 0) > 0;
    const cls = ['plant-row'];
    if (isTop) cls.push('top-scorer');
    if (isSubOnly) cls.push('role-sub');
    const dor = p.dorsal != null ? p.dorsal : '·';
    return '<tr class="' + cls.join(' ') + '"'
      + ' data-player-name="' + escHtml(p.n) + '"'
      + ' data-team-id="' + escHtml(teamId) + '"'
      + ' data-season="' + escHtml(season) + '">'
      + '<td class="plant-dor"><span class="dor">' + escHtml(dor) + '</span></td>'
      + '<td class="plant-name">' + escHtml(p.n) + '</td>'
      + '<td class="plant-num">' + (p.ap|0) + '</td>'
      + '<td class="plant-num">' + (p.st|0) + '</td>'
      + '<td class="plant-num plant-g">' + (p.g|0) + '</td>'
      + '<td class="plant-num">' + (p.y|0) + '</td>'
      + '<td class="plant-num' + ((p.rd|0) > 0 ? ' plant-red' : '') + '">' + (p.rd|0) + '</td>'
      + '</tr>';
  }).join('') + '</tbody>';
  return '<table class="plant-table" data-team-id="' + escHtml(teamId) + '" data-season="' + escHtml(season) + '">'
       + head + body + '</table>';
}

export function aggregatePlayerFromLineups(lineups, playerName) {
  let appearances = 0, starters = 0, goals = 0, yellow = 0, red = 0;
  const matches = [];
  for (const [matchKey, m] of Object.entries(lineups || {})) {
    const inHome = (m.home || []).find(p => p.n === playerName);
    const inAway = (m.away || []).find(p => p.n === playerName);
    const app = inHome || inAway;
    if (!app) continue;
    appearances += 1;
    if (app.r === 'starter') starters += 1;
    goals  += app.g  | 0;
    yellow += app.y  | 0;
    red    += app.rd | 0;
    matches.push({ matchKey, side: inHome ? 'home' : 'away',
                   g: app.g|0, y: app.y|0, rd: app.rd|0 });
  }
  return { appearances, starters, goals, yellow, red, matches };
}

export function renderPlayerDetailHtml(playerName, agg) {
  if (!agg) return '<div class="plant-empty">Sin datos para este jugador.</div>';
  const rowsHtml = agg.matches.length === 0
    ? '<div class="player-detail-no-matches">Sin partidos registrados.</div>'
    : agg.matches.slice(0, 30).map(r => {
        const parts = String(r.matchKey).split('|');
        const home = parts[0] || '', away = parts[1] || '', score = parts[2] || '';
        const vsHtml = r.side === 'home'
          ? '<span class="pdm-vs">' + escHtml(home) + ' <i>vs</i> ' + escHtml(away) + '</span>'
          : '<span class="pdm-vs">' + escHtml(away) + ' <i>vs</i> ' + escHtml(home) + '</span>';
        return '<div class="player-detail-match">'
             + vsHtml
             + '<span class="pdm-score">' + escHtml(score) + '</span>'
             + (r.g  > 0 ? '<span class="pdm-tag tag-g">⚽' + r.g + '</span>' : '')
             + (r.y  > 0 ? '<span class="pdm-tag tag-y">🟨' + r.y + '</span>' : '')
             + (r.rd > 0 ? '<span class="pdm-tag tag-r">🟥' + r.rd + '</span>' : '')
             + '</div>';
      }).join('');
  return '<div class="player-detail">'
       + '<div class="player-detail-head">' + escHtml(playerName) + '</div>'
       + '<div class="player-detail-stats">'
       + '<span><b>' + agg.appearances + '</b> PJ</span>'
       + '<span><b>' + agg.starters + '</b> TIT</span>'
       + '<span><b>' + agg.goals + '</b> G</span>'
       + '<span><b>' + agg.yellow + '</b> A</span>'
       + '<span><b>' + agg.red + '</b> R</span>'
       + '</div>'
       + '<div class="player-detail-matches">' + rowsHtml + '</div>'
       + '<button class="player-detail-close" type="button">← Cerrar</button>'
       + '</div>';
}

export function renderPlantillaInto(container, rows, opts) {
  opts = opts || {};
  const state = { sortKey: 'g', sortDir: 'desc' };
  const memo = new Map();
  const draw = () => {
    const tableHtml = renderPlantillaTable(rows, Object.assign({}, opts, state));
    const title = opts.title ? '<div class="plant-title">' + escHtml(opts.title) + '</div>' : '';
    container.innerHTML = title + tableHtml;
    container.querySelectorAll('.plant-th').forEach(th => {
      th.addEventListener('click', (e) => {
        const k = e.currentTarget.dataset.sortKey;
        if (!k || k === 'dorsal') return;
        if (state.sortKey === k) state.sortDir = state.sortDir === 'desc' ? 'asc' : 'desc';
        else { state.sortKey = k; state.sortDir = (k === 'n') ? 'asc' : 'desc'; }
        draw();
      });
    });
    if (opts.lineupsForExpand) {
      container.querySelectorAll('.plant-row').forEach(tr => {
        tr.addEventListener('click', () => {
          const next = tr.nextElementSibling;
          if (next && next.classList && next.classList.contains('player-detail-tr')) {
            next.remove();
            tr.classList.remove('plant-row-active');
            return;
          }
          container.querySelectorAll('.player-detail-tr').forEach(n => n.remove());
          container.querySelectorAll('.plant-row-active').forEach(n => n.classList.remove('plant-row-active'));
          const name = tr.dataset.playerName;
          let agg = memo.get(name);
          if (!agg) { agg = aggregatePlayerFromLineups(opts.lineupsForExpand, name); memo.set(name, agg); }
          const detailHtml = renderPlayerDetailHtml(name, agg);
          const detailTr = document.createElement('tr');
          detailTr.className = 'player-detail-tr';
          const td = document.createElement('td');
          td.colSpan = 7;
          td.innerHTML = detailHtml;
          detailTr.appendChild(td);
          tr.parentNode.insertBefore(detailTr, tr.nextSibling);
          tr.classList.add('plant-row-active');
          const closeBtn = detailTr.querySelector('.player-detail-close');
          if (closeBtn) closeBtn.addEventListener('click', () => {
            detailTr.remove();
            tr.classList.remove('plant-row-active');
          });
        });
      });
    }
  };
  draw();
}
