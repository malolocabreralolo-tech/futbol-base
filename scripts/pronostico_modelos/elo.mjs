/* RESULTADO DE LA ELECCIÓN (17/10/2026): NO ELEGIDO. En EVALUACIÓN, la variante 'goles' da 0,538 de log-loss
 * y 79,4 % de acierto: frente al Poisson de antes, −0,006 [−0,013, +0,001] (no es una diferencia real) y
 * frente a Massey (el elegido), +0,004 [−0,001, +0,008]: empatan, y a igualdad va el más sencillo (Massey:
 * una nota por equipo y un sistema lineal, sin Newton ni ψ). La mezcla Massey 0,74 + Elo 0,26 (pesos del
 * ajuste) empata con Massey solo: +0,000 [−0,001, +0,001]. En las cifras de abajo, «actual» es el Poisson
 * de antes (hoy, la referencia «poisson» del banco: --contra poisson).
 *
 * Pronóstico de prebenjamín, familia Elo (17/10/2026): un candidato para el banco de pruebas
 * (scripts/pronostico_banco.mjs), no lo que enseña la web. Puro, sin dependencias ni globales y
 * determinista, como src/pronostico.js: en la web se calcularía en el navegador (medio milisegundo por
 * partido) con los partidos ya jugados del grupo. Solo usa los resultados del entrenamiento de cada partido
 * (los de ESTA temporada y este grupo); de `group`, nada. Todos los equipos empiezan igual (0) cada
 * temporada en cada grupo.
 *
 * Tres variantes (VARIANTES), cada una con sus parámetros fijados SOLO con las temporadas de ajuste
 * (2013-14 a 2020-21; `ajustar` los vuelve a buscar con el banco de ajuste y llega a los mismos):
 * - 'elo': el Elo clásico con margen de goles, al estilo del World Football Elo. Los partidos se procesan
 *   por fecha (los de un mismo día, con las puntuaciones del principio del día: no depende del orden de
 *   la fuente). Esperado del local E = 1 / (1 + 10^(−(R_local − R_visitante + campo)/400)); resultado
 *   W = 1, ½ o 0; y R_local += K·G·(W − E), R_visitante −= lo mismo, con G = (1 + n)^γ el multiplicador
 *   por la diferencia de goles n, con tope. (El multiplicador tabulado del World Football Elo, 1, 1,5 y
 *   (11 + n)/8, queda peor en el ajuste, 0,551 frente a 0,541: margen 'wfe'.)
 * - 'iterado': el mismo Elo repasado hasta converger, que no depende del orden: las puntuaciones con las
 *   que ningún partido movería nada, Σ G·(W − E) = 0 para cada equipo (un Bradley-Terry ponderado por el
 *   margen), con `previo` empates ficticios de cada equipo contra uno de 0 para que un equipo que lo ha
 *   ganado todo no se vaya al infinito.
 * - 'goles' (la elegida): el Elo de goles repasado hasta converger. La puntuación está en goles y lo que
 *   se compara es la diferencia de goles (con tope): el local tiene que ganar por R_local − R_visitante +
 *   campo, y cada partido empuja con ψ(error) = s·ln(1 + |error|/s) (como los pi-ratings: un 15-0 cuenta
 *   más que un 3-0, pero no cinco veces más). Converger es resolverlo todo a la vez: Σ ψ(error) = previo·R
 *   para cada equipo. Es la «regla de tres» de los rivales comunes: si A le gana a B por 4 y B a C por 3,
 *   A le sacaría a C unos 7 (con el previo y ψ, sin campo, 5,4), y con más partidos, todas las cadenas a la vez.
 *
 * Las probabilidades, igual en las tres: un logit ordenado con banda de empate. Con x = escala·d (d, la
 * diferencia de puntuaciones más el campo), P(local) = σ(x − empate), P(visitante) = σ(−x − empate) y el
 * empate, lo que queda. En 'goles', además, los dos cortes se dividen por t = √(1 + incertidumbre·v), con
 * v la varianza de la diferencia de las dos puntuaciones (la inversa del hessiano: cuánto se sabe de cada
 * uno, de sus rivales y de lo que los une): P(local) = σ((x − empate)/t). Es la media del logit sobre lo
 * que no se sabe (la aproximación del probit, como en Glicko): con una o dos jornadas, los favoritos se
 * moderan y el empate no se infla (si solo se dividiera x, con una jornada daría un 13 % de empates, y hay
 * un 8 %).
 *
 * Lo que da el banco (17/10/2026; log-loss del 1X2 y, entre corchetes, el IC 95 % de la diferencia
 * pareada con «actual», el Poisson de src/pronostico.js, por bootstrap de temporada-grupo):
 * - ajuste (2.331 partidos): goles 0,514; iterado 0,539; elo 0,541; actual 0,523;
 * - evaluación (2021-22 a 2025-26, 2.747 partidos que el ajuste no ve): goles 0,538 (−0,006 [−0,013,
 *   +0,001]: empatado con «actual»; con 2 jornadas, −0,046 [−0,084, −0,012]); elo 0,557 (+0,013 [+0,002,
 *   +0,022]) e iterado 0,560 (+0,017 [+0,007, +0,025]), peores. El campo no cambia nada en la evaluación
 *   (goles con campo frente a sin él, −0,001 [−0,006, +0,003]; en el ajuste valía 0,006); quitar la
 *   incertidumbre sí empeora (+0,008 [+0,003, +0,014]).
 *
 * Contrato del banco: `nombre`, `ajustar(banco)` (busca los parámetros de las tres variantes con las
 * parejas de ajuste, elige la de menor log-loss y la deja activa; unos 45 s) y `predictor(training,
 * match)`. Además: `pronostico(training, match, params)` (con la diferencia y la varianza),
 * `predictorCon(params)`, `fuerzas(training, params)` y `buscar(pares, variante, opciones)`, para probar
 * variantes con el banco. */
export const nombre = 'Elo';
export const descripcion = 'Elo de goles iterado (diferencia de goles con tope y ψ logarítmica, previo, campo e incertidumbre) con logit ordenado; variantes elo (clásico, por fecha) e iterado';

const LN10 = Math.log(10);
const sigmoid = x => 1 / (1 + Math.exp(-x));
const scoreOf = (hs, as) => (hs > as ? 1 : hs < as ? 0 : 0.5);
const byDate = (a, b) => (a.dateISO < b.dateISO ? -1 : a.dateISO > b.dateISO ? 1 : 0);
const clampGoals = (g, tope) => Math.max(-tope, Math.min(tope, g));
// ψ y su derivada: lineal cerca del 0, logarítmica en las goleadas.
const psi = (e, s) => Math.sign(e) * s * Math.log1p(Math.abs(e) / s);
const dpsi = (e, s) => 1 / (1 + Math.abs(e) / s);
// ρ, la pérdida de la que ψ es la derivada (para el paso de Newton con retroceso).
const rho = (e, s) => { const a = Math.abs(e); return (s + a) * s * Math.log1p(a / s) - s * a; };
// ln σ(x), sin desbordar.
const lnSigmoid = x => (x >= 0 ? -Math.log1p(Math.exp(-x)) : x - Math.log1p(Math.exp(x)));

/* Los parámetros fijados con las temporadas de ajuste (17/10/2026; buscar() con las 2.331 parejas de
 * 2013-14 a 2020-21, desde dos puntos de partida lejanos en 'goles', con el mismo resultado). Log-loss
 * del 1X2 en el ajuste: elo 0,5410, iterado 0,5386, goles 0,5140 (sin campo, 0,5199). Comunes: campo (en
 * las unidades de la puntuación: puntos Elo o goles), escala y empate (el logit ordenado); incertidumbre,
 * solo en 'goles'. En 'goles': previo 0,25 (un cuarto de partido ficticio en el 0), s 2, tope 14 goles,
 * campo 0,45 goles (en las temporadas de ajuste, el local marca de media 0,25 más que el visitante). */
export const VARIANTES = Object.freeze({
  elo: Object.freeze({ variante: 'elo', margen: 'potencia', K: 20, gamma: 1, tope: 20, campo: 20, escala: 1.6955, empate: 0.296, incertidumbre: 0 }),
  iterado: Object.freeze({ variante: 'iterado', margen: 'potencia', previo: 64, gamma: 1.5, tope: 20, campo: 20, escala: 1.9504, empate: 0.298, incertidumbre: 0 }),
  goles: Object.freeze({ variante: 'goles', previo: 0.25, s: 2, tope: 14, campo: 0.45, escala: 0.7357, empate: 0.429, incertidumbre: 1.25 }),
});
export const PARAMS = VARIANTES.goles;

// ── Las puntuaciones ─────────────────────────────────────────────────────────────────────────────────

// Los equipos del entrenamiento, numerados en el orden en que salen.
function teamsOf(training) {
  const names = [];
  const index = new Map();
  for (const m of training) {
    for (const t of [m.home, m.away]) if (!index.has(t)) { index.set(t, names.length); names.push(t); }
  }
  return { names, index };
}

// El multiplicador por diferencia de goles n (con tope): (1 + n)^γ o el del World Football Elo.
export function multiplicador(diff, p) {
  const n = Math.min(Math.abs(diff), p.tope);
  if (p.margen === 'wfe') return n <= 1 ? 1 : n === 2 ? 1.5 : (11 + n) / 8;
  return (1 + n) ** p.gamma;
}

// Sistema lineal pequeño (un equipo por fila), por Gauss con pivote parcial. No toca A ni b.
function solve(A, b) {
  const n = b.length;
  const M = A.map((row, i) => { const x = new Float64Array(n + 1); x.set(row); x[n] = b[i]; return x; });
  for (let c = 0; c < n; c += 1) {
    let piv = c;
    for (let i = c + 1; i < n; i += 1) if (Math.abs(M[i][c]) > Math.abs(M[piv][c])) piv = i;
    [M[c], M[piv]] = [M[piv], M[c]];
    for (let i = c + 1; i < n; i += 1) {
      const f = M[i][c] / M[c][c];
      if (f) for (let j = c; j <= n; j += 1) M[i][j] -= f * M[c][j];
    }
  }
  const x = new Float64Array(n);
  for (let i = n - 1; i >= 0; i -= 1) {
    let s = M[i][n];
    for (let j = i + 1; j < n; j += 1) s -= M[i][j] * x[j];
    x[i] = s / M[i][i];
  }
  return x;
}

/* Newton con retroceso para una función estrictamente convexa de las puntuaciones: `local(r)` da
 * { f, g, H } (valor, gradiente y hessiano). Si un paso no baja f, se parte por la mitad (hasta 30
 * veces). Devuelve r y el hessiano del final. */
function newton(n, local) {
  let r = new Float64Array(n);
  let cur = local(r);
  for (let it = 0; it < 100; it += 1) {
    const step = solve(cur.H, cur.g);
    let t = 1, trial = null, next = null;
    for (let k = 0; k < 30; k += 1, t /= 2) {
      trial = r.map((v, i) => v - t * step[i]);
      next = local(trial);
      if (next.f <= cur.f + 1e-12) break;
    }
    let mx = 0;
    for (let i = 0; i < n; i += 1) mx = Math.max(mx, Math.abs(trial[i] - r[i]));
    r = trial; cur = next;
    if (mx < 1e-9) break;
  }
  return { r, H: cur.H };
}

// Elo clásico, por fecha: { rating (puntos), diff(local, visitante) (unidades del logit, con el campo) }.
export function eloSecuencial(training, p) {
  const R = new Map();
  const get = t => R.get(t) || 0;
  const ms = [...training].sort(byDate);
  for (let i = 0; i < ms.length;) {
    const day = ms[i].dateISO;
    const delta = new Map();
    for (; i < ms.length && ms[i].dateISO === day; i += 1) {
      const m = ms[i];
      const E = 1 / (1 + 10 ** (-(get(m.home) - get(m.away) + p.campo) / 400));
      const d = p.K * multiplicador(m.hs - m.as, p) * (scoreOf(m.hs, m.as) - E);
      delta.set(m.home, (delta.get(m.home) || 0) + d);
      delta.set(m.away, (delta.get(m.away) || 0) - d);
    }
    for (const [t, d] of delta) R.set(t, get(t) + d);
  }
  return { rating: R, diff: (h, a) => (get(h) - get(a) + p.campo) * LN10 / 400, varianza: () => 0 };
}

/* Elo iterado (Bradley-Terry ponderado): minimiza Σ G·(−W·ln E − (1 − W)·ln(1 − E)) más `previo` empates
 * ficticios de cada equipo contra uno de 0. Estrictamente convexa: una sola solución, la de cualquier
 * orden. rating, en puntos Elo; diff, en unidades del logit. */
export function eloIterado(training, p) {
  const { names, index } = teamsOf(training);
  const n = names.length;
  const h = p.campo * LN10 / 400;
  const rows = training.map(m => ({ h: index.get(m.home), a: index.get(m.away), W: scoreOf(m.hs, m.as), w: multiplicador(m.hs - m.as, p) }));
  const { r } = newton(n, r => {
    let f = 0;
    const g = new Float64Array(n);
    const H = Array.from({ length: n }, () => new Float64Array(n));
    for (let i = 0; i < n; i += 1) {
      const s = sigmoid(r[i]);
      f -= p.previo * 0.5 * (lnSigmoid(r[i]) + lnSigmoid(-r[i]));
      g[i] += p.previo * (s - 0.5);
      H[i][i] += p.previo * s * (1 - s);
    }
    for (const row of rows) {
      const x = r[row.h] - r[row.a] + h;
      const E = sigmoid(x);
      f -= row.w * (row.W * lnSigmoid(x) + (1 - row.W) * lnSigmoid(-x));
      const gr = row.w * (E - row.W), hs = row.w * E * (1 - E);
      g[row.h] += gr; g[row.a] -= gr;
      H[row.h][row.h] += hs; H[row.a][row.a] += hs; H[row.h][row.a] -= hs; H[row.a][row.h] -= hs;
    }
    return { f, g, H };
  });
  const get = t => (index.has(t) ? r[index.get(t)] : 0);
  return { rating: new Map(names.map((t, i) => [t, r[i] * 400 / LN10])), diff: (a, b) => get(a) - get(b) + h, varianza: () => 0 };
}

/* Elo de goles iterado: minimiza Σ ρ(dif. de goles con tope − campo − (R_local − R_visitante)) +
 * previo/2·Σ R² (ρ' = ψ). Estrictamente convexa: una sola solución. Puntuaciones en goles. La varianza de
 * la diferencia de dos equipos, (e_a − e_b)ᵀ H⁻¹ (e_a − e_b), con H el hessiano del final; la de un
 * equipo sin partidos, la del previo (1/previo). */
export function golesIterado(training, p) {
  const { names, index } = teamsOf(training);
  const n = names.length;
  const rows = training.map(m => ({ h: index.get(m.home), a: index.get(m.away), y: clampGoals(m.hs - m.as, p.tope) - p.campo }));
  const { r, H } = newton(n, r => {
    let f = 0;
    const g = new Float64Array(n);
    const H = Array.from({ length: n }, () => new Float64Array(n));
    for (let i = 0; i < n; i += 1) { f += p.previo * r[i] * r[i] / 2; g[i] += p.previo * r[i]; H[i][i] += p.previo; }
    for (const row of rows) {
      const e = row.y - (r[row.h] - r[row.a]);
      f += rho(e, p.s);
      const gr = psi(e, p.s), hs = dpsi(e, p.s);
      g[row.h] -= gr; g[row.a] += gr;
      H[row.h][row.h] += hs; H[row.a][row.a] += hs; H[row.h][row.a] -= hs; H[row.a][row.h] -= hs;
    }
    return { f, g, H };
  });
  const get = t => (index.has(t) ? r[index.get(t)] : 0);
  const varianza = (a, b) => {
    const ia = index.has(a) ? index.get(a) : -1, ib = index.has(b) ? index.get(b) : -1;
    let v = (ia < 0 ? 1 / p.previo : 0) + (ib < 0 ? 1 / p.previo : 0);
    if (ia < 0 && ib < 0) return v;
    const e = new Float64Array(n);
    if (ia >= 0) e[ia] += 1;
    if (ib >= 0) e[ib] -= 1;
    const z = solve(H, e);
    for (let i = 0; i < n; i += 1) v += e[i] * z[i];
    return v;
  };
  return { rating: new Map(names.map((t, i) => [t, r[i]])), diff: (a, b) => get(a) - get(b) + p.campo, varianza };
}

const FUERZAS = Object.freeze({ elo: eloSecuencial, iterado: eloIterado, goles: golesIterado });
export function fuerzas(training, params) {
  const f = FUERZAS[params.variante];
  if (!f) throw new RangeError(`elo: variante desconocida (${params.variante})`);
  return f(training, params);
}

// ── Las probabilidades ───────────────────────────────────────────────────────────────────────────────

// El logit ordenado: d, la diferencia (con el campo), y v, su varianza.
export function probabilidades(d, v, p) {
  const x = p.escala * d, t = Math.sqrt(1 + (p.incertidumbre || 0) * v);
  const pHome = sigmoid((x - p.empate) / t), pAway = sigmoid((-x - p.empate) / t);
  const pDraw = Math.max(0, 1 - pHome - pAway);
  const sum = pHome + pDraw + pAway;
  return { pHome: pHome / sum, pDraw: pDraw / sum, pAway: pAway / sum };
}

/* El pronóstico de `match` con `training`: { pHome, pDraw, pAway, diferencia, varianza }; la diferencia,
 * en unidades del logit ('elo', 'iterado') o en goles ('goles'), con el campo. */
export function pronostico(training, match, params = PARAMS) {
  const f = fuerzas(training, params);
  const d = f.diff(match.home, match.away);
  const v = params.incertidumbre ? f.varianza(match.home, match.away) : 0;
  return { ...probabilidades(d, v, params), diferencia: d, varianza: v };
}

export const predictorCon = params => (training, match) => {
  const { pHome, pDraw, pAway } = pronostico(training, match, params);
  return { pHome, pDraw, pAway };
};

let ACTIVOS = PARAMS;
export function predictor(training, match) {
  const { pHome, pDraw, pAway } = pronostico(training, match, ACTIVOS);
  return { pHome, pDraw, pAway };
}

// ── La búsqueda de los parámetros (solo con las parejas que se le den: las de ajuste) ────────────────

const GRIDS = Object.freeze({
  elo: { K: [8, 12, 16, 20, 25, 30, 40, 60], gamma: [0, 0.5, 0.75, 1, 1.25, 1.5], tope: [10, 20, 40], campo: [0, 10, 20, 30, 40] },
  iterado: { previo: [8, 16, 32, 64, 128], gamma: [0.5, 1, 1.25, 1.5, 2], tope: [10, 20, 30], campo: [0, 10, 20, 30, 40] },
  goles: { previo: [0.1, 0.25, 0.5, 1], s: [1, 2, 4, 8], tope: [8, 10, 14, 20], campo: [0, 0.15, 0.3, 0.45, 0.6, 0.75] },
});
const INCERTIDUMBRE = Object.freeze({ elo: [0], iterado: [0], goles: [0, 0.5, 0.75, 1, 1.25, 1.5, 2, 3] });
const round4 = x => Math.round(x * 1e4) / 1e4;

function golden(f, a, b, tol) {
  const g = (Math.sqrt(5) - 1) / 2;
  let x1 = b - g * (b - a), x2 = a + g * (b - a), f1 = f(x1), f2 = f(x2);
  while (b - a > tol) {
    if (f1 < f2) { b = x2; x2 = x1; f2 = f1; x1 = b - g * (b - a); f1 = f(x1); } else { a = x1; x1 = x2; f1 = f2; x2 = a + g * (b - a); f2 = f(x2); }
  }
  return (a + b) / 2;
}

// Log-loss medio del 1X2 con unas diferencias y varianzas ya calculadas.
function logLossOf(rows, p) {
  let s = 0;
  for (const r of rows) {
    const q = probabilidades(r.d, r.v, p);
    s -= Math.log(Math.max(1e-15, r.y === 'home' ? q.pHome : r.y === 'away' ? q.pAway : q.pDraw));
  }
  return s / rows.length;
}

/* La escala, el empate y la incertidumbre que mejor van con unas diferencias: la log-verosimilitud del
 * logit ordenado es cóncava en (escala, empate) y dos búsquedas de la sección áurea anidadas llegan a su
 * máximo; la incertidumbre, de su rejilla. Escala y empate, redondeados a cuatro decimales. */
function mapping(rows, base, grid) {
  let best = null;
  for (const incertidumbre of grid) {
    const at = (escala, empate) => logLossOf(rows, { ...base, escala, empate, incertidumbre });
    const empateDe = escala => golden(c => at(escala, c), 0.001, 3, 1e-4);
    const escala = round4(golden(e => at(e, empateDe(e)), 0.001, 8, 1e-4));
    const empate = round4(empateDe(escala));
    const ll = at(escala, empate);
    if (!best || ll < best.logLoss - 1e-12) best = { escala, empate, incertidumbre, logLoss: ll };
  }
  return best;
}

/* Los parámetros de una variante con unas parejas del banco ({ clave, training, match, y }): búsqueda por
 * coordenadas en las rejillas de GRIDS (cada parámetro, el mejor de su rejilla con los demás fijos, hasta
 * que ninguno cambia), con la escala, el empate y la incertidumbre ajustados en cada punto. `desde`: el
 * punto de partida (el de VARIANTES); `fijos`: lo que no se busca (p. ej. { campo: 0 } o, en 'goles',
 * { incertidumbre: 0 }). Devuelve
 * { params, logLoss, evaluados }. Determinista. */
export function buscar(pairs, variante, { desde = VARIANTES[variante], fijos = {} } = {}) {
  const grid = GRIDS[variante];
  if (!grid) throw new RangeError(`elo: variante desconocida (${variante})`);
  const incertidumbres = Object.hasOwn(fijos, 'incertidumbre') ? [fijos.incertidumbre] : INCERTIDUMBRE[variante];
  const conV = incertidumbres.some(Boolean);
  const memo = new Map();
  const score = q => {
    const key = JSON.stringify(Object.keys(grid).map(k => q[k]));
    if (memo.has(key)) return memo.get(key);
    // Las parejas de una jornada con el mismo entrenamiento (su tamaño lo identifica) comparten ajuste.
    const cache = new Map();
    const rows = pairs.map(pr => {
      const k = `${pr.clave}|${pr.match.roundKey}|${pr.training.length}`;
      if (!cache.has(k)) cache.set(k, fuerzas(pr.training, q));
      const f = cache.get(k);
      return { d: f.diff(pr.match.home, pr.match.away), v: conV ? f.varianza(pr.match.home, pr.match.away) : 0, y: pr.y };
    });
    const m = mapping(rows, q, incertidumbres);
    const out = { params: Object.freeze({ ...q, escala: m.escala, empate: m.empate, incertidumbre: m.incertidumbre }), logLoss: m.logLoss };
    memo.set(key, out);
    return out;
  };
  let cur = score({ ...desde, ...fijos, variante });
  for (let sweep = 0; sweep < 10; sweep += 1) {
    let changed = false;
    for (const [k, values] of Object.entries(grid)) {
      if (Object.hasOwn(fijos, k)) continue;
      for (const v of values) {
        const cand = score({ ...cur.params, [k]: v });
        if (cand.logLoss < cur.logLoss - 1e-9) { cur = cand; changed = true; }
      }
    }
    if (!changed) break;
  }
  return { params: cur.params, logLoss: cur.logLoss, evaluados: memo.size };
}

/* ajustar(banco): busca las tres variantes con las parejas de ajuste (y nada más), elige la de menor
 * log-loss y la deja activa para `predictor`. Devuelve lo elegido y lo de cada variante (unos 45 s; sin
 * llamarlo, `predictor` usa PARAMS, que es lo mismo). */
export function ajustar(banco) {
  const variantes = {};
  for (const v of Object.keys(VARIANTES)) {
    const r = buscar(banco.pares, v);
    variantes[v] = { params: r.params, logLossAjuste: Math.round(r.logLoss * 1e6) / 1e6, evaluados: r.evaluados };
  }
  const elegida = Object.keys(variantes).reduce((a, b) => (variantes[b].logLossAjuste < variantes[a].logLossAjuste ? b : a));
  ACTIVOS = variantes[elegida].params;
  return { elegida, params: ACTIVOS, variantes };
}
