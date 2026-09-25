// Pantalla Goleadores (spec §4.7 y §4.1; decisión 25 de B3): la lista completa de una categoría
// (todos sus grupos, con los goles de cada jugador sumados por fases) o de un grupo, con el escudo,
// los goles, los partidos y el equipo, que abre su ficha. `t` deja un equipo (el nombre exacto) y
// `q` busca en jugador y equipo. render(ctx) es pura y pinta la `q` de la dirección (un enlace, Atrás
// o una recarga); mount filtra al escribir, repinta solo la lista y apunta la `q` en la dirección con
// nav.update, sin crear entradas ni mover el cursor (decisión 4). Solo hay goleadores de la temporada
// del portal: las pasadas dicen que no los hay.
import { html, join } from './html.js';
import { crest, empty, notice, screenHead, searchBox, segmented } from './ui.js';
import { findGroup, playerName, searchKey, seasonLabel } from './model.js';
import { routeHref, teamHref } from './links.js';
import { categoryScorers, groupScorers, rankScorers } from './state.js';
import { defaultCategory } from './myteam.js';

// La lista se pinta por páginas (decisión 159 de B3): con los datos vivos, benjamín pasa de 2.000
// jugadores, y pintarlos de una vez congelaba el móvil más de 10 s. Sin búsqueda, las 200 primeras y
// «Ver 200 más (quedan N)». Con una búsqueda, las 30 primeras y «Ver 100 más». Al escribir, también
// al borrar la búsqueda, la lista se repinta con 30 como mucho: repintar 200 filas pasaba de 200 ms
// por tecla con la CPU ×4, y una tecla no debe pasar de 100 ms. Para llegar a un jugador de la lista
// entera, el buscador.
export const PAGE_ROWS = 200;
export const SEARCH_FIRST = 30;
export const SEARCH_ROWS = 100;
const CATS = [{ value: 'benjamin', label: 'Benjamín' }, { value: 'prebenjamin', label: 'Prebenjamín' }];
const CAT_LABEL = { benjamin: 'Benjamín', prebenjamin: 'Prebenjamín' };
const CAT_NAME = { benjamin: 'benjamín', prebenjamin: 'prebenjamín' };
const BODY_ID = 'goleadores-filas';

// Las palabras de una búsqueda, con la normalización del buscador de Explorar (searchKey de model.js:
// sin tildes, mayúsculas ni puntuación). Desde dos letras, como allí; con menos, no filtra.
function queryWords(query) {
  const words = searchKey(query).split(' ').filter(Boolean);
  return words.join('').length >= 2 ? words : [];
}

// La búsqueda que filtra, normalizada ('' si no filtra): una letra más que no la cambia (la primera,
// o un espacio) no vuelve a pintar la lista.
const filterOf = (query) => queryWords(query).join(' ');
// Las filas de la primera página y las que añade cada «Ver N más», con búsqueda o sin ella.
const firstRows = (query) => (filterOf(query) ? SEARCH_FIRST : PAGE_ROWS);
const moreRows = (query) => (filterOf(query) ? SEARCH_ROWS : PAGE_ROWS);

// Las filas de un equipo (`team`, el nombre exacto) y de una búsqueda (`query`: cada palabra, en el
// jugador o en el equipo, en cualquier orden: «lucas leon» encuentra «León Rodríguez, Lucas»). La
// clave de cada fila (`key`, searchKey del jugador y el equipo) la calcula listOf una sola vez, y no
// cada tecla; una fila sin ella (otra lista) la calcula aquí.
export function filterScorers(rows, { team = '', query = '' } = {}) {
  const words = queryWords(query);
  return rows.filter((row) => (!team || row.team === team)
    && (!words.length || words.every((word) => (row.key ?? searchKey(`${row.name} ${row.team}`)).includes(word))));
}

// La lista de la ruta, entera y con su puesto en ella (rankScorers, el mismo de Récords), que se
// conserva al filtrar: la de un grupo (groupScorers, null si la fuente no lo publica) o la de la
// categoría (categoryScorers), y cuántos grupos suma. Cada fila lleva su clave de búsqueda.
function listOf(ctx) {
  const { params, model } = ctx;
  const s = params.s || ctx.portal.season;
  const group = params.g ? findGroup(model, s, params.g) : null;
  // Sin `c`, la categoría por defecto (decisión 25): la de mi equipo resuelto o la del equipo por defecto.
  const cat = group ? group.cat : params.c || defaultCategory(ctx.resolution, ctx.portal.defaultTeam);
  const gol = model.scorers(s, cat);
  const keyed = (rows) => rows && rows.map((row) => ({ ...row, key: searchKey(`${row.name} ${row.team}`) }));
  if (group) {
    const rows = groupScorers(gol, group.id);
    return { s, cat, group, rows: keyed(rows && rankScorers(rows.map((row) => ({ ...row, groupId: group.id })))), groups: 1 };
  }
  return { s, cat, group, rows: keyed(rankScorers(categoryScorers(gol))), groups: gol.length };
}

// Una fila; la primera de cada página que añade «Ver N más» lleva su id y tabindex -1: el foco va a ella.
function scorerRow(row, s, shields, id = null) {
  return html`<tr${id ? html` id="${id}" tabindex="-1"` : ''}><td class="st-pos">${row.pos}</td><th scope="row" class="gol-player"><span class="gol-name">${playerName(row.name)}</span><a class="gol-team" href="${teamHref(s, row.groupId, row.team)}">${crest(row.team, { shields })}<span class="gol-team-name">${row.team}</span></a></th><td class="sc-goals">${row.goals}</td><td class="sc-pj">${row.games}</td></tr>`;
}

// «Ver 200 más (quedan 1944)» y, en la última página, «Ver los 44 que quedan».
function moreText(left, page) {
  if (left > page) return `Ver ${page} más (quedan ${left})`;
  return left === 1 ? 'Ver el que queda' : `Ver los ${left} que quedan`;
}

// «13 de 586 jugadores» con un filtro; si no, «586 jugadores de 8 grupos» o, en un grupo, «149 jugadores».
function countText(shown, list) {
  const total = list.rows.length;
  if (shown !== total) return `${shown} de ${total} ${total === 1 ? 'jugador' : 'jugadores'}`;
  const players = `${total} ${total === 1 ? 'jugador' : 'jugadores'}`;
  return list.group ? players : `${players} de ${list.groups} ${list.groups === 1 ? 'grupo' : 'grupos'}`;
}

function noneText(team, query) {
  const words = queryWords(query);
  const q = String(query || '').trim();
  if (team && words.length) return `Ningún goleador de ${team} con «${q}».`;
  if (team) return `${team} no tiene goleadores en esta lista.`;
  return `Ningún jugador ni equipo con «${q}».`;
}

// La lista filtrada: su primera página (`first` filas) y, si hay más, «Ver N más», un botón que añade
// la página siguiente en mount (sin aria-expanded: no despliega ni pliega nada). La repinta mount al
// escribir, con SEARCH_FIRST filas como mucho.
function scorersList(rows, list, { team, query, shields, first = firstRows(query) }) {
  if (!rows.length) return empty(noneText(team, query));
  const caption = list.group ? `Goleadores de ${list.group.label}` : `Goleadores de ${CAT_NAME[list.cat]}, todos los grupos`;
  const table = html`<div class="box"><table class="standings group-scorers gol-table"><caption class="vh">${caption}</caption><thead><tr><th scope="col" class="st-pos"><abbr title="Puesto">#</abbr></th><th scope="col" class="gol-player">Jugador</th><th scope="col" class="sc-goals">Goles</th><th scope="col" class="sc-pj"><abbr title="Partidos jugados">PJ</abbr></th></tr></thead><tbody id="${BODY_ID}">${rows.slice(0, first).map((row) => scorerRow(row, list.s, shields))}</tbody></table></div>`;
  const more = rows.length > first
    ? html`<button type="button" class="gol-more" data-action="ver-mas" aria-controls="${BODY_ID}">${moreText(rows.length - first, moreRows(query))}</button>`
    : '';
  return html`${table}${more}`;
}

function render(ctx) {
  const { params } = ctx;
  const shields = (ctx.datasets && ctx.datasets.shields) || {};
  const list = listOf(ctx);
  const { s, cat, group } = list;
  const past = s !== ctx.portal.season;
  const where = group ? group.label : `${CAT_LABEL[cat]}, todos los grupos`;
  const action = group ? { href: routeHref('goleadores', { s, c: group.cat, t: params.t }), label: 'Todos los grupos' } : null;
  const head = screenHead('Goleadores', { sub: past ? `${where} · ${seasonLabel(s)}` : where, back: ctx.backHref, action });
  const screenHtml = (content) => html`<section data-screen="goleadores">${head}${content}</section>`;
  if (past) return screenHtml(empty(`No hay goleadores de la temporada ${seasonLabel(s)}: esta web solo guarda los de la temporada actual.`));
  const cats = group ? '' : html`<nav class="gol-cats" aria-label="Categoría">${segmented(CATS, cat, (value) => routeHref('goleadores', { s, c: value }), { idPrefix: 'categoria' })}</nav>`;
  if (!list.rows) return screenHtml(html`${cats}${empty('La fuente de este grupo no publica goleadores.')}`);
  if (!list.rows.length) {
    return screenHtml(html`${cats}${empty(group ? 'Todavía no hay goles registrados en este grupo.' : `Todavía no hay goleadores de ${CAT_NAME[cat]} en la temporada ${seasonLabel(s)}.`)}`);
  }
  const team = params.t || '';
  const rows = filterScorers(list.rows, { team, query: params.q });
  const search = searchBox({ id: 'buscar-goleador', value: params.q || '', label: 'Buscar un jugador o un equipo', placeholder: 'Buscar jugador o equipo' });
  const only = team ? notice('Equipo:', html`${team} · <a class="more" href="${routeHref('goleadores', { ...params, t: '' })}">Ver todos los equipos</a>`) : '';
  const summed = !group && list.rows.some((row) => row.groups.length > 1)
    ? notice(null, 'Cada jugador suma sus goles y sus partidos de todos los grupos en los que jugó con el mismo equipo: la Primera y la Segunda Fase.')
    : '';
  return screenHtml(html`${cats}${search}${only}<p class="gol-count" role="status">${countText(rows.length, list)}</p><div data-scorers>${scorersList(rows, list, { team, query: params.q, shields })}</div>${summed}`);
}

// El buscador filtra la lista al escribir (la misma filterScorers de render, con las claves que listOf
// calculó una vez), la repinta sola desde el principio, con 30 filas como mucho, también al borrar la
// búsqueda (el campo no se toca: ni el cursor ni el teclado), y apunta la `q` en la dirección con
// nav.update, sin una entrada por letra (decisión 4); sin temporizadores, que podrían escribir sobre
// otra ruta. Una letra que no cambia la búsqueda no repinta nada. «Ver N más» añade la página
// siguiente al final de la tabla (nunca repinta lo que ya está) y lleva el foco a su primera fila.
// Las escuchas van en la sección, que se sustituye en cada pintado.
function mount(root, ctx, nav) {
  const section = root && root.matches && root.matches('[data-screen="goleadores"]') ? root : root && root.querySelector('[data-screen="goleadores"]');
  const box = section && section.querySelector('[data-scorers]');
  if (!box) return;
  const shields = (ctx.datasets && ctx.datasets.shields) || {};
  const list = listOf(ctx);
  const team = ctx.params.t || '';
  const count = section.querySelector('.gol-count');
  let query = ctx.params.q || '';
  let rows = filterScorers(list.rows, { team, query });
  let shown = Math.min(rows.length, firstRows(query));
  section.addEventListener('input', (event) => {
    const input = event.target;
    if (!input || input.id !== 'buscar-goleador') return;
    const changed = filterOf(input.value) !== filterOf(query);
    query = input.value;
    if (changed) {
      rows = filterScorers(list.rows, { team, query });
      shown = Math.min(rows.length, SEARCH_FIRST);
      box.innerHTML = String(scorersList(rows, list, { team, query, shields, first: SEARCH_FIRST }));
      if (count) count.textContent = countText(rows.length, list);
    }
    if (nav && typeof nav.update === 'function') nav.update({ ...ctx.params, q: query });
  });
  section.addEventListener('submit', (event) => {
    event.preventDefault();
    const input = section.querySelector('#buscar-goleador');
    if (input && typeof input.blur === 'function') input.blur();
  });
  section.addEventListener('click', (event) => {
    const button = event.target && event.target.closest ? event.target.closest('[data-action="ver-mas"]') : null;
    const body = button ? section.querySelector(`#${BODY_ID}`) : null;
    if (!body) return;
    const page = moreRows(query);
    const next = rows.slice(shown, shown + page);
    if (!next.length) return;
    const first = `goleador-${shown + 1}`;
    body.insertAdjacentHTML('beforeend', String(join(next.map((row, i) => scorerRow(row, list.s, shields, i === 0 ? first : null)))));
    shown += next.length;
    const left = rows.length - shown;
    if (left > 0) button.textContent = moreText(left, page);
    else button.remove();
    const row = section.querySelector(`#${first}`);
    if (row && typeof row.focus === 'function') row.focus();
  });
}

export const screen = {
  id: 'goleadores',
  // Los goleadores son datos inmediatos (data-goleadores.js); una temporada pasada la carga el router.
  needs: () => [],
  render,
  mount,
};
