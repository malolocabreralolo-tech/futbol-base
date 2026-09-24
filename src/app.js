// Arranque (spec §5.2): almacén, registro de datos, modelo y router. index.html llama a
// start(document, window) cuando ya han llegado los datos inmediatos: importar este módulo no toca
// el navegador (test_rediseno_modulos).
import { PORTAL } from './config.js';
import { readGlobals } from './state.js';
import { createModel } from './model.js';
import { buildClubIndex, resolveMyTeam } from './myteam.js';
import { loadStore } from './store.js';
import { canaryTodayISO } from './links.js';
import { crestFallback } from './ui.js';
import { startRouter } from './router.js';
import { SCREEN_MAP } from './screens.js';

// Los datos de un pintado (el ctx de las pantallas sin la ruta, que añade el router): mi equipo
// resuelto contra la temporada del portal con el «hoy» de Canarias, un solo reloj (decisión 4).
function contextFor({ model, myTeam, portal, datasets, today, legacyDate = null }) {
  const resolution = resolveMyTeam(myTeam, model.season(portal.season), model.clubIndex(), today);
  return { model, myTeam, resolution, today, health: datasets.health, datasets, portal, legacyDate };
}

// El mismo contexto desde un almacén y con el día que se le pida: la base de las pruebas de las
// pantallas. Con el almacén vacío o bloqueado, loadStore da el equipo por defecto, sin preguntas.
export function startContext({ storage, portal, datasets, today }) {
  const store = loadStore(storage, { defaultTeam: portal.defaultTeam, portalSeason: portal.season });
  const model = createModel(datasets, { portalSeason: portal.season, buildClubIndex });
  const base = { season: portal.season, defaultTeam: portal.defaultTeam };
  return { ...contextFor({ model, myTeam: store.myTeam, portal: base, datasets, today }), lastPrimary: 'miequipo' };
}

export function start(doc, win) {
  // Escudos: miniatura → original → monograma (spec §5.4). Los errores de <img> no burbujean: se
  // escuchan en captura, y desde antes del primer pintado (escudos/s/ no existe hasta B4).
  doc.addEventListener('error', (event) => crestFallback(event.target), true);
  const storage = () => win.localStorage;
  const portal = { season: PORTAL.season, defaultTeam: PORTAL.defaultTeam };
  // Registro de datos: los globales inmediatos y lo que traen los cargadores perezosos.
  const datasets = { ...readGlobals(), seasonRaw: {}, matchDetail: null, lineups: {}, health: null };
  const model = createModel(datasets, { portalSeason: portal.season, buildClubIndex });
  const store = loadStore(storage, { defaultTeam: portal.defaultTeam, portalSeason: portal.season });
  // La fecha del literal oculto «Última actualización» de index.html, por si falta data-health.
  const legacyDate = doc.getElementById('legacyUpdated')?.textContent.match(/\d{2}\/\d{2}\/\d{4}/)?.[0] || null;
  const getContext = () => contextFor({
    model, myTeam: store.myTeam, portal, datasets, today: canaryTodayISO(new Date(), PORTAL.timeZone), legacyDate,
  });
  return startRouter({ screens: SCREEN_MAP, root: doc.getElementById('contenido'), getContext, window: win });
}
