// Router del rediseño (spec §4.1, §5.1, §7 y §8). La ruta vive en el hash
// (#/<pantalla>?<parámetros>) y es la fuente de verdad de lo que se ve.
// - Funciones puras: resolveParams (valores por defecto y redirecciones de §4.1),
//   historyMode (pushState o replaceState), parentOf («‹»), activeTab y routeIsMine (barra).
// - startRouter, la parte con DOM: hashchange y popstate, enlaces antiguos, token de
//   navegación, needs → render → mount, desplazamiento por entrada del historial, foco al h1,
//   «‹» y Reintentar.
// No toca el navegador al importarse: startRouter recibe `window`.
import { Html } from './html.js';
import { parseRoute, routeHref, translateLegacy } from './links.js';
import { findMatch, findRound, seasonLabel } from './model.js';
import { sameClub } from './myteam.js';
import { skeleton, errorScreen, routeNotice, routeTitle, updateTabbar } from './shell.js';

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
const SESSION_KEY = 'futbol-base:destino';

const redirect = (screen, params, notice = null) => ({ redirect: { screen, params, notice } });
const omit = (params, key) => Object.fromEntries(Object.entries(params).filter(([k]) => k !== key));
const pick = (params, keys) => Object.fromEntries(keys.filter((k) => params[k] != null && params[k] !== '').map((k) => [k, params[k]]));
const knownSeason = (ctx, name) => (ctx.datasets?.seasons || []).some((entry) => entry && entry.name === name);
const hasTeam = (group, name) => group.standings.some((row) => row.team === name)
  || group.rounds.some((round) => round.matches.some((m) => m.home === name || m.away === name));

// Un grupo de la temporada o, si no, de los torneos (Cups de 2025-2026: MCP3, MCPK1…).
function findGroup(model, season, id) {
  const group = model.group(season, id);
  if (group) return group;
  const cups = model.cups();
  return cups && cups.season === season ? cups.groups.find((g) => g.id === id) || null : null;
}

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
//   pasada aún no está cargada y no se puede validar el grupo (el router la vuelve a resolver
//   cuando termina `needs`). Las redirecciones se aplican con replaceState.
export function resolveParams(route, ctx) {
  const screen = route.screen;
  const raw = route.params || {};
  if (NO_PARAMS.has(screen)) return { params: {} };
  const portal = ctx.portal.season;
  if (raw.s && raw.s !== portal && !knownSeason(ctx, raw.s)) {
    return redirect(screen, omit(raw, 's'), `No existe la temporada ${seasonLabel(raw.s)}; te enseñamos la actual`);
  }
  const params = { ...raw, s: raw.s || portal };
  if (screen === 'jornada' || screen === 'tabla') return leagueParams(screen, raw, params, ctx);
  if (screen === 'partido') return matchParams(params, ctx);
  if (screen === 'equipo') return teamParams(params, ctx);
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

// Equipo: `g` es obligatorio; sin él, el equipo se busca en Explorar (como un enlace antiguo).
function teamParams(params, ctx) {
  const s = params.s === ctx.portal.season ? '' : params.s;
  if (!params.g) return redirect('explorar', { s, q: params.t });
  const season = ctx.model.season(params.s);
  if (!season) return { params, pending: true };
  if (!findGroup(ctx.model, params.s, params.g)) {
    return redirect('explorar', { s, q: params.t }, `No encontramos el grupo ${params.g} en la temporada ${seasonLabel(params.s)}`);
  }
  return { params };
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

// Padre de «‹» cuando no hay entrada anterior de la app: Partido → su jornada; lo que cuelga de
// Explorar → Explorar; los destinos principales no tienen.
export function parentOf(route) {
  const params = route?.params || {};
  if (route?.screen === 'partido') return { screen: 'jornada', params: pick(params, ['s', 'g', 'r']) };
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
// getContext() → { model, myTeam, resolution, today, health, datasets, portal } (los datos de
// cada pintado; el router añade route, params, lastPrimary y backHref); actions.saveMyTeam(myTeam)
// guarda mi equipo (app.js); session: { getItem, setItem } para el último destino principal.
// Devuelve { nav, idle, current }: idle() es la promesa del último pintado.
export function startRouter({ screens, root, getContext, window: win, actions = {}, session = null }) {
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
  const backHref = (route) => {
    const parent = parentOf(route);
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
    throw new Error('Demasiadas redirecciones');
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
  // carga inicial; al cambiar jornada o vista, vuelve al control pulsado si sigue (mismo id).
  function place(mode, target, focusId) {
    const hash = win.location.hash;
    const at = hash.indexOf('#', 1);
    const anchor = at > 0 && (mode === 'push' || mode === 'initial') ? doc.getElementById(decode(hash.slice(at + 1))) : null;
    if (anchor) anchor.scrollIntoView();
    else win.scrollTo(0, target);
    if (mode === 'initial') return;
    const kept = focusId ? doc.getElementById(focusId) : null;
    const el = kept && root.contains(kept) ? kept : root.querySelector('h1');
    if (!el) return;
    if (el.tagName === 'H1' && !el.hasAttribute('tabindex')) el.setAttribute('tabindex', '-1');
    el.focus({ preventScroll: true });
  }

  // mode: 'initial' | 'push' | 'replace' | 'pop' | 'refresh'.
  function show(mode, carried = null) {
    const st = entry();
    const target = mode === 'pop' ? (positions.get(st?.fbKey) ?? 0) : mode === 'replace' ? win.scrollY : 0;
    const focusId = mode === 'replace' ? (doc.activeElement?.id || null) : null;
    latest = run(mode, carried, 0, target, focusId);
    return latest;
  }

  async function run(mode, carried, depth, target, focusId) {
    const my = ++token;
    let route = parseRoute(win.location.hash);
    let screen = screenOf(route.screen);
    try {
      let base = getContext();
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
      const needs = (screen.needs && screen.needs(route.params, base.datasets, { portalSeason: base.portal.season })) || [];
      if (needs.length) {
        paint(skeleton(screen.id));
        await Promise.all(needs);
        if (my !== token) return;   // otra navegación empezó mientras cargaba: no se pinta
      }
      if (needs.length || first.pending) {
        base = getContext();
        const again = settle(base);
        if (again.pending) throw Object.assign(new Error('temporada sin cargar'), { what: `la temporada ${seasonLabel(again.route.params.s)}` });
        if (routeHref(again.route.screen, again.route.params) !== routeHref(route.screen, route.params)) {
          if (depth >= MAX_REDIRECTS) throw new Error('Demasiadas redirecciones');
          return run(mode, notice || again.notice, depth + 1, target, focusId);
        }
      }
      const ctx = { ...base, route, params: route.params, lastPrimary, backHref: backHref(route) };
      // Solo se pinta Html de html``, que escapa cada interpolación (spec §5.1).
      const view = screen.render(ctx);
      if (!(view instanceof Html)) throw new TypeError(`render de ${screen.id} no devolvió Html`);
      paint(withNotice(String(view), notice));
      if (Object.hasOwn(PRIMARY, route.screen)) rememberPrimary(PRIMARY[route.screen]);
      if (screen.mount) {
        try {
          const done = screen.mount(root, ctx, nav);
          if (typeof done === 'function') cleanup = done;
        } catch (err) {
          console.error('[router] mount', err);
        }
        if (my !== token) return;   // mount ya ha navegado (nav.go, saveMyTeam…): manda esa navegación
      }
      place(mode, target, focusId);
    } catch (err) {
      if (my !== token) return;
      console.error('[router]', err);
      paint(errorScreen({ screenId: screen?.id || 'pendiente', title: routeTitle(route.screen), what: loadWhat(err), back: backHref(route) }));
      place(mode, 0, null);
    }
  }

  // Ir a un href de la app: pushState o replaceState según historyMode (o `forced`).
  function navigate(href, forced = null) {
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
    return show(mode);
  }

  // «‹»: la entrada anterior si es de la app; si no, el padre (spec §4.1).
  function goBack() {
    if ((entry()?.fbIdx ?? 0) > 0) {
      hist.back();
      return latest;
    }
    const parent = current ? parentOf(current) : null;
    return navigate(parent ? routeHref(parent.screen, parent.params) : '#/', 'push');
  }

  // Atrás, Adelante o un hash escrito a mano. popstate y hashchange llegan juntos: se atiende uno.
  function onLocation() {
    const st = entry();
    if (st && st.fbKey === seen.key && win.location.hash === seen.hash) return;
    if (!st) stamp(seen.idx + 1);   // entrada nueva del navegador, detrás de la última atendida
    show('pop');
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
      navigate(href);
    } else if (href.length > 1 && href.startsWith('#')) {
      const dest = doc.getElementById(decode(href.slice(1)));
      if (!dest) return;
      event.preventDefault();
      if (!dest.hasAttribute('tabindex')) dest.setAttribute('tabindex', '-1');
      dest.focus();
    }
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
