# Diseño — SP-1: Pipeline de datos de actas FIFLP (jugadores / alineaciones / goles-por-jugador)

Fecha: 2026-05-19
Proyecto: `futbol-base` (portal fútbol base Las Palmas, SPA vanilla JS, GitHub Pages, SQLite `futbolbase.db` versionado, zero-dep)
Estado: aprobado en brainstorming, pendiente de plan de implementación

> Este es el **Sub-Proyecto 1** de la petición "completar al máximo la información de
> cada equipo y cada jornada (plantilla, goleadores, etc.) en todas las temporadas".
> SP-1 = **datos** (este documento). SP-2 = **presentación rica** (spec aparte, posterior,
> consume lo que SP-1 deja en la DB y en los `data-*.js`). El orden datos→UI lo
> confirmó el usuario.

## 1. Objetivo

Hoy la DB solo tiene jugadores de forma indirecta (tablas `goals` y `scorers`) y
**solo para la temporada 2025-2026**. No hay plantillas, ni alineaciones por
partido, ni goles-por-jugador en temporadas anteriores. La petición del usuario es
maximizar la información por equipo y por jornada en **todas** las temporadas.

El usuario verificó que el dato existe en origen: las **actas** de fiflp.com
(`NFG_CmpPartido?cod_primaria=1000120&CodActa=N&cod_acta=N`) contienen, por
partido, la alineación completa de ambos equipos (dorsal + "APELLIDOS, NOMBRE",
titulares y suplentes), los goles con goleador y minuto, árbitro, entrenador y
campo/ciudad. El discovery (2 rondas en CI) lo confirmó y además resolvió el
enlace fila-de-partido → acta (cada fila de partido lleva un `<a
href="…NFG_CmpPartido…CodActa=N…">` directo).

SP-1 construye el pipeline que extrae esas actas, las normaliza a nuevas tablas de
la DB, las reconcilia con los partidos ya existentes y genera ficheros de datos
(lazy) listos para que SP-2 los presente. **SP-1 no toca la UI.**

## 2. Alcance

**Dentro:**
- `scripts/fetch_fiflp_actas.py`: scraper Playwright **incremental y reanudable**,
  por temporada, ejecutado **solo en GitHub Actions** (la IP local está bloqueada
  por FIFLP). Guardado progresivo a `scripts/fiflp_actas_<season>_raw.json`.
- `.github/workflows/fetch-fiflp-actas.yml`: workflow_dispatch con input de
  temporada; instala Playwright; corre el scraper; commitea el raw JSON.
- `scripts/import_fiflp_actas.py`: importador idempotente raw JSON → DB
  (reconcilia acta ↔ `matches`, upserta jugadores/alineaciones/staff).
- Nuevas tablas: `players`, `appearances`, `match_events`, `match_staff`; nueva
  columna `matches.cod_acta`. Los eventos (goles, **cambios** con minuto, y
  **tarjetas amarilla/roja con minuto**) se modelan como eventos timeline para
  poder presentar la cronología completa en SP-2.
- `scripts/generate_js.py`: nuevas funciones que emiten `data-lineups-<season>.js`
  y `data-players-<season>.js` (por temporada, **lazy**, mismo patrón que los
  `data-season-*.js`).
- Ampliar la allow-list de `git add` de `.github/workflows/update.yml` con los
  nuevos `data-*.js` (sin esto se congelarían en producción — lección registrada).
- Tests: pytest del parser de acta contra un fixture HTML real; test Node de
  invariantes de los nuevos data files.
- Cobertura **honesta y reportada** por temporada.

**Fuera (YAGNI — son SP-2 o no aplican):**
- Cualquier cambio de UI / `src/` / `index.html` / `style.css` / componentes
  visuales / cache-bust (`CACHE_NAME`, `?v=`). Eso es SP-2.
- Reescrabear o cambiar el formato de los `data-*.js` ya existentes ni de las
  tablas `goals`/`scorers`/`matches`/`teams`/`standings` salvo añadir
  `matches.cod_acta`.
- Estadísticas derivadas avanzadas (minutos jugados exactos, mapas de calor,
  rachas por jugador): SP-1 deja el dato crudo normalizado; lo elaborado es SP-2.
- Foto/escudo de jugador, fichas individuales: no las sirve FIFLP en el acta.
- Tarjetas con minuto exacto si el acta no lo da limpio: se guarda el conteo
  (amarillas/rojas por jugador) pero no se inventa el minuto.

## 3. §1 — Scraper `scripts/fetch_fiflp_actas.py` + workflow

### 3.1 Patrón base (reuso del código existente)

Reutiliza el patrón ya probado de `scripts/fetch_fiflp.py` /
`scripts/fetch_fiflp_2425.py`:
- Playwright chromium **headless**, UA custom, `page.goto(...)` con reintentos +
  `wait_for_timeout(2500)`.
- `BASE = "https://www.fiflp.com/pnfg/NPcd"`, constante `cod_primaria=1000120`.
- Función `delay()` de cortesía (2–3,5 s aleatorio) entre peticiones — FIFLP
  rate-limita y puede bloquear; mantener el mismo ritmo que los scrapers actuales.

### 3.2 Mapa de temporadas y catálogo de competiciones

`CodTemporada`: `21`→2025-26, `20`→2024-25, `19`→2023-24, `18`→2022-23,
`17`→2021-22.

Las competiciones benjamín/prebenjamín por temporada salen de las fuentes que ya
existen en el repo (no se reinventan):
- 2025-26 y 2024-25: las listas `COMPETITIONS` de `fetch_fiflp.py` y
  `fetch_fiflp_2425.py` respectivamente.
- 2023-24 / 2022-23 / 2021-22: `scripts/fiflp_comps_catalog.json` (dict por
  temporada con `season_code` + lista de comps relevantes; p. ej. 2021-22 comp
  `891`, 2022-23 comp `1092`).

El scraper recibe `--temporada NN` (workflow input) y resuelve la lista de comps
de esa temporada desde estas fuentes.

### 3.3 Enumeración de actas (camino principal + fallback)

Por cada `(temporada, competición)`:
1. `NFG_CmpJornada?cod_primaria=1000120&CodTemporada=NN` → seleccionar
   `select[name="competicion"]` → leer opciones de `select[name="grupo"]`.
2. Por cada grupo → seleccionarlo → leer opciones de jornada → por cada jornada
   ejecutar el JS `BuscarPartidos('<jornada_value>')`.
3. De cada fila de partido leer el **anchor del acta**: regex sobre el `href`
   `NFG_CmpPartido[^"'\s]*CodActa=(\d+)` → `CodActa`. (Esto es la enumeración: la
   lista de `CodActa` de la temporada se obtiene navegando jornadas, no
   adivinando rangos.)

**Enumeración 2024-25 (spike obligatorio, sin opción a abandonar):** en el
discovery la lista de jornadas vino vacía vía la competición probada (comp 1581
de 2024-25). El usuario confirmó que las actas **existen** para esa temporada
(URL directa funciona), así que la enumeración tiene que resolverse. El scraper
prueba, **en este orden**, hasta que una dé actas:
1. Camino principal (comp→grupo→jornada→`BuscarPartidos`) — el que ya funciona en
   las demás temporadas.
2. **Listado de partidos de la temporada** (`NFG_LstPartidos` / "Horarios de
   Partidos") seleccionando comp+grupo y leyendo todos los anchors `CodActa=…`
   de la página completa, no jornada-a-jornada.
3. **Página de equipo** (`NFG_CmpEquipo` / detalle de club por temporada): para
   cada equipo del grupo, la página de su calendario lista los partidos jugados
   con anchor al acta — recolectar `CodActa` desde ahí y deduplicar.
4. **Barrido por rango de `CodActa`** acotado por los valores conocidos de 2023-24
   y 2025-26 (el discovery dio acta `190080` ⇒ 2025-26; los rangos por temporada
   son contiguos en FIFLP). Barrer el rango candidato, abrir cada acta, leer la
   temporada de la cabecera y descartar las que no son 2024-25; útil como
   último recurso, más costoso pero exhaustivo.

El scraper registra qué estrategia funcionó por (comp, grupo). Una temporada
**no se da por cerrada** hasta que la enumeración produce actas para todas sus
comps relevantes; si la #1 da 0, se prueba la #2, etc. **Sin coverage fingida y
sin abandonar la temporada.** Este es un spike dedicado en el plan, con
verificación en CI sobre una comp pequeña antes de escalar.

### 3.4 Parseo del acta

Abrir `NFG_CmpPartido?cod_primaria=1000120&CodActa=N&cod_acta=N` (es un frameset;
localizar el frame de contenido del acta) y extraer:
- **Cabecera:** temporada, jornada, fecha, competición/grupo, equipo local,
  equipo visitante, marcador.
- **Alineaciones de AMBOS equipos:** filas `dorsal | "APELLIDOS, NOMBRE"`,
  distinguiendo **titulares** vs **suplentes** por la sección/tabla en que
  aparecen → `role ∈ {'starter','sub'}`.
- **Goles:** goleador + minuto + tipo (normal / penalti / propia). El **minuto
  está ofuscado** con la misma técnica anti-scrape que el MATCH_DETAIL (texto
  inyectado vía CSS `::before`). Se reutiliza la técnica ya implementada en
  `fetch_fiflp_2425.py::_scores_from_browser` (`page.evaluate` leyendo
  `getComputedStyle(el,'::before').content`). Si un minuto no se puede
  desofuscar limpio, se guarda el gol con `minute = NULL` (no se inventa) y se
  cuenta igual para el agregado de goleador.
- **Cambios (sustituciones):** evento `sub_in`/`sub_out` con jugador + minuto
  (mismo desofuscador `::before`). Si el acta solo indica "suplente utilizado"
  sin minuto, se registra el evento con `minute = NULL` (rol del jugador queda
  en `sub` igualmente, pero el evento informa que **sí entró al campo**, distinto
  de un suplente que no jugó).
- **Tarjetas:** eventos `yellow`/`red` con jugador + minuto (mismo desofuscador).
  Se mantiene además el conteo agregado en `appearances.yellow`/`red` (denormal.
  para queries rápidas) — los counts deben coincidir con el nº de eventos
  amarilla/roja del jugador en ese partido (invariante testada).
- **Staff:** árbitro y entrenador(es) → `match_staff`.
- **Campo/ciudad** (informativo; `matches.venue` ya existe — no se sobrescribe,
  solo se usa para desempate en la reconciliación).

### 3.5 Incremental, reanudable, por temporada

- Guardado progresivo a `scripts/fiflp_actas_<season>_raw.json`, un objeto keyado
  por `CodActa` (string). Al arrancar, **cargar el fichero existente y saltar las
  actas ya presentes** (mismo patrón `done`-set de `fetch_fiflp.py`). Así varios
  `workflow_dispatch` sucesivos completan una temporada (≈11.700 actas totales /
  ~10 h ⇒ no cabe en un run; un run de 6 h máx avanza un trozo y commitea, el
  siguiente continúa).
- El scraper imprime al final: total actas vistas, scrapeadas en este run,
  pendientes restantes, y los `WARN …jornadas:0`. Idempotente: re-ejecutar no
  re-scrapea lo hecho.
- `season` en el nombre del raw = etiqueta legible (`2021-2022`…`2025-2026`)
  derivada de `CodTemporada`.

### 3.6 Workflow `.github/workflows/fetch-fiflp-actas.yml`

- `on: workflow_dispatch` con input `temporada` (choice 17|18|19|20|21) y opcional
  `comp` (filtrar a una competición para spikes).
- `ubuntu-latest`, `actions/setup-python@v5` (3.11 — **CI es Python 3.11**: nada
  de backslashes en f-strings, lección del discovery), `pip install playwright` +
  `playwright install chromium --with-deps`.
- Ejecuta `python3 scripts/fetch_fiflp_actas.py --temporada <input> [--comp …]`.
- `timeout-minutes` alto (p. ej. 330) como los workflows FIFLP existentes.
- Commitea **solo** `scripts/fiflp_actas_<season>_raw.json` (la importación a DB +
  generación es un paso separado, igual que en el resto del pipeline FIFLP del
  repo). Mensaje de commit claro (`chore(fiflp): actas <season> +N (M pend.)`).
- Fichero creado vía `cat > … <<'EOF'` en consola (Write/Edit sobre
  `.github/workflows/*` está bloqueado por hook en este repo).

## 4. §2 — Esquema DB + reconciliación

### 4.1 Tablas nuevas (SQLite, `futbolbase.db`)

```sql
CREATE TABLE players (
  id         INTEGER PRIMARY KEY,
  full_name  TEXT NOT NULL,          -- "APELLIDOS, NOMBRE" tal cual viene
  norm_name  TEXT NOT NULL,          -- normalizado (sin acentos, mayúsculas, espacios colapsados)
  UNIQUE(norm_name)
);

CREATE TABLE appearances (
  id         INTEGER PRIMARY KEY,
  match_id   INTEGER NOT NULL REFERENCES matches(id),
  team_id    INTEGER NOT NULL REFERENCES teams(id),
  player_id  INTEGER NOT NULL REFERENCES players(id),
  dorsal     INTEGER,               -- puede faltar en el acta
  role       TEXT NOT NULL CHECK(role IN ('starter','sub')),
  goals      INTEGER NOT NULL DEFAULT 0,
  yellow     INTEGER NOT NULL DEFAULT 0,
  red        INTEGER NOT NULL DEFAULT 0,
  UNIQUE(match_id, team_id, player_id)
);
CREATE INDEX idx_appearances_match  ON appearances(match_id);
CREATE INDEX idx_appearances_player ON appearances(player_id);
CREATE INDEX idx_appearances_team   ON appearances(team_id);

CREATE TABLE match_events (
  id         INTEGER PRIMARY KEY,
  match_id   INTEGER NOT NULL REFERENCES matches(id),
  team_id    INTEGER NOT NULL REFERENCES teams(id),
  player_id  INTEGER NOT NULL REFERENCES players(id),
  kind       TEXT NOT NULL CHECK(kind IN ('goal','sub_in','sub_out','yellow','red')),
  minute     INTEGER,                -- NULL si el acta no lo da limpio
  goal_type  TEXT CHECK(goal_type IN ('normal','penalty','own')), -- solo para kind='goal'
  pair_id    INTEGER REFERENCES match_events(id) -- enlaza sub_in ↔ sub_out (NULL si no se puede emparejar)
);
CREATE INDEX idx_match_events_match  ON match_events(match_id);
CREATE INDEX idx_match_events_player ON match_events(player_id);
CREATE INDEX idx_match_events_kind   ON match_events(kind);

CREATE TABLE match_staff (
  id         INTEGER PRIMARY KEY,
  match_id   INTEGER NOT NULL REFERENCES matches(id),
  team_id    INTEGER,               -- NULL para árbitro
  kind       TEXT NOT NULL CHECK(kind IN ('coach','referee')),
  name       TEXT NOT NULL,
  UNIQUE(match_id, team_id, kind, name)
);
CREATE INDEX idx_match_staff_match ON match_staff(match_id);

ALTER TABLE matches ADD COLUMN cod_acta INTEGER;   -- NULL hasta reconciliar
CREATE INDEX idx_matches_cod_acta ON matches(cod_acta);
```

Reutiliza `seasons`, `groups`, `teams`, `matches` sin más cambios.

### 4.2 Reconciliación acta ↔ `matches` (la parte fina)

Las grafías de equipo de FIFLP en el acta (`VICTORIA "A"`, `REAL CLUB "A"`) no
coinciden con las de `teams` (scrapeadas de Wayback). Algoritmo del importador
`scripts/import_fiflp_actas.py`, por acta:

1. **Clave fuerte:** localizar la temporada (de la cabecera del acta) y, dentro,
   el `group` por (categoría + nombre/fase). Filtrar `matches` de ese grupo por
   **fecha** del acta (±1 día de tolerancia).
2. **Equipos por nombre normalizado:** `norm_name` de local/visitante del acta vs
   `teams.name` normalizado con la lógica `normalizeTeamName` ya existente en el
   repo (quitar acentos, comillas, sufijos `"A"/"B"`, mayúsculas). Emparejar el
   par (local, visitante).
3. **Desempate por marcador:** si quedan varios candidatos, usar el resultado del
   acta vs `home_score/away_score`.
4. Si hay match único → set `matches.cod_acta = N`, importar appearances/staff
   contra ese `match_id` (DELETE+INSERT de las filas de ese match → idempotente).
5. **Si no reconcilia** (0 candidatos o ambigüedad irresoluble): la acta **no se
   pierde** — se registra en un log de no-reconciliadas
   (`scripts/fiflp_actas_unmatched.json`: cod_acta, temporada, equipos, fecha,
   motivo) y se cuenta en el reporte. (SP-2 decidirá si/ cómo exponer actas
   huérfanas; SP-1 solo garantiza que el dato no se tira.)

El importador imprime un **reporte de cobertura honesto por temporada**: actas en
el raw, reconciliadas, no reconciliadas (con motivo agregado), nº de
players/appearances/staff insertados.

## 5. §3 — `scripts/generate_js.py` + ficheros de datos (lazy)

- Nuevas funciones `generate_lineups_js(conn, season)` y
  `generate_players_js(conn, season)`, **una salida por temporada**, paralelas a
  las `generate_*_js` existentes (misma cabecera "generado automáticamente, no
  editar"):
  - `data-lineups-<season>.js` → `const LINEUPS_<SEASON> = { "<match_key>": {
    home:[{n,dn,r,g,y,rd}], away:[…], coachH, coachA, ref,
    events:[{t:'goal'|'sub'|'yellow'|'red', s:'h'|'a', n, n2?, m, gt?}, …] }, … };`
    donde `match_key` es la **misma clave** que ya usan los consumidores del repo
    (`home|away|hs-as`) para encajar con `MATCH_DETAIL`/badges sin reinventar
    indexado, y `events` es la cronología ordenada por minuto (cambios se emiten
    como un único evento `sub` con `n` saliendo y `n2` entrando cuando están
    emparejados; si no, dos eventos separados con `t:'sub_in'`/`'sub_out'`).
  - `data-players-<season>.js` → `const PLAYERS_<SEASON> = { "<team_id>":
    [{n, ap, st, g, y, rd}], … };` (agregado por jugador y equipo: apariciones
    totales, titularidades, goles, amarillas, rojas — derivado de
    `appearances`+`match_events`).
- Ambos son **`const` léxicos de nivel superior** → en SP-2 se leerán con
  **identificador desnudo guardado** (`typeof X !== 'undefined'`), nunca
  `globalThis`/`window.` (bug 2026-05-18, registrado en memoria). SP-1 solo emite
  el fichero; no añade `<script>` ni loaders (eso es SP-2, que replicará el patrón
  lazy de `data-season-*.js`).
- Llamarlas en `main()` de `generate_js.py` por cada temporada con datos. El
  artefacto inicial se produce **ejecutando el generador** sobre la
  `futbolbase.db` ya poblada por el importador (paso de generación, nunca edición
  manual de `data-*.js` — regla operacional respetada).
- **Ampliar la allow-list de `git add` de `.github/workflows/update.yml`** para
  incluir `data-lineups-*.js` y `data-players-*.js` (lección registrada: la lista
  es explícita; un fichero generado nuevo que no se añada se congela en
  producción). Editado vía `cat > … <<'EOF'` (hook bloquea Write/Edit en
  `.github/workflows/*`).
- El regex genérico de bump `?v=` de `generate_js.py` ya versiona scripts nuevos;
  no se toca esa lógica (y de todas formas el `<script>`/loader es SP-2).

## 6. §4 — Tests, operativa y honestidad de cobertura

### 6.1 Tests

- **pytest** `scripts/tests/test_fiflp_acta_parser.py`: parsea un **fixture HTML
  real de acta** → asierta alineaciones (titulares/suplentes de ambos equipos,
  dorsales, nombres), goles (goleador, tipo, minuto desofuscado), **cambios
  (sub_in/sub_out con minuto)**, **tarjetas amarillas y rojas con minuto**,
  árbitro, entrenador, cabecera. **Invariante de consistencia:** suma de eventos
  `goal` del jugador en el partido == `appearances.goals`; ídem para
  `yellow`/`red` (los counts en `appearances` son derivación de los eventos). El
  fixture se captura en CI durante el **primer run** del scraper (el scraper, con
  `--dump-fixture <CodActa>`, vuelca el HTML del acta a
  `scripts/tests/fixtures/acta_<CodActa>.html`, que se commitea como fixture; no
  se intenta capturar en local porque la IP está bloqueada). **Se capturan al
  menos 2 fixtures** (un acta con cambios y tarjetas para cubrir el parser
  completo, y un acta antigua de 2021-22 para confirmar que el formato histórico
  no rompe el parser). Generar y commitear los fixtures es una de las primeras
  tareas del plan, antes de escribir el resto del parser-test.
- **Node** (test runner existente `scripts/tests/test_js_modules.mjs`): invariante
  de build — cargar un `data-lineups-<season>.js` y su `data-players-<season>.js`;
  cada `match_key` de LINEUPS referencia jugadores válidos; el agregado
  `PLAYERS_<season>[team]` de un jugador == suma de sus `appearances` en
  LINEUPS de esa temporada (goles incluidos). Source-contract: ningún fichero
  fuente nuevo usa `globalThis`/`window.` para estos datos.
- `pytest scripts/tests/` existente y la suite Node existente deben seguir verdes
  (SP-1 no toca sus áreas salvo añadir tests).

### 6.2 Reglas operacionales

- Scraping **solo vía GitHub Actions** (IP local bloqueada por FIFLP).
- Trabajo de implementación en worktree/rama aislado.
- **No `git push` mientras corre `update.yml`** (regla dura del proyecto).
- `data-*.js` no se editan a mano; se **generan** con `generate_js.py`.
- Ficheros bajo `.github/workflows/*`: crear/editar con heredoc `cat > <<'EOF'`
  (Write/Edit bloqueado por hook).
- CI es **Python 3.11**: prohibido backslash en f-strings (regex a variable
  precompilada antes del f-string) — lección directa del discovery.
- SP-1 **no** toca `src/`, `index.html`, `sw.js`, `style.css` → **no** aplica bump
  de `CACHE_NAME`/`?v=` (eso será SP-2).

### 6.3 Cobertura de temporadas — las 5 son requisito

**Las 5 temporadas son in-scope obligatorio** (2021-22, 2022-23, 2023-24,
2024-25, 2025-26). El usuario confirmó que las actas existen en FIFLP para todas,
así que ninguna se da por perdida. Estrategia por temporada:
- 2025-26, 2022-23, 2021-22: camino principal (jornadas pobladas) — confirmado en
  el discovery.
- 2023-24: camino principal probable; si una comp da 0 jornadas, escala a los
  fallbacks del §3.3.
- 2024-25: **spike obligatorio** que prueba las 4 estrategias del §3.3 en orden
  hasta cubrir todas las comps relevantes. No se acepta cerrar la temporada con
  comps no cubiertas si las actas existen; si ninguna de las 4 estrategias
  funcionara para una comp concreta (improbable), se documenta el caso con
  evidencia (qué se intentó, qué respondió FIFLP) y se trata como bug a resolver,
  no como cobertura aceptable.

El reporte de cobertura sigue siendo **honesto** (se publica lo realmente
scrapeado, no lo deseado), pero el **objetivo** es 100% de las actas que FIFLP
sirve para benjamín/prebenjamín en esas 5 temporadas.

## 7. Criterios de aceptación

1. `scripts/fetch_fiflp_actas.py` existe, incremental y reanudable: dos
   `workflow_dispatch` consecutivos de la misma temporada **no** re-scrapean
   actas ya guardadas y juntos avanzan; imprime resumen (vistas / nuevas /
   pendientes / WARN jornadas:0).
2. `.github/workflows/fetch-fiflp-actas.yml` existe (workflow_dispatch, input
   temporada), corre el scraper en CI y commitea solo
   `scripts/fiflp_actas_<season>_raw.json`. (Verificado en CI, no en local.)
3. El parser extrae correctamente, contra los fixtures reales commiteados (≥2,
   uno moderno y uno de 2021-22): alineaciones titulares+suplentes de ambos
   equipos (dorsal+nombre), goles (goleador, tipo, minuto desofuscado o NULL
   honesto), **cambios** (sub_in/sub_out con minuto), **tarjetas** amarillas y
   rojas con minuto, árbitro y entrenador. Invariante: counts en `appearances`
   coinciden con la suma de eventos de cada jugador en el partido. `pytest
   scripts/tests/test_fiflp_acta_parser.py` verde.
4. Esquema aplicado: tablas `players`, `appearances`, `match_events`,
   `match_staff` y columna `matches.cod_acta` creadas con sus índices/
   constraints.
5. `scripts/import_fiflp_actas.py` es idempotente (re-importar el mismo raw no
   duplica filas), reconcilia por (temporada+grupo+fecha+equipos
   normalizados+marcador), setea `matches.cod_acta`, guarda no-reconciliadas en
   `scripts/fiflp_actas_unmatched.json` y emite reporte de cobertura por
   temporada.
6. `generate_js.py` emite `data-lineups-<season>.js` y
   `data-players-<season>.js` por temporada con datos, con `match_key`
   compatible con el indexado existente; `update.yml` los incluye en su
   allow-list de `git add`.
7. Test Node de invariante de build verde: claves de LINEUPS referencian
   jugadores válidos y los agregados de PLAYERS == suma de appearances; suite
   Node y pytest existentes sin regresiones.
8. **Las 5 temporadas cubiertas** (2021-22 … 2025-26). Para cada temporada, el
   reporte de cobertura muestra: actas vistas, scrapeadas, reconciliadas, no
   reconciliadas, y la estrategia de enumeración usada por (comp, grupo). Si
   alguna comp queda sin cubrir tras agotar las 4 estrategias del §3.3, se
   documenta con evidencia de lo intentado (no se cierra como "parcial
   aceptable"; queda como bug abierto a resolver). Ninguna cobertura fingida.
9. SP-1 **no** introduce cambios de UI ni en `src/`/`index.html`/`sw.js`/
   `style.css`; sin dependencias npm nuevas; el scraper solo corre en Actions.
