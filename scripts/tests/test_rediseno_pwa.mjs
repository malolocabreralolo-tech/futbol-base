// Plan B4, tarea 3: el manifiesto y los iconos de la PWA (spec §5.5; decisión 7 de B4) y sus <link> en
// index.html. Los iconos son los PNG de icons/ (scripts/build_icons.py); sus píxeles salen de la cabecera
// PNG, sin dependencias. La app instalada en los móviles tiene que seguir siendo la misma: su identidad
// (id) es la de hoy. Solo lee index.html, manifest.json e icons/: nunca los data-*.js vivos.
import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { existsSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const INDEX = readFileSync(join(ROOT, 'index.html'), 'utf8');
const MANIFEST = JSON.parse(readFileSync(join(ROOT, 'manifest.json'), 'utf8'));
// Donde vive el manifiesto publicado: index.html lo enlaza con ./manifest.json.
const MANIFEST_URL = 'https://malolocabreralolo-tech.github.io/futbol-base/manifest.json';

// Los píxeles de un PNG, de su cabecera: la firma y el bloque IHDR, el primero.
function pngSize(file) {
  const data = readFileSync(join(ROOT, file));
  assert.equal(data.subarray(0, 8).toString('hex'), '89504e470d0a1a0a', `${file} no es un PNG`);
  assert.equal(data.subarray(12, 16).toString('latin1'), 'IHDR', `${file}: IHDR no es el primer bloque`);
  return `${data.readUInt32BE(16)}x${data.readUInt32BE(20)}`;
}
const meta = (pattern) => (INDEX.match(pattern) || [])[1];

test('manifest.json: el nombre, la descripción y los colores de index.html, arranque en #/, standalone y vertical (spec §5.5)', () => {
  const { icons, ...fields } = MANIFEST;
  assert.ok(Array.isArray(icons));
  assert.deepEqual(fields, {
    id: '/futbol-base/index.html',
    name: meta(/<title>([^<]+)<\/title>/),
    short_name: meta(/<meta name="apple-mobile-web-app-title" content="([^"]+)">/),
    description: meta(/<meta name="description" content="([^"]+)">/),
    start_url: './index.html#/',
    display: 'standalone',
    orientation: 'portrait',
    background_color: meta(/<meta name="theme-color" content="(#[0-9A-F]{6})" media="\(prefers-color-scheme: light\)">/),
    theme_color: meta(/<meta name="theme-color" content="(#[0-9A-F]{6})" media="\(prefers-color-scheme: light\)">/),
  });
  assert.deepEqual([fields.name, fields.short_name, fields.theme_color], ['Fútbol Base Las Palmas', 'Fútbol Base LP', '#FFFFFF']);
});

// La identidad de una PWA: su id resuelto contra el ORIGEN de start_url, sin fragmento (sin id, start_url
// sin su fragmento). La de hoy, la del manifiesto de antes de B4 (start_url ./index.html, sin id), es
// https://malolocabreralolo-tech.github.io/futbol-base/index.html. Con id "./index.html" sería la de la
// raíz del origen, /index.html: otra app (lo calcula así Chrome, Page.getAppId, en la Tarea 3 de B4).
test('la app instalada sigue siendo la misma: la identidad de hoy, y abre en #/', () => {
  const start = new URL(MANIFEST.start_url, MANIFEST_URL);
  const id = new URL(MANIFEST.id, start.origin);
  id.hash = '';
  assert.equal(id.href, new URL('./index.html', MANIFEST_URL).href);
  assert.equal(id.href, 'https://malolocabreralolo-tech.github.io/futbol-base/index.html');
  assert.equal(start.href, 'https://malolocabreralolo-tech.github.io/futbol-base/index.html#/');
});

test('los iconos del manifiesto: 192 y 512 (any) y la maskable de 512, PNG con esos píxeles', () => {
  assert.deepEqual(MANIFEST.icons, [
    { src: './icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
    { src: './icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
    { src: './icons/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
  ]);
  for (const icon of MANIFEST.icons) assert.equal(pngSize(icon.src), icon.sizes, icon.src);
});

test('index.html: el apple-touch-icon de 180 y el icono de 192, PNG de icons/, y el manifiesto; ni SVG en línea ni icons.svg', () => {
  assert.match(INDEX, /<link rel="apple-touch-icon" href="\.\/icons\/icon-180\.png">/);
  assert.equal(pngSize('icons/icon-180.png'), '180x180');
  assert.match(INDEX, /<link rel="icon" type="image\/png" href="\.\/icons\/icon-192\.png">/);
  assert.match(INDEX, /<link rel="manifest" href="\.\/manifest\.json">/);
  assert.doesNotMatch(INDEX, /data:image\/svg\+xml/);
  assert.ok(!existsSync(join(ROOT, 'icons.svg')), 'icons.svg no lo usa nadie (decisión 7 de B4)');
});
