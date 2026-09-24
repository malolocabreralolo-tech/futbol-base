import { S, FEATURED, $, $$, isHistorical, ensureSeasonData, getCurrentSeason, getData, countStats } from './state.js';
import { renderSection } from './render.js';
import { restoreFavorites, selectFavorite, allTeams } from './favorites.js';
import { readRoute, syncRoute, setReadingRoute, matchId, notify } from './links.js';
import { closeModal, openMatchDetail, openTeamDetail } from './modals.js';
import { loadHealth, openDataInfo } from './health.js';
import { PORTAL } from './config.js';

let navigationToken = 0;
function saved(key) { try { return localStorage.getItem(key); } catch { return null; } }
function remember(key, value) { try { localStorage.setItem(key, value); } catch { /* usable without storage */ } }

function syncThemeColor() {
  const light = document.documentElement.getAttribute('data-theme') === 'light';
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', light ? '#f4f6f8' : '#0b111d');
  const toggle = $('#themeToggle');
  if (toggle) { toggle.textContent = light ? '☀️' : '🌙'; toggle.setAttribute('aria-label', light ? 'Activar tema oscuro' : 'Activar tema claro'); }
}

function useCurrentSeason() {
  S.season = '';
  S.cat = FEATURED.cat;
  S.jorGroup = FEATURED.groupId;
  S.search = ''; S.filterIsland = ''; S.filterPhase = '';
  remember('season', '');
  const select = $('#seasonSelect');
  if (select) select.value = '';
}

function syncControls() {
  $$('.cat-btn').forEach(button => {
    const active = button.dataset.cat === S.cat;
    button.classList.toggle('active', active);
    button.setAttribute('aria-pressed', String(active));
  });
  $$('.section-tab').forEach(tab => {
    const active = tab.dataset.section === S.section;
    tab.classList.toggle('active', active);
    if (active) tab.setAttribute('aria-current', 'page');
    else tab.removeAttribute('aria-current');
  });
  const select = $('#seasonSelect');
  if (select) select.value = S.season;
  updateSeasonUI();
}

async function showSection(scroll = true) {
  const token = ++navigationToken;
  if (S.section === 'miequipo') useCurrentSeason();
  if (isHistorical() && S.section === 'goleadores') S.section = 'clasif';
  syncControls();
  const main = document.querySelector('main');
  if (S.season) {
    main.setAttribute('aria-busy', 'true');
    main.classList.add('season-loading');
    await ensureSeasonData(S.season);
    if (token !== navigationToken) return false;
  }
  main.classList.remove('season-loading');
  main.removeAttribute('aria-busy');
  updateStats(); renderSection();
  if (scroll) window.scrollTo({ top: 0, behavior: 'instant' });
  return true;
}

async function applyLocation(initial = false) {
  setReadingRoute(true);
  closeModal();
  const route = readRoute(location.hash);
  const hasRoute = location.hash.includes('section=');
  if (hasRoute) {
    S.section = route.section;
    S.cat = route.cat;
    const current = typeof SEASONS !== 'undefined' ? SEASONS.find(season => season.current)?.name : PORTAL.season;
    S.season = route.season && route.season !== current ? route.season : '';
    S.jorGroup = route.group;
    S.jorNum = route.round;
    S.search = route.search; S.filterIsland = route.island; S.filterPhase = route.phase;
    if (S.section === 'isla') S.island = route.island || 'grancanaria';
    if (S.section === 'miequipo' && route.team) {
      const team = allTeams().find(item => item.name === route.team && item.cat === route.cat && (!route.group || item.groupId === route.group));
      if (team) selectFavorite(team, false);
    }
  } else if (initial) {
    S.section = 'miequipo';
    S.cat = FEATURED.cat;
  }
  try {
    if (!await showSection(false)) return;
    if (hasRoute && S.section !== 'miequipo' && route.team) {
      const group = getData().find(item => item.id === route.group);
      if (group?.standings.some(row => row[1] === route.team)) openTeamDetail(route.team, route.group);
      else notify('Ese equipo no figura en el grupo seleccionado.');
    }
    if (hasRoute && route.match) {
      const group = getData().find(item => item.id === route.group);
      const source = isHistorical() ? group?.jornadas : (typeof HISTORY !== 'undefined' ? HISTORY[route.group] : null) || group?.jornadas;
      let found;
      for (const [round, rows] of Object.entries(source || {})) {
        for (const row of rows) {
          const match = { home: row[1], away: row[2], hs: row[3], as: row[4], date: row[0], time: row[6], venue: row[7], jornada: round, groupId: route.group };
          if (matchId(match) === route.match) found = match;
        }
      }
      if (!found && group?.matches) {
        for (const row of group.matches) {
          const match = { date: row[0], time: row[1], home: row[2], away: row[3], hs: row[4], as: row[5], venue: row[6], jornada: group.jornada, groupId: group.id };
          if (matchId(match) === route.match) found = match;
        }
      }
      if (found) openMatchDetail(found);
      else notify('No encontramos ese partido en los datos disponibles.');
    }
  } finally { setReadingRoute(false); }
  if (!hasRoute) syncRoute({}, true);
}

document.addEventListener('DOMContentLoaded', async () => {
  if (saved('theme') === 'light') document.documentElement.setAttribute('data-theme', 'light');
  syncThemeColor(); restoreFavorites();
  buildSeasonSelector();
  await applyLocation(true);
  bindEvents();
  loadHealth();
});

export function buildSeasonSelector() {
  if (typeof SEASONS === 'undefined' || !SEASONS.length) return;
  const container = $('#seasonSelector');
  if (!container) return;
  container.innerHTML = '';
  const select = document.createElement('select');
  select.id = 'seasonSelect';
  select.setAttribute('aria-label', 'Temporada');
  SEASONS.forEach(season => {
    const option = document.createElement('option');
    option.value = season.current ? '' : season.name;
    option.textContent = season.name.replace('-', '/') + (season.current ? ' · disponible' : ' · archivo');
    select.appendChild(option);
  });
  container.appendChild(select);
  select.addEventListener('change', async () => {
    S.season = select.value;
    S.jorNum = ''; S.search = ''; S.filterIsland = ''; S.filterPhase = '';
    remember('season', S.season);
    if (await showSection()) syncRoute();
  });
}

export function updateSeasonUI() {
  const label = $('#seasonLabel');
  if (label) label.textContent = 'Temporada ' + getCurrentSeason().replace('-', '/');
  $$('.section-tab').forEach(tab => {
    const disabled = isHistorical() && tab.dataset.section === 'goleadores';
    tab.classList.toggle('disabled', disabled);
    tab.disabled = disabled;
    if (disabled) tab.title = 'Los goleadores individuales no están disponibles en este archivo';
    else tab.removeAttribute('title');
  });
}

export function bindEvents() {
  const scrollBtn = $('#scrollTop');
  if (scrollBtn) window.addEventListener('scroll', () => scrollBtn.classList.toggle('visible', window.scrollY > 400), { passive: true });
  $$('.cat-btn').forEach(button => button.addEventListener('click', async () => {
    S.cat = button.dataset.cat;
    remember('cat', S.cat);
    S.jorGroup = S.cat === FEATURED.cat ? FEATURED.groupId : '';
    S.jorNum = ''; S.golGroup = '__GLOBAL__'; S.filterPhase = '';
    if (await showSection(false)) syncRoute();
  }));
  $$('.section-tab').forEach(tab => tab.addEventListener('click', async () => {
    if (tab.disabled) return;
    S.section = tab.dataset.section;
    if (S.section === 'jornadas') S.jorNum = '';
    if (await showSection()) syncRoute();
  }));
  $('#themeToggle')?.addEventListener('click', () => {
    const light = document.documentElement.getAttribute('data-theme') === 'light';
    if (light) document.documentElement.removeAttribute('data-theme');
    else document.documentElement.setAttribute('data-theme', 'light');
    remember('theme', light ? 'dark' : 'light'); syncThemeColor();
  });
  document.addEventListener('favoritechange', async () => {
    S.section = 'miequipo'; S.search = ''; S.filterIsland = ''; S.filterPhase = '';
    if (await showSection()) syncRoute();
  });
  document.addEventListener('favoritesupdated', () => {
    if (S.section === 'miequipo') { useCurrentSeason(); syncControls(); renderSection(); syncRoute({}, true); }
  });
  document.querySelector('[data-open-health]')?.addEventListener('click', openDataInfo);
  let replayTimer;
  const scheduleReplay = () => { clearTimeout(replayTimer); replayTimer = setTimeout(() => applyLocation(), 0); };
  window.addEventListener('popstate', scheduleReplay);
  window.addEventListener('hashchange', scheduleReplay);
}

export function updateStats() {
  const counts = countStats();
  $('#statGroups').textContent = counts.groups;
  $('#statTeams').textContent = counts.teams;
  $('#statMatches').textContent = counts.matches;
}
