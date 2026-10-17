/* RESULTADO DE LA ELECCIÓN (17/10/2026): ELEGIDO. Es el 1X2 de la web desde hoy: src/pronostico.js lo lleva
 * dentro (fitNotes y notesOdds, con estos PARAMS con otros nombres: k → cushion, lambda → ridge, home →
 * ratingHome, beta → slope, theta → band, kappa → slopeVar, empate → bandVar), y el marcador más probable
 * sigue saliendo del Poisson, dentro de su favorito. En EVALUACIÓN (2.747 partidos), log-loss 0,534 frente
 * a 0,544 del Poisson de antes: Δ −0,010 [−0,016, −0,003]; Brier −0,006 [−0,009, −0,003]; acierto 79,5 %
 * frente a 79,1 % (+0,4 puntos [−0,2, +1,1]). Ninguna otra familia ni mezcla lo mejora (la tabla, en la
 * cabecera de scripts/pronostico_banco.mjs). El campo se queda: sin él, +0,001 [−0,004, +0,005] de
 * log-loss y −0,9 puntos [−1,7, −0,2] de acierto. Este fichero sigue siendo el ajuste (`node
 * scripts/backtest_pronostico.mjs --calibrar` lo repite) y la referencia con la que test_pronostico_banco.mjs
 * comprueba que la web da lo mismo. En las cifras de abajo, «actual» es el Poisson de antes (hoy, la
 * referencia «poisson» del banco: --contra poisson).
 *
 * Pronóstico de prebenjamín, familia Massey (17/10/2026): la «regla de tres» de los rivales comunes,
 * hecha cuenta para todo el grupo a la vez. Para el banco (scripts/pronostico_banco.mjs); puro, sin
 * dependencias y determinista: en la web se calcularía en el navegador (un sistema de 16×16 por partido).
 *
 * El modelo, en llano: cada equipo tiene una nota r, y en cada partido jugado
 *     r_local − r_visitante + campo ≈ ln((goles del local + k) / (goles del visitante + k)),
 * es decir, la diferencia de notas es «cuántas veces más goles» mete uno que otro, con k = 3,6 goles de
 * colchón, que recorta las goleadas sin tirarlas (un 15-0 cuenta 1,6; un 30-0, 2,2; un 5-4, 0,1). Las notas
 * son las que mejor cuadran con todos los partidos a la vez (mínimos cuadrados, el método de Massey): si A
 * le ganó a B por mucho y B a C por mucho, A le saca a C lo que sumen, aunque no se hayan visto; y si se
 * vieron, ese partido pesa como uno más. Con ridge (λ = 0,34 partidos ficticios contra la media), un equipo
 * con poco jugado se queda cerca de la media. De la diferencia de notas d del partido sale el 1X2 con una
 * logística ordenada con banda de empate:
 *     P(local) = σ(s·d − t),  P(visitante) = σ(−s·d − t),  P(empate) = el resto,
 * con s = β / √(1 + κ·v), t = θ / √(1 + κₑ·v) y v la varianza (relativa) de d: con pocos partidos, o con
 * un equipo que aún no ha jugado, las notas están poco medidas, v es grande y el pronóstico se acerca al
 * 50 %, sin inflar el empate (con la banda fija, con una jornada daba un 13 % de empates y hay un 8 %).
 *
 * Solo con los partidos de ESTA temporada del grupo (el `training` del banco; de `group` no se usa nada).
 * Las temporadas de AJUSTE (2013-14 a 2020-21) fijan los siete parámetros globales (ajustar) y deciden la
 * variante; las de EVALUACIÓN (2021-22 a 2025-26) solo la puntúan.
 *
 * Lo que se probó en AJUSTE (log-loss del 1X2; «actual», src/pronostico.js, da 0,523 ahí, con unos PARAMS
 * que vieron también la evaluación), cada uno con su conversión ajustada:
 * - el objetivo: la diferencia de goles recortada a c (c = 1 es Colley, solo ganar o perder: 0,561 con
 *   λ = 0,5; c = 5, 0,529; c = 12, 0,517; sin recorte, 0,520), su logaritmo con signo (s·ln(1 + |dg|/s),
 *   0,516) y el logaritmo del cociente con colchón k (0,5131 con la banda fija, el mejor; con k proporcional
 *   a los goles medios del grupo, 0,5139; con un tope de goles por equipo, 0,513-0,516; sumándole el signo
 *   del resultado, 0,5128);
 * - Bradley-Terry con empates (logística ordenada por máxima verosimilitud con previo gaussiano, solo con
 *   ganar, empatar o perder): 0,558, muy lejos (en EVALUACIÓN, 0,575): en prebenjamín el «por cuánto»
 *   dice mucho;
 * - la banda de empate que se estrecha con la varianza (κₑ): 0,5117 frente a 0,5131: se queda;
 * - el campo: sin él, 0,5174 (+0,006); con él, el local mete un 6 % más (0,059 en la escala del
 *   logaritmo). Se queda, aunque en EVALUACIÓN da lo mismo (+0,001 [−0,004, +0,005] sin él);
 * - descartadas porque mejoran menos de una milésima, o nada: el peso de los partidos recientes (vida media
 *   de 120 días, −0,0004), la banda de empate según los goles del grupo (0), la varianza de los residuos
 *   del grupo (−0,0005), un multiplicador de la pendiente por tramo (−0,0009, sin orden), la normal (probit)
 *   en lugar de la logística (+0,001) y la media con «actual» (en AJUSTE, lo mejor es Massey solo).
 *
 * En EVALUACIÓN (2.747 partidos de 28 grupos; IC 95 % por bootstrap de temporada-grupo, B = 2000): log-loss
 * 0,534 [0,480, 0,597] y acierto 79,5 %, frente a 0,544 y 79,1 % de «actual»: Δ log-loss −0,010 [−0,016,
 * −0,003], mejor en el 99,9 % de las remuestras; por tramo, −0,015 (1 jornada), −0,039 (2), −0,027 (3),
 * −0,002 (4-6) y −0,008 (7+; el único con el intervalo entero por debajo de cero). Frente a «la tabla»,
 * −0,145 [−0,167, −0,118]. Solo da el 1X2: el marcador más probable seguiría saliendo de Poisson. */
export const nombre = 'Massey';
export const descripcion = 'Massey con ridge sobre ln((goles+k)/(goles rival+k)) con campo; 1X2 por logística ordenada con banda de empate y pendiente según la varianza de la diferencia';

/* Los parámetros, los que da ajustar con las temporadas de AJUSTE (redondeados a tres cifras; ajustar los
 * vuelve a calcular y el predictor usa los suyos):
 * - k: el colchón de goles del objetivo ln((gl + k) / (gv + k));
 * - lambda: el ridge, partidos ficticios de cada equipo contra la media (nota 0);
 * - home: el campo, en la escala del objetivo (lo que se resta a cada partido jugado y se suma al pronóstico);
 * - beta: la pendiente de la logística sobre la diferencia de notas;
 * - theta: la mitad de la banda de empate;
 * - kappa: cuánto baja la pendiente con la varianza de la diferencia (β / √(1 + κ·v));
 * - empate: cuánto se estrecha la banda de empate con esa varianza (θ / √(1 + empate·v)). */
export const PARAMS = Object.freeze({ k: 3.64, lambda: 0.335, home: 0.0586, beta: 5.58, theta: 0.385, kappa: 1.85, empate: 0.925 });

let params = PARAMS;

const sigma = x => (x >= 0 ? 1 / (1 + Math.exp(-x)) : Math.exp(x) / (1 + Math.exp(x)));

// Cholesky de una matriz simétrica definida positiva n×n (fila a fila), y la solución de L·Lᵀ·x = b.
function cholesky(M, n) {
  const L = new Float64Array(n * n);
  for (let i = 0; i < n; i += 1) {
    for (let j = 0; j <= i; j += 1) {
      let s = M[i * n + j];
      for (let q = 0; q < j; q += 1) s -= L[i * n + q] * L[j * n + q];
      L[i * n + j] = i === j ? Math.sqrt(s) : s / L[j * n + j];
    }
  }
  return L;
}
function solve(L, n, b) {
  const y = new Float64Array(n), x = new Float64Array(n);
  for (let i = 0; i < n; i += 1) {
    let s = b[i];
    for (let q = 0; q < i; q += 1) s -= L[i * n + q] * y[q];
    y[i] = s / L[i * n + i];
  }
  for (let i = n - 1; i >= 0; i -= 1) {
    let s = y[i];
    for (let q = i + 1; q < n; q += 1) s -= L[q * n + i] * x[q];
    x[i] = s / L[i * n + i];
  }
  return x;
}

export const objetivo = (hs, as, k) => Math.log((hs + k) / (as + k));

/* Las notas de Massey con ridge de los partidos `training` (los del banco: con marcador, del grupo y de
 * antes), con `match` (su local y su visitante entran aunque no hayan jugado: con nota 0). Como el campo
 * entra lineal, se resuelve una vez sin él: d0 es la diferencia de notas del partido sin campo y g lo que
 * el campo de los partidos jugados mueve esa diferencia (con campo h: d = d0 + h·(1 − g)); v, la varianza
 * relativa de la diferencia (cᵀ·M⁻¹·c, con M = XᵀX + λI). Devuelve { d0, g, v, teams: Map(equipo → nota sin
 * campo) } o null sin partidos. */
export function notas(training, match, { k, lambda }) {
  if (!training || !training.length) return null;
  const index = new Map();
  const at = name => { if (!index.has(name)) index.set(name, index.size); return index.get(name); };
  for (const m of training) { at(m.home); at(m.away); }
  at(match.home); at(match.away);
  const n = index.size;
  const M = new Float64Array(n * n), b = new Float64Array(n), u = new Float64Array(n);
  for (const m of training) {
    const i = index.get(m.home), j = index.get(m.away);
    const y = objetivo(m.hs, m.as, k);
    M[i * n + i] += 1; M[j * n + j] += 1; M[i * n + j] -= 1; M[j * n + i] -= 1;
    b[i] += y; b[j] -= y; u[i] += 1; u[j] -= 1;
  }
  for (let i = 0; i < n; i += 1) M[i * n + i] += lambda;
  const L = cholesky(M, n);
  const r = solve(L, n, b), q = solve(L, n, u);
  const h = index.get(match.home), a = index.get(match.away);
  const c = new Float64Array(n);
  c[h] = 1; c[a] = -1;
  const w = solve(L, n, c);
  return { d0: r[h] - r[a], g: q[h] - q[a], v: w[h] - w[a], teams: new Map([...index].map(([name, i]) => [name, r[i]])) };
}

// Del ajuste de un partido (d0, g, v) y los parámetros de la conversión, el 1X2: la pendiente y la banda
// de empate bajan con la varianza de la diferencia, cada una con lo suyo (kappa y empate).
export function conversion({ d0, g, v }, { home, beta, theta, kappa, empate }) {
  const d = d0 + home * (1 - g);
  const s = beta / Math.sqrt(1 + kappa * v), t = theta / Math.sqrt(1 + empate * v);
  const pHome = sigma(s * d - t), pAway = sigma(-s * d - t);
  return { pHome, pDraw: Math.max(0, 1 - pHome - pAway), pAway, d };
}

/* El 1X2 de `match` con los partidos `training` y unos parámetros: { pHome, pDraw, pAway, d } (d, la
 * diferencia de notas con el campo) o null sin partidos. */
export function pronostico(training, match, p = params) {
  const fit = notas(training, match, p);
  return fit && conversion(fit, p);
}

export function predictor(training, match) {
  const f = pronostico(training, match, params);
  return f && { pHome: f.pHome, pDraw: f.pDraw, pAway: f.pAway };
}

// ── El ajuste (solo con las parejas del banco de AJUSTE) ─────────────────────────────────────────────

// Nelder-Mead, determinista (mismo punto de partida y mismos pasos): minimiza f en Rⁿ.
function nelderMead(f, x0, step, { iters = 600, tol = 1e-10 } = {}) {
  const n = x0.length;
  let pts = [x0.slice()];
  for (let i = 0; i < n; i += 1) { const x = x0.slice(); x[i] += step[i]; pts.push(x); }
  let vals = pts.map(f);
  for (let it = 0; it < iters; it += 1) {
    const order = vals.map((_, i) => i).sort((a, b) => vals[a] - vals[b] || a - b);
    pts = order.map(i => pts[i]); vals = order.map(i => vals[i]);
    if (vals[n] - vals[0] < tol) break;
    const cen = new Array(n).fill(0);
    for (let i = 0; i < n; i += 1) for (let j = 0; j < n; j += 1) cen[j] += pts[i][j] / n;
    const along = t => cen.map((c, j) => c + t * (pts[n][j] - c));
    const xr = along(-1), fr = f(xr);
    if (fr < vals[0]) {
      const xe = along(-2), fe = f(xe);
      [pts[n], vals[n]] = fe < fr ? [xe, fe] : [xr, fr];
    } else if (fr < vals[n - 1]) {
      [pts[n], vals[n]] = [xr, fr];
    } else {
      const xc = fr < vals[n] ? along(-0.5) : along(0.5), fc = f(xc);
      if (fc < Math.min(fr, vals[n])) [pts[n], vals[n]] = [xc, fc];
      else for (let i = 1; i <= n; i += 1) { pts[i] = pts[i].map((x, j) => pts[0][j] + 0.5 * (x - pts[0][j])); vals[i] = f(pts[i]); }
    }
  }
  const best = vals.indexOf(Math.min(...vals));
  return { x: pts[best], f: vals[best] };
}

const LOG_EPS = 1e-15;
const logLossOf = (f, y) => -Math.log(Math.max(LOG_EPS, y === 'home' ? f.pHome : y === 'away' ? f.pAway : f.pDraw));
const tres = x => Number(x.toPrecision(3));

/* El ajuste de los siete parámetros por máxima verosimilitud del 1X2 (el log-loss medio) en las parejas de
 * AJUSTE: por fuera, k y λ (Nelder-Mead en logaritmos; cada punto resuelve las notas de todas las
 * parejas); por dentro, la conversión (β, θ, κ, la de la banda de empate y el campo), con las notas ya
 * resueltas, siempre desde el mismo punto. Las variantes, para compararlas: `campo: false` fija el campo a 0
 * y `empate: false`, la banda de empate fija (su κ a 0). Deja los parámetros, redondeados a tres cifras, en
 * el módulo (los usa el predictor) y los devuelve con el log-loss de ajuste que dan. Unos cuatro segundos. */
export function ajustar(banco, { campo = true, empate = true } = {}) {
  const pairs = banco.pares;
  // Los de la conversión que se ajustan, con su punto de partida y su paso (β, θ, κ y la de la banda en
  // logaritmos; el campo, tal cual).
  const free = [
    ['beta', Math.log(5), 0.3, Math.exp], ['theta', Math.log(0.3), 0.3, Math.exp], ['kappa', Math.log(1.5), 0.5, Math.exp],
    ...(empate ? [['empate', Math.log(1), 1, Math.exp]] : []), ...(campo ? [['home', 0.05, 0.05, x => x]] : []),
  ];
  const conv = x => Object.fromEntries([['home', 0], ['empate', 0], ...free.map(([key, , , f], i) => [key, f(x[i])])]);
  const loss = (rows, p) => {
    let s = 0;
    for (const r of rows) s += logLossOf(conversion(r, p), r.y);
    return s / rows.length;
  };
  const fitInner = rows => nelderMead(x => loss(rows, conv(x)), free.map(f => f[1]), free.map(f => f[2]), { iters: 600, tol: 1e-11 });
  const rowsOf = (k, lambda) => pairs.map(pr => ({ ...notas(pr.training, pr.match, { k, lambda }), y: pr.y }));
  const best = nelderMead(x => fitInner(rowsOf(Math.exp(x[0]), Math.exp(x[1]))).f, [Math.log(3), Math.log(0.3)], [0.3, 0.3], { iters: 60, tol: 1e-7 });
  const k = tres(Math.exp(best.x[0])), lambda = tres(Math.exp(best.x[1]));
  const rows = rowsOf(k, lambda);
  const p = conv(fitInner(rows).x);
  params = Object.freeze({ k, lambda, home: tres(p.home), beta: tres(p.beta), theta: tres(p.theta), kappa: tres(p.kappa), empate: tres(p.empate) });
  const coincide = Object.keys(PARAMS).every(key => PARAMS[key] === params[key]);
  return { params: { ...params }, logLossAjuste: Number(loss(rows, params).toFixed(6)), pares: pairs.length, campo, empate, coincideConPARAMS: coincide };
}

// Los parámetros con los que pronostica ahora el módulo (los de ajustar, si se ha llamado; si no, PARAMS).
export const parametros = () => params;
