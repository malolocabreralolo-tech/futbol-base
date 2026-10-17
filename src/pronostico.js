/* Pronóstico de los partidos sin jugar del prebenjamín de la temporada en curso (17/10/2026).
 *
 * Puro e importable en Node sin DOM, como model.js: recibe el Group de model.js y la temporada del
 * portal por parámetro (nunca config.js, R2-1) y no lee ningún global de datos. Nada en la base ni en
 * el bot, ni ninguna petición nueva: solo los partidos ya jugados del grupo, los que la web ya carga.
 *
 * El modelo (el de Maher, el clásico de ataque y defensa con goles de Poisson), en una frase: cada
 * equipo tiene un ataque A y una defensa D (1 = la media del grupo; una defensa de 2 encaja el doble),
 * y el local de un partido marca de media b·H·A_local·D_visitante goles, y el visitante,
 * b·A_visitante·D_local, con b los goles medios del grupo y H el factor de campo. A y D salen de los
 * partidos jugados del grupo EN ESTA temporada, con k = 1,5 partidos ficticios en la media del grupo
 * (contracción): con un partido jugado, un equipo es un 40 % lo suyo y un 60 % la media; con quince,
 * un 91 % lo suyo. Nada de temporadas anteriores, ni como entrada ni como previo de un equipo o de un
 * club (decisión del 17/10/2026): las pasadas solo sirven para PROBAR el modelo
 * (scripts/backtest_pronostico.mjs) y para fijar los parámetros globales de PARAMS (la contracción, el
 * campo y desde cuántas jornadas se muestra; y descartar las variantes que no mejoran). Con las dos
 * medias, una distribución de goles por equipo, independientes, y de ahí P(local), P(empate),
 * P(visitante) y el resultado más probable.
 *
 * Qué no cuenta: los partidos de un retirado (retiredTeams de model.js) y los resultados de mesa (un
 * 3-0 o un 1-0, a favor de cualquiera de los dos, sin hora: en el archivo de prebenjamín, los quince
 * 3-0 sin hora son de mesa, los de Gran Tarajal en PFV3 de 2024-25, y no hay ningún 1-0 sin ella), ni
 * lo que la app de futbolaspalmas da por retirado, anulado o suspendido (status, el model.matchStatus
 * de la temporada del portal). Tampoco los partidos sin fecha: sin ella no se sabe si son anteriores. */
import { matchState, retiredTeams } from './model.js';

/* Los parámetros globales, fijados con el backtest de las temporadas pasadas de prebenjamín
 * (scripts/backtest_pronostico.mjs, 17/10/2026: 13 temporadas, 53 grupos, 5.127 partidos, cada uno con
 * solo las jornadas anteriores de su temporada; la tabla, en su salida):
 * - shrink: k, los partidos ficticios en la media del grupo de cada equipo (ataque y defensa). El mejor
 *   log-loss del 1X2 es el de 1,5 (0,5406; 0,5408 con 1 y 0,5426 con 2);
 * - home: H, el factor de campo sobre los goles del local (los del visitante no cambian): 1,08 (sin él,
 *   0,5430; en el archivo el local marca 4,0 y el visitante 3,8);
 * - size: r de la binomial negativa de los goles; Infinity es Poisson. La sobredispersión no mejora
 *   (su mejor r, 40, casi Poisson: 0,5403), ni el tope de goles al calcular A y D (cap; con 15, 0,5407):
 *   a igualdad, la sencilla;
 * - cap: ese tope de goles por equipo y partido (Infinity: sin tope);
 * - minRounds: jornadas jugadas del grupo desde las que se muestra: 2. Con una, apenas mejora a la
 *   tabla (log-loss 0,827 frente a 0,841; el mismo 66,5 % de acierto en el 1X2) y se pasa de seguro con
 *   sus favoritos claros (dice 84-94 % y acierta el 69-79 %). Con dos acierta lo mismo que la tabla
 *   (67,5 %), pero sus probabilidades son mucho mejores (log-loss 0,712 frente a 0,823; Brier 0,408
 *   frente a 0,493) y lo que dice es lo que pasa (dice 85 % y acierta el 84 %); desde tres, además,
 *   acierta más (75,7 % frente a 71,3 %). */
export const PARAMS = Object.freeze({ shrink: 1.5, home: 1.08, size: Infinity, cap: Infinity, minRounds: 2 });

// Los estados de la app de futbolaspalmas (model.matchStatus) con los que un marcador no es deportivo
// y un partido sin jugar no se pronostica.
const OFF_STATES = new Set(['retirado', 'anulado', 'suspendido']);
const ITERATIONS = 2000;
const TOLERANCE = 1e-12;

const scored = m => m.hs != null && m.as != null;

/* Resultado de mesa: 3-0 o 1-0 (en cualquier sentido) sin hora. En el archivo de prebenjamín, los quince
 * 3-0 sin hora son administrativos (los de Gran Tarajal) y no hay ningún 1-0 sin ella; un 3-0 con hora
 * es de verdad, y cuenta. */
export function isDeskResult(m) {
  if (!scored(m) || m.time) return false;
  const hi = Math.max(m.hs, m.as), lo = Math.min(m.hs, m.as);
  return lo === 0 && (hi === 3 || hi === 1);
}

/* Si el grupo admite pronóstico: prebenjamín, una liga o una liguilla (en un cuadro no hay empate), y
 * de la temporada del portal; `prueba` lo abre a otra temporada, y solo lo usa el backtest. */
export function forecastApplies(group, { portalSeason = null, prueba = false } = {}) {
  if (!group || group.cat !== 'prebenjamin') return false;
  if (group.kind !== 'league' && group.kind !== 'cup-league') return false;
  return prueba === true || (typeof portalSeason === 'string' && group.season === portalSeason);
}

const offByStatus = (status, m) => {
  if (typeof status !== 'function') return false;
  const s = status(m);
  return Boolean(s && OFF_STATES.has(s.state));
};

/* Los partidos que cuentan para el pronóstico de `match`: con marcador y fecha, anteriores a su día
 * (todos si no tiene fecha), de otra jornada (los de la suya, aunque se jueguen antes, no: el
 * pronóstico de una jornada es el mismo para todos sus partidos) y sin retirados, mesa ni estados de
 * fuera. Un aplazado de la jornada 2 que se juega tras la 5 se pronostica con la 1, la 3, la 4 y la 5.
 * La exporta el backtest, para su línea base de la clasificación con los mismos partidos. */
export function trainingFor(group, match, { status = null } = {}) {
  const retired = retiredTeams(group);
  const out = [];
  for (const round of group.rounds || []) {
    if (round.key === match.roundKey) continue;
    for (const m of round.matches) {
      if (!scored(m) || !m.dateISO) continue;
      if (match.dateISO && !(m.dateISO < match.dateISO)) continue;
      if (retired.has(m.home) || retired.has(m.away) || isDeskResult(m) || offByStatus(status, m)) continue;
      out.push(m);
    }
  }
  return out;
}

// Los ajustes ya hechos, por grupo (el Group de model.js no cambia una vez construido), por `status` y
// por jornada, día y parámetros del ajuste: los partidos de un mismo día de una jornada comparten
// entrenamiento, y la jornada se pinta de una vez. Solo es una caché: el resultado es el mismo.
const FITS = new WeakMap();

function cachedFit(group, match, status, p) {
  if (!FITS.has(group)) FITS.set(group, new Map());
  const byStatus = FITS.get(group);
  const st = typeof status === 'function' ? status : null;
  if (!byStatus.has(st)) byStatus.set(st, new Map());
  const memo = byStatus.get(st);
  const key = [match.roundKey, match.dateISO || '', p.shrink, p.home, p.cap].join('\u0001');
  if (!memo.has(key)) memo.set(key, fitRatings(trainingFor(group, match, { status: st }), p));
  return memo.get(key);
}

/* Ataque y defensa de cada equipo con los partidos `matches` (los de trainingFor): ascenso por
 * coordenadas (cada paso, el mejor A con las D fijas, el mejor D con las A fijas y el mejor b con las
 * dos), que con el previo converge siempre. El previo de cada A y cada D son k partidos con los goles
 * medios del grupo (e0) contra un rival medio: A = (goles + k·e0) / (goles esperados con A = 1 + k·e0).
 * Devuelve { base, home, teams: Map(equipo → { attack, defense, played }), matches, rounds } o null sin
 * partidos. Determinista: el orden de los equipos y de las sumas es el de los partidos. */
export function fitRatings(matches, params = PARAMS) {
  const p = { ...PARAMS, ...params };
  if (!matches.length) return null;
  const names = [];
  const index = new Map();
  const at = name => {
    if (!index.has(name)) { index.set(name, names.length); names.push(name); }
    return index.get(name);
  };
  const cap = g => Math.min(g, p.cap);
  const rows = matches.map(m => ({ h: at(m.home), a: at(m.away), gh: cap(m.hs), ga: cap(m.as) }));
  const n = names.length;
  const gf = new Float64Array(n), gc = new Float64Array(n), played = new Uint16Array(n);
  let total = 0;
  for (const r of rows) {
    gf[r.h] += r.gh; gc[r.a] += r.gh; gf[r.a] += r.ga; gc[r.h] += r.ga;
    played[r.h] += 1; played[r.a] += 1;
    total += r.gh + r.ga;
  }
  const H = p.home;
  const k = p.shrink;
  const e0 = total / (2 * rows.length);
  const A = new Float64Array(n).fill(1), D = new Float64Array(n).fill(1);
  let b = total / (rows.length * (1 + H));
  // Un grupo sin un solo gol (no pasa en prebenjamín, pero la división tiene que estar definida): todos
  // en la media, con medias de cero, y la distribución de goles sale toda en el 0-0.
  if (total > 0) {
    const ex = new Float64Array(n);
    for (let it = 0; it < ITERATIONS; it += 1) {
      let delta = 0;
      ex.fill(0);
      for (const r of rows) { ex[r.h] += b * H * D[r.a]; ex[r.a] += b * D[r.h]; }
      for (let i = 0; i < n; i += 1) {
        const next = (gf[i] + k * e0) / (ex[i] + k * e0);
        delta = Math.max(delta, Math.abs(Math.log(next / A[i])));
        A[i] = next;
      }
      ex.fill(0);
      for (const r of rows) { ex[r.a] += b * H * A[r.h]; ex[r.h] += b * A[r.a]; }
      for (let i = 0; i < n; i += 1) {
        const next = (gc[i] + k * e0) / (ex[i] + k * e0);
        delta = Math.max(delta, Math.abs(Math.log(next / D[i])));
        D[i] = next;
      }
      let expected = 0;
      for (const r of rows) expected += H * A[r.h] * D[r.a] + A[r.a] * D[r.h];
      const nextB = total / expected;
      delta = Math.max(delta, Math.abs(Math.log(nextB / b)));
      b = nextB;
      if (delta < TOLERANCE) break;
    }
  }
  const teams = new Map(names.map((name, i) => [name, { attack: A[i], defense: D[i], played: played[i] }]));
  return { base: b, home: H, teams, matches: rows.length, rounds: new Set(matches.map(m => m.roundKey)).size };
}

/* Probabilidades de 0, 1, 2… goles con media `mean`: Poisson o, con `size` finito, binomial negativa
 * (varianza mean + mean²/size). Hasta donde la cola ya no pesa, y normalizadas. */
function goalPmf(mean, size) {
  const poisson = !Number.isFinite(size);
  const sd = Math.sqrt(mean + (poisson ? 0 : mean * mean / size));
  const top = Math.min(200, Math.ceil(mean + 12 * sd) + 8);
  const pmf = new Float64Array(top + 1);
  if (mean <= 0) { pmf[0] = 1; return pmf; }
  if (poisson) {
    pmf[0] = Math.exp(-mean);
    for (let g = 1; g <= top; g += 1) pmf[g] = pmf[g - 1] * mean / g;
  } else {
    const q = mean / (size + mean);
    pmf[0] = Math.exp(size * Math.log(size / (size + mean)));
    for (let g = 1; g <= top; g += 1) pmf[g] = pmf[g - 1] * (g - 1 + size) / g * q;
  }
  let sum = 0;
  for (const v of pmf) sum += v;
  for (let g = 0; g <= top; g += 1) pmf[g] /= sum;
  return pmf;
}

// Los marcadores de cada desenlace: el local gana, empatan o gana el visitante.
const INSIDE = { home: (i, j) => i > j, draw: (i, j) => i === j, away: (i, j) => i < j };

/* De las dos medias, el desenlace y el marcador: { pHome, pDraw, pAway, pick, score: [l, v], pScore }.
 * pick es el desenlace más probable ('home' | 'draw' | 'away'; a igualdad, el local, luego el
 * visitante) y score el marcador más probable DENTRO de él: nunca un 1-1 con un favorito claro. */
export function outcome(meanHome, meanAway, params = PARAMS) {
  const p = { ...PARAMS, ...params };
  const ph = goalPmf(meanHome, p.size), pa = goalPmf(meanAway, p.size);
  let pHome = 0, pDraw = 0, pAway = 0;
  for (let i = 0; i < ph.length; i += 1) {
    for (let j = 0; j < pa.length; j += 1) {
      const v = ph[i] * pa[j];
      if (i > j) pHome += v; else if (i === j) pDraw += v; else pAway += v;
    }
  }
  const sum = pHome + pDraw + pAway;
  pHome /= sum; pDraw /= sum; pAway /= sum;
  const pick = pHome >= pAway && pHome >= pDraw ? 'home' : pAway >= pDraw ? 'away' : 'draw';
  const inside = INSIDE[pick];
  let best = -1, score = [0, 0];
  for (let i = 0; i < ph.length; i += 1) {
    for (let j = 0; j < pa.length; j += 1) {
      if (!inside(i, j)) continue;
      const v = ph[i] * pa[j];
      if (v > best) { best = v; score = [i, j]; }
    }
  }
  return { pHome, pDraw, pAway, pick, score, pScore: best / sum };
}

/* Los marcadores más probables con las dos medias, de más a menos: [{ score: [l, v], p }], `n` como
 * mucho y, con `pick` ('home' | 'draw' | 'away'), solo los de ese desenlace. Es lo que pinta la pantalla
 * Partido (17/10/2026): con el `pick` del pronóstico, el primero es su `score` (a igualdad, el mismo
 * orden que outcome: menos goles del local y luego del visitante) y los demás, los que le siguen sin
 * cambiar de ganador. p es la probabilidad de ese marcador exacto (la pScore de outcome en el primero). */
export function topScores(meanHome, meanAway, { n = 3, pick = null, params = PARAMS } = {}) {
  const p = { ...PARAMS, ...params };
  const ph = goalPmf(meanHome, p.size), pa = goalPmf(meanAway, p.size);
  const inside = pick ? INSIDE[pick] : () => true;
  const found = [];
  let sum = 0;
  for (let i = 0; i < ph.length; i += 1) {
    for (let j = 0; j < pa.length; j += 1) {
      const v = ph[i] * pa[j];
      sum += v;
      if (inside(i, j)) found.push({ score: [i, j], p: v });
    }
  }
  // sort es estable: a igualdad, el orden del recorrido (el de outcome).
  return found.sort((a, b) => b.p - a.p).slice(0, n).map(x => ({ score: x.score, p: x.p / sum }));
}

/* Pronóstico de un partido sin jugar de un grupo de prebenjamín de la temporada del portal:
 *   { home, away, pHome, pDraw, pAway, pick, score: [l, v], pScore, xgHome, xgAway,
 *     rounds, matches, playedHome, playedAway }
 * con xg* los goles esperados de cada uno, `rounds` las jornadas jugadas con las que se calcula (la nota
 * «según N jornadas»), `matches` sus partidos y played* los de cada equipo entre ellos. null si el grupo
 * no lo admite (forecastApplies), si el partido ya tiene marcador, si con `today` no está pendiente
 * (matchState: uno sin fecha o con la fecha pasada y sin resultado no se pronostica), si es de un
 * retirado o la app lo da por retirado, anulado o suspendido, o si aún no hay PARAMS.minRounds jornadas
 * jugadas. Opciones: portalSeason (la del contexto), today (AAAA-MM-DD; la web lo pasa siempre),
 * status (model.matchStatus) y, solo para el backtest, prueba (otra temporada) y params (otros
 * parámetros). */
export function forecastMatch(group, match, { portalSeason = null, today = null, status = null, prueba = false, params = PARAMS } = {}) {
  const p = { ...PARAMS, ...params };
  if (!match || !forecastApplies(group, { portalSeason, prueba })) return null;
  if (scored(match) || offByStatus(status, match)) return null;
  if (today !== null && matchState(match, today) !== 'pendiente') return null;
  const retired = retiredTeams(group);
  if (retired.has(match.home) || retired.has(match.away)) return null;
  const fit = cachedFit(group, match, status, p);
  if (!fit || fit.rounds < p.minRounds) return null;
  const avg = { attack: 1, defense: 1, played: 0 };
  const home = fit.teams.get(match.home) || avg;
  const away = fit.teams.get(match.away) || avg;
  const xgHome = fit.base * fit.home * home.attack * away.defense;
  const xgAway = fit.base * away.attack * home.defense;
  return {
    home: match.home,
    away: match.away,
    ...outcome(xgHome, xgAway, p),
    xgHome,
    xgAway,
    rounds: fit.rounds,
    matches: fit.matches,
    playedHome: home.played,
    playedAway: away.played,
  };
}

/* Los pronósticos de una jornada, en el orden de round.matches: el de forecastMatch o null. */
export function forecastRound(group, round, opts = {}) {
  return ((round && round.matches) || []).map(m => forecastMatch(group, m, opts));
}
