/**
 * Rediseño «Acta», Tarea 4: competitionKey y groupLabel (spec §5.3, §4.7).
 * Run: node --test scripts/tests/test_rediseno_model_competicion.mjs
 *
 * phases.json trae todas las fases reales de la base (2021-22 a 2025-26).
 * Solo fixtures congeladas; nunca los data-*.js ni src/config.js vivos.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fixture } from './fixtures/rediseno/load.mjs';
import { competitionKey, groupLabel, buildSeason, buildCups } from '../../src/model.js';

const KEY_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
let phasesCache = null;
const phases = () => (phasesCache ??= fixture('phases'));
const catOf = e => String(e.cat).toLowerCase();
const rawOf = e => ({ id: e.code, phase: e.phase, island: e.island, cat: catOf(e), name: e.name });

/* Grupo real de la base, comprobado contra phases.json (con su nombre)
 * antes de usarlo. */
function real(season, cat, id, phase, island, name) {
  const found = phases().some(e => e.season === season && catOf(e) === cat && e.code === id
    && e.phase === phase && e.island === island && e.name === name);
  assert.ok(found, `${season} ${cat} ${id} «${phase}» no está en phases.json`);
  return { season, cat, id, phase, island, name };
}

// ── Tabla de equivalencias sobre todas las fases reales ────────────────────

test('phases.json: ninguna fase existente queda sin clasificar', () => {
  const all = phases();
  assert.deepEqual([...new Set(all.map(e => e.season))].sort(),
    ['2021-2022', '2022-2023', '2023-2024', '2024-2025', '2025-2026']);
  assert.ok(new Set(all.map(e => `${e.season}|${catOf(e)}|${e.phase}`)).size >= 56, 'phases.json debe traer todas las fases');
  const sinClasificar = all.filter(e => competitionKey(rawOf(e), e.season).division === null)
    .map(e => `${e.season} ${e.cat} ${e.code} «${e.phase}»`);
  assert.deepEqual(sinClasificar, []);
  for (const e of all) {
    const ck = competitionKey(rawOf(e), e.season);
    assert.equal(ck.cat, catOf(e), e.code);
    assert.equal(ck.island, e.island, e.code);
    assert.ok(['preferente', 'primera', 'unica'].includes(ck.division), `${e.code}: ${ck.division}`);
    assert.ok([null, 'primera-fase', 'segunda-fase', 'segunda-a', 'segunda-b', 'segunda-c', 'segunda-d', 'segunda-e',
      'fase-1', 'fase-2', 'oro', 'plata', 'bronce'].includes(ck.phase), `${e.code}: ${ck.phase}`);
    assert.ok([null, 'campeones', 'insular', 'maspalomas'].includes(ck.cup), `${e.code}: ${ck.cup}`);
    assert.match(ck.key, KEY_RE, e.code);
    assert.ok(ck.label, e.code);
  }
});

test('phases.json: cada fase es una competición; solo se funden las Copa Campeones Benjamin A…E de 2024-25', () => {
  const byKey = new Map();
  for (const e of phases()) {
    // Sin el nombre del grupo: la clave depende solo de la tabla de fases.
    const { key } = competitionKey({ id: e.code, phase: e.phase, island: e.island, cat: catOf(e) }, e.season);
    const k = `${e.season}|${catOf(e)}|${key}`;
    if (!byKey.has(k)) byKey.set(k, new Set());
    byKey.get(k).add(e.phase);
  }
  const fundidas = [...byKey].filter(([, ps]) => ps.size > 1).map(([k, ps]) => [k, [...ps].sort()]);
  assert.deepEqual(fundidas, [['2024-2025|benjamin|copa-campeones', [
    'Copa Campeones Benjamin A', 'Copa Campeones Benjamin B', 'Copa Campeones Benjamin C',
    'Copa Campeones Benjamin D', 'Copa Campeones Benjamin E']]]);
});

test('phases.json: etiqueta de grupo única en cada temporada', () => {
  const seen = new Map();
  for (const e of phases()) {
    assert.ok(typeof e.name === 'string' && e.name, `${e.season} ${e.code}: phases.json sin name`);
    const label = groupLabel({ ...rawOf(e), season: e.season });
    const k = `${e.season}|${label}`;
    assert.ok(!seen.has(k), `${k}: ${seen.get(k)} y ${e.code}`);
    seen.set(k, e.code);
  }
});

// ── Ejemplos fijados con grupos de las fixtures ────────────────────────────

test('PG2 2025-26 y A2 2025-26: los dos ejemplos de la spec', () => {
  const f = fixture('current-2025-2026');
  const pg2 = f.prebenjamin.find(g => g.id === 'PG2');
  const a2 = f.benjamin.find(g => g.id === 'A2');
  assert.equal(groupLabel({ ...pg2, cat: 'prebenjamin', season: f.season }), 'Prebenjamín, Grupo 2 de Gran Canaria');
  assert.equal(groupLabel({ ...a2, cat: 'benjamin', season: f.season }), 'Benjamín, Segunda Fase A, Grupo 2');
  assert.deepEqual(competitionKey({ ...pg2, cat: 'prebenjamin' }, f.season), {
    cat: 'prebenjamin', island: 'grancanaria', division: 'unica', phase: null, cup: null,
    key: 'grancanaria', label: 'Gran Canaria',
  });
  assert.deepEqual(competitionKey({ ...a2, cat: 'benjamin' }, f.season), {
    cat: 'benjamin', island: 'grancanaria', division: 'unica', phase: 'segunda-a', cup: null,
    key: 'segunda-a', label: 'Segunda Fase A',
  });
  // Sin cat explícita (grupo crudo de data-*.js), la categoría sale de fullName
  assert.equal(competitionKey(pg2, f.season).cat, 'prebenjamin');
  assert.equal(competitionKey(a2, f.season).cat, 'benjamin');
});

test('buildSeason y buildCups rellenan compKey y label de cada grupo', () => {
  const f = fixture('current-2025-2026');
  const s = buildSeason({ name: f.season, current: true, benjamin: f.benjamin, prebenjamin: f.prebenjamin, history: f.history });
  const byId = groups => Object.fromEntries(groups.map(g => [g.id, [g.compKey, g.label]]));
  assert.deepEqual(byId(s.groups), {
    A1: ['segunda-a', 'Benjamín, Segunda Fase A, Grupo 1'],
    A2: ['segunda-a', 'Benjamín, Segunda Fase A, Grupo 2'],
    B1: ['segunda-b', 'Benjamín, Segunda Fase B, Grupo 1'],
    B2: ['segunda-b', 'Benjamín, Segunda Fase B, Grupo 2'],
    FF5: ['primera-fase', 'Benjamín, Primera Fase, Grupo 5'],
    FF9: ['primera-fase', 'Benjamín, Primera Fase, Grupo 9'],
    FF13: ['primera-fase', 'Benjamín, Primera Fase, Grupo 13'],
    FF15: ['primera-fase', 'Benjamín, Primera Fase, Grupo 15'],
    PG2: ['grancanaria', 'Prebenjamín, Grupo 2 de Gran Canaria'],
    PG3: ['grancanaria', 'Prebenjamín, Grupo 3 de Gran Canaria'],
    PFV2: ['fuerteventura', 'Prebenjamín, Grupo 2 de Fuerteventura'],
  });
  const h = fixture('historical-2024-2025');
  const hs = buildSeason({ name: h.season, current: false, benjamin: h.benjamin, prebenjamin: h.prebenjamin });
  assert.deepEqual(byId(hs.groups), {
    P1: ['primera-fase', 'Benjamín, Primera Fase, Grupo 1'],
    PGC2: ['grancanaria', 'Prebenjamín, Grupo 2 de Gran Canaria'],
  });
  const c = fixture('cups-2025-2026');
  const cups = buildCups({ season: '2025-2026', benjamin: c.benjamin, prebenjamin: c.prebenjamin });
  assert.deepEqual(byId(cups.groups), {
    MCB16: ['maspalomas', 'Benjamín, Maspalomas Cup 2026, Grupo P'],
    MCBK2: ['maspalomas', 'Benjamín, Maspalomas Cup 2026, Copa Oro'],
    MCP3: ['maspalomas', 'Prebenjamín, Maspalomas Cup 2026, Grupo C'],
    MCPK1: ['maspalomas', 'Prebenjamín, Maspalomas Cup 2026, Copa Plata'],
  });
  assert.deepEqual(competitionKey(c.prebenjamin.find(g => g.id === 'MCP3'), '2025-2026'), {
    cat: 'prebenjamin', island: 'grancanaria', division: 'unica', phase: null, cup: 'maspalomas',
    key: 'maspalomas', label: 'Maspalomas Cup 2026',
  });
});

// ── Ejemplos fijados con grupos reales de phases.json ──────────────────────

const label = g => groupLabel(g);
const ck = g => competitionKey(g, g.season);

test('Lanzarote: Preferente, Primera, liga de la isla y Copa Cabildo', () => {
  const lzp1 = real('2024-2025', 'benjamin', 'LZP1', 'Preferente Lanzarote', 'lanzarote', 'Grupo 1');
  assert.equal(label(lzp1), 'Benjamín, Preferente, Grupo 1 de Lanzarote');
  assert.deepEqual(ck(lzp1), { cat: 'benjamin', island: 'lanzarote', division: 'preferente', phase: null, cup: null,
    key: 'lanzarote-preferente', label: 'Preferente de Lanzarote' });
  const lz12 = real('2024-2025', 'benjamin', 'LZ12', 'Primera Lanzarote', 'lanzarote', 'Grupo 2');
  assert.equal(label(lz12), 'Benjamín, Primera, Grupo 2 de Lanzarote');
  assert.equal(ck(lz12).key, 'lanzarote-primera');
  const lz1 = real('2025-2026', 'benjamin', 'LZ1', 'Lanzarote', 'lanzarote', 'Grupo 1');
  assert.equal(label(lz1), 'Benjamín, Grupo 1 de Lanzarote');
  assert.equal(ck(lz1).key, 'lanzarote');
  const plz2 = real('2025-2026', 'prebenjamin', 'PLZ2', 'Lanzarote', 'lanzarote', 'Grupo 2');
  assert.equal(label(plz2), 'Prebenjamín, Grupo 2 de Lanzarote');
  const clzp1 = real('2023-2024', 'benjamin', 'CLZP1', 'Copa Cabildo Preferente Lanzarote', 'lanzarote', 'Grupo 1');
  assert.equal(label(clzp1), 'Benjamín, Copa Cabildo Preferente, Grupo 1 de Lanzarote');
  assert.deepEqual(ck(clzp1), { cat: 'benjamin', island: 'lanzarote', division: 'preferente', phase: null, cup: 'insular',
    key: 'lanzarote-preferente-copa-cabildo', label: 'Copa Cabildo Preferente de Lanzarote' });
});

test('Fuerteventura: fases, ligas Oro/Plata/Bronce por nombre y copas insulares', () => {
  const fv11 = real('2025-2026', 'benjamin', 'FV11', 'Fuerteventura Fase 1', 'fuerteventura', 'Grupo 1');
  assert.equal(label(fv11), 'Benjamín, Fase 1, Grupo 1 de Fuerteventura');
  assert.deepEqual(ck(fv11), { cat: 'benjamin', island: 'fuerteventura', division: 'unica', phase: 'fase-1', cup: null,
    key: 'fuerteventura-fase-1', label: 'Fase 1 de Fuerteventura' });
  const fv21 = real('2024-2025', 'benjamin', 'FV21', 'Fase 2 Fuerteventura', 'fuerteventura', 'Grupo 1');
  assert.equal(ck(fv21).phase, 'fase-2');
  const fo = real('2025-2026', 'benjamin', 'FO', 'Fuerteventura', 'fuerteventura', 'Liga Oro');
  assert.equal(label(fo), 'Benjamín, Liga Oro de Fuerteventura');
  assert.deepEqual(ck(fo), { cat: 'benjamin', island: 'fuerteventura', division: 'unica', phase: 'oro', cup: null,
    key: 'fuerteventura-oro', label: 'Liga Oro de Fuerteventura' });
  const fb = real('2025-2026', 'benjamin', 'FB', 'Fuerteventura', 'fuerteventura', 'Liga Bronce');
  assert.equal(ck(fb).key, 'fuerteventura-bronce');
  const cfv1 = real('2022-2023', 'benjamin', 'CFV1', 'Copa Fuerteventura', 'fuerteventura', 'Grupo 1');
  assert.equal(label(cfv1), 'Benjamín, Copa Fuerteventura, Grupo 1');
  assert.equal(ck(cfv1).key, 'fuerteventura-copa');
  const cfvd1 = real('2022-2023', 'benjamin', 'CFVD1', 'Copa Delegación Fuerteventura', 'fuerteventura', 'Grupo 1');
  assert.equal(label(cfvd1), 'Benjamín, Copa Delegación, Grupo 1 de Fuerteventura');
  assert.equal(ck(cfvd1).key, 'fuerteventura-copa-delegacion');
  const fv12 = real('2022-2023', 'benjamin', 'FV12', 'Fuerteventura', 'fuerteventura', 'Grupo 2');
  assert.equal(label(fv12), 'Benjamín, Grupo 2 de Fuerteventura');
  assert.equal(ck(fv12).key, 'fuerteventura');
});

test('Copa de Campeones: una competición en todas las temporadas, con sus fases A…E', () => {
  const a2526 = real('2025-2026', 'benjamin', 'BCA1', 'Copa de Campeones', 'grancanaria', 'Fase A');
  const a2425 = real('2024-2025', 'benjamin', 'BCA1', 'Copa Campeones Benjamin A', 'grancanaria', 'Grupo 1');
  const e2425 = real('2024-2025', 'benjamin', 'BCE1', 'Copa Campeones Benjamin E', 'grancanaria', 'Grupo 1');
  assert.equal(label(a2526), 'Benjamín, Copa de Campeones, Fase A');
  assert.equal(label(a2425), 'Benjamín, Copa de Campeones, Fase A');
  assert.equal(label(e2425), 'Benjamín, Copa de Campeones, Fase E');
  for (const g of [a2526, a2425, e2425]) {
    assert.deepEqual(ck(g), { cat: 'benjamin', island: 'grancanaria', division: 'unica', phase: null, cup: 'campeones',
      key: 'copa-campeones', label: 'Copa de Campeones' });
  }
  const pcc1 = real('2025-2026', 'prebenjamin', 'PCC1', 'Copa de Campeones', 'grancanaria', 'Eliminatorias');
  assert.equal(label(pcc1), 'Prebenjamín, Copa de Campeones, Eliminatorias');
  const bc2 = real('2023-2024', 'benjamin', 'BC2', 'Copa de Campeones', 'grancanaria', 'Grupo 2');
  assert.equal(label(bc2), 'Benjamín, Copa de Campeones, Grupo 2');
});

test('Preferente y Primera Fase GC: la misma fase significa cosas distintas según temporada y categoría', () => {
  const bpgc1 = real('2021-2022', 'benjamin', 'BPGC1', 'Preferente GC', 'grancanaria', 'Grupo 1');
  assert.equal(label(bpgc1), 'Benjamín, Preferente, Grupo 1');
  assert.deepEqual(ck(bpgc1), { cat: 'benjamin', island: 'grancanaria', division: 'preferente', phase: null, cup: null,
    key: 'preferente', label: 'Preferente' });
  // Benjamín 2021-22: «Primera Fase GC» es la división Primera, bajo Preferente GC
  const gc3 = real('2021-2022', 'benjamin', 'GC3', 'Primera Fase GC', 'grancanaria', 'Grupo 3');
  assert.equal(label(gc3), 'Benjamín, Primera, Grupo 3');
  assert.deepEqual(ck(gc3), { cat: 'benjamin', island: 'grancanaria', division: 'primera', phase: null, cup: null,
    key: 'primera', label: 'Primera' });
  // Benjamín desde 2023-24: la primera fase, antes de la Segunda Fase
  const p1 = real('2024-2025', 'benjamin', 'P1', 'Primera Fase GC', 'grancanaria', 'Grupo 1');
  assert.equal(label(p1), 'Benjamín, Primera Fase, Grupo 1');
  assert.equal(ck(p1).key, 'primera-fase');
  const sf14 = real('2023-2024', 'benjamin', 'SF14', 'Segunda Fase GC', 'grancanaria', 'Grupo 14');
  assert.equal(label(sf14), 'Benjamín, Segunda Fase, Grupo 14');
  assert.equal(ck(sf14).key, 'segunda-fase');
  // Prebenjamín: «Primera Fase GC» (hasta 2023-24) es la misma liga que «Gran Canaria»
  const pgc1 = real('2023-2024', 'prebenjamin', 'PGC1', 'Primera Fase GC', 'grancanaria', 'Grupo 1');
  assert.equal(label(pgc1), 'Prebenjamín, Grupo 1 de Gran Canaria');
  assert.equal(ck(pgc1).key, 'grancanaria');
});

test('Fase desconocida: sin clasificar (division null), pero con clave y etiqueta usables', () => {
  const nueva = { season: '2026-2027', cat: 'prebenjamin', id: 'TC1', phase: 'Torneo Cierre', island: 'grancanaria', name: 'Grupo 1' };
  assert.deepEqual(ck(nueva), { cat: 'prebenjamin', island: 'grancanaria', division: null, phase: null, cup: null,
    key: 'otra-torneo-cierre', label: 'Torneo Cierre' });
  assert.equal(label(nueva), 'Prebenjamín, Torneo Cierre, Grupo 1');
  assert.equal(ck({ ...nueva, island: 'lanzarote' }).key, 'lanzarote-otra-torneo-cierre');
});
