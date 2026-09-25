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
  normalizeTeamName,
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

/* Quién pasó por penaltis una eliminatoria jugada y empatada (spec §4.5 y §9.3): el nombre del
 * equipo, o null. Cada pantalla lo escribe a su manera: el nombre completo o teamShort, con la
 * tanda o sin ella (I2 de la revisión final de B2: antes, tres copias de la condición). */
export function penaltyWinner(match) {
  if (match.hs == null || match.as == null || match.hs !== match.as) return null;
  return match.advancer === 'home' ? match.home : match.advancer === 'away' ? match.away : null;
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
    compKey: competitionKey({ ...raw, cat }, season).key,
    label: groupLabel({ ...raw, cat, season }),
    standings: (raw.standings || []).map(standingRow),
    rounds,
    currentRound: currentRoundKey(raw, rounds),
  };
  const retired = retiredTeams(group);
  group.standings.forEach(row => { row.retired = retired.has(row.team); });
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

/* ── Competición y etiqueta de grupo (spec §5.3 y §4.7) ────────────────────
 *
 * competitionKey(raw, season) → { cat, island, division, phase, cup, key, label }
 *   division: 'preferente' | 'primera' | 'unica' | null
 *   phase:    'primera-fase' | 'segunda-fase' | 'segunda-a'…'segunda-e' |
 *             'fase-1' | 'fase-2' | 'oro' | 'plata' | 'bronce' | null
 *   cup:      'campeones' | 'insular' | 'maspalomas' | null
 *   key:      clave de la competición para #/ligas?f= (única en su temporada
 *             y categoría; sin categoría ni temporada, que van en c y s)
 *   label:    nombre legible de la competición, sin categoría ni grupo
 * Una fase que no está en la tabla sale sin clasificar (division null), con
 * una clave 'otra-…' (tras la isla, fuera de Gran Canaria) y la fase de la
 * fuente como nombre: una fase nueva no rompe la interfaz, pero ninguna prueba
 * la detecta, porque phases.json está congelada. Además, myteam.js le da nivel
 * 1, el de la Primera Fase: una «Tercera Fase» nunca provocaría un cambio de
 * fase. Por eso docs/temporada-nueva.md pide comprobar a mano, tras activar
 * una temporada, que ninguna fase cae en 'otra-…'. */

const ISLAND_NAMES = { grancanaria: 'Gran Canaria', lanzarote: 'Lanzarote', fuerteventura: 'Fuerteventura' };
const CAT_NAMES = { benjamin: 'Benjamín', prebenjamin: 'Prebenjamín' };
const upperFirst = s => s.charAt(0).toUpperCase() + s.slice(1);
const foldText = s => String(s ?? '').normalize('NFD').replace(/\p{M}/gu, '')
  .toLowerCase().replace(/\s+/g, ' ').trim();
const slugOf = s => foldText(s).replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
const seasonEndYear = season => (/^\d{4}-(\d{4})$/.exec(String(season)) || [])[1] || '';

/* Tabla de equivalencias. Cubre las 29 fases reales de la base (56
 * combinaciones de temporada, categoría y fase entre 2021-22 y 2025-26, en
 * phases.json) y la Maspalomas Cup. Se lee sobre la fase sin tildes y en
 * minúsculas, y manda la primera regla que casa. Cada regla da los ejes que
 * no son los de por defecto (division 'unica', phase null, cup null) y:
 *   name:   nombre legible, sin categoría ni isla ('' = la liga de la isla);
 *   cupKey: parte de copa de la clave;
 *   group:  sustituye al nombre del grupo en la etiqueta ('' lo omite). */
const PHASE_TABLE = [
  // «Maspalomas Cup» (fase de grupos y cuadros) → «Maspalomas Cup 2026»
  [/maspalomas/, (m, raw, season) => ({
    cup: 'maspalomas', cupKey: 'maspalomas', name: `Maspalomas Cup ${seasonEndYear(season)}`.trim(),
  })],
  // «Copa de Campeones» (2023-24 y 2025-26) y «Copa Campeones Benjamin A…E»
  // (2024-25): una sola competición; en 2024-25 la letra es la fase del grupo.
  [/^copa (?:de )?campeones(?: (?:pre)?benjamin)?(?: ([a-e]))?$/, m => ({
    cup: 'campeones', cupKey: 'copa-campeones', name: 'Copa de Campeones',
    ...(m[1] ? { group: `Fase ${m[1].toUpperCase()}` } : {}),
  })],
  // «Copa Cabildo Preferente Lanzarote» y «Copa Cabildo Primera Lanzarote» (2023-24)
  [/^copa cabildo (preferente|primera)\b/, m => ({
    cup: 'insular', cupKey: 'copa-cabildo', division: m[1], name: `Copa Cabildo ${upperFirst(m[1])}`,
  })],
  // «Copa Delegación Fuerteventura» (2022-23)
  [/^copa delegacion\b/, () => ({ cup: 'insular', cupKey: 'copa-delegacion', name: 'Copa Delegación' })],
  // «Copa Fuerteventura» (2022-23 y 2023-24) y cualquier otra copa insular
  [/^copa\b/, (m, raw) => ({ cup: 'insular', cupKey: 'copa', name: String(raw.phase).trim() })],
  // «Segunda Fase A GC»…«E GC» (2024-25) y «Segunda Fase A»…«C» (2025-26)
  [/^segunda fase ([a-e])\b/, m => ({ phase: `segunda-${m[1]}`, name: `Segunda Fase ${m[1].toUpperCase()}` })],
  // «Segunda Fase GC» (2023-24: 14 grupos sin letra)
  [/^segunda fase\b/, () => ({ phase: 'segunda-fase', name: 'Segunda Fase' })],
  // «Primera Fase GC»: en prebenjamín (2021-22 a 2023-24) es la liga de Gran
  // Canaria, la misma que luego se llama «Gran Canaria»; en benjamín 2021-22 y
  // 2022-23 es la división Primera, bajo «Preferente GC»; desde 2023-24, la
  // primera fase, antes de la Segunda Fase.
  [/^primera fase\b/, (m, raw, season, cat) => {
    if (cat === 'prebenjamin') return {};
    return String(season) <= '2022-2023'
      ? { division: 'primera', name: 'Primera' }
      : { phase: 'primera-fase', name: 'Primera Fase' };
  }],
  // «Fase 1 Fuerteventura» (2023-24, 2024-25), «Fuerteventura Fase 1» (2025-26), «Fase 2 Fuerteventura»
  [/\bfase ([12])\b/, m => ({ phase: `fase-${m[1]}`, name: `Fase ${m[1]}` })],
  // «Preferente GC» (2021-22, 2022-23) y «Preferente Lanzarote»
  [/^preferente\b/, () => ({ division: 'preferente', name: 'Preferente' })],
  // «Primera Lanzarote»
  [/^primera\b/, () => ({ division: 'primera', name: 'Primera' })],
  // La liga de la isla: «Gran Canaria», «Lanzarote» y «Fuerteventura». En
  // benjamín de Fuerteventura 2025-26 el nivel va en el nombre del grupo
  // («Liga Oro», «Liga Plata», «Liga Bronce»), que pasa a ser la competición.
  [/^(?:gran canaria|lanzarote|fuerteventura)$/, (m, raw) => {
    const level = foldText(raw.name).match(/^liga (oro|plata|bronce)$/);
    return level ? { phase: level[1], name: `Liga ${upperFirst(level[1])}`, group: '' } : {};
  }],
];

/* La categoría del grupo: `cat` si viene, y si no, la de fullName (los
 * grupos crudos de data-*.js no la llevan). */
function catOfGroup(raw) {
  const c = foldText(raw && raw.cat);
  if (c === 'benjamin' || c === 'prebenjamin') return c;
  const full = foldText(raw && raw.fullName);
  if (full.includes('prebenjamin')) return 'prebenjamin';
  return full.includes('benjamin') ? 'benjamin' : null;
}

function classifyPhase(raw, season) {
  const cat = catOfGroup(raw);
  const island = (raw && raw.island) || null;
  const phase = foldText(raw && raw.phase);
  for (const [re, make] of PHASE_TABLE) {
    const m = phase.match(re);
    if (m) {
      return { cat, island, known: true, division: 'unica', phase: null, cup: null, name: '', ...make(m, raw, season, cat) };
    }
  }
  return { cat, island, known: false, division: null, phase: null, cup: null, name: String((raw && raw.phase) || '').trim() };
}

/* « de <isla>» si la isla no es Gran Canaria o si no hay otro calificativo, y
 * nunca si el texto ya la nombra («Copa Fuerteventura»). */
function islandSuffix(c, qualifier, textSoFar) {
  const isla = ISLAND_NAMES[c.island];
  if (!isla || textSoFar.includes(isla)) return '';
  return c.island !== 'grancanaria' || !qualifier ? ` de ${isla}` : '';
}

export function competitionKey(raw, season) {
  const c = classifyPhase(raw, season);
  const islandPart = c.island && c.island !== 'grancanaria' ? c.island : null;
  const parts = c.known
    ? [islandPart, c.division !== 'unica' ? c.division : null, c.phase, c.cupKey || null]
    : [islandPart, `otra-${slugOf(c.name) || 'fase'}`];
  const key = parts.filter(Boolean).join('-') || c.island || 'sin-isla';
  const label = c.name
    ? c.name + islandSuffix(c, c.name, c.name)
    : (ISLAND_NAMES[c.island] || c.island || '');
  return { cat: c.cat, island: c.island, division: c.division, phase: c.phase, cup: c.cup, key, label };
}

/* «Prebenjamín, Grupo 2 de Gran Canaria», «Benjamín, Segunda Fase A, Grupo 2».
 * Recibe un Group o un grupo crudo con {season, cat, phase, island, name}. */
export function groupLabel(group) {
  const c = classifyPhase(group, group.season);
  const groupPart = c.group !== undefined ? c.group : String(group.name ?? '').trim();
  const base = [CAT_NAMES[c.cat] || '', c.name, groupPart].filter(Boolean).join(', ');
  return base + islandSuffix(c, c.name, base);
}

// ─── Análisis de grupo (spec §4.2, §4.3, §4.4, §4.7, §5.3 y §7) ─────────────

function playedMatch(m) {
  return m.hs != null && m.as != null;
}

function groupMatches(group) {
  return (group.rounds || []).flatMap(round => round.matches);
}

/* Partidos del grupo en orden de fecha (seasonISO, ya en m.dateISO). Un
 * partido sin fecha toma la primera fecha de su jornada o, si la jornada no
 * tiene ninguna, la última conocida; a igual fecha manda el orden de jornada
 * y de fila. Así los grupos antiguos de Fuerteventura y Lanzarote, con
 * partidos jugados sin fecha, no se desordenan. */
function chronologicalMatches(group) {
  const items = [];
  let carry = '';
  (group.rounds || []).forEach((round, ri) => {
    const first = round.matches.map(m => m.dateISO).filter(Boolean).sort()[0] || carry;
    round.matches.forEach((m, mi) => items.push({ m, key: m.dateISO || first, ri, mi }));
    carry = first;
  });
  items.sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0) || a.ri - b.ri || a.mi - b.mi);
  return items.map(item => item.m);
}

/* Resultados jugados de un equipo, sin los partidos contra retirados, en
 * orden cronológico y desde su punto de vista:
 * {match, letter: 'G'|'E'|'P', gf, gc, rival, side: 'casa'|'fuera'}.
 * Es el criterio común de seasonSummary y lastResults; homeAwayTable y
 * bestStreaks aplican los mismos filtros en una sola pasada. */
function teamResults(group, team, retired) {
  const out = [];
  for (const match of chronologicalMatches(group)) {
    if (!playedMatch(match) || (match.home !== team && match.away !== team)) continue;
    const home = match.home === team;
    const rival = home ? match.away : match.home;
    if (retired.has(rival)) continue;
    const gf = home ? match.hs : match.as;
    const gc = home ? match.as : match.hs;
    out.push({ match, letter: gf > gc ? 'G' : gf === gc ? 'E' : 'P', gf, gc, rival, side: home ? 'casa' : 'fuera' });
  }
  return out;
}

/* Balance {pj, g, e, p, gf, gc, pts} de una lista de resultados {gf, gc}. */
function recordOf(results) {
  const rec = { pj: results.length, g: 0, e: 0, p: 0, gf: 0, gc: 0, pts: 0 };
  for (const { gf, gc } of results) {
    if (gf > gc) rec.g += 1;
    else if (gf === gc) rec.e += 1;
    else rec.p += 1;
    rec.gf += gf;
    rec.gc += gc;
  }
  rec.pts = rec.g * 3 + rec.e;
  return rec;
}

/* Única definición de retirado (spec §5.3). «Grupo terminado» en la regla de
 * pj = 0 no puede depender de hoy (la firma no lo recibe): cuenta como
 * terminado el grupo cuya última jornada ya tiene algún resultado. */
export function retiredTeams(group) {
  const rounds = group.rounds || [];
  const standings = group.standings || [];
  const inCalendar = new Set();
  const withResult = new Set();
  rounds.forEach(round => round.matches.forEach(m => {
    inCalendar.add(m.home);
    inCalendar.add(m.away);
    if (playedMatch(m)) {
      withResult.add(m.home);
      withResult.add(m.away);
    }
  }));
  const lastRound = rounds[rounds.length - 1];
  const finished = Boolean(lastRound && lastRound.matches.some(playedMatch));
  const retired = new Set();
  for (const row of standings) {
    if (withResult.has(row.team)) continue;
    const gone = !inCalendar.has(row.team) && row.pj > 0 && row.g + row.e === 0;
    if (gone || (row.pj === 0 && finished)) retired.add(row.team);
  }
  if (standings.length && withResult.size) {
    const listed = new Set(standings.map(row => row.team));
    for (const team of inCalendar) {
      if (!listed.has(team) && !withResult.has(team)) retired.add(team);
    }
  }
  return retired;
}

function liveMatch(retired) {
  return m => !retired.has(m.home) && !retired.has(m.away);
}

/* Estado D (§4.2): ningún partido pendiente (sin contar los de retirados) y,
 * además, temporada distinta de la del portal o a partir del 1 de junio del
 * año final. */
export function groupFinished(group, todayISO, portalSeason) {
  const live = liveMatch(retiredTeams(group));
  if (groupMatches(group).some(m => live(m) && matchState(m, todayISO) === 'pendiente')) return false;
  if (group.season !== portalSeason) return true;
  return todayISO >= `${String(group.season).split('-')[1]}-06-01`;
}

/* §4.3: la jornada del primer partido pendiente por fecha (a igual fecha, la
 * primera jornada), para que un aplazado no devuelva una jornada vieja; si no
 * hay pendientes, la última con resultados; si tampoco, la primera. */
export function defaultRound(group, todayISO) {
  const rounds = group.rounds || [];
  const live = liveMatch(retiredTeams(group));
  let next = null, nextDate = null;
  for (const round of rounds) {
    for (const m of round.matches) {
      if (!live(m) || matchState(m, todayISO) !== 'pendiente') continue;
      if (nextDate === null || m.dateISO < nextDate) {
        next = round;
        nextDate = m.dateISO;
      }
    }
  }
  if (next) return next;
  const withResults = rounds.filter(round => round.matches.some(playedMatch));
  return withResults[withResults.length - 1] || rounds[0] || null;
}

/* Equipos activos: los de la clasificación (en su orden) o, si llega vacía,
 * los del calendario; nunca los retirados. */
function activeTeams(group, retired) {
  const standings = group.standings || [];
  const names = standings.length
    ? standings.map(row => row.team)
    : [...new Set(groupMatches(group).flatMap(m => [m.home, m.away]))];
  return names.filter(team => !retired.has(team));
}

/* Moda de partidos por jornada; en empate, la menor (nunca inventa «faltan»). */
function usualMatchesPerRound(group, live) {
  const freq = new Map();
  for (const round of group.rounds || []) {
    const n = round.matches.filter(live).length;
    freq.set(n, (freq.get(n) || 0) + 1);
  }
  let best = 0, bestFreq = 0;
  for (const [n, f] of freq) {
    if (f > bestFreq || (f === bestFreq && n < best)) {
      best = n;
      bestFreq = f;
    }
  }
  return best;
}

/* Aviso de jornada (§4.3). Los partidos contra retirados no cuentan y los
 * retirados nunca figuran como ausentes. */
export function roundNotice(group, round) {
  const retired = retiredTeams(group);
  const live = liveMatch(retired);
  const matches = round.matches.filter(live);
  const playing = new Set(matches.flatMap(m => [m.home, m.away]));
  const teams = activeTeams(group, retired).filter(team => !playing.has(team));
  const usual = usualMatchesPerRound(group, live);
  if (matches.length < usual) {
    return { kind: 'faltan', teams, retired: [...retired], missing: usual - matches.length };
  }
  if (teams.length) return { kind: 'sin-partido', teams, retired: [...retired], missing: 0 };
  return null;
}

/* Cobertura (§7) de las cifras calculadas con el calendario frente al PJ de
 * la clasificación. `calendar` son los partidos del equipo sin retirados,
 * también los que aún no se han jugado; `withResult`, los que tienen marcador;
 * `vsRetired`, los partidos contra retirados: los del calendario más, si algún
 * retirado no aparece en él (Batán en PG2), los que la clasificación cuenta de
 * más. Eso se mide con los partidos con resultado (pj − withResult), nunca con
 * el calendario entero, que a mitad de temporada trae los futuros; y como
 * mucho son tantos como veces se enfrenta a cualquier otro rival por cada
 * ausente, para no achacarle un marcador que falta. null si los partidos con
 * resultado explican todo el PJ. */
export function coverageNote(team, group) {
  const row = (group.standings || []).find(r => r.team === team);
  const retired = retiredTeams(group);
  if (!row || retired.has(team)) return null;
  const all = groupMatches(group);
  const mine = all.filter(m => m.home === team || m.away === team);
  const rivalOf = m => (m.home === team ? m.away : m.home);
  const calendar = mine.filter(m => !retired.has(rivalOf(m)));
  const withResult = calendar.filter(playedMatch).length;
  if (withResult === row.pj) return null;
  const inCalendar = new Set(all.flatMap(m => [m.home, m.away]));
  const faced = mine.map(rivalOf).filter(rival => retired.has(rival));
  const absent = [...retired].filter(t => !inCalendar.has(t));
  const meetings = new Map();
  for (const m of calendar) meetings.set(rivalOf(m), (meetings.get(rivalOf(m)) || 0) + 1);
  const perRival = Math.max(0, ...meetings.values());
  const extra = absent.length ? Math.min(Math.max(0, row.pj - withResult), absent.length * perRival) : 0;
  const names = [...new Set([...faced, ...(extra ? absent : [])])];
  return { played: row.pj, calendar: calendar.length, vsRetired: faced.length + extra, retired: names, withResult };
}

/* Vistas Casa y Fuera de la Tabla (§4.4), desde el calendario. Mismos equipos
 * que la clasificación oficial (o los del calendario si llega vacía), con
 * `retired` marcado. Orden: retirados al final; luego puntos, diferencia,
 * goles a favor y puesto oficial. Otra condición que 'casa' o 'fuera' lanza
 * RangeError: una errata no enseña la tabla de fuera en silencio. */
export function homeAwayTable(group, side) {
  if (side !== 'casa' && side !== 'fuera') {
    throw new RangeError(`homeAwayTable: condición «${side}» no válida; se acepta 'casa' o 'fuera'`);
  }
  const retired = retiredTeams(group);
  const standings = group.standings || [];
  const names = standings.length ? standings.map(row => row.team) : activeTeams(group, retired);
  const home = side === 'casa';
  const results = new Map(names.map(team => [team, []]));
  for (const m of groupMatches(group)) {
    if (!playedMatch(m) || retired.has(m.home) || retired.has(m.away)) continue;
    const list = results.get(home ? m.home : m.away);
    if (list) list.push(home ? { gf: m.hs, gc: m.as } : { gf: m.as, gc: m.hs });
  }
  const rows = names.map((team, index) => {
    const rec = recordOf(results.get(team));
    return {
      index,
      row: { pos: 0, team, pts: rec.pts, pj: rec.pj, g: rec.g, e: rec.e, p: rec.p, gf: rec.gf, gc: rec.gc, dg: rec.gf - rec.gc, retired: retired.has(team) },
    };
  });
  rows.sort((a, b) => a.row.retired - b.row.retired || b.row.pts - a.row.pts || b.row.dg - a.row.dg
    || b.row.gf - a.row.gf || a.index - b.index);
  return rows.map(({ row }, i) => ({ ...row, pos: i + 1 }));
}

/* «La temporada en cifras» y «Así terminó» (§4.2). Puesto, puntos, balance y
 * goles, de la clasificación; el resto, del calendario sin retirados. best,
 * worst y last tienen la forma de lastResults, o null. */
export function seasonSummary(team, group) {
  const standings = group.standings || [];
  const row = standings.find(r => r.team === team) || null;
  const results = teamResults(group, team, retiredTeams(group));
  const total = recordOf(results);
  let best = null, worst = null;
  for (const r of results) {
    const dg = r.gf - r.gc;
    if (!best || dg > best.gf - best.gc || (dg === best.gf - best.gc && r.gf > best.gf)) best = r;
    if (dg < 0 && (!worst || dg < worst.gf - worst.gc || (dg === worst.gf - worst.gc && r.gc > worst.gc))) worst = r;
  }
  return {
    pos: row ? row.pos : null,
    of: standings.length,
    pts: row ? row.pts : null,
    g: row ? row.g : null,
    e: row ? row.e : null,
    p: row ? row.p : null,
    gf: row ? row.gf : null,
    gc: row ? row.gc : null,
    perMatch: total.pj ? { gf: total.gf / total.pj, gc: total.gc / total.pj } : null,
    home: recordOf(results.filter(r => r.side === 'casa')),
    away: recordOf(results.filter(r => r.side === 'fuera')),
    best,
    worst,
    last: results[results.length - 1] || null,
    coverage: coverageNote(team, group),
  };
}

/* Forma (§4.2 «Últimos cinco», vista Forma de la Tabla y «Contexto» del
 * partido): los `n` últimos resultados de liga del equipo en el grupo, del
 * más antiguo al más reciente, con el criterio de teamResults. En un grupo
 * que no es de liga, ninguno. */
export function lastResults(team, group, n = 5) {
  if (group.kind !== 'league') return [];
  const results = teamResults(group, team, retiredTeams(group));
  return results.slice(Math.max(0, results.length - n));
}

/* Partidos de un equipo en el grupo, sin los que son contra retirados (§4.2):
 * `next`, el primer `pendiente` por fecha (a igual fecha, por jornada), que es
 * el «Próximo partido» de la portada; `last`, el último jugado; y cuántos hay
 * jugados (`played`), sin fecha (`undated`) y todavía sin resultado
 * (`remaining`). Con `remaining` a 0, el equipo ya ha jugado todo su
 * calendario aunque el grupo siga abierto. */
export function teamFixtures(team, group, todayISO) {
  const retired = retiredTeams(group);
  let next = null, last = null, played = 0, undated = 0, remaining = 0;
  for (const m of chronologicalMatches(group)) {
    if ((m.home !== team && m.away !== team) || retired.has(m.home) || retired.has(m.away)) continue;
    const state = matchState(m, todayISO);
    if (state === 'jugado') {
      played += 1;
      last = m;
      continue;
    }
    remaining += 1;
    if (state === 'sin fecha') undated += 1;
    if (state === 'pendiente' && !next) next = m;
  }
  return { next, last, played, undated, remaining };
}

/* Cara a cara (§4.5): los partidos entre `a` y `b` en ese grupo, en los dos
 * sentidos y por fecha. Solo del grupo: nunca mezcla otra fase ni otra
 * categoría (caso 7 de §11). */
export function headToHead(group, a, b) {
  return chronologicalMatches(group)
    .filter(m => (m.home === a && m.away === b) || (m.home === b && m.away === a));
}

/* Récords (§4.7): la mejor racha de victorias y la mejor invicta de cada
 * equipo en cada grupo de liga de la categoría, en orden de fecha. Una
 * entrada por equipo y grupo, de mayor a menor; a igual racha, por nombre y
 * grupo. */
export function bestStreaks(season, cat) {
  const wins = [], unbeaten = [];
  for (const group of season.groups) {
    if (group.cat !== cat || group.kind !== 'league') continue;
    const retired = retiredTeams(group);
    const runs = new Map();
    for (const m of chronologicalMatches(group)) {
      if (!playedMatch(m) || retired.has(m.home) || retired.has(m.away)) continue;
      for (const [team, gf, gc] of [[m.home, m.hs, m.as], [m.away, m.as, m.hs]]) {
        const run = runs.get(team) || { w: 0, u: 0, bestW: 0, bestU: 0 };
        run.w = gf > gc ? run.w + 1 : 0;
        run.u = gf < gc ? 0 : run.u + 1;
        run.bestW = Math.max(run.bestW, run.w);
        run.bestU = Math.max(run.bestU, run.u);
        runs.set(team, run);
      }
    }
    for (const [team, run] of runs) {
      if (run.bestW) wins.push({ team, n: run.bestW, groupId: group.id });
      if (run.bestU) unbeaten.push({ team, n: run.bestU, groupId: group.id });
    }
  }
  const order = (a, b) => b.n - a.n || a.team.localeCompare(b.team, 'es') || a.groupId.localeCompare(b.groupId, 'es');
  return { wins: wins.sort(order), unbeaten: unbeaten.sort(order) };
}

// ─── Nombres (spec §3.5) y cronología (spec §4.5 y §5.3) ─────────────────────

/* «Apellidos, Nombre» → «Nombre Apellidos». Si el texto llega entero en
 * MAYÚSCULAS (actas), cada palabra pasa a mayúscula inicial, también «De» y
 * «La» y cada parte de un compuesto con guion. Nunca añade tildes: solo cambia
 * mayúsculas por minúsculas. El texto con minúsculas se respeta tal cual. */
export function playerName(raw) {
  let text = String(raw ?? '').replace(/\s+/g, ' ').trim();
  const comma = text.indexOf(',');
  if (comma !== -1) {
    text = [text.slice(comma + 1).trim(), text.slice(0, comma).trim()].filter(Boolean).join(' ');
  }
  if (/\p{Lu}/u.test(text) && !/\p{Ll}/u.test(text)) {
    text = text.toLowerCase().replace(/(^|[\s\-.'(])(\p{Ll})/gu, (_, before, letter) => before + letter.toUpperCase());
  }
  return text;
}

const CLUB_ACRONYM = String.raw`(?:U\.?D\.?|C\.?D\.?A?|A\.?D\.?|R\.?C\.?|C\.?F\.?|S\.?D\.?|F\.?C\.?|Real Club|REAL CLUB)`;
const LEADING_ACRONYMS = new RegExp(String.raw`^(?:${CLUB_ACRONYM}\s+)+`);
const TRAILING_ACRONYMS = new RegExp(String.raw`(?:\s+${CLUB_ACRONYM})+$`);

/* Nombre corto para casillas estrechas: quita las siglas del club al
 * principio o al final (UD, CD, AD, RC, CF, C.D., U.D., «Real Club»…) y
 * conserva la letra de filial. La forma de la federación «NOMBRE, C.D. EL "B"»
 * pasa a «EL NOMBRE B»: se queda el artículo y se quita el resto del sufijo.
 * No cambia mayúsculas ni tildes. Si no queda ninguna letra, devuelve el
 * nombre entero («CD 35600»). */
export function teamShort(name) {
  const full = String(name ?? '').replace(/\s+/g, ' ').trim();
  let text = full;
  let filial = '';
  const quoted = text.match(/\s*"([^"]*)"$/);
  if (quoted) {
    if (/^[A-E]$/.test(quoted[1])) filial = quoted[1];
    text = text.slice(0, quoted.index).trim();
  }
  const comma = text.lastIndexOf(',');
  if (comma !== -1) {
    const article = text.slice(comma + 1).trim().match(/(?:^|\s)(EL|LA|LAS|LOS)$/);
    text = (article ? article[1] + ' ' : '') + text.slice(0, comma).trim();
  }
  if (!filial) {
    const letter = text.match(/\s([A-E])$/);
    if (letter) {
      filial = letter[1];
      text = text.slice(0, letter.index);
    }
  }
  text = text.replace(LEADING_ACRONYMS, '').replace(TRAILING_ACRONYMS, '').trim();
  if (!/\p{L}/u.test(text)) return full;
  if (filial && !text.endsWith(' ' + filial)) text += ' ' + filial;
  return text;
}

/* La entrada de la cronología o de las actas que corresponde al partido: la
 * única, o el único elemento de `list`, cuyo (s, gr) es el del partido. */
function entryForMatch(entry, match) {
  if (!entry) return null;
  const list = entry.dup ? entry.list || [] : [entry];
  const hits = list.filter(item => item && item.s === match.season && item.gr === match.groupId);
  return hits.length === 1 ? hits[0] : null;
}

const GOAL_MARK = { o: '(p.p.)', own: '(p.p.)', p: '(p)', penalty: '(p)' };

/* Nombre del goleador para mostrar. La fuente a veces pone el marcador donde
 * va el nombre («0-1»): entonces no hay nombre (null). */
function scorerName(raw, type) {
  const name = playerName(raw);
  if (!name || /^\d+\s*-\s*\d+$/.test(name)) return null;
  const mark = GOAL_MARK[type];
  return mark && !name.includes(mark) ? `${name} ${mark}` : name;
}

/* Goles de un partido (§4.5): la cronología de futbolaspalmas si hay una
 * entrada inequívoca; si no, los goles del acta (sin marcador parcial si le
 * falta algún minuto); si no, null. mismatch compara los goles de cada lado
 * con el marcador: {timeline: 'h-a', score: 'h-a'} si no cuadran. */
export function timelineFor(match, matchDetail, lineups) {
  if (match.hs == null || match.as == null) return null;
  const key = `${match.home}|${match.away}|${match.hs}-${match.as}`;
  const side = s => (s === 'h' ? 'home' : 'away');
  let source, goals;
  const detail = entryForMatch(matchDetail && matchDetail[key], match);
  if (detail) {
    source = 'futbolaspalmas';
    goals = (detail.g || []).map(([minute, name, score, s, type]) => ({
      minute: minute ?? null, score: score || null, side: side(s), name: scorerName(name, type),
    }));
  } else {
    const acta = entryForMatch(lineups && lineups[key], match);
    if (!acta) return null;
    source = 'acta';
    const events = (acta.events || [])
      .map((event, index) => ({ event, index }))
      .filter(({ event }) => event.t === 'goal')
      .sort((a, b) => ((a.event.m ?? Infinity) - (b.event.m ?? Infinity)) || a.index - b.index)
      .map(({ event }) => event);
    const timed = events.every(event => event.m != null);
    let h = 0, a = 0;
    goals = events.map(event => {
      if (event.s === 'h') h += 1; else a += 1;
      return { minute: event.m ?? null, score: timed ? `${h}-${a}` : null, side: side(event.s), name: scorerName(event.n, event.gt) };
    });
  }
  const home = goals.filter(goal => goal.side === 'home').length;
  const away = goals.length - home;
  const mismatch = home === match.hs && away === match.as
    ? null
    : { timeline: `${home}-${away}`, score: `${match.hs}-${match.as}` };
  return { source, goals, mismatch };
}

/* ── Registro de datos y modelo (Plan B2, contrato del esqueleto) ──────────
 *
 * datasets = { ...readGlobals(), seasonRaw: {}, matchDetail: null, lineups: {}, health: undefined }:
 * los globales inmediatos y lo que traen los cargadores perezosos de state.js (health: undefined
 * sin pedir y null si falló). El modelo los lee al pedirlos, así que una temporada pasada aparece
 * en cuanto se guarda en seasonRaw. */

// La Maspalomas Cup es de 2025/26 y lo sigue siendo después de activar 2026/27 («Para B2»).
const CUPS_SEASON = '2025-2026';

// Todos los nombres de equipo de temporadas y torneos ya construidos: clasificación y partidos.
function teamNamesOf(collections) {
  const names = new Set();
  for (const { groups } of collections) {
    for (const group of groups) {
      for (const row of group.standings) names.add(row.team);
      for (const round of group.rounds) for (const match of round.matches) { names.add(match.home); names.add(match.away); }
    }
  }
  return [...names];
}

// buildClubIndex (myteam.js) llega inyectado: myteam.js importa de este módulo, y al revés sería un
// ciclo. Quien no pide clubIndex() no lo necesita (las pantallas reciben el índice ya hecho).
export function createModel(datasets, { portalSeason, buildClubIndex = null } = {}) {
  checkSeason(portalSeason, 'createModel');
  const data = datasets || {};
  const seasons = new Map();
  let cups = null;
  let index = null;
  let indexKey = null;
  const model = {
    // Season memorizada. La del portal, de benjamin, prebenjamin e history; una pasada, de
    // seasonRaw[name] (lo que devuelve ensureSeasonData), o null mientras no esté cargada.
    season(name) {
      if (seasons.has(name)) return seasons.get(name);
      let built = null;
      if (name === portalSeason) {
        built = buildSeason({ name, current: true, benjamin: data.benjamin, prebenjamin: data.prebenjamin, history: data.history });
      } else if (SEASON_RE.test(String(name)) && data.seasonRaw && Object.hasOwn(data.seasonRaw, name) && data.seasonRaw[name]) {
        const raw = data.seasonRaw[name];
        built = buildSeason({ name, current: false, benjamin: raw.benjamin, prebenjamin: raw.prebenjamin });
      }
      if (built) seasons.set(name, built);
      return built;
    },
    group(season, id) {
      const built = model.season(season);
      return (built && built.groups.find(group => group.id === id)) || null;
    },
    // Torneos de 2025-26 (capa aparte, spec §5.3), memorizados en cuanto hay datos; null si no hay.
    cups() {
      if (!cups && (data.cupBenjamin || data.cupPrebenjamin)) {
        cups = buildCups({ season: CUPS_SEASON, benjamin: data.cupBenjamin, prebenjamin: data.cupPrebenjamin });
      }
      return cups;
    },
    // Índice de clubes (spec §6.1) sobre los nombres de las temporadas cargadas y los torneos,
    // con los escudos. Se rehace cuando se carga otra temporada o llegan los torneos.
    clubIndex() {
      const loaded = [portalSeason, ...Object.keys(data.seasonRaw || {}).filter(name => name !== portalSeason).sort()];
      const collections = [...loaded.map(name => model.season(name)).filter(Boolean), model.cups()].filter(Boolean);
      const key = collections.map(collection => collection.name || `torneos ${collection.season}`).join('|');
      if (!index || key !== indexKey) {
        if (typeof buildClubIndex !== 'function') throw new TypeError('createModel: clubIndex() necesita buildClubIndex');
        index = buildClubIndex(teamNamesOf(collections), data.shields || {});
        indexKey = key;
      }
      return index;
    },
    // Goleadores de la temporada actual (GOL_BENJ o GOL_PREBENJ: [{ id, g, s: [[jugador, equipo,
    // goles, partidos]] }]), los que recibe teamScorers; [] en las pasadas, que no los tienen.
    scorers(season, cat) {
      if (season !== portalSeason) return [];
      const gol = cat === 'benjamin' ? data.golBenj : cat === 'prebenjamin' ? data.golPrebenj : null;
      return Array.isArray(gol) ? gol : [];
    },
  };
  return model;
}

/* ── Funciones puras del diseño anterior (spec §5.2, «se mueven») ─────────
 * Vienen de plantilla.js, matchdetail-rich.js, modals.js, filters.js y health.js, que se borraron
 * en el corte (Tarea 4 de B2). Mismo comportamiento y mismas pruebas; filterCompetitionGroups ya no
 * toma el estado S por defecto y sourceInfo devuelve datos en lugar de HTML (decisión 3 de B2). */

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

/* Estadísticas de un jugador a partir de las alineaciones de la temporada. `teamName` es
 * obligatorio en la práctica: sin él se agrega por NOMBRE sobre todas las alineaciones, y un
 * homónimo de otro club suma sus partidos. Una clave repetida ({dup, list}) no cuenta. */
export function aggregatePlayerFromLineups(lineups, player, teamName) {
  let appearances = 0, starters = 0, goals = 0, yellow = 0, red = 0;
  const matches = [];
  const suyo = teamName ? normalizeTeamName(teamName) : null;
  for (const [matchKey, m] of Object.entries(lineups || {})) {
    const partes = String(matchKey).split('|');
    const inHome = (m.home || []).find(p => p.n === player);
    const inAway = (m.away || []).find(p => p.n === player);
    let app = inHome || inAway;
    if (suyo) {
      const enLocal = inHome && normalizeTeamName(partes[0] || '') === suyo;
      const enVisitante = inAway && normalizeTeamName(partes[1] || '') === suyo;
      app = enLocal ? inHome : enVisitante ? inAway : null;
      if (app) {
        matches.push({ matchKey, side: enLocal ? 'home' : 'away', g: app.g | 0, y: app.y | 0, rd: app.rd | 0 });
        appearances += 1;
        if (app.r === 'starter') starters += 1;
        goals += app.g | 0; yellow += app.y | 0; red += app.rd | 0;
      }
      continue;
    }
    if (!app) continue;
    appearances += 1;
    if (app.r === 'starter') starters += 1;
    goals += app.g | 0;
    yellow += app.y | 0;
    red += app.rd | 0;
    matches.push({ matchKey, side: inHome ? 'home' : 'away', g: app.g | 0, y: app.y | 0, rd: app.rd | 0 });
  }
  return { appearances, starters, goals, yellow, red, matches };
}

// Eventos del acta por minuto; los que no tienen minuto, al final.
export function mergeAndOrderEvents(events) {
  const arr = (events || []).slice();
  arr.sort((a, b) => {
    const ma = (a.m == null) ? 1e9 : a.m;
    const mb = (b.m == null) ? 1e9 : b.m;
    return ma - mb;
  });
  return arr;
}

/* De dónde salen los partidos de un grupo según la temporada. Los códigos se repiten entre
 * temporadas (A1 está en 2024-25 y en HISTORY de 2025-26), así que:
 *   - temporada pasada (state.season no vacío): las `jornadas` del propio grupo, nunca HISTORY,
 *     y sin rachas (stats: null, solo son de la actual);
 *   - temporada actual: HISTORY[groupId] y, si no está (copas), las `jornadas` del grupo.
 * Las dos formas son { 'Jornada N': [[fecha, local, visitante, gl, gv], …] }. */
export function resolveSeasonDataset(state, opts) {
  opts = opts || {};
  const group = opts.group || null;
  const historical = !!(state && state.season);
  const groupJornadas =
    (group && group.jornadas && typeof group.jornadas === 'object'
     && !Array.isArray(group.jornadas)) ? group.jornadas : null;
  if (historical) {
    return { historical: true, matchSource: groupJornadas || {}, stats: null };
  }
  const history = opts.history || null;
  const groupId = opts.groupId != null ? opts.groupId : (group && group.id);
  const fromHistory = (history && groupId != null) ? history[groupId] : null;
  return {
    historical: false,
    matchSource: fromHistory || groupJornadas || {},
    stats: opts.stats || null,
  };
}

// Grupos crudos por isla, fase y nombre de club (normalizado). `state`: { search, filterIsland, filterPhase }.
export function filterCompetitionGroups(groups, state = {}) {
  const query = normalizeTeamName(state.search || '');
  return groups.filter(group => (!state.filterIsland || group.island === state.filterIsland)
    && (!state.filterPhase || group.phase === state.filterPhase)
    && (!query || (group.standings || []).some(row => normalizeTeamName(row[1]).includes(query))));
}

/* Procedencia de la clasificación (spec §4.4; decisión 3 de B2): datos, no HTML.
 *   kind:   'oficial' (la de la fuente tal cual), 'calculada' (reconstruida con los resultados) o
 *           'corregida' (con los puntos corregidos), según standingsKind;
 *   source: el dominio de la fuente («futbolaspalmas.com»), o null sin URL;
 *   url:    la de la fuente, solo http o https, o null.
 * En una temporada pasada (historical) no hay enlace: la URL de la fuente es la de la actual. */
const SOURCE_KINDS = { reconstructed: 'calculada', corrected: 'corregida' };
export function sourceInfo(group, historical = false) {
  const kind = SOURCE_KINDS[group && group.standingsKind] || 'oficial';
  const m = historical ? null : String((group && group.url) || '').match(/^https?:\/\/(?:www\.)?([^/?#:@\s]+)/i);
  return { kind, source: m ? m[1].toLowerCase() : null, url: m ? group.url : null };
}

// «2025-2026» → «2025/26», la forma de las temporadas en pantalla; lo demás, tal cual.
export function seasonLabel(season) {
  return String(season ?? '').replace(/^(\d{4})-\d{2}(\d{2})$/, '$1/$2');
}

// La ronda de un partido en su grupo (la de su clave, match.roundKey), o null.
export function roundOf(group, match) {
  return (group.rounds || []).find((round) => round.key === match.roundKey) || null;
}

// La ronda `r` de un grupo (§4.1): la de esa clave (Round.key) o, si no hay, la del mismo número
// («30» o «Jornada 30» en un enlace escrito a mano o antiguo; las claves '1'…'14' de PFV2). null si
// no hay ninguna. La usan el router (una jornada que la pantalla sabe leer no se quita) y Jornada.
export function findRound(group, r) {
  if (r == null || r === '') return null;
  const rounds = group.rounds || [];
  const exact = rounds.find((round) => round.key === r);
  if (exact) return exact;
  const n = jornadaNumber(r);
  return n === null ? null : rounds.find((round) => round.n === n) || null;
}

// (r, h, a) identifica un partido del grupo: en su ronda (findRound) y, si ahí no está, el único
// partido de h contra a del grupo (un enlace con otra jornada). null si no hay ninguno o hay dos.
// La usan el router y la pantalla Partido.
export function findMatch(group, { r, h, a } = {}) {
  const round = findRound(group, r);
  const inRound = round ? round.matches.find((m) => m.home === h && m.away === a) : null;
  if (inRound) return inRound;
  const all = (group.rounds || []).flatMap((x) => x.matches.filter((m) => m.home === h && m.away === a));
  return all.length === 1 ? all[0] : null;
}

// El grupo de una ruta (spec §4.1): de la temporada (ligas y copas de la federación) o, si no está
// ahí, de los torneos (Cups de esa temporada, como la Maspalomas Cup). null si la temporada no está
// cargada o si no hay ningún grupo con ese id en ninguno de los dos sitios. Una sola regla para el
// router (qué rutas acepta) y la pantalla Partido (qué grupo pinta): antes eran dos copias literales
// que podían divergir.
export function findGroup(model, season, id) {
  const group = model.group(season, id);
  if (group) return group;
  const cups = model.cups();
  return cups && cups.season === season ? cups.groups.find((g) => g.id === id) || null : null;
}

/* El acta de la federación de un partido (spec §4.5, «Alineaciones»): la
 * entrada de LINEUPS_<S> con el mismo criterio que timelineFor, la única cuya
 * (s, gr) es la del partido. null si no hay marcador, si no hay entrada o si
 * la entrada es de otro partido con la misma clave. */
export function actaFor(match, lineups) {
  if (match.hs == null || match.as == null || !lineups) return null;
  return entryForMatch(lineups[`${match.home}|${match.away}|${match.hs}-${match.as}`], match);
}

/* ── Ficha de Equipo: evolución de puntos y plantilla (spec §4.6; decisiones 12 y 13 de B3) ── */

/* Evolución de puntos: los puntos acumulados del equipo tras cada jornada del grupo, en su orden,
 * desde el calendario y con el criterio de teamResults (sin los partidos contra retirados). Un
 * partido cuenta en su jornada, aunque se jugara más tarde (un aplazado). [{ roundKey, label, pts }],
 * con `pts` null en las jornadas posteriores a la última con algún resultado del grupo (por jugar). */
export function pointsProgression(team, group) {
  const rounds = group.rounds || [];
  const retired = retiredTeams(group);
  let last = -1;
  rounds.forEach((round, i) => { if (round.matches.some(playedMatch)) last = i; });
  let pts = 0;
  return rounds.map((round, i) => {
    for (const m of round.matches) {
      if (!playedMatch(m) || (m.home !== team && m.away !== team)) continue;
      const home = m.home === team;
      if (retired.has(home ? m.away : m.home)) continue;
      const gf = home ? m.hs : m.as;
      const gc = home ? m.as : m.hs;
      pts += gf > gc ? 3 : gf === gc ? 1 : 0;
    }
    return { roundKey: round.key, label: round.label, pts: i <= last ? pts : null };
  });
}

// Las actas de los partidos del equipo en el grupo, en orden de fecha: la entrada de su (s, gr)
// (actaFor, también dentro de las {dup}). Un acta con un lado vacío no cuenta para nadie: las 10
// de Goleta en A1 traen al rival en `home` y `away` vacío. `side` es el lado del equipo.
function teamActas(lineups, group, team) {
  const list = [];
  let skipped = 0;
  for (const match of chronologicalMatches(group)) {
    if (match.home !== team && match.away !== team) continue;
    const acta = actaFor(match, lineups);
    if (!acta) continue;
    const full = side => Array.isArray(acta[side]) && acta[side].length > 0;
    if (!full('home') || !full('away')) skipped += 1;
    else list.push({ match, acta, side: match.home === team ? 'home' : 'away' });
  }
  return { list, skipped };
}

// Las actas del grupo en esas alineaciones, con o sin el equipo (la plantilla solo sale si hay).
function groupActas(lineups, group) {
  let n = 0;
  for (const entry of Object.values(lineups || {})) {
    for (const item of entry && entry.dup ? entry.list || [] : [entry]) {
      if (item && item.s === group.season && item.gr === group.id) n += 1;
    }
  }
  return n;
}

/* Plantilla de un equipo en su grupo, desde las actas de la federación (LINEUPS_<S>), nunca desde
 * PLAYERS_<S> (§4.6): { rows, actas, skipped, groupActas }.
 * - rows: [{ name, dorsal, ap, st, g, y, rd }] (partidos, de titular, goles y tarjetas), por goles,
 *   partidos y nombre. El dorsal es el más repetido en sus actas y, si empatan, el de la más reciente;
 *   en A1, 42 jugadores llevan más de uno.
 * - actas: las del equipo que cuentan; skipped: las suyas con un lado vacío, que no cuentan;
 *   groupActas: las del grupo, de cualquier equipo. */
export function teamSquad(lineups, { group, team }) {
  const { list, skipped } = teamActas(lineups, group, team);
  const players = new Map();
  list.forEach(({ acta, side }, at) => {
    for (const p of acta[side]) {
      const row = players.get(p.n) || { name: p.n, dorsals: new Map(), ap: 0, st: 0, g: 0, y: 0, rd: 0 };
      row.ap += 1;
      if (p.r === 'starter') row.st += 1;
      row.g += p.g | 0;
      row.y += p.y | 0;
      row.rd += p.rd | 0;
      if (p.dn != null) row.dorsals.set(p.dn, { n: (row.dorsals.get(p.dn)?.n || 0) + 1, at });
      players.set(p.n, row);
    }
  });
  const dorsalOf = dorsals => [...dorsals].sort(([, a], [, b]) => b.n - a.n || b.at - a.at)[0]?.[0] ?? null;
  const rows = [...players.values()].map(({ name, dorsals, ap, st, g, y, rd }) => ({ name, dorsal: dorsalOf(dorsals), ap, st, g, y, rd }));
  rows.sort((a, b) => b.g - a.g || b.ap - a.ap || playerName(a.name).localeCompare(playerName(b.name), 'es'));
  return { rows, actas: list.length, skipped, groupActas: groupActas(lineups, group) };
}

/* Los partidos de un jugador del equipo en el grupo, en orden de fecha, desde las mismas actas que
 * la plantilla: [{ match, side, goals }], con `match` el partido del modelo (su marcador y su enlace)
 * y `side` el lado de su equipo, para dar el marcador desde su equipo (§4.6). */
export function playerMatches(lineups, { group, team, player }) {
  return teamActas(lineups, group, team).list.flatMap(({ match, acta, side }) => {
    const p = acta[side].find(x => x.n === player);
    return p ? [{ match, side, goals: p.g | 0 }] : [];
  });
}

/* ¿Hay alguna tarjeta en las actas de la temporada? La columna de tarjetas de la plantilla solo sale
 * entonces (§4.6); hoy la fuente no las recoge y no hay ninguna. */
export function anyCards(lineups) {
  return Object.values(lineups || {}).some(entry => (entry && entry.dup ? entry.list || [] : [entry])
    .some(acta => acta && [...(acta.home || []), ...(acta.away || [])].some(p => (p.y | 0) + (p.rd | 0) > 0)));
}

/* ── Explorar y Ligas (Plan B3, Tareas 6 y 7; spec §4.7) ──────────────────
 *
 * phaseLevel(group) → 1 | 2                 el nivel de su fase («la fase más alta», decisión 17)
 * topPhase(entries) → entries               de unos { group, … }, los de la fase más alta
 * searchKey(text) → texto plegado            lo que compara el buscador
 * searchTeams(model, season, query) → { leagues: [{ name, cat, group }], cups: [{ name, cat, group }] }
 * competitions(model, season, { cat, island }) → [{ cat, key, label, kind: 'liga'|'copa', groups }]
 * groupSummary(group) → { label, teams, round, leader, champion }
 */

/* Nivel de la fase de un grupo: 2 para la Segunda Fase (con letra o sin ella), la Fase 2 de
 * Fuerteventura y sus ligas Oro, Plata y Bronce, que se juegan después de la primera fase; 1 para
 * todo lo demás. Es la regla de «la fase más alta» de mi equipo (myteam.js), del buscador y del orden
 * de las competiciones: vive aquí porque model.js no puede importar de myteam.js (sería un ciclo).
 * Memorizado por identidad del objeto Group: el valor sale solo del propio grupo (su fase, vía
 * competitionKey), y el WeakMap no retiene los grupos que ya no se usan. */
const PHASE_LEVEL = {
  'segunda-fase': 2, 'segunda-a': 2, 'segunda-b': 2, 'segunda-c': 2, 'segunda-d': 2, 'segunda-e': 2,
  'fase-2': 2, oro: 2, plata: 2, bronce: 2,
};
const levels = new WeakMap();
export function phaseLevel(group) {
  if (!levels.has(group)) levels.set(group, PHASE_LEVEL[competitionKey(group, group.season).phase] ?? 1);
  return levels.get(group);
}

/* De una lista de { group, … }, los de la fase más alta (phaseLevel): la regla de los candidatos de mi
 * equipo y de su trayectoria (myteam.js), y del buscador de Explorar (decisión 37). */
export function topPhase(entries) {
  const top = Math.max(...entries.map(entry => phaseLevel(entry.group)));
  return entries.filter(entry => phaseLevel(entry.group) === top);
}

const CAT_ORDER = ['benjamin', 'prebenjamin'];
const ISLAND_ORDER = ['grancanaria', 'lanzarote', 'fuerteventura'];
// Dentro de un nivel y una isla: la división, la fase y la copa, de la primera a la última de la
// temporada (la Liga Oro antes que la Plata; la Preferente antes que la Primera). La fuente ordena los
// grupos por su código (FB, FO, FP), y ese orden no sirve.
const DIVISION_ORDER = ['preferente', 'primera', 'unica'];
const PHASE_ORDER = ['segunda-fase', 'segunda-a', 'segunda-b', 'segunda-c', 'segunda-d', 'segunda-e', 'fase-2',
  'oro', 'plata', 'bronce', 'primera-fase', 'fase-1', null];
const CUP_ORDER = [null, 'campeones', 'insular', 'maspalomas'];
const rankOf = (list, value) => (list.includes(value) ? list.indexOf(value) : list.length);
// Orden de nombres sin tildes ni mayúsculas, el mismo en todos los motores (sin datos de idioma).
function byName(a, b) {
  const x = foldText(a), y = foldText(b);
  return x < y ? -1 : x > y ? 1 : a < b ? -1 : a > b ? 1 : 0;
}
// Orden natural: las cifras como números («Grupo 2» antes que «Grupo 10»).
function naturalOrder(a, b) {
  const x = foldText(a).match(/\d+|\D+/g) || [];
  const y = foldText(b).match(/\d+|\D+/g) || [];
  for (let i = 0; i < Math.min(x.length, y.length); i++) {
    if (x[i] === y[i]) continue;
    if (/^\d/.test(x[i]) && /^\d/.test(y[i])) return Number(x[i]) - Number(y[i]);
    return x[i] < y[i] ? -1 : 1;
  }
  return x.length - y.length;
}
// El nombre de un grupo dentro de su competición: «Grupo 2», «Fase A» (la letra de la Copa de
// Campeones de 2024-25, que la fuente llama «Grupo 1»), «Copa Oro», «Liga Oro».
function shortLabel(group) {
  const c = classifyPhase(group, group.season);
  const own = c.group !== undefined ? c.group : String(group.name ?? '').trim();
  return own || String(group.name ?? '').trim() || group.id;
}

/* El texto que compara el buscador: sin tildes, en minúsculas y con cada tramo que no es letra o
 * cifra en un espacio («Las Mesas Hu.» → «las mesas hu»). */
export function searchKey(text) {
  return foldText(text).replace(/[^a-z0-9]+/g, ' ').trim();
}

/* Los equipos de una temporada o de los torneos, una sola vez: [{ name, key, bare, group }], de la
 * clasificación y del calendario de cada grupo, en el orden de los grupos. `key` es searchKey(name)
 * y `bare`, normalizeTeamName(name) (sin las siglas del club: «UD Las Mesas Huracán» → «las mesas
 * huracan»). Memorizado por la colección: el modelo memoriza sus Season y sus Cups. */
const teamLists = new WeakMap();
function teamList(collection) {
  if (!teamLists.has(collection)) {
    const out = [];
    for (const group of collection.groups) {
      const names = new Set(group.standings.map(row => row.team));
      for (const round of group.rounds) for (const m of round.matches) { names.add(m.home); names.add(m.away); }
      for (const name of names) {
        if (typeof name === 'string' && name.trim()) out.push({ name, key: searchKey(name), bare: normalizeTeamName(name), group });
      }
    }
    teamLists.set(collection, out);
  }
  return teamLists.get(collection);
}

/* Buscador de Explorar (spec §4.7; decisión 17 de B3). Busca `query` por nombre normalizado, desde 2
 * letras, en los grupos de las dos categorías de la temporada y, si son de esa temporada, en los
 * torneos (model.cups()). Un nombre casa si contiene la búsqueda plegada (searchKey) o, sin las
 * siglas del club, la búsqueda sin ellas (normalizeTeamName: «ud las mesas» encuentra «Las Mesas Hu.»).
 * - leagues: los grupos de liga, uno por nombre y categoría, en el de la fase más alta (la regla de
 *   topPhase de mi equipo); dos grupos de esa fase con el mismo nombre son dos equipos (Santa Brígida en
 *   B1 y B2), y salen los dos. Abren #/equipo.
 * - cups: los grupos que no son de liga (Copa de Campeones, copas insulares y torneos), uno por nombre y
 *   grupo. Abren #/copa.
 * Orden (decisión 166 de B3): primero los nombres que empiezan por la búsqueda, después los que tienen
 * una palabra que empieza por ella y después el resto (searchKey: «la» pone «Las Mesas Hu.» antes que
 * «UD Las Mesas Huracán», y los dos antes que «Atalaya B»); dentro, por nombre; a igual nombre, de
 * benjamín a prebenjamín, y después en el orden de los grupos. */
export function searchTeams(model, season, query) {
  const key = searchKey(query);
  if (key.length < 2) return { leagues: [], cups: [] };
  const bare = normalizeTeamName(String(query ?? ''));
  const built = model.season(season);
  const cups = model.cups();
  const hits = [...(built ? teamList(built) : []), ...(cups && cups.season === season ? teamList(cups) : [])]
    .filter(entry => entry.key.includes(key) || (bare.length >= 2 && entry.bare.includes(bare)));
  const byTeam = new Map();
  for (const hit of hits) {
    if (hit.group.kind !== 'league') continue;
    const id = `${hit.group.cat}|${hit.name}`;
    byTeam.set(id, [...(byTeam.get(id) || []), hit]);
  }
  const leagues = [...byTeam.values()].flatMap(list => topPhase(list));
  const tier = entry => (entry.key.startsWith(key) ? 0 : ` ${entry.key}`.includes(` ${key}`) ? 1 : 2);
  const order = (a, b) => tier(a) - tier(b) || byName(a.name, b.name) || rankOf(CAT_ORDER, a.group.cat) - rankOf(CAT_ORDER, b.group.cat);
  const out = list => list.sort(order).map(({ name, group }) => ({ name, cat: group.cat, group }));
  return { leagues: out(leagues), cups: out(hits.filter(hit => hit.group.kind !== 'league')) };
}

/* Competiciones de una temporada (spec §4.7; decisión 18 de B3): una entrada por categoría y clave
 * (Group.compKey), con su nombre (el label de competitionKey), si es liga o copa y sus grupos. Entran
 * los grupos de la temporada y, si son de esa temporada, los torneos.
 * - kind: 'copa' en la Copa de Campeones, las copas insulares y los torneos (competitionKey.cup); si
 *   no, 'liga'.
 * - Orden: benjamín y prebenjamín; en cada una, las ligas y después las copas; dentro, la fase más
 *   alta primero, después Gran Canaria, Lanzarote y Fuerteventura, y después la división, la fase y la
 *   copa (PHASE_ORDER…) y el nombre.
 * - Los grupos, en orden natural de su nombre («Grupo 2» antes que «Grupo 10»).
 * - cat e island filtran; sin ellos, todas. Una temporada sin cargar da []. */
export function competitions(model, season, { cat = null, island = null } = {}) {
  const built = model.season(season);
  const cups = model.cups();
  const groups = [...(built ? built.groups : []), ...(cups && cups.season === season ? cups.groups : [])];
  const entries = new Map();
  for (const group of groups) {
    if ((cat && group.cat !== cat) || (island && group.island !== island)) continue;
    const id = `${group.cat}|${group.compKey}`;
    if (!entries.has(id)) {
      const ck = competitionKey(group, group.season);
      entries.set(id, { ck, cat: group.cat, key: group.compKey, label: ck.label, kind: ck.cup ? 'copa' : 'liga', level: phaseLevel(group), groups: [] });
    }
    entries.get(id).groups.push(group);
  }
  const rank = e => [rankOf(CAT_ORDER, e.cat), e.kind === 'liga' ? 0 : 1, -e.level, rankOf(ISLAND_ORDER, e.ck.island),
    rankOf(DIVISION_ORDER, e.ck.division), rankOf(PHASE_ORDER, e.ck.phase), rankOf(CUP_ORDER, e.ck.cup)];
  return [...entries.values()]
    .sort((a, b) => {
      const x = rank(a), y = rank(b);
      const i = x.findIndex((v, k) => v !== y[k]);
      return i >= 0 ? x[i] - y[i] : byName(a.label, b.label);
    })
    .map(e => ({
      cat: e.cat, key: e.key, label: e.label, kind: e.kind,
      groups: e.groups.map(g => [shortLabel(g), g]).sort((a, b) => naturalOrder(a[0], b[0]) || naturalOrder(a[1].id, b[1].id)).map(([, g]) => g),
    }));
}

/* Un grupo en una línea (Ligas y la Copa de Campeones de Explorar; decisión 20 de B3):
 * - label: su nombre dentro de la competición («Grupo 2», «Fase A», «Copa Oro», «Liga Oro»);
 * - teams: los equipos de su clasificación o, sin ella (los cuadros de la Maspalomas), los del calendario;
 * - round: la etiqueta de la ronda en curso que marca la fuente («Jornada 22», «Final»), o null;
 * - leader: el 1.º de la clasificación, en ligas y liguillas, si ya ha jugado; si no, null;
 * - champion: en un cuadro, quien pasó en la final (su único partido de la última ronda); si no, null. */
export function groupSummary(group) {
  const rounds = group.rounds || [];
  const standings = group.standings || [];
  const round = group.currentRound ? rounds.find(r => r.key === group.currentRound) : null;
  const inCalendar = new Set(rounds.flatMap(r => r.matches.flatMap(m => [m.home, m.away])).filter(Boolean));
  const last = rounds[rounds.length - 1];
  const final = group.kind === 'cup-bracket' && last && last.matches.length === 1 ? last.matches[0] : null;
  const first = standings[0];
  return {
    label: shortLabel(group),
    teams: standings.length || inCalendar.size,
    round: round ? round.label : null,
    leader: group.kind !== 'cup-bracket' && first && first.pj > 0 ? first.team : null,
    champion: final && final.advancer ? (final.advancer === 'home' ? final.home : final.away) : null,
  };
}

/* «Comparar grupos» de Ligas (spec §4.7 y §4.11; decisión 21 de B3), la comparativa de prebenjamín de
 * la app anterior para cualquier competición: la clasificación oficial de sus grupos de liga en una
 * sola tabla, por puntos por partido (pts / pj; 0 sin partidos) y, a igualdad, por puntos, diferencia
 * de goles y nombre. Los retirados, al final. Los grupos que no son de liga no entran.
 * → [{ team, groupId, groupLabel, pj, pts, ppj, dg, retired }], con groupLabel el de groupSummary. */
export function compareGroups(groups) {
  const rows = (groups || []).filter(group => group.kind === 'league').flatMap(group => {
    const groupLabel = shortLabel(group);
    return group.standings.map(row => {
      const pj = row.pj ?? 0;
      const pts = row.pts ?? 0;
      return { team: row.team, groupId: group.id, groupLabel, pj, pts, ppj: pj ? pts / pj : 0, dg: row.dg ?? 0, retired: Boolean(row.retired) };
    });
  });
  return rows.sort((a, b) => (a.retired - b.retired) || (b.ppj - a.ppj) || (b.pts - a.pts) || (b.dg - a.dg) || byName(a.team, b.team));
}
