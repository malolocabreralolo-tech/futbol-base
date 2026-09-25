// Congela los datos reales que añade el Plan B3 a las fixtures del rediseño «Acta» (decisión 30).
//
// Se ejecuta UNA vez, desde la raíz del repo y con 2025-26 como temporada actual:
//   node scripts/tests/fixtures/rediseno/build_fixtures_b3.mjs
// Escribe solo los 6 JSON nuevos de B3 y se commitean. Nunca toca los 9 de build_fixtures.mjs
// (B1): volver a ejecutar aquel los reescribiría con los datos del día, y las pruebas fijan los
// del 23/09/2026 (health.json cambia a diario). Las pruebas leen solo los JSON (load.mjs).
//
// Lee los data-*.js con node:vm, como build_fixtures.mjs. Aquel no exporta sus ayudantes y, al
// importarse, se ejecutaría entero y reescribiría sus 9 JSON: por eso loadDataGlobals y subset se
// repiten aquí, y su pick pasa a ser inSourceOrder, que respeta el orden de la fuente. Lee además
// tres JSON de B1 para contrastar (historical-2024-2025, lineups-2025-2026 y phases). Solo escribe
// en esta carpeta.
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..', '..', '..', '..');

const SEASON = '2025-2026';
// Los grupos de current-2025-2026.json (B1): sus goleadores (PFV2 no los publica).
const CURRENT = { benjamin: ['A1', 'A2', 'B1', 'B2', 'FF5', 'FF9', 'FF13', 'FF15'], prebenjamin: ['PG2', 'PG3', 'PFV2'] };
// Copa de Campeones 2025-26: los grupos de data-benjamin.js y data-prebenjamin.js y su HISTORY.
const CHAMPIONS = { benjamin: ['BCA1', 'BCB1', 'BCC1'], prebenjamin: ['PCC1'] };
// Archivo: grupos con Las Mesas (trayectoria), liguillas y copas (Copa) y Récords pasados.
const ARCHIVE = {
  'historical-2023-2024': { name: '2023-2024', global: 'SEASON_2023_2024',
    benjamin: ['SF1', 'SF8', 'GC3', 'GC8', 'BC1', 'CFV1'], prebenjamin: [] },
  'historical-2024-2025-b3': { name: '2024-2025', global: 'SEASON_2024_2025',
    benjamin: ['A1', 'P3', 'C2', 'P9', 'BCC1'], prebenjamin: [] },
};
// Actas de la Primera Fase: Guayarmina y San Nicolás también las tienen en A1 (el filtro por (s, gr)).
const LINEUP_GROUP = 'FF1';
// Las dos copas de la Maspalomas que no trae cups-2025-2026.json.
const CUPS_EXTRA = { benjamin: ['MCBK1'], prebenjamin: ['MCPK2'] };
// Los únicos ficheros que escribe; los 9 de B1 quedan fuera por construcción.
const OUTPUTS = ['gol-2025-2026', 'campeones-2025-2026', 'historical-2023-2024', 'historical-2024-2025-b3',
  'lineups-2025-2026-ff1', 'cups-extra-2025-2026'];

function fail(message) {
  throw new Error(`build_fixtures_b3: ${message}`);
}

// Los data-*.js declaran `const X=…` de nivel superior; con `var` quedan como propiedades del
// contexto de node:vm (lo mismo que build_fixtures.mjs).
function loadDataGlobals(files) {
  const ctx = vm.createContext({});
  for (const file of files) {
    const src = readFileSync(join(ROOT, file), 'utf8');
    vm.runInContext(src.replace(/^const /gm, 'var '), ctx, { filename: file });
  }
  return ctx;
}

// Los grupos pedidos, en el orden de la fuente (no en el de la lista), y un error si falta alguno.
function inSourceOrder(groups, ids, where) {
  for (const id of ids) if (!groups.some(g => g.id === id)) fail(`falta el grupo ${id} en ${where}`);
  return groups.filter(g => ids.includes(g.id));
}

function subset(object, keep) {
  const out = {};
  for (const [key, value] of Object.entries(object)) if (keep(key, value)) out[key] = value;
  return out;
}

const readFixture = name => JSON.parse(readFileSync(join(HERE, `${name}.json`), 'utf8'));
const entriesOf = value => (value && value.dup ? value.list : [value]);
const matchKey = row => `${row[1]}|${row[2]}|${row[3]}-${row[4]}`;
const sortedById = groups => groups.every((g, i) => i === 0 || groups[i - 1].id < g.id);
const list = ids => (ids.length > 1 ? `${ids.slice(0, -1).join(', ')} y ${ids.at(-1)}` : ids.join(''));

function write(name, value, detail) {
  if (!OUTPUTS.includes(name)) fail(`${name}.json no es una fixture de B3`);
  writeFileSync(join(HERE, `${name}.json`), JSON.stringify(value) + '\n');
  console.log(`${name}.json: ${detail}`);
}

const D = loadDataGlobals([
  'data-seasons.js', 'data-benjamin.js', 'data-prebenjamin.js', 'data-history.js', 'data-goleadores.js',
  'data-season-2023-2024.js', 'data-season-2024-2025.js', 'data-lineups-2025-2026.js', 'data-maspalomas-cup-2026.js',
]);
const actual = D.SEASONS.find(s => s.current)?.name;
if (actual !== SEASON) {
  fail(`la temporada actual de data-seasons.js es ${actual}, no ${SEASON}: ` +
    'genera las fixtures desde un commit anterior a la activación de 2026/27');
}

// 1. Goleadores de los grupos de las fixtures, con la forma de GOL_BENJ y GOL_PREBENJ.
const gol = { season: SEASON, benjamin: [], prebenjamin: [] };
for (const [cat, source] of [['benjamin', D.GOL_BENJ], ['prebenjamin', D.GOL_PREBENJ]]) {
  gol[cat] = source.filter(entry => CURRENT[cat].includes(entry.id));
}
const golIds = [...gol.benjamin, ...gol.prebenjamin].map(e => e.id);
const withoutGol = [...CURRENT.benjamin, ...CURRENT.prebenjamin].filter(id => !golIds.includes(id));
const golRows = cat => gol[cat].reduce((n, e) => n + e.s.length, 0);

// 2. Copa de Campeones 2025-26, con la forma de current-2025-2026.json.
const champions = {
  season: SEASON,
  benjamin: inSourceOrder(D.BENJAMIN, CHAMPIONS.benjamin, 'BENJAMIN'),
  prebenjamin: inSourceOrder(D.PREBENJAMIN, CHAMPIONS.prebenjamin, 'PREBENJAMIN'),
  history: {},
};
for (const g of [...champions.benjamin, ...champions.prebenjamin]) {
  champions.history[g.id] = D.HISTORY[g.id] || fail(`falta HISTORY.${g.id}`);
}
const championRows = Object.values(champions.history).reduce((n, rounds) => n + Object.values(rounds).flat().length, 0);

// 3. Archivo, con la forma exacta de SEASON_<S> ({ name, current, benjamin, prebenjamin }).
// archive() de simulate.mjs une 2024-25 con historical-2024-2025.json ordenando por código: la
// fuente va ordenada así, y se comprueba aquí.
const archives = {};
for (const [file, spec] of Object.entries(ARCHIVE)) {
  const source = D[spec.global];
  if (!source || source.name !== spec.name) fail(`${spec.global} no es la temporada ${spec.name}`);
  for (const cat of ['benjamin', 'prebenjamin']) {
    if (!sortedById(source[cat])) fail(`${spec.global}.${cat} no va ordenado por código`);
  }
  archives[file] = {
    name: spec.name, current: false,
    benjamin: inSourceOrder(source.benjamin, spec.benjamin, `${spec.global}.benjamin`),
    prebenjamin: inSourceOrder(source.prebenjamin, spec.prebenjamin, `${spec.global}.prebenjamin`),
  };
}
const b1Past = readFixture('historical-2024-2025');
for (const cat of ['benjamin', 'prebenjamin']) {
  for (const g of b1Past[cat]) {
    const live = D.SEASON_2024_2025[cat].find(x => x.id === g.id);
    if (JSON.stringify(live) !== JSON.stringify(g)) fail(`${g.id} de historical-2024-2025.json ya no casa con data-season-2024-2025.js`);
    if (archives['historical-2024-2025-b3'][cat].some(x => x.id === g.id)) fail(`${g.id} ya está en historical-2024-2025.json`);
  }
}
const phases = readFixture('phases');
for (const spec of Object.values(archives)) {
  for (const cat of ['benjamin', 'prebenjamin']) {
    for (const g of spec[cat]) {
      const p = phases.find(x => x.season === spec.name && x.cat === cat && x.code === g.id);
      if (!p || p.phase !== g.phase || p.island !== g.island || p.name !== g.name) {
        fail(`${spec.name} ${g.id}: phases.json no casa con los data-*.js`);
      }
    }
  }
}

// 4. Actas de FF1 (por su etiqueta (s, gr)); ninguna clave choca con las de A1 de B1.
const a1 = readFixture('lineups-2025-2026');
const ff1Keys = new Set(Object.values(D.HISTORY[LINEUP_GROUP] || {}).flat().map(matchKey));
const ff1 = subset(D.LINEUPS_2025_2026, (_key, value) => entriesOf(value).some(e => e.s === SEASON && e.gr === LINEUP_GROUP));
if (!Object.keys(ff1).length) fail(`LINEUPS_2025_2026 no tiene actas de ${LINEUP_GROUP}`);
for (const key of Object.keys(ff1)) {
  if (!ff1Keys.has(key)) fail(`el acta ${key} no es un partido de HISTORY.${LINEUP_GROUP}`);
  if (Object.hasOwn(a1, key)) fail(`el acta ${key} ya está en lineups-2025-2026.json`);
}

// 5. Copa Plata de benjamín y Copa Oro de prebenjamín de la Maspalomas.
const cupsExtra = {
  benjamin: inSourceOrder(D.MASPALOMAS_CUP_BENJAMIN, CUPS_EXTRA.benjamin, 'MASPALOMAS_CUP_BENJAMIN'),
  prebenjamin: inSourceOrder(D.MASPALOMAS_CUP_PREBENJAMIN, CUPS_EXTRA.prebenjamin, 'MASPALOMAS_CUP_PREBENJAMIN'),
};

const ids = spec => list([...spec.benjamin, ...spec.prebenjamin].map(g => g.id));
write('gol-2025-2026', gol, `${gol.benjamin.length} grupos de benjamín (${golRows('benjamin')} filas) y ` +
  `${gol.prebenjamin.length} de prebenjamín (${golRows('prebenjamin')} filas); sin goleadores: ${list(withoutGol) || 'ninguno'}`);
write('campeones-2025-2026', champions, `${ids(champions)}, con ${championRows} partidos de HISTORY`);
for (const [file, spec] of Object.entries(archives)) {
  write(file, spec, `${spec.benjamin.length + spec.prebenjamin.length} grupos de ${spec.name} (${ids(spec)})`);
}
write('lineups-2025-2026-ff1', ff1, `${Object.keys(ff1).length} actas de ${LINEUP_GROUP}`);
write('cups-extra-2025-2026', cupsExtra, `${ids(cupsExtra)}`);
