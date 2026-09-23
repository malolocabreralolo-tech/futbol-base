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
 *   division: 'preferente' | 'primera' | 'unica'
 *   phase:    'primera-fase' | 'segunda-fase' | 'segunda-a'…'segunda-e' |
 *             'fase-1' | 'fase-2' | 'oro' | 'plata' | 'bronce' | null
 *   cup:      'campeones' | 'insular' | 'maspalomas' | null
 *   key:      clave de la competición para #/ligas?f= (única en su temporada
 *             y categoría; sin categoría ni temporada, que van en c y s)
 *   label:    nombre legible de la competición, sin categoría ni grupo
 * Una fase que no está en la tabla sale sin clasificar (division null), con
 * una clave 'otra-…' y la fase de la fuente como nombre: una fase nueva no
 * rompe la interfaz, y el test de phases.json la detecta. */

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
 * goles a favor y puesto oficial. */
export function homeAwayTable(group, side) {
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
