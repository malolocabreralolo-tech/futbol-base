# Diseño — SP-2: Presentación rica de actas (plantilla, cronología completa, perfil de jugador, MI EQUIPO enriquecido)

Fecha: 2026-05-20
Proyecto: `futbol-base` (portal fútbol base Las Palmas, SPA vanilla JS, GitHub Pages)
Estado: aprobado en brainstorming, pendiente de plan de implementación
Predecesor: SP-1 (`2026-05-19-fiflp-actas-pipeline-design.md`) — pipeline de datos que produce `data-lineups-<season>.js` y `data-players-<season>.js`.

## 1. Objetivo

SP-1 dejó el pipeline listo para extraer alineaciones, eventos (goles + cambios
+ tarjetas con minuto) y staff desde las actas FIFLP a la DB y de ahí a dos
ficheros generados por temporada (`data-lineups-<S>.js`, `data-players-<S>.js`).
SP-2 construye **la presentación**: cuatro superficies de UI que consumen esos
ficheros y dejan ver al usuario, "de la manera más agradable posible",
toda la información por equipo y por jornada — plantilla, cronología completa,
ficha individual, vista personal MI EQUIPO. Sin tocar SP-1.

Empty-state honesto y siempre presente: si para una temporada no existe el
`data-lineups-<S>.js` (no se han importado actas aún), la UI lo dice con un
mensaje claro en cada superficie en vez de ocultarse. Cuando SP-1 termine de
recuperar datos (sea ahora o más adelante, una vez FIFLP relaje su anti-scrape),
las superficies se llenan solas sin cambio de código.

## 2. Alcance

**Dentro:**

- **§3 Plantilla por equipo** — sección "Plantilla" dentro de
  `openTeamDetail()` (modal ya existente al clicar un equipo en
  Clasificaciones / Jornadas / MI EQUIPO). Tabla sobria (decisión visual A) con
  fila expandible inline al clic en jugador.
- **§4 Match detail enriquecido** — `openMatchDetail()` muestra ahora
  alineaciones de ambos equipos + cronología unificada (goles, cambios,
  tarjetas) + árbitro. La cronología de goles existente se subsume en la nueva
  cronología unificada cuando hay datos LINEUPS; si no, queda la cronología
  básica actual (MATCH_DETAIL) sin regresión.
- **§5 Perfil individual** — panel expandible inline en la tabla de
  plantilla (§3) y en la card MI EQUIPO (§6), con stats agregados del jugador
  + lista cronológica de sus partidos. Sin modal-sobre-modal.
- **§6 MI EQUIPO enriquecido** — nueva card "Plantilla 2025-26" en
  `#sec-miequipo` con la misma tabla A scoped a Las Mesas Hu., siempre
  visible (no requiere abrir modal).
- **§7 Lazy-load** — funciones `ensureLineups(season)` y `ensurePlayers(season)`
  en `src/state.js`, mismo patrón que `ensureMatchDetail`.
- **§8 Tests + ops** — invariantes Node sobre las nuevas funciones de render;
  ampliación de `render-smoke.mjs` para asertar la nueva card de plantilla;
  documentar empty-state visible.

**Fuera (YAGNI):**

- Cualquier cambio en SP-1 (esquema DB, parser, scraper, importer, generadores
  de datos). SP-2 es solo lectura de los `data-*.js` que SP-1 emite.
- Foto de jugador o cualquier campo no servido por FIFLP en el acta (dorsal,
  nombre, eventos — eso es todo lo que hay).
- Comparador entre jugadores, predicciones, "mejor del partido" — son
  features adicionales fuera del scope mínimo.
- Filtros avanzados en la plantilla (por posición, por demarcación) — FIFLP
  no expone esos datos, no se inventan.
- Modal-sobre-modal para perfil de jugador. El expandible inline cubre la
  necesidad; un "modo perfil" reemplazo-de-modal se valoraría en un SP futuro
  si y solo si el inline se queda corto.
- Editar/anotar manualmente jugadores. El portal es solo consumo, sin escritura
  por usuario.
- Service Worker fuerza-precachea los nuevos `data-lineups-*.js` /
  `data-players-*.js`. Mismo patrón on-demand que `data-matchdetail.js` (lazy
  + stale-while-revalidate ya configurado en `sw.js`); el SW NO los lista en
  `STATIC_ASSETS`.

## 3. §3 — Plantilla por equipo (dentro de `openTeamDetail`)

### 3.1 Punto de entrada

Ya existe: `openTeamDetail(teamName, groupId)` en `src/modals.js`. SP-2 inserta
una nueva sección **"Plantilla"** justo después del header del equipo
(`.modal-team-header` y `.modal-team-pos`) y **antes** de la lista de partidos
existente. No se crea modal nuevo ni se reubica nada.

### 3.2 Datos y resolución

Necesitamos el `team_id` para indexar `PLAYERS_<S>[team_id]`. Tres opciones,
en orden de preferencia:

1. Si el data file `data-players-<S>.js` incluye un mapping inverso
   `TEAMS_<S>` (decisión de SP-1; ver §10) → lookup directo por nombre
   normalizado.
2. Si no, derivar del `data-shields.js` ya existente (`SHIELDS` mapea
   nombre→fichero de escudo, indexado por el mismo nombre normalizado que se
   usa en clasificaciones) — los keys de `PLAYERS_<S>` son `team_id` numéricos,
   no nombres, así que esta opción no es suficiente y se descarta.
3. Si `LINEUPS_<S>` está cargado (vía §4), se puede derivar `team_name →
   team_id` recorriendo sus `match_key`s donde aparece el nombre, pero esto
   requiere que LINEUPS esté disponible y un match_key del equipo contenga
   `home_team_id`/`away_team_id` → cambio en SP-1 para incluir el id.

→ **Resolución limpia**: SP-2 pide a SP-1 que `data-players-<S>.js` incluya
un objeto adicional `TEAMS_<S> = { "<team_norm_name>": <team_id> }` (es trivial
de añadir en `generate_players_js`). SP-2 trata `TEAMS_<S>` como dato canónico.
Si `TEAMS_<S>` no existe (data file emitido por una versión vieja de SP-1) la
sección Plantilla muestra empty-state "datos no disponibles".

Esta dependencia (un cambio menor en SP-1) se ejecuta como **Task 1 del plan
de SP-2**, antes de cualquier UI. Es un cambio de una sola función + un
upgrade del test de invariante.

### 3.3 Render

Tabla A (estilo sobrio decidido en brainstorming):

| Columna | Origen | Notas |
|---|---|---|
| # | `dorsal` (cuando lo dé el acta; NULL → "·") | Chip pequeño grisáceo |
| Jugador | `n` (formato "APELLIDOS, NOMBRE") | Truncado con ellipsis en mobile |
| PJ | `ap` | Apariciones totales |
| TIT | `st` | Titularidades |
| G | `g` | Goles |
| A | `y` | Tarjetas amarillas |
| R | `rd` | Rojas (cuando >0, color rojo) |

Comportamiento:

- Cabeceras clickables para ordenar (default: G desc, luego ap desc, luego nombre).
- **Top scorer** (jugador con más G) destacado con color de marca (sutil).
- Suplentes-puros (st = 0): opacidad 0.6 sobre el chip dorsal y nombre, no toda la fila.
- Click en una fila ⇒ **panel expandible inline** debajo (§5).
- En mobile (< 700px) las columnas TIT y A pueden colapsar tras un toggle "Ver más cols" — decisión de implementación si la tabla se ve apretada en pruebas reales.

### 3.4 Empty-state

Si `PLAYERS_<S>` no existe (no se ha generado el data file para esta
temporada) o `TEAMS_<S>[norm(team_name)]` es `undefined`:

```
Plantilla
   ⓘ No hay datos de plantilla para esta temporada.
   Las plantillas aparecen cuando se importan las actas FIFLP del equipo.
```

Visible y honesto. No se oculta la sección.

## 4. §4 — Match detail enriquecido (dentro de `openMatchDetail`)

### 4.1 Render adicional

`openMatchDetail()` ya hace lazy-load de `MATCH_DETAIL` (la cronología básica
de goles, SP-anterior). SP-2 añade encima:

```
┌──────────────────────────────────────────────────────────┐
│ <home> 3 - 0 <away>                                       │
│ jornada N · DD/MM/YYYY · <venue> · <referee?>             │
├──────────────────────────────────────────────────────────┤
│  ALINEACIONES                                             │
│  ┌─────────────────────────┬─────────────────────────┐    │
│  │ LOCAL                    │ VISITANTE                │   │
│  │  1 GK GUTIERREZ J.       │  1 GK PEREZ M.           │   │
│  │  4    SANTANA A.         │  2    LOPEZ B.           │   │
│  │  …                       │  …                       │   │
│  │  ── Suplentes ──         │  ── Suplentes ──         │   │
│  │  12   YANEZ S.           │  13   ALONSO T.          │   │
│  │  …                       │  …                       │   │
│  │  Entrenador: …           │  Entrenador: …           │   │
│  └─────────────────────────┴─────────────────────────┘    │
├──────────────────────────────────────────────────────────┤
│  CRONOLOGÍA                                               │
│   12'  ⚽  Local  OJEDA D. (1-0)                          │
│   34'  🟨  Visit. LOPEZ B.                                │
│   55'  🔄  Local  ↑ ENTRA RUIZ / ↓ SALE PEREZ             │
│   78'  ⚽  Local  LOZANO J. (penalti, 2-0)                │
│   88'  🟥  Visit. JIMENEZ X.                              │
└──────────────────────────────────────────────────────────┘
```

- **Una sola cronología unificada** que mezcla los goles + cambios +
  tarjetas en orden cronológico. La cronología de goles que ya existía
  (`MATCH_DETAIL[match_key].g`) se subsume aquí — si `LINEUPS_<S>[match_key]`
  contiene `events` para este partido, esos events son la fuente; si no hay
  events de LINEUPS pero sí hay goles de MATCH_DETAIL, se usan estos como
  fallback (lista limitada a goles, sin tarjetas/cambios).
- Alineaciones son una grid 2-columnas en desktop, una columna apilada en mobile.
- Los iconos (⚽ 🟨 🟥 🔄) son **caracteres Unicode** (sin nuevas imágenes ni
  sprites) para mantener zero-dep / sin assets adicionales.
- Minuto: `m` de cada event; si `m === null` se muestra como `–'` y el evento
  va al final.

### 4.2 Lazy y degradación

`openMatchDetail()` actualmente llama `ensureMatchDetail()`. SP-2 lo amplía:

1. Modal se abre síncrono con stats existentes (h2h, rachas) — sin cambios.
2. Fire-and-forget paralelo: `ensureLineups(season)` y `ensureMatchDetail()`.
3. Cuando `ensureLineups` resuelve y `LINEUPS_<S>[match_key]` existe → pinta
   alineaciones + cronología unificada en el placeholder.
4. Si `ensureLineups` falla o el match no tiene lineups → pinta la cronología
   de goles clásica (vía MATCH_DETAIL) como antes. **Cero regresión.**

`season` se deriva del partido (cada partido tiene season en el data clásico:
si `m.season` no está disponible se infiere de la fecha — la lógica ya existe
en otras partes del proyecto). Si no se puede determinar la season → degradación
a la cronología clásica.

## 5. §5 — Perfil individual de jugador (expandible inline)

### 5.1 Trigger

Click en una fila de la tabla de plantilla (§3 dentro de
`openTeamDetail`, §6 dentro de MI EQUIPO). Toggle: si la fila ya está
expandida, se cierra. `Esc` cierra la actual.

### 5.2 Contenido

Panel insertado como `<tr class="player-detail">` justo debajo de la fila
clicada, ocupando todas las columnas:

```
┌─ JUGADOR: OJEDA DELGADO, THIAGO ────────────────────────┐
│  Apariciones 12   ·   Titularidades 10   ·   Goles 14   │
│  Amarillas 2      ·   Rojas 0                            │
│                                                          │
│  Partidos jugados:                                       │
│   J1 · 06/10/2024 · vs Roque Amagro · L 1-2 · ⚽1        │
│   J2 · 13/10/2024 · vs Tamaraceite  · W 3-1 · ⚽2 🟨1    │
│   …                                                      │
│  [Mostrar todos / Mostrar 5] [← Cerrar]                  │
└─────────────────────────────────────────────────────────┘
```

Datos derivados de `LINEUPS_<S>` (escaneo de los match_keys cuyo bando contiene
el nombre del jugador):

- `Apariciones`: count de match_keys con el jugador en `home`/`away`.
- `Titularidades`: count con `r === 'starter'`.
- `Goles`, `Amarillas`, `Rojas`: suma de los respectivos counts en cada appearance del jugador (ya están denormalizados en cada `home[]`/`away[]` entry).
- Lista de partidos: `match_key` parseado a `home|away|hs-as`, casado con datos básicos del partido (`HISTORY` / `getJornadaMatches`) para mostrar fecha y resultado.

Lookup eficiente: el jugador puede aparecer en muchos partidos. SP-2 NO
construye un índice global precomputado al cargar (sería caro y rara vez usado);
el cómputo se hace bajo demanda al primer click sobre el jugador y se cachea
en una `Map` en memoria (key = `team_id|player_name`) para evitar
recomputaciones. El primer toggle puede tardar ~50-200ms en un dataset de
10k+ partidos; aceptable.

### 5.3 Cuando un jugador del expandible está en LINEUPS pero no en PLAYERS

Edge case: el importer puede crear apariciones a partir de events incluso si
el jugador no estaba en lineups (auto-row 'sub' con `dorsal=NULL`). El
agregado `PLAYERS_<S>` ya lo refleja. SP-2 confía en `PLAYERS_<S>` como
fuente; si la fila clicada existe en `PLAYERS_<S>`, su expandible es
consistente con la suma de events de `LINEUPS_<S>` para ese nombre.

## 6. §6 — MI EQUIPO enriquecido (card de plantilla)

### 6.1 Render

Nueva card en `#sec-miequipo` insertada **después** del calendario
(`me-cal`) y **antes** de los goleadores (`me-scrow` / "Goleadores del
equipo"). Estructura idéntica a §3 (misma tabla A, misma expandible inline)
pero:

- Header `"Plantilla 2025-26 · <N> jugadores"`.
- Scoped a Las Mesas Hu. de la temporada activa (data del MI EQUIPO ya
  conoce el `featured-team` por `src/state.js::FEATURED`).
- Siempre visible (sin abrir modal). El expandible inline funciona igual.

### 6.2 Coherencia con la card Goleadores

La card de Goleadores ya existe en MI EQUIPO y muestra top-N. Se mantiene
sin cambios. La diferencia conceptual:
- "Goleadores": top-N visualización rápida.
- "Plantilla": tabla completa con todos los jugadores y stats.

Ambas conviven. Si la nueva sección hace redundante la card "Goleadores",
SE DECIDE en visual review tras implementación, no en spec. Por defecto se
mantiene Goleadores (riesgo bajo, beneficio claro).

### 6.3 Empty-state

Mismo mensaje del §3.4. Visible y siempre presente — el portal personal
debe declarar honestamente cuándo no hay datos.

## 7. §7 — Lazy-load y arquitectura

### 7.1 `ensureLineups(season)` y `ensurePlayers(season)`

En `src/state.js`, paralelo a `ensureMatchDetail` ya existente:

```js
let _lineups = {}, _lineupsPromise = {};
export async function ensureLineups(season) {
  if (_lineups[season] !== undefined) return _lineups[season];
  if (_lineupsPromise[season]) return _lineupsPromise[season];
  _lineupsPromise[season] = (async () => {
    const ver = …  // mismo patrón que ensureMatchDetail
    try {
      const txt = await fetch(`./data-lineups-${season}.js${ver?'?v='+ver:''}`)
                          .then(r => r.text());
      const m = txt.match(/const LINEUPS_[\w]+\s*=\s*(\{[\s\S]*?\});/);
      if (!m) throw new Error('no const LINEUPS_<S> found');
      _lineups[season] = JSON.parse(m[1]);
    } catch {
      _lineups[season] = null;  // honest: failed to load → null
    }
    return _lineups[season];
  })();
  return _lineupsPromise[season];
}

export async function ensurePlayers(season) { /* idéntico, PLAYERS_ + TEAMS_ */ }
```

`ensurePlayers` además expone `TEAMS_<S>` (mapping nombre→id, ver §3.2)
como parte del retorno: `{players, teams}`. O un `getPlayers(season,
team_name)` envoltorio que devuelve `null` si no hay match.

### 7.2 Lectura de constantes léxicas

Las constantes `LINEUPS_<S>` / `PLAYERS_<S>` / `TEAMS_<S>` son **`const`
léxicas de nivel superior** en los data files (igual que MATCH_DETAIL). NUNCA
se leen vía `globalThis`/`window.` — siempre con identificador desnudo
guardado tras la inyección dinámica que hace `ensureLineups`/`ensurePlayers`
(parseando el texto JS con regex como hace ya `ensureMatchDetail`). Esta
es la lección 2026-05-18 (`memory/futbol-base-state.md`).

### 7.3 Service Worker

`sw.js::STATIC_ASSETS` **NO** lista los `data-lineups-*.js` /
`data-players-*.js`. El handler `fetch` ya hace stale-while-revalidate para
`*.js` con `data-` en la ruta — cacheo on-demand tras el primer lazy-fetch.
Bump de `CACHE_NAME` en release final.

## 8. §8 — Tests, operativa, criterios de éxito

### 8.1 Tests

- **Node test runner** (`scripts/tests/test_sp2_modules.mjs`, nuevo): unidades
  de la lógica de SP-2 que se pueden testear puras:
  - Función de agregación del expandible de jugador (escanea LINEUPS sintético
    → suma apariciones/goles/cards).
  - Función de orden de la tabla de plantilla (input PLAYERS sintético + sort
    key → output ordenado correcto).
  - Función de mezcla de cronología (events vs MATCH_DETAIL fallback) →
    output ordenado por minuto.
- **render-smoke.mjs** (existente, gated en CI): asertar que la card
  "Plantilla 2025-26" aparece en MI EQUIPO con su empty-state cuando no hay
  data file, o con el header de tabla cuando sí lo hay.
- **source-contract** en `test_js_modules.mjs` existente: añadir aserción
  "ningún fichero de `src/` usa `globalThis`/`window.` para LINEUPS_*,
  PLAYERS_*, TEAMS_*".
- **pytest** (`scripts/tests/test_data_integrity.py`): añadir invariante
  que valide la presencia del nuevo `TEAMS_<S>` cuando hay `PLAYERS_<S>` en
  el data file (cambio menor en SP-1 generado por SP-2 Task 1).

### 8.2 Operativa

- Worktree aislado.
- No `git push` mientras `update.yml` corre.
- `?v=` bump automático vía `bump_cache_version` de `generate_js.py`.
- `CACHE_NAME` bumpeado en release final.
- `.github/workflows/*` editado vía heredoc (Write/Edit bloqueado por hook —
  lección registrada).
- Sin nuevas dependencias npm / package.json.
- Sin cambios a SP-1 salvo el `TEAMS_<S>` mini-adición en
  `generate_players_js` (Task 1 del plan).

### 8.3 Criterios de éxito

1. Click en un equipo (Clasificaciones / Jornadas / MI EQUIPO) abre el modal
   existente con la nueva sección **Plantilla**: o tabla A poblada, o
   empty-state claro.
2. Click en un partido (con badge ⚽) abre el modal con: alineaciones de
   ambos equipos + cronología unificada (cuando LINEUPS_<S> está cargado);
   o la cronología clásica de goles (cuando no). Nunca regresa a "modal
   roto".
3. MI EQUIPO muestra una nueva card "Plantilla 2025-26" con la tabla A
   scoped a Las Mesas Hu., visible siempre con su empty-state.
4. Click en un jugador (en plantilla o en MI EQUIPO) expande el panel
   inline con sus stats + partidos jugados. `Esc` lo cierra.
5. Lazy-load: no se carga `data-lineups-*.js` ni `data-players-*.js` en
   el arranque (verificado en DevTools Network); se carga al primer evento
   que los necesite (abrir modal de equipo o partido, o entrar a MI EQUIPO).
6. Cero regresión en tests existentes (pytest, node-tests, render-smoke).
7. Cero acceso a `globalThis`/`window.` para los datos de SP-2 (verificado por
   source-contract test).
8. Empty-state visible y honesto cuando los data files no existen — el
   usuario sabe que la información está disponible cuando se importen las
   actas.
9. Tabla, alineaciones y cronología responsive: legibles en 360px de ancho
   sin scroll horizontal incómodo.
10. Implementación zero-dep: stdlib JS solo, sin tocar `package.json`
    (que no existe), sin nuevas imágenes/sprites.

## 9. Mapa de ficheros

**Crear:**
- `src/plantilla.js` — render de tabla de plantilla + expandible inline. Una
  única responsabilidad. Función pública `renderPlantillaInto(container,
  team_name, season, opts)`.
- `src/matchdetail-rich.js` — render de alineaciones + cronología unificada
  para `openMatchDetail`. Función pública
  `renderLineupsAndTimeline(container, match_key, season)`.
- `scripts/tests/test_sp2_modules.mjs` — tests Node.

**Modificar:**
- `src/state.js` — añadir `ensureLineups`, `ensurePlayers`, posibles helpers
  de versión `?v=` (reusar la regex existente de `ensureMatchDetail`).
- `src/modals.js` — `openTeamDetail` invoca `renderPlantillaInto` tras pintar
  el header. `openMatchDetail` invoca `renderLineupsAndTimeline` después
  de abrir el modal.
- `src/miequipo.js` — añadir card Plantilla en el render del MI EQUIPO,
  reutilizando `renderPlantillaInto` con el team de FEATURED.
- `style.css` — estilos `.plant-*`, `.match-lineups`, `.match-timeline`,
  `.player-detail`. Mismo lenguaje visual que el resto.
- `scripts/generate_js.py` — `generate_players_js` añade el sub-objeto
  `TEAMS_<S>` en el data file emitido (Task 1 del plan). Test ampliado.
- `scripts/tests/test_js_modules.mjs` — source-contract: ningún fichero
  `src/` lee LINEUPS_*, PLAYERS_*, TEAMS_* vía globalThis/window.
- `scripts/tests/render-smoke.mjs` — asertar card Plantilla en MI EQUIPO.
- `sw.js` — bump `CACHE_NAME`.
- `index.html` — `?v=` bump automático vía `generate_js.bump_cache_version`.

## 10. Dependencia con SP-1 (Task 1 del plan SP-2)

La única dependencia de SP-2 sobre SP-1 es la adición de `TEAMS_<S>` al
fichero `data-players-<S>.js`. Es un cambio mínimo en
`scripts/generate_js.py::generate_players_js`:

```python
# Antes:  PLAYERS_<S> = { "<team_id>": [...] }
# Después: PLAYERS_<S> = { ... }; const TEAMS_<S> = { "<norm_team_name>": team_id };
```

La normalización de nombres usa la misma `normalize_team_name` de
`scripts/acta_reconciler.py` (importada desde el generador). Test
`test_data_integrity.py::test_generate_players_js_*` ampliado para asertar
la presencia de `TEAMS_<S>` y que cada team aparece con un team_id válido.

Este cambio NO requiere re-scrape — `generate_js.py` se ejecuta sobre la DB
ya existente. La primera ejecución tras el cambio actualiza los data files
in-place. SP-1 sigue siendo idempotente.

## 11. Resumen de no-objetivos

- No se introduce ningún sistema de autenticación, edición o anotación
  manual.
- No se persiste estado del cliente más allá de la `Map` en memoria del
  expandible (sin localStorage para SP-2).
- No se añaden mocks ni datos sintéticos en el código de producción — solo
  en los tests.
- No se cambia la estructura del menú de secciones (sigue MI EQUIPO /
  Clasificaciones / Jornadas / Goleadores / Por Isla / Estadísticas).
- No se rompe el modo offline (el SW sigue sirviendo lo que esté cacheado).
