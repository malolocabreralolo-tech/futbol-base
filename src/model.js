/* Modelo normalizado del rediseño «Acta» (spec §5.3).
 *
 * Puro e importable en Node sin DOM: recibe los datos por parámetro y nunca
 * lee los globales data-* (BENJAMIN, HISTORY…) ni globalThis/window.
 *
 *   Row    { pos, team, pts, pj, g, e, p, gf, gc, dg, retired }
 *   Match  { season, groupId, roundKey, dateISO, time, venue, home, away,
 *            hs, as, advancer, shootout }
 *   Round  { key, label, n, dateFrom, dateTo, matches: Match[] }
 *   Group  { season, id, cat, name, fullName, phase, island, url, standingsKind,
 *            kind, compKey, label, standings: Row[], rounds: Round[], currentRound }
 *   Season { name, current, groups: Group[] }     Cups { season, groups: Group[] }
 *
 * El estado de un partido depende del día: no se guarda en Match, se pide a
 * matchState(match, todayISO).
 */
import {
  isCupGroup, isRoundRobinCup, knockoutRoundLabel, matchAdvancer, sortJornadaKeys, jornadaNumber,
} from './state.js';
import { fixtureISO } from './links.js';

const ROW_LENGTHS = [5, 6, 8, 9];
const SEASON_RE = /^\d{4}-\d{4}$/;
const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

const textOrNull = v => (v == null || String(v).trim() === '' ? null : String(v).trim());
const numberOrNull = v => (typeof v === 'number' && Number.isFinite(v) ? v : null);
const sideOrNull = v => (v === 'home' || v === 'away' ? v : null);
const shootoutOf = v => (typeof v === 'string' && /^\d+-\d+$/.test(v) ? v : null);

/* Las rondas de copa llevan la fecha en la clave («06-06-2026 ( Final )»)
 * aunque la fila venga sin fecha (Copa de Campeones 2025-26 y 2023-24). */
function dateInKey(key) {
  const m = String(key ?? '').match(/\d{2}-\d{2}-\d{4}/);
  return m ? m[0] : '';
}

/* fixtureISO con la temporada explícita, salvo en julio: una fecha de julio sin
 * año es del año final de la temporada (los torneos de verano), no del primero
 * como en fixtureISO, que usa la app actual y no cambia (decisión 18). */
function seasonISO(value, season) {
  const iso = fixtureISO(value, season);
  const noYear = /^\d{1,2}[/-]\d{1,2}$/.test(String(value ?? '').trim());
  if (iso && noYear && iso.slice(5, 7) === '07') return `${season.slice(5)}${iso.slice(4)}`;
  return iso;
}

/* Fecha del partido: la de la fila y, si no trae, la de la clave de ronda. Si
 * la clave trae la fecha completa y la fila solo el día y el mes (DD/MM) de ese
 * mismo día, manda el año de la clave: una final del 14-08-2027 en la
 * temporada 2026-2027 no cae en 2026 (decisión 14). */
function rowDateISO(date, roundKey, season) {
  const own = seasonISO(date, season);
  const fromKey = seasonISO(dateInKey(roundKey), season);
  const dayMonth = /^\d{1,2}\/\d{1,2}$/.test(String(date ?? '').trim());
  if (own && fromKey && dayMonth && own.slice(5) === fromKey.slice(5)) return fromKey;
  return own ?? fromKey;
}

function checkSeason(season, fn) {
  // fixtureISO toma PORTAL.season por defecto: sin temporada explícita, el
  // año saldría de config.js, que cambia al activar la temporada siguiente.
  if (!SEASON_RE.test(String(season))) throw new TypeError(`${fn}: temporada no válida (${season})`);
}

/* Fila por posición, el formato único de §5.3:
 *   [fecha, local, visitante, gl, gv, pen, hora, campo, tanda?]
 * Acepta 5 (temporadas antiguas), 6 (cuadros antiguos), 8 (HISTORY y
 * temporadas pasadas) y 9 columnas (cuadros de la Maspalomas). La fila en
 * línea de 7 columnas tiene otro orden: se lee con inlineRowToMatch. */
export function rowToMatch(row, { season, groupId, roundKey } = {}) {
  if (!Array.isArray(row) || !ROW_LENGTHS.includes(row.length)) {
    throw new RangeError(`rowToMatch: fila de ${Array.isArray(row) ? row.length : typeof row} columnas; se aceptan 5, 6, 8 y 9`);
  }
  checkSeason(season, 'rowToMatch');
  const [date, home, away, hs, as, pen, time, venue, shootout] = row;
  return {
    season,
    groupId,
    roundKey,
    dateISO: rowDateISO(date, roundKey, season),
    time: textOrNull(time),
    venue: textOrNull(venue),
    home,
    away,
    hs: numberOrNull(hs),
    as: numberOrNull(as),
    advancer: sideOrNull(pen),
    shootout: shootoutOf(shootout),
  };
}

/* Fila en línea de la fase de grupos de la Maspalomas (y de las `matches`
 * de la jornada en curso): [día, hora, local, visitante, gl, gv, campo]. */
export function inlineRowToMatch(row, { season, groupId, roundKey } = {}) {
  if (!Array.isArray(row) || row.length !== 7) {
    throw new RangeError(`inlineRowToMatch: fila de ${Array.isArray(row) ? row.length : typeof row} columnas; se esperan 7`);
  }
  const [date, time, home, away, hs, as, venue] = row;
  return rowToMatch([date, home, away, hs, as, null, time, venue], { season, groupId, roundKey });
}

/* Un solo detector de copa (spec §5.3): une isCupGroup (código PCC/BC/MCP/MCB
 * o fase con «copa», «campeon» o «maspalomas») con lo que solo miraba
 * isKnockoutGroup de render.js (código …KO o todas las rondas «Ronda N»), y
 * aplica la regla del embudo de isRoundRobinCup a las rondas ya ordenadas. */
export function groupKind(raw, rounds = []) {
  const id = String((raw && raw.id) || '').toUpperCase();
  const keys = rounds.map(r => r.key);
  const cup = isCupGroup(raw) || id.endsWith('KO')
    || (keys.length > 0 && keys.every(k => /ronda/i.test(k)));
  if (!cup) return 'league';
  const jornadas = Object.fromEntries(rounds.map(r => [r.key, r.matches]));
  return isRoundRobinCup(jornadas) ? 'cup-league' : 'cup-bracket';
}

/* Estado de un partido (spec §5.3). dateISO ya salió de seasonISO con la
 * temporada del grupo. «sin fecha» y «sin resultado» nunca son «pendiente». */
export function matchState(match, todayISO) {
  if (!ISO_DATE_RE.test(String(todayISO))) throw new TypeError(`matchState: hoy debe ser AAAA-MM-DD (${todayISO})`);
  if (match.hs != null && match.as != null) return 'jugado';
  if (!match.dateISO) return 'sin fecha';
  return match.dateISO >= todayISO ? 'pendiente' : 'sin resultado';
}

/* 'Jornada N' si la clave es numérica ('5', 'Jornada 5'); si no, la clave sin
 * la fecha ni los paréntesis ('14-06-2024 ( Ronda 1 )' → 'Ronda 1'). */
function roundLabel(key) {
  const n = jornadaNumber(key);
  if (n !== null) return `Jornada ${n}`;
  const bare = String(key).replace(/\d{2}-\d{2}-\d{4}/, '').replace(/[()]/g, ' ').replace(/\s+/g, ' ').trim();
  return bare || String(key);
}

/* De dónde salen las jornadas de un grupo:
 * - temporada actual: HISTORY[id], nunca las `matches` en línea, que solo
 *   traen la jornada en curso;
 * - temporadas pasadas y cuadros de la Maspalomas: `jornadas`;
 * - fase de grupos de la Maspalomas: `matches` en línea, en una sola ronda. */
function roundSource(raw, current, history) {
  if (current) return { jornadas: (history && history[raw.id]) || {}, inline: false };
  if (raw.jornadas && typeof raw.jornadas === 'object') return { jornadas: raw.jornadas, inline: false };
  if (Array.isArray(raw.matches) && raw.matches.length) {
    return { jornadas: { [textOrNull(raw.jornada) || 'Fase de Grupos']: raw.matches }, inline: true };
  }
  return { jornadas: {}, inline: false };
}

/* La ronda que la fuente marca como en curso (`jornada` en la temporada
 * actual y en los torneos, `current_jornada` en las pasadas), si existe. */
function currentRoundKey(raw, rounds) {
  const cur = textOrNull(raw.jornada ?? raw.current_jornada);
  if (!cur) return null;
  const exact = rounds.find(r => r.key === cur);
  if (exact) return exact.key;
  const n = jornadaNumber(cur);
  const byNumber = n === null ? null : rounds.find(r => r.n === n);
  return byNumber ? byNumber.key : null;
}

/* [pos, equipo, pts, J, G, E, P, GF, GC, DF] → Row. */
function standingRow(r) {
  return {
    pos: numberOrNull(r[0]),
    team: r[1],
    pts: numberOrNull(r[2]),
    pj: numberOrNull(r[3]),
    g: numberOrNull(r[4]),
    e: numberOrNull(r[5]),
    p: numberOrNull(r[6]),
    gf: numberOrNull(r[7]),
    gc: numberOrNull(r[8]),
    dg: numberOrNull(r[9]),
    retired: false,
  };
}

export function buildGroup(raw, { season, cat, current = false, history = null } = {}) {
  checkSeason(season, 'buildGroup');
  const { jornadas, inline } = roundSource(raw, current, history);
  const toMatch = inline ? inlineRowToMatch : rowToMatch;
  const rounds = sortJornadaKeys(Object.keys(jornadas)).map(key => ({
    key,
    label: null,
    n: jornadaNumber(key),
    dateFrom: null,
    dateTo: null,
    matches: (jornadas[key] || []).map(row => toMatch(row, { season, groupId: raw.id, roundKey: key })),
  }));
  const kind = groupKind(raw, rounds);
  rounds.forEach((round, idx) => {
    round.label = kind === 'cup-bracket' ? knockoutRoundLabel(round.key, idx, rounds.length) : roundLabel(round.key);
    const dates = round.matches.map(m => m.dateISO).filter(Boolean).sort();
    round.dateFrom = dates.length ? dates[0] : null;
    round.dateTo = dates.length ? dates[dates.length - 1] : null;
  });
  // Quién pasó: solo en los cuadros. matchAdvancer (state.js) usa el marcador,
  // la columna pen o, en un empate sin pen, quién sale en una ronda posterior.
  const order = rounds.map(r => r.key);
  const bracket = kind !== 'cup-bracket' ? null : Object.fromEntries(rounds.map(r =>
    [r.key, r.matches.map(m => [m.dateISO, m.home, m.away, m.hs, m.as, m.advancer])]));
  rounds.forEach((round, idx) => round.matches.forEach((m, i) => {
    m.advancer = bracket ? matchAdvancer(bracket[round.key][i], bracket, order, idx) : null;
  }));
  const group = {
    season,
    id: raw.id,
    cat,
    name: raw.name ?? null,
    fullName: raw.fullName ?? null,
    phase: raw.phase ?? null,
    island: raw.island ?? null,
    url: textOrNull(raw.url),
    standingsKind: raw.standingsKind ?? null,
    kind,
    compKey: null,   // Tarea 4: competitionKey
    label: null,     // Tarea 4: groupLabel
    standings: (raw.standings || []).map(standingRow),
    rounds,
    currentRound: currentRoundKey(raw, rounds),
  };
  return group;
}

/* Temporada de la FIFLP (ligas y copas de ambas categorías). `history`
 * (HISTORY) solo alimenta la temporada actual: los códigos se repiten entre
 * temporadas (BCA1 existe en 2024-25 y en 2025-26). */
export function buildSeason({ name, current = false, benjamin = [], prebenjamin = [], history = null } = {}) {
  const opts = cat => ({ season: name, cat, current: !!current, history: current ? history : null });
  return {
    name,
    current: !!current,
    groups: [
      ...(benjamin || []).map(raw => buildGroup(raw, opts('benjamin'))),
      ...(prebenjamin || []).map(raw => buildGroup(raw, opts('prebenjamin'))),
    ],
  };
}

/* Torneos (Maspalomas): capa aparte del Season memorizado. Nunca toman
 * HISTORY: la fase de grupos va en línea y los cuadros en `jornadas`. */
export function buildCups({ season, benjamin = [], prebenjamin = [] } = {}) {
  const opts = cat => ({ season, cat, current: false, history: null });
  return {
    season,
    groups: [
      ...(benjamin || []).map(raw => buildGroup(raw, opts('benjamin'))),
      ...(prebenjamin || []).map(raw => buildGroup(raw, opts('prebenjamin'))),
    ],
  };
}
