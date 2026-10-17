// Banco de pruebas del pronóstico (scripts/pronostico_banco.mjs, 17/10/2026). Con las temporadas pasadas
// del repositorio (data-season-*.js, que el bot no toca), pero sin fijar sus cifras: el archivo se sigue
// corrigiendo. Lo que se prueba es el protocolo: las partes del examen, las parejas, que la referencia
// «actual» es el pronóstico de la web con el mismo entrenamiento, los nulos, la diferencia pareada, la
// semilla, que ajustar solo ve el ajuste, las comprobaciones del predictor y el CLI con un modelo de fichero.
// Y, desde el 17/10/2026, que el 1X2 de la web es el de las notas de scripts/pronostico_modelos/massey.mjs
// (el elegido con el banco) y la referencia «poisson», el Poisson de antes (la variante «actual» de
// scripts/pronostico_modelos/poisson.mjs).
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildGroup } from '../../src/model.js';
import { PARAMS, copiedMatches, forecastMatch, roundsAhead } from '../../src/pronostico.js';
import * as massey from '../pronostico_modelos/massey.mjs';
import * as poisson from '../pronostico_modelos/poisson.mjs';
import * as distancia from '../pronostico_modelos/distancia.mjs';
import {
  REFERENCIAS, ROOT, TEMPORADAS, TRAMOS, TRAMOS_CRUCE, TRAMOS_K, bancoDeAjuste, distancePairsOf, distanciaDe, ejecutar, evaluarDistancia,
  evaluate, frecuenciasAjuste, logLoss, pairsOf, pares, paresDistancia,
} from '../pronostico_banco.mjs';

const uniform = () => ({ pHome: 1 / 3, pDraw: 1 / 3, pAway: 1 / 3 });

test('las partes del examen: ajuste y evaluación, separadas, y «todas» las une', () => {
  const ajuste = pares('ajuste'), evaluacion = pares('evaluacion'), todas = pares('todas');
  assert.ok(ajuste.length > 1000 && evaluacion.length > 1000, `${ajuste.length} y ${evaluacion.length}`);
  assert.ok(ajuste.every(p => TEMPORADAS.ajuste.includes(p.temporada)));
  assert.ok(evaluacion.every(p => TEMPORADAS.evaluacion.includes(p.temporada)));
  assert.ok(!TEMPORADAS.ajuste.some(t => TEMPORADAS.evaluacion.includes(t)), 'ninguna temporada en las dos');
  const both = new Set([...ajuste, ...evaluacion]);
  assert.ok(todas.every(p => both.has(p) || (!TEMPORADAS.ajuste.includes(p.temporada) && !TEMPORADAS.evaluacion.includes(p.temporada))));
  assert.equal(both.size, ajuste.length + evaluacion.length);
  assert.throws(() => pares('2021-2022'), RangeError);
});

test('las parejas: entrenamiento anterior, de otra jornada y de su grupo; el partido, sin marcador', () => {
  for (const p of pares('todas')) {
    assert.ok(Object.isFrozen(p) && Object.isFrozen(p.training) && Object.isFrozen(p.match));
    assert.equal(p.match.hs, null);
    assert.equal(p.match.as, null);
    assert.equal(p.match.home, p.m.home);
    assert.equal(p.y, p.hs > p.as ? 'home' : p.hs < p.as ? 'away' : 'draw');
    assert.ok(p.training.length > 0);
    for (const t of p.training) {
      assert.ok(t.dateISO < p.m.dateISO, `${p.clave}: ${t.dateISO} antes de ${p.m.dateISO}`);
      assert.notEqual(t.roundKey, p.m.roundKey);
      assert.equal(t.groupId, p.grupo);
      assert.equal(t.season, p.temporada);
      assert.ok(t.hs != null && t.as != null);
    }
    assert.equal(p.jornadas, new Set(p.training.map(t => t.roundKey)).size);
    assert.ok(TRAMOS.includes(p.tramo));
  }
});

test('la referencia «actual» es el pronóstico de la web con el mismo entrenamiento que el banco', () => {
  for (const p of pares('todas')) {
    const f = forecastMatch(p.group, { ...p.m, hs: null, as: null }, { prueba: true, params: { minRounds: 1, minPlayed: 0 } });
    assert.ok(f, `${p.clave} ${p.m.home}–${p.m.away}`);
    assert.equal(f.matches, p.training.length);
    assert.equal(f.rounds, p.jornadas);
    const r = REFERENCIAS.actual.predictor(p.training, p.match, p.group);
    assert.deepEqual([r.pHome, r.pDraw, r.pAway], [f.pHome, f.pDraw, f.pAway]);
  }
});

test('sin las copias de la importación, ninguna liga del banco mezcla dos equipos en uno', () => {
  // PGC1 de 2023-24 y PGC4 de 2024-25 apuntan el filial también al primer equipo (Roque Amagro, 46 partidos
  // con marcador en 26 jornadas), pero cada copia cae en la jornada de su partido de verdad y copiedMatches
  // la quita (revisión del 17/10/2026). Sin ellas, en cada liga: nadie juega dos veces en una jornada, ni más
  // partidos que jornadas, ni el mismo cruce local–visitante dos veces; y ninguna pareja lleva una copia.
  const groups = new Set(pares('todas').map(p => p.group));
  let leagues = 0;
  for (const group of groups) {
    if (group.kind !== 'league') continue;
    leagues += 1;
    const copies = copiedMatches(group);
    const where = `${group.season} ${group.id}`;
    const played = new Map(), fixtures = new Set();
    for (const round of group.rounds) {
      const inRound = new Set();
      for (const m of round.matches) {
        if (m.hs == null || m.as == null || copies.has(m)) continue;
        for (const t of [m.home, m.away]) {
          assert.ok(!inRound.has(t), `${where} ${round.key}: ${t} juega dos veces`);
          inRound.add(t);
          played.set(t, (played.get(t) || 0) + 1);
        }
        const key = `${m.home}|${m.away}`;
        assert.ok(!fixtures.has(key), `${where}: ${m.home}–${m.away} dos veces`);
        fixtures.add(key);
      }
    }
    for (const [t, n] of played) assert.ok(n <= group.rounds.length, `${where}: ${t}, ${n} partidos en ${group.rounds.length} jornadas`);
  }
  assert.ok(leagues > 40, `${leagues} ligas`);
  for (const p of pares('todas')) {
    const copies = copiedMatches(p.group);
    assert.ok(!copies.has(p.m) && !p.training.some(t => copies.has(t)), `${p.clave} ${p.m.home}–${p.m.away}`);
  }
});

test('el 1X2 de la web es el de las notas de massey.mjs con sus parámetros; «poisson», el Poisson de antes', () => {
  const M = massey.PARAMS;
  assert.deepEqual(
    { cushion: PARAMS.cushion, ridge: PARAMS.ridge, ratingHome: PARAMS.ratingHome, slope: PARAMS.slope, band: PARAMS.band, slopeVar: PARAMS.slopeVar, bandVar: PARAMS.bandVar },
    { cushion: M.k, ridge: M.lambda, ratingHome: M.home, slope: M.beta, band: M.theta, slopeVar: M.kappa, bandVar: M.empate },
  );
  const before = poisson.crear(poisson.PARAMS_ACTUAL);
  for (const p of pares('todas')) {
    const a = REFERENCIAS.actual.predictor(p.training, p.match, p.group);
    const b = massey.pronostico(p.training, p.match, M);
    const c = REFERENCIAS.poisson.predictor(p.training, p.match, p.group);
    const d = before(p.training, p.match, p.group);
    for (const k of ['pHome', 'pDraw', 'pAway']) {
      assert.ok(Math.abs(a[k] - b[k]) < 1e-12, `${p.clave} ${p.match.home}–${p.match.away} ${k}: ${a[k]} frente a ${b[k]}`);
      assert.ok(Math.abs(c[k] - d[k]) < 1e-12, `${p.clave} ${p.match.home}–${p.match.away} ${k}: ${c[k]} frente a ${d[k]}`);
    }
  }
});

test('nulos: cuentan aparte y las métricas son las de lo pronosticado', () => {
  const inf = evaluate((training, match, group, info) => (info.tramo === '1' ? null : uniform()), { B: 0 });
  const t1 = inf.porTramo['1'];
  assert.ok(t1.pares > 0);
  assert.equal(t1.nulos, t1.pares);
  assert.equal(t1.predichos, 0);
  assert.equal(t1.logLoss, null);
  assert.equal(inf.nulos, t1.pares);
  assert.equal(inf.predichos + inf.nulos, inf.pares);
  assert.ok(Math.abs(inf.global.logLoss - Math.log(3)) < 1e-6, String(inf.global.logLoss));
  assert.equal(inf.global.ic95, null, 'B: 0, sin intervalos');
});

test('diferencia pareada: cero con el mismo modelo y la «web» frente a «actual» en lo que pronostican los dos', () => {
  const same = evaluate(uniform, { B: 100, referencia: uniform });
  assert.equal(same.frente.global.logLoss, 0);
  assert.deepEqual(same.frente.global.ic95.logLoss, [0, 0]);
  assert.equal(same.frente.global.pMejor, 0);
  const web = evaluate(REFERENCIAS.web.predictor, { B: 100, referencia: REFERENCIAS.actual.predictor, nombreReferencia: 'actual' });
  assert.equal(web.frente.referencia, 'actual');
  assert.equal(web.porTramo['1'].predichos, 0, 'la web no enseña nada con una jornada');
  assert.ok(web.nulos >= web.porTramo['1'].pares);
  assert.equal(web.frente.global.pares, web.predichos);
  assert.ok(Math.abs(web.frente.global.logLoss) < 1e-9, 'el mismo modelo donde los dos pronostican');
  // Un modelo peor que la referencia en todo: la diferencia, positiva, y su intervalo, por encima del cero.
  const worse = evaluate(uniform, { B: 200, referencia: REFERENCIAS.actual.predictor });
  assert.ok(worse.frente.global.logLoss > 0 && worse.frente.global.ic95.logLoss[0] > 0);
  assert.equal(worse.frente.global.pMejor, 0);
});

test('bootstrap: la misma semilla da los mismos intervalos; otra, otros', () => {
  const run = semilla => evaluate(REFERENCIAS.tabla.predictor, { B: 300, semilla });
  const a = run(7), b = run(7), c = run(8);
  assert.deepEqual(a, b);
  assert.notDeepEqual(a.global.ic95, c.global.ic95);
  assert.equal(a.bootstrap.unidad, 'temporada-grupo');
  const [lo, hi] = a.global.ic95.logLoss;
  assert.ok(lo < a.global.logLoss && a.global.logLoss < hi, `${lo} < ${a.global.logLoss} < ${hi}`);
});

test('ajustar solo ve las temporadas de ajuste; las frecuencias de las referencias salen de ahí', async () => {
  const banco = bancoDeAjuste();
  assert.ok(banco.pares.length > 0 && banco.pares.every(p => TEMPORADAS.ajuste.includes(p.temporada)));
  assert.equal(banco.evaluate(uniform, { split: 'evaluacion', B: 0 }).split, 'ajuste', 'su evaluate no sale del ajuste');
  const f = frecuenciasAjuste();
  assert.equal(f.pares, pares('ajuste').length);
  assert.ok(Math.abs(f.local.home + f.local.draw + f.local.away - 1) < 1e-12);
  assert.ok(f.lider.better > f.lider.worse);
  let seen = null;
  const modelo = { nombre: 'prueba', ajustar: b => { seen = b; return { k: 1 }; }, predictor: uniform };
  const inf = await ejecutar(modelo, { B: 0, contra: null });
  assert.equal(seen.split, 'ajuste');
  assert.deepEqual(inf.ajuste, { k: 1 });
  assert.equal(inf.split, 'evaluacion');
  assert.equal(inf.frente, null);
});

test('lo que devuelve un predictor se comprueba: que sean probabilidades y sumen 1', () => {
  assert.throws(() => evaluate(() => ({ pHome: 0.5, pDraw: 0.3, pAway: 0.3 }), { B: 0 }), /suman/);
  assert.throws(() => evaluate(() => ({ pHome: 1.2, pDraw: -0.2, pAway: 0 }), { B: 0 }), RangeError);
  assert.throws(() => evaluate(() => ({ pHome: NaN, pDraw: 0.5, pAway: 0.5 }), { B: 0 }), RangeError);
  assert.throws(() => evaluate(() => 0.5, { B: 0 }), TypeError);
  assert.throws(() => evaluate(null), TypeError);
  // El entrenamiento es compartido: ordenarlo en el sitio falla.
  assert.throws(() => evaluate(training => { training.sort(); return uniform(); }, { B: 0 }), TypeError);
});

test('el CLI con un modelo de fichero: ajustar, examen de evaluación y diferencia frente a «actual»', () => {
  const dir = mkdtempSync(join(tmpdir(), 'banco-'));
  try {
    const file = join(dir, 'uniforme.mjs');
    writeFileSync(file, [
      "export const nombre = 'uniforme';",
      'export function ajustar(banco) { return { pares: banco.pares.length }; }',
      'export function predictor() { return { pHome: 1 / 3, pDraw: 1 / 3, pAway: 1 / 3 }; }',
    ].join('\n'));
    const r = spawnSync(process.execPath, ['scripts/pronostico_banco.mjs', '--modelo', file, '--B', '50'], { cwd: ROOT, encoding: 'utf8' });
    assert.equal(r.status, 0, r.stderr);
    const inf = JSON.parse(r.stdout);
    assert.equal(inf.modelo, 'uniforme');
    assert.equal(inf.split, 'evaluacion');
    assert.deepEqual(inf.ajuste, { pares: pares('ajuste').length });
    assert.equal(inf.pares, pares('evaluacion').length);
    assert.ok(Math.abs(inf.global.logLoss - Math.log(3)) < 1e-6);
    assert.equal(inf.frente.referencia, 'actual');
    assert.equal(inf.bootstrap.B, 50);
    assert.match(r.stderr, /uniforme · evaluacion/);
    const bad = spawnSync(process.execPath, ['scripts/pronostico_banco.mjs', '--modelo', file, '--split', 'futuro'], { cwd: ROOT, encoding: 'utf8' });
    assert.notEqual(bad.status, 0);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

// ── A varias jornadas vista (17/10/2026) ─────────────────────────────────────────────────────────────

// Una liga de cuatro con seis jornadas semanales, todas jugadas; la 4, la mitad el sábado y la mitad el domingo.
function ordered() {
  const row = (date, home, away, hs, as) => [date, home, away, hs, as, null, '10:00', 'CAMPO MUNICIPAL'];
  const rounds = [
    [row('2026-10-03', 'A', 'B', 5, 1), row('2026-10-03', 'C', 'D', 2, 2)],
    [row('2026-10-10', 'A', 'C', 4, 2), row('2026-10-10', 'B', 'D', 1, 3)],
    [row('2026-10-17', 'A', 'D', 6, 0), row('2026-10-17', 'B', 'C', 2, 4)],
    [row('2026-10-24', 'B', 'A', 0, 7), row('2026-10-25', 'D', 'C', 3, 3)],
    [row('2026-10-31', 'C', 'A', 1, 5), row('2026-10-31', 'D', 'B', 4, 1)],
    [row('2026-11-07', 'D', 'A', 2, 6), row('2026-11-07', 'C', 'B', 3, 1)],
  ];
  const raw = { id: 'PG9', name: 'Grupo 9', fullName: 'PREBENJAMIN GRAN CANARIA - GRUPO 9', phase: 'Gran Canaria', island: 'grancanaria', standings: [] };
  return buildGroup(raw, { season: '2026-2027', cat: 'prebenjamin', current: true, history: { PG9: Object.fromEntries(rounds.map((ms, i) => [`Jornada ${i + 1}`, ms])) } });
}

test('distancePairsOf: en un calendario en orden, a k vista, lo jugado antes de que empiece la jornada N − k + 1', () => {
  const group = ordered();
  const base = pairsOf([{ name: '2026-2027', groups: [group] }]);
  const all = distancePairsOf(base);
  const of = (round, home) => all.filter(p => p.m.roundKey === round && p.m.home === home);
  // C–A de la jornada 5: la víspera (k 1, sin corte), y antes de la 4 (empieza el sábado 24), de la 3 y de la 2.
  const ca = of('Jornada 5', 'C');
  assert.deepEqual(ca.map(p => [p.k, p.corte]), [[1, null], [2, '2026-10-24'], [3, '2026-10-17'], [4, '2026-10-10']]);
  assert.deepEqual(ca.map(p => p.jornadas), [4, 3, 2, 1]);
  assert.ok(ca.every(p => p.base === ca[0].base && p.base === base.find(b => b.m === p.m)));
  // El domingo 25 (con la mitad de la 4 jugada) da la misma distancia que la víspera: se queda la víspera, que sabe más.
  assert.ok(!ca.some(p => p.corte === '2026-10-25'));
  // D–C del domingo 25 (jornada 4): su víspera no tiene nada de la 4, que es la suya; a 2 vista, antes de la 3.
  assert.deepEqual(of('Jornada 4', 'D').map(p => [p.k, p.corte]), [[1, null], [2, '2026-10-17'], [3, '2026-10-10']]);
  // La jornada 1 no tiene nada detrás: ninguna pareja.
  assert.equal(of('Jornada 1', 'A').length, 0);
});

test('las parejas a varias jornadas vista: lo jugado antes del corte, la distancia de la web y una por distancia', () => {
  const ps = paresDistancia('todas');
  const bases = pares('todas');
  assert.ok(ps.length > 5 * bases.length, `${ps.length} parejas de ${bases.length} partidos`);
  const byBase = new Map();
  for (const p of ps) {
    assert.ok(Object.isFrozen(p) && Object.isFrozen(p.training));
    assert.ok(bases.includes(p.base));
    if (!byBase.has(p.base)) byBase.set(p.base, []);
    byBase.get(p.base).push(p);
    const where = `${p.clave} ${p.m.roundKey} ${p.m.home}–${p.m.away} corte ${p.corte}`;
    if (p.corte === null) {
      assert.equal(p.training, p.base.training, where);
      assert.equal(p.k, p.base.k, where);
    } else {
      const inBase = new Set(p.base.training);
      assert.ok(p.training.length > 0 && p.training.length < p.base.training.length, where);
      assert.ok(p.training.every(t => t.dateISO < p.corte && inBase.has(t)), where);
    }
    assert.equal(p.k, roundsAhead(p.group, p.m, { status: p.status, before: p.corte }), where);
    assert.equal(p.distancia, distanciaDe(p.k));
    assert.equal(p.jornadas, new Set(p.training.map(t => t.roundKey)).size);
  }
  assert.equal(byBase.size, bases.length, 'cada partido, con su pareja de siempre');
  for (const [b, list] of byBase) {
    assert.equal(list[0].corte, null, 'la de siempre, la primera');
    const ks = list.map(p => p.k);
    assert.equal(new Set(ks).size, ks.length, `${b.clave} ${b.m.home}–${b.m.away}: una por distancia`);
  }
  // En EVALUACIÓN, la de siempre es siempre la de k = 1.
  assert.ok(pares('evaluacion').every(p => p.k === 1));
  // La referencia de la web, con el mismo entrenamiento y la misma distancia (una de cada siete, por tiempo).
  ps.filter((p, i) => i % 7 === 0).forEach(p => {
    const f = REFERENCIAS.actual.predictor(p.training, p.match, p.group, p);
    const g = forecastMatch(p.group, p.match, { prueba: true, before: p.corte, params: { minRounds: 1, minPlayed: 0 } });
    assert.deepEqual(f, { pHome: g.pHome, pDraw: g.pDraw, pAway: g.pAway });
    assert.equal(g.matches, p.training.length);
    assert.equal(g.ahead, p.k);
  });
});

test('el examen a distancia: en k = 1, las cifras de siempre; la diferencia con la víspera y la fiabilidad, a mano', () => {
  const inf = evaluarDistancia(REFERENCIAS.web.predictor, { B: 0 });
  const old = evaluate(REFERENCIAS.web.predictor, { B: 0 });
  const k1 = inf.porDistancia['1'];
  for (const key of ['pares', 'predichos', 'nulos', 'logLoss', 'brier', 'acierto', 'empatePrevisto', 'empateReal']) assert.equal(k1[key], old.global[key], key);
  assert.equal(k1.frenteK1.logLoss, 0);
  assert.equal(inf.partidos, old.pares);
  assert.equal(inf.pares, paresDistancia('evaluacion').length);
  assert.deepEqual(Object.keys(inf.porDistancia), TRAMOS_K);
  for (const d of TRAMOS_K) {
    const cells = TRAMOS_CRUCE.map(c => inf.porDistanciaYJornadas[d][c]);
    assert.equal(cells.reduce((s, c) => s + c.pares, 0), inf.porDistancia[d].pares, d);
    assert.equal(inf.porDistanciaYJornadas[d]['1'].predichos, 0, `${d}: con una jornada, la web nada`);
  }
  // Uniforme la víspera y 50-25-25 con corte: la diferencia con la víspera, la de esas dos en cada pareja; la
  // fiabilidad, lo que se le da al elegido (el local) menos lo que gana.
  const toy = (training, match, group, info) => (info.corte ? { pHome: 0.5, pDraw: 0.25, pAway: 0.25 } : { pHome: 1 / 3, pDraw: 1 / 3, pAway: 1 / 3 });
  const t = evaluarDistancia(toy, { B: 0, referencias: {} });
  const ps = paresDistancia('evaluacion').filter(p => p.distancia === '4-6');
  const want = ps.reduce((s, p) => s + (p.corte ? logLoss({ home: 0.5, draw: 0.25, away: 0.25 }, p.y) - Math.log(3) : 0), 0) / ps.length;
  assert.ok(Math.abs(t.porDistancia['4-6'].frenteK1.logLoss - want) < 1e-6, `${t.porDistancia['4-6'].frenteK1.logLoss} frente a ${want}`);
  const home = ps.filter(p => p.y === 'home').length / ps.length;
  const fav = ps.reduce((s, p) => s + (p.corte ? 0.5 : 1 / 3), 0) / ps.length;
  assert.ok(Math.abs(t.porDistancia['4-6'].fiabilidad.diferencia - (fav - home)) < 1e-6);
  assert.ok(Math.abs(t.porDistancia['4-6'].acierto - home) < 1e-6);
  assert.deepEqual(t.referencias, []);
});

test('la corrección por distancia (distancia.mjs): sin deriva, la web; con deriva, el favorito menos por encima del otro; el ajuste la deja en 0', () => {
  assert.equal(distancia.PARAMS.deriva, 0);
  const ps = paresDistancia('evaluacion').filter((p, i) => i % 11 === 0);
  for (const p of ps) {
    assert.deepEqual(distancia.predictor(p.training, p.match, p.group, p), REFERENCIAS.web.predictor(p.training, p.match, p.group, p));
  }
  const far = ps.filter(p => p.k >= 5 && distancia.predictor(p.training, p.match, p.group, p)).slice(0, 50);
  assert.ok(far.length === 50);
  // Más varianza baja la pendiente y estrecha la banda de empate: la probabilidad del favorito puede subir
  // (le quita al empate), pero su ventaja sobre el otro, P(favorito) / P(el otro), siempre baja; con una
  // deriva enorme, a medias y sin empate.
  for (const p of far) {
    const a = distancia.pronostico(p.training, p.match, p.group, p, 0), b = distancia.pronostico(p.training, p.match, p.group, p, 0.05);
    const ratio = q => Math.max(q.pHome, q.pAway) / Math.min(q.pHome, q.pAway);
    assert.ok(ratio(b) <= ratio(a) + 1e-12 && Math.abs(b.pHome + b.pDraw + b.pAway - 1) < 1e-12, `${ratio(a)} → ${ratio(b)}`);
    const flat = distancia.pronostico(p.training, p.match, p.group, p, 1e9);
    assert.ok(Math.abs(flat.pHome - 0.5) < 0.01 && Math.abs(flat.pAway - 0.5) < 0.01, JSON.stringify(flat));
  }
  const near = ps.find(p => p.k === 1 && distancia.predictor(p.training, p.match, p.group, p));
  assert.deepEqual(distancia.pronostico(near.training, near.match, near.group, near, 0.05), distancia.predictor(near.training, near.match, near.group, near), 'a 1 vista, nada');
  const r = distancia.ajustar(bancoDeAjuste());
  assert.equal(r.params.deriva, 0);
  assert.equal(r.coincideConPARAMS, true);
  assert.ok(r.rejilla.every(([d, l], i) => i === 0 || l > r.rejilla[i - 1][1]), 'cualquier deriva empeora el ajuste');
});

test('el CLI --distancia con un modelo de fichero: por distancia, con la tabla y el local', () => {
  const dir = mkdtempSync(join(tmpdir(), 'banco-'));
  try {
    const file = join(dir, 'uniforme.mjs');
    writeFileSync(file, "export function predictor() { return { pHome: 1 / 3, pDraw: 1 / 3, pAway: 1 / 3 }; }\n");
    const r = spawnSync(process.execPath, ['scripts/pronostico_banco.mjs', '--distancia', '--modelo', file, '--B', '20'], { cwd: ROOT, encoding: 'utf8' });
    assert.equal(r.status, 0, r.stderr);
    const inf = JSON.parse(r.stdout);
    assert.equal(inf.modelo, 'uniforme');
    assert.deepEqual(inf.referencias, ['tabla', 'local']);
    assert.deepEqual(Object.keys(inf.porDistancia), TRAMOS_K);
    assert.equal(inf.partidos, pares('evaluacion').length);
    assert.ok(Math.abs(inf.global.logLoss - Math.log(3)) < 1e-6);
    assert.ok(inf.porDistancia['13+'].frente.tabla.logLoss > 0, 'la tabla, mejor que tirar una moneda de tres caras');
    assert.match(r.stderr, /a varias jornadas vista/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
