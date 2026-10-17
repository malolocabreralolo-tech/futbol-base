/* RESULTADO DE LA ELECCIÓN (17/10/2026): NO ELEGIDA para el 1X2. La elegida de la familia, bayes, da 0,541 de
 * log-loss en EVALUACIÓN: frente al Poisson de antes, −0,003 [−0,004, −0,001] (real, pero pequeño), y
 * frente a Massey (el elegido), +0,007 [+0,002, +0,012]: peor. La variante `actual` (el Poisson de
 * src/pronostico.js) sigue en la web para los goles: el marcador más probable, dentro del favorito de
 * Massey, y los goles esperados; su 1X2 es la referencia «poisson» del banco. En las cifras de abajo,
 * «actual» es ese Poisson de antes.
 *
 * La familia Poisson del pronóstico de prebenjamín, para el banco de pruebas (scripts/pronostico_banco.mjs,
 * 17/10/2026). Puro y sin dependencias ni globales: el mismo módulo sirve en Node y en el navegador.
 *
 *   node scripts/pronostico_banco.mjs --modelo scripts/pronostico_modelos/poisson.mjs [--contra actual]
 *
 * La idea, en llano. Cada equipo tiene un ataque (los goles que mete, comparado con lo que encajan sus
 * rivales de media) y una defensa (los que encaja, comparado con lo que meten sus rivales). Es la «regla
 * de tres» de los resultados, pero con todas las cadenas a la vez: si A le ganó 6-1 a B y B le ganó 3-2 a C,
 * A sale por encima de C aunque no se hayan visto, y lo que valen los goles de A depende de lo bueno que
 * resulte ser B, que a su vez depende de C… El ajuste lo resuelve de una vez para todo el grupo, con solo
 * los partidos jugados de su temporada (los de `training`). De ataque y defensa salen los goles esperados
 * de cada uno en el partido, de ahí la distribución de los goles y de ahí P(local), P(empate) y
 * P(visitante). El de src/pronostico.js es la variante `actual`; las demás son sus primas.
 *
 * Las piezas (los parámetros de PARAMS_ACTUAL; un modelo concreto es un juego de todas):
 * - shrink: k, los partidos ficticios en la media del grupo de cada equipo (la contracción): con pocos
 *   partidos, un equipo se parece a la media; con muchos, a lo suyo.
 * - home: el factor de campo sobre los goles del local (1: el campo no cuenta).
 * - soften: por encima de este umbral los goles esperados se amortiguan, T·(1 + ln(x/T)) (Infinity: nada).
 * - size: r, el tamaño de una binomial negativa para los goles (Infinity: Poisson). Más pequeño, goles más
 *   dispersos: menos seguridad con los favoritos y menos empates.
 * - uncert: u, la incertidumbre de las fuerzas (0: no cuenta). Con un partido jugado no se sabe la fuerza de
 *   un equipo, se estima; el Poisson hace como si se supiera. Con u, los goles de cada lado son una
 *   binomial negativa cuyo tamaño sale de los goles que respaldan esas dos fuerzas (la a posteriori Gamma de
 *   la contracción: el ataque de un equipo se apoya en sus goles marcados más k·e0, y la defensa del rival,
 *   en los que encajó más k·e0): 1/tamaño = 1/r + u·(1/apoyo del ataque + 1/apoyo de la defensa). Con una
 *   jornada, el pronóstico se abre mucho; con quince, casi no cambia. Es la «binomial negativa bayesiana».
 * - rho: la corrección de Dixon y Coles (1997) de los marcadores bajos (0-0, 1-0, 0-1 y 1-1; τ con tope en 0).
 * - draw: un factor sobre la probabilidad del empate (1: nada), la inflación diagonal de Karlis y Ntzoufras.
 * - decay: ξ, el olvido de Dixon y Coles: cada partido pesa e^(−ξ·días hasta el pronosticado) (0: todos igual).
 *
 * Las variantes (VARIANTES): actual (el Poisson de src/pronostico.js, el 1X2 de la web hasta el 17/10/2026,
 * aquí reproducido a 1e-15),
 * maher (la misma con k, campo y amortiguación reajustados), sin-campo (maher con campo 1: el usuario cree
 * que el campo no decide), dixon-coles (maher con rho y ξ), binomial-negativa (maher con r), bayes (la
 * binomial negativa bayesiana: k, campo, u, r), bayes-sin-campo (bayes con campo 1) y completo (bayes con
 * rho y el factor de empate).
 *
 * El protocolo: ajustar(banco) solo ve las temporadas de AJUSTE (2013-14 a 2020-21). Para cada variante
 * busca sus parámetros libres por patrones (cada uno, un paso arriba y abajo mientras mejore el log-loss
 * del 1X2 de todas las parejas del ajuste; luego pasos más cortos), los redondea a tres cifras y elige la
 * variante: la de menos parámetros libres entre las que quedan a menos de una milésima de la mejor (la
 * misma regla que el backtest de siempre: a igualdad, la sencilla). `actual`, que no se ajusta, no entra en
 * la elección. Lo que fija va a AJUSTADOS y ELEGIDA, escritos aquí abajo con la salida de ajustar del
 * 17/10/2026 (el navegador no ajusta nada: usa esos valores); ajustar los vuelve a calcular y los usa en
 * lugar de los escritos (y dice si coinciden).
 *
 * El contrato del banco: predictor(training, match, group, info) es síncrono y determinista; los resultados
 * salen solo de `training` (de `group`, solo su identidad para la caché). Sin `training`, null. */

export const nombre = 'poisson';
export const descripcion = 'familia Poisson de ataque y defensa (Maher): la elegida en el ajuste entre actual, maher, sin campo, Dixon-Coles, binomial negativa y la binomial negativa bayesiana';

const DAY = 86400000;
const ITERATIONS = 2000;
const TOLERANCE = 1e-12;
const EPS = 1e-15;

/* Los del Poisson de src/pronostico.js (PARAMS del 17/10/2026) con las piezas nuevas apagadas. Con ellos, el
 * predictor da las mismas probabilidades que el Poisson de los goles de forecastMatch con minRounds 1 y
 * minPlayed 0 (la referencia «poisson» del banco; hasta el 17/10/2026, «actual»). */
export const PARAMS_ACTUAL = Object.freeze({ shrink: 1.5, home: 1.08, soften: 8, size: Infinity, uncert: 0, rho: 0, draw: 1, decay: 0 });

/* Dónde se buscan los parámetros libres: la coordenada en la que se dan los pasos (log de k; el inverso de
 * la amortiguación y del tamaño, con 0 para «sin»), el primer paso, el último y los límites. */
const ESPACIO = Object.freeze({
  shrink: { a: v => Math.log(v), de: c => Math.exp(c), paso: Math.log(2) / 2, fin: Math.log(2) / 64, lo: Math.log(0.1), hi: Math.log(10) },
  home: { a: v => v, de: c => c, paso: 0.04, fin: 0.0025, lo: 0.8, hi: 1.4 },
  soften: { a: v => 1 / v, de: c => (c > 0 ? 1 / c : Infinity), paso: 0.04, fin: 0.0025, lo: 0, hi: 1 / 3 },
  size: { a: v => 1 / v, de: c => (c > 0 ? 1 / c : Infinity), paso: 0.02, fin: 0.00125, lo: 0, hi: 0.5 },
  uncert: { a: v => v, de: c => c, paso: 0.25, fin: 0.015, lo: 0, hi: 4 },
  rho: { a: v => v, de: c => c, paso: 0.1, fin: 0.00625, lo: -0.25, hi: 1 },
  draw: { a: v => v, de: c => c, paso: 0.1, fin: 0.00625, lo: 0.3, hi: 1.5 },
  decay: { a: v => v, de: c => c, paso: 0.004, fin: 0.00025, lo: 0, hi: 0.05 },
});

export const VARIANTES = Object.freeze({
  actual: Object.freeze({ descripcion: 'el Poisson de src/pronostico.js (k 1,5; campo 1,08; amortiguación 8): el 1X2 de la web hasta el 17/10/2026', inicio: PARAMS_ACTUAL, libres: Object.freeze([]) }),
  maher: Object.freeze({ descripcion: 'Poisson de ataque y defensa, con k, campo y amortiguación reajustados', inicio: PARAMS_ACTUAL, libres: Object.freeze(['shrink', 'home', 'soften']) }),
  'sin-campo': Object.freeze({ descripcion: 'maher con campo 1 (el local no cuenta)', inicio: Object.freeze({ ...PARAMS_ACTUAL, home: 1 }), libres: Object.freeze(['shrink', 'soften']) }),
  'dixon-coles': Object.freeze({ descripcion: 'maher con la corrección de marcadores bajos (rho) y el olvido de los partidos viejos (ξ)', inicio: PARAMS_ACTUAL, libres: Object.freeze(['shrink', 'home', 'rho', 'decay', 'soften']) }),
  'binomial-negativa': Object.freeze({ descripcion: 'maher con goles de binomial negativa de tamaño fijo r', inicio: PARAMS_ACTUAL, libres: Object.freeze(['shrink', 'home', 'size', 'soften']) }),
  bayes: Object.freeze({ descripcion: 'binomial negativa bayesiana: la dispersión sale de lo poco que se sabe de cada fuerza (u) y de r', inicio: Object.freeze({ ...PARAMS_ACTUAL, uncert: 1 }), libres: Object.freeze(['shrink', 'home', 'uncert', 'size', 'soften']) }),
  'bayes-sin-campo': Object.freeze({ descripcion: 'bayes con campo 1', inicio: Object.freeze({ ...PARAMS_ACTUAL, uncert: 1, home: 1 }), libres: Object.freeze(['shrink', 'uncert', 'size', 'soften']) }),
  completo: Object.freeze({ descripcion: 'bayes con rho de Dixon-Coles y el factor de empate', inicio: Object.freeze({ ...PARAMS_ACTUAL, uncert: 1 }), libres: Object.freeze(['shrink', 'home', 'uncert', 'size', 'rho', 'draw', 'soften']) }),
});

/* La salida de ajustar con el banco del 17/10/2026 (temporadas de AJUSTE 2013-14 a 2020-21, 2.331 parejas):
 * los parámetros de cada variante y la elegida. Los usa el predictor sin ajustar (el navegador).
 *
 * Log-loss del 1X2 en el AJUSTE (lo único con lo que se decide): actual 0,5234; maher 0,5224; sin-campo
 * 0,5268; dixon-coles 0,5216; binomial-negativa 0,5224 (su r óptimo es Infinity: con la amortiguación
 * reajustada, la dispersión fija no añade nada y queda en maher); bayes 0,5200; bayes-sin-campo 0,5244;
 * completo 0,5193. La mejor es completo, y bayes queda a 0,0007: la regla elige bayes (5 libres frente a 7).
 * El olvido de Dixon-Coles se queda en casi nada (ξ = 0,0015 por día: media vida de más de un año) y su
 * rho sale positivo (0,44), al revés que en el fútbol de mayores: aquí sobran 0-0 y 1-1 en el Poisson.
 *
 * Después, en EVALUACIÓN (2021-22 a 2025-26, 2.747 partidos de 28 grupos; no decide nada, solo puntúa),
 * Δ log-loss frente a actual con su IC 95 % por bootstrap de temporada-grupo (B 2000, semilla 17102026):
 * bayes −0,0026 [−0,0045, −0,0006] (0,5410; acierto 78,9 %, como actual: −0,2 puntos [−0,6, +0,2]);
 * completo −0,0044 [−0,0069, −0,0019]; dixon-coles −0,0033 [−0,0054, −0,0008]; maher −0,0010 [−0,0029,
 * +0,0014]. El campo (maher − sin-campo): −0,0045 [−0,0080, −0,0012] en el ajuste, pero −0,0008 [−0,0046,
 * +0,0032] en la evaluación (bayes − bayes-sin-campo, −0,0010 [−0,0049, +0,0031]): existe (el local marca
 * un 10-12 % más), pero mueve poco (P(local), 3 puntos de media; cambia el favorito en 107 de 2.747) y en
 * partidos nuevos no se distingue de cero. */
const fijos = extra => Object.freeze({ ...PARAMS_ACTUAL, ...extra });
export const AJUSTADOS = Object.freeze({
  actual: PARAMS_ACTUAL,
  maher: fijos({ shrink: 1, home: 1.1, soften: 5.06 }),
  'sin-campo': fijos({ shrink: 1.07, home: 1, soften: 5.13 }),
  'dixon-coles': fijos({ shrink: 0.942, home: 1.1, soften: 5, rho: 0.438, decay: 0.0015 }),
  'binomial-negativa': fijos({ shrink: 1, home: 1.1, soften: 5.06, size: Infinity }),
  bayes: fijos({ shrink: 0.542, home: 1.12, soften: 6.35, uncert: 0.891 }),
  'bayes-sin-campo': fijos({ shrink: 0.566, home: 1, soften: 6.25, uncert: 0.922 }),
  completo: fijos({ shrink: 0.476, home: 1.12, soften: 6.06, uncert: 0.891, rho: 0.256, draw: 1.05 }),
});
export const ELEGIDA = 'bayes';

// ── El ajuste de las fuerzas ─────────────────────────────────────────────────────────────────────────

const dayOf = iso => Date.parse(`${iso}T12:00:00Z`) / DAY;

/* Los partidos de `training` en arrays: los índices de los equipos (en el orden en que aparecen, como
 * src/pronostico.js), los goles y el día de cada uno. No depende de los parámetros. */
function compilar(training) {
  const index = new Map();
  const at = name => {
    if (!index.has(name)) index.set(name, index.size);
    return index.get(name);
  };
  const R = training.length;
  const hI = new Int32Array(R), aI = new Int32Array(R), gh = new Float64Array(R), ga = new Float64Array(R), day = new Float64Array(R);
  let last = NaN;
  for (let r = 0; r < R; r += 1) {
    const m = training[r];
    hI[r] = at(m.home); aI[r] = at(m.away); gh[r] = m.hs; ga[r] = m.as;
    day[r] = m.dateISO ? dayOf(m.dateISO) : NaN;
    if (Number.isFinite(day[r]) && !(day[r] <= last)) last = day[r];
  }
  return { index, n: index.size, R, hI, aI, gh, ga, day, last };
}

/* Ataque y defensa de cada equipo: el mismo ascenso por coordenadas de src/pronostico.js (cada paso, el
 * mejor A con las D fijas, el mejor D con las A fijas y el mejor b con las dos), con cada partido pesado
 * por el olvido (1 sin él: entonces da exactamente lo mismo que fitRatings de src/pronostico.js). Además
 * del ajuste, el apoyo de cada fuerza (los goles, pesados, más k·e0: la forma de su a posteriori Gamma). */
function ajustarFuerzas(c, p, refDay) {
  const { n, R, hI, aI, gh, ga, day } = c;
  const ref = Number.isFinite(refDay) ? refDay : c.last;
  const w = new Float64Array(R).fill(1);
  if (p.decay > 0) for (let r = 0; r < R; r += 1) if (Number.isFinite(day[r])) w[r] = Math.exp(-p.decay * Math.max(0, ref - day[r]));
  const gf = new Float64Array(n), gc = new Float64Array(n);
  let total = 0, W = 0;
  for (let r = 0; r < R; r += 1) {
    const h = hI[r], a = aI[r], wr = w[r];
    gf[h] += wr * gh[r]; gc[a] += wr * gh[r]; gf[a] += wr * ga[r]; gc[h] += wr * ga[r];
    total += wr * (gh[r] + ga[r]); W += wr;
  }
  const H = p.home, k = p.shrink;
  const e0 = total / (2 * W);
  const A = new Float64Array(n).fill(1), D = new Float64Array(n).fill(1);
  let b = total / (W * (1 + H));
  // Un grupo sin un solo gol: todos en la media, con medias de cero (todo al 0-0), como src/pronostico.js.
  if (total > 0) {
    const ex = new Float64Array(n);
    for (let it = 0; it < ITERATIONS; it += 1) {
      let delta = 0;
      ex.fill(0);
      for (let r = 0; r < R; r += 1) { ex[hI[r]] += w[r] * b * H * D[aI[r]]; ex[aI[r]] += w[r] * b * D[hI[r]]; }
      for (let i = 0; i < n; i += 1) {
        const next = (gf[i] + k * e0) / (ex[i] + k * e0);
        delta = Math.max(delta, Math.abs(Math.log(next / A[i])));
        A[i] = next;
      }
      ex.fill(0);
      for (let r = 0; r < R; r += 1) { ex[aI[r]] += w[r] * b * H * A[hI[r]]; ex[hI[r]] += w[r] * b * A[aI[r]]; }
      for (let i = 0; i < n; i += 1) {
        const next = (gc[i] + k * e0) / (ex[i] + k * e0);
        delta = Math.max(delta, Math.abs(Math.log(next / D[i])));
        D[i] = next;
      }
      let expected = 0;
      for (let r = 0; r < R; r += 1) expected += w[r] * (H * A[hI[r]] * D[aI[r]] + A[aI[r]] * D[hI[r]]);
      const nextB = total / expected;
      delta = Math.max(delta, Math.abs(Math.log(nextB / b)));
      b = nextB;
      if (delta < TOLERANCE) break;
    }
  }
  const s0 = k * e0;
  return { base: b, home: H, index: c.index, A, D, sA: gf.map(g => g + s0), sD: gc.map(g => g + s0), s0 };
}

/* Ataque, defensa y apoyos de los equipos con los partidos `training` (los de trainingFor): { base, home,
 * teams: Map(equipo → { attack, defense, apoyoAtaque, apoyoDefensa }) } o null sin partidos. `refDate`
 * (AAAA-MM-DD), el día desde el que cuenta el olvido (sin él, el último partido). */
export function fitRatings(training, params = PARAMS_ACTUAL, refDate = null) {
  if (!training || !training.length) return null;
  const p = { ...PARAMS_ACTUAL, ...params };
  const fit = ajustarFuerzas(compilar(training), p, refDate ? dayOf(refDate) : NaN);
  const teams = new Map([...fit.index].map(([name, i]) => [name, { attack: fit.A[i], defense: fit.D[i], apoyoAtaque: fit.sA[i], apoyoDefensa: fit.sD[i] }]));
  return { base: fit.base, home: fit.home, teams };
}

// ── Del ajuste al 1X2 ────────────────────────────────────────────────────────────────────────────────

/* Probabilidades de 0, 1, 2… goles con media `mean`: Poisson o, con `size` finito, binomial negativa
 * (varianza mean + mean²/size). Hasta donde la cola ya no pesa, y normalizadas (la de src/pronostico.js). */
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

/* P(local), P(empate) y P(visitante) con las medias y los tamaños de cada lado (Infinity: Poisson), la
 * corrección de Dixon-Coles (rho) y el factor de empate (draw). Goles independientes salvo esas dos. */
export function outcome(meanHome, meanAway, params = PARAMS_ACTUAL, sizeHome = null, sizeAway = null) {
  const p = { ...PARAMS_ACTUAL, ...params };
  const ph = goalPmf(meanHome, sizeHome ?? p.size), pa = goalPmf(meanAway, sizeAway ?? p.size);
  const F = new Float64Array(pa.length);
  let cum = 0;
  for (let j = 0; j < pa.length; j += 1) { cum += pa[j]; F[j] = cum; }
  let home = 0, draw = 0, away = 0;
  for (let i = 0; i < ph.length; i += 1) {
    const below = i === 0 ? 0 : F[Math.min(i - 1, pa.length - 1)];
    const eq = i < pa.length ? pa[i] : 0;
    home += ph[i] * below; draw += ph[i] * eq; away += ph[i] * (cum - below - eq);
  }
  if (p.rho) {
    const t00 = Math.max(0, 1 - meanHome * meanAway * p.rho), t01 = Math.max(0, 1 + meanHome * p.rho);
    const t10 = Math.max(0, 1 + meanAway * p.rho), t11 = Math.max(0, 1 - p.rho);
    draw += ph[0] * pa[0] * (t00 - 1) + ph[1] * pa[1] * (t11 - 1);
    home += ph[1] * pa[0] * (t10 - 1);
    away += ph[0] * pa[1] * (t01 - 1);
  }
  draw *= p.draw;
  const sum = home + draw + away;
  return { pHome: home / sum, pDraw: draw / sum, pAway: away / sum };
}

// Las medias (amortiguadas) y los tamaños de los goles de los dos en un partido, con el ajuste `fit`.
function mediasDe(fit, match, p) {
  const i = fit.index.get(match.home), j = fit.index.get(match.away);
  const A = x => (x === undefined ? 1 : fit.A[x]), D = x => (x === undefined ? 1 : fit.D[x]);
  const soft = x => (x > p.soften ? p.soften * (1 + Math.log(x / p.soften)) : x);
  const xgHome = soft(fit.base * fit.home * A(i) * D(j));
  const xgAway = soft(fit.base * A(j) * D(i));
  let sizeHome = p.size, sizeAway = p.size;
  if (p.uncert > 0) {
    const sA = x => (x === undefined ? fit.s0 : fit.sA[x]), sD = x => (x === undefined ? fit.s0 : fit.sD[x]);
    const inv0 = Number.isFinite(p.size) ? 1 / p.size : 0;
    sizeHome = 1 / (inv0 + p.uncert * (1 / sA(i) + 1 / sD(j)));
    sizeAway = 1 / (inv0 + p.uncert * (1 / sA(j) + 1 / sD(i)));
  }
  return { xgHome, xgAway, sizeHome, sizeAway };
}

function pronosticoCon(fit, match, p) {
  const m = mediasDe(fit, match, p);
  return { ...outcome(m.xgHome, m.xgAway, p, m.sizeHome, m.sizeAway), ...m };
}

/* El pronóstico de `match` con los partidos `training`: { pHome, pDraw, pAway, xgHome, xgAway, sizeHome,
 * sizeAway } o null sin partidos. Sin caché: es lo que usaría la web, un ajuste por jornada. */
export function pronosticar(training, match, params = PARAMS_ACTUAL) {
  if (!training || !training.length || !match) return null;
  const p = { ...PARAMS_ACTUAL, ...params };
  const fit = ajustarFuerzas(compilar(training), p, match.dateISO ? dayOf(match.dateISO) : NaN);
  return pronosticoCon(fit, match, p);
}

const fitKey = p => `${p.shrink}|${p.home}|${p.decay}`;
const same = (a, b) => a.length === b.length && a.every((x, i) => x === b[i]);

/* Un predictor del banco con unos parámetros fijos. Caché por grupo: los partidos de una jornada con el
 * mismo entrenamiento (la misma jornada y el mismo número de partidos; con olvido, además, el mismo día)
 * comparten ajuste, y se comprueba que son los mismos partidos. Solo es una caché: el resultado es el mismo. */
export function crear(params) {
  const p = Object.freeze({ ...PARAMS_ACTUAL, ...params });
  const memo = new WeakMap();
  return function predictor(training, match, group) {
    if (!training || !training.length || !match) return null;
    const refDay = match.dateISO ? dayOf(match.dateISO) : NaN;
    let fit = null;
    if (group && typeof group === 'object') {
      if (!memo.has(group)) memo.set(group, new Map());
      const byKey = memo.get(group);
      const key = `${match.roundKey}\u0001${training.length}\u0001${p.decay > 0 ? match.dateISO : ''}`;
      const hit = byKey.get(key);
      if (hit && same(hit.training, training)) fit = hit.fit;
      else {
        fit = ajustarFuerzas(compilar(training), p, refDay);
        byKey.set(key, { training, fit });
      }
    } else fit = ajustarFuerzas(compilar(training), p, refDay);
    const f = pronosticoCon(fit, match, p);
    return { pHome: f.pHome, pDraw: f.pDraw, pAway: f.pAway, xgHome: f.xgHome, xgAway: f.xgAway };
  };
}

// ── La búsqueda de los parámetros (solo con el banco de AJUSTE) ─────────────────────────────────────

/* Las parejas del banco, preparadas una vez: cada entrenamiento distinto, compilado una vez (`unidades`), y
 * cada pareja con el suyo, su día, su resultado y su tramo. */
function preparar(pares) {
  const unidades = [];
  const porClave = new Map();
  const filas = pares.map(x => {
    const key = `${x.clave}\u0001${x.match.roundKey}\u0001${x.training.length}`;
    if (!porClave.has(key)) { porClave.set(key, unidades.length); unidades.push(compilar(x.training)); }
    return { u: porClave.get(key), day: x.match.dateISO ? dayOf(x.match.dateISO) : NaN, match: x.match, y: x.y, tramo: x.tramo };
  });
  return { unidades, filas, fits: new Map() };
}

// Los ajustes de todas las parejas con `p` (los de los mismos k, campo y olvido se guardan: la búsqueda de
// los demás parámetros no vuelve a ajustar nada).
function ajustesDe(datos, p) {
  const key = fitKey(p);
  if (datos.fits.has(key)) return datos.fits.get(key);
  const porUnidad = new Map();
  const out = datos.filas.map(f => {
    const k = p.decay > 0 ? `${f.u}\u0001${f.day}` : f.u;
    if (!porUnidad.has(k)) porUnidad.set(k, ajustarFuerzas(datos.unidades[f.u], p, f.day));
    return porUnidad.get(k);
  });
  if (datos.fits.size >= 48) datos.fits.delete(datos.fits.keys().next().value);
  datos.fits.set(key, out);
  return out;
}

const logLoss = (q, y) => -Math.log(Math.max(EPS, y === 'home' ? q.pHome : y === 'draw' ? q.pDraw : q.pAway));

// El log-loss medio del 1X2 de las parejas con `p`, y por tramo.
function puntuar(datos, p) {
  const fits = ajustesDe(datos, p);
  let sum = 0;
  const t = {};
  datos.filas.forEach((f, i) => {
    const ll = logLoss(pronosticoCon(fits[i], f.match, p), f.y);
    sum += ll;
    if (!t[f.tramo]) t[f.tramo] = [0, 0];
    t[f.tramo][0] += ll; t[f.tramo][1] += 1;
  });
  return { logLoss: sum / datos.filas.length, porTramo: Object.fromEntries(Object.entries(t).map(([k, [s, n]]) => [k, s / n])) };
}

// Tres cifras significativas (los parámetros que se escriben), y 0 e Infinity tal cual.
const redondo = v => (v === 0 || !Number.isFinite(v) ? v : Number(v.toPrecision(3)));

/* Búsqueda por patrones de los parámetros libres de una variante: para cada uno, un paso arriba o abajo en
 * su coordenada mientras mejore el log-loss; cuando ninguno mejora, pasos de la mitad, hasta el último.
 * Determinista. Al final, cada parámetro a tres cifras (si eso no empeora más de una diezmilésima, que con
 * 2.331 partidos es nada; si no, el valor sin redondear). */
function buscar(datos, variante) {
  let p = { ...PARAMS_ACTUAL, ...variante.inicio };
  let best = puntuar(datos, p).logLoss;
  const coord = Object.fromEntries(variante.libres.map(k => [k, ESPACIO[k].a(p[k])]));
  const paso = Object.fromEntries(variante.libres.map(k => [k, ESPACIO[k].paso]));
  for (;;) {
    let moved = false;
    for (const k of variante.libres) {
      const e = ESPACIO[k];
      for (const dir of [1, -1]) {
        for (;;) {
          const c = Math.min(e.hi, Math.max(e.lo, coord[k] + dir * paso[k]));
          if (c === coord[k]) break;
          const q = { ...p, [k]: e.de(c) };
          const s = puntuar(datos, q).logLoss;
          if (s < best - 1e-7) { best = s; p = q; coord[k] = c; moved = true; } else break;
        }
      }
    }
    if (moved) continue;
    if (variante.libres.every(k => paso[k] <= ESPACIO[k].fin)) break;
    for (const k of variante.libres) paso[k] = Math.max(ESPACIO[k].fin, paso[k] / 2);
  }
  const r = { ...p };
  for (const k of variante.libres) r[k] = redondo(p[k]);
  return puntuar(datos, r).logLoss <= best + 1e-4 ? r : p;
}

const aJSON = p => Object.fromEntries(Object.entries(p).map(([k, v]) => [k, v === Infinity ? 'Infinity' : v]));
const r6 = x => Math.round(x * 1e6) / 1e6;

function ajustarVariante(datos, nombreV) {
  const v = VARIANTES[nombreV];
  const params = Object.freeze(v.libres.length ? buscar(datos, v) : { ...PARAMS_ACTUAL, ...v.inicio });
  const s = puntuar(datos, params);
  return { params, logLoss: s.logLoss, porTramo: s.porTramo };
}

// Lo que se fija con el banco y lo que usa el predictor por defecto (al cargar, lo escrito arriba).
let actuales = { ...AJUSTADOS };
let elegida = ELEGIDA;
let predictorElegido = crear(actuales[elegida]);

/* El ajuste de toda la familia con el banco de AJUSTE: cada variante con sus parámetros, y la elegida (la de
 * menos parámetros libres a menos de una milésima de log-loss de la mejor; a igualdad, la de menor log-loss).
 * Devuelve { elegida, regla, params, coinciden, variantes: { nombre: { libres, params, logLossAjuste,
 * porTramoAjuste } } } y deja la elegida como el predictor del módulo. */
export function ajustar(banco) {
  const datos = preparar(banco.pares);
  const hechos = {};
  for (const nombreV of Object.keys(VARIANTES)) hechos[nombreV] = ajustarVariante(datos, nombreV);
  const candidatas = Object.keys(VARIANTES).filter(n => n !== 'actual');
  const mejor = Math.min(...candidatas.map(n => hechos[n].logLoss));
  const dentro = candidatas.filter(n => hechos[n].logLoss <= mejor + 1e-3);
  dentro.sort((a, b) => VARIANTES[a].libres.length - VARIANTES[b].libres.length || hechos[a].logLoss - hechos[b].logLoss);
  const coinciden = dentro[0] === ELEGIDA && Object.keys(VARIANTES).every(n => JSON.stringify(aJSON(hechos[n].params)) === JSON.stringify(aJSON(AJUSTADOS[n])));
  actuales = Object.fromEntries(Object.entries(hechos).map(([n, h]) => [n, h.params]));
  elegida = dentro[0];
  predictorElegido = crear(actuales[elegida]);
  return {
    elegida,
    regla: 'la de menos parámetros libres a menos de 0,001 de log-loss de la mejor en el ajuste (actual no entra)',
    params: aJSON(actuales[elegida]),
    coinciden,
    variantes: Object.fromEntries(Object.entries(hechos).map(([n, h]) => [n, {
      libres: VARIANTES[n].libres, params: aJSON(h.params), logLossAjuste: r6(h.logLoss),
      porTramoAjuste: Object.fromEntries(Object.entries(h.porTramo).map(([t, v]) => [t, r6(v)])),
    }])),
  };
}

export function predictor(training, match, group, info) {
  return predictorElegido(training, match, group, info);
}

/* Una variante como modelo del banco, con su propio ajuste: { nombre, descripcion, ajustar, predictor }.
 * Sin ajustar, los parámetros escritos en AJUSTADOS. Para comparar las variantes entre sí con ejecutar(). */
export function variante(nombreV) {
  if (!Object.hasOwn(VARIANTES, nombreV)) throw new RangeError(`poisson: variante desconocida (${nombreV})`);
  let pred = crear(AJUSTADOS[nombreV]);
  return {
    nombre: `poisson-${nombreV}`,
    descripcion: VARIANTES[nombreV].descripcion,
    ajustar(banco) {
      const h = ajustarVariante(preparar(banco.pares), nombreV);
      pred = crear(h.params);
      return { params: aJSON(h.params), logLossAjuste: r6(h.logLoss) };
    },
    predictor: (training, match, group, info) => pred(training, match, group, info),
  };
}
