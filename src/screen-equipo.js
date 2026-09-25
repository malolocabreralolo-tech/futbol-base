// Ficha de un equipo, `#/equipo?s&g&t` (spec §4.6 y §4.8). El mismo esqueleto que Mi equipo: la vista
// de equipo (team-view.js) con los estados A, B, C o D, el D sin la caja de la temporada siguiente y
// el calendario completo siempre, con su ancla #calendario y su .ics (decisión 15 de B3). Además,
// «Hacer mi equipo» (decisión 11) y «Vistos hace poco» (decisión 5). render(ctx) es pura; mount pone
// el comportamiento. El router ya garantiza que el grupo existe en la temporada (cargada), que es de
// liga y que el equipo juega en él (decisión 3 de B3); las dos ramas defensivas de render son para
// lo que no pasa por el router.
import { html } from './html.js';
import { block, empty, notice, screenHead } from './ui.js';
import { findGroup, seasonLabel } from './model.js';
import { teamHref } from './links.js';
import { routeIsMine } from './router.js';
import { errorBox } from './shell.js';
import { ensureHealth } from './state.js';
import { mountTeamView, teamColumns, teamView } from './team-view.js';

// El grupo y el equipo de la ruta, o null: el equipo tiene que estar en la clasificación o en el
// calendario de un grupo de liga (la misma regla que el router, hasTeam).
function locate(ctx) {
  const { s, g, t } = ctx.params || {};
  const group = s && g ? findGroup(ctx.model, s, g) : null;
  if (!group || group.kind !== 'league' || !t) return { group, name: null };
  const plays = group.standings.some(row => row.team === t)
    || group.rounds.some(round => round.matches.some(m => m.home === t || m.away === t));
  return { group, name: plays ? t : null };
}

// Mi equipo en otra fase de la misma temporada (decisión 40): tras «Hacer mi equipo» en FF5, la
// resolución pasa a A2 (el cambio de fase de §6.3) y la ficha de FF5 deja de ser «mi equipo» para la
// barra. Ahí no se ofrece otra vez el botón: se dice dónde juega ahora, con el enlace a esa ficha. Es
// el mismo nombre y la misma categoría que la resolución, en su temporada; si no, null.
function movedNotice(ctx, group, name, mine) {
  const r = ctx.resolution;
  if (mine || !r || r.status !== 'ok' || r.name !== name || r.cat !== group.cat || r.group.season !== group.season) return null;
  return notice(null, html`Tu equipo ahora juega en <a class="more" href="${teamHref(r.group.season, r.group.id, r.name)}">${r.group.label}</a>.`);
}

const lost = (ctx, text) => html`<section data-screen="equipo">${screenHead('Equipo', { back: ctx.backHref })}${block(null, empty(text))}</section>`;

function render(ctx) {
  const params = ctx.params || {};
  const s = params.s || ctx.portal.season;
  // Sin la temporada (el router no la trajo): la caja de error con «Reintentar», nunca otra (§7).
  if (!ctx.model.season(s)) {
    return html`<section data-screen="equipo">${screenHead('Equipo', { back: ctx.backHref })}${errorBox(`la temporada ${seasonLabel(s)}`)}</section>`;
  }
  const { group, name } = locate(ctx);
  if (!group || group.kind !== 'league') return lost(ctx, `No hay ningún grupo de liga ${params.g || ''} en la temporada ${seasonLabel(s)}.`);
  if (!name) return lost(ctx, `No encontramos a ${params.t || 'ese equipo'} en ${group.label}.`);
  const mine = routeIsMine(ctx.route, ctx.resolution);
  // «Hacer mi equipo» (decisión 11): solo en la temporada del portal (mi equipo es siempre de la
  // actual) y si la ficha no es ya mi equipo, con la misma regla que marca Mi equipo en la barra; ni
  // en mi equipo en otra fase de la misma temporada, que dice dónde juega ahora (decisión 40).
  const moved = movedNotice(ctx, group, name, mine);
  const action = group.season === ctx.portal.season && !mine && !moved ? 'make' : null;
  const view = teamView(ctx, { group, name }, { action, calendar: 'always', mine, shields: ctx.datasets?.shields || {} });
  return html`<section data-screen="equipo" data-state="${view.state}">${view.head}${moved || ''}${teamColumns(view.main, view.aside, view.rest)}</section>`;
}

function mount(root, ctx, nav) {
  const { group, name } = locate(ctx);
  if (!name) return undefined;
  // «Vistos hace poco» (decisión 5): la ficha visitada va la primera, sin repetidos y como máximo 8.
  // app.js la guarda sin volver a pintar; se apunta aunque la sección no se encuentre.
  if (nav && typeof nav.addRecent === 'function') nav.addRecent({ s: group.season, g: group.id, t: name });
  const section = root.matches && root.matches('[data-screen="equipo"]') ? root : root.querySelector('[data-screen="equipo"]');
  if (!section) return undefined;
  // La escucha va en la sección, que se sustituye en cada pintado: nunca se acumula.
  section.addEventListener('click', (event) => {
    const target = event.target.closest('[data-action]');
    if (!target || !section.contains(target) || target.getAttribute('data-action') !== 'hacer-mi-equipo') return;
    // Lo guarda app.js (en memoria si el almacenamiento falla) y el router vuelve a pintar la ficha:
    // sin el botón y con Mi equipo marcado en la barra.
    if (nav && typeof nav.saveMyTeam === 'function') {
      nav.saveMyTeam({ name, season: group.season, cat: group.cat, groupId: group.id });
    }
  });
  return mountTeamView(section, ctx, { group, name }, { calendar: 'always' });
}

export const screen = {
  id: 'equipo',
  // data-health.json (la frescura de A, B y C), una vez por sesión, como la portada: undefined sin
  // pedir y null si falló. Nunca rechaza. La temporada de la ruta la carga el router (decisión 2).
  needs: (params, datasets) => (datasets.health !== undefined ? []
    : [ensureHealth().then((health) => { datasets.health = health; })]),
  render,
  mount,
};
