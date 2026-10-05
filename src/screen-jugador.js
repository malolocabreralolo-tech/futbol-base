// Ficha de un jugador, `#/jugador?id` (su id de la federación, el mismo niño de prebenjamín a
// benjamín y de una temporada a otra): su trayectoria según las actas, de la temporada más reciente a
// la más antigua (equipo, grupo, partidos, de titular, goles y tarjetas), y «Seguir», que lo pone en
// Mi equipo. Los datos son el trozo de su id de data-jugadores-<k>.js (ensureJugadores): la ficha no
// depende de ninguna temporada cargada. render(ctx) es pura; mount pone «Seguir».
import { html } from './html.js';
import { block, box, countLabel, empty, screenHead } from './ui.js';
import { groupLabel, playerName, seasonLabel } from './model.js';
import { playerHref, teamHref } from './links.js';
import { errorBox } from './shell.js';
import { ensureJugadores, jugadoresShard } from './state.js';
import { isFollowed } from './followed.js';

// El jugador de la ruta: { id, shard, player }; shard es undefined sin pedir y null si falló.
function locate(ctx) {
  const id = ctx.params?.id || null;
  if (!id) return { id: null, shard: undefined, player: null };
  const shard = ctx.datasets?.jugadores?.[jugadoresShard(id)];
  return { id, shard, player: (shard && shard.p && shard.p[id]) || null };
}

// El nombre del grupo, como en el resto de la app (groupLabel), con lo que trae el trozo.
function where(shard, season, code) {
  const g = shard.g && shard.g[`${season}/${code}`];
  return g ? groupLabel({ id: code, cat: g[0], name: g[1], phase: g[2], island: g[3], season }) : code;
}

const sum = (rows, i) => rows.reduce((n, r) => n + (r[i] | 0), 0);

function stint(shard, row) {
  const [season, code, team, pj, tit, goals, yellow, red] = row;
  // Como la trayectoria del club: el equipo y su grupo a la izquierda; los goles y los partidos a la
  // derecha (cortos: caben a 320 px). De titular y las tarjetas, con el grupo.
  const cards = [yellow ? countLabel(yellow, 'amarilla', 'amarillas') : '', red ? countLabel(red, 'roja', 'rojas') : ''];
  const detail = [where(shard, season, code), tit ? `${tit} de titular` : '', ...cards].filter(Boolean).join(' · ');
  return html`<a class="traj-row" href="${teamHref(season, code, team)}"><span class="traj-team">${team}</span><span class="traj-group">${detail}</span><span class="traj-pos">${goals ? countLabel(goals, 'gol', 'goles') : 'sin goles'}</span><span class="traj-pts">${countLabel(pj, 'partido', 'partidos')}</span></a>`;
}

function career(shard, player) {
  const seasons = [...new Set(player.c.map(r => r[0]))].sort().reverse();
  return seasons.map(season => html`<h3 class="traj-season">${seasonLabel(season)}</h3><div class="box">${player.c.filter(r => r[0] === season).map(r => stint(shard, r))}</div>`);
}

const wrap = (content) => html`<section data-screen="jugador">${content}</section>`;

function render(ctx) {
  const { id, shard, player } = locate(ctx);
  const head = (title, opts = {}) => screenHead(title, { back: ctx.backHref, ...opts });
  if (!id) return wrap(html`${head('Jugador')}${block(null, empty('Abre la ficha de un jugador desde la plantilla de un equipo o desde un partido.'))}`);
  if (shard === null) return wrap(html`${head('Jugador')}${errorBox('la ficha del jugador')}`);
  if (!player) return wrap(html`${head('Jugador')}${block(null, empty('No encontramos a ese jugador en las actas de la federación.'))}`);
  const seasons = new Set(player.c.map(r => r[0])).size;
  const sub = [countLabel(seasons, 'temporada', 'temporadas'), countLabel(sum(player.c, 3), 'partido', 'partidos'),
    countLabel(sum(player.c, 5), 'gol', 'goles')].join(' · ');
  const following = isFollowed(ctx.followed, id);
  const action = html`<button type="button" class="screen-action" data-action="seguir-jugador" aria-pressed="${following ? 'true' : 'false'}">${following ? 'Siguiendo' : 'Seguir'}</button>`;
  return wrap(html`${head(playerName(player.n), { sub, action })}${block('Trayectoria', career(shard, player), { context: 'según las actas de la federación' })}`);
}

function mount(root, ctx, nav) {
  const { player, id } = locate(ctx);
  if (!player) return undefined;
  const section = root.matches && root.matches('[data-screen="jugador"]') ? root : root.querySelector('[data-screen="jugador"]');
  if (!section) return undefined;
  // La escucha va en la sección, que se sustituye en cada pintado: nunca se acumula. Lo guarda app.js
  // y el router vuelve a pintar la ficha, con el botón cambiado.
  section.addEventListener('click', (event) => {
    const target = event.target.closest('[data-action="seguir-jugador"]');
    if (!target || !section.contains(target)) return;
    if (nav && typeof nav.toggleFollow === 'function') nav.toggleFollow({ id, n: player.n });
  });
  return undefined;
}

// Los jugadores seguidos, en Mi equipo: cada uno con el enlace a su ficha, el último seguido primero.
export function followedBlock(ctx) {
  const list = Array.isArray(ctx.followed) ? ctx.followed : [];
  if (!list.length) return '';
  return block('Jugadores que sigues', box(html`${list.map(p => html`<a class="traj-row" href="${playerHref(p.id)}"><span class="traj-team">${playerName(p.n)}</span><span class="traj-group">Ver su trayectoria</span></a>`)}`));
}

export const screen = {
  id: 'jugador',
  // El trozo de data-jugadores-<k>.js de su id: undefined sin pedir y null si falló, que la ficha dice
  // con su caja de error y se vuelve a pedir con «Reintentar» o en la visita siguiente. Nunca rechaza.
  needs: (params, datasets) => {
    const id = params && params.id;
    if (!id) return [];
    if (!datasets.jugadores) datasets.jugadores = {};
    const k = jugadoresShard(id);
    return datasets.jugadores[k] ? [] : [ensureJugadores(k).then((data) => { datasets.jugadores[k] = data; })];
  },
  render,
  mount,
};
