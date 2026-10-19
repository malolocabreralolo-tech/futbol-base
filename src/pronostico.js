/* Pronóstico de los partidos sin jugar del prebenjamín de la temporada en curso (17/10/2026).
 *
 * Puro e importable en Node sin DOM, como model.js: recibe el Group de model.js y la temporada del
 * portal por parámetro (nunca config.js, R2-1) y no lee ningún global de datos. Nada en la base ni en
 * el bot, ni ninguna petición nueva: solo los partidos ya jugados del grupo, los que la web ya carga.
 *
 * El modelo, en dos piezas (elegido el 17/10/2026 con el banco de pruebas, scripts/pronostico_banco.mjs):
 * - El 1X2 (P(local), P(empate), P(visitante) y el favorito), con las NOTAS DE MASSEY: la «regla de tres»
 *   de los resultados que propuso el usuario (si A le ganó a B y B a C, A tiene que poder con C), hecha
 *   cuenta para todo el grupo a la vez. Cada equipo tiene una nota r, y en cada partido jugado
 *       r_local − r_visitante + campo ≈ ln((goles del local + c) / (goles del visitante + c)),
 *   «cuántas veces más goles mete uno que otro», con c = 3,64 goles de colchón, que recorta las goleadas
 *   sin tirarlas (un 15-0 cuenta 1,6; un 30-0, 2,2; un 5-4, 0,1). Las notas son las que mejor cuadran con
 *   TODOS los partidos jugados a la vez (mínimos cuadrados): A le saca a C lo que A le sacó a B más lo que
 *   B le sacó a C, aunque no se hayan visto, y cada rival común y cada cadena de rivales cuentan, cada uno
 *   con lo que pesa; si se vieron, ese partido es uno más. Con λ = 0,335 partidos ficticios contra la media
 *   (nota 0), quien ha jugado poco se queda cerca de ella. De la diferencia de notas d del partido, una
 *   logística ordenada con banda de empate: P(local) = σ(s·d − t), P(visitante) = σ(−s·d − t) y el empate,
 *   lo que queda; la pendiente s y la banda t bajan cuanto menos se sabe de esa diferencia (su varianza):
 *   con una o dos jornadas, los favoritos se moderan sin inflar el empate.
 * - El resultado más probable y los goles esperados, con el Poisson de ataque y defensa de Maher (el que
 *   daba también el 1X2 hasta el 17/10/2026): cada equipo tiene un ataque A y una defensa D (1 = la media
 *   del grupo; una defensa de 2 encaja el doble), y el local de un partido marca de media
 *   b·H·A_local·D_visitante goles, y el visitante, b·A_visitante·D_local, con b los goles medios del grupo
 *   y H el factor de campo; con k = 1,5 partidos ficticios en la media del grupo (contracción: con un
 *   partido jugado, un equipo es un 40 % lo suyo; con quince, un 91 %). Con las dos medias (por encima de
 *   8 goles, amortiguadas: el modelo multiplicativo se pasa en las goleadas), una distribución de goles
 *   por equipo, independientes, y de ahí el marcador más probable DENTRO del desenlace favorito de las
 *   notas: nunca una victoria del que no es el favorito, ni un 1-1 con un favorito claro.
 * Las dos, solo con los partidos jugados del grupo EN ESTA temporada. Nada de temporadas anteriores, ni
 * como entrada ni como previo de un equipo o de un club (decisión del 17/10/2026): las pasadas solo sirven
 * para PROBAR los modelos (scripts/pronostico_banco.mjs, scripts/backtest_pronostico.mjs) y para fijar los
 * parámetros globales de PARAMS.
 *
 * Por qué Massey (el banco, 17/10/2026: los parámetros de cada modelo, fijados solo con las temporadas de
 * AJUSTE, 2013-14 a 2020-21, y puntuados en las de EVALUACIÓN, 2021-22 a 2025-26, con las que no se ajustó
 * nada, aunque se miraron al diseñar algunas variantes: la cabecera del banco lo detalla; 2.747 partidos de
 * 28 grupos, IC 95 % por bootstrap de temporada-grupo): log-loss del 1X2 0,534 frente a 0,544 del Poisson,
 * Δ −0,010 [−0,016, −0,003], y Brier 0,297 frente a 0,302, Δ −0,006 [−0,009, −0,003]; acierta el favorito
 * como él (79,5 % frente a 79,1 %, sin diferencia real). Ni el Elo de goles, ni los rivales comunes y sus
 * cadenas contados uno a uno, ni el Poisson bayesiano, ni las mezclas de los mejores mejoran a Massey (la
 * tabla, en la cabecera del banco; cada familia, en scripts/pronostico_modelos/).
 *
 * Qué se muestra (con `today`, como en la web): con `full`, que la web pasa desde el 17/10/2026 (el usuario
 * lo pidió «de todo el calendario, de todos los siguientes enfrentamientos»), todo lo que queda del
 * calendario, cada partido con su distancia (roundsAhead: a cuántas jornadas vista); sin él, solo la
 * próxima jornada de cada grupo (horizonOf). Solo con dos jornadas jugadas en el grupo y algún partido de
 * cada uno de los dos equipos. Se recalcula con cada resultado: cada partido sin jugar, con todo lo jugado
 * del grupo hasta ese momento (con datos nuevos, el modelo construye otro Group y las cachés de aquí, que
 * van por él, empiezan de cero).
 *
 * A varias jornadas vista (17/10/2026, el banco con --distancia, en su cabecera; EVALUACIÓN, 2.747
 * partidos): la víspera, 80,1 % de acierto y 0,522 de log-loss; a 2 jornadas, 80,1 % y +0,010 [+0,005,
 * +0,016] en los mismos partidos; a 3, 79,4 %; a 4-6, 78,6 %; a 7-12, 78,4 %; a 13 o más, 75,6 % (−4,2
 * puntos y +0,087 [+0,068, +0,115] frente a la víspera). Siempre por delante de la tabla, de forma
 * demostrable, y sin pasarse de seguro a ninguna distancia (lo que se le da al favorito, a menos de un
 * punto y medio de lo que gana, con el cero dentro del intervalo): por eso no lleva corrección por
 * distancia. La que se probó (la varianza de las notas, más una deriva por cada jornada de por medio) la
 * deja en 0 el ajuste (scripts/pronostico_modelos/distancia.mjs). Esas son cifras de toda la temporada, casi
 * todas con cuatro jornadas jugadas o más (con ellas, 78,8 %). Con pocas, bastante menos (revisión del
 * 18/10/2026, el día en que los cuatro grupos de 2026-27 llevaban dos): con solo dos jugadas, 72,2 % de
 * todo lo que queda (73,2 % la próxima jornada, 69,6 % a 4-6 vista, 72,2 % a 13 o más), 7,6 puntos menos
 * que la víspera de cada partido [−10,2, −5,5]; con tres, 74,7 %. Aun así, por delante de la tabla (+2,9
 * puntos [+0,6, +5,1]; log-loss −0,127 [−0,163, −0,086]).
 *
 * Qué no cuenta: los partidos de un retirado (retiredTeams de model.js); los resultados que pueden ser
 * de mesa, todo 3-0 o 1-0 a favor de cualquiera de los dos, con hora o sin ella (isDeskResult); los de un
 * campo «EXCLUIDO» o «SUSPENDIDO»; las copias de la importación del archivo (copiedMatches); lo que la
 * app de futbolaspalmas da por retirado, anulado o suspendido (status, el model.matchStatus de la
 * temporada del portal); y los partidos sin fecha, que no se sabe si son anteriores. */
import { matchState, retiredTeams } from './model.js';

/* Los parámetros globales.
 *
 * Los del 1X2, las notas de Massey: los que da el ajuste por máxima verosimilitud del 1X2 con SOLO las
 * temporadas de AJUSTE del banco (2013-14 a 2020-21, 2.331 partidos; ajustar de
 * scripts/pronostico_modelos/massey.mjs, que `node scripts/backtest_pronostico.mjs --calibrar` repite y
 * compara con estos), redondeados a tres cifras; log-loss en el ajuste, 0,5117 (el Poisson, 0,5234):
 * - cushion: c, el colchón de goles del objetivo ln((goles del local + c) / (goles del visitante + c)): 3,64;
 * - ridge: λ, los partidos ficticios de cada equipo contra la media (nota 0): 0,335;
 * - ratingHome: el campo, en la escala de las notas: 0,0586 (el local mete un 6 % más; ver abajo);
 * - slope: β, la pendiente de la logística sobre la diferencia de notas: 5,58;
 * - band: θ, la mitad de la banda de empate: 0,385;
 * - slopeVar: κ, cuánto baja la pendiente con la varianza v de la diferencia, β / √(1 + κ·v): 1,85;
 * - bandVar: κₑ, cuánto se estrecha la banda con ella, θ / √(1 + κₑ·v): 0,925 (con la banda fija, con una
 *   jornada se preveía un 13 % de empates, y hay un 7-8 %).
 * El campo, que el usuario cree que no decide (17/10/2026): tiene razón en que es poco. Mueve P(local) 3,5
 * puntos de media y cambia el favorito en 131 de los 2.747 partidos de EVALUACIÓN. Pero algo aporta: sin él
 * (reajustado en el ajuste), el log-loss de EVALUACIÓN no cambia (+0,001 [−0,004, +0,005]) y se acierta
 * menos el favorito (−0,9 puntos [−1,7, −0,2]: de esos 131, con campo se aciertan 67 y sin él, 41); en el
 * ajuste, sin él, +0,006 [+0,002, +0,010] de log-loss. Se queda.
 *
 * Los de los goles (el Poisson: el resultado más probable y los goles esperados), fijados con el backtest
 * de las temporadas pasadas de prebenjamín cuando el Poisson daba también el 1X2
 * (scripts/backtest_pronostico.mjs; revisado el 17/10/2026 sin las copias de la importación ni lo que
 * puede ser de mesa: 13 temporadas, 53 grupos, 5.078 partidos, cada uno con solo las jornadas anteriores
 * de su temporada; la tabla, en su salida, con el 1X2 del Poisson):
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
 *   más probable» salía inflado (Guanarteme–Acodetti de 2016-17, 0-24, acabó 2-12; ahora, 0-17). El 1X2 del
 *   Poisson no cambia (0,5343 con cualquiera: las goleadas ya pasan del 99 %); 8 es el de menor error de los
 *   goles esperados (2,195 frente a 2,212 sin ella) y con él cuadran por tramos (de 10 a 12, 10,8 frente a
 *   10,7 reales).
 *
 * Desde cuándo se muestra (con el modelo de la web, el 1X2 de las notas, y SOLO con las cifras de
 * EVALUACIÓN del banco: 126 partidos con una jornada jugada, 126 con dos y 128 con tres; revisión del
 * 17/10/2026, que quitó las de todas las temporadas, que incluyen las de AJUSTE, con las que se fijaron
 * las notas). Es una decisión, no una prueba: con dos jornadas la ventaja aún no es demostrable. La tomó el
 * usuario el 17/10/2026, con estas cifras delante: desde 2 jornadas jugadas, no desde 3.
 * - minRounds: jornadas jugadas del grupo desde las que se muestra: 2. Frente a la tabla (gana el mejor
 *   clasificado), con dos jornadas las notas aciertan más (73,8 % frente a 70,6 %; +3,2 puntos [−6,0,
 *   +11,7]) y dan mejores probabilidades en el 96 % de las remuestras (log-loss −0,121 [−0,245, +0,013];
 *   Brier −0,083 [−0,174, +0,016]): mejor casi siempre y nunca peor de forma demostrable, aunque el
 *   intervalo aún toca el cero. Con una, solo en el 76 % (−0,035 [−0,132, +0,056]) y aciertan lo mismo
 *   (67,5 % las dos): ahí la tabla, que es mirar quién ganó su partido, dice lo mismo, y no se enseña nada.
 *   Desde tres, la ventaja ya es demostrable (−0,180 [−0,280, −0,089]; 76,6 % frente a 70,3 %). Subir a 3
 *   dejaría la web sin pronóstico hasta la cuarta jornada; es lo que hay que revisar con los resultados de
 *   2026-27, la primera temporada que nada de esto ha visto.
 *   La fiabilidad, en EVALUACIÓN (lo que se le da al favorito frente a lo que gana; IC 95 % de la
 *   diferencia): con una jornada, 61,5 % frente a 67,5 % (+6,0 puntos [−2,3, +13,1]); con dos, 72,6 %
 *   frente a 73,8 % (+1,2 [−7,4, +8,5]), con la casilla de 80 % o más algo pasada (89,2 % frente a 84,3 %,
 *   51 partidos, −4,8 [−16,7, +5,1]); en total, 78,4 % frente a 79,5 % (+1,1 [−0,3, +2,4]), y el Poisson
 *   de antes se quedaba corto (75,9 % frente a 79,1 %, +3,1 [+1,6, +4,5]). Con una o dos jornadas, con tan
 *   pocos partidos, ni una cosa ni otra es demostrable;
 * - minPlayed: partidos que tiene que llevar cada uno de los dos equipos: 1 (revisión del 17/10/2026). Sin
 *   ninguno, un equipo es la media del grupo y el pronóstico solo mira al rival (Cardones, que descansó en
 *   la jornada 1 y aún no ha jugado la 2); EVALUACIÓN casi no tiene casos (3) con los que probarlo. Con uno
 *   (desde dos jornadas, 55 partidos de EVALUACIÓN), las notas no se distinguen de la tabla (log-loss
 *   0,710 frente a 0,669, +0,041 [−0,128, +0,222]; aciertan 70,9 % frente a 74,5 %, −3,6 puntos [−16,4,
 *   +8,5]); en AJUSTE, donde se fijaron, eran mejores (−0,243 [−0,383, −0,132]). */
export const PARAMS = Object.freeze({
  cushion: 3.64, ridge: 0.335, ratingHome: 0.0586, slope: 5.58, band: 0.385, slopeVar: 1.85, bandVar: 0.925,
  shrink: 1.5, home: 1.08, size: Infinity, cap: Infinity, soften: 8,
  minRounds: 2, minPlayed: 1,
});

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

// Si la app da el partido por retirado, anulado o suspendido. La usa también el pronóstico de la
// clasificación final (src/proyeccion.js, 19/10/2026): esos partidos no se simulan.
export const offByStatus = (status, m) => {
  if (typeof status !== 'function') return false;
  const s = status(m);
  return Boolean(s && OFF_STATES.has(s.state));
};

// La fecha de cada jornada del calendario (roundsAhead): la mediana de las de sus partidos, jugados o no
// (con un número par, la primera de las dos del medio), que no se mueve por un aplazado ni por un
// adelantado sueltos. Map(roundKey → AAAA-MM-DD), sin las jornadas sin ninguna fecha.
function roundDatesOf(group) {
  const out = new Map();
  for (const round of group.rounds || []) {
    const dates = round.matches.map(m => m.dateISO).filter(Boolean).sort();
    if (dates.length) out.set(round.key, dates[Math.floor((dates.length - 1) / 2)]);
  }
  return out;
}

// Lo que no cambia de un grupo (el Group de model.js no cambia una vez construido): sus retirados, sus
// copias, la fecha de cada jornada, el sitio de cada partido en el calendario (order: la clave de la
// caché de los ajustes), por `status`, los partidos que pueden entrar en un entrenamiento (eligibleOf) y,
// por día, su horizonte (horizonOf), calculados una vez.
const FACTS = new WeakMap();
function factsOf(group) {
  if (!FACTS.has(group)) {
    const order = new Map();
    for (const round of group.rounds || []) for (const m of round.matches) order.set(m, order.size);
    FACTS.set(group, {
      retired: retiredTeams(group), copies: copiedMatches(group), roundDates: roundDatesOf(group), order, eligible: new Map(), horizon: new Map(),
    });
  }
  return FACTS.get(group);
}

const addDays = (iso, n) => new Date(Date.parse(`${iso}T12:00:00Z`) + n * 86400000).toISOString().slice(0, 10);

/* Hasta qué día se pronostica con `today` (revisión del 17/10/2026: el usuario pidió «lo que puede pasar
 * en la siguiente jornada», no todo el calendario): la próxima jornada es la del primer partido pendiente,
 * por fecha, de las que van detrás de la última con algún resultado (sin retirados ni mesa), y se
 * pronostica lo pendiente hasta seis días después de ese partido. Es decir, la próxima jornada, lo que
 * falta de la que está en curso y lo que caiga entre medias (un aplazado, una jornada entre semana); nada
 * de las de después (con `full`, forecastMatch no corta aquí y da todo el calendario, que el banco mide a
 * varias jornadas vista desde el 17/10/2026; el usuario lo pidió ese día). Por fecha y no por número, una
 * jornada adelantada cuenta como la próxima, y una sin resultados con la fecha ya pasada no atasca nada.
 * Sin nada pendiente detrás de la última con resultados, null: sin límite (los aplazados que queden). Es
 * lo de forecastMatch sin `full`; la web pasa `full` desde el 17/10/2026 (forecastOptions de ui.js) y
 * enseña todo el calendario. */
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
 * clasificación con los mismos partidos. `before` (AAAA-MM-DD; solo el banco de pruebas, 17/10/2026):
 * además, solo lo jugado antes de ese día, el pronóstico que se habría hecho ese día con jornadas por
 * medio (roundsAhead); la web no lo pasa: lo que tiene marcador ya se ha jugado. Los partidos salen
 * siempre en el orden del calendario: dos entrenamientos con los mismos partidos son la misma lista (la
 * clave de la caché de los ajustes). */
export function trainingFor(group, match, { status = null, before = null } = {}) {
  const out = [];
  for (const { key, m } of eligibleOf(group, status)) {
    if (key === match.roundKey) continue;
    if (match.dateISO && !(m.dateISO < match.dateISO)) continue;
    if (before !== null && !(m.dateISO < before)) continue;
    out.push(m);
  }
  return out;
}

// Los partidos que pueden entrar en un entrenamiento (trainingFor): con marcador y fecha, sin retirados,
// copias, mesa ni estados de fuera, en el orden del calendario y cada uno con la clave de su jornada.
// Una vez por grupo y `status` (17/10/2026: con todo el calendario, trainingFor va en cada partido de
// cada pantalla, y mirar los estados de cada partido jugado cada vez era lo que más costaba).
function eligibleOf(group, status) {
  const facts = factsOf(group);
  const st = typeof status === 'function' ? status : null;
  if (!facts.eligible.has(st)) {
    const { retired, copies } = facts;
    const out = [];
    for (const round of group.rounds || []) {
      for (const m of round.matches) {
        if (!scored(m) || !m.dateISO) continue;
        if (retired.has(m.home) || retired.has(m.away) || copies.has(m) || isDeskResult(m) || offByStatus(st, m)) continue;
        out.push({ key: round.key, m });
      }
    }
    facts.eligible.set(st, out);
  }
  return facts.eligible.get(st);
}

// La distancia de roundsAhead con el entrenamiento ya hecho (el de trainingFor de `match`). Con `today`
// (solo la web: forecastOf lo pasa sin `before`), tampoco las jornadas con la fecha ya pasada.
function aheadFrom(group, match, training, today = null) {
  if (!match.dateISO || !training.length) return null;
  const started = new Set();
  let last = null;
  for (const m of training) {
    started.add(m.roundKey);
    if (last === null || m.dateISO > last) last = m.dateISO;
  }
  let k = 1;
  for (const [key, date] of factsOf(group).roundDates) {
    if (key !== match.roundKey && !started.has(key) && date > last && date < match.dateISO && !(today !== null && date < today)) k += 1;
  }
  return k;
}

/* A cuántas jornadas vista se pronostica `match` (17/10/2026, para el pronóstico de todo el calendario):
 * 1 más las jornadas del calendario que se juegan entre lo último que se sabe y el partido. Con `last`, el
 * día del último partido del entrenamiento (trainingFor, con las mismas opciones: status y before), cuenta
 * cada jornada del grupo, salvo la del partido, sin ningún partido en el entrenamiento y con su fecha (la
 * mediana de las de sus partidos) después de `last` y antes del día del partido: la próxima jornada es la
 * 1, la siguiente la 2, y así. Por la fecha de cada jornada y no por su número, porque el calendario no
 * siempre se juega en orden (en 2025-26, la jornada 2 de PLZ1 se jugó en mayo, tras la 3 de marzo; la 3
 * de PFV1, en enero, tras la 4 de diciembre): un aplazado de la jornada 2 que se juega el miércoles está a
 * 1 vista, y uno que se jugará tras otras tres jornadas, a 4. Una jornada empezada (con algún resultado)
 * ya no cuenta, ni una sin ninguna fecha (no se sabe cuándo se juega), ni una con la fecha anterior a lo
 * último jugado y sin resultados (un aplazamiento aún sin fecha nueva). Es la distancia del grupo, no la
 * de cada equipo: el que descansa una jornada sigue a la de los demás. La vuelta sigue a la ida sin
 * reiniciar nada, aunque medie un mes sin partidos. null sin nada jugado o si el partido no tiene fecha.
 * Con `today` (AAAA-MM-DD; la web, revisión del 18/10/2026), tampoco cuenta una jornada con la fecha ya
 * pasada y sin ningún resultado publicado: jugada pero aún sin sus resultados (el bot los trae horas o
 * días después), la siguiente es la próxima que se juega, y decir que está «dentro de 2 jornadas» lo
 * entendería mal cualquiera (lo de esa jornada aún no ha entrado en el cálculo: al llegar, se
 * recalcula). El banco no lo pasa: allí todo lo jugado antes del corte ya está en el entrenamiento, y las
 * cifras medidas no cambian. Es LA MISMA función en la web (forecastMatch la devuelve en `ahead`) y en
 * el banco de pruebas (scripts/pronostico_banco.mjs, que la llama con `before`, el día en que se habría
 * hecho el pronóstico). */
export function roundsAhead(group, match, { status = null, before = null, today = null } = {}) {
  if (!group || !match) return null;
  return aheadFrom(group, match, trainingFor(group, match, { status, before }), today);
}

// Los ajustes ya hechos, por grupo, por `status` y por los partidos del entrenamiento (su sitio en el
// calendario, en su orden: factsOf) y los parámetros del ajuste: dos partidos con el mismo entrenamiento
// comparten ajuste, sean de la jornada que sean. Con todo el calendario (17/10/2026), las jornadas que
// quedan por delante se entrenan con lo mismo, todo lo jugado, y en un grupo de 26 jornadas se ajusta una
// vez (dos con una jornada a medias: la suya, sin sus propios partidos), no una por jornada. Con esto y
// con eligibleOf, todo lo que queda de un grupo, en frío y a mitad de temporada (2025-26 el 20/01/2026,
// en Node, la mediana de 14 pasadas), pasa de 10 ms de media a 4 (de 28 a 11 en el que más). Solo es una
// caché: el resultado es el mismo (el ajuste es determinista con la misma lista). Cada uno, { goals: el de
// fitRatings, notes: el de fitNotes } o null sin partidos.
const FITS = new WeakMap();

function cachedFit(group, training, status, p) {
  if (!FITS.has(group)) FITS.set(group, new Map());
  const byStatus = FITS.get(group);
  const st = typeof status === 'function' ? status : null;
  if (!byStatus.has(st)) byStatus.set(st, new Map());
  const memo = byStatus.get(st);
  const { order } = factsOf(group);
  const key = [training.map(m => order.get(m)).join(','), p.shrink, p.home, p.cap, p.cushion, p.ridge].join('\u0001');
  if (!memo.has(key)) memo.set(key, training.length ? { goals: fitRatings(training, p), notes: fitNotes(training, p) } : null);
  return memo.get(key);
}

const sigma = x => (x >= 0 ? 1 / (1 + Math.exp(-x)) : Math.exp(x) / (1 + Math.exp(x)));

// Cholesky de una matriz simétrica definida positiva n×n (por filas, en un Float64Array): L, con
// M = L·Lᵀ; y la solución de L·Lᵀ·x = b.
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
function cholSolve(L, n, b) {
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

/* Las notas de Massey con los partidos `matches` (los de trainingFor): las r que mejor cuadran, por mínimos
 * cuadrados con λ (ridge) partidos ficticios de cada equipo contra la media, con
 * r_local − r_visitante ≈ ln((goles del local + c) / (goles del visitante + c)). El sistema es
 * (XᵀX + λI)·r = Xᵀy, con X la matriz de los partidos (+1 el local, −1 el visitante), definido positivo
 * con λ > 0: una sola solución, por Cholesky (un 16×16 en un grupo de 16). Como el campo entra lineal, se
 * resuelve sin él (notes) y aparte lo que el campo de los partidos jugados mueve cada nota (field: la
 * solución con y = 1 en cada partido); con campo h, las notas son notes − h·field. Devuelve { index (equipo
 * → fila), n, L (el factor de Cholesky, para la varianza de cada partido), ridge, notes, field } o null sin
 * partidos. Determinista: el orden de los equipos y de las sumas es el de los partidos. */
export function fitNotes(matches, params = PARAMS) {
  const p = { ...PARAMS, ...params };
  if (!matches.length) return null;
  const index = new Map();
  const at = name => { if (!index.has(name)) index.set(name, index.size); return index.get(name); };
  for (const m of matches) { at(m.home); at(m.away); }
  const n = index.size;
  const M = new Float64Array(n * n), b = new Float64Array(n), u = new Float64Array(n);
  for (const m of matches) {
    const i = index.get(m.home), j = index.get(m.away);
    const y = Math.log((m.hs + p.cushion) / (m.as + p.cushion));
    M[i * n + i] += 1; M[j * n + j] += 1; M[i * n + j] -= 1; M[j * n + i] -= 1;
    b[i] += y; b[j] -= y; u[i] += 1; u[j] -= 1;
  }
  for (let i = 0; i < n; i += 1) M[i * n + i] += p.ridge;
  const L = cholesky(M, n);
  return { index, n, L, ridge: p.ridge, notes: cholSolve(L, n, b), field: cholSolve(L, n, u) };
}

/* El 1X2 de las notas para local–visitante: { pHome, pDraw, pAway, diff, variance }. diff es la diferencia
 * de notas con el campo, d = (r_local − r_visitante) + h·(1 − (field_local − field_visitante)): el campo
 * del partido menos el que ya se les quitó a sus partidos jugados. variance, la de esa diferencia
 * (relativa: cᵀ·(XᵀX + λI)⁻¹·c, con c = +1 en el local y −1 en el visitante); un equipo sin partidos
 * tiene nota 0 y varianza 1/λ. Con ellas, la logística ordenada: s = β / √(1 + κ·v), t = θ / √(1 + κₑ·v),
 * P(local) = σ(s·d − t), P(visitante) = σ(−s·d − t) y el empate, lo que queda (con θ > 0, nunca negativo). */
export function notesOdds(fit, home, away, params = PARAMS) {
  const p = params === PARAMS ? PARAMS : { ...PARAMS, ...params };
  const h = fit.index.has(home) ? fit.index.get(home) : -1;
  const a = fit.index.has(away) ? fit.index.get(away) : -1;
  const c = new Float64Array(fit.n);
  if (h >= 0) c[h] = 1;
  if (a >= 0) c[a] = -1;
  const w = cholSolve(fit.L, fit.n, c);
  const of = (x, i) => (i >= 0 ? x[i] : 0);
  const variance = of(w, h) - of(w, a) + ((h < 0) + (a < 0)) / fit.ridge;
  const diff = (of(fit.notes, h) - of(fit.notes, a)) + p.ratingHome * (1 - (of(fit.field, h) - of(fit.field, a)));
  const s = p.slope / Math.sqrt(1 + p.slopeVar * variance), t = p.band / Math.sqrt(1 + p.bandVar * variance);
  const pHome = sigma(s * diff - t), pAway = sigma(-s * diff - t);
  return { pHome, pDraw: Math.max(0, 1 - pHome - pAway), pAway, diff, variance };
}

// El desenlace más probable de unas probabilidades; a igualdad, el local, luego el visitante (como outcome).
const pickOf = ({ pHome, pDraw, pAway }) => (pHome >= pAway && pHome >= pDraw ? 'home' : pAway >= pDraw ? 'away' : 'draw');

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

/* El marcador más probable de los goles con las dos medias DENTRO del desenlace `pick` ('home' | 'draw' |
 * 'away'): { score: [l, v], pScore }, con a igualdad el mismo orden que outcome (menos goles del local y
 * luego del visitante). Es el de forecastMatch, con el favorito de las notas: con el de outcome, su mismo
 * marcador. */
export function likelyScore(meanHome, meanAway, pick, params = PARAMS) {
  const p = { ...PARAMS, ...params };
  const ph = goalPmf(meanHome, p.size), pa = goalPmf(meanAway, p.size);
  const inside = INSIDE[pick];
  let best = -1, score = [0, 0], sum = 0;
  for (let i = 0; i < ph.length; i += 1) {
    for (let j = 0; j < pa.length; j += 1) {
      const v = ph[i] * pa[j];
      sum += v;
      if (inside(i, j) && v > best) { best = v; score = [i, j]; }
    }
  }
  return { score, pScore: best / sum };
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
 *   { home, away, pHome, pDraw, pAway, pick, score: [l, v], pScore, xgHome, xgAway, goalsAgree,
 *     rounds, matches, playedHome, playedAway }
 * con el 1X2 y su favorito (pick: 'home' | 'draw' | 'away'; a igualdad, el local, luego el visitante) de
 * las notas de Massey (notesOdds); score, el marcador más probable de los goles del Poisson DENTRO de ese
 * favorito (likelyScore), y pScore, su probabilidad; xg* los goles esperados del Poisson (amortiguados
 * por encima de soften); goalsAgree, si van con el favorito (el suyo marca al menos los del otro; con el
 * empate, siempre): pueden ir al revés (en el archivo, 155 de los 4.825 partidos que se pronostican desde
 * dos jornadas: nueve de cada diez, con el favorito por debajo del 55 %, pero alguno hasta del 71 %, y más
 * de la mitad, con menos de un cuarto de gol de diferencia; ahí el favorito de las notas acierta 74 y el
 * de los goles, 55). Entonces score no es el marcador más probable del Poisson (nunca entre sus dos
 * primeros), sino el más probable SI gana el favorito: la web no enseña los goles esperados y lo rotula así
 * (forecastLine de ui.js y la pantalla Partido; revisión del 17/10/2026). `rounds` las jornadas jugadas con
 * las que se calcula, `matches` sus partidos (la nota «según los N partidos jugados»), played* los de cada
 * equipo entre ellos y `ahead`, a cuántas jornadas vista (roundsAhead con ese entrenamiento y, sin
 * `before`, con `today`: 1, la próxima jornada; 17/10/2026). null si el grupo no lo admite
 * (forecastApplies), si el partido ya tiene marcador, si con `today` no está pendiente (matchState: uno
 * sin fecha o con la fecha pasada y sin resultado no se pronostica) o, sin `full`, va más allá de la
 * próxima jornada (horizonOf), si es de un retirado o la app lo da por retirado, anulado o suspendido, si
 * aún no hay PARAMS.minRounds jornadas
 * jugadas o si uno de los dos no ha jugado aún PARAMS.minPlayed partidos (con lo jugado de verdad, no con
 * la distancia: lo mismo a 1 que a 10 jornadas vista). Opciones: portalSeason (la del contexto), today
 * (AAAA-MM-DD; la web lo pasa siempre; sin él, el backtest, sin horizonte), full (con today, todo lo
 * pendiente del calendario y no solo la próxima jornada; por defecto, false; la web lo pasa siempre),
 * status (model.matchStatus) y, solo para el backtest y el banco, prueba (otra temporada o una liguilla
 * de copa), before (AAAA-MM-DD: con solo lo jugado antes de ese día, el pronóstico que se habría hecho
 * entonces; trainingFor) y params (otros parámetros). Sin corrección por distancia: el 1X2 es el mismo a
 * cualquier distancia con el mismo entrenamiento (el porqué, en la cabecera). En la web (con `today`, sin
 * `before` y con los PARAMS), cada pronóstico se calcula una vez por grupo y opciones (FORECASTS): pintar
 * otra vez la misma pantalla no recalcula nada. */
export function forecastMatch(group, match, { portalSeason = null, today = null, full = false, status = null, before = null, prueba = false, params = PARAMS } = {}) {
  const options = { portalSeason, today, full, status, before, prueba, params };
  if (!group || typeof group !== 'object' || !match || typeof match !== 'object') return null;
  if (today === null || before !== null || params !== PARAMS) return forecastOf(group, match, options);
  const memo = forecastMemo(group, status, [portalSeason, today, full, prueba].join('\u0001'));
  if (!memo.has(match)) memo.set(match, forecastOf(group, match, options));
  return memo.get(match);
}

/* Los pronósticos ya hechos en la web (17/10/2026: con todo el calendario, decenas por pantalla, y la
 * pantalla se vuelve a pintar al volver a ella): por grupo, por `status`, por las opciones y por partido,
 * el de forecastOf o null (otra vez todo lo que queda de los ocho grupos de 2025-26 el 20/01/2026, de 26
 * ms a 0,6). Como FACTS y FITS, va por el objeto del grupo, que no cambia una vez construido: con datos
 * nuevos (un resultado más), el modelo construye otro y se calcula todo otra vez con lo nuevo. El banco y
 * el backtest (sin `today`, con `before` u otros parámetros) no la usan. Solo es una caché: el resultado
 * es el mismo (el mismo objeto, que nadie modifica). */
const FORECASTS = new WeakMap();
function forecastMemo(group, status, key) {
  if (!FORECASTS.has(group)) FORECASTS.set(group, new Map());
  const byStatus = FORECASTS.get(group);
  const st = typeof status === 'function' ? status : null;
  if (!byStatus.has(st)) byStatus.set(st, new Map());
  const byOptions = byStatus.get(st);
  if (!byOptions.has(key)) byOptions.set(key, new WeakMap());
  return byOptions.get(key);
}

// Lo que comparten forecastMatch y forecastOdds: los filtros, el entrenamiento, el ajuste, los goles
// esperados y el 1X2; null en los casos en que forecastMatch da null.
function coreOf(group, match, { portalSeason, today, full, status, before, prueba, params }) {
  const p = params === PARAMS ? PARAMS : { ...PARAMS, ...params };
  if (!forecastApplies(group, { portalSeason, prueba })) return null;
  if (scored(match) || offByStatus(status, match)) return null;
  if (today !== null) {
    if (matchState(match, today) !== 'pendiente') return null;
    const until = full ? null : horizonOf(group, today);
    if (until !== null && match.dateISO > until) return null;
  }
  const { retired } = factsOf(group);
  if (retired.has(match.home) || retired.has(match.away)) return null;
  const training = trainingFor(group, match, { status, before });
  const fits = cachedFit(group, training, status, p);
  if (!fits || fits.goals.rounds < p.minRounds) return null;
  const fit = fits.goals;
  const avg = { attack: 1, defense: 1, played: 0 };
  const home = fit.teams.get(match.home) || avg;
  const away = fit.teams.get(match.away) || avg;
  if (Math.min(home.played, away.played) < p.minPlayed) return null;
  const soft = x => (x > p.soften ? p.soften * (1 + Math.log(x / p.soften)) : x);
  const xgHome = soft(fit.base * fit.home * home.attack * away.defense);
  const xgAway = soft(fit.base * away.attack * home.defense);
  const { pHome, pDraw, pAway } = notesOdds(fits.notes, match.home, match.away, p);
  return { p, training, fit, home, away, xgHome, xgAway, pHome, pDraw, pAway };
}

// El pronóstico de forecastMatch, sin la caché de la web.
function forecastOf(group, match, options) {
  const core = coreOf(group, match, options);
  if (!core) return null;
  const { p, training, fit, home, away, xgHome, xgAway, pHome, pDraw, pAway } = core;
  const pick = pickOf({ pHome, pDraw, pAway });
  return {
    home: match.home,
    away: match.away,
    pHome,
    pDraw,
    pAway,
    pick,
    ...likelyScore(xgHome, xgAway, pick, p),
    xgHome,
    xgAway,
    goalsAgree: pick === 'home' ? xgHome >= xgAway : pick === 'away' ? xgAway >= xgHome : true,
    rounds: fit.rounds,
    matches: fit.matches,
    playedHome: home.played,
    playedAway: away.played,
    ahead: aheadFrom(group, match, training, options.before === null ? options.today : null),
  };
}

/* El 1X2 y los goles esperados de forecastMatch, { pHome, pDraw, pAway, xgHome, xgAway }, sin el
 * marcador más probable ni lo demás: con las mismas opciones, las mismas cifras y null en los mismos
 * casos (19/10/2026, para el pronóstico de la clasificación final, src/proyeccion.js, que los pide de
 * todos los partidos que quedan en un grupo; el marcador recorre la rejilla de goles y era lo que más
 * costaba). Sin la caché de la web: la guarda quien la llama. */
export function forecastOdds(group, match, { portalSeason = null, today = null, full = false, status = null, before = null, prueba = false, params = PARAMS } = {}) {
  if (!group || typeof group !== 'object' || !match || typeof match !== 'object') return null;
  const core = coreOf(group, match, { portalSeason, today, full, status, before, prueba, params });
  return core && { pHome: core.pHome, pDraw: core.pDraw, pAway: core.pAway, xgHome: core.xgHome, xgAway: core.xgAway };
}

/* Los pronósticos de una jornada, en el orden de round.matches: el de forecastMatch o null. */
export function forecastRound(group, round, opts = {}) {
  return ((round && round.matches) || []).map(m => forecastMatch(group, m, opts));
}

/* Si `team` se queda sin ningún pronóstico solo porque aún no ha jugado (PARAMS.minPlayed; revisión del
 * 18/10/2026: el calendario de Unión Viera, en PG2 de 2026-27, salía sin una sola línea y sin decir por
 * qué, y el de los demás del grupo, con todo lo que les queda): el grupo admite pronóstico
 * (forecastApplies) y ya lleva las PARAMS.minRounds jornadas jugadas (con lo que cuenta: eligibleOf), el
 * equipo no es un retirado, no tiene ningún partido con resultado (ni uno contra un retirado, que no
 * cuenta pero sí se jugó: ahí «aún no ha jugado» sería falso, y no se dice nada) y le queda alguno
 * pendiente con `today`. Las opciones, las de forecastMatch (forecastOptions de ui.js; lo demás no se
 * mira). La usa el calendario del equipo (teamCalendar de team-view.js), para decirlo en una línea. */
export function awaitsFirstMatch(group, team, { portalSeason = null, today = null, status = null } = {}) {
  if (!group || typeof group !== 'object' || !team || today === null || !forecastApplies(group, { portalSeason })) return false;
  if (factsOf(group).retired.has(team)) return false;
  if (new Set(eligibleOf(group, status).map(({ key }) => key)).size < PARAMS.minRounds) return false;
  const mine = (group.rounds || []).flatMap(round => round.matches.filter(m => m.home === team || m.away === team));
  return !mine.some(scored) && mine.some(m => !offByStatus(status, m) && matchState(m, today) === 'pendiente');
}
