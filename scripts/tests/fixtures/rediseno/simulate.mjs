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
// `extra` sustituye cualquier campo (golPrebenj, health, seasonRaw…).
export function datasetsFrom(raw, extra = {}) {
  const cups = fixture('cups-2025-2026');
  return {
    benjamin: raw.benjamin, prebenjamin: raw.prebenjamin, history: raw.history,
    golBenj: null, golPrebenj: null, shields: fixture('shields'), seasons: null,
    cupBenjamin: cups.benjamin, cupPrebenjamin: cups.prebenjamin,
    seasonRaw: {}, matchDetail: null, lineups: {}, health: null,
    ...extra,
  };
}
