import { S, $, $$, el, isHistorical, ensureSeasonData } from './state.js';
import { renderSection, renderClasif, renderJornadas, renderGoleadores, renderIsla, renderStats, updateSearchCount } from './render.js';
import { countStats } from './state.js';

/* ====== INIT ====== */
document.addEventListener('DOMContentLoaded', async () => {
  // Apply saved theme
  if (localStorage.getItem('theme') === 'light') {
    document.documentElement.setAttribute('data-theme', 'light');
    const t = document.getElementById('themeToggle');
    if (t) t.textContent = '☀️';
  }
  // Restore saved season
  const savedSeason = localStorage.getItem('season') || '';
  S.season = savedSeason;
  // Restore saved category
  const savedCat = localStorage.getItem('cat') || '';
  if (savedCat === 'benjamin' || savedCat === 'prebenjamin') {
    S.cat = savedCat;
    $$('.cat-btn').forEach(b => b.classList.toggle('active', b.dataset.cat === S.cat));
  }
  // Load historical season data if restoring a past season
  if (savedSeason) await ensureSeasonData(savedSeason);
  buildSeasonSelector();
  updateSeasonUI();
  updateStats();
  renderSection();
  bindEvents();
});

export function buildSeasonSelector() {
  if (typeof SEASONS === 'undefined' || SEASONS.length <= 1) return;
  const container = $('#seasonSelector');
  if (!container) return;

  const select = document.createElement('select');
  select.id = 'seasonSelect';
  SEASONS.forEach(s => {
    const opt = document.createElement('option');
    opt.value = s.current ? '' : s.name;
    const label = s.name.replace('-', '/');
    opt.textContent = s.current ? `${label} (actual)` : label;
    select.appendChild(opt);
  });
  container.appendChild(select);

  select.addEventListener('change', async () => {
    S.season = select.value;
    localStorage.setItem('season', S.season);
    // When switching to historical, if on goleadores tab force to clasif
    if (isHistorical() && S.section === 'goleadores') {
      S.section = 'clasif';
      $$('.section-tab').forEach(t => t.classList.toggle('active', t.dataset.section === 'clasif'));
    }
    updateSeasonUI();
    await ensureSeasonData(S.season);
    updateStats();
    renderSection();
  });

  // Restore saved value in the select
  if (S.season) select.value = S.season;
}

export function updateSeasonUI() {
  const hist = isHistorical();
  const label = $('#seasonLabel');
  if (label) {
    const display = S.season ? S.season.replace('-', '/') : '2025/2026';
    label.textContent = `Temporada ${display}`;
  }
  // Disable tabs that have no data for historical seasons
  $$('.section-tab').forEach(tab => {
    const disable = hist && tab.dataset.section === 'goleadores';
    tab.classList.toggle('disabled', disable);
    tab.disabled = disable;
  });
}

export function bindEvents() {
  // Scroll to top button
  const scrollBtn = $('#scrollTop');
  if (scrollBtn) {
    window.addEventListener('scroll', () => {
      scrollBtn.classList.toggle('visible', window.scrollY > 400);
    });
  }
  // Category toggle
  $$('.cat-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      S.cat = btn.dataset.cat;
      localStorage.setItem('cat', S.cat);
      $$('.cat-btn').forEach(b => b.classList.toggle('active', b === btn));
      S.jorGroup = S.cat === 'benjamin' ? 'A2' : 'PG2';
      S.jorNum = '';
      S.golGroup = '__GLOBAL__';
      S.island = 'grancanaria';
      updateStats();
      renderSection();
    });
  });
  // Section tabs
  $$('.section-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      S.section = tab.dataset.section;
      if (S.section === 'jornadas') S.jorNum = '';
      $$('.section-tab').forEach(t => t.classList.toggle('active', t === tab));
      window.scrollTo({ top: 0, behavior: 'smooth' });
      renderSection();
    });
  });
  // Search removed
  // Theme toggle
  const themeToggle = $('#themeToggle');
  if (themeToggle) {
    themeToggle.addEventListener('click', () => {
      const isLight = document.documentElement.getAttribute('data-theme') === 'light';
      if (isLight) {
        document.documentElement.removeAttribute('data-theme');
        themeToggle.textContent = '🌙';
        localStorage.setItem('theme', 'dark');
      } else {
        document.documentElement.setAttribute('data-theme', 'light');
        themeToggle.textContent = '☀️';
        localStorage.setItem('theme', 'light');
      }
    });
  }
}

export function updateStats() {
  const st = countStats();
  $('#statGroups').textContent = st.groups;
  $('#statTeams').textContent = st.teams;
  $('#statMatches').textContent = st.matches;
}
