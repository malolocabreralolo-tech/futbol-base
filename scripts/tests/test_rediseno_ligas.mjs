// Plan B3, Tarea 7: pantalla Ligas (spec §4.7, §4.1 y §4.11; decisiones 19, 20 y 21 de B3) y
// compareGroups (model.js). render(ctx) es pura: se prueba sobre el HTML que devuelve, con las fixtures
// congeladas y `today` inyectado. mount («Comparar grupos») y la barra, con el router y el navegador
// falso comunes.
import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { archive } from './fixtures/rediseno/simulate.mjs';
import { ctxFor, datasetsFor, cssRules, PORTAL_SEASON } from './fixtures/rediseno/screens.mjs';
import { fakeBrowser } from './fixtures/rediseno/fake-browser.mjs';
import { screen, compareView, ligasView } from '../../src/screen-ligas.js';
import { SCREEN_MAP } from '../../src/screens.js';
import { startRouter } from '../../src/router.js';
import { compareGroups } from '../../src/model.js';

const s = (h) => String(h);
const text = (h) => s(h).replace(/<[^>]*>/g, ' ').replace(/&quot;/g, '"').replace(/&#39;/g, "'")
  .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim();
const ctxWith = (params, options = {}, data = {}) => ctxFor('ligas', { s: PORTAL_SEASON, ...params }, { ...options, datasets: datasetsFor(data) });
const render = (params, options, data) => s(screen.render(ctxWith(params, options, data)));
// Las filas de enlace de la pantalla: [href, texto].
const rows = (html, cls = 'link-row') => [...html.matchAll(new RegExp(`<a class="${cls}[^"]*" href="([^"]+)">(.*?)</a>`, 'g'))]
  .map((m) => [m[1].replace(/&amp;/g, '&'), text(m[2])]);
const blocks = (out) => [...out.matchAll(/<h2 class="block-title">([^<]+)<\/h2>(?:<p class="block-context">([^<]+)<\/p>)?/g)].map((m) => `${m[1]} (${m[2]})`);
const head = (out) => text(out.match(/<header class="screen-head">.*?<\/header>/)[0]);
const group = (ctx, id) => ctx.model.group(PORTAL_SEASON, id);

// ── compareGroups ────────────────────────────────────────────────────────

test('compareGroups: por puntos por partido, después puntos, diferencia de goles y nombre; los retirados al final', () => {
  const ctx = ctxWith({}, {}, { champions: true });
  const line = (r) => `${r.team} ${r.groupId} ${r.pts}/${r.pj} ${r.ppj.toFixed(2)}${r.retired ? ' retirado' : ''}`;
  // PG2 y PG3: la comparativa de prebenjamín de la app anterior.
  const pre = compareGroups([group(ctx, 'PG2'), group(ctx, 'PG3')]);
  assert.equal(pre.length, 29);
  assert.deepEqual(pre.slice(0, 3).map(line), ['UD Vecindario PG3 78/26 3.00', 'Unión Viera PG2 79/28 2.82', 'Acodetti PG2 78/28 2.79']);
  assert.equal(pre.findIndex((r) => r.team === 'Las Mesas Hu.') + 1, 16);
  assert.equal(line(pre[28]), 'CD Batán PG2 0/28 0.00 retirado');
  assert.deepEqual(pre[0], { team: 'UD Vecindario', groupId: 'PG3', groupLabel: 'Grupo 3', pj: 26, pts: 78, ppj: 3, dg: 160, retired: false });
  // Cuenta la división exacta y no la redondeada: Maspa Training (66/26 = 2,538) va antes que AD Huracán
  // (71/28 = 2,536), aunque la tabla enseñe «2,54» en los dos. A igual cifra, la diferencia de goles:
  // RC Victoria, Veteranos y La Garita (58/28), y CD Arinaga y CD Cerruda (34/26).
  assert.deepEqual(pre.slice(4, 6).map((r) => r.team), ['Maspa Training', 'AD Huracán']);
  assert.deepEqual(pre.slice(7, 10).map((r) => `${r.team} ${r.dg}`), ['RC Victoria 78', 'Veteranos 77', 'La Garita 66']);
  assert.deepEqual(pre.slice(16, 18).map((r) => r.team), ['CD Arinaga', 'CD Cerruda']);
  const a = compareGroups([group(ctx, 'A1'), group(ctx, 'A2')]);
  assert.deepEqual([a.length, ...a.slice(0, 3).map(line)], [23, 'Las Palmas A2 66/22 3.00', 'Unión Viera A1 57/20 2.85', 'Arucas A1 55/20 2.75']);
  assert.equal(a.findIndex((r) => r.team === 'Las Mesas Hu.') + 1, 8);
  const b = compareGroups([group(ctx, 'B1'), group(ctx, 'B2')]);
  assert.deepEqual([b[0].team, b[1].team, b[2].team, b[22].team], ['Las Torres', 'Roque Amagro', 'Arucas D', 'Las Mesas B']);
  // FF5, FF9, FF13 y FF15: tres a 3,00 con 15 puntos, desempatados por la diferencia de goles (70, 48 y 43).
  const ff = compareGroups(['FF5', 'FF9', 'FF13', 'FF15'].map((id) => group(ctx, id)));
  assert.deepEqual(ff.slice(0, 3).map((r) => `${r.team} ${r.dg}`), ['Veteranos 70', 'AD Huracán 48', 'Las Mesas Hu. 43']);
  // La Copa de Campeones (un cuadro) no entra: solo los grupos de liga.
  assert.deepEqual(compareGroups([group(ctx, 'PG2'), group(ctx, 'PCC1')]).map((r) => r.groupId).filter((id) => id !== 'PG2'), []);
  assert.deepEqual(compareGroups([]), []);
});

// ── Sin `f`: las competiciones ───────────────────────────────────────────

test('«Otro grupo» de la Tabla de PG2 (c, i y to): las ligas de prebenjamín de Gran Canaria, cada una a sus grupos con `to`', () => {
  const out = render({ c: 'prebenjamin', i: 'grancanaria', to: 'tabla' }, {}, { champions: true, cupsExtra: true });
  assert.match(out, /^<section data-screen="ligas"><header class="screen-head"><a class="back" href="#\/explorar" data-action="back" aria-label="Volver">‹<\/a>/);
  assert.equal((out.match(/<h1[ >]/g) || []).length, 1);
  assert.equal(head(out), '‹ Ligas Prebenjamín de Gran Canaria · 2025/26');
  // Con `to`, solo las ligas: ni la Copa de Campeones ni la Maspalomas Cup, que no tienen Tabla.
  assert.deepEqual(blocks(out), ['Prebenjamín (2 grupos)']);
  assert.deepEqual(rows(out), [['#/ligas?s=2025-2026&c=prebenjamin&f=grancanaria&to=tabla', 'Gran Canaria 2 grupos']]);
});

test('sin `f` ni `to`: las ligas y después las copas y los torneos de cada categoría; sin `c` (desde E o X), las dos', () => {
  const both = render({}, {}, { champions: true, cupsExtra: true });
  assert.equal(head(both), '‹ Ligas Benjamín y prebenjamín · 2025/26');
  assert.deepEqual(blocks(both), ['Benjamín (14 grupos)', 'Prebenjamín (7 grupos)']);
  assert.deepEqual(rows(both).map(([href, label]) => `${label} → ${href}`), [
    'Segunda Fase A 2 grupos → #/ligas?s=2025-2026&c=benjamin&f=segunda-a',
    'Segunda Fase B 2 grupos → #/ligas?s=2025-2026&c=benjamin&f=segunda-b',
    'Primera Fase 4 grupos → #/ligas?s=2025-2026&c=benjamin&f=primera-fase',
    'Copa de Campeones 3 grupos → #/ligas?s=2025-2026&c=benjamin&f=copa-campeones',
    'Maspalomas Cup 2026 3 grupos → #/ligas?s=2025-2026&c=benjamin&f=maspalomas',
    'Gran Canaria 2 grupos → #/ligas?s=2025-2026&c=prebenjamin&f=grancanaria',
    'Fuerteventura 1 grupo → #/ligas?s=2025-2026&c=prebenjamin&f=fuerteventura',
    'Copa de Campeones 1 grupo → #/ligas?s=2025-2026&c=prebenjamin&f=copa-campeones',
    'Maspalomas Cup 2026 3 grupos → #/ligas?s=2025-2026&c=prebenjamin&f=maspalomas',
  ]);
  // Desde E o X (#/ligas?to=jornada): las ligas de las dos categorías, a su Jornada.
  const fromE = render({ to: 'jornada' });
  assert.deepEqual(rows(fromE).map(([href]) => href), [
    '#/ligas?s=2025-2026&c=benjamin&f=segunda-a&to=jornada', '#/ligas?s=2025-2026&c=benjamin&f=segunda-b&to=jornada',
    '#/ligas?s=2025-2026&c=benjamin&f=primera-fase&to=jornada', '#/ligas?s=2025-2026&c=prebenjamin&f=grancanaria&to=jornada',
    '#/ligas?s=2025-2026&c=prebenjamin&f=fuerteventura&to=jornada']);
  // Una isla sin competiciones: un vacío que lo dice.
  assert.match(render({ c: 'benjamin', i: 'lanzarote', to: 'tabla' }), /<p class="empty">No hay ligas de benjamín en Lanzarote en la temporada 2025\/26\.<\/p>/);
  assert.match(render({ i: 'fuerteventura' }), /<a class="link-row" href="#\/ligas\?s=2025-2026&amp;c=prebenjamin&amp;f=fuerteventura">/);
});

// ── Con `f`: los grupos ──────────────────────────────────────────────────

test('con `f`: los grupos de la competición, con equipos, líder y ronda; cada uno a su Tabla, o a la pantalla de `to`', () => {
  const out = render({ c: 'prebenjamin', f: 'grancanaria' });
  assert.equal(head(out), '‹ Gran Canaria Prebenjamín · 2025/26');
  assert.deepEqual(blocks(out), ['Prebenjamín (2 grupos)']);
  assert.deepEqual(rows(out, 'link-row group-row'), [
    ['#/tabla?s=2025-2026&g=PG2', 'Grupo 2 (grupo de mi equipo) 15 equipos · líder: Unión Viera jornada 30'],
    ['#/tabla?s=2025-2026&g=PG3', 'Grupo 3 14 equipos · líder: UD Vecindario jornada 30'],
  ]);
  // El grupo de mi equipo (Las Mesas Hu., PG2), con el resalte propio.
  assert.match(out, /<a class="link-row group-row is-mine" href="#\/tabla\?s=2025-2026&amp;g=PG2">/);
  assert.doesNotMatch(out, /group-row is-mine" href="#\/tabla\?s=2025-2026&amp;g=PG3"/);
  // Con `to` (de «Otro grupo» de Jornada), a su Jornada.
  assert.deepEqual(rows(render({ c: 'prebenjamin', f: 'grancanaria', to: 'jornada' }), 'link-row group-row').map(([href]) => href),
    ['#/jornada?s=2025-2026&g=PG2', '#/jornada?s=2025-2026&g=PG3']);
  // Primera Fase: «Grupo 5» antes que «Grupo 13».
  assert.deepEqual(rows(render({ c: 'benjamin', f: 'primera-fase' }), 'link-row group-row').map(([, label]) => label), [
    'Grupo 5 6 equipos · líder: Las Mesas Hu. jornada 5', 'Grupo 9 6 equipos · líder: AD Huracán jornada 5',
    'Grupo 13 6 equipos · líder: Veteranos jornada 5', 'Grupo 15 6 equipos · líder: La Garita jornada 5']);
});

test('`f` sin `c`: la clave de las dos categorías (decisión 19); la Copa de Campeones con sus campeones y los torneos, a su Copa', () => {
  const out = render({ f: 'copa-campeones' }, {}, { champions: true });
  assert.equal(head(out), '‹ Copa de Campeones Benjamín y prebenjamín · 2025/26');
  assert.deepEqual(blocks(out), ['Benjamín (3 grupos)', 'Prebenjamín (1 grupo)']);
  assert.deepEqual(rows(out, 'link-row group-row'), [
    ['#/copa?s=2025-2026&g=BCA1', 'Fase A 8 equipos · campeón: Las Palmas final'],
    ['#/copa?s=2025-2026&g=BCB1', 'Fase B 8 equipos · campeón: Las Torres final'],
    ['#/copa?s=2025-2026&g=BCC1', 'Fase C 8 equipos · campeón: La Garita B final'],
    ['#/copa?s=2025-2026&g=PCC1', 'Eliminatorias 6 equipos · campeón: LA UNION DE VECINDARIO final'],
  ]);
  assert.doesNotMatch(out, /data-action="comparar"/, 'los cuadros no se comparan');
  const cup = render({ f: 'maspalomas' }, {}, { cupsExtra: true });
  assert.equal(head(cup), '‹ Maspalomas Cup 2026 Benjamín y prebenjamín · 2025/26');
  assert.deepEqual(rows(cup, 'link-row group-row'), [
    ['#/copa?s=2025-2026&g=MCBK2', 'Copa Oro 34 equipos · campeón: UD Vecindario A'],
    ['#/copa?s=2025-2026&g=MCBK1', 'Copa Plata 34 equipos · campeón: Gáldar CF'],
    ['#/copa?s=2025-2026&g=MCB16', 'Grupo P 4 equipos · líder: UD Las Mesas Huracán fase de grupos'],
    ['#/copa?s=2025-2026&g=MCPK2', 'Copa Oro 12 equipos · campeón: AD Huracán'],
    ['#/copa?s=2025-2026&g=MCPK1', 'Copa Plata 12 equipos · campeón: CF Unión Viera'],
    ['#/copa?s=2025-2026&g=MCP3', 'Grupo C 4 equipos · líder: Real Club Victoria fase de grupos'],
  ]);
  // Un torneo con `to`: sus grupos abren la Copa igual (no tienen Tabla).
  assert.deepEqual(rows(render({ c: 'prebenjamin', f: 'maspalomas', to: 'tabla' }), 'link-row group-row').map(([href]) => href),
    ['#/copa?s=2025-2026&g=MCPK1', '#/copa?s=2025-2026&g=MCP3']);
});

test('una competición que no existe, otra temporada y la temporada sin cargar: nunca en blanco', () => {
  const lost = render({ c: 'benjamin', f: 'tercera-fase', to: 'tabla' });
  assert.equal(head(lost), '‹ Ligas Benjamín · 2025/26');
  assert.match(lost, /<p class="empty">No encontramos la competición «tercera-fase» en la temporada 2025\/26\.<\/p>/);
  assert.deepEqual(rows(lost), [['#/ligas?s=2025-2026&c=benjamin&to=tabla', 'Ver todas las competiciones']]);
  // 2024/25 (cargada por el router): la Segunda Fase C y la Copa de Campeones con su campeón (el cuadro incoherente).
  const past = render({ s: '2024-2025', f: 'copa-campeones' }, {}, { seasonRaw: { '2024-2025': archive('2024-2025') } });
  assert.equal(head(past), '‹ Copa de Campeones Benjamín · 2024/25');
  assert.deepEqual(rows(past, 'link-row group-row'), [['#/copa?s=2024-2025&g=BCC1', 'Fase C 6 equipos · campeón: LA UNION DE VECINDARIO "B" final']]);
  const primera = render({ s: '2024-2025', c: 'benjamin', f: 'primera-fase' }, {}, { seasonRaw: { '2024-2025': archive('2024-2025') } });
  assert.deepEqual(rows(primera, 'link-row group-row').map(([href, label]) => `${label} → ${href}`), [
    'Grupo 1 10 equipos · líder: Moya jornada 9 → #/tabla?s=2024-2025&g=P1',
    'Grupo 3 10 equipos · líder: Garepa Viera jornada 9 → #/tabla?s=2024-2025&g=P3',
    'Grupo 9 9 equipos · líder: Las Palmas jornada 9 → #/tabla?s=2024-2025&g=P9']);
  assert.doesNotMatch(primera, /is-mine/, 'mi equipo es de la temporada actual');
  const failed = render({ s: '2023-2024', c: 'benjamin' });
  assert.match(failed, /<h1>Ligas<\/h1>/);
  assert.match(text(failed), /No se pudieron cargar los datos de la temporada 2023\/24\./);
  assert.match(failed, /data-action="retry"/);
  assert.deepEqual(screen.needs({ s: '2023-2024' }, {}), [], 'la temporada de la ruta la carga el router');
});

// ── «Comparar grupos» ────────────────────────────────────────────────────

test('«Comparar grupos»: un botón con aria-expanded en competiciones de 2 grupos de liga o más; la tabla, bajo demanda', () => {
  const out = render({ c: 'prebenjamin', f: 'grancanaria' });
  assert.match(out, /<\/ul><button class="button compare-toggle" type="button" id="comparar-prebenjamin" data-action="comparar" aria-expanded="false" aria-controls="comparar-prebenjamin-tabla">Comparar grupos<\/button><div class="compare" id="comparar-prebenjamin-tabla" hidden><\/div><\/section>/);
  assert.doesNotMatch(out, /compare-table/, 'render no pinta la tabla: la pinta mount al abrirla');
  assert.match(render({ c: 'benjamin', f: 'segunda-a' }), /id="comparar-benjamin"/);
  assert.doesNotMatch(render({ c: 'prebenjamin', f: 'fuerteventura' }), /data-action="comparar"/, 'un solo grupo');
  // La tabla: grupo, J, DG, Pts y Pts/J, cada equipo a su ficha, mi equipo resaltado y el retirado al final.
  const ctx = ctxWith({ c: 'prebenjamin', f: 'grancanaria' });
  const table = s(compareView(ctx, ligasView(ctx).chosen[0]));
  assert.match(table, /^<p class="notice">Por puntos por partido; a igualdad, por puntos, diferencia de goles y nombre\. Los retirados, al final\.<\/p><div class="box"><table class="standings compare-table"><caption class="vh">Comparación de los grupos de Gran Canaria, prebenjamín<\/caption>/);
  const heads = [...table.match(/<thead>(.*?)<\/thead>/)[1].matchAll(/<th scope="col"[^>]*>(.*?)<\/th>/g)].map((m) => text(m[1]));
  assert.deepEqual(heads, ['#', 'Equipo', 'Gr.', 'J', 'DG', 'Pts', 'Pts/J']);
  const body = [...table.matchAll(/<tr( class="is-mine")?><td class="st-pos">(.*?)<\/tr>/g)].map((m) => ({ mine: !!m[1], text: text(`<td>${m[2]}`) }));
  assert.equal(body.length, 29);
  assert.equal(body[0].text, '1 UD Vecindario 3 26 +160 78 3,00');
  assert.deepEqual(body.filter((r) => r.mine).map((r) => r.text), ['16 Las Mesas Hu. (mi equipo) 2 28 −30 37 1,32']);
  assert.equal(body[28].text, '29 CD Batán 2 28 −84 0 retirado');
  assert.match(table, /<a class="st-link" href="#\/equipo\?s=2025-2026&amp;g=PG3&amp;t=UD%20Vecindario">/);
});

test('mount con el router: «Comparar grupos» pinta la tabla al abrirla y la esconde al cerrarla; la barra, la de `to`', async () => {
  const datasets = datasetsFor();
  const b = fakeBrowser('#/ligas?s=2025-2026&c=prebenjamin&f=grancanaria&to=tabla');
  const router = startRouter({ screens: { ...SCREEN_MAP }, root: b.root, getContext: () => ctxFor('', {}, { datasets }), window: b.win });
  await router.idle();
  assert.deepEqual(b.marks(), [['#/tabla', 'true']], '«Otro grupo» de la Tabla: la barra sigue en Tabla');
  const button = b.root.querySelector('#comparar-prebenjamin');
  const box = b.root.querySelector('#comparar-prebenjamin-tabla');
  const click = () => { for (const fn of button.listeners.click || []) fn({ target: button }); };
  click();
  assert.deepEqual([button.getAttribute('aria-expanded'), box.hidden, button.textContent], ['true', false, 'Ocultar la comparación']);
  const ctx = ctxWith({ c: 'prebenjamin', f: 'grancanaria', to: 'tabla' });
  assert.equal(box.innerHTML, s(compareView(ctx, ligasView(ctx).chosen[0])));
  const painted = box.innerHTML;
  click();
  assert.deepEqual([button.getAttribute('aria-expanded'), box.hidden, button.textContent], ['false', true, 'Comparar grupos']);
  click();
  assert.equal(box.innerHTML, painted, 'la segunda vez no se vuelve a pintar');
  // Un grupo de la lista abre la Tabla (push), con la barra en Tabla.
  b.click({ href: '#/tabla?s=2025-2026&g=PG3' });
  await router.idle();
  assert.deepEqual(b.entries(), ['#/ligas?s=2025-2026&c=prebenjamin&f=grancanaria&to=tabla', '#/tabla?s=2025-2026&g=PG3']);
  assert.deepEqual(b.marks(), [['#/tabla', 'page']]);
  // Sin `to`, Ligas cuelga de Explorar.
  const plain = fakeBrowser('#/ligas?c=benjamin&f=segunda-a');
  const r2 = startRouter({ screens: { ...SCREEN_MAP }, root: plain.root, getContext: () => ctxFor('', {}, { datasets }), window: plain.win });
  await r2.idle();
  assert.deepEqual(plain.marks(), [['#/explorar', 'true']]);
  assert.match(plain.root.innerHTML, /<h1>Segunda Fase A<\/h1>/);
});

test('registro: Ligas es la pantalla de #/ligas; y el CSS: solo clases que existen, con el resalte propio, 44 px y el puesto de 3 cifras', () => {
  assert.equal(SCREEN_MAP.ligas, screen);
  const rules = cssRules();
  const decl = (sel) => rules.filter((r) => r.media === null && r.selector.split(/\s*,\s*/).includes(sel)).map((r) => r.body).join(';');
  assert.match(decl('.button'), /min-height:\s*44px/);
  assert.match(decl('.link-row.is-mine'), /background:\s*var\(--mark\).*box-shadow:\s*inset 3px 0 0 var\(--ink\)/s);
  // El puesto de la comparación llega a 3 cifras: 34 px, no los 24 de la Tabla (decisión 161).
  assert.match(decl('.compare-table .st-pos'), /width:\s*34px/);
  const ctx = ctxWith({ c: 'prebenjamin', f: 'grancanaria' });
  const html = [render({}, {}, { champions: true, cupsExtra: true }), render({ c: 'prebenjamin', f: 'grancanaria' }),
    render({ f: 'copa-campeones' }, {}, { champions: true }), render({ c: 'benjamin', f: 'zz' }), s(compareView(ctx, ligasView(ctx).chosen[0]))].join('');
  const used = new Set(html.match(/class="[^"]+"/g).flatMap((m) => m.slice(7, -1).split(/\s+/)));
  assert.deepEqual([...used].filter((c) => !rules.classes.has(c)), []);
});
