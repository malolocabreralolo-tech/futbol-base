// Pronóstico de prebenjamín (src/pronostico.js, 17/10/2026). Solo grupos sintéticos, construidos con el
// buildGroup de model.js como los de la temporada del portal (las jornadas, de la tabla de HISTORY):
// ni los data-*.js de la web, que cambian cada dos horas, ni config.js (R2-1: la temporada del portal
// entra por parámetro).
import test from 'node:test';
import assert from 'node:assert/strict';
import { buildGroup } from '../../src/model.js';
import { PARAMS, fitRatings, forecastApplies, forecastMatch, forecastRound, isDeskResult, outcome, trainingFor } from '../../src/pronostico.js';

const SEASON = '2026-2027';
const OPTS = { portalSeason: SEASON };
const row = (date, home, away, hs = null, as = null, time = '10:00') => [date, home, away, hs, as, null, time, 'CAMPO MUNICIPAL'];

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

test('simetría: dar la vuelta al partido da la vuelta al pronóstico; sin campo, exacta', () => {
  const swapped = BASE.map((ms, i) => (i === 3 ? ms.map(r => (r[1] === 'Beta' ? row(r[0], 'Gamma', 'Beta') : r)) : ms));
  const g1 = makeGroup(), g2 = makeGroup(swapped);
  const flat = { ...PARAMS, home: 1 };
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

test('los resultados de mesa (3-0 o 1-0 sin hora) no cuentan; con hora, sí', () => {
  const desk = (hs, as, time) => BASE.map((ms, i) => (i === 2 ? [...ms, row('2026-10-17', 'Épsilon', 'Zeta', hs, as, time)] : ms));
  const base = makeGroup();
  const ref = numbers(forecastMatch(base, matchOf(base, 4, 'Zeta'), OPTS));
  for (const [hs, as] of [[3, 0], [0, 3], [1, 0], [0, 1]]) {
    const g = makeGroup(desk(hs, as, null));
    assert.ok(isDeskResult(matchOf(g, 3, 'Épsilon')), `${hs}-${as} sin hora es de mesa`);
    assert.deepEqual(numbers(forecastMatch(g, matchOf(g, 4, 'Zeta'), OPTS)), ref, `${hs}-${as} sin hora no cuenta`);
  }
  const real = makeGroup(desk(3, 0, '11:30'));
  assert.equal(isDeskResult(matchOf(real, 3, 'Épsilon')), false);
  assert.notDeepEqual(numbers(forecastMatch(real, matchOf(real, 4, 'Zeta'), OPTS)), ref, 'un 3-0 con hora cuenta');
  // Un 4-0 o un 2-0 sin hora son de verdad.
  for (const [hs, as] of [[4, 0], [2, 0], [3, 1]]) assert.equal(isDeskResult({ hs, as, time: null }), false, `${hs}-${as}`);
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
  // Un cuadro de copa (sin empates) tampoco; una liguilla de copa, sí.
  assert.equal(forecastApplies({ ...group, kind: 'cup-bracket' }, OPTS), false);
  assert.equal(forecastApplies({ ...group, kind: 'cup-league' }, OPTS), true);
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
  // Un partido de la jornada 2 aplazado al 26/10: cuenta con la 1 y la 3, nunca con los de la 2.
  const late = { ...matchOf(group, 2, 'Alfa'), hs: null, as: null, dateISO: '2026-10-26' };
  const lateUsed = trainingFor(group, late);
  assert.equal(lateUsed.length, 6);
  assert.ok(lateUsed.every(m => m.roundKey !== late.roundKey));
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
  // Un equipo que aún no ha jugado queda en la media: el pronóstico solo mira al rival.
  const newcomer = { ...matchOf(group, 4, 'Alfa'), away: 'Nuevo' };
  const f = forecastMatch(group, newcomer, OPTS);
  assert.equal(f.playedAway, 0);
  close(f.xgAway, fit.base * 1 * alfa.defense, 'goles del recién llegado');
});
