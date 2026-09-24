// Mi equipo, la portada (spec §4.2). render(ctx) es puro: homeState decide el estado (E, X, D, B,
// C o A) y cada estado pinta sus bloques bajo la cabecera de pantalla común (screenHead, ui.js).
// Desde el corte: la cabecera y el primer bloque de cada estado; las Tareas 7 y 8 completan la
// pantalla con las mismas piezas.
import { html } from './html.js';
import { box, cells, crest, empty, matchRow, screenHead } from './ui.js';
import { homeState } from './myteam.js';
import { retiredTeams, seasonLabel, seasonSummary, teamFixtures } from './model.js';
import { countdownLabel, routeHref } from './links.js';

// «Cambiar», «Ninguno» y «Elegir equipo» abren Explorar con el buscador enfocado: el ancla #buscar
// va tras la ruta, como #calendario en la ficha de equipo (B3).
const SEARCH = `${routeHref('explorar')}#buscar`;

// Ficha de un partido: su identidad (s, g, r, h, a) de §5.3, con la temporada siempre escrita
// para que un enlace compartido no cambie de partido al activarse la temporada siguiente.
const partidoHref = (match) => routeHref('partido', { s: match.season, g: match.groupId, r: match.roundKey, h: match.home, a: match.away });

// Escudo, nombre (el único h1), la etiqueta debajo y «Cambiar» (§4.2 A); en E y X, sin «Cambiar»:
// la caja ya ofrece buscar otro equipo.
function header(name, sub, { shields, change = true }) {
  return screenHead(name, {
    sub, crest: crest(name, { size: 46, shields, lazy: false }),
    action: change ? { href: SEARCH, label: 'Cambiar' } : null,
  });
}

// A y B: el próximo partido de mi equipo, con la cuenta atrás en Canarias como contexto.
function nextMatch(ctx, own) {
  const { next } = own.fixtures;
  return box(matchRow(next, { today: ctx.today, shields: own.shields, href: partidoHref(next) }),
    { title: 'Próximo partido', context: countdownLabel(next.dateISO, ctx.today) });
}

// Sin nada jugado, un único vacío (spec §4.2 B). Sus dos causas (M2 de B1): el grupo no ha
// empezado, o sí, pero mi equipo no ha jugado (un retirado, como CD Batán en PG2): en ese caso
// nunca se dice que no se ha jugado ninguna jornada.
function notPlayedText(group, name) {
  const started = group.rounds.some((round) => round.matches.some((m) => m.hs != null && m.as != null));
  if (!started) return 'Aún no se ha jugado ninguna jornada';
  if (retiredTeams(group).has(name)) return `${name} figura como retirado en este grupo`;
  return `${name} todavía no ha jugado ningún partido en este grupo`;
}

const BLOCKS = {
  A: nextMatch,
  B(ctx, own) {
    return html`${own.fixtures.next ? nextMatch(ctx, own) : ''}<section class="block">${empty(notPlayedText(own.group, own.name))}</section>`;
  },
  // C: sin próximo partido publicado, el último resultado (abre la ficha).
  C(ctx, own) {
    const { last } = own.fixtures;
    return box(matchRow(last, { today: ctx.today, shields: own.shields, href: partidoHref(last) }), { title: 'Último partido' });
  },
  // D: temporada terminada; «Así terminó» con la posición, los puntos y el balance.
  D(ctx, own) {
    const s = seasonSummary(own.name, own.group);
    return box(cells([
      { label: 'Posición', value: s.pos == null ? '—' : `${s.pos}.º de ${s.of}` },
      { label: 'Puntos', value: s.pts ?? '—' },
      { label: 'Balance', value: s.g == null ? '—' : `${s.g}G ${s.e}E ${s.p}P` },
    ]), { title: `Así terminó ${seasonLabel(own.group.season)}` });
  },
  // E: hay que preguntar (§6.3). La respuesta la guarda mount (Tarea 7).
  E(ctx, own) {
    const choices = (ctx.resolution.candidates || []).map((c, i) => html`<li><button type="button" class="choice" data-action="elegir" data-index="${i}">${crest(c.name, { size: 32, shields: own.shields })}<span class="choice-text"><span class="choice-name">${c.name}</span><span class="choice-label">${c.group.label}</span></span></button></li>`);
    return box(html`<ul class="choices">${choices}<li><a class="choice choice-none" href="${SEARCH}">Ninguno: buscar otro equipo</a></li></ul>`,
      { title: '¿En qué equipo juega ahora?' });
  },
  // X: mi equipo no está en la temporada del portal.
  X(ctx, own) {
    return html`<section class="block">${empty(`${own.name} no aparece en ${seasonLabel(ctx.portal.season)}`)}<div class="buttons home-cta"><a class="button is-main" href="${SEARCH}">Elegir equipo</a></div></section>`;
  },
};

export const screen = {
  id: 'home',
  needs() { return []; },
  render(ctx) {
    const { resolution } = ctx;
    const state = homeState({ resolution, todayISO: ctx.today, portalSeason: ctx.portal.season });
    const ok = resolution && resolution.status === 'ok';
    const name = ok ? resolution.name : ((ctx.myTeam && ctx.myTeam.name) || ctx.portal.defaultTeam.name);
    const group = ok ? resolution.group : null;
    const shields = (ctx.datasets && ctx.datasets.shields) || {};
    const own = { name, group, shields, fixtures: ok ? teamFixtures(name, group, ctx.today) : null };
    const sub = group ? group.label : `Temporada ${seasonLabel(ctx.portal.season)}`;
    return html`<section data-screen="home" data-state="${state}">${header(name, sub, { shields, change: ok })}${BLOCKS[state](ctx, own)}</section>`;
  },
};
