// Pronóstico de la clasificación final de prebenjamín (src/proyeccion.js, 19/10/2026): la simulación del
// resto de la liga con el pronóstico de cada partido de src/pronostico.js. Grupos sintéticos, construidos
// con el buildGroup de model.js como los de la temporada del portal (como test_pronostico.mjs), y ligas
// de juguete para simulate: ni los data-*.js de la web, que cambian cada dos horas, ni config.js.
import test from 'node:test';
import assert from 'node:assert/strict';
import { buildGroup } from '../../src/model.js';
import { PARAMS, forecastMatch, forecastOdds } from '../../src/pronostico.js';
import {
  SIM, fanMass, fanOf, playedBy, playedRounds, projectStandings, projection, simulate, standingsStart, startMatchesCalendar,
} from '../../src/proyeccion.js';

const SEASON = '2026-2027';
const OPTS = { portalSeason: SEASON };
const row = (date, home, away, hs = null, as = null, time = '10:00', venue = 'CAMPO MUNICIPAL') => [date, home, away, hs, as, null, time, venue];

// Liga de seis equipos y cinco jornadas (la de test_pronostico.mjs): jugadas la 1, la 2 y la 3; la 4 y la
// 5, por jugar. Alfa, el más fuerte; Zeta, el más flojo.
const BASE = [
  [row('2026-10-03', 'Alfa', 'Zeta', 9, 1), row('2026-10-03', 'Beta', 'Épsilon', 4, 3), row('2026-10-04', 'Gamma', 'Delta', 5, 5)],
  [row('2026-10-10', 'Zeta', 'Delta', 0, 6), row('2026-10-10', 'Épsilon', 'Gamma', 3, 4), row('2026-10-11', 'Alfa', 'Beta', 7, 2)],
  [row('2026-10-17', 'Beta', 'Zeta', 6, 1), row('2026-10-17', 'Gamma', 'Alfa', 2, 8), row('2026-10-18', 'Delta', 'Épsilon', 4, 4)],
  [row('2026-10-24', 'Zeta', 'Épsilon'), row('2026-10-24', 'Alfa', 'Delta'), row('2026-10-25', 'Beta', 'Gamma')],
  [row('2026-10-31', 'Gamma', 'Zeta'), row('2026-10-31', 'Delta', 'Beta'), row('2026-11-01', 'Épsilon', 'Alfa')],
];

// La tabla de los partidos con marcador (sin los equipos de `unlisted`, que la federación quita de su
// clasificación), por puntos: [pos, equipo, pts, J, G, E, P, GF, GC, DF].
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
const web = (group, extra = {}) => projection(group, { start: standingsStart(group), ...OPTS, ...extra });
const close = (a, b, msg, eps = 1e-9) => assert.ok(Math.abs(a - b) < eps, `${msg}: ${a} frente a ${b}`);
const sum = a => [...a].reduce((s, x) => s + x, 0);

test('la tabla final proyectada: un puesto por equipo, por puntos esperados, y las probabilidades que suman 1', () => {
  const group = makeGroup();
  const p = web(group);
  assert.ok(p);
  assert.equal(p.sims, SIM.sims);
  assert.equal(p.rounds, 3);
  assert.equal(p.matches, 6, 'las jornadas 4 y 5');
  assert.deepEqual(p.rows.map(r => r.pos), [1, 2, 3, 4, 5, 6]);
  assert.equal(new Set(p.rows.map(r => r.team)).size, 6);
  for (let i = 1; i < p.rows.length; i += 1) assert.ok(p.rows[i - 1].pts >= p.rows[i].pts, 'por puntos esperados');
  assert.equal(p.rows[0].team, 'Alfa');
  assert.equal(p.rows[5].team, 'Zeta');
  // De cada equipo, la de cada puesto suma 1; y cada puesto es de alguien en cada simulación.
  for (const r of p.rows) close(sum(r.probs), 1, r.team);
  for (let pos = 0; pos < 6; pos += 1) close(sum(p.rows.map(r => r.probs[pos])), 1, `puesto ${pos + 1}`);
  // El abanico, con su puesto dentro y la masa de 3 jornadas jugadas (el 94 %) o más.
  for (const r of p.rows) {
    assert.ok(r.lo <= r.pos && r.pos <= r.hi, r.team);
    assert.ok(r.mass >= fanMass(3) - 1e-9, r.team);
  }
});

test('los puntos esperados, sin sortear: los de la tabla más, de cada partido, 3·P(gana) + P(empate) del pronóstico de la web', () => {
  const group = makeGroup();
  const p = web(group);
  const want = new Map(standingsStart(group).map(r => [r.team, r.pts]));
  for (const round of group.rounds) {
    for (const m of round.matches) {
      if (m.hs != null) continue;
      const f = forecastMatch(group, m, { ...OPTS, full: true });
      assert.ok(f, `${m.home}–${m.away} tiene el pronóstico de la web`);
      // forecastOdds, lo mismo que forecastMatch: el 1X2 y los goles esperados de la web.
      const odds = forecastOdds(group, m, { ...OPTS, full: true });
      for (const k of ['pHome', 'pDraw', 'pAway', 'xgHome', 'xgAway']) assert.equal(odds[k], f[k], k);
      want.set(m.home, want.get(m.home) + 3 * f.pHome + f.pDraw);
      want.set(m.away, want.get(m.away) + 3 * f.pAway + f.pDraw);
    }
  }
  for (const r of p.rows) close(r.pts, want.get(r.team), r.team);
});

test('simulate: el desenlace sorteado manda; los goles van con él aunque los esperados vayan con el otro', () => {
  const teams = ['A', 'B', 'C'];
  const start = [{ pts: 0, gf: 0, gc: 0 }, { pts: 0, gf: 0, gc: 0 }, { pts: 0, gf: 0, gc: 0 }];
  // A gana seguro, con los goles esperados del lado de B: siempre una victoria de A, nunca un marcador que
  // la contradiga. B pierde y C, sin jugar, queda por delante de B por diferencia de goles.
  const [a, b, c] = simulate(teams, start, [{ home: 0, away: 1, pHome: 1, pDraw: 0, pAway: 0, xgHome: 0.5, xgAway: 6 }], { sims: 500 });
  assert.equal(a.pts, 3);
  assert.equal(b.pts, 0);
  assert.ok(a.dg >= 1, `A gana siempre: diferencia ${a.dg}`);
  close(a.dg, -b.dg, 'lo que gana uno, lo pierde el otro');
  assert.deepEqual([...a.probs], [1, 0, 0]);
  assert.deepEqual([...c.probs], [0, 1, 0]);
  assert.deepEqual([...b.probs], [0, 0, 1]);
  // Empate seguro: los mismos goles para los dos, y un punto cada uno.
  const [d, e] = simulate(['D', 'E'], start.slice(0, 2), [{ home: 0, away: 1, pHome: 0, pDraw: 1, pAway: 0, xgHome: 3, xgAway: 3 }], { sims: 200 });
  assert.equal(d.pts, 1);
  assert.equal(e.pts, 1);
  assert.equal(d.dg, 0);
  close(d.gf, e.gf, 'los mismos goles');
  assert.ok(d.gf > 1, 'con 3 y 3 esperados, empates con goles');
});

test('simulate: el orden final, por puntos, diferencia de goles y goles a favor; a igualdad de las tres, a suertes', () => {
  // A, B y C, a 6 puntos y sin partidos: A (DF +4, 5 GF), C (DF +4, 4 GF), B (DF +3, 9 GF). D y E juegan
  // entre ellos y D gana siempre (3 puntos); E se queda en 0.
  const start = [{ pts: 6, gf: 5, gc: 1 }, { pts: 6, gf: 9, gc: 6 }, { pts: 6, gf: 4, gc: 0 }, { pts: 0, gf: 0, gc: 0 }, { pts: 0, gf: 0, gc: 0 }];
  const out = simulate(['A', 'B', 'C', 'D', 'E'], start, [{ home: 3, away: 4, pHome: 1, pDraw: 0, pAway: 0, xgHome: 1, xgAway: 1 }], { sims: 300 });
  const where = r => [...r.probs].indexOf(1) + 1;
  assert.deepEqual(out.map(where), [1, 3, 2, 4, 5]);
  // Dos iguales del todo: a suertes, mitad y mitad (con la semilla fija, siempre la misma mitad).
  const tie = simulate(['X', 'Y'], [{ pts: 1, gf: 1, gc: 1 }, { pts: 1, gf: 1, gc: 1 }], [], { sims: 2000 });
  assert.ok(Math.abs(tie[0].probs[0] - 0.5) < 0.05, `${tie[0].probs[0]}`);
  assert.deepEqual(simulate(['X', 'Y'], [{ pts: 1, gf: 1, gc: 1 }, { pts: 1, gf: 1, gc: 1 }], [], { sims: 2000 }), tie);
});

test('determinista: con la semilla fija, lo mismo cada vez y con el grupo reconstruido; otra semilla, otras probabilidades y los mismos puntos', () => {
  const a = web(makeGroup()), b = web(makeGroup());
  assert.deepEqual(a, b);
  const other = web(makeGroup(), { seed: 7 });
  assert.deepEqual(other.rows.map(r => [r.team, r.pts]), a.rows.map(r => [r.team, r.pts]), 'el puesto y los puntos no dependen de la suerte');
  assert.notDeepEqual(other.rows.map(r => [...r.probs]), a.rows.map(r => [...r.probs]));
});

test('projectStandings: una vez por grupo, opciones y día (el mismo objeto); con un grupo nuevo, se rehace', () => {
  const group = makeGroup();
  const one = projectStandings(group, { ...OPTS, today: '2026-10-19' });
  assert.equal(projectStandings(group, { ...OPTS, today: '2026-10-19', full: true }), one, 'full no cuenta: siempre todo el calendario');
  assert.notEqual(projectStandings(group, { ...OPTS, today: '2026-10-20' }), one);
  assert.notEqual(projectStandings(makeGroup(), { ...OPTS, today: '2026-10-19' }), one);
  assert.deepEqual(projectStandings(makeGroup(), { ...OPTS, today: '2026-10-19' }), one);
});

test('con today: un partido con la fecha pasada y sin resultado se simula igual (con el mismo modelo, sin los mínimos)', () => {
  const group = makeGroup();
  // El 26/10/2026, la jornada 4 ya tendría que estar jugada: la web no la pronostica, pero se jugará.
  const late = projectStandings(group, { ...OPTS, today: '2026-10-26' });
  const early = projectStandings(group, { ...OPTS, today: '2026-10-19' });
  assert.equal(late.matches, 6);
  assert.equal(early.matches, 6);
  const m = group.rounds[3].matches[0];
  assert.equal(forecastMatch(group, m, { ...OPTS, today: '2026-10-26', full: true }), null, 'la web no lo enseña');
});

test('lo que no se simula: los partidos de un retirado y lo que la app da por retirado, anulado o suspendido', () => {
  // Omega no está en la tabla y pierde sus tres partidos 0-3: retirado (retiredTeams), fuera de la
  // proyección, con sus partidos por jugar.
  const rounds = BASE.map((ms, i) => [...ms, i < 3 ? row(ms[0][0], 'Omega', ['Alfa', 'Beta', 'Gamma'][i], 0, 3) : row(ms[0][0], 'Omega', 'Delta')]);
  const group = makeGroup(rounds, { unlisted: ['Omega'] });
  const p = web(group);
  assert.ok(!p.rows.some(r => r.team === 'Omega'));
  assert.equal(p.rows.length, 6);
  assert.equal(p.matches, 6, 'sin el Omega–Delta de la jornada 4 ni el de la 5');
  // La app da por anulado el Alfa–Delta de la jornada 4: no se juega.
  const status = m => (m.home === 'Alfa' && m.away === 'Delta' ? { state: 'anulado' } : null);
  assert.equal(web(makeGroup(), { status }).matches, 5);
});

test('solo donde hay pronóstico de partidos: prebenjamín de la temporada del portal, en liga, con dos jornadas jugadas y algo por jugar', () => {
  assert.equal(web(makeGroup(BASE, { cat: 'benjamin' })), null, 'benjamín');
  assert.equal(web(makeGroup(BASE, { cat: 'alevin' })), null, 'alevín');
  assert.equal(web(makeGroup(BASE, { season: '2025-2026' })), null, 'otra temporada');
  assert.ok(web(makeGroup(BASE, { season: '2025-2026' }), { prueba: true }), 'el backtest la abre a las pasadas');
  // Una sola jornada jugada (PARAMS.minRounds, 2): nada.
  const one = BASE.map((ms, i) => (i === 0 ? ms : ms.map(m => row(m[0], m[1], m[2]))));
  assert.equal(PARAMS.minRounds, 2);
  assert.equal(playedRounds(makeGroup(one)), 1);
  assert.equal(web(makeGroup(one)), null);
  // Todo jugado: nada que pronosticar.
  const done = BASE.map(ms => ms.map(m => (m[3] == null ? [m[0], m[1], m[2], 2, 1, null, m[6], m[7]] : m)));
  assert.equal(web(makeGroup(done)), null);
  // Una liguilla de copa, nunca, ni con prueba.
  const cup = makeGroup();
  assert.equal(projection({ ...cup, kind: 'cup-league' }, { start: standingsStart(cup), ...OPTS, prueba: true }), null);
  // Sin tabla de partida, nada.
  assert.equal(projection(makeGroup(), { start: [], ...OPTS }), null);
});

test('la clasificación de partida, la que enseña la web sin retirados; los partidos jugados que cuentan de cada uno', () => {
  const group = makeGroup();
  assert.deepEqual(standingsStart(group).map(r => r.team), group.standings.map(r => r.team));
  assert.deepEqual(standingsStart(group)[0], { team: 'Alfa', pts: 9, gf: 24, gc: 5 });
  assert.equal(playedBy(group, 'Alfa'), 3);
  assert.equal(playedBy(group, 'Alfa', { before: '2026-10-10' }), 1);
  assert.equal(web(group).rows.find(r => r.team === 'Alfa').played, 3);
});

test('fanOf: los puestos seguidos más juntos con el pronosticado dentro y la masa pedida; fanMass: más masa con menos jornadas', () => {
  const probs = [0.5, 0.3, 0.15, 0.05];
  const fan = (pos, mass) => { const f = fanOf(probs, pos, mass); return [f.lo, f.hi, Math.round(f.mass * 1e9) / 1e9]; };
  assert.deepEqual(fan(1, 0.8), [1, 2, 0.8]);
  assert.deepEqual(fan(2, 0.8), [1, 2, 0.8]);
  assert.deepEqual(fan(3, 0.8), [1, 3, 0.95], 'con el 3.º dentro');
  assert.deepEqual(fan(1, 0.9), [1, 3, 0.95]);
  assert.deepEqual(fan(4, 0.04), [4, 4, 0.05]);
  // A igual anchura, el que más reúne: con el 3.º pronosticado, 2.º-3.º (0,45) mejor que 3.º-4.º (0,2).
  assert.deepEqual(fan(3, 0.2), [2, 3, 0.45]);
  assert.deepEqual(fanOf([0, 0, 1, 0], 3, 0.8), { lo: 3, hi: 3, mass: 1 });
  assert.equal(fanMass(2), 0.96);
  assert.equal(fanMass(6), 0.88);
  assert.equal(fanMass(10), 0.8);
  assert.equal(fanMass(20), 0.8);
  assert.deepEqual(SIM, { sims: 2000, seed: 19102026, fan: 0.8, fanSlope: 0.02 });
});

test('startMatchesCalendar: la clasificación de partida, la que cuadra con el calendario; si va por delante o por detrás, la web no pronostica', () => {
  const group = makeGroup();
  assert.equal(startMatchesCalendar(group), true);
  // Un retirado que el calendario ni trae (como CD Batán en PG2 de 2025-26): la tabla puede contar los
  // partidos de los demás contra él.
  const withAbsent = makeGroup();
  withAbsent.standings.push({ pos: 7, team: 'Ausente', pts: 0, pj: 3, g: 0, e: 0, p: 3, gf: 0, gc: 9, dg: -9, retired: true });
  withAbsent.standings[0].pj += 1; withAbsent.standings[0].pts += 3;
  assert.equal(startMatchesCalendar(withAbsent), true);
  // La tabla va por delante: Alfa con un partido más que el calendario.
  const ahead = makeGroup();
  ahead.standings[0].pj += 1;
  assert.equal(startMatchesCalendar(ahead), false);
  assert.equal(projectStandings(ahead, { ...OPTS, today: '2026-10-19' }), null);
  // Por detrás: la jornada 3 ya con marcador en el calendario y la tabla, de la 2.
  const behind = makeGroup(BASE, {});
  const two = standingsOf(BASE.slice(0, 2));
  behind.standings.forEach((r) => { const t = two.find(x => x[1] === r.team); r.pj = t[3]; });
  assert.equal(startMatchesCalendar(behind), false);
  // Lo que la app da por anulado con marcador, la federación puede contarlo o no.
  const status = m => (m.home === 'Alfa' && m.away === 'Zeta' ? { state: 'anulado' } : null);
  assert.equal(startMatchesCalendar(group, { status }), true);
  const without = makeGroup();
  without.standings.find(r => r.team === 'Alfa').pj -= 1;
  without.standings.find(r => r.team === 'Zeta').pj -= 1;
  assert.equal(startMatchesCalendar(without, { status }), true);
  assert.equal(startMatchesCalendar(without), false);
});
