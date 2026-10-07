// Pantalla Datos y fuentes (spec §4.7, §4.2 D y §7; decisión 28 de B3). render(ctx) es pura: la
// última comprobación y el último cambio de data-health.json; una fila por grupo comprobado, con la
// etiqueta del modelo, su estado en palabras, su mensaje y el enlace a su fuente; los grupos de la
// temporada sin página web comprobada, en una línea; y la temporada siguiente, con la caja de la
// portada (nextSeasonBox). Sin data-health, la caja de error de §7 (errorBox, B5, decisión 6), con
// el «Reintentar» del router.
import { html } from './html.js';
import { block, box, cells, countLabel, empty, listEs, notice, screenHead } from './ui.js';
import { errorBox, routeTitle } from './shell.js';
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
    ok ? countLabel(ok, 'correcta', 'correctas') : '',
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

// La base de datos entera (futbolbase.db, SQLite, la misma de la que salen todas las pantallas) y lo
// que guarda de cada temporada (COBERTURA de data-history.js): grupos, partidos con resultado, actas,
// jugadores con alineación y goles con autor. null si no hay datos de cobertura.
export function databaseBlock(cobertura) {
  const c = cobertura && typeof cobertura === 'object' && Array.isArray(cobertura.temporadas) ? cobertura : null;
  if (!c) return '';
  const size = Number.isFinite(c.mb) && c.mb > 0 ? `SQLite, unos ${c.mb} MB` : 'SQLite';
  const what = html`<p class="box-text">Todo lo que guarda esta web, en un solo archivo: clasificaciones (también en casa y fuera, y las sanciones), calendarios y resultados, actas (alineaciones, goles con su minuto, cuerpo técnico y árbitros), goleadores, la equipación y el campo de cada equipo y la dirección y las coordenadas de cada campo. Se abre con cualquier programa de SQLite. No lleva datos de contacto.</p>`;
  const link = html`<div class="buttons"><a class="button is-main" href="./futbolbase.db" download="futbolbase.db">Descargar la base de datos<span class="vh"> (${size})</span></a></div>`;
  const part = (value, one, many) => (value ? countLabel(value, one, many) : null);
  // Una fila por temporada, como las de la comprobación: lo que hay de ella, en una línea.
  const rows = c.temporadas.filter((r) => Array.isArray(r) && SEASON_RE.test(String(r[0])))
    .map(([name, groups, , played, actas, players, goals]) => {
      const detail = [part(groups, 'grupo', 'grupos'), part(played, 'partido con resultado', 'partidos con resultado'),
        part(actas, 'acta', 'actas'), part(players, 'jugador', 'jugadores'), part(goals, 'gol con autor', 'goles con autor')]
        .filter(Boolean).join(' · ') || 'solo la clasificación';
      return html`<li><div class="fu-row"><span class="fu-name">${seasonLabel(name)}</span><span class="fu-detail">${detail}</span></div></li>`;
    });
  const list = rows.length ? html`<ul class="box fu-list">${rows}</ul>` : '';
  const extras = [part(c.equipos, 'equipo con su equipación y su campo', 'equipos con su equipación y su campo'),
    part(c.campos, 'campo con sus coordenadas', 'campos con sus coordenadas')].filter(Boolean);
  return block('La base de datos', html`<div class="box">${what}${link}</div>${list}${extras.length ? notice(null, `Y ${listEs(extras)}.`) : ''}`, { context: size });
}

function render(ctx) {
  const health = ctx.health;
  const title = routeTitle('fuentes');
  // Sin data-health (needs lo pidió y falló): la caja de error, anunciada, con el «Reintentar» del
  // router, que vuelve a llamar a needs, y needs lo vuelve a pedir.
  if (!health || typeof health !== 'object') {
    return html`<section data-screen="fuentes">${screenHead(title, { back: ctx.backHref })}<div class="block">${errorBox('la comprobación de las fuentes')}</div></section>`;
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
  const missing = n ? notice(null, `${countLabel(n, 'grupo', 'grupos')} sin página web comprobada; sus datos vienen de la federación: ${unchecked.map((group) => group.label).join('; ')}.`) : '';
  // La temporada siguiente, con el texto de la portada en D (§4.2 D) y el nombre de mi equipo.
  const next = health.nextSeason;
  const mine = ctx.resolution && ctx.resolution.status === 'ok' ? ctx.resolution.name : (ctx.myTeam && ctx.myTeam.name) || '';
  const upcoming = next && next.status === 'pending' && SEASON_RE.test(String(next.name)) && mine ? nextSeasonBox(ctx, mine, next.name) : '';
  const database = databaseBlock(ctx.datasets && ctx.datasets.cobertura);
  return html`<section data-screen="fuentes">${screenHead(title, { sub: checkedSeason ? `Temporada ${seasonLabel(checkedSeason)}` : null, back: ctx.backHref })}${state}${block('Comprobación por grupo', list, { context: summary(rows) || null })}${sourcesNote(rows)}${missing}${upcoming}${database}</section>`;
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
