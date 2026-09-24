// Carga de datos y funciones de dominio heredadas (spec §5.2). Desde el corte de B2 no guarda
// estado de interfaz (S y FEATURED), no pinta HTML y no toca el DOM al importarse: la URL es la
// fuente de verdad, myteam.js y store.js guardan mi equipo y ui.js pinta los escudos.
import { PORTAL } from './config.js';

/* Goleadores de un equipo en su grupo, de GOL_BENJ o GOL_PREBENJ ([{ id, g, s: [[jugador,
 * equipo, goles, partidos]] }], lo que da model.scorers): [{ name, goals, games }], de más a menos
 * goles y, a igualdad, con menos partidos. `team` es { cat, groupId, name }, como myTeam; el
 * nombre se compara exacto, porque los de los goleadores son los de la clasificación. Antes
 * featuredScorersFrom, que leía FEATURED (decisión 2 de B2). */
export function teamScorers(gol, team) {
  if (!Array.isArray(gol) || !team) return [];
  // Los ficheros publicados llevan el código del grupo; los antiguos, una clave de texto.
  const grp = gol.find(g => g.id === team.groupId)
    || gol.find(g => team.cat === 'prebenjamin' && g.g === 'PREBENJAMIN GC GRUPO ' + String(team.groupId).replace(/^PG/, ''));
  if (!grp || !Array.isArray(grp.s)) return [];
  return grp.s
    .filter(s => s[1] === team.name)
    .map(s => ({ name: s[0], goals: s[2], games: s[3] }))
    .sort((a, b) => b.goals - a.goals || a.games - b.games);
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

/* Keep jorGroup only if it belongs to the active season's groups; otherwise
 * fall back to the first one. Switching to a historical season used to leave a
 * stale current-season code (e.g. 'A2') that no historical group has, so the
 * Jornadas tab rendered blank. Pure + testable. */
export function validJorGroup(current, groups) {
  if (current && groups.some(g => g.id === current)) return current;
  return groups.length ? groups[0].id : '';
}

/* Rounds source for a knockout (cup) group's bracket. Historical cups carry
 * their rounds inline (g.jornadas, from the per-season file); current-season
 * cups live in HISTORY keyed by code, like every current-season group. The
 * `historical` guard avoids the cross-season code collision (BCA1 exists in
 * both 2024-25 and 2025-26). Returns the rounds object (or {}). */
export function knockoutRoundsSource(g, historical, history) {
  if (g && g.jornadas && Object.keys(g.jornadas).length) return g.jornadas;
  if (!historical && history && g && history[g.id]) return history[g.id];
  return {};
}

/* For a DRAWN knockout match, the team that advanced (on penalties) is the one
 * that appears in a LATER round of the same bracket. Returns 'home'/'away'/null
 * (the tag is lost at import, so we derive it from the bracket itself). */
export function bracketDrawAdvancer(jornadas, rounds, idx, home, away) {
  const later = new Set();
  for (let r = idx + 1; r < rounds.length; r++) {
    for (const m of (jornadas[rounds[r]] || [])) { later.add(m[1]); later.add(m[2]); }
  }
  const h = later.has(home), a = later.has(away);
  if (h && !a) return 'home';
  if (a && !h) return 'away';
  return null;
}

/* Who advanced from a knockout match. A drawn match carries the shootout
 * winner in an optional 6th column ('home'/'away') when the source knows it
 * (Maspalomas Cup API); otherwise fall back to deriving it from the bracket.
 * That fallback CANNOT resolve the final — there is no later round — so an
 * explicit column is the only way a penalty-decided final gets a champion. */
export function matchAdvancer(row, jornadas, rounds, idx) {
  const [, home, away, hs, as, pen] = row || [];
  if (hs == null || as == null) return null;
  if (hs > as) return 'home';
  if (as > hs) return 'away';
  if (pen === 'home' || pen === 'away') return pen;
  return bracketDrawAdvancer(jornadas, rounds, idx, home, away);
}

/* Champion of a bracket: the team that advanced from the single match of the
 * last round. Used when the group carries no standings to read it from (the
 * Maspalomas Cup groups don't — they are pure brackets). Returns null when the
 * last round isn't a lone decided match. */
export function bracketChampion(jornadas, rounds) {
  if (!rounds || !rounds.length) return null;
  const last = (jornadas || {})[rounds[rounds.length - 1]] || [];
  if (last.length !== 1) return null;
  const adv = matchAdvancer(last[0], jornadas, rounds, rounds.length - 1);
  if (!adv) return null;
  return adv === 'home' ? last[0][1] : last[0][2];
}

/* Icono de la cabecera de fase. Los nombres exactos mandan; el resto se
 * resuelve por palabras clave, porque hay muchas fases insulares con nombre
 * largo ("Fase 1 Fuerteventura", "Copa Cabildo Primera Lanzarote") que antes
 * caían todas al ⚽ genérico. */
const PHASE_ICONS = {
  'Segunda Fase A': '🏆', 'Segunda Fase B': '🥈', 'Segunda Fase C': '🥉',
  'Lanzarote': '🌋', 'Fuerteventura': '🏝️',
  'Gran Canaria': '🏔️',
  'Primera Fase GC': '🏟️',
  'Primera Fase': '🏟️',
};

export function phaseIcon(phase) {
  if (PHASE_ICONS[phase]) return PHASE_ICONS[phase];
  const p = String(phase || '').toLowerCase();
  if (p.includes('copa') || p.includes('campeon') || p.includes('campeón')) return '🏆';
  if (p.includes('lanzarote')) return '🌋';
  if (p.includes('fuerteventura')) return '🏝️';
  if (p.includes('gran canaria') || p.includes(' gc')) return '🏔️';
  return '⚽';
}

/* Etiqueta del badge "jornada en curso" de la cabecera de grupo. Las fuentes
 * no coinciden: futbolaspalmas guarda "Jornada 30" y FIFLP el número pelado
 * ("14"), así que en la misma pantalla salían badges "Jornada 30" y "14".
 * Distinto de jornadaLabel, que es la pastilla corta ("J14"). */
export function groupJornadaLabel(raw) {
  const s = String(raw == null ? '' : raw).trim();
  if (!s) return '';
  return /^\d+$/.test(s) ? `Jornada ${s}` : s;
}

/* A cup / knockout group (vs a regular league group). By code prefix
 * (PCC or BC) or phase ("Copa"/"Campeón"). */
export function isCupGroup(g) {
  const id = ((g && g.id) || '').toUpperCase();
  if (id.startsWith('PCC') || id.startsWith('BC')) return true;
  if (id.startsWith('MCP') || id.startsWith('MCB')) return true;
  const phase = ((g && g.phase) || '').toLowerCase();
  return phase.includes('copa') || phase.includes('campeon') || phase.includes('maspalomas');
}

/* The (≤3) league prebenjamín groups for the unified table — cups excluded.
 * buildUnifiedPrebenjamin numbers by position, so a cup group sorted before
 * PG1 used to take a slot and push PG3 out (and head the table).
 *
 * Sólo se unifica UNA competición. Al entrar el prebenjamín de Lanzarote y
 * Fuerteventura (2025-26), 'PFV*' ordena antes que 'PG*' y la tabla unificada
 * pasó a encabezarla Fuerteventura: equipos de islas distintas que no se
 * cruzan nunca, comparados en la misma clasificación. Se toma la fase con más
 * equipos, que es la competición principal. */
export function unifiedPrebenLeagueGroups(prebenjamin) {
  const ligas = (prebenjamin || []).filter(g => !isCupGroup(g));
  if (ligas.length <= 1) return ligas.slice(0, 3);
  const porFase = new Map();
  ligas.forEach(g => {
    const k = ((g && g.phase) || '').toLowerCase();
    if (!porFase.has(k)) porFase.set(k, []);
    porFase.get(k).push(g);
  });
  const tamano = gs => gs.reduce((n, g) => n + ((g.standings && g.standings.length) || 0), 0);
  let mejor = [];
  porFase.forEach(gs => {
    if (tamano(gs) > tamano(mejor)) mejor = gs;
  });
  return mejor.slice(0, 3);
}

/* Friendly label for a knockout round. Prefers the explicit round name in the
 * key ("( Semifinales )") — authoritative and order-independent — then
 * "Ronda N", then position relative to the final (last = Final). Check
 * semifinal BEFORE final ("Semifinales" contains "final"). */
export function knockoutRoundLabel(raw, idx, total) {
  const s = String(raw);
  // 1) explicit round name in the key (2025-26 cups: "( Semifinales )").
  //    Check semifinal BEFORE final ("Semifinales" contains "final").
  //    "Previa": ronda incompleta que abre un cuadro cuyo número de equipos no
  //    es potencia de 2 (Maspalomas Cup: 34 equipos → 2 eliminatorias → 32).
  if (/previa/i.test(s)) return 'Previa';
  if (/dieciseis/i.test(s)) return 'Dieciseisavos';
  if (/octavos/i.test(s)) return 'Octavos';
  if (/cuartos/i.test(s)) return 'Cuartos';
  if (/semifinal/i.test(s)) return 'Semifinales';
  if (/\bfinal\b/i.test(s)) return 'Final';
  // 2) position relative to the final (2024-25 "Ronda N" cups, ≤4 rounds →
  //    friendlier Cuartos/Semis/Final than "Ronda N").
  const fromEnd = total - 1 - idx;
  if (fromEnd === 0) return 'Final';
  if (fromEnd === 1) return 'Semifinales';
  if (fromEnd === 2) return 'Cuartos';
  if (fromEnd === 3) return 'Octavos';
  // 3) deeper brackets: "Ronda N" / stripped key.
  const r = s.match(/Ronda\s+(\d+)/i);
  if (r) return 'Ronda ' + r[1];
  return s.replace(/\d{2}-\d{2}-\d{4}\s*/, '').trim();
}

/** A cup whose only "round" is a multi-match group stage (round-robin) — e.g.
 * the 2023-24 Copa de Campeones (one "Ronda 1" with 7 matches per group). It
 * must render as a classification TABLE, not a one-column bracket (which
 * knockoutRoundLabel would mislabel "Final" by position). A lone final (1 round,
 * 1 match) is NOT a round-robin → stays a bracket. */
export function isRoundRobinCup(jornadas) {
  if (!jornadas) return false;
  const keys = Object.keys(jornadas);
  if (!keys.length) return false;
  // Un cuadro es un EMBUDO: cada ronda tiene menos partidos que la anterior y
  // termina en una sola final. Si la última ronda no es menor que la primera,
  // esto es una liguilla y va como TABLA — da igual que se llame "Copa".
  // Cubre la Copa de Campeones 2023-24 (1 ronda de 7) y las copas insulares
  // de Lanzarote y Fuerteventura (jornadas numeradas de tamaño constante).
  // Comparar primera contra última, y no "última === 1", evita clasificar mal
  // un cuadro a medio jugar cuya última ronda disputada son las semifinales.
  const first = (jornadas[keys[0]] || []).length;
  const last = (jornadas[keys[keys.length - 1]] || []).length;
  // Ronda única: liguilla si tiene varios partidos; una final suelta es cuadro.
  if (keys.length === 1) return first > 2;
  return last >= first;
}

/* Shield-matching normalizer. NOTE: mirrored by scripts/check_missing_shields.py
 * (normalize()) and by the reference copy in scripts/tests \u2014 keep in sync.
 * Pipeline: NFD accent-strip \u2192 strip quotes (straight + curly) / dots /
 * commas \u2192 strip club tokens \u2192 lowercase \u2192 collapse whitespace. */
export function normalizeTeamName(s) {
  return s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/['".,\u2018\u2019\u201c\u201d]/g, '').replace(/\b(CF|UD|CD|AD|SD|AFC|SC|CP|CE|CEF|SSD|ATLETICO|ATL)\b/gi, '').toLowerCase().trim().replace(/\s+/g, ' ');
}

// Fichero de escudo de un equipo (spec §5.2, sustituye a teamBadge): la clave exacta de `shields`
// o, si no está, la primera clave con el mismo nombre normalizado; null si no hay. Nunca por
// subcadena: «UD Las Mesas Huracán» se llevaría el escudo de AD Huracán. Es la única búsqueda de
// escudos de la app: la usan crest (ui.js) y buildClubIndex (myteam.js), que no deben divergir.
const _shieldIndex = new WeakMap();
export function shieldFile(name, shields) {
  if (!name || !shields) return null;
  if (Object.hasOwn(shields, name)) return shields[name];
  let index = _shieldIndex.get(shields);
  if (!index) {
    index = new Map();
    for (const [key, file] of Object.entries(shields)) {
      const norm = normalizeTeamName(key);
      if (norm && !index.has(norm)) index.set(norm, file);
    }
    _shieldIndex.set(shields, index);
  }
  return index.get(normalizeTeamName(String(name))) || null;
}

// Globales inmediatos de los data-*.js (spec §5.4): identificador desnudo con typeof, nunca a
// través del objeto global, y null si el fichero no ha llegado. Es la puerta de los datos de la
// app nueva: el resto de módulos los recibe por parámetro (datasets).
export function readGlobals() {
  return {
    benjamin: typeof BENJAMIN !== 'undefined' ? BENJAMIN : null,
    prebenjamin: typeof PREBENJAMIN !== 'undefined' ? PREBENJAMIN : null,
    history: typeof HISTORY !== 'undefined' ? HISTORY : null,
    golBenj: typeof GOL_BENJ !== 'undefined' ? GOL_BENJ : null,
    golPrebenj: typeof GOL_PREBENJ !== 'undefined' ? GOL_PREBENJ : null,
    shields: typeof SHIELDS !== 'undefined' ? SHIELDS : null,
    seasons: typeof SEASONS !== 'undefined' ? SEASONS : null,
    cupBenjamin: typeof MASPALOMAS_CUP_BENJAMIN !== 'undefined' ? MASPALOMAS_CUP_BENJAMIN : null,
    cupPrebenjamin: typeof MASPALOMAS_CUP_PREBENJAMIN !== 'undefined' ? MASPALOMAS_CUP_PREBENJAMIN : null,
  };
}

// Versión de los datos (spec §5.4): la ?v= del <script> de data-seasons.js, que index.html
// siempre carga; '' sin documento o sin ese <script>. La llevan todas las peticiones perezosas.
export function dataVersion() {
  if (typeof document === 'undefined') return '';
  const src = document.querySelector('script[src*="data-seasons.js"]')?.getAttribute('src') || '';
  return (src.match(/[?&]v=([^&#]+)/) || [])[1] || '';
}

// La query de las peticiones perezosas: '?v=<versión>' o ''.
function dataQuery() {
  const version = dataVersion();
  return version ? `?v=${version}` : '';
}

// Nada espera para siempre (§7): si una petición perezosa no termina, cuerpo incluido, en
// LAZY_TIMEOUT_MS, se aborta y la carga falla como con un error de red. Lo opcional pinta su
// caja de error en el bloque; lo necesario, en la pantalla, siempre con «Reintentar».
export const LAZY_TIMEOUT_MS = 15000;

// Una petición perezosa: `file` con la ?v= de los datos y el tiempo límite. Devuelve lo que los
// cargadores usan de una respuesta (ok, status y text()), con el cuerpo ya leído dentro del plazo.
async function fetchData(file) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), LAZY_TIMEOUT_MS);
  try {
    const r = await fetch(`./${file}${dataQuery()}`, { signal: controller.signal });
    const body = r.ok ? await r.text() : '';
    return { ok: r.ok, status: r.status, text: async () => body };
  } finally {
    clearTimeout(timer);
  }
}

/* Lazy loader for the full goal-timeline data. data-matchdetail.js is no
 * longer an eager <script> (it is ~359 KB); fetch+parse it on demand the
 * first time the match screen needs it. Single-flight + module cache.
 * ?v= is dataVersion() (the one of data-seasons.js), like every lazy loader.
 * On failure the single-flight promise is cleared (next call retries) and
 * a null sentinel is returned — callers already null-check. */
let _matchDetail = null;
let _matchDetailPromise = null;
export async function ensureMatchDetail() {
  if (_matchDetail) return _matchDetail;
  if (_matchDetailPromise) return _matchDetailPromise;
  _matchDetailPromise = (async () => {
    try {
      const r = await fetchData('data-matchdetail.js');
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

// Season data cache — loaded lazily per historical season.
// _seasonError[name] holds the last load failure message (cleared on
// success) so the screen can show an honest error + retry instead of
// silently mislabeling current-season data as historical.
const _seasonCache = {};
const _seasonPromise = {};
const _seasonError = {};

/* Last load error for a historical season ('' / null when none). */
export function getSeasonError(seasonName) {
  return _seasonError[seasonName] || null;
}

// Grupos de una temporada y categoría, con la Maspalomas Cup en 2025-26. Los de la temporada del
// portal (o season vacío) salen de los globales; los de una pasada, de lo que cargó
// ensureSeasonData, y [] mientras no esté cargada: nunca cae a los datos de la actual con la
// etiqueta de otra temporada.
export function getData(season, cat) {
  if (season && season !== PORTAL.season) {
    const data = _seasonCache[season];
    if (!data) return [];
    return withSeasonCup((cat === 'benjamin' ? data.benjamin : data.prebenjamin) || [], season, cat);
  }
  const cur = cat === 'benjamin'
    ? (typeof BENJAMIN !== 'undefined' ? BENJAMIN : null)
    : (typeof PREBENJAMIN !== 'undefined' ? PREBENJAMIN : null);
  return withSeasonCup(cur || [], PORTAL.season, cat);
}

// Añade la Maspalomas Cup de la categoría a los grupos de 2025-26: es de esa temporada también
// después de activar 2026/27.
export function withSeasonCup(groups, season, cat) {
  if (season === '2025-2026') {
    const cup = cat === 'benjamin'
      ? (typeof MASPALOMAS_CUP_BENJAMIN !== 'undefined' ? MASPALOMAS_CUP_BENJAMIN : null)
      : (typeof MASPALOMAS_CUP_PREBENJAMIN !== 'undefined' ? MASPALOMAS_CUP_PREBENJAMIN : null);
    if (cup && cup.length) groups = groups.concat(cup);
  }
  return groups;
}

// Async — call this before reading a historical season with getData or createModel.
// Single-flight per season; on failure the in-flight promise is cleared so
// a later call (e.g. the "Reintentar" button) refetches. Returns the season
// object, or null as error sentinel (see getSeasonError for the message).
export async function ensureSeasonData(seasonName) {
  if (!seasonName) return null;
  if (_seasonCache[seasonName]) return _seasonCache[seasonName];
  if (_seasonPromise[seasonName]) return _seasonPromise[seasonName];
  _seasonPromise[seasonName] = (async () => {
    try {
      const r = await fetchData(`data-season-${seasonName}.js`);
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
      console.error('[state] ensureSeasonData failed:', seasonName, e);
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

/* On failure both loaders return a null sentinel WITHOUT caching it and
 * clear their single-flight promise, so a later call retries the fetch
 * (a transient network error no longer blanks the feature for the whole
 * session). Callers already null-check (UI empty-state). */
export async function ensureLineups(season) {
  if (_lineups[season] !== undefined) return _lineups[season];
  if (_lineupsPromise[season]) return _lineupsPromise[season];
  _lineupsPromise[season] = (async () => {
    const suffix = _seasonSuffix(season);
    try {
      const r = await fetchData(`data-lineups-${season}.js`);
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
    const suffix = _seasonSuffix(season);
    try {
      const r = await fetchData(`data-players-${season}.js`);
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

// data-health.json (spec §4.10 y §7): la comprobación de las fuentes, parseada, o null si no
// llega (sin conexión, por ejemplo). Un único vuelo: las llamadas simultáneas comparten la
// petición; un fallo no se memoriza y la siguiente llamada reintenta.
let _health = null;
let _healthPromise = null;
async function loadHealth() {
  try {
    const r = await fetchData('data-health.json');
    if (!r.ok) throw new Error('HTTP ' + r.status);
    _health = JSON.parse(await r.text());
    return _health;
  } catch (e) {
    console.warn('[state] ensureHealth failed:', e.message);
    return null;
  }
}
export async function ensureHealth() {
  if (_health) return _health;
  if (!_healthPromise) _healthPromise = loadHealth().finally(() => { _healthPromise = null; });
  return _healthPromise;
}

// Grupos por fase, ordenados por el número de su nombre (decisión 1: recibe los grupos).
export function getPhases(groups) {
  const map = {};
  (groups || []).forEach(g => {
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

/* Total matches across a set of groups.
 *
 * Current-season groups carry only the LATEST jornada inline — the whole season
 * lives in HISTORY, keyed by group code — so counting their inline matches
 * reports a single matchday as the season total. Pass `hist` (HISTORY) for the
 * current season and it is used as the source for every group that appears
 * there. Groups absent from it (the Maspalomas Cup, which never goes through
 * the DB) do carry all their matches inline and are counted from the group.
 *
 * Pass hist = null for historical seasons: their per-season file already
 * carries every jornada inline, and HISTORY holds CURRENT-season data whose
 * group codes can collide across seasons (see knockoutRoundsSource). */
export function countMatches(groups, hist) {
  let matches = 0;
  (groups || []).forEach(g => {
    const fromHistory = hist && hist[g.id];
    const source = fromHistory || g.jornadas;
    if (!fromHistory && g.matches) matches += g.matches.length;
    else if (source) Object.values(source).forEach(jor => { matches += jor.length; });
  });
  return matches;
}

// Grupos, equipos y partidos de una temporada y categoría (decisión 1: recibe las dos).
export function countStats(season, cat) {
  const data = getData(season, cat);
  const historical = !!season && season !== PORTAL.season;
  const hist = (!historical && typeof HISTORY !== 'undefined') ? HISTORY : null;
  return {
    groups: data.length,
    teams: data.reduce((n, g) => n + (g.standings || []).length, 0),
    matches: countMatches(data, hist),
  };
}

/* `needs` de las pantallas que leen una temporada (spec §5.4): [] si es la del portal o ya
 * está en datasets.seasonRaw; si no, una promesa que la guarda allí, o que rechaza con
 * Error(<qué>) para la caja «No se pudieron cargar los datos de <qué>» del router. La temporada del
 * portal la da el router (needs(params, datasets, { portalSeason })), nunca config.js (R2-1). */
export function seasonNeeds(name, datasets, portalSeason) {
  if (!portalSeason) throw new TypeError('seasonNeeds: falta la temporada del portal');
  if (!name || name === portalSeason || datasets.seasonRaw[name]) return [];
  return [ensureSeasonData(name).then((raw) => {
    if (!raw) throw new Error(`la temporada ${String(name).replace(/^(\d{4})-\d{2}(\d{2})$/, '$1/$2')}`);
    datasets.seasonRaw[name] = raw;
  })];
}
