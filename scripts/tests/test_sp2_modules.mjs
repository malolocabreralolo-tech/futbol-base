import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { renderPlantillaTable, sortPlantillaRows } from '../../src/plantilla.js';

const SAMPLE = [
  { n: "OJEDA DELGADO, T.", ap: 12, st: 10, g: 14, y: 2, rd: 0 },
  { n: "OJEDA SANTANA, M.", ap: 12, st: 11, g: 8,  y: 0, rd: 0 },
  { n: "DOS SANTOS, M.",    ap: 8,  st: 0,  g: 0,  y: 0, rd: 0 },
];

test('plantilla: default sort goals desc, ties broken by ap desc, name asc', () => {
  const s = sortPlantillaRows(SAMPLE, 'g', 'desc');
  assert.equal(s[0].n, 'OJEDA DELGADO, T.');
  assert.equal(s[1].n, 'OJEDA SANTANA, M.');
  assert.equal(s[2].n, 'DOS SANTOS, M.');
});

test('plantilla: sort by ap asc puts sub-only first when their ap is lowest', () => {
  const s = sortPlantillaRows(SAMPLE, 'ap', 'asc');
  assert.equal(s[0].n, 'DOS SANTOS, M.');
});

test('plantilla: renderPlantillaTable produces a table with 7 headers and N rows', () => {
  const html = renderPlantillaTable(SAMPLE, { teamId: '197', season: '2024-2025' });
  assert.ok(/class="[^"]*plant-table/.test(html));
  const ths = html.match(/<th\b/g) || [];
  assert.ok(ths.length >= 7);
  const trs = html.match(/<tr[^>]*class="[^"]*plant-row/g) || [];
  assert.equal(trs.length, 3);
  assert.ok(/plant-row[^"]*top-scorer/.test(html), 'top scorer marked');
  assert.ok(/plant-row[^"]*role-sub/.test(html), 'sub-only marked');
});

test('plantilla: empty data renders empty-state', () => {
  const html = renderPlantillaTable([], { teamId: '197', season: '2024-2025' });
  assert.ok(/plant-empty/.test(html));
  assert.ok(/no hay datos de plantilla/i.test(html));
});
