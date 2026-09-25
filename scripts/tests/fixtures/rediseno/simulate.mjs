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
