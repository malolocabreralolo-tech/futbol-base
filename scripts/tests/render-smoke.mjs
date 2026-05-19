/**
 * Render smoke test for the futbol-base SPA.
 *
 * `checkRenderedDom(dom)` is a pure assertion over the serialized DOM of
 * index.html AFTER its JS ran. It catches the regression class that bit
 * twice: a src/ or index.html change that leaves MI EQUIPO (the default
 * screen) un-rendered — the globalThis bug (empty-state "No hay datos del
 * equipo esta temporada") or any throw in the module graph (empty
 * #sec-miequipo). Unit-tested in test_js_modules.mjs with fixtures.
 *
 * Run directly (`node scripts/tests/render-smoke.mjs`) to exercise the real
 * browser harness (added in Task 2); in CI it gates. Zero npm deps (node:* only).
 */

export function checkRenderedDom(dom) {
  const failures = [];
  const has = (s) => dom.includes(s);

  if (!/<div id="sec-miequipo"[^>]*\bclass="[^"]*\bactive\b/.test(dom))
    failures.push('#sec-miequipo.active not found (section did not activate)');
  if (!has('me-hero'))
    failures.push('hero (.me-hero) missing — MI EQUIPO did not render');
  if (!has('Las Mesas Hu.'))
    failures.push('featured team name "Las Mesas Hu." missing');
  if (!has('me-cal'))
    failures.push('calendar (.me-cal) missing');
  if (!has('me-crow') && !has('me-next') && !has('Sin partidos'))
    failures.push('calendar rendered no rows and no "Sin partidos" (.me-crow/.me-next)');
  if (!has('me-mini') && !has('Su posición'))
    failures.push('mini-table (.me-mini / "Su posición") missing');
  if (!has('me-scrow') && !has('Goleadores del equipo'))
    failures.push('scorers (.me-scrow / "Goleadores del equipo") missing');
  if (has('No hay datos del equipo esta temporada'))
    failures.push('empty-state present — render produced no data (globalThis-class bug?)');
  if (has('en construcción'))
    failures.push('stub placeholder ("en construcción") present');

  const m = dom.match(/<div id="sec-miequipo"[^>]*>([\s\S]*?)<div id="sec-clasif"/);
  const inner = m ? m[1] : '';
  if (inner.length < 500)
    failures.push(`#sec-miequipo content too small (${inner.length} chars) — likely empty/failed render`);

  return { ok: failures.length === 0, failures };
}
