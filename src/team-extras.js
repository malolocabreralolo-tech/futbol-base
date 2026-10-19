// Lo que la consulta añade a la vista de equipo (spec §4.6; decisiones 12 a 14 de B3), en Mi equipo y
// en la ficha: la plantilla y la trayectoria, con su comportamiento. La evolución de puntos, que iba
// delante, la quitó el usuario el 19/10/2026 («no me aporta tanto»); el pronóstico de la clasificación
// final que pidió en su lugar es una cifra de «La temporada en cifras» (team-view.js) que abre su tabla en
// la Tabla (screen-tabla.js). Puro salvo los mount y fillSquad; nada toca el DOM al importarse.
import { html, join } from './html.js';
import { block, box, countLabel, empty, notice, score } from './ui.js';
import {
  anyCards, playerMatches, playerName, roleLabel, seasonLabel, teamFixtures, teamShort, teamSquad, teamStaff,
} from './model.js';
import { teamTrajectory } from './myteam.js';
import { matchHref, playerHref, routeHref, weekdayDate } from './links.js';
import { errorBox, retryBlock } from './shell.js';
import { ensureLineups, ensureSeasonData, lineupsKey, loadAlevinSeasons, loadSeasons } from './state.js';

const TRAJECTORY_ID = 'trayectoria';
export const SQUAD_ID = 'plantilla';

// ── Plantilla (decisión 13) ─────────────────────────────────────────────

// Los partidos de un jugador, con el marcador desde su equipo, cada uno a su ficha. Lo pinta mount
// al desplegarlo (spec §5.1: nada oculto generado).
export function playerDetail(lineups, group, team, player, id = null) {
  const items = playerMatches(lineups, { group, team, player }).map(({ match, side, goals }) => {
    const home = side === 'home';
    const rival = home ? match.away : match.home;
    const round = group.rounds.find(r => r.key === match.roundKey);
    const when = [round ? round.label : match.roundKey, weekdayDate(match.dateISO)].filter(Boolean).join(' · ');
    return html`<li><a class="squad-match" href="${matchHref(match)}"><span class="squad-when">${when}</span><span class="squad-rival">${home ? 'en casa contra' : 'fuera contra'} ${teamShort(rival)}</span><span class="squad-score">${home ? score(match.hs, match.as) : score(match.as, match.hs)}</span><span class="squad-goals">${goals ? countLabel(goals, 'gol', 'goles') : 'sin goles'}</span></a></li>`;
  });
  // Con su id de la federación, su ficha: todas sus temporadas y equipos.
  const href = playerHref(id);
  return html`<ul class="squad-matches">${items}</ul>${href ? html`<p class="squad-more"><a class="more" href="${href}">Ver su trayectoria</a></p>` : ''}`;
}

// Actas de N de M partidos jugados (spec §7): cuántos partidos del equipo tienen acta que cuenta.
function squadNote(actas, skipped, played) {
  const incomplete = skipped ? `; ${countLabel(skipped, 'acta más llega incompleta', 'actas más llegan incompletas')} (sin uno de los dos equipos) y no ${skipped === 1 ? 'cuenta' : 'cuentan'}` : '';
  return `Actas de ${actas} de ${countLabel(played, 'partido jugado', 'partidos jugados')}${incomplete}.`;
}

// La plantilla del grupo y la temporada desde las actas del grupo (LINEUPS_<S>_<grupo>), si tiene alguna:
// jugador (un botón que despliega sus partidos), PJ, titular y goles, y las tarjetas solo si alguien
// del grupo tiene alguna. Sin actas del grupo, nada (la mayoría no tiene). Si la carga falló
// (null), la caja de error con su «Reintentar», que atiende mountTeamExtras (retrySquad: solo este
// bloque, sin volver arriba; B5, decisión 3); sin pedir (undefined), nada: en la ficha, nunca (needs
// las trae); en la portada, el hueco de squadSlot. Siempre una sola sección, #plantilla (con la nota
// de las actas dentro), para que ese «Reintentar» la pinte en su sitio.
export function squadBlock(ctx, group, name) {
  const lineups = ctx.datasets?.lineups?.[lineupsKey(group.season, group.id)];
  if (lineups === null) return block('Plantilla', errorBox(`las actas de ${seasonLabel(group.season)}`), { id: SQUAD_ID });
  if (!lineups) return '';
  const { rows, actas, skipped, groupActas } = teamSquad(lineups, { group, team: name });
  if (!groupActas) return '';
  const played = teamFixtures(name, group, ctx.today).played;
  if (!rows.length) {
    const incomplete = skipped === 1 ? 'El acta de su partido llega incompleta' : `Las ${skipped} actas de sus partidos llegan incompletas`;
    const why = skipped
      ? `${incomplete} (sin uno de los dos equipos): no se puede saber su plantilla.`
      : 'La federación no ha publicado actas de sus partidos.';
    return block('Plantilla', empty(why), { id: SQUAD_ID });
  }
  const cards = anyCards(lineups);
  const head = html`<tr><th scope="col" class="sq-dorsal"><abbr title="Dorsal">N.º</abbr></th><th scope="col" class="sq-name">Jugador</th><th scope="col" class="sq-num"><abbr title="Partidos jugados">PJ</abbr></th><th scope="col" class="sq-num"><abbr title="Partidos de titular">Tit.</abbr></th><th scope="col" class="sq-goals">Goles</th>${cards ? html`<th scope="col" class="sq-num"><abbr title="Tarjetas amarillas">TA</abbr></th><th scope="col" class="sq-num"><abbr title="Tarjetas rojas">TR</abbr></th>` : ''}</tr>`;
  const body = rows.map((r, i) => html`<tr><td class="sq-dorsal">${r.dorsal ?? ''}</td><th scope="row" class="sq-name"><button type="button" class="squad-player" data-action="jugador" data-index="${i}" aria-expanded="false">${playerName(r.name)}</button></th><td class="sq-num">${r.ap}</td><td class="sq-num">${r.st}</td><td class="sq-goals">${r.g}</td>${cards ? html`<td class="sq-num">${r.y}</td><td class="sq-num">${r.rd}</td>` : ''}</tr>`);
  // Su cuerpo técnico habitual, de las mismas actas (teamStaff): el nombre más repetido de cada cargo.
  const staff = teamStaff(lineups, { group, team: name });
  const staffBox = staff.length
    ? box(html`<div class="box-text">${staff.map((s) => html`<p class="pt-staff"><span class="pt-staff-label">${roleLabel(s.role)}:</span> ${playerName(s.name)}</p>`)}</div>`)
    : '';
  return block('Plantilla', html`${box(html`<table class="squad"><caption class="vh">Plantilla de ${name}: toca un jugador para ver sus partidos</caption><thead>${head}</thead><tbody>${body}</tbody></table>`)}${staffBox}${notice(null, squadNote(actas, skipped, played))}`,
    { context: 'según las actas', id: SQUAD_ID });
}

// La plantilla de la portada aún sin actas: el equipo ha jugado algo y sus actas no han llegado
// (undefined: sin pedir; null: falló, y se vuelven a pedir).
export function squadPending(ctx, group, name) {
  const lineups = ctx.datasets?.lineups?.[lineupsKey(group.season, group.id)];
  return lineups == null && teamFixtures(name, group, ctx.today).played > 0;
}

// El hueco que llena fillSquad: el mismo id y la misma cabecera que la plantilla, y aria-busy mientras
// llegan las actas. Sin role=status: la plantilla no es una noticia para el lector de pantalla.
const squadSlot = () => html`<section class="block" id="${SQUAD_ID}" data-slot="plantilla" aria-busy="true"><div class="block-head"><h2 class="block-title">Plantilla</h2><p class="block-context">según las actas</p></div><p class="team-loading">Cargando la plantilla…</p></section>`;

// Sin conexión y sin las actas (D4): un vacío tranquilo, sin alerta ni «Reintentar». Un grupo sin
// fichero de actas recibe, sin conexión, el index.html del SW, y saldría una alerta en cada apertura.
const offlineSquad = () => block('Plantilla', empty('Sin conexión. Si hay actas de sus partidos, la plantilla aparecerá al volver la conexión.'), { id: SQUAD_ID });

// «Reintentar» de la Plantilla (B5, decisión 3): vuelve a pedir las actas de su grupo y pinta el
// bloque en su sitio (retryBlock, shell.js). Si el grupo resulta no tener actas, lo dice: el bloque no
// desaparece bajo el dedo de quien pulsó.
function retrySquad(section, ctx, team, button) {
  const { season, id } = team.group;
  return retryBlock(section, SQUAD_ID, button,
    () => ensureLineups(season, id).then((data) => { ctx.datasets.lineups[lineupsKey(season, id)] = data; }),
    () => squadBlock(ctx, team.group, team.name) || block('Plantilla', empty('La federación no ha publicado actas de este grupo.'), { id: SQUAD_ID }));
}

// ── Trayectoria (decisión 14) ───────────────────────────────────────────

// El botón y su panel, vacío hasta que se despliega: la trayectoria carga todo el archivo (unos 3 MB
// sin comprimir con las nueve temporadas archivadas), así que solo se pide bajo demanda.
function trajectoryBlock() {
  return block('Trayectoria', html`<button type="button" class="team-toggle" data-action="trayectoria" aria-expanded="false" aria-controls="${TRAJECTORY_ID}">Ver la trayectoria</button><div id="${TRAJECTORY_ID}" class="team-panel" aria-live="polite" hidden></div>`,
    { context: 'todas las temporadas' });
}

// Las filas de teamTrajectory, por temporada: el equipo del club, su grupo, su puesto y sus puntos,
// y cada una abre la Tabla de ese grupo y esa temporada.
export function trajectoryList(rows) {
  const seasons = [...new Set(rows.map(r => r.season))];
  return join(seasons.map(season => html`<h3 class="traj-season">${seasonLabel(season)}</h3><div class="box">${rows.filter(r => r.season === season).map(r => html`<a class="traj-row" href="${routeHref('tabla', { s: r.season, g: r.group.id })}"><span class="traj-team">${r.name}</span><span class="traj-group">${r.group.label}</span><span class="traj-pos">${r.pos != null ? `${r.pos}.º de ${r.group.standings.length}` : '—'}</span><span class="traj-pts">${r.pts != null ? countLabel(r.pts, 'punto', 'puntos') : ''}</span></a>`)}</div>`));
}

// El aviso de una trayectoria sin el alevín de alguna temporada pasada (`failed`), con el «Reintentar»
// del panel: sin la alerta de la caja de error, porque lo demás sí se pinta.
function alevinMissingBox(failed) {
  const what = failed.length === 1 ? `de la temporada ${seasonLabel(failed[0])}` : `de ${failed.length} temporadas`;
  return html`<div class="box partial-box" role="status"><p class="partial-text">No se pudieron cargar los datos de alevín ${what}: la trayectoria sale sin ellos.</p><div class="buttons"><button class="button" type="button" data-action="retry">Reintentar</button></div></div>`;
}

// Carga el archivo que falte (loadSeasons, de state.js) y arma el panel; nunca lanza. Un fallo de la
// carga o de un dato mal formado es la caja de error del propio panel, con su «Reintentar» (decisión
// 103 de B2), como las temporadas anteriores de Partido. Pura salvo la carga: se prueba sin navegador.
// El alevín de todas (contrato común de alevín), para que lo que sale no dependa de lo que se visitó
// antes: el de la temporada del portal (data-alevin.js, que el SW guarda al instalarse), como una
// temporada más; y el de cada pasada (data-season-<S>-alevin.js, que solo existe si la tuvo: un 404 es
// «sin alevín» y se memoriza). Esos no se guardan hasta usarse, así que sin conexión no llegan: la
// trayectoria sale sin ellos, con un aviso y «Reintentar». `alevinLoaders`, los de alevinNeeds.
export async function trajectoryContent(ctx, name, load = ensureSeasonData, alevinLoaders = {}) {
  try {
    // Las de SEASONS y la del portal, que siempre está: de la más reciente a la más antigua.
    const names = [...new Set([ctx.portal.season, ...(ctx.datasets.seasons || []).map(s => s.name)])]
      .filter(n => /^\d{4}-\d{4}$/.test(n)).sort().reverse();
    const past = names.filter(n => n !== ctx.portal.season);
    const [loaded, failed] = await Promise.all([
      loadSeasons(ctx.datasets, past, load),
      loadAlevinSeasons(ctx.datasets, names, ctx.portal.season, alevinLoaders),
    ]);
    if (!loaded || failed.includes(ctx.portal.season)) return errorBox('la trayectoria');
    const list = trajectoryList(teamTrajectory(ctx.model, name, ctx.model.clubIndex(), names));
    return failed.length ? html`${alevinMissingBox(failed)}${list}` : list;
  } catch (err) {
    console.error('[equipo] trayectoria', err);
    return errorBox('la trayectoria');
  }
}

// ── En las dos pantallas ────────────────────────────────────────────────

// En las dos pantallas y en este orden (decisión 81 de B3; sin la evolución de puntos desde el
// 19/10/2026). Con lazySquad (la portada), la plantilla no espera a las actas: el hueco que llena
// fillSquad, o nada si el equipo no ha jugado.
export function teamExtras(ctx, group, name, { lazySquad = false } = {}) {
  const squad = !lazySquad ? squadBlock(ctx, group, name)
    : teamFixtures(name, group, ctx.today).played === 0 ? ''
      : squadPending(ctx, group, name) ? squadSlot() : squadBlock(ctx, group, name);
  return [squad, trajectoryBlock()];
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
  const lineups = ctx.datasets.lineups[lineupsKey(team.group.season, team.group.id)];
  const player = teamSquad(lineups, { group: team.group, team: team.name }).rows[Number(button.getAttribute('data-index'))];
  if (!player) return;
  // Html de html``, que escapa cada dato (spec §5.1).
  row.insertAdjacentHTML('afterend', String(html`<tr class="squad-detail" id="${id}"><td colspan="${row.children.length}">${playerDetail(lineups, team.group, team.name, player.name, player.id)}</td></tr>`));
  button.setAttribute('aria-expanded', 'true');
  button.setAttribute('aria-controls', id);
}

// Pinta el panel de la trayectoria: «Cargando…» y después lo que dé trajectoryContent. Si el foco
// estaba dentro (su «Reintentar», que sale del DOM), va al título del bloque (tabindex -1, como
// retryBlock en shell.js): sin esto caería en <body> y el siguiente Tab empezaría arriba.
async function showTrajectory(section, ctx, name) {
  const panel = section.querySelector(`#${TRAJECTORY_ID}`);
  if (!panel) return;
  const active = panel.ownerDocument?.activeElement;
  const title = active && panel.contains(active) ? panel.closest('.block')?.querySelector('.block-title') : null;
  panel.setAttribute('aria-busy', 'true');
  panel.innerHTML = String(html`<p class="team-loading">Cargando la trayectoria…</p>`);
  if (title) {
    if (!title.hasAttribute('tabindex')) title.setAttribute('tabindex', '-1');
    title.focus({ preventScroll: true });
  }
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

// El comportamiento de los extras en su sección (la que se sustituye en cada pintado: la escucha nunca
// se acumula): cada jugador de la plantilla despliega sus partidos y «Ver la trayectoria», su panel.
// El «Reintentar» de la trayectoria es de su panel, y el de la plantilla, de su bloque: ninguno sigue
// hasta el router, que atiende el de la pantalla.
export function mountTeamExtras(section, ctx, team) {
  section.addEventListener('click', (event) => {
    const target = event.target.closest('[data-action]');
    if (!target || !section.contains(target)) return;
    const action = target.getAttribute('data-action');
    if (action === 'jugador') {
      togglePlayer(ctx, team, target);
    } else if (action === 'trayectoria') {
      toggleTrajectory(section, ctx, team.name, target);
    } else if (action === 'retry' && target.closest(`#${TRAJECTORY_ID}`)) {
      event.preventDefault();
      event.stopPropagation();
      showTrajectory(section, ctx, team.name);
    } else if (action === 'retry' && target.closest(`#${SQUAD_ID}`)) {
      event.preventDefault();
      event.stopPropagation();
      retrySquad(section, ctx, team, target);
    }
  });
}

// ── La plantilla de la portada, sin esperar (D4) ────────────────────────

// Lo que fillSquad hace tras `load` y con el navegador libre (requestIdleCallback con 1 s de tope;
// sin él, como en Safari, setTimeout). Si la portada se pinta antes de `load` (data-health.json ya en
// la caché del SW), espera a que acaben los recursos de la página. En la primera apertura en frío, no:
// la portada espera a data-health.json, que con fetch no retrasa `load`, y se pinta con la página ya
// cargada; solo queda esperar a que el navegador esté libre, y las actas (48 KB con gzip las mayores)
// pueden coincidir con los escudos que aún bajan (con el perfil del presupuesto, se piden unos 220 ms
// tras el pintado). Devuelve la cancelación.
function afterLoad(win, run) {
  let idle = null; let timer = null;
  const start = () => {
    if (typeof win.requestIdleCallback === 'function') idle = win.requestIdleCallback(run, { timeout: 1000 });
    else timer = setTimeout(run, 0);
  };
  if (win.document?.readyState === 'complete') start();
  else win.addEventListener('load', start, { once: true });
  return () => {
    win.removeEventListener('load', start);
    if (idle !== null && typeof win.cancelIdleCallback === 'function') win.cancelIdleCallback(idle);
    if (timer !== null) clearTimeout(timer);
  };
}

// Lo primero que se ve tras el hueco, en el orden del documento, como elige su ancla el navegador: el
// bloque siguiente de su columna o, si la columna ya quedó por encima de la ventana, lo que la sigue
// (en móvil, el calendario). null si no hay nada a la vista.
function anchorAfter(slot) {
  for (let el = slot; el && !el.hasAttribute('data-screen'); el = el.parentElement) {
    for (let next = el.nextElementSibling; next; next = next.nextElementSibling) {
      if (next.getBoundingClientRect().bottom > 0) return next;
    }
  }
  return null;
}

// Llena el hueco de la plantilla de la portada (squadSlot) con las actas de su grupo, sin mover el
// foco. Lo que llega se guarda siempre en datasets.lineups, aunque ya no se esté en la portada: la
// siguiente, o la ficha, lo pintan en el acto. Solo pinta si el hueco sigue en la página: con las
// actas, la plantilla; con {} (un 404, sin actas), nada; con null, la caja de error con su
// «Reintentar» (retrySquad) o, sin conexión, el vacío tranquilo de offlineSquad, que se rellena solo
// al volver la conexión. Devuelve la limpieza (el router la llama antes del pintado siguiente).
// `load`, `win` y `when` se inyectan en las pruebas; la ventana es la del documento de la sección.
//
// El hueco no tiene el alto de la plantilla (spec §7, con su nota): no se sabe hasta que llegan las
// actas, y sin ellas se quita. Si el hueco ya quedó por encima de la ventana (se bajó al calendario
// mientras llegaban), lo que se está mirando no se mueve: la página se desplaza lo mismo que se movió
// lo primero que se ve tras él (anchorAfter). Es lo que hace el anclaje del desplazamiento de Chrome y
// Firefox, que Safari no trae; si el navegador ya lo compensó, no queda nada que mover.
export function fillSquad(section, ctx, team, {
  load = ensureLineups, win = section.ownerDocument?.defaultView || null, when = run => afterLoad(win, run),
} = {}) {
  if (!win) return undefined;             // sin navegador (pruebas de Node): nada
  const { season, id } = team.group;
  const key = lineupsKey(season, id);
  let alive = true;
  const paint = (markup) => {
    const slot = section.querySelector(`#${SQUAD_ID}`);
    if (!alive || !slot || !slot.isConnected) return;
    const anchor = typeof slot.getBoundingClientRect === 'function' && slot.getBoundingClientRect().top < 0 ? anchorAfter(slot) : null;
    const top = anchor ? anchor.getBoundingClientRect().top : 0;
    slot.outerHTML = String(markup);   // '' lo quita
    const moved = anchor && anchor.isConnected ? anchor.getBoundingClientRect().top - top : 0;
    if (Math.abs(moved) >= 1) win.scrollBy(0, moved);
  };
  const onOnline = () => { win.removeEventListener('online', onOnline); run(); };
  async function run() {
    const data = await load(season, id);
    if (!ctx.datasets.lineups) ctx.datasets.lineups = {};
    ctx.datasets.lineups[key] = data;
    if (!alive) return;
    if (data === null && win.navigator?.onLine === false) {
      paint(offlineSquad());
      win.addEventListener('online', onOnline);
    } else paint(squadBlock(ctx, team.group, team.name));
  }
  const cancel = when(run);
  return () => { alive = false; if (typeof cancel === 'function') cancel(); win.removeEventListener('online', onOnline); };
}
