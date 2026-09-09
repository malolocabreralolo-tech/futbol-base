import { S, FEATURED, getCurrentSeason } from './state.js';
import { PORTAL } from './config.js';

export const SECTIONS = ['miequipo', 'clasif', 'jornadas', 'goleadores', 'isla', 'stats'];
let readingRoute = false;
export function setReadingRoute(value) { readingRoute = value; }

export function readRoute(hash = '') {
  const p = new URLSearchParams(hash.replace(/^#/, ''));
  const section = SECTIONS.includes(p.get('section')) ? p.get('section') : 'miequipo';
  return {
    section, cat: p.get('cat') === 'prebenjamin' ? 'prebenjamin' : 'benjamin',
    season: /^20\d{2}-20\d{2}$/.test(p.get('season') || '') ? p.get('season') : '',
    group: p.get('group') || '', round: p.get('round') || '',
    team: p.get('team') || '', match: p.get('match') || '',
    search: p.get('q') || '', island: p.get('island') || '', phase: p.get('phase') || '',
  };
}

export function routeUrl(overrides = {}, base = typeof location !== 'undefined' ? location.href : 'https://malolocabreralolo-tech.github.io/futbol-base/') {
  const route = {
    section: S.section, cat: S.cat, season: getCurrentSeason(),
    group: S.jorGroup, round: S.section === 'jornadas' ? S.jorNum : '',
    q: S.search, island: S.section === 'isla' ? S.island : S.filterIsland, phase: S.filterPhase,
    team: S.section === 'miequipo' ? FEATURED.name : '', ...overrides,
  };
  const url = new URL(base);
  url.hash = new URLSearchParams(Object.entries(route).filter(([, value]) => value !== '' && value != null)).toString();
  return url.href;
}

export function syncRoute(overrides = {}, replace = false) {
  if (readingRoute || typeof window === 'undefined') return;
  const url = routeUrl(overrides);
  if (url !== location.href) history[replace ? 'replaceState' : 'pushState'](null, '', url);
}

export function matchId(match) {
  return JSON.stringify([match.home, match.away, String(match.jornada || match.jor || '')]);
}

export function venueUrl(venue, island = '') {
  if (!venue || !String(venue).trim()) return '';
  const names = { grancanaria: 'Gran Canaria', lanzarote: 'Lanzarote', fuerteventura: 'Fuerteventura' };
  return 'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(`${venue}, ${names[island] || island || 'Canarias'}, España`);
}

export function notify(message) {
  const toast = document.getElementById('toast');
  if (!toast) return;
  toast.textContent = message;
  toast.classList.add('visible');
  clearTimeout(notify.timer);
  notify.timer = setTimeout(() => toast.classList.remove('visible'), 4000);
}

export async function copyLink(url) {
  try {
    await navigator.clipboard.writeText(url);
    notify('Enlace copiado');
  } catch {
    const input = document.createElement('textarea');
    input.value = url;
    input.setAttribute('aria-label', 'Enlace para copiar');
    document.body.appendChild(input);
    input.select();
    const copied = document.execCommand('copy');
    input.remove();
    notify(copied ? 'Enlace copiado' : 'No se pudo copiar. Usa el enlace de WhatsApp para compartir.');
  }
}

// Resolve a date against its SEASON, never against the day the archive is read.
export function fixtureISO(value, season = PORTAL.season) {
  const text = String(value || '').trim();
  let year, month, day;
  let m = text.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (m) [, year, month, day] = m;
  else {
    m = text.match(/^(\d{1,2})[/-](\d{1,2})(?:[/-](\d{4}))?$/);
    if (!m) return null;
    [, day, month, year] = m;
    if (!year) year = String(season).split('-')[Number(month) >= 7 ? 0 : 1];
  }
  const d = new Date(Date.UTC(+year, +month - 1, +day));
  if (d.getUTCFullYear() !== +year || d.getUTCMonth() !== +month - 1 || d.getUTCDate() !== +day) return null;
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

export function displayDate(value, season = PORTAL.season, options = {}) {
  const iso = fixtureISO(value, season);
  if (!iso) return 'Fecha por confirmar';
  return new Date(iso + 'T12:00:00Z').toLocaleDateString('es-ES', {
    timeZone: PORTAL.timeZone, weekday: 'short', day: 'numeric', month: 'short', ...options,
  });
}

function icsText(value) {
  return String(value ?? '').replace(/\\/g, '\\\\').replace(/\r?\n/g, '\\n').replace(/;/g, '\\;').replace(/,/g, '\\,');
}

export function kickoffUTC(iso, time) {
  const [y, mo, d] = iso.split('-').map(Number);
  const [h, mi] = time.split(':').map(Number);
  const wall = Date.UTC(y, mo - 1, d, h, mi);
  let utc = wall;
  for (let i = 0; i < 2; i++) {
    const parts = Object.fromEntries(new Intl.DateTimeFormat('en-GB', {
      timeZone: PORTAL.timeZone, year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
    }).formatToParts(new Date(utc)).map(p => [p.type, p.value]));
    const rendered = Date.UTC(+parts.year, +parts.month - 1, +parts.day, +parts.hour, +parts.minute);
    utc += wall - rendered;
  }
  return new Date(utc).toISOString().replace(/[-:]/g, '').replace('.000', '');
}

export function buildCalendar(matches, { season = PORTAL.season, group = '', name = 'Fútbol Base', url = '', now = new Date() } = {}) {
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Futbol Base Las Palmas//ES', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH', 'X-WR-CALNAME:' + icsText(name)];
  for (const match of matches) {
    const date = fixtureISO(match.date, season);
    if (!date) continue;
    const time = /^([01]\d|2[0-3]):[0-5]\d$/.test(match.time || '') ? match.time : '';
    let hash = 2166136261;
    for (const char of `${season}|${group}|${match.home}|${match.away}|${match.jor || match.jornada}`) hash = Math.imul(hash ^ char.codePointAt(0), 16777619) >>> 0;
    lines.push('BEGIN:VEVENT', `UID:${hash}@futbolbase-laspalmas`, 'DTSTAMP:' + now.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, ''));
    lines.push(time ? 'DTSTART:' + kickoffUTC(date, time) : 'DTSTART;VALUE=DATE:' + date.replace(/-/g, ''));
    lines.push('SUMMARY:' + icsText(`${match.home} – ${match.away}`));
    lines.push('DESCRIPTION:' + icsText(`${match.jor || match.jornada || ''} · ${season.replace('-', '/')}\n${time ? 'Horario de Canarias.' : 'Horario por confirmar.'}\nConsulta la web para posibles cambios.`));
    if (match.venue) lines.push('LOCATION:' + icsText(match.venue));
    if (url) lines.push('URL:' + url);
    lines.push('END:VEVENT');
  }
  lines.push('END:VCALENDAR');
  // RFC 5545: fold at 75 UTF-8 octets, without splitting Unicode characters.
  return lines.map(line => {
    let folded = '', length = 0;
    for (const char of line) {
      const bytes = new TextEncoder().encode(char).length;
      if (length + bytes > 75) { folded += '\r\n '; length = 1; }
      folded += char; length += bytes;
    }
    return folded;
  }).join('\r\n') + '\r\n';
}

export function downloadCalendar(matches, options) {
  const blob = new Blob([buildCalendar(matches, options)], { type: 'text/calendar;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = 'calendario-' + options.name.toLowerCase().replace(/[^a-z0-9]+/g, '-') + '.ics';
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
