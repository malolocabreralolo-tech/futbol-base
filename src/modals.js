import { el, $, getData, teamBadge, isHistorical, buildSparkline, S } from './state.js';

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

export function closeModal() {
  if (modalOverlay) modalOverlay.classList.remove('open');
}

export function openMatchDetail(match) {
  if (!modalOverlay || !modalContent || !modalBody) return;

  const { home, away, hs, as, date, jornada, groupId, venue } = match;

  // Determine winner
  let homeWin = hs > as;
  let awayWin = as > hs;
  let draw = hs === as;

  // Find group data
  const allGroups = isHistorical() ? getData() : (S.cat === 'benjamin' ? BENJAMIN : PREBENJAMIN);
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
      { label: 'Posición', h: homeStats[0] + 'º', a: awayStats[0] + 'º', hlH: homeStats[0] < awayStats[0], hlA: awayStats[0] < homeStats[0] },
      { label: 'Puntos', h: homeStats[2], a: awayStats[2], hlH: homeStats[2] > awayStats[2], hlA: awayStats[2] > homeStats[2] },
      { label: 'Jugados', h: homeStats[3], a: awayStats[3] },
      { label: 'Victorias', h: homeStats[4], a: awayStats[4], hlH: homeStats[4] > awayStats[4], hlA: awayStats[4] > homeStats[4] },
      { label: 'Empates', h: homeStats[5], a: awayStats[5] },
      { label: 'Derrotas', h: homeStats[6], a: awayStats[6], hlH: homeStats[6] < awayStats[6], hlA: awayStats[6] < homeStats[6] },
      { label: 'Goles a favor', h: homeStats[7], a: awayStats[7], hlH: homeStats[7] > awayStats[7], hlA: awayStats[7] > homeStats[7] },
      { label: 'Goles en contra', h: homeStats[8], a: awayStats[8], hlH: homeStats[8] < awayStats[8], hlA: awayStats[8] < homeStats[8] },
      { label: 'Diferencia', h: homeStats[9] > 0 ? '+' + homeStats[9] : homeStats[9], a: awayStats[9] > 0 ? '+' + awayStats[9] : awayStats[9], hlH: homeStats[9] > awayStats[9], hlA: awayStats[9] > homeStats[9] }
    ];

    bodyHtml += '<div class="modal-stats-header">Comparación en liga</div>';
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
        <div class="pos-num">${homeStats[0]}º</div>
        <div class="pos-team">${home}</div>
        <div class="pos-pts">${homeStats[2]} pts</div>
      </div>
      <div class="modal-pos-card">
        <div class="pos-num">${awayStats[0]}º</div>
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
          <span class="h2h-jornada">${h.jornada} · ${hDate}</span>
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
      bodyHtml += '<div class="modal-stats-header">⚽ Cronología de goles</div>';
      const venueToShow = detail.v || venue;
      if (venueToShow) bodyHtml += `<div class="modal-venue">📍 ${venueToShow}</div>`;
      if (detail.r) bodyHtml += `<div class="modal-venue">📝 Árbitro: ${detail.r}</div>`;
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
export function openTeamDetail(teamName, groupId) {
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
      ${row ? `<div class="modal-team-pos">${row[0]}º clasificado · ${row[2]} pts</div>` : ''}
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
