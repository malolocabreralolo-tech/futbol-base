/* ====== APP STATE ====== */
const S = {
  cat: 'benjamin',      // 'benjamin' | 'prebenjamin'
  section: 'clasif',    // 'clasif' | 'jornadas' | 'goleadores' | 'isla'
  search: '',
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
function teamBadge(name) {
  if (typeof SHIELDS !== 'undefined' && SHIELDS[name]) {
    return `<img class="team-badge" src="./escudos/${SHIELDS[name]}" alt="${name}" onerror="this.outerHTML=teamBadgeFallback(this.alt)">`;
  }
  return teamBadgeFallback(name);
}

/* Get last N results for a team from HISTORY */
function getTeamForm(teamName, groupId, n) {
  n = n || 5;
  if (typeof HISTORY === 'undefined' || !HISTORY[groupId]) return [];
  const hist = HISTORY[groupId];
  const all = [];
  Object.entries(hist).forEach(([jorName, matches]) => {
    const jorNum = parseInt(jorName.replace(/\D/g, ''));
    matches.forEach(m => {
      if (m[3] === null || m[4] === null) return;
      if (m[1] !== teamName && m[2] !== teamName) return;
      const isHome = m[1] === teamName;
      const gf = isHome ? m[3] : m[4], gc = isHome ? m[4] : m[3];
      all.push({ jorNum, date: m[0], result: gf > gc ? 'W' : gf < gc ? 'L' : 'D' });
    });
  });
  all.sort((a, b) => a.jorNum - b.jorNum || a.date.localeCompare(b.date));
  return all.slice(-n);
}

function getData() {
  return S.cat === 'benjamin' ? BENJAMIN : PREBENJAMIN;
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
    matches += g.matches.length;
  });
  // Add history matches for benjamin
  if (S.cat === 'benjamin' && typeof HIST_MATCHES !== 'undefined') {
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
  updateStats();
  renderSection();
  bindEvents();
});

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
      S.search = '';
      S.jorGroup = S.cat === 'benjamin' ? 'A2' : 'PG2';
      S.jorNum = '';
      S.golGroup = '__GLOBAL__';
      S.island = 'grancanaria';
      $('#searchInput').value = '';
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
  // Search
  $('#searchInput').addEventListener('input', (e) => {
    S.search = e.target.value.trim().toLowerCase();
    if (S.section === 'clasif' || S.section === 'isla') {
      renderSection();
    }
  });
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
  updateSearchCount();
}

/* ====== CLASIFICACIONES ====== */
function renderClasif() {
  const container = $('#sec-clasif');
  container.innerHTML = '';
  const phases = getPhases();
  const phaseIcons = {
    'Segunda Fase A': '🏆', 'Segunda Fase B': '🥈', 'Segunda Fase C': '🥉',
    'Lanzarote': '🌋', 'Fuerteventura': '🏝️',
    'Gran Canaria': '🏔️'
  };

  const defaultGroup = S.jorGroup || (S.cat === 'benjamin' ? 'A2' : 'PG2');
  Object.entries(phases).forEach(([phase, groups]) => {
    const filteredGroups = filterGroups(groups);
    if (filteredGroups.length === 0 && S.search) return;

    const hdr = el('div', 'phase-header', `<span class="phase-icon">${phaseIcons[phase]||'⚽'}</span> ${phase}`);
    container.appendChild(hdr);

    (S.search ? filteredGroups : groups).forEach(g => {
      const forceOpen = (g.id === defaultGroup) || !!S.search;
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
  let html = '<div class="table-wrap"><table class="standings-table"><thead><tr>';
  html += '<th>#</th><th>Equipo</th><th>F</th><th>PTS</th><th>J</th><th>G</th><th>E</th><th>P</th><th>GF</th><th>GC</th><th>DF</th>';
  html += '</tr></thead><tbody>';
  standings.forEach(row => {
    // row: [pos, team, pts, j, g, e, p, gf, gc, df]
    const pos = row[0];
    const cls = pos <= 3 ? `pos-${pos}` : '';
    const df = row[9];
    const dfCls = df > 0 ? 'df-pos' : (df < 0 ? 'df-neg' : '');
    const dfStr = df > 0 ? `+${df}` : df;
    const highlight = S.search && row[1].toLowerCase().includes(S.search) ? ' style="background:var(--accent-dim)"' : '';
    html += `<tr class="${cls}"${highlight}>`;
    html += `<td>${pos}</td>`;
    html += `<td class="team-name-cell" data-group="${groupId}">${teamBadge(row[1])} ${row[1]}</td>`;
    // Form column
    const form = getTeamForm(row[1], groupId);
    html += '<td class="form-col">';
    if (form.length) {
      html += '<div class="form-mini">';
      form.forEach(f => { html += `<span class="form-dot ${f.result}">${f.result}</span>`; });
      html += '</div>';
    } else { html += '-'; }
    html += '</td>';
    html += `<td class="pts-col">${row[2]}</td>`;
    html += `<td>${row[3]}</td><td>${row[4]}</td><td>${row[5]}</td><td>${row[6]}</td>`;
    html += `<td>${row[7]}</td><td>${row[8]}</td>`;
    html += `<td class="${dfCls}">${dfStr}</td>`;
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

    // Default to latest jornada
    if (!S.jorNum || !jornadas.includes(S.jorNum)) {
      S.jorNum = jornadas[jornadas.length - 1];
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
      container.appendChild(buildGroupCard(g, isFirstIsla || !!S.search));
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

  modalBody.innerHTML = body;
  modalOverlay.classList.add('open');
}
