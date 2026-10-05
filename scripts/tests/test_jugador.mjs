// La ficha de jugador (#/jugador?id) y los jugadores seguidos: followed.js, la pantalla, la ruta y
// los enlaces desde la plantilla y el acta.
import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { ctxFor, datasetsFor } from './fixtures/rediseno/screens.mjs';
import { memoryStorage } from './fixtures/rediseno/fake-browser.mjs';
import { FOLLOWED_KEY, clearStore } from '../../src/store.js';
import { MAX_FOLLOWED, cleanFollowed, isFollowed, loadFollowed, saveFollowed, toggleFollowed } from '../../src/followed.js';
import { screen, followedBlock } from '../../src/screen-jugador.js';
import { resolveParams } from '../../src/router.js';
import { parseRoute, playerHref } from '../../src/links.js';
import { jugadoresShard } from '../../src/state.js';
import { teamSquad } from '../../src/model.js';

const s = (h) => String(h);
const ID = '55181078';
// Un trozo de data-jugadores-<k>.js con la forma de generate_js.jugadores_files.
const SHARD = {
  p: {
    [ID]: { n: 'SERRANO DOMINGUEZ, LEYRE', c: [
      ['2024-2025', 'PGC2', 'Las Mesas Hu.', 12, 10, 3, 1, 0],
      ['2025-2026', 'PG2', 'Las Mesas Hu.', 20, 18, 7, 0, 0],
      ['2025-2026', 'BCB1', 'Las Mesas Hu.', 2, 2, 0, 0, 0],
    ] },
  },
  g: {
    '2024-2025/PGC2': ['prebenjamin', 'Grupo 2', 'Gran Canaria', 'grancanaria'],
    '2025-2026/PG2': ['prebenjamin', 'Grupo 2', 'Gran Canaria', 'grancanaria'],
  },
};
const ctxWith = (params, { shard = SHARD, followed = [] } = {}) => {
  const datasets = datasetsFor();
  datasets.jugadores = { [jugadoresShard(ID)]: shard };
  return { ...ctxFor('jugador', params, { datasets }), followed };
};

test('followed: limpia, alterna (el nuevo el primero), guarda en su clave y «Borrar datos» la borra', () => {
  assert.deepEqual(cleanFollowed([{ id: 1, n: 'A' }, { id: '1', n: 'B' }, { id: 'x', n: 'C' }, { id: '2', n: '' }, null]), [{ id: '1', n: 'A' }]);
  let list = toggleFollowed([], { id: ID, n: 'SERRANO DOMINGUEZ, LEYRE' });
  list = toggleFollowed(list, { id: '7', n: 'OTRO, NIÑO' });
  assert.deepEqual(list.map(p => p.id), ['7', ID]);
  assert.ok(isFollowed(list, Number(ID)));
  assert.deepEqual(toggleFollowed(list, { id: '7', n: 'OTRO, NIÑO' }).map(p => p.id), [ID]);
  const many = Array.from({ length: MAX_FOLLOWED + 3 }, (_, i) => ({ id: String(i), n: `N${i}` }));
  assert.equal(cleanFollowed(many).length, MAX_FOLLOWED);
  const storage = memoryStorage();
  assert.deepEqual(loadFollowed(storage), []);
  assert.equal(saveFollowed(storage, list), true);
  assert.deepEqual(loadFollowed(storage), list);
  storage.setItem(FOLLOWED_KEY, '{roto');
  assert.deepEqual(loadFollowed(storage), []);
  saveFollowed(storage, list);
  clearStore(storage);
  assert.equal(storage.getItem(FOLLOWED_KEY), null);
  const blocked = { getItem() { throw new Error('SecurityError'); }, setItem() { throw new Error('SecurityError'); } };
  assert.deepEqual(loadFollowed(blocked), []);
  assert.equal(saveFollowed(blocked, list), false);
});

test('ruta: #/jugador?id con un número; cualquier otra cosa se queda sin id', () => {
  assert.equal(playerHref(ID), `#/jugador?id=${ID}`);
  assert.equal(playerHref(null), null);
  assert.equal(playerHref('abc'), null);
  assert.deepEqual(parseRoute(playerHref(ID)), { screen: 'jugador', params: { id: ID } });
  const ctx = ctxWith({ id: ID });
  assert.deepEqual(resolveParams({ screen: 'jugador', params: { id: ID, s: '2024-2025' } }, ctx), { params: { id: ID } });
  assert.deepEqual(resolveParams({ screen: 'jugador', params: { id: '12x' } }, ctx), { params: {} });
});

test('ficha: nombre, resumen, «Seguir» y su trayectoria de la temporada más reciente a la más antigua', () => {
  const out = s(screen.render(ctxWith({ id: ID })));
  assert.match(out, /<h1>Leyre Serrano Dominguez<\/h1>/);
  assert.match(out, /2 temporadas · 34 partidos · 10 goles/);
  assert.match(out, /data-action="seguir-jugador" aria-pressed="false">Seguir</);
  const seasons = [...out.matchAll(/<h3 class="traj-season">([^<]+)<\/h3>/g)].map(m => m[1]);
  assert.deepEqual(seasons, ['2025/26', '2024/25']);
  // Cada fila, a la ficha de su equipo en su grupo; el grupo con su nombre de la app (o su código sin él).
  assert.match(out, /href="#\/equipo\?s=2025-2026&amp;g=PG2&amp;t=Las%20Mesas%20Hu\."/);
  assert.match(out, /<span class="traj-group">Prebenjamín, Grupo 2 de Gran Canaria · 18 de titular<\/span>/);
  assert.match(out, /<span class="traj-group">BCB1 · 2 de titular<\/span>/);
  assert.match(out, /Grupo 2 de Gran Canaria · 10 de titular · 1 amarilla</);
  assert.match(out, /<span class="traj-pts">20 partidos<\/span>/);
  assert.match(out, /<span class="traj-pos">sin goles<\/span>/);
  assert.match(s(screen.render(ctxWith({ id: ID }, { followed: [{ id: ID, n: 'X' }] }))), /aria-pressed="true">Siguiendo</);
});

test('ficha: sin id, sin el trozo (error con «Reintentar») o sin el jugador en las actas', () => {
  assert.match(s(screen.render(ctxWith({}))), /Abre la ficha de un jugador/);
  assert.match(s(screen.render(ctxWith({ id: ID }, { shard: null }))), /data-action="retry"/);
  assert.match(s(screen.render(ctxWith({ id: '16' }))), /No encontramos a ese jugador/);
});

test('needs: pide el trozo de su id una vez; con él ya cargado, nada', async () => {
  const datasets = {};
  assert.deepEqual(screen.needs({}, datasets), []);
  const fetched = [];
  const realFetch = globalThis.fetch;
  globalThis.fetch = async (url) => {
    fetched.push(String(url));
    return { ok: true, status: 200, text: async () => `const JUGADORES_${jugadoresShard(ID)} = ${JSON.stringify(SHARD)};\n` };
  };
  try {
    await Promise.all(screen.needs({ id: ID }, datasets));
  } finally {
    globalThis.fetch = realFetch;
  }
  assert.equal(fetched.length, 1);
  assert.match(fetched[0], new RegExp(`data-jugadores-${jugadoresShard(ID)}\\.js`));
  assert.deepEqual(datasets.jugadores[jugadoresShard(ID)], SHARD);
  assert.deepEqual(screen.needs({ id: ID }, datasets), []);
});

test('mount: «Seguir» pasa el jugador a nav.toggleFollow', () => {
  const ctx = ctxWith({ id: ID });
  let listener = null;
  const button = { getAttribute: () => 'seguir-jugador' };
  const section = {
    matches: () => true,
    contains: () => true,
    addEventListener: (type, fn) => { listener = fn; },
  };
  const calls = [];
  screen.mount(section, ctx, { toggleFollow: (p) => calls.push(p) });
  listener({ target: { closest: () => button } });
  assert.deepEqual(calls, [{ id: ID, n: 'SERRANO DOMINGUEZ, LEYRE' }]);
});

test('Mi equipo: los jugadores seguidos, cada uno con su ficha; sin ninguno, nada', () => {
  assert.equal(s(followedBlock({ followed: [] })), '');
  const out = s(followedBlock({ followed: [{ id: ID, n: 'SERRANO DOMINGUEZ, LEYRE' }] }));
  assert.match(out, /Jugadores que sigues/);
  assert.match(out, new RegExp(`href="#/jugador\\?id=${ID}"`));
  assert.match(out, /Leyre Serrano Dominguez/);
});

test('plantilla: la fila del jugador lleva su id de la federación si el acta lo trae', () => {
  const match = { home: 'A', away: 'B', hs: 1, as: 0, roundKey: 'Jornada 1', season: '2025-2026', groupId: 'PG2', dateISO: '2025-10-04' };
  const group = { id: 'PG2', season: '2025-2026', rounds: [{ key: 'Jornada 1', matches: [match] }] };
  const lineups = { 'A|B|1-0': { s: '2025-2026', gr: 'PG2', home: [{ n: 'X, Y', id: 7, dn: 3, r: 'starter', g: 1 }], away: [{ n: 'Z, W', dn: 4, r: 'starter', g: 0 }], events: [] } };
  assert.deepEqual(teamSquad(lineups, { group, team: 'A' }).rows, [{ name: 'X, Y', id: 7, dorsal: 3, ap: 1, st: 1, g: 1, y: 0, rd: 0 }]);
  assert.deepEqual(teamSquad(lineups, { group, team: 'B' }).rows, [{ name: 'Z, W', dorsal: 4, ap: 1, st: 1, g: 0, y: 0, rd: 0 }]);
});
