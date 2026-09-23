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
