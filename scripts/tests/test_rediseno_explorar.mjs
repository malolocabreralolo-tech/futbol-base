// Plan B3, Tarea 6: pantalla Explorar (spec §4.7 y maqueta 5-4; decisiones 16 a 19 de B3) y lo que
// añade al modelo (phaseLevel, searchKey, searchTeams, competitions y groupSummary) y a ui.js
// (searchBox, seasonPicker y linkRow). render(ctx) es pura: se prueba sobre el HTML que devuelve, con
// las fixtures congeladas y `today` inyectado. mount, con el router y el navegador falso comunes: al
// escribir, la lista cambia y la dirección se apunta sin volver a pintar la pantalla.
import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { fixture } from './fixtures/rediseno/load.mjs';
import { archive, nextSeasonRaw } from './fixtures/rediseno/simulate.mjs';
import { ctxFor, datasetsFor, cssRules, PORTAL_SEASON } from './fixtures/rediseno/screens.mjs';
import { fakeBrowser } from './fixtures/rediseno/fake-browser.mjs';
import { screen, searchView } from '../../src/screen-explorar.js';
import { SCREEN_MAP } from '../../src/screens.js';
import { startRouter } from '../../src/router.js';
import { createModel, competitions, groupSummary, phaseLevel, searchKey, searchTeams, topPhase } from '../../src/model.js';
import { searchBox, seasonPicker, linkRow } from '../../src/ui.js';

const s = (h) => String(h);
const text = (h) => s(h).replace(/<[^>]*>/g, ' ').replace(/&quot;/g, '"').replace(/&#39;/g, "'")
  .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim();
// Las temporadas de archivo de las fixtures, cargadas (y anunciadas en SEASONS).
const ARCHIVE = { '2024-2025': archive('2024-2025'), '2023-2024': archive('2023-2024') };
const ctxWith = (params, options = {}, data = {}) => ctxFor('explorar', { s: PORTAL_SEASON, ...params }, { ...options, datasets: datasetsFor(data) });
const render = (params, options, data) => s(screen.render(ctxWith(params, options, data)));
const modelWith = (data = {}) => ctxWith({}, {}, data).model;
const names = (entries) => entries.map((e) => `${e.name} [${e.group.id}]`);
// El bloque de título `title` del HTML de la pantalla.
const blockOf = (out, title) => (out.match(new RegExp(`<section class="block"><div class="block-head"><h2 class="block-title">${title}</h2>.*?</section>`)) || [''])[0];
// Las filas de enlace de clase `cls`: [href, texto], sin las iniciales de los monogramas (aria-hidden).
const rows = (html, cls) => [...html.matchAll(new RegExp(`<a class="${cls}" href="([^"]+)"[^>]*>(.*?)</a>`, 'g'))]
  .map((m) => [m[1].replace(/&amp;/g, '&'), text(m[2].replace(/<span class="mono[^"]*" aria-hidden="true">[^<]*<\/span>/g, ''))]);

// ── Modelo: fase, buscador, competiciones y resumen de grupo ────────────

test('phaseLevel: 2 en la Segunda Fase (con letra o sin ella), la Fase 2 y las ligas Oro, Plata y Bronce; 1 en lo demás', () => {
  const model = modelWith({ seasonRaw: ARCHIVE, champions: true });
  const level = (season, id) => phaseLevel(model.group(season, id));
  assert.deepEqual(['A1', 'B2', 'FF5', 'PG2', 'PFV2', 'BCA1', 'PCC1'].map((id) => level(PORTAL_SEASON, id)), [2, 2, 1, 1, 1, 1, 1]);
  assert.deepEqual(['A1', 'C2', 'P9', 'BCC1', 'PGC2'].map((id) => level('2024-2025', id)), [2, 2, 1, 1, 1]);
  assert.deepEqual(['SF1', 'GC3', 'BC1', 'CFV1'].map((id) => level('2023-2024', id)), [2, 1, 1, 1]);
  // Las fases de Fuerteventura de phases.json: Liga Oro (2025-26), Fase 2 (2024-25) y Fase 1.
  const raw = (season, code) => {
    const e = fixture('phases').find((x) => x.season === season && x.code === code);
    return { season, cat: e.cat, id: e.code, phase: e.phase, island: e.island, name: e.name };
  };
  assert.deepEqual([raw('2025-2026', 'FO'), raw('2024-2025', 'FV21'), raw('2025-2026', 'FV11')].map(phaseLevel), [2, 2, 1]);
  // topPhase: de unos { group, … }, los de la fase más alta (la regla de mi equipo, de su trayectoria y del buscador).
  const entries = ['FF5', 'A2', 'FF9', 'A1'].map((id) => ({ group: model.group(PORTAL_SEASON, id) }));
  assert.deepEqual(topPhase(entries).map((e) => e.group.id), ['A2', 'A1']);
  assert.deepEqual(topPhase(entries.slice(0, 1)).map((e) => e.group.id), ['FF5']);
});

test('searchKey: sin tildes, en minúsculas y con la puntuación como espacios', () => {
  assert.equal(searchKey('Las Mesas Hu.'), 'las mesas hu');
  assert.equal(searchKey('  Huracán '), 'huracan');
  assert.equal(searchKey('VICTORIA, REAL CLUB "B"'), 'victoria real club b');
  assert.equal(searchKey(null), '');
});

test('searchTeams: por nombre normalizado desde 2 letras; en liga, uno por nombre y categoría en la fase más alta; los torneos aparte', () => {
  const model = modelWith();
  // AD Huracán juega en A2 (Segunda Fase) y en FF9 (Primera): sale el de A2. En prebenjamín, PG2.
  const hurac = searchTeams(model, PORTAL_SEASON, 'hurac');
  assert.deepEqual(names(hurac.leagues), ['AD Huracán [A2]', 'AD Huracán [PG2]']);
  assert.deepEqual(hurac.leagues.map((e) => e.cat), ['benjamin', 'prebenjamin']);
  assert.deepEqual(names(hurac.cups), ['AD Huracán A [MCBK2]', 'AD Huracán B [MCBK2]', 'UD Las Mesas Huracán [MCB16]',
    'UD Las Mesas Huracán [MCBK2]', 'UD Las Mesas Huracán [MCP3]', 'UD Las Mesas Huracán [MCPK1]']);
  // Las Mesas Hu. en A2 y no en FF5; «Las Mesas Hu. B» y «Las Mesas B» son otros equipos.
  const mesas = ['Las Mesas B [B2]', 'Las Mesas Hu. [A2]', 'Las Mesas Hu. [PG2]', 'Las Mesas Hu. B [FF13]'];
  assert.deepEqual(names(searchTeams(model, PORTAL_SEASON, 'mesas').leagues), mesas);
  // Sin las siglas del club, como normalizeTeamName: «UD Las Mesas» también encuentra «Las Mesas Hu.».
  assert.deepEqual(names(searchTeams(model, PORTAL_SEASON, 'UD Las Mesas').leagues), mesas);
  assert.deepEqual(names(searchTeams(model, PORTAL_SEASON, 'Mesas Hu.').leagues), ['Las Mesas Hu. [A2]', 'Las Mesas Hu. [PG2]', 'Las Mesas Hu. B [FF13]']);
  // Santa Brígida en B1 y en B2, los dos de la Segunda Fase: dos equipos, y salen los dos.
  assert.deepEqual(names(searchTeams(model, PORTAL_SEASON, 'brigida').leagues), ['Santa Brígida [B1]', 'Santa Brígida [B2]', 'Santa Brígida [PG2]']);
  // Menos de 2 letras (sin contar la puntuación), nada; «UD» son 2 letras y busca en el nombre plegado.
  const found = (q) => { const r = searchTeams(model, PORTAL_SEASON, q); return [names(r.leagues), names(r.cups)]; };
  for (const q of ['', '  ', 'h', ' h.', '..', null, 'zzz']) assert.deepEqual(found(q), [[], []], String(q));
  assert.ok(found('ud')[0].includes('UD Vecindario [PG3]'));
});

test('searchTeams: la Copa de Campeones de la temporada va con los torneos; en el archivo, su temporada y nunca los torneos de 2025-26', () => {
  const model = modelWith({ champions: true, seasonRaw: ARCHIVE });
  const vecindario = searchTeams(model, PORTAL_SEASON, 'vecindario');
  assert.deepEqual(names(vecindario.leagues), ['UD Vecindario [PG3]']);
  assert.deepEqual(names(vecindario.cups), ['LA UNION DE VECINDARIO [BCA1]', 'LA UNION DE VECINDARIO [PCC1]', 'UD Vecindario A [MCBK2]', 'UD Vecindario B [MCBK2]']);
  // 2024-25: Las Mesas Hu. en A1 (Segunda Fase) y no en P3; L.Mesas Hu. B en P9.
  const past = searchTeams(model, '2024-2025', 'mesas');
  assert.deepEqual(names(past.leagues), ['L.Mesas Hu. B [P9]', 'Las Mesas B [C2]', 'Las Mesas Hu. [A1]', 'Las Mesas Hu. [PGC2]']);
  assert.deepEqual(past.cups, []);
  assert.deepEqual(names(searchTeams(model, '2024-2025', 'guayarmina').cups), ['Guayarmina [BCC1]']);
  const old = searchTeams(model, '2023-2024', 'hurac');
  assert.deepEqual([names(old.leagues), names(old.cups)], [['At. Huracán B [GC3]'], ['AD Huracán [BC1]']]);
  assert.deepEqual(names(searchTeams(model, '2023-2024', 'tarajalejo').cups), ['UD Tarajalejo [CFV1]'], 'una copa insular');
  // Una temporada sin cargar no da nada (el router la carga antes de pintar: decisión 2 de B3).
  assert.deepEqual(searchTeams(modelWith(), '2023-2024', 'mesas'), { leagues: [], cups: [] });
});

test('searchTeams, el orden: los que empiezan por la búsqueda, los que tienen una palabra que empieza por ella y el resto; dentro, por nombre (decisión 166)', () => {
  const la = searchTeams(modelWith({ champions: true }), PORTAL_SEASON, 'la');
  assert.deepEqual(names(la.leagues), [
    // Empiezan por «la»; a igual nombre, benjamín antes que prebenjamín.
    'La Garita [FF15]', 'La Garita [PG2]', 'Las Huesas [PG2]', 'Las Huesas B [FF15]', 'Las Mesas B [B2]', 'Las Mesas Hu. [A2]',
    'Las Mesas Hu. [PG2]', 'Las Mesas Hu. B [FF13]', 'Las Palmas [A2]', 'Las Torres [B2]',
    // Una palabra empieza por «la».
    'San Lázaro [B2]',
    // El resto: «la» dentro de una palabra.
    'Costa Ayala [FF5]', 'Estrella CF [PG3]', 'Inter/Pilar [B2]', 'San Nicolás [A1]', 'UD Atalaya [A1]', 'Villaverde [PFV2]',
  ]);
  assert.deepEqual(names(la.cups), [
    'La Garita B [BCC1]', 'LA UNION DE VECINDARIO [BCA1]', 'LA UNION DE VECINDARIO [PCC1]', 'Las Palmas [BCA1]', 'Las Torres [BCB1]',
    'CD Las Longueras A [MCBK2]', 'CEF Puertos Las Palmas [MCB16]', 'JOVERO-LAS ROSAS, C.D. "A" [BCB1]', 'UD Las Huesas [MCBK2]',
    'UD Las Mesas Huracán [MCB16]', 'UD Las Mesas Huracán [MCBK2]', 'UD Las Mesas Huracán [MCP3]', 'UD Las Mesas Huracán [MCPK1]',
    'CLARAVISION-ROQUE AMAGRO, C.D. [BCB1]', 'UD Atalaya [MCBK2]', 'VETERANOS DEL PILA, C.D. "B" [BCC1]', 'Veteranos del Pilar CF [MCBK2]',
  ]);
});

test('competitions: una entrada por categoría y clave, las ligas antes que las copas, con sus grupos y filtros de categoría e isla', () => {
  const model = modelWith({ champions: true, cupsExtra: true, seasonRaw: ARCHIVE });
  const list = (season, opts) => competitions(model, season, opts).map((c) => `${c.cat} ${c.kind} ${c.key} «${c.label}» ${c.groups.map((g) => g.id).join(',')}`);
  assert.deepEqual(list(PORTAL_SEASON), [
    'benjamin liga segunda-a «Segunda Fase A» A1,A2',
    'benjamin liga segunda-b «Segunda Fase B» B1,B2',
    'benjamin liga primera-fase «Primera Fase» FF5,FF9,FF13,FF15',
    'benjamin copa copa-campeones «Copa de Campeones» BCA1,BCB1,BCC1',
    'benjamin copa maspalomas «Maspalomas Cup 2026» MCBK2,MCBK1,MCB16',
    'prebenjamin liga grancanaria «Gran Canaria» PG2,PG3',
    'prebenjamin liga fuerteventura «Fuerteventura» PFV2',
    'prebenjamin copa copa-campeones «Copa de Campeones» PCC1',
    'prebenjamin copa maspalomas «Maspalomas Cup 2026» MCPK2,MCPK1,MCP3',
  ]);
  assert.deepEqual(list(PORTAL_SEASON, { cat: 'prebenjamin', island: 'grancanaria' }), [
    'prebenjamin liga grancanaria «Gran Canaria» PG2,PG3',
    'prebenjamin copa copa-campeones «Copa de Campeones» PCC1',
    'prebenjamin copa maspalomas «Maspalomas Cup 2026» MCPK2,MCPK1,MCP3',
  ]);
  assert.deepEqual(list(PORTAL_SEASON, { island: 'lanzarote' }), []);
  assert.deepEqual(list('2024-2025'), [
    'benjamin liga segunda-a «Segunda Fase A» A1',
    'benjamin liga segunda-c «Segunda Fase C» C2',
    'benjamin liga primera-fase «Primera Fase» P1,P3,P9',
    'benjamin copa copa-campeones «Copa de Campeones» BCC1',
    'prebenjamin liga grancanaria «Gran Canaria» PGC2',
  ]);
  assert.deepEqual(list('2023-2024'), [
    'benjamin liga segunda-fase «Segunda Fase» SF1,SF8',
    'benjamin liga primera-fase «Primera Fase» GC3,GC8',
    'benjamin copa copa-campeones «Copa de Campeones» BC1',
    'benjamin copa fuerteventura-copa «Copa Fuerteventura» CFV1',
  ]);
  assert.deepEqual(competitions(modelWith(), '2023-2024'), [], 'sin cargar');
});

test('competitions sobre las fases reales de las cinco temporadas (phases.json): cada grupo una vez, en el orden de la decisión 18', () => {
  const byCode = (a, b) => (a.id < b.id ? -1 : 1);
  const expected = {
    '2025-2026': ['segunda-a', 'segunda-b', 'segunda-c', 'fuerteventura-oro', 'fuerteventura-plata', 'fuerteventura-bronce',
      'primera-fase', 'lanzarote', 'fuerteventura-fase-1', 'copa-campeones', '|', 'grancanaria', 'lanzarote', 'fuerteventura', 'copa-campeones'],
    '2022-2023': ['preferente', 'primera', 'lanzarote-preferente', 'lanzarote-primera', 'fuerteventura',
      'fuerteventura-copa-delegacion', 'fuerteventura-copa', '|', 'grancanaria'],
  };
  for (const season of ['2025-2026', '2024-2025', '2023-2024', '2022-2023', '2021-2022']) {
    const phases = fixture('phases').filter((e) => e.season === season);
    // La fuente ordena por código (FB, FF1, FF10, FF2…): competitions no depende de ese orden.
    const raw = (cat) => phases.filter((e) => e.cat === cat).map((e) => ({ id: e.code, name: e.name, phase: e.phase, island: e.island, standings: [], jornadas: {} })).sort(byCode);
    const model = createModel({ benjamin: [], prebenjamin: [], history: {}, seasonRaw: { [season]: { name: season, benjamin: raw('benjamin'), prebenjamin: raw('prebenjamin') } } }, { portalSeason: '2099-2100' });
    const list = competitions(model, season);
    assert.deepEqual(list.flatMap((c) => c.groups.map((g) => g.id)).sort(), phases.map((e) => e.code).sort(), season);
    for (const cat of ['benjamin', 'prebenjamin']) {
      const mine = list.filter((c) => c.cat === cat);
      const kinds = mine.map((c) => c.kind);
      assert.deepEqual(kinds, [...kinds].sort((a, b) => (a === b ? 0 : a === 'liga' ? -1 : 1)), `${season} ${cat}: ligas antes que copas`);
      for (const kind of ['liga', 'copa']) {
        const levels = mine.filter((c) => c.kind === kind).map((c) => phaseLevel(c.groups[0]));
        assert.deepEqual(levels, [...levels].sort((a, b) => b - a), `${season} ${cat} ${kind}: la fase más alta primero`);
      }
      for (const c of mine) {
        const numbers = c.groups.map((g) => Number((g.name.match(/\d+/) || [0])[0]));
        assert.deepEqual(numbers, [...numbers].sort((a, b) => a - b), `${season} ${c.key}: «Grupo 2» antes que «Grupo 10»`);
      }
    }
    if (expected[season]) {
      assert.deepEqual([...list.filter((c) => c.cat === 'benjamin').map((c) => c.key), '|', ...list.filter((c) => c.cat === 'prebenjamin').map((c) => c.key)], expected[season], season);
    }
  }
});

test('groupSummary: nombre en su competición, equipos, ronda en curso, líder de liga o liguilla y campeón de cuadro', () => {
  const model = modelWith({ champions: true, cupsExtra: true, seasonRaw: ARCHIVE });
  const cups = model.cups();
  const find = (season, id) => (season ? model.group(season, id) : cups.groups.find((g) => g.id === id));
  const summary = (season, id) => groupSummary(find(season, id));
  assert.deepEqual(summary(PORTAL_SEASON, 'A1'), { label: 'Grupo 1', teams: 11, round: 'Jornada 22', leader: 'Unión Viera', champion: null });
  assert.deepEqual(summary(PORTAL_SEASON, 'PG2'), { label: 'Grupo 2', teams: 15, round: 'Jornada 30', leader: 'Unión Viera', champion: null });
  assert.deepEqual(summary(PORTAL_SEASON, 'PFV2'), { label: 'Grupo 2', teams: 7, round: 'Jornada 14', leader: 'CD 35600', champion: null });
  assert.deepEqual(summary(PORTAL_SEASON, 'BCA1'), { label: 'Fase A', teams: 8, round: 'Final', leader: null, champion: 'Las Palmas' });
  assert.deepEqual(summary(PORTAL_SEASON, 'PCC1'), { label: 'Eliminatorias', teams: 6, round: 'Final', leader: null, champion: 'LA UNION DE VECINDARIO' });
  // Los cuadros de la Maspalomas no traen clasificación: los equipos salen del calendario.
  assert.deepEqual(summary(null, 'MCBK1'), { label: 'Copa Plata', teams: 34, round: null, leader: null, champion: 'Gáldar CF' });
  assert.deepEqual(summary(null, 'MCBK2').champion, 'UD Vecindario A', 'la final, por penaltis (2–2, 3-4)');
  assert.deepEqual(summary(null, 'MCP3'), { label: 'Grupo C', teams: 4, round: 'Fase de Grupos', leader: 'Real Club Victoria', champion: null });
  // 2024-25 BCC1: la fuente lo llama «Grupo 1»; es la Fase C. Su final la gana Vecindario B.
  assert.deepEqual(summary('2024-2025', 'BCC1'), { label: 'Fase C', teams: 6, round: 'Final', leader: null, champion: 'LA UNION DE VECINDARIO "B"' });
  // 2023-24 BC1: una liguilla de la Copa de Campeones; su 1.º, sin «campeón» de cuadro.
  assert.deepEqual(summary('2023-2024', 'BC1'), { label: 'Grupo 1', teams: 8, round: 'Ronda 1', leader: 'Las Palmas', champion: null });
  // Sin nada jugado (2026/27 al empezar), no hay líder.
  const next = createModel(datasetsFor({ current: nextSeasonRaw({ prebenjamin: ['PG2'] }) }), { portalSeason: '2026-2027' });
  assert.equal(groupSummary(next.group('2026-2027', 'PG2')).leader, null);
});

// ── ui.js: buscador, selector de temporada y filas de enlace ─────────────

test('searchBox, seasonPicker y linkRow: el marcado, con todo escapado', () => {
  assert.equal(s(searchBox({ id: 'buscar', value: 'Las "Mesas" <b>', label: 'Buscar un equipo' })),
    '<form class="search" role="search"><label class="vh" for="buscar">Buscar un equipo</label><span class="search-icon" aria-hidden="true">'
    + '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="square" stroke-linejoin="miter" aria-hidden="true" focusable="false"><circle cx="10.5" cy="10.5" r="6"/><path d="M15 15l5 5"/></svg></span>'
    + '<input class="search-input" id="buscar" type="search" value="Las &quot;Mesas&quot; &lt;b&gt;" placeholder="Buscar un equipo" autocomplete="off" autocapitalize="off" spellcheck="false" enterkeyhint="search"></form>');
  const picker = s(seasonPicker([{ name: '2025-2026' }, { name: '2024-2025' }], '2024-2025', (name) => `#/explorar?s=${name}`, { id: 'temporada' }));
  assert.equal(picker, '<div class="season-picker"><button class="screen-action season-toggle" id="temporada" type="button" aria-expanded="false" aria-controls="temporada-lista">'
    + '<span class="vh">Temporada </span>2024/25<span class="season-caret" aria-hidden="true"></span></button>'
    + '<ul class="season-menu" id="temporada-lista" hidden><li><a class="season-option" href="#/explorar?s=2025-2026">2025/26</a></li>'
    + '<li><a class="season-option" href="#/explorar?s=2024-2025" aria-current="true">2024/25</a></li></ul></div>');
  assert.equal(s(linkRow('#/ligas?f=a&b', 'Copa <A>', { context: '4 grupos', detail: 'X & Y', cls: 'group-row' })),
    '<a class="link-row group-row" href="#/ligas?f=a&amp;b"><span class="link-row-main"><span class="link-row-title">Copa &lt;A&gt;</span><span class="link-row-detail">X &amp; Y</span></span><span class="link-row-context">4 grupos</span></a>');
  assert.equal(s(linkRow('#/ajustes', 'Ajustes')), '<a class="link-row" href="#/ajustes"><span class="link-row-main"><span class="link-row-title">Ajustes</span></span></a>');
});

// ── La pantalla ─────────────────────────────────────────────────────────

test('Explorar: su h1, el selector de temporada con SEASONS, el buscador vacío y las Ligas por categoría (maqueta 5-4)', () => {
  const out = render({}, {}, { seasonRaw: ARCHIVE });
  assert.match(out, /^<section data-screen="explorar"><header class="screen-head"><div class="screen-head-text"><h1>Explorar<\/h1><p class="screen-sub">Temporada 2025\/26<\/p><\/div><div class="season-picker">/);
  assert.equal((out.match(/<h1[ >]/g) || []).length, 1);
  assert.deepEqual(rows(out, 'season-option'), [['#/explorar?s=2025-2026', '2025/26'], ['#/explorar?s=2024-2025', '2024/25'], ['#/explorar?s=2023-2024', '2023/24']]);
  assert.match(out, /<a class="season-option" href="#\/explorar\?s=2025-2026" aria-current="true">/);
  assert.match(out, /<input class="search-input" id="buscar" type="search" value="" placeholder="Buscar un equipo"/);
  assert.match(out, /<\/form><p class="vh" role="status" id="buscar-estado"><\/p><div class="search-results" id="resultados" data-results><\/div>/);
  assert.equal(blockOf(out, 'Vistos hace poco'), '', 'sin fichas vistas, el bloque no sale');
  const ligas = blockOf(out, 'Ligas');
  assert.match(ligas, /<p class="block-context">11 grupos<\/p>/);
  assert.deepEqual([...ligas.matchAll(/<h3 class="link-head">([^<]+)<\/h3>/g)].map((m) => m[1]), ['Benjamín', 'Prebenjamín']);
  assert.deepEqual(rows(ligas, 'link-row'), [
    ['#/ligas?s=2025-2026&c=benjamin&f=segunda-a', 'Segunda Fase A 2 grupos'],
    ['#/ligas?s=2025-2026&c=benjamin&f=segunda-b', 'Segunda Fase B 2 grupos'],
    ['#/ligas?s=2025-2026&c=benjamin&f=primera-fase', 'Primera Fase 4 grupos'],
    ['#/ligas?s=2025-2026&c=prebenjamin&f=grancanaria', 'Gran Canaria 2 grupos'],
    ['#/ligas?s=2025-2026&c=prebenjamin&f=fuerteventura', 'Fuerteventura 1 grupo'],
  ]);
});

test('Copas y torneos: la Copa de Campeones con sus campeones y la Maspalomas Cup con su mes, sin categoría (decisión 19); y Más', () => {
  const out = render({}, { today: '2026-09-23' }, { champions: true, seasonRaw: ARCHIVE });
  assert.deepEqual(rows(blockOf(out, 'Copas y torneos'), 'link-row'), [
    ['#/ligas?s=2025-2026&f=copa-campeones', 'Copa de Campeones Las Palmas, Las Torres, La Garita B y LA UNION DE VECINDARIO 4 campeones'],
    ['#/ligas?s=2025-2026&f=maspalomas', 'Maspalomas Cup 2026 junio'],
  ]);
  assert.match(out, /<span class="link-row-title">Copa de Campeones<\/span><span class="link-row-detail">Las Palmas, Las Torres, La Garita B y LA UNION DE VECINDARIO<\/span><\/span><span class="link-row-context">4 campeones<\/span>/);
  // Sin la Copa de Campeones en los datos, solo el torneo.
  assert.deepEqual(rows(blockOf(render({}), 'Copas y torneos'), 'link-row'), [['#/ligas?s=2025-2026&f=maspalomas', 'Maspalomas Cup 2026 junio']]);
  // Más: la comprobación de data-health del 23/09 (22:11 en Canarias), «hoy» ese día.
  assert.deepEqual(rows(blockOf(out, 'Más'), 'link-row'), [
    ['#/temporadas', 'Temporadas anteriores desde 2023/24'],
    ['#/records?s=2025-2026', 'Récords y estadísticas'],
    ['#/goleadores?s=2025-2026', 'Goleadores'],
    ['#/fuentes', 'Datos y fuentes comprobado hoy'],
    ['#/ajustes', 'Ajustes mi equipo y datos'],
  ]);
  assert.match(blockOf(render({}), 'Más'), /Datos y fuentes<\/span><\/span><span class="link-row-context">comprobado el 23 sept<\/span>/, 'el 24/09, el día anterior');
  // Sin data-health (falló), la fila va sin fecha.
  const failed = ctxWith({});
  failed.health = null;
  assert.match(s(screen.render(failed)), /<span class="link-row-title">Datos y fuentes<\/span><\/span><\/a>/);
});

test('el buscador pinta la q de la dirección, la misma lista que al escribir (searchView): escudo, categoría y grupo, y ficha o copa', () => {
  const ctx = ctxWith({ q: 'hurac' });
  const out = s(screen.render(ctx));
  const view = searchView(ctx, 'hurac');
  assert.ok(out.includes(`<div class="search-results" id="resultados" data-results>${view.list}</div>`), 'render y mount pintan lo mismo');
  assert.ok(out.includes(`<p class="vh" role="status" id="buscar-estado">${view.status}</p>`));
  assert.equal(view.status, '8 equipos encontrados');
  assert.match(out, /<input class="search-input" id="buscar" type="search" value="hurac"/);
  assert.deepEqual(rows(blockOf(out, 'Resultados'), 'search-result'), [
    ['#/equipo?s=2025-2026&g=A2&t=AD%20Hurac%C3%A1n', 'AD Huracán Benjamín, Segunda Fase A, Grupo 2'],
    ['#/equipo?s=2025-2026&g=PG2&t=AD%20Hurac%C3%A1n', 'AD Huracán Prebenjamín, Grupo 2 de Gran Canaria'],
  ]);
  assert.match(blockOf(out, 'Resultados'), /<p class="block-context">2 equipos<\/p>/);
  assert.match(out, /<a class="search-result" href="#\/equipo\?s=2025-2026&amp;g=A2&amp;t=AD%20Hurac%C3%A1n"><img class="crest crest-32" src="\.\/escudos\/s\/huracan\.png"/);
  const cups = rows(blockOf(out, 'En copas y torneos'), 'search-result');
  assert.equal(cups.length, 6);
  assert.deepEqual(cups[2], ['#/copa?s=2025-2026&g=MCB16', 'UD Las Mesas Huracán Benjamín, Maspalomas Cup 2026, Grupo P']);
  assert.deepEqual(cups[5], ['#/copa?s=2025-2026&g=MCPK1', 'UD Las Mesas Huracán Prebenjamín, Maspalomas Cup 2026, Copa Plata']);
});

test('el buscador dice lo que pasa: con menos de 2 letras, sin resultados y con texto que hay que escapar', () => {
  const one = render({ q: 'h' });
  assert.match(one, /<div class="search-results" id="resultados" data-results><p class="notice">Escribe al menos 2 letras del nombre del equipo\.<\/p><\/div>/);
  const none = render({ q: 'zzz' });
  assert.match(none, /<p class="empty">No encontramos ningún equipo con «zzz» en la temporada 2025\/26\.<\/p>/);
  assert.match(none, /id="buscar-estado">No encontramos ningún equipo con «zzz» en la temporada 2025\/26\.<\/p>/);
  const odd = render({ q: '<img src=x>' });
  assert.match(odd, /value="&lt;img src=x&gt;"/);
  assert.match(odd, /con «&lt;img src=x&gt;» en la temporada/);
  assert.doesNotMatch(odd, /<img src=x>/);
  assert.deepEqual(searchView(ctxWith({}), '   '), { list: searchView(ctxWith({}), '').list, status: '' });
});

test('Vistos hace poco: la ficha de cada visto; un torneo abre su Copa; una temporada sin cargar, con su temporada y sin categoría', () => {
  const recent = [
    { s: PORTAL_SEASON, g: 'PG2', t: 'AD Huracán' },
    { s: PORTAL_SEASON, g: 'MCP3', t: 'UD Las Mesas Huracán' },
    { s: '2024-2025', g: 'PGC2', t: 'Las Mesas Hu.' },
    { s: '2023-2024', g: 'SF1', t: 'Las Mesas Hu.' },
  ];
  const out = render({}, { recent }, { seasonRaw: { '2024-2025': ARCHIVE['2024-2025'] } });
  const block = blockOf(out, 'Vistos hace poco');
  assert.deepEqual(rows(block, 'recent-chip'), [
    ['#/equipo?s=2025-2026&g=PG2&t=AD%20Hurac%C3%A1n', 'AD Huracán preb.'],
    ['#/copa?s=2025-2026&g=MCP3', 'UD Las Mesas Huracán preb.'],
    ['#/equipo?s=2024-2025&g=PGC2&t=Las%20Mesas%20Hu.', 'Las Mesas Hu. preb. · 2024/25'],
    ['#/equipo?s=2023-2024&g=SF1&t=Las%20Mesas%20Hu.', 'Las Mesas Hu. 2023/24'],
  ]);
  assert.match(block, /<span class="recent-name">AD Huracán<\/span><span class="recent-meta"><abbr title="Prebenjamín">preb\.<\/abbr><\/span>/);
  assert.match(block, /<img class="crest crest-16" src="\.\/escudos\/s\/huracan\.png"/);
});

test('otra temporada (2024/25): su selector, sus ligas y copas, su buscador y Más con su temporada; sin cargar, la caja de error', () => {
  const out = render({ s: '2024-2025', q: 'mesas' }, {}, { seasonRaw: ARCHIVE });
  assert.match(out, /<p class="screen-sub">Temporada 2024\/25<\/p>/);
  assert.match(out, /<span class="vh">Temporada <\/span>2024\/25<span class="season-caret"/);
  assert.match(out, /<a class="season-option" href="#\/explorar\?s=2024-2025" aria-current="true">/);
  assert.deepEqual(rows(blockOf(out, 'Resultados'), 'search-result').map(([href]) => href), [
    '#/equipo?s=2024-2025&g=P9&t=L.Mesas%20Hu.%20B', '#/equipo?s=2024-2025&g=C2&t=Las%20Mesas%20B',
    '#/equipo?s=2024-2025&g=A1&t=Las%20Mesas%20Hu.', '#/equipo?s=2024-2025&g=PGC2&t=Las%20Mesas%20Hu.']);
  assert.equal(blockOf(out, 'En copas y torneos'), '');
  assert.deepEqual(rows(blockOf(out, 'Ligas'), 'link-row').map(([href]) => href), [
    '#/ligas?s=2024-2025&c=benjamin&f=segunda-a', '#/ligas?s=2024-2025&c=benjamin&f=segunda-c',
    '#/ligas?s=2024-2025&c=benjamin&f=primera-fase', '#/ligas?s=2024-2025&c=prebenjamin&f=grancanaria']);
  assert.deepEqual(rows(blockOf(out, 'Copas y torneos'), 'link-row'), [['#/ligas?s=2024-2025&f=copa-campeones', 'Copa de Campeones LA UNION DE VECINDARIO "B" 1 campeón']]);
  assert.match(blockOf(out, 'Más'), /href="#\/records\?s=2024-2025".*href="#\/goleadores\?s=2024-2025"/);
  // 2023/24: la Copa Fuerteventura (insular), con sus grupos; la Copa de Campeones en liguilla, sin campeón de cuadro.
  assert.deepEqual(rows(blockOf(render({ s: '2023-2024' }, {}, { seasonRaw: ARCHIVE }), 'Copas y torneos'), 'link-row'), [
    ['#/ligas?s=2023-2024&f=copa-campeones', 'Copa de Campeones 1 grupo'],
    ['#/ligas?s=2023-2024&f=fuerteventura-copa', 'Copa Fuerteventura 1 grupo'],
  ]);
  // Sin la temporada (el router la carga antes: decisión 2), nunca otra: la caja de error con «Reintentar».
  const failed = render({ s: '2023-2024' });
  assert.match(failed, /<h1>Explorar<\/h1>/);
  assert.match(text(failed), /No se pudieron cargar los datos de la temporada 2023\/24\./);
  assert.match(failed, /data-action="retry"/);
  assert.doesNotMatch(failed, /id="buscar"/);
});

test('needs: data-health.json una vez por sesión y sin rechazar nunca; nada si ya está (o si falló)', async (t) => {
  assert.deepEqual(screen.needs({}, { health: fixture('health') }), []);
  assert.deepEqual(screen.needs({}, { health: null }), [], 'falló: no se espera otra vez');
  t.mock.method(globalThis, 'fetch', async () => ({ ok: true, status: 200, text: async () => JSON.stringify(fixture('health')) }));
  const datasets = { health: undefined };
  const loads = screen.needs({ s: '2024-2025' }, datasets);
  assert.equal(loads.length, 1, 'solo data-health: la temporada de la ruta la carga el router');
  await Promise.all(loads);
  assert.equal(datasets.health.checkedAt, '2026-09-23T21:11:50+00:00');
});

test('mount con el router: escribir filtra la lista y apunta la búsqueda con replaceState, sin volver a pintar; Atrás no recorre cada letra', async () => {
  const datasets = datasetsFor();
  const b = fakeBrowser('#/');
  const router = startRouter({ screens: { ...SCREEN_MAP }, root: b.root, getContext: () => ctxFor('', {}, { datasets }), window: b.win });
  await router.idle();
  b.click({ href: '#/explorar#buscar' });
  await router.idle();
  assert.deepEqual(b.marks(), [['#/explorar', 'page']], 'un destino principal: Explorar marcado con aria-current="page"');
  assert.equal(b.doc.title, 'Explorar · Fútbol Base Las Palmas');
  const input = b.doc.getElementById('buscar');
  assert.equal(input.focused, 1, 'el ancla #buscar: el router enfoca el buscador (mount no lo hace)');
  const painted = b.root.innerHTML;
  const results = b.root.querySelector('#resultados');
  const status = b.root.querySelector('#buscar-estado');
  const type = (value) => { input.value = value; for (const fn of input.listeners.input || []) fn({ target: input }); };
  for (const value of ['h', 'hu', 'hur', 'hurac']) type(value);
  assert.equal(b.root.innerHTML, painted, 'la pantalla no se vuelve a pintar: el cursor sigue donde estaba');
  assert.equal(results.innerHTML, String(searchView(ctxWith({}), 'hurac').list));
  assert.equal(status.textContent, '8 equipos encontrados');
  assert.deepEqual(b.entries(), ['#/', '#/explorar?s=2025-2026&q=hurac#buscar'], 'una sola entrada, con su ancla');
  assert.deepEqual(router.current(), { screen: 'explorar', params: { s: PORTAL_SEASON, q: 'hurac' } });
  // Borrar la búsqueda la quita de la dirección.
  type('   ');
  assert.equal(results.innerHTML, '');
  assert.deepEqual(b.entries(), ['#/', '#/explorar?s=2025-2026#buscar']);
  type('mesas');
  // Otra pantalla es una entrada nueva (aquí, la Tabla de PG2; una ficha de los resultados, igual), y
  // Atrás vuelve a la búsqueda, pintada desde la dirección.
  b.click({ href: '#/tabla?s=2025-2026&g=PG2' });
  await router.idle();
  assert.deepEqual(b.entries(), ['#/', '#/explorar?s=2025-2026&q=mesas#buscar', '#/tabla?s=2025-2026&g=PG2']);
  b.win.history.back();
  await new Promise((resolve) => setTimeout(resolve, 0));
  await router.idle();
  assert.equal(b.hash(), '#/explorar?s=2025-2026&q=mesas#buscar');
  assert.ok(b.root.innerHTML.includes(String(searchView(ctxWith({}), 'mesas').list)), 'la q de la dirección, pintada por render');
  b.win.history.back();
  await new Promise((resolve) => setTimeout(resolve, 0));
  await router.idle();
  assert.equal(b.hash(), '#/', 'y Atrás otra vez, la portada: sin pasar por cada letra');
});

test('mount: el botón de la temporada abre y cierra su lista (aria-expanded); Escape la cierra y devuelve el foco', async () => {
  const datasets = datasetsFor({ seasonRaw: ARCHIVE });
  const b = fakeBrowser('#/explorar');
  const router = startRouter({ screens: { ...SCREEN_MAP }, root: b.root, getContext: () => ctxFor('', {}, { datasets }), window: b.win });
  await router.idle();
  const toggle = b.root.querySelector('#temporada');
  const menu = b.root.querySelector('#temporada-lista');
  const fire = (el, type, event = {}) => { for (const fn of el.listeners[type] || []) fn({ target: el, ...event }); };
  fire(toggle, 'click');
  assert.deepEqual([toggle.getAttribute('aria-expanded'), menu.hidden], ['true', false]);
  fire(toggle, 'click');
  assert.deepEqual([toggle.getAttribute('aria-expanded'), menu.hidden], ['false', true]);
  fire(toggle, 'click');
  fire(menu, 'keydown', { key: 'Escape' });
  assert.deepEqual([toggle.getAttribute('aria-expanded'), menu.hidden, toggle.focused], ['false', true, 1]);
  // Una temporada de la lista es una navegación (push) y el router carga la temporada (decisión 2).
  b.click({ href: '#/explorar?s=2024-2025' });
  await router.idle();
  assert.deepEqual(b.entries(), ['#/explorar', '#/explorar?s=2024-2025']);
  assert.match(b.root.innerHTML, /<p class="screen-sub">Temporada 2024\/25<\/p>/);
});

test('registro: Explorar es la pantalla de #/explorar; y el CSS: solo clases que existen, 44 px y un campo de 16 px o más', () => {
  assert.equal(SCREEN_MAP.explorar, screen);
  const rules = cssRules();
  const decl = (sel) => rules.filter((r) => r.media === null && r.selector.split(/\s*,\s*/).includes(sel)).map((r) => r.body).join(';');
  for (const sel of ['.search-result', '.recent-chip', '.link-row', '.season-option', '.screen-action']) assert.match(decl(sel), /min-height:\s*(4[4-9]|5\d)px/, sel);
  assert.ok(Number(decl('.search-input').match(/font-size:\s*(\d+)px/)[1]) >= 16, 'iOS no amplía la página al enfocar el buscador');
  assert.doesNotMatch(decl('.season-menu'), /display:/, 'el atributo hidden cierra la lista');
  const recent = [{ s: PORTAL_SEASON, g: 'PG2', t: 'AD Huracán' }, { s: '2023-2024', g: 'SF1', t: 'X' }];
  const html = [render({ q: 'hurac' }, { recent }, { champions: true }), render({ q: 'h' }), render({ q: 'zzz' })].join('');
  const used = new Set(html.match(/class="[^"]+"/g).flatMap((m) => m.slice(7, -1).split(/\s+/)));
  assert.deepEqual([...used].filter((c) => !rules.classes.has(c)), []);
});
