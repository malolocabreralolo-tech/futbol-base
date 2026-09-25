// Arranque (spec §5.2): almacén, registro de datos, modelo y router. index.html llama a
// start(document, window) cuando ya han llegado los datos inmediatos: importar este módulo no toca
// el navegador (test_rediseno_modulos). Antes del primer pintado, start instala la cadena de los
// escudos, sigue la conexión para el aviso de la cabecera y guarda el cambio de fase de mi equipo;
// sin los datos inmediatos de la temporada, pinta la caja de error y no arranca el router.
import { PORTAL } from './config.js';
import { readGlobals, ensureHealth } from './state.js';
import { createModel, seasonLabel } from './model.js';
import { buildClubIndex, resolveMyTeam, myTeamToSave } from './myteam.js';
import { loadStore, saveStore, safeStorage, addRecent, clearStore } from './store.js';
import { canaryTodayISO, parseRoute } from './links.js';
import { crestFallback } from './ui.js';
import { errorScreen, offlineNotice, routeTitle, updateTabbar } from './shell.js';
import { startRouter, activeTab, SESSION_KEY } from './router.js';
import { SCREEN_MAP } from './screens.js';

// Los datos de un pintado (el ctx de las pantallas sin la ruta, que añade el router): mi equipo
// resuelto contra la temporada del portal con el «hoy» de Canarias, un solo reloj (decisión 4), y
// los vistos hace poco del almacén (decisión 5 de B3).
function contextFor({ model, myTeam, recent = [], portal, datasets, today, legacyDate = null }) {
  const resolution = resolveMyTeam(myTeam, model.season(portal.season), model.clubIndex(), today);
  return { model, myTeam, recent, resolution, today, health: datasets.health, datasets, portal, legacyDate };
}

// El mismo contexto desde un almacén y con el día que se le pida: la base de las pruebas de las
// pantallas. Con el almacén vacío o bloqueado, loadStore da el equipo por defecto, sin preguntas.
export function startContext({ storage, portal, datasets, today }) {
  const store = loadStore(storage, { defaultTeam: portal.defaultTeam, portalSeason: portal.season });
  const model = createModel(datasets, { portalSeason: portal.season, buildClubIndex });
  const base = { season: portal.season, defaultTeam: portal.defaultTeam };
  return { ...contextFor({ model, myTeam: store.myTeam, recent: store.recent, portal: base, datasets, today }), lastPrimary: 'miequipo' };
}

// Los datos inmediatos sin los que no hay temporada: sin uno de ellos, ni X ni B serían verdad.
const REQUIRED = ['benjamin', 'prebenjamin', 'history'];

// config: el PORTAL de config.js; las pruebas pasan otro (una temporada simulada). now: el reloj,
// inyectable en las pruebas (así no hace falta simular temporizadores); por defecto, el de verdad.
export function start(doc, win, config = PORTAL, { now = () => new Date() } = {}) {
  // Escudos: miniatura → original → monograma (spec §5.4). Los errores de <img> no burbujean: se
  // escuchan en captura, y desde antes del primer pintado (escudos/s/ no existe hasta B4).
  doc.addEventListener('error', (event) => crestFallback(event.target), true);
  const storage = () => win.localStorage;
  const portal = { season: config.season, defaultTeam: config.defaultTeam };
  // Registro de datos: los globales inmediatos y lo que traen los cargadores perezosos. health es
  // undefined mientras data-health.json no se ha pedido y null si falló: se pide una vez por sesión
  // (M4 de la revisión final de B2).
  const datasets = { ...readGlobals(), seasonRaw: {}, matchDetail: null, lineups: {}, health: undefined };
  // La fecha del literal oculto «Última actualización» de index.html, por si falta data-health.
  const legacyDate = doc.getElementById('legacyUpdated')?.textContent.match(/\d{2}\/\d{2}\/\d{4}/)?.[0] || null;

  // «Sin conexión. Datos del …» en la cabecera (spec §4.10), en vivo.
  function showOffline() {
    const slot = doc.querySelector('.shell-offline');
    if (slot) slot.innerHTML = win.navigator.onLine === false ? String(offlineNotice(datasets.health, legacyDate)) : '';
  }
  win.addEventListener('online', showOffline);
  win.addEventListener('offline', showOffline);
  showOffline();
  // El mismo vuelo que la portada (ensureHealth es de un solo vuelo): su resultado, o null si falla,
  // queda en datasets.health, y así ninguna visita a Mi equipo lo vuelve a pedir ni lo espera.
  ensureHealth().then((health) => {
    datasets.health = health;
    showOffline();
  });

  // Sin los datos inmediatos de la temporada (un precache a medias y sin conexión, por ejemplo), la
  // caja de error de §7 con «Reintentar», que recarga la página: nunca un X o un B falsos (M4 de la
  // revisión adversarial). Mi equipo no se resuelve ni se guarda, y el router no arranca.
  if (REQUIRED.some((key) => !datasets[key])) {
    const route = parseRoute(win.location.hash);
    const screen = SCREEN_MAP[route.screen] || SCREEN_MAP[''];
    // Sin datos no hay resolución de mi equipo (isMine, false): la barra y el título de la ruta
    // pedida se actualizan igual que lo haría el router, que aquí no llega a arrancar.
    const tab = activeTab(route, null, false);
    updateTabbar(tab.active, tab.current, doc);
    doc.title = route.screen === '' ? doc.title : `${routeTitle(route.screen)} · ${doc.title}`;
    doc.getElementById('contenido').innerHTML = String(errorScreen({
      screenId: screen.id, title: routeTitle(route.screen), what: `la temporada ${seasonLabel(portal.season)}`,
    }));
    doc.addEventListener('click', (event) => {
      if (event.target?.closest?.('[data-action="retry"]')) win.location.reload();
    });
    return null;
  }

  const model = createModel(datasets, { portalSeason: portal.season, buildClubIndex });
  let store = loadStore(storage, { defaultTeam: portal.defaultTeam, portalSeason: portal.season });
  const getContext = () => contextFor({
    model, myTeam: store.myTeam, recent: store.recent, portal, datasets, today: canaryTodayISO(now(), config.timeZone), legacyDate,
  });

  // El cambio de fase que se resuelve sin preguntar (FF5 → A2) queda guardado desde el arranque
  // (decisión 12 de B1). Un cambio de temporada, nunca: se resuelve en cada carga hasta que la
  // familia lo confirma (A2 de la revisión adversarial). Un dato mal formado no debe impedir que
  // el router arranque: si getContext() falla aquí (buildSeason, el índice de clubes o
  // resolveMyTeam, con datos mal formados), se registra y no se guarda nada; el router arranca
  // igual y, si el mismo fallo vuelve a aparecer al pintar, enseña su propia caja de error.
  try {
    const next = myTeamToSave(store.myTeam, getContext().resolution);
    if (next) {
      store = { ...store, myTeam: next };
      saveStore(storage, store);
    }
  } catch (err) {
    console.error('[app] guardado al arrancar', err);
  }

  return startRouter({
    screens: SCREEN_MAP,
    root: doc.getElementById('contenido'),
    getContext,
    window: win,
    // El último destino principal, para la barra en Partido, dura lo que la pestaña (§4.1).
    session: safeStorage(() => win.sessionStorage),
    actions: {
      // Respuesta a la pregunta de E y «Hacer mi equipo» (§4.2 y §4.6): se guarda (o, si el
      // almacenamiento falla, queda en memoria) y el router vuelve a pintar la ruta.
      saveMyTeam(myTeam) {
        store = { ...store, myTeam };
        return saveStore(storage, store);
      },
      // «Vistos hace poco» (§4.6 y §6.5): la ficha visitada va la primera, sin repetidos y como
      // máximo 8 (addRecent de store.js); se guarda o, si el almacenamiento falla, queda en memoria.
      addRecent(entry) {
        store = addRecent(store, entry);
        return saveStore(storage, store);
      },
      // «Borrar datos de esta app» (§4.7 y §4.9): el almacén, con la clave v1 y las antiguas, y el
      // último destino de la sesión; en memoria, lo de un almacén vacío (loadStore sin almacenamiento
      // da el equipo por defecto), aunque el navegador no deje borrar.
      clearData() {
        clearStore(storage);
        safeStorage(() => win.sessionStorage).removeItem(SESSION_KEY);
        store = loadStore(null, { defaultTeam: portal.defaultTeam, portalSeason: portal.season });
      },
    },
  });
}
