import { S, $, $$, el, normalizeTeamName, teamBadge, getTeamForm, getData, isHistorical, getPhases, countStats, buildUnifiedPrebenjamin, isFeatured, escapeHtml, escapeAttr, jornadaLabel, sortJornadaKeys, validJorGroup, knockoutRoundsSource, knockoutRoundLabel, isRoundRobinCup, bracketDrawAdvancer, getSeasonError, ensureSeasonData } from './state.js';
import { openMatchDetail, openTeamDetail } from './modals.js';
import { renderMiEquipo, matchDateISO, localTodayISO, goalBarPct } from './miequipo.js';

/* ====== SEARCH COUNT ====== */
export function updateSearchCount() {
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

/* ====== RENDER ROUTER ====== */
export function renderSection() {
  $$('.section').forEach(s => s.classList.remove('active'));
  const sec = S.section;
  document.body.dataset.section = sec;
  $(`#sec-${sec}`).classList.add('active');

  if (sec === 'miequipo') renderMiEquipo();
  else if (sec === 'clasif') renderClasif();
  else if (sec === 'jornadas') renderJornadas();
  else if (sec === 'goleadores') renderGoleadores();
  else if (sec === 'isla') renderIsla();
  else if (sec === 'stats') renderStats();
}

/* Honest error state when a historical season failed to load: message +
 * retry button (ensureSeasonData clears its single-flight on failure, so
 * the retry actually refetches). Returns null when there is no error. */
function seasonErrorBox() {
  if (!isHistorical()) return null;
  const err = getSeasonError(S.season);
  if (!err) return null;
  const seasonLabel = escapeHtml(S.season.replace('-', '/'));
  const box = el('div', 'empty-state season-error',
    '<div class="empty-icon">⚠️</div>'
    + '<p class="season-error-title">No se pudieron cargar los datos de la temporada '
    + seasonLabel + '</p>'
    + '<p class="season-error-hint">Comprueba tu conexión e inténtalo de nuevo.</p>');
  const btn = el('button', 'season-retry-btn', '↻ Reintentar');
  btn.addEventListener('click', async () => {
    await ensureSeasonData(S.season);
    renderSection();
  });
  box.appendChild(btn);
  // Los chips de la stats-bar mostrarían '0 grupos · 0 equipos · 0 partidos'
  // junto a la tarjeta de error (QA 11/6) — em-dash mientras no haya datos.
  ['statGroups', 'statTeams', 'statMatches'].forEach(id => {
    const n = document.getElementById(id);
    if (n) n.textContent = '—';
  });
  return box;
}

/* ====== CLASIFICACIONES ====== */
export function renderClasif() {
  const container = $('#sec-clasif');
  container.innerHTML = '';

  // Unified PreBenjamin classification for current season
  if (S.cat === 'prebenjamin' && !isHistorical()) {
    container.appendChild(buildUnifiedPrebenjamin());
  }

  if (isHistorical()) {
    const errBox = seasonErrorBox();
    if (errBox) {
      container.appendChild(errBox);
      return;
    }
    const data = getData();
    if (!data.length) {
      container.innerHTML = '<div class="empty-state"><div class="empty-icon">📁</div><p>No hay datos disponibles para esta categoría en la temporada ' + escapeHtml(S.season.replace('-', '/')) + '</p></div>';
      return;
    }
    const banner = el('div', 'historical-banner', '📋 Datos históricos · Temporada ' + escapeHtml(S.season.replace('-', '/')) + ' · Sin goleadores individuales');
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
    const hdr = el('div', 'phase-header', `<span class="phase-icon">${phaseIcons[phase]||'⚽'}</span> ${escapeHtml(phase)}`);
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
    if (td) openTeamDetail(td.dataset.team, td.dataset.group);
  };
}

function filterGroups(groups) {
  if (!S.search) return groups;
  return groups.filter(g =>
    g.standings.some(row => row[1].toLowerCase().includes(S.search))
  );
}

/* HTML escaping: import escapeHtml/escapeAttr from state.js (C2 — single
 * shared implementation; scraped names contain quotes, see state.js). */

/** Returns true if this group is a knockout/cup tournament (not a league).
 * Detected via: phase contains "Copa" / "Campeon", group id starts with
 * PCC or BC, or jornadas keys look like "( Ronda N )" instead of integers. */
function isKnockoutGroup(g) {
  const id = (g.id || '').toUpperCase();
  if (id.startsWith('PCC') || id.startsWith('BC')) return true;
  const phase = (g.phase || '').toLowerCase();
  if (phase.includes('copa') || phase.includes('campeon')) return true;
  const keys = g.jornadas ? Object.keys(g.jornadas) : [];
  if (keys.length && keys.every(k => /ronda/i.test(k))) return true;
  return false;
}

export function buildGroupCard(g, forceOpen) {
  const card = el('div', forceOpen ? 'group-card open' : 'group-card');
  const knockout = isKnockoutGroup(g);
  const teamCount = g.standings.length;
  // For knockouts, show the champion next to the group name instead of
  // "N equipos" (uninformative for a bracket).
  const champion = knockout && g.standings.length ? g.standings[0][1] : null;
  const headerBadge = knockout && champion
    ? `<span class="group-badge cup-badge" title="Campeón">🏆 ${escapeHtml(champion)}</span>`
    : `<span class="group-badge">${teamCount} equipos</span>`;
  card.innerHTML = `
    <div class="group-header">
      <div class="group-title">
        ${escapeHtml(g.name)} ${headerBadge}${g.jornada && !knockout ? ` <span class="jornada-badge">${escapeHtml(g.jornada)}</span>` : ''}
      </div>
      <span class="group-chevron">▾</span>
    </div>
    <div class="group-body">
      ${knockout ? buildKnockoutBracket(g) : buildStandingsTable(g.standings, g.id, g)}
    </div>
  `;
  card.querySelector('.group-header').addEventListener('click', () => {
    card.classList.toggle('open');
  });
  return card;
}

/** Render a knockout tournament as a vertical bracket — one column per round
 * (Cuartos / Semis / Final), each match showing home/away with score and the
 * winning team in green. No points / J / G / E / P columns. */
function buildKnockoutBracket(g) {
  // Current-season cups don't carry jornadas inline — their rounds live in
  // HISTORY keyed by code (like every current-season group); historical cups
  // carry them in g.jornadas (per-season file). See knockoutRoundsSource.
  const jornadas = knockoutRoundsSource(g, isHistorical(), typeof HISTORY !== 'undefined' ? HISTORY : null);
  const rounds = Object.keys(jornadas);
  if (!rounds.length) {
    return '<div class="modal-h2h-empty" style="padding:16px;text-align:center;opacity:.7">Sin partidos registrados</div>';
  }
  // A round-robin group stage (one round, many matches — 2023-24 Copa de
  // Campeones) is a liguilla, not a bracket: show the classification table
  // (champion on top) instead of a one-column "bracket" mislabelled "Final".
  if (isRoundRobinCup(jornadas) && g.standings && g.standings.length) {
    return buildStandingsTable(g.standings, g.id, g);
  }

  const champion = g.standings.length ? g.standings[0][1] : null;

  let html = '<div class="bracket">';
  rounds.forEach((rkey, idx) => {
    const matches = jornadas[rkey] || [];
    const label = knockoutRoundLabel(rkey, idx, rounds.length);
    const dateMatch = rkey.match(/(\d{2}-\d{2}-\d{4})/);
    const date = dateMatch ? dateMatch[1] : '';
    html += `<div class="bracket-round">
      <div class="bracket-round-title">
        <span>${escapeHtml(label)}</span>
        ${date ? `<span class="bracket-round-date">${escapeHtml(date)}</span>` : ''}
      </div>`;
    matches.forEach(m => {
      const [, home, away, hs, as] = m;
      const played = hs != null && as != null;
      let homeWin = false, awayWin = false;
      if (played) {
        if (hs > as) homeWin = true;
        else if (as > hs) awayWin = true;
      }
      const isFinalMatch = matches.length === 1;
      const draw = played && !homeWin && !awayWin;
      // On a draw, who advanced on penalties (appears in a later round).
      const penAdvancer = draw ? bracketDrawAdvancer(jornadas, rounds, idx, home, away) : null;
      const homeAdv = homeWin || penAdvancer === 'home';
      const awayAdv = awayWin || penAdvancer === 'away';
      const homeClass = `bracket-team${homeAdv ? ' winner' : ''}${draw && !homeAdv ? ' draw' : ''}${isFeatured(home) ? ' featured-team' : ''}`;
      const awayClass = `bracket-team${awayAdv ? ' winner' : ''}${draw && !awayAdv ? ' draw' : ''}${isFeatured(away) ? ' featured-team' : ''}`;
      const homeIsChamp = isFinalMatch && homeAdv && home === champion;
      const awayIsChamp = isFinalMatch && awayAdv && away === champion;
      // team-name-cell + data-group/data-team makes these clickable via the
      // existing delegated handler in renderClasif → openTeamDetail (modals.js).
      // data-team carries the clean name (the badge fallback would pollute
      // textContent with initials); the 🏆 stays outside the cell.
      html += `<div class="bracket-match${isFinalMatch ? ' bracket-match-final' : ''}">
        <div class="${homeClass}${homeIsChamp ? ' champion' : ''}">
          <span class="bracket-team-name"><span class="team-name-cell" data-group="${escapeAttr(g.id)}" data-team="${escapeAttr(home)}">${teamBadge(home)} ${escapeHtml(home)}</span>${homeIsChamp ? ' 🏆' : ''}</span>
          <span class="bracket-score">${hs != null ? hs : '–'}${penAdvancer === 'home' ? ' <span class="bracket-pen" title="Ganó en la tanda de penaltis">pen</span>' : ''}</span>
        </div>
        <div class="${awayClass}${awayIsChamp ? ' champion' : ''}">
          <span class="bracket-team-name"><span class="team-name-cell" data-group="${escapeAttr(g.id)}" data-team="${escapeAttr(away)}">${teamBadge(away)} ${escapeHtml(away)}</span>${awayIsChamp ? ' 🏆' : ''}</span>
          <span class="bracket-score">${as != null ? as : '–'}${penAdvancer === 'away' ? ' <span class="bracket-pen" title="Ganó en la tanda de penaltis">pen</span>' : ''}</span>
        </div>
      </div>`;
    });
    html += '</div>';
  });
  html += '</div>';
  return html;
}

/* Pure-ish: true when a group's season is over — historical seasons always,
 * current season when its last listed jornada has no fixture left that is
 * today or later (group.matches = the CURRENT jornada's fixtures; an unplayed
 * fixture whose date already passed will never be played). todayISO is
 * injected (UI edge: localTodayISO). Gates the podium row tints: full
 * gold/silver/bronze only when the standings are final. */
export function groupFinished(g, todayISO) {
  if (!g || !Array.isArray(g.matches) || !g.matches.length) return false;
  return g.matches.every(m => {
    const played = m[4] !== null && m[4] !== undefined;
    if (played) return true;
    const iso = matchDateISO(m[0], todayISO);
    return iso !== null && iso < todayISO;
  });
}

export function buildStandingsTable(standings, groupId, group) {
  // Check if data has GF/GC/DF (row[7] exists and is not null)
  const hasGoalData = standings.length > 0 && standings[0].length > 7 && standings[0][7] != null;
  const hist = isHistorical();
  const histHasJornadas = hist && getData().some(function(g){ return g.jornadas && Object.keys(g.jornadas).length > 0; });
  const showForm = !hist || histHasJornadas;
  // Podium tints (gold/silver/bronze on rows 1-3) only on FINAL standings;
  // in-progress groups carry the leader accent alone (CSS default).
  const podium = hist || groupFinished(group, localTodayISO());

  let html = '<div class="table-wrap"><table class="standings-table'
    + (podium ? ' podium-table' : '') + '"><thead><tr>';
  html += '<th>#</th><th>Equipo</th>';
  if (showForm) html += '<th>F</th>';
  html += '<th>PTS</th><th>J</th><th>G</th><th>E</th><th>P</th>';
  if (hasGoalData) html += '<th>GF</th><th>GC</th><th>DF</th>';
  html += '</tr></thead><tbody>';
  standings.forEach(row => {
    // row: [pos, team, pts, j, g, e, p, gf, gc, df]
    const pos = row[0];
    const cls = (pos <= 3 ? `pos-${pos}` : '') + (isFeatured(row[1]) ? ' featured-team' : '');
    html += `<tr class="${cls.trim()}">`;
    html += `<td>${pos}</td>`;
    html += `<td class="team-name-cell" data-group="${escapeAttr(groupId)}" data-team="${escapeAttr(row[1])}">${teamBadge(row[1])} ${escapeHtml(row[1])}</td>`;
    if (showForm) {
      // Form column
      const form = getTeamForm(row[1], groupId);
      html += '<td class="form-col">';
      if (form.length) {
        html += '<div class="form-mini">';
        // Letras visibles en español (G/E/P) — las clases CSS conservan W/D/L.
        const FORM_LETTER = { W: 'G', D: 'E', L: 'P' };
        form.forEach(f => { html += `<span class="form-dot ${f.result}">${FORM_LETTER[f.result] || f.result}</span>`; });
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
export function renderJornadas() {
  const container = $('#sec-jornadas');
  container.innerHTML = '';

  const data = Object.values(getPhases()).flat();
  
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

  // Validate: keep jorGroup only if it exists in the active season, else fall
  // back to the first group (a stale current-season code left the tab blank
  // after switching to a historical season).
  S.jorGroup = validJorGroup(S.jorGroup, data);
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

export function renderJornadaContent() {
  const pillsDiv = $('#jornadaPills');
  const matchesDiv = $('#jornadaMatches');
  if (!pillsDiv || !matchesDiv) return;
  pillsDiv.innerHTML = '';
  matchesDiv.innerHTML = '';

  if (!S.jorGroup) return;

  const group = getData().find(g => g.id === S.jorGroup);
  if (!group) {
    matchesDiv.innerHTML = '<div class="empty-state"><div class="empty-icon">📅</div><p>No hay jornadas para este grupo</p></div>';
    return;
  }

  // HISTORICAL PATH
  if (isHistorical() && group.jornadas && Object.keys(group.jornadas).length > 0) {
    // Keys may be numeric ('5'), 'Jornada 5' or non-numeric copa rounds
    // ('08-06-2025 ( Ronda 1 Ida )'): keep the RAW key for lookups and let
    // jornadaLabel decide the pill text (never 'J' + NaN).
    var jorKeys = sortJornadaKeys(Object.keys(group.jornadas));
    if (!S.jorNum || jorKeys.indexOf(String(S.jorNum)) === -1) {
      var lastPlayed = jorKeys[jorKeys.length - 1];
      for (var i = jorKeys.length - 1; i >= 0; i--) {
        var ms = group.jornadas[jorKeys[i]] || [];
        if (ms.some(function(m){return m[3] !== null && m[3] !== undefined;})) {
          lastPlayed = jorKeys[i]; break;
        }
      }
      S.jorNum = String(lastPlayed);
    }
    jorKeys.forEach(function(key) {
      var pill = el('button', 'jornada-pill' + (key === S.jorNum ? ' active' : ''), escapeHtml(jornadaLabel(key)));
      pill.addEventListener('click', (function(k) {
        return function() {
          S.jorNum = k;
          $$('.jornada-pill').forEach(function(p){p.classList.remove('active');});
          pill.classList.add('active');
          renderMatchCards(matchesDiv, getHistoricalJornadaMatches(group, k), 'history');
        };
      })(key));
      pillsDiv.appendChild(pill);
    });
    setTimeout(function() {
      var active = pillsDiv.querySelector('.active');
      if (active) active.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
    }, 50);
    renderMatchCards(matchesDiv, getHistoricalJornadaMatches(group, S.jorNum), 'history');
    return;
  }
  // END HISTORICAL PATH

  // Use HISTORY data if available for this group (Benjamin and Prebenjamín)
  if (typeof HISTORY !== 'undefined' && HISTORY[S.jorGroup]) {
    const hist = HISTORY[S.jorGroup];
    const jornadas = sortJornadaKeys(Object.keys(hist));

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
      const pill = el('button', `jornada-pill${j === S.jorNum ? ' active' : ''}`, escapeHtml(jornadaLabel(j)));
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
      const pill = el('button', `jornada-pill${currentJor === S.jorNum ? ' active' : ''}`, escapeHtml(jornadaLabel(currentJor)) + ' ★');
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
      const pill = el('button', 'jornada-pill active', escapeHtml(jornadaLabel(group.jornada)));
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

export function getJornadaMatches(jorName) {
  if (!HISTORY[S.jorGroup] || !HISTORY[S.jorGroup][jorName]) return [];
  return HISTORY[S.jorGroup][jorName].map(m => ({
    date: m[0], home: m[1], away: m[2], hs: m[3], as: m[4]
  }));
}

export function getHistoricalJornadaMatches(group, jorNum) {
  if (!group || !group.jornadas || !group.jornadas[jorNum]) return [];
  return group.jornadas[jorNum].map(function(m) {
    return { date: m[0], home: m[1], away: m[2], hs: m[3], as: m[4] };
  });
}

export function renderMatchCards(container, matches, type) {
  container.innerHTML = '';
  if (matches.length === 0) {
    container.innerHTML = '<div class="empty-state"><div class="empty-icon">⚽</div><p>No hay partidos en esta jornada</p></div>';
    return;
  }
  const grid = el('div', 'match-grid');
  matches.forEach(m => {
    const hasScore = m.hs !== null && m.hs !== undefined && m.as !== null && m.as !== undefined;
    const featuredCls = (isFeatured(m.home) || isFeatured(m.away)) ? ' featured-team' : '';
    const card = el('div', `match-card ${hasScore ? 'completed' : 'upcoming'}${featuredCls}`);
    
    // Played matches get the LED scoreboard pill: Bebas tabular digits on an
    // inset dark face — winner lit in accent, loser dimmed, draws neutral.
    let scoreHtml;
    let scoreCls = 'match-score';
    if (hasScore) {
      scoreCls = 'match-score scoreboard';
      const sbH = m.hs > m.as ? ' win' : m.hs < m.as ? ' lose' : ' draw';
      const sbA = m.as > m.hs ? ' win' : m.as < m.hs ? ' lose' : ' draw';
      scoreHtml = `<span class="sb-num${sbH}">${m.hs}</span><span class="sb-sep">-</span><span class="sb-num${sbA}">${m.as}</span>`;
    } else {
      const timeTag = m.time ? `<span class="match-time-tag">${escapeHtml(m.time)}</span>` : '';
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

    // Data lookup key — uses RAW (unescaped) names on purpose; it must match
    // the keys generated in data-matchdetail-keys.js. Same style as modals.js.
    const detailKey = m.home + '|' + m.away + '|' + m.hs + '-' + m.as;
    const hasDetail = hasScore
      && typeof MATCH_DETAIL_KEYS !== 'undefined'
      && !!MATCH_DETAIL_KEYS[detailKey];

    const venueHtml = m.venue ? `<div class="match-venue">📍 ${escapeHtml(m.venue)}</div>` : '';
    card.innerHTML = `
      <div class="match-teams">
        <div class="match-team home">${escapeHtml(m.home)} ${teamBadge(m.home)}</div>
        <div class="${scoreCls}">${scoreHtml}</div>
        <div class="match-team away">${teamBadge(m.away)} ${escapeHtml(m.away)}</div>
      </div>
      <div class="match-date">${escapeHtml(dateStr)}${hasDetail ? ' <span class="detail-badge" title="Ver cronología de goles">⚽</span>' : ''}</div>
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
/* GOL_BENJ/GOL_PREBENJ are top-level lexical consts from data-goleadores.js:
 * guard with bare-identifier typeof (NOT globalThis/window) so a missing
 * script tag degrades to the empty-state instead of a ReferenceError. */
function getGolData() {
  return S.cat === 'benjamin'
    ? (typeof GOL_BENJ !== 'undefined' ? GOL_BENJ : null)
    : (typeof GOL_PREBENJ !== 'undefined' ? GOL_PREBENJ : null);
}

export function renderGoleadores() {
  const container = $('#sec-goleadores');
  container.innerHTML = '';

  const golData = getGolData();

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

export function renderGolTable() {
  const container = $('#golTable');
  if (!container) return;

  const golData = getGolData();
  const isGlobal = S.golGroup === '__GLOBAL__';

  if (!golData) {
    container.innerHTML = '<div class="empty-state"><div class="empty-icon">⚽</div><p>No hay datos de goleadores disponibles</p></div>';
    return;
  }

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

  // Pichichi podium: the top 3 step out onto medal cards laid out 2º-1º-3º
  // (gold in the middle, taller). Only when there is a full podium — with
  // fewer than 3 scorers everyone renders in the .gol-list below, where the
  // 👑 still marks the leader.
  const maxGoals = scorers.reduce((mx, s) => Math.max(mx, s.goals || 0), 0);
  const hasPodium = scorers.length >= 3;
  let html = '';
  if (hasPodium) {
    const pod = (s, n, medal) =>
      `<div class="gol-pod gol-pod-${n}">
        <span class="gol-pod-medal" aria-hidden="true">${medal}</span>
        <div class="gol-pod-name">${escapeHtml(s.name)}</div>
        <div class="gol-pod-team">${escapeHtml(s.team)}${s.group ? ` · ${escapeHtml(s.group)}` : ''}</div>
        <div class="gol-pod-goals">${s.goals}</div>
        <div class="gol-pod-lbl">GOLES</div>
      </div>`;
    const [p1, p2, p3] = scorers;
    html += `<div class="gol-podium">${pod(p2, 2, '🥈')}${pod(p1, 1, '🥇')}${pod(p3, 3, '🥉')}</div>`;
  }

  // Rest of the ranking as an app-style list (no horizontal scroll on
  // mobile): rank · name + team with the proportional bar underneath ·
  // goals as accent digits · PJ. Same row language as MI EQUIPO's scorers.
  const rest = hasPodium ? scorers.slice(3) : scorers;
  if (rest.length) {
    html += '<div class="gol-list">';
    rest.forEach((s, i) => {
      const pos = i + 1 + (hasPodium ? 3 : 0);
      const trophy = pos === 1 ? ' <span class="trophy">👑</span>' : '';
      const teamLine = escapeHtml(s.team) + (isGlobal && s.group ? ` <span class="gol-grp">· ${escapeHtml(s.group)}</span>` : '');
      html += `<div class="gol-row">
        <span class="gol-rk">${pos}</span>
        <span class="gol-main">
          <span class="gol-nm">${escapeHtml(s.name)}${trophy}</span>
          <span class="gol-tm">${teamLine}</span>
          <span class="gol-bar-track"><span class="gol-bar" style="width:${goalBarPct(s.goals, maxGoals)}%"></span></span>
        </span>
        <span class="gol-g">${s.goals}</span>
        <span class="gol-pj">${s.games || '-'} PJ</span>
      </div>`;
    });
    html += '</div>';
  }
  container.innerHTML = html;
}

/* ====== POR ISLA ====== */
export function renderIsla() {
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
    const hdr = el('div', 'phase-header', `⚽ ${escapeHtml(phase)}`);
    container.appendChild(hdr);
    groups.forEach(g => {
      container.appendChild(buildGroupCard(g, isFirstIsla));
      isFirstIsla = false;
    });
  });
}

/* ====== STATS SECTION ====== */
export function calcHistoricalStats() {
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

  var gfEntries = Object.entries(teamGF).filter(function(e){return e[1] > 0;}).sort(function(a,b){return b[1]-a[1];});
  var gcEntries = Object.entries(teamGC).filter(function(e){return e[1] > 0;}).sort(function(a,b){return a[1]-b[1];});

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

/* value/label/sublabel may carry scraped team names — escape here so every
 * caller is covered. icon is our own emoji literal. */
export function recordCard(icon, value, label, sublabel) {
  return `<div class="record-card">
    <div class="record-icon">${icon}</div>
    <div class="record-value">${escapeHtml(value)}</div>
    <div class="record-label">${escapeHtml(label)}${sublabel ? `<small>${escapeHtml(sublabel)}</small>` : ''}</div>
  </div>`;
}

export function renderStats() {
  const container = $('#sec-stats');
  container.innerHTML = '';

  let stats;
  if (isHistorical()) {
    stats = calcHistoricalStats();
  } else {
    if (typeof STATS === 'undefined' || !STATS[S.cat]) {
      container.innerHTML = '<div class="empty-state"><div class="empty-icon">📊</div><p>No hay estadísticas disponibles</p></div>';
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

