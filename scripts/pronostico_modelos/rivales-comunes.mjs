/* RESULTADO DE LA ELECCIÓN (17/10/2026): NO ELEGIDO. En EVALUACIÓN, 0,544 de log-loss y 78,3 % de acierto,
 * como el Poisson de antes (+0,001 [−0,006, +0,008]) y peor que Massey (el elegido): +0,010 [+0,006,
 * +0,014]. La idea del usuario funciona (frente a la tabla, −0,135), pero contar los caminos uno a uno
 * pierde frente a hacer la misma «regla de tres» cuenta para todo el grupo a la vez, que es Massey: cada
 * rival común y cada cadena pesan lo que dicen todos los partidos juntos, y no hay que fijar a mano cuánto
 * vale cada clase de camino. Sin el campo, igual (+0,000 [−0,004, +0,004]). En las cifras de abajo,
 * «actual» y «el modelo de la web» son el Poisson de antes (hoy, la referencia «poisson» del banco).
 *
 * Pronóstico de prebenjamín por RIVALES COMUNES, las «reglas de tres» del usuario (17/10/2026). Un modelo
 * para el banco de pruebas (scripts/pronostico_banco.mjs); puro, sin dependencias y determinista, como
 * para calcularlo en el navegador (0,04 ms por partido).
 *
 * La idea, en llano. Para A (local) contra C (visitante) se buscan, en lo jugado ESTA temporada en su
 * grupo, los caminos que llevan de A a C a través de partidos, y cada camino da una «regla de tres»:
 * - el enfrentamiento directo (A–C): si A ganó a C por 3, A es 3 goles mejor;
 * - un rival común X (A–X–C): A ganó a X por 5 y C ganó a X por 2, así que A es 5 − 2 = 3 goles mejor;
 * - una cadena de dos pasos (A–X–Y–C): A ganó a X por 4, X empató con Y y C le ganó a Y por 1, así que
 *   A es 4 + 0 − 1 = 3 goles mejor (es lo que salva las primeras jornadas, con pocos rivales comunes);
 * - y el respaldo, para cuando no hay ningún camino (tras una sola jornada, o con un equipo que descansó)
 *   y, con poco peso, siempre: lo que hizo cada uno contra sus rivales, como si fueran iguales (A ganó de
 *   media por 2 y C perdió de media por 1: 3).
 * Cada partido cuenta con su diferencia de goles recortada a 10 (un 0-24 dice «mucho mejor», no cuánto) y
 * sin la ventaja del campo (0,75 goles, lo que de media gana el local por serlo). Los caminos se promedian
 * con pesos: el directo, 1 por partido; cada rival común, 0,4; cada cadena, 0,15 (cada paso de más añade su
 * ruido), y las cadenas, como mucho como 16 (repiten los mismos partidos); el respaldo, 0,2 por «partido
 * efectivo». Esa suma de pesos es lo que se sabe del partido (tras una jornada, 0,1; tras tres, 0,75; con
 * siete o más, unos 8,6). Al final, una diferencia proyectada D en goles (con 0,1 caminos ficticios de
 * empate, k, para que con casi nada no se dispare), y de D, P(1), P(X), P(2) con una logística ordenada:
 * z = a·D + b, gana el local si z más un azar (logístico) pasa de +t, el visitante si baja de −t, y entre
 * medias, empate; con poco peso, z y t se dividen por √(1 + c / (peso + k)): la diferencia es más incierta y
 * la probabilidad se reparte más (y menos en el empate). Con peso 8 (media temporada), D = 3 da
 * 86 % / 7 % / 7 %, D = 0, 46 % / 18 % / 36 %, y D = −3, 11 % / 9 % / 80 %; con peso 1, D = 3 da 78 / 8 / 14.
 * Ejemplo (PFV1 2025-26, jornada 5): CD Corralejo–La Oliva. Rival común, Fuerteklub: Corralejo le ganó 0-6
 * fuera y La Oliva, 4-3 en casa; sin el campo, Corralejo +6,75 y La Oliva +0,25, así que Corralejo es 6,5
 * goles mejor; con las dos cadenas y el respaldo, D = 5,0 con peso 0,94: 90 % / 4 % / 6 %. Acabó 7-1.
 *
 * El contrato del banco: `ajustar(banco)` prueba las VARIANTES (con o sin cadenas, con o sin respaldo,
 * goles o solo ganar/perder o la razón de goles, con o sin campo) en las temporadas de AJUSTE (2013-14 a
 * 2020-21: las únicas que ve), cada una con su búsqueda por coordenadas, determinista (unos dos minutos), y
 * se queda la mejor (a una milésima, la más sencilla); deja los parámetros en el módulo. `predictor`
 * pronostica un partido con su entrenamiento (nunca con los resultados de `group`). Sin ajustar, PARAMS, lo
 * que eligió la búsqueda del 17/10/2026 (ajustar lo repite). `explicar` da los caminos de un partido, para
 * enseñar en la web por qué sale lo que sale.
 *
 * Resultado (banco, EVALUACIÓN 2021-22 a 2025-26: 2.747 partidos, 28 grupos; bootstrap por grupo, B 2000):
 * log-loss 0,544 [0,490–0,606] y acierto del 1X2 78,3 %, los del modelo de la web (0,544 y 79,1 %; Δ +0,001
 * [−0,006, +0,008]: empate) y mucho mejor que la clasificación (0,679; Δ −0,135 [−0,156, −0,109]). Cada pieza
 * cuenta: sin cadenas, +0,011 [+0,007, +0,015]; sin respaldo, +0,007 [+0,003, +0,012]; solo ganar/perder,
 * +0,042 [+0,027, +0,055]; sin campo, +0,000 [−0,004, +0,004] en evaluación (en el ajuste, +0,005). */

export const nombre = 'rivales-comunes';
export const descripcion = 'reglas de tres por rivales comunes: directo, rivales comunes y cadenas, con una logística ordenada';

/* Los parámetros (ajuste del 17/10/2026, temporadas 2013-14 a 2020-21; ver ajustar):
 * - valor: cómo cuenta un partido: 'goles' (la diferencia recortada a ±tope), 'signo' (solo ganar, empatar
 *   o perder: +1, 0, −1) o 'razon' (ln de (goles a favor + ½) / (en contra + ½));
 * - tope: el recorte de la diferencia de goles de cada partido (Infinity: sin recorte): 10;
 * - campo: lo que se le quita al local de cada partido jugado (en las unidades de valor) para comparar sin
 *   el campo: 0,75;
 * - w: el peso de cada clase de camino, por camino: [0] el respaldo (por «partido efectivo» de los dos,
 *   nA·nC / (nA + nC)), [1] el directo (por partido; la unidad), [2] cada rival común, [3] cada cadena de
 *   dos pasos, [4] cada cadena de tres pasos (A–X–Y–Z–C; mejora menos de una milésima: fuera);
 * - maxCadenas: las cadenas de dos y de tres pasos cuentan como mucho como estas (comparten partidos);
 * - k: los caminos ficticios con diferencia 0 (la contracción hacia el empate): 0,1;
 * - a, b, t, c: la logística ordenada, de máxima verosimilitud (b es el campo del partido a pronosticar; c,
 *   cuánto se reparte la probabilidad con poco peso: ver probabilidades). */
export const PARAMS = Object.freeze({
  valor: 'goles', tope: 10, campo: 0.75,
  w: Object.freeze([0.2, 1, 0.4, 0.15, 0]), maxCadenas: Object.freeze([16, 8]), k: 0.1,
  a: 0.7208642130694728, b: 0.240746217159873, t: 0.4077683674572192, c: 1.6011618312348037,
});

let fijados = PARAMS;
export const parametros = () => fijados;

const NIVELES = 5;

// El valor de un partido para el local, sin el campo: la diferencia recortada, el signo o la razón.
function valorDe(p) {
  if (p.valor === 'signo') return (hs, as) => Math.sign(hs - as);
  if (p.valor === 'razon') return (hs, as) => Math.log((hs + 0.5) / (as + 0.5));
  const tope = p.tope;
  return (hs, as) => Math.max(-tope, Math.min(tope, hs - as));
}

/* El grafo de lo jugado: de cada equipo, sus rivales con la suma y el número de partidos (el valor, desde
 * el equipo, ya con el campo quitado: valor − campo de local, −valor + campo de visitante), y su total.
 * `valor(hs, as)` y `campo`: los de p, o (en ajustar) el indicador del campo, para separar la parte del
 * campo de cada camino (todo es lineal en los valores). En el orden del entrenamiento. */
function grafo(training, valor, campo) {
  const rivales = new Map(), total = new Map();
  const add = (i, j, v) => {
    if (!rivales.has(i)) { rivales.set(i, new Map()); total.set(i, [0, 0]); }
    const r = rivales.get(i);
    const e = r.get(j);
    if (e) { e[0] += v; e[1] += 1; } else r.set(j, [v, 1]);
    const t = total.get(i);
    t[0] += v; t[1] += 1;
  };
  for (const m of training) {
    const v = valor(m.hs, m.as) - campo;
    add(m.home, m.away, v);
    add(m.away, m.home, -v);
  }
  return { rivales, total };
}

const media = e => e[0] / e[1];
const SIN = new Map();

/* Los caminos de A a C en el grafo, por clase: S[nivel] (la suma de las estimaciones de sus caminos) y
 * n[nivel] (cuántos). Nivel 0, el respaldo (S: la media de A menos la de C; n: los «partidos efectivos»,
 * nA·nC/(nA + nC), 0 si alguno no ha jugado); 1, el directo (S: la suma de sus partidos; n: cuántos); 2,
 * los rivales comunes; 3, las cadenas de dos pasos; 4, las de tres (solo si `largo` llega a 4). Un camino
 * no repite equipo. `caminos`, si se pasa, recoge los de los niveles 1 y 2 (para explicar). */
function niveles(g, A, C, largo = 4, caminos = null) {
  const S = new Float64Array(NIVELES), n = new Float64Array(NIVELES);
  const RA = g.rivales.get(A) || SIN, RC = g.rivales.get(C) || SIN;
  const tA = g.total.get(A), tC = g.total.get(C);
  if (tA && tC) { S[0] = media(tA) - media(tC); n[0] = (tA[1] * tC[1]) / (tA[1] + tC[1]); }
  const directo = RA.get(C);
  if (directo) {
    S[1] = directo[0]; n[1] = directo[1];
    if (caminos) caminos.push({ clase: 'directo', por: [], valor: media(directo), partidos: directo[1] });
  }
  // La media de X contra C, desde X: la de C contra X cambiada de signo.
  for (const [X, eAX] of RA) {
    if (X === C) continue;
    const vAX = media(eAX);
    const eCX = RC.get(X);
    if (eCX) {
      const est = vAX - media(eCX);
      S[2] += est; n[2] += 1;
      if (caminos) caminos.push({ clase: 'comun', por: [X], valor: est, a: vAX, c: media(eCX) });
    }
    if (largo < 3) continue;
    const RX = g.rivales.get(X) || SIN;
    for (const [Y, eXY] of RX) {
      if (Y === A || Y === C) continue;
      const vAXY = vAX + media(eXY);
      const eCY = RC.get(Y);
      if (eCY) { S[3] += vAXY - media(eCY); n[3] += 1; }
      if (largo < 4) continue;
      const RY = g.rivales.get(Y) || SIN;
      for (const [Z, eYZ] of RY) {
        if (Z === A || Z === C || Z === X) continue;
        const eCZ = RC.get(Z);
        if (eCZ) { S[4] += vAXY + media(eYZ) - media(eCZ); n[4] += 1; }
      }
    }
  }
  return { S, n };
}

/* La diferencia proyectada (en las unidades de valor, a favor del local) con los caminos de una clase y
 * otra: la media de todos, con el peso de cada clase, y k caminos ficticios con 0. `peso`, lo que pesan
 * los de verdad (con 0, D = 0: no hay nada que comparar). */
function proyectar(S, n, p) {
  let num = 0, den = 0;
  for (let L = 0; L < NIVELES; L += 1) {
    if (!n[L] || !p.w[L]) continue;
    // Las cadenas cuentan como mucho como maxCadenas; los demás, por partido o por rival.
    const cuenta = L >= 3 ? Math.min(n[L], p.maxCadenas[L - 3]) : n[L];
    const mediaL = L === 0 ? S[0] : S[L] / n[L];
    num += p.w[L] * cuenta * mediaL;
    den += p.w[L] * cuenta;
  }
  return { d: den + p.k > 0 ? num / (den + p.k) : 0, peso: den };
}

const sigma = x => (x >= 0 ? 1 / (1 + Math.exp(-x)) : Math.exp(x) / (1 + Math.exp(x)));

/* De la diferencia proyectada, P(1), P(X), P(2): logística ordenada con z = a·D + b y la banda ±t, las dos
 * divididas por √(1 + c / (peso + k)): con pocos caminos (peso pequeño), D no solo se acerca a 0, también
 * es más incierta, y la probabilidad se reparte más entre los dos y menos en el empate (sin esto, tras una
 * jornada daba un 13,5 % de empates de media y hay un 7,1 %; con esto, 5,5 %; y el log-loss del ajuste baja
 * de 0,5239 a 0,5214). Con mucho peso, el divisor es casi 1. */
export function probabilidades(d, peso = Infinity, p = fijados) {
  const sc = Math.sqrt(1 + p.c / Math.max(1e-9, peso + p.k));
  const z = (p.a * d + p.b) / sc, t = p.t / sc;
  const pHome = sigma(z - t), pAway = sigma(-t - z);
  const pDraw = Math.max(0, 1 - pHome - pAway);
  const s = pHome + pDraw + pAway;
  return { pHome: pHome / s, pDraw: pDraw / s, pAway: pAway / s };
}

const largoDe = p => (p.w[4] ? 4 : p.w[3] ? 3 : 2);

// La diferencia proyectada de un partido con su entrenamiento: { d, peso, n } (n: los caminos de cada clase).
export function proyeccion(training, home, away, p = fijados) {
  const g = grafo(training, valorDe(p), p.campo);
  const { S, n } = niveles(g, home, away, largoDe(p));
  return { ...proyectar(S, n, p), n: [...n] };
}

/* El predictor del banco: la diferencia proyectada con lo jugado antes (training) y sus probabilidades.
 * Siempre pronostica: sin ningún camino (un equipo sin partidos), D = 0 y salen las del campo. */
export function predictor(training, match) {
  const { d, peso } = proyeccion(training, match.home, match.away);
  return probabilidades(d, peso);
}

/* Los caminos de un partido, para explicarlo: { d, peso, n, directo, comunes: [{ rival, a, c, valor }],
 * cadenas } con a y c lo que hicieron A y C contra ese rival (la media, ya sin el campo), valor = a − c y
 * cadenas el número de cadenas de dos pasos. Los comunes, de más a menos favorables al local. */
export function explicar(training, home, away, p = fijados) {
  const g = grafo(training, valorDe(p), p.campo);
  const caminos = [];
  const { S, n } = niveles(g, home, away, largoDe(p), caminos);
  const directo = caminos.find(c => c.clase === 'directo') || null;
  const comunes = caminos.filter(c => c.clase === 'comun')
    .map(c => ({ rival: c.por[0], a: c.a, c: c.c, valor: c.valor }))
    .sort((x, y) => y.valor - x.valor || (x.rival < y.rival ? -1 : 1));
  return { ...proyectar(S, n, p), n: [...n], directo, comunes, cadenas: n[3] };
}

// ── El ajuste (solo en el banco; la web usa PARAMS) ──────────────────────────────────────────────────

const EPS = 1e-15;

/* Las sumas de cada pareja del ajuste con un valor dado, separadas en la parte del valor (F) y la del
 * campo (H, la del indicador +1 de local): con un campo c, S = F − c·H. Un Float64Array por pareja. */
function sumasDe(pairs, p, largo, delCampo = null) {
  const val = valorDe(p);
  return pairs.map(({ training, match }, i) => {
    const F = niveles(grafo(training, val, 0), match.home, match.away, largo);
    const H = delCampo ? delCampo[i].H : niveles(grafo(training, () => 1, 0), match.home, match.away, largo).S;
    return { F: F.S, H, n: F.n };
  });
}

const Y = { home: 0, draw: 1, away: 2 };

// Log-loss medio de la logística ordenada con unas D, sus pesos W, k y unos (a, b, ln t, ln c).
function perdida(D, W, ys, k, a, b, lt, lc) {
  const t0 = Math.exp(lt), c = Math.exp(lc);
  let s = 0;
  for (let i = 0; i < D.length; i += 1) {
    const sc = Math.sqrt(1 + c / Math.max(1e-9, W[i] + k));
    const z = (a * D[i] + b) / sc, t = t0 / sc;
    const ph = sigma(z - t), pa = sigma(-t - z);
    const q = ys[i] === 0 ? ph : ys[i] === 2 ? pa : 1 - ph - pa;
    s -= Math.log(Math.max(EPS, q));
  }
  return s / D.length;
}

/* (a, b, ln t, ln c) de máxima verosimilitud con Nelder–Mead (determinista; desde el enlace del punto
 * anterior de la búsqueda). `libreB` false: b = 0 (sin campo en el partido). */
function ajustarEnlace(D, W, ys, k, desde, libreB = true) {
  const f = x => perdida(D, W, ys, k, x[0], libreB ? x[1] : 0, x[2], x[3]);
  const dim = 4;
  const paso = [0.2, 0.3, 0.3, 1];
  let pts = [desde.slice()];
  for (let i = 0; i < dim; i += 1) { const x = desde.slice(); x[i] += paso[i]; pts.push(x); }
  let vals = pts.map(f);
  for (let it = 0; it < 1500; it += 1) {
    const ord = vals.map((v, i) => i).sort((i, j) => vals[i] - vals[j]);
    pts = ord.map(i => pts[i]); vals = ord.map(i => vals[i]);
    if (vals[dim] - vals[0] < 1e-10) break;
    const c = new Array(dim).fill(0);
    for (let i = 0; i < dim; i += 1) for (let j = 0; j < dim; j += 1) c[j] += pts[i][j] / dim;
    const at = s => c.map((cj, j) => cj + s * (pts[dim][j] - cj));
    const r = at(-1), fr = f(r);
    if (fr < vals[0]) {
      const e = at(-2), fe = f(e);
      if (fe < fr) { pts[dim] = e; vals[dim] = fe; } else { pts[dim] = r; vals[dim] = fr; }
    } else if (fr < vals[dim - 1]) { pts[dim] = r; vals[dim] = fr; } else {
      const k = fr < vals[dim] ? at(-0.5) : at(0.5), fk = f(k);
      if (fk < Math.min(fr, vals[dim])) { pts[dim] = k; vals[dim] = fk; } else {
        for (let i = 1; i <= dim; i += 1) {
          pts[i] = pts[i].map((x, j) => pts[0][j] + 0.5 * (x - pts[0][j]));
          vals[i] = f(pts[i]);
        }
      }
    }
  }
  const x = pts[0];
  return { a: x[0], b: libreB ? x[1] : 0, t: Math.exp(x[2]), c: Math.exp(x[3]), x, logLoss: vals[0] };
}

// Las D y los pesos de todas las parejas con unos parámetros (sin el enlace) y sus sumas ya calculadas.
function diferencias(sumas, p) {
  const D = new Float64Array(sumas.length), W = new Float64Array(sumas.length);
  const S = new Float64Array(NIVELES);
  for (let i = 0; i < sumas.length; i += 1) {
    const { F, H, n } = sumas[i];
    for (let L = 0; L < NIVELES; L += 1) S[L] = F[L] - p.campo * H[L];
    const r = proyectar(S, n, p);
    D[i] = r.d; W[i] = r.peso;
  }
  return { D, W };
}

// Las rejillas de la búsqueda por coordenadas.
const REJILLA = {
  tope: [2, 3, 4, 5, 6, 7, 8, 9, 10, 12, 15, Infinity],
  campo: {
    goles: [0, 0.1, 0.25, 0.5, 0.75, 1, 1.25, 1.5, 2],
    signo: [0, 0.05, 0.1, 0.15, 0.2, 0.3],
    razon: [0, 0.05, 0.1, 0.15, 0.2, 0.3, 0.4],
  },
  w0: [0, 0.02, 0.05, 0.1, 0.15, 0.2, 0.25, 0.3, 0.35, 0.5, 0.75, 1],
  w2: [0.1, 0.2, 0.25, 0.3, 0.35, 0.4, 0.5, 0.6, 0.75, 1, 1.5, 2],
  w3: [0, 0.02, 0.05, 0.075, 0.1, 0.15, 0.2, 0.25, 0.35, 0.5],
  w4: [0, 0.01, 0.02, 0.05, 0.1, 0.2],
  max3: [1, 2, 4, 8, 16, 32, 64, Infinity],
  max4: [1, 4, 16, 64, Infinity],
  k: [0, 0.1, 0.25, 0.35, 0.5, 0.75, 1, 1.5, 2, 4, 8],
};

/* La búsqueda de una variante en unas parejas: por coordenadas (cada parámetro, el mejor de su rejilla con
 * los demás fijos, y vuelta, hasta que nada mejora), y en cada punto el enlace de máxima verosimilitud.
 * `variante`: { valor, cadenas (0, 2 o 3 pasos), respaldo (bool), campo (bool) }. Devuelve los parámetros
 * y su log-loss en esas parejas. */
export function buscar(pairs, variante = {}) {
  const v = { valor: 'goles', cadenas: 3, respaldo: true, campo: true, ...variante };
  const largo = v.cadenas >= 3 ? 4 : v.cadenas >= 2 ? 3 : 2;
  const ys = Uint8Array.from(pairs, p => Y[p.y]);
  // Las sumas, una vez por valor (y tope): la parte del campo es la misma para todos.
  const cache = new Map();
  let delCampo = null;
  const sumas = p => {
    const key = v.valor === 'goles' ? String(p.tope) : v.valor;
    if (!cache.has(key)) { cache.set(key, sumasDe(pairs, p, largo, delCampo)); delCampo = delCampo || cache.get(key); }
    return cache.get(key);
  };
  let p = {
    valor: v.valor, tope: v.valor === 'goles' ? 6 : Infinity, campo: 0,
    w: [v.respaldo ? 0.1 : 0, 1, 0.5, v.cadenas >= 2 ? 0.1 : 0, 0], maxCadenas: [8, 8], k: 0.5,
  };
  let enlace = [0.5, v.campo ? 0.1 : 0, Math.log(0.3), Math.log(0.5)];
  const puntua = q => { const { D, W } = diferencias(sumas(q), q); return ajustarEnlace(D, W, ys, q.k, enlace, v.campo); };
  let best = puntua(p);
  enlace = best.x;
  const coords = [];
  if (v.valor === 'goles') coords.push(['tope', REJILLA.tope, (q, x) => ({ ...q, tope: x })]);
  if (v.campo) coords.push(['campo', REJILLA.campo[v.valor], (q, x) => ({ ...q, campo: x })]);
  if (v.respaldo) coords.push(['w0', REJILLA.w0, (q, x) => ({ ...q, w: [x, ...q.w.slice(1)] })]);
  coords.push(['w2', REJILLA.w2, (q, x) => ({ ...q, w: [q.w[0], 1, x, q.w[3], q.w[4]] })]);
  if (v.cadenas >= 2) {
    coords.push(['w3', REJILLA.w3, (q, x) => ({ ...q, w: [q.w[0], 1, q.w[2], x, q.w[4]] })]);
    coords.push(['max3', REJILLA.max3, (q, x) => ({ ...q, maxCadenas: [x, q.maxCadenas[1]] })]);
  }
  if (v.cadenas >= 3) {
    coords.push(['w4', REJILLA.w4, (q, x) => ({ ...q, w: [q.w[0], 1, q.w[2], q.w[3], x] })]);
    coords.push(['max4', REJILLA.max4, (q, x) => ({ ...q, maxCadenas: [q.maxCadenas[0], x] })]);
  }
  coords.push(['k', REJILLA.k, (q, x) => ({ ...q, k: x })]);
  for (let vuelta = 0; vuelta < 8; vuelta += 1) {
    let mejoro = false;
    for (const [, grid, set] of coords) {
      for (const x of grid) {
        const q = set(p, x);
        const r = puntua(q);
        // Solo si mejora de verdad (1e-7): a igualdad, el primero de la rejilla (el más sencillo).
        if (r.logLoss < best.logLoss - 1e-7) { best = r; p = q; enlace = r.x; mejoro = true; }
      }
    }
    if (!mejoro) break;
  }
  return {
    params: { ...p, w: [...p.w], maxCadenas: [...p.maxCadenas], a: best.a, b: best.b, t: best.t, c: best.c },
    logLoss: best.logLoss,
  };
}

// Las variantes que se prueban (de la más sencilla a la más completa); se queda la mejor en el ajuste.
export const VARIANTES = Object.freeze([
  { id: 'comunes', valor: 'goles', cadenas: 0, respaldo: false, campo: true },
  { id: 'comunes+cadenas', valor: 'goles', cadenas: 2, respaldo: false, campo: true },
  { id: 'comunes+cadenas3', valor: 'goles', cadenas: 3, respaldo: false, campo: true },
  { id: 'comunes+respaldo', valor: 'goles', cadenas: 0, respaldo: true, campo: true },
  { id: 'comunes+cadenas+respaldo', valor: 'goles', cadenas: 2, respaldo: true, campo: true },
  { id: 'comunes+cadenas3+respaldo', valor: 'goles', cadenas: 3, respaldo: true, campo: true },
  { id: 'signo:comunes+cadenas+respaldo', valor: 'signo', cadenas: 2, respaldo: true, campo: true },
  { id: 'razon:comunes+cadenas+respaldo', valor: 'razon', cadenas: 2, respaldo: true, campo: true },
  { id: 'sin-campo:comunes+cadenas+respaldo', valor: 'goles', cadenas: 2, respaldo: true, campo: false },
]);

const show = p => JSON.parse(JSON.stringify(p, (k, x) => (x === Infinity ? 'Infinity' : x)));

/* El ajuste del banco: cada variante con su búsqueda en las parejas de AJUSTE (las únicas que ve) y se
 * queda la de menor log-loss; si una más sencilla (antes en VARIANTES) está a menos de una milésima, esa.
 * Deja los parámetros en el módulo y los devuelve, con el log-loss de cada variante en el ajuste. */
export function ajustar(banco) {
  const pairs = banco.pares;
  const res = VARIANTES.map(v => ({ variante: v.id, ...buscar(pairs, v) }));
  const minimo = Math.min(...res.map(r => r.logLoss));
  const elegida = res.find(r => r.logLoss <= minimo + 1e-3);
  const { w, maxCadenas } = elegida.params;
  fijados = Object.freeze({ ...elegida.params, w: Object.freeze(w), maxCadenas: Object.freeze(maxCadenas) });
  return {
    elegida: elegida.variante,
    params: show(fijados),
    variantes: res.map(r => ({ variante: r.variante, logLossAjuste: Math.round(r.logLoss * 1e6) / 1e6, params: show(r.params) })),
  };
}
