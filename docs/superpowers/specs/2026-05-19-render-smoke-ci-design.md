# Diseño — Smoke test de render en CI

Fecha: 2026-05-19
Proyecto: `futbol-base` (SPA vanilla JS, GitHub Pages, zero-dep / sin package.json)
Estado: aprobado en brainstorming, pendiente de plan de implementación

## 1. Objetivo

Cazar antes del merge la clase de bug que mordió dos veces: cambios en
`src/`/`index.html` que dejan la app sin renderizar (p. ej. el bug `globalThis`
→ MI EQUIPO en blanco; un `throw` en el grafo de módulos → sección vacía). Los
tests unitarios pasan datos explícitos y nunca ejecutan el render real en
navegador, así que no detectan esta clase. Un smoke test headless que cargue
`index.html` y verifique que la pantalla por defecto pinta contenido real lo
detecta.

## 2. Alcance

**Dentro:**
- `scripts/tests/render-smoke.mjs`: script Node autónomo, **cero dependencias
  npm**, que sirve el repo, lanza Chrome headless, vuelca el DOM y asierta que
  MI EQUIPO renderiza contenido real.
- Nuevo job `render-smoke` en `.github/workflows/tests.yml` (gatea como los
  otros).
- Ampliar el filtro de paths de `tests.yml` para que dispare también con
  cambios de front-end.

**Fuera (YAGNI):**
- Playwright / cualquier dependencia npm / `package.json`.
- Clicar pestañas, set localStorage, verificar Jornadas/click→lazy-fetch
  (requeriría Playwright; descartado por el ethos zero-dep).
- Aserciones de pixel/layout/tema; tests de otras secciones vía navegación.
- `browser-actions/setup-chrome` u otra acción de terceros (los runners
  `ubuntu-latest` ya traen `google-chrome`; añadir la acción solo si algún día
  deja de venir).

## 3. `scripts/tests/render-smoke.mjs`

Script Node ejecutado **directamente** (`node scripts/tests/render-smoke.mjs`),
NO dentro de `node --test` (arranca navegador, es lento y necesita Chrome;
mantener la suite unitaria rápida y sin navegador). Solo módulos `node:*`
(zero-dep). Pasos:

1. **Servidor estático mínimo** en Node puro (`node:http` + `node:fs`,
   ~25 líneas) sirviendo la raíz del repo en un puerto efímero
   (`server.listen(0)` → puerto asignado por el SO). Tipos MIME básicos para
   `.html/.js/.css/.json/.png/.svg`. Sin python, sin deps.
2. **Detección de Chrome headless**, en orden: `process.env.CHROME` →
   `google-chrome` → `google-chrome-stable` → `chromium` →
   `chromium-browser`. Primer binario ejecutable encontrado en PATH.
3. **Si no hay Chrome utilizable** (binario ausente, o el spawn falla / muere
   por sandbox como en el entorno local de desarrollo): imprimir
   `SKIP: no headless browser available (runs in CI)` y `exit 0`. Un fallo de
   entorno NO debe poner el test en rojo. Distinguir explícitamente:
   - browser ausente / spawn falla / exit por señal sin DOM → **SKIP exit 0**
   - browser ejecutó y devolvió DOM pero las aserciones fallan → **FAIL exit 1**
4. **Lanzar**: `<chrome> --headless=new --no-sandbox --disable-gpu
   --disable-dev-shm-usage --virtual-time-budget=8000 --dump-dom
   http://127.0.0.1:<port>/index.html`, capturando stdout (DOM serializado
   tras ejecutar el JS) y stderr. Timeout duro (p. ej. 60 s) → si expira sin
   DOM, tratar como SKIP (entorno), no FAIL.
5. **Aserciones smoke** sobre el DOM volcado (MI EQUIPO es la sección por
   defecto y su render es síncrono desde los `data-*.js` clásicos ya cargados;
   no depende de fetch):
   - Existe `<div id="sec-miequipo"` con clase `active`.
   - Contiene el hero: substring `me-hero` Y el nombre `Las Mesas Hu.`.
   - Calendario no vacío: aparece `me-cal` y al menos un `me-crow` o
     `me-next`.
   - Mini-tabla presente: `me-mini` (o `Su posición`).
   - Goleadores: al menos un `me-scrow` (o el `me-ct` "Goleadores del equipo").
   - **Ausencia** de los marcadores de fallo: NO debe aparecer
     `MI EQUIPO (en construcción)` ni `No hay datos del equipo esta temporada`.
   - Sanidad anti-vacío: el innerHTML de `#sec-miequipo` tiene longitud
     razonable (> ~500 chars) — un render fallido deja la sección vacía o solo
     con el empty-state.
   Cada aserción con mensaje claro de qué faltó (para diagnóstico en CI).
6. **Cleanup**: cerrar el servidor siempre (`finally`). `exit 1` si alguna
   aserción de contenido falla (con el DOM-size y qué marcador faltó);
   `exit 0` si todas pasan o si fue SKIP por entorno.

> Nota: las aserciones se eligen para que el bug `globalThis`
> (`featuredStandingFrom(undefined)` → empty-state "No hay datos del equipo") y
> cualquier excepción en el grafo de módulos (→ `#sec-miequipo` vacío) hagan
> fallar el test. No se asierta Jornadas/otras pestañas: `--dump-dom` solo
> captura la pantalla por defecto y eso ya cubre la clase de regresión.

## 4. CI — `.github/workflows/tests.yml`

### 4.1 Nuevo job

```yaml
  render-smoke:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '22'
      - name: Render smoke (headless Chrome)
        run: node scripts/tests/render-smoke.mjs
```

Sin acción de terceros: `ubuntu-latest` incluye `google-chrome` preinstalado;
el script lo auto-detecta. Gatea el workflow igual que `pytest`/`node-tests`.

### 4.2 Filtro de paths (corrección esencial)

Hoy `on.push.paths` / `on.pull_request.paths` solo incluyen
`scripts/**.py`, `futbolbase.db`, `data-*.js`, `.github/workflows/tests.yml`.
Por eso los cambios del bug `globalThis` y del lazy-load (todos en
`src/`/`index.html`) NUNCA dispararon el workflow. Añadir a AMBAS listas
(`push` y `pull_request`):

```
      - 'src/**'
      - 'index.html'
      - 'style.css'
      - 'sw.js'
      - 'manifest.json'
      - 'scripts/tests/**'
```

Sin esto el smoke test no corre cuando precisamente hace falta. (Mantener las
entradas existentes.)

## 5. Verificación del harness (paso del plan, no producto)

Un guardián que no se ha visto fallar no vale. Durante la implementación,
demostrar que el smoke test se pone **rojo** ante la regresión que debe cazar:

1. Inyectar temporalmente, como primera línea del cuerpo de `renderMiEquipo`
   en `src/miequipo.js`, `throw new Error('smoke-canary');` (canary primario:
   determinista e independiente de los detalles del bug `globalThis`).
   Alternativa equivalente si se quiere reproducir el fallo real: sustituir el
   read guardado por `globalThis.PREBENJAMIN`.
2. Ejecutar `node scripts/tests/render-smoke.mjs` (con Chrome disponible) y
   confirmar `exit 1` con un mensaje de aserción claro.
3. **Revertir** el cambio temporal (NO se commitea). Confirmar que con el
   código sano el script da `exit 0`.

Si en el entorno de desarrollo local no hay Chrome utilizable (sandbox mata el
binario), el script hace SKIP — la verificación roja↔verde se hace en CI: el
plan incluye empujar a una rama y observar el job en rojo con la regresión y en
verde sin ella, antes de integrar (o, si se hace local con un Chrome que
funcione, ahí).

## 6. Reglas operacionales

- Trabajo en worktree/rama aislado; no `git push` mientras corre `update.yml`.
- No se tocan `src/`, datos, `sw.js` ni `index.html` del producto → no aplica
  bump de `CACHE_NAME`/`?v=`.
- Solo se añade `scripts/tests/render-smoke.mjs` y se modifica
  `.github/workflows/tests.yml`.
- `scripts/tests/**` se añade al filtro de paths, así que cambios futuros al
  propio test también disparan el workflow.

## 7. Criterios de aceptación

1. `scripts/tests/render-smoke.mjs` existe, zero-dep (solo `node:*`),
   ejecutable con `node scripts/tests/render-smoke.mjs`.
2. Con Chrome disponible y código sano: `exit 0`, imprime un OK con el tamaño
   de DOM y los marcadores encontrados.
3. Sin Chrome / entorno que lo mata: `exit 0` con `SKIP: ...` — nunca rojo por
   entorno (no rompe el dev loop local).
4. Con la regresión (`globalThis` reintroducido o `throw` en
   `renderMiEquipo`): `exit 1` con mensaje de aserción claro (verificado y
   revertido en el plan).
5. `.github/workflows/tests.yml` tiene el job `render-smoke` que gatea, y los
   filtros de paths (`push` y `pull_request`) incluyen `src/**`, `index.html`,
   `style.css`, `sw.js`, `manifest.json`, `scripts/tests/**` además de los
   existentes.
6. Los jobs `pytest` y `node-tests` siguen verdes; el workflow YAML es válido.
7. Sin dependencias npm nuevas, sin `package.json`, sin acciones de terceros.
