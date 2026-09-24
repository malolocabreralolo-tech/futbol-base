// Identidad de club, resolución de mi equipo y verano (spec §6), con datos reales congelados.
import test from 'node:test';
import assert from 'node:assert/strict';
import { fixture } from './fixtures/rediseno/load.mjs';
import { currentAt, nextSeasonRaw, teamNames } from './fixtures/rediseno/simulate.mjs';
import { buildSeason, buildCups, matchState, retiredTeams } from '../../src/model.js';
import { TEAM_ALIASES, baseKey, buildClubIndex, sameClub, resolveMyTeam, summerCups, updatedMyTeam } from '../../src/myteam.js';

const shields = fixture('shields');
const season = raw => buildSeason({ name: raw.season, current: true, ...raw });
const real = season(fixture('current-2025-2026'));
const cups = buildCups({ season: '2025-2026', ...fixture('cups-2025-2026') });
const index = buildClubIndex(teamNames(real, cups), shields);
const TODAY = '2026-09-23';
const LAS_MESAS_PG2 = { name: 'Las Mesas Hu.', season: '2025-2026', cat: 'prebenjamin', groupId: 'PG2' };
const summary = result => result.status === 'ask'
  ? { status: 'ask', candidates: result.candidates.map(c => `${c.group.id}|${c.name}`).sort() }
  : result.status === 'ok' ? { status: 'ok', group: `${result.group.season}|${result.group.id}`, name: result.name, cat: result.cat } : result;

test('baseKey quita siglas y la letra de filial final', () => {
  assert.equal(baseKey('Las Mesas Hu.'), 'las mesas hu');
  assert.equal(baseKey('Las Mesas Hu. B'), 'las mesas hu');
  assert.equal(baseKey('RC Victoria'), 'victoria');
  assert.equal(baseKey('RC Victoria B'), 'victoria');
  assert.equal(baseKey('US Yaiza B'), 'yaiza');
  assert.equal(baseKey('MESAS, U.D. LAS "B"'), 'mesas las');
  assert.equal(baseKey('AD Huracán'), 'huracan');
  assert.equal(baseKey('UD Las Mesas Huracán'), 'las mesas huracan');
  assert.equal(baseKey('Arucas CF D'), 'arucas');
});

test('el alias de la Maspalomas es el de la spec', () => {
  assert.deepEqual(TEAM_ALIASES, { 'UD Las Mesas Huracán': 'Las Mesas Hu.' });
});

test('Las Mesas: los cinco nombres reales son el mismo club', () => {
  const names = ['Las Mesas Hu.', 'Las Mesas Hu. B', 'L.Mesas Hu. B', 'Las Mesas B', 'UD Las Mesas Huracán'];
  for (const a of names) for (const b of names) assert.ok(sameClub(index, a, b), `${a} ~ ${b}`);
  assert.ok(index.members('Las Mesas B').includes('MESAS, U.D. LAS "B"'));
});

test('RC Victoria y RC Victoria B son el mismo club aunque el escudo las separa', () => {
  assert.equal(shields['RC Victoria'], 'victoria.png');
  assert.equal(shields['RC Victoria B'], 'victoria2019.png');
  assert.ok(sameClub(index, 'RC Victoria', 'RC Victoria B'));
});

test('filiales reales de Lanzarote (LZ1 y LZ4): US Yaiza y Pto.del Carmen', () => {
  const byName = buildClubIndex(['US Yaiza', 'US Yaiza B', 'Pto.del Carmen', 'Pto. del Carmen B']);
  assert.ok(sameClub(byName, 'US Yaiza', 'US Yaiza B'));
  assert.ok(sameClub(byName, 'Pto.del Carmen', 'Pto. del Carmen B'));
  assert.ok(!sameClub(byName, 'US Yaiza', 'Pto.del Carmen'));
  const byShield = buildClubIndex([], { 'US Yaiza': 'yaiza.png', 'US Yaiza B': 'yaiza.png', 'UNION SUR YAIZA, C.D.': 'yaiza.png' });
  assert.ok(sameClub(byShield, 'US Yaiza B', 'UNION SUR YAIZA, C.D.'));
});

test('Las Mesas Hu. y AD Huracán son clubes distintos, también a través de UD Las Mesas Huracán', () => {
  assert.ok(sameClub(index, 'AD Huracán', 'AD Huracán A'));
  for (const name of ['Las Mesas Hu.', 'UD Las Mesas Huracán', 'Las Mesas B']) {
    assert.ok(!sameClub(index, name, 'AD Huracán'), name);
    assert.ok(!sameClub(index, name, 'AD Huracán B'), name);
  }
  assert.ok(!index.members('UD Las Mesas Huracán').includes('AD Huracán'));
});

test('un nombre fuera del índice se relaciona por sus claves y una clave base vacía no une nada', () => {
  const partial = buildClubIndex(['Las Mesas Hu.', 'Las Mesas B'], { 'Las Mesas Hu.': 'lasMesasEscudo.png', 'Las Mesas B': 'lasMesasEscudo.png' });
  assert.ok(sameClub(partial, 'Las Mesas Hu. B', 'Las Mesas B'));
  assert.ok(!sameClub(partial, 'Las Mesas Hu. B', 'AD Huracán'));
  const empty = buildClubIndex(['Atlético', 'Club Deportivo']);
  assert.equal(baseKey('Atlético'), '');
  assert.ok(!sameClub(empty, 'Atlético', 'Club Deportivo'));
});

test('caso 2: PG2 Las Mesas Hu., también en A2 y FF5, se resuelve sin pregunta (paso 0)', () => {
  assert.deepEqual(summary(resolveMyTeam(LAS_MESAS_PG2, real, index, TODAY)),
    { status: 'ok', group: '2025-2026|PG2', name: 'Las Mesas Hu.', cat: 'prebenjamin' });
  const march = season(currentAt('2026-03-01'));
  assert.equal(summary(resolveMyTeam(LAS_MESAS_PG2, march, index, '2026-03-01')).group, '2025-2026|PG2');
});

test('cambio de fase: FF5 terminado y A2 con partidos pendientes pasa a A2 en silencio', () => {
  const march = season(currentAt('2026-03-01'));
  const myTeam = { name: 'Las Mesas Hu.', season: '2025-2026', cat: 'benjamin', groupId: 'FF5' };
  assert.deepEqual(summary(resolveMyTeam(myTeam, march, index, '2026-03-01')),
    { status: 'ok', group: '2025-2026|A2', name: 'Las Mesas Hu.', cat: 'benjamin' });
});

test('caso 2b: FF13 Las Mesas Hu. B terminado y B2 con Las Mesas B pendiente → pregunta', () => {
  const march = season(currentAt('2026-03-01'));
  const myTeam = { name: 'Las Mesas Hu. B', season: '2025-2026', cat: 'benjamin', groupId: 'FF13' };
  assert.deepEqual(summary(resolveMyTeam(myTeam, march, index, '2026-03-01')),
    { status: 'ask', candidates: ['A2|Las Mesas Hu.', 'B2|Las Mesas B'] });
  // Con la temporada terminada también pregunta: la portada no se queda en FF13, de noviembre.
  assert.deepEqual(summary(resolveMyTeam(myTeam, real, index, TODAY)),
    { status: 'ask', candidates: ['A2|Las Mesas Hu.', 'B2|Las Mesas B'] });
});

test('candidatos por fase más reciente: con FF5, A2, FF13, B2 y PG2 salen 3 (A2, B2 y PG2)', () => {
  const fromLastSeason = { name: 'Las Mesas Hu. B', season: '2024-2025', cat: 'benjamin', groupId: 'P9' };
  assert.deepEqual(summary(resolveMyTeam(fromLastSeason, real, index, TODAY)),
    { status: 'ask', candidates: ['A2|Las Mesas Hu.', 'B2|Las Mesas B', 'PG2|Las Mesas Hu.'] });
});

test('caso 3: 2026/27 con Las Mesas Hu. solo en prebenjamín y Las Mesas B en benjamín → una pregunta', () => {
  const next = season(nextSeasonRaw({ benjamin: ['A1', 'B2', 'FF15'], prebenjamin: ['PG2', 'PG3'] }));
  const nextIndex = buildClubIndex(teamNames(next), shields);
  const first = resolveMyTeam(LAS_MESAS_PG2, next, nextIndex, '2026-10-01');
  assert.deepEqual(summary(first), { status: 'ask', candidates: ['B2|Las Mesas B', 'PG2|Las Mesas Hu.'] });
  // La respuesta fija {season, cat, groupId, name}: en la carga siguiente no se vuelve a preguntar.
  const chosen = first.candidates.find(c => c.group.id === 'PG2');
  const answer = { name: chosen.name, season: chosen.group.season, cat: chosen.cat, groupId: chosen.group.id };
  assert.deepEqual(summary(resolveMyTeam(answer, next, nextIndex, '2026-10-01')),
    { status: 'ok', group: '2026-2027|PG2', name: 'Las Mesas Hu.', cat: 'prebenjamin' });
});

test('caso 2 con 2026/27 activada: paso 1; un solo candidato se usa y ninguno es ausente', () => {
  const onlyPG2 = season(nextSeasonRaw({ benjamin: ['A1'], prebenjamin: ['PG2'] }));
  assert.deepEqual(summary(resolveMyTeam(LAS_MESAS_PG2, onlyPG2, buildClubIndex(teamNames(onlyPG2), shields), '2026-10-01')),
    { status: 'ok', group: '2026-2027|PG2', name: 'Las Mesas Hu.', cat: 'prebenjamin' });
  const without = season(nextSeasonRaw({ benjamin: ['A1'], prebenjamin: ['PG3'] }));
  assert.deepEqual(resolveMyTeam(LAS_MESAS_PG2, without, buildClubIndex(teamNames(without), shields), '2026-10-01'), { status: 'absent' });
});

test('paso 2: un grupo guardado de torneo pregunta si el candidato se llama distinto', () => {
  const fromCup = { name: 'UD Las Mesas Huracán', season: '2025-2026', cat: 'prebenjamin', groupId: 'MCP3' };
  assert.deepEqual(summary(resolveMyTeam(fromCup, real, index, TODAY)), { status: 'ask', candidates: ['PG2|Las Mesas Hu.'] });
  const sameName = { ...LAS_MESAS_PG2, groupId: 'MCP3' };
  assert.equal(summary(resolveMyTeam(sameName, real, index, TODAY)).group, '2025-2026|PG2');
});

test('caso 8: el verano de PG2 Las Mesas son MCP3 y MCPK1, nunca los torneos de benjamín', () => {
  const summer = summerCups(cups, LAS_MESAS_PG2, index);
  assert.deepEqual(summer.map(entry => `${entry.group.id}|${entry.team}`), ['MCP3|UD Las Mesas Huracán', 'MCPK1|UD Las Mesas Huracán']);
  const line = m => `${m.home} ${m.hs}-${m.as} ${m.away}`;
  assert.deepEqual(summer[0].rows.map(line), [
    'UD Las Mesas Huracán 1-4 Real Club Victoria',
    'Arucas CF 2-4 UD Las Mesas Huracán',
    'UD Las Mesas Huracán 2-3 CDA El Médano CF',
  ]);
  assert.deepEqual(summer[1].rows.map(line), [
    'CD Tablero 1-4 UD Las Mesas Huracán',
    'UD Las Mesas Huracán 1-1 CF Unión Carrizal',
    'UD Las Mesas Huracán 2-4 CD Maspa Training A',
  ]);
  assert.equal(summer[1].rows[1].advancer, 'home');
  assert.equal(summer[1].rows[1].shootout, '3-2');
  const benjamin = summerCups(cups, { ...LAS_MESAS_PG2, cat: 'benjamin', groupId: 'A2' }, index);
  assert.deepEqual(benjamin.map(entry => `${entry.group.id}|${entry.team}`), ['MCB16|UD Las Mesas Huracán', 'MCBK2|UD Las Mesas Huracán']);
  assert.deepEqual(summerCups(cups, { name: 'AD Huracán', season: '2025-2026', cat: 'prebenjamin', groupId: 'PG2' }, index), []);
});

test('decisión 19: el verano es el del equipo del torneo con la misma letra de filial, nunca el de sus hermanos', () => {
  // Con la forma real de la Maspalomas 2026: Arucas CF A y Arucas CF B juegan grupos distintos
  // (MCB4 y MCB2, aquí sobre MCB16) y el cuadro MCBK2 (el real) trae partidos de Arucas CF A, B y D.
  const [mcb16, mcbk2] = fixture('cups-2025-2026').benjamin;
  const groupWith = (id, name, renames) => {
    const swap = team => renames[team] ?? team;
    const group = { ...structuredClone(mcb16), id, name, fullName: `Maspalomas Cup 2026 - Benjamín - ${name}` };
    group.standings = group.standings.map(([pos, team, ...rest]) => [pos, swap(team), ...rest]);
    group.matches = group.matches.map(([day, time, home, away, ...rest]) => [day, time, swap(home), swap(away), ...rest]);
    return group;
  };
  const arucasCups = buildCups({ season: '2025-2026', benjamin: [
    groupWith('MCB2', 'Grupo B', { 'Simusetti CF': 'Arucas CF B' }),
    groupWith('MCB4', 'Grupo D', { 'CD Maspalomas A': 'Arucas CF A' }),
    mcbk2,
  ] });
  const summerOf = (name, of = arucasCups) => summerCups(of, { name, season: '2025-2026', cat: 'benjamin', groupId: 'A1' }, index);
  const brief = entries => entries.map(({ group, team, rows }) => `${group.id}|${team}|${rows.length}`);
  // «Arucas», sin letra, es el A: su grupo y sus tres partidos de cuadro (dieciseisavos, octavos y cuartos).
  assert.deepEqual(brief(summerOf('Arucas')), ['MCB4|Arucas CF A|3', 'MCBK2|Arucas CF A|3']);
  assert.deepEqual(brief(summerOf('Arucas B')), ['MCB2|Arucas CF B|3', 'MCBK2|Arucas CF B|1']);
  assert.deepEqual(brief(summerOf('Arucas D')), ['MCBK2|Arucas CF D|1']);
  // Sin equipo del club con su letra, no hay verano: mejor nada que el de otro equipo.
  assert.deepEqual(summerOf('Arucas C'), []);
  for (const name of ['Arucas', 'Arucas B', 'Arucas D']) {
    for (const { team, rows } of summerOf(name)) {
      for (const match of rows) assert.ok(match.home === team || match.away === team, `${name}: ${match.home}-${match.away}`);
    }
  }
  // Dos equipos del club con la misma letra en un grupo («Arucas CF» y «Arucas CF A»): no se sabe cuál es.
  const twins = buildCups({ season: '2025-2026', benjamin: [groupWith('MCB4', 'Grupo D', { 'CD Maspalomas A': 'Arucas CF A', 'Simusetti CF': 'Arucas CF' })] });
  assert.deepEqual(summerOf('Arucas', twins), []);
});

test('decisión 10: FF5 Las Mesas Hu. el 08/11/2025, con la Segunda Fase sin publicar, sigue en FF5 sin preguntar por FF13', () => {
  const raw = currentAt('2025-11-08');
  raw.benjamin = raw.benjamin.filter(g => g.id.startsWith('FF'));
  const ff5 = { name: 'Las Mesas Hu.', season: '2025-2026', cat: 'benjamin', groupId: 'FF5' };
  assert.deepEqual(summary(resolveMyTeam(ff5, season(raw), index, '2025-11-08')),
    { status: 'ok', group: '2025-2026|FF5', name: 'Las Mesas Hu.', cat: 'benjamin' });
});

test('decisión 10: 2025-26 día a día, nadie de las fixtures recibe una pregunta por un equipo de su misma fase', () => {
  // Cada día desde el 01/11/2025 (el primer grupo acaba el 07/11), sin los marcadores de ese día
  // en adelante y solo con los grupos que ya han empezado: la fase siguiente no está publicada
  // hasta su primer partido. Solo puede preguntar el equipo cuyo grupo ya no tiene pendientes.
  const first = Object.fromEntries(real.groups.map(g => [g.id, g.rounds.map(r => r.dateFrom).filter(Boolean).sort()[0]]));
  const samePhase = [];
  let asks = 0;
  for (let t = Date.UTC(2025, 10, 1); t <= Date.UTC(2026, 5, 10); t += 86400000) {
    const day = new Date(t).toISOString().slice(0, 10);
    const raw = currentAt(day);
    for (const cat of ['benjamin', 'prebenjamin']) raw[cat] = raw[cat].filter(g => first[g.id] <= day);
    const built = season(raw);
    for (const g of built.groups) {
      const retired = retiredTeams(g);
      const open = g.rounds.some(r => r.matches.some(m => !retired.has(m.home) && !retired.has(m.away)
        && matchState(m, day) === 'pendiente'));
      if (open) continue;
      for (const { team } of g.standings) {
        const res = resolveMyTeam({ name: team, season: '2025-2026', cat: g.cat, groupId: g.id }, built, index, day);
        if (res.status !== 'ask') continue;
        asks += 1;
        if (res.candidates.some(c => c.group.compKey === g.compKey)) samePhase.push(`${day} ${g.id} ${team}`);
      }
    }
  }
  assert.deepEqual(samePhase, []);
  assert.ok(asks > 0, 'la filial que cambia de nombre (FF13 → B2) sí pregunta');
});

test('decisión 11: Santa Brígida (FF9) está en B1 y en B2: se pregunta por los dos, un candidato por grupo', () => {
  const ff9 = { name: 'Santa Brígida', season: '2025-2026', cat: 'benjamin', groupId: 'FF9' };
  const both = { status: 'ask', candidates: ['B1|Santa Brígida', 'B2|Santa Brígida'] };
  // Al día siguiente de acabar FF9 (08/11/2025) y con la temporada terminada.
  assert.deepEqual(summary(resolveMyTeam(ff9, season(currentAt('2025-11-09')), index, '2025-11-09')), both);
  assert.deepEqual(summary(resolveMyTeam(ff9, real, index, TODAY)), both);
  // Desde 2024-25 (paso 1): el mismo nombre en dos grupos son dos candidatos, más el de PG2.
  const lastSeason = { name: 'Santa Brígida', season: '2024-2025', cat: 'benjamin', groupId: 'P3' };
  assert.deepEqual(summary(resolveMyTeam(lastSeason, real, index, TODAY)),
    { status: 'ask', candidates: ['B1|Santa Brígida', 'B2|Santa Brígida', 'PG2|Santa Brígida'] });
});

test('decisión 12: a final de temporada FF5 pasa a A2 en silencio, y updatedMyTeam dice qué guardar', () => {
  const ff5 = { name: 'Las Mesas Hu.', season: '2025-2026', cat: 'benjamin', groupId: 'FF5' };
  const june = resolveMyTeam(ff5, real, index, '2026-06-15');
  assert.deepEqual(summary(june), { status: 'ok', group: '2025-2026|A2', name: 'Las Mesas Hu.', cat: 'benjamin' });
  assert.deepEqual(updatedMyTeam(ff5, june), { name: 'Las Mesas Hu.', season: '2025-2026', cat: 'benjamin', groupId: 'A2' });
  // Sin cambios, o sin resolución `ok`, no hay nada que guardar.
  assert.equal(updatedMyTeam(LAS_MESAS_PG2, resolveMyTeam(LAS_MESAS_PG2, real, index, TODAY)), null);
  assert.equal(updatedMyTeam(ff5, resolveMyTeam({ ...ff5, groupId: 'FF13', name: 'Las Mesas Hu. B' }, real, index, TODAY)), null);
  assert.equal(updatedMyTeam(ff5, { status: 'absent' }), null);
});

test('summerCups: solo los torneos de la temporada de mi equipo', () => {
  assert.equal(summerCups(cups, LAS_MESAS_PG2, index).length, 2);
  assert.deepEqual(summerCups(cups, { ...LAS_MESAS_PG2, season: '2026-2027' }, index), []);
});

test('decisión 13: en el paso 1, un solo candidato con otro nombre o de otra categoría también se pregunta', () => {
  // «Balos B» de 2025-26 y una 2026/27 en la que el club solo tiene «Balos» (A1, con Moya renombrado).
  const raw = nextSeasonRaw({ benjamin: ['A1'] });
  const rename = name => (name === 'Moya' ? 'Balos' : name);
  raw.benjamin[0].standings = raw.benjamin[0].standings.map(([pos, team, ...rest]) => [pos, rename(team), ...rest]);
  for (const rows of Object.values(raw.history.A1)) for (const row of rows) { row[1] = rename(row[1]); row[2] = rename(row[2]); }
  const next = season(raw);
  const balosB = { name: 'Balos B', season: '2025-2026', cat: 'benjamin', groupId: 'C4' };
  assert.deepEqual(summary(resolveMyTeam(balosB, next, buildClubIndex(teamNames(next), shields), '2026-10-01')),
    { status: 'ask', candidates: ['A1|Balos'] });
  // Las Mesas Hu. de prebenjamín, con el club solo en benjamín: mismo nombre, otra categoría.
  const onlyA2 = season(nextSeasonRaw({ benjamin: ['A2'] }));
  assert.deepEqual(summary(resolveMyTeam(LAS_MESAS_PG2, onlyA2, buildClubIndex(teamNames(onlyA2), shields), '2026-10-01')),
    { status: 'ask', candidates: ['A2|Las Mesas Hu.'] });
});

test('decisión 16: con la Segunda Fase publicada grupo a grupo, Las Mesas ni cambia ni pregunta hasta que existen A2 y B2', () => {
  // 27/11/2025: FF5 y FF13 ya han terminado y la Segunda Fase aún no ha empezado. El club tiene
  // dos equipos en la Primera Fase («Las Mesas Hu.» en FF5 y «Las Mesas Hu. B» en FF13) y dos en
  // la Segunda (A2 y B2). Se publica primero uno de los dos grupos, en cualquier orden.
  const at = ids => { const raw = currentAt('2025-11-27'); raw.benjamin = raw.benjamin.filter(g => ids.includes(g.id)); return season(raw); };
  const ff5 = { name: 'Las Mesas Hu.', season: '2025-2026', cat: 'benjamin', groupId: 'FF5' };
  const ff13 = { name: 'Las Mesas Hu. B', season: '2025-2026', cat: 'benjamin', groupId: 'FF13' };
  const resolve = (myTeam, built) => resolveMyTeam(myTeam, built, index, '2025-11-27');
  for (const first of ['A2', 'B2']) {
    const built = at(['FF5', 'FF13', first]);
    for (const myTeam of [ff5, ff13]) {
      const res = resolve(myTeam, built);
      assert.deepEqual(summary(res), { status: 'ok', group: `2025-2026|${myTeam.groupId}`, name: myTeam.name, cat: 'benjamin' }, `${first} ${myTeam.groupId}`);
      assert.equal(updatedMyTeam(myTeam, res), null);
    }
  }
  // Con los dos grupos publicados: FF5 pasa a A2 en silencio y FF13 pregunta.
  const both = at(['FF5', 'FF13', 'A2', 'B2']);
  assert.deepEqual(summary(resolve(ff5, both)), { status: 'ok', group: '2025-2026|A2', name: 'Las Mesas Hu.', cat: 'benjamin' });
  assert.deepEqual(summary(resolve(ff13, both)), { status: 'ask', candidates: ['A2|Las Mesas Hu.', 'B2|Las Mesas B'] });
});

test('decisión 16: Santa Brígida (FF9), con su filial en la Primera Fase, espera a que existan B1 y B2 y entonces pregunta', () => {
  // En la fuente, «Santa Brígida B» juega FF3, que las fixtures no traen: aquí juega FF15 en lugar
  // de «Ojos de Garza». B1 empieza el 28/11/2025 y B2 el 29/11.
  const at = (day, ids) => {
    const raw = currentAt(day);
    raw.benjamin = raw.benjamin.filter(g => ids.includes(g.id));
    const rename = name => (name === 'Ojos de Garza' ? 'Santa Brígida B' : name);
    const ff15 = raw.benjamin.find(g => g.id === 'FF15');
    ff15.standings = ff15.standings.map(([pos, team, ...rest]) => [pos, rename(team), ...rest]);
    for (const rows of Object.values(raw.history.FF15)) for (const row of rows) { row[1] = rename(row[1]); row[2] = rename(row[2]); }
    return season(raw);
  };
  const ff9 = { name: 'Santa Brígida', season: '2025-2026', cat: 'benjamin', groupId: 'FF9' };
  const onlyB1 = resolveMyTeam(ff9, at('2025-11-28', ['FF9', 'FF15', 'B1']), index, '2025-11-28');
  assert.deepEqual(summary(onlyB1), { status: 'ok', group: '2025-2026|FF9', name: 'Santa Brígida', cat: 'benjamin' });
  assert.equal(updatedMyTeam(ff9, onlyB1), null);
  assert.deepEqual(summary(resolveMyTeam(ff9, at('2025-11-29', ['FF9', 'FF15', 'B1', 'B2']), index, '2025-11-29')),
    { status: 'ask', candidates: ['B1|Santa Brígida', 'B2|Santa Brígida'] });
});

test('decisión 17: el mismo nombre en dos grupos de la fase guardada son dos equipos: se pregunta, nunca en silencio', () => {
  // Como Valsequillo en FF14 y FF17: FF13 con «Las Mesas Hu.» en lugar de «Las Mesas Hu. B».
  const raw = structuredClone(fixture('current-2025-2026'));
  const rename = name => (name === 'Las Mesas Hu. B' ? 'Las Mesas Hu.' : name);
  const ff13 = raw.benjamin.find(g => g.id === 'FF13');
  ff13.standings = ff13.standings.map(([pos, team, ...rest]) => [pos, rename(team), ...rest]);
  for (const rows of Object.values(raw.history.FF13)) for (const row of rows) { row[1] = rename(row[1]); row[2] = rename(row[2]); }
  const twins = season(raw);
  for (const groupId of ['FF5', 'FF13']) {
    const myTeam = { name: 'Las Mesas Hu.', season: '2025-2026', cat: 'benjamin', groupId };
    assert.deepEqual(summary(resolveMyTeam(myTeam, twins, index, TODAY)),
      { status: 'ask', candidates: ['A2|Las Mesas Hu.', 'B2|Las Mesas B'] }, groupId);
  }
});

test('decisión 16: un filial retirado en la fase guardada no hace esperar: el equipo A pasa a su grupo posterior', () => {
  // Como 'CORRALEJO, C.D. "B"' en FV11: «Las Mesas Hu. B» se retira en FF13 (0-0-5 y fuera del
  // calendario, como CD Batán en PG2) y el club solo tiene A2 en la Segunda Fase.
  const raw = structuredClone(fixture('current-2025-2026'));
  raw.benjamin = raw.benjamin.filter(g => g.id !== 'B2');
  const ff13 = raw.benjamin.find(g => g.id === 'FF13');
  ff13.standings = ff13.standings.map(row => (row[1] === 'Las Mesas Hu. B' ? [row[0], row[1], 0, 5, 0, 0, 5, 0, 15, -15] : row));
  for (const [key, rows] of Object.entries(raw.history.FF13)) raw.history.FF13[key] = rows.filter(row => row[1] !== 'Las Mesas Hu. B' && row[2] !== 'Las Mesas Hu. B');
  const built = season(raw);
  assert.deepEqual([...retiredTeams(built.groups.find(g => g.id === 'FF13'))], ['Las Mesas Hu. B']);
  const ff5 = { name: 'Las Mesas Hu.', season: '2025-2026', cat: 'benjamin', groupId: 'FF5' };
  const res = resolveMyTeam(ff5, built, index, TODAY);
  assert.deepEqual(summary(res), { status: 'ok', group: '2025-2026|A2', name: 'Las Mesas Hu.', cat: 'benjamin' });
  assert.deepEqual(updatedMyTeam(ff5, res), { ...ff5, groupId: 'A2' });
});
