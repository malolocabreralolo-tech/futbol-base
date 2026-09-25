// Marco de la app (spec §4.1, §4.8, §4.10, §7 y §8): cabecera con la marca y la barra,
// aria-current de la barra, aviso sin conexión, esqueletos de carga, caja de error y aviso de
// redirección. Todo son funciones puras que devuelven Html, salvo updateTabbar, que cambia la
// barra ya pintada del documento que recibe. La cabecera de cada pantalla es screenHead (ui.js).
// No toca el navegador al importarse.
import { html } from './html.js';
import { tabbar, notice, screenHead } from './ui.js';

const TAB_HREFS = { miequipo: '#/', jornada: '#/jornada', tabla: '#/tabla', explorar: '#/explorar' };

// Títulos de las rutas de §4.1: el h1 de la caja de error y del <title> del documento.
const TITLES = {
  '': 'Mi equipo', jornada: 'Jornada', tabla: 'Tabla', explorar: 'Explorar', partido: 'Partido',
  equipo: 'Equipo', ligas: 'Ligas', copa: 'Copa', goleadores: 'Goleadores',
  temporadas: 'Temporadas anteriores', records: 'Récords', fuentes: 'Datos y fuentes', ajustes: 'Ajustes',
};

export function routeTitle(screen) {
  return Object.hasOwn(TITLES, screen) ? TITLES[screen] : TITLES[''];
}

// ── Cabecera de la app y barra ───────────────────────────────────────────

// La marca y la barra de 4 destinos. En móvil y tableta la barra es fija abajo y la marca no se
// ve; desde 1024 px, la marca va a la izquierda y los destinos en pestañas, con 1120 px de
// ancho máximo (spec §4.8). .shell-offline es el hueco del aviso sin conexión (§4.10), que
// rellena app.js. index.html lleva esta misma cabecera, con Mi equipo activo.
export function renderHeader({ active = 'miequipo', current = 'page' } = {}) {
  return html`<div class="shell-bar"><a class="brand" href="#/">Fútbol base <span class="brand-place">Las Palmas</span></a>${tabbar(active, { current })}</div><div class="shell-offline" role="status"></div>`;
}

// aria-current en la barra ya pintada (spec §4.1): "page" en el destino de la pantalla y "true"
// en las secundarias (Partido, Equipo, Ligas…); con active null, en ninguno.
export function updateTabbar(active, current, doc) {
  if (active != null && !Object.hasOwn(TAB_HREFS, active)) throw new RangeError(`Destino de la barra no válido: ${active}`);
  if (current !== 'page' && current !== 'true') throw new RangeError(`aria-current no válido: ${current}`);
  for (const tab of doc.querySelectorAll('.tabbar a.tab')) {
    if (active != null && tab.getAttribute('href') === TAB_HREFS[active]) tab.setAttribute('aria-current', current);
    else tab.removeAttribute('aria-current');
  }
}

// ── Aviso sin conexión (spec §4.10) ──────────────────────────────────────

const isoToDMY = (iso) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso ?? ''));
  return m ? `${m[3]}/${m[2]}/${m[1]}` : null;
};

// «Sin conexión. Datos del DD/MM/AAAA»: la fecha es lastDataChange de data-health o, si falta,
// la del literal oculto «Última actualización» de index.html (legacyDate, DD/MM/AAAA).
export function offlineNotice(health, legacyDate) {
  const legacy = /^\d{2}\/\d{2}\/\d{4}$/.test(String(legacyDate ?? '')) ? legacyDate : null;
  const date = isoToDMY(health?.lastDataChange) || legacy;
  return notice('Sin conexión.', date ? `Datos del ${date}` : '');
}

// ── Esqueletos de carga (spec §5.4 y §7) ─────────────────────────────────

// Mismas medidas que la pantalla terminada: la cabecera de pantalla (72 px) y sus primeras
// cajas. Sin animación (spec §3.4) y sin h1: el h1 llega con el contenido.
const BODIES = {
  home: html`<div class="block"><span class="sk sk-block-title"></span><div class="box skeleton sk-box-home"></div></div>`,
  jornada: html`<div class="box skeleton sk-box-round"></div><span class="sk sk-day"></span><div class="box skeleton sk-rows-6"></div>`,
  tabla: html`<div class="box skeleton sk-box-seg"></div><div class="block"><span class="sk sk-block-title"></span><div class="box skeleton sk-rows-10"></div></div>`,
  partido: html`<div class="block"><span class="sk sk-block-title"></span><div class="box skeleton sk-box-match"></div></div>`,
};
const OTHER = html`<div class="block"><div class="box skeleton sk-box"></div></div>`;

export function skeleton(screenId) {
  const head = html`<div class="screen-head sk-head" aria-hidden="true">${screenId === 'home' ? html`<span class="sk sk-crest"></span>` : ''}<span class="screen-head-text"><span class="sk sk-title"></span><span class="sk sk-sub"></span></span></div>`;
  return html`<div class="skeleton-screen" data-skeleton="${screenId}" aria-busy="true"><p class="vh" role="status">Cargando…</p>${head}${Object.hasOwn(BODIES, screenId) ? BODIES[screenId] : OTHER}</div>`;
}

// ── Error y avisos del router ────────────────────────────────────────────

// Spec §7: «No se pudieron cargar los datos de <qué>» con «Reintentar», que el router atiende
// por data-action="retry". Nunca se cae a datos de otra temporada.
export function errorBox(what) {
  return html`<div class="box error-box" role="alert"><p class="error-text">No se pudieron cargar los datos de ${what}.</p><div class="buttons"><button class="button is-main" type="button" data-action="retry">Reintentar</button></div></div>`;
}

// La pantalla entera cuando falla una carga o el pintado: su h1 y la caja de error.
export function errorScreen({ screenId, title, what, back = null }) {
  return html`<section data-screen="${screenId}" data-state="error">${screenHead(title, { back })}<div class="block">${errorBox(what)}</div></section>`;
}

// Aviso de una redirección de §4.1 («Elige tu equipo en Mi equipo»). El router lo pone
// detrás de la cabecera de la pantalla de destino.
export function routeNotice(text) {
  return html`<p class="notice route-notice" role="status">${text}</p>`;
}
