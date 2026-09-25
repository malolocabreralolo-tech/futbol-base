// Plan B3, Tarea 11: la pantalla Temporadas (spec §4.1 y §4.7; decisión 27 de B3). render(ctx) es
// pura: se prueba con ctxFor sobre las fixtures, con SEASONS de datasetsFor (las temporadas que se
// sirven, decisión 31) y la temporada del portal inyectada.
import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';
import { ctxFor, datasetsFor, cssRules, PORTAL_SEASON } from './fixtures/rediseno/screens.mjs';
import { archive, nextSeasonRaw } from './fixtures/rediseno/simulate.mjs';
import { SCREEN_MAP } from '../../src/screens.js';
import { screen, archiveSeasons } from '../../src/screen-temporadas.js';

const render = (opts = {}) => String(screen.render(ctxFor('temporadas', {}, opts)));
// Con el archivo de 2023-24 cargado, SEASONS anuncia 2025-26 (la actual), 2024-25 y 2023-24.
const archived = () => ({ datasets: datasetsFor({ seasonRaw: { '2023-2024': archive('2023-2024') } }) });
const rows = (out) => [...out.matchAll(/<li class="tp-row">(.*?)<\/li>/g)].map(([, row]) => row);

test('una fila por temporada de SEASONS, de la más reciente a la más antigua, con «actual» en la del portal', () => {
  const out = render(archived());
  assert.match(out, /^<section data-screen="temporadas"><header class="screen-head"><a class="back" href="#\/explorar" data-action="back" aria-label="Volver">‹<\/a><div class="screen-head-text"><h1>Temporadas anteriores<\/h1><\/div><\/header><div class="block"><ol class="box tp-list">/);
  assert.equal((out.match(/<h1[ >]/g) || []).length, 1);
  assert.deepEqual(rows(out), [
    '<a class="tp-season" href="#/explorar?s=2025-2026"><span class="tp-name">2025/26</span><span class="tp-now">actual</span></a><a class="tp-records" href="#/records?s=2025-2026">Récords<span class="vh"> de 2025/26</span></a>',
    '<a class="tp-season" href="#/explorar?s=2024-2025"><span class="tp-name">2024/25</span></a><a class="tp-records" href="#/records?s=2024-2025">Récords<span class="vh"> de 2024/25</span></a>',
    '<a class="tp-season" href="#/explorar?s=2023-2024"><span class="tp-name">2023/24</span></a><a class="tp-records" href="#/records?s=2023-2024">Récords<span class="vh"> de 2023/24</span></a>',
  ]);
  assert.deepEqual(screen.needs({}, archived().datasets, { portalSeason: PORTAL_SEASON }), [], 'no carga nada: la temporada que se abra la carga el router');
});

test('«actual» sigue a la temporada del portal, no a la marca de SEASONS; la del portal sale aunque SEASONS no la traiga', () => {
  // 2026/27 activada, con SEASONS todavía de la víspera (2025-26 marcada como actual).
  const out = render({
    portalSeason: '2026-2027', today: '2026-10-01',
    datasets: datasetsFor({ current: nextSeasonRaw({ prebenjamin: ['PG2'] }), seasons: [{ name: '2025-2026', current: true }, { name: '2024-2025', current: false }] }),
  });
  assert.deepEqual(rows(out).map((row) => row.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim()), [
    '2026/27 actual Récords de 2026/27', '2025/26 Récords de 2025/26', '2024/25 Récords de 2024/25']);
  assert.deepEqual(archiveSeasons([{ name: '2024-2025' }, { name: '2024-2025' }, { name: 'otra' }, null, { name: '2021-2022' }], '2025-2026'),
    ['2025-2026', '2024-2025', '2021-2022'], 'sin repetidos ni nombres que no son temporadas');
  assert.deepEqual(archiveSeasons(null, '2025-2026'), ['2025-2026'], 'sin SEASONS, la del portal');
});

test('registro y CSS: la ruta pinta Temporadas; solo clases que existen, enlaces de 44 px y 640 px en escritorio', () => {
  assert.equal(SCREEN_MAP.temporadas, screen);
  assert.match(readFileSync(new URL('../../sw.js', import.meta.url), 'utf8'), /\n {2}'\.\/src\/screen-temporadas\.js',\n/);
  const rules = cssRules();
  const used = new Set(render(archived()).match(/class="[^"]+"/g).flatMap((m) => m.slice(7, -1).split(/\s+/)));
  assert.deepEqual([...used].filter((c) => !rules.classes.has(c)), []);
  const body = (selector) => rules.filter((r) => r.media === null && r.selector === selector).map((r) => r.body).join(';');
  assert.match(body('.tp-season'), /min-height:\s*56px/);
  assert.match(body('.tp-records'), /min-height:\s*44px/);
  const wide = rules.find((r) => r.media && /min-width:\s*1024px/.test(r.media) && r.selector.includes('[data-screen="temporadas"]'));
  assert.ok(wide && /max-width:\s*640px/.test(wide.body));
});
