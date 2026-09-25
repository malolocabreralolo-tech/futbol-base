// Router del rediseño (spec §4.1, §5.1, §7 y §8). La ruta vive en el hash
// (#/<pantalla>?<parámetros>) y es la fuente de verdad de lo que se ve.
// - Funciones puras: resolveParams (valores por defecto y redirecciones de §4.1),
//   historyMode (pushState o replaceState), parentOf («‹»), activeTab y routeIsMine (barra).
// - startRouter, la parte con DOM: hashchange y popstate, enlaces antiguos, token de
//   navegación, la temporada pendiente, needs → render → mount, desplazamiento por entrada del
//   historial, foco al h1 (o al control del ancla), «‹» y Reintentar; y el nav de las pantallas,
//   con la búsqueda que se apunta sin pintar (update), los vistos hace poco y «Borrar datos».
// No toca el navegador al importarse: startRouter recibe `window`.
import { Html } from './html.js';
import { parseRoute, routeHref, translateLegacy } from './links.js';
import { findGroup, findMatch, findRound, seasonLabel } from './model.js';
import { sameClub } from './myteam.js';
import { skeleton, errorScreen, routeNotice, routeTitle, updateTabbar } from './shell.js';
import { normalizeTeamName, seasonNeeds } from './state.js';

// Destinos principales de la barra, por pantalla.
const PRIMARY = { '': 'miequipo', jornada: 'jornada', tabla: 'tabla', explorar: 'explorar' };
const TABS = new Set(Object.values(PRIMARY));
const NO_PARAMS = new Set(['', 'temporadas', 'fuentes', 'ajustes']);
const VIEWS = ['puntos', 'goles', 'forma', 'casa', 'fuera', 'todas'];
// Lo que se cambia sin crear entrada en el historial (§4.1): jornada, vista de Tabla y búsqueda.
const REPLACE_ONLY = { jornada: ['r'], tabla: ['v'], explorar: ['q'], goleadores: ['q'] };
// Pantallas que se abren desde Explorar: su «‹» sin historial lleva a #/explorar.
const UNDER_EXPLORE = new Set(['equipo', 'copa', 'goleadores', 'ligas', 'temporadas', 'records', 'fuentes', 'ajustes']);
const MAX_REDIRECTS = 5;
// El último destino principal, en la sesión (app.js lo borra con «Borrar datos», decisión 6 de B3).
export const SESSION_KEY = 'futbol-base:destino';
// Un ancla que es uno de estos controles se lleva el foco en lugar del h1 (#/explorar#buscar).
const FORM_CONTROLS = new Set(['INPUT', 'SELECT', 'TEXTAREA', 'BUTTON']);
// Parámetros de valor cerrado (§4.1): el que no está en su lista se quita, sin aviso, como una vista
// de Tabla que no existe (decisión 3 de B3). `i` y `to` son de la Tarea 1 de B3: con una isla
// desconocida Ligas saldría vacía, y con otro `to` sus grupos enlazarían a otra pantalla.
const CATS = ['benjamin', 'prebenjamin'];
const CLOSED = {
  ligas: { c: CATS, i: ['grancanaria', 'lanzarote', 'fuerteventura'], to: ['tabla', 'jornada'] },
  goleadores: { c: CATS },
  records: { c: CATS },
};

const redirect = (screen, params, notice = null) => ({ redirect: { screen, params, notice } });
const omit = (params, key) => Object.fromEntries(Object.entries(params).filter(([k]) => k !== key));
const pick = (params, keys) => Object.fromEntries(keys.filter((k) => params[k] != null && params[k] !== '').map((k) => [k, params[k]]));
const knownSeason = (ctx, name) => (ctx.datasets?.seasons || []).some((entry) => entry && entry.name === name);
const hasTeam = (group, name) => group.standings.some((row) => row.team === name)
  || group.rounds.some((round) => round.matches.some((m) => m.home === name || m.away === name));

// Nombre y categoría de mi equipo: los resueltos o, en E y X, los guardados.
function identity(ctx) {
  const r = ctx.resolution;
  return r?.status === 'ok' ? { name: r.name, cat: r.cat } : { name: ctx.myTeam?.name || '', cat: ctx.myTeam?.cat || '' };
}

// ── Valores por defecto y redirecciones (§4.1) ───────────────────────────
//
// resolveParams(route, ctx) → { params, pending? } | { redirect: { screen, params, notice } }
//   ctx: { portal: { season }, model, resolution, myTeam, datasets: { seasons } }
//   params: los de la ruta con `s` (y `g` en Jornada y Tabla) ya puestos; pending: la temporada
//   pasada aún no está cargada y no se puede validar la ruta (el router la carga y la vuelve a
//   resolver cuando termina `needs`). Las redirecciones se aplican con replaceState.
export function resolveParams(route, ctx) {
  const screen = route.screen;
  const raw = route.params || {};
  if (NO_PARAMS.has(screen)) return { params: {} };
  const portal = ctx.portal.season;
  if (raw.s && raw.s !== portal && !knownSeason(ctx, raw.s)) {
    return redirect(screen, omit(raw, 's'), `No existe la temporada ${seasonLabel(raw.s)}; te enseñamos la actual`);
  }
  const closed = CLOSED[screen] || {};
  const wrong = Object.keys(closed).filter((key) => raw[key] != null && !closed[key].includes(raw[key]));
  if (wrong.length) return redirect(screen, Object.fromEntries(Object.entries(raw).filter(([key]) => !wrong.includes(key))));
  const params = { ...raw, s: raw.s || portal };
  if (screen === 'jornada' || screen === 'tabla') return leagueParams(screen, raw, params, ctx);
  if (screen === 'partido') return matchParams(params, ctx);
  if (screen === 'equipo') return teamParams(raw, params, ctx);
  // Explorar, Ligas, Copa, Goleadores y Récords (decisión 2 de B3): con una temporada pasada sin
  // cargar, pendientes. La carga el router (I4(a) de B2): ninguna pantalla pide la de su ruta.
  if (!ctx.model.season(params.s)) return { params, pending: true };
  if (screen === 'copa') return cupParams(params, ctx);
  if (screen === 'goleadores') return scorersParams(raw, params, ctx);
  return { params };
}

// Jornada y Tabla: `g` por defecto, grupos que no son de liga a #/copa y, sin mi equipo, a #/ligas.
function leagueParams(screen, raw, params, ctx) {
  if (screen === 'tabla' && raw.v && !VIEWS.includes(raw.v)) return redirect(screen, omit(raw, 'v'));
  const season = ctx.model.season(params.s);
  if (!season) return { params, pending: true };
  const portal = ctx.portal.season;
  const s = params.s === portal ? '' : params.s;
  const mine = identity(ctx);
  let group;
  if (params.g) {
    group = findGroup(ctx.model, params.s, params.g);
    if (!group) {
      return redirect('ligas', { s, c: mine.cat, to: screen }, `No encontramos el grupo ${params.g} en la temporada ${seasonLabel(params.s)}`);
    }
    if (group.kind !== 'league') return redirect('copa', { s, g: group.id });
  } else if (params.s === portal) {
    // Mi equipo sin resolver (E, pregunta pendiente; X, ausente): a Ligas de la temporada actual.
    if (ctx.resolution?.status !== 'ok') return redirect('ligas', { to: screen }, 'Elige tu equipo en Mi equipo');
    group = ctx.resolution.group;
  } else {
    // Temporada pasada: el primer grupo de liga de la categoría de mi equipo con su nombre.
    group = mine.name ? season.groups.find((g) => g.cat === mine.cat && g.kind === 'league' && hasTeam(g, mine.name)) : null;
    if (!group) {
      return redirect('ligas', { s, c: mine.cat, to: screen },
        mine.name ? `${mine.name} no aparece en la temporada ${seasonLabel(params.s)}` : 'Elige tu equipo en Mi equipo');
    }
  }
  // La jornada vale por su clave o por su número (la pantalla lee las dos); si no, se quita.
  if (screen === 'jornada' && raw.r && !findRound(group, raw.r)) return redirect(screen, omit(raw, 'r'));
  return { params: { ...params, g: group.id } };
}

// Partido: vale si findMatch lo encuentra, igual que la pantalla (en su ronda o, si ahí no está, el
// único h–a del grupo); si no, a su jornada, con aviso.
function matchParams(params, ctx) {
  const season = ctx.model.season(params.s);
  if (!season) return { params, pending: true };
  const s = params.s === ctx.portal.season ? '' : params.s;
  const lost = 'No encontramos ese partido';
  const group = params.g ? findGroup(ctx.model, params.s, params.g) : null;
  if (!group) return redirect('jornada', { s }, lost);
  if (!findMatch(group, params)) {
    const round = findRound(group, params.r);
    return redirect('jornada', { s, g: group.id, r: round ? round.key : '' }, lost);
  }
  return { params };
}

// Equipo: `g` y `t` son obligatorios; sin ellos, el equipo se busca en Explorar (como un enlace
// antiguo). Con la temporada cargada (decisión 3 de B3): un grupo que no es de liga (un torneo MC* o
// una copa de la federación, sin ficha de equipo) abre su Copa, sin aviso, como «Vistos hace poco» y
// los enlaces antiguos a torneos (B1:8012). Un equipo que no juega en el grupo con ese nombre exacto:
// si un solo equipo del grupo tiene su nombre normalizado, es otra grafía del mismo («Las Mesas Hu»,
// sin punto), y la ruta pasa a su nombre canónico, sin aviso y con el resto de sus parámetros
// (decisión 32); si no hay ninguno, o hay varios, se busca en Explorar, con aviso (B1:7998: el `g`
// de un enlace antiguo puede no ser el de su equipo).
function teamParams(raw, params, ctx) {
  const s = params.s === ctx.portal.season ? '' : params.s;
  if (!params.g || !params.t) return redirect('explorar', { s, q: params.t });
  const season = ctx.model.season(params.s);
  if (!season) return { params, pending: true };
  const group = findGroup(ctx.model, params.s, params.g);
  if (!group) {
    return redirect('explorar', { s, q: params.t }, `No encontramos el grupo ${params.g} en la temporada ${seasonLabel(params.s)}`);
  }
  if (group.kind !== 'league') return redirect('copa', { s, g: group.id });
  if (!hasTeam(group, params.t)) {
    const same = sameNamed(group, params.t);
    if (same.length === 1) return redirect('equipo', { ...raw, t: same[0] });
    return redirect('explorar', { s, q: params.t }, `No encontramos a ${params.t} en ${group.label}`);
  }
  return { params };
}

// Los equipos del grupo, de la clasificación o del calendario, con el nombre normalizado de `name`
// (normalizeTeamName de state.js: sin tildes, puntos ni siglas del club).
function sameNamed(group, name) {
  const key = normalizeTeamName(String(name));
  const teams = new Set([...group.standings.map((row) => row.team),
    ...group.rounds.flatMap((round) => round.matches.flatMap((m) => [m.home, m.away]))]);
  return [...teams].filter((team) => typeof team === 'string' && team !== '' && normalizeTeamName(team) === key);
}

// Copa (decisión 3 de B3): el grupo es una copa de la federación o un torneo. Uno de liga abre su
// Tabla, sin aviso; uno que no existe, Ligas de esa temporada con el aviso de la Tabla; sin grupo,
// Ligas sin aviso (ningún enlace de la app lo da: una dirección escrita a mano).
function cupParams(params, ctx) {
  const s = params.s === ctx.portal.season ? '' : params.s;
  if (!params.g) return redirect('ligas', { s });
  const group = findGroup(ctx.model, params.s, params.g);
  if (!group) return redirect('ligas', { s }, `No encontramos el grupo ${params.g} en la temporada ${seasonLabel(params.s)}`);
  if (group.kind === 'league') return redirect('tabla', { s, g: group.id });
  return { params };
}

// Goleadores (decisión 3 de B3): un grupo que no existe se quita, con aviso: la global de su
// categoría (la `c` del enlace o, sin ella, la que la pantalla pone por defecto).
function scorersParams(raw, params, ctx) {
  if (!params.g || findGroup(ctx.model, params.s, params.g)) return { params };
  return redirect('goleadores', omit(raw, 'g'), `No encontramos el grupo ${params.g} en la temporada ${seasonLabel(params.s)}`);
}

// ── Historial, «‹» y barra ───────────────────────────────────────────────

// 'replace' si solo cambian la jornada, la vista de Tabla o la búsqueda (o nada); si no, 'push'.
export function historyMode(from, to) {
  if (!from || !to || from.screen !== to.screen) return 'push';
  const a = from.params || {};
  const b = to.params || {};
  const changed = [...new Set([...Object.keys(a), ...Object.keys(b)])].filter((k) => (a[k] ?? '') !== (b[k] ?? ''));
  const allowed = REPLACE_ONLY[to.screen] || [];
  return changed.every((k) => allowed.includes(k)) ? 'replace' : 'push';
}

// Padre de «‹» cuando no hay entrada anterior de la app (spec §4.1): lo que cuelga de Explorar →
// Explorar; los destinos principales no tienen; y Partido, según su grupo, que se busca en `model`
// (el del contexto; M2 de la revisión final de B2):
// - de un grupo que no es de liga (una copa o un torneo MC*, decisión 100) → #/copa?s&g;
// - de liga → su jornada, con la clave de la ronda del partido (findMatch) o, si el partido no
//   está en el grupo, sin `r`: la jornada por defecto;
// - sin modelo, o con el grupo sin encontrar (su temporada sin cargar), la jornada del enlace.
export function parentOf(route, model = null) {
  const params = route?.params || {};
  if (route?.screen === 'partido') {
    const group = model && params.g ? findGroup(model, params.s, params.g) : null;
    if (!group) return { screen: 'jornada', params: pick(params, ['s', 'g', 'r']) };
    if (group.kind !== 'league') return { screen: 'copa', params: { s: group.season, g: group.id } };
    const match = findMatch(group, params);
    return { screen: 'jornada', params: pick({ s: group.season, g: group.id, r: match ? match.roundKey : '' }, ['s', 'g', 'r']) };
  }
  if (UNDER_EXPLORE.has(route?.screen)) return { screen: 'explorar', params: {} };
  return null;
}

// Destino marcado en la barra (§4.1) → { active, current }: 'page' en los principales y 'true'
// en las secundarias. Partido lleva el último destino principal de la sesión o, si se entra por
// enlace directo, Mi equipo si el partido es de mi equipo y Jornada si no.
export function activeTab(route, lastPrimary, isMine) {
  const screen = route?.screen ?? '';
  if (Object.hasOwn(PRIMARY, screen)) return { active: PRIMARY[screen], current: 'page' };
  if (screen === 'partido') return { active: TABS.has(lastPrimary) ? lastPrimary : isMine ? 'miequipo' : 'jornada', current: 'true' };
  if (screen === 'equipo') return { active: isMine ? 'miequipo' : 'explorar', current: 'true' };
  const to = route?.params?.to;
  if (screen === 'ligas' && (to === 'tabla' || to === 'jornada')) return { active: to, current: 'true' };
  return { active: 'explorar', current: 'true' };
}

// ¿Es de mi equipo este partido o esta ficha? Mismo grupo y temporada que el resuelto, y su nombre.
export function routeIsMine(route, resolution) {
  if (resolution?.status !== 'ok' || !resolution.group) return false;
  const params = route?.params || {};
  if (params.s !== resolution.group.season || params.g !== resolution.group.id) return false;
  if (route.screen === 'partido') return params.h === resolution.name || params.a === resolution.name;
  if (route.screen === 'equipo') return params.t === resolution.name;
  return false;
}

// ── startRouter ──────────────────────────────────────────────────────────

// Qué no se pudo cargar, para «No se pudieron cargar los datos de <qué>»: el `what` del error o
// el mensaje de un Error simple (las cargas de `needs` rechazan con Error('la temporada 2024/25')).
// Un fallo de programación (TypeError, RangeError…) no enseña su mensaje.
function loadWhat(err) {
  if (err && typeof err.what === 'string' && err.what) return err.what;
  if (err && Object.getPrototypeOf(err) === Error.prototype && err.message) return err.message;
  return 'esta pantalla';
}

// El aviso de una redirección va detrás de la cabecera de la pantalla (o de su h1).
function withNotice(markup, text) {
  if (!text) return markup;
  const note = String(routeNotice(text));
  const head = markup.indexOf('</header>');
  const h1 = markup.indexOf('</h1>');
  const at = head >= 0 ? head + '</header>'.length : h1 >= 0 ? h1 + '</h1>'.length : 0;
  return markup.slice(0, at) + note + markup.slice(at);
}

const decode = (text) => { try { return decodeURIComponent(text); } catch { return text; } };

// ¿Es mi equipo el de un enlace antiguo «miequipo»? El mismo nombre, o el mismo club en el mismo
// grupo, que el guardado o el resuelto (M3 de la revisión de B2).
function legacyMine(ctx) {
  const mine = [
    ctx.myTeam && ctx.myTeam.name ? { name: ctx.myTeam.name, groupId: ctx.myTeam.groupId } : null,
    ctx.resolution?.status === 'ok' ? { name: ctx.resolution.name, groupId: ctx.resolution.group.id } : null,
  ].filter(Boolean);
  return (team, group) => mine.some((m) => m.name === team
    || (Boolean(group) && group === m.groupId && sameClub(ctx.model.clubIndex(), team, m.name)));
}

// screens: { <ruta de §4.1>: { id, needs, render, mount? } }; root: <main id="contenido">;
// getContext() → { model, myTeam, recent, resolution, today, health, datasets, portal, legacyDate }
// (los datos de cada pintado; el router añade route, params, lastPrimary y backHref); actions, de
// app.js: saveMyTeam(myTeam) guarda mi equipo, addRecent(entry) apunta una ficha en «Vistos hace
// poco» y clearData() borra los datos de la app; session: { getItem, setItem } para el último
// destino principal;
// loadSeason(name, datasets, portalSeason) → Promise[]: la carga de una temporada pasada pendiente,
// seasonNeeds de state.js (las pruebas pasan otra). Devuelve { nav, idle, current }: idle() es la
// promesa del último pintado.
export function startRouter({ screens, root, getContext, window: win, actions = {}, session = null, loadSeason = seasonNeeds }) {
  const doc = win.document;
  const hist = win.history;
  const baseTitle = doc.title;
  const positions = new Map();          // desplazamiento por entrada del historial (fbKey)
  let token = 0;
  let serial = 0;
  let current = null;                   // ruta resuelta de la última navegación
  let seen = { key: null, hash: null, idx: -1 };  // la última entrada atendida
  let cleanup = null;                   // lo que devolvió el último mount
  let latest = Promise.resolve();
  let lastPrimary = null;
  const nesting = [];                   // pila de { target, focusId } de la navegación en mount
  let pendingBack = null;               // resolve() de un nav.back() que espera al pintado de la vuelta
  try { lastPrimary = TABS.has(session?.getItem(SESSION_KEY)) ? session.getItem(SESSION_KEY) : null; } catch { lastPrimary = null; }

  // Cada entrada de la app lleva { fbIdx, fbKey }: fbIdx > 0 dice que la anterior es de la app.
  const entry = () => {
    const st = hist.state;
    return st && typeof st.fbIdx === 'number' && typeof st.fbKey === 'string' ? st : null;
  };
  const newKey = () => `${Date.now().toString(36)}.${++serial}`;
  const stamp = (idx) => {
    const st = { fbIdx: idx, fbKey: newKey() };
    hist.replaceState(st, '');
    return st;
  };
  // El «‹» de una ruta (ctx.backHref y la caja de error): el href de su padre, con el modelo del
  // contexto para saber de qué tipo es el grupo de un partido; null en los destinos principales.
  const backHref = (route, model) => {
    const parent = parentOf(route, model);
    return parent ? routeHref(parent.screen, parent.params) : null;
  };
  const screenOf = (name) => screens[name] || screens[''];

  function rememberPrimary(tab) {
    lastPrimary = tab;
    try { session?.setItem(SESSION_KEY, tab); } catch { /* sin sesión: solo en memoria */ }
  }

  // Enlace antiguo → ruta nueva, y valores por defecto y redirecciones de §4.1, cada paso con
  // replaceState. Devuelve la ruta resuelta, si falta cargar su temporada y el primer aviso.
  function settle(base) {
    let hash = win.location.hash;
    const legacy = translateLegacy(hash, { isMine: legacyMine(base) });
    if (legacy) {
      hist.replaceState(hist.state, '', legacy);
      hash = legacy;
    }
    let route = parseRoute(hash);
    let notice = null;
    for (let i = 0; i <= MAX_REDIRECTS; i++) {
      const res = resolveParams(route, base);
      if (!res.redirect) return { route: { screen: route.screen, params: res.params }, pending: !!res.pending, notice };
      notice = notice || res.redirect.notice || null;
      const href = routeHref(res.redirect.screen, res.redirect.params);
      hist.replaceState(hist.state, '', href);
      route = parseRoute(href);
    }
    // Defensivo: la cadena de redirecciones de resolveParams está pensada para converger; si no lo
    // hace, es un fallo de programación (RangeError: loadWhat no muestra su mensaje literal).
    throw new RangeError('Demasiadas redirecciones');
  }

  function paint(markup) {
    if (cleanup) {
      try { cleanup(); } catch (err) { console.error('[router] limpieza', err); }
      cleanup = null;
    }
    root.innerHTML = String(markup);
  }

  // Desplazamiento: arriba al avanzar, el guardado al volver, el mismo al cambiar jornada o
  // vista; un ancla (#/…#calendario) manda al avanzar. Foco: al h1 (tabindex -1), salvo en la
  // carga inicial; al cambiar jornada o vista, vuelve al control pulsado si sigue (mismo id); y si
  // el ancla es un control de formulario (#/explorar#buscar: «Cambiar» abre Explorar con el
  // buscador enfocado, §4.2 A), al avanzar y al reintentar se lo lleva él, no el h1 (I4(b) de la
  // revisión final de B2). Al volver (Atrás, Adelante o un hash escrito a mano), el h1: en el
  // móvil, el campo abriría el teclado sobre los resultados que se querían ver (decisión 165 de B3).
  function place(mode, target, focusId) {
    const hash = win.location.hash;
    const at = hash.indexOf('#', 1);
    const anchorId = at > 0 ? decode(hash.slice(at + 1)) : '';
    const anchor = anchorId && (mode === 'push' || mode === 'initial') ? doc.getElementById(anchorId) : null;
    if (anchor) anchor.scrollIntoView();
    else win.scrollTo(0, target);
    if (mode === 'initial') return;
    const control = anchorId && (mode === 'push' || mode === 'refresh') ? doc.getElementById(anchorId) : null;
    const field = control && FORM_CONTROLS.has(control.tagName) && root.contains(control) ? control : null;
    const kept = focusId ? doc.getElementById(focusId) : null;
    const el = field || (kept && root.contains(kept) ? kept : root.querySelector('h1'));
    if (!el) return;
    if (el.tagName === 'H1' && !el.hasAttribute('tabindex')) el.setAttribute('tabindex', '-1');
    el.focus({ preventScroll: true });
  }

  // mode: 'initial' | 'push' | 'replace' | 'pop' | 'refresh'. clickedId: el id del enlace pulsado
  // (onClick), para el foco al cambiar de jornada o de vista aunque el clic no active el control
  // (Safari, B11): activeElement queda como reserva, para el teclado.
  function show(mode, carried = null, clickedId = null) {
    const st = entry();
    // Una navegación que empieza dentro de un mount (nesting no vacío) hereda el destino de
    // desplazamiento y de foco de la navegación de fuera, en vez de recalcularlos con el scrollY
    // o el activeElement de ahora mismo, que todavía son los de antes de esa navegación.
    const inherited = nesting[nesting.length - 1] || null;
    const target = inherited ? inherited.target
      : mode === 'pop' ? (positions.get(st?.fbKey) ?? 0) : mode === 'replace' ? win.scrollY : 0;
    const focusId = inherited ? inherited.focusId
      : mode === 'replace' ? (clickedId || doc.activeElement?.id || null) : null;
    latest = run(mode, carried, 0, target, focusId);
    return latest;
  }

  async function run(mode, carried, depth, target, focusId) {
    const my = ++token;
    let route = parseRoute(win.location.hash);
    let screen = screenOf(route.screen);
    let base = null;
    try {
      base = getContext();
      const first = settle(base);
      route = first.route;
      screen = screenOf(route.screen);
      const notice = carried || first.notice;
      const st = entry();
      current = route;
      seen = { key: st?.fbKey ?? null, hash: win.location.hash, idx: st?.fbIdx ?? 0 };
      const tab = activeTab(route, lastPrimary, routeIsMine(route, base.resolution));
      updateTabbar(tab.active, tab.current, doc);
      doc.title = route.screen === '' ? baseTitle : `${routeTitle(route.screen)} · ${baseTitle}`;
      // La temporada del portal llega a needs desde el contexto, nunca de config.js (R2-1).
      const portalSeason = base.portal.season;
      // Una temporada pasada sin cargar (pending: resolveParams no pudo validar la ruta) la carga el
      // router, junto a los needs de la pantalla, pida esta su temporada o no (I4(a) de la revisión
      // final de B2): pending es justo seasonNeeds(s). Si la carga falla, la caja de error con
      // «Reintentar», que vuelve a pedirla (ensureSeasonData no memoriza un fallo).
      const needs = [
        ...(first.pending ? loadSeason(route.params.s, base.datasets, portalSeason) : []),
        ...((screen.needs && screen.needs(route.params, base.datasets, { portalSeason })) || []),
      ];
      if (needs.length) {
        paint(skeleton(screen.id));
        await Promise.all(needs);
        if (my !== token) return latest;   // otra navegación empezó mientras cargaba: no se pinta; que idle() la espere
      }
      if (needs.length || first.pending) {
        base = getContext();
        const again = settle(base);
        if (again.pending) throw Object.assign(new Error('temporada sin cargar'), { what: `la temporada ${seasonLabel(again.route.params.s)}` });
        if (routeHref(again.route.screen, again.route.params) !== routeHref(route.screen, route.params)) {
          if (depth >= MAX_REDIRECTS) throw new RangeError('Demasiadas redirecciones');
          return run(mode, notice || again.notice, depth + 1, target, focusId);
        }
      }
      const ctx = { ...base, route, params: route.params, lastPrimary, backHref: backHref(route, base.model) };
      // Solo se pinta Html de html``, que escapa cada interpolación (spec §5.1).
      const view = screen.render(ctx);
      if (!(view instanceof Html)) throw new TypeError(`render de ${screen.id} no devolvió Html`);
      paint(withNotice(String(view), notice));
      if (Object.hasOwn(PRIMARY, route.screen)) rememberPrimary(PRIMARY[route.screen]);
      if (screen.mount) {
        // Si el mount navega (nav.go, nav.replace, saveMyTeam…) de forma síncrona, la navegación
        // anidada corre con el `target`/`focusId` de ESTA (nesting): «arriba al avanzar» no se
        // pierde por el scrollY de antes de este push (B2, ronda 1, hallazgo 3).
        nesting.push({ target, focusId });
        let done;
        try {
          done = screen.mount(root, ctx, nav);
        } catch (err) {
          // Un mount que lanza deja la pantalla pintada (decisión del controlador, B2 ronda 1): sus
          // enlaces los atiende igual el router por delegación; la caja de error es solo de needs y render.
          console.error('[router] mount', err);
        } finally {
          nesting.pop();
        }
        if (my !== token) {
          // El mount ya navegó: su pantalla no está en el DOM. Si además devolvió una limpieza, se
          // llama ya mismo (nunca se guarda en `cleanup`, que ya es la de la navegación anidada) y
          // esa navegación manda la suya; idle() la espera encadenando en `latest` (hallazgo 1).
          if (typeof done === 'function') {
            try { done(); } catch (err) { console.error('[router] limpieza', err); }
          }
          return latest;
        }
        if (typeof done === 'function') cleanup = done;
      }
      place(mode, target, focusId);
    } catch (err) {
      if (my !== token) return latest;
      console.error('[router]', err);
      // Paso 0 de B3: el «‹» de la caja se calcula aparte. Con una temporada mal formada, parentOf
      // de Partido vuelve a tocarla (findGroup) y lanzaría aquí dentro: idle() rechazaba y se
      // quedaba el esqueleto, sin «Reintentar». Entonces, el padre sin modelo: la jornada del enlace.
      let back = null;
      try { back = backHref(route, base?.model); } catch { back = backHref(route, null); }
      paint(errorScreen({ screenId: screen?.id || 'pendiente', title: routeTitle(route.screen), what: loadWhat(err), back }));
      place(mode, 0, null);
    }
  }

  // Ir a un href de la app: pushState o replaceState según historyMode (o `forced`). clickedId: el
  // id del enlace pulsado (onClick), para el foco al cambiar de jornada o de vista.
  function navigate(href, forced = null, clickedId = null) {
    let mode = forced;
    if (!mode) {
      try {
        const target = parseRoute(href);
        const res = resolveParams(target, getContext());
        mode = historyMode(current, { screen: target.screen, params: res.params || target.params });
      } catch {
        mode = 'push';
      }
    }
    if (mode === 'replace') hist.replaceState(hist.state, '', href);
    else hist.pushState({ fbIdx: (entry()?.fbIdx ?? 0) + 1, fbKey: newKey() }, '', href);
    return show(mode, null, clickedId);
  }

  // «‹»: la entrada anterior si es de la app; si no, el padre (spec §4.1). hist.back() dispara
  // popstate más tarde, nunca en este turno, así que el pintado real llega por onLocation: se deja
  // un pendiente y se resuelve desde allí, para que idle() y el propio nav.back() esperen al de la
  // vuelta, no al de la pantalla que ya estaba pintada (B2, ronda 1, hallazgo 2). Dos nav.back()
  // seguidos, cada uno con su history.back(), encadenan sus pendientes en vez de pisarse, y el
  // primer popstate que atiende onLocation los resuelve todos con su pintado. En un navegador real
  // pueden llegar dos popstate, a entradas distintas (el segundo pinta sin pendiente que resolver);
  // en el navegador falso de las pruebas llegan a la misma entrada y onLocation descarta el segundo.
  // Sin encadenar, el pendiente del primero se perdía y su promesa se quedaba colgada para siempre
  // (B2, ronda 2, hallazgo único).
  function goBack() {
    if ((entry()?.fbIdx ?? 0) > 0) {
      const earlier = pendingBack;
      latest = new Promise((resolve) => {
        pendingBack = earlier ? (value) => { earlier(value); resolve(value); } : resolve;
      });
      hist.back();
      return latest;
    }
    let model = null;
    try { model = getContext().model; } catch { /* sin contexto: el padre que dice el enlace */ }
    const parent = current ? parentOf(current, model) : null;
    return navigate(parent ? routeHref(parent.screen, parent.params) : '#/', 'push');
  }

  // Atrás, Adelante o un hash escrito a mano. popstate y hashchange llegan juntos: se atiende uno.
  function onLocation() {
    const st = entry();
    if (st && st.fbKey === seen.key && win.location.hash === seen.hash) return;
    if (!st) stamp(seen.idx + 1);   // entrada nueva del navegador, detrás de la última atendida
    const resolveBack = pendingBack;
    pendingBack = null;
    const painted = show('pop');
    if (resolveBack) painted.then(resolveBack, resolveBack);
  }

  // Delegación en el documento: enlaces #/… (con su modo de historial), «‹», Reintentar y
  // anclas internas como «Saltar al contenido», que nunca cambian la ruta.
  function onClick(event) {
    if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    const el = event.target && event.target.closest ? event.target.closest('a[href],[data-action]') : null;
    if (!el) return;
    const action = el.getAttribute('data-action');
    if (action === 'retry') {
      event.preventDefault();
      show('refresh');
      return;
    }
    if (action === 'back' && (entry()?.fbIdx ?? 0) > 0) {
      event.preventDefault();
      hist.back();
      return;
    }
    if (el.tagName !== 'A' || el.hasAttribute('download')) return;
    const target = el.getAttribute('target');
    if (target && target !== '_self') return;
    const href = el.getAttribute('href') || '';
    if (href.startsWith('#/')) {
      event.preventDefault();
      navigate(href, null, el.id || null);
    } else if (href.length > 1 && href.startsWith('#')) {
      // Un ancla interna nunca cambia la ruta (spec §4.1): se previene siempre, exista o no su
      // destino. Si no, un hash sin ruta («#calendario») lo trataría el navegador y acabaría en
      // Mi equipo, con una entrada nueva (B2, ronda 1, hallazgo 5).
      event.preventDefault();
      const dest = doc.getElementById(decode(href.slice(1)));
      if (!dest) return;
      if (!dest.hasAttribute('tabindex')) dest.setAttribute('tabindex', '-1');
      dest.focus();
    }
  }

  // La ruta actual con otros parámetros (completos), con replaceState y sin pintar: los buscadores
  // de Explorar y Goleadores apuntan su `q` al escribir sin perder el cursor (decisión 4 de B3). La
  // entrada conserva su { fbIdx, fbKey } (y con ellos su desplazamiento guardado y el «‹») y su
  // ancla (#buscar); `current` pasa a ser la ruta nueva, resuelta como en navigate, para que la
  // navegación siguiente compare con ella. No toca el foco ni el desplazamiento. Devuelve false si
  // no hay ruta o si el navegador se niega: Safari lanza si pasan de 100 en pocos segundos.
  function update(params) {
    if (!current) return false;
    const hash = win.location.hash;
    const at = hash.indexOf('#', 1);
    const href = routeHref(current.screen, params) + (at > 0 ? hash.slice(at) : '');
    const target = parseRoute(href);
    let resolved = null;
    try { resolved = resolveParams(target, getContext()).params || null; } catch { resolved = null; }
    try {
      hist.replaceState(hist.state, '', href);
    } catch {
      return false;
    }
    current = { screen: target.screen, params: resolved || target.params };
    seen = { ...seen, hash: win.location.hash };
    return true;
  }

  const nav = {
    go: (screen, params) => navigate(routeHref(screen, params)),
    replace: (screen, params) => navigate(routeHref(screen, params), 'replace'),
    back: goBack,
    retry: () => show('refresh'),
    // «Hacer mi equipo» y la respuesta a E: lo guarda app.js y se vuelve a pintar la ruta.
    saveMyTeam(myTeam) {
      const saved = actions.saveMyTeam ? actions.saveMyTeam(myTeam) : false;
      show('refresh');
      return saved;
    },
    update,
    // «Vistos hace poco» (decisión 5 de B3): Equipo apunta su ficha en su mount; lo guarda app.js,
    // sin volver a pintar. Devuelve si quedó guardado en el almacén (false: solo en memoria).
    addRecent(entry) {
      return actions.addRecent ? actions.addRecent(entry) : false;
    },
    // «Borrar datos de esta app» (Ajustes, decisión 6 de B3): lo borra app.js y se abre Mi equipo,
    // con una entrada nueva.
    clearData() {
      if (actions.clearData) actions.clearData();
      return navigate('#/', 'push');
    },
  };

  if ('scrollRestoration' in hist) hist.scrollRestoration = 'manual';
  win.addEventListener('popstate', onLocation);
  win.addEventListener('hashchange', onLocation);
  win.addEventListener('scroll', () => {
    const st = entry();
    if (st) positions.set(st.fbKey, win.scrollY);
  }, { passive: true });
  doc.addEventListener('click', onClick);
  if (!entry()) stamp(0);
  show('initial');
  return { nav, idle: () => latest, current: () => current };
}
