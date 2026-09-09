import { FEATURED, S, normalizeTeamName, teamBadge, escapeHtml as esc, escapeAttr, getCurrentSeason } from './state.js';
import { PORTAL } from './config.js';
import { showDialog, closeModal } from './modals.js';

const KEY = 'futbol-base:favorites:v1';
let favorites = [{ ...PORTAL.defaultTeam }];
export function favoriteKey(team) { return `${team.cat}|${team.groupId}|${normalizeTeamName(team.name)}`; }
export function getFavorites() { return favorites.map(team => ({ ...team })); }
export function currentGroups(cat) {
  const groups = cat === 'benjamin'
    ? (typeof BENJAMIN !== 'undefined' ? BENJAMIN : [])
    : (typeof PREBENJAMIN !== 'undefined' ? PREBENJAMIN : []);
  const cup = PORTAL.season !== '2025-2026' ? [] : cat === 'benjamin'
    ? (typeof MASPALOMAS_CUP_BENJAMIN !== 'undefined' ? MASPALOMAS_CUP_BENJAMIN : [])
    : (typeof MASPALOMAS_CUP_PREBENJAMIN !== 'undefined' ? MASPALOMAS_CUP_PREBENJAMIN : []);
  return groups.concat(cup);
}
export function allTeams() {
  return ['prebenjamin', 'benjamin'].flatMap(cat => currentGroups(cat).flatMap(group =>
    (group.standings || []).map(row => ({ name: row[1], cat, groupId: group.id, groupName: group.name, phase: group.phase, island: group.island }))));
}

export function restoreFavorites() {
  try {
    const saved = JSON.parse(localStorage.getItem(KEY));
    if (saved && Array.isArray(saved.teams)) {
      favorites = saved.teams.filter(team => team && ['benjamin', 'prebenjamin'].includes(team.cat)
        && typeof team.name === 'string' && typeof team.groupId === 'string').slice(0, 30);
      if (saved.selected) {
        const selected = favorites.find(team => favoriteKey(team) === saved.selected);
        if (selected) Object.assign(FEATURED, selected);
      }
    }
  } catch { /* A damaged saved preference must not break the portal. */ }
  if (!favorites.length) favorites = [{ ...PORTAL.defaultTeam }];
  if (!favorites.some(team => favoriteKey(team) === favoriteKey(FEATURED))) Object.assign(FEATURED, favorites[0]);
}

function save() {
  try { localStorage.setItem(KEY, JSON.stringify({ teams: favorites, selected: favoriteKey(FEATURED) })); }
  catch { /* Session remains usable in private/storage-limited browsers. */ }
}

export function selectFavorite(team, emit = true) {
  if (!team) return;
  Object.assign(FEATURED, { name: team.name, cat: team.cat, groupId: team.groupId });
  if (!favorites.some(item => favoriteKey(item) === favoriteKey(team))) favorites.push({ ...FEATURED });
  S.cat = team.cat;
  S.jorGroup = team.groupId;
  save();
  if (emit) document.dispatchEvent(new CustomEvent('favoritechange'));
}

export function renderFavoriteBar(host) {
  const bar = document.createElement('div');
  bar.className = 'favorite-bar';
  bar.setAttribute('aria-label', 'Tus equipos favoritos');
  bar.innerHTML = '<div class="favorite-tabs">' + favorites.map((team, i) =>
    `<button class="favorite-tab${favoriteKey(team) === favoriteKey(FEATURED) ? ' active' : ''}" data-favorite="${i}" aria-pressed="${favoriteKey(team) === favoriteKey(FEATURED)}">${teamBadge(team.name)}<span>${esc(team.name)}</span></button>`).join('')
    + '</div><button class="btn btn-quiet" id="chooseTeam">＋ Elegir equipo</button>';
  bar.querySelectorAll('[data-favorite]').forEach(btn => btn.addEventListener('click', () => selectFavorite(favorites[+btn.dataset.favorite])));
  bar.querySelector('#chooseTeam').addEventListener('click', openTeamPicker);
  host.appendChild(bar);
}

export function openTeamPicker() {
  const catalog = allTeams();
  const host = showDialog('Tus equipos', '<p class="dialog-intro">Busca un equipo y guárdalo para seguir sus jornadas.</p>'
    + '<label class="field-label" for="favoriteSearch">Nombre del equipo</label><input type="search" id="favoriteSearch" class="search-input" placeholder="Por ejemplo, Las Mesas" autocomplete="off">'
    + '<div class="picker-filters"><label>Categoría<select id="favoriteCategory"><option value="">Todas</option><option value="benjamin">Benjamín</option><option value="prebenjamin">Prebenjamín</option></select></label>'
    + '<label>Isla<select id="favoriteIsland"><option value="">Todas</option><option value="grancanaria">Gran Canaria</option><option value="lanzarote">Lanzarote</option><option value="fuerteventura">Fuerteventura</option></select></label></div>'
    + '<div id="savedFavorites"></div><div id="favoriteResults" class="picker-results" aria-live="polite"></div>');
  const search = host.querySelector('#favoriteSearch');
  function render() {
    const query = normalizeTeamName(search.value);
    const cat = host.querySelector('#favoriteCategory').value;
    const island = host.querySelector('#favoriteIsland').value;
    const saved = host.querySelector('#savedFavorites');
    saved.innerHTML = '<div class="eyebrow">Guardados</div><div class="saved-favorites">' + favorites.map((team, i) =>
      `<div class="saved-favorite"><span>${esc(team.name)}</span><button class="icon-button" data-remove="${i}" aria-label="Quitar ${escapeAttr(team.name)} de favoritos" ${favorites.length === 1 ? 'disabled' : ''}>×</button></div>`).join('') + '</div>';
    saved.querySelectorAll('[data-remove]').forEach(button => button.addEventListener('click', () => {
      const removed = favorites.splice(+button.dataset.remove, 1)[0];
      if (favoriteKey(removed) === favoriteKey(FEATURED)) Object.assign(FEATURED, favorites[0]);
      save(); render(); document.dispatchEvent(new CustomEvent('favoritesupdated'));
    }));
    const matches = catalog.filter(team => (!cat || team.cat === cat) && (!island || team.island === island)
      && (!query || normalizeTeamName(team.name).includes(query)));
    const results = host.querySelector('#favoriteResults');
    results.innerHTML = `<p class="result-count">${matches.length} equipos y grupos · ${getCurrentSeason().replace('-', '/')}</p>`
      + matches.slice(0, 80).map((team, i) => `<button class="picker-team" data-result="${i}">${teamBadge(team.name)}<span><strong>${esc(team.name)}</strong><small>${team.cat === 'benjamin' ? 'Benjamín' : 'Prebenjamín'} · ${esc(team.phase)} · ${esc(team.groupName)}</small></span><span aria-hidden="true">＋</span></button>`).join('')
      + (!matches.length ? '<p class="me-empty">No encontramos ese equipo. Prueba con otro nombre o categoría.</p>' : matches.length > 80 ? '<p class="me-empty">Escribe un nombre para acotar la búsqueda.</p>' : '');
    results.querySelectorAll('[data-result]').forEach(button => button.addEventListener('click', () => {
      const team = matches[+button.dataset.result];
      closeModal(); selectFavorite(team);
    }));
  }
  search.addEventListener('input', render);
  host.querySelectorAll('select').forEach(select => select.addEventListener('change', render));
  render(); search.focus();
}
