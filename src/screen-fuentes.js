// Pantalla Datos y fuentes (spec §4.7, §4.2 D y §7; decisión 28 de B3). render(ctx) es pura: la
// última comprobación y el último cambio de data-health.json; una fila por grupo comprobado, con la
// etiqueta del modelo, su estado en palabras, su mensaje y el enlace a su fuente; los grupos de la
// temporada sin página web comprobada, en una línea; y la temporada siguiente, con la caja de la
// portada (nextSeasonBox). Sin data-health, un vacío con el «Reintentar» del router.
import { html } from './html.js';
import { block, box, cells, empty, listEs, notice, screenHead } from './ui.js';
import { routeTitle } from './shell.js';
import { canaryDateTime, dayMonthLong } from './links.js';
import { seasonLabel } from './model.js';
import { ensureHealth } from './state.js';
import { nextSeasonBox } from './team-view.js';

// El estado de una comprobación en palabras (source_health.py escribe 'ok', 'rejected' o 'error').
const STATUS = { ok: 'Correcta', rejected: 'Revisión pendiente', error: 'Error' };
// Primero lo que pide atención: un error, una revisión pendiente, un estado desconocido y las correctas.
const URGENCY = { error: 0, rejected: 1, ok: 3 };
const urgency = (status) => (Object.hasOwn(URGENCY, status) ? URGENCY[status] : 2);
const SOURCE_RE = /^https?:\/\/(?:www\.)?([^/?#:@\s]+)/i;
const SEASON_RE = /^\d{4}-\d{4}$/;

// Las filas de la comprobación y los grupos sin comprobar, sobre `season`: la temporada del modelo
// que comprobó data-health (null si no está cargada; entonces, sin etiquetas ni grupos sin comprobar).
//   rows: [{ id, label, status, text, message, url, source }], primero lo que pide atención y, dentro,
//         en el orden del modelo; un grupo que el modelo no conoce va con su código, al final. url y
//         source (el dominio), solo si la fuente es http o https;
//   unchecked: los grupos de la temporada sin entrada en data-health, en el orden del modelo.
export function healthRows(health, season) {
  const checks = health && health.groups && typeof health.groups === 'object' ? health.groups : {};
  const known = season ? season.groups : [];
  const order = (id) => { const i = known.findIndex((group) => group.id === id); return i < 0 ? known.length : i; };
  const rows = Object.entries(checks).map(([id, item]) => {
    const group = known.find((g) => g.id === id);
    const url = String((item && item.url) || '');
    const source = url.match(SOURCE_RE);
    const status = item ? item.status : null;
    return {
      id, label: group ? group.label : id, status, text: STATUS[status] || 'Sin estado',
      message: (item && item.message) || '', url: source ? url : null, source: source ? source[1].toLowerCase() : null,
    };
  });
  rows.sort((a, b) => urgency(a.status) - urgency(b.status) || order(a.id) - order(b.id) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  return { rows, unchecked: known.filter((group) => !Object.hasOwn(checks, group.id)) };
}

// «44 correctas y 1 con revisión pendiente».
function summary(rows) {
  const count = (test) => rows.filter(test).length;
  const ok = count((r) => r.status === 'ok');
  const pending = count((r) => r.status === 'rejected');
  const errors = count((r) => r.status === 'error');
  const other = rows.length - ok - pending - errors;
  return listEs([
    ok ? `${ok} ${ok === 1 ? 'correcta' : 'correctas'}` : '',
    pending ? `${pending} con revisión pendiente` : '',
    errors ? `${errors} con error` : '',
    other ? `${other} sin estado` : '',
  ].filter(Boolean));
}

// Una fila: la etiqueta y el estado y, debajo, el mensaje. Con fuente, la fila la abre en otra pestaña.
function checkRow(r) {
  const inner = html`<span class="fu-name">${r.label}</span><span class="${r.status === 'ok' ? 'fu-state' : 'fu-state is-alert'}">${r.text}</span>${r.message ? html`<span class="fu-detail">${r.message}</span>` : ''}`;
  return html`<li>${r.url ? html`<a class="fu-row" href="${r.url}" target="_blank" rel="noopener noreferrer">${inner}<span class="vh"> (abre ${r.source} en otra pestaña)</span></a>` : html`<div class="fu-row">${inner}</div>`}</li>`;
}

// Adónde llevan las filas, en una línea: el dominio si todas van al mismo.
function sourcesNote(rows) {
  const sources = [...new Set(rows.map((r) => r.source).filter(Boolean))];
  if (!sources.length) return '';
  return notice(null, sources.length === 1 ? `Cada grupo abre su página en ${sources[0]}.` : 'Cada grupo abre su página en la web de su fuente.');
}

function render(ctx) {
  const health = ctx.health;
  const title = routeTitle('fuentes');
  // Sin data-health (needs lo pidió y falló): el vacío y el «Reintentar» del router, que vuelve a
  // llamar a needs, y needs lo vuelve a pedir.
  if (!health || typeof health !== 'object') {
    return html`<section data-screen="fuentes">${screenHead(title, { back: ctx.backHref })}<div class="block"><div class="empty fu-failed"><p>No se pudo cargar el estado de las fuentes.</p><div class="buttons"><button class="button is-main" type="button" data-action="retry">Reintentar</button></div></div></div></section>`;
  }
  const checkedSeason = SEASON_RE.test(String(health.season)) ? health.season : null;
  const { rows, unchecked } = healthRows(health, checkedSeason ? ctx.model.season(checkedSeason) : null);
  // Fechas de Canarias: la comprobación es un instante (con su hora) y el último cambio, un día.
  const day = (iso) => (iso === ctx.today ? 'hoy' : dayMonthLong(iso));
  const checked = canaryDateTime(health.checkedAt);
  const changed = day(health.lastDataChange);
  const state = box(cells([
    { label: 'Última comprobación', value: checked ? `${day(checked.day)}, ${checked.time}` : 'no disponible', muted: !checked },
    { label: 'Último cambio en los datos', value: changed || 'no disponible', muted: !changed },
  ]), { title: 'Estado de los datos' });
  const list = rows.length ? html`<ul class="box fu-list">${rows.map(checkRow)}</ul>` : empty('Todavía no hay ningún grupo comprobado.');
  const n = unchecked.length;
  const missing = n ? notice(null, `${n} ${n === 1 ? 'grupo' : 'grupos'} sin página web comprobada; sus datos vienen de la federación: ${unchecked.map((group) => group.label).join('; ')}.`) : '';
  // La temporada siguiente, con el texto de la portada en D (§4.2 D) y el nombre de mi equipo.
  const next = health.nextSeason;
  const mine = ctx.resolution && ctx.resolution.status === 'ok' ? ctx.resolution.name : (ctx.myTeam && ctx.myTeam.name) || '';
  const upcoming = next && next.status === 'pending' && SEASON_RE.test(String(next.name)) && mine ? nextSeasonBox(ctx, mine, next.name) : '';
  return html`<section data-screen="fuentes">${screenHead(title, { sub: checkedSeason ? `Temporada ${seasonLabel(checkedSeason)}` : null, back: ctx.backHref })}${state}${block('Comprobación por grupo', list, { context: summary(rows) || null })}${sourcesNote(rows)}${missing}${upcoming}</section>`;
}

export const screen = {
  id: 'fuentes',
  // data-health.json, que es todo el contenido: se pide si no está, también si ya falló (null), a
  // diferencia de las demás pantallas (M4 de B2). Así su «Reintentar» lo vuelve a pedir. Nunca
  // rechaza: sin él, la pantalla pinta su vacío.
  needs: (params, datasets) => (datasets.health ? []
    : [ensureHealth().then((health) => { datasets.health = health; })]),
  render,
};
