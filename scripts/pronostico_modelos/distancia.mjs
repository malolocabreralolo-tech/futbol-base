/* RESULTADO (17/10/2026): NO ADOPTADA; la web no lleva corrección por distancia. En AJUSTE (23.968
 * pronósticos a todas las distancias con los límites de la web), la mejor deriva es 0: log-loss 0,50313, y
 * con 0,001, 0,50316; con 0,01, 0,50365; con 0,05, 0,50824 (la rejilla, en el `ajuste` del informe). La
 * pendiente que mejor va en cada tramo de distancia es la de siempre (×1,00) hasta k = 12, y a 13+ una más
 * afilada (×1,08): a distancia, la web no se pasa de seguro y no hay nada que suavizar (su fiabilidad, en
 * AJUSTE y en EVALUACIÓN, con el cero dentro en todos los tramos: la tabla, en la cabecera del banco). Con la
 * deriva del ajuste, el modelo es el de la web, y en EVALUACIÓN da lo mismo en todas las parejas (Δ 0 en
 * cada tramo). La cota, con la deriva que mejor le va a la propia EVALUACIÓN (0,01, que no es una prueba):
 * −0,0005 [−0,0027, +0,0017] de log-loss en total y −0,0014 [−0,0063, +0,0039] a 13+, sin cambiar ningún
 * favorito; en AJUSTE, esa deriva empeora (+0,0005). La regla, fijada antes de ajustar: se adopta solo si
 * en AJUSTE mejora el log-loss en una milésima al menos y en EVALUACIÓN no empeora k = 1 ni ningún tramo
 * de forma demostrable.
 *
 * La corrección por distancia del pronóstico de prebenjamín, para el banco (scripts/pronostico_banco.mjs,
 * con --distancia): el 1X2 de la web (src/pronostico.js, las notas de Massey) con la varianza de la
 * diferencia de notas inflada con la distancia k del partido (roundsAhead: 1, la próxima jornada),
 *     v' = v + deriva·(k − 1),
 * en la pendiente y la banda de empate de notesOdds: s = β / √(1 + κ·v'), t = θ / √(1 + κₑ·v'). Es la
 * deriva de un paseo aleatorio: si las notas cambian un poco de una jornada a otra, lo que se sabe de un
 * partido a k jornadas vista es menos de lo que dicen los partidos jugados, y cada jornada de por medio
 * suma `deriva` a la varianza de la diferencia. Con k = 1, nada cambia: el pronóstico de siempre. La deriva
 * se ajusta SOLO con las parejas de AJUSTE a todas las distancias (paresDistancia de bancoDeAjuste), en las
 * que la web pronostica (minRounds 2 y minPlayed 1 con el entrenamiento de cada corte), por el log-loss del
 * 1X2, y no puede ser negativa: más lejos no se sabe más.
 *
 *   node scripts/pronostico_banco.mjs --distancia --modelo scripts/pronostico_modelos/distancia.mjs --contra web */
import { PARAMS as WEB, fitNotes, forecastMatch, notesOdds } from '../../src/pronostico.js';

export const nombre = 'Massey con deriva por distancia';
export const descripcion = 'el 1X2 de la web con la varianza de la diferencia de notas más deriva·(k − 1), k la distancia (roundsAhead)';

// La deriva que da ajustar con las parejas de AJUSTE (17/10/2026): ninguna.
export const PARAMS = Object.freeze({ deriva: 0 });
let params = PARAMS;

const sigma = x => (x >= 0 ? 1 / (1 + Math.exp(-x)) : Math.exp(x) / (1 + Math.exp(x)));

/* El 1X2 de notesOdds ({ diff, variance }) a k jornadas vista con una deriva: el mismo de la web con la
 * varianza v + deriva·(k − 1). Con deriva 0 o k = 1, el de notesOdds. */
export function conDeriva({ diff, variance }, k, deriva, p = WEB) {
  const v = variance + deriva * Math.max(0, k - 1);
  const s = p.slope / Math.sqrt(1 + p.slopeVar * v), t = p.band / Math.sqrt(1 + p.bandVar * v);
  const pHome = sigma(s * diff - t), pAway = sigma(-s * diff - t);
  return { pHome, pDraw: Math.max(0, 1 - pHome - pAway), pAway };
}

// Las notas de cada entrenamiento, una vez (el array congelado de la pareja es la clave).
const NOTES = new WeakMap();
const notesOf = training => {
  if (!NOTES.has(training)) NOTES.set(training, fitNotes(training));
  return NOTES.get(training);
};

/* El de la web con su corte (info.corte) y sus límites; con deriva, el 1X2 de conDeriva con su distancia
 * (la `ahead` de forecastMatch, la misma roundsAhead del banco). */
export function pronostico(training, match, group, info, deriva = params.deriva) {
  const f = forecastMatch(group, match, { prueba: true, before: (info && info.corte) || null });
  if (!f) return null;
  if (!deriva || f.ahead <= 1) return { pHome: f.pHome, pDraw: f.pDraw, pAway: f.pAway };
  return conDeriva(notesOdds(notesOf(training), match.home, match.away), f.ahead, deriva);
}

export function predictor(training, match, group, info) {
  return pronostico(training, match, group, info, params.deriva);
}

const REJILLA = Object.freeze([0, 0.0005, 0.001, 0.002, 0.005, 0.01, 0.02, 0.05, 0.1, 0.2]);
const tres = x => Number(x.toPrecision(3));

/* La deriva de menor log-loss en las parejas de AJUSTE a todas las distancias, en las que pronostica la
 * web: primero la rejilla y, si la mejor no es un extremo, la sección áurea entre sus dos vecinas. Deja la
 * deriva (a tres cifras) en el módulo y devuelve { params, logLossAjuste, logLossSinDeriva, pares,
 * rejilla: [[deriva, log-loss]] }. Unos diez segundos. */
export function ajustar(banco) {
  const rows = [];
  for (const pr of banco.paresDistancia()) {
    const f = forecastMatch(pr.group, pr.match, { prueba: true, before: pr.corte });
    if (!f) continue;
    rows.push({ ...notesOdds(notesOf(pr.training), pr.match.home, pr.match.away), k: f.ahead, y: pr.y });
  }
  const key = { home: 'pHome', draw: 'pDraw', away: 'pAway' };
  const loss = d => {
    let s = 0;
    for (const r of rows) s -= Math.log(Math.max(1e-15, conDeriva(r, r.k, d)[key[r.y]]));
    return s / rows.length;
  };
  const grid = REJILLA.map(d => [d, loss(d)]);
  let i = 0;
  grid.forEach(([, l], j) => { if (l < grid[i][1]) i = j; });
  let best = grid[i][0];
  if (i > 0 && i < grid.length - 1) {
    let a = grid[i - 1][0], b = grid[i + 1][0];
    const g = (Math.sqrt(5) - 1) / 2;
    for (let it = 0; it < 60; it += 1) {
      const c = b - g * (b - a), e = a + g * (b - a);
      if (loss(c) < loss(e)) b = e; else a = c;
    }
    best = (a + b) / 2;
  }
  params = Object.freeze({ deriva: best === 0 ? 0 : tres(best) });
  const r6 = x => Math.round(x * 1e6) / 1e6;
  return {
    params: { ...params }, logLossAjuste: r6(loss(params.deriva)), logLossSinDeriva: r6(loss(0)), pares: rows.length,
    rejilla: grid.map(([d, l]) => [d, r6(l)]), coincideConPARAMS: params.deriva === PARAMS.deriva,
  };
}

// La deriva con la que pronostica ahora el módulo (la de ajustar, si se ha llamado; si no, PARAMS).
export const parametros = () => params;
