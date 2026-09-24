// Pantalla provisional de las rutas de B3 (decisión 6 de B2): su h1 y un vacío honesto, para
// que ningún enlace de B2 lleve a una pantalla rota. Nunca se publica: el Plan B sale entero en B5.
import { html } from './html.js';
import { empty, screenHead } from './ui.js';
import { routeTitle } from './shell.js';

export const screen = {
  id: 'pendiente',
  needs: () => [],
  render: (ctx) => html`<section data-screen="pendiente" data-route="${ctx.route.screen}">${screenHead(routeTitle(ctx.route.screen), { back: ctx.backHref })}<div class="block">${empty('Esta pantalla llega en la próxima fase del rediseño.')}</div></section>`,
};
