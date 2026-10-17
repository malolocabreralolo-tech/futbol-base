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
 * campo, la amortiguación de las goleadas y desde cuándo se muestra; y descartar las variantes que no
 * mejoran). Con las dos medias (por encima de 8 goles, amortiguadas: el modelo multiplicativo se pasa
 * en las goleadas), una distribución de goles por equipo, independientes, y de ahí P(local), P(empate),
 * P(visitante) y el resultado más probable.
 *
 * Qué se muestra (con `today`, como en la web): solo la próxima jornada de cada grupo (horizonOf), y
 * solo con dos jornadas jugadas en el grupo y algún partido de cada uno de los dos equipos.
 *
 * Qué no cuenta: los partidos de un retirado (retiredTeams de model.js); los resultados que pueden ser
 * de mesa, todo 3-0 o 1-0 a favor de cualquiera de los dos, con hora o sin ella (isDeskResult); los de un
 * campo «EXCLUIDO» o «SUSPENDIDO»; las copias de la importación del archivo (copiedMatches); lo que la
 * app de futbolaspalmas da por retirado, anulado o suspendido (status, el model.matchStatus de la
 * temporada del portal); y los partidos sin fecha, que no se sabe si son anteriores. */
import { matchState, retiredTeams } from './model.js';

/* Los parámetros globales, fijados con el backtest de las temporadas pasadas de prebenjamín
 * (scripts/backtest_pronostico.mjs; revisado el 17/10/2026 sin las copias de la importación ni lo que
 * puede ser de mesa: 13 temporadas, 53 grupos, 5.078 partidos, cada uno con solo las jornadas anteriores
 * de su temporada; la tabla, en su salida):
 * - shrink: k, los partidos ficticios en la media del grupo de cada equipo (ataque y defensa): 1,5. Con
 *   los datos limpios, el mejor log-loss del 1X2 del archivo es el de 1 (0,5338 frente a 0,5343), a menos
 *   de la milésima con la que el backtest da por empatadas dos opciones; y con dos jornadas jugadas, las
 *   primeras que se ven, 1,5 es claramente mejor (0,710 frente a 0,725): se queda 1,5 (con 2, 0,5368);
 * - home: H, el factor de campo sobre los goles del local (los del visitante no cambian): 1,08 (sin él,
 *   0,5367; en el archivo el local marca 4,0 y el visitante 3,8);
 * - size: r de la binomial negativa de los goles; Infinity es Poisson. La sobredispersión no mejora
 *   (su mejor r, 40, casi Poisson: 0,5339), ni el tope de goles al calcular A y D (cap; con 15, 0,5338):
 *   a igualdad, la sencilla;
 * - cap: ese tope de goles por equipo y partido (Infinity: sin tope);
 * - soften: por encima de este umbral, los goles esperados se amortiguan, T·(1 + ln(x/T)) (revisión del
 *   17/10/2026): sin ella, con 15-20 esperados se marcaban 13,7 (16,8 de media esperada) y el «resultado
 *   más probable» salía inflado (Guanarteme–Acodetti de 2016-17, 0-24, acabó 2-12; ahora, 0-17). El 1X2 no cambia (0,5343 con cualquiera: las
 *   goleadas ya pasan del 99 %); 8 es el de menor error de los goles esperados (2,195 frente a 2,212 sin
 *   ella) y con él cuadran por tramos (de 10 a 12, 10,8 frente a 10,7 reales);
 * - minRounds: jornadas jugadas del grupo desde las que se muestra: 2. Con una, apenas mejora a la
 *   tabla (log-loss 0,819 frente a 0,835; acierta como ella en el 1X2, 66,7 % frente a 67,1 %) y se pasa
 *   de seguro con sus favoritos claros (dice 85-93 % y acierta el 74-82 %). Con dos acierta como la
 *   tabla (69,3 % frente a 68,0 %), pero sus probabilidades son mucho mejores (log-loss 0,709 frente a
 *   0,817; Brier 0,402 frente a 0,487) y lo que dice es lo que pasa (dice 86 % y acierta el 84 %); desde
 *   tres, además, acierta más (74,9 % frente a 70,9 %);
 * - minPlayed: partidos que tiene que llevar cada uno de los dos equipos: 1 (revisión del 17/10/2026). Sin
 *   ninguno, un equipo es la media del grupo y el pronóstico solo mira al rival (Cardones, que descansó en
 *   la jornada 1 y aún no ha jugado la 2); el archivo casi no tiene casos (7) con los que probarlo. Con uno
 *   (112 partidos), sus probabilidades siguen siendo mejores que las de la tabla (log-loss 0,735 frente a
 *   0,772), aunque acierta algo menos el 1X2 (66,1 % frente a 69,6 %). */
export const PARAMS = Object.freeze({ shrink: 1.5, home: 1.08, size: Infinity, cap: Infinity, soften: 8, minRounds: 2, minPlayed: 1 });

// Los estados de la app de futbolaspalmas (model.matchStatus) con los que un marcador no es deportivo
// y un partido sin jugar no se pronostica.
const OFF_STATES = new Set(['retirado', 'anulado', 'suspendido']);
const ITERATIONS = 2000;
const TOLERANCE = 1e-12;

const scored = m => m.hs != null && m.as != null;

/* Resultado que puede ser de mesa (revisión del 17/10/2026): un 3-0 o un 1-0, en cualquier sentido, con
 * hora o sin ella, o el de un campo «EXCLUIDO» o «SUSPENDIDO» (el archivo de 2014-15 apunta así los de
 * Cerruda B, que jugó unas jornadas, con dos incomparecencias por 3-0, y luego perdió el resto 15-0 y
 * 0-15). El bot guarda los de mesa de 2026-27 con la hora del partido (los 0-3 de AL20, AL32 y AL9 de
 * alevín) y una incomparecencia suelta de un equipo que sigue en la tabla no la marca nada (retiredTeams
 * pide cinco derrotas de mesa; ESTADOS, nada): con dos jornadas, un 3-0 así movería todo el grupo (en PG1,
 * un 99 % pasaría a 94 %). Ante la duda, fuera del entrenamiento, también los de verdad: en el archivo,
 * 124 3-0 y 38 1-0 con hora (sin retirados ni campos «EXCLUIDO») entre 5.506 partidos con marcador, y
 * sacarlos no empeora el backtest (el log-loss mejora casi una milésima). Como objetivos del backtest sí
 * cuentan los que tienen hora (scripts/backtest_pronostico.mjs: el examen no pierde los partidos cerrados
 * de verdad). En el archivo, los 3-0 y 1-0 sin hora (52 1-0 y 35 3-0 de retirados, como Rosiana en
 * 2016-17, Las Majoreras en 2022-23 y Atlético Fomento en 2025-26, y los quince 3-0 de Gran Tarajal en
 * PFV3 de 2024-25) son todos de mesa. */
const OFF_VENUE = /^\W*(excluido|suspendido)\W*$/i;
export const offVenue = m => OFF_VENUE.test((m && m.venue) || '');
export function isDeskResult(m) {
  if (!scored(m)) return false;
  if (offVenue(m)) return true;
  const hi = Math.max(m.hs, m.as), lo = Math.min(m.hs, m.as);
  return lo === 0 && (hi === 3 || hi === 1);
}

/* Las copias de la importación del archivo (revisión del 17/10/2026): en una liga cada equipo juega una
 * vez por jornada, y en PGC1 de 2023-24 y PGC4 de 2024-25 hay 28 partidos dos veces en la misma jornada,
 * con el mismo marcador y el mismo rival en el mismo lado: una copia es del filial (R. Amagro At.,
 * Arguineguín B) y la otra se le apunta al primer equipo («R. Amagro At. 0-18 Arucas C» y «Roque Amagro
 * 0-18 Arucas C» en la jornada 4, con el Roque Amagro de verdad jugando otro). La copia es la del equipo
 * que juega dos veces en esa jornada; si no se sabe (los dos juegan solo ese), las dos. Un partido que
 * sale dos veces igual cuenta una. Solo en ligas: en una liguilla de copa de un día, un equipo juega
 * varios partidos en la misma «jornada». Devuelve el Set de los partidos que no cuentan; 2026-27 no tiene
 * ninguno. */
export function copiedMatches(group) {
  const out = new Set();
  if (!group || group.kind !== 'league') return out;
  for (const round of group.rounds || []) {
    const times = new Map();
    for (const m of round.matches) for (const t of [m.home, m.away]) times.set(t, (times.get(t) || 0) + 1);
    const ms = round.matches.filter(scored);
    for (let i = 0; i < ms.length; i += 1) {
      for (let j = i + 1; j < ms.length; j += 1) {
        const a = ms[i], b = ms[j];
        if (a.hs !== b.hs || a.as !== b.as || out.has(b)) continue;
        if (a.home === b.home && a.away === b.away) { out.add(b); continue; }
        const other = a.home === b.home ? [a.away, b.away] : a.away === b.away ? [a.home, b.home] : null;
        if (!other) continue;
        const twiceA = times.get(other[0]) > 1, twiceB = times.get(other[1]) > 1;
        if (twiceA !== twiceB) out.add(twiceA ? a : b);
        else { out.add(a); out.add(b); }
      }
    }
  }
  return out;
}

/* Si el grupo admite pronóstico: una liga de prebenjamín de la temporada del portal. `prueba`, que solo
 * usa el backtest, lo abre a las temporadas pasadas y a las liguillas de copa, que le dan más partidos
 * con los que probar el modelo (en un cuadro no hay empate); en la web, las copas, nada (revisión del
 * 17/10/2026: el usuario pidió la próxima jornada de los grupos; «Todos los grupos» tampoco las pinta). */
export function forecastApplies(group, { portalSeason = null, prueba = false } = {}) {
  if (!group || group.cat !== 'prebenjamin') return false;
  if (prueba === true) return group.kind === 'league' || group.kind === 'cup-league';
  return group.kind === 'league' && typeof portalSeason === 'string' && group.season === portalSeason;
}

const offByStatus = (status, m) => {
  if (typeof status !== 'function') return false;
  const s = status(m);
  return Boolean(s && OFF_STATES.has(s.state));
};

// Lo que no cambia de un grupo (el Group de model.js no cambia una vez construido): sus retirados, sus
// copias y, por día, su horizonte (horizonOf), calculados una vez.
const FACTS = new WeakMap();
function factsOf(group) {
  if (!FACTS.has(group)) FACTS.set(group, { retired: retiredTeams(group), copies: copiedMatches(group), horizon: new Map() });
  return FACTS.get(group);
}

const addDays = (iso, n) => new Date(Date.parse(`${iso}T12:00:00Z`) + n * 86400000).toISOString().slice(0, 10);

/* Hasta qué día se pronostica con `today` (revisión del 17/10/2026: el usuario pidió «lo que puede pasar
 * en la siguiente jornada», no todo el calendario): la próxima jornada es la del primer partido pendiente,
 * por fecha, de las que van detrás de la última con algún resultado (sin retirados ni mesa), y se
 * pronostica lo pendiente hasta seis días después de ese partido. Es decir, la próxima jornada, lo que
 * falta de la que está en curso y lo que caiga entre medias (un aplazado, una jornada entre semana); nada
 * de las de después, que el backtest no mide (cada partido, con todo lo jugado hasta la víspera, no a
 * meses vista con dos jornadas). Por fecha y no por número, una jornada adelantada cuenta como la próxima,
 * y una sin resultados con la fecha ya pasada no atasca nada. Sin nada pendiente detrás de la última con
 * resultados, null: sin límite (los aplazados que queden). */
export function horizonOf(group, today) {
  const facts = factsOf(group);
  if (facts.horizon.has(today)) return facts.horizon.get(today);
  const live = m => !facts.retired.has(m.home) && !facts.retired.has(m.away);
  const rounds = group.rounds || [];
  let last = -1;
  rounds.forEach((round, i) => { if (round.matches.some(m => scored(m) && live(m) && !isDeskResult(m))) last = i; });
  let first = null;
  for (const round of rounds.slice(last + 1)) {
    for (const m of round.matches) {
      if (live(m) && matchState(m, today) === 'pendiente' && (first === null || m.dateISO < first)) first = m.dateISO;
    }
  }
  const until = first === null ? null : addDays(first, 6);
  facts.horizon.set(today, until);
  return until;
}

/* Los partidos que cuentan para el pronóstico de `match`: con marcador y fecha, anteriores a su día
 * (todos si no tiene fecha; los del mismo día de otra jornada, no), de otra jornada (los de la suya,
 * aunque se jueguen antes, no: el pronóstico de una jornada es el mismo para todos sus partidos) y sin
 * retirados, mesa, copias ni estados de fuera. Un aplazado de la jornada 2 que se juega tras la 5 se
 * pronostica con la 1, la 3, la 4 y la 5. La exporta el backtest, para su línea base de la
 * clasificación con los mismos partidos. Para una jornada fija, el conjunto solo crece con la fecha de
 * `match`: su tamaño lo identifica (la clave de la caché de los ajustes). */
export function trainingFor(group, match, { status = null } = {}) {
  const { retired, copies } = factsOf(group);
  const out = [];
  for (const round of group.rounds || []) {
    if (round.key === match.roundKey) continue;
    for (const m of round.matches) {
      if (!scored(m) || !m.dateISO) continue;
      if (match.dateISO && !(m.dateISO < match.dateISO)) continue;
      if (retired.has(m.home) || retired.has(m.away) || copies.has(m) || isDeskResult(m) || offByStatus(status, m)) continue;
      out.push(m);
    }
  }
  return out;
}

// Los ajustes ya hechos, por grupo, por `status` y por jornada, tamaño del entrenamiento y parámetros del
// ajuste: los partidos de una jornada con el mismo entrenamiento (los de días distintos sin nada jugado
// entre medias, las jornadas futuras) comparten ajuste. Solo es una caché: el resultado es el mismo.
const FITS = new WeakMap();

function cachedFit(group, match, status, p) {
  if (!FITS.has(group)) FITS.set(group, new Map());
  const byStatus = FITS.get(group);
  const st = typeof status === 'function' ? status : null;
  if (!byStatus.has(st)) byStatus.set(st, new Map());
  const memo = byStatus.get(st);
  const training = trainingFor(group, match, { status: st });
  const key = [match.roundKey, training.length, p.shrink, p.home, p.cap].join('\u0001');
  if (!memo.has(key)) memo.set(key, fitRatings(training, p));
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

/* Pronóstico de un partido sin jugar de una liga de prebenjamín de la temporada del portal:
 *   { home, away, pHome, pDraw, pAway, pick, score: [l, v], pScore, xgHome, xgAway,
 *     rounds, matches, playedHome, playedAway }
 * con xg* los goles esperados de cada uno (amortiguados por encima de soften), `rounds` las jornadas
 * jugadas con las que se calcula, `matches` sus partidos (la nota «según los N partidos jugados») y
 * played* los de cada equipo entre ellos. null si el grupo no lo admite (forecastApplies), si el partido
 * ya tiene marcador, si con `today` no está pendiente (matchState: uno sin fecha o con la fecha pasada y
 * sin resultado no se pronostica) o va más allá de la próxima jornada (horizonOf), si es de un retirado o
 * la app lo da por retirado, anulado o suspendido, si aún no hay PARAMS.minRounds jornadas jugadas o si
 * uno de los dos no ha jugado aún PARAMS.minPlayed partidos. Opciones: portalSeason (la del contexto),
 * today (AAAA-MM-DD; la web lo pasa siempre; sin él, el backtest, sin horizonte), status
 * (model.matchStatus) y, solo para el backtest, prueba (otra temporada o una liguilla de copa) y params
 * (otros parámetros). */
export function forecastMatch(group, match, { portalSeason = null, today = null, status = null, prueba = false, params = PARAMS } = {}) {
  const p = { ...PARAMS, ...params };
  if (!match || !forecastApplies(group, { portalSeason, prueba })) return null;
  if (scored(match) || offByStatus(status, match)) return null;
  if (today !== null) {
    if (matchState(match, today) !== 'pendiente') return null;
    const until = horizonOf(group, today);
    if (until !== null && match.dateISO > until) return null;
  }
  const { retired } = factsOf(group);
  if (retired.has(match.home) || retired.has(match.away)) return null;
  const fit = cachedFit(group, match, status, p);
  if (!fit || fit.rounds < p.minRounds) return null;
  const avg = { attack: 1, defense: 1, played: 0 };
  const home = fit.teams.get(match.home) || avg;
  const away = fit.teams.get(match.away) || avg;
  if (Math.min(home.played, away.played) < p.minPlayed) return null;
  const soft = x => (x > p.soften ? p.soften * (1 + Math.log(x / p.soften)) : x);
  const xgHome = soft(fit.base * fit.home * home.attack * away.defense);
  const xgAway = soft(fit.base * away.attack * home.defense);
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
