/* ====== APP STATE ====== */
const S = {
  cat: 'benjamin',      // 'benjamin' | 'prebenjamin'
  section: 'clasif',    // 'clasif' | 'jornadas' | 'goleadores' | 'isla'
  season: '',           // '' = current season, or '2024-2025' etc.
  search: '',  // unused, kept for compat
  // Jornadas
  jorGroup: 'A2',
  jorNum: '',
  // Goleadores
  golGroup: '__GLOBAL__',
  // Isla
  island: 'grancanaria'
};

/* ====== HELPERS ====== */
function $(sel, ctx) { return (ctx||document).querySelector(sel); }
function $$(sel, ctx) { return Array.from((ctx||document).querySelectorAll(sel)); }
function el(tag, cls, html) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (html !== undefined) e.innerHTML = html;
  return e;
}

/* Team badge — real shield from SHIELDS or fallback to initials */
function teamBadgeFallback(name) {
  const words = name.replace(/[^a-zA-ZáéíóúñÁÉÍÓÚÑüÜ\s]/g, '').trim().split(/\s+/);
  let initials;
  if (words.length === 1) initials = words[0].substring(0, 2).toUpperCase();
  else initials = words.slice(0, 3).map(w => w[0]).join('').toUpperCase();
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
  const hue = Math.abs(hash) % 360;
  return `<span class="team-badge" style="background:hsl(${hue},55%,45%)">${initials}</span>`;
}
function normalizeTeamName(s) {
  return s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/['".,‘’“”]/g, '').replace(/\b(CF|UD|CD|AD|SD|AFC|SC|CP|CE|CEF|SSD|ATLETICO|ATL)\b/gi, '').toLowerCase().trim().replace(/\s+/g, ' ');
}

let _shieldsNorm = null;
function getShieldsNorm() {
  if (_shieldsNorm) return _shieldsNorm;
  if (typeof SHIELDS === 'undefined') return (_shieldsNorm = {});
  _shieldsNorm = {};
  Object.keys(SHIELDS).forEach(k => {
    const norm = normalizeTeamName(k);
    if (norm && !_shieldsNorm[norm]) _shieldsNorm[norm] = SHIELDS[k];
  });
  return _shieldsNorm;
}

function teamBadge(name) {
  if (typeof SHIELDS !== 'undefined') {
    // 1. Exact match
    if (SHIELDS[name]) {
      return '<img class="team-badge" src="./escudos/' + SHIELDS[name] + '" alt="' + name + '" onerror="this.outerHTML=teamBadgeFallback(this.alt)">';
    }
    // 2. Normalized match (strip diacritics + common suffixes)
    const norm = normalizeTeamName(name);
    const shNorm = getShieldsNorm();
    if (norm && shNorm[norm]) {
      return '<img class="team-badge" src="./escudos/' + shNorm[norm] + '" alt="' + name + '" onerror="this.outerHTML=teamBadgeFallback(this.alt)">';
    }
    // 3. Substring match (short name inside long key, using normalized forms)
    if (norm.length >= 4) {
      const found = Object.keys(SHIELDS).find(k => {
        const kn = normalizeTeamName(k);
        return kn.length >= 4 && (kn.includes(norm) || norm.includes(kn));
      });
      if (found) {
        return '<img class="team-badge" src="./escudos/' + SHIELDS[found] + '" alt="' + name + '" onerror="this.outerHTML=teamBadgeFallback(this.alt)">';
      }
    }
  }
  return teamBadgeFallback(name);
}

/* Get last N results for a team from HISTORY */
function getTeamForm(teamName, groupId, n) {
  n = n || 5;
  var jornadas = null;
  if (isHistorical()) {
    var group = getData().find(function(g){return g.id === groupId;});
    if (group && group.jornadas) jornadas = group.jornadas;
  } else {
    if (typeof HISTORY === 'undefined' || !HISTORY[groupId]) return [];
    jornadas = HISTORY[groupId];
  }
  if (!jornadas) return [];
  var all = [];
  Object.entries(jornadas).forEach(function(entry) {
    var jorKey = entry[0], matches = entry[1];
    var jorNum = parseInt(jorKey);
    matches.forEach(function(m) {
      var date = m[0], home = m[1], away = m[2], hs = m[3], as_ = m[4];
      if (hs === null || hs === undefined || as_ === null || as_ === undefined) return;
      if (home !== teamName && away !== teamName) return;
      var isHome = home === teamName;
      var gf = isHome ? hs : as_, gc = isHome ? as_ : hs;
      all.push({ jorNum: jorNum, date: date, result: gf > gc ? 'W' : gf < gc ? 'L' : 'D' });
    });
  });
  all.sort(function(a,b){return a.jorNum - b.jorNum || a.date.localeCompare(b.date);});
  return all.slice(-n);
}

function getData() {
  if (S.season && typeof SEASONS !== 'undefined') {
    const hist = SEASONS.find(s => s.name === S.season && !s.current);
    if (hist) return (S.cat === 'benjamin' ? hist.benjamin : hist.prebenjamin) || [];
  }
  return S.cat === 'benjamin' ? BENJAMIN : PREBENJAMIN;
}

function isHistorical() {
  return !!S.season;
}

function getPhases() {
  const data = getData();
  const map = {};
  data.forEach(g => {
    if (!map[g.phase]) map[g.phase] = [];
    map[g.phase].push(g);
  });
  return map;
}

function countStats() {
  const data = getData();
  const groups = data.length;
  let teams = 0, matches = 0;
  data.forEach(g => {
    teams += g.standings.length;
    if (g.matches) {
      matches += g.matches.length;
    } else if (g.jornadas) {
      Object.values(g.jornadas).forEach(function(jor) { matches += jor.length; });
    }
  });
  // Add history matches for benjamin (current season only)
  if (!isHistorical() && S.cat === 'benjamin' && typeof HIST_MATCHES !== 'undefined') {
    matches = HIST_MATCHES;
  }
  return { groups, teams, matches };
}

/* ====== INIT ====== */
document.addEventListener('DOMContentLoaded', () => {
  // Apply saved theme
  if (localStorage.getItem('theme') === 'light') {
    document.documentElement.setAttribute('data-theme', 'light');
    const t = document.getElementById('themeToggle');
    if (t) t.textContent = '☀️';
  }
  // Restore saved season
  const savedSeason = localStorage.getItem('season') || '';
  S.season = savedSeason;
  buildSeasonSelector();
  updateStats();
  renderSection();
  bindEvents();
});

function buildSeasonSelector() {
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

  select.addEventListener('change', () => {
    S.season = select.value;
    localStorage.setItem('season', S.season);
    // When switching to historical, if on goleadores tab force to clasif
    if (isHistorical() && S.section === 'goleadores') {
      S.section = 'clasif';
      $$('.section-tab').forEach(t => t.classList.toggle('active', t.dataset.section === 'clasif'));
    }
    updateSeasonUI();
    updateStats();
    renderSection();
  });

  // Restore saved value in the select
  if (S.season) select.value = S.season;
}

function updateSeasonUI() {
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

function bindEvents() {
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

function updateStats() {
  const st = countStats();
  $('#statGroups').textContent = st.groups;
  $('#statTeams').textContent = st.teams;
  $('#statMatches').textContent = st.matches;
}

/* ====== RENDER ROUTER ====== */
function renderSection() {
  $$('.section').forEach(s => s.classList.remove('active'));
  const sec = S.section;
  $(`#sec-${sec}`).classList.add('active');

  if (sec === 'clasif') renderClasif();
  else if (sec === 'jornadas') renderJornadas();
  else if (sec === 'goleadores') renderGoleadores();
  else if (sec === 'isla') renderIsla();
  else if (sec === 'stats') renderStats();
}

/* ====== CLASIFICACIONES ====== */
function renderClasif() {
  const container = $('#sec-clasif');
  container.innerHTML = '';

  if (isHistorical()) {
    const data = getData();
    if (!data.length) {
      container.innerHTML = '<div class="empty-state"><div class="empty-icon">📁</div><p>No hay datos disponibles para esta categoría en la temporada ' + S.season.replace('-', '/') + '</p></div>';
      return;
    }
    const banner = el('div', 'historical-banner', '📋 Datos históricos · Temporada ' + S.season.replace('-', '/') + ' · Sin goleadores individuales');
    container.appendChild(banner);
  }

  const phases = getPhases();
  const phaseIcons = {
    'Segunda Fase A': '🏆', 'Segunda Fase B': '🥈', 'Segunda Fase C': '🥉',
    'Lanzarote': '🌋', 'Fuerteventura': '🏝️',
    'Gran Canaria': '🏔️',
    'Primera Fase GC': '🏟️',
    'Primera Fase': '🏟️',
  };

  const defaultGroup = S.jorGroup || (S.cat === 'benjamin' ? 'A2' : 'PG2');
  Object.entries(phases).forEach(([phase, groups]) => {
    const filteredGroups = filterGroups(groups);
    const hdr = el('div', 'phase-header', `<span class="phase-icon">${phaseIcons[phase]||'⚽'}</span> ${phase}`);
    container.appendChild(hdr);

    groups.forEach(g => {
      const forceOpen = (g.id === defaultGroup);
      container.appendChild(buildGroupCard(g, forceOpen));
    });
  });

  if (!container.children.length) {
    container.innerHTML = '<div class="empty-state"><div class="empty-icon">🔍</div><p>No se encontraron equipos</p></div>';
  }

  // Event delegation: click on team name in standings → open team profile
  container.onclick = e => {
    const td = e.target.closest('.team-name-cell');
    if (td) openTeamDetail(td.textContent.trim(), td.dataset.group);
  };
}

function filterGroups(groups) {
  if (!S.search) return groups;
  return groups.filter(g =>
    g.standings.some(row => row[1].toLowerCase().includes(S.search))
  );
}

function buildGroupCard(g, forceOpen) {
  const card = el('div', forceOpen ? 'group-card open' : 'group-card');
  const teamCount = g.standings.length;
  card.innerHTML = `
    <div class="group-header">
      <div class="group-title">
        ${g.name} <span class="group-badge">${teamCount} equipos</span>${g.jornada ? ` <span class="jornada-badge">${g.jornada}</span>` : ''}
      </div>
      <span class="group-chevron">▾</span>
    </div>
    <div class="group-body">
      ${buildStandingsTable(g.standings, g.id)}
    </div>
  `;
  card.querySelector('.group-header').addEventListener('click', () => {
    card.classList.toggle('open');
  });
  return card;
}

function buildStandingsTable(standings, groupId) {
  // Check if data has GF/GC/DF (row[7] exists and is not null)
  const hasGoalData = standings.length > 0 && standings[0].length > 7 && standings[0][7] != null;
  const hist = isHistorical();
  const histHasJornadas = hist && getData().some(function(g){ return g.jornadas && Object.keys(g.jornadas).length > 0; });
  const showForm = !hist || histHasJornadas;

  let html = '<div class="table-wrap"><table class="standings-table"><thead><tr>';
  html += '<th>#</th><th>Equipo</th>';
  if (showForm) html += '<th>F</th>';
  html += '<th>PTS</th><th>J</th><th>G</th><th>E</th><th>P</th>';
  if (hasGoalData) html += '<th>GF</th><th>GC</th><th>DF</th>';
  html += '</tr></thead><tbody>';
  standings.forEach(row => {
    // row: [pos, team, pts, j, g, e, p, gf, gc, df]
    const pos = row[0];
    const cls = pos <= 3 ? `pos-${pos}` : '';
    html += `<tr class="${cls}">`;
    html += `<td>${pos}</td>`;
    html += `<td class="team-name-cell" data-group="${groupId}">${teamBadge(row[1])} ${row[1]}</td>`;
    if (showForm) {
      // Form column
      const form = getTeamForm(row[1], groupId);
      html += '<td class="form-col">';
      if (form.length) {
        html += '<div class="form-mini">';
        form.forEach(f => { html += `<span class="form-dot ${f.result}">${f.result}</span>`; });
        html += '</div>';
      } else { html += '-'; }
      html += '</td>';
    }
    html += `<td class="pts-col">${row[2]}</td>`;
    html += `<td>${row[3]}</td><td>${row[4]}</td><td>${row[5]}</td><td>${row[6]}</td>`;
    if (hasGoalData) {
      const df = row[9];
      const dfCls = df > 0 ? 'df-pos' : (df < 0 ? 'df-neg' : '');
      const dfStr = df > 0 ? `+${df}` : df;
      html += `<td>${row[7]}</td><td>${row[8]}</td>`;
      html += `<td class="${dfCls}">${dfStr}</td>`;
    }
    html += '</tr>';
  });
  html += '</tbody></table></div>';
  return html;
}

/* ====== JORNADAS ====== */
function renderJornadas() {
  const container = $('#sec-jornadas');
  container.innerHTML = '';

  const data = getData();
  
  // Group selector
  const selectorRow = el('div', 'selector-row');
  const selectWrap = el('div', 'custom-select');
  const select = document.createElement('select');
  select.id = 'jorGroupSelect';
  
  const defaultOpt = document.createElement('option');
  defaultOpt.value = '';
  defaultOpt.textContent = '-- Selecciona un grupo --';
  select.appendChild(defaultOpt);
  
  data.forEach(g => {
    const opt = document.createElement('option');
    opt.value = g.id;
    opt.textContent = `${g.phase} - ${g.name}`;
    select.appendChild(opt);
  });
  
  selectWrap.appendChild(select);
  selectorRow.appendChild(selectWrap);


  container.appendChild(selectorRow);

  const pillsDiv = el('div', 'jornada-pills');
  pillsDiv.id = 'jornadaPills';
  container.appendChild(pillsDiv);

  const matchesDiv = el('div', '');
  matchesDiv.id = 'jornadaMatches';
  container.appendChild(matchesDiv);

  // Default: pick first group if not set
  if (!S.jorGroup && data.length > 0) {
    S.jorGroup = data[0].id;
  }
  if (S.jorGroup) {
    select.value = S.jorGroup;
    renderJornadaContent();
  }

  select.addEventListener('change', () => {
    S.jorGroup = select.value;
    S.jorNum = '';
    renderJornadaContent();
  });
}

function renderJornadaContent() {
  const pillsDiv = $('#jornadaPills');
  const matchesDiv = $('#jornadaMatches');
  if (!pillsDiv || !matchesDiv) return;
  pillsDiv.innerHTML = '';
  matchesDiv.innerHTML = '';

  if (!S.jorGroup) return;

  const group = getData().find(g => g.id === S.jorGroup);
  if (!group) return;

  // HISTORICAL PATH
  if (isHistorical() && group.jornadas && Object.keys(group.jornadas).length > 0) {
    var jorNums = Object.keys(group.jornadas).map(Number).sort(function(a,b){return a-b;});
    if (!S.jorNum || !jorNums.includes(Number(S.jorNum))) {
      var lastPlayed = jorNums[jorNums.length - 1];
      for (var i = jorNums.length - 1; i >= 0; i--) {
        var ms = group.jornadas[jorNums[i]] || [];
        if (ms.some(function(m){return m[3] !== null && m[3] !== undefined;})) {
          lastPlayed = jorNums[i]; break;
        }
      }
      S.jorNum = String(lastPlayed);
    }
    jorNums.forEach(function(num) {
      var key = String(num);
      var pill = el('button', 'jornada-pill' + (key === S.jorNum ? ' active' : ''), 'J' + num);
      pill.addEventListener('click', (function(n, k) {
        return function() {
          S.jorNum = k;
          $$('.jornada-pill').forEach(function(p){p.classList.remove('active');});
          pill.classList.add('active');
          renderMatchCards(matchesDiv, getHistoricalJornadaMatches(group, n), 'history');
        };
      })(num, key));
      pillsDiv.appendChild(pill);
    });
    setTimeout(function() {
      var active = pillsDiv.querySelector('.active');
      if (active) active.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
    }, 50);
    renderMatchCards(matchesDiv, getHistoricalJornadaMatches(group, Number(S.jorNum)), 'history');
    return;
  }
  // END HISTORICAL PATH

  // Use HISTORY data if available for this group (Benjamin and Prebenjamín)
  if (typeof HISTORY !== 'undefined' && HISTORY[S.jorGroup]) {
    const hist = HISTORY[S.jorGroup];
    const jornadas = Object.keys(hist).sort((a, b) => {
      const na = parseInt(a.replace(/\D/g, ''));
      const nb = parseInt(b.replace(/\D/g, ''));
      return na - nb;
    });

    if (jornadas.length === 0) {
      matchesDiv.innerHTML = '<div class="empty-state"><div class="empty-icon">📋</div><p>No hay jornadas disponibles</p></div>';
      return;
    }

    // Default to last jornada with actual results (scores), or last if none played yet
    if (!S.jorNum || !jornadas.includes(S.jorNum)) {
      let lastPlayed = jornadas[jornadas.length - 1];
      for (let i = jornadas.length - 1; i >= 0; i--) {
        const ms = hist[jornadas[i]] || [];
        if (ms.some(m => m[3] !== null && m[3] !== undefined)) {
          lastPlayed = jornadas[i];
          break;
        }
      }
      S.jorNum = lastPlayed;
    }

    // Also add current matchday as extra if not in history
    const currentJor = group.jornada;
    let hasCurrentInHistory = jornadas.includes(currentJor);

    jornadas.forEach(j => {
      const pill = el('button', `jornada-pill${j === S.jorNum ? ' active' : ''}`, j.replace('Jornada ', 'J'));
      pill.addEventListener('click', () => {
        S.jorNum = j;
        $$('.jornada-pill').forEach(p => p.classList.remove('active'));
        pill.classList.add('active');
        renderMatchCards(matchesDiv, getJornadaMatches(j), 'history');
      });
      pillsDiv.appendChild(pill);
    });

    // If current matchday not in history, add it
    if (!hasCurrentInHistory && currentJor) {
      const pill = el('button', `jornada-pill${currentJor === S.jorNum ? ' active' : ''}`, currentJor.replace('Jornada ', 'J') + ' ★');
      pill.addEventListener('click', () => {
        S.jorNum = currentJor;
        $$('.jornada-pill').forEach(p => p.classList.remove('active'));
        pill.classList.add('active');
        renderMatchCards(matchesDiv, group.matches.map(m => ({
          date: m[0], time: m[1], home: m[2], away: m[3], hs: m[4], as: m[5], venue: m[6] || null
        })), 'current');
      });
      pillsDiv.appendChild(pill);
      // Default to current matchday
      if (!jornadas.includes(S.jorNum)) S.jorNum = currentJor;
    }

    // Scroll to active pill
    setTimeout(() => {
      const active = pillsDiv.querySelector('.active');
      if (active) active.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
    }, 50);

    // Render matches for selected jornada
    if (S.jorNum === currentJor) {
      // Use group.matches for current jornada (has venue data)
      renderMatchCards(matchesDiv, group.matches.map(m => ({
        date: m[0], time: m[1], home: m[2], away: m[3], hs: m[4], as: m[5], venue: m[6] || null
      })), 'current');
    } else {
      renderMatchCards(matchesDiv, getJornadaMatches(S.jorNum), 'history');
    }
  } else {
    // Prebenjamín: only current matchday
    if (group.jornada) {
      const pill = el('button', 'jornada-pill active', group.jornada.replace('Jornada ', 'J'));
      pillsDiv.appendChild(pill);
    }
    
    if (group.matches.length > 0) {
      renderMatchCards(matchesDiv, group.matches.map(m => ({
        date: m[0], time: m[1], home: m[2], away: m[3], hs: m[4], as: m[5], venue: m[6] || null
      })), 'current');
    } else {
      matchesDiv.innerHTML = '<div class="empty-state"><div class="empty-icon">📋</div><p>No hay partidos disponibles</p></div>';
    }
  }
}

function getJornadaMatches(jorName) {
  if (!HISTORY[S.jorGroup] || !HISTORY[S.jorGroup][jorName]) return [];
  return HISTORY[S.jorGroup][jorName].map(m => ({
    date: m[0], home: m[1], away: m[2], hs: m[3], as: m[4]
  }));
}

function getHistoricalJornadaMatches(group, jorNum) {
  if (!group || !group.jornadas || !group.jornadas[jorNum]) return [];
  return group.jornadas[jorNum].map(function(m) {
    return { date: m[0], home: m[1], away: m[2], hs: m[3], as: m[4] };
  });
}

function renderMatchCards(container, matches, type) {
  container.innerHTML = '';
  if (matches.length === 0) {
    container.innerHTML = '<div class="empty-state"><div class="empty-icon">⚽</div><p>No hay partidos en esta jornada</p></div>';
    return;
  }
  const grid = el('div', 'match-grid');
  matches.forEach(m => {
    const hasScore = m.hs !== null && m.hs !== undefined && m.as !== null && m.as !== undefined;
    const card = el('div', `match-card ${hasScore ? 'completed' : 'upcoming'}`);
    
    let scoreHtml;
    if (hasScore) {
      scoreHtml = `<span class="score-num">${m.hs}</span><span class="score-sep">-</span><span class="score-num">${m.as}</span>`;
    } else {
      const timeTag = m.time ? `<span class="match-time-tag">${m.time}</span>` : '';
      scoreHtml = `<span class="score-vs">VS</span>${timeTag}`;
    }

    let dateStr = m.date || '';
    // Format date nicely
    if (type === 'history' && dateStr.includes('-')) {
      // Format: 2025-11-28
      const parts = dateStr.split('-');
      dateStr = `${parts[2]}/${parts[1]}/${parts[0]}`;
    } else if (type === 'current' && m.time) {
      dateStr = `${m.date} · ${m.time}`;
    }

    const detailKey = `${m.home}|${m.away}|${m.hs}-${m.as}`;
    const hasDetail = hasScore
      && typeof MATCH_DETAIL !== 'undefined'
      && MATCH_DETAIL[detailKey]?.g?.length > 0;

    const venueHtml = m.venue ? `<div class="match-venue">📍 ${m.venue}</div>` : '';
    card.innerHTML = `
      <div class="match-teams">
        <div class="match-team home">${m.home} ${teamBadge(m.home)}</div>
        <div class="match-score">${scoreHtml}</div>
        <div class="match-team away">${teamBadge(m.away)} ${m.away}</div>
      </div>
      <div class="match-date">${dateStr}${hasDetail ? ' <span class="detail-badge" title="Ver cronología de goles">⚽</span>' : ''}</div>
      ${venueHtml}
    `;

    // Click handler for completed matches
    if (hasScore) {
      card.addEventListener('click', () => {
        openMatchDetail({
          home: m.home,
          away: m.away,
          hs: m.hs,
          as: m.as,
          date: dateStr,
          jornada: S.jorNum || '',
          groupId: S.jorGroup,
          venue: m.venue || null
        });
      });
    }

    // Team name clicks → open team profile (stop propagation so match modal doesn't open)
    const homeEl = card.querySelector('.match-team.home');
    const awayEl = card.querySelector('.match-team.away');
    if (homeEl) homeEl.addEventListener('click', e => {
      e.stopPropagation();
      openTeamDetail(m.home, S.jorGroup);
    });
    if (awayEl) awayEl.addEventListener('click', e => {
      e.stopPropagation();
      openTeamDetail(m.away, S.jorGroup);
    });

    grid.appendChild(card);
  });
  container.appendChild(grid);
}

/* ====== GOLEADORES ====== */
function renderGoleadores() {
  const container = $('#sec-goleadores');
  container.innerHTML = '';

  const golData = S.cat === 'benjamin' ? GOL_BENJ : GOL_PREBENJ;
  
  if (!golData || golData.length === 0) {
    container.innerHTML = '<div class="empty-state"><div class="empty-icon">⚽</div><p>No hay datos de goleadores disponibles</p></div>';
    return;
  }

  // Group selector
  const selectorRow = el('div', 'selector-row');
  const selectWrap = el('div', 'custom-select');
  const select = document.createElement('select');
  select.id = 'golGroupSelect';

  // Global option
  const globalOpt = document.createElement('option');
  globalOpt.value = '__GLOBAL__';
  globalOpt.textContent = '🌍 GLOBAL - Todos los grupos';
  select.appendChild(globalOpt);

  golData.forEach(g => {
    const opt = document.createElement('option');
    opt.value = g.g;
    opt.textContent = g.g;
    select.appendChild(opt);
  });

  selectWrap.appendChild(select);
  selectorRow.appendChild(selectWrap);
  container.appendChild(selectorRow);

  const tableDiv = el('div', '');
  tableDiv.id = 'golTable';
  container.appendChild(tableDiv);

  // Set default
  if (!S.golGroup) S.golGroup = '__GLOBAL__';
  select.value = S.golGroup;
  renderGolTable();

  select.addEventListener('change', () => {
    S.golGroup = select.value;
    renderGolTable();
  });
}

function renderGolTable() {
  const container = $('#golTable');
  if (!container) return;
  
  const golData = S.cat === 'benjamin' ? GOL_BENJ : GOL_PREBENJ;
  const isGlobal = S.golGroup === '__GLOBAL__';
  
  let scorers = [];
  if (isGlobal) {
    // Merge all groups, keep group info
    golData.forEach(g => {
      g.s.forEach(s => {
        scorers.push({ name: s[0], team: s[1], goals: s[2], games: s[3], group: g.g });
      });
    });
    // Sort by goals desc, then by games asc
    scorers.sort((a, b) => b.goals - a.goals || a.games - b.games);
    // Top 30
    scorers = scorers.slice(0, 30);
  } else {
    const gd = golData.find(g => g.g === S.golGroup);
    if (gd) {
      scorers = gd.s.map(s => ({ name: s[0], team: s[1], goals: s[2], games: s[3], group: '' }));
    }
  }

  if (scorers.length === 0) {
    container.innerHTML = '<div class="empty-state"><div class="empty-icon">⚽</div><p>No hay goleadores registrados</p></div>';
    return;
  }

  let html = '<div class="table-wrap"><table class="scorers-table"><thead><tr>';
  html += '<th>#</th><th>Jugador</th><th>Equipo</th>';
  if (isGlobal) html += '<th>Grupo</th>';
  html += '<th>Goles</th><th>PJ</th>';
  html += '</tr></thead><tbody>';

  scorers.forEach((s, i) => {
    const pos = i + 1;
    const cls = pos <= 3 ? `pos-${pos}` : '';
    const trophy = pos === 1 ? ' <span class="trophy">👑</span>' : '';
    html += `<tr class="${cls}">`;
    html += `<td>${pos}</td>`;
    html += `<td>${s.name}${trophy}</td>`;
    html += `<td>${s.team}</td>`;
    if (isGlobal) html += `<td class="group-col">${s.group}</td>`;
    html += `<td class="goals-col">${s.goals}</td>`;
    html += `<td>${s.games || '-'}</td>`;
    html += '</tr>';
  });

  html += '</tbody></table></div>';
  container.innerHTML = html;
}

/* ====== POR ISLA ====== */
function renderIsla() {
  const container = $('#sec-isla');
  container.innerHTML = '';

  // Island tabs
  const tabsDiv = el('div', 'island-tabs');
  const islands = [
    { id: 'grancanaria', label: 'Gran Canaria' },
    { id: 'lanzarote', label: 'Lanzarote' },
    { id: 'fuerteventura', label: 'Fuerteventura' }
  ];

  // Check which islands have data
  const data = getData();
  const availableIslands = new Set(data.map(g => g.island));
  
  islands.forEach(isl => {
    if (!availableIslands.has(isl.id)) return;
    const tab = el('button', `island-tab${S.island === isl.id ? ' active' : ''}`, isl.label);
    tab.addEventListener('click', () => {
      S.island = isl.id;
      renderIsla();
    });
    tabsDiv.appendChild(tab);
  });
  container.appendChild(tabsDiv);

  // If current island not available, pick first
  if (!availableIslands.has(S.island)) {
    S.island = availableIslands.values().next().value || 'grancanaria';
  }

  // Filter groups by island
  const islandGroups = data.filter(g => g.island === S.island);
  const filteredGroups = S.search ? filterGroups(islandGroups) : islandGroups;

  if (filteredGroups.length === 0) {
    container.appendChild(el('div', 'empty-state', '<div class="empty-icon">🏝️</div><p>No hay datos para esta isla</p>'));
    return;
  }

  // Group by phase
  const byPhase = {};
  filteredGroups.forEach(g => {
    if (!byPhase[g.phase]) byPhase[g.phase] = [];
    byPhase[g.phase].push(g);
  });

  let isFirstIsla = true;
  Object.entries(byPhase).forEach(([phase, groups]) => {
    const hdr = el('div', 'phase-header', `⚽ ${phase}`);
    container.appendChild(hdr);
    groups.forEach(g => {
      container.appendChild(buildGroupCard(g, isFirstIsla));
      isFirstIsla = false;
    });
  });
}

/* ====== SEARCH COUNT ====== */
function updateSearchCount() {
  const countEl = $('#searchCount');
  if (!S.search) {
    countEl.textContent = '';
    return;
  }
  const data = getData();
  let count = 0;
  data.forEach(g => {
    g.standings.forEach(row => {
      if (row[1].toLowerCase().includes(S.search)) count++;
    });
  });
  countEl.textContent = `${count} equipo${count !== 1 ? 's' : ''} encontrado${count !== 1 ? 's' : ''}`;
}

/* ====== MATCH DETAIL MODAL ====== */
const modalOverlay = document.getElementById('matchModal');
const modalClose = document.getElementById('modalClose');
const modalContent = document.getElementById('modalContent');
const modalBody = document.getElementById('modalBody');

// Close modal
if (modalClose) {
  modalClose.addEventListener('click', closeModal);
}
if (modalOverlay) {
  modalOverlay.addEventListener('click', (e) => {
    if (e.target === modalOverlay) closeModal();
  });
}
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') closeModal();
});

function closeModal() {
  if (modalOverlay) modalOverlay.classList.remove('open');
}

function openMatchDetail(match) {
  if (!modalOverlay || !modalContent || !modalBody) return;

  const { home, away, hs, as, date, jornada, groupId, venue } = match;

  // Determine winner
  let homeWin = hs > as;
  let awayWin = as > hs;
  let draw = hs === as;

  // Find group data
  const allGroups = S.cat === 'benjamin' ? BENJAMIN : PREBENJAMIN;
  const group = allGroups.find(g => g.id === groupId);
  const groupLabel = group ? `${group.phase} - ${group.name}` : '';

  // Find team standings
  let homeStats = null, awayStats = null;
  if (group) {
    group.standings.forEach(row => {
      // row: [pos, team, pts, j, g, e, p, gf, gc, df]
      if (row[1] === home) homeStats = row;
      if (row[1] === away) awayStats = row;
    });
  }

  // Winner tag
  const homeTag = homeWin ? '<br><span class="winner-tag">GANADOR</span>' : '';
  const awayTag = awayWin ? '<br><span class="winner-tag">GANADOR</span>' : '';
  const drawLabel = draw ? '<br><span class="winner-tag">EMPATE</span>' : '';

  // Format jornada
  const jorLabel = jornada ? jornada : '';

  // Top section: score + teams
  modalContent.innerHTML = `
    <div class="modal-group-label">${groupLabel}</div>
    ${jorLabel ? `<div class="modal-match-jornada">${jorLabel}</div>` : ''}
    <div class="modal-match">
      <div class="modal-team-name home">${home} ${teamBadge(home)}${homeTag}${draw ? drawLabel : ''}</div>
      <div class="modal-big-score">${hs}<span class="score-dash">-</span>${as}</div>
      <div class="modal-team-name away">${teamBadge(away)} ${away}${awayTag}${draw && !homeTag ? '' : ''}</div>
    </div>
    <div class="modal-match-date">${date}</div>
  `;

  // Body: team comparison stats + head-to-head
  let bodyHtml = '';

  if (homeStats && awayStats) {
    // Stats comparison table
    const stats = [
      { label: 'Posici\u00f3n', h: homeStats[0] + '\u00ba', a: awayStats[0] + '\u00ba', hlH: homeStats[0] < awayStats[0], hlA: awayStats[0] < homeStats[0] },
      { label: 'Puntos', h: homeStats[2], a: awayStats[2], hlH: homeStats[2] > awayStats[2], hlA: awayStats[2] > homeStats[2] },
      { label: 'Jugados', h: homeStats[3], a: awayStats[3] },
      { label: 'Victorias', h: homeStats[4], a: awayStats[4], hlH: homeStats[4] > awayStats[4], hlA: awayStats[4] > homeStats[4] },
      { label: 'Empates', h: homeStats[5], a: awayStats[5] },
      { label: 'Derrotas', h: homeStats[6], a: awayStats[6], hlH: homeStats[6] < awayStats[6], hlA: awayStats[6] < homeStats[6] },
      { label: 'Goles a favor', h: homeStats[7], a: awayStats[7], hlH: homeStats[7] > awayStats[7], hlA: awayStats[7] > homeStats[7] },
      { label: 'Goles en contra', h: homeStats[8], a: awayStats[8], hlH: homeStats[8] < awayStats[8], hlA: awayStats[8] < homeStats[8] },
      { label: 'Diferencia', h: homeStats[9] > 0 ? '+' + homeStats[9] : homeStats[9], a: awayStats[9] > 0 ? '+' + awayStats[9] : awayStats[9], hlH: homeStats[9] > awayStats[9], hlA: awayStats[9] > homeStats[9] }
    ];

    bodyHtml += '<div class="modal-stats-header">Comparaci\u00f3n en liga</div>';
    stats.forEach(s => {
      const hCls = s.hlH ? 'modal-stat-val home highlight' : 'modal-stat-val home';
      const aCls = s.hlA ? 'modal-stat-val away highlight' : 'modal-stat-val away';
      bodyHtml += `<div class="modal-stats-row">
        <div class="${hCls}">${s.h}</div>
        <div class="modal-stat-label">${s.label}</div>
        <div class="${aCls}">${s.a}</div>
      </div>`;
    });

    // Position cards
    bodyHtml += `<div class="modal-pos-row">
      <div class="modal-pos-card">
        <div class="pos-num">${homeStats[0]}\u00ba</div>
        <div class="pos-team">${home}</div>
        <div class="pos-pts">${homeStats[2]} pts</div>
      </div>
      <div class="modal-pos-card">
        <div class="pos-num">${awayStats[0]}\u00ba</div>
        <div class="pos-team">${away}</div>
        <div class="pos-pts">${awayStats[2]} pts</div>
      </div>
    </div>`;
  }

  // Head-to-head: find all matches between these two teams in history
  if (typeof HISTORY !== 'undefined' && HISTORY[groupId]) {
    const h2hMatches = [];
    const hist = HISTORY[groupId];
    Object.entries(hist).forEach(([jorName, matches]) => {
      matches.forEach(m => {
        // m: [date, home, away, hs, as]
        if (m[3] !== null && m[4] !== null) {
          if ((m[1] === home && m[2] === away) || (m[1] === away && m[2] === home)) {
            h2hMatches.push({ jornada: jorName, date: m[0], home: m[1], away: m[2], hs: m[3], as: m[4] });
          }
        }
      });
    });

    if (h2hMatches.length > 0) {
      bodyHtml += '<div class="modal-h2h">';
      bodyHtml += '<div class="modal-h2h-title">Enfrentamientos directos</div>';
      h2hMatches.forEach(h => {
        let hDate = h.date;
        if (hDate && hDate.includes('-')) {
          const p = hDate.split('-');
          hDate = `${p[2]}/${p[1]}`;
        }
        bodyHtml += `<div class="modal-h2h-match">
          <span class="h2h-team home">${h.home}</span>
          <span class="h2h-score">${h.hs} - ${h.as}</span>
          <span class="h2h-team away">${h.away}</span>
          <span class="h2h-jornada">${h.jornada} \u00b7 ${hDate}</span>
        </div>`;
      });
      bodyHtml += '</div>';
    } else {
      bodyHtml += '<div class="modal-h2h"><div class="modal-h2h-title">Enfrentamientos directos</div><div class="modal-h2h-empty">No hay enfrentamientos previos registrados</div></div>';
    }
  }

  // Match detail: goal scorers and minutes from FIFLP data
  if (typeof MATCH_DETAIL !== 'undefined') {
    const detailKey = `${home}|${away}|${hs}-${as}`;
    const detail = MATCH_DETAIL[detailKey];
    if (detail && detail.g && detail.g.length > 0) {
      bodyHtml += '<div class="modal-goals-section">';
      bodyHtml += '<div class="modal-stats-header">\u26bd Cronolog\u00eda de goles</div>';
      const venueToShow = detail.v || venue;
      if (venueToShow) bodyHtml += `<div class="modal-venue">\ud83d\udccd ${venueToShow}</div>`;
      if (detail.r) bodyHtml += `<div class="modal-venue">\ud83d\udcdd \u00c1rbitro: ${detail.r}</div>`;
      bodyHtml += '<div class="goals-timeline">';
      detail.g.forEach(g => {
        // g: [minute, name, running, 'h'/'a', type_char]
        const min = g[0];
        const scorer = g[1];
        const running = g[2];
        const side = g[3]; // 'h' or 'a'
        const gtype = g[4]; // 'r', 'p', 'o'
        const isHome = side === 'h';
        const typeIcon = gtype === 'p' ? ' (pen.)' : gtype === 'o' ? ' (p.p.)' : '';
        const sideClass = isHome ? 'goal-home' : 'goal-away';
        bodyHtml += `<div class="goal-event ${sideClass}">
          <div class="goal-minute">${min}'</div>
          <div class="goal-info">
            <span class="goal-scorer">${scorer}${typeIcon}</span>
            <span class="goal-running">${running}</span>
          </div>
        </div>`;
      });
      bodyHtml += '</div></div>';
    }
  }

  // Streaks comparison from STATS
  if (typeof STATS !== 'undefined' && STATS[S.cat] && STATS[S.cat].teams) {
    const hTeam = STATS[S.cat].teams[home];
    const aTeam = STATS[S.cat].teams[away];
    if (hTeam && aTeam && hTeam.streak && aTeam.streak) {
      const streakColor = s => s.type === 'W' ? 'var(--accent)' : s.type === 'L' ? 'var(--red)' : 'var(--text3)';
      const streakText = s => s.type === 'W' ? 'victorias' : s.type === 'L' ? 'derrotas' : 'empates';
      bodyHtml += '<div class="modal-section-title">Rachas actuales</div>';
      bodyHtml += `<div class="comparison-streaks">
        <div><span class="streak-badge" style="border-color:${streakColor(hTeam.streak)};color:${streakColor(hTeam.streak)}">${hTeam.streak.count}${hTeam.streak.type}</span><br><span class="streak-label">${hTeam.streak.count} ${streakText(hTeam.streak)}</span></div>
        <div style="font-size:12px;color:var(--text3)">VS</div>
        <div><span class="streak-badge" style="border-color:${streakColor(aTeam.streak)};color:${streakColor(aTeam.streak)}">${aTeam.streak.count}${aTeam.streak.type}</span><br><span class="streak-label">${aTeam.streak.count} ${streakText(aTeam.streak)}</span></div>
      </div>`;
    }
  }

  if (!bodyHtml) {
    bodyHtml = '<div class="modal-h2h-empty">No hay datos adicionales disponibles para este partido</div>';
  }

  modalBody.innerHTML = bodyHtml;
  modalOverlay.classList.add('open');
}

/* ====== TEAM DETAIL MODAL ====== */
function openTeamDetail(teamName, groupId) {
  if (!modalOverlay || !modalContent || !modalBody) return;

  // Find group — search both categories so it works from any context
  const allGroups = (typeof BENJAMIN !== 'undefined' ? BENJAMIN : [])
    .concat(typeof PREBENJAMIN !== 'undefined' ? PREBENJAMIN : []);
  const group = allGroups.find(g => g.id === groupId);
  if (!group) return;

  const row = group.standings.find(r => r[1] === teamName);
  // row: [pos, name, pts, j, g, e, p, gf, gc, df]

  // Collect all completed matches for this team from HISTORY
  const hist = (typeof HISTORY !== 'undefined' && HISTORY[groupId]) ? HISTORY[groupId] : {};
  const matches = [];
  Object.entries(hist).forEach(([jorName, jMatches]) => {
    jMatches.forEach(m => {
      if ((m[1] === teamName || m[2] === teamName) && m[3] !== null) {
        const isHome = m[1] === teamName;
        const gf = isHome ? m[3] : m[4];
        const gc = isHome ? m[4] : m[3];
        const result = gf > gc ? 'W' : gf < gc ? 'L' : 'D';
        matches.push({ jornada: jorName, date: m[0], opp: isHome ? m[2] : m[1],
          home: m[1], away: m[2], hs: m[3], as: m[4], gf, gc, result, isHome });
      }
    });
  });
  matches.sort((a, b) => a.date.localeCompare(b.date));

  // Header
  const groupLabel = `${group.phase} · ${group.name}`;
  modalContent.innerHTML = `
    <div class="modal-group-label">${groupLabel}</div>
    <div class="modal-team-header">
      <div class="modal-team-title">${teamBadge(teamName)} ${teamName}</div>
      ${row ? `<div class="modal-team-pos">${row[0]}\u00ba clasificado · ${row[2]} pts</div>` : ''}
    </div>
  `;

  // Body
  let body = '';

  if (row) {
    body += `<div class="modal-stats-header">Temporada</div>
    <div class="team-season-stats">
      <span><b>${row[3]}</b> J</span>
      <span><b>${row[4]}</b> G</span>
      <span><b>${row[5]}</b> E</span>
      <span><b>${row[6]}</b> P</span>
      <span><b>${row[7]}</b> GF</span>
      <span><b>${row[8]}</b> GC</span>
      <span><b>${row[9] > 0 ? '+' + row[9] : row[9]}</b> DF</span>
    </div>`;
  }

  if (matches.length > 0) {
    const form = matches.slice(-5);
    body += `<div class="modal-stats-header">Forma (últimos ${form.length})</div>
    <div class="form-strip">${form.map(m =>
      `<span class="form-badge ${m.result}" title="${m.opp}">${m.result}</span>`
    ).join('')}</div>`;

    body += `<div class="modal-stats-header">Resultados (${matches.length} partidos)</div>`;
    matches.slice().reverse().forEach(m => {
      let dateStr = m.date && m.date.includes('-')
        ? m.date.split('-').reverse().slice(0, 2).join('/') : (m.date || '');
      const resultCls = m.result === 'W' ? 'res-w' : m.result === 'L' ? 'res-l' : 'res-d';
      const locLabel = m.isHome ? 'Casa' : 'Fuera';
      body += `<div class="team-result-row">
        <span class="tr-jornada">${m.jornada.replace('Jornada ', 'J')}</span>
        <span class="tr-loc">${locLabel}</span>
        <span class="tr-opp">${m.opp}</span>
        <span class="tr-score ${resultCls}">${m.gf}-${m.gc}</span>
        <span class="tr-date">${dateStr}</span>
      </div>`;
    });
  } else {
    body += '<div class="modal-h2h-empty">No hay resultados registrados aún</div>';
  }

  // Enrich with STATS data if available
  if (typeof STATS !== 'undefined' && STATS[S.cat] && STATS[S.cat].teams && STATS[S.cat].teams[teamName]) {
    const ts = STATS[S.cat].teams[teamName];
    body += '<div class="modal-section-title">Análisis avanzado</div>';

    // Streak
    if (ts.streak) {
      const streakColor = ts.streak.type === 'W' ? 'var(--accent)' : ts.streak.type === 'L' ? 'var(--red)' : 'var(--text3)';
      const streakLabel = ts.streak.type === 'W' ? 'victorias' : ts.streak.type === 'L' ? 'derrotas' : 'empates';
      body += `<div style="margin-bottom:12px"><span class="streak-badge" style="border-color:${streakColor};color:${streakColor}">${ts.streak.count}${ts.streak.type}</span> <span class="streak-label">racha de ${ts.streak.count} ${streakLabel}</span></div>`;
    }

    // Home/Away stats grid
    body += '<div class="team-stat-grid">';
    if (ts.homeRecord) {
      body += `<div class="stat-card"><div class="stat-value">${ts.homeRecord.pct}%</div><div class="stat-label">Casa<small>${ts.homeRecord.w}G ${ts.homeRecord.d}E ${ts.homeRecord.l}P</small></div></div>`;
    }
    if (ts.awayRecord) {
      body += `<div class="stat-card"><div class="stat-value">${ts.awayRecord.pct}%</div><div class="stat-label">Fuera<small>${ts.awayRecord.w}G ${ts.awayRecord.d}E ${ts.awayRecord.l}P</small></div></div>`;
    }
    if (ts.avgGF !== undefined) {
      body += `<div class="stat-card"><div class="stat-value">${ts.avgGF}</div><div class="stat-label">Goles/partido</div></div>`;
    }
    if (ts.avgGC !== undefined) {
      body += `<div class="stat-card"><div class="stat-value">${ts.avgGC}</div><div class="stat-label">Enc./partido</div></div>`;
    }
    body += '</div>';

    // Sparkline
    if (ts.pointsHistory && ts.pointsHistory.length > 1) {
      body += '<div class="modal-stats-header">Evolución de puntos</div>';
      body += buildSparkline(ts.pointsHistory);
    }

    // Best win / Worst loss
    if (ts.biggestWin) {
      body += `<div class="result-highlight win">🏆 Mayor victoria: <strong>${ts.biggestWin.score}</strong> vs ${ts.biggestWin.vs} (${ts.biggestWin.date})</div>`;
    }
    if (ts.worstLoss) {
      body += `<div class="result-highlight loss">💔 Peor derrota: <strong>${ts.worstLoss.score}</strong> vs ${ts.worstLoss.vs} (${ts.worstLoss.date})</div>`;
    }
  }

  modalBody.innerHTML = body;
  modalOverlay.classList.add('open');
}

/* ====== STATS SECTION ====== */
function calcHistoricalStats() {
  var groups = getData();
  var totalMatches = 0, totalGoals = 0;
  var biggestDiff = -1, biggestWin = null;
  var mostGoalsTotal = -1, mostGoalsMatch = null;
  var teamGF = {}, teamGC = {};

  groups.forEach(function(g) {
    (g.standings || []).forEach(function(row) {
      var team = row[1];
      teamGF[team] = (teamGF[team] || 0) + (row[7] || 0);
      teamGC[team] = (teamGC[team] || 0) + (row[8] || 0);
    });
    Object.values(g.jornadas || {}).forEach(function(matches) {
      matches.forEach(function(m) {
        var hs = m[3], as_ = m[4];
        if (hs === null || hs === undefined || as_ === null || as_ === undefined) return;
        totalMatches++;
        var goals = hs + as_;
        totalGoals += goals;
        var diff = Math.abs(hs - as_);
        if (diff > biggestDiff || (diff === biggestDiff && goals > ((biggestWin && biggestWin._goals) || 0))) {
          biggestDiff = diff;
          biggestWin = { home: m[1], away: m[2], score: hs + '-' + as_, date: m[0], _goals: goals };
        }
        if (goals > mostGoalsTotal) {
          mostGoalsTotal = goals;
          mostGoalsMatch = { home: m[1], away: m[2], score: hs + '-' + as_, totalGoals: goals, date: m[0] };
        }
      });
    });
  });

  var gfEntries = Object.entries(teamGF).sort(function(a,b){return b[1]-a[1];});
  var gcEntries = Object.entries(teamGC).sort(function(a,b){return a[1]-b[1];});

  return {
    season: {
      totalMatches: totalMatches,
      totalGoals: totalGoals,
      avgGoalsPerMatch: totalMatches > 0 ? Math.round(totalGoals / totalMatches * 100) / 100 : 0,
      topScorer: null,
      mostGoals: gfEntries[0] ? { team: gfEntries[0][0], gf: gfEntries[0][1] } : null,
      leastConceded: gcEntries[0] ? { team: gcEntries[0][0], gc: gcEntries[0][1] } : null,
      biggestWin: biggestWin ? { home: biggestWin.home, away: biggestWin.away, score: biggestWin.score, date: biggestWin.date } : null,
      mostGoalsMatch: mostGoalsMatch,
    },
    teams: {}
  };
}

function recordCard(icon, value, label, sublabel) {
  return `<div class="record-card">
    <div class="record-icon">${icon}</div>
    <div class="record-value">${value}</div>
    <div class="record-label">${label}${sublabel ? `<small>${sublabel}</small>` : ''}</div>
  </div>`;
}

function renderStats() {
  const container = $('#sec-stats');
  container.innerHTML = '';

  let stats;
  if (isHistorical()) {
    stats = calcHistoricalStats();
  } else {
    if (typeof STATS === 'undefined' || !STATS[S.cat]) {
      container.innerHTML = '<div class="empty-state"><div class="empty-icon">\ud83d\udcca</div><p>No hay estad\u00edsticas disponibles</p></div>';
      return;
    }
    stats = STATS[S.cat];
  }

  const ss = stats.season;
  if (!ss) return;

  const hdr = el('div', 'phase-header', '<span class="phase-icon">📊</span> Récords de temporada');
  container.appendChild(hdr);

  let grid = '<div class="stats-grid">';
  grid += recordCard('⚽', ss.totalMatches, 'Partidos jugados');
  grid += recordCard('🥅', ss.totalGoals, 'Goles totales', ss.avgGoalsPerMatch ? `${ss.avgGoalsPerMatch} por partido` : '');
  if (ss.topScorer) {
    grid += recordCard('👑', ss.topScorer.goals, 'Máximo goleador', `${ss.topScorer.name} (${ss.topScorer.team})`);
  }
  if (ss.mostGoals) {
    grid += recordCard('💪', ss.mostGoals.gf, 'Más goles (equipo)', ss.mostGoals.team);
  }
  if (ss.leastConceded) {
    grid += recordCard('🧤', ss.leastConceded.gc, 'Menos goles enc.', ss.leastConceded.team);
  }
  if (ss.biggestWin) {
    grid += recordCard('🏆', ss.biggestWin.score, 'Mayor goleada', `${ss.biggestWin.home} vs ${ss.biggestWin.away}`);
  }
  if (ss.mostGoalsMatch) {
    grid += recordCard('🔥', ss.mostGoalsMatch.totalGoals, 'Más goles en partido', `${ss.mostGoalsMatch.home} vs ${ss.mostGoalsMatch.away}`);
  }
  grid += '</div>';
  container.innerHTML += grid;

  // Top streaks section
  const teams = stats.teams;
  if (teams) {
    const teamList = Object.entries(teams);

    // Best current winning streaks
    const winStreaks = teamList
      .filter(([, t]) => t.streak && t.streak.type === 'W')
      .sort((a, b) => b[1].streak.count - a[1].streak.count)
      .slice(0, 5);

    if (winStreaks.length > 0) {
      const hdr2 = el('div', 'phase-header', '<span class="phase-icon">🔥</span> Mejores rachas actuales');
      container.appendChild(hdr2);
      let streakHtml = '<div class="stats-grid">';
      winStreaks.forEach(([name, t]) => {
        streakHtml += recordCard('🏆', `${t.streak.count}W`, name, `${t.streak.count} victorias seguidas`);
      });
      streakHtml += '</div>';
      container.innerHTML += streakHtml;
    }

    // Best home records
    const homeRecords = teamList
      .filter(([, t]) => t.homeRecord && (t.homeRecord.w + t.homeRecord.d + t.homeRecord.l) >= 3)
      .sort((a, b) => b[1].homeRecord.pct - a[1].homeRecord.pct)
      .slice(0, 5);

    if (homeRecords.length > 0) {
      const hdr3 = el('div', 'phase-header', '<span class="phase-icon">🏠</span> Mejores locales');
      container.appendChild(hdr3);
      let homeHtml = '<div class="stats-grid">';
      homeRecords.forEach(([name, t]) => {
        homeHtml += recordCard('🏠', `${t.homeRecord.pct}%`, name, `${t.homeRecord.w}G ${t.homeRecord.d}E ${t.homeRecord.l}P`);
      });
      homeHtml += '</div>';
      container.innerHTML += homeHtml;
    }

    // Best away records
    const awayRecords = teamList
      .filter(([, t]) => t.awayRecord && (t.awayRecord.w + t.awayRecord.d + t.awayRecord.l) >= 3)
      .sort((a, b) => b[1].awayRecord.pct - a[1].awayRecord.pct)
      .slice(0, 5);

    if (awayRecords.length > 0) {
      const hdr4 = el('div', 'phase-header', '<span class="phase-icon">✈️</span> Mejores visitantes');
      container.appendChild(hdr4);
      let awayHtml = '<div class="stats-grid">';
      awayRecords.forEach(([name, t]) => {
        awayHtml += recordCard('✈️', `${t.awayRecord.pct}%`, name, `${t.awayRecord.w}G ${t.awayRecord.d}E ${t.awayRecord.l}P`);
      });
      awayHtml += '</div>';
      container.innerHTML += awayHtml;
    }

    // Most goals per match
    const topAttack = teamList
      .filter(([, t]) => t.avgGF !== undefined)
      .sort((a, b) => b[1].avgGF - a[1].avgGF)
      .slice(0, 5);

    if (topAttack.length > 0) {
      const hdr5 = el('div', 'phase-header', '<span class="phase-icon">⚽</span> Mejores ataques (goles/partido)');
      container.appendChild(hdr5);
      let attackHtml = '<div class="stats-grid">';
      topAttack.forEach(([name, t]) => {
        attackHtml += recordCard('⚽', t.avgGF, name, `${t.avgGC} enc./partido`);
      });
      attackHtml += '</div>';
      container.innerHTML += attackHtml;
    }
  }
}

/* ====== SPARKLINE ====== */
function buildSparkline(data) {
  if (!data || data.length < 2) return '';
  const w = 300, h = 60, pad = 4;
  const max = Math.max(...data);
  const min = Math.min(...data);
  const range = max - min || 1;
  const stepX = (w - pad * 2) / (data.length - 1);

  const points = data.map((v, i) => {
    const x = pad + i * stepX;
    const y = h - pad - ((v - min) / range) * (h - pad * 2);
    return `${x},${y}`;
  });

  const fillPoints = `${pad},${h - pad} ${points.join(' ')} ${pad + (data.length - 1) * stepX},${h - pad}`;

  let svg = `<div class="sparkline-wrap">`;
  svg += `<svg class="sparkline" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none">`;
  svg += `<polygon points="${fillPoints}" fill="rgba(0,230,118,0.1)" />`;
  svg += `<polyline points="${points.join(' ')}" fill="none" stroke="var(--accent)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />`;
  // End dot
  const lastPt = points[points.length - 1].split(',');
  svg += `<circle cx="${lastPt[0]}" cy="${lastPt[1]}" r="3" fill="var(--accent)" />`;
  svg += '</svg>';
  svg += `<div class="sparkline-labels"><span>J1: ${data[0]} pts</span><span>J${data.length}: ${data[data.length - 1]} pts</span></div>`;
  svg += '</div>';
  return svg;
}
