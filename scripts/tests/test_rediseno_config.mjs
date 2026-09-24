/**
 * Ninguna prueba depende de src/config.js (R2-1 de la revisión adversarial). El día que se active
 * 2026/27, activate_season.py cambia la temporada de config.js, y el bot ejecuta estas pruebas antes de
 * comitear: si una leyera config.js, se pararía en rojo en silencio. Aquí se ejecutan todas las demás
 * pruebas de Node con un config.js de 2026/27, con el equipo por defecto en otro grupo, que sirve un
 * hook de carga de Node (fixtures/config-2026-2027/), y tienen que salir en verde igual.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readdirSync } from 'node:fs';
import { basename, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const HOOK = fileURLToPath(new URL('./fixtures/config-2026-2027/register.mjs', import.meta.url));
const SELF = basename(fileURLToPath(import.meta.url));
// Sin NODE_TEST_CONTEXT, el node --test de dentro informa por su cuenta, en TAP.
const env = { ...process.env };
delete env.NODE_TEST_CONTEXT;
const node = (args) => spawnSync(process.execPath, ['--import', HOOK, ...args], { cwd: ROOT, env, encoding: 'utf8', timeout: 180000 });

test('el hook sirve un src/config.js de 2026/27, con el equipo por defecto en PG5', () => {
  const run = node(['--input-type=module', '-e', "const { PORTAL } = await import('./src/config.js'); console.log(PORTAL.season, PORTAL.defaultTeam.groupId);"]);
  assert.equal(run.stdout.trim(), '2026-2027 PG5', run.stderr);
});

test('todas las demás pruebas de Node salen en verde con ese config.js', () => {
  const files = readdirSync(join(ROOT, 'scripts', 'tests')).filter((f) => /^test_.*\.mjs$/.test(f) && f !== SELF).sort();
  const run = node(['--test', '--test-reporter=tap', ...files.map((f) => join('scripts', 'tests', f))]);
  const failed = run.stdout.split('\n').filter((line) => /^not ok /.test(line));
  assert.deepEqual(failed, [], `con la temporada 2026/27 en config.js:\n${run.stderr.slice(-1500)}`);
  assert.equal(run.status, 0, run.stderr.slice(-1500));
  assert.match(run.stdout, /^# fail 0$/m);
});
