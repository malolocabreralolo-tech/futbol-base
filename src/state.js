/* ====== APP STATE ====== */
const S = {
  cat: 'benjamin',      // 'benjamin' | 'prebenjamin'
  section: 'miequipo',  // 'miequipo'|'clasif'|'jornadas'|'goleadores'|'isla'|'stats'
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

/* ====== FEATURED TEAM (fixed personal portal) ====== */
export const FEATURED = { cat: 'prebenjamin', groupId: 'PG2', name: 'Las Mesas Hu.' };

/* True when `name` is the featured team (normalized match). Covers club
 * prefixes and the dot in "Hu." but NOT B teams. */
export function isFeatured(name) {
  if (!name) return false;
  const strip = s => normalizeTeamName(s).replace(/\./g, '').replace(/\s+/g, ' ').trim();
  return strip(name) === strip(FEATURED.name);
}

/* Standings row of the featured team within a PREBENJAMIN-shaped array.
 * Returns { group, row, pos, total } or null. */
export function featuredStandingFrom(prebenjamin) {
  if (!Array.isArray(prebenjamin)) return null;
  const group = prebenjamin.find(g => g.id === FEATURED.groupId);
  if (!group || !Array.isArray(group.standings)) return null;
  const row = group.standings.find(r => isFeatured(r[1]));
  if (!row) return null;
  return { group, row, pos: row[0], total: group.standings.length };
}

/* All matches of the featured team from a HISTORY[groupId]-shaped object,
 * sorted by jornada then date. Entry: { jor, jorNum, date, home, away,
 * hs, as, isHome, opp, played, result } -- result 'W'|'D'|'L' or null. */
export function featuredMatchesFrom(historyGroup) {
  if (!historyGroup || typeof historyGroup !== 'object') return [];
  const out = [];
  Object.entries(historyGroup).forEach(([jor, matches]) => {
    if (!Array.isArray(matches)) return;
    const jorNum = parseInt(String(jor).replace(/\D/g, ''), 10) || 0;
    matches.forEach(m => {
      const [date, home, away, hs, as] = m;
      if (!isFeatured(home) && !isFeatured(away)) return;
      const isHome = isFeatured(home);
      const played = hs !== null && hs !== undefined
        && as !== null && as !== undefined;
      let result = null;
      if (played) {
        const gf = isHome ? hs : as;
        const gc = isHome ? as : hs;
        result = gf > gc ? 'W' : gf < gc ? 'L' : 'D';
      }
      out.push({ jor, jorNum, date, home, away, hs, as, isHome,
        opp: isHome ? away : home, played, result });
    });
  });
  out.sort((a, b) => a.jorNum - b.jorNum
    || String(a.date).localeCompare(String(b.date)));
  return out;
}

/* Featured team's scorers from a GOL_PREBENJ-shaped array. Entry shape in
 * data: [name, team, goals, games]. Sorted goals desc, games asc. */
export function featuredScorersFrom(golPrebenj) {
  if (!Array.isArray(golPrebenj)) return [];
  // 'PREBENJAMIN GC GRUPO 2' = the data-goleadores.js display key for
  // FEATURED.groupId ('PG2'). No PG2->name mapping exists, so this literal
  // is intentional; if it ever mismatches, this safely returns [].
  const grp = golPrebenj.find(g => g.g === 'PREBENJAMIN GC GRUPO 2');
  if (!grp || !Array.isArray(grp.s)) return [];
  return grp.s
    .filter(s => isFeatured(s[1]))
    .map(s => ({ name: s[0], goals: s[2], games: s[3] }))
    .sort((a, b) => b.goals - a.goals || a.games - b.games);
}

/* ====== HELPERS ====== */
export function $(sel, ctx) { return (ctx||document).querySelector(sel); }
export function $$(sel, ctx) { return Array.from((ctx||document).querySelectorAll(sel)); }
export function el(tag, cls, html) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (html !== undefined) e.innerHTML = html;
  return e;
}

/* ====== HTML ESCAPING (C2: single shared implementation) ======
 * Team/player/venue names come from scraping (FIFLP / futbolaspalmas /
 * Wayback) and DO contain quotes today (5.908 names with `"` in 2024-25,
 * e.g. 'ATLETICO HURACAN, A.D. "A"'). Every interpolation of scraped data
 * into innerHTML must go through these. Other modules import them from
 * here — do not re-declare local copies. */
export function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, c =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
/* For attribute values (alt="...", title="...", data-*="..."). Same charset
 * as escapeHtml — quotes are the load-bearing part for attributes. */
export function escapeAttr(s) {
  return escapeHtml(s);
}

/* ====== JORNADA KEY HELPERS ======
 * Jornada labels are mixed across seasons: 'Jornada N' (current HISTORY),
 * 'N' (wayback per-season files) and copa-round keys like
 * '08-06-2025 ( Ronda 1 Ida )' (Copa 2024-25). Only the first two are
 * truly numeric — copa keys contain digits (the DATE) that must NOT be
 * mistaken for a jornada number. */
export function jornadaNumber(key) {
  const m = String(key).trim().match(/^(?:jornada|jor\.?|j)?\s*(\d+)$/i);
  return m ? parseInt(m[1], 10) : null;
}

/* Pill label: 'J<n>' for numeric jornadas, the raw label verbatim for
 * non-numeric rounds (e.g. 'Semifinal', copa keys) — never 'JNaN'. */
export function jornadaLabel(key) {
  const n = jornadaNumber(key);
  return n !== null ? 'J' + n : String(key).trim();
}

/* Sort jornada keys: numeric ones ascending, non-numeric ones after them
 * preserving insertion order (data files emit rounds in play order). */
export function sortJornadaKeys(keys) {
  return keys
    .map((k, i) => ({ k, n: jornadaNumber(k), i }))
    .sort((a, b) => {
      const an = a.n === null ? Number.MAX_SAFE_INTEGER : a.n;
      const bn = b.n === null ? Number.MAX_SAFE_INTEGER : b.n;
      return (an - bn) || (a.i - b.i);
    })
    .map(x => x.k);
}

/* Team badge — real shield from SHIELDS or fallback to initials */
export function teamBadgeFallback(name) {
  const words = name.replace(/[^a-zA-ZáéíóúñÁÉÍÓÚÑüÜ\s]/g, '').trim().split(/\s+/);
  let initials;
  if (words.length === 1) initials = words[0].substring(0, 2).toUpperCase();
  else initials = words.slice(0, 3).map(w => w[0]).join('').toUpperCase();
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
  const hue = Math.abs(hash) % 360;
  return `<span class="team-badge" style="background:hsl(${hue},55%,45%)">${initials}</span>`;
}

/* Replace a broken badge <img> with the initials fallback. Pure helper so
 * it is unit-testable; wired to the DOM via installBadgeErrorDelegation()
 * below. (The old inline error attribute called teamBadgeFallback, a
 * module-scope function that is NOT global \u2192 ReferenceError, dead fallback.) */
export function handleBadgeError(target) {
  if (!target || target.tagName !== 'IMG') return false;
  if (!target.classList || !target.classList.contains('team-badge')) return false;
  target.outerHTML = teamBadgeFallback(target.alt || '');
  return true;
}

/* Delegated, capture-phase error handler: <img> error events do not bubble,
 * so listen in capture on the document. Installed once at module load. */
export function installBadgeErrorDelegation(doc) {
  const d = doc || (typeof document !== 'undefined' ? document : null);
  if (!d || d.__badgeErrorDelegated) return;
  d.__badgeErrorDelegated = true;
  d.addEventListener('error', e => { handleBadgeError(e.target); }, true);
}
if (typeof document !== 'undefined') installBadgeErrorDelegation(document);

/* Shield-matching normalizer. NOTE: mirrored by scripts/check_missing_shields.py
 * (normalize()) and by the reference copy in scripts/tests \u2014 keep in sync.
 * Pipeline: NFD accent-strip \u2192 strip quotes (straight + curly) / dots /
 * commas \u2192 strip club tokens \u2192 lowercase \u2192 collapse whitespace. */
export function normalizeTeamName(s) {
  return s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/['".,\u2018\u2019\u201c\u201d]/g, '').replace(/\b(CF|UD|CD|AD|SD|AFC|SC|CP|CE|CEF|SSD|ATLETICO|ATL)\b/gi, '').toLowerCase().trim().replace(/\s+/g, ' ');
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

/* Broken images fall back to initials via the delegated document-level
 * error handler (installBadgeErrorDelegation) — no inline handler attrs. */
function shieldImg(file, name) {
  return '<img class="team-badge" src="./escudos/' + escapeAttr(file) + '" alt="' + escapeAttr(name) + '">';
}

export function teamBadge(name) {
  if (typeof SHIELDS !== 'undefined') {
    // 1. Exact match
    if (SHIELDS[name]) {
      return shieldImg(SHIELDS[name], name);
    }
    // 2. Normalized match (strip diacritics + common suffixes)
    const norm = normalizeTeamName(name);
    const shNorm = getShieldsNorm();
    if (norm && shNorm[norm]) {
      return shieldImg(shNorm[norm], name);
    }
    // 3. Substring match (short name inside long key, using normalized forms)
    if (norm.length >= 4) {
      const found = Object.keys(SHIELDS).find(k => {
        const kn = normalizeTeamName(k);
        return kn.length >= 4 && (kn.includes(norm) || norm.includes(kn));
      });
      if (found) {
        return shieldImg(SHIELDS[found], name);
      }
    }
  }
  return teamBadgeFallback(name);
}

/* Lazy loader for the full goal-timeline data. data-matchdetail.js is no
 * longer an eager <script> (it is ~359 KB); fetch+parse it on demand the
 * first time a match modal needs it. Single-flight + module cache. Mirrors
 * loadAllHistoricalSeasons() in modals.js. ?v= is inherited from the eager
 * data-matchdetail-keys.js script tag so cache-busting stays aligned.
 * On failure the single-flight promise is cleared (next call retries) and
 * a null sentinel is returned — callers already null-check. */
let _matchDetail = null;
let _matchDetailPromise = null;
export async function ensureMatchDetail() {
  if (_matchDetail) return _matchDetail;
  if (_matchDetailPromise) return _matchDetailPromise;
  _matchDetailPromise = (async () => {
    const ver = (document.querySelector('script[src*="data-matchdetail-keys.js"]')
      ?.src.match(/v=([^&]+)/)?.[1]) || '';
    try {
      const r = await fetch(`./data-matchdetail.js${ver ? `?v=${ver}` : ''}`);
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const txt = await r.text();
      const m = txt.match(/const MATCH_DETAIL=(\{[\s\S]*\});/);
      if (!m) throw new Error('MATCH_DETAIL not found in data-matchdetail.js');
      _matchDetail = JSON.parse(m[1]);
      return _matchDetail;
    } catch (e) {
      console.error('[state] ensureMatchDetail failed:', e);
      _matchDetailPromise = null; // clear single-flight → retry allowed
      return null;                // error sentinel (never cached)
    }
  })();
  return _matchDetailPromise;
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
    // Keys may be 'Jornada N', 'N' or non-numeric copa rounds; jornadaNumber
    // handles all three (null → sorted last, stable on date).
    var num = jornadaNumber(jorKey);
    var jorNum = num === null ? Number.MAX_SAFE_INTEGER : num;
    matches.forEach(function(m) {
      var date = m[0], home = m[1], away = m[2], hs = m[3], as_ = m[4];
      if (hs === null || hs === undefined || as_ === null || as_ === undefined) return;
      if (home !== teamName && away !== teamName) return;
      var isHome = home === teamName;
      var gf = isHome ? hs : as_, gc = isHome ? as_ : hs;
      all.push({ jorNum: jorNum, date: date, result: gf > gc ? 'W' : gf < gc ? 'L' : 'D' });
    });
  });
  all.sort(function(a,b){return (a.jorNum - b.jorNum) || String(a.date).localeCompare(String(b.date));});
  return all.slice(-n);
}

// Season data cache — loaded lazily per historical season.
// _seasonError[name] holds the last load failure message (cleared on
// success) so render.js can show an honest error + retry instead of
// silently mislabeling current-season data as historical.
const _seasonCache = {};
const _seasonPromise = {};
const _seasonError = {};

/* Last load error for a historical season ('' / null when none). */
export function getSeasonError(seasonName) {
  return _seasonError[seasonName] || null;
}

// Synchronous — uses cached data for historical seasons
export function getData() {
  if (S.season) {
    const data = _seasonCache[S.season];
    // Season requested but not loaded (failed or in flight): NEVER fall
    // back to current-season globals — that would render 2025-26 data
    // under a historical banner. Empty + getSeasonError() is the honest state.
    if (!data) return [];
    return (S.cat === 'benjamin' ? data.benjamin : data.prebenjamin) || [];
  }
  const cur = S.cat === 'benjamin'
    ? (typeof BENJAMIN !== 'undefined' ? BENJAMIN : null)
    : (typeof PREBENJAMIN !== 'undefined' ? PREBENJAMIN : null);
  return cur || [];
}

// Async — call this before renderSection when switching historical seasons.
// Single-flight per season; on failure the in-flight promise is cleared so
// a later call (e.g. the "Reintentar" button) refetches. Returns the season
// object, or null as error sentinel (see getSeasonError for the message).
export async function ensureSeasonData(seasonName) {
  if (!seasonName) return null;
  if (_seasonCache[seasonName]) return _seasonCache[seasonName];
  if (_seasonPromise[seasonName]) return _seasonPromise[seasonName];
  _seasonPromise[seasonName] = (async () => {
    // Cache-bust per-season files alongside index.html ?v= parameter
    const ver = (document.querySelector('script[src*="data-seasons.js"]')?.src.match(/v=([^&]+)/)?.[1]) || '';
    const url = `./data-season-${seasonName}.js${ver ? `?v=${ver}` : ''}`;
    try {
      const r = await fetch(url);
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const text = await r.text();
      // Extract JSON: "const SEASON_2024_2025=..." → parse the object
      const m = text.match(/const SEASON_\w+=(.+);/);
      if (!m) throw new Error('No SEASON_ var found');
      const seasonObj = JSON.parse(m[1]);
      _seasonCache[seasonName] = seasonObj;
      delete _seasonError[seasonName];
      return seasonObj;
    } catch (e) {
      console.error('[state] ensureSeasonData failed:', url, e);
      _seasonError[seasonName] = (e && e.message) || String(e);
      return null; // error sentinel
    } finally {
      delete _seasonPromise[seasonName]; // allow retry after failure
    }
  })();
  return _seasonPromise[seasonName];
}

/* ──────────────────────────────────────────────────────────────────────
 * SP-2: lazy-loaders for data-lineups-<S>.js and data-players-<S>.js.
 * Same shape as ensureMatchDetail. Parse data file text with a regex
 * and JSON.parse the const value — never read via the global object.
 * (Lesson 2026-05-18: const top-level declarations don't become
 *  properties of the global object, so text-parsing is the canonical
 *  pattern — see systematic-debugging root cause 2026-05-18.)
 * Returns null on missing file or parse failure — UI shows empty-state.
 * ────────────────────────────────────────────────────────────────────── */

/* C1: normalizer for TEAMS_<S> key lookup \u2014 exact mirror of the Python side
 * (shared spec, contract C1): lowercase \u2192 NFKD accent-strip \u2192 strip quotes
 * (straight + curly) and punctuation \u2192 strip club tokens (same list as
 * acta_reconciler._CLUB_SUFFIX) \u2192 collapse whitespace. The trailing filial
 * letter (A/B/C/D) is PRESERVED \u2014 TEAMS_<S> keys keep it so 'UD Atalaya' and
 * 'UD Atalaya B' map to different teams. The existing normalizeTeamName
 * above is for shield matching and has different semantics; do NOT reuse. */
const _SP1_CLUB_SUFFIX = /\b(c\s*f|c\s*d|c\s*d\s*f|u\s*d|a\s*d|s\s*d|s\s*c|s\s*a\s*d|e\s*f|c\s*p|c\s*e|club|deportivo|atletico|atletico\s+c\s*f|deportiva|sociedad|union|f\s*c)\b/g;
export function normalizeForTeamsMapping(s) {
  if (!s) return "";
  s = String(s).normalize("NFKD").replace(/[\u0300-\u036f]/g, "");
  s = s.toLowerCase();
  s = s.replace(/["'\u2018\u2019\u201C\u201D]/g, " ");
  s = s.replace(/[.,;:]/g, " ");
  s = s.replace(_SP1_CLUB_SUFFIX, " ");
  s = s.replace(/\s+/g, " ").trim();
  return s;
}

const _lineups = {};
const _lineupsPromise = {};
const _players = {};
const _playersPromise = {};

function _seasonSuffix(season) { return season.replace('-', '_'); }

function _versionFromMatchDetailKeys() {
  return (document.querySelector('script[src*="data-matchdetail-keys.js"]')
    ?.src.match(/v=([^&]+)/)?.[1]) || '';
}

/* On failure both loaders return a null sentinel WITHOUT caching it and
 * clear their single-flight promise, so a later call retries the fetch
 * (a transient network error no longer blanks the feature for the whole
 * session). Callers already null-check (UI empty-state). */
export async function ensureLineups(season) {
  if (_lineups[season] !== undefined) return _lineups[season];
  if (_lineupsPromise[season]) return _lineupsPromise[season];
  _lineupsPromise[season] = (async () => {
    const ver = _versionFromMatchDetailKeys();
    const suffix = _seasonSuffix(season);
    try {
      const r = await fetch('./data-lineups-' + season + '.js' + (ver ? '?v=' + ver : ''));
      if (!r.ok) throw new Error('HTTP ' + r.status);
      const txt = await r.text();
      const re = new RegExp('const LINEUPS_' + suffix + '\\s*=\\s*(\\{[\\s\\S]*\\});');
      const m = txt.match(re);
      if (!m) throw new Error('LINEUPS_' + suffix + ' not parseable');
      _lineups[season] = JSON.parse(m[1]);
      return _lineups[season];
    } catch (e) {
      console.warn('[state] ensureLineups failed:', e.message);
      _lineupsPromise[season] = null; // clear single-flight → retry allowed
      return null;                    // error sentinel (never cached)
    }
  })();
  return _lineupsPromise[season];
}

export async function ensurePlayers(season) {
  if (_players[season] !== undefined) return _players[season];
  if (_playersPromise[season]) return _playersPromise[season];
  _playersPromise[season] = (async () => {
    const ver = _versionFromMatchDetailKeys();
    const suffix = _seasonSuffix(season);
    try {
      const r = await fetch('./data-players-' + season + '.js' + (ver ? '?v=' + ver : ''));
      if (!r.ok) throw new Error('HTTP ' + r.status);
      const txt = await r.text();
      const reP = new RegExp('const PLAYERS_' + suffix + '\\s*=\\s*(\\{[\\s\\S]*?\\});');
      const reT = new RegExp('const TEAMS_'   + suffix + '\\s*=\\s*(\\{[\\s\\S]*?\\});');
      const mp = txt.match(reP);
      const mt = txt.match(reT);
      if (!mp || !mt) throw new Error('PLAYERS_/TEAMS_' + suffix + ' not parseable');
      _players[season] = { players: JSON.parse(mp[1]), teams: JSON.parse(mt[1]) };
      return _players[season];
    } catch (e) {
      console.warn('[state] ensurePlayers failed:', e.message);
      _playersPromise[season] = null; // clear single-flight → retry allowed
      return null;                    // error sentinel (never cached)
    }
  })();
  return _playersPromise[season];
}

export function getCurrentSeason() {
  // Default: featured season for the portal. If S.season is set (jornadas
  // selector) prefer that; otherwise '2025-2026' (current season).
  return (typeof S !== 'undefined' && S && S.season) || '2025-2026';
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
    const cls = (pos <= 3 ? 'pos-' + pos : '') + (isFeatured(t.name) ? ' featured-team' : '');
    const dfCls = t.df > 0 ? 'df-pos' : (t.df < 0 ? 'df-neg' : '');
    const dfStr = t.df > 0 ? '+' + t.df : t.df;
    html += `<tr class="${cls.trim()}">`;
    html += `<td>${pos}</td>`;
    html += `<td class="team-name-cell" data-group="${escapeAttr(PREBENJAMIN[t.groupNum - 1].id)}" data-team="${escapeAttr(t.name)}">${teamBadge(t.name)} ${escapeHtml(t.name)}</td>`;
    html += `<td style="color:${t.color};font-weight:700;text-align:center" title="${escapeAttr(t.groupName)}">${t.sym}</td>`;
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
      html += `<span style="color:${groupColors[n]}">${groupSymbols[n]} ${escapeHtml(PREBENJAMIN[n - 1].name)}</span>`;
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
