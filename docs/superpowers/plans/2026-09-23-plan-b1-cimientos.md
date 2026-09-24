# Plan B1: cimientos del rediseño «Acta» — plan de implementación

> **Para agentes:** SUB-SKILL OBLIGATORIA: usar superpowers:subagent-driven-development (recomendado) o superpowers:executing-plans para ejecutar este plan tarea a tarea. Los pasos usan casillas (`- [ ]`).

**Objetivo:** construir, sin tocar la app actual, las piezas puras en las que se apoyarán las pantallas del rediseño, todas con pruebas sobre datos reales congelados:
- plantillas con escapado automático (`html.js`);
- el modelo normalizado de temporadas, grupos y partidos (`model.js`);
- la identidad de club y la resolución de «mi equipo» (`myteam.js`);
- el almacén persistente v2 (`store.js`);
- las rutas nuevas (`links.js`);
- los componentes y el sistema visual en tinta roja (`ui.js`, `style-acta.css`);
- la tipografía alojada (`fonts/`) y los iconos (`icons/`).

**Arquitectura:**
- Módulos ES planos en `src/`, puros e importables en Node sin DOM. **Reciben los datos por parámetro y no leen ningún global `data-*`.** El cableado con los globales llega en B2.
- La app actual (`index.html`, `style.css`, `src/app.js` y sus importaciones) **no se toca ni carga nada nuevo**. `links.js` solo gana exportaciones nuevas.

**Stack:** JavaScript ES2022 (módulos), `node --test` (Node 22), Python 3 para el extractor de fixtures y los iconos, sin dependencias npm ni paso de compilación.

**Spec:** `docs/superpowers/specs/2026-09-23-rediseno-acta-design.md` (§3, §4.1, §4.2, §5.1-§5.6, §6, §7, §11). Ante cualquier duda manda la spec, salvo en las decisiones de la sección siguiente, que la interpretan o corrigen con datos reales.

## Restricciones globales

- **Rama:** `rediseno-acta`, creada desde `main` **después de publicar la reparación de marcadores A2** (rama `a2-marcadores`). Las fixtures se congelan desde ese `main`: los valores que dependen de marcadores (A2 jornada 12, PGC2 2024-25) son los reparados.
- **Cada tarea termina en un commit** con `python3 -m pytest scripts/tests/ -q` y `node --test scripts/tests/test_*.mjs` en verde. Para que corra el CI se abre un PR borrador hacia `main`, porque `tests.yml` no corre en push a otras ramas. **Nunca se hace push mientras corre un workflow de GitHub Actions** (`gh run list --limit 3`).
- **`src/` plano y sin `import()` dinámico.** Los módulos nuevos se pueden importar en Node sin DOM: no usan `document`, `window`, `localStorage` ni `globalThis`. Pueden importar `state.js` y `links.js` (que arrastran `config.js`): lo prohibido es leer globales, no ese grafo.
- **Los módulos nuevos no leen globales `data-*`** (`BENJAMIN`, `HISTORY`, `SHIELDS`…). Reciben los datos por parámetro.
- **Pruebas nuevas:** `scripts/tests/test_rediseno_*.mjs` (los iconos, en Python: `scripts/tests/test_build_icons.py`). Usan solo las fixtures congeladas de `scripts/tests/fixtures/rediseno/` y **nunca leen los `data-*.js` ni `src/config.js` vivos**, que cambian al activar 2026/27 y bloquearían al bot. La única excepción es la prueba de contrato de la Tarea 14, que de los `data-*.js` solo lee los nombres que declaran, nunca sus valores. `today` siempre se inyecta.
- **Tokens visuales exactos (spec §3.1):**
  - claro: paper `#FFFFFF`, text `#1A1F2B`, mute `#5A6272`, ink `#C0182B`, on-ink `#FFFFFF`, rule `#E7B9BE`, line `#ECEEF2`, mark `#FBEDEE`; win `#1B7A43`/on `#FFFFFF`, draw `#E4E7EC`/on `#1A1F2B`, loss `#1A1F2B`/on `#FFFFFF`;
  - oscuro: paper `#15171C`, text `#ECEEF2`, mute `#A3AAB8`, ink `#FF5A64`, on-ink `#15171C`, rule `#5A2A30`, line `#262A33`, mark `#2A1B1E`; win `#3FBF78`/on `#15171C`, draw `#3A3F4A`/on `#ECEEF2`, loss `#ECEEF2`/on `#15171C`.
- **Tipografía:** Public Sans (una familia) y `tabular-nums` en toda cifra. Etiquetas en frase normal, nunca en mayúsculas.
- **Resalte propio:** fondo `--mark`, texto en tinta de peso 800 y `box-shadow: inset 3px 0 0 var(--ink)`. **Nunca el óvalo de bolígrafo.**
- **Nombres (spec §3.5):**
  - `playerName`: «Apellidos, Nombre» pasa a «Nombre Apellidos»; las MAYÚSCULAS a mayúscula inicial; nunca se añaden tildes.
  - `teamShort`: solo en casillas estrechas.
- **Terminología de la interfaz:** Local/Visitante y G/E/P. Nunca «HOME», «AWAY» ni «W/D/L».
- **Escudos:** solo búsqueda exacta o normalizada en `SHIELDS`, **nunca por subcadena** (daría a «UD Las Mesas Huracán» el escudo de AD Huracán).
- **Mensajes de commit:** en español. Terminan con `Co-Authored-By: <modelo que lo escribe> <noreply@anthropic.com>` y `Claude-Session: https://claude.ai/code/session_01Sg56KK3oZgo8Ye7Snj6wG9`. Los bloques de commit de las tareas llevan `Claude Opus 5.5 (1M context)`; si ejecuta otro modelo, pone el suyo.
- **Ficheros del usuario:** `HANDOFF.md` y `docs/mejoras-2026-09.md` nunca se añaden a un commit (`git add` siempre con rutas explícitas).
- **Estado de la shell:** cada bloque empieza con `cd /home/manolo/claude/futbol-base`. Sin `sleep` en primer plano.
- **Recuentos de pruebas:** los pasos dan el número de pruebas **del fichero nuevo** y, para la suite completa, «el recuento anterior más N, sin fallos». Los totales absolutos cambian según lo que haya en `main`.

## Decisiones que interpretan la spec

Cada una tiene su prueba en la tarea que la implementa. Si un revisor prefiere la lectura literal, el cambio es local y está indicado.

1. **`defaultRound` va por fecha:** la jornada del primer partido `pendiente` por fecha (a igual fecha, la primera jornada), sin contar los partidos contra retirados. La lectura literal en orden de jornada cae en la jornada de un aplazado en 326 de 1.650 situaciones reales (A2 el 10/01/2026: jornada 2 en lugar de la 4). Es el mismo criterio que «próximo partido». (Tarea 5)
2. **«Grupo terminado» en `retiredTeams`** (que no recibe `today`): la última jornada tiene algún marcador. La regla 2 (en el calendario, sin fila y sin resultados) solo se aplica con clasificación no vacía y algún marcador en el grupo; sin esa guarda, al empezar 2026/27 todos los equipos serían retirados. En la regla 1, «no aparece en el calendario» solo se exige con `pj > 0`: los 6 equipos reales con `pj = 0` en un grupo terminado sí aparecen en el calendario (sin ningún marcador), y con la lectura literal esa rama no saltaría nunca. Un equipo con algún marcador nunca es retirado. (Tarea 5)
3. **Forma:** nueva exportación `lastResults(team, group, n = 5)` en `model.js`, en orden cronológico (el más antiguo primero). La usan «Últimos cinco», la vista Forma y la línea «Contexto» de la ficha de partido. (Tarea 5)
4. **`resolveMyTeam(myTeam, season, index, todayISO)`:** `season` es siempre la `Season` de `PORTAL.season`; su `name` hace de temporada del portal. B2 nunca le pasa un archivo. (Tarea 8)
5. **`homeState({ resolution, todayISO, portalSeason })` sin `health`:** según §4.2, D no depende de `data-health`; la caja de la temporada siguiente la decide `showNextSeasonBox`. (Tarea 9)
6. **A y C se deciden con los partidos de mi equipo**, no con los del grupo: así A garantiza un próximo partido propio (RC Victoria en PG2 el 01/06/2026 queda en C). (Tarea 9)
7. **Enlaces antiguos:** `translateLegacy` conserva `c` (la categoría) en `#/ligas`, `#/records` y `#/goleadores` sin `g`. La fila `section=goleadores` sigue la tabla de §4.1 (`#/goleadores?g=<group>`), aunque el `group` antiguo fuera el de la jornada. (Tarea 7)
8. **Cronología:** `'CD Calero|La Garita|1-11'` es hoy una entrada única de FF15 (el 1-11 de PG2 no tiene cronología) y no hay entradas `{dup, list}` reales: las pruebas de duplicados son sintéticas. (Tareas 1 y 6)
9. **`migrateV1`** devuelve un favorito de torneo (MC\*) tal cual; `resolveMyTeam` trata un `groupId` inexistente en la temporada como paso 2, sin lanzar. (Tareas 8 y 10)
10. **Paso 0 de `resolveMyTeam`: solo fases posteriores.** El cambio de fase y la «filial que cambia de nombre» solo miran los grupos de liga de su categoría con un nivel de fase mayor que el del grupo guardado (el nivel que usan los candidatos, vía `competitionKey`), nunca los de la misma fase. Con la lectura literal de §6.3, un equipo recibiría una pregunta falsa al acabar su grupo mientras otro equipo de su club sigue jugando en la misma fase: FF5 «Las Mesas Hu.» el 08/11/2025, por «Las Mesas Hu. B» de FF13, o A4 UD Vecindario del 23 al 28/05/2026. (Tarea 8)
11. **El mismo nombre en varios grupos:** los candidatos son uno por grupo y nombre, nunca se deduplican por nombre. Si el nombre exacto está en más de un grupo de la fase posterior, no se elige el primero: estado E con esos grupos, que la etiqueta de grupo distingue (Santa Brígida, de FF9, está en B1 y en B2). Como un equipo puede tener a la vez partidos pendientes en dos fases, la «fase más reciente» de §6.3 es la más alta de las que tienen partidos pendientes; si no, el mismo equipo saldría dos veces. (Tarea 8)
12. **El cambio de fase no depende de partidos pendientes.** Si el grupo guardado ya no tiene partidos `pendiente` y el nombre exacto está en un único grupo de fase posterior, se pasa a él en silencio aunque también haya terminado, salvo en los casos de las decisiones 16 y 17: a final de temporada, FF5 guardado pasa a A2, y la portada D enseña la tabla de A2 y no la de la Primera Fase. La filial que cambia de nombre también se pregunta con la fase posterior ya terminada. `updatedMyTeam(myTeam, resolution)` da el `myTeam` nuevo cuando una resolución `ok` cambia algo, y B2 lo guarda. (Tarea 8)
13. **Paso 1 con un solo candidato:** como en el paso 2, se usa sin preguntar solo si tiene el mismo nombre y la misma categoría; en cualquier otro caso, estado E con ese candidato. Así un candidato falso nunca produce un cambio silencioso, como pide el riesgo aceptado de §6.1 («Balos B» → «Balos» pregunta). (Tarea 8)
14. **Fecha de la fila frente a la clave de ronda:** si la clave trae la fecha completa (`DD-MM-YYYY`) y la fila solo `DD/MM` del mismo día y mes, manda el año de la clave. Una final del 14-08-2027 en la temporada 2026-2027 no cae en 2026; en julio ya basta la decisión 18. (Tarea 3)
15. **Casa y Fuera en escritorio:** el selector no desaparece desde 1024 px, al contrario de lo que dice §4.4. B2 le pasa «Todas», «Casa» y «Fuera», y en móvil las cinco vistas. El CSS no oculta `.segmented` en escritorio y `standingsTable` admite `casa` y `fuera` en cualquier ancho. (Tareas 11 y 12)
16. **Segunda Fase publicada grupo a grupo:** en el paso 0, mientras el club tenga en la fase posterior menos equipos que en la fase del grupo guardado (sin contar los retirados de esa fase, que nunca aparecen en la posterior), ni se cambia ni se pregunta: sigue el grupo guardado (C o D, según toque). Así ninguna familia recibe una pregunta falsa ni un cambio porque el grupo de un hermano se publique antes que el suyo, y Santa Brígida (FF9), con su filial en FF3, espera a que existan B1 y B2 y entonces pregunta. Si el club nunca llega a tener tantos equipos en la fase posterior (un filial eliminado), la familia se queda con su grupo de la Primera Fase; con un filial retirado, como 'CORRALEJO, C.D. "B"' en FV11, «CD Corralejo» pasa a FP. (Tarea 8)
17. **El mismo nombre en dos grupos de la fase guardada** son dos equipos distintos (CD Batán en FF10 y FF12, Valsequillo en FF14 y FF17, Peña Amistad en FV12 y FV13): nunca hay cambio silencioso; se pregunta con los equipos del club en la fase posterior. (Tarea 8)
18. **Julio es del año final de la temporada** en el modelo: una fecha `DD/MM` de julio sin año cae en el año final (los torneos de verano), no en el primero como en `fixtureISO`, que usa la app actual y no cambia. En 2026-2027, «01/07» es el 01/07/2027, y el partido del 30/06/2027 sigue pendiente el 29/06. (Tarea 3)
19. **«Verano» por equipo del torneo:** `summerCups` devuelve `[{ group, team, rows }]`. En cada grupo de torneo de su categoría, `team` es el equipo del club con la misma letra de filial que `myTeam.name` (la última palabra, si es una sola letra de la A a la E; sin letra, la A) y `rows` trae solo sus partidos; si no hay ninguno con esa letra, o hay dos, el grupo no sale, porque es mejor quedarse sin «Verano» que enseñar el de otro equipo. El equipo sin letra del torneo también cuenta como el A, así que un filial B no ve como suyo el torneo al que fue el equipo sin letra de su club. Con la lectura literal de §6.4 (los grupos con cualquier equipo del club), «Arucas» (A1) recibía los grupos y los partidos de Arucas CF A, B, C y D. (Revisión final, I1)
20. **Primera Fase sin salida: `stale` y alias.** En el paso 0, si el grupo guardado no tiene partidos pendientes y la fase posterior de su categoría e isla tiene grupos de liga con partidos pendientes, ningún equipo del club y al menos 7 días en marcha (su primer partido con fecha es de hace 7 días o más), sigue el grupo guardado, sin cambio ni pregunta, con `stale: true` en la resolución `ok`: `updatedMyTeam` no lo guarda y B2 lo avisa en C y D. La semana de espera evita el aviso mientras la fase se publica grupo a grupo. Si el club tiene algún equipo en esa fase, aunque sean menos, se espera sin marca (decisión 16), y con la fase posterior terminada o inexistente tampoco hay marca. Además, `TEAM_ALIASES` suma los cinco pares reales de 2025-26 que se quedaban así de noviembre o diciembre a junio: «Loz Vélez» → «Los Vélez» (FF20 → C3), «M. Training B» → «Maspa Training B» (FF21 → A3), «C. Pastores B» → «Casa Pastores B» (FF21 → C4), «INTER FUERTEVENTURA, C.D.» → «Inter FTV» (FV11 → FO) y 'BALOMPEDICA ISLA TRANQUILA, C.D. ATLETICO "A"' → «Balompédica» (FV14 → FP). (Revisión final, I2)

## Foco de revisión

Entradas que la spec implica y que más pueden morder a una familia que usa la app. Cada una está fijada por una prueba de la tarea indicada.

1. **Activación de 2026/27:** clasificación vacía o a cero, jornadas sin marcadores y fechas futuras. Nada lanza, no hay retirados, la portada queda en B y la jornada por defecto es la primera. (Tareas 5 y 9)
2. **Nombres con comillas, puntos, tildes y paréntesis** (`MESAS, U.D. LAS "B"`, `Pto.del Carmen`, `06-06-2026 ( Final )`): ida y vuelta exacta por las rutas y escapado en texto y atributos del HTML. (Tareas 2, 7 y 12)
3. **Almacenamiento roto:** modo privado que lanza, cookies bloqueadas (solo leer el Storage ya lanza), JSON ilegible o favoritos v1 antiguos. La app arranca con el equipo por defecto y nunca lanza. (Tarea 10)
4. **Fechas en tres formatos o ausentes** (`DD/MM` de temporadas pasadas, `DD-MM-YYYY` de Fuerteventura, `''`): el año sale de la temporada, y un partido sin fecha nunca es próximo ni cuenta para la jornada por defecto. (Tareas 3, 5 y 9)
5. **Claves de cronología compartidas** entre grupos o temporadas (`CD Calero|La Garita|1-11`, `RC Victoria|AD Huracán|0-6`, `Guayarmina|UD Guía|8-1`): nunca se muestra la cronología de otro partido. (Tarea 6)

## Estructura de ficheros

| Fichero | Responsabilidad |
|---|---|
| `src/html.js` | `html` (plantilla con escapado automático), `raw`, `join`, `escape` |
| `src/model.js` | Modelo normalizado (§5.3) y funciones puras de temporada, grupo, partido y nombres |
| `src/myteam.js` | Identidad de club (union-find), resolución de mi equipo, `homeState`, verano |
| `src/store.js` | Almacén `futbol-base:v2` y migración desde v1 |
| `src/links.js` (modificar, solo añadir) | `parseRoute`, `routeHref`, `translateLegacy`, `countdownLabel` |
| `src/ui.js` | Componentes HTML puros del sistema visual (§3.3) |
| `style-acta.css` | Tokens claro/oscuro y clases de componentes. **No lo enlaza nadie todavía** |
| `fonts/PublicSans-latin.woff2` y `fonts/OFL.txt` | Public Sans variable, subconjunto latino, y su licencia |
| `icons/icon-180.png`, `icons/icon-192.png`, `icons/icon-512.png`, `icons/icon-maskable-512.png` | Iconos de la PWA |
| `scripts/build_icons.py` | Genera los iconos (Pillow) |
| `scripts/tests/test_build_icons.py` | Pruebas de los iconos (pytest; sin Pillow solo leen la cabecera PNG) |
| `scripts/tests/fixtures/rediseno/*.json` | Datos reales congelados; los genera `build_fixtures.mjs` una vez |
| `scripts/tests/fixtures/rediseno/build_fixtures.mjs` | Extractor (se ejecuta una vez; su salida se commitea) |
| `scripts/tests/fixtures/rediseno/load.mjs` | `fixture(name)` y ayudas de carga para las pruebas |
| `scripts/tests/fixtures/rediseno/simulate.mjs` | Ayudas de las Tareas 5, 8 y 9: la temporada congelada a una fecha (`currentAt`, Tarea 5), una 2026/27 simulada (`nextSeasonRaw`) y el universo de nombres (`teamNames`), estas dos de la Tarea 8 |
| `scripts/tests/test_rediseno_*.mjs` | Pruebas nuevas |

## Contratos (los usan todas las tareas: nombres y formas exactos)

Lo que sigue son los nombres, parámetros y formas que producen las tareas, comprobados al ejecutarlas. Lo que difiere de §5.3 o §5.6 de la spec está reunido al final de esta sección, con su motivo.

### Fixtures (`scripts/tests/fixtures/rediseno/`)

Datos reales de `main` (con la reparación A2 publicada) congelados por `build_fixtures.mjs` (Tarea 1). Las pruebas los leen con `fixture(name)`, nunca desde los `data-*.js` vivos.

| Fichero | Contenido |
|---|---|
| `current-2025-2026.json` | `{ season: "2025-2026", benjamin: [A1, A2, B1, B2, FF5, FF9, FF13, FF15], prebenjamin: [PG2, PG3, PFV2], history: { <código>: HISTORY[código] } }`. FF9 y B1 están por Santa Brígida, que juega FF9 y, en la Segunda Fase B, tiene el mismo nombre en B1 y en B2.<br>Grupos tal cual en `data-benjamin.js` y `data-prebenjamin.js`: `id, name, fullName, phase, island, url, jornada, standings, matches, standingsKind`. La clasificación va en filas de 10 columnas `[pos, equipo, pts, pj, g, e, p, gf, gc, dg]`; `matches` trae en línea (7 columnas) solo la jornada en curso, y no se usa.<br>`history[código]` es `{ <clave de jornada>: filas de 8 columnas [fecha, local, visitante, gl, gv, pen, hora, campo] }`: claves `'Jornada N'` (en PFV2, `'1'` a `'14'`), fechas `AAAA-MM-DD` (en PFV2, `DD-MM-AAAA`, y `''` en los 14 partidos de CD Teguinte), y hora y campo `''` o `null` cuando faltan |
| `historical-2024-2025.json` | `{ season: "2024-2025", benjamin: [P1], prebenjamin: [PGC2] }` con la forma de `SEASON_2024_2025`: `id, name, fullName, phase, island, current_jornada, standings, jornadas`. Filas de 8 columnas, fechas `DD/MM`, y hora y campo `''` si faltan. PGC2 trae 22 partidos sin fecha ni marcador de Simusetti, que no está en la clasificación |
| `cups-2025-2026.json` | `{ benjamin: [MCB16, MCBK2], prebenjamin: [MCP3, MCPK1] }`, **sin `season`**: las pruebas llaman a `buildCups({ season: '2025-2026', ...fixture('cups-2025-2026') })`.<br>Fase de grupos (MCB16 y MCP3): clasificación de 4 filas y `matches` en línea de 7 columnas `[día, hora, local, visitante, gl, gv, campo]`, con `jornada: 'Fase de Grupos'` y sin `jornadas`.<br>Cuadros (MCBK2 y MCPK1): `standings: []` y `jornadas` de 9 columnas `[día, local, visitante, gl, gv, pen, hora, campo, tanda]`; también traen `matches` en línea, que no se usan |
| `matchdetail.json` | 434 entradas de `MATCH_DETAIL`, todas `{s, gr, g}`, con `g` en filas `[minuto, nombre, 'h-a', 'h' \| 'a', tipo]`: las de los partidos de las fixtures, las etiquetadas con un grupo actual de las fixtures y la clave `CD Calero\|La Garita\|1-11` (de FF15). No hay entradas `{dup, list}` reales |
| `lineups-2025-2026.json` | Las 44 actas de A1 de `LINEUPS_2025_2026`: `{home, away, events, coachH, coachA, ref, s, gr, cod}` |
| `shields.json` | 174 claves de `SHIELDS`: las que casan con algún nombre de equipo de las fixtures (exacto, normalizado o por inclusión) y todas las que comparten fichero con ellas, entre ellas «L.Mesas Hu. B», 'MESAS, U.D. LAS "B"' y «RC Victoria B» |
| `health.json` | `data-health.json` literal: `{version, season, groups, nextSeason: {name: "2026-2027", status: "pending"}, checkedAt, lastDataChange, dataVersion, summary}` |
| `phases.json` | Los 191 grupos de la base en las 5 temporadas: `[{season, cat, code, phase, island, name}]`, con `cat` en minúsculas. No incluye la Maspalomas Cup |
| `favorites-v1.json` | `{"teams":[{"name":"Las Mesas Hu.","cat":"prebenjamin","groupId":"PG2"},{"name":"AD Huracán","cat":"prebenjamin","groupId":"PG2"}],"selected":"prebenjamin\|PG2\|las mesas hu"}` |

Ayudantes de las pruebas:

```js
// load.mjs (Tarea 1)
export const FIXTURE_DIR                   // carpeta de las fixtures
export const FIXTURE_NAMES                 // los 9 nombres de la tabla, sin «.json»
export function fixture(name)              // lee y parsea <name>.json en cada llamada (copia nueva); lanza Error('fixture desconocida: <name>')

// simulate.mjs (currentAt en la Tarea 5; las otras dos, en la Tarea 8)
export function currentAt(todayISO)        // copia de current-2025-2026 con el marcador de los partidos de todayISO en adelante a null
export function nextSeasonRaw({ benjamin = [], prebenjamin = [] })  // crudo 2026-2027 con esos grupos: mismas jornadas un año después, sin marcadores y clasificación a cero
export function teamNames(...collections)  // nombres de equipo de Season y Cups ya construidos
```

### `src/html.js`

```js
export class Html { constructor(s) { this.s = s; } toString() { return this.s; } }
export function escape(value)              // null/undefined → ''; escapa & < > " ' (el apóstrofo como &#39;)
export function html(strings, ...values)   // → Html; escapa cada interpolación salvo Html y arrays (se unen sin separador); null, undefined y false no pintan nada
export function raw(value)                 // → el mismo Html; TypeError con cualquier otra cosa
export function join(items, sep = '')      // → Html; salta null, undefined y false, y escapa el separador si no es Html
```

### `src/model.js`

```js
// Tipos (spec §5.3). Match no lleva `state`: el estado depende del día y se pide a matchState.
// Row    { pos, team, pts, pj, g, e, p, gf, gc, dg, retired }   // retired: lo rellena buildGroup con retiredTeams
// Match  { season, groupId, roundKey, dateISO, time, venue, home, away, hs, as, advancer, shootout }
//          dateISO 'AAAA-MM-DD' | null; time y venue texto | null; hs y as número | null;
//          advancer 'home' | 'away' | null (solo en cuadros); shootout 'h-a' | null
// Round  { key, label, n, dateFrom, dateTo, matches: Match[] }  // key: la de la fuente; n: jornadaNumber(key) | null
// Group  { season, id, cat, name, fullName, phase, island, url, standingsKind, kind, compKey, label,
//          standings: Row[], rounds: Round[], currentRound }
//          kind 'league' | 'cup-bracket' | 'cup-league'; compKey = competitionKey({ ...raw, cat }, season).key (cadena);
//          label = groupLabel(group); currentRound: clave de la ronda en curso | null; url y standingsKind: el dato | null
// Season { name, current, groups: Group[] }     Cups { season, groups: Group[] }   // sin `cat`: cada Group ya la lleva

export function rowToMatch(row, { season, groupId, roundKey } = {})        // filas de 5, 6, 8 y 9 columnas; RangeError con otra longitud; TypeError sin temporada AAAA-AAAA
  // dateISO: la fecha de la fila o, si no trae, la de la clave de ronda; julio sin año es del año final de
  // la temporada (decisión 18), y una fila DD/MM del mismo día que una clave con fecha completa toma el
  // año de la clave (decisión 14)
export function inlineRowToMatch(row, { season, groupId, roundKey } = {})  // 7 columnas: [día, hora, local, visitante, gl, gv, campo]
export function buildGroup(raw, { season, cat, current = false, history = null } = {})  // → Group
export function buildSeason({ name, current = false, benjamin = [], prebenjamin = [], history = null } = {})  // → Season; history solo si current
export function buildCups({ season, benjamin = [], prebenjamin = [] } = {})  // → Cups
export function groupKind(raw, rounds = [])                                // 'league' | 'cup-bracket' | 'cup-league'
export function matchState(match, todayISO)                                // 'jugado' | 'pendiente' | 'sin resultado' | 'sin fecha'; TypeError si todayISO no es AAAA-MM-DD
export function competitionKey(raw, season)                                // {cat, island, division, phase, cup, key, label}; label: nombre de la competición («Segunda Fase A»)
export function groupLabel(group)                                          // «Prebenjamín, Grupo 2 de Gran Canaria»
export function retiredTeams(group)                                        // Set<string>
export function groupFinished(group, todayISO, portalSeason)               // boolean (§4.2 D)
export function defaultRound(group, todayISO)                              // Round | null: la del primer partido pendiente por fecha (decisión 1)
export function roundNotice(group, round)                                  // null | { kind: 'sin-partido' | 'faltan', teams: string[], retired: string[], missing: number }
export function coverageNote(team, group)
  // → null | { played, calendar, vsRetired, retired: string[], withResult }: played, el PJ oficial; calendar, sus
  //   partidos del calendario sin retirados (también los futuros); withResult, los que tienen marcador; vsRetired,
  //   los del calendario contra retirados más lo que la clasificación cuenta de más si un retirado no está en el
  //   calendario, medido con los partidos con resultado (pj − withResult), nunca con el calendario entero, y como
  //   mucho tantos como veces se enfrenta a cualquier otro rival; null si withResult explica todo el PJ
export function homeAwayTable(group, side)                                 // side 'casa' | 'fuera' → Row[] de esa condición, pos 1..N y retirados al final; RangeError con otra condición
export function seasonSummary(team, group)
  // → { pos, of, pts, g, e, p, gf, gc,         // de la clasificación: null sin fila; of cuenta los retirados
  //     perMatch: { gf, gc } | null,            // medias sin redondear
  //     home, away: { pj, g, e, p, gf, gc, pts },  // del calendario, sin partidos contra retirados
  //     best, worst, last,                      // con la forma de lastResults, o null; worst solo si hay derrotas
  //     coverage }                              // coverageNote(team, group)
export function lastResults(team, group, n = 5)
  // → [{ match, letter: 'G' | 'E' | 'P', gf, gc, rival, side: 'casa' | 'fuera' }], del más antiguo al más reciente
  //   (por fecha; a igual fecha, por jornada), sin partidos contra retirados; [] si el grupo no es de liga
export function teamFixtures(team, group, todayISO)
  // → { next, last, played, undated, remaining }, sin partidos contra retirados: next, el primer `pendiente` por
  //   fecha (el «Próximo partido» de §4.2) o null; last, el último jugado o null; played, undated y remaining,
  //   cuántos hay jugados, sin fecha y todavía sin resultado
export function headToHead(group, a, b)                                    // Match[] entre a y b en ese grupo, en los dos sentidos y por fecha
export function bestStreaks(season, cat)                                   // { wins: [{team, n, groupId}], unbeaten: [...] }, de mayor a menor
export function playerName(raw)                                            // §3.5; '' si llega vacío o null
export function teamShort(name)                                            // §3.5; nunca vacío si name tiene letras
export function timelineFor(match, matchDetail, lineups)
  // → null | { source: 'futbolaspalmas' | 'acta', goals: [{ minute, score, side: 'home' | 'away', name }],
  //            mismatch: null | { timeline: 'h-a', score: 'h-a' } }; minute, score y name pueden ser null
```

### `src/myteam.js`

```js
export const TEAM_ALIASES = {                            // el de la Maspalomas (spec) y los cinco de la decisión 20
  'UD Las Mesas Huracán': 'Las Mesas Hu.', 'Loz Vélez': 'Los Vélez', 'M. Training B': 'Maspa Training B',
  'C. Pastores B': 'Casa Pastores B', 'INTER FUERTEVENTURA, C.D.': 'Inter FTV',
  'BALOMPEDICA ISLA TRANQUILA, C.D. ATLETICO "A"': 'Balompédica',
};
export function baseKey(name)                            // normalizeForTeamsMapping sin siglas (rc, us, cda, cef) ni última letra [a-e] suelta
export function buildClubIndex(names, shields = {}, aliases = TEAM_ALIASES)
  // → { same(a, b), members(name) }; aristas: fichero de escudo (exacto o normalizado, nunca por subcadena), baseKey y alias
export function sameClub(index, a, b)                    // → boolean
export function resolveMyTeam(myTeam, season, index, todayISO)
  // myTeam {name, season, cat, groupId}; season: SIEMPRE la Season de PORTAL.season (decisión 4)
  // → {status: 'ok', group, name, cat, stale?: true} | {status: 'ask', candidates: [{group, name, cat}]} | {status: 'absent'}
  //   paso 0 solo con fases posteriores, y solo cuando el club ya tiene en ellas tantos equipos como en la
  //   suya, sin contar sus retirados (decisiones 10 a 12, 16 y 17); candidatos uno por grupo y nombre (decisión 11),
  //   en el orden de season.groups, primero los de myTeam.cat; pasos 1 y 2: un solo candidato se usa sin
  //   preguntar solo con el mismo nombre y la misma categoría (decisión 13); stale: true solo en el paso 0, cuando
  //   sigue el grupo guardado y la fase posterior de su categoría e isla tiene partidos pendientes, ningún
  //   equipo del club y su primer partido con fecha 7 días o más antes de todayISO (decisión 20); si no, la
  //   clave no está
export function updatedMyTeam(myTeam, resolution)       // { name, season, cat, groupId } nuevo si una resolución `ok` cambia algo; si no, null. Ignora stale
export function homeState({ resolution, todayISO, portalSeason })
  // 'E' | 'X' | 'D' | 'B' | 'C' | 'A' (sin health: decisión 5); A si teamFixtures da next; C si mi equipo ha
  // jugado y no tiene next; B si el grupo no ha jugado nada, o si mi equipo no ha jugado nada y no tiene next
export function showNextSeasonBox({ group, health, portalSeason })  // boolean
export function summerCups(cups, myTeam, index)
  // → [{ group, team, rows: Match[] }], solo de myTeam.cat y solo si cups.season === myTeam.season. team: el equipo
  //   del club en ese grupo con la misma letra de filial que myTeam.name (sin letra, la A); rows: solo sus partidos.
  //   Sin ninguno con esa letra, o con dos, el grupo no sale (decisión 19)
```

### `src/store.js`

```js
export const STORE_KEY = 'futbol-base:v2';
export const LEGACY_KEY = 'futbol-base:favorites:v1';
export const MAX_RECENT = 8;
export function safeStorage(storage)                     // → { getItem(key) → string | null, setItem(key, value) → boolean }; nunca lanza
  // storage: el Storage o una función que lo devuelve (B2: safeStorage(() => window.localStorage)), porque con las
  // cookies bloqueadas solo leer el Storage del navegador ya lanza; loadStore y saveStore aceptan lo mismo
export function migrateV1(v1, legacySeason = '2025-2026') // v1 ya parseado → { myTeam, recent } | null; un grupo de torneo (MC*) se devuelve tal cual (decisión 9)
export function loadStore(storage, { defaultTeam, portalSeason })
  // → { myTeam, recent }; con v2, cada campo saneado; sin v2, migra v1 una vez y escribe v2 (v1 no se toca);
  //   sin nada, el equipo por defecto con portalSeason, sin escribir
export function saveStore(storage, state)                // → boolean; escribe solo { myTeam, recent }
export function addRecent(state, entry)                  // entry {s, g, t} → estado nuevo: primero, sin repetidos, máx. 8
```

### `src/links.js` (solo se añade)

```js
export const SCREENS = ['', 'jornada', 'tabla', 'explorar', 'partido', 'equipo', 'ligas', 'copa', 'goleadores', 'temporadas', 'records', 'fuentes', 'ajustes'];
export function parseRoute(hash)             // '#/tabla?g=PG2&v=forma' → {screen: 'tabla', params: {g: 'PG2', v: 'forma'}}; desconocida → {screen: '', params: {}}
export function routeHref(screen, params = {})  // → '#/tabla?g=PG2&v=forma': sin vacíos, claves en el orden s, c, i, f, g, r, h, a, t, v, q, to; pantalla desconocida → '#/'
  // `r` es siempre Round.key («Jornada 30», «06-06-2026 ( Final )», «Fase de Grupos»), nunca un número
export function translateLegacy(hash, { season } = {})  // hash antiguo → hash nuevo (tabla de §4.1; decisión 7) | null
export function countdownLabel(dateISO, todayISO)  // 'hoy' | 'mañana' | 'faltan N días' | null
```

### `src/ui.js`

Además de lo que pedía el contrato inicial, `crest` gana `lazy`, `tabbar` gana `current`, `cells` acepta `muted`, `standingsTable` gana la vista `todas` y lee `row.form`, `matchRow` exige `today`, y hay una exportación nueva, `crestFallback`.

```js
export function crest(name, { size = 16, shields = {}, lazy = true } = {})
  // <img class="crest crest-N"> de ./escudos/s/<fichero sin extensión>.png, con data-full (el original) y data-name;
  // escudo exacto o normalizado, nunca por subcadena; sin escudo, monogram; size 16, 32 o 46 (RangeError con otro)
export function crestFallback(img)           // siguiente paso de la cadena miniatura → original → monograma: 'full' | 'mono' | null
export function monogram(name, size = 16)
export function box(content, { title, context } = {})
export function cells(items)                 // [{ label, value, muted? }]
export function matchRow(match, { mine = false, today, shields, href } = {})  // TypeError sin today
export function standingsTable(rows, { view = 'puntos', mine, shields, hrefFor, caption } = {})
  // view 'puntos' | 'goles' | 'forma' | 'casa' | 'fuera' | 'todas' (escritorio); 'casa' y 'fuera' también en
  // escritorio (decisión 15); una desconocida es 'puntos';
  // row.form (letras G/E/P, opcional) para las vistas forma y todas; mine: nombre exacto del equipo propio
export function formChips(letters)           // ['G', 'E', 'P']; RangeError con cualquier otra letra
export function segmented(options, active, hrefFor)  // [{ value, label }]; aria-current="true" en el activo
export function notice(term, text)
export function empty(text)
export function tabbar(active, { current = 'page' } = {})  // active 'miequipo' | 'jornada' | 'tabla' | 'explorar' | null; current 'page' | 'true'
```

### `style-acta.css`, fuente e iconos

- Variables `--paper`, `--text`, `--mute`, `--ink`, `--on-ink`, `--rule`, `--line`, `--mark`, `--win`, `--on-win`, `--draw`, `--on-draw`, `--loss`, `--on-loss` y `--gutter`: claras en `:root` y oscuras en `@media (prefers-color-scheme: dark)` (Tarea 11).
- Vocabulario de clases de los componentes: el de la Tarea 11. La Tarea 12 comprueba que cada clase que emite `ui.js` existe en la hoja.
- `.standings .st-team` no recorta nada (el recorte con elipsis va en `.st-name`), para que el contorno de foco de `.st-link` se vea entero, y `.segmented` no se oculta en escritorio (decisión 15).
- `@font-face 'Public Sans'` con `fonts/PublicSans-latin.woff2`, pesos 100-900 y `font-display: swap` (Tarea 13).
- `scripts/build_icons.py`: `build(out_dir=ROOT / "icons") -> list[Path]`, que escribe `icon-180.png`, `icon-192.png`, `icon-512.png` e `icon-maskable-512.png` (Tarea 13).

### Diferencias con §5.3 y §5.6 de la spec

- `Match` no lleva `state`: el estado depende del día y se pide a `matchState(match, todayISO)`, así que el `Season` memorizado no caduca a medianoche.
- `Cups` no lleva `cat`: cada `Group` ya la trae.
- `competitionKey(...).label` es el nombre de la competición («Segunda Fase A»), el que necesita la lista de Ligas (§4.7); la etiqueta de grupo que §5.3 llama `label` la da `groupLabel` y va en `Group.label` (Tarea 4).
- `homeState({ resolution, todayISO, portalSeason })`: sin `model` ni `health` (decisión 5).
- `groupFinished(group, todayISO, portalSeason)` y `showNextSeasonBox({ group, health, portalSeason })`: reciben la temporada del portal, que §4.2 D necesita.
- `resolveMyTeam(myTeam, season, index, todayISO)`: recibe el índice de clubes de `buildClubIndex`.
- `competitionKey(raw, season)`, `groupKind(raw, rounds)` y `homeAwayTable(group, side)`: la temporada, las rondas y la condición van explícitas.
- Nuevas, que §5.6 no lista: `teamFixtures` y `headToHead` (el próximo partido de §4.2 y el cara a cara de §4.5 como funciones puras, Tarea 5) y `updatedMyTeam` (decisión 12, Tarea 8).

---

### Task 1: Fixtures congeladas de datos reales

**Files:**
- Create: `scripts/tests/fixtures/rediseno/build_fixtures.mjs` (extractor: se ejecuta una sola vez y su salida se commitea)
- Create: `scripts/tests/fixtures/rediseno/load.mjs`
- Create (los escribe el extractor): `scripts/tests/fixtures/rediseno/current-2025-2026.json`, `scripts/tests/fixtures/rediseno/historical-2024-2025.json`, `scripts/tests/fixtures/rediseno/cups-2025-2026.json`, `scripts/tests/fixtures/rediseno/matchdetail.json`, `scripts/tests/fixtures/rediseno/lineups-2025-2026.json`, `scripts/tests/fixtures/rediseno/shields.json`, `scripts/tests/fixtures/rediseno/health.json`, `scripts/tests/fixtures/rediseno/phases.json` y `scripts/tests/fixtures/rediseno/favorites-v1.json`
- Test: `scripts/tests/test_rediseno_fixtures.mjs`

**Interfaces:**
- Consumes (solo el extractor, una vez):
  - los globales `SEASONS` (`data-seasons.js`), `BENJAMIN`, `PREBENJAMIN`, `HISTORY`, `SEASON_2024_2025`, `MASPALOMAS_CUP_BENJAMIN`, `MASPALOMAS_CUP_PREBENJAMIN`, `MATCH_DETAIL`, `LINEUPS_2025_2026` y `SHIELDS`, cargados con `node:vm`;
  - `data-health.json`;
  - las tablas `groups`, `seasons` y `categories` de `futbolbase.db`, en solo lectura (`python3` + `sqlite3`, URI `mode=ro`);
  - `normalizeTeamName` de `src/state.js`.
  - Las pruebas no consumen nada de esto: solo los JSON, a través de `load.mjs`.
- Produces:
  - `load.mjs`: `fixture(name)`, que lee y parsea `<name>.json` en cada llamada (cada prueba recibe su propia copia) y lanza `Error('fixture desconocida: <name>')` si el nombre no está en `FIXTURE_NAMES`; además `FIXTURE_NAMES` y `FIXTURE_DIR`.
  - Los 9 JSON con las formas del contrato «Fixtures» (sección «Contratos»). Nombres válidos para `fixture()`: `current-2025-2026`, `historical-2024-2025`, `cups-2025-2026`, `matchdetail`, `lineups-2025-2026`, `shields`, `health`, `phases` y `favorites-v1`.

- [ ] **Step 1: Write the failing test**

Los valores fijados se comprobaron el 23/09/2026 ejecutando el extractor sobre `main` con la reparación A2 publicada.

Crear `scripts/tests/test_rediseno_fixtures.mjs`:

```js
// Fixtures congeladas del rediseño «Acta» (Plan B1, Tarea 1): forma y hechos
// reales comprobados el 23/09/2026 sobre los datos de 2025-26.
// Solo lee scripts/tests/fixtures/rediseno/*.json (load.mjs): nunca los
// data-*.js ni src/config.js vivos, que cambian al activar 2026/27.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fixture, FIXTURE_NAMES } from './fixtures/rediseno/load.mjs';

const ids = groups => groups.map(g => g.id);
const rowsOf = rounds => Object.values(rounds).flat();
const teamsIn = rows => new Set(rows.flatMap(r => [r[1], r[2]]));
const plays = name => r => r[1] === name || r[2] === name;
const currentGroup = (cur, id) => [...cur.benjamin, ...cur.prebenjamin].find(g => g.id === id);

test('fixtures: existen todas, se parsean y cada llamada devuelve una copia nueva', () => {
  assert.deepEqual(FIXTURE_NAMES, [
    'current-2025-2026', 'historical-2024-2025', 'cups-2025-2026', 'matchdetail',
    'lineups-2025-2026', 'shields', 'health', 'phases', 'favorites-v1',
  ]);
  for (const name of FIXTURE_NAMES) assert.ok(fixture(name), name);
  const copia = fixture('favorites-v1');
  copia.teams.length = 0;
  assert.equal(fixture('favorites-v1').teams.length, 2);
  assert.throws(() => fixture('data-benjamin'), /fixture desconocida: data-benjamin/);
});

test('current-2025-2026: grupos pedidos, forma de data-benjamin.js y filas de HISTORY de 8 columnas', () => {
  const cur = fixture('current-2025-2026');
  assert.equal(cur.season, '2025-2026');
  assert.deepEqual(ids(cur.benjamin), ['A1', 'A2', 'B1', 'B2', 'FF5', 'FF9', 'FF13', 'FF15']);
  assert.deepEqual(ids(cur.prebenjamin), ['PG2', 'PG3', 'PFV2']);
  assert.deepEqual(Object.keys(cur.history).sort(),
    ['A1', 'A2', 'B1', 'B2', 'FF13', 'FF15', 'FF5', 'FF9', 'PFV2', 'PG2', 'PG3']);
  for (const g of [...cur.benjamin, ...cur.prebenjamin]) {
    assert.deepEqual(Object.keys(g).sort(), ['fullName', 'id', 'island', 'jornada', 'matches',
      'name', 'phase', 'standings', 'standingsKind', 'url'], g.id);
    for (const row of g.standings) assert.equal(row.length, 10, `${g.id} ${JSON.stringify(row)}`);
    for (const row of g.matches) assert.equal(row.length, 7, `${g.id} ${JSON.stringify(row)}`);
    for (const row of rowsOf(cur.history[g.id])) assert.equal(row.length, 8, `${g.id} ${JSON.stringify(row)}`);
  }
});

test('PG2: 15 filas, CD Batán 0-0-28 sin partidos en el calendario, 30 jornadas y 182 partidos', () => {
  const cur = fixture('current-2025-2026');
  const pg2 = currentGroup(cur, 'PG2');
  const hist = cur.history.PG2;
  assert.equal(pg2.standings.length, 15);
  assert.deepEqual(pg2.standings.find(r => r[1] === 'CD Batán'), [15, 'CD Batán', 0, 28, 0, 0, 28, 0, 84, -84]);
  assert.equal(Object.keys(hist).length, 30);
  assert.equal(rowsOf(hist).length, 182);
  assert.ok(!teamsIn(rowsOf(hist)).has('CD Batán'));
  // Jornada 30: 6 partidos; RC Victoria y Arucas B no juegan (descansa o le tocaba contra CD Batán).
  assert.equal(hist['Jornada 30'].length, 6);
  for (const t of ['RC Victoria', 'Arucas B', 'CD Batán']) assert.ok(!teamsIn(hist['Jornada 30']).has(t), t);
  assert.deepEqual(hist['Jornada 30'][0], ['2026-06-02', 'Las Mesas Hu.', 'AD Huracán', 2, 7, null, '17:30', null]);
  // Las Mesas: 28 PJ en la tabla y 26 partidos en el calendario, todos con resultado.
  assert.equal(pg2.standings.find(r => r[1] === 'Las Mesas Hu.')[3], 28);
  const mesas = rowsOf(hist).filter(plays('Las Mesas Hu.'));
  assert.equal(mesas.length, 26);
  assert.ok(mesas.every(r => r[3] !== null && r[4] !== null));
});

test('PG3: 14 equipos y jornadas de 6 partidos salvo 2 de 7 (la moda es 6)', () => {
  const cur = fixture('current-2025-2026');
  assert.equal(currentGroup(cur, 'PG3').standings.length, 14);
  const porJornada = Object.values(cur.history.PG3).map(rows => rows.length);
  assert.equal(porJornada.length, 30);
  assert.equal(porJornada.filter(n => n === 6).length, 28);
  assert.equal(porJornada.filter(n => n === 7).length, 2);
});

test('PFV2: CD Teguinte solo está en el calendario, con 14 partidos sin fecha ni resultado', () => {
  const cur = fixture('current-2025-2026');
  const pfv2 = currentGroup(cur, 'PFV2');
  assert.equal(pfv2.standings.length, 7);
  assert.ok(!pfv2.standings.some(r => r[1] === 'CD Teguinte'));
  assert.deepEqual(Object.keys(cur.history.PFV2).slice(0, 3), ['1', '2', '3']);
  const teguinte = rowsOf(cur.history.PFV2).filter(plays('CD Teguinte'));
  assert.equal(teguinte.length, 14);
  for (const r of teguinte) assert.deepEqual([r[0], r[3], r[4]], ['', null, null]);
  // Las demás fechas de PFV2 van en DD-MM-YYYY.
  assert.ok(rowsOf(cur.history.PFV2).filter(r => r[0]).every(r => /^\d{2}-\d{2}-\d{4}$/.test(r[0])));
});

test('Las Mesas: «Las Mesas Hu.» en PG2, A2 y FF5; «Las Mesas Hu. B» en FF13; «Las Mesas B» en B2', () => {
  const cur = fixture('current-2025-2026');
  const has = (id, name) => currentGroup(cur, id).standings.some(r => r[1] === name);
  for (const id of ['PG2', 'A2', 'FF5']) assert.ok(has(id, 'Las Mesas Hu.'), id);
  assert.ok(has('FF13', 'Las Mesas Hu. B'));
  assert.ok(has('B2', 'Las Mesas B'));
  assert.ok(!has('B2', 'Las Mesas Hu. B'));
  assert.equal(currentGroup(cur, 'FF13').phase, 'Primera Fase GC');
  assert.equal(currentGroup(cur, 'B2').phase, 'Segunda Fase B');
});

test('Santa Brígida: en FF9 y, en la Segunda Fase B, con el mismo nombre en B1 y en B2', () => {
  const cur = fixture('current-2025-2026');
  const groupsWith = name => [...cur.benjamin, ...cur.prebenjamin].filter(g => g.standings.some(r => r[1] === name)).map(g => g.id);
  assert.deepEqual(groupsWith('Santa Brígida'), ['B1', 'B2', 'FF9', 'PG2']);
  assert.deepEqual([currentGroup(cur, 'B1').phase, currentGroup(cur, 'B2').phase], ['Segunda Fase B', 'Segunda Fase B']);
  assert.equal(currentGroup(cur, 'FF9').phase, 'Primera Fase GC');
  // FF9 acaba el 08/11/2025; B1 empieza el 28/11/2025.
  assert.equal(rowsOf(cur.history.FF9).map(r => r[0]).sort().at(-1), '2025-11-08');
  assert.equal(rowsOf(cur.history.B1).map(r => r[0]).sort()[0], '2025-11-28');
});

test('historical-2024-2025: P1 y PGC2 con la forma de SEASON_2024_2025 y filas de 8 columnas', () => {
  const h = fixture('historical-2024-2025');
  assert.equal(h.season, '2024-2025');
  assert.deepEqual(ids(h.benjamin), ['P1']);
  assert.deepEqual(ids(h.prebenjamin), ['PGC2']);
  for (const g of [...h.benjamin, ...h.prebenjamin]) {
    assert.deepEqual(Object.keys(g).sort(), ['current_jornada', 'fullName', 'id', 'island',
      'jornadas', 'name', 'phase', 'standings'], g.id);
    for (const row of rowsOf(g.jornadas)) assert.equal(row.length, 8, `${g.id} ${JSON.stringify(row)}`);
  }
  const [p1] = h.benjamin;
  const [pgc2] = h.prebenjamin;
  assert.deepEqual([p1.phase, p1.standings.length, Object.keys(p1.jornadas).length, rowsOf(p1.jornadas).length],
    ['Primera Fase GC', 10, 9, 45]);
  assert.deepEqual([pgc2.phase, pgc2.standings.length, Object.keys(pgc2.jornadas).length, rowsOf(pgc2.jornadas).length],
    ['Gran Canaria', 11, 22, 132]);
  assert.ok(pgc2.standings.some(r => r[1] === 'Las Mesas Hu.'));
});

test('cups-2025-2026: MCB16 y MCP3 en línea de 7 columnas; MCBK2 y MCPK1, cuadros de 9', () => {
  const c = fixture('cups-2025-2026');
  assert.deepEqual(Object.keys(c).sort(), ['benjamin', 'prebenjamin']);
  assert.deepEqual(ids(c.benjamin), ['MCB16', 'MCBK2']);
  assert.deepEqual(ids(c.prebenjamin), ['MCP3', 'MCPK1']);
  for (const g of [...c.benjamin, ...c.prebenjamin]) {
    assert.equal(g.phase, 'Maspalomas Cup');
    for (const row of g.matches) assert.equal(row.length, 7, `${g.id} ${JSON.stringify(row)}`);
  }
  for (const g of [c.benjamin[0], c.prebenjamin[0]]) {
    assert.ok(!('jornadas' in g), g.id);
    assert.equal(g.standings.length, 4, g.id);
  }
  for (const g of [c.benjamin[1], c.prebenjamin[1]]) {
    assert.deepEqual(g.standings, [], g.id);
    for (const row of rowsOf(g.jornadas)) assert.equal(row.length, 9, `${g.id} ${JSON.stringify(row)}`);
  }
});

test('MCP3 y MCPK1: UD Las Mesas Huracán, 3.º del Grupo C, y su Copa Plata', () => {
  const c = fixture('cups-2025-2026');
  const [mcp3, mcpk1] = c.prebenjamin;
  assert.equal(mcp3.name, 'Grupo C');
  assert.deepEqual(mcp3.standings.find(r => r[1] === 'UD Las Mesas Huracán').slice(0, 3), [3, 'UD Las Mesas Huracán', 3]);
  assert.equal(mcpk1.name, 'Copa Plata');
  const mine = Object.entries(mcpk1.jornadas).flatMap(([round, rows]) =>
    rows.filter(plays('UD Las Mesas Huracán')).map(r => [round, ...r]));
  assert.deepEqual(mine, [
    ['26-06-2026 ( Previa )', '26/06', 'CD Tablero', 'UD Las Mesas Huracán', 1, 4, null, '16:00', 'CD 3.1', null],
    ['27-06-2026 ( Cuartos )', '27/06', 'UD Las Mesas Huracán', 'CF Unión Carrizal', 1, 1, 'home', '10:00', 'CD 4', '3-2'],
    ['27-06-2026 ( Semifinales )', '27/06', 'UD Las Mesas Huracán', 'CD Maspa Training A', 2, 4, null, '13:00', 'CD 2.1', null],
  ]);
  // En benjamín también juega un «UD Las Mesas Huracán» (MCB16 y MCBK2): el Verano de PG2 no los incluye.
  assert.ok(c.benjamin[0].standings.some(r => r[1] === 'UD Las Mesas Huracán'));
  assert.ok(rowsOf(c.benjamin[1].jornadas).some(plays('UD Las Mesas Huracán')));
});

test('matchdetail: Calero es de FF15 y su clave la comparte un partido de PG2; la 2-9 de Las Mesas es de A2', () => {
  const md = fixture('matchdetail');
  const cur = fixture('current-2025-2026');
  const hist = fixture('historical-2024-2025');
  const is = (h, a, hs, as) => r => r[1] === h && r[2] === a && r[3] === hs && r[4] === as;
  const calero = md['CD Calero|La Garita|1-11'];
  assert.deepEqual([calero.s, calero.gr, calero.g.length, calero.g.at(-1)[2]], ['2025-2026', 'FF15', 12, '1-11']);
  assert.equal(rowsOf(cur.history.FF15).filter(is('CD Calero', 'La Garita', 1, 11)).length, 1);
  assert.equal(rowsOf(cur.history.PG2).filter(is('CD Calero', 'La Garita', 1, 11)).length, 1);
  assert.equal(md['Las Mesas Hu.|AD Huracán|2-9'].gr, 'A2');
  assert.equal(md['Las Mesas Hu.|AD Huracán|2-7'], undefined);
  // Otras dos claves compartidas: la entrada es de otro grupo (FF9) o de otra temporada (FF1 de 2025-26).
  assert.deepEqual([md['RC Victoria|AD Huracán|0-6'].s, md['RC Victoria|AD Huracán|0-6'].gr], ['2025-2026', 'FF9']);
  assert.equal(rowsOf(cur.history.A2).filter(is('RC Victoria', 'AD Huracán', 0, 6)).length, 1);
  assert.deepEqual([md['Guayarmina|UD Guía|8-1'].s, md['Guayarmina|UD Guía|8-1'].gr], ['2025-2026', 'FF1']);
  assert.equal(rowsOf(hist.benjamin[0].jornadas).filter(is('Guayarmina', 'UD Guía', 8, 1)).length, 1);
  for (const [key, entry] of Object.entries(md)) {
    for (const e of entry.dup ? entry.list : [entry]) {
      assert.deepEqual(Object.keys(e).sort(), ['g', 'gr', 's'], key);
      assert.ok(Array.isArray(e.g) && e.g.every(goal => goal.length === 5), key);
    }
  }
  // Hoy MATCH_DETAIL no tiene ninguna entrada {dup, list}: las pruebas de dup usan datos sintéticos.
  assert.equal(Object.values(md).filter(e => e.dup).length, 0);
  assert.equal(Object.keys(md).length, 434);
});

test('lineups-2025-2026: las 44 actas de A1', () => {
  const lineups = fixture('lineups-2025-2026');
  const entries = Object.values(lineups);
  assert.equal(entries.length, 44);
  for (const e of entries) {
    assert.deepEqual(Object.keys(e).sort(), ['away', 'coachA', 'coachH', 'cod', 'events', 'gr', 'home', 'ref', 's']);
    assert.deepEqual([e.s, e.gr], ['2025-2026', 'A1']);
  }
});

test('shields: escudos de los nombres de las fixtures y de quienes comparten su fichero', () => {
  const sh = fixture('shields');
  for (const name of ['Las Mesas Hu.', 'Las Mesas B', 'L.Mesas Hu. B', 'MESAS, U.D. LAS "B"']) {
    assert.equal(sh[name], 'lasMesasEscudo.png', name);
  }
  assert.equal(sh['AD Huracán'], 'huracan.png');
  assert.equal(sh['RC Victoria'], 'victoria.png');
  assert.equal(sh['RC Victoria B'], 'victoria2019.png');
  assert.equal(sh['CD Batán'], 'batanEscudo.png');
  assert.equal(sh['CD Teguinte'], 'teguinte.png');
  assert.equal(sh['CD Calero'], 'calero2018.png');
  // Sin escudo propio, ni exacto ni normalizado (solo el viejo teamBadge les daba uno por inclusión).
  assert.equal(sh['Las Mesas Hu. B'], undefined);
  assert.equal(sh['UD Las Mesas Huracán'], undefined);
  assert.equal(Object.keys(sh).length, 174);
});

test('health: data-health.json real, con 2026/27 pendiente', () => {
  const h = fixture('health');
  assert.equal(h.season, '2025-2026');
  assert.deepEqual(h.nextSeason, { name: '2026-2027', status: 'pending' });
  assert.match(h.checkedAt, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
  assert.match(h.lastDataChange, /^\d{4}-\d{2}-\d{2}$/);
  assert.equal(typeof h.groups.PG2.status, 'string');
});

test('phases: un registro por grupo de la base, en las 5 temporadas, coherente con las fixtures', () => {
  const ph = fixture('phases');
  assert.equal(ph.length, 191);
  for (const p of ph) assert.deepEqual(Object.keys(p).sort(), ['cat', 'code', 'island', 'name', 'phase', 'season']);
  assert.deepEqual([...new Set(ph.map(p => p.season))].sort(),
    ['2021-2022', '2022-2023', '2023-2024', '2024-2025', '2025-2026']);
  assert.deepEqual([...new Set(ph.map(p => p.cat))].sort(), ['benjamin', 'prebenjamin']);
  assert.equal(new Set(ph.map(p => `${p.season}|${p.cat}|${p.code}`)).size, 191);
  assert.equal(new Set(ph.map(p => `${p.season}|${p.cat}|${p.phase}`)).size, 56);
  assert.ok(ph.every(p => p.phase && p.name && ['grancanaria', 'lanzarote', 'fuerteventura'].includes(p.island)));
  assert.ok(!ph.some(p => p.code.startsWith('MC')), 'la Maspalomas Cup no está en la base');
  const cur = fixture('current-2025-2026');
  const hist = fixture('historical-2024-2025');
  const casos = [
    ...['benjamin', 'prebenjamin'].flatMap(cat => cur[cat].map(g => [cur.season, cat, g])),
    ...['benjamin', 'prebenjamin'].flatMap(cat => hist[cat].map(g => [hist.season, cat, g])),
  ];
  for (const [season, cat, g] of casos) {
    assert.deepEqual(ph.find(p => p.season === season && p.cat === cat && p.code === g.id),
      { season, cat, code: g.id, phase: g.phase, island: g.island, name: g.name }, `${season} ${g.id}`);
  }
});

test('favorites-v1: forma exacta de futbol-base:favorites:v1 (favorites.js)', () => {
  assert.deepEqual(fixture('favorites-v1'), {
    teams: [
      { name: 'Las Mesas Hu.', cat: 'prebenjamin', groupId: 'PG2' },
      { name: 'AD Huracán', cat: 'prebenjamin', groupId: 'PG2' },
    ],
    selected: 'prebenjamin|PG2|las mesas hu',
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd /home/manolo/claude/futbol-base
node --test scripts/tests/test_rediseno_fixtures.mjs 2>&1 | grep -E "ERR_MODULE_NOT_FOUND\]|^# (tests|pass|fail)"
```
Esperado:
```text
# Error [ERR_MODULE_NOT_FOUND]: Cannot find module '/home/manolo/claude/futbol-base/scripts/tests/fixtures/rediseno/load.mjs' imported from /home/manolo/claude/futbol-base/scripts/tests/test_rediseno_fixtures.mjs
# tests 1
# pass 0
# fail 1
```

- [ ] **Step 3: Write minimal implementation**

1. Crear `scripts/tests/fixtures/rediseno/load.mjs`:

```js
// Fixtures congeladas del rediseño «Acta» (spec §11). Las genera una sola vez
// build_fixtures.mjs y se commitean. Las pruebas test_rediseno_*.mjs leen solo
// estos JSON: nunca los data-*.js ni src/config.js vivos.
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const FIXTURE_DIR = dirname(fileURLToPath(import.meta.url));

export const FIXTURE_NAMES = [
  'current-2025-2026', 'historical-2024-2025', 'cups-2025-2026', 'matchdetail',
  'lineups-2025-2026', 'shields', 'health', 'phases', 'favorites-v1',
];

// Lee y parsea <name>.json en cada llamada: cada prueba recibe su propia copia
// y puede modificarla sin afectar a las demás.
export function fixture(name) {
  if (!FIXTURE_NAMES.includes(name)) throw new Error(`fixture desconocida: ${name}`);
  return JSON.parse(readFileSync(join(FIXTURE_DIR, `${name}.json`), 'utf8'));
}
```

2. El extractor, `build_fixtures.mjs`:
   - **Carga de datos:** carga los `data-*.js` con `node:vm`, cambiando `const` por `var` al principio de línea para que cada global quede como propiedad del contexto.
   - **Guarda de temporada:** se niega a trabajar si `data-seasons.js` no tiene 2025-2026 como temporada actual.
   - **Grupos:** copia tal cual los grupos pedidos y su `HISTORY`. Lanza un error si falta alguno.
   - **Cronología:** `matchdetail.json` lleva las entradas cuya clave `local|visitante|gl-gv` es la de algún partido de las fixtures, las etiquetadas `(s, gr)` con un grupo actual de las fixtures y la de Calero.
   - **Actas:** `lineups-2025-2026.json` lleva las de A1, por clave o por etiqueta.
   - **Escudos:** `shields.json` lleva las claves de `SHIELDS` que casan con algún nombre de equipo de las fixtures de forma exacta, normalizada o por inclusión (los tres niveles del `teamBadge` actual). Añade todas las claves que comparten fichero con ellas, que son la arista «mismo escudo» de §6.1. Conserva el orden de `SHIELDS`.
   - **Fases:** `phases.json` sale de la base con `python3`, en solo lectura, con el nombre de cada grupo, y se contrasta con la fase, la isla y el nombre de los grupos de las fixtures.
   - **Salida:** los JSON se escriben compactos, con salto de línea final y de forma determinista.

   Crear `scripts/tests/fixtures/rediseno/build_fixtures.mjs`:

```js
// Congela datos reales para las pruebas del rediseño «Acta» (Plan B1, spec §11).
//
// Se ejecuta UNA vez, desde la raíz del repo y con 2025-26 como temporada actual:
//   node scripts/tests/fixtures/rediseno/build_fixtures.mjs
// Su salida (los *.json de esta carpeta) se commitea. Las pruebas leen solo esos
// JSON (load.mjs), nunca los data-*.js ni src/config.js vivos, que cambian al
// activar 2026/27.
//
// Lee los data-*.js con node:vm y futbolbase.db en solo lectura (python3 y
// sqlite3 con URI mode=ro). Solo escribe en esta carpeta.
import { readFileSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
import { normalizeTeamName } from '../../../../src/state.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..', '..', '..', '..');

const SEASON = '2025-2026';
const CURRENT = { benjamin: ['A1', 'A2', 'B1', 'B2', 'FF5', 'FF9', 'FF13', 'FF15'], prebenjamin: ['PG2', 'PG3', 'PFV2'] };
const HISTORICAL = { season: '2024-2025', benjamin: ['P1'], prebenjamin: ['PGC2'] };
const CUPS = { benjamin: ['MCB16', 'MCBK2'], prebenjamin: ['MCP3', 'MCPK1'] };
const LINEUP_GROUPS = ['A1'];
const CALERO_KEY = 'CD Calero|La Garita|1-11';
const FAVORITES_V1 = {
  teams: [
    { name: 'Las Mesas Hu.', cat: 'prebenjamin', groupId: 'PG2' },
    { name: 'AD Huracán', cat: 'prebenjamin', groupId: 'PG2' },
  ],
  selected: 'prebenjamin|PG2|las mesas hu',
};

// Todos los grupos de la base: temporada, categoría, código, fase, isla y nombre.
const PHASES_PY = `
import json, pathlib, sqlite3, sys
uri = pathlib.Path(sys.argv[1]).resolve().as_uri() + '?mode=ro'
rows = sqlite3.connect(uri, uri=True).execute("""
    SELECT s.name, LOWER(c.name), g.code, g.phase, g.island, g.name
      FROM groups g
      JOIN seasons s ON s.id = g.season_id
      JOIN categories c ON c.id = g.category_id
     WHERE UPPER(c.name) IN ('BENJAMIN', 'PREBENJAMIN')
     ORDER BY s.name DESC, LOWER(c.name), g.code""").fetchall()
print(json.dumps([dict(zip(('season', 'cat', 'code', 'phase', 'island', 'name'), r)) for r in rows],
                 ensure_ascii=False))
`;

function fail(message) {
  throw new Error(`build_fixtures: ${message}`);
}

// Los data-*.js declaran `const X=…` de nivel superior; con `var` quedan como
// propiedades del contexto de node:vm.
function loadDataGlobals(files) {
  const ctx = vm.createContext({});
  for (const file of files) {
    const src = readFileSync(join(ROOT, file), 'utf8');
    vm.runInContext(src.replace(/^const /gm, 'var '), ctx, { filename: file });
  }
  return ctx;
}

function pick(groups, ids, where) {
  return ids.map(id => groups.find(g => g.id === id) || fail(`falta el grupo ${id} en ${where}`));
}

function subset(object, keep) {
  const out = {};
  for (const [key, value] of Object.entries(object)) if (keep(key, value)) out[key] = value;
  return out;
}

// Clave de MATCH_DETAIL y LINEUPS_<S>, como _match_key de generate_js.py.
const matchKey = ([home, away, hs, as]) => `${home}|${away}|${hs}-${as}`;
const entriesOf = value => (value && value.dup ? value.list : [value]);

// [local, visitante, gl, gv] de cada partido de un grupo: filas de HISTORY o de
// `jornadas` ([fecha, local, visitante, gl, gv, …]) y filas en línea de
// `matches` ([fecha, hora, local, visitante, gl, gv, campo]).
function matchesOf(group, history) {
  const rows = Object.values(history || group.jornadas || {}).flat().map(r => [r[1], r[2], r[3], r[4]]);
  return rows.concat((group.matches || []).map(r => [r[2], r[3], r[4], r[5]]));
}

function write(name, value, detail) {
  writeFileSync(join(HERE, `${name}.json`), JSON.stringify(value) + '\n');
  console.log(`${name}.json: ${detail}`);
}

const D = loadDataGlobals([
  'data-seasons.js', 'data-benjamin.js', 'data-prebenjamin.js', 'data-history.js',
  'data-season-2024-2025.js', 'data-maspalomas-cup-2026.js', 'data-matchdetail.js',
  'data-lineups-2025-2026.js', 'data-shields.js',
]);
const actual = D.SEASONS.find(s => s.current)?.name;
if (actual !== SEASON) {
  fail(`la temporada actual de data-seasons.js es ${actual}, no ${SEASON}: ` +
    'genera las fixtures desde un commit anterior a la activación de 2026/27');
}

const current = {
  season: SEASON,
  benjamin: pick(D.BENJAMIN, CURRENT.benjamin, 'BENJAMIN'),
  prebenjamin: pick(D.PREBENJAMIN, CURRENT.prebenjamin, 'PREBENJAMIN'),
  history: {},
};
for (const id of [...CURRENT.benjamin, ...CURRENT.prebenjamin]) {
  current.history[id] = D.HISTORY[id] || fail(`falta HISTORY.${id}`);
}
const currentGroup = id => [...current.benjamin, ...current.prebenjamin].find(g => g.id === id);
const historical = {
  season: HISTORICAL.season,
  benjamin: pick(D.SEASON_2024_2025.benjamin, HISTORICAL.benjamin, 'SEASON_2024_2025.benjamin'),
  prebenjamin: pick(D.SEASON_2024_2025.prebenjamin, HISTORICAL.prebenjamin, 'SEASON_2024_2025.prebenjamin'),
};
const cups = {
  benjamin: pick(D.MASPALOMAS_CUP_BENJAMIN, CUPS.benjamin, 'MASPALOMAS_CUP_BENJAMIN'),
  prebenjamin: pick(D.MASPALOMAS_CUP_PREBENJAMIN, CUPS.prebenjamin, 'MASPALOMAS_CUP_PREBENJAMIN'),
};

// [grupo, filas de HISTORY o null] de todas las fixtures.
const allGroups = [
  ...[...current.benjamin, ...current.prebenjamin].map(g => [g, current.history[g.id]]),
  ...[...historical.benjamin, ...historical.prebenjamin, ...cups.benjamin, ...cups.prebenjamin].map(g => [g, null]),
];

// Cronología: las entradas cuya clave es la de un partido de las fixtures y las
// etiquetadas (s, gr) con un grupo actual de las fixtures, más la de Calero.
const currentIds = new Set([...CURRENT.benjamin, ...CURRENT.prebenjamin]);
const fixtureKeys = new Set(allGroups.flatMap(([g, h]) => matchesOf(g, h).map(matchKey)));
const matchdetail = subset(D.MATCH_DETAIL, (key, value) => key === CALERO_KEY || fixtureKeys.has(key)
  || entriesOf(value).some(e => e.s === SEASON && currentIds.has(e.gr)));
if (!matchdetail[CALERO_KEY]) fail(`falta ${CALERO_KEY} en MATCH_DETAIL`);

// Actas: las de los partidos de A1 (por clave o por etiqueta).
const lineupKeys = new Set(LINEUP_GROUPS.flatMap(id => matchesOf(currentGroup(id), current.history[id]).map(matchKey)));
const lineups = subset(D.LINEUPS_2025_2026, (key, value) => lineupKeys.has(key)
  || entriesOf(value).some(e => e.s === SEASON && LINEUP_GROUPS.includes(e.gr)));
if (!Object.keys(lineups).length) fail('LINEUPS_2025_2026 no tiene actas de A1');

// Escudos: los de cada nombre de equipo de las fixtures (exacto, normalizado o
// por inclusión, como teamBadge de state.js) y todos los nombres que comparten
// fichero con ellos (la arista «mismo escudo» de la identidad de club, §6.1).
const names = new Set(FAVORITES_V1.teams.map(t => t.name));
for (const [g, h] of allGroups) {
  for (const row of g.standings || []) names.add(row[1]);
  for (const [home, away] of matchesOf(g, h)) names.add(home).add(away);
}
const norms = [...names].filter(n => typeof n === 'string' && n).map(normalizeTeamName).filter(Boolean);
const matchesAName = key => {
  const kn = normalizeTeamName(key);
  return names.has(key) || norms.includes(kn)
    || (kn.length >= 4 && norms.some(n => n.length >= 4 && (kn.includes(n) || n.includes(kn))));
};
const shieldFiles = new Set(Object.keys(D.SHIELDS).filter(matchesAName).map(k => D.SHIELDS[k]));
const shields = subset(D.SHIELDS, (_key, file) => shieldFiles.has(file));

const health = JSON.parse(readFileSync(join(ROOT, 'data-health.json'), 'utf8'));

const phases = JSON.parse(execFileSync('python3', ['-c', PHASES_PY, join(ROOT, 'futbolbase.db')], { encoding: 'utf8' }));
for (const [season, cat, g] of [
  ...['benjamin', 'prebenjamin'].flatMap(cat => current[cat].map(g => [SEASON, cat, g])),
  ...['benjamin', 'prebenjamin'].flatMap(cat => historical[cat].map(g => [HISTORICAL.season, cat, g])),
]) {
  const p = phases.find(x => x.season === season && x.cat === cat && x.code === g.id);
  if (!p || p.phase !== g.phase || p.island !== g.island || p.name !== g.name) {
    fail(`${season} ${g.id}: la base no casa con los data-*.js`);
  }
}

const v1Key = t => `${t.cat}|${t.groupId}|${normalizeTeamName(t.name)}`;
if (v1Key(FAVORITES_V1.teams[0]) !== FAVORITES_V1.selected) fail('selected de favorites-v1 no casa con normalizeTeamName');
for (const t of FAVORITES_V1.teams) {
  if (!currentGroup(t.groupId).standings.some(r => r[1] === t.name)) fail(`${t.name} no está en ${t.groupId}`);
}

const historyRows = Object.values(current.history).reduce((n, rounds) => n + Object.values(rounds).flat().length, 0);
write('current-2025-2026', current, `${currentIds.size} grupos y ${historyRows} partidos de HISTORY`);
write('historical-2024-2025', historical, `${historical.benjamin.length + historical.prebenjamin.length} grupos`);
write('cups-2025-2026', cups, `${cups.benjamin.length + cups.prebenjamin.length} grupos`);
write('matchdetail', matchdetail, `${Object.keys(matchdetail).length} entradas`);
write('lineups-2025-2026', lineups, `${Object.keys(lineups).length} actas`);
write('shields', shields, `${Object.keys(shields).length} escudos`);
write('health', health, `temporada ${health.season}, siguiente ${health.nextSeason.name} (${health.nextSeason.status})`);
write('phases', phases, `${phases.length} grupos`);
write('favorites-v1', FAVORITES_V1, `${FAVORITES_V1.teams.length} favoritos`);
```

3. Ejecutarlo una vez:

```bash
cd /home/manolo/claude/futbol-base
node scripts/tests/fixtures/rediseno/build_fixtures.mjs
```
Esperado, exactamente:
```text
current-2025-2026.json: 11 grupos y 964 partidos de HISTORY
historical-2024-2025.json: 2 grupos
cups-2025-2026.json: 4 grupos
matchdetail.json: 434 entradas
lineups-2025-2026.json: 44 actas
shields.json: 174 escudos
health.json: temporada 2025-2026, siguiente 2026-2027 (pending)
phases.json: 191 grupos
favorites-v1.json: 2 favoritos
```
Casos de parada:
- **Sale `Error: build_fixtures: la temporada actual de data-seasons.js es …`.** 2026/27 ya está activada y esta copia ya no tiene los datos de 2025-26: se para y se avisa.
- **Sale `falta el grupo …`, `falta HISTORY.…` o `… la base no casa con los data-*.js`.** Los datos cambiaron: se para y se avisa. Nunca se editan los JSON a mano.

- [ ] **Step 4: Run test to verify it passes**

```bash
cd /home/manolo/claude/futbol-base
node --test scripts/tests/test_rediseno_fixtures.mjs 2>&1 | grep -E "^not ok|^# (tests|pass|fail)"
```
Esperado, sin ninguna línea `not ok`:
```text
# tests 16
# pass 16
# fail 0
```

Si falla uno de los recuentos fijados (434 entradas, 174 escudos o 191 grupos), la base o los `data-*.js` cambiaron después del 23/09. Antes de tocar el número en la prueba, se busca el motivo con `git log -3 --stat -- data-matchdetail.js data-shields.js futbolbase.db`.

- [ ] **Step 5: La salida es determinista y el extractor no toca nada más**

```bash
cd /home/manolo/claude/futbol-base
S=/tmp/claude-1000/-home-manolo/db6fd8e0-f1e7-4e94-b6cd-ef7dd5bf6ae9/scratchpad/planB1
mkdir -p "$S"
D=scripts/tests/fixtures/rediseno
sha1sum $D/*.json > "$S/fixtures-rediseno.sha1"
node $D/build_fixtures.mjs > /dev/null
sha1sum -c --quiet "$S/fixtures-rediseno.sha1" && echo "fixtures deterministas"
git status --short -- 'data-*' futbolbase.db src
```
Esperado, una sola línea (`git status` no imprime nada: no cambia ningún `data-*`, ni la base, ni `src/`):
```text
fixtures deterministas
```

Python puede crear `futbolbase.db-wal` y `futbolbase.db-shm`, que ya excluye `.gitignore`.

- [ ] **Step 6: Suites completas**

```bash
cd /home/manolo/claude/futbol-base
python3 -m pytest scripts/tests/ -q 2>&1 | tail -1
node --test scripts/tests/test_*.mjs 2>&1 | grep -E '^# (tests|pass|fail)'
```
Esperado:
- pytest: el mismo recuento que al terminar la tarea anterior, sin `failed` (esta tarea no añade pruebas de Python).
- node: el recuento anterior más 16, sin fallos (`# fail 0`).

- [ ] **Step 7: Commit**

```bash
cd /home/manolo/claude/futbol-base
git add scripts/tests/fixtures/rediseno/build_fixtures.mjs scripts/tests/fixtures/rediseno/load.mjs \
  scripts/tests/fixtures/rediseno/current-2025-2026.json scripts/tests/fixtures/rediseno/historical-2024-2025.json \
  scripts/tests/fixtures/rediseno/cups-2025-2026.json scripts/tests/fixtures/rediseno/matchdetail.json \
  scripts/tests/fixtures/rediseno/lineups-2025-2026.json scripts/tests/fixtures/rediseno/shields.json \
  scripts/tests/fixtures/rediseno/health.json scripts/tests/fixtures/rediseno/phases.json \
  scripts/tests/fixtures/rediseno/favorites-v1.json scripts/tests/test_rediseno_fixtures.mjs
git commit -F - <<'EOF'
test(rediseño): fixtures congeladas de datos reales (B1, tarea 1)

build_fixtures.mjs extrae una sola vez los datos reales que usan las
pruebas del rediseño (spec §11):
- PG2, PG3, PFV2, A1, A2, B1, B2, FF5, FF9, FF13 y FF15 con su HISTORY;
- P1 y PGC2 de 2024-25;
- MCB16, MCBK2, MCP3 y MCPK1 de la Maspalomas Cup;
- la cronología de esos partidos, más la clave de Calero, y las actas de A1;
- sus escudos, data-health.json y la fase y el nombre de cada grupo de
  la base;
- un favorito v1.

load.mjs los sirve con fixture(name). Las pruebas nuevas nunca usan los
datos de los data-*.js ni de src/config.js vivos, que cambian al activar
2026/27.
test_rediseno_fixtures fija los hechos comprobados el 23/09/2026:
- CD Batán, 0-0-28 y sin partidos en PG2;
- 30 jornadas y 182 partidos en PG2, y 14 equipos en PG3;
- CD Teguinte sin fecha en PFV2;
- Santa Brígida en FF9 y, con el mismo nombre, en B1 y en B2;
- la Copa Plata de Las Mesas y la clave de Calero, que es de FF15.

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01Sg56KK3oZgo8Ye7Snj6wG9
EOF
git show --stat --oneline HEAD | tail -1
```
Esperado: `12 files changed`, todos nuevos: los 9 JSON, `build_fixtures.mjs`, `load.mjs` y la prueba.

---

### Task 2: `html.js`, plantillas con escapado automático (spec §5.1 y §11)

**Contexto**
- Es la base de `ui.js` y de todas las pantallas de B2: la etiqueta ``html`…` `` escapa cada interpolación, y solo pasan tal cual las instancias de `Html` que produce ella misma (y los arrays de ellas).
- Decisiones dentro del contrato:
  - `escape` convierte `null` y `undefined` en `''` y escapa `& < > " '` (el apóstrofo como `&#39;`). `escape(false)` da `'false'`.
  - Dentro de `html`, `false` tampoco pinta nada, para poder escribir ``${mio && html`…`}``. El `0` sí se pinta.
  - Un objeto que imita a `Html` (`{s, toString}`) se escapa: solo cuentan las instancias reales.
  - `join` escapa el separador si no es `Html`, escapa los elementos que no son `Html` y salta `null`, `undefined` y `false`.
  - `raw` devuelve el mismo `Html` y lanza `TypeError` con cualquier otra cosa.

**Files:**
- Create: `src/html.js`
- Test: `scripts/tests/test_rediseno_html.mjs`

**Interfaces:**
- Consumes: nada.
- Produces: `Html`, `escape`, `html`, `raw` y `join`, con las firmas del contrato. Los usan `ui.js` (Tarea 12) y las pantallas de B2.

- [ ] **Step 1: Write the failing test**

Crear `scripts/tests/test_rediseno_html.mjs`:

```js
// Plan B1, tarea 2: plantillas con escapado automático (spec §5.1 y §11).
// Toda interpolación se escapa; solo pasan tal cual los fragmentos Html que
// produce la propia etiqueta html``, y raw() rechaza cualquier otra cosa.
import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { Html, escape, html, raw, join } from '../../src/html.js';

// Nombre real de la federación (SHIELDS y data-season-2024-2025.js).
const VICTORIA_B = 'VICTORIA, REAL CLUB "B"';

test('escape: escapa & < > " \' y convierte null/undefined en cadena vacía', () => {
  assert.equal(escape(`<a href="x">Tom & Jerry's</a>`),
    '&lt;a href=&quot;x&quot;&gt;Tom &amp; Jerry&#39;s&lt;/a&gt;');
  assert.equal(escape(null), '');
  assert.equal(escape(undefined), '');
  assert.equal(escape(0), '0');
  assert.equal(escape(28), '28');
  assert.equal(escape(false), 'false');
  assert.equal(escape('&amp;'), '&amp;amp;', 'escapa también lo que ya parece una entidad');
});

test('html: devuelve Html y escapa cada interpolación, en texto y en atributos', () => {
  const out = html`<td title="${VICTORIA_B}">${VICTORIA_B}</td>`;
  assert.ok(out instanceof Html);
  assert.equal(String(out),
    '<td title="VICTORIA, REAL CLUB &quot;B&quot;">VICTORIA, REAL CLUB &quot;B&quot;</td>');
  assert.equal(`${out}`, String(out), 'toString da el marcado');
  const hostil = '<img src=x onerror=alert(1)>';
  assert.equal(String(html`<b>${hostil}</b>`), '<b>&lt;img src=x onerror=alert(1)&gt;</b>');
  assert.equal(String(html`<a href="#/equipo?t=${"x' onmouseover='y"}">`),
    '<a href="#/equipo?t=x&#39; onmouseover=&#39;y">');
});

test('html: null, undefined y false no pintan nada; 0 sí', () => {
  const nada = null, indef = undefined, falso = false;
  assert.equal(String(html`[${nada}|${indef}|${falso}|${0}]`), '[|||0]');
  const mio = false;
  assert.equal(String(html`<tr>${mio && html`<b>mío</b>`}</tr>`), '<tr></tr>');
});

test('html: un Html anidado no se vuelve a escapar, pero su contenido sí se escapó', () => {
  const inner = html`<b>${'<i>'}</b>`;
  assert.equal(String(html`<p>${inner}</p>`), '<p><b>&lt;i&gt;</b></p>');
  assert.equal(String(html`${html`${html`<em>${'&'}</em>`}`}`), '<em>&amp;</em>');
});

test('html: los arrays se unen sin separador; sus Html pasan y sus textos se escapan', () => {
  const filas = ['A', 'B'].map(t => html`<li>${t}</li>`);
  assert.equal(String(html`<ul>${filas}</ul>`), '<ul><li>A</li><li>B</li></ul>');
  assert.equal(String(html`${['<x>', html`<y>`, [html`<z>`, '&'], null, false]}`),
    '&lt;x&gt;<y><z>&amp;');
});

test('html: un objeto que imita a Html se escapa (solo cuentan las instancias reales)', () => {
  const falso = { s: '<script>', toString() { return '<script>'; } };
  assert.equal(String(html`${falso}`), '&lt;script&gt;');
});

test('raw: devuelve el mismo Html y lanza TypeError con cualquier otra cosa', () => {
  const h = html`<b>ok</b>`;
  assert.equal(raw(h), h);
  for (const v of ['<b>', null, undefined, 3, ['<b>'], { s: '<b>' }]) {
    assert.throws(() => raw(v), TypeError, `raw(${JSON.stringify(v)}) debería lanzar`);
  }
  assert.equal(String(html`<p>${raw(h)}</p>`), '<p><b>ok</b></p>');
});

test('join: une Html con separador escapado, sin tocar los Html y saltando los vacíos', () => {
  const items = [html`<b>1</b>`, html`<b>2</b>`];
  assert.ok(join(items) instanceof Html);
  assert.equal(String(join(items)), '<b>1</b><b>2</b>');
  assert.equal(String(join(items, ', ')), '<b>1</b>, <b>2</b>');
  assert.equal(String(join(items, html`<br>`)), '<b>1</b><br><b>2</b>');
  assert.equal(String(join(items, ' < ')), '<b>1</b> &lt; <b>2</b>');
  assert.equal(String(join([items[0], null, false, undefined, items[1]], '·')), '<b>1</b>·<b>2</b>');
  assert.equal(String(join(['<a>', items[0]], ' ')), '&lt;a&gt; <b>1</b>');
  assert.equal(String(join([])), '');
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd /home/manolo/claude/futbol-base
node --test scripts/tests/test_rediseno_html.mjs 2>&1 | grep -E '^# (tests|pass|fail)|ERR_MODULE_NOT_FOUND\]'
```
Esperado:
```text
# Error [ERR_MODULE_NOT_FOUND]: Cannot find module '/home/manolo/claude/futbol-base/src/html.js' imported from /home/manolo/claude/futbol-base/scripts/tests/test_rediseno_html.mjs
# tests 1
# pass 0
# fail 1
```

- [ ] **Step 3: Write minimal implementation**

Crear `src/html.js`:

```js
// Plantillas con escapado automático (spec §5.1).
// html`…` escapa toda interpolación salvo los fragmentos Html que ella misma
// produce (y los arrays de ellos). Así, un nombre de equipo con comillas o
// «<» nunca rompe el marcado ni inyecta nada.

export class Html { constructor(s) { this.s = s; } toString() { return this.s; } }

const ENTITIES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

export function escape(value) {
  if (value == null) return '';
  return String(value).replace(/[&<>"']/g, (c) => ENTITIES[c]);
}

// Una interpolación: Html tal cual, arrays unidos sin separador, null,
// undefined y false como nada (permite ${cond && html`…`}), y el resto escapado.
function part(value) {
  if (value instanceof Html) return value.s;
  if (Array.isArray(value)) return value.map(part).join('');
  if (value === false) return '';
  return escape(value);
}

export function html(strings, ...values) {
  let out = strings[0];
  for (let i = 0; i < values.length; i++) out += part(values[i]) + strings[i + 1];
  return new Html(out);
}

export function raw(value) {
  if (value instanceof Html) return value;
  throw new TypeError('raw() solo acepta fragmentos creados con html``');
}

export function join(items, sep = '') {
  const kept = items.filter((item) => item != null && item !== false);
  return new Html(kept.map(part).join(part(sep)));
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
cd /home/manolo/claude/futbol-base
node --test scripts/tests/test_rediseno_html.mjs 2>&1 | grep -E '^# (tests|pass|fail)'
```
Esperado:
```text
# tests 8
# pass 8
# fail 0
```

- [ ] **Step 5: Suites completas**

```bash
cd /home/manolo/claude/futbol-base
python3 -m pytest scripts/tests/ -q 2>&1 | tail -1
node --test scripts/tests/test_*.mjs 2>&1 | grep -E '^# (tests|pass|fail)'
```
Esperado:
- pytest: el mismo recuento que al terminar la tarea anterior, sin `failed` (esta tarea no añade pruebas de Python).
- node: el recuento anterior más 8, sin fallos (`# fail 0`).

- [ ] **Step 6: Commit**

```bash
cd /home/manolo/claude/futbol-base
git add src/html.js scripts/tests/test_rediseno_html.mjs
git commit -F - <<'EOF'
feat(rediseño): plantillas html`` con escapado automático (B1, tarea 2)

src/html.js: html`` escapa toda interpolación salvo los fragmentos Html
que produce ella misma (y los arrays de ellos); null, undefined y false
no pintan nada. raw() solo acepta Html y join() une fragmentos con un
separador escapado. Todavía no lo importa nadie.

- test_rediseno_html: escapado en texto y en atributos con un nombre
  real con comillas, Html anidado sin doble escape, arrays, objetos que
  imitan a Html, raw() y join().

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01Sg56KK3oZgo8Ye7Snj6wG9
EOF
git show --stat --oneline HEAD | tail -1
```
Esperado: `2 files changed`, con `src/html.js` y `scripts/tests/test_rediseno_html.mjs`.

---

### Task 3: `model.js`, filas, grupos y temporadas

**Contexto**
- **Formas reales.** Comprobadas el 23/09 con `vm.runInNewContext` sobre los `data-*.js` de `main` con la reparación A2 publicada:
  - `HISTORY` tiene 3.217 filas, todas de 8 columnas `[fecha, local, visitante, gl, gv, null, hora, campo]`.
    - La fecha va como `AAAA-MM-DD` o `DD-MM-AAAA` (Fuerteventura y Lanzarote), o vacía en 55 filas: 26 de la Copa de Campeones, 14 de CD Teguinte en PFV2 y 15 de FV11.
    - En la Copa de Campeones la fecha va en la clave de ronda: «06-06-2026 ( Final )».
    - La hora es `HH:MM`, `''` o `null`, y el campo, texto, `''` o `null`.
  - `SEASON_2021_2022` a `SEASON_2024_2025` suman 11.358 filas de 8 columnas en `jornadas`:
    - fechas `DD/MM` (sin año), `DD-MM-AAAA` o `''`;
    - hora y campo `''` cuando faltan.
  - Maspalomas:
    - los cuadros llevan `jornadas` con 88 filas de 9 columnas (14 con tanda), y además `matches` en línea con los mismos partidos, que no se usan;
    - la fase de grupos solo trae `matches` en línea de 7 columnas `[día, hora, local, visitante, gl, gv, campo]` y `jornada: 'Fase de Grupos'`.
  - Los grupos de la temporada actual traen en `matches` la jornada en curso, con ese mismo formato de 7 columnas (en PG2, los 6 partidos de la jornada 30). No se usan nunca: la temporada sale de `HISTORY`.
  - Las clasificaciones tienen 10 columnas numéricas en todas las temporadas. Los marcadores traen los dos números o los dos `null`.
- **Fechas.** `fixtureISO(fecha, temporada)` se llama siempre con la temporada explícita.
  - Su valor por defecto es `PORTAL.season` (`config.js`), que cambia al activar 2026/27.
  - Por eso `rowToMatch` y `buildGroup` lanzan `TypeError` si no reciben una temporada `AAAA-AAAA`.
  - Si la fila no trae fecha, se toma la de la clave de ronda (Copa de Campeones 2023-24 y 2025-26).
  - Julio sin año es del año final de la temporada (decisión 18). `fixtureISO`, que usa la app actual y no se toca, lo pone en el primer año: un partido de verano del 01/07/2027 caería en 2026, antes que toda la temporada. Lo corrige `seasonISO`, en `model.js`. En los datos reales no hay ninguna fila de julio sin año, así que hoy no cambia ninguna fecha.
  - Si la clave trae la fecha completa y la fila solo `DD/MM` del mismo día y mes, manda el año de la clave (decisión 14): una final del 14-08-2027 no cae en 2026, aunque agosto sea del primer año.
- **Un solo detector de copa.**
  - `isCupGroup` detecta los 51 grupos de copa reales.
  - Ningún grupo de liga tiene rondas «Ronda N» ni código `…KO`.
  - La regla del embudo de `isRoundRobinCup` da 14 cuadros y 37 liguillas: la Copa de Campeones 2023-24, las copas insulares y la fase de grupos de la Maspalomas.
  - Coincide con lo que pinta hoy `render.js`.
- **Todo el archivo** se construye en Node en 70-100 ms: 218 grupos (191 de la base y 27 de la Maspalomas) y 14.801 partidos. A 23/09/2026 hay 14.447 jugados, 204 sin resultado y 150 sin fecha.
- **`Row.retired`** vale `false` en esta tarea. Lo rellena `buildGroup` con `retiredTeams` a partir de la Tarea 5. Estas pruebas no fijan `retired` de ningún equipo que pueda estar retirado.
- **`Match` no lleva `state`** (contrato del plan). El estado depende del día y se pide a `matchState(match, todayISO)`: así el `Season` memorizado no caduca a medianoche.
- **Imports.** `model.js` importa de `state.js` y `links.js`, que cargan `config.js`, sin tocar el DOM ni leer globales `data-*`. Ninguna prueba depende de un valor de `config.js`.

**Files:**
- Create: `src/model.js`
- Create: `scripts/tests/test_rediseno_model_temporadas.mjs`

**Interfaces:**
- Consumes:
  - `fixture('current-2025-2026')`, `fixture('historical-2024-2025')` y `fixture('cups-2025-2026')`, de `scripts/tests/fixtures/rediseno/load.mjs` (Tarea 1);
  - de `src/state.js`: `isCupGroup`, `isRoundRobinCup`, `knockoutRoundLabel`, `matchAdvancer`, `sortJornadaKeys` y `jornadaNumber`;
  - de `src/links.js`: `fixtureISO`.
- Produces (`src/model.js`):
  - `rowToMatch(row, { season, groupId, roundKey })` → `Match`. Acepta filas de 5, 6, 8 y 9 columnas; con otra longitud lanza `RangeError`, y sin temporada, `TypeError`.
  - `inlineRowToMatch(row, { season, groupId, roundKey })` → `Match`. Solo filas de 7 columnas.
  - `buildGroup(raw, { season, cat, current, history })` → `Group`, con `compKey: null` y `label: null` hasta la Tarea 4, y `retired: false` hasta la Tarea 5.
  - `buildSeason({ name, current, benjamin, prebenjamin, history })` → `Season`. `buildSeason(SEASON_2024_2025)` funciona tal cual.
  - `buildCups({ season, benjamin, prebenjamin })` → `Cups { season, groups }`.
  - `groupKind(raw, rounds)` → `'league' | 'cup-bracket' | 'cup-league'`. `rounds` es `Round[]`; basta `[{key, matches}]`.
  - `matchState(match, todayISO)` → `'jugado' | 'pendiente' | 'sin resultado' | 'sin fecha'`. Lanza `TypeError` si `todayISO` no es `AAAA-MM-DD`.
  - Campos de `Match`:
    - `dateISO`: `fixtureISO(fecha, season)`, salvo julio sin año, que es del año final (decisión 18), o la fecha de la clave de ronda; si no hay ninguna, `null`. Con la fecha completa en la clave y `DD/MM` del mismo día en la fila, la de la clave (decisión 14);
    - `time` y `venue`: texto recortado o `null` (`''` pasa a `null`);
    - `hs` y `as`: número o `null`;
    - `advancer`: quién pasó, `matchAdvancer`, solo en los cuadros; `null` en ligas y liguillas;
    - `shootout`: `'h-a'` o `null`.
  - Campos de `Round`:
    - `key`: la clave de la fuente;
    - `n`: `jornadaNumber(key)`;
    - `label`: en los cuadros, la ronda de `knockoutRoundLabel` («Cuartos», «Final»); en el resto, «Jornada N» si la clave es numérica y, si no, la clave sin fecha ni paréntesis («Ronda 1», «Fase de Grupos»);
    - `dateFrom` y `dateTo`: la primera y la última `dateISO` de la ronda.
  - Campos de `Group`:
    - `currentRound`: la clave de la ronda en curso según la fuente (`jornada` o `current_jornada`), o `null`;
    - `url` y `standingsKind`: el dato, o `null`.

- [ ] **Step 1: Write the failing test**

Crear `scripts/tests/test_rediseno_model_temporadas.mjs`:

```js
/**
 * Rediseño «Acta», Tarea 3: model.js, filas, grupos y temporadas (spec §5.3).
 * Run: node --test scripts/tests/test_rediseno_model_temporadas.mjs
 *
 * Solo fixtures congeladas (scripts/tests/fixtures/rediseno/) y filas reales
 * copiadas literalmente; nunca los data-*.js ni src/config.js vivos.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fixture } from './fixtures/rediseno/load.mjs';
import {
  rowToMatch, inlineRowToMatch, buildGroup, buildSeason, buildCups, groupKind, matchState,
} from '../../src/model.js';
import { fixtureISO } from '../../src/links.js';

const MATCH_KEYS = ['season', 'groupId', 'roundKey', 'dateISO', 'time', 'venue', 'home', 'away', 'hs', 'as', 'advancer', 'shootout'];
const ROUND_KEYS = ['key', 'label', 'n', 'dateFrom', 'dateTo', 'matches'];
const GROUP_KEYS = ['season', 'id', 'cat', 'name', 'fullName', 'phase', 'island', 'url', 'standingsKind',
  'kind', 'compKey', 'label', 'standings', 'rounds', 'currentRound'];
const ROW_KEYS = ['pos', 'team', 'pts', 'pj', 'g', 'e', 'p', 'gf', 'gc', 'dg', 'retired'];

const current = () => {
  const f = fixture('current-2025-2026');
  return buildSeason({ name: f.season, current: true, benjamin: f.benjamin, prebenjamin: f.prebenjamin, history: f.history });
};
const historical = () => {
  const f = fixture('historical-2024-2025');
  return buildSeason({ name: f.season, current: false, benjamin: f.benjamin, prebenjamin: f.prebenjamin });
};
const cups = () => {
  const f = fixture('cups-2025-2026');
  return buildCups({ season: '2025-2026', benjamin: f.benjamin, prebenjamin: f.prebenjamin });
};
const byId = (groups, id) => groups.find(g => g.id === id);
const allMatches = group => group.rounds.flatMap(r => r.matches);

// ── rowToMatch ─────────────────────────────────────────────────────────────

test('rowToMatch: fila de HISTORY (8 columnas, fecha ISO)', () => {
  const m = rowToMatch(['2026-06-02', 'Las Mesas Hu.', 'AD Huracán', 2, 7, null, '17:30', null],
    { season: '2025-2026', groupId: 'PG2', roundKey: 'Jornada 30' });
  assert.deepEqual(m, {
    season: '2025-2026', groupId: 'PG2', roundKey: 'Jornada 30', dateISO: '2026-06-02', time: '17:30',
    venue: null, home: 'Las Mesas Hu.', away: 'AD Huracán', hs: 2, as: 7, advancer: null, shootout: null,
  });
  assert.deepEqual(Object.keys(m), MATCH_KEYS);
});

test('rowToMatch: fila histórica DD/MM toma el año de la temporada; "" pasa a null', () => {
  const ctx = { season: '2024-2025', groupId: 'PGC2', roundKey: '1' };
  const oct = rowToMatch(['26/10', 'AD Huracán', 'VETERANOS DEL PILA, C.D.', 3, 0, null, '09:00', 'LAS TORRES F8 (2)'], ctx);
  assert.equal(oct.dateISO, '2024-10-26');
  assert.equal(oct.time, '09:00');
  assert.equal(oct.venue, 'LAS TORRES F8 (2)');
  const apr = rowToMatch(['06/04', 'Las Mesas Hu.', 'Tamaraceite', 0, 8, null, '09:00', 'LAS TORRES F8 (2)'], { ...ctx, roundKey: '22' });
  assert.equal(apr.dateISO, '2025-04-06');
  const noDate = rowToMatch(['', 'Simusetti', 'Arucas B', null, null, null, '', ''], ctx);
  assert.equal(noDate.dateISO, null);
  assert.equal(noDate.time, null);
  assert.equal(noDate.venue, null);
  assert.equal(noDate.hs, null);
  assert.equal(noDate.as, null);
});

test('rowToMatch: DD-MM-YYYY (Fuerteventura)', () => {
  const m = rowToMatch(['02-11-2025', 'COTILLO, C.D. EL', 'CD 35600', 4, 9, null, '10:30', 'CENTRO DEPORTIVO INSULAR FRANCISCO MELIÁN 2'],
    { season: '2025-2026', groupId: 'PFV2', roundKey: '1' });
  assert.equal(m.dateISO, '2025-11-02');
});

test('rowToMatch: sin fecha en la fila, la toma de la clave de ronda (Copa de Campeones)', () => {
  const m = rowToMatch(['', 'Acodetti', 'Las Palmas', 0, 1, null, '', ''],
    { season: '2025-2026', groupId: 'BCA1', roundKey: '06-06-2026 ( Final )' });
  assert.equal(m.dateISO, '2026-06-06');
  assert.equal(m.time, null);
  assert.equal(m.venue, null);
});

test('rowToMatch: DD/MM del mismo día que la clave de ronda toma el año de la clave (julio y agosto de 2027)', () => {
  const ctx = { season: '2026-2027', groupId: 'MCPK1', roundKey: '02-07-2027 ( Final )' };
  const final = rowToMatch(['02/07', 'CD Maspa Training A', 'CF Unión Viera', null, null, null, '12:00', 'CD 1', null], ctx);
  assert.equal(final.dateISO, '2027-07-02');
  // Agosto sin año es del primer año, como en fixtureISO: solo la clave dice que esta final es de 2027.
  const august = ['14/08', 'CD Maspa Training A', 'CF Unión Viera', null, null];
  assert.equal(rowToMatch(august, { ...ctx, roundKey: '14-08-2027 ( Final )' }).dateISO, '2027-08-14');
  assert.equal(rowToMatch(august, { ...ctx, roundKey: 'Final' }).dateISO, '2026-08-14');
});

test('rowToMatch: julio sin año es del año final de la temporada, y fixtureISO no cambia (decisión 18)', () => {
  const ctx = { season: '2026-2027', groupId: 'MCP3', roundKey: 'Fase de Grupos' };
  const july = rowToMatch(['01/07', 'CD Tablero', 'UD Las Mesas Huracán', null, null], ctx);
  assert.equal(july.dateISO, '2027-07-01');
  assert.equal(fixtureISO('01/07', '2026-2027'), '2026-07-01');
  // El 29/06/2027, el partido del 30/06 y el del 01/07 siguen pendientes.
  const june = rowToMatch(['30/06', 'CD Tablero', 'UD Las Mesas Huracán', null, null], ctx);
  assert.equal(june.dateISO, '2027-06-30');
  assert.equal(matchState(june, '2027-06-29'), 'pendiente');
  assert.equal(matchState(july, '2027-06-29'), 'pendiente');
});

test('rowToMatch: cuadro de 9 columnas con pen y tanda', () => {
  const m = rowToMatch(['27/06', 'UD Las Mesas Huracán', 'CF Unión Carrizal', 1, 1, 'home', '10:00', 'CD 4', '3-2'],
    { season: '2025-2026', groupId: 'MCPK1', roundKey: '27-06-2026 ( Cuartos )' });
  assert.deepEqual(m, {
    season: '2025-2026', groupId: 'MCPK1', roundKey: '27-06-2026 ( Cuartos )', dateISO: '2026-06-27',
    time: '10:00', venue: 'CD 4', home: 'UD Las Mesas Huracán', away: 'CF Unión Carrizal',
    hs: 1, as: 1, advancer: 'home', shootout: '3-2',
  });
});

test('rowToMatch: filas antiguas de 6 y 5 columnas (caché vieja del SW)', () => {
  const ctx = { season: '2025-2026', groupId: 'MCPK1', roundKey: '27-06-2026 ( Cuartos )' };
  const six = rowToMatch(['27/06', 'UD Las Mesas Huracán', 'CF Unión Carrizal', 1, 1, 'home'], ctx);
  assert.equal(six.advancer, 'home');
  assert.equal(six.time, null);
  assert.equal(six.venue, null);
  assert.equal(six.shootout, null);
  const five = rowToMatch(['26/06', 'CD Tablero', 'UD Las Mesas Huracán', 1, 4], { ...ctx, roundKey: '26-06-2026 ( Previa )' });
  assert.equal(five.dateISO, '2026-06-26');
  assert.equal(five.advancer, null);
  assert.equal(five.shootout, null);
});

test('rowToMatch: rechaza el formato en línea de 7 columnas y la temporada ausente', () => {
  const inline = ['23/06', '14:00', 'UD Las Mesas Huracán', 'Real Club Victoria', 1, 4, 'Campo CD 1.2 - Campo Joma 2'];
  assert.throws(() => rowToMatch(inline, { season: '2025-2026', groupId: 'MCP3', roundKey: 'Fase de Grupos' }), RangeError);
  assert.throws(() => rowToMatch(['2026-06-02', 'A', 'B', 1, 0, null, '', ''], { groupId: 'PG2', roundKey: 'Jornada 30' }), TypeError);
});

// ── inlineRowToMatch ───────────────────────────────────────────────────────

test('inlineRowToMatch: fase de grupos de la Maspalomas [día, hora, local, visitante, gl, gv, campo]', () => {
  const m = inlineRowToMatch(['23/06', '14:00', 'UD Las Mesas Huracán', 'Real Club Victoria', 1, 4, 'Campo CD 1.2 - Campo Joma 2'],
    { season: '2025-2026', groupId: 'MCP3', roundKey: 'Fase de Grupos' });
  assert.deepEqual(m, {
    season: '2025-2026', groupId: 'MCP3', roundKey: 'Fase de Grupos', dateISO: '2026-06-23', time: '14:00',
    venue: 'Campo CD 1.2 - Campo Joma 2', home: 'UD Las Mesas Huracán', away: 'Real Club Victoria',
    hs: 1, as: 4, advancer: null, shootout: null,
  });
  assert.throws(() => inlineRowToMatch(['2026-06-02', 'A', 'B', 1, 0, null, '', ''],
    { season: '2025-2026', groupId: 'MCP3', roundKey: 'Fase de Grupos' }), RangeError);
});

// ── buildSeason: temporada actual ──────────────────────────────────────────

test('buildSeason actual: grupos de ambas categorías, en orden y con la forma de §5.3', () => {
  const f = fixture('current-2025-2026');
  const s = current();
  assert.equal(s.name, '2025-2026');
  assert.equal(s.current, true);
  assert.deepEqual(s.groups.map(g => `${g.cat}:${g.id}`), [
    ...f.benjamin.map(g => `benjamin:${g.id}`), ...f.prebenjamin.map(g => `prebenjamin:${g.id}`),
  ]);
  assert.deepEqual(s.groups.map(g => g.id).sort(), ['A1', 'A2', 'B1', 'B2', 'FF13', 'FF15', 'FF5', 'FF9', 'PFV2', 'PG2', 'PG3']);
  for (const g of s.groups) {
    assert.deepEqual(Object.keys(g), GROUP_KEYS, g.id);
    assert.equal(g.season, '2025-2026');
    g.standings.forEach(r => { assert.deepEqual(Object.keys(r), ROW_KEYS); assert.equal(typeof r.retired, 'boolean'); });
    g.rounds.forEach(r => {
      assert.deepEqual(Object.keys(r), ROUND_KEYS);
      r.matches.forEach(m => assert.deepEqual(Object.keys(m), MATCH_KEYS));
    });
  }
});

test('buildSeason actual: PG2 sale de HISTORY entera (30 jornadas), nunca de matches en línea', () => {
  const pg2 = byId(current().groups, 'PG2');
  assert.equal(pg2.kind, 'league');
  assert.equal(pg2.url, 'https://futbolaspalmas.com/1prebenjamin2');
  assert.equal(pg2.standingsKind, 'source');
  assert.equal(pg2.currentRound, 'Jornada 30');
  assert.equal(pg2.rounds.length, 30);
  assert.deepEqual(pg2.rounds.slice(0, 3).map(r => r.key), ['Jornada 1', 'Jornada 2', 'Jornada 3']);
  assert.equal(allMatches(pg2).length, 182);
  const j30 = pg2.rounds[29];
  assert.deepEqual({ key: j30.key, label: j30.label, n: j30.n, dateFrom: j30.dateFrom, dateTo: j30.dateTo, count: j30.matches.length },
    { key: 'Jornada 30', label: 'Jornada 30', n: 30, dateFrom: '2026-06-02', dateTo: '2026-06-06', count: 6 });
  assert.deepEqual(j30.matches[0], {
    season: '2025-2026', groupId: 'PG2', roundKey: 'Jornada 30', dateISO: '2026-06-02', time: '17:30',
    venue: null, home: 'Las Mesas Hu.', away: 'AD Huracán', hs: 2, as: 7, advancer: null, shootout: null,
  });
  assert.deepEqual(pg2.standings[0], {
    pos: 1, team: 'Unión Viera', pts: 79, pj: 28, g: 26, e: 1, p: 1, gf: 190, gc: 36, dg: 154, retired: false,
  });
  assert.equal(pg2.standings.length, 15);
});

test('buildSeason actual: PFV2 ordena jornadas numéricas y deja sin fecha los partidos de CD Teguinte', () => {
  const pfv2 = byId(current().groups, 'PFV2');
  assert.deepEqual(pfv2.rounds.map(r => r.key), ['1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '11', '12', '13', '14']);
  assert.deepEqual(pfv2.rounds.map(r => r.n), [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14]);
  assert.equal(pfv2.rounds[0].label, 'Jornada 1');
  assert.equal(pfv2.currentRound, '14');
  const teguinte = allMatches(pfv2).filter(m => m.home === 'CD Teguinte' || m.away === 'CD Teguinte');
  assert.equal(teguinte.length, 14);
  assert.ok(teguinte.every(m => m.dateISO === null && m.hs === null && m.as === null));
  assert.equal(pfv2.rounds[0].dateFrom, '2025-11-02');
});

test('buildGroup actual: sin entrada en HISTORY no hay jornadas (nunca las matches en línea)', () => {
  const f = fixture('current-2025-2026');
  const raw = f.prebenjamin.find(g => g.id === 'PG2');
  assert.equal(raw.matches.length, 6, 'la fixture trae la jornada en curso en línea');
  const g = buildGroup(raw, { season: f.season, cat: 'prebenjamin', current: true, history: {} });
  assert.deepEqual(g.rounds, []);
  assert.equal(g.currentRound, null);
  assert.equal(g.standings.length, 15);
});

test('buildSeason: HISTORY solo alimenta la temporada actual (códigos repetidos entre temporadas)', () => {
  const f = fixture('historical-2024-2025');
  const ajena = { P1: { 'Jornada 1': [['2025-10-01', 'Otro', 'Equipo', 1, 0, null, '', '']] } };
  const s = buildSeason({ name: f.season, current: false, benjamin: f.benjamin, prebenjamin: f.prebenjamin, history: ajena });
  const p1 = byId(s.groups, 'P1');
  assert.equal(p1.rounds.length, 9);
  assert.ok(allMatches(p1).every(m => m.home !== 'Otro'));
});

// ── buildSeason: temporada histórica ───────────────────────────────────────

test('buildSeason histórica: P1 y PGC2 desde jornadas, con el año de su temporada', () => {
  const s = historical();
  assert.equal(s.current, false);
  assert.deepEqual(s.groups.map(g => `${g.cat}:${g.id}`), ['benjamin:P1', 'prebenjamin:PGC2']);
  const p1 = byId(s.groups, 'P1');
  assert.equal(p1.url, null);
  assert.equal(p1.standingsKind, null);
  assert.equal(p1.kind, 'league');
  assert.equal(p1.currentRound, '9');
  assert.deepEqual(p1.rounds.map(r => r.label), ['Jornada 1', 'Jornada 2', 'Jornada 3', 'Jornada 4', 'Jornada 5',
    'Jornada 6', 'Jornada 7', 'Jornada 8', 'Jornada 9']);
  assert.deepEqual([p1.rounds[0].dateFrom, p1.rounds[0].dateTo], ['2024-10-25', '2024-10-26']);
  assert.deepEqual([p1.rounds[8].dateFrom, p1.rounds[8].dateTo], ['2024-12-20', '2024-12-21']);
  assert.ok(allMatches(p1).every(m => m.time === null && m.venue === null));
  const pgc2 = byId(s.groups, 'PGC2');
  assert.equal(pgc2.rounds.length, 22);
  const simusetti = allMatches(pgc2).filter(m => m.home === 'Simusetti' || m.away === 'Simusetti');
  assert.equal(simusetti.length, 22);
  assert.ok(simusetti.every(m => m.dateISO === null));
  const huracan = pgc2.rounds[0].matches.find(m => m.home === 'AD Huracán');
  assert.deepEqual([huracan.dateISO, huracan.time, huracan.venue, huracan.hs, huracan.as],
    ['2024-10-26', '09:00', 'LAS TORRES F8 (2)', 3, 0]);
});

// ── buildCups: Maspalomas ──────────────────────────────────────────────────

test('buildCups: fase de grupos en línea (cup-league) y cuadros desde jornadas (cup-bracket)', () => {
  const c = cups();
  assert.equal(c.season, '2025-2026');
  assert.deepEqual(Object.fromEntries(c.groups.map(g => [g.id, `${g.cat}:${g.kind}`])), {
    MCB16: 'benjamin:cup-league', MCBK2: 'benjamin:cup-bracket',
    MCP3: 'prebenjamin:cup-league', MCPK1: 'prebenjamin:cup-bracket',
  });
  const mcp3 = byId(c.groups, 'MCP3');
  assert.equal(mcp3.rounds.length, 1);
  assert.deepEqual({ key: mcp3.rounds[0].key, label: mcp3.rounds[0].label, n: mcp3.rounds[0].n,
    dateFrom: mcp3.rounds[0].dateFrom, dateTo: mcp3.rounds[0].dateTo, count: mcp3.rounds[0].matches.length },
  { key: 'Fase de Grupos', label: 'Fase de Grupos', n: null, dateFrom: '2026-06-23', dateTo: '2026-06-25', count: 6 });
  assert.equal(mcp3.currentRound, 'Fase de Grupos');
  assert.equal(mcp3.url, null);
  assert.deepEqual(mcp3.standings.map(r => [r.pos, r.team, r.pts]), [
    [1, 'Real Club Victoria', 9], [2, 'CDA El Médano CF', 4], [3, 'UD Las Mesas Huracán', 3], [4, 'Arucas CF', 1],
  ]);
});

test('buildCups: MCPK1, rondas del cuadro, quién pasó y tanda', () => {
  const k1 = byId(cups().groups, 'MCPK1');
  assert.deepEqual(k1.rounds.map(r => r.label), ['Previa', 'Cuartos', 'Semifinales', 'Final']);
  assert.deepEqual(k1.rounds.map(r => r.matches.length), [4, 4, 2, 1]);
  assert.equal(k1.currentRound, null);
  const qf = k1.rounds[1].matches.find(m => m.home === 'UD Las Mesas Huracán');
  assert.deepEqual([qf.away, qf.hs, qf.as, qf.advancer, qf.shootout, qf.time, qf.venue],
    ['CF Unión Carrizal', 1, 1, 'home', '3-2', '10:00', 'CD 4']);
  const final = k1.rounds[3].matches[0];
  assert.deepEqual([final.home, final.away, final.hs, final.as, final.advancer, final.dateISO],
    ['CD Maspa Training A', 'CF Unión Viera', 1, 2, 'away', '2026-06-27']);
  const previa = k1.rounds[0].matches.find(m => m.away === 'UD Las Mesas Huracán');
  assert.deepEqual([previa.home, previa.hs, previa.as, previa.advancer], ['CD Tablero', 1, 4, 'away']);
});

test('buildCups: MCBK2, final de la Copa Oro por penaltis', () => {
  const k2 = byId(cups().groups, 'MCBK2');
  assert.deepEqual(k2.rounds.map(r => r.label), ['Previa', 'Dieciseisavos', 'Octavos', 'Cuartos', 'Semifinales', 'Final']);
  const final = k2.rounds[5].matches[0];
  assert.deepEqual([final.home, final.away, final.hs, final.as, final.advancer, final.shootout],
    ['AD Huracán A', 'UD Vecindario A', 2, 2, 'away', '3-4']);
});

// ── groupKind ──────────────────────────────────────────────────────────────

const rounds = (...sizes) => sizes.map((n, i) => ({ key: String(i + 1), matches: Array.from({ length: n }, () => ({})) }));

test('groupKind: liga, liguilla de copa y cuadro (regla del embudo)', () => {
  assert.equal(groupKind({ id: 'PG2', phase: 'Gran Canaria' }, rounds(7, 6, 6)), 'league');
  // Liga cuya última jornada tiene menos partidos: sigue siendo liga
  assert.equal(groupKind({ id: 'FF17', phase: 'Primera Fase GC' }, rounds(3, 3, 2)), 'league');
  // Copa de Campeones 2023-24: una ronda de 7 partidos → liguilla
  assert.equal(groupKind({ id: 'BC1', phase: 'Copa de Campeones' },
    [{ key: '14-06-2024 ( Ronda 1 )', matches: Array.from({ length: 7 }, () => ({})) }]), 'cup-league');
  // Copa Fuerteventura 2022-23: jornadas numeradas de tamaño constante → liguilla
  assert.equal(groupKind({ id: 'CFV1', phase: 'Copa Fuerteventura' }, rounds(3, 3, 3, 3, 3)), 'cup-league');
  // Copa de Campeones 2025-26: cuartos, semifinales y final → cuadro
  assert.equal(groupKind({ id: 'BCA1', phase: 'Copa de Campeones' },
    [{ key: '06-06-2026 ( Cuartos )', matches: [{}, {}, {}, {}] }, { key: '06-06-2026 ( Semifinales )', matches: [{}, {}] },
      { key: '06-06-2026 ( Final )', matches: [{}] }]), 'cup-bracket');
  // Detectores que solo tenía isKnockoutGroup: código …KO y rondas «Ronda N»
  assert.equal(groupKind({ id: 'XKO', phase: 'Torneo' }, rounds(4, 2, 1)), 'cup-bracket');
  assert.equal(groupKind({ id: 'X1', phase: 'Torneo' },
    [{ key: 'Ronda 1', matches: [{}, {}] }, { key: 'Ronda 2', matches: [{}] }]), 'cup-bracket');
});

// ── matchState ─────────────────────────────────────────────────────────────

test('matchState: jugado, pendiente, sin resultado y sin fecha (spec §5.3)', () => {
  const ctx = { season: '2025-2026', groupId: 'FB', roundKey: 'Jornada 13' };
  const played = rowToMatch(['2026-06-02', 'Las Mesas Hu.', 'AD Huracán', 2, 7, null, '17:30', null], { ...ctx, groupId: 'PG2', roundKey: 'Jornada 30' });
  assert.equal(matchState(played, '2026-01-01'), 'jugado');
  assert.equal(matchState(played, '2026-09-23'), 'jugado');
  // El único partido con fecha y sin marcador de HISTORY (FB, jornada 13)
  const fb = rowToMatch(['2026-04-11', 'CD Tamasite', 'Corralejo 35', null, null, null, '10:00', null], ctx);
  assert.equal(matchState(fb, '2026-04-10'), 'pendiente');
  assert.equal(matchState(fb, '2026-04-11'), 'pendiente', 'el mismo día todavía es pendiente');
  assert.equal(matchState(fb, '2026-04-12'), 'sin resultado');
  assert.equal(matchState(fb, '2026-09-23'), 'sin resultado');
  // Sin fecha nunca es pendiente (CD Teguinte en PFV2)
  const teguinte = rowToMatch(['', 'ATISACHI DE FUERTEVENTURA C.F., C.D. "B"', 'CD Teguinte', null, null, null, '', ''],
    { ...ctx, groupId: 'PFV2', roundKey: '1' });
  assert.equal(matchState(teguinte, '2025-09-01'), 'sin fecha');
  assert.equal(matchState(teguinte, '2026-09-23'), 'sin fecha');
  assert.throws(() => matchState(fb, undefined), TypeError);
  assert.throws(() => matchState(fb, '11/04/2026'), TypeError);
});

test('matchState sobre las fixtures: en PFV2 solo los de CD Teguinte quedan sin fecha', () => {
  const pfv2 = byId(current().groups, 'PFV2');
  const states = allMatches(pfv2).map(m => matchState(m, '2026-09-23'));
  assert.equal(states.filter(s => s === 'sin fecha').length, 14);
  assert.equal(states.filter(s => s === 'pendiente').length, 0);
  assert.equal(states.filter(s => s === 'jugado').length, allMatches(pfv2).length - 14);
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd /home/manolo/claude/futbol-base
node --test scripts/tests/test_rediseno_model_temporadas.mjs 2>&1 | grep -E "Cannot find module|^# (tests|pass|fail)"
```
Esperado:
```text
# Error [ERR_MODULE_NOT_FOUND]: Cannot find module '/home/manolo/claude/futbol-base/src/model.js' imported from /home/manolo/claude/futbol-base/scripts/tests/test_rediseno_model_temporadas.mjs
# tests 1
# pass 0
# fail 1
```

- [ ] **Step 3: Write minimal implementation**

Crear `src/model.js`:

```js
/* Modelo normalizado del rediseño «Acta» (spec §5.3).
 *
 * Puro e importable en Node sin DOM: recibe los datos por parámetro y nunca
 * lee los globales data-* (BENJAMIN, HISTORY…) ni globalThis/window.
 *
 *   Row    { pos, team, pts, pj, g, e, p, gf, gc, dg, retired }
 *   Match  { season, groupId, roundKey, dateISO, time, venue, home, away,
 *            hs, as, advancer, shootout }
 *   Round  { key, label, n, dateFrom, dateTo, matches: Match[] }
 *   Group  { season, id, cat, name, fullName, phase, island, url, standingsKind,
 *            kind, compKey, label, standings: Row[], rounds: Round[], currentRound }
 *   Season { name, current, groups: Group[] }     Cups { season, groups: Group[] }
 *
 * El estado de un partido depende del día: no se guarda en Match, se pide a
 * matchState(match, todayISO).
 */
import {
  isCupGroup, isRoundRobinCup, knockoutRoundLabel, matchAdvancer, sortJornadaKeys, jornadaNumber,
} from './state.js';
import { fixtureISO } from './links.js';

const ROW_LENGTHS = [5, 6, 8, 9];
const SEASON_RE = /^\d{4}-\d{4}$/;
const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

const textOrNull = v => (v == null || String(v).trim() === '' ? null : String(v).trim());
const numberOrNull = v => (typeof v === 'number' && Number.isFinite(v) ? v : null);
const sideOrNull = v => (v === 'home' || v === 'away' ? v : null);
const shootoutOf = v => (typeof v === 'string' && /^\d+-\d+$/.test(v) ? v : null);

/* Las rondas de copa llevan la fecha en la clave («06-06-2026 ( Final )»)
 * aunque la fila venga sin fecha (Copa de Campeones 2025-26 y 2023-24). */
function dateInKey(key) {
  const m = String(key ?? '').match(/\d{2}-\d{2}-\d{4}/);
  return m ? m[0] : '';
}

/* fixtureISO con la temporada explícita, salvo en julio: una fecha de julio sin
 * año es del año final de la temporada (los torneos de verano), no del primero
 * como en fixtureISO, que usa la app actual y no cambia (decisión 18). */
function seasonISO(value, season) {
  const iso = fixtureISO(value, season);
  const noYear = /^\d{1,2}[/-]\d{1,2}$/.test(String(value ?? '').trim());
  if (iso && noYear && iso.slice(5, 7) === '07') return `${season.slice(5)}${iso.slice(4)}`;
  return iso;
}

/* Fecha del partido: la de la fila y, si no trae, la de la clave de ronda. Si
 * la clave trae la fecha completa y la fila solo el día y el mes (DD/MM) de ese
 * mismo día, manda el año de la clave: una final del 14-08-2027 en la
 * temporada 2026-2027 no cae en 2026 (decisión 14). */
function rowDateISO(date, roundKey, season) {
  const own = seasonISO(date, season);
  const fromKey = seasonISO(dateInKey(roundKey), season);
  const dayMonth = /^\d{1,2}\/\d{1,2}$/.test(String(date ?? '').trim());
  if (own && fromKey && dayMonth && own.slice(5) === fromKey.slice(5)) return fromKey;
  return own ?? fromKey;
}

function checkSeason(season, fn) {
  // fixtureISO toma PORTAL.season por defecto: sin temporada explícita, el
  // año saldría de config.js, que cambia al activar la temporada siguiente.
  if (!SEASON_RE.test(String(season))) throw new TypeError(`${fn}: temporada no válida (${season})`);
}

/* Fila por posición, el formato único de §5.3:
 *   [fecha, local, visitante, gl, gv, pen, hora, campo, tanda?]
 * Acepta 5 (temporadas antiguas), 6 (cuadros antiguos), 8 (HISTORY y
 * temporadas pasadas) y 9 columnas (cuadros de la Maspalomas). La fila en
 * línea de 7 columnas tiene otro orden: se lee con inlineRowToMatch. */
export function rowToMatch(row, { season, groupId, roundKey } = {}) {
  if (!Array.isArray(row) || !ROW_LENGTHS.includes(row.length)) {
    throw new RangeError(`rowToMatch: fila de ${Array.isArray(row) ? row.length : typeof row} columnas; se aceptan 5, 6, 8 y 9`);
  }
  checkSeason(season, 'rowToMatch');
  const [date, home, away, hs, as, pen, time, venue, shootout] = row;
  return {
    season,
    groupId,
    roundKey,
    dateISO: rowDateISO(date, roundKey, season),
    time: textOrNull(time),
    venue: textOrNull(venue),
    home,
    away,
    hs: numberOrNull(hs),
    as: numberOrNull(as),
    advancer: sideOrNull(pen),
    shootout: shootoutOf(shootout),
  };
}

/* Fila en línea de la fase de grupos de la Maspalomas (y de las `matches`
 * de la jornada en curso): [día, hora, local, visitante, gl, gv, campo]. */
export function inlineRowToMatch(row, { season, groupId, roundKey } = {}) {
  if (!Array.isArray(row) || row.length !== 7) {
    throw new RangeError(`inlineRowToMatch: fila de ${Array.isArray(row) ? row.length : typeof row} columnas; se esperan 7`);
  }
  const [date, time, home, away, hs, as, venue] = row;
  return rowToMatch([date, home, away, hs, as, null, time, venue], { season, groupId, roundKey });
}

/* Un solo detector de copa (spec §5.3): une isCupGroup (código PCC/BC/MCP/MCB
 * o fase con «copa», «campeon» o «maspalomas») con lo que solo miraba
 * isKnockoutGroup de render.js (código …KO o todas las rondas «Ronda N»), y
 * aplica la regla del embudo de isRoundRobinCup a las rondas ya ordenadas. */
export function groupKind(raw, rounds = []) {
  const id = String((raw && raw.id) || '').toUpperCase();
  const keys = rounds.map(r => r.key);
  const cup = isCupGroup(raw) || id.endsWith('KO')
    || (keys.length > 0 && keys.every(k => /ronda/i.test(k)));
  if (!cup) return 'league';
  const jornadas = Object.fromEntries(rounds.map(r => [r.key, r.matches]));
  return isRoundRobinCup(jornadas) ? 'cup-league' : 'cup-bracket';
}

/* Estado de un partido (spec §5.3). dateISO ya salió de seasonISO con la
 * temporada del grupo. «sin fecha» y «sin resultado» nunca son «pendiente». */
export function matchState(match, todayISO) {
  if (!ISO_DATE_RE.test(String(todayISO))) throw new TypeError(`matchState: hoy debe ser AAAA-MM-DD (${todayISO})`);
  if (match.hs != null && match.as != null) return 'jugado';
  if (!match.dateISO) return 'sin fecha';
  return match.dateISO >= todayISO ? 'pendiente' : 'sin resultado';
}

/* 'Jornada N' si la clave es numérica ('5', 'Jornada 5'); si no, la clave sin
 * la fecha ni los paréntesis ('14-06-2024 ( Ronda 1 )' → 'Ronda 1'). */
function roundLabel(key) {
  const n = jornadaNumber(key);
  if (n !== null) return `Jornada ${n}`;
  const bare = String(key).replace(/\d{2}-\d{2}-\d{4}/, '').replace(/[()]/g, ' ').replace(/\s+/g, ' ').trim();
  return bare || String(key);
}

/* De dónde salen las jornadas de un grupo:
 * - temporada actual: HISTORY[id], nunca las `matches` en línea, que solo
 *   traen la jornada en curso;
 * - temporadas pasadas y cuadros de la Maspalomas: `jornadas`;
 * - fase de grupos de la Maspalomas: `matches` en línea, en una sola ronda. */
function roundSource(raw, current, history) {
  if (current) return { jornadas: (history && history[raw.id]) || {}, inline: false };
  if (raw.jornadas && typeof raw.jornadas === 'object') return { jornadas: raw.jornadas, inline: false };
  if (Array.isArray(raw.matches) && raw.matches.length) {
    return { jornadas: { [textOrNull(raw.jornada) || 'Fase de Grupos']: raw.matches }, inline: true };
  }
  return { jornadas: {}, inline: false };
}

/* La ronda que la fuente marca como en curso (`jornada` en la temporada
 * actual y en los torneos, `current_jornada` en las pasadas), si existe. */
function currentRoundKey(raw, rounds) {
  const cur = textOrNull(raw.jornada ?? raw.current_jornada);
  if (!cur) return null;
  const exact = rounds.find(r => r.key === cur);
  if (exact) return exact.key;
  const n = jornadaNumber(cur);
  const byNumber = n === null ? null : rounds.find(r => r.n === n);
  return byNumber ? byNumber.key : null;
}

/* [pos, equipo, pts, J, G, E, P, GF, GC, DF] → Row. */
function standingRow(r) {
  return {
    pos: numberOrNull(r[0]),
    team: r[1],
    pts: numberOrNull(r[2]),
    pj: numberOrNull(r[3]),
    g: numberOrNull(r[4]),
    e: numberOrNull(r[5]),
    p: numberOrNull(r[6]),
    gf: numberOrNull(r[7]),
    gc: numberOrNull(r[8]),
    dg: numberOrNull(r[9]),
    retired: false,
  };
}

export function buildGroup(raw, { season, cat, current = false, history = null } = {}) {
  checkSeason(season, 'buildGroup');
  const { jornadas, inline } = roundSource(raw, current, history);
  const toMatch = inline ? inlineRowToMatch : rowToMatch;
  const rounds = sortJornadaKeys(Object.keys(jornadas)).map(key => ({
    key,
    label: null,
    n: jornadaNumber(key),
    dateFrom: null,
    dateTo: null,
    matches: (jornadas[key] || []).map(row => toMatch(row, { season, groupId: raw.id, roundKey: key })),
  }));
  const kind = groupKind(raw, rounds);
  rounds.forEach((round, idx) => {
    round.label = kind === 'cup-bracket' ? knockoutRoundLabel(round.key, idx, rounds.length) : roundLabel(round.key);
    const dates = round.matches.map(m => m.dateISO).filter(Boolean).sort();
    round.dateFrom = dates.length ? dates[0] : null;
    round.dateTo = dates.length ? dates[dates.length - 1] : null;
  });
  // Quién pasó: solo en los cuadros. matchAdvancer (state.js) usa el marcador,
  // la columna pen o, en un empate sin pen, quién sale en una ronda posterior.
  const order = rounds.map(r => r.key);
  const bracket = kind !== 'cup-bracket' ? null : Object.fromEntries(rounds.map(r =>
    [r.key, r.matches.map(m => [m.dateISO, m.home, m.away, m.hs, m.as, m.advancer])]));
  rounds.forEach((round, idx) => round.matches.forEach((m, i) => {
    m.advancer = bracket ? matchAdvancer(bracket[round.key][i], bracket, order, idx) : null;
  }));
  const group = {
    season,
    id: raw.id,
    cat,
    name: raw.name ?? null,
    fullName: raw.fullName ?? null,
    phase: raw.phase ?? null,
    island: raw.island ?? null,
    url: textOrNull(raw.url),
    standingsKind: raw.standingsKind ?? null,
    kind,
    compKey: null,   // Tarea 4: competitionKey
    label: null,     // Tarea 4: groupLabel
    standings: (raw.standings || []).map(standingRow),
    rounds,
    currentRound: currentRoundKey(raw, rounds),
  };
  return group;
}

/* Temporada de la FIFLP (ligas y copas de ambas categorías). `history`
 * (HISTORY) solo alimenta la temporada actual: los códigos se repiten entre
 * temporadas (BCA1 existe en 2024-25 y en 2025-26). */
export function buildSeason({ name, current = false, benjamin = [], prebenjamin = [], history = null } = {}) {
  const opts = cat => ({ season: name, cat, current: !!current, history: current ? history : null });
  return {
    name,
    current: !!current,
    groups: [
      ...(benjamin || []).map(raw => buildGroup(raw, opts('benjamin'))),
      ...(prebenjamin || []).map(raw => buildGroup(raw, opts('prebenjamin'))),
    ],
  };
}

/* Torneos (Maspalomas): capa aparte del Season memorizado. Nunca toman
 * HISTORY: la fase de grupos va en línea y los cuadros en `jornadas`. */
export function buildCups({ season, benjamin = [], prebenjamin = [] } = {}) {
  const opts = cat => ({ season, cat, current: false, history: null });
  return {
    season,
    groups: [
      ...(benjamin || []).map(raw => buildGroup(raw, opts('benjamin'))),
      ...(prebenjamin || []).map(raw => buildGroup(raw, opts('prebenjamin'))),
    ],
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
cd /home/manolo/claude/futbol-base
node --test scripts/tests/test_rediseno_model_temporadas.mjs 2>&1 | grep -E "^# (tests|pass|fail)"
```
Esperado:
```text
# tests 22
# pass 22
# fail 0
```

- [ ] **Step 5: Suites completas (las que bloquean al bot)**

```bash
cd /home/manolo/claude/futbol-base
python3 -m pytest scripts/tests/ -q 2>&1 | tail -1
node --test scripts/tests/test_*.mjs 2>&1 | grep -E '^# (tests|pass|fail)'
```
Esperado:
- pytest: el mismo recuento que al terminar la tarea anterior, sin `failed` (esta tarea no añade pruebas de Python).
- node: el recuento anterior más 22, sin fallos (`# fail 0`).

- [ ] **Step 6: Commit**

```bash
cd /home/manolo/claude/futbol-base
git add src/model.js scripts/tests/test_rediseno_model_temporadas.mjs
git commit -F - <<'EOF'
feat(rediseño): model.js con filas, grupos, temporadas y torneos (B1, tarea 3)

rowToMatch lee por posición las filas de 5, 6, 8 y 9 columnas, e
inlineRowToMatch las de 7 de la fase de grupos de la Maspalomas. buildGroup
toma las jornadas de HISTORY en la temporada actual (nunca de las matches en
línea), de jornadas en las pasadas y en los cuadros, y de la lista en línea
en la fase de grupos. groupKind une isCupGroup con lo que solo miraba
isKnockoutGroup y aplica la regla del embudo. matchState da jugado,
pendiente, sin resultado o sin fecha con la fecha de la fila y la
temporada del grupo: julio sin año es del año final, al contrario que en
fixtureISO, y si la clave de ronda trae la fecha completa, su año manda
sobre una fila DD/MM del mismo día. Pruebas sobre las fixtures congeladas.

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01Sg56KK3oZgo8Ye7Snj6wG9
EOF
git show --stat --oneline HEAD | tail -1
```
Esperado: `2 files changed`, con `src/model.js` y `scripts/tests/test_rediseno_model_temporadas.mjs`.

---

### Task 4: `model.js`, competición: `competitionKey` y `groupLabel` con tabla de equivalencias

**Contexto**
- **La base** tiene 191 grupos en 5 temporadas, con 29 fases distintas y 56 combinaciones de temporada, categoría y fase (la spec hablaba de «unas 60»). A ellas se suma la Maspalomas Cup, que no pasa por la base.
- **Los tres ejes** de §5.3:
  - `division`: `preferente`, `primera` o `unica`;
  - `phase`: `primera-fase`, `segunda-fase`, `segunda-a` a `segunda-e`, `fase-1`, `fase-2`, `oro`, `plata`, `bronce` o `null`;
  - `cup`: `campeones`, `insular`, `maspalomas` o `null`.
- **`key`**, la clave de `#/ligas?f=`:
  - une con guiones la isla (si no es Gran Canaria), la división (si no es `unica`), la fase y la copa (`copa-campeones`, `maspalomas`, `copa`, `copa-delegacion` o `copa-cabildo`);
  - si no queda nada, es la isla (`grancanaria`, `lanzarote` o `fuerteventura`);
  - coincide con los ejemplos de la spec: `copa-campeones` y `maspalomas`;
  - es única en cada temporada y categoría, que van en `s` y `c`.
- **`label` de `competitionKey`** es el nombre de la competición, sin categoría ni grupo: «Segunda Fase A», «Gran Canaria», «Preferente de Lanzarote». Es lo que necesita la lista de Ligas de Explorar (§4.7).
  - La etiqueta de grupo es `groupLabel(group)`, que va en `Group.label`.
  - **Decisión:** la spec (§5.3) llama `label` de `competitionKey` a la etiqueta de grupo. Como el contrato del plan tiene las dos funciones, cada una da una.
- **La misma fase no significa lo mismo en todas las temporadas.** Por eso la tabla es de temporada × fase. «Primera Fase GC» es:
  - en benjamín 2021-22 y 2022-23, la división Primera: 26-30 jornadas bajo «Preferente GC» (`fetch_fiflp_islas.py:54` la llama «Benjamin GC Primera»);
  - en benjamín desde 2023-24, la primera fase: 5-11 jornadas antes de la Segunda Fase;
  - en prebenjamín (2021-22 a 2023-24), la liga de Gran Canaria, la misma que desde 2024-25 se llama «Gran Canaria». Por eso comparten la clave `grancanaria`.
- **Casos que no salen solo de la fase:**
  - «Copa Campeones Benjamin A…E» (2024-25) es una sola competición, `copa-campeones`, igual que «Copa de Campeones» con sus fases A…C en 2025-26. Los cinco grupos de 2024-25 se llaman «Grupo 1», así que la letra pasa a la etiqueta: «Fase A».
  - En el benjamín de Fuerteventura 2025-26, la fase es «Fuerteventura» y el nivel va en el nombre del grupo: «Liga Oro», «Liga Plata» o «Liga Bronce». Ahí `phase` vale `oro`, `plata` o `bronce`.
  - «Copa Delegación Fuerteventura» y «Copa Fuerteventura» coinciden en temporada (2022-23), isla y ejes. La clave las separa: `fuerteventura-copa-delegacion` y `fuerteventura-copa`.
- **Etiqueta de grupo:** «Categoría, competición, grupo».
  - Se añade « de <isla>» si la isla no es Gran Canaria o si no hay competición que nombrar, y nunca si el texto ya la nombra.
  - Da los dos ejemplos de la spec: «Prebenjamín, Grupo 2 de Gran Canaria» (PG2) y «Benjamín, Segunda Fase A, Grupo 2» (A2).
  - Es única dentro de cada temporada en los 218 grupos reales, Maspalomas incluida.
- **Fase desconocida**, por ejemplo una nueva en 2026/27:
  - sale sin clasificar (`division: null`), con la clave `otra-<fase>` y la fase de la fuente como nombre;
  - la interfaz no se rompe, y el test de `phases.json` impide que una fase existente quede así.
- **Categoría.** `competitionKey` usa `raw.cat` y, si falta, la saca de `fullName`, porque los grupos crudos de `data-*.js` no la llevan. Comprobado en los 191 grupos.
- **`phases.json` trae el nombre de cada grupo** (Tarea 1). Hace falta para dos cosas:
  - clasificar FO, FP y FB (benjamín de Fuerteventura 2025-26), que tienen la fase «Fuerteventura» y el nivel en el nombre;
  - probar que la etiqueta de grupo es única en cada temporada.
- **Tabla de equivalencias resultante sobre la base real.** Tiene 58 filas: las 56 combinaciones, con FO, FP y FB separadas por su nombre. Sale de ejecutar la implementación:

| Temporada | Cat. | Fase de la base (isla) | Grupos | `key` | division · phase · cup | `label` de la competición | Ejemplo de `groupLabel` |
|---|---|---|---|---|---|---|---|
| 21-22 | benj. | Preferente GC (GC) | BPGC1, BPGC2 | `preferente` | preferente · — · — | Preferente | Benjamín, Preferente, Grupo 1 (BPGC1) |
| 21-22 | benj. | Primera Fase GC (GC) | GC1…GC5 (5) | `primera` | primera · — · — | Primera | Benjamín, Primera, Grupo 1 (GC1) |
| 21-22 | benj. | Preferente Lanzarote (LZ) | LZP1 | `lanzarote-preferente` | preferente · — · — | Preferente de Lanzarote | Benjamín, Preferente, Grupo 1 de Lanzarote (LZP1) |
| 21-22 | preb. | Primera Fase GC (GC) | PGC1, PGC2 | `grancanaria` | unica · — · — | Gran Canaria | Prebenjamín, Grupo 1 de Gran Canaria (PGC1) |
| 22-23 | benj. | Copa Delegación Fuerteventura (FV) | CFVD1 | `fuerteventura-copa-delegacion` | unica · — · insular | Copa Delegación de Fuerteventura | Benjamín, Copa Delegación, Grupo 1 de Fuerteventura (CFVD1) |
| 22-23 | benj. | Copa Fuerteventura (FV) | CFV1, CFV2, CFV3 | `fuerteventura-copa` | unica · — · insular | Copa Fuerteventura | Benjamín, Copa Fuerteventura, Grupo 1 (CFV1) |
| 22-23 | benj. | Fuerteventura (FV) | FV11, FV12, FV13 | `fuerteventura` | unica · — · — | Fuerteventura | Benjamín, Grupo 1 de Fuerteventura (FV11) |
| 22-23 | benj. | Preferente GC (GC) | BPGC1, BPGC2 | `preferente` | preferente · — · — | Preferente | Benjamín, Preferente, Grupo 1 (BPGC1) |
| 22-23 | benj. | Primera Fase GC (GC) | GC1…GC6 (6) | `primera` | primera · — · — | Primera | Benjamín, Primera, Grupo 1 (GC1) |
| 22-23 | benj. | Preferente Lanzarote (LZ) | LZP1 | `lanzarote-preferente` | preferente · — · — | Preferente de Lanzarote | Benjamín, Preferente, Grupo 1 de Lanzarote (LZP1) |
| 22-23 | benj. | Primera Lanzarote (LZ) | LZ11, LZ12 | `lanzarote-primera` | primera · — · — | Primera de Lanzarote | Benjamín, Primera, Grupo 1 de Lanzarote (LZ11) |
| 22-23 | preb. | Primera Fase GC (GC) | PGC1, PGC2 | `grancanaria` | unica · — · — | Gran Canaria | Prebenjamín, Grupo 1 de Gran Canaria (PGC1) |
| 23-24 | benj. | Copa Fuerteventura (FV) | CFV1, CFV2 | `fuerteventura-copa` | unica · — · insular | Copa Fuerteventura | Benjamín, Copa Fuerteventura, Grupo 1 (CFV1) |
| 23-24 | benj. | Fase 1 Fuerteventura (FV) | FV11, FV12, FV13 | `fuerteventura-fase-1` | unica · fase-1 · — | Fase 1 de Fuerteventura | Benjamín, Fase 1, Grupo 1 de Fuerteventura (FV11) |
| 23-24 | benj. | Fase 2 Fuerteventura (FV) | FV21 | `fuerteventura-fase-2` | unica · fase-2 · — | Fase 2 de Fuerteventura | Benjamín, Fase 2, Grupo 1 de Fuerteventura (FV21) |
| 23-24 | benj. | Copa de Campeones (GC) | BC1, BC2, BC3 | `copa-campeones` | unica · — · campeones | Copa de Campeones | Benjamín, Copa de Campeones, Grupo 1 (BC1) |
| 23-24 | benj. | Primera Fase GC (GC) | GC1…GC12 (12) | `primera-fase` | unica · primera-fase · — | Primera Fase | Benjamín, Primera Fase, Grupo 1 (GC1) |
| 23-24 | benj. | Segunda Fase GC (GC) | SF1…SF14 (14) | `segunda-fase` | unica · segunda-fase · — | Segunda Fase | Benjamín, Segunda Fase, Grupo 1 (SF1) |
| 23-24 | benj. | Copa Cabildo Preferente Lanzarote (LZ) | CLZP1, CLZP2 | `lanzarote-preferente-copa-cabildo` | preferente · — · insular | Copa Cabildo Preferente de Lanzarote | Benjamín, Copa Cabildo Preferente, Grupo 1 de Lanzarote (CLZP1) |
| 23-24 | benj. | Copa Cabildo Primera Lanzarote (LZ) | CLZ11, CLZ12 | `lanzarote-primera-copa-cabildo` | primera · — · insular | Copa Cabildo Primera de Lanzarote | Benjamín, Copa Cabildo Primera, Grupo 1 de Lanzarote (CLZ11) |
| 23-24 | benj. | Preferente Lanzarote (LZ) | LZP1 | `lanzarote-preferente` | preferente · — · — | Preferente de Lanzarote | Benjamín, Preferente, Grupo 1 de Lanzarote (LZP1) |
| 23-24 | benj. | Primera Lanzarote (LZ) | LZ11, LZ12 | `lanzarote-primera` | primera · — · — | Primera de Lanzarote | Benjamín, Primera, Grupo 1 de Lanzarote (LZ11) |
| 23-24 | preb. | Fuerteventura (FV) | PFV1, PFV2, PFV3 | `fuerteventura` | unica · — · — | Fuerteventura | Prebenjamín, Grupo 1 de Fuerteventura (PFV1) |
| 23-24 | preb. | Copa de Campeones (GC) | PCC1 | `copa-campeones` | unica · — · campeones | Copa de Campeones | Prebenjamín, Copa de Campeones, Grupo 1 (PCC1) |
| 23-24 | preb. | Primera Fase GC (GC) | PGC1…PGC4 (4) | `grancanaria` | unica · — · — | Gran Canaria | Prebenjamín, Grupo 1 de Gran Canaria (PGC1) |
| 24-25 | benj. | Fase 1 Fuerteventura (FV) | FV11, FV12, FV13 | `fuerteventura-fase-1` | unica · fase-1 · — | Fase 1 de Fuerteventura | Benjamín, Fase 1, Grupo 1 de Fuerteventura (FV11) |
| 24-25 | benj. | Fase 2 Fuerteventura (FV) | FV21, FV22, FV23 | `fuerteventura-fase-2` | unica · fase-2 · — | Fase 2 de Fuerteventura | Benjamín, Fase 2, Grupo 1 de Fuerteventura (FV21) |
| 24-25 | benj. | Copa Campeones Benjamin A (GC) | BCA1 | `copa-campeones` | unica · — · campeones | Copa de Campeones | Benjamín, Copa de Campeones, Fase A (BCA1) |
| 24-25 | benj. | Copa Campeones Benjamin B (GC) | BCB1 | `copa-campeones` | unica · — · campeones | Copa de Campeones | Benjamín, Copa de Campeones, Fase B (BCB1) |
| 24-25 | benj. | Copa Campeones Benjamin C (GC) | BCC1 | `copa-campeones` | unica · — · campeones | Copa de Campeones | Benjamín, Copa de Campeones, Fase C (BCC1) |
| 24-25 | benj. | Copa Campeones Benjamin D (GC) | BCD1 | `copa-campeones` | unica · — · campeones | Copa de Campeones | Benjamín, Copa de Campeones, Fase D (BCD1) |
| 24-25 | benj. | Copa Campeones Benjamin E (GC) | BCE1 | `copa-campeones` | unica · — · campeones | Copa de Campeones | Benjamín, Copa de Campeones, Fase E (BCE1) |
| 24-25 | benj. | Primera Fase GC (GC) | P1…P14 (14) | `primera-fase` | unica · primera-fase · — | Primera Fase | Benjamín, Primera Fase, Grupo 1 (P1) |
| 24-25 | benj. | Segunda Fase A GC (GC) | A1, A2, A3 | `segunda-a` | unica · segunda-a · — | Segunda Fase A | Benjamín, Segunda Fase A, Grupo 1 (A1) |
| 24-25 | benj. | Segunda Fase B GC (GC) | B1, B2, B3 | `segunda-b` | unica · segunda-b · — | Segunda Fase B | Benjamín, Segunda Fase B, Grupo 1 (B1) |
| 24-25 | benj. | Segunda Fase C GC (GC) | C1, C2, C3 | `segunda-c` | unica · segunda-c · — | Segunda Fase C | Benjamín, Segunda Fase C, Grupo 1 (C1) |
| 24-25 | benj. | Segunda Fase D GC (GC) | D1, D2, D3 | `segunda-d` | unica · segunda-d · — | Segunda Fase D | Benjamín, Segunda Fase D, Grupo 1 (D1) |
| 24-25 | benj. | Segunda Fase E GC (GC) | E1, E2, E3 | `segunda-e` | unica · segunda-e · — | Segunda Fase E | Benjamín, Segunda Fase E, Grupo 1 (E1) |
| 24-25 | benj. | Preferente Lanzarote (LZ) | LZP1 | `lanzarote-preferente` | preferente · — · — | Preferente de Lanzarote | Benjamín, Preferente, Grupo 1 de Lanzarote (LZP1) |
| 24-25 | benj. | Primera Lanzarote (LZ) | LZ11, LZ12 | `lanzarote-primera` | primera · — · — | Primera de Lanzarote | Benjamín, Primera, Grupo 1 de Lanzarote (LZ11) |
| 24-25 | preb. | Fuerteventura (FV) | PFV1, PFV2, PFV3 | `fuerteventura` | unica · — · — | Fuerteventura | Prebenjamín, Grupo 1 de Fuerteventura (PFV1) |
| 24-25 | preb. | Copa de Campeones (GC) | PCC1 | `copa-campeones` | unica · — · campeones | Copa de Campeones | Prebenjamín, Copa de Campeones, Grupo 1 (PCC1) |
| 24-25 | preb. | Gran Canaria (GC) | PGC1…PGC4 (4) | `grancanaria` | unica · — · — | Gran Canaria | Prebenjamín, Grupo 1 de Gran Canaria (PGC1) |
| 24-25 | preb. | Lanzarote (LZ) | PLZ1, PLZ2 | `lanzarote` | unica · — · — | Lanzarote | Prebenjamín, Grupo 1 de Lanzarote (PLZ1) |
| 25-26 | benj. | Fuerteventura (FV) | FB | `fuerteventura-bronce` | unica · bronce · — | Liga Bronce de Fuerteventura | Benjamín, Liga Bronce de Fuerteventura (FB) |
| 25-26 | benj. | Fuerteventura (FV) | FO | `fuerteventura-oro` | unica · oro · — | Liga Oro de Fuerteventura | Benjamín, Liga Oro de Fuerteventura (FO) |
| 25-26 | benj. | Fuerteventura (FV) | FP | `fuerteventura-plata` | unica · plata · — | Liga Plata de Fuerteventura | Benjamín, Liga Plata de Fuerteventura (FP) |
| 25-26 | benj. | Fuerteventura Fase 1 (FV) | FV11…FV14 (4) | `fuerteventura-fase-1` | unica · fase-1 · — | Fase 1 de Fuerteventura | Benjamín, Fase 1, Grupo 1 de Fuerteventura (FV11) |
| 25-26 | benj. | Copa de Campeones (GC) | BCA1, BCB1, BCC1 | `copa-campeones` | unica · — · campeones | Copa de Campeones | Benjamín, Copa de Campeones, Fase A (BCA1) |
| 25-26 | benj. | Primera Fase GC (GC) | FF1…FF23 (23) | `primera-fase` | unica · primera-fase · — | Primera Fase | Benjamín, Primera Fase, Grupo 1 (FF1) |
| 25-26 | benj. | Segunda Fase A (GC) | A1…A4 (4) | `segunda-a` | unica · segunda-a · — | Segunda Fase A | Benjamín, Segunda Fase A, Grupo 1 (A1) |
| 25-26 | benj. | Segunda Fase B (GC) | B1…B4 (4) | `segunda-b` | unica · segunda-b · — | Segunda Fase B | Benjamín, Segunda Fase B, Grupo 1 (B1) |
| 25-26 | benj. | Segunda Fase C (GC) | C1…C4 (4) | `segunda-c` | unica · segunda-c · — | Segunda Fase C | Benjamín, Segunda Fase C, Grupo 1 (C1) |
| 25-26 | benj. | Lanzarote (LZ) | LZ1…LZ4 (4) | `lanzarote` | unica · — · — | Lanzarote | Benjamín, Grupo 1 de Lanzarote (LZ1) |
| 25-26 | preb. | Fuerteventura (FV) | PFV1, PFV2, PFV3 | `fuerteventura` | unica · — · — | Fuerteventura | Prebenjamín, Grupo 1 de Fuerteventura (PFV1) |
| 25-26 | preb. | Copa de Campeones (GC) | PCC1 | `copa-campeones` | unica · — · campeones | Copa de Campeones | Prebenjamín, Copa de Campeones, Eliminatorias (PCC1) |
| 25-26 | preb. | Gran Canaria (GC) | PG1, PG2, PG3 | `grancanaria` | unica · — · — | Gran Canaria | Prebenjamín, Grupo 1 de Gran Canaria (PG1) |
| 25-26 | preb. | Lanzarote (LZ) | PLZ1, PLZ2 | `lanzarote` | unica · — · — | Lanzarote | Prebenjamín, Grupo 1 de Lanzarote (PLZ1) |
| 25-26 | benj. | Maspalomas Cup (GC), fuera de la base | MCB1…MCB17 (17), MCBK1, MCBK2 | `maspalomas` | unica · — · maspalomas | Maspalomas Cup 2026 | Benjamín, Maspalomas Cup 2026, Grupo A (MCB1); Benjamín, Maspalomas Cup 2026, Copa Plata (MCBK1) |
| 25-26 | preb. | Maspalomas Cup (GC), fuera de la base | MCP1…MCP6 (6), MCPK1, MCPK2 | `maspalomas` | unica · — · maspalomas | Maspalomas Cup 2026 | Prebenjamín, Maspalomas Cup 2026, Grupo A (MCP1) |

**Files:**
- Modify: `src/model.js`: dos líneas de `buildGroup` y un bloque nuevo al final.
- Create: `scripts/tests/test_rediseno_model_competicion.mjs`

**Interfaces:**
- Consumes:
  - `fixture('phases')`, `fixture('current-2025-2026')`, `fixture('historical-2024-2025')` y `fixture('cups-2025-2026')`;
  - `buildSeason` y `buildCups` (Tarea 3).
- Produces:
  - `competitionKey(raw, season)` → `{cat, island, division, phase, cup, key, label}`;
  - `groupLabel(group)` → `string`. Recibe un `Group` o un grupo crudo con `{season, cat, phase, island, name}`;
  - `buildGroup` rellena `Group.compKey` (`competitionKey(…).key`) y `Group.label` (`groupLabel`).

- [ ] **Step 1: Write the failing test**

Crear `scripts/tests/test_rediseno_model_competicion.mjs`:

```js
/**
 * Rediseño «Acta», Tarea 4: competitionKey y groupLabel (spec §5.3, §4.7).
 * Run: node --test scripts/tests/test_rediseno_model_competicion.mjs
 *
 * phases.json trae todas las fases reales de la base (2021-22 a 2025-26).
 * Solo fixtures congeladas; nunca los data-*.js ni src/config.js vivos.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fixture } from './fixtures/rediseno/load.mjs';
import { competitionKey, groupLabel, buildSeason, buildCups } from '../../src/model.js';

const KEY_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
let phasesCache = null;
const phases = () => (phasesCache ??= fixture('phases'));
const catOf = e => String(e.cat).toLowerCase();
const rawOf = e => ({ id: e.code, phase: e.phase, island: e.island, cat: catOf(e), name: e.name });

/* Grupo real de la base, comprobado contra phases.json (con su nombre)
 * antes de usarlo. */
function real(season, cat, id, phase, island, name) {
  const found = phases().some(e => e.season === season && catOf(e) === cat && e.code === id
    && e.phase === phase && e.island === island && e.name === name);
  assert.ok(found, `${season} ${cat} ${id} «${phase}» no está en phases.json`);
  return { season, cat, id, phase, island, name };
}

// ── Tabla de equivalencias sobre todas las fases reales ────────────────────

test('phases.json: ninguna fase existente queda sin clasificar', () => {
  const all = phases();
  assert.deepEqual([...new Set(all.map(e => e.season))].sort(),
    ['2021-2022', '2022-2023', '2023-2024', '2024-2025', '2025-2026']);
  assert.ok(new Set(all.map(e => `${e.season}|${catOf(e)}|${e.phase}`)).size >= 56, 'phases.json debe traer todas las fases');
  const sinClasificar = all.filter(e => competitionKey(rawOf(e), e.season).division === null)
    .map(e => `${e.season} ${e.cat} ${e.code} «${e.phase}»`);
  assert.deepEqual(sinClasificar, []);
  for (const e of all) {
    const ck = competitionKey(rawOf(e), e.season);
    assert.equal(ck.cat, catOf(e), e.code);
    assert.equal(ck.island, e.island, e.code);
    assert.ok(['preferente', 'primera', 'unica'].includes(ck.division), `${e.code}: ${ck.division}`);
    assert.ok([null, 'primera-fase', 'segunda-fase', 'segunda-a', 'segunda-b', 'segunda-c', 'segunda-d', 'segunda-e',
      'fase-1', 'fase-2', 'oro', 'plata', 'bronce'].includes(ck.phase), `${e.code}: ${ck.phase}`);
    assert.ok([null, 'campeones', 'insular', 'maspalomas'].includes(ck.cup), `${e.code}: ${ck.cup}`);
    assert.match(ck.key, KEY_RE, e.code);
    assert.ok(ck.label, e.code);
  }
});

test('phases.json: cada fase es una competición; solo se funden las Copa Campeones Benjamin A…E de 2024-25', () => {
  const byKey = new Map();
  for (const e of phases()) {
    // Sin el nombre del grupo: la clave depende solo de la tabla de fases.
    const { key } = competitionKey({ id: e.code, phase: e.phase, island: e.island, cat: catOf(e) }, e.season);
    const k = `${e.season}|${catOf(e)}|${key}`;
    if (!byKey.has(k)) byKey.set(k, new Set());
    byKey.get(k).add(e.phase);
  }
  const fundidas = [...byKey].filter(([, ps]) => ps.size > 1).map(([k, ps]) => [k, [...ps].sort()]);
  assert.deepEqual(fundidas, [['2024-2025|benjamin|copa-campeones', [
    'Copa Campeones Benjamin A', 'Copa Campeones Benjamin B', 'Copa Campeones Benjamin C',
    'Copa Campeones Benjamin D', 'Copa Campeones Benjamin E']]]);
});

test('phases.json: etiqueta de grupo única en cada temporada', () => {
  const seen = new Map();
  for (const e of phases()) {
    assert.ok(typeof e.name === 'string' && e.name, `${e.season} ${e.code}: phases.json sin name`);
    const label = groupLabel({ ...rawOf(e), season: e.season });
    const k = `${e.season}|${label}`;
    assert.ok(!seen.has(k), `${k}: ${seen.get(k)} y ${e.code}`);
    seen.set(k, e.code);
  }
});

// ── Ejemplos fijados con grupos de las fixtures ────────────────────────────

test('PG2 2025-26 y A2 2025-26: los dos ejemplos de la spec', () => {
  const f = fixture('current-2025-2026');
  const pg2 = f.prebenjamin.find(g => g.id === 'PG2');
  const a2 = f.benjamin.find(g => g.id === 'A2');
  assert.equal(groupLabel({ ...pg2, cat: 'prebenjamin', season: f.season }), 'Prebenjamín, Grupo 2 de Gran Canaria');
  assert.equal(groupLabel({ ...a2, cat: 'benjamin', season: f.season }), 'Benjamín, Segunda Fase A, Grupo 2');
  assert.deepEqual(competitionKey({ ...pg2, cat: 'prebenjamin' }, f.season), {
    cat: 'prebenjamin', island: 'grancanaria', division: 'unica', phase: null, cup: null,
    key: 'grancanaria', label: 'Gran Canaria',
  });
  assert.deepEqual(competitionKey({ ...a2, cat: 'benjamin' }, f.season), {
    cat: 'benjamin', island: 'grancanaria', division: 'unica', phase: 'segunda-a', cup: null,
    key: 'segunda-a', label: 'Segunda Fase A',
  });
  // Sin cat explícita (grupo crudo de data-*.js), la categoría sale de fullName
  assert.equal(competitionKey(pg2, f.season).cat, 'prebenjamin');
  assert.equal(competitionKey(a2, f.season).cat, 'benjamin');
});

test('buildSeason y buildCups rellenan compKey y label de cada grupo', () => {
  const f = fixture('current-2025-2026');
  const s = buildSeason({ name: f.season, current: true, benjamin: f.benjamin, prebenjamin: f.prebenjamin, history: f.history });
  const byId = groups => Object.fromEntries(groups.map(g => [g.id, [g.compKey, g.label]]));
  assert.deepEqual(byId(s.groups), {
    A1: ['segunda-a', 'Benjamín, Segunda Fase A, Grupo 1'],
    A2: ['segunda-a', 'Benjamín, Segunda Fase A, Grupo 2'],
    B1: ['segunda-b', 'Benjamín, Segunda Fase B, Grupo 1'],
    B2: ['segunda-b', 'Benjamín, Segunda Fase B, Grupo 2'],
    FF5: ['primera-fase', 'Benjamín, Primera Fase, Grupo 5'],
    FF9: ['primera-fase', 'Benjamín, Primera Fase, Grupo 9'],
    FF13: ['primera-fase', 'Benjamín, Primera Fase, Grupo 13'],
    FF15: ['primera-fase', 'Benjamín, Primera Fase, Grupo 15'],
    PG2: ['grancanaria', 'Prebenjamín, Grupo 2 de Gran Canaria'],
    PG3: ['grancanaria', 'Prebenjamín, Grupo 3 de Gran Canaria'],
    PFV2: ['fuerteventura', 'Prebenjamín, Grupo 2 de Fuerteventura'],
  });
  const h = fixture('historical-2024-2025');
  const hs = buildSeason({ name: h.season, current: false, benjamin: h.benjamin, prebenjamin: h.prebenjamin });
  assert.deepEqual(byId(hs.groups), {
    P1: ['primera-fase', 'Benjamín, Primera Fase, Grupo 1'],
    PGC2: ['grancanaria', 'Prebenjamín, Grupo 2 de Gran Canaria'],
  });
  const c = fixture('cups-2025-2026');
  const cups = buildCups({ season: '2025-2026', benjamin: c.benjamin, prebenjamin: c.prebenjamin });
  assert.deepEqual(byId(cups.groups), {
    MCB16: ['maspalomas', 'Benjamín, Maspalomas Cup 2026, Grupo P'],
    MCBK2: ['maspalomas', 'Benjamín, Maspalomas Cup 2026, Copa Oro'],
    MCP3: ['maspalomas', 'Prebenjamín, Maspalomas Cup 2026, Grupo C'],
    MCPK1: ['maspalomas', 'Prebenjamín, Maspalomas Cup 2026, Copa Plata'],
  });
  assert.deepEqual(competitionKey(c.prebenjamin.find(g => g.id === 'MCP3'), '2025-2026'), {
    cat: 'prebenjamin', island: 'grancanaria', division: 'unica', phase: null, cup: 'maspalomas',
    key: 'maspalomas', label: 'Maspalomas Cup 2026',
  });
});

// ── Ejemplos fijados con grupos reales de phases.json ──────────────────────

const label = g => groupLabel(g);
const ck = g => competitionKey(g, g.season);

test('Lanzarote: Preferente, Primera, liga de la isla y Copa Cabildo', () => {
  const lzp1 = real('2024-2025', 'benjamin', 'LZP1', 'Preferente Lanzarote', 'lanzarote', 'Grupo 1');
  assert.equal(label(lzp1), 'Benjamín, Preferente, Grupo 1 de Lanzarote');
  assert.deepEqual(ck(lzp1), { cat: 'benjamin', island: 'lanzarote', division: 'preferente', phase: null, cup: null,
    key: 'lanzarote-preferente', label: 'Preferente de Lanzarote' });
  const lz12 = real('2024-2025', 'benjamin', 'LZ12', 'Primera Lanzarote', 'lanzarote', 'Grupo 2');
  assert.equal(label(lz12), 'Benjamín, Primera, Grupo 2 de Lanzarote');
  assert.equal(ck(lz12).key, 'lanzarote-primera');
  const lz1 = real('2025-2026', 'benjamin', 'LZ1', 'Lanzarote', 'lanzarote', 'Grupo 1');
  assert.equal(label(lz1), 'Benjamín, Grupo 1 de Lanzarote');
  assert.equal(ck(lz1).key, 'lanzarote');
  const plz2 = real('2025-2026', 'prebenjamin', 'PLZ2', 'Lanzarote', 'lanzarote', 'Grupo 2');
  assert.equal(label(plz2), 'Prebenjamín, Grupo 2 de Lanzarote');
  const clzp1 = real('2023-2024', 'benjamin', 'CLZP1', 'Copa Cabildo Preferente Lanzarote', 'lanzarote', 'Grupo 1');
  assert.equal(label(clzp1), 'Benjamín, Copa Cabildo Preferente, Grupo 1 de Lanzarote');
  assert.deepEqual(ck(clzp1), { cat: 'benjamin', island: 'lanzarote', division: 'preferente', phase: null, cup: 'insular',
    key: 'lanzarote-preferente-copa-cabildo', label: 'Copa Cabildo Preferente de Lanzarote' });
});

test('Fuerteventura: fases, ligas Oro/Plata/Bronce por nombre y copas insulares', () => {
  const fv11 = real('2025-2026', 'benjamin', 'FV11', 'Fuerteventura Fase 1', 'fuerteventura', 'Grupo 1');
  assert.equal(label(fv11), 'Benjamín, Fase 1, Grupo 1 de Fuerteventura');
  assert.deepEqual(ck(fv11), { cat: 'benjamin', island: 'fuerteventura', division: 'unica', phase: 'fase-1', cup: null,
    key: 'fuerteventura-fase-1', label: 'Fase 1 de Fuerteventura' });
  const fv21 = real('2024-2025', 'benjamin', 'FV21', 'Fase 2 Fuerteventura', 'fuerteventura', 'Grupo 1');
  assert.equal(ck(fv21).phase, 'fase-2');
  const fo = real('2025-2026', 'benjamin', 'FO', 'Fuerteventura', 'fuerteventura', 'Liga Oro');
  assert.equal(label(fo), 'Benjamín, Liga Oro de Fuerteventura');
  assert.deepEqual(ck(fo), { cat: 'benjamin', island: 'fuerteventura', division: 'unica', phase: 'oro', cup: null,
    key: 'fuerteventura-oro', label: 'Liga Oro de Fuerteventura' });
  const fb = real('2025-2026', 'benjamin', 'FB', 'Fuerteventura', 'fuerteventura', 'Liga Bronce');
  assert.equal(ck(fb).key, 'fuerteventura-bronce');
  const cfv1 = real('2022-2023', 'benjamin', 'CFV1', 'Copa Fuerteventura', 'fuerteventura', 'Grupo 1');
  assert.equal(label(cfv1), 'Benjamín, Copa Fuerteventura, Grupo 1');
  assert.equal(ck(cfv1).key, 'fuerteventura-copa');
  const cfvd1 = real('2022-2023', 'benjamin', 'CFVD1', 'Copa Delegación Fuerteventura', 'fuerteventura', 'Grupo 1');
  assert.equal(label(cfvd1), 'Benjamín, Copa Delegación, Grupo 1 de Fuerteventura');
  assert.equal(ck(cfvd1).key, 'fuerteventura-copa-delegacion');
  const fv12 = real('2022-2023', 'benjamin', 'FV12', 'Fuerteventura', 'fuerteventura', 'Grupo 2');
  assert.equal(label(fv12), 'Benjamín, Grupo 2 de Fuerteventura');
  assert.equal(ck(fv12).key, 'fuerteventura');
});

test('Copa de Campeones: una competición en todas las temporadas, con sus fases A…E', () => {
  const a2526 = real('2025-2026', 'benjamin', 'BCA1', 'Copa de Campeones', 'grancanaria', 'Fase A');
  const a2425 = real('2024-2025', 'benjamin', 'BCA1', 'Copa Campeones Benjamin A', 'grancanaria', 'Grupo 1');
  const e2425 = real('2024-2025', 'benjamin', 'BCE1', 'Copa Campeones Benjamin E', 'grancanaria', 'Grupo 1');
  assert.equal(label(a2526), 'Benjamín, Copa de Campeones, Fase A');
  assert.equal(label(a2425), 'Benjamín, Copa de Campeones, Fase A');
  assert.equal(label(e2425), 'Benjamín, Copa de Campeones, Fase E');
  for (const g of [a2526, a2425, e2425]) {
    assert.deepEqual(ck(g), { cat: 'benjamin', island: 'grancanaria', division: 'unica', phase: null, cup: 'campeones',
      key: 'copa-campeones', label: 'Copa de Campeones' });
  }
  const pcc1 = real('2025-2026', 'prebenjamin', 'PCC1', 'Copa de Campeones', 'grancanaria', 'Eliminatorias');
  assert.equal(label(pcc1), 'Prebenjamín, Copa de Campeones, Eliminatorias');
  const bc2 = real('2023-2024', 'benjamin', 'BC2', 'Copa de Campeones', 'grancanaria', 'Grupo 2');
  assert.equal(label(bc2), 'Benjamín, Copa de Campeones, Grupo 2');
});

test('Preferente y Primera Fase GC: la misma fase significa cosas distintas según temporada y categoría', () => {
  const bpgc1 = real('2021-2022', 'benjamin', 'BPGC1', 'Preferente GC', 'grancanaria', 'Grupo 1');
  assert.equal(label(bpgc1), 'Benjamín, Preferente, Grupo 1');
  assert.deepEqual(ck(bpgc1), { cat: 'benjamin', island: 'grancanaria', division: 'preferente', phase: null, cup: null,
    key: 'preferente', label: 'Preferente' });
  // Benjamín 2021-22: «Primera Fase GC» es la división Primera, bajo Preferente GC
  const gc3 = real('2021-2022', 'benjamin', 'GC3', 'Primera Fase GC', 'grancanaria', 'Grupo 3');
  assert.equal(label(gc3), 'Benjamín, Primera, Grupo 3');
  assert.deepEqual(ck(gc3), { cat: 'benjamin', island: 'grancanaria', division: 'primera', phase: null, cup: null,
    key: 'primera', label: 'Primera' });
  // Benjamín desde 2023-24: la primera fase, antes de la Segunda Fase
  const p1 = real('2024-2025', 'benjamin', 'P1', 'Primera Fase GC', 'grancanaria', 'Grupo 1');
  assert.equal(label(p1), 'Benjamín, Primera Fase, Grupo 1');
  assert.equal(ck(p1).key, 'primera-fase');
  const sf14 = real('2023-2024', 'benjamin', 'SF14', 'Segunda Fase GC', 'grancanaria', 'Grupo 14');
  assert.equal(label(sf14), 'Benjamín, Segunda Fase, Grupo 14');
  assert.equal(ck(sf14).key, 'segunda-fase');
  // Prebenjamín: «Primera Fase GC» (hasta 2023-24) es la misma liga que «Gran Canaria»
  const pgc1 = real('2023-2024', 'prebenjamin', 'PGC1', 'Primera Fase GC', 'grancanaria', 'Grupo 1');
  assert.equal(label(pgc1), 'Prebenjamín, Grupo 1 de Gran Canaria');
  assert.equal(ck(pgc1).key, 'grancanaria');
});

test('Fase desconocida: sin clasificar (division null), pero con clave y etiqueta usables', () => {
  const nueva = { season: '2026-2027', cat: 'prebenjamin', id: 'TC1', phase: 'Torneo Cierre', island: 'grancanaria', name: 'Grupo 1' };
  assert.deepEqual(ck(nueva), { cat: 'prebenjamin', island: 'grancanaria', division: null, phase: null, cup: null,
    key: 'otra-torneo-cierre', label: 'Torneo Cierre' });
  assert.equal(label(nueva), 'Prebenjamín, Torneo Cierre, Grupo 1');
  assert.equal(ck({ ...nueva, island: 'lanzarote' }).key, 'lanzarote-otra-torneo-cierre');
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd /home/manolo/claude/futbol-base
node --test scripts/tests/test_rediseno_model_competicion.mjs 2>&1 | grep -E "does not provide|^# (tests|pass|fail)"
```
Esperado:
```text
# SyntaxError: The requested module '../../src/model.js' does not provide an export named 'competitionKey'
# tests 1
# pass 0
# fail 1
```

- [ ] **Step 3: Write minimal implementation**

1. En `src/model.js`, sustituir estas dos líneas del objeto `group` de `buildGroup`:

```js
    compKey: null,   // Tarea 4: competitionKey
    label: null,     // Tarea 4: groupLabel
```

por:

```js
    compKey: competitionKey({ ...raw, cat }, season).key,
    label: groupLabel({ ...raw, cat, season }),
```

2. Añadir al final de `src/model.js`, después de la llave que cierra `buildCups` y una línea en blanco:

```js
/* ── Competición y etiqueta de grupo (spec §5.3 y §4.7) ────────────────────
 *
 * competitionKey(raw, season) → { cat, island, division, phase, cup, key, label }
 *   division: 'preferente' | 'primera' | 'unica'
 *   phase:    'primera-fase' | 'segunda-fase' | 'segunda-a'…'segunda-e' |
 *             'fase-1' | 'fase-2' | 'oro' | 'plata' | 'bronce' | null
 *   cup:      'campeones' | 'insular' | 'maspalomas' | null
 *   key:      clave de la competición para #/ligas?f= (única en su temporada
 *             y categoría; sin categoría ni temporada, que van en c y s)
 *   label:    nombre legible de la competición, sin categoría ni grupo
 * Una fase que no está en la tabla sale sin clasificar (division null), con
 * una clave 'otra-…' y la fase de la fuente como nombre: una fase nueva no
 * rompe la interfaz, y el test de phases.json la detecta. */

const ISLAND_NAMES = { grancanaria: 'Gran Canaria', lanzarote: 'Lanzarote', fuerteventura: 'Fuerteventura' };
const CAT_NAMES = { benjamin: 'Benjamín', prebenjamin: 'Prebenjamín' };
const upperFirst = s => s.charAt(0).toUpperCase() + s.slice(1);
const foldText = s => String(s ?? '').normalize('NFD').replace(/\p{M}/gu, '')
  .toLowerCase().replace(/\s+/g, ' ').trim();
const slugOf = s => foldText(s).replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
const seasonEndYear = season => (/^\d{4}-(\d{4})$/.exec(String(season)) || [])[1] || '';

/* Tabla de equivalencias. Cubre las 29 fases reales de la base (56
 * combinaciones de temporada, categoría y fase entre 2021-22 y 2025-26, en
 * phases.json) y la Maspalomas Cup. Se lee sobre la fase sin tildes y en
 * minúsculas, y manda la primera regla que casa. Cada regla da los ejes que
 * no son los de por defecto (division 'unica', phase null, cup null) y:
 *   name:   nombre legible, sin categoría ni isla ('' = la liga de la isla);
 *   cupKey: parte de copa de la clave;
 *   group:  sustituye al nombre del grupo en la etiqueta ('' lo omite). */
const PHASE_TABLE = [
  // «Maspalomas Cup» (fase de grupos y cuadros) → «Maspalomas Cup 2026»
  [/maspalomas/, (m, raw, season) => ({
    cup: 'maspalomas', cupKey: 'maspalomas', name: `Maspalomas Cup ${seasonEndYear(season)}`.trim(),
  })],
  // «Copa de Campeones» (2023-24 y 2025-26) y «Copa Campeones Benjamin A…E»
  // (2024-25): una sola competición; en 2024-25 la letra es la fase del grupo.
  [/^copa (?:de )?campeones(?: (?:pre)?benjamin)?(?: ([a-e]))?$/, m => ({
    cup: 'campeones', cupKey: 'copa-campeones', name: 'Copa de Campeones',
    ...(m[1] ? { group: `Fase ${m[1].toUpperCase()}` } : {}),
  })],
  // «Copa Cabildo Preferente Lanzarote» y «Copa Cabildo Primera Lanzarote» (2023-24)
  [/^copa cabildo (preferente|primera)\b/, m => ({
    cup: 'insular', cupKey: 'copa-cabildo', division: m[1], name: `Copa Cabildo ${upperFirst(m[1])}`,
  })],
  // «Copa Delegación Fuerteventura» (2022-23)
  [/^copa delegacion\b/, () => ({ cup: 'insular', cupKey: 'copa-delegacion', name: 'Copa Delegación' })],
  // «Copa Fuerteventura» (2022-23 y 2023-24) y cualquier otra copa insular
  [/^copa\b/, (m, raw) => ({ cup: 'insular', cupKey: 'copa', name: String(raw.phase).trim() })],
  // «Segunda Fase A GC»…«E GC» (2024-25) y «Segunda Fase A»…«C» (2025-26)
  [/^segunda fase ([a-e])\b/, m => ({ phase: `segunda-${m[1]}`, name: `Segunda Fase ${m[1].toUpperCase()}` })],
  // «Segunda Fase GC» (2023-24: 14 grupos sin letra)
  [/^segunda fase\b/, () => ({ phase: 'segunda-fase', name: 'Segunda Fase' })],
  // «Primera Fase GC»: en prebenjamín (2021-22 a 2023-24) es la liga de Gran
  // Canaria, la misma que luego se llama «Gran Canaria»; en benjamín 2021-22 y
  // 2022-23 es la división Primera, bajo «Preferente GC»; desde 2023-24, la
  // primera fase, antes de la Segunda Fase.
  [/^primera fase\b/, (m, raw, season, cat) => {
    if (cat === 'prebenjamin') return {};
    return String(season) <= '2022-2023'
      ? { division: 'primera', name: 'Primera' }
      : { phase: 'primera-fase', name: 'Primera Fase' };
  }],
  // «Fase 1 Fuerteventura» (2023-24, 2024-25), «Fuerteventura Fase 1» (2025-26), «Fase 2 Fuerteventura»
  [/\bfase ([12])\b/, m => ({ phase: `fase-${m[1]}`, name: `Fase ${m[1]}` })],
  // «Preferente GC» (2021-22, 2022-23) y «Preferente Lanzarote»
  [/^preferente\b/, () => ({ division: 'preferente', name: 'Preferente' })],
  // «Primera Lanzarote»
  [/^primera\b/, () => ({ division: 'primera', name: 'Primera' })],
  // La liga de la isla: «Gran Canaria», «Lanzarote» y «Fuerteventura». En
  // benjamín de Fuerteventura 2025-26 el nivel va en el nombre del grupo
  // («Liga Oro», «Liga Plata», «Liga Bronce»), que pasa a ser la competición.
  [/^(?:gran canaria|lanzarote|fuerteventura)$/, (m, raw) => {
    const level = foldText(raw.name).match(/^liga (oro|plata|bronce)$/);
    return level ? { phase: level[1], name: `Liga ${upperFirst(level[1])}`, group: '' } : {};
  }],
];

/* La categoría del grupo: `cat` si viene, y si no, la de fullName (los
 * grupos crudos de data-*.js no la llevan). */
function catOfGroup(raw) {
  const c = foldText(raw && raw.cat);
  if (c === 'benjamin' || c === 'prebenjamin') return c;
  const full = foldText(raw && raw.fullName);
  if (full.includes('prebenjamin')) return 'prebenjamin';
  return full.includes('benjamin') ? 'benjamin' : null;
}

function classifyPhase(raw, season) {
  const cat = catOfGroup(raw);
  const island = (raw && raw.island) || null;
  const phase = foldText(raw && raw.phase);
  for (const [re, make] of PHASE_TABLE) {
    const m = phase.match(re);
    if (m) {
      return { cat, island, known: true, division: 'unica', phase: null, cup: null, name: '', ...make(m, raw, season, cat) };
    }
  }
  return { cat, island, known: false, division: null, phase: null, cup: null, name: String((raw && raw.phase) || '').trim() };
}

/* « de <isla>» si la isla no es Gran Canaria o si no hay otro calificativo, y
 * nunca si el texto ya la nombra («Copa Fuerteventura»). */
function islandSuffix(c, qualifier, textSoFar) {
  const isla = ISLAND_NAMES[c.island];
  if (!isla || textSoFar.includes(isla)) return '';
  return c.island !== 'grancanaria' || !qualifier ? ` de ${isla}` : '';
}

export function competitionKey(raw, season) {
  const c = classifyPhase(raw, season);
  const islandPart = c.island && c.island !== 'grancanaria' ? c.island : null;
  const parts = c.known
    ? [islandPart, c.division !== 'unica' ? c.division : null, c.phase, c.cupKey || null]
    : [islandPart, `otra-${slugOf(c.name) || 'fase'}`];
  const key = parts.filter(Boolean).join('-') || c.island || 'sin-isla';
  const label = c.name
    ? c.name + islandSuffix(c, c.name, c.name)
    : (ISLAND_NAMES[c.island] || c.island || '');
  return { cat: c.cat, island: c.island, division: c.division, phase: c.phase, cup: c.cup, key, label };
}

/* «Prebenjamín, Grupo 2 de Gran Canaria», «Benjamín, Segunda Fase A, Grupo 2».
 * Recibe un Group o un grupo crudo con {season, cat, phase, island, name}. */
export function groupLabel(group) {
  const c = classifyPhase(group, group.season);
  const groupPart = c.group !== undefined ? c.group : String(group.name ?? '').trim();
  const base = [CAT_NAMES[c.cat] || '', c.name, groupPart].filter(Boolean).join(', ');
  return base + islandSuffix(c, c.name, base);
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
cd /home/manolo/claude/futbol-base
node --test scripts/tests/test_rediseno_model_competicion.mjs 2>&1 | grep -E "^# (tests|pass|fail|skipped)"
```
Esperado:
```text
# tests 10
# pass 10
# fail 0
# skipped 0
```

- [ ] **Step 5: Suites completas (las que bloquean al bot)**

Las 22 pruebas de la Tarea 3 siguen en verde con `compKey` y `label` rellenos.

```bash
cd /home/manolo/claude/futbol-base
python3 -m pytest scripts/tests/ -q 2>&1 | tail -1
node --test scripts/tests/test_*.mjs 2>&1 | grep -E '^# (tests|pass|fail)'
```
Esperado:
- pytest: el mismo recuento que al terminar la tarea anterior, sin `failed` (esta tarea no añade pruebas de Python).
- node: el recuento anterior más 10, sin fallos (`# fail 0`).

- [ ] **Step 6: Commit**

```bash
cd /home/manolo/claude/futbol-base
git add src/model.js scripts/tests/test_rediseno_model_competicion.mjs
git commit -F - <<'EOF'
feat(rediseño): competitionKey y groupLabel con tabla de equivalencias (B1, tarea 4)

La tabla cubre las 29 fases reales de la base (56 combinaciones de
temporada, categoría y fase) y la Maspalomas Cup. Da los tres ejes
(división, fase y copa), la clave de #/ligas?f= y el nombre de la
competición. groupLabel da «Prebenjamín, Grupo 2 de Gran Canaria» y
«Benjamín, Segunda Fase A, Grupo 2». Una fase desconocida sale sin
clasificar (division null), y el test sobre phases.json impide que le pase
a una existente. buildGroup rellena compKey y label.

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01Sg56KK3oZgo8Ye7Snj6wG9
EOF
git show --stat --oneline HEAD | tail -1
```
Esperado: `2 files changed`, con `src/model.js` y `scripts/tests/test_rediseno_model_competicion.mjs`.

---

### Task 5: `model.js`, análisis: `retiredTeams`, `groupFinished`, `defaultRound`, `roundNotice`, `coverageNote`, `homeAwayTable`, `seasonSummary`, `lastResults`, `teamFixtures`, `headToHead` y `bestStreaks`

**Contexto** (medido el 23/09/2026 sobre las fixtures de la Tarea 1, congeladas desde `main` con la reparación A2 publicada):
- **PG2.** 15 filas. CD Batán va 0-0-28 (84 goles en contra: 28 incomparecencias por 3-0) y no aparece en ningún partido de `HISTORY`.
  - 30 jornadas de 6 partidos, salvo la 1 y la 16, que tienen 7 porque descansa Batán y juegan los 14 activos.
  - Jornada 30: 6 partidos. Se quedan sin partido RC Victoria (5.º) y Arucas B (12.º).
- **PG3.** 14 filas, todas con PJ 26, y 30 jornadas de 6 partidos, salvo la 4 y la 19, que tienen 7. Es una vuelta doble de 15 equipos: la fuente borró del todo al retirado, que no está ni en la clasificación ni en el calendario.
- **PFV2.** 7 filas. CD Teguinte está en las 14 jornadas sin fecha ni marcador (14 partidos `sin fecha`) y no tiene fila. Cada jornada tiene 3 partidos entre activos más el de Teguinte.
- **Las Mesas Hu. en PG2.** PJ 28 (12-1-15, 90-120). En el calendario tiene 26 partidos, todos con resultado:
  - en casa, 13 partidos: 5-1-7, 40-64;
  - fuera, 13 partidos: 5-0-8, 44-56;
  - por partido, 84/26 y 120/26, que es el «3,2 – 4,6» de la maqueta 4;
  - mejor resultado: 9-2 en casa de CD Calero (28/05, jornada 29); peor derrota: 1-11 en casa de Unión Viera (19/10, jornada 2); último: 2-7 contra AD Huracán (02/06, jornada 30).
  - La clasificación oficial es el calendario más 2 victorias contra Batán en G/E/P en los 14 equipos activos. En goles no cuadra para Santa Brígida ni Las Huesas (+16 en vez de +6), así que la prueba solo compara G/E/P.
- **Forma** (`lastResults`):
  - Las Mesas en PG2, del más antiguo al más reciente: E 1-1 Arucas B (en casa, 21/04), P 0-3 en Telde (30/04), P 1-8 RC Victoria (en casa, 05/05), G 9-2 en CD Calero (28/05) y P 2-7 AD Huracán (en casa, 02/06). Es el «Últimos cinco» de la maqueta 4.
  - En PG3, CD Tablero jugó la jornada 25 (5-1 a Estrella CF, 28/05) después de la 27: el orden por fecha y el de jornada difieren, y la prueba fija el de fecha. Pasa en 8 equipos de las fixtures, de PG3 y PFV2.
  - La fase de grupos de la Maspalomas (MCP3) no es liga: UD Las Mesas Huracán tiene 3 partidos jugados y `lastResults` no devuelve ninguno.
- **Rachas**, comprobadas aparte con SQLite sobre `futbolbase.db` (orden por fecha y jornada):
  - PG2: Unión Viera 18 victorias y 23 invicto, Acodetti 15/15, AD Huracán 7/12 y Las Mesas 2/2;
  - PG3: UD Vecindario 26/26; PFV2: CD 35600 12/12;
  - A2: Las Palmas 22/22; B2: Las Torres 22/22; A1: Arucas 14/19;
  - P1 2024-25: Moya 6/6 y Gáldar CF 5/6.
  - PGC2 2024-25, con los marcadores reparados por A2: Unión Viera 12/20 y AD Huracán 9/17.
- **Retirados en las 5 temporadas** (218 grupos, con esta implementación):
  - 2025-26: CD Batán (PG2), CD Teguinte (PFV2), y «COTILLO, C.D. EL» y 'CORRALEJO, C.D. "B"' (FV11).
  - Regla 2 en temporadas pasadas: P5, PFV3, PGC2 («Simusetti») y PGC3 de 2024-25; CLZ11 y CLZ12 de 2023-24.
  - Regla de pj = 0 en grupo terminado: BCB1 2024-25 («UD Valleseco»), CLZP1 2023-24 («ALTAVISTA C.F.»), GC5 2021-22 («Las Majoreras B») y PGC2 2021-22 («CD Calero» y «Universitario»). **Todos aparecen en el calendario** (de 1 a 26 partidos, ninguno con marcador): la condición «no aparece en el calendario» de §5.3 solo se aplica a la rama pj > 0; si no, esta rama no saltaría nunca.
- **Jornada por defecto.** Con los marcadores ocultados desde cada fecha, «la primera jornada en orden con algún partido pendiente» y «la jornada del primer partido pendiente por fecha» difieren en 326 de 1.650 situaciones reales de 2025-26. Por ejemplo, A2 el 10/01/2026: la lectura literal da la jornada 2, que tiene un aplazado el 04/02, y la del fin de semana es la 4. Se implementa la segunda (decisión 1 de la cabecera).
- **Rendimiento.** Todas las funciones, `teamFixtures` y `headToHead` incluidas, sobre los 218 grupos de las 5 temporadas más la Maspalomas: 13.471 llamadas en 706 ms, sin errores.
- **Cobertura a mitad de temporada.** Lo que la clasificación cuenta de más por un retirado que no está en el calendario (Batán en PG2) se mide con los partidos con resultado (`pj − withResult`), nunca con el calendario entero, que a mitad de temporada trae los futuros. Con el calendario entero, en la instantánea real del 02/05/2026 los 14 equipos de PG2 salían con `vsRetired: 0`, y Las Mesas, con «23 de 25 partidos con resultado», como si faltaran datos. Para no achacar a Batán un marcador que falta, son como mucho tantos partidos como veces se enfrenta a cualquier otro rival (dos en PG2).
- **Próximo partido y cara a cara** como funciones puras: `teamFixtures(team, group, todayISO)` da el próximo partido de §4.2 (el primer `pendiente` por fecha, sin los partidos contra retirados), el último jugado y cuántos quedan; `homeState` (Tarea 9) lo usa. `headToHead(group, a, b)` da el cara a cara de §4.5 dentro del grupo: el de PG2 nunca incluye los partidos de A2 (caso 7 de §11).
- **Ayudante `simulate.mjs`.** Esta tarea lo crea con `currentAt(todayISO)`: la temporada congelada tal como estaba ese día, con los partidos de ese día en adelante sin marcador. El mismo día un partido todavía es `pendiente`, como en `matchState`. La Tarea 8 le añade `nextSeasonRaw` y `teamNames`, y las Tareas 5, 8 y 9 lo importan.

**Files:**
- Modify: `src/model.js`: se añade al final el bloque del paso 3 y dos líneas en `buildGroup` (Tarea 3), justo antes de su `return group;`.
- Create: `scripts/tests/fixtures/rediseno/simulate.mjs` (ayudante de pruebas; la Tarea 8 lo amplía).
- Create: `scripts/tests/test_rediseno_model_analisis.mjs`.

**Interfaces:**
- Consumes:
  - de la Tarea 3: `buildGroup`, `buildSeason`, `buildCups` y `matchState(match, todayISO)`, con `Group`, `Round`, `Match` y `Row` del contrato. En concreto:
    - `Group.rounds` en orden de jornada, `Round.n` y `Round.matches`;
    - `Match.dateISO`, `home`, `away`, `hs` y `as`, con `null` para lo que falta;
    - `Group.standings` como `Row`, `Group.cat`, `Group.kind` y `Group.season`.
  - de la Tarea 1: `fixture('current-2025-2026')` (grupos A1, A2, B1, B2, FF5, FF9, FF13, FF15, PG2, PG3 y PFV2, con `history`), `fixture('historical-2024-2025')` (P1 y PGC2) y `fixture('cups-2025-2026')` (MCP3).
- Produces, en `scripts/tests/fixtures/rediseno/simulate.mjs`: `currentAt(todayISO)` → la fixture `current-2025-2026` (copia) con los marcadores de los partidos de `todayISO` en adelante a `null`; la clasificación no cambia.
- Produces, en `src/model.js`:
  - `retiredTeams(group)` → `Set<string>`. Orden: primero los de la clasificación, en su orden; después los del calendario, por orden de aparición. Además, `buildGroup` rellena `Row.retired`.
  - `groupFinished(group, todayISO, portalSeason)` → `boolean`.
  - `defaultRound(group, todayISO)` → el mismo objeto `Round` de `group.rounds`, o `null` si no hay jornadas.
  - `roundNotice(group, round)` → `null | {kind: 'sin-partido' | 'faltan', teams, retired, missing}`:
    - `teams`: activos sin partido, en el orden de la clasificación;
    - `retired`: todos los retirados del grupo;
    - `missing`: 0 en `sin-partido`.
  - `coverageNote(team, group)` → `null | {played, calendar, vsRetired, retired, withResult}`:
    - `played`: PJ oficial;
    - `calendar`: partidos del equipo en el calendario sin contar los de retirados, también los que aún no se han jugado;
    - `vsRetired`: partidos contra retirados: los del calendario más, si un retirado no está en él, `pj − withResult`, como mucho tantos como veces se enfrenta a cualquier otro rival;
    - `retired`: los retirados que explican esos partidos;
    - `withResult`: cuántos de `calendar` tienen marcador;
    - `null` si `withResult` explica todo el PJ.
  - `homeAwayTable(group, side)` → `Row[]`, con la forma de `Row`, `pos` recalculado de 1 a N, `retired` marcado y 3/1/0 puntos. Solo la condición pedida: `'casa'` o `'fuera'`.
  - `seasonSummary(team, group)` → objeto con estos campos:
    - `pos`, `of`, `pts`, `g`, `e`, `p`, `gf` y `gc`, de la clasificación: `null` si el equipo no tiene fila; `of` es el número de filas, retirados incluidos;
    - `perMatch`: `{gf, gc}`, medias sin redondear, o `null`;
    - `home` y `away`: `{pj, g, e, p, gf, gc, pts}`;
    - `best`, `worst` y `last`: la forma de `lastResults`, o `null`;
    - `coverage`: `coverageNote(team, group)`.
  - `lastResults(team, group, n = 5)` → `[{match, letter: 'G'|'E'|'P', gf, gc, rival, side: 'casa'|'fuera'}]`:
    - los `n` últimos partidos jugados del equipo en el grupo, sin los de retirados, del más antiguo al más reciente (por fecha; a igual fecha, por jornada);
    - `gf` y `gc` desde el punto de vista del equipo;
    - `[]` si el grupo no es de liga;
    - mismo criterio que `seasonSummary` (comparten el helper `teamResults`).
  - `teamFixtures(team, group, todayISO)` → `{next, last, played, undated, remaining}`, sin los partidos contra retirados: `next` es el primer `pendiente` por fecha (a igual fecha, por jornada) y `last` el último jugado, los dos `Match` o `null`; `played`, `undated` y `remaining` cuentan los jugados, los `sin fecha` y los que aún no tienen resultado.
  - `headToHead(group, a, b)` → `Match[]`: los partidos entre `a` y `b` en ese grupo, en los dos sentidos y por fecha.
  - `bestStreaks(season, cat)` → `{wins: [{team, n, groupId}], unbeaten: [...]}`: una entrada por equipo y grupo de liga con `n ≥ 1`, de mayor a menor; a igual `n`, por nombre (`localeCompare` `'es'`) y grupo.

- [ ] **Step 1: Write the failing test**

Crear `scripts/tests/fixtures/rediseno/simulate.mjs`, el ayudante de las pruebas que simulan otro día (no empieza por `test_`, así que el glob de las suites no lo ejecuta):

```js
// Temporadas simuladas a partir de las fixtures congeladas (nunca de los data-*.js vivos).
import { fixture } from './load.mjs';

// Fechas de HISTORY: 'AAAA-MM-DD', o 'DD-MM-AAAA' en Fuerteventura; '' si no hay.
const iso = date => {
  const m = String(date || '').match(/^(\d{2})-(\d{2})-(\d{4})$/);
  return m ? `${m[3]}-${m[2]}-${m[1]}` : String(date || '');
};

// La temporada 2025-2026 congelada tal como estaba el día `todayISO`: los partidos
// de ese día en adelante pierden el marcador y quedan pendientes (el mismo día, un
// partido todavía es `pendiente`, como en matchState). La clasificación no se toca.
export function currentAt(todayISO) {
  const raw = structuredClone(fixture('current-2025-2026'));
  for (const rounds of Object.values(raw.history)) {
    for (const rows of Object.values(rounds)) {
      for (const row of rows) if (iso(row[0]) >= todayISO) { row[3] = null; row[4] = null; }
    }
  }
  return raw;
}
```

Crear `scripts/tests/test_rediseno_model_analisis.mjs`:

```js
// Plan B1, Tarea 5: análisis de grupo en src/model.js (spec §4.2-§4.4, §4.7,
// §5.3, §7 y casos reales 1, 5 y 6 de §11). Solo fixtures congeladas; `today`
// siempre inyectado.
import test from 'node:test';
import assert from 'node:assert/strict';
import { fixture } from './fixtures/rediseno/load.mjs';
import { currentAt } from './fixtures/rediseno/simulate.mjs';
import {
  buildCups, buildSeason, matchState, retiredTeams, groupFinished, defaultRound,
  roundNotice, coverageNote, homeAwayTable, seasonSummary, lastResults, bestStreaks, teamFixtures, headToHead,
} from '../../src/model.js';

const current = fixture('current-2025-2026');
const historical = fixture('historical-2024-2025');
const season = buildSeason({
  name: current.season, current: true,
  benjamin: current.benjamin, prebenjamin: current.prebenjamin, history: current.history,
});
const past = buildSeason({
  name: historical.season, current: false,
  benjamin: historical.benjamin, prebenjamin: historical.prebenjamin,
});
const group = id => season.groups.find(g => g.id === id);
const round = (g, n) => g.rounds.find(r => r.n === n);
const matchesOf = g => g.rounds.flatMap(r => r.matches);

// El grupo `id` tal como estaba el día `todayISO` (currentAt): sin los marcadores
// de ese día en adelante (las fixtures son de la temporada terminada).
function asOf(id, todayISO) {
  const raw = currentAt(todayISO);
  return buildSeason({ name: raw.season, current: true, ...raw }).groups.find(g => g.id === id);
}

// Copia del grupo con los partidos cambiados por `edit` (null lo quita).
function withMatches(g, edit) {
  return { ...g, rounds: g.rounds.map(r => ({ ...r, matches: r.matches.map(edit).filter(Boolean) })) };
}

test('retiredTeams: Batán en PG2, Teguinte en PFV2 y nadie en PG3 ni en benjamín', () => {
  assert.deepEqual([...retiredTeams(group('PG2'))], ['CD Batán']);
  assert.deepEqual([...retiredTeams(group('PFV2'))], ['CD Teguinte']);
  assert.deepEqual([...retiredTeams(group('PG3'))], []);
  for (const id of ['A1', 'A2', 'B1', 'B2', 'FF5', 'FF9', 'FF13', 'FF15']) assert.deepEqual([...retiredTeams(group(id))], [], id);
});

test('retiredTeams: del calendario sin fila ni resultados también en temporadas pasadas', () => {
  const pgc2 = past.groups.find(g => g.id === 'PGC2');
  assert.deepEqual([...retiredTeams(pgc2)], ['Simusetti']);
  assert.deepEqual([...retiredTeams(past.groups.find(g => g.id === 'P1'))], []);
});

test('retiredTeams: pj = 0 solo cuenta en un grupo terminado', () => {
  // Como CD Calero en PGC2 2021-22: fila con pj 0 y 26 partidos sin marcador.
  const pg2 = group('PG2');
  const noCalero = m => (m.home === 'CD Calero' || m.away === 'CD Calero' ? { ...m, hs: null, as: null } : m);
  const calero = {
    ...withMatches(pg2, noCalero),
    standings: pg2.standings.map(r => (r.team === 'CD Calero' ? { ...r, pj: 0, g: 0, e: 0, p: 0 } : r)),
  };
  assert.deepEqual([...retiredTeams(calero)], ['CD Calero', 'CD Batán']);
  // Sin resultados en la última jornada, el grupo no ha terminado.
  const lastKey = pg2.rounds[pg2.rounds.length - 1].key;
  const open = { ...calero, rounds: calero.rounds.map(r => (r.key === lastKey
    ? { ...r, matches: r.matches.map(m => ({ ...m, hs: null, as: null })) } : r)) };
  assert.deepEqual([...retiredTeams(open)], ['CD Batán']);
});

test('retiredTeams: con la clasificación vacía o sin resultados no hay retirados', () => {
  const pg2 = group('PG2');
  assert.deepEqual([...retiredTeams({ ...pg2, standings: [] })], []);
  const blank = withMatches(group('PFV2'), m => ({ ...m, hs: null, as: null }));
  assert.deepEqual([...retiredTeams(blank)], []);
});

test('buildGroup marca retired en la fila de la clasificación de cada retirado', () => {
  assert.deepEqual(group('PG2').standings.filter(r => r.retired).map(r => r.team), ['CD Batán']);
  // CD Teguinte y Simusetti no tienen fila: no hay nada que marcar.
  assert.ok(group('PFV2').standings.every(r => r.retired === false));
  assert.ok(past.groups.find(g => g.id === 'PGC2').standings.every(r => r.retired === false));
});

test('groupFinished: PG2 terminado el 15/06 y el 23/09 de 2026 (caso real 1)', () => {
  const pg2 = group('PG2');
  assert.equal(groupFinished(pg2, '2026-09-23', '2025-2026'), true);
  assert.equal(groupFinished(pg2, '2026-06-15', '2025-2026'), true);
  assert.equal(groupFinished(pg2, '2026-05-31', '2025-2026'), false);
  assert.equal(groupFinished(asOf('PG2', '2026-06-05'), '2026-06-05', '2025-2026'), false);
});

test('groupFinished: hueco (estado C) de FF13 hasta el 1 de junio; otra temporada, terminado', () => {
  const ff13 = group('FF13');
  assert.equal(groupFinished(ff13, '2026-03-01', '2025-2026'), false);
  assert.equal(groupFinished(ff13, '2026-06-01', '2025-2026'), true);
  assert.equal(groupFinished(ff13, '2026-03-01', '2026-2027'), true);
  assert.equal(groupFinished(past.groups.find(g => g.id === 'P1'), '2026-09-23', '2025-2026'), true);
});

test('groupFinished y defaultRound: los partidos contra retirados no cuentan', () => {
  // Aunque los partidos de CD Teguinte tuvieran fecha futura, seguirían fuera.
  const pfv2 = withMatches(group('PFV2'), m => (m.home === 'CD Teguinte' || m.away === 'CD Teguinte'
    ? { ...m, dateISO: '2026-10-04' } : m));
  const teguinte = matchesOf(pfv2).filter(m => m.home === 'CD Teguinte' || m.away === 'CD Teguinte');
  assert.equal(teguinte.length, 14);
  assert.ok(teguinte.every(m => matchState(m, '2026-09-23') === 'pendiente'));
  assert.equal(groupFinished(pfv2, '2026-09-23', '2025-2026'), true);
  assert.equal(defaultRound(pfv2, '2026-09-23').n, 14);
  // En los datos reales no tienen fecha: 'sin fecha', nunca 'pendiente'.
  const real = matchesOf(group('PFV2')).filter(m => m.home === 'CD Teguinte' || m.away === 'CD Teguinte');
  assert.ok(real.every(m => matchState(m, '2026-09-23') === 'sin fecha'));
});

test('defaultRound: la jornada del primer partido pendiente por fecha', () => {
  assert.equal(defaultRound(group('PG2'), '2026-09-23').n, 30);
  assert.equal(defaultRound(asOf('PG2', '2026-06-03'), '2026-06-03').n, 30);
  assert.equal(defaultRound(asOf('PG2', '2025-09-01'), '2025-09-01').n, 1);
  // A2, 10/01/2026: la jornada 2 tiene un aplazado el 04/02, pero la de ese
  // fin de semana es la 4.
  const a2 = asOf('A2', '2026-01-10');
  assert.ok(round(a2, 2).matches.some(m => m.dateISO === '2026-02-04' && matchState(m, '2026-01-10') === 'pendiente'));
  assert.equal(defaultRound(a2, '2026-01-10').n, 4);
});

test('roundNotice: PG2 jornada 30, sin partido RC Victoria y Arucas B (caso real 5)', () => {
  const pg2 = group('PG2');
  assert.deepEqual(roundNotice(pg2, round(pg2, 30)),
    { kind: 'sin-partido', teams: ['RC Victoria', 'Arucas B'], retired: ['CD Batán'], missing: 0 });
  // Jornadas 1 y 16: descansa Batán y juegan los 14 activos.
  assert.equal(roundNotice(pg2, round(pg2, 1)), null);
  assert.equal(roundNotice(pg2, round(pg2, 16)), null);
});

test('roundNotice: PG3 nunca dice «faltan» aunque falten 2 equipos por jornada', () => {
  const pg3 = group('PG3');
  assert.equal(pg3.rounds.length, 30);
  for (const r of pg3.rounds) {
    const notice = roundNotice(pg3, r);
    if (r.n === 4 || r.n === 19) assert.equal(notice, null, `jornada ${r.n}`);
    else {
      assert.equal(notice.kind, 'sin-partido', `jornada ${r.n}`);
      assert.equal(notice.teams.length, 2, `jornada ${r.n}`);
      assert.deepEqual(notice.retired, []);
    }
  }
  assert.deepEqual(roundNotice(pg3, round(pg3, 1)).teams, ['CD Cerruda', 'CD Tablero']);
});

test('roundNotice: PFV2, el rival de CD Teguinte se queda sin partido', () => {
  const pfv2 = group('PFV2');
  assert.deepEqual(roundNotice(pfv2, round(pfv2, 1)), {
    kind: 'sin-partido', teams: ['ATISACHI DE FUERTEVENTURA C.F., C.D. "B"'], retired: ['CD Teguinte'], missing: 0,
  });
});

test('roundNotice: «faltan» solo si la jornada tiene menos partidos que la moda', () => {
  const pg2 = group('PG2');
  const j30 = round(pg2, 30);
  const cut = { ...pg2, rounds: pg2.rounds.map(r => (r === j30 ? { ...r, matches: r.matches.slice(0, 4) } : r)) };
  const notice = roundNotice(cut, round(cut, 30));
  assert.equal(notice.kind, 'faltan');
  assert.equal(notice.missing, 2);
  assert.deepEqual(notice.retired, ['CD Batán']);
  assert.equal(notice.teams.length, 6);
});

test('coverageNote: Las Mesas en PG2, 26 en el calendario y 2 contra CD Batán (caso real 6)', () => {
  const pg2 = group('PG2');
  assert.deepEqual(coverageNote('Las Mesas Hu.', pg2),
    { played: 28, calendar: 26, vsRetired: 2, retired: ['CD Batán'], withResult: 26 });
  assert.equal(coverageNote('CD Batán', pg2), null);
  assert.equal(coverageNote('Equipo que no está', pg2), null);
  // Si además falta un marcador, withResult lo dice.
  let hidden = false;
  const oneLess = withMatches(pg2, m => {
    if (!hidden && m.home === 'Las Mesas Hu.') { hidden = true; return { ...m, hs: null, as: null }; }
    return m;
  });
  assert.deepEqual(coverageNote('Las Mesas Hu.', oneLess),
    { played: 28, calendar: 26, vsRetired: 2, retired: ['CD Batán'], withResult: 25 });
});

test('coverageNote: null cuando el calendario explica todo el PJ (PG3 y PFV2)', () => {
  for (const id of ['PG3', 'PFV2']) {
    for (const row of group(id).standings) assert.equal(coverageNote(row.team, group(id)), null, `${id} ${row.team}`);
  }
});

test('homeAwayTable: Casa y Fuera de PG2 desde el calendario', () => {
  const pg2 = group('PG2');
  const casa = homeAwayTable(pg2, 'casa');
  const fuera = homeAwayTable(pg2, 'fuera');
  assert.equal(casa.length, 15);
  assert.deepEqual(casa.find(r => r.team === 'Las Mesas Hu.'),
    { pos: 9, team: 'Las Mesas Hu.', pts: 16, pj: 13, g: 5, e: 1, p: 7, gf: 40, gc: 64, dg: -24, retired: false });
  assert.deepEqual(fuera.find(r => r.team === 'Las Mesas Hu.'),
    { pos: 9, team: 'Las Mesas Hu.', pts: 15, pj: 13, g: 5, e: 0, p: 8, gf: 44, gc: 56, dg: -12, retired: false });
  assert.deepEqual(casa.slice(0, 2).map(r => [r.team, r.pts, r.dg]), [['Unión Viera', 39, 80], ['Acodetti', 39, 75]]);
  assert.deepEqual(casa[14], { pos: 15, team: 'CD Batán', pts: 0, pj: 0, g: 0, e: 0, p: 0, gf: 0, gc: 0, dg: 0, retired: true });
  // Calendario + las 2 victorias contra el retirado = G/E/P oficiales.
  for (const row of pg2.standings.filter(r => r.team !== 'CD Batán')) {
    const c = casa.find(r => r.team === row.team), f = fuera.find(r => r.team === row.team);
    assert.deepEqual([c.g + f.g + 2, c.e + f.e, c.p + f.p], [row.g, row.e, row.p], row.team);
  }
});

test('seasonSummary: «La temporada en cifras» de Las Mesas (maqueta 4)', () => {
  const s = seasonSummary('Las Mesas Hu.', group('PG2'));
  assert.deepEqual([s.pos, s.of, s.pts, s.g, s.e, s.p, s.gf, s.gc], [9, 15, 37, 12, 1, 15, 90, 120]);
  assert.deepEqual([s.perMatch.gf.toFixed(1), s.perMatch.gc.toFixed(1)], ['3.2', '4.6']);
  assert.deepEqual(s.home, { pj: 13, g: 5, e: 1, p: 7, gf: 40, gc: 64, pts: 16 });
  assert.deepEqual(s.away, { pj: 13, g: 5, e: 0, p: 8, gf: 44, gc: 56, pts: 15 });
  const brief = r => [r.gf, r.gc, r.rival, r.side, r.letter, r.match.dateISO];
  assert.deepEqual(brief(s.best), [9, 2, 'CD Calero', 'fuera', 'G', '2026-05-28']);
  assert.deepEqual(brief(s.worst), [1, 11, 'Unión Viera', 'fuera', 'P', '2025-10-19']);
  assert.deepEqual(brief(s.last), [2, 7, 'AD Huracán', 'casa', 'P', '2026-06-02']);
  assert.deepEqual(s.coverage, coverageNote('Las Mesas Hu.', group('PG2')));
});

test('seasonSummary: sin derrotas no hay peor derrota; sin fila, sin puesto', () => {
  const s = seasonSummary('UD Vecindario', group('PG3'));
  assert.deepEqual([s.pos, s.g, s.e, s.p], [1, 26, 0, 0]);
  assert.equal(s.worst, null);
  assert.equal(s.best.letter, 'G');
  const none = seasonSummary('Equipo que no está', group('PG3'));
  assert.deepEqual([none.pos, none.pts, none.perMatch, none.best, none.last, none.coverage], [null, null, null, null, null, null]);
});

test('lastResults: «Últimos cinco» de Las Mesas en PG2, del más antiguo al más reciente (maqueta 4)', () => {
  const last = lastResults('Las Mesas Hu.', group('PG2'));
  assert.deepEqual(last.map(r => [r.rival, r.letter, r.gf, r.gc, r.side, r.match.dateISO]), [
    ['Arucas B', 'E', 1, 1, 'casa', '2026-04-21'],
    ['Telde', 'P', 0, 3, 'fuera', '2026-04-30'],
    ['RC Victoria', 'P', 1, 8, 'casa', '2026-05-05'],
    ['CD Calero', 'G', 9, 2, 'fuera', '2026-05-28'],
    ['AD Huracán', 'P', 2, 7, 'casa', '2026-06-02'],
  ]);
  assert.deepEqual(Object.keys(last[0]).sort(), ['gc', 'gf', 'letter', 'match', 'rival', 'side']);
  // El mismo criterio que seasonSummary: su `last` es el último de la forma.
  assert.deepEqual(last[4], seasonSummary('Las Mesas Hu.', group('PG2')).last);
});

test('lastResults: respeta n y ordena por fecha, no por jornada', () => {
  const pg2 = group('PG2');
  assert.deepEqual(lastResults('Las Mesas Hu.', pg2, 3).map(r => r.rival), ['RC Victoria', 'CD Calero', 'AD Huracán']);
  const all = lastResults('Las Mesas Hu.', pg2, 100);
  assert.equal(all.length, 26);
  assert.deepEqual([all[0].rival, all[0].match.dateISO], ['UD Jinámar', '2025-10-11']);
  assert.deepEqual(lastResults('Las Mesas Hu.', pg2, 0), []);
  // PG3: CD Tablero jugó la jornada 25 (con Estrella CF) después de la 27.
  assert.deepEqual(lastResults('CD Tablero', group('PG3')).map(r => [r.rival, r.letter, r.gf, r.gc, r.side, r.match.dateISO]), [
    ['Ingenio B', 'G', 5, 2, 'fuera', '2026-05-09'],
    ['Maspalomas', 'P', 2, 7, 'casa', '2026-05-15'],
    ['Estrella CF', 'G', 5, 1, 'casa', '2026-05-28'],
    ['Maspa Training B', 'P', 1, 7, 'fuera', '2026-05-29'],
    ['Arguineguín', 'P', 1, 4, 'casa', '2026-06-04'],
  ]);
});

test('lastResults: vacío para un retirado, sin partidos jugados o fuera de una liga', () => {
  assert.deepEqual(lastResults('CD Batán', group('PG2')), []);
  const blank = structuredClone(group('PG2'));
  blank.rounds.forEach(r => r.matches.forEach(m => { m.hs = null; m.as = null; }));
  assert.deepEqual(lastResults('Las Mesas Hu.', blank), []);
  // CD 35600: 14 partidos en el calendario, 2 contra CD Teguinte sin jugar.
  assert.equal(lastResults('CD 35600', group('PFV2'), 100).length, 12);
  // Fase de grupos de la Maspalomas (MCP3): 3 partidos jugados, pero no es liga.
  const cups = fixture('cups-2025-2026');
  const mcp3 = buildCups({ season: '2025-2026', benjamin: cups.benjamin, prebenjamin: cups.prebenjamin })
    .groups.find(g => g.id === 'MCP3');
  assert.equal(mcp3.kind, 'cup-league');
  assert.equal(matchesOf(mcp3).filter(m => m.hs != null && [m.home, m.away].includes('UD Las Mesas Huracán')).length, 3);
  assert.deepEqual(lastResults('UD Las Mesas Huracán', mcp3), []);
});

test('bestStreaks: rachas de prebenjamín, solo de su categoría', () => {
  const { wins, unbeaten } = bestStreaks(season, 'prebenjamin');
  assert.deepEqual(wins.slice(0, 3), [
    { team: 'UD Vecindario', n: 26, groupId: 'PG3' },
    { team: 'Unión Viera', n: 18, groupId: 'PG2' },
    { team: 'Acodetti', n: 15, groupId: 'PG2' },
  ]);
  assert.deepEqual(unbeaten.slice(0, 4), [
    { team: 'UD Vecindario', n: 26, groupId: 'PG3' },
    { team: 'Unión Viera', n: 23, groupId: 'PG2' },
    { team: 'Acodetti', n: 15, groupId: 'PG2' },
    { team: 'AD Huracán', n: 12, groupId: 'PG2' },
  ]);
  assert.deepEqual(wins.find(x => x.team === 'Las Mesas Hu.'), { team: 'Las Mesas Hu.', n: 2, groupId: 'PG2' });
  assert.deepEqual(unbeaten.find(x => x.team === 'Las Mesas Hu.'), { team: 'Las Mesas Hu.', n: 2, groupId: 'PG2' });
  assert.ok([...wins, ...unbeaten].every(x => ['PG2', 'PG3', 'PFV2'].includes(x.groupId)));
  assert.ok(![...wins, ...unbeaten].some(x => x.team === 'CD Batán' || x.team === 'CD Teguinte'));
});

test('bestStreaks: benjamín, un equipo por grupo, y temporadas pasadas', () => {
  const { wins } = bestStreaks(season, 'benjamin');
  assert.deepEqual(wins.slice(0, 2), [
    { team: 'Las Palmas', n: 22, groupId: 'A2' },
    { team: 'Las Torres', n: 22, groupId: 'B2' },
  ]);
  const mesas = wins.filter(x => x.team === 'Las Mesas Hu.').map(x => x.groupId).sort();
  assert.deepEqual(mesas, ['A2', 'FF5']);
  // PGC2 2024-25 con los marcadores reparados por el Plan A2.
  const pastPre = bestStreaks(past, 'prebenjamin');
  assert.deepEqual(pastPre.wins.slice(0, 2), [
    { team: 'Unión Viera', n: 12, groupId: 'PGC2' },
    { team: 'AD Huracán', n: 9, groupId: 'PGC2' },
  ]);
  assert.deepEqual(pastPre.unbeaten.slice(0, 2), [
    { team: 'Unión Viera', n: 20, groupId: 'PGC2' },
    { team: 'AD Huracán', n: 17, groupId: 'PGC2' },
  ]);
  const pastBen = bestStreaks(past, 'benjamin');
  assert.deepEqual(pastBen.wins[0], { team: 'Moya', n: 6, groupId: 'P1' });
  assert.deepEqual(pastBen.unbeaten.slice(0, 2), [
    { team: 'Gáldar CF', n: 6, groupId: 'P1' },
    { team: 'Moya', n: 6, groupId: 'P1' },
  ]);
});

test('coverageNote a mitad de temporada: lo que la clasificación cuenta de más sale de los partidos con resultado', () => {
  // El 25/05/2026 a Las Mesas le quedan dos partidos (28/05 y 02/06) y ya ha pasado sus cuatro
  // jornadas sin partido en el calendario: dos de descanso y dos contra CD Batán.
  const mid = asOf('PG2', '2026-05-25');
  const played = lastResults('Las Mesas Hu.', mid, 100);
  assert.equal(played.length, 24);
  // Su fila de ese día, coherente con el calendario: esos 24 más 2 victorias por incomparecencia (3-0).
  const count = letter => played.filter(r => r.letter === letter).length;
  const gf = played.reduce((n, r) => n + r.gf, 0) + 6, gc = played.reduce((n, r) => n + r.gc, 0);
  const [g, e, p] = [count('G') + 2, count('E'), count('P')];
  const row = { pos: 9, team: 'Las Mesas Hu.', pts: g * 3 + e, pj: 26, g, e, p, gf, gc, dg: gf - gc, retired: false };
  const midGroup = { ...mid, standings: mid.standings.map(r => (r.team === 'Las Mesas Hu.' ? row : r)) };
  assert.deepEqual(coverageNote('Las Mesas Hu.', midGroup),
    { played: 26, calendar: 26, vsRetired: 2, retired: ['CD Batán'], withResult: 24 });
});

test('teamFixtures: próximo partido por fecha, último jugado y lo que queda', () => {
  const brief = m => m && [m.roundKey, m.dateISO, m.home, m.away, m.hs, m.as];
  const june1 = teamFixtures('Las Mesas Hu.', asOf('PG2', '2026-06-01'), '2026-06-01');
  assert.deepEqual(brief(june1.next), ['Jornada 30', '2026-06-02', 'Las Mesas Hu.', 'AD Huracán', null, null]);
  assert.deepEqual(brief(june1.last), ['Jornada 29', '2026-05-28', 'CD Calero', 'Las Mesas Hu.', 2, 9]);
  assert.deepEqual([june1.played, june1.undated, june1.remaining], [25, 0, 1]);
  // Del 03 al 06/06 el grupo sigue abierto, pero Las Mesas ya ha jugado todo su calendario.
  const june3 = teamFixtures('Las Mesas Hu.', asOf('PG2', '2026-06-03'), '2026-06-03');
  assert.deepEqual([june3.next, june3.played, june3.undated, june3.remaining], [null, 26, 0, 0]);
  // Si el partido que le queda no tiene fecha, no hay próximo partido: queda uno sin fecha.
  const undated = withMatches(asOf('PG2', '2026-06-01'), m => (m.dateISO === '2026-06-02' ? { ...m, dateISO: null } : m));
  const f = teamFixtures('Las Mesas Hu.', undated, '2026-06-01');
  assert.deepEqual([f.next, f.played, f.undated, f.remaining], [null, 25, 1, 1]);
});

test('teamFixtures: el aplazado de A2 no es el próximo partido y los de un retirado no cuentan', () => {
  // A2, 10/01/2026: Veteranos–Las Mesas Hu., de la jornada 2, está aplazado al 04/02; el
  // próximo partido de Las Mesas es el de ese mismo día, de la jornada 4.
  const { next } = teamFixtures('Las Mesas Hu.', asOf('A2', '2026-01-10'), '2026-01-10');
  assert.deepEqual([next.roundKey, next.dateISO, next.home, next.away], ['Jornada 4', '2026-01-10', 'Guiniguada', 'Las Mesas Hu.']);
  // PFV2 con los partidos de CD Teguinte fechados el 28/05: nunca son el próximo de Unión Tetir.
  const raw = structuredClone(current);
  for (const rows of Object.values(raw.history.PFV2)) {
    for (const row of rows) if (row[1] === 'CD Teguinte' || row[2] === 'CD Teguinte') row[0] = '28-05-2026';
  }
  const pfv2 = buildSeason({ name: raw.season, current: true, ...raw }).groups.find(g => g.id === 'PFV2');
  const tetir = teamFixtures('Unión Tetir', pfv2, '2026-05-25');
  assert.deepEqual([tetir.next, tetir.played, tetir.undated, tetir.remaining], [null, 12, 0, 0]);
  assert.equal(tetir.last.dateISO, '2026-05-10');
});

test('headToHead: Las Mesas–AD Huracán de PG2 son los dos partidos de PG2, nunca el 2-9 de A2 (caso 7)', () => {
  const h2h = headToHead(group('PG2'), 'Las Mesas Hu.', 'AD Huracán');
  assert.deepEqual(h2h.map(m => [m.groupId, m.dateISO, m.home, m.hs, m.as, m.away]), [
    ['PG2', '2026-02-12', 'AD Huracán', 8, 1, 'Las Mesas Hu.'],
    ['PG2', '2026-06-02', 'Las Mesas Hu.', 2, 7, 'AD Huracán'],
  ]);
  assert.deepEqual(headToHead(group('PG2'), 'AD Huracán', 'Las Mesas Hu.'), h2h);
  // Los mismos nombres jugaron en A2 (el 2-9), que es otro grupo y otra categoría.
  assert.ok(headToHead(group('A2'), 'Las Mesas Hu.', 'AD Huracán').some(m => m.hs === 2 && m.as === 9));
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd /home/manolo/claude/futbol-base
node --test scripts/tests/test_rediseno_model_analisis.mjs 2>&1 | grep -E 'SyntaxError|^# (tests|pass|fail)'
```
Esperado:
```text
# SyntaxError: The requested module '../../src/model.js' does not provide an export named 'bestStreaks'
# tests 1
# pass 0
# fail 1
```

- [ ] **Step 3: Write minimal implementation**

1. El bloque de análisis solo usa `matchState` de la Tarea 3 y no añade `import`.

   Añadir al final de `src/model.js`, tras una línea en blanco:

```js
// ─── Análisis de grupo (spec §4.2, §4.3, §4.4, §4.7, §5.3 y §7) ─────────────

function playedMatch(m) {
  return m.hs != null && m.as != null;
}

function groupMatches(group) {
  return (group.rounds || []).flatMap(round => round.matches);
}

/* Partidos del grupo en orden de fecha (seasonISO, ya en m.dateISO). Un
 * partido sin fecha toma la primera fecha de su jornada o, si la jornada no
 * tiene ninguna, la última conocida; a igual fecha manda el orden de jornada
 * y de fila. Así los grupos antiguos de Fuerteventura y Lanzarote, con
 * partidos jugados sin fecha, no se desordenan. */
function chronologicalMatches(group) {
  const items = [];
  let carry = '';
  (group.rounds || []).forEach((round, ri) => {
    const first = round.matches.map(m => m.dateISO).filter(Boolean).sort()[0] || carry;
    round.matches.forEach((m, mi) => items.push({ m, key: m.dateISO || first, ri, mi }));
    carry = first;
  });
  items.sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0) || a.ri - b.ri || a.mi - b.mi);
  return items.map(item => item.m);
}

/* Resultados jugados de un equipo, sin los partidos contra retirados, en
 * orden cronológico y desde su punto de vista:
 * {match, letter: 'G'|'E'|'P', gf, gc, rival, side: 'casa'|'fuera'}.
 * Es el criterio común de seasonSummary y lastResults; homeAwayTable y
 * bestStreaks aplican los mismos filtros en una sola pasada. */
function teamResults(group, team, retired) {
  const out = [];
  for (const match of chronologicalMatches(group)) {
    if (!playedMatch(match) || (match.home !== team && match.away !== team)) continue;
    const home = match.home === team;
    const rival = home ? match.away : match.home;
    if (retired.has(rival)) continue;
    const gf = home ? match.hs : match.as;
    const gc = home ? match.as : match.hs;
    out.push({ match, letter: gf > gc ? 'G' : gf === gc ? 'E' : 'P', gf, gc, rival, side: home ? 'casa' : 'fuera' });
  }
  return out;
}

/* Balance {pj, g, e, p, gf, gc, pts} de una lista de resultados {gf, gc}. */
function recordOf(results) {
  const rec = { pj: results.length, g: 0, e: 0, p: 0, gf: 0, gc: 0, pts: 0 };
  for (const { gf, gc } of results) {
    if (gf > gc) rec.g += 1;
    else if (gf === gc) rec.e += 1;
    else rec.p += 1;
    rec.gf += gf;
    rec.gc += gc;
  }
  rec.pts = rec.g * 3 + rec.e;
  return rec;
}

/* Única definición de retirado (spec §5.3). «Grupo terminado» en la regla de
 * pj = 0 no puede depender de hoy (la firma no lo recibe): cuenta como
 * terminado el grupo cuya última jornada ya tiene algún resultado. */
export function retiredTeams(group) {
  const rounds = group.rounds || [];
  const standings = group.standings || [];
  const inCalendar = new Set();
  const withResult = new Set();
  rounds.forEach(round => round.matches.forEach(m => {
    inCalendar.add(m.home);
    inCalendar.add(m.away);
    if (playedMatch(m)) {
      withResult.add(m.home);
      withResult.add(m.away);
    }
  }));
  const lastRound = rounds[rounds.length - 1];
  const finished = Boolean(lastRound && lastRound.matches.some(playedMatch));
  const retired = new Set();
  for (const row of standings) {
    if (withResult.has(row.team)) continue;
    const gone = !inCalendar.has(row.team) && row.pj > 0 && row.g + row.e === 0;
    if (gone || (row.pj === 0 && finished)) retired.add(row.team);
  }
  if (standings.length && withResult.size) {
    const listed = new Set(standings.map(row => row.team));
    for (const team of inCalendar) {
      if (!listed.has(team) && !withResult.has(team)) retired.add(team);
    }
  }
  return retired;
}

function liveMatch(retired) {
  return m => !retired.has(m.home) && !retired.has(m.away);
}

/* Estado D (§4.2): ningún partido pendiente (sin contar los de retirados) y,
 * además, temporada distinta de la del portal o a partir del 1 de junio del
 * año final. */
export function groupFinished(group, todayISO, portalSeason) {
  const live = liveMatch(retiredTeams(group));
  if (groupMatches(group).some(m => live(m) && matchState(m, todayISO) === 'pendiente')) return false;
  if (group.season !== portalSeason) return true;
  return todayISO >= `${String(group.season).split('-')[1]}-06-01`;
}

/* §4.3: la jornada del primer partido pendiente por fecha (a igual fecha, la
 * primera jornada), para que un aplazado no devuelva una jornada vieja; si no
 * hay pendientes, la última con resultados; si tampoco, la primera. */
export function defaultRound(group, todayISO) {
  const rounds = group.rounds || [];
  const live = liveMatch(retiredTeams(group));
  let next = null, nextDate = null;
  for (const round of rounds) {
    for (const m of round.matches) {
      if (!live(m) || matchState(m, todayISO) !== 'pendiente') continue;
      if (nextDate === null || m.dateISO < nextDate) {
        next = round;
        nextDate = m.dateISO;
      }
    }
  }
  if (next) return next;
  const withResults = rounds.filter(round => round.matches.some(playedMatch));
  return withResults[withResults.length - 1] || rounds[0] || null;
}

/* Equipos activos: los de la clasificación (en su orden) o, si llega vacía,
 * los del calendario; nunca los retirados. */
function activeTeams(group, retired) {
  const standings = group.standings || [];
  const names = standings.length
    ? standings.map(row => row.team)
    : [...new Set(groupMatches(group).flatMap(m => [m.home, m.away]))];
  return names.filter(team => !retired.has(team));
}

/* Moda de partidos por jornada; en empate, la menor (nunca inventa «faltan»). */
function usualMatchesPerRound(group, live) {
  const freq = new Map();
  for (const round of group.rounds || []) {
    const n = round.matches.filter(live).length;
    freq.set(n, (freq.get(n) || 0) + 1);
  }
  let best = 0, bestFreq = 0;
  for (const [n, f] of freq) {
    if (f > bestFreq || (f === bestFreq && n < best)) {
      best = n;
      bestFreq = f;
    }
  }
  return best;
}

/* Aviso de jornada (§4.3). Los partidos contra retirados no cuentan y los
 * retirados nunca figuran como ausentes. */
export function roundNotice(group, round) {
  const retired = retiredTeams(group);
  const live = liveMatch(retired);
  const matches = round.matches.filter(live);
  const playing = new Set(matches.flatMap(m => [m.home, m.away]));
  const teams = activeTeams(group, retired).filter(team => !playing.has(team));
  const usual = usualMatchesPerRound(group, live);
  if (matches.length < usual) {
    return { kind: 'faltan', teams, retired: [...retired], missing: usual - matches.length };
  }
  if (teams.length) return { kind: 'sin-partido', teams, retired: [...retired], missing: 0 };
  return null;
}

/* Cobertura (§7) de las cifras calculadas con el calendario frente al PJ de
 * la clasificación. `calendar` son los partidos del equipo sin retirados,
 * también los que aún no se han jugado; `withResult`, los que tienen marcador;
 * `vsRetired`, los partidos contra retirados: los del calendario más, si algún
 * retirado no aparece en él (Batán en PG2), los que la clasificación cuenta de
 * más. Eso se mide con los partidos con resultado (pj − withResult), nunca con
 * el calendario entero, que a mitad de temporada trae los futuros; y como
 * mucho son tantos como veces se enfrenta a cualquier otro rival por cada
 * ausente, para no achacarle un marcador que falta. null si los partidos con
 * resultado explican todo el PJ. */
export function coverageNote(team, group) {
  const row = (group.standings || []).find(r => r.team === team);
  const retired = retiredTeams(group);
  if (!row || retired.has(team)) return null;
  const all = groupMatches(group);
  const mine = all.filter(m => m.home === team || m.away === team);
  const rivalOf = m => (m.home === team ? m.away : m.home);
  const calendar = mine.filter(m => !retired.has(rivalOf(m)));
  const withResult = calendar.filter(playedMatch).length;
  if (withResult === row.pj) return null;
  const inCalendar = new Set(all.flatMap(m => [m.home, m.away]));
  const faced = mine.map(rivalOf).filter(rival => retired.has(rival));
  const absent = [...retired].filter(t => !inCalendar.has(t));
  const meetings = new Map();
  for (const m of calendar) meetings.set(rivalOf(m), (meetings.get(rivalOf(m)) || 0) + 1);
  const perRival = Math.max(0, ...meetings.values());
  const extra = absent.length ? Math.min(Math.max(0, row.pj - withResult), absent.length * perRival) : 0;
  const names = [...new Set([...faced, ...(extra ? absent : [])])];
  return { played: row.pj, calendar: calendar.length, vsRetired: faced.length + extra, retired: names, withResult };
}

/* Vistas Casa y Fuera de la Tabla (§4.4), desde el calendario. Mismos equipos
 * que la clasificación oficial (o los del calendario si llega vacía), con
 * `retired` marcado. Orden: retirados al final; luego puntos, diferencia,
 * goles a favor y puesto oficial. */
export function homeAwayTable(group, side) {
  const retired = retiredTeams(group);
  const standings = group.standings || [];
  const names = standings.length ? standings.map(row => row.team) : activeTeams(group, retired);
  const home = side === 'casa';
  const results = new Map(names.map(team => [team, []]));
  for (const m of groupMatches(group)) {
    if (!playedMatch(m) || retired.has(m.home) || retired.has(m.away)) continue;
    const list = results.get(home ? m.home : m.away);
    if (list) list.push(home ? { gf: m.hs, gc: m.as } : { gf: m.as, gc: m.hs });
  }
  const rows = names.map((team, index) => {
    const rec = recordOf(results.get(team));
    return {
      index,
      row: { pos: 0, team, pts: rec.pts, pj: rec.pj, g: rec.g, e: rec.e, p: rec.p, gf: rec.gf, gc: rec.gc, dg: rec.gf - rec.gc, retired: retired.has(team) },
    };
  });
  rows.sort((a, b) => a.row.retired - b.row.retired || b.row.pts - a.row.pts || b.row.dg - a.row.dg
    || b.row.gf - a.row.gf || a.index - b.index);
  return rows.map(({ row }, i) => ({ ...row, pos: i + 1 }));
}

/* «La temporada en cifras» y «Así terminó» (§4.2). Puesto, puntos, balance y
 * goles, de la clasificación; el resto, del calendario sin retirados. best,
 * worst y last tienen la forma de lastResults, o null. */
export function seasonSummary(team, group) {
  const standings = group.standings || [];
  const row = standings.find(r => r.team === team) || null;
  const results = teamResults(group, team, retiredTeams(group));
  const total = recordOf(results);
  let best = null, worst = null;
  for (const r of results) {
    const dg = r.gf - r.gc;
    if (!best || dg > best.gf - best.gc || (dg === best.gf - best.gc && r.gf > best.gf)) best = r;
    if (dg < 0 && (!worst || dg < worst.gf - worst.gc || (dg === worst.gf - worst.gc && r.gc > worst.gc))) worst = r;
  }
  return {
    pos: row ? row.pos : null,
    of: standings.length,
    pts: row ? row.pts : null,
    g: row ? row.g : null,
    e: row ? row.e : null,
    p: row ? row.p : null,
    gf: row ? row.gf : null,
    gc: row ? row.gc : null,
    perMatch: total.pj ? { gf: total.gf / total.pj, gc: total.gc / total.pj } : null,
    home: recordOf(results.filter(r => r.side === 'casa')),
    away: recordOf(results.filter(r => r.side === 'fuera')),
    best,
    worst,
    last: results[results.length - 1] || null,
    coverage: coverageNote(team, group),
  };
}

/* Forma (§4.2 «Últimos cinco», vista Forma de la Tabla y «Contexto» del
 * partido): los `n` últimos resultados de liga del equipo en el grupo, del
 * más antiguo al más reciente, con el criterio de teamResults. En un grupo
 * que no es de liga, ninguno. */
export function lastResults(team, group, n = 5) {
  if (group.kind !== 'league') return [];
  const results = teamResults(group, team, retiredTeams(group));
  return results.slice(Math.max(0, results.length - n));
}

/* Partidos de un equipo en el grupo, sin los que son contra retirados (§4.2):
 * `next`, el primer `pendiente` por fecha (a igual fecha, por jornada), que es
 * el «Próximo partido» de la portada; `last`, el último jugado; y cuántos hay
 * jugados (`played`), sin fecha (`undated`) y todavía sin resultado
 * (`remaining`). Con `remaining` a 0, el equipo ya ha jugado todo su
 * calendario aunque el grupo siga abierto. */
export function teamFixtures(team, group, todayISO) {
  const retired = retiredTeams(group);
  let next = null, last = null, played = 0, undated = 0, remaining = 0;
  for (const m of chronologicalMatches(group)) {
    if ((m.home !== team && m.away !== team) || retired.has(m.home) || retired.has(m.away)) continue;
    const state = matchState(m, todayISO);
    if (state === 'jugado') {
      played += 1;
      last = m;
      continue;
    }
    remaining += 1;
    if (state === 'sin fecha') undated += 1;
    if (state === 'pendiente' && !next) next = m;
  }
  return { next, last, played, undated, remaining };
}

/* Cara a cara (§4.5): los partidos entre `a` y `b` en ese grupo, en los dos
 * sentidos y por fecha. Solo del grupo: nunca mezcla otra fase ni otra
 * categoría (caso 7 de §11). */
export function headToHead(group, a, b) {
  return chronologicalMatches(group)
    .filter(m => (m.home === a && m.away === b) || (m.home === b && m.away === a));
}

/* Récords (§4.7): la mejor racha de victorias y la mejor invicta de cada
 * equipo en cada grupo de liga de la categoría, en orden de fecha. Una
 * entrada por equipo y grupo, de mayor a menor; a igual racha, por nombre y
 * grupo. */
export function bestStreaks(season, cat) {
  const wins = [], unbeaten = [];
  for (const group of season.groups) {
    if (group.cat !== cat || group.kind !== 'league') continue;
    const retired = retiredTeams(group);
    const runs = new Map();
    for (const m of chronologicalMatches(group)) {
      if (!playedMatch(m) || retired.has(m.home) || retired.has(m.away)) continue;
      for (const [team, gf, gc] of [[m.home, m.hs, m.as], [m.away, m.as, m.hs]]) {
        const run = runs.get(team) || { w: 0, u: 0, bestW: 0, bestU: 0 };
        run.w = gf > gc ? run.w + 1 : 0;
        run.u = gf < gc ? 0 : run.u + 1;
        run.bestW = Math.max(run.bestW, run.w);
        run.bestU = Math.max(run.bestU, run.u);
        runs.set(team, run);
      }
    }
    for (const [team, run] of runs) {
      if (run.bestW) wins.push({ team, n: run.bestW, groupId: group.id });
      if (run.bestU) unbeaten.push({ team, n: run.bestU, groupId: group.id });
    }
  }
  const order = (a, b) => b.n - a.n || a.team.localeCompare(b.team, 'es') || a.groupId.localeCompare(b.groupId, 'es');
  return { wins: wins.sort(order), unbeaten: unbeaten.sort(order) };
}
```

2. `buildGroup` (Tarea 3) deja `retired: false` en cada `Row`, porque `retiredTeams` aún no existía. Las declaraciones de función se elevan, así que `buildGroup` puede llamar a `retiredTeams` aunque esté más abajo.

   En `src/model.js`, sustituir el final de `buildGroup`, con el único `return group;` del fichero:

```js
    currentRound: currentRoundKey(raw, rounds),
  };
  return group;
}
```

   por:

```js
    currentRound: currentRoundKey(raw, rounds),
  };
  const retired = retiredTeams(group);
  group.standings.forEach(row => { row.retired = retired.has(row.team); });
  return group;
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
cd /home/manolo/claude/futbol-base
node --test scripts/tests/test_rediseno_model_analisis.mjs 2>&1 | grep -E '^not ok|^# (tests|pass|fail)'
```
Esperado:
```text
# tests 27
# pass 27
# fail 0
```
Sin las dos líneas de `buildGroup`, falla solo `not ok 5 - buildGroup marca retired en la fila de la clasificación de cada retirado`.

- [ ] **Step 5: Mutación: las pruebas detectan el orden inverso en `lastResults`**

Se invierte a mano el orden de `lastResults`, se comprueba que las pruebas lo detectan y se restaura:

```bash
cd /home/manolo/claude/futbol-base
S=/tmp/claude-1000/-home-manolo/db6fd8e0-f1e7-4e94-b6cd-ef7dd5bf6ae9/scratchpad/planB1
mkdir -p "$S"
cp src/model.js "$S/model-tarea5.js"
python3 - <<'EOF'
from pathlib import Path
p = Path('src/model.js')
s = p.read_text(encoding='utf-8')
old = 'return results.slice(Math.max(0, results.length - n));'
assert s.count(old) == 1
p.write_text(s.replace(old, 'return results.slice(Math.max(0, results.length - n)).reverse();'), encoding='utf-8')
EOF
node --test scripts/tests/test_rediseno_model_analisis.mjs 2>&1 | grep -E '^not ok|^# (pass|fail)'
cp "$S/model-tarea5.js" src/model.js
node --test scripts/tests/test_rediseno_model_analisis.mjs 2>&1 | grep -E '^# (pass|fail)'
```
Esperado: con la mutación fallan la 19 y la 20 y, ya restaurado, pasan las 27:
```text
not ok 19 - lastResults: «Últimos cinco» de Las Mesas en PG2, del más antiguo al más reciente (maqueta 4)
not ok 20 - lastResults: respeta n y ordena por fecha, no por jornada
# pass 25
# fail 2
# pass 27
# fail 0
```
Si la mutación no hace fallar ninguna prueba, la prueba no protege el orden: se para.

Otras tres mutaciones también fallan: ordenar por jornada en vez de por fecha (fallan la 20 y la 22), ignorar `n` (la 20 y la 21) y quitar la guarda de liga (la 21).

- [ ] **Step 6: Suites completas**

```bash
cd /home/manolo/claude/futbol-base
python3 -m pytest scripts/tests/ -q 2>&1 | tail -1
node --test scripts/tests/test_*.mjs 2>&1 | grep -E '^# (tests|pass|fail)'
```
Esperado:
- pytest: el mismo recuento que al terminar la tarea anterior, sin `failed` (esta tarea no añade pruebas de Python).
- node: el recuento anterior más 27, sin fallos (`# fail 0`).

- [ ] **Step 7: Commit**

```bash
cd /home/manolo/claude/futbol-base
git add src/model.js scripts/tests/fixtures/rediseno/simulate.mjs scripts/tests/test_rediseno_model_analisis.mjs
git commit -F - <<'EOF'
feat(rediseño): análisis de grupo en model.js (B1, tarea 5)

- retiredTeams, la única definición de retirado (spec §5.3); buildGroup
  marca Row.retired con ella.
- groupFinished (§4.2 D), defaultRound y roundNotice (§4.3), coverageNote
  (§7, también a mitad de temporada), homeAwayTable (§4.4), seasonSummary
  (§4.2), lastResults (la forma de «Últimos cinco», la vista Forma y el
  Contexto), teamFixtures (el próximo partido de §4.2), headToHead (el
  cara a cara de §4.5) y bestStreaks (§4.7).
- Casos reales de §11 con las fixtures congeladas: PG2 jornada 30, PG3 sin
  «faltan», CD Teguinte en PFV2 y la cobertura de Las Mesas en PG2.
- simulate.mjs, ayudante de pruebas: currentAt(hoy) da la temporada
  congelada tal como estaba ese día.

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01Sg56KK3oZgo8Ye7Snj6wG9
EOF
git show --stat --oneline HEAD | tail -1
```
Esperado: `3 files changed`: `src/model.js`, `scripts/tests/fixtures/rediseno/simulate.mjs` y `scripts/tests/test_rediseno_model_analisis.mjs`.

---

### Task 6: `model.js`, nombres y cronología: `playerName`, `teamShort` y `timelineFor`

**Contexto** (mismos datos y fecha que la Tarea 5):
- **Nombres de persona reales.** Hay 4.510 distintos entre goleadores, las 5 `data-lineups-*` (jugadores, goleadores del acta, entrenadores y árbitros) y la cronología:
  - «Apellidos, Nombre» con minúsculas (sobre todo goleadores): 2.413, por ejemplo «De La Rosa Perello, Theo»;
  - «APELLIDOS, NOMBRE» (actas): 877, por ejemplo «ALONSO GARCIA, KILIAN JOSE» o «GONZÁLEZ LEON, ÁLVARO»;
  - sin coma y con minúsculas: 1.189, sobre todo nombres de pila de futbolaspalmas, como «Hugo», «Pelayo M» o «Luka (p.p.)», e iniciales como «A. Valencia Gil»;
  - mayúsculas sin coma: 11, como «YAHEL ALEJANDRO»;
  - otros: 20, como «**n54689763», «????», marcadores («0-1») y un «álvaro» en minúscula.
  - `playerName` sobre los 4.362 que son de jugadores no deja ninguna coma ni ninguna palabra en mayúsculas.
- **La cronología de futbolaspalmas** tiene 1.222 entradas, todas de 2025-26, y ninguna `dup`.
  - Cada gol de `g` es `[minuto, nombre, parcial 'h-a', 'h'|'a', tipo]`. El tipo es `'r'`, o `'o'` en 4 goles de A1: el gol en propia puerta, que la interfaz actual ya muestra con «(p.p.)».
  - En 22 goles de C3, FF16 y PG1, la fuente pone el marcador en lugar del nombre.
  - En 22 entradas el reparto de goles no cuadra con el marcador. Por ejemplo, PG2 RC Victoria 2-5 Veteranos (jornada 5) sale 5-2 en la cronología.
- **`'CD Calero|La Garita|1-11'`** es una entrada única de FF15, no `dup`. Pero PG2 tiene su propio CD Calero 1-11 La Garita (jornada 27, 14/05/2026), sin cronología: solo la comprobación de `(s, gr)` evita enseñar en PG2 la de FF15.
- **`'Las Mesas Hu.|AD Huracán|2-9'`** es de A2 (jornada 10, 22/02/2026). El 2-7 de PG2 (02/06/2026) no tiene entrada.
- **`LINEUPS_2025_2026`** tiene 51 entradas (A1: 44, FF1: 7), ninguna `dup`. Los eventos son solo `goal`, con `gt` `'normal'`.
  - Minutos: 291 `null`, 16 a 0 (siempre los primeros goles del acta: parece un artefacto) y 176 entre 1 y 60.
  - Solo un acta trae todos los minutos: UD Valleseco 1-2 Arucas (A1), que además tiene cronología.
  - 19 de las 51 no cuadran con el marcador. Por ejemplo, en Goleta 0-20 Arucas el acta pone a Arucas como local: 20-0.
- **Nombres de equipo reales.** De 515 (clasificaciones, calendarios, `SHIELDS` y Maspalomas), `teamShort` cambia 260 y ninguno se queda sin letras.

**Files:**
- Modify: `src/model.js`: se añade al final el bloque del paso 3.
- Create: `scripts/tests/test_rediseno_model_nombres.mjs`.

**Interfaces:**
- Consumes:
  - de la Tarea 3: `buildSeason` y `Match`, con `season`, `groupId`, `home`, `away`, `hs` y `as`;
  - de la Tarea 1:
    - `fixture('current-2025-2026')`;
    - `fixture('matchdetail')`: entradas `{s, gr, g}` o `{dup, list}`, que deben incluir las de A1, A2, FF15 y PG2 y la clave de Calero;
    - `fixture('lineups-2025-2026')`: las de A1, `{home, away, events, coachH, coachA, ref, s, gr, cod}`.
- Produces:
  - `playerName(raw)` → `string` (`''` si llega vacío o `null`).
  - `teamShort(name)` → `string`: nunca vacío si `name` tiene letras.
  - `timelineFor(match, matchDetail, lineups)` → `null | {source, goals, mismatch}`:
    - `source`: `'futbolaspalmas'` o `'acta'`;
    - `goals`: `[{minute, score, side, name}]`. `minute` es un número o `null`; `score` es `'h-a'`, o `null` en un acta a la que le falta algún minuto; `side` es `'home'` o `'away'`; `name` sale de `playerName` con «(p.p.)» o «(p)» añadido si el tipo lo dice, o es `null` si la fuente trae un marcador en su lugar;
    - `mismatch`: `null`, o `{timeline: 'h-a', score: 'h-a'}` si los goles de cada lado no cuadran con el marcador.

- [ ] **Step 1: Write the failing test**

Crear `scripts/tests/test_rediseno_model_nombres.mjs`:

```js
// Plan B1, Tarea 6: nombres (spec §3.5) y cronología (spec §4.5, §5.3 y caso
// real 7 de §11) en src/model.js. Solo fixtures congeladas.
import test from 'node:test';
import assert from 'node:assert/strict';
import { fixture } from './fixtures/rediseno/load.mjs';
import { buildSeason, playerName, teamShort, timelineFor } from '../../src/model.js';

const current = fixture('current-2025-2026');
const matchDetail = fixture('matchdetail');
const lineups = fixture('lineups-2025-2026');
const season = buildSeason({
  name: current.season, current: true,
  benjamin: current.benjamin, prebenjamin: current.prebenjamin, history: current.history,
});
const group = id => season.groups.find(g => g.id === id);
const find = (id, home, away) => group(id).rounds.flatMap(r => r.matches)
  .find(m => m.home === home && m.away === away && m.hs != null);

test('playerName: «Apellidos, Nombre» y MAYÚSCULAS de las actas (§3.5)', () => {
  assert.equal(playerName('De La Rosa Perello, Theo'), 'Theo De La Rosa Perello');
  assert.equal(playerName('ALONSO GARCIA, KILIAN JOSE'), 'Kilian Jose Alonso Garcia');
  assert.equal(playerName('GONZÁLEZ LEON, ÁLVARO'), 'Álvaro González Leon');
  assert.equal(playerName('RUIZ DE MARTIN-ESTEBAN DIAZ, FABIO'), 'Fabio Ruiz De Martin-Esteban Diaz');
  assert.equal(playerName('YAHEL ALEJANDRO'), 'Yahel Alejandro');
  assert.equal(playerName('Hmiddouch, Adam'), 'Adam Hmiddouch');
});

test('playerName: la cronología trae el nombre de pila y se deja tal cual', () => {
  for (const name of ['Hugo', 'Luka (p.p.)', 'A. Valencia Gil', 'Papa Djiby']) assert.equal(playerName(name), name);
  assert.equal(playerName(''), '');
  assert.equal(playerName(null), '');
  assert.equal(playerName(undefined), '');
});

test('playerName: en todas las actas congeladas, sin comas, sin MAYÚSCULAS y sin tildes nuevas', () => {
  const letters = s => [...s.toLowerCase().replace(/[\s,]/g, '')].sort().join('');
  const names = new Set();
  for (const entry of Object.values(lineups)) {
    for (const p of [...entry.home, ...entry.away]) names.add(p.n);
    for (const e of entry.events) names.add(e.n);
  }
  assert.ok(names.size >= 100, `solo ${names.size} nombres`);
  for (const raw of names) {
    const out = playerName(raw);
    assert.ok(!out.includes(','), `${raw} → ${out}`);
    assert.ok(!/\p{Lu}{2,}/u.test(out), `${raw} → ${out}`);
    assert.equal(letters(out), letters(raw), `${raw} → ${out}`);
  }
});

test('teamShort: quita siglas y conserva la letra de filial (§3.5)', () => {
  const cases = {
    'UD Las Mesas Huracán': 'Las Mesas Huracán',
    'CF Unión Carrizal': 'Unión Carrizal',
    'AD Huracán': 'Huracán',
    'RC Victoria': 'Victoria',
    'RC Victoria B': 'Victoria B',
    'VICTORIA, REAL CLUB "B"': 'VICTORIA B',
    'Real Club Victoria B': 'Victoria B',
    'Arucas CF B': 'Arucas B',
    'Estrella CF': 'Estrella',
    'CDA El Médano CF': 'El Médano',
    'COTILLO, C.D. EL': 'EL COTILLO',
    'MESAS, U.D. LAS "B"': 'LAS MESAS B',
    'ATISACHI DE FUERTEVENTURA C.F., C.D. "B"': 'ATISACHI DE FUERTEVENTURA B',
    'CORRALEJO B, C.D. "B"': 'CORRALEJO B',
    'EUROPEAN F.U., CD': 'EUROPEAN F.U.',
  };
  for (const [name, short] of Object.entries(cases)) assert.equal(teamShort(name), short, name);
});

test('teamShort: deja igual lo que no lleva siglas y nunca se queda sin letras', () => {
  for (const name of ['Las Mesas Hu.', 'Arucas B', 'Telde', 'Gran Canaria C', 'US Yaiza', 'Playa D.H.', 'CD 35600', 'CD 35600 B']) {
    assert.equal(teamShort(name), name);
  }
});

test('teamShort: «Últimos cinco» de Las Mesas en PG2 (maqueta 4)', () => {
  const played = group('PG2').rounds.flatMap(r => r.matches)
    .filter(m => m.hs != null && (m.home === 'Las Mesas Hu.' || m.away === 'Las Mesas Hu.'))
    .sort((a, b) => a.dateISO.localeCompare(b.dateISO));
  const rivals = played.slice(-5).map(m => teamShort(m.home === 'Las Mesas Hu.' ? m.away : m.home));
  assert.deepEqual(rivals, ['Arucas B', 'Telde', 'Victoria', 'Calero', 'Huracán']);
});

test('timelineFor: Las Mesas–Huracán de PG2 (2–7) no tiene cronología; la 2–9 es de A2 (caso real 7)', () => {
  const pg2 = find('PG2', 'Las Mesas Hu.', 'AD Huracán');
  assert.deepEqual([pg2.dateISO, pg2.hs, pg2.as], ['2026-06-02', 2, 7]);
  assert.equal(timelineFor(pg2, matchDetail, lineups), null);
  // Ni siquiera con el marcador de A2: la entrada es de otro grupo.
  assert.equal(timelineFor({ ...pg2, hs: 2, as: 9 }, matchDetail, lineups), null);
  const a2 = find('A2', 'Las Mesas Hu.', 'AD Huracán');
  const t = timelineFor(a2, matchDetail, lineups);
  assert.equal(t.source, 'futbolaspalmas');
  assert.equal(t.goals.length, 11);
  assert.deepEqual(t.goals[0], { minute: 4, score: '0-1', side: 'away', name: 'Liam' });
  assert.equal(t.mismatch, null);
});

test('timelineFor: «CD Calero|La Garita|1-11» es de FF15 y no del 1-11 de PG2', () => {
  const ff15 = find('FF15', 'CD Calero', 'La Garita');
  const pg2 = find('PG2', 'CD Calero', 'La Garita');
  assert.deepEqual([ff15.hs, ff15.as, pg2.hs, pg2.as], [1, 11, 1, 11]);
  const t = timelineFor(ff15, matchDetail, lineups);
  assert.equal(t.source, 'futbolaspalmas');
  assert.equal(t.goals.length, 12);
  assert.deepEqual(t.goals[0], { minute: 2, score: '0-1', side: 'away', name: 'Luka (p.p.)' });
  assert.equal(timelineFor(pg2, matchDetail, lineups), null);
});

test('timelineFor: con clave repetida ({dup, list}) elige por temporada y grupo', () => {
  const key = 'CD Calero|La Garita|1-11';
  const ff15Entry = matchDetail[key];
  const pg2Entry = { s: '2025-2026', gr: 'PG2', g: ff15Entry.g.map(([m, , score, side, type]) => [m, 'Otro', score, side, type]) };
  const dup = { ...matchDetail, [key]: { dup: true, list: [ff15Entry, pg2Entry] } };
  assert.equal(timelineFor(find('FF15', 'CD Calero', 'La Garita'), dup, lineups).goals[0].name, 'Luka (p.p.)');
  assert.equal(timelineFor(find('PG2', 'CD Calero', 'La Garita'), dup, lineups).goals[0].name, 'Otro');
  const twice = { ...matchDetail, [key]: { dup: true, list: [ff15Entry, ff15Entry] } };
  assert.equal(timelineFor(find('FF15', 'CD Calero', 'La Garita'), twice, lineups), null);
});

test('timelineFor: avisa cuando los goles no cuadran con el marcador', () => {
  // PG2, jornada 5: la cronología de futbolaspalmas da los goles al revés.
  const t = timelineFor(find('PG2', 'RC Victoria', 'Veteranos'), matchDetail, lineups);
  assert.equal(t.source, 'futbolaspalmas');
  assert.deepEqual(t.mismatch, { timeline: '5-2', score: '2-5' });
});

test('timelineFor: goles en propia puerta (tipo o) marcados con (p.p.)', () => {
  const t = timelineFor(find('A1', 'Unión Viera', 'Goleta'), matchDetail, lineups);
  assert.equal(t.goals.length, 19);
  assert.deepEqual(t.goals[0], { minute: 3, score: '1-0', side: 'home', name: 'J. Suarez Rodriguez (p.p.)' });
  assert.equal(t.mismatch, null);
});

test('timelineFor: sin cronología, los goles del acta sin marcador parcial si faltan minutos', () => {
  const m = find('A1', 'Moya', 'Guayarmina');
  const t = timelineFor(m, matchDetail, lineups);
  assert.equal(t.source, 'acta');
  assert.equal(t.goals.length, 14);
  assert.deepEqual(t.goals[0], { minute: 2, score: null, side: 'away', name: 'Liam Garcia Larsen' });
  assert.deepEqual(t.goals[13], { minute: null, score: null, side: 'home', name: 'Álvaro González Leon' });
  assert.equal(t.mismatch, null);
  // El acta con el equipo local cambiado: 20-0 frente al 0-20 oficial.
  assert.deepEqual(timelineFor(find('A1', 'Goleta', 'Arucas'), matchDetail, lineups).mismatch,
    { timeline: '20-0', score: '0-20' });
});

test('timelineFor: acta con todos los minutos, con marcador parcial', () => {
  const t = timelineFor(find('A1', 'UD Valleseco', 'Arucas'), {}, lineups);
  assert.equal(t.source, 'acta');
  assert.deepEqual(t.goals.map(g => [g.minute, g.score, g.side]), [[1, '1-0', 'home'], [30, '1-1', 'away'], [32, '1-2', 'away']]);
});

test('timelineFor: la fuente a veces pone el marcador en lugar del nombre', () => {
  // Entrada real de C3 (Unión Marina 3-1 UD Jinámar, jornada 4).
  const md = { 'Unión Marina|UD Jinámar|3-1': { s: '2025-2026', gr: 'C3', g: [
    [5, 'Marco', '1-0', 'h', 'r'], [11, 'Asier', '1-1', 'a', 'r'], [39, 'Erik', '2-1', 'h', 'r'], [46, '3-1', '3-1', 'h', 'r']] } };
  const match = { season: '2025-2026', groupId: 'C3', home: 'Unión Marina', away: 'UD Jinámar', hs: 3, as: 1 };
  assert.deepEqual(timelineFor(match, md, {}).goals.map(g => g.name), ['Marco', 'Asier', 'Erik', null]);
});

test('timelineFor: sin marcador o sin entrada, null', () => {
  const teguinte = group('PFV2').rounds.flatMap(r => r.matches).find(m => m.home === 'CD Teguinte');
  assert.equal(timelineFor(teguinte, matchDetail, lineups), null);
  assert.equal(timelineFor(find('PG3', 'UD Vecindario', 'CD Ingenio'), {}, {}), null);
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd /home/manolo/claude/futbol-base
node --test scripts/tests/test_rediseno_model_nombres.mjs 2>&1 | grep -E 'SyntaxError|^# (tests|pass|fail)'
```
Esperado:
```text
# SyntaxError: The requested module '../../src/model.js' does not provide an export named 'playerName'
# tests 1
# pass 0
# fail 1
```

- [ ] **Step 3: Write minimal implementation**

El bloque no usa nada de fuera de él ni añade `import`.

Añadir al final de `src/model.js`, tras el bloque de la Tarea 5 y una línea en blanco:

```js
// ─── Nombres (spec §3.5) y cronología (spec §4.5 y §5.3) ─────────────────────

/* «Apellidos, Nombre» → «Nombre Apellidos». Si el texto llega entero en
 * MAYÚSCULAS (actas), cada palabra pasa a mayúscula inicial, también «De» y
 * «La» y cada parte de un compuesto con guion. Nunca añade tildes: solo cambia
 * mayúsculas por minúsculas. El texto con minúsculas se respeta tal cual. */
export function playerName(raw) {
  let text = String(raw ?? '').replace(/\s+/g, ' ').trim();
  const comma = text.indexOf(',');
  if (comma !== -1) {
    text = [text.slice(comma + 1).trim(), text.slice(0, comma).trim()].filter(Boolean).join(' ');
  }
  if (/\p{Lu}/u.test(text) && !/\p{Ll}/u.test(text)) {
    text = text.toLowerCase().replace(/(^|[\s\-.'(])(\p{Ll})/gu, (_, before, letter) => before + letter.toUpperCase());
  }
  return text;
}

const CLUB_ACRONYM = String.raw`(?:U\.?D\.?|C\.?D\.?A?|A\.?D\.?|R\.?C\.?|C\.?F\.?|S\.?D\.?|F\.?C\.?|Real Club|REAL CLUB)`;
const LEADING_ACRONYMS = new RegExp(String.raw`^(?:${CLUB_ACRONYM}\s+)+`);
const TRAILING_ACRONYMS = new RegExp(String.raw`(?:\s+${CLUB_ACRONYM})+$`);

/* Nombre corto para casillas estrechas: quita las siglas del club al
 * principio o al final (UD, CD, AD, RC, CF, C.D., U.D., «Real Club»…) y
 * conserva la letra de filial. La forma de la federación «NOMBRE, C.D. EL "B"»
 * pasa a «EL NOMBRE B»: se queda el artículo y se quita el resto del sufijo.
 * No cambia mayúsculas ni tildes. Si no queda ninguna letra, devuelve el
 * nombre entero («CD 35600»). */
export function teamShort(name) {
  const full = String(name ?? '').replace(/\s+/g, ' ').trim();
  let text = full;
  let filial = '';
  const quoted = text.match(/\s*"([^"]*)"$/);
  if (quoted) {
    if (/^[A-E]$/.test(quoted[1])) filial = quoted[1];
    text = text.slice(0, quoted.index).trim();
  }
  const comma = text.lastIndexOf(',');
  if (comma !== -1) {
    const article = text.slice(comma + 1).trim().match(/(?:^|\s)(EL|LA|LAS|LOS)$/);
    text = (article ? article[1] + ' ' : '') + text.slice(0, comma).trim();
  }
  if (!filial) {
    const letter = text.match(/\s([A-E])$/);
    if (letter) {
      filial = letter[1];
      text = text.slice(0, letter.index);
    }
  }
  text = text.replace(LEADING_ACRONYMS, '').replace(TRAILING_ACRONYMS, '').trim();
  if (!/\p{L}/u.test(text)) return full;
  if (filial && !text.endsWith(' ' + filial)) text += ' ' + filial;
  return text;
}

/* La entrada de la cronología o de las actas que corresponde al partido: la
 * única, o el único elemento de `list`, cuyo (s, gr) es el del partido. */
function entryForMatch(entry, match) {
  if (!entry) return null;
  const list = entry.dup ? entry.list || [] : [entry];
  const hits = list.filter(item => item && item.s === match.season && item.gr === match.groupId);
  return hits.length === 1 ? hits[0] : null;
}

const GOAL_MARK = { o: '(p.p.)', own: '(p.p.)', p: '(p)', penalty: '(p)' };

/* Nombre del goleador para mostrar. La fuente a veces pone el marcador donde
 * va el nombre («0-1»): entonces no hay nombre (null). */
function scorerName(raw, type) {
  const name = playerName(raw);
  if (!name || /^\d+\s*-\s*\d+$/.test(name)) return null;
  const mark = GOAL_MARK[type];
  return mark && !name.includes(mark) ? `${name} ${mark}` : name;
}

/* Goles de un partido (§4.5): la cronología de futbolaspalmas si hay una
 * entrada inequívoca; si no, los goles del acta (sin marcador parcial si le
 * falta algún minuto); si no, null. mismatch compara los goles de cada lado
 * con el marcador: {timeline: 'h-a', score: 'h-a'} si no cuadran. */
export function timelineFor(match, matchDetail, lineups) {
  if (match.hs == null || match.as == null) return null;
  const key = `${match.home}|${match.away}|${match.hs}-${match.as}`;
  const side = s => (s === 'h' ? 'home' : 'away');
  let source, goals;
  const detail = entryForMatch(matchDetail && matchDetail[key], match);
  if (detail) {
    source = 'futbolaspalmas';
    goals = (detail.g || []).map(([minute, name, score, s, type]) => ({
      minute: minute ?? null, score: score || null, side: side(s), name: scorerName(name, type),
    }));
  } else {
    const acta = entryForMatch(lineups && lineups[key], match);
    if (!acta) return null;
    source = 'acta';
    const events = (acta.events || [])
      .map((event, index) => ({ event, index }))
      .filter(({ event }) => event.t === 'goal')
      .sort((a, b) => ((a.event.m ?? Infinity) - (b.event.m ?? Infinity)) || a.index - b.index)
      .map(({ event }) => event);
    const timed = events.every(event => event.m != null);
    let h = 0, a = 0;
    goals = events.map(event => {
      if (event.s === 'h') h += 1; else a += 1;
      return { minute: event.m ?? null, score: timed ? `${h}-${a}` : null, side: side(event.s), name: scorerName(event.n, event.gt) };
    });
  }
  const home = goals.filter(goal => goal.side === 'home').length;
  const away = goals.length - home;
  const mismatch = home === match.hs && away === match.as
    ? null
    : { timeline: `${home}-${away}`, score: `${match.hs}-${match.as}` };
  return { source, goals, mismatch };
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
cd /home/manolo/claude/futbol-base
node --test scripts/tests/test_rediseno_model_nombres.mjs 2>&1 | grep -E '^not ok|^# (tests|pass|fail)'
```
Esperado:
```text
# tests 15
# pass 15
# fail 0
```

- [ ] **Step 5: Suites completas**

```bash
cd /home/manolo/claude/futbol-base
python3 -m pytest scripts/tests/ -q 2>&1 | tail -1
node --test scripts/tests/test_*.mjs 2>&1 | grep -E '^# (tests|pass|fail)'
```
Esperado:
- pytest: el mismo recuento que al terminar la tarea anterior, sin `failed` (esta tarea no añade pruebas de Python).
- node: el recuento anterior más 15, sin fallos (`# fail 0`).

- [ ] **Step 6: Commit**

```bash
cd /home/manolo/claude/futbol-base
git add src/model.js scripts/tests/test_rediseno_model_nombres.mjs
git commit -F - <<'EOF'
feat(rediseño): playerName, teamShort y timelineFor en model.js (B1, tarea 6)

- Nombres según la spec §3.5: «Nombre Apellidos», mayúscula inicial sin
  tildes nuevas, y nombre corto sin siglas que conserva la letra de filial.
- timelineFor (§4.5 y §5.3): la cronología de futbolaspalmas si su entrada
  es inequívoca por temporada y grupo; si no, los goles del acta; y el aviso
  cuando los goles no cuadran con el marcador.

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01Sg56KK3oZgo8Ye7Snj6wG9
EOF
git show --stat --oneline HEAD | tail -1
```
Esperado: `2 files changed`, con `src/model.js` y `scripts/tests/test_rediseno_model_nombres.mjs`.

---

### Task 7: `links.js`: rutas nuevas, enlaces antiguos y `countdownLabel` (spec §4.1 y §4.2.A)

**Contexto**
- **Solo se añade.** `readRoute`, `routeUrl`, `syncRoute`, `matchId`, `fixtureISO` y demás quedan tal cual; el bloque nuevo va al final del fichero y nadie lo importa todavía (la app actual no cambia). La prueba nueva importa `links.js`, que arrastra `state.js` y `config.js` como ya hace `test_portal_features.mjs`, pero ninguna función nueva lee `PORTAL`: la temporada se inyecta.
- **Formato real de los enlaces antiguos.** Los hashes de la prueba se generaron con el `routeUrl` actual y se copian literales (así la prueba sobrevive al corte de B2, cuando `routeUrl` desaparezca con `S`):
  - claves en este orden: `section, cat, season, group, round, q, island, phase, team, match`; espacios como `+`;
  - `season` y `cat` van siempre (`getCurrentSeason()` y `S.cat`);
  - `team` solo aparece en «miequipo» (`FEATURED.name`) o al compartir la ficha de un equipo (`modals.js` ≈631);
  - `match` es `JSON.stringify([local, visitante, jornada])` (`matchId`), al compartir un partido (`modals.js` ≈410); `round` es la clave de `HISTORY` («Jornada 30»).
- **Qué es un enlace antiguo.** El mismo criterio que `init.js` ≈70 (`location.hash.includes('section=')`): un hash que no empieza por `#/` y tiene el parámetro `section`. Lo demás (`''`, `#calendario`, `#group=PG2`, `#/…`) devuelve `null`.
- **Precedencia**, la de `init.js` ≈90-112, donde el partido se abre el último: `match` (con `group`) → `team` → sección. Una sección desconocida es «miequipo» (`readRoute`), es decir, `#/`.
- **Temporada.** `s` solo se escribe si la del enlace no es `PORTAL.season` (el parámetro `season`). Tras activar 2026/27, los enlaces antiguos, que llevan `season=2025-2026`, abren el archivo; los que no la llevan apuntan a la temporada nueva (riesgo aceptado en §4.1).
- **Decisión: categoría.** `c` (el `cat` del enlace) se conserva en `#/ligas` y `#/records`, y en `#/goleadores` solo cuando no hay `g`. La tabla de §4.1 no la muestra, pero sin ella «isla» o «estadísticas» de prebenjamín abrirían la categoría por defecto.
- **`routeHref`.** Orden estable de claves `s, c, i, f, g, r, h, a, t, v, q, to` (el de los ejemplos de la spec: `#/partido?g&r=j&h&a`, `#/ligas?s&c&i&to`, `#/equipo?s&g&t`); las que no están en la lista van detrás por orden alfabético. `encodeURIComponent` (espacio → `%20`). Una pantalla desconocida da `#/`. El parámetro `r` es siempre `Round.key` («Jornada 30», «06-06-2026 ( Final )», «Fase de Grupos»), nunca un número: en los cuadros `n` vale `null`, y los enlaces compartidos tienen que ser estables.
- **`parseRoute`.** `URLSearchParams` (acepta `+` y `%20`, y no lanza con un `%` roto); vacíos fuera; si una clave se repite, gana la primera; solo claves `/^[a-z]+$/`; se ignora lo que venga tras un segundo `#` (ancla).
- **Nombres difíciles** (foco de revisión 2): la ida y vuelta incluye 'MESAS, U.D. LAS "B"', «Pto.del Carmen», «L.Mesas Hu. B» y la clave de ronda «06-06-2026 ( Final )».
- **`countdownLabel`.** Solo fechas ISO válidas; días naturales por `Date.UTC`, así que el cambio de hora de Canarias no le afecta; `todayISO` es el día de hoy en `Atlantic/Canary` que inyecta quien llama. Pasado o fecha no válida → `null`.

**Files:**
- Modify: `src/links.js`: añadir un bloque al final, tras `downloadCalendar` (nada existente cambia).
- Create: `scripts/tests/test_rediseno_links.mjs`.

**Interfaces:**
- Consumes: `readRoute(hash)` de `src/links.js` (legado, sin cambios).
- Produces (contrato):
  - `SCREENS`: `['', 'jornada', 'tabla', 'explorar', 'partido', 'equipo', 'ligas', 'copa', 'goleadores', 'temporadas', 'records', 'fuentes', 'ajustes']`.
  - `parseRoute(hash)` → `{screen, params}`; desconocida → `{screen: '', params: {}}`.
  - `routeHref(screen, params)` → `'#/tabla?g=PG2&v=forma'`, con `r` siempre `Round.key`.
  - `translateLegacy(hash, { season })` → hash nuevo o `null`. El router de B2 lo llama antes de `parseRoute` y, si no es `null`, hace `history.replaceState(null, '', nuevo)`.
  - `countdownLabel(dateISO, todayISO)` → `'hoy' | 'mañana' | 'faltan N días' | null`.

- [ ] **Step 1: Write the failing test**

Crear `scripts/tests/test_rediseno_links.mjs`:

```js
// Rutas nuevas, enlaces antiguos y cuenta atrás (spec §4.1 y §4.2.A).
import test from 'node:test';
import assert from 'node:assert/strict';
import { SCREENS, parseRoute, routeHref, translateLegacy, countdownLabel } from '../../src/links.js';

const SEASON = '2025-2026';

test('SCREENS son las pantallas de la tabla de rutas', () => {
  assert.deepEqual(SCREENS, ['', 'jornada', 'tabla', 'explorar', 'partido', 'equipo', 'ligas', 'copa', 'goleadores', 'temporadas', 'records', 'fuentes', 'ajustes']);
});

test('parseRoute lee pantalla y parámetros; lo desconocido es la portada', () => {
  assert.deepEqual(parseRoute('#/tabla?g=PG2&v=forma'), { screen: 'tabla', params: { g: 'PG2', v: 'forma' } });
  for (const hash of ['#/', '#', '', undefined, null, '#/desconocida?g=PG2', '#/Tabla', '#/tabla/extra', '#section=clasif&group=PG2']) {
    assert.deepEqual(parseRoute(hash), { screen: '', params: {} }, String(hash));
  }
  assert.deepEqual(parseRoute('#/tabla?g=&v=forma'), { screen: 'tabla', params: { v: 'forma' } });
  assert.deepEqual(parseRoute('#/tabla?g=PG2&g=PG3'), { screen: 'tabla', params: { g: 'PG2' } });
  assert.deepEqual(parseRoute('#/equipo?g=PG2&t=Las+Mesas+Hu.'), { screen: 'equipo', params: { g: 'PG2', t: 'Las Mesas Hu.' } });
  assert.deepEqual(parseRoute('#/equipo?s=2025-2026&g=PG2&t=Las%20Mesas%20Hu.#calendario'),
    { screen: 'equipo', params: { s: '2025-2026', g: 'PG2', t: 'Las Mesas Hu.' } });
});

test('routeHref omite vacíos y ordena las claves de forma estable', () => {
  assert.equal(routeHref('tabla', { v: 'forma', g: 'PG2' }), '#/tabla?g=PG2&v=forma');
  assert.equal(routeHref('', {}), '#/');
  assert.equal(routeHref('explorar'), '#/explorar');
  assert.equal(routeHref('tabla', { s: '', g: 'PG2', v: null, r: undefined }), '#/tabla?g=PG2');
  assert.equal(routeHref('partido', { a: 'AD Huracán', h: 'Las Mesas Hu.', r: 'Jornada 30', g: 'PG2', s: '2024-2025' }),
    '#/partido?s=2024-2025&g=PG2&r=Jornada%2030&h=Las%20Mesas%20Hu.&a=AD%20Hurac%C3%A1n');
  assert.equal(routeHref('ligas', { to: 'tabla', f: 'segunda-fase-a', i: 'grancanaria', c: 'benjamin', s: SEASON }),
    '#/ligas?s=2025-2026&c=benjamin&i=grancanaria&f=segunda-fase-a&to=tabla');
  // `r` es siempre Round.key («Jornada 3», «06-06-2026 ( Final )»), nunca un número.
  assert.equal(routeHref('jornada', { g: 'PG2', r: 'Jornada 3' }), '#/jornada?g=PG2&r=Jornada%203');
  assert.equal(routeHref('desconocida', { g: 'PG2' }), '#/');
});

test('ida y vuelta de cada ruta de §4.1, con nombres difíciles', () => {
  const routes = [
    ['', {}],
    ['jornada', { s: SEASON, g: 'PG2', r: 'Jornada 30' }],
    ['tabla', { s: SEASON, g: 'PG2', v: 'forma' }],
    ['explorar', { s: '2024-2025', q: 'Unión & Sur' }],
    ['partido', { s: SEASON, g: 'PFV2', r: '14', h: 'ATISACHI DE FUERTEVENTURA C.F., C.D. "B"', a: 'CD Herbania' }],
    ['equipo', { s: SEASON, g: 'B2', t: 'Inter/Pilar' }],
    ['ligas', { s: SEASON, c: 'prebenjamin', i: 'lanzarote', f: 'maspalomas', to: 'jornada' }],
    ['copa', { s: SEASON, g: 'MCPK1' }],
    ['goleadores', { s: SEASON, c: 'benjamin', g: 'A2', t: 'Corazón Mª', q: '50% + 1 #9 ¿?=&' }],
    ['temporadas', {}],
    ['records', { s: '2023-2024', c: 'benjamin' }],
    ['fuentes', {}],
    ['ajustes', {}],
    ['equipo', { s: SEASON, g: 'FV11', t: 'VET“C” SA-COR' }],
    ['equipo', { s: SEASON, g: 'FF13', t: 'L.Mesas Hu. B' }],
    ['equipo', { s: SEASON, g: 'B2', t: 'MESAS, U.D. LAS "B"' }],
    ['equipo', { s: SEASON, g: 'LZ1', t: 'Pto.del Carmen' }],
    ['jornada', { s: SEASON, g: 'BCA1', r: '06-06-2026 ( Final )' }],
  ];
  assert.deepEqual([...new Set(routes.map(([screen]) => screen))].sort(), [...SCREENS].sort());
  for (const [screen, params] of routes) {
    const href = routeHref(screen, params);
    assert.match(href, /^#\/[a-z]*(\?[^#\s]*)?$/, href);
    assert.deepEqual(parseRoute(href), { screen, params }, href);
  }
});

test('enlaces antiguos: cada fila de la tabla de §4.1 (hashes reales de routeUrl)', () => {
  const cases = [
    ['#section=miequipo&cat=prebenjamin&season=2025-2026', '#/'],
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
  assert.equal(t('#section=otra&group=PG2'), '#/');
  assert.equal(t('#section=clasif&season=..%2F..%2Fmal&group=PG2'), '#/tabla?g=PG2');
  for (const hash of ['#/tabla?g=PG2', '#/', '', '#', undefined, '#calendario', '#group=PG2']) assert.equal(t(hash), null, String(hash));
});

test('cada enlace antiguo traducido es una ruta nueva válida', () => {
  const legacy = ['#section=stats', '#section=isla&island=fuerteventura', '#section=goleadores&group=PG3',
    '#section=jornadas&group=PG2&match=%5B%22Las+Mesas+Hu.%22%2C%22AD+Hurac%C3%A1n%22%2C%22Jornada+30%22%5D'];
  assert.deepEqual(legacy.map(hash => parseRoute(translateLegacy(hash, { season: SEASON })).screen), ['records', 'ligas', 'goleadores', 'partido']);
});

test('countdownLabel: hoy, mañana, faltan N días; nada si ya pasó o la fecha no es válida', () => {
  assert.equal(countdownLabel('2026-09-23', '2026-09-23'), 'hoy');
  assert.equal(countdownLabel('2026-09-24', '2026-09-23'), 'mañana');
  assert.equal(countdownLabel('2026-09-26', '2026-09-23'), 'faltan 3 días');
  assert.equal(countdownLabel('2027-01-02', '2026-12-31'), 'faltan 2 días');
  assert.equal(countdownLabel('2026-10-26', '2026-10-24'), 'faltan 2 días');
  for (const [date, today] of [['2026-09-22', '2026-09-23'], [null, '2026-09-23'], ['por confirmar', '2026-09-23'],
    ['2026-02-31', '2026-02-01'], ['2026-13-01', '2026-09-23'], ['24/09', '2026-09-23'], ['2026-09-24', '']]) {
    assert.equal(countdownLabel(date, today), null, `${date} / ${today}`);
  }
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd /home/manolo/claude/futbol-base
node --test scripts/tests/test_rediseno_links.mjs 2>&1 | grep -E 'SyntaxError|^# (pass|fail)'
```
Esperado:
```text
# SyntaxError: The requested module '../../src/links.js' does not provide an export named 'SCREENS'
# pass 0
# fail 1
```

- [ ] **Step 3: Write minimal implementation**

Añadir al final de `src/links.js`, después de la llave que cierra `downloadCalendar` y dejando una línea en blanco antes:

```js
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
// `season` es PORTAL.season: la temporada del enlace solo se escribe si es otra.
// Un enlace nunca cambia mi equipo: 'miequipo' con equipo abre su ficha.
function legacyMatch(value) {
  try {
    const match = JSON.parse(value);
    return Array.isArray(match) && match.length === 3 && match.every(v => typeof v === 'string') && match[0] && match[1] ? match : null;
  } catch { return null; }
}

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
  switch (route.section) {
    case 'clasif': return routeHref('tabla', { s, g });
    case 'jornadas': return routeHref('jornada', { s, g, r: route.round });
    case 'goleadores': return routeHref('goleadores', { s, c: g ? '' : c, g });
    case 'isla': return routeHref('ligas', { s, c, i: route.island });
    case 'stats': return routeHref('records', { s, c });
    default: return '#/';
  }
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
```

- [ ] **Step 4: Run test to verify it passes**

```bash
cd /home/manolo/claude/futbol-base
node --test scripts/tests/test_rediseno_links.mjs 2>&1 | grep -E '^# (tests|pass|fail)'
```
Esperado:
```text
# tests 8
# pass 8
# fail 0
```

- [ ] **Step 5: Suites completas**

```bash
cd /home/manolo/claude/futbol-base
python3 -m pytest scripts/tests/ -q 2>&1 | tail -1
node --test scripts/tests/test_*.mjs 2>&1 | grep -E '^# (tests|pass|fail)'
```
Esperado:
- pytest: el mismo recuento que al terminar la tarea anterior, sin `failed` (esta tarea no añade pruebas de Python).
- node: el recuento anterior más 8, sin fallos (`# fail 0`). `test_portal_features.mjs`, que usa `readRoute`, `routeUrl` y `matchId`, sigue en verde.

- [ ] **Step 6: Commit**

```bash
cd /home/manolo/claude/futbol-base
git add src/links.js scripts/tests/test_rediseno_links.mjs
git commit -F - <<'EOF'
feat(rediseño): rutas nuevas, enlaces antiguos y cuenta atrás en links.js (B1, tarea 7)

links.js solo gana exportaciones: readRoute, routeUrl y el resto no cambian
y la app actual no importa nada nuevo.

- SCREENS, parseRoute y routeHref: rutas '#/<pantalla>?<parámetros>' con
  orden estable de claves y sin vacíos (spec §4.1).
- translateLegacy: cada fila de la tabla de enlaces antiguos de §4.1, con
  hashes reales de routeUrl. Un enlace nunca cambia mi equipo; la temporada
  solo se escribe si no es la del portal; la categoría se conserva donde la
  ruta nueva la admite.
- countdownLabel: 'hoy', 'mañana' o 'faltan N días'; null si ya pasó.

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01Sg56KK3oZgo8Ye7Snj6wG9
EOF
git show --stat --oneline HEAD | tail -1
```
Esperado: `2 files changed`, con `src/links.js` y `scripts/tests/test_rediseno_links.mjs`.

---

### Task 8: `myteam.js`: identidad de club, `resolveMyTeam`, `updatedMyTeam` y `summerCups` (spec §6.1, §6.3 y §6.4)

**Contexto**
- **Nombres reales en las fixtures:**
  - «Las Mesas Hu.» en A2 (Segunda Fase A), FF5 (Primera Fase GC) y PG2; «Las Mesas Hu. B» solo en FF13; «Las Mesas B» solo en B2 (Segunda Fase B); «AD Huracán» en FF9, A2 y PG2.
  - «Santa Brígida» en FF9 (Primera Fase GC) y, en la Segunda Fase B, con el mismo nombre en B1 y en B2; también en PG2 (prebenjamín).
  - En la Maspalomas, «UD Las Mesas Huracán» juega MCP3 (3.º del Grupo C) y MCPK1 en prebenjamín, y MCB16 y MCBK2 en benjamín. «AD Huracán A» y «AD Huracán B» juegan MCBK2.
  - El 23/09/2026 no queda nada pendiente en ningún grupo de las fixtures: FF5, FF9 y FF13 acabaron en noviembre de 2025 (FF9 y FF13, el 08/11), A2 y B2 el 23/05/2026, B1 el 26/05/2026 y PG2 el 06/06/2026. La Segunda Fase empieza el 28/11/2025.
- **Escudos reales** (`data-shields.js`):
  - `lasMesasEscudo.png` ← «Las Mesas Hu.», «Las Mesas B», «L.Mesas Hu. B» y 'MESAS, U.D. LAS "B"';
  - `victoria.png` ← «RC Victoria»; `victoria2019.png` ← «RC Victoria B» y «RC Victoria C»;
  - `huracan.png` ← «AD Huracán» y «Huracán B»;
  - «UD Las Mesas Huracán» no tiene escudo, ni exacto ni normalizado.
- **`shields.json` trae también** «L.Mesas Hu. B», 'MESAS, U.D. LAS "B"' y «RC Victoria B», que no juegan en ningún grupo congelado: la Tarea 1 añade todas las claves que comparten fichero con un nombre de las fixtures, y su prueba lo fija.
- **El par real de Lanzarote:** «US Yaiza» (LZ1) y «US Yaiza B» (LZ4), los dos en `data-benjamin.js` tras §9.4. Comparten `yaiza.png` y clave base. Se prueba además «Pto.del Carmen» (LZ1) y «Pto. del Carmen B» (LZ4): escudos distintos (`puertocarmen.png` y `puertodelCarmenEscudo.png`), así que solo los une la clave base, como a RC Victoria.
- **Arista de escudo: exacto o normalizado** (`normalizeTeamName`, el primer nombre normalizado gana), igual que los pasos 1 y 2 de `teamBadge`. **Nunca la subcadena** (paso 3; restricción global «Escudos»): hoy `teamBadge('UD Las Mesas Huracán')` devuelve `huracan.png`, y esa arista uniría Las Mesas con AD Huracán.
- **`baseKey`:** `normalizeForTeamsMapping` ya quita `cf, cd, ud, ad, sd, sc, sad, ef, cp, ce, fc, club, deportivo, atletico, union…`; se quitan además `rc, us, cda, cef`, y después la última letra suelta `[a-e]`. Una clave vacía (p. ej. «Atlético») no crea arista.
- **Comprobación sobre todo el universo real** (386 nombres de la base en 5 temporadas, 298 claves de `SHIELDS` y 88 nombres de la Maspalomas; 526 en total):
  - salen 230 clubes y el mayor tiene 12 nombres (Gran Canaria y Atlético G.C.);
  - Las Mesas tiene 6 nombres; AD Huracán tiene 4 («AD Huracán», «AD Huracán A», «AD Huracán B» y «Huracán B»);
  - «Atco. Huracán» (2021-24) queda aparte;
  - no se ha visto ninguna fusión falsa.
- **Nombres fuera del índice.** Un nombre que no está en el universo, como el de una temporada no cargada, se relaciona por sus claves (escudo, clave base y alias) sin modificar el índice.
- **Fase más reciente:** el nivel sale de `competitionKey(group, group.season).phase`, llamado con el `Group` normalizado, que trae `id, name, fullName, phase, island` y `cat`.
  - Nivel 2: `segunda-fase`, `segunda-a` a `segunda-e`, `fase-2`, `oro`, `plata` y `bronce`.
  - Nivel 1: todo lo demás (`primera-fase`, `fase-1` y `null`). Así, una liga de fase única (PG2, `null`) o de división no se descarta frente a una Primera Fase.
  - Si hay grupos del club con partidos pendientes, cuentan solo esos, y de ellos los de la fase más alta (decisión 11).
  - Solo cuentan los partidos que no son contra retirados (`retiredTeams`).
  - Un candidato por grupo y nombre: Santa Brígida, que está en B1 y en B2, son dos candidatos (decisión 11).
- **Paso 0 cuando el grupo guardado ya no tiene pendientes** (decisiones 10 a 12, 16 y 17). Cuentan los equipos del club en los grupos de liga de la categoría: los de la fase del guardado y los de la fase posterior (nivel mayor), hayan terminado o no. Los de la misma fase nunca son candidatos:
  - con menos equipos del club en la fase posterior que en la del guardado (sin contar los retirados de la fase del guardado), esa fase aún no está publicada entera para el club: sigue el grupo guardado, sin cambiar ni preguntar (decisión 16). Así FF5 «Las Mesas Hu.» el 08/11/2025, con FF13 aún jugando y la Segunda Fase sin publicar, no recibe una pregunta falsa por «Las Mesas Hu. B»; y con solo uno de A2 y B2 publicado, ni FF5 ni FF13 cambian ni preguntan;
  - el nombre exacto en un solo grupo: se pasa a él en silencio (FF5 → A2, también a final de temporada);
  - en varios: se pregunta por esos grupos (FF9 Santa Brígida → B1 o B2);
  - el nombre exacto en dos grupos de la fase guardada: son dos equipos distintos y se pregunta con los equipos del club en la fase posterior (decisión 17; CD Batán en FF10 y FF12 → «CD Batán» o «CD Batán B» de C2);
  - sin el nombre exacto, pero con otros equipos del club: se pregunta por ellos (FF13 «Las Mesas Hu. B» → A2 o B2, también a final de temporada);
  - si no, sigue el grupo guardado.
- **Un filial retirado no cuenta.** En FV11, 'CORRALEJO, C.D. "B"' se retiró y nunca aparecerá en la fase posterior: si contara, «CD Corralejo» se quedaría en FV11 toda la temporada, aunque juega en FP. Sin él, pasa a FP (decisión 16). La prueba lo reproduce con «Las Mesas Hu. B» retirado en FF13.
- **Santa Brígida en las fixtures.** Su filial «Santa Brígida B» juega FF3, que las fixtures no traen. Con ellas, FF9 es el único equipo del club en la Primera Fase y, con solo B1 publicado, pasa a B1 en silencio. La prueba de la decisión 16 la pone en FF15 (en la fuente está en FF3), y entonces FF9 espera a B1 y B2 y pregunta.
- **`updatedMyTeam(myTeam, resolution)`**: el `myTeam` nuevo si una resolución `ok` cambia algo, o `null`. B2 lo guarda, para que el cambio de fase no dependa de que la familia abra la app en el momento justo.
- **Pasos 1 y 2 con un solo candidato:** se usa sin preguntar solo si tiene el mismo nombre y la misma categoría (decisión 13): «Balos B» → «Balos», o «Las Mesas Hu.» de prebenjamín con el club solo en benjamín, preguntan.
- **Verano solo de su temporada:** `summerCups` devuelve `[]` si `cups.season` no es `myTeam.season`, para no enseñar los torneos de 2025-26 bajo «Así terminó 2026/27».
- **`resolveMyTeam` no recibe `portalSeason`** (decisión 4). `season` es la `Season` de `PORTAL.season`, y `season.name` hace de `PORTAL.season` en los pasos 0 y 1.
- **Paso 2 con 0 candidatos → `absent`.** «En cualquier otro caso, se pregunta» se aplica cuando hay candidatos.
- **Grupo guardado que no es de liga o no existe** (un favorito v1 de la Maspalomas, que `migrateV1` devuelve tal cual según la decisión 9, o una copa): paso 2, sin lanzar. La prueba lo cubre con `MCP3`.
- **Temporadas simuladas.** Se construyen en las pruebas a partir de las fixtures, con el ayudante `scripts/tests/fixtures/rediseno/simulate.mjs` de la Tarea 5, al que esta tarea añade dos funciones:
  - `currentAt(hoy)` (Tarea 5): la temporada congelada tal como estaba ese día. Los partidos de ese día en adelante pierden el marcador y quedan pendientes.
  - `nextSeasonRaw({benjamin, prebenjamin})`: 2026-2027 con los grupos elegidos, las mismas jornadas un año después, sin marcadores y con la clasificación a cero.
  - `teamNames(...)`: todos los nombres de uno o varios `Season`/`Cups`.
  - Todas copian con `structuredClone` antes de tocar nada.

**Files:**
- Create: `src/myteam.js`.
- Modify: `scripts/tests/fixtures/rediseno/simulate.mjs`: se añaden `nextSeasonRaw` y `teamNames`.
- Create: `scripts/tests/test_rediseno_myteam.mjs`.

**Interfaces:**
- Consumes:
  - `normalizeForTeamsMapping` y `normalizeTeamName` de `src/state.js`, que la spec §5.2 mantiene tras el corte;
  - `matchState`, `retiredTeams` y `competitionKey` de `src/model.js` (Tareas 3, 4 y 5);
  - `buildSeason`, `buildCups`, `matchState` y `retiredTeams` (Tareas 3 y 5), `fixture(name)` (Tarea 1) y `currentAt` (Tarea 5), en la prueba.
- Produces, en `simulate.mjs`: `nextSeasonRaw({ benjamin = [], prebenjamin = [] })` → un crudo `{season: '2026-2027', benjamin, prebenjamin, history}` para `buildSeason`, y `teamNames(...collections)` → `string[]`.
- Produces, en `src/myteam.js`:
  - `TEAM_ALIASES`: `{ 'UD Las Mesas Huracán': 'Las Mesas Hu.' }`.
  - `baseKey(name)`.
  - `buildClubIndex(names, shields = {}, aliases = TEAM_ALIASES)` → `{ same(a, b), members(name) }`. El universo son `names`, las claves de `shields` y los dos lados de `aliases`. `members` devuelve los nombres del club, incluido el propio, ordenados con `localeCompare('es')`.
  - `sameClub(index, a, b)`.
  - `resolveMyTeam(myTeam, season, index, todayISO)` → `{status: 'ok', group, name, cat}` | `{status: 'ask', candidates: [{group, name, cat}]}` | `{status: 'absent'}`. Los candidatos salen en el orden de `season.groups`, primero los de `myTeam.cat`.
  - `updatedMyTeam(myTeam, resolution)` → `{name, season, cat, groupId}` si una resolución `ok` cambia algo; si no, `null`.
  - `summerCups(cups, myTeam, index)` → `[{group, rows: Match[]}]`, solo de `myTeam.cat` y solo si `cups.season === myTeam.season`, en el orden de `cups.groups` y con las filas en el orden de las rondas.

- [ ] **Step 1: Write the failing test**

Las dos funciones nuevas usan `fixture` e `iso`, que `simulate.mjs` ya tiene desde la Tarea 5.

Añadir al final de `scripts/tests/fixtures/rediseno/simulate.mjs`, tras una línea en blanco:

```js
// 2026-2027 simulada con grupos congelados: mismas jornadas un año después, sin marcadores
// y con la clasificación a cero en el orden de la fuente.
export function nextSeasonRaw({ benjamin = [], prebenjamin = [] }) {
  const raw = structuredClone(fixture('current-2025-2026'));
  const pick = (groups, ids) => ids.map(id => groups.find(group => group.id === id));
  const out = { season: '2026-2027', benjamin: pick(raw.benjamin, benjamin), prebenjamin: pick(raw.prebenjamin, prebenjamin), history: {} };
  for (const group of [...out.benjamin, ...out.prebenjamin]) {
    group.jornada = 'Jornada 1';
    group.matches = [];
    group.standings = group.standings.map(([pos, team]) => [pos, team, 0, 0, 0, 0, 0, 0, 0, 0]);
    out.history[group.id] = Object.fromEntries(Object.entries(raw.history[group.id]).map(([key, rows]) => [key, rows.map(row => {
      const date = iso(row[0]);
      return [date && `${Number(date.slice(0, 4)) + 1}${date.slice(4)}`, row[1], row[2], null, null, ...row.slice(5)];
    })]));
  }
  return out;
}

// Todos los nombres de equipo de temporadas y torneos ya construidos (Season o Cups).
export function teamNames(...collections) {
  const names = new Set();
  for (const { groups } of collections) {
    for (const group of groups) {
      for (const row of group.standings) names.add(row.team);
      for (const round of group.rounds) for (const match of round.matches) { names.add(match.home); names.add(match.away); }
    }
  }
  return [...names];
}
```

Crear `scripts/tests/test_rediseno_myteam.mjs`:

```js
// Identidad de club, resolución de mi equipo y verano (spec §6), con datos reales congelados.
import test from 'node:test';
import assert from 'node:assert/strict';
import { fixture } from './fixtures/rediseno/load.mjs';
import { currentAt, nextSeasonRaw, teamNames } from './fixtures/rediseno/simulate.mjs';
import { buildSeason, buildCups, matchState, retiredTeams } from '../../src/model.js';
import { TEAM_ALIASES, baseKey, buildClubIndex, sameClub, resolveMyTeam, summerCups, updatedMyTeam } from '../../src/myteam.js';

const shields = fixture('shields');
const season = raw => buildSeason({ name: raw.season, current: true, ...raw });
const real = season(fixture('current-2025-2026'));
const cups = buildCups({ season: '2025-2026', ...fixture('cups-2025-2026') });
const index = buildClubIndex(teamNames(real, cups), shields);
const TODAY = '2026-09-23';
const LAS_MESAS_PG2 = { name: 'Las Mesas Hu.', season: '2025-2026', cat: 'prebenjamin', groupId: 'PG2' };
const summary = result => result.status === 'ask'
  ? { status: 'ask', candidates: result.candidates.map(c => `${c.group.id}|${c.name}`).sort() }
  : result.status === 'ok' ? { status: 'ok', group: `${result.group.season}|${result.group.id}`, name: result.name, cat: result.cat } : result;

test('baseKey quita siglas y la letra de filial final', () => {
  assert.equal(baseKey('Las Mesas Hu.'), 'las mesas hu');
  assert.equal(baseKey('Las Mesas Hu. B'), 'las mesas hu');
  assert.equal(baseKey('RC Victoria'), 'victoria');
  assert.equal(baseKey('RC Victoria B'), 'victoria');
  assert.equal(baseKey('US Yaiza B'), 'yaiza');
  assert.equal(baseKey('MESAS, U.D. LAS "B"'), 'mesas las');
  assert.equal(baseKey('AD Huracán'), 'huracan');
  assert.equal(baseKey('UD Las Mesas Huracán'), 'las mesas huracan');
  assert.equal(baseKey('Arucas CF D'), 'arucas');
});

test('el alias de la Maspalomas es el de la spec', () => {
  assert.deepEqual(TEAM_ALIASES, { 'UD Las Mesas Huracán': 'Las Mesas Hu.' });
});

test('Las Mesas: los cinco nombres reales son el mismo club', () => {
  const names = ['Las Mesas Hu.', 'Las Mesas Hu. B', 'L.Mesas Hu. B', 'Las Mesas B', 'UD Las Mesas Huracán'];
  for (const a of names) for (const b of names) assert.ok(sameClub(index, a, b), `${a} ~ ${b}`);
  assert.ok(index.members('Las Mesas B').includes('MESAS, U.D. LAS "B"'));
});

test('RC Victoria y RC Victoria B son el mismo club aunque el escudo las separa', () => {
  assert.equal(shields['RC Victoria'], 'victoria.png');
  assert.equal(shields['RC Victoria B'], 'victoria2019.png');
  assert.ok(sameClub(index, 'RC Victoria', 'RC Victoria B'));
});

test('filiales reales de Lanzarote (LZ1 y LZ4): US Yaiza y Pto.del Carmen', () => {
  const byName = buildClubIndex(['US Yaiza', 'US Yaiza B', 'Pto.del Carmen', 'Pto. del Carmen B']);
  assert.ok(sameClub(byName, 'US Yaiza', 'US Yaiza B'));
  assert.ok(sameClub(byName, 'Pto.del Carmen', 'Pto. del Carmen B'));
  assert.ok(!sameClub(byName, 'US Yaiza', 'Pto.del Carmen'));
  const byShield = buildClubIndex([], { 'US Yaiza': 'yaiza.png', 'US Yaiza B': 'yaiza.png', 'UNION SUR YAIZA, C.D.': 'yaiza.png' });
  assert.ok(sameClub(byShield, 'US Yaiza B', 'UNION SUR YAIZA, C.D.'));
});

test('Las Mesas Hu. y AD Huracán son clubes distintos, también a través de UD Las Mesas Huracán', () => {
  assert.ok(sameClub(index, 'AD Huracán', 'AD Huracán A'));
  for (const name of ['Las Mesas Hu.', 'UD Las Mesas Huracán', 'Las Mesas B']) {
    assert.ok(!sameClub(index, name, 'AD Huracán'), name);
    assert.ok(!sameClub(index, name, 'AD Huracán B'), name);
  }
  assert.ok(!index.members('UD Las Mesas Huracán').includes('AD Huracán'));
});

test('un nombre fuera del índice se relaciona por sus claves y una clave base vacía no une nada', () => {
  const partial = buildClubIndex(['Las Mesas Hu.', 'Las Mesas B'], { 'Las Mesas Hu.': 'lasMesasEscudo.png', 'Las Mesas B': 'lasMesasEscudo.png' });
  assert.ok(sameClub(partial, 'Las Mesas Hu. B', 'Las Mesas B'));
  assert.ok(!sameClub(partial, 'Las Mesas Hu. B', 'AD Huracán'));
  const empty = buildClubIndex(['Atlético', 'Club Deportivo']);
  assert.equal(baseKey('Atlético'), '');
  assert.ok(!sameClub(empty, 'Atlético', 'Club Deportivo'));
});

test('caso 2: PG2 Las Mesas Hu., también en A2 y FF5, se resuelve sin pregunta (paso 0)', () => {
  assert.deepEqual(summary(resolveMyTeam(LAS_MESAS_PG2, real, index, TODAY)),
    { status: 'ok', group: '2025-2026|PG2', name: 'Las Mesas Hu.', cat: 'prebenjamin' });
  const march = season(currentAt('2026-03-01'));
  assert.equal(summary(resolveMyTeam(LAS_MESAS_PG2, march, index, '2026-03-01')).group, '2025-2026|PG2');
});

test('cambio de fase: FF5 terminado y A2 con partidos pendientes pasa a A2 en silencio', () => {
  const march = season(currentAt('2026-03-01'));
  const myTeam = { name: 'Las Mesas Hu.', season: '2025-2026', cat: 'benjamin', groupId: 'FF5' };
  assert.deepEqual(summary(resolveMyTeam(myTeam, march, index, '2026-03-01')),
    { status: 'ok', group: '2025-2026|A2', name: 'Las Mesas Hu.', cat: 'benjamin' });
});

test('caso 2b: FF13 Las Mesas Hu. B terminado y B2 con Las Mesas B pendiente → pregunta', () => {
  const march = season(currentAt('2026-03-01'));
  const myTeam = { name: 'Las Mesas Hu. B', season: '2025-2026', cat: 'benjamin', groupId: 'FF13' };
  assert.deepEqual(summary(resolveMyTeam(myTeam, march, index, '2026-03-01')),
    { status: 'ask', candidates: ['A2|Las Mesas Hu.', 'B2|Las Mesas B'] });
  // Con la temporada terminada también pregunta: la portada no se queda en FF13, de noviembre.
  assert.deepEqual(summary(resolveMyTeam(myTeam, real, index, TODAY)),
    { status: 'ask', candidates: ['A2|Las Mesas Hu.', 'B2|Las Mesas B'] });
});

test('candidatos por fase más reciente: con FF5, A2, FF13, B2 y PG2 salen 3 (A2, B2 y PG2)', () => {
  const fromLastSeason = { name: 'Las Mesas Hu. B', season: '2024-2025', cat: 'benjamin', groupId: 'P9' };
  assert.deepEqual(summary(resolveMyTeam(fromLastSeason, real, index, TODAY)),
    { status: 'ask', candidates: ['A2|Las Mesas Hu.', 'B2|Las Mesas B', 'PG2|Las Mesas Hu.'] });
});

test('caso 3: 2026/27 con Las Mesas Hu. solo en prebenjamín y Las Mesas B en benjamín → una pregunta', () => {
  const next = season(nextSeasonRaw({ benjamin: ['A1', 'B2', 'FF15'], prebenjamin: ['PG2', 'PG3'] }));
  const nextIndex = buildClubIndex(teamNames(next), shields);
  const first = resolveMyTeam(LAS_MESAS_PG2, next, nextIndex, '2026-10-01');
  assert.deepEqual(summary(first), { status: 'ask', candidates: ['B2|Las Mesas B', 'PG2|Las Mesas Hu.'] });
  // La respuesta fija {season, cat, groupId, name}: en la carga siguiente no se vuelve a preguntar.
  const chosen = first.candidates.find(c => c.group.id === 'PG2');
  const answer = { name: chosen.name, season: chosen.group.season, cat: chosen.cat, groupId: chosen.group.id };
  assert.deepEqual(summary(resolveMyTeam(answer, next, nextIndex, '2026-10-01')),
    { status: 'ok', group: '2026-2027|PG2', name: 'Las Mesas Hu.', cat: 'prebenjamin' });
});

test('caso 2 con 2026/27 activada: paso 1; un solo candidato se usa y ninguno es ausente', () => {
  const onlyPG2 = season(nextSeasonRaw({ benjamin: ['A1'], prebenjamin: ['PG2'] }));
  assert.deepEqual(summary(resolveMyTeam(LAS_MESAS_PG2, onlyPG2, buildClubIndex(teamNames(onlyPG2), shields), '2026-10-01')),
    { status: 'ok', group: '2026-2027|PG2', name: 'Las Mesas Hu.', cat: 'prebenjamin' });
  const without = season(nextSeasonRaw({ benjamin: ['A1'], prebenjamin: ['PG3'] }));
  assert.deepEqual(resolveMyTeam(LAS_MESAS_PG2, without, buildClubIndex(teamNames(without), shields), '2026-10-01'), { status: 'absent' });
});

test('paso 2: un grupo guardado de torneo pregunta si el candidato se llama distinto', () => {
  const fromCup = { name: 'UD Las Mesas Huracán', season: '2025-2026', cat: 'prebenjamin', groupId: 'MCP3' };
  assert.deepEqual(summary(resolveMyTeam(fromCup, real, index, TODAY)), { status: 'ask', candidates: ['PG2|Las Mesas Hu.'] });
  const sameName = { ...LAS_MESAS_PG2, groupId: 'MCP3' };
  assert.equal(summary(resolveMyTeam(sameName, real, index, TODAY)).group, '2025-2026|PG2');
});

test('caso 8: el verano de PG2 Las Mesas son MCP3 y MCPK1, nunca los torneos de benjamín', () => {
  const summer = summerCups(cups, LAS_MESAS_PG2, index);
  assert.deepEqual(summer.map(entry => entry.group.id), ['MCP3', 'MCPK1']);
  const line = m => `${m.home} ${m.hs}-${m.as} ${m.away}`;
  assert.deepEqual(summer[0].rows.map(line), [
    'UD Las Mesas Huracán 1-4 Real Club Victoria',
    'Arucas CF 2-4 UD Las Mesas Huracán',
    'UD Las Mesas Huracán 2-3 CDA El Médano CF',
  ]);
  assert.deepEqual(summer[1].rows.map(line), [
    'CD Tablero 1-4 UD Las Mesas Huracán',
    'UD Las Mesas Huracán 1-1 CF Unión Carrizal',
    'UD Las Mesas Huracán 2-4 CD Maspa Training A',
  ]);
  assert.equal(summer[1].rows[1].advancer, 'home');
  assert.equal(summer[1].rows[1].shootout, '3-2');
  const benjamin = summerCups(cups, { ...LAS_MESAS_PG2, cat: 'benjamin', groupId: 'A2' }, index);
  assert.deepEqual(benjamin.map(entry => entry.group.id), ['MCB16', 'MCBK2']);
  assert.deepEqual(summerCups(cups, { name: 'AD Huracán', season: '2025-2026', cat: 'prebenjamin', groupId: 'PG2' }, index), []);
});

test('decisión 10: FF5 Las Mesas Hu. el 08/11/2025, con la Segunda Fase sin publicar, sigue en FF5 sin preguntar por FF13', () => {
  const raw = currentAt('2025-11-08');
  raw.benjamin = raw.benjamin.filter(g => g.id.startsWith('FF'));
  const ff5 = { name: 'Las Mesas Hu.', season: '2025-2026', cat: 'benjamin', groupId: 'FF5' };
  assert.deepEqual(summary(resolveMyTeam(ff5, season(raw), index, '2025-11-08')),
    { status: 'ok', group: '2025-2026|FF5', name: 'Las Mesas Hu.', cat: 'benjamin' });
});

test('decisión 10: 2025-26 día a día, nadie de las fixtures recibe una pregunta por un equipo de su misma fase', () => {
  // Cada día desde el 01/11/2025 (el primer grupo acaba el 07/11), sin los marcadores de ese día
  // en adelante y solo con los grupos que ya han empezado: la fase siguiente no está publicada
  // hasta su primer partido. Solo puede preguntar el equipo cuyo grupo ya no tiene pendientes.
  const first = Object.fromEntries(real.groups.map(g => [g.id, g.rounds.map(r => r.dateFrom).filter(Boolean).sort()[0]]));
  const samePhase = [];
  let asks = 0;
  for (let t = Date.UTC(2025, 10, 1); t <= Date.UTC(2026, 5, 10); t += 86400000) {
    const day = new Date(t).toISOString().slice(0, 10);
    const raw = currentAt(day);
    for (const cat of ['benjamin', 'prebenjamin']) raw[cat] = raw[cat].filter(g => first[g.id] <= day);
    const built = season(raw);
    for (const g of built.groups) {
      const retired = retiredTeams(g);
      const open = g.rounds.some(r => r.matches.some(m => !retired.has(m.home) && !retired.has(m.away)
        && matchState(m, day) === 'pendiente'));
      if (open) continue;
      for (const { team } of g.standings) {
        const res = resolveMyTeam({ name: team, season: '2025-2026', cat: g.cat, groupId: g.id }, built, index, day);
        if (res.status !== 'ask') continue;
        asks += 1;
        if (res.candidates.some(c => c.group.compKey === g.compKey)) samePhase.push(`${day} ${g.id} ${team}`);
      }
    }
  }
  assert.deepEqual(samePhase, []);
  assert.ok(asks > 0, 'la filial que cambia de nombre (FF13 → B2) sí pregunta');
});

test('decisión 11: Santa Brígida (FF9) está en B1 y en B2: se pregunta por los dos, un candidato por grupo', () => {
  const ff9 = { name: 'Santa Brígida', season: '2025-2026', cat: 'benjamin', groupId: 'FF9' };
  const both = { status: 'ask', candidates: ['B1|Santa Brígida', 'B2|Santa Brígida'] };
  // Al día siguiente de acabar FF9 (08/11/2025) y con la temporada terminada.
  assert.deepEqual(summary(resolveMyTeam(ff9, season(currentAt('2025-11-09')), index, '2025-11-09')), both);
  assert.deepEqual(summary(resolveMyTeam(ff9, real, index, TODAY)), both);
  // Desde 2024-25 (paso 1): el mismo nombre en dos grupos son dos candidatos, más el de PG2.
  const lastSeason = { name: 'Santa Brígida', season: '2024-2025', cat: 'benjamin', groupId: 'P3' };
  assert.deepEqual(summary(resolveMyTeam(lastSeason, real, index, TODAY)),
    { status: 'ask', candidates: ['B1|Santa Brígida', 'B2|Santa Brígida', 'PG2|Santa Brígida'] });
});

test('decisión 12: a final de temporada FF5 pasa a A2 en silencio, y updatedMyTeam dice qué guardar', () => {
  const ff5 = { name: 'Las Mesas Hu.', season: '2025-2026', cat: 'benjamin', groupId: 'FF5' };
  const june = resolveMyTeam(ff5, real, index, '2026-06-15');
  assert.deepEqual(summary(june), { status: 'ok', group: '2025-2026|A2', name: 'Las Mesas Hu.', cat: 'benjamin' });
  assert.deepEqual(updatedMyTeam(ff5, june), { name: 'Las Mesas Hu.', season: '2025-2026', cat: 'benjamin', groupId: 'A2' });
  // Sin cambios, o sin resolución `ok`, no hay nada que guardar.
  assert.equal(updatedMyTeam(LAS_MESAS_PG2, resolveMyTeam(LAS_MESAS_PG2, real, index, TODAY)), null);
  assert.equal(updatedMyTeam(ff5, resolveMyTeam({ ...ff5, groupId: 'FF13', name: 'Las Mesas Hu. B' }, real, index, TODAY)), null);
  assert.equal(updatedMyTeam(ff5, { status: 'absent' }), null);
});

test('summerCups: solo los torneos de la temporada de mi equipo', () => {
  assert.equal(summerCups(cups, LAS_MESAS_PG2, index).length, 2);
  assert.deepEqual(summerCups(cups, { ...LAS_MESAS_PG2, season: '2026-2027' }, index), []);
});

test('decisión 13: en el paso 1, un solo candidato con otro nombre o de otra categoría también se pregunta', () => {
  // «Balos B» de 2025-26 y una 2026/27 en la que el club solo tiene «Balos» (A1, con Moya renombrado).
  const raw = nextSeasonRaw({ benjamin: ['A1'] });
  const rename = name => (name === 'Moya' ? 'Balos' : name);
  raw.benjamin[0].standings = raw.benjamin[0].standings.map(([pos, team, ...rest]) => [pos, rename(team), ...rest]);
  for (const rows of Object.values(raw.history.A1)) for (const row of rows) { row[1] = rename(row[1]); row[2] = rename(row[2]); }
  const next = season(raw);
  const balosB = { name: 'Balos B', season: '2025-2026', cat: 'benjamin', groupId: 'C4' };
  assert.deepEqual(summary(resolveMyTeam(balosB, next, buildClubIndex(teamNames(next), shields), '2026-10-01')),
    { status: 'ask', candidates: ['A1|Balos'] });
  // Las Mesas Hu. de prebenjamín, con el club solo en benjamín: mismo nombre, otra categoría.
  const onlyA2 = season(nextSeasonRaw({ benjamin: ['A2'] }));
  assert.deepEqual(summary(resolveMyTeam(LAS_MESAS_PG2, onlyA2, buildClubIndex(teamNames(onlyA2), shields), '2026-10-01')),
    { status: 'ask', candidates: ['A2|Las Mesas Hu.'] });
});

test('decisión 16: con la Segunda Fase publicada grupo a grupo, Las Mesas ni cambia ni pregunta hasta que existen A2 y B2', () => {
  // 27/11/2025: FF5 y FF13 ya han terminado y la Segunda Fase aún no ha empezado. El club tiene
  // dos equipos en la Primera Fase («Las Mesas Hu.» en FF5 y «Las Mesas Hu. B» en FF13) y dos en
  // la Segunda (A2 y B2). Se publica primero uno de los dos grupos, en cualquier orden.
  const at = ids => { const raw = currentAt('2025-11-27'); raw.benjamin = raw.benjamin.filter(g => ids.includes(g.id)); return season(raw); };
  const ff5 = { name: 'Las Mesas Hu.', season: '2025-2026', cat: 'benjamin', groupId: 'FF5' };
  const ff13 = { name: 'Las Mesas Hu. B', season: '2025-2026', cat: 'benjamin', groupId: 'FF13' };
  const resolve = (myTeam, built) => resolveMyTeam(myTeam, built, index, '2025-11-27');
  for (const first of ['A2', 'B2']) {
    const built = at(['FF5', 'FF13', first]);
    for (const myTeam of [ff5, ff13]) {
      const res = resolve(myTeam, built);
      assert.deepEqual(summary(res), { status: 'ok', group: `2025-2026|${myTeam.groupId}`, name: myTeam.name, cat: 'benjamin' }, `${first} ${myTeam.groupId}`);
      assert.equal(updatedMyTeam(myTeam, res), null);
    }
  }
  // Con los dos grupos publicados: FF5 pasa a A2 en silencio y FF13 pregunta.
  const both = at(['FF5', 'FF13', 'A2', 'B2']);
  assert.deepEqual(summary(resolve(ff5, both)), { status: 'ok', group: '2025-2026|A2', name: 'Las Mesas Hu.', cat: 'benjamin' });
  assert.deepEqual(summary(resolve(ff13, both)), { status: 'ask', candidates: ['A2|Las Mesas Hu.', 'B2|Las Mesas B'] });
});

test('decisión 16: Santa Brígida (FF9), con su filial en la Primera Fase, espera a que existan B1 y B2 y entonces pregunta', () => {
  // En la fuente, «Santa Brígida B» juega FF3, que las fixtures no traen: aquí juega FF15 en lugar
  // de «Ojos de Garza». B1 empieza el 28/11/2025 y B2 el 29/11.
  const at = (day, ids) => {
    const raw = currentAt(day);
    raw.benjamin = raw.benjamin.filter(g => ids.includes(g.id));
    const rename = name => (name === 'Ojos de Garza' ? 'Santa Brígida B' : name);
    const ff15 = raw.benjamin.find(g => g.id === 'FF15');
    ff15.standings = ff15.standings.map(([pos, team, ...rest]) => [pos, rename(team), ...rest]);
    for (const rows of Object.values(raw.history.FF15)) for (const row of rows) { row[1] = rename(row[1]); row[2] = rename(row[2]); }
    return season(raw);
  };
  const ff9 = { name: 'Santa Brígida', season: '2025-2026', cat: 'benjamin', groupId: 'FF9' };
  const onlyB1 = resolveMyTeam(ff9, at('2025-11-28', ['FF9', 'FF15', 'B1']), index, '2025-11-28');
  assert.deepEqual(summary(onlyB1), { status: 'ok', group: '2025-2026|FF9', name: 'Santa Brígida', cat: 'benjamin' });
  assert.equal(updatedMyTeam(ff9, onlyB1), null);
  assert.deepEqual(summary(resolveMyTeam(ff9, at('2025-11-29', ['FF9', 'FF15', 'B1', 'B2']), index, '2025-11-29')),
    { status: 'ask', candidates: ['B1|Santa Brígida', 'B2|Santa Brígida'] });
});

test('decisión 17: el mismo nombre en dos grupos de la fase guardada son dos equipos: se pregunta, nunca en silencio', () => {
  // Como Valsequillo en FF14 y FF17: FF13 con «Las Mesas Hu.» en lugar de «Las Mesas Hu. B».
  const raw = structuredClone(fixture('current-2025-2026'));
  const rename = name => (name === 'Las Mesas Hu. B' ? 'Las Mesas Hu.' : name);
  const ff13 = raw.benjamin.find(g => g.id === 'FF13');
  ff13.standings = ff13.standings.map(([pos, team, ...rest]) => [pos, rename(team), ...rest]);
  for (const rows of Object.values(raw.history.FF13)) for (const row of rows) { row[1] = rename(row[1]); row[2] = rename(row[2]); }
  const twins = season(raw);
  for (const groupId of ['FF5', 'FF13']) {
    const myTeam = { name: 'Las Mesas Hu.', season: '2025-2026', cat: 'benjamin', groupId };
    assert.deepEqual(summary(resolveMyTeam(myTeam, twins, index, TODAY)),
      { status: 'ask', candidates: ['A2|Las Mesas Hu.', 'B2|Las Mesas B'] }, groupId);
  }
});

test('decisión 16: un filial retirado en la fase guardada no hace esperar: el equipo A pasa a su grupo posterior', () => {
  // Como 'CORRALEJO, C.D. "B"' en FV11: «Las Mesas Hu. B» se retira en FF13 (0-0-5 y fuera del
  // calendario, como CD Batán en PG2) y el club solo tiene A2 en la Segunda Fase.
  const raw = structuredClone(fixture('current-2025-2026'));
  raw.benjamin = raw.benjamin.filter(g => g.id !== 'B2');
  const ff13 = raw.benjamin.find(g => g.id === 'FF13');
  ff13.standings = ff13.standings.map(row => (row[1] === 'Las Mesas Hu. B' ? [row[0], row[1], 0, 5, 0, 0, 5, 0, 15, -15] : row));
  for (const [key, rows] of Object.entries(raw.history.FF13)) raw.history.FF13[key] = rows.filter(row => row[1] !== 'Las Mesas Hu. B' && row[2] !== 'Las Mesas Hu. B');
  const built = season(raw);
  assert.deepEqual([...retiredTeams(built.groups.find(g => g.id === 'FF13'))], ['Las Mesas Hu. B']);
  const ff5 = { name: 'Las Mesas Hu.', season: '2025-2026', cat: 'benjamin', groupId: 'FF5' };
  const res = resolveMyTeam(ff5, built, index, TODAY);
  assert.deepEqual(summary(res), { status: 'ok', group: '2025-2026|A2', name: 'Las Mesas Hu.', cat: 'benjamin' });
  assert.deepEqual(updatedMyTeam(ff5, res), { ...ff5, groupId: 'A2' });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd /home/manolo/claude/futbol-base
node --test scripts/tests/test_rediseno_myteam.mjs 2>&1 | grep -E 'ERR_MODULE_NOT_FOUND\]|^# (pass|fail)'
```
Esperado:
```text
# Error [ERR_MODULE_NOT_FOUND]: Cannot find module '/home/manolo/claude/futbol-base/src/myteam.js' imported from /home/manolo/claude/futbol-base/scripts/tests/test_rediseno_myteam.mjs
# pass 0
# fail 1
```
Si en su lugar falla por `model.js` o por una fixture, falta alguna de las Tareas 1, 3, 4 o 5.

- [ ] **Step 3: Write minimal implementation**

Crear `src/myteam.js`:

```js
// Identidad de club y «mi equipo» a través de temporadas y fases (spec §6).
// Módulo puro: recibe los datos por parámetro y no lee ningún global de datos.
import { normalizeForTeamsMapping, normalizeTeamName } from './state.js';
import { matchState, retiredTeams, competitionKey } from './model.js';

// Nombres de torneos y de la federación que no se pueden unir por escudo ni por clave base.
export const TEAM_ALIASES = { 'UD Las Mesas Huracán': 'Las Mesas Hu.' };

// Siglas que normalizeForTeamsMapping no quita (ya quita CF, CD, UD, AD, SD, SC, SAD, CP, CE, FC…).
const SIGLAS = new Set(['rc', 'us', 'cda', 'cef']);

export function baseKey(name) {
  const tokens = normalizeForTeamsMapping(name).split(' ').filter(token => token && !SIGLAS.has(token));
  if (tokens.length > 1 && /^[a-e]$/.test(tokens[tokens.length - 1])) tokens.pop();
  return tokens.join(' ');
}

// Grafo de nombres (union-find). Cada nombre se une a sus «claves»: 'f:' fichero de escudo
// (exacto o normalizado), 'k:' clave base y 'n:' nombre destino de su alias.
export function buildClubIndex(names, shields = {}, aliases = TEAM_ALIASES) {
  const normalized = new Map();
  for (const [key, file] of Object.entries(shields)) {
    const norm = normalizeTeamName(key);
    if (norm && !normalized.has(norm)) normalized.set(norm, file);
  }
  const cache = new Map();
  const keysOf = name => {
    if (cache.has(name)) return cache.get(name);
    const keys = [];
    const file = Object.hasOwn(shields, name) ? shields[name] : normalized.get(normalizeTeamName(name));
    if (file) keys.push('f:' + file);
    const base = baseKey(name);
    if (base) keys.push('k:' + base);
    if (Object.hasOwn(aliases, name)) keys.push('n:' + aliases[name]);
    cache.set(name, keys);
    return keys;
  };
  const parent = new Map();
  const find = node => {
    let root = node;
    while (parent.get(root) !== root) root = parent.get(root);
    while (parent.get(node) !== root) { const next = parent.get(node); parent.set(node, root); node = next; }
    return root;
  };
  const add = node => { if (!parent.has(node)) parent.set(node, node); };
  const union = (a, b) => { add(a); add(b); const ra = find(a), rb = find(b); if (ra !== rb) parent.set(ra, rb); };

  const universe = new Set([...names, ...Object.keys(shields), ...Object.keys(aliases), ...Object.values(aliases)]);
  universe.delete(''); universe.delete(null); universe.delete(undefined);
  for (const name of universe) { add('n:' + name); for (const key of keysOf(name)) union('n:' + name, key); }

  // Un nombre que no está en el universo (p. ej. el de una temporada no cargada) se
  // relaciona por sus claves, sin modificar el índice.
  const rootsOf = name => (parent.has('n:' + name)
    ? new Set([find('n:' + name)])
    : new Set(keysOf(name).filter(key => parent.has(key)).map(find)));

  return {
    same(a, b) {
      if (!a || !b) return false;
      if (a === b) return true;
      const keysA = keysOf(a);
      if (keysOf(b).some(key => keysA.includes(key))) return true;
      const rootsA = rootsOf(a);
      return [...rootsOf(b)].some(root => rootsA.has(root));
    },
    members(name) {
      const roots = rootsOf(name);
      const out = new Set(name ? [name] : []);
      for (const other of universe) if (roots.has(find('n:' + other))) out.add(other);
      return [...out].sort((x, y) => x.localeCompare(y, 'es'));
    },
  };
}

export function sameClub(index, a, b) {
  return index.same(a, b);
}

// ---- Resolución de mi equipo (spec §6.3) ----

const CATS = ['benjamin', 'prebenjamin'];
const PHASE_LEVEL = {
  'segunda-fase': 2, 'segunda-a': 2, 'segunda-b': 2, 'segunda-c': 2, 'segunda-d': 2, 'segunda-e': 2,
  'fase-2': 2, oro: 2, plata: 2, bronce: 2,
};

const allMatches = group => group.rounds.flatMap(round => round.matches);

function teamsOf(group) {
  const teams = new Set(group.standings.map(row => row.team));
  for (const match of allMatches(group)) { teams.add(match.home); teams.add(match.away); }
  teams.delete(''); teams.delete(null); teams.delete(undefined);
  return [...teams];
}

// Partidos que cuentan (spec §4.2): los que no son contra un retirado.
function countedMatches(group) {
  const retired = retiredTeams(group);
  return allMatches(group).filter(match => !retired.has(match.home) && !retired.has(match.away));
}

const hasPending = (group, todayISO) => countedMatches(group).some(match => matchState(match, todayISO) === 'pendiente');
const levels = new WeakMap();
function phaseLevel(group) {
  if (!levels.has(group)) levels.set(group, PHASE_LEVEL[competitionKey(group, group.season).phase] ?? 1);
  return levels.get(group);
}
const leagueGroups = (season, cat) => season.groups.filter(group => group.kind === 'league' && group.cat === cat);
// De una lista de {group, …}, los de la fase más alta.
function topPhase(entries) {
  const top = Math.max(...entries.map(entry => phaseLevel(entry.group)));
  return entries.filter(entry => phaseLevel(entry.group) === top);
}

// Candidatos del club en cada categoría: grupos de liga de la fase más reciente, que es la
// más alta de las que tienen partidos pendientes o, si no hay ninguna, la más alta de todas
// (con dos fases a la vez, el mismo equipo no sale dos veces). Uno por grupo y nombre: el
// mismo nombre en dos grupos de esa fase son dos candidatos (decisión 11).
function clubCandidates(season, cats, name, index, todayISO) {
  const candidates = [];
  for (const cat of cats) {
    const found = leagueGroups(season, cat)
      .map(group => ({ group, teams: teamsOf(group).filter(team => sameClub(index, team, name)) }))
      .filter(entry => entry.teams.length);
    if (!found.length) continue;
    const pending = found.filter(entry => hasPending(entry.group, todayISO));
    for (const { group, teams } of topPhase(pending.length ? pending : found)) {
      for (const team of teams) candidates.push({ group, name: team, cat });
    }
  }
  return candidates;
}

const ok = (group, name) => ({ status: 'ok', group, name, cat: group.cat });
const ask = entries => ({ status: 'ask', candidates: entries.map(({ group, name }) => ({ group, name, cat: group.cat })) });

// Paso 0 con el grupo guardado ya sin partidos pendientes. Cuentan los equipos del club en
// los grupos de liga de la categoría: los de la fase guardada y los de la fase posterior
// (nivel mayor, decisión 10), terminados o no (decisión 12).
// - Con menos equipos del club en la fase posterior que en la guardada, esa fase aún no
//   está publicada entera para él: se espera, sin cambiar ni preguntar (decisión 16). Los
//   retirados de la fase guardada no cuentan: nunca aparecen en la posterior.
// - El mismo nombre en un solo grupo posterior es un cambio de fase, en silencio; en
//   varios, se pregunta por esos grupos (decisión 11).
// - Si el nombre está en dos grupos de la fase guardada, son dos equipos distintos: se
//   pregunta con los equipos del club en la fase posterior (decisión 17), como cuando solo
//   hay otros equipos del club (la filial que cambia de nombre).
// - Sin equipos del club en la fase posterior, sigue el grupo guardado.
function laterPhase(groups, saved, myTeam, index) {
  const club = gs => gs.flatMap(group => teamsOf(group).filter(team => sameClub(index, team, myTeam.name)).map(name => ({ group, name })));
  const later = topPhase(club(groups.filter(group => phaseLevel(group) > phaseLevel(saved))));
  const before = club(groups.filter(group => phaseLevel(group) === phaseLevel(saved)));
  // Fase posterior sin publicar entera para el club: se espera, sin preguntar ni mover (decisión 16).
  if (later.length < before.filter(({ group, name }) => !retiredTeams(group).has(name)).length) return ok(saved, myTeam.name);
  // El mismo nombre en dos grupos de la fase guardada: dos equipos distintos, nunca en silencio (decisión 17).
  const twins = before.filter(entry => entry.name === myTeam.name).length > 1;
  const same = later.filter(entry => entry.name === myTeam.name);
  if (same.length === 1 && !twins) return ok(same[0].group, myTeam.name);
  if (same.length && !twins) return ask(same);
  return later.length ? ask(later) : ok(saved, myTeam.name);
}

// Pasos 1 y 2: sin candidatos, ausente; uno solo con el mismo nombre y la misma categoría,
// se usa sin preguntar (decisión 13); en cualquier otro caso, se pregunta.
function choose(candidates, myTeam) {
  if (!candidates.length) return { status: 'absent' };
  const [only] = candidates;
  if (candidates.length === 1 && only.name === myTeam.name && only.cat === myTeam.cat) return { status: 'ok', ...only };
  return { status: 'ask', candidates };
}

export function resolveMyTeam(myTeam, season, index, todayISO) {
  if (!myTeam || !myTeam.name || !season) return { status: 'absent' };
  if (myTeam.season === season.name) {
    // Paso 0: el caso normal, sin preguntas.
    const groups = leagueGroups(season, myTeam.cat);
    const saved = groups.find(group => group.id === myTeam.groupId);
    if (saved && teamsOf(saved).includes(myTeam.name)) {
      return hasPending(saved, todayISO) ? ok(saved, myTeam.name) : laterPhase(groups, saved, myTeam, index);
    }
    // Paso 2: el grupo guardado ya no sirve; se busca solo en su categoría.
    return choose(clubCandidates(season, [myTeam.cat], myTeam.name, index, todayISO), myTeam);
  }
  // Paso 1: cambio de temporada; se busca en ambas categorías, primero en la suya.
  const cats = [myTeam.cat, ...CATS.filter(cat => cat !== myTeam.cat)];
  return choose(clubCandidates(season, cats, myTeam.name, index, todayISO), myTeam);
}

// Lo que B2 guarda tras resolver (decisión 12): el myTeam nuevo, {name, season, cat, groupId},
// si una resolución `ok` cambia algo; null si no cambia nada o si la resolución no es `ok`.
export function updatedMyTeam(myTeam, resolution) {
  if (!resolution || resolution.status !== 'ok') return null;
  const next = { name: resolution.name, season: resolution.group.season, cat: resolution.cat, groupId: resolution.group.id };
  const same = myTeam && Object.keys(next).every(key => myTeam[key] === next[key]);
  return same ? null : next;
}

// ---- Verano (spec §6.4) ----

// Solo los torneos de la temporada de mi equipo: los de 2025-26 nunca salen bajo otra.
export function summerCups(cups, myTeam, index) {
  if (!cups || !myTeam || cups.season !== myTeam.season) return [];
  const out = [];
  for (const group of cups.groups) {
    if (group.cat !== myTeam.cat) continue;
    const rows = allMatches(group).filter(match => sameClub(index, match.home, myTeam.name) || sameClub(index, match.away, myTeam.name));
    if (rows.length) out.push({ group, rows });
  }
  return out;
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
cd /home/manolo/claude/futbol-base
node --test scripts/tests/test_rediseno_myteam.mjs 2>&1 | grep -E '^# (tests|pass|fail)'
```
Esperado:
```text
# tests 25
# pass 25
# fail 0
```
La prueba de la simulación día a día tarda unos segundos: construye la temporada de cada día.

- [ ] **Step 5: Suites completas**

```bash
cd /home/manolo/claude/futbol-base
python3 -m pytest scripts/tests/ -q 2>&1 | tail -1
node --test scripts/tests/test_*.mjs 2>&1 | grep -E '^# (tests|pass|fail)'
```
Esperado:
- pytest: el mismo recuento que al terminar la tarea anterior, sin `failed` (esta tarea no añade pruebas de Python).
- node: el recuento anterior más 25, sin fallos (`# fail 0`). `simulate.mjs` no empieza por `test_`, así que el glob no lo ejecuta.

- [ ] **Step 6: Commit**

```bash
cd /home/manolo/claude/futbol-base
git add src/myteam.js scripts/tests/fixtures/rediseno/simulate.mjs scripts/tests/test_rediseno_myteam.mjs
git commit -F - <<'EOF'
feat(rediseño): identidad de club y resolución de mi equipo en myteam.js (B1, tarea 8)

- buildClubIndex: union-find sobre los nombres de liga, torneo y escudos,
  con aristas por fichero de escudo (exacto o normalizado, nunca por
  subcadena), por clave base (baseKey) y por alias (TEAM_ALIASES). Un
  nombre fuera del índice se relaciona por sus claves (spec §6.1).
- resolveMyTeam: pasos 0, 1 y 2 de §6.3, con los candidatos del club en la
  fase más reciente, uno por grupo y nombre. El paso 0 solo mira fases
  posteriores y no depende de que tengan partidos pendientes, espera a que
  el club tenga en la fase posterior tantos equipos como en la suya (sin
  contar sus retirados) y pregunta si su nombre está repetido en la fase
  guardada; los pasos 1 y 2 solo usan un candidato sin preguntar si tiene
  el mismo nombre y la misma categoría (decisiones 10 a 13, 16 y 17).
- updatedMyTeam: el myTeam que B2 guarda tras un cambio de fase.
- summerCups: torneos de la categoría y la temporada del equipo con un
  equipo del club (§6.4).

Pruebas con datos reales congelados: los cinco nombres de Las Mesas son un
club; RC Victoria y RC Victoria B, US Yaiza y US Yaiza B, y Pto.del Carmen
y Pto. del Carmen B también; Las Mesas Hu. y AD Huracán no, ni a través
de UD Las Mesas Huracán. Casos 2, 2b, 3 y 8 de §11, con temporadas
simuladas construidas a partir de las fixtures (simulate.mjs gana
nextSeasonRaw y teamNames); 2025-26 día a día sin preguntas por equipos
de la misma fase; Santa Brígida en B1 y B2; FF5 → A2 a final de
temporada; la Segunda Fase publicada grupo a grupo, un filial retirado
que no hace esperar y un nombre repetido en dos grupos de la Primera Fase.

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01Sg56KK3oZgo8Ye7Snj6wG9
EOF
git show --stat --oneline HEAD | tail -1
```
Esperado: `3 files changed`: `src/myteam.js` y la prueba, nuevos, y `simulate.mjs`, modificado.

---

### Task 9: `myteam.js`: `homeState` y `showNextSeasonBox` (spec §4.2 y §5.6)

**Contexto**
- **Orden de §4.2: E, X, D, B, C, A.**
  - E si `resolution.status === 'ask'`; X si no es `'ok'` (`absent` o sin resolución).
  - D si `groupFinished(group, todayISO, portalSeason)` (Tarea 5).
  - B si el grupo no tiene ningún partido `jugado`.
  - A si mi equipo tiene próximo partido (`teamFixtures(...).next`, Tarea 5); C si ya ha jugado (`played > 0`) y no lo tiene.
  - Si mi equipo no ha jugado nada y tampoco tiene próximo partido (todos sus partidos, sin fecha), B: la portada no tiene «Último partido» que enseñar.
  - Solo cuentan los partidos que no son contra retirados (`retiredTeams`).
- **Decisión: A y C se deciden con los partidos de mi equipo; B, con los del grupo** (texto literal de §4.2). §4.2 dice que el próximo partido es el primer partido `pendiente`, y la portada A lo enseña. Si se decidiera por grupo, un equipo sin partido en la última jornada estaría en A sin próximo partido. Caso real: PG2 el 01/06/2026, con la jornada 30 pendiente.
  - Las Mesas Hu. juega el 02/06 contra AD Huracán: A.
  - RC Victoria no tiene partido ni en la jornada 29 ni en la 30 (su último partido es del 24/05): C.
  - El grupo todavía no está terminado, porque quedan partidos pendientes.
- **D antes que B.** Un grupo terminado sin ningún resultado es D. La prueba vacía los marcadores de PGC2 de 2024-25; el caso real más parecido es PLZ1 de 2024-25, con 1 marcador en 12 partidos.
- **`homeState` no recibe `health`** (decisión 5): D es D con caja o sin ella, y la caja la decide `showNextSeasonBox`.
- **`showNextSeasonBox`:** el grupo es de `portalSeason` y, además, no hay `data-health` o `health.nextSeason.status === 'pending'`. Un `health` sin `nextSeason` da `false`. Los scripts solo escriben `'pending'` (`activate_season.py` ≈159 y `source_health.py` ≈33); la prueba usa `'ready'` como «cualquier otro estado».
- **Activación de 2026/27** (foco de revisión 1): con la 2026/27 simulada, la jornada 1 sin resultados es B, también con la clasificación sin publicar (vacía), y la jornada por defecto es la 1.
- **Fechas reales usadas:**
  - PG2 empieza el 11/10/2025 y termina el 06/06/2026, con todo jugado: el 31/05 es C y el 15/06 es D.
  - En PFV2, CD Teguinte ocupa 14 filas sin fecha ni marcador, y la última jornada con fecha es la del 24/05/2026. La prueba fecha sus partidos el 28/05: sigue retirado (regla 2 de `retiredTeams`), y Unión Tetir, cuyo último partido es contra él, queda en C y no en A.

**Files:**
- Modify: `src/myteam.js`: la importación de `./model.js` y un bloque nuevo al final.
- Create: `scripts/tests/test_rediseno_homestate.mjs`.

**Interfaces:**
- Consumes:
  - `groupFinished`, `matchState`, `retiredTeams` y `teamFixtures` de `src/model.js` (Tareas 3 y 5);
  - `resolveMyTeam` y `buildClubIndex` (Tarea 8), `simulate.mjs` (Tareas 5 y 8), `defaultRound` (Tarea 5) y `fixture('health')` (Tarea 1), en la prueba.
- Produces:
  - `homeState({ resolution, todayISO, portalSeason })` → `'E' | 'X' | 'D' | 'B' | 'C' | 'A'`;
  - `showNextSeasonBox({ group, health, portalSeason })` → `boolean`.

- [ ] **Step 1: Write the failing test**

Crear `scripts/tests/test_rediseno_homestate.mjs`:

```js
// Estado de la portada (spec §4.2) y caja de la temporada siguiente, con datos reales congelados.
import test from 'node:test';
import assert from 'node:assert/strict';
import { fixture } from './fixtures/rediseno/load.mjs';
import { currentAt, nextSeasonRaw, teamNames } from './fixtures/rediseno/simulate.mjs';
import { buildSeason, defaultRound } from '../../src/model.js';
import { buildClubIndex, resolveMyTeam, homeState, showNextSeasonBox } from '../../src/myteam.js';

const PORTAL_SEASON = '2025-2026';
const health = fixture('health');
const shields = fixture('shields');
const season = raw => buildSeason({ name: raw.season, current: true, ...raw });
const real = season(fixture('current-2025-2026'));
const index = buildClubIndex(teamNames(real), shields);
const LAS_MESAS_PG2 = { name: 'Las Mesas Hu.', season: '2025-2026', cat: 'prebenjamin', groupId: 'PG2' };
const own = (built, groupId, name) => ({ status: 'ok', group: built.groups.find(g => g.id === groupId), name, cat: 'prebenjamin' });
const state = (resolution, todayISO, portalSeason = PORTAL_SEASON) => homeState({ resolution, todayISO, portalSeason });

test('la fixture de data-health tiene la temporada siguiente pendiente', () => {
  assert.deepEqual(health.nextSeason, { name: '2026-2027', status: 'pending' });
});

test('caso 1: el 23/09/2026 PG2 Las Mesas está en D con la caja de 2026/27 y sin pregunta', () => {
  const resolution = resolveMyTeam(LAS_MESAS_PG2, real, index, '2026-09-23');
  assert.equal(resolution.status, 'ok');
  assert.equal(state(resolution, '2026-09-23'), 'D');
  assert.equal(showNextSeasonBox({ group: resolution.group, health, portalSeason: PORTAL_SEASON }), true);
});

test('caso 1: el 15/06/2026 es D, y sin la caja si la temporada siguiente no está pendiente', () => {
  const resolution = own(real, 'PG2', 'Las Mesas Hu.');
  assert.equal(state(resolution, '2026-06-15'), 'D');
  const notPending = { ...health, nextSeason: { name: '2026-2027', status: 'ready' } };
  assert.equal(showNextSeasonBox({ group: resolution.group, health: notPending, portalSeason: PORTAL_SEASON }), false);
});

test('caso 1: una ficha de 2024-25 es D y nunca lleva la caja', () => {
  const raw = fixture('historical-2024-2025');
  const old = buildSeason({ name: raw.season, current: false, benjamin: raw.benjamin, prebenjamin: raw.prebenjamin });
  const resolution = own(old, 'PGC2', 'Las Mesas Hu.');
  assert.equal(state(resolution, '2026-09-23'), 'D');
  assert.equal(showNextSeasonBox({ group: resolution.group, health, portalSeason: PORTAL_SEASON }), false);
  assert.equal(showNextSeasonBox({ group: resolution.group, health: null, portalSeason: PORTAL_SEASON }), false);
});

test('orden de §4.2: un grupo terminado sin ningún resultado es D, no B (PGC2 de 2024-25 sin marcadores)', () => {
  const raw = structuredClone(fixture('historical-2024-2025'));
  const group = raw.prebenjamin.find(g => g.id === 'PGC2');
  for (const rows of Object.values(group.jornadas)) for (const row of rows) { row[3] = null; row[4] = null; }
  const old = buildSeason({ name: raw.season, current: false, benjamin: [], prebenjamin: [group] });
  assert.equal(state(own(old, 'PGC2', 'Las Mesas Hu.'), '2026-09-23'), 'D');
});

test('sin data-health, un grupo de la temporada del portal lleva la caja', () => {
  const group = real.groups.find(g => g.id === 'PG2');
  assert.equal(showNextSeasonBox({ group, health: null, portalSeason: PORTAL_SEASON }), true);
  assert.equal(showNextSeasonBox({ group, health: undefined, portalSeason: PORTAL_SEASON }), true);
});

test('E si hay que preguntar y X si el equipo no aparece', () => {
  const candidates = [{ group: real.groups.find(g => g.id === 'PG2'), name: 'Las Mesas Hu.', cat: 'prebenjamin' }];
  assert.equal(state({ status: 'ask', candidates }, '2026-09-23'), 'E');
  assert.equal(state({ status: 'absent' }, '2026-09-23'), 'X');
});

test('A en plena temporada, B antes de la jornada 1 y C en el hueco anterior al 1 de junio', () => {
  assert.equal(state(own(season(currentAt('2026-03-01')), 'PG2', 'Las Mesas Hu.'), '2026-03-01'), 'A');
  assert.equal(state(own(season(currentAt('2025-10-01')), 'PG2', 'Las Mesas Hu.'), '2025-10-01'), 'B');
  assert.equal(state(own(real, 'PG2', 'Las Mesas Hu.'), '2026-05-31'), 'C');
});

test('el 1 de junio con la jornada 30 pendiente: Las Mesas juega (A) y RC Victoria no tiene partido (C)', () => {
  const june = season(currentAt('2026-06-01'));
  assert.equal(state(own(june, 'PG2', 'Las Mesas Hu.'), '2026-06-01'), 'A');
  assert.equal(state(own(june, 'PG2', 'RC Victoria'), '2026-06-01'), 'C');
});

test('los partidos contra un retirado (CD Teguinte en PFV2) no son el próximo partido de nadie', () => {
  const raw = structuredClone(fixture('current-2025-2026'));
  for (const rows of Object.values(raw.history.PFV2)) {
    for (const row of rows) if (row[1] === 'CD Teguinte' || row[2] === 'CD Teguinte') row[0] = '28-05-2026';
  }
  const built = season(raw);
  const tetir = { status: 'ok', group: built.groups.find(g => g.id === 'PFV2'), name: 'Unión Tetir', cat: 'prebenjamin' };
  assert.equal(state(tetir, '2026-05-25'), 'C');
  assert.equal(state(tetir, '2026-06-15'), 'D');
});

test('caso 4: jornada 1 de 2026/27 sin resultados es B, solo con datos de 2026/27 y también sin clasificación', () => {
  const next = season(nextSeasonRaw({ benjamin: ['A1', 'B2', 'FF15'], prebenjamin: ['PG2', 'PG3'] }));
  const nextIndex = buildClubIndex(teamNames(next), shields);
  const answered = { name: 'Las Mesas Hu.', season: '2026-2027', cat: 'prebenjamin', groupId: 'PG2' };
  const resolution = resolveMyTeam(answered, next, nextIndex, '2026-10-01');
  assert.equal(resolution.status, 'ok');
  const matches = resolution.group.rounds.flatMap(round => round.matches);
  assert.ok(matches.length > 0 && matches.every(m => m.season === '2026-2027' && m.dateISO >= '2026-07-01' && m.hs === null));
  assert.ok(resolution.group.standings.every(row => row.pj === 0 && row.pts === 0));
  assert.equal(state(resolution, '2026-10-01', '2026-2027'), 'B');
  assert.equal(state(resolution, '2026-10-20', '2026-2027'), 'B');
  assert.equal(defaultRound(resolution.group, '2026-10-01').n, 1);
  // Clasificación sin publicar (vacía): nada lanza, nadie queda retirado y sigue en B.
  const unpublished = { ...resolution, group: { ...resolution.group, standings: [] } };
  assert.equal(state(unpublished, '2026-10-01', '2026-2027'), 'B');
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd /home/manolo/claude/futbol-base
node --test scripts/tests/test_rediseno_homestate.mjs 2>&1 | grep -E 'SyntaxError|^# (pass|fail)'
```
Esperado:
```text
# SyntaxError: The requested module '../../src/myteam.js' does not provide an export named 'homeState'
# pass 0
# fail 1
```

- [ ] **Step 3: Write minimal implementation**

1. En `src/myteam.js`, sustituir la importación de `./model.js` (línea 4):

```js
import { matchState, retiredTeams, competitionKey } from './model.js';
```

por:

```js
import { matchState, retiredTeams, competitionKey, groupFinished, teamFixtures } from './model.js';
```

2. `homeState` reutiliza `countedMatches`, el ayudante privado de la Tarea 8, y `teamFixtures`, de la Tarea 5.

   Añadir al final de `src/myteam.js`, después de la llave que cierra `summerCups` y una línea en blanco:

```js
// ---- Estado de la portada (spec §4.2) ----

// Orden E, X, D, B, C, A. Solo cuentan los partidos que no son contra retirados. A y C
// salen de teamFixtures, como el próximo partido que enseña la portada: A si mi equipo
// tiene próximo partido; C si ya ha jugado y no lo tiene. Sin nada jugado ni próximo
// partido (todos sin fecha), B. `health` no cambia el estado: solo decide la caja.
export function homeState({ resolution, todayISO, portalSeason }) {
  if (resolution?.status === 'ask') return 'E';
  if (resolution?.status !== 'ok') return 'X';
  const { group, name } = resolution;
  if (groupFinished(group, todayISO, portalSeason)) return 'D';
  if (!countedMatches(group).some(match => matchState(match, todayISO) === 'jugado')) return 'B';
  const { next, played } = teamFixtures(name, group, todayISO);
  if (next) return 'A';
  return played > 0 ? 'C' : 'B';
}

export function showNextSeasonBox({ group, health, portalSeason }) {
  if (!group || group.season !== portalSeason) return false;
  return !health || health.nextSeason?.status === 'pending';
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
cd /home/manolo/claude/futbol-base
node --test scripts/tests/test_rediseno_homestate.mjs 2>&1 | grep -E '^# (tests|pass|fail)'
```
Esperado:
```text
# tests 11
# pass 11
# fail 0
```

- [ ] **Step 5: Suites completas**

```bash
cd /home/manolo/claude/futbol-base
python3 -m pytest scripts/tests/ -q 2>&1 | tail -1
node --test scripts/tests/test_*.mjs 2>&1 | grep -E '^# (tests|pass|fail)'
```
Esperado:
- pytest: el mismo recuento que al terminar la tarea anterior, sin `failed` (esta tarea no añade pruebas de Python).
- node: el recuento anterior más 11, sin fallos (`# fail 0`). Las 25 pruebas de la Tarea 8 siguen en verde con la importación nueva.

- [ ] **Step 6: Commit**

```bash
cd /home/manolo/claude/futbol-base
git add src/myteam.js scripts/tests/test_rediseno_homestate.mjs
git commit -F - <<'EOF'
feat(rediseño): estado de la portada y caja de la temporada siguiente (B1, tarea 9)

- homeState evalúa E, X, D, B, C y A en el orden de §4.2, sin contar los
  partidos contra retirados y sin data-health. B mira el grupo; A y C
  salen de teamFixtures: A si mi equipo tiene próximo partido y C si ya
  ha jugado y no lo tiene.
- showNextSeasonBox: solo en grupos de la temporada del portal, con
  data-health.nextSeason pendiente o sin data-health.

Casos reales de §11 con fixtures congeladas: D con caja el 23/09/2026 y sin
ella en una ficha de 2024-25 o si la temporada siguiente no está pendiente;
C el 31/05; en PG2 el 1 de junio, A para Las Mesas y C para RC Victoria,
que no juega la última jornada; B en la jornada 1 de 2026/27 simulada,
también con la clasificación sin publicar.

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01Sg56KK3oZgo8Ye7Snj6wG9
EOF
git show --stat --oneline HEAD | tail -1
```
Esperado: `2 files changed`, con `src/myteam.js` y `scripts/tests/test_rediseno_homestate.mjs`.

---

### Task 10: `store.js`: almacén v2 y migración desde v1

**Files:**
- Create: `src/store.js`
- Test: `scripts/tests/test_rediseno_store.mjs`

**Interfaces:**
- Consumes:
  - `normalizeTeamName` de `src/state.js` (se importa en Node sin DOM; `test_js_modules.mjs` ya importa `state.js`);
  - en las pruebas, `fixture('favorites-v1')` de la Tarea 1.
- Produces, con los nombres exactos del contrato:
  - `STORE_KEY = 'futbol-base:v2'`, `LEGACY_KEY = 'futbol-base:favorites:v1'` y `MAX_RECENT = 8`.
  - `safeStorage(storage)` → `{ getItem(key) → string | null, setItem(key, value) → boolean }`. Nunca lanza, tampoco con `storage` `null`, `undefined` o sin métodos. `storage` puede ser el Storage o una función que lo devuelve: con las cookies bloqueadas, solo leer el Storage del navegador ya lanza, y así el error también se captura. B2 escribe `safeStorage(() => window.localStorage)`; `loadStore` y `saveStore` aceptan lo mismo.
  - `migrateV1(v1, legacySeason = '2025-2026')` recibe el objeto v1 ya parseado y devuelve `{ myTeam: {name, season, cat, groupId}, recent: [{s, g, t}] }`, o `null` si no hay ningún favorito válido.
  - `loadStore(storage, { defaultTeam, portalSeason })` → `{ myTeam, recent }`.
    - Si hay v2, sanea cada campo por separado.
    - Si no lo hay, o no se puede leer, migra v1 y **escribe v2**; v1 no se toca.
    - Si tampoco hay v1, devuelve `{ myTeam: {name, season: portalSeason, cat, groupId}, recent: [] }` sin escribir nada.
  - `saveStore(storage, state)` → `boolean`. Escribe exactamente `{myTeam, recent}` en `STORE_KEY`.
  - `addRecent(state, entry)` → estado nuevo.
    - Lo último visto va primero, sin repetidos por `(s, g, t)` exactos y con un máximo de 8.
    - Una entrada inválida devuelve el mismo `state`. No excluye a mi equipo: lo decide quien llama.
  - **Un grupo de torneo (MC\*) se devuelve tal cual, sin marca.** Los torneos nunca están en `Season` (van en `Cups`), así que `resolveMyTeam` no encuentra el grupo guardado y aplica el paso 2, o el paso 1 si la temporada ya cambió (§6.3 y §6.5).

- [ ] **Step 1: Write the failing test**

Crear `scripts/tests/test_rediseno_store.mjs`:

```js
// Almacén «futbol-base:v2» y migración desde v1 (Plan B1, Tarea 10; spec §6.5 y §11).
// Usa Storage falsos en memoria y la fixture congelada favorites-v1: nunca
// localStorage ni los data-*.js, ni depende de los valores de src/config.js.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  STORE_KEY, LEGACY_KEY, MAX_RECENT, safeStorage, migrateV1, loadStore, saveStore, addRecent,
} from '../../src/store.js';
import { fixture } from './fixtures/rediseno/load.mjs';

// Storage en memoria con la interfaz de localStorage.
class MemoryStorage {
  constructor(entries = {}) { this.data = new Map(Object.entries(entries)); }
  getItem(key) { return this.data.has(key) ? this.data.get(key) : null; }
  setItem(key, value) { this.data.set(key, String(value)); }
  removeItem(key) { this.data.delete(key); }
}

// Storage que falla como Safari en modo privado o con la cuota agotada.
class BrokenStorage {
  getItem() { throw new Error('SecurityError: acceso denegado'); }
  setItem() { throw new Error('QuotaExceededError: cuota agotada'); }
}

// Valores de PORTAL escritos a mano: la prueba no depende de src/config.js.
const OPTIONS = { defaultTeam: { cat: 'prebenjamin', groupId: 'PG2', name: 'Las Mesas Hu.' }, portalSeason: '2025-2026' };
const DEFAULT_TEAM = { name: 'Las Mesas Hu.', season: '2025-2026', cat: 'prebenjamin', groupId: 'PG2' };
const MIGRATED = {
  myTeam: { name: 'Las Mesas Hu.', season: '2025-2026', cat: 'prebenjamin', groupId: 'PG2' },
  recent: [{ s: '2025-2026', g: 'PG2', t: 'AD Huracán' }],
};

test('store: claves y máximo de vistos', () => {
  assert.equal(STORE_KEY, 'futbol-base:v2');
  assert.equal(LEGACY_KEY, 'futbol-base:favorites:v1');
  assert.equal(MAX_RECENT, 8);
});

test('safeStorage: getItem y setItem nunca lanzan', () => {
  const ok = safeStorage(new MemoryStorage({ a: '1' }));
  assert.equal(ok.getItem('a'), '1');
  assert.equal(ok.getItem('b'), null);
  assert.equal(ok.setItem('b', '2'), true);
  assert.equal(ok.getItem('b'), '2');
  for (const storage of [new BrokenStorage(), null, undefined, {}]) {
    const broken = safeStorage(storage);
    assert.equal(broken.getItem('a'), null);
    assert.equal(broken.setItem('a', '1'), false);
  }
});

test('safeStorage acepta una función que devuelve el Storage y captura el error de acceder a él', () => {
  const memory = new MemoryStorage({ a: '1' });
  const viaFunction = safeStorage(() => memory);
  assert.equal(viaFunction.getItem('a'), '1');
  assert.equal(viaFunction.setItem('b', '2'), true);
  assert.equal(memory.getItem('b'), '2');
  // Con las cookies bloqueadas, solo con leer el Storage del navegador ya se lanza: un getter que
  // lanza, como el de window.localStorage, y la función que B2 le pasa a safeStorage.
  const browser = Object.defineProperty({}, 'localStorage', {
    get() { throw new Error('SecurityError: The operation is insecure.'); },
  });
  const blocked = () => browser.localStorage;
  assert.throws(blocked, /SecurityError/);
  assert.equal(safeStorage(blocked).getItem('a'), null);
  assert.equal(safeStorage(blocked).setItem('a', '1'), false);
  assert.deepEqual(loadStore(blocked, OPTIONS), { myTeam: DEFAULT_TEAM, recent: [] });
  assert.equal(saveStore(blocked, { myTeam: DEFAULT_TEAM, recent: [] }), false);
  // Y con v1 guardado, la migración funciona igual a través de la función.
  const withV1 = new MemoryStorage({ [LEGACY_KEY]: JSON.stringify(fixture('favorites-v1')) });
  assert.deepEqual(loadStore(() => withV1, OPTIONS), MIGRATED);
  assert.deepEqual(JSON.parse(withV1.getItem(STORE_KEY)), MIGRATED);
});

test('migrateV1: el favorito v1 real pasa a mi equipo con 2025-2026 literal, y el resto a vistos', () => {
  assert.deepEqual(migrateV1(fixture('favorites-v1')), MIGRATED);
});

test('migrateV1: la temporada es la de los favoritos v1, nunca la del portal', () => {
  const v1 = fixture('favorites-v1');
  assert.equal(migrateV1(v1).myTeam.season, '2025-2026');
  assert.deepEqual(migrateV1(v1, '2024-2025'), {
    myTeam: { name: 'Las Mesas Hu.', season: '2024-2025', cat: 'prebenjamin', groupId: 'PG2' },
    recent: [{ s: '2024-2025', g: 'PG2', t: 'AD Huracán' }],
  });
});

test('migrateV1: selected se resuelve con normalizeTeamName contra los equipos de v1', () => {
  const teams = [
    { name: 'Las Mesas Hu.', cat: 'prebenjamin', groupId: 'PG2' },
    { name: 'Las Mesas Hu.', cat: 'benjamin', groupId: 'A2' },
    { name: 'Las Mesas Hu.', cat: 'benjamin', groupId: 'FF5' },
    { name: 'AD Huracán', cat: 'prebenjamin', groupId: 'PG2' },
  ];
  assert.deepEqual(migrateV1({ teams, selected: 'benjamin|A2|las mesas hu' }), {
    myTeam: { name: 'Las Mesas Hu.', season: '2025-2026', cat: 'benjamin', groupId: 'A2' },
    recent: [
      { s: '2025-2026', g: 'PG2', t: 'Las Mesas Hu.' },
      { s: '2025-2026', g: 'FF5', t: 'Las Mesas Hu.' },
      { s: '2025-2026', g: 'PG2', t: 'AD Huracán' },
    ],
  });
  // Sin tildes ni siglas: «AD Huracán» se guardaba como «huracan».
  assert.deepEqual(migrateV1({ teams, selected: 'prebenjamin|PG2|huracan' }).myTeam,
    { name: 'AD Huracán', season: '2025-2026', cat: 'prebenjamin', groupId: 'PG2' });
});

test('migrateV1: un torneo (MC*) se devuelve tal cual para que resolveMyTeam aplique el paso 2', () => {
  const v1 = {
    teams: [
      { name: 'Las Mesas Hu.', cat: 'prebenjamin', groupId: 'PG2' },
      { name: 'UD Las Mesas Huracán', cat: 'prebenjamin', groupId: 'MCP3' },
    ],
    selected: 'prebenjamin|MCP3|las mesas huracan',
  };
  assert.deepEqual(migrateV1(v1), {
    myTeam: { name: 'UD Las Mesas Huracán', season: '2025-2026', cat: 'prebenjamin', groupId: 'MCP3' },
    recent: [{ s: '2025-2026', g: 'PG2', t: 'Las Mesas Hu.' }],
  });
});

test('migrateV1: selected ausente o sin equipo → el primer favorito válido', () => {
  const teams = [
    { name: 'AD Huracán', cat: 'prebenjamin', groupId: 'PG2' },
    { name: 'Las Mesas Hu.', cat: 'prebenjamin', groupId: 'PG2' },
  ];
  for (const selected of [undefined, 'prebenjamin|PG9|nadie']) {
    assert.deepEqual(migrateV1({ teams, selected }), {
      myTeam: { name: 'AD Huracán', season: '2025-2026', cat: 'prebenjamin', groupId: 'PG2' },
      recent: [{ s: '2025-2026', g: 'PG2', t: 'Las Mesas Hu.' }],
    });
  }
});

test('migrateV1: a vistos van los 8 primeros favoritos restantes, sin inválidos ni repetidos', () => {
  const teams = Array.from({ length: 12 }, (_, i) => ({ name: `Equipo ${i}`, cat: 'benjamin', groupId: `FF${i}` }));
  const v1 = {
    teams: [
      null,
      { name: 'Sin categoría', groupId: 'A1' },
      { name: 'Alevín', cat: 'alevin', groupId: 'A1' },
      { name: 42, cat: 'benjamin', groupId: 'A1' },
      { name: 'Sin grupo', cat: 'benjamin' },
      teams[0], teams[0], ...teams.slice(1),
    ],
    selected: 'benjamin|FF5|equipo 5',
  };
  const { myTeam, recent } = migrateV1(v1);
  assert.deepEqual(myTeam, { name: 'Equipo 5', season: '2025-2026', cat: 'benjamin', groupId: 'FF5' });
  assert.equal(recent.length, MAX_RECENT);
  assert.deepEqual(recent.map(e => e.g), ['FF0', 'FF1', 'FF2', 'FF3', 'FF4', 'FF6', 'FF7', 'FF8']);
  assert.deepEqual(recent[0], { s: '2025-2026', g: 'FF0', t: 'Equipo 0' });
});

test('migrateV1: sin favoritos v1 válidos → null', () => {
  for (const v1 of [null, undefined, 'x', 42, [], {}, { teams: 'x' }, { teams: [] },
    { teams: [{ name: 'X', cat: 'alevin', groupId: 'A1' }], selected: 'alevin|A1|x' }]) {
    assert.equal(migrateV1(v1), null, JSON.stringify(v1));
  }
});

test('loadStore: almacén vacío → equipo por defecto con la temporada del portal, sin escribir nada', () => {
  const storage = new MemoryStorage();
  assert.deepEqual(loadStore(storage, OPTIONS), { myTeam: DEFAULT_TEAM, recent: [] });
  assert.deepEqual(loadStore(storage, { ...OPTIONS, portalSeason: '2026-2027' }).myTeam,
    { ...DEFAULT_TEAM, season: '2026-2027' });
  assert.equal(storage.data.size, 0);
});

test('loadStore: con solo v1 migra una vez, escribe v2 y conserva v1 intacto', () => {
  const v1 = JSON.stringify(fixture('favorites-v1'));
  const storage = new MemoryStorage({ [LEGACY_KEY]: v1 });
  // Con 2026/27 ya activada, mi equipo conserva 2025-2026: resolveMyTeam aplicará el paso 1.
  assert.deepEqual(loadStore(storage, { ...OPTIONS, portalSeason: '2026-2027' }), MIGRATED);
  assert.deepEqual(JSON.parse(storage.getItem(STORE_KEY)), MIGRATED);
  assert.equal(storage.getItem(LEGACY_KEY), v1);
  // Segunda carga: manda v2 y v1 ya no se consulta.
  storage.setItem(LEGACY_KEY, JSON.stringify({ teams: [{ name: 'Moya', cat: 'benjamin', groupId: 'A1' }] }));
  assert.deepEqual(loadStore(storage, OPTIONS), MIGRATED);
});

test('loadStore: las claves antiguas season, cat y theme se ignoran y no se tocan', () => {
  const legacy = { season: '2024-2025', cat: 'benjamin', theme: 'light' };
  const storage = new MemoryStorage(legacy);
  assert.deepEqual(loadStore(storage, OPTIONS), { myTeam: DEFAULT_TEAM, recent: [] });
  assert.deepEqual(Object.fromEntries(storage.data), legacy);
});

test('loadStore y saveStore: si el almacenamiento falla, valores por defecto en memoria y sin excepciones', () => {
  for (const storage of [new BrokenStorage(), null, undefined]) {
    assert.deepEqual(loadStore(storage, OPTIONS), { myTeam: DEFAULT_TEAM, recent: [] });
    assert.equal(saveStore(storage, { myTeam: DEFAULT_TEAM, recent: [] }), false);
  }
});

test('loadStore: v2 ilegible → migra v1 si existe; si no, por defecto', () => {
  const v1 = JSON.stringify(fixture('favorites-v1'));
  const withV1 = new MemoryStorage({ [STORE_KEY]: '{roto', [LEGACY_KEY]: v1 });
  assert.deepEqual(loadStore(withV1, OPTIONS), MIGRATED);
  assert.deepEqual(JSON.parse(withV1.getItem(STORE_KEY)), MIGRATED);
  for (const text of ['null', '[]', '"texto"', '{roto']) {
    assert.deepEqual(loadStore(new MemoryStorage({ [STORE_KEY]: text }), OPTIONS), { myTeam: DEFAULT_TEAM, recent: [] }, text);
  }
});

test('loadStore: en v2 cada campo inválido se sanea por separado', () => {
  const recent = [
    { s: '2025-2026', g: 'A2', t: 'Las Mesas Hu.' },
    { s: '2025-2026', g: 'A2', t: 'Las Mesas Hu.' },
    { g: 'PG2' }, 'x', null,
    ...Array.from({ length: 10 }, (_, i) => ({ s: '2025-2026', g: `FF${i}`, t: `Equipo ${i}`, extra: i })),
  ];
  const storage = new MemoryStorage({ [STORE_KEY]: JSON.stringify({
    myTeam: { name: 'Las Mesas Hu.', season: '2025-2026', cat: 'alevin', groupId: 'A1' }, recent,
  }) });
  const out = loadStore(storage, OPTIONS);
  assert.deepEqual(out.myTeam, DEFAULT_TEAM);
  assert.deepEqual(out.recent.map(e => e.g), ['A2', 'FF0', 'FF1', 'FF2', 'FF3', 'FF4', 'FF5', 'FF6']);
  assert.deepEqual(out.recent[1], { s: '2025-2026', g: 'FF0', t: 'Equipo 0' });
  // Sin `recent` válido, vistos vacío y mi equipo guardado se respeta.
  const mine = { name: 'Las Mesas B', season: '2025-2026', cat: 'benjamin', groupId: 'B2' };
  assert.deepEqual(loadStore(new MemoryStorage({ [STORE_KEY]: JSON.stringify({ myTeam: mine }) }), OPTIONS),
    { myTeam: mine, recent: [] });
});

test('saveStore: escribe solo {myTeam, recent} en futbol-base:v2 y no toca v1', () => {
  const v1 = JSON.stringify(fixture('favorites-v1'));
  const storage = new MemoryStorage({ [LEGACY_KEY]: v1 });
  const myTeam = { name: 'Las Mesas B', season: '2025-2026', cat: 'benjamin', groupId: 'B2' };
  const recentList = [{ s: '2025-2026', g: 'PG2', t: 'AD Huracán' }];
  assert.equal(saveStore(storage, { myTeam, recent: recentList, extra: 1 }), true);
  assert.deepEqual(JSON.parse(storage.getItem(STORE_KEY)), { myTeam, recent: recentList });
  assert.equal(storage.getItem(LEGACY_KEY), v1);
  assert.deepEqual(loadStore(storage, OPTIONS), { myTeam, recent: recentList });
});

test('addRecent: lo último visto va primero, sin duplicados y como máximo 8, sin mutar el estado', () => {
  const empty = { myTeam: DEFAULT_TEAM, recent: [] };
  let state = empty;
  for (let i = 0; i < 10; i++) state = addRecent(state, { s: '2025-2026', g: `FF${i}`, t: `Equipo ${i}` });
  assert.deepEqual(state.recent.map(e => e.g), ['FF9', 'FF8', 'FF7', 'FF6', 'FF5', 'FF4', 'FF3', 'FF2']);
  const again = addRecent(state, { s: '2025-2026', g: 'FF5', t: 'Equipo 5', extra: true });
  assert.deepEqual(again.recent.map(e => e.g), ['FF5', 'FF9', 'FF8', 'FF7', 'FF6', 'FF4', 'FF3', 'FF2']);
  assert.deepEqual(again.recent[0], { s: '2025-2026', g: 'FF5', t: 'Equipo 5' });
  assert.equal(again.myTeam, state.myTeam);
  assert.deepEqual(state.recent.map(e => e.g), ['FF9', 'FF8', 'FF7', 'FF6', 'FF5', 'FF4', 'FF3', 'FF2']);
  assert.deepEqual(empty.recent, []);
});

test('addRecent: el mismo equipo en otra temporada es otra entrada; una entrada inválida no cambia nada', () => {
  const state = addRecent({ myTeam: DEFAULT_TEAM, recent: [] }, { s: '2025-2026', g: 'PG2', t: 'AD Huracán' });
  assert.deepEqual(addRecent(state, { s: '2024-2025', g: 'PGC2', t: 'AD Huracán' }).recent, [
    { s: '2024-2025', g: 'PGC2', t: 'AD Huracán' },
    { s: '2025-2026', g: 'PG2', t: 'AD Huracán' },
  ]);
  for (const bad of [null, {}, { s: '2025-2026', g: 'PG2' }, { s: 2025, g: 'PG2', t: 'AD Huracán' }]) {
    assert.equal(addRecent(state, bad), state);
  }
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd /home/manolo/claude/futbol-base
node --test scripts/tests/test_rediseno_store.mjs 2>&1 | grep -E "ERR_MODULE_NOT_FOUND\]|^# (tests|pass|fail)"
```
Esperado:
```text
# Error [ERR_MODULE_NOT_FOUND]: Cannot find module '/home/manolo/claude/futbol-base/src/store.js' imported from /home/manolo/claude/futbol-base/scripts/tests/test_rediseno_store.mjs
# tests 1
# pass 0
# fail 1
```

- [ ] **Step 3: Write minimal implementation**

El código fuente no contiene los identificadores `localStorage`, `window`, `document`, `globalThis`, `PORTAL` ni los de los globales `data-*`, ni siquiera en comentarios, para no confundir a la comprobación de contrato de la Tarea 14.

Crear `src/store.js`:

```js
// Almacén persistente «futbol-base:v2» (spec §6.5): { myTeam, recent }.
//   myTeam = { name, season, cat, groupId }
//   recent = [{ s, g, t }], lo último visto primero, sin repetidos y como máximo 8.
//
// Módulo puro e importable en Node, sin DOM ni globales del navegador: recibe
// el Storage por parámetro (o una función que lo devuelve) y lo envuelve con
// safeStorage, así que un almacenamiento que falla (modo privado, cookies
// bloqueadas, cuota agotada o ninguno) deja la app con los valores por defecto
// en memoria. Nunca borra nada: ni futbol-base:favorites:v1 ni las claves
// antiguas `season`, `cat` y `theme`, que tampoco se leen.
import { normalizeTeamName } from './state.js';

export const STORE_KEY = 'futbol-base:v2';
export const LEGACY_KEY = 'futbol-base:favorites:v1';
export const MAX_RECENT = 8;

const CATS = ['benjamin', 'prebenjamin'];
const isText = value => typeof value === 'string' && value !== '';
const isObject = value => value !== null && typeof value === 'object' && !Array.isArray(value);

// `storage` es el Storage o una función que lo devuelve: con las cookies
// bloqueadas, solo con leer el Storage del navegador ya se lanza un error, y
// así también se captura.
export function safeStorage(storage) {
  const target = () => (typeof storage === 'function' ? storage() : storage);
  return {
    getItem(key) {
      try {
        const value = target().getItem(key);
        return typeof value === 'string' ? value : null;
      } catch {
        return null;
      }
    },
    setItem(key, value) {
      try {
        target().setItem(key, value);
        return true;
      } catch {
        return false;
      }
    },
  };
}

function readJSON(store, key) {
  const text = store.getItem(key);
  if (text === null) return undefined;
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

// Equipo de favorites.js (v1) y su clave `selected` (favoriteKey).
const isV1Team = team => isObject(team) && isText(team.name) && CATS.includes(team.cat) && isText(team.groupId);
const v1Key = team => `${team.cat}|${team.groupId}|${normalizeTeamName(team.name)}`;
const isMyTeam = team => isV1Team(team) && isText(team.season);
const isRecent = entry => isObject(entry) && isText(entry.s) && isText(entry.g) && isText(entry.t);

// Conserva el orden de `list`: descarta inválidos y repetidos, y corta en MAX_RECENT.
function cleanRecent(list) {
  const out = [];
  for (const entry of Array.isArray(list) ? list : []) {
    if (out.length === MAX_RECENT) break;
    if (!isRecent(entry) || out.some(e => e.s === entry.s && e.g === entry.g && e.t === entry.t)) continue;
    out.push({ s: entry.s, g: entry.g, t: entry.t });
  }
  return out;
}

// v1 = { teams: [{name, cat, groupId}], selected: 'cat|groupId|normalizeTeamName(name)' }.
// La temporada es el literal de la única con favoritos v1, nunca la del portal:
// si el portal ya está en otra, resolveMyTeam aplica el paso 1 (spec §6.3).
// Un grupo de torneo (MC*) se devuelve tal cual: los torneos no están en la
// temporada (van en Cups), así que resolveMyTeam no encuentra el grupo y aplica
// el paso 2 (o el 1, si la temporada ya cambió).
export function migrateV1(v1, legacySeason = '2025-2026') {
  if (!isObject(v1) || !Array.isArray(v1.teams)) return null;
  // Lo mismo que leía restoreFavorites (favorites.js): equipos válidos, hasta 30.
  const teams = v1.teams.filter(isV1Team).slice(0, 30);
  if (!teams.length) return null;
  const selected = teams.find(team => v1Key(team) === v1.selected) || teams[0];
  return {
    myTeam: { name: selected.name, season: legacySeason, cat: selected.cat, groupId: selected.groupId },
    recent: cleanRecent(teams
      .filter(team => v1Key(team) !== v1Key(selected))
      .map(team => ({ s: legacySeason, g: team.groupId, t: team.name }))),
  };
}

export function loadStore(storage, { defaultTeam, portalSeason }) {
  const store = safeStorage(storage);
  const fallback = { name: defaultTeam.name, season: portalSeason, cat: defaultTeam.cat, groupId: defaultTeam.groupId };
  const saved = readJSON(store, STORE_KEY);
  if (isObject(saved)) {
    const t = saved.myTeam;
    return {
      myTeam: isMyTeam(t) ? { name: t.name, season: t.season, cat: t.cat, groupId: t.groupId } : fallback,
      recent: cleanRecent(saved.recent),
    };
  }
  // Migración única: se escribe v2 y v1 se conserva.
  const migrated = migrateV1(readJSON(store, LEGACY_KEY));
  if (migrated) {
    saveStore(storage, migrated);
    return migrated;
  }
  return { myTeam: fallback, recent: [] };
}

// Devuelve false si no se pudo guardar (la app sigue con el estado en memoria).
export function saveStore(storage, state) {
  return safeStorage(storage).setItem(STORE_KEY, JSON.stringify({ myTeam: state.myTeam, recent: state.recent }));
}

export function addRecent(state, entry) {
  if (!isRecent(entry)) return state;
  return { ...state, recent: cleanRecent([{ s: entry.s, g: entry.g, t: entry.t }, ...(state.recent || [])]) };
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
cd /home/manolo/claude/futbol-base
node --test scripts/tests/test_rediseno_store.mjs 2>&1 | grep -E "^not ok|^# (tests|pass|fail)"
grep -nE '\b(localStorage|window|document|globalThis|PORTAL|BENJAMIN|PREBENJAMIN|HISTORY|SHIELDS)\b' src/store.js || echo "store.js sin globales"
```
Esperado, sin ninguna línea `not ok`:
```text
# tests 19
# pass 19
# fail 0
store.js sin globales
```

- [ ] **Step 5: Suites completas**

```bash
cd /home/manolo/claude/futbol-base
python3 -m pytest scripts/tests/ -q 2>&1 | tail -1
node --test scripts/tests/test_*.mjs 2>&1 | grep -E '^# (tests|pass|fail)'
```
Esperado:
- pytest: el mismo recuento que al terminar la tarea anterior, sin `failed` (esta tarea no añade pruebas de Python).
- node: el recuento anterior más 19, sin fallos (`# fail 0`). Ni `index.html` ni `src/app.js` cambian: la app actual no carga `store.js`.

- [ ] **Step 6: Commit**

```bash
cd /home/manolo/claude/futbol-base
git add src/store.js scripts/tests/test_rediseno_store.mjs
git commit -F - <<'EOF'
feat(rediseño): almacén futbol-base:v2 y migración de favoritos v1 (B1, tarea 10)

store.js guarda { myTeam, recent } (spec §6.5) con el Storage que recibe,
o con una función que lo devuelve, envuelto en safeStorage. Si el
almacenamiento falla, también al leer el Storage con las cookies
bloqueadas, la app usa los valores por defecto en memoria.

La migración única desde futbol-base:favorites:v1:
- resuelve selected con normalizeTeamName;
- fija la temporada literal 2025-2026, nunca la del portal;
- pasa los 8 primeros favoritos restantes a «Vistos hace poco»;
- escribe v2 y no borra v1;
- devuelve tal cual un grupo de torneo (MC*), para que resolveMyTeam
  aplique el paso 2.

Las claves antiguas season, cat y theme se ignoran. La app actual no carga
este módulo.

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01Sg56KK3oZgo8Ye7Snj6wG9
EOF
git show --stat --oneline HEAD | tail -1
```
Esperado: `2 files changed`, con `src/store.js` y `scripts/tests/test_rediseno_store.mjs`, nuevos.

---

### Task 11: `style-acta.css`: tokens, componentes y contraste AA (spec §3, §4.8, §4.9 y §8)

**Contexto**
- **Hoja completa del sistema «Acta».** Sustituirá a `style.css` en el corte de B2. En B1 no la enlaza nadie; lo comprueba la Tarea 14.
- **Aspecto de las maquetas aprobadas** (`.superpowers/brainstorm/650702-1790157592/content/acta.css`, `acta-roja.html`, `pantallas.html` y `pretemporada.html`):
  - cajas de 1,5 px en tinta, sin radio ni sombra;
  - casillas con etiqueta pequeña en `--mute` y dato en tinta de peso 800;
  - divisiones internas en `--rule` y filas separadas por `--line`;
  - cifras tabulares.
- **Resalte propio: el de la maqueta 6-1.** Fondo `--mark`, texto en tinta de peso 800 y `box-shadow: inset 3px 0 0 var(--ink)` en el primer elemento de la fila. **No hay óvalo**: ninguna regla `.is-mine` dibuja contornos, y el test lo exige.
- **Tokens exactos de §3.1.** Los claros van en `:root` y los oscuros en `@media (prefers-color-scheme: dark)`, con `color-scheme: light dark`. No hay selector de tema.
- **Contraste AA.** Calculado con la fórmula de WCAG 2.x: los 9 pares de §3.1 pasan en los dos temas, con un mínimo de 5,37:1 (claro, `on-win/win`), y también los dos que añaden los componentes: el monograma (`mute/line`) y las etiquetas de la fila propia (`mute/mark`). No hace falta tocar ningún token.

  | Par | Claro | Oscuro |
  |---|---|---|
  | `text/paper` | 16,47 | 15,44 |
  | `mute/paper` | 6,13 | 7,68 |
  | `ink/paper` | 6,16 | 5,89 |
  | `on-ink/ink` | 6,16 | 5,89 |
  | `ink/mark` | 5,42 | 5,41 |
  | `text/mark` | 14,47 | 14,19 |
  | `on-win/win` | 5,37 | 7,63 |
  | `on-draw/draw` | 13,29 | 9,09 |
  | `on-loss/loss` | 16,47 | 15,44 |
  | `mute/line` | 5,28 | 6,16 |
  | `mute/mark` | 5,39 | 7,06 |

  Dos pares que no usa ningún componente quedarían justos: tinta sobre `--line` en oscuro (4,72) y `--mute` sobre `--draw` en oscuro (4,52).
- **Decisiones de maquetación:**
  - **Casillas.** Rejilla con `gap: 1px` sobre fondo `--rule`: las divisiones salen solas con cualquier número de casillas, sin reglas `nth-child` ni `overflow: hidden`, que recortaría el contorno de foco. `cells()` elige la clase de columnas (`cells-1`, `-2`, `-3` o `-5`).
  - **Partes de una caja.** `.box > * + *` separa cada parte de la anterior con una regla `--rule`; entre filas de partido, la separación es `--line`.
  - **44 px.** Todo lo pulsable mide al menos 44 px, así que las filas de la tabla miden 44 px: son más altas que en las maquetas, pero manda §8.
  - **Foco en la tabla.** `.standings .st-team` no lleva `overflow`: recortaría el contorno de 2 px de `.st-link`, la entrada principal a `#/equipo`, y solo se verían dos rayas a los lados. El recorte con elipsis ya está en `.st-name`.
  - **Selector en escritorio** (decisión 15): nada oculta `.segmented` desde 1024 px, porque Casa y Fuera siguen ahí.
  - **Barra de navegación:**
    - en móvil y tableta va fija abajo, con 64 px + `safe-area-inset-bottom`; el `body` reserva ese hueco y `scroll-padding-bottom` evita que el foco quede debajo de la barra;
    - desde 1024 px es una fila de pestañas estática, y la activa lleva una barra de 3 px en tinta, la misma del resalte propio;
    - el icono activo va sobre un rectángulo de tinta con el trazo en `--on-ink` (uso de `--on-ink` de §3.1).
  - **Movimiento.** Solo transiciones de color de 0,15 s en segmentos, botones e icono de la barra, dentro de `prefers-reduced-motion: no-preference`. Sin `@keyframes`.
  - **Tipografía:**
    - `body` con Public Sans y `system-ui` de respaldo, 13,5 px y `tabular-nums` en todo el documento;
    - ninguna regla usa el atajo `font:`, que reiniciaría `tabular-nums`, salvo `font: inherit`;
    - `h1` a 19 px y títulos de bloque a 15 px, de la escala de §3.2;
    - la `@font-face` llega en la Tarea 13.
- **Vocabulario de clases** (lo emite `ui.js` y lo usarán las pantallas de B2):
  - base: `.page` (640 px, 1120 px desde 1024 px), `.vh` y `.skip-link`;
  - bloque y caja: `.block`, `.block-head`, `.block-title`, `.block-context` y `.box`;
  - casillas: `.cells` (`.cells-1`, `-2`, `-3` y `-5`), `.cell` (`.is-muted`), `.cell-label` y `.cell-value`;
  - partido: `.match-row` (`.is-mine`), `.match-time`, `.match-team`, `.match-home`, `.match-away`, `.match-name`, `.match-score` (`.is-pending`) y `.match-note`;
  - tabla: `.standings`, `.st-pos`, `.st-team`, `.st-num`, `.st-gf`, `.st-gc`, `.st-dg`, `.st-pts`, `.st-form`, `.st-link`, `.st-label`, `.st-name`, `.st-retired` y `tr.is-mine`;
  - forma: `.form`, `.form-chip`, `.form-g`, `.form-e` y `.form-p`;
  - selector y botonera: `.segmented`, `.segment` (activo con `[aria-current]`), `.buttons` y `.button` (`.is-main`);
  - escudo: `.crest`, `.crest-16`, `-32` y `-46`, `.mono`, `.mono-16`, `-32` y `-46`;
  - aviso y vacío: `.notice` y `.empty`;
  - barra: `.tabbar`, `.tab` (activo con `[aria-current]`), `.tab-icon` y `.tab-label`.

**Files:**
- Create: `style-acta.css`
- Test: `scripts/tests/test_rediseno_contrast.mjs` (tokens y contraste) y `scripts/tests/test_rediseno_css.mjs` (intención de los componentes)

**Interfaces:**
- Consumes: los tokens literales de la spec §3.1.
- Produces:
  - las variables `--paper`, `--text`, `--mute`, `--ink`, `--on-ink`, `--rule`, `--line`, `--mark`, `--win`, `--on-win`, `--draw`, `--on-draw`, `--loss`, `--on-loss` y `--gutter`;
  - el vocabulario de clases de arriba.
  - La Tarea 12 comprueba que cada clase que emite `ui.js` existe aquí.

- [ ] **Step 1: Write the failing test**

Crear `scripts/tests/test_rediseno_contrast.mjs`:

```js
// Plan B1, tarea 11: tokens de style-acta.css (spec §3.1) y contraste AA
// (spec §3.1, §8 y §11). Lee los tokens de los dos temas tal como están en el
// CSS: si alguien toca un color, el test recalcula el contraste real.
import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

// Reglas del CSS como {media, selector, body}; un nivel de @media.
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

const rules = parseCss(readFileSync(join(ROOT, 'style-acta.css'), 'utf8'));
const tokensOf = (rule) => Object.fromEntries(
  [...rule.body.matchAll(/--([a-z-]+)\s*:\s*(#[0-9A-Fa-f]{6})\s*;/g)].map(m => [m[1], m[2].toUpperCase()]));
const rootRule = (media) => rules.find(r => r.selector === ':root' && media(r.media));
const LIGHT = rootRule(m => m === null);
const DARK = rootRule(m => m !== null && /prefers-color-scheme:\s*dark/.test(m));

// Spec §3.1, literal.
const SPEC = {
  light: { paper: '#FFFFFF', text: '#1A1F2B', mute: '#5A6272', ink: '#C0182B', 'on-ink': '#FFFFFF',
    rule: '#E7B9BE', line: '#ECEEF2', mark: '#FBEDEE', win: '#1B7A43', 'on-win': '#FFFFFF',
    draw: '#E4E7EC', 'on-draw': '#1A1F2B', loss: '#1A1F2B', 'on-loss': '#FFFFFF' },
  dark: { paper: '#15171C', text: '#ECEEF2', mute: '#A3AAB8', ink: '#FF5A64', 'on-ink': '#15171C',
    rule: '#5A2A30', line: '#262A33', mark: '#2A1B1E', win: '#3FBF78', 'on-win': '#15171C',
    draw: '#3A3F4A', 'on-draw': '#ECEEF2', loss: '#ECEEF2', 'on-loss': '#15171C' },
};

// WCAG 2.x: luminancia relativa y razón de contraste.
const luminance = (hex) => {
  const [r, g, b] = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16) / 255)
    .map(c => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const ratio = (a, b) => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
};

// Spec §3.1 (texto/fondo), más dos pares que usan los componentes: el
// monograma (--mute sobre --line) y las etiquetas dentro de la fila propia
// (--mute sobre --mark).
const PAIRS = [['text', 'paper'], ['mute', 'paper'], ['ink', 'paper'], ['on-ink', 'ink'],
  ['ink', 'mark'], ['text', 'mark'], ['on-win', 'win'], ['on-draw', 'draw'], ['on-loss', 'loss'],
  ['mute', 'line'], ['mute', 'mark']];

test('la fórmula de contraste da los valores de referencia', () => {
  assert.equal(ratio('#000000', '#FFFFFF').toFixed(2), '21.00');
  assert.equal(ratio('#FFFFFF', '#FFFFFF').toFixed(2), '1.00');
  assert.ok(ratio('#777777', '#FFFFFF') < 4.5, '#777 sobre blanco no llega a AA (4,48)');
});

test('los tokens claros están en :root y los oscuros en prefers-color-scheme: dark', () => {
  assert.ok(LIGHT, ':root de nivel superior no encontrado');
  assert.ok(DARK, ':root dentro de @media (prefers-color-scheme: dark) no encontrado');
  assert.match(LIGHT.body, /color-scheme:\s*light dark/);
});

for (const theme of ['light', 'dark']) {
  test(`tema ${theme === 'light' ? 'claro' : 'oscuro'}: tokens exactos de la spec §3.1`, () => {
    const got = tokensOf(theme === 'light' ? LIGHT : DARK);
    for (const [name, value] of Object.entries(SPEC[theme])) {
      assert.equal(got[name], value, `--${name}`);
    }
  });

  test(`tema ${theme === 'light' ? 'claro' : 'oscuro'}: pares de texto con contraste AA (≥ 4,5:1)`, () => {
    const t = tokensOf(theme === 'light' ? LIGHT : DARK);
    const bad = PAIRS
      .map(([fg, bg]) => [fg, bg, ratio(t[fg], t[bg])])
      .filter(([, , r]) => !(r >= 4.5))
      .map(([fg, bg, r]) => `${fg}/${bg} = ${r.toFixed(2)}:1`);
    assert.deepEqual(bad, []);
  });
}
```

Crear `scripts/tests/test_rediseno_css.mjs`:

```js
// Plan B1, tarea 11: intención de style-acta.css (spec §3.2-§3.4, §4.8 y §8).
// Comprueba reglas, no píxeles: la verificación visual va aparte, con capturas.
import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const SRC = readFileSync(join(ROOT, 'style-acta.css'), 'utf8');

// Reglas del CSS como {media, selector, body}; un nivel de @media.
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

const RULES = parseCss(SRC);
const DESKTOP = (m) => m !== null && /min-width:\s*1024px/.test(m);
// Cuerpo de las reglas cuyo selector (en una lista separada por comas) es
// exactamente `selector`, dentro de la media indicada (null = nivel superior).
function decl(selector, media = (m) => m === null) {
  const found = RULES.filter(r => media(r.media) && r.selector.split(',').map(s => s.trim()).includes(selector));
  assert.ok(found.length, `no hay regla para «${selector}»`);
  return found.map(r => r.body).join(';');
}

test('cifras tabulares y Public Sans con system-ui de respaldo en todo el documento', () => {
  const body = decl('body');
  assert.match(body, /font-variant-numeric:\s*tabular-nums/);
  assert.match(body, /font-family:\s*'Public Sans',\s*system-ui/);
  assert.match(body, /background:\s*var\(--paper\)/);
  assert.match(body, /color:\s*var\(--text\)/);
  // El atajo font: reinicia font-variant-numeric; solo vale `font: inherit`.
  const atajos = RULES.filter(r => /(^|;)\s*font\s*:/.test(r.body) && !/(^|;)\s*font\s*:\s*inherit\s*(;|$)/.test(r.body));
  assert.deepEqual(atajos.map(r => r.selector), []);
});

test('etiquetas en frase normal: nada en mayúsculas forzadas', () => {
  assert.doesNotMatch(SRC, /text-transform:\s*uppercase/);
  assert.doesNotMatch(SRC, /font-variant(-caps)?:\s*(all-)?small-caps/);
});

test('foco visible: contorno de 2 px en tinta', () => {
  assert.match(decl(':focus-visible'), /outline:\s*2px solid var\(--ink\)/);
});

test('caja: borde de 1,5 px en tinta, sin radio ni sombra; casillas con etiqueta y dato', () => {
  const box = decl('.box');
  assert.match(box, /border:\s*1\.5px solid var\(--ink\)/);
  assert.doesNotMatch(box, /border-radius|box-shadow/);
  assert.match(decl('.cells'), /background:\s*var\(--rule\)/, 'las divisiones internas van en --rule');
  assert.match(decl('.cell-label'), /color:\s*var\(--mute\)/);
  const valor = decl('.cell-value');
  assert.match(valor, /color:\s*var\(--ink\)/);
  assert.match(valor, /font-weight:\s*800/);
  const titulo = decl('.block-title');
  assert.match(titulo, /color:\s*var\(--ink\)/);
  assert.match(titulo, /font-weight:\s*800/);
  assert.match(decl('.block-context'), /color:\s*var\(--mute\)/);
});

test('resalte propio: fondo --mark, tinta 800 y barra de 3 px; nunca el óvalo', () => {
  for (const [fila, primero] of [['.standings tr.is-mine > *', '.standings tr.is-mine > :first-child'],
    ['.match-row.is-mine', '.match-row.is-mine']]) {
    const d = decl(fila);
    assert.match(d, /background:\s*var\(--mark\)/, fila);
    assert.match(d, /color:\s*var\(--ink\)/, fila);
    assert.match(d, /font-weight:\s*800/, fila);
    assert.match(decl(primero), /box-shadow:\s*inset 3px 0 0 var\(--ink\)/, primero);
  }
  const propias = RULES.filter(r => /is-mine/.test(r.selector)).map(r => r.body).join(';');
  assert.doesNotMatch(propias, /border-radius|outline|border:/, 'el resalte no dibuja ningún contorno');
  assert.doesNotMatch(SRC, /ellipse|\.pen\b/);
});

test('foco visible en los enlaces de la tabla: la celda del equipo no recorta el contorno', () => {
  assert.doesNotMatch(decl('.standings .st-team'), /overflow(-[xy])?\s*:\s*(hidden|clip|auto|scroll)/);
  const name = decl('.st-name');
  assert.match(name, /overflow:\s*hidden/, 'el recorte va en el nombre');
  assert.match(name, /text-overflow:\s*ellipsis/);
  assert.doesNotMatch(decl('.st-link'), /overflow/);
});

test('el selector segmentado sigue visible en escritorio (Todas, Casa y Fuera)', () => {
  const desktop = RULES.filter(r => DESKTOP(r.media) && /\.segment/.test(r.selector)).map(r => r.body).join(';');
  assert.doesNotMatch(desktop, /display:\s*none|visibility:\s*hidden/);
  assert.doesNotMatch(SRC, /\.segmented[^{]*\{[^}]*display:\s*none/);
});

test('fila de partido y tabla: nombres con elipsis, filas separadas por --line', () => {
  for (const sel of ['.match-name', '.st-name']) {
    const d = decl(sel);
    assert.match(d, /text-overflow:\s*ellipsis/, sel);
    assert.match(d, /white-space:\s*nowrap/, sel);
  }
  assert.match(decl('.standings thead th'), /border-bottom:\s*1\.5px solid var\(--ink\)/);
  assert.match(decl('.standings th'), /border-bottom:\s*1px solid var\(--line\)/);
  assert.match(decl('.box > .match-row + .match-row'), /border-top-color:\s*var\(--line\)/);
});

test('forma: G, E y P con sus colores; la P nunca en tinta roja', () => {
  for (const [c, fondo, texto] of [['g', 'win', 'on-win'], ['e', 'draw', 'on-draw'], ['p', 'loss', 'on-loss']]) {
    const d = decl(`.form-${c}`);
    assert.match(d, new RegExp(`background:\\s*var\\(--${fondo}\\)`), `.form-${c}`);
    assert.match(d, new RegExp(`color:\\s*var\\(--${texto}\\)`), `.form-${c}`);
  }
  const chip = decl('.form-chip');
  const px = +chip.match(/width:\s*(\d+)px/)[1];
  assert.ok(px >= 15 && px <= 18, `círculos de 15-18 px, no ${px}`);
});

test('segmento activo y acción principal: relleno de tinta con texto --on-ink', () => {
  for (const sel of ['.segment[aria-current]', '.button.is-main', '.tab[aria-current] .tab-icon']) {
    const d = decl(sel);
    assert.match(d, /background:\s*var\(--ink\)/, sel);
    assert.match(d, /color:\s*var\(--on-ink\)/, sel);
  }
});

test('escudo con object-fit y monograma gris del mismo tamaño', () => {
  assert.match(decl('.crest'), /object-fit:\s*contain/);
  assert.match(decl('.mono'), /background:\s*var\(--line\)/);
  for (const px of [16, 32, 46]) {
    assert.match(decl(`.crest-${px}`), new RegExp(`width:\\s*${px}px`));
    assert.match(decl(`.mono-${px}`), new RegExp(`height:\\s*${px}px`));
  }
});

test('aviso en --mute con término en negrita; vacío con borde discontinuo en --rule', () => {
  assert.match(decl('.notice'), /color:\s*var\(--mute\)/);
  assert.match(decl('.notice b'), /color:\s*var\(--text\)/);
  assert.match(decl('.empty'), /border:\s*1\.5px dashed var\(--rule\)/);
});

test('barra: abajo en móvil con safe-area y el cuerpo no queda tapado', () => {
  const bar = decl('.tabbar');
  assert.match(bar, /position:\s*fixed/);
  assert.match(bar, /bottom:\s*0/);
  assert.match(bar, /height:\s*calc\(64px \+ env\(safe-area-inset-bottom\)\)/);
  assert.match(bar, /padding-bottom:\s*env\(safe-area-inset-bottom\)/);
  assert.match(decl('body'), /padding-bottom:\s*calc\(64px \+ env\(safe-area-inset-bottom\)\)/);
});

test('barra: pestañas arriba desde 1024 px, sin posición fija ni hueco inferior', () => {
  assert.match(decl('.tabbar', DESKTOP), /position:\s*static/);
  assert.match(decl('body', DESKTOP), /padding-bottom:\s*0/);
  assert.match(decl('.tab[aria-current]', DESKTOP), /box-shadow:\s*inset 0 -3px 0 var\(--ink\)/);
  assert.match(decl('.page', DESKTOP), /max-width:\s*1120px/);
  assert.match(decl('.page'), /max-width:\s*640px/, 'móvil y tableta, centrado a 640 px');
});

test('todo lo pulsable mide al menos 44 px', () => {
  for (const sel of ['.tab', '.segment', '.button', '.match-row', '.st-link']) {
    assert.match(decl(sel), /min-height:\s*44px/, sel);
  }
});

test('movimiento solo con prefers-reduced-motion: no-preference y sin animaciones de entrada', () => {
  const fuera = RULES.filter(r => /(^|;)\s*(transition|animation)[\w-]*\s*:/.test(r.body)
    && !(r.media && /prefers-reduced-motion:\s*no-preference/.test(r.media)));
  assert.deepEqual(fuera.map(r => r.selector), []);
  assert.doesNotMatch(SRC, /@keyframes/);
});

test('saltar al contenido: oculto hasta recibir el foco; utilidad visualmente oculta', () => {
  assert.match(decl('.skip-link'), /transform:\s*translateY\(/);
  assert.match(decl('.skip-link:focus'), /transform:\s*none/);
  assert.match(decl('.vh'), /clip-path:\s*inset\(50%\)/);
});

test('sin emoji en la hoja de estilos', () => {
  assert.doesNotMatch(SRC, /\p{Extended_Pictographic}/u);
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd /home/manolo/claude/futbol-base
node --test scripts/tests/test_rediseno_contrast.mjs scripts/tests/test_rediseno_css.mjs 2>&1 | grep -E '^# (tests|pass|fail)|ENOENT: no such file'
```
Esperado: los dos ficheros fallan al cargar:
```text
# Error: ENOENT: no such file or directory, open '/home/manolo/claude/futbol-base/style-acta.css'
# Error: ENOENT: no such file or directory, open '/home/manolo/claude/futbol-base/style-acta.css'
# tests 2
# pass 0
# fail 2
```

- [ ] **Step 3: Write minimal implementation**

Crear `style-acta.css`:

```css
/* Sistema visual «Acta» en tinta roja (spec §3).
 * Sustituye a style.css en el corte de B2; hasta entonces no lo enlaza nadie.
 * Tema claro por defecto; el oscuro solo si el sistema lo pide (spec §4.9). */

:root {
  color-scheme: light dark;
  --paper: #FFFFFF;
  --text: #1A1F2B;
  --mute: #5A6272;
  --ink: #C0182B;
  --on-ink: #FFFFFF;
  --rule: #E7B9BE;
  --line: #ECEEF2;
  --mark: #FBEDEE;
  --win: #1B7A43;
  --on-win: #FFFFFF;
  --draw: #E4E7EC;
  --on-draw: #1A1F2B;
  --loss: #1A1F2B;
  --on-loss: #FFFFFF;
  --gutter: 14px;
}

@media (prefers-color-scheme: dark) {
  :root {
    --paper: #15171C;
    --text: #ECEEF2;
    --mute: #A3AAB8;
    --ink: #FF5A64;
    --on-ink: #15171C;
    --rule: #5A2A30;
    --line: #262A33;
    --mark: #2A1B1E;
    --win: #3FBF78;
    --on-win: #15171C;
    --draw: #3A3F4A;
    --on-draw: #ECEEF2;
    --loss: #ECEEF2;
    --on-loss: #15171C;
  }
}

/* ── Base ─────────────────────────────────────────────────────────────── */

*, *::before, *::after { box-sizing: border-box; }

html {
  -webkit-text-size-adjust: 100%;
  text-size-adjust: 100%;
  /* El foco nunca queda debajo de la barra fija. */
  scroll-padding-bottom: calc(64px + env(safe-area-inset-bottom));
}

body {
  margin: 0;
  background: var(--paper);
  color: var(--text);
  font-family: 'Public Sans', system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif;
  font-size: 13.5px;
  line-height: 1.45;
  font-variant-numeric: tabular-nums;
  padding-bottom: calc(64px + env(safe-area-inset-bottom));
}

h1, h2, h3, p, dl, dd { margin: 0; }
h1 { font-size: 19px; font-weight: 800; line-height: 1.2; }
a { color: var(--ink); text-underline-offset: 3px; }
button, input, select, textarea { font: inherit; color: inherit; }
button { background: none; border: 0; padding: 0; cursor: pointer; }
abbr[title] { text-decoration: none; }

:focus-visible { outline: 2px solid var(--ink); outline-offset: 2px; }

.page { max-width: 640px; margin: 0 auto; padding: 0 var(--gutter) 24px; }

.vh {
  position: absolute;
  width: 1px;
  height: 1px;
  margin: -1px;
  padding: 0;
  overflow: hidden;
  clip-path: inset(50%);
  white-space: nowrap;
  border: 0;
}

.skip-link {
  position: fixed;
  top: 8px;
  left: 8px;
  z-index: 100;
  padding: 10px 14px;
  background: var(--ink);
  color: var(--on-ink);
  font-weight: 700;
  text-decoration: none;
  transform: translateY(calc(-100% - 16px));
}
.skip-link:focus { transform: none; }

/* ── Bloque y caja ────────────────────────────────────────────────────── */

.block { margin-top: 18px; }
.block-head {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  justify-content: space-between;
  column-gap: 8px;
  margin-bottom: 7px;
}
.block-title { font-size: 15px; font-weight: 800; line-height: 1.25; color: var(--ink); }
.block-context { min-width: 0; font-size: 12.5px; font-weight: 600; color: var(--mute); text-align: right; }

.box { border: 1.5px solid var(--ink); background: var(--paper); }
.box > * + * { border-top: 1px solid var(--rule); }

/* ── Casillas ─────────────────────────────────────────────────────────── */

.cells {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 1px;
  background: var(--rule);
}
.cells-1 { grid-template-columns: minmax(0, 1fr); }
.cells-2 { grid-template-columns: repeat(2, minmax(0, 1fr)); }
.cells-3 { grid-template-columns: repeat(3, minmax(0, 1fr)); }
.cells-5 { grid-template-columns: repeat(5, minmax(0, 1fr)); }
.cell { min-width: 0; padding: 6px 8px 7px; background: var(--paper); }
.cell-label { font-size: 11.5px; color: var(--mute); }
.cell-value { font-size: 17px; font-weight: 800; line-height: 1.3; color: var(--ink); overflow-wrap: anywhere; }
.cell.is-muted .cell-value { font-size: 13.5px; font-weight: 600; color: var(--mute); }

/* ── Fila de partido ──────────────────────────────────────────────────── */

.match-row {
  display: grid;
  grid-template-columns: 40px minmax(0, 1fr) 52px minmax(0, 1fr);
  align-items: center;
  gap: 4px;
  min-height: 44px;
  padding: 8px 6px;
  color: var(--text);
  text-decoration: none;
}
.box > .match-row + .match-row { border-top-color: var(--line); }
.match-time { font-size: 11.5px; color: var(--mute); }
.match-team { display: flex; align-items: center; gap: 5px; min-width: 0; }
.match-home { justify-content: flex-end; text-align: right; }
.match-away { justify-content: flex-start; }
.match-name { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.match-score {
  padding: 3px 0;
  border: 1px solid var(--rule);
  font-size: 15px;
  font-weight: 800;
  line-height: 1.3;
  text-align: center;
}
.match-score.is-pending { color: var(--mute); font-weight: 600; }
.match-note { grid-column: 2 / -1; font-size: 12.5px; font-weight: 600; color: var(--mute); text-align: center; }
.match-row.is-mine {
  background: var(--mark);
  color: var(--ink);
  font-weight: 800;
  box-shadow: inset 3px 0 0 var(--ink);
}
.match-row.is-mine .match-score { border-color: var(--ink); }
.match-row.is-mine .match-time { color: var(--ink); }

/* ── Tabla ────────────────────────────────────────────────────────────── */

.standings { width: 100%; border-collapse: collapse; table-layout: fixed; }
.standings th, .standings td {
  height: 44px;
  padding: 0 3px;
  border-bottom: 1px solid var(--line);
  text-align: right;
}
.standings thead th {
  height: auto;
  padding: 6px 3px;
  border-bottom: 1.5px solid var(--ink);
  font-size: 11.5px;
  font-weight: 600;
  color: var(--mute);
  white-space: nowrap;
}
.standings tbody tr:last-child > * { border-bottom: 0; }
.standings .st-pos { width: 24px; text-align: center; color: var(--mute); }
/* Sin overflow: el recorte va en .st-name, y así no se come el contorno de foco de .st-link. */
.standings .st-team { text-align: left; font-weight: 400; }
.standings .st-num { width: 24px; }
.standings .st-gf, .standings .st-gc { width: 32px; }
.standings .st-dg { width: 38px; }
.standings .st-pts { width: 30px; font-weight: 800; }
.standings .st-form { width: 98px; padding-left: 6px; text-align: left; }
.st-link, .st-label {
  display: flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
  min-height: 44px;
  color: inherit;
  text-decoration: none;
}
.st-name { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.st-retired { font-size: 11.5px; font-weight: 400; color: var(--mute); }
.standings tr.is-mine > * { background: var(--mark); color: var(--ink); font-weight: 800; }
.standings tr.is-mine > :first-child { box-shadow: inset 3px 0 0 var(--ink); }

/* ── Forma ────────────────────────────────────────────────────────────── */

.form { display: inline-flex; gap: 2px; vertical-align: middle; }
.form-chip {
  display: inline-grid;
  place-items: center;
  width: 16px;
  height: 16px;
  border-radius: 50%;
  font-size: 10px;
  font-weight: 800;
  line-height: 1;
}
.form-g { background: var(--win); color: var(--on-win); }
.form-e { background: var(--draw); color: var(--on-draw); }
.form-p { background: var(--loss); color: var(--on-loss); }

/* ── Selector segmentado y botonera ───────────────────────────────────── */

.segmented { display: flex; border: 1.5px solid var(--ink); }
.segment {
  display: flex;
  flex: 1 1 0;
  align-items: center;
  justify-content: center;
  min-width: 0;
  min-height: 44px;
  padding: 0 4px;
  font-size: 13.5px;
  font-weight: 700;
  color: var(--ink);
  text-align: center;
  text-decoration: none;
}
.segment + .segment { border-left: 1px solid var(--rule); }
.segment[aria-current] { background: var(--ink); color: var(--on-ink); }

.buttons { display: grid; grid-auto-flow: column; grid-auto-columns: minmax(0, 1fr); }
.button {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 44px;
  padding: 0 4px;
  font-size: 13.5px;
  font-weight: 700;
  color: var(--ink);
  text-align: center;
  text-decoration: none;
}
.button + .button { border-left: 1px solid var(--rule); }
.button.is-main { background: var(--ink); color: var(--on-ink); }

/* ── Escudo y monograma ───────────────────────────────────────────────── */

.crest { display: inline-block; flex: none; object-fit: contain; vertical-align: middle; }
.mono {
  display: inline-flex;
  flex: none;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
  background: var(--line);
  color: var(--mute);
  font-weight: 800;
  line-height: 1;
  letter-spacing: -0.02em;
  vertical-align: middle;
}
.crest-16, .mono-16 { width: 16px; height: 16px; }
.crest-32, .mono-32 { width: 32px; height: 32px; }
.crest-46, .mono-46 { width: 46px; height: 46px; }
.mono-16 { font-size: 7.5px; }
.mono-32 { font-size: 12px; }
.mono-46 { font-size: 16px; }

/* ── Aviso y vacío ────────────────────────────────────────────────────── */

.notice { margin-top: 10px; font-size: 12.5px; color: var(--mute); }
.notice b { font-weight: 700; color: var(--text); }
.empty { padding: 12px; border: 1.5px dashed var(--rule); color: var(--mute); }

/* ── Barra de navegación: abajo en móvil y tableta ────────────────────── */

.tabbar {
  position: fixed;
  right: 0;
  bottom: 0;
  left: 0;
  z-index: 20;
  display: flex;
  justify-content: center;
  height: calc(64px + env(safe-area-inset-bottom));
  padding-bottom: env(safe-area-inset-bottom);
  border-top: 1.5px solid var(--ink);
  background: var(--paper);
}
.tab {
  display: flex;
  flex: 1 1 0;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 3px;
  max-width: 160px;
  min-height: 44px;
  font-size: 11.5px;
  font-weight: 600;
  color: var(--mute);
  text-decoration: none;
}
.tab-icon { display: grid; place-items: center; width: 44px; height: 28px; }
.tab-icon svg { width: 22px; height: 22px; }
.tab-label { line-height: 1.2; }
.tab[aria-current] { font-weight: 800; color: var(--ink); }
.tab[aria-current] .tab-icon { background: var(--ink); color: var(--on-ink); }

/* ── Escritorio: pestañas arriba, 1120 px de ancho ────────────────────── */

@media (min-width: 1024px) {
  html { scroll-padding-bottom: 0; }
  body { padding-bottom: 0; }
  .page { max-width: 1120px; }
  .tabbar {
    position: static;
    justify-content: flex-start;
    gap: 4px;
    height: auto;
    padding-bottom: 0;
    border-top: 0;
    background: transparent;
  }
  .tab {
    flex: none;
    flex-direction: row;
    gap: 6px;
    max-width: none;
    min-height: 48px;
    padding: 0 14px;
    font-size: 13.5px;
  }
  .tab-icon { width: auto; height: auto; }
  .tab-icon svg { width: 20px; height: 20px; }
  .tab[aria-current] { box-shadow: inset 0 -3px 0 var(--ink); }
  .tab[aria-current] .tab-icon { background: transparent; color: inherit; }
}

/* ── Enlaces con puntero ──────────────────────────────────────────────── */

@media (hover: hover) {
  a.match-row:hover .match-name,
  .st-link:hover .st-name,
  a.segment:not([aria-current]):hover,
  a.button:not(.is-main):hover { text-decoration: underline; }
}

/* ── Movimiento: solo como respuesta a una acción (spec §3.4) ─────────── */

@media (prefers-reduced-motion: no-preference) {
  .segment, .button, .tab-icon { transition: background-color 0.15s ease, color 0.15s ease; }
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
cd /home/manolo/claude/futbol-base
node --test scripts/tests/test_rediseno_contrast.mjs scripts/tests/test_rediseno_css.mjs 2>&1 | grep -E '^# (tests|pass|fail)'
```
Esperado: 6 pruebas de tokens y contraste y 18 de intención.
```text
# tests 24
# pass 24
# fail 0
```

- [ ] **Step 5: Suites completas**

```bash
cd /home/manolo/claude/futbol-base
python3 -m pytest scripts/tests/ -q 2>&1 | tail -1
node --test scripts/tests/test_*.mjs 2>&1 | grep -E '^# (tests|pass|fail)'
```
Esperado:
- pytest: el mismo recuento que al terminar la tarea anterior, sin `failed` (esta tarea no añade pruebas de Python).
- node: el recuento anterior más 24, sin fallos (`# fail 0`). `test_uxui_fixes` y `test_uxui2_fixes` siguen leyendo `style.css`, que no cambia.

- [ ] **Step 6: Commit**

```bash
cd /home/manolo/claude/futbol-base
git add style-acta.css scripts/tests/test_rediseno_contrast.mjs scripts/tests/test_rediseno_css.mjs
git commit -F - <<'EOF'
feat(rediseño): hoja style-acta.css con tokens y componentes «Acta» (B1, tarea 11)

Tokens de la spec §3.1, claros en :root y oscuros bajo
prefers-color-scheme: dark, y las clases de los componentes de §3.3:
caja, bloque, casillas, fila de partido, tabla con el resalte propio de
la maqueta 6-1 (fondo --mark, tinta 800 y barra de 3 px; sin óvalo),
forma G/E/P, selector segmentado, botonera, escudo y monograma, aviso,
vacío y barra de navegación (abajo con safe-area en móvil, pestañas
arriba desde 1024 px). Foco visible de 2 px en tinta, pulsables de
44 px, cifras tabulares y movimiento solo con
prefers-reduced-motion: no-preference. No la enlaza nadie todavía.

- test_rediseno_contrast: tokens exactos de los dos temas y contraste
  AA (>= 4,5:1) de los pares de §3.1, más el monograma y las etiquetas
  de la fila propia; mínimo 5,37:1.
- test_rediseno_css: intención de cada componente, barra en móvil y en
  escritorio, 44 px, foco sin recortar en la tabla, selector visible en
  escritorio, movimiento, sin mayúsculas forzadas ni emoji.

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01Sg56KK3oZgo8Ye7Snj6wG9
EOF
git show --stat --oneline HEAD | tail -1
```
Esperado: `3 files changed`: `style-acta.css` y las dos pruebas.

---

### Task 12: `ui.js`, componentes del sistema visual (spec §3.3, §3.5, §4.1 y §8)

**Contexto**
- Funciones puras que devuelven `Html` y no leen globales. Las pruebas miran el HTML que producen, con copias literales de datos reales:
  - la tabla final de PG2 2025-26 y su jornada 30;
  - la tanda de cuartos de la Copa Plata de la Maspalomas Cup (MCPK1);
  - nombres de la federación con comillas: 'VICTORIA, REAL CLUB "B"' y 'MESAS, U.D. LAS "B"', el del propio club (foco de revisión 2);
  - entradas reales de `SHIELDS`.
- **Escudo (`crest`):**
  - Se busca el fichero exacto en `shields` y, si no está, el normalizado con `normalizeTeamName` de `src/state.js`. Es la regla de §5.2 («exacto o normalizado»), que quita el paso por subcadena de `teamBadge`. El índice normalizado se construye una vez por objeto de escudos (`WeakMap`).
  - `normalizeTeamName` vive en `state.js`, que sobrevive al corte de B2 (spec §5.2). Las restricciones globales permiten importar `state.js` y `links.js`, y así se evita una tercera copia de la función: ya hay una en `check_missing_shields.py` y otra en `test_js_modules.mjs`.
  - Pide `./escudos/s/<fichero sin extensión>.png`, así que un `.jpg` tiene miniatura `.png`. Lleva el original en `data-full` y el nombre en `data-name`, para el monograma.
  - Es decorativo, porque el nombre va siempre al lado: `alt=""`. Lleva `width`, `height` y `decoding="async"`, y `loading="lazy"` salvo con `lazy: false` (primera pantalla).
  - Solo admite 16, 32 o 46 px; con otro tamaño lanza `RangeError`.
  - Sin escudo, `monogram`: dos iniciales, sin puntuación ni siglas de club, en un círculo `--line`/`--mute` con `aria-hidden`.
- **`crestFallback(img)`:** es el siguiente paso de la cadena miniatura → original → monograma (spec §5.4) para un `<img class="crest">` que falla. B2 lo llama desde un manejador de `error` en captura. Hace falta desde el primer día de B2, porque `escudos/s/` no existe hasta B4.
- **`matchRow`:**
  - `today` es obligatorio: sin él lanza `TypeError`, porque el estado depende del reloj inyectado.
  - Con marcador pinta «2–7», con raya. Sin marcador pinta «–» (`.is-pending`), y añade la nota «sin resultado» o «sin fecha» cuando corresponde.
  - En una eliminatoria empatada dice «<equipo> pasó por penaltis (3–2)».
  - `mine` añade `.is-mine` y el texto oculto «Partido de mi equipo.».
- **`standingsTable`:**
  - columnas por vista según §4.4, con #, Equipo y Pts siempre;
  - `view: 'todas'` para escritorio (≥1024 px), donde el selector también ofrece `casa` y `fuera` (decisión 15); una vista desconocida cae en `puntos`, porque llega de la URL;
  - la forma sale de `row.form`: letras G/E/P, opcional, pintadas en el orden recibido. Según la decisión 3, B2 las saca de `lastResults(team, group)` (Tarea 5), en orden cronológico, con el más antiguo a la izquierda;
  - `mine` es el nombre exacto del equipo propio: su fila lleva `.is-mine` y « (mi equipo)» oculto;
  - `<th scope="col">` con `<abbr title>`, `<th scope="row">` en el equipo y `<caption class="vh">` (por defecto «Clasificación»);
  - DG con signo: «+154», «−30» (U+2212);
  - retirados con «retirado» en las vistas con forma.
- **`formChips`:** solo admite G, E y P; cualquier otra letra (W, D, L…) lanza `RangeError`.
- **`segmented`:** enlaces, con `aria-current="true"` en el activo.
- **`tabbar(active, { current })`:**
  - 4 enlaces (`#/`, `#/jornada`, `#/tabla` y `#/explorar`) con iconos SVG propios: escudo, calendario, tabla y lupa, con `aria-hidden` y `focusable="false"`;
  - `aria-current="page"` en el destino activo, o `"true"` con `current: 'true'` en las pantallas secundarias (§4.1);
  - un destino desconocido lanza `RangeError`.
- **Extensiones del contrato** (ya recogidas en «Contratos»): `crest(…, { lazy })`, `crestFallback`, `standingsTable` con `view: 'todas'` y `row.form`, `cells` con `muted`, y `tabbar(…, { current })`.

**Files:**
- Create: `src/ui.js`
- Test: `scripts/tests/test_rediseno_ui.mjs`

**Interfaces:**
- Consumes:
  - `html` de `src/html.js` (Tarea 2);
  - `matchState(match, todayISO)` de `src/model.js` (Tarea 3);
  - `normalizeTeamName` de `src/state.js` (existente);
  - las clases de `style-acta.css` (Tarea 11).
- Produces:
  - `crest(name, { size = 16, shields = {}, lazy = true })` y `monogram(name, size = 16)`;
  - `crestFallback(img)`: `'full'`, `'mono'` o `null`;
  - `box(content, { title, context })` y `cells(items)`, con items `{label, value, muted?}`;
  - `matchRow(match, { mine, today, shields, href })`;
  - `standingsTable(rows, { view, mine, shields, hrefFor, caption })`, con `view` en `puntos`, `goles`, `forma`, `casa`, `fuera` o `todas`;
  - `formChips(letters)`, `segmented(options, active, hrefFor)`, `notice(term, text)`, `empty(text)` y `tabbar(active, { current = 'page' })`.

- [ ] **Step 1: Write the failing test**

Crear `scripts/tests/test_rediseno_ui.mjs`:

```js
// Plan B1, tarea 12: componentes de ui.js (spec §3.3, §3.5 y §8) sobre el HTML
// que producen. Los datos son copias literales de datos reales: la tabla final
// de PG2 2025-26, su jornada 30, la tanda de la Maspalomas Cup y nombres de la
// federación con comillas.
import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  crest, crestFallback, monogram, box, cells, matchRow, standingsTable,
  formChips, segmented, notice, empty, tabbar,
} from '../../src/ui.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const TODAY = '2026-09-23';

// Entradas reales de SHIELDS (data-shields.js, 23/09/2026).
const SHIELDS = {
  'Unión Viera': 'unionviera.png', 'Acodetti CF': 'acodetti.png', 'AD Huracán': 'huracan.png',
  'Las Mesas Hu.': 'lasMesasEscudo.png', 'UD Telde': 'udTeldeEscudo.png', 'CD Batán': 'batanEscudo.png',
  'Santa Brígida': 'villa.png', 'Jovero-Las Rosas': 'joveroLasRosas.jpg',
  'VICTORIA, REAL CLUB "B"': 'victoria2019.png', 'MESAS, U.D. LAS "B"': 'lasMesasEscudo.png',
};

// PG2 2025-26, clasificación final (data-prebenjamin.js), en la forma Row del modelo.
const ROW = (pos, team, pts, pj, g, e, p, gf, gc, dg, extra = {}) =>
  ({ pos, team, pts, pj, g, e, p, gf, gc, dg, retired: false, ...extra });
const PG2 = [
  ROW(1, 'Unión Viera', 79, 28, 26, 1, 1, 190, 36, 154, { form: ['G', 'G', 'P', 'G', 'G'] }),
  ROW(2, 'Acodetti', 78, 28, 26, 0, 2, 196, 57, 139, { form: ['G', 'G', 'G', 'G', 'G'] }),
  ROW(8, 'Telde', 40, 28, 13, 1, 14, 86, 98, -12, { form: ['P', 'G', 'G', 'P', 'G'] }),
  ROW(9, 'Las Mesas Hu.', 37, 28, 12, 1, 15, 90, 120, -30, { form: ['E', 'P', 'P', 'G', 'P'] }),
  ROW(15, 'CD Batán', 0, 28, 0, 0, 28, 0, 84, -84, { retired: true }),
];

// PG2, jornada 30 (data-history.js): [2026-06-02, Las Mesas Hu., AD Huracán, 2, 7, null, 17:30, null].
const J30 = { season: '2025-2026', groupId: 'PG2', roundKey: 'Jornada 30', dateISO: '2026-06-02',
  time: '17:30', venue: null, home: 'Las Mesas Hu.', away: 'AD Huracán', hs: 2, as: 7,
  advancer: null, shootout: null };
// Maspalomas Cup, Copa Plata, cuartos (MCPK1): ["27/06", "UD Las Mesas Huracán",
// "CF Unión Carrizal", 1, 1, "home", "10:00", "CD 4", "3-2"].
const CUARTOS = { season: '2025-2026', groupId: 'MCPK1', roundKey: 'Cuartos', dateISO: '2026-06-27',
  time: '10:00', venue: 'CD 4', home: 'UD Las Mesas Huracán', away: 'CF Unión Carrizal', hs: 1, as: 1,
  advancer: 'home', shootout: '3-2' };

const s = (h) => String(h);
// Texto visible: sin etiquetas (y con ellas, sin atributos) y con las entidades básicas resueltas.
const text = (h) => s(h).replace(/<[^>]*>/g, ' ')
  .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
const headers = (h) => [...s(h).matchAll(/<th scope="col"[^>]*>(.*?)<\/th>/g)].map(m => m[1].replace(/<[^>]*>/g, ''));

test('crest: miniatura escudos/s/<fichero>.png, original en data-full y atributos de carga', () => {
  const img = s(crest('Las Mesas Hu.', { shields: SHIELDS }));
  assert.equal(img, '<img class="crest crest-16" src="./escudos/s/lasMesasEscudo.png"'
    + ' data-full="./escudos/lasMesasEscudo.png" data-name="Las Mesas Hu." alt=""'
    + ' width="16" height="16" loading="lazy" decoding="async">');
  const grande = s(crest('AD Huracán', { size: 46, shields: SHIELDS, lazy: false }));
  assert.match(grande, /class="crest crest-46"/);
  assert.match(grande, /width="46" height="46"/);
  assert.doesNotMatch(grande, /loading=/, 'la primera pantalla no se carga en diferido');
  assert.match(grande, /decoding="async"/);
});

test('crest: un original .jpg tiene miniatura .png y conserva su extensión en data-full', () => {
  const img = s(crest('Jovero-Las Rosas', { shields: SHIELDS }));
  assert.match(img, /src="\.\/escudos\/s\/joveroLasRosas\.png"/);
  assert.match(img, /data-full="\.\/escudos\/joveroLasRosas\.jpg"/);
});

test('crest: sin entrada exacta usa la normalizada (Acodetti → «Acodetti CF», Telde → «UD Telde»)', () => {
  assert.match(s(crest('Acodetti', { shields: SHIELDS })), /src="\.\/escudos\/s\/acodetti\.png"/);
  assert.match(s(crest('Telde', { shields: SHIELDS })), /src="\.\/escudos\/s\/udTeldeEscudo\.png"/);
});

test('crest: nombres con comillas quedan escapados en los atributos', () => {
  const img = s(crest('VICTORIA, REAL CLUB "B"', { size: 32, shields: SHIELDS }));
  assert.match(img, /data-name="VICTORIA, REAL CLUB &quot;B&quot;"/);
  assert.match(img, /src="\.\/escudos\/s\/victoria2019\.png"/);
  assert.doesNotMatch(img, /CLUB "B"/);
  const mesas = s(crest('MESAS, U.D. LAS "B"', { shields: SHIELDS }));
  assert.match(mesas, /data-name="MESAS, U\.D\. LAS &quot;B&quot;"/);
  assert.match(mesas, /src="\.\/escudos\/s\/lasMesasEscudo\.png"/);
});

test('crest: sin escudo, monograma del mismo tamaño; tamaños fuera de 16/32/46 se rechazan', () => {
  // «Femarguín» no tiene escudo en SHIELDS.
  assert.equal(s(crest('Femarguín', { size: 46, shields: SHIELDS })),
    '<span class="mono mono-46" aria-hidden="true">FE</span>');
  assert.equal(s(crest('Femarguín')), '<span class="mono mono-16" aria-hidden="true">FE</span>');
  assert.throws(() => crest('Telde', { size: 20, shields: SHIELDS }), RangeError);
  assert.throws(() => monogram('Telde', 24), RangeError);
});

test('monogram: dos iniciales sin siglas de club ni puntuación', () => {
  const ini = (n) => s(monogram(n)).replace(/<[^>]*>/g, '');
  assert.equal(ini('Las Mesas Hu.'), 'LM');
  assert.equal(ini('Acodetti'), 'AC');
  assert.equal(ini('CD Batán'), 'BA');
  assert.equal(ini('Atco. Fomento'), 'FO');
  assert.equal(ini('VICTORIA, REAL CLUB "B"'), 'VB');
  assert.equal(ini('MESAS, U.D. LAS "B"'), 'ML');
  assert.equal(ini('Pto.del Carmen'), 'PC');
  assert.equal(ini('Unión Viera'), 'UV');
  assert.equal(s(monogram('Las Mesas Hu.', 32)), '<span class="mono mono-32" aria-hidden="true">LM</span>');
});

test('crestFallback: miniatura → original → monograma', () => {
  const attrs = { class: 'crest crest-32', src: './escudos/s/huracan.png', 'data-full': './escudos/huracan.png',
    'data-name': 'AD Huracán', width: '32' };
  const img = {
    tagName: 'IMG',
    classList: { contains: (c) => attrs.class.split(' ').includes(c) },
    getAttribute: (k) => attrs[k] ?? null,
    setAttribute: (k, v) => { attrs[k] = String(v); },
    set outerHTML(v) { this.replacedBy = v; },
  };
  assert.equal(crestFallback(img), 'full');
  assert.equal(attrs.src, './escudos/huracan.png');
  assert.equal(crestFallback(img), 'mono');
  assert.equal(img.replacedBy, '<span class="mono mono-32" aria-hidden="true">HU</span>');
  assert.equal(crestFallback({ tagName: 'IMG', classList: { contains: () => false } }), null);
  assert.equal(crestFallback(null), null);
});

test('box: título en h2, contexto a la derecha y contenido Html sin reescapar', () => {
  const out = s(box(cells([{ label: 'Jornada', value: 1 }]), { title: 'Próximo partido', context: 'faltan 3 días' }));
  assert.match(out, /^<section class="block"><div class="block-head"><h2 class="block-title">Próximo partido<\/h2><p class="block-context">faltan 3 días<\/p><\/div><div class="box"><dl class="cells cells-1">/);
  assert.equal(s(box('a < b')), '<div class="box">a &lt; b</div>');
  assert.doesNotMatch(s(box('x', { title: 'Tabla' })), /block-context/);
});

test('cells: dl con etiqueta y dato, el 0 se pinta y el dato apagado lleva su clase', () => {
  const out = s(cells([{ label: 'Posición', value: '9º de 15' }, { label: 'Puntos', value: 37 },
    { label: 'Empates', value: 0 }]));
  assert.equal(out, '<dl class="cells cells-3">'
    + '<div class="cell"><dt class="cell-label">Posición</dt><dd class="cell-value">9º de 15</dd></div>'
    + '<div class="cell"><dt class="cell-label">Puntos</dt><dd class="cell-value">37</dd></div>'
    + '<div class="cell"><dt class="cell-label">Empates</dt><dd class="cell-value">0</dd></div></dl>');
  assert.match(s(cells([{ label: 'Campo', value: 'no publicado', muted: true }, { label: 'Hora', value: '17:30' }])),
    /^<dl class="cells cells-2"><div class="cell is-muted">/);
  assert.match(s(cells([1, 2, 3, 4].map(n => ({ label: 'x', value: n })))), /cells-2/);
  assert.match(s(cells([1, 2, 3, 4, 5, 6].map(n => ({ label: 'x', value: n })))), /cells-3/);
  assert.equal(s(cells([])), '');
});

test('matchRow: partido jugado propio, con resalte, marcador y enlace escapado', () => {
  const out = s(matchRow(J30, { mine: true, today: TODAY, shields: SHIELDS,
    href: '#/partido?s=2025-2026&g=PG2&r=Jornada 30&h=Las Mesas Hu.&a=AD Huracán' }));
  assert.match(out, /^<a class="match-row is-mine" href="#\/partido\?s=2025-2026&amp;g=PG2&amp;r=Jornada 30&amp;h=Las Mesas Hu\.&amp;a=AD Huracán">/);
  assert.match(out, /<span class="vh">Partido de mi equipo\. <\/span>/);
  assert.match(out, /<span class="match-time">17:30<\/span>/);
  assert.match(out, /<span class="match-team match-home"><span class="match-name">Las Mesas Hu\.<\/span><img class="crest crest-16" src="\.\/escudos\/s\/lasMesasEscudo\.png"/);
  assert.match(out, /<span class="match-score">2–7<\/span>/);
  assert.match(out, /<span class="match-team match-away"><img class="crest crest-16" src="\.\/escudos\/s\/huracan\.png"[^>]*><span class="match-name">AD Huracán<\/span><\/span>/);
  assert.doesNotMatch(out, /match-note/);
  const ajeno = s(matchRow(J30, { today: TODAY, shields: SHIELDS }));
  assert.match(ajeno, /^<div class="match-row">/);
  assert.doesNotMatch(ajeno, /is-mine|vh/);
});

test('matchRow: sin marcador enseña el estado (pendiente, sin resultado, sin fecha)', () => {
  const base = { ...J30, hs: null, as: null };
  const pendiente = s(matchRow({ ...base, dateISO: '2026-10-04', time: '10:30' }, { today: TODAY }));
  assert.match(pendiente, /<span class="match-score is-pending">–<\/span>/);
  assert.doesNotMatch(pendiente, /match-note/);
  assert.match(s(matchRow(base, { today: TODAY })), /<span class="match-note">sin resultado<\/span>/);
  const sinFecha = s(matchRow({ ...base, dateISO: null, time: null }, { today: TODAY }));
  assert.match(sinFecha, /<span class="match-time"><\/span>/);
  assert.match(sinFecha, /<span class="match-note">sin fecha<\/span>/);
  assert.throws(() => matchRow(J30, {}), TypeError, 'today se inyecta siempre');
});

test('matchRow: eliminatoria empatada dice quién pasó por penaltis y la tanda', () => {
  const out = s(matchRow(CUARTOS, { today: TODAY }));
  assert.match(out, /<span class="match-score">1–1<\/span>/);
  assert.match(out, /<span class="match-note">UD Las Mesas Huracán pasó por penaltis \(3–2\)<\/span>/);
});

test('standingsTable: columnas por vista, con #, Equipo y Pts siempre', () => {
  const cols = {
    puntos: ['#', 'Equipo', 'J', 'G', 'E', 'P', 'DG', 'Pts'],
    goles: ['#', 'Equipo', 'GF', 'GC', 'DG', 'Pts'],
    forma: ['#', 'Equipo', 'J', 'Últimos 5', 'Pts'],
    casa: ['#', 'Equipo', 'J', 'G', 'E', 'P', 'Pts'],
    fuera: ['#', 'Equipo', 'J', 'G', 'E', 'P', 'Pts'],
    todas: ['#', 'Equipo', 'J', 'G', 'E', 'P', 'GF', 'GC', 'DG', 'Últimos 5', 'Pts'],
  };
  for (const [view, expected] of Object.entries(cols)) {
    const out = standingsTable(PG2, { view });
    assert.deepEqual(headers(out), expected, view);
    const first = s(out).match(/<tbody><tr>(.*?)<\/tr>/)[1];
    assert.equal((first.match(/<t[dh][ >]/g) || []).length, expected.length, `${view}: celdas por fila`);
  }
  assert.deepEqual(headers(standingsTable(PG2, { view: 'inventada' })), cols.puntos, 'vista desconocida → puntos');
  assert.deepEqual(headers(standingsTable(PG2)), cols.puntos, 'puntos por defecto');
});

test('standingsTable: th con scope, caption oculto, abreviaturas explicadas y DG con signo', () => {
  const out = s(standingsTable(PG2, { caption: 'Clasificación del Grupo 2 de Gran Canaria' }));
  assert.match(out, /^<table class="standings"><caption class="vh">Clasificación del Grupo 2 de Gran Canaria<\/caption><thead><tr>/);
  assert.match(s(standingsTable(PG2)), /<caption class="vh">Clasificación<\/caption>/);
  assert.equal((out.match(/<th scope="row" class="st-team">/g) || []).length, PG2.length);
  assert.match(out, /<th scope="col" class="st-num"><abbr title="Partidos jugados">J<\/abbr><\/th>/);
  assert.match(out, /<th scope="col" class="st-pts"><abbr title="Puntos">Pts<\/abbr><\/th>/);
  assert.match(out, /<td class="st-dg">\+154<\/td>/);
  assert.match(out, /<td class="st-dg">−30<\/td>/, 'signo menos tipográfico (U+2212)');
  assert.match(out, /<td class="st-pts">37<\/td>/);
});

test('standingsTable: fila propia con clase y texto para lectores; enlaces escapados', () => {
  const out = s(standingsTable(PG2, { mine: 'Las Mesas Hu.', shields: SHIELDS,
    hrefFor: (r) => `#/equipo?g=PG2&t=${encodeURIComponent(r.team)}` }));
  const mias = [...out.matchAll(/<tr class="is-mine">(.*?)<\/tr>/g)];
  assert.equal(mias.length, 1);
  assert.match(mias[0][1], /^<td class="st-pos">9<\/td><th scope="row" class="st-team"><a class="st-link" href="#\/equipo\?g=PG2&amp;t=Las%20Mesas%20Hu\.">/);
  assert.match(mias[0][1], /<span class="vh"> \(mi equipo\)<\/span><\/th>/);
  assert.equal((out.match(/\(mi equipo\)/g) || []).length, 1);
  assert.match(s(standingsTable(PG2)), /<span class="st-label"><span class="mono mono-16" aria-hidden="true">UV<\/span><span class="st-name">Unión Viera<\/span><\/span>/);
});

test('standingsTable: vista Forma con fichas y «retirado» para los retirados', () => {
  const out = s(standingsTable(PG2, { view: 'forma' }));
  assert.match(out, /<td class="st-form"><span class="form"><span class="form-chip form-e">E<\/span><span class="form-chip form-p">P<\/span>/);
  assert.match(out, /<td class="st-form"><span class="st-retired">retirado<\/span><\/td>/);
});

test('standingsTable: los nombres con comillas no rompen el marcado', () => {
  const out = s(standingsTable([ROW(1, 'VICTORIA, REAL CLUB "B"', 3, 1, 1, 0, 0, 5, 1, 4),
    ROW(2, 'MESAS, U.D. LAS "B"', 0, 1, 0, 0, 1, 1, 5, -4)],
  { mine: 'MESAS, U.D. LAS "B"', shields: SHIELDS, hrefFor: (r) => `#/equipo?t=${r.team}` }));
  assert.match(out, /<span class="st-name">VICTORIA, REAL CLUB &quot;B&quot;<\/span>/);
  assert.match(out, /href="#\/equipo\?t=MESAS, U\.D\. LAS &quot;B&quot;"/);
  assert.doesNotMatch(out, /CLUB "B"|LAS "B"/);
  assert.equal((out.match(/<tr class="is-mine">/g) || []).length, 1);
  assert.match(out, /<tr class="is-mine"><td class="st-pos">2<\/td>/);
});

test('formChips: G, E y P con su clase; cualquier otra letra se rechaza', () => {
  assert.equal(s(formChips(['G', 'E', 'P'])), '<span class="form">'
    + '<span class="form-chip form-g">G</span><span class="form-chip form-e">E</span>'
    + '<span class="form-chip form-p">P</span></span>');
  assert.equal(s(formChips([])), '<span class="form"></span>');
  for (const bad of ['W', 'D', 'L', 'g', '']) assert.throws(() => formChips([bad]), RangeError, bad);
});

test('segmented: enlaces y aria-current="true" solo en el activo', () => {
  const opts = [{ value: 'puntos', label: 'Puntos' }, { value: 'forma', label: 'Forma' }];
  const out = s(segmented(opts, 'forma', (v) => `#/tabla?g=PG2&v=${v}`));
  assert.equal(out, '<div class="segmented">'
    + '<a class="segment" href="#/tabla?g=PG2&amp;v=puntos">Puntos</a>'
    + '<a class="segment" href="#/tabla?g=PG2&amp;v=forma" aria-current="true">Forma</a></div>');
});

test('notice y empty', () => {
  assert.equal(s(notice('Sin partido en esta jornada:', 'RC Victoria y Arucas B (descansa o le tocaba contra CD Batán)')),
    '<p class="notice"><b>Sin partido en esta jornada:</b> RC Victoria y Arucas B (descansa o le tocaba contra CD Batán)</p>');
  assert.equal(s(notice('', 'Faltan 2 partidos de esta jornada en la fuente')),
    '<p class="notice">Faltan 2 partidos de esta jornada en la fuente</p>');
  assert.equal(s(empty('Aún no se ha jugado ninguna jornada')),
    '<p class="empty">Aún no se ha jugado ninguna jornada</p>');
});

test('tabbar: 4 destinos, iconos SVG ocultos al lector y aria-current solo en el activo', () => {
  const out = s(tabbar('tabla'));
  assert.match(out, /^<nav class="tabbar" aria-label="Navegación principal">/);
  const tabs = [...out.matchAll(/<a class="tab" href="([^"]*)"( aria-current="page")?>.*?<span class="tab-label">(.*?)<\/span><\/a>/g)]
    .map(m => [m[1], m[3], Boolean(m[2])]);
  assert.deepEqual(tabs, [['#/', 'Mi equipo', false], ['#/jornada', 'Jornada', false],
    ['#/tabla', 'Tabla', true], ['#/explorar', 'Explorar', false]]);
  assert.equal((out.match(/<svg [^>]*aria-hidden="true" focusable="false"/g) || []).length, 4);
  assert.equal((out.match(/aria-current/g) || []).length, 1);
  assert.match(s(tabbar('explorar', { current: 'true' })), /href="#\/explorar" aria-current="true"/);
  assert.doesNotMatch(s(tabbar(null)), /aria-current/);
  assert.throws(() => tabbar('partido'), RangeError);
});

test('ni inglés ni emoji: Local/Visitante y G/E/P, nunca HOME, AWAY ni W/D/L', () => {
  const all = [
    crest('Las Mesas Hu.', { shields: SHIELDS }), monogram('Telde'),
    box(cells([{ label: 'Jornada', value: 30 }]), { title: 'Resultado', context: 'final' }),
    matchRow(J30, { mine: true, today: TODAY, shields: SHIELDS, href: '#/partido' }),
    matchRow(CUARTOS, { today: TODAY }),
    ...['puntos', 'goles', 'forma', 'casa', 'fuera', 'todas'].map(view =>
      standingsTable(PG2, { view, mine: 'Las Mesas Hu.', shields: SHIELDS, hrefFor: () => '#/equipo' })),
    formChips(['G', 'E', 'P']), segmented([{ value: 'a', label: 'Puntos' }], 'a', () => '#/tabla'),
    notice('Aviso:', 'texto'), empty('vacío'), tabbar('miequipo'),
  ].map(String).join('\n');
  assert.doesNotMatch(text(all), /\b(HOME|AWAY|Home|Away|home|away)\b/);
  assert.doesNotMatch(text(all), /(^|[^\p{L}])[WDL]([^\p{L}]|$)/u);
  assert.doesNotMatch(all, /\p{Extended_Pictographic}/u);
});

test('cada clase que emite ui.js existe en style-acta.css', () => {
  const css = readFileSync(join(ROOT, 'style-acta.css'), 'utf8');
  const defined = new Set([...css.replace(/\/\*[\s\S]*?\*\//g, '').matchAll(/\.([a-zA-Z][\w-]*)/g)].map(m => m[1]));
  const out = [
    crest('Las Mesas Hu.', { shields: SHIELDS }), crest('Femarguín', { size: 32 }), crest('x', { size: 46 }),
    box(cells([{ label: 'a', value: 1, muted: true }, { label: 'b', value: 2 }, { label: 'c', value: 3 },
      { label: 'd', value: 4 }, { label: 'e', value: 5 }]), { title: 't', context: 'c' }),
    cells([{ label: 'a', value: 1 }]), cells([{ label: 'a', value: 1 }, { label: 'b', value: 2 }]),
    cells([{ label: 'a', value: 1 }, { label: 'b', value: 2 }, { label: 'c', value: 3 }]),
    matchRow({ ...J30, hs: null, as: null }, { mine: true, today: TODAY, shields: SHIELDS, href: '#' }),
    matchRow(CUARTOS, { today: TODAY }),
    standingsTable(PG2, { view: 'todas', mine: 'Las Mesas Hu.', shields: SHIELDS, hrefFor: () => '#' }),
    standingsTable(PG2, { view: 'forma' }),
    segmented([{ value: 'a', label: 'A' }], 'a', () => '#'), notice('t', 'x'), empty('x'), tabbar('jornada'),
  ].map(String).join('');
  const used = new Set([...out.matchAll(/class="([^"]+)"/g)].flatMap(m => m[1].split(/\s+/)));
  assert.deepEqual([...used].filter(c => !defined.has(c)), []);
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd /home/manolo/claude/futbol-base
node --test scripts/tests/test_rediseno_ui.mjs 2>&1 | grep -E '^# (tests|pass|fail)|ERR_MODULE_NOT_FOUND\]'
```
Esperado:
```text
# Error [ERR_MODULE_NOT_FOUND]: Cannot find module '/home/manolo/claude/futbol-base/src/ui.js' imported from /home/manolo/claude/futbol-base/scripts/tests/test_rediseno_ui.mjs
# tests 1
# pass 0
# fail 1
```

- [ ] **Step 3: Write minimal implementation**

Crear `src/ui.js`:

```js
// Componentes del sistema visual «Acta» (spec §3.3). Funciones puras que
// devuelven Html: no leen globales ni tocan el DOM al importarse. Las clases
// que emiten están definidas en style-acta.css.
import { html } from './html.js';
import { matchState } from './model.js';
import { normalizeTeamName } from './state.js';

// ── Escudo y monograma ──────────────────────────────────────────────────

const SIZES = [16, 32, 46];

function checkSize(size) {
  if (!SIZES.includes(size)) throw new RangeError(`Tamaño de escudo no válido: ${size} (16, 32 o 46)`);
}

// Índice normalizado por objeto de escudos (se construye una vez por mapa).
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

const CLUB_WORDS = new Set(['ad', 'afc', 'atco', 'atl', 'cd', 'ce', 'cef', 'cf', 'club', 'cp', 'rc', 'real', 'sc', 'sd', 'ssd', 'ud', 'us']);

// Dos iniciales: sin puntuación ni siglas de club («CD Batán» → «BA»,
// 'VICTORIA, REAL CLUB "B"' → «VB»).
function initials(name) {
  const words = String(name ?? '').replace(/\./g, '').replace(/[^\p{L}\p{N}]+/gu, ' ').trim().split(' ').filter(Boolean);
  const main = words.filter((w) => !CLUB_WORDS.has(w.toLowerCase()));
  const use = main.length ? main : words;
  if (!use.length) return '';
  const pair = use.length === 1 ? use[0].slice(0, 2) : use[0][0] + use[1][0];
  return pair.toLocaleUpperCase('es');
}

export function monogram(name, size = 16) {
  checkSize(size);
  return html`<span class="mono mono-${size}" aria-hidden="true">${initials(name)}</span>`;
}

// Escudo decorativo (el nombre va siempre al lado): miniatura de escudos/s/,
// original en data-full y monograma si no hay escudo. `lazy: false` para los
// de la primera pantalla.
export function crest(name, { size = 16, shields = {}, lazy = true } = {}) {
  checkSize(size);
  const file = lookupShield(name, shields);
  if (!file) return monogram(name, size);
  const thumb = `./escudos/s/${file.replace(/\.[^./]+$/, '')}.png`;
  return html`<img class="crest crest-${size}" src="${thumb}" data-full="./escudos/${file}" data-name="${name}" alt="" width="${size}" height="${size}"${lazy ? html` loading="lazy"` : ''} decoding="async">`;
}

// Siguiente paso de la cadena miniatura → original → monograma (spec §5.4)
// para un <img class="crest"> que no ha cargado. Lo llama el manejador de
// errores de B2. Devuelve 'full', 'mono' o null si no es un escudo.
export function crestFallback(img) {
  if (!img || img.tagName !== 'IMG' || !img.classList.contains('crest')) return null;
  const full = img.getAttribute('data-full');
  if (full && img.getAttribute('src') !== full) {
    img.setAttribute('src', full);
    return 'full';
  }
  const size = Number(img.getAttribute('width'));
  // Marcado de monogram(): pasa por html`` y sus iniciales son solo letras o cifras.
  img.outerHTML = String(monogram(img.getAttribute('data-name') || '', SIZES.includes(size) ? size : 16));
  return 'mono';
}

// ── Caja, bloque y casillas ─────────────────────────────────────────────

export function box(content, { title, context } = {}) {
  const body = html`<div class="box">${content}</div>`;
  if (title == null || title === '') return body;
  const ctx = context == null || context === '' ? '' : html`<p class="block-context">${context}</p>`;
  return html`<section class="block"><div class="block-head"><h2 class="block-title">${title}</h2>${ctx}</div>${body}</section>`;
}

// items: [{label, value, muted?}]. Columnas: 1-3 tal cual, 4 en 2×2, 5 en fila, 6+ de 3 en 3.
export function cells(items) {
  if (!items.length) return html``;
  const n = items.length;
  const cols = n === 4 ? 2 : n === 5 ? 5 : Math.min(n, 3);
  return html`<dl class="cells cells-${cols}">${items.map(({ label, value, muted }) =>
    html`<div class="${muted ? 'cell is-muted' : 'cell'}"><dt class="cell-label">${label}</dt><dd class="cell-value">${value}</dd></div>`)}</dl>`;
}

// ── Fila de partido ─────────────────────────────────────────────────────

function matchNote(match, state) {
  if (state === 'sin resultado' || state === 'sin fecha') return state;
  if (state === 'jugado' && match.advancer && match.hs === match.as) {
    const who = match.advancer === 'home' ? match.home : match.away;
    return html`${who} pasó por penaltis${match.shootout ? html` (${String(match.shootout).replace('-', '–')})` : ''}`;
  }
  return null;
}

export function matchRow(match, { mine = false, today, shields, href } = {}) {
  if (!today) throw new TypeError('matchRow necesita today (AAAA-MM-DD): el reloj se inyecta');
  const state = matchState(match, today);
  const score = state === 'jugado'
    ? html`<span class="match-score">${match.hs}–${match.as}</span>`
    : html`<span class="match-score is-pending">–</span>`;
  const note = matchNote(match, state);
  const inner = html`${mine ? html`<span class="vh">Partido de mi equipo. </span>` : ''}<span class="match-time">${match.time || ''}</span><span class="match-team match-home"><span class="match-name">${match.home}</span>${crest(match.home, { shields })}</span>${score}<span class="match-team match-away">${crest(match.away, { shields })}<span class="match-name">${match.away}</span></span>${note ? html`<span class="match-note">${note}</span>` : ''}`;
  const cls = mine ? 'match-row is-mine' : 'match-row';
  return href ? html`<a class="${cls}" href="${href}">${inner}</a>` : html`<div class="${cls}">${inner}</div>`;
}

// ── Tabla ───────────────────────────────────────────────────────────────

const signed = (n) => (n == null ? '' : n > 0 ? `+${n}` : n < 0 ? `−${-n}` : '0');

const COLUMNS = {
  pj: { label: 'J', title: 'Partidos jugados', cls: 'st-num', cell: (r) => r.pj },
  g: { label: 'G', title: 'Ganados', cls: 'st-num', cell: (r) => r.g },
  e: { label: 'E', title: 'Empatados', cls: 'st-num', cell: (r) => r.e },
  p: { label: 'P', title: 'Perdidos', cls: 'st-num', cell: (r) => r.p },
  gf: { label: 'GF', title: 'Goles a favor', cls: 'st-gf', cell: (r) => r.gf },
  gc: { label: 'GC', title: 'Goles en contra', cls: 'st-gc', cell: (r) => r.gc },
  dg: { label: 'DG', title: 'Diferencia de goles', cls: 'st-dg', cell: (r) => signed(r.dg) },
  form: { label: 'Últimos 5', title: null, cls: 'st-form',
    cell: (r) => (r.retired ? html`<span class="st-retired">retirado</span>` : formChips(r.form || [])) },
};

// Spec §4.4. «todas» es la de escritorio (≥1024 px).
const VIEWS = {
  puntos: ['pj', 'g', 'e', 'p', 'dg'],
  goles: ['gf', 'gc', 'dg'],
  forma: ['pj', 'form'],
  casa: ['pj', 'g', 'e', 'p'],
  fuera: ['pj', 'g', 'e', 'p'],
  todas: ['pj', 'g', 'e', 'p', 'gf', 'gc', 'dg', 'form'],
};

const abbr = (label, title) => (title ? html`<abbr title="${title}">${label}</abbr>` : label);

// rows: Row[] del modelo; `form` (letras G/E/P) es opcional y solo lo usan
// las vistas forma y todas. `mine` es el nombre exacto del equipo propio.
export function standingsTable(rows, { view = 'puntos', mine, shields, hrefFor, caption } = {}) {
  const keys = VIEWS[view] || VIEWS.puntos;
  const head = html`<tr><th scope="col" class="st-pos">${abbr('#', 'Posición')}</th><th scope="col" class="st-team">Equipo</th>${keys.map((k) =>
    html`<th scope="col" class="${COLUMNS[k].cls}">${abbr(COLUMNS[k].label, COLUMNS[k].title)}</th>`)}<th scope="col" class="st-pts">${abbr('Pts', 'Puntos')}</th></tr>`;
  const body = rows.map((row, i) => {
    const isMine = mine != null && row.team === mine;
    const inner = html`${crest(row.team, { shields })}<span class="st-name">${row.team}</span>`;
    const label = hrefFor
      ? html`<a class="st-link" href="${hrefFor(row)}">${inner}</a>`
      : html`<span class="st-label">${inner}</span>`;
    const cellsHtml = keys.map((k) => html`<td class="${COLUMNS[k].cls}">${COLUMNS[k].cell(row)}</td>`);
    return html`<tr${isMine ? html` class="is-mine"` : ''}><td class="st-pos">${row.pos ?? i + 1}</td><th scope="row" class="st-team">${label}${isMine ? html`<span class="vh"> (mi equipo)</span>` : ''}</th>${cellsHtml}<td class="st-pts">${row.pts}</td></tr>`;
  });
  return html`<table class="standings"><caption class="vh">${caption || 'Clasificación'}</caption><thead>${head}</thead><tbody>${body}</tbody></table>`;
}

// ── Forma, selector, aviso y vacío ──────────────────────────────────────

const FORM_CLASS = { G: 'form-g', E: 'form-e', P: 'form-p' };

export function formChips(letters) {
  return html`<span class="form">${letters.map((letter) => {
    if (!Object.hasOwn(FORM_CLASS, letter)) throw new RangeError(`Letra de forma no válida: «${letter}» (solo G, E o P)`);
    return html`<span class="form-chip ${FORM_CLASS[letter]}">${letter}</span>`;
  })}</span>`;
}

export function segmented(options, active, hrefFor) {
  return html`<div class="segmented">${options.map(({ value, label }) => (value === active
    ? html`<a class="segment" href="${hrefFor(value)}" aria-current="true">${label}</a>`
    : html`<a class="segment" href="${hrefFor(value)}">${label}</a>`))}</div>`;
}

export function notice(term, text) {
  return html`<p class="notice">${term ? html`<b>${term}</b> ` : ''}${text}</p>`;
}

export function empty(text) {
  return html`<p class="empty">${text}</p>`;
}

// ── Barra de navegación ─────────────────────────────────────────────────

const svg = (paths) => html`<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="square" stroke-linejoin="miter" aria-hidden="true" focusable="false">${paths}</svg>`;

const TABS = [
  { id: 'miequipo', href: '#/', label: 'Mi equipo',
    icon: svg(html`<path d="M12 3l7 2.6V11c0 4.4-2.9 7.9-7 9.6-4.1-1.7-7-5.2-7-9.6V5.6z"/><path d="M5.2 10.5h13.6"/>`) },
  { id: 'jornada', href: '#/jornada', label: 'Jornada',
    icon: svg(html`<rect x="4" y="5.5" width="16" height="14.5"/><path d="M4 10h16M8.5 3.5v4M15.5 3.5v4"/>`) },
  { id: 'tabla', href: '#/tabla', label: 'Tabla',
    icon: svg(html`<rect x="4" y="4.5" width="16" height="15"/><path d="M4 9.5h16M4 14.5h16M9.5 4.5v15"/>`) },
  { id: 'explorar', href: '#/explorar', label: 'Explorar',
    icon: svg(html`<circle cx="10.5" cy="10.5" r="6"/><path d="M15 15l5 5"/>`) },
];

// active: destino marcado. current: 'page' si la pantalla es ese destino;
// 'true' en las pantallas secundarias (spec §4.1).
export function tabbar(active, { current = 'page' } = {}) {
  if (active != null && !TABS.some((t) => t.id === active)) throw new RangeError(`Destino de la barra no válido: ${active}`);
  if (current !== 'page' && current !== 'true') throw new RangeError(`aria-current no válido: ${current}`);
  return html`<nav class="tabbar" aria-label="Navegación principal">${TABS.map((t) => {
    const inner = html`<span class="tab-icon">${t.icon}</span><span class="tab-label">${t.label}</span>`;
    return t.id === active
      ? html`<a class="tab" href="${t.href}" aria-current="${current}">${inner}</a>`
      : html`<a class="tab" href="${t.href}">${inner}</a>`;
  })}</nav>`;
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
cd /home/manolo/claude/futbol-base
node --test scripts/tests/test_rediseno_ui.mjs 2>&1 | grep -E '^# (tests|pass|fail)'
```
Esperado:
```text
# tests 23
# pass 23
# fail 0
```
Si fallara el último test, «cada clase que emite ui.js existe en style-acta.css», su mensaje lista las clases que faltan en la hoja.

- [ ] **Step 5: Verificación visual (Chrome, fuera del repo)**

La vista previa se genera en Node con `ui.js`, así que cualquier cambio en los componentes se ve tal cual. Se sirve desde memoria con un servidor mínimo que responde `/escudos/s/<x>.png` con el original `escudos/<x>.png|.jpg`, simulando las miniaturas de B4. Mide:
- el desplazamiento horizontal;
- la altura de todo lo pulsable;
- las fuentes cargadas y las imágenes rotas;
- si la barra tapa el final del contenido.

También prueba en el navegador la cadena `crestFallback`.

```bash
cd /home/manolo/claude/futbol-base
S=/tmp/claude-1000/-home-manolo/db6fd8e0-f1e7-4e94-b6cd-ef7dd5bf6ae9/scratchpad/planB1
PW=/tmp/claude-1000/-home-manolo/db6fd8e0-f1e7-4e94-b6cd-ef7dd5bf6ae9/scratchpad/pw/node_modules
mkdir -p "$S"
ls "$PW/playwright/package.json" >/dev/null 2>&1 || npm install --prefix "$(dirname "$PW")" --no-save --package-lock=false playwright@1.58.0
cat > "$S/b1-preview.mjs" <<'EOF'
// Vista previa de B1: componentes de ui.js con style-acta.css y datos reales de PG2 2025-26.
// Uso, desde la raíz del repo: OUT=<dir> [EXPECT_FONT=1] NODE_PATH=<node_modules con playwright> node <este fichero>
// No escribe en el repo: la página se sirve desde memoria, y /escudos/s/<x>.png se responde con
// el original escudos/<x>.png|.jpg (simula las miniaturas que genera B4).
import { createServer } from 'node:http';
import { createRequire } from 'node:module';
import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import { extname, join, normalize, sep } from 'node:path';
import { pathToFileURL } from 'node:url';

const out = process.env.OUT;
if (!out) { console.error('Falta OUT=<directorio de capturas>'); process.exit(2); }
mkdirSync(out, { recursive: true });
const root = process.cwd();
const ui = await import(pathToFileURL(join(root, 'src/ui.js')).href);
const { html, join: joinHtml } = await import(pathToFileURL(join(root, 'src/html.js')).href);
const { findChrome } = await import(pathToFileURL(join(root, 'scripts/tests/render-smoke.mjs')).href);
const { chromium } = createRequire(join(root, 'scripts/tests/x.mjs'))('playwright');

const SHIELDS = {
  'Unión Viera': 'unionviera.png', 'Acodetti CF': 'acodetti.png', 'AD Huracán': 'huracan.png',
  'La Garita': 'laGaritaEscudoColor.png', 'RC Victoria': 'victoria.png', 'Veteranos': 'veteranos.png',
  'Gran Canaria': 'atleticograncanaria19-20.png', 'UD Telde': 'udTeldeEscudo.png',
  'Las Mesas Hu.': 'lasMesasEscudo.png', 'Santa Brígida': 'villa.png', 'Las Huesas': 'lashuesas2017.png',
  'Arucas B': 'arucas.png', 'UD Jinámar': 'jinamarEscudo.png', 'CD Calero': 'calero2018.png',
  'CD Batán': 'batanEscudo.png',
};
const FORM = { 'Unión Viera': 'GGPGG', 'Acodetti': 'GGGGG', 'AD Huracán': 'PGGGG', 'La Garita': 'GGPGP',
  'RC Victoria': 'PGGGG', 'Veteranos': 'PGGPE', 'Gran Canaria': 'GPEPE', 'Telde': 'PGGPG',
  'Las Mesas Hu.': 'EPPGP', 'Santa Brígida': 'GPPEP', 'Las Huesas': 'GPGPP', 'Arucas B': 'PPPPE',
  'UD Jinámar': 'PPEPG', 'CD Calero': 'PPPPP' };
const PG2 = [[1, 'Unión Viera', 79, 28, 26, 1, 1, 190, 36, 154], [2, 'Acodetti', 78, 28, 26, 0, 2, 196, 57, 139],
  [3, 'AD Huracán', 71, 28, 23, 2, 3, 226, 43, 183], [4, 'La Garita', 58, 28, 19, 1, 8, 138, 72, 66],
  [5, 'RC Victoria', 58, 28, 19, 1, 8, 145, 67, 78], [6, 'Veteranos', 58, 28, 19, 1, 8, 149, 72, 77],
  [7, 'Gran Canaria', 46, 28, 14, 4, 10, 100, 81, 19], [8, 'Telde', 40, 28, 13, 1, 14, 86, 98, -12],
  [9, 'Las Mesas Hu.', 37, 28, 12, 1, 15, 90, 120, -30], [10, 'Santa Brígida', 26, 28, 8, 2, 18, 78, 166, -88],
  [11, 'Las Huesas', 25, 28, 8, 1, 19, 74, 142, -68], [12, 'Arucas B', 20, 28, 6, 2, 20, 52, 180, -128],
  [13, 'UD Jinámar', 16, 28, 5, 1, 22, 37, 149, -112], [14, 'CD Calero', 9, 28, 3, 0, 25, 40, 214, -174],
  [15, 'CD Batán', 0, 28, 0, 0, 28, 0, 84, -84]]
  .map(([pos, team, pts, pj, g, e, p, gf, gc, dg]) =>
    ({ pos, team, pts, pj, g, e, p, gf, gc, dg, retired: team === 'CD Batán', form: [...(FORM[team] || '')] }));
const M = (dateISO, time, home, away, hs, as) => ({ season: '2025-2026', groupId: 'PG2', roundKey: 'Jornada 30',
  dateISO, time, venue: null, home, away, hs, as, advancer: null, shootout: null });
const J30 = [M('2026-06-02', '17:30', 'Las Mesas Hu.', 'AD Huracán', 2, 7), M('2026-06-06', '09:00', 'Acodetti', 'Santa Brígida', 12, 1),
  M('2026-06-06', '09:00', 'Gran Canaria', 'Veteranos', 5, 5), M('2026-06-06', '09:00', 'La Garita', 'Unión Viera', 1, 4),
  M('2026-06-06', '09:00', 'Las Huesas', 'UD Jinámar', 2, 4), M('2026-06-06', '09:00', 'Telde', 'CD Calero', 7, 1)];
const today = '2026-05-30';
// `r` es siempre la clave de la ronda (Round.key), nunca un número.
const matchHref = (m) => `#/partido?g=PG2&r=${encodeURIComponent(m.roundKey)}&h=${encodeURIComponent(m.home)}&a=${encodeURIComponent(m.away)}`;
const teamHref = (r) => `#/equipo?g=PG2&t=${encodeURIComponent(r.team)}`;
const VIEWS = [['puntos', 'Puntos'], ['goles', 'Goles'], ['forma', 'Forma'], ['casa', 'Casa'], ['fuera', 'Fuera']]
  .map(([value, label]) => ({ value, label }));
// En escritorio el selector sigue: Todas, Casa y Fuera.
const DESKTOP_VIEWS = [['todas', 'Todas'], ['casa', 'Casa'], ['fuera', 'Fuera']].map(([value, label]) => ({ value, label }));
const day = (text) => html`<div style="margin:14px 0 6px;font-size:12.5px;font-weight:700;color:var(--mute)">${text}</div>`;

function page(view) {
  const head = html`<div style="display:flex;align-items:center;gap:10px;padding:16px 0 10px;border-bottom:2px solid var(--ink)">
    ${ui.crest('Las Mesas Hu.', { size: 32, shields: SHIELDS, lazy: false })}
    <div style="flex:1;min-width:0"><h1>Las Mesas Hu.</h1><div style="font-size:12.5px;color:var(--mute)">Prebenjamín, Grupo 2 de Gran Canaria</div></div>
    <a href="#/explorar" style="font-weight:700">Cambiar</a></div>`;
  const proximo = ui.box(html`${ui.cells([{ label: 'Jornada', value: 30 }, { label: 'Fecha', value: 'mar 2 jun' }, { label: 'Hora', value: '17:30' }])}${ui.cells([{ label: 'Campo', value: 'no publicado', muted: true }])}<div class="buttons"><a class="button is-main" href="#">Cómo llegar</a><button class="button" type="button">Calendario</button><button class="button" type="button">Compartir</button></div>`,
  { title: 'Próximo partido', context: 'faltan 3 días' });
  const tabla = html`<div style="margin-top:12px">${ui.segmented(view === 'todas' ? DESKTOP_VIEWS : VIEWS, view, (v) => `#/tabla?g=PG2&v=${v}`)}</div>${ui.box(
    ui.standingsTable(PG2, { view, mine: 'Las Mesas Hu.', shields: SHIELDS, hrefFor: teamHref, caption: 'Clasificación del Grupo 2 de Gran Canaria' }),
    { title: 'Clasificación', context: 'jornada 30, final' })}`;
  const jornada = html`<section class="block"><div class="block-head"><h2 class="block-title">Jornada 30 de 30</h2><p class="block-context">del 2 al 6 de junio</p></div>
    ${day('Martes 2 de junio')}<div class="box">${ui.matchRow(J30[0], { mine: true, today, shields: SHIELDS, href: matchHref(J30[0]) })}</div>
    ${day('Sábado 6 de junio')}<div class="box">${joinHtml(J30.slice(1).map((m) => ui.matchRow(m, { today, shields: SHIELDS, href: matchHref(m) })))}${ui.matchRow({ ...J30[1], hs: null, as: null, dateISO: '2026-05-20' }, { today, shields: SHIELDS, href: '#' })}${ui.matchRow({ ...J30[1], home: 'VICTORIA, REAL CLUB "B"', away: 'Femarguín', hs: null, as: null, dateISO: '2026-06-13', time: '10:30' }, { today, shields: SHIELDS, href: '#' })}</div>
    ${ui.notice('Sin partido en esta jornada:', 'RC Victoria y Arucas B (descansa o le tocaba contra CD Batán)')}</section>`;
  const cifras = ui.box(ui.cells([{ label: 'Goles a favor', value: 90 }, { label: 'En contra', value: 120 },
    { label: 'Por partido', value: '3,2 – 4,6' }, { label: 'En casa', value: '5G 1E 7P' }, { label: 'Fuera', value: '5G 0E 8P' },
    { label: 'Mejor resultado', value: '9–2 Calero' }]), { title: 'La temporada en cifras', context: '26 de 28 con resultado' });
  const alineaciones = html`<section class="block"><div class="block-head"><h2 class="block-title">Alineaciones</h2></div>${ui.empty('La federación no ha publicado el acta de este partido.')}</section>`;
  return String(html`<!DOCTYPE html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
    <title>Vista previa B1</title><link rel="stylesheet" href="/style-acta.css"></head><body>
    <a class="skip-link" href="#main">Saltar al contenido</a>${ui.tabbar('miequipo')}
    <main id="main" class="page">${head}${proximo}${tabla}${jornada}${cifras}${alineaciones}</main></body></html>`);
}

const MIME = { '.css': 'text/css', '.js': 'text/javascript', '.png': 'image/png', '.jpg': 'image/jpeg', '.woff2': 'font/woff2' };
const server = createServer((req, res) => {
  const url = new URL(req.url, 'http://x');
  if (url.pathname === '/__preview.html') {
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    return res.end(page(url.searchParams.get('view') || 'forma'));
  }
  let fp = normalize(join(root, decodeURIComponent(url.pathname)));
  const thumb = url.pathname.match(/^\/escudos\/s\/(.+)\.png$/);
  if (thumb) fp = ['png', 'jpg'].map((x) => join(root, 'escudos', `${decodeURIComponent(thumb[1])}.${x}`)).find(existsSync) || fp;
  if (!fp.startsWith(root + sep) || !existsSync(fp)) { res.statusCode = 404; return res.end('no'); }
  res.setHeader('Content-Type', MIME[extname(fp)] || 'application/octet-stream');
  res.end(readFileSync(fp));
}).listen(0, '127.0.0.1');
await new Promise((resolve) => server.once('listening', resolve));
const base = `http://127.0.0.1:${server.address().port}/__preview.html`;

const browser = await chromium.launch({ executablePath: findChrome() });
const problems = [];
for (const [w, h, scheme, view] of [[390, 844, 'light', 'forma'], [390, 844, 'dark', 'forma'], [320, 700, 'light', 'puntos'], [1440, 900, 'light', 'todas']]) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, colorScheme: scheme, reducedMotion: 'reduce' });
  const p = await ctx.newPage();
  p.on('pageerror', (e) => problems.push(`${w}px ${scheme}: ${e.message}`));
  await p.goto(`${base}?view=${view}`, { waitUntil: 'networkidle' });
  const m = await p.evaluate(() => {
    const bar = document.querySelector('.tabbar');
    window.scrollTo(0, document.documentElement.scrollHeight);
    const last = document.querySelector('main').lastElementChild.getBoundingClientRect();
    const covered = getComputedStyle(bar).position === 'fixed' && last.bottom > bar.getBoundingClientRect().top + 0.5;
    window.scrollTo(0, 0);
    return {
      overflow: document.documentElement.scrollWidth - innerWidth,
      small: [...document.querySelectorAll('.tab, .segment, .button, a.match-row, .st-link')]
        .map((e) => [e.className, Math.round(e.getBoundingClientRect().height)]).filter(([, px]) => px < 44),
      fonts: [...document.fonts].filter((f) => f.status === 'loaded').map((f) => f.family),
      broken: [...document.images].filter((i) => !i.naturalWidth).map((i) => i.getAttribute('src')),
      covered,
    };
  });
  console.log(`${w}px ${scheme} ${view}:`, JSON.stringify(m));
  if (m.overflow > 0) problems.push(`${w}px: desplazamiento horizontal de ${m.overflow}px`);
  if (m.small.length) problems.push(`${w}px: pulsables de menos de 44px: ${JSON.stringify(m.small)}`);
  if (m.broken.length) problems.push(`${w}px: imágenes rotas: ${m.broken.join(', ')}`);
  if (m.covered) problems.push(`${w}px: la barra tapa el final del contenido`);
  if (process.env.EXPECT_FONT && !m.fonts.includes('Public Sans')) problems.push(`${w}px: Public Sans no ha cargado`);
  await p.screenshot({ path: `${out}/b1-${w}-${scheme}-${view}.png`, fullPage: true });
  await p.locator('tr.is-mine').scrollIntoViewIfNeeded();
  const b = await p.locator('tr.is-mine').boundingBox();
  await p.screenshot({ path: `${out}/b1-${w}-${scheme}-fila-propia.png`, clip: { x: 0, y: Math.max(0, b.y - 50), width: w, height: 150 } });
  if (w === 390) {
    // Foco con el teclado en el enlace de la fila propia: ningún antepasado recorta el contorno.
    const link = p.locator('tr.is-mine .st-link');
    for (let i = 0; i < 80 && !(await link.evaluate((el) => el === document.activeElement)); i++) await p.keyboard.press('Tab');
    const f = await link.evaluate((el) => {
      const cs = getComputedStyle(el);
      const grow = parseFloat(cs.outlineOffset) + parseFloat(cs.outlineWidth);
      const r = el.getBoundingClientRect();
      const clipped = [];
      for (let a = el.parentElement; a && a !== document.documentElement; a = a.parentElement) {
        const s = getComputedStyle(a);
        if (s.overflowX === 'visible' && s.overflowY === 'visible') continue;
        const q = a.getBoundingClientRect();
        if (r.left - grow < q.left || r.top - grow < q.top || r.right + grow > q.right || r.bottom + grow > q.bottom) clipped.push(a.tagName.toLowerCase());
      }
      return { focusVisible: el.matches(':focus-visible'), outline: `${cs.outlineWidth} ${cs.outlineStyle}`, clipped };
    });
    console.log(`${w}px ${scheme} foco en la tabla:`, JSON.stringify(f));
    if (!f.focusVisible || f.outline !== '2px solid' || f.clipped.length) problems.push(`${w}px ${scheme}: el foco de la tabla no se ve entero`);
    const fb = await link.boundingBox();
    await p.screenshot({ path: `${out}/b1-${w}-${scheme}-foco-tabla.png`, clip: { x: 0, y: Math.max(0, fb.y - 30), width: w, height: fb.height + 60 } });
  }
  await ctx.close();
}
// Cadena del escudo en el navegador: miniatura que falla → original → monograma.
{
  const ctx = await browser.newContext({ viewport: { width: 390, height: 300 } });
  const p = await ctx.newPage();
  await p.goto(`${base}?view=puntos`, { waitUntil: 'networkidle' });
  const chain = await p.evaluate(async () => {
    const { crest, crestFallback } = await import('/src/ui.js');
    document.addEventListener('error', (e) => crestFallback(e.target), true);
    const holder = document.createElement('div');
    document.body.prepend(holder);
    const settle = (markup) => new Promise((resolve) => {
      holder.innerHTML = markup;
      const img = holder.querySelector('img');
      const done = () => setTimeout(() => resolve(holder.innerHTML), 50);
      img.addEventListener('load', done);
      img.addEventListener('error', () => setTimeout(done, 300));
    });
    const sinNada = String(crest('Falta', { size: 32, shields: { Falta: 'no-existe.png' } }));
    const sinMiniatura = String(crest('AD Huracán', { size: 32, shields: { 'AD Huracán': 'huracan.png' } }))
      .replace('./escudos/s/huracan.png', './escudos/s/no-hay-miniatura.png');
    return { sinNada: await settle(sinNada), sinMiniatura: await settle(sinMiniatura) };
  });
  console.log('cadena:', JSON.stringify(chain));
  if (!/class="mono mono-32"[^>]*>FA</.test(chain.sinNada)) problems.push('sin miniatura ni original: no cae al monograma');
  if (!/src="\.\/escudos\/huracan\.png"/.test(chain.sinMiniatura)) problems.push('sin miniatura: no pasa al original');
  await ctx.close();
}
await browser.close();
server.close();
console.log(problems.length ? 'PROBLEMAS:\n' + problems.join('\n') : `OK: sin errores; capturas en ${out}/b1-*.png`);
process.exit(problems.length ? 1 : 0);
EOF
OUT="$S/shots-t12" NODE_PATH="$PW" node "$S/b1-preview.mjs"
```
Esperado (el orden de las claves es fijo):
```text
390px light forma: {"overflow":0,"small":[],"fonts":[],"broken":[],"covered":false}
390px light foco en la tabla: {"focusVisible":true,"outline":"2px solid","clipped":[]}
390px dark forma: {"overflow":0,"small":[],"fonts":[],"broken":[],"covered":false}
390px dark foco en la tabla: {"focusVisible":true,"outline":"2px solid","clipped":[]}
320px light puntos: {"overflow":0,"small":[],"fonts":[],"broken":[],"covered":false}
1440px light todas: {"overflow":0,"small":[],"fonts":[],"broken":[],"covered":false}
cadena: {"sinNada":"<span class=\"mono mono-32\" aria-hidden=\"true\">FA</span>","sinMiniatura":"<img class=\"crest crest-32\" src=\"./escudos/huracan.png\" data-full=\"./escudos/huracan.png\" data-name=\"AD Huracán\" alt=\"\" width=\"32\" height=\"32\" loading=\"lazy\" decoding=\"async\">"}
OK: sin errores; capturas en /tmp/claude-1000/-home-manolo/db6fd8e0-f1e7-4e94-b6cd-ef7dd5bf6ae9/scratchpad/planB1/shots-t12/b1-*.png
```
`fonts` sale vacío porque la `@font-face` llega en la Tarea 13.

La línea «foco en la tabla» enfoca con el teclado el enlace de la fila propia y comprueba que ningún antepasado recorta su contorno: con `overflow: hidden` en `.st-team` sale `"clipped":["th"]`.

Abrir con Read `b1-390-light-forma.png`, `b1-390-dark-forma.png`, `b1-320-light-puntos.png`, `b1-1440-light-todas.png`, los cuatro `b1-*-fila-propia.png` y los dos `b1-390-*-foco-tabla.png`, y comprobar:
- **Foco en la tabla** (claro y oscuro): el enlace de «Las Mesas Hu.» con el contorno de 2 px en tinta entero, los cuatro lados.
- **Fila propia** (Las Mesas Hu., 9.ª) en tabla y jornada: fondo rosado (claro) o granate (oscuro), texto en tinta de peso 800 y barra de 3 px a la izquierda. **Ningún óvalo.**
- **Forma:** círculos G verdes, E grises y P negros en claro; en oscuro, P claros. La letra siempre visible y CD Batán con «retirado».
- **Selector:** «Forma» relleno de tinta con texto blanco (oscuro: texto oscuro); a 1440 px, «Todas», «Casa» y «Fuera», con «Todas» activo (decisión 15).
- **320 px:**
  - sin desplazamiento horizontal;
  - nombres largos con elipsis («AD Hurac…», «Las Mesa…»), como permite §3.5;
  - «Cómo llegar» en una sola línea.
- **Filas de partido:** «17:30 Las Mesas Hu. [2–7] AD Huracán» resaltada; «sin resultado» bajo el marcador en la fila sin resultado; monogramas «VB» y «FE» en la última.
- **Barra:** 4 destinos con iconos de trazo y el activo, Mi equipo, sobre un rectángulo de tinta.
  - En las capturas de página completa, la barra fija aparece donde terminaba la ventana: es un efecto de `fullPage`, no un fallo.
  - A 1440 px es una fila de pestañas arriba, con la activa subrayada en tinta.

- [ ] **Step 6: Suites completas**

```bash
cd /home/manolo/claude/futbol-base
python3 -m pytest scripts/tests/ -q 2>&1 | tail -1
node --test scripts/tests/test_*.mjs 2>&1 | grep -E '^# (tests|pass|fail)'
```
Esperado:
- pytest: el mismo recuento que al terminar la tarea anterior, sin `failed` (esta tarea no añade pruebas de Python).
- node: el recuento anterior más 23, sin fallos (`# fail 0`). `test_data_globals_contract.mjs` recorre todo `src/` y `ui.js` no tiene ningún `typeof X !== 'undefined'`.

- [ ] **Step 7: Commit**

```bash
cd /home/manolo/claude/futbol-base
git add src/ui.js scripts/tests/test_rediseno_ui.mjs
git commit -F - <<'EOF'
feat(rediseño): componentes de ui.js sobre html`` (B1, tarea 12)

Escudo con miniatura escudos/s/<fichero>.png, original en data-full y
monograma de reserva (exacto o normalizado, spec §5.2), crestFallback
para la cadena miniatura → original → monograma, caja con título de
bloque, casillas, fila de partido con estado y penaltis, tabla con las
columnas de cada vista (#, Equipo y Pts siempre; th con scope, caption
oculto y fila propia marcada), fichas G/E/P, selector segmentado, aviso,
vacío y barra de 4 destinos con aria-current. Todo escapado con html``;
nunca HOME, AWAY ni W/D/L. Todavía no lo importa nadie.

- test_rediseno_ui: HTML de cada componente con datos reales (PG2
  2025-26, Maspalomas Cup, 'VICTORIA, REAL CLUB "B"') y comprobación
  de que cada clase emitida existe en style-acta.css.

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01Sg56KK3oZgo8Ye7Snj6wG9
EOF
git show --stat --oneline HEAD | tail -1
```
Esperado: `2 files changed`, con `src/ui.js` y `scripts/tests/test_rediseno_ui.mjs`.

---

### Task 13: Assets: Public Sans alojada e iconos de la PWA (spec §3.2, §5.5)

**Contexto**
- **Fuente.** `@fontsource-variable/public-sans@5.3.0`, fichero `files/public-sans-latin-wght-normal.woff2`:
  - variable, con eje `wght` de 100 a 900;
  - subconjunto latino: U+0000-00FF, puntuación general U+2000-206F y U+2212, entre otros;
  - trae `tnum` y todos los glifos que usa la interfaz (– − ‹ › « » º ñ ç ¿ ¡ · …), comprobados con fontTools;
  - 26.832 bytes y sha256 `5ed4d31c988e73b258894244f209069ebe77dc7e564861954b21198b6de90d68`. Es el hash que publica jsDelivr para ese fichero, y el tarball de npm trae un fichero idéntico.
- **Licencia.** Public Sans es SIL OFL 1.1. `fonts/OFL.txt` es el `LICENSE` del paquete: 4.503 bytes, sha256 `705a497c781f6463ff819abb513bb495f3fb05256f1d20321e3275813c0bafa5`.
- **`@font-face`.** Lleva `font-display: swap`, `font-weight: 100 900` y el `unicode-range` del paquete. El respaldo `system-ui` ya está en `body` (Tarea 11). No se enlaza nada de Google Fonts.
- **Iconos** (`scripts/build_icons.py`, Pillow):
  - **Diseño:** un campo de fútbol en blanco sobre la tinta del sistema (`#C0182B`), con bandas, línea de medio campo, círculo central y las dos áreas. Es simple, se reconoce a 32 px y un campo rojo no se confunde con otras apps de fútbol.
  - **Dibujo:** a 4 aumentos, reducido con LANCZOS. El trazo es proporcional al campo (ancho/13).
  - **Tamaños:** el campo ocupa 0,70 del lado en `icon-180` (apple-touch-icon), `icon-192` e `icon-512` (purpose `any`), y 0,56 en `icon-maskable-512`. Así la marca queda dentro de la zona segura, un círculo de radio 0,40 del lado: la esquina más lejana del campo queda a 170 px del centro, y el radio seguro es de 204,8 px.
  - **Formato:** todos RGB opacos, de 4 a 10 KB.
- **CI sin Pillow.** El bot (`update.yml`) y `tests.yml` solo instalan `pytest` y `pyyaml`. Por eso:
  - tamaño y modo se comprueban leyendo la cabecera PNG a mano;
  - las comprobaciones de píxeles y de regeneración usan `pytest.importorskip` y allí se saltan (6 de 14).
- **Hashes de los PNG.** Con Pillow 12.1.1 y zlib 1.3, la salida es byte a byte reproducible. Con otra versión los bytes pueden cambiar; la prueba de regeneración compara píxeles con tolerancia (media < 1 nivel por canal).
- **Sin referencias todavía.** Ni `manifest.json` ni `sw.js` referencian aún `icons/` o `fonts/`: eso es de B4, y lo vigila la Tarea 14.

**Files:**
- Create:
  - `fonts/PublicSans-latin.woff2` y `fonts/OFL.txt`;
  - `scripts/build_icons.py`;
  - `icons/icon-180.png`, `icons/icon-192.png`, `icons/icon-512.png` e `icons/icon-maskable-512.png`.
- Modify: `style-acta.css`, con la `@font-face` al principio.
- Test: `scripts/tests/test_rediseno_assets.mjs` y `scripts/tests/test_build_icons.py`

**Interfaces:**
- Consumes: `style-acta.css` (Tarea 11) y Pillow (solo en local, para generar).
- Produces:
  - `fonts/PublicSans-latin.woff2`, cargada por la `@font-face 'Public Sans'`;
  - los 4 PNG de `icons/`, para el manifiesto y el `apple-touch-icon` de B4;
  - `build(out_dir=icons/) -> list[Path]` en `scripts/build_icons.py`.

- [ ] **Step 1: Write the failing test**

Crear `scripts/tests/test_rediseno_assets.mjs`:

```js
// Plan B1, tarea 13: tipografía alojada (spec §3.2). Public Sans variable,
// subconjunto latino, servida desde fonts/ con system-ui de respaldo.
import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
// @fontsource-variable/public-sans@5.3.0, files/public-sans-latin-wght-normal.woff2
const FONT_SHA256 = '5ed4d31c988e73b258894244f209069ebe77dc7e564861954b21198b6de90d68';

test('fonts/PublicSans-latin.woff2 es el woff2 fijado (26.832 bytes)', () => {
  const buf = readFileSync(join(ROOT, 'fonts', 'PublicSans-latin.woff2'));
  assert.equal(buf.subarray(0, 4).toString('latin1'), 'wOF2');
  assert.equal(buf.readUInt32BE(8), buf.length, 'la cabecera WOFF2 declara la longitud real');
  assert.equal(createHash('sha256').update(buf).digest('hex'), FONT_SHA256);
});

test('la licencia OFL acompaña a la fuente', () => {
  const ofl = readFileSync(join(ROOT, 'fonts', 'OFL.txt'), 'utf8');
  assert.match(ofl, /SIL OPEN FONT LICENSE Version 1\.1/);
  assert.match(ofl, /The Public Sans Project Authors/);
});

test('@font-face: Public Sans desde fonts/, pesos 100-900, swap y subconjunto latino', () => {
  const css = readFileSync(join(ROOT, 'style-acta.css'), 'utf8');
  const faces = [...css.matchAll(/@font-face\s*\{([^}]*)\}/g)].map((m) => m[1]);
  assert.equal(faces.length, 1, 'una sola familia');
  const face = faces[0];
  assert.match(face, /font-family:\s*'Public Sans'/);
  assert.match(face, /src:\s*url\('fonts\/PublicSans-latin\.woff2'\) format\('woff2'\)/);
  assert.match(face, /font-weight:\s*100 900/);
  assert.match(face, /font-style:\s*normal/);
  assert.match(face, /font-display:\s*swap/);
  assert.match(face, /unicode-range:\s*U\+0000-00FF,[^;]*U\+2000-206F,[^;]*U\+2212/);
  assert.match(css, /body\s*\{[^}]*font-family:\s*'Public Sans',\s*system-ui/);
  assert.doesNotMatch(css, /fonts\.googleapis|fonts\.gstatic/, 'nada de Google Fonts: se aloja en fonts/');
});
```

Crear `scripts/tests/test_build_icons.py`:

```python
"""Plan B1, tarea 13: iconos de la PWA (spec §5.5).

Tamaño y modo se comprueban leyendo la cabecera PNG a mano, sin Pillow: el bot
(update.yml) y tests.yml solo instalan pytest y pyyaml. Las comprobaciones de
píxeles y de regeneración usan Pillow y se saltan si no está instalado.
"""
import struct
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[2]
ICONS = ROOT / "icons"
EXPECTED = {
    "icon-180.png": 180,
    "icon-192.png": 192,
    "icon-512.png": 512,
    "icon-maskable-512.png": 512,
}
INK = (0xC0, 0x18, 0x2B)
PNG_SIGNATURE = b"\x89PNG\r\n\x1a\n"


def _ihdr(path):
    data = path.read_bytes()
    assert data[:8] == PNG_SIGNATURE, f"{path.name} no es un PNG"
    length, kind = struct.unpack(">I4s", data[8:16])
    assert (length, kind) == (13, b"IHDR"), f"{path.name}: IHDR no es el primer bloque"
    return struct.unpack(">IIBBBBB", data[16:29])


@pytest.mark.parametrize("name,side", sorted(EXPECTED.items()))
def test_icon_size_and_mode(name, side):
    width, height, depth, color_type, _compression, _filter, interlace = _ihdr(ICONS / name)
    assert (width, height) == (side, side)
    assert (depth, color_type) == (8, 2), "RGB de 8 bits, opaco (sin canal alfa)"
    assert interlace == 0


@pytest.mark.parametrize("name", sorted(EXPECTED))
def test_icon_is_light(name):
    # Se precachean en el service worker (B4): nada de PNG pesados.
    assert (ICONS / name).stat().st_size < 20_000


@pytest.mark.parametrize("name", sorted(EXPECTED))
def test_icon_ink_background_with_white_mark(name):
    Image = pytest.importorskip("PIL.Image")
    img = Image.open(ICONS / name).convert("RGB")
    side = img.width
    for corner in [(0, 0), (side - 1, 0), (0, side - 1), (side - 1, side - 1)]:
        assert img.getpixel(corner) == INK, f"{name}: esquina {corner} sin tinta"
    white = sum(img.convert("L").histogram()[240:])  # la tinta da L≈76; el blanco, 255
    assert white / (side * side) > 0.03, f"{name}: la marca blanca no se ve"


def test_maskable_mark_inside_safe_zone():
    Image = pytest.importorskip("PIL.Image")
    img = Image.open(ICONS / "icon-maskable-512.png").convert("RGB")
    side = img.width
    center, radius = side / 2, 0.40 * side
    px = img.load()
    outside = [
        (x, y)
        for y in range(side)
        for x in range(side)
        if (x + 0.5 - center) ** 2 + (y + 0.5 - center) ** 2 > radius**2 and px[x, y] != INK
    ]
    assert not outside, f"{len(outside)} píxeles de la marca fuera de la zona segura, p. ej. {outside[:3]}"


def test_build_icons_reproduces_committed_files(tmp_path):
    pytest.importorskip("PIL")
    from PIL import Image, ImageChops, ImageStat

    from scripts.build_icons import build

    written = build(tmp_path)
    assert sorted(p.name for p in written) == sorted(EXPECTED)
    for name in EXPECTED:
        fresh = Image.open(tmp_path / name).convert("RGB")
        committed = Image.open(ICONS / name).convert("RGB")
        assert fresh.size == committed.size
        diff = ImageStat.Stat(ImageChops.difference(fresh, committed)).mean
        assert max(diff) < 1.0, f"{name}: los iconos del repo no salen de build_icons.py ({diff})"
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd /home/manolo/claude/futbol-base
node --test scripts/tests/test_rediseno_assets.mjs 2>&1 | grep -E '^# (tests|pass|fail)|^not ok'
python3 -m pytest scripts/tests/test_build_icons.py -q 2>&1 | tail -1
```
Esperado:
```text
not ok 1 - fonts/PublicSans-latin.woff2 es el woff2 fijado (26.832 bytes)
not ok 2 - la licencia OFL acompaña a la fuente
not ok 3 - @font-face: Public Sans desde fonts/, pesos 100-900, swap y subconjunto latino
# tests 3
# pass 0
# fail 3
14 failed in …s
```
Los dos primeros fallan con `ENOENT`, y el tercero con `1 !== 0` («una sola familia»). En pytest fallan los 13 de iconos por `FileNotFoundError` y el de regeneración por `ModuleNotFoundError: No module named 'scripts.build_icons'`.

- [ ] **Step 3: Descargar la fuente y su licencia (fijadas por hash)**

```bash
cd /home/manolo/claude/futbol-base
mkdir -p fonts
BASE=https://cdn.jsdelivr.net/npm/@fontsource-variable/public-sans@5.3.0
curl -fsSL --retry 3 -o fonts/PublicSans-latin.woff2 "$BASE/files/public-sans-latin-wght-normal.woff2"
curl -fsSL --retry 3 -o fonts/OFL.txt "$BASE/LICENSE"
LC_ALL=C sha256sum -c - <<'EOF'
5ed4d31c988e73b258894244f209069ebe77dc7e564861954b21198b6de90d68  fonts/PublicSans-latin.woff2
705a497c781f6463ff819abb513bb495f3fb05256f1d20321e3275813c0bafa5  fonts/OFL.txt
EOF
stat -c '%s %n' fonts/PublicSans-latin.woff2 fonts/OFL.txt
```
Esperado:
```text
fonts/PublicSans-latin.woff2: OK
fonts/OFL.txt: OK
26832 fonts/PublicSans-latin.woff2
4503 fonts/OFL.txt
```

Solo si jsDelivr no responde: el tarball de npm trae los mismos bytes; después de copiarlos se repite la comprobación `sha256sum -c` de arriba, y cualquier otro hash es un fichero distinto, que no se usa.
```bash
cd /home/manolo/claude/futbol-base
S=/tmp/claude-1000/-home-manolo/db6fd8e0-f1e7-4e94-b6cd-ef7dd5bf6ae9/scratchpad/planB1
rm -rf "$S/npm-font" && mkdir -p "$S/npm-font"
(cd "$S/npm-font" && npm pack @fontsource-variable/public-sans@5.3.0 --silent && tar -xzf fontsource-variable-public-sans-5.3.0.tgz)
cp "$S/npm-font/package/files/public-sans-latin-wght-normal.woff2" fonts/PublicSans-latin.woff2
cp "$S/npm-font/package/LICENSE" fonts/OFL.txt
```

- [ ] **Step 4: Write minimal implementation (generador de iconos)**

Crear `scripts/build_icons.py`:

```python
#!/usr/bin/env python3
"""Genera los iconos de la PWA (spec §5.5) con Pillow.

Marca: un campo de fútbol en blanco (bandas, línea de medio campo, círculo
central y las dos áreas) sobre la tinta roja del sistema «Acta» (#C0182B).
Se dibuja a 4 aumentos y se reduce con LANCZOS para suavizar los bordes.

- icons/icon-180.png: apple-touch-icon (opaco; iOS redondea las esquinas).
- icons/icon-192.png e icons/icon-512.png: purpose "any".
- icons/icon-maskable-512.png: purpose "maskable"; la marca cabe entera en la
  zona segura, un círculo de radio 0,4 del lado.

Uso: python3 scripts/build_icons.py [directorio]   (por defecto, icons/)
"""
import sys
from pathlib import Path

from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parent.parent
INK = (0xC0, 0x18, 0x2B)
WHITE = (0xFF, 0xFF, 0xFF)
SCALE = 4
ASPECT = 0.64  # ancho / alto del campo
# nombre: (lado en px, alto del campo en fracción del lado)
ICONS = {
    "icon-180.png": (180, 0.70),
    "icon-192.png": (192, 0.70),
    "icon-512.png": (512, 0.70),
    "icon-maskable-512.png": (512, 0.56),
}


def draw_icon(side, field_height):
    big = side * SCALE
    img = Image.new("RGB", (big, big), INK)
    d = ImageDraw.Draw(img)
    h = field_height * big
    w = ASPECT * h
    stroke = round(w / 13)  # proporcional al campo: el maskable conserva el trazo relativo
    cx = cy = big / 2
    x0, y0, x1, y1 = cx - w / 2, cy - h / 2, cx + w / 2, cy + h / 2
    d.rectangle([x0, y0, x1, y1], outline=WHITE, width=stroke)
    d.line([(x0, cy), (x1, cy)], fill=WHITE, width=stroke)
    r = 0.24 * w
    d.ellipse([cx - r, cy - r, cx + r, cy + r], outline=WHITE, width=stroke)
    area_w, area_h = 0.60 * w, 0.16 * h
    d.rectangle([cx - area_w / 2, y0, cx + area_w / 2, y0 + area_h], outline=WHITE, width=stroke)
    d.rectangle([cx - area_w / 2, y1 - area_h, cx + area_w / 2, y1], outline=WHITE, width=stroke)
    return img.resize((side, side), Image.LANCZOS)


def build(out_dir=ROOT / "icons"):
    out = Path(out_dir)
    out.mkdir(parents=True, exist_ok=True)
    written = []
    for name, (side, field_height) in ICONS.items():
        path = out / name
        draw_icon(side, field_height).save(path, optimize=True)
        written.append(path)
    return written


if __name__ == "__main__":
    for path in build(*sys.argv[1:2]):
        print(path.relative_to(ROOT) if path.is_relative_to(ROOT) else path)
```

Generar los iconos:
```bash
cd /home/manolo/claude/futbol-base
python3 scripts/build_icons.py
python3 -c "import PIL; print('Pillow', PIL.__version__)"
stat -c '%s %n' icons/*.png
sha256sum icons/*.png
```
Esperado con Pillow 12.1.1 (con otra versión, los tamaños y los hashes pueden variar; lo que cuenta son las pruebas):
```text
icons/icon-180.png
icons/icon-192.png
icons/icon-512.png
icons/icon-maskable-512.png
Pillow 12.1.1
3939 icons/icon-180.png
4304 icons/icon-192.png
10041 icons/icon-512.png
8979 icons/icon-maskable-512.png
05d151263c1f0dfbf4e237a1b64a9fbb55e2117765e2b03a28680f5cffb73bcb  icons/icon-180.png
b4f0258fd0a5cd31917c0f1addbb26deff261ed4b410eb93a400aeb3da388704  icons/icon-192.png
bde8cfa6e90ff32225f3ccdb51f0f3967ca239d2492713fa554717def6bc1c8d  icons/icon-512.png
6f08c45174be32224b411473b8a807a6748304aab37f2f131332524b5a98e7c4  icons/icon-maskable-512.png
```

- [ ] **Step 5: `@font-face` en `style-acta.css`**

El bloque va entre el comentario de cabecera y `:root {`, con una línea en blanco antes y otra después.

En `style-acta.css`, sustituir el final del comentario de cabecera y el comienzo de `:root`:

```css
 * Tema claro por defecto; el oscuro solo si el sistema lo pide (spec §4.9). */

:root {
```

por:

```css
 * Tema claro por defecto; el oscuro solo si el sistema lo pide (spec §4.9). */

/* Public Sans variable, subconjunto latino (@fontsource-variable/public-sans
 * 5.3.0, licencia OFL en fonts/OFL.txt). Si no carga, system-ui (spec §3.2). */
@font-face {
  font-family: 'Public Sans';
  font-style: normal;
  font-weight: 100 900;
  font-display: swap;
  src: url('fonts/PublicSans-latin.woff2') format('woff2');
  unicode-range: U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6, U+02DA, U+02DC, U+0304, U+0308, U+0329, U+2000-206F, U+20AC, U+2122, U+2191, U+2193, U+2212, U+2215, U+FEFF, U+FFFD;
}

:root {
```

- [ ] **Step 6: Run test to verify it passes**

```bash
cd /home/manolo/claude/futbol-base
node --test scripts/tests/test_rediseno_assets.mjs 2>&1 | grep -E '^# (tests|pass|fail)'
python3 -m pytest scripts/tests/test_build_icons.py -q 2>&1 | tail -1
```
Esperado, sin avisos de pytest:
```text
# tests 3
# pass 3
# fail 0
14 passed in …s
```
El analizador de CSS de la Tarea 11 trata `@font-face` como una regla más: sus 24 pruebas siguen en verde (lo comprueban las suites completas del paso 9).

- [ ] **Step 7: Lo que verá CI, sin Pillow**

```bash
cd /home/manolo/claude/futbol-base
S=/tmp/claude-1000/-home-manolo/db6fd8e0-f1e7-4e94-b6cd-ef7dd5bf6ae9/scratchpad/planB1
mkdir -p "$S/sin-pillow/PIL"
echo 'raise ModuleNotFoundError("No module named PIL", name="PIL")' > "$S/sin-pillow/PIL/__init__.py"
PYTHONPATH="$S/sin-pillow" python3 -m pytest scripts/tests/test_build_icons.py -q -rs 2>&1 | tail -4
```
Esperado:
```text
SKIPPED [4] scripts/tests/test_build_icons.py:48: could not import 'PIL.Image': No module named PIL
SKIPPED [1] scripts/tests/test_build_icons.py:58: could not import 'PIL.Image': No module named PIL
SKIPPED [1] scripts/tests/test_build_icons.py:73: could not import 'PIL': No module named PIL
8 passed, 6 skipped in …s
```

- [ ] **Step 8: Verificación visual de la fuente y de los iconos**

```bash
cd /home/manolo/claude/futbol-base
S=/tmp/claude-1000/-home-manolo/db6fd8e0-f1e7-4e94-b6cd-ef7dd5bf6ae9/scratchpad/planB1
PW=/tmp/claude-1000/-home-manolo/db6fd8e0-f1e7-4e94-b6cd-ef7dd5bf6ae9/scratchpad/pw/node_modules
OUT="$S/shots-t13" EXPECT_FONT=1 NODE_PATH="$PW" node "$S/b1-preview.mjs"
python3 - "$S/shots-t13/iconos.png" <<'EOF'
import sys
from PIL import Image, ImageDraw
out = Image.new("RGB", (1100, 560), (240, 240, 240))
x = 20
for name in ["icon-180.png", "icon-192.png", "icon-512.png"]:
    im = Image.open("icons/" + name)
    im = im.resize((256, 256), Image.LANCZOS) if im.width > 300 else im
    out.paste(im, (x, 20)); x += im.width + 20
m = Image.open("icons/icon-maskable-512.png").resize((256, 256), Image.LANCZOS)
mask = Image.new("L", (256, 256), 0); ImageDraw.Draw(mask).ellipse([0, 0, 255, 255], fill=255)
bg = Image.new("RGB", (256, 256), (240, 240, 240)); bg.paste(m, (0, 0), mask); out.paste(bg, (20, 290))
m2 = m.copy(); ImageDraw.Draw(m2).ellipse([128 - 102.4, 128 - 102.4, 128 + 102.4, 128 + 102.4], outline=(255, 220, 0), width=2)
out.paste(m2, (300, 290))
small = Image.open("icons/icon-192.png")
for i, s in enumerate([96, 48, 32]):
    out.paste(small.resize((s, s), Image.LANCZOS), (600 + i * 110, 300))
out.save(sys.argv[1])
print(sys.argv[1])
EOF
```
Esperado: las medidas de la Tarea 12, ahora con Public Sans cargada, y la ruta del montaje de los iconos. Sin la `@font-face`, `EXPECT_FONT=1` da `PROBLEMAS: … Public Sans no ha cargado`.
```text
390px light forma: {"overflow":0,"small":[],"fonts":["Public Sans"],"broken":[],"covered":false}
390px light foco en la tabla: {"focusVisible":true,"outline":"2px solid","clipped":[]}
390px dark forma: {"overflow":0,"small":[],"fonts":["Public Sans"],"broken":[],"covered":false}
390px dark foco en la tabla: {"focusVisible":true,"outline":"2px solid","clipped":[]}
320px light puntos: {"overflow":0,"small":[],"fonts":["Public Sans"],"broken":[],"covered":false}
1440px light todas: {"overflow":0,"small":[],"fonts":["Public Sans"],"broken":[],"covered":false}
cadena: {"sinNada":"<span class=\"mono mono-32\" aria-hidden=\"true\">FA</span>","sinMiniatura":"<img class=\"crest crest-32\" src=\"./escudos/huracan.png\" data-full=\"./escudos/huracan.png\" data-name=\"AD Huracán\" alt=\"\" width=\"32\" height=\"32\" loading=\"lazy\" decoding=\"async\">"}
OK: sin errores; capturas en /tmp/claude-1000/-home-manolo/db6fd8e0-f1e7-4e94-b6cd-ef7dd5bf6ae9/scratchpad/planB1/shots-t13/b1-*.png
/tmp/claude-1000/-home-manolo/db6fd8e0-f1e7-4e94-b6cd-ef7dd5bf6ae9/scratchpad/planB1/shots-t13/iconos.png
```

Además:
- Abrir con Read `b1-390-light-forma.png` y `b1-320-light-puntos.png`: el texto es Public Sans, la misma letra de las maquetas, y a 320 px «mar 2 jun» cabe en una línea.
- Abrir con Read `iconos.png` y comprobar:
  - arriba, 180, 192 y 512 (a 256): campo blanco nítido sobre tinta, con el círculo central abierto;
  - abajo a la izquierda, el maskable recortado en círculo, con la marca entera;
  - en el centro, la zona segura dibujada en amarillo, con la marca dentro;
  - a la derecha, a 96, 48 y 32 px, el campo sigue reconociéndose.

- [ ] **Step 9: Suites completas**

```bash
cd /home/manolo/claude/futbol-base
python3 -m pytest scripts/tests/ -q 2>&1 | tail -1
node --test scripts/tests/test_*.mjs 2>&1 | grep -E '^# (tests|pass|fail)'
```
Esperado:
- pytest: el recuento anterior más 14, sin `failed` (con Pillow instalado en local; en CI serán 8 más y 6 omitidas).
- node: el recuento anterior más 3, sin fallos (`# fail 0`).

- [ ] **Step 10: Commit**

```bash
cd /home/manolo/claude/futbol-base
git add fonts/PublicSans-latin.woff2 fonts/OFL.txt scripts/build_icons.py icons/icon-180.png icons/icon-192.png icons/icon-512.png icons/icon-maskable-512.png style-acta.css scripts/tests/test_rediseno_assets.mjs scripts/tests/test_build_icons.py
git commit -F - <<'EOF'
feat(rediseño): Public Sans alojada e iconos de la PWA (B1, tarea 13)

fonts/PublicSans-latin.woff2: Public Sans variable (100-900), subconjunto
latino de @fontsource-variable/public-sans 5.3.0 (26.832 bytes, sha256
fijado), con su licencia OFL. style-acta.css la declara con
font-display: swap y system-ui de respaldo.

scripts/build_icons.py (Pillow) genera icons/icon-180, icon-192,
icon-512 e icon-maskable-512: un campo de fútbol blanco sobre la tinta
#C0182B; en el maskable, dentro de la zona segura. Todavía no los
referencia ni el manifiesto ni el service worker (B4).

- test_rediseno_assets: hash y cabecera WOFF2, licencia y @font-face.
- test_build_icons: tamaño y modo sin Pillow (CI y bot); con Pillow,
  fondo de tinta, marca blanca, zona segura del maskable y regeneración.

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01Sg56KK3oZgo8Ye7Snj6wG9
EOF
git show --stat --oneline HEAD | tail -1
```
Esperado: `10 files changed` (con `git show --stat`, los binarios salen como `Bin 0 -> N bytes`).

---

### Task 14: Contrato de B1 (spec §5.1, §5.2, §10 y §12)

**Contexto**
- **Qué vigila.** Es la red de seguridad de todo B1, así que pasa a la primera: el paso 2 comprueba que muerde, con violaciones temporales. Comprueba cinco cosas:
  1. `html.js`, `model.js`, `myteam.js`, `store.js` y `ui.js` se importan en Node sin tocar `window`, `document`, `localStorage`, `sessionStorage`, `location`, `history` ni `navigator` al importarse. Se ponen trampas (getters que anotan el acceso) y se importan. `state.js` y `links.js` son legado y su nivel superior mira `document` con `typeof`, así que se cargan antes de poner las trampas.
  2. Su código, sin comentarios, no contiene `typeof` sobre identificadores en mayúsculas, ni `globalThis`, `window`, `document`, `localStorage` ni `sessionStorage`, ni ninguno de los globales que declaran los `data-*.js`. La lista sale de las declaraciones de nivel superior de esos ficheros (`const X=` al principio de línea o tras `;`, como `HIST_MATCHES` en `data-history.js`): solo los nombres, nunca los valores, que es la única lectura de los `data-*.js` que se permite en una prueba. Así ningún global futuro se escapa; los de los años que aún no existen los cubre un patrón.
  3. Solo importan módulos planos de `src/`, sin `import()` dinámico, y solo de los que sobreviven al corte de B2 (spec §5.2): los cinco nuevos, `links.js`, `state.js` y `config.js`. Nunca `render.js`, `modals.js`, `init.js`, etc.
  4. El grafo de imports estáticos de `src/app.js` no incluye ninguno de los cinco. Es el mismo recorrido que `test_sw_fixes.mjs`, y `links.js` sí está en el grafo.
  5. Ni `index.html`, ni `sw.js`, ni `manifest.json` referencian `src/<nuevo>.js`, `style-acta.css`, `PublicSans-latin.woff2` ni `icons/icon-`.
- **Datos vivos.** De los `data-*.js`, la prueba solo lee los nombres que declaran, nunca sus valores (restricción global «Pruebas nuevas»); de `src/config.js` no depende de ningún valor: solo importa `state.js` y `links.js`, que importan `config.js`.
- **Qué permite.** Sigue las restricciones globales: los módulos nuevos pueden importar `state.js`, `links.js` y `config.js`. Lo prohibido es leer globales `data-*`, usar `window`, `document`, `localStorage` o `globalThis` (ni siquiera al importarse) y el `import()` dinámico.

**Files:**
- Test: `scripts/tests/test_rediseno_b1_contract.mjs`

**Interfaces:**
- Consumes: `src/html.js`, `src/model.js`, `src/myteam.js`, `src/store.js` y `src/ui.js` (Tareas 2-12), `src/state.js`, `src/links.js`, `src/app.js`, `index.html`, `sw.js`, `manifest.json` y los nombres que declaran los `data-*.js`.
- Produces: la garantía de §12.1 («la app actual y todas sus suites siguen en verde; ficheros nuevos que la app vieja no importa»), que B2 relajará en el corte: entonces esta prueba se reescribe o se borra.

- [ ] **Step 1: Write the test**

Crear `scripts/tests/test_rediseno_b1_contract.mjs`:

```js
// Plan B1, tarea 14: contrato de los cimientos del rediseño.
// - Los módulos nuevos se importan en Node sin DOM y no tocan globales del
//   navegador al importarse.
// - No leen globales de datos (data-*.js) ni del navegador (globalThis,
//   window, document, localStorage): reciben los datos por parámetro (el
//   cableado llega en B2).
// - Solo importan módulos planos de src/ que sobreviven al corte de B2.
// - La app actual no carga nada de B1: ni index.html, ni sw.js, ni
//   manifest.json, ni el grafo de imports de src/app.js.
import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const NEW = ['html.js', 'model.js', 'myteam.js', 'store.js', 'ui.js'];
// Lo que pueden importar: los nuevos y el legado que se queda tras el corte (spec §5.2).
const ALLOWED_IMPORTS = new Set([...NEW, 'links.js', 'state.js', 'config.js']);
const read = (path) => readFileSync(join(ROOT, path), 'utf8');

// Globales de datos: los nombres que declaran los data-*.js en su nivel superior («const X=» al
// principio de línea o tras «;»). Solo se leen los nombres, nunca los valores: es la única
// lectura de esos ficheros que se permite en las pruebas. El patrón de años cubre además los
// ficheros que aparecerán al activar temporadas nuevas.
const DATA_NAMES = [...new Set(readdirSync(ROOT).filter((f) => /^data-.*\.js$/.test(f))
  .flatMap((f) => [...read(f).matchAll(/(?:^|;)\s*(?:const|let|var)\s+([A-Z][A-Z0-9_]*)\s*=/gm)].map((m) => m[1])))].sort();
const DATA_GLOBAL = new RegExp(String.raw`\b(?:${DATA_NAMES.join('|')}|(?:SEASON|LINEUPS|PLAYERS|TEAMS)_\d{4}_\d{4})\b`);
// Código sin comentarios (los comentarios pueden nombrar HISTORY o localStorage).
const code = (src) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');

test('los módulos nuevos se importan en Node sin tocar globales del navegador', async () => {
  // Legado: su nivel superior mira `document` con typeof. Se carga antes de las trampas.
  await import('../../src/state.js');
  await import('../../src/links.js');
  const names = ['window', 'document', 'localStorage', 'sessionStorage', 'location', 'history', 'navigator'];
  const saved = names.map((n) => [n, Object.getOwnPropertyDescriptor(globalThis, n)]);
  const touched = [];
  for (const n of names) {
    Object.defineProperty(globalThis, n, { configurable: true, get() { touched.push(n); return undefined; } });
  }
  try {
    for (const f of NEW) await import(`../../src/${f}`);
  } finally {
    for (const [n, d] of saved) {
      if (d) Object.defineProperty(globalThis, n, d);
      else delete globalThis[n];
    }
  }
  assert.deepEqual(touched, [], `leídos al importar: ${touched.join(', ')}`);
});

test('los módulos nuevos no leen globales de datos ni del navegador', () => {
  // La lista sale de los propios data-*.js: también HIST_MATCHES, declarado tras un «;».
  for (const name of ['BENJAMIN', 'PREBENJAMIN', 'HISTORY', 'HIST_MATCHES', 'SHIELDS', 'SEASONS', 'MATCH_DETAIL']) {
    assert.ok(DATA_NAMES.includes(name), `falta ${name} en la lista de globales de datos`);
  }
  for (const f of NEW) {
    const src = code(read(`src/${f}`));
    assert.doesNotMatch(src, /\btypeof\s+[A-Z][A-Z0-9_]*\b/, `${f}: typeof sobre un global`);
    const browser = src.match(/\b(globalThis|window|document|localStorage|sessionStorage)\b/);
    assert.equal(browser, null, `${f} nombra el global del navegador ${browser && browser[0]}`);
    const hit = src.match(DATA_GLOBAL);
    assert.equal(hit, null, `${f} nombra el global de datos ${hit && hit[0]}`);
  }
});

test('los módulos nuevos solo importan módulos planos de src/ que sobreviven al corte', () => {
  for (const f of NEW) {
    const src = code(read(`src/${f}`));
    assert.doesNotMatch(src, /\bimport\s*\(/, `${f}: import() dinámico`);
    for (const [, spec] of src.matchAll(/(?:from|import)\s*['"]([^'"]+)['"]/g)) {
      assert.match(spec, /^\.\/[\w-]+\.js$/, `${f}: «${spec}» no es un módulo plano de src/`);
      assert.ok(ALLOWED_IMPORTS.has(spec.slice(2)), `${f} importa ${spec}, que se borra en el corte de B2`);
    }
  }
});

// Mismo recorrido que test_sw_fixes.mjs: imports estáticos desde src/app.js.
function staticImportGraph(entry) {
  const seen = new Set();
  const queue = [entry];
  while (queue.length) {
    const f = queue.pop();
    if (seen.has(f)) continue;
    seen.add(f);
    for (const m of read(`src/${f}`).matchAll(/(?:from|import)\s+['"]\.\/([\w-]+\.js)['"]/g)) queue.push(m[1]);
  }
  return seen;
}

test('la app actual no importa los módulos nuevos', () => {
  const graph = staticImportGraph('app.js');
  assert.ok(graph.has('links.js'), 'el grafo de app.js debería incluir links.js');
  assert.deepEqual(NEW.filter((f) => graph.has(f)), []);
});

test('index.html, sw.js y manifest.json no cargan nada de B1', () => {
  const B1 = [...NEW.map((f) => `src/${f}`), 'style-acta.css', 'PublicSans-latin.woff2', 'icons/icon-'];
  for (const file of ['index.html', 'sw.js', 'manifest.json']) {
    const src = read(file);
    assert.deepEqual(B1.filter((ref) => src.includes(ref)), [], `${file} ya referencia ficheros de B1`);
  }
});
```

- [ ] **Step 2: Run test y comprobar que muerde**

```bash
cd /home/manolo/claude/futbol-base
node --test scripts/tests/test_rediseno_b1_contract.mjs 2>&1 | grep -E '^# (tests|pass|fail)'
```
Esperado (B1 ya cumple el contrato):
```text
# tests 5
# pass 5
# fail 0
```

Tres violaciones temporales, cada una deshecha antes de la siguiente:
```bash
cd /home/manolo/claude/futbol-base
sed -i 's#<link rel="stylesheet" href="./style.css?v=\([^"]*\)">#&\n  <link rel="stylesheet" href="./style-acta.css">#' index.html
node --test scripts/tests/test_rediseno_b1_contract.mjs 2>&1 | grep -E '^not ok|^# fail'
git checkout -- index.html
echo "const sondaB1 = typeof localStorage !== 'undefined' ? localStorage : null;" >> src/store.js
node --test scripts/tests/test_rediseno_b1_contract.mjs 2>&1 | grep -E '^not ok|^# fail|leídos al importar'
git checkout -- src/store.js
sed -i "1i import './ui.js';" src/init.js
node --test scripts/tests/test_rediseno_b1_contract.mjs 2>&1 | grep -E '^not ok|^# fail'
git checkout -- src/init.js
git status --short | grep -v '^??'
```
Esperado: cada violación hace fallar su prueba (la sonda de `localStorage`, las dos que la vigilan), y al final `git status` no muestra ningún fichero modificado:
```text
not ok 5 - index.html, sw.js y manifest.json no cargan nada de B1
# fail 1
not ok 1 - los módulos nuevos se importan en Node sin tocar globales del navegador
    leídos al importar: localStorage
not ok 2 - los módulos nuevos no leen globales de datos ni del navegador
# fail 2
not ok 4 - la app actual no importa los módulos nuevos
# fail 1
```

El `sed` de `index.html` se ancla en el `<link>` de `style.css` con su `?v=`, que el bot cambia pero siempre existe.

- [ ] **Step 3: Suites completas (cierre de B1)**

```bash
cd /home/manolo/claude/futbol-base
python3 -m pytest scripts/tests/ -q 2>&1 | tail -1
node --test scripts/tests/test_*.mjs 2>&1 | grep -E '^# (tests|pass|fail)'
```
Esperado:
- pytest: el mismo recuento que al terminar la tarea anterior, sin `failed` (esta tarea no añade pruebas de Python).
- node: el recuento anterior más 5, sin fallos (`# fail 0`).

- [ ] **Step 4: Commit**

```bash
cd /home/manolo/claude/futbol-base
git add scripts/tests/test_rediseno_b1_contract.mjs
git commit -F - <<'EOF'
test(rediseño): contrato de los cimientos (B1, tarea 14)

Los módulos nuevos (html, model, myteam, store y ui) se importan en Node
sin tocar globales del navegador, no nombran globales de datos ni del
navegador, solo importan módulos planos que sobreviven al corte
de B2, y la app actual no carga nada de B1: ni el grafo de src/app.js,
ni index.html, ni sw.js, ni manifest.json (style-acta.css, fuente e
iconos incluidos).

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01Sg56KK3oZgo8Ye7Snj6wG9
EOF
git show --stat --oneline HEAD | tail -1
```
Esperado: `1 file changed`, con `scripts/tests/test_rediseno_b1_contract.mjs`.

---

## Para B2 y siguientes

Hechos que dejan las tareas de B1 para planificar B2-B5. B1 no ejecuta nada de esto.

- **Cableado con los globales (B2).**
  - Temporada actual: `buildSeason({ name: PORTAL.season, current: true, benjamin: BENJAMIN, prebenjamin: PREBENJAMIN, history: HISTORY })`. Temporadas pasadas: `buildSeason(SEASON_2024_2025)`, tal cual. Torneos: `buildCups({ season: '2025-2026', benjamin: MASPALOMAS_CUP_BENJAMIN, prebenjamin: MASPALOMAS_CUP_PREBENJAMIN })`, que siguen siendo de 2025/26 después de activar 2026/27.
  - `resolveMyTeam` recibe siempre la `Season` de `PORTAL.season`, nunca un archivo (decisión 4). Después, B2 guarda `updatedMyTeam(myTeam, resolution)` cuando no es `null` (decisión 12): así el cambio de fase o de temporada queda fijado aunque la familia no abra la app en el momento justo.
  - El almacén se abre con la función, no con el Storage ya leído: `loadStore(() => window.localStorage, …)`. Con las cookies bloqueadas, solo leer `window.localStorage` ya lanza.
  - La vista Forma de `standingsTable` necesita `row.form`: `rows.map(r => ({ ...r, form: lastResults(r.team, group).map(x => x.letter) }))`. Casa y Fuera reciben las filas de `homeAwayTable`.
  - En escritorio, el selector de la Tabla lleva «Todas», «Casa» y «Fuera»; en móvil, las cinco vistas (decisión 15).
  - `rowToMatch` lanza con filas de otra longitud (hoy no hay ninguna): B2 lo convierte en la caja de error con «Reintentar».
  - Todo el grafo importa `./html.js` con el mismo especificador (sin `?v=`): un `Html` de otra instancia del módulo se escaparía.
- **Escudos.**
  - `escudos/s/` no existe hasta B4: cada escudo pide antes una miniatura que da 404. B2 instala `document.addEventListener('error', (e) => crestFallback(e.target), true)` antes del primer pintado, o adelanta `build_crests.py`. `sw.js` no guarda las respuestas que no son `ok`.
  - Con la búsqueda exacta o normalizada, unos 20 nombres de 2025-26 se quedan sin escudo y pasan a monograma. Entre ellos está «Las Mesas Hu. B», el filial del propio club; también Casa Pastores, Telde C, Vecindario B, Las Rosas, CF Mogán, Valsequillo B, San Fernando B y varios nombres de la federación con la letra de filial entre comillas (de Jovero-Las Rosas, Veteranos del Pila, Atisachi, Jandía o Corralejo, entre otros). Pasa lo mismo con nombres de torneo como «CD Maspa Training A».
  - Cómo resolverlo, sin volver nunca a la subcadena: añadir sus claves exactas a `SHIELDS` (datos, con `check_missing_shields.py`; como mínimo «Las Mesas Hu. B» → `lasMesasEscudo.png`), heredar el fichero único del club con `index.members(name)`, o aceptar el monograma.
  - «Acodetti» y «Telde» sí tienen escudo (por el nombre normalizado): las maquetas que los pintan con monograma están mal.
  - «Real Club Victoria» (MCP3) no se une a RC Victoria (clave base «real victoria» y sin escudo): es el primer candidato para ampliar `TEAM_ALIASES` si se quiere el Verano de RC Victoria.
- **Rutas y enlaces antiguos.**
  - Los enlaces antiguos de «miequipo» casi siempre llevan `team` y `group`, porque `routeUrl` escribe `FEATURED.name` y `S.jorGroup`: van a `#/equipo?g&t`, y `g` puede no ser el grupo del equipo. La pantalla Equipo (B3) tiene que tolerar un `t` que no está en `g`.
  - `section=goleadores` sigue la tabla de §4.1 (`#/goleadores?g=<group>`), pero ese `group` era `S.jorGroup`, no el grupo de la página de goleadores. Se sigue la tabla (decisión 7); si en B2 se prefiere la traducción fiel, sería la global (`#/goleadores?c=<cat>`), un cambio de una línea y una prueba.
  - `parseRoute` descarta lo que va tras un segundo `#`: el ancla `#calendario` de la ficha de equipo se resuelve con un `id` y un desplazamiento (B3).
  - `tabbar` usa `'miequipo'` para la pantalla `''`, y los `hrefFor` de `standingsTable` y `segmented` devuelven `routeHref(…)`.
- **Textos y datos que B1 no cubre.**
  - Cobertura de temporadas pasadas: hay casos que el texto de §7 no prevé, como un PJ menor que el calendario (FV13 2023-24, 18 frente a 20) o un calendario muy incompleto (LZP1 2021-22, 24 frente a 14). Hace falta un texto del tipo «Calculado con N partidos del calendario; la clasificación cuenta M».
  - `seasonSummary` no trae el máximo goleador de «Así terminó»: sale de los goleadores.
  - El cara a cara de Partido (§4.5) sale de `headToHead(group, a, b)`, solo del grupo; los partidos de temporadas anteriores («Ver temporadas anteriores») son de B2.
  - A mitad de temporada, `withResult < calendar` también cuenta los partidos que aún no se han jugado: el «N de M partidos con resultado» de §7 tiene que contar solo los `sin resultado` de `matchState`.
  - La cronología tiene que tolerar `name` y `minute` a `null`, y un acta sin goles (`goals: []`).
  - La portada sale de `teamFixtures`: en A, `next` es el próximo partido. En C, «Próximo partido sin fecha publicada» solo si `undated > 0`, y «Ya ha jugado todos sus partidos» si `remaining === 0` (con los datos reales: Las Mesas y AD Huracán del 03 al 06/06/2026, RC Victoria del 25/05 al 06/06 y los cuatro filiales B de PLZ2 del 11 al 31/05). Si le quedan partidos (`remaining > 0`), ninguno sin fecha (`undated === 0`) y no hay `next`, todos los que quedan son `sin resultado`: «Resultado pendiente de publicar» (FB CD Tamasite del 24 al 31/05/2026 y FB Corralejo 35 del 25 al 31/05).
  - Un grupo de copa todavía sin partidos sale `cup-bracket` (`isRoundRobinCup({})` es falso): una fase de grupos de la Maspalomas de 2027 publicada antes que sus partidos se vería como un cuadro.
- **Almacén (B2 y B3).**
  - `loadStore` no guarda el equipo por defecto: lo guarda el primer `saveStore` («Hacer mi equipo», respuesta a E, `updatedMyTeam` tras un cambio de fase o de temporada, o `addRecent`).
  - `recent` puede traer grupos MC* de la migración: «Vistos hace poco» los abre en `#/copa` o los busca en `Cups`.
  - «Borrar datos de esta app» (B3) necesita un `removeItem` que `store.js` no tiene.
- **Página, estilos y PWA (B2-B4).**
  - Faltan en `style-acta.css`, y llegan con sus pantallas: la cabecera (escudo, `h1`, etiqueta y «Cambiar»), la navegación de jornada, el marcador de 40 px y las casillas de «Últimos cinco».
  - `main` lleva la clase `page` y el `id` al que apunta `.skip-link`; la cabecera de escritorio es de `shell.js`.
  - Las filas de tabla de 44 px hacen la clasificación de 15 equipos más alta que en las maquetas (660 px frente a unos 450).
  - `index.html` (B4): `meta theme-color` dos veces (`#FFFFFF` y `#15171C`, con `media`), `preload` de `fonts/PublicSans-latin.woff2` y `apple-touch-icon` a `icons/icon-180.png`. Con `manifest.json`, `sw.js` y el filtro `fonts/**` e `icons/**` de `tests.yml`.
- **Corte de B2.**
  - `test_rediseno_b1_contract.mjs` se reescribe o se borra en el corte, cuando la app empiece a cargar los módulos nuevos.
  - `model.js` importa `isCupGroup` de `state.js`: si el corte lo borra de allí, su cuerpo pasa a `model.js`, y la prueba de `groupKind` protege el comportamiento.
  - La lista de globales `data-*` de la Tarea 14 sale de los propios ficheros, así que un global nuevo entra solo; los de los años que aún no existen los cubre el patrón.
- **De la revisión final de B1.**
  - **«Hoy» en Canarias (M1):** B2 calcula `todayISO` en `Atlantic/Canary` con `Intl.DateTimeFormat('en-CA', { timeZone: PORTAL.timeZone })`, nunca con la zona del dispositivo. La única función que lo calcula hoy, `localTodayISO` de `src/miequipo.js`, usa la del dispositivo: en un móvil con hora peninsular, entre las 23:00 y las 24:00 de Canarias, «hoy» ya sería mañana, el partido del día pasaría a «sin resultado» y la cuenta atrás fallaría.
  - **Las dos causas del estado B (M2):** `homeState` da B si el grupo no ha jugado nada, pero también si el grupo ya tiene resultados y mi equipo no ha jugado ni tiene próximo partido (un retirado, como CD Batán en PG2, está en B toda la temporada). En ese segundo caso, B2 no puede enseñar «Aún no se ha jugado ninguna jornada» ni la clasificación a cero.
  - **Paso 1 con la temporada activada por partes (M3):** con 2026/27 activada solo en una categoría, el paso 1 puede quedarse en silencio con el mismo nombre en la categoría antigua, `updatedMyTeam` lo guarda y, cuando llega la otra categoría, el paso 0 ya no pregunta: es el caso 3 de la spec (Las Mesas en prebenjamín y «Las Mesas B» en benjamín). El procedimiento de activación exige las dos categorías; conviene revisarlo en B2, por ejemplo sin dar por definitiva la resolución del paso 1 mientras la otra categoría no tenga grupos de liga.
  - **Búsqueda de escudo (M7):** `crest` (`ui.js`) y `buildClubIndex` (`myteam.js`) repiten «exacto o normalizado, gana la primera clave». En el corte se unifican en `shieldFile(name)` de `state.js` (§5.2), para que no diverjan.
  - **`stale` (decisión 20):** con `resolution.stale`, B2 enseña en los estados C y D «¿Sigue tu equipo en la Segunda Fase? Búscalo en Explorar». La marca espera a que la fase posterior lleve 7 días en marcha. Sin esa semana, con cada grupo visible desde su primer partido (el modelo de la regresión diaria), la llevaban 118 equipos de Gran Canaria el 26 y el 27/11/2025, porque C2 adelantó un partido al 26/11. Con los datos vivos de 2025-26 y los cinco alias, no la lleva nadie ningún día de la temporada. Sin esos alias, la llevarían exactamente los cinco atascados de verdad, desde el 03/12 en Gran Canaria y desde el 25/12 en Fuerteventura. Un atascado nuevo en 2026/27 saldrá con la marca y se arregla con otro alias.
  - **«Verano» (decisión 19):** llega por equipo de torneo, con `{ group, team, rows }`; el puesto de la fase de grupos es el de `team` en `group.standings`. Con los datos de 2025-26 lo reciben 71 de los 286 equipos de liga (antes, 89, y 42 de ellos con partidos de sus hermanos). Se quedan sin él 19: los C y D de clubes que solo llevaron A y B (Unión Viera C, Corazón Mª C y D y Vecindario C) y 15 filiales B o C de clubes que llevaron un solo equipo sin letra, que cuenta como el A (entre ellos, «Las Mesas B» y «Las Mesas Hu. B»).
  - **Memoización (recomendación 3):** B2 memoriza por grupo, con un `WeakMap`, `retiredTeams` y el orden cronológico de los partidos, que hoy se recalculan en cada llamada. Hoy cuesta poco (unos 0,9 ms por `resolveMyTeam` más `homeState`), pero la vista Forma y Récords lo multiplican.
  - **`formChips` (recomendación 4):** junto a cada letra, un texto oculto («ganado», «empatado» o «perdido»), por accesibilidad.
