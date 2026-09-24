// Plan B1, tarea 13: tipografía alojada (spec §3.2). Public Sans variable,
// subconjunto latino, servida desde fonts/ con system-ui de respaldo.
import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
// @fontsource-variable/public-sans@5.3.0, files/public-sans-latin-wght-normal.woff2
const FONT_SHA256 = '5ed4d31c988e73b258894244f209069ebe77dc7e564861954b21198b6de90d68';

test('fonts/PublicSans-latin.woff2 es el woff2 fijado (26.832 bytes)', () => {
  const buf = readFileSync(join(ROOT, 'fonts', 'PublicSans-latin.woff2'));
  assert.equal(buf.subarray(0, 4).toString('latin1'), 'wOF2');
  assert.equal(buf.readUInt32BE(8), buf.length, 'la cabecera WOFF2 declara la longitud real');
  assert.equal(createHash('sha256').update(buf).digest('hex'), FONT_SHA256);
});

test('la licencia OFL acompaña a la fuente', () => {
  const ofl = readFileSync(join(ROOT, 'fonts', 'OFL.txt'), 'utf8');
  assert.match(ofl, /SIL OPEN FONT LICENSE Version 1\.1/);
  assert.match(ofl, /The Public Sans Project Authors/);
});

test('@font-face: Public Sans desde fonts/, pesos 100-900, swap y subconjunto latino', () => {
  const css = readFileSync(join(ROOT, 'acta.css'), 'utf8');
  const faces = [...css.matchAll(/@font-face\s*\{([^}]*)\}/g)].map((m) => m[1]);
  assert.equal(faces.length, 1, 'una sola familia');
  const face = faces[0];
  assert.match(face, /font-family:\s*'Public Sans'/);
  assert.match(face, /src:\s*url\('fonts\/PublicSans-latin\.woff2'\) format\('woff2'\)/);
  assert.match(face, /font-weight:\s*100 900/);
  assert.match(face, /font-style:\s*normal/);
  assert.match(face, /font-display:\s*swap/);
  assert.match(face, /unicode-range:\s*U\+0000-00FF,[^;]*U\+2000-206F,[^;]*U\+2212/);
  assert.match(css, /body\s*\{[^}]*font-family:\s*'Public Sans',\s*system-ui/);
  assert.doesNotMatch(css, /fonts\.googleapis|fonts\.gstatic/, 'nada de Google Fonts: se aloja en fonts/');
});
