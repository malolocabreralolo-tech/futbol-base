// Pantalla Ligas (spec §4.7, §4.1 y §4.11; decisiones 19, 20 y 21 de B3). render(ctx) es pura:
// - sin `f`, las competiciones de la categoría `c` (o de las dos), filtradas por isla si llega `i`, que
//   abren su lista de grupos (#/ligas?s&c&f); con `to` (de «Otro grupo», o de Jornada y Tabla sin mi
//   equipo), solo las ligas;
// - con `f`, los grupos de esa competición (de las dos categorías si no llega `c`: la clave se repite,
//   decisión 19), con su nombre, sus equipos, su ronda y su líder o su campeón. Cada grupo abre la
//   pantalla de `to` o, sin ella, su Tabla o su Copa según su tipo;
// - en una competición con 2 grupos de liga o más, «Comparar grupos»: un botón con aria-expanded que
//   mount despliega, con la tabla de compareGroups pintada bajo demanda (sin parámetro en la dirección).
// La temporada de la ruta la carga el router (decisión 2), que también deja `c`, `i` y `to` válidos o
// los quita (decisión 3); la barra marca el destino de `to` (activeTab).
import { html } from './html.js';
import { screenHead, block, crest, empty, notice, linkRow, listEs } from './ui.js';
import { errorBox } from './shell.js';
import { competitions, compareGroups, groupSummary, seasonLabel } from './model.js';
import { routeHref, teamHref } from './links.js';
import { myTeamIn } from './myteam.js';

const CAT_NAMES = { benjamin: 'Benjamín', prebenjamin: 'Prebenjamín' };
const ISLAND_NAMES = { grancanaria: 'Gran Canaria', lanzarote: 'Lanzarote', fuerteventura: 'Fuerteventura' };
const CAT_KEYS = ['benjamin', 'prebenjamin'];
const count = (n, one, many) => `${n} ${n === 1 ? one : many}`;
const shieldsOf = ctx => (ctx.datasets && ctx.datasets.shields) || {};
const seasonOf = ctx => (ctx.params && ctx.params.s) || ctx.portal.season;

/* Lo que enseña la ruta, para render y mount: la temporada, las competiciones (ya filtradas por `c`,
 * `i` y, sin `f`, por `to`) y las de la clave `f`. */
export function ligasView(ctx) {
  const s = seasonOf(ctx);
  const { c = null, i = null, f = null, to = null } = ctx.params || {};
  const all = competitions(ctx.model, s, { cat: c, island: i });
  return { s, c, i, f, to, list: f ? [] : all.filter(e => !to || e.kind === 'liga'), chosen: f ? all.filter(e => e.key === f) : [] };
}

// Las competiciones con «Comparar grupos»: 2 grupos de liga o más (decisión 21).
const comparable = entry => entry.groups.filter(g => g.kind === 'league').length >= 2;

// «Benjamín», «Benjamín y prebenjamín»; «de Gran Canaria» si llega la isla.
function scopeText(cats, island) {
  const names = cats.map((cat, k) => (k ? CAT_NAMES[cat].toLowerCase() : CAT_NAMES[cat]));
  return `${listEs(names)}${island ? ` de ${ISLAND_NAMES[island]}` : ''}`;
}

// ── Sin `f`: las competiciones ───────────────────────────────────────────

function competitionsBlocks(ctx, view) {
  const { s, c, i, to, list } = view;
  if (!list.length) {
    const what = to ? 'ligas' : 'competiciones';
    const cats = c ? [c] : CAT_KEYS;
    return empty(`No hay ${what} de ${listEs(cats.map(cat => CAT_NAMES[cat].toLowerCase()))}${i ? ` en ${ISLAND_NAMES[i]}` : ''} en la temporada ${seasonLabel(s)}.`);
  }
  return CAT_KEYS.map(cat => list.filter(e => e.cat === cat)).filter(entries => entries.length).map((entries) => {
    const total = entries.reduce((n, e) => n + e.groups.length, 0);
    const rows = entries.map(e => html`<li>${linkRow(routeHref('ligas', { s, c: e.cat, f: e.key, to }), e.label, { context: count(e.groups.length, 'grupo', 'grupos') })}</li>`);
    return block(CAT_NAMES[entries[0].cat], html`<ul class="box link-list">${rows}</ul>`, { context: count(total, 'grupo', 'grupos') });
  });
}

// ── Con `f`: los grupos de la competición ────────────────────────────────

/* Una fila por grupo (decisión 20): su nombre; los equipos y el líder o el campeón debajo; la ronda en
 * curso a la derecha. Abre la pantalla de `to` (un grupo de liga) o, sin ella, su Tabla o su Copa. El
 * grupo resuelto de mi equipo lleva el resalte propio. */
function groupRow(ctx, group, to) {
  const g = groupSummary(group);
  const s = group.season;
  const target = group.kind === 'league' ? (to || 'tabla') : 'copa';
  const detail = [g.teams ? count(g.teams, 'equipo', 'equipos') : null, g.leader ? `líder: ${g.leader}` : null,
    g.champion ? `campeón: ${g.champion}` : null].filter(Boolean).join(' · ');
  const r = ctx.resolution;
  const mine = r && r.status === 'ok' && r.group && r.group.season === s && r.group.id === group.id;
  const title = mine ? html`${g.label}<span class="vh"> (grupo de mi equipo)</span>` : g.label;
  return html`<li>${linkRow(routeHref(target, { s, g: group.id }), title, { detail, context: g.round ? g.round.toLowerCase() : null, cls: mine ? 'group-row is-mine' : 'group-row' })}</li>`;
}

// «2,82»: los puntos por partido con dos decimales y coma; la diferencia de goles con su signo («−30»).
const ppjText = ppj => ppj.toFixed(2).replace('.', ',');
const signed = n => (n > 0 ? `+${n}` : n < 0 ? `−${-n}` : '0');

/* La tabla de «Comparar grupos» de una competición (decisión 21), la que mount pinta bajo demanda:
 * compareGroups con su grupo en una columna («2» por «Grupo 2») y la diferencia de goles, que desempata;
 * cada equipo a su ficha, mi equipo con el resalte propio y los retirados al final, sin puntos por
 * partido. */
export function compareView(ctx, entry) {
  const byId = new Map(entry.groups.map(g => [g.id, g]));
  const mine = new Map(entry.groups.map(g => [g.id, myTeamIn(g, ctx.myTeam, ctx.resolution)]));
  const shields = shieldsOf(ctx);
  const body = compareGroups(entry.groups).map((row, k) => {
    const group = byId.get(row.groupId);
    const isMine = mine.get(row.groupId) === row.team;
    const cells = html`<td class="st-pos">${k + 1}</td><th scope="row" class="st-team"><a class="st-link" href="${teamHref(group.season, group.id, row.team)}">${crest(row.team, { shields })}<span class="st-name">${row.team}</span></a>${isMine ? html`<span class="vh"> (mi equipo)</span>` : ''}</th><td class="cmp-group">${row.groupLabel.replace(/^Grupo\s+/i, '')}</td><td class="st-num st-pj">${row.pj}</td><td class="st-dg">${signed(row.dg)}</td><td class="st-pts">${row.pts}</td><td class="cmp-ppj">${row.retired ? html`<span class="st-retired">retirado</span>` : ppjText(row.ppj)}</td>`;
    return html`<tr${isMine ? html` class="is-mine"` : ''}>${cells}</tr>`;
  });
  const caption = `Comparación de los grupos de ${entry.label}, ${CAT_NAMES[entry.cat].toLowerCase()}`;
  return html`${notice(null, 'Por puntos por partido; a igualdad, por puntos, diferencia de goles y nombre. Los retirados, al final.')}<div class="box"><table class="standings compare-table"><caption class="vh">${caption}</caption><thead><tr><th scope="col" class="st-pos"><abbr title="Posición">#</abbr></th><th scope="col" class="st-team">Equipo</th><th scope="col" class="cmp-group"><abbr title="Grupo">Gr.</abbr></th><th scope="col" class="st-num st-pj"><abbr title="Partidos jugados">J</abbr></th><th scope="col" class="st-dg"><abbr title="Diferencia de goles">DG</abbr></th><th scope="col" class="st-pts"><abbr title="Puntos">Pts</abbr></th><th scope="col" class="cmp-ppj"><abbr title="Puntos por partido">Pts/J</abbr></th></tr></thead><tbody>${body}</tbody></table></div>`;
}

function groupsBlocks(ctx, view) {
  const { s, f, to, chosen } = view;
  if (!chosen.length) {
    return html`${empty(`No encontramos la competición «${f}» en la temporada ${seasonLabel(s)}.`)}<ul class="box link-list"><li>${linkRow(routeHref('ligas', { s, c: view.c, i: view.i, to }), 'Ver todas las competiciones')}</li></ul>`;
  }
  return chosen.map((entry) => {
    const rows = entry.groups.map(group => groupRow(ctx, group, to));
    const id = `comparar-${entry.cat}`;
    const compare = comparable(entry)
      ? html`<button class="button compare-toggle" type="button" id="${id}" data-action="comparar" aria-expanded="false" aria-controls="${id}-tabla">Comparar grupos</button><div class="compare" id="${id}-tabla" hidden></div>`
      : '';
    return block(CAT_NAMES[entry.cat], html`<ul class="box link-list">${rows}</ul>${compare}`, { context: count(entry.groups.length, 'grupo', 'grupos') });
  });
}

// ── Pantalla ────────────────────────────────────────────────────────────

function render(ctx) {
  const view = ligasView(ctx);
  const { s, c, i, f, chosen } = view;
  const back = ctx.backHref;
  // La temporada de la ruta la carga el router (decisión 2 de B3); si aun así no está, la caja de
  // error con «Reintentar», nunca otra temporada (§7).
  if (!ctx.model.season(s)) {
    return html`<section data-screen="ligas">${screenHead('Ligas', { back })}${errorBox(`la temporada ${seasonLabel(s)}`)}</section>`;
  }
  if (f && chosen.length) {
    const cats = [...new Set(chosen.map(e => e.cat))];
    const head = screenHead(chosen[0].label, { sub: `${scopeText(cats, null)} · ${seasonLabel(s)}`, back });
    return html`<section data-screen="ligas">${head}${groupsBlocks(ctx, view)}</section>`;
  }
  const head = screenHead('Ligas', { sub: `${scopeText(c ? [c] : CAT_KEYS, i)} · ${seasonLabel(s)}`, back });
  return html`<section data-screen="ligas">${head}${f ? groupsBlocks(ctx, view) : competitionsBlocks(ctx, view)}</section>`;
}

/* «Comparar grupos»: cada botón despliega su tabla (compareView), que se pinta la primera vez que se
 * abre (Html de html``, que escapa cada dato) y después solo se muestra o se esconde. Las escuchas van
 * en los botones, que se sustituyen con la sección en cada pintado. */
function mount(root, ctx) {
  for (const entry of ligasView(ctx).chosen.filter(comparable)) {
    const button = root.querySelector(`#comparar-${entry.cat}`);
    const box = root.querySelector(`#comparar-${entry.cat}-tabla`);
    if (!button || !box) continue;
    button.addEventListener('click', () => {
      const open = button.getAttribute('aria-expanded') !== 'true';
      button.setAttribute('aria-expanded', String(open));
      button.textContent = open ? 'Ocultar la comparación' : 'Comparar grupos';
      if (open && !box.innerHTML) box.innerHTML = String(compareView(ctx, entry));
      box.hidden = !open;
    });
  }
}

export const screen = {
  id: 'ligas',
  // Nada que cargar: los grupos salen de la temporada de la ruta, que carga el router (decisión 2 de B3),
  // y de los torneos, que son datos inmediatos.
  needs: () => [],
  render,
  mount,
};
