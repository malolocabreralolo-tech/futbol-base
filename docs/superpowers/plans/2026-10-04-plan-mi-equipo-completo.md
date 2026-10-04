# Plan: Mi equipo con todo lo de la ficha (4/10/2026)

Raíz: `/home/manolo/claude/futbol-base`. No hace falta tocar ni `futbolbase.db` ni los `data-*.js` de datos. Nada de push, de `publicar.py`, de workflows ni del bot.

## 0. Opinión para el usuario (para transmitirla tal cual)

Tiene razón, y encaja con el diseño. La ficha de su equipo ya era «la portada más extras»: estas son las que se pasan a Mi equipo. Lo de arriba no cambia: próximo partido, último resultado, clasificación, «Cambiar», la caja de 2026/27 y el aviso de la Segunda Fase. Debajo, en el mismo orden que la ficha, se añaden:

- la evolución de puntos;
- la plantilla según las actas, tocando un jugador para ver sus partidos;
- la trayectoria del club, que se carga al pulsar;
- el calendario completo con su botón .ics. En el móvil va al final; en el ordenador, a la izquierda.

Goleadores, clasificación y cifras ya estaban. Dos cosas que conviene saber:

- La página del móvil crece bastante, más o menos el doble de larga.
- La plantilla de Las Mesas aparecerá cuando el bot publique actas de PG2 2026/27; hoy no hay. Además, la federación oculta parte de los nombres de Las Mesas: en 2025/26, 125 de 237 apariciones solo llevaban el nombre de pila. Eso puede partir o juntar jugadores en la tabla.

## 1. Decisiones

**D1. Mismo orden que la ficha.** La portada es la vista de la ficha con la cabecera de la portada.
- Móvil: cabecera (con el aviso stale en C y D), después lo principal, después la consulta y al final el calendario.
  - Lo principal: Próximo o Último partido y «Últimos cinco» (o el vacío). En D: la caja de 2026/27, «Así terminó» y «Verano».
  - La consulta: Clasificación, Goleadores, Cifras con su Cobertura, frescura, Evolución, Plantilla y Trayectoria. En D: Clasificación final, Evolución, Plantilla y Trayectoria.
- Escritorio (`.home-cols.has-rest`): lo principal y el calendario a la izquierda; la consulta entera a la derecha.
- Por qué:
  - el trabajo principal (spec §1) sigue arriba sin cambios;
  - el calendario de 22 a 30 partidos va al final para no enterrar la clasificación (B3, decisión 63);
  - un solo orden en las dos pantallas.

**D2. Calendario completo siempre, con su .ics, como la ficha.**
- Se retira el modo `'wide'`: `CALENDAR_SLOT`, `wideCalendar`, `WIDE` y el escuchador de matchMedia. También desaparece la opción `calendar` de `teamView` y de `mountTeamView`.
- «calendario completo» pasa a ser el ancla `#calendario` de la misma página.
- En D desaparece «Ver toda la temporada»: llevaría a una ficha con lo mismo. Se borra `.home-all` de `acta.css`.
- Se cumple §5.1: el calendario se ve al bajar y no se oculta con CSS.
- Coste medido (análisis 3): unos 1,5 ms de render, 21 KB de HTML, 0 bytes de imagen extra y +10-20 ms en «portada pintada».

**D3. Módulo compartido nuevo: `src/team-extras.js`.**
- Allí van, sin cambiar su marcado, `evolutionBlock`, `pointsNote`, `squadBlock`, `squadNote`, `playerDetail`, `togglePlayer`, `retrySquad`, `trajectoryBlock`, `trajectoryList`, `trajectoryContent`, `showTrajectory`, `toggleTrajectory`, `SQUAD_ID` y `TRAJECTORY_ID`.
- Funciones nuevas: `teamExtras`, `mountTeamExtras`, `squadPending`, `squadSlot`, `offlineSquad`, `fillSquad` y `afterLoad`.
- Por qué no meterlo en `team-view.js`:
  - pasaría de 468 a unas 650 líneas;
  - los extras arrastran los cargadores (`ensureLineups`, `loadSeasons`, `ensureSeasonData`) y `shell.js` (`errorBox`, `retryBlock`);
  - `team-extras.js` importa de `team-view.js` (`coverageText`, `missingResults`) y no al revés, así que no hay ciclo.
- Las pantallas componen así: `aside = [...view.aside, ...teamExtras(...)]`. Por eso `teamView` sigue dando las mismas consultas (test_rediseno_vista_equipo, l.163 y l.189, sin cambios).
- Hay que añadir el módulo a `STATIC_ASSETS` de `sw.js`.

**D4. La plantilla no bloquea la portada.**
- `needs` de la portada sigue pidiendo solo `data-health.json`. No se tocan ni el router ni test_rediseno_router (l.289-296).
- render (puro), con `key = lineupsKey(group.season, group.id)`:
  - si el equipo no ha jugado ningún partido (`teamFixtures(...).played === 0`, es decir, B), no hay plantilla en la portada. Sin partidos no hay actas suyas, y se evita un hueco que luego desaparece;
  - si las actas ya están (objeto o `{}`), `squadBlock` en el acto, como en la ficha;
  - si no se han pedido (`undefined`) o fallaron (`null`), un hueco con el mismo id: `<section class="block" id="plantilla" data-slot="plantilla" aria-busy="true">`, con la cabecera «Plantilla · según las actas» y «Cargando la plantilla…». No lleva `role=status`, para no hacer ruido en el lector de pantalla.
- mount, con `fillSquad`:
  - empieza tras `load` y con el navegador libre (`requestIdleCallback` con 1 s de tope; si no existe, `setTimeout`). Así no compite con los escudos del LCP;
  - guarda siempre el resultado en `ctx.datasets.lineups[key]`, aunque ya no esté en la portada. La portada siguiente, o la ficha, lo pintan en el acto, y el vuelo único de `ensureLineups` se comparte;
  - solo pinta si el hueco sigue en la página. No mueve el foco;
  - si llega `{}` (un 404), quita el hueco;
  - si llega `null` con conexión, la caja de error con «Reintentar». La atiende `retrySquad` → `retryBlock`, con preventDefault y stopPropagation: se pinta en su sitio y el foco va al título, porque lo pulsó el usuario;
  - devuelve una limpieza (`alive = false`, quita los escuchadores de `load` y `online` y cancela el idle). El router la llama antes del siguiente pintado.
- Sin conexión (`navigator.onLine === false` y `null`): un vacío tranquilo, sin alerta ni botón: «Sin conexión. Si hay actas de sus partidos, la plantilla aparecerá al volver la conexión.» Se rellena solo con el evento `online`.
  - Motivo: un grupo sin fichero de actas, sin conexión, recibe `index.html` del SW (OFFLINE_URL), `ensureLineups` da `null` y saldría una alerta en cada apertura sin red. Hoy le pasaría al equipo por defecto.
- Por qué no en `needs`:
  - el margen del presupuesto es de unos 300 ms y las actas cuestan unos 430 ms a final de temporada;
  - una red colgada dejaría la portada 15 s en el esqueleto;
  - habría que cambiar el contrato de `needs` (B2, decisiones 9 y 129).

**D5. Trayectoria bajo demanda, con el mismo código de la ficha.** Se carga al pulsar (hasta 0,9 MB, de los `SEASON_FILES` precacheados, así que funciona sin conexión), y su «Reintentar» es del panel.

**D6. Lo que NO cambia en la ficha.**
- Su render, byte a byte: mismos bloques, mismo orden y mismo marcado.
- Su `needs`: sigue esperando a las actas (B5, decisión 2).
- «‹», «Hacer mi equipo», el aviso «Tu equipo ahora juega en…», `addRecent` y el esqueleto `'equipo'`.
- El vacío tranquilo sin conexión es solo de la portada; la ficha sigue con la caja de error. Queda como posible mejora aparte.

**D7. Lo que es solo de la portada y se queda.** «Cambiar», sin «‹», la caja de la temporada siguiente (D), el aviso stale (C y D), E y X, y no apuntar en «Vistos hace poco».

**D8. Lo que conscientemente no se hace.**
- **Compensar a mano el desplazamiento al llenar el hueco:** el hueco solo aparece en la primera portada en frío, arriba del todo. Chrome y Firefox anclan el desplazamiento solos.
- **`content-visibility`:** solo si una medición lo pide.
- **Repetir la petición de las actas en `controllerchange`** (el hueco de la primera visita antes de que el SW tome el mando): para otro plan.
- **Guardar los 404 de actas en `sw.js`:** para otro plan.
- **Corregir el punto 9 de la adenda, ya desfasado:** aparte.

## 2. Cambios en el código, fichero a fichero

### `/home/manolo/claude/futbol-base/src/team-extras.js` (nuevo)

- Cabecera: «Lo que la consulta añade a la vista de equipo (spec §4.6; decisiones 12 a 14 de B3), en Mi equipo y en la ficha: la evolución de puntos, la plantilla y la trayectoria, con su comportamiento. Puro salvo los mount y fillSquad; nada toca el DOM al importarse.»
- Imports: lo que hoy usan esos bloques en `screen-equipo.js`, más `coverageText` y `missingResults` de `./team-view.js`.
- Se mueven literalmente las funciones de D3.
  - Se actualiza el comentario de `squadBlock`: «sin pedir: en la ficha, nunca (needs las trae); en la portada, el hueco de squadSlot».
  - Exportados: `pointsNote`, `playerDetail`, `trajectoryList`, `trajectoryContent`, `SQUAD_ID`, `squadBlock` y los nuevos.
- Funciones nuevas (el texto exacto importa):

```js
// La plantilla de la portada aún sin actas: el equipo ha jugado algo y sus actas no han llegado
// (undefined: sin pedir; null: falló, y se vuelven a pedir).
export function squadPending(ctx, group, name) {
  const lineups = ctx.datasets?.lineups?.[lineupsKey(group.season, group.id)];
  return lineups == null && teamFixtures(name, group, ctx.today).played > 0;
}
const squadSlot = () => html`<section class="block" id="${SQUAD_ID}" data-slot="plantilla" aria-busy="true"><div class="block-head"><h2 class="block-title">Plantilla</h2><p class="block-context">según las actas</p></div><p class="team-loading">Cargando la plantilla…</p></section>`;
const offlineSquad = () => block('Plantilla', empty('Sin conexión. Si hay actas de sus partidos, la plantilla aparecerá al volver la conexión.'), { id: SQUAD_ID });

// En las dos pantallas y en este orden (decisión 81 de B3). Con lazySquad (la portada), la plantilla
// no espera a las actas: el hueco que llena fillSquad, o nada si el equipo no ha jugado.
export function teamExtras(ctx, group, name, { lazySquad = false } = {}) {
  const squad = !lazySquad ? squadBlock(ctx, group, name)
    : teamFixtures(name, group, ctx.today).played === 0 ? ''
      : squadPending(ctx, group, name) ? squadSlot() : squadBlock(ctx, group, name);
  return [evolutionBlock(ctx, group, name), squad, trajectoryBlock()];
}

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

export function fillSquad(section, ctx, team, {
  load = ensureLineups, win = section.ownerDocument?.defaultView || null, when = run => afterLoad(win, run),
} = {}) {
  if (!win) return undefined;             // sin navegador (pruebas de Node): nada
  const { season, id } = team.group;
  const key = lineupsKey(season, id);
  let alive = true;
  const paint = (markup) => {
    const slot = section.querySelector(`#${SQUAD_ID}`);
    if (alive && slot && slot.isConnected) slot.outerHTML = String(markup);   // '' lo quita
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
```

- `mountTeamExtras(section, ctx, team)`: el escuchador de clics que hoy está en el mount de la ficha, sin «hacer-mi-equipo»:
  - `jugador` → `togglePlayer`;
  - `trayectoria` → `toggleTrajectory`;
  - `retry` dentro de `#trayectoria` → preventDefault, stopPropagation y `showTrajectory`;
  - `retry` dentro de `#plantilla` → preventDefault, stopPropagation y `retrySquad`.
- Restricción: nada de `globalThis` en `src/` (test_rediseno_modulos). La ventana sale de `section.ownerDocument.defaultView`.

### `/home/manolo/claude/futbol-base/src/screen-equipo.js`

- Se borran los bloques movidos y sus imports, que ya no hacen falta.
- render: `const aside = [...view.aside, ...teamExtras(ctx, group, name)];` y se quita `calendar: 'always'` de `teamView`.
- mount: se queda con `addRecent` y su escuchador solo para `hacer-mi-equipo`. Después llama a `mountTeamExtras(section, ctx, team);` y `return mountTeamView(section, ctx, team);`.
- Cabecera: los bloques de la consulta pasan a ser «los de team-extras.js, compartidos con Mi equipo».
- `needs` no cambia.

### `/home/manolo/claude/futbol-base/src/screen-home.js`

- render (A, B, C y D):

```js
const team = { group: r.group, name: r.name };
const view = teamView(ctx, team, { action: 'change', nextSeason: true, stale: r.stale || null, mine: true, shields, state });
const aside = [...view.aside, ...teamExtras(ctx, r.group, r.name, { lazySquad: true })];
return html`<section data-screen="home" data-state="${view.state}">${view.head}${teamColumns(view.main, aside, view.rest)}</section>`;
```

- mount (resolución `ok`): `mountTeamExtras(section, ctx, team); mountTeamView(section, ctx, team); return squadPending(ctx, r.group, r.name) ? fillSquad(section, ctx, team) : undefined;`
  - `mountTeamView` tiene que ir el último: la prueba de «Compartir» de la portada (test_rediseno_portada, l.~419) guarda solo el último escuchador.
- `needs` no cambia. Cabecera: «…la misma vista de la ficha, con su consulta completa (team-extras.js) y el calendario con su .ics; aquí, con «Cambiar», la caja de la temporada siguiente y el aviso stale; la plantilla no espera a las actas (fillSquad)».

### `/home/manolo/claude/futbol-base/src/team-view.js`

- `teamView`: fuera la opción `calendar` y su comentario.
- `seasonView`: `calendarHref` pasa a ser siempre `'#calendario'` y `rest` siempre `[teamCalendar(name, group, { today, shields, ics: true })]`. Se borran `CALENDAR_SLOT` y su `push`.
- `endedView`: sin `home-all`; `rest` siempre es el calendario con su .ics. Se actualiza su comentario: «ni en la ficha ni en Mi equipo hay «Ver toda la temporada»: el calendario completo ya está en la página».
- Se borran `WIDE` y `wideCalendar`.
- `mountTeamView(section, ctx, team)`: sin opciones. Siempre atiende `calendario-equipo` y devuelve undefined. Se actualizan su comentario, el de `teamColumns`, el de `lastFiveBlock` y el de la cabecera.
- `teamCalendar` conserva `ics`, con el comentario «con `ics` (las dos pantallas)».

### `/home/manolo/claude/futbol-base/acta.css`

- Se borra la regla `.home-all {…}` (l.663-675) y el selector `a.home-all:hover` de `@media (hover: hover)` (l.695). Se queda `a.summer-row:hover .summer-main`.
- Comentario de `.cal`: «en Mi equipo y en la ficha, siempre y a cualquier ancho, en render (con su .ics); en móvil, al final».
- No hay clases nuevas: `team-loading`, `block`, `empty` y las de la plantilla ya existen.

### `/home/manolo/claude/futbol-base/sw.js`

- `'./src/team-extras.js',` detrás de `'./src/team-view.js'` en `STATIC_ASSETS`. test_sw_fixes exige exactamente el grafo de imports de app.js.

### `/home/manolo/claude/futbol-base/index.html`

- `python3 scripts/codigo.py` tras cada cambio en `src/*.js` o `acta.css`. Nada más.

## 3. Pruebas

### 3.1 Actualizar (líneas comprobadas)

**`/home/manolo/claude/futbol-base/scripts/tests/test_rediseno_equipo.mjs`**
- l.15: `import { screen } from '../../src/screen-equipo.js';` y `import { playerDetail, pointsNote, trajectoryContent } from '../../src/team-extras.js';`
- Ninguna otra línea. Si algo más falla, la ficha ha cambiado y es un error.

**`/home/manolo/claude/futbol-base/scripts/tests/test_rediseno_vista_equipo.mjs`**
- l.1-5 y l.25: fuera «la portada pinta lo mismo / no cambia». Pasa a «la portada es la vista de la ficha con su cabecera: lo fijan sus huellas».
- l.75, título: «la portada pinta, byte a byte, lo que fijan sus huellas en A, B, C, D, E y X».
- Bloque «en claro» (l.80-88), se añade:
  - A: `#calendario` con 26 `a.match-row` y `data-action="calendario-equipo"`; títulos de la consulta: Clasificación, Goleadores del equipo, La temporada en cifras, Evolución de puntos, Plantilla, Trayectoria; `data-slot="plantilla"` y `aria-busy="true"`.
  - B: consulta Clasificación y Trayectoria, sin «Plantilla».
  - D: sin `home-all` y con el calendario.
- l.171-175: se sustituye. Con las opciones de la portada (`action: 'change'`), `rest.length === 1` y `main[1]` con `href="#calendario"`.
- l.191-198 (la D de la portada): fuera `home-all` y `rest []`. Se espera `portada.rest[0]` con `^<section class="block" id="calendario">` y `doesNotMatch(/home-all/)`.
- l.229 y l.235: título sin «sin calendario de escritorio»; llamada `mountTeamView(section, ctx, team)`.
- l.291: `opts` sin `calendar: 'wide'`.
- Las demás `calendar: 'always'` del fichero se quitan (ya no hacen nada).
- Huellas: ver 3.3.

**`/home/manolo/claude/futbol-base/scripts/tests/test_rediseno_portada.mjs`**
- l.172: `href="#calendario"`.
- l.272: `assert.doesNotMatch(out, /2025-2026|2025\/26/)`. Los enlaces del calendario llevan `Jornada%2025`.
- l.349: `` `Cambiar</a></header>${aviso}<div class="home-cols has-rest">` ``.
- l.380: el escapado se comprueba en el enlace de su fila de la clasificación: `/t=MESAS%2C%20U\.D\.%20LAS%20%22B%22%20%3Cx%3E"/`.
- l.635-637: «D sin «Ver toda la temporada»: el calendario ya está en la portada»: `doesNotMatch(/home-all/)` y `match(/<section class="block" id="calendario">/)`.
- l.662-683: se reescribe con el `columnsOf` de tres partes (el de test_rediseno_equipo, l.26-29):
  - A: main [Próximo partido, Últimos cinco]; consulta [Clasificación, Goleadores del equipo, La temporada en cifras, Evolución de puntos, Plantilla, Trayectoria]; rest [Calendario];
  - B: main [Próximo partido]; consulta [Clasificación, Trayectoria]; rest [Calendario];
  - D: main [Temporada 2026/27, Así terminó 2025/26, Verano: Maspalomas Cup 2026]; consulta [Clasificación final, Evolución de puntos, Plantilla, Trayectoria];
  - ni `data-slot="calendario"` ni `home-all`.
- l.706-708: fuera `decl('.home-all')`. La l.710 se queda, con el mensaje «se pinta en render, no se esconde».

**`/home/manolo/claude/futbol-base/scripts/tests/test_presupuesto.mjs`**
- l.103: el texto nuevo de la línea de CLS (ver 4).

**Sin cambios previstos:** test_rediseno_home.mjs, test_rediseno_router.mjs, test_rediseno_smoke.mjs (salvo el caso nuevo de 3.2), test_sw_fixes.mjs, test_rediseno_modulos.mjs y test_rediseno_config.mjs. La metaprueba las repite con 2026/27, y las nuevas usan `ctxFor` como las demás.

### 3.2 Pruebas nuevas

**`/home/manolo/claude/futbol-base/scripts/tests/test_rediseno_portada_ficha.mjs`** (nuevo; helpers de `fixtures/rediseno`: `ctxFor`, `datasetsFrom`, `datasetsFor`, `goleadores`, `seasonLineups`, `groupLineups`, `fakeSection`):

1. **La portada es la ficha de mi equipo con otra cabecera.** En A (01/03/2026), en C (03/06/2026) y en «D con 2026/27 lista», con `lineups: { '2025-2026/PG2': {} }`, la subcadena `<div class="home-cols has-rest">…</div>` de la portada es idéntica a la de la ficha `#/equipo?s=2025-2026&g=PG2&t=Las Mesas Hu.`. La cabecera lleva «Cambiar» y ni «‹» ni `hacer-mi-equipo`.
2. **Plantilla sin esperar.** Mi equipo es Guayarmina en A1, el 01/03/2026 (estado A, 10 jugados; comprobado con las fixtures):
   - `lineups` undefined → hueco (`id="plantilla" data-slot="plantilla" aria-busy="true"`, «Cargando la plantilla…»);
   - `null` → el mismo hueco, nunca la caja de error en render;
   - `{}` → nada;
   - con `seasonLineups('2025-2026')` → `<table class="squad">`, idéntica al bloque de la ficha;
   - B (2026/27 simulada) → ni hueco ni bloque aunque el grupo tenga actas.
3. **`needs` no pide actas.** `screen.needs({}, { health, lineups: {} })` da `[]`. Sin health, una sola carga, y un `fetch` simulado no recibe ninguna URL de `data-lineups-`.
4. **`fillSquad` espera a `when`.** Con un `when` que guarda la función, `load` no se llama hasta ejecutarla.
5. **`fillSquad` con datos.** `fakeSection('home', { plantilla: hueco })`, `load` falso → el bloque es el de render con actas; `datasets.lineups[key]` guardado; `page.focus.el === null`.
6. **`fillSquad` con `{}`.** `page.block('plantilla') === null` y `datasets` vale `{}`.
7. **Error con «Reintentar».** `load` da `null` con `onLine: true` → caja de error. Después `screen.mount` y `clickIn('plantilla', { 'data-action': 'retry' })` con `fetch` simulado (503 y luego 200): `prevented` y `stopped` a true, tabla en su sitio y foco en el título (el patrón de test_rediseno_equipo, l.561-612).
8. **Sin conexión.** `win = { navigator: { onLine: false }, addEventListener, removeEventListener }`, `load` da `null` → bloque con «Sin conexión…», sin `role="alert"` ni `data-action="retry"`. Después `onLine = true`, se dispara `online`, `load` se llama otra vez y aparece la tabla.
9. **Tras salir de la portada.** Se llama a la limpieza antes de que `load` responda: no pinta nada, pero `datasets` queda guardado. Con el bloque desconectado (`isConnected = false`), no pinta. El escuchador `online` queda quitado.
10. **mount de punta a punta.** `fakeSection` con `ownerDocument.defaultView` falso (`readyState: 'complete'`, `requestIdleCallback` → `setImmediate`); `screen.mount` devuelve una función; el hueco se llena con `ensureLineups` real y `fetch` simulado. Va al final del fichero, porque `ensureLineups` memoriza los éxitos por proceso.
11. **mount: jugador y trayectoria.** `jugador` despliega `tr.squad-detail`; «Ver la trayectoria» carga su panel, y su «Reintentar» lleva preventDefault y stopPropagation (el patrón de test_rediseno_equipo, l.501-539).
12. **Cada clase de la portada existe en `acta.css`.** Con hueco, con tabla, con el vacío sin conexión y con la caja de error.

**`/home/manolo/claude/futbol-base/scripts/tests/fixtures/rediseno/fake-browser.mjs`**
- `fakeSection(screenId, blocks, { view = null } = {})` → `section.ownerDocument = view ? { defaultView: view } : undefined`. Es para la prueba 10; las demás llamadas no cambian.

**`/home/manolo/claude/futbol-base/scripts/tests/test_rediseno_smoke.mjs`**
- Caso nuevo: la portada con la caja de error dentro de `#plantilla` falla con el mensaje propio de 4.1, no con el genérico.

### 3.3 Huellas (17 casos de HOME; procedimiento de B3 y B5)

1. Implementar y dejar en verde primero las aserciones legibles (el bloque «en claro» ampliado y las pruebas nuevas).
2. Calcular las 17 huellas de una vez con un guion fuera del repo, construido desde el test actual:

```bash
S=/tmp/mi-equipo; R=/home/manolo/claude/futbol-base; mkdir -p $S
N=$(grep -n '^test(' $R/scripts/tests/test_rediseno_vista_equipo.mjs | head -1 | cut -d: -f1)
{ sed -n "1,$((N-1))p" $R/scripts/tests/test_rediseno_vista_equipo.mjs \
    | sed "s#from '\./#from '$R/scripts/tests/#g; s#from '\.\./\.\./src/#from '$R/src/#g"
  echo "for (const [n, [o, h]] of Object.entries(HOME)) { const now = createHash('sha1').update(s(home.render(homeCtx(o)))).digest('hex'); console.log(now === h ? 'igual ' : 'CAMBIA', n, now); }"
} > $S/huellas.mjs && node $S/huellas.mjs
```

3. Se esperan 15 `CAMBIA` y 2 `igual` (E y X, que no pasan por la vista de equipo). Si E o X cambian, hay un error. Se sustituyen solo las 15.
4. Línea de comentario debajo de la de «2026-10» (l.53-54): «2026-10-04: todos salvo E y X, con lo de la ficha: el calendario completo siempre (#calendario y su .ics), la evolución de puntos, el hueco de la plantilla (homeCtx no trae actas) y la trayectoria; E y X no pasan por la vista de equipo y siguen idénticos.»
5. `python3 scripts/codigo.py` y las suites. El commit (lo hace el coordinador) tiene que decir que se recalcularon 15 huellas y por qué.

## 4. Smokes y herramientas

**4.1 `/home/manolo/claude/futbol-base/scripts/tests/render-smoke.mjs`**
- `checkRenderedDom`: antes de buscar `data-action="retry"`, se aparta la sección `id="plantilla"`. Si el retry está dentro, el fallo es «la Plantilla de la portada no pudo cargar las actas de su grupo»; fuera, el mensaje de siempre.
- `fixtureStateD`: antes de `page.content()`, esperar a `!document.querySelector('#contenido [data-slot]')`. Añadir a `wanted` 'Evolución de puntos', 'Trayectoria' y 'Calendario'.
- El coordinador vuelve a tomar «el DOM de la base» antes de tocar `src/` (procedimiento de B5: `node scripts/tests/render-smoke.mjs | sed -nE 's/^PASS: render smoke OK .*\(DOM ([0-9]+) bytes\)$/\1/p' > $S/dom-base.txt`). Después del cambio crecerá (estado B real: calendario y trayectoria); no hay petición de actas porque hoy Las Mesas no ha jugado.

**4.2 `/home/manolo/claude/futbol-base/scripts/tests/fixture-site.mjs`**
- `useWorld(context, name, { fail = [], myTeam } = {})`: con `myTeam`, sustituye al del mundo (el mismo `addInitScript` con `STORE_KEY`).

**4.3 `/home/manolo/claude/futbol-base/scripts/tests/interaction-smoke.mjs`**
- Comentario de cabecera (l.37-38): fuera «el calendario de escritorio de la portada».
- Escenario 1 (l.181-190), a los 4 anchos:
  - `#contenido .home-rest #calendario` con 26 `a.match-row`, el contexto «26 partidos» y `button[data-action="calendario-equipo"]`; ningún `[data-slot="calendario"]`;
  - por debajo de 1024 px, el calendario empieza debajo del final de `.home-side`; desde 1024, su `left` es menor que el de `.home-side`.
- Antes de cada `checkLayout` de la portada (escenario 1 y `homeStates`), esperar a `!document.querySelector('#contenido [data-slot]')`. En el mundo A, PG2 da 404 y el hueco se va.
- Línea PASS (l.581): «…calendario completo de la portada a todos los anchos (al final en móvil, a la izquierda en escritorio)…».
- Escenario nuevo `homeSquad()`, a 390 px en claro, mundo A con `myTeam` Guayarmina (A1). La respuesta de `data-lineups-2025-2026-A1.js` queda retenida con una compuerta:
  - con las actas retenidas, la portada ya está en A con h1 «Guayarmina» y «Próximo partido», y con `#plantilla[data-slot][aria-busy="true"]` y «Cargando la plantilla…». Eso demuestra que no bloquea;
  - se abre la compuerta con un 503 → `#plantilla .error-box`, sin cambio de `activeElement`;
  - el `retry()` de `retryBlocks` → `table.squad`, mismo desplazamiento, «sin repintar», sin entradas nuevas en el historial y foco en el título;
  - jugador → `tr.squad-detail`; trayectoria → `#trayectoria a.traj-row`;
  - Jornada por la barra y Mi equipo por la barra → `table.squad` ya en el pintado, sin `[data-slot]`;
  - sin conexión, en una página nueva con la compuerta cerrada: `context.setOffline(true)`, después `route.abort('internetdisconnected')` → `#plantilla .empty` «Sin conexión…», sin `.error-box` ni `[role=alert]` en `#plantilla`. Con `context.setOffline(false)` vuelve `table.squad`;
  - sin errores de JS.
  - Línea PASS propia.

**4.4 `/home/manolo/claude/futbol-base/scripts/tests/pwa-smoke.mjs`**
- En los tres servidores (l.~133, l.~288 y l.~444): un `data-lineups-<S>-<grupo>.js` sin fixture es un 404 esperado, sin `console.error`. Se usa la expresión `/^data-lineups-\d{4}-\d{4}-[A-Za-z0-9]+\.js$/`, como en Pages para un grupo sin actas.
- Paso 6 (sin conexión), tras `HOME`:
  - esperar a `!document.querySelector('#contenido [data-slot]')`;
  - `#contenido .error-box` vale 0;
  - si hay `#plantilla`, su texto empieza por «Sin conexión»;
  - `errors` vacío.
- `dataDeploy`, después de la ficha con «b» sin conexión: `addInitScript` con mi equipo Unión Viera en A1. Se abre `#/` sin conexión, se espera a que se resuelva el hueco y se comprueba `#plantilla table.squad`: las actas que el SW de «b» heredó (`lineupsToCarry`). Se añade al texto de su PASS.

**4.5 `/home/manolo/claude/futbol-base/scripts/tests/capturas.mjs`**
- Antes de `fit()`, esperar a `!document.querySelector('#contenido [data-slot]')`.
- Opción `myTeam` pasada a `useWorld`.
- Captura nueva: `['portada-plantilla', 'D', '#/', ['home', 'D'], { myTeam: { name: 'Guayarmina', season: '2025-2026', cat: 'benjamin', groupId: 'A1' }, act: OPEN_SQUAD_AND_TRAJECTORY }]`.

**4.6 `/home/manolo/claude/futbol-base/scripts/tests/presupuesto.mjs`** (fuera de CI)
- `coldPage(..., { world, myTeam })`.
- En `measureCls`: condición «lista» = `homeReady() && !document.querySelector('#contenido [data-slot]')`. Una segunda variante por dispositivo con Guayarmina (A1, 102 KB de actas); se toma el máximo.
- Línea del informe: «máximo de N, mundo A (Las Mesas, sin actas, y Guayarmina, A1 con actas)». Se actualiza test_presupuesto, l.103.

## 5. Documentación

**`/home/manolo/claude/futbol-base/docs/superpowers/specs/2026-09-23-rediseno-acta-design.md`**: notas en cursiva, al estilo B5.
- §4.2, tras el párrafo inicial: «(Nota: desde octubre de 2026, debajo de lo de cada estado van la evolución de puntos, la plantilla, la trayectoria y el calendario completo de la ficha (§4.6), en su orden; véase el punto 13.)»
- §4.2 A, en «calendario completo»: es el ancla `#calendario` de la portada.
- §4.2 D, en «Ver toda la temporada»: retirado.
- §4.6, en «Mismo esqueleto… Además»: a la ficha solo le quedan «‹», «Hacer mi equipo» y «Vistos hace poco».
- §4.8, en «En móvil, el calendario completo no está en la portada»: ya no es así; en móvil va al final y la derecha suma evolución, plantilla y trayectoria.
- §4.11: la evolución y el .ics también en Mi equipo.
- Adenda, punto 13 nuevo, «Mi equipo, con todo lo de la ficha» (§4.2, §4.6, §4.8 y §4.11): petición del usuario (4/10/2026); D1 a D7 en una línea cada una, con la referencia a este plan. El coordinador puede guardarlo como `docs/superpowers/plans/2026-10-04-plan-mi-equipo-completo.md`.

## 6. Orden de trabajo y verificación

0. **Base:** todas las suites en verde, `$S/dom-base.txt` y, si da tiempo, `node scripts/tests/presupuesto.mjs --runs 3` como base.
1. **Extraer `team-extras.js`** (traslado puro; la ficha queda igual) + `sw.js` + import de test_rediseno_equipo → `codigo.py` → `node --test scripts/tests/test_*.mjs` en verde, sin tocar ninguna huella.
2. **Escribir primero las pruebas nuevas** de 3.2 (fallan), y después `screen-home.js`, `team-view.js` (fuera `'wide'`), `acta.css` y la parte nueva de `team-extras.js` → `codigo.py`.
3. **Actualizar las pruebas** de 3.1 y las huellas (3.3).
4. **Smokes y herramientas** (sección 4).
5. **Documentación** (sección 5).
6. **Verificación completa:**

```bash
cd /home/manolo/claude/futbol-base
python3 scripts/codigo.py && python3 scripts/codigo.py --check
node --test scripts/tests/test_*.mjs
python3 -m pytest -q
node scripts/tests/render-smoke.mjs
node scripts/tests/interaction-smoke.mjs
node scripts/tests/pwa-smoke.mjs
node scripts/tests/presupuesto.mjs --runs 3   # portada < 3000 ms, LCP < 3000, CLS < 0,1; comparar con la base
OUT=/tmp/mi-equipo-capturas node scripts/tests/capturas.mjs
cp /tmp/mi-equipo-capturas/portada-B-390-claro.png /tmp/mi-equipo-B-390.png
cp /tmp/mi-equipo-capturas/portada-D-390-claro.png /tmp/mi-equipo-D-390.png
cp /tmp/mi-equipo-capturas/portada-plantilla-390-claro.png /tmp/mi-equipo-plantilla-390.png
cp /tmp/mi-equipo-capturas/portada-D-1440-claro.png /tmp/mi-equipo-D-1440.png
```

7. **Revisión visual:** abrir cada PNG antes de dar nada por bueno.
   - **B:** «Próximo partido», el vacío, la clasificación a cero, «Trayectoria» y el calendario con el botón .ics, al final.
   - **D:** caja 2026/27, «Así terminó», «Verano», «Clasificación final», «Evolución de puntos», «Trayectoria» y el calendario; sin «Ver toda la temporada» y sin hueco colgado.
   - **Plantilla:** la tabla con un jugador desplegado y la trayectoria abierta.
   - **1440:** el calendario a la izquierda.
   - Enviar al usuario las tres de 390 px con SendUserFile; sigue la sesión desde el móvil.
8. **Commit:** lo hace el coordinador, diciendo que se recalcularon 15 huellas. No ejecutar `publicar.py`.

## 7. Riesgos

- **Largo en móvil:** la portada pasa de unos 2.000 a unos 4.250 px, y de 368 a unos 690 nodos, por debajo del aviso de 800 de Lighthouse. Lo de arriba no cambia.
- **Plantilla de Las Mesas:** nada hasta que haya actas de PG2 2026/27, y la federación oculta nombres de sus jugadores.
- **Primera visita:** las actas que pide la portada antes de que el SW tome el mando no quedan en caché hasta la apertura siguiente con conexión (D8).
- **Sin conexión en un grupo sin actas:** sale el vacío «Sin conexión…» aunque luego, con conexión, no haya plantilla. Es honesto («si hay actas») y se corrige solo con el evento `online`.
- **La ficha de mi equipo queda casi igual que la portada:** solo cambia la cabecera. Es a propósito.

## 8. Después de construirlo (revisión del 4/10/2026)

El plan de arriba es el que se construyó en `7d7fbe3` y no se reescribe; esto es lo que cambió después.

- **Desviación al construirlo:** en `interaction-smoke.mjs`, la comprobación de «Reintentar» en su sitio salió a una función común, `retryInPlace`, que usan `retryBlocks` y `homeSquad`.
- **«calendario completo», arriba de la ventana:** el ancla interna (`onClick` de `src/router.js`) hacía un `focus()` a secas, que centra lo que no cabe. En la portada a 390 px el calendario mide unos 1.800 px, así que su título y su `.ics` quedaban por encima de la vista, cuando antes el enlace llevaba a la ficha y `place()` hacía `scrollIntoView()`. Ahora el foco va con `preventScroll` y después `scrollIntoView({ block: 'start' })`, en la portada y en la ficha.
- **D8, primer punto, revocado: el hueco de la plantilla compensa el desplazamiento.** El hueco sí aparece con la página bajada: se toca «calendario completo» mientras llegan las actas. Y Safari no trae el anclaje del desplazamiento, así que el calendario bajaba unos 520 px al llegar la tabla de A1 y subía unos 64 px al quitarse el hueco en un grupo sin actas. Si el hueco ya quedó por encima de la ventana, `fillSquad` desplaza la página lo que se movió lo primero que se ve tras él (`anchorAfter`). Si el navegador ya lo compensó, no queda nada que mover. La spec lo anota en §7 y en el punto 13.
- **El foco tras el «Reintentar» de la trayectoria:** el botón salía del DOM y el foco caía en `<body>`. Ahora va al título del bloque, como en `retryBlock`, si estaba dentro del panel.
- **`afterLoad`, comentario y pruebas:** en la primera apertura en frío, la portada espera a `data-health.json`, que con `fetch` no retrasa `load`. Así que se pinta con la página ya cargada, solo queda la espera al navegador libre, y las actas pueden coincidir con los escudos que aún bajan. El comentario ya lo dice. Las ramas de `load` y de `setTimeout` (sin `requestIdleCallback`) tienen ahora sus pruebas.
- **Spec:** §4.10 anota la excepción de la plantilla de Mi equipo sin conexión, y el punto 13 cita §4.10 y §7.
