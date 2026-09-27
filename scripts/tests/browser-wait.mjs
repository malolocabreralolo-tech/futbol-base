// Playwright's page.waitForFunction does NOT await a predicate that returns a
// Promise: it runs `const success = predicate(); if (success) fulfill(...)`
// (playwright-core/lib/server/frames.js), and a Promise is always truthy — so
// an async condition "passes" at once without being checked. pwa-smoke.mjs
// waited like that for the new service worker, reloaded while the previous
// one was still in control, and failed whenever CI lost that race
// (2026-09-12..22, every other day). Async conditions — caches, service
// workers, dynamic imports — are polled here through page.evaluate, which
// does await the result. `label` (B3, «Para B3» punto 21): el escenario, el
// ancho y el tema, que el mensaje de un tiempo agotado nombra para que un
// fallo de la CI se lea sin reproducirlo.
export async function waitForAsync(page, predicate, arg, { timeout = 15000, interval = 100, label = null } = {}) {
  const deadline = Date.now() + timeout;
  let lastError = null;
  for (;;) {
    try {
      if (await page.evaluate(predicate, arg)) return;
      lastError = null;
    } catch (error) {
      // A navigation can destroy the execution context mid-poll: retry.
      lastError = error;
    }
    if (Date.now() >= deadline) {
      throw new Error(`waitForAsync${label ? ` (${label})` : ''}: condition not met after ${timeout}ms`
        + (lastError ? ` (last error: ${lastError.message})` : '') + `\n${predicate}`);
    }
    await new Promise(resolve => setTimeout(resolve, interval));
  }
}

// Una acción de Playwright (un clic, la espera de un localizador, una navegación) con la etiqueta de su
// paso (el escenario, el ancho y el tema) delante de su error, como el tiempo agotado de waitForAsync:
// un fallo de la CI se lee sin reproducirlo (B5, decisión 7). Devuelve lo que devuelve la acción.
// Reescribir solo error.message no basta: Playwright ya ha formado error.stack para cuando este
// helper lo recibe, V8 no lo vuelve a formatear al cambiar message, y tanto Node (al imprimir un
// error no capturado) como util.inspect muestran stack, no message. Por eso stack se reescribe
// también: si ya contiene el mensaje sin etiqueta (el caso normal), se sustituye ahí mismo; si no, la
// etiqueta va delante de stack entero. El reemplazo va con una función (no con el string de
// error.message) porque un selector puede llevar un "$" (p. ej. [href$="…"]), y String.replace lee un
// "$&" o un "$1" del reemplazo como patrón, no como texto, cuando el reemplazo es un string (revisión
// final de B5, arreglo 1).
export async function labeled(label, action) {
  try {
    return await action();
  } catch (error) {
    if (error instanceof Error) {
      const { stack, message } = error;
      error.message = `${label}: ${message}`;
      if (typeof stack === 'string') error.stack = stack.includes(message) ? stack.replace(message, () => error.message) : `${label}: ${stack}`;
    }
    throw error;
  }
}
