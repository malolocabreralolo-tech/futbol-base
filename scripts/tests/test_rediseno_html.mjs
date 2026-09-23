// Plan B1, tarea 2: plantillas con escapado automático (spec §5.1 y §11).
// Toda interpolación se escapa; solo pasan tal cual los fragmentos Html que
// produce la propia etiqueta html``, y raw() rechaza cualquier otra cosa.
import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { Html, escape, html, raw, join } from '../../src/html.js';

// Nombre real de la federación (SHIELDS y data-season-2024-2025.js).
const VICTORIA_B = 'VICTORIA, REAL CLUB "B"';

test('escape: escapa & < > " \' y convierte null/undefined en cadena vacía', () => {
  assert.equal(escape(`<a href="x">Tom & Jerry's</a>`),
    '&lt;a href=&quot;x&quot;&gt;Tom &amp; Jerry&#39;s&lt;/a&gt;');
  assert.equal(escape(null), '');
  assert.equal(escape(undefined), '');
  assert.equal(escape(0), '0');
  assert.equal(escape(28), '28');
  assert.equal(escape(false), 'false');
  assert.equal(escape('&amp;'), '&amp;amp;', 'escapa también lo que ya parece una entidad');
});

test('html: devuelve Html y escapa cada interpolación, en texto y en atributos', () => {
  const out = html`<td title="${VICTORIA_B}">${VICTORIA_B}</td>`;
  assert.ok(out instanceof Html);
  assert.equal(String(out),
    '<td title="VICTORIA, REAL CLUB &quot;B&quot;">VICTORIA, REAL CLUB &quot;B&quot;</td>');
  assert.equal(`${out}`, String(out), 'toString da el marcado');
  const hostil = '<img src=x onerror=alert(1)>';
  assert.equal(String(html`<b>${hostil}</b>`), '<b>&lt;img src=x onerror=alert(1)&gt;</b>');
  assert.equal(String(html`<a href="#/equipo?t=${"x' onmouseover='y"}">`),
    '<a href="#/equipo?t=x&#39; onmouseover=&#39;y">');
});

test('html: null, undefined y false no pintan nada; 0 sí', () => {
  const nada = null, indef = undefined, falso = false;
  assert.equal(String(html`[${nada}|${indef}|${falso}|${0}]`), '[|||0]');
  const mio = false;
  assert.equal(String(html`<tr>${mio && html`<b>mío</b>`}</tr>`), '<tr></tr>');
});

test('html: un Html anidado no se vuelve a escapar, pero su contenido sí se escapó', () => {
  const inner = html`<b>${'<i>'}</b>`;
  assert.equal(String(html`<p>${inner}</p>`), '<p><b>&lt;i&gt;</b></p>');
  assert.equal(String(html`${html`${html`<em>${'&'}</em>`}`}`), '<em>&amp;</em>');
});

test('html: los arrays se unen sin separador; sus Html pasan y sus textos se escapan', () => {
  const filas = ['A', 'B'].map(t => html`<li>${t}</li>`);
  assert.equal(String(html`<ul>${filas}</ul>`), '<ul><li>A</li><li>B</li></ul>');
  assert.equal(String(html`${['<x>', html`<y>`, [html`<z>`, '&'], null, false]}`),
    '&lt;x&gt;<y><z>&amp;');
});

test('html: un objeto que imita a Html se escapa (solo cuentan las instancias reales)', () => {
  const falso = { s: '<script>', toString() { return '<script>'; } };
  assert.equal(String(html`${falso}`), '&lt;script&gt;');
});

test('raw: devuelve el mismo Html y lanza TypeError con cualquier otra cosa', () => {
  const h = html`<b>ok</b>`;
  assert.equal(raw(h), h);
  for (const v of ['<b>', null, undefined, 3, ['<b>'], { s: '<b>' }]) {
    assert.throws(() => raw(v), TypeError, `raw(${JSON.stringify(v)}) debería lanzar`);
  }
  assert.equal(String(html`<p>${raw(h)}</p>`), '<p><b>ok</b></p>');
});

test('join: une Html con separador escapado, sin tocar los Html y saltando los vacíos', () => {
  const items = [html`<b>1</b>`, html`<b>2</b>`];
  assert.ok(join(items) instanceof Html);
  assert.equal(String(join(items)), '<b>1</b><b>2</b>');
  assert.equal(String(join(items, ', ')), '<b>1</b>, <b>2</b>');
  assert.equal(String(join(items, html`<br>`)), '<b>1</b><br><b>2</b>');
  assert.equal(String(join(items, ' < ')), '<b>1</b> &lt; <b>2</b>');
  assert.equal(String(join([items[0], null, false, undefined, items[1]], '·')), '<b>1</b>·<b>2</b>');
  assert.equal(String(join(['<a>', items[0]], ' ')), '&lt;a&gt; <b>1</b>');
  assert.equal(String(join([])), '');
});
