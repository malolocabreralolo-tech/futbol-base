import { escapeHtml as esc, escapeAttr, getCurrentSeason } from './state.js';
import { PORTAL } from './config.js';
import { showDialog } from './modals.js';

let health = null;
function dateLabel(value, time = false) {
  if (!value) return 'No disponible';
  const date = new Date(value.length === 10 ? value + 'T12:00:00Z' : value);
  if (!Number.isFinite(+date)) return 'No disponible';
  return date.toLocaleString('es-ES', { timeZone: PORTAL.timeZone,
    day: 'numeric', month: 'short', year: 'numeric', ...(time ? { hour: '2-digit', minute: '2-digit' } : {}) });
}

export async function loadHealth() {
  try {
    const response = await fetch('./data-health.json');
    if (response.ok) health = await response.json();
  } catch { /* The archive remains usable offline. */ }
  refreshHealthLabels();
}

export function refreshHealthLabels() {
  const checked = document.getElementById('sourceChecked');
  const changed = document.getElementById('dataChanged');
  if (checked) checked.textContent = health?.checkedAt ? dateLabel(health.checkedAt, true) + ' · hora canaria' : 'Sin comprobación disponible';
  if (changed) changed.textContent = health?.lastDataChange ? dateLabel(health.lastDataChange) : document.getElementById('legacyUpdated')?.textContent.replace('Última actualización: ', '') || 'No disponible';
  document.querySelectorAll('[data-source-checked]').forEach(node => {
    const item = health?.season === getCurrentSeason() ? health.groups?.[node.dataset.sourceChecked] : null;
    node.textContent = item ? (item.status === 'ok' ? 'Comprobada ' : 'Revisión pendiente · ') + dateLabel(item.checkedAt)
      + (item.status !== 'ok' && item.message ? '. ' + item.message : '') : 'Sin comprobación reciente para este grupo';
  });
}

export function sourceInfo(group, historical = false) {
  const labels = {
    source: group.url ? 'Clasificación de la fuente' : 'Clasificación recopilada',
    reconstructed: 'Clasificación calculada a partir de resultados',
    corrected: 'Clasificación con corrección aritmética de puntos',
  };
  const label = historical ? 'Archivo de temporada' : labels[group.standingsKind || 'source'];
  const source = /^https?:\/\//.test(group.url || '')
    ? `<a href="${escapeAttr(group.url)}" target="_blank" rel="noopener noreferrer">Consultar fuente ↗</a>` : '';
  return `<details class="data-info"><summary>${esc(label)} <span aria-hidden="true">ⓘ</span></summary><div><p>${group.standingsKind === 'reconstructed'
    ? 'El orden se calcula con los resultados disponibles. Puede no reflejar sanciones ni criterios federativos de desempate.'
    : group.standingsKind === 'corrected' ? 'Se ha corregido una incoherencia en los puntos. Consulta la fuente para confirmar posibles sanciones.'
      : 'Los resultados y las tablas pueden tener distinta cobertura. Una ausencia de marcador no confirma que el partido se haya suspendido.'}</p>${source}
    ${historical ? '' : `<span class="source-checked" data-source-checked="${escapeAttr(group.id)}"></span>`}</div></details>`;
}

export function openDataInfo() {
  const groups = Object.entries(health?.groups || {});
  const counts = health?.summary || {};
  showDialog('Datos y fuentes', `<p class="dialog-intro">Una comprobación indica cuándo se consultó una fuente. La fecha de cambio solo avanza cuando cambian los datos publicados.</p>
    <dl class="health-summary"><div><dt>Última comprobación</dt><dd>${esc(dateLabel(health?.checkedAt, true))}</dd></div>
    <div><dt>Último cambio en datos</dt><dd>${esc(dateLabel(health?.lastDataChange))}</dd></div>
    <div><dt>Grupos comprobados</dt><dd>${groups.length} · ${counts.ok || 0} correctos · ${(counts.error || 0) + (counts.rejected || 0)} pendientes</dd></div></dl>
    <div class="season-note"><strong>Próxima temporada ${esc(PORTAL.nextSeason.replace('-', '/'))}</strong><p>Los grupos y calendarios se incorporan después de verificar la temporada en la fuente. El archivo de ${esc(PORTAL.season.replace('-', '/'))} se conserva.</p></div>
    <h3 class="dialog-subtitle">Cobertura por grupo</h3><div class="health-groups">${groups.map(([code, item]) => `<details><summary><strong>${esc(code)}</strong><span class="status-pill ${item.status === 'ok' ? 'ok' : 'pending'}">${item.status === 'ok' ? 'Comprobado' : 'Pendiente'}</span></summary><p>${esc(item.message || '')}</p><p>${esc(dateLabel(item.checkedAt, true))}</p><a href="${escapeAttr(item.url)}" target="_blank" rel="noopener noreferrer">Abrir fuente ↗</a></details>`).join('') || '<p>El informe de comprobación no está disponible. Los datos almacenados siguen accesibles.</p>'}</div>`);
}
