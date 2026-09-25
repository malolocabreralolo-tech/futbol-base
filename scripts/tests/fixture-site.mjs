// Mundos de fixtures para las pruebas de navegador (spec §11): la app real (index.html, src/,
// acta.css, fuentes y escudos) con los datos de las fixtures congeladas en lugar de los data-*.js
// vivos y un PORTAL fijo en lugar de src/config.js. Así los smoke y las capturas no cambian cuando
// el bot publica datos ni al activar 2026/27. El «hoy» se fija con el reloj de Playwright.
// Lo usan interaction-smoke.mjs, render-smoke.mjs (estado D) y capturas.mjs.
import { fixture } from './fixtures/rediseno/load.mjs';
import { currentAt, nextSeasonRaw } from './fixtures/rediseno/simulate.mjs';

export const STORE_KEY = 'futbol-base:v2';
const DEFAULT_TEAM = { cat: 'prebenjamin', groupId: 'PG2', name: 'Las Mesas Hu.' };
const LAS_MESAS_2526 = { name: 'Las Mesas Hu.', season: '2025-2026', cat: 'prebenjamin', groupId: 'PG2' };
const SEASONS_2526 = [{ name: '2025-2026', current: true }, { name: '2024-2025', current: false }, { name: '2023-2024', current: false }];
const SEASONS_2627 = [{ name: '2026-2027', current: true }, { name: '2025-2026', current: false }, { name: '2024-2025', current: false }];
// data-health.json de las fixtures es el del 23/09/2026 (D y E). En los mundos de otro día, sus
// fechas pasan a la víspera, la comprobación de la noche anterior: la frescura de la portada nunca
// es de un día posterior al «hoy» del mundo.
const HEALTH_DAY = '2026-09-23';
function healthOn(today) {
  const health = fixture('health');
  if (today === HEALTH_DAY) return health;
  const eve = new Date(Date.parse(`${today}T00:00:00Z`) - 86400000).toISOString().slice(0, 10);
  return JSON.parse(JSON.stringify(health).replaceAll(HEALTH_DAY, eve));
}

// data-goleadores.js (23/09/2026), copia literal de las filas de PG2 y A2 que usa la portada
// (las mismas que test_rediseno_portada.mjs): las fixtures de B1 no traen goleadores. Son los de fin
// de temporada; a mitad de temporada, scorersAt los reduce a su día.
const GOL = {
  prebenjamin: [{ id: 'PG2', g: 'PREBENJAMIN GC GRUPO 2', s: [
    ['León Rodríguez, Lucas', 'AD Huracán', 50, 20], ['Rodriguez Aloma, Antoine', 'AD Huracán', 27, 19],
    ['De La Rosa Perello, Theo', 'Las Mesas Hu.', 12, 17], ['Santana Santacruz, Agoney', 'Las Mesas Hu.', 11, 21],
    ['Ruiz Aleman, Einar', 'Las Mesas Hu.', 9, 23], ['Hidalgo Camejo, Pablo', 'Las Mesas Hu.', 8, 18],
    ['Medina Hairach, Nadir', 'Las Mesas Hu.', 8, 21], ['Peña Peña, Alejandro', 'Las Mesas Hu.', 6, 20],
    ['Parcero Ramirez, Neyzan', 'Las Mesas Hu.', 5, 17], ['Hernandez Betancor, Yeudiel', 'Las Mesas Hu.', 4, 5],
    ['Falcon Montilla, Mateo', 'Las Mesas Hu.', 3, 21], ['Morales Gonzalez, Daniel', 'Las Mesas Hu.', 1, 16],
    ['Rodriguez Del Rosario, Yadiel', 'Las Mesas Hu.', 1, 21],
  ] }],
  benjamin: [{ id: 'A2', g: 'BENJAMIN SEGUNDA FASE A-G2', s: [
    ['Espiau Chicoy, Alvaro', 'Las Mesas Hu.', 23, 19], ['Espiau Chicoy, Sergio', 'Las Mesas Hu.', 16, 19],
    ['Rodriguez Montesdeoca, Iker', 'Las Mesas Hu.', 13, 16], ['Lorenzo Hernandez, Joel', 'Las Mesas Hu.', 12, 17],
    ['Navarro Melgar, Lucas', 'Las Mesas Hu.', 9, 16], ['Llarena Moreno, Carlos', 'Las Mesas Hu.', 8, 19],
  ] }],
};

// La clasificación de un día de temporada (B12 de la revisión adversarial). La de las fixtures es la
// final; currentAt quita los marcadores desde `today`, pero no la toca, y a una fecha anterior saldrían
// 28 partidos jugados en marzo. Aquí se recalcula con los resultados del calendario hasta ese día: 3
// puntos la victoria y 1 el empate; por puntos, diferencia y goles a favor, y después el orden
// oficial. Los partidos contra un retirado que no está en el calendario (CD Batán en PG2) cuentan 3–0:
// cada equipo tiene los que la clasificación final le cuenta de más (dos en PG2, uno por vuelta), y
// cada uno cuenta cuando el grupo ha jugado su parte de la temporada (el de la ida, tras la jornada
// 15 de 30). El retirado pierde todos esos. Así, al final sale la clasificación oficial, y a mitad
// de temporada la nota de cobertura cuadra (spec §7). La jornada de la fuente pasa a ser la última
// con algún resultado.
const FINAL = fixture('current-2025-2026');
function standingsAt(raw, today) {
  for (const cat of ['benjamin', 'prebenjamin']) {
    for (const group of raw[cat]) {
      const rounds = Object.values(raw.history[group.id] || {});
      if (!rounds.length || !group.standings.length) continue;
      const blank = (team, order) => ({ team, order, pts: 0, pj: 0, g: 0, e: 0, p: 0, gf: 0, gc: 0 });
      const rows = new Map(group.standings.map((row, i) => [row[1], blank(row[1], i)]));
      const add = (team, gf, gc) => {
        if (!rows.has(team)) rows.set(team, blank(team, rows.size));
        const r = rows.get(team);
        r.pj += 1;
        r.gf += gf;
        r.gc += gc;
        if (gf > gc) { r.g += 1; r.pts += 3; } else if (gf === gc) { r.e += 1; r.pts += 1; } else r.p += 1;
      };
      const played = (m) => m[3] != null && m[4] != null;
      for (const matches of rounds) for (const m of matches.filter(played)) { add(m[1], m[3], m[4]); add(m[2], m[4], m[3]); }
      const inCalendar = new Set(rounds.flatMap((matches) => matches.flatMap((m) => [m[1], m[2]])));
      const gone = group.standings.map((row) => row[1]).filter((team) => !inCalendar.has(team));
      if (gone.length === 1) {
        // Los partidos de más de cada equipo en la clasificación final: los que jugó contra el retirado.
        const final = FINAL[cat].find((g) => g.id === group.id);
        const finalPlayed = new Map();
        for (const matches of Object.values(FINAL.history[group.id] || {})) {
          for (const m of matches.filter(played)) for (const team of [m[1], m[2]]) finalPlayed.set(team, (finalPlayed.get(team) || 0) + 1);
        }
        const reached = (index) => rounds[index] && rounds[index].some(played);
        for (const row of final ? final.standings : []) {
          if (!inCalendar.has(row[1])) continue;
          const extra = Math.max(0, row[3] - (finalPlayed.get(row[1]) || 0));
          for (let k = 1; k <= extra; k++) {
            if (!reached(Math.ceil((k * rounds.length) / extra) - 1)) continue;
            add(row[1], 3, 0);
            add(gone[0], 0, 3);
          }
        }
      }
      const order = [...rows.values()].sort((a, b) => (gone.includes(a.team) - gone.includes(b.team)) || (b.pts - a.pts)
        || ((b.gf - b.gc) - (a.gf - a.gc)) || (b.gf - a.gf) || (a.order - b.order));
      group.standings = order.map((r, i) => [i + 1, r.team, r.pts, r.pj, r.g, r.e, r.p, r.gf, r.gc, r.gf - r.gc]);
      const lastKey = Object.keys(raw.history[group.id]).filter((key) => raw.history[group.id][key].some(played)).pop();
      if (lastKey) group.jornada = lastKey;
    }
  }
  return raw;
}
const seasonAt = (today) => standingsAt(currentAt(today), today);

// Los goleadores de un día (B12): las fixtures no guardan su evolución. Mientras su equipo no ha
// terminado, los goles y los partidos de cada uno se reducen en la proporción de partidos que el
// equipo lleva jugados (los partidos, al menos 1 y nunca más que los del equipo), y se ordenan por
// goles. Una aproximación verosímil, como la clasificación de los demás equipos.
function scorersAt(raw) {
  const played = (groups, id, team) => groups.find((g) => g.id === id)?.standings.find((row) => row[1] === team)?.[3] ?? null;
  const scale = (cat) => GOL[cat].map((entry) => ({
    ...entry,
    s: entry.s.map(([name, team, goals, games]) => {
      const now = played(raw[cat], entry.id, team);
      const end = played(FINAL[cat], entry.id, team);
      if (now === null || !end || now >= end) return [name, team, goals, games];
      return [name, team, Math.round((goals * now) / end), Math.max(1, Math.min(now, Math.round((games * now) / end)))];
    }).filter((row) => row[2] > 0).sort((a, b) => b[2] - a[2]),
  }));
  return { benjamin: scale('benjamin'), prebenjamin: scale('prebenjamin') };
}

// Los mundos con nombre. today: el día en Canarias; current(): la temporada del portal en crudo;
// myTeam: lo que hay guardado (null: almacén vacío, el equipo por defecto); fail: ficheros que
// responden 503.
export const WORLDS = {
  // 01/03/2026: a mitad de temporada, Las Mesas en A (próximo partido en la jornada 18).
  A: { today: '2026-03-01', portalSeason: '2025-2026', current: () => seasonAt('2026-03-01') },
  // 01/10/2026 con 2026/27 activada y sin nada jugado: B.
  B: { today: '2026-10-01', portalSeason: '2026-2027',
    current: () => nextSeasonRaw({ benjamin: ['A1', 'B2', 'FF15'], prebenjamin: ['PG2', 'PG3'] }), gol: false },
  // 03/06/2026: Las Mesas ya jugó la jornada 30 y el grupo no ha terminado: C.
  C: { today: '2026-06-03', portalSeason: '2025-2026', current: () => seasonAt('2026-06-03') },
  // 23/09/2026, los datos de hoy: D con la caja de la temporada siguiente (data-health pendiente).
  D: { today: '2026-09-23', portalSeason: '2025-2026', current: () => fixture('current-2025-2026') },
  // D con «Las Mesas Hu. B» de FF13 guardado: la filial cambia de nombre y se pregunta (E, caso 2b).
  E: { today: '2026-09-23', portalSeason: '2025-2026', current: () => fixture('current-2025-2026'),
    myTeam: { name: 'Las Mesas Hu. B', season: '2025-2026', cat: 'benjamin', groupId: 'FF13' } },
  // 2026/27 sin Las Mesas: X.
  X: { today: '2026-10-01', portalSeason: '2026-2027', current: () => nextSeasonRaw({ benjamin: ['A1'], prebenjamin: ['PG3'] }),
    myTeam: LAS_MESAS_2526, gol: false },
};

// Los ficheros que sirve un mundo, por su nombre (sin ?v=): el cuerpo y su tipo.
function files(w) {
  const raw = w.current();
  const cups = fixture('cups-2025-2026');
  const past = fixture('historical-2024-2025');
  const gol = w.gol === false ? { benjamin: [], prebenjamin: [] } : scorersAt(raw);
  const next = w.portalSeason === '2026-2027' ? '2027-2028' : '2026-2027';
  const js = (pairs) => ({ type: 'text/javascript', body: pairs.map(([name, value]) => `const ${name}=${JSON.stringify(value)};`).join('\n') + '\n' });
  return {
    'src/config.js': { type: 'text/javascript', body: `export const PORTAL = ${JSON.stringify({ season: w.portalSeason, nextSeason: next, defaultTeam: DEFAULT_TEAM, timeZone: 'Atlantic/Canary' }, null, 2)};\n` },
    'data-benjamin.js': js([['BENJAMIN', raw.benjamin]]),
    'data-prebenjamin.js': js([['PREBENJAMIN', raw.prebenjamin]]),
    'data-history.js': js([['HISTORY', raw.history]]),
    'data-goleadores.js': js([['GOL_BENJ', gol.benjamin], ['GOL_PREBENJ', gol.prebenjamin]]),
    'data-matchdetail-keys.js': js([['MATCH_DETAIL_KEYS', {}]]),
    'data-shields.js': js([['SHIELDS', fixture('shields')]]),
    'data-stats.js': js([['STATS', {}]]),
    'data-seasons.js': js([['SEASONS', w.portalSeason === '2026-2027' ? SEASONS_2627 : SEASONS_2526]]),
    'data-maspalomas-cup-2026.js': js([['MASPALOMAS_CUP_BENJAMIN', cups.benjamin], ['MASPALOMAS_CUP_PREBENJAMIN', cups.prebenjamin]]),
    'data-season-2024-2025.js': js([['SEASON_2024_2025', { name: '2024-2025', current: false, benjamin: past.benjamin, prebenjamin: past.prebenjamin }]]),
    'data-matchdetail.js': js([['MATCH_DETAIL', fixture('matchdetail')]]),
    'data-lineups-2025-2026.js': js([['LINEUPS_2025_2026', fixture('lineups-2025-2026')]]),
    'data-health.json': { type: 'application/json', body: JSON.stringify(healthOn(w.today)) },
  };
}

// Instala el mundo `name` en un contexto de Playwright: rutas de los datos y de config.js (el resto
// lo sirve el servidor estático de siempre), el reloj en su día (a mediodía de Canarias) y, si el
// mundo lo trae, mi equipo guardado. `fail`: ficheros que responden 503 (la caja de error).
export async function useWorld(context, name, { fail = [] } = {}) {
  const w = WORLDS[name];
  if (!w) throw new Error(`mundo desconocido: ${name}`);
  const served = files(w);
  await context.route(/\/(src\/config\.js|data-[\w.-]+\.(?:js|json))(\?.*)?$/, (route) => {
    const path = new URL(route.request().url()).pathname.replace(/^\//, '');
    if (fail.includes(path)) return route.fulfill({ status: 503, contentType: 'text/plain', body: 'no disponible' });
    const file = served[path];
    return file ? route.fulfill({ status: 200, contentType: file.type, body: file.body })
      : route.fulfill({ status: 404, contentType: 'text/plain', body: 'no está en el mundo de fixtures' });
  });
  await context.clock.setFixedTime(new Date(`${w.today}T12:00:00Z`));
  if (w.myTeam) {
    await context.addInitScript(([key, value]) => {
      try { if (!localStorage.getItem(key)) localStorage.setItem(key, value); } catch { /* almacén bloqueado */ }
    }, [STORE_KEY, JSON.stringify({ myTeam: w.myTeam, recent: [] })]);
  }
  return w;
}
