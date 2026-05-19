# Diseño — Lazy-load de data-matchdetail.js (perf de arranque móvil)

Fecha: 2026-05-19
Proyecto: `futbol-base` (portal fútbol base Las Palmas, SPA vanilla JS, GitHub Pages)
Estado: aprobado en brainstorming, pendiente de plan de implementación

## 1. Objetivo

Quitar `data-matchdetail.js` (**359 KB**, `MATCH_DETAIL`, 1222 partidos con cronología
de goles) de la ruta crítica de carga. Es un `<script>` clásico **bloqueante**
cargado eager en cada visita, pero el grueso (timelines de goles) solo se
necesita al abrir el modal de un partido — algo que la mayoría de visitas a un
portal personal nunca hacen.

Resultado esperado: arranque sin el bloqueo de 359 KB (solo ~30 KB de índice de
claves), badge ⚽ idéntico e instantáneo, cronología vía lazy-fetch (cacheada),
y el Service Worker deja de precachear los 359 KB.

## 2. Alcance

**Dentro:**
- Separar el índice de claves (eager, pequeño) del detalle completo (lazy).
- Loader lazy de `MATCH_DETAIL` replicando el patrón existente de season files.
- Cambiar los 3 consumidores (badge en `render.js` y `miequipo.js`; modal en
  `modals.js`).
- `generate_js.py`: emitir el nuevo fichero de claves (para que `update.yml` lo
  mantenga sincronizado).
- `sw.js`: no precachear el fichero gordo.
- Tests de invariante de build + source-contract.

**Fuera (YAGNI):**
- Trocear `data-matchdetail.js` por competición/temporada (no necesario).
- Cambiar el formato de `MATCH_DETAIL` o de los `data-*.js` restantes.
- Cache-busting de los `import` ES (mejora aparte, no aquí).
- Scrapers / DB / regeneración del resto de `data-*.js`.

## 3. Arquitectura y flujo de datos

### 3.1 Índice de claves (NUEVO, eager)

`data-matchdetail-keys.js`:
```js
const MATCH_DETAIL_KEYS={"Guayarmina|Santidad|8-4":1, "...":1, ...};
```
- Objeto-mapa (lookup O(1) con `MATCH_DETAIL_KEYS[k]`), **solo las claves** de los
  partidos cuyo detalle tiene `g.length > 0` (exactamente la condición que hoy
  evalúan los consumidores del badge).
- Tamaño estimado ~25-30 KB (1222 claves ~22 chars + `:1,`), << 359 KB.
- `<script src="./data-matchdetail-keys.js?v=…">` clásico eager **sustituye** al
  `<script>` de `data-matchdetail.js` en `index.html` (mismo punto, línea ~104).
- Es un `const` léxico de nivel superior → se lee con **identificador desnudo
  guardado** (`typeof MATCH_DETAIL_KEYS !== 'undefined'`), nunca `globalThis`
  (lección del bug 2026-05-18, registrada en memoria).

### 3.2 Detalle completo (lazy)

`data-matchdetail.js` mantiene su contenido EXACTO (`const MATCH_DETAIL={…};` +
cabecera de comentarios autogenerada). Deja de tener `<script>` propio. Se
carga bajo demanda con `ensureMatchDetail()` en `src/state.js` (junto a
`loadSeasonData`), replicando el patrón ya probado de
`modals.js::loadAllHistoricalSeasons`:

- `?v=` heredado del tag del fichero de claves:
  `document.querySelector('script[src*="data-matchdetail-keys.js"]')?.src.match(/v=([^&]+)/)?.[1]`.
- `fetch('./data-matchdetail.js' + (ver?`?v=${ver}`:''))` → `text` →
  `text.match(/const MATCH_DETAIL=(\{[\s\S]*\});/)` → `JSON.parse(m[1])`.
- Cache en variable de módulo `_matchDetail`; single-flight con
  `_matchDetailPromise` (no relanzar fetch si ya hay uno en vuelo).
- Devuelve `{}` ante fallo (degradación: el modal simplemente no muestra
  cronología, como hoy cuando no hay datos).
- Export: `export async function ensureMatchDetail()` → `Promise<object>`.

### 3.3 Service Worker (`sw.js`)

- Quitar `'./data-matchdetail.js'` de `STATIC_ASSETS` (línea 18) — deja de
  precachearse en `install`.
- Añadir `'./data-matchdetail-keys.js'` a `STATIC_ASSETS` (es crítico para el
  badge, debe estar offline).
- El fichero gordo se cachea **on-demand**: el handler `fetch` ya hace
  stale-while-revalidate para `*.js` con `data-` en la ruta (línea 82), así que
  el primer lazy-fetch lo guarda en `CACHE_NAME` y queda offline después.
- Bump `CACHE_NAME` a la versión de release.

## 4. Cambios en consumidores

| Fichero | Antes | Después |
|---|---|---|
| `src/render.js` (~498, `renderMatchCards`) | `typeof MATCH_DETAIL !== 'undefined' && MATCH_DETAIL[detailKey]?.g?.length > 0` | `typeof MATCH_DETAIL_KEYS !== 'undefined' && !!MATCH_DETAIL_KEYS[detailKey]` |
| `src/miequipo.js` (`hasDetail`, ~59) | `const MD = typeof MATCH_DETAIL !== 'undefined' ? MATCH_DETAIL : null; … MD[…]?.g?.length` | `return typeof MATCH_DETAIL_KEYS !== 'undefined' && !!MATCH_DETAIL_KEYS[\`${m.home}|${m.away}|${m.hs}-${m.as}\`];` |
| `src/modals.js` (`openMatchDetail`, ~152) | síncrono `const detail = MATCH_DETAIL[detailKey]` dentro del cuerpo | abrir modal síncrono con `<div id="modalGoalsSection"></div>` placeholder donde iba la sección de goles; tras abrir, `ensureMatchDetail().then(md => { const d = md[detailKey]; if (d?.g?.length) renderGoals(#modalGoalsSection, d, venue); })` |

- El modal sigue mostrando stats/h2h/rachas **síncrono** igual que hoy; solo la
  sección "⚽ Cronología de goles" pasa a rellenarse tras el `ensureMatchDetail()`
  resuelto. Replica EXACTO el patrón fire-and-forget-tras-abrir que ya existe en
  el mismo fichero (`openTeamDetail` → `loadCrossSeasonHistory` rellena
  `#histAllSeasonsBody` tras abrir). El bloque HTML de goles (venue/árbitro +
  `goals-timeline`) se extrae a un helper reutilizable para no duplicar el markup.
- `MATCH_DETAIL` global deja de existir (no hay script eager) → ningún
  consumidor puede seguir usándolo síncrono; los 3 quedan migrados.

## 5. Build (`scripts/generate_js.py`)

- Nueva función `generate_matchdetail_keys_js(conn)` paralela a
  `generate_matchdetail_js(conn)` (mismo origen de datos: las claves con
  `g` no vacío). Cabecera de "generado, no editar" igual que los demás.
- Llamarla en `main()` justo después de escribir `data-matchdetail.js`
  (`write_file("data-matchdetail-keys.js", generate_matchdetail_keys_js(conn))`),
  para que `update.yml` regenere el índice en cada auto-update y nunca diverja
  del detalle.
- El regex de bump de `?v=` de generate_js.py es genérico (`\?v=\d{8}[a-z]?`),
  así que el nuevo `<script>` se versiona automáticamente; no hay que tocar esa
  lógica.
- El artefacto inicial `data-matchdetail-keys.js` se produce **ejecutando esa
  función del generador** sobre la `futbolbase.db` ya versionada (paso de
  generación, no edición manual — regla operacional respetada). No se regenera
  el resto de `data-*.js` ni se relanzan scrapers.

## 6. Tests

`scripts/tests/test_js_modules.mjs` (Node test runner; añadir
`MATCH_DETAIL`/`MATCH_DETAIL_KEYS` al array `probes` de `loadDataFile`):

1. **Invariante de build:** cargar `data-matchdetail.js` y
   `data-matchdetail-keys.js`; el conjunto de claves de `MATCH_DETAIL_KEYS` debe
   ser EXACTAMENTE `{k for k,v in MATCH_DETAIL if v.g && v.g.length>0}` — mismo
   recuento y subconjunto exacto (sin claves de más ni de menos). Esto garantiza
   que el badge nunca miente respecto a lo que el modal podrá mostrar.
2. **Source-contract:** `src/render.js` y `src/miequipo.js` referencian
   `MATCH_DETAIL_KEYS` y NO `MATCH_DETAIL` (el badge no debe depender del fichero
   gordo); `src/modals.js` usa `ensureMatchDetail` y no lee `MATCH_DETAIL` como
   global síncrono; ningún fichero usa `globalThis`/`window.` para estos datos.
3. La suite existente (incl. el contrato anti-globalThis y los tests de
   helpers) debe seguir verde sin cambios.

`pytest scripts/tests/` debe permanecer 27 passed / 5 skipped (no se tocan sus
áreas).

## 7. Reglas operacionales

- Trabajo de implementación en worktree/rama aislado; no push directo a mano.
- Bump obligatorio de `CACHE_NAME` (`sw.js`) y `?v=` (`index.html`) en el release.
- No `git push` mientras corre `update.yml`.
- `data-*.js` no se editan a mano; `data-matchdetail-keys.js` se **genera**.
- Verificación visual real (navegador) antes de dar por bueno: badge ⚽ aparece
  igual en Jornadas y en el calendario de MI EQUIPO; abrir un partido con badge
  carga la cronología tras un instante y queda cacheada; un partido sin badge no
  intenta mostrarla. Medir que `data-matchdetail.js` ya NO está en la cascada
  inicial (DevTools Network) y SÍ se pide al abrir el primer modal.

## 8. Criterios de aceptación

1. `index.html` carga `data-matchdetail-keys.js` (eager, pequeño) y NO
   `data-matchdetail.js`.
2. Badge ⚽ idéntico al actual e instantáneo en Jornadas y MI EQUIPO, basado en
   `MATCH_DETAIL_KEYS`.
3. Abrir un partido con badge: el modal se abre al instante; la sección de
   cronología aparece tras el lazy-fetch; segundas aperturas son inmediatas
   (cacheado, sin re-fetch — single-flight/caché).
4. Partido sin badge: no se intenta cargar ni mostrar cronología.
5. `sw.js` no incluye `data-matchdetail.js` en `STATIC_ASSETS`; sí incluye
   `data-matchdetail-keys.js`; `CACHE_NAME` bumpeado.
6. `generate_js.py` emite `data-matchdetail-keys.js` consistente con
   `data-matchdetail.js`; index `?v=` se versiona solo.
7. Tests: invariante de build + source-contract verdes; suite Node y pytest sin
   regresiones.
8. DevTools Network confirma: arranque sin la petición de los 359 KB; esa
   petición ocurre solo al abrir el primer modal de partido.
