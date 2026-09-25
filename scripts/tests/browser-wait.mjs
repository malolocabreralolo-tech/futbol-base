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
