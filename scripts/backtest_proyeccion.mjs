// Backtest del pronóstico de la clasificación final de prebenjamín (src/proyeccion.js, 19/10/2026).
//
//   node scripts/backtest_proyeccion.mjs                  las tablas, con SIM de src/proyeccion.js
//   node scripts/backtest_proyeccion.mjs --calibrar       además, la busca de la masa del abanico (fan) con
//                                                         las temporadas de AJUSTE
//   opciones: --sims N (las simulaciones de cada proyección; por defecto, las de la web), --B 2000
//             (remuestras del bootstrap), --json fichero (los casos y el resumen, en JSON)
//
// Sin red ni escrituras (salvo --json): solo lee los data-season-*.js del repositorio, con la carga del
// banco de pruebas del pronóstico (scripts/pronostico_banco.mjs: pastSeasons, las temporadas de AJUSTE,
// 2013-14 a 2020-21, y de EVALUACIÓN, 2021-22 a 2025-26, y sus remuestras por temporada-grupo).
//
// EL EXAMEN: cada grupo de liga de prebenjamín de las temporadas pasadas, en cuatro cortes: tras 2, 4 y 6
// jornadas y a mitad de temporada (la mitad de las jornadas con fecha, hacia abajo). Las jornadas van en
// el orden de su fecha (la mediana de las de sus partidos, como roundsAhead de src/pronostico.js), y el
// corte tras N es el día de la jornada N + 1: lo jugado, todo partido con marcador de antes de ese día (o,
// sin fecha, de antes de la de su jornada). Con SOLO eso:
// - la proyección de la web (projection de src/proyeccion.js, el MISMO código: el pronóstico de cada
//   partido con `before`, el corte, y la simulación), partiendo de la clasificación de ese momento
//   calculada con el calendario (la de la web no se guardó: es la de la federación de cada día). Cuentan
//   todos los resultados, también los de mesa, como en la oficial, salvo las copias de la importación;
// - la referencia ingenua: el puesto en esa misma clasificación, por puntos, diferencia de goles y goles a
//   favor (y, si aún así empatan, por el nombre).
// Se comparan con la clasificación final real (la del archivo, en su orden). Los equipos, los de esa
// clasificación final sin retirados (retiredTeams de src/model.js, con toda la temporada: un retirado no
// entra ni en la proyección ni en la referencia; sus partidos no cuentan para nadie). Un grupo con algún
// equipo de la tabla sin calendario, o con menos de tres, no entra; un corte sin las jornadas mínimas de la
// web (PARAMS.minRounds) o sin nada por jugar, tampoco.
//
// LAS MÉTRICAS, por corte y por parte (AJUSTE y EVALUACIÓN), con cada equipo de cada grupo un caso: el
// error medio absoluto del puesto (MAE), el % de puestos exactos y el % a ±1, del modelo y de la
// referencia, y la diferencia pareada modelo − referencia, con IC 95 % por bootstrap de temporada-grupo
// (B remuestras con la semilla del banco, percentiles 2,5 y 97,5; los equipos de un grupo no son
// independientes). Y el abanico: la parte de los casos en que el puesto real cae dentro (debería ser ~80 %
// si «8 de cada 10» es verdad), su anchura media y la masa media que reúne en las simulaciones. Con
// --calibrar, antes, la κ de la masa del abanico (fanMass de src/proyeccion.js) con SOLO AJUSTE; y al final,
// EVALUACIÓN con la masa fija de 0,80, la de antes de calibrar. Las cifras del 19/10/2026 (2.000
// simulaciones, unos 4 s), en la cabecera de src/proyeccion.js.
import { writeFileSync } from 'node:fs';
import { retiredTeams } from '../src/model.js';
import { PARAMS, copiedMatches, forecastApplies } from '../src/pronostico.js';
import { SIM, fanMass, fanOf, projection } from '../src/proyeccion.js';
import { B_DEFECTO, SEMILLA, TEMPORADAS, pastSeasons, quantile, resamples } from './pronostico_banco.mjs';

const CUTS = [['tras 2', 2], ['tras 4', 4], ['tras 6', 6], ['mitad', null]];
const scored = m => m.hs != null && m.as != null;
const byName = (a, b) => a.localeCompare(b, 'es');

// La fecha de cada jornada (la mediana de las de sus partidos; con un número par, la primera de las dos
// del medio): la de roundsAhead de src/pronostico.js.
function roundDates(group) {
  const out = new Map();
  for (const round of group.rounds || []) {
    const dates = round.matches.map(m => m.dateISO).filter(Boolean).sort();
    if (dates.length) out.set(round.key, dates[Math.floor((dates.length - 1) / 2)]);
  }
  return out;
}

// Los casos de un grupo: { skip } o { cases, cuts }; cada caso, un equipo en un corte: { cut, rounds (las
// jornadas jugadas que cuentan, playedRounds), team, real, model y naive (el puesto final real, el
// pronosticado y el de la tabla del corte), probs (la de cada puesto en las simulaciones), teams }.
function groupCases(group, { sims, seed }) {
  const retired = retiredTeams(group);
  const copies = copiedMatches(group);
  const final = (group.standings || []).filter(r => !retired.has(r.team));
  if (final.length < 3) return { skip: 'menos de tres equipos' };
  const inCalendar = new Set((group.rounds || []).flatMap(r => r.matches.flatMap(m => [m.home, m.away])));
  if (final.some(r => !inCalendar.has(r.team))) return { skip: 'equipos de la tabla sin calendario' };
  const real = new Map(final.map((r, i) => [r.team, i + 1]));
  const dates = roundDates(group);
  const ordered = [...dates].sort((a, b) => (a[1] < b[1] ? -1 : a[1] > b[1] ? 1 : 0));
  const dateOf = m => m.dateISO || dates.get(m.roundKey) || null;
  const cases = [];
  const cuts = [];
  for (const [label, fixed] of CUTS) {
    const n = fixed ?? Math.floor(ordered.length / 2);
    if (n < 1 || n >= ordered.length) continue;
    const before = ordered[n][1];
    const played = m => scored(m) && dateOf(m) !== null && dateOf(m) < before;
    const table = new Map(final.map(r => [r.team, { team: r.team, pts: 0, gf: 0, gc: 0 }]));
    for (const round of group.rounds) {
      for (const m of round.matches) {
        if (!played(m) || copies.has(m) || !table.has(m.home) || !table.has(m.away)) continue;
        const h = table.get(m.home), a = table.get(m.away);
        h.gf += m.hs; h.gc += m.as; a.gf += m.as; a.gc += m.hs;
        h.pts += m.hs > m.as ? 3 : m.hs === m.as ? 1 : 0;
        a.pts += m.as > m.hs ? 3 : m.hs === m.as ? 1 : 0;
      }
    }
    const start = [...table.values()];
    const proj = projection(group, { start, played, before, prueba: true, sims, seed });
    if (!proj) { cuts.push({ cut: label, skip: true }); continue; }
    const naive = [...start].sort((a, b) => b.pts - a.pts || (b.gf - b.gc) - (a.gf - a.gc) || b.gf - a.gf || byName(a.team, b.team));
    const naivePos = new Map(naive.map((r, i) => [r.team, i + 1]));
    cuts.push({ cut: label, skip: false, rounds: proj.rounds, matches: proj.matches });
    for (const row of proj.rows) {
      cases.push({ cut: label, rounds: proj.rounds, team: row.team, real: real.get(row.team), model: row.pos, naive: naivePos.get(row.team), probs: row.probs, teams: final.length });
    }
  }
  return { cases, cuts };
}

// Las sumas por grupo de unos casos (con su fan): n, error del modelo y de la referencia, exactos, a ±1 y
// el abanico (dentro, anchura, masa).
const FIELDS = ['n', 'em', 'en', 'xm', 'xn', 'cm', 'cn', 'in', 'width', 'mass'];
function sumsOf(cases, claves, fan) {
  const C = claves.length;
  const idx = new Map(claves.map((k, i) => [k, i]));
  const S = Object.fromEntries(FIELDS.map(f => [f, new Float64Array(C)]));
  for (const c of cases) {
    const g = idx.get(c.clave);
    const f = fanOf(c.probs, c.model, fan(c.rounds));
    S.n[g] += 1;
    S.em[g] += Math.abs(c.model - c.real); S.en[g] += Math.abs(c.naive - c.real);
    S.xm[g] += c.model === c.real; S.xn[g] += c.naive === c.real;
    S.cm[g] += Math.abs(c.model - c.real) <= 1; S.cn[g] += Math.abs(c.naive - c.real) <= 1;
    S.in[g] += c.real >= f.lo && c.real <= f.hi; S.width[g] += f.hi - f.lo + 1; S.mass[g] += f.mass;
  }
  return S;
}
const total = a => a.reduce((s, x) => s + x, 0);
// El cociente de dos sumas (o de su diferencia) y su IC 95 % con las remuestras W.
function ratioCI(num, den, W) {
  const point = total(num) / total(den);
  const vals = [];
  for (const w of W) {
    let n = 0, d = 0;
    for (let c = 0; c < w.length; c += 1) if (w[c]) { n += w[c] * num[c]; d += w[c] * den[c]; }
    if (d > 0) vals.push(n / d);
  }
  return { point, ic: vals.length ? [quantile(vals, 0.025), quantile(vals, 0.975)] : null };
}
const minus = (a, b) => a.map((x, i) => x - b[i]);

const f2 = x => x.toFixed(2).replace('.', ',');
const pc = x => `${(100 * x).toFixed(1).replace('.', ',')} %`;
const sg = (x, f) => (x > 0 ? `+${f(x)}` : x < 0 ? `−${f(-x)}` : f(0));
const ci = (r, f, signed = false) => {
  const v = x => (signed ? sg(x, f) : f(x));
  return r.ic ? `${v(r.point)} [${v(r.ic[0])}, ${v(r.ic[1])}]` : v(r.point);
};
const pts = x => `${(100 * x).toFixed(1).replace('.', ',')}`;

function report(title, cases, { B, fan, label }) {
  console.log(`\n## ${title} (abanico: ${label})\n`);
  console.log('| Corte | Grupos | Equipos | Error medio: modelo | tabla | Δ modelo − tabla | Exacto: modelo | tabla | Δ (puntos) | A ±1: modelo | tabla | Δ (puntos) |');
  console.log('|---|---|---|---|---|---|---|---|---|---|---|---|');
  const rows = [];
  for (const [cut] of [...CUTS, ['todos']]) {
    const cs = cut === 'todos' ? cases : cases.filter(c => c.cut === cut);
    if (!cs.length) continue;
    const claves = [...new Set(cs.map(c => c.clave))];
    const S = sumsOf(cs, claves, fan);
    const W = resamples(claves.length, B, SEMILLA);
    const r = {
      cut, grupos: claves.length, equipos: total(S.n),
      em: ratioCI(S.em, S.n, W), en: ratioCI(S.en, S.n, W), de: ratioCI(minus(S.em, S.en), S.n, W),
      xm: ratioCI(S.xm, S.n, W), xn: ratioCI(S.xn, S.n, W), dx: ratioCI(minus(S.xm, S.xn), S.n, W),
      cm: ratioCI(S.cm, S.n, W), cn: ratioCI(S.cn, S.n, W), dc: ratioCI(minus(S.cm, S.cn), S.n, W),
      in: ratioCI(S.in, S.n, W), width: total(S.width) / total(S.n), mass: total(S.mass) / total(S.n),
    };
    rows.push(r);
    console.log(`| ${cut} | ${r.grupos} | ${r.equipos} | ${ci(r.em, f2)} | ${ci(r.en, f2)} | ${ci(r.de, f2, true)} | ${ci(r.xm, pc)} | ${ci(r.xn, pc)} | ${ci(r.dx, pts, true)} | ${ci(r.cm, pc)} | ${ci(r.cn, pc)} | ${ci(r.dc, pts, true)} |`);
  }
  console.log('\n| Corte | Abanico: el real, dentro | Anchura media (puestos) | Masa media en las simulaciones |');
  console.log('|---|---|---|---|');
  for (const r of rows) console.log(`| ${r.cut} | ${ci(r.in, pc)} | ${f2(r.width)} | ${pc(r.mass)} |`);
  return rows;
}

function argsOf(argv) {
  const out = { sims: SIM.sims, B: B_DEFECTO, calibrar: false, json: null };
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === '--sims') out.sims = Number(argv[++i]);
    else if (argv[i] === '--B') out.B = Number(argv[++i]);
    else if (argv[i] === '--calibrar') out.calibrar = true;
    else if (argv[i] === '--json') out.json = argv[++i];
    else throw new Error(`backtest_proyeccion: opción desconocida ${argv[i]}`);
  }
  return out;
}

const args = argsOf(process.argv.slice(2));
const started = Date.now();
const all = [];
const skipped = [];
let projections = 0;
for (const season of pastSeasons()) {
  const split = TEMPORADAS.ajuste.includes(season.name) ? 'ajuste' : TEMPORADAS.evaluacion.includes(season.name) ? 'evaluacion' : null;
  if (!split) continue;
  for (const group of season.groups) {
    if (group.kind !== 'league' || !forecastApplies(group, { prueba: true })) continue;
    const clave = `${season.name} ${group.id}`;
    const r = groupCases(group, { sims: args.sims, seed: SIM.seed });
    if (r.skip) { skipped.push(`${clave}: ${r.skip}`); continue; }
    for (const c of r.cuts) if (c.skip) skipped.push(`${clave} ${c.cut}: sin las ${PARAMS.minRounds} jornadas o sin nada por jugar`); else projections += 1;
    for (const c of r.cases) all.push({ ...c, split, clave });
  }
}
console.log(`# Backtest del pronóstico de la clasificación final (src/proyeccion.js)\n`);
console.log(`${projections} proyecciones de ${args.sims} simulaciones (semilla ${SIM.seed}), ${all.length} casos equipo-corte; bootstrap B = ${args.B}, semilla ${SEMILLA}, por temporada-grupo.`);
if (skipped.length) console.log(`Fuera: ${skipped.join('; ')}.`);

const ajuste = all.filter(c => c.split === 'ajuste'), evaluacion = all.filter(c => c.split === 'evaluacion');
const fanSlope = SIM.fanSlope;
if (args.calibrar) {
  // El abanico, con masa max(0,80, 1 − κ·jornadas jugadas) (fanMass de src/proyeccion.js): la κ con la que,
  // en AJUSTE (todos los cortes juntos), el puesto real cae dentro en una proporción más cercana al 80 %;
  // a igualdad, la menor. Con κ = 0, la masa es 1 (todo lo simulado); cada corte, a la derecha.
  console.log('\n## La masa del abanico: max(0,80, 1 − κ·jornadas jugadas) (AJUSTE)\n');
  console.log('| κ | El real, dentro: todos | tras 2 | tras 4 | tras 6 | mitad | Anchura media |');
  console.log('|---|---|---|---|---|---|---|');
  const claves = [...new Set(ajuste.map(c => c.clave))];
  let best = null;
  for (let i = 0; i <= 20; i += 1) {
    const k = Math.round(i * 0.0025 * 10000) / 10000;
    const fn = n => fanMass(n, { fanSlope: k });
    const cov = cs => { const S = sumsOf(cs, [...new Set(cs.map(c => c.clave))], fn); return total(S.in) / total(S.n); };
    const S = sumsOf(ajuste, claves, fn);
    const inside = total(S.in) / total(S.n), width = total(S.width) / total(S.n);
    const per = CUTS.map(([cut]) => pc(cov(ajuste.filter(c => c.cut === cut))));
    console.log(`| ${k.toFixed(4).replace('.', ',')} | ${pc(inside)} | ${per.join(' | ')} | ${f2(width)} |`);
    if (!best || Math.abs(inside - 0.8) < Math.abs(best.inside - 0.8) - 1e-12) best = { k, inside };
  }
  console.log(`\nLa más cercana al 80 % en AJUSTE: κ = ${best.k} (${pc(best.inside)}); la de la web, ${SIM.fanSlope}.`);
}
const fan = n => fanMass(n, { fanSlope });
const label = `masa max(0,80, 1 − ${String(fanSlope).replace('.', ',')}·jornadas jugadas)`;
report('AJUSTE (2013-14 a 2020-21)', ajuste, { B: args.B, fan, label });
report('EVALUACIÓN (2021-22 a 2025-26)', evaluacion, { B: args.B, fan, label });
report('EVALUACIÓN con la masa fija de 0,80 (sin calibrar)', evaluacion, { B: args.B, fan: () => SIM.fan, label: 'masa 0,80' });
console.log(`\n(${((Date.now() - started) / 1000).toFixed(1)} s)`);
if (args.json) {
  writeFileSync(args.json, JSON.stringify(all.map(c => ({ ...c, probs: [...c.probs] }))));
}
