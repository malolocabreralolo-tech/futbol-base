// Backtest del pronóstico de prebenjamín (src/pronostico.js, 17/10/2026).
//
//   node scripts/backtest_pronostico.mjs              la tabla con los PARAMS del módulo
//   node scripts/backtest_pronostico.mjs --calibrar   además, la búsqueda de las variantes y sus parámetros
//                                                     y la de la amortiguación de las goleadas (unos nueve
//                                                     minutos; la tabla sola, unos cuatro segundos)
//
// Importa el MISMO src/pronostico.js que la web, con `prueba: true` (solo aquí: abre el pronóstico a
// las temporadas pasadas de prebenjamín) y, en la calibración, `params`. Cada temporada va por separado y
// cada partido se pronostica solo con las jornadas anteriores de su misma temporada (trainingFor: los de
// otra jornada jugados antes de su día), como lo vería la web la víspera. Nada de una temporada entra en
// otra. Los objetivos son los partidos de liga (o de liguilla de copa) con fecha y marcador, sin
// retirados ni resultados de mesa (los mismos filtros que el entrenamiento). Aparte, las jornadas ya
// jugadas de 2026-27, con sus estados de la app de futbolaspalmas (model.matchStatus), como en la web.
//
// Métricas, por jornadas jugadas del grupo (las de la nota «según N jornadas»: 1, 2, 3, 4-6, 7+):
// acierto del 1X2 (el desenlace más probable), log-loss y Brier del 1X2, frente a dos líneas base: «el
// local» (siempre gana el local; sus probabilidades, las frecuencias del archivo) y «la tabla» (gana el
// mejor clasificado con esos mismos partidos: puntos, diferencia y goles; con las frecuencias del archivo
// para el mejor, el empate y el peor, medidas sobre el propio archivo, que le favorece); y el acierto del
// marcador exacto y a ±1 gol por equipo del resultado más probable. Sin red ni escrituras: solo lee los
// data-*.js del repositorio.
import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
import { buildSeason, createModel, retiredTeams } from '../src/model.js';
import { PARAMS, copiedMatches, forecastApplies, forecastMatch, isDeskResult, offVenue, trainingFor } from '../src/pronostico.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const CURRENT = '2026-2027';

// Los `const NOMBRE = …` de un data-*.js, sin el navegador.
function loadGlobals(file, names) {
  const ctx = {};
  vm.createContext(ctx);
  const probe = names.map(n => `${n}: typeof ${n} !== 'undefined' ? ${n} : undefined`).join(', ');
  vm.runInContext(`${readFileSync(join(ROOT, file), 'utf8')}\n;globalThis.__out = { ${probe} };`, ctx);
  return ctx.__out;
}

function pastSeasons() {
  return readdirSync(ROOT).filter(f => /^data-season-\d{4}-\d{4}\.js$/.test(f)).sort().map(f => {
    const name = f.slice('data-season-'.length, -'.js'.length);
    const raw = loadGlobals(f, [`SEASON_${name.replace('-', '_')}`])[`SEASON_${name.replace('-', '_')}`];
    return buildSeason({ name, current: false, prebenjamin: raw.prebenjamin || [] });
  }).filter(s => s.name !== CURRENT);
}

function currentSeason() {
  const { PREBENJAMIN } = loadGlobals('data-prebenjamin.js', ['PREBENJAMIN']);
  const { HISTORY, ESTADOS } = loadGlobals('data-history.js', ['HISTORY', 'ESTADOS']);
  const model = createModel({ prebenjamin: PREBENJAMIN, benjamin: [], history: HISTORY, estados: ESTADOS },
    { portalSeason: CURRENT });
  return { season: model.season(CURRENT), status: m => model.matchStatus(m) };
}

const outcomeOf = (h, a) => (h > a ? 'home' : h < a ? 'away' : 'draw');
const BUCKETS = [['1', n => n === 1], ['2', n => n === 2], ['3', n => n === 3], ['4-6', n => n >= 4 && n <= 6], ['7+', n => n >= 7]];
const bucketOf = n => (BUCKETS.find(([, f]) => f(n)) || ['0'])[0];

// Los objetivos de un grupo: partidos de liga con fecha y marcador, sin retirados, copias de la
// importación (copiedMatches) ni estados de fuera, y sin lo que seguro es de mesa: el campo «EXCLUIDO» o
// «SUSPENDIDO» y los 3-0 y 1-0 sin hora. Los 3-0 y 1-0 con hora, que el entrenamiento deja fuera ante la
// duda (isDeskResult), aquí sí cuentan: casi todos son de verdad, y quitarlos dejaría el examen sin los
// partidos cerrados. Cada uno se pronostica con su copia sin marcador.
const deskForSure = m => offVenue(m) || (isDeskResult(m) && !m.time);
function targets(group, status) {
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
function tableOf(matches) {
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
function tableLeader(table, m) {
  const h = table.get(m.home) || [0, 0, 0], a = table.get(m.away) || [0, 0, 0];
  for (let i = 0; i < 3; i += 1) if (h[i] !== a[i]) return h[i] > a[i] ? 'home' : 'away';
  return null;
}

// Todos los pronósticos de un conjunto de temporadas: [{ season, group, m, f, leader, bucket }].
function collect(seasons, params, statusOf = () => null) {
  const rows = [];
  for (const season of seasons) {
    const status = statusOf(season);
    for (const group of season.groups) {
      if (!forecastApplies(group, { prueba: true })) continue;
      for (const m of targets(group, status)) {
        const f = forecastMatch(group, { ...m, hs: null, as: null }, { prueba: true, params, status });
        if (!f) continue;
        const leader = tableLeader(tableOf(trainingFor(group, m, { status })), m);
        rows.push({ season: season.name, group: group.id, m, f, leader, bucket: bucketOf(f.rounds) });
      }
    }
  }
  return rows;
}

const EPS = 1e-15;
const logLoss = (p, y) => -Math.log(Math.max(EPS, p[y]));
const brier = (p, y) => ['home', 'draw', 'away'].reduce((s, o) => s + (p[o] - (o === y ? 1 : 0)) ** 2, 0);
const probsOf = f => ({ home: f.pHome, draw: f.pDraw, away: f.pAway });

// Las frecuencias del archivo: del local, el empate y el visitante, y del mejor clasificado, el empate y
// el peor (cuando uno va por delante).
function baseRates(rows) {
  const c = { home: 0, draw: 0, away: 0 }, l = { better: 0, draw: 0, worse: 0 };
  for (const { m, leader } of rows) {
    const y = outcomeOf(m.hs, m.as);
    c[y] += 1;
    if (leader) l[y === 'draw' ? 'draw' : y === leader ? 'better' : 'worse'] += 1;
  }
  const n = rows.length, nl = l.better + l.draw + l.worse;
  return {
    home: { home: c.home / n, draw: c.draw / n, away: c.away / n },
    leader: { better: l.better / nl, draw: l.draw / nl, worse: l.worse / nl },
  };
}
function tableProbs(leader, rates) {
  if (!leader) return rates.home;
  const { better, draw, worse } = rates.leader;
  return leader === 'home' ? { home: better, draw, away: worse } : { home: worse, draw, away: better };
}

function metrics(rows, rates) {
  const s = { n: rows.length, acc: 0, accHome: 0, accTable: 0, ll: 0, llHome: 0, llTable: 0, br: 0, brHome: 0, brTable: 0, exact: 0, near: 0 };
  for (const { m, f, leader } of rows) {
    const y = outcomeOf(m.hs, m.as);
    const p = probsOf(f), ph = rates.home, pt = tableProbs(leader, rates);
    s.acc += f.pick === y; s.accHome += y === 'home'; s.accTable += (leader || 'home') === y;
    s.ll += logLoss(p, y); s.llHome += logLoss(ph, y); s.llTable += logLoss(pt, y);
    s.br += brier(p, y); s.brHome += brier(ph, y); s.brTable += brier(pt, y);
    s.exact += f.score[0] === m.hs && f.score[1] === m.as;
    s.near += Math.abs(f.score[0] - m.hs) <= 1 && Math.abs(f.score[1] - m.as) <= 1;
  }
  for (const k of Object.keys(s)) if (k !== 'n') s[k] /= Math.max(1, rows.length);
  return s;
}

const pct = x => `${(100 * x).toFixed(1)}%`;
const num = x => x.toFixed(3);
function printTable(title, rows, rates) {
  console.log(`\n## ${title}\n`);
  console.log('| Jornadas jugadas | Partidos | 1X2 modelo | 1X2 local | 1X2 tabla | Log-loss modelo | local | tabla | Brier modelo | local | tabla | Exacto | ±1 gol |');
  console.log('|---|---|---|---|---|---|---|---|---|---|---|---|---|');
  const groups = [...BUCKETS.map(([b]) => [b, rows.filter(r => r.bucket === b)]), ['Todas', rows]];
  for (const [b, rs] of groups) {
    if (!rs.length) continue;
    const s = metrics(rs, rates);
    console.log(`| ${b} | ${s.n} | ${pct(s.acc)} | ${pct(s.accHome)} | ${pct(s.accTable)} | ${num(s.ll)} | ${num(s.llHome)} | ${num(s.llTable)} | ${num(s.br)} | ${num(s.brHome)} | ${num(s.brTable)} | ${pct(s.exact)} | ${pct(s.near)} |`);
  }
}

// Calibración: con el desenlace elegido, la probabilidad que le da el modelo frente a lo que pasa, por
// jornadas jugadas (la regla de cuándo se muestra sale de aquí y de la tabla).
function printCalibration(rows) {
  console.log('\n## Calibración del desenlace elegido (temporadas pasadas)\n');
  console.log('| Jornadas jugadas | Probabilidad del elegido | Partidos | Media prevista | Acierto real |');
  console.log('|---|---|---|---|---|');
  const edges = [0, 0.5, 0.6, 0.7, 0.8, 0.9, 1.0001];
  const parts = [['1', r => r.bucket === '1'], ['2', r => r.bucket === '2'], ['3 o más', r => !['1', '2'].includes(r.bucket)]];
  for (const [label, keep] of parts) {
    for (let i = 0; i < edges.length - 1; i += 1) {
      const rs = rows.filter(keep).filter(({ f }) => { const p = probsOf(f)[f.pick]; return p >= edges[i] && p < edges[i + 1]; });
      if (!rs.length) continue;
      const mean = rs.reduce((s, { f }) => s + probsOf(f)[f.pick], 0) / rs.length;
      const hit = rs.filter(({ m, f }) => outcomeOf(m.hs, m.as) === f.pick).length / rs.length;
      console.log(`| ${label} | ${pct(edges[i])}–${pct(Math.min(1, edges[i + 1]))} | ${rs.length} | ${pct(mean)} | ${pct(hit)} |`);
    }
  }
}

// El empate: lo que dice el modelo y lo que pasa (Poisson lo sobrestima un poco en prebenjamín).
function printDraws(rows) {
  const n = rows.length;
  const pd = rows.reduce((s, { f }) => s + f.pDraw, 0) / n;
  const d = rows.filter(({ m }) => m.hs === m.as).length / n;
  const xh = rows.reduce((s, { f }) => s + f.xgHome, 0) / n, xa = rows.reduce((s, { f }) => s + f.xgAway, 0) / n;
  const gh = rows.reduce((s, { m }) => s + m.hs, 0) / n, ga = rows.reduce((s, { m }) => s + m.as, 0) / n;
  console.log(`\nEmpate previsto ${pct(pd)} frente a ${pct(d)} real; goles esperados ${xh.toFixed(2)}-${xa.toFixed(2)} frente a ${gh.toFixed(2)}-${ga.toFixed(2)} reales.`);
}

// Los goles esperados frente a los reales, por tramos de lo esperado (cada equipo de cada partido): la
// amortiguación de las goleadas (soften) sale de aquí.
function printGoals(rows) {
  console.log('\n## Goles esperados frente a reales, por tramos (temporadas pasadas)\n');
  console.log('| Esperados | Equipos | Media esperada | Media real |');
  console.log('|---|---|---|---|');
  const edges = [0, 2, 4, 6, 8, 10, 12, 15, 20, Infinity];
  for (let i = 0; i < edges.length - 1; i += 1) {
    const xs = rows.flatMap(({ m, f }) => [[f.xgHome, m.hs], [f.xgAway, m.as]]).filter(([x]) => x >= edges[i] && x < edges[i + 1]);
    if (!xs.length) continue;
    const mean = k => (xs.reduce((s, x) => s + x[k], 0) / xs.length).toFixed(2);
    console.log(`| ${edges[i]}–${edges[i + 1] === Infinity ? '…' : edges[i + 1]} | ${xs.length} | ${mean(0)} | ${mean(1)} |`);
  }
}

// Los partidos con algún equipo aún sin partidos que cuenten (minPlayed), desde 2 jornadas jugadas.
function printFresh(rows, rates) {
  console.log('\n## Desde 2 jornadas jugadas, por partidos del equipo que menos lleva\n');
  console.log('| Partidos del que menos | Partidos | 1X2 modelo | 1X2 tabla | Log-loss modelo | tabla |');
  console.log('|---|---|---|---|---|---|');
  for (const [label, keep] of [['0', n => n === 0], ['1', n => n === 1], ['2 o más', n => n >= 2]]) {
    const rs = rows.filter(({ f }) => f.rounds >= 2 && keep(Math.min(f.playedHome, f.playedAway)));
    if (!rs.length) continue;
    const s = metrics(rs, rates);
    console.log(`| ${label} | ${s.n} | ${pct(s.acc)} | ${pct(s.accTable)} | ${num(s.ll)} | ${num(s.llTable)} |`);
  }
}

function printSeasons(rows, rates) {
  console.log('\n## Por temporada (todas las jornadas)\n');
  console.log('| Temporada | Partidos | 1X2 modelo | 1X2 tabla | Log-loss modelo | local | tabla |');
  console.log('|---|---|---|---|---|---|---|');
  for (const name of [...new Set(rows.map(r => r.season))]) {
    const s = metrics(rows.filter(r => r.season === name), rates);
    console.log(`| ${name} | ${s.n} | ${pct(s.acc)} | ${pct(s.accTable)} | ${num(s.ll)} | ${num(s.llHome)} | ${num(s.llTable)} |`);
  }
}

// ── Calibración de las variantes (--calibrar) ─────────────────────────────────────────────────────
// Cada variante, por descenso por coordenadas sobre una rejilla, minimizando el log-loss de todas las
// temporadas pasadas (todas las jornadas con pronóstico). Sin minRounds: se mide desde la primera.
// Empatan dos variantes a menos de TIE de log-loss (una milésima: la décima parte de lo que separa
// una contracción de 1,5 de una de 3).
const TIE = 0.001;
function calibrate(seasons) {
  const loss = params => {
    const rows = collect(seasons, { ...params, minRounds: 1, minPlayed: 0 });
    return rows.reduce((s, { m, f }) => s + logLoss(probsOf(f), outcomeOf(m.hs, m.as)), 0) / rows.length;
  };
  const GRID = {
    shrink: [0.25, 0.5, 0.75, 1, 1.5, 2, 3, 4, 6, 8],
    home: [1, 1.02, 1.04, 1.06, 1.08, 1.1, 1.15, 1.2],
    size: [2, 3, 4, 6, 8, 12, 20, 40],
    cap: [6, 8, 10, 12, 15],
  };
  const VARIANTS = [
    ['Poisson con contracción', { shrink: 2, home: 1.06, size: Infinity, cap: Infinity, soften: Infinity }, ['shrink', 'home']],
    ['Binomial negativa (sobredispersión)', { shrink: 2, home: 1.06, size: 6, cap: Infinity, soften: Infinity }, ['shrink', 'home', 'size']],
    ['Poisson con tope de goles al ajustar', { shrink: 2, home: 1.06, size: Infinity, cap: 10, soften: Infinity }, ['shrink', 'home', 'cap']],
    ['Binomial negativa con tope', { shrink: 2, home: 1.06, size: 6, cap: 10, soften: Infinity }, ['shrink', 'home', 'size', 'cap']],
  ];
  console.log('\n## Calibración de las variantes (log-loss del 1X2, temporadas pasadas)\n');
  const results = [];
  for (const [name, start, keys] of VARIANTS) {
    let best = { ...start }, bestLoss = loss(best);
    for (let pass = 0; pass < 3; pass += 1) {
      let moved = false;
      for (const key of keys) {
        for (const v of GRID[key]) {
          if (v === best[key]) continue;
          const l = loss({ ...best, [key]: v });
          if (l < bestLoss - 1e-9) { bestLoss = l; best = { ...best, [key]: v }; moved = true; }
        }
      }
      if (!moved) break;
    }
    results.push({ name, best, bestLoss });
    console.log(`- ${name}: log-loss ${bestLoss.toFixed(4)} con ${show(best)}`);
  }
  // Las variantes van de la más sencilla a la más compleja: gana la primera a menos de TIE del mejor.
  const top = Math.min(...results.map(r => r.bestLoss));
  const chosen = results.find(r => r.bestLoss - top < TIE);
  console.log(`\nElegida (la más sencilla a menos de ${TIE} del mejor log-loss): ${chosen.name}, ${show(chosen.best)}.`);
  calibrateSoften(seasons);
  return results;
}

// La amortiguación de los goles esperados por encima de `soften` (pronostico.js): casi no mueve el
// log-loss del 1X2 (las goleadas ya están por encima del 99 %), así que se elige con la contracción y el
// campo de PARAMS (los de la web) por el error de los goles esperados (raíz del error cuadrático medio,
// por equipo y partido); a menos de una milésima del mejor, la que menos toca (la de umbral más alto).
function calibrateSoften(seasons, base = PARAMS) {
  console.log('\n## Amortiguación de los goles esperados (soften)\n');
  console.log('| soften | Log-loss 1X2 | Error de los goles | Exacto | ±1 gol |');
  console.log('|---|---|---|---|---|');
  const out = [];
  for (const soften of [Infinity, 15, 12, 10, 9, 8, 7, 6]) {
    const rows = collect(seasons, { ...base, soften, minRounds: 1, minPlayed: 0 });
    const ll = rows.reduce((s, { m, f }) => s + logLoss(probsOf(f), outcomeOf(m.hs, m.as)), 0) / rows.length;
    const rmse = Math.sqrt(rows.reduce((s, { m, f }) => s + (f.xgHome - m.hs) ** 2 + (f.xgAway - m.as) ** 2, 0) / (2 * rows.length));
    const s = metrics(rows, baseRates(rows));
    out.push({ soften, rmse });
    console.log(`| ${soften} | ${ll.toFixed(4)} | ${rmse.toFixed(3)} | ${pct(s.exact)} | ${pct(s.near)} |`);
  }
  const best = Math.min(...out.map(r => r.rmse));
  console.log(`\nElegida: soften ${out.find(r => r.rmse - best < 0.001).soften}.`);
}

// Infinity, escrito como tal (JSON lo deja en null).
const show = params => JSON.stringify(params, (k, v) => (v === Infinity ? 'Infinity' : v));

const seasons = pastSeasons();
if (process.argv.includes('--calibrar')) calibrate(seasons);

// Las tablas, desde la primera jornada jugada: la regla de minRounds se decide con ellas.
const EVAL = { ...PARAMS, minRounds: 1, minPlayed: 0 };
const past = collect(seasons, EVAL);
const rates = baseRates(past);
console.log(`\nPARAMS: ${show(PARAMS)} (las tablas, desde 1 jornada jugada y con equipos sin partidos; la web, desde ${PARAMS.minRounds} y con ${PARAMS.minPlayed} partido de cada uno)`);
console.log(`Archivo: ${past.length} partidos pronosticados de ${new Set(past.map(r => `${r.season} ${r.group}`)).size} grupos de prebenjamín en ${new Set(past.map(r => r.season)).size} temporadas.`);
console.log(`Frecuencias del archivo: local ${pct(rates.home.home)}, empate ${pct(rates.home.draw)}, visitante ${pct(rates.home.away)}; mejor clasificado ${pct(rates.leader.better)}, empate ${pct(rates.leader.draw)}, peor ${pct(rates.leader.worse)}.`);
printTable('Temporadas pasadas de prebenjamín', past, rates);
printDraws(past);
printGoals(past);
printFresh(past, rates);
printSeasons(past, rates);
printCalibration(past);

const { season: cur, status } = currentSeason();
const now = collect([cur], EVAL, () => status);
printTable(`${CURRENT} (jornadas ya jugadas)`, now, rates);
