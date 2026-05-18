import { $ } from './state.js';

export function renderMiEquipo() {
  const c = $('#sec-miequipo');
  if (c) c.innerHTML = '<div class="empty-state"><div class="empty-icon">⭐</div><p>MI EQUIPO (en construcción)</p></div>';
}
