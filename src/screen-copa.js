// Pantalla Copa (spec §4.7 y §8; decisiones 22 y 23 de B3): una copa de la federación (Copa de
// Campeones e insulares) o un torneo (la Maspalomas Cup).
// - Cuadro (cup-bracket): el campeón arriba y las rondas en columnas, con quién pasó cada partido
//   (también por penaltis) y el camino de mi equipo resaltado. En móvil, una ronda por pantalla: las
//   columnas van en un contenedor con desplazamiento horizontal y ajuste, la única excepción de §8,
//   con pestañas de ronda que son botones y lo desplazan (mount). Desde 1024 px, todas las columnas.
// - Liguilla (cup-league): la clasificación, con la fila de mi equipo, y los partidos.
// render(ctx) es pura. El router garantiza que `g` existe en `s` y no es de liga (decisión 3).
import { html } from './html.js';
import { block, box, crest, empty, matchNote, matchRow, screenHead, standingsTable } from './ui.js';
import { errorBox } from './shell.js';
import { bracket, findGroup, matchState, seasonLabel } from './model.js';
import { dayMonth, matchHref, weekdayDate } from './links.js';
import { cupTeamOf } from './myteam.js';

// Mi equipo, para el resalte: el resuelto o, sin resolver (E o X), el guardado. cupTeamOf lo busca
// en el torneo por club y letra de filial, porque allí se llama de otra forma.
const mineOf = (ctx) => (ctx.resolution && ctx.resolution.status === 'ok'
  ? { name: ctx.resolution.name, cat: ctx.resolution.cat }
  : ctx.myTeam);
const plays = (me, m) => me !== null && (m.home === me || m.away === me);

// ── Cuadro ───────────────────────────────────────────────────────────────

// Un partido del cuadro: los dos equipos en dos líneas, con sus goles. Quién pasó (el del cuadro,
// decisión 22) va en negrita y con «pasó» para los lectores de pantalla. Debajo, la nota de
// penaltis de matchNote (ui.js) con ese mismo equipo o, si el cuadro contradice al marcador, las
// dos cosas (spec §7). En un empate sin columna de penaltis ni tanda (la Copa de Campeones), la
// fuente no dice cómo se decidió: «Pasó X, según el cuadro» (decisión 162). El partido de mi
// equipo, con el resalte propio.
function bracketMatch({ match, advancer, conflict }, me, today, shields) {
  const state = matchState(match, today);
  const played = state === 'jugado';
  const line = (side) => {
    const team = match[side];
    const through = advancer === side;
    const cls = ['bm-team', through ? 'is-through' : '', team === me ? 'is-me' : ''].filter(Boolean).join(' ');
    const goals = played ? (side === 'home' ? match.hs : match.as) : '–';
    return html`<span class="${cls}">${crest(team, { shields })}<span class="bm-name">${team}</span>${through ? html`<span class="vh"> (pasó)</span>` : ''}<span class="bm-goals">${goals}</span></span>`;
  };
  const byBracket = played && match.hs === match.as && advancer && !match.advancer && !match.shootout;
  const text = conflict
    ? `Según el cuadro pasó ${match[advancer]}, aunque el marcador publicado dice lo contrario.`
    : byBracket ? `Pasó ${match[advancer]}, según el cuadro` : matchNote({ ...match, advancer }, state);
  const note = text ? html`<span class="${conflict ? 'bm-note is-conflict' : 'bm-note'}">${text}</span>` : '';
  const when = [match.time, match.venue].filter(Boolean).join(' · ');
  const mine = plays(me, match);
  return html`<a class="${mine ? 'bm is-mine' : 'bm'}" href="${matchHref(match)}">${mine ? html`<span class="vh">Partido de mi equipo. </span>` : ''}${when ? html`<span class="bm-when">${when}</span>` : ''}${line('home')}${line('away')}${note}</a>`;
}

// El campeón, arriba (spec §4.7): quién pasó de la final, con su escudo, y la final debajo.
function championBlock(rounds, champion, me, today, shields) {
  if (!champion) return block('Campeón', empty('Todavía no hay campeón: la final no tiene resultado publicado.'));
  const final = rounds[rounds.length - 1].matches[0].match;
  const mine = champion === me;
  const name = html`<p class="${mine ? 'cup-champion is-mine' : 'cup-champion'}">${crest(champion, { size: 32, shields, lazy: false })}<span class="cup-champion-name">${champion}</span>${mine ? html`<span class="vh"> (mi equipo)</span>` : ''}</p>`;
  const row = matchRow(final, { mine: plays(me, final), today, shields, href: matchHref(final) });
  return box(html`${name}${row}`, { title: 'Campeón', context: final.dateISO ? `final, ${dayMonth(final.dateISO)}` : 'final' });
}

// Las rondas en columnas, con sus pestañas. Los id son estables (ronda-N y ronda-N-tab): las
// pestañas apuntan a su columna, y mount desplaza el contenedor hasta ella. En el primer pintado se
// ve la primera ronda.
function bracketView(group, me, today, shields) {
  const { rounds, champion } = bracket(group);
  if (!rounds.length) return block('Cuadro', empty('La fuente todavía no ha publicado los partidos de esta copa.'));
  const tabs = html`<div class="bracket-tabs" role="group" aria-label="Rondas del cuadro">${rounds.map((round, i) => html`<button type="button" class="bracket-tab" id="ronda-${i + 1}-tab" data-action="ronda" aria-controls="ronda-${i + 1}"${i === 0 ? html` aria-current="true"` : ''}>${round.label}</button>`)}</div>`;
  const columns = rounds.map((round, i) => html`<section class="bracket-round" id="ronda-${i + 1}" aria-labelledby="ronda-${i + 1}-titulo"><div class="bracket-head"><h3 class="bracket-title" id="ronda-${i + 1}-titulo">${round.label}</h3>${round.dateFrom ? html`<p class="bracket-date">${dayMonth(round.dateFrom)}</p>` : ''}</div><ol class="bracket-matches">${round.matches.map((item) => html`<li>${bracketMatch(item, me, today, shields)}</li>`)}</ol></section>`);
  const count = `${rounds.length} ${rounds.length === 1 ? 'ronda' : 'rondas'}`;
  return html`${championBlock(rounds, champion, me, today, shields)}${block('Cuadro', html`${tabs}<div class="bracket" role="region" aria-label="Cuadro, una columna por ronda" tabindex="0">${columns}</div>`, { context: count })}`;
}

// ── Liguilla ─────────────────────────────────────────────────────────────

// La clasificación de la fuente con la fila de mi equipo, y los partidos en su orden, cada uno con
// su día (y su jornada, si hay varias). Sin enlaces a las fichas: la de un equipo de copa es la copa.
function leagueView(group, me, today, shields) {
  const table = group.standings.length
    ? box(standingsTable(group.standings, { view: 'puntos', mine: me, shields, caption: `Clasificación de ${group.label}` }), { title: 'Clasificación' })
    : block('Clasificación', empty('Clasificación sin publicar.'));
  const several = group.rounds.length > 1;
  const items = group.rounds.flatMap((round) => round.matches.map((m) => html`<li><p class="cal-when">${several ? `${round.label} · ` : ''}${weekdayDate(m.dateISO) || 'sin fecha'}</p>${matchRow(m, { mine: plays(me, m), today, shields, href: matchHref(m) })}</li>`));
  const matches = items.length
    ? block('Partidos', html`<ol class="box cal">${items}</ol>`, { context: `${items.length} partidos` })
    : block('Partidos', empty('La fuente todavía no ha publicado los partidos de esta copa.'));
  return html`${table}${matches}`;
}

// ── Pantalla ─────────────────────────────────────────────────────────────

function render(ctx) {
  const { params, model, today } = ctx;
  const shields = (ctx.datasets && ctx.datasets.shields) || {};
  const s = params.s || ctx.portal.season;
  const back = ctx.backHref;
  // Sin la temporada: la caja de error, nunca otra temporada (§7). El router la carga antes (decisión 2).
  if (!model.season(s)) {
    return html`<section data-screen="copa">${screenHead('Copa', { back })}${errorBox(`la temporada ${seasonLabel(s)}`)}</section>`;
  }
  const group = findGroup(model, s, params.g);
  // El router no deja llegar aquí sin una copa (decisión 3): una llamada directa, nunca en blanco.
  if (!group || group.kind === 'league') {
    return html`<section data-screen="copa">${screenHead('Copa', { back })}${empty(`No hay ninguna copa ${params.g || ''} en la temporada ${seasonLabel(s)}.`)}</section>`;
  }
  const sub = s === ctx.portal.season ? group.label : `${group.label} · ${seasonLabel(s)}`;
  const me = cupTeamOf(group, mineOf(ctx), model.clubIndex());
  const body = group.kind === 'cup-bracket' ? bracketView(group, me, today, shields) : leagueView(group, me, today, shields);
  return html`<section data-screen="copa">${screenHead('Copa', { sub, back })}${body}</section>`;
}

// Las pestañas: desplazan el contenedor hasta su columna (con suavidad solo si el sistema no pide
// menos movimiento, spec §3.4) y marcan la ronda a la vista con aria-current, también al deslizar
// con el dedo. En móvil, el contenedor toma el alto de la ronda a la vista: sin eso, una final de un
// partido dejaría debajo el hueco de los dieciseisavos. Un ResizeObserver lo recalcula si la ronda
// cambia de alto (al llegar la fuente o al girar el móvil), y la limpieza que devuelve mount, que el
// router llama antes del pintado siguiente, lo desconecta. Desde 1024 px no hay pestañas ni alto fijo
// (el CSS lo anula). Las escuchas van en la sección y en el contenedor, que se sustituyen al pintar.
function mount(root) {
  const section = root && root.matches && root.matches('[data-screen="copa"]') ? root : root && root.querySelector('[data-screen="copa"]');
  const strip = section && section.querySelector('.bracket');
  const tabs = strip ? [...section.querySelectorAll('[data-action="ronda"]')] : [];
  if (!tabs.length) return undefined;
  const columns = tabs.map((tab) => section.querySelector(`#${tab.getAttribute('aria-controls')}`));
  let current = 0;
  const fit = () => { if (columns[current]) strip.style.height = `${columns[current].offsetHeight}px`; };
  const show = (i) => {
    current = i;
    tabs.forEach((tab, k) => (k === i ? tab.setAttribute('aria-current', 'true') : tab.removeAttribute('aria-current')));
    fit();
  };
  section.addEventListener('click', (event) => {
    const tab = event.target && event.target.closest ? event.target.closest('[data-action="ronda"]') : null;
    const i = tabs.indexOf(tab);
    if (i < 0 || !columns[i]) return;
    const smooth = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: no-preference)').matches;
    strip.scrollTo({ left: columns[i].offsetLeft, behavior: smooth ? 'smooth' : 'auto' });
    show(i);
  });
  strip.addEventListener('scroll', () => {
    show(Math.min(tabs.length - 1, Math.max(0, Math.round(strip.scrollLeft / (strip.clientWidth || 1)))));
  }, { passive: true });
  show(0);
  if (typeof ResizeObserver !== 'function') return undefined;
  const observer = new ResizeObserver(fit);
  columns.forEach((column) => { if (column) observer.observe(column); });
  return () => observer.disconnect();
}

export const screen = {
  id: 'copa',
  // Todo sale de los datos inmediatos (la temporada del portal y los torneos) o de la temporada
  // pasada, que carga el router (decisión 2).
  needs: () => [],
  render,
  mount,
};
