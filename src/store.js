// Almacén persistente «futbol-base:v2» (spec §6.5): { myTeam, recent }.
//   myTeam = { name, season, cat, groupId }
//   recent = [{ s, g, t }], lo último visto primero, sin repetidos y como máximo 8.
//
// Módulo puro e importable en Node, sin DOM ni globales del navegador: recibe
// el Storage por parámetro (o una función que lo devuelve) y lo envuelve con
// safeStorage, así que un almacenamiento que falla (modo privado, cookies
// bloqueadas, cuota agotada o ninguno) deja la app con los valores por defecto
// en memoria. Nunca borra nada: ni futbol-base:favorites:v1 ni las claves
// antiguas `season`, `cat` y `theme`, que tampoco se leen.
import { normalizeTeamName } from './state.js';

export const STORE_KEY = 'futbol-base:v2';
export const LEGACY_KEY = 'futbol-base:favorites:v1';
export const MAX_RECENT = 8;

const CATS = ['benjamin', 'prebenjamin'];
const isText = value => typeof value === 'string' && value !== '';
const isObject = value => value !== null && typeof value === 'object' && !Array.isArray(value);

// `storage` es el Storage o una función que lo devuelve: con las cookies
// bloqueadas, solo con leer el Storage del navegador ya se lanza un error, y
// así también se captura.
export function safeStorage(storage) {
  const target = () => (typeof storage === 'function' ? storage() : storage);
  return {
    getItem(key) {
      try {
        const value = target().getItem(key);
        return typeof value === 'string' ? value : null;
      } catch {
        return null;
      }
    },
    setItem(key, value) {
      try {
        target().setItem(key, value);
        return true;
      } catch {
        return false;
      }
    },
  };
}

function readJSON(store, key) {
  const text = store.getItem(key);
  if (text === null) return undefined;
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

// Equipo de favorites.js (v1) y su clave `selected` (favoriteKey).
const isV1Team = team => isObject(team) && isText(team.name) && CATS.includes(team.cat) && isText(team.groupId);
const v1Key = team => `${team.cat}|${team.groupId}|${normalizeTeamName(team.name)}`;
const isMyTeam = team => isV1Team(team) && isText(team.season);
const isRecent = entry => isObject(entry) && isText(entry.s) && isText(entry.g) && isText(entry.t);

// Conserva el orden de `list`: descarta inválidos y repetidos, y corta en MAX_RECENT.
function cleanRecent(list) {
  const out = [];
  for (const entry of Array.isArray(list) ? list : []) {
    if (out.length === MAX_RECENT) break;
    if (!isRecent(entry) || out.some(e => e.s === entry.s && e.g === entry.g && e.t === entry.t)) continue;
    out.push({ s: entry.s, g: entry.g, t: entry.t });
  }
  return out;
}

// v1 = { teams: [{name, cat, groupId}], selected: 'cat|groupId|normalizeTeamName(name)' }.
// La temporada es el literal de la única con favoritos v1, nunca la del portal:
// si el portal ya está en otra, resolveMyTeam aplica el paso 1 (spec §6.3).
// Un grupo de torneo (MC*) se devuelve tal cual: los torneos no están en la
// temporada (van en Cups), así que resolveMyTeam no encuentra el grupo y aplica
// el paso 2 (o el 1, si la temporada ya cambió).
export function migrateV1(v1, legacySeason = '2025-2026') {
  if (!isObject(v1) || !Array.isArray(v1.teams)) return null;
  // Lo mismo que leía restoreFavorites (favorites.js): equipos válidos, hasta 30.
  const teams = v1.teams.filter(isV1Team).slice(0, 30);
  if (!teams.length) return null;
  const selected = teams.find(team => v1Key(team) === v1.selected) || teams[0];
  return {
    myTeam: { name: selected.name, season: legacySeason, cat: selected.cat, groupId: selected.groupId },
    recent: cleanRecent(teams
      .filter(team => v1Key(team) !== v1Key(selected))
      .map(team => ({ s: legacySeason, g: team.groupId, t: team.name }))),
  };
}

export function loadStore(storage, { defaultTeam, portalSeason }) {
  const store = safeStorage(storage);
  const fallback = { name: defaultTeam.name, season: portalSeason, cat: defaultTeam.cat, groupId: defaultTeam.groupId };
  const saved = readJSON(store, STORE_KEY);
  if (isObject(saved)) {
    const t = saved.myTeam;
    return {
      myTeam: isMyTeam(t) ? { name: t.name, season: t.season, cat: t.cat, groupId: t.groupId } : fallback,
      recent: cleanRecent(saved.recent),
    };
  }
  // Migración única: se escribe v2 y v1 se conserva.
  const migrated = migrateV1(readJSON(store, LEGACY_KEY));
  if (migrated) {
    saveStore(storage, migrated);
    return migrated;
  }
  return { myTeam: fallback, recent: [] };
}

// Devuelve false si no se pudo guardar (la app sigue con el estado en memoria).
export function saveStore(storage, state) {
  return safeStorage(storage).setItem(STORE_KEY, JSON.stringify({ myTeam: state.myTeam, recent: state.recent }));
}

export function addRecent(state, entry) {
  if (!isRecent(entry)) return state;
  return { ...state, recent: cleanRecent([{ s: entry.s, g: entry.g, t: entry.t }, ...(state.recent || [])]) };
}
