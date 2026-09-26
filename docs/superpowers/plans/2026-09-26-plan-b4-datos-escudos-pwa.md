# Plan B4: datos, escudos, PWA y despliegue del rediseño «Acta»

> **Para agentes:** SUB-SKILL OBLIGATORIA: usar superpowers:subagent-driven-development (recomendado) o superpowers:executing-plans para ejecutar este plan tarea a tarea. Los pasos usan casillas (`- [ ]`).

**Objetivo:** la fase B4 de la spec (§12.5): menos peso muerto en cada carga, la PWA con sus iconos y su manifiesto, escudos en miniatura, un despliegue con guion propio y el presupuesto de §5.4 medido y documentado. Se publica al terminar, como B2 y B3 (Tarea 7).

**Arquitectura:** la de B2 y B3, sin tocar la app:
- **B4 no toca `src/*.js` ni `acta.css`**: `CODIGO` se queda en `be0acbf3`, y el paso de B3 a B4 en los móviles es un despliegue de datos y de estructura, sin código nuevo que limpiar (la limpieza del arranque no se ejecuta: el marcador ya es `be0acbf3`).
- Lo que cambia: el generador (`scripts/generate_js.py`) y sus salidas, `index.html`, `sw.js`, `manifest.json`, `icons.svg` (se va), `escudos/s/` (nuevo), guiones nuevos (`scripts/build_crests.py`, `scripts/publicar.py`, `scripts/tests/presupuesto.mjs`, `scripts/tests/pages-server.mjs`), `scripts/trim_shields.py` (hace las miniaturas de lo que trae), los workflows (`tests.yml` y `update.yml` en Node 24, y la imagen de todos fijada), dos documentos (`docs/rediseno-rebase.md` y `docs/temporada-nueva.md`) y las pruebas.

**Stack:** el de B3: JavaScript ES2022 sin compilación, `node --test` (Node 22), Playwright 1.58 y el Chrome del sistema, Python 3 (pytest) y Pillow 12 solo en local (para `build_crests.py`; el CI no lo instala).

**Spec:** `docs/superpowers/specs/2026-09-23-rediseno-acta-design.md`: §4.10, §4.11 (la fila de `data-players-*.js`), §5.1, §5.4, §5.5, §7, §10, §11 y §12.5. El plan B3 (`docs/superpowers/plans/2026-09-25-plan-b3-pantallas-secundarias.md`), su sección «Para B4 y siguientes» y su Tarea 12, paso 10 (publicar), son requisito de este plan. El inventario del código de `33e4cff` (archivo:línea, tamaños y las pruebas que nombran cada cosa), al que remiten los contextos de las tareas, está en `$S/inventario-b4.md`.

**Cómo se verificó:** el plan se ejecutó entero, tal como está escrito, en un clon desechable del repositorio con la rama `rediseno-acta` en `33e4cff` (B3 publicada, versión `20260925b`). Un guion extrajo cada bloque del propio plan, escribió cada «Crear» y «Añadir al final de», ejecutó cada orden (con la raíz del clon y un `S` propio) y comparó su salida con su «Esperado».
- Cada tarea terminó en su commit, con pytest, node y los tres smoke en verde, tres pasadas en cada tarea (los recuentos, en la tabla de las restricciones). Al final, los smoke tres veces más (21 PASS en cada pasada), `presupuesto.mjs` en local con `PRESUPUESTO: OK` y el ensayo de la publicación (Tarea 7, paso 6): `publicar-b4.mjs antes` sobre B3 y `despues` y `capturas` sobre B4, en verde. Las salidas son las reales del 26/09/2026; las que dependen de la máquina o del día lo dicen.
- De la Tarea 7 solo se ejecutaron los pasos 2 a 6, en el clon: el guion rechaza todo bloque con `git push`, `gh run`, `gh workflow`, `curl` o la web publicada. El merge del paso 2 se ensayó además con un `main` simulado en el que el bot había regenerado tres retirados y subido sus marcas: los conflictos esperados se resolvieron en el propio bloque y las suites siguieron en verde.
- Antes, cada borrador se había verificado por separado: las Tareas 1 a 3 sobre `33e4cff`, y las 4 a 6 sobre un sustituto de las Tareas 1 y 3. El ensamblado quitó el sustituto y fijó los recuentos y las cifras con las tareas reales (decisión 20).
- Después, una revisión adversarial (listo con arreglos: 0 altas, 1 media, 6 bajas; su informe y sus simulaciones, en `$S/review-report.md` y `$S/rev/`) ejecutó el plan en otro clon, las suites con el entorno del bot y el paso de B3 a B4 sin sondas. Sus arreglos son las decisiones 51 a 57, y la verificación de punta a punta se repitió con ellos en un clon nuevo: el ejecutor rechaza ya cualquier orden `gh` (el paso 5 de la Tarea 5 lee la API de GitHub y no se ejecutó en ella). Además: las suites con el entorno del bot (Python 3.11 con solo pytest y pyyaml, sin Pillow, node sin `node_modules`, `LANG=C` y `TZ=UTC`), con un escudo nuevo sin miniatura y con un original cambiado: dentro de los tres bots, `489 passed, 20 skipped` y node 739, en verde; con `GITHUB_WORKFLOW=Tests`, 3 y 2 fallos. Y `trim_shields.py` con una descarga simulada, sin red; la fusión del paso 2 de la Tarea 7 con retirados y marcas nuevas en `main`, y de vuelta del paso 8, con las suites en verde después (504 y 739).

## Restricciones globales

Las de B3, sin cambios:
- rama `rediseno-acta`; cada tarea termina en un commit con todo en verde: pytest, `node --test scripts/tests/test_*.mjs` y los tres smoke (`render-smoke`, `interaction-smoke`, `pwa-smoke`);
- nunca se empuja con un workflow en marcha (`gh run list`); el CI de la rama se lanza con `gh workflow run tests.yml --ref rediseno-acta` (el PR borrador #2 quedó cerrado al publicar B2);
- compatibilidad con el bot: las suites de Node y Python bloquean su commit, así que **ninguna prueba lee los `data-*.js` ni `config.js` vivos** ni depende de la fecha o del idioma; las marcas de `index.html` y `sw.js` que toca el bot (`?v=`, «Última actualización», `CACHE_NAME` en la línea 1, los literales `STATIC_ASSETS` y `SEASON_FILES`) siguen su contrato (`test_index_bot_contract.py`);
- `src/` plano, sin ciclos ni `import()` dinámico; globales de datos con `typeof`, nunca `globalThis` ni `window`;
- `CODIGO` al día: si una tarea toca `src/*.js` o `acta.css`, ejecuta `python3 scripts/codigo.py` (o `test_rediseno_index.mjs` sale en rojo). Ninguna tarea de B4 los toca;
- commits en español, con `git add` de rutas explícitas (y `git rm` de lo que se borra), nunca `HANDOFF.md` ni `docs/mejoras-2026-09.md`, y las dos líneas finales (`Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>` y `Claude-Session: https://claude.ai/code/session_01Sg56KK3oZgo8Ye7Snj6wG9`);
- en pruebas de navegador, `waitForAsync` o localizadores, nunca esperas fijas ni `waitForFunction` con predicado asíncrono; **ninguna espera de activación de un SW con una página abierta durante la espera** (plan B3, «Lo que B3 deja avisado»);
- los guiones de edición localizan texto exacto de la tarea anterior y, si no lo encuentran las veces que esperan, se paran con un `AssertionError` sin escribir el fichero.

Además, en B4:
- **Fuera del repo:** vistas previas, capturas, mediciones y guiones de comprobación van a `S`, que sale de esta línea, que se ejecuta una vez antes de la Tarea 1 en la shell de los bloques y es la única que cambia otra sesión:

  ```bash
  export S=/tmp/claude-1000/-home-manolo/db6fd8e0-f1e7-4e94-b6cd-ef7dd5bf6ae9/scratchpad/planB4
  ```

  Los bloques la leen con `: "${S:?falta S: la línea export S= de la cabecera}"`.
- **Salidas que dependen del día:** el DOM de la primera pasada de `render-smoke` (la portada con los datos reales y el reloj de verdad; el paso 0 de la Tarea 1 lo mide en la base y cada «Esperado» lo da relativo a ella), la versión de `publicar.py` (la fecha UTC y lo que haya publicado el bot), el número de `data-*.js` del ensayo del bot, los tiempos de `presupuesto.mjs` (unas decenas de ms entre pasadas; los KB y el CLS no se mueven) y los bytes de las miniaturas (Pillow 12.1.1 con zlib 1.3; las pruebas no miran bytes).
- **Los smoke:** las Tareas 1 a 3 los pasan con el filtro `grep -v '^PWA fixture HTTP 404 /escudos/s/'` de B3 (todavía no hay miniaturas); desde la Tarea 4, sin filtro y con `otras líneas: 0`.
- **Los bloques largos** (decisión 54): la herramienta Bash corta a los 2 minutos si no se le da otro límite, y a los 10 como mucho. Los bloques que pasan de 2 minutos (el de los smoke de cada tarea, tres pasadas, unos 3,5 minutos; las suites y los smoke de la Tarea 7) se lanzan con su `timeout` a 600000 ms, y los que pueden pasar de 10 (`gh run watch`, la espera de la CDN y la ejecución del bot, en la Tarea 7), en segundo plano (`run_in_background`) o con Monitor.
- **Recuentos** (pytest / node / smoke por pasada), los de la verificación, con las tareas encadenadas:

  | | pytest | node | smoke |
  |---|---|---|---|
  | `33e4cff` (partida) | `478 passed, 5 skipped` | 729 | 21 PASS (y 15 líneas 404 de `escudos/s/`) |
  | Tarea 1 | `470 passed, 5 skipped` (−9 +1) | 729 (−1 +1) | 21 PASS |
  | Tarea 2 | `488 passed, 5 skipped` (+18) | 729 | 21 PASS |
  | Tarea 3 | `488 passed, 5 skipped` | 734 (+5) | 21 PASS |
  | Tarea 4 | `500 passed, 5 skipped` (+12) | 734 | 21 PASS, sin otras líneas |
  | Tarea 5 | `504 passed, 5 skipped` (+4) | 735 (+1) | 21 PASS, sin otras líneas |
  | Tarea 6 | `504 passed, 5 skipped` | 739 (+4) | 21 PASS, sin otras líneas |

  En el CI, sin Pillow, las dos pruebas de Pillow de `test_build_crests.py` se saltan (dos más en `skipped` desde la Tarea 4); dentro del bot, además, las ocho de `LIVE` (decisión 51).

## Punto de partida medido (26/09/2026, antes de B4)

Medición: Chrome del sistema (150) con Playwright, 390×844 a DPR 3, en frío (sin caché ni SW), red «4G lenta» (150 ms de latencia, 1.638,4 kbit/s de bajada y 750 kbit/s de subida) y CPU ×4 por CDP, que son los valores del perfil móvil de Lighthouse; mediana de 3. «Portada pintada» es el momento en que `#contenido section[data-screen="home"]` entra en el documento (el esqueleto estático no cuenta). Guiones de prueba en `$S/medir/` (`medir.mjs`, `cls-a.mjs`, `caliente.mjs`, `pages.mjs`: servidor local que imita a GitHub Pages con gzip y `max-age=600`); la Tarea 6 los sustituye por `presupuesto.mjs` y `pages-server.mjs`.
- **Web publicada** (B3, datos del 23/09, estado D): portada pintada 2.758 ms, LCP 2.832 ms, FCP 860 ms, CLS 0, 373 KB transferidos.
- **Local, mismo árbol:** portada 2.837 ms, 356 KB. Sin `data-matchdetail-keys.js` ni `data-stats.js`: 2.707 ms, 332 KB. Con `modulepreload` de los 26 módulos: 2.529 ms (FCP 656 → 784 ms). Con `preload` de la fuente: sin mejora y FCP 892 ms. Con `defer`: sin cambio.
- **Reparto:** red lenta con CPU ×1, 2.496 ms; sin límite de red con CPU ×4, 877 ms; sin límites, 296 ms. En frío manda la red.
- **La app instalada** (SW, segunda apertura, red lenta y CPU ×4): portada 979-995 ms, FCP 172-196 ms.
- **CLS en el estado A** (mundo A de `fixture-site.mjs`, reloj fijado, en frío): 0 a 390 px y 0,0001 a 1440 px (la barra).
- **Imágenes de Tabla** (PG2, 15 escudos originales): 125.568 bytes. En la web, además, 15 404 de `escudos/s/` de 9.379 bytes cada uno (la página de error de GitHub Pages): 263,1 KB de «imágenes».
- **Tamaños con gzip en la web** (bytes): `data-history.js` 37.348, `data-goleadores.js` 44.680, `data-benjamin.js` 10.403, `data-stats.js` 17.146, `data-matchdetail-keys.js` 8.217, `data-maspalomas-cup-2026.js` 5.669, `data-shields.js` 2.981, `data-prebenjamin.js` 2.639, `data-lineups-2025-2026.js` 11.327, `acta.css` 12.415, `src/*.js` (26) 138.284 en total.

El presupuesto de §5.4 (portada < 3 s, CLS < 0,1 e imágenes de Tabla < 300 KB) **ya se cumple**; B4 lo deja medido con un guion propio (decisión 11) y quita el peso muerto. Con B4 (Tarea 6, en local, dos pasadas): portada pintada 2.705-2.707 ms y LCP 2.784 ms (medianas de 3), FCP 604-608 ms y 307 KB; CLS 0 a 390 px y 0,0001 a 1440 px; imágenes de Tabla 48,0 KB en 15 (antes de las miniaturas, en la Tarea 3: 125,9 KB en 30, con los 15 404 de `escudos/s/`).

## Decisiones que interpretan la spec

Cada una, con la tarea que la prueba y su coste si fuera errónea. Las del esqueleto (1 a 13) mandan sobre las de los borradores; las del controlador posteriores al esqueleto (14 a 20) mandan sobre todas las anteriores, y donde cambian una lo dicen; las de los borradores (21 a 42) interpretan dentro de ellas, y las del ensamblado (43 a 50) resuelven lo que quedaba y la Tarea 7. Las de la revisión adversarial (51 a 57), con los arreglos que decidió el controlador, mandan sobre todas; donde cambian una, esa lo dice.

### Del esqueleto

**Datos**
1. **Se retiran `data-matchdetail-keys.js`, `data-stats.js` y los cinco `data-players-<S>.js`** (Tarea 1). Nadie los lee en `src/` (inventario, §D): el primero, desde el corte de B2; el segundo, desde la decisión 26 de B3 (Récords sale del modelo); los terceros nunca se cargaron (§4.11: «su generación se retira en B4»).
   - `generate_js.py` deja de generarlos: fuera `generate_matchdetail_keys_js`, `generate_stats_js`, `generate_players_js` y sus llamadas, y `_season_goal_records` y `_MIN_GAMES_FOR_SEASON_STATS`, que solo usaba el segundo (con sus pruebas de pytest).
   - Se borran del repo; salen de `index.html` (dos `<script>`: quedan 7 inmediatos y **9 marcas `?v=`**) y de `STATIC_ASSETS`. Una prueba fija que no vuelven: ni en `index.html`, ni en `sw.js`, ni en el repo, ni entre las salidas del generador.
   - `data-stats.js` contradice el texto de §5.4 y §5.5 (perezoso para Récords y en `SEASON_FILES`): lo supera la decisión 26 de B3, que ya se publicó.
   - Coste si es errónea: quien leyera esos ficheros fuera de la app (en el repo, nadie) los pierde; se recuperan del historial.
2. **Los torneos (`data-maspalomas-cup-2026.js`) siguen inmediatos**, con `defer` como los demás. Se aparta de §5.4 (los daba perezosos): pesan 5.669 bytes con gzip (el 1,7 % de la carga en frío); la portada en D, el estado de hoy y de cada verano, los lee al arrancar (el bloque «Verano»), así que perezosos le añadirían una espera o un salto; y hacerlos perezosos toca la resolución del router de toda ruta MC\* y siete pantallas publicadas (M5 de B2). Coste si es errónea: 5,7 KB por carga en frío en temporada; queda para B5, con medición.
3. **Datos congelados de las pruebas** (Tarea 1). `fixture-site.mjs` deja de servir los ficheros retirados (el mundo es la app nueva). En `pwa-smoke`, el mundo de la **app anterior** sigue sirviendo lo que la app anterior pida (su `index.html` congelado los nombra); la app nueva no los pide, y la prueba lo comprueba (decisión 24). Coste si es errónea: ninguno en la app; es la forma de seguir probando el paso de la app anterior sin servirle a la nueva lo que no pide.

**Carga**
4. **`defer` en los 7 inmediatos** (§5.4; Tarea 3). Medido sin SW: sin ganancia, porque los `<script>` ya van al final del `<body>`, detrás del esqueleto; se hace porque la spec lo pide y no rompe el contrato del bot (§10: «un `defer` no rompe ninguna regex»). El orden se mantiene: los `defer` y el módulo en línea se ejecutan en orden de documento. Coste si es errónea: con el SW permitido, `defer` solo adelantaba el registro del SW y su precache competía con la primera visita (de 86 a 125 ms más); lo resuelve la decisión 15.
5. **El arranque en una función asíncrona** (plan B3, «Para B4»; Tarea 3): el módulo en línea pasa de un `await` de nivel superior a `(async () => { … })()`, con el mismo orden (el marcador, la limpieza por `CODIGO`, el `import` de `app.js`, `start` y el marcador) y el mismo `try`/`catch`. Las pruebas del arranque (`test_rediseno_index.mjs`) se ajustan. Coste si es errónea: ninguno de conducta; un diff grande de `index.html` (decisión 37).
6. **Sin `modulepreload` ni `preload` de la fuente.** Medido: `modulepreload` adelanta la portada en frío 180 ms, pero mete los módulos en el mapa de módulos antes de la limpieza por `CODIGO`: tras un despliegue de código con el SW viejo, la app arrancaría con módulos viejos y `app.js` nuevo (la apertura a medias que B3 arregló, A1). El `preload` de la fuente retrasa el FCP unos 100 ms sin adelantar la portada. Coste si es errónea: 180 ms en la primera visita de un navegador nuevo; la app instalada no lo nota.

**PWA**
7. **Iconos y manifiesto** (§5.5; Tarea 3).
   - `index.html`: `apple-touch-icon` → `./icons/icon-180.png`; `icon` → `./icons/icon-192.png` (`type="image/png"`), en lugar de los SVG en línea del emoji.
   - `manifest.json`: `name` «Fútbol Base Las Palmas»; `short_name` «Fútbol Base LP» (el `apple-mobile-web-app-title`); `description`, la del `<meta name="description">`; `id` `/futbol-base/index.html` (decisión 14: el esqueleto decía `./index.html`, que sería otra app); `start_url` `./index.html#/`; `display` `standalone`; `orientation` `portrait`; `background_color` y `theme_color` `#FFFFFF` (`--paper` del tema claro); `icons`: `icon-192.png` y `icon-512.png` (`purpose` `any`) y `icon-maskable-512.png` (`maskable`), con `sizes` y `type`.
   - `icons.svg` se borra (nadie lo usa: inventario §C).
   - Prueba: el manifiesto (cada campo), que sus iconos existen con esos píxeles (cabecera PNG, sin Pillow), la identidad y los `<link>` de `index.html` (`test_rediseno_pwa.mjs`).
   - Coste si es errónea: Android puede tardar en cambiar el icono y el nombre de la app ya instalada (la actualización del WebAPK), y puede preguntar si los actualiza: el mensaje de la publicación avisa a la familia de que acepte (decisión 57); en iOS, el icono de la pantalla de inicio se queda como se instaló.
8. **`sw.js`: `activate` solo borra las cachés `futbolbase-v*`** que no son `CACHE_NAME` (Tarea 5). El origen (`malolocabreralolo-tech.github.io`) lo comparte otro proyecto de la cuenta: hoy borra cualquier caché del origen (plan B3, «Lo que B3 deja avisado»). La limpieza por `CODIGO` ya se limita a `futbolbase-v*`. Prueba en `test_sw_fixes.mjs`, con el `activate` de verdad. Coste: ninguno.

**Escudos**
9. **Miniaturas** (§5.4; Tarea 4). `scripts/build_crests.py` (Pillow; se ejecuta a mano al añadir o cambiar un escudo, como `build_icons.py`):
   - cada `escudos/<nombre>.<png|jpg>` da `escudos/s/<nombre>.png`, con el lado mayor ≤ 96 px y nunca mayor que el original (no se amplía), `LANCZOS` y PNG optimizado, con la reducción de color que la tarea decidió midiendo (decisión 17);
   - `--check` sale con 1 si falta, sobra o se quedó atrás alguna, sin escribir y sin Pillow;
   - las 176 miniaturas entran en el repo;
   - prueba de pytest **sin Pillow** (salvo dos, que se saltan en el CI): cada original tiene su miniatura y al revés, todas son PNG del tamaño de la receta, ningún par de originales comparte nombre sin extensión, y están al día. El bot nunca añade escudos (`data-shields.js` se mantiene a mano), pero ejecuta pytest antes de comitear los datos: las pruebas que leen `escudos/` se saltan dentro de un bot, y un escudo sin su miniatura pone `Tests` en rojo, nunca al bot (decisión 51; el esqueleto decía que la prueba no podía pararlo, y sí podía);
   - `sw.js` no cambia: `/escudos/` ya es *cache-first* y las miniaturas se guardan según se usan (§5.5), sin precache;
   - desde esta tarea, los smoke van sin el filtro `PWA fixture HTTP 404 /escudos/s/`.
   - Coste: 586 KB de PNG en el repo y en la web.

**Despliegue**
10. **`touch_footer` y `scripts/publicar.py`** (§5.5; Tarea 2).
    - `bump_cache_version(root=None, touch_footer=True, version=None)`: con `touch_footer=False` no toca «Última actualización»; con `version`, usa esa cadena en vez de `_next_version`. `_next_version(content, today=None)` acepta el día. El bot sigue llamándola sin argumentos (el pie se mueve, como hoy).
    - `scripts/publicar.py [--root R]`: versión = fecha **UTC**, estrictamente mayor que la vigente (si no, la letra siguiente de la vigente; se para en `z`), sube todas las `?v=` y `CACHE_NAME` sin tocar el pie (`touch_footer=False`) y recalcula `CODIGO` (`codigo.main`, y devuelve lo que devuelve). Sustituye al Python en línea del paso 10 de B3.
    - Pruebas de pytest con un árbol sintético: los dos caminos del pie, la versión estrictamente mayor (vigente de hoy, de un día posterior y con `z`), y que el bot (`bump_if_changed`) sigue como hoy.
    - `docs/rediseno-rebase.md`: fuera «no se fusiona hasta B5» (cada fase se publica al terminarla) y el procedimiento de publicar con `publicar.py`.
    - Coste: ninguno.
11. **El presupuesto, medido con un guion del repo** (Tarea 6). `scripts/tests/presupuesto.mjs` (no es `test_*.mjs`: ni `node --test` ni el CI lo ejecutan, porque mide tiempos) y `scripts/tests/pages-server.mjs` (servidor estático que imita a GitHub Pages: gzip de texto y `Cache-Control: max-age=600`):
    - **portada en frío**: con los datos del árbol, el perfil del punto de partida (4G lenta y CPU ×4, 390×844 a DPR 3, sin caché ni SW), la mediana de 3 de «portada pintada» y del LCP; umbral < 3.000 ms;
    - **CLS**: mundo A de `fixture-site.mjs` con el reloj fijado, en frío, a 390 y 1440 px, el máximo de 3; umbral < 0,1;
    - **imágenes de Tabla**: `#/tabla?s=2025-2026&g=PG2` con los datos del árbol, la suma de los bytes transferidos de las imágenes; umbral < 300 KB;
    - `--web <url>` mide la portada y Tabla contra una web publicada (el CLS sigue en local, porque necesita el mundo A);
    - sale con 1 si un umbral no se cumple, e imprime las tres cifras con su umbral.
    - Se ejecuta en la tarea que lo crea, con las miniaturas ya hechas (las cifras de antes son las del punto de partida y las de la Tarea 3, que la tarea da), y en la publicación, en local y contra la web.
    - Coste: un guion más que mantener; ningún tiempo en el CI.

**CI**
12. **`tests.yml`** (Tarea 5): el filtro de rutas de `push` y `pull_request` añade `fonts/**`, `icons/**` y `escudos/**` (§5.5). Las acciones de `tests.yml` pasan a la versión mayor más baja que corre en Node 24 (hoy avisan de Node 20 obsoleto), comprobada en las notas de versión de cada una: `actions/checkout@v5`, `actions/setup-python@v6` y `actions/setup-node@v5`. El esqueleto dejaba `update.yml` sin tocar porque «el `git push` del bot solo se ejerce cuando hay datos nuevos»; era falso (empuja `data-health.json` de 1 a 4 veces al día), y la decisión 55 lo cambia: `update.yml` pasa a las mismas acciones, y todos los workflows fijan su imagen. Coste: los `fetch-fiflp*.yml` y los demás siguen avisando de Node 20 hasta B5.

**Publicación**
13. **Publicar B4** (Tarea 7; la ejecuta el controlador con el visto bueno ya dado: «publicando cada fase al terminarla»), como el paso 10 de B3 con estos cambios: la versión con `python3 scripts/publicar.py`; el CI de la rama con `workflow_dispatch`, localizando la ejecución por su `headSha`; la comprobación en la web: la versión y `CODIGO` (sin cambios, `be0acbf3`), el manifiesto nuevo, los iconos y las miniaturas servidos (200), `presupuesto.mjs --web` en verde, y el paso de B3 a B4 con un perfil que tenía B3 (aperturas en procesos nuevos, cada una entera; B4 no cambia módulos, así que ninguna apertura puede quedar a medias por código). Capturas de Tabla y de la portada para el usuario. Coste si es errónea: una publicación mala se arregla hacia delante, con otra publicación, nunca volviendo a publicar un `index.html` anterior (plan B3, «Volver atrás tras publicar»).

### Del controlador, posteriores al esqueleto (mandan sobre las anteriores)

14. **`id` del manifiesto: `/futbol-base/index.html`** (cambia la 7; Tarea 3). La spec del manifiesto resuelve `id` contra el **origen** de `start_url`, no contra la URL del manifiesto: `./index.html` daría otra app (medido con `Page.getAppId` de Chrome 150: `<origen>/index.html`). `/futbol-base/index.html` es la identidad de hoy (sin `id`, `start_url` sin su fragmento) y el `recommendedId` de Chrome, y la fija aunque `start_url` cambie. Prueba: `test_rediseno_pwa.mjs` (la identidad calculada como la spec) y el paso 5 de la Tarea 3 (`Page.getAppId` con el manifiesto de antes y el nuevo). Coste: nombra la ruta de Pages; con un dominio propio sería otra app de todos modos (otro origen).
15. **El SW se registra en el evento `load`** (Tarea 3). Con `defer`, el `<script>` clásico que lo registra corre durante el análisis y el precache (unos 2 MB) compite con la primera visita: +86 ms en la portada (2.867 → 2.953 ms, medido con el SW permitido). Registrado en `load`: 2.782 ms, mejor que sin `defer`.
    - Se conserva el contrato de §10: el literal `navigator.serviceWorker.register('./sw.js')` seguido de `.update()`, sin `unregister`, dentro de `if ('serviceWorker' in navigator)`.
    - Si `load` ya pasó cuando corre el guion (no ocurre con un `<script>` en línea, pero se cubre), se registra en seguida (`document.readyState === 'complete'`).
    - Pruebas: `test_rediseno_index.mjs` ejecuta el registro real dentro del manejador de `load` (decisión 38); los tres smoke en verde tres veces (`pwa-smoke` espera al SW con `waitForAsync`).
    - Coste: en la primera visita, el SW se instala tras `load` (unos cientos de ms después); si se cierra la página antes, se instala en la visita siguiente.
16. **La prueba de que no vuelven mira también el listado de la raíz del repo** (Tarea 1): si una fusión con `main` trae de vuelta un retirado que el bot regeneró, la suite lo para. La Tarea 7 dice cómo resolver esos conflictos (`git rm`). Coste: quien ejecute en local un generador anterior a B4 ve la suite en rojo hasta que borra esos ficheros sin seguimiento.
17. **Miniaturas con paleta de 256 colores (`FASTOCTREE`), perfiles ICC convertidos a sRGB y el bloque tEXt `escudo`** (cambia el «RGBA» del esqueleto; Tarea 4).
    - En RGBA, Tabla no bajaría (123.618 frente a 125.568 bytes: sus 15 escudos ya son de 64×64); con paleta, 46.169; las 176, de 2.640.463 bytes a 585.820. Las hojas de contacto (16, 24, 32 y 46 px CSS a DPR 3, en claro y en oscuro) no enseñan diferencias: el color medio de cada par difiere 2,3/255 como mucho, salvo `futbolPDC2016.png` a 46 px (5,2), que es el redondeo de `object-fit` con otras proporciones.
    - Los 22 originales con perfil ICC (21 Adobe RGB y uno Display P3) se convierten a sRGB, como los pinta Chrome, y la miniatura va sin perfil; un cHRM suelto (sin gAMA) Chrome no lo aplica, y la miniatura tampoco.
    - Cada miniatura lleva un bloque tEXt `escudo` con el sha1 de su original y la receta: `--check` ve, sin Pillow, un original cambiado con el mismo nombre.
    - `SIZE` se queda en 96 (la spec); medir 138 para las cabeceras de 46 px queda para B5.
    - Coste: un error medio de unos 3/255 por canal, invisible en las hojas; volver a RGBA es quitar `quantize` y cambiar `RECIPE`, y la pasada siguiente rehace las 176 (unos 77 KB más en Tabla); unos 80 bytes de tEXt por miniatura; en Safari no se comprobó si aplica los cHRM sueltos de 25 originales.
18. **El presupuesto se juzga con medianas, y al publicar con `--runs 5`** (Tareas 6 y 7): los umbrales valen para las medianas (por defecto, de 3 pasadas), la de «portada pintada» y la del LCP. En la publicación, `--runs 5`, con la máquina en reposo (sin smoke ni otras mediciones a la vez), y un `PRESUPUESTO: MAL` se repite una vez antes de parar la publicación; si se repite, se para y se avisa al usuario con las cifras. Coste: el margen del LCP es de unos 200 ms; con la máquina cargada, una apertura suelta pasó de 3 s.
19. **Un escudo nuevo, en `docs/temporada-nueva.md`** (Tarea 4): el paso (copiar el original a `escudos/`, añadirlo a `data-shields.js`, `python3 scripts/build_crests.py` y comitear los tres), en «Activar y publicar», antes de la comprobación en el navegador, con una línea que dice que `test_build_crests.py` lo exige. Coste: ninguno.
20. **Los recuentos y las cifras son los de las tareas reales encadenadas**: las Tareas 4 a 6 se redactaron sobre un sustituto de la 1 y la 3 (con node 729 en la base), y la pasada del ensamblado los fija (tabla de las restricciones). Coste: ninguno.

### De los borradores (Tareas 1 a 6)

21. La prueba de que no vuelven vive en dos sitios: `test_rediseno_index.mjs` (`index.html`, `sw.js`, el listado de la raíz del repo y los seis mundos de `fixture-site.mjs`) y `TestGeneratorOutputs` de `test_pygen_fixes.py` (las salidas de `main()`). Coste: dos pruebas en lugar de una.
22. La de las salidas del generador usa una base sintética en una raíz temporal (como `activate_season.apply_manifest`), no la real: la real tarda 2,7 s por pasada y la prueba hace dos. La base real la ensaya el paso 5 de la Tarea 1. Coste: ninguna prueba de pytest genera con la base real.
23. `test_sw_fixes.mjs`: los `data-*.js` de `STATIC_ASSETS` son exactamente los inmediatos de `index.html`, en su orden (cubre los dos sentidos; el otro ya lo tenía `test_data_globals_contract.mjs`). Coste: añadir un inmediato obliga a tocar los dos ficheros a la vez (ya era así).
24. `pwa-smoke` atribuye cada petición de un retirado por su `?v=`: la del SW anterior (revalidaciones de la app anterior) frente a la publicada (el SW nuevo y la app nueva con él al mando), y exige que la app anterior pida alguno, para que la comprobación no sea vacía. Con el SW anterior al mando, las peticiones de la página nueva no llegan al servidor con su `?v=`: esas aperturas las cubre que `index.html` no los nombre. Coste: ninguno.
25. El señuelo de la versión de `test_rediseno_state.mjs` pasa de `data-matchdetail-keys.js` a `data-benjamin.js`, y conserva la comprobación de que `state.js` solo lee la versión de `data-seasons.js`. Coste: ninguno.
26. Se van las dos pruebas de la base real con `generate_players_js` (colisiones de `TEAMS_` y determinismo): `TEAMS_` ya no existe, y el determinismo de C4 lo cubren la segunda pasada de `TestGeneratorOutputs` y el ensayo del paso 5 de la Tarea 1. Coste: ninguna prueba de pytest regenera con la base real byte a byte.
27. Los pasos que imprime `main()` se renumeran del 1 al 10, y los docstrings del módulo y de `normalize_for_teams_mapping` dicen lo retirado (nadie lee esa salida: comprobado con `grep`). Coste: ninguno.
28. Se tocan dos textos que no son pruebas porque afirmaban en presente que el glob `data-*.js` cubre las claves: el docstring de `test_workflows.py:15` y un comentario de `.github/workflows/fetch-fiflp.yml` (solo el comentario; el glob y los pasos, igual). `update.yml` no se toca en esta tarea (no las nombra; sus acciones y su imagen cambian en la Tarea 5, decisión 55), y los comentarios históricos (`test_workflows.py:177 y 230`, `docs/SP-*.md`, `src/`) se quedan. Coste: una línea de un workflow del bot que ninguna prueba ejecuta.
29. El paso 0 de la Tarea 1 mide el DOM de la base de `render-smoke` en `$S/dom-base.txt`, y cada «Esperado» lo da relativo a ella, como el paso 0 de B3 (decisión 164 de B3). Coste: ninguno.
30. `publicar.py` imprime exactamente dos líneas (los avisos por fichero de `bump_cache_version` van a un `StringIO`). Antes de escribir comprueba las marcas (las `?v=`, un pie, un `CODIGO` y `CACHE_NAME` en la línea 1) y, sin ellas o con la `z`, sale con 1 sin tocar nada y lo dice («…: nada escrito»). Devuelve lo que devuelve `codigo.main`. Coste: ninguno.
31. `bump_cache_version(version=…)` rechaza una cadena que no sea `\d{8}[a-z]?` (`ValueError`, sin escribir): una versión con otra forma rompería las expresiones del bot en la subida siguiente. Coste: ninguno; el bot no pasa `version`.
32. El día de `publicar.py` sale de `publicar._today_utc()`, que las pruebas sustituyen; la firma de `main` queda la del contrato. Coste: ninguno.
33. `test_publicar.py` también ejecuta `publicar.main` sobre una copia del `index.html`, el `sw.js`, `acta.css` y `src/` reales: solo cambian las `?v=` y `CACHE_NAME`. Como `test_rediseno_index.mjs`, depende de que `CODIGO` sea la huella del árbol, y el bot nunca la cambia. Coste: una prueba más que lee `index.html` (nunca los `data-*.js`).
34. `docs/rediseno-rebase.md`: el título, la línea 3 (cada fase se publica al terminarla, con los commits de B2 y B3), la excepción de los `data-*.js` retirados en «Qué choca» (un rebase o un merge con `main` los devolvería si se sigue la regla de quedarse con el de `main`), la línea 13, la del PR borrador (cerrado; el CI se lanza a mano) y una sección «Publicar una fase» de cinco pasos que remite al paso de publicar del plan para las comprobaciones de la web. Coste: el documento mezcla rebase (entre publicaciones) y merge (al publicar), como se ha hecho en B2 y B3.
35. El manifiesto se prueba en Node (`test_rediseno_pwa.mjs`, nuevo), no en pytest: lee `index.html`, como `test_rediseno_index.mjs`, y la cabecera PNG sale de un `Buffer`. Sus campos se atan a `index.html` (título, nombre corto, descripción y `theme-color` claro): si cambian allí, la prueba lo pide también en el manifiesto. Coste: ninguno.
36. `<link rel="icon" type="image/png" href="./icons/icon-192.png">`, sin `sizes`, como dice la decisión 7; los iconos del manifiesto llevan `sizes`, `type` y `purpose`. Coste: ninguno.
37. El arranque se sangra dos espacios entero (también el texto del aviso en su plantilla, que solo gana espacios en blanco sin efecto), y la comprobación del marcador de `test_rediseno_index.mjs` deja de depender del sangrado. Coste: un diff grande de `index.html` en la Tarea 3, sin cambios de conducta.
38. La prueba del registro tras `load` ejecuta el `<script>` real en `node:vm` con un navegador falso (sin cargar, al llegar `load` y ya cargada) y comprueba el literal de §10; no se queda en su texto. Coste: ata el registro a `document.readyState` y a `addEventListener` (los del navegador falso).
39. `build_crests.py` escribe solo lo que falta o se quedó atrás, y borra lo que sobra en `escudos/s/` (la carpeta es generada). Coste: un fichero puesto a mano ahí se borra en la pasada siguiente.
40. La hoja de contacto de la Tarea 4 mira los escudos a 16, 24, 32 y 46 px CSS, con DPR 3: 46 px es el tamaño de las cabeceras (portada, ficha y Partido), donde el navegador amplía la miniatura de 96 a 138 px. Coste: algo de nitidez en los 41 escudos con original mayor de 96 px, que la hoja no enseña (decisión 17: 138, para B5).
41. La prueba de las acciones de `tests.yml` (y, desde la decisión 55, de `update.yml`) fija la versión exacta (`NODE24` en `test_workflows.py`), no «al menos»: subir una acción obliga a comprobar sus notas de versión y a tocar la tabla. `tests.yml` lleva sobre `jobs:` un comentario con las tres versiones. Coste: una línea más al actualizar una acción.
42. `presupuesto.mjs`: el CLS es la suma de los desplazamientos sin interacción (una cota superior del CLS de web-vitals, que toma la peor ventana); Tabla cuenta todas las imágenes de la pantalla (las diferidas se piden ya); KB de 1.024 bytes, como el punto de partida; el icono de la pestaña cuenta como «Other», no como imagen; sale con 2 si no pudo medir (también si el mundo A no da el estado A); exporta `LIMITS`, `parseArgs`, `median` y `report` para su prueba sin navegador. Coste: una cifra algo más estricta que la de Lighthouse.

### Del ensamblado

43. **La Tarea 4 añade el paso de un escudo nuevo a `docs/temporada-nueva.md`** (decisión 19) en «Activar y publicar», justo antes de «Comprobar ambas categorías…»: un equipo nuevo llega con la temporada nueva, y el paso cierra con las comprobaciones de siempre. Coste: ninguno.
44. **`publicar-b4.mjs`** (Tarea 7, en `$S`, como `publicar-b3.mjs`), con tres modos: `antes`, `despues` y `capturas`.
    - La 1.ª apertura de `despues`, «breve», se cierra en cuanto la pantalla está pintada, sin la espera fija de 1 s de `publicar-b3.mjs`.
    - La 2.ª se cierra igual y, después, **sin ninguna página de la app abierta**, se espera al SW nuevo como `pwa-smoke` desde `7f31f15`: en cada vuelta se abre una página de sonda (`manifest.json`, que el SW sirve de la red sin tocar su caché), se pide la actualización, se mira el estado y se cierra en seguida.
    - Una **versión entera** es el `index.html` de B3 (los datos sin `defer` y el icono SVG en línea) con la `?v=` que vio `antes`, o el de B4 (con `defer` y el icono PNG) con la publicada, con Explorar pintada, sin el aviso del arranque ni errores. A medias por código no puede quedar: `CODIGO` es el mismo.
    - **Ningún retirado**: ninguna petición de un retirado lleva la versión publicada (ni de una página ni de un SW: Playwright 1.58 ve en Chromium las peticiones del SW), y una página que pida uno (la de B3, que los nombra) lo recibe de su SW, con 200. Las revalidaciones del SW de B3 (con su `?v=`) reciben 404 y se descartan (`sw.js` solo guarda respuestas `ok`): se cuentan, no son un fallo.
    - `capturas`: la portada y Tabla de PG2 a 390 px, en claro, con DPR 2 (para el móvil del usuario) y la ventana del alto de la página (la barra de pestañas, fija, queda abajo), sin SW, con todos los escudos de la pantalla cargados y de `escudos/s/`.
    - Coste: ninguno en B4, que no cambia módulos: la 1.ª apertura de B3 duraba 1 s para provocar una revalidación a medias del código, que aquí no puede darse (en el ensayo, la 1.ª ya revalidó `index.html`, y la 2.ª fue B4 con el SW de B3, que el guion acepta). Una fase que cambie código tendrá que volver a dar tiempo a la 1.ª, esperando a una condición (la revalidación en marcha), nunca un tiempo fijo.
45. **El ensayo local de la publicación** (Tarea 7, paso 6): antes de empujar, `pages-server.mjs` sirve `origin/main` (lo publicado) bajo `/futbol-base/`, `antes` crea un perfil, el árbol pasa a `HEAD` (B4 con su versión) con el servidor en marcha, y `despues` y `capturas` lo recorren. Es la prueba local de `publicar-b4.mjs` de la verificación. Coste: unos 3 minutos al publicar.
46. **Traer `main` en la Tarea 7**: antes, `sync_versions.py --since`, como `docs/rediseno-rebase.md`; en el merge, los conflictos esperados se resuelven en el mismo bloque (`index.html` y `sw.js`, con la estructura de la rama y las marcas de `main`; los retirados, con `git rm`), y cualquier otro lo para; al final, las marcas de `main` y cero retirados en el árbol. Coste: un retirado que el bot añadiera sin conflicto (un `data-players-<S>.js` nuevo, al activar una temporada en `main`) lo dice ese recuento, y se quita con `git rm`.
47. **Los push, solo sin workflows en marcha, comprobado en el propio bloque**: `gh run list --json status` antes de cada push; con uno en marcha, el bloque no empuja y lo dice (en B3 lo comprobaba quien leía la salida). Coste: ninguno.
48. **El presupuesto en local antes de empujar** (Tarea 7, paso 4, con `--runs 5` y la máquina en reposo): un `MAL` repetido para la publicación antes de tocar la rama remota; después, `--web` contra la web (decisión 18). Coste: un minuto más.
49. **En la web, además**: `data-stats.js` y `data-matchdetail-keys.js` responden 404 (el SW de B3 los tiene en su caché y sus revalidaciones se descartan), y la ejecución del CI de la rama no trae el aviso «Node.js 20 is deprecated» (decisión 12). Coste: ninguno.
50. **Las cifras de la Tarea 6 se midieron de nuevo** con las tareas reales (el icono de la pestaña de la Tarea 3 suma 4 KB a la portada), con la máquina sin otras pruebas en marcha. Coste: ninguno.

### De la revisión adversarial (mandan sobre todas las anteriores)

51. **Las pruebas de `test_build_crests.py` que leen `escudos/` se saltan dentro de un bot** (M1; cambia la 9; Tarea 4). El bot (`update.yml`, y `fetch-fiflp.yml` y `fetch-fiflp-actas.yml`) ejecuta todo pytest antes de comitear los datos y se para en rojo sin publicar, y los escudos se añaden a mano en `main` (`ceb6d18`, «3 escudos faltantes»): un escudo sin su miniatura, o un original cambiado, dejaba de publicar resultados y clasificaciones hasta que alguien ejecutara `build_crests.py`.
    - Llevan `LIVE`, `skipif(GITHUB_WORKFLOW existe y no es «Tests»)`: GitHub Actions pone ahí el `name:` del workflow («Actualización automática», «Scraping FIFLP», «Scrape FIFLP actas (incremental)»). En local y en `Tests`, que desde la Tarea 5 corre también con solo `escudos/**` cambiado, siguen estrictas: un escudo sin miniatura pone `Tests` en rojo.
    - Son ocho, no las tres que nombró el controlador: las tres que fallan con un escudo nuevo o cambiado (cobertura, al día y `--check` sin Pillow), y las otras que leen `escudos/` tal como está y podrían fallar con un cambio a mano (la de las cabeceras, los nombres repetidos, los tamaños de la receta, la de Pillow y la prueba de todo esto).
    - Prueba: en una copia del árbol con un escudo nuevo sin miniatura, pytest en un subproceso: con `GITHUB_WORKFLOW=Tests`, 3 fallan; con «Actualización automática», ninguna falla y se saltan las de `LIVE`. Y el paso 5 de la Tarea 4 pasa toda la suite así, sin Pillow.
    - Coste: un escudo sin miniatura llega a `main` si nadie mira `Tests`, y la app lo pinta desde el original, por la cadena de `crest()`, como antes de B4.
52. **`trim_shields.py` hace las miniaturas al terminar** (M1; Tarea 4): si trajo algún escudo, llama a `build_crests.main([])` (ya importaba Pillow). No tiene pruebas: el paso 5 de la Tarea 4 lo ensaya sin red, con una descarga simulada. Coste: ninguno.
53. **El paso 2 de la Tarea 7, de vuelta del paso 8** (B1): si `main` avanzó después del commit de la versión (lo probable: el bot comitea `data-health.json` de 1 a 4 veces al día), la fusión suele ser limpia y la rama conserva las marcas de su publicación, que no llegó a `main`. El bloque pone las de `main` en el commit de la fusión (`--amend`), y el paso 3 sube a una versión estrictamente mayor que la vigente. Ensayado con un `main` que solo trajo un `data-health.json` tras el commit de la versión. Coste: la versión nueva puede repetir la de la publicación que no llegó a `main`, que ningún móvil tiene (Pages solo publica `main`).
54. **Las esperas largas** (B2; todas las tareas): los bloques que pasan de 2 minutos lo dicen y se lanzan con el `timeout` de la herramienta a 600000 ms; los que pueden pasar de 10, en segundo plano o con Monitor (restricciones globales y Tarea 7). Coste: ninguno.
55. **Los workflows con la imagen fijada, y el bot en Node 24** (B3; cambia la 12; Tareas 5 y 7).
    - `runs-on: ubuntu-24.04` en los 10 workflows de `.github/workflows/` (12 trabajos): es la imagen de hoy, sin cambio de conducta, y evita el salto de `ubuntu-latest` a Ubuntu 26 del 19/10/2026, que podría dejar al bot sin su Python 3.11 de `setup-python`.
    - `update.yml` pasa a `checkout@v5` y `setup-python@v6`, como `tests.yml`, sin tocar nada más de sus pasos; los `fetch-fiflp*.yml` y los demás, solo la imagen (sus acciones, en B5).
    - `test_workflows.py` fija la imagen de todos y las versiones de `tests.yml` y `update.yml` (`NODE24`).
    - En la Tarea 7, tras publicar y con la web comprobada, `update.yml` se lanza una vez a mano y se espera en verde (paso 10): en el runner real, el bot genera, pasa sus suites y empuja con el generador de B4.
    - Coste: si `setup-python@v6` o la imagen fallaran en el runner, el bot saldría en rojo en ese paso 10, con la web ya publicada; se ve en minutos y se vuelve a las versiones de antes con otro commit.
56. **La orientación EXIF** (B5; Tarea 4): `make_thumbnail` gira la imagen como dice su EXIF (`ImageOps.exif_transpose`), como la pinta el navegador, y la prueba lee de la cabecera de un JPEG el tamaño con que se pinta (Orientation de 5 a 8, un cuarto de vuelta). La receta no cambia y las 176 miniaturas salen iguales byte a byte: ningún original lleva giro. Prueba: un JPEG sintético con Orientation 6, con Pillow. Coste: ninguno; un PNG con un bloque eXIf de giro no se mira en la prueba de las cabeceras (hoy, ninguno).
57. **Lo que se aparca de la revisión**: B4 (sin conexión, tras cada cambio de SW los escudos desaparecen, porque `activate` borra la única caché que los tenía; ya pasaba en B3) pasa a «Para B5 y siguientes», porque trasladarlos exige versionar las URL de las miniaturas en `crest()`; B6 (Android puede preguntar si actualiza el nombre y el icono de la app instalada) no lleva código: el mensaje de la publicación avisa a la familia (Tarea 7, paso 9; decisión 7). Coste: sin conexión, la primera apertura tras cada subida de versión pinta monogramas, como hoy.

## Foco de revisión (cada línea con su prueba en la tarea indicada)

1. **El bot tras B4**: `generate_js.main()` sobre una copia del árbol con la base de datos del repo no vuelve a crear los ficheros retirados, no cambia ningún otro `data-*.js` y no sube la versión si los datos no cambian (Tarea 1: el ensayo del paso 5 y `TestGeneratorOutputs`).
2. **La app instalada en los móviles tras el cambio de manifiesto**: sigue siendo la misma app (`id`), abre en `#/` y sus iconos existen con sus píxeles (Tarea 3: `test_rediseno_pwa.mjs` y `Page.getAppId` en el paso 5).
3. **Un escudo nuevo sin miniatura** (alguien añade o cambia un original y no ejecuta `build_crests.py`): la prueba de pytest lo detecta en local y en `Tests`, nunca dentro del bot, que sigue publicando; `trim_shields.py` ya hace las miniaturas de lo que trae; `docs/temporada-nueva.md` dice el paso; y en la app la cadena miniatura → original → monograma sigue funcionando (Tarea 4: `test_build_crests.py`, el ensayo de `trim_shields.py` y la suite con el entorno del bot en el paso 5; la cadena ya tiene prueba en `test_rediseno_ui.mjs`).
4. **El paso de B3 a B4 con el SW de B3**: ninguna apertura pide un fichero retirado ni queda a medias, y sin conexión la app sigue funcionando (Tarea 1: `pwa-smoke`; Tarea 7: el ensayo local de `publicar-b4.mjs` en el paso 6 y, tras publicar, en la web).
5. **La publicación con `publicar.py`**: la versión nunca repite ni retrocede (vigente de hoy, de un día posterior y con `z`) y el pie no se mueve (Tarea 2: `test_publicar.py` y el paso 5), también de vuelta del paso 8 (Tarea 7, paso 2).
6. **Los workflows y el bot con sus acciones nuevas**: la imagen de todos, fijada, y las acciones de `tests.yml` y `update.yml` en Node 24 (Tarea 5: `test_workflows.py`); y el bot de verdad, en verde tras publicar (Tarea 7, paso 10).

## Estructura de ficheros

- `scripts/generate_js.py` (modificar): sin los tres generadores ni `_season_goal_records` (Tarea 1); `bump_cache_version(root, touch_footer, version)` y `_next_version(content, today)` (Tarea 2).
- `scripts/publicar.py` (crear, Tarea 2): la subida de versión de una publicación.
- `scripts/build_crests.py` (crear), `escudos/s/*.png` (176, crear) y `scripts/trim_shields.py` (modificar; Tarea 4).
- `index.html` (modificar): 7 inmediatos (Tarea 1), con `defer`, el arranque en una función asíncrona, el registro del SW tras `load` y los iconos PNG (Tarea 3); las marcas de versión (Tarea 7).
- `manifest.json` (modificar) e `icons.svg` (borrar; Tarea 3).
- `sw.js` (modificar): `STATIC_ASSETS` sin los dos retirados (Tarea 1); `activate` solo con `futbolbase-v*` (Tarea 5); `CACHE_NAME` (Tarea 7).
- `data-matchdetail-keys.js`, `data-stats.js` y `data-players-2021-2022.js` … `data-players-2025-2026.js` (borrar; Tarea 1).
- `scripts/tests/pages-server.mjs` y `scripts/tests/presupuesto.mjs` (crear; Tarea 6).
- `.github/workflows/`: `tests.yml` y `update.yml` (acciones e imagen) y los otros ocho (la imagen), en la Tarea 5; `fetch-fiflp.yml`, además, un comentario en la Tarea 1.
- `docs/rediseno-rebase.md` (modificar, Tarea 2) y `docs/temporada-nueva.md` (modificar, Tarea 4).
- Pruebas: modificadas, `test_rediseno_index.mjs` (Tareas 1 y 3), `test_sw_fixes.mjs` (1 y 5), `test_js_modules.mjs`, `test_rediseno_state.mjs`, `test_pygen_fixes.py`, `test_data_integrity.py`, `test_index_bot_contract.py`, `fixture-site.mjs` y `pwa-smoke.mjs` (Tarea 1), y `test_workflows.py` (1 y 5); nuevas, `test_publicar.py` (Tarea 2, 18 pruebas), `test_rediseno_pwa.mjs` (Tarea 3, 4), `test_build_crests.py` (Tarea 4, 12) y `test_presupuesto.mjs` (Tarea 6, 4).
- Fuera del repo (`$S`): `dom-base.txt`, `portada-390.mjs` e `id-app.mjs` (Tareas 1 y 3), `escudos/` (la hoja de contacto, Tarea 4) y `publicar-b4.mjs`, con sus perfiles, el ensayo y las capturas (Tarea 7).

## Contratos (reconciliados con el código de las tareas)

### `index.html` y `manifest.json`

```text
index.html tras la Tarea 1   7 <script src="./data-X.js?v=V"></script> (benjamin, prebenjamin, history, goleadores,
                             shields, seasons, maspalomas-cup-2026, en ese orden) y 9 marcas ?v= (la hoja, los 7 datos
                             y el import de app.js); el pie, intacto
index.html tras la Tarea 3   <link rel="apple-touch-icon" href="./icons/icon-180.png">
                             <link rel="icon" type="image/png" href="./icons/icon-192.png">
                             <link rel="manifest" href="./manifest.json">
                             7 × <script defer src="./data-X.js?v=V"></script>, en el mismo orden
                             <script type="module"> // comentarios
                               (async () => { try { const CODIGO = 'be0acbf3'; …import('./src/app.js?v=V')… start(…) … }
                                              catch (error) { el aviso con «Reintentar» } })();
                             <script> if ('serviceWorker' in navigator) {
                               const register = () => navigator.serviceWorker.register('./sw.js')
                                 .then(reg => reg.update()).catch(() => {});
                               if (document.readyState === 'complete') register();
                               else addEventListener('load', register, { once: true }); }
manifest.json                { id "/futbol-base/index.html", name "Fútbol Base Las Palmas", short_name "Fútbol Base LP",
                               description (la de index.html), start_url "./index.html#/", display "standalone",
                               orientation "portrait", background_color y theme_color "#FFFFFF",
                               icons: icon-192.png 192x192 any, icon-512.png 512x512 any,
                                      icon-maskable-512.png 512x512 maskable (todos image/png) }
```

### `sw.js`

```text
tras la Tarea 1   STATIC_ASSETS: sus data-*.js son exactamente los 7 inmediatos de index.html, en su orden;
                  SEASON_FILES sin cambios (las 4 temporadas pasadas)
tras la Tarea 5   activate borra k.startsWith('futbolbase-v') && k !== CACHE_NAME, y después clients.claim()
```

### Workflows (Tarea 5)

```text
todos (10, 12 trabajos)   runs-on: ubuntu-24.04
tests.yml                 push y pull_request también con fonts/**, icons/** y escudos/**; checkout@v5, setup-python@v6
                          y setup-node@v5
update.yml                checkout@v5 y setup-python@v6; sus pasos, sin cambios
test_workflows.py         NODE24 = {"actions/checkout": "v5", "actions/setup-python": "v6", "actions/setup-node": "v5"},
                          para tests.yml y update.yml; la imagen de todos
```

### Python

```python
# scripts/generate_js.py (Tarea 2)
def _next_version(index_content, today=None) -> str
    # today: datetime.date; por defecto, date.today(), el reloj del bot (UTC en el runner de GitHub)
def bump_cache_version(root=None, touch_footer=True, version=None) -> None
    # version: \d{8}[a-z]?, o ValueError sin escribir nada; None: _next_version. El bot la llama sin argumentos.

# scripts/publicar.py (Tarea 2)
def next_publish_version(current: str, today_utc: str) -> str   # pura; ValueError con la z o sin la forma del bot
def _today_utc() -> str                                          # AAAAMMDD en UTC; las pruebas la sustituyen
def main(argv=None) -> int                                       # --root R (por defecto, la raíz del repo)
# python3 scripts/publicar.py  →  0 y dos líneas:
#   versión <V> (antes, <W>): <N> ?v= en index.html y futbolbase-v<V> en sw.js; «Última actualización: …», sin tocar
#   CODIGO <h>: la huella de acta.css y src/*.js, en index.html
# sin las marcas, o con la vigente en z: 1 y una línea que acaba en «: nada escrito», sin escribir

# scripts/build_crests.py (Tarea 4)
SIZE = 96; COLORS = 256; RECIPE = "96px octree256"; TAG = "escudo"
def thumb_name(original: str) -> str                  # "x.jpg" -> "x.png", como crest() de src/ui.js
def thumb_size(width: int, height: int) -> tuple      # el lado mayor <= SIZE, sin ampliar, con la misma forma
def source_tag(original: bytes) -> str                # "sha1=<40 cifras> 96px octree256"
def read_tag(png: bytes) -> str | None                # el tEXt «escudo» de un PNG, sin Pillow
def survey(root) -> dict                              # {"colisiones", "pendientes", "sobran", "al_dia"}
def make_thumbnail(original: Path, target: Path) -> None   # con Pillow: el giro del EXIF, sRGB, LANCZOS, paleta y tEXt
def main(argv=None) -> int                            # [--check] [--root R]
# scripts/tests/test_build_crests.py (Tarea 4)
LIVE    # skipif: GITHUB_WORKFLOW existe y no es "Tests" (dentro de un bot); en las 8 pruebas que leen escudos/
# scripts/trim_shields.py (Tarea 4)
def main()                                            # si trajo algún escudo, al terminar, build_crests.main([])
# python3 scripts/build_crests.py          →  escudos/s: <n> escritas, <m> al día, <k> borradas  (0; 1 con un nombre repetido o sin Pillow)
# python3 scripts/build_crests.py --check  →  escudos/s: <n> al día  (0), o cada problema y «…, <p> por arreglar: …» (1)
```

### Node

```js
// scripts/tests/pages-server.mjs (Tarea 6)
export async function startPagesServer(root, { port = 0 } = {}) → { url, close() }
//   url: 'http://127.0.0.1:<puerto>/' (con la barra final); sirve root en «/» y bajo «/futbol-base/», sin mirar la ?v=;
//   gzip del texto si el navegador lo acepta; Cache-Control: max-age=600; GET y HEAD (405 lo demás); 404 fuera de root;
//   lee cada fichero en cada petición: el árbol puede cambiar debajo con el servidor en marcha
// scripts/tests/presupuesto.mjs (Tarea 6)
export const LIMITS = { home: 3000, lcp: 3000, cls: 0.1, tablaKB: 300 };
export function parseArgs(argv) → { web: string | null, runs: number }              // --web <url> (con barra final), --runs N (3)
export function median(values) → number
export function report({ home, lcp, fcp, kb, runs, cls, tabla }) → { ok, lines }
// node scripts/tests/presupuesto.mjs [--web <url>] [--runs N] → 0 (OK), 1 (MAL) o 2 (sin medir):
//   sitio: <el árbol, con pages-server.mjs | la url>; el CLS, en local con el mundo A
//   portada: <ms> ms (< 3000); LCP <ms> ms (< 3000); FCP <ms> ms; <KB> KB; mediana de N
//   CLS: <x> (< 0,1): 390 px <x> y 1440 px <x>; máximo de N, mundo A
//   imágenes de Tabla: <KB> KB (< 300): <n> imágenes, PG2
//   PRESUPUESTO: OK | PRESUPUESTO: MAL        (o, en stderr, PRESUPUESTO: sin medir: <motivo>)
// $S/publicar-b4.mjs (Tarea 7): WEB=<url> S=<dir> node publicar-b4.mjs antes|despues|capturas → 0 (OK), 1 (MAL) o 2 (uso)
```

---

### Task 1: Retirar los datos que ya no lee nadie: `data-matchdetail-keys.js`, `data-stats.js` y `data-players-<S>.js` (decisiones 1 y 3)

Tres familias de datos se generan, se publican y se descargan (dos de ellas en cada carga en frío) sin que ningún módulo de `src/` las lea: el generador deja de escribirlas, salen del repositorio, de `index.html` y del precache, y una prueba fija que no vuelven.

**Contexto**
- **Quién los lee: nadie** (inventario §D, comprobado con `grep` en `src/`):
  - `data-matchdetail-keys.js` (`MATCH_DETAIL_KEYS`, 38.824 bytes; 8.217 con gzip en la web): el ⚽ de las listas de la app anterior; desde el corte de B2 ni `readGlobals()` lo nombra;
  - `data-stats.js` (`STATS`, 109.469 bytes; 17.146 con gzip): Récords sale del modelo desde la decisión 26 de B3, ya publicada; la spec aún lo da por perezoso para Récords y en `SEASON_FILES` (§5.4 y §5.5), y la decisión 26 lo supera;
  - `data-players-<S>.js` (`PLAYERS_<S>` y `TEAMS_<S>`, cinco ficheros de 2021-22 a 2025-26, 70.009 bytes): nunca se cargaron; la plantilla sale de `LINEUPS_<S>` (§4.11: «su generación se retira en B4»).
  - Medido en local (punto de partida): la portada en frío, de 2.837 ms y 356 KB a 2.707 ms y 332 KB sin los dos inmediatos.
- **`scripts/generate_js.py` en `33e4cff`**:
  - salen `generate_matchdetail_keys_js` (488-499), `generate_players_js` (573-625) y `generate_stats_js` (717-952), sus llamadas en `main()` (1179-1180, 1187-1188 y 1210-1211) y lo que solo usaba `generate_stats_js`: `_MIN_GAMES_FOR_SEASON_STATS` y `_season_goal_records` (307-334);
  - se quedan `_is_league_group` (la usa `get_effective_standings`), `normalize_for_teams_mapping` (la clave de club del contrato C1: `db._teams_key` y su espejo `normalizeForTeamsMapping` de `src/state.js`, que usa `myteam.js`) y `_match_details`, `_keyed_or_dup` y `_season_const_suffix` (el detalle de partido y las actas);
  - los pasos de `main()` se renumeran del 1 al 10.
- **`index.html`**: de 9 inmediatos a 7 (salen las líneas 33 y 35) y de 11 marcas `?v=` a 9 (la hoja, los 7 datos y el `import` de `app.js`); el comentario de las líneas 27-28 los nombraba. **`sw.js`**: salen las líneas 61 y 63 de `STATIC_ASSETS`; `SEASON_FILES` no cambia.
- **Las pruebas que los nombran**, las del inventario (§G) y las que da `grep -rn` en `scripts/`, `docs/temporada-nueva.md`, `.github/` y `scripts/activate_season.py`:
  - `test_rediseno_index.mjs:27-33` (los 9 inmediatos) y `test_index_bot_contract.py:42` (al menos 11 `?v=`): pasan a los 7 y a exactamente 9;
  - `test_sw_fixes.mjs:101-106` (las claves, siempre en el precache): pasa a que los `data-*.js` de `STATIC_ASSETS` sean exactamente los inmediatos de `index.html`, en su orden;
  - `test_js_modules.mjs`: las sondas de `MATCH_DETAIL_KEYS` y `PLAYERS_*` (31-35), el cableado de las claves (174-185, que conserva lo perezoso de `data-matchdetail.js` y ahora admite `defer`), la prueba de las claves (188-201) y, en la de las actas (223-269), la existencia de `data-players-<S>.js` y el invariante 2 de `PLAYERS_` (con el `existsSync` que importaba, línea 221);
  - `test_pygen_fixes.py`: las dos de la base real con `generate_players_js` (110-146), `TestSeasonGoalRecords` y `TestSeasonTotalsExcludeCups` (461-534, de `generate_stats_js`), `test_keys_index_skips_dup_keys` (843-859) y las claves en `TestMatchKeySanitize` (537-575), que siguen con `MATCH_DETAIL` y `LINEUPS`;
  - `test_data_integrity.py:370-443`: las dos de `generate_players_js`;
  - las que el inventario no cubre: `test_rediseno_state.mjs:18-23 y 103`, que usaba un `<script>` de `data-matchdetail-keys.js` como señuelo de la versión (pasa a `data-benjamin.js`); el docstring de `test_workflows.py:15` y el comentario de `.github/workflows/fetch-fiflp.yml:72-73`, que decían que el glob `data-*.js` cubre las claves (el glob no cambia). `docs/temporada-nueva.md` no los nombra, y `activate_season.py` copia `data-*.js` con un glob: nada que tocar.
- **Datos congelados (decisión 3)**:
  - `fixture-site.mjs:164 y 166` dejan de servir los dos inmediatos: el mundo es la app nueva;
  - `pwa-smoke.mjs` se los sigue sirviendo a la app anterior, que los pide: su `index.html` congelado los nombra (`fixtures/app-anterior/index.html:113 y 115`), su SW los precachea (`sw.js:40 y 42`) y su portada pide `data-players-<S>.js` (`src/state.js:659`). La app nueva no pide ninguno, y la prueba lo distingue por la `?v=` de cada petición: el SW anterior revalida con la suya (`20260923j`), y el SW nuevo, y la app nueva con él al mando, con la publicada (`20991231a`). En el segundo escenario (`codeDeploy`) las dos versiones son la app nueva: ninguna petición.
- **La prueba que fija que no vuelven:** `test_rediseno_index.mjs` (ni en `index.html`, ni en `sw.js`, ni en el repositorio, ni en los mundos de `fixture-site.mjs`; lo del repositorio también salta si una fusión con `main` se queda con uno que el bot regeneró) y `TestGeneratorOutputs` en `test_pygen_fixes.py`: `generate_js.main()` con una base sintética en una raíz temporal escribe exactamente sus salidas, y otra pasada con la misma base no cambia ni un byte ni sube la versión (C4). Sin leer ningún `data-*.js` vivo.
- **El bot tras B4** (foco de revisión 1): el paso 5 ensaya `generate_js.main()` en una copia del árbol con la base del repositorio.
- **Recuentos:** pytest de `478 passed, 5 skipped` a `470 passed, 5 skipped` (9 pruebas fuera y 1 nueva); node se queda en 729 (1 fuera y 1 nueva). El DOM de la primera pasada de `render-smoke` (la portada con los datos reales) adelgaza 126 bytes: los dos `<script>` y el comentario.

**Files:**
- Delete: `data-matchdetail-keys.js`, `data-stats.js`, `data-players-2021-2022.js`, `data-players-2022-2023.js`, `data-players-2023-2024.js`, `data-players-2024-2025.js`, `data-players-2025-2026.js`
- Modify: `scripts/generate_js.py`, `index.html`, `sw.js`, `scripts/tests/fixture-site.mjs`, `.github/workflows/fetch-fiflp.yml` (un comentario)
- Test: `scripts/tests/test_rediseno_index.mjs`, `scripts/tests/test_sw_fixes.mjs`, `scripts/tests/test_js_modules.mjs`, `scripts/tests/test_rediseno_state.mjs`, `scripts/tests/test_pygen_fixes.py`, `scripts/tests/test_data_integrity.py`, `scripts/tests/test_index_bot_contract.py`, `scripts/tests/test_workflows.py`, `scripts/tests/pwa-smoke.mjs`

**Interfaces:**
- Consumes: `WORLDS` y `worldFiles(name)` (`fixture-site.mjs`); `generate_js.main()`, `generate_js.snapshot_data_files(root=None)`, `generate_js.PROJECT_ROOT` y `generate_js.get_connection` (que la prueba sustituye, como `activate_season.apply_manifest`); `_SCHEMA` de `test_pygen_fixes.py`.
- Produces:

```text
index.html  7 <script src="./data-X.js?v=V"> (benjamin, prebenjamin, history, goleadores, shields, seasons,
            maspalomas-cup-2026) y 9 marcas ?v= (la hoja, los 7 datos y el import de app.js); el pie, intacto
sw.js       STATIC_ASSETS: sus data-*.js, exactamente esos 7; SEASON_FILES sin cambios
generate_js.main() → data-benjamin.js, data-prebenjamin.js, data-history.js, data-matchdetail.js,
            data-goleadores.js, data-seasons.js, data-season-<S>.js (las pasadas) y data-lineups-<S>.js
            (las que tienen actas); nunca data-matchdetail-keys.js, data-stats.js ni data-players-<S>.js
```

- [ ] **Step 0: La base del DOM de `render-smoke`**

La primera pasada de `render-smoke` pinta la portada con los datos reales y el reloj de verdad, así que el tamaño de su DOM depende del día (15.872 bytes el 26/09/2026 sobre `33e4cff`). Se mide en la base, y cada «Esperado» de este plan lo da relativo a ella (como el plan B3, decisión 164):

```bash
cd /home/manolo/claude/futbol-base
: "${S:?falta S: la línea export S= de la cabecera}"
mkdir -p "$S"
node scripts/tests/render-smoke.mjs | sed -nE 's/^PASS: render smoke OK .*\(DOM ([0-9]+) bytes\)$/\1/p' > "$S/dom-base.txt"
cat "$S/dom-base.txt"
```
Esperado: un número, el DOM de la base de ese día (`15872` el 26/09/2026).

- [ ] **Step 1: Write the failing test**

Las pruebas nuevas (los 7 inmediatos, que no vuelven, las salidas del generador y lo que pide la app nueva en `pwa-smoke`) y las que nombraban lo retirado, con el guion de siempre. `cut` quita un bloque entero entre dos marcas y comprueba que dentro está lo que tiene que estar:

```bash
cd /home/manolo/claude/futbol-base
python3 - <<'PY'
from pathlib import Path


def edit(path, pairs):
    """Sustituye cada texto (que tiene que aparecer n veces, 1 si no se dice) o se para sin escribir."""
    p = Path(path)
    s = p.read_text(encoding='utf-8')
    for old, new, *n in pairs:
        assert s.count(old) == (n[0] if n else 1), (path, old[:80], s.count(old))
        s = s.replace(old, new)
    p.write_text(s, encoding='utf-8')


def cut(path, start, end, must):
    """Quita desde `start` (incluido) hasta `end` (excluido; None: hasta el final), cada uno una sola vez,
    y comprueba que lo quitado contiene `must`; si no, se para sin escribir."""
    p = Path(path)
    s = p.read_text(encoding='utf-8')
    assert s.count(start) == 1, (path, start[:80], s.count(start))
    i = s.index(start)
    j = len(s) if end is None else s.index(end, i)
    assert end is None or s.count(end) == 1, (path, end[:80], s.count(end))
    assert all(m in s[i:j] for m in must), (path, start[:80], must)
    p.write_text(s[:i] + s[j:], encoding='utf-8')


# ── index.html y sw.js: los 7 inmediatos, y los retirados no vuelven ──
edit('scripts/tests/test_rediseno_index.mjs', [
("""import { tabbar } from '../../src/ui.js';
""", """import { tabbar } from '../../src/ui.js';
import { WORLDS, worldFiles } from './fixture-site.mjs';
"""),
("""test('datos inmediatos: los nueve data-*.js de antes, en el mismo orden (decisión 5), y después el arranque', () => {
  const scripts = [...INDEX.matchAll(/<script\\b[^>]*\\bsrc="\\.\\/([^"?]+)\\?v=\\d{8}[a-z]?"[^>]*><\\/script>/g)].map((m) => m[1]);
  assert.deepEqual(scripts, [
    'data-benjamin.js', 'data-prebenjamin.js', 'data-history.js', 'data-goleadores.js',
    'data-matchdetail-keys.js', 'data-shields.js', 'data-stats.js', 'data-seasons.js',
    'data-maspalomas-cup-2026.js',
  ]);
""", """test('datos inmediatos: los siete que lee la portada, en el orden de antes (decisión 5 de B2; B4, decisión 1), y después el arranque', () => {
  const scripts = [...INDEX.matchAll(/<script\\b[^>]*\\bsrc="\\.\\/([^"?]+)\\?v=\\d{8}[a-z]?"[^>]*><\\/script>/g)].map((m) => m[1]);
  assert.deepEqual(scripts, [
    'data-benjamin.js', 'data-prebenjamin.js', 'data-history.js', 'data-goleadores.js',
    'data-shields.js', 'data-seasons.js', 'data-maspalomas-cup-2026.js',
  ]);
"""),
])

Path('scripts/tests/test_rediseno_index.mjs').write_text(Path('scripts/tests/test_rediseno_index.mjs').read_text(encoding='utf-8') + """
// B4 (decisiones 1 y 3): data-matchdetail-keys.js, data-stats.js y data-players-<S>.js ya no los lee
// nadie (el ⚽ de las listas se fue con la app anterior, Récords sale del modelo y la plantilla, de las
// actas) y el generador ya no los escribe (su prueba, en test_pygen_fixes.py). Si volvieran, cada carga
// en frío los descargaría para nada. Una fusión con main que se quede con los que el bot regeneró
// antes de publicar B4 también sale aquí.
const RETIRED = /data-(?:matchdetail-keys|stats|players-\\d{4}-\\d{4})\\.js/;
test('los datos retirados en B4 no vuelven: ni en index.html, ni en sw.js, ni en el repositorio, ni en los mundos de las pruebas', () => {
  assert.doesNotMatch(INDEX, RETIRED);
  assert.doesNotMatch(readFileSync(join(ROOT, 'sw.js'), 'utf8'), RETIRED);
  assert.deepEqual(readdirSync(ROOT).filter((file) => RETIRED.test(file)), []);
  for (const name of Object.keys(WORLDS)) {
    assert.deepEqual(Object.keys(worldFiles(name)).filter((file) => RETIRED.test(file)), [], `mundo ${name}`);
  }
});
""", encoding='utf-8')

edit('scripts/tests/test_sw_fixes.mjs', [
("""test('invariant: data-matchdetail.js lazy (not precached), keys file eager', () => {
  assert.ok(!sw.STATIC_ASSETS.includes('./data-matchdetail.js'),
    'data-matchdetail.js must NOT be precached');
  assert.ok(sw.STATIC_ASSETS.includes('./data-matchdetail-keys.js'),
    'data-matchdetail-keys.js must be precached');
});
""", """// Los data-*.js del precache son exactamente los inmediatos de index.html, en su orden (spec §5.5): ni
// falta uno (la primera apertura sin conexión saldría sin él) ni sobra uno (B4 retiró los que ya no
// lee nadie, decisión 1). data-matchdetail.js es perezoso: nunca en el precache.
test('invariant: los data-*.js de STATIC_ASSETS son los inmediatos de index.html; data-matchdetail.js, perezoso, no', () => {
  const eager = [...idxSrc.matchAll(/<script\\b[^>]*\\bsrc="(\\.\\/data-[\\w.-]+\\.js)\\?v=[0-9a-z]+"/g)].map((m) => m[1]);
  assert.deepEqual([...sw.STATIC_ASSETS].filter((url) => /^\\.\\/data-[\\w.-]+\\.js$/.test(url)), eager);
  assert.ok(!sw.STATIC_ASSETS.includes('./data-matchdetail.js'),
    'data-matchdetail.js must NOT be precached');
});
"""),
])

# ── test_js_modules: fuera las claves del ⚽ y las fichas de jugadores ──
edit('scripts/tests/test_js_modules.mjs', [
("""    'MATCH_DETAIL', 'MATCH_DETAIL_KEYS',
    'LINEUPS_2021_2022', 'LINEUPS_2022_2023', 'LINEUPS_2023_2024',
    'LINEUPS_2024_2025', 'LINEUPS_2025_2026',
    'PLAYERS_2021_2022', 'PLAYERS_2022_2023', 'PLAYERS_2023_2024',
    'PLAYERS_2024_2025', 'PLAYERS_2025_2026',
  ];
""", """    'MATCH_DETAIL',
    'LINEUPS_2021_2022', 'LINEUPS_2022_2023', 'LINEUPS_2023_2024',
    'LINEUPS_2024_2025', 'LINEUPS_2025_2026',
  ];
"""),
("""// wiring: eager keys file, lazy heavy file, sw not precaching the heavy one
test('index.html + sw.js wired for lazy matchdetail', () => {
  const idx = readFileSync(join(ROOT, 'index.html'), 'utf8');
  const sw = readFileSync(join(ROOT, 'sw.js'), 'utf8');
  assert.ok(/<script src="\\.\\/data-matchdetail-keys\\.js\\?v=/.test(idx),
    'index.html must eager-load data-matchdetail-keys.js');
  assert.ok(!/<script src="\\.\\/data-matchdetail\\.js\\?v=/.test(idx),
    'index.html must NOT eager-load the heavy data-matchdetail.js');
  assert.ok(!/['"]\\.\\/data-matchdetail\\.js['"]/.test(sw),
    'sw.js STATIC_ASSETS must not precache data-matchdetail.js');
  assert.ok(/['"]\\.\\/data-matchdetail-keys\\.js['"]/.test(sw),
    'sw.js must precache data-matchdetail-keys.js');
});
""", """// wiring: the heavy file is lazy (neither eager, with or without defer, nor precached); its keys file,
// data-matchdetail-keys.js, went in B4 (decisión 1): the ⚽ badge left with the previous app.
test('index.html + sw.js wired for lazy matchdetail', () => {
  const idx = readFileSync(join(ROOT, 'index.html'), 'utf8');
  const sw = readFileSync(join(ROOT, 'sw.js'), 'utf8');
  assert.ok(!/<script\\b[^>]*\\bsrc="\\.\\/data-matchdetail\\.js\\?v=/.test(idx),
    'index.html must NOT eager-load the heavy data-matchdetail.js');
  assert.ok(!/['"]\\.\\/data-matchdetail\\.js['"]/.test(sw),
    'sw.js STATIC_ASSETS must not precache data-matchdetail.js');
});
"""),
("""// ─── data-lineups-*.js / data-players-*.js invariants ─────────────────────
// SP-1 actas data files. Tests only run when at least one season has been
// scraped + imported + generated (the files exist in the repo). Skipped
// otherwise so the suite stays green before the first scrape.
import { readdirSync, existsSync } from 'node:fs';
""", """// ─── data-lineups-*.js invariants ──────────────────────────────────────────
// SP-1 actas data files. Tests only run when at least one season has been
// scraped + imported + generated (the files exist in the repo). Skipped
// otherwise so the suite stays green before the first scrape. B4 (decisión 1)
// retired data-players-*.js: the squad comes from LINEUPS (spec §4.6).
import { readdirSync } from 'node:fs';
"""),
("""    const season = f.match(/data-lineups-(\\d{4}-\\d{4})\\.js/)[1];
    const playersFile = `data-players-${season}.js`;
    assert.ok(existsSync(join(ROOT, playersFile)), `${playersFile} must exist alongside ${f}`);
    const linVar = `LINEUPS_${season.replace('-', '_')}`;
    const plaVar = `PLAYERS_${season.replace('-', '_')}`;
    const Lin = loadDataFile(f)[linVar];
    // Una temporada que la lista de loadDataFile aún no conoce (p. ej.
    // data-lineups-2026-2027.js al activarla) se salta en vez de bloquear al bot.
    if (!Lin) continue;
    const Pla = loadDataFile(playersFile)[plaVar];
    assert.ok(Lin && typeof Lin === 'object', `${linVar} must load`);
    assert.ok(Pla && typeof Pla === 'object', `${plaVar} must load`);
""", """    const season = f.match(/data-lineups-(\\d{4}-\\d{4})\\.js/)[1];
    const linVar = `LINEUPS_${season.replace('-', '_')}`;
    const Lin = loadDataFile(f)[linVar];
    // Una temporada que la lista de loadDataFile aún no conoce (p. ej.
    // data-lineups-2026-2027.js al activarla) se salta en vez de bloquear al bot.
    if (!Lin) continue;
    assert.ok(Lin && typeof Lin === 'object', `${linVar} must load`);
"""),
("""    // Invariant 2: every team_id in PLAYERS has a well-formed roster array
    for (const [tid, list] of Object.entries(Pla)) {
      assert.ok(Array.isArray(list) && list.length > 0, `${plaVar} team ${tid} must have a non-empty list`);
      for (const pl of list) {
        assert.equal(typeof pl.n, 'string', `${plaVar} ${tid} player n must be string: ${JSON.stringify(pl)}`);
        for (const k of ['ap', 'st', 'g', 'y', 'rd']) {
          assert.equal(typeof pl[k], 'number', `${plaVar} ${tid} player ${pl.n}: ${k} must be number`);
          assert.ok(pl[k] >= 0, `${plaVar} ${tid} player ${pl.n}: ${k} >= 0`);
        }
        assert.ok(pl.st <= pl.ap, `${plaVar} ${tid} ${pl.n}: starters <= appearances`);
      }
    }
  }
});
""", """  }
});
"""),
])
cut('scripts/tests/test_js_modules.mjs',
    "// build invariant: keys index == exactly the matches with a goal timeline\n",
    "// ensurePlayers se fue en la revisión final de B2", ["MATCH_DETAIL_KEYS"])

# ── test_rediseno_state: el señuelo de la versión, otro <script> de datos que sigue existiendo ──
edit('scripts/tests/test_rediseno_state.mjs', [
("""// El <script> de data-seasons.js lleva la versión de los datos; el de data-matchdetail-keys.js,
// otra, para comprobar que ya no manda.
const scripts = {
  'data-seasons.js': './data-seasons.js?v=20260923j',
  'data-matchdetail-keys.js': './data-matchdetail-keys.js?v=VIEJA',
};
""", """// El <script> de data-seasons.js lleva la versión de los datos; el de data-benjamin.js, otra, para
// comprobar que solo manda la de data-seasons.js (la app anterior la tomaba de data-matchdetail-keys.js,
// que B4 retiró).
const scripts = {
  'data-seasons.js': './data-seasons.js?v=20260923j',
  'data-benjamin.js': './data-benjamin.js?v=VIEJA',
};
"""),
("""test('cada petición perezosa lleva la versión de data-seasons.js, nunca la de data-matchdetail-keys.js', async () => {""",
 """test('cada petición perezosa lleva la versión de data-seasons.js, nunca la de otro <script> de datos', async () => {"""),
])

# ── pytest: fuera las pruebas de los generadores retirados; las salidas de main() ──
cut('scripts/tests/test_pygen_fixes.py',
    "    def test_real_db_no_collisions_any_season(self, tmp_path):\n",
    "\n# ─── Fix 2: substitutions pairing in generate_lineups_js", ["generate_players_js", "test_real_db_output_deterministic"])
cut('scripts/tests/test_pygen_fixes.py',
    "# ─── Fix (2026-06-15): season most/least stats ignore qualifying mini-groups",
    "# ─── Fix (2026-06-15): match-detail/lineup keys mirror the frontend (#11)",
    ["class TestSeasonGoalRecords:", "class TestSeasonTotalsExcludeCups:", "generate_stats_js"])
cut('scripts/tests/test_pygen_fixes.py',
    "    def test_keys_index_skips_dup_keys(self):\n",
    "    def test_lineups_entry_carries_season_group_and_cod(self):", ["generate_matchdetail_keys_js"])
edit('scripts/tests/test_pygen_fixes.py', [
("""    \"\"\"Las claves de MATCH_DETAIL/MATCH_DETAIL_KEYS/LINEUPS usaban hs/as_ crudos;""",
 """    \"\"\"Las claves de MATCH_DETAIL/LINEUPS usaban hs/as_ crudos;"""),
("""        from scripts.generate_js import (generate_matchdetail_js,
                                         generate_matchdetail_keys_js,
                                         generate_lineups_js)
        conn = _synth_conn(); self._seed_goals(conn, 41736, 0)
        for out, what in [(generate_matchdetail_js(conn), "MATCH_DETAIL"),
                          (generate_matchdetail_keys_js(conn), "MATCH_DETAIL_KEYS"),
                          (generate_lineups_js(conn, "2025-2026"), "LINEUPS")]:
""", """        from scripts.generate_js import generate_matchdetail_js, generate_lineups_js
        conn = _synth_conn(); self._seed_goals(conn, 41736, 0)
        for out, what in [(generate_matchdetail_js(conn), "MATCH_DETAIL"),
                          (generate_lineups_js(conn, "2025-2026"), "LINEUPS")]:
"""),
("""        from scripts.generate_js import generate_matchdetail_keys_js, generate_lineups_js
        conn = _synth_conn(); self._seed_goals(conn, 3, 1)
        assert "Home FC|Away FC|3-1" in generate_matchdetail_keys_js(conn)
""", """        from scripts.generate_js import generate_matchdetail_js, generate_lineups_js
        conn = _synth_conn(); self._seed_goals(conn, 3, 1)
        assert "Home FC|Away FC|3-1" in generate_matchdetail_js(conn)
"""),
])
Path('scripts/tests/test_pygen_fixes.py').write_text(Path('scripts/tests/test_pygen_fixes.py').read_text(encoding='utf-8') + '''

# ─── B4 (decisión 1): las salidas del generador, sin los datos retirados ─────

# Lo que B4 retiró: nadie lo lee (el ⚽ de las listas se fue con la app anterior, Récords sale del
# modelo y la plantilla, de las actas), y el generador ya no lo escribe.
_RETIRED = re.compile(r"^data-(matchdetail-keys|stats|players-\\d{4}-\\d{4})\\.js$")


class TestGeneratorOutputs:
    """generate_js.main() con una base sintética en una raíz temporal, como la activación de temporada
    (activate_season.apply_manifest): escribe exactamente sus salidas, ninguna retirada, y otra pasada
    con la misma base no cambia ni un byte, ni la versión ni el pie (C4). Nunca los data-*.js vivos."""

    def _site(self, tmp_path):
        db = tmp_path / "fb.db"
        conn = sqlite3.connect(str(db))
        conn.executescript(_SCHEMA)
        conn.executescript("""
          INSERT INTO seasons (id, name, start_year, end_year, is_current)
            VALUES (1, '2025-2026', 2025, 2026, 1), (2, '2024-2025', 2024, 2025, 0);
          INSERT INTO categories (id, name) VALUES (1, 'BENJAMIN'), (2, 'PREBENJAMIN');
          INSERT INTO groups (id, season_id, category_id, code, name, full_name, phase, island, current_jornada)
            VALUES (1, 1, 1, 'A1', 'Grupo A1', 'SEGUNDA FASE BENJAMIN A-G1', 'Segunda Fase A', 'grancanaria', 'Jornada 1'),
                   (2, 1, 2, 'PG2', 'Grupo 2', 'PREBENJAMIN PRIMERA GRAN CANARIA G-2', 'Liga', 'grancanaria', 'Jornada 1'),
                   (3, 2, 2, 'PG2', 'Grupo 2', 'PREBENJAMIN PRIMERA GRAN CANARIA G-2', 'Liga', 'grancanaria', 'Jornada 1');
          INSERT INTO teams (id, name) VALUES (1, 'Home FC'), (2, 'Away FC');
          INSERT INTO players (id, full_name, norm_name) VALUES (1, 'PEREZ, JUAN', 'perez juan');
          INSERT INTO matches (id, group_id, jornada, date, home_team_id, away_team_id,
                               home_score, away_score, cod_acta)
            VALUES (1, 1, 'Jornada 1', '2025-10-04', 1, 2, 1, 0, 90001),
                   (2, 3, 'Jornada 1', '2024-10-05', 2, 1, 0, 2, 80001);
          INSERT INTO goals (match_id, minute, player_name, running_score, side, type)
            VALUES (1, 10, 'PEREZ, JUAN', '1-0', 'h', 'r');
          INSERT INTO appearances (match_id, team_id, player_id, dorsal, role, goals)
            VALUES (1, 1, 1, 7, 'starter', 1), (2, 1, 1, 7, 'starter', 2);
          INSERT INTO scorers (group_id, player_name, team_id, goals, games)
            VALUES (1, 'PEREZ, JUAN', 1, 1, 1);
        """)
        conn.commit()
        conn.close()
        site = tmp_path / "site"
        site.mkdir()
        (site / "index.html").write_text(
            '<script src="./data-seasons.js?v=20260101"></script>\\n'
            '<span id="legacyUpdated" hidden>Última actualización: 01/01/2026</span>\\n',
            encoding="utf-8",
        )
        (site / "sw.js").write_text("const CACHE_NAME = 'futbolbase-v20260101';\\n", encoding="utf-8")
        return db, site

    def test_main_writes_its_outputs_and_none_retired(self, tmp_path, monkeypatch):
        import scripts.generate_js as generate_js
        db, site = self._site(tmp_path)
        monkeypatch.setattr(generate_js, "PROJECT_ROOT", str(site))
        monkeypatch.setattr(generate_js, "get_connection", lambda: sqlite3.connect(str(db)))
        generate_js.main()
        written = sorted(p.name for p in site.glob("data-*"))
        assert [name for name in written if _RETIRED.match(name)] == [], "el generador escribe datos retirados"
        assert written == [
            "data-benjamin.js", "data-goleadores.js", "data-history.js",
            "data-lineups-2024-2025.js", "data-lineups-2025-2026.js", "data-matchdetail.js",
            "data-prebenjamin.js", "data-season-2024-2025.js", "data-seasons.js",
        ]
        # Otra pasada con la misma base: ni un byte distinto, y sin subir la versión ni el pie (C4).
        index = (site / "index.html").read_text(encoding="utf-8")
        snapshot = generate_js.snapshot_data_files(str(site))
        generate_js.main()
        assert generate_js.snapshot_data_files(str(site)) == snapshot
        assert (site / "index.html").read_text(encoding="utf-8") == index
''', encoding='utf-8')

cut('scripts/tests/test_data_integrity.py',
    "\n\ndef test_generate_players_js_aggregates(tmp_path):", None,
    ["generate_players_js", "def test_generate_players_js_emits_teams_mapping"])

edit('scripts/tests/test_index_bot_contract.py', [
("""    assert len(VERSION_RE.findall(after)) == len(VERSION_RE.findall(before)) >= 11
""", """    # Las 9 de B4 (decisión 1): la hoja, los 7 datos inmediatos y el import de app.js.
    assert len(VERSION_RE.findall(after)) == len(VERSION_RE.findall(before)) == 9
"""),
])

edit('scripts/tests/test_workflows.py', [
("""   outputs: `data-*.js` glob (covers data-seasons.js, data-season-*.js,
   data-matchdetail-keys.js, future files), plus index.html, sw.js
""", """   outputs: `data-*.js` glob (covers data-seasons.js, data-season-*.js,
   data-lineups-*.js, future files), plus index.html, sw.js
"""),
])

# ── pwa-smoke: la app anterior sigue recibiendo lo que pide; la nueva no pide nada retirado ──
edit('scripts/tests/pwa-smoke.mjs', [
("""// Después, un segundo escenario: un despliegue de código sobre el SW de la propia rama (codeDeploy).
""", """// Después, un segundo escenario: un despliegue de código sobre el SW de la propia rama (codeDeploy).
// En los dos, ni la app nueva ni su SW piden los datos que B4 retiró (decisión 3 de B4).
"""),
("""    'data-goleadores.js': js([['GOL_BENJ', []], ['GOL_PREBENJ', []]]),
    'data-matchdetail-keys.js': js([['MATCH_DETAIL_KEYS', {}]]),
    'data-shields.js': js([['SHIELDS', fixture('shields')]]),
    'data-stats.js': js([['STATS', {}]]),
    'data-seasons.js':""", """    'data-goleadores.js': js([['GOL_BENJ', []], ['GOL_PREBENJ', []]]),
    'data-shields.js': js([['SHIELDS', fixture('shields')]]),
    'data-seasons.js':"""),
("""    'data-health.json': { type: 'application/json', body: JSON.stringify(fixture('health')) },
  };
})();
""", """    'data-health.json': { type: 'application/json', body: JSON.stringify(fixture('health')) },
    // Solo para la app anterior: su index.html los nombra y su SW los precachea (B4 los retiró).
    'data-matchdetail-keys.js': js([['MATCH_DETAIL_KEYS', {}]]),
    'data-stats.js': js([['STATS', {}]]),
  };
})();
"""),
("""  if (kind === 'players') return js([[`PLAYERS_${from}_${to}`, {}], [`TEAMS_${from}_${to}`, {}]]);
  return null;
}
""", """  if (kind === 'players') return js([[`PLAYERS_${from}_${to}`, {}], [`TEAMS_${from}_${to}`, {}]]);
  return null;
}
// Los datos que B4 retiró (decisiones 1 y 3 de B4). Solo los pide la app anterior (su index.html los
// nombra, su SW los precachea y su portada pide las fichas de jugadores), y el mundo se los sigue
// sirviendo; la app nueva y su SW, nunca. Cada petición se apunta con su ?v=: las del SW nuevo, y las
// de la app nueva con él al mando, llevan la versión publicada.
const RETIRED = /^data-(matchdetail-keys|stats|players-\\d{4}-\\d{4})\\.js$/;
const retiredAsked = [];
"""),
("""  const url = new URL(req.url, 'http://portal.test');
  const file = decodeURIComponent(url.pathname === '/' ? 'index.html' : url.pathname.slice(1));
  const fromWorker = req.headers['sec-fetch-dest'] === 'empty';
  const isConfig = file === 'src/config.js';
""", """  const url = new URL(req.url, 'http://portal.test');
  const file = decodeURIComponent(url.pathname === '/' ? 'index.html' : url.pathname.slice(1));
  if (RETIRED.test(file)) retiredAsked.push(`${file}?v=${url.searchParams.get('v')}`);
  const fromWorker = req.headers['sec-fetch-dest'] === 'empty';
  const isConfig = file === 'src/config.js';
"""),
("""  const requests = [];
  const pending = new Map();
  let lastRequest = 0;
""", """  const requests = [];
  const pending = new Map();
  let lastRequest = 0;
  const retired = [];        // las peticiones de datos retirados: ninguna, las dos versiones son la app nueva
"""),
("""    const url = new URL(req.url, 'http://portal.test');
    const file = decodeURIComponent(url.pathname === '/' ? 'index.html' : url.pathname.slice(1));
    if (down) { req.socket.destroy(); return; }
""", """    const url = new URL(req.url, 'http://portal.test');
    const file = decodeURIComponent(url.pathname === '/' ? 'index.html' : url.pathname.slice(1));
    if (RETIRED.test(file)) retired.push(req.url);
    if (down) { req.socket.destroy(); return; }
"""),
("""    whole('con el SW de «b»', o.seen, '"b"');
    await o.page.close();
    console.log('PASS: despliegue de código sobre el SW de la rama: la 1.ª apertura es la versión anterior; la 2.ª, con su revalidación de state.js fallida, y la 3.ª, sin conexión, la nueva entera (su hoja y sus módulos, sin el aviso del arranque); con el SW nuevo, también');
""", """    whole('con el SW de «b»', o.seen, '"b"');
    await o.page.close();
    assert.deepEqual(retired, [], 'despliegue de código: la app nueva pide datos retirados (decisión 3 de B4)');
    console.log('PASS: despliegue de código sobre el SW de la rama: la 1.ª apertura es la versión anterior; la 2.ª, con su revalidación de state.js fallida, y la 3.ª, sin conexión, la nueva entera (su hoja y sus módulos, sin el aviso del arranque); con el SW nuevo, también, y sin pedir datos retirados');
"""),
("""  assert.equal(await page.locator('#contenido .error-box').count(), 0, 'Explorar sin conexión: sin cajas de error');
  assert.deepEqual(errors, []);
  console.log(`PASS: de la app anterior (su SW real) al rediseño, con datos congelados: la 1.ª apertura es la anterior; sin conexión a medias, el aviso con «Reintentar»; la 2.ª y la 3.ª, la nueva con acta.css y sin mezclar módulos; con ${expected}, la portada, Jornada y el buscador de Explorar funcionan sin conexión`);
""", """  assert.equal(await page.locator('#contenido .error-box').count(), 0, 'Explorar sin conexión: sin cajas de error');
  assert.deepEqual(errors, []);
  // Los datos retirados (decisión 3 de B4): la app anterior los pide y el mundo se los da; ni el SW
  // nuevo ni la app nueva con él al mando piden ninguno (llevarían la versión publicada).
  assert.ok(retiredAsked.some((asked) => asked.endsWith(`?v=${OLD_VERSION}`)), `la app anterior pide sus datos: ${JSON.stringify(retiredAsked)}`);
  assert.deepEqual(retiredAsked.filter((asked) => asked.endsWith(`?v=${PUBLISHED}`)), [], 'la app nueva pide datos retirados');
  console.log(`PASS: de la app anterior (su SW real) al rediseño, con datos congelados: la 1.ª apertura es la anterior; sin conexión a medias, el aviso con «Reintentar»; la 2.ª y la 3.ª, la nueva con acta.css y sin mezclar módulos; con ${expected}, la portada, Jornada y el buscador de Explorar funcionan sin conexión, y ni la app nueva ni su SW piden los datos retirados`);
"""),
])
print('pruebas de la Tarea 1: 7 inmediatos, los retirados no vuelven, las salidas del generador y pwa-smoke')
PY
```
Esperado:
```text
pruebas de la Tarea 1: 7 inmediatos, los retirados no vuelven, las salidas del generador y pwa-smoke
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd /home/manolo/claude/futbol-base
python3 -m pytest scripts/tests/test_pygen_fixes.py scripts/tests/test_index_bot_contract.py scripts/tests/test_data_integrity.py -q 2>&1 | grep -E '^E +(AssertionError|assert [0-9])|^FAILED|^[0-9]+ (passed|failed)' | sed -E 's/ in [0-9.]+s$//'
node --test scripts/tests/test_rediseno_index.mjs 2>&1 | grep -E '^not ok|^# (tests|pass|fail)' | sed -E 's/^not ok [0-9]+ - /not ok: /'
node scripts/tests/pwa-smoke.mjs 2>&1 | grep -E '^(PASS|AssertionError)'
```
Esperado: el generador todavía escribe los retirados, `index.html` lleva 11 `?v=` y 9 inmediatos, y el SW nuevo los precachea con la versión publicada.
```text
E       AssertionError: el generador escribe datos retirados
E       assert 11 == 9
FAILED scripts/tests/test_pygen_fixes.py::TestGeneratorOutputs::test_main_writes_its_outputs_and_none_retired
FAILED scripts/tests/test_index_bot_contract.py::test_bump_cache_version_sube_todas_las_marcas_y_nada_mas
2 failed, 58 passed
not ok: datos inmediatos: los siete que lee la portada, en el orden de antes (decisión 5 de B2; B4, decisión 1), y después el arranque
not ok: los datos retirados en B4 no vuelven: ni en index.html, ni en sw.js, ni en el repositorio, ni en los mundos de las pruebas
# tests 7
# pass 5
# fail 2
AssertionError [ERR_ASSERTION]: la app nueva pide datos retirados
```

- [ ] **Step 3: Write minimal implementation**

El generador sin los tres, `index.html` y `sw.js` con los 7, `fixture-site.mjs` sin servirlos y el comentario de `fetch-fiflp.yml`; después, los siete ficheros fuera:

```bash
cd /home/manolo/claude/futbol-base
python3 - <<'PY'
from pathlib import Path


def edit(path, pairs):
    """Sustituye cada texto (que tiene que aparecer n veces, 1 si no se dice) o se para sin escribir."""
    p = Path(path)
    s = p.read_text(encoding='utf-8')
    for old, new, *n in pairs:
        assert s.count(old) == (n[0] if n else 1), (path, old[:80], s.count(old))
        s = s.replace(old, new)
    p.write_text(s, encoding='utf-8')


def cut(path, start, end, must):
    """Quita desde `start` (incluido) hasta `end` (excluido; None: hasta el final), cada uno una sola vez,
    y comprueba que lo quitado contiene `must`; si no, se para sin escribir."""
    p = Path(path)
    s = p.read_text(encoding='utf-8')
    assert s.count(start) == 1, (path, start[:80], s.count(start))
    i = s.index(start)
    j = len(s) if end is None else s.index(end, i)
    assert end is None or s.count(end) == 1, (path, end[:80], s.count(end))
    assert all(m in s[i:j] for m in must), (path, start[:80], must)
    p.write_text(s[:i] + s[j:], encoding='utf-8')


# ── generate_js.py: fuera los tres generadores, su ayudante y sus llamadas ──
G = 'scripts/generate_js.py'
cut(G, "# Season highlight stats (most goals scored / least conceded) must ignore the\n",
    "def get_current_jornada_matches(conn, group_id, current_jornada):",
    ["_MIN_GAMES_FOR_SEASON_STATS = 10", "def _season_goal_records(conn, group_meta):"])
cut(G, "def generate_matchdetail_keys_js(conn):\n", "def _season_const_suffix(season_name):",
    ['"const MATCH_DETAIL_KEYS="'])
cut(G, "def generate_players_js(conn, season_name):\n", "def generate_shields_js(conn):",
    ['"const PLAYERS_"', '"const TEAMS_"'])
cut(G, "def generate_stats_js(conn):\n", "def get_historical_jornadas(conn, group_id, include_details=False):",
    ['"const STATS="', "_season_goal_records(conn, group_meta)"])
edit(G, [
("""Reads futbolbase.db and produces:
  - data-benjamin.js
  - data-prebenjamin.js
  - data-history.js
  - data-matchdetail.js
  - data-goleadores.js
  - data-shields.js
""", """Reads futbolbase.db and produces:
  - data-benjamin.js
  - data-prebenjamin.js
  - data-history.js
  - data-matchdetail.js
  - data-goleadores.js
  - data-seasons.js and data-season-<S>.js (the past seasons)
  - data-lineups-<S>.js (the seasons with actas)
data-shields.js is maintained by hand. Plan B4 (decisión 1) retired
data-matchdetail-keys.js, data-stats.js and data-players-<S>.js: nobody read
them (test_pygen_fixes.py::TestGeneratorOutputs keeps them out).
"""),
("""    \"\"\"Normalizer for the TEAMS_<S> key map (contrato C1).
""", """    \"\"\"Normalizer for the club key (contrato C1): db.get_or_create_team and, in
    the browser, src/state.js normalizeForTeamsMapping (until B4 it also keyed
    TEAMS_<S> in data-players-<S>.js, now retired).
"""),
("""    print("4. data-matchdetail.js")
    write_file("data-matchdetail.js", generate_matchdetail_js(conn))
    print("4b. data-matchdetail-keys.js")
    write_file("data-matchdetail-keys.js", generate_matchdetail_keys_js(conn))

    print("5. data-goleadores.js")
    write_file("data-goleadores.js", generate_goleadores_js(conn))

    print("6. data-shields.js  [skipped - maintained manually]")

    print("7. data-stats.js")
    write_file("data-stats.js", generate_stats_js(conn))

    print("8. data-seasons.js")
    seasons_js, seasons_list = generate_seasons_js(conn)
    write_file("data-seasons.js", seasons_js)

    print("9. data-season-*.js (per-season lazy-loaded files)")
""", """    print("4. data-matchdetail.js")
    write_file("data-matchdetail.js", generate_matchdetail_js(conn))

    print("5. data-goleadores.js")
    write_file("data-goleadores.js", generate_goleadores_js(conn))

    print("6. data-shields.js  [skipped - maintained manually]")

    print("7. data-seasons.js")
    seasons_js, seasons_list = generate_seasons_js(conn)
    write_file("data-seasons.js", seasons_js)

    print("8. data-season-*.js (per-season lazy-loaded files)")
"""),
("""    print("\\n10. data-lineups-*.js / data-players-*.js (actas)")
""", """    print("\\n9. data-lineups-*.js (actas)")
"""),
("""        write_file(f"data-lineups-{sname}.js", generate_lineups_js(conn, sname))
        print(f"  data-players-{sname}.js")
        write_file(f"data-players-{sname}.js", generate_players_js(conn, sname))

    print("\\n11. Cache version (only if data changed — C4)")
""", """        write_file(f"data-lineups-{sname}.js", generate_lineups_js(conn, sname))

    print("\\n10. Cache version (only if data changed — C4)")
"""),
])

# ── index.html y sw.js: los 7 inmediatos ──
edit('index.html', [
("""  <!-- Datos inmediatos: los mismos nueve de antes del corte y en el mismo orden (Plan B2,
       decisión 5). defer, carga perezosa y la baja de data-matchdetail-keys.js son de B4. -->
""", """  <!-- Datos inmediatos: los siete que lee la portada, en el orden de antes del corte (Plan B2,
       decisión 5). B4 retiró los dos que ya no leía nadie (decisión 1 de B4). -->
"""),
("""  <script src="./data-matchdetail-keys.js?v=20260925b"></script>
""", ""),
("""  <script src="./data-stats.js?v=20260925b"></script>
""", ""),
])
edit('sw.js', [
("""  './data-matchdetail-keys.js',
""", ""),
("""  './data-stats.js',
""", ""),
])

# ── fixture-site: el mundo es la app nueva (decisión 3) ──
edit('scripts/tests/fixture-site.mjs', [
("""    'data-matchdetail-keys.js': js([['MATCH_DETAIL_KEYS', {}]]),
""", ""),
("""    'data-stats.js': js([['STATS', {}]]),
""", ""),
])

# ── fetch-fiflp.yml: el comentario de lo que reescribe el generador (el glob no cambia) ──
edit('.github/workflows/fetch-fiflp.yml', [
("""          # generate_js.py reescribe TODOS los data-*.js (incl.
          # data-matchdetail-keys.js, data-seasons.js, data-season-*.js),
""", """          # generate_js.py reescribe TODOS los data-*.js (incl.
          # data-seasons.js, data-season-*.js y data-lineups-*.js),
"""),
])
print('generate_js.py sin los tres generadores; index.html y sw.js con los 7 inmediatos; fixture-site y fetch-fiflp.yml')
PY
git rm -q data-matchdetail-keys.js data-stats.js data-players-2021-2022.js data-players-2022-2023.js data-players-2023-2024.js data-players-2024-2025.js data-players-2025-2026.js
grep -c 'generate_stats_js\|generate_players_js\|generate_matchdetail_keys_js\|_season_goal_records' scripts/generate_js.py || true
```
Esperado: el mensaje y `0`.
```text
generate_js.py sin los tres generadores; index.html y sw.js con los 7 inmediatos; fixture-site y fetch-fiflp.yml
0
```

- [ ] **Step 4: Run test to verify it passes**

```bash
cd /home/manolo/claude/futbol-base
python3 -m pytest scripts/tests/test_pygen_fixes.py scripts/tests/test_index_bot_contract.py scripts/tests/test_data_integrity.py -q 2>&1 | tail -1 | sed -E 's/ in [0-9.]+s$//'
node --test scripts/tests/test_rediseno_index.mjs scripts/tests/test_sw_fixes.mjs scripts/tests/test_js_modules.mjs scripts/tests/test_rediseno_state.mjs 2>&1 | grep -E '^# (tests|pass|fail)'
```
Esperado:
```text
60 passed
# tests 54
# pass 54
# fail 0
```

- [ ] **Step 5: El bot tras B4, ensayado en una copia (foco de revisión 1)**

`generate_js.main()`, como lo ejecuta el bot, en una copia del árbol con la base del repositorio (`futbolbase.db`, con los datos de los `data-*.js` comiteados): no vuelve a crear ningún retirado, los demás `data-*.js` salen iguales byte a byte y, sin cambios de datos, no sube la versión (`index.html` y `sw.js`, intactos):

```bash
cd /home/manolo/claude/futbol-base
: "${S:?falta S: la línea export S= de la cabecera}"
rm -rf "$S/copia-bot" && mkdir -p "$S/copia-bot"
tar -cf - --exclude=./.git --exclude=./node_modules . | tar -xf - -C "$S/copia-bot"
(cd "$S/copia-bot" && python3 -c "import sys; sys.path.insert(0, 'scripts'); import generate_js; generate_js.main()" > generate.log 2>&1)
grep -E '^[0-9]+\.|^ +data-\*|^Done' "$S/copia-bot/generate.log"
python3 - "$S/copia-bot" <<'PY'
import filecmp
import re
import sys
from pathlib import Path

copy, repo = Path(sys.argv[1]), Path('.')
retired = re.compile(r'^data-(matchdetail-keys|stats|players-\d{4}-\d{4})\.js$')
names = sorted(p.name for p in copy.glob('data-*.js'))
print('salidas como las del repo:', names == sorted(p.name for p in repo.glob('data-*.js')))
print('retirados en la copia:', [n for n in names if retired.match(n)])
print('distintos del repo:', [n for n in names + ['index.html', 'sw.js'] if not filecmp.cmp(copy / n, repo / n, shallow=False)])
print(len(names), 'data-*.js')
PY
rm -rf "$S/copia-bot"
```
Esperado: los diez pasos, sin ninguno de los retirados; «sin cambios», y ni un fichero distinto (17 `data-*.js` el 26/09/2026; son los que haya en el repositorio ese día). Si sale algo en «distintos del repo», el bot publicaría un cambio que no viene de los datos: se para y se investiga antes de seguir.
```text
1. data-benjamin.js
2. data-prebenjamin.js
3. data-history.js
4. data-matchdetail.js
5. data-goleadores.js
6. data-shields.js  [skipped - maintained manually]
7. data-seasons.js
8. data-season-*.js (per-season lazy-loaded files)
9. data-lineups-*.js (actas)
10. Cache version (only if data changed — C4)
  data-*.js sin cambios — no se bumpea ?v= / footer / CACHE_NAME (C4)
Done!
salidas como las del repo: True
retirados en la copia: []
distintos del repo: []
17 data-*.js
```

- [ ] **Step 6: Suites completas y los tres smoke**

```bash
cd /home/manolo/claude/futbol-base
python3 -m pytest scripts/tests/ -q 2>&1 | tail -1
node --test scripts/tests/test_*.mjs 2>&1 | grep -E '^# (tests|pass|fail)'
```
Esperado:
- pytest: `470 passed, 5 skipped`, sin `failed` (478 − 9 + 1: fuera las dos de la base real y la de claves de `test_pygen_fixes`, las cuatro de `STATS` y las dos de `test_data_integrity`; nueva, la de las salidas del generador).
- node: el recuento anterior, sin fallos (729 → 729: fuera la de `data-matchdetail-keys.js` de `test_js_modules`; nueva, la de que no vuelven).

Los smoke, con el DOM de la portada 126 bytes más pequeño y tres pasadas seguidas en verde (21 líneas PASS cada una y ninguna otra); las dos de `pwa-smoke` dicen ya lo de los datos retirados:

```bash
cd /home/manolo/claude/futbol-base
: "${S:?falta S: la línea export S= de la cabecera}"
node scripts/tests/render-smoke.mjs | sed "s/(DOM $(( $(cat "$S/dom-base.txt") - 126 )) bytes)/(DOM de la base menos 126 bytes)/"
for i in 1 2 3; do
  out=$({ node scripts/tests/render-smoke.mjs && node scripts/tests/interaction-smoke.mjs && node scripts/tests/pwa-smoke.mjs; } 2>&1 | grep -v '^PWA fixture HTTP 404 /escudos/s/')
  echo "pasada $i: $(grep -c '^PASS' <<<"$out") PASS; otras líneas: $(grep -vc '^PASS' <<<"$out")"
done
grep -E '^PASS: (de la app anterior|despliegue de código)' <<<"$out"
```
Esperado:
```text
PASS: render smoke OK — Mi equipo en estado D (DOM de la base menos 126 bytes)
PASS: estado D con las fixtures y el reloj del 23/09/2026: «Temporada 2026/27», «Así terminó 2025/26», «Verano» y la clasificación final
pasada 1: 21 PASS; otras líneas: 0
pasada 2: 21 PASS; otras líneas: 0
pasada 3: 21 PASS; otras líneas: 0
PASS: de la app anterior (su SW real) al rediseño, con datos congelados: la 1.ª apertura es la anterior; sin conexión a medias, el aviso con «Reintentar»; la 2.ª y la 3.ª, la nueva con acta.css y sin mezclar módulos; con futbolbase-v20991231a, la portada, Jornada y el buscador de Explorar funcionan sin conexión, y ni la app nueva ni su SW piden los datos retirados
PASS: despliegue de código sobre el SW de la rama: la 1.ª apertura es la versión anterior; la 2.ª, con su revalidación de state.js fallida, y la 3.ª, sin conexión, la nueva entera (su hoja y sus módulos, sin el aviso del arranque); con el SW nuevo, también, y sin pedir datos retirados
```

- [ ] **Step 7: Commit**

Los siete borrados ya están en el índice (`git rm` del paso 3):

```bash
cd /home/manolo/claude/futbol-base
git add scripts/generate_js.py index.html sw.js .github/workflows/fetch-fiflp.yml scripts/tests/fixture-site.mjs scripts/tests/pwa-smoke.mjs scripts/tests/test_rediseno_index.mjs scripts/tests/test_sw_fixes.mjs scripts/tests/test_js_modules.mjs scripts/tests/test_rediseno_state.mjs scripts/tests/test_pygen_fixes.py scripts/tests/test_data_integrity.py scripts/tests/test_index_bot_contract.py scripts/tests/test_workflows.py
git commit -F - <<'EOF'
feat(rediseño): fuera los datos que ya no lee nadie: data-matchdetail-keys.js, data-stats.js y data-players-<S>.js (B4, tarea 1)

- generate_js.py deja de escribirlos: fuera generate_matchdetail_keys_js,
  generate_stats_js, generate_players_js y _season_goal_records, con sus
  pruebas (decisión 1). Los siete ficheros, borrados.
- index.html, con 7 datos inmediatos y 9 marcas ?v=, y STATIC_ASSETS, sin
  los dos retirados. Los data-*.js del precache son exactamente los
  inmediatos de index.html (test_sw_fixes).
- No vuelven: ni en index.html, ni en sw.js, ni en el repositorio, ni en
  los mundos de fixture-site (test_rediseno_index); y generate_js.main()
  escribe exactamente sus salidas, y otra pasada con la misma base no
  cambia nada (test_pygen_fixes, C4).
- fixture-site ya no los sirve; pwa-smoke se los sigue sirviendo a la app
  anterior y comprueba que ni la app nueva ni su SW piden ninguno
  (decisión 3).

El bot, ensayado en una copia con la base del repo: no los vuelve a crear,
los demás data-*.js salen iguales byte a byte y no sube la versión.

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01Sg56KK3oZgo8Ye7Snj6wG9
EOF
git show --stat --oneline HEAD | tail -1
```
Esperado: `21 files changed, 149 insertions(+), 655 deletions(-)`. Son siete borrados (los dos inmediatos y los cinco `data-players-*.js`), y modificados el generador, `index.html`, `sw.js`, `fetch-fiflp.yml`, `fixture-site.mjs`, `pwa-smoke.mjs` y ocho pruebas.

---

### Task 2: `touch_footer` y `scripts/publicar.py`: la versión de una publicación, sin tocar el pie (decisión 10)

La publicación de cada fase sube la versión con un guion del repositorio, que sustituye al Python en línea del paso 10 de B3, y el bot sigue como hoy.

**Contexto**
- **Hoy** (`generate_js.py`, líneas 750-803 tras la Tarea 1): `_next_version(index_content)` da `AAAAMMDD` o, si `index.html` ya lleva la del día, la letra siguiente (tope `z`), con `date.today()` (la del runner de GitHub, en UTC); `bump_cache_version(root=None)` sube todas las `?v=`, el literal «Última actualización» y `CACHE_NAME` (línea 1 de `sw.js`, `count=1`) a la misma cadena. Lo llama `bump_if_changed` solo si cambió algún `data-*.js` (C4). Ninguna prueba nombra `touch_footer` (no existe).
- **La spec (§5.5)**: el despliegue sube a la vez `CACHE_NAME` y todas las `?v=` y **no toca** «Última actualización», que alimenta `lastDataChange` en `data-health.json` (`source_health.py:66-73` la lee de `index.html`); `bump_cache_version()` gana `touch_footer`, `True` por defecto, y el test comprueba los dos caminos.
- **La versión de una publicación** (decisión 158 de B3, que hoy es Python en línea en el paso 10 de B3): la fecha UTC, **estrictamente mayor** que la vigente, la primera `?v=` de `index.html` (§10); si no lo es (la del día ya está publicada o la vigente es de un día posterior), la letra siguiente de la vigente, y se para en la `z`. Con cadenas `\d{8}[a-z]?`, el orden alfabético es el de las versiones: `20260925` < `20260925b` < … < `20260925z` < `20260926`.
- **`CODIGO`**: el mismo guion lo recalcula con `codigo.main(["--root", root])` y devuelve lo que devuelve (B3 dejó avisado que `activate_season.py:182` no lo comprueba). B4 no toca `src/` ni `acta.css`: al publicar B4 sale `be0acbf3`, el de hoy.
- **Salida de `publicar.py`**, dos líneas: `versión <V> (antes, <W>): <N> ?v= en index.html y futbolbase-v<V> en sw.js; «Última actualización: …», sin tocar` y la de `codigo.py` (`CODIGO <h>: la huella de acta.css y src/*.js, en index.html`). Los avisos por fichero de `bump_cache_version` no salen (van a un `StringIO`). Sin marcas completas, o con la `z`, sale con 1 sin escribir nada.
- **`docs/rediseno-rebase.md`**: la línea 3 dice que la rama «no se fusiona en `main` hasta B5», y la 13, que la subida conjunta es «del despliegue de B4 y B5»; desde B2 cada fase se publica al terminarla. Gana una sección «Publicar una fase» con `publicar.py`; la última línea («El PR borrador hacia `main` vuelve a lanzar `tests.yml`») pasa al CI lanzado a mano (el PR #2 se cerró al publicar B2); y «Qué choca y qué se queda», que manda quedarse con el `data-*.js` de `main`, gana la excepción de los que la rama retira a propósito (los de la Tarea 1: `git rm`, o volverían).
- **Pruebas** (`test_publicar.py`, nuevo, 18): árboles sintéticos con las marcas del bot y `CODIGO`, y una copia del `index.html` y el `sw.js` reales (con `acta.css` y `src/`, de los que sale su `CODIGO`). El día de `publicar.py` se fija sustituyendo `publicar._today_utc`; las del bot usan `date.today()`, como las de hoy (`TestConditionalBump`).

**Files:**
- Create: `scripts/publicar.py`, `scripts/tests/test_publicar.py`
- Modify: `scripts/generate_js.py`, `docs/rediseno-rebase.md`

**Interfaces:**
- Consumes: `codigo.main(argv)`, `codigo.huella(root)` y `codigo.CODIGO_RE` (`scripts/codigo.py`); `generate_js.snapshot_data_files` y `generate_js.bump_if_changed` (las pruebas del bot).
- Produces:

```python
# scripts/generate_js.py
def _next_version(index_content, today=None) -> str        # today: datetime.date; por defecto, date.today()
def bump_cache_version(root=None, touch_footer=True, version=None) -> None
    # version: la cadena de la publicación, \d{8}[a-z]? (ValueError sin escribir si no); None: _next_version
# scripts/publicar.py
def next_publish_version(current: str, today_utc: str) -> str   # pura; ValueError con la z o sin la forma
def main(argv=None) -> int                                       # --root R (por defecto, la raíz del repo)
# python3 scripts/publicar.py  →  «versión <V> (antes, <W>): …, sin tocar» y la línea de CODIGO
```

- [ ] **Step 1: Write the failing test**

Crear `scripts/tests/test_publicar.py`:

```python
"""Plan B4, tarea 2: la subida de versión de una publicación (spec §5.5; decisión 10 de B4).

Cada fase del rediseño se publica al terminarla. La publicación sube a la vez las ?v= de index.html y
CACHE_NAME de sw.js, con la misma cadena, y CODIGO, sin tocar «Última actualización», que es la
fecha de los datos (source_health la publica como lastDataChange). La versión es la fecha UTC y
estrictamente mayor que la vigente. El bot sigue como hoy: bump_cache_version sin argumentos mueve el
pie. Árboles sintéticos, y una copia del index.html y el sw.js reales: nunca los data-*.js vivos.
"""
import re
import shutil
import sys
from datetime import date
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "scripts"))
import codigo  # noqa: E402
import generate_js  # noqa: E402
import publicar  # noqa: E402

VERSION_RE = re.compile(r"\?v=(\d{8}[a-z]?)")
FOOTER = "Última actualización: 01/09/2026"


def _tree(tmp_path, version="20260925b"):
    """index.html y sw.js con las marcas del bot, CODIGO y el código del que sale su huella."""
    (tmp_path / "src").mkdir()
    (tmp_path / "src" / "app.js").write_text("export function start() {}\n", encoding="utf-8")
    (tmp_path / "acta.css").write_text("body { margin: 0; }\n", encoding="utf-8")
    (tmp_path / "index.html").write_text(
        f'<link rel="stylesheet" href="./acta.css?v={version}">\n'
        f'<span id="legacyUpdated" hidden>{FOOTER}</span>\n'
        f'<script defer src="./data-seasons.js?v={version}"></script>\n'
        "<script type=\"module\">\n"
        "  const CODIGO = '00000000';\n"
        f"  import('./src/app.js?v={version}');\n"
        "</script>\n",
        encoding="utf-8",
    )
    (tmp_path / "sw.js").write_text(
        f"const CACHE_NAME = 'futbolbase-v{version}';\nconst OFFLINE_URL = './index.html';\n", encoding="utf-8")
    return tmp_path


@pytest.mark.parametrize("current, today, want", [
    ("20260925b", "20260926", "20260926"),     # vigente de un día anterior: la fecha del día
    ("20260926", "20260926", "20260926b"),     # vigente de hoy: la letra siguiente
    ("20260926b", "20260926", "20260926c"),
    ("20260927", "20260926", "20260927b"),     # vigente de un día posterior: nunca retrocede
    ("20260927c", "20260926", "20260927d"),
    ("20260925z", "20260926", "20260926"),     # con la z, pero de un día anterior: la fecha del día
], ids=["de-ayer", "de-hoy", "de-hoy-b", "posterior", "posterior-c", "z-de-ayer"])
def test_la_version_de_una_publicacion_es_estrictamente_mayor(current, today, want):
    assert publicar.next_publish_version(current, today) == want
    assert want > current


@pytest.mark.parametrize("current, today", [
    ("20260926z", "20260926"), ("20260927z", "20260926"), ("2026092", "20260926"), ("20260926", "hoy"),
], ids=["z-de-hoy", "z-posterior", "vigente-sin-forma", "hoy-sin-forma"])
def test_sin_version_posible_se_para(current, today):
    with pytest.raises(ValueError):
        publicar.next_publish_version(current, today)


def test_bump_cache_version_sin_tocar_el_pie(tmp_path):
    site = _tree(tmp_path)
    before = (site / "index.html").read_text(encoding="utf-8")
    generate_js.bump_cache_version(str(site), touch_footer=False, version="20260930")
    after = (site / "index.html").read_text(encoding="utf-8")
    assert VERSION_RE.findall(after) == ["20260930"] * 3
    assert FOOTER in after
    assert after == before.replace("20260925b", "20260930")
    assert (site / "sw.js").read_text(encoding="utf-8").splitlines()[0] == "const CACHE_NAME = 'futbolbase-v20260930';"


def test_bump_cache_version_del_bot_mueve_el_pie(tmp_path):
    # Sin argumentos, como la llama bump_if_changed: la versión del día y el pie, a hoy.
    site = _tree(tmp_path)
    generate_js.bump_cache_version(str(site))
    after = (site / "index.html").read_text(encoding="utf-8")
    today = date.today()
    assert set(VERSION_RE.findall(after)) == {today.strftime("%Y%m%d")}
    assert f"Última actualización: {today.strftime('%d/%m/%Y')}" in after


def test_bump_cache_version_rechaza_una_version_sin_la_forma_del_bot(tmp_path):
    site = _tree(tmp_path)
    before = (site / "index.html").read_text(encoding="utf-8")
    with pytest.raises(ValueError):
        generate_js.bump_cache_version(str(site), touch_footer=False, version="b4")
    assert (site / "index.html").read_text(encoding="utf-8") == before


def test_next_version_con_el_dia_del_bot():
    day = date(2026, 9, 26)
    assert generate_js._next_version('<script src="./a.js?v=20260925b">', day) == "20260926"
    assert generate_js._next_version('<script src="./a.js?v=20260926">', day) == "20260926b"
    assert generate_js._next_version('<script src="./a.js?v=20260926b">', day) == "20260926c"
    assert generate_js._next_version('<script src="./a.js?v=20260926z">', day) == "20260926z"


def test_el_bot_sigue_moviendo_el_pie_cuando_cambian_los_datos(tmp_path):
    site = _tree(tmp_path)
    (site / "data-foo.js").write_text("const FOO=1;\n", encoding="utf-8")
    before = generate_js.snapshot_data_files(str(site))
    (site / "data-foo.js").write_text("const FOO=2;\n", encoding="utf-8")
    assert generate_js.bump_if_changed(before, str(site)) is True
    assert f"Última actualización: {date.today().strftime('%d/%m/%Y')}" in (site / "index.html").read_text(encoding="utf-8")


def test_publicar_sube_las_marcas_y_codigo_sin_tocar_el_pie(tmp_path, monkeypatch, capsys):
    site = _tree(tmp_path)
    monkeypatch.setattr(publicar, "_today_utc", lambda: "20260925")
    assert publicar.main(["--root", str(site)]) == 0
    index = (site / "index.html").read_text(encoding="utf-8")
    assert VERSION_RE.findall(index) == ["20260925c"] * 3
    assert FOOTER in index
    assert f"const CODIGO = '{codigo.huella(site)}';" in index
    assert (site / "sw.js").read_text(encoding="utf-8").splitlines()[0] == "const CACHE_NAME = 'futbolbase-v20260925c';"
    assert capsys.readouterr().out.splitlines() == [
        f"versión 20260925c (antes, 20260925b): 3 ?v= en index.html y futbolbase-v20260925c en sw.js; «{FOOTER}», sin tocar",
        f"CODIGO {codigo.huella(site)}: la huella de acta.css y src/*.js, en index.html",
    ]


def test_publicar_se_para_en_la_z_sin_escribir(tmp_path, monkeypatch, capsys):
    site = _tree(tmp_path, version="20260925z")
    before = [(site / name).read_text(encoding="utf-8") for name in ("index.html", "sw.js")]
    monkeypatch.setattr(publicar, "_today_utc", lambda: "20260925")
    assert publicar.main(["--root", str(site)]) == 1
    assert [(site / name).read_text(encoding="utf-8") for name in ("index.html", "sw.js")] == before
    assert capsys.readouterr().out.strip() == "la versión 20260925z ya no admite otra letra: nada escrito"


def test_publicar_sobre_una_copia_del_arbol_solo_cambia_las_marcas(tmp_path, monkeypatch):
    # El index.html y el sw.js reales, con el código del que sale su CODIGO: solo cambian las ?v= y
    # CACHE_NAME (CODIGO ya es la huella del árbol, test_rediseno_index.mjs), nunca el pie ni el resto.
    for name in ("index.html", "sw.js", "acta.css"):
        shutil.copy(ROOT / name, tmp_path / name)
    shutil.copytree(ROOT / "src", tmp_path / "src")
    before = (tmp_path / "index.html").read_text(encoding="utf-8")
    sw_before = (tmp_path / "sw.js").read_text(encoding="utf-8")
    monkeypatch.setattr(publicar, "_today_utc", lambda: "20991231")
    assert publicar.main(["--root", str(tmp_path)]) == 0
    after = (tmp_path / "index.html").read_text(encoding="utf-8")
    assert VERSION_RE.sub("", after) == VERSION_RE.sub("", before)
    assert set(VERSION_RE.findall(after)) == {"20991231"}
    assert len(VERSION_RE.findall(after)) == len(VERSION_RE.findall(before))
    sw = (tmp_path / "sw.js").read_text(encoding="utf-8")
    assert sw.splitlines()[0] == "const CACHE_NAME = 'futbolbase-v20991231';"
    assert sw.splitlines()[1:] == sw_before.splitlines()[1:]
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd /home/manolo/claude/futbol-base
python3 -m pytest scripts/tests/test_publicar.py -q 2>&1 | grep -E '^E +ModuleNotFoundError|^ERROR|^[0-9]+ error' | sed -E 's/ in [0-9.]+s$//'
```
Esperado: todavía no hay `publicar.py`.
```text
E   ModuleNotFoundError: No module named 'publicar'
ERROR scripts/tests/test_publicar.py
1 error
```

- [ ] **Step 3: Write minimal implementation**

`touch_footer` y `version` en `bump_cache_version`, el día en `_next_version`, y la publicación en `docs/rediseno-rebase.md` (el bloque va entre cuatro acentos graves porque el texto del documento lleva un bloque de tres):

````bash
cd /home/manolo/claude/futbol-base
python3 - <<'PY'
from pathlib import Path


def edit(path, pairs):
    """Sustituye cada texto (que tiene que aparecer n veces, 1 si no se dice) o se para sin escribir."""
    p = Path(path)
    s = p.read_text(encoding='utf-8')
    for old, new, *n in pairs:
        assert s.count(old) == (n[0] if n else 1), (path, old[:80], s.count(old))
        s = s.replace(old, new)
    p.write_text(s, encoding='utf-8')


edit('scripts/generate_js.py', [
("""def _next_version(index_content):
    \"\"\"New cache-bust version string: YYYYMMDD, or YYYYMMDD + next letter
    suffix (b, c, ...) if index.html already carries today's version.\"\"\"
    today = date.today().strftime("%Y%m%d")
""", """def _next_version(index_content, today=None):
    \"\"\"New cache-bust version string: YYYYMMDD, or YYYYMMDD + next letter
    suffix (b, c, ...) if index.html already carries that day's version.
    `today` (datetime.date) defaults to date.today(): the bot's clock, UTC on
    the GitHub runner.\"\"\"
    today = (today or date.today()).strftime("%Y%m%d")
"""),
("""def bump_cache_version(root=None):
    \"\"\"Bump ?v=, footer date (index.html) and CACHE_NAME (sw.js, contrato C3)
    to the SAME version string. Only call when data content changed — the
    decision lives in bump_if_changed() (contrato C4).\"\"\"
    root = root or PROJECT_ROOT
""", """def bump_cache_version(root=None, touch_footer=True, version=None):
    \"\"\"Bump ?v= (index.html) and CACHE_NAME (sw.js, contrato C3) to the SAME
    version string and, with touch_footer, the footer date «Última
    actualización». The bot calls it without arguments, only when data
    content changed (bump_if_changed, contrato C4): the footer is the date of
    the data. scripts/publicar.py passes touch_footer=False and its own
    version (spec §5.5; Plan B4, decisión 10): a release does not move that
    date. `version` keeps the bot's form, 8 digits and an optional letter
    (ValueError otherwise, and nothing is written).\"\"\"
    if version is not None and not re.fullmatch(r"\\d{8}[a-z]?", version):
        raise ValueError(f"versión sin la forma del bot (AAAAMMDD y una letra opcional): {version!r}")
    root = root or PROJECT_ROOT
"""),
("""    version = _next_version(content)
    today_display = date.today().strftime("%d/%m/%Y")
    new_content = re.sub(r"\\?v=\\d{8}[a-z]?", f"?v={version}", content)
    new_content = re.sub(
        r"Última actualización: \\d{2}/\\d{2}/\\d{4}",
        f"Última actualización: {today_display}",
        new_content
    )
""", """    version = version or _next_version(content)
    new_content = re.sub(r"\\?v=\\d{8}[a-z]?", f"?v={version}", content)
    if touch_footer:
        today_display = date.today().strftime("%d/%m/%Y")
        new_content = re.sub(
            r"Última actualización: \\d{2}/\\d{2}/\\d{4}",
            f"Última actualización: {today_display}",
            new_content
        )
"""),
])

edit('docs/rediseno-rebase.md', [
("""- **`data-*.js`, `data-health.json` y `futbolbase.db`.** La rama no los toca, así que no chocan. Si alguno chocara, se queda el de `main`: `git checkout --ours -- <fichero>` (en un rebase, «ours» es `main`).
""", """- **`data-*.js`, `data-health.json` y `futbolbase.db`.** La rama no los toca, así que no chocan. Si alguno chocara, se queda el de `main`: `git checkout --ours -- <fichero>` (en un rebase, «ours» es `main`). La excepción son los `data-*.js` que la rama retira a propósito (B4: `data-matchdetail-keys.js`, `data-stats.js` y `data-players-*.js`): si el bot los regeneró en `main`, chocan como «borrados en la rama y modificados en `main`», y se resuelven con `git rm`, nunca con el de `main`.
"""),
("""# Rebase de la rama del rediseño (`rediseno-acta`)

El rediseño «Acta» se construye en la rama `rediseno-acta` y no se fusiona en `main` hasta B5. Mientras tanto, el bot sigue comiteando en `main` cada pocas horas, y la rama se rebasa a menudo sobre `main` (spec §12). Este es el procedimiento (Plan B2, decisión 8).
""", """# Rebase y publicación de la rama del rediseño (`rediseno-acta`)

El rediseño «Acta» se construye en la rama `rediseno-acta`, y cada fase se publica al terminarla, con el visto bueno del usuario: `main` avanza hasta la rama con avance rápido (B2 en `376e981`, B3 en `862486f`). Entre una publicación y otra, el bot sigue comiteando en `main` cada pocas horas, y la rama trae `main` a menudo (spec §12). Este es el procedimiento (Plan B2, decisión 8), y al final, el de publicar (Plan B4, decisión 10).
"""),
("""Siempre se queda **la estructura de la rama con las marcas de versión de `main`**: las `?v=`, «Última actualización» y `CACHE_NAME`. Lo hace `scripts/sync_versions.py`. `CACHE_NAME` y las `?v=` no se suben a mano en B2 (decisión 7): la subida conjunta es del despliegue de B4 y B5.
""", """Siempre se queda **la estructura de la rama con las marcas de versión de `main`**: las `?v=`, «Última actualización» y `CACHE_NAME`. Lo hace `scripts/sync_versions.py`. `CACHE_NAME` y las `?v=` no se suben a mano: las sube `scripts/publicar.py` al publicar una fase (abajo).
"""),
("""`gh run list` no debe mostrar ninguna ejecución `in_progress` ni `queued`. `--force-with-lease` no pisa la rama remota si alguien la movió después del último `fetch`.

El PR borrador hacia `main` vuelve a lanzar `tests.yml`, con las suites y los tres smoke.
""", """`gh run list` no debe mostrar ninguna ejecución `in_progress` ni `queued`. `--force-with-lease` no pisa la rama remota si alguien la movió después del último `fetch`.

El PR borrador #2 hacia `main` quedó cerrado al publicar B2, y un push a la rama no lanza `tests.yml`: se lanza a mano, `gh workflow run tests.yml --ref rediseno-acta`, con las suites y los tres smoke.

## Publicar una fase

Con el visto bueno del usuario, sin ningún workflow en marcha y con el árbol limpio. El paso de publicar de cada plan (el de B3, Tarea 12, paso 10) tiene las comprobaciones de la web; esto es lo que se repite en cada fase:

1. **Traer `main`** con un merge (`git merge --no-edit origin/main`): en un merge, «ours» es la rama. Si chocan `index.html` o `sw.js`, `git checkout --ours` de esos dos y `python3 scripts/sync_versions.py --from origin/main`; al final, `python3 scripts/sync_versions.py --from origin/main --check`. Un conflicto en otro fichero se resuelve a mano: el bot nunca toca `src/`, `scripts/` ni `docs/`. Si la fase borró un `data-*.js` que el bot sigue regenerando en `main` (B4: `data-matchdetail-keys.js`, `data-stats.js` y `data-players-*.js`), sale un conflicto «modificado y borrado»: se resuelve con `git rm` de esos ficheros.
2. **Subir la versión** con `scripts/publicar.py`: las `?v=` de `index.html` y `CACHE_NAME` de `sw.js` a la vez, con la fecha UTC (o la letra siguiente, si no es mayor que la vigente), y `CODIGO`, sin tocar «Última actualización»:

   ```bash
   cd /home/manolo/claude/futbol-base
   python3 scripts/publicar.py
   git diff --stat
   ```

   Sale `versión <V> (antes, <la vigente>): <N> ?v= en index.html y futbolbase-v<V> en sw.js; «Última actualización: <la de los datos>», sin tocar` y la línea de `CODIGO`, y en el `diff`, solo `index.html` y `sw.js`. Si la vigente ya lleva la `z`, se para sin escribir nada.
3. **Suites y los tres smoke**, en verde, y el commit `Publica Bn del rediseño «Acta»: versión <V>` con `index.html` y `sw.js`.
4. **Empujar la rama, su CI y después `main`**: `git push origin rediseno-acta`, `gh workflow run tests.yml --ref rediseno-acta` y, con esa ejecución en verde, `git push origin rediseno-acta:main` (avance rápido). Cada push, sin ningún workflow en marcha (`gh run list --limit 5`). Si `main` avanzó mientras tanto, el push se rechaza: se vuelve al paso 1.
5. **Comprobar la web** con el perfil de un móvil que tenía la versión anterior, apertura a apertura, como en el paso de publicar del plan.
"""),
])
print('generate_js: touch_footer y version en bump_cache_version, today en _next_version; docs/rediseno-rebase.md, con la publicación')
PY
````
Esperado:
```text
generate_js: touch_footer y version en bump_cache_version, today en _next_version; docs/rediseno-rebase.md, con la publicación
```

Crear `scripts/publicar.py`:

```python
#!/usr/bin/env python3
"""La subida de versión de una publicación del rediseño (spec §5.5; Plan B4, decisión 10).

Cada fase se publica al terminarla (docs/rediseno-rebase.md). La publicación sube a la vez todas las
?v= de index.html y CACHE_NAME de sw.js, con la misma cadena, para que los móviles con la app
instalada cambien a la versión nueva, y recalcula CODIGO (scripts/codigo.py), la versión del código
que lee el arranque. No toca «Última actualización»: es la fecha de los datos, la escribe el bot y
source_health la publica como lastDataChange. Las marcas las reescribe bump_cache_version, la misma
función del bot, con touch_footer=False.

La versión es la fecha UTC, como la del bot (date.today() en el runner de GitHub: con la de Canarias,
entre las 00:00 y la 01:00 se podía repetir o hacer retroceder una CACHE_NAME), y estrictamente mayor
que la vigente, la primera ?v= de index.html. Si no lo es (la del día ya está publicada, o la vigente
es de un día posterior), la letra siguiente de la vigente: 20260925 → 20260925b → 20260925c. Se para
sin escribir nada si la vigente ya lleva la z.

Uso, desde la raíz del repositorio:
  python3 scripts/publicar.py    # las ?v=, CACHE_NAME y CODIGO de index.html y sw.js
"""
import argparse
import contextlib
import io
import re
import sys
from datetime import datetime, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import codigo  # noqa: E402
import generate_js  # noqa: E402

ROOT = Path(__file__).resolve().parents[1]
VERSION_RE = re.compile(r"\?v=(\d{8}[a-z]?)")
FOOTER_RE = re.compile(r"Última actualización: \d{2}/\d{2}/\d{4}")
CACHE_LINE_RE = re.compile(r"^const CACHE_NAME = 'futbolbase-v[0-9a-z]+';$")


def next_publish_version(current, today_utc):
    """La versión de una publicación: `today_utc` (AAAAMMDD) si es mayor que `current`, la vigente; si
    no, la letra siguiente de `current`. En estas cadenas, el orden alfabético es el de las versiones.
    ValueError si `current` ya lleva la z o si alguna no tiene la forma del bot."""
    found = re.fullmatch(r"(\d{8})([a-z]?)", current)
    if not found or not re.fullmatch(r"\d{8}", today_utc):
        raise ValueError(f"versiones sin la forma del bot: {current!r} y {today_utc!r}")
    if today_utc > current:
        return today_utc
    day, letter = found.groups()
    if letter == "z":
        raise ValueError(f"la versión {current} ya no admite otra letra")
    return day + (chr(ord(letter) + 1) if letter else "b")


def _today_utc():
    return datetime.now(timezone.utc).strftime("%Y%m%d")


def main(argv=None):
    parser = argparse.ArgumentParser(
        description="Sube las ?v=, CACHE_NAME y CODIGO de una publicación, sin tocar «Última actualización».")
    parser.add_argument("--root", default=str(ROOT), help="la raíz del árbol (por defecto, la del repositorio)")
    args = parser.parse_args(argv)
    root = Path(args.root)
    index = (root / "index.html").read_text(encoding="utf-8")
    sw = (root / "sw.js").read_text(encoding="utf-8")
    marks = VERSION_RE.findall(index)
    footer = FOOTER_RE.findall(index)
    if not marks or len(footer) != 1 or not CACHE_LINE_RE.match(sw.split("\n", 1)[0]) \
            or len(codigo.CODIGO_RE.findall(index)) != 1:
        print("index.html y sw.js tienen que llevar sus marcas: las ?v=, un «Última actualización», un CODIGO "
              "y CACHE_NAME en la línea 1 de sw.js: nada escrito")
        return 1
    current = marks[0]
    try:
        version = next_publish_version(current, _today_utc())
    except ValueError as error:
        print(f"{error}: nada escrito")
        return 1
    # Las mismas expresiones que el bot; sus avisos por línea sobran aquí, que lo resume en una.
    with contextlib.redirect_stdout(io.StringIO()):
        generate_js.bump_cache_version(str(root), touch_footer=False, version=version)
    index = (root / "index.html").read_text(encoding="utf-8")
    first = (root / "sw.js").read_text(encoding="utf-8").split("\n", 1)[0]
    assert VERSION_RE.findall(index) == [version] * len(marks), "alguna ?v= no subió"
    assert FOOTER_RE.findall(index) == footer, "el pie cambió"
    assert first == f"const CACHE_NAME = 'futbolbase-v{version}';", first
    print(f"versión {version} (antes, {current}): {len(marks)} ?v= en index.html y futbolbase-v{version} en sw.js; "
          f"«{footer[0]}», sin tocar")
    return codigo.main(["--root", str(root)])


if __name__ == "__main__":
    sys.exit(main())
```

- [ ] **Step 4: Run test to verify it passes**

```bash
cd /home/manolo/claude/futbol-base
python3 -m pytest scripts/tests/test_publicar.py -q 2>&1 | tail -1 | sed -E 's/ in [0-9.]+s$//'
```
Esperado: `18 passed`.

- [ ] **Step 5: `publicar.py` en una copia del árbol (foco de revisión 5)**

Dos publicaciones seguidas en una copia: la primera toma la fecha UTC; la segunda, el mismo día, la letra siguiente. Solo cambian las 9 líneas con `?v=` de `index.html` y la primera de `sw.js`, y `CODIGO` sigue siendo la huella del árbol:

```bash
cd /home/manolo/claude/futbol-base
: "${S:?falta S: la línea export S= de la cabecera}"
rm -rf "$S/copia-publicar" && mkdir -p "$S/copia-publicar"
tar -cf - --exclude=./.git --exclude=./node_modules . | tar -xf - -C "$S/copia-publicar"
cd "$S/copia-publicar"
python3 scripts/publicar.py; echo "sale con $?"
cp index.html index.primera && cp sw.js sw.primera
python3 scripts/publicar.py | head -1
python3 scripts/codigo.py --check
echo "líneas cambiadas en la primera: index.html $(diff /home/manolo/claude/futbol-base/index.html index.primera | grep -c '^>'), sw.js $(diff /home/manolo/claude/futbol-base/sw.js sw.primera | grep -c '^>')"
cd /home/manolo/claude/futbol-base && rm -rf "$S/copia-publicar"
```
Esperado, el 26/09/2026 (UTC) y con la vigente de `33e4cff`: la versión depende del día UTC, y la vigente y la fecha del pie, de lo que haya publicado el bot; la forma no cambia.
```text
versión 20260926 (antes, 20260925b): 9 ?v= en index.html y futbolbase-v20260926 en sw.js; «Última actualización: 23/09/2026», sin tocar
CODIGO be0acbf3: la huella de acta.css y src/*.js, en index.html
sale con 0
versión 20260926b (antes, 20260926): 9 ?v= en index.html y futbolbase-v20260926b en sw.js; «Última actualización: 23/09/2026», sin tocar
CODIGO be0acbf3: la huella del árbol
líneas cambiadas en la primera: index.html 9, sw.js 1
```

- [ ] **Step 6: Suites completas y los tres smoke**

```bash
cd /home/manolo/claude/futbol-base
python3 -m pytest scripts/tests/ -q 2>&1 | tail -1
node --test scripts/tests/test_*.mjs 2>&1 | grep -E '^# (tests|pass|fail)'
```
Esperado:
- pytest: el recuento anterior más 18, sin fallos (`488 passed, 5 skipped`): los de `test_publicar.py`.
- node: 729, sin fallos.

```bash
cd /home/manolo/claude/futbol-base
: "${S:?falta S: la línea export S= de la cabecera}"
node scripts/tests/render-smoke.mjs | head -1 | sed "s/(DOM $(( $(cat "$S/dom-base.txt") - 126 )) bytes)/(DOM de la base menos 126 bytes)/"
for i in 1 2 3; do
  out=$({ node scripts/tests/render-smoke.mjs && node scripts/tests/interaction-smoke.mjs && node scripts/tests/pwa-smoke.mjs; } 2>&1 | grep -v '^PWA fixture HTTP 404 /escudos/s/')
  echo "pasada $i: $(grep -c '^PASS' <<<"$out") PASS; otras líneas: $(grep -vc '^PASS' <<<"$out")"
done
```
Esperado, con la portada como en la Tarea 1 (esta tarea no toca `index.html`):
```text
PASS: render smoke OK — Mi equipo en estado D (DOM de la base menos 126 bytes)
pasada 1: 21 PASS; otras líneas: 0
pasada 2: 21 PASS; otras líneas: 0
pasada 3: 21 PASS; otras líneas: 0
```

- [ ] **Step 7: Commit**

```bash
cd /home/manolo/claude/futbol-base
git add scripts/generate_js.py scripts/publicar.py scripts/tests/test_publicar.py docs/rediseno-rebase.md
git commit -F - <<'EOF'
feat(rediseño): publicar.py sube la versión de una publicación sin tocar el pie (B4, tarea 2)

- generate_js.bump_cache_version(root, touch_footer=True, version=None):
  con touch_footer=False no toca «Última actualización», la fecha de los
  datos; con version, usa esa cadena (con la forma del bot, o ValueError
  sin escribir nada). _next_version(content, today) acepta el día. El bot
  la sigue llamando sin argumentos y el pie se mueve como hoy (spec §5.5,
  decisión 10).
- scripts/publicar.py: la versión es la fecha UTC, estrictamente mayor que
  la vigente (si no, la letra siguiente de la vigente; se para en la z sin
  escribir), sube todas las ?v= y CACHE_NAME con bump_cache_version y
  recalcula CODIGO. Sustituye al Python en línea del paso de publicar de
  B3.
- test_publicar: los dos caminos del pie, la versión de una publicación
  (vigente de hoy, de un día posterior y con la z), el bot como hoy y
  publicar.py sobre árboles sintéticos y sobre una copia del real.
- docs/rediseno-rebase.md: cada fase se publica al terminarla, y cómo se
  publica, con publicar.py.

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01Sg56KK3oZgo8Ye7Snj6wG9
EOF
git show --stat --oneline HEAD | tail -1
```
Esperado: `4 files changed, 293 insertions(+), 19 deletions(-)`. Son nuevos `publicar.py` y `test_publicar.py`, y modificados `generate_js.py` y `docs/rediseno-rebase.md`.

---

### Task 3: `index.html`, manifiesto e iconos: `defer`, el arranque en una función asíncrona, el registro del SW tras `load` y la PWA con sus PNG (decisiones 4, 5, 7, 14 y 15)

Los datos inmediatos van con `defer`, el arranque deja el `await` de nivel superior, el SW se registra tras `load` y la PWA pasa al manifiesto y a los iconos PNG de la app nueva, sin que la app instalada en los móviles cambie de identidad ni la portada cambie un píxel.

**Contexto**
- **`defer` (decisión 4)**: los 7 `<script>` de datos (líneas 29-35 tras la Tarea 1) pasan a `<script defer src="…">`. Los `defer` y los módulos (también uno en línea) van a la misma lista de ejecución al terminar el análisis, en el orden del documento: los globales ya están cuando arranca `app.js`. Medido por el controlador sin SW: sin ganancia ni pérdida; §10 ya lo daba por compatible con el bot («un `defer` no rompe ninguna regex»: `source_health.py` y `sync_versions.py` buscan `data-seasons.js?v=` y `?v=`, sin el `<script src=`). La única prueba que fijaba `<script src="./data-seasons.js…">` es `test_rediseno_index.mjs:86`.
- **El arranque (decisión 5)**: hoy (líneas 56-102 tras la Tarea 1) es un `try`/`catch` con `await` de nivel superior en el módulo en línea. Pasa entero, dos espacios más adentro, a `(async () => { … })();`: el mismo orden (el marcador, la limpieza por `CODIGO`, el `import` de `app.js`, `start` y el marcador) y el mismo `catch` con el aviso y «Reintentar». Lo fijan tres comprobaciones de `test_rediseno_index.mjs`: la del marcador (línea 61, que dependía del sangrado exacto y pasa a una expresión regular), la que prohibía `defer` (64) y la que exigía que el `try` fuera lo primero del módulo tras los comentarios (72). Las demás (el `import`, el orden, el ámbito de la limpieza) no dependen del sangrado.
- **Iconos e `index.html` (decisión 7)**: hoy `apple-touch-icon` e `icon` son SVG en línea del emoji ⚽ (líneas 14-15). Pasan a `./icons/icon-180.png` y a `./icons/icon-192.png` con `type="image/png"`: los PNG ya existen (`scripts/build_icons.py`, con su `test_build_icons.py`) y ya están en `STATIC_ASSETS`. `icons.svg` (4.417 bytes) no lo usa nadie: se borra. `test_sw_fixes.mjs:130` (127 en `33e4cff`) prueba `classifyRequest('/futbol-base/icons.svg')` con una cadena, sin el fichero: no cambia. La app anterior de `pwa-smoke` tiene su propio `icons.svg`, en su carpeta.
- **`manifest.json` (decisión 7)**: hoy es el de la app anterior (nombre sin tilde, colores del tema oscuro `#0a0f1a`, un SVG en línea, `start_url` `./index.html`, sin `id`). El nuevo: `name`, `short_name`, `description` y los dos colores, los de `index.html` (su `<title>`, `apple-mobile-web-app-title`, `<meta name="description">` y el `theme-color` claro, `#FFFFFF`, el `--paper` del tema claro); `start_url` `./index.html#/`; `display` `standalone`; `orientation` `portrait`; y los iconos de 192 y 512 (`any`) y la maskable de 512, con `sizes` y `type`.
- **La identidad de la app instalada (foco de revisión 2; decisión 14)**: la spec del manifiesto resuelve `id` contra el **origen** de `start_url`, no contra la URL del manifiesto. Con `"id": "./index.html"`, Chrome calcula `https://malolocabreralolo-tech.github.io/index.html` (medido con `Page.getAppId`, Chrome 150), que no es la identidad de hoy, `…/futbol-base/index.html` (sin `id`, `start_url` sin su fragmento): sería otra app. Chrome recomienda `/futbol-base/index.html`, que conserva la identidad y la fija aunque `start_url` cambie. El paso 5 lo comprueba con Chrome.
- **Pruebas** (`test_rediseno_pwa.mjs`, nuevo, 4): cada campo del manifiesto (atado a `index.html`), la identidad calculada como la spec, los píxeles de los iconos desde la cabecera PNG (firma e IHDR, sin Pillow) y los `<link>` de `index.html`. En `test_rediseno_index.mjs`, `defer` y el arranque asíncrono.
- **Lo que no cambia**: la portada (paso 5: las capturas a 390 px de los mundos D y A, iguales byte a byte), `CODIGO` (ni `src/` ni `acta.css`), las 9 `?v=` y el pie. El DOM de `render-smoke` crece 477 bytes sobre el de la Tarea 1 (queda 351 por encima de la base): `defer` en 7 líneas, el sangrado del arranque y el registro del SW con su comentario, menos los iconos sin SVG en línea.
- **El registro del SW, tras `load` (decisión 15)**: el `<script>` que lo registra (líneas 104-115 tras la Tarea 1) es clásico y en línea, así que corre durante el análisis. Con los datos bloqueantes corría tras descargarlos (a unos 980 ms de la carga); con `defer` correría antes (a unos 590 ms), y en la primera visita el precache del SW (unos 2 MB) competiría con los datos y los módulos de la portada. Pasa al evento `load` (a unos 1.040 ms) y, si `load` ya pasó (`document.readyState === 'complete'`), en seguida:
  - se conserva el contrato de §10: el literal `navigator.serviceWorker.register('./sw.js')` con `.then(reg => reg.update())`, sin `unregister`, dentro de `if ('serviceWorker' in navigator)`; lo comprueban `test_sw_fixes.mjs:185-194` (sin cambios) y la prueba nueva de `test_rediseno_index.mjs`, que ejecuta el `<script>` real con un navegador falso: durante el análisis no registra nada y deja un manejador de `load`; con `load`, registra y llama a `update`; con la página ya cargada, registra en seguida;
  - medido (decisión 15): con el SW permitido, la primera visita pinta la portada antes que sin `defer` y que con `defer` solo; sin SW, igual;
  - coste: en la primera visita el SW se instala tras `load`, unos cientos de ms después; si se cierra la página antes, en la visita siguiente.

**Files:**
- Create: `scripts/tests/test_rediseno_pwa.mjs`
- Modify: `index.html`, `manifest.json`
- Delete: `icons.svg`
- Test: `scripts/tests/test_rediseno_index.mjs`, `scripts/tests/test_rediseno_pwa.mjs`

**Interfaces:**
- Consumes: los PNG de `icons/` (`build_icons.py`: 180, 192, 512 y maskable 512); `CODIGO` de B3, sin cambios.
- Produces:

```text
index.html  <link rel="apple-touch-icon" href="./icons/icon-180.png">
            <link rel="icon" type="image/png" href="./icons/icon-192.png">
            7 × <script defer src="./data-X.js?v=V"></script>, y el módulo del arranque:
            <script type="module"> // comentarios
              (async () => { try { const CODIGO = '…'; … } catch (error) { … } })();
            <script> if ('serviceWorker' in navigator) { const register = () => navigator.serviceWorker
              .register('./sw.js').then(reg => reg.update()).catch(() => {}); si readyState es 'complete',
              register(); si no, addEventListener('load', register, { once: true }) }
manifest.json  id "/futbol-base/index.html", start_url "./index.html#/", display "standalone",
            orientation "portrait", background_color y theme_color "#FFFFFF", 3 iconos PNG
```

- [ ] **Step 1: Write the failing test**

Crear `scripts/tests/test_rediseno_pwa.mjs`:

```js
// Plan B4, tarea 3: el manifiesto y los iconos de la PWA (spec §5.5; decisión 7 de B4) y sus <link> en
// index.html. Los iconos son los PNG de icons/ (scripts/build_icons.py); sus píxeles salen de la cabecera
// PNG, sin dependencias. La app instalada en los móviles tiene que seguir siendo la misma: su identidad
// (id) es la de hoy. Solo lee index.html, manifest.json e icons/: nunca los data-*.js vivos.
import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { existsSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const INDEX = readFileSync(join(ROOT, 'index.html'), 'utf8');
const MANIFEST = JSON.parse(readFileSync(join(ROOT, 'manifest.json'), 'utf8'));
// Donde vive el manifiesto publicado: index.html lo enlaza con ./manifest.json.
const MANIFEST_URL = 'https://malolocabreralolo-tech.github.io/futbol-base/manifest.json';

// Los píxeles de un PNG, de su cabecera: la firma y el bloque IHDR, el primero.
function pngSize(file) {
  const data = readFileSync(join(ROOT, file));
  assert.equal(data.subarray(0, 8).toString('hex'), '89504e470d0a1a0a', `${file} no es un PNG`);
  assert.equal(data.subarray(12, 16).toString('latin1'), 'IHDR', `${file}: IHDR no es el primer bloque`);
  return `${data.readUInt32BE(16)}x${data.readUInt32BE(20)}`;
}
const meta = (pattern) => (INDEX.match(pattern) || [])[1];

test('manifest.json: el nombre, la descripción y los colores de index.html, arranque en #/, standalone y vertical (spec §5.5)', () => {
  const { icons, ...fields } = MANIFEST;
  assert.ok(Array.isArray(icons));
  assert.deepEqual(fields, {
    id: '/futbol-base/index.html',
    name: meta(/<title>([^<]+)<\/title>/),
    short_name: meta(/<meta name="apple-mobile-web-app-title" content="([^"]+)">/),
    description: meta(/<meta name="description" content="([^"]+)">/),
    start_url: './index.html#/',
    display: 'standalone',
    orientation: 'portrait',
    background_color: meta(/<meta name="theme-color" content="(#[0-9A-F]{6})" media="\(prefers-color-scheme: light\)">/),
    theme_color: meta(/<meta name="theme-color" content="(#[0-9A-F]{6})" media="\(prefers-color-scheme: light\)">/),
  });
  assert.deepEqual([fields.name, fields.short_name, fields.theme_color], ['Fútbol Base Las Palmas', 'Fútbol Base LP', '#FFFFFF']);
});

// La identidad de una PWA: su id resuelto contra el ORIGEN de start_url, sin fragmento (sin id, start_url
// sin su fragmento). La de hoy, la del manifiesto de antes de B4 (start_url ./index.html, sin id), es
// https://malolocabreralolo-tech.github.io/futbol-base/index.html. Con id "./index.html" sería la de la
// raíz del origen, /index.html: otra app (lo calcula así Chrome, Page.getAppId, en la Tarea 3 de B4).
test('la app instalada sigue siendo la misma: la identidad de hoy, y abre en #/', () => {
  const start = new URL(MANIFEST.start_url, MANIFEST_URL);
  const id = new URL(MANIFEST.id, start.origin);
  id.hash = '';
  assert.equal(id.href, new URL('./index.html', MANIFEST_URL).href);
  assert.equal(id.href, 'https://malolocabreralolo-tech.github.io/futbol-base/index.html');
  assert.equal(start.href, 'https://malolocabreralolo-tech.github.io/futbol-base/index.html#/');
});

test('los iconos del manifiesto: 192 y 512 (any) y la maskable de 512, PNG con esos píxeles', () => {
  assert.deepEqual(MANIFEST.icons, [
    { src: './icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
    { src: './icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
    { src: './icons/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
  ]);
  for (const icon of MANIFEST.icons) assert.equal(pngSize(icon.src), icon.sizes, icon.src);
});

test('index.html: el apple-touch-icon de 180 y el icono de 192, PNG de icons/, y el manifiesto; ni SVG en línea ni icons.svg', () => {
  assert.match(INDEX, /<link rel="apple-touch-icon" href="\.\/icons\/icon-180\.png">/);
  assert.equal(pngSize('icons/icon-180.png'), '180x180');
  assert.match(INDEX, /<link rel="icon" type="image\/png" href="\.\/icons\/icon-192\.png">/);
  assert.match(INDEX, /<link rel="manifest" href="\.\/manifest\.json">/);
  assert.doesNotMatch(INDEX, /data:image\/svg\+xml/);
  assert.ok(!existsSync(join(ROOT, 'icons.svg')), 'icons.svg no lo usa nadie (decisión 7 de B4)');
});
```

Y en `test_rediseno_index.mjs`, `defer`, el arranque asíncrono y, en una prueba nueva, el registro del SW tras `load` (ejecuta el `<script>` real con un navegador falso: sin cargar, ya cargada y al llegar `load`):

```bash
cd /home/manolo/claude/futbol-base
python3 - <<'PY'
from pathlib import Path


def edit(path, pairs):
    """Sustituye cada texto (que tiene que aparecer n veces, 1 si no se dice) o se para sin escribir."""
    p = Path(path)
    s = p.read_text(encoding='utf-8')
    for old, new, *n in pairs:
        assert s.count(old) == (n[0] if n else 1), (path, old[:80], s.count(old))
        s = s.replace(old, new)
    p.write_text(s, encoding='utf-8')


edit('scripts/tests/test_rediseno_index.mjs', [
("""// test_index_bot_contract.py; aquí, la forma. Desde B3 (decisiones 155 y 156), el arranque limpia el
// código de otras versiones una vez por versión de código (CODIGO, la huella de src/*.js y acta.css).
""", """// test_index_bot_contract.py; aquí, la forma. Desde B3 (decisiones 155 y 156), el arranque limpia el
// código de otras versiones una vez por versión de código (CODIGO, la huella de src/*.js y acta.css).
// Desde B4, los datos inmediatos van con defer, el arranque, en una función asíncrona (decisiones 4 y
// 5 de B4), y el registro del SW, tras load; los iconos y el manifiesto, en test_rediseno_pwa.mjs.
"""),
("""import { fileURLToPath } from 'node:url';
""", """import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
"""),
("""test('datos inmediatos: los siete que lee la portada, en el orden de antes (decisión 5 de B2; B4, decisión 1), y después el arranque', () => {
  const scripts = [...INDEX.matchAll(/<script\\b[^>]*\\bsrc="\\.\\/([^"?]+)\\?v=\\d{8}[a-z]?"[^>]*><\\/script>/g)].map((m) => m[1]);
  assert.deepEqual(scripts, [
    'data-benjamin.js', 'data-prebenjamin.js', 'data-history.js', 'data-goleadores.js',
    'data-shields.js', 'data-seasons.js', 'data-maspalomas-cup-2026.js',
  ]);
""", """test('datos inmediatos: los siete que lee la portada, con defer y en el orden de antes (decisión 5 de B2; B4, decisiones 1 y 4), y después el arranque', () => {
  const scripts = [...INDEX.matchAll(/<script\\b[^>]*\\bsrc="\\.\\/([^"?]+)\\?v=\\d{8}[a-z]?"[^>]*><\\/script>/g)].map((m) => m[1]);
  assert.deepEqual(scripts, [
    'data-benjamin.js', 'data-prebenjamin.js', 'data-history.js', 'data-goleadores.js',
    'data-shields.js', 'data-seasons.js', 'data-maspalomas-cup-2026.js',
  ]);
  // Con defer se ejecutan en el orden del documento cuando termina el análisis, y el módulo en línea,
  // detrás: los globales ya están cuando arranca app.js (spec §5.4; decisión 4 de B4).
  const deferred = [...INDEX.matchAll(/<script defer src="\\.\\/([^"?]+)\\?v=\\d{8}[a-z]?"><\\/script>/g)].map((m) => m[1]);
  assert.deepEqual(deferred, scripts, 'los siete, con defer');
"""),
("""  assert.ok(boot[0].includes("start(document, window);\\n      if (navigator.serviceWorker?.controller) {\\n        try { localStorage.setItem('futbol-base:codigo', CODIGO); } catch"),
    'el marcador se apunta solo si hay un SW al mando (ronda de arreglos 1)');
  assert.doesNotMatch(boot[0], /src\\/render\\.js/, 'la limpieza de la app anterior queda dentro de la general');
  assert.doesNotMatch(INDEX, /<script\\b[^>]*\\bdefer\\b/, 'defer llega en B4');
});
""", """  assert.match(boot[0], /start\\(document, window\\);\\s*if \\(navigator\\.serviceWorker\\?\\.controller\\) \\{\\s*try \\{ localStorage\\.setItem\\('futbol-base:codigo', CODIGO\\); \\} catch/,
    'el marcador se apunta solo si hay un SW al mando (ronda de arreglos 1)');
  assert.doesNotMatch(boot[0], /src\\/render\\.js/, 'la limpieza de la app anterior queda dentro de la general');
});
"""),
("""  // Todo el arranque (el marcador, la limpieza, el import, start y el marcador otra vez) va dentro del
  // try: sin conexión en plena transición no hay acta.css ni los módulos nuevos, y la página nunca se
  // queda en «Cargando…».
  assert.match(boot, /^<script type="module">\\s*(?:\\/\\/[^\\n]*\\s*)*try \\{\\s*const CODIGO = '[0-9a-f]{8}';/);
""", """  // Todo el arranque (el marcador, la limpieza, el import, start y el marcador otra vez) va dentro del
  // try: sin conexión en plena transición no hay acta.css ni los módulos nuevos, y la página nunca se
  // queda en «Cargando…». Y el try, en una función asíncrona que se llama al cerrarla, sin await de
  // nivel superior en el módulo (decisión 5 de B4): antes, solo comentarios; después, nada.
  assert.match(boot, /^<script type="module">\\s*(?:\\/\\/[^\\n]*\\s*)*\\(async \\(\\) => \\{\\s*try \\{\\s*const CODIGO = '[0-9a-f]{8}';/);
  assert.match(boot, /\\}\\)\\(\\);\\s*<\\/script>$/, 'la función asíncrona cierra el módulo');
"""),
("""  assert.match(INDEX, /<script src="\\.\\/data-seasons\\.js\\?v=\\d{8}[a-z]?"><\\/script>/);
""", """  assert.match(INDEX, /<script defer src="\\.\\/data-seasons\\.js\\?v=\\d{8}[a-z]?"><\\/script>/);
"""),
])

Path('scripts/tests/test_rediseno_index.mjs').write_text(Path('scripts/tests/test_rediseno_index.mjs').read_text(encoding='utf-8') + r'''
// El SW se registra tras el evento load (Plan B4): con los datos en defer, el <script> del registro corre
// durante el análisis, y en la primera visita su precache (unos 2 MB) competía con los datos y los
// módulos de la portada. Si load ya pasó, en seguida. El contrato de §10 se conserva: register('./sw.js')
// y .update(), sin unregister, dentro de if ('serviceWorker' in navigator). Se ejecuta el <script> real
// con un navegador falso, durante el análisis y ya cargada la página.
test('el service worker se registra tras load, o en seguida si load ya pasó, con register(\'./sw.js\') y .update() (§10)', async () => {
  const script = [...INDEX.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((m) => m[1]).find((text) => text.includes('serviceWorker'));
  assert.ok(script, 'falta el <script> del registro');
  assert.match(script, /if \('serviceWorker' in navigator\) \{/);
  assert.match(script, /navigator\.serviceWorker\.register\('\.\/sw\.js'\)\s*\.then\(reg => reg\.update\(\)\)/, 'el literal de §10');
  assert.doesNotMatch(script, /unregister\s*\(/, 'sin unregister');
  const run = (readyState) => {
    const calls = [];
    const listeners = {};
    const register = (url) => { calls.push(url); return Promise.resolve({ update: () => calls.push('update') }); };
    vm.runInContext(script, vm.createContext({
      navigator: { serviceWorker: { register } },
      document: { readyState },
      addEventListener: (type, listener) => { listeners[type] = listener; },
    }));
    return { calls, listeners };
  };
  const settle = () => new Promise((resolve) => setImmediate(resolve));
  const parsing = run('loading');
  await settle();
  assert.deepEqual(parsing.calls, [], 'durante el análisis no se registra');
  assert.deepEqual(Object.keys(parsing.listeners), ['load']);
  parsing.listeners.load();
  await settle();
  assert.deepEqual(parsing.calls, ['./sw.js', 'update'], 'tras load, se registra y busca la versión nueva');
  const loaded = run('complete');
  await settle();
  assert.deepEqual(loaded.calls, ['./sw.js', 'update'], 'si load ya pasó, en seguida');
  assert.deepEqual(Object.keys(loaded.listeners), []);
});
''', encoding='utf-8')
print('pruebas de la Tarea 3: defer, el arranque asíncrono, el registro del SW tras load, y el manifiesto y los iconos (test_rediseno_pwa.mjs)')
PY
```
Esperado:
```text
pruebas de la Tarea 3: defer, el arranque asíncrono, el registro del SW tras load, y el manifiesto y los iconos (test_rediseno_pwa.mjs)
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd /home/manolo/claude/futbol-base
node --test scripts/tests/test_rediseno_index.mjs scripts/tests/test_rediseno_pwa.mjs 2>&1 | grep -E '^not ok|^# (tests|pass|fail)' | sed -E 's/^not ok [0-9]+ - /not ok: /'
```
Esperado: ocho en rojo: las tres de `defer` y el arranque, la del registro (hoy registra durante el análisis: «durante el análisis no se registra») y las cuatro del manifiesto y los iconos.
```text
not ok: datos inmediatos: los siete que lee la portada, con defer y en el orden de antes (decisión 5 de B2; B4, decisiones 1 y 4), y después el arranque
not ok: si el arranque falla, un aviso con estilos en línea y «Reintentar», que busca el SW nuevo y recarga (R2-3)
not ok: marcas del bot: una sola versión en todas las ?v=, data-seasons.js versionado y el literal oculto
not ok: el service worker se registra tras load, o en seguida si load ya pasó, con register('./sw.js') y .update() (§10)
not ok: manifest.json: el nombre, la descripción y los colores de index.html, arranque en \#/, standalone y vertical (spec §5.5)
not ok: la app instalada sigue siendo la misma: la identidad de hoy, y abre en \#/
not ok: los iconos del manifiesto: 192 y 512 (any) y la maskable de 512, PNG con esos píxeles
not ok: index.html: el apple-touch-icon de 180 y el icono de 192, PNG de icons/, y el manifiesto; ni SVG en línea ni icons.svg
# tests 12
# pass 4
# fail 8
```

- [ ] **Step 3: Write minimal implementation**

```bash
cd /home/manolo/claude/futbol-base
python3 - <<'PY'
import textwrap
from pathlib import Path


def edit(path, pairs):
    """Sustituye cada texto (que tiene que aparecer n veces, 1 si no se dice) o se para sin escribir."""
    p = Path(path)
    s = p.read_text(encoding='utf-8')
    for old, new, *n in pairs:
        assert s.count(old) == (n[0] if n else 1), (path, old[:80], s.count(old))
        s = s.replace(old, new)
    p.write_text(s, encoding='utf-8')


# ── index.html: los iconos PNG de icons/ y los datos con defer ──
edit('index.html', [
("""  <link rel="apple-touch-icon" href="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><text y='.9em' font-size='90'>⚽</text></svg>">
  <link rel="icon" href="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><text y='.9em' font-size='90'>⚽</text></svg>">
""", """  <link rel="apple-touch-icon" href="./icons/icon-180.png">
  <link rel="icon" type="image/png" href="./icons/icon-192.png">
"""),
("""  <!-- Datos inmediatos: los siete que lee la portada, en el orden de antes del corte (Plan B2,
       decisión 5). B4 retiró los dos que ya no leía nadie (decisión 1 de B4). -->
""", """  <!-- Datos inmediatos: los siete que lee la portada, en el orden de antes del corte (Plan B2,
       decisión 5). B4 retiró los dos que ya no leía nadie (decisión 1 de B4). Con defer (spec §5.4;
       decisión 4 de B4) se ejecutan en este orden al terminar el análisis, y el módulo del arranque,
       detrás. -->
"""),
('<script src="./data-', '<script defer src="./data-', 7),
("""    // precache on EVERY visit.)
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('./sw.js')
        .then(reg => reg.update())
        .catch(() => {});
    }
""", """    // precache on EVERY visit.)
    // Tras el evento load (Plan B4): con los datos en defer, este guion corre durante el análisis, y en la
    // primera visita el precache del SW (unos 2 MB) competía con los datos y los módulos de la portada.
    // Si load ya pasó, en seguida.
    if ('serviceWorker' in navigator) {
      const register = () => navigator.serviceWorker.register('./sw.js')
        .then(reg => reg.update())
        .catch(() => {});
      if (document.readyState === 'complete') register();
      else addEventListener('load', register, { once: true });
    }
"""),
])

# El arranque, en una función asíncrona que se llama al cerrarla (decisión 5 de B4): el mismo try/catch
# y el mismo orden (el marcador, la limpieza por CODIGO, el import de app.js, start y el marcador),
# sin await de nivel superior. El bloque pasa entero, dos espacios más adentro.
p = Path('index.html')
s = p.read_text(encoding='utf-8')
head = "    try {\n      const CODIGO = '"
tail = "  </script>\n  <script>\n    // Standard SW registration"
assert s.count(head) == 1 and s.count(tail) == 1, (s.count(head), s.count(tail))
i, j = s.index(head), s.index(tail)
block = s[i:j]
assert block.endswith("        location.reload();\n      });\n    }\n") and "\n\n" not in block, block[-80:]
s = s[:i] + "    (async () => {\n" + textwrap.indent(block, "  ") + "    })();\n" + s[j:]
p.write_text(s, encoding='utf-8')

# ── manifest.json: el de la app nueva (spec §5.5; decisión 7 de B4) ──
Path('manifest.json').write_text("""{
  "id": "/futbol-base/index.html",
  "name": "Fútbol Base Las Palmas",
  "short_name": "Fútbol Base LP",
  "description": "Tu equipo de fútbol base en Canarias: próximo partido, resultados, clasificación y goleadores. Sin publicidad.",
  "start_url": "./index.html#/",
  "display": "standalone",
  "orientation": "portrait",
  "background_color": "#FFFFFF",
  "theme_color": "#FFFFFF",
  "icons": [
    { "src": "./icons/icon-192.png", "sizes": "192x192", "type": "image/png", "purpose": "any" },
    { "src": "./icons/icon-512.png", "sizes": "512x512", "type": "image/png", "purpose": "any" },
    { "src": "./icons/icon-maskable-512.png", "sizes": "512x512", "type": "image/png", "purpose": "maskable" }
  ]
}
""", encoding='utf-8')
print('index.html: iconos PNG, datos con defer, el arranque en una función asíncrona y el SW tras load; manifest.json nuevo')
PY
git rm -q icons.svg
```
Esperado:
```text
index.html: iconos PNG, datos con defer, el arranque en una función asíncrona y el SW tras load; manifest.json nuevo
```

- [ ] **Step 4: Run test to verify it passes**

```bash
cd /home/manolo/claude/futbol-base
node --test scripts/tests/test_rediseno_index.mjs scripts/tests/test_rediseno_pwa.mjs 2>&1 | grep -E '^# (tests|pass|fail)'
```
Esperado:
```text
# tests 12
# pass 12
# fail 0
```

- [ ] **Step 5: Verificación: la portada no cambia y la app instalada sigue siendo la misma**

La portada a 390 px en claro, en los mundos D y A (datos congelados y reloj fijado), con el árbol de antes de la tarea (un worktree de `HEAD`, que todavía es la Tarea 2) y con el de ahora. El guion, como `capturas.mjs`: la ventana, del alto de la página, y los escudos y la fuente, cargados:

```bash
cd /home/manolo/claude/futbol-base
: "${S:?falta S: la línea export S= de la cabecera}"
cat > "$S/portada-390.mjs" <<'EOF'
// La portada a 390 px en claro, en los mundos D y A de fixture-site.mjs (datos congelados y reloj
// fijado), con el árbol del directorio actual: para comparar index.html antes y después de un cambio.
// Como capturas.mjs: la ventana, del alto de la página, y los escudos y la fuente, cargados.
// Uso, desde la raíz de un árbol: node portada-390.mjs <prefijo>  →  <prefijo>-D.png y <prefijo>-A.png
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const ROOT = process.cwd();
const load = (file) => import(pathToFileURL(join(ROOT, 'scripts/tests', file)).href);
const { startServer, findChrome } = await load('render-smoke.mjs');
const { useWorld } = await load('fixture-site.mjs');
const { waitForAsync } = await load('browser-wait.mjs');
const { chromium } = createRequire(join(ROOT, 'package.json'))('playwright');
const prefix = process.argv[2];
if (!prefix) { console.error('Uso: node portada-390.mjs <prefijo>'); process.exit(2); }
const server = await startServer();
const browser = await chromium.launch({ executablePath: findChrome(), headless: true, args: ['--no-sandbox'] });
try {
  for (const world of ['D', 'A']) {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, serviceWorkers: 'block',
      locale: 'es-ES', timezoneId: 'Atlantic/Canary', colorScheme: 'light' });
    await useWorld(context, world);
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.goto(`http://127.0.0.1:${server.address().port}/index.html#/`);
    await page.locator('#contenido section[data-screen="home"][data-state]').waitFor();
    const height = await page.evaluate(() => document.documentElement.scrollHeight);
    await page.setViewportSize({ width: 390, height: Math.max(844, height) });
    await page.evaluate(() => { for (const img of document.querySelectorAll('img[loading="lazy"]')) img.loading = 'eager'; });
    await waitForAsync(page, () => document.fonts.status === 'loaded'
      && [...document.images].every((img) => img.complete && img.naturalWidth > 0), null, { label: `portada ${world}` });
    await page.mouse.move(0, 0);
    await page.screenshot({ path: `${prefix}-${world}.png` });
    const state = await page.locator('#contenido section[data-screen="home"]').getAttribute('data-state');
    console.log(`${world}: estado ${state}, ${errors.length} errores`);
    await context.close();
  }
} finally {
  await browser.close();
  server.close();
}
EOF
git worktree remove --force "$S/antes-t3" 2>/dev/null; rm -rf "$S/antes-t3"; git worktree prune
git worktree add --detach "$S/antes-t3" HEAD >/dev/null 2>&1
ln -s /home/manolo/claude/futbol-base/node_modules "$S/antes-t3/node_modules"
(cd "$S/antes-t3" && node "$S/portada-390.mjs" "$S/portada-antes")
node "$S/portada-390.mjs" "$S/portada-despues"
git worktree remove --force "$S/antes-t3"
for w in D A; do cmp -s "$S/portada-antes-$w.png" "$S/portada-despues-$w.png" && echo "$w: iguales, byte a byte" || echo "$w: distintas"; done
```
Esperado:
```text
D: estado D, 0 errores
A: estado A, 0 errores
D: estado D, 0 errores
A: estado A, 0 errores
D: iguales, byte a byte
A: iguales, byte a byte
```

Abrir con Read `$S/portada-despues-D.png` y `$S/portada-despues-A.png` y comprobar que son la portada de siempre:
- **D**: Las Mesas Hu. con su escudo y «Cambiar»; «Temporada 2026/27» con «pendientes en esta web»; «Así terminó 2025/26» (9.º de 15, 37 puntos, 12G 1E 15P, 2–7 contra Huracán, el máximo goleador); «Verano: Maspalomas Cup 2026» con sus cuatro filas y el pase por penaltis; «Ver toda la temporada 2025/26»; la clasificación final del 7.º al 11.º con Las Mesas resaltada; la barra abajo, con «Mi equipo» marcado.
- **A**: el próximo partido (jornada 18, sáb 7 mar, 09:00, Veteranos–Las Mesas Hu.) con «Calendario» y «Compartir»; los últimos cinco (P, G, P, G, P); la clasificación tras la jornada 17 con sus 15 escudos; los goleadores del equipo; la temporada en cifras y la nota de cobertura.

Y la identidad de la app con Chrome (`Page.getAppId`), con el manifiesto de antes (`HEAD`) y el de ahora, servidos en `/futbol-base/` como en la web; y los avisos de Chrome al leer cada uno:

```bash
cd /home/manolo/claude/futbol-base
: "${S:?falta S: la línea export S= de la cabecera}"
cat > "$S/id-app.mjs" <<'EOF'
// La identidad de la app (Page.getAppId de Chrome) con el manifiesto de antes y el de ahora, servidos en
// /futbol-base/ como en la web, y los avisos de Chrome al leer cada uno (Page.getAppManifest).
// Uso, desde la raíz del árbol: node id-app.mjs <manifiesto de antes>
import { createServer } from 'node:http';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const ROOT = process.cwd();
const { findChrome } = await import(pathToFileURL(join(ROOT, 'scripts/tests/render-smoke.mjs')).href);
const { chromium } = createRequire(join(ROOT, 'package.json'))('playwright');
const manifests = { antes: readFileSync(process.argv[2], 'utf8'), ahora: readFileSync(join(ROOT, 'manifest.json'), 'utf8') };
let current = 'antes';
const server = createServer((req, res) => {
  const path = new URL(req.url, 'http://x').pathname;
  if (path === '/futbol-base/manifest.json') {
    res.writeHead(200, { 'Content-Type': 'application/manifest+json' });
    res.end(manifests[current]);
  } else if (path.startsWith('/futbol-base/icons/')) {
    res.writeHead(200, { 'Content-Type': 'image/png' });
    res.end(readFileSync(join(ROOT, path.slice('/futbol-base/'.length))));
  } else {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end('<!DOCTYPE html><html lang="es"><head><link rel="manifest" href="./manifest.json"></head><body></body></html>');
  }
});
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const origin = `http://127.0.0.1:${server.address().port}`;
const browser = await chromium.launch({ executablePath: findChrome(), headless: true, args: ['--no-sandbox'] });
try {
  for (const name of ['antes', 'ahora']) {
    current = name;
    const context = await browser.newContext();
    const page = await context.newPage();
    await page.goto(`${origin}/futbol-base/index.html`);
    const cdp = await context.newCDPSession(page);
    const { appId } = await cdp.send('Page.getAppId');
    const { errors } = await cdp.send('Page.getAppManifest');
    console.log(`${name}: identidad ${appId.replace(origin, '<origen>')}; ${errors.length} avisos del manifiesto`);
    await context.close();
  }
} finally {
  await browser.close();
  server.close();
}
EOF
git show HEAD:manifest.json > "$S/manifest-antes.json"
node "$S/id-app.mjs" "$S/manifest-antes.json"
```
Esperado: la misma identidad, la de hoy, y ningún aviso. (Con `"id": "./index.html"` saldría `<origen>/index.html`.)
```text
antes: identidad <origen>/futbol-base/index.html; 0 avisos del manifiesto
ahora: identidad <origen>/futbol-base/index.html; 0 avisos del manifiesto
```

- [ ] **Step 6: Suites completas y los tres smoke**

```bash
cd /home/manolo/claude/futbol-base
python3 -m pytest scripts/tests/ -q 2>&1 | tail -1
node --test scripts/tests/test_*.mjs 2>&1 | grep -E '^# (tests|pass|fail)'
```
Esperado:
- pytest: `488 passed, 5 skipped`, sin `failed`.
- node: el recuento anterior más 5, sin fallos (729 → 734): las 4 de `test_rediseno_pwa.mjs` y la del registro del SW. Las tres cambiadas de `test_rediseno_index.mjs` no cambian el recuento.

Los smoke (el arranque y el registro del SW es lo que prueban: la portada, las pantallas, el paso de la app anterior con su SW real, el aviso sin conexión y el despliegue de código, que esperan al SW nuevo con `waitForAsync`), con el DOM de la portada 351 bytes por encima de la base y tres pasadas en verde:

```bash
cd /home/manolo/claude/futbol-base
: "${S:?falta S: la línea export S= de la cabecera}"
node scripts/tests/render-smoke.mjs | head -1 | sed "s/(DOM $(( $(cat "$S/dom-base.txt") + 351 )) bytes)/(DOM de la base más 351 bytes)/"
for i in 1 2 3; do
  out=$({ node scripts/tests/render-smoke.mjs && node scripts/tests/interaction-smoke.mjs && node scripts/tests/pwa-smoke.mjs; } 2>&1 | grep -v '^PWA fixture HTTP 404 /escudos/s/')
  echo "pasada $i: $(grep -c '^PASS' <<<"$out") PASS; otras líneas: $(grep -vc '^PASS' <<<"$out")"
done
```
Esperado:
```text
PASS: render smoke OK — Mi equipo en estado D (DOM de la base más 351 bytes)
pasada 1: 21 PASS; otras líneas: 0
pasada 2: 21 PASS; otras líneas: 0
pasada 3: 21 PASS; otras líneas: 0
```

- [ ] **Step 7: Commit**

`icons.svg` ya está borrado en el índice (`git rm` del paso 3):

```bash
cd /home/manolo/claude/futbol-base
git add index.html manifest.json scripts/tests/test_rediseno_index.mjs scripts/tests/test_rediseno_pwa.mjs
git commit -F - <<'EOF'
feat(rediseño): datos con defer, el arranque en una función asíncrona, el SW tras load y el manifiesto y los iconos de la PWA (B4, tarea 3)

- index.html: los 7 datos inmediatos con defer (spec §5.4, decisión 4), que
  se ejecutan en orden antes del módulo del arranque; y el arranque, en
  (async () => { … })(), con el mismo orden (el marcador, la limpieza por
  CODIGO, el import de app.js, start y el marcador) y el mismo try/catch,
  sin await de nivel superior (decisión 5).
- El SW se registra tras load, o en seguida si load ya pasó: con defer,
  su <script> corría durante el análisis y el precache competía con los
  datos en la primera visita. Se conserva el contrato de §10:
  register('./sw.js') y .update(), sin unregister.
- Iconos PNG de icons/: apple-touch-icon de 180 e icon de 192, en lugar
  de los SVG en línea del emoji; icons.svg, que no usaba nadie, borrado.
- manifest.json de la app nueva (spec §5.5, decisión 7): nombre, nombre
  corto, descripción y colores del tema claro de index.html, start_url
  ./index.html#/, standalone y vertical, y los iconos de 192 y 512 y la
  maskable. Su id es /futbol-base/index.html, la identidad de hoy: Chrome
  resuelve el id contra el origen, y ./index.html habría sido otra app.
- test_rediseno_pwa: cada campo del manifiesto, la identidad, los píxeles
  de los iconos (su cabecera PNG) y los <link> de index.html.
  test_rediseno_index: defer, el arranque asíncrono y el registro tras
  load, con el <script> real y un navegador falso.

La portada a 390 px (mundos D y A) sale igual byte a byte antes y después,
y Chrome calcula la misma identidad con el manifiesto de antes y el nuevo.

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01Sg56KK3oZgo8Ye7Snj6wG9
EOF
git show --stat --oneline HEAD | tail -1
```
Esperado: `5 files changed, 197 insertions(+), 138 deletions(-)`. Es nueva `test_rediseno_pwa.mjs`; está borrado `icons.svg`, y modificados `index.html`, `manifest.json` y `test_rediseno_index.mjs`.

---

### Task 4: Miniaturas de los escudos: `build_crests.py`, las 176 de `escudos/s/` y su prueba (spec §5.4; decisiones 9, 51, 52 y 56)

La app pide primero `escudos/s/<nombre>.png` y esa carpeta no existe: cada escudo da un 404 y cae al original. La tarea crea el guion de las miniaturas, las 176 y la prueba que avisa si falta, sobra o se quedó atrás alguna (en local y en `Tests`, nunca dentro del bot), decide con medidas la reducción de color, y `trim_shields.py` hace las miniaturas de los escudos que trae.

**Contexto**
- **Hoy.** `crest()` (`src/ui.js:37-44`) pinta `<img src="./escudos/s/<fichero sin extensión>.png" data-full="./escudos/<fichero>">`, y el `error` en captura de `app.js:42` llama a `crestFallback` (`ui.js:48-59`): miniatura → original → monograma. Sin `escudos/s/`, cada escudo pide la miniatura (404) y después el original; `pwa-smoke` lo avisa en 15 líneas `PWA fixture HTTP 404 /escudos/s/…` por pasada, que los bloques de los smoke filtraban. En la web publicada, cada 404 es la página de error de GitHub Pages (9.379 bytes transferidos): Tabla de PG2 transfiere hoy 263 KB de «imágenes», y 137 de ellos son esos 15 404 (Tarea 6).
- **Los originales:** 176 (174 PNG y 2 JPEG), 2.640.463 bytes; 135 de 64×64 y 41 de más de 96 px (hasta 722×592); ninguno con el mismo nombre sin extensión que otro. 21 traen un perfil ICC Adobe RGB y uno, Display P3; otros 25, un bloque cHRM suelto (sin gAMA).
- **El color de la miniatura es el que pinta el navegador.** Medido en Chrome 150, en un canvas sRGB: un original con perfil ICC se pinta convertido a sRGB (`lasMesasEscudo.png`: a 0,03 de media por canal de la conversión con el perfil, a 14,9 de los valores del fichero), y un cHRM sin gAMA no se aplica (a 0,0 de los valores del fichero). Así que la miniatura convierte el perfil a sRGB y se guarda sin perfil (sin él, el navegador ya la pinta en sRGB). Sin esa conversión, los escudos con perfil saldrían con otro color, entre ellos el de Las Mesas, el equipo por defecto de la portada: la medida del color del paso 5 sube de 1-2 a 9-11 en los tres que más cambian (Santa Cruz, Las Mesas y Guayarmina).
- **El tamaño:** el lado mayor en 96 px como mucho (32 px CSS con DPR 3), sin ampliar nunca: los 135 de 64 px se quedan en 64. `LANCZOS`, que Pillow aplica con el alfa premultiplicado. A 46 px CSS (la cabecera de la portada, de la ficha y de Partido) un móvil con DPR 3 amplía la miniatura de 96 a 138 px: la hoja de contacto no enseña pérdida (41 escudos tienen un original mayor de 96 px).
- **La reducción de color, decidida con medidas** (la decisión 9 lo dejaba a la tarea; decisión 17). La misma receta, en RGBA o con una paleta de 256 colores y su transparencia (`FASTOCTREE`, el cuantizador de Pillow que admite alfa; el Pillow de pip no trae libimagequant), en bytes:

  | | las 176 | las 15 de Tabla (PG2) |
  |---|---:|---:|
  | originales | 2.640.463 | 125.568 |
  | miniaturas en RGBA | 1.676.004 | 123.618 |
  | miniaturas con paleta de 256 colores | 585.820 | 46.169 |

  - En RGBA, Tabla no ahorraría nada: sus 15 escudos ya son de 64×64. Con la paleta, un 63 % menos en Tabla y un 65 % menos que en RGBA en el repositorio.
  - La hoja de contacto del paso 5 (16, 24, 32 y 46 px CSS con DPR 3, en claro y en oscuro) no enseña ninguna diferencia. Medido en Chrome sobre las 176, el color medio de cada par difiere 2,3 como mucho (de 255), salvo `futbolPDC2016.png` a 46 px (5,2): no es color, es el redondeo de `object-fit` con proporciones casi cuadradas distintas (200×205 frente a 94×96), que Chrome pinta 44 y 46 px de ancho.
  - Se adopta la paleta, de 256 colores: con 128, Tabla solo baja a 39 KB y el error crece.
- **Al día sin Pillow.** Cada miniatura lleva un bloque tEXt `escudo` con el sha1 de su original y la receta (`sha1=<40 cifras> 96px octree256`, unos 80 bytes). `--check` compara los nombres y ese bloque sin abrir ninguna imagen, así que también ve un original cambiado con el mismo nombre (no solo uno nuevo o uno que falta), y funciona sin Pillow, como en el CI. Si cambia la receta (`SIZE` o `COLORS`), todas se quedan atrás y la siguiente pasada las rehace.
- `build_crests.py` escribe solo lo que falta o se quedó atrás y borra lo que sobra: una segunda pasada no cambia nada. Dos originales con el mismo nombre sin extensión (`x.png` y `x.jpg`) lo paran con 1 sin escribir. Solo necesita Pillow para escribir.
- **Un escudo nuevo** (al activar una temporada, o a mano): `docs/temporada-nueva.md` gana el paso, en «Activar y publicar», antes de la comprobación en el navegador: copiar el original a `escudos/`, añadirlo a `data-shields.js`, `python3 scripts/build_crests.py` y comitear los tres; `test_build_crests.py` lo exige (decisión 19).
- **La prueba** (`test_build_crests.py`, 12 pruebas; dos usan Pillow y en el CI se saltan): cada original tiene su miniatura y cada miniatura su original, sin nombres repetidos; todas son PNG con paleta del tamaño de la receta (el lado mayor, 96 como mucho y nunca más que el original), leídas en la cabecera; `--check` en verde, también sin Pillow; `--check` sobre un árbol sintético (falta, se quedó atrás, sobra y el mismo nombre); con Pillow, que la miniatura de Las Mesas lleva los colores en sRGB y ningún perfil, que el guion solo escribe lo que cambió, y que una foto se gira como dice su EXIF.
- **Nunca para al bot** (decisión 51; M1 de la revisión). El bot (`update.yml` y `fetch-fiflp*.yml`) ejecuta pytest antes de comitear los datos y se para en rojo, y un escudo añadido o cambiado a mano en `main` sin su miniatura dejaría de publicar los datos de la familia. Así que las ocho pruebas que leen `escudos/` tal como está llevan `LIVE`, un `skipif` con `GITHUB_WORKFLOW` distinto de `Tests` (GitHub Actions pone ahí el `name:` de cada workflow: «Actualización automática», «Scraping FIFLP», «Scrape FIFLP actas (incremental)»…): se saltan dentro de un bot, y en local y en `Tests` (que desde la Tarea 5 corre también con solo `escudos/**` cambiado) siguen estrictas. Una de ellas lo prueba en una copia del árbol con un escudo nuevo sin miniatura: con `GITHUB_WORKFLOW=Tests`, 3 fallan; dentro del bot, ninguna.
- **`trim_shields.py`** (decisión 52), el guion que trae escudos de la federación a `escudos/` y a `data-shields.js`, llama a `build_crests.main([])` al terminar si trajo alguno (ya importa Pillow). No tiene pruebas: se ensaya en el paso 5, sin red.
- **La orientación EXIF** (decisión 56; B5 de la revisión): `make_thumbnail` gira la imagen como dice su EXIF (`ImageOps.exif_transpose`), como la pinta el navegador, y la prueba lee de la cabecera de un JPEG el tamaño con que se pinta. Hoy ningún original lleva giro (`football-project.jpg`, Orientation 1; `joveroLasRosas.jpg`, sin EXIF): la receta no cambia y las 176 miniaturas salen iguales byte a byte.
- `sw.js` no cambia: `/escudos/` ya es *cache-first*, y las miniaturas se guardan según se usan (§5.5), sin precache.
- Desde esta tarea, los smoke se pasan sin el filtro de los 404 de `escudos/s/`: ya no hay ninguno.

**Files:**
- Create: `scripts/build_crests.py`, `scripts/tests/test_build_crests.py` y `escudos/s/*.png` (176; las escribe el guion)
- Modify: `docs/temporada-nueva.md` (el paso de un escudo nuevo) y `scripts/trim_shields.py` (las miniaturas de lo que trae)
- Test: `scripts/tests/test_build_crests.py`

**Interfaces:**
- Consumes: la ruta de la miniatura de `crest()` (`src/ui.js:41`, `./escudos/s/${file.replace(/\.[^./]+$/, '')}.png`), que la prueba busca en el código; en la verificación, `shieldFile` (`src/state.js`), `startServer` y `findChrome` (`render-smoke.mjs`) y `waitForAsync` (`browser-wait.mjs`).
- Produces:

```python
# scripts/build_crests.py
SIZE = 96                     # lado mayor de la miniatura, en px
COLORS = 256                  # paleta con transparencia (FASTOCTREE)
RECIPE = "96px octree256"
TAG = "escudo"                # clave del bloque tEXt de cada miniatura
def thumb_name(original: str) -> str                  # "x.jpg" -> "x.png", como crest()
def thumb_size(width: int, height: int) -> tuple      # (w, h): lado mayor <= SIZE, sin ampliar
def source_tag(original: bytes) -> str                # "sha1=<40 cifras hex> 96px octree256"
def read_tag(png: bytes) -> str | None                # el tEXt «escudo» de un PNG, sin Pillow
def survey(root) -> dict                              # {"colisiones", "pendientes", "sobran", "al_dia"}
def make_thumbnail(original: Path, target: Path) -> None   # con Pillow: el giro del EXIF, sRGB, LANCZOS, paleta y tEXt
def main(argv=None) -> int                            # [--check] [--root R]; 0 o 1
# scripts/tests/test_build_crests.py
LIVE = pytest.mark.skipif(...)                        # las pruebas de escudos/ tal como está: se saltan si GITHUB_WORKFLOW
                                                      # existe y no es «Tests» (dentro de un bot)
# scripts/trim_shields.py
main()                                                # si trajo escudos, al terminar, build_crests.main([])
```

- [ ] **Step 1: Write the failing test**

Crear `scripts/tests/test_build_crests.py`:

```python
"""Plan B4, Tarea 4: las miniaturas de los escudos (spec §5.4; decisiones 9, 51 y 56).

Sin Pillow, salvo dos (el CI y el bot solo instalan pytest y pyyaml): las cabeceras de los PNG (IHDR) y
de los JPEG (SOF, y el giro de su EXIF) se leen a mano, y `build_crests.py --check` compara los nombres y
el sha1 que cada miniatura guarda de su original, con la receta, en su bloque tEXt «escudo».

Las que leen escudos/ tal como está (LIVE) se saltan dentro de un bot. update.yml y fetch-fiflp*.yml
ejecutan pytest antes de comitear los datos y se paran en rojo, y el bot nunca toca escudos/: un escudo
añadido o cambiado a mano en main sin su miniatura no puede dejar de publicar los datos. En local y en
Tests (que corre también cuando solo cambia escudos/) siguen estrictas, y trim_shields.py ya hace las
miniaturas de lo que trae; a mano, `python3 scripts/build_crests.py`.
"""
import io
import os
import re
import shutil
import struct
import subprocess
import sys
import zlib
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "scripts"))
import build_crests  # noqa: E402

ESCUDOS = ROOT / "escudos"
THUMBS = ESCUDOS / "s"
PNG_SIGNATURE = b"\x89PNG\r\n\x1a\n"
JPEG_SOF = {0xC0, 0xC1, 0xC2, 0xC3, 0xC5, 0xC6, 0xC7, 0xC9, 0xCA, 0xCB, 0xCD, 0xCE, 0xCF}
ORIGINALS = sorted(p for p in ESCUDOS.iterdir() if p.is_file() and not p.name.startswith("."))


def _strict(environ):
    """Si las pruebas de escudos/ tal como está paran la suite: en local (sin GITHUB_WORKFLOW) y en Tests, sí;
    dentro de un bot, no. GitHub Actions pone en GITHUB_WORKFLOW el `name:` del workflow: «Actualización
    automática» (update.yml), «Scraping FIFLP», «Scrape FIFLP actas (incremental)»…"""
    return environ.get("GITHUB_WORKFLOW") in (None, "Tests")


LIVE = pytest.mark.skipif(not _strict(os.environ),
                          reason="el bot no toca escudos/: un escudo sin su miniatura lo para Tests, nunca el bot")


def _png_header(data):
    """(ancho, alto, profundidad, tipo de color) del IHDR, que tiene que ser el primer bloque."""
    assert data[:8] == PNG_SIGNATURE, "no es un PNG"
    assert struct.unpack(">I4s", data[8:16]) == (13, b"IHDR"), "el primer bloque no es IHDR"
    return struct.unpack(">IIBB", data[16:26])


def _jpeg_size(data):
    """(ancho, alto) con que se pinta un JPEG: los de su primer SOF (los segmentos van antes de los datos de
    la imagen), girados si su EXIF lo pide (Orientation de 5 a 8, un cuarto de vuelta), como el navegador y
    como build_crests.py."""
    assert data[:2] == b"\xff\xd8", "no es un JPEG"
    pos, turned = 2, False
    while pos + 9 <= len(data):
        assert data[pos] == 0xFF, f"JPEG mal formado en el byte {pos}"
        marker = data[pos + 1]
        if marker == 0xFF:  # relleno
            pos += 1
            continue
        length = struct.unpack(">H", data[pos + 2:pos + 4])[0]
        if marker == 0xE1 and data[pos + 4:pos + 10] == b"Exif\0\0":
            turned = _exif_orientation(data[pos + 10:pos + 2 + length]) in (5, 6, 7, 8)
        if marker in JPEG_SOF:
            height, width = struct.unpack(">HH", data[pos + 5:pos + 9])
            return (height, width) if turned else (width, height)
        pos += 2 + length
    raise AssertionError("JPEG sin SOF")


def _exif_orientation(tiff):
    """La etiqueta Orientation (0x0112) del primer IFD de un bloque EXIF (una cabecera TIFF), o 1 sin ella."""
    order = {b"II": "<", b"MM": ">"}[tiff[:2]]
    ifd = struct.unpack(order + "I", tiff[4:8])[0]
    for i in range(struct.unpack(order + "H", tiff[ifd:ifd + 2])[0]):
        tag, _, _, value = struct.unpack(order + "HHI4s", tiff[ifd + 2 + 12 * i:ifd + 14 + 12 * i])
        if tag == 0x0112:
            return struct.unpack(order + "H", value[:2])[0]
    return 1


def _size(path):
    data = path.read_bytes()
    return _png_header(data)[:2] if data[:8] == PNG_SIGNATURE else _jpeg_size(data)


def _png_with_tag(tag):
    """Un PNG mínimo (1×1, con paleta) con el bloque tEXt «escudo», escrito sin Pillow."""
    def chunk(kind, body):
        return struct.pack(">I", len(body)) + kind + body + struct.pack(">I", zlib.crc32(kind + body))
    return (PNG_SIGNATURE + chunk(b"IHDR", struct.pack(">IIBBBBB", 1, 1, 8, 3, 0, 0, 0)) + chunk(b"PLTE", b"\0\0\0")
            + chunk(b"tEXt", b"escudo\0" + tag.encode("latin-1")) + chunk(b"IDAT", zlib.compress(b"\0\0")) + chunk(b"IEND", b""))


def test_thumb_name_is_the_one_crest_asks_for():
    # crest() de src/ui.js pide ./escudos/s/<fichero sin su última extensión>.png
    assert "./escudos/s/${file.replace(/\\.[^./]+$/, '')}.png" in (ROOT / "src" / "ui.js").read_text(encoding="utf-8")
    assert build_crests.thumb_name("huracan.png") == "huracan.png"
    assert build_crests.thumb_name("joveroLasRosas.jpg") == "joveroLasRosas.png"
    assert build_crests.thumb_name("200x200atleticograncanaria19-20.png") == "200x200atleticograncanaria19-20.png"
    assert build_crests.thumb_name("a.b.jpeg") == "a.b.png"


def test_thumb_size_never_enlarges_and_keeps_the_shape():
    assert build_crests.SIZE == 96
    cases = {(64, 64): (64, 64), (96, 96): (96, 96), (100, 100): (96, 96), (300, 300): (96, 96),
             (722, 592): (96, 79), (150, 220): (65, 96), (200, 205): (94, 96), (500, 2): (96, 1)}
    for (width, height), expected in cases.items():
        assert build_crests.thumb_size(width, height) == expected, (width, height)


@LIVE
def test_header_readers_on_known_files():
    assert _size(ROOT / "icons" / "icon-180.png") == (180, 180)
    assert _size(ESCUDOS / "joveroLasRosas.jpg") == (150, 220)
    assert _size(ESCUDOS / "football-project.jpg") == (722, 592)


@LIVE
def test_every_original_has_its_thumbnail_and_every_thumbnail_its_original():
    wanted = {build_crests.thumb_name(p.name) for p in ORIGINALS}
    present = {p.name for p in THUMBS.iterdir()} if THUMBS.is_dir() else set()
    assert len(ORIGINALS) >= 176
    assert sorted(wanted - present) == [], "faltan miniaturas: python3 scripts/build_crests.py"
    assert sorted(present - wanted) == [], "sobran miniaturas: python3 scripts/build_crests.py"


@LIVE
def test_no_two_originals_share_a_name_without_extension():
    by_thumb = {}
    for original in ORIGINALS:
        by_thumb.setdefault(build_crests.thumb_name(original.name), []).append(original.name)
    assert [names for names in by_thumb.values() if len(names) > 1] == []


@LIVE
def test_thumbnails_are_palette_pngs_with_the_longest_side_at_most_96():
    wrong = []
    for original in ORIGINALS:
        thumb = THUMBS / build_crests.thumb_name(original.name)
        if not thumb.is_file():
            continue  # lo dice la prueba de los nombres
        width, height, depth, color = _png_header(thumb.read_bytes())
        ow, oh = _size(original)
        if ((width, height) != build_crests.thumb_size(ow, oh) or max(width, height) > 96 or width > ow or height > oh
                or color != 3 or depth not in (1, 2, 4, 8)):
            wrong.append(f"{thumb.name}: {width}×{height}, tipo {color} de {depth} bits (original {ow}×{oh})")
    assert wrong == []


@LIVE
def test_thumbnails_are_up_to_date_with_their_originals(capsys):
    # Sin Pillow: el sha1 del original y la receta, guardados en cada miniatura.
    assert build_crests.main(["--check"]) == 0, capsys.readouterr().out
    assert capsys.readouterr().out == f"escudos/s: {len(ORIGINALS)} al día\n"


@LIVE
def test_check_runs_without_pillow():
    # Como en el CI: sin Pillow, --check funciona igual (Pillow solo hace falta para escribir).
    code = ("import sys; sys.modules['PIL'] = None; sys.path.insert(0, 'scripts'); import build_crests;"
            " raise SystemExit(build_crests.main(['--check']))")
    run = subprocess.run([sys.executable, "-c", code], cwd=ROOT, capture_output=True, text=True)
    assert run.returncode == 0, run.stdout + run.stderr


def test_check_finds_missing_stale_extra_and_clashing_thumbnails(tmp_path, capsys):
    thumbs = tmp_path / "escudos" / "s"
    thumbs.mkdir(parents=True)
    original = b"el original de a"
    (tmp_path / "escudos" / "a.png").write_bytes(original)

    def check():
        return build_crests.main(["--check", "--root", str(tmp_path)]), capsys.readouterr().out

    assert check() == (1, "falta: escudos/s/a.png (de escudos/a.png)\nescudos/s: 0 al día, 1 por arreglar: python3 scripts/build_crests.py\n")
    (thumbs / "a.png").write_bytes(_png_with_tag(build_crests.source_tag(original)))
    assert check() == (0, "escudos/s: 1 al día\n")
    # El mismo nombre con otro contenido, o la misma fuente con otra receta: se quedó atrás.
    (tmp_path / "escudos" / "a.png").write_bytes(b"otro original de a")
    code, out = check()
    assert code == 1 and "se quedó atrás: escudos/s/a.png (de escudos/a.png)" in out
    (tmp_path / "escudos" / "a.png").write_bytes(original)
    (thumbs / "a.png").write_bytes(_png_with_tag(build_crests.source_tag(original).replace("96px", "64px")))
    code, out = check()
    assert code == 1 and "se quedó atrás: escudos/s/a.png" in out
    (thumbs / "a.png").write_bytes(_png_with_tag(build_crests.source_tag(original)))
    (thumbs / "b.png").write_bytes(_png_with_tag("x"))
    code, out = check()
    assert code == 1 and "sobra: escudos/s/b.png" in out
    (thumbs / "b.png").unlink()
    (tmp_path / "escudos" / "a.jpg").write_bytes(b"a en JPEG")
    code, out = check()
    assert code == 1 and "mismo nombre: escudos/a.jpg y escudos/a.png darían escudos/s/a.png" in out


@LIVE
def test_build_writes_srgb_thumbnails_and_only_what_changed(tmp_path, capsys):
    Image = pytest.importorskip("PIL.Image")
    from PIL import ImageCms

    (tmp_path / "escudos").mkdir()
    for name in ("lasMesasEscudo.png", "football-project.jpg", "100x100arucas.png"):
        (tmp_path / "escudos" / name).write_bytes((ESCUDOS / name).read_bytes())
    assert build_crests.main(["--root", str(tmp_path)]) == 0
    assert capsys.readouterr().out.splitlines()[-1] == "escudos/s: 3 escritas, 0 al día, 0 borradas"
    assert build_crests.main(["--root", str(tmp_path)]) == 0
    assert capsys.readouterr().out == "escudos/s: 0 escritas, 3 al día, 0 borradas\n"
    # Las Mesas trae un perfil Adobe RGB: la miniatura (64×64, como el original) lleva los colores que
    # pinta el navegador, los del perfil convertidos a sRGB, y ningún perfil.
    original = Image.open(ESCUDOS / "lasMesasEscudo.png")
    profile = ImageCms.ImageCmsProfile(io.BytesIO(original.info["icc_profile"]))
    srgb = ImageCms.profileToProfile(original.convert("RGBA"), profile, ImageCms.createProfile("sRGB"), outputMode="RGBA")
    thumb = Image.open(tmp_path / "escudos" / "s" / "lasMesasEscudo.png")
    assert "icc_profile" not in thumb.info and thumb.mode == "P"

    def mean_gap(a, b):
        # La diferencia media por canal en los píxeles opacos de `a`.
        pa, pb = a.convert("RGBA").tobytes(), b.convert("RGBA").tobytes()
        opaque = [i for i in range(0, len(pa), 4) if pa[i + 3] == 255]
        return sum(abs(pa[i + k] - pb[i + k]) for i in opaque for k in range(3)) / (3 * len(opaque))

    assert mean_gap(srgb, thumb) < 5, "la paleta de 256 colores da unos 3"
    assert mean_gap(original, thumb) > 10, "sin convertir, los valores del perfil Adobe RGB darían unos 13"
    # Un original que se va se lleva su miniatura.
    (tmp_path / "escudos" / "100x100arucas.png").unlink()
    assert build_crests.main(["--root", str(tmp_path)]) == 0
    assert capsys.readouterr().out == "borrada: escudos/s/100x100arucas.png\nescudos/s: 0 escritas, 2 al día, 1 borradas\n"


@LIVE
def test_a_crest_without_its_thumbnail_stops_tests_and_never_the_bots(tmp_path):
    # Una copia del árbol con un escudo nuevo sin su miniatura (un commit a mano en main): con
    # GITHUB_WORKFLOW=Tests fallan las tres pruebas que lo miran; dentro del bot (update.yml) se saltan
    # todas las de escudos/ y ninguna falla, así que el bot sigue publicando los datos.
    for rel in ("scripts/build_crests.py", "scripts/tests/test_build_crests.py", "src/ui.js", "icons/icon-180.png"):
        (tmp_path / rel).parent.mkdir(parents=True, exist_ok=True)
        shutil.copy(ROOT / rel, tmp_path / rel)
    shutil.copytree(ESCUDOS, tmp_path / "escudos")
    shutil.copy(ESCUDOS / "lasMesasEscudo.png", tmp_path / "escudos" / "nuevoClubEscudo.png")

    def summary(workflow):
        env = {key: value for key, value in os.environ.items() if key != "GITHUB_WORKFLOW"}
        env["GITHUB_WORKFLOW"] = workflow
        run = subprocess.run([sys.executable, "-m", "pytest", "-q", "-p", "no:cacheprovider", "-k", "not never_the_bots",
                              "scripts/tests/test_build_crests.py"], cwd=tmp_path, env=env, capture_output=True, text=True)
        return run.stdout.strip().splitlines()[-1]

    in_tests = summary("Tests")
    assert in_tests.startswith("3 failed, "), in_tests
    in_the_bot = summary("Actualización automática")
    assert "failed" not in in_the_bot and int(re.search(r"(\d+) skipped", in_the_bot).group(1)) >= 7, in_the_bot


def test_build_turns_a_photo_as_its_exif_says(tmp_path):
    # Un JPEG de cámara con Orientation 6 (se pinta girado un cuarto de vuelta a la derecha): 80×40 en el fichero,
    # 40×80 al pintarlo, con su mitad izquierda (azul) arriba. La miniatura sale como se pinta, y la cabecera,
    # leída a mano, da ese mismo tamaño.
    Image = pytest.importorskip("PIL.Image")
    photo = Image.new("RGB", (80, 40), (220, 30, 30))
    photo.paste((30, 30, 220), (0, 0, 40, 40))
    exif = Image.Exif()
    exif[0x0112] = 6
    jpeg = io.BytesIO()
    photo.save(jpeg, "JPEG", exif=exif)
    (tmp_path / "escudos").mkdir()
    (tmp_path / "escudos" / "foto.jpg").write_bytes(jpeg.getvalue())
    assert _jpeg_size(jpeg.getvalue()) == (40, 80)
    assert build_crests.main(["--root", str(tmp_path)]) == 0
    thumb = Image.open(tmp_path / "escudos" / "s" / "foto.png").convert("RGBA")
    assert thumb.size == (40, 80)
    top, bottom = thumb.getpixel((20, 10)), thumb.getpixel((20, 70))
    assert top[2] > 150 > top[0] and bottom[0] > 150 > bottom[2], (top, bottom)
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd /home/manolo/claude/futbol-base
python3 -m pytest scripts/tests/test_build_crests.py -q 2>&1 | grep -E "^E +ModuleNotFoundError|^[0-9]+ error" | sed 's/ in [0-9.]*s$//'
```
Esperado:
```text
E   ModuleNotFoundError: No module named 'build_crests'
1 error
```

- [ ] **Step 3: Write minimal implementation**

Crear `scripts/build_crests.py`:

```python
#!/usr/bin/env python3
"""Miniaturas de los escudos (spec §5.4; decisión 9 del plan B4), con Pillow.

Cada original escudos/<nombre>.<ext> da escudos/s/<nombre>.png, la imagen que la app pide primero
(crest() de src/ui.js: la miniatura; si falla, el original; si también falla, el monograma):
- girada como dice su EXIF (Orientation), como la pinta el navegador (hoy ningún original lleva giro);
- en sRGB: si el original trae un perfil ICC (hoy, 21 en Adobe RGB y uno en Display P3), se
  convierte, como hace el navegador al pintarlo; sin perfil, los valores tal cual (Chrome no aplica
  un cHRM suelto, sin gAMA);
- con el lado mayor en SIZE px como mucho (32 px CSS con DPR 3), sin ampliar nunca el original;
  LANCZOS, que Pillow aplica con el alfa premultiplicado;
- con una paleta de COLORS colores y su transparencia (FASTOCTREE): un tercio de los bytes de RGBA,
  sin diferencia visible a 16, 32 y 46 px CSS (la hoja de contacto de la Tarea 4 del plan B4);
- en PNG optimizado, con un bloque tEXt «escudo» que guarda el sha1 del original y la receta: así
  --check sabe, sin Pillow, si una miniatura falta, sobra o se quedó atrás (un original cambiado
  con el mismo nombre).

Se ejecuta a mano al añadir o cambiar un escudo, como build_icons.py, y trim_shields.py lo llama al
terminar si trajo alguno. El bot no toca escudos/ (data-shields.js se mantiene a mano): sin la miniatura,
Tests sale en rojo (test_build_crests.py), nunca el bot. Escribe solo las miniaturas que faltan o se
quedaron atrás y borra las que sobran.

Uso: python3 scripts/build_crests.py [--check] [--root R]
  --check: no escribe ni necesita Pillow; sale con 1 si falta, sobra o se quedó atrás alguna.
"""
import argparse
import hashlib
import io
import struct
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SIZE = 96
COLORS = 256
RECIPE = f"{SIZE}px octree{COLORS}"
TAG = "escudo"
PNG_SIGNATURE = b"\x89PNG\r\n\x1a\n"


def thumb_name(original: str) -> str:
    """El nombre de la miniatura: el del original sin su extensión, en .png (como crest() de ui.js)."""
    return Path(original).stem + ".png"


def thumb_size(width: int, height: int) -> tuple:
    """El tamaño de la miniatura: el lado mayor en SIZE como mucho, sin ampliar, con la misma forma."""
    scale = min(1.0, SIZE / max(width, height))
    return max(1, round(width * scale)), max(1, round(height * scale))


def source_tag(original: bytes) -> str:
    """Lo que la miniatura guarda de su original: su sha1 y la receta con la que se hizo."""
    return f"sha1={hashlib.sha1(original).hexdigest()} {RECIPE}"


def read_tag(png: bytes):
    """El texto del bloque tEXt «escudo» de un PNG, o None si no es un PNG o no lo tiene (sin Pillow)."""
    if not png.startswith(PNG_SIGNATURE):
        return None
    pos = len(PNG_SIGNATURE)
    while pos + 8 <= len(png):
        length, kind = struct.unpack(">I4s", png[pos:pos + 8])
        if kind == b"tEXt":
            key, _, value = png[pos + 8:pos + 8 + length].partition(b"\0")
            if key == TAG.encode("latin-1"):
                return value.decode("latin-1")
        if kind in (b"IDAT", b"IEND"):
            return None
        pos += 12 + length
    return None


def survey(root):
    """El estado de escudos/s/ frente a escudos/: {"colisiones": [[originales]], "pendientes":
    [(original, miniatura, "falta" | "atrás")], "sobran": [miniaturas], "al_dia": n}."""
    folder = Path(root) / "escudos"
    thumbs = folder / "s"
    originals = sorted(p for p in folder.iterdir() if p.is_file() and not p.name.startswith("."))
    by_thumb = {}
    for original in originals:
        by_thumb.setdefault(thumb_name(original.name), []).append(original)
    state = {"colisiones": [], "pendientes": [], "sobran": [], "al_dia": 0}
    for name, group in sorted(by_thumb.items()):
        if len(group) > 1:
            state["colisiones"].append(group)
            continue
        thumb = thumbs / name
        if not thumb.is_file():
            state["pendientes"].append((group[0], thumb, "falta"))
        elif read_tag(thumb.read_bytes()) != source_tag(group[0].read_bytes()):
            state["pendientes"].append((group[0], thumb, "atrás"))
        else:
            state["al_dia"] += 1
    if thumbs.is_dir():
        state["sobran"] = sorted(p for p in thumbs.iterdir() if p.is_file() and p.name not in by_thumb)
    return state


def make_thumbnail(original: Path, target: Path):
    """Escribe la miniatura de `original` en `target` (con Pillow)."""
    from PIL import Image, ImageCms, ImageOps, PngImagePlugin

    data = original.read_bytes()
    with Image.open(io.BytesIO(data)) as im:
        icc = im.info.get("icc_profile")
        image = ImageOps.exif_transpose(im).convert("RGBA")
    if icc:
        source = ImageCms.ImageCmsProfile(io.BytesIO(icc))
        image = ImageCms.profileToProfile(image, source, ImageCms.createProfile("sRGB"), outputMode="RGBA")
    size = thumb_size(*image.size)
    if size != image.size:
        image = image.resize(size, Image.Resampling.LANCZOS)
    palette = image.quantize(colors=COLORS, method=Image.Quantize.FASTOCTREE)
    info = PngImagePlugin.PngInfo()
    info.add_text(TAG, source_tag(data))
    target.parent.mkdir(parents=True, exist_ok=True)
    # Sin perfil ICC (el de sRGB que deja la conversión): sin perfil, el navegador ya la pinta en sRGB.
    palette.save(target, "PNG", optimize=True, pnginfo=info, icc_profile=None)


def main(argv=None) -> int:
    parser = argparse.ArgumentParser(description="Miniaturas de los escudos: escudos/s/<nombre>.png")
    parser.add_argument("--check", action="store_true", help="no escribe: sale con 1 si falta, sobra o se quedó atrás alguna")
    parser.add_argument("--root", default=str(ROOT), help="raíz del repo (por defecto, la de este guion)")
    args = parser.parse_args(argv)
    root = Path(args.root)
    state = survey(root)
    rel = lambda p: p.relative_to(root).as_posix()  # noqa: E731
    for group in state["colisiones"]:
        print(f"mismo nombre: {' y '.join(rel(p) for p in group)} darían escudos/s/{thumb_name(group[0].name)}")
    if args.check:
        for original, thumb, why in state["pendientes"]:
            print(f"{'falta' if why == 'falta' else 'se quedó atrás'}: {rel(thumb)} (de {rel(original)})")
        for extra in state["sobran"]:
            print(f"sobra: {rel(extra)}")
        problems = len(state["colisiones"]) + len(state["pendientes"]) + len(state["sobran"])
        print(f"escudos/s: {state['al_dia']} al día" + (f", {problems} por arreglar: python3 scripts/build_crests.py" if problems else ""))
        return 1 if problems else 0
    if state["colisiones"]:
        return 1
    try:
        import PIL  # noqa: F401
    except ImportError:
        print("build_crests.py necesita Pillow: pip install Pillow")
        return 1
    for original, thumb, _ in state["pendientes"]:
        make_thumbnail(original, thumb)
        print(f"escrita: {rel(thumb)}")
    for extra in state["sobran"]:
        extra.unlink()
        print(f"borrada: {rel(extra)}")
    print(f"escudos/s: {len(state['pendientes'])} escritas, {state['al_dia']} al día, {len(state['sobran'])} borradas")
    return 0


if __name__ == "__main__":
    sys.exit(main())
```

`--check` ve las 176 que faltan; después, la primera pasada las escribe y la segunda no cambia nada:

```bash
cd /home/manolo/claude/futbol-base
python3 scripts/build_crests.py --check | tail -1; echo "salida: ${PIPESTATUS[0]}"
python3 scripts/build_crests.py | tail -1
python3 scripts/build_crests.py
python3 scripts/build_crests.py --check; echo "salida: $?"
```
Esperado:
```text
escudos/s: 0 al día, 176 por arreglar: python3 scripts/build_crests.py
salida: 1
escudos/s: 176 escritas, 0 al día, 0 borradas
escudos/s: 0 escritas, 176 al día, 0 borradas
escudos/s: 176 al día
salida: 0
```

Y el paso de un escudo nuevo en `docs/temporada-nueva.md` (decisión 19), en «Activar y publicar», antes de la comprobación en el navegador (el bloque va entre cuatro acentos graves porque el texto del documento lleva un bloque de tres):

````bash
cd /home/manolo/claude/futbol-base
python3 - <<'PY'
from pathlib import Path

p = Path('docs/temporada-nueva.md')
s = p.read_text(encoding='utf-8')
anchor = "Comprobar ambas categorías, el equipo inicial y al menos un partido del archivo en el navegador."
assert s.count(anchor) == 1, s.count(anchor)
s = s.replace(anchor, """Un equipo nuevo puede traer un escudo nuevo, y un escudo se puede cambiar en cualquier momento. `data-shields.js` se mantiene a mano, y la app pide primero la miniatura de cada escudo, `escudos/s/<nombre sin extensión>.png` (spec §5.4; Plan B4, Tarea 4). Se copia el original a `escudos/`, se añade su entrada a `data-shields.js` y se generan las miniaturas, con Pillow (solo en local):

```bash
python3 scripts/build_crests.py
python3 scripts/build_crests.py --check
```

La segunda orden tiene que acabar en «al día». Se comitean los tres: el original, su miniatura y `data-shields.js`. `scripts/tests/test_build_crests.py` lo exige: sin la miniatura, o con una que se quedó atrás, `Tests` sale en rojo. El bot no: dentro de él esas pruebas se saltan, porque nunca toca `escudos/` y no puede dejar de publicar los datos por un escudo. `scripts/trim_shields.py`, si trae escudos nuevos de la federación, ya genera sus miniaturas al terminar.

""" + anchor)
p.write_text(s, encoding='utf-8')
print('docs/temporada-nueva.md: el paso de un escudo nuevo, antes de la comprobación en el navegador')
PY
````
Esperado:
```text
docs/temporada-nueva.md: el paso de un escudo nuevo, antes de la comprobación en el navegador
```

Y `trim_shields.py`, que trae escudos de la federación sin miniatura, las hace al terminar (decisión 52):

```bash
cd /home/manolo/claude/futbol-base
python3 - <<'PY'
from pathlib import Path


def edit(path, pairs):
    """Sustituye cada texto (que tiene que aparecer n veces, 1 si no se dice) o se para sin escribir."""
    p = Path(path)
    s = p.read_text(encoding='utf-8')
    for old, new, *n in pairs:
        assert s.count(old) == (n[0] if n else 1), (path, old[:80], s.count(old))
        s = s.replace(old, new)
    p.write_text(s, encoding='utf-8')


edit('scripts/trim_shields.py', [
("""trim_shields.py — Download shield images from futbolaspalmas.com,
trim transparent borders, and save locally in escudos/ directory.
Updates data-shields.js to use local paths.
""", """trim_shields.py — Download shield images from futbolaspalmas.com,
trim transparent borders, and save locally in escudos/ directory.
Updates data-shields.js to use local paths, and makes the thumbnails of the
new ones in escudos/s/ with build_crests.py (Plan B4, decisión 52).
"""),
("""import json
import os
import re
import time
""", """import json
import os
import re
import sys
import time
"""),
("""    print(f"→ data-shields.js actualizado con nombres locales ({len(local_shields)} equipos)")
""", """    print(f"→ data-shields.js actualizado con nombres locales ({len(local_shields)} equipos)")

    # Las miniaturas de los escudos nuevos (Plan B4, decisión 52): la app pide primero escudos/s/<nombre>.png,
    # y sin ella Tests sale en rojo (test_build_crests.py). build_crests.py escribe solo las que faltan.
    if downloaded:
        sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
        import build_crests
        if build_crests.main([]):
            print("⚠ faltan miniaturas: python3 scripts/build_crests.py")
"""),
])
print('trim_shields.py: las miniaturas de los escudos que trae, con build_crests.py')
PY
```
Esperado:
```text
trim_shields.py: las miniaturas de los escudos que trae, con build_crests.py
```

- [ ] **Step 4: Run test to verify it passes**

```bash
cd /home/manolo/claude/futbol-base
python3 -m pytest scripts/tests/test_build_crests.py -q 2>&1 | tail -1 | sed 's/ in [0-9.]*s$//'
```
Esperado: `12 passed` (en el CI, sin Pillow: `10 passed, 2 skipped`; dentro del bot, además, las ocho de `LIVE` se saltan).

- [ ] **Step 5: Verificación: los bytes, la hoja de contacto y Tabla de PG2**

Primero, los bytes, con los 15 escudos de la clasificación de PG2 resueltos como los resuelve la app:

```bash
cd /home/manolo/claude/futbol-base
: "${S:?falta S: la línea export S= de la cabecera}"
mkdir -p "$S/escudos"
cat > "$S/escudos/pg2.mjs" <<'EOF'
// Los ficheros de escudo de la clasificación de PG2 (prebenjamín, 2025-26) con los datos del árbol, como
// los resuelve la app (shieldFile de src/state.js). Uso, desde la raíz del repo: node pg2.mjs
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import vm from 'node:vm';

const ROOT = process.cwd();
const { shieldFile } = await import(pathToFileURL(join(ROOT, 'src', 'state.js')).href);
const context = vm.createContext({});
for (const file of ['data-prebenjamin.js', 'data-shields.js']) vm.runInContext(readFileSync(join(ROOT, file), 'utf8'), context);
const { PREBENJAMIN, SHIELDS } = vm.runInContext('({ PREBENJAMIN, SHIELDS })', context);
console.log(PREBENJAMIN.find((group) => group.id === 'PG2').standings.map((row) => shieldFile(row[1], SHIELDS)).join(' '));
EOF
python3 - "$(node "$S/escudos/pg2.mjs")" <<'PY'
import sys
from pathlib import Path

originals = [p for p in Path("escudos").iterdir() if p.is_file()]
thumbs = list(Path("escudos/s").iterdir())
size = lambda paths: sum(p.stat().st_size for p in paths)  # noqa: E731
pg2 = sys.argv[1].split()
print(f"originales: {len(originals)} ficheros, {size(originals)} bytes")
print(f"miniaturas: {len(thumbs)} ficheros, {size(thumbs)} bytes ({100 * size(thumbs) / size(originals):.1f} % de los originales)")
print(f"Tabla (PG2, {len(pg2)} escudos): {size(Path('escudos', f) for f in pg2)} bytes los originales"
      f" y {size(Path('escudos', 's', Path(f).stem + '.png') for f in pg2)} las miniaturas")
PY
```
Esperado (Pillow 12.1.1 con zlib 1.3; con otras versiones, los bytes de las miniaturas pueden variar un poco, y las pruebas no dependen de ellos):
```text
originales: 176 ficheros, 2640463 bytes
miniaturas: 176 ficheros, 585820 bytes (22.2 % de los originales)
Tabla (PG2, 15 escudos): 125568 bytes los originales y 46169 las miniaturas
```

Después, los escudos como los pinta Chrome a DPR 3 (`hoja-escudos.mjs`), la medida de cada par (`hoja-escudos.py`), las hojas de contacto para mirar y Tabla de PG2 a 390 px:
- `medida`: cada original junto a su miniatura, a 16, 24, 32 y 46 px CSS, en claro y en oscuro;
- las hojas: `pg2` (los 15 de Tabla), `peores` (los 12 con más diferencia píxel a píxel de la medida) y `control` (el degradado de `carnevaliEscudo-25-26.png`, tres escudos con perfil Adobe RGB, entre ellos el de Las Mesas, los dos JPEG y los dos originales más grandes);
- `tabla`: la pantalla real con los datos del árbol, con las miniaturas y con `escudos/s/` caído, que la cadena de `crest()` resuelve con los originales.

```bash
cd /home/manolo/claude/futbol-base
: "${S:?falta S: la línea export S= de la cabecera}"
mkdir -p "$S/escudos"
cat > "$S/escudos/hoja-escudos.mjs" <<'EOF'
// Tarea 4 del plan B4: los escudos como los pinta Chrome, a DPR 3. Se ejecuta desde la raíz del repo.
//   node hoja-escudos.mjs medida <dir>     cada original junto a su miniatura, a 16, 24, 32 y 46 px CSS,
//                                          sobre el papel claro (#FFFFFF) y el oscuro (#15171C): una
//                                          captura por tamaño y tema, y las cajas de cada par en
//                                          cajas.json, que compara hoja-escudos.py
//   node hoja-escudos.mjs hoja <dir> <nombre> <original>...
//                                          hojas para mirar, de 8 escudos: por fila, el original y la
//                                          miniatura a los cuatro tamaños; <nombre>-<n>-claro.png y
//                                          <nombre>-<n>-oscuro.png
//   node hoja-escudos.mjs tabla <dir>      Tabla de PG2 con los datos del árbol a 390 px, en claro y en
//                                          oscuro: con las miniaturas y con escudos/s/ caído (la cadena
//                                          de crest() pinta entonces los originales)
import { createRequire } from 'node:module';
import { mkdirSync, readdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const ROOT = process.cwd();
const [mode, out, ...rest] = process.argv.slice(2);
mkdirSync(out, { recursive: true });
const tests = (file) => pathToFileURL(join(ROOT, 'scripts', 'tests', file)).href;
const { findChrome, startServer } = await import(tests('render-smoke.mjs'));
const { waitForAsync } = await import(tests('browser-wait.mjs'));
const { chromium } = createRequire(join(ROOT, 'scripts', 'tests', 'render-smoke.mjs'))('playwright');
const browser = await chromium.launch({ executablePath: findChrome(), headless: true, args: ['--no-sandbox', '--allow-file-access-from-files'] });
const SIZES = [16, 24, 32, 46];
const THEMES = { claro: ['#FFFFFF', '#15171C'], oscuro: ['#15171C', '#EDEDED'] };
const originals = readdirSync(join(ROOT, 'escudos')).filter((f) => /\.(png|jpe?g)$/i.test(f)).sort();
const thumb = (file) => `${file.replace(/\.[^./]+$/, '')}.png`;
const src = (path) => pathToFileURL(resolve(ROOT, path)).href;
const img = (path, px, gap = 0) => `<img src="${src(path)}" width="${px}" height="${px}" style="object-fit:contain;vertical-align:middle;margin-left:${gap}px">`;
const loaded = () => [...document.images].every((i) => i.complete && i.naturalWidth > 0);

// Guarda la página en <dir>/<file>.html, la abre a DPR 3 y la captura entera; devuelve las cajas de los pares.
async function shoot(html, file, width) {
  const page = await browser.newPage({ viewport: { width, height: 400 }, deviceScaleFactor: 3 });
  const path = join(out, file);
  writeFileSync(`${path}.html`, html);
  await page.goto(pathToFileURL(`${path}.html`).href);
  await waitForAsync(page, loaded, null, { label: file });
  const boxes = await page.evaluate(() => [...document.querySelectorAll('[data-par]')].map((el) => {
    const [a, b] = [...el.querySelectorAll('img')].map((i) => { const r = i.getBoundingClientRect(); return [r.x, r.y, r.width, r.height]; });
    return { name: el.dataset.par, a, b };
  }));
  await page.screenshot({ path, fullPage: true });
  await page.close();
  return boxes;
}

if (mode === 'medida') {
  const cajas = {};
  for (const px of SIZES) {
    for (const [theme, [bg]] of Object.entries(THEMES)) {
      const pairs = originals.map((f) => `<span data-par="${f}" style="display:inline-block;margin:0 8px 8px 0">${img(`escudos/${f}`, px)}${img(`escudos/s/${thumb(f)}`, px, 4)}</span>`).join('');
      const file = `medida-${px}-${theme}.png`;
      cajas[file] = await shoot(`<!doctype html><meta charset="utf-8"><body style="margin:8px;background:${bg};line-height:0">${pairs}`, file, 1200);
    }
  }
  writeFileSync(join(out, 'cajas.json'), JSON.stringify(cajas));
  console.log(`medida: ${originals.length} escudos, ${Object.keys(cajas).length} capturas`);
} else if (mode === 'hoja') {
  const [name, ...files] = rest;
  const pages = Math.ceil(files.length / 8);
  for (let n = 1; n <= pages; n += 1) {
    const rows = files.slice((n - 1) * 8, n * 8).map((f) => `<tr><th>${f.slice(0, 26)}</th>${SIZES.map((px) => `<td>${img(`escudos/${f}`, px)}${img(`escudos/s/${thumb(f)}`, px, 6)}</td>`).join('')}</tr>`).join('');
    for (const [theme, [bg, fg]] of Object.entries(THEMES)) {
      await shoot(`<!doctype html><meta charset="utf-8"><style>body{margin:8px;background:${bg};color:${fg};font:12px/1.2 sans-serif}td{padding:4px 10px;white-space:nowrap}th{text-align:left;font-weight:normal;padding-right:6px}</style><table><tr><th></th>${SIZES.map((px) => `<th>${px} px</th>`).join('')}</tr>${rows}</table>`, `${name}-${n}-${theme}.png`, 700);
    }
  }
  console.log(`hoja ${name}: ${files.length} escudos en ${pages} ${pages === 1 ? 'hoja' : 'hojas'}, en claro y en oscuro`);
} else if (mode === 'tabla') {
  const server = await startServer();
  const url = `http://127.0.0.1:${server.address().port}/index.html#/tabla?s=2025-2026&g=PG2`;
  for (const variant of ['miniaturas', 'originales']) {
    for (const theme of Object.keys(THEMES)) {
      const context = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, colorScheme: theme === 'claro' ? 'light' : 'dark', serviceWorkers: 'block', locale: 'es-ES', timezoneId: 'Atlantic/Canary' });
      if (variant === 'originales') await context.route(/\/escudos\/s\//, (route) => route.fulfill({ status: 404, body: '' }));
      const page = await context.newPage();
      await page.goto(url);
      const table = page.locator('#contenido section[data-screen="tabla"] table').first();
      await table.waitFor();
      await waitForAsync(page, () => {
        for (const i of document.querySelectorAll('img[loading="lazy"]')) i.loading = 'eager';
        return [...document.querySelectorAll('img.crest')].every((i) => i.complete && i.naturalWidth > 0);
      }, null, { label: `Tabla con ${variant}, en ${theme}` });
      const paths = await table.evaluate((t) => [...t.querySelectorAll('img.crest')].map((i) => new URL(i.currentSrc).pathname));
      await table.screenshot({ path: join(out, `tabla-${variant}-${theme}.png`) });
      console.log(`tabla con ${variant}, en ${theme}: ${paths.length} escudos, ${paths.filter((p) => p.includes('/escudos/s/')).length} de escudos/s/`);
      await context.close();
    }
  }
  server.close();
}
await browser.close();
EOF
cat > "$S/escudos/hoja-escudos.py" <<'EOF'
"""Tarea 4 del plan B4: compara, en las capturas de `node hoja-escudos.mjs medida <dir>`, cada original
con su miniatura tal como las pinta Chrome, con dos medidas por par (de 0 a 255):
- color medio: la mayor diferencia, por canal, entre los colores medios de las dos cajas. Un color mal
  convertido (un perfil ICC olvidado) la sube a 9-11 en los escudos con perfil;
- píxel a píxel: la diferencia media por canal. Recoge también el reescalado (Chrome reduce el original
  y amplía o reduce la miniatura) y el redondeo de object-fit con otras proporciones.
Imprime, por tamaño y tema, el peor par y la mediana de cada medida, y deja en <dir>/peores.txt los 12
escudos con más diferencia píxel a píxel, para mirarlos en una hoja. Uso: python3 hoja-escudos.py <dir>"""
import json
import sys
from pathlib import Path

from PIL import Image, ImageChops, ImageStat

out = Path(sys.argv[1])
cajas = json.loads((out / "cajas.json").read_text())
worst = {}
for file in sorted(cajas, key=lambda name: (int(name.split("-")[1]), name)):
    shot = Image.open(out / file).convert("RGB")
    color, pixel = [], []
    for pair in cajas[file]:
        a, b = (shot.crop((round(x * 3), round(y * 3), round((x + w) * 3), round((y + h) * 3))) for x, y, w, h in (pair["a"], pair["b"]))
        color.append((max(abs(p - q) for p, q in zip(ImageStat.Stat(a).mean, ImageStat.Stat(b).mean)), pair["name"]))
        pixel.append((sum(ImageStat.Stat(ImageChops.difference(a, b)).mean) / 3, pair["name"]))
        worst[pair["name"]] = max(worst.get(pair["name"], 0), pixel[-1][0])
    color.sort(reverse=True)
    pixel.sort(reverse=True)
    _, px, theme = file[:-4].split("-")
    print(f"{px} px en {theme}: color medio, peor {color[0][0]:.1f} ({color[0][1]}) y mediana {color[len(color) // 2][0]:.1f};"
          f" píxel a píxel, peor {pixel[0][0]:.1f} ({pixel[0][1]}) y mediana {pixel[len(pixel) // 2][0]:.1f}")
ranking = sorted(worst.items(), key=lambda item: -item[1])[:12]
(out / "peores.txt").write_text(" ".join(name for name, _ in ranking) + "\n")
print("peores.txt:", " ".join(name for name, _ in ranking))
EOF
rm -rf "$S/escudos/hoja"
node "$S/escudos/hoja-escudos.mjs" medida "$S/escudos/hoja"
python3 "$S/escudos/hoja-escudos.py" "$S/escudos/hoja"
node "$S/escudos/hoja-escudos.mjs" hoja "$S/escudos/hoja" pg2 $(node "$S/escudos/pg2.mjs")
node "$S/escudos/hoja-escudos.mjs" hoja "$S/escudos/hoja" peores $(cat "$S/escudos/hoja/peores.txt")
node "$S/escudos/hoja-escudos.mjs" hoja "$S/escudos/hoja" control carnevaliEscudo-25-26.png lasMesasEscudo.png escudoSantaCruz.png escudoGuayarmina.png joveroLasRosas.jpg football-project.jpg lasTorresLasPalmas.png 100x100puertocarmen.png
node "$S/escudos/hoja-escudos.mjs" tabla "$S/escudos/hoja"
```
Esperado (Chrome 150; con otro Chrome las décimas pueden moverse):
```text
medida: 176 escudos, 8 capturas
16 px en claro: color medio, peor 1.8 (100x100puertocarmen.png) y mediana 0.2; píxel a píxel, peor 14.8 (100x100lasmajoreras.png) y mediana 1.9
16 px en oscuro: color medio, peor 1.3 (200x200atleticograncanaria19-20.png) y mediana 0.4; píxel a píxel, peor 12.6 (100x100fomento.png) y mediana 1.8
24 px en claro: color medio, peor 1.9 (InterColoniaEscudo.png) y mediana 0.1; píxel a píxel, peor 6.3 (futbolPDC2016.png) y mediana 1.9
24 px en oscuro: color medio, peor 2.3 (InterColoniaEscudo.png) y mediana 0.4; píxel a píxel, peor 6.2 (futbolPDC2016.png) y mediana 1.8
32 px en claro: color medio, peor 1.5 (200x200atleticograncanaria19-20.png) y mediana 0.1; píxel a píxel, peor 7.3 (200x200atleticograncanaria19-20.png) y mediana 1.9
32 px en oscuro: color medio, peor 1.3 (200x200atleticograncanaria19-20.png) y mediana 0.4; píxel a píxel, peor 6.9 (futbolPDC2016.png) y mediana 1.8
46 px en claro: color medio, peor 5.2 (futbolPDC2016.png) y mediana 0.1; píxel a píxel, peor 23.0 (futbolPDC2016.png) y mediana 1.8
46 px en oscuro: color medio, peor 3.2 (futbolPDC2016.png) y mediana 0.4; píxel a píxel, peor 22.9 (futbolPDC2016.png) y mediana 1.7
peores.txt: futbolPDC2016.png 100x100lasmajoreras.png 100x100fomento.png almegrancaEscudo.png 200x200barrioAtlantico.png 200x200atleticograncanaria19-20.png InterColoniaEscudo.png 100x100puertocarmen.png 100x100sanfernando.png 100x100lashuesas2017.png 100x100villa.png 200x200claret.png
hoja pg2: 15 escudos en 2 hojas, en claro y en oscuro
hoja peores: 12 escudos en 2 hojas, en claro y en oscuro
hoja control: 8 escudos en 1 hoja, en claro y en oscuro
tabla con miniaturas, en claro: 15 escudos, 15 de escudos/s/
tabla con miniaturas, en oscuro: 15 escudos, 15 de escudos/s/
tabla con originales, en claro: 15 escudos, 0 de escudos/s/
tabla con originales, en oscuro: 15 escudos, 0 de escudos/s/
```

Abrir con Read las 10 hojas (`pg2-1-claro.png`, `pg2-1-oscuro.png`, `pg2-2-claro.png`, `pg2-2-oscuro.png`, `peores-1-claro.png`, `peores-1-oscuro.png`, `peores-2-claro.png`, `peores-2-oscuro.png`, `control-1-claro.png` y `control-1-oscuro.png`) y las 4 capturas de Tabla (`tabla-miniaturas-claro.png`, `tabla-originales-claro.png`, `tabla-miniaturas-oscuro.png` y `tabla-originales-oscuro.png`), todas en `$S/escudos/hoja/`. En cada par de las hojas, el original va a la izquierda y la miniatura a la derecha:
- **el color:** el mismo en cada par, también en los de perfil Adobe RGB (el rojo de Las Mesas, Santa Cruz y Guayarmina) y en el oscuro, sin bandas en el degradado azul de Carnevali;
- **el borde:** ni halo claro en el tema oscuro ni dientes en el contorno; los dos JPEG llevan su fondo blanco, como sus originales (en el tema oscuro se ve la caja: es del original);
- **el dibujo:** a 46 px, las miniaturas de los originales grandes (`200x200…`, `futbolPDC2016.png`, Las Torres) pueden verse un punto más suaves que el original, sin perder las letras que el original deja leer;
- **Tabla:** las dos capturas de cada tema, iguales; ningún monograma donde el original tenía escudo.

Después, `trim_shields.py` con un equipo nuevo, en una copia del árbol y sin red: la «descarga» es el escudo de Las Mesas. Lo guarda en `escudos/`, pone el equipo en `data-shields.js` y, al terminar, hace su miniatura; `--check` queda al día (los recuentos de equipos son los de `data-shields.js` de hoy):

```bash
cd /home/manolo/claude/futbol-base
: "${S:?falta S: la línea export S= de la cabecera}"
rm -rf "$S/copia-trim" && mkdir -p "$S/copia-trim"
tar -cf - --exclude=./.git --exclude=./node_modules . | tar -xf - -C "$S/copia-trim"
cd "$S/copia-trim"
python3 - <<'PY' | sed '/^$/d'
import json
import re
import sys
sys.path.insert(0, 'scripts')
import trim_shields

text = open('data-shields.js', encoding='utf-8').read()
shields = json.loads(re.search(r"const SHIELDS=(\{.*?\});", text, re.S).group(1))
shields['CD Club Nuevo'] = 'clubNuevoEscudo.png'
with open('data-shields.js', 'w', encoding='utf-8') as f:
    f.write('const SHIELDS=' + json.dumps(shields, ensure_ascii=False, separators=(',', ':')) + ';\n')
trim_shields.fetch_image = lambda url: open('escudos/lasMesasEscudo.png', 'rb').read()
trim_shields.DELAY = 0
trim_shields.main()
PY
python3 scripts/build_crests.py --check; echo "salida: $?"
cd /home/manolo/claude/futbol-base && rm -rf "$S/copia-trim"
```
Esperado:
```text
→ 1 descargados, 298 ya existentes, 0 fallidos
→ data-shields.js actualizado con nombres locales (299 equipos)
escrita: escudos/s/clubNuevoEscudo.png
escudos/s: 1 escritas, 176 al día, 0 borradas
escudos/s: 177 al día
salida: 0
```

Y el bot con un escudo nuevo sin miniatura (foco de revisión 3): toda la suite de pytest en una copia del árbol con `nuevoClubEscudo.png` y sin su miniatura, sin Pillow (un `PIL` que no se deja importar, como el bot, que solo instala pytest y pyyaml), dentro del bot y en `Tests`. Dentro del bot, ninguna falla; en `Tests`, las tres que lo miran:

```bash
cd /home/manolo/claude/futbol-base
: "${S:?falta S: la línea export S= de la cabecera}"
rm -rf "$S/copia-escudo" "$S/sin-pillow" && mkdir -p "$S/copia-escudo" "$S/sin-pillow/PIL"
echo 'raise ModuleNotFoundError("sin Pillow, como el bot", name="PIL")' > "$S/sin-pillow/PIL/__init__.py"
tar -cf - --exclude=./.git --exclude=./node_modules . | tar -xf - -C "$S/copia-escudo"
cd "$S/copia-escudo"
cp escudos/lasMesasEscudo.png escudos/nuevoClubEscudo.png
for workflow in "Actualización automática" Tests; do
  echo "$workflow: $(GITHUB_WORKFLOW="$workflow" PYTHONPATH="$S/sin-pillow" python3 -m pytest scripts/tests/ -q -p no:cacheprovider 2>&1 | tail -1 | sed -E 's/ in [0-9.]+s$//')"
done
cd /home/manolo/claude/futbol-base && rm -rf "$S/copia-escudo" "$S/sin-pillow"
```
Esperado:
```text
Actualización automática: 485 passed, 20 skipped
Tests: 3 failed, 489 passed, 13 skipped
```

- [ ] **Step 6: Suites completas y los tres smoke, sin filtro**

```bash
cd /home/manolo/claude/futbol-base
python3 -m pytest scripts/tests/ -q 2>&1 | tail -1
node --test scripts/tests/test_*.mjs 2>&1 | grep -E '^# (tests|pass|fail)'
```
Esperado:
- pytest: el recuento anterior más 12, sin fallos (`488 passed, 5 skipped` → `500 passed, 5 skipped`). En el CI, sin Pillow, las dos de Pillow de `test_build_crests.py` se saltan.
- node: sin cambios (734), sin fallos.

Los smoke, tres pasadas y sin el filtro de los 404 de `escudos/s/`, que ya no salen:

```bash
cd /home/manolo/claude/futbol-base
for i in 1 2 3; do
  out=$({ node scripts/tests/render-smoke.mjs && node scripts/tests/interaction-smoke.mjs && node scripts/tests/pwa-smoke.mjs; } 2>&1)
  echo "pasada $i: $(grep -c '^PASS' <<<"$out") PASS; otras líneas: $(grep -vc '^PASS' <<<"$out")"
done
```
Esperado: en cada pasada, las 21 líneas PASS de la Tarea 3 y `otras líneas: 0` (antes, 15 líneas `PWA fixture HTTP 404 /escudos/s/…`, que filtraban los bloques de las Tareas 1 a 3):
```text
pasada 1: 21 PASS; otras líneas: 0
pasada 2: 21 PASS; otras líneas: 0
pasada 3: 21 PASS; otras líneas: 0
```

- [ ] **Step 7: Commit**

```bash
cd /home/manolo/claude/futbol-base
git add scripts/build_crests.py scripts/tests/test_build_crests.py escudos/s docs/temporada-nueva.md scripts/trim_shields.py
git commit -q -F - <<'EOF'
feat(rediseño): miniaturas de los escudos en escudos/s/, con build_crests.py (B4, tarea 4)

- scripts/build_crests.py (Pillow; a mano al añadir o cambiar un escudo):
  cada escudos/<nombre>.<png|jpg> da escudos/s/<nombre>.png en sRGB (los 22
  originales con perfil ICC se convierten, como hace el navegador), con el
  lado mayor en 96 px como mucho y sin ampliar, LANCZOS y una paleta de 256
  colores con transparencia. Las 176 pesan 585.820 bytes frente a los
  2.640.463 de los originales, y las 15 de Tabla de PG2, 46.169 frente a
  125.568; en RGBA, Tabla no bajaría nada (decisión 9).
- Cada miniatura guarda el sha1 de su original y la receta (tEXt «escudo»):
  --check dice sin Pillow y sin escribir si falta, sobra o se quedó atrás
  alguna. Una segunda pasada no cambia nada.
- La hoja de contacto (16, 24, 32 y 46 px CSS a DPR 3, en claro y en
  oscuro) y Tabla de PG2 a 390 px, sin diferencias a la vista.
- test_build_crests: cada original con su miniatura y al revés, sin nombres
  repetidos, PNG con paleta del tamaño de la receta, al día y --check sin
  Pillow; con Pillow, el color en sRGB, que solo escribe lo que cambió y el
  giro del EXIF. Las que leen escudos/ se saltan dentro de un bot
  (GITHUB_WORKFLOW que no sea Tests): un escudo sin su miniatura pone Tests
  en rojo, nunca al bot que publica los datos (decisión 51).
- trim_shields.py hace las miniaturas de los escudos que trae (decisión 52).
- docs/temporada-nueva.md: el paso de un escudo nuevo (el original en
  escudos/, su entrada en data-shields.js, build_crests.py y los tres en
  el commit), que test_build_crests exige.

Los smoke ya no imprimen los 404 de escudos/s/.

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01Sg56KK3oZgo8Ye7Snj6wG9
EOF
git show --stat --oneline HEAD | tail -1
```
Esperado: `180 files changed, 456 insertions(+), 1 deletion(-)`: son nuevos `scripts/build_crests.py`, `scripts/tests/test_build_crests.py` y las 176 miniaturas de `escudos/s/` (binarias: no suman líneas), y cambian `docs/temporada-nueva.md` y `scripts/trim_shields.py`.

---

### Task 5: `sw.js` y el CI: `activate` solo con las cachés de la app; `tests.yml` con la fuente, los iconos, los escudos y sus acciones en Node 24; `update.yml` en Node 24 y todos los workflows en Ubuntu 24.04 (spec §5.5; decisiones 8, 12 y 55)

Dos arreglos de infraestructura sin cambio visible: el SW deja de borrar las cachés de otros proyectos del mismo origen, y el CI corre también cuando solo cambian la fuente, los iconos o los escudos, con acciones que ya no avisan de Node 20, como el bot; y la imagen de todos los workflows se fija en la de hoy.

**Contexto**
- **`activate` (decisión 8).** Hoy (`sw.js:158-164`) borra toda caché cuyo nombre no sea `CACHE_NAME`. El origen, `malolocabreralolo-tech.github.io`, lo comparte otro proyecto de la cuenta: si usara Cache Storage, perdería sus cachés con cada publicación de esta app (plan B3, «Lo que B3 deja avisado»). Pasa a borrar solo las `futbolbase-v*` que no son `CACHE_NAME`, el mismo ámbito que ya tiene la limpieza del arranque de `index.html`. El paso de B3 a B4 no cambia: la caché de B3 es `futbolbase-v…` y se borra igual.
  - La prueba, en `test_sw_fixes.mjs`: ejecuta el `activate` de verdad (el cargador `loadSw` ya acepta globales) con un `caches` falso con seis nombres, y solo se borran las dos `futbolbase-v*` de otras versiones; ni `otro-proyecto-v1`, ni `workbox-precache-v2`, ni una `futbolbase` sin `-v`. Hoy borra cinco.
- **El filtro de rutas de `tests.yml` (decisión 12; §5.5).** `push` y `pull_request` añaden `fonts/**`, `icons/**` y `escudos/**`. Un cambio que solo toque esas carpetas corre las pruebas que las miran: `test_rediseno_assets.mjs` (la fuente), `test_build_icons.py`, `test_build_crests.py` (Tarea 4) y el precache de `test_sw_fixes.mjs`.
- **Las acciones, en la versión mayor más baja que corre en Node 24 (decisión 12).** Hoy, `actions/checkout@v4`, `actions/setup-python@v5` y `actions/setup-node@v4` declaran `using: node20`, y el CI lo avisa en cada trabajo, por ejemplo en los de Node: «Node.js 20 is deprecated. The following actions target Node.js 20 but are being forced to run on Node.js 24: actions/checkout@v4, actions/setup-node@v4» (ejecución 36207068039, 26/09/2026; en el de pytest, con `actions/setup-python@v5`). Según sus notas de versión (`gh release view <tag> -R actions/<acción>`) y el `runs.using` de su `action.yml`:
  - `actions/checkout`: **v5**. v5.0.0 (11/08/2025): «Update actions checkout to use node 24». La última v4 (v4.4.0, 20/07/2026) sigue en `node20`. `v5` apunta hoy a v5.1.0, que retroporta `allow-unsafe-pr-checkout`: un cambio incompatible que solo afecta a `pull_request_target` y `workflow_run`, y `tests.yml` no los usa.
  - `actions/setup-python`: **v6**. v6.0.0 (04/09/2025), «Breaking Changes»: «Upgrade to node 24». La última v5 (v5.6.0) sigue en `node20`. `v6` apunta hoy a v6.3.0.
  - `actions/setup-node`: **v5**. v5.0.0 (04/09/2025): «Upgrade action to use node24». La última v4 (v4.4.0) sigue en `node20`. Su otro cambio incompatible (la caché automática cuando `package.json` trae `packageManager`) no aplica: el repositorio no tiene `package.json`.
  - Las tres piden un runner v2.327.1 o posterior; los de GitHub lo son.
- **`update.yml`, en las mismas versiones** (decisión 55; B3 de la revisión, que corrige la 12): `checkout@v5` y `setup-python@v6`, sin tocar nada más de sus pasos. Su `git push` no espera a los datos nuevos: el bot empuja `data-health.json` de 1 a 4 veces al día, así que el cambio se ejerce en horas, y sus suites siguen bloqueando. La Tarea 7 lo lanza una vez a mano tras publicar (paso 10). Los `fetch-fiflp*.yml` y los demás workflows no cambian de acciones (B5).
- **La imagen, fijada en todos los workflows** (decisión 55): `runs-on: ubuntu-24.04` en los 10 de `.github/workflows/` (12 trabajos). Es la imagen de hoy (`ubuntu-latest` lo es hasta el 19/10/2026, cuando pasa a Ubuntu 26, que podría dejar al bot sin su Python 3.11 de `setup-python`): ningún cambio de conducta.
- **Las pruebas de `test_workflows.py`** (cuatro más): el filtro con las tres carpetas en los dos eventos; cada acción de `tests.yml` y de `update.yml` en la versión de la tabla `NODE24`, con las citas de arriba (una acción nueva, o subir una, obliga a comprobarla y a apuntarla); y la imagen de todos los trabajos de todos los workflows.
- Lo que no se puede probar en local, que las acciones nuevas corren en el CI de GitHub sin avisar de Node 20, se comprueba al publicar (Tarea 7): la ejecución de `tests.yml` sobre la rama no trae ese aviso.

**Files:**
- Modify: `sw.js`, `.github/workflows/tests.yml` y `.github/workflows/update.yml`, y la imagen de los otros ocho: `debug-fiflp-copa.yml`, `discover-fiflp.yml`, `fetch-fiflp-actas.yml`, `fetch-fiflp-cups-2324.yml`, `fetch-fiflp-cups.yml`, `fetch-fiflp-islas.yml`, `fetch-fiflp.yml` y `fetch-wayback-2324.yml` (en `.github/workflows/`)
- Test: `scripts/tests/test_sw_fixes.mjs` y `scripts/tests/test_workflows.py`

**Interfaces:**
- Consumes: `loadSw(globals)` de `test_sw_fixes.mjs` (el SW en un contexto `vm`, con `listeners.activate`); `_load` y `_triggers` de `test_workflows.py`.
- Produces: el `activate` de `sw.js`, que borra `k.startsWith('futbolbase-v') && k !== CACHE_NAME`; en `tests.yml`, las rutas `fonts/**`, `icons/**` y `escudos/**` en `push` y `pull_request`, y `actions/checkout@v5`, `actions/setup-python@v6` y `actions/setup-node@v5`; en `update.yml`, `actions/checkout@v5` y `actions/setup-python@v6`; `runs-on: ubuntu-24.04` en todos los trabajos; en `test_workflows.py`, `NODE24 = {"actions/checkout": "v5", "actions/setup-python": "v6", "actions/setup-node": "v5"}`, para `tests.yml` y `update.yml`.

- [ ] **Step 1: Write the failing test**

Añadir al final de `scripts/tests/test_sw_fixes.mjs`:

```js
// ─── 6. activate: solo las cachés de esta app (decisión 8 de B4) ────────────
test('activate solo borra las cachés futbolbase-v* de otras versiones: el origen es compartido (decisión 8 de B4)', async () => {
  // malolocabreralolo-tech.github.io lo comparte otro proyecto de la cuenta: sus cachés no se tocan.
  const deleted = [];
  const worker = loadSw({ caches: {
    keys: async () => ['futbolbase-v20250101', sw.CACHE_NAME, 'futbolbase-v20991231z', 'otro-proyecto-v1', 'workbox-precache-v2', 'futbolbase'],
    delete: async (name) => { deleted.push(name); return true; },
  } });
  let done;
  worker.listeners.activate({ waitUntil: (promise) => { done = promise; } });
  await done;
  assert.deepEqual(deleted.sort(), ['futbolbase-v20250101', 'futbolbase-v20991231z']);
});
```

Y las cuatro de los workflows (el filtro de `tests.yml`, las acciones de `tests.yml` y de `update.yml` y la imagen de todos), detrás de la de `pyyaml`:

```bash
cd /home/manolo/claude/futbol-base
python3 - <<'PY'
from pathlib import Path


def edit(path, pairs):
    """Sustituye cada texto (que tiene que aparecer n veces, 1 si no se dice) o se para sin escribir."""
    p = Path(path)
    s = p.read_text(encoding='utf-8')
    for old, new, *n in pairs:
        assert s.count(old) == (n[0] if n else 1), (path, old[:80], s.count(old))
        s = s.replace(old, new)
    p.write_text(s, encoding='utf-8')


edit('scripts/tests/test_workflows.py', [
('''def test_tests_yml_pytest_installs_pyyaml():
    runs = " ".join(_runs(_load("tests.yml"), "pytest"))
    assert re.search(r"pip install[^\\n]*\\bpyyaml\\b", runs), (
        "pytest job must install pyyaml (test_workflows.py imports yaml)"
    )
''', '''def test_tests_yml_pytest_installs_pyyaml():
    runs = " ".join(_runs(_load("tests.yml"), "pytest"))
    assert re.search(r"pip install[^\\n]*\\bpyyaml\\b", runs), (
        "pytest job must install pyyaml (test_workflows.py imports yaml)"
    )


def test_tests_yml_paths_cover_fonts_icons_and_crests():
    """Plan B4 (spec §5.5): un cambio que solo toque la fuente, los iconos o los escudos corre las
    pruebas que los miran (test_rediseno_assets, test_build_icons, test_build_crests y el precache de
    test_sw_fixes)."""
    trig = _triggers(_load("tests.yml"))
    for event in ("push", "pull_request"):
        paths = trig[event]["paths"]
        for wanted in ("fonts/**", "icons/**", "escudos/**"):
            assert wanted in paths, f"{event} paths must include {wanted}"


# La versión mayor más baja de cada acción que corre en Node 24, según sus notas de versión (plan B4,
# decisiones 12 y 55): checkout v5.0.0 («Update actions checkout to use node 24»), setup-python v6.0.0
# («Upgrade to node 24») y setup-node v5.0.0 («Upgrade action to use node24»). Otra acción, u otra
# versión, se comprueba antes en sus notas y se apunta aquí. En tests.yml y en update.yml, el bot, que
# empuja data-health.json varias veces al día y ejerce el cambio en horas; los demás workflows, en B5.
NODE24 = {"actions/checkout": "v5", "actions/setup-python": "v6", "actions/setup-node": "v5"}


@pytest.mark.parametrize("name", ["tests.yml", "update.yml"])
def test_actions_run_on_node24(name):
    data = _load(name)
    uses = [step["uses"] for job in data["jobs"].values() for step in job["steps"] if "uses" in step]
    assert uses, f"{name} sin acciones"
    for ref in uses:
        action, _, version = ref.partition("@")
        assert NODE24.get(action) == version, f"{name}, {ref}: en Node 24 va {action}@{NODE24.get(action, '?')}"


# La imagen de los runners, fijada en todos los workflows (plan B4, decisión 55): ubuntu-latest pasa a
# Ubuntu 26 el 19/10/2026, y el bot, con el Python 3.11 de setup-python, podría quedarse sin él. Una
# imagen nueva se prueba antes y se cambia aquí y en los workflows a la vez.
def test_every_workflow_pins_its_runner_image():
    workflows = sorted(WF_DIR.glob("*.yml"))
    wrong = {f"{path.name} {job}": spec.get("runs-on")
             for path in workflows for job, spec in _load(path.name)["jobs"].items() if spec.get("runs-on") != "ubuntu-24.04"}
    assert len(workflows) >= 10 and wrong == {}, wrong
'''),
])
print('test_workflows: el filtro de rutas, las acciones en Node 24 y la imagen de los workflows')
PY
```
Esperado:
```text
test_workflows: el filtro de rutas, las acciones en Node 24 y la imagen de los workflows
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd /home/manolo/claude/futbol-base
node --test scripts/tests/test_sw_fixes.mjs 2>&1 | grep -E "^not ok|^    \+   '|^# fail" | sed -E 's/^not ok [0-9]+ /not ok /'
python3 -m pytest scripts/tests/test_workflows.py -q 2>&1 | grep -E "^FAILED|failed" | sed -E 's/ - .*$//; s/ in [0-9.]*s$//'
```
Esperado (el `activate` de hoy borra también las cachés de otros; el pase de pytest cuenta las de hoy de `test_workflows.py`):
```text
not ok - activate solo borra las cachés futbolbase-v* de otras versiones: el origen es compartido (decisión 8 de B4)
    +   'futbolbase',
    +   'otro-proyecto-v1',
    +   'workbox-precache-v2'
# fail 1
FAILED scripts/tests/test_workflows.py::test_tests_yml_paths_cover_fonts_icons_and_crests
FAILED scripts/tests/test_workflows.py::test_actions_run_on_node24[tests.yml]
FAILED scripts/tests/test_workflows.py::test_actions_run_on_node24[update.yml]
FAILED scripts/tests/test_workflows.py::test_every_workflow_pins_its_runner_image
4 failed, 23 passed
```

- [ ] **Step 3: Write minimal implementation**

```bash
cd /home/manolo/claude/futbol-base
python3 - <<'PY'
from pathlib import Path


def edit(path, pairs):
    """Sustituye cada texto (que tiene que aparecer n veces, 1 si no se dice) o se para sin escribir."""
    p = Path(path)
    s = p.read_text(encoding='utf-8')
    for old, new, *n in pairs:
        assert s.count(old) == (n[0] if n else 1), (path, old[:80], s.count(old))
        s = s.replace(old, new)
    p.write_text(s, encoding='utf-8')


edit('sw.js', [
("""self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});""", """// Solo las cachés de esta app (futbolbase-v*) de otras versiones: el origen
// (malolocabreralolo-tech.github.io) lo comparte otro proyecto de la cuenta, y
// sus cachés no se tocan (decisión 8 de B4). La limpieza del arranque de
// index.html se limita a lo mismo.
self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k.startsWith('futbolbase-v') && k !== CACHE_NAME).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});"""),
])
edit('.github/workflows/tests.yml', [
("""      - 'manifest.json'
      - '.github/workflows/tests.yml'""", """      - 'manifest.json'
      - 'fonts/**'
      - 'icons/**'
      - 'escudos/**'
      - '.github/workflows/tests.yml'""", 2),
("""jobs:
""", """# Las acciones, en la versión mayor más baja que corre en Node 24 (plan B4, decisiones 12 y 55; lo fija
# test_workflows.py): checkout@v5, setup-python@v6 y setup-node@v5, como update.yml; y la imagen,
# fijada en ubuntu-24.04, como en todos los workflows.
jobs:
"""),
("      - uses: actions/checkout@v4\n", "      - uses: actions/checkout@v5\n", 3),
("      - uses: actions/setup-python@v5\n", "      - uses: actions/setup-python@v6\n"),
("      - uses: actions/setup-node@v4\n", "      - uses: actions/setup-node@v5\n", 2),
])
edit('.github/workflows/update.yml', [
("    runs-on: ubuntu-latest\n", "    # La imagen fijada y las acciones en Node 24, como tests.yml (plan B4, decisión 55; test_workflows.py).\n    runs-on: ubuntu-latest\n"),
("        uses: actions/checkout@v4\n", "        uses: actions/checkout@v5\n"),
("        uses: actions/setup-python@v5\n", "        uses: actions/setup-python@v6\n"),
])
# Todos los trabajos de todos los workflows, en la imagen de hoy (ubuntu-latest es ubuntu-24.04 hasta el
# 19/10/2026): tres en tests.yml y uno en cada uno de los demás.
workflows = sorted(Path('.github/workflows').glob('*.yml'))
assert len(workflows) == 10, [p.name for p in workflows]
for path in workflows:
    text = path.read_text(encoding='utf-8')
    jobs = text.count('runs-on: ubuntu-latest')
    assert jobs == (3 if path.name == 'tests.yml' else 1) and text.count('runs-on:') == jobs, (path.name, jobs)
    path.write_text(text.replace('runs-on: ubuntu-latest', 'runs-on: ubuntu-24.04'), encoding='utf-8')
print('sw.js: activate, solo futbolbase-v*; tests.yml: fonts, icons y escudos, y las acciones en Node 24; update.yml, sus acciones en Node 24; los 10 workflows, en ubuntu-24.04')
PY
```
Esperado:
```text
sw.js: activate, solo futbolbase-v*; tests.yml: fonts, icons y escudos, y las acciones en Node 24; update.yml, sus acciones en Node 24; los 10 workflows, en ubuntu-24.04
```

- [ ] **Step 4: Run test to verify it passes**

```bash
cd /home/manolo/claude/futbol-base
node --test scripts/tests/test_sw_fixes.mjs 2>&1 | grep -E '^# (pass|fail)'
python3 -m pytest scripts/tests/test_workflows.py -q 2>&1 | tail -1 | sed 's/ in [0-9.]*s$//'
```
Esperado (el pase de node es el número de pruebas del fichero):
```text
# pass 20
# fail 0
27 passed
```

- [ ] **Step 5: Verificación: las versiones, en su `action.yml`, y los workflows**

Lo que declara cada `action.yml`, la versión de antes y la nueva, y la nota de versión de cada una (con la API de GitHub, solo lectura; la verificación del plan en un clon no lo ejecuta, y sus salidas son las del 26/09/2026):

```bash
cd /home/manolo/claude/futbol-base
for ref in checkout@v4 checkout@v5 setup-python@v5 setup-python@v6 setup-node@v4 setup-node@v5; do
  printf '%s: ' "$ref"
  gh api "repos/actions/${ref%@*}/contents/action.yml?ref=${ref#*@}" --jq .content | base64 -d | sed -nE "s/^ *using: *'?([a-z0-9]+)'?.*/\1/p"
done
gh release view v5.0.0 -R actions/checkout | grep -i 'node 24'
gh release view v6.0.0 -R actions/setup-python | grep -i 'node 24'
gh release view v5.0.0 -R actions/setup-node | grep -i 'node24'
```
Esperado:
```text
checkout@v4: node20
checkout@v5: node24
setup-python@v5: node20
setup-python@v6: node24
setup-node@v4: node20
setup-node@v5: node24
* Update actions checkout to use node 24 by @salmanmkc in https://github.com/actions/checkout/pull/2226
* Upgrade to node 24 by @salmanmkc in https://github.com/actions/setup-python/pull/1164
* Upgrade action to use node24 by @salmanmkc in https://github.com/actions/setup-node/pull/1325
```

Y en el árbol, las rutas y las acciones de `tests.yml` y de `update.yml`, y la imagen de todos los trabajos:

```bash
cd /home/manolo/claude/futbol-base
grep -nE 'runs-on:|uses:|fonts/|icons/|escudos/' .github/workflows/tests.yml
grep -nE 'runs-on:|uses:' .github/workflows/update.yml
grep -ho 'runs-on: .*' .github/workflows/*.yml | sort | uniq -c | sed 's/^ *//'
```
Esperado:
```text
18:      - 'fonts/**'
19:      - 'icons/**'
20:      - 'escudos/**'
36:      - 'fonts/**'
37:      - 'icons/**'
38:      - 'escudos/**'
53:    runs-on: ubuntu-24.04
55:      - uses: actions/checkout@v5
56:      - uses: actions/setup-python@v6
65:    runs-on: ubuntu-24.04
67:      - uses: actions/checkout@v5
68:      - uses: actions/setup-node@v5
77:    runs-on: ubuntu-24.04
79:      - uses: actions/checkout@v5
80:      - uses: actions/setup-node@v5
18:    runs-on: ubuntu-24.04
23:        uses: actions/checkout@v5
26:        uses: actions/setup-python@v6
12 runs-on: ubuntu-24.04
```

- [ ] **Step 6: Suites completas y los tres smoke**

```bash
cd /home/manolo/claude/futbol-base
python3 -m pytest scripts/tests/ -q 2>&1 | tail -1
node --test scripts/tests/test_*.mjs 2>&1 | grep -E '^# (tests|pass|fail)'
for i in 1 2 3; do
  out=$({ node scripts/tests/render-smoke.mjs && node scripts/tests/interaction-smoke.mjs && node scripts/tests/pwa-smoke.mjs; } 2>&1)
  echo "pasada $i: $(grep -c '^PASS' <<<"$out") PASS; otras líneas: $(grep -vc '^PASS' <<<"$out")"
done
```
Esperado:
- pytest: el recuento anterior más 4, sin fallos (`504 passed, 5 skipped`);
- node: el anterior más 1, sin fallos (735);
- los smoke, como en la Tarea 4: 21 líneas PASS y `otras líneas: 0` en las tres pasadas.

- [ ] **Step 7: Commit**

```bash
cd /home/manolo/claude/futbol-base
git add sw.js scripts/tests/test_sw_fixes.mjs scripts/tests/test_workflows.py .github/workflows/tests.yml .github/workflows/update.yml \
  .github/workflows/debug-fiflp-copa.yml .github/workflows/discover-fiflp.yml .github/workflows/fetch-fiflp-actas.yml \
  .github/workflows/fetch-fiflp-cups-2324.yml .github/workflows/fetch-fiflp-cups.yml .github/workflows/fetch-fiflp-islas.yml \
  .github/workflows/fetch-fiflp.yml .github/workflows/fetch-wayback-2324.yml
git commit -q -F - <<'EOF'
fix(rediseño): activate solo borra las cachés futbolbase-v*; tests.yml mira fuentes, iconos y escudos; acciones en Node 24 y la imagen fijada (B4, tarea 5)

- sw.js: activate borra solo las cachés futbolbase-v* de otras versiones;
  el origen lo comparte otro proyecto de la cuenta y sus cachés no se tocan
  (decisión 8). Prueba en test_sw_fixes, con el activate de verdad.
- tests.yml: push y pull_request corren también con fonts/**, icons/** y
  escudos/** (spec §5.5); y sus acciones, en la versión mayor más baja que
  corre en Node 24 según sus notas: checkout@v5 («Update actions checkout to
  use node 24», v5.0.0), setup-python@v6 («Upgrade to node 24», v6.0.0) y
  setup-node@v5 («Upgrade action to use node24», v5.0.0).
- update.yml, en las mismas (checkout@v5 y setup-python@v6), sin tocar sus
  pasos: empuja data-health.json varias veces al día, así que el cambio se
  ejerce en horas y sus suites siguen bloqueando (decisión 55).
- runs-on: ubuntu-24.04 en los 10 workflows: la imagen de hoy, antes de que
  ubuntu-latest pase a Ubuntu 26 el 19/10/2026 (decisión 55).
- test_workflows: el filtro, la tabla NODE24 de tests.yml y update.yml y la
  imagen de todos.

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01Sg56KK3oZgo8Ye7Snj6wG9
EOF
git show --stat --oneline HEAD | tail -1
```
Esperado: `13 files changed, 88 insertions(+), 21 deletions(-)`: modificados `sw.js`, las dos pruebas y los 10 workflows.

---

### Task 6: El presupuesto, medido con un guion del repo: `pages-server.mjs` y `presupuesto.mjs` (spec §5.4; decisión 11)

El presupuesto de §5.4 (portada en menos de 3 s, CLS menor de 0,1 y menos de 300 KB de imágenes en Tabla) ya se cumple, pero solo lo medían los guiones de prueba del controlador (`$S/medir/`). La tarea lo deja en el repositorio como un guion determinista, con el servidor que imita a GitHub Pages que también usa la publicación (Tarea 7), y lo mide con las miniaturas ya hechas.

**Contexto**
- **Por qué no es una prueba:** mide tiempos. `presupuesto.mjs` no se llama `test_*.mjs`, así que ni `node --test` ni el CI lo ejecutan (decisión 11). Se ejecuta en esta tarea y al publicar, contra la web (`--web`, Tarea 7). Sus piezas sin tiempos (el servidor, los argumentos, la mediana y el informe con sus umbrales) sí tienen prueba: `test_presupuesto.mjs`, 4 pruebas, sin navegador.
- **`pages-server.mjs`** (el contrato de la cabecera): `startPagesServer(root, { port = 0 }) → { url, close() }`, con `url` la raíz con su barra final. Sirve el árbol como GitHub Pages: gzip en los ficheros de texto (HTML, CSS, JavaScript, JSON, SVG y el manifiesto) si el navegador lo acepta, `Cache-Control: max-age=600`, el sitio en la raíz y también bajo `/futbol-base/` (la ruta de la web), sin mirar la `?v=`, solo GET y HEAD, y 404 para lo que no existe o queda fuera de `root`. Lee cada fichero en cada petición (el gzip se guarda por fichero, fecha y tamaño), así que puede servir un árbol que cambia debajo, como el ensayo de la publicación de la Tarea 7. Sustituye a `$S/medir/pages.mjs`.
- **`presupuesto.mjs`** sustituye a los guiones de prueba `$S/medir/medir.mjs` y `cls-a.mjs`, sin sus esperas fijas (3 y 4 s tras la portada):
  - el perfil del punto de partida (el móvil de Lighthouse y la auditoría de §5.4): «4G lenta» por CDP (150 ms, 1.638,4 kbit/s de bajada y 750 de subida) y la CPU ×4, en frío (contexto nuevo por apertura, caché desactivada y SW bloqueado);
  - **portada:** `index.html` a 390×844 y DPR 3; «portada pintada» es el momento en que `#contenido section[data-screen="home"]` entra en el documento, visto por un `MutationObserver` instalado antes que cualquier script de la página; la mediana de N aperturas (3), la de la portada y la del LCP, las dos por debajo de 3.000 ms. La línea añade el FCP y los KB transferidos;
  - **CLS:** el mundo A de `fixture-site.mjs` (datos congelados y reloj fijado, `useWorld`), con el mismo perfil, a 390 (DPR 3) y a 1440 px; de cada apertura, la suma de los desplazamientos sin interacción (una cota superior del CLS de web-vitals, que toma la peor ventana); el máximo de N por ancho, por debajo de 0,1. Si la portada no está en A, para con 2: el mundo cambió. Siempre en local, también con `--web`: el mundo A lo sirve Playwright;
  - **imágenes de Tabla:** `index.html#/tabla?s=2025-2026&g=PG2` con los datos del árbol (o los de `--web`), en frío y sin límites de red (los bytes no dependen de ellos), con todas las imágenes de la pantalla: las diferidas (`loading="lazy"`) se piden ya. La suma de los bytes transferidos de las peticiones de tipo imagen, por debajo de 300 KB (de 1.024 bytes, como las cifras del punto de partida). El icono de la pestaña cuenta como «Other», no como imagen;
  - **las esperas, razonadas y sin tiempos fijos:** cada medida espera a que su condición se cumpla (la portada en el documento, `document.fonts` cargada y las imágenes a la vista completas; o la tabla y todas sus imágenes completas), con `waitForAsync`, y a que no quede nada en vuelo por la red (las peticiones de CDP), dos comprobaciones seguidas a 100 ms; después, dos fotogramas y una tarea, para que lleguen las últimas entradas de LCP y de layout-shift. El límite de cada espera es de 90 s;
  - imprime las tres cifras con su umbral y `PRESUPUESTO: OK` (sale con 0) o `PRESUPUESTO: MAL` (sale con 1); si no puede medir (sin Chrome, un tiempo agotado, el mundo A que no da A), `PRESUPUESTO: sin medir: …` y sale con 2.
- **Las cifras** (26/09/2026, Chrome 150, esta máquina, sin otras pruebas en marcha; con las Tareas 1 a 3: los 7 inmediatos con `defer`, sin los dos retirados y con el icono de la pestaña):

  | | portada | LCP | FCP | KB | CLS (390 / 1440 px) | imágenes de Tabla |
  |---|---:|---:|---:|---:|---:|---:|
  | antes de las miniaturas (Tarea 3), dos pasadas | 2.718 y 2.722 ms | 2.792 y 2.796 ms | 608 ms | 336 | 0 / 0,0001 | 125,9 KB en 30 imágenes |
  | después (Tarea 6), dos pasadas | 2.707 y 2.705 ms | 2.784 ms | 604 y 608 ms | 307 | 0 / 0,0001 | 48,0 KB en 15 imágenes |
  | la web publicada (B3), una apertura, 26/09 | 2.716 ms | 2.796 ms | 960 ms | 373 | (local) | 263,1 KB en 30 imágenes |

  - Las miniaturas no cambian la portada (su tiempo lo manda la red: 29 KB menos no se notan en 2,7 s) y bajan Tabla de 125,9 a 48,0 KB, sin los 15 404 de `escudos/s/`.
  - En la web, cada 404 es la página de error de GitHub Pages (9.379 bytes transferidos: 137 KB los 15), y Tabla transfiere hoy 263,1 KB, cerca del umbral de 300. Tras publicar B4, unos 48 KB.
  - «Antes» coincide con el punto de partida sin los dos retirados (2.707 ms y 332 KB en local; con los 9 inmediatos, 2.837 ms y 356 KB), que se midió con los guiones de `$S/medir/` y sus esperas fijas; los 4 KB de más son el icono de la pestaña (Tarea 3), que cuenta como «Other».

**Files:**
- Create: `scripts/tests/pages-server.mjs`, `scripts/tests/presupuesto.mjs` y `scripts/tests/test_presupuesto.mjs`
- Test: `scripts/tests/test_presupuesto.mjs`

**Interfaces:**
- Consumes: `useWorld` (`fixture-site.mjs`, el mundo A), `findChrome` (`render-smoke.mjs`), `waitForAsync` (`browser-wait.mjs`) y Playwright 1.58 de `node_modules` (solo al medir: importar el guion no lo carga, y la prueba corre en el trabajo `node-tests` del CI, que no lo instala).
- Produces:

```js
// scripts/tests/pages-server.mjs
export async function startPagesServer(root, { port = 0 } = {}) → { url, close() }   // url: 'http://127.0.0.1:<puerto>/'
// scripts/tests/presupuesto.mjs
export const LIMITS = { home: 3000, lcp: 3000, cls: 0.1, tablaKB: 300 };
export function parseArgs(argv) → { web: string | null, runs: number }              // --web <url> (con barra final), --runs N (3)
export function median(values) → number
export function report({ home, lcp, fcp, kb, runs, cls, tabla }) → { ok, lines }     // las 4 líneas del informe
// node scripts/tests/presupuesto.mjs [--web <url>] [--runs N] → sale con 0 (OK), 1 (MAL) o 2 (sin medir)
//   portada: <ms> ms (< 3000); LCP <ms> ms (< 3000); FCP <ms> ms; <KB> KB; mediana de N
//   CLS: <x> (< 0,1): 390 px <x> y 1440 px <x>; máximo de N, mundo A
//   imágenes de Tabla: <KB> KB (< 300): <n> imágenes, PG2
//   PRESUPUESTO: OK | PRESUPUESTO: MAL
```

- [ ] **Step 1: Write the failing test**

Crear `scripts/tests/test_presupuesto.mjs`:

```js
// Plan B4, decisión 11: el servidor que imita a GitHub Pages (pages-server.mjs) y las cuentas del
// informe de presupuesto.mjs, sin navegador y sin medir tiempos (el guion mide; estas pruebas, no).
import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { request } from 'node:http';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { gunzipSync } from 'node:zlib';
import { startPagesServer } from './pages-server.mjs';
import { LIMITS, median, parseArgs, report } from './presupuesto.mjs';

// Una petición tal cual, sin descomprimir: estado, cabeceras y bytes.
function get(url, { method = 'GET', headers = {} } = {}) {
  return new Promise((resolve, reject) => {
    const req = request(url, { method, headers }, (res) => {
      const chunks = [];
      res.on('data', (chunk) => chunks.push(chunk));
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: Buffer.concat(chunks) }));
    });
    req.on('error', reject);
    req.end();
  });
}

async function withSite(fn) {
  const root = mkdtempSync(join(tmpdir(), 'pages-'));
  const html = '<!DOCTYPE html><title>sitio</title>' + 'x'.repeat(2000);
  const js = `const DATOS = ${JSON.stringify('y'.repeat(3000))};\n`;
  const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3, 4]);
  writeFileSync(join(root, 'index.html'), html);
  writeFileSync(join(root, 'data-x.js'), js);
  mkdirSync(join(root, 'escudos'));
  writeFileSync(join(root, 'escudos', 'a.png'), png);
  const server = await startPagesServer(root);
  try {
    await fn(server.url, { html, js, png });
  } finally {
    await server.close();
    rmSync(root, { recursive: true, force: true });
  }
}

test('pages-server: index.html en la raíz y bajo /futbol-base/, con max-age=600 como GitHub Pages', async () => {
  await withSite(async (url, { html }) => {
    assert.match(url, /^http:\/\/127\.0\.0\.1:\d+\/$/);
    for (const path of ['', 'index.html', 'futbol-base/', 'futbol-base/index.html?v=20991231a']) {
      const res = await get(url + path);
      assert.equal(res.status, 200, path);
      assert.equal(res.headers['content-type'], 'text/html; charset=utf-8');
      assert.equal(res.headers['cache-control'], 'max-age=600');
      assert.equal(res.body.toString(), html);
    }
  });
});

test('pages-server: gzip en el texto si el navegador lo acepta; las imágenes, tal cual', async () => {
  await withSite(async (url, { js, png }) => {
    const gz = await get(`${url}futbol-base/data-x.js?v=1`, { headers: { 'accept-encoding': 'gzip, deflate, br' } });
    assert.equal(gz.headers['content-encoding'], 'gzip');
    assert.equal(gz.headers['content-type'], 'application/javascript; charset=utf-8');
    assert.equal(Number(gz.headers['content-length']), gz.body.length);
    assert.ok(gz.body.length < js.length / 10, `${gz.body.length} bytes con gzip`);
    assert.equal(gunzipSync(gz.body).toString(), js);
    const plain = await get(`${url}data-x.js`);
    assert.equal(plain.headers['content-encoding'], undefined, 'sin Accept-Encoding, sin gzip');
    assert.equal(plain.body.toString(), js);
    const image = await get(`${url}escudos/a.png`, { headers: { 'accept-encoding': 'gzip' } });
    assert.equal(image.headers['content-type'], 'image/png');
    assert.equal(image.headers['content-encoding'], undefined);
    assert.deepEqual(image.body, png);
  });
});

test('pages-server: 404 fuera del sitio o si no existe; HEAD sin cuerpo; solo GET y HEAD', async () => {
  await withSite(async (url) => {
    for (const path of ['escudos/s/a.png', 'escudos', '..%2f..%2fetc%2fpasswd', 'futbol-base/..%2f..%2fetc%2fhosts', '%E0%A4%A']) {
      assert.equal((await get(url + path)).status, 404, path);
    }
    const head = await get(`${url}index.html`, { method: 'HEAD' });
    assert.equal(head.status, 200);
    assert.equal(head.body.length, 0);
    assert.equal((await get(`${url}index.html`, { method: 'POST' })).status, 405);
  });
});

test('presupuesto: argumentos, mediana y el informe con sus umbrales (spec §5.4)', () => {
  assert.deepEqual(parseArgs([]), { web: null, runs: 3 });
  assert.deepEqual(parseArgs(['--web', 'https://example.test/futbol-base', '--runs', '5']),
    { web: 'https://example.test/futbol-base/', runs: 5 });
  assert.throws(() => parseArgs(['--runs', '0']), /argumento no válido/);
  assert.throws(() => parseArgs(['--rapido']), /argumento no válido/);
  assert.equal(median([2900, 2700, 2800]), 2800);
  assert.equal(median([4, 1, 3, 2]), 2.5);
  assert.deepEqual(LIMITS, { home: 3000, lcp: 3000, cls: 0.1, tablaKB: 300 });
  const base = { home: 2692.4, lcp: 2768.2, fcp: 620, kb: 331.2, runs: 3, cls: { 390: 0, 1440: 0.00012 }, tabla: { bytes: 48435, images: 15 } };
  assert.deepEqual(report(base), {
    ok: true,
    lines: [
      'portada: 2692 ms (< 3000); LCP 2768 ms (< 3000); FCP 620 ms; 331 KB; mediana de 3',
      'CLS: 0,0001 (< 0,1): 390 px 0,0000 y 1440 px 0,0001; máximo de 3, mundo A',
      'imágenes de Tabla: 47,3 KB (< 300): 15 imágenes, PG2',
      'PRESUPUESTO: OK',
    ],
  });
  // Cada umbral es estricto («menos de»), y basta uno para que salga MAL.
  for (const worse of [{ home: 3000 }, { lcp: 3000.4 }, { cls: { 390: 0.1, 1440: 0 } }, { tabla: { bytes: 300 * 1024, images: 15 } }]) {
    const { ok, lines } = report({ ...base, ...worse });
    assert.equal(ok, false, JSON.stringify(worse));
    assert.equal(lines.at(-1), 'PRESUPUESTO: MAL');
  }
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd /home/manolo/claude/futbol-base
node --test scripts/tests/test_presupuesto.mjs 2>&1 | grep -E "Cannot find module|^# (tests|pass|fail)" | sed -E "s#'/[^']*/scripts/tests/#'scripts/tests/#; s# imported from .*##"
```
Esperado:
```text
# Error [ERR_MODULE_NOT_FOUND]: Cannot find module 'scripts/tests/pages-server.mjs'
# tests 1
# pass 0
# fail 1
```

- [ ] **Step 3: Write minimal implementation**

Crear `scripts/tests/pages-server.mjs`:

```js
// Servidor estático que imita a GitHub Pages (decisión 11 del plan B4), para medir el presupuesto
// (presupuesto.mjs) con las mismas condiciones que la web publicada:
// - gzip en los ficheros de texto (HTML, CSS, JavaScript, JSON, SVG y el manifiesto) si el navegador
//   lo acepta, como GitHub Pages; las imágenes y la fuente, tal cual;
// - Cache-Control: max-age=600 en cada respuesta, como GitHub Pages;
// - el sitio en la raíz y también bajo /futbol-base/, la ruta de la web publicada; «/» y
//   «/futbol-base/» son index.html, y la ?v= no cuenta;
// - solo GET y HEAD, y nada fuera de `root` (404).
// startPagesServer(root, { port }) → { url, close() }: url es la raíz, con la barra final.
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize, resolve, sep } from 'node:path';
import { gzipSync } from 'node:zlib';

const PREFIX = '/futbol-base';
const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.mjs': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
};
const COMPRESSIBLE = /^(?:text\/|application\/(?:javascript|json|manifest\+json)|image\/svg\+xml)/;

// El fichero de `root` que sirve una ruta de la URL, o null si queda fuera.
function fileFor(root, pathname) {
  let path;
  try { path = decodeURIComponent(pathname); } catch { return null; }
  if (path === PREFIX || path.startsWith(`${PREFIX}/`)) path = path.slice(PREFIX.length) || '/';
  if (path.endsWith('/')) path += 'index.html';
  const file = normalize(join(root, path));
  return file.startsWith(root + sep) ? file : null;
}

export async function startPagesServer(root, { port = 0 } = {}) {
  const base = resolve(root);
  const gzipped = new Map();
  const server = createServer(async (req, res) => {
    try {
      if (req.method !== 'GET' && req.method !== 'HEAD') {
        res.writeHead(405, { Allow: 'GET, HEAD' });
        res.end();
        return;
      }
      const file = fileFor(base, new URL(req.url, 'http://pages.local').pathname);
      const info = file ? await stat(file).catch(() => null) : null;
      if (!info || !info.isFile()) {
        res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'max-age=600' });
        res.end(req.method === 'HEAD' ? undefined : 'no está en el sitio');
        return;
      }
      const type = TYPES[extname(file).toLowerCase()] || 'application/octet-stream';
      const headers = { 'Content-Type': type, 'Cache-Control': 'max-age=600', Vary: 'Accept-Encoding' };
      let body = await readFile(file);
      if (COMPRESSIBLE.test(type) && /\bgzip\b/.test(req.headers['accept-encoding'] || '')) {
        const key = `${file}\0${info.mtimeMs}\0${info.size}`;
        if (!gzipped.has(key)) gzipped.set(key, gzipSync(body));
        body = gzipped.get(key);
        headers['Content-Encoding'] = 'gzip';
      }
      headers['Content-Length'] = body.length;
      res.writeHead(200, headers);
      res.end(req.method === 'HEAD' ? undefined : body);
    } catch {
      res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('error');
    }
  });
  await new Promise((ready, fail) => {
    server.once('error', fail);
    server.listen(port, '127.0.0.1', ready);
  });
  return {
    url: `http://127.0.0.1:${server.address().port}/`,
    close: () => new Promise((done) => {
      server.closeAllConnections();
      server.close(() => done());
    }),
  };
}
```

Crear `scripts/tests/presupuesto.mjs`:

```js
// El presupuesto de rendimiento de la spec (§5.4), medido con un guion del repo (decisión 11 del plan
// B4). No se llama test_*.mjs: ni node --test ni el CI lo ejecutan, porque mide tiempos.
//
//   node scripts/tests/presupuesto.mjs [--web <url>] [--runs N]
//
// El perfil es el de la auditoría de §5.4, el móvil de Lighthouse: «4G lenta» (150 ms de latencia,
// 1.638,4 kbit/s de bajada y 750 kbit/s de subida) y la CPU ×4, por CDP, en frío (sin caché ni SW).
// - Portada: index.html con los datos del árbol (servido por pages-server.mjs, como GitHub Pages) o
//   los de la web de --web, a 390×844 y DPR 3. «Portada pintada» es el momento en que
//   #contenido section[data-screen="home"] entra en el documento (el esqueleto estático no cuenta).
//   La mediana de N aperturas (3), la suya y la del LCP, tiene que bajar de 3.000 ms.
// - CLS: el mundo A de fixture-site.mjs (datos congelados y reloj fijado), con el mismo perfil, a 390
//   (DPR 3) y a 1440 px. De cada apertura, la suma de los desplazamientos sin interacción (una cota
//   superior del CLS de web-vitals); el máximo de N por ancho, menor de 0,1. Siempre en local: el
//   mundo A lo sirve Playwright.
// - Imágenes de Tabla: index.html#/tabla?s=2025-2026&g=PG2 con los datos del árbol (o los de --web), en
//   frío y con todas las imágenes de la pantalla (las diferidas se piden ya): la suma de los bytes
//   transferidos, menos de 300 KB (de 1.024 bytes).
// Ninguna espera es un tiempo fijo: cada medida espera a su condición (la pantalla en el documento, la
// fuente y las imágenes a la vista completas y nada en vuelo por la red, en dos comprobaciones
// seguidas) y a dos fotogramas, para que lleguen las últimas entradas de LCP y de layout-shift.
// Sale con 0 (PRESUPUESTO: OK), con 1 si un umbral no se cumple (PRESUPUESTO: MAL) y con 2 si no pudo
// medir.
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { waitForAsync } from './browser-wait.mjs';
import { useWorld } from './fixture-site.mjs';
import { startPagesServer } from './pages-server.mjs';
import { findChrome } from './render-smoke.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
export const LIMITS = { home: 3000, lcp: 3000, cls: 0.1, tablaKB: 300 };
const SLOW_4G = { offline: false, latency: 150, downloadThroughput: (1638.4 * 1024) / 8, uploadThroughput: (750 * 1024) / 8 };
const CPU = 4;
const PHONE = { width: 390, height: 844, dpr: 3 };
const DESKTOP = { width: 1440, height: 900, dpr: 1 };
const TABLA = 'index.html#/tabla?s=2025-2026&g=PG2';

export function parseArgs(argv) {
  const args = { web: null, runs: 3 };
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === '--web' && argv[i + 1]) args.web = new URL(argv[(i += 1)]).href.replace(/\/?$/, '/');
    else if (argv[i] === '--runs' && /^[1-9]\d*$/.test(argv[i + 1] || '')) args.runs = Number(argv[(i += 1)]);
    else throw new Error(`argumento no válido: ${argv[i]} (uso: presupuesto.mjs [--web <url>] [--runs N])`);
  }
  return args;
}

export function median(values) {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

const comma = (value, digits) => value.toFixed(digits).replace('.', ',');

// Las líneas del informe y si se cumple todo. home, lcp y fcp: medianas en ms; kb: lo que transfiere
// la portada; cls: { ancho: máximo }; tabla: { bytes, images }.
export function report({ home, lcp, fcp, kb, runs, cls, tabla }) {
  const clsMax = Math.max(...Object.values(cls));
  const tablaKB = tabla.bytes / 1024;
  const ok = home < LIMITS.home && lcp < LIMITS.lcp && clsMax < LIMITS.cls && tablaKB < LIMITS.tablaKB;
  return {
    ok,
    lines: [
      `portada: ${Math.round(home)} ms (< ${LIMITS.home}); LCP ${Math.round(lcp)} ms (< ${LIMITS.lcp}); FCP ${Math.round(fcp)} ms; ${Math.round(kb)} KB; mediana de ${runs}`,
      `CLS: ${comma(clsMax, 4)} (< ${comma(LIMITS.cls, 1)}): ${Object.entries(cls).map(([width, value]) => `${width} px ${comma(value, 4)}`).join(' y ')}; máximo de ${runs}, mundo A`,
      `imágenes de Tabla: ${comma(tablaKB, 1)} KB (< ${LIMITS.tablaKB}): ${tabla.images} imágenes, PG2`,
      `PRESUPUESTO: ${ok ? 'OK' : 'MAL'}`,
    ],
  };
}

// Antes que cualquier script de la página: cuándo entra la portada en el documento, el LCP y la suma de
// los desplazamientos sin interacción.
function observers() {
  const measured = { home: null, lcp: 0, cls: 0 };
  window.__presupuesto = measured;
  new MutationObserver((_, observer) => {
    if (document.querySelector('#contenido section[data-screen="home"]')) {
      measured.home = performance.now();
      observer.disconnect();
    }
  }).observe(document, { childList: true, subtree: true });
  new PerformanceObserver((list) => { for (const entry of list.getEntries()) measured.lcp = entry.startTime; })
    .observe({ type: 'largest-contentful-paint', buffered: true });
  new PerformanceObserver((list) => { for (const entry of list.getEntries()) if (!entry.hadRecentInput) measured.cls += entry.value; })
    .observe({ type: 'layout-shift', buffered: true });
}

// La portada en el documento, la fuente cargada y las imágenes a la vista, completas.
function homeReady() {
  const measured = window.__presupuesto;
  if (!measured || measured.home === null || document.fonts.status !== 'loaded') return false;
  return [...document.images].every((img) => {
    const box = img.getBoundingClientRect();
    return img.complete || box.bottom <= 0 || box.top >= innerHeight || box.width === 0;
  });
}

// La tabla de la clasificación en el documento y todas las imágenes completas: las diferidas se piden ya.
function tablaReady() {
  if (!document.querySelector('#contenido section[data-screen="tabla"] table')) return false;
  for (const img of document.querySelectorAll('img[loading="lazy"]')) img.loading = 'eager';
  return [...document.images].every((img) => img.complete);
}

// Una apertura en frío: contexto nuevo sin SW, caché desactivada y, si throttle, la red y la CPU del
// perfil. Cuenta lo que hay en vuelo y los bytes transferidos, en total y de las imágenes.
async function coldPage(browser, { width, height, dpr }, { throttle = true, world = null } = {}) {
  const context = await browser.newContext({
    viewport: { width, height }, deviceScaleFactor: dpr, locale: 'es-ES', timezoneId: 'Atlantic/Canary', serviceWorkers: 'block',
  });
  if (world) await useWorld(context, world);
  const page = await context.newPage();
  const cdp = await context.newCDPSession(page);
  await cdp.send('Network.enable');
  await cdp.send('Network.setCacheDisabled', { cacheDisabled: true });
  if (throttle) {
    await cdp.send('Network.emulateNetworkConditions', SLOW_4G);
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: CPU });
  }
  const net = { pending: new Set(), bytes: 0, images: 0, imageBytes: 0 };
  const types = new Map();
  cdp.on('Network.requestWillBeSent', (e) => { if (!e.request.url.startsWith('data:')) net.pending.add(e.requestId); });
  cdp.on('Network.responseReceived', (e) => { types.set(e.requestId, e.type); });
  cdp.on('Network.loadingFinished', (e) => {
    if (!net.pending.delete(e.requestId)) return;
    net.bytes += e.encodedDataLength;
    if (types.get(e.requestId) === 'Image') { net.images += 1; net.imageBytes += e.encodedDataLength; }
  });
  cdp.on('Network.loadingFailed', (e) => { net.pending.delete(e.requestId); });
  await page.addInitScript(observers);
  return { context, page, net };
}

// La página está quieta: su condición se cumple y no hay nada en vuelo, en dos comprobaciones seguidas
// (cada 100 ms, como waitForAsync). Después, dos fotogramas y una tarea.
async function settle(page, net, ready, label) {
  const deadline = Date.now() + 90000;
  for (let calm = 0; calm < 2;) {
    await waitForAsync(page, ready, null, { timeout: Math.max(1, deadline - Date.now()), interval: 100, label });
    calm = net.pending.size === 0 ? calm + 1 : 0;
    if (calm < 2) {
      if (Date.now() > deadline) throw new Error(`${label}: ${net.pending.size} peticiones siguen en vuelo tras 90 s`);
      await new Promise((next) => setTimeout(next, 100));
    }
  }
  await page.evaluate(() => new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(() => setTimeout(done, 0)))));
}

async function measureHome(browser, site, runs) {
  const results = [];
  for (let i = 1; i <= runs; i += 1) {
    const { context, page, net } = await coldPage(browser, PHONE);
    try {
      await page.goto(new URL('index.html', site).href, { waitUntil: 'commit', timeout: 90000 });
      await settle(page, net, homeReady, `portada, apertura ${i}`);
      const times = await page.evaluate(() => ({
        home: window.__presupuesto.home,
        lcp: window.__presupuesto.lcp,
        fcp: performance.getEntriesByName('first-contentful-paint')[0]?.startTime ?? 0,
      }));
      results.push({ ...times, kb: net.bytes / 1024 });
    } finally {
      await context.close();
    }
  }
  const of = (key) => median(results.map((result) => result[key]));
  return { home: of('home'), lcp: of('lcp'), fcp: of('fcp'), kb: of('kb') };
}

async function measureCls(browser, site, runs) {
  const cls = {};
  for (const device of [PHONE, DESKTOP]) {
    cls[device.width] = 0;
    for (let i = 1; i <= runs; i += 1) {
      const { context, page, net } = await coldPage(browser, device, { world: 'A' });
      try {
        await page.goto(new URL('index.html', site).href, { waitUntil: 'commit', timeout: 90000 });
        const label = `CLS a ${device.width} px, apertura ${i}`;
        await settle(page, net, homeReady, label);
        const { state, value } = await page.evaluate(() => ({
          state: document.querySelector('#contenido section[data-screen="home"]').getAttribute('data-state'),
          value: window.__presupuesto.cls,
        }));
        if (state !== 'A') throw new Error(`${label}: la portada del mundo A está en ${state}, no en A`);
        cls[device.width] = Math.max(cls[device.width], value);
      } finally {
        await context.close();
      }
    }
  }
  return cls;
}

async function measureTabla(browser, site) {
  const { context, page, net } = await coldPage(browser, PHONE, { throttle: false });
  try {
    await page.goto(new URL(TABLA, site).href, { waitUntil: 'commit', timeout: 90000 });
    await settle(page, net, tablaReady, 'Tabla de PG2');
    return { bytes: net.imageBytes, images: net.images };
  } finally {
    await context.close();
  }
}

async function main(argv) {
  const args = parseArgs(argv);
  const chrome = findChrome();
  if (!chrome) throw new Error('no hay Chrome: CHROME=/ruta/de/chrome');
  const { chromium } = createRequire(import.meta.url)('playwright');
  const server = await startPagesServer(ROOT);
  const browser = await chromium.launch({ executablePath: chrome, headless: true, args: ['--no-sandbox'] });
  try {
    const site = args.web || server.url;
    console.log(`sitio: ${args.web || 'el árbol, con pages-server.mjs'}; el CLS, en local con el mundo A`);
    const home = await measureHome(browser, site, args.runs);
    const cls = await measureCls(browser, server.url, args.runs);
    const tabla = await measureTabla(browser, site);
    const { lines, ok } = report({ ...home, runs: args.runs, cls, tabla });
    for (const line of lines) console.log(line);
    return ok ? 0 : 1;
  } finally {
    await browser.close();
    await server.close();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main(process.argv.slice(2)).then((code) => { process.exitCode = code; }, (error) => {
    console.error(`PRESUPUESTO: sin medir: ${error.message}`);
    process.exitCode = 2;
  });
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
cd /home/manolo/claude/futbol-base
node --test scripts/tests/test_presupuesto.mjs 2>&1 | grep -E '^# (tests|pass|fail)'
```
Esperado:
```text
# tests 4
# pass 4
# fail 0
```

- [ ] **Step 5: Verificación: el presupuesto, en local y con `--web`**

Con los datos del árbol y las miniaturas de la Tarea 4 (unos 35 s):

```bash
cd /home/manolo/claude/futbol-base
node scripts/tests/presupuesto.mjs; echo "salida: $?"
```
Esperado (26/09/2026, Chrome 150; los tiempos se mueven unas decenas de ms de una pasada a otra, y los KB y el CLS, no):
```text
sitio: el árbol, con pages-server.mjs; el CLS, en local con el mundo A
portada: 2705 ms (< 3000); LCP 2784 ms (< 3000); FCP 608 ms; 307 KB; mediana de 3
CLS: 0,0001 (< 0,1): 390 px 0,0000 y 1440 px 0,0001; máximo de 3, mundo A
imágenes de Tabla: 48,0 KB (< 300): 15 imágenes, PG2
PRESUPUESTO: OK
salida: 0
```

`--web` contra otra copia local servida como la web, bajo `/futbol-base/` (el puerto cambia); la Tarea 7 lo usa contra la web publicada:

```bash
cd /home/manolo/claude/futbol-base
node --input-type=module -e "
import { spawn } from 'node:child_process';
import { startPagesServer } from './scripts/tests/pages-server.mjs';
const web = await startPagesServer(process.cwd());
const child = spawn(process.execPath, ['scripts/tests/presupuesto.mjs', '--web', web.url + 'futbol-base/'], { stdio: 'inherit' });
const code = await new Promise((done) => child.on('exit', done));
await web.close();
console.log('salida:', code);
" | sed -E 's/127\.0\.0\.1:[0-9]+/127.0.0.1:<puerto>/'
```
Esperado (los tiempos, como arriba):
```text
sitio: http://127.0.0.1:<puerto>/futbol-base/; el CLS, en local con el mundo A
portada: 2715 ms (< 3000); LCP 2788 ms (< 3000); FCP 612 ms; 307 KB; mediana de 3
CLS: 0,0001 (< 0,1): 390 px 0,0000 y 1440 px 0,0001; máximo de 3, mundo A
imágenes de Tabla: 48,0 KB (< 300): 15 imágenes, PG2
PRESUPUESTO: OK
salida: 0
```

- [ ] **Step 6: Suites completas y los tres smoke**

```bash
cd /home/manolo/claude/futbol-base
python3 -m pytest scripts/tests/ -q 2>&1 | tail -1
node --test scripts/tests/test_*.mjs 2>&1 | grep -E '^# (tests|pass|fail)'
for i in 1 2 3; do
  out=$({ node scripts/tests/render-smoke.mjs && node scripts/tests/interaction-smoke.mjs && node scripts/tests/pwa-smoke.mjs; } 2>&1)
  echo "pasada $i: $(grep -c '^PASS' <<<"$out") PASS; otras líneas: $(grep -vc '^PASS' <<<"$out")"
done
```
Esperado:
- pytest: sin cambios (`504 passed, 5 skipped`);
- node: el anterior más 4, sin fallos (739). `test_browser_waits.mjs` sigue en verde: ni `presupuesto.mjs` ni `pages-server.mjs` usan `waitForFunction`; y `test_rediseno_config.mjs` ejecuta también `test_presupuesto.mjs` con el `config.js` de 2026/27;
- los smoke, como en la Tarea 4: 21 líneas PASS y `otras líneas: 0` en las tres pasadas.

- [ ] **Step 7: Commit**

```bash
cd /home/manolo/claude/futbol-base
git add scripts/tests/pages-server.mjs scripts/tests/presupuesto.mjs scripts/tests/test_presupuesto.mjs
git commit -q -F - <<'EOF'
test(rediseño): el presupuesto de §5.4, medido con presupuesto.mjs y un servidor como GitHub Pages (B4, tarea 6)

- pages-server.mjs: el árbol servido como GitHub Pages (gzip del texto,
  max-age=600, en la raíz y bajo /futbol-base/), para medir y para ensayar
  la publicación.
- presupuesto.mjs (no es test_*.mjs: mide tiempos y ni node --test ni el CI
  lo ejecutan): en frío, con «4G lenta» y la CPU ×4, la portada (mediana de
  3 de «portada pintada» y del LCP, < 3.000 ms), el CLS del estado A a 390 y
  1440 px (< 0,1) y las imágenes de Tabla de PG2 (< 300 KB); --web mide la
  portada y Tabla de una web publicada. Sin esperas fijas: cada medida
  espera a su condición y a la red en reposo (decisión 11).
- test_presupuesto: el servidor, los argumentos, la mediana y el informe con
  sus umbrales, sin navegador y sin medir tiempos.

Con las miniaturas, PRESUPUESTO: OK: imágenes de Tabla, 48,0 KB (antes,
125,9); CLS, 0,0001; la portada y el LCP, por debajo de 3 s.

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01Sg56KK3oZgo8Ye7Snj6wG9
EOF
git show --stat --oneline HEAD | tail -1
```
Esperado: `3 files changed, 436 insertions(+)`: son nuevos los tres ficheros.

---

### Task 7: Publicar B4 (decisiones 13, 18, 53, 54 y 55; con el visto bueno del usuario, ya dado)

B4 se publica al terminarla, como B2 y B3: se trae `main`, sube la versión con `publicar.py`, `main` avanza cuando el CI de la rama está en verde, se comprueba la web con el perfil de un móvil que tenía B3, apertura a apertura, y el bot se lanza una vez para ver que sigue publicando. La ejecuta el controlador; la verificación de punta a punta del plan ejecuta, en un clon, los pasos que no tocan GitHub, la rama remota ni la web (2 a 6).

**Contexto**
- **El visto bueno está dado** («publicando cada fase al terminarla»), y lo ejecuta el controlador. Es el paso 10 de la Tarea 12 del plan B3, con estos cambios (decisión 13):
  - la versión, con `python3 scripts/publicar.py` (Tarea 2), no con el Python en línea: 9 `?v=` (la hoja, los 7 datos y `app.js`) y `CACHE_NAME`; `CODIGO` se queda en `be0acbf3`, porque B4 no toca `src/` ni `acta.css`; el commit cambia 10 líneas (`2 files changed, 10 insertions(+), 10 deletions(-)`), no 12 como en B3;
  - al traer `main`, los retirados que el bot haya regenerado desde `33e4cff` (`data-stats.js` y `data-matchdetail-keys.js` cambian con casi cada dato nuevo; `data-players-<S>.js`, con las actas) salen como conflictos «modificado en `main`, borrado en la rama»: se resuelven con `git rm`, nunca quedándose con los de `main` (decisión 16; `docs/rediseno-rebase.md` lo dice desde la Tarea 2). Si alguno se colara, `test_rediseno_index.mjs` («no vuelven») sale en rojo;
  - el CI de la rama, con `gh workflow run tests.yml --ref rediseno-acta`, localizando la ejecución por su `headSha`, y `gh run watch "$RUN" --exit-status` (el PR #2 está cerrado); sin el aviso de Node 20 (Tarea 5);
  - en la web: la versión nueva (`sw.js`), las 9 `?v=`, `const CODIGO = 'be0acbf3';`, el `manifest.json` nuevo (`id`, `start_url`, iconos), los iconos PNG y una muestra de miniaturas con 200 (y los dos retirados inmediatos, con 404), y `presupuesto.mjs --web` con `PRESUPUESTO: OK` (`--runs 5`, con la máquina en reposo; decisión 18);
  - el paso de B3 a B4 con un perfil que tenía B3, con `$S/publicar-b4.mjs` (`antes` y `despues`, como `publicar-b3.mjs`; decisión 44), ensayado antes en local (paso 6; decisión 45);
  - capturas de la portada y de Tabla (PG2) a 390 px desde la web publicada, para el usuario (`publicar-b4.mjs capturas`).
- **Lo que distingue una apertura de B3 de una de B4** es su `index.html`: el de B4 lleva los datos con `defer` y el icono PNG, y su `?v=` es la publicada. Los módulos y la hoja no cambian (`CODIGO` igual), así que la limpieza del arranque no se ejecuta y ninguna apertura puede quedar a medias por código.
- **Los retirados en el paso:** el SW de B3 los tiene en su caché, así que una página de B3 los recibe de él (200); sus revalidaciones en segundo plano (con la `?v=` de B3) reciben 404 y se descartan (`sw.js` solo guarda respuestas `ok`). Una página de B4 no los nombra y el SW de B4 no los precachea: ninguna petición de un retirado lleva la versión publicada.
- **Las cifras de antes** (web de B3, 26/09/2026): portada 2.716 ms, LCP 2.796 ms e imágenes de Tabla 263,1 KB, de ellos 137 KB de los 15 404 de `escudos/s/`. Con B4, Tabla tiene que dar unos 48 KB en 15 imágenes.
- **Volver atrás tras publicar**: siempre hacia delante, con otra publicación (plan B3, «Para B4 y siguientes»); nunca volviendo a publicar el `index.html` de B3.
- **Sin ningún workflow en marcha** en cada push: el bloque lo comprueba con `gh run list` y, si hay uno, no empuja y lo dice (decisión 47). Se espera con Monitor y un `until` sobre `gh run list`, nunca con una espera fija, y se repite el paso.
- **Si `main` avanza durante la publicación** (el bot comitea `data-health.json` de 1 a 4 veces al día), el push del paso 8 se rechaza y se vuelve al paso 2: la fusión suele ser limpia, y el bloque pone en ella las marcas de `main`, porque las del commit de la versión no llegaron a publicarse (decisión 53); el paso 3 sube después a una versión estrictamente mayor que la vigente.
- **El bot, tras publicar** (decisión 55): con la web comprobada y sin ningún workflow en marcha, `update.yml` se lanza una vez a mano y se espera en verde (paso 10). Comprueba en el runner real que el bot sigue generando, pasando sus suites y empujando con el generador de B4, sus acciones nuevas y la imagen fijada. Durante esa ejecución, nada de push.
- **Las esperas largas** (decisión 54): la herramienta Bash corta a los 2 minutos si no se le da otro límite, y a los 10 como mucho. Los bloques que pasan de 2 minutos (las suites y los smoke del paso 4) se lanzan con su `timeout` a 600000 ms; los que pueden pasar de 10 (`gh run watch`, la espera de la CDN, la ejecución del bot), en segundo plano (`run_in_background`) o con Monitor. Cada bloque lo dice.
- **El aviso a la familia** (decisión 57): el manifiesto nuevo cambia el nombre («Futbol» pasa a «Fútbol»), el nombre corto, los iconos y los colores, y Android puede preguntar si actualiza la app instalada. El mensaje al usuario con las capturas lo dice: si el móvil pregunta si actualizar el icono y el nombre de la app, aceptar.

**Files:**
- Modify: `index.html` y `sw.js` (las marcas de versión)
- Fuera del repo (`$S`): `publicar-b4.mjs`; `perfil-publicado/`, `version-antes.txt` y `publicado-b4/` (la web); `ensayo/` (el ensayo local)
- En GitHub: la rama `rediseno-acta`, `main` (Pages) y una ejecución de `update.yml` lanzada a mano

**Interfaces:**
- Consumes: `scripts/publicar.py` (Tarea 2), `scripts/sync_versions.py` (`--since`, `--from`, `--check`), `startPagesServer` y `presupuesto.mjs` (Tarea 6), `findChrome` (`render-smoke.mjs`) y `waitForAsync` (`browser-wait.mjs`).
- Produces:

```text
WEB=<url> S=<dir> node $S/publicar-b4.mjs antes      antes: {"screen":"home","alert":false,"v":"<W>","b4":false,"cache":true,"controlled":true}; errores: 0
                                                      (0; y <W>, la versión publicada, en $S/version-antes.txt)
WEB=<url> S=<dir> node $S/publicar-b4.mjs despues    apertura 1..4: B3 o B4 (?v=…), la pantalla, el SW, la caché de la
                                                      publicada, los retirados y los errores; las revalidaciones del SW
                                                      anterior; y OK (0) o MAL (1)
WEB=<url> S=<dir> node $S/publicar-b4.mjs capturas   portada y tabla-pg2: {"screen","h1","overflow","escudos","miniaturas"};
                                                      OK (0) o MAL (1); capturas en $S/publicado-b4/
```

- [ ] **Step 1: Antes de empezar**

El usuario ha dado el visto bueno, no hay ningún workflow en marcha y el árbol está limpio:

```bash
cd /home/manolo/claude/futbol-base
gh run list --limit 5
git status --short
```
Esperado: ninguna fila `in_progress` ni `queued` (si la hay, se espera con Monitor y un `until` sobre `gh run list`, nunca con una espera fija); y solo `?? HANDOFF.md` y `?? docs/mejoras-2026-09.md`, que no están en git.

- [ ] **Step 2: Traer `main` a la rama**

Con lo que el bot haya comiteado desde `33e4cff` (datos, `data-health.json` y sus marcas de versión). Primero, `sync_versions.py --since` comprueba que `main` solo cambió las marcas de `index.html` y `sw.js` (si no, ese cambio se lleva a mano a la rama, como dice `docs/rediseno-rebase.md`). En el merge, «ours» es la rama. Los conflictos que se esperan se resuelven en el mismo bloque (decisión 46): `index.html` y `sw.js`, con la estructura de la rama y las marcas de `main`; los retirados que el bot regeneró, con `git rm`. Cualquier otro conflicto para el bloque y se resuelve a mano (el bot nunca toca `src/`, `scripts/` ni `docs/`).

Si se vuelve aquí desde el paso 8 (`main` avanzó después del commit de la versión), la fusión suele ser limpia y la rama se queda con las marcas de esa publicación, que no llegó a `main`: el bloque pone las de `main` en el commit de la fusión (decisión 53), y el paso 3 sube a una versión estrictamente mayor que la vigente.

```bash
cd /home/manolo/claude/futbol-base
git fetch -q origin
git switch -q rediseno-acta
RETIRADOS='^data-(matchdetail-keys|stats|players-[0-9]{4}-[0-9]{4})\.js$'
ANTES=$(git rev-parse HEAD)
if ! python3 scripts/sync_versions.py --from origin/main --since "$(git merge-base HEAD origin/main)"; then
  echo "no se trae main: antes, ese cambio de index.html o sw.js se lleva a mano a la rama (docs/rediseno-rebase.md)"
elif ! git merge --no-edit origin/main; then
  for f in $(git diff --name-only --diff-filter=U -- index.html sw.js); do git checkout --ours -- "$f" && git add "$f"; done
  git diff --name-only --diff-filter=U | grep -E "$RETIRADOS" | xargs -r git rm -q --
  if [ -n "$(git diff --name-only --diff-filter=U)" ]; then
    echo "conflictos que se resuelven a mano: $(git diff --name-only --diff-filter=U | tr '\n' ' ')"
  else
    python3 scripts/sync_versions.py --from origin/main
    git add index.html sw.js
    git commit -q --no-edit --cleanup=strip && echo "merge con los conflictos esperados resueltos: $(git log -1 --format=%h)"
  fi
elif [ "$(git rev-parse HEAD)" != "$ANTES" ] && ! python3 scripts/sync_versions.py --from origin/main --check > /dev/null; then
  # De vuelta del paso 8: la fusión limpia dejó las marcas del commit de la versión, que no llegó a main.
  python3 scripts/sync_versions.py --from origin/main
  git add index.html sw.js
  git commit -q --amend --no-edit && echo "marcas de main en la fusión: $(git log -1 --format=%h)"
fi
python3 scripts/sync_versions.py --from origin/main --check && echo "marcas de main: iguales"
echo "retirados en el árbol: $(git ls-files | grep -cE "$RETIRADOS")"
```
Esperado: `de <la base común> a origin/main, index.html y sw.js solo cambian las marcas de versión`; después, el merge: `Ya está actualizado.`, o su commit, o sus conflictos, que git nombra en el idioma de la máquina (`CONFLICTO (modificar / eliminar): data-stats.js eliminado en HEAD y modificado en origin/main…` por cada retirado que el bot regeneró, y `CONFLICTO (contenido): Conflicto de fusión en index.html`) y que el bloque resuelve: `marcas de origin/main: …` y `merge con los conflictos esperados resueltos: <commit>`; de vuelta del paso 8 con una fusión limpia, `marcas de origin/main: …` y `marcas de main en la fusión: <commit>`; al final, `index.html y sw.js llevan las marcas de origin/main: ?v=<la de main>`, `marcas de main: iguales` y `retirados en el árbol: 0`. Si sale `no se trae main` o `conflictos que se resuelven a mano`, se para aquí y se resuelve a mano antes de seguir. Si el recuento de retirados no es 0 (un retirado que `main` añadió sin conflicto, p. ej. un `data-players-<S>.js` de una temporada activada), `git rm` de esos ficheros y `git commit --amend --no-edit`. Sobre `33e4cff`, sin nada nuevo en `main` (como en la verificación):
```text
de 33e4cff466415f02fbc5f9ff2089738903af1382 a origin/main, index.html y sw.js solo cambian las marcas de versión
Ya está actualizado.
index.html y sw.js llevan las marcas de origin/main: ?v=20260925b
marcas de main: iguales
retirados en el árbol: 0
```

Con un `main` simulado en el que el bot había regenerado tres retirados y `data-benjamin.js` y subido sus marcas a `20260927` (el ensayo del ensamblado; después, pytest 511 y node 740 en verde):
```text
de 33e4cff466415f02fbc5f9ff2089738903af1382 a origin/main, index.html y sw.js solo cambian las marcas de versión
CONFLICTO (modificar / eliminar): data-matchdetail-keys.js eliminado en HEAD y modificado en origin/main. Versión origin/main de data-matchdetail-keys.js restante en el árbol.
CONFLICTO (modificar / eliminar): data-players-2025-2026.js eliminado en HEAD y modificado en origin/main. Versión origin/main de data-players-2025-2026.js restante en el árbol.
CONFLICTO (modificar / eliminar): data-stats.js eliminado en HEAD y modificado en origin/main. Versión origin/main de data-stats.js restante en el árbol.
Auto-fusionando index.html
CONFLICTO (contenido): Conflicto de fusión en index.html
Auto-fusionando sw.js
Fusión automática falló; arregle los conflictos y luego realice un commit con el resultado.
marcas de origin/main: ?v=20260927, Última actualización: 27/09/2026, CACHE_NAME futbolbase-v20260927
merge con los conflictos esperados resueltos: c38f759
index.html y sw.js llevan las marcas de origin/main: ?v=20260927
marcas de main: iguales
retirados en el árbol: 0
```

De vuelta del paso 8, con la rama en el commit de la versión (`20260926`) y un `main` que solo trajo un `data-health.json` del bot (el ensayo del ensamblado, como el de la revisión; después, el paso 3 da `20260926` otra vez: mayor que la vigente, y la de antes nunca llegó a `main`):
```text
de 33e4cff466415f02fbc5f9ff2089738903af1382 a origin/main, index.html y sw.js solo cambian las marcas de versión
Merge made by the 'ort' strategy.
 data-health.json | 3 ++-
 1 file changed, 2 insertions(+), 1 deletion(-)
marcas de origin/main: ?v=20260925b, Última actualización: 23/09/2026, CACHE_NAME futbolbase-v20260925b
marcas de main en la fusión: 930abcf
index.html y sw.js llevan las marcas de origin/main: ?v=20260925b
marcas de main: iguales
retirados en el árbol: 0
```

- [ ] **Step 3: Subir la versión** (§5.5; decisión 10)

Las 9 marcas `?v=` de `index.html` y `CACHE_NAME` de `sw.js`, a la vez y con la misma cadena, sin tocar «Última actualización», y `CODIGO`, con `scripts/publicar.py`: la versión es la fecha UTC, estrictamente mayor que la vigente (si no, la letra siguiente de la vigente; se para en la `z`):

```bash
cd /home/manolo/claude/futbol-base
python3 scripts/publicar.py
git diff --stat | tail -1
git diff --name-only
```
Esperado: `versión <la del día en UTC, o la vigente con la letra siguiente> (antes, <la vigente>): 9 ?v= en index.html y futbolbase-v<la misma> en sw.js; «Última actualización: <la de los datos>», sin tocar`; `CODIGO be0acbf3: la huella de acta.css y src/*.js, en index.html`; ` 2 files changed, 10 insertions(+), 10 deletions(-)`, e `index.html` y `sw.js`. El 26/09/2026 (UTC), sobre `33e4cff` sin datos nuevos:
```text
versión 20260926 (antes, 20260925b): 9 ?v= en index.html y futbolbase-v20260926 en sw.js; «Última actualización: 23/09/2026», sin tocar
CODIGO be0acbf3: la huella de acta.css y src/*.js, en index.html
 2 files changed, 10 insertions(+), 10 deletions(-)
index.html
sw.js
```

- [ ] **Step 4: Suites, smoke y el presupuesto en local, en verde con la versión nueva**

Las suites y los tres smoke tres veces, como tras la Tarea 6 (`pwa-smoke` publica sus propias versiones, `20991231a` y `20991231b`, sobre la del árbol, así que no depende de la del día); unos 4 minutos, con el `timeout` de la herramienta a 600000 ms. Después, con la máquina en reposo (sin smoke ni otras mediciones a la vez), el presupuesto en local con `--runs 5` (decisiones 18 y 48): un `PRESUPUESTO: MAL` se repite una vez y, si se repite, se para la publicación y se avisa al usuario con las cifras, sin empujar nada.

```bash
cd /home/manolo/claude/futbol-base
python3 -m pytest scripts/tests/ -q 2>&1 | tail -1 | sed -E 's/ in [0-9.]+s$//'
node --test scripts/tests/test_*.mjs 2>&1 | grep -E '^# (tests|pass|fail)'
for i in 1 2 3; do
  out=$({ node scripts/tests/render-smoke.mjs && node scripts/tests/interaction-smoke.mjs && node scripts/tests/pwa-smoke.mjs; } 2>&1)
  echo "pasada $i: $(grep -c '^PASS' <<<"$out") PASS; otras líneas: $(grep -vc '^PASS' <<<"$out")"
done
```
Esperado:
```text
511 passed, 5 skipped
# tests 740
# pass 740
# fail 0
pasada 1: 21 PASS; otras líneas: 0
pasada 2: 21 PASS; otras líneas: 0
pasada 3: 21 PASS; otras líneas: 0
```

El presupuesto, en otro bloque y con la máquina ya en reposo: algo menos de 1 minuto con `--runs 5`, que con la máquina cargada puede pasar de 2, así que con el `timeout` de la herramienta a 600000 ms:

```bash
cd /home/manolo/claude/futbol-base
node scripts/tests/presupuesto.mjs --runs 5; echo "salida: $?"
```
Esperado (los tiempos se mueven unas decenas de ms de una pasada a otra; los KB y el CLS, no), como en la Tarea 6:
```text
sitio: el árbol, con pages-server.mjs; el CLS, en local con el mundo A
portada: 2709 ms (< 3000); LCP 2780 ms (< 3000); FCP 608 ms; 307 KB; mediana de 5
CLS: 0,0001 (< 0,1): 390 px 0,0000 y 1440 px 0,0001; máximo de 5, mundo A
imágenes de Tabla: 48,0 KB (< 300): 15 imágenes, PG2
PRESUPUESTO: OK
salida: 0
```

- [ ] **Step 5: El commit de la publicación**

```bash
cd /home/manolo/claude/futbol-base
V=$(sed -n "1s/.*futbolbase-v\([0-9a-z]*\).*/\1/p" sw.js)
git add index.html sw.js
git commit -q -F - <<EOF
Publica B4 del rediseño «Acta»: versión $V

Sube a la vez las ?v= de index.html y CACHE_NAME de sw.js con
scripts/publicar.py (spec §5.5), sin tocar el literal «Última
actualización», para que los móviles con la app instalada cambien a la
nueva. CODIGO sigue en be0acbf3: B4 no toca src/ ni acta.css. Con el visto
bueno del usuario, B4 se publica: los datos que ya no leía nadie fuera, los
inmediatos con defer, el manifiesto y los iconos de la PWA, las miniaturas
de los escudos y el SW que solo borra sus propias cachés.

Verificado: pytest 511 (5 saltadas), node 740, los tres smoke tres veces
seguidas y el presupuesto de §5.4 en local, en verde; y el paso de B3 a B4,
ensayado en local con publicar-b4.mjs.

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01Sg56KK3oZgo8Ye7Snj6wG9
EOF
git show --stat --oneline HEAD | tail -1
```
Esperado: ` 2 files changed, 10 insertions(+), 10 deletions(-)` (las 9 líneas de `index.html` con su `?v=` y la primera de `sw.js`).

- [ ] **Step 6: `publicar-b4.mjs`, y el paso de B3 a B4 ensayado en local** (decisiones 44 y 45)

El guion abre cada apertura en un proceso nuevo de Chrome con el mismo perfil, como quien abre la app desde el icono y la cierra (en el mismo proceso, Chrome reutiliza módulos de la memoria y la comprobación no ve lo que ve la familia):
- `antes`: la versión publicada (B3) y su SW, en un perfil propio, y su versión en `$S/version-antes.txt`;
- `despues`: la 1.ª apertura, breve (se cierra en cuanto la pantalla está pintada); la 2.ª, que se cierra igual y, después, **sin ninguna página de la app abierta**, espera hasta que el SW nuevo manda, con una página de sonda (`manifest.json`, que el SW sirve de la red sin tocar su caché) que se abre, pide la actualización, mira y se cierra en cada vuelta (plan B3, «Lo que B3 deja avisado»; como `pwa-smoke` desde `7f31f15`); la 3.ª, con él; y la 4.ª, sin red, por un proxy cerrado. Cada una, una versión entera (B3 con su `?v=`, o B4 con la publicada, Explorar pintada, sin el aviso del arranque ni errores), y ninguna pide un retirado con la versión publicada ni se queda sin uno que pida su página; desde la 3.ª, B4 con el SW nuevo al mando y su caché;
- `capturas`: sin SW, la portada y Tabla de PG2 a 390 px (en claro, con DPR 2 y la ventana del alto de la página, para que la barra de pestañas quede abajo), con todos sus escudos cargados de `escudos/s/`, y sus capturas en `$S/publicado-b4/`.

Crear el guion:

```bash
cd /home/manolo/claude/futbol-base
: "${S:?falta S: la línea export S= de la cabecera}"
mkdir -p "$S"
cat > "$S/publicar-b4.mjs" <<'EOF'
// La publicación de B4 en la web (Plan B4, Tarea 7). Desde la raíz del repo:
//   node "$S/publicar-b4.mjs" antes     antes de empujar: la versión publicada (B3) y su SW, en un perfil propio;
//                                       su versión, en $S/version-antes.txt
//   node "$S/publicar-b4.mjs" despues   tras publicar, con ese perfil y un proceso de Chrome por apertura (la app se
//                                       abre desde el icono y se cierra): la 1.ª, breve (se cierra en cuanto pinta);
//                                       la 2.ª, igual, y después, sin ninguna página de la app abierta, hasta que el
//                                       SW nuevo manda; la 3.ª, con él; y la 4.ª, sin red. Cada una, una versión
//                                       entera (B3 o B4), y ninguna pide un dato retirado con la versión publicada
//   node "$S/publicar-b4.mjs" capturas  sin SW: la portada y Tabla de PG2 a 390 px, con todos sus escudos de
//                                       escudos/s/, y sus capturas en $S/publicado-b4/
// WEB cambia la dirección de la web (por defecto, la publicada): así se ensaya con una copia local (paso 6).
import { createRequire } from 'node:module';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { findChrome } from '/home/manolo/claude/futbol-base/scripts/tests/render-smoke.mjs';
import { waitForAsync } from '/home/manolo/claude/futbol-base/scripts/tests/browser-wait.mjs';

const { chromium } = createRequire(join(process.cwd(), 'package.json'))('playwright');
const BASE = process.env.WEB || 'https://malolocabreralolo-tech.github.io/futbol-base/';
const S = process.env.S;
const mode = process.argv[2];
if (!S || !['antes', 'despues', 'capturas'].includes(mode)) {
  console.error('Uso: [WEB=<url>] S=<directorio> node publicar-b4.mjs antes|despues|capturas');
  process.exit(2);
}
// La versión que sirve ahora la web: la de CACHE_NAME en su sw.js (sin la caché de la CDN de Pages).
const published = (await (await fetch(`${BASE}sw.js?nc=${Date.now()}`)).text()).match(/futbolbase-v([0-9a-z]+)/)[1];
const LAUNCH = { executablePath: findChrome(), headless: true, args: ['--no-sandbox'] };
const CONTEXT = { viewport: { width: 390, height: 844 }, locale: 'es-ES', timezoneId: 'Atlantic/Canary' };
const PROFILE = join(S, 'perfil-publicado');
const BEFORE = join(S, 'version-antes.txt');
// Los datos que B4 retiró (decisión 1): una página de B3 los nombra; una de B4, no.
const RETIRED = /\/data-(?:matchdetail-keys|stats|players-\d{4}-\d{4})\.js$/;
const NO_NETWORK = ['--proxy-server=http://127.0.0.1:9', '--proxy-bypass-list=<-loopback>'];

const painted = (page, label) => waitForAsync(page, () => !!document.querySelector('#contenido section[data-screen], #contenido [role="alert"]'),
  null, { timeout: 30000, label });
// Lo que se ve tras una apertura: la pantalla, el aviso del arranque, la ?v= de su index.html (la de data-seasons.js),
// si ese index.html es el de B4 (los datos con defer y el icono PNG), si está la caché de la versión publicada y si un
// SW manda en la página.
const look = (page) => page.evaluate(async (name) => {
  const seasons = document.querySelector('script[src*="data-seasons.js"]');
  return {
    screen: document.querySelector('#contenido section[data-screen]')?.getAttribute('data-screen') ?? null,
    alert: !!document.querySelector('#contenido [role="alert"]'),
    v: seasons?.getAttribute('src').match(/\?v=([0-9a-z]+)/)?.[1] ?? null,
    b4: !!seasons?.defer && document.querySelector('link[rel="icon"]')?.getAttribute('href') === './icons/icon-192.png',
    cache: (await caches.keys()).includes(name),
    controlled: !!navigator.serviceWorker.controller,
  };
}, `futbolbase-v${published}`);

// Las peticiones de datos retirados de un proceso, de sus páginas y de su SW (Playwright ve en Chromium las del SW):
// el fichero, su ?v=, si la hizo el SW, su estado y si la respondió el SW.
function watchRetired(context) {
  const seen = [];
  const note = (request, status, fromSW) => {
    const url = new URL(request.url());
    if (RETIRED.test(url.pathname)) {
      seen.push({ file: url.pathname.split('/').pop(), v: url.searchParams.get('v'), sw: !!request.serviceWorker(), status, fromSW });
    }
  };
  context.on('response', (response) => note(response.request(), response.status(), response.fromServiceWorker()));
  context.on('requestfailed', (request) => note(request, 0, false));
  return seen;
}

// Sin ninguna página de la app abierta, hasta que el SW nuevo manda: en cada vuelta, una página de sonda
// (manifest.json, que el SW sirve de la red sin tocar su caché) pide la actualización, mira y se cierra en seguida.
// Una página abierta cuando el SW nuevo queda instalado puede retrasar su activación mientras siga abierta (plan B3,
// «Lo que B3 deja avisado»); entre vuelta y vuelta no queda ninguna.
async function untilNewWorker(context, name) {
  const start = Date.now();
  let last = null;
  for (;;) {
    const probe = await context.newPage();
    try {
      await probe.goto(`${BASE}manifest.json`);
      last = await probe.evaluate(async (cacheName) => {
        const registration = await navigator.serviceWorker.getRegistration();
        try { await registration?.update(); } catch { /* ya se está instalando */ }
        return {
          cache: (await caches.keys()).includes(cacheName),
          installing: !!registration?.installing,
          waiting: !!registration?.waiting,
          active: registration?.active?.state ?? null,
          controlled: !!registration?.active && navigator.serviceWorker.controller === registration.active,
        };
      }, name);
    } catch (error) {
      last = { error: error.message.split('\n')[0] };
    } finally {
      await probe.close();
    }
    if (last.cache && !last.installing && !last.waiting && last.active === 'activated' && last.controlled) return;
    if (Date.now() - start > 120000) throw new Error(`el SW nuevo no manda tras 120 s: ${JSON.stringify(last)}`);
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
}

// Una apertura: un proceso de Chrome con el perfil, #/explorar desde el icono; se mira y se cierra la página en
// cuanto está pintada. `after` sigue con el proceso abierto y sin páginas de la app. offline: todo lo que pide el
// proceso, también su SW, va a un proxy cerrado y falla (la opción offline de Playwright no corta las del SW).
async function opening(label, { offline = false, after = null } = {}) {
  const context = await chromium.launchPersistentContext(PROFILE, { ...LAUNCH, ...CONTEXT, args: [...LAUNCH.args, ...(offline ? NO_NETWORK : [])] });
  const retired = watchRetired(context);
  const errors = [];
  try {
    const page = context.pages()[0] || await context.newPage();
    page.on('pageerror', (error) => errors.push(error.message));
    page.on('console', (message) => { if (message.type() === 'error' && message.text().startsWith('[arranque]')) errors.push(message.text().split('\n')[0]); });
    await page.goto(`${BASE}index.html#/explorar`);
    await painted(page, label);
    const seen = await look(page);
    await page.close();
    if (after) await after(context);
    return { seen, errors, retired };
  } finally {
    await context.close();
  }
}

if (mode === 'antes') {
  const context = await chromium.launchPersistentContext(PROFILE, { ...LAUNCH, ...CONTEXT });
  try {
    const page = context.pages()[0] || await context.newPage();
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.goto(`${BASE}index.html`);
    await painted(page, 'antes, primera apertura');
    await page.evaluate(async () => { await navigator.serviceWorker.ready; });
    await page.reload();
    await painted(page, 'antes, con el SW');
    await waitForAsync(page, (name) => caches.keys().then((keys) => keys.includes(name) && !!navigator.serviceWorker.controller),
      `futbolbase-v${published}`, { timeout: 60000, label: 'antes, el SW publicado al mando' });
    const seen = await look(page);
    writeFileSync(BEFORE, `${published}\n`);
    console.log(`antes: ${JSON.stringify(seen)}; errores: ${errors.length}`);
    process.exitCode = seen.screen === 'home' && !seen.alert && seen.v === published && seen.cache && seen.controlled && !errors.length ? 0 : 1;
  } finally {
    await context.close();
  }
} else if (mode === 'despues') {
  const before = readFileSync(BEFORE, 'utf8').trim();
  const only = `futbolbase-v${published}`;
  const openings = [
    ['1.ª, breve', {}],
    ['2.ª, y sin páginas de la app hasta que manda el SW nuevo', { after: (context) => untilNewWorker(context, only) }],
    ['3.ª, con el SW nuevo', {}],
    ['4.ª, sin red', { offline: true }],
  ];
  let bad = 0;
  const revalidations = [];
  for (const [n, [label, options]] of openings.entries()) {
    const { seen, errors, retired } = await opening(`después, ${label}`, options);
    // Una versión entera: el index.html de B3 con la ?v= de antes, o el de B4 con la publicada; Explorar pintada, sin
    // el aviso del arranque ni errores. Desde la 3.ª, B4 con el SW nuevo al mando y su caché.
    const whole = seen.screen === 'explorar' && !seen.alert && !errors.length
      && ((seen.b4 && seen.v === published) || (!seen.b4 && seen.v === before));
    const page = retired.filter((r) => !r.sw);
    const worker = retired.filter((r) => r.sw);
    // Ningún retirado con la versión publicada; y lo que pide una página (la de B3), de su SW y con 200.
    const clean = !retired.some((r) => r.v === published) && page.every((r) => r.fromSW && r.status === 200);
    const ok = whole && clean && (n < 2 || (seen.b4 && seen.controlled && seen.cache));
    if (!ok) bad += 1;
    revalidations.push(...worker);
    console.log(`apertura ${n + 1} (${label}): ${seen.b4 ? 'B4' : 'B3'} (?v=${seen.v}), ${seen.screen}${seen.alert ? ', con el aviso del arranque' : ''}; `
      + `SW al mando: ${seen.controlled ? 'sí' : 'no'}; caché de ${published}: ${seen.cache ? 'sí' : 'no'}; `
      + `retirados: ${page.length} de la página${page.length ? (page.every((r) => r.fromSW && r.status === 200) ? ', todos de su SW con 200' : ` ${JSON.stringify(page)}`) : ''}; `
      + `errores: ${errors.length ? errors.join(' | ') : 0}${ok ? '' : ' ← MAL'}`);
  }
  const versions = [...new Set(revalidations.map((r) => r.v))].join(', ') || '-';
  const statuses = [...new Set(revalidations.map((r) => r.status))].join(', ') || '-';
  console.log(`revalidaciones de retirados desde los SW: ${revalidations.length} (?v=: ${versions}; estado: ${statuses})`);
  console.log(bad ? `MAL: ${bad} aperturas a medias, con aviso, con errores o con un retirado tras publicar ${published}`
    : `OK: cada apertura, una versión entera y ningún retirado con la versión publicada; desde la 3.ª, B4 con ${only}, también sin red`);
  process.exitCode = bad ? 1 : 0;
} else {
  const OUT = join(S, 'publicado-b4');
  mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch(LAUNCH);
  const SHOTS = [['portada', '#/', 'home'], ['tabla-pg2', '#/tabla?s=2025-2026&g=PG2', 'tabla']];
  let bad = 0;
  try {
    for (const [name, hash, screen] of SHOTS) {
      const context = await browser.newContext({ ...CONTEXT, deviceScaleFactor: 2, colorScheme: 'light', serviceWorkers: 'block' });
      const page = await context.newPage();
      const errors = [];
      page.on('pageerror', (error) => errors.push(error.message));
      await page.goto(`${BASE}index.html${hash}`);
      await painted(page, `capturas, ${name}`);
      // Todas las imágenes de la pantalla cargadas (las diferidas se piden ya) y la fuente.
      await waitForAsync(page, () => {
        for (const img of document.querySelectorAll('img[loading="lazy"]')) img.loading = 'eager';
        return document.fonts.status === 'loaded' && [...document.querySelectorAll('#contenido img')].every((img) => img.complete);
      }, null, { timeout: 30000, label: `capturas, ${name}: los escudos` });
      const got = await page.evaluate(() => {
        const crests = [...document.querySelectorAll('#contenido img.crest')];
        return {
          screen: document.querySelector('#contenido section[data-screen]')?.getAttribute('data-screen') ?? null,
          h1: document.querySelectorAll('#contenido h1').length,
          overflow: document.documentElement.scrollWidth - innerWidth,
          escudos: crests.length,
          miniaturas: crests.filter((img) => img.naturalWidth > 0 && new URL(img.currentSrc).pathname.includes('/escudos/s/')).length,
        };
      });
      // La ventana, del alto de la página (como portada-390.mjs): la barra de pestañas, fija, queda abajo y no
      // en mitad de la captura. Y sin transiciones en marcha (la de la pestaña actual dura 150 ms).
      await page.setViewportSize({ width: 390, height: Math.max(844, await page.evaluate(() => document.documentElement.scrollHeight)) });
      await waitForAsync(page, () => [...document.querySelectorAll('#contenido img')].every((img) => img.complete)
        && document.getAnimations().every((animation) => animation.playState !== 'running'), null,
        { timeout: 30000, label: `capturas, ${name}: la ventana entera, quieta` });
      await page.screenshot({ path: join(OUT, `${name}-390.png`) });
      const ok = got.screen === screen && got.h1 === 1 && got.overflow <= 0 && got.escudos > 0 && got.miniaturas === got.escudos && !errors.length;
      if (!ok) bad += 1;
      console.log(`${name}: ${JSON.stringify(got)}${errors.length ? ` errores: ${errors.join(' | ')}` : ''}${ok ? '' : ' ← MAL'}`);
      await context.close();
    }
  } finally {
    await browser.close();
  }
  console.log(bad ? `MAL: ${bad} de las 2 pantallas, con errores o sin todos sus escudos de escudos/s/ (versión ${published})`
    : `OK: la portada y Tabla de PG2 con la versión ${published}, con todos sus escudos de escudos/s/; capturas en publicado-b4/`);
  process.exitCode = bad ? 1 : 0;
}
EOF
node --check "$S/publicar-b4.mjs" && echo "publicar-b4.mjs: sintaxis correcta"
```
Esperado:
```text
publicar-b4.mjs: sintaxis correcta
```

El ensayo, antes de tocar la rama remota: `pages-server.mjs` sirve lo publicado (`origin/main`, B3) bajo `/futbol-base/`; `antes` crea un perfil con B3 y su SW; el árbol pasa a `HEAD` (B4 con su versión) con el servidor en marcha, porque el servidor lee cada fichero en cada petición, y `despues` y `capturas` lo recorren. Todo en `$S/ensayo`, con su propio perfil (el de la web es otro). Tarda unos 20 s, más con la máquina cargada: con el `timeout` de la herramienta a 600000 ms.

```bash
cd /home/manolo/claude/futbol-base
: "${S:?falta S: la línea export S= de la cabecera}"
rm -rf "$S/ensayo" && mkdir -p "$S/ensayo/b3" "$S/ensayo/b4"
git archive origin/main | tar -x -C "$S/ensayo/b3"
git archive HEAD | tar -x -C "$S/ensayo/b4"
ln -sfn b3 "$S/ensayo/web"
node --input-type=module -e "
import { startPagesServer } from './scripts/tests/pages-server.mjs';
const web = await startPagesServer(process.argv[1]);
console.log(web.url);
" "$S/ensayo/web" > "$S/ensayo/url" &
SERVIDOR=$!
trap 'kill $SERVIDOR' EXIT
until [ -s "$S/ensayo/url" ]; do sleep 0.2; done
LOCAL="$(cat "$S/ensayo/url")futbol-base/"
WEB="$LOCAL" S="$S/ensayo" node "$S/publicar-b4.mjs" antes; echo "antes: sale con $?"
ln -sfn b4 "$S/ensayo/web"
WEB="$LOCAL" S="$S/ensayo" node "$S/publicar-b4.mjs" despues; echo "despues: sale con $?"
WEB="$LOCAL" S="$S/ensayo" node "$S/publicar-b4.mjs" capturas; echo "capturas: sale con $?"
```
Esperado: `antes` sobre B3; con el árbol de B4, las cuatro aperturas enteras, ninguna con `← MAL`; y las dos capturas, con todos sus escudos de `escudos/s/`. La 1.ª apertura es B3 (sus dos retirados, de su SW con 200) y la 2.ª, B3 o B4 (en la verificación, B4 con el SW de B3, que ya había revalidado `index.html` en la 1.ª); con ellas cambian la caché de la publicada de esas dos líneas (según haya empezado a instalarse el SW nuevo) y el número de revalidaciones; la versión es la del día (paso 3). En la verificación, el 26/09/2026:
```text
antes: {"screen":"home","alert":false,"v":"20260925b","b4":false,"cache":true,"controlled":true}; errores: 0
antes: sale con 0
apertura 1 (1.ª, breve): B3 (?v=20260925b), explorar; SW al mando: sí; caché de 20260926: no; retirados: 2 de la página, todos de su SW con 200; errores: 0
apertura 2 (2.ª, y sin páginas de la app hasta que manda el SW nuevo): B4 (?v=20260926), explorar; SW al mando: sí; caché de 20260926: no; retirados: 0 de la página; errores: 0
apertura 3 (3.ª, con el SW nuevo): B4 (?v=20260926), explorar; SW al mando: sí; caché de 20260926: sí; retirados: 0 de la página; errores: 0
apertura 4 (4.ª, sin red): B4 (?v=20260926), explorar; SW al mando: sí; caché de 20260926: sí; retirados: 0 de la página; errores: 0
revalidaciones de retirados desde los SW: 2 (?v=: 20260925b; estado: 404)
OK: cada apertura, una versión entera y ningún retirado con la versión publicada; desde la 3.ª, B4 con futbolbase-v20260926, también sin red
despues: sale con 0
portada: {"screen":"home","h1":1,"overflow":0,"escudos":6,"miniaturas":6}
tabla-pg2: {"screen":"tabla","h1":1,"overflow":0,"escudos":25,"miniaturas":25}
OK: la portada y Tabla de PG2 con la versión 20260926, con todos sus escudos de escudos/s/; capturas en publicado-b4/
capturas: sale con 0
```
Un `← MAL` o un `sale con 1` para la publicación antes de empujar nada: se mira la línea que falla y se avisa al usuario.

Abrir con Read `$S/ensayo/publicado-b4/portada-390.png` y `$S/ensayo/publicado-b4/tabla-pg2-390.png`: la portada y Tabla de B4 con los datos del árbol, con sus escudos, su fuente y la barra.

- [ ] **Step 7: La versión publicada (B3), en un perfil de Chrome, antes de empujar**

Así se comprueba después el paso real de B3 a B4 con el SW de B3, el de los móviles que ya la tienen:

```bash
cd /home/manolo/claude/futbol-base
: "${S:?falta S: la línea export S= de la cabecera}"
rm -rf "$S/perfil-publicado" "$S/version-antes.txt" "$S/publicado-b4"
WEB=https://malolocabreralolo-tech.github.io/futbol-base/ S="$S" node "$S/publicar-b4.mjs" antes; echo "antes: sale con $?"
```
Esperado: `antes: {"screen":"home","alert":false,"v":"<la versión publicada>","b4":false,"cache":true,"controlled":true}; errores: 0` y `antes: sale con 0`.

- [ ] **Step 8: Empujar la rama y esperar a su CI; después, `main`** (§12)

Primero `rediseno-acta`, sin ningún workflow en marcha, y después `Tests` sobre esa rama, lanzado a mano. El bloque espera al CI (de 5 a 15 minutos): se lanza en segundo plano (`run_in_background`) o con Monitor, nunca en primer plano, donde la herramienta lo cortaría a los 10 minutos (`timeout 1800` lo para a los 30) (el PR borrador #2 quedó cerrado como fusionado al publicar B2, y un PR cerrado no corre sus checks con los push nuevos; `tests.yml` admite `workflow_dispatch`). `main` solo avanza cuando esa ejecución está en verde: Pages despliega `main` aunque `Tests` salga en rojo después. Cada push comprueba antes que no haya ningún workflow en marcha y, si lo hay, no empuja (decisión 47):

```bash
cd /home/manolo/claude/futbol-base
if [ "$(gh run list --limit 10 --json status --jq '[.[] | select(.status != "completed")] | length')" != 0 ]; then
  gh run list --limit 5
  echo "hay un workflow en marcha: no se empuja; se espera (Monitor, until sobre gh run list) y se repite este paso"
else
  git push origin rediseno-acta
  gh workflow run tests.yml --ref rediseno-acta
  HEAD_SHA=$(git rev-parse HEAD)
  until RUN=$(gh run list --workflow=tests.yml --branch rediseno-acta --event workflow_dispatch --limit 5 --json databaseId,headSha --jq ".[] | select(.headSha == \"$HEAD_SHA\") | .databaseId" | head -1) && [ -n "$RUN" ]; do sleep 5; done
  timeout 1800 gh run watch "$RUN" --exit-status --interval 30 && echo "CI de la rama en verde: $RUN"
  echo "avisos de Node 20 en $RUN: $(gh run view "$RUN" | grep -c 'Node.js 20')"
fi
```
Esperado: el push, `gh run watch` con los tres trabajos de `Tests` (pytest, node-tests y render-smoke) en ✓, `CI de la rama en verde: <id>` y `avisos de Node 20 en <id>: 0` (decisiones 12 y 49; el de Ubuntu 26 puede seguir). Si algún trabajo falla, `gh run watch` sale con 1: se para, sin empujar `main`, y se enseña al usuario (`gh run view "$RUN" --log-failed`).

Después, `main` con avance rápido, otra vez sin ningún workflow en marcha (el bot puede estar comiteando datos). Si `main` avanzó mientras tanto, el push se rechaza: se vuelve al paso 2.

```bash
cd /home/manolo/claude/futbol-base
if [ "$(gh run list --limit 10 --json status --jq '[.[] | select(.status != "completed")] | length')" != 0 ]; then
  gh run list --limit 5
  echo "hay un workflow en marcha: no se empuja main; se espera y se repite"
else
  git push origin rediseno-acta:main
fi
```

Los workflows del push a `main` (`Tests` y `pages build and deployment`) tienen que terminar en verde; también en segundo plano o con Monitor:

```bash
cd /home/manolo/claude/futbol-base
HEAD_SHA=$(git rev-parse HEAD)
until TESTS=$(gh run list --workflow=tests.yml --branch main --event push --limit 5 --json databaseId,headSha --jq ".[] | select(.headSha == \"$HEAD_SHA\") | .databaseId" | head -1) && [ -n "$TESTS" ]; do sleep 5; done
timeout 1800 gh run watch "$TESTS" --exit-status --interval 30 && echo "Tests de main en verde: $TESTS"
gh run list --limit 4
```
Esperado: `Tests de main en verde: <id>` y, en la lista, `pages build and deployment` en `completed success`. Si `Tests` sale en rojo: `gh run view "$TESTS" --log-failed`, y se para y se avisa al usuario, sin empujar arreglos a ciegas.

- [ ] **Step 9: Comprobar la web publicada**

Primero, que sirve la versión nueva (la CDN de Pages puede tardar unos minutos: el `until` espera, y conviene lanzarlo con Monitor), las 9 `?v=`, `CODIGO`, el manifiesto nuevo, los iconos y una muestra de miniaturas (una de un JPEG), y los dos retirados inmediatos, que ya no están:

```bash
cd /home/manolo/claude/futbol-base
V=$(sed -n "1s/.*futbolbase-v\([0-9a-z]*\).*/\1/p" sw.js)
SITIO=https://malolocabreralolo-tech.github.io/futbol-base
until curl -s "$SITIO/sw.js?nc=$(date +%s)" | grep -q "futbolbase-v$V"; do sleep 15; done
curl -s "$SITIO/index.html?nc=$(date +%s)" | grep -c "?v=$V"
curl -s "$SITIO/index.html?nc=$(date +%s)" | grep -oE "const CODIGO = '[0-9a-f]{8}';"
curl -s "$SITIO/manifest.json?nc=$(date +%s)" | python3 -c "
import json, sys
m = json.load(sys.stdin)
print(m['id'], m['start_url'], *(f\"{i['src']} {i['sizes']} {i['purpose']}\" for i in m['icons']), sep=' | ')"
for f in icons/icon-180.png icons/icon-192.png icons/icon-512.png icons/icon-maskable-512.png escudos/s/lasMesasEscudo.png escudos/s/huracan.png escudos/s/joveroLasRosas.png data-stats.js data-matchdetail-keys.js; do
  echo "$(curl -s -o /dev/null -w '%{http_code}' "$SITIO/$f?nc=$(date +%s)") $f"
done
```
Esperado:
```text
9
const CODIGO = 'be0acbf3';
/futbol-base/index.html | ./index.html#/ | ./icons/icon-192.png 192x192 any | ./icons/icon-512.png 512x512 any | ./icons/icon-maskable-512.png 512x512 maskable
200 icons/icon-180.png
200 icons/icon-192.png
200 icons/icon-512.png
200 icons/icon-maskable-512.png
200 escudos/s/lasMesasEscudo.png
200 escudos/s/huracan.png
200 escudos/s/joveroLasRosas.png
404 data-stats.js
404 data-matchdetail-keys.js
```

Después, el presupuesto contra la web, con la máquina en reposo (sin smoke ni otras mediciones a la vez; decisión 18) y con el `timeout` de la herramienta a 600000 ms:

```bash
cd /home/manolo/claude/futbol-base
node scripts/tests/presupuesto.mjs --web https://malolocabreralolo-tech.github.io/futbol-base/ --runs 5; echo "salida: $?"
```
Esperado: `sitio: https://malolocabreralolo-tech.github.io/futbol-base/; el CLS, en local con el mundo A`; la portada y el LCP por debajo de 3.000 ms (con la red real, del orden de los 2,7-2,8 s del punto de partida); el CLS como en local; `imágenes de Tabla: 48,… KB (< 300): 15 imágenes, PG2` (antes de B4, 263,1 KB en 30); `PRESUPUESTO: OK` y `salida: 0`. Un `PRESUPUESTO: MAL` se repite una vez; si se repite, se para y se avisa al usuario con las cifras (B4 ya está publicada: se decide con él si se arregla hacia delante).

Después, el paso de B3 a B4 con el perfil del paso 7, y las capturas:

```bash
cd /home/manolo/claude/futbol-base
: "${S:?falta S: la línea export S= de la cabecera}"
WEB=https://malolocabreralolo-tech.github.io/futbol-base/ S="$S" node "$S/publicar-b4.mjs" despues; echo "despues: sale con $?"
WEB=https://malolocabreralolo-tech.github.io/futbol-base/ S="$S" node "$S/publicar-b4.mjs" capturas; echo "capturas: sale con $?"
```
Esperado, como en el ensayo del paso 6:
- `despues`: cuatro líneas `apertura N (…)`, ninguna con `← MAL`. La 1.ª puede ser aún B3 (`B3 (?v=<la de antes>)`, con `retirados: 2 de la página, todos de su SW con 200`); la 2.ª, B3 o B4; la 3.ª y la 4.ª (sin red), `B4 (?v=<V>), explorar; SW al mando: sí; caché de <V>: sí; retirados: 0 de la página; errores: 0`. Después, `revalidaciones de retirados desde los SW: <n> (?v=: <la de antes>; estado: 404)` (o `0 (?v=: -; estado: -)`), y al final `OK: cada apertura, una versión entera y ningún retirado con la versión publicada; desde la 3.ª, B4 con futbolbase-v<V>, también sin red` y `despues: sale con 0`. Un `← MAL` (el aviso del arranque, un error, una apertura que no es ni B3 ni B4 entera, o un retirado con `?v=<V>`) es un fallo: el guion sale con 1, y se para y se avisa al usuario.
- `capturas`: `portada: {"screen":"home","h1":1,"overflow":0,"escudos":<n>,"miniaturas":<n>}`, `tabla-pg2: {"screen":"tabla","h1":1,"overflow":0,"escudos":<m>,"miniaturas":<m>}` (con los datos del día), `OK: la portada y Tabla de PG2 con la versión <V>, con todos sus escudos de escudos/s/; capturas en publicado-b4/` y `capturas: sale con 0`.

Abrir con Read `$S/publicado-b4/portada-390.png` y `$S/publicado-b4/tabla-pg2-390.png` (con los datos vivos del día) y enviárselas al usuario como PNG, con el aviso para la familia (decisión 57): «si el móvil pregunta si actualizar el icono y el nombre de la app, acepta».

- [ ] **Step 10: El bot, una vez, con B4 publicada** (decisión 55)

Con la web comprobada y sin ningún workflow en marcha, `update.yml` se lanza a mano en `main` y se espera hasta su final: el bot de verdad, con el generador de B4, sus acciones en Node 24 y la imagen fijada, genera los datos, pasa sus suites y empuja si hay algo que publicar (los datos nuevos o, cuando toca, `data-health.json`). Durante esa ejecución, nada de push. Se lanza en segundo plano o con Monitor (de 5 a 15 minutos):

```bash
cd /home/manolo/claude/futbol-base
if [ "$(gh run list --limit 10 --json status --jq '[.[] | select(.status != "completed")] | length')" != 0 ]; then
  gh run list --limit 5
  echo "hay un workflow en marcha: no se lanza el bot; se espera (Monitor, until sobre gh run list) y se repite este paso"
else
  DESDE=$(date -u +%Y-%m-%dT%H:%M:%SZ)
  gh workflow run update.yml
  until BOT=$(gh run list --workflow=update.yml --event workflow_dispatch --limit 5 --json databaseId,createdAt --jq "[.[] | select(.createdAt >= \"$DESDE\")][0].databaseId // empty") && [ -n "$BOT" ]; do sleep 5; done
  timeout 1800 gh run watch "$BOT" --exit-status --interval 30 && echo "el bot, en verde con B4: $BOT"
  gh run view "$BOT" --json jobs --jq '.jobs[].steps[] | "\(.name): \(.conclusion)"'
  git fetch -q origin && git log --oneline -2 origin/main
fi
```
Esperado: `el bot, en verde con B4: <id>`, con `Tests Python (bloquean el commit si fallan): success`, `Tests Node (bloquean el commit si fallan): success` y `Commit y push si hay cambios: success` (y `Publicar diagnóstico si la fuente falla: skipped`); en `origin/main`, un commit `Actualización automática <fecha> UTC` si había algo que publicar, o el de la publicación de B4 si no. Si el bot sale en rojo, se para y se avisa al usuario con `gh run view "$BOT" --log-failed` (si falló la fuente, lo dice el paso «Actualizar datos desde futbolaspalmas.com», y no es de B4). Mientras no esté en verde, nada de push.

---

## Para B5 y siguientes

Lo que B4 deja fuera a propósito, lo que sus tareas dejan para B5 y lo de «Para B4 y siguientes» del plan B3 que sigue abierto. Lo que allí no cambia no se repite: basta remitir a su sección.

**Antes de activar 2026/27:** `scripts/tests/test_season_preparation.py` (`test_activation_generates_new_season_and_retains_every_old_sporting_row` y `test_apply_recalculates_codigo_for_the_new_config`) copian el árbol vivo (`src/config.js` y los `data-*.js`) y activan 2026-2027 encima. El día que esa temporada se active de verdad, el árbol vivo ya estará activado y esas dos pruebas fallan: el bot deja de publicar hasta arreglarlas. Arreglo: que copien un árbol sintético, o que fijen la temporada de partida de la copia en vez de leerla del árbol vivo.

### Lo que B4 deja fuera a propósito

- Los torneos perezosos (decisión 2), con su medición: el `pending` del router y los `needs` que describe el plan B3 («Torneos perezosos»).
- Un `modulepreload` que respete la limpieza por `CODIGO` (decisión 6), si una medición lo justifica (hoy, 180 ms en la primera visita).
- Las acciones de los `fetch-fiflp*.yml` y de los demás workflows en Node 24 (en B4, solo su imagen: decisión 55); y cambiar la imagen fijada (`ubuntu-24.04`) cuando se pruebe la siguiente.
- Todo lo que toca `src/` (abajo, del plan B3).

### Lo que dejan las tareas de B4

- El registro del SW tras la primera portada, desde `app.js`, si una medición lo pide (decisión 15: hoy, en `load`).
- `SIZE = 138` para los escudos de 46 px con DPR 3 (las cabeceras de la portada, la ficha y Partido), midiendo los bytes y la hoja de contacto (decisión 17).
- Cómo pinta Safari los 25 escudos con un cHRM suelto (sin gAMA) frente a su miniatura, que no lo lleva (decisión 17).
- `presupuesto.mjs` en el CI, como trabajo informativo que no bloquee, con la mediana de 5.
- La primera publicación de código después de B4: B4 no cambia `CODIGO`, así que el caso de un despliegue de código sin módulos nuevos, cuya limpieza podría saltarse sin red (plan B3, «Antes de publicar B3», Minor 9), sigue sin ejercerse.
- Sin conexión, tras cada cambio de SW los escudos desaparecen (B4 de la revisión, aparcado en la decisión 57; ya pasaba en B3): `activate` borra la caché anterior, la única con los escudos (se guardan según se usan), y la primera apertura sin red tras cada subida de versión pinta monogramas; en temporada, tras cada jornada, y la familia abre la app en campos sin cobertura. Trasladar las entradas de `/escudos/` en `activate` exige versionar las URL de las miniaturas (que un escudo cambiado no se quede para siempre en la caché), y eso toca `crest()` de `src/ui.js`; la otra salida, precachear las 176 miniaturas (586 KB), se aparta de §5.5. Punto de partida: la prueba de la revisión, `$S/rev/sim/actualizacion.mjs`.
- La plantilla sin conexión: precachear `data-lineups-<temporada del portal>.js` (unos 139 KB), o decir «sin conexión» en su bloque.
- Mirar si el SW del otro proyecto del origen borra las cachés `futbolbase-v*` (lo contrario de la decisión 8).
- Un precache a medias seguido de `activate` puede dejar huecos sin red (previo a B4).
- `fetch_mygol.py` sube `?v=\d{8}` sin la letra (guion antiguo, a mano).
- `trim_shields.py` guarda PNG con nombre `.jpg` (previo).

### Del plan B3, «Para B4 y siguientes», lo que sigue abierto

- **«B4: datos, escudos y despliegue»**: B4 cierra `defer`, la baja de `data-matchdetail-keys.js` y de `data-stats.js`, el arranque asíncrono, las miniaturas, la PWA (el `preload`, descartado: decisión 6), el filtro del CI, los datos congelados de `pwa-smoke` y las versiones (`publicar.py`, y `docs/rediseno-rebase.md` al día). Siguen como allí se dicen: los torneos perezosos, la limpieza del arranque (se queda), `CODIGO` en cada commit que toque código (en cada publicación ya lo sube `publicar.py`), la plantilla sin conexión, memorizar por grupo, `countMatches` y las tres de copa sin uso de `state.js`, la caja de error de Datos y fuentes, la ficha de Equipo que espera a las actas, los ayudantes repetidos, `routeIsMine`, «Reintentar» de un bloque y lo aparcado del triaje.
- **«Antes de publicar B3»**: lo que el arreglo no cubre (la caché HTTP de 600 s sin SW, que cierra versionar el grafo de módulos, y la recarga en el mismo proceso) y la regla de volver atrás hacia delante, sin cambios.
- **«B5 y después»**: todo sigue abierto, sin cambios.
- **«Lo que B3 deja avisado»**: el `activate` que borraba las cachés de otros proyectos del origen queda resuelto (decisión 8); «Borrar datos» (`clearStore`) sigue borrando `season`, `cat` y `theme` del `localStorage` compartido, y lo demás sigue igual (B4 respeta lo de la activación con una página abierta: decisión 44).
