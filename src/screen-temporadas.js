// Pantalla Temporadas (spec §4.1 y §4.7; decisión 27 de B3), el archivo: una fila por temporada de
// SEASONS, de la más reciente a la más antigua, con «actual» en la del portal. Cada fila abre
// Explorar de esa temporada y lleva un enlace secundario a sus Récords. render(ctx) es pura y no
// carga nada: la temporada que se abra la carga el router (decisión 2 de B3).
import { html } from './html.js';
import { screenHead } from './ui.js';
import { routeTitle } from './shell.js';
import { routeHref } from './links.js';
import { seasonLabel } from './model.js';

const SEASON_RE = /^\d{4}-\d{4}$/;

// Los nombres de SEASONS (datasets.seasons: [{ name, current }]) más la del portal, sin repetidos y de
// la más reciente a la más antigua. La del portal va siempre, aunque SEASONS no la traiga todavía.
export function archiveSeasons(seasons, portalSeason) {
  const names = [portalSeason, ...(Array.isArray(seasons) ? seasons : []).map((entry) => entry && entry.name)];
  return [...new Set(names.filter((name) => SEASON_RE.test(String(name))))].sort().reverse();
}

function render(ctx) {
  const portal = ctx.portal.season;
  const rows = archiveSeasons(ctx.datasets && ctx.datasets.seasons, portal).map((name) => html`<li class="tp-row"><a class="tp-season" href="${routeHref('explorar', { s: name })}"><span class="tp-name">${seasonLabel(name)}</span>${name === portal ? html`<span class="tp-now">actual</span>` : ''}</a><a class="tp-records" href="${routeHref('records', { s: name })}">Récords<span class="vh"> de ${seasonLabel(name)}</span></a></li>`);
  return html`<section data-screen="temporadas">${screenHead(routeTitle('temporadas'), { back: ctx.backHref })}<div class="block"><ol class="box tp-list">${rows}</ol></div></section>`;
}

export const screen = {
  id: 'temporadas',
  needs: () => [],
  render,
};
