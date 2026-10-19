// Banco de pruebas del pronóstico de prebenjamín (17/10/2026): el mismo examen para cualquier modelo.
//
//   node scripts/pronostico_banco.mjs --modelo <fichero.mjs> [--split evaluacion|ajuste|todas]
//                                     [--contra actual|web|poisson|local|tabla|<fichero.mjs>|ninguno]
//                                     [--B 2000] [--semilla 17102026] [--salida informe.json]
//   node scripts/pronostico_banco.mjs --modelo tabla          una de las referencias, por su nombre
//   node scripts/pronostico_banco.mjs --referencias           las cinco referencias, frente a «actual»
//   node scripts/pronostico_banco.mjs --distancia [--modelo web|<fichero.mjs>] [--split …] [--contra …]
//                                     a varias jornadas vista: por distancia y por jornadas jugadas,
//                                     con la tabla y el local (y --contra, si se da) de referencias
//
// Escribe el informe en JSON por la salida estándar (o en --salida) y un resumen por la de errores. Sin
// red ni escrituras fuera de --salida: solo lee los data-season-*.js del repositorio (y, para el
// backtest, data-prebenjamin.js y data-history.js). Lo usa scripts/backtest_pronostico.mjs, que saca de
// aquí la carga de las temporadas, los partidos del examen y las métricas.
//
// EL PROTOCOLO (para no engañarse; el mismo para todos los modelos):
// - Las parejas (entrenamiento, partido) son las del pronóstico de la web: cada partido objetivo de una
//   liga o liguilla de copa de prebenjamín de una temporada pasada, con fecha y marcador, sin retirados,
//   copias de la importación ni lo que seguro es de mesa (targets), y su entrenamiento, trainingFor de
//   src/pronostico.js: los partidos con marcador y fecha de ANTES de su día, de otra jornada, de su grupo
//   y su temporada, sin retirados, mesa, copias ni campos «EXCLUIDO»/«SUSPENDIDO». Nada de otra temporada
//   ni de otro grupo. Un partido sin nada jugado antes (0 jornadas) no entra.
// - Tramo: las jornadas distintas del entrenamiento (las de la nota «según N jornadas»): 1, 2, 3, 4-6, 7+.
// - Temporadas: AJUSTE, 2013-14 a 2020-21; EVALUACIÓN, 2021-22 a 2025-26; «todas», las pasadas del
//   repositorio (hoy, las de las dos). Lo que un modelo fije (parámetros, frecuencias) sale SOLO de las
//   de ajuste (su `ajustar` no ve otras) y se puntúa en las de evaluación.
// - Métricas del 1X2: log-loss (la principal), Brier (suma de los tres cuadrados, de 0 a 2) y acierto (el
//   desenlace más probable; a igualdad, el local, luego el visitante, como outcome() de pronostico.js);
//   y, del empate, la probabilidad media prevista frente a la frecuencia real. Globales y por tramo.
// - Intervalos: bootstrap por temporada-grupo (se remuestrean grupos enteros, con reemplazo: los
//   partidos de un grupo no son independientes), B remuestras con semilla fija, percentiles 2,5 y 97,5.
//   Con `contra`, la DIFERENCIA pareada modelo − referencia en los partidos que pronostican los dos, con
//   las mismas remuestras: si su intervalo no cruza el cero, la diferencia es real; `pMejor` es la parte
//   de las remuestras en que el modelo tiene un log-loss estrictamente mejor (con el mismo modelo, 0).
//   Los intervalos de cada modelo por separado son anchos (los grupos difieren mucho entre sí): para
//   decidir entre dos, el de la diferencia pareada.
//
// EL CONTRATO DE UN MODELO (un módulo ES; `--modelo` lo importa):
//
//   export const nombre = 'Elo';                        // opcional (si no, el nombre del fichero)
//   export function ajustar(banco) { … return {…}; }    // opcional; puede ser async
//   export function predictor(training, match, group, info) {
//     return { pHome, pDraw, pAway };                   // o null: ese partido no lo pronostica
//   }
//
// - predictor(training, match, group, info): síncrono y determinista; se llama una vez por pareja, en el
//   orden del examen (temporada, grupo, jornada).
//   · training: los partidos del entrenamiento (Match de model.js: home, away, hs, as, dateISO, time,
//     venue, roundKey…), en el orden de las jornadas del grupo y, dentro, el de la fuente (NO por fecha:
//     ordénalos en una copia, `[...training].sort(…)`). El array está congelado y es compartido.
//   · match: el partido a pronosticar, copia congelada con hs y as a null (home, away, dateISO, roundKey).
//   · group: el Group de model.js (id, kind, season, rounds…). OJO: trae la temporada ENTERA, con los
//     resultados de después del partido. Un modelo solo puede sacar resultados de `training`; de group,
//     solo lo que no lo es (el id, los equipos, el calendario). La referencia «actual» lo pasa a
//     forecastMatch, que vuelve a calcular el mismo trainingFor.
//   · info: { temporada, grupo, jornadas, tramo, k, distancia, corte } (jornadas: las del entrenamiento;
//     tramo: '1'…'7+'; k, a cuántas jornadas vista, roundsAhead de src/pronostico.js, y distancia, su
//     tramo; corte, el día antes del cual se sabe lo jugado: null en las de siempre, un día en las de
//     --distancia). Un modelo que no use `training` y vuelva a sacar el entrenamiento de `group` (las
//     referencias de src/pronostico.js) tiene que cortarlo en info.corte (forecastMatch, con before).
//   · Devuelve tres probabilidades finitas, no negativas, que sumen 1 (a 1e-6; se renormalizan), o null
//     para no pronosticar (el informe cuenta los `nulos`; sus métricas son las de los que pronostica, y la
//     comparación con `contra`, la de los que pronostican los dos). Lo demás que devuelva se ignora.
// - ajustar(banco): se llama una vez antes del examen, con un banco que SOLO tiene las temporadas de
//   ajuste. Lo que devuelva (serializable en JSON: los parámetros elegidos) va al campo `ajuste` del
//   informe. El modelo guarda lo que fije en su propio módulo. `banco`:
//   · pares: las parejas de ajuste, [{ temporada, grupo, clave, group, training, match, m, hs, as, y,
//     jornadas, tramo }] (m: el partido con su marcador; y: 'home' | 'draw' | 'away', el resultado);
//   · evaluate(predictor, { B, semilla, referencia }): el mismo examen de abajo, siempre sobre el ajuste
//     (para una búsqueda de parámetros, B: 0 se salta el bootstrap y va más deprisa);
//   · logLoss(p, y), brier(p, y) (p: { home, draw, away }), outcomeOf(hs, as), tableOf(matches),
//     tableLeader(table, match), TRAMOS, tramoDe(jornadas), temporadas, split.
//
// LA COMPARACIÓN DEL 17/10/2026 (la que decidió el modelo de la web). El usuario propuso «reglas de tres»
// (si A le ganó a B y B a C, A tiene que poder con C) y dudaba de que el campo decida. Se probaron cuatro
// familias, cada una en su fichero de scripts/pronostico_modelos/ (con su resultado en la cabecera),
// con sus parámetros fijados SOLO en AJUSTE, y las mezclas de las mejores (media de probabilidades con
// los pesos del ajuste). EVALUACIÓN, 2.747 partidos de 28 grupos, B = 2000, semilla 17102026; «Δ» es la
// diferencia pareada de log-loss (negativa, mejor) con su IC 95 %:
//
//   modelo                                   log-loss  Brier  acierto  2 jorn.  3 jorn.  Δ Poisson de antes        Δ Massey
//   Massey (las notas; ELEGIDO)              0,534     0,297  79,5 %   0,658    0,593    −0,010 [−0,016, −0,003]   —
//   Massey sin campo                         0,535     0,298  78,6 %   0,658    0,591    −0,009 [−0,016, −0,002]   +0,001 [−0,004, +0,005]
//   Elo de goles iterado (elo.mjs)           0,538     0,299  79,4 %   0,651    0,615    −0,006 [−0,013, +0,001]   +0,004 [−0,001, +0,008]
//   Poisson bayesiano (poisson.mjs)          0,541     0,301  78,9 %   0,698    0,593    −0,003 [−0,004, −0,001]   +0,007 [+0,002, +0,012]
//   rivales comunes y cadenas                0,544     0,304  78,3 %   0,682    0,633    +0,001 [−0,006, +0,008]   +0,010 [+0,006, +0,014]
//   mezcla Massey 0,74 + Elo 0,26            0,534     0,297  79,4 %   0,654    0,597    −0,009 [−0,015, −0,004]   +0,000 [−0,001, +0,001]
//   mezcla Massey 0,66 + Elo 0,27 + bayes    0,534     0,297  79,3 %   0,656    0,597    −0,010 [−0,015, −0,004]   −0,000 [−0,002, +0,001]
//   Poisson de antes (referencia «poisson»)  0,544     0,302  79,1 %   0,697    0,621    —                         +0,010 [+0,003, +0,016]
//   tabla                                    0,679     0,376  77,1 %   0,779    0,774    +0,136 [+0,112, +0,156]   +0,145 [+0,118, +0,167]
//   local                                    0,897     0,562  47,9 %   0,870    0,855    +0,354 [+0,305, +0,395]   +0,363 [+0,311, +0,407]
//
// Massey es el que más mejora al Poisson (−0,010 en log-loss y −0,006 [−0,009, −0,003] en Brier). No es el
// único que lo mejora de forma demostrable: también Massey sin campo y las mezclas (como Massey solo) y,
// muy poco, una cuarta parte, el Poisson bayesiano (−0,0026 [−0,0045, −0,0006]; Brier −0,0014 [−0,0025,
// −0,0003]). El acierto del favorito de Massey, +0,4 puntos [−0,2, +1,1], es el del Poisson. Por tramo,
// frente al Poisson:
// 1 jornada −0,015 [−0,062, +0,026]; 2, −0,039 [−0,085, +0,003]; 3, −0,027 [−0,071, +0,015]; 4-6, −0,002
// [−0,020, +0,018]; 7+, −0,008 [−0,013, −0,003] (126, 126, 128, 364 y 2.003 partidos). Las mezclas empatan
// con Massey solo, y el Elo de goles también (sin ganar al Poisson de forma demostrable): a igualdad, el
// más sencillo, una nota por equipo y un sistema lineal. Con 1-2 jornadas, ninguno le gana de forma
// demostrable a la tabla (Massey − tabla: 1 jornada, −0,035 [−0,132, +0,056], mejor en el 76 % de las
// remuestras y con el mismo acierto, 67,5 %; 2, −0,121 [−0,245, +0,013], mejor en el 96 % y con 3,2 puntos
// más de acierto [−6,0, +11,7]; desde 3, entre −0,15 y −0,18, todos reales). La web enseña desde dos: es
// una decisión, no una prueba (el criterio, en minRounds de src/pronostico.js). El campo, que el
// usuario cree que no decide: es poco (en Massey, el local mete un 6 % más; P(local) se mueve 3,5 puntos de
// media), y quitarlo no cambia el log-loss (+0,001 [−0,004, +0,005]) pero se acierta menos el favorito
// (−0,9 puntos [−1,7, −0,2]); en el ajuste, sin él, +0,006 [+0,002, +0,010]: se queda. Cada fila se repite
// con `--modelo scripts/pronostico_modelos/<familia>.mjs --contra poisson` (y `--contra actual`).
//
// LO QUE EVALUACIÓN YA NO ES (revisión del 17/10/2026): con ella no se ajustó ningún parámetro, pero sí
// se miró al diseñar. La variante de Massey con la banda de empate que se estrecha (κₑ) se puntuó en
// EVALUACIÓN antes de entrar en massey.mjs (el ajuste ya la justificaba: 0,5131 → 0,5117); las mezclas se
// puntuaron ahí; y los rivales comunes (el parámetro c, y k de 0,5 a 0,1: 0,547 → 0,544) y el Elo se
// retocaron después de ver la suya. Massey no se tocó tras su primera pasada por EVALUACIÓN, los retoques
// favorecen a los que perdieron y su ventaja sobre el Poisson (mejor en el 99,9 % de las remuestras)
// aguanta una corrección de Bonferroni por las cuatro familias: la elección se mantiene. Pero el Δ −0,010
// arrastra algo del sesgo de quedarse con el mejor de varios en los mismos datos, y para las próximas
// decisiones (minRounds, variantes nuevas) EVALUACIÓN ya no es una prueba nueva: la siguiente es 2026-27,
// que nada de esto ha visto (o una validación anidada por temporadas).
//
// LAS COPIAS DEL ARCHIVO (revisión del 17/10/2026): en PGC1 de 2023-24 y PGC4 de 2024-25, el filial está
// apuntado también al primer equipo (Roque Amagro, 46 partidos en 26 jornadas; Arguineguín, 26 en 22, y 28
// cruces local–visitante repetidos), pero cada copia cae en la misma jornada que su partido de verdad y
// copiedMatches de src/pronostico.js la quita: sin copias, en ninguna liga del banco hay un equipo dos
// veces en una jornada, con más partidos que jornadas o con el mismo cruce dos veces, y ninguna pareja
// lleva una copia (test_pronostico_banco.mjs lo comprueba). La tabla de arriba no las tiene.
//
// A VARIAS JORNADAS VISTA (17/10/2026: el usuario pidió el pronóstico de todo el calendario, que se recalcule
// con cada resultado). Lo que se mide: cuánto pierde el pronóstico de la web hecho con jornadas por medio.
// - La distancia k de un partido es roundsAhead de src/pronostico.js, LA MISMA función que da `ahead` en la
//   web: 1 más las jornadas del calendario sin ningún resultado en el entrenamiento cuya fecha (la mediana
//   de las de sus partidos) cae entre el último partido del entrenamiento y el del partido (la próxima
//   jornada, 1). Por fecha y no por número: los aplazados, las jornadas sin fecha, los descansos, la vuelta
//   y los calendarios que no se juegan en orden, en su cabecera. En el banco, el 91,4 % de los pronósticos
//   tiene la misma distancia contando por número de jornada; el resto, aplazamientos de jornadas enteras
//   (PLZ1, PFV1-3 de 2025-26, PGC1 de 2014-15 y de 2021-22…).
// - Las parejas (paresDistancia, distancePairsOf): cada partido de pares(), con el entrenamiento de siempre,
//   y, por cada día de ese entrenamiento, el que se habría tenido antes de ese día (trainingFor con before);
//   su distancia, la de roundsAhead con ese corte, y de cada distancia, el corte más tardío. En un calendario
//   en orden, un partido de la jornada N a k vista se pronostica con lo jugado antes de que empiece la
//   N − k + 1. La de siempre es la de k = 1 en los 2.747 partidos de EVALUACIÓN (en AJUSTE, 2.327 de 2.331:
//   los otros cuatro, de la jornada 22 de PGC1 de 2014-15, tienen por medio tres jornadas sin resultados en
//   el archivo, y van a k = 4). Con cada corte se respetan los límites de la web (minRounds 2 y minPlayed 1,
//   con lo jugado hasta él), y las referencias tabla y local reciben el mismo entrenamiento.
// - Las métricas (evaluarDistancia): las de siempre por tramo de distancia (1, 2, 3, 4-6, 7-12 y 13+:
//   todos con más de 2.000 pronósticos en EVALUACIÓN; la mayor, 33, con 8) y cruzadas con las jornadas del
//   entrenamiento (2-3 o 4 y más; con 1, la web no enseña nada), y además: la fiabilidad, la probabilidad
//   media que se le da al favorito menos la frecuencia con que gana (en puntos: positiva, se pasa de
//   seguro), con su IC; «Δ k=1», la diferencia pareada con el pronóstico del MISMO partido la víspera (su
//   pareja de siempre): lo que se pierde por pronosticar antes, sin mezclarlo con qué partidos caen en cada
//   tramo (los de 13+ son todos de final de temporada); y la diferencia con la tabla y con el local.
// - Las cifras de siempre no cambian: sin --distancia, el banco y el backtest dan lo mismo que antes (diff
//   de sus salidas, 17/10/2026), y la fila de k = 1 es la de la web en la tabla de arriba.
//
// EVALUACIÓN, con el modelo de la web (--distancia --modelo web; 2.747 partidos, 35.132 pronósticos, B = 2000,
// semilla 17102026; «fiab.» y los Δ de acierto, en puntos; los Δ de log-loss, negativos, mejor la web):
//
//   distancia  pronóst.  log-loss [IC 95 %]    Brier  acierto [IC 95 %]     fiab. [IC 95 %]     Δ k=1 log-loss            Δ k=1 acierto        Δ tabla                   Δ local
//   1          2.618     0,522 [0,467, 0,586]  0,289  80,1 % [77,0, 82,8]   −0,8 [−2,2, +0,5]   —                         —                    −0,151 [−0,174, −0,124]   −0,375
//   2          2.486     0,524 [0,465, 0,591]  0,290  80,1 % [76,7, 83,2]   −1,2 [−3,0, +0,6]   +0,010 [+0,005, +0,016]   −0,3 [−1,0, +0,3]    −0,153 [−0,178, −0,126]   −0,373
//   3          2.360     0,533 [0,473, 0,605]  0,296  79,4 % [76,0, 82,4]   −0,3 [−2,0, +1,5]   +0,024 [+0,015, +0,035]   −1,3 [−2,3, −0,6]    −0,160 [−0,185, −0,131]   −0,367
//   4-6        6.341     0,548 [0,482, 0,624]  0,304  78,6 % [75,0, 82,0]   +0,3 [−1,9, +2,1]   +0,045 [+0,033, +0,062]   −2,2 [−3,1, −1,6]    −0,151 [−0,173, −0,126]   −0,355
//   7-12       9.524     0,551 [0,477, 0,637]  0,306  78,4 % [74,0, 82,5]   +0,5 [−1,8, +2,8]   +0,053 [+0,039, +0,073]   −2,4 [−3,7, −1,5]    −0,138 [−0,160, −0,119]   −0,357
//   13+        8.992     0,615 [0,510, 0,714]  0,345  75,6 % [69,9, 81,1]   +0,9 [−2,3, +3,9]   +0,087 [+0,068, +0,115]   −4,2 [−6,9, −2,3]    −0,150 [−0,188, −0,115]   −0,299
//
// A más distancia se acierta menos (a 13 o más jornadas vista, −4,2 puntos frente a la víspera en los mismos
// partidos; demostrable desde k = 3) y las probabilidades son peores (demostrable desde k = 2); pero en todos los
// tramos la web sigue ganando a la tabla de forma demostrable (de −0,138 a −0,160 de log-loss y de +1,6 a
// +3,3 puntos de acierto) y NO se pasa de seguro: la fiabilidad va de −1,2 a +0,9 puntos, todos con el cero
// dentro. Cruzado con las jornadas jugadas: con 2-3, lo que se pierde es más (Δ k=1: +0,026 [−0,010, +0,063]
// a k = 2, +0,074 a 3, +0,157 a 4-6 y a 7-12, +0,138 a 13+) y la fiabilidad, más ruidosa (de −4,2 [−8,4, +0,8]
// a +3,3 [−0,2, +7,2], en 4-6), sin ningún tramo demostrable; con 4 o más, de +0,008 (k = 2) a +0,070 (13+),
// con la fiabilidad entre −0,9 y +1,5 [−2,3, +5,1]. En AJUSTE, lo mismo: fiabilidad de −0,8 a +0,6 puntos, Δ
// k=1 de +0,014 (k = 2) a +0,095 (13+). Es decir, la pérdida es de información (con menos jornadas jugadas,
// las notas están peor medidas), y notesOdds ya la cuenta: con menos partidos, más varianza y favoritos más
// moderados.
//
// LA CORRECCIÓN POR DISTANCIA, PROBADA Y NO ADOPTADA (scripts/pronostico_modelos/distancia.mjs). La regla,
// fijada antes de ajustar nada: se adopta solo si en AJUSTE mejora el log-loss (en una milésima al menos,
// la de siempre en el banco y el backtest para dar por empatadas dos opciones) y en EVALUACIÓN no empeora
// k = 1 ni ningún tramo de forma demostrable. La forma, la de la incertidumbre de las notas: la varianza de
// la diferencia, más una deriva por cada jornada de por medio (v + deriva·(k − 1), en la pendiente y la
// banda de empate). En AJUSTE, la mejor deriva es 0: cualquiera mayor empeora (0,50313 sin ella; 0,50316 con
// 0,001; 0,50365 con 0,01; 0,50824 con 0,05), y la pendiente que mejor va en cada tramo es la de siempre
// (×1,00) hasta k = 12 y una MÁS afilada a 13+ (×1,08): no hay nada que suavizar. No se adopta, y la web no
// lleva ninguna corrección. La cota, con EVALUACIÓN (no es una prueba: es la deriva que mejor le va a la
// propia EVALUACIÓN, 0,01): −0,0005 de log-loss [−0,0027, +0,0017] en total y −0,0014 [−0,0063, +0,0039] a
// 13+, nada demostrable, el mismo acierto, y en AJUSTE esa misma deriva empeora (+0,0005).
//
// LO QUE EVALUACIÓN YA NO ES, A DISTANCIA (17/10/2026): ya se había consultado en el diseño del modelo
// (arriba), y aquí sus cifras por distancia se vieron antes de decidir sobre la corrección. La decisión
// salió de AJUSTE (la deriva 0 y las pendientes por tramo); de EVALUACIÓN, solo la tabla de arriba y la cota.
// La prueba limpia de cómo se comporta a distancia es 2026-27, que nada de esto ha visto.
//
// Desde otro script: import { evaluate, ejecutar, cargarModelo, pares, REFERENCIAS } from
// './pronostico_banco.mjs'; evaluate(predictor, { split, B, semilla, referencia }) da el informe (sin
// llamar a ningún ajustar) y ejecutar(modelo, { split, contra }) hace lo del CLI (ajustar y examen). A
// distancia, paresDistancia(split), evaluarDistancia(predictor, { split, B, semilla, referencias }) y
// ejecutarDistancia(modelo, { split, contra }). Las remuestras del bootstrap, resamples(C, B, semilla) y
// quantile(valores, q) (las usa también scripts/backtest_proyeccion.mjs, 19/10/2026).
//
// Las referencias (REFERENCIAS; sus frecuencias, medidas SOLO en las temporadas de ajuste):
// - actual: src/pronostico.js con los PARAMS de la web, desde la primera jornada y con equipos sin
//   partidos (minRounds 1, minPlayed 0: pronostica todas las parejas, como las tablas del backtest); desde
//   el 17/10/2026, las notas de Massey;
// - web: src/pronostico.js con PARAMS tal cual (minRounds 2, minPlayed 1): lo que enseña la web; no
//   pronostica el tramo 1 ni los partidos de un equipo sin partidos (nulos);
// - poisson: el 1X2 del Poisson de los goles de src/pronostico.js (outcome de sus goles esperados), el de la
//   web hasta el 17/10/2026, como «actual»: desde la primera jornada;
// - local: siempre las frecuencias de local, empate y visitante;
// - tabla: gana el mejor clasificado con el entrenamiento (puntos, diferencia de goles y goles), con las
//   frecuencias del mejor, el empate y el peor; si van igual, las del local.
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { basename, join, dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import vm from 'node:vm';
import { buildSeason, createModel, retiredTeams } from '../src/model.js';
import {
  PARAMS, copiedMatches, forecastApplies, forecastMatch, isDeskResult, offVenue, outcome, roundsAhead, trainingFor,
} from '../src/pronostico.js';

export const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
export const CURRENT = '2026-2027';

// Las temporadas de cada parte del examen, fijas (una temporada que se archive después no entra en
// ninguna de las dos hasta que se decida; «todas» sí la coge).
export const TEMPORADAS = Object.freeze({
  ajuste: Object.freeze(['2013-2014', '2014-2015', '2015-2016', '2016-2017', '2017-2018', '2018-2019', '2019-2020', '2020-2021']),
  evaluacion: Object.freeze(['2021-2022', '2022-2023', '2023-2024', '2024-2025', '2025-2026']),
});
export const SPLITS = Object.freeze(['ajuste', 'evaluacion', 'todas']);
export const SEMILLA = 17102026;
export const B_DEFECTO = 2000;

// ── Carga de las temporadas ──────────────────────────────────────────────────────────────────────────

// Los `const NOMBRE = …` de un data-*.js, sin el navegador.
export function loadGlobals(file, names) {
  const ctx = {};
  vm.createContext(ctx);
  const probe = names.map(n => `${n}: typeof ${n} !== 'undefined' ? ${n} : undefined`).join(', ');
  vm.runInContext(`${readFileSync(join(ROOT, file), 'utf8')}\n;globalThis.__out = { ${probe} };`, ctx);
  return ctx.__out;
}

// Las temporadas pasadas (solo su prebenjamín), de la más antigua a la más reciente.
export function pastSeasons() {
  return readdirSync(ROOT).filter(f => /^data-season-\d{4}-\d{4}\.js$/.test(f)).sort().map(f => {
    const name = f.slice('data-season-'.length, -'.js'.length);
    const raw = loadGlobals(f, [`SEASON_${name.replace('-', '_')}`])[`SEASON_${name.replace('-', '_')}`];
    return buildSeason({ name, current: false, prebenjamin: raw.prebenjamin || [] });
  }).filter(s => s.name !== CURRENT);
}

// La temporada en curso, como la ve la web, y sus estados de la app de futbolaspalmas (model.matchStatus).
export function currentSeason() {
  const { PREBENJAMIN } = loadGlobals('data-prebenjamin.js', ['PREBENJAMIN']);
  const { HISTORY, ESTADOS } = loadGlobals('data-history.js', ['HISTORY', 'ESTADOS']);
  const model = createModel({ prebenjamin: PREBENJAMIN, benjamin: [], history: HISTORY, estados: ESTADOS },
    { portalSeason: CURRENT });
  return { season: model.season(CURRENT), status: m => model.matchStatus(m) };
}

// ── Los partidos del examen ──────────────────────────────────────────────────────────────────────────

export const outcomeOf = (h, a) => (h > a ? 'home' : h < a ? 'away' : 'draw');
export const BUCKETS = [['1', n => n === 1], ['2', n => n === 2], ['3', n => n === 3], ['4-6', n => n >= 4 && n <= 6], ['7+', n => n >= 7]];
export const bucketOf = n => (BUCKETS.find(([, f]) => f(n)) || ['0'])[0];
export const TRAMOS = Object.freeze(BUCKETS.map(([b]) => b));
export const tramoDe = bucketOf;
// Los tramos de la distancia (roundsAhead de src/pronostico.js: 1, la próxima jornada) y, para cruzarlos,
// los de las jornadas del entrenamiento.
export const DISTANCIAS = [['1', k => k === 1], ['2', k => k === 2], ['3', k => k === 3], ['4-6', k => k >= 4 && k <= 6], ['7-12', k => k >= 7 && k <= 12], ['13+', k => k >= 13]];
export const distanciaDe = k => (DISTANCIAS.find(([, f]) => f(k)) || ['0'])[0];
export const TRAMOS_K = Object.freeze(DISTANCIAS.map(([d]) => d));
export const CRUCE = [['1', n => n === 1], ['2-3', n => n === 2 || n === 3], ['4+', n => n >= 4]];
export const cruceDe = n => (CRUCE.find(([, f]) => f(n)) || ['0'])[0];
export const TRAMOS_CRUCE = Object.freeze(CRUCE.map(([c]) => c));

// Los objetivos de un grupo: partidos de liga con fecha y marcador, sin retirados, copias de la
// importación (copiedMatches) ni estados de fuera, y sin lo que seguro es de mesa: el campo «EXCLUIDO» o
// «SUSPENDIDO» y los 3-0 y 1-0 sin hora. Los 3-0 y 1-0 con hora, que el entrenamiento deja fuera ante la
// duda (isDeskResult), aquí sí cuentan: casi todos son de verdad, y quitarlos dejaría el examen sin los
// partidos cerrados. Cada uno se pronostica con su copia sin marcador.
export const deskForSure = m => offVenue(m) || (isDeskResult(m) && !m.time);
export function targets(group, status) {
  const retired = retiredTeams(group);
  const copies = copiedMatches(group);
  const out = [];
  for (const round of group.rounds) {
    for (const m of round.matches) {
      if (m.hs == null || m.as == null || !m.dateISO) continue;
      if (retired.has(m.home) || retired.has(m.away) || copies.has(m) || deskForSure(m)) continue;
      if (status) { const s = status(m); if (s && ['retirado', 'anulado', 'suspendido'].includes(s.state)) continue; }
      out.push(m);
    }
  }
  return out;
}

// La clasificación con los partidos de entrenamiento: [pts, dg, gf] de cada equipo.
export function tableOf(matches) {
  const t = new Map();
  const row = name => { if (!t.has(name)) t.set(name, [0, 0, 0]); return t.get(name); };
  for (const m of matches) {
    const h = row(m.home), a = row(m.away);
    h[0] += m.hs > m.as ? 3 : m.hs === m.as ? 1 : 0;
    a[0] += m.as > m.hs ? 3 : m.hs === m.as ? 1 : 0;
    h[1] += m.hs - m.as; a[1] += m.as - m.hs; h[2] += m.hs; a[2] += m.as;
  }
  return t;
}
// 'home' o 'away' si uno va por delante, null si van igual.
export function tableLeader(table, m) {
  const h = table.get(m.home) || [0, 0, 0], a = table.get(m.away) || [0, 0, 0];
  for (let i = 0; i < 3; i += 1) if (h[i] !== a[i]) return h[i] > a[i] ? 'home' : 'away';
  return null;
}

/* Las parejas (entrenamiento, partido) de unas temporadas, en el orden del examen (temporada, grupo,
 * jornada y el de la fuente): [{ temporada, grupo, clave, group, m, match, training, hs, as, y, jornadas,
 * tramo, status, k, distancia, corte }]. m es el partido con su marcador (el del archivo); match, su copia
 * congelada sin él (la que recibe el predictor); training, congelado; status, el model.matchStatus de la
 * temporada (null en las pasadas); k, la distancia de ese entrenamiento (roundsAhead: casi siempre 1) y
 * distancia, su tramo; corte, null (el entrenamiento de siempre: todo lo de antes de su día; las de
 * distancePairsOf llevan el día del corte). `statusOf(season)` da el status de cada temporada (el
 * backtest se lo pasa a 2026-27). */
export function pairsOf(seasons, statusOf = () => null) {
  const out = [];
  for (const season of seasons) {
    const status = statusOf(season) || null;
    for (const group of season.groups) {
      if (!forecastApplies(group, { prueba: true })) continue;
      for (const m of targets(group, status)) {
        const training = trainingFor(group, m, { status });
        const jornadas = new Set(training.map(t => t.roundKey)).size;
        if (!jornadas) continue;
        const k = roundsAhead(group, m, { status });
        out.push(Object.freeze({
          temporada: season.name,
          grupo: group.id,
          clave: `${season.name} ${group.id}`,
          group,
          m,
          match: Object.freeze({ ...m, hs: null, as: null }),
          training: Object.freeze(training),
          hs: m.hs,
          as: m.as,
          y: outcomeOf(m.hs, m.as),
          jornadas,
          tramo: bucketOf(jornadas),
          status,
          k,
          distancia: distanciaDe(k),
          corte: null,
        }));
      }
    }
  }
  return out;
}

/* Las parejas a varias jornadas vista (17/10/2026): las de pairsOf y, de cada una, el pronóstico que se
 * habría hecho antes, cada día en que cambia lo jugado. Para cada día de su entrenamiento, `corte`, el
 * entrenamiento es el de siempre con solo lo jugado antes de ese día (trainingFor con before) y la
 * distancia, la de la web con él (roundsAhead con before: la MISMA función). De cada distancia se queda
 * el corte más tardío (el que más sabe a esa distancia): en un calendario en orden, para un partido de la
 * jornada N a k vista, lo jugado antes de que empiece la N − k + 1. La de siempre (corte null) va primero
 * y se queda su distancia (casi siempre 1). Cada una lleva `base`, la de siempre de su partido (la de
 * pairsOf; la suya, ella misma), para la diferencia pareada con el pronóstico de la víspera. Sin nada
 * jugado antes del corte, nada. */
export function distancePairsOf(basePairs) {
  const out = [];
  for (const b of basePairs) {
    out.push(Object.freeze({ ...b, base: b }));
    const seen = new Set([b.k]);
    const days = [...new Set(b.training.map(t => t.dateISO))].sort().reverse();
    for (const day of days) {
      const training = trainingFor(b.group, b.m, { status: b.status, before: day });
      if (!training.length) break;
      const k = roundsAhead(b.group, b.m, { status: b.status, before: day });
      if (seen.has(k)) continue;
      seen.add(k);
      const jornadas = new Set(training.map(t => t.roundKey)).size;
      out.push(Object.freeze({
        ...b, training: Object.freeze(training), jornadas, tramo: bucketOf(jornadas), k, distancia: distanciaDe(k), corte: day, base: b,
      }));
    }
  }
  return out;
}

// Las parejas de una parte del examen ('ajuste' | 'evaluacion' | 'todas'), cargadas una vez por proceso.
const CACHE = {};
export function pares(split = 'evaluacion') {
  if (!SPLITS.includes(split)) throw new RangeError(`pronostico_banco: split no válido (${split}); se aceptan ${SPLITS.join(', ')}`);
  if (!CACHE.todas) CACHE.todas = Object.freeze(pairsOf(pastSeasons()));
  if (!CACHE[split]) {
    const keep = new Set(TEMPORADAS[split]);
    CACHE[split] = Object.freeze(CACHE.todas.filter(p => keep.has(p.temporada)));
  }
  return CACHE[split];
}

// Las parejas a varias jornadas vista de una parte del examen (distancePairsOf de las de pares), una vez.
const CACHE_K = {};
export function paresDistancia(split = 'evaluacion') {
  if (!SPLITS.includes(split)) throw new RangeError(`pronostico_banco: split no válido (${split}); se aceptan ${SPLITS.join(', ')}`);
  if (!CACHE_K.todas) CACHE_K.todas = Object.freeze(distancePairsOf(pares('todas')));
  if (!CACHE_K[split]) {
    const keep = new Set(TEMPORADAS[split]);
    CACHE_K[split] = Object.freeze(CACHE_K.todas.filter(p => keep.has(p.temporada)));
  }
  return CACHE_K[split];
}

// ── Las métricas ─────────────────────────────────────────────────────────────────────────────────────

export const EPS = 1e-15;
export const logLoss = (p, y) => -Math.log(Math.max(EPS, p[y]));
export const brier = (p, y) => ['home', 'draw', 'away'].reduce((s, o) => s + (p[o] - (o === y ? 1 : 0)) ** 2, 0);
export const probsOf = f => ({ home: f.pHome, draw: f.pDraw, away: f.pAway });
// El desenlace más probable; a igualdad, el local, luego el visitante (como outcome() de pronostico.js).
export const pickOf = p => (p.home >= p.away && p.home >= p.draw ? 'home' : p.away >= p.draw ? 'away' : 'draw');

// Lo que devuelve un predictor, comprobado: { home, draw, away } que suman 1, o null.
function checked(out, pair) {
  if (out === null || out === undefined) return null;
  const where = () => `${pair.clave} ${pair.match.roundKey} ${pair.match.home}–${pair.match.away}`;
  if (typeof out !== 'object') throw new TypeError(`predictor: ${where()}: devuelve ${typeof out}; se espera { pHome, pDraw, pAway } o null`);
  const p = { home: out.pHome, draw: out.pDraw, away: out.pAway };
  for (const [k, v] of Object.entries(p)) {
    if (typeof v !== 'number' || !Number.isFinite(v) || v < 0) throw new RangeError(`predictor: ${where()}: p${k} = ${v}`);
  }
  const sum = p.home + p.draw + p.away;
  if (Math.abs(sum - 1) > 1e-6) throw new RangeError(`predictor: ${where()}: las probabilidades suman ${sum}`);
  return { home: p.home / sum, draw: p.draw / sum, away: p.away / sum };
}

// Generador con semilla (mulberry32): las mismas remuestras con la misma semilla y los mismos grupos.
function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
// B remuestras de C grupos con reemplazo: cuántas veces sale cada grupo en cada una.
export function resamples(C, B, seed) {
  const next = rng(seed);
  const out = [];
  for (let b = 0; b < B; b += 1) {
    const w = new Uint16Array(C);
    for (let i = 0; i < C; i += 1) w[Math.floor(next() * C)] += 1;
    out.push(w);
  }
  return out;
}
// Percentil q (interpolado) de unos valores.
export function quantile(values, q) {
  const v = [...values].sort((x, y) => x - y);
  if (!v.length) return null;
  const pos = (v.length - 1) * q, lo = Math.floor(pos), hi = Math.ceil(pos);
  return v[lo] + (v[hi] - v[lo]) * (pos - lo);
}
const r6 = x => (x === null || x === undefined || !Number.isFinite(x) ? null : Math.round(x * 1e6) / 1e6);

// Sumas por grupo y tramo: { [tramo | 'global']: Float64Array(C) por campo }.
function sums(C, fields, keys = ['global', ...TRAMOS]) {
  const out = {};
  for (const t of keys) out[t] = Object.fromEntries(fields.map(f => [f, new Float64Array(C)]));
  return out;
}
const total = a => a.reduce((s, x) => s + x, 0);
// El intervalo de num/den con las remuestras (la razón de sumas ponderadas por la multiplicidad).
function interval(num, den, W, keep = null) {
  if (!W.length) return null;
  const vals = [];
  const cnt = keep ? [] : null;
  for (const w of W) {
    let n = 0, d = 0;
    for (let c = 0; c < w.length; c += 1) if (w[c]) { n += w[c] * num[c]; d += w[c] * den[c]; }
    if (d > 0) { vals.push(n / d); if (keep) cnt.push(keep(n / d)); }
  }
  if (!vals.length) return null;
  return { ic95: [r6(quantile(vals, 0.025)), r6(quantile(vals, 0.975))], share: keep ? cnt.filter(Boolean).length / cnt.length : null };
}
const ic95Of = (num, den, W) => { const r = interval(num, den, W); return r ? r.ic95 : null; };

// Lo que recibe el predictor de cada pareja: { temporada, grupo, jornadas, tramo, k, distancia, corte }.
const infoOf = pair => Object.freeze({
  temporada: pair.temporada, grupo: pair.grupo, jornadas: pair.jornadas, tramo: pair.tramo, k: pair.k, distancia: pair.distancia, corte: pair.corte,
});

/* El examen de un predictor en una parte de las temporadas. Opciones: split ('evaluacion' por defecto),
 * B (remuestras del bootstrap; 0, sin intervalos), semilla, referencia (otro predictor: la diferencia
 * pareada con él) y nombreReferencia. Devuelve el informe (serializable en JSON):
 *   { split, temporadas, grupos, pares, predichos, nulos, bootstrap,
 *     global: { pares, predichos, nulos, logLoss, brier, acierto, empatePrevisto, empateReal,
 *               ic95: { logLoss: [a, b], brier, acierto } },
 *     porTramo: { '1': { …lo mismo }, '2', '3', '4-6', '7+' },
 *     frente: { referencia, global: { pares, logLoss, brier, acierto, ic95: {…}, pMejor }, porTramo } }
 * con las diferencias de `frente` como modelo − referencia (log-loss y Brier: negativo, mejor el modelo;
 * acierto: positivo, mejor el modelo). No llama a ningún ajustar. */
export function evaluate(predictor, { split = 'evaluacion', B = B_DEFECTO, semilla = SEMILLA, referencia = null, nombreReferencia = 'referencia', pairs = null } = {}) {
  if (typeof predictor !== 'function') throw new TypeError('evaluate: el predictor tiene que ser una función');
  const ps = pairs || pares(split);
  const claves = [...new Set(ps.map(p => p.clave))];
  const idx = new Map(claves.map((k, i) => [k, i]));
  const C = claves.length;
  const S = sums(C, ['pares', 'n', 'll', 'br', 'ok', 'pd', 'd']);
  const D = referencia ? sums(C, ['n', 'll', 'br', 'ok']) : null;
  for (const pair of ps) {
    const info = infoOf(pair);
    const p = checked(predictor(pair.training, pair.match, pair.group, info), pair);
    const q = referencia ? checked(referencia(pair.training, pair.match, pair.group, info), pair) : null;
    const c = idx.get(pair.clave);
    for (const t of ['global', pair.tramo]) {
      S[t].pares[c] += 1;
      if (p) {
        S[t].n[c] += 1; S[t].ll[c] += logLoss(p, pair.y); S[t].br[c] += brier(p, pair.y);
        S[t].ok[c] += pickOf(p) === pair.y; S[t].pd[c] += p.draw; S[t].d[c] += pair.y === 'draw';
      }
      if (p && q) {
        D[t].n[c] += 1; D[t].ll[c] += logLoss(p, pair.y) - logLoss(q, pair.y); D[t].br[c] += brier(p, pair.y) - brier(q, pair.y);
        D[t].ok[c] += (pickOf(p) === pair.y) - (pickOf(q) === pair.y);
      }
    }
  }
  const W = B > 0 ? resamples(C, B, semilla) : [];
  const block = s => {
    const n = total(s.n), pairsN = total(s.pares);
    const ratio = k => (n ? total(s[k]) / n : null);
    return {
      pares: pairsN, predichos: n, nulos: pairsN - n,
      logLoss: r6(ratio('ll')), brier: r6(ratio('br')), acierto: r6(ratio('ok')),
      empatePrevisto: r6(ratio('pd')), empateReal: r6(ratio('d')),
      ic95: W.length && n ? { logLoss: ic95Of(s.ll, s.n, W), brier: ic95Of(s.br, s.n, W), acierto: ic95Of(s.ok, s.n, W) } : null,
    };
  };
  const diff = s => {
    const n = total(s.n);
    const ratio = k => (n ? total(s[k]) / n : null);
    const ll = W.length && n ? interval(s.ll, s.n, W, v => v < 0) : null;
    return {
      pares: n, logLoss: r6(ratio('ll')), brier: r6(ratio('br')), acierto: r6(ratio('ok')),
      ic95: W.length && n ? { logLoss: ll ? ll.ic95 : null, brier: ic95Of(s.br, s.n, W), acierto: ic95Of(s.ok, s.n, W) } : null,
      pMejor: ll ? r6(ll.share) : null,
    };
  };
  const all = block(S.global);
  return {
    split: pairs ? 'parejas' : split,
    temporadas: [...new Set(ps.map(p => p.temporada))],
    grupos: C,
    pares: all.pares, predichos: all.predichos, nulos: all.nulos,
    bootstrap: { B: W.length, semilla, unidad: 'temporada-grupo', intervalo: 'percentiles 2,5 y 97,5' },
    global: all,
    porTramo: Object.fromEntries(TRAMOS.map(t => [t, block(S[t])])),
    frente: D ? {
      referencia: nombreReferencia,
      global: diff(D.global),
      porTramo: Object.fromEntries(TRAMOS.map(t => [t, diff(D[t])])),
    } : null,
  };
}

// ── El examen a varias jornadas vista ───────────────────────────────────────────────────────────────

// La diferencia pareada de unas sumas (n, ll, br, ok: las diferencias por grupo), como `frente` de evaluate.
function pairedOf(n, ll, br, ok, W) {
  const N = total(n);
  const ratio = a => (N ? total(a) / N : null);
  const r = W.length && N ? interval(ll, n, W, v => v < 0) : null;
  return {
    pares: N, logLoss: r6(ratio(ll)), brier: r6(ratio(br)), acierto: r6(ratio(ok)),
    ic95: W.length && N ? { logLoss: r ? r.ic95 : null, brier: ic95Of(br, n, W), acierto: ic95Of(ok, n, W) } : null,
    pMejor: r ? r6(r.share) : null,
  };
}

/* El examen de un predictor a varias jornadas vista (17/10/2026), con las parejas de paresDistancia (o
 * `pairs`): cada partido, una vez por cada distancia a la que se habría pronosticado. Opciones: split, B,
 * semilla y referencias ({ nombre: predictor }; por defecto, la tabla y el local), que reciben el mismo
 * entrenamiento. Devuelve, serializable en JSON:
 *   { split, temporadas, grupos, pares, partidos, bootstrap, global, porDistancia: { '1', '2', '3', '4-6',
 *     '7-12', '13+' }, porDistanciaYJornadas: { [distancia]: { '1', '2-3', '4+' } } }
 * con cada bloque { pares, predichos, nulos, logLoss, brier, acierto, favorito, empatePrevisto, empateReal,
 * ic95: { logLoss, brier, acierto, favorito }, fiabilidad: { diferencia, ic95 }, frenteK1, frente }:
 * favorito, la probabilidad media que se le da al desenlace elegido, y fiabilidad.diferencia, favorito −
 * acierto (positiva, se pasa de seguro; negativa, se queda corto); frenteK1, la diferencia pareada con el
 * pronóstico del mismo partido con el entrenamiento de siempre (su `base`, la de la víspera: lo que se
 * pierde por pronosticar antes; en las de distancia 1, casi siempre cero), y frente, la del modelo menos
 * cada referencia en la misma pareja. Las diferencias, como en evaluate (log-loss y Brier: negativo, mejor
 * el modelo o la víspera; acierto: positivo). No llama a ningún ajustar. */
export function evaluarDistancia(predictor, { split = 'evaluacion', B = B_DEFECTO, semilla = SEMILLA, referencias = null, pairs = null } = {}) {
  if (typeof predictor !== 'function') throw new TypeError('evaluarDistancia: el predictor tiene que ser una función');
  const ps = pairs || paresDistancia(split);
  const refs = Object.entries(referencias || { tabla: REFERENCIAS.tabla.predictor, local: REFERENCIAS.local.predictor });
  const claves = [...new Set(ps.map(p => p.clave))];
  const idx = new Map(claves.map((k, i) => [k, i]));
  const C = claves.length;
  const keys = ['global', ...TRAMOS_K, ...TRAMOS_K.flatMap(d => TRAMOS_CRUCE.map(c => `${d}|${c}`))];
  const fields = ['pares', 'n', 'll', 'br', 'ok', 'fav', 'fo', 'pd', 'd', 'n1', 'll1', 'br1', 'ok1', ...refs.flatMap(([r]) => [`n:${r}`, `ll:${r}`, `br:${r}`, `ok:${r}`])];
  const S = sums(C, fields, keys);
  // Cada pronóstico, una vez por predictor: el de la víspera (corte null) es el mismo en su pareja y en las
  // que la tienen de base.
  const memo = new Map();
  const predOf = (f, pair) => {
    if (!memo.has(f)) memo.set(f, new Map());
    const seen = memo.get(f);
    const key = pair.corte === null ? (pair.base || pair) : pair;
    if (!seen.has(key)) seen.set(key, checked(f(pair.training, pair.match, pair.group, infoOf(pair)), pair));
    return seen.get(key);
  };
  for (const pair of ps) {
    const p = predOf(predictor, pair);
    const base = predOf(predictor, pair.base || pair);
    const c = idx.get(pair.clave);
    const qs = refs.map(([r, f]) => [r, predOf(f, pair)]);
    for (const t of ['global', pair.distancia, `${pair.distancia}|${cruceDe(pair.jornadas)}`]) {
      const s = S[t];
      s.pares[c] += 1;
      if (!p) continue;
      const ll = logLoss(p, pair.y), br = brier(p, pair.y), pick = pickOf(p), ok = pick === pair.y;
      s.n[c] += 1; s.ll[c] += ll; s.br[c] += br; s.ok[c] += ok; s.fav[c] += p[pick]; s.fo[c] += p[pick] - ok;
      s.pd[c] += p.draw; s.d[c] += pair.y === 'draw';
      if (base) {
        s.n1[c] += 1; s.ll1[c] += ll - logLoss(base, pair.y); s.br1[c] += br - brier(base, pair.y); s.ok1[c] += ok - (pickOf(base) === pair.y);
      }
      for (const [r, q] of qs) {
        if (!q) continue;
        s[`n:${r}`][c] += 1; s[`ll:${r}`][c] += ll - logLoss(q, pair.y); s[`br:${r}`][c] += br - brier(q, pair.y);
        s[`ok:${r}`][c] += ok - (pickOf(q) === pair.y);
      }
    }
  }
  const W = B > 0 ? resamples(C, B, semilla) : [];
  const block = s => {
    const n = total(s.n), pairsN = total(s.pares);
    const ratio = k => (n ? total(s[k]) / n : null);
    return {
      pares: pairsN, predichos: n, nulos: pairsN - n,
      logLoss: r6(ratio('ll')), brier: r6(ratio('br')), acierto: r6(ratio('ok')), favorito: r6(ratio('fav')),
      empatePrevisto: r6(ratio('pd')), empateReal: r6(ratio('d')),
      ic95: W.length && n ? { logLoss: ic95Of(s.ll, s.n, W), brier: ic95Of(s.br, s.n, W), acierto: ic95Of(s.ok, s.n, W), favorito: ic95Of(s.fav, s.n, W) } : null,
      fiabilidad: { diferencia: r6(ratio('fo')), ic95: W.length && n ? ic95Of(s.fo, s.n, W) : null },
      frenteK1: pairedOf(s.n1, s.ll1, s.br1, s.ok1, W),
      frente: Object.fromEntries(refs.map(([r]) => [r, pairedOf(s[`n:${r}`], s[`ll:${r}`], s[`br:${r}`], s[`ok:${r}`], W)])),
    };
  };
  return {
    split: pairs ? 'parejas' : split,
    temporadas: [...new Set(ps.map(p => p.temporada))],
    grupos: C,
    pares: ps.length,
    partidos: new Set(ps.map(p => p.base || p)).size,
    bootstrap: { B: W.length, semilla, unidad: 'temporada-grupo', intervalo: 'percentiles 2,5 y 97,5' },
    referencias: refs.map(([r]) => r),
    global: block(S.global),
    porDistancia: Object.fromEntries(TRAMOS_K.map(d => [d, block(S[d])])),
    porDistanciaYJornadas: Object.fromEntries(TRAMOS_K.map(d => [d, Object.fromEntries(TRAMOS_CRUCE.map(c => [c, block(S[`${d}|${c}`])]))])),
  };
}

// ── Las referencias ──────────────────────────────────────────────────────────────────────────────────

// Las frecuencias de las temporadas de ajuste: del local, el empate y el visitante, y del mejor
// clasificado, el empate y el peor (cuando uno va por delante con el entrenamiento).
let FRECUENCIAS = null;
export function frecuenciasAjuste() {
  if (FRECUENCIAS) return FRECUENCIAS;
  const c = { home: 0, draw: 0, away: 0 }, l = { better: 0, draw: 0, worse: 0 };
  const ps = pares('ajuste');
  for (const { training, match, y } of ps) {
    c[y] += 1;
    const leader = tableLeader(tableOf(training), match);
    if (leader) l[y === 'draw' ? 'draw' : y === leader ? 'better' : 'worse'] += 1;
  }
  const n = ps.length, nl = l.better + l.draw + l.worse;
  FRECUENCIAS = Object.freeze({
    pares: n,
    local: Object.freeze({ home: c.home / n, draw: c.draw / n, away: c.away / n }),
    conLider: nl,
    lider: Object.freeze({ better: l.better / nl, draw: l.draw / nl, worse: l.worse / nl }),
  });
  return FRECUENCIAS;
}

const EVAL_PARAMS = Object.freeze({ ...PARAMS, minRounds: 1, minPlayed: 0 });
const fromForecast = f => f && { pHome: f.pHome, pDraw: f.pDraw, pAway: f.pAway };
// Las referencias de src/pronostico.js con el entrenamiento de la pareja: el de siempre o, en las de
// distancePairsOf, solo lo jugado antes de su corte (info.corte; forecastMatch lo vuelve a calcular igual).
const forecastOf = (match, group, info, params) => forecastMatch(group, match, { prueba: true, params, before: (info && info.corte) || null });
// Infinity, escrito como tal (JSON lo deja en null).
export const show = params => JSON.stringify(params, (k, v) => (v === Infinity ? 'Infinity' : v));
const asJSON = params => JSON.parse(show(params));

export const REFERENCIAS = Object.freeze({
  actual: Object.freeze({
    nombre: 'actual',
    descripcion: 'src/pronostico.js con PARAMS (las notas de Massey), desde la primera jornada y con equipos sin partidos (minRounds 1, minPlayed 0)',
    ajustar: () => ({ params: asJSON(EVAL_PARAMS) }),
    predictor: (training, match, group, info) => fromForecast(forecastOf(match, group, info, EVAL_PARAMS)),
  }),
  web: Object.freeze({
    nombre: 'web',
    descripcion: 'src/pronostico.js con PARAMS tal cual (minRounds 2, minPlayed 1): lo que enseña la web',
    ajustar: () => ({ params: asJSON(PARAMS) }),
    predictor: (training, match, group, info) => fromForecast(forecastOf(match, group, info, PARAMS)),
  }),
  poisson: Object.freeze({
    nombre: 'poisson',
    descripcion: 'el 1X2 del Poisson de los goles de src/pronostico.js (el de la web hasta el 17/10/2026), desde la primera jornada',
    ajustar: () => ({ params: asJSON(EVAL_PARAMS) }),
    predictor: (training, match, group, info) => {
      const f = forecastOf(match, group, info, EVAL_PARAMS);
      return f && fromForecast(outcome(f.xgHome, f.xgAway, EVAL_PARAMS));
    },
  }),
  local: Object.freeze({
    nombre: 'local',
    descripcion: 'siempre las frecuencias de local, empate y visitante de las temporadas de ajuste',
    ajustar: () => frecuenciasAjuste().local,
    predictor: () => { const r = frecuenciasAjuste().local; return { pHome: r.home, pDraw: r.draw, pAway: r.away }; },
  }),
  tabla: Object.freeze({
    nombre: 'tabla',
    descripcion: 'gana el mejor clasificado con el entrenamiento (puntos, diferencia, goles), con las frecuencias de ajuste',
    ajustar: () => ({ lider: frecuenciasAjuste().lider, local: frecuenciasAjuste().local }),
    predictor: (training, match) => {
      const f = frecuenciasAjuste();
      const leader = tableLeader(tableOf(training), match);
      if (!leader) return { pHome: f.local.home, pDraw: f.local.draw, pAway: f.local.away };
      const { better, draw, worse } = f.lider;
      return leader === 'home' ? { pHome: better, pDraw: draw, pAway: worse } : { pHome: worse, pDraw: draw, pAway: better };
    },
  }),
});

// ── El examen de un modelo (ajustar y evaluar) ───────────────────────────────────────────────────────

// El banco que recibe ajustar: solo las temporadas de ajuste.
export function bancoDeAjuste() {
  return Object.freeze({
    split: 'ajuste',
    temporadas: TEMPORADAS.ajuste,
    pares: pares('ajuste'),
    evaluate: (predictor, opts = {}) => evaluate(predictor, { ...opts, pairs: null, split: 'ajuste' }),
    // Las de varias jornadas vista, también solo de ajuste (se calculan al pedirlas: unos segundos).
    paresDistancia: () => paresDistancia('ajuste'),
    evaluarDistancia: (predictor, opts = {}) => evaluarDistancia(predictor, { ...opts, pairs: null, split: 'ajuste' }),
    logLoss, brier, outcomeOf, tableOf, tableLeader, TRAMOS, tramoDe, TRAMOS_K, distanciaDe,
  });
}

// Un modelo: el nombre de una referencia o la ruta de un módulo con export function predictor.
export async function cargarModelo(spec) {
  if (Object.hasOwn(REFERENCIAS, spec)) return REFERENCIAS[spec];
  const file = resolve(spec);
  const mod = await import(pathToFileURL(file).href);
  if (typeof mod.predictor !== 'function') throw new TypeError(`${spec}: el módulo no exporta function predictor`);
  if (mod.ajustar !== undefined && typeof mod.ajustar !== 'function') throw new TypeError(`${spec}: ajustar no es una función`);
  return { nombre: typeof mod.nombre === 'string' ? mod.nombre : basename(file).replace(/\.m?js$/, ''), descripcion: mod.descripcion || null, ajustar: mod.ajustar, predictor: mod.predictor };
}

/* Lo que hace el CLI con un modelo ({ nombre, ajustar?, predictor }): su ajustar (con el banco de
 * ajuste), el de `contra` (otro modelo o null) y el examen, con la diferencia frente a `contra`. */
export async function ejecutar(modelo, { split = 'evaluacion', contra = REFERENCIAS.actual, B = B_DEFECTO, semilla = SEMILLA } = {}) {
  const ajuste = modelo.ajustar ? (await modelo.ajustar(bancoDeAjuste())) ?? null : null;
  const ref = contra && contra.predictor !== modelo.predictor ? contra : null;
  if (ref && ref.ajustar) await ref.ajustar(bancoDeAjuste());
  const informe = evaluate(modelo.predictor, { split, B, semilla, referencia: ref ? ref.predictor : null, nombreReferencia: ref ? ref.nombre : null });
  return { modelo: modelo.nombre, descripcion: modelo.descripcion || null, ajuste, ...informe };
}

/* Lo mismo a varias jornadas vista (--distancia): el ajustar del modelo y el de `contra`, y evaluarDistancia
 * con la tabla, el local y, si lo hay, `contra` de referencias. */
export async function ejecutarDistancia(modelo, { split = 'evaluacion', contra = null, B = B_DEFECTO, semilla = SEMILLA } = {}) {
  const ajuste = modelo.ajustar ? (await modelo.ajustar(bancoDeAjuste())) ?? null : null;
  const ref = contra && contra.predictor !== modelo.predictor ? contra : null;
  if (ref && ref.ajustar) await ref.ajustar(bancoDeAjuste());
  const referencias = { tabla: REFERENCIAS.tabla.predictor, local: REFERENCIAS.local.predictor, ...(ref ? { [ref.nombre]: ref.predictor } : {}) };
  const informe = evaluarDistancia(modelo.predictor, { split, B, semilla, referencias });
  return { modelo: modelo.nombre, descripcion: modelo.descripcion || null, ajuste, ...informe };
}

// ── El CLI ───────────────────────────────────────────────────────────────────────────────────────────

const pct = x => (x === null ? '—' : `${(100 * x).toFixed(1)}%`);
const num = x => (x === null ? '—' : x.toFixed(3));
const ic = (a, f) => (a ? ` [${f(a[0])}, ${f(a[1])}]` : '');
const sgn = (x, f) => (x === null ? '—' : `${x > 0 ? '+' : ''}${f(x)}`);

// El resumen de un informe, en una tabla de texto.
export function resumen(inf) {
  const lines = [`${inf.modelo || 'modelo'} · ${inf.split} (${inf.temporadas.join(', ')}): ${inf.pares} partidos de ${inf.grupos} grupos, ${inf.nulos} sin pronóstico`];
  lines.push('| Tramo | Partidos | Nulos | Log-loss [IC 95 %] | Brier | Acierto 1X2 [IC 95 %] |' + (inf.frente ? ` Δ log-loss vs ${inf.frente.referencia} [IC 95 %] | pMejor |` : ''));
  lines.push('|---|---|---|---|---|---|' + (inf.frente ? '---|---|' : ''));
  for (const [t, s, d] of [...TRAMOS.map(t => [t, inf.porTramo[t], inf.frente && inf.frente.porTramo[t]]), ['Todos', inf.global, inf.frente && inf.frente.global]]) {
    if (!s.pares) continue;
    let line = `| ${t} | ${s.pares} | ${s.nulos} | ${num(s.logLoss)}${ic(s.ic95 && s.ic95.logLoss, num)} | ${num(s.brier)} | ${pct(s.acierto)}${ic(s.ic95 && s.ic95.acierto, pct)} |`;
    if (d) line += ` ${sgn(d.logLoss, x => x.toFixed(3))}${ic(d.ic95 && d.ic95.logLoss, x => x.toFixed(3))} | ${d.pMejor === null ? '—' : pct(d.pMejor)} |`;
    lines.push(line);
  }
  return lines.join('\n');
}

// El resumen de un informe de evaluarDistancia: por distancia y, debajo, cruzado con las jornadas jugadas.
// «Fiab.» es favorito − acierto (positivo, se pasa de seguro); «Δ k=1», lo que se pierde frente a la víspera.
export function resumenDistancia(inf) {
  const refs = inf.referencias || [];
  const d3 = x => x.toFixed(3);
  const pp = x => `${x > 0 ? '+' : ''}${(100 * x).toFixed(1)}`;
  const dl = d => (d && d.pares ? `${sgn(d.logLoss, d3)}${ic(d.ic95 && d.ic95.logLoss, d3)}` : '—');
  const lines = [`${inf.modelo || 'modelo'} · ${inf.split} a varias jornadas vista (${inf.temporadas.join(', ')}): ${inf.pares} pronósticos de ${inf.partidos} partidos de ${inf.grupos} grupos`];
  lines.push(`| Distancia | Jornadas | Pronósticos | Nulos | Log-loss [IC 95 %] | Brier | Acierto [IC 95 %] | Favorito | Fiab. (puntos) [IC 95 %] | Δ k=1 [IC 95 %] |${refs.map(r => ` Δ ${r} [IC 95 %] |`).join('')}`);
  lines.push(`|---|---|---|---|---|---|---|---|---|---|${refs.map(() => '---|').join('')}`);
  const rowOf = (label, j, s) => {
    if (!s.pares) return;
    const f = s.fiabilidad;
    lines.push(`| ${label} | ${j} | ${s.pares} | ${s.nulos} | ${num(s.logLoss)}${ic(s.ic95 && s.ic95.logLoss, num)} | ${num(s.brier)} | ${pct(s.acierto)}${ic(s.ic95 && s.ic95.acierto, pct)} | ${pct(s.favorito)} | ${f.diferencia === null ? '—' : pp(f.diferencia)}${ic(f.ic95, pp)} | ${dl(s.frenteK1)} |${refs.map(r => ` ${dl(s.frente[r])} |`).join('')}`);
  };
  for (const d of TRAMOS_K) rowOf(d, 'todas', inf.porDistancia[d]);
  rowOf('Todas', 'todas', inf.global);
  for (const d of TRAMOS_K) for (const c of TRAMOS_CRUCE) rowOf(d, c, inf.porDistanciaYJornadas[d][c]);
  return lines.join('\n');
}

function argsOf(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (!a.startsWith('--')) throw new Error(`argumento suelto: ${a}`);
    const key = a.slice(2);
    if (key === 'referencias' || key === 'distancia') { out[key] = true; continue; }
    if (i + 1 >= argv.length) throw new Error(`falta el valor de ${a}`);
    out[key] = argv[(i += 1)];
  }
  return out;
}

async function main(argv) {
  const a = argsOf(argv);
  const split = a.split || 'evaluacion';
  if (!SPLITS.includes(split)) throw new Error(`--split: ${split}; se aceptan ${SPLITS.join(', ')}`);
  const B = a.B === undefined ? B_DEFECTO : Number(a.B);
  const semilla = a.semilla === undefined ? SEMILLA : Number(a.semilla);
  if (!Number.isInteger(B) || B < 0 || !Number.isInteger(semilla)) throw new Error('--B y --semilla: enteros');
  let out;
  if (a.distancia) {
    const modelo = await cargarModelo(a.modelo || 'web');
    const contra = !a.contra || a.contra === 'ninguno' ? null : await cargarModelo(a.contra);
    out = await ejecutarDistancia(modelo, { split, B, semilla, contra });
    console.error(`\n${resumenDistancia(out)}`);
  } else if (a.referencias) {
    const referencias = {};
    for (const name of Object.keys(REFERENCIAS)) {
      const inf = await ejecutar(REFERENCIAS[name], { split, B, semilla, contra: REFERENCIAS.actual });
      referencias[name] = inf;
      console.error(`\n${resumen(inf)}`);
    }
    out = { split, frecuenciasAjuste: frecuenciasAjuste(), referencias };
  } else {
    if (!a.modelo) throw new Error('falta --modelo <fichero.mjs | actual | web | poisson | local | tabla> (o --referencias)');
    const modelo = await cargarModelo(a.modelo);
    const contra = a.contra === 'ninguno' ? null : await cargarModelo(a.contra || 'actual');
    out = await ejecutar(modelo, { split, B, semilla, contra });
    console.error(`\n${resumen(out)}`);
  }
  const text = `${JSON.stringify(out, null, 2)}\n`;
  if (a.salida) { writeFileSync(a.salida, text); console.error(`\nInforme: ${a.salida}`); } else process.stdout.write(text);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main(process.argv.slice(2)).catch(err => { console.error(`pronostico_banco: ${err.message}`); process.exit(1); });
}
