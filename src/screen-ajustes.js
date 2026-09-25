// Pantalla Ajustes (spec §4.7 y §4.9; decisión 29 de B3): mi equipo, con su etiqueta y «Cambiar»
// (#/explorar#buscar), y «Borrar datos de esta app», que confirma en dos pasos y sin diálogo: el
// botón despliega el aviso con «Borrar» y «Cancelar», y «Borrar» llama a nav.clearData() (decisión 6),
// que borra el almacén y abre Mi equipo. Sin selector de tema: el tema sigue al sistema (§4.9 manda
// sobre la maqueta). render(ctx) es puro; el aviso lo pinta mount al desplegar (§5.1: solo lo visible).
import { html } from './html.js';
import { box, crest, screenHead } from './ui.js';
import { routeTitle } from './shell.js';
import { seasonLabel } from './model.js';
// «Cambiar» abre Explorar con el buscador enfocado: el mismo enlace de Mi equipo (decisión 52 de B2).
import { SEARCH_HREF } from './team-view.js';

const PANEL = 'ajustes-borrar';

// Mi equipo en una línea: el resuelto con la etiqueta de su grupo; en E y X, el guardado y por qué no
// hay grupo.
function myTeamLine(ctx) {
  const r = ctx.resolution;
  if (r && r.status === 'ok') return { name: r.name, label: r.group.label };
  const name = (ctx.myTeam && ctx.myTeam.name) || 'Mi equipo';
  return { name, label: r && r.status === 'ask' ? 'Pendiente de elegir en Mi equipo' : `No aparece en ${seasonLabel(ctx.portal.season)}` };
}

// El aviso desplegado: lo que se borra y las dos salidas.
export function confirmPanel() {
  return html`<p class="aj-warning">Se borrarán tu equipo y los vistos hace poco.</p><div class="buttons"><button class="button is-main" type="button" data-action="confirmar-borrado">Borrar</button><button class="button" type="button" data-action="cancelar-borrado">Cancelar</button></div>`;
}

function render(ctx) {
  const shields = (ctx.datasets && ctx.datasets.shields) || {};
  const { name, label } = myTeamLine(ctx);
  const team = html`<div class="aj-team">${crest(name, { size: 32, shields })}<span class="aj-team-text"><span class="aj-team-name">${name}</span><span class="aj-team-label">${label}</span></span><a class="screen-action" href="${SEARCH_HREF}">Cambiar</a></div>`;
  const data = html`<p class="box-text">Esta app guarda en este navegador tu equipo y los equipos que has visto hace poco.</p><button class="button aj-clear" type="button" data-action="borrar-datos" aria-expanded="false" aria-controls="${PANEL}">Borrar datos de esta app</button><div id="${PANEL}" class="aj-confirm" hidden></div>`;
  return html`<section data-screen="ajustes">${screenHead(routeTitle('ajustes'), { back: ctx.backHref })}${box(team, { title: 'Mi equipo' })}${box(data, { title: 'Datos de esta app' })}</section>`;
}

export const screen = {
  id: 'ajustes',
  needs: () => [],
  render,
  // Dos pasos sin diálogo: el botón despliega y recoge el aviso (aria-expanded); «Cancelar» lo
  // recoge y devuelve el foco al botón; «Borrar», nav.clearData(). La escucha va en la sección, que
  // se sustituye en cada pintado: nunca se acumula.
  mount(root, ctx, nav) {
    const section = root.matches && root.matches('[data-screen="ajustes"]') ? root : root.querySelector('[data-screen="ajustes"]');
    if (!section) return;
    const toggle = section.querySelector('[data-action="borrar-datos"]');
    const panel = section.querySelector(`#${PANEL}`);
    if (!toggle || !panel) return;
    const show = (open) => {
      toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
      // Html de la plantilla html``, que escapa toda interpolación, como el pintado del router.
      panel.innerHTML = open ? String(confirmPanel()) : '';
      panel.hidden = !open;
    };
    section.addEventListener('click', (event) => {
      const target = event.target.closest('[data-action]');
      if (!target || !section.contains(target)) return;
      const action = target.getAttribute('data-action');
      if (action === 'borrar-datos') show(toggle.getAttribute('aria-expanded') !== 'true');
      else if (action === 'cancelar-borrado') {
        show(false);
        toggle.focus();
      } else if (action === 'confirmar-borrado' && nav && typeof nav.clearData === 'function') nav.clearData();
    });
  },
};
