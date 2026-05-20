// src/plantilla.js — SP-2: render de plantilla (tabla sobria, estilo A).
// Pure render: HTML string from {rows, opts}. No DOM access in renderPlantillaTable.

function escHtml(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g,
    c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

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

export function renderPlantillaInto(container, rows, opts) {
  opts = opts || {};
  const state = { sortKey: 'g', sortDir: 'desc' };
  const draw = () => {
    const tableHtml = renderPlantillaTable(rows, Object.assign({}, opts, state));
    const title = opts.title ? '<div class="plant-title">' + escHtml(opts.title) + '</div>' : '';
    // container.innerHTML mounts the rendered HTML string into the DOM element
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
  };
  draw();
}
