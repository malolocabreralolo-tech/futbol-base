// Identidad de club y «mi equipo» a través de temporadas y fases (spec §6).
// Módulo puro: recibe los datos por parámetro y no lee ningún global de datos.
import { normalizeForTeamsMapping, shieldFile } from './state.js';
import { matchState, retiredTeams, competitionKey, groupFinished, teamFixtures } from './model.js';

// Nombres de torneos y de la federación que no se pueden unir por escudo ni por clave base.
// Además del de la Maspalomas, los de 2025-26 que cambian de la Primera Fase a la siguiente
// (FF20 → C3, FF21 → A3, FF21 → C4, FV11 → FO y FV14 → FP): sin ellos, esas familias se
// quedaban en su grupo de la Primera Fase ya terminado (decisión 20).
export const TEAM_ALIASES = {
  'UD Las Mesas Huracán': 'Las Mesas Hu.',
  'Loz Vélez': 'Los Vélez',
  'M. Training B': 'Maspa Training B',
  'C. Pastores B': 'Casa Pastores B',
  'INTER FUERTEVENTURA, C.D.': 'Inter FTV',
  'BALOMPEDICA ISLA TRANQUILA, C.D. ATLETICO "A"': 'Balompédica',
};

// Siglas que normalizeForTeamsMapping no quita (ya quita CF, CD, UD, AD, SD, SC, SAD, CP, CE, FC…).
const SIGLAS = new Set(['rc', 'us', 'cda', 'cef']);

const clubTokens = name => normalizeForTeamsMapping(name).split(' ').filter(token => token && !SIGLAS.has(token));
// La letra de filial: la última palabra, si es una sola letra de la A a la E.
const hasFilialLetter = tokens => tokens.length > 1 && /^[a-e]$/.test(tokens[tokens.length - 1]);

export function baseKey(name) {
  const tokens = clubTokens(name);
  if (hasFilialLetter(tokens)) tokens.pop();
  return tokens.join(' ');
}

// La letra de filial de un nombre, en minúscula; sin letra, es el equipo A.
function filialLetter(name) {
  const tokens = clubTokens(name);
  return hasFilialLetter(tokens) ? tokens[tokens.length - 1] : 'a';
}

// Grafo de nombres (union-find). Cada nombre se une a sus «claves»: 'f:' fichero de escudo
// (exacto o normalizado, con shieldFile de state.js, la misma búsqueda que crest), 'k:' clave
// base y 'n:' nombre destino de su alias.
export function buildClubIndex(names, shields = {}, aliases = TEAM_ALIASES) {
  const cache = new Map();
  const keysOf = name => {
    if (cache.has(name)) return cache.get(name);
    const keys = [];
    const file = shieldFile(name, shields);
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
      // Atajo: una clave compartida (el mismo escudo, la misma clave base o el mismo alias) es
      // una arista de §6.1, y se compara en crudo, sin exigir que la clave esté en el grafo. Es
      // seguro en los usos reales porque un lado es siempre un nombre del universo (un equipo de
      // los grupos o torneos con los que se construyó el índice): esa clave ya está unida a él,
      // así que el grafo daría lo mismo.
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
// Nivel de fase de cada grupo, memorizado por identidad del objeto Group. El valor sale solo del
// propio grupo (su fase, vía competitionKey) y no lee nada externo, así que memorizarlo no cambia
// ningún resultado; al ser un WeakMap, tampoco retiene los grupos que ya no se usan.
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
// El primer partido con fecha de esos grupos ('AAAA-MM-DD'), o null.
const firstDate = groups => groups.flatMap(allMatches).map(match => match.dateISO).filter(Boolean).sort()[0] ?? null;
// Días de `fromISO` a `toISO`, dos fechas 'AAAA-MM-DD'.
const utcDay = iso => Date.UTC(Number(iso.slice(0, 4)), Number(iso.slice(5, 7)) - 1, Number(iso.slice(8, 10)));
const daysBetween = (fromISO, toISO) => Math.round((utcDay(toISO) - utcDay(fromISO)) / 86400000);
// Días que la fase posterior tiene que llevar en marcha para que haya marca `stale`: mientras
// se publica grupo a grupo, un club sin ningún grupo publicado aún no está atascado (decisión 20).
const STALE_AFTER_DAYS = 7;
// Los equipos del club de `name` en esos grupos, uno por grupo y nombre: [{group, name}], en el
// orden de los grupos y, dentro de cada uno, en el de teamsOf.
const clubTeams = (groups, name, index) => groups.flatMap(group => teamsOf(group)
  .filter(team => sameClub(index, team, name)).map(team => ({ group, name: team })));

// Candidatos del club en cada categoría: grupos de liga de la fase más reciente, que es la
// más alta de las que tienen partidos pendientes o, si no hay ninguna, la más alta de todas
// (con dos fases a la vez, el mismo equipo no sale dos veces). Uno por grupo y nombre: el
// mismo nombre en dos grupos de esa fase son dos candidatos (decisión 11).
function clubCandidates(season, cats, name, index, todayISO) {
  const candidates = [];
  for (const cat of cats) {
    const found = clubTeams(leagueGroups(season, cat), name, index);
    if (!found.length) continue;
    const pending = found.filter(entry => hasPending(entry.group, todayISO));
    for (const entry of topPhase(pending.length ? pending : found)) candidates.push({ ...entry, cat });
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
// Siempre que sigue el grupo guardado, lleva `stale: true` si la fase posterior de su categoría
// e isla tiene grupos con partidos pendientes, ningún equipo del club y al menos 7 días en marcha
// (su primer partido con fecha es de hace 7 días o más): lo probable es que el equipo siga en ella
// con un nombre que el índice no une. Antes de esa semana, la fase se puede estar publicando grupo
// a grupo. No cambia ni pregunta: B2 lo avisa y updatedMyTeam no lo guarda (decisión 20). Si el
// club tiene algún equipo en esa fase, aunque menos, se espera sin marca (decisión 16).
function laterPhase(groups, saved, myTeam, index, todayISO) {
  const posterior = groups.filter(group => phaseLevel(group) > phaseLevel(saved));
  const clubLater = clubTeams(posterior, myTeam.name, index);
  const later = topPhase(clubLater);
  const before = clubTeams(groups.filter(group => phaseLevel(group) === phaseLevel(saved)), myTeam.name, index);
  const stay = () => {
    const island = posterior.filter(group => group.island === saved.island);
    const since = firstDate(island);
    const stale = !clubLater.some(entry => entry.group.island === saved.island)
      && since !== null && daysBetween(since, todayISO) >= STALE_AFTER_DAYS
      && island.some(group => hasPending(group, todayISO));
    return stale ? { ...ok(saved, myTeam.name), stale: true } : ok(saved, myTeam.name);
  };
  // Fase posterior sin publicar entera para el club: se espera, sin preguntar ni mover (decisión 16).
  if (later.length < before.filter(({ group, name }) => !retiredTeams(group).has(name)).length) return stay();
  // El mismo nombre en dos grupos de la fase guardada: dos equipos distintos, nunca en silencio (decisión 17).
  const twins = before.filter(entry => entry.name === myTeam.name).length > 1;
  const same = later.filter(entry => entry.name === myTeam.name);
  if (same.length === 1 && !twins) return ok(same[0].group, myTeam.name);
  if (same.length && !twins) return ask(same);
  return later.length ? ask(later) : stay();
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
      return hasPending(saved, todayISO) ? ok(saved, myTeam.name) : laterPhase(groups, saved, myTeam, index, todayISO);
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
// `stale` no se guarda ni cuenta como cambio (decisión 20).
export function updatedMyTeam(myTeam, resolution) {
  if (!resolution || resolution.status !== 'ok') return null;
  const next = { name: resolution.name, season: resolution.group.season, cat: resolution.cat, groupId: resolution.group.id };
  const same = myTeam && Object.keys(next).every(key => myTeam[key] === next[key]);
  return same ? null : next;
}

// Lo que app.js guarda al arrancar (decisión 12 de B1): el myTeam de updatedMyTeam, solo si el cambio
// es de la misma temporada (el cambio de fase del paso 0, FF5 → A2). Un cambio de temporada (paso 1)
// nunca se guarda solo: se vuelve a resolver en cada carga hasta que la familia lo confirma (la
// respuesta a E o «Hacer mi equipo»). Así, con 2026/27 publicada por partes, un único candidato en
// silencio el primer día no impide la pregunta cuando llegan los demás (A2 de la revisión de B2).
export function myTeamToSave(myTeam, resolution) {
  const next = updatedMyTeam(myTeam, resolution);
  return next && myTeam && next.season === myTeam.season ? next : null;
}

// ---- Verano (spec §6.4) ----

// Solo los torneos de la temporada de mi equipo: los de 2025-26 nunca salen bajo otra. En cada
// grupo de torneo de su categoría, el equipo del club con su misma letra de filial y solo sus
// partidos (decisión 19): el de «Arucas» es Arucas CF A, nunca B, C ni D. Si no hay ninguno con
// esa letra, o hay dos, el grupo no sale: mejor sin «Verano» que con el de otro equipo.
export function summerCups(cups, myTeam, index) {
  if (!cups || !myTeam || cups.season !== myTeam.season) return [];
  const letter = filialLetter(myTeam.name);
  const out = [];
  for (const group of cups.groups) {
    if (group.cat !== myTeam.cat) continue;
    const mine = teamsOf(group).filter(team => sameClub(index, team, myTeam.name) && filialLetter(team) === letter);
    if (mine.length !== 1) continue;
    const [team] = mine;
    const rows = allMatches(group).filter(match => match.home === team || match.away === team);
    if (rows.length) out.push({ group, team, rows });
  }
  return out;
}

// ---- Estado de un equipo y de la portada (spec §4.2 y §4.6) ----

// Estado de un equipo en su grupo, en el orden D, B, C, A (decisión 9 de B3): lo comparten la
// portada, tras E y X, y la ficha de Equipo, que así no necesita una resolución de mi equipo falsa.
// Solo cuentan los partidos que no son contra retirados. A y C salen de teamFixtures, como el
// próximo partido que se enseña: A si el equipo tiene próximo partido; C si ya ha jugado y no lo
// tiene. Sin nada jugado ni próximo partido (todos sin fecha), B.
export function teamState({ group, name, todayISO, portalSeason }) {
  if (groupFinished(group, todayISO, portalSeason)) return 'D';
  if (!countedMatches(group).some(match => matchState(match, todayISO) === 'jugado')) return 'B';
  const { next, played } = teamFixtures(name, group, todayISO);
  if (next) return 'A';
  return played > 0 ? 'C' : 'B';
}

// Orden E, X y después el de teamState sobre el grupo resuelto. `health` no cambia el estado: solo
// decide la caja.
export function homeState({ resolution, todayISO, portalSeason }) {
  if (resolution?.status === 'ask') return 'E';
  if (resolution?.status !== 'ok') return 'X';
  return teamState({ group: resolution.group, name: resolution.name, todayISO, portalSeason });
}

export function showNextSeasonBox({ group, health, portalSeason }) {
  if (!group || group.season !== portalSeason) return false;
  return !health || health.nextSeason?.status === 'pending';
}

/* Nombre de mi equipo en `group` para el resalte propio (spec §3.3), o null. En el grupo
 * resuelto, el de la resolución. En otro grupo de la misma temporada y la misma fase, nunca: el
 * mismo nombre es otro equipo (Santa Brígida en B1 y B2; decisión 17 de B1). En los demás (otra
 * fase u otra temporada), el nombre tal cual si el grupo es de su categoría y lo trae, como el
 * grupo por defecto de §4.1. Un equipo del mismo nombre en la otra categoría nunca se resalta. */
export function myTeamIn(group, myTeam, resolution) {
  if (!group) return null;
  const ok = resolution && resolution.status === 'ok' && resolution.group ? resolution : null;
  if (ok && ok.group.season === group.season) {
    if (ok.group.id === group.id) return ok.name;
    if (ok.group.compKey === group.compKey) return null;
  }
  const name = ok ? ok.name : myTeam && myTeam.name;
  const cat = ok ? ok.cat : myTeam && myTeam.cat;
  if (!name || cat !== group.cat) return null;
  const listed = (group.standings || []).some(row => row.team === name)
    || (group.rounds || []).some(round => round.matches.some(m => m.home === name || m.away === name));
  return listed ? name : null;
}

// ---- Trayectoria (spec §4.6 y §6.1; decisión 14 de B3) ----

// El club de `name` (el índice de clubes de todo lo cargado, §6.1) en cada temporada de `seasons` que
// esté cargada, en ese orden (la más reciente primero): una fila por temporada, categoría y nombre
// exacto, en el grupo de liga de la fase más alta en que juega (topPhase, la regla de la resolución).
// Dos grupos de la misma fase con el mismo nombre son dos equipos (decisión 17 de B1): dos filas.
// [{ season, cat, name, group, pos, pts }], con pos y pts de su fila de la clasificación, o null.
export function teamTrajectory(model, name, index, seasons) {
  const out = [];
  for (const seasonName of seasons) {
    const season = model.season(seasonName);
    if (!season) continue;
    for (const cat of CATS) {
      const byName = new Map();
      for (const entry of clubTeams(leagueGroups(season, cat), name, index)) {
        if (!byName.has(entry.name)) byName.set(entry.name, []);
        byName.get(entry.name).push(entry);
      }
      for (const [team, entries] of [...byName].sort(([a], [b]) => a.localeCompare(b, 'es'))) {
        for (const { group } of topPhase(entries)) {
          const row = group.standings.find(r => r.team === team) || null;
          out.push({ season: seasonName, cat, name: team, group, pos: row ? row.pos : null, pts: row ? row.pts : null });
        }
      }
    }
  }
  return out;
}
