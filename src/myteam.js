// Identidad de club y «mi equipo» a través de temporadas y fases (spec §6).
// Módulo puro: recibe los datos por parámetro y no lee ningún global de datos.
import { normalizeForTeamsMapping, normalizeTeamName } from './state.js';
import { matchState, retiredTeams, competitionKey } from './model.js';

// Nombres de torneos y de la federación que no se pueden unir por escudo ni por clave base.
export const TEAM_ALIASES = { 'UD Las Mesas Huracán': 'Las Mesas Hu.' };

// Siglas que normalizeForTeamsMapping no quita (ya quita CF, CD, UD, AD, SD, SC, SAD, CP, CE, FC…).
const SIGLAS = new Set(['rc', 'us', 'cda', 'cef']);

export function baseKey(name) {
  const tokens = normalizeForTeamsMapping(name).split(' ').filter(token => token && !SIGLAS.has(token));
  if (tokens.length > 1 && /^[a-e]$/.test(tokens[tokens.length - 1])) tokens.pop();
  return tokens.join(' ');
}

// Grafo de nombres (union-find). Cada nombre se une a sus «claves»: 'f:' fichero de escudo
// (exacto o normalizado), 'k:' clave base y 'n:' nombre destino de su alias.
export function buildClubIndex(names, shields = {}, aliases = TEAM_ALIASES) {
  const normalized = new Map();
  for (const [key, file] of Object.entries(shields)) {
    const norm = normalizeTeamName(key);
    if (norm && !normalized.has(norm)) normalized.set(norm, file);
  }
  const cache = new Map();
  const keysOf = name => {
    if (cache.has(name)) return cache.get(name);
    const keys = [];
    const file = Object.hasOwn(shields, name) ? shields[name] : normalized.get(normalizeTeamName(name));
    if (file) keys.push('f:' + file);
    const base = baseKey(name);
    if (base) keys.push('k:' + base);
    if (Object.hasOwn(aliases, name)) keys.push('n:' + aliases[name]);
    cache.set(name, keys);
    return keys;
  };
  const parent = new Map();
  const find = node => {
    let root = node;
    while (parent.get(root) !== root) root = parent.get(root);
    while (parent.get(node) !== root) { const next = parent.get(node); parent.set(node, root); node = next; }
    return root;
  };
  const add = node => { if (!parent.has(node)) parent.set(node, node); };
  const union = (a, b) => { add(a); add(b); const ra = find(a), rb = find(b); if (ra !== rb) parent.set(ra, rb); };

  const universe = new Set([...names, ...Object.keys(shields), ...Object.keys(aliases), ...Object.values(aliases)]);
  universe.delete(''); universe.delete(null); universe.delete(undefined);
  for (const name of universe) { add('n:' + name); for (const key of keysOf(name)) union('n:' + name, key); }

  // Un nombre que no está en el universo (p. ej. el de una temporada no cargada) se
  // relaciona por sus claves, sin modificar el índice.
  const rootsOf = name => (parent.has('n:' + name)
    ? new Set([find('n:' + name)])
    : new Set(keysOf(name).filter(key => parent.has(key)).map(find)));

  return {
    same(a, b) {
      if (!a || !b) return false;
      if (a === b) return true;
      const keysA = keysOf(a);
      if (keysOf(b).some(key => keysA.includes(key))) return true;
      const rootsA = rootsOf(a);
      return [...rootsOf(b)].some(root => rootsA.has(root));
    },
    members(name) {
      const roots = rootsOf(name);
      const out = new Set(name ? [name] : []);
      for (const other of universe) if (roots.has(find('n:' + other))) out.add(other);
      return [...out].sort((x, y) => x.localeCompare(y, 'es'));
    },
  };
}

export function sameClub(index, a, b) {
  return index.same(a, b);
}

// ---- Resolución de mi equipo (spec §6.3) ----

const CATS = ['benjamin', 'prebenjamin'];
const PHASE_LEVEL = {
  'segunda-fase': 2, 'segunda-a': 2, 'segunda-b': 2, 'segunda-c': 2, 'segunda-d': 2, 'segunda-e': 2,
  'fase-2': 2, oro: 2, plata: 2, bronce: 2,
};

const allMatches = group => group.rounds.flatMap(round => round.matches);

function teamsOf(group) {
  const teams = new Set(group.standings.map(row => row.team));
  for (const match of allMatches(group)) { teams.add(match.home); teams.add(match.away); }
  teams.delete(''); teams.delete(null); teams.delete(undefined);
  return [...teams];
}

// Partidos que cuentan (spec §4.2): los que no son contra un retirado.
function countedMatches(group) {
  const retired = retiredTeams(group);
  return allMatches(group).filter(match => !retired.has(match.home) && !retired.has(match.away));
}

const hasPending = (group, todayISO) => countedMatches(group).some(match => matchState(match, todayISO) === 'pendiente');
const levels = new WeakMap();
function phaseLevel(group) {
  if (!levels.has(group)) levels.set(group, PHASE_LEVEL[competitionKey(group, group.season).phase] ?? 1);
  return levels.get(group);
}
const leagueGroups = (season, cat) => season.groups.filter(group => group.kind === 'league' && group.cat === cat);
// De una lista de {group, …}, los de la fase más alta.
function topPhase(entries) {
  const top = Math.max(...entries.map(entry => phaseLevel(entry.group)));
  return entries.filter(entry => phaseLevel(entry.group) === top);
}

// Candidatos del club en cada categoría: grupos de liga de la fase más reciente, que es la
// más alta de las que tienen partidos pendientes o, si no hay ninguna, la más alta de todas
// (con dos fases a la vez, el mismo equipo no sale dos veces). Uno por grupo y nombre: el
// mismo nombre en dos grupos de esa fase son dos candidatos (decisión 11).
function clubCandidates(season, cats, name, index, todayISO) {
  const candidates = [];
  for (const cat of cats) {
    const found = leagueGroups(season, cat)
      .map(group => ({ group, teams: teamsOf(group).filter(team => sameClub(index, team, name)) }))
      .filter(entry => entry.teams.length);
    if (!found.length) continue;
    const pending = found.filter(entry => hasPending(entry.group, todayISO));
    for (const { group, teams } of topPhase(pending.length ? pending : found)) {
      for (const team of teams) candidates.push({ group, name: team, cat });
    }
  }
  return candidates;
}

const ok = (group, name) => ({ status: 'ok', group, name, cat: group.cat });
const ask = entries => ({ status: 'ask', candidates: entries.map(({ group, name }) => ({ group, name, cat: group.cat })) });

// Paso 0 con el grupo guardado ya sin partidos pendientes. Cuentan los equipos del club en
// los grupos de liga de la categoría: los de la fase guardada y los de la fase posterior
// (nivel mayor, decisión 10), terminados o no (decisión 12).
// - Con menos equipos del club en la fase posterior que en la guardada, esa fase aún no
//   está publicada entera para él: se espera, sin cambiar ni preguntar (decisión 16). Los
//   retirados de la fase guardada no cuentan: nunca aparecen en la posterior.
// - El mismo nombre en un solo grupo posterior es un cambio de fase, en silencio; en
//   varios, se pregunta por esos grupos (decisión 11).
// - Si el nombre está en dos grupos de la fase guardada, son dos equipos distintos: se
//   pregunta con los equipos del club en la fase posterior (decisión 17), como cuando solo
//   hay otros equipos del club (la filial que cambia de nombre).
// - Sin equipos del club en la fase posterior, sigue el grupo guardado.
function laterPhase(groups, saved, myTeam, index) {
  const club = gs => gs.flatMap(group => teamsOf(group).filter(team => sameClub(index, team, myTeam.name)).map(name => ({ group, name })));
  const later = topPhase(club(groups.filter(group => phaseLevel(group) > phaseLevel(saved))));
  const before = club(groups.filter(group => phaseLevel(group) === phaseLevel(saved)));
  // Fase posterior sin publicar entera para el club: se espera, sin preguntar ni mover (decisión 16).
  if (later.length < before.filter(({ group, name }) => !retiredTeams(group).has(name)).length) return ok(saved, myTeam.name);
  // El mismo nombre en dos grupos de la fase guardada: dos equipos distintos, nunca en silencio (decisión 17).
  const twins = before.filter(entry => entry.name === myTeam.name).length > 1;
  const same = later.filter(entry => entry.name === myTeam.name);
  if (same.length === 1 && !twins) return ok(same[0].group, myTeam.name);
  if (same.length && !twins) return ask(same);
  return later.length ? ask(later) : ok(saved, myTeam.name);
}

// Pasos 1 y 2: sin candidatos, ausente; uno solo con el mismo nombre y la misma categoría,
// se usa sin preguntar (decisión 13); en cualquier otro caso, se pregunta.
function choose(candidates, myTeam) {
  if (!candidates.length) return { status: 'absent' };
  const [only] = candidates;
  if (candidates.length === 1 && only.name === myTeam.name && only.cat === myTeam.cat) return { status: 'ok', ...only };
  return { status: 'ask', candidates };
}

export function resolveMyTeam(myTeam, season, index, todayISO) {
  if (!myTeam || !myTeam.name || !season) return { status: 'absent' };
  if (myTeam.season === season.name) {
    // Paso 0: el caso normal, sin preguntas.
    const groups = leagueGroups(season, myTeam.cat);
    const saved = groups.find(group => group.id === myTeam.groupId);
    if (saved && teamsOf(saved).includes(myTeam.name)) {
      return hasPending(saved, todayISO) ? ok(saved, myTeam.name) : laterPhase(groups, saved, myTeam, index);
    }
    // Paso 2: el grupo guardado ya no sirve; se busca solo en su categoría.
    return choose(clubCandidates(season, [myTeam.cat], myTeam.name, index, todayISO), myTeam);
  }
  // Paso 1: cambio de temporada; se busca en ambas categorías, primero en la suya.
  const cats = [myTeam.cat, ...CATS.filter(cat => cat !== myTeam.cat)];
  return choose(clubCandidates(season, cats, myTeam.name, index, todayISO), myTeam);
}

// Lo que B2 guarda tras resolver (decisión 12): el myTeam nuevo, {name, season, cat, groupId},
// si una resolución `ok` cambia algo; null si no cambia nada o si la resolución no es `ok`.
export function updatedMyTeam(myTeam, resolution) {
  if (!resolution || resolution.status !== 'ok') return null;
  const next = { name: resolution.name, season: resolution.group.season, cat: resolution.cat, groupId: resolution.group.id };
  const same = myTeam && Object.keys(next).every(key => myTeam[key] === next[key]);
  return same ? null : next;
}

// ---- Verano (spec §6.4) ----

// Solo los torneos de la temporada de mi equipo: los de 2025-26 nunca salen bajo otra.
export function summerCups(cups, myTeam, index) {
  if (!cups || !myTeam || cups.season !== myTeam.season) return [];
  const out = [];
  for (const group of cups.groups) {
    if (group.cat !== myTeam.cat) continue;
    const rows = allMatches(group).filter(match => sameClub(index, match.home, myTeam.name) || sameClub(index, match.away, myTeam.name));
    if (rows.length) out.push({ group, rows });
  }
  return out;
}
