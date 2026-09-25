// Plan B3, Tarea 8: pantalla Copa (spec §4.7 y §8; decisiones 22, 23 y 24 de B3). render(ctx) es
// pura: se prueba sobre el HTML que devuelve, con las fixtures congeladas y `today` inyectado.
// También el cuadro (bracket, model.js), mi equipo en los torneos (cupTeamOf, myteam.js) y el cara
// a cara de Partido con las copas de la federación.
import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { archive } from './fixtures/rediseno/simulate.mjs';
import { ctxFor, datasetsFor, cssRules, PORTAL_SEASON } from './fixtures/rediseno/screens.mjs';
import { screen } from '../../src/screen-copa.js';
import { screen as partido, previousMeetings } from '../../src/screen-partido.js';
import { SCREEN_MAP } from '../../src/screens.js';
import { bracket, findGroup, findMatch, groupSummary } from '../../src/model.js';
import { cupTeamOf } from '../../src/myteam.js';

const TODAY = '2026-09-23';
const LAS_MESAS_A2 = { name: 'Las Mesas Hu.', season: PORTAL_SEASON, cat: 'benjamin', groupId: 'A2' };
const UNION_VIERA_PG2 = { name: 'Unión Viera', season: PORTAL_SEASON, cat: 'prebenjamin', groupId: 'PG2' };
const AD_HURACAN_PG2 = { name: 'AD Huracán', season: PORTAL_SEASON, cat: 'prebenjamin', groupId: 'PG2' };
// Todo lo de B3 cargado: la Copa de Campeones de 2025-26, las dos copas más de la Maspalomas y el
// archivo de 2024-25 y 2023-24.
const all = () => datasetsFor({ champions: true, cupsExtra: true, seasonRaw: { '2024-2025': archive('2024-2025'), '2023-2024': archive('2023-2024') } });

const s = (h) => String(h);
const text = (h) => s(h).replace(/<[^>]*>/g, ' ').replace(/&quot;/g, '"').replace(/&#39;/g, "'")
  .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim();
const ctxOf = (params, { myTeam, datasets = all() } = {}) => ctxFor('copa', { s: PORTAL_SEASON, ...params }, { today: TODAY, datasets, ...(myTeam ? { myTeam } : {}) });
const render = (params, opts) => s(screen.render(ctxOf(params, opts)));
const groupOf = (season, id) => findGroup(ctxOf({ g: 'MCPK1' }).model, season, id);
// Los partidos del cuadro (a.bm), con su texto, y los de mi equipo.
const cells = (out) => [...out.matchAll(/<a class="(bm(?: is-mine)?)" href="([^"]+)">(.*?)<\/a>/g)].map((m) => ({ mine: m[1] === 'bm is-mine', href: m[2], html: m[3], text: text(m[3]) }));
const tabs = (out) => [...out.matchAll(/<button type="button" class="bracket-tab" id="([^"]+)" data-action="ronda" aria-controls="([^"]+)"( aria-current="true")?>([^<]*)<\/button>/g)]
  .map((m) => [m[1], m[2], Boolean(m[3]), m[4]]);
const columns = (out) => [...out.matchAll(/<section class="bracket-round" id="([^"]+)" aria-labelledby="[^"]+"><div class="bracket-head"><h3 class="bracket-title" id="[^"]+">([^<]*)<\/h3>(?:<p class="bracket-date">([^<]*)<\/p>)?/g)]
  .map((m) => [m[1], m[2], m[3] || null]);

// El bloque <section class="block"> con ese título, o null si no se pinta.
function blockOf(out, title) {
  const at = out.indexOf(`<h2 class="block-title">${title}</h2>`);
  if (at < 0) return null;
  const start = out.lastIndexOf('<section class="block"', at);
  const tags = /<section\b|<\/section>/g;
  tags.lastIndex = start;
  let depth = 0;
  for (let m; (m = tags.exec(out));) {
    depth += m[0] === '</section>' ? -1 : 1;
    if (depth === 0) return out.slice(start, m.index + m[0].length);
  }
  return out.slice(start);
}

test('bracket: quién pasó sale de la ronda siguiente; si no, del marcador o de los penaltis; el campeón, de la final', () => {
  const k1 = bracket(groupOf(PORTAL_SEASON, 'MCPK1'));
  assert.deepEqual(k1.rounds.map((r) => [r.label, r.dateFrom, r.matches.length]),
    [['Previa', '2026-06-26', 4], ['Cuartos', '2026-06-27', 4], ['Semifinales', '2026-06-27', 2], ['Final', '2026-06-27', 1]]);
  const line = ({ match: m, advancer, conflict }) => `${m.home} ${m.hs}-${m.as} ${m.away}: ${m[advancer]}${conflict ? ' (conflicto)' : ''}`;
  assert.deepEqual(k1.rounds[1].matches.map(line), [
    'UD Las Mesas Huracán 1-1 CF Unión Carrizal: UD Las Mesas Huracán',
    'CD Heidelberg A 1-4 CD Maspa Training A: CD Maspa Training A',
    'Arucas CF 1-0 CD Doramas: Arucas CF',
    'CD Maspa Training B 1-7 CF Unión Viera: CF Unión Viera',
  ]);
  assert.equal(k1.champion, 'CF Unión Viera');
  // La final de la Copa Oro de benjamín, por penaltis (2–2, tanda 3-4): la columna de penaltis.
  assert.equal(bracket(groupOf(PORTAL_SEASON, 'MCBK2')).champion, 'UD Vecindario A');
  // Copa de Campeones 2025-26: los cuatro campeones de la maqueta (Explorar, «4 campeones»).
  assert.deepEqual(['BCA1', 'BCB1', 'BCC1', 'PCC1'].map((id) => bracket(groupOf(PORTAL_SEASON, id)).champion),
    ['Las Palmas', 'Las Torres', 'La Garita B', 'LA UNION DE VECINDARIO']);
  // BCA1: Unión Viera 5–5 Tamaraceite, sin tanda: pasó Tamaraceite, que juega la semifinal.
  const cuartos = bracket(groupOf(PORTAL_SEASON, 'BCA1')).rounds[0].matches;
  assert.deepEqual(cuartos.map(line).slice(-1), ['Unión Viera 5-5 Tamaraceite: Tamaraceite']);
  // Una liguilla (MCP3) y una liga (PG2) no son un cuadro.
  assert.equal(bracket(groupOf(PORTAL_SEASON, 'MCP3')), null);
  assert.equal(bracket(groupOf(PORTAL_SEASON, 'PG2')), null);
  // Una sola regla para el campeón: el de Ligas y Explorar (groupSummary) es el del cuadro.
  for (const id of ['MCPK1', 'MCBK2', 'BCA1', 'BCB1', 'BCC1', 'PCC1']) {
    assert.equal(groupSummary(groupOf(PORTAL_SEASON, id)).champion, bracket(groupOf(PORTAL_SEASON, id)).champion, id);
  }
  assert.equal(groupSummary(groupOf('2024-2025', 'BCC1')).champion, 'LA UNION DE VECINDARIO "B"');
  assert.equal(groupSummary(groupOf(PORTAL_SEASON, 'MCP3')).champion, null, 'una liguilla no tiene campeón de cuadro');
});

test('bracket: 2024-25 BCC1 contradice dos veces al marcador; manda el cuadro y queda marcado (decisión 22)', () => {
  const bcc1 = bracket(groupOf('2024-2025', 'BCC1'));
  assert.deepEqual(bcc1.rounds.map((r) => r.label), ['Cuartos', 'Semifinales', 'Final']);
  const conflicts = bcc1.rounds.flatMap((r) => r.matches.filter((x) => x.conflict).map((x) => [r.label, x.match.home, x.match.hs, x.match.as, x.match.away, x.advancer]));
  assert.deepEqual(conflicts, [
    ['Cuartos', 'Arguineguín', 2, 1, 'Guayarmina', 'away'],
    ['Semifinales', 'LA UNION DE VECINDARIO "B"', 0, 1, 'VILLA DE SANTA BRIGIDA, U.D. "A"', 'home'],
  ]);
  // El modelo (Match.advancer) sigue al marcador; el cuadro, a quién jugó la ronda siguiente.
  assert.deepEqual(bcc1.rounds[0].matches[0].match.advancer, 'home');
  assert.equal(bcc1.champion, 'LA UNION DE VECINDARIO "B"');
  // Sin resultado en la final, no hay campeón.
  const ds = all();
  const k1 = ds.cupPrebenjamin.find((g) => g.id === 'MCPK1');
  const final = k1.jornadas['27-06-2026 ( Final )'][0];
  final[3] = null;
  final[4] = null;
  assert.equal(bracket(findGroup(ctxOf({ g: 'MCPK1' }, { datasets: ds }).model, PORTAL_SEASON, 'MCPK1')).champion, null);
});

test('cupTeamOf: mi equipo en un torneo, por club y letra de filial y en su categoría (decisión 23)', () => {
  const ctx = ctxOf({ g: 'MCPK1' });
  const index = ctx.model.clubIndex();
  const g = (id, season = PORTAL_SEASON) => findGroup(ctx.model, season, id);
  const LAS_MESAS_PG2 = { name: 'Las Mesas Hu.', cat: 'prebenjamin' };
  assert.equal(cupTeamOf(g('MCPK1'), LAS_MESAS_PG2, index), 'UD Las Mesas Huracán');
  assert.equal(cupTeamOf(g('MCP3'), LAS_MESAS_PG2, index), 'UD Las Mesas Huracán');
  assert.equal(cupTeamOf(g('MCBK2'), LAS_MESAS_PG2, index), null, 'otra categoría');
  assert.equal(cupTeamOf(g('MCBK2'), LAS_MESAS_A2, index), 'UD Las Mesas Huracán');
  assert.equal(cupTeamOf(g('MCBK2'), { name: 'Las Mesas Hu. B', cat: 'benjamin' }, index), null, 'la B no juega la Copa Oro');
  assert.equal(cupTeamOf(g('MCPK2'), AD_HURACAN_PG2, index), 'AD Huracán');
  assert.equal(cupTeamOf(g('PCC1'), UNION_VIERA_PG2, index), 'Unión Viera', 'la Copa de Campeones, con los nombres de la liga');
  assert.equal(cupTeamOf(g('PCC1'), null, index), null);
});

test('MCPK1, la Copa Plata: el campeón arriba, las cuatro rondas con sus pestañas y el camino de Las Mesas', () => {
  const out = render({ g: 'MCPK1' });
  assert.match(out, /^<section data-screen="copa"><header class="screen-head"><a class="back" href="#\/explorar" data-action="back" aria-label="Volver">‹<\/a>/);
  assert.equal((out.match(/<h1[ >]/g) || []).length, 1);
  assert.match(out, /<h1>Copa<\/h1><p class="screen-sub">Prebenjamín, Maspalomas Cup 2026, Copa Plata<\/p>/);
  // El campeón, lo primero tras la cabecera, con la final (un enlace a su partido) debajo.
  const champion = blockOf(out, 'Campeón');
  assert.ok(out.indexOf(champion) < out.indexOf('<h2 class="block-title">Cuadro</h2>'));
  assert.equal(text(champion), 'Campeón final, 27 jun CF Unión Viera 16:00 CD Maspa Training A MT 1–2 CF Unión Viera');
  assert.match(champion, /<p class="cup-champion"><img class="crest crest-32" src="\.\/escudos\/s\/unionviera\.png"[^>]*><span class="cup-champion-name">CF Unión Viera<\/span><\/p>/);
  assert.match(champion, /<a class="match-row" href="#\/partido\?s=2025-2026&amp;g=MCPK1&amp;r=27-06-2026%20\(%20Final%20\)&amp;h=CD%20Maspa%20Training%20A&amp;a=CF%20Uni%C3%B3n%20Viera">/);
  // Pestañas: botones con id estable, cada una con su columna; la primera, a la vista.
  assert.deepEqual(tabs(out), [
    ['ronda-1-tab', 'ronda-1', true, 'Previa'], ['ronda-2-tab', 'ronda-2', false, 'Cuartos'],
    ['ronda-3-tab', 'ronda-3', false, 'Semifinales'], ['ronda-4-tab', 'ronda-4', false, 'Final'],
  ]);
  assert.match(out, /<h2 class="block-title">Cuadro<\/h2><p class="block-context">4 rondas<\/p><\/div><div class="bracket-tabs" role="group" aria-label="Rondas del cuadro">/);
  assert.match(out, /<div class="bracket" role="region" aria-label="Cuadro, una columna por ronda" tabindex="0"><section class="bracket-round" id="ronda-1"/);
  assert.deepEqual(columns(out), [['ronda-1', 'Previa', '26 jun'], ['ronda-2', 'Cuartos', '27 jun'], ['ronda-3', 'Semifinales', '27 jun'], ['ronda-4', 'Final', '27 jun']]);
  // Once partidos, cada uno a su ficha; quién pasó, en negrita y con «(pasó)» para los lectores de pantalla.
  const all11 = cells(out);
  assert.equal(all11.length, 11);
  assert.ok(all11.every((c) => c.href.startsWith('#/partido?s=2025-2026&amp;g=MCPK1&amp;r=')));
  assert.equal((out.match(/<span class="bm-team is-through[^"]*">/g) || []).length, 11);
  // El camino de Las Mesas (mi equipo, «UD Las Mesas Huracán» en el torneo): previa, cuartos por penaltis y semifinal.
  assert.deepEqual(all11.filter((c) => c.mine).map((c) => c.text), [
    'Partido de mi equipo. 16:00 · CD 3.1 CD Tablero 1 LM UD Las Mesas Huracán (pasó) 4',
    'Partido de mi equipo. 10:00 · CD 4 LM UD Las Mesas Huracán (pasó) 1 CF Unión Carrizal 1 UD Las Mesas Huracán pasó por penaltis (3–2)',
    'Partido de mi equipo. 13:00 · CD 2.1 LM UD Las Mesas Huracán 2 MT CD Maspa Training A (pasó) 4',
  ]);
  assert.equal((out.match(/<span class="bm-team[^"]* is-me">/g) || []).length, 3);
  assert.match(out, /<span class="bm-note">UD Las Mesas Huracán pasó por penaltis \(3–2\)<\/span>/);
  assert.doesNotMatch(out, /is-conflict/);
});

test('MCBK2, la Copa Oro de benjamín: seis rondas, la final por penaltis y el camino de Las Mesas en benjamín', () => {
  const out = render({ g: 'MCBK2' }, { myTeam: LAS_MESAS_A2 });
  assert.deepEqual(tabs(out).map((t) => t[3]), ['Previa', 'Dieciseisavos', 'Octavos', 'Cuartos', 'Semifinales', 'Final']);
  assert.equal(text(blockOf(out, 'Campeón')),
    'Campeón final, 27 jun VA UD Vecindario A 17:00 AD Huracán A HA 2–2 VA UD Vecindario A UD Vecindario A pasó por penaltis (3–4)');
  assert.equal(cells(out).length, 33);
  assert.deepEqual(cells(out).filter((c) => c.mine).map((c) => c.text), [
    'Partido de mi equipo. 15:00 · CD 1.1 LM UD Las Mesas Huracán (pasó) 3 Arucas CF D 1',
    'Partido de mi equipo. 08:00 · CD 4 LM UD Las Mesas Huracán 3 MT CD Maspa Training A (pasó) 5',
  ]);
  // Con mi equipo en prebenjamín (el de siempre), nada del cuadro de benjamín es suyo.
  assert.doesNotMatch(render({ g: 'MCBK2' }), /is-mine|is-me/);
});

test('Copa de Campeones 2025-26: un cuadro por fase, un 5–5 que se decide en la ronda siguiente y el camino de Unión Viera', () => {
  const bca1 = render({ g: 'BCA1' });
  assert.match(bca1, /<p class="screen-sub">Benjamín, Copa de Campeones, Fase A<\/p>/);
  assert.equal(text(blockOf(bca1, 'Campeón')), 'Campeón final, 6 jun Las Palmas Acodetti 0–1 Las Palmas');
  assert.deepEqual(tabs(bca1).map((t) => t[3]), ['Cuartos', 'Semifinales', 'Final']);
  // Sin hora ni campo en la fuente: sin la línea de hora; y el empate sin columna de penaltis ni tanda,
  // quién pasó según el cuadro, nunca «por penaltis» (decisión 162).
  assert.doesNotMatch(bca1, /bm-when/);
  assert.equal(cells(bca1)[3].text, 'Unión Viera 5 Tamaraceite (pasó) 5 Pasó Tamaraceite, según el cuadro');
  const pcc1 = render({ g: 'PCC1' }, { myTeam: UNION_VIERA_PG2 });
  assert.match(pcc1, /<span class="cup-champion-name">LA UNION DE VECINDARIO<\/span>/);
  assert.deepEqual(cells(pcc1).filter((c) => c.mine).map((c) => c.text),
    ['Partido de mi equipo. Unión Viera 2 Acodetti (pasó) 2 Pasó Acodetti, según el cuadro']);
  // Mi equipo, campeón (AD Huracán, en la Copa Oro de prebenjamín): su nombre con el resalte propio.
  const k2 = render({ g: 'MCPK2' }, { myTeam: AD_HURACAN_PG2 });
  assert.match(k2, /<p class="cup-champion is-mine"><img class="crest crest-32"[^>]*><span class="cup-champion-name">AD Huracán<\/span><span class="vh"> \(mi equipo\)<\/span><\/p><a class="match-row is-mine"/);
  assert.equal(cells(k2).filter((c) => c.mine).length, 3);
});

test('2024-25 BCC1: la temporada en la cabecera y la nota de los dos partidos que contradicen al cuadro', () => {
  const out = render({ s: '2024-2025', g: 'BCC1' });
  assert.match(out, /<p class="screen-sub">Benjamín, Copa de Campeones, Fase C · 2024\/25<\/p>/);
  assert.match(text(blockOf(out, 'Campeón')), /^Campeón final, 7 jun LU LA UNION DE VECINDARIO "B" 12:00 /);
  const notes = [...out.matchAll(/<span class="bm-note is-conflict">([^<]*)<\/span>/g)].map((m) => text(m[1]));
  assert.deepEqual(notes, [
    'Según el cuadro pasó Guayarmina, aunque el marcador publicado dice lo contrario.',
    'Según el cuadro pasó LA UNION DE VECINDARIO "B", aunque el marcador publicado dice lo contrario.',
  ]);
  // Los dos marcadores se ven tal cual, y quién pasó es el del cuadro.
  assert.equal(cells(out)[0].text, '09:30 · ALCALDE ANDRES RGUEZ.MARTIN F8(2) Arguineguín 2 Guayarmina (pasó) 1 Según el cuadro pasó Guayarmina, aunque el marcador publicado dice lo contrario.');
});

// 2024-25 BCB1, tal como está en data-season-2024-2025.js (376e981; no está en las fixtures): en
// cuartos, un 4–4 sin columna de penaltis ni tanda; en semifinales, un 3–1 que el cuadro contradice.
const BCB1_2425 = {
  id: 'BCB1', name: 'Grupo 1', fullName: 'BENJAMIN COPA CAMPEONES BENJAMIN B - GRUPO 1', phase: 'Copa Campeones Benjamin B',
  island: 'grancanaria', current_jornada: '08-06-2025 ( Ronda 3 Ida )',
  standings: [[1, 'Tamaraceite', 6, 2, 2, 0, 0, 7, 3, 4], [2, 'SAN PEDRO MARTIR, C.D. "A"', 0, 2, 0, 0, 2, 1, 4, -3],
    [3, 'Estrella CF', 4, 2, 1, 1, 0, 7, 5, 2], [4, 'Tamaraceite B', 0, 1, 0, 0, 1, 3, 6, -3],
    [5, 'Atco. Huracán B', 1, 1, 0, 1, 0, 4, 4, 0], [6, 'UD Valleseco', 0, 0, 0, 0, 0, 0, 0, 0]],
  jornadas: {
    '08-06-2025 ( Ronda 1 Ida )': [['08/06', 'Atco. Huracán B', 'Estrella CF', 4, 4, null, '10:00', 'JUAN GUEDES F8 (2)'],
      ['08/06', 'SAN PEDRO MARTIR, C.D. "A"', 'UD Valleseco', null, null, null, '10:00', 'JUAN GUEDES F8 (1)']],
    '08-06-2025 ( Ronda 2 Ida )': [['08/06', 'Estrella CF', 'SAN PEDRO MARTIR, C.D. "A"', 3, 1, null, '11:30', 'JUAN GUEDES F8 (2)'],
      ['08/06', 'Tamaraceite', 'Tamaraceite B', 6, 3, null, '11:30', 'JUAN GUEDES F8 (1)']],
    '08-06-2025 ( Ronda 3 Ida )': [['08/06', 'Tamaraceite', 'SAN PEDRO MARTIR, C.D. "A"', 1, 0, null, '13:00', 'JUAN GUEDES F8 (1)']],
  },
};

test('un empate sin columna de penaltis ni tanda: «Pasó X, según el cuadro», nunca «por penaltis», tampoco en Partido (2024-25 BCB1; decisión 162)', () => {
  const archived = archive('2024-2025');
  const datasets = datasetsFor({ seasonRaw: { '2024-2025': { ...archived, benjamin: [...archived.benjamin, BCB1_2425] } } });
  const out = render({ s: '2024-2025', g: 'BCB1' }, { datasets });
  const notes = [...out.matchAll(/<span class="(bm-note(?: is-conflict)?)">([^<]*)<\/span>/g)].map((m) => [m[1], text(m[2])]);
  assert.deepEqual(notes, [
    ['bm-note', 'Pasó Estrella CF, según el cuadro'],
    ['bm-note', 'sin resultado'],
    ['bm-note is-conflict', 'Según el cuadro pasó SAN PEDRO MARTIR, C.D. "A", aunque el marcador publicado dice lo contrario.'],
  ]);
  assert.doesNotMatch(out, /penaltis/);
  assert.match(out, /<span class="cup-champion-name">Tamaraceite<\/span>/);
  // El modelo ya no deduce el empate: Match.advancer sigue al marcador o a la columna de penaltis, y
  // quién pasó lo dice el cuadro (la ronda siguiente).
  const group = findGroup(ctxOf({ s: '2024-2025', g: 'BCB1' }, { datasets }).model, '2024-2025', 'BCB1');
  assert.equal(group.rounds[0].matches[0].advancer, null);
  assert.equal(bracket(group).rounds[0].matches[0].advancer, 'away');
  // Partido de ese 4–4: el marcador, sin unos penaltis que la fuente no da.
  const match = s(partido.render(ctxFor('partido', { s: '2024-2025', g: 'BCB1', r: '08-06-2025 ( Ronda 1 Ida )', h: 'Atco. Huracán B', a: 'Estrella CF' }, { today: TODAY, datasets })));
  assert.ok(text(blockOf(match, 'Resultado')).includes('Resultado: 4–4'));
  assert.doesNotMatch(match, /penaltis/);
});

test('liguillas: la clasificación con la fila de mi equipo y los partidos con su día (MCP3, BC1 y CFV1 de 2023-24)', () => {
  const mcp3 = render({ g: 'MCP3' });
  assert.match(mcp3, /<p class="screen-sub">Prebenjamín, Maspalomas Cup 2026, Grupo C<\/p>/);
  assert.doesNotMatch(mcp3, /bracket|Campeón/);
  const table = blockOf(mcp3, 'Clasificación');
  assert.deepEqual([...table.matchAll(/<tr( class="is-mine")?><td class="st-pos">(\d+)<\/td><th scope="row" class="st-team">(.*?)<\/th>.*?<td class="st-pts">(\d+)<\/td><\/tr>/g)]
    .map((m) => [Boolean(m[1]), +m[2], text(m[3]), +m[4]]), [
    [false, 1, 'VI Real Club Victoria', 9], [false, 2, 'CE CDA El Médano CF', 4],
    [true, 3, 'LM UD Las Mesas Huracán (mi equipo)', 3], [false, 4, 'Arucas CF', 1],
  ]);
  assert.doesNotMatch(table, /st-link/, 'sin enlaces a fichas: la de un equipo de copa es la copa');
  const matches = blockOf(mcp3, 'Partidos');
  assert.match(matches, /<h2 class="block-title">Partidos<\/h2><p class="block-context">6 partidos<\/p><\/div><ol class="box cal">/);
  const whens = [...matches.matchAll(/<p class="cal-when">([^<]*)<\/p>/g)].map((m) => m[1]);
  assert.deepEqual(whens, ['mar 23 jun', 'mar 23 jun', 'mié 24 jun', 'mié 24 jun', 'jue 25 jun', 'jue 25 jun']);
  assert.equal((matches.match(/<a class="match-row is-mine"/g) || []).length, 3);
  // Copa de Campeones 2023-24: una liguilla de una ronda y siete partidos, sin mi equipo.
  const bc1 = render({ s: '2023-2024', g: 'BC1' });
  assert.match(bc1, /<p class="screen-sub">Benjamín, Copa de Campeones, Grupo 1 · 2023\/24<\/p>/);
  assert.match(bc1, /<p class="block-context">7 partidos<\/p>/);
  assert.match(text(blockOf(bc1, 'Clasificación')), / 1 Las Palmas 3 3 0 0 \+26 9 /);
  assert.doesNotMatch(bc1, /is-mine/);
  // Copa Fuerteventura 2023-24, una copa insular por jornadas: cada partido lleva la suya.
  const cfv1 = render({ s: '2023-2024', g: 'CFV1' });
  assert.match(cfv1, /<p class="block-context">36 partidos<\/p>/);
  assert.match(cfv1, /<p class="cal-when">Jornada 1 · vie 26 abr<\/p>/);
});

test('sin campeón, sin partidos, sin la temporada o sin copa: nunca una pantalla en blanco', () => {
  const ds = all();
  const final = ds.cupPrebenjamin.find((g) => g.id === 'MCPK1').jornadas['27-06-2026 ( Final )'][0];
  final[3] = null;
  final[4] = null;
  assert.match(render({ g: 'MCPK1' }, { datasets: ds }), /<h2 class="block-title">Campeón<\/h2><\/div><p class="empty">Todavía no hay campeón: la final no tiene resultado publicado\.<\/p>/);
  const empty = all();
  empty.cupPrebenjamin.find((g) => g.id === 'MCPK1').jornadas = {};
  const none = render({ g: 'MCPK1' }, { datasets: empty });
  assert.match(none, /<h2 class="block-title">Cuadro<\/h2><\/div><p class="empty">La fuente todavía no ha publicado los partidos de esta copa\.<\/p>/);
  assert.doesNotMatch(none, /Campeón/);
  const unloaded = render({ s: '2023-2024', g: 'BC1' }, { datasets: datasetsFor() });
  assert.match(unloaded, /<h1>Copa<\/h1>/);
  assert.match(text(unloaded), /No se pudieron cargar los datos de la temporada 2023\/24/);
  assert.match(unloaded, /data-action="retry"/);
  assert.match(render({ g: 'PG2' }), /<h1>Copa<\/h1>.*<p class="empty">No hay ninguna copa PG2 en la temporada 2025\/26\.<\/p>/);
});

// Elementos mínimos para mount, como en las pruebas de mount de B2: la sección, el contenedor del
// cuadro, sus cuatro pestañas y sus columnas (MCPK1 a 300 px por columna).
function bracketStub(heights = [420, 410, 210, 110]) {
  const node = (attrs = {}) => ({
    attrs, getAttribute: (n) => (n in attrs ? attrs[n] : null), setAttribute: (n, v) => { attrs[n] = String(v); },
    removeAttribute: (n) => { delete attrs[n]; },
  });
  const tabList = heights.map((h, i) => {
    const tab = node({ 'data-action': 'ronda', 'aria-controls': `ronda-${i + 1}` });
    tab.closest = () => tab;
    return tab;
  });
  const cols = Object.fromEntries(heights.map((h, i) => [`#ronda-${i + 1}`, { offsetLeft: 300 * i, offsetHeight: h }]));
  const strip = { scrollLeft: 0, clientWidth: 300, style: {}, calls: [], scrollTo(o) { this.calls.push(o); }, addEventListener(type, fn) { this[`on${type}`] = fn; } };
  const section = {
    matches: (sel) => sel === '[data-screen="copa"]',
    querySelector: (sel) => (sel === '.bracket' ? strip : cols[sel] || null),
    querySelectorAll: (sel) => (sel === '[data-action="ronda"]' ? tabList : []),
    addEventListener(type, fn) { this[`on${type}`] = fn; },
  };
  return { section, strip, tabList, cols, current: () => tabList.map((t) => t.getAttribute('aria-current')) };
}

test('mount: cada pestaña desplaza el cuadro hasta su columna y la marca; al deslizar, la ronda a la vista', () => {
  const { section, strip, tabList, current } = bracketStub();
  screen.mount(section, ctxOf({ g: 'MCPK1' }));
  assert.deepEqual(current(), ['true', null, null, null]);
  assert.equal(strip.style.height, '420px', 'el alto de la ronda a la vista, no el de la más larga');
  section.onclick({ target: tabList[2] });
  assert.deepEqual(strip.calls, [{ left: 600, behavior: 'auto' }], 'sin matchMedia (o con menos movimiento), sin animación');
  assert.deepEqual(current(), [null, null, 'true', null]);
  assert.equal(strip.style.height, '210px');
  strip.scrollLeft = 905;
  strip.onscroll();
  assert.deepEqual(current(), [null, null, null, 'true']);
  assert.equal(strip.style.height, '110px');
  // Un clic fuera de las pestañas no hace nada; una liguilla no tiene pestañas.
  section.onclick({ target: { closest: () => null } });
  assert.equal(strip.calls.length, 1);
  assert.equal(screen.mount({ matches: () => true, querySelector: () => null }, ctxOf({ g: 'MCP3' })), undefined);
});

test('mount: si la ronda a la vista cambia de alto (la fuente, un giro), el contenedor la sigue; la limpieza lo desconecta', () => {
  const saved = globalThis.ResizeObserver;
  const observed = [];
  let onResize = null;
  let disconnected = 0;
  globalThis.ResizeObserver = class { constructor(fn) { onResize = fn; } observe(el) { observed.push(el); } disconnect() { disconnected += 1; } };
  try {
    const { section, strip, cols } = bracketStub();
    const cleanup = screen.mount(section, ctxOf({ g: 'MCPK1' }));
    assert.equal(observed.length, 4);
    cols['#ronda-1'].offsetHeight = 432;
    onResize();
    assert.equal(strip.style.height, '432px');
    assert.equal(typeof cleanup, 'function');
    cleanup();
    assert.equal(disconnected, 1);
  } finally {
    if (saved === undefined) delete globalThis.ResizeObserver;
    else globalThis.ResizeObserver = saved;
  }
});

test('cara a cara de Partido (decisión 24): las copas de la federación de su categoría, esta temporada y las anteriores; la Maspalomas, solo su grupo', () => {
  const datasets = datasetsFor({ champions: true, seasonRaw: { '2023-2024': archive('2023-2024') } });
  const h2h = (params) => blockOf(s(partido.render(ctxFor('partido', params, { today: TODAY, datasets }))), 'Cara a cara');
  // PG2, Unión Viera – Acodetti: sus dos partidos de liga y la semifinal de la Copa de Campeones (PCC1).
  const pg2 = h2h({ s: PORTAL_SEASON, g: 'PG2', r: 'Jornada 13', h: 'Unión Viera', a: 'Acodetti' });
  assert.equal(text(pg2), 'Cara a cara esta temporada Este partido: J13, 1 feb Unión Viera – Acodetti Unión Viera – Acodetti 4–3'
    + ' J28, 23 may Acodetti – Unión Viera Acodetti – Unión Viera 6–3'
    + ' Copa de Campeones · Semifinales, 10 jun Unión Viera – Acodetti Unión Viera – Acodetti 2–2 Ver temporadas anteriores');
  assert.match(pg2, /<a class="pt-h2h-row" href="#\/partido\?s=2025-2026&amp;g=PCC1&amp;r=10-06-2026%20\(%20Semifinales%20\)&amp;h=Uni%C3%B3n%20Viera&amp;a=Acodetti">/);
  // Desde la copa, la misma regla: los de liga llevan su competición delante.
  const pcc1 = h2h({ s: PORTAL_SEASON, g: 'PCC1', r: '10-06-2026 ( Semifinales )', h: 'Unión Viera', a: 'Acodetti' });
  assert.equal(text(pcc1), 'Cara a cara esta temporada Gran Canaria · J13, 1 feb Unión Viera – Acodetti Unión Viera – Acodetti 4–3'
    + ' Gran Canaria · J28, 23 may Acodetti – Unión Viera Acodetti – Unión Viera 6–3'
    + ' Este partido: Semifinales, 10 jun Unión Viera – Acodetti Unión Viera – Acodetti 2–2 Ver temporadas anteriores');
  // Benjamín: B2, Arucas D – Las Torres, y la semifinal de la Fase B.
  assert.match(text(h2h({ s: PORTAL_SEASON, g: 'B2', r: 'Jornada 5', h: 'Arucas D', a: 'Las Torres' })),
    / Copa de Campeones · Semifinales, 5 jun Arucas D – Las Torres Arucas D – Las Torres 0–2 /);
  // Una temporada pasada, con su copa: GC3 de 2023-24 y la liguilla de la Copa de Campeones (BC1).
  assert.equal(text(h2h({ s: '2023-2024', g: 'GC3', r: '3', h: 'Las Palmas', a: 'Garepa Viera' })),
    'Cara a cara esta temporada Este partido: J3, 2 nov Las Palmas – Garepa Viera Las Palmas – Garepa Viera 10–1'
    + ' Copa de Campeones · Ronda 1, 14 jun Las Palmas – Garepa Viera Las Palmas – Garepa Viera 11–0');
  // «Ver temporadas anteriores»: A2 Las Palmas – AD Huracán y la Copa de Campeones de 2023-24.
  const ctx = ctxFor('partido', { s: PORTAL_SEASON, g: 'A2', r: 'Jornada 22', h: 'Las Palmas', a: 'AD Huracán' }, { today: TODAY, datasets });
  const a2 = ctx.model.group(PORTAL_SEASON, 'A2');
  const match = findMatch(a2, ctx.params);
  assert.deepEqual(previousMeetings(ctx.model, ['2023-2024'], match, 'benjamin')
    .map((f) => [f.season, f.group.id, f.matches.map((m) => `${m.home} ${m.hs}–${m.as} ${m.away}`)]),
  [['2023-2024', 'BC1', ['Las Palmas 9–0 AD Huracán']]]);
  // La Maspalomas usa otros nombres: su cara a cara es el de su grupo.
  const k1 = h2h({ s: PORTAL_SEASON, g: 'MCPK1', r: '27-06-2026 ( Cuartos )', h: 'UD Las Mesas Huracán', a: 'CF Unión Carrizal' });
  assert.match(k1, /<p class="block-context">en esta competición<\/p>/);
  assert.equal((k1.match(/class="pt-h2h-row/g) || []).length, 1);
});

test('registro: Copa en su ruta, sin cargas propias', () => {
  assert.equal(SCREEN_MAP.copa, screen);
  assert.equal(screen.id, 'copa');
  assert.deepEqual(screen.needs({ s: PORTAL_SEASON, g: 'MCPK1' }, datasetsFor(), { portalSeason: PORTAL_SEASON }), []);
  assert.equal(typeof screen.mount, 'function');
});

test('CSS: el único desplazamiento horizontal es el del cuadro, con ajuste; en escritorio, todas las columnas; 44 px y clases que existen', () => {
  const rules = cssRules();
  const wide = (m) => m !== null && /min-width:\s*1024px/.test(m);
  const bodyOf = (sel, media = (m) => m === null) => rules.filter((r) => media(r.media) && r.selector === sel).map((r) => r.body).join(';');
  assert.deepEqual(rules.filter((r) => /overflow(-x)?:\s*(auto|scroll)/.test(r.body)).map((r) => r.selector), ['.bracket'],
    'la página no se desplaza en horizontal: solo el cuadro (spec §8)');
  assert.match(bodyOf('.bracket'), /scroll-snap-type:\s*x mandatory/);
  assert.match(bodyOf('.bracket-round'), /flex:\s*0 0 100%/);
  assert.match(bodyOf('.bracket-round'), /scroll-snap-align:\s*start/);
  assert.match(bodyOf('.bracket', wide), /grid-auto-flow:\s*column/);
  assert.match(bodyOf('.bracket', wide), /overflow:\s*visible/);
  assert.match(bodyOf('.bracket', wide), /height:\s*auto !important/, 'el alto de mount solo vale en móvil');
  assert.match(bodyOf('.bracket-tabs', wide), /display:\s*none/);
  for (const sel of ['.bracket-tab', '.bm']) assert.match(bodyOf(sel), /min-height:\s*44px/, sel);
  assert.match(bodyOf('.bm.is-mine'), /box-shadow:\s*inset 3px 0 0 var\(--ink\)/);
  assert.doesNotMatch(bodyOf('.bm.is-mine'), /border-radius/, 'resalte sin óvalo');
  const out = [render({ g: 'MCPK1' }), render({ g: 'MCP3' }), render({ s: '2024-2025', g: 'BCC1' }), render({ g: 'MCPK2' }, { myTeam: AD_HURACAN_PG2 })].join('');
  const used = new Set(out.match(/class="[^"]+"/g).flatMap((m) => m.slice(7, -1).split(/\s+/)));
  assert.deepEqual([...used].filter((c) => !rules.classes.has(c)), []);
});
