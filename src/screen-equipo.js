// Ficha de un equipo, `#/equipo?s&g&t` (spec §4.6 y §4.8). El mismo esqueleto que Mi equipo: la vista
// de equipo (team-view.js) con los estados A, B, C o D, el D sin la caja de la temporada siguiente y
// el calendario completo siempre, con su ancla #calendario y su .ics (decisión 15 de B3). Además,
// «Hacer mi equipo» (decisión 11), «Vistos hace poco» (decisión 5) y, en la columna de consulta, la
// evolución de puntos (decisión 12), la plantilla con el detalle de cada jugador (decisión 13) y la
// trayectoria del club bajo demanda (decisión 14). render(ctx) es pura; mount pone el comportamiento.
// El router ya garantiza que el grupo existe en la temporada (cargada), que es de liga y que el
// equipo juega en él (decisión 3 de B3); las dos ramas defensivas de render son para lo que no pasa
// por el router.
import { html, join } from './html.js';
import { block, box, cells, empty, listEs, notice, pointsChart, screenHead } from './ui.js';
import {
  anyCards, coverageNote, findGroup, playerMatches, playerName, pointsProgression, seasonLabel, teamFixtures,
  teamShort, teamSquad,
} from './model.js';
import { teamTrajectory } from './myteam.js';
import { matchHref, routeHref, teamHref, weekdayDate } from './links.js';
import { routeIsMine } from './router.js';
import { errorBox } from './shell.js';
import { ensureHealth, ensureLineups, ensureSeasonData, loadSeasons } from './state.js';
import { coverageText, missingResults, mountTeamView, teamColumns, teamView } from './team-view.js';

const TRAJECTORY_ID = 'trayectoria';
const score = (a, b) => `${a}–${b}`;
const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;

// El grupo y el equipo de la ruta, o null: el equipo tiene que estar en la clasificación o en el
// calendario de un grupo de liga (la misma regla que el router, hasTeam).
function locate(ctx) {
  const { s, g, t } = ctx.params || {};
  const group = s && g ? findGroup(ctx.model, s, g) : null;
  if (!group || group.kind !== 'league' || !t) return { group, name: null };
  const plays = group.standings.some(row => row.team === t)
    || group.rounds.some(round => round.matches.some(m => m.home === t || m.away === t));
  return { group, name: plays ? t : null };
}

// ── Evolución de puntos (decisión 12) ───────────────────────────────────

// Cuando la gráfica, que sale del calendario, no llega a los puntos oficiales (spec §7), la nota que lo
// dice, { label, text }, o null (decisión 163 de B3):
// - «Cobertura:» si al calendario le falta algo: los partidos contra retirados (cuáles) o resultados
//   sin publicar (la nota de «La temporada en cifras»);
// - «Nota:» si cuentan los mismos partidos y aun así no coinciden: solo lo dice, sin inventar la causa.
export function pointsNote(name, group, today) {
  const series = pointsProgression(name, group).filter(p => p.pts != null);
  const row = group.standings.find(r => r.team === name);
  const last = series.length ? series[series.length - 1].pts : null;
  if (!row || row.pts == null || last == null || last === row.pts) return null;
  const coverage = coverageNote(name, group);
  const missing = missingResults(name, group, today);
  const points = plural(last, 'punto', 'puntos');
  if (coverage && coverage.vsRetired > 0 && !missing && coverage.withResult + coverage.vsRetired === coverage.played) {
    const whom = `${listEs(coverage.retired)} (${coverage.retired.length > 1 ? 'retirados' : 'retirado'})`;
    return { label: 'Cobertura:', text: `la gráfica suma ${points} con los ${coverage.withResult} partidos del calendario; la clasificación oficial da ${row.pts}, con ${plural(coverage.vsRetired, 'partido', 'partidos')} más contra ${whom}.` };
  }
  const why = coverageText(coverage, missing);
  if (why) return { label: 'Cobertura:', text: `la gráfica suma ${points} con el calendario y la clasificación oficial da ${row.pts}: ${why.charAt(0).toLowerCase()}${why.slice(1)}.` };
  const same = row.pj === 1 ? 'Con el mismo partido' : `Con los mismos ${row.pj} partidos`;
  return { label: 'Nota:', text: `el calendario y la clasificación oficial no coinciden. ${same}, la gráfica suma ${points} y la clasificación oficial, ${row.pts}.` };
}

// La línea de sus puntos jornada a jornada, sobre el máximo posible (3 por partido del calendario, sin
// los de retirados), y el dato en texto (la gráfica es aria-hidden): los puntos tras la primera
// jornada y tras la última jugada, y ese máximo.
function evolutionBlock(ctx, group, name) {
  const series = pointsProgression(name, group);
  const played = series.filter(p => p.pts != null);
  const fx = teamFixtures(name, group, ctx.today);
  const max = 3 * (fx.played + fx.remaining);
  if (played.length < 2 || max <= 0) return '';
  const [first, last] = [played[0], played[played.length - 1]];
  const facts = cells([
    { label: first.label, value: first.pts },
    { label: last.label, value: last.pts },
    { label: 'Máximo posible', value: max },
  ]);
  const note = pointsNote(name, group, ctx.today);
  return html`${box(html`<div class="points-plot">${pointsChart(series, { max })}</div>${facts}`,
    { title: 'Evolución de puntos', context: 'desde el calendario' })}${note ? notice(note.label, note.text) : ''}`;
}

// ── Plantilla (decisión 13) ─────────────────────────────────────────────

// Los partidos de un jugador, con el marcador desde su equipo, cada uno a su ficha. Lo pinta mount
// al desplegarlo (spec §5.1: nada oculto generado).
export function playerDetail(lineups, group, team, player) {
  const items = playerMatches(lineups, { group, team, player }).map(({ match, side, goals }) => {
    const home = side === 'home';
    const rival = home ? match.away : match.home;
    const round = group.rounds.find(r => r.key === match.roundKey);
    const when = [round ? round.label : match.roundKey, weekdayDate(match.dateISO)].filter(Boolean).join(' · ');
    return html`<li><a class="squad-match" href="${matchHref(match)}"><span class="squad-when">${when}</span><span class="squad-rival">${home ? 'en casa contra' : 'fuera contra'} ${teamShort(rival)}</span><span class="squad-score">${home ? score(match.hs, match.as) : score(match.as, match.hs)}</span><span class="squad-goals">${goals ? plural(goals, 'gol', 'goles') : 'sin goles'}</span></a></li>`;
  });
  return html`<ul class="squad-matches">${items}</ul>`;
}

// Actas de N de M partidos jugados (spec §7): cuántos partidos del equipo tienen acta que cuenta.
function squadNote(actas, skipped, played) {
  const incomplete = skipped ? `; ${plural(skipped, 'acta más llega incompleta', 'actas más llegan incompletas')} (sin uno de los dos equipos) y no ${skipped === 1 ? 'cuenta' : 'cuentan'}` : '';
  return `Actas de ${actas} de ${plural(played, 'partido jugado', 'partidos jugados')}${incomplete}.`;
}

// La plantilla del grupo y la temporada desde las actas (LINEUPS_<S>), si el grupo tiene alguna:
// jugador (un botón que despliega sus partidos), PJ, titular y goles, y las tarjetas solo si alguien
// de la temporada tiene alguna. Sin actas del grupo, nada (la mayoría no tiene). Si la carga falló
// (null), la caja de error con el «Reintentar» del router; sin pedir (undefined: nunca en la app,
// donde needs las trae antes de pintar), nada.
function squadBlock(ctx, group, name) {
  const lineups = ctx.datasets?.lineups?.[group.season];
  if (lineups === null) return block('Plantilla', errorBox(`las actas de ${seasonLabel(group.season)}`));
  if (!lineups) return '';
  const { rows, actas, skipped, groupActas } = teamSquad(lineups, { group, team: name });
  if (!groupActas) return '';
  const played = teamFixtures(name, group, ctx.today).played;
  if (!rows.length) {
    const incomplete = skipped === 1 ? 'El acta de su partido llega incompleta' : `Las ${skipped} actas de sus partidos llegan incompletas`;
    const why = skipped
      ? `${incomplete} (sin uno de los dos equipos): no se puede saber su plantilla.`
      : 'La federación no ha publicado actas de sus partidos.';
    return block('Plantilla', empty(why));
  }
  const cards = anyCards(lineups);
  const head = html`<tr><th scope="col" class="sq-dorsal"><abbr title="Dorsal">N.º</abbr></th><th scope="col" class="sq-name">Jugador</th><th scope="col" class="sq-num"><abbr title="Partidos jugados">PJ</abbr></th><th scope="col" class="sq-num"><abbr title="Partidos de titular">Tit.</abbr></th><th scope="col" class="sq-goals">Goles</th>${cards ? html`<th scope="col" class="sq-num"><abbr title="Tarjetas amarillas">TA</abbr></th><th scope="col" class="sq-num"><abbr title="Tarjetas rojas">TR</abbr></th>` : ''}</tr>`;
  const body = rows.map((r, i) => html`<tr><td class="sq-dorsal">${r.dorsal ?? ''}</td><th scope="row" class="sq-name"><button type="button" class="squad-player" data-action="jugador" data-index="${i}" aria-expanded="false">${playerName(r.name)}</button></th><td class="sq-num">${r.ap}</td><td class="sq-num">${r.st}</td><td class="sq-goals">${r.g}</td>${cards ? html`<td class="sq-num">${r.y}</td><td class="sq-num">${r.rd}</td>` : ''}</tr>`);
  return html`${box(html`<table class="squad"><caption class="vh">Plantilla de ${name}: toca un jugador para ver sus partidos</caption><thead>${head}</thead><tbody>${body}</tbody></table>`,
    { title: 'Plantilla', context: 'según las actas' })}${notice(null, squadNote(actas, skipped, played))}`;
}

// ── Trayectoria (decisión 14) ───────────────────────────────────────────

// El botón y su panel, vacío hasta que se despliega: la trayectoria carga todo el archivo (hasta 0,9
// MB), así que solo se pide bajo demanda.
function trajectoryBlock() {
  return block('Trayectoria', html`<button type="button" class="team-toggle" data-action="trayectoria" aria-expanded="false" aria-controls="${TRAJECTORY_ID}">Ver la trayectoria</button><div id="${TRAJECTORY_ID}" class="team-panel" aria-live="polite" hidden></div>`,
    { context: 'todas las temporadas' });
}

// Las filas de teamTrajectory, por temporada: el equipo del club, su grupo, su puesto y sus puntos,
// y cada una abre la Tabla de ese grupo y esa temporada.
export function trajectoryList(rows) {
  const seasons = [...new Set(rows.map(r => r.season))];
  return join(seasons.map(season => html`<h3 class="traj-season">${seasonLabel(season)}</h3><div class="box">${rows.filter(r => r.season === season).map(r => html`<a class="traj-row" href="${routeHref('tabla', { s: r.season, g: r.group.id })}"><span class="traj-team">${r.name}</span><span class="traj-group">${r.group.label}</span><span class="traj-pos">${r.pos != null ? `${r.pos}.º de ${r.group.standings.length}` : '—'}</span><span class="traj-pts">${r.pts != null ? plural(r.pts, 'punto', 'puntos') : ''}</span></a>`)}</div>`));
}

// Carga el archivo que falte (loadSeasons, de state.js) y arma el panel; nunca lanza. Un fallo de la
// carga o de un dato mal formado es la caja de error del propio panel, con su «Reintentar» (decisión
// 103 de B2), como las temporadas anteriores de Partido. Pura salvo la carga: se prueba sin navegador.
export async function trajectoryContent(ctx, name, load = ensureSeasonData) {
  try {
    // Las de SEASONS y la del portal, que siempre está: de la más reciente a la más antigua.
    const names = [...new Set([ctx.portal.season, ...(ctx.datasets.seasons || []).map(s => s.name)])]
      .filter(n => /^\d{4}-\d{4}$/.test(n)).sort().reverse();
    const past = names.filter(n => n !== ctx.portal.season);
    if (!await loadSeasons(ctx.datasets, past, load)) return errorBox('la trayectoria');
    return trajectoryList(teamTrajectory(ctx.model, name, ctx.model.clubIndex(), names));
  } catch (err) {
    console.error('[equipo] trayectoria', err);
    return errorBox('la trayectoria');
  }
}

// ── Pantalla ────────────────────────────────────────────────────────────

// Mi equipo en otra fase de la misma temporada (decisión 40): tras «Hacer mi equipo» en FF5, la
// resolución pasa a A2 (el cambio de fase de §6.3) y la ficha de FF5 deja de ser «mi equipo» para la
// barra. Ahí no se ofrece otra vez el botón: se dice dónde juega ahora, con el enlace a esa ficha. Es
// el mismo nombre y la misma categoría que la resolución, en su temporada; si no, null.
function movedNotice(ctx, group, name, mine) {
  const r = ctx.resolution;
  if (mine || !r || r.status !== 'ok' || r.name !== name || r.cat !== group.cat || r.group.season !== group.season) return null;
  return notice(null, html`Tu equipo ahora juega en <a class="more" href="${teamHref(r.group.season, r.group.id, r.name)}">${r.group.label}</a>.`);
}

const lost = (ctx, text) => html`<section data-screen="equipo">${screenHead('Equipo', { back: ctx.backHref })}${block(null, empty(text))}</section>`;

function render(ctx) {
  const params = ctx.params || {};
  const s = params.s || ctx.portal.season;
  // Sin la temporada (el router no la trajo): la caja de error con «Reintentar», nunca otra (§7).
  if (!ctx.model.season(s)) {
    return html`<section data-screen="equipo">${screenHead('Equipo', { back: ctx.backHref })}${errorBox(`la temporada ${seasonLabel(s)}`)}</section>`;
  }
  const { group, name } = locate(ctx);
  if (!group || group.kind !== 'league') return lost(ctx, `No hay ningún grupo de liga ${params.g || ''} en la temporada ${seasonLabel(s)}.`);
  if (!name) return lost(ctx, `No encontramos a ${params.t || 'ese equipo'} en ${group.label}.`);
  const mine = routeIsMine(ctx.route, ctx.resolution);
  // «Hacer mi equipo» (decisión 11): solo en la temporada del portal (mi equipo es siempre de la
  // actual) y si la ficha no es ya mi equipo, con la misma regla que marca Mi equipo en la barra; ni
  // en mi equipo en otra fase de la misma temporada, que dice dónde juega ahora (decisión 40).
  const moved = movedNotice(ctx, group, name, mine);
  const action = group.season === ctx.portal.season && !mine && !moved ? 'make' : null;
  const view = teamView(ctx, { group, name }, { action, calendar: 'always', mine, shields: ctx.datasets?.shields || {} });
  const aside = [...view.aside, evolutionBlock(ctx, group, name), squadBlock(ctx, group, name), trajectoryBlock()];
  return html`<section data-screen="equipo" data-state="${view.state}">${view.head}${moved || ''}${teamColumns(view.main, aside, view.rest)}</section>`;
}

// El detalle de un jugador: su fila de partidos, justo debajo de la suya, al desplegarlo; al
// plegarlo, se quita. aria-controls apunta a esa fila mientras existe.
function togglePlayer(ctx, team, button) {
  const row = button.closest('tr');
  const open = button.getAttribute('aria-expanded') === 'true';
  const id = `jugador-${button.getAttribute('data-index')}`;
  if (open) {
    row.nextElementSibling?.remove();
    button.setAttribute('aria-expanded', 'false');
    button.removeAttribute('aria-controls');
    return;
  }
  const lineups = ctx.datasets.lineups[team.group.season];
  const player = teamSquad(lineups, { group: team.group, team: team.name }).rows[Number(button.getAttribute('data-index'))];
  if (!player) return;
  // Html de html``, que escapa cada dato (spec §5.1).
  row.insertAdjacentHTML('afterend', String(html`<tr class="squad-detail" id="${id}"><td colspan="${row.children.length}">${playerDetail(lineups, team.group, team.name, player.name)}</td></tr>`));
  button.setAttribute('aria-expanded', 'true');
  button.setAttribute('aria-controls', id);
}

async function showTrajectory(section, ctx, name) {
  const panel = section.querySelector(`#${TRAJECTORY_ID}`);
  if (!panel) return;
  panel.setAttribute('aria-busy', 'true');
  panel.innerHTML = String(html`<p class="team-loading">Cargando la trayectoria…</p>`);
  const content = await trajectoryContent(ctx, name);
  // Una respuesta lenta nunca pinta sobre otra pantalla.
  if (!panel.isConnected) return;
  panel.innerHTML = String(content);
  panel.removeAttribute('aria-busy');
}

function toggleTrajectory(section, ctx, name, button) {
  const panel = section.querySelector(`#${TRAJECTORY_ID}`);
  if (!panel) return;
  const open = button.getAttribute('aria-expanded') === 'true';
  button.setAttribute('aria-expanded', String(!open));
  button.textContent = open ? 'Ver la trayectoria' : 'Ocultar la trayectoria';
  panel.hidden = open;
  if (!open && !panel.hasChildNodes()) showTrajectory(section, ctx, name);
}

function mount(root, ctx, nav) {
  const team = locate(ctx);
  if (!team.name) return undefined;
  // «Vistos hace poco» (decisión 5): la ficha visitada va la primera, sin repetidos y como máximo 8.
  // app.js la guarda sin volver a pintar; se apunta aunque la sección no se encuentre.
  if (nav && typeof nav.addRecent === 'function') nav.addRecent({ s: team.group.season, g: team.group.id, t: team.name });
  const section = root.matches && root.matches('[data-screen="equipo"]') ? root : root.querySelector('[data-screen="equipo"]');
  if (!section) return undefined;
  // La escucha va en la sección, que se sustituye en cada pintado: nunca se acumula. «‹» y el
  // «Reintentar» de la pantalla siguen hasta el router; el de la trayectoria es de su panel.
  section.addEventListener('click', (event) => {
    const target = event.target.closest('[data-action]');
    if (!target || !section.contains(target)) return;
    const action = target.getAttribute('data-action');
    const inPanel = Boolean(target.closest(`#${TRAJECTORY_ID}`));
    if (action === 'hacer-mi-equipo') {
      // Lo guarda app.js (en memoria si el almacenamiento falla) y el router vuelve a pintar la ficha:
      // sin el botón y con Mi equipo marcado en la barra.
      if (nav && typeof nav.saveMyTeam === 'function') {
        nav.saveMyTeam({ name: team.name, season: team.group.season, cat: team.group.cat, groupId: team.group.id });
      }
    } else if (action === 'jugador') {
      togglePlayer(ctx, team, target);
    } else if (action === 'trayectoria') {
      toggleTrajectory(section, ctx, team.name, target);
    } else if (action === 'retry' && inPanel) {
      event.preventDefault();
      event.stopPropagation();
      showTrajectory(section, ctx, team.name);
    }
  });
  return mountTeamView(section, ctx, team, { calendar: 'always' });
}

export const screen = {
  id: 'equipo',
  // data-health.json (la frescura de A, B y C), una vez por sesión, como la portada: undefined sin
  // pedir y null si falló. Y las actas de la temporada de la ruta (la plantilla): {} con un 404 y null
  // si fallan, que la plantilla dice con su caja de error; un fallo se vuelve a pedir en la visita
  // siguiente. Nunca rechaza. La temporada de la ruta la carga el router (decisión 2 de B3).
  needs: (params, datasets) => {
    const loads = [];
    if (datasets.health === undefined) loads.push(ensureHealth().then((health) => { datasets.health = health; }));
    const s = params && params.s;
    if (!datasets.lineups) datasets.lineups = {};
    if (s && !datasets.lineups[s]) loads.push(ensureLineups(s).then((data) => { datasets.lineups[s] = data; }));
    return loads;
  },
  render,
  mount,
};
