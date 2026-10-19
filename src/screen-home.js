// Mi equipo, la portada (spec §4.2, §4.8, §6.4 y §7).
//
// render(ctx) es puro y síncrono: homeState decide el estado (E, X, D, B, C o A, en ese orden) sobre
// la resolución de mi equipo, y la vista de equipo lo recibe (teamState, una vez por pintado: B5,
// decisión 6). E y X son de la portada; D, B, C y A los pinta la vista de equipo
// (team-view.js, decisión 8 de B3), la misma vista de la ficha, con su consulta completa
// (team-extras.js) y el calendario con su .ics; aquí, con «Cambiar», la caja de la temporada
// siguiente y el aviso stale; la plantilla no espera a las actas (fillSquad). El estado va en
// data-state, que usan las pruebas de navegador. mount(root, ctx, nav) añade el comportamiento. Nada
// toca el DOM al importarse.
import { html } from './html.js';
import { block, box, crest, empty } from './ui.js';
import { seasonLabel } from './model.js';
import { homeState } from './myteam.js';
import { ensureHealth } from './state.js';
import { SEARCH_HREF, mountTeamView, teamColumns, teamHeader, teamView } from './team-view.js';
import { fillSquad, mountTeamExtras, squadPending, teamExtras } from './team-extras.js';
import { followedBlock } from './screen-jugador.js';

// ── Estado E: elegir equipo (spec §4.2 y §6.3) ──────────────────────────

// En E y X, la cabecera va sin «Cambiar»: la caja ya ofrece buscar otro equipo.
function stateE(ctx, shields) {
  const name = ctx.myTeam?.name || 'Mi equipo';
  const choices = ctx.resolution.candidates.map((c, i) => html`<li><button type="button" class="choice" data-action="elegir" data-index="${i}">${crest(c.name, { size: 32, shields })}<span class="choice-text"><span class="choice-name">${c.name}</span><span class="choice-label">${c.group.label}</span></span></button></li>`);
  return html`${teamHeader(name, `Temporada ${seasonLabel(ctx.portal.season)}`, { shields })}${box(
    html`<ul class="choices">${choices}<li><a class="choice choice-none" href="${SEARCH_HREF}">Ninguno: buscar otro equipo</a></li></ul>`,
    { title: '¿En qué equipo juega ahora?' })}`;
}

// ── Estado X: no aparece ────────────────────────────────────────────────

function stateX(ctx, shields) {
  const name = ctx.myTeam?.name || 'Mi equipo';
  const season = seasonLabel(ctx.portal.season);
  return html`${teamHeader(name, `Temporada ${season}`, { shields })}${block(null, html`${empty(`${name} no aparece en ${season}`)}<div class="buttons home-cta"><a class="button is-main" href="${SEARCH_HREF}">Elegir equipo</a></div>`)}`;
}

export const screen = {
  id: 'home',
  // Todo sale de los datos inmediatos salvo data-health.json (la caja de D y la frescura): se pide
  // una sola vez por sesión y queda en datasets.health, que es undefined mientras no se ha pedido y
  // null si falló; con null, las visitas siguientes pintan en el acto, sin esperar otra vez hasta
  // 15 s (M4 de la revisión final de B2). Nunca rechaza: sin él, la portada se pinta igual (§7).
  needs: (params, datasets) => (datasets.health !== undefined ? []
    : [ensureHealth().then((health) => { datasets.health = health; })]),
  render(ctx) {
    const shields = (ctx.datasets && ctx.datasets.shields) || {};
    const r = ctx.resolution;
    const state = homeState({ resolution: r, todayISO: ctx.today, portalSeason: ctx.portal.season });
    if (state === 'E' || state === 'X') {
      return html`<section data-screen="home" data-state="${state}">${state === 'E' ? stateE(ctx, shields) : stateX(ctx, shields)}${followedBlock(ctx)}</section>`;
    }
    const team = { group: r.group, name: r.name };
    const view = teamView(ctx, team, { action: 'change', nextSeason: true, stale: r.stale || null, mine: true, shields, state });
    // La consulta de la ficha, en su orden; la plantilla, sin esperar a las actas (lazySquad).
    const aside = [...view.aside, ...teamExtras(ctx, r.group, r.name, { lazySquad: true })];
    // Los jugadores seguidos (la ficha de jugador), al final, si hay alguno.
    return html`<section data-screen="home" data-state="${view.state}">${view.head}${teamColumns(view.main, aside, view.rest)}${followedBlock(ctx)}</section>`;
  },
  mount(root, ctx, nav) {
    const section = root.matches && root.matches('[data-screen="home"]') ? root : root.querySelector('[data-screen="home"]');
    if (!section) return undefined;
    const r = ctx.resolution;
    if (r && r.status === 'ask') {
      // La escucha va en la sección, que se sustituye en cada pintado: nunca se acumula.
      section.addEventListener('click', event => {
        const target = event.target.closest('[data-action]');
        if (!target || !section.contains(target) || target.getAttribute('data-action') !== 'elegir') return;
        const c = r.candidates[Number(target.getAttribute('data-index'))];
        if (c && nav && typeof nav.saveMyTeam === 'function') {
          nav.saveMyTeam({ name: c.name, season: c.group.season, cat: c.cat, groupId: c.group.id });
        }
      });
      return undefined;
    }
    if (!r || r.status !== 'ok') return undefined;
    const team = { group: r.group, name: r.name };
    // Como en la ficha: los extras (jugador, trayectoria y sus «Reintentar») y después la vista
    // («Calendario», «Compartir» y el .ics). Si la plantilla espera a las actas, fillSquad llena su
    // hueco y devuelve su limpieza, que el router llama antes del pintado siguiente.
    mountTeamExtras(section, ctx, team);
    mountTeamView(section, ctx, team);
    return squadPending(ctx, r.group, r.name) ? fillSquad(section, ctx, team) : undefined;
  },
};
