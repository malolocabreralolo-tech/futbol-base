/* Pronóstico de la clasificación final del prebenjamín de la temporada en curso (19/10/2026).
 *
 * Lo pidió el usuario en la ficha del equipo, en el sitio de la evolución de puntos, que quitó («no me
 * aporta tanto»): «en base a la evolución de los resultados, […] una proyección de la clasificación final
 * en la que pueda quedar […] pronóstico tercero, o segundo, o quinto». Tras ver la primera versión (un
 * bloque con la tabla en cada ficha), lo quiso como una cifra: en «La temporada en cifras» de la ficha y
 * de Mi equipo, «Pronóstico final: 4.º, unos 45 puntos» (projectionFigure de team-view.js, con
 * projectPlaces), que abre la tabla prevista en un solo sitio, la Tabla del grupo (v=pronostico,
 * projectionView de screen-tabla.js, con projectStandings; el router quita esa vista donde
 * projectionApplies da false). Puro e importable en Node sin DOM, como pronostico.js: recibe el Group de
 * model.js y la temporada del portal por parámetro y no lee ningún global de datos. Nada en la base ni en
 * el bot, ni ninguna petición nueva.
 *
 * EL MÉTODO (projection): una simulación de Monte Carlo del resto de la liga con el pronóstico de cada
 * partido que ya enseña la web.
 * - De partida, la clasificación que enseña la web (group.standings, ya por puntos: points_order de
 *   scripts/generate_js.py), sin retirados: sus puntos, goles a favor y en contra. Lo jugado es lo que
 *   tiene marcador; lo que queda, cada partido sin él entre dos equipos de esa tabla, salvo los de un
 *   retirado (retiredTeams de model.js), las copias de la importación (copiedMatches) y lo que la app de
 *   futbolaspalmas da por retirado, anulado o suspendido (offByStatus): las mismas exclusiones que el
 *   pronóstico de partidos y, como en la tabla oficial, los resultados de mesa ya jugados cuentan (están
 *   en sus puntos); el entrenamiento del modelo los deja fuera, como siempre (trainingFor).
 * - Cada partido que queda, con su 1X2 de las notas de Massey y sus goles esperados del Poisson
 *   (forecastOdds de pronostico.js: las cifras de forecastMatch con todo el calendario, `full`). Si la web
 *   no enseña el suyo (un equipo que aún no ha jugado, uno con la fecha pasada y aún sin resultado, uno sin
 *   fecha), el mismo modelo sin los mínimos (LOOSE) y con todo lo jugado: hay que jugarlo igual.
 * - En cada simulación, el desenlace de cada partido con su 1X2 y el marcador del Poisson de sus goles
 *   CONDICIONADO a ese desenlace (scoreTables: si gana el local, solo marcadores en que gana el local;
 *   cuadra con lo que se sorteó aunque los goles esperados vayan con el otro), y la clasificación final por
 *   puntos, diferencia de goles y goles a favor, como las tablas de liga de la web (points_order); a
 *   igualdad de las tres, a suertes. Los goles solo sirven para desempatar.
 * - Lo que da, por equipo: su PUESTO PRONOSTICADO, el de la tabla final proyectada, por puntos esperados
 *   (y diferencia y goles esperados para desempatar): cada puesto es de un solo equipo; los puntos
 *   esperados, calculados sin sortear (lo de la tabla más, de cada partido, 3·P(gana) + P(empate): sin el
 *   ruido de la simulación, el puesto no depende de ella); el ABANICO, los puestos seguidos en que acaba 8
 *   de cada 10 veces (abajo); y la probabilidad de cada puesto (probs), la parte de las simulaciones.
 * - Generador con semilla fija (mulberry32, el del banco de pruebas; SIM.seed): el mismo resultado en cada
 *   pintado y en las pruebas. Una vez por grupo (la caché de la web, PROJECTIONS, como FACTS y FORECASTS):
 *   con un resultado nuevo, el modelo construye otro Group y se rehace todo.
 * Se enseña donde hay pronóstico de partidos: una liga de prebenjamín de la temporada del portal
 * (forecastApplies), con PARAMS.minRounds jornadas jugadas (las de trainingFor: playedRounds) y algo por
 * jugar; y, en la ficha de un equipo, si ese equipo ya ha jugado PARAMS.minPlayed partidos, como el
 * pronóstico de los suyos (el del que aún no ha jugado, la media del grupo, sí entra en la tabla de los
 * demás).
 *
 * EL BACKTEST (scripts/backtest_proyeccion.mjs, 19/10/2026; el examen, en su cabecera): cada grupo de
 * liga de prebenjamín de las temporadas pasadas, tras 2, 4 y 6 jornadas y a mitad de temporada, con SOLO
 * lo jugado hasta el corte (la clasificación de ese momento, con el calendario), frente a la clasificación
 * final real; la referencia ingenua, el puesto en la tabla de ese momento. Error medio absoluto del puesto
 * (MAE), % exacto y % a ±1, con IC 95 % por bootstrap de temporada-grupo (B = 2000, semilla del banco).
 * EVALUACIÓN (2021-22 a 2025-26, 28 grupos, 1.085 casos equipo-corte; con ella no se fijó nada):
 *
 *   corte    MAE modelo   tabla   Δ MAE [IC 95 %]           exacto: modelo  tabla    a ±1: modelo  tabla
 *   tras 2   1,71         1,94    −0,23 [−0,40, −0,05]      24,8 %          22,6 %   57,3 %        48,2 %
 *   tras 4   1,21         1,46    −0,25 [−0,41, −0,08]      35,4 %          29,6 %   70,4 %        64,2 %
 *   tras 6   0,91         1,26    −0,35 [−0,54, −0,15]      42,6 %          33,5 %   81,4 %        68,1 %
 *   mitad    0,69         0,74    −0,06 [−0,15, +0,02]      54,0 %          48,2 %   84,7 %        82,8 %
 *   todos    1,13         1,35    −0,22 [−0,34, −0,10]      39,2 %          33,5 %   73,4 %        65,8 %
 *
 * Tras 2, 4 y 6 jornadas, le gana a la tabla de forma demostrable (el intervalo de Δ no toca el cero); a
 * ±1 también (+9,1 [+1,5, +16,2] puntos tras 2; +13,3 [+5,4, +20,9] tras 6). En el % exacto, nunca de forma
 * demostrable salvo en total (+5,7 [+1,4, +10,5]). A mitad de temporada, la tabla ya dice casi lo mismo:
 * −0,06 de MAE, con el cero dentro del intervalo; NO le gana de forma demostrable. En AJUSTE (2013-14 a
 * 2020-21, 21 grupos, 968 casos), más ventaja: −0,56 [−0,77, −0,38] tras 2, −0,65 tras 4 y tras 6, y −0,07
 * [−0,16, +0,02] a mitad. Hoy, PG2 de 2026-27 lleva dos jornadas: el caso de «tras 2» (en EVALUACIÓN, de
 * cada 10 equipos, el puesto exacto en 2-3 y a ±1 en 6).
 *
 * EL ABANICO, calibrado. Con las simulaciones tal cual, el modelo se pasa de seguro: da a cada partido su
 * 1X2 como si las notas fueran exactas, y con pocas jornadas no lo son (la incertidumbre de la nota de un
 * equipo pesa en todos sus partidos a la vez y la simulación la trata como suerte suelta). Los puestos en
 * que acaba en 8 de cada 10 simulaciones solo recogían el real en el 72,5 % de los casos de EVALUACIÓN, y
 * tras 2 jornadas en el 62,0 %. Por eso el abanico reúne más simulaciones cuanto menos se ha jugado: la
 * masa max(0,80, 1 − κ·jornadas jugadas) (fanMass), con κ = 0,02 fijada SOLO con AJUSTE (la de la
 * proporción más cercana al 80 % con todos los cortes juntos, 79,9 %; `--calibrar`): con 2 jornadas, el
 * 96 % de las simulaciones; con 6, el 88 %; desde 10, el 80 %. En EVALUACIÓN, el puesto real cae dentro en
 * el 80,8 % [76,3, 85,2] de los casos: 79,9 % tras 2, 82,5 % tras 4, 80,2 % tras 6 y 80,7 % a mitad, con
 * 4,8, 3,4, 2,8 y 2,2 puestos de anchura media. Por eso la web dice «8 de cada 10 veces» (comprobado con
 * las temporadas pasadas) y no «en 8 de cada 10 simulaciones», que con pocas jornadas no sería verdad.
 *
 * Cuántas simulaciones (SIM.sims, 2.000) y lo que tarda (revisión del 19/10/2026, medido EN FRÍO: las
 * primeras cifras de esta cabecera eran con el motor ya caliente). En este portátil (Intel i7-1165G7 con
 * la CPU en modo de ahorro: más lento que un móvil de hoy), con PG1 de 2026-27, el grupo más grande de
 * prebenjamín (13 equipos, 144 partidos por jugar), en Chrome, en una página nueva que entra por #/ajustes
 * (sin nada pronosticado antes), tres de cada, con la CPU tal cual y frenada 4× (como un móvil lento):
 *   projectionApplies (si lo hay)                   4-5 ms     16-17 ms a 4×
 *   projectPlaces, después (puesto y puntos)        21-24 ms   56-71 ms
 *   projectStandings, después (las simulaciones)    31-34 ms   88-93 ms
 *   projectStandings, todo de una vez               53-61 ms   156-170 ms
 * (lo de projectPlaces es, casi todo, el pronóstico de los 144 partidos y su ajuste). Por eso cada
 * pantalla pide solo lo que enseña (la web, abajo): las simulaciones, solo al abrir la tabla prevista. El
 * primer pintado (mediana de 5, dos tandas, frente a una copia de origin/main, a 1×): la Tabla de PG1,
 * igual que sin el pronóstico (−3 y −5 ms; cuando simulaba al pintar, 66-77 ms más); Mi equipo con Las
 * Mesas Hu. (PG2), 21-24 ms más (cuando simulaba, 36-57 ms); a 4×, el ruido entre tandas (±150 ms) tapa
 * la diferencia. Después, nada: va en la caché. En Node, simulate de PG1 entera (tablas de marcadores
 * incluidas), unos 60 ms la primera vez en un proceso nuevo y, después (mediana de 60 vueltas), 8,5 ms con
 * 1.000 simulaciones, 15 con 2.000, 35 con 5.000 y 66 con 10.000; con el generador en una función aparte,
 * unos 21 ms con 2.000 (simulate). Con 2.000, la probabilidad de cada puesto lleva un error de un punto,
 * más o menos, y el abanico sale como con 10.000 (en el backtest, dentro el 80,8 % frente al 80,7 %, y
 * 3,28 puestos de anchura media frente a 3,29); el puesto pronosticado y los puntos no dependen de cuántas
 * (se calculan sin sortear). Se quedan las 2.000: más no cambiaría ni el puesto ni los puntos, y la tabla
 * prevista tardaría más en abrirse.
 *
 * La tabla y el calendario, de acuerdo: la clasificación de partida es la oficial, y lo que queda, lo que
 * no tiene marcador en el calendario. Si un día la una lleva un resultado que el otro aún no trae (la
 * federación publica la clasificación y los resultados por separado), ese partido se contaría dos veces o
 * ninguna: la web no pronostica hasta que cuadren (startMatchesCalendar, que desde la revisión del
 * 19/10/2026 también mira los goles de lo que la federación puede contar o no; en 2026-27, hoy cuadran los
 * cuatro grupos). Un partido sin jugar en un campo «EXCLUIDO» o «SUSPENDIDO» se simula, como la web lo
 * pronostica: si el excluido ya no está en la tabla, no (no es de dos equipos de la tabla). Ni el
 * enfrentamiento directo ni otros desempates de la federación: tras puntos, diferencia y goles, a suertes. */
import { retiredTeams } from './model.js';
import { PARAMS, copiedMatches, forecastApplies, forecastOdds, offByStatus, trainingFor } from './pronostico.js';

/* sims: las simulaciones de cada proyección; seed: la semilla; fan y fanSlope: los de fanMass (la masa del
 * abanico, max(fan, 1 − fanSlope·jornadas jugadas), calibrada con AJUSTE: la cabecera). */
export const SIM = Object.freeze({ sims: 2000, seed: 19102026, fan: 0.8, fanSlope: 0.02 });

/* La parte de las simulaciones que reúne el abanico con `rounds` jornadas jugadas: max(0,80, 1 − 0,02·rounds)
 * (con 2, el 96 %; con 6, el 88 %; desde 10, el 80 %), la que hace que el puesto real caiga dentro 8 de
 * cada 10 veces (la cabecera). */
export function fanMass(rounds, { fan = SIM.fan, fanSlope = SIM.fanSlope } = {}) {
  return Math.max(fan, 1 - fanSlope * rounds);
}

// Lo que se le pide al pronóstico de un partido que la web no enseña (un equipo que aún no ha jugado,
// uno con la fecha pasada y sin resultado, uno sin fecha): el mismo modelo, sin los mínimos.
const LOOSE = Object.freeze({ ...PARAMS, minRounds: 1, minPlayed: 0 });
// Un partido de ninguna jornada y sin fecha: con trainingFor, todo lo jugado que cuenta.
const NONE = Object.freeze({ roundKey: null, dateISO: null });

const scored = m => m.hs != null && m.as != null;

/* Las jornadas jugadas que cuentan para el pronóstico (las de trainingFor: con fecha y marcador, sin
 * retirados, mesa, copias ni estados de fuera), con `before`, las de antes de ese día. */
export function playedRounds(group, { status = null, before = null } = {}) {
  return new Set(trainingFor(group, NONE, { status, before }).map(m => m.roundKey)).size;
}

/* Los partidos que cuentan de `team` (los de trainingFor), con `before`, los de antes de ese día. */
export function playedBy(group, team, { status = null, before = null } = {}) {
  return trainingFor(group, NONE, { status, before }).filter(m => m.home === team || m.away === team).length;
}

// Las probabilidades de 0, 1, 2… goles con media `mean` (Poisson), hasta que lo que queda pesa menos
// de una cienmilésima (para desempatar, la cola no cuenta), y como mucho 255.
const TAIL = 1e-5;
function goalPmf(mean) {
  if (!(mean > 0)) return Float64Array.of(1);
  const out = [];
  let p = Math.exp(-mean), cum = 0;
  for (let g = 0; g < 256; g += 1) {
    if (g > 0) p *= mean / g;
    out.push(p);
    cum += p;
    if (g >= mean && 1 - cum < TAIL) break;
  }
  return Float64Array.from(out);
}

// Si un desenlace no tiene ningún marcador posible (unas medias de cero): el más corto.
const SHORTEST = [1 * 256 + 0, 0, 0 * 256 + 1];
// Los pasos de cada tabla de marcadores (STEPS, una potencia de dos).
const STEPS = 128;

/* Los marcadores de los partidos que quedan, por desenlace, en tablas de STEPS pasos de igual probabilidad
 * (los cuantiles): un sorteo es mirar una casilla. Con las dos medias de goles del pronóstico (el Poisson
 * de pronostico.js), los goles de cada equipo son independientes (ph, pa); si gana el local, el marcador
 * (i, j), j < i, en dos pasos: i, con peso ph[i]·FA(i − 1) (FA, lo acumulado de pa), y j, entre 0 e
 * i − 1, con peso pa[j]; si gana el visitante, lo mismo al revés; en el empate, i con peso ph[i]·pa[i] y
 * j = i. Es el Poisson condicionado al desenlace, en ese orden (por los goles del que gana y, dentro, por
 * los del que pierde), y la casilla s de la tabla, el marcador en que lo acumulado pasa de (s + ½)/STEPS:
 * cada marcador sale con su probabilidad, a medio paso (0,2 %) de error, y uno de menos de medio paso,
 * casi nunca (para desempatar, da igual: la media de goles por partido no se mueve ni una centésima). Sin
 * recorrer la rejilla de goles entera (19/10/2026: con ella, unos 40.000 marcadores en un grupo de 13,
 * prepararla y sortear en ella costaba más que las simulaciones). Sorteado el desenlace con el 1X2 de las
 * notas, el marcador sale de los suyos: si el 1X2 no va con los goles esperados, una victoria corta del
 * que marca menos, nunca un marcador que contradiga el desenlace. Todas seguidas, cell[(3k + r)·STEPS + s]
 * (k, el partido; r: 0, gana el local; 1, empate; 2, gana el visitante; local · 256 + visitante); sin
 * ningún marcador posible, el más corto (SHORTEST). */
function scoreTables(fixtures) {
  const M = fixtures.length;
  const cell = new Uint16Array(3 * M * STEPS);
  const w = new Float64Array(257);
  for (let k = 0; k < M; k += 1) {
    const ph = goalPmf(fixtures[k].xgHome), pa = goalPmf(fixtures[k].xgAway);
    const FH = new Float64Array(ph.length), FA = new Float64Array(pa.length);
    for (let i = 0, acc = 0; i < ph.length; i += 1) { acc += ph[i]; FH[i] = acc; }
    for (let j = 0, acc = 0; j < pa.length; j += 1) { acc += pa[j]; FA[j] = acc; }
    for (let r = 0; r < 3; r += 1) {
      const at = (3 * k + r) * STEPS;
      // g, los goles del que gana (o los de cada uno, en el empate), de first a top − 1, con su peso w[g]; y,
      // si gana alguien, F, lo acumulado del que pierde, que mete de 0 a g − 1.
      const win = r === 2 ? pa : ph, lose = r === 2 ? ph : pa, F = r === 2 ? FH : FA, L = lose.length;
      const first = r === 1 ? 0 : 1, top = r === 1 ? Math.min(win.length, L) : win.length;
      let sum = 0;
      for (let g = first; g < top; g += 1) {
        w[g] = r === 1 ? win[g] * lose[g] : win[g] * F[Math.min(g, L) - 1];
        sum += w[g];
      }
      if (!(sum > 0)) { cell.fill(SHORTEST[r], at, at + STEPS); continue; }
      let g = first, acc = w[first], y = 0;
      for (let st = 0; st < STEPS; st += 1) {
        const t = ((st + 0.5) / STEPS) * sum;
        while (acc < t && g < top - 1) { g += 1; acc += w[g]; y = 0; }
        if (r === 1) { cell[at + st] = g * 256 + g; continue; }
        // Dentro de g, lo que falta hasta t, en su parte: el del que pierde, por el inverso de F.
        const m = Math.min(g, L), part = w[g] > 0 ? Math.min(1, Math.max(0, (t - (acc - w[g])) / w[g])) : 0;
        const into = part * F[m - 1];
        while (y < m - 1 && F[y] <= into) y += 1;
        cell[at + st] = r === 0 ? g * 256 + y : y * 256 + g;
      }
    }
  }
  return cell;
}

/* Lo que se espera al final, sin sortear nada (19/10/2026: aparte de las simulaciones, que la cifra de la
 * ficha no necesita): de cada equipo, en el orden de start ([{ pts, gf, gc }]), sus puntos, su diferencia
 * y sus goles a favor de start más, de cada partido de fixtures, 3·P(gana) + P(empate) y los goles medios
 * de su tabla de marcadores (cell, de scoreTables) en cada desenlace por su probabilidad: lo mismo a lo que
 * tiende la media de las simulaciones, sin su ruido. { pts, dg, gf }. */
const WIN = [3, 1, 0], LOSS = [0, 1, 3];
function expectations(start, fixtures, cell) {
  const pts = Float64Array.from(start, r => r.pts || 0);
  const gf = Float64Array.from(start, r => r.gf || 0);
  const dg = Float64Array.from(start, r => (r.gf || 0) - (r.gc || 0));
  fixtures.forEach((f, k) => {
    const h = f.home, a = f.away;
    const sum = f.pHome + f.pDraw + f.pAway;
    const edges = [0, f.pHome / sum, (f.pHome + f.pDraw) / sum, 1];
    for (let r = 0; r < 3; r += 1) {
      const q = 3 * k + r, pr = edges[r + 1] - edges[r];
      let gh = 0, ga = 0;
      for (let st = 0; st < STEPS; st += 1) { gh += cell[q * STEPS + st] >> 8; ga += cell[q * STEPS + st] & 255; }
      gh /= STEPS; ga /= STEPS;
      pts[h] += pr * WIN[r]; pts[a] += pr * LOSS[r];
      gf[h] += pr * gh; gf[a] += pr * ga; dg[h] += pr * (gh - ga); dg[a] += pr * (ga - gh);
    }
  });
  return { pts, dg, gf };
}

/* Las simulaciones: en cada una de las `sims`, cada partido de fixtures, el desenlace con su 1X2 y el
 * marcador con su tabla (cell), con un solo número aleatorio (lo que sobra del sorteo del desenlace,
 * reescalado, es otro uniforme); y la clasificación final por puntos, diferencia de goles y goles a favor
 * (como las tablas de liga de la web) y, a igualdad de las tres cosas, a suertes. Devuelve las veces que
 * cada equipo acaba en cada puesto: count[t·T + p], el equipo t de start en el puesto p + 1. Determinista
 * con la misma semilla. */
function placeCounts(start, fixtures, cell, { sims, seed }) {
  const T = start.length, M = fixtures.length;
  const basePts = new Int32Array(T), baseGd = new Int32Array(T), baseGf = new Int32Array(T);
  start.forEach((r, t) => { basePts[t] = r.pts || 0; baseGf[t] = r.gf || 0; baseGd[t] = (r.gf || 0) - (r.gc || 0); });
  // De cada partido, los dos cortes del sorteo del desenlace (u < cut1: gana el local; u < cut2: empate)
  // y, de cada desenlace, dónde empieza su tramo (lo) y cuánto se estira para recorrer su tabla (scale).
  const home = new Uint8Array(M), away = new Uint8Array(M), cut1 = new Float64Array(M), cut2 = new Float64Array(M);
  const lo = new Float64Array(3 * M), scale = new Float64Array(3 * M);
  fixtures.forEach((f, k) => {
    home[k] = f.home;
    away[k] = f.away;
    const sum = f.pHome + f.pDraw + f.pAway;
    const edges = [0, f.pHome / sum, (f.pHome + f.pDraw) / sum, 1];
    cut1[k] = edges[1];
    cut2[k] = edges[2];
    for (let r = 0; r < 3; r += 1) {
      const q = 3 * k + r, pr = edges[r + 1] - edges[r];
      lo[q] = edges[r];
      scale[q] = pr > 0 ? STEPS / pr : 0;
    }
  });
  const count = new Float64Array(T * T);
  const pts = new Int32Array(T), gd = new Int32Array(T), gf = new Int32Array(T);
  const key = new Float64Array(T), order = new Uint8Array(T);
  // mulberry32 (el generador del banco de pruebas), escrito en cada sitio en que se sortea y con su estado
  // en una variable de esta función, en 32 bits con signo (los mismos bits, y los mismos números, que
  // con >>> 0). En una función aparte que lo cambiara, el estado viviría fuera, y cada sorteo crearía un
  // número en memoria. Medido el 19/10/2026 en Node (simulate entera, 2.000 simulaciones de PG1, la mediana
  // de 100 vueltas tras 20 de calentamiento): unos 14 ms así frente a unos 21 ms con la función, un tercio
  // menos; la primera vez, en un proceso nuevo, 59-68 ms con los dos (ver la cabecera).
  let state = seed | 0, z = 0;
  for (let s = 0; s < sims; s += 1) {
    pts.set(basePts); gd.set(baseGd); gf.set(baseGf);
    for (let k = 0; k < M; k += 1) {
      state = (state + 0x6D2B79F5) | 0;
      z = Math.imul(state ^ (state >>> 15), state | 1);
      z ^= z + Math.imul(z ^ (z >>> 7), z | 61);
      const u = ((z ^ (z >>> 14)) >>> 0) / 4294967296;
      const r = (u >= cut1[k] ? 1 : 0) + (u >= cut2[k] ? 1 : 0);
      const q = 3 * k + r;
      // La casilla de su tabla, con u reescalado a su tramo (otro uniforme).
      const c = cell[q * STEPS + Math.min(((u - lo[q]) * scale[q]) | 0, STEPS - 1)];
      const gh = c >> 8, ga = c & 255, h = home[k], a = away[k];
      gf[h] += gh; gf[a] += ga; gd[h] += gh - ga; gd[a] += ga - gh;
      pts[h] += WIN[r]; pts[a] += LOSS[r];
    }
    // Puntos, diferencia y goles en una sola cifra (las dos últimas, en 12 bits) y, a igualdad, a suertes.
    for (let t = 0; t < T; t += 1) {
      const d = Math.max(0, Math.min(4095, gd[t] + 2048)), g = Math.max(0, Math.min(4095, gf[t]));
      state = (state + 0x6D2B79F5) | 0;
      z = Math.imul(state ^ (state >>> 15), state | 1);
      z ^= z + Math.imul(z ^ (z >>> 7), z | 61);
      key[t] = (pts[t] * 4096 + d) * 4096 + g + ((z ^ (z >>> 14)) >>> 0) / 4294967296;
      order[t] = t;
    }
    for (let p = 1; p < T; p += 1) {
      const t = order[p];
      let q = p - 1;
      while (q >= 0 && key[order[q]] < key[t]) { order[q + 1] = order[q]; q -= 1; }
      order[q + 1] = t;
    }
    for (let p = 0; p < T; p += 1) count[order[p] * T + p] += 1;
  }
  return count;
}

/* La simulación del resto de la liga. teams: los nombres; start: [{ pts, gf, gc }] de cada uno, en su
 * orden; fixtures: [{ home, away (índices en teams), pHome, pDraw, pAway, xgHome, xgAway }]. Las tablas de
 * marcadores de cada partido (scoreTables), lo que se espera (expectations) y las simulaciones
 * (placeCounts). Devuelve, por equipo y en el orden de teams, { team, pts, dg, gf, probs }: los puntos, la
 * diferencia y los goles a favor que se esperan al final, calculados sin sortear nada, y probs, la parte
 * de las simulaciones en que acaba en cada puesto, del 1.º al último. Determinista con la misma semilla. */
export function simulate(teams, start, fixtures, { sims = SIM.sims, seed = SIM.seed } = {}) {
  const T = teams.length;
  const cell = scoreTables(fixtures);
  const exp = expectations(start, fixtures, cell);
  const count = placeCounts(start, fixtures, cell, { sims, seed });
  return teams.map((team, t) => ({
    team,
    pts: exp.pts[t],
    dg: exp.dg[t],
    gf: exp.gf[t],
    probs: Float64Array.from({ length: T }, (_, p) => count[t * T + p] / sims),
  }));
}
/* El abanico de un equipo: los puestos seguidos más juntos, con el pronosticado `pos` dentro, en los que
 * acaba en al menos `mass` de las simulaciones; a igual anchura, el que más reúne y, después, el de más
 * arriba. { lo, hi, mass }, del 1.º al último. */
export function fanOf(probs, pos, mass) {
  const T = probs.length;
  let best = null;
  for (let lo = 1; lo <= pos; lo += 1) {
    let sum = 0;
    for (let p = lo; p <= T; p += 1) {
      sum += probs[p - 1];
      if (p < pos || sum < mass - 1e-9) continue;
      const width = p - lo;
      if (!best || width < best.hi - best.lo || (width === best.hi - best.lo && sum > best.mass + 1e-12)) best = { lo, hi: p, mass: sum };
      break;
    }
  }
  return best || { lo: 1, hi: T, mass: 1 };
}

/* Lo que queda por jugar con una clasificación de partida (start: [{ team, pts, gf, gc }], los equipos
 * que se clasifican, sin retirados; played(m): si el partido ya está en ella), sin pronosticar nada
 * todavía: cada partido del calendario que no está jugado, entre dos equipos de start, que no es una copia
 * de la importación ni lo da la app por retirado, anulado o suspendido. { rounds (playedRounds), index (el
 * sitio de cada equipo en start), matches } o null si el grupo no lo admite (forecastApplies y liga), sin
 * PARAMS.minRounds jornadas jugadas o sin nada por jugar. */
function remaining(group, { start, played = scored, portalSeason = null, status = null, before = null, prueba = false }) {
  if (!group || group.kind !== 'league' || !forecastApplies(group, { portalSeason, prueba })) return null;
  if (!Array.isArray(start) || start.length < 2) return null;
  const rounds = playedRounds(group, { status, before });
  if (rounds < PARAMS.minRounds) return null;
  const retired = retiredTeams(group);
  const copies = copiedMatches(group);
  const index = new Map(start.map((r, i) => [r.team, i]));
  const matches = [];
  for (const round of group.rounds || []) {
    for (const m of round.matches) {
      if (played(m) || !index.has(m.home) || !index.has(m.away)) continue;
      if (retired.has(m.home) || retired.has(m.away) || copies.has(m) || offByStatus(status, m)) continue;
      matches.push(m);
    }
  }
  return matches.length ? { rounds, index, matches } : null;
}

/* Lo que no sortea nada (19/10/2026: la cifra de la ficha, que solo lleva el puesto y los puntos, no
 * espera a las simulaciones): el pronóstico de cada partido que queda (remaining), el de la web
 * (forecastOdds con todo el calendario) o, si la web no enseña ninguno, el mismo modelo sin los mínimos
 * (LOOSE) y con todo lo jugado; sus tablas de marcadores; lo que se espera (expectations); y la tabla final
 * proyectada, por puntos esperados (y diferencia y goles esperados para desempatar): cada puesto, de un
 * solo equipo. { start, fixtures, cell, order (el índice en start de cada puesto), places: { matches,
 * rounds, rows: [{ team, pos, pts, dg, gf, played }] } } o null (remaining; o ningún partido con
 * pronóstico, que con dos jornadas jugadas no pasa: LOOSE no pide mínimos). */
function prepare(group, { start, played = scored, portalSeason = null, today = null, status = null, before = null, prueba = false }) {
  const left = remaining(group, { start, played, portalSeason, status, before, prueba });
  if (!left) return null;
  const fixtures = [];
  for (const m of left.matches) {
    // En el backtest, lo jugado después del corte lleva su marcador: se pronostica sin él.
    const match = scored(m) ? { ...m, hs: null, as: null } : m;
    const f = forecastOdds(group, match, { portalSeason, today, full: true, status, before, prueba })
      || forecastOdds(group, { ...match, dateISO: null }, { portalSeason, status, before, prueba, params: LOOSE });
    if (!f) continue;
    fixtures.push({ home: left.index.get(m.home), away: left.index.get(m.away), pHome: f.pHome, pDraw: f.pDraw, pAway: f.pAway, xgHome: f.xgHome, xgAway: f.xgAway });
  }
  if (!fixtures.length) return null;
  const cell = scoreTables(fixtures);
  const exp = expectations(start, fixtures, cell);
  const order = start.map((r, i) => i).sort((a, b) => exp.pts[b] - exp.pts[a] || exp.dg[b] - exp.dg[a] || exp.gf[b] - exp.gf[a] || a - b);
  const rows = order.map((i, p) => ({
    team: start[i].team, pos: p + 1, pts: exp.pts[i], dg: exp.dg[i], gf: exp.gf[i],
    played: playedBy(group, start[i].team, { status, before }),
  }));
  return { start, fixtures, cell, order, places: { matches: fixtures.length, rounds: left.rounds, rows } };
}

/* Lo de prepare con las simulaciones (placeCounts): de cada fila, probs (la parte de las simulaciones en
 * que acaba en cada puesto) y el abanico (fanOf, con la masa de fanMass o `fan`). */
function drawn(prep, { sims = SIM.sims, seed = SIM.seed, fan = null } = {}) {
  const { start, fixtures, cell, order, places } = prep;
  const T = start.length;
  const count = placeCounts(start, fixtures, cell, { sims, seed });
  const mass = fan ?? fanMass(places.rounds);
  const rows = places.rows.map((r, p) => {
    const i = order[p];
    const probs = Float64Array.from({ length: T }, (_, q) => count[i * T + q] / sims);
    return { ...r, probs, ...fanOf(probs, r.pos, mass) };
  });
  return { sims, matches: places.matches, rounds: places.rounds, rows };
}

/* La proyección de un grupo con una clasificación de partida, la de la web o la del backtest:
 *   { sims, matches, rounds, rows: [{ team, pos, pts, dg, gf, played, probs, lo, hi, mass }] }
 * con las filas en el orden de la tabla final proyectada. start y played, los de remaining; las demás
 * opciones, las de forecastMatch, y sims, seed y fan, los de las simulaciones. Con `draw: false`, sin
 * simular: { matches, rounds, rows: [{ team, pos, pts, dg, gf, played }] }, el mismo puesto y los mismos
 * puntos (prepare). null si el grupo no lo admite (forecastApplies y liga), sin PARAMS.minRounds jornadas
 * jugadas o sin nada por jugar. */
export function projection(group, {
  start, played = scored, portalSeason = null, today = null, status = null, before = null, prueba = false,
  sims = SIM.sims, seed = SIM.seed, fan = null, draw = true,
} = {}) {
  const prep = prepare(group, { start, played, portalSeason, today, status, before, prueba });
  if (!prep) return null;
  return draw ? drawn(prep, { sims, seed, fan }) : prep.places;
}

/* La clasificación de partida de la web: la que enseña (group.standings, ya por puntos: points_order de
 * scripts/generate_js.py), sin retirados. */
export function standingsStart(group) {
  return (group.standings || []).filter(r => !r.retired && r.pts != null)
    .map(r => ({ team: r.team, pts: r.pts, gf: r.gf ?? 0, gc: r.gc ?? 0 }));
}

/* Si la clasificación de partida cuadra con el calendario, que es de donde salen los partidos que quedan:
 * cada equipo lleva en ella (pj) todos sus partidos con marcador contra equipos que siguen (sin copias ni
 * lo que la app da por retirado, anulado o suspendido) y, como mucho, además, los que la federación puede
 * contar o no: los que jugó contra un retirado (con marcador en el calendario o contra uno que el
 * calendario ni trae, tantos como veces se enfrentan dos equipos del calendario, ida y vuelta incluidas:
 * Batán en PG2 de 2025-26) y lo anulado con marcador. Si cuenta alguno de esos, tiene que ser con su
 * marcador (revisión del 19/10/2026): los goles a favor y en contra de la fila, los de los suyos más los de
 * tantos de esos como le sobran (explains). Si no, lo que sobra puede ser un partido que la tabla ya cuenta
 * y el calendario aún no trae, y se contaría dos veces: en la tabla y en la simulación. En el archivo y en
 * 2026-27, de 314 filas que cuentan alguno de esos, 312 cuadran así (las otras dos, Unión Viera en PGC3 de
 * 2016-17 y Unión Carrizal en GC4 de benjamín de 2017-18, con un marcador que no es el del calendario: sin
 * pronóstico, el lado seguro). Contra un retirado que el calendario no trae no se sabe el marcador, y ahí
 * solo se cuentan los partidos. Si no cuadra (la tabla de la federación va por delante o por detrás del
 * calendario, hasta la pasada siguiente del bot), un partido se contaría dos veces o ninguna, y la web no
 * pronostica (19/10/2026). Una fila sin pj no se comprueba. */
const SUBSETS = 16;
export function startMatchesCalendar(group, { status = null } = {}) {
  const retired = retiredTeams(group);
  const copies = copiedMatches(group);
  const rows = (group.standings || []).filter(r => !r.retired && r.pts != null);
  const inCalendar = new Set();
  const meetings = new Map();
  const need = new Map(), may = new Map();
  for (const round of group.rounds || []) {
    for (const m of round.matches) {
      inCalendar.add(m.home); inCalendar.add(m.away);
      if (copies.has(m)) continue;
      // Las veces que se enfrentan dos equipos, sin mirar quién es el local (ida y vuelta, dos).
      const pair = m.home < m.away ? `${m.home}\u0001${m.away}` : `${m.away}\u0001${m.home}`;
      meetings.set(pair, (meetings.get(pair) || 0) + 1);
      if (!scored(m)) continue;
      const off = retired.has(m.home) || retired.has(m.away) || offByStatus(status, m);
      for (const [team, gf, gc] of [[m.home, m.hs, m.as], [m.away, m.as, m.hs]]) {
        if (off) {
          if (!may.has(team)) may.set(team, []);
          may.get(team).push([gf, gc]);
          continue;
        }
        const n = need.get(team) || { n: 0, gf: 0, gc: 0 };
        n.n += 1; n.gf += gf; n.gc += gc;
        need.set(team, n);
      }
    }
  }
  const absent = (group.standings || []).filter(r => retired.has(r.team) && !inCalendar.has(r.team)).length;
  const perRival = Math.max(0, ...meetings.values());
  return rows.every((r) => {
    if (r.pj == null) return true;
    const n = need.get(r.team) || { n: 0, gf: 0, gc: 0 };
    const list = may.get(r.team) || [];
    const extra = r.pj - n.n;
    if (extra < 0 || extra > list.length + absent * perRival) return false;
    // Con un retirado que el calendario no trae, o más de SUBSETS de esos (nunca: 0-4), solo los partidos.
    if (extra === 0 || absent > 0 || r.gf == null || r.gc == null || list.length > SUBSETS) return true;
    return explains(list, extra, r.gf - n.gf, r.gc - n.gc);
  });
}

// Si `k` de los partidos de `list` ([goles a favor, en contra] de cada uno) suman justo `gf` y `gc`.
function explains(list, k, gf, gc) {
  for (let mask = 0; mask < 1 << list.length; mask += 1) {
    let n = 0, f = 0, c = 0;
    for (let i = 0; i < list.length; i += 1) if (mask & (1 << i)) { n += 1; f += list[i][0]; c += list[i][1]; }
    if (n === k && f === gf && c === gc) return true;
  }
  return false;
}

/* La de la web: con la clasificación que enseña (standingsStart) y lo jugado, lo que tiene marcador, si las
 * dos cuadran (startMatchesCalendar). Tres pasos, y cada uno, una vez por grupo, por `status` y por la
 * temporada del portal y el día (PROJECTIONS: pintar otra vez no vuelve a calcular nada); cada pantalla pide
 * solo lo que enseña (revisión del 19/10/2026: antes, la Tabla de cada grupo, la ficha y Mi equipo
 * simulaban en su primer pintado, y en frío, con la CPU frenada 4×, la Tabla de PG1 tardaba casi 0,3 s más
 * en salir):
 * - projectionApplies, si lo hay, sin pronosticar nada (remaining): el enlace de la Tabla y el router;
 * - projectPlaces, el puesto y los puntos, sin simular (prepare): la cifra de la ficha y de Mi equipo;
 * - projectStandings, todo, con las simulaciones (drawn, sobre lo de projectPlaces): la tabla prevista.
 * Las tres van a una: projectionApplies es false justo cuando las otras dos dan null (salvo un grupo en
 * que ningún partido tenga pronóstico, que con dos jornadas jugadas no pasa: LOOSE). Las opciones, las de
 * forecastMatch en la web (forecastOptions de ui.js). */
const PROJECTIONS = new WeakMap();
function webEntry(group, { portalSeason = null, today = null, status = null } = {}) {
  if (!PROJECTIONS.has(group)) PROJECTIONS.set(group, new Map());
  const byStatus = PROJECTIONS.get(group);
  const st = typeof status === 'function' ? status : null;
  if (!byStatus.has(st)) byStatus.set(st, new Map());
  const memo = byStatus.get(st);
  const key = `${portalSeason}\u0001${today}`;
  if (!memo.has(key)) memo.set(key, { options: { portalSeason, today, status: st } });
  return memo.get(key);
}

export function projectionApplies(group, opts = {}) {
  if (!group || typeof group !== 'object') return false;
  const entry = webEntry(group, opts);
  if (entry.applies === undefined) {
    const { portalSeason, status } = entry.options;
    entry.applies = startMatchesCalendar(group, { status })
      && remaining(group, { start: standingsStart(group), portalSeason, status }) !== null;
  }
  return entry.applies;
}

function webPrepared(group, opts) {
  if (!projectionApplies(group, opts)) return null;
  const entry = webEntry(group, opts);
  if (entry.prep === undefined) entry.prep = prepare(group, { start: standingsStart(group), ...entry.options });
  return entry.prep ? entry : null;
}

export function projectPlaces(group, opts = {}) {
  const entry = webPrepared(group, opts);
  return entry ? entry.prep.places : null;
}

export function projectStandings(group, opts = {}) {
  const entry = webPrepared(group, opts);
  if (!entry) return null;
  if (entry.full === undefined) entry.full = drawn(entry.prep);
  return entry.full;
}
