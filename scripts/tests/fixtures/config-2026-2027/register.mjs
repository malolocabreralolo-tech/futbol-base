// node --import ./scripts/tests/fixtures/config-2026-2027/register.mjs …: todo lo que se cargue después
// recibe el src/config.js de 2026/27 de hooks.mjs (test_rediseno_config.mjs).
import { register } from 'node:module';

register('./hooks.mjs', import.meta.url);
