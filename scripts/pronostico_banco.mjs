// Banco de pruebas del pronóstico de prebenjamín (17/10/2026): el mismo examen para cualquier modelo.
//
//   node scripts/pronostico_banco.mjs --modelo <fichero.mjs> [--split evaluacion|ajuste|todas]
//                                     [--contra actual|web|poisson|local|tabla|<fichero.mjs>|ninguno]
//                                     [--B 2000] [--semilla 17102026] [--salida informe.json]
//   node scripts/pronostico_banco.mjs --modelo tabla          una de las referencias, por su nombre
//   node scripts/pronostico_banco.mjs --referencias           las cinco referencias, frente a «actual»
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
//   · info: { temporada, grupo, jornadas, tramo } (jornadas: las del entrenamiento; tramo: '1'…'7+').
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
// Desde otro script: import { evaluate, ejecutar, cargarModelo, pares, REFERENCIAS } from
// './pronostico_banco.mjs'; evaluate(predictor, { split, B, semilla, referencia }) da el informe (sin
// llamar a ningún ajustar) y ejecutar(modelo, { split, contra }) hace lo del CLI (ajustar y examen).
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
import { PARAMS, copiedMatches, forecastApplies, forecastMatch, isDeskResult, offVenue, outcome, trainingFor } from '../src/pronostico.js';

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
 * tramo, status }]. m es el partido con su marcador (el del archivo); match, su copia congelada sin él
 * (la que recibe el predictor); training, congelado; status, el model.matchStatus de la temporada (null en
 * las pasadas). `statusOf(season)` da el status de cada temporada (el backtest se lo pasa a 2026-27). */
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
        }));
      }
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
function resamples(C, B, seed) {
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
function quantile(values, q) {
  const v = [...values].sort((x, y) => x - y);
  if (!v.length) return null;
  const pos = (v.length - 1) * q, lo = Math.floor(pos), hi = Math.ceil(pos);
  return v[lo] + (v[hi] - v[lo]) * (pos - lo);
}
const r6 = x => (x === null || x === undefined || !Number.isFinite(x) ? null : Math.round(x * 1e6) / 1e6);

// Sumas por grupo y tramo: { [tramo | 'global']: Float64Array(C) por campo }.
function sums(C, fields) {
  const out = {};
  for (const t of ['global', ...TRAMOS]) out[t] = Object.fromEntries(fields.map(f => [f, new Float64Array(C)]));
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
    const info = Object.freeze({ temporada: pair.temporada, grupo: pair.grupo, jornadas: pair.jornadas, tramo: pair.tramo });
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
// Infinity, escrito como tal (JSON lo deja en null).
export const show = params => JSON.stringify(params, (k, v) => (v === Infinity ? 'Infinity' : v));
const asJSON = params => JSON.parse(show(params));

export const REFERENCIAS = Object.freeze({
  actual: Object.freeze({
    nombre: 'actual',
    descripcion: 'src/pronostico.js con PARAMS (las notas de Massey), desde la primera jornada y con equipos sin partidos (minRounds 1, minPlayed 0)',
    ajustar: () => ({ params: asJSON(EVAL_PARAMS) }),
    predictor: (training, match, group) => fromForecast(forecastMatch(group, match, { prueba: true, params: EVAL_PARAMS })),
  }),
  web: Object.freeze({
    nombre: 'web',
    descripcion: 'src/pronostico.js con PARAMS tal cual (minRounds 2, minPlayed 1): lo que enseña la web',
    ajustar: () => ({ params: asJSON(PARAMS) }),
    predictor: (training, match, group) => fromForecast(forecastMatch(group, match, { prueba: true, params: PARAMS })),
  }),
  poisson: Object.freeze({
    nombre: 'poisson',
    descripcion: 'el 1X2 del Poisson de los goles de src/pronostico.js (el de la web hasta el 17/10/2026), desde la primera jornada',
    ajustar: () => ({ params: asJSON(EVAL_PARAMS) }),
    predictor: (training, match, group) => {
      const f = forecastMatch(group, match, { prueba: true, params: EVAL_PARAMS });
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
    logLoss, brier, outcomeOf, tableOf, tableLeader, TRAMOS, tramoDe,
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

function argsOf(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (!a.startsWith('--')) throw new Error(`argumento suelto: ${a}`);
    const key = a.slice(2);
    if (key === 'referencias') { out.referencias = true; continue; }
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
  if (a.referencias) {
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
