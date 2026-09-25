// Contexto de pantalla (ctx del esqueleto de B2) con las fixtures congeladas, para probar
// render(ctx) en Node. Nunca lee los data-*.js ni src/config.js vivos: la temporada del portal
// y el equipo por defecto van aquí, fijos.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { fixture } from './load.mjs';
import { datasetsFrom } from './simulate.mjs';
import { memoryStorage } from './fake-browser.mjs';
import { startContext } from '../../../../src/app.js';
import { routeHref } from '../../../../src/links.js';
import { activeTab, parentOf } from '../../../../src/router.js';
import { STORE_KEY } from '../../../../src/store.js';

export const PORTAL_SEASON = '2025-2026';
export const MY_TEAM = { name: 'Las Mesas Hu.', season: PORTAL_SEASON, cat: 'prebenjamin', groupId: 'PG2' };
// El equipo por defecto con la forma de PORTAL.defaultTeam (config.js), sin temporada.
export const DEFAULT_TEAM = { cat: 'prebenjamin', groupId: 'PG2', name: 'Las Mesas Hu.' };

// Registro de datos con la forma de readGlobals() más lo perezoso (esqueleto de B2): el de
// datasetsFrom (Tarea 3) con SEASONS, data-health y los goleadores que se pidan.
// `current` es el crudo de la temporada actual (fixture o currentAt(...)).
export function datasetsFor({ current = fixture('current-2025-2026'), golBenj = [], golPrebenj = [], seasonRaw = {} } = {}) {
  return datasetsFrom(current, {
    golBenj, golPrebenj, seasonRaw, health: fixture('health'),
    seasons: [{ name: PORTAL_SEASON, current: true }, { name: '2024-2025', current: false }],
  });
}

// La temporada 2024-25 congelada con la forma de SEASON_2024_2025 (que trae `name`).
export function pastSeasonRaw() {
  const raw = fixture('historical-2024-2025');
  return { name: raw.season, current: false, benjamin: raw.benjamin, prebenjamin: raw.prebenjamin };
}

// El ctx de una pantalla, el mismo que le da la app (decisión 109; M1 de la revisión final de B2):
// startContext de app.js, que comparte contextFor con start (el modelo, mi equipo resuelto con
// resolveMyTeam sobre la temporada del portal, el hoy inyectado, health y legacyDate), desde un
// almacén con `myTeam` guardado (null: el almacén vacío, que da el equipo por defecto), más lo que
// añade el router:
// - route y params (ya resueltos: lo hace el router);
// - lastPrimary, un destino de la barra: el de la pantalla si es uno principal y, si no, el
//   último visitado (por defecto, el de startContext: Mi equipo); nunca 'partido';
// - backHref, el «‹» del router: parentOf con el modelo del ctx.
// portalSeason cambia la temporada del portal (2026/27 simulada) y legacyDate, el literal oculto
// «Última actualización» de index.html. recent son los vistos hace poco guardados con `myTeam`
// ([{ s, g, t }], que llegan a ctx.recent; decisión 5 de B3); con myTeam null, el almacén vacío.
export function ctxFor(screen, params, {
  today = '2026-09-24', datasets = datasetsFor(), myTeam = MY_TEAM, recent = [], portalSeason = PORTAL_SEASON,
  legacyDate = null, lastPrimary = null,
} = {}) {
  const storage = memoryStorage(new Map(myTeam ? [[STORE_KEY, JSON.stringify({ myTeam, recent })]] : []));
  const base = startContext({ storage, portal: { season: portalSeason, defaultTeam: DEFAULT_TEAM }, datasets, today });
  const route = { screen, params };
  const tab = activeTab(route, null, false);
  const parent = parentOf(route, base.model);
  return {
    ...base, legacyDate, route, params,
    lastPrimary: lastPrimary || (tab.current === 'page' ? tab.active : base.lastPrimary),
    backHref: parent ? routeHref(parent.screen, parent.params) : null,
  };
}

// Reglas de acta.css como { media, selector, body } (un nivel de @media, como en
// test_rediseno_css.mjs), y las clases que define.
export function cssRules() {
  const src = readFileSync(fileURLToPath(new URL('../../../../acta.css', import.meta.url)), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '');
  const rules = [];
  const walk = (text, media) => {
    let i = 0;
    while (i < text.length) {
      const open = text.indexOf('{', i);
      if (open < 0) break;
      const prelude = text.slice(i, open).trim();
      let depth = 1, j = open + 1;
      for (; j < text.length && depth; j++) depth += text[j] === '{' ? 1 : text[j] === '}' ? -1 : 0;
      const body = text.slice(open + 1, j - 1);
      if (prelude.startsWith('@media')) walk(body, prelude);
      else rules.push({ media, selector: prelude, body });
      i = j;
    }
  };
  walk(src, null);
  rules.classes = new Set([...src.matchAll(/\.([a-zA-Z][\w-]*)/g)].map(m => m[1]));
  return rules;
}
