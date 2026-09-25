// Mi equipo, la portada (Plan B2, Tareas 7 y 8; spec §4.2, §4.8, §6.4 y §7), con datos reales
// congelados y `today` inyectado. render(ctx) se prueba sin DOM. El modelo del contexto es
// createModel (Tarea 3) sobre las fixtures, con buildClubIndex inyectado.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { fixture } from './fixtures/rediseno/load.mjs';
import { currentAt, nextSeasonRaw, datasetsFrom } from './fixtures/rediseno/simulate.mjs';
import { buildSeason, createModel, teamFixtures } from '../../src/model.js';
import { buildClubIndex, resolveMyTeam } from '../../src/myteam.js';
import { shareLink, copyText, weekdayDate, dayMonth, dayMonthLong, monthName } from '../../src/links.js';
import { loadStore, LEGACY_KEY } from '../../src/store.js';
import { ctxFor } from './fixtures/rediseno/screens.mjs';
import { standingsTable } from '../../src/ui.js';
import { screen, coverageText, shareData, matchCalendar, teamCalendar } from '../../src/screen-home.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const shields = fixture('shields');
const health = fixture('health');
const LAS_MESAS = { name: 'Las Mesas Hu.', season: '2025-2026', cat: 'prebenjamin', groupId: 'PG2' };

// data-goleadores.js (23/09/2026), copia literal: los goleadores de Las Mesas Hu. en PG2 (GOL_PREBENJ)
// y en A2 (GOL_BENJ), más los dos primeros de AD Huracán en PG2, que la portada nunca enseña.
const GOL = {
  prebenjamin: [{ id: 'PG2', g: 'PREBENJAMIN GC GRUPO 2', s: [
    ['León Rodríguez, Lucas', 'AD Huracán', 50, 20], ['Rodriguez Aloma, Antoine', 'AD Huracán', 27, 19],
    ['De La Rosa Perello, Theo', 'Las Mesas Hu.', 12, 17], ['Santana Santacruz, Agoney', 'Las Mesas Hu.', 11, 21],
    ['Ruiz Aleman, Einar', 'Las Mesas Hu.', 9, 23], ['Hidalgo Camejo, Pablo', 'Las Mesas Hu.', 8, 18],
    ['Medina Hairach, Nadir', 'Las Mesas Hu.', 8, 21], ['Peña Peña, Alejandro', 'Las Mesas Hu.', 6, 20],
    ['Parcero Ramirez, Neyzan', 'Las Mesas Hu.', 5, 17], ['Hernandez Betancor, Yeudiel', 'Las Mesas Hu.', 4, 5],
    ['Falcon Montilla, Mateo', 'Las Mesas Hu.', 3, 21], ['Morales Gonzalez, Daniel', 'Las Mesas Hu.', 1, 16],
    ['Rodriguez Del Rosario, Yadiel', 'Las Mesas Hu.', 1, 21],
  ] }],
  benjamin: [{ id: 'A2', g: 'BENJAMIN SEGUNDA FASE A-G2', s: [
    ['Espiau Chicoy, Alvaro', 'Las Mesas Hu.', 23, 19], ['Espiau Chicoy, Sergio', 'Las Mesas Hu.', 16, 19],
    ['Rodriguez Montesdeoca, Iker', 'Las Mesas Hu.', 13, 16], ['Lorenzo Hernandez, Joel', 'Las Mesas Hu.', 12, 17],
    ['Navarro Melgar, Lucas', 'Las Mesas Hu.', 9, 16], ['Llarena Moreno, Carlos', 'Las Mesas Hu.', 8, 19],
  ] }],
};

// El ctx de la portada es el de siempre (ctxFor de fixtures/rediseno/screens.mjs, sobre startContext
// de app.js): el modelo, mi equipo del almacén resuelto con el hoy inyectado, health y legacyDate.
// `resolution`, si llega, transforma la resolución del ctx (el aviso stale, que las fixtures no traen).
function homeCtx({
  raw = fixture('current-2025-2026'), myTeam = LAS_MESAS, today, portalSeason = '2025-2026',
  withHealth = health, legacyDate = null, gol = GOL, resolution,
} = {}) {
  const datasets = datasetsFrom(raw, { golBenj: gol.benjamin || null, golPrebenj: gol.prebenjamin || null, health: withHealth });
  const ctx = ctxFor('', {}, { today, datasets, myTeam, portalSeason, legacyDate });
  return resolution ? { ...ctx, resolution: resolution(ctx.resolution) } : ctx;
}
const render = options => String(screen.render(homeCtx(options)));

// Texto visible: sin etiquetas (las de línea, sin hueco), con las entidades deshechas y los espacios juntos.
const text = markup => String(markup).replace(/<\/?(?:b|abbr)\b[^>]*>/g, '').replace(/<[^>]+>/g, ' ')
  .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&')
  .replace(/\s+/g, ' ').trim();
// El bloque <section class="block"> cuyo título es `title`, o null (los bloques no se anidan).
const blockOf = (markup, title) => (String(markup).match(/<section class="block"[^>]*>[\s\S]*?<\/section>/g) || [])
  .find(block => block.includes(`<h2 class="block-title">${title}</h2>`)) || null;
const titles = markup => [...String(markup).matchAll(/<h2 class="block-title">(.*?)<\/h2>/g)].map(m => m[1]);

// Un caso real de cada estado. En las 2026/27 simuladas no hay goleadores: el modelo daría los de
// 2025-26 como de la temporada del portal.
const CASES = {
  A: { raw: currentAt('2026-03-01'), today: '2026-03-01' },
  B: { raw: nextSeasonRaw({ benjamin: ['A1', 'B2', 'FF15'], prebenjamin: ['PG2', 'PG3'] }),
    myTeam: { ...LAS_MESAS, season: '2026-2027' }, today: '2026-10-01', portalSeason: '2026-2027', gol: {} },
  C: { raw: currentAt('2026-06-03'), today: '2026-06-03' },
  D: { today: '2026-09-23' },
  E: { myTeam: { name: 'Las Mesas Hu. B', season: '2025-2026', cat: 'benjamin', groupId: 'FF13' }, today: '2026-09-23' },
  X: { raw: nextSeasonRaw({ benjamin: ['A1'], prebenjamin: ['PG3'] }), today: '2026-10-01', portalSeason: '2026-2027', gol: {} },
};

test('contrato de pantalla: id home, sin cargas con data-health ya cargado, y una sección con data-state y un solo h1 en cada estado', () => {
  assert.equal(screen.id, 'home');
  assert.deepEqual(screen.needs({}, { health }), []);
  assert.equal(typeof screen.mount, 'function');
  for (const [state, options] of Object.entries(CASES)) {
    const out = render(options);
    assert.match(out, new RegExp(`^<section data-screen="home" data-state="${state}">`), state);
    assert.ok(out.endsWith('</section>'), state);
    assert.equal((out.match(/<h1[\s>]/g) || []).length, 1, state);
  }
});

// M4 de la revisión final de B2: datasets.health es undefined sin pedir y null si falló. Se pide
// una sola vez por sesión: mientras falla, las visitas siguientes pintan en el acto, sin esperar.
test('needs: data-health.json una sola vez por sesión, guardado en datasets.health (null si falló), y nunca rechaza', async () => {
  const saved = { fetch: globalThis.fetch, warn: console.warn };
  let calls = 0;
  let up = false;
  globalThis.fetch = async () => {
    calls += 1;
    return up ? { ok: true, status: 200, text: async () => JSON.stringify(health) } : { ok: false, status: 503, text: async () => '' };
  };
  console.warn = () => {};
  try {
    // Falla: queda null, y la visita siguiente no lo vuelve a pedir ni lo espera.
    const failed = {};
    const first = screen.needs({}, failed);
    assert.equal(first.length, 1);
    await Promise.all(first);
    assert.equal(failed.health, null);
    assert.deepEqual(screen.needs({}, failed), [], 'falló: esta sesión no lo vuelve a pedir');
    assert.equal(calls, 1);
    // Llega: queda guardado y tampoco se vuelve a pedir.
    up = true;
    const datasets = { health: undefined };
    const loads = screen.needs({}, datasets);
    assert.equal(loads.length, 1);
    await Promise.all(loads);
    assert.equal(datasets.health.nextSeason.status, 'pending');
    assert.deepEqual(screen.needs({}, datasets), [], 'cargado, no se vuelve a pedir');
    assert.equal(calls, 2);
  } finally {
    globalThis.fetch = saved.fetch;
    console.warn = saved.warn;
  }
});

test('cabecera (screenHead): escudo de 46 sin carga diferida, nombre en el h1, etiqueta de grupo y «Cambiar» a Explorar con el buscador', () => {
  const head = render(CASES.A).match(/<header class="screen-head">.*?<\/header>/)[0];
  assert.match(head, /^<header class="screen-head"><img class="crest crest-46" src="\.\/escudos\/s\/lasMesasEscudo\.png"/);
  assert.doesNotMatch(head, /loading="lazy"/);
  assert.match(head, /decoding="async"><div class="screen-head-text"><h1>Las Mesas Hu\.<\/h1><p class="screen-sub">Prebenjamín, Grupo 2 de Gran Canaria<\/p><\/div>/);
  assert.match(head, /<a class="screen-action" href="#\/explorar#buscar">Cambiar<\/a><\/header>$/);
});

test('A (PG2, 01/03/2026): próximo partido con cuenta atrás, casillas, local y visitante, sin campo y sin «Cómo llegar»', () => {
  const out = render(CASES.A);
  assert.match(out, /data-state="A"/);
  const block = blockOf(out, 'Próximo partido');
  assert.match(block, /<p class="block-context">faltan 6 días<\/p>/);
  assert.equal(text(block), 'Próximo partido faltan 6 días Jornada 18 Fecha sáb 7 mar Hora 09:00 '
    + 'Local Veteranos – Visitante Las Mesas Hu. Campo no publicado Calendario Compartir');
  assert.match(block, /<span class="cell-label">Campo<\/span><span class="fixture-place is-muted">no publicado<\/span>/);
  assert.match(block, /<div class="buttons"><button type="button" class="button is-main" data-action="calendario">Calendario<\/button><button type="button" class="button" data-action="compartir">Compartir<\/button><\/div>/);
  // La región de estado de «Compartir», la común (shareStatus): visible, bajo el bloque.
  assert.match(out, /<\/section><p class="share-status" role="status"><\/p>/);
});

test('A con campo (A2, 20/05/2026): «Cómo llegar» abre el mapa en otra pestaña y es la acción principal', () => {
  const out = render({ raw: currentAt('2026-05-20'), myTeam: { ...LAS_MESAS, cat: 'benjamin', groupId: 'A2' }, today: '2026-05-20' });
  const block = blockOf(out, 'Próximo partido');
  assert.match(block, /<p class="block-context">faltan 3 días<\/p>/);
  assert.match(text(block), /Jornada 22 Fecha sáb 23 may Hora 09:00 Local Las Mesas Hu\. – Visitante Simusetti Campo Pepe Gonçalvez/);
  assert.match(block, /<div class="buttons"><a class="button is-main" href="https:\/\/www\.google\.com\/maps\/search\/\?api=1&amp;query=Pepe%20Gon%C3%A7alvez%2C%20Gran%20Canaria%2C%20Espa%C3%B1a" target="_blank" rel="noopener noreferrer">Cómo llegar<\/a><button type="button" class="button" data-action="calendario">Calendario<\/button>/);
});

test('A con el «hoy» de Canarias: el día del partido es «hoy» y el partido sigue siendo el próximo; la víspera, «mañana»', () => {
  for (const [today, label] of [['2026-03-07', 'hoy'], ['2026-03-06', 'mañana']]) {
    const out = render({ raw: currentAt('2026-03-07'), today });
    assert.match(out, /data-state="A"/, today);
    const block = blockOf(out, 'Próximo partido');
    assert.match(block, new RegExp(`<p class="block-context">${label}</p>`), today);
    assert.match(text(block), /Jornada 18 Fecha sáb 7 mar Hora 09:00/, today);
  }
});

test('Últimos cinco (C, 03/06/2026): G/E/P con texto oculto, marcador de Las Mesas, rival corto, enlace a cada partido y «calendario completo»', () => {
  const block = blockOf(render(CASES.C), 'Últimos cinco');
  const cells = [...block.matchAll(/<a class="last5-cell" href="([^"]+)">(.*?)<\/a>/g)];
  assert.deepEqual(cells.map(m => text(m[2])), [
    'E Empatado, 1–1 en casa contra Arucas B', 'P Perdido, 0–3 fuera contra Telde', 'P Perdido, 1–8 en casa contra Victoria',
    'G Ganado, 9–2 fuera contra Calero', 'P Perdido, 2–7 en casa contra Huracán']);
  assert.equal(cells[3][1], '#/partido?s=2025-2026&amp;g=PG2&amp;r=Jornada%2029&amp;h=CD%20Calero&amp;a=Las%20Mesas%20Hu.');
  assert.match(block, /<ol class="last5 last5-5"><li><a class="last5-cell" href="[^"]+"><span class="form-chip form-e" aria-hidden="true">E<\/span><span class="vh">Empatado, <\/span><span class="last5-score">1–1<\/span>/);
  assert.match(block, /<p class="block-context"><a class="more" href="#\/equipo\?s=2025-2026&amp;g=PG2&amp;t=Las%20Mesas%20Hu\.#calendario">calendario completo<\/a><\/p>/);
  // Con menos de cinco partidos jugados, «Últimos resultados» con los que haya.
  const early = render({ raw: currentAt('2025-10-25'), today: '2025-10-25' });
  assert.match(early, /data-state="A"/);
  assert.match(blockOf(early, 'Últimos resultados'), /<ol class="last5 last5-2">/);
  assert.equal(blockOf(early, 'Últimos cinco'), null);
});

test('clasificación completa (C): las 15 filas, la propia resaltada y cada equipo a su ficha', () => {
  const block = blockOf(render(CASES.C), 'Clasificación');
  assert.equal((block.match(/<th scope="row" class="st-team">/g) || []).length, 15);
  assert.match(block, /<p class="block-context">tras la jornada 30<\/p>/);
  assert.match(block, /<caption class="vh">Clasificación: Prebenjamín, Grupo 2 de Gran Canaria<\/caption>/);
  assert.equal((block.match(/class="is-mine"/g) || []).length, 1);
  assert.match(block, /<tr class="is-mine"><td class="st-pos">9<\/td><th scope="row" class="st-team"><a class="st-link" href="#\/equipo\?s=2025-2026&amp;g=PG2&amp;t=Las%20Mesas%20Hu\.">/);
  assert.match(block, /<th scope="col" class="st-num st-pj"><abbr title="Partidos jugados">J<\/abbr><\/th><th scope="col" class="st-num st-g"><abbr title="Ganados">G<\/abbr><\/th>/);
});

test('goleadores del equipo (C): los 5 primeros de Las Mesas, nunca los de otro equipo, con el nombre de pila delante y «ver todos»', () => {
  const block = blockOf(render(CASES.C), 'Goleadores del equipo');
  const rows = [...block.matchAll(/<tr><th scope="row" class="sc-name">(.*?)<\/th><td class="sc-goals">(\d+)<\/td><td class="sc-games">(\d+)<\/td><\/tr>/g)]
    .map(m => [m[1], Number(m[2]), Number(m[3])]);
  assert.deepEqual(rows, [['Theo De La Rosa Perello', 12, 17], ['Agoney Santana Santacruz', 11, 21], ['Einar Ruiz Aleman', 9, 23],
    ['Pablo Hidalgo Camejo', 8, 18], ['Nadir Medina Hairach', 8, 21]]);
  assert.doesNotMatch(block, /León|Aloma/);
  assert.match(block, /<a class="more" href="#\/goleadores\?s=2025-2026&amp;g=PG2&amp;t=Las%20Mesas%20Hu\.">ver todos<\/a>/);
  assert.match(block, /<caption class="vh">Goleadores de Las Mesas Hu\.<\/caption>/);
  const none = render({ ...CASES.C, gol: {} });
  assert.match(blockOf(none, 'Goleadores del equipo'), /<p class="empty">Sin goleadores publicados de este equipo<\/p>/);
});

test('la temporada en cifras (C): de la tabla y del calendario, con la nota de cobertura del caso 6 de §11', () => {
  const out = render(CASES.C);
  assert.equal(text(blockOf(out, 'La temporada en cifras')), 'La temporada en cifras Goles a favor 90 En contra 120 '
    + 'Por partido 3,2 – 4,6 En casa 5G 1E 7P Fuera 5G 0E 8P Mejor resultado 9–2 Calero Peor derrota 1–11 Unión Viera');
  assert.match(out, /<\/section><p class="notice"><b>Cobertura:<\/b> 26 partidos en el calendario y 2 contra CD Batán \(retirado\)<\/p>/);
});

test('coverageText: los textos de §7 y los casos que §7 no prevé (B1, «Para B2»)', () => {
  const batan = { retired: ['CD Batán'] };
  assert.equal(coverageText(null), null);
  assert.equal(coverageText({ ...batan, played: 28, calendar: 26, vsRetired: 2, withResult: 26 }),
    '26 partidos en el calendario y 2 contra CD Batán (retirado)');
  // A mitad de temporada el calendario trae los partidos futuros, que no son de «cobertura».
  assert.equal(coverageText({ ...batan, played: 18, calendar: 26, vsRetired: 1, withResult: 17 }),
    '17 partidos jugados en el calendario y 1 contra CD Batán (retirado)');
  // Si falta algo más, solo cuentan los partidos `sin resultado`.
  assert.equal(coverageText({ played: 18, calendar: 26, vsRetired: 0, retired: [], withResult: 17 }, 1), '17 de 18 partidos con resultado');
  assert.equal(coverageText({ ...batan, played: 28, calendar: 26, vsRetired: 2, withResult: 25 }, 1),
    '25 de 26 partidos con resultado y 2 contra CD Batán (retirado)');
  // PJ menor que el calendario (FV13 2023-24) o calendario muy incompleto (LZP1 2021-22).
  assert.equal(coverageText({ played: 18, calendar: 20, vsRetired: 0, retired: [], withResult: 20 }),
    'Calculado con 20 partidos del calendario; la clasificación cuenta 18');
  assert.equal(coverageText({ played: 24, calendar: 14, vsRetired: 0, retired: [], withResult: 14 }),
    'Calculado con 14 partidos del calendario; la clasificación cuenta 24');
  assert.equal(coverageText({ played: 20, calendar: 16, vsRetired: 4, retired: ['CD Batán', 'CD Teguinte'], withResult: 16 }),
    '16 partidos en el calendario y 4 contra CD Batán y CD Teguinte (retirados)');
});

test('frescura: fuente y hora de Canarias de la comprobación del grupo, «hoy» si es hoy, «Revisión pendiente» y sin fecha sin data-health', () => {
  const fresh = markup => text(String(markup).match(/<p class="home-fresh">.*?<\/p>/)[0]);
  assert.equal(fresh(render(CASES.C)), 'Clasificación oficial de futbolaspalmas.com, comprobada el 23 de septiembre a las 22:11. Ver fuentes');
  assert.match(render(CASES.C), /<p class="home-fresh">[^<]*<a class="more" href="#\/fuentes">Ver fuentes<\/a><\/p>/);
  // 23:30 UTC del 02/06 son las 0:30 del 03/06 en Canarias: «hoy».
  const at = (checkedAt, status = 'ok') => ({ ...health, groups: { ...health.groups, PG2: { ...health.groups.PG2, checkedAt, status } } });
  assert.equal(fresh(render({ ...CASES.C, withHealth: at('2026-06-02T23:30:00+00:00') })),
    'Clasificación oficial de futbolaspalmas.com, comprobada hoy a las 0:30. Ver fuentes');
  assert.equal(fresh(render({ ...CASES.C, withHealth: at('2026-06-03T04:35:00+00:00', 'rejected') })),
    'Clasificación oficial de futbolaspalmas.com, comprobada hoy a las 5:35. Revisión pendiente. Ver fuentes');
  assert.equal(fresh(render({ ...CASES.C, withHealth: null })), 'Clasificación oficial de futbolaspalmas.com. Ver fuentes');
  // Calculada y corregida (standingsKind): la frase de procedencia común (sourcePhrase), la de la Tabla.
  const kind = (standingsKind) => {
    const raw = currentAt('2026-06-03');
    raw.prebenjamin.find(g => g.id === 'PG2').standingsKind = standingsKind;
    return fresh(render({ ...CASES.C, raw }));
  };
  assert.equal(kind('reconstructed'),
    'Clasificación calculada con los resultados de futbolaspalmas.com, comprobada el 23 de septiembre a las 22:11. Ver fuentes');
  assert.equal(kind('corrected'),
    'Clasificación de futbolaspalmas.com con los puntos corregidos, comprobada el 23 de septiembre a las 22:11. Ver fuentes');
});

test('B, primera causa (2026/27 simulada, 01/10/2026): próximo partido normal, un único vacío y la tabla a cero en el orden de la fuente', () => {
  const out = render(CASES.B);
  assert.match(out, /data-state="B"/);
  const next = blockOf(out, 'Próximo partido');
  assert.match(next, /<p class="block-context">faltan 10 días<\/p>/);
  assert.match(text(next), /Jornada 1 Fecha dom 11 oct Hora 12:00 Local Las Mesas Hu\. – Visitante UD Jinámar/);
  assert.equal((out.match(/<p class="empty">/g) || []).length, 1);
  assert.match(out, /<p class="empty">Aún no se ha jugado ninguna jornada<\/p>/);
  for (const title of ['Últimos cinco', 'Últimos resultados', 'Goleadores del equipo', 'La temporada en cifras']) {
    assert.equal(blockOf(out, title), null, title);
  }
  const table = blockOf(out, 'Clasificación');
  const source = fixture('current-2025-2026').prebenjamin.find(g => g.id === 'PG2').standings.map(r => r[1]);
  assert.deepEqual([...table.matchAll(/<span class="st-name">(.*?)<\/span>/g)].map(m => m[1]), source);
  assert.equal((table.match(/<td class="st-pts">0<\/td>/g) || []).length, 15);
  assert.doesNotMatch(table, /block-context/, 'sin jornada jugada no hay «tras la jornada»');
  // Nunca datos de 2025/26 bajo los títulos de 2026/27 (ni la comprobación de data-health de 2025-26).
  assert.doesNotMatch(out, /2025/);
  // Clasificación vacía: el vacío «Clasificación sin publicar».
  const raw = structuredClone(CASES.B.raw);
  raw.prebenjamin.find(g => g.id === 'PG2').standings = [];
  const unpublished = render({ ...CASES.B, raw });
  assert.match(unpublished, /data-state="B"/);
  assert.match(blockOf(unpublished, 'Clasificación'), /<p class="empty">Clasificación sin publicar<\/p>/);
});

test('B, segunda causa (M2): CD Batán, retirado en PG2, nunca ve «Aún no se ha jugado ninguna jornada» ni una tabla a cero', () => {
  const out = render({ raw: currentAt('2026-03-01'), myTeam: { ...LAS_MESAS, name: 'CD Batán' }, today: '2026-03-01' });
  assert.match(out, /data-state="B"/);
  assert.doesNotMatch(out, /Aún no se ha jugado ninguna jornada/);
  assert.match(out, /<p class="empty">CD Batán figura como retirado en este grupo<\/p>/);
  assert.equal(text(blockOf(out, 'Próximo partido')), 'Próximo partido Sin partidos en el calendario de este grupo');
  const table = blockOf(out, 'Clasificación');
  assert.match(table, /<td class="st-pts">79<\/td>/);
  assert.match(table, /<tr class="is-mine"><td class="st-pos">15<\/td>/);
});

test('C: el último partido en grande abre su ficha, y la nota dice por qué no hay próximo (tres variantes)', () => {
  const out = render(CASES.C);
  assert.match(out, /data-state="C"/);
  const block = blockOf(out, 'Último partido');
  assert.match(block, /<p class="block-context">jornada 30 · mar 2 jun<\/p>/);
  assert.match(block, /<a class="result" href="#\/partido\?s=2025-2026&amp;g=PG2&amp;r=Jornada%2030&amp;h=Las%20Mesas%20Hu\.&amp;a=AD%20Hurac%C3%A1n">/);
  assert.equal(text(block), 'Último partido jornada 30 · mar 2 jun Local Las Mesas Hu. 2–7 Visitante AD Huracán Ya ha jugado todos sus partidos');
  // Próximo partido sin fecha: el de la jornada 30 sin fecha publicada.
  const undated = currentAt('2026-05-31');
  undated.history.PG2['Jornada 30'][0][0] = '';
  const sinFecha = render({ raw: undated, today: '2026-05-31' });
  assert.match(sinFecha, /data-state="C"/);
  assert.equal(text(blockOf(sinFecha, 'Último partido')),
    'Último partido jornada 29 · jue 28 may Local CD Calero 2–9 Visitante Las Mesas Hu. Próximo partido sin fecha publicada');
  // Resultado pendiente de publicar: la jornada 30 (02/06) sin marcador el 03/06.
  const late = render({ raw: currentAt('2026-06-02'), today: '2026-06-03' });
  assert.match(late, /data-state="C"/);
  assert.match(text(blockOf(late, 'Último partido')), /Resultado pendiente de publicar$/);
  assert.match(late, /<b>Cobertura:<\/b> 25 de 26 partidos con resultado y 2 contra CD Batán \(retirado\)<\/p>/);
});

test('E, caso 2b: la pregunta con los candidatos (escudo, nombre y etiqueta de grupo con la categoría) y «Ninguno: buscar otro equipo»', () => {
  const out = render(CASES.E);
  assert.match(out, /data-state="E"/);
  assert.match(out, /<h1>Las Mesas Hu\. B<\/h1><p class="screen-sub">Temporada 2025\/26<\/p><\/div><\/header>/);
  assert.doesNotMatch(out, /Cambiar/);
  const block = blockOf(out, '¿En qué equipo juega ahora?');
  const choices = [...block.matchAll(/<button type="button" class="choice" data-action="elegir" data-index="(\d+)">(.*?)<\/button>/g)];
  assert.deepEqual(choices.map(m => [m[1], text(m[2])]), [
    ['0', 'Las Mesas Hu. Benjamín, Segunda Fase A, Grupo 2'], ['1', 'Las Mesas B Benjamín, Segunda Fase B, Grupo 2']]);
  assert.match(choices[0][2], /^<img class="crest crest-32" src="\.\/escudos\/s\/lasMesasEscudo\.png"/);
  assert.match(block, /<li><a class="choice choice-none" href="#\/explorar#buscar">Ninguno: buscar otro equipo<\/a><\/li><\/ul>/);
  assert.deepEqual(titles(out), ['¿En qué equipo juega ahora?']);
  // Desde 2024-25 (paso 1), tres candidatos: A2 y B2 de benjamín y PG2 de prebenjamín.
  const three = render({ myTeam: { name: 'Las Mesas Hu. B', season: '2024-2025', cat: 'benjamin', groupId: 'P9' }, today: '2026-09-23' });
  assert.deepEqual([...three.matchAll(/<span class="choice-label">(.*?)<\/span>/g)].map(m => m[1]), [
    'Benjamín, Segunda Fase A, Grupo 2', 'Benjamín, Segunda Fase B, Grupo 2', 'Prebenjamín, Grupo 2 de Gran Canaria']);
  // Un solo candidato con otro nombre también pregunta (decisión 13 de B1): el favorito v1 migrado de un torneo.
  const one = render({ myTeam: { name: 'UD Las Mesas Huracán', season: '2025-2026', cat: 'prebenjamin', groupId: 'MCP3' }, today: '2026-09-23' });
  assert.match(one, /data-state="E"/);
  assert.deepEqual([...one.matchAll(/<span class="choice-name">(.*?)<\/span>/g)].map(m => m[1]), ['Las Mesas Hu.']);
});

test('X: «Las Mesas Hu. no aparece en 2026/27» y «Elegir equipo» a Explorar', () => {
  const out = render(CASES.X);
  assert.match(out, /data-state="X"/);
  assert.match(out, /<p class="empty">Las Mesas Hu\. no aparece en 2026\/27<\/p><div class="buttons home-cta"><a class="button is-main" href="#\/explorar#buscar">Elegir equipo<\/a><\/div>/);
  assert.doesNotMatch(out, /Cambiar/);
  assert.deepEqual(titles(out), []);
});

test('stale (decisión 20 de B1): el aviso bajo la cabecera en C y en D, y nunca en A', () => {
  const stale = (today, options) => ({ ...options, today, resolution: (resolution) => ({ ...resolution, stale: true }) });
  const aviso = '<p class="notice"><b>¿Sigue tu equipo en la Segunda Fase?</b> <a class="more" href="#/explorar#buscar">Búscalo en Explorar</a></p>';
  for (const [state, options] of [['C', CASES.C], ['D', CASES.D]]) {
    const out = render(stale(options.today, options));
    assert.match(out, new RegExp(`data-state="${state}"`));
    assert.ok(out.includes(`Cambiar</a></header>${aviso}<div class="home-cols">`), state);
    assert.ok(!render(options).includes('Segunda Fase?'), `${state} sin stale`);
  }
  assert.ok(!render(stale('2026-03-01', CASES.A)).includes('Segunda Fase?'));
});

test('primera visita y almacén roto: la portada de PORTAL.defaultTeam sin preguntas; con favoritos v1, la migración y el paso 0', () => {
  const defaultTeam = { cat: 'prebenjamin', groupId: 'PG2', name: 'Las Mesas Hu.' };
  const empty = { getItem: () => null, setItem: () => {} };
  const blocked = () => { throw new DOMException('bloqueado', 'SecurityError'); };
  const v1 = { getItem: key => (key === LEGACY_KEY ? JSON.stringify(fixture('favorites-v1')) : null), setItem: () => {} };
  for (const [label, storage] of [['vacío', empty], ['bloqueado', blocked], ['favoritos v1', v1]]) {
    const { myTeam } = loadStore(storage, { defaultTeam, portalSeason: '2025-2026' });
    for (const [options, state] of [[CASES.D, 'D'], [CASES.A, 'A']]) {
      const out = render({ ...options, myTeam });
      assert.match(out, new RegExp(`data-state="${state}"`), `${label} ${state}`);
      assert.match(out, /<h1>Las Mesas Hu\.<\/h1>/, `${label} ${state}`);
    }
  }
});

test('los nombres con comillas y signos se escapan en el texto y en los enlaces', () => {
  const odd = 'MESAS, U.D. LAS "B" <x>';
  const raw = currentAt('2026-06-03');
  const swap = name => (name === 'Las Mesas Hu.' ? odd : name);
  for (const row of raw.prebenjamin.find(g => g.id === 'PG2').standings) row[1] = swap(row[1]);
  for (const rows of Object.values(raw.history.PG2)) for (const row of rows) { row[1] = swap(row[1]); row[2] = swap(row[2]); }
  const out = render({ raw, myTeam: { ...LAS_MESAS, name: odd }, today: '2026-06-03' });
  assert.match(out, /data-state="C"/);
  assert.doesNotMatch(out, /"B"|<x>/);
  assert.match(out, /<h1>MESAS, U\.D\. LAS &quot;B&quot; &lt;x&gt;<\/h1>/);
  assert.match(out, /t=MESAS%2C%20U\.D\.%20LAS%20%22B%22%20%3Cx%3E#calendario"/);
});

test('ni inglés ni emoji: Local/Visitante y G/E/P en todos los estados', () => {
  const all = Object.values(CASES).map(render).join('\n');
  assert.doesNotMatch(text(all), /\b(HOME|AWAY|Home|Away|home|away)\b/);
  assert.doesNotMatch(text(all), /(^|[^\p{L}])[WDL]([^\p{L}]|$)/u);
  assert.doesNotMatch(all, /\p{Extended_Pictographic}/u);
});

test('shareData y matchCalendar: el enlace absoluto al partido y su .ics con la hora de Canarias', () => {
  const raw = currentAt('2026-05-20');
  const a2 = buildSeason({ name: raw.season, current: true, ...raw }).groups.find(g => g.id === 'A2');
  const next = teamFixtures('Las Mesas Hu.', a2, '2026-05-20').next;
  const data = shareData(next, 'https://malolocabreralolo-tech.github.io/futbol-base/index.html');
  assert.deepEqual(data, {
    title: 'Las Mesas Hu. – Simusetti', text: 'Las Mesas Hu. – Simusetti, sáb 23 may, 09:00',
    url: 'https://malolocabreralolo-tech.github.io/futbol-base/index.html#/partido?s=2025-2026&g=A2&r=Jornada%2022&h=Las%20Mesas%20Hu.&a=Simusetti',
  });
  const ics = matchCalendar(next, a2, { url: data.url, now: new Date('2026-05-20T10:00:00Z') });
  assert.equal((ics.match(/BEGIN:VEVENT/g) || []).length, 1);
  assert.match(ics, /\r\nDTSTART:20260523T080000Z\r\n/, 'las 09:00 de Canarias en verano son las 08:00 UTC');
  assert.match(ics, /\r\nSUMMARY:Las Mesas Hu\. – Simusetti\r\n/);
  assert.match(ics, /\r\nLOCATION:Pepe Gonçalvez\r\n/);
});

test('mount: responder a la pregunta E guarda { name, season, cat, groupId } del candidato con nav.saveMyTeam', () => {
  const ctx = homeCtx(CASES.E);
  let onClick = null;
  const section = { addEventListener: (type, fn) => { if (type === 'click') onClick = fn; }, contains: () => true, querySelector: () => null };
  const root = { matches: () => false, querySelector: selector => (selector === '[data-screen="home"]' ? section : null) };
  const saved = [];
  screen.mount(root, ctx, { saveMyTeam: team => saved.push(team) });
  const button = { getAttribute: name => ({ 'data-action': 'elegir', 'data-index': '1' })[name] };
  onClick({ target: { closest: () => button } });
  assert.deepEqual(saved, [{ name: 'Las Mesas B', season: '2025-2026', cat: 'benjamin', groupId: 'B2' }]);
});

// I2 de la revisión final de B2: la respuesta común de «Compartir» (la de Partido). Sin share ni
// portapapeles, el enlace va a la región de estado para copiarlo a mano, y el botón no cambia.
test('mount: «Compartir» sin share ni portapapeles escribe el enlace del partido en la región de estado', async () => {
  const ctx = homeCtx(CASES.A);
  let onClick = null;
  const status = { textContent: '' };
  const section = {
    addEventListener: (type, fn) => { if (type === 'click') onClick = fn; }, contains: () => true,
    querySelector: selector => (selector === '.share-status' ? status : null),
  };
  const root = { matches: () => false, querySelector: selector => (selector === '[data-screen="home"]' ? section : null) };
  const saved = { navigator: Object.getOwnPropertyDescriptor(globalThis, 'navigator'), location: globalThis.location };
  Object.defineProperty(globalThis, 'navigator', { configurable: true, writable: true,
    value: { clipboard: { writeText: async () => { throw new Error('denegado'); } } } });
  globalThis.location = { href: 'https://x.test/futbol-base/index.html#/' };
  try {
    screen.mount(root, ctx, {});
    const button = { textContent: 'Compartir', getAttribute: name => ({ 'data-action': 'compartir' })[name] };
    onClick({ target: { closest: () => button } });
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(status.textContent, 'No se pudo copiar el enlace: https://x.test/futbol-base/index.html'
      + '#/partido?s=2025-2026&g=PG2&r=Jornada%2018&h=Veteranos&a=Las%20Mesas%20Hu.');
    assert.equal(button.textContent, 'Compartir', 'el botón no cambia de texto');
  } finally {
    if (saved.navigator) Object.defineProperty(globalThis, 'navigator', saved.navigator);
    else delete globalThis.navigator;
    if (saved.location === undefined) delete globalThis.location;
    else globalThis.location = saved.location;
  }
});

test('fechas en castellano sin Intl (links.js): los días y los meses van escritos en el código', () => {
  assert.equal(weekdayDate('2026-03-07'), 'sáb 7 mar');
  assert.equal(weekdayDate('2026-10-04'), 'dom 4 oct');
  assert.equal(weekdayDate('2026-09-23'), 'mié 23 sept');
  assert.equal(dayMonth('2026-09-23'), '23 sept');
  assert.equal(dayMonthLong('2026-09-23'), '23 de septiembre');
  assert.equal(monthName('2026-06-27'), 'junio');
  for (const bad of ['', null, undefined, '2026-02-30', '23/09/2026']) {
    for (const f of [weekdayDate, dayMonth, dayMonthLong, monthName]) assert.equal(f(bad), null, `${f.name}(${bad})`);
  }
  // Sin datos de idioma (o con otros), las fechas salen igual: no pasan por Intl.
  const saved = Intl.DateTimeFormat;
  Intl.DateTimeFormat = function broken() { throw new Error('sin datos de idioma'); };
  try {
    assert.equal(weekdayDate('2026-02-12'), 'jue 12 feb');
    assert.equal(dayMonthLong('2026-01-01'), '1 de enero');
  } finally {
    Intl.DateTimeFormat = saved;
  }
});

test('shareLink y copyText (links.js): navigator.share si existe; si no, o si falla, copia el enlace', async () => {
  const saved = Object.getOwnPropertyDescriptor(globalThis, 'navigator');
  const withNavigator = value => Object.defineProperty(globalThis, 'navigator', { value, configurable: true, writable: true });
  const data = { title: 'Las Mesas Hu. – Simusetti', text: 'Las Mesas Hu. – Simusetti, sáb 23 may, 09:00',
    url: 'https://malolocabreralolo-tech.github.io/futbol-base/#/partido?s=2025-2026&g=A2' };
  const copied = [];
  const clipboard = { writeText: async text => { copied.push(text); } };
  try {
    withNavigator({ share: async () => {}, clipboard });
    assert.equal(await shareLink(data), 'compartido');
    withNavigator({ share: async () => { throw new DOMException('cancelado', 'AbortError'); }, clipboard });
    assert.equal(await shareLink(data), 'cancelado');
    withNavigator({ share: async () => { throw new DOMException('sin permiso', 'NotAllowedError'); }, clipboard });
    assert.equal(await shareLink(data), 'copiado', 'si share falla, copia');
    withNavigator({ clipboard });
    assert.equal(await shareLink(data), 'copiado', 'sin share, copia');
    assert.deepEqual(copied, [data.url, data.url]);
    // Sin portapapeles y sin documento (Node), no se copia y no lanza.
    withNavigator({ clipboard: { writeText: async () => { throw new Error('denegado'); } } });
    assert.equal(await shareLink(data), 'no copiado');
    assert.equal(await copyText('x'), false);
  } finally {
    if (saved) Object.defineProperty(globalThis, 'navigator', saved);
    else delete globalThis.navigator;
  }
});

test('cada semana real de 2025/26, seis equipos: un estado con contenido y sin «undefined», «null» ni «NaN» (foco 5)', () => {
  const teams = [
    LAS_MESAS, { ...LAS_MESAS, cat: 'benjamin', groupId: 'FF5' },
    { name: 'Las Mesas Hu. B', season: '2025-2026', cat: 'benjamin', groupId: 'FF13' },
    { ...LAS_MESAS, name: 'RC Victoria' }, { ...LAS_MESAS, name: 'CD Batán' },
    { name: 'Unión Tetir', season: '2025-2026', cat: 'prebenjamin', groupId: 'PFV2' },
  ];
  const seen = new Set();
  for (let day = Date.UTC(2025, 8, 1); day <= Date.UTC(2026, 8, 28); day += 7 * 86400000) {
    const today = new Date(day).toISOString().slice(0, 10);
    const model = createModel(datasetsFrom(currentAt(today), { golBenj: GOL.benjamin, golPrebenj: GOL.prebenjamin }),
      { portalSeason: '2025-2026', buildClubIndex });
    const season = model.season('2025-2026');
    const index = model.clubIndex();
    for (const myTeam of teams) {
      const out = String(screen.render({ route: { screen: '', params: {} }, params: {}, model, myTeam, today, health,
        legacyDate: null, resolution: resolveMyTeam(myTeam, season, index, today), datasets: { shields },
        portal: { season: '2025-2026', defaultTeam: LAS_MESAS }, lastPrimary: 'miequipo' }));
      seen.add(out.match(/^<section data-screen="home" data-state="([A-EX])">/)[1]);
      assert.doesNotMatch(text(out), /\b(undefined|null|NaN)\b|Invalid Date/, `${today} ${myTeam.name}`);
      assert.ok(titles(out).length > 0, `${today} ${myTeam.name}: sin bloques`);
    }
  }
  assert.deepEqual([...seen].sort(), ['A', 'B', 'C', 'D', 'E']);
});

// ── Hoja de estilos: cada clase existe y las reglas de intención (spec §3 y §8) ──

const CSS = readFileSync(join(ROOT, 'acta.css'), 'utf8');
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
const RULES = parseCss(CSS);
function decl(selector, media = m => m === null) {
  const found = RULES.filter(r => media(r.media) && r.selector.split(',').map(x => x.trim()).includes(selector));
  assert.ok(found.length, `no hay regla para «${selector}»`);
  return found.map(r => r.body).join(';');
}
const DEFINED = new Set([...CSS.replace(/\/\*[\s\S]*?\*\//g, '').matchAll(/\.([a-zA-Z][\w-]*)/g)].map(m => m[1]));
const missingClasses = markup => [...new Set([...String(markup).matchAll(/class="([^"]+)"/g)]
  .flatMap(m => m[1].split(/\s+/)))].filter(c => !DEFINED.has(c));

test('cada clase que emite la portada existe en acta.css', () => {
  const out = [
    ...Object.values(CASES).map(render),
    render({ raw: currentAt('2026-05-20'), myTeam: { ...LAS_MESAS, cat: 'benjamin', groupId: 'A2' }, today: '2026-05-20' }),
    render({ raw: currentAt('2025-10-25'), today: '2025-10-25' }),
    render({ ...CASES.C, gol: {} }),
    render({ raw: currentAt('2026-03-01'), myTeam: { ...LAS_MESAS, name: 'CD Batán' }, today: '2026-03-01' }),
  ].join('');
  assert.deepEqual(missingClasses(out), []);
});

test('estilos de la portada: pulsables de 44 px y nombres con elipsis', () => {
  for (const sel of ['.more', '.last5-cell', '.result']) assert.match(decl(sel), /min-height:\s*44px/, sel);
  assert.match(decl('.choice'), /min-height:\s*56px/);
  for (const sel of ['.fixture-name', '.last5-rival', '.scorers .sc-name']) {
    assert.match(decl(sel), /text-overflow:\s*ellipsis/, sel);
    assert.match(decl(sel), /white-space:\s*nowrap/, sel);
  }
  assert.match(decl('.scorers thead th'), /border-bottom:\s*1\.5px solid var\(--ink\)/);
  assert.match(decl('.last5'), /background:\s*var\(--rule\)/, 'las divisiones de las casillas van en --rule');
  assert.match(decl('.result-score'), /font-size:\s*40px/, 'el marcador grande es el de 40 px de la escala');
  const home = RULES.filter(r => /home|fixture|last5|scorers|choice|result|\.more/.test(r.selector)).map(r => r.body).join(';');
  assert.doesNotMatch(home, /text-transform|border-radius|box-shadow/);
});

// ── Estado D, «Verano», clasificación final y escritorio (Tarea 8) ────────

const DESKTOP = media => media !== null && /min-width:\s*1024px/.test(media);

test('D el 23/09/2026 (caso 1 de §11): «A la espera de la temporada 2026/27» y la caja con sus casillas y su texto', () => {
  const out = render(CASES.D);
  assert.match(out, /data-state="D"/);
  assert.match(out, /<h1>Las Mesas Hu\.<\/h1><p class="screen-sub">A la espera de la temporada 2026\/27<\/p><\/div><a class="screen-action" href="#\/explorar#buscar">Cambiar<\/a>/);
  assert.equal(text(blockOf(out, 'Temporada 2026/27')), 'Temporada 2026/27 Grupos pendientes en esta web Última comprobación hoy, 22:11 '
    + 'La temporada 2026/27 aparecerá aquí cuando la federación publique los grupos y se activen en esta web. '
    + 'Si hay más de un equipo de Las Mesas Hu., te preguntaremos cuál es el tuyo.');
  assert.doesNotMatch(out, /[Ss]e revisa/);
  assert.doesNotMatch(out, /Próximo partido/);
});

test('D sin la caja: el 15/06/2026 con 2026/27 ya lista, «Temporada 2025/26 terminada»', () => {
  const ready = { ...health, nextSeason: { name: '2026-2027', status: 'ready' } };
  const out = render({ today: '2026-06-15', withHealth: ready });
  assert.match(out, /data-state="D"/);
  assert.match(out, /<p class="screen-sub">Temporada 2025\/26 terminada<\/p>/);
  assert.equal(blockOf(out, 'Temporada 2026/27'), null);
});

test('D sin data-health: la caja sale con la fecha del literal «Última actualización», sin hora, o «no disponible»', () => {
  const legacy = render({ today: '2026-09-23', withHealth: null, legacyDate: '23/09/2026' });
  assert.match(text(blockOf(legacy, 'Temporada 2026/27')), /Grupos pendientes en esta web Última comprobación 23 sept La temporada/);
  const none = render({ today: '2026-09-23', withHealth: null });
  assert.match(blockOf(none, 'Temporada 2026/27'), /<div class="cell is-muted"><dt class="cell-label">Última comprobación<\/dt><dd class="cell-value">no disponible<\/dd><\/div>/);
});

test('«Así terminó 2025/26»: puesto de 15, puntos, balance, goles, último resultado y máximo goleador del equipo', () => {
  assert.equal(text(blockOf(render(CASES.D), 'Así terminó 2025/26')), 'Así terminó 2025/26 Prebenjamín, Grupo 2 de Gran Canaria '
    + 'Posición 9.º de 15 Puntos 37 Balance 12G 1E 15P A favor 90 goles En contra 120 goles Último 2–7 Huracán '
    + 'Máximo goleador Theo De La Rosa Perello, 12 goles en 17 partidos');
  assert.doesNotMatch(blockOf(render({ ...CASES.D, gol: {} }), 'Así terminó 2025/26'), /Máximo goleador/);
});

test('Verano de PG2 (caso 8 de §11): MCP3 y MCPK1 con el puesto, los partidos de cuadro y el paso por penaltis; nunca los de benjamín', () => {
  const block = blockOf(render(CASES.D), 'Verano: Maspalomas Cup 2026');
  assert.match(block, /<p class="block-context">junio<\/p>/);
  const rows = [...block.matchAll(/<a class="summer-row" href="([^"]+)">(.*?)<\/a>/g)].map(m => [m[1], text(m[2])]);
  assert.deepEqual(rows, [
    ['#/copa?s=2025-2026&amp;g=MCP3', 'Fase de grupos, Grupo C 3.º de 4 3 pts'],
    ['#/copa?s=2025-2026&amp;g=MCPK1', 'Copa Plata, previa · vie 26 jun Tablero – Las Mesas Huracán 1–4'],
    ['#/copa?s=2025-2026&amp;g=MCPK1', 'Copa Plata, cuartos · sáb 27 jun Las Mesas Huracán – Unión Carrizal 1–1 Las Mesas Huracán pasó por penaltis (3–2)'],
    ['#/copa?s=2025-2026&amp;g=MCPK1', 'Copa Plata, semifinales · sáb 27 jun Las Mesas Huracán – Maspa Training A 2–4'],
  ]);
  assert.doesNotMatch(block, /MCB16|MCBK2|Copa Oro|Grupo P\b/);
  // RC Victoria no tiene «Verano»: «Real Club Victoria» (MCP3) no se une a su club (B1, «Para B2»).
  assert.ok(!titles(render({ ...CASES.D, myTeam: { ...LAS_MESAS, name: 'RC Victoria' } })).some(t => t.startsWith('Verano')));
});

test('«Ver toda la temporada 2025/26» abre la ficha del equipo en esa temporada y grupo', () => {
  assert.match(render(CASES.D), /<a class="home-all" href="#\/equipo\?s=2025-2026&amp;g=PG2&amp;t=Las%20Mesas%20Hu\.">Ver toda la temporada 2025\/26<\/a>/);
});

test('«Clasificación final»: la fila propia con dos arriba y dos abajo, con #, Equipo, J, DG y Pts, y «ver completa»', () => {
  const rowsOf = block => [...block.matchAll(/<tr( class="is-mine")?><td class="st-pos">(\d+)<\/td>.*?<span class="st-name">(.*?)<\/span>/g)]
    .map(m => [Number(m[2]), m[3], Boolean(m[1])]);
  const block = blockOf(render(CASES.D), 'Clasificación final');
  assert.deepEqual(rowsOf(block), [[7, 'Gran Canaria', false], [8, 'Telde', false], [9, 'Las Mesas Hu.', true],
    [10, 'Santa Brígida', false], [11, 'Las Huesas', false]]);
  assert.deepEqual([...block.matchAll(/<th scope="col" class="[^"]+">(?:<abbr title="[^"]+">)?(.*?)(?:<\/abbr>)?<\/th>/g)].map(m => m[1]),
    ['#', 'Equipo', 'J', 'DG', 'Pts']);
  assert.match(block, /<p class="block-context"><a class="more" href="#\/tabla\?s=2025-2026&amp;g=PG2">ver completa<\/a><\/p>/);
  assert.match(block, /<caption class="vh">Clasificación final: Prebenjamín, Grupo 2 de Gran Canaria<\/caption>/);
  // Cerca de un extremo, las cinco primeras o las cinco últimas.
  const top = blockOf(render({ ...CASES.D, myTeam: { ...LAS_MESAS, name: 'Unión Viera' } }), 'Clasificación final');
  assert.deepEqual(rowsOf(top).map(r => r[0]), [1, 2, 3, 4, 5]);
  const bottom = blockOf(render({ ...CASES.D, myTeam: { ...LAS_MESAS, name: 'CD Batán' } }), 'Clasificación final');
  assert.deepEqual(rowsOf(bottom).map(r => r[0]), [11, 12, 13, 14, 15]);
});

test('standingsTable: la vista «resumen» es #, Equipo, J, DG y Pts', () => {
  const row = { pos: 9, team: 'Las Mesas Hu.', pts: 37, pj: 28, g: 12, e: 1, p: 15, gf: 90, gc: 120, dg: -30, retired: false };
  const out = String(standingsTable([row], { view: 'resumen', mine: 'Las Mesas Hu.' }));
  assert.match(out, /<td class="st-pos">9<\/td><th scope="row" class="st-team">.*<\/th><td class="st-num st-pj">28<\/td><td class="st-dg">−30<\/td><td class="st-pts">37<\/td><\/tr>/);
});

test('dos columnas (§4.8): a la izquierda el partido, Últimos cinco y el hueco del calendario; a la derecha la clasificación, goleadores y cifras', () => {
  const columnsOf = markup => {
    const m = String(markup).match(/<div class="home-cols"><div class="home-main">([\s\S]*)<\/div><div class="home-side">([\s\S]*)<\/div><\/div><\/section>$/);
    return { main: m[1], side: m[2] };
  };
  const a = columnsOf(render(CASES.A));
  assert.deepEqual(titles(a.main), ['Próximo partido', 'Últimos cinco']);
  assert.ok(a.main.endsWith('<div data-slot="calendario"></div>'));
  assert.deepEqual(titles(a.side), ['Clasificación', 'Goleadores del equipo', 'La temporada en cifras']);
  assert.match(a.side, /<p class="home-fresh">.*<\/p>$/);
  const c = columnsOf(render(CASES.C));
  assert.deepEqual(titles(c.main), ['Último partido', 'Últimos cinco']);
  const b = columnsOf(render(CASES.B));
  assert.deepEqual(titles(b.main), ['Próximo partido']);
  assert.match(b.main, /<p class="empty">Aún no se ha jugado ninguna jornada<\/p><\/section><div data-slot="calendario"><\/div>$/);
  assert.deepEqual(titles(b.side), ['Clasificación']);
  const d = columnsOf(render(CASES.D));
  assert.deepEqual(titles(d.main), ['Temporada 2026/27', 'Así terminó 2025/26', 'Verano: Maspalomas Cup 2026']);
  assert.match(d.main, /<a class="home-all" href="[^"]+">Ver toda la temporada 2025\/26<\/a>$/);
  assert.deepEqual(titles(d.side), ['Clasificación final']);
  assert.doesNotMatch(d.main, /data-slot/);
});

test('teamCalendar: el calendario completo de escritorio, en orden de jornada, con su estado y un enlace por partido', () => {
  const raw = currentAt('2026-06-02');
  const pg2 = buildSeason({ name: raw.season, current: true, ...raw }).groups.find(g => g.id === 'PG2');
  const out = String(teamCalendar('Las Mesas Hu.', pg2, { today: '2026-06-03', shields }));
  assert.match(out, /^<section class="block" id="calendario"><div class="block-head"><h2 class="block-title">Calendario<\/h2><p class="block-context">26 partidos<\/p><\/div><ol class="box cal">/);
  const whens = [...out.matchAll(/<p class="cal-when">(.*?)<\/p>/g)].map(m => m[1]);
  assert.equal(whens.length, 26);
  assert.equal(whens[0], 'Jornada 1 · sáb 11 oct');
  assert.equal(whens[25], 'Jornada 30 · mar 2 jun');
  assert.equal((out.match(/<a class="match-row" href="#\/partido\?s=2025-2026&amp;g=PG2&amp;r=Jornada%20\d+&amp;/g) || []).length, 26);
  assert.equal((out.match(/<span class="match-note">sin resultado<\/span>/g) || []).length, 1);
  assert.deepEqual(missingClasses(out), []);
  assert.match(String(teamCalendar('CD Batán', pg2, { today: '2026-06-03' })), /<p class="empty">Sin partidos en el calendario de este grupo<\/p>/);
});

test('estilos de D y de escritorio: dos columnas desde 1024 px, filas de verano de 44 px y el calendario nunca oculto con CSS', () => {
  const cols = decl('.home-cols', DESKTOP);
  assert.match(cols, /display:\s*grid/);
  assert.match(cols, /grid-template-columns:\s*minmax\(0, 1fr\) minmax\(0, 1fr\)/);
  assert.doesNotMatch(decl('.home-cols'), /display:\s*(grid|flex)/, 'en móvil las columnas se apilan');
  assert.match(decl('.summer-row'), /min-height:\s*44px/);
  const all = decl('.home-all');
  assert.match(all, /min-height:\s*48px/);
  assert.match(all, /border:\s*1\.5px solid var\(--ink\)/);
  assert.match(decl('.summer-note'), /color:\s*var\(--ink\)/);
  assert.doesNotMatch(CSS, /(data-slot|\.cal\b|#calendario)[^{]*\{[^}]*display:\s*none/, 'lo pinta mount, no se esconde');
});
