// Pantalla Explorar (spec §4.7; maqueta 5-4): el selector de temporada, el buscador de equipos,
// «Vistos hace poco», las ligas por categoría, las copas y los torneos, y «Más». Es un destino
// principal. render(ctx) es pura y pinta los resultados de la `q` de la dirección (un enlace directo,
// Atrás o una recarga); mount filtra al escribir con la misma función (searchView), repinta solo la
// lista y apunta la búsqueda con nav.update, sin volver a pintar la pantalla: el cursor no salta y
// Atrás no recorre cada letra (decisión 4 de B3). La temporada de la ruta la carga el router
// (decisión 2); el foco del ancla #buscar lo pone el router, nunca mount.
import { html } from './html.js';
import { screenHead, block, crest, empty, notice, searchBox, seasonPicker, linkRow, listEs } from './ui.js';
import { errorBox } from './shell.js';
import { competitionKey, competitions, findGroup, groupSummary, searchKey, searchTeams, seasonLabel } from './model.js';
import { canaryDateTime, dayMonth, monthName, routeHref, teamHref } from './links.js';
import { ensureHealth } from './state.js';

const CAT_NAMES = { benjamin: 'Benjamín', prebenjamin: 'Prebenjamín' };
const CAT_SHORT = { benjamin: 'benj.', prebenjamin: 'preb.' };
const CAT_KEYS = ['benjamin', 'prebenjamin'];
const PICKER_ID = 'temporada';
const count = (n, one, many) => `${n} ${n === 1 ? one : many}`;
const shieldsOf = ctx => (ctx.datasets && ctx.datasets.shields) || {};
const seasonOf = ctx => (ctx.params && ctx.params.s) || ctx.portal.season;

// ── Buscador ────────────────────────────────────────────────────────────

function resultRow(entry, { cup, shields }) {
  const { name, group } = entry;
  // Liga: la ficha del equipo. Copa o torneo: su cuadro o su liguilla (decisión 17 de B3).
  const href = cup ? routeHref('copa', { s: group.season, g: group.id }) : teamHref(group.season, group.id, name);
  return html`<li><a class="search-result" href="${href}">${crest(name, { size: 32, shields })}<span class="search-result-text"><span class="search-result-name">${name}</span><span class="search-result-label">${group.label}</span></span></a></li>`;
}

/* Los resultados de `q` en la temporada de la ruta: la lista (Html) y la frase de la región de estado,
 * que dice cuántos hay a los lectores de pantalla mientras se escribe. Sin búsqueda, nada; con menos de
 * 2 letras, un aviso; sin resultados, un vacío que lo dice. La usan render (la q de la dirección) y
 * mount (lo que se escribe): el mismo resultado por los dos caminos. */
export function searchView(ctx, q) {
  const text = String(q ?? '');
  if (!text.trim()) return { list: html``, status: '' };
  const s = seasonOf(ctx);
  if (searchKey(text).length < 2) {
    const hint = 'Escribe al menos 2 letras del nombre del equipo.';
    return { list: notice(null, hint), status: hint };
  }
  const { leagues, cups } = searchTeams(ctx.model, s, text);
  const total = leagues.length + cups.length;
  if (!total) {
    const none = `No encontramos ningún equipo con «${text.trim()}» en la temporada ${seasonLabel(s)}.`;
    return { list: empty(none), status: none };
  }
  const shields = shieldsOf(ctx);
  const list = (entries, cup) => html`<ul class="box search-list">${entries.map(entry => resultRow(entry, { cup, shields }))}</ul>`;
  return {
    list: html`${leagues.length ? block('Resultados', list(leagues, false), { context: count(leagues.length, 'equipo', 'equipos') }) : ''}${cups.length ? block('En copas y torneos', list(cups, true), { context: count(cups.length, 'equipo', 'equipos') }) : ''}`,
    status: count(total, 'equipo encontrado', 'equipos encontrados'),
  };
}

// ── Vistos hace poco ────────────────────────────────────────────────────

/* Una ficha vista (ctx.recent: [{ s, g, t }], la más reciente primero). Su grupo sale del modelo si
 * su temporada está cargada, o de los torneos (los MC* de la migración v1, B1:8012): así se sabe su
 * categoría y si es de liga. Un grupo que no es de liga abre su cuadro o su liguilla (#/copa). Con la
 * temporada sin cargar, abre la ficha igual (el router carga la temporada y valida el grupo) y enseña la
 * temporada en lugar de la categoría, que no se sabe sin cargarla. */
function recentChip(ctx, entry, shields) {
  const group = findGroup(ctx.model, entry.s, entry.g);
  const href = group && group.kind !== 'league' ? routeHref('copa', { s: entry.s, g: entry.g }) : teamHref(entry.s, entry.g, entry.t);
  const cat = group ? html`<abbr title="${CAT_NAMES[group.cat]}">${CAT_SHORT[group.cat]}</abbr>` : '';
  const season = entry.s !== ctx.portal.season ? seasonLabel(entry.s) : '';
  const meta = cat && season ? html`${cat} · ${season}` : cat || season;
  return html`<li><a class="recent-chip" href="${href}">${crest(entry.t, { shields })}<span class="recent-name">${entry.t}</span>${meta ? html`<span class="recent-meta">${meta}</span>` : ''}</a></li>`;
}

// Sin fichas vistas, el bloque no sale (la primera visita no enseña un vacío).
function recentBlock(ctx) {
  const recent = Array.isArray(ctx.recent) ? ctx.recent : [];
  if (!recent.length) return '';
  const shields = shieldsOf(ctx);
  return block('Vistos hace poco', html`<ul class="recent">${recent.map(entry => recentChip(ctx, entry, shields))}</ul>`);
}

// ── Ligas, copas y torneos ──────────────────────────────────────────────

// Ligas (decisión 18 de B3): por categoría, una fila por competición con su recuento de grupos, que abre
// #/ligas?s&c&f. El contexto del bloque es el total de grupos de liga de la temporada.
function leaguesBlock(ctx, s) {
  const leagues = competitions(ctx.model, s).filter(c => c.kind === 'liga');
  if (!leagues.length) return block('Ligas', empty(`No hay ligas en la temporada ${seasonLabel(s)}.`));
  const total = leagues.reduce((n, c) => n + c.groups.length, 0);
  const cats = CAT_KEYS.map(cat => [cat, leagues.filter(c => c.cat === cat)]).filter(([, list]) => list.length);
  return block('Ligas', html`<div class="box">${cats.map(([cat, list]) => html`<h3 class="link-head">${CAT_NAMES[cat]}</h3><ul class="link-list">${list.map(c => html`<li>${linkRow(routeHref('ligas', { s, c: cat, f: c.key }), c.label, { context: count(c.groups.length, 'grupo', 'grupos') })}</li>`)}</ul>`)}</div>`,
    { context: count(total, 'grupo', 'grupos') });
}

// Los meses de un torneo («junio», «junio y julio»), de las fechas de sus partidos.
function monthsOf(groups) {
  const days = groups.flatMap(g => g.rounds.flatMap(r => r.matches.map(m => m.dateISO))).filter(Boolean).sort();
  const names = [...new Set(days.map(monthName))];
  return names.length ? listEs(names) : null;
}

/* Copas y torneos (decisiones 18 y 19 de B3): una fila por competición, con las dos categorías juntas,
 * que abre #/ligas?s&f sin `c` (Ligas lista las dos). La Copa de Campeones enseña sus campeones; un
 * torneo, sus meses; una copa insular, sus grupos. Sin copas en la temporada, el bloque no sale. */
function cupsBlock(ctx, s) {
  const byKey = new Map();
  for (const c of competitions(ctx.model, s).filter(entry => entry.kind === 'copa')) {
    const row = byKey.get(c.key) || { key: c.key, label: c.label, groups: [] };
    row.groups.push(...c.groups);
    byKey.set(c.key, row);
  }
  if (!byKey.size) return '';
  const rows = [...byKey.values()].map(({ key, label, groups }) => {
    const href = routeHref('ligas', { s, f: key });
    const { cup } = competitionKey(groups[0], s);
    const champions = groups.map(g => groupSummary(g).champion).filter(Boolean);
    if (cup === 'campeones' && champions.length) {
      const context = champions.length === groups.length ? count(champions.length, 'campeón', 'campeones') : count(groups.length, 'grupo', 'grupos');
      return linkRow(href, label, { context, detail: listEs(champions) });
    }
    if (cup === 'maspalomas') return linkRow(href, label, { context: monthsOf(groups) });
    return linkRow(href, label, { context: count(groups.length, 'grupo', 'grupos') });
  });
  return block('Copas y torneos', html`<ul class="box link-list">${rows.map(row => html`<li>${row}</li>`)}</ul>`);
}

// ── Más ─────────────────────────────────────────────────────────────────

// «comprobado hoy» o «comprobado el 23 sept», de data-health.json (spec §7: nunca «ahora»).
function checkedText(health, today) {
  const at = canaryDateTime(health && health.checkedAt);
  if (!at) return null;
  return at.day === today ? 'comprobado hoy' : `comprobado el ${dayMonth(at.day)}`;
}

// Más (spec §4.7): Temporadas anteriores, Récords, Goleadores, Datos y fuentes y Ajustes. Récords y
// Goleadores llevan la temporada elegida.
function moreBlock(ctx, s) {
  const seasons = (ctx.datasets && ctx.datasets.seasons) || [];
  const oldest = seasons.length > 1 ? seasons[seasons.length - 1].name : null;
  const rows = [
    linkRow(routeHref('temporadas'), 'Temporadas anteriores', { context: oldest ? `desde ${seasonLabel(oldest)}` : null }),
    linkRow(routeHref('records', { s }), 'Récords y estadísticas'),
    linkRow(routeHref('goleadores', { s }), 'Goleadores'),
    linkRow(routeHref('fuentes'), 'Datos y fuentes', { context: checkedText(ctx.health, ctx.today) }),
    linkRow(routeHref('ajustes'), 'Ajustes', { context: 'mi equipo y datos' }),
  ];
  return block('Más', html`<ul class="box link-list">${rows.map(row => html`<li>${row}</li>`)}</ul>`);
}

// ── Pantalla ────────────────────────────────────────────────────────────

function render(ctx) {
  const s = seasonOf(ctx);
  const seasons = (ctx.datasets && ctx.datasets.seasons && ctx.datasets.seasons.length) ? ctx.datasets.seasons : [{ name: ctx.portal.season }];
  const head = screenHead('Explorar', {
    sub: `Temporada ${seasonLabel(s)}`,
    action: seasonPicker(seasons, s, name => routeHref('explorar', { s: name }), { id: PICKER_ID }),
  });
  // La temporada de la ruta la carga el router (decisión 2 de B3); si aun así no está, la caja de
  // error con «Reintentar», nunca otra temporada (§7).
  if (!ctx.model.season(s)) return html`<section data-screen="explorar">${head}${errorBox(`la temporada ${seasonLabel(s)}`)}</section>`;
  const { list, status } = searchView(ctx, ctx.params.q);
  return html`<section data-screen="explorar">${head}${searchBox({ id: 'buscar', value: ctx.params.q || '', label: 'Buscar un equipo' })}<p class="vh" role="status" id="buscar-estado">${status}</p><div class="search-results" id="resultados" data-results>${list}</div>${recentBlock(ctx)}${leaguesBlock(ctx, s)}${cupsBlock(ctx, s)}${moreBlock(ctx, s)}</section>`;
}

/* Al escribir: la lista (Html de html``, que escapa cada dato) y la región de estado con searchView, y
 * la búsqueda en la dirección con nav.update ({ s, q }, sin pintar: la entrada, su ancla y su
 * desplazamiento se quedan). Sin temporizadores: un update que llegara después de navegar reescribiría
 * la ruta nueva. Intro no envía el formulario. El botón de la cabecera abre y cierra la lista de
 * temporadas; Escape la cierra. Las escuchas van en elementos de la sección, que se sustituye en cada
 * pintado: nunca se acumulan. */
function mount(root, ctx, nav) {
  const input = root.querySelector('#buscar');
  const results = root.querySelector('#resultados');
  const status = root.querySelector('#buscar-estado');
  if (input && results) {
    input.addEventListener('input', () => {
      const view = searchView(ctx, input.value);
      results.innerHTML = String(view.list);
      if (status) status.textContent = view.status;
      if (nav && typeof nav.update === 'function') nav.update({ ...ctx.params, q: input.value.trim() ? input.value : '' });
    });
    if (input.form) input.form.addEventListener('submit', event => event.preventDefault());
  }
  const toggle = root.querySelector(`#${PICKER_ID}`);
  const menu = root.querySelector(`#${PICKER_ID}-lista`);
  if (toggle && menu) {
    const show = open => {
      toggle.setAttribute('aria-expanded', String(open));
      menu.hidden = !open;
    };
    const close = event => {
      if (event.key !== 'Escape' || menu.hidden) return;
      show(false);
      toggle.focus();
    };
    toggle.addEventListener('click', () => show(toggle.getAttribute('aria-expanded') !== 'true'));
    toggle.addEventListener('keydown', close);
    menu.addEventListener('keydown', close);
  }
}

export const screen = {
  id: 'explorar',
  // Todo sale de los datos inmediatos y de la temporada de la ruta, que carga el router (decisión 2 de
  // B3). data-health.json solo pone la fecha de «Datos y fuentes»: se pide una vez por sesión, como en
  // la portada (M4 de B2), y nunca rechaza; sin él, la fila va sin fecha.
  needs: (params, datasets) => (datasets.health !== undefined ? []
    : [ensureHealth().then((health) => { datasets.health = health; })]),
  render,
  mount,
};
