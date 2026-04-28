/* ====== APP STATE ====== */
const S = {
  cat: 'benjamin',      // 'benjamin' | 'prebenjamin'
  section: 'clasif',    // 'clasif' | 'jornadas' | 'goleadores' | 'isla'
  season: '',           // '' = current season, or '2024-2025' etc.
  search: '',  // unused, kept for compat
  // jornadas
  jorGroup: 'A2',
  jorNum: '',
  // goleadores
  golGroup: '__GLOBAL__',
  // isla
  island: 'grancanaria'
};

/* ====== HELPERS ====== */
export function $(sel, ctx) { return (ctx||document).querySelector(sel); }
export function $$(sel, ctx) { return Array.from((ctx||document).querySelectorAll(sel)); }
export function el(tag, cls, html) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (html !== undefined) e.innerHTML = html;
  return e;
}

/* Team badge — real shield from SHIELDS or fallback to initials */
function teamBadgeFallback(name) {
  const words = name.replace(/[^a-zA-ZáéíóúñÁÉÍÓÚÑüÜ\s]/g, '').trim().split(/\s+/);
  let initials;
  if (words.length === 1) initials = words[0].substring(0, 2).toUpperCase();
  else initials = words.slice(0, 3).map(w => w[0]).join('').toUpperCase();
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
  const hue = Math.abs(hash) % 360;
  return `<span class="team-badge" style="background:hsl(${hue},55%,45%)">${initials}</span>`;
}

export function normalizeTeamName(s) {
  return s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/['".,''""]]/g, '').replace(/\b(CF|UD|CD|AD|SD|AFC|SC|CP|CE|CEF|SSD|ATLETICO|ATL)\b/gi, '').toLowerCase().trim().replace(/\s+/g, ' ');
}

let _shieldsNorm = null;
function getShieldsNorm() {
  if (_shieldsNorm) return _shieldsNorm;
  if (typeof SHIELDS === 'undefined') return (_shieldsNorm = {});
  _shieldsNorm = {};
  Object.keys(SHIELDS).forEach(k => {
    const norm = normalizeTeamName(k);
    if (norm && !_shieldsNorm[norm]) _shieldsNorm[norm] = SHIELDS[k];
  });
  return _shieldsNorm;
}

export function teamBadge(name) {
  if (typeof SHIELDS !== 'undefined') {
    // 1. Exact match
    if (SHIELDS[name]) {
      return '<img class="team-badge" src="./escudos/' + SHIELDS[name] + '" alt="' + name + '" onerror="this.outerHTML=teamBadgeFallback(this.alt)">';
    }
    // 2. Normalized match (strip diacritics + common suffixes)
    const norm = normalizeTeamName(name);
    const shNorm = getShieldsNorm();
    if (norm && shNorm[norm]) {
      return '<img class="team-badge" src="./escudos/' + shNorm[norm] + '" alt="' + name + '" onerror="this.outerHTML=teamBadgeFallback(this.alt)">';
    }
    // 3. Substring match (short name inside long key, using normalized forms)
    if (norm.length >= 4) {
      const found = Object.keys(SHIELDS).find(k => {
        const kn = normalizeTeamName(k);
        return kn.length >= 4 && (kn.includes(norm) || norm.includes(kn));
      });
      if (found) {
        return '<img class="team-badge" src="./escudos/' + SHIELDS[found] + '" alt="' + name + '" onerror="this.outerHTML=teamBadgeFallback(this.alt)">';
      }
    }
  }
  return teamBadgeFallback(name);
}

/* Get last N results for a team from HISTORY */
export function getTeamForm(teamName, groupId, n) {
  n = n || 5;
  var jornadas = null;
  if (isHistorical()) {
    var group = getData().find(function(g){return g.id === groupId;});
    if (group && group.jornadas) jornadas = group.jornadas;
  } else {
    if (typeof HISTORY === 'undefined' || !HISTORY[groupId]) return [];
    jornadas = HISTORY[groupId];
  }
  if (!jornadas) return [];
  var all = [];
  Object.entries(jornadas).forEach(function(entry) {
    var jorKey = entry[0], matches = entry[1];
    var jorNum = parseInt(jorKey);
    matches.forEach(function(m) {
      var date = m[0], home = m[1], away = m[2], hs = m[3], as_ = m[4];
      if (hs === null || hs === undefined || as_ === null || as_ === undefined) return;
      if (home !== teamName && away !== teamName) return;
      var isHome = home === teamName;
      var gf = isHome ? hs : as_, gc = isHome ? as_ : hs;
      all.push({ jorNum: jorNum, date: date, result: gf > gc ? 'W' : gf < gc ? 'L' : 'D' });
    });
  });
  all.sort(function(a,b){return a.jorNum - b.jorNum || a.date.localeCompare(b.date);});
  return all.slice(-n);
}

// Season data cache — loaded lazily per historical season
const _seasonCache = {};

async function loadSeasonData(seasonName) {
  if (_seasonCache[seasonName]) return _seasonCache[seasonName];
  const slug = seasonName.replace(/-/g, '_');
  const url = `./data-season-${seasonName}.js`;
  try {
    const r = await fetch(url);
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const text = await r.text();
    // Extract JSON: "const SEASON_2024_2025=..." → parse the object
    const m = text.match(/const SEASON_\w+=(.+);/);
    if (!m) throw new Error('No SEASON_ var found');
    const seasonObj = JSON.parse(m[1]);
    _seasonCache[seasonName] = seasonObj;
    return seasonObj;
  } catch (e) {
    console.error('[state] loadSeasonData failed:', url, e);
    return null;
  }
}

// Synchronous — uses cached data for historical seasons
export function getData() {
  if (S.season && _seasonCache[S.season]) {
    const data = _seasonCache[S.season];
    return S.cat === 'benjamin' ? data.benjamin : data.prebenjamin;
  }
  return S.cat === 'benjamin' ? BENJAMIN : PREBENJAMIN;
}

// Async — call this before renderSection when switching historical seasons
export async function ensureSeasonData(seasonName) {
  if (!seasonName) return;
  if (_seasonCache[seasonName]) return;
  await loadSeasonData(seasonName);
}

export function isHistorical() {
  return !!S.season;
}

export function getPhases() {
  const data = getData();
  const map = {};
  data.forEach(g => {
    if (!map[g.phase]) map[g.phase] = [];
    map[g.phase].push(g);
  });
  Object.values(map).forEach(arr => arr.sort((a, b) => {
    const na = parseInt(a.name.replace(/\D/g, '')) || 0;
    const nb = parseInt(b.name.replace(/\D/g, '')) || 0;
    return na - nb;
  }));
  return map;
}

export function countStats() {
  const data = getData();
  const groups = data.length;
  let teams = 0, matches = 0;
  data.forEach(g => {
    teams += g.standings.length;
    if (g.matches) {
      matches += g.matches.length;
    } else if (g.jornadas) {
      Object.values(g.jornadas).forEach(function(jor) { matches += jor.length; });
    }
  });
  // Add history matches for benjamin (current season only)
  if (!isHistorical() && S.cat === 'benjamin' && typeof HIST_MATCHES !== 'undefined') {
    matches = HIST_MATCHES;
  }
  return { groups, teams, matches };
}

/* ====== CLASIFICACION UNIFICADA PREBENJAMIN ====== */
export function buildUnifiedPrebenjamin() {
  const allTeams = [];
  const groupSymbols = { 1: '①', 2: '②', 3: '③' };
  const groupColors = { 1: '#4285F4', 2: '#EA4335', 3: '#34A853' };
  
  if (typeof PREBENJAMIN === 'undefined') return document.createElement('div');
  
  PREBENJAMIN.forEach((g, idx) => {
    if (!g.standings || !g.standings.length) return;
    const groupNum = idx + 1;
    if (groupNum > 3) return; // Solo grupos 1, 2, 3
    const sym = groupSymbols[groupNum] || '○';
    const color = groupColors[groupNum] || '#888';
    
    g.standings.forEach(row => {
      const pts = row[2];
      const j = row[3];
      const ppg = j > 0 ? (pts / j) : 0;
      allTeams.push({
        name: row[1], pts, j, g_wins: row[4], e: row[5], p: row[6],
        gf: row[7] || 0, gc: row[8] || 0, df: row[9] || 0,
        ppg: Math.round(ppg * 100) / 100,
        groupNum, sym, color, groupName: g.name
      });
    });
  });
  
  // Sort by PPG first, then total points, then GD
  allTeams.sort((a, b) => b.ppg - a.ppg || b.pts - a.pts || b.df - a.df);
  
  const wrapper = document.createElement('div');
  let html = `<div class="phase-header"><span class="phase-icon">🏆</span> CLASIFICACIÓN UNIFICADA PREBENJAMÍN</div>`;
  html += '<div class="table-wrap"><table class="standings-table unified-table"><thead><tr>';
  html += '<th>#</th><th>Equipo</th><th>GRP</th><th>PPJ</th><th>PTS</th><th>J</th><th>G</th><th>E</th><th>P</th><th>GF</th><th>GC</th><th>DF</th>';
  html += '</tr></thead><tbody>';
  
  allTeams.forEach((t, i) => {
    const pos = i + 1;
    const cls = pos <= 3 ? 'pos-' + pos : '';
    const dfCls = t.df > 0 ? 'df-pos' : (t.df < 0 ? 'df-neg' : '');
    const dfStr = t.df > 0 ? '+' + t.df : t.df;
    html += `<tr class="${cls}">`;
    html += `<td>${pos}</td>`;
    html += `<td class="team-name-cell" data-group="${PREBENJAMIN[t.groupNum - 1].id}">${teamBadge(t.name)} ${t.name}</td>`;
    html += `<td style="color:${t.color};font-weight:700;text-align:center" title="${t.groupName}">${t.sym}</td>`;
    html += `<td class="pts-col">${t.ppg}</td>`;
    html += `<td>${t.pts}</td><td>${t.j}</td><td>${t.g_wins}</td><td>${t.e}</td><td>${t.p}</td>`;
    html += `<td>${t.gf}</td><td>${t.gc}</td>`;
    html += `<td class="${dfCls}">${dfStr}</td>`;
    html += '</tr>';
  });
  
  html += '</tbody></table></div>';
  html += '<div class="unified-legend">';
  html += '<span>PPJ = Puntos por partido</span>';
  for (let n = 1; n <= 3; n++) {
    if (PREBENJAMIN[n - 1]) {
      html += `<span style="color:${groupColors[n]}">${groupSymbols[n]} ${PREBENJAMIN[n - 1].name}</span>`;
    }
  }
  html += '</div>';
  
  wrapper.innerHTML = html;
  return wrapper;
}

/* ====== SPARKLINE ====== */
export function buildSparkline(data) {
  if (!data || data.length < 2) return '';
  const w = 300, h = 60, pad = 4;
  const max = Math.max(...data);
  const min = Math.min(...data);
  const range = max - min || 1;
  const stepX = (w - pad * 2) / (data.length - 1);

  const points = data.map((v, i) => {
    const x = pad + i * stepX;
    const y = h - pad - ((v - min) / range) * (h - pad * 2);
    return `${x},${y}`;
  });

  const fillPoints = `${pad},${h - pad} ${points.join(' ')} ${pad + (data.length - 1) * stepX},${h - pad}`;

  let svg = `<div class="sparkline-wrap">`;
  svg += `<svg class="sparkline" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none">`;
  svg += `<polygon points="${fillPoints}" fill="rgba(0,230,118,0.1)" />`;
  svg += `<polyline points="${points.join(' ')}" fill="none" stroke="var(--accent)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />`;
  // End dot
  const lastPt = points[points.length - 1].split(',');
  svg += `<circle cx="${lastPt[0]}" cy="${lastPt[1]}" r="3" fill="var(--accent)" />`;
  svg += '</svg>';
  svg += `<div class="sparkline-labels"><span>J1: ${data[0]} pts</span><span>J${data.length}: ${data[data.length - 1]} pts</span></div>`;
  svg += '</div>';
  return svg;
}

export { S };
