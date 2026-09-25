# Plan B2: corte y pantallas principales del rediseño «Acta»

> **Para agentes:** SUB-SKILL OBLIGATORIA: usar superpowers:subagent-driven-development (recomendado) o superpowers:executing-plans para ejecutar este plan tarea a tarea. Los pasos usan casillas (`- [ ]`).

**Objetivo:** pasar la app al diseño «Acta».
- El **corte** sustituye la app vieja por el esqueleto nuevo, en un solo commit con todas las suites en verde.
- Encima se construyen el **shell**, el **router** y las cuatro **pantallas principales**: Mi equipo (estados A a E y X), Jornada, Tabla y Partido.
- Las rutas de B3 (Explorar, Equipo, Ligas, Copa, Goleadores, Temporadas, Récords, Fuentes y Ajustes) llevan de momento una pantalla provisional honesta.
- Al final, las pruebas de navegador de B2 (spec §11) y 45 capturas para el usuario.

**Arquitectura** (spec §5.1 y §5.2):
- Módulos ES planos en `src/`, importados de forma estática y sin ciclos. Ninguno toca el navegador al importarse: `index.html` llama a `start(document, window)` de `app.js` cuando han llegado los datos inmediatos.
- El router pinta pantallas con el contrato `{ id, needs, render, mount }`:
  - `render(ctx)` es puro y devuelve `Html`;
  - el pintado solo ocurre si su token de navegación sigue vigente.
- Los datos entran por un registro (`datasets`), con los globales inmediatos y lo que traen los cargadores perezosos de `state.js`. `createModel(datasets, { portalSeason, buildClubIndex })` (`model.js`) da acceso memoizado a temporadas, torneos, índice de clubes y goleadores.
- La URL es la fuente de verdad; el almacén v2 guarda mi equipo y los vistos, y la sesión, el último destino principal.

**Stack:** JavaScript ES2022 sin compilación, `node --test` (Node 22), Playwright 1.58 + el Chrome del sistema para los smoke y las capturas, y Python 3 para el bot y sus pruebas.

**Spec:** `docs/superpowers/specs/2026-09-23-rediseno-acta-design.md` (§3, §4.1-§4.5, §4.8-§4.11, §5, §7, §8, §11 y §12.2-§12.3). El plan B1 (`docs/superpowers/plans/2026-09-23-plan-b1-cimientos.md`) fija los contratos de los módulos puros, y su sección «Para B2 y siguientes» es requisito de este plan.

**Cómo se verificó:** el plan se ejecutó entero, tal como está escrito, en un clon desechable de `main` (31a15b8) con la rama `rediseno-acta`: cada bloque se extrajo del propio plan, cada salida se comparó con su «Esperado» y cada tarea terminó en su commit, con las suites en verde y, desde la Tarea 4, los tres smoke. Las salidas son las reales del 24/09/2026; solo el tamaño del DOM de `render-smoke` cambia con los datos del día. Tras cada una de las dos rondas de la revisión adversarial se aplicaron sus arreglos (decisiones 115 a 131) y se repitió la pasada entera.

## Restricciones globales

- **Rama y publicación.**
  - Todo el plan va en la rama `rediseno-acta`, creada desde `main`, que tiene B1 y la reparación A2.
  - **Nada de este plan se fusiona en `main`:** el Plan B se publica de una vez en B5 (spec §2 y §12).
  - Para el CI se abre un **PR borrador** hacia `main`, porque `tests.yml` no corre en push a otras ramas.
  - **Nunca se hace push mientras corre un workflow** (`gh run list --limit 3`).
- **Cada tarea termina en un commit con todo en verde:**
  - `python3 -m pytest scripts/tests/ -q`;
  - `node --test scripts/tests/test_*.mjs`;
  - **desde el corte (Tarea 4)**, además, `node scripts/tests/render-smoke.mjs`, `node scripts/tests/interaction-smoke.mjs` y `node scripts/tests/pwa-smoke.mjs` (este, con el paso desde la app anterior y su SW de verdad).

  Antes del corte (Tareas 1-3) solo se exigen las suites unitarias: el `interaction-smoke` del diseño viejo falla una de cada cuatro veces en `main` 31a15b8 (su escenario de Atrás y Adelante) y el corte lo sustituye. El bot (`update.yml`, `fetch-fiflp.yml` y `fetch-fiflp-actas.yml`) ejecuta pytest y node antes de comitear, y se para en rojo en silencio.
- **Navegador.** Los smoke, las vistas previas y las capturas usan el Chrome del sistema y Playwright 1.58 en `node_modules/`, sin guardarlo en el repo: `npm install --no-save --package-lock=false playwright@1.58.0`, como `tests.yml`. La Tarea 4 lo instala si falta. Los smoke son deterministas: cada paso espera a su condición (`waitForAsync` o el propio localizador), nunca un tiempo fijo.
- **Fuera del repo.** Las vistas previas de las Tareas 5 a 12 y las capturas de la 13 se escriben en `S=/tmp/claude-1000/-home-manolo/db6fd8e0-f1e7-4e94-b6cd-ef7dd5bf6ae9/scratchpad/planB2` (cada bloque lo crea si falta). En otra sesión se cambia por un directorio propio: solo cambian las rutas de las salidas.
- **Compatibilidad con el bot** (`generate_js.py` y `source_health.py`). `index.html` conserva:
  - al menos un `?v=\d{8}[a-z]?`;
  - el script `data-seasons.js?v=…`;
  - el literal oculto `<span id="legacyUpdated" hidden>Última actualización: DD/MM/AAAA</span>`.

  En `sw.js`, `CACHE_NAME` sigue en la línea 1 con la forma `futbolbase-v…`. El contrato de `sw.js` de §5.5 no cambia. `test_index_bot_contract.py` (Tarea 4) ejecuta de verdad el bot sobre copias del `index.html` y el `sw.js` reales.
- **`src/` plano y sin `import()` dinámico.** Ningún módulo toca `document`, `window` ni `localStorage` **al importarse**, `app.js` incluido: solo dentro de funciones. Sin ciclos de imports. `render(ctx)` de cada pantalla es puro, síncrono y usable en Node con fixtures. Lo comprueba `test_rediseno_modulos.mjs` (Tarea 4), sin excepciones.
- **Datos:**
  - los globales `data-*` se leen con identificador desnudo y `typeof`, solo en `state.js`;
  - los ficheros perezosos, con `fetch` + expresión regular + `JSON.parse`, con un único vuelo por petición y sin memorizar un fallo;
  - los perezosos toman `?v=` de `script[src*="data-seasons.js"]` (`dataVersion()`) y se cortan a los 15 s (`fetchData`): nada espera para siempre.
- **Pruebas nuevas:**
  - los ficheros `scripts/tests/test_rediseno_*.mjs` usan solo las fixtures congeladas de `scripts/tests/fixtures/rediseno/` y un `today` inyectado;
  - nunca leen los `data-*.js` ni `src/config.js` vivos, salvo la primera pasada de `render-smoke`, que sirve los datos reales con marcadores independientes del estado (spec §11). `pwa-smoke` sirve a sus dos versiones datos y `config.js` congelados (decisión 130), y `test_rediseno_config.mjs` ejecuta las pruebas de Node con un `config.js` de 2026/27 (decisión 129);
  - las pruebas de navegador de la Tarea 13 y las capturas sirven la app real con los «mundos» de `fixture-site.mjs`: datos congelados, un `PORTAL` fijo y el reloj de Playwright.
- **Sistema visual** (spec §3, en `acta.css` desde el corte):
  - tokens exactos;
  - Public Sans;
  - `tabular-nums`;
  - etiquetas en frase normal;
  - resalte propio sin óvalo;
  - G/E/P y Local/Visitante;
  - todo lo pulsable es `a` o `button` de al menos 44 px;
  - sin desplazamiento horizontal a 320 px;
  - fechas y horas en `Atlantic/Canary`, con los nombres de días y meses escritos en el código: nada de lo que se ve depende de los datos de idioma del motor.
- **Escudos:** solo búsqueda exacta o normalizada (`shieldFile`), nunca por subcadena. Miniatura → original → monograma, con el escuchador de errores en captura desde antes del primer pintado.
- **Guiones de edición.** Las Tareas 2 a 4 editan pruebas y módulos con guiones que localizan texto exacto de `main` 31a15b8. Si no lo encuentran, se paran con un `AssertionError` sin escribir el fichero: hay que revisar a mano qué cambió.
- **Mensajes de commit:**
  - en español;
  - terminados en `Co-Authored-By: <modelo que lo escribe> <noreply@anthropic.com>` y `Claude-Session: https://claude.ai/code/session_01Sg56KK3oZgo8Ye7Snj6wG9` (los bloques del plan llevan `Claude Opus 5.5 (1M context)`);
  - con `git add` de rutas explícitas, nunca `HANDOFF.md` ni `docs/mejoras-2026-09.md`.
- **Recuentos de pruebas:** los del fichero nuevo, y «el recuento anterior más N, sin fallos» para la suite.

## Decisiones que interpretan la spec

Cada una, con su coste si fuera errónea y la tarea que la prueba.

### Del esqueleto

1. **Funciones heredadas de `state.js` sin papel en la spec.** Se quedan las puras que no leen `S`, `FEATURED` ni el DOM: `jornadaLabel`, `validJorGroup`, `knockoutRoundsSource`, `phaseIcon`, `groupJornadaLabel`, `unifiedPrebenLeagueGroups`, `getPhases`, `countStats` y `countMatches`. Las que leían `S` lo reciben por parámetro (`getPhases(groups)`, `countStats(season, cat)`), e `isHistorical()` desaparece. Coste: funciones sin uso que B3 puede borrar. (Tarea 4)
2. **Firmas que cambian (§5.2):** `getData(season, cat)`, `withSeasonCup(groups, season, cat)` (ahora exportada) y `teamScorers(gol, team)`, antes `featuredScorersFrom`. Se eliminan, con sus pruebas, `isFeatured`, `featuredStandingFrom`, `featuredMatchesFrom` y `getTeamForm`, que el modelo ya cubre (`sameClub`, `Group.standings`, `teamFixtures` y `lastResults`). Coste: B3 las recrea si las necesita. (Tarea 4)
3. **`sourceInfo` devuelve datos, no HTML:** `sourceInfo(group, historical)`, en `model.js`, da `{ kind: 'oficial' | 'calculada' | 'corregida', source, url }`, y la pantalla Tabla lo pinta. Coste: un texto por caso en la Tabla. (Tareas 3 y 10)
4. **«Hoy»** es `canaryTodayISO(now = new Date(), timeZone = 'Atlantic/Canary')`, en `links.js`, con `Intl.DateTimeFormat('en-CA', { timeZone })`. Sustituye a `localTodayISO`. Es un reloj único: `app.js` lo pone en el `ctx` de cada pintado. Coste: ninguno; las pantallas nunca leen el reloj. (Tareas 2, 6 y 7)
5. **Carga inmediata en el corte:** los mismos 9 `data-*.js` de hoy, y en el mismo orden. El paso a `defer`, la carga perezosa de `data-stats.js` y `data-maspalomas-cup-2026.js` y la baja de `data-matchdetail-keys.js` son de B4 (§12.5). En B2, `dataVersion()` ya lee `data-seasons.js` en todos los perezosos. Coste: el primer pintado espera a los 9 ficheros, como hoy. (Tareas 2 y 4)
6. **Pantallas de B3 durante B2:** sus rutas pintan una pantalla provisional (`screen-pendiente.js`), con `h1` y el vacío «Esta pantalla llega en la próxima fase del rediseño.». Así ningún enlace de B2 lleva a una pantalla rota. Nunca se publica: el Plan B se publica completo en B5. Coste: ninguno fuera de la rama. (Tareas 6 y 13)
7. **`CACHE_NAME` y `?v=`** no se tocan en B2: la subida conjunta es del despliegue de B4 y B5 (§5.5). Coste: ninguno mientras la rama no se publique.
8. **Rebase de la rama:** el bot comitea en `main` `index.html`, `sw.js` y `data-*`. Al rebasar, en `index.html` y `sw.js` se queda la estructura de la rama con las marcas de versión de `main` (`?v=`, «Última actualización» y `CACHE_NAME`). Lo hace `scripts/sync_versions.py`, con el procedimiento en `docs/rediseno-rebase.md`. Coste: un paso más en cada rebase. (Tarea 1)

### Del controlador

9. **Convención de `needs(params, datasets, { portalSeason })` → `Promise[]`.** La temporada del portal llega del router, con la del contexto (decisión 129). Cada promesa guarda lo que carga en `datasets`. Rechaza con `Error(<qué>)`, en frase normal («la temporada 2024/25»), solo si la pantalla no puede pintarse sin ese dato (Jornada, Tabla y la temporada pasada de un Partido): el router pinta entonces la caja de error de la pantalla con «Reintentar». Lo opcional (la cronología y las actas de Partido, `data-health.json` en la portada) **resuelve siempre**: el dato queda en `datasets` o a `null`, y el bloque que lo necesita pinta su propia caja. Coste: dos caminos de error que probar. (Tareas 6, 7, 9, 10 y 11)
10. **Tabla sin ancho:** `render` no conoce el ancho de la ventana; pinta los dos selectores y la tabla con todas las columnas, y el CSS decide qué se ve. Coste: un poco de HTML de más en móvil. (Tarea 10)
11. **Piezas compartidas, una sola vez**, en la primera tarea que las necesita: `screenHead` y `backLink` (`ui.js`), `seasonLabel` (`model.js`) y el CSS de `.screen-head` en la Tarea 4; `errorBox` y `errorScreen` (`shell.js`) en la 5; `findRound` y `findMatch` (`model.js`) en la 6; `shareLink`, `copyText` y las fechas en castellano (`links.js`) en la 7; `seasonNeeds` (`state.js`) y `myTeamIn` (`myteam.js`) en la 9; `actaFor` (`model.js`) en la 11. `teamScorers` (`state.js`, Tarea 4), `sourceInfo` (`model.js`, Tarea 3) y `datasetsFrom` (fixtures, Tarea 3) también son únicas. Coste: mover una función de módulo.
12. **`ensureLineups(season)` resuelve `{}` ante un 404** (no hay fichero si la temporada no tiene actas: 2026/27 al empezar); cualquier otro fallo sigue dando `null` y caja de error. Se ajusta su prueba en `test_festate_fixes.mjs`. Coste: un fichero de actas perdido en un despliegue a medias diría «La federación no ha publicado el acta» durante esa sesión. (Tarea 11)
13. **`createModel` no memoriza un `null`:** una temporada pasada aún sin cargar se vuelve a pedir cuando `needs` la deja en `datasets.seasonRaw`. Coste: ninguno. (Tarea 3)
14. **`screenHead` vive en `ui.js`**: es un componente puro que usan los `render(ctx)`; `shell.js` lo importa para `errorScreen`. Coste: mover una función de módulo. (Tareas 4 y 5)
15. **Contratos del marco y del router:** `renderHeader({ active, current })`, `updateTabbar(active, current, doc)`, `ctx.backHref`, `startRouter` → `{ nav, idle, current }` con `actions` y `session`, `src/screens.js` (registro de pantallas) y `myTeamToSave` (= `updatedMyTeam` más la guardia M3). Coste: firmas distintas de las del esqueleto. (Tareas 5, 6 y 12)
16. **`ctx.legacyDate`** (opcional: la fecha del literal «Última actualización») y **el ancla `#buscar`** de «Cambiar» se aceptan. Coste: un campo más en el `ctx`. (Tareas 6 y 8)
17. **Sin ciclos de imports:** `myteam.js` importa de `model.js`, así que `createModel` recibe `buildClubIndex` inyectado y `model.js` no importa de `myteam.js`. `clubIndex()` lanza `TypeError` si no se lo dieron. Coste: una firma algo distinta de `createModel`. (Tarea 3)
18. **`app.js` exporta su arranque** (`start(doc, win)`) y lo llama `index.html` con un módulo en línea: `test_rediseno_modulos` no tiene excepciones. Coste: una línea más en `index.html`. (Tarea 4)
19. **Smoke desde el corte:** antes de la Tarea 4, solo las suites unitarias; desde ella, los tres smoke en verde tras cada tarea, y deterministas (Tarea 13: tres pasadas seguidas). Coste: ninguno.

### Del corte (Tareas 1 a 4)

20. `teamScorers` compara el nombre exacto: en los datos vivos, 0 de 3.241 filas de goleadores difieren de la clasificación. Coste: si un día difirieran, el bloque de goleadores del equipo saldría vacío.
21. `getCurrentSeason` desaparece: leía `S`, y su papel lo hace `PORTAL.season` (`ctx.portal.season`). Coste: B3 la recrea en una línea si la necesita.
22. `sourceInfo`: `source` es el dominio de la URL sin `www.` y `null` sin URL, como en los 13 grupos de la FIFLP; una temporada pasada no enlaza; `kind` es `oficial` si falta `standingsKind`. Coste: la Tabla decide el texto de «oficial, sin fuente».
23. `ensureHealth` también lleva la `?v=` de los datos. Coste: casi nulo; el SW revalida igual.
24. `model.scorers(season, cat)` devuelve el array `GOL_*` tal cual (`[{ id, g, s }]`), que es lo que recibe `teamScorers`, y `[]` en otra temporada. Coste: las pantallas hacen `.find(g => g.id === groupId)`.
25. `clubIndex()` incluye la temporada del portal, las pasadas cargadas en `seasonRaw` y los torneos, y se rehace al cargar otra (§6.1, «temporadas cargadas»). Coste: tras cargar un archivo, la resolución podría unir más nombres; con las fixtures, ninguno.
26. El corte pone `theme-color` dos veces (`#FFFFFF` y `#15171C`) y `apple-mobile-web-app-status-bar-style=default`, porque `black-translucent` dejaba iconos blancos sobre blanco. El `apple-touch-icon` PNG, el manifiesto y el `preload` son de B4. Coste: nulo.
27. `STATIC_ASSETS` deja fuera `icons.svg`: nadie lo usa y no está en la lista de §5.5. Coste: nulo.
28. Los enlaces a Partido desde la portada llevan siempre `s`: un enlace compartido no cambia de partido al activar 2026/27. Coste: URL más larga.
29. `checkRenderedDom` pide la portada en A, B, C o D con su `header.screen-head`, un solo `h1` con `PORTAL.defaultTeam.name` y algún `section.block`; E, X, la caja de error y el esqueleto sin sustituir fallan. Con el almacén vacío, el equipo por defecto es de la temporada del portal y se resuelve en el paso 0: al activar 2026/27 con Las Mesas en PG2, la portada queda en B y `render-smoke` sigue en verde (B8 de la revisión). Coste: si el equipo por defecto no está en la temporada nueva, la portada queda en X y `render-smoke` se pone en rojo, como pide §11; el bot no ejecuta los smoke.
30. `pwa-smoke` prueba desde el corte el paso desde la app anterior con su SW de verdad (decisión 117), con datos congelados (decisión 130), el aviso del arranque sin conexión a medias (decisión 131) y, sin conexión, la portada y el precache de la fuente, un icono, `screen-home.js` y `acta.css`. Jornada sin conexión llega en la Tarea 13; «y también el buscador» (§11), con el buscador de B3. Coste: ninguno.

### Del marco y el router (Tareas 5, 6 y 12)

31. En móvil y tableta no hay marca arriba (lo alto es la cabecera de pantalla, como en las maquetas); marca y pestañas solo desde 1024 px. Coste: una regla CSS.
32. La barra va dentro de `<header class="shell-header">`: orden del DOM «Saltar al contenido», cabecera (marca y barra) y `main`. La misma `nav` es barra fija abajo o fila de pestañas. El corte la deja entre `header` y `main`, y la Tarea 5 la mete en la cabecera. Coste: mover un nodo en `index.html`.
33. La cabecera de pantalla mide al menos 72 px (lo mismo que su esqueleto), con `align-items: center`. Coste: una regla.
34. La acción de la cabecera va en tinta y subrayada también cuando es un botón («Compartir», maqueta 5-3). Coste: una regla.
35. La fecha del aviso sin conexión es DD/MM/AAAA, como el literal «Última actualización». Coste: el formato.
36. Las medidas de los esqueletos salen de las maquetas: cabecera 72 px, primera caja de la portada 272 px, Jornada 60 + 272, Tabla 47 + 474 y Partido 240. Coste: ajustar números.
37. Un grupo que no existe lleva a `#/ligas?s&c&to` con aviso (el riesgo aceptado de §4.1), no al grupo de mi equipo. Coste: una rama.
38. Con E o X, Jornada y Tabla sin `g` llevan a `#/ligas?to=jornada|tabla` de la temporada actual: la barra sigue en el destino pulsado y Ligas vuelve a él. Coste: quitar `to`.
39. En una temporada pasada, `g` es el primer grupo de liga de la categoría de mi equipo con su nombre, en el orden del modelo; con E o X, el `myTeam` guardado. Coste: una condición.
40. Una `s` que no está en `SEASONS` se quita (la misma pantalla, sin `s`), con «No existe la temporada 1999/00; te enseñamos la actual» (M4 de la revisión). Coste: con el mismo código de grupo, la de la temporada actual puede ser otro grupo; el aviso lo dice.
41. El router quita una `v` o una `r` que no existen y valida la identidad del partido (a su jornada, con «No encontramos ese partido»): las pantallas reciben parámetros válidos. Coste: validar en cada pantalla.
42. Equipo sin `g` va a `#/explorar?q=<t>`; con un grupo que no existe, igual y con aviso. Coste: una rama (B3).
43. Los valores por defecto no se escriben en la dirección: `#/jornada` sigue siendo «la jornada de mi equipo». Solo las redirecciones y los enlaces antiguos usan `replaceState`. Coste: un `replaceState` con los valores.
44. `historyMode` compara las rutas ya resueltas, y la misma ruta es `replace`: pulsar el destino activo repinta sin entrada nueva. Coste: una línea.
45. Foco al `h1` al cambiar de pantalla (§8), salvo en la carga inicial; al cambiar de jornada o de vista (`replace`), al control pulsado, que lleva un `id` estable: `round-prev` y `round-next` en Jornada (en un extremo, el apagado conserva el `id`) y `vista-*` y `vista-ancha-*` en Tabla (B11 de la revisión). Desplazamiento: arriba al avanzar, el guardado al volver y el mismo con `replace`. Coste: un `id` más por control; sin él, el foco cae en el `h1`.
46. `lastPrimary` vive en `sessionStorage` (`futbol-base:destino`; «la sesión» es la pestaña): una ficha recargada conserva su destino. Coste: dejarlo en memoria.
47. El router pone los avisos de redirección detrás del primer `</header>` de la pantalla (`role="status"`); las pantallas no los pintan. Coste: pasarlos en `ctx`.
48. El `<qué>` de la caja de error es `err.what` o el mensaje de un `Error` simple; cualquier otro error dice «esta pantalla». Coste: un fallo de programación que lance `new Error('x')` en `needs` diría «…de x».
49. `render` tiene que devolver `Html` o se pinta la caja de error (guardia del escapado de §5.1). Coste: una línea.
50. `myTeamToSave` solo guarda un cambio de la misma temporada (el cambio de fase, FF5 → A2); un cambio de temporada nunca se guarda solo (decisión 118, que sustituye a la guardia M3 de B1). Coste: ver la decisión 118.
51. El registro ruta → pantalla vive en `src/screens.js`, aparte de `app.js`: sus pruebas no arrastran el arranque, y B3 solo toca esa lista. Coste: volver a meterlo en `app.js`.

### De Mi equipo (Tareas 7 y 8)

52. «Cambiar», «Ninguno: buscar otro equipo», «Elegir equipo» y «Búscalo en Explorar» llevan a `#/explorar#buscar`: el ancla va tras la ruta, como `#calendario`, y `parseRoute` la ignora. Coste: la constante `SEARCH`.
53. Sin campo no hay «Cómo llegar», y «Calendario» pasa a ser la acción principal. Ningún partido de PG2 trae campo en 2025-26. Coste: una clase.
54. Campo ausente: casilla «Campo» con «no publicado». Coste: un texto.
55. Con menos de cinco partidos jugados, el bloque se titula «Últimos resultados» y enseña los que hay. Coste: un título.
56. A con el equipo sin jugar (descansó la primera jornada): el vacío único de B en lugar de Últimos cinco, goleadores y cifras. Coste: una rama.
57. B, segunda causa (M2): «<equipo> figura como retirado en este grupo» o «<equipo> todavía no ha jugado ningún partido en este grupo», con la clasificación real; sin partidos, «Sin partidos en el calendario de este grupo». Coste: textos.
58. Cobertura (`coverageText`), en un aviso «Cobertura:» bajo las cifras: el literal de §7 con todo el calendario con resultado; a mitad de temporada, «N partidos jugados en el calendario…»; «N de M partidos con resultado», contando solo los `sin resultado`; «Calculado con N partidos del calendario» en lo que §7 no prevé; y «; la clasificación cuenta P» si la suma no da el PJ. Coste: una función pura.
59. «Peor derrota» sí sale (la pide §4.2, aunque falte en la maqueta 4): cifras en filas de 3, 2 y 2 casillas, y «ninguna» sin derrotas. Coste: una casilla.
60. Frescura: el `checkedAt` del grupo en `data-health` solo si `health.season` es la del grupo, como «hoy a las 22:11» o «el 23 de septiembre a las 22:11» (nunca «ahora»), más «Revisión pendiente.» si el estado no es `ok`. Coste: textos.
61. Contexto de la clasificación: «tras la jornada N», la última con algún resultado; nada si no hay ninguna. Coste: un texto.
62. «ver todos» de los goleadores sale siempre que hay goleadores; sin ninguno, «Sin goleadores publicados de este equipo». Coste: una condición.
63. El aviso `stale` va justo bajo la cabecera, solo en C y D. Coste: su posición.
64. Casilla «Última comprobación» de la caja D: `health.checkedAt` («hoy, 22:11» o «23 sept, 22:11»); sin `data-health`, la fecha de `ctx.legacyDate` sin hora, o «no disponible». Coste: un campo de `ctx`.
65. La temporada siguiente es la del grupo más uno, no `health.nextSeason.name`; en el texto de la caja, el club es `teamShort(nombre)` sin la letra de filial. Coste: dos textos.
66. D no lleva la línea de frescura (§4.2 D y maqueta 6-1). Coste: una línea.
67. «Verano»: una caja por competición («Verano: Maspalomas Cup 2026»), con los meses como contexto; cada fila abre `#/copa?s&g` (provisional en B2); «<ganador corto> pasó por penaltis (3–2)». Coste: enlaces y textos.
68. Clasificación final: cinco filas alrededor de la propia, y en los extremos las cinco primeras o las cinco últimas. Coste: una función.
69. El calendario completo de escritorio lo pinta `mount` con `matchMedia` en A, B y C, nunca oculto con CSS (§5.1: son 22-30 partidos); no va en D, donde «Ver toda la temporada» lleva a él. Coste: una función y el hueco.
70. Enlaces de texto `.more` de 44 px de alto, con márgenes negativos para no agrandar las líneas. Coste: CSS.
71. Compartir: `shareLink` de `links.js` usa `navigator.share` y, si no existe o falla, copia el enlace; la portada lo dice en el propio botón y en una región `role="status"`, sin `#toast`. Coste: una función.
72. El `.ics` de un partido sale con `downloadCalendar`, como en Jornada: `calendario-<local>-<visitante>.ics`. Coste: ninguno.
73. Las respuestas a E son `<button data-action="elegir">` que llaman a `nav.saveMyTeam({ name, season, cat, groupId })`; `mount` escucha en la sección, que se sustituye en cada pintado. Coste: ninguno.
74. Goleadores del equipo: `teamScorers(model.scorers(season, cat), { name, season, cat, groupId })`. Coste: ver la decisión 24.

### De Jornada y Tabla (Tareas 9 y 10)

75. Una `r` que no existe cae en la ronda del mismo número y, si no, en `defaultRound`: `findRound` de `model.js`, el mismo criterio con el que el router la deja pasar (decisión 122). Coste: ninguno; solo tolera enlaces escritos a mano.
76. El día del partido propio va primero aunque sea posterior («el partido propio va primero»). Coste: una línea de `roundDays` si se prefiere el orden de fechas.
77. Los partidos contra retirados no se listan en Jornada, y el aviso los explica. Coste: un filtro.
78. En «N de M», M es la mayor jornada del grupo y no el número de rondas, por los huecos de FF17 y FV23. Coste: ninguno.
79. Los enlaces de Puntos (móvil) y Todas (escritorio) van sin `v`; los demás, con `v`. Coste: ninguno.
80. La cobertura de Casa y Fuera es de todo el grupo, con dos textos nuevos: «No cuenta los N partidos contra X (retirado), que no están en el calendario.» y «Con los N partidos con resultado del calendario; la clasificación oficial cuenta M[, K de ellos contra X (retirado)].». Coste: textos.
81. Contexto de la clasificación de la Tabla: «jornada N» (`currentRound`) más «, final» (`groupFinished`), como en la maqueta. Coste: texto.
82. Goleadores del grupo: los 10 primeros, «ver todos (N)» solo con más de 10, el equipo en texto oculto, y tres vacíos (sin grupo en la fuente, sin goles todavía y temporada pasada). Coste: textos y una condición.
83. Procedencia: los textos de «calculada» y «corregida» resumen los de `health.js`; en temporadas pasadas se añade «Archivo de la temporada 2024/25.». Coste: textos.
84. En temporadas pasadas, la etiqueta de la cabecera lleva «· 2024/25» (§4.2 B). Coste: texto.
85. `myTeamIn` nunca resalta un homónimo de la misma fase (Santa Brígida en B1 y B2) ni de la otra categoría (A2). Coste: una condición.
86. *Compartir jornada* sin `navigator.share`: copia el enlace y el propio botón dice «Enlace copiado» (`aria-live`). Coste: si el shell trae un aviso común, cambiar `flash` por él.
87. En el `.ics` del grupo, el nombre y el título son la etiqueta del grupo, y `jornada` es `round.label`. Coste: en PFV2 cambia el UID frente al `.ics` viejo, con duplicados si alguien lo reimporta.
88. Escritorio: el selector de la Tabla mide 480 px como mucho, las cifras son más anchas (solo en `[data-screen="tabla"]`) y la regla de la cabecera sobresale el margen. Coste: CSS.

### De Partido (Tarea 11)

89. Cara a cara de la temporada (§4.5, «de la misma categoría», decisión del controlador): en una liga, todos los grupos de liga de la categoría (la primera y la segunda fase de benjamín), por el nombre exacto de los dos equipos, por fecha y con el actual resaltado; las filas de otra fase llevan la fase delante, y el contexto es «esta temporada». En un torneo o una copa, los de su competición. Coste: si un equipo cambia de nombre entre fases, falta ese cruce. (Tarea 11)
90. «Ver temporadas anteriores» es un desplegable (`button` con `aria-expanded`, §8) que `mount` resuelve en el sitio, con su propio «Reintentar». Coste: el estado desplegado no viaja en el enlace compartido.
91. Temporadas anteriores: la misma categoría y el nombre igual con `normalizeTeamName`; el vacío dice «No encontramos partidos entre estos dos equipos…». Coste: se pierden los renombrados; a cambio, un filial B nunca se mezcla con el A.
92. Acta con algún gol sin minuto: una lista por equipo, cada goleador una vez con sus goles y los minutos conocidos, más una nota; con todos los minutos, la tabla de tres columnas. Coste: `goalsLists` si se quiere una línea por gol.
93. Si falla `data-matchdetail.js`, Goles pinta la caja de error y nunca el acta en su lugar; lo mismo si fallan las actas y no hay cronología. Coste: con las actas caídas, dos cajas.
94. Partido sin marcador (pendiente, sin resultado o sin fecha): sin Goles ni Alineaciones; Resultado con «–» y la cuenta atrás o el estado. Coste: ninguno visible.
95. Maspalomas Cup: sin el bloque Alineaciones, porque la federación nunca publica sus actas. Coste: un torneo nuevo con actas necesitaría esa condición.
96. Procedencias del aviso de marcador distinto: «la cronología de futbolaspalmas» o «el acta de la federación», frente a «el resultado de futbolaspalmas», «de la federación» o «del calendario». Coste: solo texto.
97. Nombres completos en dos líneas como mucho y luego elipsis (§3.5); en el cara a cara, `teamShort` por debajo de 1024 px. Coste: ninguno; los lectores de pantalla leen el completo.
98. «Entrenador/a» y «Árbitro/a», como el acta de la federación, y «no consta» si faltan. Coste: solo texto.
99. Los goleadores de mi equipo van en tinta (maqueta 5-3, «Yadiel»), solo en su grupo resuelto. Coste: una clase.
100. «‹» es un enlace al padre (la jornada del partido, o `#/copa?s&g` en un cuadro o un torneo) con `data-action="back"`. Coste: ninguno; sin JS, el enlace funciona igual.
101. `s` va siempre explícito en *Compartir*, «‹» y el cara a cara. Coste: URL más larga.
102. `findMatch` (en `model.js` desde la Tarea 6, decisión 122): la ronda por su clave; si no, por su número; y si ahí no está, el único partido `h`–`a` del grupo. Coste: ninguno.

### Del ensamblado y la Tarea 13

103. **«‹» y «Reintentar» son del router**, que los atiende por delegación en el documento (`history.back()` si la entrada anterior es de la app; si no, el padre). Las pantallas no los detienen: Partido solo atiende *Compartir*, «Ver temporadas anteriores» y el «Reintentar» de ese desplegable. Coste: una pantalla con otro «Reintentar» propio tiene que ponerlo dentro de su bloque, como Partido. (Tareas 6 y 11)
104. **La portada pide `data-health.json` en `needs`**, una vez y sin rechazar nunca: el primer pintado ya trae la caja de D y la frescura, sin repintar. Coste: la portada espera a un JSON pequeño en la primera visita. (Tarea 7)
105. **La portada mínima del corte usa ya los textos y marcadores de la Tarea 7**: `screenHead`, `data-action="elegir"`, las dos causas de B, X con «Elegir equipo» → `#/explorar#buscar`. Así `test_rediseno_home.mjs` y `test_rediseno_smoke.mjs` fijan el contrato que la portada completa conserva. Coste: la Tarea 7 no puede cambiar esos textos sin tocar esas pruebas. (Tareas 4 y 7)
106. **La cabecera de la portada es `screenHead`**, en fila (escudo, nombre y etiqueta, «Cambiar»), y no la rejilla propia del borrador de Mi equipo. Coste: con una etiqueta muy larga, dos líneas a 320 px. (Tareas 4 y 7)
107. **Ordinal «9.º»** en toda la app (portada, Verano y Partido). Coste: una línea si se prefiere «9º».
108. **Jornada, Tabla y Partido entran en el router a la vez, en la Tarea 12** (`screens.js` y `STATIC_ASSETS`); hasta entonces sus rutas pintan la provisional. Coste: ninguno; la rama no se publica. (Tarea 12)
109. **`startContext` se queda en `app.js`** para las pruebas de las pantallas y comparte `contextFor` con `start`: el `ctx` de las pruebas y el de la app no pueden divergir. Coste: ninguno. (Tareas 4, 6 y 12)
110. La tabla de goleadores del grupo es `.standings.group-scorers`, y no `.scorers`, que es la de la portada con otras medidas. Coste: ninguno. (Tarea 10)
111. La región que dice «Enlace copiado.» en Partido (`.pt-share-status`) nunca lleva `display: none`, que la dejaría de anunciar. Coste: ninguno. (Tarea 11)
112. **Mundos de fixtures** (`fixture-site.mjs`): las pruebas de navegador y las capturas sirven la app real con datos congelados, un `PORTAL` fijo y el reloj de Playwright; `render-smoke` conserva además su pasada con los datos reales. Los goleadores son una copia literal de las filas de PG2 y A2 (los de fin de temporada), y `data-health.json` va a la víspera en los mundos que no son del 23/09/2026. Coste: `interaction-smoke` no ve los datos vivos. (Tarea 13)
113. `tests.yml` instala Playwright antes de `render-smoke`, que lo necesita para el estado D. Coste: ninguno. (Tarea 13)
114. Capturas: 15 escenas × 3 variantes (390 px en claro y en oscuro, 1440 px en claro) = 45 PNG de la pantalla entera, con la ventana del alto de la página. Coste: ninguno. (Tarea 13)

### De la revisión adversarial (ronda de arreglos)

115. **La hoja nueva va en `acta.css`, una URL nueva** (A1). El SW que ya está en los móviles (el de `main`) sirve los `.css` con *cache-first* y buscando sin la `?v=`: con `style.css` le daría a la portada nueva la hoja vieja hasta que el SW nuevo termine de instalarse (unos 2 MB). `style-acta.css` pasa a `acta.css`, `STATIC_ASSETS` la lleva en lugar de `./style.css`, que se borra, y el filtro de `tests.yml` también. Contradice la lista de `STATIC_ASSETS` de §5.5 por ese motivo. Coste: un nombre distinto del de la spec. (Tarea 4)
116. **`index.html` quita las copias viejas de `app.js`, `state.js` y `links.js`** de las cachés de la app anterior (las que guardan `src/render.js`) antes de importar `app.js`, y solo si un SW controla la página. Ese SW sirve los módulos de `src/` desde su caché y los actualiza en segundo plano; si una actualización falla y la del documento no, la apertura siguiente mezcla módulos y la app no arranca («The requested module './state.js' does not provide an export named 'shieldFile'», reproducido con su SW real). Sin SW al mando no hay nada que quitar, y así la carga de `render-smoke` (Chrome con tiempo virtual) sigue siendo determinista. `config.js` es igual en las dos versiones. Coste: un `import()` dinámico en `index.html` y unos milisegundos por carga; si falla la actualización del documento y no la de `app.js`, esa apertura enseña el esqueleto viejo en blanco, y la siguiente, la app nueva. (Tarea 4)
117. **`pwa-smoke` usa como versión anterior la app y el SW reales de `main` 31a15b8**, copiados en `scripts/tests/fixtures/app-anterior/` (unos 310 KB: `index.html`, `sw.js`, `style.css`, `manifest.json`, `icons.svg` y sus 13 módulos), con los datos y el `config.js` congelados de la decisión 130. Publica el árbol con las marcas subidas, retiene el precache del SW nuevo y, con la actualización en segundo plano de `app.js` y `state.js` fallando, comprueba que cada apertura es entera de una versión (documento, hoja y módulos, comparados con los ficheros) y que al final la app nueva funciona sin conexión. Coste: la copia pesa en el repositorio; si B4 cambia el formato de los datos inmediatos, `pwa-smoke` tiene que servir a cada versión el suyo. (Tarea 4)
118. **Un cambio de temporada no se guarda solo** (A2). `myTeamToSave(myTeam, resolution)` solo guarda un cambio de la misma temporada (el cambio de fase del paso 0); la resolución del paso 1 se recalcula en cada carga hasta que la familia la confirma, respondiendo a E o con «Hacer mi equipo». Con 2026/27 publicada por partes, el primer día PG2 sale en silencio y sin guardar, y cuando llega el benjamín de Gran Canaria, la pregunta. Coste: con un solo candidato durante toda la temporada, cada carga lo vuelve a resolver (unos milisegundos) y el almacén guarda la temporada anterior. (Tarea 12)
119. **Enlaces antiguos «miequipo»** (M3). `section=miequipo&team=X&group=G` con mi equipo (el mismo nombre, o el mismo club en el mismo grupo, el guardado o el resuelto) abre `#/`: es la URL que la app anterior escribía en cada carga. Con otro equipo, su ficha, como §4.1. Y la ruta traducida conserva la `season` del enlace como `s`, aunque sea la del portal. Coste: `translateLegacy` cambia de firma (`{ isMine }` en lugar de `{ season }`). (Tarea 6)
120. **Sin los datos inmediatos de la temporada** (`data-benjamin.js`, `data-prebenjamin.js` o `data-history.js`), `start` pinta la caja de error de §7 («No se pudieron cargar los datos de la temporada 2025/26») con «Reintentar», que recarga la página, y no arranca el router ni resuelve mi equipo: nunca un X o un B falsos (M4). Coste: sin esos datos no se ve nada más que la caja. (Tarea 12)
121. **Torneos perezosos** (M5): nada cambia en B2; lo apunta «Para B3 y siguientes».
122. **El router no descarta lo que las pantallas saben leer** (B7). `findRound(group, r)` (la ronda por clave o por número) y `findMatch(group, { r, h, a })` (su ronda y, si no, el único `h`–`a` del grupo) viven en `model.js` desde la Tarea 6, y los usan el router, Jornada y Partido: `#/jornada?g=PG2&r=30` abre la 30. Coste: una URL «rara» se queda como está en la barra de direcciones.
123. **Fechas sin `Intl`** (B9). Los días y los meses van escritos en `links.js` (`weekdayDate`, `dayMonth`, `dayMonthLong`, `monthName`, `WEEKDAYS` y `MONTHS`, desde la Tarea 7) y los números con un decimal, con `toFixed`; `displayDate`, que usaba `toLocaleDateString` y no tenía uso, se va, y `test_rediseno_modulos` prohíbe `toLocale*String` e `Intl` en castellano en `src/`. Solo las conversiones de zona horaria siguen con `Intl`, con partes numéricas. Coste: los nombres, a mano (septiembre abreviado es «sept», como en el CLDR actual). (Tareas 7 a 11)
124. **Nada espera para siempre** (B10). Las peticiones perezosas de `state.js` pasan por `fetchData`, con la `?v=` y un `AbortController` de 15 s que cubre también el cuerpo; al agotarse, la carga falla como con un error de red: lo opcional pinta su caja en el bloque y lo necesario, en la pantalla. Coste: una red de más de 15 s por fichero da la caja de error y hay que reintentar. (Tarea 2)
125. **Foco en los cambios dentro de la misma pantalla** (B11): ver la decisión 45. `segmented` (`ui.js`) gana un `idPrefix` opcional. (Tareas 9 y 10)
126. **La clasificación de los mundos A y C es la de su día** (B12): recalculada con los resultados del calendario hasta ese día y, en PG2, los 3–0 contra el retirado que la clasificación final cuenta de más, uno por vuelta. En C, la fila de Las Mesas es la oficial. Los goleadores, que las fixtures solo tienen de fin de temporada, se reducen a su día en la proporción de partidos que su equipo lleva jugados: en A, ninguno juega más partidos que su equipo. Coste: la clasificación de los demás equipos y los goleadores de A son una aproximación verosímil, no lo que publicó la fuente ese día. (Tarea 13)
127. **Pruebas de conducta de `start()`** (M6): en Node, `start` de verdad sobre un navegador falso y un almacén en memoria (el guardado al arrancar, la activación por partes, los datos que faltan y los enlaces del router con las pantallas reales); `start(doc, win, config = PORTAL)` acepta otro `PORTAL` para las pruebas. En `interaction-smoke`, la respuesta a E en el mundo E, guardada y respetada al recargar. Coste: el navegador falso se mantiene a mano. (Tareas 12 y 13)
128. **La limpieza de la decisión 116 solo corre con un SW al mando**, también por `render-smoke`: su primera pasada es Chrome con `--virtual-time-budget`, que da por cargada la página cuando no hay peticiones de red pendientes, y las esperas a la Cache Storage antes de importar `app.js` lo hacían fallar 1 de cada 10 veces. Con la condición, 10 de 10. Coste: una condición más en `index.html`. (Tarea 4)

### De la segunda ronda de la revisión adversarial

129. **Ninguna prueba depende de `src/config.js`** (R2-1). El router pasa la temporada del portal a `needs`: `screen.needs(params, datasets, { portalSeason })`, con la del contexto (`ctx.portal.season`, que en la app es la de la `config` que recibe `start`). `seasonNeeds(name, datasets, portalSeason)`, la de Jornada y Tabla, la exige, sin valor por defecto: sin ella, `TypeError`. La portada y Partido no la usan: la portada solo pide `data-health.json`, y Partido reconoce una temporada pasada por `SEASONS`, sin leer `config.js`. `test_rediseno_config.mjs` ejecuta todas las demás pruebas de Node con un `config.js` de 2026/27 y Las Mesas en otro grupo (PG5), que sirve un hook de carga de Node (`module.register`, en `fixtures/config-2026-2027/`), y tienen que salir en verde: es la comprobación del día de la activación, automática. `getData`, `countStats`, `fixtureISO` y `buildCalendar` siguen leyendo `PORTAL` como antes del corte, pero ninguna prueba depende de ello, y lo vigila la misma guarda. Coste: la suite de Node tarda unos 4 s más, porque se ejecuta dos veces; B3 hereda el contrato de `needs`. (Tareas 6, 9, 10 y 12)
130. **`pwa-smoke` sirve a sus dos versiones datos y `config.js` congelados** (R2-2): las fixtures de B1 del 23/09/2026 y el `config.js` de la copia de `main` (2025/26, con Las Mesas en PG2). Lo que las fixtures no traen va vacío: las temporadas archivadas, que el SW anterior precachea, y las fichas de jugadores, que la app anterior pide para su portada. Cualquier otro `data-*` da 404 y se anota. No usa el mundo D de `fixture-site`, que llega en la Tarea 13: lo construye con las mismas fixtures desde la Tarea 4, sin los goleadores. Coste: `pwa-smoke` nunca ve los datos vivos (los ve la primera pasada de `render-smoke`). (Tarea 4)
131. **Un arranque que nunca se queda colgado** (R2-3). `index.html` envuelve la limpieza, el `import()` y `start` en un `try`. Si falla, pinta con estilos en línea «No se pudo abrir la versión nueva de la app. Comprueba la conexión y pulsa Reintentar.» y «Reintentar», que pide `registration.update()`, sin esperarlo más de 3 s, y recarga. Falla, por ejemplo, sin conexión en plena transición: la caché del SW anterior ya guarda el `index.html` nuevo, pero no `acta.css` ni los módulos nuevos, y la página se quedaba en «Cargando…» para siempre. También falla con un módulo que no llega. `pwa-smoke` lo prueba con el SW real de `main`: sin conexión entre la 1.ª y la 2.ª apertura sale el aviso, y con conexión «Reintentar» abre la app nueva. Coste: sin conexión en ese momento no hay app, cuando antes la anterior funcionaba; la «versión puente» que lo evitaría queda para B5. (Tarea 4)

## Foco de revisión (cada línea con su prueba en la tarea indicada)

1. **Enlace directo o antiguo**, como un enlace de WhatsApp con `#section=…` o una ruta con parámetros que faltan o no existen (grupo inexistente, temporada pasada sin cargar): la pantalla correcta, con los valores por defecto de §4.1, y nunca una pantalla en blanco. (Tareas 6 y 13)
2. **Respuesta lenta de un fichero perezoso** mientras se navega a otra ruta: nunca pinta sobre la ruta nueva (token). Error de carga: caja «No se pudieron cargar los datos de <qué>» con «Reintentar», que funciona. (Tareas 5, 6, 11 y 13)
3. **Primera visita y almacenamiento roto:** con almacén vacío o bloqueado, portada de `PORTAL.defaultTeam` sin preguntas. Con favoritos v1, la migración y el paso 0. Mi equipo guardado desde E y al arrancar, en memoria si el almacenamiento falla. (Tareas 4, 7 y 12)
4. **Móvil en otra zona horaria o a medianoche de Canarias:** el «hoy» de la app es el de Canarias, y la cuenta atrás y los estados no se equivocan de día. (Tareas 2 y 7)
5. **Estado de la portada en cada momento real de la temporada** (A, B —con sus dos causas—, C —con las tres variantes de texto—, D con caja y Verano, E, X y `stale`): cada uno con su bloque y ninguno vacío. (Tareas 7, 8 y 13)
6. **El bot sigue funcionando** tras el corte y tras cada rebase: `index.html` y `sw.js` conservan sus marcas y el bot las reescribe. (Tareas 1 y 4)
7. **Nada sin escapar y nada al importarse:** solo se pinta `Html` de la plantilla con escapado automático, y ningún módulo toca el navegador al importarse. (Tareas 4 y 6)
8. **El día de la publicación, con el SW anterior en el móvil:** ninguna apertura mezcla la portada nueva con la hoja vieja ni módulos de las dos versiones, también si falla una actualización en segundo plano; sin conexión a medias, el aviso con «Reintentar» y nunca «Cargando…» para siempre; y al final la app funciona sin conexión. (Tareas 4 y 13)
9. **2026/27 publicada por partes:** el primer día, sin guardar; cuando llegan los demás equipos de Las Mesas, la pregunta, y su respuesta se respeta. (Tareas 12 y 13)
10. **El día de la activación de 2026/27:** con `src/config.js` y los datos de 2026/27, las pruebas de Node y los tres smoke siguen en verde, y el bot no se para. Ninguna prueba depende de `config.js` ni de los `data-*.js` vivos, salvo la primera pasada de `render-smoke`. (Tareas 4, 12 y 13)

## Estructura de ficheros

| Fichero | Responsabilidad | Tarea |
|---|---|---|
| `scripts/sync_versions.py` y `docs/rediseno-rebase.md` | Marcas de versión de `main` en el `index.html` y el `sw.js` de la rama, y el procedimiento de rebase | 1 |
| `src/state.js` (modificar) | Gana `shieldFile`, `dataVersion`, `fetchData` con su tiempo límite, `readGlobals`, `ensureHealth` (2), `teamScorers` y las re-firmas (4), `seasonNeeds` (9) y el 404 de `ensureLineups` (11). Pierde `S`, `FEATURED`, el HTML y el efecto al importar (4) | 2, 4, 9 y 11 |
| `src/links.js` (modificar) | Gana `canaryTodayISO` y `matchDateISO` (2), `translateLegacy` con `isMine` (6), y `copyText`, `shareLink` y las fechas en castellano (7). Pierde los enlaces viejos, `notify` y `copyLink` (4), y `displayDate` (7) | 2, 4, 6 y 7 |
| `src/model.js` (modificar) | Gana las funciones movidas, `sourceInfo` y `createModel` (3), `seasonLabel` (4), `findRound` y `findMatch` (6) y `actaFor` (11) | 3, 4, 6 y 11 |
| `src/ui.js` (modificar) | `crest` con `shieldFile` (2); `screenHead` y `backLink` (4); la vista `resumen` de `standingsTable` (8), y las clases de J, G, E y P y el `idPrefix` de `segmented` (10) | 2, 4, 8 y 10 |
| `src/myteam.js` (modificar) | `buildClubIndex` con `shieldFile` (2), `myTeamIn` (9) y `myTeamToSave` (12) | 2, 9 y 12 |
| `index.html` (reescribir) | Esqueleto: «Saltar», cabecera con marca y barra, `main#contenido.page` con el esqueleto de la portada, el literal «Última actualización», los 9 datos inmediatos, el arranque (con la limpieza de las cachés de la app anterior) y el registro del SW | 4 y 5 |
| `acta.css` (sustituye a `style.css`, que se borra) | `style-acta.css` renombrado a una URL nueva (decisión 115), más el CSS del marco y de cada pantalla | 4, 5 y 7-11 |
| `src/app.js` (reescribir) | Arranque: `start(doc, win, config)` (almacén, registro de datos, modelo, escudos, aviso sin conexión, la caja de error sin los datos inmediatos y router) y `startContext` para las pruebas | 4, 6 y 12 |
| `src/shell.js` | Cabecera de la app, `aria-current`, aviso sin conexión, esqueletos, caja y pantalla de error, aviso de redirección y títulos de ruta | 5 |
| `src/router.js` | Valores por defecto y redirecciones, historial, token, `needs`/`render`/`mount`, desplazamiento, foco, «‹» y «Reintentar» | 6 |
| `src/screens.js` | Registro ruta → pantalla (`SCREEN_MAP`) | 6 y 12 |
| `src/screen-home.js` | Mi equipo (A a E y X) | 4, 7 y 8 |
| `src/screen-pendiente.js` | Provisional de las rutas de B3 (decisión 6) | 6 |
| `src/screen-jornada.js` | Jornada | 9 |
| `src/screen-tabla.js` | Tabla | 10 |
| `src/screen-partido.js` | Partido | 11 |
| `sw.js` (modificar) | `STATIC_ASSETS` con `acta.css`, el grafo exacto de `app.js`, `fonts/*.woff2` e `icons/*.png` | 4, 6 y 12 |
| `scripts/tests/fixtures/rediseno/simulate.mjs` (modificar) y `screens.mjs` | `datasetsFrom` (3); el `ctx` de las pantallas desde las fixtures (9) | 3 y 9 |
| `scripts/tests/render-smoke.mjs`, `interaction-smoke.mjs` y `pwa-smoke.mjs` | Los smoke: en mínimos desde el corte (`pwa-smoke`, con el paso desde la app anterior y su SW real), y los escenarios de B2 en la 13 | 4 y 13 |
| `scripts/tests/fixtures/app-anterior/` | La app de `main` 31a15b8 con su `sw.js`: la versión anterior de `pwa-smoke` | 4 |
| `scripts/tests/test_rediseno_config.mjs` y `fixtures/config-2026-2027/` | La guarda de `config.js`: las pruebas de Node con un `config.js` de 2026/27, servido por un hook de carga (decisión 129) | 12 |
| `scripts/tests/fixture-site.mjs` y `capturas.mjs` | Mundos de fixtures para el navegador y las 45 capturas | 13 |
| Pruebas nuevas | `test_sync_versions.py` (1); `test_rediseno_state` y `_fechas` (2); `_model_heredadas` y `_model_registro` (3); `_modulos`, `_index`, `_home`, `_smoke` y `test_index_bot_contract.py` (4); `_shell` (5); `_router` (6); `_portada` (7 y 8); `_jornada` (9); `_tabla` (10); `_partido` (11); `_integracion` (12) | 1-12 |
| **Se borran** | `render.js`, `modals.js`, `miequipo.js`, `init.js`, `favorites.js`, `filters.js`, `health.js`, `plantilla.js` y `matchdetail-rich.js` (su copia queda en `fixtures/app-anterior/`), `style.css`, y las pruebas de detalle visual del diseño viejo (tabla de la Tarea 4) | 4 |

## Contratos (reconciliados con el código de las tareas)

### Registro de datos y modelo

```js
// state.js
export function readGlobals()   // → { benjamin, prebenjamin, history, golBenj, golPrebenj, shields, seasons,
                                //     cupBenjamin, cupPrebenjamin }: identificador desnudo con typeof, null si falta
export function dataVersion()   // → '20260923j' de script[src*="data-seasons.js"]; '' sin documento o sin script
export const LAZY_TIMEOUT_MS = 15000           // cada petición perezosa pasa por fetchData (interna): la ?v= de dataVersion()
                                               // y un AbortController que la corta, cuerpo incluido, a los 15 s (decisión 124)
export async function ensureSeasonData(name)   // → el crudo de la temporada o null; un fallo (o el tiempo límite) no se memoriza
export async function ensureMatchDetail()      // → MATCH_DETAIL o null; ídem
export async function ensureLineups(season)    // → LINEUPS_<S> o null; {} con un 404 (temporada sin actas, Tarea 11)
export async function ensureHealth()           // → data-health.json parseado o null; un solo vuelo; nunca rechaza
export function shieldFile(name, shields)      // → fichero (clave exacta o nombre normalizado) o null; nunca por subcadena
export function teamScorers(gol, team)         // gol: GOL_* ([{ id, g, s: [[jugador, equipo, goles, PJ]] }]);
                                               // team: { name, cat, groupId } → [{ name, goals, games }], nombre exacto
export function seasonNeeds(name, datasets, portalSeason)
  // → [] si es la del portal o ya está en datasets.seasonRaw; si no, [Promise] que la guarda allí o rechaza con
  //   Error('la temporada 2024/25'). Sin portalSeason, TypeError: nunca la de config.js (decisión 129)
// Re-firmadas (decisión 2): getData(season, cat), withSeasonCup(groups, season, cat), getPhases(groups), countStats(season, cat)

// model.js
export function createModel(datasets, { portalSeason, buildClubIndex }) → {   // TypeError si portalSeason no es 'AAAA-AAAA'
  season(name),          // Season memorizada: la del portal, de datasets.benjamin/prebenjamin/history; una pasada, de
                         // datasets.seasonRaw[name], o null mientras no esté (nunca memoriza el null)
  group(season, id),     // Group | null
  cups(),                // Cups de 2025-2026 desde cupBenjamin/cupPrebenjamin (memorizados en cuanto hay datos) o null
  clubIndex(),           // buildClubIndex(nombres del portal, de las pasadas cargadas y de los torneos, shields), memorizado
                         // y rehecho si cambian; TypeError si no se inyectó buildClubIndex (decisión 17)
  scorers(season, cat),  // GOL_BENJ o GOL_PREBENJ tal cual en la temporada del portal; [] en otra
}
export function sourceInfo(group, historical = false)   // → { kind: 'oficial'|'calculada'|'corregida', source, url }
export function seasonLabel(season)                     // '2025-2026' → '2025/26'; otro texto, tal cual; null → ''
export function actaFor(match, lineups)                 // → la entrada del acta del partido o null (criterio de timelineFor)
export function findRound(group, r)                     // → la ronda de clave r o, si no hay, la del mismo número; o null
export function findMatch(group, { r, h, a })           // → el partido en findRound(group, r) o, si ahí no está, el único
                                                        //   h–a del grupo; o null (decisión 122)
// Movidas en la Tarea 3: sortPlantillaRows, aggregatePlayerFromLineups, mergeAndOrderEvents, resolveSeasonDataset y
// filterCompetitionGroups.

// datasets (app.js): { ...readGlobals(), seasonRaw: {}, matchDetail: null, lineups: {}, health: null }
// En las pruebas: datasetsFrom(raw, extra) (simulate.mjs) y, para las pantallas, datasetsFor y ctxFor (screens.mjs).
```

### Enlaces, piezas de interfaz y mi equipo

```js
// links.js
export function canaryTodayISO(now = new Date(), timeZone = 'Atlantic/Canary')   // → 'AAAA-MM-DD'
export function matchDateISO(d, todayISO)
export async function copyText(text)           // → Promise<boolean>
export async function shareLink({ title, text, url })   // → Promise<'compartido'|'cancelado'|'copiado'|'no copiado'>
export function translateLegacy(hash, { isMine } = {})   // B1, con otra firma (decisión 119): la `season` del enlace
  // va siempre como `s`; 'miequipo' con isMine(team, group) → '#/'; con otro equipo, su ficha
export const WEEKDAYS, MONTHS                  // los nombres en castellano, escritos en el código (decisión 123)
export function weekdayDate(iso)               // '2026-03-07' → 'sáb 7 mar'; null si no es un día válido
export function dayMonth(iso)                  // → '23 sept'
export function dayMonthLong(iso)              // → '23 de septiembre'
export function monthName(iso)                 // → 'junio'
// De B1, sin cambios: SCREENS, parseRoute, routeHref, countdownLabel, readRoute, venueUrl, fixtureISO, kickoffUTC,
// buildCalendar y downloadCalendar. displayDate se va (Tarea 7).

// ui.js
export function backLink(href)   // Html: <a class="back" href data-action="back" aria-label="Volver">‹</a>
export function screenHead(title, { sub, action, crest, back } = {})
  // Html: <header class="screen-head">[«‹»][escudo]<div class="screen-head-text"><h1>título</h1>
  //       [<p class="screen-sub">]</div>[acción]</header>; action: { href, label } (a.screen-action) o un Html (un botón)
// standingsTable(rows, { view, mine, shields, hrefFor, caption }): vistas puntos, resumen (Tarea 8), goles, forma,
// casa, fuera y todas; J, G, E y P con st-pj, st-g, st-e y st-p (Tarea 10).
// segmented(options, active, hrefFor, { idPrefix }): con idPrefix, un id «<prefijo>-<valor>» por opción (Tarea 10).

// myteam.js
export function myTeamIn(group, myTeam, resolution)       // → el nombre de mi equipo en ese grupo o null
export function myTeamToSave(myTeam, resolution)  // → { name, season, cat, groupId } | null: solo un cambio de la misma
                                                  //   temporada; un cambio de temporada, nunca (decisión 118)
```

### Pantallas, contexto y router

```js
// Cada screen-*.js exporta:
export const screen = {
  id,                                  // 'home' | 'jornada' | 'tabla' | 'partido' | 'pendiente'
  needs(params, datasets, { portalSeason }) → Promise[], // decisiones 9 y 129; [] si no hace falta nada
  render(ctx) → Html,                  // pura; raíz <section data-screen="<id>"> con un solo <h1> (el de screenHead)
  mount?(root, ctx, nav),              // comportamiento; puede devolver su limpieza
};
// ctx = { ...getContext(), route, params, lastPrimary, backHref }
//   getContext() (app.js) = { model, myTeam, resolution, today, health, datasets, portal: { season, defaultTeam },
//                              legacyDate }
//   params: resueltos por resolveParams (s siempre; g en Jornada y Tabla); backHref: el «‹» (null en los principales)
// nav = { go(screen, params), replace(screen, params), back(), retry(), saveMyTeam(myTeam) }

// router.js: funciones puras y la parte con DOM
export function resolveParams(route, ctx)       // → { params, pending? } | { redirect: { screen, params, notice } }
export function historyMode(from, to)           // → 'push' | 'replace' (replace si solo cambian r, v o q, o nada)
export function parentOf(route)                 // → { screen, params } | null
export function activeTab(route, lastPrimary, isMine)   // → { active, current: 'page' | 'true' }
export function routeIsMine(route, resolution)  // → boolean
export function startRouter({ screens, root, getContext, window, actions = {}, session = null })
  // → { nav, idle() → Promise del último pintado, current() → ruta resuelta }

// screens.js
export const SCREEN_MAP   // { <cada ruta de SCREENS>: screen }: '' → home, jornada, tabla, partido; las de B3 → pendiente

// app.js: importarlo no hace nada; index.html llama a start(document, window) tras los datos inmediatos
export function startContext({ storage, portal, datasets, today })   // el ctx sin la ruta, desde un almacén (pruebas)
export function start(doc, win, config = PORTAL)   // escudos en captura, aviso sin conexión y, con los datos inmediatos,
  //   almacén, modelo, mi equipo al arrancar y router (→ lo que devuelve startRouter); sin ellos, la caja de error y
  //   null (decisión 120). config: otro PORTAL, en las pruebas
```

### Marco

```js
// shell.js
export function routeTitle(screen)                  // '' → 'Mi equipo', 'records' → 'Récords'…
export function renderHeader({ active = 'miequipo', current = 'page' } = {})   // marca, barra y el hueco .shell-offline
export function updateTabbar(active, current, doc)  // aria-current en '.tabbar a.tab' del documento que recibe
export function offlineNotice(health, legacyDate)   // «Sin conexión. Datos del DD/MM/AAAA»
export function skeleton(screenId)                  // <div class="skeleton-screen" data-skeleton="<id>" aria-busy="true">
export function errorBox(what)                      // «No se pudieron cargar los datos de <what>.» y button[data-action="retry"]
export function errorScreen({ screenId, title, what, back = null })   // section[data-state="error"] con screenHead y caja
export function routeNotice(text)                   // p.notice.route-notice[role="status"]
```

### Marcadores estables para las pruebas de navegador

| Qué | Marcador |
|---|---|
| Pantalla pintada | `#contenido section[data-screen]`; la portada, con `data-state="A|B|C|D|E|X"`; la provisional, con `data-route`; la de error, con `data-state="error"` |
| Esqueleto | `[data-skeleton]` (nunca `data-screen` ni `h1`) |
| Barra | `.tabbar a.tab[aria-current="page"|"true"]` |
| Cabecera de pantalla | `header.screen-head`, `a.back[data-action="back"]`, `a.screen-action` («Cambiar», «Otro grupo») y `button.screen-action[data-action="share"]` |
| Portada | `[data-action="elegir"][data-index]`, `[data-action="compartir"]`, `[data-action="calendario"]`, `[data-slot="calendario"]` y `#calendario` (desde 1024 px) |
| Jornada | `a.round-step` con `#round-prev` y `#round-next` (en los extremos, `span.round-step.is-off` con el mismo `id`), `.round-title`, `.day`, `a.match-row.is-mine`, `[data-action="share-round"]` y `[data-action="group-calendar"]` |
| Tabla | `.tabla-views.is-narrow` y `.is-wide` con sus `a.segment` (`#vista-<valor>` y `#vista-ancha-<valor>`), `.tabla-<vista>` y `tr.is-mine` |
| Partido | `button[data-action="previous"][aria-controls="partido-anteriores"]`, `#partido-anteriores` y `.pt-h2h-row.is-current` |
| Error y avisos | `button[data-action="retry"]`, `.shell-offline` y `.route-notice` |
| Bloques | `section.block` con su `h2.block-title` |

### `index.html` y `sw.js`

- `index.html`, en este orden: `a.skip-link[href="#contenido"]`; `header.shell-header` con `renderHeader()` (marca, `nav.tabbar` idéntica a `ui.tabbar('miequipo')` y el hueco del aviso); `main#contenido.page` con `skeleton('home')`; `span#legacyUpdated[hidden]`; los 9 `data-*.js` de hoy, en su orden; el arranque, un módulo en línea que, si un SW controla la página, quita de las cachés de la app anterior (las que guardan `src/render.js`) sus `app.js`, `state.js` y `links.js` (decisión 116) y después hace `const { start } = await import('./src/app.js?v=…'); start(document, window);`; y el registro del SW. La hoja es `<link rel="stylesheet" href="./acta.css?v=…">` (decisión 115).
- `sw.js`: `CACHE_NAME` en la línea 1; `STATIC_ASSETS` son `./`, `index.html`, `acta.css`, `manifest.json`, `data-health.json`, la fuente, los cuatro iconos PNG, el grafo exacto de `src/app.js` (17 módulos desde la Tarea 12) y los 9 inmediatos. `test_sw_fixes.mjs` compara el grafo con el real.

### Pruebas de navegador (Tarea 13)

```js
// render-smoke.mjs (Tarea 4)
export function checkRenderedDom(dom, { teamName } = {})   // → { ok, failures, state } (decisión 29)
export function startServer()   // servidor estático de la raíz del repo
export function findChrome()    // el Chrome del sistema o null
// browser-wait.mjs (de antes): waitForAsync(page, predicate, arg, { timeout, interval })
// fixture-site.mjs
export const STORE_KEY                                           // 'futbol-base:v2'
export const WORLDS                                              // { A, B, C, D, E, X }
export async function useWorld(context, name, { fail = [] } = {})   // rutas de datos y config.js, reloj y almacén
// (la clasificación de A y C, la de su día: decisión 126)
// pwa-smoke.mjs (Tarea 4): la versión anterior es scripts/tests/fixtures/app-anterior/ (decisión 117); las dos
//   versiones, con los datos y el config.js congelados (decisión 130)
// test_rediseno_config.mjs (Tarea 12): node --import fixtures/config-2026-2027/register.mjs --test … (decisión 129)
```

---

### Task 1: `scripts/sync_versions.py` y el procedimiento de rebase (decisión 8)

El bot comitea en `main` `index.html`, `sw.js` y `data-*` cada pocas horas, y desde el corte cada rebase de `rediseno-acta` choca en `index.html`: esta tarea deja la herramienta y el procedimiento listos antes de necesitarlos, con pruebas sobre ficheros sintéticos.

**Files:**
- Crear: `scripts/sync_versions.py` y `docs/rediseno-rebase.md`.
- Probar: `scripts/tests/test_sync_versions.py` (nuevo).

**Interfaces:**
- Consumes: el contrato del bot, que es el de `bump_cache_version` (`scripts/generate_js.py`). Reescribe tres marcas:
  - todas las `\?v=\d{8}[a-z]?` de `index.html`;
  - el literal `Última actualización: DD/MM/AAAA` de `index.html`;
  - la primera `futbolbase-v[0-9a-z]+` de `sw.js`, que es `CACHE_NAME`, en la línea 1.
- Produces:

```python
# scripts/sync_versions.py
class MarksError(ValueError)                               # a index.html o sw.js les falta alguna marca
marks(index_html, sw_js) -> {'v': '20260923j', 'footer': '23/09/2026', 'cache': '20260923j'}
apply_marks(index_html, sw_js, wanted) -> (index_html, sw_js)    # todas las ?v=, el literal y la primera CACHE_NAME
differences(index_html, sw_js, wanted) -> [str]                  # lo que no coincide; [] si todo coincide
only_marks_changed(old_index, old_sw, new_index, new_sw) -> bool # True si solo cambian las marcas del bot
main(argv=None) -> int
# CLI, desde la raíz del repositorio:
#   python3 scripts/sync_versions.py --from REF --since BASE   # 0 si de BASE a REF solo cambian las marcas; 1 si no
#   python3 scripts/sync_versions.py --from REF                # index.html y sw.js del árbol, con las marcas de REF
#   python3 scripts/sync_versions.py --from REF --check        # 0 si ya las llevan; 1 y la lista, si no
```

- [ ] **Step 1: Write the failing test**

Crear `scripts/tests/test_sync_versions.py`:

```python
"""Plan B2, tarea 1: rebase de la rama del rediseño (decisión 8).

El bot comitea en main index.html, sw.js y data-*. Al rebasar la rama, en
index.html y sw.js se queda la estructura de la rama con las marcas de versión
de main: todas las ?v=, el literal «Última actualización» y el CACHE_NAME de la
línea 1 de sw.js, las mismas que reescribe generate_js.bump_cache_version.
Ficheros sintéticos: nunca los index.html ni sw.js reales.
"""
import re
import subprocess
import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import sync_versions  # noqa: E402

MAIN_INDEX = (
    '<link rel="stylesheet" href="./style.css?v=20260930b">\n'
    '<div id="sec-miequipo"></div>\n'
    '<span id="legacyUpdated" hidden>Última actualización: 30/09/2026</span>\n'
    '<script src="./data-benjamin.js?v=20260930b"></script>\n'
    '<script src="./data-seasons.js?v=20260930b"></script>\n'
    '<script type="module" src="./src/app.js?v=20260930b"></script>\n'
)
MAIN_SW = (
    "const CACHE_NAME = 'futbolbase-v20260930b';\n"
    "const STATIC_ASSETS = ['./', './src/render.js'];\n"
)
BRANCH_INDEX = (
    '<link rel="stylesheet" href="./style.css?v=20260923j">\n'
    '<main id="contenido" class="page"><div class="box skeleton"></div></main>\n'
    '<span id="legacyUpdated" hidden>Última actualización: 23/09/2026</span>\n'
    '<script src="./data-benjamin.js?v=20260923j"></script>\n'
    '<script src="./data-seasons.js?v=20260923j"></script>\n'
    '<script type="module" src="./src/app.js?v=20260923j"></script>\n'
)
BRANCH_SW = (
    "const CACHE_NAME = 'futbolbase-v20260923j';\n"
    "// Rediseño: sin la caché futbolbase-vieja de antes\n"
    "const STATIC_ASSETS = ['./', './src/screen-home.js'];\n"
)


def test_marks_lee_las_tres_marcas():
    assert sync_versions.marks(MAIN_INDEX, MAIN_SW) == {
        "v": "20260930b", "footer": "30/09/2026", "cache": "20260930b",
    }


def test_la_rama_conserva_su_estructura_con_las_marcas_de_main():
    index, sw = sync_versions.apply_marks(
        BRANCH_INDEX, BRANCH_SW, sync_versions.marks(MAIN_INDEX, MAIN_SW))
    assert index == BRANCH_INDEX.replace("20260923j", "20260930b").replace("23/09/2026", "30/09/2026")
    assert index.count("?v=20260930b") == 4
    assert '<div class="box skeleton">' in index and "sec-miequipo" not in index
    assert sw.splitlines()[0] == "const CACHE_NAME = 'futbolbase-v20260930b';"
    assert sw.splitlines()[1:] == BRANCH_SW.splitlines()[1:], "solo cambia la línea 1"
    assert "screen-home.js" in sw and "render.js" not in sw


def test_solo_la_primera_cache_name_como_el_bot():
    _, sw = sync_versions.apply_marks(
        BRANCH_INDEX, BRANCH_SW, {"v": "20261001", "footer": "01/10/2026", "cache": "20261001"})
    assert "futbolbase-vieja" in sw, "count=1, igual que bump_cache_version"


def test_es_idempotente():
    want = sync_versions.marks(MAIN_INDEX, MAIN_SW)
    once = sync_versions.apply_marks(BRANCH_INDEX, BRANCH_SW, want)
    assert sync_versions.apply_marks(*once, want) == once


@pytest.mark.parametrize("index, sw, missing", [
    (MAIN_INDEX.replace("Última actualización: 30/09/2026", ""), MAIN_SW, "Última actualización"),
    (MAIN_INDEX.replace("?v=20260930b", ""), MAIN_SW, "?v="),
    (MAIN_INDEX, "const CACHE_NAME = 'otra';\n", "CACHE_NAME"),
], ids=["sin-literal", "sin-v", "sin-cache-name"])
def test_sin_una_marca_se_para(index, sw, missing):
    with pytest.raises(sync_versions.MarksError, match=re.escape(missing)):
        sync_versions.marks(index, sw)


def test_la_rama_tambien_tiene_que_llevar_las_marcas_del_bot():
    want = sync_versions.marks(MAIN_INDEX, MAIN_SW)
    with pytest.raises(sync_versions.MarksError, match="Última actualización"):
        sync_versions.apply_marks(BRANCH_INDEX.replace("Última actualización: 23/09/2026", ""), BRANCH_SW, want)


def _git(root, *args):
    subprocess.run(["git", "-C", str(root), "-c", "user.name=prueba", "-c", "user.email=prueba@example.test",
                    *args], check=True, capture_output=True)


@pytest.fixture
def repo(tmp_path):
    """Repositorio con main (las marcas buenas) y la rama en el árbol de trabajo."""
    _git(tmp_path, "init", "-q", "-b", "main")
    (tmp_path / "index.html").write_text(MAIN_INDEX, encoding="utf-8")
    (tmp_path / "sw.js").write_text(MAIN_SW, encoding="utf-8")
    _git(tmp_path, "add", "index.html", "sw.js")
    _git(tmp_path, "commit", "-q", "-m", "main")
    (tmp_path / "index.html").write_text(BRANCH_INDEX, encoding="utf-8")
    (tmp_path / "sw.js").write_text(BRANCH_SW, encoding="utf-8")
    return tmp_path


def test_cli_reescribe_con_las_marcas_de_la_ref(repo, capsys):
    assert sync_versions.main(["--from", "main", "--root", str(repo)]) == 0
    index = (repo / "index.html").read_text(encoding="utf-8")
    sw = (repo / "sw.js").read_text(encoding="utf-8")
    assert "?v=20260923j" not in index and index.count("?v=20260930b") == 4
    assert "Última actualización: 30/09/2026" in index and "skeleton" in index
    assert sw.startswith("const CACHE_NAME = 'futbolbase-v20260930b';\n") and "screen-home.js" in sw
    assert "20260930b" in capsys.readouterr().out


def test_cli_check_avisa_si_alguna_marca_no_coincide(repo, capsys):
    assert sync_versions.main(["--from", "main", "--root", str(repo), "--check"]) == 1
    assert "?v=" in capsys.readouterr().out
    assert (repo / "index.html").read_text(encoding="utf-8") == BRANCH_INDEX, "--check no escribe"
    sync_versions.main(["--from", "main", "--root", str(repo)])
    assert sync_versions.main(["--from", "main", "--root", str(repo), "--check"]) == 0


def test_cli_check_detecta_una_v_suelta(repo):
    sync_versions.main(["--from", "main", "--root", str(repo)])
    path = repo / "index.html"
    path.write_text(path.read_text(encoding="utf-8").replace(
        "./data-seasons.js?v=20260930b", "./data-seasons.js?v=20260923j"), encoding="utf-8")
    assert sync_versions.main(["--from", "main", "--root", str(repo), "--check"]) == 1


def test_solo_marcas_distingue_al_bot_de_un_arreglo_en_main():
    bot_index = MAIN_INDEX.replace("20260930b", "20261002").replace("30/09/2026", "02/10/2026")
    bot_sw = MAIN_SW.replace("20260930b", "20261002")
    assert sync_versions.only_marks_changed(MAIN_INDEX, MAIN_SW, bot_index, bot_sw)
    arreglo = MAIN_INDEX.replace('<div id="sec-miequipo"></div>', '<div id="sec-miequipo" class="active"></div>')
    assert not sync_versions.only_marks_changed(MAIN_INDEX, MAIN_SW, arreglo, MAIN_SW)
    assert not sync_versions.only_marks_changed(MAIN_INDEX, MAIN_SW, MAIN_INDEX, MAIN_SW + "// otra línea\n")


def test_cli_since_avisa_si_main_cambio_algo_mas_que_las_marcas(repo, capsys):
    bot = MAIN_INDEX.replace("20260930b", "20261002")
    for tag, index in (("bot", bot), ("arreglo", bot.replace("sec-miequipo", "sec-otra"))):
        (repo / "index.html").write_text(index, encoding="utf-8")
        _git(repo, "add", "index.html")
        _git(repo, "commit", "-q", "-m", tag)
        _git(repo, "tag", tag)
    (repo / "index.html").write_text(BRANCH_INDEX, encoding="utf-8")
    assert sync_versions.main(["--from", "bot", "--since", "main~2", "--root", str(repo)]) == 0
    assert sync_versions.main(["--from", "arreglo", "--since", "main~2", "--root", str(repo)]) == 1
    assert "a mano" in capsys.readouterr().out
    assert (repo / "index.html").read_text(encoding="utf-8") == BRANCH_INDEX, "--since no escribe"
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd /home/manolo/claude/futbol-base
python3 -m pytest scripts/tests/test_sync_versions.py -q 2>&1 | grep -E "ModuleNotFoundError"
```
Esperado:
```text
E   ModuleNotFoundError: No module named 'sync_versions'
```

- [ ] **Step 3: Write the implementation**

Crear `scripts/sync_versions.py`:

```python
#!/usr/bin/env python3
"""Rebase de la rama del rediseño (Plan B2, decisión 8).

El bot de main (update.yml, fetch-fiflp.yml y fetch-fiflp-actas.yml) solo toca
tres marcas de index.html y sw.js, y siempre a la vez (bump_cache_version de
generate_js.py): todas las ?v=, el literal «Última actualización» de
index.html y el CACHE_NAME de la línea 1 de sw.js. Al rebasar la rama sobre
main, los dos ficheros se quedan con la estructura de la rama y esas marcas
de main. El procedimiento completo está en docs/rediseno-rebase.md.

Uso, desde la raíz del repositorio:
  python3 scripts/sync_versions.py --from origin/main --since BASE  # 1 si main cambió algo más que las marcas
  python3 scripts/sync_versions.py --from origin/main               # reescribe index.html y sw.js
  python3 scripts/sync_versions.py --from origin/main --check       # 1 si alguna marca no coincide
"""
import argparse
import re
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
FILES = ("index.html", "sw.js")
# Los mismos patrones que bump_cache_version (generate_js.py).
VERSION_RE = re.compile(r"\?v=(\d{8}[a-z]?)")
FOOTER_RE = re.compile(r"Última actualización: (\d{2}/\d{2}/\d{4})")
CACHE_RE = re.compile(r"futbolbase-v([0-9a-z]+)")


class MarksError(ValueError):
    """A index.html o sw.js les falta alguna marca de versión del bot."""


def marks(index_html, sw_js):
    """Las marcas de un par index.html + sw.js: {'v', 'footer', 'cache'}.

    La ?v= es la primera del fichero, la misma que usa _next_version.
    Lanza MarksError si falta alguna: sin ellas, el bot tampoco puede subir la versión.
    """
    found = {"?v=": VERSION_RE.search(index_html),
             "Última actualización": FOOTER_RE.search(index_html),
             "CACHE_NAME": CACHE_RE.search(sw_js)}
    missing = [name for name, match in found.items() if not match]
    if missing:
        raise MarksError("faltan marcas de versión: " + ", ".join(missing))
    return {"v": found["?v="].group(1), "footer": found["Última actualización"].group(1),
            "cache": found["CACHE_NAME"].group(1)}


def apply_marks(index_html, sw_js, wanted):
    """index.html y sw.js con las marcas `wanted`: todas las ?v=, el literal y la primera CACHE_NAME."""
    marks(index_html, sw_js)  # la rama también cumple el contrato del bot
    index = VERSION_RE.sub(f"?v={wanted['v']}", index_html)
    index = FOOTER_RE.sub(f"Última actualización: {wanted['footer']}", index)
    sw = CACHE_RE.sub(f"futbolbase-v{wanted['cache']}", sw_js, count=1)
    return index, sw


def differences(index_html, sw_js, wanted):
    """Lo que no coincide con `wanted`, en líneas legibles; [] si todo coincide."""
    have = marks(index_html, sw_js)
    out = [f"?v={v} (debería ser ?v={wanted['v']})"
           for v in sorted(set(VERSION_RE.findall(index_html))) if v != wanted["v"]]
    if have["footer"] != wanted["footer"]:
        out.append(f"Última actualización: {have['footer']} (debería ser {wanted['footer']})")
    if have["cache"] != wanted["cache"]:
        out.append(f"CACHE_NAME futbolbase-v{have['cache']} (debería ser futbolbase-v{wanted['cache']})")
    return out


def only_marks_changed(old_index, old_sw, new_index, new_sw):
    """True si de (old_index, old_sw) a (new_index, new_sw) solo cambian las marcas del bot."""
    neutral = {"v": "00000000", "footer": "00/00/0000", "cache": "0"}
    return apply_marks(old_index, old_sw, neutral) == apply_marks(new_index, new_sw, neutral)


def git_show(root, ref, path):
    """El fichero `path` tal como está en `ref`."""
    return subprocess.run(["git", "-C", str(root), "show", f"{ref}:{path}"],
                          check=True, capture_output=True, text=True, encoding="utf-8").stdout


def main(argv=None):
    parser = argparse.ArgumentParser(
        description="Copia en index.html y sw.js las marcas de versión de otra rama (main).")
    parser.add_argument("--from", dest="ref", required=True,
                        help="rama o commit con las marcas buenas, normalmente origin/main")
    parser.add_argument("--check", action="store_true",
                        help="no escribe nada: sale con 1 si alguna marca no coincide")
    parser.add_argument("--since", metavar="BASE",
                        help="no escribe nada: sale con 1 si de BASE a --from cambió algo más que las marcas")
    parser.add_argument("--root", default=str(ROOT), help=argparse.SUPPRESS)
    args = parser.parse_args(argv)
    root = Path(args.root)
    main_files = [git_show(root, args.ref, name) for name in FILES]
    wanted = marks(*main_files)
    if args.since:
        if only_marks_changed(*(git_show(root, args.since, name) for name in FILES), *main_files):
            print(f"de {args.since} a {args.ref}, index.html y sw.js solo cambian las marcas de versión")
            return 0
        print(f"de {args.since} a {args.ref}, index.html o sw.js cambian algo más que las marcas: "
              "llévalo a mano a la rama (docs/rediseno-rebase.md)")
        return 1
    paths = [root / name for name in FILES]
    index, sw = (path.read_text(encoding="utf-8") for path in paths)
    if args.check:
        diff = differences(index, sw, wanted)
        for line in diff:
            print(f"distinta de {args.ref}: {line}")
        if not diff:
            print(f"index.html y sw.js llevan las marcas de {args.ref}: ?v={wanted['v']}")
        return 1 if diff else 0
    for path, old, new in zip(paths, (index, sw), apply_marks(index, sw, wanted)):
        if new != old:
            path.write_text(new, encoding="utf-8")
    print(f"marcas de {args.ref}: ?v={wanted['v']}, Última actualización: {wanted['footer']}, "
          f"CACHE_NAME futbolbase-v{wanted['cache']}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
```

Crear `docs/rediseno-rebase.md`:

````markdown
# Rebase de la rama del rediseño (`rediseno-acta`)

El rediseño «Acta» se construye en la rama `rediseno-acta` y no se fusiona en `main` hasta B5. Mientras tanto, el bot sigue comiteando en `main` cada pocas horas, y la rama se rebasa a menudo sobre `main` (spec §12). Este es el procedimiento (Plan B2, decisión 8).

## Qué choca y qué se queda

El bot (`update.yml`, `fetch-fiflp.yml` y `fetch-fiflp-actas.yml`) comitea tres cosas:

- **`data-*.js`, `data-health.json` y `futbolbase.db`.** La rama no los toca, así que no chocan. Si alguno chocara, se queda el de `main`: `git checkout --ours -- <fichero>` (en un rebase, «ours» es `main`).
- **`sw.js`.** El bot solo cambia `CACHE_NAME` en la línea 1, y la rama cambia `STATIC_ASSETS`. Git suele mezclarlo solo.
- **`index.html`.** El bot sube todas las `?v=` y el literal oculto «Última actualización». Desde el corte, la rama tiene otro `index.html`, y el choque es casi seguro.

Siempre se queda **la estructura de la rama con las marcas de versión de `main`**: las `?v=`, «Última actualización» y `CACHE_NAME`. Lo hace `scripts/sync_versions.py`. `CACHE_NAME` y las `?v=` no se suben a mano en B2 (decisión 7): la subida conjunta es del despliegue de B4 y B5.

## Antes de rebasar

```bash
cd /home/manolo/claude/futbol-base
git status --short
git fetch origin
git switch rediseno-acta
python3 scripts/sync_versions.py --from origin/main --since "$(git merge-base HEAD origin/main)"
```

- `git status` no debe mostrar ficheros modificados. `HANDOFF.md` y `docs/mejoras-2026-09.md` salen con `??` porque no están en git, y no cuentan.
- `sync_versions.py --since` comprueba que, desde la base común, `main` solo ha cambiado las marcas de versión de `index.html` y `sw.js`. Si sale con 1, alguien arregló algo en esos ficheros en `main`: hay que llevar ese cambio a mano a la rama después del rebase, porque la estructura de la rama lo sustituye.

## Rebasar

```bash
cd /home/manolo/claude/futbol-base
git rebase origin/main
```

Si se para con un conflicto:

```bash
cd /home/manolo/claude/futbol-base
git diff --name-only --diff-filter=U
```

Si los únicos ficheros en conflicto son `index.html`, `sw.js` o los dos:

```bash
cd /home/manolo/claude/futbol-base
git checkout --theirs -- $(git diff --name-only --diff-filter=U -- index.html sw.js)
python3 scripts/sync_versions.py --from origin/main
git add index.html sw.js
GIT_EDITOR=true git rebase --continue
```

- En un rebase, «theirs» es el commit de la rama que se está aplicando: su estructura.
- `sync_versions.py` le pone las marcas de `origin/main`.

Se repite en cada parada hasta que termine el rebase. Un conflicto en cualquier otro fichero se resuelve a mano: el bot nunca toca `src/`, `scripts/` ni `docs/`.

## Después de rebasar

```bash
cd /home/manolo/claude/futbol-base
python3 scripts/sync_versions.py --from origin/main --check
python3 -m pytest scripts/tests/ -q
node --test scripts/tests/test_*.mjs
node scripts/tests/render-smoke.mjs
node scripts/tests/interaction-smoke.mjs
node scripts/tests/pwa-smoke.mjs
```

- `--check` sale con 0 si `index.html` y `sw.js` llevan las marcas de `origin/main`. Si no, dice cuáles faltan.
- Después vienen las suites y los tres smoke, todos en verde. Los smoke necesitan Playwright (`npm install --no-save --package-lock=false playwright@1.58.0`) y Chrome.

## Empujar

**Nunca se empuja con un workflow en marcha.**

```bash
cd /home/manolo/claude/futbol-base
gh run list --limit 3
git push --force-with-lease origin rediseno-acta
```

`gh run list` no debe mostrar ninguna ejecución `in_progress` ni `queued`. `--force-with-lease` no pisa la rama remota si alguien la movió después del último `fetch`.

El PR borrador hacia `main` vuelve a lanzar `tests.yml`, con las suites y los tres smoke.
````

- [ ] **Step 4: Run test to verify it passes**

```bash
cd /home/manolo/claude/futbol-base
python3 -m pytest scripts/tests/test_sync_versions.py -q 2>&1 | tail -1 | sed -E 's/ in [0-9.]+s$//'
```
Esperado:
```text
13 passed
```

- [ ] **Step 5: Suites completas**

```bash
cd /home/manolo/claude/futbol-base
python3 -m pytest scripts/tests/ -q 2>&1 | tail -1
node --test scripts/tests/test_*.mjs 2>&1 | grep -E '^# (tests|pass|fail)'
```
Esperado:
- pytest: el recuento anterior más 13, sin `failed`.
- node: el mismo recuento que antes, con `# fail 0`: la tarea no toca JavaScript.

- [ ] **Step 6: Commit**

```bash
cd /home/manolo/claude/futbol-base
git add scripts/sync_versions.py scripts/tests/test_sync_versions.py docs/rediseno-rebase.md
git commit -F - <<'EOF'
feat(rediseño): sync_versions.py y procedimiento de rebase (B2, tarea 1)

Al rebasar rediseno-acta sobre main, index.html y sw.js conservan la
estructura de la rama con las marcas de versión de main: todas las ?v=,
el literal «Última actualización» y CACHE_NAME, las tres que sube el
bot (decisión 8). --since avisa si main cambió en esos ficheros algo
más que las marcas y --check comprueba el resultado. El procedimiento,
en docs/rediseno-rebase.md.

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01Sg56KK3oZgo8Ye7Snj6wG9
EOF
git show --stat --oneline HEAD | tail -1
```
Esperado: `3 files changed`, todo inserciones.

---

### Task 2: `state.js` y `links.js` preparan el corte sin romper la app vieja

`state.js` gana `shieldFile`, `dataVersion` y un tiempo límite de 15 s en todos los perezosos, `readGlobals` y `ensureHealth`, y `links.js` gana `canaryTodayISO` y `matchDateISO`: todo es aditivo y la app vieja no cambia de comportamiento.

**Files:**
- Modificar: `src/state.js`, `src/ui.js` (`crest`), `src/myteam.js` (`buildClubIndex`), `src/links.js` y `scripts/tests/test_js_modules.mjs` (la prueba del `fetch` de `data-matchdetail.js`).
- Probar: `scripts/tests/test_rediseno_state.mjs` y `scripts/tests/test_rediseno_fechas.mjs` (nuevos).

**Interfaces:**
- Consumes: `normalizeTeamName` (`state.js`).
- Produces:

```js
// state.js
export function shieldFile(name, shields)   // → fichero de escudo (clave exacta o nombre normalizado, la primera
                                            //   clave gana) o null; nunca por subcadena. Sin HTML (spec §5.2)
export function readGlobals()               // → { benjamin, prebenjamin, history, golBenj, golPrebenj, shields, seasons,
                                            //     cupBenjamin, cupPrebenjamin }: identificador desnudo con typeof, null si falta
export function dataVersion()               // → '20260923j', la ?v= de <script src*="data-seasons.js">; '' sin documento o sin script
export async function ensureHealth()        // → data-health.json parseado o null; un solo vuelo; un fallo no se memoriza
export const LAZY_TIMEOUT_MS = 15000         // tiempo límite de cada petición perezosa, cuerpo incluido
// ensureMatchDetail(), ensureSeasonData(name), ensureLineups(season), ensurePlayers(season) y ensureHealth() piden
// con fetchData(file): la ?v= de dataVersion() (los tres primeros la tomaban de data-matchdetail-keys.js) y un
// AbortController que corta la petición a los LAZY_TIMEOUT_MS; entonces fallan como con un error de red (null).

// links.js
export function canaryTodayISO(now = new Date(), timeZone = 'Atlantic/Canary')  // → 'AAAA-MM-DD' en esa zona (decisión 4)
export function matchDateISO(d, todayISO)   // → la de miequipo.js, tal cual; la copia vieja se va en la Tarea 4
```

- `crest` (`ui.js`) y `buildClubIndex` (`myteam.js`) buscan el escudo con `shieldFile`, con las mismas salidas que hoy: las pruebas de B1 no cambian (M7 de «Para B2»).

- [ ] **Step 1: Write the failing test**

Crear `scripts/tests/test_rediseno_state.mjs`:

```js
// Plan B2, tarea 2: state.js prepara el corte sin romper la app vieja.
// - shieldFile: el fichero de escudo exacto o normalizado, nunca por subcadena; lo usan ui.js
//   (crest) y myteam.js (buildClubIndex), que antes repetían la búsqueda (M7 de B1).
// - dataVersion(): la ?v= de <script src="data-seasons.js">, en todas las peticiones perezosas.
// - Tiempo límite: una petición perezosa que no responde se corta a los 15 s (fetchData).
// - readGlobals() y ensureHealth().
// El navegador se simula: un document con los <script> de datos y un fetch que anota las URLs.
import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { fixture } from './fixtures/rediseno/load.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const read = (path) => readFileSync(join(ROOT, path), 'utf8');

// El <script> de data-seasons.js lleva la versión de los datos; el de data-matchdetail-keys.js,
// otra, para comprobar que ya no manda.
const scripts = {
  'data-seasons.js': './data-seasons.js?v=20260923j',
  'data-matchdetail-keys.js': './data-matchdetail-keys.js?v=VIEJA',
};
globalThis.document = {
  querySelector(selector) {
    const m = String(selector).match(/^script\[src\*="([^"]+)"\]$/);
    const src = m ? scripts[m[1]] : undefined;
    return src ? { src: 'http://127.0.0.1:8000/' + src.slice(2), getAttribute: (name) => (name === 'src' ? src : null) } : null;
  },
  querySelectorAll: () => [],
  addEventListener() {},
};
const requests = [];
const bodies = {
  'data-matchdetail.js': 'const MATCH_DETAIL={"a|b|1-0":{"s":"2025-2026","gr":"PG2","g":[]}};',
  'data-season-2024-2025.js': 'const SEASON_2024_2025={"name":"2024-2025","current":false,"benjamin":[],"prebenjamin":[]};',
  'data-season-2023-2024.js': 'const SEASON_2023_2024={"name":"2023-2024","current":false,"benjamin":[],"prebenjamin":[]};',
  'data-lineups-2025-2026.js': 'const LINEUPS_2025_2026={};',
  'data-players-2025-2026.js': 'const PLAYERS_2025_2026={};\nconst TEAMS_2025_2026={};',
  'data-health.json': null,   // cada prueba de ensureHealth decide
};
globalThis.fetch = async (url) => {
  requests.push(String(url));
  const body = bodies[String(url).replace(/^\.\//, '').replace(/\?.*$/, '')];
  return body == null
    ? { ok: false, status: 404, text: async () => '' }
    : { ok: true, status: 200, text: async () => body };
};

const state = await import('../../src/state.js');

test('dataVersion: la ?v= del <script> de data-seasons.js, o "" si no está', () => {
  assert.equal(state.dataVersion(), '20260923j');
  const saved = scripts['data-seasons.js'];
  delete scripts['data-seasons.js'];
  try {
    assert.equal(state.dataVersion(), '');
  } finally {
    scripts['data-seasons.js'] = saved;
  }
});

test('nada espera para siempre: cada petición perezosa se corta a los 15 s y la carga falla (null) sin memorizarse', async (t) => {
  assert.equal(state.LAZY_TIMEOUT_MS, 15000, 'el tiempo límite de las peticiones perezosas');
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const saved = globalThis.fetch;
  const hung = [];
  // Un servidor que no responde nunca: la promesa solo termina si la petición se aborta.
  globalThis.fetch = (url, { signal } = {}) => new Promise((resolve, reject) => {
    hung.push(String(url));
    signal?.addEventListener('abort', () => reject(Object.assign(new Error('abortada'), { name: 'AbortError' })));
  });
  const quiet = { error: console.error, warn: console.warn };
  console.error = () => {};
  console.warn = () => {};
  try {
    const loads = [state.ensureMatchDetail(), state.ensureSeasonData('2022-2023'), state.ensureLineups('2023-2024'),
      state.ensurePlayers('2023-2024'), state.ensureHealth()];
    assert.equal(hung.length, 5, hung.join(', '));
    t.mock.timers.tick(state.LAZY_TIMEOUT_MS - 1);
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(hung.length, 5, 'todavía en vuelo');
    t.mock.timers.tick(1);
    assert.deepEqual(await Promise.all(loads), [null, null, null, null, null]);
  } finally {
    globalThis.fetch = saved;
    console.error = quiet.error;
    console.warn = quiet.warn;
  }
});

test('ensureHealth: null si falla, un solo vuelo al reintentar, memoria y la versión de los datos', async () => {
  requests.length = 0;
  bodies['data-health.json'] = null;
  assert.equal(await state.ensureHealth(), null, 'un fallo no lanza: null');
  bodies['data-health.json'] = JSON.stringify(fixture('health'));
  const [a, b] = await Promise.all([state.ensureHealth(), state.ensureHealth()]);
  assert.equal(a, b, 'las dos llamadas comparten el vuelo');
  assert.equal(a.nextSeason.status, 'pending');
  assert.equal(await state.ensureHealth(), a, 'cargado una vez, no se vuelve a pedir');
  assert.deepEqual(requests, ['./data-health.json?v=20260923j', './data-health.json?v=20260923j']);
});

test('cada petición perezosa lleva la versión de data-seasons.js, nunca la de data-matchdetail-keys.js', async () => {
  requests.length = 0;
  assert.ok(await state.ensureMatchDetail());
  assert.ok(await state.ensureSeasonData('2024-2025'));
  assert.ok(await state.ensureLineups('2025-2026'));
  assert.ok(await state.ensurePlayers('2025-2026'));
  assert.deepEqual(requests.map((url) => url.replace(/\?.*$/, '')), [
    './data-matchdetail.js', './data-season-2024-2025.js', './data-lineups-2025-2026.js',
    './data-players-2025-2026.js',
  ]);
  for (const url of requests) assert.match(url, /\?v=20260923j$/, url);
});

test('sin el <script> de data-seasons.js, las peticiones van sin ?v=', async () => {
  const saved = scripts['data-seasons.js'];
  delete scripts['data-seasons.js'];
  requests.length = 0;
  try {
    assert.ok(await state.ensureSeasonData('2023-2024'));
  } finally {
    scripts['data-seasons.js'] = saved;
  }
  assert.deepEqual(requests, ['./data-season-2023-2024.js']);
});

test('todas las peticiones perezosas pasan por fetchData(): la versión de los datos y el tiempo límite', () => {
  const src = read('src/state.js');
  assert.equal((src.match(/\bfetch\(/g) || []).length, 1, 'un solo fetch en state.js, el de fetchData');
  assert.match(src, /await fetch\(`\.\/\$\{file\}\$\{dataQuery\(\)\}`, \{ signal: controller\.signal \}\)/);
  const loaders = src.match(/await fetchData\(/g) || [];
  assert.equal(loaders.length, 5, 'matchdetail, temporadas, actas, jugadores y data-health');
  assert.doesNotMatch(src, /data-matchdetail-keys\.js"\]/, 'la versión ya no sale de data-matchdetail-keys.js');
});

test('readGlobals: los nueve globales inmediatos con typeof, null si falta', () => {
  const KEYS = { benjamin: 'BENJAMIN', prebenjamin: 'PREBENJAMIN', history: 'HISTORY', golBenj: 'GOL_BENJ',
    golPrebenj: 'GOL_PREBENJ', shields: 'SHIELDS', seasons: 'SEASONS', cupBenjamin: 'MASPALOMAS_CUP_BENJAMIN',
    cupPrebenjamin: 'MASPALOMAS_CUP_PREBENJAMIN' };
  assert.deepEqual(state.readGlobals(), Object.fromEntries(Object.keys(KEYS).map((key) => [key, null])));
  const cur = fixture('current-2025-2026');
  const cups = fixture('cups-2025-2026');
  const values = { BENJAMIN: cur.benjamin, PREBENJAMIN: cur.prebenjamin, HISTORY: cur.history, GOL_BENJ: [],
    GOL_PREBENJ: [], SHIELDS: fixture('shields'), SEASONS: [{ name: '2025-2026', current: true }],
    MASPALOMAS_CUP_BENJAMIN: cups.benjamin, MASPALOMAS_CUP_PREBENJAMIN: cups.prebenjamin };
  // Las propiedades del objeto global se ven como identificadores desnudos, igual que los
  // `const` de los data-*.js en el navegador.
  Object.assign(globalThis, values);
  try {
    const got = state.readGlobals();
    for (const [key, name] of Object.entries(KEYS)) assert.equal(got[key], values[name], key);
  } finally {
    for (const name of Object.keys(values)) delete globalThis[name];
  }
  const src = read('src/state.js');
  for (const name of Object.values(KEYS)) {
    assert.match(src, new RegExp(`typeof ${name} !== 'undefined' \\? ${name} : null`), name);
  }
});

test('shieldFile: exacto o normalizado, nunca por subcadena', () => {
  const shields = fixture('shields');
  assert.equal(state.shieldFile('Las Mesas Hu.', shields), 'lasMesasEscudo.png');
  assert.equal(state.shieldFile('MESAS, U.D. LAS "B"', shields), 'lasMesasEscudo.png');
  assert.equal(state.shieldFile('Telde', shields), 'udTeldeEscudo.png', 'normalizado: «UD Telde»');
  assert.equal(state.shieldFile('Acodetti', shields), 'acodetti.png', 'normalizado: «Acodetti CF»');
  // Por subcadena, «UD Las Mesas Huracán» se llevaría el escudo de AD Huracán.
  assert.equal(state.shieldFile('UD Las Mesas Huracán', shields), null);
  assert.equal(state.shieldFile('Las Mesas Hu. B', shields), null);
  assert.equal(state.shieldFile('', shields), null);
  assert.equal(state.shieldFile(null, shields), null);
  assert.equal(state.shieldFile('Las Mesas Hu.', null), null);
  assert.equal(state.shieldFile('Las Mesas Hu.', {}), null);
});

test('crest y buildClubIndex buscan el escudo con shieldFile: una sola búsqueda (M7)', async () => {
  for (const file of ['src/ui.js', 'src/myteam.js']) {
    const src = read(file);
    assert.match(src, /import \{[^}]*\bshieldFile\b[^}]*\} from '\.\/state\.js';/, file);
    assert.doesNotMatch(src, /\bnormalizeTeamName\b/, `${file} no normaliza por su cuenta`);
  }
  const { crest } = await import('../../src/ui.js');
  const { buildClubIndex } = await import('../../src/myteam.js');
  const shields = fixture('shields');
  assert.match(String(crest('Telde', { shields })), /data-full="\.\/escudos\/udTeldeEscudo\.png"/);
  assert.match(String(crest('UD Las Mesas Huracán', { shields })), /class="mono mono-16"/);
  // «Las Mesas Hu» (sin punto) solo llega al escudo de «Las Mesas Hu.» normalizando, y así se une a
  // 'MESAS, U.D. LAS "B"', con otra clave base; «UD Las Mesas Huracán» no hereda el de AD Huracán.
  const names = ['Las Mesas Hu', 'MESAS, U.D. LAS "B"', 'UD Las Mesas Huracán', 'AD Huracán'];
  const index = buildClubIndex(names, shields, {});
  assert.equal(index.same('Las Mesas Hu', 'MESAS, U.D. LAS "B"'), true);
  assert.equal(index.same('UD Las Mesas Huracán', 'AD Huracán'), false);
  assert.equal(buildClubIndex(names, {}, {}).same('Las Mesas Hu', 'MESAS, U.D. LAS "B"'), false, 'sin escudos no hay arista');
});
```

Crear `scripts/tests/test_rediseno_fechas.mjs`:

```js
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
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd /home/manolo/claude/futbol-base
node --test scripts/tests/test_rediseno_state.mjs scripts/tests/test_rediseno_fechas.mjs 2>&1 | grep -E '^# (tests|pass|fail)|SyntaxError'
```
Esperado:
```text
# SyntaxError: The requested module '../../src/links.js' does not provide an export named 'canaryTodayISO'
# tests 10
# pass 1
# fail 9
```

- [ ] **Step 3: Write the implementation**

Cada sustitución exige que el texto viejo aparezca una sola vez: si `main` los ha cambiado, el script se para sin escribir ese fichero.

```bash
cd /home/manolo/claude/futbol-base
python3 - <<'PY'
from pathlib import Path


def edit(path, pairs):
    """Sustituye cada `old` (que tiene que aparecer una sola vez) por su `new`."""
    p = Path(path)
    s = p.read_text(encoding='utf-8')
    for old, new in pairs:
        assert s.count(old) == 1, (path, old[:80])
        s = s.replace(old, new)
    p.write_text(s, encoding='utf-8')


edit('src/state.js', [
# shieldFile, justo después de normalizeTeamName
('''let _shieldsNorm = null;
function getShieldsNorm() {''', '''// Fichero de escudo de un equipo (spec §5.2, sustituye a teamBadge): la clave exacta de `shields`
// o, si no está, la primera clave con el mismo nombre normalizado; null si no hay. Nunca por
// subcadena: «UD Las Mesas Huracán» se llevaría el escudo de AD Huracán. Es la única búsqueda de
// escudos de la app: la usan crest (ui.js) y buildClubIndex (myteam.js), que no deben divergir.
const _shieldIndex = new WeakMap();
export function shieldFile(name, shields) {
  if (!name || !shields) return null;
  if (Object.hasOwn(shields, name)) return shields[name];
  let index = _shieldIndex.get(shields);
  if (!index) {
    index = new Map();
    for (const [key, file] of Object.entries(shields)) {
      const norm = normalizeTeamName(key);
      if (norm && !index.has(norm)) index.set(norm, file);
    }
    _shieldIndex.set(shields, index);
  }
  return index.get(normalizeTeamName(String(name))) || null;
}

let _shieldsNorm = null;
function getShieldsNorm() {'''),
# readGlobals, dataVersion y dataQuery, antes del primer cargador
('''/* Lazy loader for the full goal-timeline data. data-matchdetail.js is no
 * longer an eager <script> (it is ~359 KB); fetch+parse it on demand the
 * first time a match modal needs it. Single-flight + module cache. Mirrors
 * loadAllHistoricalSeasons() in modals.js. ?v= is inherited from the eager
 * data-matchdetail-keys.js script tag so cache-busting stays aligned.''', '''// Globales inmediatos de los data-*.js (spec §5.4): identificador desnudo con typeof, nunca a
// través del objeto global, y null si el fichero no ha llegado. Es la puerta de los datos de la
// app nueva: el resto de módulos los recibe por parámetro (datasets).
export function readGlobals() {
  return {
    benjamin: typeof BENJAMIN !== 'undefined' ? BENJAMIN : null,
    prebenjamin: typeof PREBENJAMIN !== 'undefined' ? PREBENJAMIN : null,
    history: typeof HISTORY !== 'undefined' ? HISTORY : null,
    golBenj: typeof GOL_BENJ !== 'undefined' ? GOL_BENJ : null,
    golPrebenj: typeof GOL_PREBENJ !== 'undefined' ? GOL_PREBENJ : null,
    shields: typeof SHIELDS !== 'undefined' ? SHIELDS : null,
    seasons: typeof SEASONS !== 'undefined' ? SEASONS : null,
    cupBenjamin: typeof MASPALOMAS_CUP_BENJAMIN !== 'undefined' ? MASPALOMAS_CUP_BENJAMIN : null,
    cupPrebenjamin: typeof MASPALOMAS_CUP_PREBENJAMIN !== 'undefined' ? MASPALOMAS_CUP_PREBENJAMIN : null,
  };
}

// Versión de los datos (spec §5.4): la ?v= del <script> de data-seasons.js, que index.html
// siempre carga; '' sin documento o sin ese <script>. La llevan todas las peticiones perezosas.
export function dataVersion() {
  if (typeof document === 'undefined') return '';
  const src = document.querySelector('script[src*="data-seasons.js"]')?.getAttribute('src') || '';
  return (src.match(/[?&]v=([^&#]+)/) || [])[1] || '';
}

// La query de las peticiones perezosas: '?v=<versión>' o ''.
function dataQuery() {
  const version = dataVersion();
  return version ? `?v=${version}` : '';
}

// Nada espera para siempre (§7): si una petición perezosa no termina, cuerpo incluido, en
// LAZY_TIMEOUT_MS, se aborta y la carga falla como con un error de red. Lo opcional pinta su
// caja de error en el bloque; lo necesario, en la pantalla, siempre con «Reintentar».
export const LAZY_TIMEOUT_MS = 15000;

// Una petición perezosa: `file` con la ?v= de los datos y el tiempo límite. Devuelve lo que los
// cargadores usan de una respuesta (ok, status y text()), con el cuerpo ya leído dentro del plazo.
async function fetchData(file) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), LAZY_TIMEOUT_MS);
  try {
    const r = await fetch(`./${file}${dataQuery()}`, { signal: controller.signal });
    const body = r.ok ? await r.text() : '';
    return { ok: r.ok, status: r.status, text: async () => body };
  } finally {
    clearTimeout(timer);
  }
}

/* Lazy loader for the full goal-timeline data. data-matchdetail.js is no
 * longer an eager <script> (it is ~359 KB); fetch+parse it on demand the
 * first time a match modal needs it. Single-flight + module cache. Mirrors
 * loadAllHistoricalSeasons() in modals.js. ?v= is dataVersion() (the one of
 * data-seasons.js), like every lazy loader.'''),
# los cuatro cargadores toman la versión de dataQuery()
('''    const ver = (document.querySelector('script[src*="data-matchdetail-keys.js"]')
      ?.src.match(/v=([^&]+)/)?.[1]) || '';
    try {
      const r = await fetch(`./data-matchdetail.js${ver ? `?v=${ver}` : ''}`);''', '''    try {
      const r = await fetchData('data-matchdetail.js');'''),
('''    // Cache-bust per-season files alongside index.html ?v= parameter
    const ver = (document.querySelector('script[src*="data-seasons.js"]')?.src.match(/v=([^&]+)/)?.[1]) || '';
    const url = `./data-season-${seasonName}.js${ver ? `?v=${ver}` : ''}`;
    try {
      const r = await fetch(url);''', '''    try {
      const r = await fetchData(`data-season-${seasonName}.js`);'''),
('''      console.error('[state] ensureSeasonData failed:', url, e);''', '''      console.error('[state] ensureSeasonData failed:', seasonName, e);'''),
('''function _versionFromMatchDetailKeys() {
  return (document.querySelector('script[src*="data-matchdetail-keys.js"]')
    ?.src.match(/v=([^&]+)/)?.[1]) || '';
}

''', ''),
('''    const ver = _versionFromMatchDetailKeys();
    const suffix = _seasonSuffix(season);
    try {
      const r = await fetch('./data-lineups-' + season + '.js' + (ver ? '?v=' + ver : ''));''', '''    const suffix = _seasonSuffix(season);
    try {
      const r = await fetchData(`data-lineups-${season}.js`);'''),
('''    const ver = _versionFromMatchDetailKeys();
    const suffix = _seasonSuffix(season);
    try {
      const r = await fetch('./data-players-' + season + '.js' + (ver ? '?v=' + ver : ''));''', '''    const suffix = _seasonSuffix(season);
    try {
      const r = await fetchData(`data-players-${season}.js`);'''),
# ensureHealth, después de ensurePlayers
('''export function getCurrentSeason() {''', '''// data-health.json (spec §4.10 y §7): la comprobación de las fuentes, parseada, o null si no
// llega (sin conexión, por ejemplo). Un único vuelo: las llamadas simultáneas comparten la
// petición; un fallo no se memoriza y la siguiente llamada reintenta.
let _health = null;
let _healthPromise = null;
async function loadHealth() {
  try {
    const r = await fetchData('data-health.json');
    if (!r.ok) throw new Error('HTTP ' + r.status);
    _health = JSON.parse(await r.text());
    return _health;
  } catch (e) {
    console.warn('[state] ensureHealth failed:', e.message);
    return null;
  }
}
export async function ensureHealth() {
  if (_health) return _health;
  if (!_healthPromise) _healthPromise = loadHealth().finally(() => { _healthPromise = null; });
  return _healthPromise;
}

export function getCurrentSeason() {'''),
])

edit('src/ui.js', [
("import { normalizeTeamName } from './state.js';", "import { shieldFile } from './state.js';"),
('''// Índice normalizado por objeto de escudos (se construye una vez por mapa).
const normalizedIndex = new WeakMap();

// Fichero de escudo exacto o normalizado (spec §5.2), o null.
function lookupShield(name, shields) {
  if (!name || !shields) return null;
  if (Object.hasOwn(shields, name)) return shields[name];
  let index = normalizedIndex.get(shields);
  if (!index) {
    index = new Map();
    for (const [key, file] of Object.entries(shields)) {
      const norm = normalizeTeamName(key);
      if (norm && !index.has(norm)) index.set(norm, file);
    }
    normalizedIndex.set(shields, index);
  }
  return index.get(normalizeTeamName(String(name))) || null;
}

''', ''),
('  const file = lookupShield(name, shields);', '  const file = shieldFile(name, shields);'),
])

edit('src/myteam.js', [
("import { normalizeForTeamsMapping, normalizeTeamName } from './state.js';", "import { normalizeForTeamsMapping, shieldFile } from './state.js';"),
('''// Grafo de nombres (union-find). Cada nombre se une a sus «claves»: 'f:' fichero de escudo
// (exacto o normalizado), 'k:' clave base y 'n:' nombre destino de su alias.
export function buildClubIndex(names, shields = {}, aliases = TEAM_ALIASES) {
  const normalized = new Map();
  for (const [key, file] of Object.entries(shields)) {
    const norm = normalizeTeamName(key);
    if (norm && !normalized.has(norm)) normalized.set(norm, file);
  }
  const cache = new Map();''', '''// Grafo de nombres (union-find). Cada nombre se une a sus «claves»: 'f:' fichero de escudo
// (exacto o normalizado, con shieldFile de state.js, la misma búsqueda que crest), 'k:' clave
// base y 'n:' nombre destino de su alias.
export function buildClubIndex(names, shields = {}, aliases = TEAM_ALIASES) {
  const cache = new Map();'''),
('    const file = Object.hasOwn(shields, name) ? shields[name] : normalized.get(normalizeTeamName(name));',
 '    const file = shieldFile(name, shields);'),
])

edit('src/links.js', [
('''// Cuenta atrás del próximo partido; `todayISO` es el día de hoy en Atlantic/Canary.''', '''// «Hoy» de la app (decisión 4 de B2): el día de Canarias, nunca el del dispositivo. En un móvil
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
  if (/^\\d{4}-\\d{2}-\\d{2}$/.test(s)) return s;
  const m = s.match(/^(\\d{2})\\/(\\d{2})$/);
  if (!m || !todayISO) return null;
  const t = String(todayISO);
  const ty = +t.slice(0, 4);
  const diffDays = (Date.UTC(ty, +t.slice(5, 7) - 1, +t.slice(8, 10))
    - Date.UTC(ty, +m[2] - 1, +m[1])) / 86400000;
  const y = diffDays > 180 ? ty + 1 : diffDays < -180 ? ty - 1 : ty;
  return y + '-' + m[2] + '-' + m[1];
}

// Cuenta atrás del próximo partido; `todayISO` es el día de hoy en Atlantic/Canary.'''),
])
PY
git diff --stat
```
Esperado:
```text
 src/links.js  |  28 ++++++++++++++
 src/myteam.js |  12 ++----
 src/state.js  | 118 ++++++++++++++++++++++++++++++++++++++++++++++++----------
 src/ui.js     |  23 +-----------
 4 files changed, 133 insertions(+), 48 deletions(-)
```

La prueba de `test_js_modules.mjs` que buscaba el `fetch` de `data-matchdetail.js` pasa a buscar su `fetchData`.

En `scripts/tests/test_js_modules.mjs`, sustituir:

```js
  assert.ok(/fetch\(`?\.\/data-matchdetail\.js/.test(s),
    'must fetch ./data-matchdetail.js');
```

por:

```js
  // Plan B2, tarea 2: las peticiones perezosas pasan por fetchData (la versión y el tiempo límite).
  assert.ok(/fetchData\('data-matchdetail\.js'\)/.test(s),
    'must fetch data-matchdetail.js through fetchData');
```

- [ ] **Step 4: Run test to verify it passes**

```bash
cd /home/manolo/claude/futbol-base
node --test scripts/tests/test_rediseno_state.mjs scripts/tests/test_rediseno_fechas.mjs 2>&1 | grep -E '^# (tests|pass|fail)'
```
Esperado:
```text
# tests 17
# pass 17
# fail 0
```

- [ ] **Step 5: Suites completas**

```bash
cd /home/manolo/claude/futbol-base
python3 -m pytest scripts/tests/ -q 2>&1 | tail -1
node --test scripts/tests/test_*.mjs 2>&1 | grep -E '^# (tests|pass|fail)'
```
Esperado:
- pytest: el mismo recuento que tras la Tarea 1, sin `failed`.
- node: el recuento anterior más 17, con `# fail 0`.

Antes del corte solo se exigen las suites unitarias. Los smoke siguen siendo los del diseño anterior, que esta tarea no cambia, y el `interaction-smoke` viejo falla una de cada cuatro veces en `main` 31a15b8 en su escenario de Atrás y Adelante («Target page, context or browser has been closed»). La Tarea 4 lo sustituye.

- [ ] **Step 6: Commit**

```bash
cd /home/manolo/claude/futbol-base
git add src/state.js src/ui.js src/myteam.js src/links.js scripts/tests/test_rediseno_state.mjs scripts/tests/test_rediseno_fechas.mjs scripts/tests/test_js_modules.mjs
git commit -F - <<'EOF'
feat(rediseño): shieldFile, dataVersion, readGlobals, ensureHealth y el «hoy» de Canarias (B2, tarea 2)

- state.js gana shieldFile(name, shields), la única búsqueda de escudo
  (exacta o normalizada, nunca por subcadena), que pasan a usar crest
  (ui.js) y buildClubIndex (myteam.js) sin cambiar su comportamiento.
- Todas las peticiones perezosas llevan la ?v= de data-seasons.js
  (dataVersion), también las que la tomaban de data-matchdetail-keys.js,
  y un tiempo límite de 15 s (fetchData, con AbortController): nada
  espera para siempre.
- readGlobals() lee los nueve globales inmediatos con typeof y
  ensureHealth() carga data-health.json con un solo vuelo.
- links.js gana canaryTodayISO (decisión 4) y matchDateISO, con sus
  pruebas portadas; la copia de miequipo.js se va en el corte.

La app vieja sigue igual.

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01Sg56KK3oZgo8Ye7Snj6wG9
EOF
git show --stat --oneline HEAD | tail -1
```
Esperado: `7 files changed`.

---

### Task 3: `model.js` gana las funciones heredadas y `createModel`

Las funciones puras que la spec mueve (§5.2) llegan a `model.js` con sus pruebas portadas, `sourceInfo` pasa a devolver datos (decisión 3) y `createModel` da el acceso memorizado al registro de datos; las copias viejas siguen en sus módulos hasta la Tarea 4. El índice de clubes se construye con `buildClubIndex` de `myteam.js`, que llega inyectado: `myteam.js` ya importa de `model.js`, y `model.js` no puede importar de `myteam.js` sin formar un ciclo.

**Files:**
- Modificar: `src/model.js` (importaciones y dos bloques al final) y `scripts/tests/fixtures/rediseno/simulate.mjs` (`datasetsFrom`).
- Probar: `scripts/tests/test_rediseno_model_heredadas.mjs` y `scripts/tests/test_rediseno_model_registro.mjs` (nuevos).

**Interfaces:**
- Consumes:
  - de `model.js`: `buildSeason`, `buildCups` y `checkSeason`;
  - de `state.js`: `normalizeTeamName`;
  - `buildClubIndex(names, shields)` de `myteam.js`, **inyectada** en `createModel` (nunca importada: sin ciclos entre módulos de `src/`).
- Produces:

```js
// model.js
export function createModel(datasets, { portalSeason, buildClubIndex }) → {   // TypeError si portalSeason no es 'AAAA-AAAA'
  season(name),         // Season memorizada. La del portal, de datasets.benjamin/prebenjamin/history; una pasada, de
                        // datasets.seasonRaw[name] (lo que devuelve ensureSeasonData), o null mientras no esté cargada
  group(season, id),    // Group | null
  cups(),               // Cups de 2025-2026 desde cupBenjamin/cupPrebenjamin, memorizados en cuanto hay datos; null si no hay
  clubIndex(),          // buildClubIndex(nombres de la temporada del portal, de las pasadas cargadas en seasonRaw y de los
                        // torneos, datasets.shields); memorizado, se rehace si se carga otra temporada o llegan los torneos.
                        // TypeError si createModel no recibió buildClubIndex (quien no lo pide no lo necesita)
  scorers(season, cat), // GOL_BENJ o GOL_PREBENJ tal cual ([{ id, g, s: [[jugador, equipo, goles, partidos]] }]), la
                        // entrada de teamScorers; [] en otra temporada o sin data-goleadores.js
}
export function sortPlantillaRows(rows, key, dir)                       // de plantilla.js, igual
export function aggregatePlayerFromLineups(lineups, player, teamName)  // de plantilla.js, igual (parámetro renombrado:
                                                                        // `playerName` taparía la función de model.js)
export function mergeAndOrderEvents(events)                             // de matchdetail-rich.js, igual
export function resolveSeasonDataset(state, opts)                       // de modals.js, igual
export function filterCompetitionGroups(groups, state = {})             // de filters.js, sin el `= S` por defecto
export function sourceInfo(group, historical = false)
  // → { kind: 'oficial' | 'calculada' | 'corregida', source: 'futbolaspalmas.com' | null, url: 'https://…' | null }
  //   kind según standingsKind (source/null, reconstructed, corrected); source, el dominio de la URL; sin URL http(s)
  //   o en una temporada pasada (historical), source y url son null. Datos, no HTML: la pinta la Tabla (Tarea 10)

// scripts/tests/fixtures/rediseno/simulate.mjs
export function datasetsFrom(raw, extra = {})
  // → el registro `datasets` con una temporada cruda de las fixtures (current-2025-2026, currentAt o nextSeasonRaw),
  //   shields y torneos congelados, golBenj/golPrebenj/seasons/matchDetail/health a null; `extra` sustituye campos
```

- [ ] **Step 1: Write the failing test**

Las pruebas de `sortPlantillaRows`, `aggregatePlayerFromLineups`, `mergeAndOrderEvents`, `resolveSeasonDataset` y `filterCompetitionGroups` son las de `test_sp2_modules.mjs`, `test_femodals_fixes.mjs` y `test_portal_features.mjs`, con el import nuevo.

Crear `scripts/tests/test_rediseno_model_heredadas.mjs`:

```js
// Plan B2, tarea 3: funciones puras del diseño anterior que se mueven a model.js (spec §5.2),
// con sus pruebas portadas: sortPlantillaRows, aggregatePlayerFromLineups y mergeAndOrderEvents
// (de test_sp2_modules.mjs), resolveSeasonDataset (de test_femodals_fixes.mjs) y
// filterCompetitionGroups (de test_portal_features.mjs). sourceInfo devuelve datos y no HTML
// (decisión 3); la pantalla Tabla lo pinta.
import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { fixture } from './fixtures/rediseno/load.mjs';
import {
  sortPlantillaRows, aggregatePlayerFromLineups, mergeAndOrderEvents, resolveSeasonDataset,
  filterCompetitionGroups, sourceInfo, buildSeason,
} from '../../src/model.js';

// ─── sortPlantillaRows ─────────────────────────────────────────────────────

const SAMPLE = [
  { n: 'OJEDA DELGADO, T.', ap: 12, st: 10, g: 14, y: 2, rd: 0 },
  { n: 'OJEDA SANTANA, M.', ap: 12, st: 11, g: 8,  y: 0, rd: 0 },
  { n: 'DOS SANTOS, M.',    ap: 8,  st: 0,  g: 0,  y: 0, rd: 0 },
];

test('plantilla: default sort goals desc, ties broken by ap desc, name asc', () => {
  const s = sortPlantillaRows(SAMPLE, 'g', 'desc');
  assert.equal(s[0].n, 'OJEDA DELGADO, T.');
  assert.equal(s[1].n, 'OJEDA SANTANA, M.');
  assert.equal(s[2].n, 'DOS SANTOS, M.');
});

test('plantilla: sort by ap asc puts sub-only first when their ap is lowest', () => {
  const s = sortPlantillaRows(SAMPLE, 'ap', 'asc');
  assert.equal(s[0].n, 'DOS SANTOS, M.');
});

// ─── mergeAndOrderEvents ───────────────────────────────────────────────────

test('timeline: events sorted by minute, null minutes last', () => {
  const ord = mergeAndOrderEvents([
    { t: 'goal', s: 'h', n: 'X', m: 30 },
    { t: 'yellow', s: 'a', n: 'Y', m: null },
    { t: 'goal', s: 'h', n: 'Z', m: 10 },
  ]);
  assert.equal(ord[0].n, 'Z');
  assert.equal(ord[1].n, 'X');
  assert.equal(ord[2].n, 'Y');
});

// ─── aggregatePlayerFromLineups ────────────────────────────────────────────

test('aggregatePlayerFromLineups: counts apps/starters/goals/cards', () => {
  const lineups = {
    'A|B|2-1': {
      home: [{ n: 'X', dn: 10, r: 'starter', g: 1, y: 0, rd: 0 }],
      away: [{ n: 'Y', dn: 7, r: 'starter', g: 1, y: 1, rd: 0 }],
      events: [
        { t: 'goal', s: 'h', n: 'X', m: 5 },
        { t: 'goal', s: 'a', n: 'Y', m: 50 },
        { t: 'yellow', s: 'a', n: 'Y', m: 60 },
      ],
    },
    'A|C|0-0': {
      home: [{ n: 'X', dn: 10, r: 'sub', g: 0, y: 0, rd: 0 }],
      away: [],
      events: [],
    },
  };
  const x = aggregatePlayerFromLineups(lineups, 'X');
  assert.equal(x.appearances, 2);
  assert.equal(x.starters, 1);
  assert.equal(x.goals, 1);
  assert.equal(x.matches.length, 2);
  assert.equal(x.matches[0].matchKey, 'A|B|2-1');
});

test('aggregatePlayerFromLineups solo cuenta los partidos de SU equipo', () => {
  // Mismo nombre en dos clubes: sin filtrar por equipo se sumaban los dos y el desplegable
  // contradecía a la fila de la tabla.
  const L = {
    'Firgas|Moya|2-1': { home: [{ n: 'PEREZ, JUAN', r: 'starter', g: 1, y: 0, rd: 0 }], away: [] },
    'Teror|Firgas|0-3': { home: [], away: [{ n: 'PEREZ, JUAN', r: 'sub', g: 2, y: 1, rd: 0 }] },
    'Arucas|Moya|1-1': { home: [{ n: 'PEREZ, JUAN', r: 'starter', g: 5, y: 0, rd: 0 }], away: [] },
  };
  const suyo = aggregatePlayerFromLineups(L, 'PEREZ, JUAN', 'Firgas');
  assert.equal(suyo.appearances, 2);
  assert.equal(suyo.goals, 3);          // 1 + 2, sin los 5 del homónimo
  assert.equal(suyo.starters, 1);
  const todos = aggregatePlayerFromLineups(L, 'PEREZ, JUAN');
  assert.equal(todos.appearances, 3);   // sin equipo, comportamiento anterior
});

test('aggregatePlayerFromLineups salta una clave repetida sin romperse', () => {
  // Plan A §9.2: una clave `local|visitante|gl-gv` que comparten dos partidos llega como
  // {dup: true, list}; sin saber cuál es, no cuenta ninguno.
  const DUP = { dup: true, list: [
    { s: '2025-2026', gr: 'PG2', cod: 125782, events: [],
      home: [{ n: 'PEREZ, JUAN', r: 'starter', g: 1, y: 0, rd: 0 }], away: [] },
    { s: '2025-2026', gr: 'FF15', cod: 258611, events: [],
      home: [{ n: 'PEREZ, JUAN', r: 'starter', g: 2, y: 0, rd: 0 }], away: [] },
  ] };
  const L = {
    'CD Calero|La Garita|1-11': DUP,
    'CD Calero|Moya|2-0': { s: '2025-2026', gr: 'FF15', cod: 258700, events: [],
      home: [{ n: 'PEREZ, JUAN', r: 'starter', g: 1, y: 0, rd: 0 }], away: [] },
  };
  const agg = aggregatePlayerFromLineups(L, 'PEREZ, JUAN', 'CD Calero');
  assert.equal(agg.appearances, 1);
  assert.equal(agg.goals, 1);
  assert.deepEqual(agg.matches.map(m => m.matchKey), ['CD Calero|Moya|2-0']);
});

// ─── resolveSeasonDataset ──────────────────────────────────────────────────
// Colisión real de IDs: A1 existe en HISTORY (2025-26) y en data-season-2024-2025.js con
// partidos DISTINTOS.
const HISTORY_FIX = {
  A1: { 'Jornada 1': [['07/10', 'EQUIPO ACTUAL X', 'EQUIPO ACTUAL Y', 2, 1]] },
};
const GROUP_2425 = {
  id: 'A1', phase: 'Primera Fase', name: 'Grupo 1',
  jornadas: { 'Jornada 1': [['2024-10-05', 'EQUIPO HIST X', 'EQUIPO HIST Y', 0, 3]] },
  standings: [[1, 'EQUIPO HIST Y', 3, 1, 1, 0, 0, 3, 0, 3]],
};
const STATS_FIX = {
  benjamin: { teams: { 'EQUIPO ACTUAL X': { streak: { type: 'W', count: 2 } } } },
};

test('resolveSeasonDataset: temporada histórica seleccionada → group.jornadas, nunca HISTORY (colisión A1)', () => {
  const ds = resolveSeasonDataset({ season: '2024-2025', cat: 'benjamin' }, {
    group: GROUP_2425, groupId: 'A1', history: HISTORY_FIX, stats: STATS_FIX,
  });
  assert.equal(ds.historical, true);
  assert.equal(ds.matchSource, GROUP_2425.jornadas,
    'en histórico los partidos salen del propio grupo, no de HISTORY');
  const j1 = ds.matchSource['Jornada 1'];
  assert.equal(j1[0][1], 'EQUIPO HIST X', 'partido histórico, no el actual');
  assert.equal(ds.stats, null, 'STATS es solo temporada actual: suprimido en histórico');
});

test('resolveSeasonDataset: temporada actual → HISTORY[groupId] + STATS', () => {
  const ds = resolveSeasonDataset({ season: '', cat: 'benjamin' }, {
    group: GROUP_2425, groupId: 'A1', history: HISTORY_FIX, stats: STATS_FIX,
  });
  assert.equal(ds.historical, false);
  assert.equal(ds.matchSource, HISTORY_FIX.A1);
  assert.equal(ds.matchSource['Jornada 1'][0][1], 'EQUIPO ACTUAL X');
  assert.equal(ds.stats, STATS_FIX);
});

test('resolveSeasonDataset: actual sin entrada en HISTORY → fallback a group.jornadas (copa)', () => {
  const ds = resolveSeasonDataset({ season: '' }, {
    group: GROUP_2425, groupId: 'BCA1', history: HISTORY_FIX, stats: null,
  });
  assert.equal(ds.matchSource, GROUP_2425.jornadas);
});

test('resolveSeasonDataset: histórico sin jornadas / sin grupo → objeto vacío', () => {
  const ds1 = resolveSeasonDataset({ season: '2023-2024' }, {
    group: { id: 'A1' }, groupId: 'A1', history: HISTORY_FIX, stats: STATS_FIX,
  });
  assert.deepEqual(ds1.matchSource, {});
  assert.equal(ds1.stats, null);
  const ds2 = resolveSeasonDataset({ season: '2023-2024' }, {
    group: null, groupId: 'A1', history: HISTORY_FIX, stats: STATS_FIX,
  });
  assert.deepEqual(ds2.matchSource, {});
});

test('resolveSeasonDataset: jornadas con forma rara (array) no se usa como matchSource', () => {
  const ds = resolveSeasonDataset({ season: '2023-2024' }, {
    group: { id: 'A1', jornadas: [1, 2, 3] }, groupId: 'A1', history: null, stats: null,
  });
  assert.deepEqual(ds.matchSource, {});
});

// ─── filterCompetitionGroups ───────────────────────────────────────────────

test('filters combine club names, islands and phases, and handle empty groups', () => {
  const groups = [{ island: 'grancanaria', phase: 'Liga', standings: [[1, 'Unión Viera']] },
    { island: 'lanzarote', phase: 'Copa', standings: [[1, 'Unión Viera B']] }, { standings: [] }];
  assert.equal(filterCompetitionGroups(groups, { search: 'union viera' }).length, 2);
  assert.deepEqual(filterCompetitionGroups(groups, { search: 'union', filterIsland: 'grancanaria', filterPhase: 'Liga' }), [groups[0]]);
  assert.equal(filterCompetitionGroups(groups, { search: 'inexistente' }).length, 0);
  assert.equal(filterCompetitionGroups(groups).length, 3, 'sin filtros, todos: ya no lee el estado S');
});

// ─── sourceInfo (decisión 3) ───────────────────────────────────────────────

const season = buildSeason({ name: '2025-2026', current: true, ...fixture('current-2025-2026') });
const groupOf = (id) => season.groups.find((group) => group.id === id);

test('sourceInfo: clasificación oficial de futbolaspalmas.com, con su enlace (PG2)', () => {
  assert.deepEqual(sourceInfo(groupOf('PG2')), {
    kind: 'oficial', source: 'futbolaspalmas.com', url: 'https://futbolaspalmas.com/1prebenjamin2',
  });
});

test('sourceInfo: sin URL no hay fuente ni enlace (PFV2, de la FIFLP)', () => {
  assert.deepEqual(sourceInfo(groupOf('PFV2')), { kind: 'oficial', source: null, url: null });
});

test('sourceInfo: calculada y corregida según standingsKind', () => {
  const pg2 = groupOf('PG2');
  assert.equal(sourceInfo({ ...pg2, standingsKind: 'reconstructed' }).kind, 'calculada');
  assert.equal(sourceInfo({ ...pg2, standingsKind: 'corrected' }).kind, 'corregida');
  assert.equal(sourceInfo({ ...pg2, standingsKind: null }).kind, 'oficial');
});

test('sourceInfo: en una temporada pasada no enlaza la página de la actual', () => {
  assert.deepEqual(sourceInfo(groupOf('PG2'), true), { kind: 'oficial', source: null, url: null });
});

test('sourceInfo: devuelve datos, no HTML, y nunca un enlace que no sea http(s)', () => {
  const info = sourceInfo({ id: 'X', url: 'javascript:alert(1)', standingsKind: 'source' });
  assert.deepEqual(info, { kind: 'oficial', source: null, url: null });
  assert.equal(sourceInfo({ id: 'X', url: 'http://' }).url, null, 'sin dominio no hay enlace');
  assert.equal(sourceInfo({ id: 'X', url: 'https://www.fiflp.com/pnfg/' }).source, 'fiflp.com');
  for (const value of Object.values(sourceInfo(groupOf('PG2')))) assert.doesNotMatch(String(value), /[<>]/);
});
```

Crear `scripts/tests/test_rediseno_model_registro.mjs`:

```js
// Plan B2, tarea 3: createModel(datasets, { portalSeason, buildClubIndex }), el acceso memorizado a
// temporadas, grupos, torneos, índice de clubes y goleadores sobre el registro de datos (contrato del
// esqueleto). buildClubIndex llega inyectado: model.js no importa de myteam.js (sin ciclos).
// Datos: las fixtures congeladas de B1, nunca los data-*.js vivos.
import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { fixture } from './fixtures/rediseno/load.mjs';
import { datasetsFrom } from './fixtures/rediseno/simulate.mjs';
import { createModel } from '../../src/model.js';
import { buildClubIndex, resolveMyTeam, homeState } from '../../src/myteam.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const PORTAL_SEASON = '2025-2026';
const fresh = () => {
  const datasets = datasetsFrom(fixture('current-2025-2026'));
  return { datasets, model: createModel(datasets, { portalSeason: PORTAL_SEASON, buildClubIndex }) };
};
const row = (pos, team) => [pos, team, 0, 0, 0, 0, 0, 0, 0, 0];

test('la temporada del portal sale de benjamin, prebenjamin e history, y se memoriza', () => {
  const { model } = fresh();
  const season = model.season(PORTAL_SEASON);
  assert.equal(season.name, PORTAL_SEASON);
  assert.equal(season.current, true);
  assert.deepEqual(season.groups.map((group) => group.id),
    ['A1', 'A2', 'B1', 'B2', 'FF5', 'FF9', 'FF13', 'FF15', 'PG2', 'PG3', 'PFV2']);
  const pg2 = season.groups.find((group) => group.id === 'PG2');
  assert.equal(pg2.rounds.length, 30, 'las jornadas salen de HISTORY, no de la jornada en línea');
  assert.equal(pg2.rounds.flatMap((round) => round.matches).length, 182);
  assert.equal(model.season(PORTAL_SEASON), season, 'memorizada: el mismo objeto');
});

test('una temporada pasada solo existe cuando está cargada en seasonRaw', () => {
  const { datasets, model } = fresh();
  assert.equal(model.season('2024-2025'), null);
  datasets.seasonRaw['2024-2025'] = fixture('historical-2024-2025');
  const old = model.season('2024-2025');
  assert.equal(old.name, '2024-2025');
  assert.equal(old.current, false);
  assert.deepEqual(old.groups.map((group) => group.id), ['P1', 'PGC2']);
  assert.ok(old.groups.every((group) => group.season === '2024-2025' && group.rounds.length > 0));
  assert.equal(model.season('2024-2025'), old);
  assert.equal(model.season('2023-2024'), null);
  assert.equal(model.season('basura'), null);
});

test('group(season, id): el grupo de esa temporada o null', () => {
  const { datasets, model } = fresh();
  assert.equal(model.group(PORTAL_SEASON, 'PG2').label, 'Prebenjamín, Grupo 2 de Gran Canaria');
  assert.equal(model.group(PORTAL_SEASON, 'ZZ9'), null);
  assert.equal(model.group('2024-2025', 'PGC2'), null, 'temporada sin cargar');
  datasets.seasonRaw['2024-2025'] = fixture('historical-2024-2025');
  assert.equal(model.group('2024-2025', 'PGC2').season, '2024-2025');
  assert.equal(model.group('2024-2025', 'PG2'), null, 'los códigos no cruzan temporadas');
});

test('cups(): los torneos de 2025-26, memorizados; null sin datos, y llegan si se cargan después', () => {
  const { model } = fresh();
  const cups = model.cups();
  assert.equal(cups.season, '2025-2026');
  assert.deepEqual(cups.groups.map((group) => group.id), ['MCB16', 'MCBK2', 'MCP3', 'MCPK1']);
  assert.equal(model.cups(), cups);
  const datasets = datasetsFrom(fixture('current-2025-2026'), { cupBenjamin: null, cupPrebenjamin: null });
  const without = createModel(datasets, { portalSeason: PORTAL_SEASON });
  assert.equal(without.cups(), null);
  datasets.cupPrebenjamin = fixture('cups-2025-2026').prebenjamin;
  assert.deepEqual(without.cups().groups.map((group) => group.id), ['MCP3', 'MCPK1']);
});

test('los torneos siguen siendo de 2025-26 con otra temporada en el portal', () => {
  const model = createModel(datasetsFrom(fixture('current-2025-2026')), { portalSeason: '2026-2027' });
  assert.equal(model.cups().season, '2025-2026');
  assert.ok(model.cups().groups.every((group) => group.season === '2025-2026'));
});

test('clubIndex(): nombres de la temporada, los torneos y los escudos, memorizado', () => {
  const { model } = fresh();
  const index = model.clubIndex();
  assert.equal(index.same('Las Mesas Hu.', 'UD Las Mesas Huracán'), true, 'alias de la Maspalomas (MCP3)');
  assert.equal(index.same('Las Mesas Hu.', 'MESAS, U.D. LAS "B"'), true, 'mismo escudo');
  assert.equal(index.same('Las Mesas Hu.', 'AD Huracán'), false);
  assert.equal(model.clubIndex(), index, 'memorizado: el mismo objeto');
});

test('clubIndex(): se rehace al cargar otra temporada, y sus nombres entran en el universo', () => {
  const datasets = {
    benjamin: [{ id: 'G1', name: 'Grupo 1', phase: 'Primera Fase', island: 'grancanaria', standings: [row(1, 'Alfa')] }],
    prebenjamin: [], history: { G1: {} }, shields: {}, seasonRaw: {},
  };
  const model = createModel(datasets, { portalSeason: PORTAL_SEASON, buildClubIndex });
  const before = model.clubIndex();
  assert.deepEqual(before.members('Alfa'), ['Alfa']);
  datasets.seasonRaw['2024-2025'] = { benjamin: [{ id: 'G1', name: 'Grupo 1', phase: 'Primera Fase',
    island: 'grancanaria', standings: [row(1, 'Alfa B')], jornadas: {} }], prebenjamin: [] };
  const after = model.clubIndex();
  assert.notEqual(after, before);
  assert.deepEqual(after.members('Alfa'), ['Alfa', 'Alfa B']);
  assert.equal(model.clubIndex(), after);
});

test('scorers(season, cat): los goleadores de la temporada actual; [] en las pasadas', () => {
  const golPrebenj = [{ id: 'PG2', g: 'PREBENJAMIN GC GRUPO 2', s: [['De La Rosa Perello, Theo', 'Las Mesas Hu.', 12, 17]] }];
  const model = createModel(datasetsFrom(fixture('current-2025-2026'), { golPrebenj }), { portalSeason: PORTAL_SEASON });
  assert.equal(model.scorers(PORTAL_SEASON, 'prebenjamin'), golPrebenj);
  assert.deepEqual(model.scorers(PORTAL_SEASON, 'benjamin'), [], 'sin data-goleadores.js');
  assert.deepEqual(model.scorers('2024-2025', 'prebenjamin'), []);
});

test('buildClubIndex llega inyectado: sin él, clubIndex() lanza, y model.js no importa de myteam.js', () => {
  const model = createModel(datasetsFrom(fixture('current-2025-2026')), { portalSeason: PORTAL_SEASON });
  assert.equal(model.season(PORTAL_SEASON).name, PORTAL_SEASON, 'lo demás funciona sin el índice');
  assert.throws(() => model.clubIndex(), TypeError);
  const src = readFileSync(join(ROOT, 'src', 'model.js'), 'utf8');
  assert.doesNotMatch(src, /from '\.\/myteam\.js'/, 'myteam.js importa de model.js: sería un ciclo');
});

test('createModel exige la temporada del portal: sin ella, las fechas saldrían de config.js', () => {
  assert.throws(() => createModel(datasetsFrom(fixture('current-2025-2026')), {}), TypeError);
  assert.throws(() => createModel(datasetsFrom(fixture('current-2025-2026')), { portalSeason: '2025/26' }), TypeError);
});

test('con el modelo, Las Mesas en PG2 el 23/09/2026 queda en D sin pregunta (caso 1 de §11)', () => {
  const { model } = fresh();
  const myTeam = { name: 'Las Mesas Hu.', season: PORTAL_SEASON, cat: 'prebenjamin', groupId: 'PG2' };
  const resolution = resolveMyTeam(myTeam, model.season(PORTAL_SEASON), model.clubIndex(), '2026-09-23');
  assert.equal(resolution.status, 'ok');
  assert.equal(resolution.group, model.group(PORTAL_SEASON, 'PG2'));
  assert.equal(homeState({ resolution, todayISO: '2026-09-23', portalSeason: PORTAL_SEASON }), 'D');
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd /home/manolo/claude/futbol-base
node --test scripts/tests/test_rediseno_model_heredadas.mjs scripts/tests/test_rediseno_model_registro.mjs 2>&1 | grep -E '^# (tests|pass|fail)|SyntaxError'
```
Esperado:
```text
# SyntaxError: The requested module '../../src/model.js' does not provide an export named 'aggregatePlayerFromLineups'
# SyntaxError: The requested module '../../src/model.js' does not provide an export named 'createModel'
# tests 2
# pass 0
# fail 2
```

- [ ] **Step 3: Write the implementation**

Importaciones de `model.js`:

```bash
cd /home/manolo/claude/futbol-base
python3 - <<'PY'
from pathlib import Path

p = Path('src/model.js')
s = p.read_text(encoding='utf-8')
old = """import {
  isCupGroup, isRoundRobinCup, knockoutRoundLabel, matchAdvancer, sortJornadaKeys, jornadaNumber,
} from './state.js';
import { fixtureISO } from './links.js';
"""
new = """import {
  isCupGroup, isRoundRobinCup, knockoutRoundLabel, matchAdvancer, sortJornadaKeys, jornadaNumber,
  normalizeTeamName,
} from './state.js';
import { fixtureISO } from './links.js';
"""
assert s.count(old) == 1
p.write_text(s.replace(old, new), encoding='utf-8')
PY
```

Añadir al final de `src/model.js`:

```js
/* ── Registro de datos y modelo (Plan B2, contrato del esqueleto) ──────────
 *
 * datasets = { ...readGlobals(), seasonRaw: {}, matchDetail: null, lineups: {}, health: null }:
 * los globales inmediatos y lo que traen los cargadores perezosos de state.js. El modelo los lee
 * al pedirlos, así que una temporada pasada aparece en cuanto se guarda en seasonRaw. */

// La Maspalomas Cup es de 2025/26 y lo sigue siendo después de activar 2026/27 («Para B2»).
const CUPS_SEASON = '2025-2026';

// Todos los nombres de equipo de temporadas y torneos ya construidos: clasificación y partidos.
function teamNamesOf(collections) {
  const names = new Set();
  for (const { groups } of collections) {
    for (const group of groups) {
      for (const row of group.standings) names.add(row.team);
      for (const round of group.rounds) for (const match of round.matches) { names.add(match.home); names.add(match.away); }
    }
  }
  return [...names];
}

// buildClubIndex (myteam.js) llega inyectado: myteam.js importa de este módulo, y al revés sería un
// ciclo. Quien no pide clubIndex() no lo necesita (las pantallas reciben el índice ya hecho).
export function createModel(datasets, { portalSeason, buildClubIndex = null } = {}) {
  checkSeason(portalSeason, 'createModel');
  const data = datasets || {};
  const seasons = new Map();
  let cups = null;
  let index = null;
  let indexKey = null;
  const model = {
    // Season memorizada. La del portal, de benjamin, prebenjamin e history; una pasada, de
    // seasonRaw[name] (lo que devuelve ensureSeasonData), o null mientras no esté cargada.
    season(name) {
      if (seasons.has(name)) return seasons.get(name);
      let built = null;
      if (name === portalSeason) {
        built = buildSeason({ name, current: true, benjamin: data.benjamin, prebenjamin: data.prebenjamin, history: data.history });
      } else if (SEASON_RE.test(String(name)) && data.seasonRaw && Object.hasOwn(data.seasonRaw, name) && data.seasonRaw[name]) {
        const raw = data.seasonRaw[name];
        built = buildSeason({ name, current: false, benjamin: raw.benjamin, prebenjamin: raw.prebenjamin });
      }
      if (built) seasons.set(name, built);
      return built;
    },
    group(season, id) {
      const built = model.season(season);
      return (built && built.groups.find(group => group.id === id)) || null;
    },
    // Torneos de 2025-26 (capa aparte, spec §5.3), memorizados en cuanto hay datos; null si no hay.
    cups() {
      if (!cups && (data.cupBenjamin || data.cupPrebenjamin)) {
        cups = buildCups({ season: CUPS_SEASON, benjamin: data.cupBenjamin, prebenjamin: data.cupPrebenjamin });
      }
      return cups;
    },
    // Índice de clubes (spec §6.1) sobre los nombres de las temporadas cargadas y los torneos,
    // con los escudos. Se rehace cuando se carga otra temporada o llegan los torneos.
    clubIndex() {
      const loaded = [portalSeason, ...Object.keys(data.seasonRaw || {}).filter(name => name !== portalSeason).sort()];
      const collections = [...loaded.map(name => model.season(name)).filter(Boolean), model.cups()].filter(Boolean);
      const key = collections.map(collection => collection.name || `torneos ${collection.season}`).join('|');
      if (!index || key !== indexKey) {
        if (typeof buildClubIndex !== 'function') throw new TypeError('createModel: clubIndex() necesita buildClubIndex');
        index = buildClubIndex(teamNamesOf(collections), data.shields || {});
        indexKey = key;
      }
      return index;
    },
    // Goleadores de la temporada actual (GOL_BENJ o GOL_PREBENJ: [{ id, g, s: [[jugador, equipo,
    // goles, partidos]] }]), los que recibe teamScorers; [] en las pasadas, que no los tienen.
    scorers(season, cat) {
      if (season !== portalSeason) return [];
      const gol = cat === 'benjamin' ? data.golBenj : cat === 'prebenjamin' ? data.golPrebenj : null;
      return Array.isArray(gol) ? gol : [];
    },
  };
  return model;
}

/* ── Funciones puras del diseño anterior (spec §5.2, «se mueven») ─────────
 * Vienen de plantilla.js, matchdetail-rich.js, modals.js, filters.js y health.js, que se borran
 * en el corte. Mismo comportamiento y mismas pruebas; filterCompetitionGroups ya no toma el
 * estado S por defecto y sourceInfo devuelve datos en lugar de HTML (decisión 3 de B2). */

export function sortPlantillaRows(rows, key, dir) {
  key = key || 'g';
  dir = dir || 'desc';
  const mul = dir === 'desc' ? -1 : 1;
  const cmp = (a, b) => {
    const va = a[key], vb = b[key];
    if (typeof va === 'number' && typeof vb === 'number') {
      if (va !== vb) return (va - vb) * mul;
    } else {
      const sa = String(va || ''), sb = String(vb || '');
      const c = sa.localeCompare(sb, 'es');
      if (c !== 0) return c * mul;
    }
    if (a.ap !== b.ap) return b.ap - a.ap;
    return String(a.n).localeCompare(String(b.n), 'es');
  };
  return rows.slice().sort(cmp);
}

/* Estadísticas de un jugador a partir de las alineaciones de la temporada. `teamName` es
 * obligatorio en la práctica: sin él se agrega por NOMBRE sobre todas las alineaciones, y un
 * homónimo de otro club suma sus partidos. Una clave repetida ({dup, list}) no cuenta. */
export function aggregatePlayerFromLineups(lineups, player, teamName) {
  let appearances = 0, starters = 0, goals = 0, yellow = 0, red = 0;
  const matches = [];
  const suyo = teamName ? normalizeTeamName(teamName) : null;
  for (const [matchKey, m] of Object.entries(lineups || {})) {
    const partes = String(matchKey).split('|');
    const inHome = (m.home || []).find(p => p.n === player);
    const inAway = (m.away || []).find(p => p.n === player);
    let app = inHome || inAway;
    if (suyo) {
      const enLocal = inHome && normalizeTeamName(partes[0] || '') === suyo;
      const enVisitante = inAway && normalizeTeamName(partes[1] || '') === suyo;
      app = enLocal ? inHome : enVisitante ? inAway : null;
      if (app) {
        matches.push({ matchKey, side: enLocal ? 'home' : 'away', g: app.g | 0, y: app.y | 0, rd: app.rd | 0 });
        appearances += 1;
        if (app.r === 'starter') starters += 1;
        goals += app.g | 0; yellow += app.y | 0; red += app.rd | 0;
      }
      continue;
    }
    if (!app) continue;
    appearances += 1;
    if (app.r === 'starter') starters += 1;
    goals += app.g | 0;
    yellow += app.y | 0;
    red += app.rd | 0;
    matches.push({ matchKey, side: inHome ? 'home' : 'away', g: app.g | 0, y: app.y | 0, rd: app.rd | 0 });
  }
  return { appearances, starters, goals, yellow, red, matches };
}

// Eventos del acta por minuto; los que no tienen minuto, al final.
export function mergeAndOrderEvents(events) {
  const arr = (events || []).slice();
  arr.sort((a, b) => {
    const ma = (a.m == null) ? 1e9 : a.m;
    const mb = (b.m == null) ? 1e9 : b.m;
    return ma - mb;
  });
  return arr;
}

/* De dónde salen los partidos de un grupo según la temporada. Los códigos se repiten entre
 * temporadas (A1 está en 2024-25 y en HISTORY de 2025-26), así que:
 *   - temporada pasada (state.season no vacío): las `jornadas` del propio grupo, nunca HISTORY,
 *     y sin rachas (stats: null, solo son de la actual);
 *   - temporada actual: HISTORY[groupId] y, si no está (copas), las `jornadas` del grupo.
 * Las dos formas son { 'Jornada N': [[fecha, local, visitante, gl, gv], …] }. */
export function resolveSeasonDataset(state, opts) {
  opts = opts || {};
  const group = opts.group || null;
  const historical = !!(state && state.season);
  const groupJornadas =
    (group && group.jornadas && typeof group.jornadas === 'object'
     && !Array.isArray(group.jornadas)) ? group.jornadas : null;
  if (historical) {
    return { historical: true, matchSource: groupJornadas || {}, stats: null };
  }
  const history = opts.history || null;
  const groupId = opts.groupId != null ? opts.groupId : (group && group.id);
  const fromHistory = (history && groupId != null) ? history[groupId] : null;
  return {
    historical: false,
    matchSource: fromHistory || groupJornadas || {},
    stats: opts.stats || null,
  };
}

// Grupos crudos por isla, fase y nombre de club (normalizado). `state`: { search, filterIsland, filterPhase }.
export function filterCompetitionGroups(groups, state = {}) {
  const query = normalizeTeamName(state.search || '');
  return groups.filter(group => (!state.filterIsland || group.island === state.filterIsland)
    && (!state.filterPhase || group.phase === state.filterPhase)
    && (!query || (group.standings || []).some(row => normalizeTeamName(row[1]).includes(query))));
}

/* Procedencia de la clasificación (spec §4.4; decisión 3 de B2): datos, no HTML.
 *   kind:   'oficial' (la de la fuente tal cual), 'calculada' (reconstruida con los resultados) o
 *           'corregida' (con los puntos corregidos), según standingsKind;
 *   source: el dominio de la fuente («futbolaspalmas.com»), o null sin URL;
 *   url:    la de la fuente, solo http o https, o null.
 * En una temporada pasada (historical) no hay enlace: la URL de la fuente es la de la actual. */
const SOURCE_KINDS = { reconstructed: 'calculada', corrected: 'corregida' };
export function sourceInfo(group, historical = false) {
  const kind = SOURCE_KINDS[group && group.standingsKind] || 'oficial';
  const m = historical ? null : String((group && group.url) || '').match(/^https?:\/\/(?:www\.)?([^/?#:@\s]+)/i);
  return { kind, source: m ? m[1].toLowerCase() : null, url: m ? group.url : null };
}
```

Añadir al final de `scripts/tests/fixtures/rediseno/simulate.mjs`:

```js
// El registro de datos de B2 (`datasets` del esqueleto: los nueve globales de readGlobals más
// seasonRaw, matchDetail, lineups y health) a partir de una temporada cruda de las fixtures
// (current-2025-2026, currentAt o nextSeasonRaw), con los escudos y los torneos congelados.
// `extra` sustituye cualquier campo (golPrebenj, health, seasonRaw…).
export function datasetsFrom(raw, extra = {}) {
  const cups = fixture('cups-2025-2026');
  return {
    benjamin: raw.benjamin, prebenjamin: raw.prebenjamin, history: raw.history,
    golBenj: null, golPrebenj: null, shields: fixture('shields'), seasons: null,
    cupBenjamin: cups.benjamin, cupPrebenjamin: cups.prebenjamin,
    seasonRaw: {}, matchDetail: null, lineups: {}, health: null,
    ...extra,
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
cd /home/manolo/claude/futbol-base
node --test scripts/tests/test_rediseno_model_heredadas.mjs scripts/tests/test_rediseno_model_registro.mjs 2>&1 | grep -E '^# (tests|pass|fail)'
```
Esperado:
```text
# tests 28
# pass 28
# fail 0
```

- [ ] **Step 5: Suites completas**

```bash
cd /home/manolo/claude/futbol-base
python3 -m pytest scripts/tests/ -q 2>&1 | tail -1
node --test scripts/tests/test_*.mjs 2>&1 | grep -E '^# (tests|pass|fail)'
```
Esperado:
- pytest: el mismo recuento, sin `failed`.
- node: el recuento anterior más 28, con `# fail 0`. `test_rediseno_b1_contract.mjs` sigue en verde: `model.js` solo importa módulos que sobreviven al corte.

Como en la Tarea 2, antes del corte solo se exigen las suites unitarias.

- [ ] **Step 6: Commit**

```bash
cd /home/manolo/claude/futbol-base
git add src/model.js scripts/tests/fixtures/rediseno/simulate.mjs scripts/tests/test_rediseno_model_heredadas.mjs scripts/tests/test_rediseno_model_registro.mjs
git commit -F - <<'EOF'
feat(rediseño): funciones heredadas en model.js y createModel (B2, tarea 3)

- model.js gana, con sus pruebas portadas, sortPlantillaRows,
  aggregatePlayerFromLineups, mergeAndOrderEvents, resolveSeasonDataset
  y filterCompetitionGroups (ya sin el estado S por defecto), y
  sourceInfo, que devuelve { kind, source, url } en lugar de HTML
  (decisión 3). Las copias viejas siguen hasta el corte.
- createModel(datasets, { portalSeason, buildClubIndex }) da
  temporadas, grupos, torneos de 2025-26, índice de clubes y goleadores
  memorizados sobre el registro de datos; una temporada pasada aparece
  al cargarse en seasonRaw y el índice se rehace con ella.
  buildClubIndex llega inyectado: model.js no importa de myteam.js.
- simulate.mjs gana datasetsFrom para construir el registro con las
  fixtures.

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01Sg56KK3oZgo8Ye7Snj6wG9
EOF
git show --stat --oneline HEAD | tail -1
```
Esperado: `4 files changed`, todo inserciones.

---

### Task 4: EL CORTE, en un solo commit

La app vieja se va entera y la nueva arranca con la portada mínima. Tiene que ser un solo commit porque el bot (`update.yml`, `fetch-fiflp.yml` y `fetch-fiflp-actas.yml`) ejecuta `pytest` y `node --test` antes de comitear, y en rojo se para sin avisar.

El commit hace esto:
- `index.html` pasa a esqueleto y llama al arranque de `app.js` (`start(document, window)`): ningún módulo de `src/` toca el navegador al importarse;
- `style-acta.css` pasa a ser `acta.css`, una URL nueva, y el `style.css` viejo se borra: el SW que ya está en los móviles sirve los `.css` desde su caché aunque cambie la `?v=` (A1 de la revisión adversarial);
- antes de importar `app.js`, `index.html` quita de las cachés de la app anterior sus `app.js`, `state.js` y `links.js`: ese SW sirve los módulos de `src/` desde su caché mientras los actualiza en segundo plano, y con uno viejo la app nueva no arranca;
- si el arranque falla (sin conexión en plena transición, o un módulo que no llega), `index.html` pinta un aviso con estilos en línea y «Reintentar», nunca «Cargando…» para siempre (R2-3 de la segunda ronda de la revisión);
- se borran los 9 módulos y sus pruebas de detalle;
- `state.js` y `links.js` pierden el estado de interfaz (decisiones 1 y 2);
- `ui.js` gana la cabecera de pantalla común (`screenHead`) y `model.js`, `seasonLabel`, las dos piezas compartidas que la portada es la primera en necesitar;
- `app.js` pinta la portada mínima de `screen-home.js`;
- los tres smoke y `test_sw_fixes` pasan al grafo nuevo; `pwa-smoke` prueba el paso desde la app anterior con su SW de verdad (una copia de la de `main` 31a15b8, en `scripts/tests/fixtures/app-anterior/`), con datos y `config.js` congelados para las dos versiones (R2-2).

**Files:**
- Crear:
  - `src/screen-home.js`;
  - `scripts/tests/test_rediseno_modulos.mjs`, que sustituye a `test_rediseno_b1_contract.mjs`;
  - `scripts/tests/test_rediseno_index.mjs`, `scripts/tests/test_rediseno_home.mjs` y `scripts/tests/test_rediseno_smoke.mjs`;
  - `scripts/tests/test_index_bot_contract.py`;
  - `scripts/tests/fixtures/app-anterior/`: la app de `main` 31a15b8 (`index.html`, `sw.js`, `style.css`, `manifest.json`, `icons.svg` y sus 13 módulos de `src/`), la versión anterior de `pwa-smoke`.
- Reescribir: `index.html`, `src/app.js`, `scripts/tests/interaction-smoke.mjs` y `scripts/tests/pwa-smoke.mjs`.
- Renombrar: `style-acta.css` → `acta.css`, que sustituye a la hoja vieja (`style.css`, que se borra). Gana el CSS de la cabecera de pantalla, el de la pregunta de E y el de la marca en escritorio.
- Modificar:
  - `src/state.js`, `src/links.js`, `src/ui.js` (`screenHead` y `backLink`), `src/model.js` (`seasonLabel`) y `sw.js`;
  - `scripts/tests/render-smoke.mjs` (el `checkRenderedDom` nuevo de §11);
  - `scripts/tests/test_sw_fixes.mjs`, `test_js_modules.mjs`, `test_festate_fixes.mjs`, `test_review0615_frontend.mjs` y `test_portal_features.mjs`;
  - `scripts/tests/test_rediseno_state.mjs`, `test_rediseno_css.mjs`, `test_rediseno_contrast.mjs`, `test_rediseno_assets.mjs`, `test_rediseno_ui.mjs` y `test_rediseno_model_nombres.mjs`;
  - `scripts/tests/test_workflows.py` y `.github/workflows/tests.yml`: en el filtro de rutas, `acta.css` sustituye a `style.css` y `style-acta.css`.
- Borrar:
  - `src/render.js`, `src/modals.js`, `src/miequipo.js`, `src/init.js`, `src/favorites.js`, `src/filters.js`, `src/health.js`, `src/plantilla.js` y `src/matchdetail-rich.js`;
  - `scripts/tests/test_team_modal_fix.mjs`, `test_uxui2_fixes.mjs`, `test_uxui_fixes.mjs`, `test_sp2_modules.mjs`, `test_femodals_fixes.mjs` y `test_rediseno_b1_contract.mjs`.

**Qué pasa con cada prueba** (inventario §4). Solo se borra lo que lee un fichero borrado o prueba una función eliminada:

| Fichero | Destino | Dónde queda lo que valía |
|---|---|---|
| `test_team_modal_fix.mjs` (3) | se borra | Escudo con monograma y nombres en enlaces: `test_rediseno_ui.mjs` |
| `test_uxui2_fixes.mjs` (39) | se borra | Detalle visual del diseño viejo. Foco visible, contraste y 44 px: `test_rediseno_css.mjs` y `test_rediseno_contrast.mjs` |
| `test_uxui_fixes.mjs` (26) | se borra | `matchDateISO` (5 casos), portado en la Tarea 2 (`test_rediseno_fechas.mjs`). `seasonOutlook` se elimina (lo sustituyen `matchState` y `groupFinished`). El resto, CSS e `init.js` viejos |
| `test_sp2_modules.mjs` (17) | se borra | 6 portadas en la Tarea 3 (`test_rediseno_model_heredadas.mjs`). `singleEntry` lo sustituye `timelineFor`. El resto pintaba HTML del modal |
| `test_femodals_fixes.mjs` (17) | se borra | `resolveSeasonDataset` (5), portada en la Tarea 3. `fillIfCurrent` lo sustituye el token del router (Tarea 6). El resto era de `modals.js` y `miequipo.js` |
| `test_rediseno_b1_contract.mjs` (5) | se sustituye | Por `test_rediseno_modulos.mjs`, genérico sobre todo `src/` |
| `test_review0615_frontend.mjs` (48) | se divide: −11 | Se van las 11 que leen `render.js` o `modals.js`. Quedan las 37 de lógica pura de `state.js` |
| `test_festate_fixes.mjs` (27) | se divide: −12 | Se van `render.js`, `teamBadge`, `escapeHtml` y `getTeamForm`. Las de `getData` pasan a `getData(season, cat)` |
| `test_js_modules.mjs` (30) | se divide: −13 | Se van `FEATURED` y las `featured*`, el cuadro de mando viejo y el `checkRenderedDom` viejo. El nuevo se prueba en `test_rediseno_smoke.mjs`; `teamScorers`, en `test_rediseno_state.mjs` |
| `test_portal_features.mjs` (6) | −2 +1 | El filtro, portado en la Tarea 3. El viaje de ida y vuelta con `routeUrl` pasa a una prueba de solo lectura de `readRoute` |
| `test_sw_fixes.mjs` (18) | −2 +3 | El grafo exacto, sin el umbral `>= 8`. Fuente e iconos. Cada entrada existe |
| `render-smoke` e `interaction-smoke` | se adaptan | Portada del corte, en mínimos |
| `pwa-smoke` | se reescribe | El paso desde la app anterior, con su SW de verdad y datos congelados: ninguna apertura mezcla versiones, sin conexión a medias sale el aviso con «Reintentar», y al final la portada funciona sin conexión |

**Interfaces:**
- Consumes:
  - de las Tareas 1 a 3: `scripts/sync_versions.py`, `shieldFile`, `readGlobals`, `canaryTodayISO`, `createModel` y `datasetsFrom`;
  - de B1:
    - `html` y `Html` (`html.js`);
    - `crest`, `crestFallback`, `box`, `cells`, `empty`, `matchRow` y `tabbar` (`ui.js`);
    - `buildClubIndex`, `homeState` y `resolveMyTeam` (`myteam.js`);
    - `teamFixtures`, `seasonSummary` y `retiredTeams` (`model.js`);
    - `loadStore`, `STORE_KEY` y `LEGACY_KEY` (`store.js`);
    - `routeHref` y `countdownLabel` (`links.js`).
- Produces:

```js
// src/app.js: importarlo no hace nada; index.html llama a start(document, window) tras los datos
export function startContext({ storage, portal, datasets, today })
  // → { model, myTeam, resolution, today, health: datasets.health, datasets,
  //     portal: { season, defaultTeam }, lastPrimary: 'miequipo' }: el ctx del esqueleto sin la ruta.
  //   storage: el Storage o una función que lo devuelve (loadStore); con el almacén vacío o bloqueado,
  //   PORTAL.defaultTeam sin preguntas. createModel recibe buildClubIndex (sin ciclos)
export function start(doc, win)  // escucha los errores de escudo (crestFallback) y pinta la portada en #contenido;
                                 // si algo lanza, caja con «Reintentar» (data-action="retry", recarga)

// src/ui.js (piezas compartidas: las usan todas las pantallas)
export function backLink(href)   // Html: <a class="back" href data-action="back" aria-label="Volver">‹</a>
export function screenHead(title, { sub, action, crest, back } = {})
  // Html: <header class="screen-head">[«‹»][escudo]<div class="screen-head-text"><h1>título</h1>
  //       [<p class="screen-sub">]</div>[acción]</header>. title: texto o Html; action: { href, label } (enlace
  //       .screen-action) o un Html ya hecho (un botón); crest: Html de crest(); back: href del padre

// src/model.js
export function seasonLabel(season)  // '2025-2026' → '2025/26'; lo que no es una temporada, tal cual; null → ''

// src/screen-home.js
export const screen = { id: 'home', needs() → [], render(ctx) → Html }
  // <section data-screen="home" data-state="A|B|C|D|E|X">
  //   screenHead: escudo de 46, <h1> con el nombre, la etiqueta de grupo (en E y X, «Temporada 2026/27») y
  //   «Cambiar» → #/explorar#buscar (salvo en E y X)
  //   el bloque del estado: A «Próximo partido»; B «Próximo partido» (si hay) y un vacío con sus dos causas;
  //   C «Último partido»; D «Así terminó <temporada>»; E «¿En qué equipo juega ahora?» con un botón por
  //   candidato (data-action="elegir"); X «<equipo> no aparece en <temporada>» y «Elegir equipo»
  // </section>

// src/state.js, después del corte (decisiones 1 y 2)
export function getData(season, cat)              // la del portal (o season vacío) de BENJAMIN/PREBENJAMIN; una pasada, de
                                                  // lo cargado por ensureSeasonData, o []; con la Maspalomas en 2025-26
export function withSeasonCup(groups, season, cat)
export function teamScorers(gol, team)            // antes featuredScorersFrom: [{ name, goals, games }] del equipo
                                                  // { cat, groupId, name } en su grupo; nombre exacto
export function getPhases(groups)
export function countStats(season, cat)           // { groups, teams, matches }
// Se quedan: normalizeTeamName, normalizeForTeamsMapping, shieldFile, jornadaNumber, jornadaLabel, sortJornadaKeys,
// validJorGroup, knockoutRoundsSource, bracketDrawAdvancer, matchAdvancer, bracketChampion, phaseIcon,
// groupJornadaLabel, isCupGroup, unifiedPrebenLeagueGroups, knockoutRoundLabel, isRoundRobinCup, readGlobals,
// dataVersion, ensureMatchDetail, getSeasonError, ensureSeasonData, ensureLineups, ensurePlayers, ensureHealth y
// countMatches. Se van S, FEATURED, isFeatured, featuredStandingFrom, featuredMatchesFrom, getTeamForm,
// getCurrentSeason, isHistorical, $, $$, el, escapeHtml, escapeAttr, ACTIVATION_KEYS, makeActivatable,
// delegateActivation, teamBadge, teamBadgeFallback, handleBadgeError, installBadgeErrorDelegation (y su efecto al
// importarse), buildUnifiedPrebenjamin y buildSparkline.

// src/links.js: se van routeUrl, syncRoute, setReadingRoute y matchId (escribían enlaces antiguos desde S y
// FEATURED), y notify y copyLink (pintaban en el #toast del diseño viejo; compartir llega en la Tarea 7). Se
// quedan readRoute (para translateLegacy), venueUrl, fixtureISO, displayDate, kickoffUTC, buildCalendar,
// downloadCalendar, las rutas de B1, canaryTodayISO, matchDateISO y countdownLabel.

// scripts/tests/render-smoke.mjs
export function checkRenderedDom(dom, { teamName } = {}) → { ok, failures, state }
  // exige <section data-screen="home"> en A, B, C o D, su <header class="screen-head">, un solo h1 que contenga
  // teamName y algún <section class="block">; rechaza E, X, data-action="retry" y el esqueleto sin sustituir
```

- `index.html`, en este orden:
  - `a.skip-link[href="#contenido"]`;
  - `header.shell-header` con `a.shell-brand`;
  - `nav.tabbar`, idéntica a `String(ui.tabbar('miequipo'))`;
  - `main#contenido.page` con `div.box.skeleton`;
  - `span#legacyUpdated[hidden]`;
  - los 9 `data-*.js` de hoy, en su orden;
  - el arranque, un módulo en línea: si un SW controla la página, quita de las cachés de la app anterior (las que guardan `src/render.js`) sus `app.js`, `state.js` y `links.js`; después, `const { start } = await import('./src/app.js?v=…'); start(document, window);`, todo dentro de un `try`: si falla, pinta con estilos en línea «No se pudo abrir la versión nueva de la app. Comprueba la conexión y pulsa Reintentar.» y un botón «Reintentar» que pide `registration.update()` y recarga; y el registro del SW.
- `sw.js`: `STATIC_ASSETS` son `./`, `index.html`, `acta.css`, `manifest.json`, `data-health.json`, `fonts/*.woff2`, `icons/*.png`, el grafo exacto de `src/app.js` (10 módulos) y los 9 inmediatos.
- `acta.css` gana:
  - la cabecera de pantalla: `.screen-head`, `.screen-head-text`, `.screen-sub`, `.screen-action` y `.back`;
  - la pregunta de E y la acción de X: `.choices`, `.choice`, `.choice-text`, `.choice-name`, `.choice-label`, `.choice-none` y `.home-cta`;
  - `.shell-brand`, solo desde 1024 px (la Tarea 5 lo sustituye).

- [ ] **Step 1: Write the failing test**

Crear `scripts/tests/test_rediseno_modulos.mjs`:

```js
// Plan B2, tarea 4: contrato de los módulos de src/ desde el corte (spec §5.1, §5.2 y §10).
// Sustituye al contrato de B1 (test_rediseno_b1_contract.mjs), que vigilaba que la app vieja no
// cargara nada nuevo. Es genérico: vale para todo src/, también para los módulos que lleguen.
// - Ningún módulo toca el navegador al importarse, sin excepciones: app.js exporta su arranque
//   (start) y lo llama index.html.
// - Solo state.js nombra los globales de datos, y nadie usa globalThis.
// - Imports planos y estáticos, a módulos que existen; src/ sin subcarpetas.
// - Cada screen-*.js exporta el contrato de pantalla, y los nueve módulos viejos no vuelven.
import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const read = (path) => readFileSync(join(ROOT, path), 'utf8');
const ENTRIES = readdirSync(join(ROOT, 'src'));
const MODULES = ENTRIES.filter((f) => f.endsWith('.js')).sort();
const OLD = ['render.js', 'modals.js', 'miequipo.js', 'init.js', 'favorites.js', 'filters.js', 'health.js',
  'plantilla.js', 'matchdetail-rich.js'];
const BROWSER = ['window', 'document', 'localStorage', 'sessionStorage', 'location', 'history', 'navigator'];

// Código sin comentarios (los comentarios pueden nombrar HISTORY o localStorage).
const code = (src) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
// Globales de datos: los nombres que declaran los data-*.js en su nivel superior. Solo los
// nombres, nunca los valores; el patrón cubre los ficheros de temporadas que aún no existen.
const DATA_NAMES = [...new Set(readdirSync(ROOT).filter((f) => /^data-.*\.js$/.test(f))
  .flatMap((f) => [...read(f).matchAll(/(?:^|;)\s*(?:const|let|var)\s+([A-Z][A-Z0-9_]*)\s*=/gm)].map((m) => m[1])))].sort();
const DATA_GLOBAL = new RegExp(String.raw`\b(?:${DATA_NAMES.join('|')}|(?:SEASON|LINEUPS|PLAYERS|TEAMS)_\d{4}_\d{4})\b`);

// Importa `files` con trampas en los globales del navegador y devuelve los que se leyeron.
async function importWatching(files) {
  const saved = BROWSER.map((name) => [name, Object.getOwnPropertyDescriptor(globalThis, name)]);
  const touched = [];
  for (const name of BROWSER) {
    Object.defineProperty(globalThis, name, { configurable: true, get() { touched.push(name); return undefined; } });
  }
  try {
    for (const f of files) await import(`../../src/${f}`);
  } finally {
    for (const [name, descriptor] of saved) {
      if (descriptor) Object.defineProperty(globalThis, name, descriptor);
      else delete globalThis[name];
    }
  }
  return touched;
}

test('ningún módulo de src/ toca el navegador al importarse, app.js incluido', async () => {
  for (const f of ['app.js', 'screen-home.js', 'state.js']) assert.ok(MODULES.includes(f), MODULES.join(', '));
  assert.deepEqual(await importWatching(MODULES), []);
});

test('app.js exporta su arranque: lo llama index.html, nunca el propio módulo al importarse', async () => {
  const app = await import('../../src/app.js');
  assert.equal(typeof app.start, 'function');
  assert.equal(typeof app.startContext, 'function');
  assert.doesNotMatch(code(read('src/app.js')), /^\s*start\(/m, 'app.js no se arranca a sí mismo');
});

test('solo state.js nombra los globales de datos, y ningún módulo usa globalThis', () => {
  for (const name of ['BENJAMIN', 'PREBENJAMIN', 'HISTORY', 'HIST_MATCHES', 'SHIELDS', 'SEASONS', 'GOL_BENJ']) {
    assert.ok(DATA_NAMES.includes(name), `falta ${name} en la lista de globales de datos`);
  }
  for (const f of MODULES) {
    const src = code(read(`src/${f}`));
    assert.doesNotMatch(src, /\bglobalThis\b/, `${f} usa globalThis`);
    if (f === 'state.js') continue;
    assert.doesNotMatch(src, /\btypeof\s+[A-Z][A-Z0-9_]*\b/, `${f}: typeof sobre un global`);
    const hit = src.match(DATA_GLOBAL);
    assert.equal(hit, null, `${f} nombra el global de datos ${hit && hit[0]}: los datos entran por state.js`);
  }
});

test('imports planos y estáticos, a módulos de src/ que existen; src/ sin subcarpetas', () => {
  for (const entry of ENTRIES) assert.ok(statSync(join(ROOT, 'src', entry)).isFile(), `src/${entry} no es un fichero`);
  for (const f of MODULES) {
    const src = code(read(`src/${f}`));
    assert.doesNotMatch(src, /\bimport\s*\(/, `${f}: import() dinámico`);
    for (const [, spec] of src.matchAll(/(?:from|import)\s*['"]([^'"]+)['"]/g)) {
      assert.match(spec, /^\.\/[\w-]+\.js$/, `${f}: «${spec}» no es un módulo plano de src/`);
      assert.ok(MODULES.includes(spec.slice(2)), `${f} importa ${spec}, que no existe`);
    }
  }
});

test('cada screen-*.js exporta el contrato de pantalla { id, needs, render }', async () => {
  const screens = MODULES.filter((f) => /^screen-[a-z]+\.js$/.test(f));
  assert.ok(screens.includes('screen-home.js'));
  for (const f of screens) {
    const { screen } = await import(`../../src/${f}`);
    assert.equal(screen.id, f.slice('screen-'.length, -'.js'.length), f);
    assert.equal(typeof screen.needs, 'function', f);
    assert.equal(typeof screen.render, 'function', f);
    if ('mount' in screen) assert.equal(typeof screen.mount, 'function', f);
  }
});

test('los nueve módulos del diseño anterior no vuelven', () => {
  assert.deepEqual(OLD.filter((f) => MODULES.includes(f)), []);
});
```

Crear `scripts/tests/test_rediseno_index.mjs`:

```js
// Plan B2, tarea 4: index.html es el esqueleto del rediseño (spec §5.4 y §10). La cabecera, la
// barra y la primera caja se pintan antes de que lleguen los datos; app.js sustituye la caja. Lo
// que lee el bot (generate_js.py y source_health.py) se ejecuta de verdad en
// test_index_bot_contract.py; aquí, la forma.
import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tabbar } from '../../src/ui.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const INDEX = readFileSync(join(ROOT, 'index.html'), 'utf8');

test('esqueleto: saltar al contenido, cabecera, la barra de ui.tabbar y main#contenido.page con su primera caja', () => {
  assert.match(INDEX, /<html lang="es">/);
  assert.match(INDEX, /<a class="skip-link" href="#contenido">Saltar al contenido<\/a>/);
  assert.match(INDEX, /<header class="shell-header">/);
  assert.ok(INDEX.includes(String(tabbar('miequipo'))), 'la barra estática es ui.tabbar("miequipo"), tal cual');
  assert.equal((INDEX.match(/<nav\b/g) || []).length, 1);
  assert.match(INDEX, /<main id="contenido" class="page" tabindex="-1">\s*<div class="box skeleton" aria-hidden="true"><\/div>\s*<\/main>/);
  assert.doesNotMatch(INDEX, /<h1\b/, 'el h1 lo pone cada pantalla');
});

test('datos inmediatos: los nueve data-*.js de antes, en el mismo orden (decisión 5), y después el arranque', () => {
  const scripts = [...INDEX.matchAll(/<script\b[^>]*\bsrc="\.\/([^"?]+)\?v=\d{8}[a-z]?"[^>]*><\/script>/g)].map((m) => m[1]);
  assert.deepEqual(scripts, [
    'data-benjamin.js', 'data-prebenjamin.js', 'data-history.js', 'data-goleadores.js',
    'data-matchdetail-keys.js', 'data-shields.js', 'data-stats.js', 'data-seasons.js',
    'data-maspalomas-cup-2026.js',
  ]);
  // app.js no se arranca al importarse: index.html lo importa (versionado, como los datos) y llama a start.
  const boot = INDEX.match(/<script type="module">[\s\S]*?<\/script>/);
  assert.ok(boot, 'falta el arranque');
  assert.match(boot[0], /const \{ start \} = await import\('\.\/src\/app\.js\?v=\d{8}[a-z]?'\);\s*start\(document, window\);/);
  assert.ok(INDEX.indexOf(boot[0]) > INDEX.indexOf('data-maspalomas-cup-2026.js'), 'arranca después de los datos');
  // Antes, quita de las cachés de la app anterior (las que guardan src/render.js) sus app.js, state.js
  // y links.js: su SW los serviría viejos aunque cambie la ?v= (A1 de la revisión adversarial).
  assert.match(boot[0], /if \(navigator\.serviceWorker\?\.controller\) \{/);
  assert.match(boot[0], /for \(const name of await caches\.keys\(\)\)/);
  assert.match(boot[0], /cache\.match\('\.\/src\/render\.js', \{ ignoreSearch: true \}\)/);
  assert.match(boot[0], /for \(const file of \['\.\/src\/app\.js', '\.\/src\/state\.js', '\.\/src\/links\.js'\]\) await cache\.delete\(file, \{ ignoreSearch: true \}\);/);
  assert.ok(boot[0].indexOf('caches.keys') < boot[0].indexOf("import('./src/app.js"), 'limpia antes de importar');
  assert.doesNotMatch(INDEX, /<script\b[^>]*\bdefer\b/, 'defer llega en B4');
});

test('si el arranque falla, un aviso con estilos en línea y «Reintentar», que busca el SW nuevo y recarga (R2-3)', () => {
  const boot = INDEX.match(/<script type="module">[\s\S]*?<\/script>/)[0];
  // Todo el arranque (la limpieza, el import y start) va dentro del try: sin conexión en plena
  // transición no hay acta.css ni los módulos nuevos, y la página nunca se queda en «Cargando…».
  assert.match(boot, /^<script type="module">\s*(?:\/\/[^\n]*\s*)*try \{\s*if \(navigator\.serviceWorker\?\.controller\)/);
  assert.ok(boot.indexOf('} catch (error) {') > boot.indexOf('start(document, window);'), 'el catch recoge el import y start');
  assert.match(boot, /innerHTML = `<div role="alert" style="[^"]+">\s*<p style="[^"]+">No se pudo abrir la versión nueva de la app\. Comprueba la conexión y pulsa Reintentar\.<\/p>\s*<button type="button" id="reintentar-arranque" style="[^"]*min-height:44px[^"]*">Reintentar<\/button>\s*<\/div>`;/);
  const retry = boot.slice(boot.indexOf("getElementById('reintentar-arranque')"));
  assert.match(retry, /registration\.update\(\)/, 'Reintentar busca el SW nuevo');
  assert.match(retry, /location\.reload\(\);/, 'y recarga');
});

test('marcas del bot: una sola versión en todas las ?v=, data-seasons.js versionado y el literal oculto', () => {
  const versions = new Set([...INDEX.matchAll(/\?v=([0-9a-z]+)/g)].map((m) => m[1]));
  assert.equal(versions.size, 1, [...versions].join(', '));
  assert.match([...versions][0], /^\d{8}[a-z]?$/);
  // La hoja va en una URL nueva, acta.css: el SW de la app anterior sirve style.css desde su caché.
  assert.match(INDEX, /<link rel="stylesheet" href="\.\/acta\.css\?v=\d{8}[a-z]?">/);
  assert.match(INDEX, /<script src="\.\/data-seasons\.js\?v=\d{8}[a-z]?"><\/script>/);
  assert.match(INDEX, /<span id="legacyUpdated" hidden>Última actualización: \d{2}\/\d{2}\/\d{4}<\/span>/);
  assert.equal((INDEX.match(/Última actualización: /g) || []).length, 1);
});

test('tema del sistema: theme-color claro y oscuro, sin selector de tema ni fuentes de Google (spec §4.9)', () => {
  assert.match(INDEX, /<meta name="theme-color" content="#FFFFFF" media="\(prefers-color-scheme: light\)">/);
  assert.match(INDEX, /<meta name="theme-color" content="#15171C" media="\(prefers-color-scheme: dark\)">/);
  assert.doesNotMatch(INDEX, /fonts\.googleapis|fonts\.gstatic|style-acta\.css|style\.css|themeToggle|data-theme/);
});
```

Crear `scripts/tests/test_rediseno_home.mjs`:

```js
// Plan B2, tarea 4: la portada (screen-home.js) y el arranque (startContext de app.js). render(ctx)
// es puro: se prueba en Node con el contexto que construye startContext sobre las fixtures
// congeladas, con `today` inyectado (spec §11). Estas pruebas fijan lo que comparten la portada
// mínima del corte y la completa de las Tareas 7 y 8: el estado, la cabecera de pantalla con su h1,
// el título y el contexto de su primer bloque y los textos de §4.2. El detalle de cada estado va en
// test_rediseno_portada.mjs (Tareas 7 y 8).
import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { fixture } from './fixtures/rediseno/load.mjs';
import { currentAt, nextSeasonRaw, datasetsFrom } from './fixtures/rediseno/simulate.mjs';
import { STORE_KEY, LEGACY_KEY } from '../../src/store.js';
import { startContext } from '../../src/app.js';
import { screen } from '../../src/screen-home.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const DEFAULT_TEAM = { cat: 'prebenjamin', groupId: 'PG2', name: 'Las Mesas Hu.' };
const PORTAL = { season: '2025-2026', defaultTeam: DEFAULT_TEAM };
const PORTAL_2627 = { season: '2026-2027', defaultTeam: DEFAULT_TEAM };

// Un Storage en memoria; `items` es el contenido inicial.
function memoryStorage(items = {}) {
  const map = new Map(Object.entries(items));
  return { map, getItem: (key) => (map.has(key) ? map.get(key) : null), setItem: (key, value) => { map.set(key, String(value)); } };
}
const saved = (myTeam) => memoryStorage({ [STORE_KEY]: JSON.stringify({ myTeam, recent: [] }) });
const LAS_MESAS_2526 = { name: 'Las Mesas Hu.', season: '2025-2026', cat: 'prebenjamin', groupId: 'PG2' };

function page({ raw = fixture('current-2025-2026'), today, portal = PORTAL, storage = memoryStorage() }) {
  const base = startContext({ storage, portal, datasets: datasetsFrom(raw), today });
  const ctx = { ...base, route: { screen: '', params: {} }, params: {} };
  return { ctx, out: String(screen.render(ctx)) };
}
const stateOf = (out) => (out.match(/^<section data-screen="home" data-state="([A-Z])">/) || [])[1];
const text = (out) => out.replace(/<[^>]+>/g, ' ').replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim();
const h1s = (out) => [...out.matchAll(/<h1\b[^>]*>([^<]*)<\/h1>/g)].map((m) => m[1]);
// Título y contexto (si es texto) de cada bloque, en orden.
const blocks = (out) => [...out.matchAll(/<h2 class="block-title">([^<]*)<\/h2>(?:<p class="block-context">([^<]*)<\/p>)?/g)]
  .map((m) => [m[1], m[2] ?? null]);

test('contrato de pantalla: id, needs y render; raíz <section data-screen="home" data-state> con la cabecera y un solo h1', () => {
  assert.equal(screen.id, 'home');
  assert.deepEqual(screen.needs({}, { health: fixture('health') }), []);
  const { out } = page({ today: '2026-09-23' });
  assert.equal(stateOf(out), 'D');
  assert.match(out, /^<section data-screen="home" data-state="D"><header class="screen-head">/);
  assert.deepEqual(h1s(out), ['Las Mesas Hu.']);
  assert.match(out, /<\/section>$/);
});

test('A (01/03/2026): escudo, nombre, grupo y «Cambiar» en la cabecera, y «Próximo partido» con la cuenta atrás', () => {
  const { out } = page({ raw: currentAt('2026-03-01'), today: '2026-03-01' });
  assert.equal(stateOf(out), 'A');
  const head = out.match(/<header class="screen-head">[\s\S]*?<\/header>/)[0];
  assert.match(head, /^<header class="screen-head"><img class="crest crest-46" src="\.\/escudos\/s\/lasMesasEscudo\.png"[^>]*decoding="async">/);
  assert.doesNotMatch(head, /loading="lazy"/, 'el escudo de la primera pantalla no espera');
  assert.match(head, /<h1>Las Mesas Hu\.<\/h1><p class="screen-sub">Prebenjamín, Grupo 2 de Gran Canaria<\/p><\/div><a class="screen-action" href="#\/explorar#buscar">Cambiar<\/a><\/header>$/);
  assert.deepEqual(blocks(out)[0], ['Próximo partido', 'faltan 6 días']);
});

test('B al empezar (01/10/2025): el próximo partido y un único vacío, «Aún no se ha jugado ninguna jornada»', () => {
  const { out } = page({ raw: currentAt('2025-10-01'), today: '2025-10-01' });
  assert.equal(stateOf(out), 'B');
  assert.deepEqual(blocks(out)[0], ['Próximo partido', 'faltan 10 días']);
  assert.equal((out.match(/<p class="empty">/g) || []).length, 1);
  assert.match(out, /<p class="empty">Aún no se ha jugado ninguna jornada<\/p>/);
});

test('B de un equipo que no juega en un grupo que ya juega (CD Batán, M2): nunca «ninguna jornada»', () => {
  const { out } = page({ today: '2026-03-01', storage: saved({ ...LAS_MESAS_2526, name: 'CD Batán' }) });
  assert.equal(stateOf(out), 'B');
  assert.deepEqual(h1s(out), ['CD Batán']);
  assert.doesNotMatch(out, /Aún no se ha jugado ninguna jornada/);
  assert.match(out, /<p class="empty">CD Batán figura como retirado en este grupo<\/p>/);
});

test('C (31/05/2026): «Último partido», que abre la ficha del 2–7', () => {
  const { out } = page({ today: '2026-05-31' });
  assert.equal(stateOf(out), 'C');
  assert.equal(blocks(out)[0][0], 'Último partido');
  assert.match(out, /href="#\/partido\?s=2025-2026&amp;g=PG2&amp;r=Jornada%2030&amp;h=Las%20Mesas%20Hu\.&amp;a=AD%20Hurac%C3%A1n"/);
});

test('D (23/09/2026, datos de hoy): la temporada terminada, con sus bloques y sin próximo ni último partido', () => {
  const { out } = page({ today: '2026-09-23' });
  assert.equal(stateOf(out), 'D');
  assert.ok(blocks(out).length > 0, 'algún bloque');
  assert.doesNotMatch(out, /Próximo partido|Último partido/);
});

test('E (2026/27 con Las Mesas en las dos categorías): la pregunta con cada candidato y «Ninguno»', () => {
  const { ctx, out } = page({
    raw: nextSeasonRaw({ benjamin: ['B2'], prebenjamin: ['PG2'] }), today: '2026-10-01', portal: PORTAL_2627,
    storage: saved(LAS_MESAS_2526),
  });
  assert.equal(ctx.resolution.status, 'ask');
  assert.equal(stateOf(out), 'E');
  assert.deepEqual(h1s(out), ['Las Mesas Hu.']);
  assert.deepEqual(blocks(out).map(([title]) => title), ['¿En qué equipo juega ahora?']);
  assert.match(text(out), /Las Mesas Hu\. Prebenjamín, Grupo 2 de Gran Canaria Las Mesas B Benjamín, Segunda Fase B, Grupo 2 Ninguno: buscar otro equipo/);
  assert.equal((out.match(/<button type="button" class="choice" data-action="elegir" data-index="\d">/g) || []).length, 2);
  assert.doesNotMatch(out, />Cambiar</, 'la pregunta ya ofrece buscar otro equipo');
});

test('X (2026/27 sin Las Mesas): «Las Mesas Hu. no aparece en 2026/27» y «Elegir equipo»', () => {
  const { out } = page({
    raw: nextSeasonRaw({ benjamin: ['A1'], prebenjamin: ['PG3'] }), today: '2026-10-01', portal: PORTAL_2627,
    storage: saved(LAS_MESAS_2526),
  });
  assert.equal(stateOf(out), 'X');
  assert.match(out, /<p class="empty">Las Mesas Hu\. no aparece en 2026\/27<\/p>/);
  assert.match(out, /<a class="button is-main" href="#\/explorar#buscar">Elegir equipo<\/a>/);
});

test('primera visita y almacenamiento roto: la portada del equipo por defecto, sin preguntas (foco 3)', () => {
  const blocked = { getItem() { throw new Error('SecurityError'); }, setItem() { throw new Error('SecurityError'); } };
  const cases = [
    ['vacío', memoryStorage()],
    ['bloqueado', blocked],
    ['que lanza al abrirlo', () => { throw new Error('SecurityError'); }],
  ];
  for (const [name, storage] of cases) {
    const { ctx, out } = page({ today: '2026-09-23', storage });
    assert.deepEqual(ctx.myTeam, { ...DEFAULT_TEAM, season: '2025-2026' }, name);
    assert.equal(ctx.resolution.status, 'ok', name);
    assert.equal(stateOf(out), 'D', name);
  }
  const empty = memoryStorage();
  page({ today: '2026-09-23', storage: empty });
  assert.equal(empty.map.size, 0, 'el equipo por defecto no se guarda solo');
});

test('favoritos v1: la migración y el paso 0, sin preguntas (foco 3)', () => {
  const storage = memoryStorage({ [LEGACY_KEY]: JSON.stringify(fixture('favorites-v1')) });
  const { ctx, out } = page({ today: '2026-09-23', storage });
  assert.deepEqual(ctx.myTeam, LAS_MESAS_2526);
  assert.equal(ctx.resolution.status, 'ok');
  assert.equal(ctx.resolution.group.id, 'PG2');
  assert.equal(stateOf(out), 'D');
  assert.ok(storage.map.has(STORE_KEY), 'la migración escribe v2');
  assert.ok(storage.map.has(LEGACY_KEY), 'y no borra v1');
});

test('render es puro y escapa: mismo ctx, mismo HTML; un nombre con comillas y «<» no rompe nada', () => {
  const { ctx, out } = page({ today: '2026-09-23' });
  assert.equal(String(screen.render(ctx)), out);
  const odd = 'MESAS, U.D. LAS "<B>"';
  const x = page({ raw: nextSeasonRaw({ prebenjamin: ['PG3'] }), today: '2026-10-01', portal: PORTAL_2627,
    storage: saved({ ...LAS_MESAS_2526, name: odd }) }).out;
  assert.equal(stateOf(x), 'X');
  assert.ok(x.includes('<h1>MESAS, U.D. LAS &quot;&lt;B&gt;&quot;</h1>'));
  assert.doesNotMatch(x, /<B>/);
});

test('cada clase que pinta la portada existe en acta.css', () => {
  const css = readFileSync(join(ROOT, 'acta.css'), 'utf8');
  const defined = new Set([...css.replace(/\/\*[\s\S]*?\*\//g, '').matchAll(/\.([a-zA-Z][\w-]*)/g)].map((m) => m[1]));
  const outs = [
    page({ raw: currentAt('2026-03-01'), today: '2026-03-01' }), page({ raw: currentAt('2025-10-01'), today: '2025-10-01' }),
    page({ today: '2026-05-31' }), page({ today: '2026-09-23' }),
    page({ raw: nextSeasonRaw({ benjamin: ['B2'], prebenjamin: ['PG2'] }), today: '2026-10-01', portal: PORTAL_2627, storage: saved(LAS_MESAS_2526) }),
    page({ raw: nextSeasonRaw({ prebenjamin: ['PG3'] }), today: '2026-10-01', portal: PORTAL_2627, storage: saved(LAS_MESAS_2526) }),
  ].map(({ out }) => out);
  assert.deepEqual(outs.map(stateOf), ['A', 'B', 'C', 'D', 'E', 'X']);
  const used = new Set(outs.flatMap((out) => [...out.matchAll(/class="([^"]+)"/g)].flatMap((m) => m[1].split(/\s+/))));
  assert.deepEqual([...used].filter((c) => !defined.has(c)), []);
});
```

Crear `scripts/tests/test_rediseno_smoke.mjs`:

```js
// Plan B2, tarea 4: checkRenderedDom (render-smoke.mjs) con marcadores independientes del estado
// (spec §11). Acepta la portada en A, B, C o D con su cabecera, el h1 del equipo y algún bloque;
// rechaza E, X, la caja de error y el esqueleto sin sustituir. Las páginas se construyen con la
// portada real (screen-home.js) sobre las fixtures, así que si la pantalla cambia sus marcadores,
// esta prueba lo dice.
import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { fixture } from './fixtures/rediseno/load.mjs';
import { currentAt, nextSeasonRaw, datasetsFrom } from './fixtures/rediseno/simulate.mjs';
import { STORE_KEY } from '../../src/store.js';
import { startContext } from '../../src/app.js';
import { screen } from '../../src/screen-home.js';
import { checkRenderedDom } from './render-smoke.mjs';

const TEAM = 'Las Mesas Hu.';
const DEFAULT_TEAM = { cat: 'prebenjamin', groupId: 'PG2', name: TEAM };
const storage = (myTeam) => {
  const map = new Map(myTeam ? [[STORE_KEY, JSON.stringify({ myTeam, recent: [] })]] : []);
  return { getItem: (key) => (map.has(key) ? map.get(key) : null), setItem: (key, value) => map.set(key, String(value)) };
};
function home({ raw = fixture('current-2025-2026'), today, season = '2025-2026', myTeam = null }) {
  const base = startContext({ storage: storage(myTeam), portal: { season, defaultTeam: DEFAULT_TEAM }, datasets: datasetsFrom(raw), today });
  return String(screen.render({ ...base, route: { screen: '', params: {} }, params: {} }));
}
// La página tal como la serializa Chrome: el esqueleto de index.html con la pantalla dentro.
const pageWith = (main) => `<!DOCTYPE html><html lang="es"><head></head><body><a class="skip-link" href="#contenido">Saltar al contenido</a><header class="shell-header"><a class="shell-brand" href="#/">Fútbol Base Las Palmas</a></header><nav class="tabbar"></nav><main id="contenido" class="page" tabindex="-1">${main}</main></body></html>`;
const LAS_MESAS_2526 = { name: TEAM, season: '2025-2026', cat: 'prebenjamin', groupId: 'PG2' };

test('acepta la portada en A, B, C y D, con el h1 del equipo', () => {
  const cases = {
    A: home({ raw: currentAt('2026-03-01'), today: '2026-03-01' }),
    B: home({ raw: currentAt('2025-10-01'), today: '2025-10-01' }),
    C: home({ today: '2026-05-31' }),
    D: home({ today: '2026-09-23' }),
  };
  for (const [state, main] of Object.entries(cases)) {
    const result = checkRenderedDom(pageWith(main), { teamName: TEAM });
    assert.deepEqual(result.failures, [], state);
    assert.equal(result.ok, true, state);
    assert.equal(result.state, state);
  }
});

test('rechaza E y X: la portada no puede quedarse preguntando ni sin equipo', () => {
  const e = home({ raw: nextSeasonRaw({ benjamin: ['B2'], prebenjamin: ['PG2'] }), today: '2026-10-01', season: '2026-2027', myTeam: LAS_MESAS_2526 });
  const x = home({ raw: nextSeasonRaw({ prebenjamin: ['PG3'] }), today: '2026-10-01', season: '2026-2027', myTeam: LAS_MESAS_2526 });
  for (const [state, main] of [['E', e], ['X', x]]) {
    const result = checkRenderedDom(pageWith(main), { teamName: TEAM });
    assert.equal(result.ok, false, state);
    assert.equal(result.state, state);
    assert.ok(result.failures.some((f) => f.includes(`estado ${state}`)), result.failures.join('; '));
  }
});

test('rechaza la caja de error, el esqueleto sin sustituir y otro equipo en el h1', () => {
  const error = checkRenderedDom(pageWith('<div class="box" role="alert"><p class="notice"><b>No se pudieron cargar los datos de la portada.</b></p><div class="buttons"><button type="button" class="button is-main" data-action="retry">Reintentar</button></div></div>'), { teamName: TEAM });
  assert.equal(error.ok, false);
  assert.ok(error.failures.some((f) => /Reintentar/.test(f)), error.failures.join('; '));
  const skeleton = checkRenderedDom(pageWith('<div class="box skeleton" aria-hidden="true"></div>'), { teamName: TEAM });
  assert.equal(skeleton.ok, false);
  assert.ok(skeleton.failures.some((f) => /esqueleto/.test(f)), skeleton.failures.join('; '));
  assert.ok(skeleton.failures.some((f) => /data-screen="home"/.test(f)));
  const other = checkRenderedDom(pageWith(home({ today: '2026-09-23' })), { teamName: 'AD Huracán' });
  assert.equal(other.ok, false);
  assert.ok(other.failures.some((f) => /AD Huracán/.test(f)), other.failures.join('; '));
});
```

`test_index_bot_contract.py` es una red de seguridad, no una prueba roja: el `index.html` viejo también la pasa, y el nuevo tiene que seguir pasándola.

Crear `scripts/tests/test_index_bot_contract.py`:

```python
"""Plan B2, tarea 4: el index.html y el sw.js del rediseño siguen siendo del bot.

generate_js.bump_cache_version y source_health.finish los leen y reescriben con
expresiones regulares. Si el esqueleto las rompiera, el bot dejaría de subir la
versión (o de publicar la fecha de los datos) sin avisar. Se ejecutan de verdad,
sobre copias de los ficheros reales.
"""
import json
import re
import shutil
import sys
from datetime import date, datetime, timezone
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "scripts"))
import generate_js  # noqa: E402
import source_health  # noqa: E402

VERSION_RE = re.compile(r"\?v=(\d{8}[a-z]?)")
FOOTER_RE = re.compile(r"Última actualización: (\d{2})/(\d{2})/(\d{4})")


@pytest.fixture
def site(tmp_path):
    for name in ("index.html", "sw.js"):
        shutil.copy(ROOT / name, tmp_path / name)
    return tmp_path


def test_bump_cache_version_sube_todas_las_marcas_y_nada_mas(site):
    before = (site / "index.html").read_text(encoding="utf-8")
    sw_before = (site / "sw.js").read_text(encoding="utf-8")
    generate_js.bump_cache_version(str(site))
    after = (site / "index.html").read_text(encoding="utf-8")
    versions = set(VERSION_RE.findall(after))
    assert len(versions) == 1, versions
    (version,) = versions
    assert version.startswith(date.today().strftime("%Y%m%d"))
    assert len(VERSION_RE.findall(after)) == len(VERSION_RE.findall(before)) >= 11
    assert f"Última actualización: {date.today().strftime('%d/%m/%Y')}" in after

    def neutral(text):
        return FOOTER_RE.sub("", VERSION_RE.sub("", text))

    assert neutral(after) == neutral(before), "el bot solo toca las marcas"
    sw = (site / "sw.js").read_text(encoding="utf-8")
    assert sw.splitlines()[0] == f"const CACHE_NAME = 'futbolbase-v{version}';"
    assert sw.splitlines()[1:] == sw_before.splitlines()[1:]


def test_source_health_lee_la_fecha_y_la_version_del_esqueleto(site, monkeypatch):
    monkeypatch.setattr(source_health, "ROOT", site)
    monkeypatch.setattr(source_health, "REPORT_PATH", site / "data-health.json")
    text = (site / "index.html").read_text(encoding="utf-8")
    day, month, year = FOOTER_RE.search(text).groups()
    version = re.search(r"data-seasons\.js\?v=([0-9a-z]+)", text).group(1)
    now = datetime(2026, 9, 24, 3, 35, tzinfo=timezone.utc)
    source_health.begin("2025-2026")
    source_health.record("PG2", "https://example.test/PG2", "ok", "15 equipos", now=now)
    source_health.finish(now=now)
    report = json.loads((site / "data-health.json").read_text(encoding="utf-8"))
    assert report["lastDataChange"] == f"{year}-{month}-{day}"
    assert report["dataVersion"] == version
```

Añadir al final de `scripts/tests/test_rediseno_state.mjs`:

```js
// ── Plan B2, tarea 4 (corte): decisiones 1 y 2 ──────────────────────────────

test('decisiones 1 y 2: state.js sin estado de interfaz, sin HTML y sin lo que ya cubre el modelo', () => {
  for (const gone of ['S', 'FEATURED', 'isFeatured', 'featuredStandingFrom', 'featuredMatchesFrom',
    'featuredScorersFrom', 'getTeamForm', 'isHistorical', 'getCurrentSeason', 'teamBadge', 'teamBadgeFallback',
    'handleBadgeError', 'installBadgeErrorDelegation', 'escapeHtml', 'escapeAttr', '$', '$$', 'el',
    'ACTIVATION_KEYS', 'makeActivatable', 'delegateActivation', 'buildUnifiedPrebenjamin', 'buildSparkline']) {
    assert.equal(gone in state, false, `${gone} sigue en state.js`);
  }
  for (const kept of ['jornadaLabel', 'validJorGroup', 'knockoutRoundsSource', 'phaseIcon', 'groupJornadaLabel',
    'unifiedPrebenLeagueGroups', 'getPhases', 'countStats', 'countMatches', 'getData', 'withSeasonCup', 'teamScorers']) {
    assert.equal(typeof state[kept], 'function', kept);
  }
  assert.doesNotMatch(read('src/state.js'), /<(img|span|div|table|svg)\b/, 'state.js ya no pinta HTML');
});

test('decisión 2: teamScorers(gol, team), los goleadores del equipo en su grupo, por goles y partidos', () => {
  const gol = [
    { id: 'PG1', g: 'PREBENJAMIN GC GRUPO 1', s: [['Otro, Grupo', 'Las Mesas Hu.', 30, 20]] },
    { id: 'PG2', g: 'PREBENJAMIN GC GRUPO 2', s: [
      ['Santana Santacruz, Agoney', 'Las Mesas Hu.', 11, 21], ['De La Rosa Perello, Theo', 'Las Mesas Hu.', 12, 17],
      ['Igual, Goles', 'Las Mesas Hu.', 11, 19], ['Filial, Uno', 'Las Mesas B', 20, 10], ['Rival, Uno', 'AD Huracán', 40, 20]] },
  ];
  const team = { cat: 'prebenjamin', groupId: 'PG2', name: 'Las Mesas Hu.' };
  assert.deepEqual(state.teamScorers(gol, team), [
    { name: 'De La Rosa Perello, Theo', goals: 12, games: 17 },
    { name: 'Igual, Goles', goals: 11, games: 19 },
    { name: 'Santana Santacruz, Agoney', goals: 11, games: 21 },
  ]);
  // Los ficheros antiguos de prebenjamín identifican el grupo por su texto.
  const legacy = gol.map(({ g, s }) => ({ g, s }));
  assert.equal(state.teamScorers(legacy, team).length, 3);
  assert.deepEqual(state.teamScorers(legacy, { ...team, cat: 'benjamin' }), []);
  assert.deepEqual(state.teamScorers(gol, { ...team, groupId: 'PG9' }), []);
  assert.deepEqual(state.teamScorers(undefined, team), []);
  assert.deepEqual(state.teamScorers(gol, null), []);
});

test('decisión 1: getPhases(groups) y countStats(season, cat) reciben lo que antes leían de S', async () => {
  const groups = [{ id: 'B', phase: 'Fase 1', name: 'Grupo 10' }, { id: 'A', phase: 'Fase 1', name: 'Grupo 2' },
    { id: 'C', phase: 'Fase 2', name: 'Grupo 1' }];
  const ids = (map) => Object.fromEntries(Object.entries(map).map(([phase, list]) => [phase, list.map((g) => g.id)]));
  assert.deepEqual(ids(state.getPhases(groups)), { 'Fase 1': ['A', 'B'], 'Fase 2': ['C'] });
  assert.deepEqual(state.getPhases(null), {});
  bodies['data-season-2021-2022.js'] = 'const SEASON_2021_2022={"name":"2021-2022","current":false,"benjamin":[{"id":"GC1","name":"Grupo 1","phase":"Primera Fase","standings":[[1,"X",3,1,1,0,0,2,0,2],[2,"Y",0,1,0,0,1,0,2,-2]],"jornadas":{"1":[["01/10","X","Y",2,0]]}}],"prebenjamin":[]};';
  assert.ok(await state.ensureSeasonData('2021-2022'));
  assert.deepEqual(state.countStats('2021-2022', 'benjamin'), { groups: 1, teams: 2, matches: 1 });
  assert.deepEqual(state.countStats('2021-2022', 'prebenjamin'), { groups: 0, teams: 0, matches: 0 });
  assert.deepEqual(state.countStats('2019-2020', 'benjamin'), { groups: 0, teams: 0, matches: 0 }, 'sin cargar, nada');
});
```

Añadir al final de `scripts/tests/test_rediseno_css.mjs`:

```js
// ── Plan B2, tarea 4: la cabecera de pantalla y la pregunta de la portada ───

test('cabecera de pantalla (screenHead): 72 px con regla de tinta; «‹» y la acción miden 44 px', () => {
  const head = decl('.screen-head');
  assert.match(head, /min-height:\s*72px/);
  assert.match(head, /border-bottom:\s*2px solid var\(--ink\)/);
  assert.match(decl('.screen-head-text'), /min-width:\s*0/, 'sin min-width el nombre empujaría la página a 320 px');
  // El nombre completo en una línea: si no cabe a 320 px, con elipsis (spec §3.5).
  const h1 = decl('.screen-head h1');
  for (const rule of [/white-space:\s*nowrap/, /text-overflow:\s*ellipsis/, /overflow:\s*hidden/]) assert.match(h1, rule);
  assert.match(decl('.screen-sub'), /color:\s*var\(--mute\)/);
  for (const sel of ['.back', '.screen-action']) assert.match(decl(sel), /min-height:\s*44px/, sel);
  assert.match(decl('.back'), /width:\s*44px/);
  assert.match(decl('.screen-action'), /color:\s*var\(--ink\)/, 'la acción, en tinta también cuando es un botón');
});

test('portada: cada candidato de la pregunta (estado E) es un botón de al menos 44 px, con el nombre en tinta', () => {
  assert.match(decl('.choice'), /min-height:\s*56px/);
  assert.match(decl('.choice-name'), /color:\s*var\(--ink\)/);
  assert.match(decl('.choice-text'), /min-width:\s*0/);
});
```

Añadir al final de `scripts/tests/test_rediseno_ui.mjs`:

```js
// ── Plan B2, tarea 4: la cabecera de pantalla, común a todas las pantallas ──
import { html } from '../../src/html.js';
import { screenHead, backLink } from '../../src/ui.js';

test('screenHead: el único h1 con su etiqueta, «‹» y escudo a la izquierda, acción a la derecha; todo escapado', () => {
  const escudo = crest('Las Mesas Hu.', { size: 46, shields: SHIELDS, lazy: false });
  assert.equal(s(screenHead('Las Mesas Hu.', { sub: 'Prebenjamín, Grupo 2 de Gran Canaria', crest: escudo, action: { href: '#/explorar', label: 'Cambiar' } })),
    `<header class="screen-head">${escudo}<div class="screen-head-text"><h1>Las Mesas Hu.</h1>`
    + '<p class="screen-sub">Prebenjamín, Grupo 2 de Gran Canaria</p></div><a class="screen-action" href="#/explorar">Cambiar</a></header>');
  const partido = s(screenHead('Partido', {
    sub: 'Jornada 15, Grupo 2 de Gran Canaria', back: '#/jornada?g=PG2&r=Jornada%2015',
    action: html`<button class="screen-action" type="button" data-action="share">Compartir</button>`,
  }));
  assert.match(partido, /^<header class="screen-head"><a class="back" href="#\/jornada\?g=PG2&amp;r=Jornada%2015" data-action="back" aria-label="Volver">‹<\/a><div class="screen-head-text"><h1>Partido<\/h1>/);
  assert.match(partido, /<button class="screen-action" type="button" data-action="share">Compartir<\/button><\/header>$/);
  const raro = s(screenHead('MESAS, U.D. LAS "B"', { sub: '<i>x</i>', action: { href: '#/x"', label: '<b>y</b>' } }));
  assert.match(raro, /<h1>MESAS, U\.D\. LAS &quot;B&quot;<\/h1>/);
  assert.doesNotMatch(raro, /<i>|<b>|href="#\/x"/);
  assert.equal(s(screenHead('Jornada')), '<header class="screen-head"><div class="screen-head-text"><h1>Jornada</h1></div></header>');
  assert.equal(s(screenHead(html`Partido<span class="vh">: A – B</span>`)), '<header class="screen-head"><div class="screen-head-text"><h1>Partido<span class="vh">: A – B</span></h1></div></header>');
  assert.equal(s(backLink('#/explorar')), '<a class="back" href="#/explorar" data-action="back" aria-label="Volver">‹</a>');
});

test('cada clase que emite screenHead existe en acta.css', () => {
  const css = readFileSync(join(ROOT, 'acta.css'), 'utf8');
  const defined = new Set([...css.replace(/\/\*[\s\S]*?\*\//g, '').matchAll(/\.([a-zA-Z][\w-]*)/g)].map(m => m[1]));
  const out = s(screenHead('t', { sub: 's', back: '#', action: { href: '#', label: 'a' } }));
  const used = new Set([...out.matchAll(/class="([^"]+)"/g)].flatMap(m => m[1].split(/\s+/)));
  assert.deepEqual([...used].filter(c => !defined.has(c)), []);
});
```

Añadir al final de `scripts/tests/test_rediseno_model_nombres.mjs`:

```js
// ── Plan B2, tarea 4: seasonLabel, la temporada tal como se lee en pantalla ─
import { seasonLabel } from '../../src/model.js';

test('seasonLabel: «2025-2026» → «2025/26»; lo que no es una temporada queda igual', () => {
  assert.equal(seasonLabel('2025-2026'), '2025/26');
  assert.equal(seasonLabel('2026-2027'), '2026/27');
  assert.equal(seasonLabel('2021-2022'), '2021/22');
  assert.equal(seasonLabel('1999-2000'), '1999/00');
  assert.equal(seasonLabel(''), '');
  assert.equal(seasonLabel(null), '');
  assert.equal(seasonLabel('Temporada'), 'Temporada');
});
```

`test_sw_fixes.mjs` compara `STATIC_ASSETS` con el grafo exacto, sin el umbral mágico `>= 8`, y deja de exigir tres módulos viejos:

```bash
cd /home/manolo/claude/futbol-base
python3 - <<'PY'
from pathlib import Path


def between(src, start, end, new):
    assert src.count(start) == 1 and src.count(end) == 1, (start, end)
    i, j = src.index(start), src.index(end)
    assert i < j, (start, end)
    return src[:i] + new + src[j:]


def once(src, old, new):
    assert src.count(old) == 1, old
    return src.replace(old, new)


p = Path('scripts/tests/test_sw_fixes.mjs')
s = p.read_text(encoding='utf-8')
s = once(s, "import { readFileSync } from 'node:fs';", "import { readFileSync, readdirSync, existsSync } from 'node:fs';")
s = between(s, "test('STATIC_ASSETS covers the whole static import graph of src/app.js', () => {",
            "test('invariant: data-matchdetail.js lazy (not precached), keys file eager', () => {", """test('STATIC_ASSETS lleva exactamente el grafo de imports estáticos de src/app.js', () => {
  assert.ok(Array.isArray(sw.STATIC_ASSETS), 'STATIC_ASSETS must be an array');
  const graph = [...staticImportGraph('app.js')].sort();
  assert.ok(graph.includes('screen-home.js') && graph.includes('state.js'), graph.join(', '));
  // Sin umbral: ni falta un módulo del grafo ni sobra uno que ya no existe (404 al instalar).
  const precached = [...sw.STATIC_ASSETS].filter(url => url.startsWith('./src/')).map(url => url.slice('./src/'.length)).sort();
  assert.deepEqual(precached, graph);
});

test('STATIC_ASSETS lleva la página, la fuente alojada y los iconos de la PWA (spec §5.5)', () => {
  const files = (dir, ext) => readdirSync(join(ROOT, dir)).filter(f => f.endsWith(ext)).map(f => `./${dir}/${f}`);
  const wanted = ['./', './index.html', './acta.css', './manifest.json', './data-health.json',
    ...files('fonts', '.woff2'), ...files('icons', '.png')];
  assert.ok(wanted.length >= 10, wanted.join(', '));
  for (const url of wanted) assert.ok(sw.STATIC_ASSETS.includes(url), `${url} missing in STATIC_ASSETS`);
});

test('cada entrada de STATIC_ASSETS existe en el repositorio', () => {
  for (const url of sw.STATIC_ASSETS) {
    if (url === './') continue;
    assert.ok(existsSync(join(ROOT, url)), `${url} no existe: el service worker lo pediría en cada instalación`);
  }
});

""")
p.write_text(s, encoding='utf-8')
PY
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd /home/manolo/claude/futbol-base
node --test scripts/tests/test_rediseno_modulos.mjs scripts/tests/test_rediseno_index.mjs scripts/tests/test_rediseno_home.mjs scripts/tests/test_rediseno_smoke.mjs scripts/tests/test_rediseno_state.mjs scripts/tests/test_rediseno_css.mjs scripts/tests/test_rediseno_ui.mjs scripts/tests/test_rediseno_model_nombres.mjs scripts/tests/test_sw_fixes.mjs 2>&1 | grep -E '^# (tests|pass|fail)'
python3 -m pytest scripts/tests/test_index_bot_contract.py -q 2>&1 | tail -1 | sed -E 's/ in [0-9.]+s$//'
```
Esperado: fallan las pruebas nuevas (las de `home` y `smoke` no llegan a cargar `screen-home.js`, y `ui` y `model_nombres` no encuentran `screenHead` ni `seasonLabel`), y la de Python pasa con el `index.html` viejo:
```text
# tests 66
# pass 45
# fail 21
2 passed
```

- [ ] **Step 3: Write the implementation**

**3a. `index.html`, esqueleto.** La cabecera, la barra y la primera caja se pintan antes de que lleguen los datos; al final, un módulo en línea importa `app.js` y llama a su arranque. Si el arranque falla, el mismo módulo pinta un aviso con «Reintentar» (decisión 131): sin conexión en plena transición, la caché del SW anterior ya tiene este `index.html`, pero no `acta.css` ni los módulos nuevos, y la página se quedaría en «Cargando…».

Reescribir `index.html` con este contenido:

```html
<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover">
  <title>Fútbol Base Las Palmas</title>
  <meta name="description" content="Tu equipo de fútbol base en Canarias: próximo partido, resultados, clasificación y goleadores. Sin publicidad.">
  <meta name="mobile-web-app-capable" content="yes">
  <meta name="apple-mobile-web-app-capable" content="yes">
  <meta name="apple-mobile-web-app-status-bar-style" content="default">
  <meta name="apple-mobile-web-app-title" content="Fútbol Base LP">
  <meta name="theme-color" content="#FFFFFF" media="(prefers-color-scheme: light)">
  <meta name="theme-color" content="#15171C" media="(prefers-color-scheme: dark)">
  <link rel="apple-touch-icon" href="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><text y='.9em' font-size='90'>⚽</text></svg>">
  <link rel="icon" href="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><text y='.9em' font-size='90'>⚽</text></svg>">
  <link rel="manifest" href="./manifest.json">
  <link rel="stylesheet" href="./acta.css?v=20260923j">
</head>
<body>
  <a class="skip-link" href="#contenido">Saltar al contenido</a>
  <header class="shell-header">
    <a class="shell-brand" href="#/">Fútbol Base Las Palmas</a>
  </header>
  <nav class="tabbar" aria-label="Navegación principal"><a class="tab" href="#/" aria-current="page"><span class="tab-icon"><svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="square" stroke-linejoin="miter" aria-hidden="true" focusable="false"><path d="M12 3l7 2.6V11c0 4.4-2.9 7.9-7 9.6-4.1-1.7-7-5.2-7-9.6V5.6z"/><path d="M5.2 10.5h13.6"/></svg></span><span class="tab-label">Mi equipo</span></a><a class="tab" href="#/jornada"><span class="tab-icon"><svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="square" stroke-linejoin="miter" aria-hidden="true" focusable="false"><rect x="4" y="5.5" width="16" height="14.5"/><path d="M4 10h16M8.5 3.5v4M15.5 3.5v4"/></svg></span><span class="tab-label">Jornada</span></a><a class="tab" href="#/tabla"><span class="tab-icon"><svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="square" stroke-linejoin="miter" aria-hidden="true" focusable="false"><rect x="4" y="4.5" width="16" height="15"/><path d="M4 9.5h16M4 14.5h16M9.5 4.5v15"/></svg></span><span class="tab-label">Tabla</span></a><a class="tab" href="#/explorar"><span class="tab-icon"><svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="square" stroke-linejoin="miter" aria-hidden="true" focusable="false"><circle cx="10.5" cy="10.5" r="6"/><path d="M15 15l5 5"/></svg></span><span class="tab-label">Explorar</span></a></nav>
  <main id="contenido" class="page" tabindex="-1">
    <div class="box skeleton" aria-hidden="true"></div>
  </main>
  <span id="legacyUpdated" hidden>Última actualización: 23/09/2026</span>

  <!-- Datos inmediatos: los mismos nueve de antes del corte y en el mismo orden (Plan B2,
       decisión 5). defer, carga perezosa y la baja de data-matchdetail-keys.js son de B4. -->
  <script src="./data-benjamin.js?v=20260923j"></script>
  <script src="./data-prebenjamin.js?v=20260923j"></script>
  <script src="./data-history.js?v=20260923j"></script>
  <script src="./data-goleadores.js?v=20260923j"></script>
  <script src="./data-matchdetail-keys.js?v=20260923j"></script>
  <script src="./data-shields.js?v=20260923j"></script>
  <script src="./data-stats.js?v=20260923j"></script>
  <script src="./data-seasons.js?v=20260923j"></script>
  <script src="./data-maspalomas-cup-2026.js?v=20260923j"></script>
  <script type="module">
    // El SW de la app anterior sirve los módulos de src/ desde su caché, aunque cambie la ?v=, y los
    // actualiza en segundo plano: si una actualización falló, su app.js, state.js o links.js es el
    // viejo y la app nueva no arranca. Si un SW controla la página, antes de importar app.js se quitan
    // esos tres de las cachés de la app anterior (las que guardan src/render.js, que ya no existe);
    // los pedirá a la red. Sin SW al mando, las peticiones van a la red y no hay nada que quitar.
    // Si el arranque falla (sin conexión en plena transición, cuando esa caché ya guarda este
    // index.html pero no acta.css ni los módulos nuevos, o un módulo que no llega), un aviso con
    // estilos en línea y «Reintentar»: nunca «Cargando…» para siempre. Es texto fijo, sin datos.
    try {
      if (navigator.serviceWorker?.controller) {
        try {
          for (const name of await caches.keys()) {
            const cache = await caches.open(name);
            if (!(await cache.match('./src/render.js', { ignoreSearch: true }))) continue;
            for (const file of ['./src/app.js', './src/state.js', './src/links.js']) await cache.delete(file, { ignoreSearch: true });
          }
        } catch { /* sin Cache Storage: no hay nada que quitar */ }
      }
      const { start } = await import('./src/app.js?v=20260923j');
      start(document, window);
    } catch (error) {
      console.error('[arranque]', error);
      document.getElementById('contenido').innerHTML = `<div role="alert" style="max-width:40rem;margin:0 auto;padding:24px 16px;font:16px/1.5 system-ui,sans-serif">
        <p style="margin:0 0 16px">No se pudo abrir la versión nueva de la app. Comprueba la conexión y pulsa Reintentar.</p>
        <button type="button" id="reintentar-arranque" style="min-height:44px;padding:0 20px;border:0;border-radius:0;background:#C0182B;color:#FFFFFF;font:inherit;font-weight:700">Reintentar</button>
      </div>`;
      document.getElementById('reintentar-arranque').addEventListener('click', async () => {
        // Que el navegador busque ya el SW nuevo (sin esperarlo más de 3 s) y otra vez desde el principio.
        try {
          const registration = await navigator.serviceWorker?.getRegistration();
          if (registration) await Promise.race([registration.update(), new Promise((resolve) => setTimeout(resolve, 3000))]);
        } catch { /* sin SW o sin red: se recarga igual */ }
        location.reload();
      });
    }
  </script>
  <script>
    // Standard SW registration: the browser's update cycle detects a
    // byte-different sw.js; skipWaiting+clients.claim in sw.js make the new
    // version take over immediately. registration.update() forces a check on
    // every load. (Never unregister here: that re-installed the full ~500KB
    // precache on EVERY visit.)
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('./sw.js')
        .then(reg => reg.update())
        .catch(() => {});
    }
  </script>
</body>
</html>
```

Las marcas de versión del bloque anterior son las de hoy. `sync_versions.py` (Tarea 1) pone las que tenga `HEAD` en ese momento, que son las del último commit del bot:

```bash
cd /home/manolo/claude/futbol-base
python3 scripts/sync_versions.py --from HEAD
```
Esperado, con los `?v=` del día:
```text
marcas de HEAD: ?v=20260923j, Última actualización: 23/09/2026, CACHE_NAME futbolbase-v20260923j
```

**3b. La hoja.** `style-acta.css` pasa a ser `acta.css` y gana el CSS de la cabecera de pantalla, el de la pregunta de E y el de la marca en escritorio. Va en una URL nueva, y el `style.css` viejo se borra: el SW de la app anterior sirve los `.css` con *cache-first* y buscando sin la `?v=`, así que `style.css?v=<nueva>` le daría la hoja vieja hasta que el SW nuevo termine de instalarse. Las pruebas de B1 leen la hoja nueva, y en el filtro de rutas de `tests.yml` `acta.css` sustituye a las dos de antes:

```bash
cd /home/manolo/claude/futbol-base
git rm -q style.css
git mv style-acta.css acta.css
python3 - <<'PY'
from pathlib import Path


def once(src, old, new):
    assert src.count(old) == 1, old
    return src.replace(old, new)


p = Path('acta.css')
s = p.read_text(encoding='utf-8')
s = once(s, """/* Sistema visual «Acta» en tinta roja (spec §3).
 * Sustituye a style.css en el corte de B2; hasta entonces no lo enlaza nadie.
 * Tema claro por defecto; el oscuro solo si el sistema lo pide (spec §4.9). */""", """/* Sistema visual «Acta» en tinta roja (spec §3).
 * Era style-acta.css hasta el corte de B2, que la convirtió en la hoja de la app con una URL nueva:
 * el SW de la app anterior sirve style.css desde su caché aunque cambie la ?v=.
 * Tema claro por defecto; el oscuro solo si el sistema lo pide (spec §4.9). */""")
s = s.rstrip('\n') + """

/* ── Cabecera de pantalla (maquetas 4, 5-1, 5-2 y 5-3): screenHead de ui.js ── */

.screen-head {
  display: flex;
  align-items: center;
  gap: 12px;
  min-height: 72px;
  margin: 0 calc(-1 * var(--gutter));
  padding: 14px var(--gutter) 8px;
  border-bottom: 2px solid var(--ink);
}
.screen-head-text { flex: 1 1 auto; min-width: 0; }
/* Nombre completo, con elipsis si no cabe a 320 px (spec §3.5). */
.screen-head h1 { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.screen-sub { margin-top: 2px; font-size: 12.5px; color: var(--mute); }
/* Enlace o botón («Cambiar», «Otro grupo», «Compartir»): los dos en tinta y subrayados. */
.screen-action {
  display: inline-flex;
  flex: none;
  align-items: center;
  min-height: 44px;
  font-weight: 700;
  color: var(--ink);
  text-decoration: underline;
  text-underline-offset: 3px;
}
.back {
  display: inline-flex;
  flex: none;
  align-items: center;
  justify-content: center;
  width: 44px;
  min-height: 44px;
  margin: 0 -8px 0 -12px;
  font-size: 28px;
  font-weight: 700;
  line-height: 1;
  color: var(--ink);
  text-decoration: none;
}

/* ── Mi equipo: la pregunta de E y la acción de X (spec §4.2) ──────────── */

.choices { margin: 0; padding: 0; list-style: none; }
.choices > li + li { border-top: 1px solid var(--line); }
.choice {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  min-height: 56px;
  padding: 8px 12px;
  color: var(--text);
  text-align: left;
  text-decoration: none;
}
.choice-text { display: flex; flex-direction: column; min-width: 0; }
.choice-name { font-size: 15px; font-weight: 800; color: var(--ink); overflow-wrap: anywhere; }
.choice-label { font-size: 12.5px; color: var(--mute); }
.choice-none { font-weight: 700; color: var(--ink); text-decoration: underline; }
.home-cta { margin-top: 10px; }

/* ── Cabecera de la app en el corte: la marca, solo en escritorio (spec §4.8) ──
 * La Tarea 5 (shell.js) completa la cabecera y la barra. */
.shell-brand { display: none; }
@media (min-width: 1024px) {
  .shell-header, .tabbar { max-width: 1120px; margin: 0 auto; padding: 0 var(--gutter); }
  .shell-brand {
    display: inline-flex;
    align-items: center;
    min-height: 44px;
    font-weight: 800;
    color: var(--ink);
    text-decoration: none;
  }
}
"""
p.write_text(s, encoding='utf-8')

for name in ('test_rediseno_css.mjs', 'test_rediseno_contrast.mjs', 'test_rediseno_assets.mjs', 'test_rediseno_ui.mjs'):
    p = Path('scripts/tests') / name
    s = p.read_text(encoding='utf-8')
    assert 'style-acta.css' in s, name
    p.write_text(s.replace('style-acta.css', 'acta.css'), encoding='utf-8')

p = Path('.github/workflows/tests.yml')
s = p.read_text(encoding='utf-8')
assert s.count("      - 'style.css'\n      - 'style-acta.css'\n") == 2
p.write_text(s.replace("      - 'style.css'\n      - 'style-acta.css'\n", "      - 'acta.css'\n"), encoding='utf-8')

p = Path('scripts/tests/test_workflows.py')
s = p.read_text(encoding='utf-8')
s = once(s, """        # Rediseño «Acta»: un PR que solo toque la hoja nueva debe correr
        # las pruebas de contraste y de CSS.
        assert "style-acta.css" in paths, f"{event} paths must include style-acta.css\"""", """        # Rediseño «Acta»: desde el corte de B2 la hoja es acta.css; un PR que
        # solo la toque debe correr las pruebas de contraste y de CSS.
        assert "acta.css" in paths, f"{event} paths must include acta.css\"""")
p.write_text(s, encoding='utf-8')
PY
```

**3c. Los módulos.**
- Se borran los nueve.
- `state.js` y `links.js` pierden el estado de interfaz, el HTML y el efecto al importarse (decisiones 1 y 2).
- `app.js` y `screen-home.js` son nuevos.

```bash
cd /home/manolo/claude/futbol-base
git rm -q src/render.js src/modals.js src/miequipo.js src/init.js src/favorites.js src/filters.js src/health.js src/plantilla.js src/matchdetail-rich.js
python3 - <<'PY'
from pathlib import Path


def between(src, start, end, new):
    """Sustituye desde `start` (incluido) hasta `end` (excluido); los dos, textos únicos."""
    assert src.count(start) == 1 and src.count(end) == 1, (start, end)
    i, j = src.index(start), src.index(end)
    assert i < j, (start, end)
    return src[:i] + new + src[j:]


def once(src, old, new):
    assert src.count(old) == 1, old
    return src.replace(old, new)


p = Path('src/state.js')
s = p.read_text(encoding='utf-8')

s = once(s, "import { PORTAL } from './config.js';\n", """// Carga de datos y funciones de dominio heredadas (spec §5.2). Desde el corte de B2 no guarda
// estado de interfaz (S y FEATURED), no pinta HTML y no toca el DOM al importarse: la URL es la
// fuente de verdad, myteam.js y store.js guardan mi equipo y ui.js pinta los escudos.
import { PORTAL } from './config.js';
""")

# S, FEATURED, las funciones featured*, $/$$/el y escapeHtml/escapeAttr: fuera. featuredScorersFrom
# se queda re-firmada como teamScorers(gol, team) (decisión 2).
s = between(s, '/* ====== APP STATE ====== */', '/* ====== JORNADA KEY HELPERS ======', """/* Goleadores de un equipo en su grupo, de GOL_BENJ o GOL_PREBENJ ([{ id, g, s: [[jugador,
 * equipo, goles, partidos]] }], lo que da model.scorers): [{ name, goals, games }], de más a menos
 * goles y, a igualdad, con menos partidos. `team` es { cat, groupId, name }, como myTeam; el
 * nombre se compara exacto, porque los de los goleadores son los de la clasificación. Antes
 * featuredScorersFrom, que leía FEATURED (decisión 2 de B2). */
export function teamScorers(gol, team) {
  if (!Array.isArray(gol) || !team) return [];
  // Los ficheros publicados llevan el código del grupo; los antiguos, una clave de texto.
  const grp = gol.find(g => g.id === team.groupId)
    || gol.find(g => team.cat === 'prebenjamin' && g.g === 'PREBENJAMIN GC GRUPO ' + String(team.groupId).replace(/^PG/, ''));
  if (!grp || !Array.isArray(grp.s)) return [];
  return grp.s
    .filter(s => s[1] === team.name)
    .map(s => ({ name: s[0], goals: s[2], games: s[3] }))
    .sort((a, b) => b.goals - a.goals || a.games - b.games);
}

""")

# El comentario de isCupGroup estaba encima de groupJornadaLabel; ACTIVATION_KEYS,
# makeActivatable y delegateActivation se van: todo lo pulsable es <a> o <button> (spec §5.1).
s = once(s, """/* A cup / knockout group (vs a regular league group). By code prefix
 * (PCC or BC) or phase ("Copa"/"Campeón"). */
/* Etiqueta del badge""", "/* Etiqueta del badge")
s = between(s, '/* Un <td> o un <div> con onclick no existe para el teclado', 'export function isCupGroup(g) {', """/* A cup / knockout group (vs a regular league group). By code prefix
 * (PCC or BC) or phase ("Copa"/"Campeón"). */
""")

# teamBadge y su respaldo de iniciales: los sustituyen shieldFile y crest/monogram de ui.js.
s = between(s, '/* Team badge — real shield from SHIELDS or fallback to initials */', '/* Shield-matching normalizer.', '')
s = between(s, 'let _shieldsNorm = null;', '// Globales inmediatos de los data-*.js', '')

# getTeamForm: la sustituye lastResults (model.js).
s = between(s, '/* Get last N results for a team from HISTORY */', '// Season data cache — loaded lazily per historical season.', '')
s = once(s, """// _seasonError[name] holds the last load failure message (cleared on
// success) so render.js can show an honest error + retry instead of
// silently mislabeling current-season data as historical.""", """// _seasonError[name] holds the last load failure message (cleared on
// success) so the screen can show an honest error + retry instead of
// silently mislabeling current-season data as historical.""")

# getData y withSeasonCup reciben temporada y categoría (decisión 2).
s = between(s, '// Synchronous — uses cached data for historical seasons', '// Async — call this before renderSection', """// Grupos de una temporada y categoría, con la Maspalomas Cup en 2025-26. Los de la temporada del
// portal (o season vacío) salen de los globales; los de una pasada, de lo que cargó
// ensureSeasonData, y [] mientras no esté cargada: nunca cae a los datos de la actual con la
// etiqueta de otra temporada.
export function getData(season, cat) {
  if (season && season !== PORTAL.season) {
    const data = _seasonCache[season];
    if (!data) return [];
    return withSeasonCup((cat === 'benjamin' ? data.benjamin : data.prebenjamin) || [], season, cat);
  }
  const cur = cat === 'benjamin'
    ? (typeof BENJAMIN !== 'undefined' ? BENJAMIN : null)
    : (typeof PREBENJAMIN !== 'undefined' ? PREBENJAMIN : null);
  return withSeasonCup(cur || [], PORTAL.season, cat);
}

// Añade la Maspalomas Cup de la categoría a los grupos de 2025-26: es de esa temporada también
// después de activar 2026/27.
export function withSeasonCup(groups, season, cat) {
  if (season === '2025-2026') {
    const cup = cat === 'benjamin'
      ? (typeof MASPALOMAS_CUP_BENJAMIN !== 'undefined' ? MASPALOMAS_CUP_BENJAMIN : null)
      : (typeof MASPALOMAS_CUP_PREBENJAMIN !== 'undefined' ? MASPALOMAS_CUP_PREBENJAMIN : null);
    if (cup && cup.length) groups = groups.concat(cup);
  }
  return groups;
}

""")
s = once(s, '// Async — call this before renderSection when switching historical seasons.', '// Async — call this before reading a historical season with getData or createModel.')

# getCurrentSeason e isHistorical desaparecen: su papel lo hace el parámetro (decisión 1).
s = between(s, 'export function getCurrentSeason() {', '/* Total matches across a set of groups.', """// Grupos por fase, ordenados por el número de su nombre (decisión 1: recibe los grupos).
export function getPhases(groups) {
  const map = {};
  (groups || []).forEach(g => {
    if (!map[g.phase]) map[g.phase] = [];
    map[g.phase].push(g);
  });
  Object.values(map).forEach(arr => arr.sort((a, b) => {
    const na = parseInt(a.name.replace(/\\D/g, '')) || 0;
    const nb = parseInt(b.name.replace(/\\D/g, '')) || 0;
    return na - nb;
  }));
  return map;
}

""")

# countStats recibe temporada y categoría; la tabla unificada y la sparkline (HTML) se van.
s = between(s, 'export function countStats() {', 'export { S };', """// Grupos, equipos y partidos de una temporada y categoría (decisión 1: recibe las dos).
export function countStats(season, cat) {
  const data = getData(season, cat);
  const historical = !!season && season !== PORTAL.season;
  const hist = (!historical && typeof HISTORY !== 'undefined') ? HISTORY : null;
  return {
    groups: data.length,
    teams: data.reduce((n, g) => n + (g.standings || []).length, 0),
    matches: countMatches(data, hist),
  };
}
""")
s = once(s, 'export { S };', '')
s = once(s, """ * longer an eager <script> (it is ~359 KB); fetch+parse it on demand the
 * first time a match modal needs it. Single-flight + module cache. Mirrors
 * loadAllHistoricalSeasons() in modals.js. ?v= is dataVersion() (the one of
 * data-seasons.js), like every lazy loader.""", """ * longer an eager <script> (it is ~359 KB); fetch+parse it on demand the
 * first time the match screen needs it. Single-flight + module cache.
 * ?v= is dataVersion() (the one of data-seasons.js), like every lazy loader.""")
s = s.rstrip('\n') + '\n'
p.write_text(s, encoding='utf-8')

p = Path('src/links.js')
s = p.read_text(encoding='utf-8')
s = once(s, """import { S, FEATURED, getCurrentSeason } from './state.js';
import { PORTAL } from './config.js';

export const SECTIONS = ['miequipo', 'clasif', 'jornadas', 'goleadores', 'isla', 'stats'];
let readingRoute = false;
export function setReadingRoute(value) { readingRoute = value; }

export function readRoute(hash = '') {""", """// Rutas, enlaces antiguos, fechas, calendario (.ics), mapas y compartir (spec §5.2). Desde el
// corte de B2 no lee estado de interfaz: las rutas nuevas son routeHref y parseRoute, y los
// enlaces antiguos (#section=…) solo se leen, para traducirlos (translateLegacy).
import { PORTAL } from './config.js';

export const SECTIONS = ['miequipo', 'clasif', 'jornadas', 'goleadores', 'isla', 'stats'];

// Lee un enlace antiguo ('#section=…&group=…'), compartido por WhatsApp antes del rediseño.
export function readRoute(hash = '') {""")
s = between(s, 'export function routeUrl(overrides = {}, base', 'export function venueUrl(venue, island', '')
# notify y copyLink pintaban en el #toast del diseño viejo: compartir llega en la Tarea 7 (shareLink).
s = between(s, 'export function notify(message) {', '// Resolve a date against its SEASON', '')
p.write_text(s, encoding='utf-8')
PY
```

`ui.js` gana la cabecera de pantalla (`screenHead`, con «‹», escudo, título, etiqueta y acción), la primera pieza compartida que necesita la portada, y `model.js`, `seasonLabel`. Las demás pantallas los importan de aquí.

En `src/ui.js`, sustituir:

```js
import { html } from './html.js';
```

por:

```js
import { html, Html } from './html.js';
```

Añadir al final de `src/ui.js`:

```js
// ── Cabecera de pantalla ────────────────────────────────────────────────

// «‹» (volver): el router lo atiende con history.back() si la entrada anterior es de la app y,
// si no, sigue el enlace al padre (spec §4.1).
export function backLink(href) {
  return html`<a class="back" href="${href}" data-action="back" aria-label="Volver">‹</a>`;
}

// Maquetas 4, 5-1, 5-2 y 5-3: el único h1 de la pantalla con su etiqueta debajo, «‹» y escudo
// opcionales a la izquierda y una acción a la derecha («Cambiar», «Otro grupo», «Compartir»).
// title: texto o Html; action: { href, label } para un enlace, o un Html ya hecho (un botón);
// crest: Html de crest(); back: href del padre.
export function screenHead(title, { sub = null, action = null, crest: badge = null, back = null } = {}) {
  const act = action == null ? ''
    : action instanceof Html ? action
      : html`<a class="screen-action" href="${action.href}">${action.label}</a>`;
  return html`<header class="screen-head">${back ? backLink(back) : ''}${badge || ''}<div class="screen-head-text"><h1>${title}</h1>${sub ? html`<p class="screen-sub">${sub}</p>` : ''}</div>${act}</header>`;
}
```

Añadir al final de `src/model.js`:

```js
// «2025-2026» → «2025/26», la forma de las temporadas en pantalla; lo demás, tal cual.
export function seasonLabel(season) {
  return String(season ?? '').replace(/^(\d{4})-\d{2}(\d{2})$/, '$1/$2');
}
```

Crear `src/screen-home.js`:

```js
// Mi equipo, la portada (spec §4.2). render(ctx) es puro: homeState decide el estado (E, X, D, B,
// C o A) y cada estado pinta sus bloques bajo la cabecera de pantalla común (screenHead, ui.js).
// Desde el corte: la cabecera y el primer bloque de cada estado; las Tareas 7 y 8 completan la
// pantalla con las mismas piezas.
import { html } from './html.js';
import { box, cells, crest, empty, matchRow, screenHead } from './ui.js';
import { homeState } from './myteam.js';
import { retiredTeams, seasonLabel, seasonSummary, teamFixtures } from './model.js';
import { countdownLabel, routeHref } from './links.js';

// «Cambiar», «Ninguno» y «Elegir equipo» abren Explorar con el buscador enfocado: el ancla #buscar
// va tras la ruta, como #calendario en la ficha de equipo (B3).
const SEARCH = `${routeHref('explorar')}#buscar`;

// Ficha de un partido: su identidad (s, g, r, h, a) de §5.3, con la temporada siempre escrita
// para que un enlace compartido no cambie de partido al activarse la temporada siguiente.
const partidoHref = (match) => routeHref('partido', { s: match.season, g: match.groupId, r: match.roundKey, h: match.home, a: match.away });

// Escudo, nombre (el único h1), la etiqueta debajo y «Cambiar» (§4.2 A); en E y X, sin «Cambiar»:
// la caja ya ofrece buscar otro equipo.
function header(name, sub, { shields, change = true }) {
  return screenHead(name, {
    sub, crest: crest(name, { size: 46, shields, lazy: false }),
    action: change ? { href: SEARCH, label: 'Cambiar' } : null,
  });
}

// A y B: el próximo partido de mi equipo, con la cuenta atrás en Canarias como contexto.
function nextMatch(ctx, own) {
  const { next } = own.fixtures;
  return box(matchRow(next, { today: ctx.today, shields: own.shields, href: partidoHref(next) }),
    { title: 'Próximo partido', context: countdownLabel(next.dateISO, ctx.today) });
}

// Sin nada jugado, un único vacío (spec §4.2 B). Sus dos causas (M2 de B1): el grupo no ha
// empezado, o sí, pero mi equipo no ha jugado (un retirado, como CD Batán en PG2): en ese caso
// nunca se dice que no se ha jugado ninguna jornada.
function notPlayedText(group, name) {
  const started = group.rounds.some((round) => round.matches.some((m) => m.hs != null && m.as != null));
  if (!started) return 'Aún no se ha jugado ninguna jornada';
  if (retiredTeams(group).has(name)) return `${name} figura como retirado en este grupo`;
  return `${name} todavía no ha jugado ningún partido en este grupo`;
}

const BLOCKS = {
  A: nextMatch,
  B(ctx, own) {
    return html`${own.fixtures.next ? nextMatch(ctx, own) : ''}<section class="block">${empty(notPlayedText(own.group, own.name))}</section>`;
  },
  // C: sin próximo partido publicado, el último resultado (abre la ficha).
  C(ctx, own) {
    const { last } = own.fixtures;
    return box(matchRow(last, { today: ctx.today, shields: own.shields, href: partidoHref(last) }), { title: 'Último partido' });
  },
  // D: temporada terminada; «Así terminó» con la posición, los puntos y el balance.
  D(ctx, own) {
    const s = seasonSummary(own.name, own.group);
    return box(cells([
      { label: 'Posición', value: s.pos == null ? '—' : `${s.pos}.º de ${s.of}` },
      { label: 'Puntos', value: s.pts ?? '—' },
      { label: 'Balance', value: s.g == null ? '—' : `${s.g}G ${s.e}E ${s.p}P` },
    ]), { title: `Así terminó ${seasonLabel(own.group.season)}` });
  },
  // E: hay que preguntar (§6.3). La respuesta la guarda mount (Tarea 7).
  E(ctx, own) {
    const choices = (ctx.resolution.candidates || []).map((c, i) => html`<li><button type="button" class="choice" data-action="elegir" data-index="${i}">${crest(c.name, { size: 32, shields: own.shields })}<span class="choice-text"><span class="choice-name">${c.name}</span><span class="choice-label">${c.group.label}</span></span></button></li>`);
    return box(html`<ul class="choices">${choices}<li><a class="choice choice-none" href="${SEARCH}">Ninguno: buscar otro equipo</a></li></ul>`,
      { title: '¿En qué equipo juega ahora?' });
  },
  // X: mi equipo no está en la temporada del portal.
  X(ctx, own) {
    return html`<section class="block">${empty(`${own.name} no aparece en ${seasonLabel(ctx.portal.season)}`)}<div class="buttons home-cta"><a class="button is-main" href="${SEARCH}">Elegir equipo</a></div></section>`;
  },
};

export const screen = {
  id: 'home',
  needs() { return []; },
  render(ctx) {
    const { resolution } = ctx;
    const state = homeState({ resolution, todayISO: ctx.today, portalSeason: ctx.portal.season });
    const ok = resolution && resolution.status === 'ok';
    const name = ok ? resolution.name : ((ctx.myTeam && ctx.myTeam.name) || ctx.portal.defaultTeam.name);
    const group = ok ? resolution.group : null;
    const shields = (ctx.datasets && ctx.datasets.shields) || {};
    const own = { name, group, shields, fixtures: ok ? teamFixtures(name, group, ctx.today) : null };
    const sub = group ? group.label : `Temporada ${seasonLabel(ctx.portal.season)}`;
    return html`<section data-screen="home" data-state="${state}">${header(name, sub, { shields, change: ok })}${BLOCKS[state](ctx, own)}</section>`;
  },
};
```

Reescribir `src/app.js` con este contenido:

```js
// Arranque del rediseño (spec §5.2): almacén, registro de datos, modelo y primera pantalla.
// index.html llama a start(document, window) cuando ya han llegado los datos inmediatos: importar
// este módulo no toca el navegador (test_rediseno_modulos). Desde el corte pinta la portada sin
// router; en la Tarea 6, startRouter ocupa el lugar de paintHome.
import { PORTAL } from './config.js';
import { html } from './html.js';
import { readGlobals } from './state.js';
import { createModel } from './model.js';
import { buildClubIndex, resolveMyTeam } from './myteam.js';
import { loadStore } from './store.js';
import { canaryTodayISO } from './links.js';
import { crestFallback } from './ui.js';
import { screen as home } from './screen-home.js';

// El contexto común de las pantallas (esqueleto, sin la ruta): mi equipo del almacén, resuelto
// contra la temporada del portal con el «hoy» de Canarias. Con el almacén vacío o bloqueado,
// loadStore da el equipo por defecto, sin preguntas. buildClubIndex se inyecta en createModel.
export function startContext({ storage, portal, datasets, today }) {
  const store = loadStore(storage, { defaultTeam: portal.defaultTeam, portalSeason: portal.season });
  const model = createModel(datasets, { portalSeason: portal.season, buildClubIndex });
  const resolution = resolveMyTeam(store.myTeam, model.season(portal.season), model.clubIndex(), today);
  return {
    model, myTeam: store.myTeam, resolution, today, health: datasets.health, datasets,
    portal: { season: portal.season, defaultTeam: portal.defaultTeam }, lastPrimary: 'miequipo',
  };
}

function paintHome(root, win) {
  const datasets = { ...readGlobals(), seasonRaw: {}, matchDetail: null, lineups: {}, health: null };
  const base = startContext({ storage: () => win.localStorage, portal: PORTAL, datasets, today: canaryTodayISO(new Date(), PORTAL.timeZone) });
  const route = { screen: '', params: {} };
  root.innerHTML = String(home.render({ ...base, route, params: route.params }));
}

// Arranca la app en el documento que recibe: escucha los errores de escudo y pinta la portada en
// #contenido; si algo lanza, la caja de error con «Reintentar», que recarga.
export function start(doc, win) {
  // escudos/s/ no existe hasta B4: miniatura → original → monograma («Para B2», Escudos).
  doc.addEventListener('error', (event) => crestFallback(event.target), true);
  const root = doc.getElementById('contenido');
  try {
    paintHome(root, win);
  } catch (error) {
    console.error('[app] no se pudo pintar la portada:', error);
    root.innerHTML = String(html`<div class="box" role="alert"><p class="notice"><b>No se pudieron cargar los datos de la portada.</b></p><div class="buttons"><button type="button" class="button is-main" data-action="retry">Reintentar</button></div></div>`);
    root.querySelector('[data-action="retry"]').addEventListener('click', () => win.location.reload());
  }
}
```

**3d. `sw.js`.** `STATIC_ASSETS` pasa al grafo nuevo, con la fuente y los iconos (spec §5.5). `CACHE_NAME` no se toca (decisión 7):

```bash
cd /home/manolo/claude/futbol-base
python3 - <<'PY'
from pathlib import Path


def between(src, start, end, new):
    assert src.count(start) == 1 and src.count(end) == 1, (start, end)
    i, j = src.index(start), src.index(end)
    assert i < j, (start, end)
    return src[:i] + new + src[j:]


def once(src, old, new):
    assert src.count(old) == 1, old
    return src.replace(old, new)


p = Path('sw.js')
s = p.read_text(encoding='utf-8')
s = between(s, '// Static assets — cached on install, served cache-first.', '// Season data files', """// Static assets — cached on install (spec §5.5): the page, the stylesheet, the
// manifest, the self-hosted font, the PWA icons, the FULL static import graph
// of src/app.js (test_sw_fixes.mjs compares it with the real graph) and the
// eager data-*.js that index.html loads.
const STATIC_ASSETS = [
  './',
  './index.html',
  './acta.css',
  './manifest.json',
  './data-health.json',
  './fonts/PublicSans-latin.woff2',
  './icons/icon-180.png',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-maskable-512.png',
  './src/app.js',
  './src/config.js',
  './src/html.js',
  './src/links.js',
  './src/model.js',
  './src/myteam.js',
  './src/screen-home.js',
  './src/state.js',
  './src/store.js',
  './src/ui.js',
  './data-benjamin.js',
  './data-prebenjamin.js',
  './data-history.js',
  './data-goleadores.js',
  './data-matchdetail-keys.js',
  './data-shields.js',
  './data-stats.js',
  './data-seasons.js',
  './data-maspalomas-cup-2026.js',
];

""")
p.write_text(s, encoding='utf-8')
PY
```

**3e. Las pruebas del diseño anterior.** Se borran las que solo prueban la app vieja y se dividen las mixtas (tabla de arriba). El script quita cada `test('…')` por su título exacto y se para si alguno no está:

```bash
cd /home/manolo/claude/futbol-base
git rm -q scripts/tests/test_team_modal_fix.mjs scripts/tests/test_uxui2_fixes.mjs scripts/tests/test_uxui_fixes.mjs scripts/tests/test_sp2_modules.mjs scripts/tests/test_femodals_fixes.mjs scripts/tests/test_rediseno_b1_contract.mjs
python3 - <<'PY'
from pathlib import Path


def once(src, old, new=''):
    assert src.count(old) == 1, old
    return src.replace(old, new)


def drop_test(src, title):
    """Quita test('<title>', …) hasta su «});» de la columna 0, con la línea en blanco que le sigue."""
    start = f"test('{title}'"
    assert src.count(start) == 1, title
    i = src.index(start)
    j = src.index('\n});\n', i) + len('\n});\n')
    if src[j:j + 1] == '\n':
        j += 1
    return src[:i] + src[j:]


# ── test_review0615_frontend.mjs: fuera las pruebas que leen render.js o modals.js ──
p = Path('scripts/tests/test_review0615_frontend.mjs')
s = p.read_text(encoding='utf-8')
for title in [
    'renderJornadas valida jorGroup con validJorGroup (no solo si falsy)',
    'renderJornadaContent emite empty-state si el grupo no existe (no return mudo)',
    'buildKnockoutBracket usa knockoutRoundsSource (cups actuales renderizan)',
    'buildKnockoutBracket usa knockoutRoundLabel',
    'buildKnockoutBracket marca el avance por penaltis (matchAdvancer + pen)',
    'buildUnifiedPrebenjamin filtra cups (usa unifiedPrebenLeagueGroups)',
    'buildKnockoutBracket renderiza tabla para cups round-robin',
    'la cabecera de grupo usa groupJornadaLabel, no el valor crudo',
    'renderSection confiesa el fallo de temporada en TODAS las secciones',
    'POR ISLA abre la ficha de equipo: los nombres no son decorativos',
    'el modal busca el grupo en las dos categorías',
]:
    s = drop_test(s, title)
p.write_text(s.rstrip('\n') + '\n', encoding='utf-8')

# ── test_festate_fixes.mjs: fuera render.js, teamBadge, escapeHtml y getTeamForm; getData(season, cat) ──
p = Path('scripts/tests/test_festate_fixes.mjs')
s = p.read_text(encoding='utf-8')
s = once(s, """ * Covers:
 *   1. normalizeTeamName broken punctuation regex (state.js) + shields no-regression
 *   2. C1: normalizeForTeamsMapping conserves trailing filial letter (a/b/c/d)
 *   3. C2: escapeHtml/escapeAttr exported from state.js, used by render.js
 *   4. teamBadge onerror fallback via delegation (no inline module-scope ref)
 *   5. 'JNaN' jornada pills: jornadaNumber/jornadaLabel/sortJornadaKeys
 *   6. typeof guards for BENJAMIN/PREBENJAMIN/GOL_*
 *   7. getTeamForm jornada-key parsing ('Jornada N' keys)
 *   8. lazy loaders: failures not cached for the session, honest season error
 */""", """ * Covers:
 *   1. normalizeTeamName broken punctuation regex (state.js) + shields no-regression
 *   2. C1: normalizeForTeamsMapping conserves trailing filial letter (a/b/c/d)
 *   5. 'JNaN' jornada pills: jornadaNumber/jornadaLabel/sortJornadaKeys
 *   6. typeof guards for BENJAMIN/PREBENJAMIN; getData(season, cat)
 *   8. lazy loaders: failures not cached for the session, honest season error
 * (3, 4 and 7 — escapeHtml, teamBadge and getTeamForm — left with the B2 cut:
 * html.js, ui.js and model.js cover them in the test_rediseno_*.mjs suites.)
 */""")
s = once(s, """/* ── browser-global stubs (must exist BEFORE importing src/state.js) ──
 * Data globals are set as globalThis properties: properties of the global
 * object ARE visible as bare identifiers (the reverse of the lexical-const
 * gotcha), so `typeof SHIELDS !== 'undefined'` guards see them. */""", """/* ── browser-global stubs (must exist BEFORE importing src/state.js) ──
 * Data globals are set as globalThis properties: properties of the global
 * object ARE visible as bare identifiers (the reverse of the lexical-const
 * gotcha), so `typeof BENJAMIN !== 'undefined'` guards see them. */""")
s = once(s, """const docListeners = [];
globalThis.document = {
  querySelector: () => null,
  querySelectorAll: () => [],
  addEventListener: (type, fn, capture) => docListeners.push({ type, fn, capture }),
};

const NAME_QUOTES = 'ATLETICO HURACAN, A.D. "A"';   // real 2024-25 FIFLP name
const NAME_INJECT = '<img src=x onerror=evil()>';
globalThis.SHIELDS = {
  'Las Palmas': 'laspalmas.png',
  [NAME_QUOTES]: 'huracan.png',
  [NAME_INJECT]: 'evil.png',
};
globalThis.HISTORY = {
  G1: {
    // Insertion order J2-then-J1, and J1 played LATER than J2 (postponed
    // match) so a date-based ordering is distinguishable from jornada order.
    'Jornada 2': [['2026-01-10', 'Equipo X', 'Rival B', 1, 0]],
    'Jornada 1': [['2026-01-17', 'Equipo X', 'Rival C', 0, 2]],
  },
};

const state = await import('../../src/state.js');
const renderSrc = readFileSync(join(ROOT, 'src', 'render.js'), 'utf8');
const stateSrc = readFileSync(join(ROOT, 'src', 'state.js'), 'utf8');""", """// No <script> of data-seasons.js: the lazy loaders request without ?v=.
globalThis.document = {
  querySelector: () => null,
  querySelectorAll: () => [],
};

const NAME_QUOTES = 'ATLETICO HURACAN, A.D. "A"';   // real 2024-25 FIFLP name

const state = await import('../../src/state.js');
const stateSrc = readFileSync(join(ROOT, 'src', 'state.js'), 'utf8');""")
for title in [
    'C2: state.js exports escapeHtml and escapeAttr',
    'C2: render.js imports the shared escapers and drops its duplicate',
    'C2: render.js no longer interpolates scraped strings raw into innerHTML',
    'C2: teamBadge escapes the alt attribute (real 2024-25 quoted name)',
    'C2: teamBadge neutralizes an injection-shaped team name',
    'teamBadge HTML has no inline onerror (was a ReferenceError to a module fn)',
    'handleBadgeError swaps a broken badge <img> for the initials fallback',
    'state.js installs capture-phase error delegation on the document',
    'render.js uses jornadaLabel and no longer maps jornada keys through Number',
    'render.js guards GOL_BENJ/GOL_PREBENJ with the typeof pattern',
    'getTeamForm orders by jornada number, not by NaN/date accident',
    'render.js renders an honest season-error state with retry',
]:
    s = drop_test(s, title)
s = once(s, "/* ════ 3. C2: escapeHtml / escapeAttr ════ */\n\n")
s = once(s, "/* ════ 4. teamBadge fallback without module-scope onerror reference ════ */\n\n")
s = once(s, "/* ════ 7. getTeamForm with 'Jornada N' keys ════ */\n\n")
s = once(s, """  assert.equal(typeof globalThis.BENJAMIN, 'undefined', 'precondition');
  state.S.season = '';
  state.S.cat = 'benjamin';
  assert.deepEqual(state.getData(), [], 'no ReferenceError, empty fallback');
  state.S.cat = 'prebenjamin';
  assert.deepEqual(state.getData(), []);
  state.S.cat = 'benjamin';
});""", """  assert.equal(typeof globalThis.BENJAMIN, 'undefined', 'precondition');
  assert.deepEqual(state.getData('', 'benjamin'), [], 'no ReferenceError, empty fallback');
  assert.deepEqual(state.getData('', 'prebenjamin'), []);
});""")
s = once(s, """  await state.ensureSeasonData('2098-2099');
  state.S.season = '2098-2099';
  state.S.cat = 'benjamin';
  assert.deepEqual(state.getData(), [],""", """  await state.ensureSeasonData('2098-2099');
  assert.deepEqual(state.getData('2098-2099', 'benjamin'), [],""")
s = once(s, """  const data = state.getData();
  assert.equal(data.length, 1);
  assert.equal(data[0].id, 'H1', 'retry loads the real historical groups');

  state.S.season = '';
  delete globalThis.BENJAMIN;""", """  const data = state.getData('2098-2099', 'benjamin');
  assert.equal(data.length, 1);
  assert.equal(data[0].id, 'H1', 'retry loads the real historical groups');
  assert.equal(state.getData('', 'benjamin')[0].id, 'CUR', 'the current season still reads BENJAMIN');

  delete globalThis.BENJAMIN;""")
assert 'renderSrc' not in s and 'state.S.' not in s and 'state.teamBadge' not in s
p.write_text(s.rstrip('\n') + '\n', encoding='utf-8')

# ── test_js_modules.mjs: fuera FEATURED, los ficheros borrados y el checkRenderedDom viejo ──
p = Path('scripts/tests/test_js_modules.mjs')
s = p.read_text(encoding='utf-8')
s = once(s, "import { isFeatured, FEATURED } from '../../src/state.js';\n")
for title in [
    'FEATURED points at Las Mesas Hu. Prebenjamin PG2',
    'isFeatured matches the team and variants, not B teams',
    'featuredStandingFrom finds Las Mesas in PREBENJAMIN PG2',
    'featuredStandingFrom returns null when team absent',
    'featuredMatchesFrom builds a sorted played/upcoming list',
    'featuredMatchesFrom on empty/missing history -> []',
    'featuredScorersFrom returns Las Mesas players sorted by goals',
    'featuredScorersFrom handles missing group -> []',
    'the dashboard and its data accessor use guarded lexical data bindings',
    'badge consumers use MATCH_DETAIL_KEYS, not full MATCH_DETAIL',
    'checkRenderedDom: healthy MI EQUIPO render passes',
    'checkRenderedDom: globalThis-class empty-state fails',
    'checkRenderedDom: empty #sec-miequipo (JS threw) fails',
]:
    s = drop_test(s, title)
s = once(s, "// FEATURED / isFeatured\n")
s = once(s, """// featured data extraction
import {
  featuredStandingFrom, featuredMatchesFrom, featuredScorersFrom,
} from '../../src/state.js';

""")
s = once(s, """// regression: miequipo.js must read data globals as bare identifiers
// (typeof-guarded), NOT via globalThis/window — top-level `const` in the
// classic data-*.js scripts is a global LEXICAL binding, not a property of
// globalThis. See systematic-debugging root cause 2026-05-18.
""")
s = once(s, "// badge must use the lightweight keys map, never the full object\n")
i = s.index('// render smoke: pure DOM checker (deterministic, no browser)')
j = s.index("test('state.js exports ensureLineups, ensurePlayers, getCurrentSeason (SP-2)'")
s = s[:i] + s[j:]
s = once(s, """test('state.js exports ensureLineups, ensurePlayers, getCurrentSeason (SP-2)', () => {
  const src = readFileSync(join(ROOT, 'src', 'state.js'), 'utf8');
  assert.ok(/export\\s+async\\s+function\\s+ensureLineups\\b/.test(src),
    'state.js must export ensureLineups');
  assert.ok(/export\\s+async\\s+function\\s+ensurePlayers\\b/.test(src),
    'state.js must export ensurePlayers');
  assert.ok(/export\\s+function\\s+getCurrentSeason\\b/.test(src),
    'state.js must export getCurrentSeason');""", """test('state.js exports ensureLineups and ensurePlayers (SP-2)', () => {
  const src = readFileSync(join(ROOT, 'src', 'state.js'), 'utf8');
  assert.ok(/export\\s+async\\s+function\\s+ensureLineups\\b/.test(src),
    'state.js must export ensureLineups');
  assert.ok(/export\\s+async\\s+function\\s+ensurePlayers\\b/.test(src),
    'state.js must export ensurePlayers');""")
s = once(s, """  const files = ['app.js','init.js','state.js','modals.js','miequipo.js','render.js','plantilla.js','matchdetail-rich.js'];
  for (const f of files) {
    let s;
    try { s = readFileSync(join(ROOT, 'src', f), 'utf8'); }
    catch { continue; }""", """  const files = readdirSync(join(ROOT, 'src')).filter(f => f.endsWith('.js'));
  assert.ok(files.includes('state.js') && files.includes('app.js'));
  for (const f of files) {
    const s = readFileSync(join(ROOT, 'src', f), 'utf8');""")
assert 'FEATURED' not in s and 'miequipo' not in s and 'checkRenderedDom' not in s
p.write_text(s.rstrip('\n') + '\n', encoding='utf-8')

# ── test_portal_features.mjs: routeUrl, matchId y filters.js se fueron ──
p = Path('scripts/tests/test_portal_features.mjs')
s = p.read_text(encoding='utf-8')
s = once(s, """import { fixtureISO, kickoffUTC, buildCalendar, routeUrl, readRoute, matchId, venueUrl } from '../../src/links.js';
import { filterCompetitionGroups } from '../../src/filters.js';""", """import { fixtureISO, kickoffUTC, buildCalendar, readRoute, venueUrl } from '../../src/links.js';""")
s = drop_test(s, 'shared URLs round-trip accents and punctuation without losing the archive')
s = drop_test(s, 'filters combine club names, islands and phases, and handle empty groups')
s = once(s, "test('maps links only exist for a known venue", """test('los enlaces antiguos se leen sin perder el archivo y descartan temporadas mal formadas', () => {
  // Ya nadie los escribe (routeUrl se fue con el corte): solo se leen para traducirlos.
  const match = JSON.stringify(['Unión & Sur', 'Equipo #1', 'Jornada 12']);
  const parsed = readRoute('#' + new URLSearchParams({ section: 'jornadas', cat: 'prebenjamin', season: '2021-2022',
    group: 'PG2', round: 'Jornada 12', match, q: 'Unión & Sur' }).toString());
  assert.equal(parsed.season, '2021-2022');
  assert.equal(parsed.round, 'Jornada 12');
  assert.equal(parsed.search, 'Unión & Sur');
  assert.equal(parsed.match, match);
  assert.equal(readRoute('#section=unknown&season=../../bad').season, '');
});

test('maps links only exist for a known venue""")
p.write_text(s.rstrip('\n') + '\n', encoding='utf-8')
PY
```

**3f. Los tres smoke, en mínimos.**
- `render-smoke` usa el `checkRenderedDom` de §11.
- `pwa-smoke` se reescribe: el paso desde la app anterior, con su SW de verdad y datos congelados, el aviso del arranque sin conexión a medias y la portada sin conexión.
- `interaction-smoke` se reescribe: la portada a 320, 390, 768 y 1440 px, en claro y oscuro.

```bash
cd /home/manolo/claude/futbol-base
python3 - <<'PY'
from pathlib import Path


def between(src, start, end, new):
    assert src.count(start) == 1 and src.count(end) == 1, (start, end)
    i, j = src.index(start), src.index(end)
    assert i < j, (start, end)
    return src[:i] + new + src[j:]


def once(src, old, new):
    assert src.count(old) == 1, old
    return src.replace(old, new)


p = Path('scripts/tests/render-smoke.mjs')
s = p.read_text(encoding='utf-8')
s = between(s, '/**\n * Render smoke test for the futbol-base SPA.', 'const ROOT = join(', r"""/**
 * Render smoke test for the futbol-base SPA (rediseño «Acta», spec §11).
 *
 * `checkRenderedDom(dom, { teamName })` is a pure assertion over the serialized DOM of index.html
 * AFTER its JS ran. Its markers do not depend on the moment of the season, so it does not turn
 * red when a season ends or starts: the home screen (<section data-screen="home">) must be in
 * state A, B, C or D, with its screen header (header.screen-head), one h1 with the team name and
 * at least one block. E (asking which team), X (team absent), the error box («Reintentar») and
 * the skeleton of index.html left untouched (app.js threw) fail. Unit-tested in
 * test_rediseno_smoke.mjs with the real screen over frozen fixtures.
 *
 * Run directly (`node scripts/tests/render-smoke.mjs`) to exercise the real
 * browser harness; in CI it gates. Zero npm deps (node:* only).
 */

const ENTITIES = { '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&#39;': "'" };
const decode = (text) => text.replace(/<[^>]*>/g, '').replace(/&(amp|lt|gt|quot|#39);/g, (e) => ENTITIES[e]).trim();

export function checkRenderedDom(dom, { teamName } = {}) {
  const failures = [];
  const section = dom.match(/<section\b[^>]*\bdata-screen="home"[^>]*>/);
  const state = section ? ((section[0].match(/\bdata-state="([A-Z])"/) || [])[1] || null) : null;
  if (!section) failures.push('falta la portada: no hay <section data-screen="home">');
  else if (!state) failures.push('la portada no marca su estado (data-state)');
  else if (state === 'E') failures.push('estado E: la portada pregunta por el equipo en vez de enseñarlo');
  else if (state === 'X') failures.push('estado X: el equipo no aparece en la temporada del portal');
  else if (!'ABCD'.includes(state)) failures.push(`estado desconocido: ${state}`);
  if (section) {
    if (!/<header class="screen-head">/.test(dom)) failures.push('falta la cabecera de Mi equipo (header.screen-head)');
    const h1 = [...dom.matchAll(/<h1\b[^>]*>([\s\S]*?)<\/h1>/g)].map((m) => decode(m[1]));
    if (h1.length !== 1) failures.push(`la portada tiene ${h1.length} h1, y debe tener uno`);
    else if (teamName && !h1[0].includes(teamName)) failures.push(`el h1 dice «${h1[0]}», no «${teamName}»`);
    if (!/<section class="block">/.test(dom)) failures.push('la portada no tiene ningún bloque');
  }
  if (/data-action="retry"/.test(dom)) failures.push('caja de error con «Reintentar»: la portada no pudo cargar sus datos');
  if (/class="box skeleton[" ]|data-skeleton="/.test(dom)) failures.push('el esqueleto de index.html sigue ahí: app.js no pintó la portada');
  return { ok: failures.length === 0, failures, state };
}

""")
s = once(s, "  '.png': 'image/png', '.ico': 'image/x-icon',\n", "  '.png': 'image/png', '.ico': 'image/x-icon', '.woff2': 'font/woff2',\n")
s = once(s, """    const { ok, failures } = checkRenderedDom(dom);
    if (ok) {
      console.log(`PASS: render smoke OK — MI EQUIPO rendered (DOM ${dom.length} bytes)`);""", """    // Con el almacén vacío, la portada es la del equipo por defecto (spec §4.2).
    const { PORTAL } = await import(pathToFileURL(join(ROOT, 'src', 'config.js')).href);
    const { ok, failures, state } = checkRenderedDom(dom, { teamName: PORTAL.defaultTeam.name });
    if (ok) {
      console.log(`PASS: render smoke OK — Mi equipo en estado ${state} (DOM ${dom.length} bytes)`);""")
p.write_text(s, encoding='utf-8')
PY
```

`pwa-smoke` prueba el paso desde la app anterior con su service worker de verdad. Su versión anterior es una copia de la app de `main` 31a15b8 (`index.html`, `sw.js`, `style.css`, `manifest.json`, `icons.svg` y los 13 módulos que precachea). Las dos versiones reciben los mismos datos y el mismo `src/config.js`, congelados: las fixtures de B1 del día de los datos de hoy y el `config.js` de la copia, nunca los `data-*.js` vivos, que cambian con el bot y al activar 2026/27 (decisión 130):

```bash
cd /home/manolo/claude/futbol-base
mkdir -p scripts/tests/fixtures/app-anterior
git archive 31a15b8 index.html sw.js style.css manifest.json icons.svg src/app.js src/config.js src/links.js src/favorites.js src/health.js src/filters.js src/init.js src/state.js src/render.js src/modals.js src/miequipo.js src/plantilla.js src/matchdetail-rich.js | tar -x -C scripts/tests/fixtures/app-anterior
cd scripts/tests/fixtures/app-anterior && find . -type f | sort | paste -sd ' '
```
Esperado:
```text
./icons.svg ./index.html ./manifest.json ./src/app.js ./src/config.js ./src/favorites.js ./src/filters.js ./src/health.js ./src/init.js ./src/links.js ./src/matchdetail-rich.js ./src/miequipo.js ./src/modals.js ./src/plantilla.js ./src/render.js ./src/state.js ./style.css ./sw.js
```

Reescribir `scripts/tests/pwa-smoke.mjs` con este contenido:

```js
// PWA smoke (spec §5.5 y §11): el paso de la app anterior al rediseño, con el service worker de verdad.
// La versión anterior es la app de main 31a15b8 con su sw.js (scripts/tests/fixtures/app-anterior);
// después se publica el árbol de trabajo con las marcas de versión subidas, como el despliegue de B4 y
// B5. Las dos versiones reciben los mismos datos y el mismo src/config.js, congelados: los de las
// fixtures de B1 (23/09/2026), nunca los data-*.js vivos, que cambian con el bot y al activar 2026/27.
// El SW anterior sirve los .js de src/ con stale-while-revalidate y los .css con cache-first, los dos
// ignorando la ?v= (A1 de la revisión):
//  - la hoja nueva va en otra URL, acta.css, que su caché no tiene;
//  - index.html quita de su caché app.js, state.js y links.js antes de importar app.js.
// Mientras el SW nuevo se instala (su precache queda retenido), cada apertura tiene que ser entera de
// una versión: la 1.ª, la anterior; la 2.ª y la 3.ª, la nueva (documento, hoja y módulos), también si
// en la 1.ª falló la actualización en segundo plano de app.js y state.js. Sin conexión entre la 1.ª y
// la 2.ª, el index.html nuevo no encuentra ni la hoja ni los módulos: el aviso con «Reintentar», que
// con conexión abre la app nueva. Con el SW nuevo activo, la app nueva funciona sin conexión.
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { startServer, findChrome } from './render-smoke.mjs';
import { waitForAsync } from './browser-wait.mjs';
import { fixture } from './fixtures/rediseno/load.mjs';

const { chromium } = createRequire(import.meta.url)('playwright');
const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const PREVIOUS = join(ROOT, 'scripts', 'tests', 'fixtures', 'app-anterior');
// La portada del rediseño, en cualquier estado (spec §11), y la de la app anterior.
const HOME = 'section[data-screen="home"][data-state]';
const OLD_HOME = '.me-hero';
const read = (dir, file) => {
  const path = join(dir, file);
  return existsSync(path) && statSync(path).isFile() ? readFileSync(path, 'utf8') : null;
};
const versionOf = (sw) => sw.match(/CACHE_NAME = 'futbolbase-v([^']+)'/)[1];
const OLD_VERSION = versionOf(read(PREVIOUS, 'sw.js'));
const TREE_VERSION = versionOf(read(ROOT, 'sw.js'));
const PUBLISHED = '20991231a';
const oldCache = `futbolbase-v${OLD_VERSION}`;
const expected = `futbolbase-v${PUBLISHED}`;
const publish = (file, text) => (file === 'index.html' || file === 'sw.js' ? text.replaceAll(TREE_VERSION, PUBLISHED) : text);
const NOTICE = 'No se pudo abrir la versión nueva de la app. Comprueba la conexión y pulsa Reintentar.';

// Los datos y la configuración de las dos versiones, congelados (R2-2 de la revisión adversarial): las
// fixtures de B1, el día de los datos de hoy (23/09/2026), y el config.js de la app anterior (2025/26,
// con Las Mesas en PG2). Lo que las fixtures no traen, vacío: las temporadas archivadas, que el SW
// anterior precachea todas, y las fichas de jugadores, que la app anterior pide para su portada.
const js = (pairs) => ({ type: 'text/javascript', body: pairs.map(([name, value]) => `const ${name}=${JSON.stringify(value)};`).join('\n') + '\n' });
const FROZEN = (() => {
  const raw = fixture('current-2025-2026');
  const past = fixture('historical-2024-2025');
  const cups = fixture('cups-2025-2026');
  return {
    'src/config.js': { type: 'text/javascript', body: read(PREVIOUS, 'src/config.js') },
    'data-benjamin.js': js([['BENJAMIN', raw.benjamin]]),
    'data-prebenjamin.js': js([['PREBENJAMIN', raw.prebenjamin]]),
    'data-history.js': js([['HISTORY', raw.history]]),
    'data-goleadores.js': js([['GOL_BENJ', []], ['GOL_PREBENJ', []]]),
    'data-matchdetail-keys.js': js([['MATCH_DETAIL_KEYS', {}]]),
    'data-shields.js': js([['SHIELDS', fixture('shields')]]),
    'data-stats.js': js([['STATS', {}]]),
    'data-seasons.js': js([['SEASONS', [{ name: '2025-2026', current: true }, { name: '2024-2025', current: false }]]]),
    'data-maspalomas-cup-2026.js': js([['MASPALOMAS_CUP_BENJAMIN', cups.benjamin], ['MASPALOMAS_CUP_PREBENJAMIN', cups.prebenjamin]]),
    'data-season-2024-2025.js': js([['SEASON_2024_2025', { name: '2024-2025', current: false, benjamin: past.benjamin, prebenjamin: past.prebenjamin }]]),
    'data-matchdetail.js': js([['MATCH_DETAIL', fixture('matchdetail')]]),
    'data-lineups-2025-2026.js': js([['LINEUPS_2025_2026', fixture('lineups-2025-2026')]]),
    'data-health.json': { type: 'application/json', body: JSON.stringify(fixture('health')) },
  };
})();
function frozen(file) {
  if (Object.hasOwn(FROZEN, file)) return FROZEN[file];
  const [, kind, from, to] = file.match(/^data-(season|players)-(\d{4})-(\d{4})\.js$/) || [];
  if (kind === 'season') return js([[`SEASON_${from}_${to}`, { name: `${from}-${to}`, current: false, benjamin: [], prebenjamin: [] }]]);
  if (kind === 'players') return js([[`PLAYERS_${from}_${to}`, {}], [`TEAMS_${from}_${to}`, {}]]);
  return null;
}

// De qué versión es lo que sirvió una apertura: la anterior, la nueva, igual en las dos o ninguna.
function generation(file, body) {
  const data = frozen(file);
  if (data) return body === data.body ? 'igual' : 'ninguna';
  const before = read(PREVIOUS, file);
  const now = read(ROOT, file);
  const after = now === null ? null : publish(file, now);
  if (body === before && body === after) return 'igual';
  if (body === after) return 'nueva';
  if (body === before) return 'anterior';
  return 'ninguna';
}

const upstream = await startServer();
let phase = 'anterior';
let release;
const precacheHeld = new Promise((resolve) => { release = resolve; });
const failing = new Set();   // actualizaciones en segundo plano del SW anterior que fallan
const proxy = createServer(async (req, res) => {
  const url = new URL(req.url, 'http://portal.test');
  const file = decodeURIComponent(url.pathname === '/' ? 'index.html' : url.pathname.slice(1));
  const fromWorker = req.headers['sec-fetch-dest'] === 'empty';
  const isConfig = file === 'src/config.js';
  const isDocument = file === 'index.html';
  const cacheControl = isConfig || isDocument ? 'public, max-age=3600' : 'no-store';
  try {
    if (phase === 'nueva') {
      // El precache del SW nuevo (con la ?v= publicada) espera a que la prueba lo suelte.
      if (fromWorker && url.searchParams.get('v') === PUBLISHED) await precacheHeld;
      // La actualización en segundo plano del SW anterior (con su ?v=) de un módulo que falla.
      if (fromWorker && url.searchParams.get('v') === OLD_VERSION && failing.has(file)) {
        res.writeHead(503, { 'Content-Type': 'text/plain', 'Cache-Control': 'no-store' });
        res.end('no disponible');
        return;
      }
    }
    // Datos y config.js, congelados y los mismos en las dos versiones; ningún data-* vivo.
    const data = frozen(file);
    if (data || file.startsWith('data-')) {
      if (!data) console.error('PWA fixture HTTP 404 (sin dato congelado)', req.url);
      // Una CDN que aún guarda las URL sin ?v= de antes de publicar: el SW nuevo las pide con ?v=.
      const stale = phase === 'nueva' && isConfig && !url.searchParams.has('v');
      res.writeHead(data ? 200 : 404, { 'Content-Type': data ? data.type : 'text/plain', 'Cache-Control': cacheControl });
      res.end(data ? data.body + (stale ? '\n// previously cached HTTP asset' : '') : 'no está congelado');
      return;
    }
    if (phase === 'anterior') {
      const body = read(PREVIOUS, file);
      if (body !== null) {
        res.writeHead(200, { 'Content-Type': file.endsWith('.css') ? 'text/css' : file.endsWith('.html') ? 'text/html' : file.endsWith('.svg') ? 'image/svg+xml' : file.endsWith('.json') ? 'application/json' : 'text/javascript', 'Cache-Control': cacheControl });
        res.end(body);
        return;
      }
    }
    const response = await fetch(`http://127.0.0.1:${upstream.address().port}${req.url}`);
    // Los módulos de la app anterior ya no existen: su SW los pide en segundo plano y le dan 404.
    const expectedGone = phase === 'nueva' && fromWorker && read(PREVIOUS, file) !== null && read(ROOT, file) === null;
    if (!response.ok && !expectedGone) console.error('PWA fixture HTTP', response.status, req.url);
    let body = Buffer.from(await response.arrayBuffer());
    if (phase === 'nueva' && response.ok) {
      let text = publish(file, body.toString());
      if (file === 'sw.js') text += "\nself.addEventListener('message', e => e.ports[0]?.postMessage(CACHE_NAME));";
      // Una CDN que aún guarda las URL sin ?v= de antes de publicar: el SW nuevo las pide con ?v=.
      if (isDocument && !url.searchParams.has('v')) text += '\n<!-- previously cached HTTP document -->';
      if (file === 'sw.js' || file === 'index.html') body = Buffer.from(text);
    }
    res.writeHead(response.status, { 'Content-Type': response.headers.get('content-type') || 'text/plain', 'Cache-Control': cacheControl });
    res.end(body);
  } catch {
    res.writeHead(500);
    res.end();
  }
});
await new Promise((resolve) => proxy.listen(0, '127.0.0.1', resolve));
const base = `http://127.0.0.1:${proxy.address().port}/index.html`;

let browser;
try {
  browser = await chromium.launch({ executablePath: findChrome(), headless: true, args: ['--no-sandbox'] });
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: 'es-ES', timezoneId: 'Atlantic/Canary' });
  // La app anterior pide sus fuentes a Google: fuera de la prueba.
  await context.route(/^https:\/\/fonts\.(googleapis|gstatic)\.com\//, (route) => route.abort());
  context.on('console', (message) => { if (message.text().includes('[SW]')) console.log(message.text()); });
  const page = await context.newPage();
  page.setDefaultTimeout(20000);
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  // Lo que sirve cada apertura (documento, hojas y módulos de src/), con su versión.
  let served = [];
  page.on('response', (response) => {
    const url = new URL(response.url());
    if (url.origin !== new URL(base).origin || !/^\/(index\.html)?$|\.css$|^\/src\/.+\.js$/.test(url.pathname)) return;
    const file = url.pathname === '/' ? 'index.html' : decodeURIComponent(url.pathname.slice(1));
    served.push(response.text().then((body) => ({ file, generation: generation(file, body) }), () => ({ file, generation: 'sin cuerpo' })));
  });
  const opening = async (label, wanted) => {
    const seen = await Promise.all(served);
    served = [];
    const byGeneration = {};
    for (const { file, generation: g } of seen) (byGeneration[g] ||= []).push(file);
    const other = wanted === 'nueva' ? 'anterior' : 'nueva';
    assert.ok(seen.some(({ file }) => file === 'index.html'), `${label}: no llegó el documento`);
    assert.ok(seen.some(({ file }) => file.endsWith('.css')), `${label}: no llegó ninguna hoja`);
    for (const g of [other, 'ninguna', 'sin cuerpo']) {
      assert.deepEqual(byGeneration[g] || [], [], `${label}: la versión ${wanted} con ficheros de «${g}»`);
    }
    assert.deepEqual(errors, [], `${label}: errores de JavaScript`);
  };

  // 1. La app anterior instalada: su SW controla la página y tiene su precache.
  await page.goto(base);
  await page.locator(OLD_HOME).waitFor();
  await page.evaluate(async () => { await navigator.serviceWorker.ready; });
  await page.reload();
  await page.locator(OLD_HOME).waitFor();
  await waitForAsync(page, (name) => caches.keys().then((keys) => keys.includes(name) && !!navigator.serviceWorker.controller), oldCache);
  served = [];

  // 2. Se publica el rediseño. En la 1.ª apertura, la actualización en segundo plano de app.js y
  // state.js falla: su caché se queda con los viejos, aunque ya guarde el index.html nuevo.
  phase = 'nueva';
  failing.add('src/app.js');
  failing.add('src/state.js');
  await page.reload();
  await page.locator(OLD_HOME).waitFor();
  await opening('1.ª apertura', 'anterior');
  await waitForAsync(page, (name) => caches.open(name).then((cache) => cache.match('./index.html'))
    .then((response) => (response ? response.text() : '')).then((text) => text.includes('id="contenido"')), oldCache);
  failing.clear();

  // 3. Sin conexión, con el SW anterior al mando y el index.html nuevo en su caché, que no tiene ni
  // acta.css ni los módulos nuevos: el aviso con «Reintentar», nunca «Cargando…» sin más (R2-3).
  await context.setOffline(true);
  await page.reload();
  const notice = page.locator('#contenido [role="alert"]');
  await notice.waitFor();
  assert.equal((await notice.locator('p').textContent()).trim(), NOTICE);
  const retry = notice.getByRole('button', { name: 'Reintentar' });
  assert.ok((await retry.boundingBox()).height >= 44, '«Reintentar» mide al menos 44 px');
  assert.equal(await page.locator(`${HOME}, ${OLD_HOME}, [data-skeleton]`).count(), 0, 'sin conexión: ni una portada ni el esqueleto');
  assert.deepEqual(errors, [], 'sin conexión: errores de JavaScript');
  served = [];

  // 4. Con conexión, «Reintentar» abre la app nueva (2.ª apertura), y recargar, la 3.ª; con el SW
  // anterior todavía al mando: la app nueva entera, con acta.css.
  await context.setOffline(false);
  for (const [label, open] of [['2.ª apertura, con «Reintentar»', () => retry.click()], ['3.ª apertura', () => page.reload()]]) {
    await open();
    await page.locator(HOME).waitFor();
    await opening(label, 'nueva');
    assert.ok(await page.evaluate((name) => caches.keys().then((keys) => keys.includes(name)), oldCache), `${label}: el SW anterior ya no manda`);
    const look = await page.evaluate(() => ({
      sheets: [...document.styleSheets].map((sheet) => new URL(sheet.href || location.href).pathname),
      font: getComputedStyle(document.body).fontFamily.split(',')[0].replace(/["']/g, ''),
      bar: getComputedStyle(document.querySelector('.tabbar')).position,
    }));
    assert.deepEqual(look, { sheets: ['/acta.css'], font: 'Public Sans', bar: 'fixed' }, label);
  }

  // 5. El SW nuevo termina de instalarse, borra la caché anterior y toma el mando.
  release();
  await waitForAsync(page, ({ expected, oldCache }) => caches.keys().then((keys) => keys.includes(expected) && !keys.includes(oldCache)), { expected, oldCache });
  await waitForAsync(page, async () => {
    const registration = await navigator.serviceWorker.getRegistration();
    return registration?.active?.state === 'activated' && navigator.serviceWorker.controller === registration.active;
  });
  await waitForAsync(page, (expected) => new Promise((resolve) => {
    const channel = new MessageChannel();
    channel.port1.onmessage = (event) => resolve(event.data === expected);
    navigator.serviceWorker.controller?.postMessage('version', [channel.port2]);
    setTimeout(() => resolve(false), 500);
  }), expected);
  await page.reload();
  await page.locator(HOME).waitFor();
  await opening('con el SW nuevo', 'nueva');
  const config = await page.evaluate(async (name) => {
    const response = await (await caches.open(name)).match('./src/config.js');
    return response ? response.text() : null;
  }, expected);
  assert.ok(config && config.includes('export const PORTAL'), 'config.js precacheado');
  assert.ok(!config.includes('previously cached HTTP asset'), 'the new PWA must bypass HTTP entries cached before publication');
  assert.ok(!(await page.content()).includes('previously cached HTTP document'), 'navigation must retain the newly published HTML');
  assert.equal(await page.evaluate(async (name) => (await (await caches.open(name)).match('./index.html'))?.status, expected), 200);

  // 6. Sin conexión: la portada, con la fuente, los iconos y la hoja precacheados.
  await context.setOffline(true);
  await page.reload();
  await page.locator(HOME).waitFor();
  await opening('sin conexión', 'nueva');
  assert.match(await page.locator(HOME).getAttribute('data-state'), /^[ABCD]$/);
  assert.equal(await page.locator('h1').count(), 1);
  const precached = await page.evaluate(async (name) => (await (await caches.open(name)).keys()).map((r) => new URL(r.url).pathname), expected);
  for (const path of ['/fonts/PublicSans-latin.woff2', '/icons/icon-192.png', '/src/screen-home.js', '/acta.css']) {
    assert.ok(precached.includes(path), `${path} is not precached`);
  }
  assert.deepEqual(errors, []);
  console.log(`PASS: de la app anterior (su SW real) al rediseño, con datos congelados: la 1.ª apertura es la anterior; sin conexión a medias, el aviso con «Reintentar»; la 2.ª y la 3.ª, la nueva con acta.css y sin mezclar módulos; ${expected} funciona sin conexión`);
  await context.close();
} finally {
  if (browser) await browser.close();
  proxy.closeAllConnections();
  upstream.closeAllConnections();
  await Promise.all([new Promise((resolve) => proxy.close(resolve)), new Promise((resolve) => upstream.close(resolve))]);
}
```

Reescribir `scripts/tests/interaction-smoke.mjs` con este contenido:

```js
import { strict as assert } from 'node:assert';
import { createRequire } from 'node:module';
import { startServer, findChrome } from './render-smoke.mjs';

// npm install --no-save --package-lock=false playwright@1.58.0
// node scripts/tests/interaction-smoke.mjs
// Uses the installed Chrome (or CHROME=/absolute/path), like render-smoke.
//
// Desde el corte de B2, en mínimos: la portada carga a 320, 390, 768 y 1440 px, en claro y en
// oscuro (prefers-color-scheme emulado), con los colores de su tema, sin desplazamiento
// horizontal, con un solo h1 y con la barra de 4 destinos sin tapar el contenido. Los escenarios
// de navegación de §11 llegan con el router y las pantallas (Tarea 13).
const { chromium } = createRequire(import.meta.url)('playwright');
const chrome = findChrome();
assert.ok(chrome, 'Chrome is required for the interaction smoke test');
const server = await startServer();
const url = `http://127.0.0.1:${server.address().port}/index.html`;
const PAPER = { light: 'rgb(255, 255, 255)', dark: 'rgb(21, 23, 28)' };   // --paper de cada tema (spec §3.1)
let browser;

async function checkHome(viewport, colorScheme) {
  const context = await browser.newContext({
    viewport, colorScheme, serviceWorkers: 'block', locale: 'es-ES',
    timezoneId: 'Atlantic/Canary', reducedMotion: 'reduce',
  });
  try {
    const page = await context.newPage();
    page.setDefaultTimeout(6000);
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(url);
    const home = page.locator('section[data-screen="home"][data-state]');
    await home.waitFor();
    assert.match(await home.getAttribute('data-state'), /^[ABCD]$/, 'la portada enseña su equipo');
    assert.equal(await page.locator('h1').count(), 1, 'un solo h1');
    const layout = await page.evaluate(() => {
      const bar = document.querySelector('.tabbar').getBoundingClientRect().toJSON();
      window.scrollTo({ top: document.documentElement.scrollHeight, behavior: 'instant' });
      const blocks = [...document.querySelectorAll('#contenido section[data-screen] > *')];
      return {
        width: innerWidth, height: innerHeight, pageWidth: document.documentElement.scrollWidth,
        paper: getComputedStyle(document.body).backgroundColor,
        tabs: document.querySelectorAll('.tabbar .tab').length,
        current: document.querySelector('.tabbar [aria-current="page"]')?.getAttribute('href'),
        position: getComputedStyle(document.querySelector('.tabbar')).position,
        bar, barTop: document.querySelector('.tabbar').getBoundingClientRect().top,
        lastBottom: Math.max(...blocks.map(node => node.getBoundingClientRect().bottom)),
      };
    });
    assert.ok(layout.pageWidth <= layout.width, `Page width ${layout.pageWidth}px exceeds viewport ${layout.width}px`);
    assert.equal(layout.paper, PAPER[colorScheme], `fondo del tema ${colorScheme}`);
    assert.equal(layout.tabs, 4, 'barra de 4 destinos');
    assert.equal(layout.current, '#/', 'Mi equipo es el destino actual');
    if (viewport.width < 1024) {
      assert.equal(layout.position, 'fixed');
      assert.ok(Math.abs(layout.bar.bottom - layout.height) < 1, 'la barra toca el borde inferior');
      assert.ok(layout.lastBottom <= layout.barTop + 1, 'al final de la página, la barra no tapa la portada');
    } else {
      assert.equal(layout.position, 'static', 'en escritorio, pestañas arriba');
    }
    assert.deepEqual(errors, [], 'No application JavaScript errors');
  } finally {
    await context.close();
  }
}

try {
  browser = await chromium.launch({ executablePath: chrome, headless: true, args: ['--no-sandbox'] });
  for (const viewport of [
    { width: 320, height: 568 }, { width: 390, height: 844 },
    { width: 768, height: 1024 }, { width: 1440, height: 1000 },
  ]) {
    for (const colorScheme of ['light', 'dark']) {
      await checkHome(viewport, colorScheme);
      console.log(`PASS: la portada carga a ${viewport.width}px en ${colorScheme === 'light' ? 'claro' : 'oscuro'}, sin desplazamiento horizontal`);
    }
  }
} finally {
  if (browser) await browser.close();
  server.closeAllConnections();
  await new Promise(resolve => server.close(resolve));
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
cd /home/manolo/claude/futbol-base
node --test scripts/tests/test_rediseno_modulos.mjs scripts/tests/test_rediseno_index.mjs scripts/tests/test_rediseno_home.mjs scripts/tests/test_rediseno_smoke.mjs scripts/tests/test_rediseno_state.mjs scripts/tests/test_rediseno_css.mjs scripts/tests/test_rediseno_ui.mjs scripts/tests/test_rediseno_model_nombres.mjs scripts/tests/test_sw_fixes.mjs 2>&1 | grep -E '^# (tests|pass|fail)'
python3 -m pytest scripts/tests/test_index_bot_contract.py scripts/tests/test_workflows.py -q 2>&1 | tail -1 | sed -E 's/ in [0-9.]+s$//'
```
Esperado:
```text
# tests 118
# pass 118
# fail 0
25 passed
```

- [ ] **Step 5: Suites completas y los tres smoke**

```bash
cd /home/manolo/claude/futbol-base
python3 -m pytest scripts/tests/ -q 2>&1 | tail -1
node --test scripts/tests/test_*.mjs 2>&1 | grep -E '^# (tests|pass|fail)'
```
Esperado:
- pytest: el recuento anterior más 2 (`test_index_bot_contract.py`), sin `failed`.
- node: el recuento anterior menos 109, con `# fail 0`:
  - se van 144 pruebas: 107 de los seis ficheros borrados, 11 de `review0615`, 12 de `festate`, 13 de `js_modules` y 1 neta de `portal_features`;
  - llegan 35: `modulos` 6, `index` 5, `home` 12, `smoke` 3, `state` 3, `css` 2, `ui` 2, `model_nombres` 1 y `sw_fixes` 1 neta.

Los smoke necesitan Chrome y Playwright. La primera línea instala Playwright solo si falta, como `tests.yml`; desde aquí, los tres smoke tienen que salir en verde después de cada tarea.

```bash
cd /home/manolo/claude/futbol-base
node -e "require.resolve('playwright')" 2>/dev/null || npm install --no-save --package-lock=false playwright@1.58.0 >/dev/null 2>&1
node scripts/tests/render-smoke.mjs
node scripts/tests/interaction-smoke.mjs
node scripts/tests/pwa-smoke.mjs 2>&1 | grep -v '^PWA fixture HTTP 404 /escudos/s/'
```
Esperado, con el tamaño del DOM del día (`render-smoke` dice el estado de hoy: con los datos del 24/09/2026, la D; `pwa-smoke` anota los 404 de `escudos/s/`, las miniaturas que llegan en B4, y el `grep -v` los quita):
```text
PASS: render smoke OK — Mi equipo en estado D (DOM 6437 bytes)
PASS: la portada carga a 320px en claro, sin desplazamiento horizontal
PASS: la portada carga a 320px en oscuro, sin desplazamiento horizontal
PASS: la portada carga a 390px en claro, sin desplazamiento horizontal
PASS: la portada carga a 390px en oscuro, sin desplazamiento horizontal
PASS: la portada carga a 768px en claro, sin desplazamiento horizontal
PASS: la portada carga a 768px en oscuro, sin desplazamiento horizontal
PASS: la portada carga a 1440px en claro, sin desplazamiento horizontal
PASS: la portada carga a 1440px en oscuro, sin desplazamiento horizontal
PASS: de la app anterior (su SW real) al rediseño, con datos congelados: la 1.ª apertura es la anterior; sin conexión a medias, el aviso con «Reintentar»; la 2.ª y la 3.ª, la nueva con acta.css y sin mezclar módulos; futbolbase-v20991231a funciona sin conexión
```

- [ ] **Step 6: Commit**

```bash
cd /home/manolo/claude/futbol-base
git add index.html sw.js acta.css scripts/tests/fixtures/app-anterior src/app.js src/screen-home.js src/state.js src/links.js src/ui.js src/model.js .github/workflows/tests.yml scripts/tests/test_workflows.py scripts/tests/render-smoke.mjs scripts/tests/interaction-smoke.mjs scripts/tests/pwa-smoke.mjs scripts/tests/test_sw_fixes.mjs scripts/tests/test_js_modules.mjs scripts/tests/test_festate_fixes.mjs scripts/tests/test_review0615_frontend.mjs scripts/tests/test_portal_features.mjs scripts/tests/test_rediseno_state.mjs scripts/tests/test_rediseno_css.mjs scripts/tests/test_rediseno_contrast.mjs scripts/tests/test_rediseno_assets.mjs scripts/tests/test_rediseno_ui.mjs scripts/tests/test_rediseno_model_nombres.mjs scripts/tests/test_rediseno_modulos.mjs scripts/tests/test_rediseno_index.mjs scripts/tests/test_rediseno_home.mjs scripts/tests/test_rediseno_smoke.mjs scripts/tests/test_index_bot_contract.py
git diff --name-only
git commit -F - <<'EOF'
feat(rediseño): el corte, la app vieja se va y arranca la portada «Acta» (B2, tarea 4)

- index.html pasa a esqueleto (cabecera, barra de ui.tabbar y primera
  caja) con los mismos nueve data-*.js, las ?v= y el literal oculto que
  necesita el bot, y llama a start(document, window) de app.js: ningún
  módulo de src/ toca el navegador al importarse. Antes de importar
  app.js quita de las cachés de la app anterior sus app.js, state.js y
  links.js: su SW los serviría viejos aunque cambie la ?v=. Si el
  arranque falla (sin conexión en plena transición), un aviso con
  estilos en línea y «Reintentar», nunca «Cargando…» para siempre.
- style-acta.css pasa a ser acta.css, una URL nueva: el SW de la app
  anterior sirve los .css desde su caché ignorando la ?v=. El style.css
  viejo se borra.
- Se borran render, modals, miequipo, init, favorites, filters, health,
  plantilla y matchdetail-rich. state.js pierde S, FEATURED, el HTML y
  el efecto al importarse (getData, withSeasonCup, getPhases y
  countStats reciben temporada y categoría; featuredScorersFrom pasa a
  teamScorers) y links.js deja de escribir enlaces antiguos.
- app.js arranca almacén, registro de datos y modelo, y pinta la
  portada mínima de screen-home.js: cabecera de pantalla con h1 y el
  bloque del estado A, B, C, D, E o X, sin router todavía.
- Piezas compartidas: screenHead y backLink en ui.js (la cabecera de
  pantalla de todas las pantallas) y seasonLabel en model.js.
- STATIC_ASSETS pasa al grafo nuevo, con la fuente y los iconos.
- Pruebas: se borran las de detalle visual del diseño anterior, se
  dividen las mixtas, test_rediseno_modulos sustituye al contrato de
  B1, y render-smoke e interaction-smoke miran la portada. pwa-smoke
  prueba el paso desde la app anterior con su SW real (una copia de la
  de main 31a15b8 en scripts/tests/fixtures/app-anterior), con datos y
  config.js congelados para las dos versiones: ninguna apertura mezcla
  versiones, sin conexión a medias sale el aviso con «Reintentar» y al
  final la portada funciona sin conexión.

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01Sg56KK3oZgo8Ye7Snj6wG9
EOF
git show --stat --oneline HEAD | tail -1
```
Esperado: `git diff --name-only` no muestra nada (todo lo que cambió está en el índice; `HANDOFF.md` y `docs/mejoras-2026-09.md` no están en git y no entran), y la última línea dice `54 files changed` (git ve los módulos borrados y la hoja vieja como renombrados a `scripts/tests/fixtures/app-anterior/`, su copia).

---

### Task 5: `shell.js` y su CSS: cabecera, barra, aviso sin conexión, esqueletos y caja de error (spec §4.1, §4.8, §4.10, §5.4, §7 y §8)

El marco común de todas las pantallas: la cabecera de la app con la barra, el `aria-current` de la barra, el aviso sin conexión, los esqueletos de carga y la caja de error. La cabecera de cada pantalla (`screenHead`) ya está en `ui.js` desde el corte, y `shell.js` la usa.

**Contexto**
- **Dos cabeceras.** En las maquetas, lo alto de cada pantalla es su propia cabecera (h1, etiqueta y acción, sobre una regla de tinta), sin marca. Por eso hay dos piezas:
  - **la cabecera de la app** (`renderHeader`): la marca y la barra de 4 destinos. En móvil y tableta la barra es fija abajo y la marca no se ve; desde 1024 px, la marca va a la izquierda y los destinos en pestañas, con 1120 px de ancho máximo (§4.8). La tableta (769-1023 px) es el diseño móvil centrado a 640 px, que ya da `.page`. Lleva el hueco `.shell-offline` del aviso sin conexión;
  - **la cabecera de pantalla** (`screenHead`, en `ui.js` desde la Tarea 4), común a Mi equipo, Jornada, Tabla, Partido y la provisional: «‹» y escudo opcionales, el único `h1`, la etiqueta debajo y una acción a la derecha («Cambiar», «Otro grupo», «Compartir»). Mide al menos 72 px, lo mismo que su esqueleto, que reproduce sus clases (`screen-head`, `screen-head-text`).
- **La barra va dentro de la cabecera.** Orden del DOM: «Saltar al contenido», cabecera (marca y barra) y `main`. En escritorio la barra es la fila de pestañas; en móvil, `position: fixed` la saca del flujo, así que la cabecera no ocupa nada. Ningún estilo de la cabecera crea un bloque contenedor (`transform`, `filter`, `contain`…), que despegaría la barra del borde de la pantalla.
- **`aria-current` (§4.1).** `updateTabbar(active, current, doc)` cambia la barra ya pintada: `"page"` en el destino de la pantalla y `"true"` en las secundarias. Recibe el documento: `shell.js` no nombra ningún global del navegador. Lo llama el router en cada navegación (Tarea 6).
- **Aviso sin conexión (§4.10).** «Sin conexión. Datos del DD/MM/AAAA», con `lastDataChange` de `data-health.json` o, si falta, la fecha del literal oculto «Última actualización» de `index.html`. El hueco lleva `role="status"` y nunca `display: none`, porque una región viva oculta deja de anunciarse. Lo rellena `app.js` (Tarea 12).
- **Esqueletos (§5.4 y §7).** La cabecera de pantalla y las primeras cajas de cada pantalla, con medidas tomadas de las maquetas: gris plano, sin animación (§3.4), `aria-busy="true"` y «Cargando…» oculto. Nunca llevan `data-screen` ni `h1`, porque los smoke esperan a `section[data-screen]`. `index.html` lleva el de la portada, así que el paso del esqueleto estático al pintado no salta.
- **Caja de error (§7).** «No se pudieron cargar los datos de <qué>.» y «Reintentar», un botón con `data-action="retry"` que atiende el router. `errorScreen` la pone bajo la cabecera de pantalla, con el `h1` de la ruta.
- **`index.html` se toca con un guion** que parte del marcado del corte: quita la barra que el corte deja suelta, pone `renderHeader()` en `<header class="shell-header">` y `skeleton('home')` en `<main id="contenido" class="page">`. La prueba compara `index.html` con las dos funciones, así que no pueden divergir. El bloque provisional del corte para la marca (`.shell-brand`) se va de `acta.css`, y `test_rediseno_index.mjs` pasa a esperar el esqueleto de `shell.js` dentro de `main`.

**Files:**
- Create: `src/shell.js`.
- Modify: `acta.css` (fuera el bloque de la marca del corte y un bloque nuevo al final) e `index.html` (cabecera y contenido de `main`, con el guion del paso 3).
- Test: `scripts/tests/test_rediseno_shell.mjs` (nuevo) y `scripts/tests/test_rediseno_index.mjs` (el contenido de `main`).

**Interfaces:**
- Consumes:
  - `html` (`html.js`); `tabbar(active, { current })`, `notice(term, text)` y `screenHead(title, { sub, action, crest, back })` (`ui.js`, este de la Tarea 4); `SCREENS` (`links.js`, solo en la prueba).
  - De `index.html` (corte): `<header class="shell-header">…</header>`, una sola `<nav class="tabbar">…</nav>` y `<main id="contenido" class="page">…</main>`.
- Produces (`src/shell.js`):

```js
export function routeTitle(screen)                        // título de la ruta de §4.1: '' → 'Mi equipo', 'records' → 'Récords'…; desconocida → 'Mi equipo'
export function renderHeader({ active = 'miequipo', current = 'page' } = {})
  // Html: <div class="shell-bar"><a class="brand" href="#/">…</a>${tabbar(active, { current })}</div><div class="shell-offline" role="status"></div>
export function updateTabbar(active, current, doc)        // aria-current en doc '.tabbar a.tab'; active null lo quita; RangeError con otro destino o valor
export function offlineNotice(health, legacyDate)         // Html: <p class="notice"><b>Sin conexión.</b> Datos del DD/MM/AAAA</p>
export function skeleton(screenId)                        // Html: <div class="skeleton-screen" data-skeleton="<id>" aria-busy="true">…; 'home', 'jornada', 'tabla', 'partido' y el resto
export function errorBox(what)                            // Html: <div class="box error-box" role="alert">…<button … data-action="retry">Reintentar</button>…
export function errorScreen({ screenId, title, what, back = null })  // Html: <section data-screen="<id>" data-state="error">screenHead y caja</section>
export function routeNotice(text)                         // Html: <p class="notice route-notice" role="status">…</p>
```

- [ ] **Step 1: Write the failing test**

Crear `scripts/tests/test_rediseno_shell.mjs`:

```js
// Plan B2, tarea 5: el marco de la app (spec §4.1, §4.8, §4.10, §7 y §8). shell.js, su CSS
// y la cabecera y el esqueleto de la portada que lleva index.html.
import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { SCREENS } from '../../src/links.js';
import { tabbar, screenHead } from '../../src/ui.js';
import {
  renderHeader, updateTabbar, offlineNotice, skeleton, errorBox, errorScreen, routeNotice, routeTitle,
} from '../../src/shell.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const read = (path) => readFileSync(join(ROOT, path), 'utf8');
const s = (h) => String(h);
// Texto visible: sin etiquetas y con las entidades básicas resueltas.
const text = (h) => s(h).replace(/<[^>]*>/g, '')
  .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');

// La barra ya pintada, como la ve updateTabbar: los <a class="tab"> de ui.tabbar con sus atributos.
function fakeDoc() {
  const tabs = [...s(tabbar(null)).matchAll(/<a class="tab" href="([^"]*)"/g)].map(([, href]) => {
    const attrs = { href };
    return {
      attrs,
      getAttribute: (name) => attrs[name] ?? null,
      setAttribute: (name, value) => { attrs[name] = String(value); },
      removeAttribute: (name) => { delete attrs[name]; },
    };
  });
  return { tabs, querySelectorAll: (selector) => (selector === '.tabbar a.tab' ? tabs : []) };
}
const marks = (doc) => doc.tabs.map((t) => [t.attrs.href, t.attrs['aria-current'] ?? null]);

test('renderHeader: la marca lleva a Mi equipo; dentro, la barra de ui.js y el hueco del aviso', () => {
  assert.equal(s(renderHeader()), '<div class="shell-bar"><a class="brand" href="#/">Fútbol base <span class="brand-place">Las Palmas</span></a>'
    + `${tabbar('miequipo')}</div><div class="shell-offline" role="status"></div>`);
  assert.ok(s(renderHeader({ active: 'tabla', current: 'true' })).includes(s(tabbar('tabla', { current: 'true' }))));
  assert.equal((s(renderHeader()).match(/<nav /g) || []).length, 1);
});

test('updateTabbar: "page" en el destino de la pantalla, "true" en las secundarias y nada en los demás', () => {
  const doc = fakeDoc();
  updateTabbar('jornada', 'page', doc);
  assert.deepEqual(marks(doc), [['#/', null], ['#/jornada', 'page'], ['#/tabla', null], ['#/explorar', null]]);
  updateTabbar('explorar', 'true', doc);
  assert.deepEqual(marks(doc), [['#/', null], ['#/jornada', null], ['#/tabla', null], ['#/explorar', 'true']]);
  updateTabbar(null, 'page', doc);
  assert.deepEqual(marks(doc).map(([, value]) => value), [null, null, null, null]);
  assert.throws(() => updateTabbar('partido', 'page', doc), RangeError);
  assert.throws(() => updateTabbar('tabla', 'location', doc), RangeError);
});

test('offlineNotice: «Sin conexión. Datos del …» con lastDataChange o, si falta, «Última actualización»', () => {
  assert.equal(s(offlineNotice({ lastDataChange: '2026-09-23' }, '20/09/2026')),
    '<p class="notice"><b>Sin conexión.</b> Datos del 23/09/2026</p>');
  assert.equal(text(offlineNotice(null, '20/09/2026')), 'Sin conexión. Datos del 20/09/2026');
  assert.equal(text(offlineNotice({ lastDataChange: null }, '20/09/2026')), 'Sin conexión. Datos del 20/09/2026');
  assert.equal(text(offlineNotice(null, 'ayer')).trim(), 'Sin conexión.');
  assert.equal(text(offlineNotice(undefined, undefined)).trim(), 'Sin conexión.');
});

test('skeleton: cabecera y primeras cajas de cada pantalla, ocupado, sin h1 ni data-screen', () => {
  for (const id of ['home', 'jornada', 'tabla', 'partido', 'pendiente']) {
    const out = s(skeleton(id));
    assert.match(out, new RegExp(`^<div class="skeleton-screen" data-skeleton="${id}" aria-busy="true"><p class="vh" role="status">Cargando…</p>`), id);
    assert.match(out, /<div class="screen-head sk-head" aria-hidden="true">/, id);
    assert.match(out, /<div class="box skeleton [\w-]+"><\/div>/, id);
    assert.doesNotMatch(out, /<h1|data-screen=/, id);
  }
  assert.match(s(skeleton('home')), /<span class="sk sk-crest"><\/span>.*<div class="box skeleton sk-box-home"><\/div>/);
  assert.doesNotMatch(s(skeleton('jornada')), /sk-crest/);
  assert.equal(s(skeleton('explorar')), s(skeleton('pendiente')).replace('data-skeleton="pendiente"', 'data-skeleton="explorar"'));
});

test('errorBox: «No se pudieron cargar los datos de <qué>» y Reintentar con data-action="retry"', () => {
  assert.equal(s(errorBox('la temporada 2024/25')), '<div class="box error-box" role="alert"><p class="error-text">'
    + 'No se pudieron cargar los datos de la temporada 2024/25.</p><div class="buttons">'
    + '<button class="button is-main" type="button" data-action="retry">Reintentar</button></div></div>');
  assert.match(s(errorBox('<b>"x"</b>')), /de &lt;b&gt;&quot;x&quot;&lt;\/b&gt;\./);
});

test('errorScreen: la pantalla con su h1, «‹» si tiene padre y la caja de error', () => {
  const out = s(errorScreen({ screenId: 'partido', title: 'Partido', what: 'los goles', back: '#/jornada?g=PG2' }));
  assert.match(out, /^<section data-screen="partido" data-state="error"><header class="screen-head"><a class="back" href="#\/jornada\?g=PG2" data-action="back"/);
  assert.equal((out.match(/<h1>/g) || []).length, 1);
  assert.match(out, /<h1>Partido<\/h1>/);
  assert.ok(out.includes(s(errorBox('los goles'))));
  assert.doesNotMatch(s(errorScreen({ screenId: 'home', title: 'Mi equipo', what: 'x' })), /class="back"/);
});

test('routeTitle: un título por ruta de §4.1; routeNotice: aviso anunciado con role="status"', () => {
  assert.deepEqual(SCREENS.map(routeTitle), ['Mi equipo', 'Jornada', 'Tabla', 'Explorar', 'Partido', 'Equipo', 'Ligas',
    'Copa', 'Goleadores', 'Temporadas anteriores', 'Récords', 'Datos y fuentes', 'Ajustes']);
  assert.equal(routeTitle('desconocida'), 'Mi equipo');
  assert.equal(s(routeNotice('Elige tu equipo en Mi equipo')), '<p class="notice route-notice" role="status">Elige tu equipo en Mi equipo</p>');
});

// ── CSS (spec §3.4, §4.8 y §8) ──────────────────────────────────────────

const CSS = read('acta.css');
// Reglas del CSS como {media, selector, body}; un nivel de @media.
function parseCss(src) {
  const rules = [];
  const walk = (str, media) => {
    let i = 0;
    while (i < str.length) {
      const open = str.indexOf('{', i);
      if (open < 0) break;
      const prelude = str.slice(i, open).trim();
      let depth = 1, j = open + 1;
      for (; j < str.length && depth; j++) {
        if (str[j] === '{') depth++;
        else if (str[j] === '}') depth--;
      }
      const body = str.slice(open + 1, j - 1);
      if (prelude.startsWith('@media')) walk(body, prelude);
      else rules.push({ media, selector: prelude, body });
      i = j;
    }
  };
  walk(src.replace(/\/\*[\s\S]*?\*\//g, ''), null);
  return rules;
}
const RULES = parseCss(CSS);
const DESKTOP = (m) => m !== null && /min-width:\s*1024px/.test(m);
function decl(selector, media = (m) => m === null) {
  const found = RULES.filter((r) => media(r.media) && r.selector.split(',').map((x) => x.trim()).includes(selector));
  assert.ok(found.length, `no hay regla para «${selector}»`);
  return found.map((r) => r.body).join(';');
}

test('CSS: en escritorio, marca y pestañas a 1120 px con regla de tinta; en móvil y tableta, sin marca', () => {
  assert.doesNotMatch(CSS, /\.shell-brand/, 'el bloque provisional del corte se ha ido');
  assert.match(decl('.brand'), /display:\s*none/);
  const brand = decl('.brand', DESKTOP);
  assert.match(brand, /display:\s*flex/);
  assert.match(brand, /min-height:\s*44px/);
  const bar = decl('.shell-bar', DESKTOP);
  assert.match(bar, /display:\s*flex/);
  assert.match(bar, /max-width:\s*1120px/);
  assert.match(decl('.shell-header', DESKTOP), /border-bottom:\s*1\.5px solid var\(--ink\)/);
  assert.match(decl('.page'), /max-width:\s*640px/, 'tableta: el diseño móvil centrado a 640 px');
  // La barra es fija en móvil: ningún antepasado puede crearle un bloque contenedor.
  const shell = RULES.filter((r) => /\.shell-(header|bar)\b/.test(r.selector)).map((r) => r.body).join(';');
  assert.doesNotMatch(shell, /transform|filter|contain|will-change|perspective/);
});

test('CSS: esqueletos grises y quietos; el hueco del aviso sin conexión nunca se oculta', () => {
  assert.match(decl('.sk'), /background:\s*var\(--line\)/);
  assert.match(decl('.box.skeleton'), /border-color:\s*var\(--line\)/);
  const sk = RULES.filter((r) => /\.sk\b|\.sk-|skeleton/.test(r.selector)).map((r) => r.body).join(';');
  assert.doesNotMatch(sk, /animation|transition/);
  assert.match(decl('.shell-offline:not(:empty)'), /border-bottom/);
  // Una región viva con display: none deja de anunciarse.
  assert.doesNotMatch(CSS, /\.shell-offline[^{]*\{[^}]*display:\s*none/);
});

test('cada clase que emite shell.js existe en acta.css (salvo los ganchos del router y las pruebas)', () => {
  const defined = new Set([...CSS.replace(/\/\*[\s\S]*?\*\//g, '').matchAll(/\.([a-zA-Z][\w-]*)/g)].map((m) => m[1]));
  const HOOKS = new Set(['skeleton-screen', 'sk-head', 'error-box', 'route-notice']);
  const out = [renderHeader(), offlineNotice(null, '23/09/2026'),
    screenHead('t', { sub: 's', action: { href: '#', label: 'a' }, back: '#' }),
    ...['home', 'jornada', 'tabla', 'partido', 'pendiente'].map(skeleton),
    errorScreen({ screenId: 'home', title: 't', what: 'w' }), routeNotice('x')].map(String).join('');
  const used = new Set([...out.matchAll(/class="([^"]+)"/g)].flatMap((m) => m[1].split(/\s+/)));
  assert.deepEqual([...used].filter((c) => !defined.has(c) && !HOOKS.has(c)), []);
});

test('index.html: la cabecera de renderHeader, con la barra dentro, y el esqueleto de la portada en main', () => {
  const page = read('index.html');
  assert.ok(page.includes(`<header class="shell-header">${renderHeader()}</header>`), 'la cabecera no es la de renderHeader()');
  assert.equal((page.match(/<nav class="tabbar"/g) || []).length, 1, 'una sola barra, la de la cabecera');
  const main = page.match(/<main id="contenido" class="page"[^>]*>([\s\S]*?)<\/main>/);
  assert.ok(main, 'falta <main id="contenido" class="page">');
  assert.equal(main[1].trim(), s(skeleton('home')));
  assert.match(page, /<a class="skip-link" href="#contenido">/);
  assert.ok(page.indexOf('<header class="shell-header">') < page.indexOf('<main id="contenido"'));
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd /home/manolo/claude/futbol-base
node --test scripts/tests/test_rediseno_shell.mjs 2>&1 | grep -E 'Error|^# (tests|pass|fail)'
```
Esperado:
```text
# Error [ERR_MODULE_NOT_FOUND]: Cannot find module '/home/manolo/claude/futbol-base/src/shell.js' imported from /home/manolo/claude/futbol-base/scripts/tests/test_rediseno_shell.mjs
# tests 1
# pass 0
# fail 1
```

- [ ] **Step 3: Write minimal implementation**

Crear `src/shell.js`:

```js
// Marco de la app (spec §4.1, §4.8, §4.10, §7 y §8): cabecera con la marca y la barra,
// aria-current de la barra, aviso sin conexión, esqueletos de carga, caja de error y aviso de
// redirección. Todo son funciones puras que devuelven Html, salvo updateTabbar, que cambia la
// barra ya pintada del documento que recibe. La cabecera de cada pantalla es screenHead (ui.js).
// No toca el navegador al importarse.
import { html } from './html.js';
import { tabbar, notice, screenHead } from './ui.js';

const TAB_HREFS = { miequipo: '#/', jornada: '#/jornada', tabla: '#/tabla', explorar: '#/explorar' };

// Títulos de las rutas de §4.1: el h1 de la pantalla provisional, de la caja de error y del
// <title> del documento.
const TITLES = {
  '': 'Mi equipo', jornada: 'Jornada', tabla: 'Tabla', explorar: 'Explorar', partido: 'Partido',
  equipo: 'Equipo', ligas: 'Ligas', copa: 'Copa', goleadores: 'Goleadores',
  temporadas: 'Temporadas anteriores', records: 'Récords', fuentes: 'Datos y fuentes', ajustes: 'Ajustes',
};

export function routeTitle(screen) {
  return Object.hasOwn(TITLES, screen) ? TITLES[screen] : TITLES[''];
}

// ── Cabecera de la app y barra ───────────────────────────────────────────

// La marca y la barra de 4 destinos. En móvil y tableta la barra es fija abajo y la marca no se
// ve; desde 1024 px, la marca va a la izquierda y los destinos en pestañas, con 1120 px de
// ancho máximo (spec §4.8). .shell-offline es el hueco del aviso sin conexión (§4.10), que
// rellena app.js. index.html lleva esta misma cabecera, con Mi equipo activo.
export function renderHeader({ active = 'miequipo', current = 'page' } = {}) {
  return html`<div class="shell-bar"><a class="brand" href="#/">Fútbol base <span class="brand-place">Las Palmas</span></a>${tabbar(active, { current })}</div><div class="shell-offline" role="status"></div>`;
}

// aria-current en la barra ya pintada (spec §4.1): "page" en el destino de la pantalla y "true"
// en las secundarias (Partido, Equipo, Ligas…); con active null, en ninguno.
export function updateTabbar(active, current, doc) {
  if (active != null && !Object.hasOwn(TAB_HREFS, active)) throw new RangeError(`Destino de la barra no válido: ${active}`);
  if (current !== 'page' && current !== 'true') throw new RangeError(`aria-current no válido: ${current}`);
  for (const tab of doc.querySelectorAll('.tabbar a.tab')) {
    if (active != null && tab.getAttribute('href') === TAB_HREFS[active]) tab.setAttribute('aria-current', current);
    else tab.removeAttribute('aria-current');
  }
}

// ── Aviso sin conexión (spec §4.10) ──────────────────────────────────────

const isoToDMY = (iso) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso ?? ''));
  return m ? `${m[3]}/${m[2]}/${m[1]}` : null;
};

// «Sin conexión. Datos del DD/MM/AAAA»: la fecha es lastDataChange de data-health o, si falta,
// la del literal oculto «Última actualización» de index.html (legacyDate, DD/MM/AAAA).
export function offlineNotice(health, legacyDate) {
  const legacy = /^\d{2}\/\d{2}\/\d{4}$/.test(String(legacyDate ?? '')) ? legacyDate : null;
  const date = isoToDMY(health?.lastDataChange) || legacy;
  return notice('Sin conexión.', date ? `Datos del ${date}` : '');
}

// ── Esqueletos de carga (spec §5.4 y §7) ─────────────────────────────────

// Mismas medidas que la pantalla terminada: la cabecera de pantalla (72 px) y sus primeras
// cajas. Sin animación (spec §3.4) y sin h1: el h1 llega con el contenido.
const BODIES = {
  home: html`<div class="block"><span class="sk sk-block-title"></span><div class="box skeleton sk-box-home"></div></div>`,
  jornada: html`<div class="box skeleton sk-box-round"></div><span class="sk sk-day"></span><div class="box skeleton sk-rows-6"></div>`,
  tabla: html`<div class="box skeleton sk-box-seg"></div><div class="block"><span class="sk sk-block-title"></span><div class="box skeleton sk-rows-10"></div></div>`,
  partido: html`<div class="block"><span class="sk sk-block-title"></span><div class="box skeleton sk-box-match"></div></div>`,
};
const OTHER = html`<div class="block"><div class="box skeleton sk-box"></div></div>`;

export function skeleton(screenId) {
  const head = html`<div class="screen-head sk-head" aria-hidden="true">${screenId === 'home' ? html`<span class="sk sk-crest"></span>` : ''}<span class="screen-head-text"><span class="sk sk-title"></span><span class="sk sk-sub"></span></span></div>`;
  return html`<div class="skeleton-screen" data-skeleton="${screenId}" aria-busy="true"><p class="vh" role="status">Cargando…</p>${head}${Object.hasOwn(BODIES, screenId) ? BODIES[screenId] : OTHER}</div>`;
}

// ── Error y avisos del router ────────────────────────────────────────────

// Spec §7: «No se pudieron cargar los datos de <qué>» con «Reintentar», que el router atiende
// por data-action="retry". Nunca se cae a datos de otra temporada.
export function errorBox(what) {
  return html`<div class="box error-box" role="alert"><p class="error-text">No se pudieron cargar los datos de ${what}.</p><div class="buttons"><button class="button is-main" type="button" data-action="retry">Reintentar</button></div></div>`;
}

// La pantalla entera cuando falla una carga o el pintado: su h1 y la caja de error.
export function errorScreen({ screenId, title, what, back = null }) {
  return html`<section data-screen="${screenId}" data-state="error">${screenHead(title, { back })}<div class="block">${errorBox(what)}</div></section>`;
}

// Aviso de una redirección de §4.1 («Elige tu equipo en Mi equipo»). El router lo pone
// detrás de la cabecera de la pantalla de destino.
export function routeNotice(text) {
  return html`<p class="notice route-notice" role="status">${text}</p>`;
}
```

En `acta.css`, el bloque provisional del corte para la marca se va: lo sustituye el de la cabecera de la app de aquí abajo.

```bash
cd /home/manolo/claude/futbol-base
python3 - <<'PY'
from pathlib import Path

p = Path('acta.css')
s = p.read_text(encoding='utf-8')
start = '/* ── Cabecera de la app en el corte: la marca, solo en escritorio (spec §4.8) ──'
assert s.count(start) == 1, start
i = s.index(start)
j = s.index('\n  }\n}\n', i) + len('\n  }\n}\n')
s = s[:i].rstrip('\n') + '\n' + s[j:]
p.write_text(s, encoding='utf-8')
PY
grep -c 'shell-brand' acta.css
```
Esperado:
```text
0
```

Añadir al final de `acta.css`:

```css
/* ── Marco de la app: marca y aviso sin conexión (spec §4.8 y §4.10) ──── */

/* En móvil y tableta la cabecera no ocupa nada: la barra es fija abajo y
 * la marca no se ve. El hueco del aviso solo tiene alto cuando hay aviso. */
.brand { display: none; }
.shell-offline:not(:empty) { border-bottom: 1px solid var(--rule); }
.shell-offline .notice { max-width: 640px; margin: 0 auto; padding: 8px var(--gutter); }

/* ── Esqueletos de carga: gris plano, sin animación (spec §3.4 y §7) ──── */

.sk { display: block; background: var(--line); }
.sk-crest { flex: none; width: 46px; height: 46px; border-radius: 50%; }
.sk-title { width: 55%; height: 22px; }
.sk-sub { width: 80%; height: 15px; margin-top: 5px; }
.sk-block-title { width: 130px; height: 19px; margin-bottom: 7px; }
.sk-day { width: 140px; height: 18px; margin: 16px 0 6px; }
.box.skeleton { border-color: var(--line); }
.sk-box-home { height: 272px; }
.sk-box-round { height: 60px; margin-top: 14px; }
.sk-rows-6 { height: 272px; }
.sk-box-seg { height: 47px; margin-top: 14px; }
.sk-rows-10 { height: 474px; }
.sk-box-match { height: 240px; }
.sk-box { height: 96px; }

/* ── Caja de error y aviso de redirección (spec §7 y §4.1) ────────────── */

.error-text { padding: 12px; font-weight: 600; }

/* ── Escritorio: marca a la izquierda y pestañas, 1120 px (spec §4.8) ─── */

@media (min-width: 1024px) {
  .shell-header { border-bottom: 1.5px solid var(--ink); }
  .shell-bar {
    display: flex;
    align-items: stretch;
    gap: 24px;
    max-width: 1120px;
    margin: 0 auto;
    padding: 0 var(--gutter);
  }
  .brand {
    display: flex;
    align-items: center;
    gap: 6px;
    min-height: 44px;
    font-size: 17px;
    font-weight: 800;
    color: var(--ink);
    text-decoration: none;
  }
  .brand-place { font-weight: 600; color: var(--mute); }
  .shell-bar .tabbar { margin-left: auto; }
  .shell-offline .notice { max-width: 1120px; }
}
```

Y pasar a `index.html` la cabecera y el esqueleto de la portada de `shell.js` (el guion falla, sin escribir nada, si el marcado del corte no es el esperado):

```bash
cd /home/manolo/claude/futbol-base
node --input-type=module <<'EOF'
import { readFileSync, writeFileSync } from 'node:fs';
import { renderHeader, skeleton } from './src/shell.js';
let page = readFileSync('index.html', 'utf8');
const bars = page.match(/<nav class="tabbar"/g) || [];
if (bars.length !== 1) throw new Error(`index.html debería tener una barra y tiene ${bars.length}`);
const header = /<header class="shell-header"[^>]*>[\s\S]*?<\/header>/;
const main = /(<main id="contenido" class="page"[^>]*>)[\s\S]*?(<\/main>)/;
if (!header.test(page) || !main.test(page)) throw new Error('faltan <header class="shell-header"> o <main id="contenido" class="page">');
page = page.replace(/[ \t]*<nav class="tabbar"[\s\S]*?<\/nav>\n?/, '');
page = page.replace(header, () => `<header class="shell-header">${renderHeader()}</header>`);
page = page.replace(main, (_, open, close) => `${open}\n    ${skeleton('home')}\n  ${close}`);
writeFileSync('index.html', page);
console.log('index.html: cabecera y esqueleto de la portada de shell.js');
EOF
```
Esperado:
```text
index.html: cabecera y esqueleto de la portada de shell.js
```
La barra queda dentro de la cabecera, detrás de la marca, y el resto de `index.html` (datos, `?v=`, «Última actualización» y el arranque) no cambia.

`test_rediseno_index.mjs` (Tarea 4) pasa a esperar en `main` el esqueleto de la portada de `shell.js`.

En `scripts/tests/test_rediseno_index.mjs`, sustituir:

```js
  assert.match(INDEX, /<main id="contenido" class="page" tabindex="-1">\s*<div class="box skeleton" aria-hidden="true"><\/div>\s*<\/main>/);
```

por:

```js
  assert.match(INDEX, /<main id="contenido" class="page" tabindex="-1">\s*<div class="skeleton-screen" data-skeleton="home" aria-busy="true">/);
```

- [ ] **Step 4: Run test to verify it passes**

```bash
cd /home/manolo/claude/futbol-base
node --test scripts/tests/test_rediseno_shell.mjs 2>&1 | grep -E '^# (tests|pass|fail)'
```
Esperado:
```text
# tests 11
# pass 11
# fail 0
```

- [ ] **Step 5: Suites completas y los tres smoke**

```bash
cd /home/manolo/claude/futbol-base
python3 -m pytest scripts/tests/ -q 2>&1 | tail -1
node --test scripts/tests/test_*.mjs 2>&1 | grep -E '^# (tests|pass|fail)'
```
Esperado:
- pytest: el mismo recuento que al terminar la tarea anterior, sin `failed` (esta tarea no añade pruebas de Python).
- node: el recuento anterior más 11, sin fallos (`# fail 0`).

Los tres smoke, como al terminar la Tarea 4: la barra sigue siendo la única `nav.tabbar`, ahora dentro de la cabecera, y la portada se pinta igual.

```bash
cd /home/manolo/claude/futbol-base
node scripts/tests/render-smoke.mjs
node scripts/tests/interaction-smoke.mjs
node scripts/tests/pwa-smoke.mjs 2>&1 | grep -v '^PWA fixture HTTP 404 /escudos/s/'
```
Esperado, con el tamaño del DOM del día:
```text
PASS: render smoke OK — Mi equipo en estado D (DOM 6529 bytes)
PASS: la portada carga a 320px en claro, sin desplazamiento horizontal
PASS: la portada carga a 320px en oscuro, sin desplazamiento horizontal
PASS: la portada carga a 390px en claro, sin desplazamiento horizontal
PASS: la portada carga a 390px en oscuro, sin desplazamiento horizontal
PASS: la portada carga a 768px en claro, sin desplazamiento horizontal
PASS: la portada carga a 768px en oscuro, sin desplazamiento horizontal
PASS: la portada carga a 1440px en claro, sin desplazamiento horizontal
PASS: la portada carga a 1440px en oscuro, sin desplazamiento horizontal
PASS: de la app anterior (su SW real) al rediseño, con datos congelados: la 1.ª apertura es la anterior; sin conexión a medias, el aviso con «Reintentar»; la 2.ª y la 3.ª, la nueva con acta.css y sin mezclar módulos; futbolbase-v20991231a funciona sin conexión
```

- [ ] **Step 6: Verificación visual (Chrome, fuera del repo)**

La vista previa se sirve desde memoria: una página con el marco de `shell.js` y `acta.css` (cabeceras de pantalla, aviso sin conexión, caja de error, aviso de redirección y los cinco esqueletos) y el `index.html` real con `app.js` bloqueado, para ver el esqueleto estático. Mide el desplazamiento horizontal, el alto de la cabecera de la app y de las de pantalla, si la barra es fija y si la marca se ve, y lo pulsable de menos de 44 px.

```bash
cd /home/manolo/claude/futbol-base
S=/tmp/claude-1000/-home-manolo/db6fd8e0-f1e7-4e94-b6cd-ef7dd5bf6ae9/scratchpad/planB2
mkdir -p "$S"
cat > "$S/t5-preview.mjs" <<'EOF'
// Vista previa de la Tarea 5: el marco (cabecera, barra, aviso sin conexión, cabeceras de pantalla,
// esqueletos y caja de error) con acta.css, y la portada real de index.html.
// Uso, desde la raíz del repo (con Playwright en node_modules, Tarea 4): OUT=<dir> node <este fichero>
import { createServer } from 'node:http';
import { createRequire } from 'node:module';
import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import { extname, join, normalize, sep } from 'node:path';
import { pathToFileURL } from 'node:url';

const out = process.env.OUT;
if (!out) { console.error('Falta OUT=<directorio de capturas>'); process.exit(2); }
mkdirSync(out, { recursive: true });
const root = process.cwd();
const imp = (p) => import(pathToFileURL(join(root, p)).href);
const shell = await imp('src/shell.js');
const ui = await imp('src/ui.js');
const { html } = await imp('src/html.js');
const { findChrome } = await imp('scripts/tests/render-smoke.mjs');
const { chromium } = createRequire(join(root, 'scripts/tests/x.mjs'))('playwright');

const SHIELDS = { 'Las Mesas Hu.': 'lasMesasEscudo.png', 'AD Huracán': 'huracan.png' };
const label = (t) => html`<p style="margin:28px 0 4px;font-size:11.5px;color:var(--mute)">${t}</p>`;
function page(view) {
  const header = String(shell.renderHeader({ active: view === 'heads' ? 'jornada' : 'miequipo', current: view === 'heads' ? 'true' : 'page' }))
    .replace('<div class="shell-offline" role="status"></div>', `<div class="shell-offline" role="status">${shell.offlineNotice({ lastDataChange: '2026-09-23' }, '23/09/2026')}</div>`);
  const body = view === 'heads'
    ? html`${ui.screenHead('Las Mesas Hu.', { sub: 'Prebenjamín, Grupo 2 de Gran Canaria', crest: ui.crest('Las Mesas Hu.', { size: 46, shields: SHIELDS, lazy: false }), action: { href: '#/explorar', label: 'Cambiar' } })}
      ${label('Partido: «‹» y Compartir')}${ui.screenHead('Partido', { sub: 'Jornada 15, Grupo 2 de Gran Canaria', back: '#/jornada?g=PG2', action: html`<button class="screen-action" type="button" data-action="share">Compartir</button>` })}
      ${label('Nombre largo a 320 px')}${ui.screenHead('VILLA DE SANTA BRIGIDA, U.D. "A"', { sub: 'Benjamín, Segunda Fase A, Grupo 2 de Gran Canaria', action: { href: '#/ligas', label: 'Otro grupo' } })}
      ${label('Error de carga')}${shell.errorScreen({ screenId: 'tabla', title: 'Tabla', what: 'la temporada 2024/25', back: null })}
      ${label('Aviso de redirección')}${ui.screenHead('Ligas', { back: '#/explorar' })}${shell.routeNotice('Elige tu equipo en Mi equipo')}`
    : html`${shell.skeleton('home')}${label('jornada')}${shell.skeleton('jornada')}${label('tabla')}${shell.skeleton('tabla')}${label('partido')}${shell.skeleton('partido')}${label('pendiente')}${shell.skeleton('pendiente')}`;
  return `<!DOCTYPE html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
    <title>Vista previa T5</title><link rel="stylesheet" href="/acta.css"></head><body>
    <a class="skip-link" href="#contenido">Saltar al contenido</a><header class="shell-header">${header}</header>
    <main id="contenido" class="page">${body}</main></body></html>`;
}

const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg', '.woff2': 'font/woff2', '.svg': 'image/svg+xml' };
const server = createServer((req, res) => {
  const url = new URL(req.url, 'http://x');
  if (url.pathname === '/__shell.html') {
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    return res.end(page(url.searchParams.get('view') || 'skeletons'));
  }
  let fp = normalize(join(root, decodeURIComponent(url.pathname === '/' ? '/index.html' : url.pathname)));
  const thumb = url.pathname.match(/^\/escudos\/s\/(.+)\.png$/);
  if (thumb) fp = ['png', 'jpg'].map((x) => join(root, 'escudos', `${decodeURIComponent(thumb[1])}.${x}`)).find(existsSync) || fp;
  if (!fp.startsWith(root + sep) || !existsSync(fp)) { res.statusCode = 404; return res.end('no'); }
  res.setHeader('Content-Type', MIME[extname(fp)] || 'application/octet-stream');
  res.end(readFileSync(fp));
}).listen(0, '127.0.0.1');
await new Promise((resolve) => server.once('listening', resolve));
const base = `http://127.0.0.1:${server.address().port}`;

const browser = await chromium.launch({ executablePath: findChrome() });
const problems = [];
const measure = () => {
  const box = (sel) => [...document.querySelectorAll(sel)].map((e) => Math.round(e.getBoundingClientRect().height));
  const bar = document.querySelector('.tabbar');
  return {
    overflow: document.documentElement.scrollWidth - innerWidth,
    header: Math.round(document.querySelector('.shell-header').getBoundingClientRect().height),
    bar: getComputedStyle(bar).position,
    brand: getComputedStyle(document.querySelector('.brand')).display,
    heads: box('.screen-head'),
    small: [...document.querySelectorAll('a, button')].filter((e) => e.offsetParent && !e.classList.contains('skip-link'))
      .map((e) => [e.className || e.tagName, Math.round(e.getBoundingClientRect().height)]).filter(([, px]) => px < 44),
  };
};
for (const [w, h, scheme, view] of [[390, 844, 'light', 'skeletons'], [390, 844, 'dark', 'skeletons'], [390, 844, 'light', 'heads'],
  [390, 844, 'dark', 'heads'], [320, 700, 'light', 'heads'], [1440, 900, 'light', 'heads'], [1440, 900, 'light', 'skeletons']]) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, colorScheme: scheme, reducedMotion: 'reduce' });
  const p = await ctx.newPage();
  p.on('pageerror', (e) => problems.push(`${w}px ${scheme} ${view}: ${e.message}`));
  await p.goto(`${base}/__shell.html?view=${view}`, { waitUntil: 'networkidle' });
  const m = await p.evaluate(measure);
  console.log(`${w}px ${scheme} ${view}:`, JSON.stringify(m));
  if (m.overflow > 0) problems.push(`${w}px ${view}: desplazamiento horizontal de ${m.overflow}px`);
  if (m.small.length) problems.push(`${w}px ${view}: pulsables de menos de 44px: ${JSON.stringify(m.small)}`);
  if (m.heads.some((px) => px < 72)) problems.push(`${w}px ${view}: cabecera de pantalla de menos de 72 px`);
  await p.screenshot({ path: `${out}/t5-${w}-${scheme}-${view}.png`, fullPage: true });
  await ctx.close();
}
// La portada real (index.html del corte con la cabecera de la Tarea 5), antes y después del JS.
for (const [w, h, scheme] of [[390, 844, 'light'], [1440, 900, 'light']]) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, colorScheme: scheme, serviceWorkers: 'block', timezoneId: 'Atlantic/Canary' });
  const p = await ctx.newPage();
  p.on('pageerror', (e) => problems.push(`index ${w}px: ${e.message}`));
  // app.js sin pintar nada: index.html importa start, y aquí no hace nada (el esqueleto estático se queda).
  await p.route('**/src/app.js*', (route) => route.fulfill({ contentType: 'text/javascript', body: 'export function start() {}' }));
  await p.goto(`${base}/index.html`, { waitUntil: 'networkidle' });
  const m = await p.evaluate(measure);
  console.log(`index ${w}px (esqueleto estático):`, JSON.stringify(m));
  await p.screenshot({ path: `${out}/t5-index-${w}-esqueleto.png` });
  await ctx.close();
}
await browser.close();
server.close();
console.log(problems.length ? 'PROBLEMAS:\n' + problems.join('\n') : `OK: sin errores; capturas en ${out}/t5-*.png`);
process.exit(problems.length ? 1 : 0);
EOF
OUT="$S/shots-t5" node "$S/t5-preview.mjs"
```
Esperado (el orden de las claves es fijo):
```text
390px light skeletons: {"overflow":0,"header":35,"bar":"fixed","brand":"none","heads":[72,72,72,72,72],"small":[]}
390px dark skeletons: {"overflow":0,"header":35,"bar":"fixed","brand":"none","heads":[72,72,72,72,72],"small":[]}
390px light heads: {"overflow":0,"header":35,"bar":"fixed","brand":"none","heads":[72,72,85,72,72],"small":[]}
390px dark heads: {"overflow":0,"header":35,"bar":"fixed","brand":"none","heads":[72,72,85,72,72],"small":[]}
320px light heads: {"overflow":0,"header":35,"bar":"fixed","brand":"none","heads":[85,85,85,72,72],"small":[]}
1440px light heads: {"overflow":0,"header":84,"bar":"static","brand":"flex","heads":[72,72,72,72,72],"small":[]}
1440px light skeletons: {"overflow":0,"header":84,"bar":"static","brand":"flex","heads":[72,72,72,72,72],"small":[]}
index 390px (esqueleto estático): {"overflow":0,"header":0,"bar":"fixed","brand":"none","heads":[72],"small":[]}
index 1440px (esqueleto estático): {"overflow":0,"header":49,"bar":"static","brand":"flex","heads":[72],"small":[]}
OK: sin errores; capturas en /tmp/claude-1000/-home-manolo/db6fd8e0-f1e7-4e94-b6cd-ef7dd5bf6ae9/scratchpad/planB2/shots-t5/t5-*.png
```
- `header` es el alto de la cabecera de la app: 35 px en móvil y 84 px en escritorio con el aviso sin conexión, que la vista previa pinta siempre; sin aviso, 0 y 49 px (líneas `index`).
- Las cabeceras de 85 px son las de etiqueta en dos líneas («Benjamín, Segunda Fase A, Grupo 2 de Gran Canaria» y, a 320 px, también las otras dos).

Abrir con Read `t5-390-light-heads.png`, `t5-390-dark-heads.png`, `t5-320-light-heads.png`, `t5-1440-light-heads.png`, `t5-390-light-skeletons.png`, `t5-index-390-esqueleto.png` y `t5-index-1440-esqueleto.png`, y comprobar:
- **Cabecera de pantalla:** h1 en texto de peso 800, etiqueta en `--mute` debajo y regla de tinta de 2 px de borde a borde de la pantalla; «Cambiar», «Otro grupo» y «Compartir» en tinta y subrayados; «‹» en tinta a la izquierda de «Partido»; a 320 px, 'VILLA DE SANTA BRIGIDA, U.D. "A"' cortado con elipsis y la etiqueta en dos líneas.
- **Aviso sin conexión:** «**Sin conexión.** Datos del 23/09/2026» arriba del todo, sobre una regla fina.
- **Caja de error:** borde de tinta, el texto en peso 600 y «Reintentar» relleno de tinta a todo el ancho; en oscuro, tinta clara con texto oscuro.
- **Esqueletos:** gris plano sin movimiento, con cajas de borde `--line`; el de la portada, con círculo de escudo.
- **Escritorio (1440 px):** «**Fútbol base** Las Palmas» a la izquierda y las 4 pestañas a la derecha, dentro de 1120 px, con la activa subrayada en tinta y una regla de tinta bajo la cabecera. En móvil, ninguna marca arriba y la barra abajo.

- [ ] **Step 7: Commit**

```bash
cd /home/manolo/claude/futbol-base
git add src/shell.js acta.css index.html scripts/tests/test_rediseno_shell.mjs scripts/tests/test_rediseno_index.mjs
git commit -F - <<'EOF'
feat(rediseño): marco de la app: cabecera, barra, aviso sin conexión, esqueletos y error (B2, tarea 5)

shell.js: la cabecera con la marca y la barra de 4 destinos (en escritorio,
marca y pestañas a 1120 px; en móvil y tableta, barra fija abajo),
updateTabbar para aria-current («page» en el destino de la pantalla y
«true» en las secundarias), el aviso «Sin conexión. Datos del …», los
esqueletos con las medidas de cada pantalla, la caja «No se pudieron
cargar los datos de <qué>» con Reintentar (bajo screenHead de ui.js) y
el aviso de las redirecciones. index.html lleva la cabecera y el
esqueleto de la portada de shell.js, y la marca provisional del corte
se va de acta.css.

- test_rediseno_shell: marcado de cada pieza, aria-current, fechas del
  aviso, CSS de intención y la cabecera y el esqueleto de index.html.

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01Sg56KK3oZgo8Ye7Snj6wG9
EOF
git show --stat --oneline HEAD | tail -1
```
Esperado: `5 files changed`, con `index.html`, `scripts/tests/test_rediseno_index.mjs`, `scripts/tests/test_rediseno_shell.mjs`, `src/shell.js` y `acta.css`.

---

### Task 6: `router.js`: valores por defecto de §4.1, historial, token de navegación, desplazamiento y foco (spec §4.1, §5.1, §7 y §8)

El router que pinta cada ruta con `{ needs, render, mount }`; `app.js` pasa a usarlo, y las rutas de B3 llevan la pantalla provisional (decisión 6).

**Contexto**
- **Funciones puras**, probadas con las fixtures congeladas:
  - `resolveParams(route, ctx)` aplica los valores por defecto y las redirecciones de §4.1:
    - `s` es `PORTAL.season`; una temporada que no está en `SEASONS` se quita (la misma pantalla, sin `s`), con el aviso «No existe la temporada 1999/00; te enseñamos la actual».
    - `g` en Jornada y Tabla: el grupo resuelto de mi equipo. En una temporada pasada, el primer grupo de liga de la categoría de mi equipo con su nombre (en el orden del modelo); si no hay, `#/ligas?s&c&to` con «Las Mesas Hu. no aparece en la temporada 2023/24».
    - Con E o X (mi equipo sin resolver), Jornada y Tabla sin `g` van a `#/ligas?to=jornada|tabla` de la temporada actual, con «Elige tu equipo en Mi equipo». Con `g` en el enlace se abren igual.
    - Un grupo que no es de liga (`kind ≠ 'league'`, también los torneos MC\* de `model.cups()`) lleva a `#/copa?s&g`.
    - Un grupo que no existe lleva a `#/ligas?s&c&to`, con «No encontramos el grupo LZS1 en la temporada 2025/26» (el riesgo aceptado de §4.1 para los enlaces antiguos).
    - Una vista de Tabla que no existe se quita, sin aviso. Una jornada vale por su clave (`Round.key`) o por su número (`r=30`, las claves `'1'`…`'14'` de PFV2): `findRound`, nueva en `model.js`; si no, se quita, sin aviso.
    - Partido: vale si `findMatch` (nueva en `model.js`) lo encuentra: en su ronda y, si ahí no está, el único partido de `h` contra `a` del grupo. Si no, a su jornada (o a `#/jornada`), con «No encontramos ese partido». Así el router no descarta lo que las pantallas saben leer (B7 de la revisión adversarial): Jornada y Partido usan las mismas dos funciones.
    - Equipo sin `g`: `#/explorar?q=<t>`, como la tabla de enlaces antiguos.
    - En una temporada pasada todavía sin cargar devuelve `{ params, pending: true }`: el router carga con `needs` y vuelve a resolver.
    - Los valores por defecto no se escriben en la dirección: `#/jornada` sigue siendo «la jornada de mi equipo». Solo las redirecciones (y los enlaces antiguos) usan `replaceState`.
  - `historyMode(from, to)`: `'replace'` si solo cambian la jornada (`r`), la vista de Tabla (`v`) o la búsqueda (`q` en Explorar y Goleadores), o nada; `'push'` en cualquier otro caso. El router compara las rutas ya resueltas.
  - `parentOf(route)`: Partido → `#/jornada?s&g&r`; Equipo, Copa, Goleadores, Ligas, Temporadas, Récords, Fuentes y Ajustes → `#/explorar`; los destinos principales, `null`.
  - `activeTab(route, lastPrimary, isMine)` → `{ active, current }`, fila a fila de §4.1, y `routeIsMine(route, resolution)`, que dice si un partido o una ficha son de mi equipo (mismo grupo, temporada y nombre).
- **`startRouter`**, la parte con DOM, recibe `window` (en las pruebas, uno falso):
  - **Historial.** Cada entrada de la app lleva `{ fbIdx, fbKey }`. `fbIdx > 0` dice que la anterior es de la app: «‹» hace `history.back()`; si no, sigue su enlace al padre (`pushState`). Los enlaces `#/…` se atienden por delegación en el documento, con `pushState` o `replaceState` según `historyMode`. `hashchange` y `popstate` llegan juntos y se atiende uno; un hash escrito a mano es una entrada nueva de la app.
  - **Enlaces antiguos.** `translateLegacy` con `replaceState`, antes de nada, y sin entrada nueva. La ruta traducida conserva la temporada del enlace (`s`), aunque sea la del portal, y `section=miequipo` con mi equipo (el mismo nombre, o el mismo club en el mismo grupo, el guardado o el resuelto) abre Mi equipo y no su ficha: es la URL que la app anterior escribía en cada carga, así que una pestaña abierta o un marcador de antes vuelven a la portada (M3 de la revisión). Con otro equipo, su ficha, como dice §4.1.
  - **Token.** Cada navegación incrementa el token: con `needs` pendientes se pinta `skeleton(screen.id)`, y el resultado solo se pinta si el token sigue vigente. Una respuesta lenta, o un error, nunca pinta sobre otra ruta.
  - **Orden.** `needs` → `render` → `mount`. `needs(params, datasets, { portalSeason })` recibe la temporada del portal del contexto (`ctx.portal.season`): ninguna pantalla la lee de `config.js` (R2-1 de la segunda ronda de la revisión). `render` tiene que devolver `Html` (si no, caja de error): solo se pinta lo que ha pasado por la plantilla con escapado automático (§5.1). `mount` puede devolver una limpieza, que se llama justo antes del siguiente pintado. Si `mount` navega (`nav.go`, `saveMyTeam`…), manda esa navegación.
  - **Error.** Si `needs` rechaza, o algo lanza, `errorScreen` con «No se pudieron cargar los datos de <qué>»: `<qué>` es el `what` del error o el mensaje de un `Error` simple (`Error('la temporada 2024/25')`, como el `seasonNeeds` del borrador de la Tarea 9); un fallo de programación dice «esta pantalla». «Reintentar» vuelve a pintar la ruta (los `ensure*` limpian su vuelo al fallar).
  - **Desplazamiento.** `history.scrollRestoration = 'manual'`: arriba al avanzar; al volver, el que tenía esa entrada; al cambiar de jornada o de vista, el mismo; un ancla tras un segundo `#` (`#/equipo?…#calendario`, B3) manda al avanzar.
  - **Foco.** Al `h1` (con `tabindex="-1"`) en cada navegación salvo la carga inicial; al cambiar de jornada o de vista, vuelve al control pulsado si el nuevo tiene el mismo `id`. «Saltar al contenido» y las anclas internas mueven el foco sin cambiar la ruta.
  - **Barra y título.** `updateTabbar` con `activeTab`; el último destino principal (`lastPrimary`) es el de la sesión (`session`, Tarea 12). `document.title` pasa a «Jornada · Fútbol Base Las Palmas».
  - **Aviso de redirección.** `routeNotice` detrás del primer `</header>` de la pantalla de destino (o de su `h1`).
- **Contexto de las pantallas.** `getContext()` (de `app.js`) da los datos: `{ model, myTeam, resolution, today, health, datasets, portal, legacyDate }`. El router añade `route` y `params` (resueltos: `s` siempre, y `g` en Jornada y Tabla), `lastPrimary` y `backHref`, el href del «‹» (`null` en los destinos principales).
- **`app.js`** exporta `start(doc, win)`, que llama `index.html` desde el corte: crea el registro de datos, el modelo (con `buildClubIndex` inyectado) y el almacén una vez, y `getContext()` resuelve mi equipo con el «hoy» de Canarias de cada pintado. Sigue exportando `startContext`, el mismo contexto construido desde un almacén, con el que las pruebas de las pantallas montan su `ctx`.
- **`nav`**: `go(screen, params)` (con `historyMode`), `replace(screen, params)`, `back()`, `retry()` y `saveMyTeam(myTeam)`, que llama a `actions.saveMyTeam` y vuelve a pintar la ruta.
- **`screens.js`** es el registro ruta → pantalla que `app.js` pasa al router: Mi equipo, y la provisional en las demás. La Tarea 12 añade Jornada, Tabla y Partido. Vive aparte para que las pruebas del registro no arrastren el arranque, y B3 solo toca esta lista.
- **`sw.js`**: `STATIC_ASSETS` cubre el grafo nuevo de `app.js` (lo comprueba `test_sw_fixes.mjs`).

**Files:**
- Create: `src/router.js`, `src/screen-pendiente.js` y `src/screens.js`.
- Modify: `src/app.js` (entero), `sw.js` (`STATIC_ASSETS`), `src/links.js` (`translateLegacy`) y `src/model.js` (`findRound` y `findMatch`, al final).
- Test: `scripts/tests/test_rediseno_router.mjs` (nuevo) y `scripts/tests/test_rediseno_links.mjs` (los enlaces antiguos conservan `s`).

**Interfaces:**
- Consumes:
  - `SCREENS`, `parseRoute`, `routeHref`, `translateLegacy` (`links.js`); `Html` (`html.js`); `skeleton`, `errorScreen`, `routeNotice`, `routeTitle` y `updateTabbar` (`shell.js`, Tarea 5); `screenHead`, `empty` y `crestFallback` (`ui.js`); `seasonLabel` (`model.js`, Tarea 4); `jornadaNumber` (`state.js`); `sameClub` (`myteam.js`).
  - Del corte: `readGlobals()` (`state.js`), `createModel(datasets, { portalSeason, buildClubIndex })` (`model.js`, con `season(name)` a `null` mientras una temporada pasada no está en `datasets.seasonRaw`), `canaryTodayISO(now, timeZone)` (`links.js`), `buildClubIndex` y `resolveMyTeam` (`myteam.js`), `loadStore` (`store.js`) y `screen` de `screen-home.js`.
- Produces:

```js
// router.js
export function resolveParams(route, ctx)       // → { params, pending? } | { redirect: { screen, params, notice } }
  // ctx: { portal: { season }, model, resolution, myTeam, datasets: { seasons } }
// model.js
export function findRound(group, r)             // → Round | null: la de clave r o, si no hay, la del mismo número
export function findMatch(group, { r, h, a })   // → Match | null: en findRound(group, r) o, si ahí no está, el único h–a del grupo
// links.js (B1), cambia la firma
export function translateLegacy(hash, { isMine } = {})   // conserva la `season` del enlace como `s`; 'miequipo' con
  // isMine(team, group) → '#/'; con otro equipo, su ficha
export function historyMode(from, to)           // → 'push' | 'replace'
export function parentOf(route)                 // → { screen, params } | null
export function activeTab(route, lastPrimary, isMine)   // → { active: 'miequipo'|'jornada'|'tabla'|'explorar', current: 'page'|'true' }
export function routeIsMine(route, resolution)  // → boolean
export function startRouter({ screens, root, getContext, window, actions = {}, session = null })
  // → { nav, idle() → Promise del último pintado, current() → ruta resuelta }
  // ctx de render y mount: { ...getContext(), route, params, lastPrimary, backHref }
  // nav: { go(screen, params), replace(screen, params), back(), retry(), saveMyTeam(myTeam) }
// screen-pendiente.js
export const screen = { id: 'pendiente', needs: () => [], render(ctx) }   // <section data-screen="pendiente" data-route="<ruta>">, h1 y vacío
// screens.js
export const SCREEN_MAP   // { <cada ruta de SCREENS>: screen }, congelado
// app.js
export function startContext({ storage, portal, datasets, today })   // el ctx sin la ruta, desde un almacén (pruebas)
export function start(doc, win)   // → lo que devuelve startRouter; lo llama index.html
```

- [ ] **Step 1: Write the failing test**

Crear `scripts/tests/test_rediseno_router.mjs`:

```js
// Plan B2, tarea 6: el router (spec §4.1, §5.1, §7 y §8). Funciones puras sobre las fixtures
// congeladas y startRouter con un window y un document falsos: token de navegación con promesas
// controladas, enlaces antiguos, historial, «‹», desplazamiento, foco y Reintentar.
import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { fixture } from './fixtures/rediseno/load.mjs';
import { buildSeason, buildCups, findRound, findMatch } from '../../src/model.js';
import { buildClubIndex } from '../../src/myteam.js';
import { teamNames } from './fixtures/rediseno/simulate.mjs';
import { html } from '../../src/html.js';
import { SCREENS, parseRoute, routeHref } from '../../src/links.js';
import { routeTitle } from '../../src/shell.js';
import { resolveParams, historyMode, parentOf, activeTab, routeIsMine, startRouter } from '../../src/router.js';
import { screen as pendiente } from '../../src/screen-pendiente.js';
import { SCREEN_MAP } from '../../src/screens.js';

const PORTAL = '2025-2026';
const raw = fixture('current-2025-2026');
const current = buildSeason({ name: raw.season, current: true, ...raw });
const pastRaw = fixture('historical-2024-2025');
const past = buildSeason({ name: pastRaw.season, current: false, benjamin: pastRaw.benjamin, prebenjamin: pastRaw.prebenjamin });
const cups = buildCups({ season: '2025-2026', ...fixture('cups-2025-2026') });
const SEASONS = [{ name: '2025-2026', current: true }, { name: '2024-2025', current: false }];
const group = (id) => current.groups.find((g) => g.id === id);
const MY_TEAM = { name: 'Las Mesas Hu.', season: PORTAL, cat: 'prebenjamin', groupId: 'PG2' };
const OK = { status: 'ok', group: group('PG2'), name: 'Las Mesas Hu.', cat: 'prebenjamin' };
const ASK = { status: 'ask', candidates: [{ group: group('PG2'), name: 'Las Mesas Hu.', cat: 'prebenjamin' }] };
// PG2, jornada 30: Las Mesas Hu. 2–7 AD Huracán y Acodetti 12–1 Santa Brígida.
const J30 = '#/partido?g=PG2&r=Jornada%2030&h=Las%20Mesas%20Hu.&a=AD%20Hurac%C3%A1n';
const OTHER = '#/partido?g=PG2&r=Jornada%2030&h=Acodetti&a=Santa%20Br%C3%ADgida';

// Índice de clubes con un nombre más de Las Mesas Hu. (sin punto), del mismo club.
const INDEX = buildClubIndex([...teamNames(current, cups), 'Las Mesas Hu'], fixture('shields'));
// Modelo con el contrato de createModel: la temporada pasada solo existe cuando está en `loaded`,
// que se lee en cada llamada (una carga de needs lo amplía).
function model(loaded = []) {
  const seasons = () => ({ [PORTAL]: current, ...(loaded.includes('2024-2025') ? { '2024-2025': past } : {}) });
  return {
    season: (name) => seasons()[name] || null,
    group: (season, id) => seasons()[season]?.groups.find((g) => g.id === id) || null,
    cups: () => cups,
    clubIndex: () => INDEX,
  };
}
function context({ resolution = OK, loaded = [] } = {}) {
  return () => ({
    portal: { season: PORTAL, defaultTeam: { cat: 'prebenjamin', groupId: 'PG2', name: 'Las Mesas Hu.' } },
    model: model(loaded), resolution, myTeam: MY_TEAM, today: '2026-09-23', health: null,
    datasets: { seasons: SEASONS, seasonRaw: {} },
  });
}
const resolve = (hash, options) => resolveParams(parseRoute(hash), context(options)());
// Una redirección como [href, aviso]; así se lee igual que en la barra de direcciones.
const target = (res) => (res.redirect ? [routeHref(res.redirect.screen, res.redirect.params), res.redirect.notice] : res);

// ── resolveParams: cada fila de §4.1 ─────────────────────────────────────

test('Mi equipo, Temporadas, Fuentes y Ajustes no llevan parámetros', () => {
  for (const hash of ['#/', '#/?g=PG2', '#/temporadas', '#/fuentes?x=1', '#/ajustes']) assert.deepEqual(resolve(hash), { params: {} }, hash);
});

test('Jornada y Tabla: s es la temporada del portal y g, el grupo resuelto de mi equipo', () => {
  assert.deepEqual(resolve('#/jornada'), { params: { s: PORTAL, g: 'PG2' } });
  assert.deepEqual(resolve('#/tabla?v=forma'), { params: { v: 'forma', s: PORTAL, g: 'PG2' } });
  assert.deepEqual(resolve('#/jornada?g=PG3&r=Jornada%203'), { params: { g: 'PG3', r: 'Jornada 3', s: PORTAL } });
  assert.deepEqual(resolve('#/tabla?s=2025-2026&g=A2'), { params: { s: PORTAL, g: 'A2' } });
});

test('una vista de Tabla o una jornada que no existen se quitan (replaceState, sin aviso); la jornada vale por su número', () => {
  assert.deepEqual(target(resolve('#/tabla?g=PG2&v=rara')), ['#/tabla?g=PG2', null]);
  assert.deepEqual(target(resolve('#/jornada?r=Jornada%2099')), ['#/jornada', null]);
  assert.deepEqual(target(resolve('#/jornada?g=A2&r=Jornada%2030')), ['#/jornada?g=A2', null], 'A2 tiene 22 jornadas');
  // Un enlace escrito a mano con el número: la pantalla lo lee (findRound), y el router no lo quita.
  assert.deepEqual(resolve('#/jornada?g=PG2&r=30'), { params: { g: 'PG2', r: '30', s: PORTAL } });
});

test('findRound y findMatch: la ronda por clave o número; el partido en su ronda o, si no, el único h–a del grupo', () => {
  const pg2 = group('PG2');
  assert.equal(findRound(pg2, 'Jornada 30').key, 'Jornada 30');
  assert.equal(findRound(pg2, '30').key, 'Jornada 30');
  assert.equal(findRound(pg2, 'J30').key, 'Jornada 30');
  assert.equal(findRound(pg2, 'Jornada 99'), null);
  assert.equal(findRound(pg2, ''), null);
  const mesas = { h: 'Las Mesas Hu.', a: 'AD Huracán' };
  assert.equal(findMatch(pg2, { r: 'Jornada 30', ...mesas }).dateISO, '2026-06-02');
  assert.equal(findMatch(pg2, { r: '30', ...mesas }).dateISO, '2026-06-02');
  assert.equal(findMatch(pg2, { r: 'Jornada 3', ...mesas }).dateISO, '2026-06-02', 'otra jornada: el único Las Mesas–Huracán');
  assert.equal(findMatch(pg2, mesas).dateISO, '2026-06-02');
  assert.equal(findMatch(pg2, { r: 'Jornada 30', h: 'AD Huracán', a: 'Las Mesas Hu.' }).dateISO, '2026-02-12', 'el de la ida, J15');
  assert.equal(findMatch(pg2, { r: 'Jornada 30', h: 'x', a: 'y' }), null);
});

test('temporada pasada: sin cargar queda pendiente; cargada, el primer grupo de liga de mi categoría con su nombre', () => {
  assert.deepEqual(resolve('#/tabla?s=2024-2025'), { params: { s: '2024-2025' }, pending: true });
  assert.deepEqual(resolve('#/tabla?s=2024-2025', { loaded: ['2024-2025'] }), { params: { s: '2024-2025', g: 'PGC2' } });
  // En benjamín de 2024-25 (P1) Las Mesas Hu. no jugó: a Ligas de esa temporada y categoría.
  const benjamin = { status: 'ok', group: group('A2'), name: 'Las Mesas Hu.', cat: 'benjamin' };
  assert.deepEqual(target(resolve('#/jornada?s=2024-2025', { loaded: ['2024-2025'], resolution: benjamin })),
    ['#/ligas?s=2024-2025&c=benjamin&to=jornada', 'Las Mesas Hu. no aparece en la temporada 2024/25']);
});

test('con E o X, Jornada y Tabla abren #/ligas de la temporada actual con «Elige tu equipo en Mi equipo»', () => {
  for (const resolution of [ASK, { status: 'absent' }]) {
    assert.deepEqual(target(resolve('#/jornada', { resolution })), ['#/ligas?to=jornada', 'Elige tu equipo en Mi equipo']);
    assert.deepEqual(target(resolve('#/tabla?v=goles', { resolution })), ['#/ligas?to=tabla', 'Elige tu equipo en Mi equipo']);
    // Con el grupo en el enlace, la pantalla se abre igual.
    assert.deepEqual(resolve('#/tabla?g=PG3', { resolution }), { params: { g: 'PG3', s: PORTAL } });
  }
});

test('un grupo que no es de liga lleva a #/copa (liguilla y cuadro de la Maspalomas Cup)', () => {
  assert.equal(cups.groups.find((g) => g.id === 'MCP3').kind, 'cup-league');
  assert.equal(cups.groups.find((g) => g.id === 'MCPK1').kind, 'cup-bracket');
  assert.deepEqual(target(resolve('#/tabla?g=MCP3')), ['#/copa?g=MCP3', null]);
  assert.deepEqual(target(resolve('#/jornada?g=MCPK1&r=Final')), ['#/copa?g=MCPK1', null]);
});

test('grupo que no existe: a #/ligas con aviso; temporada desconocida: se quita, con aviso', () => {
  assert.deepEqual(target(resolve('#/tabla?g=LZS1')), ['#/ligas?c=prebenjamin&to=tabla', 'No encontramos el grupo LZS1 en la temporada 2025/26']);
  assert.deepEqual(target(resolve('#/tabla?s=2024-2025&g=PG2', { loaded: ['2024-2025'] })),
    ['#/ligas?s=2024-2025&c=prebenjamin&to=tabla', 'No encontramos el grupo PG2 en la temporada 2024/25']);
  assert.deepEqual(target(resolve('#/tabla?s=1999-2000&g=PG2')), ['#/tabla?g=PG2', 'No existe la temporada 1999/00; te enseñamos la actual']);
});

test('Explorar, Ligas, Copa, Goleadores y Récords: la temporada por defecto y sus parámetros', () => {
  assert.deepEqual(resolve('#/explorar?q=Mesas'), { params: { q: 'Mesas', s: PORTAL } });
  assert.deepEqual(resolve('#/ligas?c=benjamin&i=grancanaria&f=segunda-fase-a&to=tabla'),
    { params: { c: 'benjamin', i: 'grancanaria', f: 'segunda-fase-a', to: 'tabla', s: PORTAL } });
  assert.deepEqual(resolve('#/copa?g=MCPK1'), { params: { g: 'MCPK1', s: PORTAL } });
  assert.deepEqual(resolve('#/goleadores?s=2024-2025&c=prebenjamin'), { params: { s: '2024-2025', c: 'prebenjamin' } });
  assert.deepEqual(resolve('#/records?c=benjamin'), { params: { c: 'benjamin', s: PORTAL } });
});

test('Partido: vale si findMatch lo encuentra (su ronda, o el único h–a del grupo); si no, a su jornada con aviso', () => {
  assert.deepEqual(resolve(J30), { params: { g: 'PG2', r: 'Jornada 30', h: 'Las Mesas Hu.', a: 'AD Huracán', s: PORTAL } });
  // Por su número, o con otra jornada pero un único Huracán–Las Mesas en el grupo (J15): la pantalla lo lee.
  assert.deepEqual(resolve('#/partido?g=PG2&r=30&h=Las%20Mesas%20Hu.&a=AD%20Hurac%C3%A1n'), { params: { g: 'PG2', r: '30', h: 'Las Mesas Hu.', a: 'AD Huracán', s: PORTAL } });
  assert.deepEqual(resolve('#/partido?g=PG2&r=Jornada%2030&h=AD%20Hurac%C3%A1n&a=Las%20Mesas%20Hu.'),
    { params: { g: 'PG2', r: 'Jornada 30', h: 'AD Huracán', a: 'Las Mesas Hu.', s: PORTAL } });
  // CD Batán se retiró: sus partidos no están en el calendario.
  assert.deepEqual(target(resolve('#/partido?g=PG2&r=Jornada%2030&h=Telde&a=CD%20Bat%C3%A1n')),
    ['#/jornada?g=PG2&r=Jornada%2030', 'No encontramos ese partido']);
  assert.deepEqual(target(resolve('#/partido?g=PG2&r=Jornada%2099&h=x&a=y')), ['#/jornada?g=PG2', 'No encontramos ese partido']);
  assert.deepEqual(target(resolve('#/partido?h=x&a=y')), ['#/jornada', 'No encontramos ese partido']);
  assert.deepEqual(resolve('#/partido?s=2024-2025&g=PGC2&r=Jornada%201&h=x&a=y'),
    { params: { s: '2024-2025', g: 'PGC2', r: 'Jornada 1', h: 'x', a: 'y' }, pending: true });
});

test('Equipo: g es obligatorio; sin él, el equipo se busca en Explorar', () => {
  assert.deepEqual(resolve('#/equipo?g=PG2&t=Las%20Mesas%20Hu.'), { params: { g: 'PG2', t: 'Las Mesas Hu.', s: PORTAL } });
  assert.deepEqual(target(resolve('#/equipo?t=Las%20Mesas%20Hu.')), ['#/explorar?q=Las%20Mesas%20Hu.', null]);
  assert.deepEqual(target(resolve('#/equipo?g=ZZ9&t=X')), ['#/explorar?q=X', 'No encontramos el grupo ZZ9 en la temporada 2025/26']);
});

// ── historyMode, parentOf, activeTab y routeIsMine ───────────────────────

test('historyMode: cambiar de pantalla es push; jornada, vista de Tabla o búsqueda, replace', () => {
  const R = parseRoute;
  assert.equal(historyMode(null, R('#/tabla')), 'push');
  assert.equal(historyMode(R('#/'), R('#/jornada')), 'push');
  assert.equal(historyMode(R('#/jornada?g=PG2&r=Jornada%201'), R('#/jornada?g=PG2&r=Jornada%202')), 'replace');
  assert.equal(historyMode(R('#/jornada?g=PG2'), R('#/jornada?g=PG2&r=Jornada%202')), 'replace');
  assert.equal(historyMode(R('#/jornada?g=PG2&r=Jornada%201'), R('#/jornada?g=PG3&r=Jornada%201')), 'push');
  assert.equal(historyMode(R('#/tabla?g=PG2&v=puntos'), R('#/tabla?g=PG2&v=forma')), 'replace');
  assert.equal(historyMode(R('#/tabla?g=PG2'), R('#/tabla?s=2024-2025&g=PG2')), 'push');
  assert.equal(historyMode(R('#/explorar?q=Mes'), R('#/explorar?q=Mesas')), 'replace');
  assert.equal(historyMode(R('#/goleadores?g=PG2&q=a'), R('#/goleadores?g=PG2&q=ab')), 'replace');
  assert.equal(historyMode(R(J30), R(OTHER)), 'push');
  assert.equal(historyMode(R('#/tabla?g=PG2'), R('#/tabla?g=PG2')), 'replace', 'la misma ruta no crea otra entrada');
});

test('parentOf: Partido → su jornada; lo que cuelga de Explorar → Explorar; los destinos principales, nada', () => {
  assert.deepEqual(parentOf(parseRoute(J30)), { screen: 'jornada', params: { g: 'PG2', r: 'Jornada 30' } });
  assert.deepEqual(parentOf({ screen: 'partido', params: { s: '2024-2025', g: 'PGC2', r: 'Jornada 3', h: 'x', a: 'y' } }),
    { screen: 'jornada', params: { s: '2024-2025', g: 'PGC2', r: 'Jornada 3' } });
  for (const screen of ['equipo', 'copa', 'goleadores', 'ligas', 'temporadas', 'records', 'fuentes', 'ajustes']) {
    assert.deepEqual(parentOf({ screen, params: { g: 'PG2' } }), { screen: 'explorar', params: {} }, screen);
  }
  for (const screen of ['', 'jornada', 'tabla', 'explorar']) assert.equal(parentOf({ screen, params: {} }), null, screen);
});

test('activeTab: el destino marcado de cada fila de §4.1, "page" en los principales y "true" en las demás', () => {
  const tab = (hash, last = null, mine = false) => activeTab(parseRoute(hash), last, mine);
  assert.deepEqual(tab('#/'), { active: 'miequipo', current: 'page' });
  assert.deepEqual(tab('#/jornada?g=PG3'), { active: 'jornada', current: 'page' });
  assert.deepEqual(tab('#/tabla'), { active: 'tabla', current: 'page' });
  assert.deepEqual(tab('#/explorar?q=x'), { active: 'explorar', current: 'page' });
  // Partido: el último destino principal; por enlace directo, Mi equipo si es mío y Jornada si no.
  assert.deepEqual(tab(J30, 'tabla', true), { active: 'tabla', current: 'true' });
  assert.deepEqual(tab(J30, null, true), { active: 'miequipo', current: 'true' });
  assert.deepEqual(tab(OTHER, null, false), { active: 'jornada', current: 'true' });
  assert.deepEqual(tab(OTHER, 'partido', false), { active: 'jornada', current: 'true' }, 'solo cuenta un destino principal');
  // Equipo: Mi equipo si (s, g, t) es mi equipo; si no, Explorar.
  assert.deepEqual(tab('#/equipo?g=PG2&t=Las%20Mesas%20Hu.', 'tabla', true), { active: 'miequipo', current: 'true' });
  assert.deepEqual(tab('#/equipo?g=PG2&t=Acodetti', 'tabla', false), { active: 'explorar', current: 'true' });
  // Ligas: Explorar, o el de `to` si viene de «Otro grupo».
  assert.deepEqual(tab('#/ligas?c=prebenjamin'), { active: 'explorar', current: 'true' });
  assert.deepEqual(tab('#/ligas?to=tabla'), { active: 'tabla', current: 'true' });
  assert.deepEqual(tab('#/ligas?to=jornada'), { active: 'jornada', current: 'true' });
  for (const hash of ['#/copa?g=MCPK1', '#/goleadores', '#/temporadas', '#/records', '#/fuentes', '#/ajustes']) {
    assert.deepEqual(tab(hash, 'tabla'), { active: 'explorar', current: 'true' }, hash);
  }
});

test('routeIsMine: el partido o la ficha de mi equipo, en su grupo y su temporada', () => {
  const R = (hash) => ({ screen: parseRoute(hash).screen, params: { s: PORTAL, ...parseRoute(hash).params } });
  assert.equal(routeIsMine(R(J30), OK), true);
  assert.equal(routeIsMine(R(OTHER), OK), false);
  assert.equal(routeIsMine(R('#/equipo?g=PG2&t=Las%20Mesas%20Hu.'), OK), true);
  assert.equal(routeIsMine(R('#/equipo?g=PG3&t=Las%20Mesas%20Hu.'), OK), false);
  assert.equal(routeIsMine({ screen: 'partido', params: { s: '2024-2025', g: 'PG2', r: 'Jornada 30', h: 'Las Mesas Hu.', a: 'x' } }, OK), false);
  assert.equal(routeIsMine(R(J30), ASK), false);
  assert.equal(routeIsMine(R('#/tabla?g=PG2'), OK), false);
});

// ── Pantallas registradas y pantalla provisional ─────────────────────────

// Rutas de B3 (decisión 6 de B2): la pantalla provisional. Jornada, Tabla y Partido la llevan
// hasta que la Tarea 12 registra las suyas.
const B3 = ['explorar', 'equipo', 'ligas', 'copa', 'goleadores', 'temporadas', 'records', 'fuentes', 'ajustes'];

test('cada ruta de §4.1 tiene pantalla; las de B3 pintan la provisional con su h1 y el vacío', () => {
  assert.deepEqual(Object.keys(SCREEN_MAP).sort(), [...SCREENS].sort());
  assert.equal(SCREEN_MAP[''].id, 'home');
  for (const name of SCREENS) assert.equal(typeof SCREEN_MAP[name].render, 'function', name);
  for (const name of B3) {
    assert.equal(SCREEN_MAP[name], pendiente, name);
    const back = parentOf({ screen: name, params: {} });
    const out = String(pendiente.render({ route: { screen: name, params: {} }, backHref: back ? routeHref(back.screen, back.params) : null }));
    assert.equal((out.match(/<h1>/g) || []).length, 1, name);
    assert.ok(out.includes(`<h1>${routeTitle(name)}</h1>`), name);
    assert.ok(out.includes('Esta pantalla llega en la próxima fase del rediseño.'), name);
    assert.match(out, new RegExp(`^<section data-screen="pendiente" data-route="${name}">`), name);
  }
  assert.deepEqual(pendiente.needs({}, {}), []);
});

// ── startRouter con un window y un document falsos ─────────────────────

// Lo justo del navegador: historial con entradas y estado, location.hash, eventos de window y de
// document, desplazamiento, la barra de 4 destinos y un <main> que guarda el HTML pintado y crea
// su h1 y sus elementos con id en cada pintado.
function fakeBrowser(hash = '#/') {
  const listeners = { window: {}, document: {} };
  const on = (where) => (type, fn) => { (listeners[where][type] ||= []).push(fn); };
  const fire = (where, type, event) => (listeners[where][type] || []).forEach((fn) => fn(event));
  const entries = [{ hash, state: null }];
  let index = 0;
  const hashOf = (url) => (String(url).includes('#') ? String(url).slice(String(url).indexOf('#')) : String(url));
  const history = {
    scrollRestoration: 'auto',
    get state() { return entries[index].state; },
    pushState(state, _title, url) {
      entries.splice(index + 1, entries.length, { hash: hashOf(url), state: structuredClone(state) });
      index++;
    },
    replaceState(state, _title, url) {
      entries[index] = { hash: url === undefined ? entries[index].hash : hashOf(url), state: structuredClone(state) };
    },
    back() {
      if (index === 0) return;
      index--;
      queueMicrotask(() => { fire('window', 'popstate', { state: entries[index].state }); fire('window', 'hashchange', {}); });
    },
  };
  const doc = { title: 'Fútbol Base Las Palmas', activeElement: null, addEventListener: on('document') };
  function element(tag, attrs = {}) {
    const el = {
      tagName: tag.toUpperCase(), attrs: { ...attrs }, focused: 0, scrolled: 0,
      get id() { return el.attrs.id || ''; },
      getAttribute: (n) => (Object.hasOwn(el.attrs, n) ? el.attrs[n] : null),
      setAttribute: (n, v) => { el.attrs[n] = String(v); },
      removeAttribute: (n) => { delete el.attrs[n]; },
      hasAttribute: (n) => Object.hasOwn(el.attrs, n),
      closest: (sel) => (sel === 'a[href],[data-action]'
        && ((el.tagName === 'A' && el.hasAttribute('href')) || el.hasAttribute('data-action')) ? el : null),
      focus: () => { el.focused++; doc.activeElement = el; },
      scrollIntoView: () => { el.scrolled++; },
    };
    return el;
  }
  const tabs = ['#/', '#/jornada', '#/tabla', '#/explorar'].map((href) => element('a', { class: 'tab', href }));
  const main = element('main', { id: 'contenido' });
  let painted = { h1: null, ids: new Map() };
  const root = {
    markup: '',
    set innerHTML(markup) {
      this.markup = markup;
      painted = {
        h1: markup.includes('<h1') ? element('h1') : null,
        ids: new Map([...markup.matchAll(/ id="([^"]+)"/g)].map(([, id]) => [id, element('a', { id })])),
      };
    },
    get innerHTML() { return this.markup; },
    querySelector: (sel) => (sel === 'h1' ? painted.h1 : null),
    contains: (el) => el === painted.h1 || [...painted.ids.values()].includes(el),
  };
  doc.querySelectorAll = (sel) => (sel === '.tabbar a.tab' ? tabs : []);
  doc.getElementById = (id) => (id === 'contenido' ? main : painted.ids.get(id) || null);
  const win = {
    document: doc, history, scrollY: 0,
    location: { get hash() { return entries[index].hash; } },
    scrollTo(_x, y) { win.scrollY = y; fire('window', 'scroll', {}); },
    addEventListener: on('window'),
  };
  return {
    win, root, doc, main,
    entries: () => entries.map((e) => e.hash),
    index: () => index,
    h1: () => root.querySelector('h1'),
    marks: () => tabs.filter((t) => t.attrs['aria-current']).map((t) => [t.attrs.href, t.attrs['aria-current']]),
    // Un clic como lo recibe la delegación del documento; devuelve si el router lo atendió.
    click(attrs, tag = 'a') {
      let prevented = false;
      fire('document', 'click', { target: element(tag, attrs), button: 0, defaultPrevented: false, preventDefault() { prevented = true; } });
      return prevented;
    },
    // Un hash escrito a mano en la barra de direcciones: entrada nueva del navegador, sin estado.
    type(newHash) {
      entries.splice(index + 1, entries.length, { hash: newHash, state: null });
      index++;
      fire('window', 'popstate', { state: null });
      fire('window', 'hashchange', {});
    },
    scroll(y) { win.scrollY = y; fire('window', 'scroll', {}); },
  };
}

// Pantalla falsa: su h1 es su id y enseña la ruta resuelta en <p class="where">.
function screen(id, { log = [], needs = () => [], mount = null, body = null } = {}) {
  return {
    id,
    needs: (params, datasets) => { log.push(`needs ${id}`); return needs(params, datasets); },
    render: (ctx) => {
      log.push(`render ${id}`);
      return html`<section data-screen="${id}"><header class="screen-head"><h1>${id}</h1></header><p class="where">${routeHref(ctx.route.screen, ctx.params)}</p>${body ? body(ctx) : ''}</section>`;
    },
    mount: (root, ctx, nav) => { log.push(`mount ${id}`); return mount ? mount(root, ctx, nav) : undefined; },
  };
}
const where = (b) => (b.root.innerHTML.match(/<p class="where">([^<]*)<\/p>/) || [])[1]?.replace(/&amp;/g, '&');
const deferred = () => {
  let resolve, reject;
  const promise = new Promise((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
};
const tick = () => new Promise((resolve) => setImmediate(resolve));
// Arranca el router sin volcar en la salida los console.error esperados (cajas de error).
async function quietly(options) {
  const original = console.error;
  console.error = () => {};
  try {
    const router = startRouter(options);
    await router.idle();
    return router;
  } finally {
    console.error = original;
  }
}

test('la ruta inicial pasa por needs, render y mount; marca la barra y no mueve el foco', async () => {
  const b = fakeBrowser('#/');
  const log = [];
  const router = startRouter({ screens: { '': screen('home', { log }) }, root: b.root, getContext: context(), window: b.win });
  await router.idle();
  assert.deepEqual(log, ['needs home', 'render home', 'mount home']);
  assert.match(b.root.innerHTML, /<h1>home<\/h1>/);
  assert.equal(b.h1().focused, 0, 'la carga inicial no mueve el foco');
  assert.deepEqual(b.marks(), [['#/', 'page']]);
  assert.equal(b.doc.title, 'Fútbol Base Las Palmas');
  assert.equal(b.win.history.scrollRestoration, 'manual');
  assert.deepEqual(router.current(), { screen: '', params: {} });
});

test('needs recibe la temporada del portal del contexto: ninguna pantalla la lee de config.js (R2-1)', async () => {
  const b = fakeBrowser('#/tabla?g=PG2');
  const received = [];
  const tabla = { ...screen('tabla'), needs: (params, datasets, options) => { received.push(options); return []; } };
  const router = startRouter({ screens: { tabla }, root: b.root, getContext: context(), window: b.win });
  await router.idle();
  assert.deepEqual(received, [{ portalSeason: PORTAL }]);
});

test('token: una respuesta lenta (o un error) nunca pinta sobre la ruta nueva', async () => {
  const b = fakeBrowser('#/');
  const log = [];
  const slow = deferred();
  const failing = deferred();
  const screens = {
    '': screen('home', { log }),
    tabla: screen('tabla', { log, needs: () => [slow.promise] }),
    explorar: screen('explorar', { log, needs: () => [failing.promise] }),
    jornada: screen('jornada', { log }),
  };
  const router = startRouter({ screens, root: b.root, getContext: context(), window: b.win });
  await router.idle();
  assert.equal(b.click({ href: '#/tabla' }), true);
  assert.match(b.root.innerHTML, /data-skeleton="tabla"/, 'el esqueleto mientras carga');
  b.click({ href: '#/explorar' });
  b.click({ href: '#/jornada' });
  await router.idle();
  assert.match(b.root.innerHTML, /<h1>jornada<\/h1>/);
  slow.resolve();
  failing.reject(new Error('la temporada 2024/25'));
  await tick();
  assert.match(b.root.innerHTML, /<h1>jornada<\/h1>/, 'la tabla y el error llegaron tarde y no pintan');
  assert.ok(!log.includes('render tabla') && !log.includes('render explorar'));
  assert.deepEqual(b.marks(), [['#/jornada', 'page']]);
});

test('enlace antiguo de WhatsApp: se traduce con replaceState, sin entrada nueva, y conserva su temporada', async () => {
  const b = fakeBrowser('#section=jornadas&cat=prebenjamin&season=2025-2026&group=PG2&round=Jornada+30');
  const router = startRouter({ screens: { '': screen('home'), jornada: screen('jornada') }, root: b.root, getContext: context(), window: b.win });
  await router.idle();
  assert.deepEqual(b.entries(), ['#/jornada?s=2025-2026&g=PG2&r=Jornada%2030']);
  assert.equal(where(b), '#/jornada?s=2025-2026&g=PG2&r=Jornada%2030');
  const m = fakeBrowser('#section=jornadas&group=PG2&match=%5B%22Las+Mesas+Hu.%22%2C%22AD+Hurac%C3%A1n%22%2C%22Jornada+30%22%5D');
  const r2 = startRouter({ screens: { '': screen('home'), partido: screen('partido') }, root: m.root, getContext: context(), window: m.win });
  await r2.idle();
  assert.deepEqual(m.entries(), [J30]);
  assert.deepEqual(m.marks(), [['#/', 'true']], 'enlace directo a un partido de mi equipo: Mi equipo');
});

test('enlace antiguo «miequipo» de mi equipo (la URL que escribía la app anterior): Mi equipo, no su ficha', async () => {
  const open = async (hash) => {
    const b = fakeBrowser(hash);
    const router = startRouter({ screens: { '': screen('home'), equipo: pendiente }, root: b.root, getContext: context(), window: b.win });
    await router.idle();
    return b.entries();
  };
  // El mismo nombre que el guardado, o el mismo club en el mismo grupo («Las Mesas Hu», sin punto).
  assert.deepEqual(await open('#section=miequipo&cat=prebenjamin&season=2025-2026&group=PG2&team=Las+Mesas+Hu.'), ['#/']);
  assert.deepEqual(await open('#section=miequipo&cat=prebenjamin&season=2025-2026&group=PG2&team=Las+Mesas+Hu'), ['#/']);
  // Otro equipo, o el mismo club en otro grupo: su ficha, con la temporada del enlace (§4.1).
  assert.deepEqual(await open('#section=miequipo&cat=prebenjamin&season=2025-2026&group=PG2&team=AD+Hurac%C3%A1n'),
    ['#/equipo?s=2025-2026&g=PG2&t=AD%20Hurac%C3%A1n']);
  assert.deepEqual(await open('#section=miequipo&cat=benjamin&season=2025-2026&group=A2&team=Las+Mesas+Hu'),
    ['#/equipo?s=2025-2026&g=A2&t=Las%20Mesas%20Hu']);
});

test('enlace directo con parámetros que faltan o no existen: la pantalla por defecto, con aviso, nunca en blanco', async () => {
  const b = fakeBrowser('#/jornada');
  const router = startRouter({ screens: { '': screen('home'), jornada: screen('jornada'), ligas: pendiente }, root: b.root, getContext: context({ resolution: ASK }), window: b.win });
  await router.idle();
  assert.deepEqual(b.entries(), ['#/ligas?to=jornada']);
  assert.match(b.root.innerHTML, /<\/header><p class="notice route-notice" role="status">Elige tu equipo en Mi equipo<\/p>/);
  assert.deepEqual(b.marks(), [['#/jornada', 'true']]);
  const g = fakeBrowser('#/tabla?g=LZS1');
  const r2 = startRouter({ screens: { '': screen('home'), tabla: screen('tabla'), ligas: pendiente }, root: g.root, getContext: context(), window: g.win });
  await r2.idle();
  assert.deepEqual(g.entries(), ['#/ligas?c=prebenjamin&to=tabla']);
  assert.match(g.root.innerHTML, /<h1>Ligas<\/h1><\/div><\/header><p class="notice route-notice" role="status">No encontramos el grupo LZS1 en la temporada 2025\/26<\/p>/);
});

test('temporada pasada sin cargar: needs la carga y después se pone el grupo por defecto', async () => {
  const b = fakeBrowser('#/tabla?s=2024-2025');
  const loaded = [];
  const log = [];
  const tabla = screen('tabla', { log, needs: (params) => (loaded.includes(params.s) ? [] : [Promise.resolve().then(() => { loaded.push(params.s); })]) });
  const router = startRouter({ screens: { '': screen('home'), tabla }, root: b.root, getContext: context({ loaded }), window: b.win });
  await router.idle();
  assert.equal(where(b), '#/tabla?s=2024-2025&g=PGC2');
  assert.deepEqual(b.entries(), ['#/tabla?s=2024-2025'], 'el valor por defecto no reescribe la dirección');
  assert.deepEqual(log.filter((x) => x.startsWith('render')), ['render tabla']);
  // Si needs no la carga, la caja de error lo dice.
  const e = fakeBrowser('#/tabla?s=2024-2025');
  await quietly({ screens: { '': screen('home'), tabla: screen('tabla') }, root: e.root, getContext: context(), window: e.win });
  assert.match(e.root.innerHTML, /No se pudieron cargar los datos de la temporada 2024\/25\./);
});

test('historial: cambiar de pantalla es push; cambiar de jornada o de vista, replace', async () => {
  const b = fakeBrowser('#/jornada?g=PG2&r=Jornada%201');
  const router = startRouter({ screens: { '': screen('home'), jornada: screen('jornada'), tabla: screen('tabla') }, root: b.root, getContext: context(), window: b.win });
  await router.idle();
  b.click({ href: '#/jornada?g=PG2&r=Jornada%202' });
  await router.idle();
  assert.deepEqual(b.entries(), ['#/jornada?g=PG2&r=Jornada%202']);
  b.click({ href: '#/tabla' });
  await router.idle();
  assert.deepEqual(b.entries(), ['#/jornada?g=PG2&r=Jornada%202', '#/tabla']);
  b.click({ href: '#/tabla?v=goles' });
  await router.idle();
  assert.deepEqual(b.entries(), ['#/jornada?g=PG2&r=Jornada%202', '#/tabla?v=goles']);
  assert.equal(where(b), '#/tabla?s=2025-2026&g=PG2&v=goles');
});

test('Atrás y «‹» con entrada anterior de la app: history.back(), con el desplazamiento guardado y foco al h1', async () => {
  const b = fakeBrowser('#/');
  const log = [];
  let partidoCtx = null;
  const screens = { '': screen('home', { log }), partido: screen('partido', { log, mount: (root, ctx) => { partidoCtx = ctx; } }) };
  const router = startRouter({ screens, root: b.root, getContext: context(), window: b.win });
  await router.idle();
  b.scroll(420);
  b.click({ href: J30 });
  await router.idle();
  assert.equal(b.win.scrollY, 0, 'la ficha empieza arriba');
  assert.equal(b.h1().focused, 1, 'foco al h1 al avanzar');
  assert.equal(b.h1().getAttribute('tabindex'), '-1');
  assert.deepEqual(b.marks(), [['#/', 'true']], 'Partido desde Mi equipo: su destino de origen');
  assert.equal(partidoCtx.backHref, '#/jornada?s=2025-2026&g=PG2&r=Jornada%2030');
  assert.equal(partidoCtx.lastPrimary, 'miequipo');
  assert.equal(b.click({ href: partidoCtx.backHref, 'data-action': 'back' }), true);
  await tick();
  await router.idle();
  assert.equal(b.index(), 0);
  assert.match(b.root.innerHTML, /<h1>home<\/h1>/);
  assert.equal(b.win.scrollY, 420, 'vuelve adonde estaba la portada');
  assert.equal(b.h1().focused, 1);
  assert.deepEqual(log.filter((x) => x === 'render home'), ['render home', 'render home'], 'popstate y hashchange: un solo pintado');
});

test('«‹» entrando por enlace directo: sigue el enlace al padre (Partido → su jornada), con push', async () => {
  const b = fakeBrowser(OTHER);
  let ctxSeen = null;
  const screens = { '': screen('home'), partido: screen('partido', { mount: (root, ctx) => { ctxSeen = ctx; } }), jornada: screen('jornada') };
  const router = startRouter({ screens, root: b.root, getContext: context(), window: b.win });
  await router.idle();
  assert.deepEqual(b.marks(), [['#/jornada', 'true']], 'enlace directo a un partido que no es mío: Jornada');
  assert.equal(b.click({ href: ctxSeen.backHref, 'data-action': 'back' }), true);
  await router.idle();
  assert.deepEqual(b.entries(), [OTHER, '#/jornada?s=2025-2026&g=PG2&r=Jornada%2030']);
  assert.match(b.root.innerHTML, /<h1>jornada<\/h1>/);
  assert.deepEqual(b.marks(), [['#/jornada', 'page']]);
});

test('un hash escrito a mano es una entrada nueva de la app, y su «‹» vuelve atrás', async () => {
  const b = fakeBrowser('#/');
  const log = [];
  const router = startRouter({ screens: { '': screen('home', { log }), tabla: screen('tabla', { log }) }, root: b.root, getContext: context(), window: b.win });
  await router.idle();
  b.type('#/tabla');
  await router.idle();
  assert.match(b.root.innerHTML, /<h1>tabla<\/h1>/);
  assert.deepEqual(log.filter((x) => x === 'render tabla'), ['render tabla']);
  assert.equal(b.click({ href: '#/', 'data-action': 'back' }), true);
  await tick();
  await router.idle();
  assert.equal(b.index(), 0);
  assert.match(b.root.innerHTML, /<h1>home<\/h1>/);
});

test('error de carga: caja con Reintentar, que vuelve a pedir los datos y pinta la pantalla', async () => {
  const b = fakeBrowser('#/tabla');
  let calls = 0;
  const tabla = screen('tabla', { needs: () => [++calls === 1 ? Promise.reject(new Error('la temporada 2024/25')) : Promise.resolve()] });
  const router = await quietly({ screens: { '': screen('home'), tabla }, root: b.root, getContext: context(), window: b.win });
  assert.match(b.root.innerHTML, /^<section data-screen="tabla" data-state="error">/);
  assert.match(b.root.innerHTML, /<h1>Tabla<\/h1>/);
  assert.match(b.root.innerHTML, /No se pudieron cargar los datos de la temporada 2024\/25\./);
  assert.equal(b.click({ 'data-action': 'retry', type: 'button' }, 'button'), true);
  await router.idle();
  assert.match(b.root.innerHTML, /<h1>tabla<\/h1>/);
  assert.equal(calls, 2);
});

test('un fallo de programación da la caja de error sin su mensaje; render tiene que devolver Html', async () => {
  const b = fakeBrowser('#/tabla');
  const tabla = { id: 'tabla', needs: () => { throw new TypeError('x is undefined'); }, render: () => html`` };
  await quietly({ screens: { '': screen('home'), tabla }, root: b.root, getContext: context(), window: b.win });
  assert.match(b.root.innerHTML, /No se pudieron cargar los datos de esta pantalla\./);
  assert.doesNotMatch(b.root.innerHTML, /undefined/);
  const t = fakeBrowser('#/tabla');
  const texto = { id: 'tabla', needs: () => [], render: () => '<h1>sin escapar</h1>' };
  await quietly({ screens: { '': screen('home'), tabla: texto }, root: t.root, getContext: context(), window: t.win });
  assert.match(t.root.innerHTML, /data-state="error"/);
  assert.doesNotMatch(t.root.innerHTML, /sin escapar/);
});

test('al cambiar de jornada el desplazamiento se queda y el foco vuelve al control pulsado (mismo id)', async () => {
  const b = fakeBrowser('#/jornada?g=PG2&r=Jornada%201');
  const jornada = screen('jornada', { body: (ctx) => html`<a id="siguiente" href="#/jornada?g=PG2&r=Jornada%202">›</a>` });
  const router = startRouter({ screens: { '': screen('home'), jornada }, root: b.root, getContext: context(), window: b.win });
  await router.idle();
  b.scroll(150);
  b.doc.getElementById('siguiente').focus();
  b.click({ href: '#/jornada?g=PG2&r=Jornada%202', id: 'siguiente' });
  await router.idle();
  assert.equal(b.win.scrollY, 150);
  assert.equal(b.doc.getElementById('siguiente').focused, 1, 'el control nuevo con el mismo id');
  assert.equal(b.h1().focused, 0);
});

test('«Saltar al contenido» lleva el foco a main sin cambiar la ruta', async () => {
  const b = fakeBrowser('#/');
  const router = startRouter({ screens: { '': screen('home') }, root: b.root, getContext: context(), window: b.win });
  await router.idle();
  assert.equal(b.click({ class: 'skip-link', href: '#contenido' }), true);
  assert.deepEqual(b.entries(), ['#/']);
  assert.equal(b.main.focused, 1);
  assert.equal(b.main.getAttribute('tabindex'), '-1');
});

test('mount puede devolver una limpieza, que se llama justo antes de pintar la pantalla siguiente', async () => {
  const b = fakeBrowser('#/');
  const log = [];
  const home = screen('home', { mount: () => () => log.push('limpieza home') });
  const router = startRouter({ screens: { '': home, tabla: screen('tabla', { log }) }, root: b.root, getContext: context(), window: b.win });
  await router.idle();
  b.click({ href: '#/tabla' });
  await router.idle();
  assert.deepEqual(log, ['needs tabla', 'render tabla', 'limpieza home', 'mount tabla']);
});

test('el último destino principal se guarda en la sesión y marca Partido tras recargar', async () => {
  const saved = new Map();
  const session = { getItem: (k) => saved.get(k) ?? null, setItem: (k, v) => { saved.set(k, v); } };
  const b = fakeBrowser('#/tabla');
  const screens = { '': screen('home'), tabla: screen('tabla'), partido: screen('partido') };
  await startRouter({ screens, root: b.root, getContext: context(), window: b.win, session }).idle();
  assert.equal(saved.get('futbol-base:destino'), 'tabla');
  const again = fakeBrowser(OTHER);
  await startRouter({ screens, root: again.root, getContext: context(), window: again.win, session }).idle();
  assert.deepEqual(again.marks(), [['#/tabla', 'true']]);
});

test('nav.saveMyTeam guarda con actions.saveMyTeam y vuelve a pintar la ruta', async () => {
  const b = fakeBrowser('#/');
  const log = [];
  let nav = null;
  let stored = null;
  const home = screen('home', { log, mount: (root, ctx, n) => { nav = n; } });
  const router = startRouter({ screens: { '': home }, root: b.root, getContext: context(), window: b.win, actions: { saveMyTeam: (team) => { stored = team; return true; } } });
  await router.idle();
  const team = { name: 'Las Mesas B', season: '2026-2027', cat: 'benjamin', groupId: 'B2' };
  assert.equal(nav.saveMyTeam(team), true);
  await router.idle();
  assert.deepEqual(stored, team);
  assert.deepEqual(log.filter((x) => x === 'render home'), ['render home', 'render home']);
  assert.equal(b.h1().focused, 1);
});

test('si mount navega (nav.replace), manda esa navegación: el pintado anterior no recoloca nada', async () => {
  const b = fakeBrowser('#/');
  const explorar = screen('explorar', { mount: (root, ctx, nav) => { nav.replace('tabla', { v: 'goles' }); } });
  const router = startRouter({ screens: { '': screen('home'), explorar, tabla: screen('tabla') }, root: b.root, getContext: context(), window: b.win });
  await router.idle();
  b.scroll(300);
  b.click({ href: '#/explorar' });
  await router.idle();
  assert.deepEqual(b.entries(), ['#/', '#/tabla?v=goles']);
  assert.match(b.root.innerHTML, /<h1>tabla<\/h1>/);
  assert.equal(b.h1().focused, 1, 'un solo foco, el de la tabla');
});
```

Las pruebas de B1 de los enlaces antiguos pasan a esperar la temporada del enlace en la ruta, también cuando es la del portal, y el enlace «miequipo» de mi equipo:

En `scripts/tests/test_rediseno_links.mjs`, sustituir:

```js
    ['#section=miequipo&cat=prebenjamin&season=2025-2026&group=PG2&team=Las+Mesas+Hu.', '#/equipo?g=PG2&t=Las%20Mesas%20Hu.'],
    ['#section=clasif&cat=prebenjamin&season=2025-2026&group=PG2', '#/tabla?g=PG2'],
    ['#section=jornadas&cat=prebenjamin&season=2025-2026&group=PG2&round=Jornada+30', '#/jornada?g=PG2&r=Jornada%2030'],
    ['#section=jornadas&cat=prebenjamin&season=2025-2026&group=PG2&round=Jornada+30&match=%5B%22Las+Mesas+Hu.%22%2C%22AD+Hurac%C3%A1n%22%2C%22Jornada+30%22%5D',
      '#/partido?g=PG2&r=Jornada%2030&h=Las%20Mesas%20Hu.&a=AD%20Hurac%C3%A1n'],
    ['#section=clasif&cat=prebenjamin&season=2025-2026&group=PG2&team=AD+Hurac%C3%A1n', '#/equipo?g=PG2&t=AD%20Hurac%C3%A1n'],
    ['#section=clasif&cat=prebenjamin&season=2025-2026&team=AD+Hurac%C3%A1n', '#/explorar?q=AD%20Hurac%C3%A1n'],
    ['#section=goleadores&cat=benjamin&season=2025-2026&group=A2', '#/goleadores?g=A2'],
    ['#section=isla&cat=benjamin&season=2025-2026&island=lanzarote', '#/ligas?c=benjamin&i=lanzarote'],
    ['#section=stats&cat=benjamin&season=2025-2026', '#/records?c=benjamin'],
  ];
  for (const [legacy, expected] of cases) assert.equal(translateLegacy(legacy, { season: SEASON }), expected, legacy);
});

test('enlaces antiguos: temporada, parámetros sobrantes y casos límite', () => {
  const t = hash => translateLegacy(hash, { season: SEASON });
  assert.equal(t('#section=clasif&cat=prebenjamin&season=2024-2025&group=PGC2'), '#/tabla?s=2024-2025&g=PGC2');
  assert.equal(t('#section=clasif&group=PG2'), '#/tabla?g=PG2');
  assert.equal(translateLegacy('#section=clasif&cat=prebenjamin&season=2025-2026&group=PG2', { season: '2026-2027' }), '#/tabla?s=2025-2026&g=PG2');
  assert.equal(t('#section=jornadas&cat=benjamin&season=2025-2026&group=B2&round=Jornada+12&q=mesas&island=grancanaria&phase=Segunda+Fase+B'), '#/jornada?g=B2&r=Jornada%2012');
  assert.equal(t('#section=goleadores&cat=benjamin&season=2025-2026'), '#/goleadores?c=benjamin');
  assert.equal(t('#section=jornadas&group=PG2&round=Jornada+3&match=%5Bmal'), '#/jornada?g=PG2&r=Jornada%203');
  assert.equal(t('#section=jornadas&round=Jornada+3&match=%5B%22A%22%2C%22B%22%2C%22Jornada+3%22%5D'), '#/jornada?r=Jornada%203');
  assert.equal(t('#section=miequipo&cat=prebenjamin&season=2025-2026&team=Las+Mesas+Hu.'), '#/explorar?q=Las%20Mesas%20Hu.');
```

por:

```js
    ['#section=miequipo&cat=prebenjamin&season=2025-2026&group=PG2&team=Las+Mesas+Hu.', '#/equipo?s=2025-2026&g=PG2&t=Las%20Mesas%20Hu.'],
    ['#section=clasif&cat=prebenjamin&season=2025-2026&group=PG2', '#/tabla?s=2025-2026&g=PG2'],
    ['#section=jornadas&cat=prebenjamin&season=2025-2026&group=PG2&round=Jornada+30', '#/jornada?s=2025-2026&g=PG2&r=Jornada%2030'],
    ['#section=jornadas&cat=prebenjamin&season=2025-2026&group=PG2&round=Jornada+30&match=%5B%22Las+Mesas+Hu.%22%2C%22AD+Hurac%C3%A1n%22%2C%22Jornada+30%22%5D',
      '#/partido?s=2025-2026&g=PG2&r=Jornada%2030&h=Las%20Mesas%20Hu.&a=AD%20Hurac%C3%A1n'],
    ['#section=clasif&cat=prebenjamin&season=2025-2026&group=PG2&team=AD+Hurac%C3%A1n', '#/equipo?s=2025-2026&g=PG2&t=AD%20Hurac%C3%A1n'],
    ['#section=clasif&cat=prebenjamin&season=2025-2026&team=AD+Hurac%C3%A1n', '#/explorar?s=2025-2026&q=AD%20Hurac%C3%A1n'],
    ['#section=goleadores&cat=benjamin&season=2025-2026&group=A2', '#/goleadores?s=2025-2026&g=A2'],
    ['#section=isla&cat=benjamin&season=2025-2026&island=lanzarote', '#/ligas?s=2025-2026&c=benjamin&i=lanzarote'],
    ['#section=stats&cat=benjamin&season=2025-2026', '#/records?s=2025-2026&c=benjamin'],
  ];
  // La temporada del enlace se conserva siempre (M3 de la revisión de B2): tras activar 2026/27, un
  // enlace de 2025/26 sigue en 2025/26.
  for (const [legacy, expected] of cases) assert.equal(translateLegacy(legacy), expected, legacy);
});

test('enlaces antiguos: temporada, parámetros sobrantes y casos límite', () => {
  const t = hash => translateLegacy(hash);
  assert.equal(t('#section=clasif&cat=prebenjamin&season=2024-2025&group=PGC2'), '#/tabla?s=2024-2025&g=PGC2');
  assert.equal(t('#section=clasif&group=PG2'), '#/tabla?g=PG2');
  assert.equal(t('#section=jornadas&cat=benjamin&season=2025-2026&group=B2&round=Jornada+12&q=mesas&island=grancanaria&phase=Segunda+Fase+B'), '#/jornada?s=2025-2026&g=B2&r=Jornada%2012');
  assert.equal(t('#section=goleadores&cat=benjamin&season=2025-2026'), '#/goleadores?s=2025-2026&c=benjamin');
  assert.equal(t('#section=jornadas&group=PG2&round=Jornada+3&match=%5Bmal'), '#/jornada?g=PG2&r=Jornada%203');
  assert.equal(t('#section=jornadas&round=Jornada+3&match=%5B%22A%22%2C%22B%22%2C%22Jornada+3%22%5D'), '#/jornada?r=Jornada%203');
  assert.equal(t('#section=miequipo&cat=prebenjamin&season=2025-2026&team=Las+Mesas+Hu.'), '#/explorar?s=2025-2026&q=Las%20Mesas%20Hu.');
  // La URL que escribía la app anterior en cada carga, con mi equipo: Mi equipo (M3).
  const mine = (team, group) => team === 'Las Mesas Hu.' && group === 'PG2';
  assert.equal(translateLegacy('#section=miequipo&cat=prebenjamin&season=2025-2026&group=PG2&team=Las+Mesas+Hu.', { isMine: mine }), '#/');
  assert.equal(translateLegacy('#section=miequipo&cat=prebenjamin&season=2025-2026&group=PG2&team=Telde', { isMine: mine }), '#/equipo?s=2025-2026&g=PG2&t=Telde');
  assert.equal(translateLegacy('#section=clasif&cat=prebenjamin&season=2025-2026&group=PG2&team=Las+Mesas+Hu.', { isMine: mine }),
    '#/equipo?s=2025-2026&g=PG2&t=Las%20Mesas%20Hu.', 'solo «miequipo» abre Mi equipo');
```

- [ ] **Step 2: Run test to verify it fails**
```bash
cd /home/manolo/claude/futbol-base
node --test scripts/tests/test_rediseno_router.mjs 2>&1 | grep -E 'Error|^# (tests|pass|fail)'
```
Esperado:
```text
# Error [ERR_MODULE_NOT_FOUND]: Cannot find module '/home/manolo/claude/futbol-base/src/router.js' imported from /home/manolo/claude/futbol-base/scripts/tests/test_rediseno_router.mjs
# tests 1
# pass 0
# fail 1
```

- [ ] **Step 3: Write minimal implementation**

`translateLegacy` (`links.js`, de B1) conserva la temporada del enlace y abre Mi equipo con el enlace «miequipo» de mi equipo (M3 de la revisión):

En `src/links.js`, sustituir:

```js
// Enlaces antiguos ('#section=…', compartidos por WhatsApp) → ruta nueva (tabla de §4.1).
// `season` es PORTAL.season: la temporada del enlace solo se escribe si es otra.
// Un enlace nunca cambia mi equipo: 'miequipo' con equipo abre su ficha.
```

por:

```js
// Enlaces antiguos ('#section=…', compartidos por WhatsApp) → ruta nueva (tabla de §4.1).
// La temporada del enlace se conserva siempre como `s`, aunque sea la del portal: tras activar
// 2026/27, un enlace de 2025/26 sigue en 2025/26. Un enlace nunca cambia mi equipo: 'miequipo'
// con un equipo abre su ficha, salvo si `isMine(team, group)` dice que es el mío: esa es la URL que
// la app anterior escribía en cada carga, y abre Mi equipo (M3 de la revisión de B2).
```

En `src/links.js`, sustituir:

```js
export function translateLegacy(hash, { season } = {}) {
  const text = String(hash ?? '');
  const raw = new URLSearchParams(text.replace(/^#/, ''));
  if (text.startsWith('#/') || !raw.has('section')) return null;
  const route = readRoute(text);
  const c = ['benjamin', 'prebenjamin'].includes(raw.get('cat')) ? raw.get('cat') : '';
  const s = route.season && route.season !== season ? route.season : '';
  const g = route.group;
  const match = legacyMatch(route.match);
  if (g && match) return routeHref('partido', { s, g, r: match[2], h: match[0], a: match[1] });
  if (route.team) return g ? routeHref('equipo', { s, g, t: route.team }) : routeHref('explorar', { s, q: route.team });
```

por:

```js
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
```

`findRound` y `findMatch`, que usan el router (Jornada y Partido valen si la pantalla los sabe leer) y, desde las Tareas 9 y 11, las dos pantallas.

Añadir al final de `src/model.js`:

```js
// La ronda `r` de un grupo (§4.1): la de esa clave (Round.key) o, si no hay, la del mismo número
// («30» o «Jornada 30» en un enlace escrito a mano o antiguo; las claves '1'…'14' de PFV2). null si
// no hay ninguna. La usan el router (una jornada que la pantalla sabe leer no se quita) y Jornada.
export function findRound(group, r) {
  if (r == null || r === '') return null;
  const rounds = group.rounds || [];
  const exact = rounds.find((round) => round.key === r);
  if (exact) return exact;
  const n = jornadaNumber(r);
  return n === null ? null : rounds.find((round) => round.n === n) || null;
}

// (r, h, a) identifica un partido del grupo: en su ronda (findRound) y, si ahí no está, el único
// partido de h contra a del grupo (un enlace con otra jornada). null si no hay ninguno o hay dos.
// La usan el router y la pantalla Partido.
export function findMatch(group, { r, h, a } = {}) {
  const round = findRound(group, r);
  const inRound = round ? round.matches.find((m) => m.home === h && m.away === a) : null;
  if (inRound) return inRound;
  const all = (group.rounds || []).flatMap((x) => x.matches.filter((m) => m.home === h && m.away === a));
  return all.length === 1 ? all[0] : null;
}
```

Crear `src/router.js`:

```js
// Router del rediseño (spec §4.1, §5.1, §7 y §8). La ruta vive en el hash
// (#/<pantalla>?<parámetros>) y es la fuente de verdad de lo que se ve.
// - Funciones puras: resolveParams (valores por defecto y redirecciones de §4.1),
//   historyMode (pushState o replaceState), parentOf («‹»), activeTab y routeIsMine (barra).
// - startRouter, la parte con DOM: hashchange y popstate, enlaces antiguos, token de
//   navegación, needs → render → mount, desplazamiento por entrada del historial, foco al h1,
//   «‹» y Reintentar.
// No toca el navegador al importarse: startRouter recibe `window`.
import { Html } from './html.js';
import { parseRoute, routeHref, translateLegacy } from './links.js';
import { findMatch, findRound, seasonLabel } from './model.js';
import { sameClub } from './myteam.js';
import { skeleton, errorScreen, routeNotice, routeTitle, updateTabbar } from './shell.js';

// Destinos principales de la barra, por pantalla.
const PRIMARY = { '': 'miequipo', jornada: 'jornada', tabla: 'tabla', explorar: 'explorar' };
const TABS = new Set(Object.values(PRIMARY));
const NO_PARAMS = new Set(['', 'temporadas', 'fuentes', 'ajustes']);
const VIEWS = ['puntos', 'goles', 'forma', 'casa', 'fuera', 'todas'];
// Lo que se cambia sin crear entrada en el historial (§4.1): jornada, vista de Tabla y búsqueda.
const REPLACE_ONLY = { jornada: ['r'], tabla: ['v'], explorar: ['q'], goleadores: ['q'] };
// Pantallas que se abren desde Explorar: su «‹» sin historial lleva a #/explorar.
const UNDER_EXPLORE = new Set(['equipo', 'copa', 'goleadores', 'ligas', 'temporadas', 'records', 'fuentes', 'ajustes']);
const MAX_REDIRECTS = 5;
const SESSION_KEY = 'futbol-base:destino';

const redirect = (screen, params, notice = null) => ({ redirect: { screen, params, notice } });
const omit = (params, key) => Object.fromEntries(Object.entries(params).filter(([k]) => k !== key));
const pick = (params, keys) => Object.fromEntries(keys.filter((k) => params[k] != null && params[k] !== '').map((k) => [k, params[k]]));
const knownSeason = (ctx, name) => (ctx.datasets?.seasons || []).some((entry) => entry && entry.name === name);
const hasTeam = (group, name) => group.standings.some((row) => row.team === name)
  || group.rounds.some((round) => round.matches.some((m) => m.home === name || m.away === name));

// Un grupo de la temporada o, si no, de los torneos (Cups de 2025-2026: MCP3, MCPK1…).
function findGroup(model, season, id) {
  const group = model.group(season, id);
  if (group) return group;
  const cups = model.cups();
  return cups && cups.season === season ? cups.groups.find((g) => g.id === id) || null : null;
}

// Nombre y categoría de mi equipo: los resueltos o, en E y X, los guardados.
function identity(ctx) {
  const r = ctx.resolution;
  return r?.status === 'ok' ? { name: r.name, cat: r.cat } : { name: ctx.myTeam?.name || '', cat: ctx.myTeam?.cat || '' };
}

// ── Valores por defecto y redirecciones (§4.1) ───────────────────────────
//
// resolveParams(route, ctx) → { params, pending? } | { redirect: { screen, params, notice } }
//   ctx: { portal: { season }, model, resolution, myTeam, datasets: { seasons } }
//   params: los de la ruta con `s` (y `g` en Jornada y Tabla) ya puestos; pending: la temporada
//   pasada aún no está cargada y no se puede validar el grupo (el router la vuelve a resolver
//   cuando termina `needs`). Las redirecciones se aplican con replaceState.
export function resolveParams(route, ctx) {
  const screen = route.screen;
  const raw = route.params || {};
  if (NO_PARAMS.has(screen)) return { params: {} };
  const portal = ctx.portal.season;
  if (raw.s && raw.s !== portal && !knownSeason(ctx, raw.s)) {
    return redirect(screen, omit(raw, 's'), `No existe la temporada ${seasonLabel(raw.s)}; te enseñamos la actual`);
  }
  const params = { ...raw, s: raw.s || portal };
  if (screen === 'jornada' || screen === 'tabla') return leagueParams(screen, raw, params, ctx);
  if (screen === 'partido') return matchParams(params, ctx);
  if (screen === 'equipo') return teamParams(params, ctx);
  return { params };
}

// Jornada y Tabla: `g` por defecto, grupos que no son de liga a #/copa y, sin mi equipo, a #/ligas.
function leagueParams(screen, raw, params, ctx) {
  if (screen === 'tabla' && raw.v && !VIEWS.includes(raw.v)) return redirect(screen, omit(raw, 'v'));
  const season = ctx.model.season(params.s);
  if (!season) return { params, pending: true };
  const portal = ctx.portal.season;
  const s = params.s === portal ? '' : params.s;
  const mine = identity(ctx);
  let group;
  if (params.g) {
    group = findGroup(ctx.model, params.s, params.g);
    if (!group) {
      return redirect('ligas', { s, c: mine.cat, to: screen }, `No encontramos el grupo ${params.g} en la temporada ${seasonLabel(params.s)}`);
    }
    if (group.kind !== 'league') return redirect('copa', { s, g: group.id });
  } else if (params.s === portal) {
    // Mi equipo sin resolver (E, pregunta pendiente; X, ausente): a Ligas de la temporada actual.
    if (ctx.resolution?.status !== 'ok') return redirect('ligas', { to: screen }, 'Elige tu equipo en Mi equipo');
    group = ctx.resolution.group;
  } else {
    // Temporada pasada: el primer grupo de liga de la categoría de mi equipo con su nombre.
    group = mine.name ? season.groups.find((g) => g.cat === mine.cat && g.kind === 'league' && hasTeam(g, mine.name)) : null;
    if (!group) {
      return redirect('ligas', { s, c: mine.cat, to: screen },
        mine.name ? `${mine.name} no aparece en la temporada ${seasonLabel(params.s)}` : 'Elige tu equipo en Mi equipo');
    }
  }
  // La jornada vale por su clave o por su número (la pantalla lee las dos); si no, se quita.
  if (screen === 'jornada' && raw.r && !findRound(group, raw.r)) return redirect(screen, omit(raw, 'r'));
  return { params: { ...params, g: group.id } };
}

// Partido: vale si findMatch lo encuentra, igual que la pantalla (en su ronda o, si ahí no está, el
// único h–a del grupo); si no, a su jornada, con aviso.
function matchParams(params, ctx) {
  const season = ctx.model.season(params.s);
  if (!season) return { params, pending: true };
  const s = params.s === ctx.portal.season ? '' : params.s;
  const lost = 'No encontramos ese partido';
  const group = params.g ? findGroup(ctx.model, params.s, params.g) : null;
  if (!group) return redirect('jornada', { s }, lost);
  if (!findMatch(group, params)) {
    const round = findRound(group, params.r);
    return redirect('jornada', { s, g: group.id, r: round ? round.key : '' }, lost);
  }
  return { params };
}

// Equipo: `g` es obligatorio; sin él, el equipo se busca en Explorar (como un enlace antiguo).
function teamParams(params, ctx) {
  const s = params.s === ctx.portal.season ? '' : params.s;
  if (!params.g) return redirect('explorar', { s, q: params.t });
  const season = ctx.model.season(params.s);
  if (!season) return { params, pending: true };
  if (!findGroup(ctx.model, params.s, params.g)) {
    return redirect('explorar', { s, q: params.t }, `No encontramos el grupo ${params.g} en la temporada ${seasonLabel(params.s)}`);
  }
  return { params };
}

// ── Historial, «‹» y barra ───────────────────────────────────────────────

// 'replace' si solo cambian la jornada, la vista de Tabla o la búsqueda (o nada); si no, 'push'.
export function historyMode(from, to) {
  if (!from || !to || from.screen !== to.screen) return 'push';
  const a = from.params || {};
  const b = to.params || {};
  const changed = [...new Set([...Object.keys(a), ...Object.keys(b)])].filter((k) => (a[k] ?? '') !== (b[k] ?? ''));
  const allowed = REPLACE_ONLY[to.screen] || [];
  return changed.every((k) => allowed.includes(k)) ? 'replace' : 'push';
}

// Padre de «‹» cuando no hay entrada anterior de la app: Partido → su jornada; lo que cuelga de
// Explorar → Explorar; los destinos principales no tienen.
export function parentOf(route) {
  const params = route?.params || {};
  if (route?.screen === 'partido') return { screen: 'jornada', params: pick(params, ['s', 'g', 'r']) };
  if (UNDER_EXPLORE.has(route?.screen)) return { screen: 'explorar', params: {} };
  return null;
}

// Destino marcado en la barra (§4.1) → { active, current }: 'page' en los principales y 'true'
// en las secundarias. Partido lleva el último destino principal de la sesión o, si se entra por
// enlace directo, Mi equipo si el partido es de mi equipo y Jornada si no.
export function activeTab(route, lastPrimary, isMine) {
  const screen = route?.screen ?? '';
  if (Object.hasOwn(PRIMARY, screen)) return { active: PRIMARY[screen], current: 'page' };
  if (screen === 'partido') return { active: TABS.has(lastPrimary) ? lastPrimary : isMine ? 'miequipo' : 'jornada', current: 'true' };
  if (screen === 'equipo') return { active: isMine ? 'miequipo' : 'explorar', current: 'true' };
  const to = route?.params?.to;
  if (screen === 'ligas' && (to === 'tabla' || to === 'jornada')) return { active: to, current: 'true' };
  return { active: 'explorar', current: 'true' };
}

// ¿Es de mi equipo este partido o esta ficha? Mismo grupo y temporada que el resuelto, y su nombre.
export function routeIsMine(route, resolution) {
  if (resolution?.status !== 'ok' || !resolution.group) return false;
  const params = route?.params || {};
  if (params.s !== resolution.group.season || params.g !== resolution.group.id) return false;
  if (route.screen === 'partido') return params.h === resolution.name || params.a === resolution.name;
  if (route.screen === 'equipo') return params.t === resolution.name;
  return false;
}

// ── startRouter ──────────────────────────────────────────────────────────

// Qué no se pudo cargar, para «No se pudieron cargar los datos de <qué>»: el `what` del error o
// el mensaje de un Error simple (las cargas de `needs` rechazan con Error('la temporada 2024/25')).
// Un fallo de programación (TypeError, RangeError…) no enseña su mensaje.
function loadWhat(err) {
  if (err && typeof err.what === 'string' && err.what) return err.what;
  if (err && Object.getPrototypeOf(err) === Error.prototype && err.message) return err.message;
  return 'esta pantalla';
}

// El aviso de una redirección va detrás de la cabecera de la pantalla (o de su h1).
function withNotice(markup, text) {
  if (!text) return markup;
  const note = String(routeNotice(text));
  const head = markup.indexOf('</header>');
  const h1 = markup.indexOf('</h1>');
  const at = head >= 0 ? head + '</header>'.length : h1 >= 0 ? h1 + '</h1>'.length : 0;
  return markup.slice(0, at) + note + markup.slice(at);
}

const decode = (text) => { try { return decodeURIComponent(text); } catch { return text; } };

// ¿Es mi equipo el de un enlace antiguo «miequipo»? El mismo nombre, o el mismo club en el mismo
// grupo, que el guardado o el resuelto (M3 de la revisión de B2).
function legacyMine(ctx) {
  const mine = [
    ctx.myTeam && ctx.myTeam.name ? { name: ctx.myTeam.name, groupId: ctx.myTeam.groupId } : null,
    ctx.resolution?.status === 'ok' ? { name: ctx.resolution.name, groupId: ctx.resolution.group.id } : null,
  ].filter(Boolean);
  return (team, group) => mine.some((m) => m.name === team
    || (Boolean(group) && group === m.groupId && sameClub(ctx.model.clubIndex(), team, m.name)));
}

// screens: { <ruta de §4.1>: { id, needs, render, mount? } }; root: <main id="contenido">;
// getContext() → { model, myTeam, resolution, today, health, datasets, portal } (los datos de
// cada pintado; el router añade route, params, lastPrimary y backHref); actions.saveMyTeam(myTeam)
// guarda mi equipo (app.js); session: { getItem, setItem } para el último destino principal.
// Devuelve { nav, idle, current }: idle() es la promesa del último pintado.
export function startRouter({ screens, root, getContext, window: win, actions = {}, session = null }) {
  const doc = win.document;
  const hist = win.history;
  const baseTitle = doc.title;
  const positions = new Map();          // desplazamiento por entrada del historial (fbKey)
  let token = 0;
  let serial = 0;
  let current = null;                   // ruta resuelta de la última navegación
  let seen = { key: null, hash: null, idx: -1 };  // la última entrada atendida
  let cleanup = null;                   // lo que devolvió el último mount
  let latest = Promise.resolve();
  let lastPrimary = null;
  try { lastPrimary = TABS.has(session?.getItem(SESSION_KEY)) ? session.getItem(SESSION_KEY) : null; } catch { lastPrimary = null; }

  // Cada entrada de la app lleva { fbIdx, fbKey }: fbIdx > 0 dice que la anterior es de la app.
  const entry = () => {
    const st = hist.state;
    return st && typeof st.fbIdx === 'number' && typeof st.fbKey === 'string' ? st : null;
  };
  const newKey = () => `${Date.now().toString(36)}.${++serial}`;
  const stamp = (idx) => {
    const st = { fbIdx: idx, fbKey: newKey() };
    hist.replaceState(st, '');
    return st;
  };
  const backHref = (route) => {
    const parent = parentOf(route);
    return parent ? routeHref(parent.screen, parent.params) : null;
  };
  const screenOf = (name) => screens[name] || screens[''];

  function rememberPrimary(tab) {
    lastPrimary = tab;
    try { session?.setItem(SESSION_KEY, tab); } catch { /* sin sesión: solo en memoria */ }
  }

  // Enlace antiguo → ruta nueva, y valores por defecto y redirecciones de §4.1, cada paso con
  // replaceState. Devuelve la ruta resuelta, si falta cargar su temporada y el primer aviso.
  function settle(base) {
    let hash = win.location.hash;
    const legacy = translateLegacy(hash, { isMine: legacyMine(base) });
    if (legacy) {
      hist.replaceState(hist.state, '', legacy);
      hash = legacy;
    }
    let route = parseRoute(hash);
    let notice = null;
    for (let i = 0; i <= MAX_REDIRECTS; i++) {
      const res = resolveParams(route, base);
      if (!res.redirect) return { route: { screen: route.screen, params: res.params }, pending: !!res.pending, notice };
      notice = notice || res.redirect.notice || null;
      const href = routeHref(res.redirect.screen, res.redirect.params);
      hist.replaceState(hist.state, '', href);
      route = parseRoute(href);
    }
    throw new Error('Demasiadas redirecciones');
  }

  function paint(markup) {
    if (cleanup) {
      try { cleanup(); } catch (err) { console.error('[router] limpieza', err); }
      cleanup = null;
    }
    root.innerHTML = String(markup);
  }

  // Desplazamiento: arriba al avanzar, el guardado al volver, el mismo al cambiar jornada o
  // vista; un ancla (#/…#calendario) manda al avanzar. Foco: al h1 (tabindex -1), salvo en la
  // carga inicial; al cambiar jornada o vista, vuelve al control pulsado si sigue (mismo id).
  function place(mode, target, focusId) {
    const hash = win.location.hash;
    const at = hash.indexOf('#', 1);
    const anchor = at > 0 && (mode === 'push' || mode === 'initial') ? doc.getElementById(decode(hash.slice(at + 1))) : null;
    if (anchor) anchor.scrollIntoView();
    else win.scrollTo(0, target);
    if (mode === 'initial') return;
    const kept = focusId ? doc.getElementById(focusId) : null;
    const el = kept && root.contains(kept) ? kept : root.querySelector('h1');
    if (!el) return;
    if (el.tagName === 'H1' && !el.hasAttribute('tabindex')) el.setAttribute('tabindex', '-1');
    el.focus({ preventScroll: true });
  }

  // mode: 'initial' | 'push' | 'replace' | 'pop' | 'refresh'.
  function show(mode, carried = null) {
    const st = entry();
    const target = mode === 'pop' ? (positions.get(st?.fbKey) ?? 0) : mode === 'replace' ? win.scrollY : 0;
    const focusId = mode === 'replace' ? (doc.activeElement?.id || null) : null;
    latest = run(mode, carried, 0, target, focusId);
    return latest;
  }

  async function run(mode, carried, depth, target, focusId) {
    const my = ++token;
    let route = parseRoute(win.location.hash);
    let screen = screenOf(route.screen);
    try {
      let base = getContext();
      const first = settle(base);
      route = first.route;
      screen = screenOf(route.screen);
      const notice = carried || first.notice;
      const st = entry();
      current = route;
      seen = { key: st?.fbKey ?? null, hash: win.location.hash, idx: st?.fbIdx ?? 0 };
      const tab = activeTab(route, lastPrimary, routeIsMine(route, base.resolution));
      updateTabbar(tab.active, tab.current, doc);
      doc.title = route.screen === '' ? baseTitle : `${routeTitle(route.screen)} · ${baseTitle}`;
      // La temporada del portal llega a needs desde el contexto, nunca de config.js (R2-1).
      const needs = (screen.needs && screen.needs(route.params, base.datasets, { portalSeason: base.portal.season })) || [];
      if (needs.length) {
        paint(skeleton(screen.id));
        await Promise.all(needs);
        if (my !== token) return;   // otra navegación empezó mientras cargaba: no se pinta
      }
      if (needs.length || first.pending) {
        base = getContext();
        const again = settle(base);
        if (again.pending) throw Object.assign(new Error('temporada sin cargar'), { what: `la temporada ${seasonLabel(again.route.params.s)}` });
        if (routeHref(again.route.screen, again.route.params) !== routeHref(route.screen, route.params)) {
          if (depth >= MAX_REDIRECTS) throw new Error('Demasiadas redirecciones');
          return run(mode, notice || again.notice, depth + 1, target, focusId);
        }
      }
      const ctx = { ...base, route, params: route.params, lastPrimary, backHref: backHref(route) };
      // Solo se pinta Html de html``, que escapa cada interpolación (spec §5.1).
      const view = screen.render(ctx);
      if (!(view instanceof Html)) throw new TypeError(`render de ${screen.id} no devolvió Html`);
      paint(withNotice(String(view), notice));
      if (Object.hasOwn(PRIMARY, route.screen)) rememberPrimary(PRIMARY[route.screen]);
      if (screen.mount) {
        try {
          const done = screen.mount(root, ctx, nav);
          if (typeof done === 'function') cleanup = done;
        } catch (err) {
          console.error('[router] mount', err);
        }
        if (my !== token) return;   // mount ya ha navegado (nav.go, saveMyTeam…): manda esa navegación
      }
      place(mode, target, focusId);
    } catch (err) {
      if (my !== token) return;
      console.error('[router]', err);
      paint(errorScreen({ screenId: screen?.id || 'pendiente', title: routeTitle(route.screen), what: loadWhat(err), back: backHref(route) }));
      place(mode, 0, null);
    }
  }

  // Ir a un href de la app: pushState o replaceState según historyMode (o `forced`).
  function navigate(href, forced = null) {
    let mode = forced;
    if (!mode) {
      try {
        const target = parseRoute(href);
        const res = resolveParams(target, getContext());
        mode = historyMode(current, { screen: target.screen, params: res.params || target.params });
      } catch {
        mode = 'push';
      }
    }
    if (mode === 'replace') hist.replaceState(hist.state, '', href);
    else hist.pushState({ fbIdx: (entry()?.fbIdx ?? 0) + 1, fbKey: newKey() }, '', href);
    return show(mode);
  }

  // «‹»: la entrada anterior si es de la app; si no, el padre (spec §4.1).
  function goBack() {
    if ((entry()?.fbIdx ?? 0) > 0) {
      hist.back();
      return latest;
    }
    const parent = current ? parentOf(current) : null;
    return navigate(parent ? routeHref(parent.screen, parent.params) : '#/', 'push');
  }

  // Atrás, Adelante o un hash escrito a mano. popstate y hashchange llegan juntos: se atiende uno.
  function onLocation() {
    const st = entry();
    if (st && st.fbKey === seen.key && win.location.hash === seen.hash) return;
    if (!st) stamp(seen.idx + 1);   // entrada nueva del navegador, detrás de la última atendida
    show('pop');
  }

  // Delegación en el documento: enlaces #/… (con su modo de historial), «‹», Reintentar y
  // anclas internas como «Saltar al contenido», que nunca cambian la ruta.
  function onClick(event) {
    if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    const el = event.target && event.target.closest ? event.target.closest('a[href],[data-action]') : null;
    if (!el) return;
    const action = el.getAttribute('data-action');
    if (action === 'retry') {
      event.preventDefault();
      show('refresh');
      return;
    }
    if (action === 'back' && (entry()?.fbIdx ?? 0) > 0) {
      event.preventDefault();
      hist.back();
      return;
    }
    if (el.tagName !== 'A' || el.hasAttribute('download')) return;
    const target = el.getAttribute('target');
    if (target && target !== '_self') return;
    const href = el.getAttribute('href') || '';
    if (href.startsWith('#/')) {
      event.preventDefault();
      navigate(href);
    } else if (href.length > 1 && href.startsWith('#')) {
      const dest = doc.getElementById(decode(href.slice(1)));
      if (!dest) return;
      event.preventDefault();
      if (!dest.hasAttribute('tabindex')) dest.setAttribute('tabindex', '-1');
      dest.focus();
    }
  }

  const nav = {
    go: (screen, params) => navigate(routeHref(screen, params)),
    replace: (screen, params) => navigate(routeHref(screen, params), 'replace'),
    back: goBack,
    retry: () => show('refresh'),
    // «Hacer mi equipo» y la respuesta a E: lo guarda app.js y se vuelve a pintar la ruta.
    saveMyTeam(myTeam) {
      const saved = actions.saveMyTeam ? actions.saveMyTeam(myTeam) : false;
      show('refresh');
      return saved;
    },
  };

  if ('scrollRestoration' in hist) hist.scrollRestoration = 'manual';
  win.addEventListener('popstate', onLocation);
  win.addEventListener('hashchange', onLocation);
  win.addEventListener('scroll', () => {
    const st = entry();
    if (st) positions.set(st.fbKey, win.scrollY);
  }, { passive: true });
  doc.addEventListener('click', onClick);
  if (!entry()) stamp(0);
  show('initial');
  return { nav, idle: () => latest, current: () => current };
}
```

Crear `src/screen-pendiente.js`:

```js
// Pantalla provisional de las rutas de B3 (decisión 6 de B2): su h1 y un vacío honesto, para
// que ningún enlace de B2 lleve a una pantalla rota. Nunca se publica: el Plan B sale entero en B5.
import { html } from './html.js';
import { empty, screenHead } from './ui.js';
import { routeTitle } from './shell.js';

export const screen = {
  id: 'pendiente',
  needs: () => [],
  render: (ctx) => html`<section data-screen="pendiente" data-route="${ctx.route.screen}">${screenHead(routeTitle(ctx.route.screen), { back: ctx.backHref })}<div class="block">${empty('Esta pantalla llega en la próxima fase del rediseño.')}</div></section>`,
};
```

Crear `src/screens.js`:

```js
// Qué pantalla pinta cada ruta de §4.1 (el router las recibe de app.js). Las de B3 llevan la
// provisional (decisión 6 de B2) hasta que llegue la suya.
import { SCREENS } from './links.js';
import { screen as home } from './screen-home.js';
import { screen as pendiente } from './screen-pendiente.js';

const READY = { '': home };

export const SCREEN_MAP = Object.freeze(Object.fromEntries(SCREENS.map((name) => [name, READY[name] || pendiente])));
```

Reescribir `src/app.js` con este contenido:

```js
// Arranque (spec §5.2): almacén, registro de datos, modelo y router. index.html llama a
// start(document, window) cuando ya han llegado los datos inmediatos: importar este módulo no toca
// el navegador (test_rediseno_modulos).
import { PORTAL } from './config.js';
import { readGlobals } from './state.js';
import { createModel } from './model.js';
import { buildClubIndex, resolveMyTeam } from './myteam.js';
import { loadStore } from './store.js';
import { canaryTodayISO } from './links.js';
import { crestFallback } from './ui.js';
import { startRouter } from './router.js';
import { SCREEN_MAP } from './screens.js';

// Los datos de un pintado (el ctx de las pantallas sin la ruta, que añade el router): mi equipo
// resuelto contra la temporada del portal con el «hoy» de Canarias, un solo reloj (decisión 4).
function contextFor({ model, myTeam, portal, datasets, today, legacyDate = null }) {
  const resolution = resolveMyTeam(myTeam, model.season(portal.season), model.clubIndex(), today);
  return { model, myTeam, resolution, today, health: datasets.health, datasets, portal, legacyDate };
}

// El mismo contexto desde un almacén y con el día que se le pida: la base de las pruebas de las
// pantallas. Con el almacén vacío o bloqueado, loadStore da el equipo por defecto, sin preguntas.
export function startContext({ storage, portal, datasets, today }) {
  const store = loadStore(storage, { defaultTeam: portal.defaultTeam, portalSeason: portal.season });
  const model = createModel(datasets, { portalSeason: portal.season, buildClubIndex });
  const base = { season: portal.season, defaultTeam: portal.defaultTeam };
  return { ...contextFor({ model, myTeam: store.myTeam, portal: base, datasets, today }), lastPrimary: 'miequipo' };
}

export function start(doc, win) {
  // Escudos: miniatura → original → monograma (spec §5.4). Los errores de <img> no burbujean: se
  // escuchan en captura, y desde antes del primer pintado (escudos/s/ no existe hasta B4).
  doc.addEventListener('error', (event) => crestFallback(event.target), true);
  const storage = () => win.localStorage;
  const portal = { season: PORTAL.season, defaultTeam: PORTAL.defaultTeam };
  // Registro de datos: los globales inmediatos y lo que traen los cargadores perezosos.
  const datasets = { ...readGlobals(), seasonRaw: {}, matchDetail: null, lineups: {}, health: null };
  const model = createModel(datasets, { portalSeason: portal.season, buildClubIndex });
  const store = loadStore(storage, { defaultTeam: portal.defaultTeam, portalSeason: portal.season });
  // La fecha del literal oculto «Última actualización» de index.html, por si falta data-health.
  const legacyDate = doc.getElementById('legacyUpdated')?.textContent.match(/\d{2}\/\d{2}\/\d{4}/)?.[0] || null;
  const getContext = () => contextFor({
    model, myTeam: store.myTeam, portal, datasets, today: canaryTodayISO(new Date(), PORTAL.timeZone), legacyDate,
  });
  return startRouter({ screens: SCREEN_MAP, root: doc.getElementById('contenido'), getContext, window: win });
}
```

En `sw.js`, sustituir:

```js
  './src/app.js',
```

por:

```js
  './src/app.js',
  './src/router.js',
  './src/shell.js',
  './src/screens.js',
  './src/screen-pendiente.js',
```

- [ ] **Step 4: Run test to verify it passes**

```bash
cd /home/manolo/claude/futbol-base
node --test scripts/tests/test_rediseno_router.mjs 2>&1 | grep -E '^# (tests|pass|fail)'
```
Esperado:
```text
# tests 35
# pass 35
# fail 0
```
Las cajas de error de las pruebas se crean sin volcar sus `console.error` (`quietly`).

- [ ] **Step 5: Suites completas y los tres smoke**

```bash
cd /home/manolo/claude/futbol-base
python3 -m pytest scripts/tests/ -q 2>&1 | tail -1
node --test scripts/tests/test_*.mjs 2>&1 | grep -E '^# (tests|pass|fail)'
```
Esperado:
- pytest: el mismo recuento que al terminar la tarea anterior, sin `failed`.
- node: el recuento anterior más 35, sin fallos (`test_rediseno_links.mjs` cambia expectativas, no número de pruebas). `test_sw_fixes.mjs` comprueba que `STATIC_ASSETS` cubre el grafo nuevo de `app.js` (sin el paso de `sw.js`, falla con `./src/router.js … missing in STATIC_ASSETS`), y la prueba genérica de módulos del corte, que `router.js`, `shell.js`, `screens.js` y `screen-pendiente.js` no tocan el navegador al importarse.

Los tres smoke terminan en `PASS`: la portada sigue en `section[data-screen="home"][data-state]`, ahora pintada por el router.

```bash
cd /home/manolo/claude/futbol-base
node scripts/tests/render-smoke.mjs
node scripts/tests/interaction-smoke.mjs
node scripts/tests/pwa-smoke.mjs 2>&1 | grep -v '^PWA fixture HTTP 404 /escudos/s/'
```
Esperado, con el tamaño del DOM del día:
```text
PASS: render smoke OK — Mi equipo en estado D (DOM 6529 bytes)
PASS: la portada carga a 320px en claro, sin desplazamiento horizontal
PASS: la portada carga a 320px en oscuro, sin desplazamiento horizontal
PASS: la portada carga a 390px en claro, sin desplazamiento horizontal
PASS: la portada carga a 390px en oscuro, sin desplazamiento horizontal
PASS: la portada carga a 768px en claro, sin desplazamiento horizontal
PASS: la portada carga a 768px en oscuro, sin desplazamiento horizontal
PASS: la portada carga a 1440px en claro, sin desplazamiento horizontal
PASS: la portada carga a 1440px en oscuro, sin desplazamiento horizontal
PASS: de la app anterior (su SW real) al rediseño, con datos congelados: la 1.ª apertura es la anterior; sin conexión a medias, el aviso con «Reintentar»; la 2.ª y la 3.ª, la nueva con acta.css y sin mezclar módulos; futbolbase-v20991231a funciona sin conexión
```

- [ ] **Step 6: Verificación en Chrome (fuera del repo)**

Dos comprobaciones:
- `t6-router-check.mjs`: el router real en una página de prueba mínima, servida desde memoria, con pantallas falsas y el modelo de las fixtures. Recorre la barra, un partido, Atrás y Adelante del navegador, «‹» con y sin historial, un enlace directo, un enlace antiguo, una respuesta lenta (token), un error con Reintentar, «Saltar al contenido» y la barra de escritorio.
- `app-check.mjs`: el `app.js` real con `index.html` y los datos vivos: portada por el router, barra, Atrás, enlace antiguo, enlace directo a un partido y una ruta de B3. Con `TASK=6`, Jornada, Tabla y Partido son todavía la pantalla provisional.

```bash
cd /home/manolo/claude/futbol-base
S=/tmp/claude-1000/-home-manolo/db6fd8e0-f1e7-4e94-b6cd-ef7dd5bf6ae9/scratchpad/planB2
mkdir -p "$S"
cat > "$S/t6-router-check.mjs" <<'EOF'
// Comprobación de la Tarea 6 en Chrome: el router real (src/router.js) en una página de prueba
// mínima con pantallas falsas y el modelo de las fixtures congeladas. Recorre navegación con la
// barra, Atrás del navegador, «‹», enlace directo, enlace antiguo, token, Reintentar y foco.
// Uso, desde la raíz del repo (con Playwright en node_modules, Tarea 4): OUT=<dir> node <este fichero>
import { createServer } from 'node:http';
import { createRequire } from 'node:module';
import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import { extname, join, normalize, sep } from 'node:path';
import { pathToFileURL } from 'node:url';

const out = process.env.OUT;
if (!out) { console.error('Falta OUT=<directorio de capturas>'); process.exit(2); }
mkdirSync(out, { recursive: true });
const root = process.cwd();
const { renderHeader } = await import(pathToFileURL(join(root, 'src/shell.js')).href);
const { findChrome } = await import(pathToFileURL(join(root, 'scripts/tests/render-smoke.mjs')).href);
const { chromium } = createRequire(join(root, 'scripts/tests/x.mjs'))('playwright');

const J30 = '#/partido?g=PG2&r=Jornada%2030&h=Las%20Mesas%20Hu.&a=AD%20Hurac%C3%A1n';
const PAGE = `<!DOCTYPE html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Prueba del router</title><link rel="stylesheet" href="/acta.css"></head><body>
<a class="skip-link" href="#contenido">Saltar al contenido</a><header class="shell-header">${renderHeader()}</header>
<main id="contenido" class="page"></main>
<script type="module">
import { html } from '/src/html.js';
import { buildSeason, buildCups } from '/src/model.js';
import { routeHref } from '/src/links.js';
import { screenHead } from '/src/ui.js';
import { startRouter } from '/src/router.js';
const get = (name) => fetch('/scripts/tests/fixtures/rediseno/' + name + '.json').then((r) => r.json());
const [raw, cupsRaw] = await Promise.all([get('current-2025-2026'), get('cups-2025-2026')]);
const current = buildSeason({ name: raw.season, current: true, ...raw });
const cups = buildCups({ season: '2025-2026', ...cupsRaw });
const model = {
  season: (n) => (n === '2025-2026' ? current : null),
  group: (s, id) => (s === '2025-2026' ? current.groups.find((g) => g.id === id) || null : null),
  cups: () => cups,
};
const resolution = { status: 'ok', group: current.groups.find((g) => g.id === 'PG2'), name: 'Las Mesas Hu.', cat: 'prebenjamin' };
const getContext = () => ({ portal: { season: '2025-2026' }, model, resolution,
  myTeam: { name: 'Las Mesas Hu.', season: '2025-2026', cat: 'prebenjamin', groupId: 'PG2' }, today: '2026-09-23', health: null,
  datasets: { seasons: [{ name: '2025-2026', current: true }, { name: '2024-2025', current: false }], seasonRaw: {} } });
let release;
window.__gate = new Promise((resolve) => { release = resolve; });
window.__release = () => release();
let fails = 1;
const long = html\`<div class="box" style="height:1600px"><p style="padding:12px">Contenido largo</p></div>\`;
const page = (id, title, extra = () => '') => ({ id, needs: () => [],
  render: (ctx) => html\`<section data-screen="\${id}">\${screenHead(title, { back: ctx.backHref })}<p class="where">\${routeHref(ctx.route.screen, ctx.params)}</p>\${extra(ctx)}\${long}</section>\` });
const screens = {
  '': page('home', 'Portada de prueba', () => html\`<p><a id="to-partido" href="${J30}">Las Mesas Hu. – AD Huracán</a></p>\`),
  jornada: page('jornada', 'Jornada', () => html\`<p><a id="prev" href="#/jornada?g=PG2&r=Jornada%2029">‹ anterior</a> <a id="next" href="#/jornada?g=PG2&r=Jornada%2030">siguiente ›</a></p>\`),
  tabla: { ...page('tabla', 'Tabla'), needs: () => [window.__gate] },
  explorar: { ...page('explorar', 'Explorar'), needs: () => [fails-- > 0 ? Promise.reject(new Error('la temporada 2024/25')) : Promise.resolve()] },
  partido: page('partido', 'Partido'),
  ligas: page('ligas', 'Ligas'), copa: page('copa', 'Copa'),
};
window.__router = startRouter({ screens, root: document.getElementById('contenido'), getContext, window });
</script></body></html>`;

const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.woff2': 'font/woff2', '.png': 'image/png' };
const server = createServer((req, res) => {
  const url = new URL(req.url, 'http://x');
  if (url.pathname === '/__router.html') {
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    return res.end(PAGE);
  }
  const fp = normalize(join(root, decodeURIComponent(url.pathname)));
  if (!fp.startsWith(root + sep) || !existsSync(fp)) { res.statusCode = 404; return res.end('no'); }
  res.setHeader('Content-Type', MIME[extname(fp)] || 'application/octet-stream');
  res.end(readFileSync(fp));
}).listen(0, '127.0.0.1');
await new Promise((resolve) => server.once('listening', resolve));
const base = `http://127.0.0.1:${server.address().port}/__router.html`;

const browser = await chromium.launch({ executablePath: findChrome() });
const problems = [];
const check = (label, ok, detail) => { console.log(ok ? `ok  ${label}` : `MAL ${label}: ${JSON.stringify(detail)}`); if (!ok) problems.push(label); };
const state = (p) => p.evaluate(() => ({
  hash: location.hash, length: history.length, h1: document.querySelector('main h1')?.textContent ?? null,
  where: document.querySelector('.where')?.textContent ?? null, scrollY: Math.round(scrollY),
  focus: document.activeElement?.tagName + (document.activeElement?.id ? '#' + document.activeElement.id : ''),
  tabs: [...document.querySelectorAll('.tabbar a.tab')].filter((a) => a.hasAttribute('aria-current')).map((a) => [a.getAttribute('href'), a.getAttribute('aria-current')]),
  skeleton: !!document.querySelector('[data-skeleton]'), error: !!document.querySelector('[data-state="error"]'), title: document.title,
}));
const settle = (p) => p.evaluate(() => window.__router.idle());
const open = async (hash, width = 390, { wait = true } = {}) => {
  const ctx = await browser.newContext({ viewport: { width, height: 800 }, reducedMotion: 'reduce' });
  const p = await ctx.newPage();
  p.setDefaultTimeout(8000);
  p.on('pageerror', (e) => problems.push(`error de página: ${e.message}`));
  await p.goto(base + hash);
  await p.waitForFunction(() => window.__router);
  if (wait) await settle(p);
  return p;
};

// 1. Navegación con la barra, enlace a un partido, Atrás del navegador y «‹».
{
  const p = await open('#/');
  let s = await state(p);
  check('portada: h1 y Mi equipo con aria-current="page"', s.h1 === 'Portada de prueba' && JSON.stringify(s.tabs) === '[["#/","page"]]', s);
  const start = s.length;
  await p.click('.tabbar a[href="#/jornada"]');
  await settle(p);
  s = await state(p);
  check('barra → Jornada: pushState, título, aria-current y foco al h1', s.hash === '#/jornada' && s.length === start + 1 && s.h1 === 'Jornada'
    && JSON.stringify(s.tabs) === '[["#/jornada","page"]]' && s.focus === 'H1' && s.title === 'Jornada · Prueba del router', s);
  await p.click('#next');
  await settle(p);
  s = await state(p);
  check('siguiente jornada: replaceState y el foco vuelve a «siguiente ›»', s.length === start + 1 && s.hash === '#/jornada?g=PG2&r=Jornada%2030' && s.focus === 'A#next', s);
  await p.evaluate(() => window.scrollTo(0, 600));
  await p.waitForTimeout(100);
  await p.goto(base + '#/');           // navegación del navegador a otro hash (entrada nueva)
  await settle(p);
  await p.click('#to-partido');
  await settle(p);
  s = await state(p);
  check('partido desde la portada: arriba, Mi equipo con aria-current="true"', s.scrollY === 0 && JSON.stringify(s.tabs) === '[["#/","true"]]' && s.h1 === 'Partido', s);
  await p.click('a.back');
  await settle(p);
  s = await state(p);
  check('«‹» con entrada anterior de la app: history.back() a la portada', s.hash === '#/' && s.h1 === 'Portada de prueba', s);
  await p.goBack();
  await settle(p);
  s = await state(p);
  check('Atrás del navegador: la jornada, con su desplazamiento', s.hash === '#/jornada?g=PG2&r=Jornada%2030' && s.scrollY === 600 && s.h1 === 'Jornada', s);
  await p.goForward();
  await settle(p);
  s = await state(p);
  check('Adelante: la portada otra vez', s.hash === '#/' && s.h1 === 'Portada de prueba', s);
  await p.screenshot({ path: `${out}/t6-portada-390.png` });
  await p.context().close();
}

// 2. Enlace directo a un partido: «‹» sigue el enlace al padre.
{
  const p = await open(J30);
  let s = await state(p);
  check('enlace directo a un partido de mi equipo: Mi equipo con "true"', s.h1 === 'Partido' && JSON.stringify(s.tabs) === '[["#/","true"]]', s);
  const start = s.length;
  await p.click('a.back');
  await settle(p);
  s = await state(p);
  check('«‹» sin historial de la app: la jornada del partido, con pushState', s.hash === '#/jornada?s=2025-2026&g=PG2&r=Jornada%2030' && s.length === start + 1 && s.h1 === 'Jornada', s);
  await p.context().close();
}

// 3. Enlace antiguo de WhatsApp: replaceState, sin entrada nueva.
{
  const p = await open('#section=clasif&cat=prebenjamin&season=2025-2026&group=PG2', 390, { wait: false });
  await p.waitForSelector('[data-skeleton]');
  const s = await state(p);
  // Una pestaña nueva parte de about:blank: la carga directa deja history.length en 2, como en el escenario 2.
  check('enlace antiguo → #/tabla?s=2025-2026&g=PG2 sin entrada nueva', s.hash === '#/tabla?s=2025-2026&g=PG2' && s.length === 2 && s.skeleton, s);
  await p.evaluate(() => window.__release());
  await settle(p);
  const t = await state(p);
  check('… y la tabla se pinta al llegar sus datos', t.h1 === 'Tabla' && t.where === '#/tabla?s=2025-2026&g=PG2', t);
  await p.context().close();
}

// 4. Token: la tabla tarda y el usuario se va a Jornada; al llegar, no pinta encima.
{
  const p = await open('#/');
  await p.click('.tabbar a[href="#/tabla"]');
  let s = await state(p);
  check('tabla lenta: esqueleto mientras carga', s.skeleton && s.hash === '#/tabla', s);
  await p.click('.tabbar a[href="#/jornada"]');
  await settle(p);
  await p.evaluate(() => window.__release());
  await p.waitForTimeout(150);
  s = await state(p);
  check('token: la respuesta lenta no pinta sobre Jornada', s.h1 === 'Jornada' && s.hash === '#/jornada' && JSON.stringify(s.tabs) === '[["#/jornada","page"]]', s);
  await p.context().close();
}

// 5. Error de carga y Reintentar; «Saltar al contenido».
{
  const p = await open('#/explorar');
  let s = await state(p);
  check('error: caja «No se pudieron cargar los datos de …» con su h1', s.error && s.h1 === 'Explorar', s);
  check('texto de la caja', (await p.textContent('.error-text')) === 'No se pudieron cargar los datos de la temporada 2024/25.');
  await p.screenshot({ path: `${out}/t6-error-390.png` });
  await p.click('button[data-action="retry"]');
  await settle(p);
  s = await state(p);
  check('Reintentar vuelve a cargar y pinta', !s.error && s.h1 === 'Explorar' && s.focus === 'H1', s);
  await p.keyboard.press('Tab');
  const skip = await p.evaluate(() => document.activeElement.className);
  await p.keyboard.press('Enter');
  s = await state(p);
  check('Saltar al contenido: foco en main sin cambiar la ruta', skip === 'skip-link' && s.focus === 'MAIN#contenido' && s.hash === '#/explorar', s);
  await p.context().close();
}

// 6. Escritorio: la misma barra, como pestañas en la cabecera.
{
  const p = await open('#/jornada', 1440);
  const s = await state(p);
  check('1440 px: Jornada marcada en las pestañas', JSON.stringify(s.tabs) === '[["#/jornada","page"]]', s);
  await p.screenshot({ path: `${out}/t6-jornada-1440.png` });
  await p.context().close();
}

await browser.close();
server.close();
console.log(problems.length ? 'PROBLEMAS:\n' + problems.join('\n') : `OK: el router pasa en Chrome; capturas en ${out}/t6-*.png`);
process.exit(problems.length ? 1 : 0);
EOF
cat > "$S/app-check.mjs" <<'EOF'
// Comprobación de app.js en Chrome (Tareas 6 y 12) con el index.html y los datos del worktree.
// Uso, desde la raíz del repo (con Playwright en node_modules, Tarea 4): OUT=<dir> TASK=6|12 node <este fichero>
import { createRequire } from 'node:module';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const out = process.env.OUT;
const task = process.env.TASK || '6';
if (!out) { console.error('Falta OUT=<directorio de capturas>'); process.exit(2); }
mkdirSync(out, { recursive: true });
const root = process.cwd();
const { startServer, findChrome } = await import(pathToFileURL(join(root, 'scripts/tests/render-smoke.mjs')).href);
const { chromium } = createRequire(join(root, 'scripts/tests/x.mjs'))('playwright');
const server = await startServer();
const base = `http://127.0.0.1:${server.address().port}/index.html`;
const browser = await chromium.launch({ executablePath: findChrome() });
const problems = [];
const check = (label, ok, detail) => { console.log(ok ? `ok  ${label}` : `MAL ${label}: ${JSON.stringify(detail)}`); if (!ok) problems.push(label); };
const state = (p) => p.evaluate(() => ({
  hash: location.hash, h1: document.querySelector('main h1')?.textContent ?? null,
  screen: document.querySelector('main section')?.getAttribute('data-screen') ?? null,
  state: document.querySelector('main section')?.getAttribute('data-state') ?? null,
  tabs: [...document.querySelectorAll('.tabbar a.tab')].filter((a) => a.hasAttribute('aria-current')).map((a) => [a.getAttribute('href'), a.getAttribute('aria-current')]),
  back: document.querySelector('main a.back')?.getAttribute('href') ?? null,
  offline: document.querySelector('.shell-offline')?.textContent ?? null,
}));
async function open(hash, { width = 390, scheme = 'light', init = null } = {}) {
  const ctx = await browser.newContext({ viewport: { width, height: 844 }, colorScheme: scheme, serviceWorkers: 'block', timezoneId: 'Atlantic/Canary', locale: 'es-ES' });
  if (init) await ctx.addInitScript(init);
  const p = await ctx.newPage();
  p.setDefaultTimeout(8000);
  p.on('pageerror', (e) => problems.push(`error de JavaScript en ${hash}: ${e.message}`));
  await p.goto(base + hash);
  await p.waitForSelector('main section[data-screen]');
  return p;
}

{
  const p = await open('#/');
  let s = await state(p);
  check('portada por el router: data-state y Mi equipo marcado', s.screen === 'home' && /^[ABCDEX]$/.test(s.state || '') && JSON.stringify(s.tabs) === '[["#/","page"]]', s);
  await p.screenshot({ path: `${out}/app${task}-portada-390.png` });
  await p.click('.tabbar a[href="#/jornada"]');
  await p.waitForSelector(task === '12' ? 'main section[data-screen="jornada"]' : 'main section[data-route="jornada"]');
  s = await state(p);
  check('barra → Jornada', s.hash === '#/jornada' && JSON.stringify(s.tabs) === '[["#/jornada","page"]]'
    && (task === '12' ? s.screen === 'jornada' : s.h1 === 'Jornada' && s.screen === 'pendiente'), s);
  await p.goBack();
  await p.waitForSelector('main section[data-screen="home"]');
  s = await state(p);
  check('Atrás: la portada', s.hash === '#/' && s.screen === 'home', s);
  await p.context().close();
}
{
  const p = await open('#section=clasif&cat=prebenjamin&season=2025-2026&group=PG2');
  const s = await state(p);
  check('enlace antiguo → #/tabla?s=2025-2026&g=PG2', s.hash === '#/tabla?s=2025-2026&g=PG2' && (task === '12' ? s.screen === 'tabla' : s.h1 === 'Tabla'), s);
  await p.context().close();
}
{
  const p = await open('#/partido?g=PG2&r=Jornada%2030&h=Las%20Mesas%20Hu.&a=AD%20Hurac%C3%A1n');
  const s = await state(p);
  check('enlace directo a un partido de mi equipo: Mi equipo con "true" y «‹» a su jornada',
    JSON.stringify(s.tabs) === '[["#/","true"]]' && s.back === '#/jornada?s=2025-2026&g=PG2&r=Jornada%2030', s);
  await p.context().close();
}
{
  const p = await open('#/copa?g=MCPK1');
  const s = await state(p);
  check('ruta de B3: la pantalla provisional con su h1, Explorar marcado', s.screen === 'pendiente' && s.h1 === 'Copa' && JSON.stringify(s.tabs) === '[["#/explorar","true"]]', s);
  await p.screenshot({ path: `${out}/app${task}-copa-390.png` });
  await p.context().close();
}
await browser.close();
server.close();
console.log(problems.length ? 'PROBLEMAS:\n' + problems.join('\n') : `OK: app.js (tarea ${task}) en Chrome; capturas en ${out}`);
process.exit(problems.length ? 1 : 0);
EOF
OUT="$S/shots-t6" node "$S/t6-router-check.mjs"
OUT="$S/shots-t6" TASK=6 node "$S/app-check.mjs"
```
Esperado:
```text
ok  portada: h1 y Mi equipo con aria-current="page"
ok  barra → Jornada: pushState, título, aria-current y foco al h1
ok  siguiente jornada: replaceState y el foco vuelve a «siguiente ›»
ok  partido desde la portada: arriba, Mi equipo con aria-current="true"
ok  «‹» con entrada anterior de la app: history.back() a la portada
ok  Atrás del navegador: la jornada, con su desplazamiento
ok  Adelante: la portada otra vez
ok  enlace directo a un partido de mi equipo: Mi equipo con "true"
ok  «‹» sin historial de la app: la jornada del partido, con pushState
ok  enlace antiguo → #/tabla?s=2025-2026&g=PG2 sin entrada nueva
ok  … y la tabla se pinta al llegar sus datos
ok  tabla lenta: esqueleto mientras carga
ok  token: la respuesta lenta no pinta sobre Jornada
ok  error: caja «No se pudieron cargar los datos de …» con su h1
ok  texto de la caja
ok  Reintentar vuelve a cargar y pinta
ok  Saltar al contenido: foco en main sin cambiar la ruta
ok  1440 px: Jornada marcada en las pestañas
OK: el router pasa en Chrome; capturas en /tmp/claude-1000/-home-manolo/db6fd8e0-f1e7-4e94-b6cd-ef7dd5bf6ae9/scratchpad/planB2/shots-t6/t6-*.png
ok  portada por el router: data-state y Mi equipo marcado
ok  barra → Jornada
ok  Atrás: la portada
ok  enlace antiguo → #/tabla?s=2025-2026&g=PG2
ok  enlace directo a un partido de mi equipo: Mi equipo con "true" y «‹» a su jornada
ok  ruta de B3: la pantalla provisional con su h1, Explorar marcado
OK: app.js (tarea 6) en Chrome; capturas en /tmp/claude-1000/-home-manolo/db6fd8e0-f1e7-4e94-b6cd-ef7dd5bf6ae9/scratchpad/planB2/shots-t6
```
Si algo falla, la línea `MAL` lleva el estado de la página (hash, `history.length`, h1, foco, desplazamiento y barra). Una pestaña nueva de Playwright parte de `about:blank`, así que una carga directa deja `history.length` en 2.

Abrir con Read `t6-error-390.png` y `t6-jornada-1440.png`: la caja de error bajo la cabecera «Explorar», con Explorar marcado en la barra, y la pestaña Jornada subrayada en tinta en la cabecera de escritorio.

- [ ] **Step 7: Commit**

```bash
cd /home/manolo/claude/futbol-base
git add src/router.js src/screen-pendiente.js src/screens.js src/app.js sw.js src/links.js src/model.js scripts/tests/test_rediseno_router.mjs scripts/tests/test_rediseno_links.mjs
git commit -F - <<'EOF'
feat(rediseño): router con token de navegación, historial y enlaces antiguos (B2, tarea 6)

router.js: resolveParams con los valores por defecto y las redirecciones
de §4.1 (s del portal; g, el grupo de mi equipo o, en una temporada
pasada, el primero de liga con su nombre; grupos que no son de liga a
#/copa; con E o X, Jornada y Tabla a #/ligas con «Elige tu equipo en Mi
equipo»; partidos y grupos que no existen, con aviso), historyMode
(pushState o replaceState), parentOf, activeTab y routeIsMine.
startRouter atiende hashchange y popstate, traduce los enlaces antiguos
con replaceState, pinta needs → render → mount solo si su token sigue
vigente (needs recibe la temporada del portal del contexto, nunca de
config.js), restaura el desplazamiento por entrada, lleva el foco al h1 y
resuelve «‹» y Reintentar. start(doc, win) de app.js, que llama
index.html, arranca el router con screens.js, que da a las rutas de B3
la pantalla provisional (screen-pendiente.js); startContext sigue siendo
el contexto de las pruebas.

Revisión adversarial: el router no descarta lo que las pantallas saben
leer (findRound y findMatch, nuevas en model.js: la jornada por su
número y el único partido h–a del grupo); los enlaces antiguos
conservan su temporada, y «miequipo» con mi equipo abre Mi equipo
(translateLegacy con isMine); una temporada que no existe se quita con
«No existe la temporada …; te enseñamos la actual».

- test_rediseno_router: cada fila de §4.1 sobre las fixtures y el router
  con un window y un document falsos (respuesta lenta, enlace antiguo,
  Atrás, «‹», Reintentar, foco y sesión).

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01Sg56KK3oZgo8Ye7Snj6wG9
EOF
git show --stat --oneline HEAD | tail -1
```
Esperado: `9 files changed`, con `scripts/tests/test_rediseno_links.mjs`, `scripts/tests/test_rediseno_router.mjs`, `src/app.js`, `src/links.js`, `src/model.js`, `src/router.js`, `src/screen-pendiente.js`, `src/screens.js` y `sw.js`.

---

### Task 7: Mi equipo (1): cabecera, estados E, X, B, C y A, y el aviso `stale`

La portada es la pantalla que más usa la familia: esta tarea sustituye la portada mínima del corte por la de §4.2 en todos sus estados salvo el contenido de D, que completa la Tarea 8.

**Contexto** (medido el 24/09/2026 sobre las fixtures congeladas; `currentAt(día)` deja sin marcador los partidos de ese día en adelante, pero no toca la clasificación, que es la final):
- **Estado A.** PG2 el 01/03/2026: el próximo partido de Las Mesas Hu. es la jornada 18, el sábado 7 de marzo a las 09:00, en casa de Veteranos («faltan 6 días»).
  - Ningún partido de PG2 trae campo en 2025-26 (0 de 182), así que en PG2 nunca sale «Cómo llegar» y la acción principal pasa a ser «Calendario».
  - El único partido de Las Mesas Hu. con campo en las fixtures es el de A2 del 23/05/2026 (jornada 22, contra Simusetti, en «Pepe Gonçalvez», el mismo campo que pinta la maqueta 4).
- **«Hoy» de Canarias** (foco de revisión 4). La pantalla nunca lee el reloj: usa `ctx.today`, que el router calcula en Canarias (Tarea 2). El 07/03 el partido de ese día es `pendiente` y su cuenta atrás es «hoy»; el 06/03, «mañana». En la frescura, las 23:30 UTC del 02/06 son las 0:30 del 03/06 en Canarias: «comprobada hoy a las 0:30».
- **Estado C, tres textos** (B1, «Para B2»), con PG2:
  - 03/06/2026: Las Mesas ya jugó la jornada 30 (02/06) y el grupo no ha terminado (quedan los partidos del 06/06): «Ya ha jugado todos sus partidos».
  - 31/05/2026 con la fecha de su partido de la jornada 30 borrada: «Próximo partido sin fecha publicada».
  - 03/06/2026 con la jornada 30 sin marcador: «Resultado pendiente de publicar». Su cobertura cuenta solo el partido `sin resultado`: «25 de 26 partidos con resultado y 2 contra CD Batán (retirado)».
- **Estado B, dos causas** (B1, M2):
  - 2026/27 simulada el 01/10/2026: el grupo no ha jugado nada. El próximo partido sale normal (jornada 1, domingo 11 de octubre, «faltan 10 días»), un único vacío «Aún no se ha jugado ninguna jornada» y la clasificación a cero en el orden de la fuente. Nada de 2025/26 en pantalla, ni siquiera la comprobación de `data-health`, que es de 2025-2026.
  - CD Batán, retirado en PG2, el 01/03/2026: el grupo sí ha jugado. Ni «Aún no se ha jugado ninguna jornada» ni tabla a cero: «CD Batán figura como retirado en este grupo» y la clasificación real.
- **Cifras de Las Mesas en PG2** (03/06/2026): 90 a favor y 120 en contra (de la tabla); por partido 3,2 – 4,6; en casa 5G 1E 7P y fuera 5G 0E 8P; mejor resultado 9–2 en Calero y peor derrota 1–11 en Unión Viera (del calendario). Nota de cobertura: «26 partidos en el calendario y 2 contra CD Batán (retirado)», el caso 6 de §11.
- **Goleadores.** Las fixtures no traen `data-goleadores.js`: la prueba usa una copia literal de sus filas reales, como hace `test_rediseno_ui.mjs` con la tabla de PG2. Los 5 primeros de Las Mesas en PG2 son Theo De La Rosa Perello (12 goles en 17 partidos), Agoney Santana Santacruz (11/21), Einar Ruiz Aleman (9/23), Pablo Hidalgo Camejo (8/18) y Nadir Medina Hairach (8/21).
- **Estado E**, caso 2b de §11: «Las Mesas Hu. B» guardado en FF13 pregunta entre A2 («Las Mesas Hu.») y B2 («Las Mesas B»). Desde 2024-25 salen tres candidatos (A2, B2 y PG2), y el favorito v1 migrado de un torneo (MCP3, «UD Las Mesas Huracán») pregunta con uno solo (decisión 13 de B1).
- **Estado X:** 2026/27 simulada sin PG2: «Las Mesas Hu. no aparece en 2026/27».
- **Piezas compartidas** (decisiones del controlador): la cabecera es `screenHead` de `ui.js` y la temporada se lee con `seasonLabel` de `model.js`, las dos de la Tarea 4. Esta tarea es la primera del plan que necesita compartir un enlace: define `shareLink` y `copyText` en `links.js`, donde §5.2 pone «compartir», y Jornada y Partido los importan en vez de repetirlos. `shareLink` devuelve el resultado, y cada pantalla lo dice a su manera. El `.ics` sale con `downloadCalendar` de `links.js`, como en Jornada.
- **Fechas y números sin los datos de idioma** (B9 de la revisión adversarial). Los días y los meses van escritos en `links.js` (`weekdayDate`, `dayMonth`, `dayMonthLong` y `monthName`, más `WEEKDAYS` y `MONTHS`, que Jornada importa), y los números con un decimal se escriben con `toFixed` y coma: nada de lo que se ve depende de los datos de idioma del navegador ni del Node que ejecuta las pruebas, que el bot no fija. `displayDate`, que usaba `toLocaleDateString` y no tiene uso desde el corte, se va. Solo quedan en `Intl` las conversiones de zona horaria con partes numéricas (el «hoy» y la hora de Canarias).
- **`data-health.json`** alimenta la caja de D (Tarea 8) y la frescura: `needs` lo pide con `ensureHealth()` si todavía no está en `datasets.health` y lo deja allí, y nunca rechaza (sin él, la portada se pinta igual). Así el primer pintado ya lo trae, sin repintar ni saltos.
- **Modelo de las pruebas:** `createModel` de la Tarea 3 sobre las fixtures (`datasetsFrom`), con `buildClubIndex` inyectado. En las 2026/27 simuladas, sin goleadores: el modelo daría los de 2025-26 como de la temporada del portal.
- **Cada semana real de 2025/26** (foco de revisión 5), para Las Mesas Hu. (PG2 y FF5), Las Mesas Hu. B (FF13), RC Victoria, CD Batán y Unión Tetir (PFV2): 57 semanas × 6 equipos salen en A, B, C, D o E, siempre con algún bloque y sin «undefined», «null» ni «NaN». Tarda 1,4 s.

**Files:**
- Modify: `src/screen-home.js`: se sustituye entero. La portada mínima del corte (Tarea 4) pasa a ser la de esta tarea, y conserva su contrato, que fijan `test_rediseno_home.mjs` y `test_rediseno_smoke.mjs`: `screen.id`, la raíz `<section data-screen="home" data-state="…">`, la cabecera de pantalla con un solo `h1` con el nombre del equipo y el primer bloque de cada estado.
- Modify: `src/links.js`: las fechas en castellano sustituyen a `displayDate`, y se añaden al final `copyText` y `shareLink`.
- Modify: `scripts/tests/test_rediseno_modulos.mjs`: una prueba al final (ningún módulo formatea con los datos de idioma).
- Modify: `acta.css`: se añade al final el bloque del paso 3.
- Create: `scripts/tests/test_rediseno_portada.mjs`.

**Interfaces:**
- Consumes:
  - de B1: `html` (`html.js`); `box`, `cells`, `crest`, `empty`, `notice` y `standingsTable` (`ui.js`); `lastResults`, `matchState`, `playerName`, `retiredTeams`, `seasonSummary`, `teamFixtures` y `teamShort` (`model.js`); `buildClubIndex`, `homeState` y `resolveMyTeam` (`myteam.js`); `buildCalendar`, `countdownLabel`, `downloadCalendar`, `routeHref` y `venueUrl` (`links.js`); `loadStore` y `LEGACY_KEY` (`store.js`, en la prueba);
  - de las Tareas 2 a 4: `ensureHealth()` (`state.js`), `createModel` y `datasetsFrom` (en la prueba), y `screenHead` (`ui.js`) y `seasonLabel` (`model.js`);
  - de la Tarea 3: `sourceInfo(group, historical)` → `{ kind: 'oficial' | 'calculada' | 'corregida', source, url }`, con `source` el nombre legible de la fuente («futbolaspalmas.com») o `null` sin URL;
  - de la Tarea 4: `teamScorers(gol, team)` de `state.js`, con `gol` en la forma de `GOL_PREBENJ` (`[{ id, g, s: [[nombre, equipo, goles, partidos]] }]`) y `team` = `{ name, cat, groupId }` (las claves de más se ignoran) → `[{ name, goals, games }]`, por goles y después por partidos;
  - el `ctx` del esqueleto: `resolution`, `myTeam`, `today`, `health`, `datasets.shields`, `portal.season` y `model.scorers(season, cat)`, que da ese `gol` de la temporada actual y `[]` en las pasadas;
  - `nav.saveMyTeam(myTeam)` del esqueleto.
- Produces, en `src/screen-home.js`:
  - `screen = { id: 'home', needs(params, datasets) → [ensureHealth] o [], render(ctx) → Html, mount(root, ctx, nav) }`:
    - raíz `<section data-screen="home" data-state="A|B|C|D|E|X">`, cabecera `header.screen-head` (de `screenHead`) con el `h1`, y columnas `.home-cols > .home-main + .home-side`;
    - marcadores de comportamiento: `[data-action="calendario"]`, `[data-action="compartir"]`, `[data-action="elegir"][data-index]` y la región `[data-role="aviso"]` (`role="status"`);
  - `coverageText(coverage, missing = 0)` → texto de la nota de cobertura (spec §7) o `null`;
  - `shareData(match, pageHref)` → `{ title, text, url }` del partido;
  - `matchCalendar(match, group, { url, now })` → el `.ics` de un partido.
- Produces, para todas las pantallas, en `src/links.js`: `copyText(text)` → `Promise<boolean>` y `shareLink({ title, text, url })` → `Promise<'compartido' | 'cancelado' | 'copiado' | 'no copiado'>`; y las fechas sin `Intl`: `weekdayDate(iso)` → `'sáb 7 mar'`, `dayMonth(iso)` → `'23 sept'`, `dayMonthLong(iso)` → `'23 de septiembre'`, `monthName(iso)` → `'junio'` (`null` si no es un día válido), y `WEEKDAYS` y `MONTHS`.

- [ ] **Step 1: Write the failing test**

Crear `scripts/tests/test_rediseno_portada.mjs`:

```js
// Mi equipo, la portada (Plan B2, Tareas 7 y 8; spec §4.2, §4.8, §6.4 y §7), con datos reales
// congelados y `today` inyectado. render(ctx) se prueba sin DOM. El modelo del contexto es
// createModel (Tarea 3) sobre las fixtures, con buildClubIndex inyectado.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { fixture } from './fixtures/rediseno/load.mjs';
import { currentAt, nextSeasonRaw, datasetsFrom } from './fixtures/rediseno/simulate.mjs';
import { buildSeason, createModel, teamFixtures } from '../../src/model.js';
import { buildClubIndex, resolveMyTeam } from '../../src/myteam.js';
import { shareLink, copyText, weekdayDate, dayMonth, dayMonthLong, monthName } from '../../src/links.js';
import { loadStore, LEGACY_KEY } from '../../src/store.js';
import { screen, coverageText, shareData, matchCalendar } from '../../src/screen-home.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const shields = fixture('shields');
const health = fixture('health');
const LAS_MESAS = { name: 'Las Mesas Hu.', season: '2025-2026', cat: 'prebenjamin', groupId: 'PG2' };

// data-goleadores.js (23/09/2026), copia literal: los goleadores de Las Mesas Hu. en PG2 (GOL_PREBENJ)
// y en A2 (GOL_BENJ), más los dos primeros de AD Huracán en PG2, que la portada nunca enseña.
const GOL = {
  prebenjamin: [{ id: 'PG2', g: 'PREBENJAMIN GC GRUPO 2', s: [
    ['León Rodríguez, Lucas', 'AD Huracán', 50, 20], ['Rodriguez Aloma, Antoine', 'AD Huracán', 27, 19],
    ['De La Rosa Perello, Theo', 'Las Mesas Hu.', 12, 17], ['Santana Santacruz, Agoney', 'Las Mesas Hu.', 11, 21],
    ['Ruiz Aleman, Einar', 'Las Mesas Hu.', 9, 23], ['Hidalgo Camejo, Pablo', 'Las Mesas Hu.', 8, 18],
    ['Medina Hairach, Nadir', 'Las Mesas Hu.', 8, 21], ['Peña Peña, Alejandro', 'Las Mesas Hu.', 6, 20],
    ['Parcero Ramirez, Neyzan', 'Las Mesas Hu.', 5, 17], ['Hernandez Betancor, Yeudiel', 'Las Mesas Hu.', 4, 5],
    ['Falcon Montilla, Mateo', 'Las Mesas Hu.', 3, 21], ['Morales Gonzalez, Daniel', 'Las Mesas Hu.', 1, 16],
    ['Rodriguez Del Rosario, Yadiel', 'Las Mesas Hu.', 1, 21],
  ] }],
  benjamin: [{ id: 'A2', g: 'BENJAMIN SEGUNDA FASE A-G2', s: [
    ['Espiau Chicoy, Alvaro', 'Las Mesas Hu.', 23, 19], ['Espiau Chicoy, Sergio', 'Las Mesas Hu.', 16, 19],
    ['Rodriguez Montesdeoca, Iker', 'Las Mesas Hu.', 13, 16], ['Lorenzo Hernandez, Joel', 'Las Mesas Hu.', 12, 17],
    ['Navarro Melgar, Lucas', 'Las Mesas Hu.', 9, 16], ['Llarena Moreno, Carlos', 'Las Mesas Hu.', 8, 19],
  ] }],
};

// El ctx del router (esqueleto de B2), con createModel sobre las fixtures (buildClubIndex inyectado).
// `resolution`, si llega, es una función ({ season, index }) → resolución.
function homeCtx({
  raw = fixture('current-2025-2026'), myTeam = LAS_MESAS, today, portalSeason = '2025-2026',
  withHealth = health, legacyDate = null, gol = GOL, resolution,
} = {}) {
  const datasets = datasetsFrom(raw, { golBenj: gol.benjamin || null, golPrebenj: gol.prebenjamin || null, health: withHealth });
  const model = createModel(datasets, { portalSeason, buildClubIndex });
  const season = model.season(portalSeason);
  const index = model.clubIndex();
  return {
    route: { screen: '', params: {} }, params: {}, model, myTeam, today, health: withHealth, legacyDate,
    resolution: resolution ? resolution({ season, index }) : resolveMyTeam(myTeam, season, index, today),
    datasets, portal: { season: portalSeason, defaultTeam: { cat: 'prebenjamin', groupId: 'PG2', name: 'Las Mesas Hu.' } },
    lastPrimary: 'miequipo',
  };
}
const render = options => String(screen.render(homeCtx(options)));

// Texto visible: sin etiquetas (las de línea, sin hueco), con las entidades deshechas y los espacios juntos.
const text = markup => String(markup).replace(/<\/?(?:b|abbr)\b[^>]*>/g, '').replace(/<[^>]+>/g, ' ')
  .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&')
  .replace(/\s+/g, ' ').trim();
// El bloque <section class="block"> cuyo título es `title`, o null (los bloques no se anidan).
const blockOf = (markup, title) => (String(markup).match(/<section class="block"[^>]*>[\s\S]*?<\/section>/g) || [])
  .find(block => block.includes(`<h2 class="block-title">${title}</h2>`)) || null;
const titles = markup => [...String(markup).matchAll(/<h2 class="block-title">(.*?)<\/h2>/g)].map(m => m[1]);

// Un caso real de cada estado. En las 2026/27 simuladas no hay goleadores: el modelo daría los de
// 2025-26 como de la temporada del portal.
const CASES = {
  A: { raw: currentAt('2026-03-01'), today: '2026-03-01' },
  B: { raw: nextSeasonRaw({ benjamin: ['A1', 'B2', 'FF15'], prebenjamin: ['PG2', 'PG3'] }),
    myTeam: { ...LAS_MESAS, season: '2026-2027' }, today: '2026-10-01', portalSeason: '2026-2027', gol: {} },
  C: { raw: currentAt('2026-06-03'), today: '2026-06-03' },
  D: { today: '2026-09-23' },
  E: { myTeam: { name: 'Las Mesas Hu. B', season: '2025-2026', cat: 'benjamin', groupId: 'FF13' }, today: '2026-09-23' },
  X: { raw: nextSeasonRaw({ benjamin: ['A1'], prebenjamin: ['PG3'] }), today: '2026-10-01', portalSeason: '2026-2027', gol: {} },
};

test('contrato de pantalla: id home, sin cargas con data-health ya cargado, y una sección con data-state y un solo h1 en cada estado', () => {
  assert.equal(screen.id, 'home');
  assert.deepEqual(screen.needs({}, { health }), []);
  assert.equal(typeof screen.mount, 'function');
  for (const [state, options] of Object.entries(CASES)) {
    const out = render(options);
    assert.match(out, new RegExp(`^<section data-screen="home" data-state="${state}">`), state);
    assert.ok(out.endsWith('</section>'), state);
    assert.equal((out.match(/<h1[\s>]/g) || []).length, 1, state);
  }
});

test('needs: data-health.json una vez, guardado en datasets.health, y nunca rechaza', async () => {
  const saved = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async () => { calls += 1; return { ok: true, status: 200, text: async () => JSON.stringify(health) }; };
  try {
    const datasets = { health: null };
    const loads = screen.needs({}, datasets);
    assert.equal(loads.length, 1);
    await Promise.all(loads);
    assert.equal(datasets.health.nextSeason.status, 'pending');
    assert.deepEqual(screen.needs({}, datasets), [], 'cargado, no se vuelve a pedir');
    assert.equal(calls, 1);
  } finally {
    globalThis.fetch = saved;
  }
});

test('cabecera (screenHead): escudo de 46 sin carga diferida, nombre en el h1, etiqueta de grupo y «Cambiar» a Explorar con el buscador', () => {
  const head = render(CASES.A).match(/<header class="screen-head">.*?<\/header>/)[0];
  assert.match(head, /^<header class="screen-head"><img class="crest crest-46" src="\.\/escudos\/s\/lasMesasEscudo\.png"/);
  assert.doesNotMatch(head, /loading="lazy"/);
  assert.match(head, /decoding="async"><div class="screen-head-text"><h1>Las Mesas Hu\.<\/h1><p class="screen-sub">Prebenjamín, Grupo 2 de Gran Canaria<\/p><\/div>/);
  assert.match(head, /<a class="screen-action" href="#\/explorar#buscar">Cambiar<\/a><\/header>$/);
});

test('A (PG2, 01/03/2026): próximo partido con cuenta atrás, casillas, local y visitante, sin campo y sin «Cómo llegar»', () => {
  const out = render(CASES.A);
  assert.match(out, /data-state="A"/);
  const block = blockOf(out, 'Próximo partido');
  assert.match(block, /<p class="block-context">faltan 6 días<\/p>/);
  assert.equal(text(block), 'Próximo partido faltan 6 días Jornada 18 Fecha sáb 7 mar Hora 09:00 '
    + 'Local Veteranos – Visitante Las Mesas Hu. Campo no publicado Calendario Compartir');
  assert.match(block, /<span class="cell-label">Campo<\/span><span class="fixture-place is-muted">no publicado<\/span>/);
  assert.match(block, /<div class="buttons"><button type="button" class="button is-main" data-action="calendario">Calendario<\/button><button type="button" class="button" data-action="compartir">Compartir<\/button><\/div>/);
  assert.match(out, /<\/section><p class="vh" role="status" data-role="aviso"><\/p>/);
});

test('A con campo (A2, 20/05/2026): «Cómo llegar» abre el mapa en otra pestaña y es la acción principal', () => {
  const out = render({ raw: currentAt('2026-05-20'), myTeam: { ...LAS_MESAS, cat: 'benjamin', groupId: 'A2' }, today: '2026-05-20' });
  const block = blockOf(out, 'Próximo partido');
  assert.match(block, /<p class="block-context">faltan 3 días<\/p>/);
  assert.match(text(block), /Jornada 22 Fecha sáb 23 may Hora 09:00 Local Las Mesas Hu\. – Visitante Simusetti Campo Pepe Gonçalvez/);
  assert.match(block, /<div class="buttons"><a class="button is-main" href="https:\/\/www\.google\.com\/maps\/search\/\?api=1&amp;query=Pepe%20Gon%C3%A7alvez%2C%20Gran%20Canaria%2C%20Espa%C3%B1a" target="_blank" rel="noopener noreferrer">Cómo llegar<\/a><button type="button" class="button" data-action="calendario">Calendario<\/button>/);
});

test('A con el «hoy» de Canarias: el día del partido es «hoy» y el partido sigue siendo el próximo; la víspera, «mañana»', () => {
  for (const [today, label] of [['2026-03-07', 'hoy'], ['2026-03-06', 'mañana']]) {
    const out = render({ raw: currentAt('2026-03-07'), today });
    assert.match(out, /data-state="A"/, today);
    const block = blockOf(out, 'Próximo partido');
    assert.match(block, new RegExp(`<p class="block-context">${label}</p>`), today);
    assert.match(text(block), /Jornada 18 Fecha sáb 7 mar Hora 09:00/, today);
  }
});

test('Últimos cinco (C, 03/06/2026): G/E/P con texto oculto, marcador de Las Mesas, rival corto, enlace a cada partido y «calendario completo»', () => {
  const block = blockOf(render(CASES.C), 'Últimos cinco');
  const cells = [...block.matchAll(/<a class="last5-cell" href="([^"]+)">(.*?)<\/a>/g)];
  assert.deepEqual(cells.map(m => text(m[2])), [
    'E Empatado, 1–1 en casa contra Arucas B', 'P Perdido, 0–3 fuera contra Telde', 'P Perdido, 1–8 en casa contra Victoria',
    'G Ganado, 9–2 fuera contra Calero', 'P Perdido, 2–7 en casa contra Huracán']);
  assert.equal(cells[3][1], '#/partido?s=2025-2026&amp;g=PG2&amp;r=Jornada%2029&amp;h=CD%20Calero&amp;a=Las%20Mesas%20Hu.');
  assert.match(block, /<ol class="last5 last5-5"><li><a class="last5-cell" href="[^"]+"><span class="form-chip form-e" aria-hidden="true">E<\/span><span class="vh">Empatado, <\/span><span class="last5-score">1–1<\/span>/);
  assert.match(block, /<p class="block-context"><a class="more" href="#\/equipo\?s=2025-2026&amp;g=PG2&amp;t=Las%20Mesas%20Hu\.#calendario">calendario completo<\/a><\/p>/);
  // Con menos de cinco partidos jugados, «Últimos resultados» con los que haya.
  const early = render({ raw: currentAt('2025-10-25'), today: '2025-10-25' });
  assert.match(early, /data-state="A"/);
  assert.match(blockOf(early, 'Últimos resultados'), /<ol class="last5 last5-2">/);
  assert.equal(blockOf(early, 'Últimos cinco'), null);
});

test('clasificación completa (C): las 15 filas, la propia resaltada y cada equipo a su ficha', () => {
  const block = blockOf(render(CASES.C), 'Clasificación');
  assert.equal((block.match(/<th scope="row" class="st-team">/g) || []).length, 15);
  assert.match(block, /<p class="block-context">tras la jornada 30<\/p>/);
  assert.match(block, /<caption class="vh">Clasificación: Prebenjamín, Grupo 2 de Gran Canaria<\/caption>/);
  assert.equal((block.match(/class="is-mine"/g) || []).length, 1);
  assert.match(block, /<tr class="is-mine"><td class="st-pos">9<\/td><th scope="row" class="st-team"><a class="st-link" href="#\/equipo\?s=2025-2026&amp;g=PG2&amp;t=Las%20Mesas%20Hu\.">/);
  assert.match(block, /<th scope="col" class="st-num"><abbr title="Partidos jugados">J<\/abbr><\/th><th scope="col" class="st-num"><abbr title="Ganados">G<\/abbr><\/th>/);
});

test('goleadores del equipo (C): los 5 primeros de Las Mesas, nunca los de otro equipo, con el nombre de pila delante y «ver todos»', () => {
  const block = blockOf(render(CASES.C), 'Goleadores del equipo');
  const rows = [...block.matchAll(/<tr><th scope="row" class="sc-name">(.*?)<\/th><td class="sc-goals">(\d+)<\/td><td class="sc-games">(\d+)<\/td><\/tr>/g)]
    .map(m => [m[1], Number(m[2]), Number(m[3])]);
  assert.deepEqual(rows, [['Theo De La Rosa Perello', 12, 17], ['Agoney Santana Santacruz', 11, 21], ['Einar Ruiz Aleman', 9, 23],
    ['Pablo Hidalgo Camejo', 8, 18], ['Nadir Medina Hairach', 8, 21]]);
  assert.doesNotMatch(block, /León|Aloma/);
  assert.match(block, /<a class="more" href="#\/goleadores\?s=2025-2026&amp;g=PG2&amp;t=Las%20Mesas%20Hu\.">ver todos<\/a>/);
  assert.match(block, /<caption class="vh">Goleadores de Las Mesas Hu\.<\/caption>/);
  const none = render({ ...CASES.C, gol: {} });
  assert.match(blockOf(none, 'Goleadores del equipo'), /<p class="empty">Sin goleadores publicados de este equipo<\/p>/);
});

test('la temporada en cifras (C): de la tabla y del calendario, con la nota de cobertura del caso 6 de §11', () => {
  const out = render(CASES.C);
  assert.equal(text(blockOf(out, 'La temporada en cifras')), 'La temporada en cifras Goles a favor 90 En contra 120 '
    + 'Por partido 3,2 – 4,6 En casa 5G 1E 7P Fuera 5G 0E 8P Mejor resultado 9–2 Calero Peor derrota 1–11 Unión Viera');
  assert.match(out, /<\/section><p class="notice"><b>Cobertura:<\/b> 26 partidos en el calendario y 2 contra CD Batán \(retirado\)<\/p>/);
});

test('coverageText: los textos de §7 y los casos que §7 no prevé (B1, «Para B2»)', () => {
  const batan = { retired: ['CD Batán'] };
  assert.equal(coverageText(null), null);
  assert.equal(coverageText({ ...batan, played: 28, calendar: 26, vsRetired: 2, withResult: 26 }),
    '26 partidos en el calendario y 2 contra CD Batán (retirado)');
  // A mitad de temporada el calendario trae los partidos futuros, que no son de «cobertura».
  assert.equal(coverageText({ ...batan, played: 18, calendar: 26, vsRetired: 1, withResult: 17 }),
    '17 partidos jugados en el calendario y 1 contra CD Batán (retirado)');
  // Si falta algo más, solo cuentan los partidos `sin resultado`.
  assert.equal(coverageText({ played: 18, calendar: 26, vsRetired: 0, retired: [], withResult: 17 }, 1), '17 de 18 partidos con resultado');
  assert.equal(coverageText({ ...batan, played: 28, calendar: 26, vsRetired: 2, withResult: 25 }, 1),
    '25 de 26 partidos con resultado y 2 contra CD Batán (retirado)');
  // PJ menor que el calendario (FV13 2023-24) o calendario muy incompleto (LZP1 2021-22).
  assert.equal(coverageText({ played: 18, calendar: 20, vsRetired: 0, retired: [], withResult: 20 }),
    'Calculado con 20 partidos del calendario; la clasificación cuenta 18');
  assert.equal(coverageText({ played: 24, calendar: 14, vsRetired: 0, retired: [], withResult: 14 }),
    'Calculado con 14 partidos del calendario; la clasificación cuenta 24');
  assert.equal(coverageText({ played: 20, calendar: 16, vsRetired: 4, retired: ['CD Batán', 'CD Teguinte'], withResult: 16 }),
    '16 partidos en el calendario y 4 contra CD Batán y CD Teguinte (retirados)');
});

test('frescura: fuente y hora de Canarias de la comprobación del grupo, «hoy» si es hoy, «Revisión pendiente» y sin fecha sin data-health', () => {
  const fresh = markup => text(String(markup).match(/<p class="home-fresh">.*?<\/p>/)[0]);
  assert.equal(fresh(render(CASES.C)), 'Clasificación oficial de futbolaspalmas.com, comprobada el 23 de septiembre a las 22:11. Ver fuentes');
  assert.match(render(CASES.C), /<p class="home-fresh">[^<]*<a class="more" href="#\/fuentes">Ver fuentes<\/a><\/p>/);
  // 23:30 UTC del 02/06 son las 0:30 del 03/06 en Canarias: «hoy».
  const at = (checkedAt, status = 'ok') => ({ ...health, groups: { ...health.groups, PG2: { ...health.groups.PG2, checkedAt, status } } });
  assert.equal(fresh(render({ ...CASES.C, withHealth: at('2026-06-02T23:30:00+00:00') })),
    'Clasificación oficial de futbolaspalmas.com, comprobada hoy a las 0:30. Ver fuentes');
  assert.equal(fresh(render({ ...CASES.C, withHealth: at('2026-06-03T04:35:00+00:00', 'rejected') })),
    'Clasificación oficial de futbolaspalmas.com, comprobada hoy a las 5:35. Revisión pendiente. Ver fuentes');
  assert.equal(fresh(render({ ...CASES.C, withHealth: null })), 'Clasificación oficial de futbolaspalmas.com. Ver fuentes');
});

test('B, primera causa (2026/27 simulada, 01/10/2026): próximo partido normal, un único vacío y la tabla a cero en el orden de la fuente', () => {
  const out = render(CASES.B);
  assert.match(out, /data-state="B"/);
  const next = blockOf(out, 'Próximo partido');
  assert.match(next, /<p class="block-context">faltan 10 días<\/p>/);
  assert.match(text(next), /Jornada 1 Fecha dom 11 oct Hora 12:00 Local Las Mesas Hu\. – Visitante UD Jinámar/);
  assert.equal((out.match(/<p class="empty">/g) || []).length, 1);
  assert.match(out, /<p class="empty">Aún no se ha jugado ninguna jornada<\/p>/);
  for (const title of ['Últimos cinco', 'Últimos resultados', 'Goleadores del equipo', 'La temporada en cifras']) {
    assert.equal(blockOf(out, title), null, title);
  }
  const table = blockOf(out, 'Clasificación');
  const source = fixture('current-2025-2026').prebenjamin.find(g => g.id === 'PG2').standings.map(r => r[1]);
  assert.deepEqual([...table.matchAll(/<span class="st-name">(.*?)<\/span>/g)].map(m => m[1]), source);
  assert.equal((table.match(/<td class="st-pts">0<\/td>/g) || []).length, 15);
  assert.doesNotMatch(table, /block-context/, 'sin jornada jugada no hay «tras la jornada»');
  // Nunca datos de 2025/26 bajo los títulos de 2026/27 (ni la comprobación de data-health de 2025-26).
  assert.doesNotMatch(out, /2025/);
  // Clasificación vacía: el vacío «Clasificación sin publicar».
  const raw = structuredClone(CASES.B.raw);
  raw.prebenjamin.find(g => g.id === 'PG2').standings = [];
  const unpublished = render({ ...CASES.B, raw });
  assert.match(unpublished, /data-state="B"/);
  assert.match(blockOf(unpublished, 'Clasificación'), /<p class="empty">Clasificación sin publicar<\/p>/);
});

test('B, segunda causa (M2): CD Batán, retirado en PG2, nunca ve «Aún no se ha jugado ninguna jornada» ni una tabla a cero', () => {
  const out = render({ raw: currentAt('2026-03-01'), myTeam: { ...LAS_MESAS, name: 'CD Batán' }, today: '2026-03-01' });
  assert.match(out, /data-state="B"/);
  assert.doesNotMatch(out, /Aún no se ha jugado ninguna jornada/);
  assert.match(out, /<p class="empty">CD Batán figura como retirado en este grupo<\/p>/);
  assert.equal(text(blockOf(out, 'Próximo partido')), 'Próximo partido Sin partidos en el calendario de este grupo');
  const table = blockOf(out, 'Clasificación');
  assert.match(table, /<td class="st-pts">79<\/td>/);
  assert.match(table, /<tr class="is-mine"><td class="st-pos">15<\/td>/);
});

test('C: el último partido en grande abre su ficha, y la nota dice por qué no hay próximo (tres variantes)', () => {
  const out = render(CASES.C);
  assert.match(out, /data-state="C"/);
  const block = blockOf(out, 'Último partido');
  assert.match(block, /<p class="block-context">jornada 30 · mar 2 jun<\/p>/);
  assert.match(block, /<a class="result" href="#\/partido\?s=2025-2026&amp;g=PG2&amp;r=Jornada%2030&amp;h=Las%20Mesas%20Hu\.&amp;a=AD%20Hurac%C3%A1n">/);
  assert.equal(text(block), 'Último partido jornada 30 · mar 2 jun Local Las Mesas Hu. 2–7 Visitante AD Huracán Ya ha jugado todos sus partidos');
  // Próximo partido sin fecha: el de la jornada 30 sin fecha publicada.
  const undated = currentAt('2026-05-31');
  undated.history.PG2['Jornada 30'][0][0] = '';
  const sinFecha = render({ raw: undated, today: '2026-05-31' });
  assert.match(sinFecha, /data-state="C"/);
  assert.equal(text(blockOf(sinFecha, 'Último partido')),
    'Último partido jornada 29 · jue 28 may Local CD Calero 2–9 Visitante Las Mesas Hu. Próximo partido sin fecha publicada');
  // Resultado pendiente de publicar: la jornada 30 (02/06) sin marcador el 03/06.
  const late = render({ raw: currentAt('2026-06-02'), today: '2026-06-03' });
  assert.match(late, /data-state="C"/);
  assert.match(text(blockOf(late, 'Último partido')), /Resultado pendiente de publicar$/);
  assert.match(late, /<b>Cobertura:<\/b> 25 de 26 partidos con resultado y 2 contra CD Batán \(retirado\)<\/p>/);
});

test('E, caso 2b: la pregunta con los candidatos (escudo, nombre y etiqueta de grupo con la categoría) y «Ninguno: buscar otro equipo»', () => {
  const out = render(CASES.E);
  assert.match(out, /data-state="E"/);
  assert.match(out, /<h1>Las Mesas Hu\. B<\/h1><p class="screen-sub">Temporada 2025\/26<\/p><\/div><\/header>/);
  assert.doesNotMatch(out, /Cambiar/);
  const block = blockOf(out, '¿En qué equipo juega ahora?');
  const choices = [...block.matchAll(/<button type="button" class="choice" data-action="elegir" data-index="(\d+)">(.*?)<\/button>/g)];
  assert.deepEqual(choices.map(m => [m[1], text(m[2])]), [
    ['0', 'Las Mesas Hu. Benjamín, Segunda Fase A, Grupo 2'], ['1', 'Las Mesas B Benjamín, Segunda Fase B, Grupo 2']]);
  assert.match(choices[0][2], /^<img class="crest crest-32" src="\.\/escudos\/s\/lasMesasEscudo\.png"/);
  assert.match(block, /<li><a class="choice choice-none" href="#\/explorar#buscar">Ninguno: buscar otro equipo<\/a><\/li><\/ul>/);
  assert.deepEqual(titles(out), ['¿En qué equipo juega ahora?']);
  // Desde 2024-25 (paso 1), tres candidatos: A2 y B2 de benjamín y PG2 de prebenjamín.
  const three = render({ myTeam: { name: 'Las Mesas Hu. B', season: '2024-2025', cat: 'benjamin', groupId: 'P9' }, today: '2026-09-23' });
  assert.deepEqual([...three.matchAll(/<span class="choice-label">(.*?)<\/span>/g)].map(m => m[1]), [
    'Benjamín, Segunda Fase A, Grupo 2', 'Benjamín, Segunda Fase B, Grupo 2', 'Prebenjamín, Grupo 2 de Gran Canaria']);
  // Un solo candidato con otro nombre también pregunta (decisión 13 de B1): el favorito v1 migrado de un torneo.
  const one = render({ myTeam: { name: 'UD Las Mesas Huracán', season: '2025-2026', cat: 'prebenjamin', groupId: 'MCP3' }, today: '2026-09-23' });
  assert.match(one, /data-state="E"/);
  assert.deepEqual([...one.matchAll(/<span class="choice-name">(.*?)<\/span>/g)].map(m => m[1]), ['Las Mesas Hu.']);
});

test('X: «Las Mesas Hu. no aparece en 2026/27» y «Elegir equipo» a Explorar', () => {
  const out = render(CASES.X);
  assert.match(out, /data-state="X"/);
  assert.match(out, /<p class="empty">Las Mesas Hu\. no aparece en 2026\/27<\/p><div class="buttons home-cta"><a class="button is-main" href="#\/explorar#buscar">Elegir equipo<\/a><\/div>/);
  assert.doesNotMatch(out, /Cambiar/);
  assert.deepEqual(titles(out), []);
});

test('stale (decisión 20 de B1): el aviso bajo la cabecera en C y en D, y nunca en A', () => {
  const stale = (today, options) => ({ ...options, today,
    resolution: ({ season, index }) => ({ ...resolveMyTeam(LAS_MESAS, season, index, today), stale: true }) });
  const aviso = '<p class="notice"><b>¿Sigue tu equipo en la Segunda Fase?</b> <a class="more" href="#/explorar#buscar">Búscalo en Explorar</a></p>';
  for (const [state, options] of [['C', CASES.C], ['D', CASES.D]]) {
    const out = render(stale(options.today, options));
    assert.match(out, new RegExp(`data-state="${state}"`));
    assert.ok(out.includes(`Cambiar</a></header>${aviso}<div class="home-cols">`), state);
    assert.ok(!render(options).includes('Segunda Fase?'), `${state} sin stale`);
  }
  assert.ok(!render(stale('2026-03-01', CASES.A)).includes('Segunda Fase?'));
});

test('primera visita y almacén roto: la portada de PORTAL.defaultTeam sin preguntas; con favoritos v1, la migración y el paso 0', () => {
  const defaultTeam = { cat: 'prebenjamin', groupId: 'PG2', name: 'Las Mesas Hu.' };
  const empty = { getItem: () => null, setItem: () => {} };
  const blocked = () => { throw new DOMException('bloqueado', 'SecurityError'); };
  const v1 = { getItem: key => (key === LEGACY_KEY ? JSON.stringify(fixture('favorites-v1')) : null), setItem: () => {} };
  for (const [label, storage] of [['vacío', empty], ['bloqueado', blocked], ['favoritos v1', v1]]) {
    const { myTeam } = loadStore(storage, { defaultTeam, portalSeason: '2025-2026' });
    for (const [options, state] of [[CASES.D, 'D'], [CASES.A, 'A']]) {
      const out = render({ ...options, myTeam });
      assert.match(out, new RegExp(`data-state="${state}"`), `${label} ${state}`);
      assert.match(out, /<h1>Las Mesas Hu\.<\/h1>/, `${label} ${state}`);
    }
  }
});

test('los nombres con comillas y signos se escapan en el texto y en los enlaces', () => {
  const odd = 'MESAS, U.D. LAS "B" <x>';
  const raw = currentAt('2026-06-03');
  const swap = name => (name === 'Las Mesas Hu.' ? odd : name);
  for (const row of raw.prebenjamin.find(g => g.id === 'PG2').standings) row[1] = swap(row[1]);
  for (const rows of Object.values(raw.history.PG2)) for (const row of rows) { row[1] = swap(row[1]); row[2] = swap(row[2]); }
  const out = render({ raw, myTeam: { ...LAS_MESAS, name: odd }, today: '2026-06-03' });
  assert.match(out, /data-state="C"/);
  assert.doesNotMatch(out, /"B"|<x>/);
  assert.match(out, /<h1>MESAS, U\.D\. LAS &quot;B&quot; &lt;x&gt;<\/h1>/);
  assert.match(out, /t=MESAS%2C%20U\.D\.%20LAS%20%22B%22%20%3Cx%3E#calendario"/);
});

test('ni inglés ni emoji: Local/Visitante y G/E/P en todos los estados', () => {
  const all = Object.values(CASES).map(render).join('\n');
  assert.doesNotMatch(text(all), /\b(HOME|AWAY|Home|Away|home|away)\b/);
  assert.doesNotMatch(text(all), /(^|[^\p{L}])[WDL]([^\p{L}]|$)/u);
  assert.doesNotMatch(all, /\p{Extended_Pictographic}/u);
});

test('shareData y matchCalendar: el enlace absoluto al partido y su .ics con la hora de Canarias', () => {
  const raw = currentAt('2026-05-20');
  const a2 = buildSeason({ name: raw.season, current: true, ...raw }).groups.find(g => g.id === 'A2');
  const next = teamFixtures('Las Mesas Hu.', a2, '2026-05-20').next;
  const data = shareData(next, 'https://malolocabreralolo-tech.github.io/futbol-base/index.html');
  assert.deepEqual(data, {
    title: 'Las Mesas Hu. – Simusetti', text: 'Las Mesas Hu. – Simusetti, sáb 23 may, 09:00',
    url: 'https://malolocabreralolo-tech.github.io/futbol-base/index.html#/partido?s=2025-2026&g=A2&r=Jornada%2022&h=Las%20Mesas%20Hu.&a=Simusetti',
  });
  const ics = matchCalendar(next, a2, { url: data.url, now: new Date('2026-05-20T10:00:00Z') });
  assert.equal((ics.match(/BEGIN:VEVENT/g) || []).length, 1);
  assert.match(ics, /\r\nDTSTART:20260523T080000Z\r\n/, 'las 09:00 de Canarias en verano son las 08:00 UTC');
  assert.match(ics, /\r\nSUMMARY:Las Mesas Hu\. – Simusetti\r\n/);
  assert.match(ics, /\r\nLOCATION:Pepe Gonçalvez\r\n/);
});

test('mount: responder a la pregunta E guarda { name, season, cat, groupId } del candidato con nav.saveMyTeam', () => {
  const ctx = homeCtx(CASES.E);
  let onClick = null;
  const section = { addEventListener: (type, fn) => { if (type === 'click') onClick = fn; }, contains: () => true, querySelector: () => null };
  const root = { matches: () => false, querySelector: selector => (selector === '[data-screen="home"]' ? section : null) };
  const saved = [];
  screen.mount(root, ctx, { saveMyTeam: team => saved.push(team) });
  const button = { getAttribute: name => ({ 'data-action': 'elegir', 'data-index': '1' })[name] };
  onClick({ target: { closest: () => button } });
  assert.deepEqual(saved, [{ name: 'Las Mesas B', season: '2025-2026', cat: 'benjamin', groupId: 'B2' }]);
});

test('fechas en castellano sin Intl (links.js): los días y los meses van escritos en el código', () => {
  assert.equal(weekdayDate('2026-03-07'), 'sáb 7 mar');
  assert.equal(weekdayDate('2026-10-04'), 'dom 4 oct');
  assert.equal(weekdayDate('2026-09-23'), 'mié 23 sept');
  assert.equal(dayMonth('2026-09-23'), '23 sept');
  assert.equal(dayMonthLong('2026-09-23'), '23 de septiembre');
  assert.equal(monthName('2026-06-27'), 'junio');
  for (const bad of ['', null, undefined, '2026-02-30', '23/09/2026']) {
    for (const f of [weekdayDate, dayMonth, dayMonthLong, monthName]) assert.equal(f(bad), null, `${f.name}(${bad})`);
  }
  // Sin datos de idioma (o con otros), las fechas salen igual: no pasan por Intl.
  const saved = Intl.DateTimeFormat;
  Intl.DateTimeFormat = function broken() { throw new Error('sin datos de idioma'); };
  try {
    assert.equal(weekdayDate('2026-02-12'), 'jue 12 feb');
    assert.equal(dayMonthLong('2026-01-01'), '1 de enero');
  } finally {
    Intl.DateTimeFormat = saved;
  }
});

test('shareLink y copyText (links.js): navigator.share si existe; si no, o si falla, copia el enlace', async () => {
  const saved = Object.getOwnPropertyDescriptor(globalThis, 'navigator');
  const withNavigator = value => Object.defineProperty(globalThis, 'navigator', { value, configurable: true, writable: true });
  const data = { title: 'Las Mesas Hu. – Simusetti', text: 'Las Mesas Hu. – Simusetti, sáb 23 may, 09:00',
    url: 'https://malolocabreralolo-tech.github.io/futbol-base/#/partido?s=2025-2026&g=A2' };
  const copied = [];
  const clipboard = { writeText: async text => { copied.push(text); } };
  try {
    withNavigator({ share: async () => {}, clipboard });
    assert.equal(await shareLink(data), 'compartido');
    withNavigator({ share: async () => { throw new DOMException('cancelado', 'AbortError'); }, clipboard });
    assert.equal(await shareLink(data), 'cancelado');
    withNavigator({ share: async () => { throw new DOMException('sin permiso', 'NotAllowedError'); }, clipboard });
    assert.equal(await shareLink(data), 'copiado', 'si share falla, copia');
    withNavigator({ clipboard });
    assert.equal(await shareLink(data), 'copiado', 'sin share, copia');
    assert.deepEqual(copied, [data.url, data.url]);
    // Sin portapapeles y sin documento (Node), no se copia y no lanza.
    withNavigator({ clipboard: { writeText: async () => { throw new Error('denegado'); } } });
    assert.equal(await shareLink(data), 'no copiado');
    assert.equal(await copyText('x'), false);
  } finally {
    if (saved) Object.defineProperty(globalThis, 'navigator', saved);
    else delete globalThis.navigator;
  }
});

test('cada semana real de 2025/26, seis equipos: un estado con contenido y sin «undefined», «null» ni «NaN» (foco 5)', () => {
  const teams = [
    LAS_MESAS, { ...LAS_MESAS, cat: 'benjamin', groupId: 'FF5' },
    { name: 'Las Mesas Hu. B', season: '2025-2026', cat: 'benjamin', groupId: 'FF13' },
    { ...LAS_MESAS, name: 'RC Victoria' }, { ...LAS_MESAS, name: 'CD Batán' },
    { name: 'Unión Tetir', season: '2025-2026', cat: 'prebenjamin', groupId: 'PFV2' },
  ];
  const seen = new Set();
  for (let day = Date.UTC(2025, 8, 1); day <= Date.UTC(2026, 8, 28); day += 7 * 86400000) {
    const today = new Date(day).toISOString().slice(0, 10);
    const model = createModel(datasetsFrom(currentAt(today), { golBenj: GOL.benjamin, golPrebenj: GOL.prebenjamin }),
      { portalSeason: '2025-2026', buildClubIndex });
    const season = model.season('2025-2026');
    const index = model.clubIndex();
    for (const myTeam of teams) {
      const out = String(screen.render({ route: { screen: '', params: {} }, params: {}, model, myTeam, today, health,
        legacyDate: null, resolution: resolveMyTeam(myTeam, season, index, today), datasets: { shields },
        portal: { season: '2025-2026', defaultTeam: LAS_MESAS }, lastPrimary: 'miequipo' }));
      seen.add(out.match(/^<section data-screen="home" data-state="([A-EX])">/)[1]);
      assert.doesNotMatch(text(out), /\b(undefined|null|NaN)\b|Invalid Date/, `${today} ${myTeam.name}`);
      assert.ok(titles(out).length > 0, `${today} ${myTeam.name}: sin bloques`);
    }
  }
  assert.deepEqual([...seen].sort(), ['A', 'B', 'C', 'D', 'E']);
});

// ── Hoja de estilos: cada clase existe y las reglas de intención (spec §3 y §8) ──

const CSS = readFileSync(join(ROOT, 'acta.css'), 'utf8');
function parseCss(src) {
  const rules = [];
  const walk = (s, media) => {
    let i = 0;
    while (i < s.length) {
      const open = s.indexOf('{', i);
      if (open < 0) break;
      const prelude = s.slice(i, open).trim();
      let depth = 1, j = open + 1;
      for (; j < s.length && depth; j++) {
        if (s[j] === '{') depth++;
        else if (s[j] === '}') depth--;
      }
      const body = s.slice(open + 1, j - 1);
      if (prelude.startsWith('@media')) walk(body, prelude);
      else rules.push({ media, selector: prelude, body });
      i = j;
    }
  };
  walk(src.replace(/\/\*[\s\S]*?\*\//g, ''), null);
  return rules;
}
const RULES = parseCss(CSS);
function decl(selector, media = m => m === null) {
  const found = RULES.filter(r => media(r.media) && r.selector.split(',').map(x => x.trim()).includes(selector));
  assert.ok(found.length, `no hay regla para «${selector}»`);
  return found.map(r => r.body).join(';');
}
const DEFINED = new Set([...CSS.replace(/\/\*[\s\S]*?\*\//g, '').matchAll(/\.([a-zA-Z][\w-]*)/g)].map(m => m[1]));
const missingClasses = markup => [...new Set([...String(markup).matchAll(/class="([^"]+)"/g)]
  .flatMap(m => m[1].split(/\s+/)))].filter(c => !DEFINED.has(c));

test('cada clase que emite la portada existe en acta.css', () => {
  const out = [
    ...Object.values(CASES).map(render),
    render({ raw: currentAt('2026-05-20'), myTeam: { ...LAS_MESAS, cat: 'benjamin', groupId: 'A2' }, today: '2026-05-20' }),
    render({ raw: currentAt('2025-10-25'), today: '2025-10-25' }),
    render({ ...CASES.C, gol: {} }),
    render({ raw: currentAt('2026-03-01'), myTeam: { ...LAS_MESAS, name: 'CD Batán' }, today: '2026-03-01' }),
  ].join('');
  assert.deepEqual(missingClasses(out), []);
});

test('estilos de la portada: pulsables de 44 px y nombres con elipsis', () => {
  for (const sel of ['.more', '.last5-cell', '.result']) assert.match(decl(sel), /min-height:\s*44px/, sel);
  assert.match(decl('.choice'), /min-height:\s*56px/);
  for (const sel of ['.fixture-name', '.last5-rival', '.scorers .sc-name']) {
    assert.match(decl(sel), /text-overflow:\s*ellipsis/, sel);
    assert.match(decl(sel), /white-space:\s*nowrap/, sel);
  }
  assert.match(decl('.scorers thead th'), /border-bottom:\s*1\.5px solid var\(--ink\)/);
  assert.match(decl('.last5'), /background:\s*var\(--rule\)/, 'las divisiones de las casillas van en --rule');
  assert.match(decl('.result-score'), /font-size:\s*40px/, 'el marcador grande es el de 40 px de la escala');
  const home = RULES.filter(r => /home|fixture|last5|scorers|choice|result|\.more/.test(r.selector)).map(r => r.body).join(';');
  assert.doesNotMatch(home, /text-transform|border-radius|box-shadow/);
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd /home/manolo/claude/futbol-base
node --test scripts/tests/test_rediseno_portada.mjs 2>&1 | grep -E '^# (tests|pass|fail)|SyntaxError'
```
Esperado (faltan las exportaciones nuevas de `links.js`, `model.js` y `screen-home.js`; el primer error es el de `links.js`):
```text
# SyntaxError: The requested module '../../src/links.js' does not provide an export named 'copyText'
# tests 1
# pass 0
# fail 1
```

- [ ] **Step 3: Write minimal implementation**

1. Reescribir `src/screen-home.js` con este contenido:

```js
// Mi equipo, la portada (spec §4.2, §4.8, §6.4 y §7).
//
// render(ctx) es puro y síncrono: homeState decide el estado (E, X, D, B, C o A,
// en ese orden) sobre la resolución de mi equipo, y cada estado pinta su bloque
// con los componentes de ui.js. El estado va en data-state, que usan las pruebas
// de navegador. mount(root, ctx, nav) añade el comportamiento. Nada toca el DOM
// al importarse.
import { html } from './html.js';
import { box, cells, crest, empty, notice, screenHead, standingsTable } from './ui.js';
import {
  lastResults, matchState, playerName, retiredTeams, seasonLabel, seasonSummary, sourceInfo,
  teamFixtures, teamShort,
} from './model.js';
import { homeState } from './myteam.js';
import {
  buildCalendar, countdownLabel, dayMonthLong, downloadCalendar, routeHref, shareLink, venueUrl, weekdayDate,
} from './links.js';
import { ensureHealth, teamScorers } from './state.js';

// Fechas y horas siempre en Canarias (spec §8). Las fechas de partido son días de calendario
// ('AAAA-MM-DD') y se escriben con los nombres de links.js, sin los datos de idioma del motor (B9).
// La hora de una comprobación (un instante) pasa a Canarias con Intl, pero solo con partes numéricas.
const TZ = 'Atlantic/Canary';
const CLOCK = new Intl.DateTimeFormat('en-CA', {
  timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
});
const parts = (format, date) => Object.fromEntries(format.formatToParts(date).map(p => [p.type, p.value]));

// '2026-10-04' → 'dom 4 oct'
const shortDate = weekdayDate;

// Un instante (checkedAt de data-health) en Canarias: { day: 'AAAA-MM-DD', time: 'H:MM' }.
function canary(instant) {
  const date = new Date(instant);
  if (!instant || !Number.isFinite(date.getTime())) return null;
  const p = parts(CLOCK, date);
  return { day: `${p.year}-${p.month}-${p.day}`, time: `${Number(p.hour)}:${p.minute}` };
}

// «hoy a las 22:11» o «el 23 de septiembre a las 22:11» (spec §7: nunca «ahora»).
function checkedPhrase(instant, today) {
  const c = canary(instant);
  if (!c) return null;
  return c.day === today ? `hoy a las ${c.time}` : `el ${dayMonthLong(c.day)} a las ${c.time}`;
}

const score = (a, b) => `${a}–${b}`;
// 3.25 → '3,3': un decimal con coma, sin los datos de idioma del motor.
const oneDecimal = n => n.toFixed(1).replace('.', ',');
const listText = names => (names.length < 2 ? names.join('') : `${names.slice(0, -1).join(', ')} y ${names[names.length - 1]}`);

// ── Enlaces (spec §4.1) ─────────────────────────────────────────────────

const matchHref = m => routeHref('partido', { s: m.season, g: m.groupId, r: m.roundKey, h: m.home, a: m.away });
const teamHref = (group, team) => routeHref('equipo', { s: group.season, g: group.id, t: team });
// «Cambiar» y las demás búsquedas abren Explorar con el buscador enfocado: el
// ancla #buscar va tras la ruta, como #calendario en la ficha de equipo.
const SEARCH = `${routeHref('explorar')}#buscar`;

// ── Piezas comunes ──────────────────────────────────────────────────────

// La cabecera de pantalla común (screenHead, ui.js): escudo, nombre (el único h1), la etiqueta y
// «Cambiar». En E y X, sin «Cambiar»: la caja ya ofrece buscar otro equipo.
function header(name, subtitle, { shields, change = true }) {
  return screenHead(name, {
    sub: subtitle, crest: crest(name, { size: 46, shields, lazy: false }),
    action: change ? { href: SEARCH, label: 'Cambiar' } : null,
  });
}

const blockEmpty = (title, text) => html`<section class="block"><div class="block-head"><h2 class="block-title">${title}</h2></div>${empty(text)}</section>`;

const roundOf = (group, match) => group.rounds.find(round => round.key === match.roundKey) || null;

// La última jornada (en su orden) con algún resultado, o null.
function lastPlayedRound(group) {
  const played = group.rounds.filter(round => round.matches.some(m => m.hs != null && m.as != null));
  return played[played.length - 1] || null;
}

// Local o visitante, con escudo grande, en el próximo y en el último partido.
const side = (team, label, shields) => html`<span class="fixture-team">${crest(team, { size: 46, shields, lazy: false })}<span class="fixture-side">${label}</span><span class="fixture-name">${team}</span></span>`;

// Decisión 20 de B1: el grupo guardado terminó y el club no aparece en la fase
// siguiente, que ya lleva una semana en marcha (estados C y D).
const staleNotice = resolution => (resolution.stale
  ? notice('¿Sigue tu equipo en la Segunda Fase?', html`<a class="more" href="${SEARCH}">Búscalo en Explorar</a>`)
  : '');

// Lo principal y lo de consulta; en escritorio, dos columnas (spec §4.8).
const columns = (main, aside) => html`<div class="home-cols"><div class="home-main">${main}</div><div class="home-side">${aside}</div></div>`;

// ── Estado E: elegir equipo (spec §4.2 y §6.3) ──────────────────────────

function stateE(ctx, { shields }) {
  const name = ctx.myTeam?.name || 'Mi equipo';
  const choices = ctx.resolution.candidates.map((c, i) => html`<li><button type="button" class="choice" data-action="elegir" data-index="${i}">${crest(c.name, { size: 32, shields })}<span class="choice-text"><span class="choice-name">${c.name}</span><span class="choice-label">${c.group.label}</span></span></button></li>`);
  return html`${header(name, `Temporada ${seasonLabel(ctx.portal.season)}`, { shields, change: false })}${box(
    html`<ul class="choices">${choices}<li><a class="choice choice-none" href="${SEARCH}">Ninguno: buscar otro equipo</a></li></ul>`,
    { title: '¿En qué equipo juega ahora?' })}`;
}

// ── Estado X: no aparece ────────────────────────────────────────────────

function stateX(ctx, { shields }) {
  const name = ctx.myTeam?.name || 'Mi equipo';
  const season = seasonLabel(ctx.portal.season);
  return html`${header(name, `Temporada ${season}`, { shields, change: false })}<section class="block">${empty(`${name} no aparece en ${season}`)}<div class="buttons home-cta"><a class="button is-main" href="${SEARCH}">Elegir equipo</a></div></section>`;
}

// ── Próximo partido (A y B) y último partido (C) ────────────────────────

function nextBlock(m, group, today, shields) {
  const round = roundOf(group, m);
  const when = cells([
    { label: 'Jornada', value: round && round.n != null ? round.n : (round ? round.label : m.roundKey) },
    { label: 'Fecha', value: shortDate(m.dateISO) },
    { label: 'Hora', value: m.time || 'por confirmar', muted: !m.time },
  ]);
  const teams = html`<div class="fixture">${side(m.home, 'Local', shields)}<span class="fixture-vs" aria-hidden="true">–</span>${side(m.away, 'Visitante', shields)}</div>`;
  const venue = html`<p class="fixture-venue"><span class="cell-label">Campo</span><span class="${m.venue ? 'fixture-place' : 'fixture-place is-muted'}">${m.venue || 'no publicado'}</span></p>`;
  const buttons = html`<div class="buttons">${m.venue ? html`<a class="button is-main" href="${venueUrl(m.venue, group.island)}" target="_blank" rel="noopener noreferrer">Cómo llegar</a>` : ''}<button type="button" class="${m.venue ? 'button' : 'button is-main'}" data-action="calendario">Calendario</button><button type="button" class="button" data-action="compartir">Compartir</button></div>`;
  return html`${box(html`${when}${teams}${venue}${buttons}`, { title: 'Próximo partido', context: countdownLabel(m.dateISO, today) })}<p class="vh" role="status" data-role="aviso"></p>`;
}

// Sin próximo partido, por qué (B1, «Para B2»): sin fecha, sin resultado o todo jugado.
function noNextText(fx, { finished }) {
  if (fx.undated > 0) return 'Próximo partido sin fecha publicada';
  if (fx.remaining > 0) return 'Resultado pendiente de publicar';
  return finished ? 'Ya ha jugado todos sus partidos' : 'Sin partidos en el calendario de este grupo';
}

function lastBlock(fx, group, shields) {
  const m = fx.last;
  const round = roundOf(group, m);
  const context = [round ? round.label.toLowerCase() : m.roundKey, shortDate(m.dateISO)].filter(Boolean).join(' · ');
  return box(html`<a class="result" href="${matchHref(m)}">${side(m.home, 'Local', shields)}<span class="result-score">${score(m.hs, m.as)}</span>${side(m.away, 'Visitante', shields)}</a><p class="home-note">${noNextText(fx, { finished: true })}</p>`,
    { title: 'Último partido', context });
}

// ── Últimos cinco, clasificación, goleadores y cifras ───────────────────

const LETTER = { G: 'Ganado', E: 'Empatado', P: 'Perdido' };

function lastFiveBlock(results, group, name) {
  const items = results.map(r => html`<li><a class="last5-cell" href="${matchHref(r.match)}"><span class="form-chip form-${r.letter.toLowerCase()}" aria-hidden="true">${r.letter}</span><span class="vh">${LETTER[r.letter]}, </span><span class="last5-score">${score(r.gf, r.gc)}</span><span class="last5-rival"><span class="vh">${r.side === 'casa' ? 'en casa contra ' : 'fuera contra '}</span>${teamShort(r.rival)}</span></a></li>`);
  const more = html`<a class="more" href="${teamHref(group, name)}#calendario">calendario completo</a>`;
  return box(html`<ol class="last5 last5-${results.length}">${items}</ol>`,
    { title: results.length === 5 ? 'Últimos cinco' : 'Últimos resultados', context: more });
}

function standingsBlock(group, name, shields) {
  if (!group.standings.length) return blockEmpty('Clasificación', 'Clasificación sin publicar');
  const after = lastPlayedRound(group);
  return box(standingsTable(group.standings, {
    view: 'puntos', mine: name, shields, hrefFor: row => teamHref(group, row.team), caption: `Clasificación: ${group.label}`,
  }), { title: 'Clasificación', context: after ? `tras la ${after.label.toLowerCase()}` : null });
}

// Goleadores del equipo en su grupo: [{ name, goals, games }], por goles.
const scorersOf = (ctx, group, name) => teamScorers(ctx.model.scorers(group.season, group.cat),
  { name, season: group.season, cat: group.cat, groupId: group.id });

function scorersBlock(ctx, group, name) {
  const list = scorersOf(ctx, group, name);
  if (!list.length) return blockEmpty('Goleadores del equipo', 'Sin goleadores publicados de este equipo');
  const rows = list.slice(0, 5).map(s => html`<tr><th scope="row" class="sc-name">${playerName(s.name)}</th><td class="sc-goals">${s.goals}</td><td class="sc-games">${s.games}</td></tr>`);
  const more = html`<a class="more" href="${routeHref('goleadores', { s: group.season, g: group.id, t: name })}">ver todos</a>`;
  return box(html`<table class="scorers"><caption class="vh">Goleadores de ${name}</caption><thead><tr><th scope="col" class="sc-name">Jugador</th><th scope="col" class="sc-goals">Goles</th><th scope="col" class="sc-games"><abbr title="Partidos jugados">PJ</abbr></th></tr></thead><tbody>${rows}</tbody></table>`,
    { title: 'Goleadores del equipo', context: more });
}

// Partidos del equipo (sin los de retirados) con fecha pasada y sin marcador.
function missingResults(name, group, today) {
  const retired = retiredTeams(group);
  return group.rounds.flatMap(round => round.matches).filter(m => (m.home === name || m.away === name)
    && !retired.has(m.home) && !retired.has(m.away) && matchState(m, today) === 'sin resultado').length;
}

// Nota de cobertura (spec §7) de las cifras calculadas con el calendario:
// - con retirados, «26 partidos en el calendario y 2 contra CD Batán (retirado)»;
// - si falta algo más (partidos `sin resultado`), «N de M partidos con resultado»;
// - si no cuadra por otra causa, «Calculado con N partidos del calendario».
// Y, si la suma sigue sin dar el PJ oficial, «la clasificación cuenta P». null si cuadra.
export function coverageText(coverage, missing = 0) {
  if (!coverage) return null;
  const { played, calendar, vsRetired, retired, withResult: n } = coverage;
  const due = n + missing;
  let text;
  if (missing > 0) text = `${n} de ${due} partidos con resultado`;
  else if (vsRetired > 0) text = n === calendar ? `${n} partidos en el calendario` : `${n} partidos jugados en el calendario`;
  else text = `Calculado con ${n} partidos del calendario`;
  if (vsRetired > 0) text += ` y ${vsRetired} contra ${listText(retired)} (${retired.length > 1 ? 'retirados' : 'retirado'})`;
  if (due + vsRetired !== played) text += `; la clasificación cuenta ${played}`;
  return text;
}

function figuresBlock(ctx, group, name) {
  const sum = seasonSummary(name, group);
  const record = r => `${r.g}G ${r.e}E ${r.p}P`;
  const result = r => (r ? `${score(r.gf, r.gc)} ${teamShort(r.rival)}` : null);
  const content = html`${cells([
    { label: 'Goles a favor', value: sum.gf ?? '—' },
    { label: 'En contra', value: sum.gc ?? '—' },
    { label: 'Por partido', value: sum.perMatch ? `${oneDecimal(sum.perMatch.gf)} – ${oneDecimal(sum.perMatch.gc)}` : '—' },
  ])}${cells([
    { label: 'En casa', value: record(sum.home) },
    { label: 'Fuera', value: record(sum.away) },
  ])}${cells([
    { label: 'Mejor resultado', value: result(sum.best) ?? '—' },
    { label: 'Peor derrota', value: result(sum.worst) ?? 'ninguna', muted: !sum.worst },
  ])}`;
  const note = coverageText(sum.coverage, missingResults(name, group, ctx.today));
  return html`${box(content, { title: 'La temporada en cifras' })}${note ? notice('Cobertura:', note) : ''}`;
}

// «Clasificación oficial de futbolaspalmas.com, comprobada el …» (spec §4.2 y §7).
function freshness(ctx, group) {
  const info = sourceInfo(group, false);
  const of = info.source ? ` de ${info.source}` : '';
  const lead = info.kind === 'calculada' ? `Clasificación calculada con los resultados${of}`
    : info.kind === 'corregida' ? `Clasificación${of} con los puntos corregidos` : `Clasificación oficial${of}`;
  const health = ctx.health;
  const item = health && health.season === group.season && health.groups ? health.groups[group.id] : null;
  const when = item && item.checkedAt ? checkedPhrase(item.checkedAt, ctx.today) : null;
  const text = `${lead}${when ? `, comprobada ${when}` : ''}.${item && item.status !== 'ok' ? ' Revisión pendiente.' : ''}`;
  return html`<p class="home-fresh">${text} <a class="more" href="${routeHref('fuentes')}">Ver fuentes</a></p>`;
}

// ── Estados A, B y C ────────────────────────────────────────────────────

// Sin nada jugado, un único vacío en lugar de Últimos cinco, goleadores y cifras
// (spec §4.2 B). Sus dos causas (B1, M2): el grupo no ha empezado, o sí, pero mi
// equipo no ha jugado (un retirado, como CD Batán en PG2).
function notPlayedText(group, name) {
  const started = group.rounds.some(round => round.matches.some(m => m.hs != null && m.as != null));
  if (!started) return 'Aún no se ha jugado ninguna jornada';
  if (retiredTeams(group).has(name)) return `${name} figura como retirado en este grupo`;
  return `${name} todavía no ha jugado ningún partido en este grupo`;
}

function seasonView(ctx, env, top) {
  const { group, name } = ctx.resolution;
  const results = lastResults(name, group, 5);
  const main = [top];
  const aside = [standingsBlock(group, name, env.shields)];
  if (results.length) {
    main.push(lastFiveBlock(results, group, name));
    aside.push(scorersBlock(ctx, group, name), figuresBlock(ctx, group, name));
  } else {
    main.push(html`<section class="block">${empty(notPlayedText(group, name))}</section>`);
  }
  aside.push(freshness(ctx, group));
  return columns(main, aside);
}

function stateA(ctx, env) {
  const { group, name } = ctx.resolution;
  const fx = teamFixtures(name, group, ctx.today);
  return html`${header(name, group.label, env)}${seasonView(ctx, env, nextBlock(fx.next, group, ctx.today, env.shields))}`;
}

function stateB(ctx, env) {
  const { group, name } = ctx.resolution;
  const fx = teamFixtures(name, group, ctx.today);
  const top = fx.next ? nextBlock(fx.next, group, ctx.today, env.shields)
    : box(html`<p class="home-note">${noNextText(fx, { finished: false })}</p>`, { title: 'Próximo partido' });
  return html`${header(name, group.label, env)}${seasonView(ctx, env, top)}`;
}

function stateC(ctx, env) {
  const r = ctx.resolution;
  const fx = teamFixtures(r.name, r.group, ctx.today);
  return html`${header(r.name, r.group.label, env)}${staleNotice(r)}${seasonView(ctx, env, lastBlock(fx, r.group, env.shields))}`;
}

// ── Estado D: temporada terminada ───────────────────────────────────────

// La cabecera, el aviso y la clasificación completa del grupo terminado.
function stateD(ctx, env) {
  const r = ctx.resolution;
  return html`${header(r.name, `Temporada ${seasonLabel(r.group.season)} terminada`, env)}${staleNotice(r)}${columns([], [standingsBlock(r.group, r.name, env.shields)])}`;
}

// ── Compartir y calendario del próximo partido (los usa mount) ──────────

export function shareData(match, pageHref) {
  const when = [shortDate(match.dateISO), match.time].filter(Boolean).join(', ');
  const title = `${match.home} – ${match.away}`;
  return { title, text: when ? `${title}, ${when}` : title, url: new URL(matchHref(match), pageHref).href };
}

// El partido como evento de buildCalendar y downloadCalendar (links.js): [partidos, opciones].
function calendarArgs(match, group, url) {
  const round = roundOf(group, match);
  return [[{
    date: match.dateISO, home: match.home, away: match.away, time: match.time, venue: match.venue,
    jor: round ? round.label : match.roundKey,
  }], { season: match.season, group: match.groupId, name: `${match.home} – ${match.away}`, url }];
}

// El .ics que descarga «Calendario» (`now` fijo en las pruebas).
export function matchCalendar(match, group, { url = '', now = new Date() } = {}) {
  const [matches, options] = calendarArgs(match, group, url);
  return buildCalendar(matches, { ...options, now });
}

// Confirma en el propio botón y en la región de estado, y vuelve al texto original.
function confirmOn(button, status, text) {
  if (status) status.textContent = text;
  if (!button.dataset.label) button.dataset.label = button.textContent;
  button.textContent = text;
  setTimeout(() => { button.textContent = button.dataset.label; }, 2500);
}

async function share(button, status, data) {
  const outcome = await shareLink(data);
  if (outcome === 'copiado') confirmOn(button, status, 'Enlace copiado');
  else if (outcome === 'no copiado') confirmOn(button, status, 'No se pudo copiar el enlace');
}

const STATES = { E: stateE, X: stateX, D: stateD, B: stateB, C: stateC, A: stateA };

export const screen = {
  id: 'home',
  // Todo sale de los datos inmediatos salvo data-health.json (la caja de D y la frescura): se pide
  // una vez y queda en datasets.health. Nunca rechaza: sin él, la portada se pinta igual (spec §7).
  needs: (params, datasets) => (datasets.health ? [] : [ensureHealth().then((health) => { datasets.health = health; })]),
  render(ctx) {
    const state = homeState({ resolution: ctx.resolution, todayISO: ctx.today, portalSeason: ctx.portal.season });
    const body = STATES[state](ctx, { shields: (ctx.datasets && ctx.datasets.shields) || {} });
    return html`<section data-screen="home" data-state="${state}">${body}</section>`;
  },
  mount(root, ctx, nav) {
    const section = root.matches && root.matches('[data-screen="home"]') ? root : root.querySelector('[data-screen="home"]');
    if (!section) return;
    // La escucha va en la sección, que se sustituye en cada pintado: nunca se acumula.
    section.addEventListener('click', event => {
      const target = event.target.closest('[data-action]');
      if (!target || !section.contains(target)) return;
      const action = target.getAttribute('data-action');
      if (action === 'elegir') {
        const c = ctx.resolution.candidates[Number(target.getAttribute('data-index'))];
        if (c && nav && typeof nav.saveMyTeam === 'function') {
          nav.saveMyTeam({ name: c.name, season: c.group.season, cat: c.cat, groupId: c.group.id });
        }
        return;
      }
      const { name, group } = ctx.resolution;
      const next = teamFixtures(name, group, ctx.today).next;
      if (!next) return;
      // El enlace compartido es el de la página sin consulta ni ruta: solo la del partido.
      const data = shareData(next, location.href.split(/[?#]/)[0]);
      if (action === 'calendario') {
        downloadCalendar(...calendarArgs(next, group, data.url));
      } else if (action === 'compartir') {
        share(target, section.querySelector('[data-role="aviso"]'), data);
      }
    });
  },
};
```

2. `links.js` pierde `displayDate`, que usaba `toLocaleDateString` y no tiene uso desde el corte, y gana en su lugar las fechas en castellano sin `Intl`.

En `src/links.js`, sustituir:

```js
export function displayDate(value, season = PORTAL.season, options = {}) {
  const iso = fixtureISO(value, season);
  if (!iso) return 'Fecha por confirmar';
  return new Date(iso + 'T12:00:00Z').toLocaleDateString('es-ES', {
    timeZone: PORTAL.timeZone, weekday: 'short', day: 'numeric', month: 'short', ...options,
  });
}
```

por:

```js
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
```

3. Añadir al final de `src/links.js`:

```js

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
```

4. Añadir al final de `acta.css`:

```css

/* ── Mi equipo: la portada (spec §4.2) ─────────────────────────────────── */

/* Enlace de texto pulsable: «calendario completo», «ver todos»… Mide 44 px
 * de alto, pero los márgenes negativos no agrandan la línea ni la cabecera del bloque. */
.more {
  display: inline-flex;
  align-items: center;
  min-height: 44px;
  margin-top: -12px;
  margin-bottom: -12px;
  font-weight: 700;
  color: var(--ink);
  text-decoration: underline;
}

.home-note { padding: 10px 12px; font-size: 13.5px; font-weight: 600; color: var(--mute); text-align: center; }
.home-fresh { margin-top: 14px; font-size: 12.5px; color: var(--mute); }
/* Columnas de la portada: en móvil, una debajo de otra, y nunca más anchas que la página. */
.home-cols, .home-main, .home-side { min-width: 0; }

/* Próximo partido y último partido */
.fixture {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto minmax(0, 1fr);
  align-items: start;
  gap: 6px;
  padding: 14px 8px 12px;
}
.fixture-team { display: flex; flex-direction: column; align-items: center; gap: 2px; min-width: 0; text-align: center; }
.fixture-side { margin-top: 4px; font-size: 12.5px; color: var(--mute); }
.fixture-name {
  max-width: 100%;
  font-size: 15px;
  font-weight: 800;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.fixture-vs { align-self: center; padding: 0 6px; font-size: 19px; font-weight: 800; color: var(--rule); }
.fixture-venue { display: flex; flex-direction: column; gap: 1px; padding: 6px 8px 8px; }
.fixture-place { font-size: 15px; overflow-wrap: anywhere; }
.fixture-place.is-muted { font-size: 13.5px; font-weight: 600; color: var(--mute); }

.result {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto minmax(0, 1fr);
  align-items: center;
  gap: 6px;
  min-height: 44px;
  padding: 14px 8px 12px;
  color: var(--text);
  text-decoration: none;
}
.result-score { font-size: 40px; font-weight: 800; line-height: 1; color: var(--ink); }

/* Últimos cinco: una casilla por partido, cada una abre su ficha */
.last5 { display: grid; gap: 1px; margin: 0; padding: 0; list-style: none; background: var(--rule); }
.last5-1 { grid-template-columns: minmax(0, 1fr); }
.last5-2 { grid-template-columns: repeat(2, minmax(0, 1fr)); }
.last5-3 { grid-template-columns: repeat(3, minmax(0, 1fr)); }
.last5-4 { grid-template-columns: repeat(4, minmax(0, 1fr)); }
.last5-5 { grid-template-columns: repeat(5, minmax(0, 1fr)); }
.last5 > li { display: flex; min-width: 0; background: var(--paper); }
.last5-cell {
  display: flex;
  flex: 1 1 auto;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  min-width: 0;
  min-height: 44px;
  padding: 8px 2px 7px;
  color: var(--text);
  text-decoration: none;
}
.last5-score { font-size: 17px; font-weight: 800; line-height: 1.2; }
.last5-rival {
  max-width: 100%;
  font-size: 12.5px;
  color: var(--mute);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* Goleadores del equipo */
.scorers { width: 100%; border-collapse: collapse; table-layout: fixed; }
.scorers th, .scorers td { height: 40px; padding: 0 8px; border-bottom: 1px solid var(--line); text-align: right; }
.scorers thead th {
  height: auto;
  padding: 6px 8px;
  border-bottom: 1.5px solid var(--ink);
  font-size: 11.5px;
  font-weight: 600;
  color: var(--mute);
}
.scorers tbody tr:last-child > * { border-bottom: 0; }
.scorers .sc-name { text-align: left; font-weight: 400; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.scorers .sc-goals { width: 60px; }
.scorers .sc-games { width: 44px; }
.scorers td.sc-goals { font-size: 17px; font-weight: 800; color: var(--ink); }

@media (hover: hover) {
  a.last5-cell:hover .last5-score,
  a.result:hover .result-score,
  .choice:hover .choice-name { text-decoration: underline; }
}
```

5. La regla, para todo `src/`: ningún módulo formatea con los datos de idioma del motor.

Añadir al final de `scripts/tests/test_rediseno_modulos.mjs`:

```js
// ── Plan B2, tarea 7: nada de lo que se ve depende de los datos de idioma (B9 de la revisión) ──
// Los días y los meses van escritos en links.js; los números, con toFixed. Intl solo convierte a la
// hora de Canarias, con partes numéricas.
test('ningún módulo formatea con los datos de idioma del motor: ni toLocale*String ni Intl en castellano', () => {
  for (const f of MODULES) {
    assert.doesNotMatch(code(read(`src/${f}`)), /\.toLocale(?:Date|Time)?String\(|Intl\.[A-Za-z]+Format\(\s*['"]es/, f);
  }
});
```

- [ ] **Step 4: Run test to verify it passes**

```bash
cd /home/manolo/claude/futbol-base
node --test scripts/tests/test_rediseno_portada.mjs scripts/tests/test_rediseno_modulos.mjs 2>&1 | grep -E '^# (tests|pass|fail)'
```
Esperado:
```text
# tests 35
# pass 35
# fail 0
```
Si falla «cada clase que emite la portada existe en acta.css», su mensaje lista las clases que faltan en la hoja.

- [ ] **Step 5: Suites completas y los tres smoke**

```bash
cd /home/manolo/claude/futbol-base
python3 -m pytest scripts/tests/ -q 2>&1 | tail -1
node --test scripts/tests/test_*.mjs 2>&1 | grep -E '^# (tests|pass|fail)'
```
Esperado:
- pytest: el mismo recuento, sin `failed`.
- node: el recuento anterior más 29, sin fallos (`# fail 0`). `test_rediseno_home.mjs` y `test_rediseno_smoke.mjs` (Tarea 4) siguen en verde con la portada nueva: fijan su contrato.

El `render-smoke` del corte sigue valiendo: la portada conserva `data-screen`, `data-state`, la cabecera de pantalla y el `h1` con el nombre del equipo.

```bash
cd /home/manolo/claude/futbol-base
node scripts/tests/render-smoke.mjs
node scripts/tests/interaction-smoke.mjs
node scripts/tests/pwa-smoke.mjs 2>&1 | grep -v '^PWA fixture HTTP 404 /escudos/s/'
```
Esperado, con el tamaño del DOM del día:
```text
PASS: render smoke OK — Mi equipo en estado D (DOM 15008 bytes)
PASS: la portada carga a 320px en claro, sin desplazamiento horizontal
PASS: la portada carga a 320px en oscuro, sin desplazamiento horizontal
PASS: la portada carga a 390px en claro, sin desplazamiento horizontal
PASS: la portada carga a 390px en oscuro, sin desplazamiento horizontal
PASS: la portada carga a 768px en claro, sin desplazamiento horizontal
PASS: la portada carga a 768px en oscuro, sin desplazamiento horizontal
PASS: la portada carga a 1440px en claro, sin desplazamiento horizontal
PASS: la portada carga a 1440px en oscuro, sin desplazamiento horizontal
PASS: de la app anterior (su SW real) al rediseño, con datos congelados: la 1.ª apertura es la anterior; sin conexión a medias, el aviso con «Reintentar»; la 2.ª y la 3.ª, la nueva con acta.css y sin mezclar módulos; futbolbase-v20991231a funciona sin conexión
```

- [ ] **Step 6: Commit**

```bash
cd /home/manolo/claude/futbol-base
git add src/screen-home.js src/links.js acta.css scripts/tests/test_rediseno_portada.mjs scripts/tests/test_rediseno_modulos.mjs
git commit -F - <<'EOF'
feat(rediseño): Mi equipo con la cabecera y los estados E, X, B, C y A (B2, tarea 7)

La portada mínima del corte pasa a la de spec §4.2, con los mismos
marcadores (data-screen, data-state y un solo h1 con el equipo):
- cabecera de pantalla (screenHead) con escudo, nombre, etiqueta de
  grupo y «Cambiar», que abre Explorar con el buscador enfocado
  (#/explorar#buscar);
- E: la pregunta con cada candidato (escudo, nombre y etiqueta de
  grupo) y «Ninguno: buscar otro equipo»; X: «no aparece» y «Elegir
  equipo»;
- B con sus dos causas (grupo sin empezar, o equipo que no ha jugado,
  como un retirado) y C con sus tres textos;
- A: próximo partido con cuenta atrás, casillas y botonera (Cómo
  llegar, .ics y compartir o copiar el enlace), Últimos cinco, la
  clasificación con la fila propia, los 5 primeros goleadores, las
  cifras con la nota de cobertura (§7) y la frescura;
- aviso de stale en C y D (decisión 20 de B1).

needs pide data-health.json una vez (la caja de D y la frescura) y lo
deja en datasets.health. Piezas comunes para las demás pantallas, en
links.js: shareLink (navigator.share o copiar el enlace) y copyText, y
las fechas en castellano sin Intl (weekdayDate, dayMonth, dayMonthLong,
monthName), que sustituyen a displayDate: nada de lo que se ve depende
de los datos de idioma del motor (B9 de la revisión adversarial).

- test_rediseno_portada: cada estado con datos reales congelados y
  today inyectado, el «hoy» de Canarias, la primera visita con el
  almacén vacío o roto, el escapado, cada semana real de 2025/26 y las
  reglas de la hoja.

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01Sg56KK3oZgo8Ye7Snj6wG9
EOF
```
Esperado: `5 files changed`.

---

### Task 8: Mi equipo (2): estado D con «Verano» y dos columnas en escritorio

Completa la portada: el estado D de la maqueta 6-1 (la temporada siguiente, «Así terminó», «Verano», «Ver toda la temporada» y la clasificación final) y el escritorio de §4.8, con el calendario completo del equipo en la columna izquierda.

**Contexto** (medido el 24/09/2026 sobre las fixtures congeladas):
- **Hoy, 23/09/2026** (caso 1 de §11): PG2 está en D y `data-health` tiene 2026/27 `pending`, así que sale la caja. Su `checkedAt`, las 21:11 UTC, son las 22:11 en Canarias: «Última comprobación: hoy, 22:11».
  - El 15/06/2026, con la temporada siguiente ya lista, no hay caja y la cabecera dice «Temporada 2025/26 terminada».
  - Sin `data-health`, la caja sale igual (`showNextSeasonBox`) y la casilla toma la fecha del literal oculto «Última actualización» de `index.html`, sin hora (§4.2 D). La pantalla es pura y no lee el DOM: la recibe en `ctx.legacyDate` (cambio de contrato; la app ya lee ese literal para `offlineNotice`). Sin él, «no disponible».
- **«Así terminó 2025/26»** de Las Mesas en PG2: 9.º de 15 (el total cuenta a CD Batán, retirado), 37 puntos, 12G 1E 15P, 90 y 120 goles, último 2–7 contra AD Huracán y máximo goleador Theo De La Rosa Perello, con 12 goles en 17 partidos. `seasonSummary` no trae el goleador: sale de `teamScorers` (B1, «Para B2»).
- **«Verano»** (caso 8 de §11 y decisión 19 de B1): `summerCups` da MCP3 y MCPK1 con el equipo «UD Las Mesas Huracán» y solo sus partidos:
  - MCP3, fase de grupos: 3.º de 4, con 3 puntos;
  - MCPK1, Copa Plata: previa en Tablero (1–4, 26/06), cuartos contra Unión Carrizal (1–1, pasó por penaltis 3–2, 27/06) y semifinales contra Maspa Training A (2–4, 27/06).
  - Nunca MCB16 ni MCBK2, que son de benjamín. RC Victoria no tiene «Verano»: «Real Club Victoria» (MCP3) no se une a su club (B1, «Para B2»).
- **Clasificación final:** la fila propia con dos arriba y dos abajo (7.º a 11.º). En los extremos, las cinco primeras o las cinco últimas (Unión Viera, 1.º, y CD Batán, 15.º). Columnas #, Equipo, J, DG y Pts: `standingsTable` gana la vista `resumen`.
- **Escritorio (§4.8).** A, B y C llevan en la columna izquierda el próximo o último partido, Últimos cinco y el calendario completo del equipo; en la derecha, la clasificación, los goleadores, las cifras y la frescura. D lleva la caja, «Así terminó», «Verano» y «Ver toda la temporada» a la izquierda y la clasificación final a la derecha.
  - El calendario completo **no está en la portada en móvil** (§4.8). Como §5.1 pide pintar solo lo visible, nunca se oculta con CSS: `render` deja un hueco vacío (`data-slot="calendario"`) y `mount` lo pinta si `matchMedia('(min-width: 1024px)')` se cumple, y lo quita o lo pone al cruzar ese ancho.
  - Son 26 partidos de Las Mesas en PG2 y 22 en A2, cada uno con su estado y enlace a su ficha.

**Files:**
- Modify: `src/screen-home.js`: cuatro sustituciones exactas: los `import`, el hueco del calendario en `seasonView`, el estado D completo con el calendario de escritorio, y `mount`.
- Modify: `src/ui.js`: la vista `resumen` de `standingsTable`.
- Modify: `acta.css`: se añade al final el bloque del paso 3.
- Modify: `scripts/tests/test_rediseno_portada.mjs`: un `import` y 11 pruebas al final.

**Interfaces:**
- Consumes, además de lo de la Tarea 7:
  - de B1: `matchRow` (`ui.js`), `competitionKey` (`model.js`), y `showNextSeasonBox` y `summerCups` (`myteam.js`);
  - del `ctx`: `model.cups()` (`Cups` de 2025-26 o `null`), `model.clubIndex()` y `legacyDate` (nuevo y opcional: el `DD/MM/AAAA` del literal oculto «Última actualización» de `index.html`, o `null`);
  - `matchMedia`, solo dentro de `mount`.
- Produces:
  - en `src/screen-home.js`: `teamCalendar(team, group, { today, shields })` → `Html`, el bloque `#calendario` con todos los partidos del equipo en su grupo, y el hueco `[data-slot="calendario"]` en A, B y C;
  - en `src/ui.js`: `standingsTable(rows, { view: 'resumen' })`, con J y DG.

- [ ] **Step 1: Write the failing test**

1. En `scripts/tests/test_rediseno_portada.mjs`, sustituir:

```js
import { screen, coverageText, shareData, matchCalendar } from '../../src/screen-home.js';
```

por:

```js
import { standingsTable } from '../../src/ui.js';
import { screen, coverageText, shareData, matchCalendar, teamCalendar } from '../../src/screen-home.js';
```

2. Añadir al final de `scripts/tests/test_rediseno_portada.mjs`:

```js

// ── Estado D, «Verano», clasificación final y escritorio (Tarea 8) ────────

const DESKTOP = media => media !== null && /min-width:\s*1024px/.test(media);

test('D el 23/09/2026 (caso 1 de §11): «A la espera de la temporada 2026/27» y la caja con sus casillas y su texto', () => {
  const out = render(CASES.D);
  assert.match(out, /data-state="D"/);
  assert.match(out, /<h1>Las Mesas Hu\.<\/h1><p class="screen-sub">A la espera de la temporada 2026\/27<\/p><\/div><a class="screen-action" href="#\/explorar#buscar">Cambiar<\/a>/);
  assert.equal(text(blockOf(out, 'Temporada 2026/27')), 'Temporada 2026/27 Grupos pendientes en esta web Última comprobación hoy, 22:11 '
    + 'La temporada 2026/27 aparecerá aquí cuando la federación publique los grupos y se activen en esta web. '
    + 'Si hay más de un equipo de Las Mesas Hu., te preguntaremos cuál es el tuyo.');
  assert.doesNotMatch(out, /[Ss]e revisa/);
  assert.doesNotMatch(out, /Próximo partido/);
});

test('D sin la caja: el 15/06/2026 con 2026/27 ya lista, «Temporada 2025/26 terminada»', () => {
  const ready = { ...health, nextSeason: { name: '2026-2027', status: 'ready' } };
  const out = render({ today: '2026-06-15', withHealth: ready });
  assert.match(out, /data-state="D"/);
  assert.match(out, /<p class="screen-sub">Temporada 2025\/26 terminada<\/p>/);
  assert.equal(blockOf(out, 'Temporada 2026/27'), null);
});

test('D sin data-health: la caja sale con la fecha del literal «Última actualización», sin hora, o «no disponible»', () => {
  const legacy = render({ today: '2026-09-23', withHealth: null, legacyDate: '23/09/2026' });
  assert.match(text(blockOf(legacy, 'Temporada 2026/27')), /Grupos pendientes en esta web Última comprobación 23 sept La temporada/);
  const none = render({ today: '2026-09-23', withHealth: null });
  assert.match(blockOf(none, 'Temporada 2026/27'), /<div class="cell is-muted"><dt class="cell-label">Última comprobación<\/dt><dd class="cell-value">no disponible<\/dd><\/div>/);
});

test('«Así terminó 2025/26»: puesto de 15, puntos, balance, goles, último resultado y máximo goleador del equipo', () => {
  assert.equal(text(blockOf(render(CASES.D), 'Así terminó 2025/26')), 'Así terminó 2025/26 Prebenjamín, Grupo 2 de Gran Canaria '
    + 'Posición 9.º de 15 Puntos 37 Balance 12G 1E 15P A favor 90 goles En contra 120 goles Último 2–7 Huracán '
    + 'Máximo goleador Theo De La Rosa Perello, 12 goles en 17 partidos');
  assert.doesNotMatch(blockOf(render({ ...CASES.D, gol: {} }), 'Así terminó 2025/26'), /Máximo goleador/);
});

test('Verano de PG2 (caso 8 de §11): MCP3 y MCPK1 con el puesto, los partidos de cuadro y el paso por penaltis; nunca los de benjamín', () => {
  const block = blockOf(render(CASES.D), 'Verano: Maspalomas Cup 2026');
  assert.match(block, /<p class="block-context">junio<\/p>/);
  const rows = [...block.matchAll(/<a class="summer-row" href="([^"]+)">(.*?)<\/a>/g)].map(m => [m[1], text(m[2])]);
  assert.deepEqual(rows, [
    ['#/copa?s=2025-2026&amp;g=MCP3', 'Fase de grupos, Grupo C 3.º de 4 3 pts'],
    ['#/copa?s=2025-2026&amp;g=MCPK1', 'Copa Plata, previa · vie 26 jun Tablero – Las Mesas Huracán 1–4'],
    ['#/copa?s=2025-2026&amp;g=MCPK1', 'Copa Plata, cuartos · sáb 27 jun Las Mesas Huracán – Unión Carrizal 1–1 Las Mesas Huracán pasó por penaltis (3–2)'],
    ['#/copa?s=2025-2026&amp;g=MCPK1', 'Copa Plata, semifinales · sáb 27 jun Las Mesas Huracán – Maspa Training A 2–4'],
  ]);
  assert.doesNotMatch(block, /MCB16|MCBK2|Copa Oro|Grupo P\b/);
  // RC Victoria no tiene «Verano»: «Real Club Victoria» (MCP3) no se une a su club (B1, «Para B2»).
  assert.ok(!titles(render({ ...CASES.D, myTeam: { ...LAS_MESAS, name: 'RC Victoria' } })).some(t => t.startsWith('Verano')));
});

test('«Ver toda la temporada 2025/26» abre la ficha del equipo en esa temporada y grupo', () => {
  assert.match(render(CASES.D), /<a class="home-all" href="#\/equipo\?s=2025-2026&amp;g=PG2&amp;t=Las%20Mesas%20Hu\.">Ver toda la temporada 2025\/26<\/a>/);
});

test('«Clasificación final»: la fila propia con dos arriba y dos abajo, con #, Equipo, J, DG y Pts, y «ver completa»', () => {
  const rowsOf = block => [...block.matchAll(/<tr( class="is-mine")?><td class="st-pos">(\d+)<\/td>.*?<span class="st-name">(.*?)<\/span>/g)]
    .map(m => [Number(m[2]), m[3], Boolean(m[1])]);
  const block = blockOf(render(CASES.D), 'Clasificación final');
  assert.deepEqual(rowsOf(block), [[7, 'Gran Canaria', false], [8, 'Telde', false], [9, 'Las Mesas Hu.', true],
    [10, 'Santa Brígida', false], [11, 'Las Huesas', false]]);
  assert.deepEqual([...block.matchAll(/<th scope="col" class="[^"]+">(?:<abbr title="[^"]+">)?(.*?)(?:<\/abbr>)?<\/th>/g)].map(m => m[1]),
    ['#', 'Equipo', 'J', 'DG', 'Pts']);
  assert.match(block, /<p class="block-context"><a class="more" href="#\/tabla\?s=2025-2026&amp;g=PG2">ver completa<\/a><\/p>/);
  assert.match(block, /<caption class="vh">Clasificación final: Prebenjamín, Grupo 2 de Gran Canaria<\/caption>/);
  // Cerca de un extremo, las cinco primeras o las cinco últimas.
  const top = blockOf(render({ ...CASES.D, myTeam: { ...LAS_MESAS, name: 'Unión Viera' } }), 'Clasificación final');
  assert.deepEqual(rowsOf(top).map(r => r[0]), [1, 2, 3, 4, 5]);
  const bottom = blockOf(render({ ...CASES.D, myTeam: { ...LAS_MESAS, name: 'CD Batán' } }), 'Clasificación final');
  assert.deepEqual(rowsOf(bottom).map(r => r[0]), [11, 12, 13, 14, 15]);
});

test('standingsTable: la vista «resumen» es #, Equipo, J, DG y Pts', () => {
  const row = { pos: 9, team: 'Las Mesas Hu.', pts: 37, pj: 28, g: 12, e: 1, p: 15, gf: 90, gc: 120, dg: -30, retired: false };
  const out = String(standingsTable([row], { view: 'resumen', mine: 'Las Mesas Hu.' }));
  assert.match(out, /<td class="st-pos">9<\/td><th scope="row" class="st-team">.*<\/th><td class="st-num">28<\/td><td class="st-dg">−30<\/td><td class="st-pts">37<\/td><\/tr>/);
});

test('dos columnas (§4.8): a la izquierda el partido, Últimos cinco y el hueco del calendario; a la derecha la clasificación, goleadores y cifras', () => {
  const columnsOf = markup => {
    const m = String(markup).match(/<div class="home-cols"><div class="home-main">([\s\S]*)<\/div><div class="home-side">([\s\S]*)<\/div><\/div><\/section>$/);
    return { main: m[1], side: m[2] };
  };
  const a = columnsOf(render(CASES.A));
  assert.deepEqual(titles(a.main), ['Próximo partido', 'Últimos cinco']);
  assert.ok(a.main.endsWith('<div data-slot="calendario"></div>'));
  assert.deepEqual(titles(a.side), ['Clasificación', 'Goleadores del equipo', 'La temporada en cifras']);
  assert.match(a.side, /<p class="home-fresh">.*<\/p>$/);
  const c = columnsOf(render(CASES.C));
  assert.deepEqual(titles(c.main), ['Último partido', 'Últimos cinco']);
  const b = columnsOf(render(CASES.B));
  assert.deepEqual(titles(b.main), ['Próximo partido']);
  assert.match(b.main, /<p class="empty">Aún no se ha jugado ninguna jornada<\/p><\/section><div data-slot="calendario"><\/div>$/);
  assert.deepEqual(titles(b.side), ['Clasificación']);
  const d = columnsOf(render(CASES.D));
  assert.deepEqual(titles(d.main), ['Temporada 2026/27', 'Así terminó 2025/26', 'Verano: Maspalomas Cup 2026']);
  assert.match(d.main, /<a class="home-all" href="[^"]+">Ver toda la temporada 2025\/26<\/a>$/);
  assert.deepEqual(titles(d.side), ['Clasificación final']);
  assert.doesNotMatch(d.main, /data-slot/);
});

test('teamCalendar: el calendario completo de escritorio, en orden de jornada, con su estado y un enlace por partido', () => {
  const raw = currentAt('2026-06-02');
  const pg2 = buildSeason({ name: raw.season, current: true, ...raw }).groups.find(g => g.id === 'PG2');
  const out = String(teamCalendar('Las Mesas Hu.', pg2, { today: '2026-06-03', shields }));
  assert.match(out, /^<section class="block" id="calendario"><div class="block-head"><h2 class="block-title">Calendario<\/h2><p class="block-context">26 partidos<\/p><\/div><ol class="box cal">/);
  const whens = [...out.matchAll(/<p class="cal-when">(.*?)<\/p>/g)].map(m => m[1]);
  assert.equal(whens.length, 26);
  assert.equal(whens[0], 'Jornada 1 · sáb 11 oct');
  assert.equal(whens[25], 'Jornada 30 · mar 2 jun');
  assert.equal((out.match(/<a class="match-row" href="#\/partido\?s=2025-2026&amp;g=PG2&amp;r=Jornada%20\d+&amp;/g) || []).length, 26);
  assert.equal((out.match(/<span class="match-note">sin resultado<\/span>/g) || []).length, 1);
  assert.deepEqual(missingClasses(out), []);
  assert.match(String(teamCalendar('CD Batán', pg2, { today: '2026-06-03' })), /<p class="empty">Sin partidos en el calendario de este grupo<\/p>/);
});

test('estilos de D y de escritorio: dos columnas desde 1024 px, filas de verano de 44 px y el calendario nunca oculto con CSS', () => {
  const cols = decl('.home-cols', DESKTOP);
  assert.match(cols, /display:\s*grid/);
  assert.match(cols, /grid-template-columns:\s*minmax\(0, 1fr\) minmax\(0, 1fr\)/);
  assert.doesNotMatch(decl('.home-cols'), /display:\s*(grid|flex)/, 'en móvil las columnas se apilan');
  assert.match(decl('.summer-row'), /min-height:\s*44px/);
  const all = decl('.home-all');
  assert.match(all, /min-height:\s*48px/);
  assert.match(all, /border:\s*1\.5px solid var\(--ink\)/);
  assert.match(decl('.summer-note'), /color:\s*var\(--ink\)/);
  assert.doesNotMatch(CSS, /(data-slot|\.cal\b|#calendario)[^{]*\{[^}]*display:\s*none/, 'lo pinta mount, no se esconde');
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd /home/manolo/claude/futbol-base
node --test scripts/tests/test_rediseno_portada.mjs 2>&1 | grep -E '^# (tests|pass|fail)|SyntaxError'
```
Esperado:
```text
# SyntaxError: The requested module '../../src/screen-home.js' does not provide an export named 'teamCalendar'
# tests 1
# pass 0
# fail 1
```

- [ ] **Step 3: Write minimal implementation**

1. En `src/screen-home.js`, sustituir:

```js
import { box, cells, crest, empty, notice, screenHead, standingsTable } from './ui.js';
import {
  lastResults, matchState, playerName, retiredTeams, seasonLabel, seasonSummary, sourceInfo,
  teamFixtures, teamShort,
} from './model.js';
import { homeState } from './myteam.js';
import {
  buildCalendar, countdownLabel, dayMonthLong, downloadCalendar, routeHref, shareLink, venueUrl, weekdayDate,
} from './links.js';
```

por:

```js
import { box, cells, crest, empty, matchRow, notice, screenHead, standingsTable } from './ui.js';
import {
  competitionKey, lastResults, matchState, playerName, retiredTeams, seasonLabel, seasonSummary,
  sourceInfo, teamFixtures, teamShort,
} from './model.js';
import { homeState, showNextSeasonBox, summerCups } from './myteam.js';
import {
  buildCalendar, countdownLabel, dayMonth, dayMonthLong, downloadCalendar, monthName, routeHref, shareLink,
  venueUrl, weekdayDate,
} from './links.js';
```

2. En `src/screen-home.js`, sustituir (en `seasonView`):

```js
  aside.push(freshness(ctx, group));
  return columns(main, aside);
```

por:

```js
  main.push(CALENDAR_SLOT);
  aside.push(freshness(ctx, group));
  return columns(main, aside);
```

3. En `src/screen-home.js`, sustituir:

```js
// ── Estado D: temporada terminada ───────────────────────────────────────

// La cabecera, el aviso y la clasificación completa del grupo terminado.
function stateD(ctx, env) {
  const r = ctx.resolution;
  return html`${header(r.name, `Temporada ${seasonLabel(r.group.season)} terminada`, env)}${staleNotice(r)}${columns([], [standingsBlock(r.group, r.name, env.shields)])}`;
}
```

por:

```js
// ── Estado D: temporada terminada (spec §4.2 D, §6.4 y maqueta 6-1) ─────

// Casilla de la última comprobación: «hoy, 22:11» o «23 sept, 22:11».
function checkedCell(instant, today) {
  const c = canary(instant);
  if (!c) return null;
  return c.day === today ? `hoy, ${c.time}` : `${dayMonth(c.day)}, ${c.time}`;
}

// Sin data-health, la fecha del literal oculto «Última actualización: DD/MM/AAAA» de
// index.html, sin hora (spec §4.2 D): «23 sept».
function legacyCell(text) {
  const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(String(text ?? '').trim());
  return m ? dayMonth(`${m[3]}-${m[2]}-${m[1]}`) : null;
}

// '2025-2026' → '2026-2027'
const nextSeasonOf = season => {
  const m = /^(\d{4})-(\d{4})$/.exec(String(season));
  return m ? `${Number(m[1]) + 1}-${Number(m[2]) + 1}` : '';
};

function nextSeasonBox(ctx, name, next) {
  const health = ctx.health;
  const checked = health && health.checkedAt ? checkedCell(health.checkedAt, ctx.today) : legacyCell(ctx.legacyDate);
  const club = teamShort(name).replace(/\s[A-E]$/, '');
  return box(html`${cells([
    { label: 'Grupos', value: 'pendientes en esta web' },
    { label: 'Última comprobación', value: checked || 'no disponible', muted: !checked },
  ])}<p class="box-text">La temporada ${seasonLabel(next)} aparecerá aquí cuando la federación publique los grupos y se activen en esta web. Si hay más de un equipo de ${club}, te preguntaremos cuál es el tuyo.</p>`,
  { title: `Temporada ${seasonLabel(next)}` });
}

function endedBlock(ctx, group, name) {
  const sum = seasonSummary(name, group);
  const top = scorersOf(ctx, group, name)[0] || null;
  const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;
  const content = html`${cells([
    { label: 'Posición', value: sum.pos != null ? `${sum.pos}.º de ${sum.of}` : '—' },
    { label: 'Puntos', value: sum.pts ?? '—' },
    { label: 'Balance', value: sum.g != null ? `${sum.g}G ${sum.e}E ${sum.p}P` : '—' },
  ])}${cells([
    { label: 'A favor', value: sum.gf != null ? plural(sum.gf, 'gol', 'goles') : '—' },
    { label: 'En contra', value: sum.gc != null ? plural(sum.gc, 'gol', 'goles') : '—' },
    { label: 'Último', value: sum.last ? `${score(sum.last.gf, sum.last.gc)} ${teamShort(sum.last.rival)}` : '—' },
  ])}${top ? html`<p class="home-top"><span class="cell-label">Máximo goleador</span><span class="home-top-name"><b>${playerName(top.name)}</b>, ${plural(top.goals, 'gol', 'goles')} en ${plural(top.games, 'partido', 'partidos')}</span></p>` : ''}`;
  return box(content, { title: `Así terminó ${seasonLabel(group.season)}`, context: group.label });
}

// «Verano» (spec §6.4 y decisión 19 de B1): los torneos de su categoría, una caja
// por competición, con la fase de grupos (puesto) y cada partido de cuadro.
function summerBlocks(ctx, resolution) {
  const cups = ctx.model.cups();
  if (!cups) return [];
  const mine = { name: resolution.name, season: resolution.group.season, cat: resolution.cat, groupId: resolution.group.id };
  const byCompetition = new Map();
  for (const entry of summerCups(cups, mine, ctx.model.clubIndex())) {
    const label = competitionKey(entry.group, entry.group.season).label;
    if (!byCompetition.has(label)) byCompetition.set(label, []);
    byCompetition.get(label).push(entry);
  }
  return [...byCompetition].map(([label, entries]) => {
    const rows = entries.flatMap(entry => (entry.group.kind === 'cup-bracket'
      ? entry.rows.map(m => bracketRow(entry.group, m))
      : [groupPhaseRow(entry.group, entry.team)]));
    const months = [...new Set(entries.flatMap(e => e.rows).map(m => m.dateISO).filter(Boolean).sort()
      .map(monthName))];
    return box(html`<ul class="summer">${rows}</ul>`, { title: `Verano: ${label}`, context: listText(months) });
  });
}

function groupPhaseRow(group, team) {
  const row = group.standings.find(r => r.team === team);
  return html`<li><a class="summer-row" href="${routeHref('copa', { s: group.season, g: group.id })}"><span class="summer-what">Fase de grupos, ${group.name}</span><span class="summer-main">${row ? `${row.pos}.º de ${group.standings.length}` : teamShort(team)}</span><span class="summer-score">${row ? `${row.pts} pts` : ''}</span></a></li>`;
}

function bracketRow(group, m) {
  const round = roundOf(group, m);
  const when = shortDate(m.dateISO);
  const what = `${group.name}, ${(round ? round.label : m.roundKey).toLowerCase()}${when ? ` · ${when}` : ''}`;
  const played = m.hs != null && m.as != null;
  const penalties = played && m.hs === m.as && m.advancer
    ? `${teamShort(m.advancer === 'home' ? m.home : m.away)} pasó por penaltis${m.shootout ? ` (${m.shootout.replace('-', '–')})` : ''}`
    : null;
  return html`<li><a class="summer-row" href="${routeHref('copa', { s: group.season, g: group.id })}"><span class="summer-what">${what}</span><span class="summer-main">${teamShort(m.home)} – ${teamShort(m.away)}</span><span class="summer-score">${played ? score(m.hs, m.as) : '–'}</span>${penalties ? html`<span class="summer-note">${penalties}</span>` : ''}</a></li>`;
}

// La fila propia con las dos de arriba y las dos de abajo; cerca de un extremo,
// las cinco primeras o las cinco últimas.
function windowAround(rows, name, around = 2) {
  const size = 2 * around + 1;
  const i = rows.findIndex(row => row.team === name);
  if (i < 0) return rows.slice(0, size);
  const start = Math.max(0, Math.min(i - around, rows.length - size));
  return rows.slice(start, start + size);
}

function finalStandings(group, name, shields) {
  if (!group.standings.length) return blockEmpty('Clasificación final', 'Clasificación sin publicar');
  const more = html`<a class="more" href="${routeHref('tabla', { s: group.season, g: group.id })}">ver completa</a>`;
  return box(standingsTable(windowAround(group.standings, name), {
    view: 'resumen', mine: name, shields, hrefFor: row => teamHref(group, row.team), caption: `Clasificación final: ${group.label}`,
  }), { title: 'Clasificación final', context: more });
}

function stateD(ctx, env) {
  const r = ctx.resolution;
  const { group, name } = r;
  const withBox = showNextSeasonBox({ group, health: ctx.health, portalSeason: ctx.portal.season });
  const next = nextSeasonOf(group.season);
  const subtitle = withBox ? `A la espera de la temporada ${seasonLabel(next)}` : `Temporada ${seasonLabel(group.season)} terminada`;
  const main = [
    withBox ? nextSeasonBox(ctx, name, next) : '',
    endedBlock(ctx, group, name),
    ...summerBlocks(ctx, r),
    html`<a class="home-all" href="${teamHref(group, name)}">Ver toda la temporada ${seasonLabel(group.season)}</a>`,
  ];
  return html`${header(name, subtitle, env)}${staleNotice(r)}${columns(main, [finalStandings(group, name, env.shields)])}`;
}

// ── Calendario completo del equipo (escritorio, spec §4.8) ──────────────

// Hueco del calendario en la columna principal de A, B y C: mount lo pinta en escritorio.
const CALENDAR_SLOT = html`<div data-slot="calendario"></div>`;

// Todos sus partidos del grupo, en orden de jornada y con su estado (spec §5.3).
export function teamCalendar(team, group, { today, shields = {} } = {}) {
  const items = group.rounds.flatMap(round => round.matches.filter(m => m.home === team || m.away === team).map(m => ({ round, m })));
  if (!items.length) return blockEmpty('Calendario', 'Sin partidos en el calendario de este grupo');
  const rows = items.map(({ round, m }) => html`<li><p class="cal-when">${round.label}${m.dateISO ? ` · ${shortDate(m.dateISO)}` : ''}</p>${matchRow(m, { today, shields, href: matchHref(m) })}</li>`);
  return html`<section class="block" id="calendario"><div class="block-head"><h2 class="block-title">Calendario</h2><p class="block-context">${items.length} partidos</p></div><ol class="box cal">${rows}</ol></section>`;
}

// Solo en escritorio: se pinta al montar y al cruzar los 1024 px, nunca oculto con
// CSS (spec §5.1: se pinta solo lo visible). Se desconecta cuando la pantalla cambia.
const WIDE = '(min-width: 1024px)';
function wideCalendar(section, ctx) {
  const slot = section.querySelector('[data-slot="calendario"]');
  if (!slot || typeof matchMedia !== 'function') return;
  const query = matchMedia(WIDE);
  const paint = () => {
    if (!slot.isConnected) {
      if (typeof query.removeEventListener === 'function') query.removeEventListener('change', paint);
      return;
    }
    const { name, group } = ctx.resolution;
    // Html de la plantilla html``, que escapa toda interpolación, como el pintado del router.
    slot.innerHTML = query.matches ? String(teamCalendar(name, group, { today: ctx.today, shields: ctx.datasets?.shields || {} })) : '';
  };
  paint();
  if (typeof query.addEventListener === 'function') query.addEventListener('change', paint);
}
```

4. En `src/screen-home.js`, sustituir (el final de `mount`):

```js
        share(target, section.querySelector('[data-role="aviso"]'), data);
      }
    });
  },
};
```

por:

```js
        share(target, section.querySelector('[data-role="aviso"]'), data);
      }
    });
    if (ctx.resolution && ctx.resolution.status === 'ok') wideCalendar(section, ctx);
  },
};
```

5. En `src/ui.js`, sustituir:

```js
// Spec §4.4. «todas» es la de escritorio (≥1024 px).
const VIEWS = {
  puntos: ['pj', 'g', 'e', 'p', 'dg'],
```

por:

```js
// Spec §4.4. «todas» es la de escritorio (≥1024 px) y «resumen», la de la
// clasificación final de la portada en el estado D (spec §4.2: #, Equipo, J, DG y Pts).
const VIEWS = {
  puntos: ['pj', 'g', 'e', 'p', 'dg'],
  resumen: ['pj', 'dg'],
```

6. Añadir al final de `acta.css`:

```css

/* ── Mi equipo, estado D: temporada siguiente, «Así terminó» y «Verano» ── */

.box-text { padding: 10px 12px 12px; font-size: 15px; line-height: 1.5; }
.home-top { display: flex; flex-direction: column; gap: 1px; padding: 6px 8px 8px; }
.home-top-name { font-size: 15px; overflow-wrap: anywhere; }
.summer { margin: 0; padding: 0; list-style: none; }
.summer > li + li { border-top: 1px solid var(--line); }
.summer-row {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: center;
  column-gap: 10px;
  min-height: 44px;
  padding: 8px 12px;
  color: var(--text);
  text-decoration: none;
}
.summer-what { grid-column: 1 / -1; font-size: 12.5px; color: var(--mute); }
.summer-main { min-width: 0; font-size: 15px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.summer-score { font-size: 17px; font-weight: 800; }
.summer-note {
  grid-column: 1 / -1;
  justify-self: end;
  margin-top: 4px;
  padding: 1px 6px;
  border: 1px solid var(--rule);
  font-size: 12.5px;
  font-weight: 700;
  color: var(--ink);
}
.home-all {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 48px;
  margin-top: 18px;
  padding: 0 12px;
  border: 1.5px solid var(--ink);
  font-weight: 800;
  color: var(--ink);
  text-align: center;
  text-decoration: none;
}

/* Calendario completo del equipo: solo en escritorio, y lo pinta mount */
.cal { margin: 0; padding: 0; list-style: none; }
.box.cal > li + li { border-top-color: var(--line); }
.cal-when { padding: 6px 6px 0; font-size: 11.5px; font-weight: 600; color: var(--mute); }

/* Dos columnas en escritorio (spec §4.8); en móvil, una debajo de otra */
@media (min-width: 1024px) {
  .home-cols {
    display: grid;
    grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
    align-items: start;
    column-gap: 40px;
  }
}

@media (hover: hover) {
  a.summer-row:hover .summer-main,
  a.home-all:hover { text-decoration: underline; }
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
cd /home/manolo/claude/futbol-base
node --test scripts/tests/test_rediseno_portada.mjs 2>&1 | grep -E '^# (tests|pass|fail)'
```
Esperado:
```text
# tests 39
# pass 39
# fail 0
```

- [ ] **Step 5: Verificación visual (Chrome, fuera del repo)**

La vista previa pinta y monta `screen-home.js` en Chrome, como lo hará el router, con `acta.css`, los casos de las pruebas y el `createModel` real. Se sirve desde memoria: `/__case.json` construye el caso con `simulate.mjs`, y `/escudos/s/<x>.png` responde con el original, como las miniaturas de B4. Mide, en cada captura:
- el desplazamiento horizontal;
- los pulsables de menos de 44 px;
- las imágenes rotas;
- si la barra tapa el final del contenido.

Además prueba en el navegador el comportamiento de `mount`:
- «Compartir» sin `navigator.share` copia el enlace del partido y lo confirma en el botón y en la región de estado;
- «Calendario» descarga el `.ics` del partido;
- responder a E llama a `nav.saveMyTeam` con el candidato;
- el calendario completo aparece a 1440 px, desaparece a 390 y vuelve a 1280.

```bash
cd /home/manolo/claude/futbol-base
S=/tmp/claude-1000/-home-manolo/db6fd8e0-f1e7-4e94-b6cd-ef7dd5bf6ae9/scratchpad/planB2
mkdir -p "$S"
cat > "$S/home-preview.mjs" <<'EOF'
// Vista previa de la portada (Plan B2, Tareas 7 y 8): screen-home.js con acta.css y los datos
// congelados de las fixtures, pintada y montada en Chrome como lo hará el router.
// Uso, desde la raíz del repo (con Playwright en node_modules, Tarea 4): OUT=<dir> node <este fichero>
// No escribe en el repo: sirve los ficheros tal cual, más /__case.json (el caso, construido en Node
// con simulate.mjs) y /__home.html (la página); /escudos/s/<x>.png responde con el original
// escudos/<x>.png|.jpg, como las miniaturas de B4.
import { createServer } from 'node:http';
import { createRequire } from 'node:module';
import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import { extname, join, normalize, sep } from 'node:path';
import { pathToFileURL } from 'node:url';

const out = process.env.OUT;
if (!out) { console.error('Falta OUT=<directorio de capturas>'); process.exit(2); }
mkdirSync(out, { recursive: true });
const root = process.cwd();
const load = rel => import(pathToFileURL(join(root, rel)).href);
const { fixture } = await load('scripts/tests/fixtures/rediseno/load.mjs');
const { currentAt, nextSeasonRaw } = await load('scripts/tests/fixtures/rediseno/simulate.mjs');
const { findChrome } = await load('scripts/tests/render-smoke.mjs');
const { chromium } = createRequire(join(root, 'scripts/tests/x.mjs'))('playwright');

const LAS_MESAS = { name: 'Las Mesas Hu.', season: '2025-2026', cat: 'prebenjamin', groupId: 'PG2' };
// Los goleadores de las pruebas (copia literal de data-goleadores.js del 23/09/2026).
const GOL = {
  prebenjamin: [{ id: 'PG2', g: 'PREBENJAMIN GC GRUPO 2', s: [
    ['De La Rosa Perello, Theo', 'Las Mesas Hu.', 12, 17], ['Santana Santacruz, Agoney', 'Las Mesas Hu.', 11, 21],
    ['Ruiz Aleman, Einar', 'Las Mesas Hu.', 9, 23], ['Hidalgo Camejo, Pablo', 'Las Mesas Hu.', 8, 18],
    ['Medina Hairach, Nadir', 'Las Mesas Hu.', 8, 21], ['Peña Peña, Alejandro', 'Las Mesas Hu.', 6, 20],
  ] }],
  benjamin: [{ id: 'A2', g: 'BENJAMIN SEGUNDA FASE A-G2', s: [
    ['Espiau Chicoy, Alvaro', 'Las Mesas Hu.', 23, 19], ['Espiau Chicoy, Sergio', 'Las Mesas Hu.', 16, 19],
    ['Rodriguez Montesdeoca, Iker', 'Las Mesas Hu.', 13, 16], ['Lorenzo Hernandez, Joel', 'Las Mesas Hu.', 12, 17],
    ['Navarro Melgar, Lucas', 'Las Mesas Hu.', 9, 16], ['Llarena Moreno, Carlos', 'Las Mesas Hu.', 8, 19],
  ] }],
};
const CASES = {
  A: () => ({ raw: currentAt('2026-05-20'), myTeam: { ...LAS_MESAS, cat: 'benjamin', groupId: 'A2' }, today: '2026-05-20' }),
  A1: () => ({ raw: currentAt('2026-03-01'), myTeam: LAS_MESAS, today: '2026-03-01' }),
  B: () => ({ raw: nextSeasonRaw({ benjamin: ['A1', 'B2', 'FF15'], prebenjamin: ['PG2', 'PG3'] }),
    myTeam: { ...LAS_MESAS, season: '2026-2027' }, today: '2026-10-01', portalSeason: '2026-2027', gol: {} }),
  C: () => ({ raw: currentAt('2026-06-03'), myTeam: LAS_MESAS, today: '2026-06-03' }),
  D: () => ({ raw: fixture('current-2025-2026'), myTeam: LAS_MESAS, today: '2026-09-23' }),
  E: () => ({ raw: fixture('current-2025-2026'), myTeam: { name: 'Las Mesas Hu. B', season: '2025-2026', cat: 'benjamin', groupId: 'FF13' }, today: '2026-09-23' }),
  X: () => ({ raw: nextSeasonRaw({ benjamin: ['A1'], prebenjamin: ['PG3'] }), myTeam: LAS_MESAS, today: '2026-10-01', portalSeason: '2026-2027', gol: {} }),
};
const caseJson = name => JSON.stringify({ portalSeason: '2025-2026', health: fixture('health'), legacyDate: '23/09/2026',
  cups: fixture('cups-2025-2026'), shields: fixture('shields'), gol: GOL, ...CASES[name]() });

// La página: tabbar y main como el esqueleto de index.html; el módulo construye el ctx con los
// módulos reales (createModel con buildClubIndex, como las pruebas), pinta y monta.
const PAGE = `<!DOCTYPE html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Mi equipo</title><link rel="stylesheet" href="/acta.css"></head><body>
<a class="skip-link" href="#contenido">Saltar al contenido</a><div id="barra"></div><main id="contenido" class="page"></main>
<script type="module">
import { crestFallback, tabbar } from '/src/ui.js';
import { createModel } from '/src/model.js';
import { buildClubIndex, resolveMyTeam } from '/src/myteam.js';
import { screen } from '/src/screen-home.js';
document.addEventListener('error', (e) => crestFallback(e.target), true);
document.getElementById('barra').outerHTML = String(tabbar('miequipo'));
const c = await (await fetch('/__case.json' + location.search)).json();
const datasets = { benjamin: c.raw.benjamin, prebenjamin: c.raw.prebenjamin, history: c.raw.history,
  golBenj: c.gol.benjamin || null, golPrebenj: c.gol.prebenjamin || null, shields: c.shields, seasons: null,
  cupBenjamin: c.cups.benjamin, cupPrebenjamin: c.cups.prebenjamin, seasonRaw: {}, matchDetail: null, lineups: {}, health: c.health };
const model = createModel(datasets, { portalSeason: c.portalSeason, buildClubIndex });
const season = model.season(c.portalSeason);
const index = model.clubIndex();
const ctx = { route: { screen: '', params: {} }, params: {}, model, myTeam: c.myTeam, today: c.today, health: c.health,
  legacyDate: c.legacyDate, resolution: resolveMyTeam(c.myTeam, season, index, c.today), datasets,
  portal: { season: c.portalSeason, defaultTeam: {} }, lastPrimary: 'miequipo' };
window.__saved = [];
const main = document.getElementById('contenido');
main.innerHTML = String(screen.render(ctx));
screen.mount(main, ctx, { saveMyTeam: (t) => window.__saved.push(t) });
window.__ready = true;
</script></body></html>`;

const MIME = { '.css': 'text/css', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg', '.woff2': 'font/woff2' };
const server = createServer((req, res) => {
  const url = new URL(req.url, 'http://x');
  if (url.pathname === '/__home.html') { res.setHeader('Content-Type', 'text/html; charset=utf-8'); return res.end(PAGE); }
  if (url.pathname === '/__case.json') { res.setHeader('Content-Type', 'application/json'); return res.end(caseJson(url.searchParams.get('case'))); }
  let fp = normalize(join(root, decodeURIComponent(url.pathname)));
  const thumb = url.pathname.match(/^\/escudos\/s\/(.+)\.png$/);
  if (thumb) fp = ['png', 'jpg'].map((x) => join(root, 'escudos', `${decodeURIComponent(thumb[1])}.${x}`)).find(existsSync) || fp;
  if (!fp.startsWith(root + sep) || !existsSync(fp)) { res.statusCode = 404; return res.end('no'); }
  res.setHeader('Content-Type', MIME[extname(fp)] || 'application/octet-stream');
  res.end(readFileSync(fp));
}).listen(0, '127.0.0.1');
await new Promise((resolve) => server.once('listening', resolve));
const base = `http://127.0.0.1:${server.address().port}/__home.html`;

const browser = await chromium.launch({ executablePath: findChrome() });
const problems = [];
const open = async (name, w, h, scheme) => {
  const context = await browser.newContext({ viewport: { width: w, height: h }, colorScheme: scheme, reducedMotion: 'reduce', acceptDownloads: true });
  const page = await context.newPage();
  page.on('pageerror', (e) => problems.push(`${name} ${w}px ${scheme}: ${e.message}`));
  await page.goto(`${base}?case=${name}`, { waitUntil: 'networkidle' });
  await page.waitForFunction(() => window.__ready === true);
  return { context, page };
};
const TAPPABLE = '.tab, .button, a.match-row, .st-link, .more, .last5-cell, .choice, .result, .summer-row, .home-all';
for (const [name, w, h, scheme] of [
  ['A', 390, 844, 'light'], ['A', 390, 844, 'dark'], ['A', 320, 700, 'light'], ['A', 1440, 900, 'light'], ['A1', 390, 844, 'light'],
  ['B', 390, 844, 'light'], ['C', 390, 844, 'light'], ['D', 390, 844, 'light'], ['D', 390, 844, 'dark'], ['D', 320, 700, 'light'],
  ['D', 1440, 900, 'light'], ['E', 390, 844, 'light'], ['E', 390, 844, 'dark'], ['X', 390, 844, 'light'],
]) {
  const { context, page } = await open(name, w, h, scheme);
  const m = await page.evaluate((tappable) => {
    const bar = document.querySelector('.tabbar');
    window.scrollTo(0, document.documentElement.scrollHeight);
    const last = document.querySelector('main').lastElementChild.getBoundingClientRect();
    const covered = getComputedStyle(bar).position === 'fixed' && last.bottom > bar.getBoundingClientRect().top + 0.5;
    window.scrollTo(0, 0);
    return {
      state: document.querySelector('[data-screen="home"]').dataset.state,
      overflow: document.documentElement.scrollWidth - innerWidth,
      small: [...document.querySelectorAll(tappable)].map((e) => [e.className, Math.round(e.getBoundingClientRect().height)]).filter(([, px]) => px < 44),
      broken: [...document.images].filter((i) => !i.naturalWidth).map((i) => i.getAttribute('src')),
      calendar: document.querySelectorAll('#calendario a.match-row').length,
      covered,
    };
  }, TAPPABLE);
  console.log(`${name} ${w}px ${scheme}:`, JSON.stringify(m));
  if (m.overflow > 0) problems.push(`${name} ${w}px: desplazamiento horizontal de ${m.overflow}px`);
  if (m.small.length) problems.push(`${name} ${w}px: pulsables de menos de 44px: ${JSON.stringify(m.small)}`);
  if (m.broken.length) problems.push(`${name} ${w}px: imágenes rotas: ${m.broken.join(', ')}`);
  if (m.covered) problems.push(`${name} ${w}px: la barra tapa el final del contenido`);
  await page.screenshot({ path: `${out}/home-${name}-${w}-${scheme}.png`, fullPage: true });
  await context.close();
}

// Detalles a 390 px, sin la barra fija encima: cabecera y próximo partido, Últimos cinco y Verano.
for (const [name, selector, file] of [
  ['A1', '.screen-head', 'cabecera'], ['A1', 'section.block:has(.fixture)', 'proximo'],
  ['C', 'section.block:has(.last5)', 'ultimos-cinco'], ['D', 'section.block:has(.summer)', 'verano'],
]) {
  for (const scheme of ['light', 'dark']) {
    const { context, page } = await open(name, 390, 844, scheme);
    await page.addStyleTag({ content: '.tabbar { display: none; }' });
    await page.locator(selector).first().screenshot({ path: `${out}/detalle-${file}-${scheme}.png` });
    await context.close();
  }
}

// Comportamiento de mount en el navegador.
{
  // Compartir sin navigator.share: copia el enlace y lo confirma en el botón.
  const { context, page } = await open('A', 390, 844, 'light');
  await context.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: new URL(base).origin });
  await page.evaluate(() => { Object.defineProperty(navigator, 'share', { value: undefined, configurable: true }); });
  await page.click('[data-action="compartir"]');
  await page.waitForFunction(() => document.querySelector('[data-action="compartir"]').textContent === 'Enlace copiado');
  const copied = await page.evaluate(() => navigator.clipboard.readText());
  const status = await page.evaluate(() => document.querySelector('[data-role="aviso"]').textContent);
  console.log('compartir:', JSON.stringify({ copied: copied.replace(/^http:\/\/127\.0\.0\.1:\d+/, ''), status }));
  if (!copied.endsWith('#/partido?s=2025-2026&g=A2&r=Jornada%2022&h=Las%20Mesas%20Hu.&a=Simusetti')) problems.push('compartir: enlace copiado incorrecto');
  // Calendario: descarga el .ics de ese partido.
  const [download] = await Promise.all([page.waitForEvent('download'), page.click('[data-action="calendario"]')]);
  const ics = readFileSync(await download.path(), 'utf8');
  console.log('calendario:', JSON.stringify({ file: download.suggestedFilename(), dtstart: (ics.match(/DTSTART[^\r\n]*/) || [''])[0], events: (ics.match(/BEGIN:VEVENT/g) || []).length }));
  if (!/DTSTART:20260523T080000Z/.test(ics)) problems.push('calendario: el .ics no trae la hora del partido');
  await context.close();
}
{
  // E: elegir el segundo candidato guarda su equipo con nav.saveMyTeam.
  const { context, page } = await open('E', 390, 844, 'light');
  await page.click('[data-action="elegir"][data-index="1"]');
  const saved = await page.evaluate(() => window.__saved);
  console.log('elegir:', JSON.stringify(saved));
  if (JSON.stringify(saved) !== JSON.stringify([{ name: 'Las Mesas B', season: '2025-2026', cat: 'benjamin', groupId: 'B2' }])) problems.push('elegir: no guarda el candidato');
  await context.close();
}
{
  // Escritorio → móvil: el calendario completo aparece y desaparece al cruzar los 1024 px.
  const { context, page } = await open('C', 1440, 900, 'light');
  const wide = await page.locator('#calendario a.match-row').count();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForFunction(() => !document.getElementById('calendario'));
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.waitForFunction(() => document.querySelectorAll('#calendario a.match-row').length > 0);
  const again = await page.locator('#calendario a.match-row').count();
  console.log('calendario de escritorio:', JSON.stringify({ wide, narrow: 0, again }));
  if (wide !== 26 || again !== 26) problems.push('calendario de escritorio: no son los 26 partidos');
  await context.close();
}
await browser.close();
server.close();
console.log(problems.length ? 'PROBLEMAS:\n' + problems.join('\n') : `OK: sin errores; capturas en ${out}/home-*.png`);
process.exit(problems.length ? 1 : 0);
EOF
OUT="$S/shots-t8" node "$S/home-preview.mjs"
```
Esperado (el orden de las claves es fijo):
```text
A 390px light: {"state":"A","overflow":0,"small":[],"broken":[],"calendar":0,"covered":false}
A 390px dark: {"state":"A","overflow":0,"small":[],"broken":[],"calendar":0,"covered":false}
A 320px light: {"state":"A","overflow":0,"small":[],"broken":[],"calendar":0,"covered":false}
A 1440px light: {"state":"A","overflow":0,"small":[],"broken":[],"calendar":22,"covered":false}
A1 390px light: {"state":"A","overflow":0,"small":[],"broken":[],"calendar":0,"covered":false}
B 390px light: {"state":"B","overflow":0,"small":[],"broken":[],"calendar":0,"covered":false}
C 390px light: {"state":"C","overflow":0,"small":[],"broken":[],"calendar":0,"covered":false}
D 390px light: {"state":"D","overflow":0,"small":[],"broken":[],"calendar":0,"covered":false}
D 390px dark: {"state":"D","overflow":0,"small":[],"broken":[],"calendar":0,"covered":false}
D 320px light: {"state":"D","overflow":0,"small":[],"broken":[],"calendar":0,"covered":false}
D 1440px light: {"state":"D","overflow":0,"small":[],"broken":[],"calendar":0,"covered":false}
E 390px light: {"state":"E","overflow":0,"small":[],"broken":[],"calendar":0,"covered":false}
E 390px dark: {"state":"E","overflow":0,"small":[],"broken":[],"calendar":0,"covered":false}
X 390px light: {"state":"X","overflow":0,"small":[],"broken":[],"calendar":0,"covered":false}
compartir: {"copied":"/__home.html#/partido?s=2025-2026&g=A2&r=Jornada%2022&h=Las%20Mesas%20Hu.&a=Simusetti","status":"Enlace copiado"}
calendario: {"file":"calendario-las-mesas-hu-simusetti.ics","dtstart":"DTSTART:20260523T080000Z","events":1}
elegir: [{"name":"Las Mesas B","season":"2025-2026","cat":"benjamin","groupId":"B2"}]
calendario de escritorio: {"wide":26,"narrow":0,"again":26}
OK: sin errores; capturas en /tmp/claude-1000/-home-manolo/db6fd8e0-f1e7-4e94-b6cd-ef7dd5bf6ae9/scratchpad/planB2/shots-t8/home-*.png
```

Abrir con Read las capturas y compararlas con las maquetas 4 (`4-acta-roja.png`) y 6-1 (`6-1-pretemporada.png`):
- **A, `home-A1-390-light.png`** (Las Mesas en PG2, 01/03/2026), frente a la maqueta 4:
  - cabecera con el escudo, «Las Mesas Hu.», «Prebenjamín, Grupo 2 de Gran Canaria» en una línea bajo «Cambiar», y regla de tinta de 2 px;
  - «Próximo partido» con «faltan 6 días»: casillas Jornada 18, «sáb 7 mar» y 09:00; escudos de 46 px con Local y Visitante; «Campo: no publicado»; botonera con «Calendario» relleno de tinta y «Compartir». Sin campo no hay «Cómo llegar»;
  - «Últimos cinco» con cinco casillas (letra en círculo, marcador y rival corto) y «calendario completo»;
  - la clasificación con la fila propia (9.ª) en fondo rosado, texto en tinta y barra de 3 px. **Ningún óvalo**;
  - goleadores, «La temporada en cifras» en tres filas (3, 2 y 2 casillas), la nota «Cobertura:» y la frescura con «Ver fuentes».
- **A con campo, `home-A-390-light.png` y `-dark.png`** (A2, 20/05/2026): «Cómo llegar» relleno de tinta, en una línea también a 320 px (`home-A-320-light.png`). En oscuro, la P de la forma en claro y la tinta en `#FF5A64`.
- **B, C, E y X** (`home-B-390-light.png`, `home-C-390-light.png`, `home-E-390-*.png` y `home-X-390-light.png`):
  - B: próximo partido, el vacío de borde discontinuo y la tabla a cero;
  - C: «Último partido» con el 2–7 en 40 px de tinta y «Ya ha jugado todos sus partidos»;
  - E: la pregunta con dos botones (escudo, nombre en tinta y etiqueta de grupo) y «Ninguno: buscar otro equipo»; el filial sin escudo lleva el monograma «LM»;
  - X: el vacío y «Elegir equipo».
- **D, `home-D-390-light.png` y `-dark.png`**, frente a la maqueta 6-1, con las diferencias que manda la spec:
  - «A la espera de la temporada 2026/27»;
  - la caja con «Grupos: pendientes en esta web» y «Última comprobación: hoy, 22:11», sin «Se revisa», y el texto de §4.2;
  - «Así terminó 2025/26» con el máximo goleador;
  - «Verano: Maspalomas Cup 2026»: en `detalle-verano-*.png`, la etiqueta «Las Mesas Huracán pasó por penaltis (3–2)» bajo el 1–1 de cuartos;
  - «Ver toda la temporada 2025/26» y la clasificación final de cinco filas con «ver completa».
- **Escritorio, `home-A-1440-light.png` y `home-D-1440-light.png`:** dos columnas bajo la cabecera, alineadas arriba. En A, a la izquierda, el próximo partido, Últimos cinco y el calendario de 22 partidos; a la derecha, la tabla, los goleadores y las cifras. En D, la clasificación final a la derecha.
- **Detalles** (`detalle-*.png`): cabecera, próximo partido, Últimos cinco y Verano, en claro y en oscuro, sin la barra encima.

En las capturas de página completa, la barra fija aparece donde terminaba la ventana: es un efecto de `fullPage`, no un fallo.

- [ ] **Step 6: Suites completas y los tres smoke**

```bash
cd /home/manolo/claude/futbol-base
python3 -m pytest scripts/tests/ -q 2>&1 | tail -1
node --test scripts/tests/test_*.mjs 2>&1 | grep -E '^# (tests|pass|fail)'
```
Esperado:
- pytest: el mismo recuento, sin `failed`.
- node: el recuento anterior más 11, sin fallos (`# fail 0`).

```bash
cd /home/manolo/claude/futbol-base
node scripts/tests/render-smoke.mjs
node scripts/tests/interaction-smoke.mjs
node scripts/tests/pwa-smoke.mjs 2>&1 | grep -v '^PWA fixture HTTP 404 /escudos/s/'
```
Esperado, con el tamaño del DOM del día:
```text
PASS: render smoke OK — Mi equipo en estado D (DOM 12141 bytes)
PASS: la portada carga a 320px en claro, sin desplazamiento horizontal
PASS: la portada carga a 320px en oscuro, sin desplazamiento horizontal
PASS: la portada carga a 390px en claro, sin desplazamiento horizontal
PASS: la portada carga a 390px en oscuro, sin desplazamiento horizontal
PASS: la portada carga a 768px en claro, sin desplazamiento horizontal
PASS: la portada carga a 768px en oscuro, sin desplazamiento horizontal
PASS: la portada carga a 1440px en claro, sin desplazamiento horizontal
PASS: la portada carga a 1440px en oscuro, sin desplazamiento horizontal
PASS: de la app anterior (su SW real) al rediseño, con datos congelados: la 1.ª apertura es la anterior; sin conexión a medias, el aviso con «Reintentar»; la 2.ª y la 3.ª, la nueva con acta.css y sin mezclar módulos; futbolbase-v20991231a funciona sin conexión
```

- [ ] **Step 7: Commit**

```bash
cd /home/manolo/claude/futbol-base
git add src/screen-home.js src/ui.js acta.css scripts/tests/test_rediseno_portada.mjs
git commit -F - <<'EOF'
feat(rediseño): Mi equipo en D con «Verano» y dos columnas en escritorio (B2, tarea 8)

Estado D de la maqueta 6-1 con las reglas de spec §4.2 D:
- cabecera «Temporada 2025/26 terminada» o, con la caja, «A la espera
  de la temporada 2026/27»;
- caja de la temporada siguiente (showNextSeasonBox) con «Grupos» y
  «Última comprobación» (sin data-health, la fecha del literal
  «Última actualización», sin hora) y el texto de la spec;
- «Así terminó» con seasonSummary y el máximo goleador del equipo;
- «Verano» por equipo de torneo (decisión 19 de B1), con el puesto de
  la fase de grupos y cada partido de cuadro, y «pasó por penaltis»;
- «Ver toda la temporada» y la clasificación final (fila propia con
  dos arriba y dos abajo; nueva vista «resumen» de standingsTable).

Escritorio (§4.8): dos columnas, y el calendario completo del equipo en
la izquierda, que pinta mount solo desde 1024 px (nunca oculto con CSS).

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01Sg56KK3oZgo8Ye7Snj6wG9
EOF
```
Esperado: `4 files changed`.

---

### Task 9: `screen-jornada.js`: la pantalla Jornada (spec §4.3 y §4.8; maqueta 5-1)

La pantalla Jornada del rediseño: «‹ Jornada N de M ›» con sus fechas, los partidos por día con el propio primero y resaltado, el aviso de `roundNotice`, *Compartir jornada*, *Calendario del grupo* y «Otro grupo».

**Contexto**
- **Parámetros** (§4.1). El router (Tarea 6) ya da `s` y `g`, y manda a `#/copa` los grupos que no son de liga. La pantalla resuelve `r`, que es siempre `Round.key`, con `findRound` de `model.js`, la misma regla con la que el router la deja pasar (Tarea 6):
  - la ronda con esa clave;
  - si no existe, la del mismo número: un enlace escrito a mano con `r=30`, o PFV2, cuyas claves son `'1'` a `'14'`;
  - si tampoco, la de `defaultRound(group, today)`, que va por fecha (decisión 1 de B1): en A2 el 10/01/2026, la jornada 4 y no la 2 aplazada.
- **«‹ Jornada N de M ›».**
  - N es `round.n`, y M, la mayor jornada del grupo: FF17 (2025-26) y FV23 (2024-25) tienen huecos en la fuente.
  - Anterior y siguiente son enlaces a `#/jornada?s&g&r=<clave vecina>`, con un `id` estable (`round-prev` y `round-next`). Como solo cambia `r`, el router los lleva con `replaceState` (`historyMode`, Tarea 6) y devuelve el foco al control pulsado, no al `h1` (B11 de la revisión). En los extremos, un `span` apagado con el mismo `id` (`role="link"`, `aria-disabled` y `tabindex="-1"`), que conserva el foco.
- **Intervalo de fechas**, con los nombres en castellano escritos a mano (`WEEKDAYS` y `MONTHS` de `links.js`, Tarea 7), sin `Intl`, para que salga igual en Node y en el navegador:
  - «del 2 al 6 de junio», «del 30 de mayo al 2 de junio», y el año solo si cambia;
  - un solo día, «sábado 6 de junio»; sin fechas, «sin fecha publicada».
- **Días.**
  - Entran los partidos de la jornada salvo los que son contra retirados, que nunca se jugarán y que el aviso ya explica (los 14 de CD Teguinte en PFV2, sin fecha).
  - Se agrupan por fecha, con «Sin fecha» al final; dentro de cada día, por hora y en el orden de la fuente.
  - El día del partido propio va primero, aunque sea posterior, y el propio en cabeza, con `matchRow(…, { mine: true })`: resalte sin óvalo.
  - Cada fila abre `#/partido?s&g&r&h&a`.
- **Mi equipo en el grupo:** `myTeamIn(group, myTeam, resolution)`, nueva en `myteam.js`.
  - En el grupo resuelto, el nombre de la resolución.
  - En otro grupo de la misma temporada y la misma fase, nunca: Santa Brígida de B1 y la de B2 son dos equipos (decisión 17 de B1).
  - En otra fase u otra temporada, el nombre tal cual si el grupo es de su categoría y lo trae; es el grupo por defecto de §4.1 para temporadas pasadas.
  - Nunca en la otra categoría: el «Las Mesas Hu.» de A2 es el equipo benjamín.
- **Aviso** (§4.3, `roundNotice`):
  - «Sin partido en esta jornada: RC Victoria y Arucas B (descansa o le tocaba contra CD Batán)», con «y» entre los equipos y «o» entre los retirados;
  - «Faltan 2 partidos de esta jornada en la fuente», y «Falta 1 partido…» en singular;
  - nunca el «Sin datos en la fuente» de la maqueta, que era falso.
- **Botonera.**
  - *Compartir jornada*: `shareLink` de `links.js` (Tarea 7), con el enlace absoluto a `#/jornada?s&g&r`: `navigator.share` y, si no existe o falla, copia el enlace, y el botón dice «Enlace copiado» un momento (la botonera es `aria-live`).
  - *Calendario del grupo*: `groupCalendar(group, today)` da los partidos `pendiente` del grupo, sin los de retirados, y `downloadCalendar` (`links.js`) los descarga. Se oculta si no hay ninguno.
- **Cabecera:** `screenHead(title, { sub, action })` de `ui.js` (Tarea 4), con el `h1`, la etiqueta del grupo y «Otro grupo» → `#/ligas?s&c&i&to=jornada`. En temporadas pasadas, la etiqueta lleva la temporada: «Benjamín, Primera Fase, Grupo 1 · 2024/25» (`seasonLabel` de `model.js`, Tarea 4).
- **Carga:** `needs` usa `seasonNeeds(s, datasets, portalSeason)`, nueva en `state.js`, con la temporada del portal que le pasa el router (`needs(params, datasets, { portalSeason })`, Tarea 6); sin ella, `TypeError`, nunca la de `config.js` (R2-1 de la segunda ronda de la revisión). No devuelve nada si `s` es la temporada del portal o ya está en `datasets.seasonRaw`. Si no, llama a `ensureSeasonData`, guarda lo que trae en `datasets.seasonRaw` o rechaza con `Error('la temporada 2024/25')`, que es el `<qué>` de la caja de error del router.
- **Nunca en blanco.**
  - Si la temporada no está (`needs` no la trajo), la cabecera y la caja de error de `shell.js` (`errorBox`, Tarea 5) con «Reintentar», nunca los datos de otra temporada (§7).
  - Un grupo que no existe, o que no tiene calendario, pinta la cabecera y un vacío que lo dice.
- **Escritorio** (§4.8): `.days` pasa a rejilla `repeat(auto-fit, minmax(400px, 1fr))`. Con dos días o más, dos columnas; un día solo ocupa todo el ancho.
- **Pruebas:** `render(ctx)` en Node, con el `ctx` del esqueleto construido desde las fixtures por `scripts/tests/fixtures/rediseno/screens.mjs` (nuevo): el registro de datos de `datasetsFrom` (Tarea 3), `createModel` con `buildClubIndex` inyectado, `today` inyectado y mi equipo resuelto con `resolveMyTeam`.
- **Registro:** la pantalla entra en el router en la Tarea 12, con Tabla y Partido (`screens.js` y `STATIC_ASSETS`). Hasta entonces, `#/jornada` pinta la provisional.

**Files:**
- Create: `src/screen-jornada.js`, `scripts/tests/fixtures/rediseno/screens.mjs`
- Modify: `src/state.js` (`seasonNeeds`), `src/myteam.js` (`myTeamIn`) y `acta.css`
- Test: `scripts/tests/test_rediseno_jornada.mjs`

**Interfaces:**
- Consumes:
  - `html` (`src/html.js`); `matchRow(match, { mine, today, shields, href })`, `notice(term, text)`, `empty(text)` y `screenHead(title, { sub, action })` (`src/ui.js`, este de la Tarea 4);
  - `errorBox(what)` (`src/shell.js`, Tarea 5): «No se pudieron cargar los datos de <what>» con un botón `data-action="retry"`;
  - `defaultRound(group, todayISO)`, `roundNotice(group, round)`, `retiredTeams(group)` y `matchState(match, todayISO)` (`src/model.js`, B1), y `seasonLabel(season)` (Tarea 4);
  - `createModel(datasets, { portalSeason, buildClubIndex })` con `season(name)`, `group(season, id)`, `cups()`, `clubIndex()` y `scorers(season, cat)`, y `datasetsFrom(raw, extra)` (Tarea 3);
  - `routeHref(screen, params)`, `buildCalendar(matches, opts)`, `downloadCalendar(matches, opts)` y `shareLink(data)` (`src/links.js`, este de la Tarea 7);
  - `ensureSeasonData(name)` (`src/state.js`, con `dataVersion()` de la Tarea 2); `findRound(group, r)` (`src/model.js`, Tarea 6); `WEEKDAYS` y `MONTHS` (`src/links.js`, Tarea 7);
  - `resolveMyTeam(myTeam, season, index, todayISO)` y `buildClubIndex(names, shields)` (`src/myteam.js`);
  - `fixture(name)` y `currentAt(todayISO)` (fixtures de B1);
  - el `ctx` del esqueleto y `startRouter` (Tarea 6), cuyo `historyMode(from, to)` da `'replace'` cuando solo cambia `r`.
- Produces:
  - `src/screen-jornada.js`:
    - `export const screen = { id: 'jornada', needs(params, datasets, { portalSeason }) → Promise[], render(ctx) → Html, mount(root, ctx) }`;
    - `export function groupCalendar(group, todayISO) → [{ date, time, home, away, venue, jornada }]`;
    - `export function dayLabel(iso) → 'Martes 2 de junio' | 'Sin fecha'`;
    - `export function dateRange(fromISO, toISO) → 'del 2 al 6 de junio' | …`;
  - `src/state.js`: `export function seasonNeeds(name, datasets, portalSeason) → Promise[]` (sin `portalSeason`, `TypeError`);
  - `src/myteam.js`: `export function myTeamIn(group, myTeam, resolution) → string | null`;
  - `scripts/tests/fixtures/rediseno/screens.mjs`: `PORTAL_SEASON`, `MY_TEAM`, `datasetsFor({ current, golBenj, golPrebenj, seasonRaw })`, `pastSeasonRaw()`, `ctxFor(screen, params, { today, datasets, myTeam })` y `cssRules()`.

- [ ] **Step 1: Write the failing test**

Crear `scripts/tests/fixtures/rediseno/screens.mjs`:

```js
// Contexto de pantalla (ctx del esqueleto de B2) con las fixtures congeladas, para probar
// render(ctx) en Node. Nunca lee los data-*.js ni src/config.js vivos: la temporada del portal
// y el equipo por defecto van aquí, fijos.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { fixture } from './load.mjs';
import { datasetsFrom } from './simulate.mjs';
import { createModel } from '../../../../src/model.js';
import { buildClubIndex, resolveMyTeam } from '../../../../src/myteam.js';

export const PORTAL_SEASON = '2025-2026';
export const MY_TEAM = { name: 'Las Mesas Hu.', season: PORTAL_SEASON, cat: 'prebenjamin', groupId: 'PG2' };

// Registro de datos con la forma de readGlobals() más lo perezoso (esqueleto de B2): el de
// datasetsFrom (Tarea 3) con SEASONS, data-health y los goleadores que se pidan.
// `current` es el crudo de la temporada actual (fixture o currentAt(...)).
export function datasetsFor({ current = fixture('current-2025-2026'), golBenj = [], golPrebenj = [], seasonRaw = {} } = {}) {
  return datasetsFrom(current, {
    golBenj, golPrebenj, seasonRaw, health: fixture('health'),
    seasons: [{ name: PORTAL_SEASON, current: true }, { name: '2024-2025', current: false }],
  });
}

// La temporada 2024-25 congelada con la forma de SEASON_2024_2025 (que trae `name`).
export function pastSeasonRaw() {
  const raw = fixture('historical-2024-2025');
  return { name: raw.season, current: false, benjamin: raw.benjamin, prebenjamin: raw.prebenjamin };
}

// ctx de una pantalla: params ya resueltos (lo hace el router), hoy inyectado y mi equipo
// resuelto con resolveMyTeam sobre la temporada del portal.
export function ctxFor(screen, params, { today = '2026-09-24', datasets = datasetsFor(), myTeam = MY_TEAM } = {}) {
  const model = createModel(datasets, { portalSeason: PORTAL_SEASON, buildClubIndex });
  const resolution = resolveMyTeam(myTeam, model.season(PORTAL_SEASON), model.clubIndex(), today);
  return {
    route: { screen, params }, params, model, myTeam, resolution, today, health: datasets.health, datasets,
    portal: { season: PORTAL_SEASON, defaultTeam: MY_TEAM }, lastPrimary: screen,
  };
}

// Reglas de acta.css como { media, selector, body } (un nivel de @media, como en
// test_rediseno_css.mjs), y las clases que define.
export function cssRules() {
  const src = readFileSync(fileURLToPath(new URL('../../../../acta.css', import.meta.url)), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '');
  const rules = [];
  const walk = (text, media) => {
    let i = 0;
    while (i < text.length) {
      const open = text.indexOf('{', i);
      if (open < 0) break;
      const prelude = text.slice(i, open).trim();
      let depth = 1, j = open + 1;
      for (; j < text.length && depth; j++) depth += text[j] === '{' ? 1 : text[j] === '}' ? -1 : 0;
      const body = text.slice(open + 1, j - 1);
      if (prelude.startsWith('@media')) walk(body, prelude);
      else rules.push({ media, selector: prelude, body });
      i = j;
    }
  };
  walk(src, null);
  rules.classes = new Set([...src.matchAll(/\.([a-zA-Z][\w-]*)/g)].map(m => m[1]));
  return rules;
}
```

Crear `scripts/tests/test_rediseno_jornada.mjs`:

```js
// Plan B2, Tarea 9: pantalla Jornada (spec §4.3, §4.8 y caso 5 de §11). render(ctx) es pura:
// se prueba sobre el HTML que devuelve, con las fixtures congeladas y `today` inyectado.
import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { fixture } from './fixtures/rediseno/load.mjs';
import { currentAt } from './fixtures/rediseno/simulate.mjs';
import { ctxFor, datasetsFor, pastSeasonRaw, cssRules, MY_TEAM, PORTAL_SEASON } from './fixtures/rediseno/screens.mjs';
import { screen, groupCalendar, dayLabel, dateRange } from '../../src/screen-jornada.js';
import { myTeamIn } from '../../src/myteam.js';
import { seasonNeeds } from '../../src/state.js';
import { seasonLabel } from '../../src/model.js';
import { buildCalendar } from '../../src/links.js';

const s = (h) => String(h);
// Texto visible: sin etiquetas, con las entidades básicas resueltas y los espacios juntos.
const text = (h) => s(h).replace(/<[^>]*>/g, ' ').replace(/&quot;/g, '"').replace(/&#39;/g, "'")
  .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim();
const render = (params, opts) => s(screen.render(ctxFor('jornada', { s: PORTAL_SEASON, ...params }, opts)));
const at = (today) => ({ today, datasets: datasetsFor({ current: currentAt(today) }) });
const title = (out) => (out.match(/<h2 class="round-title">(.*?)<\/h2>/) || [])[1];
const days = (out) => [...out.matchAll(/<h3 class="day-title">(.*?)<\/h3>/g)].map(m => m[1]);
const noticeOf = (out) => text((out.match(/<p class="notice">.*?<\/p>/) || [''])[0]);
const rows = (out) => [...out.matchAll(/<a class="match-row[^"]*" href="([^"]*)">(.*?)<\/a>/g)]
  .map(m => ({ href: m[1].replace(/&amp;/g, '&'), mine: m[0].includes('is-mine'), text: text(m[2]) }));

test('PG2, jornada 30: cabecera, «Jornada 30 de 30», del 2 al 6 de junio y el aviso de §11 caso 5', () => {
  const out = render({ g: 'PG2', r: 'Jornada 30' });
  assert.match(out, /^<section data-screen="jornada">/);
  assert.equal((out.match(/<h1[ >]/g) || []).length, 1);
  assert.match(out, /<h1>Jornada<\/h1><p class="screen-sub">Prebenjamín, Grupo 2 de Gran Canaria<\/p>/);
  assert.match(out, /<a class="screen-action" href="#\/ligas\?s=2025-2026&amp;c=prebenjamin&amp;i=grancanaria&amp;to=jornada">Otro grupo<\/a>/);
  assert.equal(title(out), 'Jornada 30 de 30');
  assert.match(out, /<p class="round-dates">del 2 al 6 de junio<\/p>/);
  assert.equal(noticeOf(out), 'Sin partido en esta jornada: RC Victoria y Arucas B (descansa o le tocaba contra CD Batán)');
  assert.match(out, /<p class="notice"><b>Sin partido en esta jornada:<\/b> /);
  assert.doesNotMatch(text(out), /Faltan|Sin datos en la fuente/);
});

test('PG2, jornada 30: los partidos por día, el propio primero y resaltado; cada fila abre su ficha', () => {
  const out = render({ g: 'PG2', r: 'Jornada 30' });
  assert.deepEqual(days(out), ['Martes 2 de junio', 'Sábado 6 de junio']);
  const list = rows(out);
  assert.equal(list.length, 6);
  assert.deepEqual(list.map(r => r.mine), [true, false, false, false, false, false]);
  assert.equal(list[0].text, 'Partido de mi equipo. 17:30 Las Mesas Hu. 2–7 AD Huracán');
  assert.equal(list[0].href, '#/partido?s=2025-2026&g=PG2&r=Jornada%2030&h=Las%20Mesas%20Hu.&a=AD%20Hurac%C3%A1n');
  assert.deepEqual(list.slice(1).map(r => r.text.split(' ')[1]), ['Acodetti', 'Gran', 'La', 'Las', 'Telde']);
  assert.ok(list.every(r => r.href.startsWith('#/partido?s=2025-2026&g=PG2&r=Jornada%2030&h=')));
});

test('el día del partido propio va primero aunque sea posterior; «Sin fecha», al final', () => {
  const current = fixture('current-2025-2026');
  const j30 = current.history.PG2['Jornada 30'];
  j30[0][0] = '2026-06-07';   // Las Mesas Hu. – AD Huracán, al domingo
  j30[5][0] = '';             // Telde – CD Calero, sin fecha
  const out = render({ g: 'PG2', r: 'Jornada 30' }, { datasets: datasetsFor({ current }) });
  assert.deepEqual(days(out), ['Domingo 7 de junio', 'Sábado 6 de junio', 'Sin fecha']);
  assert.equal(rows(out)[0].mine, true);
  assert.match(out, /<p class="round-dates">del 6 al 7 de junio<\/p>/);
});

test('anterior y siguiente: enlaces a la jornada vecina con r = Round.key y un id estable; en los extremos, desactivados', () => {
  // El id es el mismo en cada jornada: al cambiar (replaceState), el router devuelve el foco al
  // control pulsado (B11 de la revisión); en un extremo, el apagado conserva el id y el foco.
  const last = render({ g: 'PG2', r: 'Jornada 30' });
  assert.match(last, /<a class="round-step" id="round-prev" href="#\/jornada\?s=2025-2026&amp;g=PG2&amp;r=Jornada%2029" aria-label="Jornada anterior: Jornada 29">‹<\/a>/);
  assert.match(last, /<span class="round-step is-off" id="round-next" role="link" aria-disabled="true" tabindex="-1" aria-label="Jornada siguiente: no hay">›<\/span>/);
  const first = render({ g: 'PG2', r: 'Jornada 1' });
  assert.match(first, /<span class="round-step is-off" id="round-prev" role="link" aria-disabled="true" tabindex="-1" aria-label="Jornada anterior: no hay">‹<\/span>/);
  assert.match(first, /id="round-next" href="#\/jornada\?s=2025-2026&amp;g=PG2&amp;r=Jornada%202" aria-label="Jornada siguiente: Jornada 2">›<\/a>/);
});

test('jornada por defecto (defaultRound, por fecha): sin r, con una r que no existe o con su número', () => {
  assert.equal(title(render({ g: 'PG2' })), 'Jornada 30 de 30', 'temporada terminada: la última con resultados');
  assert.equal(title(render({ g: 'PG2' }, at('2026-05-27'))), 'Jornada 29 de 30');
  assert.equal(title(render({ g: 'A2' }, at('2026-01-10'))), 'Jornada 4 de 22', 'el aplazado de la jornada 2 no manda (decisión 1 de B1)');
  assert.equal(title(render({ g: 'PG2', r: 'Jornada 99' })), 'Jornada 30 de 30');
  assert.equal(title(render({ g: 'PG2', r: '12' })), 'Jornada 12 de 30', 'un enlace escrito a mano con el número');
});

test('PG3: en ninguna jornada aparece «faltan»; los dos que no juegan, sin retirados', () => {
  const pg3 = ctxFor('jornada', { s: PORTAL_SEASON, g: 'PG3' }).model.group(PORTAL_SEASON, 'PG3');
  assert.equal(pg3.rounds.length, 30);
  for (const round of pg3.rounds) {
    const out = render({ g: 'PG3', r: round.key });
    assert.doesNotMatch(text(out), /Falta/, round.key);
    // Las jornadas 4 y 19 traen los siete partidos: nadie se queda sin jugar.
    if (round.matches.length === 7) assert.equal(noticeOf(out), '', round.key);
    else assert.match(noticeOf(out), /^Sin partido en esta jornada: [^(),]+ y [^()]+$/, round.key);
  }
});

test('PFV2: CD Teguinte (retirado) no sale en la lista, el aviso lo nombra y sus partidos sin fecha no mandan', () => {
  const out = render({ g: 'PFV2', r: '1' });
  assert.equal(title(out), 'Jornada 1 de 14');
  assert.deepEqual(days(out), ['Domingo 2 de noviembre']);
  assert.equal(rows(out).length, 3);
  assert.ok(rows(out).every(r => !r.text.includes('Teguinte')));
  assert.equal(noticeOf(out), 'Sin partido en esta jornada: ATISACHI DE FUERTEVENTURA C.F., C.D. "B" (descansa o le tocaba contra CD Teguinte)');
  assert.match(out, /ATISACHI DE FUERTEVENTURA C\.F\., C\.D\. &quot;B&quot;/, 'comillas escapadas');
  // A 1 de marzo, la jornada 9 (08/03) va antes que la 3 aplazada (15/03).
  assert.equal(title(render({ g: 'PFV2' }, at('2026-03-01'))), 'Jornada 9 de 14');
});

test('faltan: una jornada con menos partidos que la moda del grupo, en singular y en plural', () => {
  for (const [quitar, texto] of [[2, 'Faltan 2 partidos de esta jornada en la fuente'], [1, 'Falta 1 partido de esta jornada en la fuente']]) {
    const current = fixture('current-2025-2026');
    current.history.PG2['Jornada 15'].splice(0, quitar);
    const out = render({ g: 'PG2', r: 'Jornada 15' }, { datasets: datasetsFor({ current }) });
    assert.equal(noticeOf(out), texto);
  }
});

test('Calendario del grupo: solo con partidos futuros, sin los de retirados, y el .ics con uno por partido', () => {
  assert.doesNotMatch(render({ g: 'PG2' }), /data-action="group-calendar"/, 'sin partidos futuros, se oculta');
  const out = render({ g: 'PG2' }, at('2026-05-27'));
  assert.match(out, /<div class="buttons" aria-live="polite"><button class="button" type="button" data-action="share-round">Compartir jornada<\/button><button class="button" type="button" data-action="group-calendar">Calendario del grupo<\/button><\/div>/);
  const pg2 = ctxFor('jornada', {}, at('2026-05-27')).model.group(PORTAL_SEASON, 'PG2');
  const futuros = groupCalendar(pg2, '2026-05-27');
  assert.equal(futuros.length, 11, 'cinco de la jornada 29 y seis de la 30');
  assert.deepEqual(futuros[0], { date: '2026-05-27', time: '18:00', home: 'Santa Brígida', away: 'Arucas B', venue: '', jornada: 'Jornada 29' });
  const ics = buildCalendar(futuros, { season: PORTAL_SEASON, group: 'PG2', name: pg2.label, now: new Date('2026-05-27T08:00:00Z') });
  assert.equal((ics.match(/BEGIN:VEVENT/g) || []).length, 11);
  const pfv2 = ctxFor('jornada', {}, at('2026-03-01')).model.group(PORTAL_SEASON, 'PFV2');
  const fv = groupCalendar(pfv2, '2026-03-01');
  assert.equal(fv.length, 21);
  assert.ok(fv.every(m => m.home !== 'CD Teguinte' && m.away !== 'CD Teguinte'));
});

test('temporada pasada (P1 2024-25): la temporada en la etiqueta, fechas DD/MM, sin resalte ni calendario', () => {
  const datasets = datasetsFor({ seasonRaw: { '2024-2025': pastSeasonRaw() } });
  const out = render({ s: '2024-2025', g: 'P1' }, { datasets });
  assert.match(out, /<p class="screen-sub">Benjamín, Primera Fase, Grupo 1 · 2024\/25<\/p>/);
  assert.equal(title(out), 'Jornada 9 de 9');
  assert.match(out, /<p class="round-dates">del 20 al 21 de diciembre<\/p>/);
  assert.deepEqual(days(out), ['Viernes 20 de diciembre', 'Sábado 21 de diciembre']);
  assert.equal(rows(out).length, 5);
  assert.ok(rows(out).every(r => !r.mine && r.href.startsWith('#/partido?s=2024-2025&g=P1&r=9&')));
  assert.doesNotMatch(out, /group-calendar/);
  assert.match(out, /href="#\/ligas\?s=2024-2025&amp;c=benjamin&amp;i=grancanaria&amp;to=jornada"/);
});

test('temporada sin cargar, grupo que no existe o sin calendario: nunca una pantalla en blanco', () => {
  // needs no trajo 2023-24: la caja de error de shell.js (Tarea 5), con «Reintentar».
  const failed = render({ s: '2023-2024', g: 'P1' });
  assert.match(failed, /<h1>Jornada<\/h1>/);
  assert.match(text(failed), /No se pudieron cargar los datos de la temporada 2023\/24/);
  assert.match(failed, /data-action="retry"/);
  const none = render({ g: 'ZZ9' });
  assert.match(none, /<h1>Jornada<\/h1>/);
  assert.match(none, /<p class="empty">No hay ningún grupo ZZ9 en la temporada 2025\/26\.<\/p>/);
  assert.match(none, /href="#\/ligas\?s=2025-2026&amp;to=jornada">Otro grupo/);
  const current = fixture('current-2025-2026');
  current.history.PG2 = {};
  const out = render({ g: 'PG2' }, { datasets: datasetsFor({ current }) });
  assert.match(out, /<p class="empty">La fuente todavía no ha publicado el calendario de este grupo\.<\/p>/);
});

test('fechas: días de la semana, intervalos entre meses y años, y un solo día', () => {
  assert.equal(dayLabel('2026-06-02'), 'Martes 2 de junio');
  assert.equal(dayLabel(null), 'Sin fecha');
  assert.equal(dateRange('2026-06-02', '2026-06-06'), 'del 2 al 6 de junio');
  assert.equal(dateRange('2026-05-30', '2026-06-02'), 'del 30 de mayo al 2 de junio');
  assert.equal(dateRange('2025-12-28', '2026-01-03'), 'del 28 de diciembre de 2025 al 3 de enero de 2026');
  assert.equal(dateRange('2026-06-06', '2026-06-06'), 'sábado 6 de junio');
  assert.equal(dateRange(undefined, undefined), 'sin fecha publicada');
  assert.equal(seasonLabel('2024-2025'), '2024/25');
});

test('myTeamIn: el de la resolución en su grupo, el nombre exacto en su categoría y nunca un homónimo', () => {
  const ctx = ctxFor('jornada', {}, { datasets: datasetsFor({ seasonRaw: { '2024-2025': pastSeasonRaw() } }) });
  const g = (season, id) => ctx.model.group(season, id);
  assert.equal(myTeamIn(g(PORTAL_SEASON, 'PG2'), MY_TEAM, ctx.resolution), 'Las Mesas Hu.');
  assert.equal(myTeamIn(g(PORTAL_SEASON, 'A2'), MY_TEAM, ctx.resolution), null, '«Las Mesas Hu.» de benjamín es otro equipo');
  assert.equal(myTeamIn(g(PORTAL_SEASON, 'PG3'), MY_TEAM, ctx.resolution), null);
  assert.equal(myTeamIn(g('2024-2025', 'PGC2'), MY_TEAM, ctx.resolution), 'Las Mesas Hu.');
  assert.equal(myTeamIn(g('2024-2025', 'P1'), MY_TEAM, ctx.resolution), null);
  assert.equal(myTeamIn(g(PORTAL_SEASON, 'PG2'), MY_TEAM, { status: 'ask', candidates: [] }), 'Las Mesas Hu.');
  assert.equal(myTeamIn(null, MY_TEAM, ctx.resolution), null);
  // Santa Brígida juega en B1 y en B2 (Segunda Fase B): con B1 resuelto, la de B2 es otro equipo;
  // la de FF9, su grupo de la Primera Fase, sí es la suya.
  const brigida = { name: 'Santa Brígida', season: PORTAL_SEASON, cat: 'benjamin', groupId: 'B1' };
  const ok = { status: 'ok', group: g(PORTAL_SEASON, 'B1'), name: 'Santa Brígida', cat: 'benjamin' };
  assert.equal(myTeamIn(g(PORTAL_SEASON, 'B1'), brigida, ok), 'Santa Brígida');
  assert.equal(myTeamIn(g(PORTAL_SEASON, 'B2'), brigida, ok), null);
  assert.equal(myTeamIn(g(PORTAL_SEASON, 'FF9'), brigida, ok), 'Santa Brígida');
});

test('needs: [] en la temporada del portal o ya cargada; si no, la carga y la guarda, o rechaza con «la temporada …»', async () => {
  const datasets = datasetsFor();
  assert.deepEqual(seasonNeeds(PORTAL_SEASON, datasets, PORTAL_SEASON), []);
  assert.throws(() => seasonNeeds('2024-2025', datasets), TypeError, 'sin la temporada del portal, nunca la de config.js');
  // La temporada del portal llega a screen.needs desde el router (R2-1 de la revisión adversarial).
  assert.deepEqual(screen.needs({ s: PORTAL_SEASON }, datasets, { portalSeason: PORTAL_SEASON }), []);
  assert.deepEqual(screen.needs({ s: '2024-2025' }, { seasonRaw: { '2024-2025': {} } }, { portalSeason: PORTAL_SEASON }), []);
  const saved = { fetch: globalThis.fetch, document: globalThis.document, error: console.error };
  globalThis.document = { querySelector: () => null };
  console.error = () => {};   // ensureSeasonData avisa del 404 por consola
  try {
    globalThis.fetch = async () => ({ ok: false, status: 404 });
    const [fails] = seasonNeeds('2022-2023', datasets, PORTAL_SEASON);
    await assert.rejects(fails, { message: 'la temporada 2022/23' });
    assert.equal(datasets.seasonRaw['2022-2023'], undefined);
    globalThis.fetch = async () => ({ ok: true, text: async () => 'const SEASON_2023_2024={"name":"2023-2024","benjamin":[],"prebenjamin":[]};' });
    const loads = seasonNeeds('2023-2024', datasets, PORTAL_SEASON);
    assert.equal(loads.length, 1);
    await loads[0];
    assert.equal(datasets.seasonRaw['2023-2024'].name, '2023-2024');
    assert.deepEqual(seasonNeeds('2023-2024', datasets, PORTAL_SEASON), []);
  } finally {
    console.error = saved.error;
    globalThis.fetch = saved.fetch;
    if (saved.document === undefined) delete globalThis.document; else globalThis.document = saved.document;
  }
});

test('la pantalla es pura y usa solo clases que existen en acta.css', () => {
  const defined = cssRules().classes;
  const out = [render({ g: 'PG2', r: 'Jornada 30' }), render({ g: 'PG2' }, at('2026-05-27')), render({ g: 'ZZ9' })].join('');
  const used = new Set([...out.matchAll(/class="([^"]+)"/g)].flatMap(m => m[1].split(/\s+/)));
  assert.deepEqual([...used].filter(c => !defined.has(c)), []);
  const ctx = ctxFor('jornada', { s: PORTAL_SEASON, g: 'PG2', r: 'Jornada 30' });
  assert.equal(s(screen.render(ctx)), s(screen.render(ctx)), 'mismo ctx, mismo HTML');
  assert.equal(screen.id, 'jornada');
  assert.equal(typeof screen.mount, 'function');
});

test('CSS: acción y flechas de 44 px o más, y los días en dos columnas solo desde 1024 px', () => {
  const rules = cssRules();
  const body = (selector, media = null) => rules.filter(r => r.media === media && r.selector === selector).map(r => r.body).join(';');
  assert.match(body('.screen-action'), /min-height:\s*44px/);
  assert.match(body('.round-step'), /min-height:\s*56px/);
  assert.match(body('.screen-head'), /border-bottom:\s*2px solid var\(--ink\)/);
  const days = rules.filter(r => r.selector === '.days');
  assert.equal(days.length, 1);
  assert.match(days[0].media, /min-width:\s*1024px/);
  assert.match(days[0].body, /grid-template-columns:\s*repeat\(auto-fit, minmax\(400px, 1fr\)\)/);
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd /home/manolo/claude/futbol-base
node --test scripts/tests/test_rediseno_jornada.mjs 2>&1 | grep -E 'ERR_MODULE_NOT_FOUND\]|^# (tests|pass|fail)'
```
Esperado:
```text
# Error [ERR_MODULE_NOT_FOUND]: Cannot find module '/home/manolo/claude/futbol-base/src/screen-jornada.js' imported from /home/manolo/claude/futbol-base/scripts/tests/test_rediseno_jornada.mjs
# tests 1
# pass 0
# fail 1
```
Si falla por otra cosa (una fixture, `resolveMyTeam`, `buildCups` o `shell.js`), falta alguna tarea anterior.

- [ ] **Step 3: Write minimal implementation**

Crear `src/screen-jornada.js`:

```js
// Pantalla Jornada (spec §4.3 y §4.8; maqueta 5-1). render(ctx) es pura: «‹ Jornada N de M ›»
// con sus fechas, los partidos por día con el propio primero y resaltado, el aviso de la
// jornada, la botonera y «Otro grupo». mount() añade compartir y el .ics del grupo.
import { html } from './html.js';
import { screenHead, matchRow, notice, empty } from './ui.js';
import { errorBox } from './shell.js';
import { defaultRound, findRound, roundNotice, retiredTeams, matchState, seasonLabel } from './model.js';
// Los días y los meses, escritos en links.js (Tarea 7): sin los datos de idioma del motor.
import { MONTHS, WEEKDAYS, routeHref, downloadCalendar, shareLink } from './links.js';
import { seasonNeeds } from './state.js';
import { myTeamIn } from './myteam.js';

function dayParts(iso) {
  const [y, m, d] = iso.split('-').map(Number);
  return { y, d, month: MONTHS[m - 1], weekday: WEEKDAYS[new Date(Date.UTC(y, m - 1, d)).getUTCDay()] };
}

// Cabecera de un día: «Martes 2 de junio»; sin fecha, «Sin fecha».
export function dayLabel(iso) {
  if (!iso) return 'Sin fecha';
  const { d, month, weekday } = dayParts(iso);
  return `${weekday[0].toUpperCase()}${weekday.slice(1)} ${d} de ${month}`;
}

// Intervalo de la jornada: «del 2 al 6 de junio», «del 30 de mayo al 2 de junio», con el año
// solo si cambia; un solo día, «sábado 6 de junio».
export function dateRange(from, to) {
  if (!from) return 'sin fecha publicada';
  const a = dayParts(from), b = dayParts(to || from);
  if (!to || from === to) return `${a.weekday} ${a.d} de ${a.month}`;
  if (a.y !== b.y) return `del ${a.d} de ${a.month} de ${a.y} al ${b.d} de ${b.month} de ${b.y}`;
  if (a.month !== b.month) return `del ${a.d} de ${a.month} al ${b.d} de ${b.month}`;
  return `del ${a.d} al ${b.d} de ${b.month}`;
}

// «A», «A y B», «A, B y C» (o con «o»).
const listEs = (items, conj) => (items.length < 2 ? items.join('')
  : `${items.slice(0, -1).join(', ')} ${conj} ${items[items.length - 1]}`);

// La ronda de `r` (findRound, de la Tarea 6: Round.key y, si no existe, por número, para un enlace
// escrito a mano con «r=30»; la misma regla que el router), o la de defaultRound (decisión 1 de B1:
// por fecha). null si el grupo no tiene rondas.
function pickRound(group, r, today) {
  return findRound(group, r) || defaultRound(group, today);
}

// «Jornada N de M»; M es la mayor jornada del grupo, aunque falte alguna en la fuente.
function roundTitle(group, round) {
  if (round.n === null) return round.label;
  return `Jornada ${round.n} de ${Math.max(group.rounds.length, ...group.rounds.map(x => x.n ?? 0))}`;
}

const againstRetired = retired => m => retired.has(m.home) || retired.has(m.away);

// Días de la jornada, sin los partidos contra retirados (nunca se jugarán; el aviso los
// explica). El día del partido propio va primero y, dentro, el propio en cabeza; los demás, por
// fecha; «Sin fecha», al final. En cada día, por hora y en el orden de la fuente.
function roundDays(group, round, mine) {
  const vsRetired = againstRetired(retiredTeams(group));
  const isMine = m => mine !== null && (m.home === mine || m.away === mine);
  const byDay = new Map();
  round.matches.filter(m => !vsRetired(m)).forEach((m, i) => {
    const key = m.dateISO || '';
    if (!byDay.has(key)) byDay.set(key, []);
    byDay.get(key).push({ m, i });
  });
  const days = [...byDay].map(([date, items]) => ({
    date: date || null,
    mine: items.some(({ m }) => isMine(m)),
    matches: items.sort((a, b) => isMine(b.m) - isMine(a.m)
      || (a.m.time || '99:99').localeCompare(b.m.time || '99:99') || a.i - b.i).map(({ m }) => m),
  }));
  return days.sort((a, b) => b.mine - a.mine || (a.date === null) - (b.date === null)
    || (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
}

// Aviso de la jornada con los textos de §4.3, o null.
function noticeText(n) {
  if (!n) return null;
  if (n.kind === 'faltan') {
    const one = n.missing === 1;
    return { term: `Falta${one ? '' : 'n'} ${n.missing} partido${one ? '' : 's'}`, text: 'de esta jornada en la fuente' };
  }
  const why = n.retired.length ? ` (descansa o le tocaba contra ${listEs(n.retired, 'o')})` : '';
  return { term: 'Sin partido en esta jornada:', text: `${listEs(n.teams, 'y')}${why}` };
}

// Partidos futuros del grupo para el .ics de «Calendario del grupo» (§4.3): los `pendiente`, sin
// los de retirados, en la forma de buildCalendar (links.js).
export function groupCalendar(group, today) {
  const vsRetired = againstRetired(retiredTeams(group));
  return (group.rounds || []).flatMap(round => round.matches
    .filter(m => !vsRetired(m) && matchState(m, today) === 'pendiente')
    .map(m => ({ date: m.dateISO, time: m.time || '', home: m.home, away: m.away, venue: m.venue || '', jornada: round.label })));
}

const otherGroup = (s, group) => ({
  href: routeHref('ligas', { s, c: group && group.cat, i: group && group.island, to: 'jornada' }),
  label: 'Otro grupo',
});

function render(ctx) {
  const { params, model, today } = ctx;
  const shields = (ctx.datasets && ctx.datasets.shields) || {};
  const s = params.s || ctx.portal.season;
  // Sin la temporada (needs no la trajo): la caja de error, nunca otra temporada (§7).
  if (!model.season(s)) {
    return html`<section data-screen="jornada">${screenHead('Jornada', { action: otherGroup(s) })}${errorBox(`la temporada ${seasonLabel(s)}`)}</section>`;
  }
  const group = model.group(s, params.g);
  if (!group) {
    const why = params.g ? `No hay ningún grupo ${params.g} en la temporada ${seasonLabel(s)}.` : 'Elige un grupo en «Otro grupo».';
    return html`<section data-screen="jornada">${screenHead('Jornada', { action: otherGroup(s) })}${empty(why)}</section>`;
  }
  const sub = s === ctx.portal.season ? group.label : `${group.label} · ${seasonLabel(s)}`;
  const head = screenHead('Jornada', { sub, action: otherGroup(s, group) });
  const round = pickRound(group, params.r, today);
  if (!round) {
    return html`<section data-screen="jornada">${head}${empty('La fuente todavía no ha publicado el calendario de este grupo.')}</section>`;
  }
  const mine = myTeamIn(group, ctx.myTeam, ctx.resolution);
  const at = group.rounds.indexOf(round);
  const roundHref = target => routeHref('jornada', { s, g: group.id, r: target.key });
  // «‹ ›» con id estable: al cambiar de jornada (replaceState), el router devuelve el foco al control
  // pulsado, no al h1 (B11 de la revisión). En un extremo, el apagado conserva el id y el foco.
  const step = (target, glyph, label, id) => (target
    ? html`<a class="round-step" id="${id}" href="${roundHref(target)}" aria-label="${label}: ${target.label}">${glyph}</a>`
    : html`<span class="round-step is-off" id="${id}" role="link" aria-disabled="true" tabindex="-1" aria-label="${label}: no hay">${glyph}</span>`);
  const days = roundDays(group, round, mine);
  const dates = days.map(day => day.date).filter(Boolean).sort();
  const nav = html`<nav class="round-nav" aria-label="Jornadas">${step(group.rounds[at - 1], '‹', 'Jornada anterior', 'round-prev')}<div class="round-now"><h2 class="round-title">${roundTitle(group, round)}</h2><p class="round-dates">${dateRange(dates[0], dates[dates.length - 1])}</p></div>${step(group.rounds[at + 1], '›', 'Jornada siguiente', 'round-next')}</nav>`;
  const isMine = m => mine !== null && (m.home === mine || m.away === mine);
  const matchHref = m => routeHref('partido', { s, g: group.id, r: round.key, h: m.home, a: m.away });
  const list = days.length
    ? html`<div class="days">${days.map(day => html`<section class="day"><h3 class="day-title">${dayLabel(day.date)}</h3><div class="box">${day.matches.map(m => matchRow(m, { mine: isMine(m), today, shields, href: matchHref(m) }))}</div></section>`)}</div>`
    : empty('La fuente no trae partidos de esta jornada.');
  const warn = noticeText(roundNotice(group, round));
  const calendar = groupCalendar(group, today).length > 0
    ? html`<button class="button" type="button" data-action="group-calendar">Calendario del grupo</button>` : '';
  const actions = html`<div class="box round-actions"><div class="buttons" aria-live="polite"><button class="button" type="button" data-action="share-round">Compartir jornada</button>${calendar}</div></div>`;
  return html`<section data-screen="jornada">${head}${nav}${list}${warn ? notice(warn.term, warn.text) : ''}${actions}</section>`;
}

// Cambia un momento el texto del botón («Enlace copiado»); la botonera es aria-live.
function flash(button, text) {
  if (!button.dataset.label) button.dataset.label = button.textContent;
  button.textContent = text;
  setTimeout(() => { button.textContent = button.dataset.label; }, 2500);
}

// shareLink (links.js): navigator.share y, si no hay o falla, copiar el enlace (§4.2 A). La
// botonera dice en el propio botón si se copió.
async function share(button, data) {
  const outcome = await shareLink(data);
  if (outcome === 'copiado') flash(button, 'Enlace copiado');
  else if (outcome === 'no copiado') flash(button, 'No se pudo copiar el enlace');
}

function mount(root, ctx) {
  const el = root.querySelector('[data-screen="jornada"]') || root;
  const group = ctx.model.group(ctx.params.s || ctx.portal.season, ctx.params.g);
  const round = group && pickRound(group, ctx.params.r, ctx.today);
  if (!round) return;
  const link = params => new URL(routeHref('jornada', params), location.href).href;
  el.addEventListener('click', (event) => {
    const button = event.target.closest('button[data-action]');
    if (!button) return;
    if (button.dataset.action === 'share-round') {
      share(button, { title: `${round.label} · ${group.label}`, url: link({ s: group.season, g: group.id, r: round.key }) });
    } else if (button.dataset.action === 'group-calendar') {
      downloadCalendar(groupCalendar(group, ctx.today), {
        season: group.season, group: group.id, name: group.label, url: link({ s: group.season, g: group.id }),
      });
    }
  });
}

export const screen = {
  id: 'jornada',
  needs: (params, datasets, { portalSeason } = {}) => seasonNeeds(params.s, datasets, portalSeason),
  render,
  mount,
};
```

La temporada del portal llega del router, que la toma del contexto: `seasonNeeds` no tiene valor por defecto y no lee `config.js` (R2-1 de la segunda ronda de la revisión).

Añadir al final de `src/state.js`:

```js
/* `needs` de las pantallas que leen una temporada (spec §5.4): [] si es la del portal o ya
 * está en datasets.seasonRaw; si no, una promesa que la guarda allí, o que rechaza con
 * Error(<qué>) para la caja «No se pudieron cargar los datos de <qué>» del router. La temporada del
 * portal la da el router (needs(params, datasets, { portalSeason })), nunca config.js (R2-1). */
export function seasonNeeds(name, datasets, portalSeason) {
  if (!portalSeason) throw new TypeError('seasonNeeds: falta la temporada del portal');
  if (!name || name === portalSeason || datasets.seasonRaw[name]) return [];
  return [ensureSeasonData(name).then((raw) => {
    if (!raw) throw new Error(`la temporada ${String(name).replace(/^(\d{4})-\d{2}(\d{2})$/, '$1/$2')}`);
    datasets.seasonRaw[name] = raw;
  })];
}
```

Añadir al final de `src/myteam.js`:

```js
/* Nombre de mi equipo en `group` para el resalte propio (spec §3.3), o null. En el grupo
 * resuelto, el de la resolución. En otro grupo de la misma temporada y la misma fase, nunca: el
 * mismo nombre es otro equipo (Santa Brígida en B1 y B2; decisión 17 de B1). En los demás (otra
 * fase u otra temporada), el nombre tal cual si el grupo es de su categoría y lo trae, como el
 * grupo por defecto de §4.1. Un equipo del mismo nombre en la otra categoría nunca se resalta. */
export function myTeamIn(group, myTeam, resolution) {
  if (!group) return null;
  const ok = resolution && resolution.status === 'ok' && resolution.group ? resolution : null;
  if (ok && ok.group.season === group.season) {
    if (ok.group.id === group.id) return ok.name;
    if (ok.group.compKey === group.compKey) return null;
  }
  const name = ok ? ok.name : myTeam && myTeam.name;
  const cat = ok ? ok.cat : myTeam && myTeam.cat;
  if (!name || cat !== group.cat) return null;
  const listed = (group.standings || []).some(row => row.team === name)
    || (group.rounds || []).some(round => round.matches.some(m => m.home === name || m.away === name));
  return listed ? name : null;
}
```

Añadir al final de `acta.css`:

```css
/* ── Jornada: navegación, días y botonera (spec §4.3) ─────────────────── */

.round-nav {
  display: grid;
  grid-template-columns: 52px minmax(0, 1fr) 52px;
  margin-top: 14px;
  border: 1.5px solid var(--ink);
}
.round-step {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 56px;
  font-size: 24px;
  font-weight: 700;
  color: var(--ink);
  text-decoration: none;
}
.round-step.is-off { color: var(--rule); }
.round-now {
  min-width: 0;
  padding: 8px 6px;
  border-right: 1px solid var(--rule);
  border-left: 1px solid var(--rule);
  text-align: center;
}
.round-title { font-size: 17px; font-weight: 800; line-height: 1.3; }
.round-dates { font-size: 12.5px; font-weight: 600; color: var(--mute); }
.day { min-width: 0; }
.day-title { margin: 16px 0 6px; font-size: 13.5px; font-weight: 700; color: var(--mute); }
.round-actions { margin-top: 16px; }

/* Escritorio: los días en dos columnas si caben (spec §4.8); uno solo ocupa todo el ancho. */
@media (min-width: 1024px) {
  .days {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(400px, 1fr));
    column-gap: 24px;
    align-items: start;
  }
}
```

La pantalla entra en el router en la Tarea 12, con Tabla y Partido.

- [ ] **Step 4: Run test to verify it passes**

```bash
cd /home/manolo/claude/futbol-base
node --test scripts/tests/test_rediseno_jornada.mjs 2>&1 | grep -E '^# (tests|pass|fail)'
```
Esperado:
```text
# tests 16
# pass 16
# fail 0
```

- [ ] **Step 5: Verificación visual (Chrome, fuera del repo)**

La vista previa pinta la pantalla con su `render(ctx)` en Node, con `acta.css` y las fixtures: la jornada 30 de PG2 terminada (390 px en claro y en oscuro, y 1440 px), la misma el 3 de junio (con marcadores pendientes y las dos acciones) y la jornada 1 de PFV2. Carga el módulo en la página y llama a `mount`, así que también prueba *Calendario del grupo* (descarga el `.ics` y cuenta sus partidos) y *Compartir jornada* (sin `navigator.share`, copia el enlace). Mide el desplazamiento horizontal, la altura de lo pulsable, las imágenes rotas y si la barra tapa el final. Sirve la página desde memoria y responde `/escudos/s/<x>.png` con el original, como la de B1. La Tabla se añade sola cuando exista `src/screen-tabla.js` (Tarea 10).

```bash
cd /home/manolo/claude/futbol-base
S=/tmp/claude-1000/-home-manolo/db6fd8e0-f1e7-4e94-b6cd-ef7dd5bf6ae9/scratchpad/planB2
mkdir -p "$S"
cat > "$S/jt-preview.mjs" <<'EOF'
// Vista previa de las Tareas 9 y 10 de B2: Jornada y Tabla pintadas con su render(ctx) en Node,
// acta.css y las fixtures congeladas (más los goleadores reales de PG2, que las pruebas no leen).
// Uso, desde la raíz del repo (con Playwright en node_modules, Tarea 4): OUT=<dir> node <este fichero>
// No escribe en el repo: la página se sirve desde memoria, y /escudos/s/<x>.png se responde con el
// original escudos/<x>.png|.jpg (simula las miniaturas de B4).
import { createServer } from 'node:http';
import { createRequire } from 'node:module';
import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import { extname, join, normalize, sep } from 'node:path';
import { pathToFileURL } from 'node:url';

const out = process.env.OUT;
if (!out) { console.error('Falta OUT=<directorio de capturas>'); process.exit(2); }
mkdirSync(out, { recursive: true });
const root = process.cwd();
const load = (path) => import(pathToFileURL(join(root, path)).href);
const { screen: jornada } = await load('src/screen-jornada.js');
// La Tabla llega en la Tarea 10: hasta entonces, la vista previa solo pinta la Jornada.
const tabla = existsSync(join(root, 'src/screen-tabla.js')) ? (await load('src/screen-tabla.js')).screen : null;
const { tabbar } = await load('src/ui.js');
const { ctxFor, datasetsFor, pastSeasonRaw } = await load('scripts/tests/fixtures/rediseno/screens.mjs');
const { currentAt } = await load('scripts/tests/fixtures/rediseno/simulate.mjs');
const { fixture } = await load('scripts/tests/fixtures/rediseno/load.mjs');
const { findChrome } = await load('scripts/tests/render-smoke.mjs');
const { chromium } = createRequire(join(root, 'scripts/tests/x.mjs'))('playwright');

const golPrebenj = JSON.parse(readFileSync(join(root, 'data-goleadores.js'), 'utf8').match(/^const GOL_PREBENJ=(.*);$/m)[1]);
// La temporada actual tal como estaba `today` (antes del 7 de junio) o terminada.
const rawAt = (today) => (today < '2026-06-07' ? currentAt(today) : fixture('current-2025-2026'));

function page(id, params, today) {
  const datasets = datasetsFor({ current: rawAt(today), golPrebenj, seasonRaw: { '2024-2025': pastSeasonRaw() } });
  const body = (id === 'jornada' ? jornada : tabla).render(ctxFor(id, { s: '2025-2026', ...params }, { today, datasets }));
  return `<!DOCTYPE html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Vista previa ${id}</title><link rel="stylesheet" href="/acta.css">
<script>window.__failed = []; document.addEventListener('error', (e) => { if (e.target.tagName === 'IMG') window.__failed.push(e.target); }, true);</script>
</head><body><a class="skip-link" href="#contenido">Saltar al contenido</a>${tabbar(id)}<main id="contenido" class="page">${body}</main>
<script type="module">
import { crestFallback } from '/src/ui.js';
import { buildSeason } from '/src/model.js';
import { screen } from '/src/screen-${id}.js';
window.__failed.forEach((img) => crestFallback(img));
document.addEventListener('error', (e) => crestFallback(e.target), true);
if (screen.mount) {
  const raw = await (await fetch('/__raw.json?today=${today}')).json();
  const season = buildSeason({ name: '2025-2026', current: true, ...raw });
  const model = { group: (s, g) => season.groups.find((x) => x.id === g) || null };
  screen.mount(document.querySelector('main'), { params: ${JSON.stringify({ s: '2025-2026', ...params })}, today: '${today}', model });
}
window.__mounted = true;
</script></body></html>`;
}

const MIME = { '.css': 'text/css', '.js': 'text/javascript', '.png': 'image/png', '.jpg': 'image/jpeg', '.woff2': 'font/woff2', '.json': 'application/json' };
const server = createServer((req, res) => {
  const url = new URL(req.url, 'http://x');
  if (url.pathname === '/__page') {
    const q = Object.fromEntries(url.searchParams);
    const { screen: id, today, ...params } = q;
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    return res.end(page(id, params, today));
  }
  if (url.pathname === '/__raw.json') {
    const { benjamin, prebenjamin, history } = rawAt(url.searchParams.get('today'));
    res.setHeader('Content-Type', 'application/json');
    return res.end(JSON.stringify({ benjamin, prebenjamin, history }));
  }
  let fp = normalize(join(root, decodeURIComponent(url.pathname)));
  const thumb = url.pathname.match(/^\/escudos\/s\/(.+)\.png$/);
  if (thumb) fp = ['png', 'jpg'].map((x) => join(root, 'escudos', `${decodeURIComponent(thumb[1])}.${x}`)).find(existsSync) || fp;
  if (!fp.startsWith(root + sep) || !existsSync(fp)) { res.statusCode = 404; return res.end('no'); }
  res.setHeader('Content-Type', MIME[extname(fp)] || 'application/octet-stream');
  res.end(readFileSync(fp));
}).listen(0, '127.0.0.1');
await new Promise((resolve) => server.once('listening', resolve));
const base = `http://127.0.0.1:${server.address().port}/__page`;
const href = (q) => `${base}?${new URLSearchParams(q)}`;

const browser = await chromium.launch({ executablePath: findChrome() });
const problems = [];
const PULSABLE = '.tab, .segment, .button, a.match-row, .st-link, a.round-step, .screen-action, .block-link, .source-link';

async function open(name, q, w, scheme) {
  const ctx = await browser.newContext({ viewport: { width: w, height: w > 1000 ? 900 : 844 }, colorScheme: scheme, reducedMotion: 'reduce', acceptDownloads: true });
  await ctx.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: new URL(base).origin });
  const p = await ctx.newPage();
  p.on('pageerror', (e) => problems.push(`${name}: ${e.message}`));
  await p.goto(href(q), { waitUntil: 'networkidle' });
  await p.waitForFunction(() => window.__mounted === true);
  const m = await p.evaluate((sel) => {
    const bar = document.querySelector('.tabbar');
    window.scrollTo(0, document.documentElement.scrollHeight);
    const last = document.querySelector('main').lastElementChild.lastElementChild.getBoundingClientRect();
    const covered = getComputedStyle(bar).position === 'fixed' && last.bottom > bar.getBoundingClientRect().top + 0.5;
    window.scrollTo(0, 0);
    const visible = (e) => e.getClientRects().length > 0;
    return {
      overflow: document.documentElement.scrollWidth - innerWidth,
      small: [...document.querySelectorAll(sel)].filter(visible)
        .map((e) => [e.className, Math.round(e.getBoundingClientRect().height)]).filter(([, px]) => px < 44),
      broken: [...document.images].filter((i) => i.complete && !i.naturalWidth).map((i) => i.getAttribute('src')),
      covered,
      heads: [...document.querySelectorAll('table.standings:not(.group-scorers) thead th')].filter(visible).map((th) => th.textContent),
      views: [...document.querySelectorAll('.tabla-views')].filter(visible).map((n) => [...n.querySelectorAll('.segment')].map((a) => (a.hasAttribute('aria-current') ? `[${a.textContent}]` : a.textContent)).join(' ')),
      days: [...document.querySelectorAll('.day')].map((d) => Math.round(d.getBoundingClientRect().left)),
    };
  }, PULSABLE);
  console.log(`${name}:`, JSON.stringify(m));
  if (m.overflow > 0) problems.push(`${name}: desplazamiento horizontal de ${m.overflow}px`);
  if (m.small.length) problems.push(`${name}: pulsables de menos de 44px: ${JSON.stringify(m.small)}`);
  if (m.broken.length) problems.push(`${name}: imágenes rotas: ${m.broken.join(', ')}`);
  if (m.covered) problems.push(`${name}: la barra tapa el final del contenido`);
  await p.screenshot({ path: `${out}/${name}.png`, fullPage: true });
  return { ctx, p, m };
}

const J30 = { screen: 'jornada', g: 'PG2', r: 'Jornada 30', today: '2026-09-24' };
const expect = (cond, msg) => { if (!cond) problems.push(msg); };
for (const [w, scheme] of [[390, 'light'], [390, 'dark'], [1440, 'light']]) {
  const { ctx, m } = await open(`jt-jornada-${w}-${scheme}`, J30, w, scheme);
  if (w === 1440) expect(new Set(m.days).size === 2, 'Jornada a 1440 px: los dos días no van en dos columnas');
  else expect(new Set(m.days).size === 1, `Jornada a ${w} px: los días no van en una columna`);
  await ctx.close();
}
// Jornada a mitad de semana (3 de junio): marcadores pendientes y las dos acciones.
{
  const { ctx, p } = await open('jt-jornada-390-light-3jun', { ...J30, today: '2026-06-03' }, 390, 'light');
  const [download] = await Promise.all([p.waitForEvent('download'), p.click('button[data-action="group-calendar"]')]);
  const ics = readFileSync(await download.path(), 'utf8');
  const events = (ics.match(/BEGIN:VEVENT/g) || []).length;
  console.log('calendario del grupo:', JSON.stringify({ file: download.suggestedFilename(), events, teguinte: ics.includes('Teguinte') }));
  expect(events === 5, `el .ics del grupo trae ${events} partidos y no 5`);
  await p.click('button[data-action="share-round"]');
  const copied = await p.evaluate(() => navigator.clipboard.readText());
  const label = await p.textContent('button[data-action="share-round"]');
  console.log('compartir jornada:', JSON.stringify({ copied: copied.replace(/^http:\/\/[^/]+/, ''), label }));
  expect(/#\/jornada\?s=2025-2026&g=PG2&r=Jornada%2030$/.test(copied) && label === 'Enlace copiado', 'Compartir jornada no copia el enlace');
  await ctx.close();
}
{
  const { ctx } = await open('jt-jornada-390-light-pfv2', { screen: 'jornada', g: 'PFV2', r: '1', today: '2026-09-24' }, 390, 'light');
  await ctx.close();
}
const TABLA = { screen: 'tabla', g: 'PG2', today: '2026-09-24' };
if (!tabla) console.log('Tabla: todavía no hay src/screen-tabla.js (Tarea 10)');
const HEADS = {
  puntos: '#,Equipo,J,G,E,P,DG,Pts', goles: '#,Equipo,GF,GC,DG,Pts', forma: '#,Equipo,J,Últimos 5,Pts',
  casa: '#,Equipo,J,G,E,P,Pts', todas: '#,Equipo,J,G,E,P,GF,GC,DG,Últimos 5,Pts',
};
for (const [w, scheme, v] of tabla ? [[390, 'light', 'forma'], [390, 'dark', 'forma'], [1440, 'light', ''], [390, 'light', 'casa'], [320, 'light', ''], [390, 'light', 'goles']] : []) {
  const { ctx, m } = await open(`jt-tabla-${w}-${scheme}-${v || 'defecto'}`, { ...TABLA, ...(v ? { v } : {}) }, w, scheme);
  const want = w >= 1024 ? HEADS[v === 'casa' || v === 'fuera' ? 'casa' : 'todas'] : HEADS[v || 'puntos'];
  expect(m.heads.join(',') === want, `Tabla ${w}px ${v}: columnas ${m.heads.join(',')} en lugar de ${want}`);
  expect(m.views.length === 1 && m.views[0].split(' ').length === (w >= 1024 ? 3 : 5), `Tabla ${w}px: selector ${JSON.stringify(m.views)}`);
  await ctx.close();
}
await browser.close();
server.close();
console.log(problems.length ? 'PROBLEMAS:\n' + problems.join('\n') : `OK: sin errores; capturas en ${out}/jt-*.png`);
process.exit(problems.length ? 1 : 0);
EOF
OUT="$S/shots-t9" node "$S/jt-preview.mjs"
```
Esperado:
```text
jt-jornada-390-light: {"overflow":0,"small":[],"broken":[],"covered":false,"heads":[],"views":[],"days":[14,14]}
jt-jornada-390-dark: {"overflow":0,"small":[],"broken":[],"covered":false,"heads":[],"views":[],"days":[14,14]}
jt-jornada-1440-light: {"overflow":0,"small":[],"broken":[],"covered":false,"heads":[],"views":[],"days":[174,732]}
jt-jornada-390-light-3jun: {"overflow":0,"small":[],"broken":[],"covered":false,"heads":[],"views":[],"days":[14,14]}
calendario del grupo: {"file":"calendario-prebenjam-n-grupo-2-de-gran-canaria.ics","events":5,"teguinte":false}
compartir jornada: {"copied":"/__page?screen=jornada&g=PG2&r=Jornada+30&today=2026-06-03#/jornada?s=2025-2026&g=PG2&r=Jornada%2030","label":"Enlace copiado"}
jt-jornada-390-light-pfv2: {"overflow":0,"small":[],"broken":[],"covered":false,"heads":[],"views":[],"days":[14]}
Tabla: todavía no hay src/screen-tabla.js (Tarea 10)
OK: sin errores; capturas en /tmp/claude-1000/-home-manolo/db6fd8e0-f1e7-4e94-b6cd-ef7dd5bf6ae9/scratchpad/planB2/shots-t9/jt-*.png
```
El enlace copiado lleva la ruta de la vista previa (`/__page?…`) delante del `#`: en la app es la de la página, y detrás va siempre `#/jornada?s&g&r`.

Abrir con Read `jt-jornada-390-light.png`, `jt-jornada-390-dark.png`, `jt-jornada-1440-light.png`, `jt-jornada-390-light-3jun.png` y `jt-jornada-390-light-pfv2.png`, y comparar con `5-1-jornada.png`:
- **Cabecera:** «Jornada», «Prebenjamín, Grupo 2 de Gran Canaria» y «Otro grupo» en tinta a la derecha, con la regla roja de 2 px debajo, de lado a lado en móvil.
- **Navegación:** «‹ | Jornada 30 de 30 / del 2 al 6 de junio | ›», con la › apagada en la última jornada.
- **Días:** «Martes 2 de junio» primero, con «17:30 Las Mesas Hu. [2–7] AD Huracán» con fondo rosado (granate en oscuro), texto en tinta y barra de 3 px a la izquierda. **Sin óvalo.** Después, «Sábado 6 de junio» con los cinco partidos de las 09:00.
- **Aviso:** «**Sin partido en esta jornada:** RC Victoria y Arucas B (descansa o le tocaba contra CD Batán)». No el «Sin datos en la fuente» de la maqueta.
- **Botonera:** con la temporada terminada, solo *Compartir jornada*. El 3 de junio, *Compartir jornada* y *Calendario del grupo*, y marcadores «–» en los partidos del sábado.
- **PFV2:** tres partidos, ninguno de CD Teguinte, y el aviso con ATISACHI y «descansa o le tocaba contra CD Teguinte».
- **1440 px:** los dos días en dos columnas, y las pestañas arriba con Jornada activa.
- En las capturas de página completa, la barra fija aparece donde terminaba la ventana: es un efecto de `fullPage`, no un fallo.

- [ ] **Step 6: Suites completas y los tres smoke**

```bash
cd /home/manolo/claude/futbol-base
python3 -m pytest scripts/tests/ -q 2>&1 | tail -1
node --test scripts/tests/test_*.mjs 2>&1 | grep -E '^# (tests|pass|fail)'
```
Esperado:
- pytest: el mismo recuento que al terminar la tarea anterior, sin `failed` (esta tarea no añade pruebas de Python).
- node: el recuento anterior más 16, sin fallos (`# fail 0`). `screens.mjs` no empieza por `test_`, así que el glob no lo ejecuta. `test_rediseno_modulos.mjs` (Tarea 4) ya cubre los módulos nuevos: no tocan el DOM al importarse y sus imports son planos y estáticos.

Los tres smoke no cambian: la pantalla todavía no está en el router (Tarea 12).

```bash
cd /home/manolo/claude/futbol-base
node scripts/tests/render-smoke.mjs
node scripts/tests/interaction-smoke.mjs
node scripts/tests/pwa-smoke.mjs 2>&1 | grep -v '^PWA fixture HTTP 404 /escudos/s/'
```
Esperado, con el tamaño del DOM del día:
```text
PASS: render smoke OK — Mi equipo en estado D (DOM 12141 bytes)
PASS: la portada carga a 320px en claro, sin desplazamiento horizontal
PASS: la portada carga a 320px en oscuro, sin desplazamiento horizontal
PASS: la portada carga a 390px en claro, sin desplazamiento horizontal
PASS: la portada carga a 390px en oscuro, sin desplazamiento horizontal
PASS: la portada carga a 768px en claro, sin desplazamiento horizontal
PASS: la portada carga a 768px en oscuro, sin desplazamiento horizontal
PASS: la portada carga a 1440px en claro, sin desplazamiento horizontal
PASS: la portada carga a 1440px en oscuro, sin desplazamiento horizontal
PASS: de la app anterior (su SW real) al rediseño, con datos congelados: la 1.ª apertura es la anterior; sin conexión a medias, el aviso con «Reintentar»; la 2.ª y la 3.ª, la nueva con acta.css y sin mezclar módulos; futbolbase-v20991231a funciona sin conexión
```

- [ ] **Step 7: Commit**

```bash
cd /home/manolo/claude/futbol-base
git add src/screen-jornada.js src/state.js src/myteam.js acta.css scripts/tests/fixtures/rediseno/screens.mjs scripts/tests/test_rediseno_jornada.mjs
git commit -F - <<'EOF'
feat(rediseño): pantalla Jornada (B2, tarea 9)

- «‹ Jornada N de M ›» con el intervalo de fechas; anterior y siguiente
  son enlaces con r = Round.key, que el router lleva con replaceState.
- Jornada por defecto con defaultRound (por fecha, decisión 1 de B1); una
  r que no existe cae en la del mismo número o en la de defecto.
- Partidos por día, sin los que son contra retirados; el día del partido
  propio va primero, con el propio en cabeza y resaltado. Cada fila abre
  la ficha del partido.
- Aviso de roundNotice con los textos de §4.3.
- Compartir jornada (share o copiar el enlace) y Calendario del grupo
  (.ics de los partidos futuros, sin retirados; oculto si no hay).
- «Otro grupo» → #/ligas?s&c&i&to=jornada; en escritorio, los días en dos
  columnas si caben.
- Nuevas: seasonNeeds (state.js) y myTeamIn (myteam.js); usa
  screenHead (ui.js), seasonLabel (model.js) y shareLink (links.js).
  screens.mjs construye el ctx de las pantallas desde las fixtures, con
  createModel, para las pruebas. Entra en el router en la tarea 12.

Pruebas con las fixtures: PG2 jornada 30 con el aviso del caso 5 de §11,
PG3 sin «faltan» en ninguna jornada, PFV2 sin CD Teguinte en la lista ni
en el .ics, faltan en singular y plural, P1 2024-25 y grupos inexistentes
o sin calendario.

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01Sg56KK3oZgo8Ye7Snj6wG9
EOF
git show --stat --oneline HEAD | tail -1
```
Esperado: `6 files changed`. Son nuevos `src/screen-jornada.js`, `screens.mjs` y la prueba; están modificados `state.js`, `myteam.js` y `acta.css`.

---

### Task 10: `screen-tabla.js`: la pantalla Tabla (spec §4.4 y §4.8; maqueta 5-2)

La pantalla Tabla del rediseño: vistas, fila propia, forma, casa y fuera con su cobertura, goleadores del grupo, procedencia y «Otro grupo».

**Contexto**
- **Vistas** (§4.4 y decisión 15 de B1). `render` es pura y no sabe el ancho de la ventana, así que pinta los dos selectores y el CSS deja uno:
  - por debajo de 1024 px, Puntos, Goles, Forma, Casa y Fuera;
  - desde 1024 px, Todas, Casa y Fuera.

  Sin `v`, o con una desconocida, la vista es Puntos en móvil y Todas en escritorio, y los enlaces de esas dos van sin `v`. `v=todas` en un móvil es Puntos, y `v=forma` en escritorio es Todas. Cambiar de vista solo cambia `v`: el router lo lleva con `replaceState`.
- **Una sola tabla** para Puntos, Goles, Forma y Todas.
  - Es `standingsTable(rows, { view: 'todas' })`, con `row.form = lastResults(team, group).map(x => x.letter)` («Para B2» de B1), dentro de `.tabla-<vista>`.
  - Por debajo de 1024 px, el CSS esconde las columnas que no son de la vista. #, Equipo y Pts se ven siempre.
  - Para eso, J, G, E y P ganan su propia clase en `ui.js` (`st-pj`, `st-g`, `st-e` y `st-p`, además de `st-num`).
  - En escritorio se ven todas, con las cifras más anchas que en móvil.
- **Forma:** los cinco últimos de `lastResults`, y «retirado» para CD Batán (lo pinta `standingsTable`).
- **Casa y Fuera:** `homeAwayTable(group, side)`, con el contexto «desde el calendario» y la cobertura de §7 para todo el grupo (`homeAwayCoverage`). Compara los partidos con resultado del calendario con los que cuenta la clasificación oficial (la suma de J entre dos):
  - si la diferencia son solo los partidos de los retirados: «No cuenta los 28 partidos contra CD Batán (retirado), que no están en el calendario.» (PG2);
  - si falta algo más: «Con los 101 partidos con resultado del calendario; la clasificación oficial cuenta 210, 28 de ellos contra CD Batán (retirado).»;
  - si cuadra (PFV2), sin nota.
- **Contexto de la clasificación:** «jornada 30, final», con la jornada en curso de la fuente y «final» según `groupFinished`.
- **Goleadores del grupo:** la entrada del grupo en `model.scorers(s, cat)`, que es `GOL_*` en la temporada actual y `[]` en las pasadas.
  - Los 10 primeros, con escudo, nombre (`playerName`), goles y PJ, y el equipo en texto oculto, en una tabla `.standings.group-scorers` (la de la portada es `.scorers`, con otras medidas: no comparten reglas).
  - «ver todos (N)» → `#/goleadores?s&g`, si hay más de 10.
  - Vacíos: «La fuente de este grupo no publica goleadores.» (PFV2), «Todavía no hay goles registrados en este grupo.» y, en temporadas pasadas, «Esta web solo guarda los goleadores de la temporada actual.».
- **Procedencia**, con `sourceInfo(group, historical)` de la Tarea 3, que da `{ kind, source, url }`:
  - «Clasificación oficial de futbolaspalmas.com. Ver fuente»;
  - «calculada» y «corregida», cada una con su advertencia;
  - en temporadas pasadas, además, «Archivo de la temporada 2024/25.».
- **Además:**
  - la fila propia sale de `myTeamIn` (Tarea 9);
  - cada equipo abre `#/equipo?s&g&t`;
  - «Otro grupo» → `#/ligas?s&c&i&to=tabla`;
  - sin clasificación, el vacío «Clasificación sin publicar.» y sin selector;
  - sin la temporada, la caja de error, como en Jornada.
- **Registro:** como Jornada, entra en el router en la Tarea 12.

**Files:**
- Create: `src/screen-tabla.js`
- Modify: `src/ui.js` (clases de J, G, E y P), `scripts/tests/test_rediseno_ui.mjs` y `scripts/tests/test_rediseno_portada.mjs` (las aserciones que fijaban la clase de J, G, E y P) y `acta.css`
- Test: `scripts/tests/test_rediseno_tabla.mjs`

**Interfaces:**
- Consumes:
  - `html` (`src/html.js`); `standingsTable(rows, { view, mine, shields, hrefFor, caption })`, `segmented(options, active, hrefFor, { idPrefix })` (el `idPrefix`, de esta tarea), `crest(name, { shields })`, `notice(term, text)`, `empty(text)` y `screenHead` (`src/ui.js`);
  - `errorBox(what)` (`src/shell.js`, Tarea 5);
  - `lastResults(team, group, n)`, `homeAwayTable(group, side)`, `groupFinished(group, todayISO, portalSeason)`, `retiredTeams(group)` y `playerName(raw)` (`src/model.js`, B1), y `seasonLabel` (Tarea 4);
  - `sourceInfo(group, historical) → { kind: 'oficial' | 'calculada' | 'corregida', source, url }` (Tarea 3);
  - `model.scorers(season, cat)` (Tarea 3): el `GOL_BENJ` o el `GOL_PREBENJ` de la temporada actual, `[{ id, g, s: [[nombre, equipo, goles, PJ]] }]`, y `[]` en las pasadas;
  - `routeHref(screen, params)` (`src/links.js`), `seasonNeeds` (`src/state.js`) y `myTeamIn` (`src/myteam.js`), estas dos de la Tarea 9;
  - `screens.mjs` (Tarea 9) y las fixtures de B1.
- Produces:
  - `src/screen-tabla.js`:
    - `export const screen = { id: 'tabla', needs(params, datasets, { portalSeason }) → Promise[], render(ctx) → Html }`;
    - `export function homeAwayCoverage(group) → null | { calendar, official, vsRetired, retired: string[], exact }`;
    - `export function groupScorers(gol, groupId) → null | [{ name, team, goals, games }]` (`null` si la fuente no trae el grupo);
  - `src/ui.js`: en `standingsTable`, J, G, E y P llevan `st-num st-pj`, `st-num st-g`, `st-num st-e` y `st-num st-p`.

- [ ] **Step 1: Write the failing test**

Crear `scripts/tests/test_rediseno_tabla.mjs`:

```js
// Plan B2, Tarea 10: pantalla Tabla (spec §4.4, §4.8 y §7; decisiones 3 y 15 de B1). render(ctx)
// es pura: se prueba sobre el HTML que devuelve, con las fixtures congeladas y `today` inyectado.
import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';
import { currentAt } from './fixtures/rediseno/simulate.mjs';
import { fixture } from './fixtures/rediseno/load.mjs';
import { ctxFor, datasetsFor, pastSeasonRaw, cssRules, PORTAL_SEASON } from './fixtures/rediseno/screens.mjs';
import { screen, homeAwayCoverage, groupScorers } from '../../src/screen-tabla.js';
import { lastResults, homeAwayTable, sourceInfo } from '../../src/model.js';
import { standingsTable } from '../../src/ui.js';

// PG2, goleadores: los 12 primeros de GOL_PREBENJ (data-goleadores.js, 23/09/2026), copia literal.
const GOL_PG2 = [{ id: 'PG2', g: 'PREBENJAMIN GC GRUPO 2', s: [
  ['León Rodríguez, Lucas', 'AD Huracán', 50, 20], ['Garcia Santana, Hector', 'Acodetti', 42, 18],
  ['Lozano Martin, Daniel', 'Acodetti', 28, 17], ['Rodriguez Aloma, Antoine', 'AD Huracán', 27, 19],
  ['Cabrera Castells, Hugo', 'Santa Brígida', 24, 19], ['Benitez Ponce, Deremyk', 'La Garita', 24, 21],
  ['Trujillo Ruiz, Victor Omar', 'Unión Viera', 24, 21], ['Perez Lopez, Adriel', 'La Garita', 23, 18],
  ['Figueras Medina, Ilian Alexis', 'AD Huracán', 22, 19], ['Martin Aguiar, Luka', 'RC Victoria', 22, 21],
  ['Vega Hernandez, Juan Ramon', 'Unión Viera', 21, 21], ['Rodriguez Suarez, Airam', 'Veteranos', 20, 20],
] }];

const s = (h) => String(h);
const text = (h) => s(h).replace(/<[^>]*>/g, ' ').replace(/&quot;/g, '"').replace(/&#39;/g, "'")
  .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim();
const opts = (extra = {}) => ({ datasets: datasetsFor({ golPrebenj: GOL_PG2, ...extra }) });
const render = (params, o = opts()) => s(screen.render(ctxFor('tabla', { s: PORTAL_SEASON, ...params }, o)));
const nav = (out, which) => (out.match(new RegExp(`<nav class="tabla-views is-${which}"[^>]*>(.*?)</nav>`)) || [])[1] || '';
const active = (html) => [...html.matchAll(/<a class="segment"[^>]*aria-current="true">([^<]*)<\/a>/g)].map(m => m[1]);
const ids = (html) => [...html.matchAll(/<a class="segment" id="([^"]+)"/g)].map(m => m[1]);
const labels = (html) => [...html.matchAll(/<a class="segment"[^>]*>([^<]*)<\/a>/g)].map(m => m[1]);
const bodyRows = (out) => [...(out.match(/<table class="standings">.*?<tbody>(.*?)<\/tbody>/) || ['', ''])[1]
  .matchAll(/<tr( class="is-mine")?>(.*?)<\/tr>/g)].map(m => ({ mine: !!m[1], html: m[2], text: text(m[2]) }));
const pg2 = () => ctxFor('tabla', {}).model.group(PORTAL_SEASON, 'PG2');

test('PG2 por defecto: cinco vistas en móvil (Puntos), Todas, Casa y Fuera en escritorio (Todas)', () => {
  const out = render({ g: 'PG2' });
  assert.match(out, /^<section data-screen="tabla">/);
  assert.equal((out.match(/<h1[ >]/g) || []).length, 1);
  assert.match(out, /<h1>Tabla<\/h1><p class="screen-sub">Prebenjamín, Grupo 2 de Gran Canaria<\/p>/);
  assert.match(out, /<a class="screen-action" href="#\/ligas\?s=2025-2026&amp;c=prebenjamin&amp;i=grancanaria&amp;to=tabla">Otro grupo<\/a>/);
  assert.deepEqual(labels(nav(out, 'narrow')), ['Puntos', 'Goles', 'Forma', 'Casa', 'Fuera']);
  assert.deepEqual(active(nav(out, 'narrow')), ['Puntos']);
  assert.deepEqual(labels(nav(out, 'wide')), ['Todas', 'Casa', 'Fuera']);
  assert.deepEqual(active(nav(out, 'wide')), ['Todas']);
  // Un id estable por vista y selector: al cambiar de vista (replaceState), el router devuelve el
  // foco al segmento pulsado, no al h1 (B11 de la revisión).
  assert.deepEqual(ids(nav(out, 'narrow')), ['vista-puntos', 'vista-goles', 'vista-forma', 'vista-casa', 'vista-fuera']);
  assert.deepEqual(ids(nav(out, 'wide')), ['vista-ancha-todas', 'vista-ancha-casa', 'vista-ancha-fuera']);
  assert.match(nav(out, 'narrow'), /href="#\/tabla\?s=2025-2026&amp;g=PG2" aria-current="true">Puntos/, 'la vista por defecto va sin v');
  assert.match(nav(out, 'narrow'), /href="#\/tabla\?s=2025-2026&amp;g=PG2&amp;v=forma">Forma/);
  assert.match(nav(out, 'wide'), /href="#\/tabla\?s=2025-2026&amp;g=PG2" aria-current="true">Todas/);
  assert.match(out, /<h2 class="block-title">Clasificación<\/h2><p class="block-context">jornada 30, final<\/p>/);
  assert.match(out, /<div class="box tabla-puntos"><table class="standings">/);
});

test('PG2: una sola tabla con todas las columnas, # Equipo y Pts, la fila propia y cada equipo a #/equipo', () => {
  const out = render({ g: 'PG2' });
  const heads = [...out.match(/<thead>(.*?)<\/thead>/)[1].matchAll(/<th scope="col"[^>]*>(.*?)<\/th>/g)].map(m => text(m[1]));
  assert.deepEqual(heads, ['#', 'Equipo', 'J', 'G', 'E', 'P', 'GF', 'GC', 'DG', 'Últimos 5', 'Pts']);
  const rows = bodyRows(out);
  assert.equal(rows.length, 15);
  assert.deepEqual(rows.filter(r => r.mine).map(r => r.text.split(' (')[0]), ['9 Las Mesas Hu.']);
  assert.match(rows[8].html, /<a class="st-link" href="#\/equipo\?s=2025-2026&amp;g=PG2&amp;t=Las%20Mesas%20Hu\.">/);
  assert.match(rows[8].html, /<td class="st-pts">37<\/td>$/);
  assert.equal((out.match(/<table class="standings">/g) || []).length, 1, 'no hay una segunda tabla escondida');
});

test('Forma: los cinco últimos de lastResults y «retirado» para CD Batán', () => {
  const out = render({ g: 'PG2', v: 'forma' });
  assert.deepEqual(active(nav(out, 'narrow')), ['Forma']);
  assert.deepEqual(active(nav(out, 'wide')), ['Todas']);
  assert.match(out, /<div class="box tabla-forma">/);
  const rows = bodyRows(out);
  const letters = (row) => [...row.html.matchAll(/<span class="form-chip form-[gep]">([GEP])<\/span>/g)].map(m => m[1]).join('');
  assert.equal(letters(rows[8]), lastResults('Las Mesas Hu.', pg2()).map(x => x.letter).join(''));
  assert.equal(letters(rows[8]), 'EPPGP');
  assert.equal(letters(rows[0]), 'GGPGG');
  assert.match(rows[14].html, /<td class="st-form"><span class="st-retired">retirado<\/span><\/td>/);
  assert.match(rows[14].text, /^15 .*CD Batán 28 0 0 28 0 84 −84 retirado 0$/);
});

test('Casa y Fuera: homeAwayTable, la fila propia y la nota de cobertura de Batán', () => {
  for (const [v, where] of [['casa', 'en casa'], ['fuera', 'fuera de casa']]) {
    const out = render({ g: 'PG2', v });
    assert.deepEqual(active(nav(out, 'narrow')), [v === 'casa' ? 'Casa' : 'Fuera']);
    assert.deepEqual(active(nav(out, 'wide')), [v === 'casa' ? 'Casa' : 'Fuera']);
    assert.match(out, new RegExp(`<h2 class="block-title">Clasificación ${where}</h2><p class="block-context">desde el calendario</p>`));
    const rows = bodyRows(out);
    const expected = homeAwayTable(pg2(), v);
    assert.deepEqual(rows.map(r => r.text.split(' ').pop()), expected.map(r => String(r.pts)));
    const own = expected.find(r => r.team === 'Las Mesas Hu.');
    assert.equal(rows.find(r => r.mine).text, `${own.pos} Las Mesas Hu. (mi equipo) ${[own.pj, own.g, own.e, own.p, own.pts].join(' ')}`);
    assert.equal(text(out.match(/<p class="notice">.*?<\/p>/)[0]),
      'No cuenta los 28 partidos contra CD Batán (retirado), que no están en el calendario.');
  }
});

test('cobertura: nada en PFV2; con resultados que faltan, las dos cifras y los retirados', () => {
  assert.equal(homeAwayCoverage(ctxFor('tabla', {}).model.group(PORTAL_SEASON, 'PFV2')), null);
  assert.doesNotMatch(render({ g: 'PFV2', v: 'casa' }), /class="notice"/);
  assert.deepEqual(homeAwayCoverage(pg2()), { calendar: 182, official: 210, vsRetired: 28, retired: ['CD Batán'], exact: true });
  // Clasificación final y calendario del 1 de marzo (currentAt): faltan resultados.
  const out = render({ g: 'PG2', v: 'fuera' }, { today: '2026-03-01', datasets: datasetsFor({ current: currentAt('2026-03-01') }) });
  assert.equal(text(out.match(/<p class="notice">.*?<\/p>/)[0]),
    'Con los 101 partidos con resultado del calendario; la clasificación oficial cuenta 210, 28 de ellos contra CD Batán (retirado).');
});

test('goleadores del grupo: los 10 primeros con escudo, goles y PJ, y «ver todos»', () => {
  const out = render({ g: 'PG2' });
  const block = out.match(/<section class="block"><div class="block-head"><h2 class="block-title">Goleadores del grupo<\/h2>.*?<\/section>/)[0];
  assert.match(block, /<p class="block-context"><a class="block-link" href="#\/goleadores\?s=2025-2026&amp;g=PG2">ver todos \(12\)<\/a><\/p>/);
  const rows = [...block.matchAll(/<tr><th scope="row"[^>]*>(.*?)<\/th><td class="sc-goals">(\d+)<\/td><td class="sc-pj">(\d+)<\/td><\/tr>/g)];
  assert.equal(rows.length, 10);
  assert.deepEqual(rows.map(m => [text(m[1]), +m[2], +m[3]]).slice(0, 2), [
    ['Lucas León Rodríguez , AD Huracán', 50, 20], ['Hector Garcia Santana , Acodetti', 42, 18]]);
  assert.match(rows[0][1], /<img class="crest crest-16" src="\.\/escudos\/s\/huracan\.png"/);
  assert.match(block, /<th scope="col" class="sc-goals">Goles<\/th><th scope="col" class="sc-pj"><abbr title="Partidos jugados">PJ<\/abbr><\/th>/);
  // Con 10 o menos no hay «ver todos».
  const few = [{ id: 'PG2', s: GOL_PG2[0].s.slice(0, 10) }];
  assert.doesNotMatch(render({ g: 'PG2' }, opts({ golPrebenj: few })), /ver todos/);
  assert.deepEqual(groupScorers([{ id: 'X', s: [['B', 't', 3, 5], ['A', 't', 3, 4], ['C', 't', 9, 9]] }], 'X').map(r => r.name), ['C', 'A', 'B']);
  assert.equal(groupScorers(null, 'X'), null);
  assert.equal(groupScorers([{ id: 'Y', s: [] }], 'X'), null, 'sin el grupo, null');
  assert.deepEqual(groupScorers([{ id: 'X', s: [] }], 'X'), []);
});

test('goleadores: un vacío que dice por qué, en PFV2, sin goles aún y en una temporada pasada', () => {
  assert.match(render({ g: 'PFV2' }), /<h2 class="block-title">Goleadores del grupo<\/h2><\/div><p class="empty">La fuente de este grupo no publica goleadores\.<\/p>/);
  assert.match(render({ g: 'PG2' }, opts({ golPrebenj: [{ id: 'PG2', s: [] }] })), /<p class="empty">Todavía no hay goles registrados en este grupo\.<\/p>/);
  const past = render({ s: '2024-2025', g: 'P1' }, { datasets: datasetsFor({ golPrebenj: GOL_PG2, seasonRaw: { '2024-2025': pastSeasonRaw() } }) });
  assert.match(past, /<p class="empty">Esta web solo guarda los goleadores de la temporada actual\.<\/p>/);
});

test('procedencia: sourceInfo (datos) con «Ver fuente»; sin enlace si el grupo no lo trae', () => {
  const info = sourceInfo(pg2(), false);
  const out = render({ g: 'PG2' });
  assert.equal(info.kind, 'oficial');
  assert.match(out, new RegExp(`<p class="notice source-line">Clasificación oficial de ${info.source.replace(/\./g, '\\.')}\\. <a class="source-link" href="${info.url.replace(/[.?]/g, '\\$&')}" target="_blank" rel="noopener noreferrer">Ver fuente</a></p>`));
  assert.match(render({ g: 'PFV2' }), /<p class="notice source-line">Clasificación oficial\.<\/p>/);
  const raw = fixture('current-2025-2026');
  raw.prebenjamin.find(g => g.id === 'PG2').standingsKind = 'reconstructed';
  assert.match(text(render({ g: 'PG2' }, opts({ current: raw }))), /Clasificación calculada con los resultados de .+: puede no reflejar sanciones ni desempates de la federación\. Ver fuente/);
});

test('temporada pasada (P1 2024-25): la temporada en la etiqueta, forma del archivo y sin fila propia', () => {
  const out = render({ s: '2024-2025', g: 'P1', v: 'forma' }, { datasets: datasetsFor({ seasonRaw: { '2024-2025': pastSeasonRaw() } }) });
  assert.match(out, /<p class="screen-sub">Benjamín, Primera Fase, Grupo 1 · 2024\/25<\/p>/);
  assert.match(out, /<p class="block-context">jornada 9, final<\/p>/);
  const rows = bodyRows(out);
  assert.equal(rows.length, 10);
  assert.ok(rows.every(r => !r.mine));
  assert.match(rows[0].text, /^1 .*Moya 9 7 1 1 41 17 \+24 G G G G G 22$/);
  assert.match(rows[0].html, /href="#\/equipo\?s=2024-2025&amp;g=P1&amp;t=Moya"/);
  assert.match(out, /<p class="notice source-line">Clasificación oficial\. Archivo de la temporada 2024\/25\.<\/p>/);
  assert.match(out, /href="#\/ligas\?s=2024-2025&amp;c=benjamin&amp;i=grancanaria&amp;to=tabla"/);
});

test('temporada sin cargar, sin clasificación, grupo que no existe o vista desconocida: nunca en blanco', () => {
  const failed = render({ s: '2023-2024', g: 'P1' });
  assert.match(failed, /<h1>Tabla<\/h1>/);
  assert.match(text(failed), /No se pudieron cargar los datos de la temporada 2023\/24/);
  assert.match(failed, /data-action="retry"/);
  const raw = fixture('current-2025-2026');
  raw.prebenjamin.find(g => g.id === 'PG2').standings = [];
  const empty = render({ g: 'PG2' }, opts({ current: raw }));
  assert.match(empty, /<p class="empty">Clasificación sin publicar\.<\/p>/);
  assert.doesNotMatch(empty, /tabla-views/);
  assert.match(render({ g: 'ZZ9' }), /<h1>Tabla<\/h1>.*<p class="empty">No hay ningún grupo ZZ9 en la temporada 2025\/26\.<\/p>/);
  const odd = render({ g: 'PG2', v: 'xyz' });
  assert.deepEqual(active(nav(odd, 'narrow')), ['Puntos']);
  assert.match(odd, /<div class="box tabla-puntos">/);
  assert.deepEqual(active(nav(render({ g: 'PG2', v: 'todas' }), 'narrow')), ['Puntos'], 'un enlace de escritorio en el móvil');
});

test('J, G, E y P llevan su propia clase (para las vistas de móvil)', () => {
  const out = s(standingsTable([{ pos: 1, team: 'A', pts: 3, pj: 1, g: 1, e: 0, p: 0, gf: 2, gc: 1, dg: 1, retired: false }], { view: 'todas' }));
  for (const c of ['st-pj', 'st-g', 'st-e', 'st-p']) assert.match(out, new RegExp(`<td class="st-num ${c}">`), c);
});

test('CSS: columnas por vista solo por debajo de 1024 px; cada selector en su ancho; .segmented nunca se oculta', () => {
  const rules = cssRules();
  const narrow = (m) => m !== null && /max-width:\s*1023\.98px/.test(m);
  const wide = (m) => m !== null && /min-width:\s*1024px/.test(m);
  const hides = (sel, media) => rules.some(r => media(r.media) && r.selector.includes(sel) && /display:\s*none/.test(r.body));
  assert.ok(hides('.tabla-puntos .standings :is(.st-gf, .st-gc, .st-form)', narrow));
  assert.ok(hides('.tabla-goles .standings :is(.st-pj, .st-g, .st-e, .st-p, .st-form)', narrow));
  assert.ok(hides('.tabla-forma .standings :is(.st-g, .st-e, .st-p, .st-gf, .st-gc, .st-dg)', narrow));
  assert.ok(!rules.some(r => r.media === null && /tabla-(puntos|goles|forma)/.test(r.selector)), 'en escritorio, todas las columnas');
  assert.ok(hides('.tabla-views.is-wide', (m) => m === null));
  assert.ok(hides('.tabla-views.is-narrow', wide));
  assert.ok(!rules.some(r => /\.segment/.test(r.selector) && /display:\s*none/.test(r.body)));
  assert.match(rules.find(r => r.selector === '.block-link, .source-link').body, /min-height:\s*44px/);
  const dg = rules.find(r => wide(r.media) && r.selector === '[data-screen="tabla"] .standings .st-dg');
  assert.ok(dg && +dg.body.match(/width:\s*(\d+)px/)[1] >= 52, 'en escritorio, «−128» no toca la columna vecina');
  const used = new Set([render({ g: 'PG2' }), render({ g: 'PG2', v: 'casa' }), render({ g: 'PFV2' })].join('')
    .match(/class="[^"]+"/g).flatMap(m => m.slice(7, -1).split(/\s+/)));
  assert.deepEqual([...used].filter(c => !rules.classes.has(c)), []);
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd /home/manolo/claude/futbol-base
node --test scripts/tests/test_rediseno_tabla.mjs 2>&1 | grep -E 'ERR_MODULE_NOT_FOUND\]|^# (tests|pass|fail)'
```
Esperado:
```text
# Error [ERR_MODULE_NOT_FOUND]: Cannot find module '/home/manolo/claude/futbol-base/src/screen-tabla.js' imported from /home/manolo/claude/futbol-base/scripts/tests/test_rediseno_tabla.mjs
# tests 1
# pass 0
# fail 1
```

- [ ] **Step 3: Write minimal implementation**

Crear `src/screen-tabla.js`:

```js
// Pantalla Tabla (spec §4.4 y §4.8; maqueta 5-2). render(ctx) es pura: el selector de vistas
// (cinco en móvil; Todas, Casa y Fuera en escritorio), la clasificación con la fila propia,
// la forma, casa y fuera con su cobertura, los goleadores del grupo, la procedencia y
// «Otro grupo». Una sola tabla: por debajo de 1024 px el CSS deja las columnas de la vista.
import { html } from './html.js';
import { screenHead, standingsTable, segmented, crest, notice, empty } from './ui.js';
import { errorBox } from './shell.js';
import { lastResults, homeAwayTable, retiredTeams, groupFinished, playerName, sourceInfo, seasonLabel } from './model.js';
import { routeHref } from './links.js';
import { seasonNeeds } from './state.js';
import { myTeamIn } from './myteam.js';

const NARROW = [['puntos', 'Puntos'], ['goles', 'Goles'], ['forma', 'Forma'], ['casa', 'Casa'], ['fuera', 'Fuera']]
  .map(([value, label]) => ({ value, label }));
// Escritorio: todas las columnas y, además, Casa y Fuera (decisión 15 de B1).
const WIDE = [['todas', 'Todas'], ['casa', 'Casa'], ['fuera', 'Fuera']].map(([value, label]) => ({ value, label }));
const VIEWS = ['puntos', 'goles', 'forma', 'casa', 'fuera', 'todas'];

// «A», «A y B», «A, B y C».
const listEs = items => (items.length < 2 ? items.join('')
  : `${items.slice(0, -1).join(', ')} y ${items[items.length - 1]}`);

// Cobertura de Casa y Fuera (spec §7), que salen del calendario: los partidos con resultado
// entre equipos activos frente a los que cuenta la clasificación oficial (la suma de J entre
// dos). null si cuadran. `exact`: la única diferencia son los partidos de los retirados.
export function homeAwayCoverage(group) {
  const retired = retiredTeams(group);
  const rows = group.standings || [];
  const played = rows.reduce((n, row) => n + (row.pj || 0), 0);
  const gone = rows.filter(row => retired.has(row.team) && row.pj > 0);
  const vsRetired = gone.reduce((n, row) => n + row.pj, 0);
  let calendar = 0;
  for (const round of group.rounds || []) {
    for (const m of round.matches) {
      if (m.hs != null && m.as != null && !retired.has(m.home) && !retired.has(m.away)) calendar += 1;
    }
  }
  const official = Math.round(played / 2);
  if (calendar === official) return null;
  return { calendar, official, vsRetired, retired: gone.map(row => row.team), exact: calendar === official - vsRetired };
}

// Los retirados con J > 0 nunca están en el calendario (regla 1 de retiredTeams).
function coverageText(c) {
  const whom = `${listEs(c.retired)} (${c.retired.length > 1 ? 'retirados' : 'retirado'})`;
  if (c.exact) return `No cuenta los ${c.vsRetired} partidos contra ${whom}, que no están en el calendario.`;
  const also = c.vsRetired ? `, ${c.vsRetired} de ellos contra ${whom}` : '';
  return `Con los ${c.calendar} partidos con resultado del calendario; la clasificación oficial cuenta ${c.official}${also}.`;
}

// Goleadores de un grupo desde GOL_* ([{ id, s: [[nombre, equipo, goles, PJ]] }]): de más a
// menos goles y, a igualdad, con menos partidos. null si la fuente no trae el grupo.
export function groupScorers(gol, groupId) {
  const entry = (gol || []).find(item => item && item.id === groupId);
  if (!entry) return null;
  return (Array.isArray(entry.s) ? entry.s : [])
    .map(([name, team, goals, games]) => ({ name, team, goals, games }))
    .sort((a, b) => b.goals - a.goals || a.games - b.games);
}

// «jornada 30, final»: hasta dónde llega la clasificación.
function standingsContext(group, today, portalSeason) {
  const round = group.currentRound && group.rounds.find(r => r.key === group.currentRound);
  const done = groupFinished(group, today, portalSeason);
  if (!round) return done ? 'final' : null;
  return `${round.label.toLowerCase()}${done ? ', final' : ''}`;
}

const block = (title, context, content) => html`<section class="block"><div class="block-head"><h2 class="block-title">${title}</h2>${context ? html`<p class="block-context">${context}</p>` : ''}</div>${content}</section>`;

function scorersBlock(group, scorers, historical, shields) {
  const s = group.season;
  if (!scorers || !scorers.length) {
    const why = historical ? 'Esta web solo guarda los goleadores de la temporada actual.'
      : scorers ? 'Todavía no hay goles registrados en este grupo.'
        : 'La fuente de este grupo no publica goleadores.';
    return block('Goleadores del grupo', null, empty(why));
  }
  const all = scorers.length > 10
    ? html`<a class="block-link" href="${routeHref('goleadores', { s, g: group.id })}">ver todos (${scorers.length})</a>` : null;
  const rows = scorers.slice(0, 10).map(row => html`<tr><th scope="row" class="st-team"><span class="st-label">${crest(row.team, { shields })}<span class="st-name">${playerName(row.name)}</span><span class="vh">, ${row.team}</span></span></th><td class="sc-goals">${row.goals}</td><td class="sc-pj">${row.games}</td></tr>`);
  return block('Goleadores del grupo', all, html`<div class="box"><table class="standings group-scorers"><caption class="vh">Goleadores del grupo</caption><thead><tr><th scope="col" class="st-team">Jugador</th><th scope="col" class="sc-goals">Goles</th><th scope="col" class="sc-pj"><abbr title="Partidos jugados">PJ</abbr></th></tr></thead><tbody>${rows}</tbody></table></div>`);
}

const SOURCE_TEXT = {
  oficial: from => `Clasificación oficial${from}.`,
  calculada: from => `Clasificación calculada con los resultados${from}: puede no reflejar sanciones ni desempates de la federación.`,
  corregida: from => `Clasificación${from} con los puntos corregidos: consulta la fuente por si hay sanciones.`,
};

// Procedencia (sourceInfo de model.js, que devuelve datos: decisión 3 del esqueleto).
function sourceLine(group, historical) {
  const info = sourceInfo(group, historical);
  const from = info.source ? ` de ${info.source}` : '';
  const say = (SOURCE_TEXT[info.kind] || SOURCE_TEXT.oficial)(from);
  const archive = historical ? ` Archivo de la temporada ${seasonLabel(group.season)}.` : '';
  return html`<p class="notice source-line">${say}${archive}${info.url ? html` <a class="source-link" href="${info.url}" target="_blank" rel="noopener noreferrer">Ver fuente</a>` : ''}</p>`;
}

function render(ctx) {
  const { params, model, today } = ctx;
  const shields = (ctx.datasets && ctx.datasets.shields) || {};
  const s = params.s || ctx.portal.season;
  const other = g => ({ href: routeHref('ligas', { s, c: g && g.cat, i: g && g.island, to: 'tabla' }), label: 'Otro grupo' });
  // Sin la temporada (needs no la trajo): la caja de error, nunca otra temporada (§7).
  if (!model.season(s)) {
    return html`<section data-screen="tabla">${screenHead('Tabla', { action: other(null) })}${errorBox(`la temporada ${seasonLabel(s)}`)}</section>`;
  }
  const group = model.group(s, params.g);
  if (!group) {
    const why = params.g ? `No hay ningún grupo ${params.g} en la temporada ${seasonLabel(s)}.` : 'Elige un grupo en «Otro grupo».';
    return html`<section data-screen="tabla">${screenHead('Tabla', { action: other(null) })}${empty(why)}</section>`;
  }
  const historical = s !== ctx.portal.season;
  const head = screenHead('Tabla', { sub: historical ? `${group.label} · ${seasonLabel(s)}` : group.label, action: other(group) });
  const scorers = scorersBlock(group, groupScorers(model.scorers(s, group.cat), group.id), historical, shields);
  const source = sourceLine(group, historical);
  if (!group.standings.length) {
    return html`<section data-screen="tabla">${head}${block('Clasificación', null, empty('Clasificación sin publicar.'))}${scorers}${source}</section>`;
  }
  const v = VIEWS.includes(params.v) ? params.v : 'puntos';
  const side = v === 'casa' || v === 'fuera' ? v : null;
  // Puntos (móvil) y Todas (escritorio) son la vista por defecto: sin `v` en el enlace.
  const href = value => routeHref('tabla', { s, g: group.id, v: value === 'puntos' || value === 'todas' ? '' : value });
  const views = html`<nav class="tabla-views is-narrow" aria-label="Vista de la tabla">${segmented(NARROW, v === 'todas' ? 'puntos' : v, href, { idPrefix: 'vista' })}</nav><nav class="tabla-views is-wide" aria-label="Vista de la tabla">${segmented(WIDE, side || 'todas', href, { idPrefix: 'vista-ancha' })}</nav>`;
  const mine = myTeamIn(group, ctx.myTeam, ctx.resolution);
  const common = { mine, shields, hrefFor: row => routeHref('equipo', { s, g: group.id, t: row.team }) };
  let table;
  if (side) {
    const where = side === 'casa' ? 'en casa' : 'fuera de casa';
    const coverage = homeAwayCoverage(group);
    table = block(`Clasificación ${where}`, 'desde el calendario', html`<div class="box">${standingsTable(homeAwayTable(group, side), { ...common, view: side, caption: `Clasificación ${where} de ${group.label}` })}</div>${coverage ? notice(null, coverageText(coverage)) : ''}`);
  } else {
    const rows = group.standings.map(row => ({ ...row, form: lastResults(row.team, group).map(x => x.letter) }));
    table = block('Clasificación', standingsContext(group, today, ctx.portal.season), html`<div class="box tabla-${v === 'todas' ? 'puntos' : v}">${standingsTable(rows, { ...common, view: 'todas', caption: `Clasificación de ${group.label}` })}</div>`);
  }
  return html`<section data-screen="tabla">${head}${views}${table}${scorers}${source}</section>`;
}

export const screen = {
  id: 'tabla',
  needs: (params, datasets, { portalSeason } = {}) => seasonNeeds(params.s, datasets, portalSeason),
  render,
};
```

En `src/ui.js`, sustituir:

```js
  pj: { label: 'J', title: 'Partidos jugados', cls: 'st-num', cell: (r) => r.pj },
  g: { label: 'G', title: 'Ganados', cls: 'st-num', cell: (r) => r.g },
  e: { label: 'E', title: 'Empatados', cls: 'st-num', cell: (r) => r.e },
  p: { label: 'P', title: 'Perdidos', cls: 'st-num', cell: (r) => r.p },
```

por:

```js
  pj: { label: 'J', title: 'Partidos jugados', cls: 'st-num st-pj', cell: (r) => r.pj },
  g: { label: 'G', title: 'Ganados', cls: 'st-num st-g', cell: (r) => r.g },
  e: { label: 'E', title: 'Empatados', cls: 'st-num st-e', cell: (r) => r.e },
  p: { label: 'P', title: 'Perdidos', cls: 'st-num st-p', cell: (r) => r.p },
```

`segmented` (`ui.js`, de B1) gana un `idPrefix` opcional: un `id` estable por opción, para que el foco vuelva al segmento pulsado al cambiar de vista (B11 de la revisión). Sin él, pinta lo mismo que antes.

En `src/ui.js`, sustituir:

```js
export function segmented(options, active, hrefFor) {
  return html`<div class="segmented">${options.map(({ value, label }) => (value === active
    ? html`<a class="segment" href="${hrefFor(value)}" aria-current="true">${label}</a>`
    : html`<a class="segment" href="${hrefFor(value)}">${label}</a>`))}</div>`;
}
```

por:

```js
// idPrefix (opcional): un id estable por opción, «<prefijo>-<valor>». Al cambiar de vista con
// replaceState, el router devuelve el foco al segmento pulsado (B11 de la revisión de B2).
export function segmented(options, active, hrefFor, { idPrefix = null } = {}) {
  const id = (value) => (idPrefix ? html` id="${idPrefix}-${value}"` : '');
  return html`<div class="segmented">${options.map(({ value, label }) => (value === active
    ? html`<a class="segment"${id(value)} href="${hrefFor(value)}" aria-current="true">${label}</a>`
    : html`<a class="segment"${id(value)} href="${hrefFor(value)}">${label}</a>`))}</div>`;
}
```

En `scripts/tests/test_rediseno_portada.mjs` (Tareas 7 y 8), las dos aserciones que fijaban la clase de J y G también ganan la suya:

En `scripts/tests/test_rediseno_portada.mjs`, sustituir:

```js
  assert.match(block, /<th scope="col" class="st-num"><abbr title="Partidos jugados">J<\/abbr><\/th><th scope="col" class="st-num"><abbr title="Ganados">G<\/abbr><\/th>/);
```

por:

```js
  assert.match(block, /<th scope="col" class="st-num st-pj"><abbr title="Partidos jugados">J<\/abbr><\/th><th scope="col" class="st-num st-g"><abbr title="Ganados">G<\/abbr><\/th>/);
```

En `scripts/tests/test_rediseno_portada.mjs`, sustituir:

```js
  assert.match(out, /<td class="st-pos">9<\/td><th scope="row" class="st-team">.*<\/th><td class="st-num">28<\/td><td class="st-dg">−30<\/td><td class="st-pts">37<\/td><\/tr>/);
```

por:

```js
  assert.match(out, /<td class="st-pos">9<\/td><th scope="row" class="st-team">.*<\/th><td class="st-num st-pj">28<\/td><td class="st-dg">−30<\/td><td class="st-pts">37<\/td><\/tr>/);
```

En `scripts/tests/test_rediseno_ui.mjs`, sustituir:

```js
  assert.match(out, /<th scope="col" class="st-num"><abbr title="Partidos jugados">J<\/abbr><\/th>/);
```

por:

```js
  assert.match(out, /<th scope="col" class="st-num st-pj"><abbr title="Partidos jugados">J<\/abbr><\/th>/);
```

Añadir al final de `acta.css`:

```css
/* ── Tabla: vistas, goleadores y procedencia (spec §4.4) ──────────────── */

.tabla-views { margin-top: 14px; }
.tabla-views.is-wide { display: none; }
.block-link, .source-link {
  display: inline-flex;
  align-items: center;
  min-height: 44px;
  font-weight: 700;
}
/* Goleadores del grupo: la tabla de la clasificación con sus propias columnas (la de la portada es .scorers). */
.group-scorers .sc-goals { width: 52px; }
.group-scorers .sc-pj { width: 36px; }
.group-scorers td.sc-goals { font-weight: 800; color: var(--ink); }
.source-line { margin-top: 14px; }

/* Móvil y tableta: una sola tabla con todas las columnas; cada vista deja las suyas. */
@media (max-width: 1023.98px) {
  .tabla-puntos .standings :is(.st-gf, .st-gc, .st-form) { display: none; }
  .tabla-goles .standings :is(.st-pj, .st-g, .st-e, .st-p, .st-form) { display: none; }
  .tabla-goles .standings :is(.st-gf, .st-gc) { width: 40px; }
  .tabla-goles .standings .st-dg { width: 48px; }
  .tabla-forma .standings :is(.st-g, .st-e, .st-p, .st-gf, .st-gc, .st-dg) { display: none; }
}

/* Escritorio: el selector de Todas, Casa y Fuera en lugar del de cinco (decisión 15 de B1),
 * y columnas de cifras más anchas, que en móvil van justas. */
@media (min-width: 1024px) {
  .tabla-views.is-narrow { display: none; }
  .tabla-views.is-wide { display: block; max-width: 480px; }
  [data-screen="tabla"] .standings .st-num { width: 36px; }
  [data-screen="tabla"] .standings :is(.st-gf, .st-gc) { width: 48px; }
  [data-screen="tabla"] .standings .st-dg { width: 56px; }
  [data-screen="tabla"] .standings .st-form { width: 124px; padding-left: 14px; }
  [data-screen="tabla"] .standings .st-pts { width: 48px; }
}
```

La pantalla entra en el router en la Tarea 12.

- [ ] **Step 4: Run test to verify it passes**

```bash
cd /home/manolo/claude/futbol-base
node --test scripts/tests/test_rediseno_tabla.mjs scripts/tests/test_rediseno_ui.mjs scripts/tests/test_rediseno_css.mjs scripts/tests/test_rediseno_portada.mjs 2>&1 | grep -E '^# (tests|pass|fail)'
```
Esperado (12 de la Tabla más las de `ui.js`, `acta.css` y la portada, que siguen en verde con las clases nuevas):
```text
# tests 96
# pass 96
# fail 0
```

- [ ] **Step 5: Verificación visual (Chrome, fuera del repo)**

La vista previa de la Tarea 9 ya pinta la Tabla, porque ahora existe `src/screen-tabla.js`:
- Forma a 390 px, en claro y en oscuro (como la maqueta);
- Todas a 1440 px;
- Casa a 390 px;
- Puntos a 320 px;
- Goles a 390 px.

En cada captura comprueba qué columnas se ven y qué selector hay. Si `$S/jt-preview.mjs` no existe (otra sesión), se crea antes con el bloque del paso 5 de la Tarea 9.

```bash
cd /home/manolo/claude/futbol-base
S=/tmp/claude-1000/-home-manolo/db6fd8e0-f1e7-4e94-b6cd-ef7dd5bf6ae9/scratchpad/planB2
mkdir -p "$S"
OUT="$S/shots-t10" node "$S/jt-preview.mjs"
```
Esperado:
```text
jt-jornada-390-light: {"overflow":0,"small":[],"broken":[],"covered":false,"heads":[],"views":[],"days":[14,14]}
jt-jornada-390-dark: {"overflow":0,"small":[],"broken":[],"covered":false,"heads":[],"views":[],"days":[14,14]}
jt-jornada-1440-light: {"overflow":0,"small":[],"broken":[],"covered":false,"heads":[],"views":[],"days":[174,732]}
jt-jornada-390-light-3jun: {"overflow":0,"small":[],"broken":[],"covered":false,"heads":[],"views":[],"days":[14,14]}
calendario del grupo: {"file":"calendario-prebenjam-n-grupo-2-de-gran-canaria.ics","events":5,"teguinte":false}
compartir jornada: {"copied":"/__page?screen=jornada&g=PG2&r=Jornada+30&today=2026-06-03#/jornada?s=2025-2026&g=PG2&r=Jornada%2030","label":"Enlace copiado"}
jt-jornada-390-light-pfv2: {"overflow":0,"small":[],"broken":[],"covered":false,"heads":[],"views":[],"days":[14]}
jt-tabla-390-light-forma: {"overflow":0,"small":[],"broken":[],"covered":false,"heads":["#","Equipo","J","Últimos 5","Pts"],"views":["Puntos Goles [Forma] Casa Fuera"],"days":[]}
jt-tabla-390-dark-forma: {"overflow":0,"small":[],"broken":[],"covered":false,"heads":["#","Equipo","J","Últimos 5","Pts"],"views":["Puntos Goles [Forma] Casa Fuera"],"days":[]}
jt-tabla-1440-light-defecto: {"overflow":0,"small":[],"broken":[],"covered":false,"heads":["#","Equipo","J","G","E","P","GF","GC","DG","Últimos 5","Pts"],"views":["[Todas] Casa Fuera"],"days":[]}
jt-tabla-390-light-casa: {"overflow":0,"small":[],"broken":[],"covered":false,"heads":["#","Equipo","J","G","E","P","Pts"],"views":["Puntos Goles Forma [Casa] Fuera"],"days":[]}
jt-tabla-320-light-defecto: {"overflow":0,"small":[],"broken":[],"covered":false,"heads":["#","Equipo","J","G","E","P","DG","Pts"],"views":["[Puntos] Goles Forma Casa Fuera"],"days":[]}
jt-tabla-390-light-goles: {"overflow":0,"small":[],"broken":[],"covered":false,"heads":["#","Equipo","GF","GC","DG","Pts"],"views":["Puntos [Goles] Forma Casa Fuera"],"days":[]}
OK: sin errores; capturas en /tmp/claude-1000/-home-manolo/db6fd8e0-f1e7-4e94-b6cd-ef7dd5bf6ae9/scratchpad/planB2/shots-t10/jt-*.png
```

Abrir con Read `jt-tabla-390-light-forma.png`, `jt-tabla-390-dark-forma.png`, `jt-tabla-1440-light-defecto.png`, `jt-tabla-390-light-casa.png` y `jt-tabla-320-light-defecto.png`, y comparar con `5-2-tabla.png`:
- **Selector:** en móvil, «Puntos | Goles | Forma | Casa | Fuera» con la vista activa rellena de tinta. A 1440 px, «Todas | Casa | Fuera», de 480 px como mucho, con «Todas» activa.
- **Forma:** #, Equipo, J, Últimos 5 y Pts; los círculos G verdes, E grises y P negros (claros en oscuro); Las Mesas Hu. (9.ª) con «E P P G P»; y CD Batán con «retirado».
- **Fila propia:** fondo rosado (granate en oscuro), texto en tinta de peso 800 y barra de 3 px a la izquierda. **Sin óvalo.**
- **Goleadores del grupo:** diez filas con escudo, nombre («Lucas León Rodríguez»), goles en tinta y PJ, y «ver todos (149)» arriba a la derecha.
- **Procedencia:** «Clasificación oficial de futbolaspalmas.com. Ver fuente».
- **Casa:** J, G, E, P y Pts, y la nota «No cuenta los 28 partidos contra CD Batán (retirado), que no están en el calendario.».
- **1440 px:** las once columnas sin que las cifras se toquen («−128», «+154»).
- **320 px:** sin desplazamiento horizontal, y los nombres largos con elipsis («AD Hurac…», «Las Mesa…»).

- [ ] **Step 6: Suites completas y los tres smoke**

```bash
cd /home/manolo/claude/futbol-base
python3 -m pytest scripts/tests/ -q 2>&1 | tail -1
node --test scripts/tests/test_*.mjs 2>&1 | grep -E '^# (tests|pass|fail)'
```
Esperado:
- pytest: el mismo recuento, sin `failed`.
- node: el recuento anterior más 12, sin fallos (`# fail 0`). La aserción cambiada de `test_rediseno_ui.mjs` no cambia el recuento.

Los tres smoke no cambian: la pantalla todavía no está en el router (Tarea 12).

```bash
cd /home/manolo/claude/futbol-base
node scripts/tests/render-smoke.mjs
node scripts/tests/interaction-smoke.mjs
node scripts/tests/pwa-smoke.mjs 2>&1 | grep -v '^PWA fixture HTTP 404 /escudos/s/'
```
Esperado, con el tamaño del DOM del día:
```text
PASS: render smoke OK — Mi equipo en estado D (DOM 12177 bytes)
PASS: la portada carga a 320px en claro, sin desplazamiento horizontal
PASS: la portada carga a 320px en oscuro, sin desplazamiento horizontal
PASS: la portada carga a 390px en claro, sin desplazamiento horizontal
PASS: la portada carga a 390px en oscuro, sin desplazamiento horizontal
PASS: la portada carga a 768px en claro, sin desplazamiento horizontal
PASS: la portada carga a 768px en oscuro, sin desplazamiento horizontal
PASS: la portada carga a 1440px en claro, sin desplazamiento horizontal
PASS: la portada carga a 1440px en oscuro, sin desplazamiento horizontal
PASS: de la app anterior (su SW real) al rediseño, con datos congelados: la 1.ª apertura es la anterior; sin conexión a medias, el aviso con «Reintentar»; la 2.ª y la 3.ª, la nueva con acta.css y sin mezclar módulos; futbolbase-v20991231a funciona sin conexión
```

- [ ] **Step 7: Commit**

```bash
cd /home/manolo/claude/futbol-base
git add src/screen-tabla.js src/ui.js acta.css scripts/tests/test_rediseno_ui.mjs scripts/tests/test_rediseno_portada.mjs scripts/tests/test_rediseno_tabla.mjs
git commit -F - <<'EOF'
feat(rediseño): pantalla Tabla (B2, tarea 10)

- Selector de vistas: Puntos, Goles, Forma, Casa y Fuera en móvil, y Todas,
  Casa y Fuera en escritorio (decisión 15 de B1). Como render no sabe el
  ancho, pinta los dos y el CSS deja uno.
- Una sola tabla con todas las columnas; por debajo de 1024 px el CSS deja
  las de la vista, con #, Equipo y Pts siempre. J, G, E y P ganan su clase
  en ui.js.
- Forma con lastResults y «retirado»; Casa y Fuera con homeAwayTable y la
  cobertura de §7 para el grupo (homeAwayCoverage).
- Goleadores del grupo: los 10 primeros con escudo, goles y PJ, «ver todos»
  y un vacío que dice por qué.
- Procedencia con sourceInfo (datos, decisión 3 del esqueleto), la fila
  propia, cada equipo a #/equipo y «Otro grupo».

Pruebas con las fixtures: PG2 en sus cinco vistas con Batán retirado y la
nota de Batán en Casa y Fuera, PFV2 sin nota ni goleadores, P1 2024-25,
clasificación vacía, vista desconocida y el CSS de cada ancho.

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01Sg56KK3oZgo8Ye7Snj6wG9
EOF
git show --stat --oneline HEAD | tail -1
```
Esperado: `6 files changed`. Son nuevos `src/screen-tabla.js` y la prueba; están modificados `ui.js`, `acta.css`, `test_rediseno_ui.mjs` y `test_rediseno_portada.mjs`.

---

### Task 11: `screen-partido.js`, la pantalla Partido (spec §4.5, §5.3, §7, §9.2 y §9.3)

La ficha de un partido: resultado con los penaltis, goles de `timelineFor` con el aviso si no cuadran, alineaciones del acta, cara a cara del grupo con las temporadas anteriores bajo demanda y contexto; cada fichero perezoso que falla pinta la caja de su bloque y el resto de la pantalla sigue.

**Contexto** (fixtures congeladas de B1 y datos de `main` a 24/09/2026):
- **PG2, jornada 30, 02/06/2026: Las Mesas Hu. 2–7 AD Huracán** (§11, caso 7). No tiene cronología: la entrada `'Las Mesas Hu.|AD Huracán|2-9'` es de A2 (jornada 10), donde los dos nombres también juegan, en benjamín. Tampoco tiene acta: `LINEUPS_2025_2026` solo trae A1 (44) y FF1 (7). Su cara a cara en PG2 son dos partidos, J15 (8–1) y J30 (2–7); los de A2 (2–9 y 4–1) no cuentan.
- **Actas de A1** (fixture `lineups-2025-2026`): 43 de 44 tienen algún gol sin minuto, y 18 no suman el marcador. Por ejemplo, en Goleta 0–20 Arucas el acta apunta los 20 goles al local.
- **Cronología** (fixture `matchdetail`, 434 entradas): 8 no suman el marcador. Por ejemplo, Unión Viera 14–1 Santidad (A1, jornada 3) suma 13–2.
- **Maspalomas, MCPK1, cuartos:** UD Las Mesas Huracán 1–1 CF Unión Carrizal. Pasa el local y la tanda es 3–2 (fila de 9 columnas, §9.3).
- **Acta oficial (§9.2).** Se comprobó la URL `https://www.fiflp.com/pnfg/NPcd/NFG_CmpPartido?cod_primaria=1000120&CodActa=<cod>&cod_acta=<cod>` en un navegador limpio (Chrome con Playwright, un contexto nuevo sin cookies en cada intento). Abrió 14 de 14 veces, con 7 actas de 2021-22 a 2025-26 en dos rondas, y siempre enseñó la «Ficha de Partido» con los equipos y el árbitro. Por eso va el enlace «Ver acta oficial», y no «Acta nº <cod>».
- **`data-lineups-<S>.js` solo existe si la temporada tiene actas:** `generate_js.py`, paso 10, se lo salta si no hay ningún `cod_acta`. Sin el cambio del paso 3, al activar 2026/27 cada partido pintaría «No se pudieron cargar los datos de las actas» hasta que llegara la primera acta.
- **Errores (decisión del controlador):** la cronología y las actas son opcionales: su carga nunca rechaza, y el bloque que las necesita pinta su propia caja de error con «Reintentar». La temporada pasada del partido es imprescindible: si no llega, su carga rechaza con `Error('la temporada 2024/25')` y el router pinta la caja de error de la pantalla entera.
- **Piezas compartidas:** la cabecera es `screenHead` de `ui.js` (con «‹» al padre y *Compartir* como botón), la temporada se lee con `seasonLabel` de `model.js` (Tarea 4) y *Compartir* usa `shareLink` de `links.js` (Tarea 7). «‹» (`data-action="back"`) y el «Reintentar» de la pantalla son del router; la pantalla solo atiende *Compartir*, «Ver temporadas anteriores» y el «Reintentar» de ese desplegable.
- **Cara a cara de la temporada** (§4.5, «de la misma categoría»; decisión del controlador): en una liga, los partidos entre los dos equipos, por su nombre exacto, en todos los grupos de liga de su categoría (la primera y la segunda fase de benjamín), por fecha y con el actual resaltado; las filas de otra fase llevan la fase delante («Primera Fase · J1, 12 oct», de `competitionKey`). AD Huracán y RC Victoria se cruzaron en FF9 y dos veces en A2: es una de las tres parejas de benjamín que, en las fixtures, se cruzan en dos fases con el mismo nombre. En un torneo o una copa, los de su competición.
- **Registro:** entra en el router en la Tarea 12, con Jornada y Tabla.

**Files:**
- Create: `src/screen-partido.js` y `scripts/tests/test_rediseno_partido.mjs`.
- Modify:
  - `src/model.js`: se añade `actaFor` al final;
  - `src/state.js`: en `ensureLineups`, un 404 significa «sin actas» y devuelve `{}`;
  - `acta.css`: se añade al final el bloque «Partido»;
  - `scripts/tests/test_festate_fixes.mjs`: la prueba del fallo de `ensureLineups` simula un 503 en lugar de un 404.
- Test: `scripts/tests/test_rediseno_partido.mjs` (17 pruebas) y `scripts/tests/test_festate_fixes.mjs`.

**Interfaces:**
- Consumes:
  - `html` y `join` (`html.js`); `box`, `cells`, `crest`, `empty`, `formChips`, `notice` y `screenHead` (`ui.js`, este de la Tarea 4);
  - de B1 (`model.js`): `headToHead(group, a, b)`, `lastResults(team, group)`, `matchState(match, todayISO)`, `playerName(raw)`, `teamShort(name)` y `timelineFor(match, matchDetail, lineups)`, que tolera `name` y `minute` a `null` y `goals: []`; y `seasonLabel(season)` (Tarea 4);
  - de la Tarea 3: `createModel(datasets, { portalSeason })` con `season(name)`, `group(season, id)` y `cups()`, y `datasetsFrom(raw, extra)`. `season(name)` de una temporada pasada se construye cuando aparece en `datasets.seasonRaw`: nunca memoriza un `null`. Solo lo usan las pruebas y la vista previa; la pantalla recibe `ctx.model`;
  - de la Tarea 5: `errorBox(what)` (`shell.js`) → `Html` con «No se pudieron cargar los datos de <what>» y un `<button data-action="retry">`;
  - `links.js`: `routeHref(screen, params)`, `countdownLabel(dateISO, todayISO)`, `shareLink(data)` y las fechas sin `Intl`, `weekdayDate(iso)` y `dayMonth(iso)` (Tarea 7);
  - `model.js`: `findMatch(group, { r, h, a })` (Tarea 6), el mismo criterio con el que el router deja pasar el partido;
  - `state.js`: `ensureMatchDetail()`, `ensureLineups(season)` y `ensureSeasonData(name)`, que devuelven `null` si fallan; y `normalizeTeamName(name)`;
  - el `ctx` del esqueleto: `ctx.params` (`s`, `g`, `r`, `h`, `a`), `ctx.model`, `ctx.today`, `ctx.datasets`, `ctx.resolution` y `ctx.portal.season`. «‹» y «Reintentar» los atiende el router (Tarea 6).
- Produces:
  - `src/screen-partido.js`:
    - `screen = { id: 'partido', needs, render, mount }`;
    - `needs(params, datasets)` → `Promise[]`. Pide `ensureMatchDetail()`, `ensureLineups(s)` y, si `s` es una temporada pasada sin cargar, `ensureSeasonData(s)`. Guarda el resultado en `datasets.matchDetail`, `datasets.lineups[s]` y `datasets.seasonRaw[s]`. Un fallo de la cronología o de las actas queda como `null`, para que su bloque pinte la caja de error; **solo rechaza** si falta la temporada del partido, con `Error('la temporada 2024/25')`;
    - `partidoNeeds(params, datasets, loaders = { ensureMatchDetail, ensureLineups, ensureSeasonData })`, la misma función con los cargadores inyectables;
    - `pastSeasons(seasons, seasonName)` → `string[]`, de la más reciente a la más antigua;
    - `previousMeetings(model, names, match, cat)` → `[{ season, group, matches }]`;
    - `previousBlock(ctx, match, group)` → `Html`;
    - `loadSeasons(datasets, names, load = ensureSeasonData)` → `Promise<boolean>`.
  - `src/model.js`: `actaFor(match, lineups)` → la entrada del acta o `null`, con el criterio de `timelineFor` (la única cuya `(s, gr)` es la del partido).
  - `src/state.js`: `ensureLineups(season)` resuelve `{}` con HTTP 404; cualquier otro fallo sigue dando `null` y se puede reintentar.
  - Marcadores estables del DOM:
    - `section[data-screen="partido"]` con un solo `h1`;
    - la cabecera de `screenHead`: `a.back[data-action="back"]` y `button.screen-action[data-action="share"]`;
    - `button[data-action="previous"][aria-controls="partido-anteriores"]` y `#partido-anteriores`;
    - `.pt-h2h-row.is-current`, el partido actual en el cara a cara;
    - `[data-action="retry"]` en cada caja de error.

- [ ] **Step 1: Write the failing test**

Crear `scripts/tests/test_rediseno_partido.mjs`:

```js
// Plan B2, tarea 11: pantalla Partido (spec §4.5, §5.3, §7, §9.2, §9.3 y §11,
// caso 7). Solo fixtures congeladas y hoy inyectado: nunca los data-*.js vivos.
import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { fixture } from './fixtures/rediseno/load.mjs';
import { currentAt, datasetsFrom as baseDatasets } from './fixtures/rediseno/simulate.mjs';
import { actaFor, createModel, findMatch } from '../../src/model.js';
import { ensureLineups } from '../../src/state.js';
import {
  loadSeasons, partidoNeeds, pastSeasons, previousBlock, previousMeetings, screen,
} from '../../src/screen-partido.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const PORTAL = { season: '2025-2026', defaultTeam: { cat: 'prebenjamin', groupId: 'PG2', name: 'Las Mesas Hu.' } };
const SEASONS = [{ name: '2025-2026', current: true }, { name: '2024-2025', current: false }];
const TODAY = '2026-09-23';

// Registro de datos con la forma de B2 (datasetsFrom de la Tarea 3), con la cronología y las actas
// ya cargadas, como las deja needs.
function datasetsFrom(raw = fixture('current-2025-2026')) {
  return baseDatasets(raw, {
    golBenj: [], golPrebenj: [], seasons: SEASONS, matchDetail: fixture('matchdetail'),
    lineups: { '2025-2026': fixture('lineups-2025-2026') }, health: fixture('health'),
  });
}

function ctxFor(params, { today = TODAY, datasets = datasetsFrom(), resolution = null } = {}) {
  return {
    route: { screen: 'partido', params }, params, today, datasets, resolution,
    model: createModel(datasets, { portalSeason: PORTAL.season }),
    myTeam: { ...PORTAL.defaultTeam, season: PORTAL.season }, health: datasets.health,
    portal: PORTAL, lastPrimary: 'jornada',
  };
}

const render = (params, opts) => String(screen.render(ctxFor(params, opts)));
const text = (out) => String(out).replace(/<[^>]+>/g, ' ').replace(/&#39;/g, "'").replace(/&quot;/g, '"')
  .replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim();

// La caja de error de shell.js (Tarea 5): su texto y su botón «Reintentar».
const failBox = (out, what) => text(out).includes(`No se pudieron cargar los datos de ${what}`)
  && /<button[^>]*data-action="retry"/.test(String(out));

// El bloque <section class="block"> con ese título, o null si no se pinta.
function blockOf(out, title) {
  const s = String(out);
  const at = s.indexOf(`<h2 class="block-title">${title}</h2>`);
  if (at < 0) return null;
  const start = s.lastIndexOf('<section class="block"', at);
  const tags = /<section\b|<\/section>/g;
  tags.lastIndex = start;
  let depth = 0;
  for (let m; (m = tags.exec(s));) {
    depth += m[0] === '</section>' ? -1 : 1;
    if (depth === 0) return s.slice(start, m.index + m[0].length);
  }
  return s.slice(start);
}

const PG2_J30 = { s: '2025-2026', g: 'PG2', r: 'Jornada 30', h: 'Las Mesas Hu.', a: 'AD Huracán' };
const A1_J1 = { s: '2025-2026', g: 'A1', r: 'Jornada 1', h: 'Guayarmina', a: 'Santidad' };
const A1_J3 = { s: '2025-2026', g: 'A1', r: 'Jornada 3', h: 'Unión Viera', a: 'Santidad' };
const A1_J11 = { s: '2025-2026', g: 'A1', r: 'Jornada 11', h: 'Moya', a: 'Guayarmina' };
const A1_J14 = { s: '2025-2026', g: 'A1', r: 'Jornada 14', h: 'Goleta', a: 'Arucas' };
const MCPK1_CUARTOS = { s: '2025-2026', g: 'MCPK1', r: '27-06-2026 ( Cuartos )', h: 'UD Las Mesas Huracán', a: 'CF Unión Carrizal' };

test('PG2, 02/06/2026, Las Mesas Hu. 2–7 AD Huracán: sin cronología, sin acta y cara a cara solo de PG2 (§11, caso 7)', () => {
  const out = render(PG2_J30);
  assert.match(out, /^<section data-screen="partido">/);
  assert.equal(out.match(/<h1[\s>]/g).length, 1);
  assert.match(out, /<h1>Partido<span class="vh">: Las Mesas Hu\. – AD Huracán<\/span><\/h1>/);
  assert.match(out, /<p class="screen-sub">Jornada 30 · Prebenjamín, Grupo 2 de Gran Canaria<\/p>/);
  // «‹» sin historial: la jornada del partido (spec §4.1). La cabecera es screenHead (ui.js).
  assert.match(out, /^<section data-screen="partido"><header class="screen-head"><a class="back" href="#\/jornada\?s=2025-2026&amp;g=PG2&amp;r=Jornada%2030" data-action="back" aria-label="Volver">‹<\/a>/);
  assert.match(out, /<button type="button" class="screen-action" data-action="share"/);
  assert.equal(text(blockOf(out, 'Resultado')),
    'Resultado final Fecha mar 2 jun Hora 17:30 Campo no publicado Local Las Mesas Hu. Resultado: 2–7 Visitante AD Huracán');
  // La cronología 'Las Mesas Hu.|AD Huracán|2-9' es de A2 (benjamín): no es la de este partido.
  const goles = blockOf(out, 'Goles');
  assert.equal(text(goles), 'Goles Ninguna fuente publica quién marcó en este partido.');
  assert.match(goles, /<p class="empty">/);
  assert.equal(text(blockOf(out, 'Alineaciones')), 'Alineaciones La federación no ha publicado el acta de este partido.');
  // Cara a cara de la temporada en prebenjamín: J15 y J30 de PG2, con el actual resaltado; nunca el
  // 2–9 ni el 4–1 de A2, que es benjamín.
  const h2h = blockOf(out, 'Cara a cara');
  assert.deepEqual(h2h.match(/class="pt-h2h-row[^"]*"/g), ['class="pt-h2h-row"', 'class="pt-h2h-row is-current"']);
  assert.ok(text(h2h).startsWith('Cara a cara esta temporada J15, 12 feb AD Huracán – Las Mesas Hu. Huracán – Las Mesas Hu. 8–1 Este partido: J30, 2 jun Las Mesas Hu. – AD Huracán Las Mesas Hu. – Huracán 2–7'));
  assert.doesNotMatch(h2h, /2–9|4–1/);
  assert.match(h2h, /<a class="pt-h2h-row" href="#\/partido\?s=2025-2026&amp;g=PG2&amp;r=Jornada%2015&amp;h=AD%20Hurac%C3%A1n&amp;a=Las%20Mesas%20Hu\.">/);
  // Contexto: posición actual y forma de los dos, en una línea.
  assert.equal(text(blockOf(out, 'Contexto')),
    'Contexto posición y últimos cinco Las Mesas Hu. 9.º , últimos resultados: E P P G P AD Huracán 3.º , últimos resultados: P G G G G');
  // Terminología de la spec: Local y Visitante, G, E y P.
  assert.doesNotMatch(text(out), /\b(HOME|AWAY|Home|Away)\b/);
});

test('cara a cara de la temporada: todos los grupos de liga de la categoría, por fecha (AD Huracán y RC Victoria, FF9 y A2)', () => {
  // Se cruzaron en la primera fase de benjamín (FF9, J1) y dos veces en la segunda (A2, J4 y J15).
  const out = render({ s: '2025-2026', g: 'A2', r: 'Jornada 4', h: 'AD Huracán', a: 'RC Victoria' });
  const h2h = blockOf(out, 'Cara a cara');
  assert.deepEqual(h2h.match(/class="pt-h2h-row[^"]*"/g), ['class="pt-h2h-row"', 'class="pt-h2h-row is-current"', 'class="pt-h2h-row"']);
  assert.equal(text(h2h), 'Cara a cara esta temporada Primera Fase · J1, 12 oct RC Victoria – AD Huracán Victoria – Huracán 0–6'
    + ' Este partido: J4, 11 ene AD Huracán – RC Victoria Huracán – Victoria 2–2 J15, 29 mar RC Victoria – AD Huracán Victoria – Huracán 0–6'
    + ' Ver temporadas anteriores');
  // Cada fila abre su partido, en su grupo.
  assert.deepEqual(h2h.match(/href="[^"]*"/g), [
    'href="#/partido?s=2025-2026&amp;g=FF9&amp;r=Jornada%201&amp;h=RC%20Victoria&amp;a=AD%20Hurac%C3%A1n"',
    'href="#/partido?s=2025-2026&amp;g=A2&amp;r=Jornada%2015&amp;h=RC%20Victoria&amp;a=AD%20Hurac%C3%A1n"',
  ]);
});

test('A1, Guayarmina 8–4 Santidad: cronología de futbolaspalmas en tres columnas y alineaciones del acta', () => {
  const out = render(A1_J1);
  const goles = blockOf(out, 'Goles');
  assert.ok(text(goles).startsWith('Goles minuto a minuto'));
  const body = goles.slice(goles.indexOf('<tbody>'));
  assert.equal(body.match(/<tr>/g).length, 12);
  assert.match(body, /^<tbody><tr><td class="pt-g-home">A\. Valencia Gil<\/td><td class="pt-g-mid"><span class="pt-g-min">12'<\/span> <b class="pt-g-score">1–0<\/b><\/td><td class="pt-g-away"><\/td><\/tr>/);
  assert.match(body, /<tr><td class="pt-g-home"><\/td><td class="pt-g-mid"><span class="pt-g-min">29'<\/span> <b class="pt-g-score">6–1<\/b><\/td><td class="pt-g-away">H\. Contreras Cordero<\/td><\/tr>/);
  assert.doesNotMatch(goles, /no cuadran/);
  const al = blockOf(out, 'Alineaciones');
  const t = text(al);
  assert.ok(t.startsWith('Alineaciones acta nº 246973 Local Guayarmina'));
  // Titulares primero y luego suplentes, por dorsal, con el nombre de playerName y los goles.
  const order = ['Titulares', 'Rodrigo Santana Betancor', 'Liova Godoy Mendoza', 'Suplentes', 'Daniela Maria Godoy Armas', 'Visitante Santidad'];
  assert.deepEqual(order.map((s) => t.indexOf(s)).slice().sort((x, y) => x - y), order.map((s) => t.indexOf(s)));
  assert.match(al, /<tr><td class="pt-dorsal">10<\/td><th scope="row" class="pt-player">Francisco Aduen Ramos Mendoza<\/th><td class="pt-pgoals">2<span class="vh"> goles<\/span><\/td><\/tr>/);
  assert.match(al, /<tr><td class="pt-dorsal">8<\/td><th scope="row" class="pt-player">Hector Contreras Cordero<\/th><td class="pt-pgoals">3<span class="vh"> goles<\/span><\/td><\/tr>/);
  assert.ok(t.includes('Entrenador/a: no consta'));
  assert.ok(t.includes('Árbitro/a: Armiche Jesús Tacoronte Mendoza'));
  // Acta oficial (spec §9.2): abre sin sesión en un navegador limpio.
  assert.match(al, /<a class="pt-acta" href="https:\/\/www\.fiflp\.com\/pnfg\/NPcd\/NFG_CmpPartido\?cod_primaria=1000120&amp;CodActa=246973&amp;cod_acta=246973" target="_blank" rel="noopener noreferrer">Ver acta oficial/);
  // Entrenador con nombre: «Apellidos, Nombre» pasa a «Nombre Apellidos».
  assert.ok(text(blockOf(render(A1_J3), 'Alineaciones')).includes('Entrenador/a: Jose M Leon Cordero'));
});

test('Aviso cuando los goles no cuadran con el marcador: las dos cifras y su procedencia (spec §4.5 y §7)', () => {
  // futbolaspalmas suma 13–2 y su resultado es 14–1.
  assert.ok(text(blockOf(render(A1_J3), 'Goles')).endsWith(
    'Los goles no cuadran con el marcador: la cronología de futbolaspalmas suma 13–2 y el resultado de futbolaspalmas es 14–1.'));
  // Solo acta: la federación apunta los 20 goles al local y el resultado es 0–20.
  const goles = text(blockOf(render(A1_J14), 'Goles'));
  assert.ok(goles.startsWith('Goles según el acta Local Goleta'));
  assert.ok(goles.endsWith('Los goles no cuadran con el marcador: el acta de la federación suma 20–0 y el resultado de futbolaspalmas es 0–20.'));
});

test('Acta sin cronología y con goles sin minuto: la lista de cada equipo, sin marcador parcial', () => {
  const goles = blockOf(render(A1_J11), 'Goles');
  assert.match(goles, /<div class="pt-glists">/);
  assert.doesNotMatch(goles, /pt-g-score|pt-goals/);
  // Cada goleador una vez, con sus goles y los minutos que da el acta: 1 de Moya y 13 de Guayarmina.
  const lists = goles.split(/<div class="pt-glist(?: pt-mine)?">/).slice(1);
  assert.deepEqual(lists.map((l) => (l.match(/<li>/g) || []).length), [1, 4]);
  assert.equal(text(lists[0]), 'Local Moya Álvaro González Leon');
  assert.deepEqual([...lists[1].matchAll(/<li>([^<]+)/g)].map((m) => m[1].trim()),
    ['Liam Garcia Larsen', 'Tara Adeysha Padron Santana', 'Francisco Aduen Ramos Mendoza', 'Abian Jose Valencia Gil']);
  assert.match(lists[1], /<li>Liam Garcia Larsen <span class="pt-glist-n">\(4<span class="vh"> goles<\/span>\)<\/span> <span class="pt-g-min">2&#39;, 32&#39;<\/span><\/li>/);
  assert.match(lists[1], /<li>Francisco Aduen Ramos Mendoza <span class="pt-glist-n">\(5<span class="vh"> goles<\/span>\)<\/span> <span class="pt-g-min">33&#39;<\/span><\/li>/);
  assert.ok(text(goles).endsWith('El acta no da el minuto de todos los goles, así que no hay marcador parcial.'));
  assert.doesNotMatch(goles, /no cuadran/);
});

test('Maspalomas Cup (MCPK1): pasó por penaltis con la tanda; sin acta ni contexto (spec §4.5 y §9.3)', () => {
  const out = render(MCPK1_CUARTOS);
  assert.match(out, /<p class="screen-sub">Cuartos · Prebenjamín, Maspalomas Cup 2026, Copa Plata<\/p>/);
  assert.match(out, /<p class="pt-penalties">UD Las Mesas Huracán pasó por penaltis <span class="pt-tanda">\(3–2\)<\/span><\/p>/);
  assert.ok(text(blockOf(out, 'Resultado')).includes('Resultado: 1–1'));
  assert.equal(blockOf(out, 'Alineaciones'), null);
  assert.equal(blockOf(out, 'Contexto'), null);
  assert.match(out, /<a class="back" href="#\/copa\?s=2025-2026&amp;g=MCPK1" data-action="back"/);
  // Sin la tanda (una copa sin la columna 8), solo quién pasó.
  const ds = datasetsFrom();
  const k1 = ds.cupPrebenjamin.find((g) => g.id === 'MCPK1');
  k1.jornadas['27-06-2026 ( Cuartos )'][0][8] = null;
  assert.match(render(MCPK1_CUARTOS, { datasets: ds }), /<p class="pt-penalties">UD Las Mesas Huracán pasó por penaltis<\/p>/);
  // Un partido del cuadro sin empate no lleva la nota.
  const previa = render({ s: '2025-2026', g: 'MCPK1', r: '26-06-2026 ( Previa )', h: 'CD Tablero', a: 'UD Las Mesas Huracán' });
  assert.ok(text(blockOf(previa, 'Resultado')).includes('Resultado: 1–4'));
  assert.doesNotMatch(previa, /penaltis/);
});

test('Un fichero perezoso que falla: su bloque con «Reintentar» y el resto de la pantalla (spec §7)', () => {
  const sinCronologia = datasetsFrom();
  sinCronologia.matchDetail = null;
  const a = render(A1_J1, { datasets: sinCronologia });
  const ga = blockOf(a, 'Goles');
  assert.ok(failBox(ga, 'la cronología de goles'));
  assert.doesNotMatch(ga, /Ramos Mendoza/, 'nunca el acta en lugar de la cronología');
  assert.ok(text(blockOf(a, 'Alineaciones')).includes('Francisco Aduen Ramos Mendoza'));
  assert.ok(blockOf(a, 'Resultado') && blockOf(a, 'Cara a cara') && blockOf(a, 'Contexto'));

  const sinActas = datasetsFrom();
  sinActas.lineups = { '2025-2026': null };
  const b = render(A1_J1, { datasets: sinActas });
  assert.ok(failBox(blockOf(b, 'Alineaciones'), 'las actas de 2025/26'));
  // La cronología de futbolaspalmas no necesita el acta.
  assert.ok(text(blockOf(b, 'Goles')).includes('A. Valencia Gil'));
  // Sin el acta tampoco se sabe si hay goles del acta: la caja de error, no un vacío falso.
  assert.ok(failBox(blockOf(render(A1_J11, { datasets: sinActas }), 'Goles'), 'la cronología de goles'));

  // Temporada pasada que no se pudo cargar: la caja de error, con cabecera y un solo h1.
  const c = render({ s: '2024-2025', g: 'PGC2', r: '6', h: 'Las Mesas Hu.', a: 'AD Huracán' });
  assert.equal(c.match(/<h1[\s>]/g).length, 1);
  assert.ok(failBox(c, 'la temporada 2024/25'));
});

test('Cronología con nombre y minuto a null y acta sin goles (plan B1, «Para B2»)', () => {
  const ds = datasetsFrom();
  ds.matchDetail = {
    ...ds.matchDetail,
    'AD Huracán|Las Mesas Hu.|8-1': { s: '2025-2026', gr: 'PG2', g: [[null, null, '1-0', 'h', 'r'], [27, '1-1', '1-1', 'a', 'r']] },
  };
  const out = render({ s: '2025-2026', g: 'PG2', r: 'Jornada 15', h: 'AD Huracán', a: 'Las Mesas Hu.' }, { datasets: ds });
  const goles = blockOf(out, 'Goles');
  assert.match(goles, /<tr><td class="pt-g-home"><span class="pt-noname">sin nombre<\/span><\/td><td class="pt-g-mid"><b class="pt-g-score">1–0<\/b><\/td><td class="pt-g-away"><\/td><\/tr>/);
  assert.match(goles, /<td class="pt-g-away"><span class="pt-noname">sin nombre<\/span><\/td>/);
  assert.ok(text(goles).endsWith('la cronología de futbolaspalmas suma 1–1 y el resultado de futbolaspalmas es 8–1.'));

  const acta = { s: '2025-2026', gr: 'PG2', cod: 1, home: [{ n: 'PEREZ, ANA', dn: 1, r: 'starter', g: 0 }], away: [], events: [], coachH: null, coachA: null, ref: null };
  const ds2 = datasetsFrom();
  ds2.lineups = { '2025-2026': { ...ds2.lineups['2025-2026'], 'Las Mesas Hu.|AD Huracán|2-7': acta } };
  const out2 = render(PG2_J30, { datasets: ds2 });
  assert.equal(text(blockOf(out2, 'Goles')),
    'Goles según el acta El acta no recoge quién marcó. Los goles no cuadran con el marcador: el acta de la federación suma 0–0 y el resultado de futbolaspalmas es 2–7.');
  assert.ok(text(blockOf(out2, 'Alineaciones')).includes('Ana Perez'));
});

test('Mi equipo: sus goleadores en tinta, como en la maqueta 5-3 (AD Huracán 8–1 Las Mesas Hu.)', () => {
  const ds = datasetsFrom();
  const model = createModel(ds, { portalSeason: PORTAL.season });
  const resolution = { status: 'ok', group: model.group('2025-2026', 'PG2'), name: 'Las Mesas Hu.', cat: 'prebenjamin' };
  const params = { s: '2025-2026', g: 'PG2', r: 'Jornada 15', h: 'AD Huracán', a: 'Las Mesas Hu.' };
  const goles = blockOf(render(params, { datasets: ds, resolution }), 'Goles');
  assert.match(goles, /<td class="pt-g-home"><\/td><td class="pt-g-mid"><span class="pt-g-min">37'<\/span> <b class="pt-g-score">2–1<\/b><\/td><td class="pt-g-away pt-mine">Yadiel<\/td>/);
  assert.doesNotMatch(goles, /pt-g-home pt-mine/);
  // Sin resolución, o en otro grupo, nadie va en tinta.
  assert.doesNotMatch(blockOf(render(params), 'Goles'), /pt-mine/);
});

test('Partido de una temporada pasada: su temporada en la cabecera y sus enlaces', () => {
  const ds = datasetsFrom();
  const hist = fixture('historical-2024-2025');
  ds.seasonRaw['2024-2025'] = { name: '2024-2025', current: false, benjamin: hist.benjamin, prebenjamin: hist.prebenjamin };
  ds.lineups['2024-2025'] = {};
  const out = render({ s: '2024-2025', g: 'PGC2', r: '6', h: 'Las Mesas Hu.', a: 'AD Huracán' }, { datasets: ds });
  assert.match(out, /<p class="screen-sub">Jornada 6 · Prebenjamín, Grupo 2 de Gran Canaria · 2024\/25<\/p>/);
  assert.match(out, /<a class="back" href="#\/jornada\?s=2024-2025&amp;g=PGC2&amp;r=6" data-action="back"/);
  assert.equal(text(blockOf(out, 'Resultado')).slice(0, 60), 'Resultado final Fecha sáb 30 nov Hora 09:00 Campo LAS TORRES');
  assert.equal(text(blockOf(out, 'Alineaciones')), 'Alineaciones La federación no ha publicado el acta de este partido.');
  const h2h = blockOf(out, 'Cara a cara');
  assert.deepEqual(h2h.match(/class="pt-h2h-row[^"]*"/g), ['class="pt-h2h-row is-current"', 'class="pt-h2h-row"']);
  assert.doesNotMatch(h2h, /Ver temporadas anteriores/, 'no hay temporadas anteriores a 2024-25 en SEASONS');
});

test('Partido pendiente: la cuenta atrás, sin marcador, sin goles ni alineaciones', () => {
  const out = render(PG2_J30, { today: '2026-06-01', datasets: datasetsFrom(currentAt('2026-06-01')) });
  assert.ok(text(blockOf(out, 'Resultado')).startsWith('Resultado mañana Fecha mar 2 jun Hora 17:30'));
  assert.match(out, /<p class="pt-score is-pending"><span aria-hidden="true">–<\/span><span class="vh">Sin resultado<\/span><\/p>/);
  assert.equal(blockOf(out, 'Goles'), null);
  assert.equal(blockOf(out, 'Alineaciones'), null);
  assert.match(blockOf(out, 'Cara a cara'), /<span class="pt-h2h-score is-pending">–<\/span>/);
  assert.match(out, /data-text="Las Mesas Hu\. – AD Huracán \(Jornada 30, Prebenjamín, Grupo 2 de Gran Canaria\)"/);
});

test('Temporadas anteriores bajo demanda: misma categoría y el nombre normalizado (spec §4.5)', async () => {
  const ds = datasetsFrom();
  const ctx = ctxFor(PG2_J30, { datasets: ds });
  const out = String(screen.render(ctx));
  assert.match(blockOf(out, 'Cara a cara'), /<button type="button" class="pt-prev-toggle" data-action="previous" aria-expanded="false" aria-controls="partido-anteriores">Ver temporadas anteriores<\/button><div id="partido-anteriores" class="pt-prev" aria-live="polite" hidden><\/div>/);
  const group = ctx.model.group('2025-2026', 'PG2');
  const match = findMatch(group, PG2_J30);
  assert.deepEqual(pastSeasons(ds.seasons, '2025-2026'), ['2024-2025']);
  // Sin cargar, o si la carga falla: la caja de error con «Reintentar».
  assert.equal(await loadSeasons(ds, ['2024-2025'], async () => null), false);
  assert.ok(failBox(previousBlock(ctx, match, group), 'las temporadas anteriores'));
  // Cargadas (el cargador devuelve el SEASON_2024_2025 congelado).
  const hist = fixture('historical-2024-2025');
  const calls = [];
  const ok = await loadSeasons(ds, ['2024-2025'], async (name) => {
    calls.push(name);
    return { name, current: false, benjamin: hist.benjamin, prebenjamin: hist.prebenjamin };
  });
  assert.equal(ok, true);
  assert.deepEqual(calls, ['2024-2025']);
  assert.deepEqual(previousMeetings(ctx.model, ['2024-2025'], match, 'prebenjamin').map((f) => [f.season, f.group.id, f.matches.length]),
    [['2024-2025', 'PGC2', 2]]);
  assert.deepEqual(previousMeetings(ctx.model, ['2024-2025'], match, 'benjamin'), [], 'nunca de la otra categoría');
  const block = String(previousBlock(ctx, match, group));
  assert.ok(text(block).startsWith('2024/25 · Prebenjamín, Grupo 2 de Gran Canaria J6, 30 nov Las Mesas Hu. – AD Huracán'));
  assert.ok(text(block).includes('J17, 1 mar AD Huracán – Las Mesas Hu. Huracán – Las Mesas Hu. 9–0'));
  assert.match(block, /href="#\/partido\?s=2024-2025&amp;g=PGC2&amp;r=6&amp;h=Las%20Mesas%20Hu\.&amp;a=AD%20Hurac%C3%A1n"/);
  assert.doesNotMatch(block, /is-current/);
  // Con la temporada cargada y sin enfrentamientos, se dice.
  const none = String(previousBlock(ctx, { ...match, home: 'Arucas B', away: 'CD Calero' }, group));
  assert.equal(text(none), 'No encontramos partidos entre estos dos equipos en la temporada 2024/25.');
});

test('needs pide la cronología, las actas de la temporada del partido y, si es pasada, la temporada, que es la única que rechaza', async () => {
  const calls = [];
  const loaders = {
    ensureMatchDetail: async () => { calls.push('cronología'); return { k: 1 }; },
    ensureLineups: async (s) => { calls.push(`actas ${s}`); return s === '2024-2025' ? null : {}; },
    ensureSeasonData: async (s) => { calls.push(`temporada ${s}`); return { name: s, current: false, benjamin: [], prebenjamin: [] }; },
  };
  const ds = { seasons: SEASONS, seasonRaw: {}, lineups: {}, matchDetail: null };
  const loads = partidoNeeds({ s: '2025-2026', g: 'PG2' }, ds, loaders);
  assert.equal(loads.length, 2);
  await Promise.all(loads);
  assert.deepEqual(calls, ['cronología', 'actas 2025-2026']);
  assert.deepEqual([ds.matchDetail, ds.lineups['2025-2026']], [{ k: 1 }, {}]);
  calls.length = 0;
  await Promise.all(partidoNeeds({ s: '2024-2025', g: 'PGC2' }, ds, loaders));
  assert.deepEqual(calls, ['cronología', 'actas 2024-2025', 'temporada 2024-2025']);
  assert.equal(ds.lineups['2024-2025'], null, 'el fallo queda anotado para la caja de error');
  assert.equal(ds.seasonRaw['2024-2025'].name, '2024-2025');
  // Sin `s`, la temporada actual de SEASONS; una temporada ya cargada no se pide otra vez.
  calls.length = 0;
  await Promise.all(partidoNeeds({ g: 'PG2' }, ds, loaders));
  await Promise.all(partidoNeeds({ s: '2024-2025', g: 'PGC2' }, ds, loaders));
  assert.deepEqual(calls, ['cronología', 'actas 2025-2026', 'cronología', 'actas 2024-2025']);
  // La temporada del partido es imprescindible: si no llega, la carga rechaza con «la temporada …»,
  // el <qué> de la caja de error del router. Cronología y actas no rechazan nunca.
  const failing = { ...loaders, ensureSeasonData: async () => null };
  const ds2 = { seasons: [...SEASONS, { name: '2023-2024', current: false }], seasonRaw: {}, lineups: {}, matchDetail: null };
  await assert.rejects(Promise.all(partidoNeeds({ s: '2023-2024', g: 'P1' }, ds2, failing)), { message: 'la temporada 2023/24' });
  assert.equal(ds2.seasonRaw['2023-2024'], undefined);
  assert.equal(screen.id, 'partido');
  assert.equal(typeof screen.needs, 'function');
});

test('Partido que no está: vacío con enlace a la jornada, nunca una pantalla en blanco; enlaces antiguos con el número', () => {
  const out = render({ ...PG2_J30, a: 'Nadie' });
  assert.equal(out.match(/<h1[\s>]/g).length, 1);
  assert.ok(text(out).includes('Partido no encontrado Este partido no está en los datos de Prebenjamín, Grupo 2 de Gran Canaria.'));
  assert.match(out, /<a class="back" href="#\/jornada\?s=2025-2026&amp;g=PG2" data-action="back"/);
  assert.ok(text(render({ ...PG2_J30, g: 'ZZ9' })).includes('Este partido no está en los datos de la temporada 2025/26.'));
  // «30» por «Jornada 30» (el número de un enlace antiguo) y la ronda ausente: el único partido de h contra a.
  const group = ctxFor(PG2_J30).model.group('2025-2026', 'PG2');
  assert.equal(findMatch(group, { ...PG2_J30, r: '30' }).dateISO, '2026-06-02');
  assert.equal(findMatch(group, { ...PG2_J30, r: undefined }).dateISO, '2026-06-02');
  assert.equal(findMatch(group, { ...PG2_J30, r: 'Jornada 29' }).dateISO, '2026-06-02');
});

test('actaFor: el acta de su grupo y su temporada; nunca la de otro partido con la misma clave', () => {
  const lineups = fixture('lineups-2025-2026');
  const entry = lineups['Guayarmina|Santidad|8-4'];
  const match = { season: '2025-2026', groupId: 'A1', roundKey: 'Jornada 1', home: 'Guayarmina', away: 'Santidad', hs: 8, as: 4 };
  assert.equal(actaFor(match, lineups).cod, 246973);
  assert.equal(actaFor({ ...match, groupId: 'A2' }, lineups), null);
  assert.equal(actaFor({ ...match, season: '2024-2025' }, lineups), null);
  assert.equal(actaFor({ ...match, hs: null, as: null }, lineups), null);
  assert.equal(actaFor(match, null), null);
  const dup = { 'Guayarmina|Santidad|8-4': { dup: true, list: [entry, { ...entry, gr: 'FF1', cod: 1 }] } };
  assert.equal(actaFor(match, dup).cod, 246973);
  assert.equal(actaFor({ ...match, groupId: 'FF1' }, dup).cod, 1);
});

test('ensureLineups: sin fichero de actas (404) no hay actas; otro fallo da null y se reintenta', async () => {
  const saved = { document: globalThis.document, fetch: globalThis.fetch, warn: console.warn };
  const script = { src: 'https://x/data-seasons.js?v=20260923j', getAttribute: () => './data-seasons.js?v=20260923j' };
  globalThis.document = { querySelector: () => script };
  console.warn = () => {};
  const seen = [];
  let status = 404;
  globalThis.fetch = async (url) => {
    seen.push(url);
    return { ok: status === 200, status, text: async () => 'const LINEUPS_2031_2032 = {"a|b|1-0":{"s":"2031-2032","gr":"X"}};\n' };
  };
  try {
    assert.deepEqual(await ensureLineups('2030-2031'), {});
    assert.match(seen[0], /^\.\/data-lineups-2030-2031\.js\?v=20260923j$/);
    status = 503;
    assert.equal(await ensureLineups('2031-2032'), null);
    status = 200;
    assert.deepEqual(Object.keys(await ensureLineups('2031-2032')), ['a|b|1-0']);
  } finally {
    globalThis.document = saved.document;
    globalThis.fetch = saved.fetch;
    console.warn = saved.warn;
  }
});

test('acta.css: cada clase de la pantalla existe; marcador de 40 px; pulsables de 44 px; resalte sin óvalo', () => {
  const css = readFileSync(join(ROOT, 'acta.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
  const defined = new Set([...css.matchAll(/\.([a-zA-Z][\w-]*)/g)].map((m) => m[1]));
  const ctx = ctxFor(PG2_J30);
  const group = ctx.model.group('2025-2026', 'PG2');
  const hist = fixture('historical-2024-2025');
  ctx.datasets.seasonRaw['2024-2025'] = { name: '2024-2025', current: false, benjamin: hist.benjamin, prebenjamin: hist.prebenjamin };
  const out = [PG2_J30, A1_J1, A1_J3, A1_J11, A1_J14, MCPK1_CUARTOS].map((p) => render(p)).join('')
    + render(PG2_J30, { today: '2026-06-01', datasets: datasetsFrom(currentAt('2026-06-01')) })
    + String(previousBlock(ctx, findMatch(group, PG2_J30), group))
    + '<p class="pt-loading">';
  const used = new Set([...out.matchAll(/class="([^"]+)"/g)].flatMap((m) => m[1].split(/\s+/)).filter((c) => /^(pt|is)-/.test(c)));
  assert.deepEqual([...used].filter((c) => !defined.has(c)), []);
  const rule = (selector) => {
    const m = css.match(new RegExp(`(?:^|\\})\\s*${selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*\\{([^}]*)\\}`));
    assert.ok(m, `no hay regla para «${selector}»`);
    return m[1];
  };
  assert.match(rule('.pt-score'), /font-size:\s*40px/);
  assert.match(rule('.pt-score'), /font-weight:\s*800/);
  for (const sel of ['.pt-h2h-row', '.pt-prev-toggle', '.pt-acta']) assert.match(rule(sel), /(min-)?height:\s*44px/, sel);
  const current = rule('.pt-h2h-row.is-current');
  assert.match(current, /background:\s*var\(--mark\)/);
  assert.match(current, /color:\s*var\(--ink\)/);
  assert.match(current, /font-weight:\s*800/);
  assert.match(current, /box-shadow:\s*inset 3px 0 0 var\(--ink\)/);
  // Ninguna regla de la pantalla redondea (sin óvalo ni radio, §3.3) ni fuerza mayúsculas.
  const own = [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)].filter((m) => m[1].includes('.pt-'));
  assert.ok(own.length > 40);
  for (const [, selector, body] of own) assert.doesNotMatch(body, /border-radius|text-transform:\s*uppercase/, selector.trim());
});
```

En `scripts/tests/test_festate_fixes.mjs`, en la prueba «ensureLineups: a failed fetch is NOT cached for the session», el fallo simulado deja de ser un 404, que desde el paso 3 significa «temporada sin actas».

En `scripts/tests/test_festate_fixes.mjs`, sustituir:

```js
  fetchImpl = async () => ({ ok: false, status: 404, text: async () => '' });
  const first = await state.ensureLineups('2024-2025');
```

por:

```js
  fetchImpl = async () => ({ ok: false, status: 503, text: async () => '' });
  const first = await state.ensureLineups('2024-2025');
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd /home/manolo/claude/futbol-base
node --test scripts/tests/test_rediseno_partido.mjs 2>&1 | grep -E '^# Error \[ERR_MODULE_NOT_FOUND\]|^# (tests|pass|fail)'
```
Esperado:
```text
# Error [ERR_MODULE_NOT_FOUND]: Cannot find module '/home/manolo/claude/futbol-base/src/screen-partido.js' imported from /home/manolo/claude/futbol-base/scripts/tests/test_rediseno_partido.mjs
# tests 1
# pass 0
# fail 1
```

- [ ] **Step 3: Write minimal implementation**

**a) `src/model.js`.** `entryForMatch` ya está en el módulo, porque la usa `timelineFor`.

Añadir al final de `src/model.js`:

```js
/* El acta de la federación de un partido (spec §4.5, «Alineaciones»): la
 * entrada de LINEUPS_<S> con el mismo criterio que timelineFor, la única cuya
 * (s, gr) es la del partido. null si no hay marcador, si no hay entrada o si
 * la entrada es de otro partido con la misma clave. */
export function actaFor(match, lineups) {
  if (match.hs == null || match.as == null || !lineups) return null;
  return entryForMatch(lineups[`${match.home}|${match.away}|${match.hs}-${match.as}`], match);
}
```

**b) `src/state.js`.** En `ensureLineups`, un 404 deja de ser un fallo. `_lineups` es la caché del módulo: un 404 no se vuelve a pedir en la sesión.

En `src/state.js`, sustituir:

```js
      const r = await fetchData(`data-lineups-${season}.js`);
      if (!r.ok) throw new Error('HTTP ' + r.status);
```

por:

```js
      const r = await fetchData(`data-lineups-${season}.js`);
      // generate_js.py solo escribe data-lineups-<S>.js si la temporada tiene
      // alguna acta: sin fichero (404) no hay actas, y eso no es un error de
      // carga (una temporada recién activada, por ejemplo).
      if (r.status === 404) { _lineups[season] = {}; return _lineups[season]; }
      if (!r.ok) throw new Error('HTTP ' + r.status);
```

**c) `src/screen-partido.js`.**

Crear `src/screen-partido.js`:

```js
// Pantalla Partido (spec §4.5): resultado con los penaltis, los goles de
// timelineFor con su aviso si no cuadran con el marcador, las alineaciones del
// acta, el cara a cara del grupo con las temporadas anteriores bajo demanda y
// el contexto de los dos equipos.
// render(ctx) es pura y síncrona: no toca el DOM ni el reloj (hoy llega en
// ctx.today). mount(root, ctx) pone el comportamiento: compartir y desplegar
// las temporadas anteriores (con su «Reintentar»). «‹» y el «Reintentar» de la
// pantalla son del router (data-action="back" y "retry").
import { html, join } from './html.js';
import { box, cells, crest, empty, formChips, notice, screenHead } from './ui.js';
import {
  actaFor, competitionKey, findMatch, headToHead, lastResults, matchState, playerName, seasonLabel, teamShort,
  timelineFor,
} from './model.js';
import { countdownLabel, dayMonth, routeHref, shareLink, weekdayDate } from './links.js';
import {
  ensureLineups, ensureMatchDetail, ensureSeasonData, normalizeTeamName,
} from './state.js';
import { errorBox } from './shell.js';

const DASH = '–';
const PREVIOUS_ID = 'partido-anteriores';
const LOADERS = { ensureMatchDetail, ensureLineups, ensureSeasonData };

// ── Textos y fechas ──────────────────────────────────────────────────────

const score = (home, away) => `${home}${DASH}${away}`;
const dashed = (pair) => String(pair ?? '').replace('-', DASH);

// Día del calendario (AAAA-MM-DD), con los nombres de links.js (Tarea 7), sin los datos de idioma
// del motor: «jue 12 feb» en la casilla de fecha y «12 feb» en el cara a cara.
const longDate = weekdayDate;
const shortDate = dayMonth;

// Procedencia de cada cifra, para el aviso de datos contradictorios (spec §7).
const TIMELINE_SOURCE = { futbolaspalmas: 'la cronología de futbolaspalmas', acta: 'el acta de la federación' };
function scoreSource(group) {
  const url = String(group.url || '');
  if (/futbolaspalmas\.com/i.test(url)) return 'el resultado de futbolaspalmas';
  if (/fiflp\.com/i.test(url)) return 'el resultado de la federación';
  return 'el resultado del calendario';
}

// Acta oficial en la web de la federación (spec §9.2): abre sin sesión.
const actaUrl = (cod) => `https://www.fiflp.com/pnfg/NPcd/NFG_CmpPartido?cod_primaria=1000120&CodActa=${cod}&cod_acta=${cod}`;

// ── Localizar el partido de la ruta ──────────────────────────────────────

// El grupo de la ruta: de la temporada (ligas y copas de la federación) o de
// los torneos (Maspalomas Cup), que son una capa aparte del modelo.
function findGroup(model, season, id) {
  const found = model.group(season, id);
  if (found) return found;
  const cups = model.cups();
  return cups && cups.season === season ? cups.groups.find((g) => g.id === id) || null : null;
}

// (s, g, r, h, a) identifica el partido: findMatch de model.js (Tarea 6), el mismo criterio con
// el que el router lo deja pasar (la ronda por su clave o su número; si ahí no está, el único
// partido de h contra a del grupo).

function locate(ctx) {
  const params = ctx.params || {};
  const season = params.s || ctx.portal.season;
  const loaded = ctx.model.season(season);
  const group = loaded ? findGroup(ctx.model, season, params.g) : null;
  const match = group ? findMatch(group, params) : null;
  return { season, loaded, group, match };
}

const roundOf = (group, match) => (group.rounds || []).find((round) => round.key === match.roundKey) || null;

const matchHref = (m) => routeHref('partido', { s: m.season, g: m.groupId, r: m.roundKey, h: m.home, a: m.away });

// «‹» sin historial de la app: la jornada del partido (spec §4.1); en un torneo
// o una copa, su cuadro.
function parentHref(group, match) {
  if (!group) return routeHref('jornada');
  return group.kind === 'league'
    ? routeHref('jornada', { s: group.season, g: group.id, r: match ? match.roundKey : '' })
    : routeHref('copa', { s: group.season, g: group.id });
}

// El lado de mi equipo en este partido ('home' | 'away'), solo en su grupo resuelto.
function mineSide(ctx, match) {
  const r = ctx.resolution;
  if (!r || r.status !== 'ok' || !r.group || r.group.id !== match.groupId || r.group.season !== match.season) return null;
  return r.name === match.home ? 'home' : r.name === match.away ? 'away' : null;
}

// ── Bloques ──────────────────────────────────────────────────────────────

function block(title, content, context) {
  return html`<section class="block"><div class="block-head"><h2 class="block-title">${title}</h2>${context ? html`<p class="block-context">${context}</p>` : ''}</div>${content}</section>`;
}

// La cabecera de pantalla común (screenHead, ui.js): «‹» al padre, el título, la etiqueta de
// jornada y grupo, y Compartir (un botón, con los datos del enlace). La región de estado dice si
// se copió el enlace.
function header({ title, subtitle, back, share }) {
  const shareButton = share
    ? html`<button type="button" class="screen-action" data-action="share" data-title="${share.title}" data-text="${share.text}" data-path="${share.path}">Compartir</button>`
    : null;
  return html`${screenHead(title, { sub: subtitle, back, action: shareButton })}<p class="pt-share-status" role="status"></p>`;
}

function resultBlock(match, { today, shields }) {
  const state = matchState(match, today);
  const played = state === 'jugado';
  const context = played ? 'final' : state === 'pendiente' ? countdownLabel(match.dateISO, today) || 'pendiente' : state;
  const facts = cells([
    { label: 'Fecha', value: match.dateISO ? longDate(match.dateISO) : 'sin fecha', muted: !match.dateISO },
    { label: 'Hora', value: match.time || 'no publicada', muted: !match.time },
    { label: 'Campo', value: match.venue || 'no publicado', muted: !match.venue },
  ]);
  const team = (name, side) => html`<div class="pt-team">${crest(name, { size: 46, shields, lazy: false })}<span class="pt-side">${side}</span><span class="pt-name">${name}</span></div>`;
  const marker = played
    ? html`<p class="pt-score"><span class="vh">Resultado: </span>${score(match.hs, match.as)}</p>`
    : html`<p class="pt-score is-pending"><span aria-hidden="true">${DASH}</span><span class="vh">Sin resultado</span></p>`;
  // Eliminatoria resuelta por penaltis (spec §4.5 y §9.3): quién pasó y la tanda si se conoce.
  const penalties = played && match.advancer && match.hs === match.as
    ? html`<p class="pt-penalties">${match.advancer === 'home' ? match.home : match.away} pasó por penaltis${match.shootout ? html` <span class="pt-tanda">(${dashed(match.shootout)})</span>` : ''}</p>`
    : '';
  return box(html`${facts}<div class="pt-teams">${team(match.home, 'Local')}${marker}${team(match.away, 'Visitante')}</div>${penalties}`,
    { title: 'Resultado', context });
}

const noName = html`<span class="pt-noname">sin nombre</span>`;
const minuteOf = (goal) => (goal.minute != null ? html`<span class="pt-g-min">${goal.minute}'</span>` : '');

// Cronología en tres columnas (spec §4.5): goleador local | minuto y marcador parcial | goleador visitante.
function goalsTable(goals, match, mine) {
  const scorer = (goal, side) => (goal.side !== side ? '' : goal.name || noName);
  const cls = (base, side) => (mine === side ? `${base} pt-mine` : base);
  const rows = goals.map((goal) => html`<tr><td class="${cls('pt-g-home', 'home')}">${scorer(goal, 'home')}</td><td class="pt-g-mid">${minuteOf(goal)}${goal.minute != null && goal.score ? ' ' : ''}${goal.score ? html`<b class="pt-g-score">${dashed(goal.score)}</b>` : ''}</td><td class="${cls('pt-g-away', 'away')}">${scorer(goal, 'away')}</td></tr>`);
  return html`<table class="pt-goals"><caption class="vh">Goles en orden: local a la izquierda y visitante a la derecha</caption><thead><tr><th scope="col" class="pt-g-home"><span class="vh">${match.home} (local)</span></th><th scope="col" class="pt-g-mid"><span class="vh">Minuto y marcador</span></th><th scope="col" class="pt-g-away"><span class="vh">${match.away} (visitante)</span></th></tr></thead><tbody>${rows}</tbody></table>`;
}

// Acta con algún gol sin minuto: la lista de goleadores de cada equipo, cada
// uno una vez con sus goles y los minutos que da el acta, sin marcador parcial.
function goalsLists(goals, match, mine) {
  const list = (side, name, label) => {
    const scorers = new Map();
    for (const goal of goals) {
      if (goal.side !== side) continue;
      const entry = scorers.get(goal.name) || { name: goal.name, count: 0, minutes: [] };
      entry.count += 1;
      if (goal.minute != null) entry.minutes.push(`${goal.minute}'`);
      scorers.set(goal.name, entry);
    }
    const items = [...scorers.values()].map((s) => html`<li>${s.name || noName}${s.count > 1 ? html` <span class="pt-glist-n">(${s.count}<span class="vh"> goles</span>)</span>` : ''}${s.minutes.length ? html` <span class="pt-g-min">${s.minutes.join(', ')}</span>` : ''}</li>`);
    return html`<div class="${mine === side ? 'pt-glist pt-mine' : 'pt-glist'}"><h3 class="pt-glist-head"><span class="pt-side">${label}</span> ${name}</h3>${items.length
      ? html`<ul>${items}</ul>`
      : html`<p class="pt-glist-none">Sin goles</p>`}</div>`;
  };
  return html`<div class="pt-glists">${list('home', match.home, 'Local')}${list('away', match.away, 'Visitante')}</div>`;
}

function goalsBlock(match, group, ctx) {
  const detail = ctx.datasets.matchDetail;
  const lineups = (ctx.datasets.lineups || {})[match.season];
  // Sin data-matchdetail.js no se sabe si hay cronología de futbolaspalmas, que
  // manda sobre el acta: caja de error, nunca el acta en su lugar.
  if (detail == null) return block('Goles', errorBox('la cronología de goles'));
  const timeline = timelineFor(match, detail, lineups || null);
  const scoreless = match.hs === 0 && match.as === 0;
  if (!timeline) {
    if (lineups == null) return block('Goles', errorBox('la cronología de goles'));
    return block('Goles', empty(scoreless ? 'Partido sin goles.' : 'Ninguna fuente publica quién marcó en este partido.'));
  }
  const { source, goals, mismatch } = timeline;
  const mine = mineSide(ctx, match);
  const timed = goals.length > 0 && goals.every((goal) => goal.score);
  let body;
  if (!goals.length) {
    body = empty(scoreless ? 'Partido sin goles.' : `${source === 'acta' ? 'El acta' : 'La cronología'} no recoge quién marcó.`);
  } else if (source === 'futbolaspalmas' || timed) {
    body = html`<div class="box">${goalsTable(goals, match, mine)}</div>`;
  } else {
    body = html`<div class="box">${goalsLists(goals, match, mine)}</div>${notice(null, 'El acta no da el minuto de todos los goles, así que no hay marcador parcial.')}`;
  }
  // Datos contradictorios (spec §4.5 y §7): las dos cifras y su procedencia.
  const warning = mismatch
    ? notice('Los goles no cuadran con el marcador:', `${TIMELINE_SOURCE[source]} suma ${dashed(mismatch.timeline)} y ${scoreSource(group)} es ${dashed(mismatch.score)}.`)
    : '';
  return block('Goles', html`${body}${warning}`, source === 'futbolaspalmas' ? 'minuto a minuto' : 'según el acta');
}

function lineupTable(players, team, side) {
  const byDorsal = (a, b) => (a.dn ?? 999) - (b.dn ?? 999) || playerName(a.n).localeCompare(playerName(b.n), 'es');
  const starters = players.filter((p) => p.r === 'starter').sort(byDorsal);
  const subs = players.filter((p) => p.r !== 'starter').sort(byDorsal);
  const row = (p) => html`<tr><td class="pt-dorsal">${p.dn ?? ''}</td><th scope="row" class="pt-player">${playerName(p.n)}</th><td class="pt-pgoals">${p.g > 0 ? html`${p.g}<span class="vh"> ${p.g === 1 ? 'gol' : 'goles'}</span>` : ''}</td></tr>`;
  const part = (title, list) => (list.length
    ? html`<tbody><tr class="pt-lu-group"><th scope="rowgroup" colspan="3">${title}</th></tr>${list.map(row)}</tbody>`
    : '');
  return html`<table class="pt-lineup"><caption class="vh">Alineación de ${team} (${side})</caption><thead><tr><th scope="col" class="pt-dorsal"><abbr title="Dorsal">N.º</abbr></th><th scope="col" class="pt-player">Jugador</th><th scope="col" class="pt-pgoals">Goles</th></tr></thead>${part('Titulares', starters)}${part('Suplentes', subs)}</table>`;
}

const staff = (label, name) => html`<p class="pt-staff"><span class="pt-staff-label">${label}:</span> ${name ? playerName(name) : html`<span class="pt-none">no consta</span>`}</p>`;

function lineupsBlock(match, group, ctx) {
  // La Maspalomas Cup no es de la federación: nunca tiene acta.
  if (/maspalomas/.test(String(group.compKey || ''))) return '';
  const lineups = (ctx.datasets.lineups || {})[match.season];
  if (lineups == null) return block('Alineaciones', errorBox(`las actas de ${seasonLabel(match.season)}`));
  const acta = actaFor(match, lineups);
  if (!acta) return block('Alineaciones', empty('La federación no ha publicado el acta de este partido.'));
  const team = (side) => {
    const name = side === 'home' ? match.home : match.away;
    const label = side === 'home' ? 'Local' : 'Visitante';
    return html`<div class="pt-lu-team"><h3 class="pt-lu-head"><span class="pt-side">${label}</span> ${name}</h3>${lineupTable(acta[side] || [], name, label.toLowerCase())}${staff('Entrenador/a', side === 'home' ? acta.coachH : acta.coachA)}</div>`;
  };
  const link = acta.cod
    ? html`<a class="pt-acta" href="${actaUrl(acta.cod)}" target="_blank" rel="noopener noreferrer">Ver acta oficial<span class="vh"> (web de la federación, en otra pestaña)</span></a>`
    : '';
  return box(html`<div class="pt-lu-teams">${team('home')}${team('away')}</div><div class="pt-lu-foot">${staff('Árbitro/a', acta.ref)}${link}</div>`,
    { title: 'Alineaciones', context: acta.cod ? `acta nº ${acta.cod}` : null });
}

function h2hRow(group, m, { current, today, phase = null }) {
  const round = roundOf(group, m);
  const number = round && round.n != null ? `J${round.n}` : round ? round.label : m.roundKey;
  // Una fila de otra fase lleva la fase delante: «Primera Fase · J3».
  const tag = phase ? `${phase} · ${number}` : number;
  const played = matchState(m, today) === 'jugado';
  // En móvil, nombres cortos (spec §3.5); el completo lo leen los lectores de pantalla.
  const inner = html`<span class="pt-h2h-when">${m.dateISO ? `${tag}, ${shortDate(m.dateISO)}` : tag}</span><span class="pt-h2h-teams"><span class="pt-full">${m.home} ${DASH} ${m.away}</span><span class="pt-short" aria-hidden="true">${teamShort(m.home)} ${DASH} ${teamShort(m.away)}</span></span><span class="${played ? 'pt-h2h-score' : 'pt-h2h-score is-pending'}">${played ? score(m.hs, m.as) : DASH}</span>`;
  return current
    ? html`<div class="pt-h2h-row is-current" aria-current="true"><span class="vh">Este partido: </span>${inner}</div>`
    : html`<a class="pt-h2h-row" href="${matchHref(m)}">${inner}</a>`;
}

// Temporadas anteriores a la del partido que la web publica, de la más reciente a la más antigua.
export function pastSeasons(seasons, seasonName) {
  return (seasons || []).map((s) => s.name)
    .filter((name) => /^\d{4}-\d{4}$/.test(name) && name < seasonName)
    .sort()
    .reverse();
}

// Cara a cara de la temporada (spec §4.5, «de la misma categoría»): en una liga, los partidos
// entre los dos equipos, por su nombre exacto, en todos los grupos de liga de la categoría (la
// primera y la segunda fase de benjamín), por fecha y con el actual resaltado. En un torneo o una
// copa, los de su competición.
function h2hBlock(match, group, ctx) {
  const same = (g, m) => g.id === group.id && m.roundKey === match.roundKey && m.home === match.home && m.away === match.away;
  const season = group.kind === 'league' ? ctx.model.season(group.season) : null;
  const groups = season ? season.groups.filter((g) => g.kind === 'league' && g.cat === group.cat) : [group];
  const when = (m) => m.dateISO || '9999-99-99';
  const found = groups.flatMap((g) => headToHead(g, match.home, match.away).map((m) => ({ g, m })));
  const ordered = found.map((x, i) => ({ ...x, i })).sort((x, y) => (when(x.m) < when(y.m) ? -1 : when(x.m) > when(y.m) ? 1 : x.i - y.i));
  const phase = (g) => (g.id === group.id ? null : competitionKey(g, g.season).label);
  const rows = ordered.map(({ g, m }) => h2hRow(g, m, { current: same(g, m), today: ctx.today, phase: phase(g) }));
  const previous = pastSeasons(ctx.datasets.seasons, match.season).length
    ? html`<button type="button" class="pt-prev-toggle" data-action="previous" aria-expanded="false" aria-controls="${PREVIOUS_ID}">Ver temporadas anteriores</button><div id="${PREVIOUS_ID}" class="pt-prev" aria-live="polite" hidden></div>`
    : '';
  return block('Cara a cara', html`<div class="box">${join(rows)}</div>${previous}`, group.kind === 'league' ? 'esta temporada' : 'en esta competición');
}

// Cara a cara de temporadas anteriores (spec §4.5): los grupos de la misma
// categoría en los que ambos equipos, con el nombre normalizado igual (como el
// historial de la ficha antigua), se enfrentaron. Nunca de la otra categoría.
export function previousMeetings(model, names, match, cat) {
  const want = [normalizeTeamName(match.home), normalizeTeamName(match.away)];
  const out = [];
  for (const name of names) {
    const season = model.season(name);
    if (!season) continue;
    for (const group of season.groups) {
      if (group.cat !== cat) continue;
      const teams = [...new Set(group.rounds.flatMap((round) => round.matches.flatMap((m) => [m.home, m.away])))];
      const homes = teams.filter((t) => normalizeTeamName(t) === want[0]);
      const aways = teams.filter((t) => normalizeTeamName(t) === want[1]);
      const matches = [];
      for (const a of homes) for (const b of aways) if (a !== b) matches.push(...headToHead(group, a, b));
      if (matches.length) out.push({ season: name, group, matches });
    }
  }
  return out;
}

// Lo que se pinta al desplegar «Ver temporadas anteriores», ya cargadas (o no) en datasets.seasonRaw.
export function previousBlock(ctx, match, group) {
  const names = pastSeasons(ctx.datasets.seasons, match.season);
  if (names.some((name) => !ctx.model.season(name))) return errorBox('las temporadas anteriores');
  const found = previousMeetings(ctx.model, names, match, group.cat);
  if (!found.length) {
    const span = names.length === 1 ? `la temporada ${seasonLabel(names[0])}` : `las temporadas ${seasonLabel(names[names.length - 1])} a ${seasonLabel(names[0])}`;
    return empty(`No encontramos partidos entre estos dos equipos en ${span}.`);
  }
  return join(found.map(({ season, group: g, matches }) => html`<h3 class="pt-prev-head">${seasonLabel(season)} · ${g.label}</h3><div class="box">${join(matches.map((m) => h2hRow(g, m, { current: false, today: ctx.today })))}</div>`));
}

function contextBlock(match, group) {
  if (group.kind === 'cup-bracket') return '';
  const item = (team) => {
    const row = (group.standings || []).find((r) => r.team === team);
    if (!row || row.pos == null) return { label: team, value: 'sin clasificación', muted: true };
    if (row.retired) return { label: team, value: 'retirado', muted: true };
    const form = lastResults(team, group).map((r) => r.letter);
    return {
      label: team,
      value: html`<span class="pt-pos">${row.pos}.º</span>${form.length ? html`<span class="vh">, últimos resultados: </span>${formChips(form)}` : ''}`,
    };
  };
  return box(html`<div class="pt-context">${cells([item(match.home), item(match.away)])}</div>`,
    { title: 'Contexto', context: 'posición y últimos cinco' });
}

// ── Pantalla ─────────────────────────────────────────────────────────────

const screenHtml = (content) => html`<section data-screen="partido">${content}</section>`;

export function render(ctx) {
  const { season, loaded, group, match } = locate(ctx);
  const listed = (ctx.datasets.seasons || []).some((s) => s.name === season);
  if (!loaded && listed && season !== ctx.portal.season) {
    return screenHtml(html`${header({ title: 'Partido', back: parentHref(null) })}${errorBox(`la temporada ${seasonLabel(season)}`)}`);
  }
  if (!match) {
    const where = group ? group.label : `la temporada ${seasonLabel(season)}`;
    return screenHtml(html`${header({ title: 'Partido', subtitle: group ? group.label : null, back: parentHref(group, null) })}${block('Partido no encontrado', empty(`Este partido no está en los datos de ${where}.`))}`);
  }
  const round = roundOf(group, match);
  const roundLabel = round ? round.label : match.roundKey;
  const past = season !== ctx.portal.season ? ` · ${seasonLabel(season)}` : '';
  const played = matchState(match, ctx.today) === 'jugado';
  const shields = ctx.datasets.shields || {};
  const share = {
    title: `${match.home} ${DASH} ${match.away}`,
    text: `${played ? `${match.home} ${score(match.hs, match.as)} ${match.away}` : `${match.home} ${DASH} ${match.away}`} (${roundLabel}, ${group.label}${past})`,
    path: matchHref(match),
  };
  const head = header({
    title: html`Partido<span class="vh">: ${match.home} ${DASH} ${match.away}</span>`,
    subtitle: `${roundLabel} · ${group.label}${past}`,
    back: parentHref(group, match),
    share,
  });
  // Sin marcador no hay goles ni acta que enseñar.
  const main = html`${resultBlock(match, { today: ctx.today, shields })}${played ? goalsBlock(match, group, ctx) : ''}${played ? lineupsBlock(match, group, ctx) : ''}`;
  const side = html`${h2hBlock(match, group, ctx)}${contextBlock(match, group)}`;
  return screenHtml(html`${head}<div class="pt-cols"><div class="pt-main">${main}</div><div class="pt-aside">${side}</div></div>`);
}

// Cargas perezosas (spec §5.4): la cronología, las actas de la temporada del
// partido y, si es pasada, la temporada. Los cargadores devuelven null si
// fallan. La cronología y las actas son opcionales: el bloque que las necesita
// pinta la caja de error y el resto se pinta. La temporada es imprescindible:
// sin ella, la carga rechaza y el router pinta la caja de la pantalla entera.
export function partidoNeeds(params, datasets, loaders = LOADERS) {
  const seasons = datasets.seasons || [];
  const s = (params && params.s) || (seasons.find((x) => x.current) || {}).name;
  if (!s) return [];
  if (!datasets.lineups) datasets.lineups = {};
  if (!datasets.seasonRaw) datasets.seasonRaw = {};
  const loads = [
    loaders.ensureMatchDetail().then((data) => { datasets.matchDetail = data; }),
    loaders.ensureLineups(s).then((data) => { datasets.lineups[s] = data; }),
  ];
  const listed = seasons.find((x) => x.name === s);
  if (listed && !listed.current && !datasets.seasonRaw[s]) {
    loads.push(loaders.ensureSeasonData(s).then((raw) => {
      if (!raw) throw new Error(`la temporada ${seasonLabel(s)}`);
      datasets.seasonRaw[s] = raw;
    }));
  }
  return loads;
}

// Carga las temporadas `names` que falten en datasets.seasonRaw; true si están todas.
export async function loadSeasons(datasets, names, load = ensureSeasonData) {
  const done = await Promise.all(names.map(async (name) => {
    if (datasets.seasonRaw[name]) return true;
    const raw = await load(name);
    if (raw) datasets.seasonRaw[name] = raw;
    return Boolean(raw);
  }));
  return done.every(Boolean);
}

async function showPrevious(section, ctx) {
  const panel = section.querySelector(`#${PREVIOUS_ID}`);
  const { group, match } = locate(ctx);
  if (!panel || !match) return;
  // innerHTML solo recibe Html de html``, que ya escapa cada dato (spec §5.1).
  panel.setAttribute('aria-busy', 'true');
  panel.innerHTML = String(html`<p class="pt-loading">Cargando temporadas anteriores…</p>`);
  await loadSeasons(ctx.datasets, pastSeasons(ctx.datasets.seasons, match.season));
  // Una respuesta lenta nunca pinta sobre otra pantalla.
  if (!panel.isConnected) return;
  panel.innerHTML = String(previousBlock(ctx, match, group));
  panel.removeAttribute('aria-busy');
}

function togglePrevious(section, ctx, button) {
  const panel = section.querySelector(`#${PREVIOUS_ID}`);
  if (!panel) return;
  const open = button.getAttribute('aria-expanded') === 'true';
  button.setAttribute('aria-expanded', String(!open));
  button.textContent = open ? 'Ver temporadas anteriores' : 'Ocultar temporadas anteriores';
  panel.hidden = open;
  if (!open && !panel.hasChildNodes()) showPrevious(section, ctx);
}

// Compartir (spec §4.2 A) con shareLink (links.js): navigator.share con el enlace al partido y,
// sin share o si falla, copiarlo; se dice en la región de estado (con el enlace, si no se pudo).
async function sharePartido(button, section) {
  const status = section.querySelector('.pt-share-status');
  const url = new URL(button.getAttribute('data-path'), window.location.href.split(/[?#]/)[0]).href;
  const outcome = await shareLink({ title: button.getAttribute('data-title'), text: button.getAttribute('data-text'), url });
  if (!status) return;
  if (outcome === 'copiado') status.textContent = 'Enlace copiado.';
  else if (outcome === 'no copiado') status.textContent = `No se pudo copiar el enlace: ${url}`;
}

export function mount(root, ctx) {
  const section = root && root.matches && root.matches('[data-screen="partido"]') ? root : root && root.querySelector('[data-screen="partido"]');
  if (!section) return;
  // Un solo manejador en la sección, que se va con ella al repintar. Atiende Compartir, el
  // desplegable de temporadas anteriores y su «Reintentar»; «‹» y el «Reintentar» de la pantalla
  // siguen hasta el router, que escucha en el documento.
  section.addEventListener('click', (event) => {
    const target = event.target && event.target.closest ? event.target.closest('[data-action]') : null;
    if (!target || !section.contains(target)) return;
    const action = target.getAttribute('data-action');
    const inPanel = Boolean(target.closest(`#${PREVIOUS_ID}`));
    if (action !== 'share' && action !== 'previous' && !(action === 'retry' && inPanel)) return;
    event.preventDefault();
    event.stopPropagation();
    if (action === 'share') sharePartido(target, section);
    else if (action === 'previous') togglePrevious(section, ctx, target);
    else showPrevious(section, ctx);
  });
}

export const screen = {
  id: 'partido',
  needs: (params, datasets) => partidoNeeds(params, datasets),
  render,
  mount,
};
```

**d) `acta.css`.** Todas las clases llevan el prefijo `pt-`, y el bloque no toca ninguna regla de B1; la cabecera es la de `screenHead` (Tarea 4).

Añadir al final de `acta.css`:

```css
/* ── Partido (spec §4.5) ──────────────────────────────────────────────── */

/* La cabecera es la de screenHead (Tarea 4). Bajo ella, la región que dice si
 * se copió el enlace: nunca display: none, o dejaría de anunciarse. */
.pt-main, .pt-aside { min-width: 0; }
.pt-share-status { font-size: 12.5px; font-weight: 600; color: var(--mute); text-align: right; }
.pt-share-status:not(:empty) { margin-top: 6px; }

/* Resultado: casillas, escudos de 46 px y marcador de 40 px. */
.pt-teams {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto minmax(0, 1fr);
  align-items: center;
  column-gap: 8px;
  padding: 14px 8px 12px;
}
.pt-team { display: flex; flex-direction: column; align-items: center; gap: 3px; min-width: 0; text-align: center; }
.pt-side { font-size: 12.5px; font-weight: 400; color: var(--mute); }
/* Nombre completo; si no cabe en dos líneas, cortado con elipsis (spec §3.5). */
.pt-name {
  display: -webkit-box;
  max-width: 100%;
  overflow: hidden;
  font-size: 15px;
  font-weight: 800;
  line-height: 1.25;
  overflow-wrap: anywhere;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
}
.pt-score { font-size: 40px; font-weight: 800; line-height: 1; white-space: nowrap; }
.pt-score.is-pending { font-weight: 600; color: var(--mute); }
.pt-penalties { padding: 8px 10px; font-size: 12.5px; font-weight: 700; color: var(--mute); text-align: center; }
.pt-tanda { white-space: nowrap; }

/* Goles: tres columnas (local | minuto y marcador | visitante) o dos listas. */
.pt-goals { width: 100%; border-collapse: collapse; table-layout: fixed; }
.pt-goals thead th { height: 0; padding: 0; border: 0; }
.pt-goals td { padding: 9px 10px; border-top: 1px solid var(--line); overflow-wrap: anywhere; }
.pt-goals tbody tr:first-child td { border-top: 0; }
.pt-g-home { text-align: right; font-weight: 700; }
.pt-g-away { text-align: left; font-weight: 700; }
.pt-g-mid { width: 88px; text-align: center; white-space: nowrap; }
.pt-goals td.pt-g-mid { border-right: 1px solid var(--rule); border-left: 1px solid var(--rule); }
.pt-g-min { font-size: 12.5px; font-weight: 400; color: var(--mute); }
.pt-g-score { font-weight: 800; }
.pt-noname { font-weight: 400; color: var(--mute); }
.pt-goals .pt-mine, .pt-glist.pt-mine li { color: var(--ink); }
.pt-glists { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); }
.pt-glist { min-width: 0; padding: 8px 10px 10px; }
.pt-glist + .pt-glist { border-left: 1px solid var(--rule); }
.pt-glist-head { overflow: hidden; font-size: 13.5px; font-weight: 800; text-overflow: ellipsis; white-space: nowrap; }
.pt-glist-head .pt-side { display: block; }
.pt-glist ul { margin: 4px 0 0; padding: 0; list-style: none; }
.pt-glist li { padding: 3px 0; font-weight: 700; }
.pt-glist-n { font-weight: 400; color: var(--mute); }
.pt-glist-none { margin-top: 4px; color: var(--mute); }

/* Alineaciones del acta: titulares y suplentes con dorsal y goles. */
.pt-lu-teams { display: grid; grid-template-columns: minmax(0, 1fr); }
.pt-lu-team { min-width: 0; padding: 10px 10px 12px; }
.pt-lu-team + .pt-lu-team { border-top: 1px solid var(--rule); }
.pt-lu-head { font-size: 15px; font-weight: 800; }
.pt-lu-head .pt-side { margin-right: 4px; }
.pt-lineup { width: 100%; margin-top: 6px; border-collapse: collapse; }
.pt-lineup th, .pt-lineup td { padding: 6px 4px; border-bottom: 1px solid var(--line); font-weight: 400; text-align: left; vertical-align: top; }
.pt-lineup thead th { padding-top: 0; border-bottom: 1.5px solid var(--ink); font-size: 11.5px; font-weight: 600; color: var(--mute); }
.pt-lineup .pt-player { overflow-wrap: anywhere; }
.pt-lineup .pt-dorsal { width: 38px; padding-right: 10px; color: var(--mute); text-align: right; }
.pt-lineup .pt-pgoals { width: 52px; font-weight: 800; color: var(--ink); text-align: right; }
.pt-lineup thead .pt-pgoals { font-weight: 600; color: var(--mute); }
.pt-lu-group th { padding-top: 10px; font-size: 12.5px; font-weight: 700; color: var(--mute); }
.pt-staff { margin-top: 8px; }
.pt-staff-label, .pt-none { color: var(--mute); }
.pt-lu-foot { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; column-gap: 12px; padding: 2px 10px; }
.pt-lu-foot .pt-staff { margin: 0; padding: 8px 0; }
.pt-acta { display: inline-flex; align-items: center; min-height: 44px; font-weight: 800; }

/* Cara a cara: el partido actual con el resalte propio, sin óvalo. */
.pt-h2h-row {
  display: grid;
  grid-template-columns: 78px minmax(0, 1fr) auto;
  align-items: center;
  column-gap: 8px;
  min-height: 44px;
  padding: 6px 10px;
  color: var(--text);
  text-decoration: none;
}
.box > .pt-h2h-row + .pt-h2h-row { border-top-color: var(--line); }
.pt-h2h-when { font-size: 12.5px; line-height: 1.3; color: var(--mute); }
.pt-h2h-teams { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.pt-h2h-score { font-weight: 800; white-space: nowrap; }
.pt-h2h-score.is-pending { font-weight: 600; color: var(--mute); }
.pt-h2h-row.is-current { background: var(--mark); color: var(--ink); font-weight: 800; box-shadow: inset 3px 0 0 var(--ink); }
.pt-h2h-row.is-current .pt-h2h-when { color: var(--ink); }
/* Nombre corto en móvil (spec §3.5); el completo, oculto a la vista, lo leen los lectores de pantalla. */
.pt-full { position: absolute; width: 1px; height: 1px; overflow: hidden; clip-path: inset(50%); white-space: nowrap; }
.pt-prev-toggle {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  min-height: 44px;
  margin-top: 8px;
  border: 1.5px solid var(--ink);
  font-weight: 700;
  color: var(--ink);
}
.pt-prev { margin-top: 10px; }
.pt-prev-head { margin: 12px 0 6px; font-size: 12.5px; font-weight: 700; color: var(--mute); }
.pt-prev-head:first-child { margin-top: 0; }
.pt-loading { color: var(--mute); }

/* Contexto: posición y últimos cinco de los dos, en una línea. */
.pt-context .cell-label { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.pt-context .cell-value { display: flex; flex-wrap: wrap; align-items: center; gap: 4px 8px; }
.pt-pos { white-space: nowrap; }

@media (hover: hover) {
  a.pt-h2h-row:hover .pt-h2h-teams { text-decoration: underline; }
}

@media (min-width: 1024px) {
  .pt-cols { display: grid; grid-template-columns: minmax(0, 3fr) minmax(0, 2fr); column-gap: 28px; align-items: start; }
  .pt-lu-teams { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .pt-lu-team + .pt-lu-team { border-top: 0; border-left: 1px solid var(--rule); }
  .pt-full { position: static; width: auto; height: auto; overflow: visible; clip-path: none; }
  .pt-short { display: none; }
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
cd /home/manolo/claude/futbol-base
node --test scripts/tests/test_rediseno_partido.mjs 2>&1 | grep -E '^# (tests|pass|fail)'
node --test scripts/tests/test_festate_fixes.mjs 2>&1 | grep -E '^# fail'
```
Esperado:
```text
# tests 17
# pass 17
# fail 0
# fail 0
```

- [ ] **Step 5: Verificación visual (Chrome, fuera del repo)**

La vista previa monta la pantalla en el navegador con `acta.css`, las fixtures congeladas y el `createModel` real. Se sirve desde memoria:
- `/escudos/s/<x>.png` responde con el original, como las miniaturas de B4;
- `/data-season-2024-2025.js` se construye con la fixture `historical-2024-2025`.

Mide el desplazamiento horizontal, el `h1`, la altura de lo pulsable, las imágenes rotas, el marcador de 40 px y si la barra tapa el final. Después prueba `mount` con un `nav` falso:
- «Ver temporadas anteriores», con un fallo y su «Reintentar» en el sitio, sin repintar la pantalla;
- una respuesta lenta mientras se navega a otra pantalla;
- *Compartir*, sin `navigator.share`: copia el enlace;
- «‹» y el «Reintentar» de una caja de error llegan al documento sin que la pantalla los detenga: los atiende el router.

```bash
cd /home/manolo/claude/futbol-base
S=/tmp/claude-1000/-home-manolo/db6fd8e0-f1e7-4e94-b6cd-ef7dd5bf6ae9/scratchpad/planB2
mkdir -p "$S"
cat > "$S/partido-preview.mjs" <<'EOF'
// Vista previa de la Tarea 11 de B2: la pantalla Partido con acta.css y las fixtures congeladas.
// Uso, desde la raíz del repo (con Playwright en node_modules, Tarea 4): OUT=<dir> node <este fichero>
// No escribe en el repo: sirve la página desde memoria; /escudos/s/<x>.png responde con el original
// escudos/<x>.png|.jpg (simula las miniaturas de B4) y /data-season-2024-2025.js se construye con la
// fixture historical-2024-2025 (lo que carga «Ver temporadas anteriores»).
import { createServer } from 'node:http';
import { createRequire } from 'node:module';
import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import { extname, join, normalize, sep } from 'node:path';
import { pathToFileURL } from 'node:url';

const out = process.env.OUT;
if (!out) { console.error('Falta OUT=<directorio de capturas>'); process.exit(2); }
mkdirSync(out, { recursive: true });
const root = process.cwd();
const FIX = join(root, 'scripts/tests/fixtures/rediseno');
const { findChrome } = await import(pathToFileURL(join(root, 'scripts/tests/render-smoke.mjs')).href);
const { waitForAsync } = await import(pathToFileURL(join(root, 'scripts/tests/browser-wait.mjs')).href);
const { chromium } = createRequire(join(root, 'scripts/tests/x.mjs'))('playwright');

const CASES = {
  'pg2-j15': { s: '2025-2026', g: 'PG2', r: 'Jornada 15', h: 'AD Huracán', a: 'Las Mesas Hu.' },
  'pg2-j30': { s: '2025-2026', g: 'PG2', r: 'Jornada 30', h: 'Las Mesas Hu.', a: 'AD Huracán' },
  'a1-j1': { s: '2025-2026', g: 'A1', r: 'Jornada 1', h: 'Guayarmina', a: 'Santidad' },
  'a1-j3': { s: '2025-2026', g: 'A1', r: 'Jornada 3', h: 'Unión Viera', a: 'Santidad' },
  'a1-j11': { s: '2025-2026', g: 'A1', r: 'Jornada 11', h: 'Moya', a: 'Guayarmina' },
  mcpk1: { s: '2025-2026', g: 'MCPK1', r: '27-06-2026 ( Cuartos )', h: 'UD Las Mesas Huracán', a: 'CF Unión Carrizal' },
  error: { s: '2025-2026', g: 'A1', r: 'Jornada 1', h: 'Guayarmina', a: 'Santidad', noDetail: true },
};

const page = () => `<!DOCTYPE html><html lang="es"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1"><title>Vista previa Partido</title>
<link rel="stylesheet" href="/acta.css"></head><body><a class="skip-link" href="#contenido">Saltar al contenido</a>
<main id="contenido" class="page"></main>
<script type="module">
import { createModel } from '/src/model.js';
import { screen } from '/src/screen-partido.js';
import { tabbar, crestFallback } from '/src/ui.js';
document.addEventListener('error', (e) => crestFallback(e.target), true);
const CASES = ${JSON.stringify(CASES)};
const c = CASES[new URLSearchParams(location.search).get('case')];
const load = (n) => fetch('/__fixtures/' + n + '.json').then((r) => r.json());
const [cur, cups, md, lu, shields, health] = await Promise.all(
  ['current-2025-2026', 'cups-2025-2026', 'matchdetail', 'lineups-2025-2026', 'shields', 'health'].map(load));
const datasets = { benjamin: cur.benjamin, prebenjamin: cur.prebenjamin, history: cur.history, golBenj: [], golPrebenj: [],
  shields, seasons: [{ name: '2025-2026', current: true }, { name: '2024-2025', current: false }],
  cupBenjamin: cups.benjamin, cupPrebenjamin: cups.prebenjamin, seasonRaw: {},
  matchDetail: c.noDetail ? null : md, lineups: { '2025-2026': lu }, health };
const portal = { season: '2025-2026', defaultTeam: { cat: 'prebenjamin', groupId: 'PG2', name: 'Las Mesas Hu.' } };
const model = createModel(datasets, { portalSeason: portal.season });
const resolution = { status: 'ok', group: model.group('2025-2026', 'PG2'), name: 'Las Mesas Hu.', cat: 'prebenjamin' };
const params = { s: c.s, g: c.g, r: c.r, h: c.h, a: c.a };
const ctx = { route: { screen: 'partido', params }, params, model, myTeam: { ...portal.defaultTeam, season: portal.season },
  resolution, today: '2026-09-23', health, datasets, portal, lastPrimary: 'miequipo' };
const main = document.getElementById('contenido');
main.insertAdjacentHTML('beforebegin', String(tabbar('miequipo', { current: 'true' })));
main.innerHTML = String(screen.render(ctx));
window.__nav = [];
screen.mount(main, ctx, { back: () => __nav.push('back'), retry: () => __nav.push('retry'), go() {}, replace() {}, saveMyTeam() {} });
window.__ready = true;
</script></body></html>`;

const hist = JSON.parse(readFileSync(join(FIX, 'historical-2024-2025.json'), 'utf8'));
const season2425 = `const SEASON_2024_2025=${JSON.stringify({ name: '2024-2025', current: false, benjamin: hist.benjamin, prebenjamin: hist.prebenjamin })};\n`;
let failSeasons = false;
let slowSeasons = false;
const MIME = { '.css': 'text/css', '.js': 'text/javascript', '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg', '.woff2': 'font/woff2' };
const server = createServer((req, res) => {
  const url = new URL(req.url, 'http://x');
  if (url.pathname === '/__preview.html') { res.setHeader('Content-Type', 'text/html; charset=utf-8'); return res.end(page()); }
  if (url.pathname === '/__fail-seasons') { failSeasons = url.searchParams.get('on') === '1'; return res.end('ok'); }
  if (url.pathname === '/__slow-seasons') { slowSeasons = url.searchParams.get('on') === '1'; return res.end('ok'); }
  if (url.pathname === '/data-season-2024-2025.js') {
    if (failSeasons) { res.statusCode = 503; return res.end('no'); }
    res.setHeader('Content-Type', 'text/javascript');
    return slowSeasons ? setTimeout(() => res.end(season2425), 1200) : res.end(season2425);
  }
  let fp = normalize(join(root, decodeURIComponent(url.pathname)));
  const fixtureFile = url.pathname.match(/^\/__fixtures\/([\w-]+)\.json$/);
  if (fixtureFile) fp = join(FIX, `${fixtureFile[1]}.json`);
  const thumb = url.pathname.match(/^\/escudos\/s\/(.+)\.png$/);
  if (thumb) fp = ['png', 'jpg'].map((x) => join(root, 'escudos', `${decodeURIComponent(thumb[1])}.${x}`)).find(existsSync) || fp;
  if (!fp.startsWith(root + sep) || !existsSync(fp)) { res.statusCode = 404; return res.end('no'); }
  res.setHeader('Content-Type', MIME[extname(fp)] || 'application/octet-stream');
  res.end(readFileSync(fp));
}).listen(0, '127.0.0.1');
await new Promise((resolve) => server.once('listening', resolve));
const origin = `http://127.0.0.1:${server.address().port}`;
const base = `${origin}/__preview.html`;

const browser = await chromium.launch({ executablePath: findChrome() });
const problems = [];
// ¿Llega el clic al documento sin que la pantalla lo detenga (lo que atiende el router)? El enlace
// no navega: la escucha del documento lo impide después de mirar.
const reachesRouter = (page, selector) => page.evaluate((sel) => new Promise((resolve) => {
  document.addEventListener('click', (event) => {
    const passed = !event.defaultPrevented;
    event.preventDefault();
    resolve(passed ? 'router' : 'pantalla');
  }, { once: true });
  document.querySelector(sel).click();
}), selector);
async function open(ctx, id) {
  const p = await ctx.newPage();
  p.on('pageerror', (e) => problems.push(`${id}: ${e.message}`));
  await p.goto(`${base}?case=${id}`, { waitUntil: 'networkidle' });
  await waitForAsync(p, () => window.__ready === true);
  return p;
}
const SHOTS = [
  [390, 'light', ['pg2-j15', 'pg2-j30', 'a1-j1', 'a1-j3', 'a1-j11', 'mcpk1', 'error']],
  [390, 'dark', ['pg2-j15', 'a1-j1', 'mcpk1']],
  [320, 'light', ['pg2-j15', 'a1-j1', 'mcpk1']],
  [1440, 'light', ['pg2-j15', 'a1-j1']],
];
for (const [w, scheme, ids] of SHOTS) {
  const ctx = await browser.newContext({ viewport: { width: w, height: w > 1000 ? 900 : 844 }, colorScheme: scheme, reducedMotion: 'reduce' });
  for (const id of ids) {
    const p = await open(ctx, id);
    const m = await p.evaluate(() => {
      const bar = document.querySelector('.tabbar');
      window.scrollTo(0, document.documentElement.scrollHeight);
      const last = document.querySelector('main').lastElementChild.getBoundingClientRect();
      const covered = getComputedStyle(bar).position === 'fixed' && last.bottom > bar.getBoundingClientRect().top + 0.5;
      window.scrollTo(0, 0);
      const screen = document.querySelector('[data-screen="partido"]');
      return {
        overflow: document.documentElement.scrollWidth - innerWidth,
        h1: document.querySelectorAll('h1').length,
        small: [...screen.querySelectorAll('a, button')].filter((e) => e.offsetParent !== null)
          .map((e) => [e.className || e.tagName, Math.round(e.getBoundingClientRect().height)]).filter(([, px]) => px < 44),
        broken: [...document.images].filter((i) => !i.naturalWidth).map((i) => i.getAttribute('src')),
        score: getComputedStyle(document.querySelector('.pt-score')).fontSize,
        covered,
      };
    });
    console.log(`${w}px ${scheme} ${id}:`, JSON.stringify(m));
    if (m.overflow > 0) problems.push(`${w}px ${id}: desplazamiento horizontal de ${m.overflow}px`);
    if (m.h1 !== 1) problems.push(`${w}px ${id}: ${m.h1} h1`);
    if (m.small.length) problems.push(`${w}px ${id}: pulsables de menos de 44px: ${JSON.stringify(m.small)}`);
    if (m.broken.length) problems.push(`${w}px ${id}: imágenes rotas: ${m.broken.join(', ')}`);
    if (m.score !== '40px') problems.push(`${w}px ${id}: marcador de ${m.score}`);
    if (m.covered) problems.push(`${w}px ${id}: la barra tapa el final del contenido`);
    await p.screenshot({ path: `${out}/partido-${w}-${scheme}-${id}.png`, fullPage: true });
    await p.close();
  }
  await ctx.close();
}

// Comportamiento (mount) a 390 px: temporadas anteriores (con un fallo y su «Reintentar»), compartir y volver.
{
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' });
  await ctx.grantPermissions(['clipboard-read', 'clipboard-write'], { origin });
  const p = await open(ctx, 'pg2-j30');
  await p.request.get(`${origin}/__fail-seasons?on=1`);
  await p.click('[data-action="previous"]');
  await waitForAsync(p, () => !!document.querySelector('#partido-anteriores [data-action="retry"]'));
  const failed = await p.evaluate(() => {
    const panel = document.querySelector('#partido-anteriores');
    return {
      expanded: document.querySelector('[data-action="previous"]').getAttribute('aria-expanded'),
      box: panel.textContent.includes('No se pudieron cargar los datos de las temporadas anteriores'),
      retry: panel.querySelectorAll('[data-action="retry"]').length,
    };
  });
  console.log('anteriores con fallo:', JSON.stringify(failed));
  if (failed.expanded !== 'true' || !failed.box || failed.retry !== 1) problems.push('anteriores: sin caja de error al fallar');
  await p.request.get(`${origin}/__fail-seasons?on=0`);
  await p.click('#partido-anteriores [data-action="retry"]');
  await waitForAsync(p, () => !!document.querySelector('#partido-anteriores .pt-prev-head'));
  const loaded = await p.evaluate(() => ({
    text: document.querySelector('#partido-anteriores').textContent.replace(/\s+/g, ' ').trim().slice(0, 120),
    rows: document.querySelectorAll('#partido-anteriores .pt-h2h-row').length,
    nav: window.__nav.slice(),
  }));
  console.log('anteriores tras reintentar:', JSON.stringify(loaded));
  if (loaded.rows !== 2 || !loaded.text.startsWith('2024/25 · Prebenjamín, Grupo 2 de Gran Canaria')) problems.push('anteriores: no aparecen los dos partidos de PGC2 2024-25');
  if (loaded.nav.length) problems.push('anteriores: el «Reintentar» del desplegable repintó la pantalla entera');
  const box = await p.locator('#partido-anteriores').boundingBox();
  await p.screenshot({ path: `${out}/partido-390-light-anteriores.png`, clip: { x: 0, y: Math.max(0, box.y - 260), width: 390, height: box.height + 300 }, fullPage: true });
  await p.click('[data-action="previous"]');
  const hidden = await p.evaluate(() => document.querySelector('#partido-anteriores').hidden);
  if (!hidden) problems.push('anteriores: no se pliega');
  await p.click('[data-action="share"]');
  await waitForAsync(p, () => document.querySelector('.pt-share-status').textContent !== '');
  const shared = await p.evaluate(async (from) => ({
    status: document.querySelector('.pt-share-status').textContent,
    clip: (await navigator.clipboard.readText()).replace(from, ''),
  }), origin);
  console.log('compartir:', JSON.stringify(shared));
  if (shared.status !== 'Enlace copiado.' || shared.clip !== '/__preview.html#/partido?s=2025-2026&g=PG2&r=Jornada%2030&h=Las%20Mesas%20Hu.&a=AD%20Hurac%C3%A1n') problems.push('compartir: no copia el enlace del partido');
  // «‹» es del router: el clic llega al documento sin que la pantalla lo detenga.
  const back = await reachesRouter(p, '[data-action="back"]');
  console.log('volver:', JSON.stringify(back));
  if (back !== 'router') problems.push('volver: la pantalla se queda el clic de «‹», que es del router');
  await p.close();
  // Respuesta lenta mientras se navega a otra pantalla: nunca pinta sobre ella.
  const slow = await open(ctx, 'pg2-j15');
  await slow.request.get(`${origin}/__slow-seasons?on=1`);
  await slow.click('[data-action="previous"]');
  await slow.evaluate(() => { document.getElementById('contenido').innerHTML = '<section data-screen="jornada"><h1>Jornada</h1></section>'; });
  await slow.waitForTimeout(1800);
  const after = await slow.evaluate(() => document.getElementById('contenido').innerHTML);
  console.log('respuesta lenta tras navegar:', JSON.stringify(after));
  if (after !== '<section data-screen="jornada"><h1>Jornada</h1></section>') problems.push('anteriores: una respuesta lenta pintó sobre otra pantalla');
  await slow.request.get(`${origin}/__slow-seasons?on=0`);
  await slow.close();
  // El «Reintentar» de un bloque también es del router: vuelve a pedir los datos y a pintar.
  const e = await open(ctx, 'error');
  const retried = await reachesRouter(e, '[data-action="retry"]');
  console.log('reintentar:', JSON.stringify(retried));
  if (retried !== 'router') problems.push('reintentar: la pantalla se queda el clic de «Reintentar», que es del router');
  await ctx.close();
}
await browser.close();
server.close();
console.log(problems.length ? 'PROBLEMAS:\n' + problems.join('\n') : `OK: sin errores; capturas en ${out}/partido-*.png`);
process.exit(problems.length ? 1 : 0);
EOF
OUT="$S/shots-t11" node "$S/partido-preview.mjs"
```
Esperado:
```text
390px light pg2-j15: {"overflow":0,"h1":1,"small":[],"broken":[],"score":"40px","covered":false}
390px light pg2-j30: {"overflow":0,"h1":1,"small":[],"broken":[],"score":"40px","covered":false}
390px light a1-j1: {"overflow":0,"h1":1,"small":[],"broken":[],"score":"40px","covered":false}
390px light a1-j3: {"overflow":0,"h1":1,"small":[],"broken":[],"score":"40px","covered":false}
390px light a1-j11: {"overflow":0,"h1":1,"small":[],"broken":[],"score":"40px","covered":false}
390px light mcpk1: {"overflow":0,"h1":1,"small":[],"broken":[],"score":"40px","covered":false}
390px light error: {"overflow":0,"h1":1,"small":[],"broken":[],"score":"40px","covered":false}
390px dark pg2-j15: {"overflow":0,"h1":1,"small":[],"broken":[],"score":"40px","covered":false}
390px dark a1-j1: {"overflow":0,"h1":1,"small":[],"broken":[],"score":"40px","covered":false}
390px dark mcpk1: {"overflow":0,"h1":1,"small":[],"broken":[],"score":"40px","covered":false}
320px light pg2-j15: {"overflow":0,"h1":1,"small":[],"broken":[],"score":"40px","covered":false}
320px light a1-j1: {"overflow":0,"h1":1,"small":[],"broken":[],"score":"40px","covered":false}
320px light mcpk1: {"overflow":0,"h1":1,"small":[],"broken":[],"score":"40px","covered":false}
1440px light pg2-j15: {"overflow":0,"h1":1,"small":[],"broken":[],"score":"40px","covered":false}
1440px light a1-j1: {"overflow":0,"h1":1,"small":[],"broken":[],"score":"40px","covered":false}
anteriores con fallo: {"expanded":"true","box":true,"retry":1}
anteriores tras reintentar: {"text":"2024/25 · Prebenjamín, Grupo 2 de Gran CanariaJ6, 30 novLas Mesas Hu. – AD HuracánLas Mesas Hu. – Huracán1–7J17, 1 marAD","rows":2,"nav":[]}
compartir: {"status":"Enlace copiado.","clip":"/__preview.html#/partido?s=2025-2026&g=PG2&r=Jornada%2030&h=Las%20Mesas%20Hu.&a=AD%20Hurac%C3%A1n"}
volver: "router"
respuesta lenta tras navegar: "<section data-screen=\"jornada\"><h1>Jornada</h1></section>"
reintentar: "router"
OK: sin errores; capturas en /tmp/claude-1000/-home-manolo/db6fd8e0-f1e7-4e94-b6cd-ef7dd5bf6ae9/scratchpad/planB2/shots-t11/partido-*.png
```

Abrir con Read las capturas de `$S/shots-t11/` y la maqueta `/home/manolo/backups/futbol-base/rediseno-2026-09-23/maquetas/5-3-partido.png`, y comprobar:
- **`partido-390-light-pg2-j15.png` frente a la maqueta** (es el mismo partido, AD Huracán 8–1 Las Mesas Hu.):
  - **Cabecera:** «‹», «Partido», «Jornada 15 · Prebenjamín, Grupo 2 de Gran Canaria» y *Compartir* subrayado, sobre una regla de tinta de lado a lado.
  - **Resultado:** Fecha «jue 12 feb», Hora «17:30» y Campo «no publicado» en gris; escudos de 46 px con «Local» y «Visitante»; «8–1» a 40 px.
  - **Goles:** 9 filas en tres columnas, con el minuto en gris y el parcial en negrita; «Yadiel» (mi equipo) en tinta en la columna del visitante.
  - **Alineaciones:** el vacío de borde discontinuo.
  - **Cara a cara:** J15 resaltada (fondo rosado, tinta 800 y barra de 3 px; **ningún óvalo**) y J30 normal, con nombres cortos («Huracán – Las Mesas Hu.»). Debajo, «Ver temporadas anteriores».
  - **Contexto:** «3.º» y «9.º» con sus cinco círculos.
  - **Diferencias que decide la spec:** la etiqueta lleva «Prebenjamín,» (etiqueta de grupo, §5.3); el vacío lleva el texto de §4.5; el cara a cara va con nombres cortos en móvil (§3.5) y el partido actual resaltado (§4.5); su contexto es «esta temporada» (todos los grupos de liga de la categoría; en PG2, solo PG2).
- **`partido-390-dark-*.png`:** tokens oscuros, texto claro, círculos P claros; nada ilegible.
- **`partido-1440-light-*.png`:** dos columnas. A la izquierda, Resultado, Goles y Alineaciones, con los dos equipos del acta lado a lado; a la derecha, Cara a cara y Contexto, con los nombres completos.
- **`partido-390-light-a1-j1.png`:** la cronología de 12 goles y las alineaciones:
  - titulares y suplentes por dorsal, con los goles en tinta a la derecha;
  - «Entrenador/a: no consta», «Árbitro/a: Armiche Jesús Tacoronte Mendoza» y «Ver acta oficial».
- **`partido-390-light-a1-j3.png`:** bajo la cronología, «**Los goles no cuadran con el marcador:** la cronología de futbolaspalmas suma 13–2 y el resultado de futbolaspalmas es 14–1.»
- **`partido-390-light-a1-j11.png`:**
  - la lista del acta, con cada goleador una vez, sus goles entre paréntesis y los minutos que da el acta («Liam Garcia Larsen (4) 2', 32'»);
  - la nota «El acta no da el minuto de todos los goles, así que no hay marcador parcial.»
- **`partido-390-light-mcpk1.png` y `partido-320-light-mcpk1.png`:**
  - «UD Las Mesas Huracán pasó por penaltis (3–2)», sin partir «(3–2)»;
  - sin Alineaciones ni Contexto;
  - en el cara a cara, «Cuartos, 27 jun» sin pisar los nombres; a 320 px puede ocupar dos líneas;
  - los nombres largos, en dos líneas como mucho y con elipsis.
- **`partido-390-light-error.png`:** la caja de error en Goles, con «Reintentar», y el resto de la pantalla pintado.
- **`partido-390-light-anteriores.png`:** «2024/25 · Prebenjamín, Grupo 2 de Gran Canaria» con J6 (1–7) y J17 (9–0), y el botón ya como «Ocultar temporadas anteriores».

En las capturas de página completa, la barra fija aparece donde terminaba la ventana: es un efecto de `fullPage`, no un fallo.

- [ ] **Step 6: Suites completas y los tres smoke**

```bash
cd /home/manolo/claude/futbol-base
python3 -m pytest scripts/tests/ -q 2>&1 | tail -1
node --test scripts/tests/test_*.mjs 2>&1 | grep -E '^# (tests|pass|fail)'
```
Esperado:
- **pytest:** el mismo recuento que al terminar la tarea anterior, sin `failed`. Esta tarea no añade pruebas de Python.
- **node:** el recuento anterior más 17, sin fallos (`# fail 0`). `test_rediseno_modulos.mjs` (Tarea 4) cubre el módulo nuevo: no toca el DOM al importarse y sus `import` son planos y estáticos; `test_data_globals_contract.mjs` recorre todo `src/`, y `screen-partido.js` no tiene ningún `typeof X !== 'undefined'`.

Los tres smoke, igual que al terminar la tarea anterior: esta tarea no conecta la pantalla al router, que es de la Tarea 12.

```bash
cd /home/manolo/claude/futbol-base
node scripts/tests/render-smoke.mjs
node scripts/tests/interaction-smoke.mjs
node scripts/tests/pwa-smoke.mjs 2>&1 | grep -v '^PWA fixture HTTP 404 /escudos/s/'
```
Esperado, con el tamaño del DOM del día:
```text
PASS: render smoke OK — Mi equipo en estado D (DOM 12177 bytes)
PASS: la portada carga a 320px en claro, sin desplazamiento horizontal
PASS: la portada carga a 320px en oscuro, sin desplazamiento horizontal
PASS: la portada carga a 390px en claro, sin desplazamiento horizontal
PASS: la portada carga a 390px en oscuro, sin desplazamiento horizontal
PASS: la portada carga a 768px en claro, sin desplazamiento horizontal
PASS: la portada carga a 768px en oscuro, sin desplazamiento horizontal
PASS: la portada carga a 1440px en claro, sin desplazamiento horizontal
PASS: la portada carga a 1440px en oscuro, sin desplazamiento horizontal
PASS: de la app anterior (su SW real) al rediseño, con datos congelados: la 1.ª apertura es la anterior; sin conexión a medias, el aviso con «Reintentar»; la 2.ª y la 3.ª, la nueva con acta.css y sin mezclar módulos; futbolbase-v20991231a funciona sin conexión
```

- [ ] **Step 7: Commit**

```bash
cd /home/manolo/claude/futbol-base
git add src/screen-partido.js src/model.js src/state.js acta.css scripts/tests/test_rediseno_partido.mjs scripts/tests/test_festate_fixes.mjs
git commit -F - <<'EOF'
feat(rediseño): pantalla Partido (B2, tarea 11)

Resultado con fecha, hora y campo, escudos, marcador de 40 px y «pasó
por penaltis» con la tanda. Goles de timelineFor: tres columnas con la
cronología de futbolaspalmas o la lista de goleadores del acta, sin
marcador parcial si faltan minutos, y el aviso con las dos cifras y su
procedencia si no cuadran. Alineaciones del acta con dorsal y goles,
entrenadores, árbitro y «Ver acta oficial». Cara a cara del grupo con
el partido resaltado y las temporadas anteriores bajo demanda, y
contexto con la posición y la forma de los dos. Cada fichero perezoso
que falla pinta la caja de su bloque con «Reintentar» y el resto sigue.

- model.js: actaFor, el acta del partido con el criterio de
  timelineFor.
- state.js: ensureLineups da {} si no existe el fichero (404), porque
  generate_js.py solo lo escribe cuando la temporada tiene actas.
- test_rediseno_partido: PG2 del 02/06/2026 sin cronología y con el
  cara a cara solo de PG2, A1 con acta, marcador distinto, MCPK1 por
  penaltis, fallos de carga y la hoja.

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01Sg56KK3oZgo8Ye7Snj6wG9
EOF
git show --stat --oneline HEAD | tail -1
```
Esperado: `6 files changed`, con los seis ficheros del `git add`.

---

### Task 12: Integración: rutas completas, mi equipo guardado, escudos, aviso sin conexión en vivo y sesión (spec §4.1, §4.2, §4.10, §5.4 y §6)

Se registran las pantallas de B2 y se cablea en `app.js` lo que une las piezas: el almacén, la cadena de los escudos, la conexión y la sesión.

**Contexto**
- **Rutas completas.** `screens.js` registra Mi equipo, Jornada, Tabla y Partido (Tareas 7-11); las nueve rutas de B3 siguen con la provisional (decisión 6). `sw.js` precachea los tres módulos nuevos del grafo.
- **Mi equipo al arrancar** (decisión 12 de B1, con la A2 de la revisión adversarial). Si la resolución cambia de fase sin preguntar (FF5 → A2, en la misma temporada), `app.js` lo guarda antes del primer pintado. Un cambio de temporada (el paso 1) **nunca se guarda solo**: se vuelve a resolver en cada carga hasta que la familia lo confirma, respondiendo a E o con «Hacer mi equipo». `myTeamToSave(myTeam, resolution)` (nuevo en `myteam.js`) es `updatedMyTeam` solo dentro de la misma temporada. Así, si la federación publica 2026/27 por partes y el primer día solo existe el prebenjamín de Gran Canaria, el paso 1 da PG2 en silencio y no lo guarda; cuando llega el benjamín con «Las Mesas Hu.» y «Las Mesas B», la carga siguiente pregunta (caso 3 de §11), y la respuesta se guarda y se respeta.
- **Sin los datos inmediatos** (M4 de la revisión). Si falta `data-benjamin.js`, `data-prebenjamin.js` o `data-history.js` (`readGlobals` los da en `null`: un precache a medias y sin conexión, por ejemplo), `start` pinta la caja de error de §7, «No se pudieron cargar los datos de la temporada 2025/26», con «Reintentar», que recarga la página; no resuelve ni guarda mi equipo, y el router no arranca. Nunca un X ni un B falsos.
- **Respuesta a E y «Hacer mi equipo».** Las pantallas llaman a `nav.saveMyTeam({ name, season, cat, groupId })`. `app.js` lo guarda con `saveStore` (si el almacenamiento falla, queda en memoria para la sesión) y el router vuelve a pintar la ruta.
- **Escudos** (§5.4). `escudos/s/` no existe hasta B4: cada miniatura da 404. `start(doc, win)` instala `doc.addEventListener('error', …crestFallback…, true)` antes del primer pintado, como desde el corte. Los errores de `<img>` no burbujean, así que se escuchan en captura: miniatura → original → monograma.
- **Aviso sin conexión en vivo** (§4.10). `app.js` rellena `.shell-offline` con `offlineNotice` cuando `navigator.onLine` es falso y lo vacía al volver la conexión (eventos `online` y `offline`). La fecha es `lastDataChange` de `ensureHealth()` o, mientras no llega, la del literal «Última actualización» de `index.html`.
- **Sesión.** El último destino principal, que marca la barra en Partido, se guarda en `sessionStorage` (`futbol-base:destino`, vía `safeStorage`): una ficha de partido recargada conserva su destino, y con el almacenamiento bloqueado queda en memoria.
- **Ninguna prueba depende de `src/config.js`** (R2-1 de la segunda ronda de la revisión). El día que se active 2026/27, `activate_season.py` cambia la temporada de `config.js`, y el bot ejecuta las pruebas de Node antes de comitear: si una leyera `config.js`, se pararía en rojo en silencio. El router ya pasa a `needs` la temporada del portal del contexto (Tarea 6), que en la app es la de la `config` que recibe `start`. `test_rediseno_config.mjs` ejecuta todas las demás pruebas de Node con un `config.js` de 2026/27, con Las Mesas en otro grupo, que sirve un hook de carga de Node (`module.register`), y tienen que salir en verde igual.
- `app.js` es el punto de entrada: `start(document, window)` lo llama `index.html`. Su conducta se prueba en Node, con `start` de verdad sobre un navegador falso y un almacén en memoria (el guardado al arrancar, la activación por partes, los datos que faltan y los enlaces que el router deja pasar, con las pantallas reales), y en Chrome (paso 6 y Tarea 13); el orden de su cableado, en el código. Para las pruebas, `start` acepta un tercer argumento con el `PORTAL` (una temporada simulada).

**Files:**
- Modify: `src/myteam.js` (añade `myTeamToSave` al final), `src/screens.js` (entero), `src/app.js` (entero) y `sw.js` (`STATIC_ASSETS`).
- Test: `scripts/tests/test_rediseno_integracion.mjs` y `scripts/tests/test_rediseno_config.mjs` (nuevos), con el hook de `scripts/tests/fixtures/config-2026-2027/` (`hooks.mjs` y `register.mjs`).

**Interfaces:**
- Consumes:
  - `screen` de `screen-jornada.js`, `screen-tabla.js` y `screen-partido.js` (Tareas 9-11), y de `screen-home.js` (Tareas 7 y 8), con E pintando un botón por candidato que llama a `nav.saveMyTeam`.
  - `ensureHealth()` (`state.js`, Tarea 2); `saveStore`, `safeStorage` y `STORE_KEY` (`store.js`); `crestFallback` (`ui.js`); `offlineNotice`, `errorScreen` y `routeTitle` (`shell.js`); `parseRoute` (`links.js`); `seasonLabel` (`model.js`); `updatedMyTeam` (`myteam.js`); `startRouter({ …, actions, session })` (Tarea 6).
- Produces:

```js
// myteam.js
export function myTeamToSave(myTeam, resolution)
  // → { name, season, cat, groupId } | null: updatedMyTeam solo si es de la misma temporada (un cambio
  //   de fase); un cambio de temporada, nunca (A2 de la revisión)
// app.js
export function start(doc, win, config = PORTAL)   // config: otro PORTAL, en las pruebas; → el router, o null
  //   sin los datos inmediatos (entonces pinta la caja de error y «Reintentar» recarga)
// screens.js
export const SCREEN_MAP   // '' → home, jornada, tabla, partido; las nueve de B3 → pendiente
```

- [ ] **Step 1: Write the failing test**

Crear `scripts/tests/test_rediseno_integracion.mjs`:

```js
// Plan B2, tarea 12: integración (spec §4.1, §4.2, §4.10, §5.4 y §6). Rutas y barra completas,
// mi equipo guardado al arrancar solo con un cambio de fase (A2 de la revisión adversarial) y el
// cableado de app.js: escudos, aviso sin conexión, sesión y «Hacer mi equipo». start() se ejecuta
// de verdad sobre un navegador falso y un almacén en memoria: el guardado al arrancar, la
// activación de 2026/27 por partes (§11, caso 3), los datos inmediatos que faltan y los enlaces
// que el router deja pasar porque la pantalla los sabe leer.
import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { fixture } from './fixtures/rediseno/load.mjs';
import { currentAt, nextSeasonRaw, teamNames } from './fixtures/rediseno/simulate.mjs';
import { buildSeason } from '../../src/model.js';
import { buildClubIndex, resolveMyTeam, myTeamToSave } from '../../src/myteam.js';
import { SCREENS } from '../../src/links.js';
import { STORE_KEY } from '../../src/store.js';
import { SCREEN_MAP } from '../../src/screens.js';
import { start } from '../../src/app.js';
import { screen as home } from '../../src/screen-home.js';
import { screen as jornada } from '../../src/screen-jornada.js';
import { screen as tabla } from '../../src/screen-tabla.js';
import { screen as partido } from '../../src/screen-partido.js';
import { screen as pendiente } from '../../src/screen-pendiente.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const shields = fixture('shields');
const raw = fixture('current-2025-2026');
const real = buildSeason({ name: raw.season, current: true, ...raw });
const index = buildClubIndex(teamNames(real), shields);
const PG2 = { name: 'Las Mesas Hu.', season: '2025-2026', cat: 'prebenjamin', groupId: 'PG2' };
const DEFAULT_TEAM = { cat: 'prebenjamin', groupId: 'PG2', name: 'Las Mesas Hu.' };
const PORTAL_2526 = { season: '2025-2026', nextSeason: '2026-2027', defaultTeam: DEFAULT_TEAM, timeZone: 'Atlantic/Canary' };
const PORTAL_2627 = { season: '2026-2027', nextSeason: '2027-2028', defaultTeam: DEFAULT_TEAM, timeZone: 'Atlantic/Canary' };

test('rutas completas: las cuatro pantallas de B2 y la provisional en las nueve de B3', () => {
  assert.deepEqual(Object.keys(SCREEN_MAP).sort(), [...SCREENS].sort());
  assert.equal(SCREEN_MAP[''], home);
  assert.equal(SCREEN_MAP.jornada, jornada);
  assert.equal(SCREEN_MAP.tabla, tabla);
  assert.equal(SCREEN_MAP.partido, partido);
  assert.deepEqual([home, jornada, tabla, partido].map((s) => s.id), ['home', 'jornada', 'tabla', 'partido']);
  assert.deepEqual(SCREENS.filter((name) => SCREEN_MAP[name] === pendiente),
    ['explorar', 'equipo', 'ligas', 'copa', 'goleadores', 'temporadas', 'records', 'fuentes', 'ajustes']);
});

test('myTeamToSave: el cambio de fase (FF5 → A2, decisión 12 de B1) sí; nada si no cambia', () => {
  const ff5 = { name: 'Las Mesas Hu.', season: '2025-2026', cat: 'benjamin', groupId: 'FF5' };
  const moved = resolveMyTeam(ff5, real, index, '2026-09-23');
  assert.deepEqual(myTeamToSave(ff5, moved), { name: 'Las Mesas Hu.', season: '2025-2026', cat: 'benjamin', groupId: 'A2' });
  assert.equal(myTeamToSave(PG2, resolveMyTeam(PG2, real, index, '2026-09-23')), null);
  assert.equal(myTeamToSave(PG2, { status: 'absent' }), null);
});

test('myTeamToSave: un cambio de temporada nunca se guarda solo, con una categoría o con las dos (A2 de la revisión)', () => {
  const at = (groups) => {
    const next = buildSeason({ name: '2026-2027', current: true, ...nextSeasonRaw(groups) });
    return resolveMyTeam(PG2, next, buildClubIndex(teamNames(real, next), shields), '2026-09-01');
  };
  const half = at({ prebenjamin: ['PG2'] });
  assert.equal(half.status, 'ok', 'el paso 1 lo resuelve en silencio…');
  assert.equal(myTeamToSave(PG2, half), null, '…pero no se guarda: la familia no lo ha confirmado');
  const whole = at({ benjamin: ['A1'], prebenjamin: ['PG2'] });
  assert.equal(whole.status, 'ok');
  assert.equal(myTeamToSave(PG2, whole), null, 'tampoco con las dos categorías');
  // Con «Las Mesas B» en benjamín, el paso 1 pregunta (E): lo guarda la respuesta, con nav.saveMyTeam.
  assert.equal(at({ benjamin: ['B2'], prebenjamin: ['PG2'] }).status, 'ask');
});

// ── start() de verdad, sobre un navegador falso ────────────────────────────

// Lo justo del navegador para app.js y el router: historial y hash, eventos, el <main> que guarda
// el HTML pintado (con su h1), el hueco del aviso sin conexión, el literal «Última actualización»
// y el almacenamiento: un Map compartido entre cargas, como el localStorage de un móvil.
function fakePage(storage, hash = '#/') {
  const listeners = {};
  const entries = [{ hash, state: null }];
  let index = 0;
  const hashOf = (url) => (String(url).includes('#') ? String(url).slice(String(url).indexOf('#')) : String(url));
  const h1 = { tagName: 'H1', attrs: {}, hasAttribute: (n) => n in h1.attrs, setAttribute: (n, v) => { h1.attrs[n] = String(v); }, focus() {} };
  const main = { innerHTML: '', querySelector: (sel) => (sel === 'h1' && main.innerHTML.includes('<h1') ? h1 : null), contains: () => true };
  const offline = { innerHTML: '' };
  const place = (map) => ({ getItem: (k) => (map.has(k) ? map.get(k) : null), setItem: (k, v) => { map.set(k, String(v)); }, removeItem: (k) => { map.delete(k); } });
  const reloads = [];
  const doc = {
    title: 'Fútbol Base Las Palmas', activeElement: null,
    addEventListener: (type, fn) => { (listeners[type] ||= []).push(fn); },
    getElementById: (id) => (id === 'contenido' ? main : id === 'legacyUpdated' ? { textContent: 'Última actualización: 23/09/2026' } : null),
    querySelector: (sel) => (sel === '.shell-offline' ? offline : null),
    querySelectorAll: () => [],
  };
  const win = {
    document: doc, scrollY: 0, navigator: { onLine: true },
    history: {
      scrollRestoration: 'auto',
      get state() { return entries[index].state; },
      pushState(state, _t, url) { entries.splice(index + 1, entries.length, { hash: hashOf(url), state: structuredClone(state) }); index++; },
      replaceState(state, _t, url) { entries[index] = { hash: url === undefined ? entries[index].hash : hashOf(url), state: structuredClone(state) }; },
      back() {},
    },
    location: { get hash() { return entries[index].hash; }, reload: () => reloads.push(true) },
    scrollTo() {}, addEventListener() {},
    localStorage: place(storage), sessionStorage: place(new Map()),
  };
  // Un clic en un elemento con esos atributos, como lo recibe la delegación del documento.
  const click = (attrs) => (listeners.click || []).forEach((fn) => fn({
    button: 0, defaultPrevented: false, preventDefault() {},
    target: { closest: (sel) => (sel === '[data-action="retry"]' && attrs['data-action'] === 'retry' ? {} : null) },
  }));
  return { doc, win, main, reloads, click, hash: () => entries[index].hash };
}

// Los data-*.js inmediatos, como los globales del navegador, y los perezosos por fetch.
const GLOBALS = ['BENJAMIN', 'PREBENJAMIN', 'HISTORY', 'GOL_BENJ', 'GOL_PREBENJ', 'SHIELDS', 'SEASONS',
  'MASPALOMAS_CUP_BENJAMIN', 'MASPALOMAS_CUP_PREBENJAMIN'];
function installData(season, { without = [] } = {}) {
  const cups = fixture('cups-2025-2026');
  const values = { BENJAMIN: season.benjamin, PREBENJAMIN: season.prebenjamin, HISTORY: season.history,
    GOL_BENJ: [], GOL_PREBENJ: [], SHIELDS: shields, SEASONS: [{ name: '2025-2026', current: true }],
    MASPALOMAS_CUP_BENJAMIN: cups.benjamin, MASPALOMAS_CUP_PREBENJAMIN: cups.prebenjamin };
  for (const name of GLOBALS) delete globalThis[name];
  for (const [name, value] of Object.entries(values)) if (!without.includes(name)) globalThis[name] = value;
}
const FILES = {
  'data-health.json': () => JSON.stringify(fixture('health')),
  'data-matchdetail.js': () => `const MATCH_DETAIL=${JSON.stringify(fixture('matchdetail'))};`,
  'data-lineups-2025-2026.js': () => `const LINEUPS_2025_2026=${JSON.stringify(fixture('lineups-2025-2026'))};`,
};
globalThis.fetch = async (url) => {
  const body = FILES[String(url).replace(/^\.\//, '').replace(/\?.*$/, '')];
  return body ? { ok: true, status: 200, text: async () => body() } : { ok: false, status: 404, text: async () => '' };
};

// Una carga de la app: los datos de `season`, el día `today` (a mediodía en Canarias; el reloj de
// la prueba, t.mock.timers, se queda en ese día hasta la carga siguiente) y el almacén.
async function load(t, storage, { season = raw, portal = PORTAL_2526, today, hash = '#/', without = [] }) {
  installData(season, { without });
  t.mock.timers.setTime(Date.parse(`${today}T12:00:00Z`));
  const page = fakePage(storage, hash);
  const router = start(page.doc, page.win, portal);
  if (router) await router.idle();
  return { page, router };
}
const stateOf = (page) => (page.main.innerHTML.match(/<section data-screen="home" data-state="([A-Z]|error)"/) || [])[1];
const saved = (storage) => JSON.parse(storage.get(STORE_KEY)).myTeam;

test('start: el cambio de fase se guarda al arrancar, antes del primer pintado (FF5 → A2)', async (t) => {
  t.mock.timers.enable({ apis: ['Date'] });
  const ff5 = { name: 'Las Mesas Hu.', season: '2025-2026', cat: 'benjamin', groupId: 'FF5' };
  const storage = new Map([[STORE_KEY, JSON.stringify({ myTeam: ff5, recent: [] })]]);
  const { page } = await load(t, storage, { season: currentAt('2026-03-01'), today: '2026-03-01' });
  assert.deepEqual(saved(storage), { ...ff5, groupId: 'A2' });
  assert.equal(stateOf(page), 'A');
  assert.match(page.main.innerHTML, /<h1>Las Mesas Hu\.<\/h1><p class="screen-sub">Benjamín, Segunda Fase A, Grupo 2<\/p>/);
});

test('§11, caso 3, por partes: el primer día PG2 en silencio y sin guardar; el segundo, la pregunta; su respuesta se guarda y se respeta', async (t) => {
  t.mock.timers.enable({ apis: ['Date'] });
  const storage = new Map([[STORE_KEY, JSON.stringify({ myTeam: PG2, recent: [] })]]);
  // Día 1: 2026/27 solo con el prebenjamín de Gran Canaria. El paso 1 da PG2 sin preguntar…
  let day = await load(t, storage, { season: nextSeasonRaw({ prebenjamin: ['PG2', 'PG3'] }), portal: PORTAL_2627, today: '2026-10-01' });
  assert.equal(stateOf(day.page), 'B');
  assert.match(day.page.main.innerHTML, /<p class="screen-sub">Prebenjamín, Grupo 2 de Gran Canaria<\/p>/);
  assert.deepEqual(saved(storage), PG2, '…y no lo guarda: no es una respuesta de la familia');
  // Día 2: llega el benjamín de Gran Canaria, con «Las Mesas Hu.» (A2) y «Las Mesas B» (B2): E.
  const both = nextSeasonRaw({ benjamin: ['A2', 'B2'], prebenjamin: ['PG2', 'PG3'] });
  day = await load(t, storage, { season: both, portal: PORTAL_2627, today: '2026-10-02' });
  assert.equal(stateOf(day.page), 'E');
  assert.equal((day.page.main.innerHTML.match(/data-action="elegir"/g) || []).length, 3);
  // La respuesta (el botón llama a nav.saveMyTeam) se guarda y la portada se vuelve a pintar.
  const answer = { name: 'Las Mesas Hu.', season: '2026-2027', cat: 'benjamin', groupId: 'A2' };
  day.router.nav.saveMyTeam(answer);
  await day.router.idle();
  assert.deepEqual(saved(storage), answer);
  assert.equal(stateOf(day.page), 'B');
  assert.match(day.page.main.innerHTML, /<p class="screen-sub">Benjamín, Segunda Fase A, Grupo 2<\/p>/);
  // Día 3: la carga siguiente respeta la respuesta, sin preguntar.
  day = await load(t, storage, { season: both, portal: PORTAL_2627, today: '2026-10-03' });
  assert.equal(stateOf(day.page), 'B');
  assert.match(day.page.main.innerHTML, /<p class="screen-sub">Benjamín, Segunda Fase A, Grupo 2<\/p>/);
  assert.deepEqual(saved(storage), answer);
});

test('sin un dato inmediato de la temporada, la caja de error con «Reintentar», que recarga; nunca X ni B falsos (M4)', async (t) => {
  t.mock.timers.enable({ apis: ['Date'] });
  for (const missing of ['BENJAMIN', 'PREBENJAMIN', 'HISTORY']) {
    const storage = new Map();
    const { page, router } = await load(t, storage, { today: '2026-03-01', without: [missing] });
    assert.equal(router, null, `${missing}: el router no arranca`);
    assert.equal(stateOf(page), 'error', missing);
    assert.match(page.main.innerHTML, /<h1>Mi equipo<\/h1>/);
    assert.match(page.main.innerHTML, /No se pudieron cargar los datos de la temporada 2025\/26\./);
    assert.doesNotMatch(page.main.innerHTML, /no aparece|Aún no se ha jugado/);
    assert.equal(storage.size, 0, 'no resuelve ni guarda mi equipo');
    page.click({ 'data-action': 'retry' });
    assert.deepEqual(page.reloads, [true], `${missing}: «Reintentar» recarga la página`);
  }
});

test('el router deja pasar lo que las pantallas saben leer: la jornada por su número y el único partido h–a (B7)', async (t) => {
  t.mock.timers.enable({ apis: ['Date'] });
  const open = async (hash) => {
    const { page } = await load(t, new Map(), { today: '2026-03-01', hash });
    return page;
  };
  let page = await open('#/jornada?g=PG2&r=30');
  assert.equal(page.hash(), '#/jornada?g=PG2&r=30', 'sin redirección');
  assert.match(page.main.innerHTML, /<h2 class="round-title">Jornada 30 de 30<\/h2>/);
  page = await open('#/partido?g=PG2&r=30&h=Las%20Mesas%20Hu.&a=AD%20Hurac%C3%A1n');
  assert.equal(page.hash(), '#/partido?g=PG2&r=30&h=Las%20Mesas%20Hu.&a=AD%20Hurac%C3%A1n');
  assert.match(page.main.innerHTML, /<h1>Partido<span class="vh">: Las Mesas Hu\. – AD Huracán<\/span><\/h1>/);
  // Otra jornada, pero un único Huracán–Las Mesas en el grupo: el 8–1 de la jornada 15.
  page = await open('#/partido?g=PG2&r=Jornada%2099&h=AD%20Hurac%C3%A1n&a=Las%20Mesas%20Hu.');
  assert.match(page.main.innerHTML, /<h1>Partido<span class="vh">: AD Huracán – Las Mesas Hu\.<\/span><\/h1>/);
  assert.match(page.main.innerHTML, /<p class="screen-sub">Jornada 15 · Prebenjamín, Grupo 2 de Gran Canaria<\/p>/);
});

// app.js es el punto de entrada: start(doc, win) lo llama index.html. Además de su conducta (arriba),
// el orden de su cableado con el navegador se comprueba en el código; en el navegador, en el paso 6
// y en la Tarea 13.
const APP = readFileSync(join(ROOT, 'src/app.js'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
const routerStart = APP.indexOf('startRouter({');

test('app.js: crestFallback en captura y mi equipo guardado, los dos antes del primer pintado', () => {
  const crest = APP.search(/doc\.addEventListener\(\s*'error',[^;]*crestFallback\([^;]*,\s*true\s*\)/);
  assert.ok(crest >= 0, 'falta el manejador de errores de imagen en captura');
  const save = APP.search(/myTeamToSave\(store\.myTeam,/);
  assert.ok(save >= 0, 'falta guardar mi equipo al arrancar');
  assert.ok(routerStart > crest && routerStart > save, 'los dos van antes de startRouter');
});

test('app.js: aviso sin conexión en vivo, sesión y «Hacer mi equipo» con saveStore', () => {
  for (const type of ['online', 'offline']) assert.match(APP, new RegExp(`win\\.addEventListener\\('${type}', showOffline\\)`), type);
  assert.match(APP, /offlineNotice\(datasets\.health, legacyDate\)/);
  assert.match(APP, /session: safeStorage\(\(\) => win\.sessionStorage\)/);
  assert.match(APP, /saveMyTeam\(myTeam\) \{\s*store = \{ \.\.\.store, myTeam \};\s*return saveStore\(storage, store\);/);
});
```

La prueba de guarda de `config.js` (R2-1): el hook de carga sirve un `src/config.js` de 2026/27 a todo lo que se cargue después, y la prueba ejecuta con él todas las demás pruebas de Node.

Crear `scripts/tests/fixtures/config-2026-2027/hooks.mjs`:

```js
// Hook de carga de Node para test_rediseno_config.mjs: sirve un src/config.js de 2026/27, el de la
// activación, con Las Mesas en otro grupo, en lugar del del repositorio. No toca ningún otro módulo.
const PORTAL = {
  season: '2026-2027',
  nextSeason: '2027-2028',
  defaultTeam: { cat: 'prebenjamin', groupId: 'PG5', name: 'Las Mesas Hu.' },
  timeZone: 'Atlantic/Canary',
};

export async function load(url, context, nextLoad) {
  if (url.startsWith('file:') && new URL(url).pathname.endsWith('/src/config.js')) {
    return { format: 'module', shortCircuit: true, source: `export const PORTAL = ${JSON.stringify(PORTAL)};\n` };
  }
  return nextLoad(url, context);
}
```

Crear `scripts/tests/fixtures/config-2026-2027/register.mjs`:

```js
// node --import ./scripts/tests/fixtures/config-2026-2027/register.mjs …: todo lo que se cargue después
// recibe el src/config.js de 2026/27 de hooks.mjs (test_rediseno_config.mjs).
import { register } from 'node:module';

register('./hooks.mjs', import.meta.url);
```

Crear `scripts/tests/test_rediseno_config.mjs`:

```js
/**
 * Ninguna prueba depende de src/config.js (R2-1 de la revisión adversarial). El día que se active
 * 2026/27, activate_season.py cambia la temporada de config.js, y el bot ejecuta estas pruebas antes de
 * comitear: si una leyera config.js, se pararía en rojo en silencio. Aquí se ejecutan todas las demás
 * pruebas de Node con un config.js de 2026/27, con el equipo por defecto en otro grupo, que sirve un
 * hook de carga de Node (fixtures/config-2026-2027/), y tienen que salir en verde igual.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readdirSync } from 'node:fs';
import { basename, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const HOOK = fileURLToPath(new URL('./fixtures/config-2026-2027/register.mjs', import.meta.url));
const SELF = basename(fileURLToPath(import.meta.url));
// Sin NODE_TEST_CONTEXT, el node --test de dentro informa por su cuenta, en TAP.
const env = { ...process.env };
delete env.NODE_TEST_CONTEXT;
const node = (args) => spawnSync(process.execPath, ['--import', HOOK, ...args], { cwd: ROOT, env, encoding: 'utf8', timeout: 180000 });

test('el hook sirve un src/config.js de 2026/27, con el equipo por defecto en PG5', () => {
  const run = node(['--input-type=module', '-e', "const { PORTAL } = await import('./src/config.js'); console.log(PORTAL.season, PORTAL.defaultTeam.groupId);"]);
  assert.equal(run.stdout.trim(), '2026-2027 PG5', run.stderr);
});

test('todas las demás pruebas de Node salen en verde con ese config.js', () => {
  const files = readdirSync(join(ROOT, 'scripts', 'tests')).filter((f) => /^test_.*\.mjs$/.test(f) && f !== SELF).sort();
  const run = node(['--test', '--test-reporter=tap', ...files.map((f) => join('scripts', 'tests', f))]);
  const failed = run.stdout.split('\n').filter((line) => /^not ok /.test(line));
  assert.deepEqual(failed, [], `con la temporada 2026/27 en config.js:\n${run.stderr.slice(-1500)}`);
  assert.equal(run.status, 0, run.stderr.slice(-1500));
  assert.match(run.stdout, /^# fail 0$/m);
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd /home/manolo/claude/futbol-base
node --test scripts/tests/test_rediseno_integracion.mjs 2>&1 | grep -E 'Error|^# (tests|pass|fail)'
```
Esperado:
```text
# SyntaxError: The requested module '../../src/myteam.js' does not provide an export named 'myTeamToSave'
# tests 1
# pass 0
# fail 1
```

- [ ] **Step 3: Write minimal implementation**

`myTeamToSave` usa `updatedMyTeam`, del mismo módulo.

Añadir al final de `src/myteam.js`:

```js
// Lo que app.js guarda al arrancar (decisión 12 de B1): el myTeam de updatedMyTeam, solo si el cambio
// es de la misma temporada (el cambio de fase del paso 0, FF5 → A2). Un cambio de temporada (paso 1)
// nunca se guarda solo: se vuelve a resolver en cada carga hasta que la familia lo confirma (la
// respuesta a E o «Hacer mi equipo»). Así, con 2026/27 publicada por partes, un único candidato en
// silencio el primer día no impide la pregunta cuando llegan los demás (A2 de la revisión de B2).
export function myTeamToSave(myTeam, resolution) {
  const next = updatedMyTeam(myTeam, resolution);
  return next && myTeam && next.season === myTeam.season ? next : null;
}
```

Reescribir `src/screens.js` con este contenido:

```js
// Qué pantalla pinta cada ruta de §4.1 (el router las recibe de app.js). Las de B3 llevan la
// provisional (decisión 6 de B2) hasta que llegue la suya.
import { SCREENS } from './links.js';
import { screen as home } from './screen-home.js';
import { screen as jornada } from './screen-jornada.js';
import { screen as tabla } from './screen-tabla.js';
import { screen as partido } from './screen-partido.js';
import { screen as pendiente } from './screen-pendiente.js';

const READY = { '': home, jornada, tabla, partido };

export const SCREEN_MAP = Object.freeze(Object.fromEntries(SCREENS.map((name) => [name, READY[name] || pendiente])));
```

Reescribir `src/app.js` con este contenido:

```js
// Arranque (spec §5.2): almacén, registro de datos, modelo y router. index.html llama a
// start(document, window) cuando ya han llegado los datos inmediatos: importar este módulo no toca
// el navegador (test_rediseno_modulos). Antes del primer pintado, start instala la cadena de los
// escudos, sigue la conexión para el aviso de la cabecera y guarda el cambio de fase de mi equipo;
// sin los datos inmediatos de la temporada, pinta la caja de error y no arranca el router.
import { PORTAL } from './config.js';
import { readGlobals, ensureHealth } from './state.js';
import { createModel, seasonLabel } from './model.js';
import { buildClubIndex, resolveMyTeam, myTeamToSave } from './myteam.js';
import { loadStore, saveStore, safeStorage } from './store.js';
import { canaryTodayISO, parseRoute } from './links.js';
import { crestFallback } from './ui.js';
import { errorScreen, offlineNotice, routeTitle } from './shell.js';
import { startRouter } from './router.js';
import { SCREEN_MAP } from './screens.js';

// Los datos de un pintado (el ctx de las pantallas sin la ruta, que añade el router): mi equipo
// resuelto contra la temporada del portal con el «hoy» de Canarias, un solo reloj (decisión 4).
function contextFor({ model, myTeam, portal, datasets, today, legacyDate = null }) {
  const resolution = resolveMyTeam(myTeam, model.season(portal.season), model.clubIndex(), today);
  return { model, myTeam, resolution, today, health: datasets.health, datasets, portal, legacyDate };
}

// El mismo contexto desde un almacén y con el día que se le pida: la base de las pruebas de las
// pantallas. Con el almacén vacío o bloqueado, loadStore da el equipo por defecto, sin preguntas.
export function startContext({ storage, portal, datasets, today }) {
  const store = loadStore(storage, { defaultTeam: portal.defaultTeam, portalSeason: portal.season });
  const model = createModel(datasets, { portalSeason: portal.season, buildClubIndex });
  const base = { season: portal.season, defaultTeam: portal.defaultTeam };
  return { ...contextFor({ model, myTeam: store.myTeam, portal: base, datasets, today }), lastPrimary: 'miequipo' };
}

// Los datos inmediatos sin los que no hay temporada: sin uno de ellos, ni X ni B serían verdad.
const REQUIRED = ['benjamin', 'prebenjamin', 'history'];

// config: el PORTAL de config.js; las pruebas pasan otro (una temporada simulada).
export function start(doc, win, config = PORTAL) {
  // Escudos: miniatura → original → monograma (spec §5.4). Los errores de <img> no burbujean: se
  // escuchan en captura, y desde antes del primer pintado (escudos/s/ no existe hasta B4).
  doc.addEventListener('error', (event) => crestFallback(event.target), true);
  const storage = () => win.localStorage;
  const portal = { season: config.season, defaultTeam: config.defaultTeam };
  // Registro de datos: los globales inmediatos y lo que traen los cargadores perezosos.
  const datasets = { ...readGlobals(), seasonRaw: {}, matchDetail: null, lineups: {}, health: null };
  // La fecha del literal oculto «Última actualización» de index.html, por si falta data-health.
  const legacyDate = doc.getElementById('legacyUpdated')?.textContent.match(/\d{2}\/\d{2}\/\d{4}/)?.[0] || null;

  // «Sin conexión. Datos del …» en la cabecera (spec §4.10), en vivo.
  function showOffline() {
    const slot = doc.querySelector('.shell-offline');
    if (slot) slot.innerHTML = win.navigator.onLine === false ? String(offlineNotice(datasets.health, legacyDate)) : '';
  }
  win.addEventListener('online', showOffline);
  win.addEventListener('offline', showOffline);
  showOffline();
  ensureHealth().then((health) => {
    if (health) datasets.health = health;
    showOffline();
  });

  // Sin los datos inmediatos de la temporada (un precache a medias y sin conexión, por ejemplo), la
  // caja de error de §7 con «Reintentar», que recarga la página: nunca un X o un B falsos (M4 de la
  // revisión adversarial). Mi equipo no se resuelve ni se guarda, y el router no arranca.
  if (REQUIRED.some((key) => !datasets[key])) {
    const route = parseRoute(win.location.hash);
    const screen = SCREEN_MAP[route.screen] || SCREEN_MAP[''];
    doc.getElementById('contenido').innerHTML = String(errorScreen({
      screenId: screen.id, title: routeTitle(route.screen), what: `la temporada ${seasonLabel(portal.season)}`,
    }));
    doc.addEventListener('click', (event) => {
      if (event.target?.closest?.('[data-action="retry"]')) win.location.reload();
    });
    return null;
  }

  const model = createModel(datasets, { portalSeason: portal.season, buildClubIndex });
  let store = loadStore(storage, { defaultTeam: portal.defaultTeam, portalSeason: portal.season });
  const getContext = () => contextFor({
    model, myTeam: store.myTeam, portal, datasets, today: canaryTodayISO(new Date(), config.timeZone), legacyDate,
  });

  // El cambio de fase que se resuelve sin preguntar (FF5 → A2) queda guardado desde el arranque
  // (decisión 12 de B1). Un cambio de temporada, nunca: se resuelve en cada carga hasta que la
  // familia lo confirma (A2 de la revisión adversarial).
  const next = myTeamToSave(store.myTeam, getContext().resolution);
  if (next) {
    store = { ...store, myTeam: next };
    saveStore(storage, store);
  }

  return startRouter({
    screens: SCREEN_MAP,
    root: doc.getElementById('contenido'),
    getContext,
    window: win,
    // El último destino principal, para la barra en Partido, dura lo que la pestaña (§4.1).
    session: safeStorage(() => win.sessionStorage),
    actions: {
      // Respuesta a la pregunta de E y «Hacer mi equipo» (§4.2 y §4.6): se guarda (o, si el
      // almacenamiento falla, queda en memoria) y el router vuelve a pintar la ruta.
      saveMyTeam(myTeam) {
        store = { ...store, myTeam };
        return saveStore(storage, store);
      },
    },
  });
}
```

En `sw.js`, sustituir:

```js
  './src/screen-pendiente.js',
```

por:

```js
  './src/screen-pendiente.js',
  './src/screen-jornada.js',
  './src/screen-tabla.js',
  './src/screen-partido.js',
```

- [ ] **Step 4: Run test to verify it passes**

```bash
cd /home/manolo/claude/futbol-base
node --test scripts/tests/test_rediseno_integracion.mjs scripts/tests/test_rediseno_config.mjs 2>&1 | grep -E '^# (tests|pass|fail)'
```
Esperado (la guarda ejecuta dentro todas las demás pruebas de Node con el `config.js` de 2026/27):
```text
# tests 11
# pass 11
# fail 0
```

- [ ] **Step 5: Suites completas y los tres smoke**

```bash
cd /home/manolo/claude/futbol-base
python3 -m pytest scripts/tests/ -q 2>&1 | tail -1
node --test scripts/tests/test_*.mjs 2>&1 | grep -E '^# (tests|pass|fail)'
```
Esperado:
- pytest: el mismo recuento que al terminar la tarea anterior, sin `failed`.
- node: el recuento anterior más 11, sin fallos. `test_rediseno_router.mjs` (Tarea 6) sigue en verde: solo exige la provisional en las rutas de B3.

Los tres smoke terminan en `PASS`. En `pwa-smoke`, sin conexión, la portada se pinta y la cabecera lleva el aviso.

```bash
cd /home/manolo/claude/futbol-base
node scripts/tests/render-smoke.mjs
node scripts/tests/interaction-smoke.mjs
node scripts/tests/pwa-smoke.mjs 2>&1 | grep -v '^PWA fixture HTTP 404 /escudos/s/'
```
Esperado, con el tamaño del DOM del día:
```text
PASS: render smoke OK — Mi equipo en estado D (DOM 12177 bytes)
PASS: la portada carga a 320px en claro, sin desplazamiento horizontal
PASS: la portada carga a 320px en oscuro, sin desplazamiento horizontal
PASS: la portada carga a 390px en claro, sin desplazamiento horizontal
PASS: la portada carga a 390px en oscuro, sin desplazamiento horizontal
PASS: la portada carga a 768px en claro, sin desplazamiento horizontal
PASS: la portada carga a 768px en oscuro, sin desplazamiento horizontal
PASS: la portada carga a 1440px en claro, sin desplazamiento horizontal
PASS: la portada carga a 1440px en oscuro, sin desplazamiento horizontal
PASS: de la app anterior (su SW real) al rediseño, con datos congelados: la 1.ª apertura es la anterior; sin conexión a medias, el aviso con «Reintentar»; la 2.ª y la 3.ª, la nueva con acta.css y sin mezclar módulos; futbolbase-v20991231a funciona sin conexión
```

- [ ] **Step 6: Verificación en Chrome (fuera del repo)**

`t12-integration-check.mjs`, con el `app.js` real, `index.html` y los datos vivos, comprueba:
- los escudos de la portada: la miniatura da 404 y queda el original;
- el aviso sin conexión, que aparece y se va con la conexión;
- la respuesta a E, con «Las Mesas Hu. B» de FF13 guardado: se guarda, se vuelve a pintar y no se vuelve a preguntar;
- FF5 guardado, que pasa a A2 al arrancar;
- la sesión, que recuerda Tabla como destino de un partido tras recargar;
- el almacenamiento bloqueado: la portada de Las Mesas Hu. y la navegación, sin errores.

Después, `app-check.mjs` con `TASK=12` (el script de la Tarea 6): ahora Jornada, Tabla y Partido son las pantallas de verdad.

```bash
cd /home/manolo/claude/futbol-base
S=/tmp/claude-1000/-home-manolo/db6fd8e0-f1e7-4e94-b6cd-ef7dd5bf6ae9/scratchpad/planB2
mkdir -p "$S"
cat > "$S/t12-integration-check.mjs" <<'EOF'
// Comprobación de la Tarea 12 en Chrome, con el app.js real, el index.html y los datos del worktree.
// Uso, desde la raíz del repo (con Playwright en node_modules, Tarea 4): OUT=<dir> node <este fichero>
import { createRequire } from 'node:module';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const out = process.env.OUT;
if (!out) { console.error('Falta OUT=<directorio de capturas>'); process.exit(2); }
mkdirSync(out, { recursive: true });
const root = process.cwd();
const { startServer, findChrome } = await import(pathToFileURL(join(root, 'scripts/tests/render-smoke.mjs')).href);
const { chromium } = createRequire(join(root, 'scripts/tests/x.mjs'))('playwright');
const server = await startServer();
const base = `http://127.0.0.1:${server.address().port}/index.html`;
const browser = await chromium.launch({ executablePath: findChrome() });
const problems = [];
const check = (label, ok, detail) => { console.log(ok ? `ok  ${label}` : `MAL ${label}: ${JSON.stringify(detail)}`); if (!ok) problems.push(label); };
const V2 = 'futbol-base:v2';
async function open(hash, { init = null, arg = null, width = 390 } = {}) {
  const ctx = await browser.newContext({ viewport: { width, height: 844 }, serviceWorkers: 'block', timezoneId: 'Atlantic/Canary', locale: 'es-ES' });
  if (init) await ctx.addInitScript(init, arg);
  const p = await ctx.newPage();
  p.setDefaultTimeout(8000);
  p.on('pageerror', (e) => problems.push(`error de JavaScript en ${hash}: ${e.message}`));
  await p.goto(base + hash);
  await p.waitForSelector('main section[data-screen]');
  return p;
}
const saved = (p) => p.evaluate((key) => JSON.parse(localStorage.getItem(key) || 'null'), V2);
// En E, cada candidato es un botón del bloque de la portada (spec §4.2); «Ninguno» es un enlace.
const home = (p) => p.evaluate(() => ({
  state: document.querySelector('main section')?.getAttribute('data-state'),
  h1: document.querySelector('main h1')?.textContent,
  choices: document.querySelectorAll('main section[data-state="E"] button').length,
}));

// 1. Escudos: las miniaturas de escudos/s/ no existen (B4) y crestFallback pasa al original.
{
  const p = await open('#/');
  await p.waitForFunction(() => [...document.querySelectorAll('main img.crest')].every((i) => i.complete && i.naturalWidth > 0));
  const crests = await p.evaluate(() => [...document.querySelectorAll('main img.crest')].map((i) => [i.getAttribute('src'), i.getAttribute('data-full')]));
  check('escudos de la portada: miniatura 404 → original cargado', crests.length > 0 && crests.every(([src, full]) => src === full), crests);
  // 2. Aviso sin conexión, en vivo.
  await p.context().setOffline(true);
  await p.waitForFunction(() => document.querySelector('.shell-offline').textContent !== '');
  const offline = await p.textContent('.shell-offline');
  check('sin conexión: aviso con la fecha de data-health', offline === 'Sin conexión. Datos del 23/09/2026', offline);
  await p.screenshot({ path: `${out}/t12-sin-conexion-390.png` });
  await p.context().setOffline(false);
  await p.waitForFunction(() => document.querySelector('.shell-offline').textContent === '');
  check('con conexión otra vez: el aviso se va', (await p.textContent('.shell-offline')) === '');
  await p.context().close();
}

// 3. Respuesta a E: FF13 «Las Mesas Hu. B» terminado y «Las Mesas B» en B2 → pregunta; se guarda.
{
  const init = ([key, value]) => { if (!sessionStorage.getItem('sembrado')) { localStorage.setItem(key, value); sessionStorage.setItem('sembrado', '1'); } };
  const p = await open('#/', { init, arg: [V2, JSON.stringify({ myTeam: { name: 'Las Mesas Hu. B', season: '2025-2026', cat: 'benjamin', groupId: 'FF13' }, recent: [] })] });
  let h = await home(p);
  check('estado E con los candidatos', h.state === 'E' && h.choices > 0, h);
  await p.screenshot({ path: `${out}/t12-estado-E-390.png` });
  const choice = p.locator('main section[data-state="E"] button').first();
  const label = await choice.textContent();
  await choice.click();
  await p.waitForFunction(() => document.querySelector('main section')?.getAttribute('data-state') !== 'E');
  h = await home(p);
  const team = (await saved(p)).myTeam;
  check('la respuesta se guarda (saveStore) y se vuelve a pintar', h.state !== 'E' && label.includes(team.name), { h, team, label });
  await p.reload();
  await p.waitForSelector('main section[data-screen="home"]');
  h = await home(p);
  check('tras recargar no se vuelve a preguntar', h.state !== 'E' && h.h1 === team.name, h);
  await p.context().close();
}

// 4. Cambio de fase guardado al arrancar: FF5 → A2.
{
  const p = await open('#/', { init: ([key, value]) => { if (!localStorage.getItem(key)) localStorage.setItem(key, value); },
    arg: [V2, JSON.stringify({ myTeam: { name: 'Las Mesas Hu.', season: '2025-2026', cat: 'benjamin', groupId: 'FF5' }, recent: [] })] });
  const team = (await saved(p)).myTeam;
  check('FF5 → A2 guardado al arrancar', team.groupId === 'A2' && team.cat === 'benjamin', team);
  await p.context().close();
}

// 5. El último destino principal de la sesión marca Partido, también tras recargar: desde Tabla se
// abre un partido que no es de mi equipo (por enlace directo sería Jornada).
{
  const p = await open('#/tabla');
  await p.evaluate(() => { location.hash = '#/partido?g=PG2&r=Jornada%2030&h=Acodetti&a=Santa%20Br%C3%ADgida'; });
  await p.waitForSelector('main section[data-screen="partido"]');
  const tabs = () => p.evaluate(() => [...document.querySelectorAll('.tabbar a.tab')].filter((a) => a.hasAttribute('aria-current')).map((a) => [a.getAttribute('href'), a.getAttribute('aria-current')]));
  let t = await tabs();
  check('Partido desde Tabla: Tabla con "true"', JSON.stringify(t) === '[["#/tabla","true"]]', t);
  await p.reload();
  await p.waitForSelector('main section[data-screen="partido"]');
  t = await tabs();
  check('tras recargar, la sesión lo recuerda', JSON.stringify(t) === '[["#/tabla","true"]]', t);
  await p.context().close();
}

// 6. Almacenamiento bloqueado (cookies de terceros): la portada del equipo por defecto, sin errores.
{
  const p = await open('#/', { init: () => {
    for (const name of ['localStorage', 'sessionStorage']) Object.defineProperty(window, name, { get() { throw new DOMException('bloqueado', 'SecurityError'); } });
  } });
  const h = await home(p);
  check('almacenamiento bloqueado: portada de Las Mesas Hu.', h.h1 === 'Las Mesas Hu.' && /^[ABCD]$/.test(h.state), h);
  await p.click('.tabbar a[href="#/jornada"]');
  await p.waitForSelector('main section[data-screen="jornada"]');
  check('… y la navegación sigue', true);
  await p.context().close();
}

await browser.close();
server.close();
console.log(problems.length ? 'PROBLEMAS:\n' + problems.join('\n') : `OK: integración en Chrome; capturas en ${out}`);
process.exit(problems.length ? 1 : 0);
EOF
OUT="$S/shots-t12" node "$S/t12-integration-check.mjs"
OUT="$S/shots-t12" TASK=12 node "$S/app-check.mjs"
```
Esperado:
```text
ok  escudos de la portada: miniatura 404 → original cargado
ok  sin conexión: aviso con la fecha de data-health
ok  con conexión otra vez: el aviso se va
ok  estado E con los candidatos
ok  la respuesta se guarda (saveStore) y se vuelve a pintar
ok  tras recargar no se vuelve a preguntar
ok  FF5 → A2 guardado al arrancar
ok  Partido desde Tabla: Tabla con "true"
ok  tras recargar, la sesión lo recuerda
ok  almacenamiento bloqueado: portada de Las Mesas Hu.
ok  … y la navegación sigue
OK: integración en Chrome; capturas en /tmp/claude-1000/-home-manolo/db6fd8e0-f1e7-4e94-b6cd-ef7dd5bf6ae9/scratchpad/planB2/shots-t12
ok  portada por el router: data-state y Mi equipo marcado
ok  barra → Jornada
ok  Atrás: la portada
ok  enlace antiguo → #/tabla?s=2025-2026&g=PG2
ok  enlace directo a un partido de mi equipo: Mi equipo con "true" y «‹» a su jornada
ok  ruta de B3: la pantalla provisional con su h1, Explorar marcado
OK: app.js (tarea 12) en Chrome; capturas en /tmp/claude-1000/-home-manolo/db6fd8e0-f1e7-4e94-b6cd-ef7dd5bf6ae9/scratchpad/planB2/shots-t12
```
Los datos vivos de hoy dejan la portada en D. Si los datos cambian (2026/27 activada), la línea «FF5 → A2» y la pregunta de E pueden cambiar de resultado: son comprobaciones con datos vivos, no pruebas del repo.

Abrir con Read `t12-sin-conexion-390.png` y `t12-estado-E-390.png`: el aviso «**Sin conexión.** Datos del 23/09/2026» sobre la cabecera de la portada, y la pregunta con los dos candidatos (Las Mesas Hu. de A2 y Las Mesas B de B2).

- [ ] **Step 7: Commit**

```bash
cd /home/manolo/claude/futbol-base
git add src/myteam.js src/screens.js src/app.js sw.js scripts/tests/test_rediseno_integracion.mjs scripts/tests/test_rediseno_config.mjs scripts/tests/fixtures/config-2026-2027
git commit -F - <<'EOF'
feat(rediseño): integración de B2: rutas completas, mi equipo guardado, escudos y sin conexión (B2, tarea 12)

screens.js registra Mi equipo, Jornada, Tabla y Partido; las rutas de B3
siguen con la provisional. app.js instala crestFallback en captura antes
del primer pintado (miniatura → original → monograma), guarda al arrancar
el cambio de fase de mi equipo (myTeamToSave; un cambio de temporada
nunca se guarda solo: lo confirma la familia, A2 de la revisión),
guarda la respuesta a E y «Hacer mi equipo» con saveStore y vuelve a
pintar, lleva el aviso «Sin conexión. Datos del …» con los eventos online
y offline y recuerda en la sesión el último destino principal. Sin los
datos inmediatos de la temporada, la caja de error con «Reintentar», que
recarga (M4).

- test_rediseno_integracion: rutas registradas, myTeamToSave con las
  fixtures y start() de verdad sobre un navegador falso y un almacén en
  memoria: FF5 → A2 guardado al arrancar, 2026/27 publicada por partes
  (§11, caso 3: silencio sin guardar, la pregunta, la respuesta guardada
  y respetada), los datos inmediatos que faltan y los enlaces que el
  router deja pasar porque la pantalla los sabe leer (B7).
- test_rediseno_config: ninguna prueba depende de src/config.js (R2-1):
  ejecuta todas las demás pruebas de Node con un config.js de 2026/27,
  servido por un hook de carga de Node, y tienen que salir en verde.

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01Sg56KK3oZgo8Ye7Snj6wG9
EOF
git show --stat --oneline HEAD | tail -1
```
Esperado: `8 files changed`, con `scripts/tests/test_rediseno_integracion.mjs`, `scripts/tests/test_rediseno_config.mjs`, `scripts/tests/fixtures/config-2026-2027/hooks.mjs` y `register.mjs`, `src/app.js`, `src/myteam.js`, `src/screens.js` y `sw.js`.

---

### Task 13: Pruebas de navegador de B2 y capturas para el usuario (spec §11)

Los tres smoke pasan a probar B2 de verdad, en el navegador y sin depender del día ni de los datos que publique el bot, y un script deja las capturas de cada pantalla y cada estado para revisarlas.

**Contexto**
- **Mundos de fixtures** (`scripts/tests/fixture-site.mjs`). Las pruebas de navegador sirven la app real (`index.html`, `src/`, `acta.css`, fuentes y escudos) con los datos de las fixtures congeladas de B1 en lugar de los `data-*.js` vivos, y un `PORTAL` fijo en lugar de `src/config.js`: así no cambian cuando el bot publica ni al activar 2026/27. Cada mundo trae su día, que Playwright fija con `context.clock.setFixedTime`, y, si hace falta, mi equipo guardado:
  - **A**, 01/03/2026: Las Mesas Hu. en PG2 a mitad de temporada; la jornada por defecto es la 17 (la del primer partido pendiente del grupo) y el próximo partido de Las Mesas, el de la 18;
  - **B**, 01/10/2026 con 2026/27 activada y sin nada jugado;
  - **C**, 03/06/2026: Las Mesas ya jugó la jornada 30 y el grupo no ha terminado;
  - **D**, 23/09/2026, los datos de hoy, con `data-health` y 2026/27 pendiente;
  - **E**, D con «Las Mesas Hu. B» de FF13 guardado (caso 2b de §11);
  - **X**, 2026/27 sin Las Mesas.

  `data-health.json` es el de D. En los demás mundos, sus fechas pasan a la víspera del día del mundo, la comprobación de la noche anterior: la frescura de la portada nunca es posterior a su «hoy».

  **La clasificación de A y C es la de su día** (B12 de la revisión adversarial). `currentAt` quita los marcadores desde el día del mundo, pero conserva la clasificación final: saldrían 28 partidos jugados en marzo y «la clasificación cuenta 28». Se recalcula con los resultados del calendario hasta ese día y, en PG2, los 3–0 contra CD Batán, el retirado que no está en el calendario: cada equipo tiene los que la clasificación final le cuenta de más (uno por vuelta), y cada uno cuenta cuando el grupo ha jugado su vuelta. En A, J es 15 o 16 y la cobertura dice «15 partidos jugados en el calendario y 1 contra CD Batán (retirado)»; en C, la fila de Las Mesas es la oficial (28 partidos, 37 puntos) y la cobertura, la del caso 6 de §11. Los goleadores, igual: las fixtures solo tienen los de fin de temporada, y mientras su equipo no ha terminado, sus goles y sus partidos se reducen en la proporción de partidos que el equipo lleva jugados (`scorersAt`). En A, ninguno pasa de 13 partidos con 16 del equipo, y entre todos suman 40 de sus 51 goles; en C y D son los de fin de temporada.

  `useWorld(context, nombre, { fail })` instala las rutas de los datos y de `config.js` (el resto lo sirve el servidor de `render-smoke.mjs`), fija el reloj y guarda mi equipo; `fail` hace que unos ficheros respondan 503. Los goleadores parten de una copia literal de las filas de PG2 y A2 (las fixtures no los traen), las mismas de `test_rediseno_portada.mjs`.
- **`interaction-smoke.mjs`**, los escenarios de B2 de §11 a 320, 390, 768 y 1440 px, en claro y en oscuro (mundo A):
  - la barra con 4 destinos y su `aria-current`, fija abajo sin tapar el final de la pantalla por debajo de 1024 px y en pestañas arriba desde 1024;
  - jornada anterior y siguiente (`replaceState`: sin entrada nueva), con el foco en el control pulsado (`#round-prev` y `#round-next`) y no en el `h1`, que solo lo recibe al cambiar de pantalla (B11 de la revisión);
  - las vistas de Tabla, con sus columnas visibles: Puntos, Goles, Forma, Casa y Fuera en móvil y tableta; Todas, Casa y Fuera en escritorio; y el foco en el segmento pulsado (`vista-*` o `vista-ancha-*`);
  - abrir el partido propio de la jornada (el foco va al `h1`) y volver con Atrás; entrar por enlace directo a un partido de mi equipo (Mi equipo marcado) y volver con «‹» a su jornada;
  - un enlace antiguo de WhatsApp (`#section=jornadas&…&season=2025-2026…`), traducido sin entrada nueva y con su temporada;
  - «Otro grupo» lleva a la pantalla provisional de Ligas, con Tabla marcada y sin errores;
  - sin desplazamiento horizontal en ninguna pantalla.

  Y una vez, en el mundo E (§11, caso 3; M6 de la revisión): se responde a la pregunta, la respuesta queda en `futbol-base:v2` y, al recargar, la portada es la de ese equipo, sin preguntar.

  Los escenarios de B3 (buscar un equipo y abrir su ficha, «Hacer mi equipo» y «Otro grupo» → Ligas → Tabla) llegan con sus pantallas.
- **`render-smoke.mjs`** sigue con los datos reales y los marcadores independientes del estado, y además pinta el estado D en el navegador con el mundo D y el reloj fijado (§11). Para eso necesita Playwright: en `tests.yml`, su instalación pasa a ir antes del `render-smoke`.
- **`pwa-smoke.mjs`** (el paso desde la app anterior con su SW real, de la Tarea 4): sin conexión, además de la portada, la cabecera avisa («Sin conexión.») y Jornada se pinta desde lo precacheado.
- **Deterministas.** Cada paso espera a su condición (`waitForAsync` o el propio localizador), nunca un tiempo fijo. Los tres smoke se ejecutan tres veces seguidas y las tres salen en verde.
- **Capturas para el usuario** (`scripts/tests/capturas.mjs`): cada pantalla de B2 (portada, Jornada, Tabla, Partido y la provisional) y los estados A, B, C, D, E y X, más error, vacío y sin conexión, a 390 px en claro y en oscuro y a 1440 px en claro: 45 PNG. Cada captura es la pantalla entera (la ventana crece hasta el alto de la página, con la barra en su sitio), sin desplazamiento horizontal ni errores.

**Files:**
- Create: `scripts/tests/fixture-site.mjs` y `scripts/tests/capturas.mjs`.
- Rewrite: `scripts/tests/interaction-smoke.mjs`.
- Modify: `scripts/tests/render-smoke.mjs`, `scripts/tests/pwa-smoke.mjs` y `.github/workflows/tests.yml`.

**Interfaces:**
- Consumes:
  - de B1: `fixture(name)`, `currentAt(todayISO)` y `nextSeasonRaw({ benjamin, prebenjamin })`;
  - `startServer()`, `findChrome()` y `checkRenderedDom(dom, { teamName })` (`render-smoke.mjs`, Tarea 4) y `waitForAsync(page, predicate, arg)` (`browser-wait.mjs`);
  - los marcadores de las Tareas 4 a 12: `#contenido section[data-screen][data-state]` (y `data-route` en la provisional), `.tabbar a.tab[aria-current]`, `a.round-step` y `.round-title`, `a.match-row.is-mine`, `.tabla-views.is-narrow` y `.is-wide` con sus `a.segment`, `a.screen-action` («Otro grupo»), `a.back` («‹»), `.shell-offline` y los títulos de bloque `h2.block-title`.
- Produces:

```js
// scripts/tests/fixture-site.mjs
export const STORE_KEY                           // 'futbol-base:v2'
export const WORLDS                              // { A, B, C, D, E, X }: { today, portalSeason, current(), myTeam?, gol? }
export async function useWorld(context, name, { fail = [] } = {})   // → el mundo; rutas, reloj y almacén
// scripts/tests/capturas.mjs: OUT=<dir> node scripts/tests/capturas.mjs → 45 PNG <pantalla>-<ancho>-<tema>.png
```

- [ ] **Step 1: Write the failing test**

Reescribir `scripts/tests/interaction-smoke.mjs` con este contenido:

```js
import { strict as assert } from 'node:assert';
import { createRequire } from 'node:module';
import { startServer, findChrome } from './render-smoke.mjs';
import { waitForAsync } from './browser-wait.mjs';
import { useWorld } from './fixture-site.mjs';

// npm install --no-save --package-lock=false playwright@1.58.0
// node scripts/tests/interaction-smoke.mjs
// Uses the installed Chrome (or CHROME=/absolute/path), like render-smoke.
//
// Escenarios de B2 de spec §11 a 320, 390, 768 y 1440 px, en claro y en oscuro (prefers-color-scheme
// emulado), sobre el mundo de fixtures A de fixture-site.mjs: 01/03/2026, Las Mesas Hu. en PG2 a
// mitad de temporada (la jornada por defecto es la 17, la del primer partido pendiente), con los
// datos congelados y el reloj fijado.
// - la barra con 4 destinos y su aria-current, sin tapar el contenido;
// - jornada anterior y siguiente, sin entradas nuevas en el historial y con el foco en el control
//   pulsado; al cambiar de pantalla, en el h1 (B11 de la revisión);
// - las vistas de Tabla: cinco en móvil y tableta, y Todas, Casa y Fuera en escritorio, con el foco
//   en el segmento pulsado;
// - abrir un partido y volver con Atrás; entrar por enlace directo y volver con «‹»;
// - traducir un enlace antiguo de WhatsApp, con su temporada y sin entrada nueva;
// - «Otro grupo» lleva a la pantalla provisional de Ligas (B3) sin errores;
// - sin desplazamiento horizontal en ninguna pantalla.
// Y una vez, en el mundo E (§11, caso 3): la respuesta a la pregunta se guarda y, al recargar, la
// portada es la de ese equipo, sin preguntar.
// Buscar un equipo, «Hacer mi equipo» y «Otro grupo» → Ligas → Tabla llegan con B3.
// Sin esperas fijas: cada paso espera a su condición (waitForAsync).
const { chromium } = createRequire(import.meta.url)('playwright');
const chrome = findChrome();
assert.ok(chrome, 'Chrome is required for the interaction smoke test');
const server = await startServer();
const base = `http://127.0.0.1:${server.address().port}/index.html`;
const PAPER = { light: 'rgb(255, 255, 255)', dark: 'rgb(21, 23, 28)' };   // --paper de cada tema (spec §3.1)
// PG2, jornada 15 (12/02/2026): AD Huracán 8–1 Las Mesas Hu.
const DIRECT = '#/partido?s=2025-2026&g=PG2&r=Jornada%2015&h=AD%20Hurac%C3%A1n&a=Las%20Mesas%20Hu.';
const LEGACY = '#section=jornadas&cat=prebenjamin&season=2025-2026&group=PG2&round=Jornada+15';
// El id de cada vista de la Tabla, en el selector de móvil y en el de escritorio (B11).
const VIEW_ID = { Puntos: 'puntos', Goles: 'goles', Forma: 'forma', Casa: 'casa', Fuera: 'fuera', Todas: 'todas' };
// Columnas visibles de la Tabla en cada vista (spec §4.4).
const HEADS = {
  Puntos: '#,Equipo,J,G,E,P,DG,Pts', Goles: '#,Equipo,GF,GC,DG,Pts', Forma: '#,Equipo,J,Últimos 5,Pts',
  Casa: '#,Equipo,J,G,E,P,Pts', Fuera: '#,Equipo,J,G,E,P,Pts', Todas: '#,Equipo,J,G,E,P,GF,GC,DG,Últimos 5,Pts',
};
let browser;

// Lo que miran los escenarios, de una vez.
const snapshot = (page) => page.evaluate(() => {
  const section = document.querySelector('#contenido section[data-screen]');
  const visible = (el) => el.getClientRects().length > 0;
  return {
    hash: location.hash, length: history.length,
    screen: section?.getAttribute('data-screen') ?? null,
    state: section?.getAttribute('data-state') ?? null,
    route: section?.getAttribute('data-route') ?? null,
    h1: document.querySelector('#contenido h1')?.textContent ?? null,
    round: document.querySelector('#contenido .round-title')?.textContent ?? null,
    tabs: [...document.querySelectorAll('.tabbar a.tab[aria-current]')].map((a) => `${a.getAttribute('href')} ${a.getAttribute('aria-current')}`),
    focus: document.activeElement?.id || document.activeElement?.tagName || null,
    heads: [...document.querySelectorAll('#contenido table.standings:not(.group-scorers) thead th')].filter(visible).map((th) => th.textContent).join(','),
  };
});

// Espera a que esté pintada la pantalla `screen` (con ese hash y esa jornada, si se dan).
async function paintedAs(page, screen, { hash = null, round = null } = {}) {
  await waitForAsync(page, ([s, h, r]) => {
    const section = document.querySelector('#contenido section[data-screen]');
    if (!section || section.getAttribute('data-screen') !== s) return false;
    if (h && location.hash !== h) return false;
    return !r || document.querySelector('#contenido .round-title')?.textContent === r;
  }, [screen, hash, round]);
  return snapshot(page);
}

// Sin desplazamiento horizontal, la barra con 4 destinos y, por debajo de 1024 px, fija abajo y sin
// tapar el final de la pantalla; desde 1024 px, pestañas arriba.
async function checkLayout(page, width, label) {
  const m = await page.evaluate(() => {
    const bar = document.querySelector('.tabbar');
    window.scrollTo(0, document.documentElement.scrollHeight);
    const parts = [...document.querySelectorAll('#contenido section[data-screen] > *')];
    const result = {
      overflow: document.documentElement.scrollWidth - innerWidth, height: innerHeight,
      position: getComputedStyle(bar).position, tabs: bar.querySelectorAll('a.tab').length,
      bar: bar.getBoundingClientRect().toJSON(), paper: getComputedStyle(document.body).backgroundColor,
      lastBottom: Math.max(...parts.map((node) => node.getBoundingClientRect().bottom)),
    };
    window.scrollTo(0, 0);
    return result;
  });
  assert.ok(m.overflow <= 0, `${label}: desplazamiento horizontal de ${m.overflow}px`);
  assert.equal(m.tabs, 4, `${label}: barra de 4 destinos`);
  if (width < 1024) {
    assert.equal(m.position, 'fixed', `${label}: la barra, fija abajo`);
    assert.ok(Math.abs(m.bar.bottom - m.height) < 1, `${label}: la barra toca el borde inferior`);
    assert.ok(m.lastBottom <= m.bar.top + 1, `${label}: al final de la pantalla, la barra no tapa el contenido`);
  } else {
    assert.equal(m.position, 'static', `${label}: en escritorio, pestañas arriba`);
  }
  return m;
}

async function scenarios(viewport, colorScheme) {
  const label = `${viewport.width}px en ${colorScheme === 'light' ? 'claro' : 'oscuro'}`;
  const context = await browser.newContext({
    viewport, colorScheme, serviceWorkers: 'block', locale: 'es-ES',
    timezoneId: 'Atlantic/Canary', reducedMotion: 'reduce',
  });
  const errors = [];
  const open = async (hash) => {
    const page = await context.newPage();
    page.setDefaultTimeout(8000);
    page.on('pageerror', (error) => errors.push(`${hash}: ${error.message}`));
    await page.goto(base + hash);
    return page;
  };
  try {
    await useWorld(context, 'A');

    // 1. La portada: Mi equipo marcado en la barra, el tema del sistema y nada tapado.
    const page = await open('#/');
    let s = await paintedAs(page, 'home');
    assert.equal(s.state, 'A', `${label}: la portada del 01/03/2026 está en A`);
    assert.deepEqual(s.tabs, ['#/ page'], label);
    assert.equal((await checkLayout(page, viewport.width, `${label}, portada`)).paper, PAPER[colorScheme], `${label}: fondo del tema`);

    // 2. Jornada por la barra; anterior y siguiente cambian la jornada sin entrada nueva.
    await page.click('.tabbar a.tab[href="#/jornada"]');
    s = await paintedAs(page, 'jornada', { hash: '#/jornada', round: 'Jornada 17 de 30' });
    assert.deepEqual(s.tabs, ['#/jornada page'], label);
    const entries = s.length;
    assert.equal(s.focus, 'H1', `${label}: al cambiar de pantalla, el foco va al h1`);
    await page.click('#contenido #round-prev');
    s = await paintedAs(page, 'jornada', { hash: '#/jornada?s=2025-2026&g=PG2&r=Jornada%2016', round: 'Jornada 16 de 30' });
    assert.equal(s.focus, 'round-prev', `${label}: al cambiar de jornada, el foco se queda en «‹»`);
    await page.click('#contenido #round-next');
    s = await paintedAs(page, 'jornada', { hash: '#/jornada?s=2025-2026&g=PG2&r=Jornada%2017', round: 'Jornada 17 de 30' });
    assert.equal(s.focus, 'round-next', `${label}: al cambiar de jornada, el foco se queda en «›»`);
    assert.equal(s.length, entries, `${label}: cambiar de jornada usa replaceState`);
    await checkLayout(page, viewport.width, `${label}, jornada`);

    // 3. Abrir el partido propio de la jornada (va el primero) y volver con Atrás.
    await page.click('#contenido a.match-row.is-mine');
    s = await paintedAs(page, 'partido');
    assert.equal(s.h1, 'Partido: Las Mesas Hu. – Unión Viera', label);
    assert.equal(s.focus, 'H1', `${label}: en el partido, el foco va al h1`);
    assert.deepEqual(s.tabs, ['#/jornada true'], `${label}: Partido lleva el destino de origen`);
    await checkLayout(page, viewport.width, `${label}, partido`);
    await page.goBack();
    s = await paintedAs(page, 'jornada', { hash: '#/jornada?s=2025-2026&g=PG2&r=Jornada%2017', round: 'Jornada 17 de 30' });

    // 4. Tabla: cada vista, sin entrada nueva, con sus columnas.
    await page.click('.tabbar a.tab[href="#/tabla"]');
    s = await paintedAs(page, 'tabla', { hash: '#/tabla' });
    const tabEntries = s.length;
    const selector = viewport.width < 1024 ? '.tabla-views.is-narrow' : '.tabla-views.is-wide';
    const prefix = viewport.width < 1024 ? 'vista' : 'vista-ancha';
    const views = viewport.width < 1024 ? ['Goles', 'Forma', 'Casa', 'Fuera', 'Puntos'] : ['Casa', 'Fuera', 'Todas'];
    for (const view of views) {
      await page.locator(`#contenido ${selector} a.segment`, { hasText: view }).click();
      await waitForAsync(page, ([sel, v]) => document.querySelector(`#contenido ${sel} a.segment[aria-current]`)?.textContent === v, [selector, view]);
      s = await snapshot(page);
      assert.equal(s.heads, HEADS[view], `${label}: columnas de la vista ${view}`);
      assert.equal(s.focus, `${prefix}-${VIEW_ID[view]}`, `${label}: el foco se queda en el segmento ${view}`);
    }
    assert.equal(s.length, tabEntries, `${label}: cambiar de vista usa replaceState`);
    await checkLayout(page, viewport.width, `${label}, tabla`);

    // 5. «Otro grupo» → Ligas, la pantalla provisional de B3, con Tabla como destino.
    await page.click('#contenido a.screen-action');
    s = await paintedAs(page, 'pendiente');
    assert.equal(s.route, 'ligas', label);
    assert.equal(s.h1, 'Ligas', label);
    assert.deepEqual(s.tabs, ['#/tabla true'], label);
    await checkLayout(page, viewport.width, `${label}, ligas`);
    await page.close();

    // 6. Enlace directo a un partido de mi equipo: Mi equipo marcado y «‹» a su jornada.
    const direct = await open(DIRECT);
    s = await paintedAs(direct, 'partido');
    const fresh = s.length;
    assert.equal(s.h1, 'Partido: AD Huracán – Las Mesas Hu.', label);
    assert.deepEqual(s.tabs, ['#/ true'], `${label}: enlace directo a un partido de mi equipo`);
    await direct.click('#contenido a.back');
    s = await paintedAs(direct, 'jornada', { hash: '#/jornada?s=2025-2026&g=PG2&r=Jornada%2015', round: 'Jornada 15 de 30' });
    assert.deepEqual(s.tabs, ['#/jornada page'], label);
    await direct.close();

    // 7. Enlace antiguo de WhatsApp: se traduce con replaceState, sin entrada nueva.
    const legacy = await open(LEGACY);
    s = await paintedAs(legacy, 'jornada', { hash: '#/jornada?s=2025-2026&g=PG2&r=Jornada%2015', round: 'Jornada 15 de 30' });
    assert.equal(s.length, fresh, `${label}: el enlace antiguo no crea entrada`);
    await checkLayout(legacy, viewport.width, `${label}, enlace antiguo`);
    await legacy.close();

    assert.deepEqual(errors, [], `${label}: sin errores de JavaScript`);
  } finally {
    await context.close();
  }
}

// Mundo E (§11, caso 3): «Las Mesas Hu. B» guardado en FF13 pregunta; la respuesta se guarda en el
// almacén y, al recargar, la portada es la de ese equipo, sin preguntar (M6 de la revisión).
async function answerE() {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 }, serviceWorkers: 'block', locale: 'es-ES',
    timezoneId: 'Atlantic/Canary', reducedMotion: 'reduce',
  });
  try {
    await useWorld(context, 'E');
    const page = await context.newPage();
    page.setDefaultTimeout(8000);
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.goto(`${base}#/`);
    let s = await paintedAs(page, 'home');
    assert.equal(s.state, 'E', 'mundo E: la pregunta');
    const choice = page.locator('#contenido [data-action="elegir"][data-index="0"]');
    const name = await choice.locator('.choice-name').textContent();
    await choice.click();
    await waitForAsync(page, () => document.querySelector('#contenido section[data-screen="home"]')?.getAttribute('data-state') !== 'E');
    const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('futbol-base:v2')).myTeam);
    assert.deepEqual(saved, { name, season: '2025-2026', cat: 'benjamin', groupId: 'A2' }, 'la respuesta se guarda');
    await page.reload();
    s = await paintedAs(page, 'home');
    assert.notEqual(s.state, 'E', 'tras recargar no vuelve a preguntar');
    assert.equal(s.h1, name, 'la portada es la del equipo elegido');
    assert.deepEqual(errors, [], 'mundo E: sin errores de JavaScript');
  } finally {
    await context.close();
  }
}

try {
  browser = await chromium.launch({ executablePath: chrome, headless: true, args: ['--no-sandbox'] });
  for (const viewport of [
    { width: 320, height: 568 }, { width: 390, height: 844 },
    { width: 768, height: 1024 }, { width: 1440, height: 1000 },
  ]) {
    for (const colorScheme of ['light', 'dark']) {
      await scenarios(viewport, colorScheme);
      console.log(`PASS: ${viewport.width}px en ${colorScheme === 'light' ? 'claro' : 'oscuro'}: barra, jornadas, vistas de Tabla, partido con Atrás y con «‹», enlace antiguo y «Otro grupo», el foco en su sitio y sin desplazamiento horizontal`);
    }
  }
  await answerE();
  console.log('PASS: mundo E (§11, caso 3): la respuesta se guarda y, al recargar, la portada de ese equipo sin preguntar');
} finally {
  if (browser) await browser.close();
  server.closeAllConnections();
  await new Promise((resolve) => server.close(resolve));
}
```

`render-smoke.mjs` pinta además el estado D con el mundo D; `pwa-smoke.mjs` comprueba sin conexión el aviso y Jornada; y `tests.yml` instala Playwright antes del `render-smoke`:

```bash
cd /home/manolo/claude/futbol-base
python3 - <<'PY'
from pathlib import Path


def once(src, old, new):
    assert src.count(old) == 1, old
    return src.replace(old, new)


# ── render-smoke.mjs: además de los datos reales, el estado D con fixtures y page.clock ──
p = Path('scripts/tests/render-smoke.mjs')
s = p.read_text(encoding='utf-8')
s = once(s, """import { spawnSync, spawn } from 'node:child_process';
""", """import { spawnSync, spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { useWorld } from './fixture-site.mjs';
""")
s = once(s, """ * Run directly (`node scripts/tests/render-smoke.mjs`) to exercise the real
 * browser harness; in CI it gates. Zero npm deps (node:* only).
 */""", """ * Run directly (`node scripts/tests/render-smoke.mjs`) to exercise the real
 * browser harness; in CI it gates. The real data run with Chrome --dump-dom (node:* only); then
 * the D state runs in the browser over the frozen fixtures (fixture-site.mjs, world D: 23/09/2026,
 * data-health with 2026/27 pending) with the page clock fixed by Playwright (spec §11).
 */""")
s = once(s, """    if (ok) {
      console.log(`PASS: render smoke OK — Mi equipo en estado ${state} (DOM ${dom.length} bytes)`);
      process.exit(0);
    }""", """    if (ok) {
      console.log(`PASS: render smoke OK — Mi equipo en estado ${state} (DOM ${dom.length} bytes)`);
      const problems = await fixtureStateD(chrome, port);
      if (!problems.length) {
        console.log('PASS: estado D con las fixtures y el reloj del 23/09/2026: «Temporada 2026/27», «Así terminó 2025/26», «Verano» y la clasificación final');
        process.exit(0);
      }
      console.error('FAIL: estado D con las fixtures:');
      for (const f of problems) console.error('  - ' + f);
      process.exit(1);
    }""")
s = once(s, """async function main() {""", """// Estado D en el navegador (spec §11): el mundo D de fixture-site.mjs, con los datos congelados,
// data-health con 2026/27 pendiente y el reloj de la página fijado en el 23/09/2026. Devuelve la
// lista de fallos ([] si todo está bien).
async function fixtureStateD(chrome, port) {
  const { chromium } = createRequire(import.meta.url)('playwright');
  const browser = await chromium.launch({ executablePath: chrome, headless: true, args: ['--no-sandbox'] });
  try {
    const context = await browser.newContext({
      viewport: { width: 390, height: 844 }, serviceWorkers: 'block', locale: 'es-ES', timezoneId: 'Atlantic/Canary',
    });
    await useWorld(context, 'D');
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.goto(`http://127.0.0.1:${port}/index.html#/`);
    await page.locator('#contenido section[data-screen="home"][data-state]').waitFor({ timeout: 15000 });
    const dom = await page.content();
    const { failures, state } = checkRenderedDom(dom, { teamName: 'Las Mesas Hu.' });
    const titles = [...dom.matchAll(/<h2 class="block-title">([^<]*)<\\/h2>/g)].map((m) => m[1]);
    const wanted = ['Temporada 2026/27', 'Así terminó 2025/26', 'Verano: Maspalomas Cup 2026', 'Clasificación final'];
    return [
      ...failures,
      ...(state === 'D' ? [] : [`la portada del 23/09/2026 está en ${state}, no en D`]),
      ...wanted.filter((title) => !titles.includes(title)).map((title) => `falta el bloque «${title}»`),
      ...errors.map((message) => `error de JavaScript: ${message}`),
    ];
  } finally {
    await browser.close();
  }
}

async function main() {""")
p.write_text(s, encoding='utf-8')

# ── pwa-smoke.mjs: sin conexión, también Jornada, con el aviso en la cabecera ──
p = Path('scripts/tests/pwa-smoke.mjs')
s = p.read_text(encoding='utf-8')
s = once(s, """  for (const path of ['/fonts/PublicSans-latin.woff2', '/icons/icon-192.png', '/src/screen-home.js', '/acta.css']) {
    assert.ok(precached.includes(path), `${path} is not precached`);
  }
  assert.deepEqual(errors, []);
  console.log(`PASS: de la app anterior (su SW real) al rediseño, con datos congelados: la 1.ª apertura es la anterior; sin conexión a medias, el aviso con «Reintentar»; la 2.ª y la 3.ª, la nueva con acta.css y sin mezclar módulos; ${expected} funciona sin conexión`);""", """  for (const path of ['/fonts/PublicSans-latin.woff2', '/icons/icon-192.png', '/src/screen-home.js', '/src/screen-jornada.js', '/acta.css']) {
    assert.ok(precached.includes(path), `${path} is not precached`);
  }
  // La cabecera avisa de que no hay conexión (spec §4.10).
  await waitForAsync(page, () => document.querySelector('.shell-offline')?.textContent.startsWith('Sin conexión.'));
  // Jornada, por la barra, también sin conexión: su módulo y los datos inmediatos están en caché.
  await page.locator('.tabbar a.tab[href="#/jornada"]').click();
  await page.locator('#contenido section[data-screen="jornada"]').waitFor();
  assert.equal(await page.locator('#contenido section[data-screen="jornada"][data-state="error"]').count(), 0);
  assert.equal(await page.locator('#contenido h1').textContent(), 'Jornada');
  assert.deepEqual(errors, []);
  console.log(`PASS: de la app anterior (su SW real) al rediseño, con datos congelados: la 1.ª apertura es la anterior; sin conexión a medias, el aviso con «Reintentar»; la 2.ª y la 3.ª, la nueva con acta.css y sin mezclar módulos; con ${expected}, la portada y Jornada funcionan sin conexión`);""")
p.write_text(s, encoding='utf-8')

# ── tests.yml: Playwright antes del render-smoke, que ya lo usa para el estado D ──
p = Path('.github/workflows/tests.yml')
s = p.read_text(encoding='utf-8')
s = once(s, """      - name: Render smoke (headless Chrome)
        run: node scripts/tests/render-smoke.mjs
      - name: Install interaction test runner
        run: npm install --no-save --package-lock=false playwright@1.58.0
""", """      - name: Install browser test runner
        run: npm install --no-save --package-lock=false playwright@1.58.0
      - name: Render smoke (headless Chrome; the D state with Playwright)
        run: node scripts/tests/render-smoke.mjs
""")
p.write_text(s, encoding='utf-8')
PY
git diff --stat
```
Esperado:
```text
 .github/workflows/tests.yml         |   6 +-
 scripts/tests/interaction-smoke.mjs | 252 ++++++++++++++++++++++++++++++------
 scripts/tests/pwa-smoke.mjs         |  11 +-
 scripts/tests/render-smoke.mjs      |  46 ++++++-
 4 files changed, 266 insertions(+), 49 deletions(-)
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd /home/manolo/claude/futbol-base
for smoke in render-smoke interaction-smoke pwa-smoke; do node scripts/tests/$smoke.mjs 2>&1 | grep -E '^Error \[ERR_MODULE_NOT_FOUND\]'; done
```
Esperado (`pwa-smoke` falla al importar `render-smoke.mjs`):
```text
Error [ERR_MODULE_NOT_FOUND]: Cannot find module '/home/manolo/claude/futbol-base/scripts/tests/fixture-site.mjs' imported from /home/manolo/claude/futbol-base/scripts/tests/render-smoke.mjs
Error [ERR_MODULE_NOT_FOUND]: Cannot find module '/home/manolo/claude/futbol-base/scripts/tests/fixture-site.mjs' imported from /home/manolo/claude/futbol-base/scripts/tests/interaction-smoke.mjs
Error [ERR_MODULE_NOT_FOUND]: Cannot find module '/home/manolo/claude/futbol-base/scripts/tests/fixture-site.mjs' imported from /home/manolo/claude/futbol-base/scripts/tests/render-smoke.mjs
```

- [ ] **Step 3: Write minimal implementation**

Crear `scripts/tests/fixture-site.mjs`:

```js
// Mundos de fixtures para las pruebas de navegador (spec §11): la app real (index.html, src/,
// acta.css, fuentes y escudos) con los datos de las fixtures congeladas en lugar de los data-*.js
// vivos y un PORTAL fijo en lugar de src/config.js. Así los smoke y las capturas no cambian cuando
// el bot publica datos ni al activar 2026/27. El «hoy» se fija con el reloj de Playwright.
// Lo usan interaction-smoke.mjs, render-smoke.mjs (estado D) y capturas.mjs.
import { fixture } from './fixtures/rediseno/load.mjs';
import { currentAt, nextSeasonRaw } from './fixtures/rediseno/simulate.mjs';

export const STORE_KEY = 'futbol-base:v2';
const DEFAULT_TEAM = { cat: 'prebenjamin', groupId: 'PG2', name: 'Las Mesas Hu.' };
const LAS_MESAS_2526 = { name: 'Las Mesas Hu.', season: '2025-2026', cat: 'prebenjamin', groupId: 'PG2' };
const SEASONS_2526 = [{ name: '2025-2026', current: true }, { name: '2024-2025', current: false }, { name: '2023-2024', current: false }];
const SEASONS_2627 = [{ name: '2026-2027', current: true }, { name: '2025-2026', current: false }, { name: '2024-2025', current: false }];
// data-health.json de las fixtures es el del 23/09/2026 (D y E). En los mundos de otro día, sus
// fechas pasan a la víspera, la comprobación de la noche anterior: la frescura de la portada nunca
// es de un día posterior al «hoy» del mundo.
const HEALTH_DAY = '2026-09-23';
function healthOn(today) {
  const health = fixture('health');
  if (today === HEALTH_DAY) return health;
  const eve = new Date(Date.parse(`${today}T00:00:00Z`) - 86400000).toISOString().slice(0, 10);
  return JSON.parse(JSON.stringify(health).replaceAll(HEALTH_DAY, eve));
}

// data-goleadores.js (23/09/2026), copia literal de las filas de PG2 y A2 que usa la portada
// (las mismas que test_rediseno_portada.mjs): las fixtures de B1 no traen goleadores. Son los de fin
// de temporada; a mitad de temporada, scorersAt los reduce a su día.
const GOL = {
  prebenjamin: [{ id: 'PG2', g: 'PREBENJAMIN GC GRUPO 2', s: [
    ['León Rodríguez, Lucas', 'AD Huracán', 50, 20], ['Rodriguez Aloma, Antoine', 'AD Huracán', 27, 19],
    ['De La Rosa Perello, Theo', 'Las Mesas Hu.', 12, 17], ['Santana Santacruz, Agoney', 'Las Mesas Hu.', 11, 21],
    ['Ruiz Aleman, Einar', 'Las Mesas Hu.', 9, 23], ['Hidalgo Camejo, Pablo', 'Las Mesas Hu.', 8, 18],
    ['Medina Hairach, Nadir', 'Las Mesas Hu.', 8, 21], ['Peña Peña, Alejandro', 'Las Mesas Hu.', 6, 20],
    ['Parcero Ramirez, Neyzan', 'Las Mesas Hu.', 5, 17], ['Hernandez Betancor, Yeudiel', 'Las Mesas Hu.', 4, 5],
    ['Falcon Montilla, Mateo', 'Las Mesas Hu.', 3, 21], ['Morales Gonzalez, Daniel', 'Las Mesas Hu.', 1, 16],
    ['Rodriguez Del Rosario, Yadiel', 'Las Mesas Hu.', 1, 21],
  ] }],
  benjamin: [{ id: 'A2', g: 'BENJAMIN SEGUNDA FASE A-G2', s: [
    ['Espiau Chicoy, Alvaro', 'Las Mesas Hu.', 23, 19], ['Espiau Chicoy, Sergio', 'Las Mesas Hu.', 16, 19],
    ['Rodriguez Montesdeoca, Iker', 'Las Mesas Hu.', 13, 16], ['Lorenzo Hernandez, Joel', 'Las Mesas Hu.', 12, 17],
    ['Navarro Melgar, Lucas', 'Las Mesas Hu.', 9, 16], ['Llarena Moreno, Carlos', 'Las Mesas Hu.', 8, 19],
  ] }],
};

// La clasificación de un día de temporada (B12 de la revisión adversarial). La de las fixtures es la
// final; currentAt quita los marcadores desde `today`, pero no la toca, y a una fecha anterior saldrían
// 28 partidos jugados en marzo. Aquí se recalcula con los resultados del calendario hasta ese día: 3
// puntos la victoria y 1 el empate; por puntos, diferencia y goles a favor, y después el orden
// oficial. Los partidos contra un retirado que no está en el calendario (CD Batán en PG2) cuentan 3–0:
// cada equipo tiene los que la clasificación final le cuenta de más (dos en PG2, uno por vuelta), y
// cada uno cuenta cuando el grupo ha jugado su parte de la temporada (el de la ida, tras la jornada
// 15 de 30). El retirado pierde todos esos. Así, al final sale la clasificación oficial, y a mitad
// de temporada la nota de cobertura cuadra (spec §7). La jornada de la fuente pasa a ser la última
// con algún resultado.
const FINAL = fixture('current-2025-2026');
function standingsAt(raw, today) {
  for (const cat of ['benjamin', 'prebenjamin']) {
    for (const group of raw[cat]) {
      const rounds = Object.values(raw.history[group.id] || {});
      if (!rounds.length || !group.standings.length) continue;
      const blank = (team, order) => ({ team, order, pts: 0, pj: 0, g: 0, e: 0, p: 0, gf: 0, gc: 0 });
      const rows = new Map(group.standings.map((row, i) => [row[1], blank(row[1], i)]));
      const add = (team, gf, gc) => {
        if (!rows.has(team)) rows.set(team, blank(team, rows.size));
        const r = rows.get(team);
        r.pj += 1;
        r.gf += gf;
        r.gc += gc;
        if (gf > gc) { r.g += 1; r.pts += 3; } else if (gf === gc) { r.e += 1; r.pts += 1; } else r.p += 1;
      };
      const played = (m) => m[3] != null && m[4] != null;
      for (const matches of rounds) for (const m of matches.filter(played)) { add(m[1], m[3], m[4]); add(m[2], m[4], m[3]); }
      const inCalendar = new Set(rounds.flatMap((matches) => matches.flatMap((m) => [m[1], m[2]])));
      const gone = group.standings.map((row) => row[1]).filter((team) => !inCalendar.has(team));
      if (gone.length === 1) {
        // Los partidos de más de cada equipo en la clasificación final: los que jugó contra el retirado.
        const final = FINAL[cat].find((g) => g.id === group.id);
        const finalPlayed = new Map();
        for (const matches of Object.values(FINAL.history[group.id] || {})) {
          for (const m of matches.filter(played)) for (const team of [m[1], m[2]]) finalPlayed.set(team, (finalPlayed.get(team) || 0) + 1);
        }
        const reached = (index) => rounds[index] && rounds[index].some(played);
        for (const row of final ? final.standings : []) {
          if (!inCalendar.has(row[1])) continue;
          const extra = Math.max(0, row[3] - (finalPlayed.get(row[1]) || 0));
          for (let k = 1; k <= extra; k++) {
            if (!reached(Math.ceil((k * rounds.length) / extra) - 1)) continue;
            add(row[1], 3, 0);
            add(gone[0], 0, 3);
          }
        }
      }
      const order = [...rows.values()].sort((a, b) => (gone.includes(a.team) - gone.includes(b.team)) || (b.pts - a.pts)
        || ((b.gf - b.gc) - (a.gf - a.gc)) || (b.gf - a.gf) || (a.order - b.order));
      group.standings = order.map((r, i) => [i + 1, r.team, r.pts, r.pj, r.g, r.e, r.p, r.gf, r.gc, r.gf - r.gc]);
      const lastKey = Object.keys(raw.history[group.id]).filter((key) => raw.history[group.id][key].some(played)).pop();
      if (lastKey) group.jornada = lastKey;
    }
  }
  return raw;
}
const seasonAt = (today) => standingsAt(currentAt(today), today);

// Los goleadores de un día (B12): las fixtures no guardan su evolución. Mientras su equipo no ha
// terminado, los goles y los partidos de cada uno se reducen en la proporción de partidos que el
// equipo lleva jugados (los partidos, al menos 1 y nunca más que los del equipo), y se ordenan por
// goles. Una aproximación verosímil, como la clasificación de los demás equipos.
function scorersAt(raw) {
  const played = (groups, id, team) => groups.find((g) => g.id === id)?.standings.find((row) => row[1] === team)?.[3] ?? null;
  const scale = (cat) => GOL[cat].map((entry) => ({
    ...entry,
    s: entry.s.map(([name, team, goals, games]) => {
      const now = played(raw[cat], entry.id, team);
      const end = played(FINAL[cat], entry.id, team);
      if (now === null || !end || now >= end) return [name, team, goals, games];
      return [name, team, Math.round((goals * now) / end), Math.max(1, Math.min(now, Math.round((games * now) / end)))];
    }).filter((row) => row[2] > 0).sort((a, b) => b[2] - a[2]),
  }));
  return { benjamin: scale('benjamin'), prebenjamin: scale('prebenjamin') };
}

// Los mundos con nombre. today: el día en Canarias; current(): la temporada del portal en crudo;
// myTeam: lo que hay guardado (null: almacén vacío, el equipo por defecto); fail: ficheros que
// responden 503.
export const WORLDS = {
  // 01/03/2026: a mitad de temporada, Las Mesas en A (próximo partido en la jornada 18).
  A: { today: '2026-03-01', portalSeason: '2025-2026', current: () => seasonAt('2026-03-01') },
  // 01/10/2026 con 2026/27 activada y sin nada jugado: B.
  B: { today: '2026-10-01', portalSeason: '2026-2027',
    current: () => nextSeasonRaw({ benjamin: ['A1', 'B2', 'FF15'], prebenjamin: ['PG2', 'PG3'] }), gol: false },
  // 03/06/2026: Las Mesas ya jugó la jornada 30 y el grupo no ha terminado: C.
  C: { today: '2026-06-03', portalSeason: '2025-2026', current: () => seasonAt('2026-06-03') },
  // 23/09/2026, los datos de hoy: D con la caja de la temporada siguiente (data-health pendiente).
  D: { today: '2026-09-23', portalSeason: '2025-2026', current: () => fixture('current-2025-2026') },
  // D con «Las Mesas Hu. B» de FF13 guardado: la filial cambia de nombre y se pregunta (E, caso 2b).
  E: { today: '2026-09-23', portalSeason: '2025-2026', current: () => fixture('current-2025-2026'),
    myTeam: { name: 'Las Mesas Hu. B', season: '2025-2026', cat: 'benjamin', groupId: 'FF13' } },
  // 2026/27 sin Las Mesas: X.
  X: { today: '2026-10-01', portalSeason: '2026-2027', current: () => nextSeasonRaw({ benjamin: ['A1'], prebenjamin: ['PG3'] }),
    myTeam: LAS_MESAS_2526, gol: false },
};

// Los ficheros que sirve un mundo, por su nombre (sin ?v=): el cuerpo y su tipo.
function files(w) {
  const raw = w.current();
  const cups = fixture('cups-2025-2026');
  const past = fixture('historical-2024-2025');
  const gol = w.gol === false ? { benjamin: [], prebenjamin: [] } : scorersAt(raw);
  const next = w.portalSeason === '2026-2027' ? '2027-2028' : '2026-2027';
  const js = (pairs) => ({ type: 'text/javascript', body: pairs.map(([name, value]) => `const ${name}=${JSON.stringify(value)};`).join('\n') + '\n' });
  return {
    'src/config.js': { type: 'text/javascript', body: `export const PORTAL = ${JSON.stringify({ season: w.portalSeason, nextSeason: next, defaultTeam: DEFAULT_TEAM, timeZone: 'Atlantic/Canary' }, null, 2)};\n` },
    'data-benjamin.js': js([['BENJAMIN', raw.benjamin]]),
    'data-prebenjamin.js': js([['PREBENJAMIN', raw.prebenjamin]]),
    'data-history.js': js([['HISTORY', raw.history]]),
    'data-goleadores.js': js([['GOL_BENJ', gol.benjamin], ['GOL_PREBENJ', gol.prebenjamin]]),
    'data-matchdetail-keys.js': js([['MATCH_DETAIL_KEYS', {}]]),
    'data-shields.js': js([['SHIELDS', fixture('shields')]]),
    'data-stats.js': js([['STATS', {}]]),
    'data-seasons.js': js([['SEASONS', w.portalSeason === '2026-2027' ? SEASONS_2627 : SEASONS_2526]]),
    'data-maspalomas-cup-2026.js': js([['MASPALOMAS_CUP_BENJAMIN', cups.benjamin], ['MASPALOMAS_CUP_PREBENJAMIN', cups.prebenjamin]]),
    'data-season-2024-2025.js': js([['SEASON_2024_2025', { name: '2024-2025', current: false, benjamin: past.benjamin, prebenjamin: past.prebenjamin }]]),
    'data-matchdetail.js': js([['MATCH_DETAIL', fixture('matchdetail')]]),
    'data-lineups-2025-2026.js': js([['LINEUPS_2025_2026', fixture('lineups-2025-2026')]]),
    'data-health.json': { type: 'application/json', body: JSON.stringify(healthOn(w.today)) },
  };
}

// Instala el mundo `name` en un contexto de Playwright: rutas de los datos y de config.js (el resto
// lo sirve el servidor estático de siempre), el reloj en su día (a mediodía de Canarias) y, si el
// mundo lo trae, mi equipo guardado. `fail`: ficheros que responden 503 (la caja de error).
export async function useWorld(context, name, { fail = [] } = {}) {
  const w = WORLDS[name];
  if (!w) throw new Error(`mundo desconocido: ${name}`);
  const served = files(w);
  await context.route(/\/(src\/config\.js|data-[\w.-]+\.(?:js|json))(\?.*)?$/, (route) => {
    const path = new URL(route.request().url()).pathname.replace(/^\//, '');
    if (fail.includes(path)) return route.fulfill({ status: 503, contentType: 'text/plain', body: 'no disponible' });
    const file = served[path];
    return file ? route.fulfill({ status: 200, contentType: file.type, body: file.body })
      : route.fulfill({ status: 404, contentType: 'text/plain', body: 'no está en el mundo de fixtures' });
  });
  await context.clock.setFixedTime(new Date(`${w.today}T12:00:00Z`));
  if (w.myTeam) {
    await context.addInitScript(([key, value]) => {
      try { if (!localStorage.getItem(key)) localStorage.setItem(key, value); } catch { /* almacén bloqueado */ }
    }, [STORE_KEY, JSON.stringify({ myTeam: w.myTeam, recent: [] })]);
  }
  return w;
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
cd /home/manolo/claude/futbol-base
node scripts/tests/render-smoke.mjs
node scripts/tests/interaction-smoke.mjs
node scripts/tests/pwa-smoke.mjs 2>&1 | grep -v '^PWA fixture HTTP 404 /escudos/s/'
```
Esperado, con el tamaño del DOM del día:
```text
PASS: render smoke OK — Mi equipo en estado D (DOM 12177 bytes)
PASS: estado D con las fixtures y el reloj del 23/09/2026: «Temporada 2026/27», «Así terminó 2025/26», «Verano» y la clasificación final
PASS: 320px en claro: barra, jornadas, vistas de Tabla, partido con Atrás y con «‹», enlace antiguo y «Otro grupo», el foco en su sitio y sin desplazamiento horizontal
PASS: 320px en oscuro: barra, jornadas, vistas de Tabla, partido con Atrás y con «‹», enlace antiguo y «Otro grupo», el foco en su sitio y sin desplazamiento horizontal
PASS: 390px en claro: barra, jornadas, vistas de Tabla, partido con Atrás y con «‹», enlace antiguo y «Otro grupo», el foco en su sitio y sin desplazamiento horizontal
PASS: 390px en oscuro: barra, jornadas, vistas de Tabla, partido con Atrás y con «‹», enlace antiguo y «Otro grupo», el foco en su sitio y sin desplazamiento horizontal
PASS: 768px en claro: barra, jornadas, vistas de Tabla, partido con Atrás y con «‹», enlace antiguo y «Otro grupo», el foco en su sitio y sin desplazamiento horizontal
PASS: 768px en oscuro: barra, jornadas, vistas de Tabla, partido con Atrás y con «‹», enlace antiguo y «Otro grupo», el foco en su sitio y sin desplazamiento horizontal
PASS: 1440px en claro: barra, jornadas, vistas de Tabla, partido con Atrás y con «‹», enlace antiguo y «Otro grupo», el foco en su sitio y sin desplazamiento horizontal
PASS: 1440px en oscuro: barra, jornadas, vistas de Tabla, partido con Atrás y con «‹», enlace antiguo y «Otro grupo», el foco en su sitio y sin desplazamiento horizontal
PASS: mundo E (§11, caso 3): la respuesta se guarda y, al recargar, la portada de ese equipo sin preguntar
PASS: de la app anterior (su SW real) al rediseño, con datos congelados: la 1.ª apertura es la anterior; sin conexión a medias, el aviso con «Reintentar»; la 2.ª y la 3.ª, la nueva con acta.css y sin mezclar módulos; con futbolbase-v20991231a, la portada y Jornada funcionan sin conexión
```

- [ ] **Step 5: Tres pasadas seguidas de los tres smoke**

Ninguno espera un tiempo fijo: cada paso espera a su condición. Tres pasadas seguidas, cada una con los 12 `PASS` y ninguna otra línea:

```bash
cd /home/manolo/claude/futbol-base
for i in 1 2 3; do
  out=$({ node scripts/tests/render-smoke.mjs; node scripts/tests/interaction-smoke.mjs; node scripts/tests/pwa-smoke.mjs; } 2>&1 | grep -v '^PWA fixture HTTP 404 /escudos/s/')
  echo "pasada $i: $(printf '%s\n' "$out" | grep -c '^PASS') PASS y $(printf '%s\n' "$out" | grep -vc '^PASS') líneas más"
done
```
Esperado:
```text
pasada 1: 12 PASS y 0 líneas más
pasada 2: 12 PASS y 0 líneas más
pasada 3: 12 PASS y 0 líneas más
```

- [ ] **Step 6: Suites completas**

```bash
cd /home/manolo/claude/futbol-base
python3 -m pytest scripts/tests/ -q 2>&1 | tail -1
node --test scripts/tests/test_*.mjs 2>&1 | grep -E '^# (tests|pass|fail)'
```
Esperado:
- pytest: el mismo recuento, sin `failed` (`test_workflows.py` sigue encontrando `node scripts/tests/render-smoke.mjs` en `tests.yml`).
- node: el mismo recuento, con `# fail 0`: esta tarea no añade pruebas unitarias, y `test_rediseno_smoke.mjs` sigue importando `checkRenderedDom` de `render-smoke.mjs`.

- [ ] **Step 7: Capturas para el usuario**

Crear `scripts/tests/capturas.mjs`:

```js
// Capturas para el usuario (spec §11, verificación visual antes de publicar): cada pantalla de B2 y
// los estados A, B, C, D, E y X de la portada, más error, vacío y sin conexión, a 390 px en claro y
// en oscuro y a 1440 px en claro. Salen de los mundos de fixtures de fixture-site.mjs (datos
// congelados y reloj fijado), así que no dependen del día. Cada captura es la pantalla entera: la
// ventana crece hasta el alto de la página, con la barra en su sitio.
// Uso, desde la raíz del repo: OUT=<directorio> node scripts/tests/capturas.mjs
import { strict as assert } from 'node:assert';
import { createRequire } from 'node:module';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { startServer, findChrome } from './render-smoke.mjs';
import { waitForAsync } from './browser-wait.mjs';
import { useWorld } from './fixture-site.mjs';

const out = process.env.OUT;
if (!out) { console.error('Falta OUT=<directorio de las capturas>'); process.exit(2); }
mkdirSync(out, { recursive: true });
const { chromium } = createRequire(import.meta.url)('playwright');
const chrome = findChrome();
assert.ok(chrome, 'Chrome is required for the screenshots');

const PARTIDO_J15 = '#/partido?s=2025-2026&g=PG2&r=Jornada%2015&h=AD%20Hurac%C3%A1n&a=Las%20Mesas%20Hu.';
const PARTIDO_J30 = '#/partido?s=2025-2026&g=PG2&r=Jornada%2030&h=Las%20Mesas%20Hu.&a=AD%20Hurac%C3%A1n';
const PARTIDO_ACTA = '#/partido?s=2025-2026&g=A1&r=Jornada%201&h=Guayarmina&a=Santidad';
// [nombre, mundo, ruta, lo que tiene que verse: data-screen y data-state (null: sin estado), opciones]
const SHOTS = [
  ['portada-A', 'A', '#/', ['home', 'A']],
  ['portada-B', 'B', '#/', ['home', 'B']],
  ['portada-C', 'C', '#/', ['home', 'C']],
  ['portada-D', 'D', '#/', ['home', 'D']],
  ['portada-E', 'E', '#/', ['home', 'E']],
  ['portada-X', 'X', '#/', ['home', 'X']],
  ['jornada', 'A', '#/jornada', ['jornada', null]],
  ['tabla', 'D', '#/tabla', ['tabla', null]],
  ['tabla-forma', 'D', '#/tabla?v=forma', ['tabla', null]],
  ['partido', 'D', PARTIDO_J15, ['partido', null]],
  ['partido-acta', 'D', PARTIDO_ACTA, ['partido', null]],
  ['provisional', 'D', '#/explorar', ['pendiente', null]],
  // Error: la temporada 2023-24 no llega (503) → la caja de error de la pantalla, con «Reintentar».
  ['error', 'D', '#/tabla?s=2023-2024', ['tabla', 'error'], { fail: ['data-season-2023-2024.js'] }],
  // Vacío: un partido sin cronología ni acta (spec §4.5 y caso 7 de §11).
  ['vacio', 'D', PARTIDO_J30, ['partido', null]],
  // Sin conexión: el aviso de la cabecera con la fecha de data-health (spec §4.10).
  ['sin-conexion', 'D', '#/', ['home', 'D'], { offline: true }],
];
const VARIANTS = [[390, 844, 'light', 'claro'], [390, 844, 'dark', 'oscuro'], [1440, 900, 'light', 'claro']];

const server = await startServer();
const base = `http://127.0.0.1:${server.address().port}/index.html`;
const browser = await chromium.launch({ executablePath: chrome, headless: true, args: ['--no-sandbox'] });
const problems = [];
let count = 0;
try {
  for (const [name, world, hash, [screen, state], options = {}] of SHOTS) {
    for (const [width, height, colorScheme, theme] of VARIANTS) {
      const label = `${name}-${width}-${theme}`;
      const context = await browser.newContext({
        viewport: { width, height }, colorScheme, serviceWorkers: 'block', locale: 'es-ES',
        timezoneId: 'Atlantic/Canary', reducedMotion: 'reduce',
      });
      try {
        await useWorld(context, world, { fail: options.fail || [] });
        const page = await context.newPage();
        page.setDefaultTimeout(10000);
        page.on('pageerror', (error) => problems.push(`${label}: ${error.message}`));
        await page.goto(base + hash);
        await waitForAsync(page, ([s, st]) => {
          const section = document.querySelector('#contenido section[data-screen]');
          return section && section.getAttribute('data-screen') === s && section.getAttribute('data-state') === st;
        }, [screen, state]);
        // La ventana, del alto de la página: todo queda a la vista y los escudos diferidos cargan.
        const fit = async () => {
          const full = await page.evaluate(() => ({ height: document.documentElement.scrollHeight, overflow: document.documentElement.scrollWidth - innerWidth }));
          if (full.overflow > 0) problems.push(`${label}: desplazamiento horizontal de ${full.overflow}px`);
          await page.setViewportSize({ width, height: Math.max(height, full.height) });
        };
        await fit();
        // Los escudos (o ya su monograma) y la fuente, cargados antes de la foto.
        await waitForAsync(page, () => document.fonts.status === 'loaded'
          && [...document.images].every((img) => img.complete && img.naturalWidth > 0));
        if (options.offline) {
          // Sin conexión, después de cargar: el aviso de la cabecera, con los escudos ya en la página.
          await context.setOffline(true);
          await waitForAsync(page, () => document.querySelector('.shell-offline')?.textContent.startsWith('Sin conexión.'));
          await fit();
        }
        await page.screenshot({ path: join(out, `${label}.png`) });
        count += 1;
        console.log(`${label}: ${screen}${state ? ` (${state})` : ''}`);
      } finally {
        await context.close();
      }
    }
  }
} finally {
  await browser.close();
  server.closeAllConnections();
  await new Promise((resolve) => server.close(resolve));
}
console.log(problems.length ? 'PROBLEMAS:\n' + problems.join('\n') : `OK: ${count} capturas en ${out}`);
process.exit(problems.length ? 1 : 0);
```

```bash
cd /home/manolo/claude/futbol-base
S=/tmp/claude-1000/-home-manolo/db6fd8e0-f1e7-4e94-b6cd-ef7dd5bf6ae9/scratchpad/planB2
mkdir -p "$S"
rm -rf "$S/capturas-b2"
OUT="$S/capturas-b2" node scripts/tests/capturas.mjs
```
Esperado:
```text
portada-A-390-claro: home (A)
portada-A-390-oscuro: home (A)
portada-A-1440-claro: home (A)
portada-B-390-claro: home (B)
portada-B-390-oscuro: home (B)
portada-B-1440-claro: home (B)
portada-C-390-claro: home (C)
portada-C-390-oscuro: home (C)
portada-C-1440-claro: home (C)
portada-D-390-claro: home (D)
portada-D-390-oscuro: home (D)
portada-D-1440-claro: home (D)
portada-E-390-claro: home (E)
portada-E-390-oscuro: home (E)
portada-E-1440-claro: home (E)
portada-X-390-claro: home (X)
portada-X-390-oscuro: home (X)
portada-X-1440-claro: home (X)
jornada-390-claro: jornada
jornada-390-oscuro: jornada
jornada-1440-claro: jornada
tabla-390-claro: tabla
tabla-390-oscuro: tabla
tabla-1440-claro: tabla
tabla-forma-390-claro: tabla
tabla-forma-390-oscuro: tabla
tabla-forma-1440-claro: tabla
partido-390-claro: partido
partido-390-oscuro: partido
partido-1440-claro: partido
partido-acta-390-claro: partido
partido-acta-390-oscuro: partido
partido-acta-1440-claro: partido
provisional-390-claro: pendiente
provisional-390-oscuro: pendiente
provisional-1440-claro: pendiente
error-390-claro: tabla (error)
error-390-oscuro: tabla (error)
error-1440-claro: tabla (error)
vacio-390-claro: partido
vacio-390-oscuro: partido
vacio-1440-claro: partido
sin-conexion-390-claro: home (D)
sin-conexion-390-oscuro: home (D)
sin-conexion-1440-claro: home (D)
OK: 45 capturas en /tmp/claude-1000/-home-manolo/db6fd8e0-f1e7-4e94-b6cd-ef7dd5bf6ae9/scratchpad/planB2/capturas-b2
```

Abrir con Read las 45 capturas de `$S/capturas-b2/` y compararlas con las maquetas de `/home/manolo/backups/futbol-base/rediseno-2026-09-23/maquetas/` (las diferencias que manda la spec están en las Tareas 7 a 11):
- **Portada A** (`portada-A-*`, frente a la maqueta 4): la cabecera de pantalla con escudo, «Las Mesas Hu.», «Prebenjamín, Grupo 2 de Gran Canaria» y «Cambiar»; «Próximo partido» con la jornada 18, «sáb 7 mar», las 09:00 y «faltan 6 días»; Últimos cinco; la clasificación del 1 de marzo (J de 14 a 16, «tras la jornada 17») con la fila propia en fondo rosado, tinta y barra de 3 px, **sin óvalo**; los goleadores del 1 de marzo (a escala: «Theo De La Rosa Perello», 7 goles en 10 partidos; ninguno con más partidos que su equipo), cifras con la cobertura «15 partidos jugados en el calendario y 1 contra CD Batán (retirado)» y la frescura, «comprobada el 28 de febrero a las 21:11». A 1440 px, dos columnas, con el calendario completo a la izquierda.
- **B** (`portada-B-*`): el próximo partido, un único vacío «Aún no se ha jugado ninguna jornada» y la clasificación a cero; nada de 2025/26.
- **C** (`portada-C-*`): «Último partido» con el 2–7 a 40 px, «Ya ha jugado todos sus partidos», la fila de Las Mesas igual que la oficial (9.º, 28 partidos, 37 puntos), la cobertura del caso 6 de §11 («26 partidos en el calendario y 2 contra CD Batán (retirado)») y la frescura del 2 de junio.
- **D** (`portada-D-*`, frente a la maqueta 6-1): «A la espera de la temporada 2026/27», la caja «Temporada 2026/27» sin «Se revisa», «Así terminó 2025/26» con el máximo goleador, «Verano» con «pasó por penaltis (3–2)», «Ver toda la temporada 2025/26» y la clasificación final de cinco filas.
- **E** (`portada-E-*`): la pregunta con «Las Mesas Hu.» y «Las Mesas B» y «Ninguno: buscar otro equipo», sin «Cambiar».
- **X** (`portada-X-*`): «Las Mesas Hu. no aparece en 2026/27» y «Elegir equipo».
- **Jornada** (`jornada-*`, frente a la maqueta 5-1): «‹ Jornada 17 de 30 ›» con sus fechas, los días con el partido propio primero y resaltado, el aviso y la botonera; a 1440 px, los días en dos columnas.
- **Tabla** (`tabla-*` y `tabla-forma-*`, frente a la maqueta 5-2, con la clasificación final de D, «jornada 30, final»): el selector de cinco vistas en móvil y el de Todas, Casa y Fuera en escritorio; en Forma, los círculos G, E y P con su letra y «retirado» en CD Batán; los goleadores del grupo y la procedencia.
- **Partido** (`partido-*`, frente a la maqueta 5-3, el mismo partido): «‹», «Partido», la etiqueta y *Compartir*; el 8–1 a 40 px; los goles en tres columnas con «Yadiel» en tinta; el cara a cara con el partido resaltado y el contexto. **Con acta** (`partido-acta-*`): titulares y suplentes con dorsal y goles, entrenadores, árbitro y «Ver acta oficial».
- **Provisional** (`provisional-*`): «Explorar» y el vacío «Esta pantalla llega en la próxima fase del rediseño.», con Explorar marcado.
- **Error** (`error-*`): «Tabla» y la caja «No se pudieron cargar los datos de la temporada 2023/24.» con «Reintentar».
- **Vacío** (`vacio-*`): el partido del 02/06 sin cronología ni acta, con sus dos vacíos de borde discontinuo.
- **Sin conexión** (`sin-conexion-*`): «**Sin conexión.** Datos del 23/09/2026» arriba del todo, sobre la portada D.
- **En oscuro**, en todas: los tokens oscuros, la P de la forma en claro y nada ilegible. A 390 px, nada se corta ni desborda.

Enviar al usuario las capturas como PNG (spec §11: «revisadas y enviadas al usuario»).

- [ ] **Step 8: Commit**

```bash
cd /home/manolo/claude/futbol-base
git add scripts/tests/fixture-site.mjs scripts/tests/capturas.mjs scripts/tests/interaction-smoke.mjs scripts/tests/render-smoke.mjs scripts/tests/pwa-smoke.mjs .github/workflows/tests.yml
git commit -F - <<'EOF'
test(rediseño): pruebas de navegador de B2 y capturas (B2, tarea 13)

- fixture-site.mjs: mundos de fixtures (A, B, C, D, E y X) con los datos
  congelados, un PORTAL fijo y el reloj de Playwright, para que las
  pruebas de navegador no dependan del día ni de lo que publique el bot.
  La clasificación de A y C es la de su día (B12 de la revisión).
- interaction-smoke: los escenarios de B2 de §11 a 320, 390, 768 y
  1440 px, en claro y en oscuro: barra, jornada anterior y siguiente,
  vistas de Tabla, partido con Atrás y con «‹», enlace antiguo con su
  temporada y «Otro grupo», el foco en el control pulsado (B11), sin
  desplazamiento horizontal; y la respuesta a E, guardada y respetada
  al recargar (M6).
- render-smoke: además de los datos reales, el estado D con las fixtures
  y page.clock; tests.yml instala Playwright antes.
- pwa-smoke: sin conexión, el aviso de la cabecera y Jornada.
- capturas.mjs: las 45 capturas de B2 para revisar y enviar.

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01Sg56KK3oZgo8Ye7Snj6wG9
EOF
git show --stat --oneline HEAD | tail -1
```
Esperado: `6 files changed`.

---

## Para B3 y siguientes

Lo que las tareas de B2 dejan preparado, pendiente o avisado para B3, B4 y B5.

### B3: las pantallas de Explorar

- **Paso 0 de B3: la rama de error del router** (residuo de la re-revisión final de B2). En el `catch` de `run` (`src/router.js`, hacia la línea 410), la caja de error calcula `backHref(route, base?.model)`. En Partido, `parentOf` vuelve a tocar el modelo (`findGroup` → `model.season(s)`); si la temporada está mal formada, lanza dentro del `catch`, `idle()` rechaza y se queda el esqueleto «Cargando…» sin «Reintentar». En f0e6f01 esa ruta sí pintaba la caja de error. Arreglo: `let back = null; try { back = backHref(route, base?.model); } catch { back = backHref(route, null); }`. Prueba con `start()` en `#/partido?s=2021-2022&g=PGC9&r=1&h=A&a=B`, sirviendo un `data-season-2021-2022.js` que se parsea pero cuyo `benjamin` no es un array: tiene que salir la caja de error con «Reintentar».
- **Primer paso de B3, antes de escribir Equipo (I3 de la revisión final de B2).** Las vistas A, B, C y D de Mi equipo dependen de `ctx.resolution` (`screen-home.js`), y `homeState` recibe una resolución: tal como están, la ficha de Equipo (§4.6, «el mismo esqueleto que Mi equipo, con los estados A, B, C o D») tendría que copiar unas 300 líneas o fabricar una resolución falsa. Se extraen a un módulo compartido (o a `ui.js`), parametrizado por `{ group, name }` y unas opciones: la acción de la cabecera («Cambiar» o «Hacer mi equipo»), la caja de la temporada siguiente y el aviso `stale`. Van con ellas `teamCalendar` y el calendario de escritorio (`wideCalendar`), y un solo envoltorio para las filas `summer-row` de «Verano» (`groupPhaseRow` y `bracketRow`). `screen-home.js` (465 líneas tras la revisión final; 510 antes) se queda en la resolución de mi equipo más esa vista. Se decide entonces si `block` admite un bloque sin título: hoy `screen-home.js` escribe a mano dos `<section class="block">` sin `h2`, porque `block()` siempre pinta el título.
- **Registro.** Cada pantalla nueva sustituye a `pendiente` en `SCREEN_MAP` (`src/screens.js`) y entra en `STATIC_ASSETS` de `sw.js`: `test_sw_fixes.mjs` compara la lista con el grafo real de `app.js`. El router resuelve sus parámetros (`resolveParams`: `s` siempre; `g`, y la temporada pendiente, solo en Jornada, Tabla, Partido y Equipo, ver la validación de abajo), su padre (`parentOf` → `#/explorar`), su barra (`activeTab`) y su modo de historial (`q` en Explorar y Goleadores es `replace`), y carga él mismo la temporada pendiente (la regla de abajo).
- **Regla: toda ruta que pueda quedar con la temporada pendiente la carga el router** (I4(a) de la revisión final de B2). Si `resolveParams` devuelve `pending` (una temporada pasada sin cargar: no se puede validar el grupo), el router la carga con `seasonNeeds(s, datasets, portalSeason)` (la opción `loadSeason` de `startRouter`, que las pruebas cambian) junto a los `needs` de la pantalla, y vuelve a resolver la ruta con la temporada ya cargada. Si la carga falla, la caja de error con «Reintentar», que vuelve a pedirla (`ensureSeasonData` no memoriza un fallo). Esto solo vale en las rutas que `resolveParams` deja en `pending`: hoy Jornada, Tabla, Partido y Equipo, y Copa, Goleadores y Récords cuando B3 valide su `g`. En ellas, una pantalla de B3 no necesita `seasonNeeds` para la temporada de su ruta; si la pide igual, es el mismo vuelo. Ligas y Explorar con `s` no quedan en `pending` (`#/ligas?s=2024-2025&…` sale sin cargarla): o piden `seasonNeeds(s)` en sus `needs`, o B3 las añade a `pending`, con su prueba. En todos los casos, las otras temporadas que use (la Trayectoria de Equipo, por ejemplo) las pide en sus `needs` o bajo demanda. Antes, una ruta pendiente cuya pantalla no la pedía enseñaba «No se pudieron cargar los datos de la temporada…» con un «Reintentar» que nunca podía funcionar.
- **Validación de `g` en Copa, Goleadores y Récords** (I4(c)): `resolveParams` solo valida `g` en Jornada, Tabla, Partido y Equipo, y `#/copa?s=2024-2025&g=NOEXISTE` o `#/goleadores?…&g=NOEXISTE` pasan tal cual. B3 la añade al registrar esas pantallas, con su prueba: en Copa, un grupo que no existe lleva a Ligas con aviso, con la misma regla que Tabla (`#/ligas?s&c&to`, «No encontramos el grupo…»). Con la validación, esas rutas también pueden quedar pendientes, y su temporada la carga el router.
- **Enlaces que ya llegan desde B2:**
  - Explorar: `#/explorar#buscar` desde «Cambiar», «Ninguno: buscar otro equipo», «Elegir equipo» y «Búscalo en Explorar»; `#/explorar?q=<t>` cuando un enlace a Equipo no trae `g`.
  - Equipo: `#/equipo?s&g&t` desde las filas de la Tabla y «Ver toda la temporada 2025/26» de D; `…#calendario` desde «calendario completo» de la portada. Su calendario es `teamCalendar(team, group, { today, shields })`, que hoy exporta `screen-home.js` y pasa al módulo compartido del primer paso.
  - Ligas: `#/ligas?s&c&i&to=jornada|tabla` desde «Otro grupo»; `#/ligas?to=jornada|tabla` desde Jornada y Tabla con E o X; `#/ligas?s&c&to` con aviso cuando el grupo de un enlace no existe. Al elegir grupo, vuelve al destino de `to`.
  - Copa: `#/copa?s&g` desde las filas de «Verano», el «‹» de un partido de torneo o de cuadro (`parentOf(route, model)` mira el tipo de grupo, también los MC\* de `model.cups()`; Partido pinta `ctx.backHref`), y la redirección de los grupos que no son de liga (MC\* incluidos).
  - Goleadores: `#/goleadores?s&g&t` desde «ver todos» de la portada y `#/goleadores?s&g` desde la Tabla.
  - Fuentes: `#/fuentes` desde «Ver fuentes» de la frescura.
- **El ancla tras la ruta** (`#buscar`, `#calendario`; I4(b) de la revisión final de B2): el router desplaza hasta ella al avanzar y, si es un control de formulario (`input`, `select`, `textarea` o `button`), tras un push, un pop o un refresh se lleva el foco en lugar del `h1`. Explorar solo tiene que pintar su buscador como `<input id="buscar">`; no lo enfoca en su `mount`, porque el router coloca el foco después de `mount` y lo movería. En la carga inicial no se mueve el foco (decisión 45), y un ancla que no es un control (`#calendario`) solo desplaza: el foco va al `h1` (§8).
- **«Hacer mi equipo»** desde la ficha de un equipo: `nav.saveMyTeam({ name, season, cat, groupId })`. `app.js` lo guarda (en memoria si el almacenamiento falla) y el router vuelve a pintar; `routeIsMine` marca entonces Mi equipo en la barra.
- **Escenarios de B3 de §11** en `interaction-smoke.mjs`, con el mismo mundo A de `fixture-site.mjs`: buscar un equipo y abrir su ficha; «Hacer mi equipo» desde la ficha; «Otro grupo» → Ligas → Tabla (hoy llega a la provisional de Ligas). En `pwa-smoke.mjs`, «y también el buscador» sin conexión. En `capturas.mjs`, una escena por pantalla nueva.
- **`needs(params, datasets, { portalSeason })`** (decisión 129): las pantallas nuevas toman de ahí la temporada del portal, nunca de `config.js`; `test_rediseno_config.mjs` ejecuta sus pruebas con un `config.js` de 2026/27.
- **Foco en las pantallas nuevas.** El router devuelve el foco al control pulsado si el nuevo tiene el mismo `id` (decisión 45): los controles de B3 que cambian la ruta con `replace` (los que escriben la `q` de Explorar y de Goleadores) necesitan un `id` estable, como «‹ ›» de Jornada y los segmentos de Tabla.
- **Pendientes de B1 que no hizo B2:** el texto oculto «ganado», «empatado» o «perdido» en `formChips` (recomendación 4 de B1), cuya mayor consumidora es la vista Forma; y la memorización por grupo (recomendación 3), que aún no hace falta: la Tabla en Forma tarda 3 ms en `render`.
- **Limpieza de `state.js`, hecha en la revisión final de B2 (M5):** se fueron, con sus pruebas, `getData`, `withSeasonCup`, `countStats`, `getSeasonError`, `ensurePlayers`, `phaseIcon`, `unifiedPrebenLeagueGroups`, `validJorGroup`, `jornadaLabel`, `groupJornadaLabel`, `knockoutRoundsSource` y `getPhases`, que leían `PORTAL` y los globales directamente. Ligas, Récords y Copa, sus consumidoras naturales, sacan esos datos del modelo (`datasets`, decisión 129). Queda `countMatches`, sin uso en `src/`, por si Ligas o Récords cuentan partidos. `getCurrentSeason`, si hace falta, es `PORTAL.season` en una línea.
- **Partido:** las temporadas anteriores pierden los equipos renombrados entre fuentes («VICTORIA, REAL CLUB» frente a «RC Victoria»), y el cara a cara de la temporada, el cruce de la otra fase si un equipo cambia de nombre entre fases (decisión 89): los dos pedirían alias.
- **Ayudantes únicos (I2 de la revisión final de B2): B3 los usa, sin copiarlos.** En `ui.js`, `block(título, contenido, { context, id })` (el bloque con título, con un solo orden de argumentos), `shareStatus()` y `sourcePhrase(info)` (la frase de procedencia desde `sourceInfo`; Fuentes sería la tercera pantalla que la dice). En `links.js`, `matchHref(match)`, `teamHref(season, groupId, team)` (los necesitan Equipo, Copa, Récords y Goleadores), `shareAndAnnounce(data, status)` (Compartir con la respuesta de Partido: «Enlace copiado.» o el enlace en la región de estado), `calendarFileName(name)` y `canaryDateTime`, `checkedPhrase` y `checkedCell` (Fuentes enseña comprobaciones con fecha y hora). En `model.js`, `roundOf` y `penaltyWinner` (Copa es la cuarta pantalla con penaltis). En `state.js`, `groupScorers` y `teamScorers` (Goleadores necesita las dos).
- **`data-health.json`** se pide una vez por sesión (M4): `datasets.health` es `undefined` sin pedir y `null` si falló, y con `null` ninguna pantalla lo vuelve a esperar. Una pantalla de B3 que lo necesite (Fuentes) sigue la misma regla que la portada.
- **Dónde van las pruebas nuevas de B3** (M1): el ctx de cada pantalla es `ctxFor(screen, params, { today, datasets, myTeam, portalSeason, legacyDate, lastPrimary })` de `scripts/tests/fixtures/rediseno/screens.mjs`, construido sobre `startContext` de `app.js` y con el `backHref` de `parentOf`; el navegador falso, `fakeBrowser(hash, { storage, deferBack })` de `scripts/tests/fixtures/rediseno/fake-browser.mjs`, el mismo del router y de `start()`. Nada de constructores de ctx ni navegadores falsos propios. La única excepción es el barrido semanal de `test_rediseno_portada.mjs`, que conserva su ctx propio por velocidad: con el común tardaría unos 2,4 s más.
- **Copas en el cara a cara de Partido:** una sola regla para las copas de la federación; hoy entran en las temporadas anteriores y no en la actual (`h2hBlock` frente a `previousMeetings`). §4.5, «de la misma categoría», apunta a incluirlas en las dos; se decide con Copa.
- **«‹» por `goBack()`:** el «‹» del DOM llama a `history.back()` directamente (`onClick` de `router.js`) e `idle()` no espera a esa vuelta; al pasar por `goBack()`, el `back()` de los navegadores falsos tiene que lanzar `popstate` (el común ya lo hace, y con `deferBack`, como uno real).
- **`checkLayout` del partido enlazado directamente** (el 8–1) a 320 y 768 px, al ampliar `interaction-smoke.mjs`: la sonda de la revisión final da 0 de desplazamiento, pero ninguna prueba lo fija.
- **Tiempos agotados de `waitForAsync`** con el escenario, el ancho y el tema en el mensaje, cuando el smoke crezca: abarata el diagnóstico de los fallos de la CI.

### B4: datos, escudos y despliegue

- **Carga de datos** (§12.5, decisión 5): `defer`, la carga perezosa de `data-stats.js` y `data-maspalomas-cup-2026.js`, y la baja de `data-matchdetail-keys.js`. Al retirarlo, lo nombran `test_rediseno_index.mjs` (la lista de los 9 inmediatos), `test_js_modules.mjs`, `test_sw_fixes.mjs` y `test_index_bot_contract.py`, que exige al menos 11 marcas `?v=` en `index.html` y con esos tres ficheros menos se queda por debajo (M6 de la revisión final de B2); y `fixture-site.mjs` sirve un sustituto que sobra.
- **Versionado del grafo de módulos y caché HTTP de 600 s,** cerrado antes de publicar en B5: sin SW, GitHub Pages sirve `src/*.js` con `max-age=600`, y durante 10 minutos un `state.js` o un `links.js` viejos pueden llegar a un `app.js` nuevo (lo dice el comentario del arranque de `index.html`). Los dos SW piden a la red con `cache: 'no-cache'` o `'reload'`. Sin import maps si en la familia hay un iPhone con iOS 15: subirían el suelo de Safari 15.4 a 16.4. Variante que tener en cuenta: el día de la activación, un `config.js` viejo con datos nuevos pondría la etiqueta de 2025/26 a los grupos de 2026/27.
- **El arranque en una función asíncrona,** al reescribir `index.html`: hoy es un `await` de nivel superior en el módulo en línea (Safari < 15 da error de sintaxis y no sale el aviso), aunque ningún móvil que mueva hoy la app lo note (la de producción ya exige Safari 15.4).
- **La limpieza de transición** de `index.html` (decisión 116) se retira después de B5, en el primer despliegue de código en que el SW anterior ya no esté en los móviles; lo decide B4.
- **Miniaturas de escudos (`escudos/s/`):** hasta entonces, cada miniatura da 404 y cae al original. Con ellas, sobra el `grep -v '^PWA fixture HTTP 404 /escudos/s/'` de los pasos de los smoke.
- **PWA:** el `apple-touch-icon` PNG, el manifiesto (`manifest.json` sigue siendo el de la app anterior) y el `preload` (decisión 26); `icons.svg`, que ya nadie usa, se retira.
- **CI:** el filtro de rutas de `tests.yml` todavía no incluye `fonts/**` ni `icons/**`.
- **Torneos perezosos** (M5 de la revisión adversarial): cuando `data-maspalomas-cup-2026.js` pase a cargarse bajo demanda, el `pending` del router tiene que esperar también a los torneos, no solo a las temporadas pasadas: hoy `#/tabla?g=MCP3` lleva a `#/copa` y un partido de la Maspalomas se abre porque `model.cups()` ya está; sin el fichero, irían a Ligas con «No encontramos el grupo» y a «No encontramos ese partido». Hay que hacerlo en `resolveParams` (un grupo MC\* con los torneos sin cargar es `pending`) y en los `needs` de Partido, de la portada en D (Verano) y de Jornada y Tabla (sus redirecciones a Copa), con su prueba.
- **Los datos congelados de `pwa-smoke`** (decisión 130) tienen el formato de hoy. Si B4 cambia el de los datos inmediatos o retira uno (`data-matchdetail-keys.js`), la app anterior sigue necesitando el suyo y la nueva el nuevo: `pwa-smoke` tiene que servir a cada versión el que le corresponde. Cuando todos los móviles tengan el SW nuevo (después de B5), la copia de la app anterior y esa parte de la prueba sobran.
- **Despliegues de código después de B5:** el SW nuevo sigue sirviendo `src/*.js` con *stale-while-revalidate* y los `.css` con *cache-first* (§5.5 no cambia). La limpieza de `index.html` (decisión 116) solo mira las cachés de la app anterior; un despliegue que cambie las exportaciones de `state.js` o `links.js` puede mezclar módulos en una apertura si falla una actualización en segundo plano. B4, al subir `CACHE_NAME` y `?v=` juntos, decide si amplía la limpieza a cualquier caché que no sea la de su versión o versiona el grafo.
- **Versiones:** la subida conjunta de `CACHE_NAME` y `?v=` es del despliegue (decisión 7). Hasta entonces, cada rebase pasa por `scripts/sync_versions.py` (`docs/rediseno-rebase.md`).

### B5: publicación y avisos

- **Al activar 2026/27**, con el almacén vacío la portada es la del equipo por defecto de la temporada nueva (paso 0): con Las Mesas en PG2, B, y la primera pasada de `render-smoke` (datos reales) sigue en verde; solo se pone en rojo si el equipo por defecto no está en la temporada nueva (X), como pide §11 (decisión 29). Cambian, eso sí, las comprobaciones con datos vivos del paso 6 de las Tareas 6 y 12 (`t12-integration-check.mjs` y `app-check.mjs`: «FF5 → A2» y la pregunta de E). Las pruebas con fixtures no cambian.
- **Versión puente** (R2-3 de la revisión, opción a valorar en B5): publicar antes del rediseño una versión de la app vieja cuyo SW ya guarde `acta.css` y los módulos nuevos. Así, sin conexión en plena transición, también abriría la app nueva; sin ella, esa apertura enseña el aviso con «Reintentar» (decisión 131). Coste: un despliegue más y un SW viejo que conozca el grafo nuevo.
- **Con 2026/27 publicada por partes**, el paso 1 puede resolver «Las Mesas Hu.» sin preguntar el primer día; no se guarda (decisión 118), y cuando lleguen los demás equipos de Las Mesas, la carga siguiente pregunta. Si `PORTAL.defaultTeam` cambia de grupo en 2026/27, hay que actualizar `src/config.js` al activar.
- **Lo que se verá en producción y conviene saber:**
  - el aviso de marcador distinto en Partido será frecuente en A1: 18 de 44 actas y 8 de las 434 cronologías de la fixture no suman el marcador;
  - «Ver temporadas anteriores» carga bajo demanda hasta 4 ficheros (unos 0,9 MB);
  - el Contexto de Partido usa la clasificación actual también en partidos antiguos (§4.5, «posición actual»);
  - las filas de 44 px hacen la clasificación de 15 equipos más alta que en la maqueta, y a 320 px algunas casillas parten en dos líneas («sáb 23 / may», «12G 1E / 15P»), sin desplazamiento horizontal.
- **Fixtures:** `currentAt` (B1) conserva la clasificación final, y así la usan las pruebas de Node de la portada (Tareas 7 y 8: su cobertura dice «la clasificación cuenta 28» en marzo). Los mundos de navegador y las capturas ya la recalculan para su día (decisión 126); si B3 quiere lo mismo en Node, `standingsAt` de `fixture-site.mjs` puede pasar a `simulate.mjs`. Los goleadores de las fixtures son los de fin de temporada: los mundos de navegador los reducen a su día (decisión 126), y las pruebas de Node de la portada los usan tal cual.
- **Pruebas de código:** dos pruebas de `test_rediseno_integracion.mjs` todavía leen el texto de `app.js` (los escudos en captura, el aviso sin conexión, la sesión y `saveStore`): un cambio de formato las rompe aunque la conducta siga bien. El guardado al arrancar, la activación por partes, los datos que faltan y los enlaces del router ya se prueban con `start()` de verdad (decisión 127); el resto de la conducta, los smoke.
- **`checkLayout` a 320 px de los partidos jugados y de los estados B a X de la portada:** la sonda de la revisión final sale limpia (0 de desplazamiento), pero ninguna prueba lo fija.
- **«por confirmar»** (la hora de un partido sin hora, `nextBlock` de `screen-home.js`), sin prueba: en la pasada de pruebas.
- **La rama de `standingsContext` con la jornada en curso** («jornada 22», sin «, final»; `screen-tabla.js`), sin prueba.
- **El panel de temporadas anteriores de Partido es «todo o nada»:** con una temporada caída, esconde también las que sí cargaron.
