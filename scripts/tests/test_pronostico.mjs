// Pronóstico de prebenjamín (src/pronostico.js, 17/10/2026: el 1X2, de las notas de Massey; el marcador y
// los goles esperados, del Poisson, dentro del favorito de las notas). Solo grupos sintéticos, construidos con el
// buildGroup de model.js como los de la temporada del portal (las jornadas, de la tabla de HISTORY):
// ni los data-*.js de la web, que cambian cada dos horas, ni config.js (R2-1: la temporada del portal
// entra por parámetro).
import test from 'node:test';
import assert from 'node:assert/strict';
import { buildGroup } from '../../src/model.js';
import {
  PARAMS, copiedMatches, fitNotes, fitRatings, forecastApplies, forecastMatch, forecastRound, horizonOf, isDeskResult, likelyScore,
  notesOdds, outcome, topScores, trainingFor,
} from '../../src/pronostico.js';

const SEASON = '2026-2027';
const OPTS = { portalSeason: SEASON };
const row = (date, home, away, hs = null, as = null, time = '10:00', venue = 'CAMPO MUNICIPAL') => [date, home, away, hs, as, null, time, venue];

// Liga de seis equipos y cinco jornadas: Alfa, el más fuerte; Zeta, el más flojo. Jugadas, la 1, la 2 y
// la 3; la 4 y la 5, por jugar.
const BASE = [
  [row('2026-10-03', 'Alfa', 'Zeta', 9, 1), row('2026-10-03', 'Beta', 'Épsilon', 4, 3), row('2026-10-04', 'Gamma', 'Delta', 5, 5)],
  [row('2026-10-10', 'Zeta', 'Delta', 0, 6), row('2026-10-10', 'Épsilon', 'Gamma', 3, 4), row('2026-10-11', 'Alfa', 'Beta', 7, 2)],
  [row('2026-10-17', 'Beta', 'Zeta', 6, 1), row('2026-10-17', 'Gamma', 'Alfa', 2, 8), row('2026-10-18', 'Delta', 'Épsilon', 4, 4)],
  [row('2026-10-24', 'Zeta', 'Épsilon'), row('2026-10-24', 'Alfa', 'Delta'), row('2026-10-25', 'Beta', 'Gamma')],
  [row('2026-10-31', 'Gamma', 'Zeta'), row('2026-10-31', 'Delta', 'Beta'), row('2026-11-01', 'Épsilon', 'Alfa')],
];

// La tabla de los partidos con marcador de `rounds` (sin los equipos de `unlisted`, que la federación
// quita de su clasificación).
function standingsOf(rounds, unlisted = []) {
  const t = new Map();
  for (const [, h, a, hs, as] of rounds.flat()) {
    for (const team of [h, a]) if (!t.has(team)) t.set(team, { pts: 0, pj: 0, g: 0, e: 0, p: 0, gf: 0, gc: 0 });
    if (hs == null) continue;
    for (const [team, gf, gc] of [[h, hs, as], [a, as, hs]]) {
      const r = t.get(team);
      r.pj += 1; r.gf += gf; r.gc += gc;
      if (gf > gc) { r.g += 1; r.pts += 3; } else if (gf === gc) { r.e += 1; r.pts += 1; } else r.p += 1;
    }
  }
  return [...t].filter(([team]) => !unlisted.includes(team)).sort((x, y) => y[1].pts - x[1].pts)
    .map(([team, r], i) => [i + 1, team, r.pts, r.pj, r.g, r.e, r.p, r.gf, r.gc, r.gf - r.gc]);
}

function makeGroup(rounds = BASE, { cat = 'prebenjamin', season = SEASON, id = 'PG9', unlisted = [], phase = 'Gran Canaria' } = {}) {
  const jornadas = Object.fromEntries(rounds.map((ms, i) => [`Jornada ${i + 1}`, ms]));
  const raw = { id, name: 'Grupo 9', fullName: 'PREBENJAMIN GRAN CANARIA - GRUPO 9', phase, island: 'grancanaria',
    jornada: 'Jornada 4', standings: standingsOf(rounds, unlisted) };
  return buildGroup(raw, { season, cat, current: true, history: { [id]: jornadas } });
}
const matchOf = (group, n, home) => group.rounds.find(r => r.n === n).matches.find(m => m.home === home);
// Lo que da el pronóstico, sin los nombres: para comparar dos grupos con los mismos partidos que cuentan.
const numbers = f => f && { pHome: f.pHome, pDraw: f.pDraw, pAway: f.pAway, score: f.score, xgHome: f.xgHome, xgAway: f.xgAway, rounds: f.rounds, matches: f.matches };
const close = (a, b, msg) => assert.ok(Math.abs(a - b) < 1e-9, `${msg}: ${a} frente a ${b}`);

test('un partido sin jugar: probabilidades que suman 1, el favorito y la nota de las jornadas', () => {
  const group = makeGroup();
  const f = forecastMatch(group, matchOf(group, 4, 'Alfa'), OPTS);
  assert.ok(f, 'Alfa–Delta tiene pronóstico');
  assert.equal(f.home, 'Alfa');
  assert.equal(f.away, 'Delta');
  close(f.pHome + f.pDraw + f.pAway, 1, 'suman 1');
  for (const p of [f.pHome, f.pDraw, f.pAway, f.pScore]) assert.ok(p >= 0 && p <= 1, String(p));
  assert.equal(f.pick, 'home');
  assert.ok(f.pHome > 0.5, `Alfa, favorita clara: ${f.pHome}`);
  assert.ok(f.score[0] > f.score[1], `el marcador da ganador al local: ${f.score}`);
  assert.ok(f.xgHome > f.xgAway);
  assert.equal(f.rounds, 3);
  assert.equal(f.matches, 9);
  assert.equal(f.playedHome, 3);
  assert.equal(f.playedAway, 3);
});

test('coherencia: el marcador más probable siempre cae dentro del desenlace más probable', () => {
  const means = [0, 0.3, 0.8, 1, 1.2, 1.8, 2.5, 3, 3.7, 4, 4.4, 5.5, 7, 9, 12, 15];
  for (const h of means) {
    for (const a of means) {
      for (const params of [{}, { size: 6 }]) {
        const o = outcome(h, a, params);
        close(o.pHome + o.pDraw + o.pAway, 1, `suman 1 con ${h}-${a}`);
        const [l, v] = o.score;
        const side = l > v ? 'home' : l < v ? 'away' : 'draw';
        assert.equal(side, o.pick, `${h}-${a} ${JSON.stringify(params)}: ${l}-${v} con pick ${o.pick}`);
        assert.ok(o.pick !== 'home' || (o.pHome >= o.pAway && o.pHome >= o.pDraw));
        assert.ok(o.pick !== 'away' || (o.pAway > o.pHome && o.pAway >= o.pDraw));
      }
    }
  }
});

test('nunca un 1-1 con un favorito claro: el empate es el marcador más probable de todos, pero no el elegido', () => {
  // Con medias de 1,8 y 1,2 el 1-1 es el marcador más probable suelto (Poisson: la moda de cada uno es
  // 1; 2,16·e⁻³ frente a 1,94·e⁻³ del 2-1), pero el local gana la mitad de las veces y empata una de
  // cada cuatro: el marcador es su victoria más probable, el 2-1.
  const o = outcome(1.8, 1.2, { size: Infinity });
  const joint = (i, j) => (1.8 ** i / [1, 1, 2][i]) * (1.2 ** j / [1, 1, 2][j]);
  assert.ok(joint(1, 1) > joint(2, 1) && joint(2, 1) > joint(1, 0), 'el 1-1, el más probable suelto');
  assert.equal(o.pick, 'home');
  assert.ok(o.pHome > 0.45 && o.pHome > o.pDraw + 0.2, JSON.stringify(o));
  assert.ok(o.score[0] > o.score[1], `marcador ${o.score}`);
  assert.deepEqual(o.score, [2, 1]);
});

// Liga de cuatro con dos jornadas jugadas: Alfa le gana 6-2 a Beta y Beta, 5-1 a Gamma; Alfa y Gamma no
// se han visto (la «regla de tres» del usuario, 17/10/2026).
const THREE = [
  [row('2026-10-03', 'Alfa', 'Beta', 6, 2), row('2026-10-03', 'Gamma', 'Delta', 3, 3)],
  [row('2026-10-10', 'Beta', 'Gamma', 5, 1), row('2026-10-10', 'Delta', 'Alfa', 2, 4)],
  [row('2026-10-17', 'Alfa', 'Gamma'), row('2026-10-17', 'Beta', 'Delta')],
];

test('el 1X2, de las notas de Massey: si A le ganó a B y B a C, A es favorito contra C sin haberse visto', () => {
  const group = makeGroup(THREE);
  const m = matchOf(group, 3, 'Alfa');
  const f = forecastMatch(group, m, OPTS);
  assert.equal(f.pick, 'home');
  assert.ok(f.pHome > 0.8 && f.pAway < 0.15, JSON.stringify(f));
  // Las notas, en el orden de la cadena: Alfa por encima de Beta, y Beta de Gamma.
  const fit = fitNotes(trainingFor(group, m));
  const note = name => fit.notes[fit.index.get(name)];
  assert.ok(note('Alfa') > note('Beta') && note('Beta') > note('Gamma'), JSON.stringify([...fit.index.keys()].map(n => [n, note(n)])));
  // El 1X2 de forecastMatch es el de notesOdds con el ajuste de su entrenamiento.
  const o = notesOdds(fit, 'Alfa', 'Gamma');
  assert.deepEqual([f.pHome, f.pDraw, f.pAway], [o.pHome, o.pDraw, o.pAway]);
  close(o.pHome + o.pDraw + o.pAway, 1, 'suman 1');
  // Al revés (Gamma en casa), Alfa sigue de favorita, algo menos (el campo es de Gamma).
  const back = notesOdds(fit, 'Gamma', 'Alfa');
  assert.ok(back.pAway > 0.75 && back.pAway < f.pHome, `${back.pAway} y ${f.pHome}`);
  // Sin el partido de Beta y Gamma, Alfa ya no tiene a quién comparar con Gamma más que a Delta.
  const fewer = fitNotes(trainingFor(group, m).filter(t => !(t.home === 'Beta' && t.away === 'Gamma')));
  assert.ok(notesOdds(fewer, 'Alfa', 'Gamma').pHome < f.pHome);
  assert.equal(fitNotes([]), null);
});

test('las notas: un equipo sin partidos, en 0 y con la varianza del previo; con más jornadas, se sabe más y se modera menos', () => {
  const group = makeGroup();
  const used = trainingFor(group, matchOf(group, 4, 'Alfa'));
  const fit = fitNotes(used);
  // Dos que no han jugado: nota 0, varianza 2/λ y solo el campo.
  const none = notesOdds(fit, 'Nuevo', 'Otro');
  close(none.variance, 2 / PARAMS.ridge, 'la varianza de dos sin partidos');
  close(none.diff, PARAMS.ratingHome, 'solo el campo');
  assert.ok(none.pHome > none.pAway);
  const flat = notesOdds(fit, 'Nuevo', 'Otro', { ratingHome: 0 });
  close(flat.pHome, flat.pAway, 'sin campo, a medias');
  // Con una jornada, Alfa–Delta es más incierta que con tres, y el favorito, más moderado.
  const one = fitNotes(used.filter(m => m.roundKey === 'Jornada 1'));
  const a1 = notesOdds(one, 'Alfa', 'Delta'), a3 = notesOdds(fit, 'Alfa', 'Delta');
  assert.ok(a1.variance > a3.variance, `${a1.variance} frente a ${a3.variance}`);
  // Con la misma diferencia, la varianza acerca al 50 % al favorito; y la banda de empate, que también se
  // estrecha con ella, no infla el empate (con la banda fija, más empate).
  const sharp = notesOdds(fit, 'Alfa', 'Delta', { slopeVar: 0, bandVar: 0 });
  const fixedBand = notesOdds(fit, 'Alfa', 'Delta', { bandVar: 0 });
  close(sharp.diff, a3.diff, 'la misma diferencia');
  assert.ok(a3.pHome < sharp.pHome, `${a3.pHome} frente a ${sharp.pHome}`);
  assert.ok(a3.pDraw < fixedBand.pDraw, `${a3.pDraw} frente a ${fixedBand.pDraw}`);
  // Probabilidades en [0, 1] que suman 1, también con goleadas y con todo empates.
  const blowout = fitNotes([{ home: 'X', away: 'Y', hs: 30, as: 0, roundKey: 'J1' }, { home: 'Y', away: 'Z', hs: 0, as: 24, roundKey: 'J2' }]);
  const draws = fitNotes([{ home: 'X', away: 'Y', hs: 2, as: 2, roundKey: 'J1' }, { home: 'Y', away: 'Z', hs: 0, as: 0, roundKey: 'J2' }]);
  for (const [f, h, a] of [[blowout, 'X', 'Y'], [blowout, 'Y', 'Z'], [blowout, 'Z', 'X'], [draws, 'X', 'Z'], [draws, 'Z', 'Nuevo']]) {
    const o = notesOdds(f, h, a);
    for (const v of [o.pHome, o.pDraw, o.pAway]) assert.ok(v >= 0 && v <= 1 && Number.isFinite(v), `${h}–${a}: ${v}`);
    close(o.pHome + o.pDraw + o.pAway, 1, `${h}–${a}`);
  }
  // X le hizo 30 a Y y Z, 24: X, por delante de Z, pero esos seis goles entre dos goleadas pesan menos que
  // los cuatro de un 4-0 frente a un 0-0 (el colchón de goles: «cuántas veces más», no «cuántos más»).
  const xz = notesOdds(blowout, 'X', 'Z', { ratingHome: 0 });
  const short = fitNotes([{ home: 'X', away: 'Y', hs: 4, as: 0, roundKey: 'J1' }, { home: 'Y', away: 'Z', hs: 0, as: 0, roundKey: 'J2' }]);
  assert.ok(xz.pHome > xz.pAway && xz.pHome < notesOdds(short, 'X', 'Z', { ratingHome: 0 }).pHome, JSON.stringify(xz));
});

test('el marcador, del Poisson y siempre dentro del favorito de las notas; los goles esperados, si van con él', () => {
  const means = [0.3, 1, 1.8, 2.5, 3.7, 4.4, 7, 12];
  for (const h of means) {
    for (const a of means) {
      // Con el favorito del Poisson, likelyScore es el marcador de outcome; con cualquiera, el de topScores.
      const o = outcome(h, a);
      const same = likelyScore(h, a, o.pick);
      assert.deepEqual(same.score, o.score, `${h}-${a}`);
      close(same.pScore, o.pScore, `${h}-${a}`);
      for (const pick of ['home', 'draw', 'away']) {
        const x = likelyScore(h, a, pick);
        const [l, v] = x.score;
        assert.equal(l > v ? 'home' : l < v ? 'away' : 'draw', pick, `${h}-${a} ${pick}: ${l}-${v}`);
        assert.deepEqual(x.score, topScores(h, a, { n: 1, pick })[0].score);
      }
    }
  }
  // Los de forecastMatch: el marcador, del favorito, y goalsAgree, si los goles esperados van con él.
  const groups = [makeGroup(), makeGroup(THREE)];
  for (const group of groups) {
    for (const round of group.rounds) {
      for (const f of forecastRound(group, round, { ...OPTS, params: { ...PARAMS, minRounds: 1, minPlayed: 0 } })) {
        if (!f) continue;
        const [l, v] = f.score;
        assert.equal(l > v ? 'home' : l < v ? 'away' : 'draw', f.pick, `${f.home}–${f.away}`);
        assert.equal(f.goalsAgree, f.pick === 'home' ? f.xgHome >= f.xgAway : f.pick === 'away' ? f.xgAway >= f.xgHome : true);
      }
    }
  }
});

test('simetría: dar la vuelta al partido da la vuelta al pronóstico; sin campo, exacta', () => {
  const swapped = BASE.map((ms, i) => (i === 3 ? ms.map(r => (r[1] === 'Beta' ? row(r[0], 'Gamma', 'Beta') : r)) : ms));
  const g1 = makeGroup(), g2 = makeGroup(swapped);
  // Sin campo: ni en las notas (ratingHome) ni en los goles (home).
  const flat = { ...PARAMS, home: 1, ratingHome: 0 };
  const a = forecastMatch(g1, matchOf(g1, 4, 'Beta'), { ...OPTS, params: flat });
  const b = forecastMatch(g2, matchOf(g2, 4, 'Gamma'), { ...OPTS, params: flat });
  close(a.pHome, b.pAway, 'local y visitante');
  close(a.pDraw, b.pDraw, 'empate');
  close(a.pAway, b.pHome, 'visitante y local');
  close(a.xgHome, b.xgAway, 'goles esperados');
  assert.deepEqual(a.score, [...b.score].reverse());
  // Con el factor de campo, cada uno es mejor en casa que fuera.
  const c = forecastMatch(g1, matchOf(g1, 4, 'Beta'), OPTS);
  const d = forecastMatch(g2, matchOf(g2, 4, 'Gamma'), OPTS);
  assert.ok(c.pHome > d.pAway, 'Beta, mejor en casa');
  assert.ok(d.pHome > c.pAway, 'Gamma, mejor en casa');
  // Y outcome es simétrico por sí solo.
  for (const [h, a2] of [[4.2, 3.1], [1.1, 6.5], [2, 2.0000001]]) {
    const x = outcome(h, a2), y = outcome(a2, h);
    close(x.pHome, y.pAway, `${h}-${a2}`);
    close(x.pDraw, y.pDraw, `${h}-${a2}`);
  }
});

test('sin datos, nada: sin partidos jugados, con menos jornadas que minRounds, o ya jugado', () => {
  const empty = makeGroup(BASE.map(ms => ms.map(r => row(r[0], r[1], r[2]))));
  assert.equal(forecastMatch(empty, matchOf(empty, 4, 'Alfa'), OPTS), null);
  assert.deepEqual(forecastRound(empty, empty.rounds[3], OPTS), [null, null, null]);
  assert.equal(fitRatings([]), null);
  // Con la jornada 1 jugada, la 2 tiene una sola jornada detrás: no se muestra (minRounds 2)…
  const one = makeGroup([BASE[0], ...BASE.slice(1).map(ms => ms.map(r => row(r[0], r[1], r[2])))]);
  assert.ok(PARAMS.minRounds >= 2);
  assert.equal(forecastMatch(one, matchOf(one, 2, 'Alfa'), OPTS), null);
  // …aunque el modelo sí podría (el backtest lo mide desde la primera).
  assert.ok(forecastMatch(one, matchOf(one, 2, 'Alfa'), { ...OPTS, params: { ...PARAMS, minRounds: 1 } }));
  // La jornada 1 no tiene nada detrás.
  const group = makeGroup();
  assert.equal(forecastMatch(group, { ...matchOf(group, 1, 'Alfa'), hs: null, as: null }, OPTS), null);
  // Un partido con marcador no se pronostica.
  assert.equal(forecastMatch(group, matchOf(group, 3, 'Beta'), OPTS), null);
  assert.equal(forecastMatch(group, null, OPTS), null);
});

test('con today, solo los pendientes: ni el de fecha pasada sin resultado ni el que no tiene fecha', () => {
  const group = makeGroup();
  const m = matchOf(group, 4, 'Alfa');
  assert.ok(forecastMatch(group, m, { ...OPTS, today: '2026-10-20' }));
  assert.ok(forecastMatch(group, m, { ...OPTS, today: '2026-10-24' }), 'el mismo día, aún pendiente');
  assert.equal(forecastMatch(group, m, { ...OPTS, today: '2026-10-25' }), null);
  assert.equal(forecastMatch(group, { ...m, dateISO: null }, { ...OPTS, today: '2026-10-20' }), null);
});

test('los retirados no cuentan, y sus partidos no se pronostican', () => {
  // Retirado CF: en el calendario, fuera de la tabla, y solo con derrotas sin marcar (retiredTeams, regla 2).
  const withRetired = BASE.map((ms, i) => [
    ...ms,
    ...(i === 0 ? [row('2026-10-03', 'Retirado CF', 'Delta', 0, 3)] : []),
    ...(i === 1 ? [row('2026-10-10', 'Alfa', 'Retirado CF', 15, 0)] : []),
    ...(i === 2 ? [row('2026-10-17', 'Retirado CF', 'Zeta', 0, 12)] : []),
    ...(i === 3 ? [row('2026-10-24', 'Retirado CF', 'Gamma')] : []),
  ]);
  const base = makeGroup(), g = makeGroup(withRetired, { unlisted: ['Retirado CF'] });
  assert.deepEqual(numbers(forecastMatch(g, matchOf(g, 4, 'Alfa'), OPTS)), numbers(forecastMatch(base, matchOf(base, 4, 'Alfa'), OPTS)));
  assert.equal(forecastMatch(g, matchOf(g, 4, 'Retirado CF'), OPTS), null);
  assert.ok(!trainingFor(g, matchOf(g, 4, 'Alfa')).some(m => m.home === 'Retirado CF' || m.away === 'Retirado CF'));
});

test('lo que puede ser de mesa no cuenta: todo 3-0 o 1-0, con hora o sin ella, y un campo «EXCLUIDO» o «SUSPENDIDO»', () => {
  // El bot guarda los de mesa de 2026-27 con la hora del partido (los 0-3 de AL20, AL32 y AL9 de alevín).
  const desk = (hs, as, time, venue) => BASE.map((ms, i) => (i === 2 ? [...ms, row('2026-10-17', 'Épsilon', 'Zeta', hs, as, time, venue)] : ms));
  const base = makeGroup();
  const ref = numbers(forecastMatch(base, matchOf(base, 4, 'Zeta'), OPTS));
  for (const [hs, as] of [[3, 0], [0, 3], [1, 0], [0, 1]]) {
    for (const time of [null, '11:30']) {
      const g = makeGroup(desk(hs, as, time));
      assert.ok(isDeskResult(matchOf(g, 3, 'Épsilon')), `${hs}-${as} ${time || 'sin hora'}`);
      assert.deepEqual(numbers(forecastMatch(g, matchOf(g, 4, 'Zeta'), OPTS)), ref, `${hs}-${as} ${time || 'sin hora'} no cuenta`);
    }
  }
  // Cerruda B en PGC3 de 2014-15: sus partidos, en un campo «EXCLUIDO», con el marcador que sea.
  for (const venue of ['EXCLUIDO', '*SUSPENDIDO*']) {
    const g = makeGroup(desk(14, 0, '12:00', venue));
    assert.ok(isDeskResult(matchOf(g, 3, 'Épsilon')), venue);
    assert.deepEqual(numbers(forecastMatch(g, matchOf(g, 4, 'Zeta'), OPTS)), ref, venue);
  }
  // Un 4-0, un 2-0 o un 3-1 son de verdad, y cuentan; también en un campo que no es la palabra sola.
  for (const [hs, as] of [[4, 0], [2, 0], [3, 1]]) assert.equal(isDeskResult({ hs, as, time: null }), false, `${hs}-${as}`);
  assert.equal(isDeskResult({ hs: 4, as: 0, time: '10:00', venue: 'CAMPO EXCLUIDO DE OBRAS' }), false);
  assert.equal(isDeskResult({ hs: null, as: null, venue: 'EXCLUIDO' }), false, 'sin marcador, nada');
  const real = makeGroup(desk(4, 0, '11:30'));
  assert.notDeepEqual(numbers(forecastMatch(real, matchOf(real, 4, 'Zeta'), OPTS)), ref, 'un 4-0 cuenta');
});

test('las copias de la importación del archivo no cuentan: la del equipo que juega dos veces en la jornada', () => {
  // Como en PGC1 de 2023-24: el filial (Alfa B) pierde 1-9 con Omega y la copia se le apunta también a
  // Alfa, que esa jornada juega su partido (7-2 con Beta).
  const filial = BASE.map((ms, i) => (i === 1 ? [...ms, row('2026-10-11', 'Alfa B', 'Omega', 1, 9)] : ms));
  const copied = filial.map((ms, i) => (i === 1 ? [...ms, row('2026-10-11', 'Alfa', 'Omega', 1, 9, null, null)] : ms));
  const ref = makeGroup(filial), g = makeGroup(copied);
  const copy = g.rounds[1].matches.find(m => m.home === 'Alfa' && m.away === 'Omega');
  assert.deepEqual([...copiedMatches(g)], [copy]);
  assert.deepEqual(numbers(forecastMatch(g, matchOf(g, 4, 'Alfa'), OPTS)), numbers(forecastMatch(ref, matchOf(ref, 4, 'Alfa'), OPTS)));
  assert.ok(!trainingFor(g, matchOf(g, 4, 'Alfa')).includes(copy));
  assert.ok(trainingFor(g, matchOf(g, 4, 'Alfa')).some(m => m.home === 'Alfa B'), 'el del filial, sí');
  // Si no se sabe cuál es la buena (los dos solo juegan ese), ninguna; el mismo partido dos veces, una.
  const unsure = makeGroup(BASE.map((ms, i) => (i === 1 ? [...ms, row('2026-10-11', 'Alfa B', 'Omega', 1, 9), row('2026-10-11', 'Beta B', 'Omega', 1, 9)] : ms)));
  assert.equal(copiedMatches(unsure).size, 2);
  const twice = makeGroup(BASE.map((ms, i) => (i === 1 ? [...ms, ms[0]] : ms)));
  assert.equal(copiedMatches(twice).size, 1);
  assert.equal(trainingFor(twice, matchOf(twice, 4, 'Alfa')).length, 9);
  // En una liguilla de copa de un día, un equipo juega varias veces en la misma «jornada»: nada.
  assert.equal(copiedMatches({ ...g, kind: 'cup-league' }).size, 0);
  // En los grupos de siempre, ninguna.
  assert.equal(copiedMatches(makeGroup()).size, 0);
});

test('lo que la app da por retirado, anulado o suspendido no cuenta ni se pronostica', () => {
  const group = makeGroup();
  const off = new Set(['Alfa|Zeta']);
  const status = m => (off.has(`${m.home}|${m.away}`) ? { state: 'anulado', note: null, start: null }
    : m.home === 'Beta' && m.away === 'Gamma' ? { state: 'retirado', note: null, start: null }
    : m.home === 'Zeta' && m.away === 'Épsilon' ? { state: 'aplazado', note: null, start: null } : null);
  const f = forecastMatch(group, matchOf(group, 4, 'Alfa'), { ...OPTS, status });
  assert.equal(f.matches, 8, 'sin el Alfa–Zeta anulado');
  assert.equal(forecastMatch(group, matchOf(group, 4, 'Beta'), { ...OPTS, status }), null);
  assert.ok(forecastMatch(group, matchOf(group, 4, 'Zeta'), { ...OPTS, status }), 'un aplazado se pronostica');
});

test('nada fuera del prebenjamín de la temporada del portal; el backtest lo abre a otra con prueba', () => {
  const group = makeGroup();
  const m = matchOf(group, 4, 'Alfa');
  const benj = makeGroup(BASE, { cat: 'benjamin', id: 'FF9' });
  const alev = makeGroup(BASE, { cat: 'alevin', id: 'AL9' });
  assert.equal(forecastMatch(benj, matchOf(benj, 4, 'Alfa'), OPTS), null);
  assert.equal(forecastMatch(alev, matchOf(alev, 4, 'Alfa'), OPTS), null);
  assert.equal(forecastMatch(benj, matchOf(benj, 4, 'Alfa'), { ...OPTS, prueba: true }), null, 'prueba no abre otra categoría');
  assert.equal(forecastMatch(group, m, {}), null, 'sin la temporada del portal');
  assert.equal(forecastMatch(group, m, { portalSeason: '2027-2028' }), null, 'de otra temporada');
  assert.ok(forecastMatch(group, m, { portalSeason: '2027-2028', prueba: true }), 'el backtest');
  // En la web, solo ligas: ni un cuadro de copa ni una liguilla de copa; el backtest, con prueba, también
  // prueba el modelo con las liguillas (un cuadro no tiene empates).
  assert.equal(forecastApplies({ ...group, kind: 'cup-bracket' }, OPTS), false);
  assert.equal(forecastApplies({ ...group, kind: 'cup-league' }, OPTS), false);
  assert.equal(forecastApplies({ ...group, kind: 'cup-league' }, { prueba: true }), true);
  assert.equal(forecastApplies({ ...group, kind: 'cup-bracket' }, { prueba: true }), false);
  assert.equal(forecastApplies(null, OPTS), false);
});

test('determinista: la misma entrada da lo mismo, también con el grupo reconstruido', () => {
  const a = makeGroup(), b = makeGroup();
  const first = forecastRound(a, a.rounds[3], OPTS);
  assert.deepEqual(forecastRound(a, a.rounds[3], OPTS), first);
  assert.deepEqual(forecastRound(b, b.rounds[3], OPTS), first);
  assert.equal(first.length, 3);
  assert.ok(first.every(Boolean));
});

test('el entrenamiento: solo jornadas anteriores, con marcador y fecha; un aplazado usa las que se jugaron antes', () => {
  const group = makeGroup();
  const m4 = matchOf(group, 4, 'Alfa');
  const used = trainingFor(group, m4);
  assert.equal(used.length, 9);
  assert.ok(used.every(m => m.roundKey !== m4.roundKey && m.dateISO < m4.dateISO));
  // Uno de la 5 adelantado al mismo día que el de la 4 (24/10) y ya con marcador: no entra (es del mismo
  // día, no de antes); uno del 23, sí.
  const ahead = date => makeGroup(BASE.map((ms, i) => (i === 4 ? [row(date, 'Gamma', 'Zeta', 7, 1), ms[1], ms[2]] : ms)));
  const same = ahead('2026-10-24'), before = ahead('2026-10-23');
  assert.equal(trainingFor(same, matchOf(same, 4, 'Alfa')).length, 9);
  assert.ok(!trainingFor(same, matchOf(same, 4, 'Alfa')).some(m => m.dateISO === '2026-10-24'));
  assert.equal(trainingFor(before, matchOf(before, 4, 'Alfa')).length, 10);
  // Un partido de la jornada 2 aplazado al 26/10: cuenta con la 1 y la 3, nunca con los de la 2.
  const late = { ...matchOf(group, 2, 'Alfa'), hs: null, as: null, dateISO: '2026-10-26' };
  const lateUsed = trainingFor(group, late);
  assert.equal(lateUsed.length, 6);
  assert.ok(lateUsed.every(m => m.roundKey !== late.roundKey));
  // La caché de los ajustes no los confunde: antes, el de la 2 en su fecha (solo la 1 detrás: sin
  // pronóstico) y luego el aplazado, en el mismo grupo, con su propio ajuste.
  const fresh = makeGroup();
  const onTime = { ...matchOf(fresh, 2, 'Alfa'), hs: null, as: null };
  assert.equal(forecastMatch(fresh, onTime, OPTS), null);
  assert.equal(forecastMatch(fresh, onTime, { ...OPTS, params: { ...PARAMS, minRounds: 1 } }).matches, 3);
  const moved = forecastMatch(fresh, { ...onTime, dateISO: '2026-10-26' }, OPTS);
  assert.equal(moved.rounds, 2);
  assert.equal(moved.matches, 6);
  assert.equal(forecastMatch(group, late, OPTS).rounds, 2);
});

test('la contracción: con más partidos ficticios, todos más cerca de la media; sin partidos, en ella', () => {
  const group = makeGroup();
  const used = trainingFor(group, matchOf(group, 4, 'Alfa'));
  const spread = k => {
    const fit = fitRatings(used, { ...PARAMS, shrink: k });
    return Math.max(...[...fit.teams.values()].flatMap(t => [Math.abs(Math.log(t.attack)), Math.abs(Math.log(t.defense))]));
  };
  assert.ok(spread(0.5) > spread(PARAMS.shrink) && spread(PARAMS.shrink) > spread(10) && spread(10) > spread(1000));
  assert.ok(spread(1000) < 0.01, 'con mil partidos ficticios, todos en la media');
  // Alfa, el mejor ataque y la mejor defensa (encaja menos que la media).
  const fit = fitRatings(used);
  const alfa = fit.teams.get('Alfa');
  for (const [name, t] of fit.teams) {
    if (name === 'Alfa') continue;
    assert.ok(alfa.attack > t.attack, `ataque de Alfa frente a ${name}`);
  }
  assert.ok(alfa.defense < 1);
  // Un equipo que aún no ha jugado queda en la media, y el pronóstico solo miraría al rival: no se
  // muestra (minPlayed); con minPlayed 0, el del recién llegado.
  const newcomer = { ...matchOf(group, 4, 'Alfa'), away: 'Nuevo' };
  assert.equal(PARAMS.minPlayed, 1);
  assert.equal(forecastMatch(group, newcomer, OPTS), null);
  assert.equal(forecastMatch(group, { ...newcomer, home: 'Nuevo', away: 'Alfa' }, OPTS), null);
  const f = forecastMatch(group, newcomer, { ...OPTS, params: { ...PARAMS, minPlayed: 0 } });
  assert.equal(f.playedAway, 0);
  close(f.xgAway, fit.base * 1 * alfa.defense, 'goles del recién llegado');
});

test('con today, solo la próxima jornada: la 4 sí y la 5 no; sin today (el backtest), todas', () => {
  const group = makeGroup();
  const at = today => ({ ...OPTS, today });
  // La 3 ya jugada; la 4, el 24 y el 25; la 5, el 31 y el 1: el horizonte, seis días después del 24.
  assert.equal(horizonOf(group, '2026-10-20'), '2026-10-30');
  assert.ok(forecastRound(group, group.rounds[3], at('2026-10-20')).every(Boolean));
  assert.deepEqual(forecastRound(group, group.rounds[4], at('2026-10-20')), [null, null, null]);
  assert.ok(forecastRound(group, group.rounds[4], OPTS).every(Boolean), 'sin today, sin límite');
  // El sábado 24, con dos de la 4 jugados: lo que falta de la 4 (el domingo) y la 5 entera.
  const half = makeGroup(BASE.map((ms, i) => (i === 3 ? [row('2026-10-24', 'Zeta', 'Épsilon', 2, 5), row('2026-10-24', 'Alfa', 'Delta', 6, 3), ms[2]] : ms)));
  assert.equal(horizonOf(half, '2026-10-24'), '2026-11-06');
  assert.ok(forecastMatch(half, matchOf(half, 4, 'Beta'), at('2026-10-24')), 'el del domingo');
  assert.ok(forecastRound(half, half.rounds[4], at('2026-10-24')).every(Boolean), 'la 5');
  // Una jornada sin resultados y con la fecha pasada (la fuente aún no los ha publicado) no atasca.
  const stale = makeGroup(BASE.map((ms, i) => (i === 2 ? ms.map(r => row(r[0], r[1], r[2])) : ms)));
  assert.equal(horizonOf(stale, '2026-10-20'), '2026-10-30');
  assert.ok(forecastRound(stale, stale.rounds[3], at('2026-10-20')).every(Boolean));
  // Un aplazado de la 2: al 27/10, dentro del horizonte, sí (con la 1 y la 3); al 15/11, no.
  const moved = date => makeGroup(BASE.map((ms, i) => (i === 1 ? [ms[0], ms[1], row(date, 'Alfa', 'Beta')] : ms)));
  const soon = moved('2026-10-27'), late = moved('2026-11-15');
  assert.equal(forecastMatch(soon, matchOf(soon, 2, 'Alfa'), at('2026-10-20')).rounds, 2);
  assert.equal(forecastMatch(late, matchOf(late, 2, 'Alfa'), at('2026-10-20')), null);
  assert.ok(forecastMatch(late, matchOf(late, 2, 'Alfa'), OPTS), 'sin today, sí');
  // Los resultados de un retirado (la federación le apunta sus 0-3 por adelantado) o de mesa en una
  // jornada futura no la dan por jugada: el horizonte sigue en la 4.
  const ahead = makeGroup(BASE.map((ms, i) => [
    ...ms,
    ...(i === 0 ? [row('2026-10-03', 'Retirado CF', 'Delta', 0, 3)] : []),
    ...(i === 4 ? [row('2026-10-31', 'Retirado CF', 'Beta', 0, 3)] : []),
  ]), { unlisted: ['Retirado CF'] });
  assert.equal(horizonOf(ahead, '2026-10-20'), '2026-10-30');
  const desk = makeGroup(BASE.map((ms, i) => (i === 4 ? [...ms.slice(0, 2), row('2026-11-01', 'Épsilon', 'Alfa', 0, 3)] : ms)));
  assert.equal(horizonOf(desk, '2026-10-20'), '2026-10-30');
  // Con todo lo que queda ya en jornadas con resultados (los aplazados del final), sin límite.
  const tail = makeGroup([...BASE.slice(0, 3), BASE[3].map((r, i) => (i ? row(r[0], r[1], r[2], 3, 2) : row('2026-12-12', r[1], r[2])))]);
  assert.equal(horizonOf(tail, '2026-10-26'), null);
  assert.ok(forecastMatch(tail, matchOf(tail, 4, 'Zeta'), at('2026-10-26')));
});

test('las goleadas, amortiguadas: por encima de soften, los goles esperados crecen con el logaritmo', () => {
  // Un grupo de goleadas: Alfa marca 18, 15 y 16 y Zeta encaja 18, 14 y 13. Alfa–Zeta, muy por encima
  // del umbral (8) sin amortiguar.
  const group = makeGroup([
    [row('2026-10-03', 'Alfa', 'Zeta', 18, 0), row('2026-10-03', 'Beta', 'Épsilon', 4, 3), row('2026-10-04', 'Gamma', 'Delta', 5, 5)],
    [row('2026-10-10', 'Zeta', 'Delta', 0, 14), row('2026-10-10', 'Épsilon', 'Gamma', 3, 4), row('2026-10-11', 'Alfa', 'Beta', 15, 2)],
    [row('2026-10-17', 'Beta', 'Zeta', 13, 1), row('2026-10-17', 'Gamma', 'Alfa', 2, 16), row('2026-10-18', 'Delta', 'Épsilon', 4, 4)],
    ...BASE.slice(3),
  ]);
  const m = { ...matchOf(group, 4, 'Alfa'), away: 'Zeta' };
  const raw = forecastMatch(group, m, { ...OPTS, params: { ...PARAMS, soften: Infinity } });
  const soft = forecastMatch(group, m, OPTS);
  const t = PARAMS.soften;
  assert.equal(t, 8);
  assert.ok(raw.xgHome > t + 2, String(raw.xgHome));
  close(soft.xgHome, t * (1 + Math.log(raw.xgHome / t)), 'el del local');
  assert.ok(soft.xgHome < raw.xgHome && soft.xgHome > t);
  close(soft.xgAway, raw.xgAway, 'el visitante, por debajo, igual');
  assert.ok(soft.score[0] <= raw.score[0] && soft.pick === raw.pick);
  // Por debajo del umbral, nada cambia.
  const mid = matchOf(group, 4, 'Beta');
  assert.deepEqual(numbers(forecastMatch(group, mid, OPTS)), numbers(forecastMatch(group, mid, { ...OPTS, params: { ...PARAMS, soften: Infinity } })));
});
