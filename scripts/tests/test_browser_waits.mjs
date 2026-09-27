// Contrato: ninguna prueba de navegador espera una condición asíncrona con
// page.waitForFunction. Playwright no espera la promesa que devuelve el
// predicado (la trata como verdadera y resuelve al instante), así que esas
// esperas no esperaban nada y pwa-smoke fallaba al perder la carrera en CI.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { inspect } from 'node:util';
import { labeled, waitForAsync } from './browser-wait.mjs';

const dir = new URL('./', import.meta.url);

test('ningún waitForFunction usa un predicado asíncrono', () => {
  const offenders = [];
  for (const file of readdirSync(dir).filter(f => f.endsWith('.mjs'))) {
    const src = readFileSync(new URL(file, dir), 'utf8');
    if (file === 'test_browser_waits.mjs') continue;
    for (const m of src.matchAll(/waitForFunction\(/g)) {
      // Texto de la llamada completa: hasta el ');' que cierra la sentencia.
      const call = src.slice(m.index, src.indexOf(');', src.indexOf('=>', m.index)) + 2);
      if (/\basync\b|\bawait\b|new Promise|\.then\(|caches\.|serviceWorker|import\(/.test(call)) {
        offenders.push(`${file}:${src.slice(0, m.index).split('\n').length}`);
      }
    }
  }
  assert.deepEqual(offenders, [], 'usa waitForAsync (browser-wait.mjs) para condiciones asíncronas');
});

test('waitForAsync espera a que la promesa del predicado sea verdadera', async () => {
  let calls = 0;
  const page = { evaluate: async (fn, arg) => fn(arg) };
  await waitForAsync(page, async n => ++calls >= n, 3, { interval: 1 });
  assert.equal(calls, 3);
});

test('waitForAsync falla si la condición nunca se cumple', async () => {
  const page = { evaluate: async () => false };
  await assert.rejects(waitForAsync(page, async () => false, null, { timeout: 30, interval: 5 }), /not met after 30ms/);
});

test('waitForAsync reintenta si la evaluación falla por una navegación', async () => {
  let calls = 0;
  const page = { evaluate: async () => { if (++calls < 3) throw new Error('Execution context was destroyed'); return true; } };
  await waitForAsync(page, () => true, null, { interval: 1 });
  assert.equal(calls, 3);
});

test('waitForAsync nombra el escenario, el ancho y el tema cuando se agota (B3, Para B3 punto 21)', async () => {
  const page = { evaluate: async () => false };
  await assert.rejects(waitForAsync(page, () => false, null, { timeout: 30, interval: 5, label: '390px en oscuro, ficha de AD Huracán' }),
    /^Error: waitForAsync \(390px en oscuro, ficha de AD Huracán\): condition not met after 30ms/);
});

test('labeled pone la etiqueta del paso delante del error de un clic o de una espera, y devuelve lo que devuelve la acción (B5, decisión 7)', async () => {
  assert.equal(await labeled('390px en claro, portada', async () => 7), 7);

  const label = '390px en oscuro: clic en #contenido #round-prev';
  const raw = 'page.click: Timeout 8000ms exceeded.';
  const error = new Error(raw);
  // Playwright ya ha formado error.stack (lo lee o lo fija él mismo) antes de que labeled lo reciba:
  // leerlo aquí, antes de lanzar, reproduce eso. Si se leyera por primera vez después de cambiar
  // message, V8 lo formatearía ya con la etiqueta puesta, y la prueba pasaría aunque labeled no
  // tocara stack para nada: el caso que colaba con un `new Error(...)` suelto, sin leer antes su stack.
  const stackBefore = error.stack;
  let caught;
  try { await labeled(label, async () => { throw error; }); } catch (err) { caught = err; }
  const expected = `${label}: ${raw}`;
  assert.equal(caught, error);
  assert.equal(caught.message, expected);
  assert.notEqual(caught.stack, stackBefore);
  assert.equal(caught.stack.split('\n')[0], `Error: ${expected}`);
  assert.equal(inspect(caught).split('\n')[0], `Error: ${expected}`);

  // Un selector puede llevar un "$" (p. ej. [href$="…"]): sustituir con el string de error.message en
  // vez de con una función leería un "$1" o un "$&" del mensaje como patrón de reemplazo, no como texto.
  const dollarLabel = '390px en oscuro: clic en selector con $';
  const dollarRaw = "page.click: Timeout 300ms exceeded. selector: 'a[href$=\"x\"]:nth-child($1)$&'";
  const dollarError = new Error(dollarRaw);
  const dollarStackBefore = dollarError.stack;
  let dollarCaught;
  try { await labeled(dollarLabel, async () => { throw dollarError; }); } catch (err) { dollarCaught = err; }
  const dollarExpected = `${dollarLabel}: ${dollarRaw}`;
  assert.equal(dollarCaught.message, dollarExpected);
  assert.notEqual(dollarCaught.stack, dollarStackBefore);
  assert.equal(dollarCaught.stack.split('\n')[0], `Error: ${dollarExpected}`);
});

test('cada clic, espera de localizador y navegación de interaction-smoke y capturas lleva su etiqueta (labeled)', () => {
  const offenders = [];
  for (const file of ['interaction-smoke.mjs', 'capturas.mjs']) {
    readFileSync(new URL(file, dir), 'utf8').split('\n').forEach((line, i) => {
      if (/\.(?:click|waitFor|goBack|reload)\(/.test(line) && !/labeled\(/.test(line) && !/^\s*\/\//.test(line)) offenders.push(`${file}:${i + 1}`);
    });
  }
  assert.deepEqual(offenders, [], 'envuélvelos con labeled (browser-wait.mjs)');
});
