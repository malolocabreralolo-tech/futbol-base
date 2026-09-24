// Plan B1, tarea 11: tokens de style-acta.css (spec §3.1) y contraste AA
// (spec §3.1, §8 y §11). Lee los tokens de los dos temas tal como están en el
// CSS: si alguien toca un color, el test recalcula el contraste real.
import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

// Reglas del CSS como {media, selector, body}; un nivel de @media.
function parseCss(src) {
  const rules = [];
  const walk = (s, media) => {
    let i = 0;
    while (i < s.length) {
      const open = s.indexOf('{', i);
      if (open < 0) break;
      const prelude = s.slice(i, open).trim();
      let depth = 1, j = open + 1;
      for (; j < s.length && depth; j++) {
        if (s[j] === '{') depth++;
        else if (s[j] === '}') depth--;
      }
      const body = s.slice(open + 1, j - 1);
      if (prelude.startsWith('@media')) walk(body, prelude);
      else rules.push({ media, selector: prelude, body });
      i = j;
    }
  };
  walk(src.replace(/\/\*[\s\S]*?\*\//g, ''), null);
  return rules;
}

const rules = parseCss(readFileSync(join(ROOT, 'style-acta.css'), 'utf8'));
const tokensOf = (rule) => Object.fromEntries(
  [...rule.body.matchAll(/--([a-z-]+)\s*:\s*(#[0-9A-Fa-f]{6})\s*;/g)].map(m => [m[1], m[2].toUpperCase()]));
const rootRule = (media) => rules.find(r => r.selector === ':root' && media(r.media));
const LIGHT = rootRule(m => m === null);
const DARK = rootRule(m => m !== null && /prefers-color-scheme:\s*dark/.test(m));

// Spec §3.1, literal.
const SPEC = {
  light: { paper: '#FFFFFF', text: '#1A1F2B', mute: '#5A6272', ink: '#C0182B', 'on-ink': '#FFFFFF',
    rule: '#E7B9BE', line: '#ECEEF2', mark: '#FBEDEE', win: '#1B7A43', 'on-win': '#FFFFFF',
    draw: '#E4E7EC', 'on-draw': '#1A1F2B', loss: '#1A1F2B', 'on-loss': '#FFFFFF' },
  dark: { paper: '#15171C', text: '#ECEEF2', mute: '#A3AAB8', ink: '#FF5A64', 'on-ink': '#15171C',
    rule: '#5A2A30', line: '#262A33', mark: '#2A1B1E', win: '#3FBF78', 'on-win': '#15171C',
    draw: '#3A3F4A', 'on-draw': '#ECEEF2', loss: '#ECEEF2', 'on-loss': '#15171C' },
};

// WCAG 2.x: luminancia relativa y razón de contraste.
const luminance = (hex) => {
  const [r, g, b] = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16) / 255)
    .map(c => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const ratio = (a, b) => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
};

// Spec §3.1 (texto/fondo), más dos pares que usan los componentes: el
// monograma (--mute sobre --line) y las etiquetas dentro de la fila propia
// (--mute sobre --mark).
const PAIRS = [['text', 'paper'], ['mute', 'paper'], ['ink', 'paper'], ['on-ink', 'ink'],
  ['ink', 'mark'], ['text', 'mark'], ['on-win', 'win'], ['on-draw', 'draw'], ['on-loss', 'loss'],
  ['mute', 'line'], ['mute', 'mark']];

test('la fórmula de contraste da los valores de referencia', () => {
  assert.equal(ratio('#000000', '#FFFFFF').toFixed(2), '21.00');
  assert.equal(ratio('#FFFFFF', '#FFFFFF').toFixed(2), '1.00');
  assert.ok(ratio('#777777', '#FFFFFF') < 4.5, '#777 sobre blanco no llega a AA (4,48)');
});

test('los tokens claros están en :root y los oscuros en prefers-color-scheme: dark', () => {
  assert.ok(LIGHT, ':root de nivel superior no encontrado');
  assert.ok(DARK, ':root dentro de @media (prefers-color-scheme: dark) no encontrado');
  assert.match(LIGHT.body, /color-scheme:\s*light dark/);
});

for (const theme of ['light', 'dark']) {
  test(`tema ${theme === 'light' ? 'claro' : 'oscuro'}: tokens exactos de la spec §3.1`, () => {
    const got = tokensOf(theme === 'light' ? LIGHT : DARK);
    for (const [name, value] of Object.entries(SPEC[theme])) {
      assert.equal(got[name], value, `--${name}`);
    }
  });

  test(`tema ${theme === 'light' ? 'claro' : 'oscuro'}: pares de texto con contraste AA (≥ 4,5:1)`, () => {
    const t = tokensOf(theme === 'light' ? LIGHT : DARK);
    const bad = PAIRS
      .map(([fg, bg]) => [fg, bg, ratio(t[fg], t[bg])])
      .filter(([, , r]) => !(r >= 4.5))
      .map(([fg, bg, r]) => `${fg}/${bg} = ${r.toFixed(2)}:1`);
    assert.deepEqual(bad, []);
  });
}
