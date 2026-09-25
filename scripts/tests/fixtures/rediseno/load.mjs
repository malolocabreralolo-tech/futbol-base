// Fixtures congeladas del rediseño «Acta» (spec §11). Las generan una sola vez
// build_fixtures.mjs (las 9 de B1) y build_fixtures_b3.mjs (las 6 de B3) y se
// commitean. Las pruebas test_rediseno_*.mjs leen solo estos JSON: nunca los
// data-*.js ni src/config.js vivos.
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const FIXTURE_DIR = dirname(fileURLToPath(import.meta.url));

export const FIXTURE_NAMES = [
  'current-2025-2026', 'historical-2024-2025', 'cups-2025-2026', 'matchdetail',
  'lineups-2025-2026', 'shields', 'health', 'phases', 'favorites-v1',
  'gol-2025-2026', 'campeones-2025-2026', 'historical-2023-2024', 'historical-2024-2025-b3',
  'lineups-2025-2026-ff1', 'cups-extra-2025-2026',
];

// Lee y parsea <name>.json en cada llamada: cada prueba recibe su propia copia
// y puede modificarla sin afectar a las demás.
export function fixture(name) {
  if (!FIXTURE_NAMES.includes(name)) throw new Error(`fixture desconocida: ${name}`);
  return JSON.parse(readFileSync(join(FIXTURE_DIR, `${name}.json`), 'utf8'));
}
