// Arranque del rediseño (spec §5.2): almacén, registro de datos, modelo y primera pantalla.
// index.html llama a start(document, window) cuando ya han llegado los datos inmediatos: importar
// este módulo no toca el navegador (test_rediseno_modulos). Desde el corte pinta la portada sin
// router; en la Tarea 6, startRouter ocupa el lugar de paintHome.
import { PORTAL } from './config.js';
import { html } from './html.js';
import { readGlobals } from './state.js';
import { createModel } from './model.js';
import { buildClubIndex, resolveMyTeam } from './myteam.js';
import { loadStore } from './store.js';
import { canaryTodayISO } from './links.js';
import { crestFallback } from './ui.js';
import { screen as home } from './screen-home.js';

// El contexto común de las pantallas (esqueleto, sin la ruta): mi equipo del almacén, resuelto
// contra la temporada del portal con el «hoy» de Canarias. Con el almacén vacío o bloqueado,
// loadStore da el equipo por defecto, sin preguntas. buildClubIndex se inyecta en createModel.
export function startContext({ storage, portal, datasets, today }) {
  const store = loadStore(storage, { defaultTeam: portal.defaultTeam, portalSeason: portal.season });
  const model = createModel(datasets, { portalSeason: portal.season, buildClubIndex });
  const resolution = resolveMyTeam(store.myTeam, model.season(portal.season), model.clubIndex(), today);
  return {
    model, myTeam: store.myTeam, resolution, today, health: datasets.health, datasets,
    portal: { season: portal.season, defaultTeam: portal.defaultTeam }, lastPrimary: 'miequipo',
  };
}

function paintHome(root, win) {
  const datasets = { ...readGlobals(), seasonRaw: {}, matchDetail: null, lineups: {}, health: null };
  const base = startContext({ storage: () => win.localStorage, portal: PORTAL, datasets, today: canaryTodayISO(new Date(), PORTAL.timeZone) });
  const route = { screen: '', params: {} };
  root.innerHTML = String(home.render({ ...base, route, params: route.params }));
}

// Arranca la app en el documento que recibe: escucha los errores de escudo y pinta la portada en
// #contenido; si algo lanza, la caja de error con «Reintentar», que recarga.
export function start(doc, win) {
  // escudos/s/ no existe hasta B4: miniatura → original → monograma («Para B2», Escudos).
  doc.addEventListener('error', (event) => crestFallback(event.target), true);
  const root = doc.getElementById('contenido');
  try {
    paintHome(root, win);
  } catch (error) {
    console.error('[app] no se pudo pintar la portada:', error);
    root.innerHTML = String(html`<div class="box" role="alert"><p class="notice"><b>No se pudieron cargar los datos de la portada.</b></p><div class="buttons"><button type="button" class="button is-main" data-action="retry">Reintentar</button></div></div>`);
    root.querySelector('[data-action="retry"]').addEventListener('click', () => win.location.reload());
  }
}
