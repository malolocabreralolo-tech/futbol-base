// Plan B2, tarea 4: checkRenderedDom (render-smoke.mjs) con marcadores independientes del estado
// (spec §11). Acepta la portada en A, B, C o D con su cabecera, el h1 del equipo y algún bloque;
// rechaza E, X, la caja de error y el esqueleto sin sustituir. Las páginas se construyen con la
// portada real (screen-home.js) sobre las fixtures, así que si la pantalla cambia sus marcadores,
// esta prueba lo dice.
import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { fixture } from './fixtures/rediseno/load.mjs';
import { currentAt, nextSeasonRaw, datasetsFrom } from './fixtures/rediseno/simulate.mjs';
import { STORE_KEY } from '../../src/store.js';
import { startContext } from '../../src/app.js';
import { screen } from '../../src/screen-home.js';
import { checkRenderedDom } from './render-smoke.mjs';

const TEAM = 'Las Mesas Hu.';
const DEFAULT_TEAM = { cat: 'prebenjamin', groupId: 'PG2', name: TEAM };
const storage = (myTeam) => {
  const map = new Map(myTeam ? [[STORE_KEY, JSON.stringify({ myTeam, recent: [] })]] : []);
  return { getItem: (key) => (map.has(key) ? map.get(key) : null), setItem: (key, value) => map.set(key, String(value)) };
};
function home({ raw = fixture('current-2025-2026'), today, season = '2025-2026', myTeam = null }) {
  const base = startContext({ storage: storage(myTeam), portal: { season, defaultTeam: DEFAULT_TEAM }, datasets: datasetsFrom(raw), today });
  return String(screen.render({ ...base, route: { screen: '', params: {} }, params: {} }));
}
// La página tal como la serializa Chrome: el esqueleto de index.html con la pantalla dentro.
const pageWith = (main) => `<!DOCTYPE html><html lang="es"><head></head><body><a class="skip-link" href="#contenido">Saltar al contenido</a><header class="shell-header"><a class="shell-brand" href="#/">Fútbol Base Las Palmas</a></header><nav class="tabbar"></nav><main id="contenido" class="page" tabindex="-1">${main}</main></body></html>`;
const LAS_MESAS_2526 = { name: TEAM, season: '2025-2026', cat: 'prebenjamin', groupId: 'PG2' };

test('acepta la portada en A, B, C y D, con el h1 del equipo', () => {
  const cases = {
    A: home({ raw: currentAt('2026-03-01'), today: '2026-03-01' }),
    B: home({ raw: currentAt('2025-10-01'), today: '2025-10-01' }),
    C: home({ today: '2026-05-31' }),
    D: home({ today: '2026-09-23' }),
  };
  for (const [state, main] of Object.entries(cases)) {
    const result = checkRenderedDom(pageWith(main), { teamName: TEAM });
    assert.deepEqual(result.failures, [], state);
    assert.equal(result.ok, true, state);
    assert.equal(result.state, state);
  }
});

test('rechaza E y X: la portada no puede quedarse preguntando ni sin equipo', () => {
  const e = home({ raw: nextSeasonRaw({ benjamin: ['B2'], prebenjamin: ['PG2'] }), today: '2026-10-01', season: '2026-2027', myTeam: LAS_MESAS_2526 });
  const x = home({ raw: nextSeasonRaw({ prebenjamin: ['PG3'] }), today: '2026-10-01', season: '2026-2027', myTeam: LAS_MESAS_2526 });
  for (const [state, main] of [['E', e], ['X', x]]) {
    const result = checkRenderedDom(pageWith(main), { teamName: TEAM });
    assert.equal(result.ok, false, state);
    assert.equal(result.state, state);
    assert.ok(result.failures.some((f) => f.includes(`estado ${state}`)), result.failures.join('; '));
  }
});

test('rechaza la caja de error, el esqueleto sin sustituir y otro equipo en el h1', () => {
  const error = checkRenderedDom(pageWith('<div class="box" role="alert"><p class="notice"><b>No se pudieron cargar los datos de la portada.</b></p><div class="buttons"><button type="button" class="button is-main" data-action="retry">Reintentar</button></div></div>'), { teamName: TEAM });
  assert.equal(error.ok, false);
  assert.ok(error.failures.some((f) => /Reintentar/.test(f)), error.failures.join('; '));
  const skeleton = checkRenderedDom(pageWith('<div class="box skeleton" aria-hidden="true"></div>'), { teamName: TEAM });
  assert.equal(skeleton.ok, false);
  assert.ok(skeleton.failures.some((f) => /esqueleto/.test(f)), skeleton.failures.join('; '));
  assert.ok(skeleton.failures.some((f) => /data-screen="home"/.test(f)));
  const other = checkRenderedDom(pageWith(home({ today: '2026-09-23' })), { teamName: 'AD Huracán' });
  assert.equal(other.ok, false);
  assert.ok(other.failures.some((f) => /AD Huracán/.test(f)), other.failures.join('; '));
});
