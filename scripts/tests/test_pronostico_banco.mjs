// Banco de pruebas del pronóstico (scripts/pronostico_banco.mjs, 17/10/2026). Con las temporadas pasadas
// del repositorio (data-season-*.js, que el bot no toca), pero sin fijar sus cifras: el archivo se sigue
// corrigiendo. Lo que se prueba es el protocolo: las partes del examen, las parejas, que la referencia
// «actual» es el pronóstico de la web con el mismo entrenamiento, los nulos, la diferencia pareada, la
// semilla, que ajustar solo ve el ajuste, las comprobaciones del predictor y el CLI con un modelo de fichero.
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { forecastMatch } from '../../src/pronostico.js';
import {
  REFERENCIAS, ROOT, TEMPORADAS, TRAMOS, bancoDeAjuste, ejecutar, evaluate, frecuenciasAjuste, pares,
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
