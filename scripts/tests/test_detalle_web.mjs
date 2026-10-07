// El detalle nuevo en la web (2026-10): qué se juega cada puesto y las sanciones en la Tabla, casa y
// fuera de la federación, la equipación y el campo del equipo, todo el cuerpo técnico y el estado del
// partido, el mapa con las coordenadas del campo y la base de datos en Fuentes.
import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { createModel } from '../../src/model.js';
import { venueUrl } from '../../src/links.js';
import { officialHomeAway, sanctionsText, zonesText } from '../../src/screen-tabla.js';
import { teamInfoBlock } from '../../src/team-view.js';
import { roleLabel } from '../../src/screen-partido.js';
import { databaseBlock } from '../../src/screen-fuentes.js';

const text = (h) => String(h).replace(/<[^>]*>/g, ' ').replace(/&quot;/g, '"').replace(/&#39;/g, "'")
  .replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim();

const row = (team, pj, pts) => ({ pos: 0, team, pts, pj, g: 0, e: 0, p: 0, gf: 0, gc: 0, dg: 0, retired: false });

test('zonas: desde arriba ascenso, playoff, copa y promoción; el descenso desde abajo', () => {
  const group = { zones: [[1, 4, 'ascenso', 'Eliminatorias determinar FASE'], [5, 5, 'playoff', 'FASE “E”'],
    [6, 6, 'copa', null], [11, 12, 'descenso', null]] };
  assert.equal(zonesText(group), '1.º–4.º: Eliminatorias determinar FASE · 5.º: FASE “E” · 6.º: Copa · 11.º–12.º: Descenso');
  assert.equal(zonesText({ zones: null }), null);
  assert.equal(zonesText({}), null);
});

test('sanciones: solo los equipos con puntos de sanción', () => {
  const official = { A: [1, 1, 0, 0, 1, 0, 0, 1, 0], B: [1, 0, 0, 1, 1, 0, 1, 0, 3], C: [1, 1, 0, 0, 1, 1, 0, 0, 1] };
  assert.equal(sanctionsText({ official }), 'B (3 puntos) y C (1 punto)');
  assert.equal(sanctionsText({ official: { A: [1, 1, 0, 0, 1, 0, 0, 1, 0] } }), null);
  assert.equal(sanctionsText({}), null);
});

test('casa y fuera de la federación, si cuadran con la clasificación', () => {
  const standings = [row('A', 4, 9), row('B', 4, 3)];
  const official = { A: [2, 2, 0, 0, 2, 1, 0, 1], B: [2, 0, 1, 1, 2, 0, 1, 1] };
  const casa = officialHomeAway({ standings, official }, 'casa');
  assert.deepEqual(casa.map((r) => [r.pos, r.team, r.pj, r.g, r.e, r.p, r.pts]), [[1, 'A', 2, 2, 0, 0, 6], [2, 'B', 2, 0, 1, 1, 1]]);
  const fuera = officialHomeAway({ standings, official }, 'fuera');
  assert.deepEqual(fuera.map((r) => [r.team, r.pts]), [['A', 3], ['B', 1]]);
  // De otra jornada (no suma los J de la clasificación) o sin ella: nada, y se calcula del calendario.
  assert.equal(officialHomeAway({ standings: [row('A', 5, 9), row('B', 4, 3)], official }, 'casa'), null);
  assert.equal(officialHomeAway({ standings, official: null }, 'casa'), null);
  assert.equal(officialHomeAway({ standings, official: { A: official.A } }, 'casa'), null);
});

const datasets = {
  campos: { 'PEPE GONÇALVEZ': ['C. Pepe Gonçalvez, s/n', 'Las Palmas de Gran Canaria', 'Hierba Artificial', 'Fútbol 8', 28.07, -15.45] },
  equipos: { 'Las Mesas Hu.': ['BLANCA CON FRANJA ROJA', 'BLANCO', 'BLANCAS', 'PEPE GONÇALVEZ', 'Hierba Artificial (HA)', '2026-x.png'] },
  estados: { FF5: { 'Jornada 1': { 'Las Mesas Hu.|Acodetti B': ['aplazado', 'lluvia', null] } } },
  seasonRaw: { '2025-2026': { equipos: { Arucas: ['BLANCA', 'BLANCO', 'BLANCAS', null, null, null] }, campos: { X: ['a', 'b', 'c', 'd'] } } },
};
const model = createModel(datasets, { portalSeason: '2026-2027' });

test('modelo: ficha del equipo, campos y estado del partido por temporada', () => {
  assert.deepEqual(model.teamInfo('2026-2027', 'Las Mesas Hu.'), {
    shirt: 'BLANCA CON FRANJA ROJA', shorts: 'BLANCO', socks: 'BLANCAS', venue: 'PEPE GONÇALVEZ',
    surface: 'Hierba Artificial (HA)', kit: '2026-x.png' });
  assert.equal(model.teamInfo('2026-2027', 'Otro'), null);
  assert.equal(model.teamInfo('2025-2026', 'Arucas').shirt, 'BLANCA');
  assert.equal(model.teamInfo('2024-2025', 'Arucas'), null, 'temporada sin cargar');
  assert.equal(model.campos('2026-2027'), datasets.campos);
  assert.deepEqual(model.campos('2025-2026'), { X: ['a', 'b', 'c', 'd'] });
  assert.equal(model.campos('2024-2025'), null);
  const m = { season: '2026-2027', groupId: 'FF5', roundKey: 'Jornada 1', home: 'Las Mesas Hu.', away: 'Acodetti B' };
  assert.deepEqual(model.matchStatus(m), { state: 'aplazado', note: 'lluvia', start: null });
  assert.equal(model.matchStatus({ ...m, season: '2025-2026' }), null);
  assert.equal(model.matchStatus({ ...m, away: 'Otro' }), null);
});

test('mapa: con coordenadas, el punto exacto; sin ellas, la dirección', () => {
  assert.equal(venueUrl('PEPE GONÇALVEZ', 'grancanaria', datasets.campos),
    'https://www.google.com/maps/search/?api=1&query=28.07,-15.45');
  assert.match(venueUrl('X', 'grancanaria', { X: ['Calle 1', 'Telde', null, null] }), /query=X%2C%20Calle%201%2C%20Telde/);
});

test('equipación y campo del equipo, con el mapa; nada sin datos', () => {
  const ctx = { model };
  const out = teamInfoBlock(ctx, { season: '2026-2027', island: 'grancanaria' }, 'Las Mesas Hu.');
  const t = text(out);
  assert.match(t, /Equipación y campo/);
  assert.match(t, /Camiseta blanca con franja roja/);
  assert.match(t, /Pantalón blanco/);
  assert.match(t, /Medias blancas/);
  assert.match(t, /PEPE GONÇALVEZ Hierba Artificial Cómo llegar/);
  assert.match(String(out), /query=28\.07,-15\.45/);
  assert.equal(teamInfoBlock(ctx, { season: '2026-2027' }, 'Otro'), null);
  assert.equal(teamInfoBlock({}, { season: '2026-2027' }, 'Las Mesas Hu.'), null);
});

test('los cargos del acta, en palabras', () => {
  assert.equal(roleLabel('DEL. Campo'), 'Delegado/a de campo');
  assert.equal(roleLabel('DEL. Equipo'), 'Delegado/a');
  assert.equal(roleLabel('Entrenador'), 'Entrenador/a');
  assert.equal(roleLabel('2ºEntrenador'), '2.º entrenador/a');
  assert.equal(roleLabel('ENTRENADOR EN PRACTICAS'), 'Entrenador/a en prácticas');
  assert.equal(roleLabel('Árbitro/a Principal'), 'Árbitro/a');
  assert.equal(roleLabel('PREPARADOR FÍSICO'), 'Preparador físico');
});

test('Fuentes: la base de datos para descargar y lo que guarda de cada temporada', () => {
  const out = databaseBlock({ temporadas: [['2025-2026', 63, 3350, 3320, 3172, 3915, 27695], ['2017-2018', 22, 0, 0, 0, 0, 0]],
    equipos: 380, campos: 1, mb: 60 });
  const t = text(out);
  assert.match(String(out), /href="\.\/futbolbase\.db" download="futbolbase\.db"/);
  assert.match(t, /SQLite, unos 60 MB/);
  assert.match(t, /2025\/26 63 grupos · 3320 partidos con resultado · 3172 actas · 3915 jugadores · 27695 goles con autor/);
  assert.match(t, /2017\/18 22 grupos/);
  assert.match(t, /Y 380 equipos con su equipación y su campo y 1 campo con sus coordenadas\./);
  assert.equal(databaseBlock(null), '');
});
