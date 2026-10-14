// Temporadas simuladas a partir de las fixtures congeladas (nunca de los data-*.js vivos).
import { fixture } from './load.mjs';

// Fechas de HISTORY: 'AAAA-MM-DD', o 'DD-MM-AAAA' en Fuerteventura; '' si no hay.
const iso = date => {
  const m = String(date || '').match(/^(\d{2})-(\d{2})-(\d{4})$/);
  return m ? `${m[3]}-${m[2]}-${m[1]}` : String(date || '');
};

// La temporada 2025-2026 congelada tal como estaba el día `todayISO`: los partidos
// de ese día en adelante pierden el marcador y quedan pendientes (el mismo día, un
// partido todavía es `pendiente`, como en matchState). La clasificación no se toca.
export function currentAt(todayISO) {
  const raw = structuredClone(fixture('current-2025-2026'));
  for (const rounds of Object.values(raw.history)) {
    for (const rows of Object.values(rounds)) {
      for (const row of rows) if (iso(row[0]) >= todayISO) { row[3] = null; row[4] = null; }
    }
  }
  return raw;
}

// 2026-2027 simulada con grupos congelados: mismas jornadas un año después, sin marcadores
// y con la clasificación a cero en el orden de la fuente.
export function nextSeasonRaw({ benjamin = [], prebenjamin = [] }) {
  const raw = structuredClone(fixture('current-2025-2026'));
  const pick = (groups, ids) => ids.map(id => groups.find(group => group.id === id));
  const out = { season: '2026-2027', benjamin: pick(raw.benjamin, benjamin), prebenjamin: pick(raw.prebenjamin, prebenjamin), history: {} };
  for (const group of [...out.benjamin, ...out.prebenjamin]) {
    group.jornada = 'Jornada 1';
    group.matches = [];
    group.standings = group.standings.map(([pos, team]) => [pos, team, 0, 0, 0, 0, 0, 0, 0, 0]);
    out.history[group.id] = Object.fromEntries(Object.entries(raw.history[group.id]).map(([key, rows]) => [key, rows.map(row => {
      const date = iso(row[0]);
      return [date && `${Number(date.slice(0, 4)) + 1}${date.slice(4)}`, row[1], row[2], null, null, ...row.slice(5)];
    })]));
  }
  return out;
}

// Todos los nombres de equipo de temporadas y torneos ya construidos (Season o Cups).
export function teamNames(...collections) {
  const names = new Set();
  for (const { groups } of collections) {
    for (const group of groups) {
      for (const row of group.standings) names.add(row.team);
      for (const round of group.rounds) for (const match of round.matches) { names.add(match.home); names.add(match.away); }
    }
  }
  return [...names];
}

// El registro de datos de B2 (`datasets` del esqueleto: los nueve globales de readGlobals más
// seasonRaw, matchDetail, lineups y health) a partir de una temporada cruda de las fixtures
// (current-2025-2026, currentAt o nextSeasonRaw), con los escudos y los torneos congelados.
// health es undefined, como en app.js: data-health.json sin pedir (null sería «falló»).
// `extra` sustituye cualquier campo (golPrebenj, health, seasonRaw…).
export function datasetsFrom(raw, extra = {}) {
  const cups = cupsRaw();
  return {
    benjamin: raw.benjamin, prebenjamin: raw.prebenjamin, history: raw.history,
    golBenj: null, golPrebenj: null, shields: fixture('shields'), seasons: null,
    cupBenjamin: cups.benjamin, cupPrebenjamin: cups.prebenjamin,
    seasonRaw: {}, matchDetail: null, lineups: {}, health: undefined,
    ...extra,
  };
}

// ─── Fixtures de B3 (decisión 30 del plan B3; las genera build_fixtures_b3.mjs) ───────────────
// Datos crudos, sin nada de src/: los usan las pruebas de Node (con datasetsFor de screens.mjs) y los
// mundos de navegador de fixture-site.mjs, que los sirven como data-*.js.

// Orden por código de grupo, el de los data-*.js de la fuente en los grupos que se unen aquí.
const byCode = (a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);

// Goleadores congelados (gol-2025-2026): el GOL_BENJ y el GOL_PREBENJ de data-goleadores.js del
// 23/09/2026 con solo los grupos de current-2025-2026, en el orden de la fuente (A1, A2, B1, B2, FF13,
// FF15, FF5 y FF9; PG2 y PG3; PFV2 no publica goleadores). Con los nombres de datasets.
export function goleadores() {
  const gol = fixture('gol-2025-2026');
  return { golBenj: gol.benjamin, golPrebenj: gol.prebenjamin };
}

// La temporada 2025-26 cruda (la fixture o currentAt(...)) más la Copa de Campeones
// (campeones-2025-2026): BCA1, BCB1 y BCC1 al final de benjamin, PCC1 al final de prebenjamin y sus
// rondas en history. No modifica `raw`. Sus filas no traen fecha (la de cada ronda va en su clave, del
// 04/06 al 10/06/2026), así que currentAt no les quita el marcador: con un `today` anterior al 04/06
// salen jugadas igual.
export function withChampions(raw = fixture('current-2025-2026')) {
  const champions = fixture('campeones-2025-2026');
  const out = structuredClone(raw);
  for (const cat of ['benjamin', 'prebenjamin']) {
    for (const group of champions[cat]) {
      if (out[cat].some(g => g.id === group.id)) throw new Error(`withChampions: ${group.id} ya está en la temporada`);
      out[cat].push(group);
    }
  }
  out.history = { ...out.history, ...champions.history };
  return out;
}

// Los torneos congelados con la forma de data-maspalomas-cup-2026.js: los de B1 (cups-2025-2026:
// MCB16, MCBK2, MCP3 y MCPK1) y, con `extra`, la Copa Plata de benjamín (MCBK1) y la Copa Oro de
// prebenjamín (MCPK2) de cups-extra-2025-2026, cada categoría por código (en estos seis, el orden de
// la fuente).
export function cupsRaw({ extra = false } = {}) {
  const cups = fixture('cups-2025-2026');
  if (!extra) return cups;
  const more = fixture('cups-extra-2025-2026');
  return {
    benjamin: [...cups.benjamin, ...more.benjamin].sort(byCode),
    prebenjamin: [...cups.prebenjamin, ...more.prebenjamin].sort(byCode),
  };
}

// El archivo congelado de una temporada pasada, con la forma de SEASON_<S> ({ name, current: false,
// benjamin, prebenjamin }): la de datasets.seasonRaw[name] y la de data-season-<S>.js.
// - '2023-2024': historical-2023-2024 (BC1, CFV1, GC3, GC8, SF1 y SF8; sin prebenjamín);
// - '2024-2025': historical-2024-2025 de B1 (P1 y PGC2) más historical-2024-2025-b3 (A1, BCC1, C2,
//   P3 y P9), por código, que es el orden de data-season-2024-2025.js. pastSeasonRaw() de
//   screens.mjs sigue dando solo lo de B1.
export function archive(name) {
  if (name === '2023-2024') return fixture('historical-2023-2024');
  if (name !== '2024-2025') throw new Error(`archive: no hay fixture de la temporada ${name}`);
  const b1 = fixture('historical-2024-2025');
  const b3 = fixture('historical-2024-2025-b3');
  return {
    name, current: false,
    benjamin: [...b1.benjamin, ...b3.benjamin].sort(byCode),
    prebenjamin: [...b1.prebenjamin, ...b3.prebenjamin].sort(byCode),
  };
}

// Las actas congeladas de una temporada, lo que ensureLineups deja en datasets.lineups[season]: en
// 2025-26, las 44 de A1 (lineups-2025-2026) y las 7 de FF1 (lineups-2025-2026-ff1), sin claves
// comunes; en las demás, {} (ensureLineups da {} con un 404).
export function lineupsFor(season) {
  if (season !== '2025-2026') return {};
  return { ...fixture('lineups-2025-2026'), ...fixture('lineups-2025-2026-ff1') };
}

// Las actas van por grupo (data-lineups-<S>-<grupo>.js): lo que ensureLineups(season, group) deja en
// datasets.lineups[`${season}/${group}`], las entradas congeladas de su `gr` (también dentro de las
// {dup}); {} si el grupo no tiene ninguna (un 404).
export function groupLineups(season, group, lineups = lineupsFor(season)) {
  const out = {};
  for (const [key, entry] of Object.entries(lineups || {})) {
    const list = (entry && entry.dup ? entry.list || [] : [entry]).filter((e) => e && e.s === season && e.gr === group);
    if (list.length === 1) out[key] = list[0];
    else if (list.length > 1) out[key] = { dup: true, list };
  }
  return out;
}

// Los grupos con actas congeladas de una temporada: A1 y FF1 en 2025-26.
export function lineupGroups(season, lineups = lineupsFor(season)) {
  const groups = new Set();
  for (const entry of Object.values(lineups || {})) {
    for (const e of entry && entry.dup ? entry.list || [] : [entry]) if (e && e.s === season) groups.add(e.gr);
  }
  return [...groups].sort();
}

// datasets.lineups con las actas de esos grupos ya cargadas (groupLineups; {} los que no tienen):
// por defecto, todos los de las fixtures de la temporada actual (current-2025-2026, los torneos y los
// que tienen actas), como si se hubiera visitado cada uno.
export function seasonLineups(season, groups = null, lineups = lineupsFor(season)) {
  const raw = fixture('current-2025-2026');
  const cups = cupsRaw({ extra: true });
  const ids = groups || [...new Set([...raw.benjamin, ...raw.prebenjamin, ...cups.benjamin, ...cups.prebenjamin]
    .map((g) => g.id).concat(lineupGroups(season, lineups)))];
  return Object.fromEntries(ids.map((g) => [`${season}/${g}`, groupLineups(season, g, lineups)]));
}

// ─── Alevín (contrato común de alevín, puntos 4 y 5) ────────────────────────────────────────────
// Fixtures sintéticas, sin datos de la fuente: los equipos son clubes con escudo en las fixtures y los
// goleadores, nombres inventados («Uno, Jugador 1»). Nunca nombres de niños de verdad (el repo es público).

// Una liga a una vuelta (método del círculo), con un número par de equipos: una jornada por fila, con
// sus partidos [local, visitante].
function roundRobin(teams) {
  const rest = teams.slice(1);
  return Array.from({ length: teams.length - 1 }, (_, r) => {
    const ring = [teams[0], ...rest.slice(r), ...rest.slice(0, r)];
    return Array.from({ length: teams.length / 2 }, (_, i) => (r % 2
      ? [ring[ring.length - 1 - i], ring[i]] : [ring[i], ring[ring.length - 1 - i]]));
  });
}

// La clasificación de unas filas de 8 columnas: 3 puntos la victoria y 1 el empate; por puntos,
// diferencia, goles a favor y nombre. [[pos, equipo, pts, J, G, E, P, GF, GC, DG]].
function standingsOf(teams, rows) {
  const table = new Map(teams.map((team) => [team, { team, pts: 0, pj: 0, g: 0, e: 0, p: 0, gf: 0, gc: 0 }]));
  const add = (team, gf, gc) => {
    const r = table.get(team);
    r.pj += 1;
    r.gf += gf;
    r.gc += gc;
    if (gf > gc) { r.g += 1; r.pts += 3; } else if (gf === gc) { r.e += 1; r.pts += 1; } else r.p += 1;
  };
  for (const row of rows) if (row[3] != null && row[4] != null) { add(row[1], row[3], row[4]); add(row[2], row[4], row[3]); }
  return [...table.values()]
    .sort((a, b) => b.pts - a.pts || (b.gf - b.gc) - (a.gf - a.gc) || b.gf - a.gf || (a.team < b.team ? -1 : 1))
    .map((r, i) => [i + 1, r.team, r.pts, r.pj, r.g, r.e, r.p, r.gf, r.gc, r.gf - r.gc]);
}

// Los dos grupos de alevín de las fixtures, AL1 y AL2: Las Mesas Hu. juega en AL1 con el mismo nombre
// que en PG2 de prebenjamín (el homónimo de la familia, diseño B1), y Las Mesas B en AL2.
export const ALEVIN_TEAMS = {
  AL1: ['Las Mesas Hu.', 'AD Huracán', 'Acodetti CF', 'Guayarmina', 'Arucas CF', 'Maspalomas'],
  AL2: ['Las Mesas B', 'CD Cerruda', 'Heidelberg', 'La Garita', 'Gran Canaria', 'CD Ingenio'],
};

/* data-alevin.js de las fixtures (contrato, punto 4) para la temporada del portal `season`: las seis
 * constantes, en su orden y con la forma de las de benjamín. AL1 y AL2, «Primera Fase GC», con sus
 * jornadas los días 26/09, 3, 10, 17 y 24/10 del primer año de la temporada; las del día `today` en
 * adelante, sin marcador (pendientes), y la clasificación, la de lo jugado. ESTADOS_ALEV aplaza el primer
 * partido de la jornada 4 de AL1, y EQUIPOS_ALEV trae la equipación de alevín de Las Mesas Hu. */
export function alevinRaw({ season = '2026-2027', today = '2026-10-14' } = {}) {
  const year = Number(season.slice(0, 4));
  const days = [`${year}-09-26`, `${year}-10-03`, `${year}-10-10`, `${year}-10-17`, `${year}-10-24`];
  const groups = [];
  const history = {};
  const gol = [];
  Object.entries(ALEVIN_TEAMS).forEach(([id, teams], k) => {
    const n = k + 1;
    history[id] = Object.fromEntries(roundRobin(teams).map((pairs, r) => [`Jornada ${r + 1}`, pairs.map(([home, away], i) => {
      const played = days[r] < today;
      return [days[r], home, away, played ? (r + 2 * i + k) % 6 : null, played ? (2 * r + i + 1) % 4 : null, null, `${String(9 + i).padStart(2, '0')}:00`, `CAMPO ALEVÍN ${n}`];
    })]));
    const rows = Object.values(history[id]).flat();
    const last = Object.keys(history[id]).filter((key) => history[id][key].some((row) => row[3] != null)).pop() || 'Jornada 1';
    groups.push({ id, name: `Grupo ${n}`, fullName: `ALEVIN PRIMERA FASE GC - GRUPO ${n}`, phase: 'Primera Fase GC',
      island: 'grancanaria', url: '', jornada: last, standings: standingsOf(teams, rows), matches: [] });
    gol.push({ id, g: `ALEVIN PRIMERA FASE GC - GRUPO ${n}`,
      s: [[`Uno, Jugador ${n}`, teams[0], 6 - k, 3], [`Dos, Jugador ${n}`, teams[1], 4, 3], [`Tres, Jugador ${n}`, teams[2], 2, 2]] });
  });
  const [home, away] = roundRobin(ALEVIN_TEAMS.AL1)[3][0];
  return {
    ALEVIN: groups,
    ALEV_STATS: { groups: groups.length, teams: Object.values(ALEVIN_TEAMS).flat().length },
    HISTORY_ALEV: history,
    GOL_ALEV: gol,
    ESTADOS_ALEV: { AL1: { 'Jornada 4': { [`${home}|${away}`]: ['aplazado', 'por lluvia', null] } } },
    EQUIPOS_ALEV: { 'Las Mesas Hu.': ['AZUL CELESTE', 'BLANCO', 'AZULES', 'CAMPO ALEVÍN 1', 'Hierba Artificial (HA)', null] },
  };
}

// El texto de un data-*.js con esas constantes, en su orden: «const NOMBRE=<json>;», una por línea, como
// las escribe generate_js.py.
export function dataFile(consts) {
  return Object.entries(consts).map(([name, value]) => `const ${name}=${JSON.stringify(value)};`).join('\n') + '\n';
}

/* data-season-<S>-alevin.js de las fixtures (contrato, punto 5): { name, alevin, gol: { alevin } }, con la
 * forma de la clave benjamin de data-season-<S>.js. La temporada `name` terminada, con su Segunda Fase:
 * - ALA1, «Segunda Fase A», y ALF1, «Segunda Fase F» (la letra F que la federación publica desde
 *   2026-27, punto 7 de la crítica), con los equipos de AL1 y de AL2, a una vuelta en abril y mayo;
 * - ALEL1, «Eliminatorias»: semifinales y final de los cuatro primeros de ALA1, un cuadro (pantalla
 *   Copa), con un empate que pasa el visitante (la columna pen). */
export function pastAlevinRaw(name = '2025-2026') {
  const end = Number(name.slice(5));
  const days = [`${end}-04-11`, `${end}-04-18`, `${end}-04-25`, `${end}-05-02`, `${end}-05-09`];
  const league = (id, phase, teams, n) => {
    const jornadas = Object.fromEntries(roundRobin(teams).map((pairs, r) => [String(r + 1), pairs.map(([home, away], i) =>
      [days[r], home, away, (r + i + n) % 5, (r * 2 + i) % 3, null, '10:00', `CAMPO ALEVÍN ${n}`])]));
    return { id, name: 'Grupo 1', fullName: `ALEVIN ${phase.toUpperCase()} - GRUPO 1`, phase, island: 'grancanaria',
      current_jornada: '5', standings: standingsOf(teams, Object.values(jornadas).flat()), jornadas };
  };
  const a = league('ALA1', 'Segunda Fase A', ALEVIN_TEAMS.AL1, 1);
  const f = league('ALF1', 'Segunda Fase F', ALEVIN_TEAMS.AL2, 2);
  const [w1, w2, w3, w4] = a.standings.map((row) => row[1]);
  const semis = `16-05-${end} ( Semifinales )`;
  const final = `23-05-${end} ( Final )`;
  const el = {
    id: 'ALEL1', name: 'Grupo 1', fullName: 'ALEVIN ELIMINATORIAS - GRUPO 1', phase: 'Eliminatorias', island: 'grancanaria',
    current_jornada: final, standings: [],
    jornadas: {
      [semis]: [['', w1, w4, 3, 1, null, '10:00', 'CAMPO ALEVÍN 1'], ['', w2, w3, 2, 2, 'away', '12:00', 'CAMPO ALEVÍN 1']],
      [final]: [['', w1, w3, 4, 2, null, '11:00', 'CAMPO ALEVÍN 1']],
    },
  };
  return { name, alevin: [a, f, el], gol: { alevin: [{ id: 'ALA1', g: 'ALEVIN SEGUNDA FASE A - GRUPO 1', s: [['Cuatro, Jugador', w1, 9, 5]] }] } };
}
