// Hook de carga de Node para test_rediseno_config.mjs: sirve un src/config.js de 2026/27, el de la
// activación, con Las Mesas en otro grupo, en lugar del del repositorio. No toca ningún otro módulo.
const PORTAL = {
  season: '2026-2027',
  nextSeason: '2027-2028',
  defaultTeam: { cat: 'prebenjamin', groupId: 'PG5', name: 'Las Mesas Hu.' },
  timeZone: 'Atlantic/Canary',
};

export async function load(url, context, nextLoad) {
  if (url.startsWith('file:') && new URL(url).pathname.endsWith('/src/config.js')) {
    return { format: 'module', shortCircuit: true, source: `export const PORTAL = ${JSON.stringify(PORTAL)};\n` };
  }
  return nextLoad(url, context);
}
