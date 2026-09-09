import test from 'node:test';
import assert from 'node:assert/strict';
import { fixtureISO, kickoffUTC, buildCalendar, routeUrl, readRoute, matchId, venueUrl } from '../../src/links.js';
import { filterCompetitionGroups } from '../../src/filters.js';

test('calendar dates belong to the selected season, including archived dates', () => {
  assert.equal(fixtureISO('03/09', '2021-2022'), '2021-09-03');
  assert.equal(fixtureISO('03/02', '2021-2022'), '2022-02-03');
  assert.equal(fixtureISO('31/02', '2025-2026'), null);
  assert.equal(fixtureISO('por confirmar'), null);
  assert.equal(fixtureISO('29/02/2024'), '2024-02-29');
});

test('calendar conversion respects Canary winter time and summer time', () => {
  assert.equal(kickoffUTC('2026-01-15', '17:30'), '20260115T173000Z');
  assert.equal(kickoffUTC('2026-06-02', '17:30'), '20260602T163000Z');
});

test('ICS preserves Unicode, stable identities, line folding, and unknown kickoff', () => {
  const matches = [{ date: '2026-06-02', time: '17:30', home: 'Unión; A, B', away: 'Á'.repeat(80), jornada: 'Jornada 1', venue: 'Campo\nCentro' },
    { date: '2026-06-03', home: 'Local', away: 'Visitante', jornada: 'Jornada 2' },
    { date: 'por confirmar', home: 'X', away: 'Y' }];
  const calendar = buildCalendar(matches, { group: 'PG2', now: new Date('2026-09-09T12:00Z') });
  assert.equal((calendar.match(/BEGIN:VEVENT/g) || []).length, 2);
  assert.ok(calendar.endsWith('END:VCALENDAR\r\n'));
  assert.match(calendar, /DTSTART:20260602T163000Z/);
  assert.match(calendar, /DTSTART;VALUE=DATE:20260603/);
  assert.match(calendar, /LOCATION:Campo\\nCentro/);
  assert.match(calendar, /Unión\\; A\\, B/);
  for (const line of calendar.split('\r\n')) assert.ok(Buffer.byteLength(line, 'utf8') <= 75);
  assert.ok(calendar.replace(/\r\n /g, '').includes('Á'.repeat(80)));
  const updated = buildCalendar(matches.map(m => ({ ...m, time: '18:30' })), { group: 'PG2' });
  assert.deepEqual(calendar.match(/UID:.+/g), updated.match(/UID:.+/g));
});

test('shared URLs round-trip accents and punctuation without losing the archive', () => {
  const match = { home: 'Unión & Sur', away: 'Equipo #1', jornada: 'Jornada 12' };
  const url = routeUrl({ section: 'jornadas', cat: 'prebenjamin', season: '2021-2022', group: 'PG2', round: match.jornada,
    team: '', match: matchId(match), q: 'Unión & Sur', island: 'grancanaria', phase: 'Fase 2' });
  const parsed = readRoute(new URL(url).hash);
  assert.equal(parsed.season, '2021-2022');
  assert.equal(parsed.match, matchId(match));
  assert.equal(parsed.search, 'Unión & Sur');
  assert.equal(parsed.round, 'Jornada 12');
  assert.equal(readRoute('#section=unknown&season=../../bad').season, '');
});

test('filters combine club names, islands and phases, and handle empty groups', () => {
  const groups = [{ island: 'grancanaria', phase: 'Liga', standings: [[1, 'Unión Viera']] },
    { island: 'lanzarote', phase: 'Copa', standings: [[1, 'Unión Viera B']] }, { standings: [] }];
  assert.equal(filterCompetitionGroups(groups, { search: 'union viera' }).length, 2);
  assert.deepEqual(filterCompetitionGroups(groups, { search: 'union', filterIsland: 'grancanaria', filterPhase: 'Liga' }), [groups[0]]);
  assert.equal(filterCompetitionGroups(groups, { search: 'inexistente' }).length, 0);
});

test('maps links only exist for a known venue and encode the search correctly', () => {
  assert.equal(venueUrl(null), '');
  const url = new URL(venueUrl('Campo José & María', 'lanzarote'));
  assert.equal(url.searchParams.get('query'), 'Campo José & María, Lanzarote, España');
});
