// Mundos de fixtures para las pruebas de navegador (spec §11): la app real (index.html, src/,
// acta.css, fuentes y escudos) con los datos de las fixtures congeladas en lugar de los data-*.js
// vivos y un PORTAL fijo en lugar de src/config.js. Así los smoke y las capturas no cambian cuando
// el bot publica datos ni al activar 2026/27. El «hoy» se fija con el reloj de Playwright.
// Lo usan interaction-smoke.mjs, render-smoke.mjs (estado D) y capturas.mjs.
// Desde B3 (decisión 31) cada mundo solo anuncia en SEASONS las temporadas cuyo archivo sirve, y sirve
// el que anuncia; y lleva los datos de las fixtures de B3: los goleadores congelados, la Copa de
// Campeones en los mundos del 23/09/2026, las cuatro copas de la Maspalomas y las actas de A1 y FF1.
import { fixture } from './fixtures/rediseno/load.mjs';
import {
  archive, cupsRaw, currentAt, goleadores, lineupsFor, nextSeasonRaw, withChampions,
} from './fixtures/rediseno/simulate.mjs';

export const STORE_KEY = 'futbol-base:v2';
const DEFAULT_TEAM = { cat: 'prebenjamin', groupId: 'PG2', name: 'Las Mesas Hu.' };
const LAS_MESAS_2526 = { name: 'Las Mesas Hu.', season: '2025-2026', cat: 'prebenjamin', groupId: 'PG2' };
// SEASONS con cada temporada del portal: files() sirve el archivo de cada temporada pasada (decisión 31).
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

// data-goleadores.js: los goleadores congelados de B3 (gol-2025-2026, Tarea 2), los de fin de temporada
// de los grupos de las fixtures; a mitad de temporada, scorersAt los reduce a su día. Las filas de PG2
// son las que este fichero copiaba a mano desde B2; en A2 van las 12 de Las Mesas, y no solo 6.
const GOL = (({ golBenj, golPrebenj }) => ({ benjamin: golBenj, prebenjamin: golPrebenj }))(goleadores());

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
  // 23/09/2026, los datos de hoy: D con la caja de la temporada siguiente (data-health pendiente). Con
  // la Copa de Campeones, que se jugó del 4 al 10 de junio (en A y C, todavía no).
  D: { today: '2026-09-23', portalSeason: '2025-2026', current: () => withChampions(fixture('current-2025-2026')) },
  // D con «Las Mesas Hu. B» de FF13 guardado: la filial cambia de nombre y se pregunta (E, caso 2b).
  E: { today: '2026-09-23', portalSeason: '2025-2026', current: () => withChampions(fixture('current-2025-2026')),
    myTeam: { name: 'Las Mesas Hu. B', season: '2025-2026', cat: 'benjamin', groupId: 'FF13' } },
  // 2026/27 sin Las Mesas: X.
  X: { today: '2026-10-01', portalSeason: '2026-2027', current: () => nextSeasonRaw({ benjamin: ['A1'], prebenjamin: ['PG3'] }),
    myTeam: LAS_MESAS_2526, gol: false },
};

// 2025-26 terminada, con la forma de data-season-<S>.js, para los mundos de 2026/27 (B y X): la fixture
// final con su Copa de Campeones, cada grupo con su calendario de HISTORY como `jornadas`.
function finishedSeason() {
  const raw = withChampions(FINAL);
  const group = (g) => ({ id: g.id, name: g.name, fullName: g.fullName, phase: g.phase, island: g.island,
    current_jornada: g.jornada ?? null, standings: g.standings, jornadas: raw.history[g.id] || {} });
  return { name: '2025-2026', current: false, benjamin: raw.benjamin.map(group), prebenjamin: raw.prebenjamin.map(group) };
}
// El archivo de una temporada pasada: el de las fixtures (2024-25 y 2023-24) o 2025-26 terminada.
const pastSeason = (name) => (name === '2025-2026' ? finishedSeason() : archive(name));

// Los ficheros que sirve un mundo, por su nombre (sin ?v=): el cuerpo y su tipo. SEASONS anuncia las
// temporadas cuyo archivo se sirve, y solo esas (decisión 31 de B3): Temporadas, la Trayectoria de
// Equipo o el selector de Explorar nunca llevan a un fichero que da 404.
function files(w) {
  const raw = w.current();
  const cups = cupsRaw({ extra: true });
  const gol = w.gol === false ? { benjamin: [], prebenjamin: [] } : scorersAt(raw);
  const seasons = w.portalSeason === '2026-2027' ? SEASONS_2627 : SEASONS_2526;
  const next = w.portalSeason === '2026-2027' ? '2027-2028' : '2026-2027';
  const js = (pairs) => ({ type: 'text/javascript', body: pairs.map(([name, value]) => `const ${name}=${JSON.stringify(value)};`).join('\n') + '\n' });
  const archived = Object.fromEntries(seasons.filter((s) => !s.current)
    .map(({ name }) => [`data-season-${name}.js`, js([[`SEASON_${name.replace('-', '_')}`, pastSeason(name)]])]));
  return {
    'src/config.js': { type: 'text/javascript', body: `export const PORTAL = ${JSON.stringify({ season: w.portalSeason, nextSeason: next, defaultTeam: DEFAULT_TEAM, timeZone: 'Atlantic/Canary' }, null, 2)};\n` },
    'data-benjamin.js': js([['BENJAMIN', raw.benjamin]]),
    'data-prebenjamin.js': js([['PREBENJAMIN', raw.prebenjamin]]),
    'data-history.js': js([['HISTORY', raw.history]]),
    'data-goleadores.js': js([['GOL_BENJ', gol.benjamin], ['GOL_PREBENJ', gol.prebenjamin]]),
    'data-shields.js': js([['SHIELDS', fixture('shields')]]),
    'data-seasons.js': js([['SEASONS', seasons]]),
    'data-maspalomas-cup-2026.js': js([['MASPALOMAS_CUP_BENJAMIN', cups.benjamin], ['MASPALOMAS_CUP_PREBENJAMIN', cups.prebenjamin]]),
    ...archived,
    'data-matchdetail.js': js([['MATCH_DETAIL', fixture('matchdetail')]]),
    'data-lineups-2025-2026.js': js([['LINEUPS_2025_2026', lineupsFor('2025-2026')]]),
    'data-health.json': { type: 'application/json', body: JSON.stringify(healthOn(w.today)) },
  };
}

// Lo que sirve el mundo `name`, por fichero: { body, type }. Lo usan useWorld y su prueba
// (test_rediseno_mundos.mjs, decisión 31 de B3).
export function worldFiles(name) {
  const w = WORLDS[name];
  if (!w) throw new Error(`mundo desconocido: ${name}`);
  return files(w);
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
