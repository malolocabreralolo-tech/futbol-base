// Contexto de pantalla (ctx del esqueleto de B2) con las fixtures congeladas, para probar
// render(ctx) en Node. Nunca lee los data-*.js ni src/config.js vivos: la temporada del portal
// y el equipo por defecto van aquí, fijos.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { fixture } from './load.mjs';
import { datasetsFrom } from './simulate.mjs';
import { createModel } from '../../../../src/model.js';
import { buildClubIndex, resolveMyTeam } from '../../../../src/myteam.js';

export const PORTAL_SEASON = '2025-2026';
export const MY_TEAM = { name: 'Las Mesas Hu.', season: PORTAL_SEASON, cat: 'prebenjamin', groupId: 'PG2' };

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

// ctx de una pantalla: params ya resueltos (lo hace el router), hoy inyectado y mi equipo
// resuelto con resolveMyTeam sobre la temporada del portal.
export function ctxFor(screen, params, { today = '2026-09-24', datasets = datasetsFor(), myTeam = MY_TEAM } = {}) {
  const model = createModel(datasets, { portalSeason: PORTAL_SEASON, buildClubIndex });
  const resolution = resolveMyTeam(myTeam, model.season(PORTAL_SEASON), model.clubIndex(), today);
  return {
    route: { screen, params }, params, model, myTeam, resolution, today, health: datasets.health, datasets,
    portal: { season: PORTAL_SEASON, defaultTeam: MY_TEAM }, lastPrimary: screen,
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
