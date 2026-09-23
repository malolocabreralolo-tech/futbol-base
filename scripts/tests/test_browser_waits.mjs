// Contrato: ninguna prueba de navegador espera una condición asíncrona con
// page.waitForFunction. Playwright no espera la promesa que devuelve el
// predicado (la trata como verdadera y resuelve al instante), así que esas
// esperas no esperaban nada y pwa-smoke fallaba al perder la carrera en CI.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { waitForAsync } from './browser-wait.mjs';

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
