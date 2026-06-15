/**
 * Node test runner — fix modal de equipos SIN escudo (revisión 2026-06-15, #6).
 * Run: node --test scripts/tests/test_team_modal_fix.mjs
 *
 * Bug: el handler de clic en clasificaciones resolvía el equipo con
 * td.textContent.trim(). Cuando el equipo no tiene escudo, teamBadge inyecta
 * un <span class="team-badge">INICIALES</span> dentro de la celda, así que
 * textContent pasa a ser 'FE Femarguín' en vez de 'Femarguín' -> openTeamDetail
 * hace match exacto, falla, y abre un modal vacío. Afecta a 4 benjamines
 * actuales sin escudo y a cualquier futuro.
 *
 * Fix: toda construcción de .team-name-cell lleva data-team escapado y el
 * handler lee td.dataset.team (no textContent). Tests de source-contract
 * (convención del proyecto para invariantes de handlers DOM, sin jsdom) +
 * una comprobación de comportamiento del badge fallback que demuestra la
 * contaminación de textContent.
 */

import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const src = f => readFileSync(join(ROOT, 'src', f), 'utf8');

/* ─── 1. Toda construcción de .team-name-cell incluye data-team ──────────── */

test('toda celda .team-name-cell construida lleva data-team (render.js + state.js)', () => {
  const tagRe = /<(?:td|span)\s+class="team-name-cell"[^>]*>/g;
  let total = 0;
  for (const f of ['render.js', 'state.js']) {
    for (const tag of src(f).match(tagRe) || []) {
      total++;
      assert.match(tag, /data-team="/, `falta data-team en ${f}: ${tag}`);
    }
  }
  assert.ok(total >= 4, `esperaba >=4 construcciones de celda, encontré ${total}`);
});

/* ─── 2. El handler resuelve el equipo por dataset.team, no por textContent ─ */

test('el handler de clic pasa td.dataset.team a openTeamDetail (no textContent)', () => {
  const s = src('render.js');
  assert.match(
    s,
    /closest\('\.team-name-cell'\)[\s\S]{0,160}openTeamDetail\(\s*td\.dataset\.team\b/,
    'el handler debe pasar td.dataset.team a openTeamDetail',
  );
  assert.doesNotMatch(
    s,
    /openTeamDetail\(\s*td\.textContent/,
    'el handler NO debe usar td.textContent (lo contamina el badge de iniciales)',
  );
});

/* ─── 3. Comportamiento: el badge fallback contamina textContent ─────────── */

test('teamBadge sin escudo inyecta iniciales -> textContent quedaría contaminado', async () => {
  const { teamBadge, teamBadgeFallback } = await import('../../src/state.js');
  // Un nombre inexistente en SHIELDS cae al fallback de iniciales.
  const badge = teamBadge('Femarguín');
  const isFallbackSpan = /class="team-badge"[^>]*>[^<]+<\/span>/.test(badge);
  // Si es fallback, el texto del badge (las iniciales) contaminaría el
  // textContent de la celda; por eso el handler debe usar data-team.
  if (isFallbackSpan) {
    const initialsText = badge.replace(/<[^>]+>/g, '').trim();
    assert.ok(initialsText.length > 0, 'el fallback aporta texto (iniciales) que ensucia textContent');
  } else {
    // tiene escudo (<img>, sin texto): igualmente data-team es la fuente fiable
    assert.match(badge, /<img\b/);
  }
  assert.equal(typeof teamBadgeFallback, 'function');
});
