import { S, getData, normalizeTeamName, escapeHtml as esc, escapeAttr } from './state.js';
import { syncRoute } from './links.js';

export function filterCompetitionGroups(groups, state = S) {
  const query = normalizeTeamName(state.search || '');
  return groups.filter(group => (!state.filterIsland || group.island === state.filterIsland)
    && (!state.filterPhase || group.phase === state.filterPhase)
    && (!query || (group.standings || []).some(row => normalizeTeamName(row[1]).includes(query))));
}

export function sectionIntro(container, title, description) {
  const intro = document.createElement('div');
  intro.className = 'page-intro';
  intro.innerHTML = '<div><span class="eyebrow">' + (S.cat === 'benjamin' ? 'BENJAMÍN' : 'PREBENJAMÍN') + '</span><h2>' + esc(title) + '</h2><p>' + esc(description) + '</p></div>';
  container.appendChild(intro);
}

export function appendFilters(container, render) {
  const groups = getData();
  const islands = [...new Set(groups.map(group => group.island).filter(Boolean))];
  const phases = [...new Set(groups.map(group => group.phase).filter(Boolean))];
  const islandNames = { grancanaria: 'Gran Canaria', lanzarote: 'Lanzarote', fuerteventura: 'Fuerteventura' };
  const prefix = 'filter-' + S.section;
  const wrap = document.createElement('div');
  wrap.className = 'filters-bar';
  const options = (values, selected, labels = {}) => values.map(value => `<option value="${escapeAttr(value)}" ${selected === value ? 'selected' : ''}>${esc(labels[value] || value)}</option>`).join('');
  wrap.innerHTML = `<label class="filter-search" for="${prefix}-search"><span>Buscar equipo</span><input id="${prefix}-search" type="search" placeholder="Nombre de tu equipo…" value="${escapeAttr(S.search)}" autocomplete="off"></label>
    <label for="${prefix}-island"><span>Isla</span><select id="${prefix}-island"><option value="">Todas las islas</option>${options(islands, S.filterIsland, islandNames)}</select></label>
    <label for="${prefix}-phase"><span>Fase / competición</span><select id="${prefix}-phase"><option value="">Todas las fases</option>${options(phases, S.filterPhase)}</select></label>
    <button class="btn btn-quiet" data-clear ${!S.search && !S.filterIsland && !S.filterPhase ? 'disabled' : ''}>Limpiar</button>`;
  const apply = (field, value, target, cursor) => {
    if (!wrap.isConnected || prefix !== 'filter-' + S.section) return;
    S[field] = value;
    render(); syncRoute({}, true);
    const restored = document.getElementById(target);
    restored?.focus({ preventScroll: true });
    if (cursor != null) restored?.setSelectionRange(cursor, cursor);
  };
  const search = wrap.querySelector('input');
  let timer;
  search.addEventListener('input', () => {
    clearTimeout(timer);
    const value = search.value, cursor = search.selectionStart;
    timer = setTimeout(() => apply('search', value, search.id, cursor), 180);
  });
  wrap.querySelector('#' + prefix + '-island').addEventListener('change', event => apply('filterIsland', event.target.value, event.target.id));
  wrap.querySelector('#' + prefix + '-phase').addEventListener('change', event => apply('filterPhase', event.target.value, event.target.id));
  wrap.querySelector('[data-clear]').addEventListener('click', () => { clearTimeout(timer); S.search = ''; S.filterIsland = ''; S.filterPhase = ''; render(); syncRoute({}, true); document.getElementById(search.id)?.focus(); });
  container.appendChild(wrap);
  const count = document.createElement('p');
  count.className = 'result-count';
  count.setAttribute('role', 'status');
  const filtered = filterCompetitionGroups(groups);
  count.textContent = `${filtered.length} grupos · ${filtered.reduce((total, group) => total + (group.standings?.length || 0), 0)} equipos en estos grupos`;
  container.appendChild(count);
  return filtered;
}
