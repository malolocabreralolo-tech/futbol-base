// Almacén «futbol-base:v2» y migración desde v1 (Plan B1, Tarea 10; spec §6.5 y §11), y
// «Borrar datos de esta app» (Plan B3, Tarea 1: removeItem y clearStore).
// Usa Storage falsos en memoria y la fixture congelada favorites-v1: nunca
// localStorage ni los data-*.js, ni depende de los valores de src/config.js.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  STORE_KEY, LEGACY_KEY, MAX_RECENT, safeStorage, migrateV1, loadStore, saveStore, addRecent, clearStore,
} from '../../src/store.js';
import { fixture } from './fixtures/rediseno/load.mjs';

// Storage en memoria con la interfaz de localStorage.
class MemoryStorage {
  constructor(entries = {}) { this.data = new Map(Object.entries(entries)); }
  getItem(key) { return this.data.has(key) ? this.data.get(key) : null; }
  setItem(key, value) { this.data.set(key, String(value)); }
  removeItem(key) { this.data.delete(key); }
}

// Storage que falla como Safari en modo privado o con la cuota agotada.
class BrokenStorage {
  getItem() { throw new Error('SecurityError: acceso denegado'); }
  setItem() { throw new Error('QuotaExceededError: cuota agotada'); }
  removeItem() { throw new Error('SecurityError: acceso denegado'); }
}

// Valores de PORTAL escritos a mano: la prueba no depende de src/config.js.
const OPTIONS = { defaultTeam: { cat: 'prebenjamin', groupId: 'PG2', name: 'Las Mesas Hu.' }, portalSeason: '2025-2026' };
const DEFAULT_TEAM = { name: 'Las Mesas Hu.', season: '2025-2026', cat: 'prebenjamin', groupId: 'PG2' };
const MIGRATED = {
  myTeam: { name: 'Las Mesas Hu.', season: '2025-2026', cat: 'prebenjamin', groupId: 'PG2' },
  recent: [{ s: '2025-2026', g: 'PG2', t: 'AD Huracán' }],
};

test('store: claves y máximo de vistos', () => {
  assert.equal(STORE_KEY, 'futbol-base:v2');
  assert.equal(LEGACY_KEY, 'futbol-base:favorites:v1');
  assert.equal(MAX_RECENT, 8);
});

test('safeStorage: getItem y setItem nunca lanzan', () => {
  const ok = safeStorage(new MemoryStorage({ a: '1' }));
  assert.equal(ok.getItem('a'), '1');
  assert.equal(ok.getItem('b'), null);
  assert.equal(ok.setItem('b', '2'), true);
  assert.equal(ok.getItem('b'), '2');
  for (const storage of [new BrokenStorage(), null, undefined, {}]) {
    const broken = safeStorage(storage);
    assert.equal(broken.getItem('a'), null);
    assert.equal(broken.setItem('a', '1'), false);
  }
});

test('safeStorage acepta una función que devuelve el Storage y captura el error de acceder a él', () => {
  const memory = new MemoryStorage({ a: '1' });
  const viaFunction = safeStorage(() => memory);
  assert.equal(viaFunction.getItem('a'), '1');
  assert.equal(viaFunction.setItem('b', '2'), true);
  assert.equal(memory.getItem('b'), '2');
  // Con las cookies bloqueadas, solo con leer el Storage del navegador ya se lanza: un getter que
  // lanza, como el de window.localStorage, y la función que B2 le pasa a safeStorage.
  const browser = Object.defineProperty({}, 'localStorage', {
    get() { throw new Error('SecurityError: The operation is insecure.'); },
  });
  const blocked = () => browser.localStorage;
  assert.throws(blocked, /SecurityError/);
  assert.equal(safeStorage(blocked).getItem('a'), null);
  assert.equal(safeStorage(blocked).setItem('a', '1'), false);
  assert.deepEqual(loadStore(blocked, OPTIONS), { myTeam: DEFAULT_TEAM, recent: [] });
  assert.equal(saveStore(blocked, { myTeam: DEFAULT_TEAM, recent: [] }), false);
  // Y con v1 guardado, la migración funciona igual a través de la función.
  const withV1 = new MemoryStorage({ [LEGACY_KEY]: JSON.stringify(fixture('favorites-v1')) });
  assert.deepEqual(loadStore(() => withV1, OPTIONS), MIGRATED);
  assert.deepEqual(JSON.parse(withV1.getItem(STORE_KEY)), MIGRATED);
});

test('migrateV1: el favorito v1 real pasa a mi equipo con 2025-2026 literal, y el resto a vistos', () => {
  assert.deepEqual(migrateV1(fixture('favorites-v1')), MIGRATED);
});

test('migrateV1: la temporada es la de los favoritos v1, nunca la del portal', () => {
  const v1 = fixture('favorites-v1');
  assert.equal(migrateV1(v1).myTeam.season, '2025-2026');
  assert.deepEqual(migrateV1(v1, '2024-2025'), {
    myTeam: { name: 'Las Mesas Hu.', season: '2024-2025', cat: 'prebenjamin', groupId: 'PG2' },
    recent: [{ s: '2024-2025', g: 'PG2', t: 'AD Huracán' }],
  });
});

test('migrateV1: selected se resuelve con normalizeTeamName contra los equipos de v1', () => {
  const teams = [
    { name: 'Las Mesas Hu.', cat: 'prebenjamin', groupId: 'PG2' },
    { name: 'Las Mesas Hu.', cat: 'benjamin', groupId: 'A2' },
    { name: 'Las Mesas Hu.', cat: 'benjamin', groupId: 'FF5' },
    { name: 'AD Huracán', cat: 'prebenjamin', groupId: 'PG2' },
  ];
  assert.deepEqual(migrateV1({ teams, selected: 'benjamin|A2|las mesas hu' }), {
    myTeam: { name: 'Las Mesas Hu.', season: '2025-2026', cat: 'benjamin', groupId: 'A2' },
    recent: [
      { s: '2025-2026', g: 'PG2', t: 'Las Mesas Hu.' },
      { s: '2025-2026', g: 'FF5', t: 'Las Mesas Hu.' },
      { s: '2025-2026', g: 'PG2', t: 'AD Huracán' },
    ],
  });
  // Sin tildes ni siglas: «AD Huracán» se guardaba como «huracan».
  assert.deepEqual(migrateV1({ teams, selected: 'prebenjamin|PG2|huracan' }).myTeam,
    { name: 'AD Huracán', season: '2025-2026', cat: 'prebenjamin', groupId: 'PG2' });
});

test('migrateV1: un torneo (MC*) se devuelve tal cual para que resolveMyTeam aplique el paso 2', () => {
  const v1 = {
    teams: [
      { name: 'Las Mesas Hu.', cat: 'prebenjamin', groupId: 'PG2' },
      { name: 'UD Las Mesas Huracán', cat: 'prebenjamin', groupId: 'MCP3' },
    ],
    selected: 'prebenjamin|MCP3|las mesas huracan',
  };
  assert.deepEqual(migrateV1(v1), {
    myTeam: { name: 'UD Las Mesas Huracán', season: '2025-2026', cat: 'prebenjamin', groupId: 'MCP3' },
    recent: [{ s: '2025-2026', g: 'PG2', t: 'Las Mesas Hu.' }],
  });
});

test('migrateV1: selected ausente o sin equipo → el primer favorito válido', () => {
  const teams = [
    { name: 'AD Huracán', cat: 'prebenjamin', groupId: 'PG2' },
    { name: 'Las Mesas Hu.', cat: 'prebenjamin', groupId: 'PG2' },
  ];
  for (const selected of [undefined, 'prebenjamin|PG9|nadie']) {
    assert.deepEqual(migrateV1({ teams, selected }), {
      myTeam: { name: 'AD Huracán', season: '2025-2026', cat: 'prebenjamin', groupId: 'PG2' },
      recent: [{ s: '2025-2026', g: 'PG2', t: 'Las Mesas Hu.' }],
    });
  }
});

test('migrateV1: a vistos van los 8 primeros favoritos restantes, sin inválidos ni repetidos', () => {
  const teams = Array.from({ length: 12 }, (_, i) => ({ name: `Equipo ${i}`, cat: 'benjamin', groupId: `FF${i}` }));
  const v1 = {
    teams: [
      null,
      { name: 'Sin categoría', groupId: 'A1' },
      { name: 'Alevín', cat: 'alevin', groupId: 'A1' },
      { name: 42, cat: 'benjamin', groupId: 'A1' },
      { name: 'Sin grupo', cat: 'benjamin' },
      teams[0], teams[0], ...teams.slice(1),
    ],
    selected: 'benjamin|FF5|equipo 5',
  };
  const { myTeam, recent } = migrateV1(v1);
  assert.deepEqual(myTeam, { name: 'Equipo 5', season: '2025-2026', cat: 'benjamin', groupId: 'FF5' });
  assert.equal(recent.length, MAX_RECENT);
  assert.deepEqual(recent.map(e => e.g), ['FF0', 'FF1', 'FF2', 'FF3', 'FF4', 'FF6', 'FF7', 'FF8']);
  assert.deepEqual(recent[0], { s: '2025-2026', g: 'FF0', t: 'Equipo 0' });
});

test('migrateV1: sin favoritos v1 válidos → null', () => {
  for (const v1 of [null, undefined, 'x', 42, [], {}, { teams: 'x' }, { teams: [] },
    { teams: [{ name: 'X', cat: 'alevin', groupId: 'A1' }], selected: 'alevin|A1|x' }]) {
    assert.equal(migrateV1(v1), null, JSON.stringify(v1));
  }
});

test('loadStore: almacén vacío → equipo por defecto con la temporada del portal, sin escribir nada', () => {
  const storage = new MemoryStorage();
  assert.deepEqual(loadStore(storage, OPTIONS), { myTeam: DEFAULT_TEAM, recent: [] });
  assert.deepEqual(loadStore(storage, { ...OPTIONS, portalSeason: '2026-2027' }).myTeam,
    { ...DEFAULT_TEAM, season: '2026-2027' });
  assert.equal(storage.data.size, 0);
});

test('loadStore: con solo v1 migra una vez, escribe v2 y conserva v1 intacto', () => {
  const v1 = JSON.stringify(fixture('favorites-v1'));
  const storage = new MemoryStorage({ [LEGACY_KEY]: v1 });
  // Con 2026/27 ya activada, mi equipo conserva 2025-2026: resolveMyTeam aplicará el paso 1.
  assert.deepEqual(loadStore(storage, { ...OPTIONS, portalSeason: '2026-2027' }), MIGRATED);
  assert.deepEqual(JSON.parse(storage.getItem(STORE_KEY)), MIGRATED);
  assert.equal(storage.getItem(LEGACY_KEY), v1);
  // Segunda carga: manda v2 y v1 ya no se consulta.
  storage.setItem(LEGACY_KEY, JSON.stringify({ teams: [{ name: 'Moya', cat: 'benjamin', groupId: 'A1' }] }));
  assert.deepEqual(loadStore(storage, OPTIONS), MIGRATED);
});

test('loadStore: las claves antiguas season, cat y theme se ignoran y no se tocan', () => {
  const legacy = { season: '2024-2025', cat: 'benjamin', theme: 'light' };
  const storage = new MemoryStorage(legacy);
  assert.deepEqual(loadStore(storage, OPTIONS), { myTeam: DEFAULT_TEAM, recent: [] });
  assert.deepEqual(Object.fromEntries(storage.data), legacy);
});

test('loadStore y saveStore: si el almacenamiento falla, valores por defecto en memoria y sin excepciones', () => {
  for (const storage of [new BrokenStorage(), null, undefined]) {
    assert.deepEqual(loadStore(storage, OPTIONS), { myTeam: DEFAULT_TEAM, recent: [] });
    assert.equal(saveStore(storage, { myTeam: DEFAULT_TEAM, recent: [] }), false);
  }
});

test('loadStore: v2 ilegible → migra v1 si existe; si no, por defecto', () => {
  const v1 = JSON.stringify(fixture('favorites-v1'));
  const withV1 = new MemoryStorage({ [STORE_KEY]: '{roto', [LEGACY_KEY]: v1 });
  assert.deepEqual(loadStore(withV1, OPTIONS), MIGRATED);
  assert.deepEqual(JSON.parse(withV1.getItem(STORE_KEY)), MIGRATED);
  for (const text of ['null', '[]', '"texto"', '{roto']) {
    assert.deepEqual(loadStore(new MemoryStorage({ [STORE_KEY]: text }), OPTIONS), { myTeam: DEFAULT_TEAM, recent: [] }, text);
  }
});

test('loadStore: en v2 cada campo inválido se sanea por separado', () => {
  const recent = [
    { s: '2025-2026', g: 'A2', t: 'Las Mesas Hu.' },
    { s: '2025-2026', g: 'A2', t: 'Las Mesas Hu.' },
    { g: 'PG2' }, 'x', null,
    ...Array.from({ length: 10 }, (_, i) => ({ s: '2025-2026', g: `FF${i}`, t: `Equipo ${i}`, extra: i })),
  ];
  const storage = new MemoryStorage({ [STORE_KEY]: JSON.stringify({
    myTeam: { name: 'Las Mesas Hu.', season: '2025-2026', cat: 'alevin', groupId: 'A1' }, recent,
  }) });
  const out = loadStore(storage, OPTIONS);
  assert.deepEqual(out.myTeam, DEFAULT_TEAM);
  assert.deepEqual(out.recent.map(e => e.g), ['A2', 'FF0', 'FF1', 'FF2', 'FF3', 'FF4', 'FF5', 'FF6']);
  assert.deepEqual(out.recent[1], { s: '2025-2026', g: 'FF0', t: 'Equipo 0' });
  // Sin `recent` válido, vistos vacío y mi equipo guardado se respeta.
  const mine = { name: 'Las Mesas B', season: '2025-2026', cat: 'benjamin', groupId: 'B2' };
  assert.deepEqual(loadStore(new MemoryStorage({ [STORE_KEY]: JSON.stringify({ myTeam: mine }) }), OPTIONS),
    { myTeam: mine, recent: [] });
});

test('saveStore: escribe solo {myTeam, recent} en futbol-base:v2 y no toca v1', () => {
  const v1 = JSON.stringify(fixture('favorites-v1'));
  const storage = new MemoryStorage({ [LEGACY_KEY]: v1 });
  const myTeam = { name: 'Las Mesas B', season: '2025-2026', cat: 'benjamin', groupId: 'B2' };
  const recentList = [{ s: '2025-2026', g: 'PG2', t: 'AD Huracán' }];
  assert.equal(saveStore(storage, { myTeam, recent: recentList, extra: 1 }), true);
  assert.deepEqual(JSON.parse(storage.getItem(STORE_KEY)), { myTeam, recent: recentList });
  assert.equal(storage.getItem(LEGACY_KEY), v1);
  assert.deepEqual(loadStore(storage, OPTIONS), { myTeam, recent: recentList });
});

test('addRecent: lo último visto va primero, sin duplicados y como máximo 8, sin mutar el estado', () => {
  const empty = { myTeam: DEFAULT_TEAM, recent: [] };
  let state = empty;
  for (let i = 0; i < 10; i++) state = addRecent(state, { s: '2025-2026', g: `FF${i}`, t: `Equipo ${i}` });
  assert.deepEqual(state.recent.map(e => e.g), ['FF9', 'FF8', 'FF7', 'FF6', 'FF5', 'FF4', 'FF3', 'FF2']);
  const again = addRecent(state, { s: '2025-2026', g: 'FF5', t: 'Equipo 5', extra: true });
  assert.deepEqual(again.recent.map(e => e.g), ['FF5', 'FF9', 'FF8', 'FF7', 'FF6', 'FF4', 'FF3', 'FF2']);
  assert.deepEqual(again.recent[0], { s: '2025-2026', g: 'FF5', t: 'Equipo 5' });
  assert.equal(again.myTeam, state.myTeam);
  assert.deepEqual(state.recent.map(e => e.g), ['FF9', 'FF8', 'FF7', 'FF6', 'FF5', 'FF4', 'FF3', 'FF2']);
  assert.deepEqual(empty.recent, []);
});

test('addRecent: el mismo equipo en otra temporada es otra entrada; una entrada inválida no cambia nada', () => {
  const state = addRecent({ myTeam: DEFAULT_TEAM, recent: [] }, { s: '2025-2026', g: 'PG2', t: 'AD Huracán' });
  assert.deepEqual(addRecent(state, { s: '2024-2025', g: 'PGC2', t: 'AD Huracán' }).recent, [
    { s: '2024-2025', g: 'PGC2', t: 'AD Huracán' },
    { s: '2025-2026', g: 'PG2', t: 'AD Huracán' },
  ]);
  for (const bad of [null, {}, { s: '2025-2026', g: 'PG2' }, { s: 2025, g: 'PG2', t: 'AD Huracán' }]) {
    assert.equal(addRecent(state, bad), state);
  }
});
// ── Plan B3, tarea 1: «Borrar datos de esta app» (decisión 6) ─────────────

test('safeStorage.removeItem: borra la clave y nunca lanza', () => {
  const memory = new MemoryStorage({ a: '1', b: '2' });
  assert.equal(safeStorage(memory).removeItem('a'), true);
  assert.deepEqual(Object.fromEntries(memory.data), { b: '2' });
  assert.equal(safeStorage(() => memory).removeItem('no-está'), true, 'borrar lo que no está no es un fallo');
  for (const storage of [new BrokenStorage(), null, undefined, {}, () => { throw new Error('SecurityError'); }]) {
    assert.equal(safeStorage(storage).removeItem('a'), false);
  }
});

test('clearStore: borra v2, v1 y las claves antiguas, y nada más; la carga siguiente no vuelve a migrar', () => {
  const mine = { name: 'Las Mesas B', season: '2025-2026', cat: 'benjamin', groupId: 'B2' };
  const storage = new MemoryStorage({
    [STORE_KEY]: JSON.stringify({ myTeam: mine, recent: [{ s: '2025-2026', g: 'PG2', t: 'AD Huracán' }] }),
    [LEGACY_KEY]: JSON.stringify(fixture('favorites-v1')),
    season: '2024-2025', cat: 'benjamin', theme: 'light', 'otra-app': 'x',
  });
  assert.equal(clearStore(storage), true);
  assert.deepEqual(Object.fromEntries(storage.data), { 'otra-app': 'x' }, 'el origen es de más proyectos: nunca clear()');
  assert.deepEqual(loadStore(storage, OPTIONS), { myTeam: DEFAULT_TEAM, recent: [] });
  assert.equal(storage.getItem(STORE_KEY), null, 'sin v1 no hay migración: loadStore no escribe nada');
});

test('clearStore: con el almacenamiento bloqueado no lanza y dice que no pudo', () => {
  for (const storage of [new BrokenStorage(), null, undefined, () => { throw new Error('SecurityError'); }]) {
    assert.equal(clearStore(storage), false);
  }
  assert.equal(clearStore(new MemoryStorage()), true, 'un almacén vacío ya está borrado');
});
