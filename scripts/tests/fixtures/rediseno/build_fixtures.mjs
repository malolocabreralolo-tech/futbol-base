// Congela datos reales para las pruebas del rediseño «Acta» (Plan B1, spec §11).
//
// Se ejecuta UNA vez, desde la raíz del repo y con 2025-26 como temporada actual:
//   node scripts/tests/fixtures/rediseno/build_fixtures.mjs
// Su salida (los *.json de esta carpeta) se commitea. Las pruebas leen solo esos
// JSON (load.mjs), nunca los data-*.js ni src/config.js vivos, que cambian al
// activar 2026/27.
//
// Lee los data-*.js con node:vm y futbolbase.db en solo lectura (python3 y
// sqlite3 con URI mode=ro). Solo escribe en esta carpeta.
import { readFileSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
import { normalizeTeamName } from '../../../../src/state.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..', '..', '..', '..');

const SEASON = '2025-2026';
const CURRENT = { benjamin: ['A1', 'A2', 'B1', 'B2', 'FF5', 'FF9', 'FF13', 'FF15'], prebenjamin: ['PG2', 'PG3', 'PFV2'] };
const HISTORICAL = { season: '2024-2025', benjamin: ['P1'], prebenjamin: ['PGC2'] };
const CUPS = { benjamin: ['MCB16', 'MCBK2'], prebenjamin: ['MCP3', 'MCPK1'] };
const LINEUP_GROUPS = ['A1'];
const CALERO_KEY = 'CD Calero|La Garita|1-11';
const FAVORITES_V1 = {
  teams: [
    { name: 'Las Mesas Hu.', cat: 'prebenjamin', groupId: 'PG2' },
    { name: 'AD Huracán', cat: 'prebenjamin', groupId: 'PG2' },
  ],
  selected: 'prebenjamin|PG2|las mesas hu',
};

// Todos los grupos de la base: temporada, categoría, código, fase, isla y nombre.
const PHASES_PY = `
import json, pathlib, sqlite3, sys
uri = pathlib.Path(sys.argv[1]).resolve().as_uri() + '?mode=ro'
rows = sqlite3.connect(uri, uri=True).execute("""
    SELECT s.name, LOWER(c.name), g.code, g.phase, g.island, g.name
      FROM groups g
      JOIN seasons s ON s.id = g.season_id
      JOIN categories c ON c.id = g.category_id
     WHERE UPPER(c.name) IN ('BENJAMIN', 'PREBENJAMIN')
     ORDER BY s.name DESC, LOWER(c.name), g.code""").fetchall()
print(json.dumps([dict(zip(('season', 'cat', 'code', 'phase', 'island', 'name'), r)) for r in rows],
                 ensure_ascii=False))
`;

function fail(message) {
  throw new Error(`build_fixtures: ${message}`);
}

// Los data-*.js declaran `const X=…` de nivel superior; con `var` quedan como
// propiedades del contexto de node:vm.
function loadDataGlobals(files) {
  const ctx = vm.createContext({});
  for (const file of files) {
    const src = readFileSync(join(ROOT, file), 'utf8');
    vm.runInContext(src.replace(/^const /gm, 'var '), ctx, { filename: file });
  }
  return ctx;
}

function pick(groups, ids, where) {
  return ids.map(id => groups.find(g => g.id === id) || fail(`falta el grupo ${id} en ${where}`));
}

function subset(object, keep) {
  const out = {};
  for (const [key, value] of Object.entries(object)) if (keep(key, value)) out[key] = value;
  return out;
}

// Clave de MATCH_DETAIL y LINEUPS_<S>, como _match_key de generate_js.py.
const matchKey = ([home, away, hs, as]) => `${home}|${away}|${hs}-${as}`;
const entriesOf = value => (value && value.dup ? value.list : [value]);

// [local, visitante, gl, gv] de cada partido de un grupo: filas de HISTORY o de
// `jornadas` ([fecha, local, visitante, gl, gv, …]) y filas en línea de
// `matches` ([fecha, hora, local, visitante, gl, gv, campo]).
function matchesOf(group, history) {
  const rows = Object.values(history || group.jornadas || {}).flat().map(r => [r[1], r[2], r[3], r[4]]);
  return rows.concat((group.matches || []).map(r => [r[2], r[3], r[4], r[5]]));
}

function write(name, value, detail) {
  writeFileSync(join(HERE, `${name}.json`), JSON.stringify(value) + '\n');
  console.log(`${name}.json: ${detail}`);
}

const D = loadDataGlobals([
  'data-seasons.js', 'data-benjamin.js', 'data-prebenjamin.js', 'data-history.js',
  'data-season-2024-2025.js', 'data-maspalomas-cup-2026.js', 'data-matchdetail.js',
  'data-lineups-2025-2026.js', 'data-shields.js',
]);
const actual = D.SEASONS.find(s => s.current)?.name;
if (actual !== SEASON) {
  fail(`la temporada actual de data-seasons.js es ${actual}, no ${SEASON}: ` +
    'genera las fixtures desde un commit anterior a la activación de 2026/27');
}

const current = {
  season: SEASON,
  benjamin: pick(D.BENJAMIN, CURRENT.benjamin, 'BENJAMIN'),
  prebenjamin: pick(D.PREBENJAMIN, CURRENT.prebenjamin, 'PREBENJAMIN'),
  history: {},
};
for (const id of [...CURRENT.benjamin, ...CURRENT.prebenjamin]) {
  current.history[id] = D.HISTORY[id] || fail(`falta HISTORY.${id}`);
}
const currentGroup = id => [...current.benjamin, ...current.prebenjamin].find(g => g.id === id);
const historical = {
  season: HISTORICAL.season,
  benjamin: pick(D.SEASON_2024_2025.benjamin, HISTORICAL.benjamin, 'SEASON_2024_2025.benjamin'),
  prebenjamin: pick(D.SEASON_2024_2025.prebenjamin, HISTORICAL.prebenjamin, 'SEASON_2024_2025.prebenjamin'),
};
const cups = {
  benjamin: pick(D.MASPALOMAS_CUP_BENJAMIN, CUPS.benjamin, 'MASPALOMAS_CUP_BENJAMIN'),
  prebenjamin: pick(D.MASPALOMAS_CUP_PREBENJAMIN, CUPS.prebenjamin, 'MASPALOMAS_CUP_PREBENJAMIN'),
};

// [grupo, filas de HISTORY o null] de todas las fixtures.
const allGroups = [
  ...[...current.benjamin, ...current.prebenjamin].map(g => [g, current.history[g.id]]),
  ...[...historical.benjamin, ...historical.prebenjamin, ...cups.benjamin, ...cups.prebenjamin].map(g => [g, null]),
];

// Cronología: las entradas cuya clave es la de un partido de las fixtures y las
// etiquetadas (s, gr) con un grupo actual de las fixtures, más la de Calero.
const currentIds = new Set([...CURRENT.benjamin, ...CURRENT.prebenjamin]);
const fixtureKeys = new Set(allGroups.flatMap(([g, h]) => matchesOf(g, h).map(matchKey)));
const matchdetail = subset(D.MATCH_DETAIL, (key, value) => key === CALERO_KEY || fixtureKeys.has(key)
  || entriesOf(value).some(e => e.s === SEASON && currentIds.has(e.gr)));
if (!matchdetail[CALERO_KEY]) fail(`falta ${CALERO_KEY} en MATCH_DETAIL`);

// Actas: las de los partidos de A1 (por clave o por etiqueta).
const lineupKeys = new Set(LINEUP_GROUPS.flatMap(id => matchesOf(currentGroup(id), current.history[id]).map(matchKey)));
const lineups = subset(D.LINEUPS_2025_2026, (key, value) => lineupKeys.has(key)
  || entriesOf(value).some(e => e.s === SEASON && LINEUP_GROUPS.includes(e.gr)));
if (!Object.keys(lineups).length) fail('LINEUPS_2025_2026 no tiene actas de A1');

// Escudos: los de cada nombre de equipo de las fixtures (exacto, normalizado o
// por inclusión, como teamBadge de state.js) y todos los nombres que comparten
// fichero con ellos (la arista «mismo escudo» de la identidad de club, §6.1).
const names = new Set(FAVORITES_V1.teams.map(t => t.name));
for (const [g, h] of allGroups) {
  for (const row of g.standings || []) names.add(row[1]);
  for (const [home, away] of matchesOf(g, h)) names.add(home).add(away);
}
const norms = [...names].filter(n => typeof n === 'string' && n).map(normalizeTeamName).filter(Boolean);
const matchesAName = key => {
  const kn = normalizeTeamName(key);
  return names.has(key) || norms.includes(kn)
    || (kn.length >= 4 && norms.some(n => n.length >= 4 && (kn.includes(n) || n.includes(kn))));
};
const shieldFiles = new Set(Object.keys(D.SHIELDS).filter(matchesAName).map(k => D.SHIELDS[k]));
const shields = subset(D.SHIELDS, (_key, file) => shieldFiles.has(file));

const health = JSON.parse(readFileSync(join(ROOT, 'data-health.json'), 'utf8'));

const phases = JSON.parse(execFileSync('python3', ['-c', PHASES_PY, join(ROOT, 'futbolbase.db')], { encoding: 'utf8' }));
for (const [season, cat, g] of [
  ...['benjamin', 'prebenjamin'].flatMap(cat => current[cat].map(g => [SEASON, cat, g])),
  ...['benjamin', 'prebenjamin'].flatMap(cat => historical[cat].map(g => [HISTORICAL.season, cat, g])),
]) {
  const p = phases.find(x => x.season === season && x.cat === cat && x.code === g.id);
  if (!p || p.phase !== g.phase || p.island !== g.island || p.name !== g.name) {
    fail(`${season} ${g.id}: la base no casa con los data-*.js`);
  }
}

const v1Key = t => `${t.cat}|${t.groupId}|${normalizeTeamName(t.name)}`;
if (v1Key(FAVORITES_V1.teams[0]) !== FAVORITES_V1.selected) fail('selected de favorites-v1 no casa con normalizeTeamName');
for (const t of FAVORITES_V1.teams) {
  if (!currentGroup(t.groupId).standings.some(r => r[1] === t.name)) fail(`${t.name} no está en ${t.groupId}`);
}

const historyRows = Object.values(current.history).reduce((n, rounds) => n + Object.values(rounds).flat().length, 0);
write('current-2025-2026', current, `${currentIds.size} grupos y ${historyRows} partidos de HISTORY`);
write('historical-2024-2025', historical, `${historical.benjamin.length + historical.prebenjamin.length} grupos`);
write('cups-2025-2026', cups, `${cups.benjamin.length + cups.prebenjamin.length} grupos`);
write('matchdetail', matchdetail, `${Object.keys(matchdetail).length} entradas`);
write('lineups-2025-2026', lineups, `${Object.keys(lineups).length} actas`);
write('shields', shields, `${Object.keys(shields).length} escudos`);
write('health', health, `temporada ${health.season}, siguiente ${health.nextSeason.name} (${health.nextSeason.status})`);
write('phases', phases, `${phases.length} grupos`);
write('favorites-v1', FAVORITES_V1, `${FAVORITES_V1.teams.length} favoritos`);
