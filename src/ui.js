// Componentes del sistema visual «Acta» (spec §3.3). Funciones puras que
// devuelven Html: no leen globales ni tocan el DOM al importarse. Las clases
// que emiten están definidas en acta.css.
import { html, Html } from './html.js';
import { matchState, penaltyWinner } from './model.js';
import { shieldFile } from './state.js';

// ── Escudo y monograma ──────────────────────────────────────────────────

const SIZES = [16, 32, 46];

function checkSize(size) {
  if (!SIZES.includes(size)) throw new RangeError(`Tamaño de escudo no válido: ${size} (16, 32 o 46)`);
}

const CLUB_WORDS = new Set(['ad', 'afc', 'atco', 'atl', 'cd', 'ce', 'cef', 'cf', 'club', 'cp', 'rc', 'real', 'sc', 'sd', 'ssd', 'ud', 'us']);

// Dos iniciales: sin puntuación ni siglas de club («CD Batán» → «BA»,
// 'VICTORIA, REAL CLUB "B"' → «VB»).
function initials(name) {
  const words = String(name ?? '').replace(/\./g, '').replace(/[^\p{L}\p{N}]+/gu, ' ').trim().split(' ').filter(Boolean);
  const main = words.filter((w) => !CLUB_WORDS.has(w.toLowerCase()));
  const use = main.length ? main : words;
  if (!use.length) return '';
  const pair = use.length === 1 ? use[0].slice(0, 2) : use[0][0] + use[1][0];
  return pair.toLocaleUpperCase('es');
}

export function monogram(name, size = 16) {
  checkSize(size);
  return html`<span class="mono mono-${size}" aria-hidden="true">${initials(name)}</span>`;
}

// Escudo decorativo (el nombre va siempre al lado): miniatura de escudos/s/,
// original en data-full y monograma si no hay escudo. `lazy: false` para los
// de la primera pantalla.
export function crest(name, { size = 16, shields = {}, lazy = true } = {}) {
  checkSize(size);
  const file = shieldFile(name, shields);
  if (!file) return monogram(name, size);
  const thumb = `./escudos/s/${file.replace(/\.[^./]+$/, '')}.png`;
  return html`<img class="crest crest-${size}" src="${thumb}" data-full="./escudos/${file}" data-name="${name}" alt="" width="${size}" height="${size}"${lazy ? html` loading="lazy"` : ''} decoding="async">`;
}

// Siguiente paso de la cadena miniatura → original → monograma (spec §5.4)
// para un <img class="crest"> que no ha cargado. Lo llama el manejador de
// errores de B2. Devuelve 'full', 'mono' o null si no es un escudo.
export function crestFallback(img) {
  if (!img || img.tagName !== 'IMG' || !img.classList.contains('crest')) return null;
  const full = img.getAttribute('data-full');
  if (full && img.getAttribute('src') !== full) {
    img.setAttribute('src', full);
    return 'full';
  }
  const size = Number(img.getAttribute('width'));
  // Marcado de monogram(): pasa por html`` y sus iniciales son solo letras o cifras.
  img.outerHTML = String(monogram(img.getAttribute('data-name') || '', SIZES.includes(size) ? size : 16));
  return 'mono';
}

// ── Caja, bloque y casillas ─────────────────────────────────────────────

// Bloque con título: su h2, el contexto a la derecha (opcional) y el contenido tal cual (una caja,
// un vacío, una lista…); id, el de la sección, para un ancla como #calendario. El único de la app,
// con un solo orden de argumentos (I2 de la revisión final de B2): lo usan las pantallas y box.
export function block(title, content, { context = null, id = null } = {}) {
  const ctx = context == null || context === '' ? '' : html`<p class="block-context">${context}</p>`;
  return html`<section class="block"${id ? html` id="${id}"` : ''}><div class="block-head"><h2 class="block-title">${title}</h2>${ctx}</div>${content}</section>`;
}

// El contenido en una caja; con título, dentro de su bloque.
export function box(content, { title, context } = {}) {
  const body = html`<div class="box">${content}</div>`;
  return title == null || title === '' ? body : block(title, body, { context });
}

// items: [{label, value, muted?}]. Columnas: 1-3 tal cual, 4 en 2×2, 5 en fila, 6+ de 3 en 3.
export function cells(items) {
  if (!items.length) return html``;
  const n = items.length;
  const cols = n === 4 ? 2 : n === 5 ? 5 : Math.min(n, 3);
  return html`<dl class="cells cells-${cols}">${items.map(({ label, value, muted }) =>
    html`<div class="${muted ? 'cell is-muted' : 'cell'}"><dt class="cell-label">${label}</dt><dd class="cell-value">${value}</dd></div>`)}</dl>`;
}

// ── Fila de partido ─────────────────────────────────────────────────────

function matchNote(match, state) {
  if (state === 'sin resultado' || state === 'sin fecha') return state;
  const who = penaltyWinner(match);
  if (who) return html`${who} pasó por penaltis${match.shootout ? html` (${String(match.shootout).replace('-', '–')})` : ''}`;
  return null;
}

export function matchRow(match, { mine = false, today, shields, href } = {}) {
  if (!today) throw new TypeError('matchRow necesita today (AAAA-MM-DD): el reloj se inyecta');
  const state = matchState(match, today);
  const score = state === 'jugado'
    ? html`<span class="match-score">${match.hs}–${match.as}</span>`
    : html`<span class="match-score is-pending">–</span>`;
  const note = matchNote(match, state);
  const inner = html`${mine ? html`<span class="vh">Partido de mi equipo. </span>` : ''}<span class="match-time">${match.time || ''}</span><span class="match-team match-home"><span class="match-name">${match.home}</span>${crest(match.home, { shields })}</span>${score}<span class="match-team match-away">${crest(match.away, { shields })}<span class="match-name">${match.away}</span></span>${note ? html`<span class="match-note">${note}</span>` : ''}`;
  const cls = mine ? 'match-row is-mine' : 'match-row';
  return href ? html`<a class="${cls}" href="${href}">${inner}</a>` : html`<div class="${cls}">${inner}</div>`;
}

// ── Tabla ───────────────────────────────────────────────────────────────

const signed = (n) => (n == null ? '' : n > 0 ? `+${n}` : n < 0 ? `−${-n}` : '0');

const COLUMNS = {
  pj: { label: 'J', title: 'Partidos jugados', cls: 'st-num st-pj', cell: (r) => r.pj },
  g: { label: 'G', title: 'Ganados', cls: 'st-num st-g', cell: (r) => r.g },
  e: { label: 'E', title: 'Empatados', cls: 'st-num st-e', cell: (r) => r.e },
  p: { label: 'P', title: 'Perdidos', cls: 'st-num st-p', cell: (r) => r.p },
  gf: { label: 'GF', title: 'Goles a favor', cls: 'st-gf', cell: (r) => r.gf },
  gc: { label: 'GC', title: 'Goles en contra', cls: 'st-gc', cell: (r) => r.gc },
  dg: { label: 'DG', title: 'Diferencia de goles', cls: 'st-dg', cell: (r) => signed(r.dg) },
  form: { label: 'Últimos 5', title: null, cls: 'st-form',
    cell: (r) => (r.retired ? html`<span class="st-retired">retirado</span>` : formChips(r.form || [])) },
};

// Spec §4.4. «todas» es la de escritorio (≥1024 px) y «resumen», la de la
// clasificación final de la portada en el estado D (spec §4.2: #, Equipo, J, DG y Pts).
const VIEWS = {
  puntos: ['pj', 'g', 'e', 'p', 'dg'],
  resumen: ['pj', 'dg'],
  goles: ['gf', 'gc', 'dg'],
  forma: ['pj', 'form'],
  casa: ['pj', 'g', 'e', 'p'],
  fuera: ['pj', 'g', 'e', 'p'],
  todas: ['pj', 'g', 'e', 'p', 'gf', 'gc', 'dg', 'form'],
};

const abbr = (label, title) => (title ? html`<abbr title="${title}">${label}</abbr>` : label);

// rows: Row[] del modelo; `form` (letras G/E/P) es opcional y solo lo usan
// las vistas forma y todas. `mine` es el nombre exacto del equipo propio.
export function standingsTable(rows, { view = 'puntos', mine, shields, hrefFor, caption } = {}) {
  const keys = VIEWS[view] || VIEWS.puntos;
  const head = html`<tr><th scope="col" class="st-pos">${abbr('#', 'Posición')}</th><th scope="col" class="st-team">Equipo</th>${keys.map((k) =>
    html`<th scope="col" class="${COLUMNS[k].cls}">${abbr(COLUMNS[k].label, COLUMNS[k].title)}</th>`)}<th scope="col" class="st-pts">${abbr('Pts', 'Puntos')}</th></tr>`;
  const body = rows.map((row, i) => {
    const isMine = mine != null && row.team === mine;
    const inner = html`${crest(row.team, { shields })}<span class="st-name">${row.team}</span>`;
    const label = hrefFor
      ? html`<a class="st-link" href="${hrefFor(row)}">${inner}</a>`
      : html`<span class="st-label">${inner}</span>`;
    const cellsHtml = keys.map((k) => html`<td class="${COLUMNS[k].cls}">${COLUMNS[k].cell(row)}</td>`);
    return html`<tr${isMine ? html` class="is-mine"` : ''}><td class="st-pos">${row.pos ?? i + 1}</td><th scope="row" class="st-team">${label}${isMine ? html`<span class="vh"> (mi equipo)</span>` : ''}</th>${cellsHtml}<td class="st-pts">${row.pts}</td></tr>`;
  });
  return html`<table class="standings"><caption class="vh">${caption || 'Clasificación'}</caption><thead>${head}</thead><tbody>${body}</tbody></table>`;
}

// ── Forma, selector, aviso y vacío ──────────────────────────────────────

const FORM_CLASS = { G: 'form-g', E: 'form-e', P: 'form-p' };

export function formChips(letters) {
  return html`<span class="form">${letters.map((letter) => {
    if (!Object.hasOwn(FORM_CLASS, letter)) throw new RangeError(`Letra de forma no válida: «${letter}» (solo G, E o P)`);
    return html`<span class="form-chip ${FORM_CLASS[letter]}">${letter}</span>`;
  })}</span>`;
}

// idPrefix (opcional): un id estable por opción, «<prefijo>-<valor>». Al cambiar de vista con
// replaceState, el router devuelve el foco al segmento pulsado (B11 de la revisión de B2).
export function segmented(options, active, hrefFor, { idPrefix = null } = {}) {
  const id = (value) => (idPrefix ? html` id="${idPrefix}-${value}"` : '');
  return html`<div class="segmented">${options.map(({ value, label }) => (value === active
    ? html`<a class="segment"${id(value)} href="${hrefFor(value)}" aria-current="true">${label}</a>`
    : html`<a class="segment"${id(value)} href="${hrefFor(value)}">${label}</a>`))}</div>`;
}

export function notice(term, text) {
  return html`<p class="notice">${term ? html`<b>${term}</b> ` : ''}${text}</p>`;
}

export function empty(text) {
  return html`<p class="empty">${text}</p>`;
}

// ── Compartir y procedencia ─────────────────────────────────────────────

// La región de estado de «Compartir» (spec §4.2 A), la misma en todas las pantallas: la rellena
// shareAndAnnounce (links.js) con «Enlace copiado.» o, si no se pudo copiar, con el enlace para
// copiarlo a mano. Visible y nunca display: none, o dejaría de anunciarse (decisión 111).
export function shareStatus() {
  return html`<p class="share-status" role="status"></p>`;
}

// La procedencia de una clasificación en una frase, desde sourceInfo (model.js, spec §4.4):
// «Clasificación oficial de futbolaspalmas.com», «Clasificación calculada con los resultados de …»
// o «Clasificación de … con los puntos corregidos»; sin fuente, sin «de …». Texto, no Html: Mi
// equipo le añade la comprobación y Tabla, su advertencia y el enlace a la fuente.
export function sourcePhrase(info) {
  const of = info && info.source ? ` de ${info.source}` : '';
  if (info && info.kind === 'calculada') return `Clasificación calculada con los resultados${of}`;
  if (info && info.kind === 'corregida') return `Clasificación${of} con los puntos corregidos`;
  return `Clasificación oficial${of}`;
}

// ── Barra de navegación ─────────────────────────────────────────────────

const svg = (paths) => html`<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="square" stroke-linejoin="miter" aria-hidden="true" focusable="false">${paths}</svg>`;

const TABS = [
  { id: 'miequipo', href: '#/', label: 'Mi equipo',
    icon: svg(html`<path d="M12 3l7 2.6V11c0 4.4-2.9 7.9-7 9.6-4.1-1.7-7-5.2-7-9.6V5.6z"/><path d="M5.2 10.5h13.6"/>`) },
  { id: 'jornada', href: '#/jornada', label: 'Jornada',
    icon: svg(html`<rect x="4" y="5.5" width="16" height="14.5"/><path d="M4 10h16M8.5 3.5v4M15.5 3.5v4"/>`) },
  { id: 'tabla', href: '#/tabla', label: 'Tabla',
    icon: svg(html`<rect x="4" y="4.5" width="16" height="15"/><path d="M4 9.5h16M4 14.5h16M9.5 4.5v15"/>`) },
  { id: 'explorar', href: '#/explorar', label: 'Explorar',
    icon: svg(html`<circle cx="10.5" cy="10.5" r="6"/><path d="M15 15l5 5"/>`) },
];

// active: destino marcado. current: 'page' si la pantalla es ese destino;
// 'true' en las pantallas secundarias (spec §4.1).
export function tabbar(active, { current = 'page' } = {}) {
  if (active != null && !TABS.some((t) => t.id === active)) throw new RangeError(`Destino de la barra no válido: ${active}`);
  if (current !== 'page' && current !== 'true') throw new RangeError(`aria-current no válido: ${current}`);
  return html`<nav class="tabbar" aria-label="Navegación principal">${TABS.map((t) => {
    const inner = html`<span class="tab-icon">${t.icon}</span><span class="tab-label">${t.label}</span>`;
    return t.id === active
      ? html`<a class="tab" href="${t.href}" aria-current="${current}">${inner}</a>`
      : html`<a class="tab" href="${t.href}">${inner}</a>`;
  })}</nav>`;
}

// ── Cabecera de pantalla ────────────────────────────────────────────────

// «‹» (volver): el router lo atiende con history.back() si la entrada anterior es de la app y,
// si no, sigue el enlace al padre (spec §4.1).
export function backLink(href) {
  return html`<a class="back" href="${href}" data-action="back" aria-label="Volver">‹</a>`;
}

// Maquetas 4, 5-1, 5-2 y 5-3: el único h1 de la pantalla con su etiqueta debajo, «‹» y escudo
// opcionales a la izquierda y una acción a la derecha («Cambiar», «Otro grupo», «Compartir»).
// title: texto o Html; action: { href, label } para un enlace, o un Html ya hecho (un botón);
// crest: Html de crest(); back: href del padre.
export function screenHead(title, { sub = null, action = null, crest: badge = null, back = null } = {}) {
  const act = action == null ? ''
    : action instanceof Html ? action
      : html`<a class="screen-action" href="${action.href}">${action.label}</a>`;
  return html`<header class="screen-head">${back ? backLink(back) : ''}${badge || ''}<div class="screen-head-text"><h1>${title}</h1>${sub ? html`<p class="screen-sub">${sub}</p>` : ''}</div>${act}</header>`;
}

// Lista en castellano: '' sin elementos, el elemento con uno, «A ${conj} B» con dos y «A, B ${conj} C» con tres o más.
export function listEs(items, conj = 'y') {
  return items.length < 2 ? items.join('') : `${items.slice(0, -1).join(', ')} ${conj} ${items[items.length - 1]}`;
}
