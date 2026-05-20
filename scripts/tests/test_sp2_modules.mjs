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

function makeStubContainer() {
  let html = '';
  const events = [];
  return {
    set innerHTML(v) { html = v; },
    get innerHTML() { return html; },
    addEventListener(name, fn) { events.push({ name, fn }); },
    querySelectorAll(sel) {
      if (!sel.includes('plant-th')) return [];
      const ths = [...html.matchAll(/<th[^>]*data-sort-key="([^"]+)"/g)];
      return ths.map(m => ({
        dataset: { sortKey: m[1] },
        addEventListener(n, f) { events.push({ name: n, fn: f, key: m[1] }); },
      }));
    },
    _click(k) {
      const ev = events.find(e => e.key === k && e.name === 'click');
      ev && ev.fn({ currentTarget: { dataset: { sortKey: k } } });
    },
  };
}

test('renderPlantillaInto: header click re-sorts and updates arrow', async () => {
  const { renderPlantillaInto } = await import('../../src/plantilla.js');
  const c = makeStubContainer();
  renderPlantillaInto(c, [
    { n: "A", ap: 5, st: 0, g: 1, y: 0, rd: 0 },
    { n: "B", ap: 10, st: 5, g: 1, y: 0, rd: 0 },
  ], { teamId: '1', season: '2024-2025' });
  assert.ok(/A/.test(c.innerHTML) && /B/.test(c.innerHTML));
  c._click('ap');
  assert.ok(/data-sort-key="ap"[^>]*>PJ\s*[▾▴]/.test(c.innerHTML),
    'PJ header shows arrow after click');
});
