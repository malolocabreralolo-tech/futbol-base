/* RESULTADO DE LA ELECCIÓN (17/10/2026): NO ELEGIDA. La media de las probabilidades de Massey y del Elo de
 * goles, con los pesos que da el ajuste (0,74 y 0,26), da en EVALUACIÓN 0,534 de log-loss, como Massey solo
 * (+0,000 [−0,001, +0,001]): no aporta nada y es más complicada. Lo mismo las demás mezclas probadas con
 * los pesos del ajuste (en EVALUACIÓN, Δ frente a Massey): Massey + Elo + Poisson bayesiano (0,66, 0,27,
 * 0,07), −0,000 [−0,002, +0,001]; Massey + bayes (0,93, 0,07), −0,000 [−0,001, +0,000]; Massey + rivales
 * comunes (0,94, 0,06), +0,000 [−0,000, +0,000]; Massey + el Poisson de antes (0,99, 0,01), lo mismo; Elo +
 * bayes (0,71, 0,29), +0,002 [−0,002, +0,006]. Con los pesos fijados en el ajuste, casi todo el peso va a
 * Massey: las otras no le añaden información.
 *
 * Mezcla de modelos del pronóstico de prebenjamín, para el banco (scripts/pronostico_banco.mjs): la media
 * ponderada de las probabilidades de las notas de Massey (massey.mjs) y del Elo de goles (elo.mjs), cada uno
 * con sus parámetros de siempre (los suyos, fijados en el ajuste). Los pesos, en una rejilla de 0,01 en el
 * símplex, los de menor log-loss del 1X2 en las parejas de AJUSTE (el log-loss de una media de
 * probabilidades es convexo en los pesos: un solo mínimo). Puro y determinista.
 *
 *   node scripts/pronostico_banco.mjs --modelo scripts/pronostico_modelos/mezcla.mjs --contra actual */
import * as massey from './massey.mjs';
import * as elo from './elo.mjs';

export const nombre = 'mezcla Massey + Elo';
export const descripcion = 'media ponderada de las probabilidades de Massey y del Elo de goles, con los pesos del ajuste';

const COMPONENTES = Object.freeze([['massey', massey.predictor], ['elo', elo.predictor]]);
// Los pesos que da ajustar con el banco del 17/10/2026 (log-loss en el ajuste, 0,5113; Massey solo, 0,5117).
export const PESOS = Object.freeze([0.74, 0.26]);
let pesos = PESOS;

export function predictor(training, match, group, info) {
  const p = { pHome: 0, pDraw: 0, pAway: 0 };
  COMPONENTES.forEach(([, f], i) => {
    const q = f(training, match, group, info);
    for (const k of Object.keys(p)) p[k] += pesos[i] * q[k];
  });
  return p;
}

// Los pesos de menor log-loss en las parejas de ajuste, en la rejilla de 0,01 (a igualdad, más peso al
// primero, Massey). Los componentes, con sus PARAMS (no se reajustan aquí).
export function ajustar(banco) {
  const rows = banco.pares.map(pr => ({ y: pr.y, q: COMPONENTES.map(([, f]) => f(pr.training, pr.match, pr.group, pr)) }));
  const key = { home: 'pHome', draw: 'pDraw', away: 'pAway' };
  let best = null;
  for (let a = 100; a >= 0; a -= 1) {
    const w = [a / 100, 1 - a / 100];
    let s = 0;
    for (const { y, q } of rows) s -= Math.log(Math.max(1e-15, w[0] * q[0][key[y]] + w[1] * q[1][key[y]]));
    const ll = s / rows.length;
    if (!best || ll < best.ll - 1e-12) best = { w, ll };
  }
  pesos = Object.freeze(best.w.map(x => Math.round(x * 100) / 100));
  return { componentes: COMPONENTES.map(([n]) => n), pesos: [...pesos], logLossAjuste: Math.round(best.ll * 1e6) / 1e6, coincideConPESOS: pesos.every((x, i) => x === PESOS[i]) };
}
