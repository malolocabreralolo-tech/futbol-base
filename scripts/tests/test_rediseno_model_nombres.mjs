// Plan B1, Tarea 6: nombres (spec §3.5) y cronología (spec §4.5, §5.3 y caso
// real 7 de §11) en src/model.js. Solo fixtures congeladas.
import test from 'node:test';
import assert from 'node:assert/strict';
import { fixture } from './fixtures/rediseno/load.mjs';
import { buildSeason, playerName, teamShort, timelineFor } from '../../src/model.js';

const current = fixture('current-2025-2026');
const matchDetail = fixture('matchdetail');
const lineups = fixture('lineups-2025-2026');
const season = buildSeason({
  name: current.season, current: true,
  benjamin: current.benjamin, prebenjamin: current.prebenjamin, history: current.history,
});
const group = id => season.groups.find(g => g.id === id);
const find = (id, home, away) => group(id).rounds.flatMap(r => r.matches)
  .find(m => m.home === home && m.away === away && m.hs != null);

test('playerName: «Apellidos, Nombre» y MAYÚSCULAS de las actas (§3.5)', () => {
  assert.equal(playerName('De La Rosa Perello, Theo'), 'Theo De La Rosa Perello');
  assert.equal(playerName('ALONSO GARCIA, KILIAN JOSE'), 'Kilian Jose Alonso Garcia');
  assert.equal(playerName('GONZÁLEZ LEON, ÁLVARO'), 'Álvaro González Leon');
  assert.equal(playerName('RUIZ DE MARTIN-ESTEBAN DIAZ, FABIO'), 'Fabio Ruiz De Martin-Esteban Diaz');
  assert.equal(playerName('YAHEL ALEJANDRO'), 'Yahel Alejandro');
  assert.equal(playerName('Hmiddouch, Adam'), 'Adam Hmiddouch');
});

test('playerName: la cronología trae el nombre de pila y se deja tal cual', () => {
  for (const name of ['Hugo', 'Luka (p.p.)', 'A. Valencia Gil', 'Papa Djiby']) assert.equal(playerName(name), name);
  assert.equal(playerName(''), '');
  assert.equal(playerName(null), '');
  assert.equal(playerName(undefined), '');
});

test('playerName: en todas las actas congeladas, sin comas, sin MAYÚSCULAS y sin tildes nuevas', () => {
  const letters = s => [...s.toLowerCase().replace(/[\s,]/g, '')].sort().join('');
  const names = new Set();
  for (const entry of Object.values(lineups)) {
    for (const p of [...entry.home, ...entry.away]) names.add(p.n);
    for (const e of entry.events) names.add(e.n);
  }
  assert.ok(names.size >= 100, `solo ${names.size} nombres`);
  for (const raw of names) {
    const out = playerName(raw);
    assert.ok(!out.includes(','), `${raw} → ${out}`);
    assert.ok(!/\p{Lu}{2,}/u.test(out), `${raw} → ${out}`);
    assert.equal(letters(out), letters(raw), `${raw} → ${out}`);
  }
});

test('teamShort: quita siglas y conserva la letra de filial (§3.5)', () => {
  const cases = {
    'UD Las Mesas Huracán': 'Las Mesas Huracán',
    'CF Unión Carrizal': 'Unión Carrizal',
    'AD Huracán': 'Huracán',
    'RC Victoria': 'Victoria',
    'RC Victoria B': 'Victoria B',
    'VICTORIA, REAL CLUB "B"': 'VICTORIA B',
    'Real Club Victoria B': 'Victoria B',
    'Arucas CF B': 'Arucas B',
    'Estrella CF': 'Estrella',
    'CDA El Médano CF': 'El Médano',
    'COTILLO, C.D. EL': 'EL COTILLO',
    'MESAS, U.D. LAS "B"': 'LAS MESAS B',
    'ATISACHI DE FUERTEVENTURA C.F., C.D. "B"': 'ATISACHI DE FUERTEVENTURA B',
    'CORRALEJO B, C.D. "B"': 'CORRALEJO B',
    'EUROPEAN F.U., CD': 'EUROPEAN F.U.',
  };
  for (const [name, short] of Object.entries(cases)) assert.equal(teamShort(name), short, name);
});

test('teamShort: deja igual lo que no lleva siglas y nunca se queda sin letras', () => {
  for (const name of ['Las Mesas Hu.', 'Arucas B', 'Telde', 'Gran Canaria C', 'US Yaiza', 'Playa D.H.', 'CD 35600', 'CD 35600 B']) {
    assert.equal(teamShort(name), name);
  }
});

test('teamShort: «Últimos cinco» de Las Mesas en PG2 (maqueta 4)', () => {
  const played = group('PG2').rounds.flatMap(r => r.matches)
    .filter(m => m.hs != null && (m.home === 'Las Mesas Hu.' || m.away === 'Las Mesas Hu.'))
    .sort((a, b) => a.dateISO.localeCompare(b.dateISO));
  const rivals = played.slice(-5).map(m => teamShort(m.home === 'Las Mesas Hu.' ? m.away : m.home));
  assert.deepEqual(rivals, ['Arucas B', 'Telde', 'Victoria', 'Calero', 'Huracán']);
});

test('timelineFor: Las Mesas–Huracán de PG2 (2–7) no tiene cronología; la 2–9 es de A2 (caso real 7)', () => {
  const pg2 = find('PG2', 'Las Mesas Hu.', 'AD Huracán');
  assert.deepEqual([pg2.dateISO, pg2.hs, pg2.as], ['2026-06-02', 2, 7]);
  assert.equal(timelineFor(pg2, matchDetail, lineups), null);
  // Ni siquiera con el marcador de A2: la entrada es de otro grupo.
  assert.equal(timelineFor({ ...pg2, hs: 2, as: 9 }, matchDetail, lineups), null);
  const a2 = find('A2', 'Las Mesas Hu.', 'AD Huracán');
  const t = timelineFor(a2, matchDetail, lineups);
  assert.equal(t.source, 'futbolaspalmas');
  assert.equal(t.goals.length, 11);
  assert.deepEqual(t.goals[0], { minute: 4, score: '0-1', side: 'away', name: 'Liam' });
  assert.equal(t.mismatch, null);
});

test('timelineFor: «CD Calero|La Garita|1-11» es de FF15 y no del 1-11 de PG2', () => {
  const ff15 = find('FF15', 'CD Calero', 'La Garita');
  const pg2 = find('PG2', 'CD Calero', 'La Garita');
  assert.deepEqual([ff15.hs, ff15.as, pg2.hs, pg2.as], [1, 11, 1, 11]);
  const t = timelineFor(ff15, matchDetail, lineups);
  assert.equal(t.source, 'futbolaspalmas');
  assert.equal(t.goals.length, 12);
  assert.deepEqual(t.goals[0], { minute: 2, score: '0-1', side: 'away', name: 'Luka (p.p.)' });
  assert.equal(timelineFor(pg2, matchDetail, lineups), null);
});

test('timelineFor: con clave repetida ({dup, list}) elige por temporada y grupo', () => {
  const key = 'CD Calero|La Garita|1-11';
  const ff15Entry = matchDetail[key];
  const pg2Entry = { s: '2025-2026', gr: 'PG2', g: ff15Entry.g.map(([m, , score, side, type]) => [m, 'Otro', score, side, type]) };
  const dup = { ...matchDetail, [key]: { dup: true, list: [ff15Entry, pg2Entry] } };
  assert.equal(timelineFor(find('FF15', 'CD Calero', 'La Garita'), dup, lineups).goals[0].name, 'Luka (p.p.)');
  assert.equal(timelineFor(find('PG2', 'CD Calero', 'La Garita'), dup, lineups).goals[0].name, 'Otro');
  const twice = { ...matchDetail, [key]: { dup: true, list: [ff15Entry, ff15Entry] } };
  assert.equal(timelineFor(find('FF15', 'CD Calero', 'La Garita'), twice, lineups), null);
});

test('timelineFor: avisa cuando los goles no cuadran con el marcador', () => {
  // PG2, jornada 5: la cronología de futbolaspalmas da los goles al revés.
  const t = timelineFor(find('PG2', 'RC Victoria', 'Veteranos'), matchDetail, lineups);
  assert.equal(t.source, 'futbolaspalmas');
  assert.deepEqual(t.mismatch, { timeline: '5-2', score: '2-5' });
});

test('timelineFor: goles en propia puerta (tipo o) marcados con (p.p.)', () => {
  const t = timelineFor(find('A1', 'Unión Viera', 'Goleta'), matchDetail, lineups);
  assert.equal(t.goals.length, 19);
  assert.deepEqual(t.goals[0], { minute: 3, score: '1-0', side: 'home', name: 'J. Suarez Rodriguez (p.p.)' });
  assert.equal(t.mismatch, null);
});

test('timelineFor: sin cronología, los goles del acta sin marcador parcial si faltan minutos', () => {
  const m = find('A1', 'Moya', 'Guayarmina');
  const t = timelineFor(m, matchDetail, lineups);
  assert.equal(t.source, 'acta');
  assert.equal(t.goals.length, 14);
  assert.deepEqual(t.goals[0], { minute: 2, score: null, side: 'away', name: 'Liam Garcia Larsen' });
  assert.deepEqual(t.goals[13], { minute: null, score: null, side: 'home', name: 'Álvaro González Leon' });
  assert.equal(t.mismatch, null);
  // El acta con el equipo local cambiado: 20-0 frente al 0-20 oficial.
  assert.deepEqual(timelineFor(find('A1', 'Goleta', 'Arucas'), matchDetail, lineups).mismatch,
    { timeline: '20-0', score: '0-20' });
});

test('timelineFor: acta con todos los minutos, con marcador parcial', () => {
  const t = timelineFor(find('A1', 'UD Valleseco', 'Arucas'), {}, lineups);
  assert.equal(t.source, 'acta');
  assert.deepEqual(t.goals.map(g => [g.minute, g.score, g.side]), [[1, '1-0', 'home'], [30, '1-1', 'away'], [32, '1-2', 'away']]);
});

test('timelineFor: la fuente a veces pone el marcador en lugar del nombre', () => {
  // Entrada real de C3 (Unión Marina 3-1 UD Jinámar, jornada 4).
  const md = { 'Unión Marina|UD Jinámar|3-1': { s: '2025-2026', gr: 'C3', g: [
    [5, 'Marco', '1-0', 'h', 'r'], [11, 'Asier', '1-1', 'a', 'r'], [39, 'Erik', '2-1', 'h', 'r'], [46, '3-1', '3-1', 'h', 'r']] } };
  const match = { season: '2025-2026', groupId: 'C3', home: 'Unión Marina', away: 'UD Jinámar', hs: 3, as: 1 };
  assert.deepEqual(timelineFor(match, md, {}).goals.map(g => g.name), ['Marco', 'Asier', 'Erik', null]);
});

test('timelineFor: sin marcador o sin entrada, null', () => {
  const teguinte = group('PFV2').rounds.flatMap(r => r.matches).find(m => m.home === 'CD Teguinte');
  assert.equal(timelineFor(teguinte, matchDetail, lineups), null);
  assert.equal(timelineFor(find('PG3', 'UD Vecindario', 'CD Ingenio'), {}, {}), null);
});
