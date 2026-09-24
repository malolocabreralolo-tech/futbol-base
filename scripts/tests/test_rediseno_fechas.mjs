// Plan B2, tarea 2: el «hoy» de la app es el de Canarias (decisión 4, M1 de B1) y matchDateISO
// pasa de miequipo.js a links.js con sus pruebas (spec §5.2, «se mueven»).
import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { canaryTodayISO, matchDateISO } from '../../src/links.js';

test('canaryTodayISO: la fecha de Canarias, verano (UTC+1) e invierno (UTC+0)', () => {
  assert.equal(canaryTodayISO(new Date('2026-09-23T22:30:00Z')), '2026-09-23', '23:30 en Canarias');
  assert.equal(canaryTodayISO(new Date('2026-09-23T23:00:00Z')), '2026-09-24', 'medianoche en Canarias');
  assert.equal(canaryTodayISO(new Date('2026-01-10T23:59:00Z')), '2026-01-10');
  assert.equal(canaryTodayISO(new Date('2026-01-11T00:00:00Z')), '2026-01-11');
  assert.match(canaryTodayISO(), /^\d{4}-\d{2}-\d{2}$/, 'sin argumentos, el reloj de ahora');
});

test('canaryTodayISO: un móvil con hora peninsular no adelanta el día (M1)', () => {
  const tz = process.env.TZ;
  process.env.TZ = 'Europe/Madrid';
  try {
    const now = new Date('2026-09-23T22:30:00Z');       // 00:30 del 24 en Madrid
    assert.equal(now.getDate(), 24, 'el reloj del dispositivo ya está en mañana');
    assert.equal(canaryTodayISO(now), '2026-09-23');
    assert.equal(canaryTodayISO(now, 'Europe/Madrid'), '2026-09-24', 'la zona es la del parámetro');
  } finally {
    if (tz === undefined) delete process.env.TZ;
    else process.env.TZ = tz;
  }
});

test('matchDateISO: ISO dates pass through', () => {
  assert.equal(matchDateISO('2026-05-28', '2026-06-11'), '2026-05-28');
});

test('matchDateISO: DD/MM resolves to current year when recent past (NO next-year rollover)', () => {
  // The real bug: J30 on 06/06 with today=2026-06-11 must be 2026-06-06, never 2027-06-06.
  assert.equal(matchDateISO('06/06', '2026-06-11'), '2026-06-06');
});

test('matchDateISO: DD/MM crossing new year resolves forward', () => {
  // Mid-season: today Dec 2025, fixture 10/01 → January 2026 (future).
  assert.equal(matchDateISO('10/01', '2025-12-20'), '2026-01-10');
});

test('matchDateISO: unparseable → null', () => {
  assert.equal(matchDateISO('', '2026-06-11'), null);
  assert.equal(matchDateISO(null, '2026-06-11'), null);
  assert.equal(matchDateISO('próximamente', '2026-06-11'), null);
});

test('matchDateISO: DD/MM far in the FUTURE rolls back a year (postponed Dec fixture seen in Jan)', () => {
  // Symmetric rule to the Dec→Jan crossing: a 20/12 fixture viewed on 2027-01-05 belongs to
  // December 2026, not December 2027.
  assert.equal(matchDateISO('20/12', '2027-01-05'), '2026-12-20');
  // And the forward crossing still works: a 10/01 fixture seen in December.
  assert.equal(matchDateISO('10/01', '2026-12-20'), '2027-01-10');
});

test('matchDateISO es pura: no construye fechas, todayISO se inyecta', () => {
  assert.ok(!/new Date/.test(matchDateISO.toString()));
});
