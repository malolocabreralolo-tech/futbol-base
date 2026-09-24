// Rutas, enlaces antiguos, fechas, calendario (.ics), mapas y compartir (spec §5.2). Desde el
// corte de B2 no lee estado de interfaz: las rutas nuevas son routeHref y parseRoute, y los
// enlaces antiguos (#section=…) solo se leen, para traducirlos (translateLegacy).
import { PORTAL } from './config.js';

export const SECTIONS = ['miequipo', 'clasif', 'jornadas', 'goleadores', 'isla', 'stats'];

// Lee un enlace antiguo ('#section=…&group=…'), compartido por WhatsApp antes del rediseño.
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

export function venueUrl(venue, island = '') {
  if (!venue || !String(venue).trim()) return '';
  const names = { grancanaria: 'Gran Canaria', lanzarote: 'Lanzarote', fuerteventura: 'Fuerteventura' };
  return 'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(`${venue}, ${names[island] || island || 'Canarias'}, España`);
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

/* ====== Fechas en castellano (spec §8), sin Intl ====== */

// Los días y los meses van escritos aquí (B9 de la revisión de B2), como en Jornada: nada de lo que
// se ve depende de los datos de idioma del navegador ni del Node que ejecuta las pruebas (el bot no
// fija su versión). Las fechas de partido son días de calendario ('AAAA-MM-DD'), sin zona horaria.
export const WEEKDAYS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
export const MONTHS = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto',
  'septiembre', 'octubre', 'noviembre', 'diciembre'];
const WEEKDAYS_SHORT = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb'];
const MONTHS_SHORT = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sept', 'oct', 'nov', 'dic'];

// 'AAAA-MM-DD' → { weekday, day, month } (weekday 0 es domingo; month 0, enero), o null.
function calendarDay(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso ?? ''));
  if (!m) return null;
  const date = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
  if (date.getUTCDate() !== +m[3] || date.getUTCMonth() !== +m[2] - 1) return null;
  return { weekday: date.getUTCDay(), day: +m[3], month: +m[2] - 1 };
}

// '2026-03-07' → 'sáb 7 mar'
export function weekdayDate(iso) {
  const d = calendarDay(iso);
  return d ? `${WEEKDAYS_SHORT[d.weekday]} ${d.day} ${MONTHS_SHORT[d.month]}` : null;
}

// '2026-09-23' → '23 sept'
export function dayMonth(iso) {
  const d = calendarDay(iso);
  return d ? `${d.day} ${MONTHS_SHORT[d.month]}` : null;
}

// '2026-09-23' → '23 de septiembre'
export function dayMonthLong(iso) {
  const d = calendarDay(iso);
  return d ? `${d.day} de ${MONTHS[d.month]}` : null;
}

// '2026-06-27' → 'junio'
export function monthName(iso) {
  const d = calendarDay(iso);
  return d ? MONTHS[d.month] : null;
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

/* ====== Rutas del rediseño (spec §4.1): '#/<pantalla>?<parámetros>' ====== */

export const SCREENS = ['', 'jornada', 'tabla', 'explorar', 'partido', 'equipo', 'ligas', 'copa', 'goleadores', 'temporadas', 'records', 'fuentes', 'ajustes'];
// Orden estable de los parámetros en los enlaces; los que no están aquí van detrás, por orden alfabético.
const PARAM_ORDER = ['s', 'c', 'i', 'f', 'g', 'r', 'h', 'a', 't', 'v', 'q', 'to'];

export function parseRoute(hash) {
  const m = String(hash ?? '').match(/^#?\/([a-z]*)(?:\?([^#]*))?(?:#.*)?$/);
  if (!m || !SCREENS.includes(m[1])) return { screen: '', params: {} };
  const params = {};
  for (const [key, value] of new URLSearchParams(m[2] || '')) {
    if (/^[a-z]+$/.test(key) && value !== '' && !Object.hasOwn(params, key)) params[key] = value;
  }
  return { screen: m[1], params };
}

export function routeHref(screen, params = {}) {
  if (!SCREENS.includes(screen)) return '#/';
  const rank = key => (PARAM_ORDER.includes(key) ? PARAM_ORDER.indexOf(key) : PARAM_ORDER.length);
  const query = Object.keys(params || {})
    .filter(key => params[key] !== '' && params[key] !== null && params[key] !== undefined)
    .sort((a, b) => rank(a) - rank(b) || (a < b ? -1 : a > b ? 1 : 0))
    .map(key => `${encodeURIComponent(key)}=${encodeURIComponent(String(params[key]))}`)
    .join('&');
  return `#/${screen}${query ? '?' + query : ''}`;
}

// Enlaces antiguos ('#section=…', compartidos por WhatsApp) → ruta nueva (tabla de §4.1).
// La temporada del enlace se conserva siempre como `s`, aunque sea la del portal: tras activar
// 2026/27, un enlace de 2025/26 sigue en 2025/26. Un enlace nunca cambia mi equipo: 'miequipo'
// con un equipo abre su ficha, salvo si `isMine(team, group)` dice que es el mío: esa es la URL que
// la app anterior escribía en cada carga, y abre Mi equipo (M3 de la revisión de B2).
function legacyMatch(value) {
  try {
    const match = JSON.parse(value);
    return Array.isArray(match) && match.length === 3 && match.every(v => typeof v === 'string') && match[0] && match[1] ? match : null;
  } catch { return null; }
}

export function translateLegacy(hash, { isMine = () => false } = {}) {
  const text = String(hash ?? '');
  const raw = new URLSearchParams(text.replace(/^#/, ''));
  if (text.startsWith('#/') || !raw.has('section')) return null;
  const route = readRoute(text);
  const c = ['benjamin', 'prebenjamin'].includes(raw.get('cat')) ? raw.get('cat') : '';
  const s = route.season;
  const g = route.group;
  const match = legacyMatch(route.match);
  if (g && match) return routeHref('partido', { s, g, r: match[2], h: match[0], a: match[1] });
  if (route.team && route.section === 'miequipo' && isMine(route.team, g)) return '#/';
  if (route.team) return g ? routeHref('equipo', { s, g, t: route.team }) : routeHref('explorar', { s, q: route.team });
  switch (route.section) {
    case 'clasif': return routeHref('tabla', { s, g });
    case 'jornadas': return routeHref('jornada', { s, g, r: route.round });
    case 'goleadores': return routeHref('goleadores', { s, c: g ? '' : c, g });
    case 'isla': return routeHref('ligas', { s, c, i: route.island });
    case 'stats': return routeHref('records', { s, c });
    default: return '#/';
  }
}

// «Hoy» de la app (decisión 4 de B2): el día de Canarias, nunca el del dispositivo. En un móvil
// con hora peninsular, entre las 23:00 y las 24:00 de Canarias, el reloj local ya está en
// mañana (M1 de B1). El router lo calcula una vez y lo inyecta en ctx.today.
export function canaryTodayISO(now = new Date(), timeZone = 'Atlantic/Canary') {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-CA', {
    timeZone, year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(now).map(part => [part.type, part.value]));
  return `${parts.year}-${parts.month}-${parts.day}`;
}

/* Fecha de un partido ('AAAA-MM-DD' o 'DD/MM') en ISO respecto a `todayISO`, que se inyecta.
 * Un DD/MM nunca pasa al año siguiente por haber pasado hace poco (el 06/06 no es el del año
 * que viene): solo cruza de año si queda a más de 180 días, hacia delante (diciembre visto desde
 * enero) o hacia atrás (enero visto desde diciembre). Viene de miequipo.js (spec §5.2). */
export function matchDateISO(d, todayISO) {
  if (!d) return null;
  const s = String(d);
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const m = s.match(/^(\d{2})\/(\d{2})$/);
  if (!m || !todayISO) return null;
  const t = String(todayISO);
  const ty = +t.slice(0, 4);
  const diffDays = (Date.UTC(ty, +t.slice(5, 7) - 1, +t.slice(8, 10))
    - Date.UTC(ty, +m[2] - 1, +m[1])) / 86400000;
  const y = diffDays > 180 ? ty + 1 : diffDays < -180 ? ty - 1 : ty;
  return y + '-' + m[2] + '-' + m[1];
}

// Cuenta atrás del próximo partido; `todayISO` es el día de hoy en Atlantic/Canary.
export function countdownLabel(dateISO, todayISO) {
  const day = value => {
    const m = String(value ?? '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!m) return null;
    const date = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
    return date.getUTCMonth() === +m[2] - 1 && date.getUTCDate() === +m[3] ? date.getTime() / 86400000 : null;
  };
  const from = day(todayISO), to = day(dateISO);
  if (from === null || to === null || to < from) return null;
  const days = to - from;
  return days === 0 ? 'hoy' : days === 1 ? 'mañana' : `faltan ${days} días`;
}

/* ====== Compartir (spec §4.2 A), común a las pantallas que comparten ====== */

// Copia un texto: la API del portapapeles y, si no está o falla, un textarea con
// execCommand. → true si se copió.
export async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    try {
      const area = document.createElement('textarea');
      area.value = text;
      area.setAttribute('readonly', '');
      area.style.position = 'fixed';
      area.style.opacity = '0';
      document.body.appendChild(area);
      area.select();
      const copied = document.execCommand('copy');
      area.remove();
      return copied;
    } catch {
      return false;
    }
  }
}

// navigator.share con { title, text, url } si existe; si no, o si falla, copia el
// enlace. → 'compartido' | 'cancelado' | 'copiado' | 'no copiado': cada pantalla
// lo dice a su manera.
export async function shareLink(data) {
  if (typeof navigator !== 'undefined' && typeof navigator.share === 'function') {
    try {
      await navigator.share(data);
      return 'compartido';
    } catch (error) {
      if (error && error.name === 'AbortError') return 'cancelado';
    }
  }
  return (await copyText(data.url)) ? 'copiado' : 'no copiado';
}
