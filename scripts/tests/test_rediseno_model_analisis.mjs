// Plan B1, Tarea 5: análisis de grupo en src/model.js (spec §4.2-§4.4, §4.7,
// §5.3, §7 y casos reales 1, 5 y 6 de §11). Solo fixtures congeladas; `today`
// siempre inyectado.
import test from 'node:test';
import assert from 'node:assert/strict';
import { fixture } from './fixtures/rediseno/load.mjs';
import { currentAt } from './fixtures/rediseno/simulate.mjs';
import {
  buildCups, buildSeason, matchState, retiredTeams, groupFinished, defaultRound,
  roundNotice, coverageNote, homeAwayTable, seasonSummary, lastResults, bestStreaks, teamFixtures, headToHead,
} from '../../src/model.js';

const current = fixture('current-2025-2026');
const historical = fixture('historical-2024-2025');
const season = buildSeason({
  name: current.season, current: true,
  benjamin: current.benjamin, prebenjamin: current.prebenjamin, history: current.history,
});
const past = buildSeason({
  name: historical.season, current: false,
  benjamin: historical.benjamin, prebenjamin: historical.prebenjamin,
});
const group = id => season.groups.find(g => g.id === id);
const round = (g, n) => g.rounds.find(r => r.n === n);
const matchesOf = g => g.rounds.flatMap(r => r.matches);

// El grupo `id` tal como estaba el día `todayISO` (currentAt): sin los marcadores
// de ese día en adelante (las fixtures son de la temporada terminada).
function asOf(id, todayISO) {
  const raw = currentAt(todayISO);
  return buildSeason({ name: raw.season, current: true, ...raw }).groups.find(g => g.id === id);
}

// Copia del grupo con los partidos cambiados por `edit` (null lo quita).
function withMatches(g, edit) {
  return { ...g, rounds: g.rounds.map(r => ({ ...r, matches: r.matches.map(edit).filter(Boolean) })) };
}

test('retiredTeams: Batán en PG2, Teguinte en PFV2 y nadie en PG3 ni en benjamín', () => {
  assert.deepEqual([...retiredTeams(group('PG2'))], ['CD Batán']);
  assert.deepEqual([...retiredTeams(group('PFV2'))], ['CD Teguinte']);
  assert.deepEqual([...retiredTeams(group('PG3'))], []);
  for (const id of ['A1', 'A2', 'B1', 'B2', 'FF5', 'FF9', 'FF13', 'FF15']) assert.deepEqual([...retiredTeams(group(id))], [], id);
});

test('retiredTeams: del calendario sin fila ni resultados también en temporadas pasadas', () => {
  const pgc2 = past.groups.find(g => g.id === 'PGC2');
  assert.deepEqual([...retiredTeams(pgc2)], ['Simusetti']);
  assert.deepEqual([...retiredTeams(past.groups.find(g => g.id === 'P1'))], []);
});

test('retiredTeams: pj = 0 solo cuenta en un grupo terminado', () => {
  // Como CD Calero en PGC2 2021-22: fila con pj 0 y 26 partidos sin marcador.
  const pg2 = group('PG2');
  const noCalero = m => (m.home === 'CD Calero' || m.away === 'CD Calero' ? { ...m, hs: null, as: null } : m);
  const calero = {
    ...withMatches(pg2, noCalero),
    standings: pg2.standings.map(r => (r.team === 'CD Calero' ? { ...r, pj: 0, g: 0, e: 0, p: 0 } : r)),
  };
  assert.deepEqual([...retiredTeams(calero)], ['CD Calero', 'CD Batán']);
  // Sin resultados en la última jornada, el grupo no ha terminado.
  const lastKey = pg2.rounds[pg2.rounds.length - 1].key;
  const open = { ...calero, rounds: calero.rounds.map(r => (r.key === lastKey
    ? { ...r, matches: r.matches.map(m => ({ ...m, hs: null, as: null })) } : r)) };
  assert.deepEqual([...retiredTeams(open)], ['CD Batán']);
});

test('retiredTeams: con la clasificación vacía o sin resultados no hay retirados', () => {
  const pg2 = group('PG2');
  assert.deepEqual([...retiredTeams({ ...pg2, standings: [] })], []);
  const blank = withMatches(group('PFV2'), m => ({ ...m, hs: null, as: null }));
  assert.deepEqual([...retiredTeams(blank)], []);
});

test('buildGroup marca retired en la fila de la clasificación de cada retirado', () => {
  assert.deepEqual(group('PG2').standings.filter(r => r.retired).map(r => r.team), ['CD Batán']);
  // CD Teguinte y Simusetti no tienen fila: no hay nada que marcar.
  assert.ok(group('PFV2').standings.every(r => r.retired === false));
  assert.ok(past.groups.find(g => g.id === 'PGC2').standings.every(r => r.retired === false));
});

test('groupFinished: PG2 terminado el 15/06 y el 23/09 de 2026 (caso real 1)', () => {
  const pg2 = group('PG2');
  assert.equal(groupFinished(pg2, '2026-09-23', '2025-2026'), true);
  assert.equal(groupFinished(pg2, '2026-06-15', '2025-2026'), true);
  assert.equal(groupFinished(pg2, '2026-05-31', '2025-2026'), false);
  assert.equal(groupFinished(asOf('PG2', '2026-06-05'), '2026-06-05', '2025-2026'), false);
});

test('groupFinished: hueco (estado C) de FF13 hasta el 1 de junio; otra temporada, terminado', () => {
  const ff13 = group('FF13');
  assert.equal(groupFinished(ff13, '2026-03-01', '2025-2026'), false);
  assert.equal(groupFinished(ff13, '2026-06-01', '2025-2026'), true);
  assert.equal(groupFinished(ff13, '2026-03-01', '2026-2027'), true);
  assert.equal(groupFinished(past.groups.find(g => g.id === 'P1'), '2026-09-23', '2025-2026'), true);
});

test('groupFinished y defaultRound: los partidos contra retirados no cuentan', () => {
  // Aunque los partidos de CD Teguinte tuvieran fecha futura, seguirían fuera.
  const pfv2 = withMatches(group('PFV2'), m => (m.home === 'CD Teguinte' || m.away === 'CD Teguinte'
    ? { ...m, dateISO: '2026-10-04' } : m));
  const teguinte = matchesOf(pfv2).filter(m => m.home === 'CD Teguinte' || m.away === 'CD Teguinte');
  assert.equal(teguinte.length, 14);
  assert.ok(teguinte.every(m => matchState(m, '2026-09-23') === 'pendiente'));
  assert.equal(groupFinished(pfv2, '2026-09-23', '2025-2026'), true);
  assert.equal(defaultRound(pfv2, '2026-09-23').n, 14);
  // En los datos reales no tienen fecha: 'sin fecha', nunca 'pendiente'.
  const real = matchesOf(group('PFV2')).filter(m => m.home === 'CD Teguinte' || m.away === 'CD Teguinte');
  assert.ok(real.every(m => matchState(m, '2026-09-23') === 'sin fecha'));
});

test('defaultRound: la jornada del primer partido pendiente por fecha', () => {
  assert.equal(defaultRound(group('PG2'), '2026-09-23').n, 30);
  assert.equal(defaultRound(asOf('PG2', '2026-06-03'), '2026-06-03').n, 30);
  assert.equal(defaultRound(asOf('PG2', '2025-09-01'), '2025-09-01').n, 1);
  // A2, 10/01/2026: la jornada 2 tiene un aplazado el 04/02, pero la de ese
  // fin de semana es la 4.
  const a2 = asOf('A2', '2026-01-10');
  assert.ok(round(a2, 2).matches.some(m => m.dateISO === '2026-02-04' && matchState(m, '2026-01-10') === 'pendiente'));
  assert.equal(defaultRound(a2, '2026-01-10').n, 4);
});

test('roundNotice: PG2 jornada 30, sin partido RC Victoria y Arucas B (caso real 5)', () => {
  const pg2 = group('PG2');
  assert.deepEqual(roundNotice(pg2, round(pg2, 30)),
    { kind: 'sin-partido', teams: ['RC Victoria', 'Arucas B'], retired: ['CD Batán'], missing: 0 });
  // Jornadas 1 y 16: descansa Batán y juegan los 14 activos.
  assert.equal(roundNotice(pg2, round(pg2, 1)), null);
  assert.equal(roundNotice(pg2, round(pg2, 16)), null);
});

test('roundNotice: PG3 nunca dice «faltan» aunque falten 2 equipos por jornada', () => {
  const pg3 = group('PG3');
  assert.equal(pg3.rounds.length, 30);
  for (const r of pg3.rounds) {
    const notice = roundNotice(pg3, r);
    if (r.n === 4 || r.n === 19) assert.equal(notice, null, `jornada ${r.n}`);
    else {
      assert.equal(notice.kind, 'sin-partido', `jornada ${r.n}`);
      assert.equal(notice.teams.length, 2, `jornada ${r.n}`);
      assert.deepEqual(notice.retired, []);
    }
  }
  assert.deepEqual(roundNotice(pg3, round(pg3, 1)).teams, ['CD Cerruda', 'CD Tablero']);
});

test('roundNotice: PFV2, el rival de CD Teguinte se queda sin partido', () => {
  const pfv2 = group('PFV2');
  assert.deepEqual(roundNotice(pfv2, round(pfv2, 1)), {
    kind: 'sin-partido', teams: ['ATISACHI DE FUERTEVENTURA C.F., C.D. "B"'], retired: ['CD Teguinte'], missing: 0,
  });
});

test('roundNotice: «faltan» solo si la jornada tiene menos partidos que la moda', () => {
  const pg2 = group('PG2');
  const j30 = round(pg2, 30);
  const cut = { ...pg2, rounds: pg2.rounds.map(r => (r === j30 ? { ...r, matches: r.matches.slice(0, 4) } : r)) };
  const notice = roundNotice(cut, round(cut, 30));
  assert.equal(notice.kind, 'faltan');
  assert.equal(notice.missing, 2);
  assert.deepEqual(notice.retired, ['CD Batán']);
  assert.equal(notice.teams.length, 6);
});

test('coverageNote: Las Mesas en PG2, 26 en el calendario y 2 contra CD Batán (caso real 6)', () => {
  const pg2 = group('PG2');
  assert.deepEqual(coverageNote('Las Mesas Hu.', pg2),
    { played: 28, calendar: 26, vsRetired: 2, retired: ['CD Batán'], withResult: 26 });
  assert.equal(coverageNote('CD Batán', pg2), null);
  assert.equal(coverageNote('Equipo que no está', pg2), null);
  // Si además falta un marcador, withResult lo dice.
  let hidden = false;
  const oneLess = withMatches(pg2, m => {
    if (!hidden && m.home === 'Las Mesas Hu.') { hidden = true; return { ...m, hs: null, as: null }; }
    return m;
  });
  assert.deepEqual(coverageNote('Las Mesas Hu.', oneLess),
    { played: 28, calendar: 26, vsRetired: 2, retired: ['CD Batán'], withResult: 25 });
});

test('coverageNote: null cuando el calendario explica todo el PJ (PG3 y PFV2)', () => {
  for (const id of ['PG3', 'PFV2']) {
    for (const row of group(id).standings) assert.equal(coverageNote(row.team, group(id)), null, `${id} ${row.team}`);
  }
});

test('homeAwayTable: Casa y Fuera de PG2 desde el calendario', () => {
  const pg2 = group('PG2');
  const casa = homeAwayTable(pg2, 'casa');
  const fuera = homeAwayTable(pg2, 'fuera');
  assert.equal(casa.length, 15);
  assert.deepEqual(casa.find(r => r.team === 'Las Mesas Hu.'),
    { pos: 9, team: 'Las Mesas Hu.', pts: 16, pj: 13, g: 5, e: 1, p: 7, gf: 40, gc: 64, dg: -24, retired: false });
  assert.deepEqual(fuera.find(r => r.team === 'Las Mesas Hu.'),
    { pos: 9, team: 'Las Mesas Hu.', pts: 15, pj: 13, g: 5, e: 0, p: 8, gf: 44, gc: 56, dg: -12, retired: false });
  assert.deepEqual(casa.slice(0, 2).map(r => [r.team, r.pts, r.dg]), [['Unión Viera', 39, 80], ['Acodetti', 39, 75]]);
  assert.deepEqual(casa[14], { pos: 15, team: 'CD Batán', pts: 0, pj: 0, g: 0, e: 0, p: 0, gf: 0, gc: 0, dg: 0, retired: true });
  // Calendario + las 2 victorias contra el retirado = G/E/P oficiales.
  for (const row of pg2.standings.filter(r => r.team !== 'CD Batán')) {
    const c = casa.find(r => r.team === row.team), f = fuera.find(r => r.team === row.team);
    assert.deepEqual([c.g + f.g + 2, c.e + f.e, c.p + f.p], [row.g, row.e, row.p], row.team);
  }
});

test('homeAwayTable: RangeError con una condición que no es casa ni fuera', () => {
  // Una errata enseñaría la tabla de fuera sin ningún error, como pasaría en crest, formChips o tabbar.
  for (const side of ['local', 'visitante', 'Casa', 'home', 'away', '', undefined]) {
    assert.throws(() => homeAwayTable(group('PG2'), side), RangeError, String(side));
  }
});

test('seasonSummary: «La temporada en cifras» de Las Mesas (maqueta 4)', () => {
  const s = seasonSummary('Las Mesas Hu.', group('PG2'));
  assert.deepEqual([s.pos, s.of, s.pts, s.g, s.e, s.p, s.gf, s.gc], [9, 15, 37, 12, 1, 15, 90, 120]);
  assert.deepEqual([s.perMatch.gf.toFixed(1), s.perMatch.gc.toFixed(1)], ['3.2', '4.6']);
  assert.deepEqual(s.home, { pj: 13, g: 5, e: 1, p: 7, gf: 40, gc: 64, pts: 16 });
  assert.deepEqual(s.away, { pj: 13, g: 5, e: 0, p: 8, gf: 44, gc: 56, pts: 15 });
  const brief = r => [r.gf, r.gc, r.rival, r.side, r.letter, r.match.dateISO];
  assert.deepEqual(brief(s.best), [9, 2, 'CD Calero', 'fuera', 'G', '2026-05-28']);
  assert.deepEqual(brief(s.worst), [1, 11, 'Unión Viera', 'fuera', 'P', '2025-10-19']);
  assert.deepEqual(brief(s.last), [2, 7, 'AD Huracán', 'casa', 'P', '2026-06-02']);
  assert.deepEqual(s.coverage, coverageNote('Las Mesas Hu.', group('PG2')));
});

test('seasonSummary: sin derrotas no hay peor derrota; sin fila, sin puesto', () => {
  const s = seasonSummary('UD Vecindario', group('PG3'));
  assert.deepEqual([s.pos, s.g, s.e, s.p], [1, 26, 0, 0]);
  assert.equal(s.worst, null);
  assert.equal(s.best.letter, 'G');
  const none = seasonSummary('Equipo que no está', group('PG3'));
  assert.deepEqual([none.pos, none.pts, none.perMatch, none.best, none.last, none.coverage], [null, null, null, null, null, null]);
});

test('lastResults: «Últimos cinco» de Las Mesas en PG2, del más antiguo al más reciente (maqueta 4)', () => {
  const last = lastResults('Las Mesas Hu.', group('PG2'));
  assert.deepEqual(last.map(r => [r.rival, r.letter, r.gf, r.gc, r.side, r.match.dateISO]), [
    ['Arucas B', 'E', 1, 1, 'casa', '2026-04-21'],
    ['Telde', 'P', 0, 3, 'fuera', '2026-04-30'],
    ['RC Victoria', 'P', 1, 8, 'casa', '2026-05-05'],
    ['CD Calero', 'G', 9, 2, 'fuera', '2026-05-28'],
    ['AD Huracán', 'P', 2, 7, 'casa', '2026-06-02'],
  ]);
  assert.deepEqual(Object.keys(last[0]).sort(), ['gc', 'gf', 'letter', 'match', 'rival', 'side']);
  // El mismo criterio que seasonSummary: su `last` es el último de la forma.
  assert.deepEqual(last[4], seasonSummary('Las Mesas Hu.', group('PG2')).last);
});

test('lastResults: respeta n y ordena por fecha, no por jornada', () => {
  const pg2 = group('PG2');
  assert.deepEqual(lastResults('Las Mesas Hu.', pg2, 3).map(r => r.rival), ['RC Victoria', 'CD Calero', 'AD Huracán']);
  const all = lastResults('Las Mesas Hu.', pg2, 100);
  assert.equal(all.length, 26);
  assert.deepEqual([all[0].rival, all[0].match.dateISO], ['UD Jinámar', '2025-10-11']);
  assert.deepEqual(lastResults('Las Mesas Hu.', pg2, 0), []);
  // PG3: CD Tablero jugó la jornada 25 (con Estrella CF) después de la 27.
  assert.deepEqual(lastResults('CD Tablero', group('PG3')).map(r => [r.rival, r.letter, r.gf, r.gc, r.side, r.match.dateISO]), [
    ['Ingenio B', 'G', 5, 2, 'fuera', '2026-05-09'],
    ['Maspalomas', 'P', 2, 7, 'casa', '2026-05-15'],
    ['Estrella CF', 'G', 5, 1, 'casa', '2026-05-28'],
    ['Maspa Training B', 'P', 1, 7, 'fuera', '2026-05-29'],
    ['Arguineguín', 'P', 1, 4, 'casa', '2026-06-04'],
  ]);
});

test('lastResults: vacío para un retirado, sin partidos jugados o fuera de una liga', () => {
  assert.deepEqual(lastResults('CD Batán', group('PG2')), []);
  const blank = structuredClone(group('PG2'));
  blank.rounds.forEach(r => r.matches.forEach(m => { m.hs = null; m.as = null; }));
  assert.deepEqual(lastResults('Las Mesas Hu.', blank), []);
  // CD 35600: 14 partidos en el calendario, 2 contra CD Teguinte sin jugar.
  assert.equal(lastResults('CD 35600', group('PFV2'), 100).length, 12);
  // Fase de grupos de la Maspalomas (MCP3): 3 partidos jugados, pero no es liga.
  const cups = fixture('cups-2025-2026');
  const mcp3 = buildCups({ season: '2025-2026', benjamin: cups.benjamin, prebenjamin: cups.prebenjamin })
    .groups.find(g => g.id === 'MCP3');
  assert.equal(mcp3.kind, 'cup-league');
  assert.equal(matchesOf(mcp3).filter(m => m.hs != null && [m.home, m.away].includes('UD Las Mesas Huracán')).length, 3);
  assert.deepEqual(lastResults('UD Las Mesas Huracán', mcp3), []);
});

test('bestStreaks: rachas de prebenjamín, solo de su categoría', () => {
  const { wins, unbeaten } = bestStreaks(season, 'prebenjamin');
  assert.deepEqual(wins.slice(0, 3), [
    { team: 'UD Vecindario', n: 26, groupId: 'PG3' },
    { team: 'Unión Viera', n: 18, groupId: 'PG2' },
    { team: 'Acodetti', n: 15, groupId: 'PG2' },
  ]);
  assert.deepEqual(unbeaten.slice(0, 4), [
    { team: 'UD Vecindario', n: 26, groupId: 'PG3' },
    { team: 'Unión Viera', n: 23, groupId: 'PG2' },
    { team: 'Acodetti', n: 15, groupId: 'PG2' },
    { team: 'AD Huracán', n: 12, groupId: 'PG2' },
  ]);
  assert.deepEqual(wins.find(x => x.team === 'Las Mesas Hu.'), { team: 'Las Mesas Hu.', n: 2, groupId: 'PG2' });
  assert.deepEqual(unbeaten.find(x => x.team === 'Las Mesas Hu.'), { team: 'Las Mesas Hu.', n: 2, groupId: 'PG2' });
  assert.ok([...wins, ...unbeaten].every(x => ['PG2', 'PG3', 'PFV2'].includes(x.groupId)));
  assert.ok(![...wins, ...unbeaten].some(x => x.team === 'CD Batán' || x.team === 'CD Teguinte'));
});

test('bestStreaks: benjamín, un equipo por grupo, y temporadas pasadas', () => {
  const { wins } = bestStreaks(season, 'benjamin');
  assert.deepEqual(wins.slice(0, 2), [
    { team: 'Las Palmas', n: 22, groupId: 'A2' },
    { team: 'Las Torres', n: 22, groupId: 'B2' },
  ]);
  const mesas = wins.filter(x => x.team === 'Las Mesas Hu.').map(x => x.groupId).sort();
  assert.deepEqual(mesas, ['A2', 'FF5']);
  // PGC2 2024-25 con los marcadores reparados por el Plan A2.
  const pastPre = bestStreaks(past, 'prebenjamin');
  assert.deepEqual(pastPre.wins.slice(0, 2), [
    { team: 'Unión Viera', n: 12, groupId: 'PGC2' },
    { team: 'AD Huracán', n: 9, groupId: 'PGC2' },
  ]);
  assert.deepEqual(pastPre.unbeaten.slice(0, 2), [
    { team: 'Unión Viera', n: 20, groupId: 'PGC2' },
    { team: 'AD Huracán', n: 17, groupId: 'PGC2' },
  ]);
  const pastBen = bestStreaks(past, 'benjamin');
  assert.deepEqual(pastBen.wins[0], { team: 'Moya', n: 6, groupId: 'P1' });
  assert.deepEqual(pastBen.unbeaten.slice(0, 2), [
    { team: 'Gáldar CF', n: 6, groupId: 'P1' },
    { team: 'Moya', n: 6, groupId: 'P1' },
  ]);
});

test('coverageNote a mitad de temporada: lo que la clasificación cuenta de más sale de los partidos con resultado', () => {
  // El 25/05/2026 a Las Mesas le quedan dos partidos (28/05 y 02/06) y ya ha pasado sus cuatro
  // jornadas sin partido en el calendario: dos de descanso y dos contra CD Batán.
  const mid = asOf('PG2', '2026-05-25');
  const played = lastResults('Las Mesas Hu.', mid, 100);
  assert.equal(played.length, 24);
  // Su fila de ese día, coherente con el calendario: esos 24 más 2 victorias por incomparecencia (3-0).
  const count = letter => played.filter(r => r.letter === letter).length;
  const gf = played.reduce((n, r) => n + r.gf, 0) + 6, gc = played.reduce((n, r) => n + r.gc, 0);
  const [g, e, p] = [count('G') + 2, count('E'), count('P')];
  const row = { pos: 9, team: 'Las Mesas Hu.', pts: g * 3 + e, pj: 26, g, e, p, gf, gc, dg: gf - gc, retired: false };
  const midGroup = { ...mid, standings: mid.standings.map(r => (r.team === 'Las Mesas Hu.' ? row : r)) };
  assert.deepEqual(coverageNote('Las Mesas Hu.', midGroup),
    { played: 26, calendar: 26, vsRetired: 2, retired: ['CD Batán'], withResult: 24 });
});

test('teamFixtures: próximo partido por fecha, último jugado y lo que queda', () => {
  const brief = m => m && [m.roundKey, m.dateISO, m.home, m.away, m.hs, m.as];
  const june1 = teamFixtures('Las Mesas Hu.', asOf('PG2', '2026-06-01'), '2026-06-01');
  assert.deepEqual(brief(june1.next), ['Jornada 30', '2026-06-02', 'Las Mesas Hu.', 'AD Huracán', null, null]);
  assert.deepEqual(brief(june1.last), ['Jornada 29', '2026-05-28', 'CD Calero', 'Las Mesas Hu.', 2, 9]);
  assert.deepEqual([june1.played, june1.undated, june1.remaining], [25, 0, 1]);
  // Del 03 al 06/06 el grupo sigue abierto, pero Las Mesas ya ha jugado todo su calendario.
  const june3 = teamFixtures('Las Mesas Hu.', asOf('PG2', '2026-06-03'), '2026-06-03');
  assert.deepEqual([june3.next, june3.played, june3.undated, june3.remaining], [null, 26, 0, 0]);
  // Si el partido que le queda no tiene fecha, no hay próximo partido: queda uno sin fecha.
  const undated = withMatches(asOf('PG2', '2026-06-01'), m => (m.dateISO === '2026-06-02' ? { ...m, dateISO: null } : m));
  const f = teamFixtures('Las Mesas Hu.', undated, '2026-06-01');
  assert.deepEqual([f.next, f.played, f.undated, f.remaining], [null, 25, 1, 1]);
});

test('teamFixtures: el aplazado de A2 no es el próximo partido y los de un retirado no cuentan', () => {
  // A2, 10/01/2026: Veteranos–Las Mesas Hu., de la jornada 2, está aplazado al 04/02; el
  // próximo partido de Las Mesas es el de ese mismo día, de la jornada 4.
  const { next } = teamFixtures('Las Mesas Hu.', asOf('A2', '2026-01-10'), '2026-01-10');
  assert.deepEqual([next.roundKey, next.dateISO, next.home, next.away], ['Jornada 4', '2026-01-10', 'Guiniguada', 'Las Mesas Hu.']);
  // PFV2 con los partidos de CD Teguinte fechados el 28/05: nunca son el próximo de Unión Tetir.
  const raw = structuredClone(current);
  for (const rows of Object.values(raw.history.PFV2)) {
    for (const row of rows) if (row[1] === 'CD Teguinte' || row[2] === 'CD Teguinte') row[0] = '28-05-2026';
  }
  const pfv2 = buildSeason({ name: raw.season, current: true, ...raw }).groups.find(g => g.id === 'PFV2');
  const tetir = teamFixtures('Unión Tetir', pfv2, '2026-05-25');
  assert.deepEqual([tetir.next, tetir.played, tetir.undated, tetir.remaining], [null, 12, 0, 0]);
  assert.equal(tetir.last.dateISO, '2026-05-10');
});

test('headToHead: Las Mesas–AD Huracán de PG2 son los dos partidos de PG2, nunca el 2-9 de A2 (caso 7)', () => {
  const h2h = headToHead(group('PG2'), 'Las Mesas Hu.', 'AD Huracán');
  assert.deepEqual(h2h.map(m => [m.groupId, m.dateISO, m.home, m.hs, m.as, m.away]), [
    ['PG2', '2026-02-12', 'AD Huracán', 8, 1, 'Las Mesas Hu.'],
    ['PG2', '2026-06-02', 'Las Mesas Hu.', 2, 7, 'AD Huracán'],
  ]);
  assert.deepEqual(headToHead(group('PG2'), 'AD Huracán', 'Las Mesas Hu.'), h2h);
  // Los mismos nombres jugaron en A2 (el 2-9), que es otro grupo y otra categoría.
  assert.ok(headToHead(group('A2'), 'Las Mesas Hu.', 'AD Huracán').some(m => m.hs === 2 && m.as === 9));
});
